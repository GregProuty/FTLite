import {
  ROOM_CHECKPOINT_BYTES, ROOM_CHECKPOINT_METADATA_BYTES, ROOM_SMALL_BODY_BYTES,
  SERVICE_ERROR_RETRYABLE, isRoomToken, parseBoundedJson, parseClientFrame, parseServerEnvelope,
  validateCheckpointMetadata, validateCompatibility, validateSeatSession, validateServiceError,
  validateSocketTicket, validateTurnCredentials,
  type LeaseGrant, type ReplyOutcome, type RequestFrame, type RoomCompatibility, type RoomSnapshot,
  type SeatSession, type SeatSessionView, type ServerPayload, type ServiceError, type ServiceErrorCode,
  type SessionCheckpointMetadata,
} from '../../shared/roomSession';
import type { RtcIdentity, RtcSignal } from '../../shared/rtcSession';

/** Epoch milliseconds, including deadlines received from the service. */
export interface RoomServiceClock {
  nowMs(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
export interface RoomServiceSocketEvent { readonly type: string; readonly data?: unknown }
export interface RoomServiceSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(text: string): void;
  close(): void;
  addEventListener(type: 'open' | 'message' | 'close' | 'error', callback: (event: RoomServiceSocketEvent) => void): void;
  removeEventListener(type: 'open' | 'message' | 'close' | 'error', callback: (event: RoomServiceSocketEvent) => void): void;
}
export interface RoomServiceClientOptions {
  baseUrl: string;
  fetch(url: string, init?: RequestInit): Promise<Response>;
  createWebSocket(url: string): RoomServiceSocket | Promise<RoomServiceSocket>;
  clock: RoomServiceClock;
  allowInsecureLocalhost?: boolean;
}
type WithoutId<T> = T extends unknown ? Omit<T, 'requestId'> : never;
export type RoomOperation = WithoutId<RequestFrame>;
type OutcomeKind<T extends RoomOperation> = T['type'] extends 'ready' | 'remove-seat' ? 'snapshot'
  : T['type'] extends 'start-propose' ? 'proposal' : T['type'] extends 'start-commit' ? 'started'
  : T['type'] extends 'link-request' ? 'attempt' : T['type'] extends 'lease-renew' | 'rehost-claim' ? 'lease' : 'void';
export type RoomReply<T extends RoomOperation = RoomOperation> = T extends RoomOperation ? Extract<ReplyOutcome, { kind: OutcomeKind<T> }> : never;
export type RoomServiceEvent = Exclude<ServerPayload, { type: 'authenticated' | 'reply' }>;
export class RoomServiceClientError extends Error implements ServiceError {
  readonly code: ServiceErrorCode; readonly retryable: boolean; readonly retryAfterMs?: number;
  constructor(error: ServiceError) {
    super(error.code); this.name = 'RoomServiceClientError'; this.code = error.code; this.retryable = error.retryable;
    if (error.retryAfterMs !== undefined) this.retryAfterMs = error.retryAfterMs;
  }
}
const fault = (code: ServiceErrorCode) => new RoomServiceClientError({ code, retryable: SERVICE_ERROR_RETRYABLE[code] });
const copy = <T>(value: T): T => structuredClone(value);
const utf8 = new TextEncoder();
function parseJsonBytes(bytes: Uint8Array, maxBytes: number): unknown {
  try { return parseBoundedJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes), maxBytes); }
  catch { throw fault('invalid-frame'); }
}
const MAX_PENDING = 64, MAX_PENDING_BYTES = 262144, DEADLINE_MS = 5000;
const expectedKind: Record<RoomOperation['type'], ReplyOutcome['kind']> = {
  ready: 'snapshot', 'remove-seat': 'snapshot', 'start-propose': 'proposal', 'start-commit': 'started',
  'link-request': 'attempt', signal: 'void', 'link-ready': 'void', 'lease-renew': 'lease',
  'host-release': 'void', 'rehost-claim': 'lease',
};
function sameCompatibility(a: RoomCompatibility, b: RoomCompatibility) {
  return a.protocolVersion === b.protocolVersion && a.modeId === b.modeId && a.schemaVersion === b.schemaVersion
    && a.simVersion === b.simVersion && a.contentDigest === b.contentDigest && a.layoutHash === b.layoutHash;
}
function metadataHeader(metadata: SessionCheckpointMetadata): string {
  return btoa(String.fromCharCode(...utf8.encode(JSON.stringify(metadata)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function parseMetadata(header: string | null): SessionCheckpointMetadata {
  if (!header || header.length > ROOM_CHECKPOINT_METADATA_BYTES || !/^[A-Za-z0-9_-]+$/.test(header)) throw fault('invalid-frame');
  let value: unknown;
  try { value = parseBoundedJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(atob(header.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0))), ROOM_CHECKPOINT_METADATA_BYTES); }
  catch { throw fault('invalid-frame'); }
  if (!validateCheckpointMetadata(value)) throw fault('invalid-frame');
  return value;
}
async function digest(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** In-memory main-side signalling provider. No retry queue, token persistence, or game dependency. */
export function createRoomServiceClient(options: RoomServiceClientOptions) {
  let origin: URL;
  try { origin = new URL(options.baseUrl); } catch { throw fault('invalid-request'); }
  if (origin.username || origin.password || options.baseUrl.includes('?') || options.baseUrl.includes('#')
    || origin.pathname !== '/' || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && options.allowInsecureLocalhost
      && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) throw fault('invalid-request');
  const baseUrl = origin.origin, wsBase = baseUrl.replace(/^http/, 'ws'), { clock } = options;
  let closed = false, generation = 0, authority = 0, token: string | undefined, session: SeatSessionView | undefined;
  let socket: RoomServiceSocket | undefined, connectionId: string | undefined, authenticated = false;
  let sequence = 0, nextId = 1, pendingBytes = 0;
  const listeners = new Set<(event: RoomServiceEvent) => void>(), removers: (() => void)[] = [];
  const http = new Map<AbortController, { authority?: number; deadline: number }>();
  // Factories cannot be cancelled through this interface. Keep their admission
  // across connection generations until the underlying operation truly settles.
  const unsettledFactories = new Set<AbortController>();
  let checkpointBodies = 0;
  let handshake: { resolve(snapshot: RoomSnapshot): void; reject(error: Error): void; timer: unknown } | undefined;
  type Pending = { operation: RoomOperation; hostGeneration: number; bytes: number; stale: boolean; timer: unknown;
    resolve(outcome: ReplyOutcome): void; reject(error: Error): void };
  const pending = new Map<number, Pending>();
  // Retain routing metadata only; ephemeral authentication tickets go directly to subscribers.
  const links = new Map<string, { identity: RtcIdentity; role: 'offerer' | 'answerer' }>();
  // Issuance can retire before its reply arrives. Retain only validated IDs and
  // eligible pending requests, never routing/tickets. At most 64 IDs x 64
  // pending references, all bounded by the existing five-second request life.
  const issued = new Map<string, Set<Pending>>();
  function forgetIssuance(p: Pending) {
    for (const [id, eligible] of issued) { eligible.delete(p); if (!eligible.size) issued.delete(id); }
  }

  function assertCurrent(expected: number, expectedAuthority?: number) {
    if (closed || expected !== generation) throw fault('stale-connection');
    if (expectedAuthority !== undefined && expectedAuthority !== authority) throw fault('stale-generation');
  }
  function detach(error: RoomServiceClientError) {
    generation++; authority++; authenticated = false; connectionId = undefined;
    for (const controller of http.keys()) controller.abort(error);
    http.clear();
    for (const controller of unsettledFactories) controller.abort(error);
    for (const remove of removers.splice(0)) remove();
    const old = socket; socket = undefined;
    try { old?.close(); } catch {}
    if (handshake) { clock.clearTimeout(handshake.timer); handshake.reject(error); handshake = undefined; }
    for (const p of pending.values()) { clock.clearTimeout(p.timer); p.reject(error); }
    pending.clear(); pendingBytes = 0; links.clear(); issued.clear(); sequence = 0; nextId = 1;
    token = undefined; session = undefined;
  }
  function dispatch(event: RoomServiceEvent) {
    const stamp = generation;
    for (const listener of [...listeners]) {
      if (closed || stamp !== generation) break;
      listener(copy(event));
    }
  }
  function fail(code: ServiceErrorCode) {
    detach(fault(code));
    // Invalidate before callbacks: a subscriber may explicitly start a new
    // connection, which must not be disposed by cleanup for the old one.
    try { dispatch({ type: 'error', error: { code, retryable: SERVICE_ERROR_RETRYABLE[code] } }); } catch {}
  }
  function begin() {
    if (closed) throw fault('invalid-state');
    detach(fault('stale-connection'));
    return generation;
  }
  function requireSession() {
    if (closed || !session || !token) throw fault('invalid-state');
    return session;
  }
  function compatibleSnapshot(value: RoomSnapshot) {
    const current = requireSession().snapshot;
    return value.roomId === current.roomId && value.runId === current.runId && value.joinCode === current.joinCode
      && value.capacity === current.capacity && sameCompatibility(value.compatibility, current.compatibility);
  }
  function validSnapshot(value: RoomSnapshot) {
    return compatibleSnapshot(value) && value.hostGeneration === session!.snapshot.hostGeneration
      && value.hostSeatId === session!.snapshot.hostSeatId
      && value.seats[session!.seatId]?.occupied && value.seats[session!.seatId]?.seatGeneration === session!.seatGeneration;
  }
  function rememberSnapshot(value: RoomSnapshot) {
    if (!validSnapshot(value)) throw fault('invalid-frame');
    if (value.rosterRevision >= session!.snapshot.rosterRevision) session!.snapshot = copy(value);
  }
  function validLease(lease: LeaseGrant, hostGeneration = session!.snapshot.hostGeneration, hostSeatId = session!.snapshot.hostSeatId) {
    return lease.roomId === session!.snapshot.roomId && lease.hostGeneration === hostGeneration && lease.hostSeatId === hostSeatId;
  }
  function validMetadata(metadata: SessionCheckpointMetadata) {
    const s = requireSession().snapshot;
    return metadata.roomId === s.roomId && metadata.runId === s.runId && sameCompatibility(metadata.compatibility, s.compatibility)
      && metadata.hostGeneration <= s.hostGeneration;
  }
  function send(value: unknown) {
    const text = JSON.stringify(value);
    if (!socket || socket.readyState !== 1 || !Number.isFinite(socket.bufferedAmount) || socket.bufferedAmount + utf8.encode(text).byteLength > MAX_PENDING_BYTES) throw fault('capacity');
    socket.send(text);
  }
  function invalidateAuthority(nextHostGeneration: number, preserveLifecycle = true) {
    authority++; links.clear(); issued.clear();
    for (const p of pending.values()) {
      if (preserveLifecycle && p.operation.type === 'rehost-claim' && p.operation.expectedHostGeneration + 1 === nextHostGeneration) continue;
      if (preserveLifecycle && p.operation.type === 'host-release' && p.hostGeneration === nextHostGeneration) continue;
      p.stale = true; p.reject(fault('stale-generation'));
    }
    for (const [controller, work] of http) if (work.authority !== undefined) controller.abort(fault('stale-generation'));
  }
  function validateReply(p: Pending, outcome: ReplyOutcome) {
    if (outcome.kind === 'error') return;
    if (outcome.kind !== expectedKind[p.operation.type]) throw fault('invalid-frame');
    if (outcome.kind === 'snapshot') rememberSnapshot(outcome.snapshot);
    if (outcome.kind === 'started' || outcome.kind === 'lease') {
      if (!validLease(outcome.lease)) throw fault('invalid-frame');
      if ((p.operation.type === 'lease-renew' || p.operation.type === 'rehost-claim') && outcome.lease.nonce !== p.operation.nonce) throw fault('invalid-frame');
      if (p.operation.type === 'rehost-claim' && outcome.lease.hostGeneration !== p.operation.expectedHostGeneration + 1) throw fault('invalid-frame');
    }
    if (outcome.kind === 'attempt') {
      if (!issued.get(outcome.attemptId)?.has(p)) throw fault('invalid-frame');
      issued.delete(outcome.attemptId); // One issuance can settle only one request.
    }
  }
  function event(payload: RoomServiceEvent) {
    const current = requireSession().snapshot;
    switch (payload.type) {
      case 'roster': {
        if (payload.snapshot.rosterRevision < current.rosterRevision) throw fault('invalid-frame');
        const next = payload.snapshot;
        if (next.hostGeneration > current.hostGeneration && (next.phase === 'lost' || next.phase === 'ended')) {
          if (!compatibleSnapshot(next) || !next.seats[session!.seatId]?.occupied
            || next.seats[session!.seatId]?.seatGeneration !== session!.seatGeneration) throw fault('invalid-frame');
          // A failed activation burns its target generation without a grant.
          // Adopt its fence, rejecting even the matching claim as obsolete.
          invalidateAuthority(next.hostGeneration, false); session!.snapshot = copy(next);
        } else rememberSnapshot(next);
        break;
      }
      case 'host-changed': {
        const next = payload.snapshot;
        if (!compatibleSnapshot(next) || next.hostGeneration !== current.hostGeneration + 1 || next.rosterRevision < current.rosterRevision
          || !validLease(payload.lease, next.hostGeneration, next.hostSeatId)
          || next.seats[session!.seatId]?.seatGeneration !== session!.seatGeneration || !next.seats[session!.seatId]?.occupied) throw fault('invalid-frame');
        invalidateAuthority(next.hostGeneration); session!.snapshot = copy(next); break;
      }
      case 'host-departed':
        if (payload.hostGeneration !== current.hostGeneration) throw fault('invalid-frame');
        invalidateAuthority(current.hostGeneration); session!.snapshot = { ...current, phase: 'lost' }; break;
      case 'lease': case 'started':
        if (!validLease(payload.lease)) throw fault('invalid-frame');
        if (payload.type === 'started') session!.snapshot = { ...current, phase: 'active' }; break;
      case 'checkpoint-status': if (!validMetadata(payload.metadata)) throw fault('invalid-frame'); break;
      case 'start-proposed':
        if (payload.expectedRosterRevision !== current.rosterRevision || payload.expiresAtEpochMs <= clock.nowMs()) throw fault('invalid-frame'); break;
      case 'link-issued': {
        const { identity, role } = payload.link;
        if (identity.roomId !== current.roomId || identity.runId !== current.runId || !sameCompatibility(identity, current.compatibility)
          || identity.hostGeneration !== current.hostGeneration || identity.localConnectionId !== connectionId
          || identity.remoteConnectionId === connectionId || payload.link.ticketExpiresAtEpochMs <= clock.nowMs()
          || (role === 'answerer' ? identity.seatGeneration !== session!.seatGeneration || session!.seatId === current.hostSeatId
            : session!.seatId !== current.hostSeatId || !current.seats.some(s => s.seatId !== current.hostSeatId && s.occupied && s.seatGeneration === identity.seatGeneration))
          || links.size >= 4 || links.has(payload.link.attemptId) || issued.has(payload.link.attemptId)) throw fault('invalid-frame');
        if (role === 'offerer') {
          const eligible = new Set([...pending.values()].filter(p => !p.stale && p.hostGeneration === identity.hostGeneration
            && p.operation.type === 'link-request' && current.seats[p.operation.guestSeatId]?.seatGeneration === identity.seatGeneration));
          if (eligible.size) {
            if (issued.size >= MAX_PENDING) throw fault('invalid-frame');
            issued.set(payload.link.attemptId, eligible);
          }
        }
        links.set(payload.link.attemptId, { identity: copy(identity), role }); break;
      }
      case 'signal': if (!validSignal(payload.signal, false)) throw fault('invalid-frame'); break;
      case 'link-state':
        if (!links.has(payload.attemptId)) throw fault('invalid-frame');
        if (payload.state === 'closed') links.delete(payload.attemptId); break;
      case 'error': break;
    }
    dispatch(payload);
  }
  function validSignal(signal: RtcSignal, outgoing: boolean) {
    const link = links.get(signal.attemptId), identity = link?.identity;
    return !!identity && signal.roomId === identity.roomId && signal.hostGeneration === identity.hostGeneration
      && signal.seatGeneration === identity.seatGeneration
      && signal.from === (outgoing ? identity.localConnectionId : identity.remoteConnectionId)
      && signal.to === (outgoing ? identity.remoteConnectionId : identity.localConnectionId)
      && (signal.kind !== 'description' || signal.description.type === ((link!.role === 'offerer') === outgoing ? 'offer' : 'answer'));
  }
  function receive(data: unknown) {
    const stamp = generation;
    try {
      const envelope = parseServerEnvelope(data);
      if (!envelope || envelope.sequence !== sequence + 1) throw fault('invalid-frame');
      const { payload } = envelope;
      let completedAuth: typeof handshake;
      let completedReply: { id: number; pending: Pending; outcome: ReplyOutcome } | undefined;
      if (!authenticated) {
        if (payload.type !== 'authenticated' || sequence !== 0 || !handshake
          || payload.session.seatId !== session!.seatId || payload.session.seatGeneration !== session!.seatGeneration
          || !validSnapshot(payload.session.snapshot)) throw fault('invalid-frame');
        rememberSnapshot(payload.session.snapshot); authenticated = true;
        completedAuth = handshake;
      } else if (payload.type === 'authenticated') throw fault('invalid-frame');
      else if (payload.type === 'reply') {
        const p = pending.get(payload.requestId);
        if (!p) throw fault('invalid-frame');
        if (!p.stale) validateReply(p, payload.outcome);
        completedReply = { id: payload.requestId, pending: p, outcome: payload.outcome };
      } else event(payload);
      if (closed || stamp !== generation) return;
      sequence = envelope.sequence; send({ type: 'ack', sequence });
      if (completedAuth) {
        handshake = undefined; clock.clearTimeout(completedAuth.timer); completedAuth.resolve(copy(session!.snapshot));
      }
      if (completedReply) {
        const { id, pending: p, outcome } = completedReply;
        pending.delete(id); pendingBytes -= p.bytes; clock.clearTimeout(p.timer); forgetIssuance(p);
        if (!p.stale) {
          if (outcome.kind === 'error') p.reject(new RoomServiceClientError(outcome.error));
          else p.resolve(copy(outcome));
        }
      }
    } catch { if (stamp === generation && !closed) fail('invalid-frame'); }
  }

  async function readBytes(response: Response, max: number, controller: AbortController): Promise<Uint8Array> {
    const length = response.headers.get('Content-Length');
    if (length && (!/^\d+$/.test(length) || Number(length) > max)) throw fault('too-large');
    const reader = response.body?.getReader();
    if (!reader) return new Uint8Array();
    const deadline = http.get(controller)!.deadline;
    const bytes = new Uint8Array(max); let size = 0, reads = 0, emptyReads = 0;
    const check = () => {
      if (clock.nowMs() >= deadline && !controller.signal.aborted) controller.abort(fault('timeout'));
      if (controller.signal.aborted) throw controller.signal.reason;
    };
    const yieldTimers = () => new Promise<void>((resolve, reject) => {
      const abort = () => { clock.clearTimeout(timer); reject(controller.signal.reason); };
      const timer = clock.setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, 0);
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    const cancel = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener('abort', cancel, { once: true });
    try {
      while (true) {
        check();
        const { value, done } = await reader.read();
        check();
        // Workerd epoch clocks also need an I/O turn, even at EOF. A stream of
        // immediate tiny chunks must not starve the single request deadline.
        if (done || ++reads % 64 === 0) { await yieldTimers(); check(); }
        if (done) break;
        if (value.byteLength === 0 && ++emptyReads > 64) throw fault('invalid-frame');
        if (value.byteLength > max - size) throw fault('too-large');
        bytes.set(value, size); size += value.byteLength;
      }
      return bytes.slice(0, size);
    } finally { controller.signal.removeEventListener('abort', cancel); cancel(); try { reader.releaseLock(); } catch {} }
  }
  async function httpRequest<T>(path: string, init: RequestInit, consume: (response: Response, controller: AbortController) => Promise<T>, expected = generation, authorityStamp?: number): Promise<T> {
    assertCurrent(expected, authorityStamp);
    if (http.size + unsettledFactories.size >= 4) throw fault('capacity');
    const controller = new AbortController(), deadline = clock.nowMs() + DEADLINE_MS;
    http.set(controller, { authority: authorityStamp, deadline });
    const check = () => {
      assertCurrent(expected, authorityStamp);
      if (clock.nowMs() >= deadline && !controller.signal.aborted) controller.abort(fault('timeout'));
      if (controller.signal.aborted) throw controller.signal.reason;
    };
    let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
    const timer = clock.setTimeout(() => controller.abort(fault('timeout')), DEADLINE_MS);
    const work = async () => {
      const response = await options.fetch(baseUrl + path, { ...init, redirect: 'error', signal: controller.signal });
      try {
        check();
        if (response.redirected || response.status >= 300 && response.status < 400) throw fault('invalid-frame');
        if (!response.ok) {
          const error = parseJsonBytes(await readBytes(response, ROOM_SMALL_BODY_BYTES, controller), ROOM_SMALL_BODY_BYTES);
          if (!error || typeof error !== 'object' || Object.keys(error).length !== 1 || !('error' in error) || !validateServiceError(error.error)) throw fault('invalid-frame');
          throw new RoomServiceClientError(error.error);
        }
        const value = await consume(response, controller);
        check();
        return value;
      } finally { if (!response.body?.locked) void response.body?.cancel().catch(() => {}); }
    };
    try { return await Promise.race([work(), aborted]); }
    catch (error) { throw error instanceof RoomServiceClientError ? error : fault('unavailable'); }
    finally { clock.clearTimeout(timer); controller.signal.removeEventListener('abort', onAbort); http.delete(controller); }
  }
  function json<T>(path: string, body: unknown, validate: (value: unknown) => value is T, expected = generation, authToken?: string, authorityStamp?: number): Promise<T> {
    return httpRequest(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: 'Bearer ' + authToken } : {}) }, body: JSON.stringify(body) }, async (response, controller) => {
      const value = parseJsonBytes(await readBytes(response, ROOM_SMALL_BODY_BYTES, controller), ROOM_SMALL_BODY_BYTES);
      if (response.status !== 200 || !validate(value)) throw fault('invalid-frame');
      return value;
    }, expected, authorityStamp);
  }
  function adopt(value: SeatSession, compatibility: RoomCompatibility) {
    if (!sameCompatibility(value.snapshot.compatibility, compatibility)) throw fault('invalid-frame');
    const cloned = copy(value); token = cloned.seatToken;
    session = { snapshot: cloned.snapshot, seatId: cloned.seatId, seatGeneration: cloned.seatGeneration };
    return copy(value);
  }
  async function create(compatibility: RoomCompatibility, capacity: number): Promise<SeatSession> {
    if (!validateCompatibility(compatibility) || !Number.isInteger(capacity) || capacity < 1 || capacity > 4) throw fault('invalid-request');
    const stamp = begin(), supplied = copy(compatibility);
    const value = await json('/v2/rooms', { compatibility: supplied, capacity }, validateSeatSession, stamp);
    assertCurrent(stamp);
    if (value.seatId !== 0 || value.snapshot.capacity !== capacity) throw fault('invalid-frame');
    return adopt(value, supplied);
  }
  async function join(code: string, compatibility: RoomCompatibility, seatToken?: string): Promise<SeatSession> {
    if (typeof code !== 'string' || !/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/i.test(code) || !validateCompatibility(compatibility)
      || seatToken !== undefined && !isRoomToken(seatToken)) throw fault('invalid-request');
    const stamp = begin(), supplied = copy(compatibility), normalized = code.toUpperCase();
    const value = await json(`/v2/rooms/${normalized}/join`, { compatibility: supplied }, validateSeatSession, stamp, seatToken);
    assertCurrent(stamp);
    if (value.snapshot.joinCode !== normalized) throw fault('invalid-frame');
    return adopt(value, supplied);
  }
  async function connect(value: SeatSession): Promise<RoomSnapshot> {
    if (!validateSeatSession(value)) throw fault('invalid-request');
    const supplied = copy(value), stamp = begin(); adopt(supplied, supplied.snapshot.compatibility);
    try {
      const ticket = await json(`/v2/rooms/${session!.snapshot.roomId}/socket-ticket`, {}, validateSocketTicket, stamp, token);
      assertCurrent(stamp);
      if (ticket.expiresAtEpochMs <= clock.nowMs()) throw fault('ticket-expired');
      if (http.size + unsettledFactories.size >= 4) throw fault('capacity');
      const controller = new AbortController(); unsettledFactories.add(controller);
      let rejectSocket!: (error: unknown) => void;
      const aborted = new Promise<never>((_, reject) => { rejectSocket = reject; });
      const onAbort = () => rejectSocket(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
      const timer = clock.setTimeout(() => controller.abort(fault('timeout')), Math.min(DEADLINE_MS, ticket.expiresAtEpochMs - clock.nowMs()));
      let produced: RoomServiceSocket;
      try {
        let creating: Promise<RoomServiceSocket>;
        try {
          creating = Promise.resolve(options.createWebSocket(`${wsBase}/v2/rooms/${session!.snapshot.roomId}/socket`)).then(created => {
            if (controller.signal.aborted || closed || stamp !== generation) { try { created.close(); } catch {} throw fault('stale-connection'); }
            return created;
          }).finally(() => { unsettledFactories.delete(controller); });
        } catch (error) { unsettledFactories.delete(controller); throw error; }
        produced = await Promise.race([creating, aborted]);
      } finally { clock.clearTimeout(timer); controller.signal.removeEventListener('abort', onAbort); }
      assertCurrent(stamp);
      socket = produced; connectionId = ticket.connectionId;
      const ready = new Promise<RoomSnapshot>((resolve, reject) => { handshake = { resolve, reject, timer: clock.setTimeout(() => fail('timeout'), Math.min(DEADLINE_MS, ticket.expiresAtEpochMs - clock.nowMs())) }; });
      void ready.catch(() => {});
      const listen = (type: 'open' | 'message' | 'close' | 'error', callback: (event: RoomServiceSocketEvent) => void) => {
        produced.addEventListener(type, callback); removers.push(() => produced.removeEventListener(type, callback));
      };
      let sent = false;
      const auth = () => { if (stamp !== generation || sent) return; sent = true; try { send({ type: 'auth', ticket: ticket.ticket, connectionId: ticket.connectionId }); } catch { fail('unavailable'); } finally { ticket.ticket = ''; } };
      listen('message', e => { if (stamp === generation) receive(e.data); });
      listen('close', () => { if (stamp === generation) fail('unavailable'); });
      listen('error', () => { if (stamp === generation) fail('unavailable'); });
      listen('open', auth);
      if (produced.readyState === 1) auth(); else if (produced.readyState !== 0) fail('unavailable');
      return await ready;
    } catch (error) {
      if (stamp === generation) detach(error instanceof RoomServiceClientError ? error : fault('unavailable'));
      throw error instanceof RoomServiceClientError ? error : fault('unavailable');
    }
  }
  function request<T extends RoomOperation>(operation: T): Promise<RoomReply<T>> {
    try {
      requireSession(); if (!authenticated) throw fault('invalid-state');
      if (pending.size >= MAX_PENDING) throw fault('capacity');
      const text = JSON.stringify({ ...operation, requestId: nextId });
      const frame = parseClientFrame(text);
      if (!frame || !('requestId' in frame) || Object.hasOwn(operation, 'requestId')) throw fault('invalid-request');
      const bytes = utf8.encode(text).byteLength;
      if (pendingBytes + bytes > MAX_PENDING_BYTES) throw fault('capacity');
      if (frame.type === 'signal' && !validSignal(frame.signal, true)) throw fault('stale-generation');
      if (frame.type === 'link-ready' && !links.has(frame.attemptId)) throw fault('stale-generation');
      if (frame.type === 'rehost-claim' && frame.expectedHostGeneration !== session!.snapshot.hostGeneration) throw fault('stale-generation');
      const id = nextId++;
      return new Promise<ReplyOutcome>((resolve, reject) => {
        pending.set(id, { operation: copy(operation), hostGeneration: session!.snapshot.hostGeneration, bytes, stale: false,
          resolve, reject, timer: clock.setTimeout(() => fail('timeout'), DEADLINE_MS) }); pendingBytes += bytes;
        try { send(frame); } catch { fail('unavailable'); }
      }) as Promise<RoomReply<T>>;
    } catch (error) { return Promise.reject(error instanceof RoomServiceClientError ? error : fault('invalid-request')); }
  }
  async function getTurn() {
    const s = requireSession(); if (!authenticated || !connectionId) throw fault('invalid-state');
    const value = await json(`/v2/rooms/${s.snapshot.roomId}/turn`, { connectionId, seatGeneration: s.seatGeneration, hostGeneration: s.snapshot.hostGeneration }, validateTurnCredentials, generation, token, authority);
    if (value.expiresAtEpochMs <= clock.nowMs()) throw fault('invalid-frame');
    return value;
  }
  async function putCheckpoint(metadata: SessionCheckpointMetadata, bytes: Uint8Array): Promise<void> {
    const s = requireSession();
    if (!authenticated || !connectionId) throw fault('invalid-state');
    if (!validateCheckpointMetadata(metadata) || !validMetadata(metadata) || metadata.hostGeneration !== s.snapshot.hostGeneration || s.seatId !== s.snapshot.hostSeatId) throw fault('invalid-request');
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > ROOM_CHECKPOINT_BYTES) throw fault('too-large');
    const header = metadataHeader(metadata); if (header.length > ROOM_CHECKPOINT_METADATA_BYTES) throw fault('too-large');
    if (checkpointBodies >= 2) throw fault('capacity'); checkpointBodies++;
    try {
      await httpRequest(`/v2/rooms/${s.snapshot.roomId}/checkpoint`, { method: 'PUT', headers: { Authorization: 'Bearer ' + token,
        'Content-Type': 'application/octet-stream', 'X-FTL-Checkpoint': header, 'X-FTL-Connection': connectionId, 'X-FTL-Seat-Generation': String(s.seatGeneration) }, body: bytes.slice() }, async response => {
        if (response.status !== 204) throw fault('invalid-frame');
      }, generation, authority);
    } finally { checkpointBodies--; }
  }
  async function getCheckpoint(): Promise<{ metadata: SessionCheckpointMetadata; bytes: Uint8Array }> {
    const s = requireSession();
    if (checkpointBodies >= 2) throw fault('capacity'); checkpointBodies++;
    try {
      return await httpRequest(`/v2/rooms/${s.snapshot.roomId}/checkpoint`, { method: 'GET', headers: { Authorization: 'Bearer ' + token } }, async (response, controller) => {
        if (response.status !== 200 || response.headers.get('Content-Type') !== 'application/octet-stream') throw fault('invalid-frame');
        const metadata = parseMetadata(response.headers.get('X-FTL-Checkpoint'));
        if (!validMetadata(metadata)) throw fault('invalid-frame');
        const bytes = await readBytes(response, ROOM_CHECKPOINT_BYTES, controller);
        if (await digest(bytes) !== metadata.payloadSha256) throw fault('hash-mismatch');
        return { metadata, bytes };
      }, generation);
    } finally { checkpointBodies--; }
  }
  return {
    create, join, connect, request, getTurn, putCheckpoint, getCheckpoint,
    /** Synchronous dispatch allows native start IPC to precede later signal IPC. */
    onEvent(callback: (event: RoomServiceEvent) => void): () => void {
      if (closed) return () => {};
      if (listeners.size >= 64) throw fault('capacity');
      listeners.add(callback); return () => { listeners.delete(callback); };
    },
    close() { if (closed) return; closed = true; detach(fault('stale-connection')); listeners.clear(); },
  };
}
export type RoomServiceClient = ReturnType<typeof createRoomServiceClient>;
