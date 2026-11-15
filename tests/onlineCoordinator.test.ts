import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOnlineSession } from '../src/main/network/onlineSession';
import { sectorCompatibility } from '../src/main/network/onlineSector';
import type { RoomServiceEvent } from '../src/network/session/serviceClient';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function harness(capacity = 1, ownSeat = 0) {
  const events = new Set<(event: RoomServiceEvent) => void>(); const order: string[] = [], ports: any[] = [];
  let snapshot: any = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), joinCode: 'ABCDEFGH', compatibility: sectorCompatibility(capacity), capacity,
    hostSeatId: 0, hostGeneration: 1, phase: 'lobby', rosterRevision: 1, seats: Array.from({ length: capacity }, (_, seatId) => ({ seatId, seatGeneration: 1, occupied: true, connected: true, ready: false })) };
  const session = () => ({ snapshot: structuredClone(snapshot), seatId: ownSeat, seatGeneration: snapshot.seats[ownSeat].seatGeneration, seatToken: 't'.repeat(43) });
  let committed: any; const emit = (event: any) => { for (const cb of [...events]) cb(event); };
  const service: any = { create: vi.fn(async () => { order.push('create'); return session(); }), join: vi.fn(async () => session()), connect: vi.fn(async () => { order.push('connect'); return structuredClone(snapshot); }), close: vi.fn(),
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
  let nativeClosed = (_id: string) => {}, transportExit = () => {}, hostExit = (_reason: string) => {};
  const controller: any = { onSignal: () => () => {}, onAttemptClosed: (cb: any) => { nativeClosed = cb; return () => {}; }, closeAttempt: vi.fn(async () => {}), dispose: vi.fn(async () => {}), startAttempt: vi.fn(async () => ({ latestPayloadLimit: 16088 })), receiveSignal: vi.fn(async () => {}) };
  const transport = { controller, onExit: vi.fn((cb: () => void) => { transportExit = cb; return () => {}; }), dispose: vi.fn(async () => {}) };
  const host = { transport: controller, request: vi.fn(async () => ({ ok: true as const, requestId: 1, hostGeneration: 1 })), attachPeer: vi.fn(async () => {}), onExit: vi.fn((cb: (reason: string) => void) => { hostExit = cb; return () => {}; }), dispose: vi.fn(async () => {}) };
  const platform = { createTransport: vi.fn(async () => transport), startHost: vi.fn(async () => host), channel: () => { const port1 = { close: vi.fn() }, port2 = { close: vi.fn() }; ports.push(port1, port2); return { port1, port2 } as any; }, publishPort: vi.fn(), onVisibleGone: () => () => {} };
  const owner = createOnlineSession({ config: { enabled: true, baseUrl: 'http://127.0.0.1:8787', allowInsecureLocalhost: true }, seatStore: store,
    service: () => service, platform, clock: { nowMs: () => Date.now(), epochMs: () => Date.now() }, scheduler: { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: id => clearTimeout(id as any) }, nonce: () => 'f'.repeat(32) });
  const savedSeat = () => ({ version: 1, serviceOrigin: 'http://127.0.0.1:8787', roomId: snapshot.roomId, joinCode: snapshot.joinCode, compatibility: snapshot.compatibility, seatId: ownSeat, seatGeneration: 1, seatToken: 't'.repeat(43) });
  const issue = (attemptId = '1'.repeat(32), guestSeatId = ownSeat === 0 ? 1 : ownSeat) => emit({ type: 'link-issued', link: { attemptId, role: ownSeat === 0 ? 'offerer' : 'answerer',
    identity: { ...snapshot.compatibility, roomId: snapshot.roomId, runId: snapshot.runId, hostGeneration: 1, seatGeneration: snapshot.seats[guestSeatId].seatGeneration,
      localConnectionId: 'c'.repeat(32), remoteConnectionId: 'd'.repeat(32) }, localTicket: 'x'.repeat(43), expectedRemoteTicket: 'y'.repeat(43), ticketExpiresAtEpochMs: Date.now() + 30000 } });
  return { owner, service, store, platform, host, transport, controller, order, ports, emit, issue, savedSeat, snapshot, session,
    nativeClosed: (id: string) => nativeClosed(id), transportExit: () => transportExit(), hostExit: () => hostExit('exit'), setSaved: (s: any) => { saved = s; } };
}
afterEach(() => vi.useRealTimers());
describe('online coordinator ownership', () => {
  it('publishes Start capability only after human, native and service readiness and revokes it on loss or generation replacement', async () => {
    const h = harness(2), native = deferred<any>(); let attempt = '1'.repeat(32);
    h.controller.startAttempt.mockReturnValue(native.promise);
    const original = h.service.request.getMockImplementation();
    h.service.request.mockImplementation(async (op: any) => { if (op.type === 'link-request') { h.issue(attempt); return { kind: 'attempt', attemptId: attempt }; } return original(op); });
    await h.owner.dispatch({ type: 'host', capacity: 2 }); expect(h.owner.status().actions).not.toContain('start');
    h.snapshot.seats.forEach((seat: any) => { seat.ready = true; }); h.emit({ type: 'roster', snapshot: h.snapshot });
    expect(h.owner.status().actions).not.toContain('start');
    native.resolve({ latestPayloadLimit: 16088 }); await vi.waitFor(() => expect(h.order).toContain('link-ready'));
    expect(h.owner.status().actions).not.toContain('start');
    const pushed: boolean[] = []; const off = h.owner.subscribe(s => { pushed.push(s.actions.includes('start')); });
    h.emit({ type: 'link-state', attemptId: attempt, state: 'ready' }); expect(h.owner.status().actions).toContain('start'); expect(pushed.at(-1)).toBe(true);
    h.nativeClosed(attempt); expect(h.owner.status().actions).not.toContain('start'); expect(pushed.at(-1)).toBe(false);
    attempt = '2'.repeat(32); h.snapshot.rosterRevision++; h.emit({ type: 'roster', snapshot: h.snapshot });
    await vi.waitFor(() => expect(h.controller.startAttempt).toHaveBeenCalledTimes(2)); h.emit({ type: 'link-state', attemptId: attempt, state: 'ready' });
    await vi.waitFor(() => expect(h.owner.status().actions).toContain('start'));
    attempt = '3'.repeat(32); h.snapshot.seats[1].seatGeneration++; h.snapshot.rosterRevision++; h.emit({ type: 'roster', snapshot: h.snapshot });
    expect(h.owner.status().actions).not.toContain('start'); h.emit({ type: 'link-state', attemptId: '2'.repeat(32), state: 'ready' }); expect(h.owner.status().actions).not.toContain('start');
    off(); await h.owner.dispose();
  });
  it('offers Reconnect only after a saved seat is known', async () => {
    const h = harness(); await Promise.resolve(); expect(h.owner.status().actions).not.toContain('reconnect');
    await h.owner.dispatch({ type: 'host', capacity: 1 }); await h.owner.dispatch({ type: 'leave' }); expect(h.owner.status().actions).toContain('reconnect');
    await h.owner.dispatch({ type: 'forget-seat' }); expect(h.owner.status().actions).not.toContain('reconnect'); await h.owner.dispose();
  });
  it('persists before connect/lobby; creates exactly one utility after duplicate commitment and keeps display hints powerless', async () => {
    const h = harness(); expect(await h.owner.dispatch({ type: 'host', capacity: 1 })).toEqual({ ok: true });
    expect(h.order.slice(0, 3)).toEqual(['create', 'save', 'connect']); expect(h.owner.status().phase).toBe('lobby'); expect(h.platform.startHost).not.toHaveBeenCalled();
    expect(await h.owner.dispatch({ type: 'start' })).toMatchObject({ ok: false });
    await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    expect(h.platform.startHost).toHaveBeenCalledOnce(); expect(h.host.request).toHaveBeenCalledOnce(); expect(h.platform.publishPort).toHaveBeenCalledOnce(); expect(h.owner.status().phase).toBe('syncing');
    const epoch = h.owner.status().attachmentEpoch;
    expect(await h.owner.dispatch({ type: 'view-state', epoch: epoch + 1, phase: 'running' })).toMatchObject({ ok: false });
    await h.owner.dispatch({ type: 'view-state', epoch, phase: 'paused' }); expect(h.owner.status().phase).toBe('paused');
    expect(JSON.stringify(h.owner.status())).not.toContain('seatToken'); await h.owner.dispose();
  });
  it('keeps play available with a fixed persistence warning', async () => {
    const h = harness(); h.store.save.mockRejectedValue({ code: 'storage-write-failed' });
    await h.owner.dispatch({ type: 'host', capacity: 1 }); expect(h.owner.status()).toMatchObject({ phase: 'lobby', persistent: false, error: 'storage-write-failed' }); await h.owner.dispose();
  });
  it('probes second layout only for incompatible', async () => {
    const h = harness(4, 3); h.service.join.mockRejectedValueOnce({ code: 'incompatible' });
    await h.owner.dispatch({ type: 'join', code: ' abcdefgh ' }); expect(h.service.join.mock.calls.map((call: any) => call[1].layoutHash)).toEqual([sectorCompatibility(2).layoutHash, sectorCompatibility(4).layoutHash]);
    expect(h.owner.status().ownSeat).toBe(3); await h.owner.dispose();
    const denied = harness(); denied.service.join.mockRejectedValue({ code: 'unauthorized' }); await denied.owner.dispatch({ type: 'join', code: 'ABCDEFGH' }); expect(denied.service.join).toHaveBeenCalledOnce(); await denied.owner.dispose();
  });
  it('Leave preempts an unresolved transport factory and closes its late return', async () => {
    const h = harness(), factory = deferred<any>(); h.platform.createTransport.mockReturnValue(factory.promise);
    const joining = h.owner.dispatch({ type: 'host', capacity: 1 }); await vi.waitFor(() => expect(h.platform.createTransport).toHaveBeenCalledOnce());
    await h.owner.dispatch({ type: 'leave' }); expect(h.owner.status().phase).toBe('idle'); factory.resolve(h.transport);
    await expect(joining).resolves.toMatchObject({ ok: false, code: 'cancelled' }); await vi.waitFor(() => expect(h.transport.dispose).toHaveBeenCalledOnce()); expect(h.platform.publishPort).not.toHaveBeenCalled(); await h.owner.dispose();
  });
  it('closes a late utility after Leave and never publishes stale ports', async () => {
    const h = harness(), factory = deferred<any>(); h.platform.startHost.mockReturnValue(factory.promise);
    await h.owner.dispatch({ type: 'host', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); const starting = h.owner.dispatch({ type: 'start' });
    await vi.waitFor(() => expect(h.platform.startHost).toHaveBeenCalledOnce()); await h.owner.dispatch({ type: 'leave' }); factory.resolve(h.host); await starting;
    await vi.waitFor(() => expect(h.host.dispose).toHaveBeenCalledOnce()); expect(h.platform.publishPort).not.toHaveBeenCalled(); await h.owner.dispose();
  });
  it('uses only the stored token and compatibility and refuses to recreate active host authority', async () => {
    const h = harness(); h.snapshot.phase = 'active'; h.setSaved({ version: 1, serviceOrigin: 'http://127.0.0.1:8787', roomId: h.snapshot.roomId, joinCode: h.snapshot.joinCode, compatibility: h.snapshot.compatibility, seatId: 0, seatGeneration: 1, seatToken: 't'.repeat(43) });
    expect(await h.owner.dispatch({ type: 'reconnect' })).toMatchObject({ ok: false, code: 'host-lost' }); expect(h.service.join).toHaveBeenCalledWith('ABCDEFGH', h.snapshot.compatibility, 't'.repeat(43)); expect(h.platform.startHost).not.toHaveBeenCalled(); await h.owner.dispose();
  });
  it('rejects stored origin mismatch without contacting the service', async () => {
    const h = harness(); h.setSaved({ version: 1, serviceOrigin: 'http://localhost:9999', roomId: h.snapshot.roomId, joinCode: h.snapshot.joinCode, compatibility: h.snapshot.compatibility, seatId: 0, seatGeneration: 1, seatToken: 't'.repeat(43) });
    expect(await h.owner.dispatch({ type: 'reconnect' })).toMatchObject({ ok: false, code: 'storage-invalid' }); expect(h.service.join).not.toHaveBeenCalled(); await h.owner.dispose();
  });
  it('bounds subscribers and coalesces explicit ready changes while rejecting concurrent lifecycle work', async () => {
    const h = harness(); const removers = Array.from({ length: 64 }, () => h.owner.subscribe(() => {})); expect(() => h.owner.subscribe(() => {})).toThrow('capacity'); removers.forEach(off => off());
    await h.owner.dispatch({ type: 'host', capacity: 1 }); const reply = deferred<any>(), original = h.service.request.getMockImplementation();
    h.service.request.mockImplementationOnce(() => reply.promise);
    const first = h.owner.dispatch({ type: 'ready', ready: true }), middle = h.owner.dispatch({ type: 'ready', ready: false }), last = h.owner.dispatch({ type: 'ready', ready: true });
    expect(await h.owner.dispatch({ type: 'start' })).toMatchObject({ ok: false, code: 'busy' });
    reply.resolve(await original({ type: 'ready', ready: true })); await Promise.all([first, middle, last]);
    expect(h.service.request.mock.calls.filter((call: any) => call[0].type === 'ready').map((call: any) => call[0].ready)).toEqual([true, true]); await h.owner.dispose();
  });
  it('keeps sparse capacity four and frozen seats through start/removal/reuse', async () => {
    const h = harness(4); h.snapshot.seats[1] = { seatId: 1, seatGeneration: 0, occupied: false, connected: false, ready: false }; h.snapshot.seats[2] = { ...h.snapshot.seats[1], seatId: 2 };
    const original = h.service.request.getMockImplementation();
    h.service.request.mockImplementation(async (op: any) => {
      if (op.type === 'link-request') { h.issue('1'.repeat(32), op.guestSeatId); return { kind: 'attempt', attemptId: '1'.repeat(32) }; }
      return original(op);
    });
    await h.owner.dispatch({ type: 'host', capacity: 4 }); await vi.waitFor(() => expect(h.service.request.mock.calls.some((call: any) => call[0].type === 'link-ready')).toBe(true));
    h.emit({ type: 'link-state', attemptId: '1'.repeat(32), state: 'ready' });
    h.snapshot.seats[3].ready = true; h.emit({ type: 'roster', snapshot: h.snapshot }); await h.owner.dispatch({ type: 'ready', ready: true });
    await h.owner.dispatch({ type: 'start' }); expect(h.platform.startHost).toHaveBeenCalledOnce();
    const start = h.host.request.mock.calls[0] as any; expect(JSON.parse(new TextDecoder().decode(start[0].initBytes))).toMatchObject({ playerCount: 4, layoutId: 'cutter' });
    expect(h.host.attachPeer.mock.calls.map((call: any) => call[1])).toEqual([[0], [3]]);
    expect(await h.owner.dispatch({ type: 'remove-seat', seatId: 3 })).toMatchObject({ ok: false });
    h.nativeClosed('1'.repeat(32)); expect(h.host.dispose).not.toHaveBeenCalled(); await h.owner.dispose();
  });
  it.each(['service', 'transport', 'utility', 'renewal'] as const)('stops host authority on its own %s loss', async loss => {
    vi.useFakeTimers(); const h = harness(); await h.owner.dispatch({ type: 'host', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    if (loss === 'service') h.emit({ type: 'error', error: { code: 'unavailable', retryable: true } });
    if (loss === 'transport') h.transportExit(); if (loss === 'utility') h.hostExit();
    if (loss === 'renewal') { h.service.request.mockRejectedValueOnce({ code: 'lease-expired' }); await vi.advanceTimersByTimeAsync(5000); }
    await Promise.resolve(); expect(h.owner.status().phase).toBe('error'); expect(h.host.dispose).toHaveBeenCalledOnce(); expect(h.transport.dispose).toHaveBeenCalledOnce(); await h.owner.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it('active guest reconnect waits for matching sync hint and later loss starts a fresh original-token attempt', async () => {
    const h = harness(2, 1); h.snapshot.phase = 'active'; h.setSaved(h.savedSeat());
    const reconnect = h.owner.dispatch({ type: 'reconnect' }); await vi.waitFor(() => expect(h.service.connect).toHaveBeenCalledOnce()); h.issue();
    await vi.waitFor(() => expect(h.platform.publishPort).toHaveBeenCalledOnce()); let complete = false; void reconnect.then(() => { complete = true; }); await Promise.resolve(); expect(complete).toBe(false);
    const oldEpoch = h.owner.status().attachmentEpoch; await h.owner.dispatch({ type: 'view-state', epoch: oldEpoch, phase: 'paused' }); await reconnect;
    h.snapshot.seats[1].seatGeneration = 2; h.transportExit(); await vi.waitFor(() => expect(h.service.join).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(h.service.connect).toHaveBeenCalledTimes(2)); h.issue('2'.repeat(32)); await vi.waitFor(() => expect(h.platform.publishPort).toHaveBeenCalledTimes(2));
    expect(h.owner.status().attachmentEpoch).toBeGreaterThan(oldEpoch); expect(await h.owner.dispatch({ type: 'view-state', epoch: oldEpoch, phase: 'running' })).toMatchObject({ ok: false });
    expect(h.service.join.mock.calls.every((call: any) => call[2] === 't'.repeat(43))).toBe(true); expect(h.platform.startHost).not.toHaveBeenCalled(); await h.owner.dispose();
  });
  it('guest reconnect exhausts budget while syncing and closes its transport', async () => {
    vi.useFakeTimers(); const h = harness(2, 1); h.snapshot.phase = 'active'; h.setSaved(h.savedSeat()); const result = h.owner.dispatch({ type: 'reconnect' });
    await vi.advanceTimersByTimeAsync(0); h.issue(); await vi.advanceTimersByTimeAsync(0); expect(h.platform.publishPort).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30000); expect(await result).toMatchObject({ ok: false, code: 'retry-exhausted' }); expect(h.transport.dispose).toHaveBeenCalledOnce(); expect(h.owner.status().phase).toBe('error'); await h.owner.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it('fails closed on terminal service errors during reconnect instead of looping', async () => {
    const h = harness(2, 1); h.snapshot.phase = 'active'; h.setSaved(h.savedSeat()); const result = h.owner.dispatch({ type: 'reconnect' });
    await vi.waitFor(() => expect(h.service.connect).toHaveBeenCalledOnce()); h.emit({ type: 'error', error: { code: 'unauthorized', retryable: false } });
    expect(await result).toMatchObject({ ok: false, code: 'unauthorized' }); expect(h.service.join).toHaveBeenCalledOnce(); await h.owner.dispose();
  });
  it('Forget fences replacement work until old resource disposal and serialized credential clearing finish', async () => {
    const h = harness(), disposed = deferred<void>(), cleared = deferred<void>();
    await h.owner.dispatch({ type: 'host', capacity: 1 }); h.transport.dispose.mockReturnValue(disposed.promise); h.store.clear.mockReturnValue(cleared.promise);
    const forget = h.owner.dispatch({ type: 'forget-seat' });
    expect(h.store.clear).toHaveBeenCalledOnce(); expect(await h.owner.dispatch({ type: 'host', capacity: 1 })).toMatchObject({ ok: false, code: 'busy' });
    disposed.resolve(); await Promise.resolve(); expect(await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH' })).toMatchObject({ ok: false, code: 'busy' });
    cleared.resolve(); await forget; expect(h.owner.status().persistent).toBe(false); await h.owner.dispose();
  });
  it('bounds unresolved native factories across cancellation generations', async () => {
    const h = harness(), pending: ReturnType<typeof deferred<any>>[] = [];
    h.platform.createTransport.mockImplementation(() => { const factory = deferred<any>(); pending.push(factory); return factory.promise; });
    for (let i = 0; i < 4; i++) {
      const attempt = h.owner.dispatch({ type: 'host', capacity: 1 }); await vi.waitFor(() => expect(pending).toHaveLength(i + 1)); await h.owner.dispatch({ type: 'leave' }); await attempt;
    }
    const result = h.owner.dispatch({ type: 'host', capacity: 1 }); await expect(result).resolves.toMatchObject({ ok: false, code: 'capacity' }); expect(pending).toHaveLength(4);
    for (const factory of pending) factory.resolve(h.transport); await vi.waitFor(() => expect(h.transport.dispose).toHaveBeenCalledTimes(4)); await h.owner.dispose();
  });
  it('removes lobby seats, retires their old route and reuses the same logical ID at a newer generation', async () => {
    const h = harness(2); let generation = 1; const original = h.service.request.getMockImplementation();
    h.service.request.mockImplementation(async (op: any) => {
      if (op.type === 'link-request') { h.issue(String(generation).repeat(32)); return { kind: 'attempt', attemptId: String(generation).repeat(32) }; }
      if (op.type === 'remove-seat') { h.snapshot.seats[1] = { seatId: 1, seatGeneration: ++generation, occupied: false, connected: false, ready: false }; h.snapshot.rosterRevision++; return { kind: 'snapshot', snapshot: h.snapshot }; }
      return original(op);
    });
    await h.owner.dispatch({ type: 'host', capacity: 2 }); expect(await h.owner.dispatch({ type: 'remove-seat', seatId: 0 })).toMatchObject({ ok: false });
    await h.owner.dispatch({ type: 'remove-seat', seatId: 1 }); expect(h.controller.closeAttempt).toHaveBeenCalledWith('1'.repeat(32));
    h.snapshot.seats[1] = { seatId: 1, seatGeneration: ++generation, occupied: true, connected: true, ready: false }; h.snapshot.rosterRevision++; h.emit({ type: 'roster', snapshot: h.snapshot });
    await vi.waitFor(() => expect(h.controller.startAttempt).toHaveBeenCalledTimes(2)); expect(h.owner.status().snapshot!.seats[1]).toMatchObject({ seatId: 1, seatGeneration: 3, occupied: true });
    h.nativeClosed('1'.repeat(32)); expect(h.owner.status().phase).toBe('lobby'); await h.owner.dispose();
  });
  it('does not attach a rejoining guest to a utility until its start command completes', async () => {
    const h = harness(2), startReply = deferred<any>(); let generation = 1;
    h.host.request.mockReturnValue(startReply.promise); const original = h.service.request.getMockImplementation();
    h.service.request.mockImplementation(async (op: any) => {
      if (op.type === 'link-request') { h.issue(String(generation).repeat(32)); return { kind: 'attempt', attemptId: String(generation).repeat(32) }; }
      return original(op);
    });
    await h.owner.dispatch({ type: 'host', capacity: 2 }); h.emit({ type: 'link-state', attemptId: '1'.repeat(32), state: 'ready' });
    h.snapshot.seats[1].ready = true; h.emit({ type: 'roster', snapshot: h.snapshot }); await h.owner.dispatch({ type: 'ready', ready: true });
    const starting = h.owner.dispatch({ type: 'start' }); await vi.waitFor(() => expect(h.host.request).toHaveBeenCalledOnce());
    h.snapshot.phase = 'active'; h.snapshot.seats[1].seatGeneration = ++generation; h.snapshot.rosterRevision++; h.emit({ type: 'roster', snapshot: h.snapshot });
    await vi.waitFor(() => expect(h.order.filter(type => type === 'link-ready')).toHaveLength(2)); await Promise.resolve(); await Promise.resolve();
    expect(h.host.attachPeer).not.toHaveBeenCalled(); startReply.resolve({ ok: true, requestId: 1, hostGeneration: 1 }); await starting;
    expect(h.host.attachPeer.mock.calls.map((call: any) => call[1])).toEqual([[0], [1]]); await h.owner.dispose();
  });
  it('all dispose callers await the same outstanding resource shutdown', async () => {
    const h = harness(), shutdown = deferred<void>(); await h.owner.dispatch({ type: 'host', capacity: 1 }); h.transport.dispose.mockReturnValue(shutdown.promise);
    const first = h.owner.dispose(), second = h.owner.dispose(); let finished = false; void second.then(() => { finished = true; });
    await Promise.resolve(); expect(finished).toBe(false); shutdown.resolve(); await Promise.all([first, second]); expect(h.transport.dispose).toHaveBeenCalledOnce();
  });
  it('preserves unavailable retryAfter across coordinator retries', async () => {
    vi.useFakeTimers(); const h = harness(2, 1); h.setSaved(h.savedSeat()); h.service.join.mockRejectedValueOnce({ code: 'unavailable', retryable: true, retryAfterMs: 8000 });
    const result = h.owner.dispatch({ type: 'reconnect' }); await vi.advanceTimersByTimeAsync(1000); expect(h.service.join).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(7000); expect(await result).toEqual({ ok: true }); expect(h.service.join).toHaveBeenCalledTimes(2); await h.owner.dispose();
  });
  it('explicit Leave invalidates an automatic retry queued behind transport cleanup', async () => {
    const h = harness(2, 1), shutdown = deferred<void>(); await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH' }); h.transport.dispose.mockReturnValue(shutdown.promise);
    h.transportExit(); const leaving = h.owner.dispatch({ type: 'leave' }); shutdown.resolve(); await leaving;
    await new Promise<void>(resolve => setImmediate(resolve)); expect(h.service.join).toHaveBeenCalledOnce(); expect(h.owner.status().phase).toBe('idle'); await h.owner.dispose();
  });
  it('a Leave from a status observer cannot be undone by the old automatic retry continuation', async () => {
    const h = harness(2, 1); await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH' }); let left = false;
    h.owner.subscribe(status => { if (!left && status.phase === 'idle') { left = true; void h.owner.dispatch({ type: 'leave' }); } });
    h.transportExit(); await new Promise<void>(resolve => setImmediate(resolve)); expect(h.service.join).toHaveBeenCalledOnce(); expect(h.owner.status().phase).toBe('idle'); await h.owner.dispose();
  });
});
