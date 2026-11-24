import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { generateKeyPairSync, sign, randomBytes, publicEncrypt, createCipheriv, constants, randomUUID } from 'node:crypto';
import { b64url, deviceMessage, decryptEnvelope, encryptEnvelope } from '../server/eclipse-bridge/protocol.mjs';

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function encrypt(value, publicKey) {
  const header = b64url('{"alg":"RSA-OAEP-256","enc":"A256GCM"}');
  const key = randomBytes(32); const iv = randomBytes(12);
  const wrapped = publicEncrypt({key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'}, key);
  const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(header));
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [header, b64url(wrapped), b64url(iv), b64url(bytes), b64url(cipher.getAuthTag())].join('.');
}

test('synthetic pairing, grant, one-time encrypted read and revocation', {timeout: 30_000}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'oje-bridge-'));
  const port = await freePort();
  const signing = generateKeyPairSync('ed25519');
  const recipient = generateKeyPairSync('rsa', {modulusLength: 3072});
  const device = generateKeyPairSync('ed25519');
  const proxySecret = 'proxy-test-secret'; const localSecret = 'local-test-secret';
  await writeFile(join(directory, 'server-signing.key'), signing.privateKey.export({format: 'pem', type: 'pkcs8'}));
  await writeFile(join(directory, 'proxy-secret'), proxySecret);
  await writeFile(join(directory, 'local-secret'), localSecret);
  const child = spawn(process.execPath, [resolve('server/eclipse-bridge/relay.mjs')],
    {env: {...process.env, ECLIPSE_BRIDGE_DATA_DIR: directory, ECLIPSE_BRIDGE_PORT: String(port)}, stdio: 'ignore'});
  const base = `http://127.0.0.1:${port}`;
  const call = async (path, {method = 'GET', body = '', headers = {}} = {}) => fetch(base + path,
    {method, body: method === 'GET' ? undefined : body, headers});
  try {
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { await call('/local/status'); ready = true; break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    assert.equal(ready, true);
    const publicKey = device.publicKey.export({format: 'pem', type: 'spki'});
    const init = await call('/device/init', {method: 'POST', body: publicKey});
    assert.equal(init.status, 200);
    const [id, code] = (await init.text()).split('\n');
    assert.match(code, /^\d{8}$/);
    const pair = await call('/pair/confirm', {method: 'POST', body: code,
      headers: {Authorization: `Bearer ${proxySecret}`}});
    assert.equal(pair.status, 200);
    const signed = (method, path, body = '') => {
      const stamp = String(Date.now());
      const signature = b64url(sign(null, deviceMessage(method, path, stamp, Buffer.from(body)), device.privateKey));
      return call(path, {method, body, headers: {'X-OJE-Device': id, 'X-OJE-Timestamp': stamp,
        'X-OJE-Signature': signature}});
    };
    assert.equal((await signed('POST', '/device/session', 'start')).status, 200);
    const localHeaders = {Authorization: `Bearer ${localSecret}`};
    const created = await call('/local/request', {method: 'POST', headers: localHeaders,
      body: JSON.stringify({kind: 'list'})});
    assert.equal(created.status, 200);
    const request = await created.json();
    const poll = await signed('GET', '/device/poll');
    assert.equal(poll.status, 200);
    assert.equal(await poll.text(), `${request.id}\tlist`);
    const envelope = encrypt({requestId: request.id, kind: 'list', items: [{id: 'a'.repeat(32), title: 'SYNTHETIC'}]}, recipient.publicKey);
    assert.equal((await signed('POST', `/device/respond/${request.id}`, envelope)).status, 200);
    assert.equal((await signed('POST', `/device/respond/${request.id}`, envelope)).status, 409);
    const result = await (await call(`/local/result/${request.id}`, {headers: localHeaders})).json();
    assert.equal(result.status, 'approved');
    assert.deepEqual(decryptEnvelope(result.envelope, recipient.privateKey).items[0].title, 'SYNTHETIC');
    assert.equal((await (await call(`/local/result/${request.id}`, {headers: localHeaders})).json()).status, 'expired');
    const problemRequest = await call('/local/request', {method: 'POST', headers: localHeaders,
      body: JSON.stringify({kind: 'problems'})});
    assert.equal(problemRequest.status, 200);
    const problemId = (await problemRequest.json()).id;
    assert.equal(await (await signed('GET', '/device/poll')).text(), `${problemId}\tproblems`);
    const problemEnvelope = encrypt({requestId: problemId, kind: 'problems', items: []}, recipient.publicKey);
    assert.equal((await signed('POST', `/device/respond/${problemId}`, problemEnvelope)).status, 200);
    const problemResult = await (await call(`/local/result/${problemId}`, {headers: localHeaders})).json();
    assert.equal(decryptEnvelope(problemResult.envelope, recipient.privateKey).kind, 'problems');
    assert.equal((await signed('POST', '/device/session', 'stop')).status, 200);
    assert.equal((await (await call('/local/status', {headers: localHeaders})).json()).online, false);
    const proposalKey = generateKeyPairSync('rsa', {modulusLength: 3072});
    const proposalPublic = proposalKey.publicKey.export({format: 'pem', type: 'spki'});
    assert.equal((await signed('POST', '/device/session', 'start\n' + proposalPublic)).status, 200);
    assert.equal((await call('/local/proposal-key')).status, 401);
    const keyReply = await (await call('/local/proposal-key', {headers: localHeaders})).json();
    assert.equal(keyReply.publicKey, proposalPublic);
    const proposalId = randomUUID();
    const proposalEnvelope = encryptEnvelope(JSON.stringify({id: proposalId, text: 'SYNTHETIC'}), proposalPublic);
    assert.equal(decryptEnvelope(proposalEnvelope, proposalKey.privateKey).text, 'SYNTHETIC');
    const offered = await call('/local/proposal', {method: 'POST', headers: localHeaders,
      body: JSON.stringify({id: proposalId, sessionId: keyReply.sessionId, envelope: proposalEnvelope})});
    assert.equal(offered.status, 200);
    assert.equal((await (await call('/local/delivery/' + proposalId, {headers: localHeaders})).json()).status, 'queued');
    assert.match(await (await signed('GET', '/device/poll')).text(), new RegExp('^P\t' + proposalId + '\t'));
    assert.equal((await signed('POST', '/device/delivery/' + proposalId, 'displayed')).status, 200);
    assert.equal((await (await call('/local/delivery/' + proposalId, {headers: localHeaders})).json()).status, 'displayed');
    assert.equal(await (await signed('GET', '/device/poll')).text(), '');
    assert.equal((await signed('POST', '/device/delivery/' + proposalId, 'displayed')).status, 409);
    const failedId = randomUUID();
    assert.equal((await call('/local/proposal', {method: 'POST', headers: localHeaders,
      body: JSON.stringify({id: failedId, sessionId: keyReply.sessionId, envelope: proposalEnvelope})})).status, 200);
    assert.equal((await signed('POST', '/device/delivery/' + failedId, 'editor_changed')).status, 200);
    assert.deepEqual(await (await call('/local/delivery/' + failedId, {headers: localHeaders})).json(),
      {id: failedId, status: 'failed', reason: 'editor_changed'});
    const linkId = randomUUID();
    const linkEnvelope = encryptEnvelope('SYNTHETIC ADT LINK', proposalPublic);
    const linkOffer = await call('/local/open-link', {method: 'POST', headers: localHeaders,
      body: JSON.stringify({id: linkId, sessionId: keyReply.sessionId, envelope: linkEnvelope})});
    assert.equal(linkOffer.status, 200);
    const linkPoll = await (await signed('GET', '/device/poll')).text();
    assert.match(linkPoll, new RegExp('^L\\t' + linkId + '\\t'));
    assert.equal(linkPoll.includes('SYNTHETIC ADT LINK'), false);
    assert.equal((await signed('POST', '/device/ack/' + linkId)).status, 200);
    assert.equal(await (await signed('GET', '/device/poll')).text(), '');
    const laterId = randomUUID();
    assert.equal((await call('/local/proposal', {method: 'POST', headers: localHeaders,
      body: JSON.stringify({id: laterId, sessionId: keyReply.sessionId, envelope: proposalEnvelope})})).status, 200);
    assert.equal((await signed('POST', '/device/session', 'stop')).status, 200);
    assert.equal((await (await call('/local/delivery/' + laterId, {headers: localHeaders})).json()).status, 'session_stopped');
    assert.equal((await signed('POST', '/device/session', 'start\n' + proposalPublic)).status, 200);
    assert.equal(await (await signed('GET', '/device/poll')).text(), '');
  } finally {
    child.kill();
    await rm(directory, {recursive: true, force: true});
  }
});
