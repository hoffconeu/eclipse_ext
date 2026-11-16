import assert from 'node:assert/strict';
import test from 'node:test';
import { EclipseReadRequests } from '../server/eclipse-bridge/requests.mjs';

const envelope = 'synthetic.encrypted.payload.for.test.only';

test('approval is device-bound, session-bound and consumable once', () => {
  const requests = new EclipseReadRequests();
  const { id } = requests.create({ sessionId: 'session-a', deviceId: 'eclipse-a',
    target: { kind: 'list-open-editors' }, purpose: 'Quelltext pruefen' });
  assert.equal(requests.pending('eclipse-b').length, 0);
  assert.equal(requests.pending('eclipse-a').length, 1);
  assert.equal(requests.respond({ deviceId: 'eclipse-b', id, approved: true, envelope }), false);
  assert.equal(requests.consume({ sessionId: 'session-b', id }), null);
  assert.equal(requests.consume({ sessionId: 'session-a', id }), null);
  assert.equal(requests.respond({ deviceId: 'eclipse-a', id, approved: true, envelope }), true);
  assert.deepEqual(requests.consume({ sessionId: 'session-a', id }), { status: 'approved', envelope });
  assert.equal(requests.consume({ sessionId: 'session-a', id }), null);
  assert.equal(requests.respond({ deviceId: 'eclipse-a', id, approved: true, envelope }), false);
});

test('denial releases no payload', () => {
  const requests = new EclipseReadRequests();
  const { id } = requests.create({ sessionId: 's', deviceId: 'd',
    target: { kind: 'open-editor', id: 'a'.repeat(32) }, purpose: 'Pruefung' });
  assert.equal(requests.respond({ deviceId: 'd', id, approved: false }), true);
  assert.deepEqual(requests.consume({ sessionId: 's', id }), { status: 'denied', envelope: null });
});

test('requests expire and reject unsafe editor identifiers', () => {
  let now = 1000;
  const requests = new EclipseReadRequests({ now: () => now, ttlMs: 100 });
  for (const id of ['../secret', '/absolute', 'a/../b', 'C:\\secret', 'a//b', 'a\u0000b']) {
    assert.throws(() => requests.create({ sessionId: 's', deviceId: 'd',
      target: { kind: 'open-editor', id }, purpose: 'Pruefung' }));
  }
  const { id } = requests.create({ sessionId: 's', deviceId: 'd',
    target: { kind: 'list-open-editors' }, purpose: 'Pruefung' });
  now = 1100;
  assert.deepEqual(requests.pending('d'), []);
  assert.equal(requests.respond({ deviceId: 'd', id, approved: true, envelope }), false);
});
