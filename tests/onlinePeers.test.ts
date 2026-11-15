import { expect, it, vi } from 'vitest';
import { createOnlinePeers } from '../src/main/network/onlinePeers';
import { sectorCompatibility } from '../src/main/network/onlineSector';
it('registers native attempts synchronously before signals, retains ports until commitment, ignores retired callbacks', async () => {
  const order: string[] = []; let closed!: (id: string) => void; const ready: Record<string, (value: { latestPayloadLimit: number }) => void> = {};
  const ports: any[] = [], lost = vi.fn(), attached = vi.fn();
  const controller: any = { startAttempt: (o: any) => { order.push(o.attemptId); return new Promise(resolve => { ready[o.attemptId] = resolve; }); },
    receiveSignal: async () => { order.push('signal'); }, onSignal: () => () => {}, onAttemptClosed: (cb: any) => { closed = cb; return () => {}; }, closeAttempt: async (id: string) => closed(id) };
  const snapshot: any = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 1, hostSeatId: 0, capacity: 2, compatibility: sectorCompatibility(2),
    seats: [{ seatId: 0, seatGeneration: 1, occupied: true, connected: true }, { seatId: 1, seatGeneration: 1, occupied: true, connected: true }] };
  const peers = createOnlinePeers({ controller, service: { request: async () => ({ kind: 'void' }) } as any, ownSeat: 1, snapshot: () => snapshot,
    channel: () => { const port1 = { close: vi.fn() }, port2 = { close: vi.fn() }; ports.push(port1, port2); return { port1, port2 } as any; }, onReady: attached, onLost: lost, onFailure: lost });
  const link = (attemptId: string) => ({ attemptId, role: 'answerer' as const, identity: { ...snapshot.compatibility, roomId: snapshot.roomId, runId: snapshot.runId,
    hostGeneration: 1, seatGeneration: 1, localConnectionId: 'c'.repeat(32), remoteConnectionId: 'd'.repeat(32) }, localTicket: 'a'.repeat(43), expectedRemoteTicket: 'b'.repeat(43), ticketExpiresAtEpochMs: Date.now() + 10000 });
  peers.issued(link('first')); peers.signal({ attemptId: 'first', seatGeneration: 1 } as any); expect(order).toEqual(['first', 'signal']);
  ready.first!({ latestPayloadLimit: 16088 }); await vi.waitFor(() => expect(attached).toHaveBeenCalledOnce());
  peers.issued(link('second')); closed('first'); expect(lost).not.toHaveBeenCalled(); expect(ports[1].close).toHaveBeenCalledOnce();
  ready.second!({ latestPayloadLimit: 4096 }); await vi.waitFor(() => expect(attached).toHaveBeenCalledTimes(2));
  closed('second'); expect(lost).toHaveBeenCalledOnce(); await peers.dispose();
});

it('serializes equal-generation host issuance, waits for service route readiness, and tolerates guest issuance loss', async () => {
  let finish!: () => void;
  const requests: number[] = [], fatal = vi.fn(), lost = vi.fn();
  const snapshot: any = { hostSeatId: 0, hostGeneration: 1, capacity: 3, seats: [0, 1, 2].map(seatId => ({ seatId, seatGeneration: 1, occupied: true, connected: true })) };
  let peers!: ReturnType<typeof createOnlinePeers>;
  const link = (seat: number) => ({ attemptId: String(seat), role: 'offerer' as const, identity: { hostGeneration: 1, seatGeneration: 1 } } as any);
  const peersDeps: any = { controller: { startAttempt: async () => ({ latestPayloadLimit: 16088 }), onSignal: () => () => {}, onAttemptClosed: () => () => {}, closeAttempt: async () => {} },
    service: { request: async (op: any) => { if (op.type === 'link-request') { requests.push(op.guestSeatId); peers.issued(link(op.guestSeatId)); if (op.guestSeatId === 1) await new Promise<void>(resolve => { finish = resolve; }); } return {}; } },
    ownSeat: 0, snapshot: () => snapshot, channel: () => ({ port1: { close() {} }, port2: { close() {} } }), onReady: () => {}, onLost: lost, onFailure: fatal };
  peers = createOnlinePeers(peersDeps);
  const reconciling = peers.reconcile(); void peers.reconcile(); await Promise.resolve(); expect(requests).toEqual([1]); finish(); await reconciling;
  await vi.waitFor(() => expect(peers.ready()).toHaveLength(2)); expect(peers.ready().map(p => p.seatId)).toEqual([1, 2]);
  expect(peers.allReady()).toBe(false); peers.serviceReady('1'); peers.serviceReady('2'); expect(peers.allReady()).toBe(true);
  snapshot.seats[1].seatGeneration = 2; peersDeps.service.request = async () => { throw { code: 'invalid-state' }; };
  await peers.reconcile(); expect(fatal).not.toHaveBeenCalled(); expect(peers.ready().map(p => p.seatId)).toEqual([2]);
  await peers.dispose();
});

it('bounds forwarded operations and ignores late failed signals after intentional replacement', async () => {
  let signal!: (value: any) => void; const pending: { reject(error: unknown): void }[] = []; const fatal = vi.fn(), lost = vi.fn();
  const snapshot: any = { hostSeatId: 0, hostGeneration: 1, seats: [{ seatGeneration: 1 }, { seatGeneration: 1 }] };
  const controller: any = { startAttempt: () => new Promise(() => {}), onSignal: (cb: any) => { signal = cb; return () => {}; }, onAttemptClosed: () => () => {}, closeAttempt: async () => {} };
  const peers = createOnlinePeers({ controller, service: { request: () => new Promise((_, reject) => pending.push({ reject })) } as any,
    ownSeat: 1, snapshot: () => snapshot, channel: () => ({ port1: { close() {} }, port2: { close() {} } }) as any, onReady: () => {}, onLost: lost, onFailure: fatal });
  const link = (attemptId: string) => ({ attemptId, role: 'answerer', identity: { hostGeneration: 1, seatGeneration: 1 } } as any);
  peers.issued(link('old')); signal({ attemptId: 'old', seatGeneration: 1 }); peers.issued(link('new'));
  pending[0]!.reject({ code: 'stale-generation' }); await Promise.resolve(); await Promise.resolve(); expect(fatal).not.toHaveBeenCalled(); expect(lost).not.toHaveBeenCalled();
  for (let i = 0; i < 65; i++) signal({ attemptId: 'new', seatGeneration: 1 }); expect(fatal).toHaveBeenCalledOnce(); await peers.dispose();
});
