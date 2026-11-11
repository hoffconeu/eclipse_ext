#!/usr/bin/env node
// Local, one-user Sign in with ChatGPT helper. Never paste its credential file into a chat.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AUTH_ORIGIN = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const AGENT_NAME = 'OJE Private Chat';

export function verifyIdentityToken(jwt, jwks, clientId, nonce, previousSubject) {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Ungueltiges ID-Token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Unerwartete ID-Token-Signatur');
  const jwk = jwks.keys?.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256'));
  if (!jwk || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) {
    throw new Error('ID-Token-Signatur ungueltig');
  }
  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== AUTH_ORIGIN || !audience.includes(clientId) || (audience.length > 1 && claims.azp !== clientId) || !Number.isInteger(claims.exp) || claims.exp <= now || !Number.isInteger(claims.iat) || claims.iat > now + 300 || claims.nonce !== nonce || typeof claims.sub !== 'string' || !claims.sub) {
    throw new Error('ID-Token-Identitaet ungueltig');
  }
  if (previousSubject && claims.sub !== previousSubject) throw new Error('Anderes ChatGPT-Konto ausgewaehlt');
  return claims;
}

function storagePath() {
  const root = process.platform === 'win32' ? process.env.LOCALAPPDATA : path.join(os.homedir(), '.config');
  if (!root) throw new Error('Kein privates Benutzerverzeichnis gefunden');
  return path.join(root, 'oje-private-chat');
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function saveJson(file, value) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }); }
}

function openBrowser(url) {
  let command;
  let args;
  let env = process.env;
  if (process.platform === 'win32') {
    command = 'powershell.exe';
    args = ['-NoProfile', '-Command', 'Start-Process -FilePath $env:OJE_AUTH_URL'];
    env = { ...process.env, OJE_AUTH_URL: url };
  } else if (process.platform === 'darwin') { command = 'open'; args = [url]; }
  else { command = 'xdg-open'; args = [url]; }
  const child = spawn(command, args, { env, stdio: 'ignore' });
  child.on('error', () => console.error('Browser konnte nicht automatisch geoeffnet werden. Bitte die Anmelde-URL selbst oeffnen.'));
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Node.js 20+ auf dem privaten Rechner: node siwc-login.mjs');
    console.log('Dieser Helfer oeffnet den Browser lokal und speichert die verifizierte Verbindung nur in deinem Benutzerprofil.');
    return;
  }
  const directory = storagePath();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const hostFile = path.join(directory, 'host.json');
  const credentialFile = path.join(directory, 'credentials.json');
  const registrationFile = path.join(directory, 'registration.json');
  let host = await readJson(hostFile);
  if (!host) {
    host = { ext_agent_host_id: `urn:uuid:${randomUUID()}` };
    await saveJson(hostFile, host);
  }
  const previous = await readJson(credentialFile);
  const registration = await readJson(registrationFile);
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(64).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  let timer;
  const callback = new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url || '/', `http://127.0.0.1:${server.address().port}`);
      if (url.pathname !== '/auth/callback' || request.method !== 'GET') { response.writeHead(404); response.end(); return; }
      if (url.searchParams.get('state') !== state) { response.writeHead(400); response.end('Ungueltiger Anmeldeversuch.'); return; }
      clearTimeout(timer);
      server.close();
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      response.end('Rueckmeldung empfangen. Bitte das Ergebnis im Terminal pruefen.');
      if (url.searchParams.get('error')) reject(new Error('ChatGPT-Anmeldung wurde abgelehnt oder abgebrochen'));
      else resolve({ code: url.searchParams.get('code'), issuedClientId: url.searchParams.get('client_id') });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const redirect = `http://127.0.0.1:${server.address().port}/auth/callback`;
      const auth = new URL(`${AUTH_ORIGIN}/api/accounts/authorize`);
      const clientId = previous?.client_id || registration?.client_id || 'dynamic_agent_client';
      for (const [name, value] of Object.entries({ client_id: clientId, ext_agent_host_id: host.ext_agent_host_id, response_type: 'code', redirect_uri: redirect, scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource: RESOURCE, state, nonce, code_challenge_method: 'S256', code_challenge: challenge })) auth.searchParams.set(name, value);
      if (clientId === 'dynamic_agent_client') auth.searchParams.set('agent_name_hint', AGENT_NAME);
      console.log('Browser-Anmeldung wird geoeffnet. Falls nichts passiert, diese URL auf demselben Rechner oeffnen:');
      console.log(auth.toString());
      openBrowser(auth.toString());
      timer = setTimeout(() => { server.close(); reject(new Error('Anmeldung nach 5 Minuten abgelaufen')); }, 5 * 60 * 1000);
      callback.redirect = redirect;
    });
  });
  const result = await callback;
  if (!result.code) throw new Error('Kein Autorisierungscode empfangen');
  const clientId = previous?.client_id || registration?.client_id || result.issuedClientId;
  if (!clientId || clientId === 'dynamic_agent_client' || ((previous || registration) && result.issuedClientId && result.issuedClientId !== clientId)) throw new Error('Ungueltige Client-Registrierung');
  if (!previous && !registration) await saveJson(registrationFile, { client_id: clientId });
  const tokenResponse = await fetch(`${AUTH_ORIGIN}/api/accounts/oauth/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code: result.code, code_verifier: verifier, redirect_uri: callback.redirect, resource: RESOURCE }),
    signal: AbortSignal.timeout(20000),
  });
  if (!tokenResponse.ok) throw new Error(`Token-Austausch fehlgeschlagen (${tokenResponse.status})`);
  const tokens = await tokenResponse.json();
  if (typeof tokens.id_token !== 'string' || typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string') throw new Error('Anmeldung lieferte keine vollstaendigen Credentials');
  const discoveryResponse = await fetch(`${AUTH_ORIGIN}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000) });
  if (!discoveryResponse.ok) throw new Error('OIDC-Konfiguration nicht erreichbar');
  const discovery = await discoveryResponse.json();
  if (discovery.issuer !== AUTH_ORIGIN || discovery.jwks_uri !== `${AUTH_ORIGIN}/.well-known/jwks.json`) throw new Error('Unerwartete OIDC-Konfiguration');
  const jwksResponse = await fetch(discovery.jwks_uri, { signal: AbortSignal.timeout(10000) });
  if (!jwksResponse.ok) throw new Error('OpenAI-Signaturschluessel nicht erreichbar');
  const claims = verifyIdentityToken(tokens.id_token, await jwksResponse.json(), clientId, nonce, previous?.subject);
  const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : [];
  if (!scopes.includes('chatgpt.tokens.use.direct')) throw new Error('ChatGPT-Plan-Nutzung wurde nicht freigegeben');
  const record = {
    email: typeof claims.email === 'string' ? claims.email : undefined,
    issuer: claims.iss,
    subject: claims.sub,
    nonce,
    client_id: clientId,
    ext_agent_host_id: host.ext_agent_host_id,
    id_token: tokens.id_token,
    'access_token': tokens.access_token,
    'refresh_token': tokens.refresh_token,
    token_type: tokens.token_type || 'Bearer',
    expires_in: tokens.expires_in,
    scopes,
    saved_at: new Date().toISOString(),
  };
  await saveJson(credentialFile, record);
  console.log('ChatGPT-Plan-Freigabe bestaetigt. Geschuetzte Datei:', credentialFile);
  console.log('Datei niemals hier im Chat einfuegen. Den Transfer zum Server richten wir separat ein.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
