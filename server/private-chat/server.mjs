import http from 'node:http';
import fs from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';

const port = Number(process.env.OJE_CHAT_PORT || 8096);
const key = process.env.OJE_CHAT_PROXY_KEY || (process.env.OJE_CHAT_KEY_FILE ? (await fs.readFile(process.env.OJE_CHAT_KEY_FILE, 'utf8')).trim() : '');
const credentialPath = process.env.OJE_CHAT_CREDENTIALS || '/var/lib/oje-private-chat/credentials.json';
const maxBody = 256 * 1024;
let refreshPromise;

if (!key || key.length < 32) throw new Error('OJE_CHAT_PROXY_KEY is required');

function reply(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

function authorized(req) {
  const given = req.headers['x-oje-chat-key'];
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readCredentials() {
  try {
    const raw = await fs.readFile(credentialPath, 'utf8');
    const c = JSON.parse(raw);
    if (!c.client_id || !c.access_token || !c.refresh_token || !Array.isArray(c.scopes) || !c.scopes.includes('chatgpt.tokens.use.direct')) return null;
    return c;
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function refresh(c) {
  const data = new URLSearchParams({ grant_type: 'refresh_token', client_id: c.client_id, refresh_token: c.refresh_token, resource: 'https://api.openai.com/v1' });
  const response = await fetch('https://auth.openai.com/api/accounts/oauth/token', { method: 'POST', body: data, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`);
  const next = await response.json();
  if (!next.access_token || !next.refresh_token) throw new Error('Incomplete token refresh');
  const updated = { ...c, 'access_token': next.access_token, 'refresh_token': next.refresh_token, expires_in: next.expires_in, scopes: typeof next.scope === 'string' ? next.scope.split(' ') : c.scopes, saved_at: new Date().toISOString() };
  if (!updated.scopes.includes('chatgpt.tokens.use.direct')) throw new Error('ChatGPT plan permission no longer granted');
  const temp = `${credentialPath}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(updated), { mode: 0o600, flag: 'wx' });
    await fs.rename(temp, credentialPath);
  } finally {
    await fs.rm(temp, { force: true });
  }
  return updated;
}

async function usableCredentials() {
  const c = await readCredentials();
  if (!c) return null;
  const expiry = Date.parse(c.saved_at) + Number(c.expires_in) * 1000;
  if (Number.isFinite(expiry) && Date.now() < expiry - 120000) return c;
  refreshPromise ||= refresh(c).finally(() => { refreshPromise = undefined; });
  return refreshPromise;
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBody) throw new Error('too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function validMessages(messages) {
  return Array.isArray(messages) && messages.length > 0 && messages.length <= 40 && messages.every(m =>
    m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0 && m.content.length <= 100000
  ) && messages.at(-1).role === 'user';
}

async function models(token) {
  const response = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Model request failed: ${response.status}`);
  const body = await response.json();
  return (body.models || []).filter(m => m.visibility === 'list' && typeof m.slug === 'string').map(m => ({ slug: m.slug, name: m.display_name || m.slug }));
}

async function chat(token, model, messages) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: messages, store: false, stream: true }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Inference failed: ${response.status}`);
  let text = '';
  let completed = false;
  let failed = false;
  let pending = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });
    if (pending.length > 2_000_000) throw new Error('Response too large');
    const events = pending.split(/\r?\n\r?\n/);
    pending = events.pop() || '';
    for (const event of events) {
      const line = event.split('\n').find(s => s.startsWith('data: '));
      if (!line) continue;
      let data;
      try { data = JSON.parse(line.slice(6)); } catch { continue; }
      if (data.type === 'response.output_text.delta') text += data.delta || '';
      if (data.type === 'response.completed') completed = true;
      if (data.type === 'response.failed' || data.type === 'response.incomplete') failed = true;
      if (text.length > 500000) throw new Error('Response too large');
    }
  }
  if (!completed || failed) throw new Error('Inference did not complete');
  return text;
}

http.createServer(async (req, res) => {
  if (!authorized(req)) return reply(res, 401, { error: 'Unauthorized' });
  if (req.url !== '/api/private-chat') return reply(res, 404, { error: 'Not found' });
  try {
    const c = await usableCredentials();
    if (!c) return reply(res, 503, { error: 'ChatGPT-Konto noch nicht verbunden', connected: false });
    if (req.method === 'GET') return reply(res, 200, { connected: true, models: await models(c.access_token) });
    if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reply(res, 415, { error: 'JSON required' });
    const body = await readBody(req);
    if (!validMessages(body.messages) || typeof body.model !== 'string' || body.model.length > 100) return reply(res, 400, { error: 'Ungueltige Anfrage' });
    const available = await models(c.access_token);
    if (!available.some(m => m.slug === body.model)) return reply(res, 400, { error: 'Modell nicht verfuegbar' });
    return reply(res, 200, { text: await chat(c.access_token, body.model, body.messages) });
  } catch (e) {
    if (e.message === 'too_large') return reply(res, 413, { error: 'Nachricht zu gross' });
    console.error('Private chat request failed:', e.message);
    return reply(res, 502, { error: 'Anfrage fehlgeschlagen. Bitte spaeter erneut versuchen.' });
  }
}).listen(port, '127.0.0.1');
