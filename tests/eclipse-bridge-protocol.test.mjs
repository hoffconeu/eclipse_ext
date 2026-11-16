import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign, randomBytes, publicEncrypt, createCipheriv, constants } from 'node:crypto';
import { b64url, deviceMessage, verifyDevice, serverSignature, decryptEnvelope } from '../server/eclipse-bridge/protocol.mjs';

test('device signature binds method, path, timestamp and body', () => {
  const keys = generateKeyPairSync('ed25519');
  const body = Buffer.from('start'); const stamp = String(Date.now());
  const signature = b64url(sign(null, deviceMessage('POST', '/device/session', stamp, body), keys.privateKey));
  const input = {publicKey: keys.publicKey.export({format: 'pem', type: 'spki'}), method: 'POST',
    path: '/device/session', timestamp: stamp, body, signature};
  assert.equal(verifyDevice(input), true);
  assert.equal(verifyDevice({...input, body: Buffer.from('stop')}), false);
  assert.equal(verifyDevice({...input, path: '/device/poll'}), false);
  assert.equal(verifyDevice({...input, now: Date.now() + 31_000}), false);
  assert.match(serverSignature(keys.privateKey.export({format: 'pem', type: 'pkcs8'}), stamp, body), /^[A-Za-z0-9_-]+$/);
});

test('Node decrypts the JWE profile and rejects tampering', () => {
  const pair = generateKeyPairSync('rsa', {modulusLength: 3072});
  const header = b64url('{"alg":"RSA-OAEP-256","enc":"A256GCM"}');
  const cek = randomBytes(32); const iv = randomBytes(12);
  const wrapped = publicEncrypt({key: pair.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256'}, cek);
  const cipher = createCipheriv('aes-256-gcm', cek, iv); cipher.setAAD(Buffer.from(header));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({requestId: 'abc', kind: 'list', items: []})), cipher.final()]);
  const envelope = [header, b64url(wrapped), b64url(iv), b64url(ciphertext), b64url(cipher.getAuthTag())].join('.');
  assert.deepEqual(decryptEnvelope(envelope, pair.privateKey), {requestId: 'abc', kind: 'list', items: []});
  const parts = envelope.split('.'); parts[3] = b64url(Buffer.from('tampered'));
  assert.throws(() => decryptEnvelope(parts.join('.'), pair.privateKey));
});
