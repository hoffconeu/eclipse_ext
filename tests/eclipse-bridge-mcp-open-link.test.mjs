import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {generateKeyPairSync, privateDecrypt, createDecipheriv, constants} from 'node:crypto';

function decryptText(envelope, key) {
  const [header, wrapped, iv, ciphertext, tag] = envelope.split('.');
  const cek = privateDecrypt({key, padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256'}, Buffer.from(wrapped, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', cek, Buffer.from(iv, 'base64url'));
  cipher.setAAD(Buffer.from(header)); cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(ciphertext, 'base64url')), cipher.final()]).toString('utf8');
}

test('MCP ADT link is validated and encrypted for the current session', {timeout: 20_000}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'oje-mcp-adt-link-'));
  const keys = generateKeyPairSync('rsa', {modulusLength: 3072});
  const publicKey = keys.publicKey.export({format: 'pem', type: 'spki'});
  const privateKey = keys.privateKey.export({format: 'pem', type: 'pkcs8'});
  const sessionId = 'a'.repeat(24);
  const link = 'adt://TEST/sap/bc/adt/oo/classes/cl_synthetic';
  let offered;
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== 'Bearer synthetic-secret') {
      response.writeHead(401).end(); return;
    }
    if (request.url === '/local/proposal-key') {
      response.writeHead(200).end(JSON.stringify({sessionId, publicKey})); return;
    }
    if (request.url === '/local/open-link') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      offered = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200).end(JSON.stringify({status: 'queued', id: offered.id})); return;
    }
    response.writeHead(404).end();
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  await writeFile(join(directory, 'local-secret'), 'synthetic-secret');
  await writeFile(join(directory, 'recipient.key'), privateKey);
  const child = spawn(process.execPath, [resolve('server/eclipse-bridge/mcp.mjs')], {
    env: {...process.env, ECLIPSE_BRIDGE_DATA_DIR: directory,
      ECLIPSE_BRIDGE_PORT: String(server.address().port)}, stdio: ['pipe', 'pipe', 'pipe']
  });
  let output = '';
  const next = () => new Promise((done, reject) => {
    const onData = chunk => {
      output += chunk.toString('utf8');
      const end = output.indexOf('\n');
      if (end < 0) return;
      child.stdout.off('data', onData);
      const line = output.slice(0, end); output = output.slice(end + 1);
      done(JSON.parse(line));
    };
    child.stdout.on('data', onData); child.once('error', reject);
  });
  try {
    let answer = next();
    child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: {name: 'eclipse_open_adt_link', arguments: {adt_link: link}}}) + '\n');
    const reply = await answer;
    assert.equal(JSON.parse(reply.result.content[0].text).status, 'queued');
    assert.equal(offered.sessionId, sessionId);
    assert.equal(JSON.stringify(offered).includes(link), false);
    const parts = decryptText(offered.envelope, privateKey).split('\n');
    assert.equal(parts[0], offered.id);
    assert.equal(parts[1], 'OPEN_ADT_LINK');
    assert.equal(Buffer.from(parts[3], 'base64').toString('utf8'), link);
    for (const invalid of ['https://example.org/', 'adt://TEST/other/path',
      'adt://TEST/sap/bc/adt/../secret', 'adt://TEST/sap/bc/adt/oo/classes/abc"']) {
      answer = next();
      child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: {name: 'eclipse_open_adt_link', arguments: {adt_link: invalid}}}) + '\n');
      assert.equal((await answer).result.isError, true);
    }
  } finally {
    child.kill();
    await new Promise(done => server.close(done));
    await rm(directory, {recursive: true, force: true});
  }
});
