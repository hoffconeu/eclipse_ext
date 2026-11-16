import { createHash, createPublicKey, createPrivateKey, verify, sign, randomBytes, privateDecrypt, createDecipheriv, constants } from 'node:crypto';

export const MAX_CIPHERTEXT = 2_000_000;
export const MAX_TEXT = 1_048_576;
export const b64url = bytes => Buffer.from(bytes).toString('base64url');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function deviceMessage(method, path, timestamp, body) {
  return Buffer.from(`${method}\n${path}\n${timestamp}\n${sha256(body)}`, 'utf8');
}

export function verifyDevice({ publicKey, method, path, timestamp, body, signature, now = Date.now() }) {
  if (!/^\d{13}$/.test(String(timestamp)) || Math.abs(now - Number(timestamp)) > 30_000
    || !/^[A-Za-z0-9_-]{40,180}$/.test(signature || '')) return false;
  try {
    return verify(null, deviceMessage(method, path, timestamp, body), createPublicKey(publicKey),
      Buffer.from(signature, 'base64url'));
  } catch { return false; }
}

export function serverSignature(privateKey, timestamp, body) {
  return b64url(sign(null, Buffer.from(`${timestamp}\n${sha256(body)}`), createPrivateKey(privateKey)));
}

export function decryptEnvelope(compact, privateKey) {
  if (typeof compact !== 'string' || compact.length > MAX_CIPHERTEXT) throw new Error('Invalid envelope size');
  const parts = compact.split('.');
  if (parts.length !== 5 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error('Invalid envelope');
  const [header, wrapped, iv, ciphertext, tag] = parts;
  if (Buffer.from(header, 'base64url').toString('utf8') !== '{"alg":"RSA-OAEP-256","enc":"A256GCM"}')
    throw new Error('Unsupported envelope');
  const key = privateDecrypt({key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'},
    Buffer.from(wrapped, 'base64url'));
  if (key.length !== 32 || Buffer.from(iv, 'base64url').length !== 12 || Buffer.from(tag, 'base64url').length !== 16)
    throw new Error('Invalid envelope parameters');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(header));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]);
  key.fill(0);
  if (plain.length > MAX_TEXT) throw new Error('Plaintext too large');
  return JSON.parse(plain.toString('utf8'));
}

export const newId = () => b64url(randomBytes(18));
