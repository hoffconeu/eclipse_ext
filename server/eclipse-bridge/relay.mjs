import { createServer } from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomInt, createPublicKey } from 'node:crypto';
import { EclipseReadRequests } from './requests.mjs';
import { verifyDevice, serverSignature, newId, MAX_CIPHERTEXT } from './protocol.mjs';

const now = () => Date.now();
const baseDir = process.env.ECLIPSE_BRIDGE_DATA_DIR || '/var/lib/oje-eclipse-bridge';
const dataPath = `${baseDir}/devices.json`;
const serverKeyPath = `${baseDir}/server-signing.key`;
const proxySecret = (await readFile(`${baseDir}/proxy-secret`, 'utf8')).trim();
const localSecret = (await readFile(`${baseDir}/local-secret`, 'utf8')).trim();
if (!proxySecret || !localSecret) throw new Error('Bridge configuration incomplete');
const serverKey = await readFile(serverKeyPath, 'utf8');
const devices = new Map(Object.entries(JSON.parse(await readFile(dataPath, 'utf8').catch(() => '{}'))));
const pairCodes = new Map();
const active = new Map();
const requests = new EclipseReadRequests();
const requestSessions = new Map();
const proposals = new Map();
const PROPOSAL_TTL = 120_000;
function clearProposals(deviceId) {
  for (const [id, item] of proposals) if (item.deviceId === deviceId) proposals.delete(id);
}

async function saveDevices() {
  const temp = `${dataPath}.${newId()}.tmp`;
  await writeFile(temp, JSON.stringify(Object.fromEntries(devices)), {mode: 0o600});
  await rename(temp, dataPath);
}

setInterval(() => {
  requests.purgeExpired();
  for (const [id] of requestSessions) if (!requests.exists(id)) requestSessions.delete(id);
  for (const [code, pending] of pairCodes) if (pending.expires < now()) pairCodes.delete(code);
  for (const [id, item] of proposals) if (item.expires < now()) proposals.delete(id);
}, 30_000).unref();

function response(res, status, body = '', headers = {}) {
  const bytes = Buffer.from(body);
  res.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers});
  res.end(bytes);
}

function signed(res, status, body = '') {
  const stamp = String(now());
  response(res, status, body, {'X-OJE-Time': stamp, 'X-OJE-Server-Signature': serverSignature(serverKey, stamp, body)});
}

async function readBody(req, max = MAX_CIPHERTEXT) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function error(res, status) { response(res, status, 'Request rejected'); }

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!/^\/(device|pair|local)\//.test(path)) return error(res, 404);
    const body = req.method === 'POST' ? await readBody(req) : Buffer.alloc(0);
    if (path === '/device/init' && req.method === 'POST') {
      if (body.length > 4096) return error(res, 413);
      for (const [code, pending] of pairCodes) if (pending.expires < now()) pairCodes.delete(code);
      if (pairCodes.size >= 20) return signed(res, 429, 'busy');
      const key = body.toString('utf8').trim();
      try { if (createPublicKey(key).asymmetricKeyType !== 'ed25519') return error(res, 400); }
      catch { return error(res, 400); }
      const id = newId(); const code = String(randomInt(10000000, 99999999));
      pairCodes.set(code, {id, key, expires: now() + 300_000});
      return signed(res, 200, `${id}\n${code}`);
    }
    if (path === '/pair/confirm' && req.method === 'POST') {
      if (req.headers.authorization !== `Bearer ${proxySecret}`) return error(res, 401);
      const code = body.toString('utf8').trim(); const pair = pairCodes.get(code);
      if (!pair || pair.expires < now()) return error(res, 404);
      pairCodes.delete(code); devices.set(pair.id, pair.key); await saveDevices();
      return response(res, 200, 'paired');
    }
    if (path.startsWith('/device/')) {
      const id = req.headers['x-oje-device']; const stamp = req.headers['x-oje-timestamp'];
      if (!devices.has(id) || !verifyDevice({publicKey: devices.get(id), method: req.method,
        path, timestamp: stamp, body, signature: req.headers['x-oje-signature']})) return signed(res, 401, 'unauthorized');
      if (path === '/device/session' && req.method === 'POST') {
        const action = body.toString('utf8');
        if (action === 'start' || action.startsWith('start\n')) {
          let proposalKey = null;
          if (action !== 'start') {
            proposalKey = action.slice(6);
            try {
              const key = createPublicKey(proposalKey);
              if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 3072
                || proposalKey.length > 2048) return signed(res, 400, 'invalid key');
            } catch { return signed(res, 400, 'invalid key'); }
          }
          if (active.has(id)) requests.cancelSession(active.get(id).sessionId);
          clearProposals(id);
          active.set(id, {lastSeen: now(), sessionId: newId(), proposalKey});
        } else if (action === 'stop') {
          if (active.has(id)) requests.cancelSession(active.get(id).sessionId);
          clearProposals(id);
          active.delete(id);
        }
        else return error(res, 400);
        return signed(res, 200, action === 'stop' ? 'stop' : 'start');
      }
      if (path === '/device/poll' && req.method === 'GET') {
        if (!active.has(id)) return signed(res, 403, 'inactive');
        active.get(id).lastSeen = now();
        const pending = requests.pending(id).map(r => `${r.id}\t${r.target.kind === 'list-open-editors' ? 'list'
          : r.target.kind === 'list-problems' ? 'problems' : 'read'}${r.target.id ? `\t${r.target.id}` : ''}`);
        for (const [proposalId, item] of proposals) {
          if (item.deviceId === id && item.sessionId === active.get(id).sessionId && item.expires > now())
            pending.push(`P\t${proposalId}\t${item.envelope}`);
        }
        return signed(res, 200, pending.join('\n'));
      }
      const ack = /^\/device\/ack\/([a-f0-9-]{36})$/.exec(path);
      if (ack && req.method === 'POST' && active.has(id)) {
        const item = proposals.get(ack[1]);
        if (!item || item.deviceId !== id || item.sessionId !== active.get(id).sessionId)
          return signed(res, 409, 'expired');
        proposals.delete(ack[1]);
        return signed(res, 200, 'accepted');
      }
      const match = /^\/device\/respond\/([a-f0-9-]{36})$/.exec(path);
      if (match && req.method === 'POST' && active.has(id)) {
        const envelope = body.toString('utf8');
        if (requests.respond({deviceId: id, id: match[1], approved: true, envelope}))
          return signed(res, 200, 'accepted');
        return signed(res, 409, 'expired');
      }
      return error(res, 404);
    }
    if (path.startsWith('/local/')) {
      if (req.headers.authorization !== `Bearer ${localSecret}`) return error(res, 401);
      const live = [...active.keys()].filter(id => now() - active.get(id).lastSeen < 15_000 && devices.has(id));
      if (path === '/local/status' && req.method === 'GET')
        return response(res, 200, JSON.stringify({online: live.length > 0, devices: live.length}));
      if (path === '/local/proposal-key' && req.method === 'GET') {
        if (live.length !== 1 || !active.get(live[0]).proposalKey) return error(res, 409);
        const session = active.get(live[0]);
        return response(res, 200, JSON.stringify({sessionId: session.sessionId, publicKey: session.proposalKey}));
      }
      if (path === '/local/proposal' && req.method === 'POST') {
        if (live.length !== 1) return error(res, 409);
        const input = JSON.parse(body.toString('utf8'));
        if (!/^[a-f0-9-]{36}$/.test(input.id || '') || typeof input.envelope !== 'string'
          || input.envelope.length > MAX_CIPHERTEXT || !/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){4}$/.test(input.envelope)
          || input.sessionId !== active.get(live[0]).sessionId || proposals.has(input.id)
          || !active.get(live[0]).proposalKey || proposals.size >= 20) return error(res, 400);
        proposals.set(input.id, {deviceId: live[0], sessionId: input.sessionId,
          envelope: input.envelope, expires: now() + PROPOSAL_TTL});
        return response(res, 200, JSON.stringify({status: 'queued', id: input.id}));
      }
      if (path === '/local/request' && req.method === 'POST') {
        if (live.length !== 1) return error(res, 409);
        const input = JSON.parse(body.toString('utf8'));
        if (!['list', 'read', 'problems'].includes(input.kind)) return error(res, 400);
        const target = input.kind === 'list' ? {kind: 'list-open-editors'}
          : input.kind === 'problems' ? {kind: 'list-problems'} : {kind: 'open-editor', id: input.editorId};
        const sessionId = active.get(live[0]).sessionId;
        const request = requests.create({sessionId, deviceId: live[0], target, purpose: 'Codex-Lesezugriff'});
        requestSessions.set(request.id, sessionId);
        return response(res, 200, JSON.stringify(request));
      }
      const match = /^\/local\/result\/([a-f0-9-]{36})$/.exec(path);
      if (match && req.method === 'GET') {
        const sessionId = requestSessions.get(match[1]);
        if (!sessionId || !requests.exists(match[1])) {
          requestSessions.delete(match[1]);
          return response(res, 200, JSON.stringify({status: 'expired'}));
        }
        const result = requests.consume({sessionId, id: match[1]});
        if (result) requestSessions.delete(match[1]);
        return response(res, 200, JSON.stringify(result ?? {status: 'pending'}));
      }
      return error(res, 404);
    }
    return error(res, 404);
  } catch (err) {
    if (err.message === 'Request too large') return error(res, 413);
    response(res, 500, 'Internal error');
  }
});

server.listen(Number(process.env.ECLIPSE_BRIDGE_PORT || 8097), '127.0.0.1');
