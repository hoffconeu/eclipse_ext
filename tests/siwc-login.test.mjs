import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { parseCallbackUrl, verifyIdentityToken } from '../scripts/private-chat/siwc-login.mjs';

test('parses callback and follow-up requests without a live server port', () => {
  assert.equal(parseCallbackUrl('/auth/callback?state=abc').searchParams.get('state'), 'abc');
  assert.equal(parseCallbackUrl('/favicon.ico').pathname, '/favicon.ico');
});

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' };
const now = Math.floor(Date.now() / 1000);

function token(claims = {}, header = {}) {
  const first = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test', ...header })).toString('base64url');
  const second = Buffer.from(JSON.stringify({ iss: 'https://auth.openai.com', aud: 'oaiapp_test', exp: now + 300, iat: now, nonce: 'test-nonce', sub: 'test-user', ...claims })).toString('base64url');
  return `${first}.${second}.${sign('RSA-SHA256', Buffer.from(`${first}.${second}`), privateKey).toString('base64url')}`;
}

test('accepts signed identity with correct audience, nonce and account', () => {
  assert.equal(verifyIdentityToken(token(), { keys: [jwk] }, 'oaiapp_test', 'test-nonce', 'test-user').sub, 'test-user');
});

test('rejects altered signature and wrong identity fields', () => {
  const signed = token();
  assert.throws(() => verifyIdentityToken(`${signed.slice(0, -2)}xx`, { keys: [jwk] }, 'oaiapp_test', 'test-nonce'));
  for (const claims of [{ nonce: 'wrong' }, { aud: 'other' }, { iss: 'https://evil.example' }, { exp: now - 1 }, { sub: '' }]) {
    assert.throws(() => verifyIdentityToken(token(claims), { keys: [jwk] }, 'oaiapp_test', 'test-nonce'));
  }
  assert.throws(() => verifyIdentityToken(token(), { keys: [jwk] }, 'oaiapp_test', 'test-nonce', 'other-user'));
  assert.throws(() => verifyIdentityToken(token({ aud: ['oaiapp_test', 'other'] }), { keys: [jwk] }, 'oaiapp_test', 'test-nonce'));
  assert.throws(() => verifyIdentityToken(token({}, { alg: 'none' }), { keys: [jwk] }, 'oaiapp_test', 'test-nonce'));
});
