import { randomUUID } from 'node:crypto';

const MAX_PURPOSE = 240;
const MAX_ENVELOPE = 2_000_000;
const MAX_PENDING = 100;

function validTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.kind === 'list-open-editors') return Object.keys(target).length === 1;
  if (target.kind === 'list-problems') return Object.keys(target).length === 1;
  return target.kind === 'open-editor' && Object.keys(target).length === 2
    && typeof target.id === 'string' && /^[a-f0-9]{32}$/.test(target.id);
}

/** Ephemeral request state. Authentication, JWE verification and persistence belong to the caller. */
export class EclipseReadRequests {
  #requests = new Map();
  #now;
  #ttl;

  constructor({ now = () => Date.now(), ttlMs = 120_000 } = {}) {
    if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 300_000) throw new TypeError('Invalid TTL');
    this.#now = now;
    this.#ttl = ttlMs;
  }

  #find(id) {
    const request = this.#requests.get(id);
    if (!request) return null;
    if (request.expiresAt <= this.#now()) {
      this.#requests.delete(id);
      return null;
    }
    return request;
  }

  create({ sessionId, deviceId, target, purpose }) {
    if (typeof sessionId !== 'string' || !sessionId || typeof deviceId !== 'string' || !deviceId
      || !validTarget(target) || typeof purpose !== 'string' || !purpose.trim()
      || purpose.length > MAX_PURPOSE) throw new TypeError('Invalid read request');
    for (const id of this.#requests.keys()) this.#find(id);
    if (this.#requests.size >= MAX_PENDING) throw new Error('Too many pending requests');
    const request = {
      id: randomUUID(), sessionId, deviceId, target: structuredClone(target), purpose: purpose.trim(),
      expiresAt: this.#now() + this.#ttl, status: 'pending', envelope: null,
    };
    this.#requests.set(request.id, request);
    return { id: request.id, expiresAt: request.expiresAt };
  }

  pending(deviceId) {
    return [...this.#requests.values()].filter(request =>
      this.#find(request.id) && request.deviceId === deviceId && request.status === 'pending'
    ).map(({ id, target, purpose, expiresAt }) => ({ id, target: structuredClone(target), purpose, expiresAt }));
  }

  respond({ deviceId, id, approved, envelope }) {
    const request = this.#find(id);
    if (!request || request.deviceId !== deviceId || request.status !== 'pending') return false;
    if (typeof approved !== 'boolean') throw new TypeError('Invalid approval');
    if (approved && (typeof envelope !== 'string' || envelope.length < 20
      || envelope.length > MAX_ENVELOPE)) throw new TypeError('Invalid encrypted envelope');
    request.status = approved ? 'approved' : 'denied';
    request.envelope = approved ? envelope : null;
    return true;
  }

  consume({ sessionId, id }) {
    const request = this.#find(id);
    if (!request || request.sessionId !== sessionId || request.status === 'pending') return null;
    this.#requests.delete(id);
    return { status: request.status, envelope: request.envelope };
  }

  cancelSession(sessionId) {
    for (const [id, request] of this.#requests) {
      if (request.sessionId === sessionId) this.#requests.delete(id);
    }
  }

  exists(id) { return Boolean(this.#find(id)); }

  purgeExpired() {
    for (const id of this.#requests.keys()) this.#find(id);
  }
}
