import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {generateKeyPairSync, privateDecrypt, createDecipheriv, constants} from 'node:crypto';

test('MCP proposal is encrypted for the current session and never sent in plaintext', {timeout: 20_000}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'oje-mcp-proposal-'));
  const keys = generateKeyPairSync('rsa', {modulusLength: 3072});
  const publicKey = keys.publicKey.export({format: 'pem', type: 'spki'});
  const privateKey = keys.privateKey.export({format: 'pem', type: 'pkcs8'});
  const sessionId = 'a'.repeat(24);
  let offered;
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== 'Bearer synthetic-secret') {
      response.writeHead(401).end(); return;
    }
    if (request.url === '/local/proposal-key') {
      response.writeHead(200).end(JSON.stringify({sessionId, publicKey})); return;
    }
    if (request.url === '/local/proposal') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      offered = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200).end(JSON.stringify({status: 'queued', id: offered.id})); return;
    }
    response.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await writeFile(join(directory, 'local-secret'), 'synthetic-secret');
  await writeFile(join(directory, 'recipient.key'), privateKey);
  const child = spawn(process.execPath, [resolve('server/eclipse-bridge/mcp.mjs')], {
    env: {...process.env, ECLIPSE_BRIDGE_DATA_DIR: directory,
      ECLIPSE_BRIDGE_PORT: String(server.address().port)}, stdio: ['pipe', 'pipe', 'pipe']
  });
  try {
    const response = new Promise((resolveResponse, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk.toString('utf8');
        if (output.includes('\n')) resolveResponse(JSON.parse(output.slice(0, output.indexOf('\n'))));
      });
      child.once('error', reject);
    });
    child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: {name: 'eclipse_show_proposal', arguments: {editor_id: 'b'.repeat(32),
        base_sha256: 'c'.repeat(64), proposed_text: 'SYNTHETIC PROPOSAL', summary: 'synthetic'}}}) + '\n');
    const reply = await response;
    assert.equal(reply.result.isError, undefined);
    assert.equal(JSON.parse(reply.result.content[0].text).status, 'queued');
    assert.equal(offered.sessionId, sessionId);
    assert.equal(JSON.stringify(offered).includes('SYNTHETIC PROPOSAL'), false);
    const [header, wrapped, iv, ciphertext, tag] = offered.envelope.split('.');
    const cek = privateDecrypt({key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'}, Buffer.from(wrapped, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', cek, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(header)); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()])
      .toString('utf8').split('\n');
    assert.equal(plain[0], offered.id);
    assert.equal(plain[1], 'b'.repeat(32));
    assert.equal(plain[2], 'c'.repeat(64));
    assert.equal(Buffer.from(plain[5], 'base64').toString('utf8'), 'SYNTHETIC PROPOSAL');
  } finally {
    child.kill();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, {recursive: true, force: true});
  }
});
