import { vi } from 'vitest';
import { createOnlineSession } from '../../src/network/online/onlineSession';
import { initialOnlineCheckpoint } from './onlineCheckpoint';
import { sectorCompatibility } from '../../src/network/online/onlineSector';
import type { RoomServiceEvent } from '../../src/network/session/serviceClient';
export function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
export function harness(capacity = 1, ownSeat = 0, monotonicOrigin = 0, serviceOrigin = 'http://127.0.0.1:8787',
  scheduler: { setTimeout(cb: () => void, ms: number): unknown; clearTimeout(id: unknown): void } = { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: id => clearTimeout(id as never) }) {
  const events = new Set<(event: RoomServiceEvent) => void>(); const order: string[] = [], ports: any[] = [];
  let snapshot: any = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), joinCode: 'ABCDEFGH', compatibility: sectorCompatibility(capacity), capacity,
    hostSeatId: 0, hostGeneration: 1, phase: 'lobby', rosterRevision: 1, seats: Array.from({ length: capacity }, (_, seatId) => ({ seatId, seatGeneration: 1, occupied: true, connected: true, ready: false })) };
  const session = () => ({ snapshot: structuredClone(snapshot), seatId: ownSeat, seatGeneration: snapshot.seats[ownSeat].seatGeneration, seatToken: 't'.repeat(43) });
  let committed: any, serverMirror: any = null, diskMirror: any = null; const emit = (event: any) => { for (const cb of [...events]) cb(event); };
  const service: any = { connectionIdentity: () => ({ roomId: snapshot.roomId, hostGeneration: snapshot.hostGeneration, seatId: ownSeat, seatGeneration: snapshot.seats[ownSeat].seatGeneration, connectionId: 'c'.repeat(32) }), getTurn: vi.fn(async () => ({ iceServers: [{ urls: ['turn:example.test:3478'], credential: 'test', username: 'test' }], expiresAtEpochMs: Date.now() + 3600000 })), putCheckpoint: vi.fn(async (metadata: any, bytes: Uint8Array) => { serverMirror = structuredClone({ metadata, bytes }); }), getCheckpoint: vi.fn(async () => { if (!serverMirror) throw { code: 'no-checkpoint' }; return structuredClone(serverMirror); }), create: vi.fn(async () => { order.push('create'); return session(); }), join: vi.fn(async () => session()), connect: vi.fn(async () => { order.push('connect'); return structuredClone(snapshot); }), close: vi.fn(),
    onEvent: (cb: any) => { events.add(cb); return () => events.delete(cb); }, request: vi.fn(async (op: any) => {
      order.push(op.type);
      if (op.type === 'ready') { snapshot = { ...snapshot, rosterRevision: snapshot.rosterRevision + 1, seats: snapshot.seats.map((s: any) => s.seatId === ownSeat ? { ...s, ready: op.ready } : s) }; return { kind: 'snapshot', snapshot }; }
      if (op.type === 'start-propose') { committed = { initBase64: op.initBase64, initHash: op.initHash, lease: { roomId: snapshot.roomId, hostGeneration: 1, hostSeatId: 0, nonce: 'd'.repeat(32), expiresAtEpochMs: Date.now() + 12000 } }; return { kind: 'proposal', proposalId: 'e'.repeat(32) }; }
      if (op.type === 'start-commit') { snapshot.phase = 'active'; emit({ type: 'started', ...committed }); return { kind: 'started', ...committed }; }
      if (op.type === 'lease-renew') return { kind: 'lease', lease: { ...committed.lease, nonce: op.nonce, expiresAtEpochMs: Date.now() + 12000 } };
      return { kind: 'void' };
    }) };
  let saved: any = null;
  const store = { load: vi.fn(async () => saved), save: vi.fn(async (seat: any) => { order.push('save'); saved = seat; }), clear: vi.fn(async () => { saved = null; }) };
  const mirrorStore = { load: vi.fn(async () => diskMirror), save: vi.fn(async (value: any) => { diskMirror = structuredClone(value); }), clear: vi.fn(async () => { diskMirror = null; }) };
  let capture = (_candidate: any) => {}, renewal = (_request: any) => {}, leaseIdentity: any, latestCapture: any, renewalTimer: ReturnType<typeof setInterval> | undefined;
  let nativeClosed = (_id: string) => {}, transportExit = () => {}, hostExit = (_reason: string) => {};
  const controller: any = { onSignal: () => () => {}, onAttemptClosed: (cb: any) => { nativeClosed = cb; return () => {}; }, closeAttempt: vi.fn(async () => {}), dispose: vi.fn(async () => {}), startAttempt: vi.fn(async () => ({ latestPayloadLimit: 16088 })), receiveSignal: vi.fn(async () => {}) };
  const transport = { controller, onExit: vi.fn((cb: () => void) => { transportExit = cb; return () => {}; }), dispose: vi.fn(async () => {}) };
  const host = { onCheckpoint: vi.fn((cb: any) => { capture = cb; return () => { capture = () => {}; }; }), ackCheckpoint: vi.fn(async () => {}),
    captureCheckpoint: vi.fn(async () => { const next = { ...latestCapture, captureId: latestCapture.captureId + 1, cause: 'exit' }; latestCapture = next; capture(next); return next; }),
    onLeaseRequest: (cb: any) => { renewal = cb; cb({ ...leaseIdentity, nonce: '8'.repeat(32) }); renewalTimer = setInterval(() => cb({ ...leaseIdentity, nonce: '9'.repeat(32) }), 5000); return () => { clearInterval(renewalTimer); }; },
    applyLease: vi.fn(async (_request: any, _grant: any) => {}), invalidateLease: vi.fn(async () => {}), completeBootstrap: vi.fn(async () => {}), transport: controller,
    request: vi.fn(async (request: any) => { latestCapture = initialOnlineCheckpoint(JSON.parse(new TextDecoder().decode(request.initBytes))); capture(latestCapture); return { ok: true as const, requestId: 1, hostGeneration: 1 }; }),
    attachPeer: vi.fn(async () => {}), onExit: vi.fn((cb: (reason: string) => void) => { hostExit = cb; return () => {}; }), dispose: vi.fn(async () => { clearInterval(renewalTimer); }) };
  const platform = { startLeasedHost: vi.fn(async (_identity: any, _signal: AbortSignal, lease: any) => { leaseIdentity = lease; return host; }), createTransport: vi.fn(async () => transport), channel: () => { const port1 = { close: vi.fn() }, port2 = { close: vi.fn() }; ports.push(port1, port2); return { port1, port2 } as any; }, publishPort: vi.fn(), onVisibleGone: () => () => {} };
  const owner = createOnlineSession({ config: { enabled: true, baseUrl: serviceOrigin, allowInsecureLocalhost: serviceOrigin.startsWith('http:'), iceMode: serviceOrigin.startsWith('http:') ? 'loopback' : 'turn' }, seatStore: store, mirrorStore,
    service: () => service, platform, clock: { nowMs: () => Date.now() - monotonicOrigin, epochMs: () => Date.now() }, scheduler, nonce: () => 'f'.repeat(32), sectorTestEntry: true });
  const savedSeat = () => ({ version: 1, serviceOrigin: 'http://127.0.0.1:8787', roomId: snapshot.roomId, joinCode: snapshot.joinCode, compatibility: snapshot.compatibility, seatId: ownSeat, seatGeneration: 1, seatToken: 't'.repeat(43) });
  const issue = (attemptId = '1'.repeat(32), guestSeatId = ownSeat === 0 ? 1 : ownSeat, hostGeneration = 1) => emit({ type: 'link-issued', link: { attemptId, role: ownSeat === 0 ? 'offerer' : 'answerer',
    identity: { ...snapshot.compatibility, roomId: snapshot.roomId, runId: snapshot.runId, hostGeneration, seatGeneration: snapshot.seats[guestSeatId].seatGeneration,
      localConnectionId: 'c'.repeat(32), remoteConnectionId: 'd'.repeat(32) }, localTicket: 'x'.repeat(43), expectedRemoteTicket: 'y'.repeat(43), ticketExpiresAtEpochMs: Date.now() + 30000 } });
  return { owner, service, store, mirrorStore, capture: (value: any) => capture(value), renewal: (nonce: string) => renewal({ ...leaseIdentity, nonce }), platform, host, transport, controller, order, ports, emit, issue, savedSeat, snapshot, session,
    nativeClosed: (id: string) => nativeClosed(id), transportExit: () => transportExit(), hostExit: () => hostExit('exit'), setSaved: (s: any) => { saved = s; } };
}
