import { expect, it, vi } from 'vitest';
import { createOnlinePeers } from '../src/main/network/onlinePeers';
import { createOnlineIce } from '../src/main/network/onlineIce';
import { sectorCompatibility } from '../src/main/network/onlineSector';
const owner = { roomId: 'a'.repeat(32), hostGeneration: 1, seatId: 1, seatGeneration: 1, connectionId: 'c'.repeat(32) };
const iceDeps = () => ({ ice: { get: async () => ({ iceServers: [], expiresAtEpochMs: Date.now() + 3600000 }), invalidate() {}, dispose() {} }, iceOwner: () => ({ ...owner }) });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
it('reserves attempts synchronously before signals, retains ports until commitment, ignores retired callbacks', async () => {
  const order: string[] = []; let closed!: (id: string) => void; const ready: Record<string, (value: { latestPayloadLimit: number }) => void> = {};
  const ports: any[] = [], lost = vi.fn(), attached = vi.fn();
  const controller: any = { startAttempt: (o: any) => { order.push(o.attemptId); return new Promise(resolve => { ready[o.attemptId] = resolve; }); },
    receiveSignal: async () => { order.push('signal'); }, onSignal: () => () => {}, onAttemptClosed: (cb: any) => { closed = cb; return () => {}; }, closeAttempt: async (id: string) => closed(id) };
  const snapshot: any = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 1, hostSeatId: 0, capacity: 2, compatibility: sectorCompatibility(2),
    seats: [{ seatId: 0, seatGeneration: 1, occupied: true, connected: true }, { seatId: 1, seatGeneration: 1, occupied: true, connected: true }] };
  const peers = createOnlinePeers({ ...iceDeps(), controller, service: { request: async () => ({ kind: 'void' }) } as any, ownSeat: 1, snapshot: () => snapshot,
    channel: () => { const port1 = { close: vi.fn() }, port2 = { close: vi.fn() }; ports.push(port1, port2); return { port1, port2 } as any; }, onReady: attached, onLost: lost, onFailure: lost });
  const link = (attemptId: string) => ({ attemptId, role: 'answerer' as const, identity: { ...snapshot.compatibility, roomId: snapshot.roomId, runId: snapshot.runId,
    hostGeneration: 1, seatGeneration: 1, localConnectionId: 'c'.repeat(32), remoteConnectionId: 'd'.repeat(32) }, localTicket: 'a'.repeat(43), expectedRemoteTicket: 'b'.repeat(43), ticketExpiresAtEpochMs: Date.now() + 10000 });
  peers.issued(link('first')); peers.signal({ attemptId: 'first', seatGeneration: 1, roomId: owner.roomId, hostGeneration: 1, from: 'd'.repeat(32), to: owner.connectionId, kind: 'description', description: { type: 'offer', sdp: 'offer' } }); expect(order).toEqual([]); await flush(); expect(order).toEqual(['first', 'signal']);
  ready.first!({ latestPayloadLimit: 16088 }); await vi.waitFor(() => expect(attached).toHaveBeenCalledOnce());
  peers.issued(link('second')); await flush(); closed('first'); expect(lost).not.toHaveBeenCalled(); expect(ports[1].close).toHaveBeenCalledOnce();
  ready.second!({ latestPayloadLimit: 4096 }); await vi.waitFor(() => expect(attached).toHaveBeenCalledTimes(2));
  closed('second'); expect(lost).toHaveBeenCalledOnce(); await peers.dispose();
});

it('serializes equal-generation host issuance, waits for service route readiness, and tolerates guest issuance loss', async () => {
  let finish!: () => void;
  const requests: number[] = [], fatal = vi.fn(), lost = vi.fn();
  const snapshot: any = { hostSeatId: 0, hostGeneration: 1, capacity: 3, seats: [0, 1, 2].map(seatId => ({ seatId, seatGeneration: 1, occupied: true, connected: true })) };
  let peers!: ReturnType<typeof createOnlinePeers>;
  const link = (seat: number) => ({ attemptId: String(seat), role: 'offerer' as const, ticketExpiresAtEpochMs: Date.now() + 30000, identity: { roomId: owner.roomId, localConnectionId: owner.connectionId, hostGeneration: 1, seatGeneration: 1 } } as any);
  const peersDeps: any = { ...iceDeps(), controller: { startAttempt: async () => ({ latestPayloadLimit: 16088 }), onSignal: () => () => {}, onAttemptClosed: () => () => {}, closeAttempt: async () => {} },
    service: { request: async (op: any) => { if (op.type === 'link-request') { requests.push(op.guestSeatId); peers.issued(link(op.guestSeatId)); if (op.guestSeatId === 1) await new Promise<void>(resolve => { finish = resolve; }); } return {}; } },
    ownSeat: 0, snapshot: () => snapshot, channel: () => ({ port1: { close() {} }, port2: { close() {} } }), onReady: () => {}, onLost: lost, onFailure: fatal };
  peers = createOnlinePeers(peersDeps);
  const reconciling = peers.reconcile(); void peers.reconcile(); await Promise.resolve(); expect(requests).toEqual([1]); finish(); await reconciling;
  await vi.waitFor(() => expect(peers.ready()).toHaveLength(2)); expect(peers.ready().map(p => p.seatId)).toEqual([1, 2]);
  expect(peers.allReady()).toBe(false); peers.serviceReady('1'); peers.serviceReady('2'); expect(peers.allReady()).toBe(true);
  snapshot.seats[1].seatGeneration = 2; expect(peers.allReady()).toBe(false); peersDeps.service.request = async () => { throw { code: 'invalid-state' }; };
  await peers.reconcile(); expect(fatal).not.toHaveBeenCalled(); expect(peers.ready().map(p => p.seatId)).toEqual([2]);
  await peers.dispose();
});

it('bounds forwarded operations and ignores late failed signals after intentional replacement', async () => {
  let signal!: (value: any) => void; const pending: { reject(error: unknown): void }[] = []; const fatal = vi.fn(), lost = vi.fn();
  const snapshot: any = { hostSeatId: 0, hostGeneration: 1, seats: [{ seatGeneration: 1 }, { seatGeneration: 1 }] };
  const controller: any = { startAttempt: () => new Promise(() => {}), onSignal: (cb: any) => { signal = cb; return () => {}; }, onAttemptClosed: () => () => {}, closeAttempt: async () => {} };
  const peers = createOnlinePeers({ ...iceDeps(), controller, service: { request: () => new Promise((_, reject) => pending.push({ reject })) } as any,
    ownSeat: 1, snapshot: () => snapshot, channel: () => ({ port1: { close() {} }, port2: { close() {} } }) as any, onReady: () => {}, onLost: lost, onFailure: fatal });
  const link = (attemptId: string) => ({ attemptId, role: 'answerer', ticketExpiresAtEpochMs: Date.now() + 30000, identity: { roomId: owner.roomId, localConnectionId: owner.connectionId, hostGeneration: 1, seatGeneration: 1 } } as any);
  peers.issued(link('old')); signal({ attemptId: 'old', seatGeneration: 1 }); peers.issued(link('new'));
  pending[0]!.reject({ code: 'stale-generation' }); await Promise.resolve(); await Promise.resolve(); expect(fatal).not.toHaveBeenCalled(); expect(lost).not.toHaveBeenCalled();
  for (let i = 0; i < 65; i++) signal({ attemptId: 'new', seatGeneration: 1 }); expect(fatal).toHaveBeenCalledOnce(); await peers.dispose();
});

function issuanceRace(capacity: number) {
  let finish!: () => void, reject!: (error: unknown) => void;
  const pending = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
  const requests: number[] = [], lost = vi.fn(), fatal = vi.fn();
  const snapshot: any = { hostSeatId: 0, hostGeneration: 1, capacity, seats: Array.from({ length: capacity }, (_, seatId) =>
    ({ seatId, seatGeneration: 1, occupied: true, connected: true })) };
  let peers!: ReturnType<typeof createOnlinePeers>;
  const service: any = { request: async (op: any) => {
    if (op.type !== 'link-request') return {};
    requests.push(op.guestSeatId);
    peers.issued({ attemptId: `${op.guestSeatId}-${snapshot.seats[op.guestSeatId].seatGeneration}`, role: 'offerer', ticketExpiresAtEpochMs: Date.now() + 30000,
      identity: { roomId: owner.roomId, localConnectionId: owner.connectionId, hostGeneration: 1, seatGeneration: snapshot.seats[op.guestSeatId].seatGeneration } } as any);
    if (requests.length === 1) await pending;
    return {};
  } };
  peers = createOnlinePeers({ ...iceDeps(), controller: { startAttempt: async () => ({ latestPayloadLimit: 16088 }), onSignal: () => () => {},
    onAttemptClosed: () => () => {}, closeAttempt: async () => {} } as any, service, ownSeat: 0, snapshot: () => snapshot,
    channel: () => ({ port1: { close() {} }, port2: { close() {} } }) as any, onReady: () => {}, onLost: lost, onFailure: fatal });
  return { peers, snapshot, requests, service, lost, fatal, finish, reject };
}

it('drains a newer seat generation observed while its previous issuance is pending', async () => {
  const h = issuanceRace(2), reconciling = h.peers.reconcile();
  h.snapshot.seats[1].seatGeneration = 2; await h.peers.reconcile();
  expect(h.requests).toEqual([1]); h.finish(); await reconciling;
  expect(h.requests).toEqual([1, 1]);
  await vi.waitFor(() => expect(h.peers.ready().map(peer => [peer.seatId, peer.seatGeneration])).toEqual([[1, 2]]));
  expect(h.fatal).not.toHaveBeenCalled(); await h.peers.dispose();
});

it('continues to a healthy seat when an earlier guest departs during issuance', async () => {
  const h = issuanceRace(3), reconciling = h.peers.reconcile();
  h.snapshot.seats[1].connected = false; await h.peers.reconcile();
  h.reject({ code: 'invalid-state' }); await reconciling;
  expect(h.requests).toEqual([1, 2]); await vi.waitFor(() => expect(h.peers.ready().map(peer => peer.seatId)).toEqual([2]));
  expect(h.fatal).not.toHaveBeenCalled(); await h.peers.dispose();
});

it('does not immediately reissue an unchanged failing seat when reconciliation is requested during failure', async () => {
  const h = issuanceRace(2); let attempts = 0;
  h.service.request = async () => { attempts++; if (attempts > 4) throw Error('retry-loop'); throw { code: 'invalid-state' }; };
  h.lost.mockImplementation(() => { if (attempts <= 4) void h.peers.reconcile(); });
  await h.peers.reconcile(); await new Promise<void>(resolve => setImmediate(resolve));
  expect(attempts).toBe(1); expect(h.lost).toHaveBeenCalledOnce(); expect(h.fatal).not.toHaveBeenCalled(); await h.peers.dispose();
});

function pendingIce() {
  let now = 0, identity = { ...owner }, finish!: (v: any) => void;
  const provider = vi.fn(() => new Promise<any>(resolve => { finish = resolve; }));
  const clock = { nowMs: () => now, epochMs: () => now };
  const ice = createOnlineIce({ service: { getTurn: provider }, clock, mode: 'turn' });
  const jobs = new Map<number, { at: number; cb(): void }>(); let next = 0;
  const scheduler = { setTimeout(cb: () => void, ms: number) { jobs.set(++next, { at: now + ms, cb }); return next; }, clearTimeout(id: unknown) { jobs.delete(id as number); } };
  const starts: any[] = [], delivered: any[] = [], order: string[] = [], lost = vi.fn(), failure = vi.fn(), ports: any[] = [];
  const controller: any = { startAttempt: (o: any) => { starts.push(o); order.push('start'); return new Promise(() => {}); },
    receiveSignal: async (s: any) => { delivered.push(s); order.push('signal'); }, onSignal: () => () => {}, onAttemptClosed: () => () => {}, closeAttempt: vi.fn(async () => {}) };
  const snapshot: any = { hostSeatId: 0, hostGeneration: 1, capacity: 2, seats: [0, 1].map(seatId => ({ seatId, seatGeneration: 1, occupied: true, connected: true })) };
  const peers = createOnlinePeers({ controller, service: { request: async () => ({}) } as any, ice, iceOwner: () => identity, clock, scheduler, ownSeat: 1, snapshot: () => snapshot,
    channel: () => { const pair = { port1: { close: vi.fn() }, port2: { close: vi.fn() } }; ports.push(pair); return pair as any; }, onReady() {}, onLost: lost, onFailure: failure });
  const link = (attemptId = 'first') => ({ attemptId, role: 'answerer' as const, identity: { ...sectorCompatibility(2), roomId: owner.roomId, runId: 'b'.repeat(32), hostGeneration: 1, seatGeneration: 1, localConnectionId: owner.connectionId, remoteConnectionId: 'd'.repeat(32) }, localTicket: 'x', expectedRemoteTicket: 'y', ticketExpiresAtEpochMs: 60000 });
  const signal = (candidate?: string) => ({ attemptId: 'first', roomId: owner.roomId, seatGeneration: 1, hostGeneration: 1, from: 'd'.repeat(32), to: owner.connectionId,
    ...(candidate === undefined ? { kind: 'description', description: { type: 'offer', sdp: 'offer' } } : { kind: 'candidate', candidate: { candidate } }) }) as any;
  return { peers, provider, starts, delivered, order, lost, failure, ports, controller, jobs, link, signal,
    changeOwner() { identity = { ...owner, connectionId: 'e'.repeat(32) }; },
    finish() { finish({ iceServers: [{ urls: ['turn:example.test:3478'], username: 'user', credential: 'test' }], expiresAtEpochMs: now + 3600000 }); },
    advance(ms: number) { now += ms; for (const [id, job] of jobs) if (job.at <= now) { jobs.delete(id); job.cb(); } },
    async dispose() { await peers.dispose(); ice.dispose(); } };
}
it('buffers signals until native registration, uses all candidate routes, and includes acquisition in the original setup deadline', async () => {
  const h = pendingIce(); h.peers.issued(h.link()); h.peers.signal(h.signal()); h.peers.signal(h.signal('candidate')); expect(h.starts).toHaveLength(0);
  h.advance(20000); h.finish(); await flush(); expect(h.order).toEqual(['start', 'signal', 'signal']);
  expect(h.starts[0]).toMatchObject({ iceServers: [{ credential: 'test' }], iceTransportPolicy: 'all', ticketExpiresAtEpochMs: 30000 });
  h.advance(9999); expect(h.lost).not.toHaveBeenCalled(); h.advance(1); expect(h.lost).toHaveBeenCalledOnce(); expect(h.jobs.size).toBe(0); await h.dispose();
});
it('rejects stale credentials before native start when the authenticated owner changes', async () => {
  const h = pendingIce(); h.peers.issued(h.link()); h.changeOwner(); h.finish(); await flush(); expect(h.starts).toHaveLength(0); expect(h.lost).toHaveBeenCalledOnce(); await h.dispose();
});
it('retires the pending slot and both ports on deadline without starting late credentials', async () => {
  const h = pendingIce(); h.peers.issued(h.link()); h.advance(30000); h.finish(); await flush(); expect(h.starts).toHaveLength(0);
  expect(h.ports[0].port1.close).toHaveBeenCalledOnce(); expect(h.ports[0].port2.close).toHaveBeenCalledOnce(); await h.dispose();
});
it.each(['pre-description', 'total', 'sdp', 'envelope-bytes'] as const)('closes pending attempt on %s overflow before native setup', async limit => {
  const h = pendingIce(); h.peers.issued(h.link());
  if (limit === 'sdp') { const s = h.signal(); s.description.sdp = 'x'.repeat(65537); h.peers.signal(s); }
  else {
    if (limit !== 'pre-description') h.peers.signal(h.signal());
    const count = limit === 'pre-description' ? 65 : 129;
    let sent = 0;
    for (; sent < count && !h.lost.mock.calls.length; sent++) h.peers.signal(h.signal(limit === 'envelope-bytes' ? '\u0001'.repeat(4096) : 'candidate'));
    expect(sent).toBe(limit === 'envelope-bytes' ? 43 : count);
  }
  expect(h.lost).toHaveBeenCalledOnce(); h.finish(); await flush(); expect(h.starts).toHaveLength(0); await h.dispose();
});
it('explicitly closes unknown stale attempts without forwarding their signal', async () => {
  const h = pendingIce(); h.peers.signal(h.signal()); expect(h.controller.closeAttempt).toHaveBeenCalledWith('first'); expect(h.delivered).toHaveLength(0); await h.dispose();
});
it('coalesces the hosts three simultaneous guest routes into one authenticated credential acquisition', async () => {
  const h = pendingIce(); await h.dispose();
  let resolve!: (v: any) => void; const getTurn = vi.fn(() => new Promise<any>(r => { resolve = r; }));
  const ice = createOnlineIce({ service: { getTurn }, clock: { nowMs: () => 0, epochMs: () => Date.now() }, mode: 'turn' });
  const snapshot: any = { hostSeatId: 0, hostGeneration: 1, capacity: 4, seats: [0, 1, 2, 3].map(seatId => ({ seatId, occupied: true, connected: true, seatGeneration: 1 })) };
  const starts: any[] = []; let peers!: ReturnType<typeof createOnlinePeers>;
  peers = createOnlinePeers({ ice, iceOwner: () => ({ ...owner, seatId: 0 }), ownSeat: 0, snapshot: () => snapshot,
    service: { request: async (op: any) => { if (op.type === 'link-request') peers.issued({ ...h.link(String(op.guestSeatId)), role: 'offerer', ticketExpiresAtEpochMs: Date.now() + 30000 }); } } as any,
    controller: { startAttempt: async (o: any) => { starts.push(o); return { latestPayloadLimit: 16088 }; }, onSignal: () => () => {}, onAttemptClosed: () => () => {}, closeAttempt: async () => {} } as any,
    channel: () => ({ port1: { close() {} }, port2: { close() {} } }) as any, onReady() {}, onLost() {}, onFailure() {} });
  await peers.reconcile(); expect(getTurn).toHaveBeenCalledOnce(); expect(starts).toHaveLength(0);
  resolve({ iceServers: [{ urls: ['turn:example.test:3478'], credential: 'test', username: 'test' }], expiresAtEpochMs: Date.now() + 3600000 }); await flush();
  expect(starts).toHaveLength(3); await peers.dispose(); ice.dispose();
});
it('does not reissue a failed quota acquisition from a reentrant reconciliation callback', async () => {
  let peers!: ReturnType<typeof createOnlinePeers>; const request = vi.fn(async (op: any) => { if (op.type === 'link-request') peers.issued({ attemptId: 'first', role: 'offerer', identity: { roomId: owner.roomId, hostGeneration: 1, seatGeneration: 1, localConnectionId: owner.connectionId }, ticketExpiresAtEpochMs: Date.now() + 30000 } as any); });
  const snapshot: any = { hostSeatId: 0, hostGeneration: 1, capacity: 2, seats: [0, 1].map(seatId => ({ seatId, occupied: true, connected: true, seatGeneration: 1 })) };
  peers = createOnlinePeers({ ...iceDeps(), ice: { get: async () => { throw { code: 'rate-limited', retryable: true, retryAfterMs: 60000 }; }, invalidate() {}, dispose() {} },
    controller: { onSignal: () => () => {}, onAttemptClosed: () => () => {}, closeAttempt: async () => {} } as any, service: { request } as any,
    ownSeat: 0, snapshot: () => snapshot, channel: () => ({ port1: { close() {} }, port2: { close() {} } }) as any, onReady() {}, onLost() {}, onFailure: () => { void peers.reconcile(); } });
  await peers.reconcile(); await flush(); expect(request).toHaveBeenCalledOnce(); await peers.dispose();
});
