import { afterEach, describe, expect, it, vi } from 'vitest';
import { sectorCompatibility } from '../src/network/online/onlineSector';
import { deferred, harness } from './helpers/onlineHarness';
afterEach(() => vi.useRealTimers());
describe('online coordinator ownership', () => {
  it('releases synchronously on unload, with no exit capture, and stays disposed', async () => {
    const h = harness(); await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    h.service.request.mockClear(); h.host.captureCheckpoint.mockClear();
    h.owner.releaseForUnload();
    expect(h.service.request.mock.calls.map((c: any) => c[0].type)).toEqual(['host-release']);
    expect(h.host.captureCheckpoint).not.toHaveBeenCalled(); expect(h.service.close).toHaveBeenCalled();
    expect(await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 })).toEqual({ ok: false, code: 'online-disabled' });
    h.owner.releaseForUnload(); await h.owner.dispose();
  });
  it('reports live receipt age through status reads and preserves it after leaving', async () => {
    vi.useFakeTimers(); const h = harness(); await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    await vi.advanceTimersByTimeAsync(200); expect(h.owner.status().mirror.receivedAgeMs).toBe(200);
    await h.owner.dispatch({ type: 'leave' }); await vi.advanceTimersByTimeAsync(100); expect(h.owner.status().mirror.receivedAgeMs).toBe(100); await h.owner.dispose();
  });
  it('subscribes before start, acknowledges adoption before commit, and keeps bootstrap closed until the exact initial DO receipt', async () => {
    const h = harness(), put = deferred<void>(); h.service.putCheckpoint.mockReturnValueOnce(put.promise);
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); const start = h.owner.dispatch({ type: 'start' });
    await vi.waitFor(() => expect(h.host.ackCheckpoint).toHaveBeenCalledWith(1)); expect(h.host.completeBootstrap).not.toHaveBeenCalled(); expect(h.platform.publishPort).not.toHaveBeenCalled();
    const lease = h.platform.startLeasedHost.mock.calls[0]![2]; expect(lease.utilityEpoch).toMatch(/^[a-f0-9]{32}$/); expect(lease.utilityEpoch).not.toBe('f'.repeat(32));
    expect(h.service.request.mock.calls.find((c: any) => c[0].type === 'lease-renew')[0].nonce).toBe('8'.repeat(32));
    put.resolve(); expect(await start).toEqual({ ok: true }); expect(h.host.completeBootstrap).toHaveBeenCalledOnce(); expect(h.owner.status().mirror.committed?.capturedTick).toBe(0); await h.owner.dispose();
  });
  it('initial commit failure never opens bootstrap and retains pending disk state', async () => {
    vi.useFakeTimers(); const h = harness(); h.service.putCheckpoint.mockRejectedValue({ code: 'unavailable' });
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); const start = h.owner.dispatch({ type: 'start' });
    await vi.advanceTimersByTimeAsync(6000); expect(await start).toMatchObject({ ok: false, code: 'save-unavailable' }); expect(h.host.completeBootstrap).not.toHaveBeenCalled(); expect((await h.mirrorStore.load())?.pending).not.toBeNull(); await h.owner.dispose();
  });
  it('supersedes renewal requests using the utility nonce and aborts old service correlation', async () => {
    const h = harness(); await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    const old = deferred<any>(), original = h.service.request.getMockImplementation(); h.service.request.mockImplementation((op: any, options: any) => op.type === 'lease-renew' && op.nonce === '6'.repeat(32) ? old.promise : original(op, options));
    h.renewal('6'.repeat(32)); const options = h.service.request.mock.calls.at(-1)[1]; h.renewal('7'.repeat(32)); expect(options.signal.aborted).toBe(true);
    old.resolve({ lease: { roomId: h.snapshot.roomId, hostGeneration: 1, hostSeatId: 0, nonce: '6'.repeat(32), expiresAtEpochMs: Date.now() + 15000 } });
    await vi.waitFor(() => expect(h.host.applyLease).toHaveBeenCalledTimes(2)); expect(h.host.applyLease.mock.calls.at(-1)![0].nonce).toBe('7'.repeat(32)); await h.owner.dispose();
  });
  it('Forget cancels a pending initial upload and clears both stores without late recreation', async () => {
    const h = harness(), put = deferred<void>(); h.service.putCheckpoint.mockReturnValueOnce(put.promise);
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); const start = h.owner.dispatch({ type: 'start' });
    await vi.waitFor(() => expect(h.service.putCheckpoint).toHaveBeenCalledOnce()); expect(await h.owner.dispatch({ type: 'forget-seat' })).toEqual({ ok: true }); put.resolve(); await start;
    expect(await h.store.load()).toBeNull(); expect(await h.mirrorStore.load()).toBeNull(); expect(h.host.completeBootstrap).not.toHaveBeenCalled(); await h.owner.dispose();
  });
  it('retains the graceful exit pending mirror when the final server upload fails within the three-second budget', async () => {
    vi.useFakeTimers(); const h = harness(); await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    h.service.putCheckpoint.mockRejectedValue({ code: 'unavailable' }); const leave = h.owner.dispatch({ type: 'leave' }); await vi.advanceTimersByTimeAsync(3000); expect(await leave).toEqual({ ok: true });
    expect(h.host.captureCheckpoint).toHaveBeenCalledWith('exit'); expect((await h.mirrorStore.load())?.pending?.metadata.checkpointSequence).toBe(2); expect(h.host.dispose).toHaveBeenCalledOnce(); await h.owner.dispose();
  });
  it('publishes Start capability only after human, native and service readiness and revokes it on loss or generation replacement', async () => {
    const h = harness(2), native = deferred<any>(); let attempt = '1'.repeat(32);
    h.controller.startAttempt.mockReturnValue(native.promise);
    const original = h.service.request.getMockImplementation();
    h.service.request.mockImplementation(async (op: any) => { if (op.type === 'link-request') { h.issue(attempt); return { kind: 'attempt', attemptId: attempt }; } return original(op); });
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 2 }); expect(h.owner.status().actions).not.toContain('start');
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
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'leave' }); expect(h.owner.status().actions).toContain('reconnect');
    await h.owner.dispatch({ type: 'forget-seat' }); expect(h.owner.status().actions).not.toContain('reconnect'); await h.owner.dispose();
  });
  it('persists before connect/lobby; creates exactly one utility after duplicate commitment and keeps display hints powerless', async () => {
    const h = harness(); expect(await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 })).toEqual({ ok: true });
    expect(h.order.slice(0, 3)).toEqual(['create', 'save', 'connect']); expect(h.owner.status().phase).toBe('lobby'); expect(h.platform.startLeasedHost).not.toHaveBeenCalled();
    expect(await h.owner.dispatch({ type: 'start' })).toMatchObject({ ok: false });
    await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    expect(h.platform.startLeasedHost).toHaveBeenCalledOnce(); expect(h.host.request).toHaveBeenCalledOnce(); expect(h.platform.publishPort).toHaveBeenCalledOnce(); expect(h.owner.status().phase).toBe('syncing');
    const epoch = h.owner.status().attachmentEpoch;
    expect(await h.owner.dispatch({ type: 'view-state', epoch: epoch + 1, phase: 'running' })).toMatchObject({ ok: false });
    await h.owner.dispatch({ type: 'view-state', epoch, phase: 'paused' }); expect(h.owner.status().phase).toBe('paused');
    expect(JSON.stringify(h.owner.status())).not.toContain('seatToken'); await h.owner.dispose();
  });
  it('keeps play available with a fixed persistence warning', async () => {
    const h = harness(); h.store.save.mockRejectedValue({ code: 'storage-write-failed' });
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); expect(h.owner.status()).toMatchObject({ phase: 'lobby', persistent: false, error: 'storage-write-failed' }); await h.owner.dispose();
  });
  it('probes each distinct sector layout once: the Hound flies at every size, so incompatible is final (Art-iv-b)', async () => {
    const ok = harness(4, 3); await ok.owner.dispatch({ type: 'join', code: ' abcdefgh ', mode: 'sector' });
    expect(ok.service.join.mock.calls.map((call: any) => call[1].layoutHash)).toEqual([sectorCompatibility(4).layoutHash]);
    expect(ok.owner.status().ownSeat).toBe(3); await ok.owner.dispose();
    const h = harness(4, 3); h.service.join.mockRejectedValueOnce({ code: 'incompatible' });
    await expect(h.owner.dispatch({ type: 'join', code: ' abcdefgh ', mode: 'sector' })).resolves.toMatchObject({ ok: false, code: 'incompatible' });
    expect(h.service.join.mock.calls.map((call: any) => call[1].layoutHash)).toEqual([sectorCompatibility(2).layoutHash]); await h.owner.dispose();
    const denied = harness(); denied.service.join.mockRejectedValue({ code: 'unauthorized' }); await denied.owner.dispatch({ type: 'join', code: 'ABCDEFGH', mode: 'sector' }); expect(denied.service.join).toHaveBeenCalledOnce(); await denied.owner.dispose();
  });
  it('Leave preempts an unresolved transport factory and closes its late return', async () => {
    const h = harness(), factory = deferred<any>(); h.platform.createTransport.mockReturnValue(factory.promise);
    const joining = h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await vi.waitFor(() => expect(h.platform.createTransport).toHaveBeenCalledOnce());
    await h.owner.dispatch({ type: 'leave' }); expect(h.owner.status().phase).toBe('idle'); factory.resolve(h.transport);
    await expect(joining).resolves.toMatchObject({ ok: false, code: 'cancelled' }); await vi.waitFor(() => expect(h.transport.dispose).toHaveBeenCalledOnce()); expect(h.platform.publishPort).not.toHaveBeenCalled(); await h.owner.dispose();
  });
  it('closes a late utility after Leave and never publishes stale ports', async () => {
    const h = harness(), factory = deferred<any>(); h.platform.startLeasedHost.mockReturnValue(factory.promise);
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); const starting = h.owner.dispatch({ type: 'start' });
    await vi.waitFor(() => expect(h.platform.startLeasedHost).toHaveBeenCalledOnce()); await h.owner.dispatch({ type: 'leave' }); factory.resolve(h.host); await starting;
    await vi.waitFor(() => expect(h.host.dispose).toHaveBeenCalledOnce()); expect(h.platform.publishPort).not.toHaveBeenCalled(); await h.owner.dispose();
  });
  it('uses only the stored token and compatibility and refuses to recreate active host authority', async () => {
    const h = harness(); h.snapshot.phase = 'active'; h.setSaved({ version: 1, serviceOrigin: 'http://127.0.0.1:8787', roomId: h.snapshot.roomId, joinCode: h.snapshot.joinCode, compatibility: h.snapshot.compatibility, seatId: 0, seatGeneration: 1, seatToken: 't'.repeat(43) });
    expect(await h.owner.dispatch({ type: 'reconnect' })).toMatchObject({ ok: true }); expect(h.owner.status().phase).toBe('saved'); expect(h.service.join).toHaveBeenCalledWith('ABCDEFGH', h.snapshot.compatibility, 't'.repeat(43)); expect(h.platform.startLeasedHost).not.toHaveBeenCalled(); await h.owner.dispose();
  });
  it('rejects stored origin mismatch without contacting the service', async () => {
    const h = harness(); h.setSaved({ version: 1, serviceOrigin: 'http://localhost:9999', roomId: h.snapshot.roomId, joinCode: h.snapshot.joinCode, compatibility: h.snapshot.compatibility, seatId: 0, seatGeneration: 1, seatToken: 't'.repeat(43) });
    expect(await h.owner.dispatch({ type: 'reconnect' })).toMatchObject({ ok: false, code: 'storage-invalid' }); expect(h.service.join).not.toHaveBeenCalled(); await h.owner.dispose();
  });
  it('bounds subscribers and coalesces explicit ready changes while rejecting concurrent lifecycle work', async () => {
    const h = harness(); const removers = Array.from({ length: 64 }, () => h.owner.subscribe(() => {})); expect(() => h.owner.subscribe(() => {})).toThrow('capacity'); removers.forEach(off => off());
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); const reply = deferred<any>(), original = h.service.request.getMockImplementation();
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
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 4 }); await vi.waitFor(() => expect(h.service.request.mock.calls.some((call: any) => call[0].type === 'link-ready')).toBe(true));
    h.emit({ type: 'link-state', attemptId: '1'.repeat(32), state: 'ready' });
    h.snapshot.seats[3].ready = true; h.emit({ type: 'roster', snapshot: h.snapshot }); await h.owner.dispatch({ type: 'ready', ready: true });
    await h.owner.dispatch({ type: 'start' }); expect(h.platform.startLeasedHost).toHaveBeenCalledOnce();
    const start = h.host.request.mock.calls[0] as any; expect(JSON.parse(new TextDecoder().decode(start[0].initBytes))).toMatchObject({ playerCount: 4, layoutId: 'hound' });
    expect(h.host.attachPeer.mock.calls.map((call: any) => call[1])).toEqual([[0], [3]]);
    expect(await h.owner.dispatch({ type: 'remove-seat', seatId: 3 })).toMatchObject({ ok: false });
    h.nativeClosed('1'.repeat(32)); expect(h.host.dispose).not.toHaveBeenCalled(); await h.owner.dispose();
  });
  it.each(['service', 'transport', 'utility', 'renewal'] as const)('stops host authority on its own %s loss', async loss => {
    vi.useFakeTimers(); const h = harness(); await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    if (loss === 'service') h.emit({ type: 'error', error: { code: 'unavailable', retryable: true } });
    if (loss === 'transport') h.transportExit(); if (loss === 'utility') h.hostExit();
    if (loss === 'renewal') { h.service.request.mockRejectedValueOnce({ code: 'lease-expired' }); await vi.advanceTimersByTimeAsync(5000); }
    await Promise.resolve(); expect(h.owner.status().phase).toBe('saved'); expect(h.owner.status().ownSeat).toBe(0); expect(h.host.dispose).toHaveBeenCalledOnce(); expect(h.transport.dispose).toHaveBeenCalledOnce(); await h.owner.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it('active guest reconnect waits for matching sync hint and later loss starts a fresh original-token attempt', async () => {
    const h = harness(2, 1); h.snapshot.phase = 'active'; h.setSaved(h.savedSeat());
    const reconnect = h.owner.dispatch({ type: 'reconnect' }); await vi.waitFor(() => expect(h.service.connect).toHaveBeenCalledOnce()); h.issue();
    await vi.waitFor(() => expect(h.platform.publishPort).toHaveBeenCalledOnce()); let complete = false; void reconnect.then(() => { complete = true; }); await Promise.resolve(); expect(complete).toBe(false);
    const oldEpoch = h.owner.status().attachmentEpoch; await h.owner.dispatch({ type: 'view-state', epoch: oldEpoch, phase: 'paused' }); await reconnect;
    h.snapshot.seats[1].seatGeneration = 2; h.transportExit(); await vi.waitFor(() => expect(h.service.join).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(h.service.connect).toHaveBeenCalledTimes(2)); h.issue('2'.repeat(32)); await vi.waitFor(() => expect(h.platform.publishPort).toHaveBeenCalledTimes(2));
    expect(h.owner.status().attachmentEpoch).toBeGreaterThan(oldEpoch); expect(await h.owner.dispatch({ type: 'view-state', epoch: oldEpoch, phase: 'running' })).toMatchObject({ ok: false });
    expect(h.service.join.mock.calls.every((call: any) => call[2] === 't'.repeat(43))).toBe(true); expect(h.platform.startLeasedHost).not.toHaveBeenCalled(); await h.owner.dispose();
  });
  it('guest reconnect exhausts budget while syncing and closes its transport', async () => {
    vi.useFakeTimers(); const h = harness(2, 1); h.snapshot.phase = 'active'; h.setSaved(h.savedSeat()); const result = h.owner.dispatch({ type: 'reconnect' });
    await vi.advanceTimersByTimeAsync(0); h.issue(); await vi.advanceTimersByTimeAsync(0); expect(h.platform.publishPort).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30000); expect(await result).toMatchObject({ ok: false, code: 'retry-exhausted' }); expect(h.transport.dispose).toHaveBeenCalledOnce(); expect(h.owner.status().phase).toBe('saved'); await h.owner.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it('fails closed on terminal service errors during reconnect instead of looping', async () => {
    const h = harness(2, 1); h.snapshot.phase = 'active'; h.setSaved(h.savedSeat()); const result = h.owner.dispatch({ type: 'reconnect' });
    await vi.waitFor(() => expect(h.service.connect).toHaveBeenCalledOnce()); h.emit({ type: 'error', error: { code: 'unauthorized', retryable: false } });
    expect(await result).toMatchObject({ ok: false, code: 'unauthorized' }); expect(h.service.join).toHaveBeenCalledOnce(); await h.owner.dispose();
  });
  it('Forget fences replacement work until old resource disposal and serialized credential clearing finish', async () => {
    const h = harness(), disposed = deferred<void>(), cleared = deferred<void>();
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); h.transport.dispose.mockReturnValue(disposed.promise); h.store.clear.mockReturnValue(cleared.promise);
    const forget = h.owner.dispatch({ type: 'forget-seat' });
    expect(h.store.clear).toHaveBeenCalledOnce(); expect(await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 })).toMatchObject({ ok: false, code: 'busy' });
    disposed.resolve(); await Promise.resolve(); expect(await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH', mode: 'sector' })).toMatchObject({ ok: false, code: 'busy' });
    cleared.resolve(); await forget; expect(h.owner.status().persistent).toBe(false); await h.owner.dispose();
  });
  it('bounds unresolved native factories across cancellation generations', async () => {
    const h = harness(), pending: ReturnType<typeof deferred<any>>[] = [];
    h.platform.createTransport.mockImplementation(() => { const factory = deferred<any>(); pending.push(factory); return factory.promise; });
    for (let i = 0; i < 4; i++) {
      const attempt = h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await vi.waitFor(() => expect(pending).toHaveLength(i + 1)); await h.owner.dispatch({ type: 'leave' }); await attempt;
    }
    const result = h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await expect(result).resolves.toMatchObject({ ok: false, code: 'capacity' }); expect(pending).toHaveLength(4);
    for (const factory of pending) factory.resolve(h.transport); await vi.waitFor(() => expect(h.transport.dispose).toHaveBeenCalledTimes(4)); await h.owner.dispose();
  });
  it('removes lobby seats, retires their old route and reuses the same logical ID at a newer generation', async () => {
    const h = harness(2); let generation = 1; const original = h.service.request.getMockImplementation();
    h.service.request.mockImplementation(async (op: any) => {
      if (op.type === 'link-request') { h.issue(String(generation).repeat(32)); return { kind: 'attempt', attemptId: String(generation).repeat(32) }; }
      if (op.type === 'remove-seat') { h.snapshot.seats[1] = { seatId: 1, seatGeneration: ++generation, occupied: false, connected: false, ready: false }; h.snapshot.rosterRevision++; return { kind: 'snapshot', snapshot: h.snapshot }; }
      return original(op);
    });
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 2 }); expect(await h.owner.dispatch({ type: 'remove-seat', seatId: 0 })).toMatchObject({ ok: false });
    await h.owner.dispatch({ type: 'remove-seat', seatId: 1 }); expect(h.controller.closeAttempt).toHaveBeenCalledWith('1'.repeat(32));
    h.snapshot.seats[1] = { seatId: 1, seatGeneration: ++generation, occupied: true, connected: true, ready: false }; h.snapshot.rosterRevision++; h.emit({ type: 'roster', snapshot: h.snapshot });
    await vi.waitFor(() => expect(h.controller.startAttempt).toHaveBeenCalledTimes(2)); expect(h.owner.status().snapshot!.seats[1]).toMatchObject({ seatId: 1, seatGeneration: 3, occupied: true });
    h.nativeClosed('1'.repeat(32)); expect(h.owner.status().phase).toBe('lobby'); await h.owner.dispose();
  });
  it('does not attach a rejoining guest to a utility until its start command completes', async () => {
    const h = harness(2), startReply = deferred<any>(); let generation = 1;
    const startImplementation = h.host.request.getMockImplementation()!; h.host.request.mockImplementation(async request => { await startImplementation(request); return startReply.promise; }); const original = h.service.request.getMockImplementation();
    h.service.request.mockImplementation(async (op: any) => {
      if (op.type === 'link-request') { h.issue(String(generation).repeat(32)); return { kind: 'attempt', attemptId: String(generation).repeat(32) }; }
      return original(op);
    });
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 2 }); h.emit({ type: 'link-state', attemptId: '1'.repeat(32), state: 'ready' });
    h.snapshot.seats[1].ready = true; h.emit({ type: 'roster', snapshot: h.snapshot }); await h.owner.dispatch({ type: 'ready', ready: true });
    const starting = h.owner.dispatch({ type: 'start' }); await vi.waitFor(() => expect(h.host.request).toHaveBeenCalledOnce());
    h.snapshot.phase = 'active'; h.snapshot.seats[1].seatGeneration = ++generation; h.snapshot.rosterRevision++; h.emit({ type: 'roster', snapshot: h.snapshot });
    await vi.waitFor(() => expect(h.order.filter(type => type === 'link-ready')).toHaveLength(2)); await Promise.resolve(); await Promise.resolve();
    expect(h.host.attachPeer).not.toHaveBeenCalled(); startReply.resolve({ ok: true, requestId: 1, hostGeneration: 1 }); await starting;
    expect(h.host.attachPeer.mock.calls.map((call: any) => call[1])).toEqual([[0], [1]]); await h.owner.dispose();
  });
  it('all dispose callers await the same outstanding resource shutdown', async () => {
    const h = harness(), shutdown = deferred<void>(); await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); h.transport.dispose.mockReturnValue(shutdown.promise);
    const first = h.owner.dispose(), second = h.owner.dispose(); let finished = false; void second.then(() => { finished = true; });
    await Promise.resolve(); expect(finished).toBe(false); shutdown.resolve(); await Promise.all([first, second]); expect(h.transport.dispose).toHaveBeenCalledOnce();
  });
  it('preserves unavailable retryAfter across coordinator retries', async () => {
    vi.useFakeTimers(); const h = harness(2, 1); h.setSaved(h.savedSeat()); h.service.join.mockRejectedValueOnce({ code: 'unavailable', retryable: true, retryAfterMs: 8000 });
    const result = h.owner.dispatch({ type: 'reconnect' }); await vi.advanceTimersByTimeAsync(1000); expect(h.service.join).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(7000); expect(await result).toEqual({ ok: true }); expect(h.service.join).toHaveBeenCalledTimes(2); await h.owner.dispose();
  });
  it('explicit Leave invalidates an automatic retry queued behind transport cleanup', async () => {
    const h = harness(2, 1), shutdown = deferred<void>(); await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH', mode: 'sector' }); h.transport.dispose.mockReturnValue(shutdown.promise);
    h.transportExit(); const leaving = h.owner.dispatch({ type: 'leave' }); shutdown.resolve(); await leaving;
    await new Promise<void>(resolve => setImmediate(resolve)); expect(h.service.join).toHaveBeenCalledOnce(); expect(h.owner.status().phase).toBe('idle'); await h.owner.dispose();
  });
  it('a Leave from a status observer cannot be undone by the old automatic retry continuation', async () => {
    const h = harness(2, 1); await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH', mode: 'sector' }); let left = false;
    h.owner.subscribe(status => { if (!left && status.phase === 'idle') { left = true; void h.owner.dispatch({ type: 'leave' }); } });
    h.transportExit(); await new Promise<void>(resolve => setImmediate(resolve)); expect(h.service.join).toHaveBeenCalledOnce(); expect(h.owner.status().phase).toBe('idle'); await h.owner.dispose();
  });
});

it('publishes retry deadlines in shared epoch time without changing monotonic enforcement', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1800000000000);
  const h = harness(2, 1, 1799999995000); h.setSaved(h.savedSeat());
  h.service.join.mockRejectedValueOnce({ code: 'unavailable', retryable: true, retryAfterMs: 8000 });
  const result = h.owner.dispatch({ type: 'reconnect' }); await vi.advanceTimersByTimeAsync(0);
  expect(h.owner.status().retryAtMs).toBe(1800000008000);
  await vi.advanceTimersByTimeAsync(7999); expect(h.service.join).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1); expect(await result).toEqual({ ok: true }); await h.owner.dispose();
});

it('retains HTTPS configuration through main revalidation and acquires TURN before native setup', async () => {
  const h = harness(2, 1, 0, 'https://service.example');
  expect(await h.owner.dispatch({ type: 'join', code: 'ABCDEFGH', mode: 'sector' })).toEqual({ ok: true });
  h.issue(); await vi.waitFor(() => expect(h.controller.startAttempt).toHaveBeenCalledOnce());
  expect(h.service.getTurn).toHaveBeenCalledOnce();
  expect(h.controller.startAttempt.mock.calls[0][0]).toMatchObject({ iceServers: [{ credential: 'test' }], iceTransportPolicy: 'all' });
  await h.owner.dispose();
});
it("linkStats (H-2b): a ready attempt's fresh figure, none after 5 s or for an attempt that is not ready, none from a replaced transport", async () => {
  const h = harness(2, 1); h.snapshot.phase = 'active'; h.setSaved(h.savedSeat());
  // Each transport its own controller, so a replaced transport's stats can be told apart.
  const made: { stats: (attemptId: string, s: any) => void; exit: () => void }[] = [];
  h.platform.createTransport.mockImplementation(async () => {
    const entry = { stats: (_a: string, _s: any) => {}, exit: () => {} };
    const controller = { ...h.controller, onStats: (cb: any) => { entry.stats = cb; return () => {}; } };
    made.push(entry);
    return { controller, onExit: (cb: () => void) => { entry.exit = cb; return () => {}; }, dispose: vi.fn(async () => {}) } as any;
  });
  vi.useFakeTimers({ toFake: ['Date'] });
  const first = '1'.repeat(32), second = '2'.repeat(32);
  const reconnect = h.owner.dispatch({ type: 'reconnect' }); await vi.waitFor(() => expect(h.service.connect).toHaveBeenCalledOnce()); h.issue(first);
  await vi.waitFor(() => expect(h.platform.publishPort).toHaveBeenCalledOnce());
  await h.owner.dispatch({ type: 'view-state', epoch: h.owner.status().attachmentEpoch, phase: 'running' }); await reconnect;
  expect(h.owner.linkStats!()).toBeNull();
  made[0]!.stats(first, { route: 'lan', rttMs: 12 });
  expect(h.owner.linkStats!()).toEqual({ route: 'lan', rttMs: 12 });
  vi.setSystemTime(Date.now() + 5001); expect(h.owner.linkStats!()).toBeNull();   // gone quiet
  made[0]!.stats('9'.repeat(32), { route: 'lan', rttMs: 15 }); expect(h.owner.linkStats!()).toBeNull();   // not among peers.ready()
  made[0]!.stats(first, { route: 'internet', rttMs: 30 }); expect(h.owner.linkStats!()).toEqual({ route: 'internet', rttMs: 30 });
  // A new host generation: the same session follows it on a new transport (its old subscription is never removed here).
  h.snapshot.hostGeneration = 2; h.emit({ type: 'host-changed', snapshot: h.snapshot }); await vi.waitFor(() => expect(h.service.connect).toHaveBeenCalledTimes(2));
  h.issue(second, 1, 2); await vi.waitFor(() => expect(h.platform.publishPort).toHaveBeenCalledTimes(2));
  expect(made).toHaveLength(2);
  made[0]!.stats(second, { route: 'lan', rttMs: 5 }); expect(h.owner.linkStats!()).toBeNull();   // the retired transport's figure is ignored
  made[1]!.stats(second, { route: 'internet', rttMs: 80 }); expect(h.owner.linkStats!()).toEqual({ route: 'internet', rttMs: 80 });
  await h.owner.dispose();
});
