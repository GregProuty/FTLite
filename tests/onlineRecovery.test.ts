import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createOnlineSession } from '../src/main/network/onlineSession';
import { sectorCompatibility, sectorInit } from '../src/main/network/onlineSector';
import { initialOnlineCheckpoint } from './helpers/onlineCheckpoint';
import { createAuthority, type Checkpoint } from '../src/renderer/src/authority/authority';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import type { RoomSnapshot } from '../src/shared/roomSession';
import type { SessionMirror } from '../src/main/network/mirrorStore';
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); vi.useRealTimers(); });

function room() {
  const snapshot: RoomSnapshot = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), joinCode: 'ABCDEFGH', compatibility: sectorCompatibility(2), capacity: 2,
    hostSeatId: 0, hostGeneration: 3, phase: 'lost', rosterRevision: 8, seats: [0, 1].map(seatId => ({ seatId, seatGeneration: 1, occupied: true, connected: true, ready: true })) };
  const cp = JSON.parse(new TextDecoder().decode(initialOnlineCheckpoint(sectorInit(snapshot)).bytes)) as Checkpoint;
  const wrap = (checkpoint: Checkpoint, generation = 1, sequence = 19): SessionMirror => { const bytes = new TextEncoder().encode(JSON.stringify(checkpoint)); return { bytes, metadata: { version: 1, protocolVersion: 2, roomId: snapshot.roomId, runId: snapshot.runId,
    hostGeneration: generation, checkpointSequence: sequence, capturedTick: checkpoint.snapshot.header.tick, compatibility: snapshot.compatibility, payloadSha256: createHash('sha256').update(bytes).digest('hex') } }; };
  let committed = wrap(cp);
  const subscribers = new Set<(e: any) => void>(), authorities: ReturnType<typeof createAuthority>[] = [];
  const emit = (e: any) => { for (const cb of [...subscribers]) cb(structuredClone(e)); };
  let loseClaimReply = false, omitClaimEvent = false, claimGate: Promise<void> | undefined, afterClaim: (() => void) | undefined;
  function player(ownSeat = 1) {
    let disk: any = null, capture = (_c: any) => {}, leaseIdentity: any, captureId = 0, authority: ReturnType<typeof createAuthority> | undefined;
    const events = new Set<(e: any) => void>(); const broadcast = (e: any) => { for (const cb of [...events]) cb(e); }; subscribers.add(broadcast);
    const credential = { version: 1 as const, serviceOrigin: 'http://127.0.0.1:8787', roomId: snapshot.roomId, joinCode: snapshot.joinCode, compatibility: snapshot.compatibility, seatId: ownSeat, seatGeneration: 1, seatToken: 't'.repeat(43) };
    const seat = () => ({ snapshot: structuredClone(snapshot), seatId: ownSeat, seatGeneration: 1, seatToken: credential.seatToken });
    const grant = (nonce: string) => ({ roomId: snapshot.roomId, hostGeneration: snapshot.hostGeneration, hostSeatId: snapshot.hostSeatId, nonce, expiresAtEpochMs: Date.now() + 15000 });
    const service: any = { create: vi.fn(async () => seat()), join: vi.fn(async () => seat()), connect: vi.fn(async () => structuredClone(snapshot)), close: vi.fn(),
      onEvent: (cb: any) => { events.add(cb); return () => events.delete(cb); }, getCheckpoint: vi.fn(async () => structuredClone(committed)),
      putCheckpoint: vi.fn(async (metadata: any, bytes: Uint8Array) => { committed = structuredClone({ metadata, bytes }); }),
      request: vi.fn(async (op: any) => {
        if (op.type === 'rehost-claim') {
          if (claimGate) await claimGate;
          if (snapshot.phase !== 'lost' || op.expectedHostGeneration !== snapshot.hostGeneration) throw { code: 'conflict' };
          snapshot.phase = 'active'; snapshot.hostGeneration++; snapshot.hostSeatId = ownSeat;
          afterClaim?.(); if (!omitClaimEvent) emit({ type: 'host-changed', snapshot, lease: grant(op.nonce) });
          if (loseClaimReply) throw { code: 'timeout' };
          return { kind: 'lease', lease: grant(op.nonce) };
        }
        if (op.type === 'lease-renew') { if (snapshot.phase !== 'active' || snapshot.hostSeatId !== ownSeat) throw { code: 'lease-expired' }; return { kind: 'lease', lease: grant(op.nonce) }; }
        return { kind: 'void' };
      }) };
    const mirrorStore = { load: vi.fn(async () => disk), save: vi.fn(async (next: any) => { disk = structuredClone(next); }), clear: vi.fn(async () => { disk = null; }) };
    const seatStore = { load: vi.fn(async () => credential), save: vi.fn(async () => {}), clear: vi.fn(async () => {}) };
    const controller: any = { onSignal: () => () => {}, onAttemptClosed: () => () => {}, closeAttempt: vi.fn(async () => {}), startAttempt: vi.fn(), receiveSignal: vi.fn() };
    const transport = { controller, onExit: () => () => {}, dispose: vi.fn(async () => {}) };
    const captured = (checkpoint: Checkpoint, cause: any) => { const c = { captureId: ++captureId, capturedTick: checkpoint.snapshot.header.tick, controlRevision: checkpoint.controlRevision, cause, bytes: new TextEncoder().encode(JSON.stringify(checkpoint)) }; capture(c); return c; };
    const host = { onCheckpoint: (cb: any) => { capture = cb; return () => { capture = () => {}; }; }, ackCheckpoint: vi.fn(async () => {}),
      captureCheckpoint: vi.fn(async (cause: any) => { const next = await authority!.requestCheckpoint(cause); return captured(next.checkpoint, cause); }),
      onLeaseRequest: (cb: any) => { cb({ ...leaseIdentity, nonce: 'e'.repeat(32) }); return () => {}; }, applyLease: vi.fn(async () => {}), invalidateLease: vi.fn(async () => {}), completeBootstrap: vi.fn(async () => {}),
      request: vi.fn(async (op: any) => {
        authority = createAuthority({ clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, contentDigest: snapshot.compatibility.contentDigest, resolveLayout: () => parseShip(skiff), onCrash: r => { throw Error(r.error); } });
        authorities.push(authority); authority.restore(JSON.parse(new TextDecoder().decode(op.checkpointBytes))); return { ok: true as const, requestId: 1, hostGeneration: snapshot.hostGeneration };
      }), attachPeer: vi.fn(async () => {}), onExit: () => () => {}, dispose: vi.fn(async () => { authority?.dispose(); }), transport: controller };
    const platform = { startLeasedHost: vi.fn(async (_i: any, _s: AbortSignal, identity: any) => { leaseIdentity = identity; return host; }), createTransport: vi.fn(async () => transport), channel: () => ({ port1: { close: vi.fn() }, port2: { close: vi.fn() } }) as any, publishPort: vi.fn(), onVisibleGone: () => () => {} };
    const owner = createOnlineSession({ config: { enabled: true, baseUrl: credential.serviceOrigin, allowInsecureLocalhost: true }, service: () => service, platform, seatStore, mirrorStore,
      clock: { nowMs: () => Date.now(), epochMs: () => Date.now() }, scheduler: { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: id => clearTimeout(id as any) }, nonce: () => 'f'.repeat(32) });
    cleanups.push(async () => { await owner.dispatch({ type: 'forget-seat' }); await owner.dispose(); subscribers.delete(broadcast); });
    return { owner, service, host, platform, transport, mirrorStore, seatStore, events, setDisk: (next: any) => { disk = next; }, restored: () => authority!.checkpoint([]) };
  }
  return { snapshot, cp, wrap, player, authorities, emit, committed: () => committed, setCommitted: (m: SessionMirror) => { committed = m; },
    loseReply: () => { loseClaimReply = true; }, omitEvent: () => { omitClaimEvent = true; }, blockClaim: (p: Promise<void>) => { claimGate = p; }, onClaim: (fn: () => void) => { afterClaim = fn; } };
}

describe('manual committed-session recovery', () => {
  it('retains service identity and receipt age while saved; only lost service state permits re-host', async () => {
    const r = room(), p = r.player(); await p.owner.dispatch({ type: 'reconnect' });
    expect(p.owner.status()).toMatchObject({ phase: 'saved', ownSeat: 1, snapshot: { hostGeneration: 3 }, mirror: { receivedAgeMs: expect.any(Number) } });
    expect(p.owner.status().actions).toContain('rehost'); expect(r.authorities).toHaveLength(0);
    r.snapshot.phase = 'active'; r.emit({ type: 'roster', snapshot: r.snapshot }); expect(p.owner.status().actions).not.toContain('rehost');
  });
  it('retains saved identity and receipt after an unavailable reconnect exhausts its retry budget', async () => {
    vi.useFakeTimers(); const r = room(), p = r.player(); await p.owner.dispatch({ type: 'reconnect' });
    p.service.join.mockRejectedValue({ code: 'unavailable' }); const retry = p.owner.dispatch({ type: 'reconnect' });
    await vi.advanceTimersByTimeAsync(30000); await retry;
    expect(p.owner.status()).toMatchObject({ phase: 'saved', ownSeat: 1, snapshot: { runId: r.snapshot.runId }, mirror: { committed: r.committed().metadata } });
    expect(p.owner.status().actions).toContain('reconnect'); expect(p.owner.status().actions).not.toContain('rehost');
  });
  it('surfaces oversized disk-load diagnosis in the saved-session status', async () => {
    const r = room(), p = r.player(); p.mirrorStore.load.mockRejectedValue({ code: 'save-too-large' }); p.service.getCheckpoint.mockRejectedValue({ code: 'no-checkpoint' });
    await p.owner.dispatch({ type: 'reconnect' }); expect(p.owner.status().mirror.error).toBe('save-too-large'); expect(p.owner.status().actions).not.toContain('rehost');
  });
  it('coalesces clicks and restores only post-claim committed bytes with a fresh paused generation baseline', async () => {
    const r = room(), p = r.player(), gate = deferred<void>(); await p.owner.dispatch({ type: 'reconnect' }); r.blockClaim(gate.promise);
    const first = p.owner.dispatch({ type: 'rehost' }), second = p.owner.dispatch({ type: 'rehost' });
    await vi.waitFor(() => expect(p.service.request.mock.calls.some((c: any) => c[0].type === 'rehost-claim')).toBe(true));
    expect(p.owner.status().phase).toBe('rehosting'); expect(p.owner.status().ownSeat).toBe(1);
    const next = structuredClone(r.cp); next.heldHighWater = [7, 11]; r.onClaim(() => r.setCommitted(r.wrap(next, 2, 23))); gate.resolve();
    expect(await first).toEqual({ ok: true }); expect(await second).toEqual({ ok: true });
    expect(r.authorities).toHaveLength(1); const restored = p.restored();
    expect(restored.init.runId).toBe(r.committed().metadata.runId); expect(restored.phase).toBe('paused'); expect(restored.heldHighWater).toEqual([7, 11]);
    expect(restored.held.every(h => !h.moveX && !h.moveY && !h.interactHeld)).toBe(true);
    expect(r.committed().metadata).toMatchObject({ hostGeneration: 4, checkpointSequence: 1 });
    expect(p.host.completeBootstrap).not.toHaveBeenCalled(); expect(p.platform.publishPort).toHaveBeenCalledOnce();
    expect(p.service.join).toHaveBeenCalledOnce();
  });
  it('two contenders allocate exactly one authority; the loser follows the service winner', async () => {
    const r = room(), a = r.player(0), b = r.player(1); await a.owner.dispatch({ type: 'reconnect' }); await b.owner.dispatch({ type: 'reconnect' });
    await Promise.all([a.owner.dispatch({ type: 'rehost' }), b.owner.dispatch({ type: 'rehost' })]);
    expect(r.authorities).toHaveLength(1); expect(a.platform.startLeasedHost.mock.calls.length + b.platform.startLeasedHost.mock.calls.length).toBe(1);
    const loser = r.snapshot.hostSeatId === 0 ? b : a; expect(loser.owner.status().snapshot?.hostSeatId).toBe(r.snapshot.hostSeatId);
  });
  it('queries the same connection after a lost successful reply before constructing an authority', async () => {
    const r = room(), p = r.player(); r.loseReply(); await p.owner.dispatch({ type: 'reconnect' });
    expect(await p.owner.dispatch({ type: 'rehost' })).toEqual({ ok: true }); expect(r.authorities).toHaveLength(1);
    const renewals = p.service.request.mock.calls.filter((c: any) => c[0].type === 'lease-renew'); expect(renewals.length).toBeGreaterThanOrEqual(2);
    expect(p.service.join).toHaveBeenCalledOnce();
  });
  it('missing claim event reconnects to actual service state and never creates a guessed authority', async () => {
    const r = room(), p = r.player(); r.loseReply(); r.omitEvent(); await p.owner.dispatch({ type: 'reconnect' });
    const join = p.service.join.getMockImplementation();
    p.service.join.mockImplementation(async () => { r.snapshot.phase = 'lost'; return join(); });
    expect((await p.owner.dispatch({ type: 'rehost' })).ok).toBe(false);
    expect(p.owner.status()).toMatchObject({ phase: 'saved', snapshot: { hostGeneration: 4, phase: 'lost' } });
    expect(r.authorities).toHaveLength(0); expect(p.owner.status().actions).toContain('rehost');
  });
  it('post-claim corruption releases the won lease and remains recoverable without using the preflight bytes', async () => {
    const r = room(), p = r.player(); await p.owner.dispatch({ type: 'reconnect' });
    r.onClaim(() => { const bad = structuredClone(r.committed()); bad.bytes[0] = 0; r.setCommitted(bad); });
    expect((await p.owner.dispatch({ type: 'rehost' })).ok).toBe(false); expect(r.authorities).toHaveLength(0); expect(p.owner.status().phase).toBe('saved');
    expect(p.service.request.mock.calls.some((c: any) => c[0].type === 'host-release')).toBe(true);
  });
  it('host-changed reconnects a surviving client without claiming or carrying the old pending mirror into the new generation', async () => {
    const r = room(), p = r.player(); await p.owner.dispatch({ type: 'reconnect' });
    p.setDisk({ version: 1, serviceOrigin: 'http://127.0.0.1:8787', roomId: r.snapshot.roomId, committed: r.committed(), pending: r.wrap(r.cp, 3, 900) });
    r.snapshot.hostGeneration = 4; r.snapshot.phase = 'active'; r.emit({ type: 'host-changed', snapshot: r.snapshot, lease: {} });
    await vi.waitFor(() => expect(p.owner.status().phase).toBe('connecting'));
    expect(r.authorities).toHaveLength(0); expect(p.service.request.mock.calls.some((c: any) => c[0].type === 'rehost-claim')).toBe(false);
    expect(p.service.putCheckpoint).not.toHaveBeenCalled();
  });
  it('restoration discards old-generation pending upload and resets its sequence despite a larger private sequence', async () => {
    const r = room(), p = r.player(); p.setDisk({ version: 1, serviceOrigin: 'http://127.0.0.1:8787', roomId: r.snapshot.roomId, committed: r.committed(), pending: r.wrap(r.cp, 3, 900) });
    await p.owner.dispatch({ type: 'reconnect' }); await p.owner.dispatch({ type: 'rehost' });
    expect(p.service.putCheckpoint.mock.calls.map((c: any) => [c[0].hostGeneration, c[0].checkpointSequence])).toEqual([[4, 1]]);
  });
  it.each(['run', 'compatibility', 'capacity', 'bytes', 'missing'] as const)('rejects %s preflight without constructing authority or claiming', async kind => {
    const r = room(), p = r.player(); await p.owner.dispatch({ type: 'reconnect' }); const bad = structuredClone(r.committed());
    if (kind === 'run') bad.metadata.runId = 'c'.repeat(32);
    if (kind === 'compatibility') bad.metadata.compatibility.simVersion++;
    if (kind === 'bytes') bad.bytes[0] = 0;
    if (kind === 'missing') p.service.getCheckpoint.mockRejectedValue({ code: 'no-checkpoint' });
    else if (kind === 'capacity') r.setCommitted(r.wrap(JSON.parse(new TextDecoder().decode(initialOnlineCheckpoint({ ...sectorInit(r.snapshot), playerCount: 1 }).bytes))));
    else r.setCommitted(bad);
    expect((await p.owner.dispatch({ type: 'rehost' })).ok).toBe(false); expect(p.owner.status().phase).toBe('saved'); expect(r.authorities).toHaveLength(0);
    expect(p.service.request.mock.calls.filter((c: any) => c[0].type === 'rehost-claim')).toHaveLength(0);
  });
  it('burned-generation roster determines the next claim and obsolete host events cannot retire the winner', async () => {
    const r = room(), p = r.player(); await p.owner.dispatch({ type: 'reconnect' }); const old = [...p.events][0]!;
    r.snapshot.hostGeneration = 7; r.emit({ type: 'roster', snapshot: r.snapshot }); await p.owner.dispatch({ type: 'rehost' });
    expect(p.service.request.mock.calls.find((c: any) => c[0].type === 'rehost-claim')![0].expectedHostGeneration).toBe(7);
    expect(p.platform.startLeasedHost.mock.calls[0]![0].hostGeneration).toBe(8);
    old({ type: 'host-departed', hostGeneration: 3 }); expect(p.owner.status().phase).toBe('syncing');
  });
  it('failed claim stays saved and Forget preempts a late claim without restoring or recreating files', async () => {
    const r = room(), p = r.player(); await p.owner.dispatch({ type: 'reconnect' });
    p.service.request.mockRejectedValueOnce({ code: 'conflict' }); expect(await p.owner.dispatch({ type: 'rehost' })).toMatchObject({ ok: false }); expect(p.owner.status().phase).toBe('saved');
    const gate = deferred<void>(); r.blockClaim(gate.promise); const claim = p.owner.dispatch({ type: 'rehost' });
    await vi.waitFor(() => expect(p.owner.status().phase).toBe('rehosting')); await p.owner.dispatch({ type: 'forget-seat' }); gate.resolve(); await claim;
    expect(p.owner.status().phase).toBe('idle'); expect(r.authorities).toHaveLength(0); expect(await p.mirrorStore.load()).toBeNull();
  });
  it('service invalid-state claim rejection returns from rehosting to saved', async () => {
    const r = room(), p = r.player(); await p.owner.dispatch({ type: 'reconnect' });
    p.service.request.mockRejectedValueOnce({ code: 'invalid-state' });
    expect(await p.owner.dispatch({ type: 'rehost' })).toEqual({ ok: false, code: 'invalid-state' }); expect(p.owner.status().phase).toBe('saved');
  });
  it('retires a late native factory when host loss occurs during restore startup', async () => {
    const r = room(), p = r.player(), ready = deferred<any>(); await p.owner.dispatch({ type: 'reconnect' });
    const create = p.platform.startLeasedHost.getMockImplementation()!;
    p.platform.startLeasedHost.mockImplementation(async (...args) => { const host = await create(...args); await ready.promise; return host; });
    const claim = p.owner.dispatch({ type: 'rehost' }); await vi.waitFor(() => expect(p.platform.startLeasedHost).toHaveBeenCalledOnce());
    r.snapshot.phase = 'lost'; r.emit({ type: 'host-departed', hostGeneration: 4 }); ready.resolve(undefined); await claim;
    expect(r.authorities).toHaveLength(0); expect(p.host.dispose).toHaveBeenCalledOnce(); expect(p.platform.publishPort).not.toHaveBeenCalled(); expect(p.owner.status().phase).toBe('saved');
  });
  it('total exit deadline covers hung capture and shares one cleanup across callers', async () => {
    vi.useFakeTimers(); const r = room(), p = r.player(); await p.owner.dispatch({ type: 'reconnect' }); await p.owner.dispatch({ type: 'rehost' });
    p.host.captureCheckpoint.mockReturnValue(new Promise(() => {})); p.host.captureCheckpoint.mockClear();
    const a = p.owner.prepareExit(), b = p.owner.prepareExit(), c = p.owner.dispose();
    expect(p.owner.status().phase).toBe('saving'); await vi.advanceTimersByTimeAsync(2999); expect(p.host.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await Promise.all([a, b, c]); expect(p.host.captureCheckpoint).toHaveBeenCalledOnce(); expect(p.host.dispose).toHaveBeenCalledOnce();
    expect(p.service.request.mock.calls.filter((c: any) => c[0].type === 'host-release')).toHaveLength(1);
  });
  it('shares the exit deadline across delayed capture, persistence and upload; reentrant Leave cannot duplicate capture', async () => {
    vi.useFakeTimers(); const r = room(), p = r.player(); await p.owner.dispatch({ type: 'reconnect' }); await p.owner.dispatch({ type: 'rehost' });
    const capture = p.host.captureCheckpoint.getMockImplementation()!;
    p.host.captureCheckpoint.mockImplementation(async cause => { await new Promise(resolve => setTimeout(resolve, 1800)); return capture(cause); });
    p.mirrorStore.save.mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 1800)); });
    p.service.putCheckpoint.mockReturnValue(new Promise(() => {})); p.host.captureCheckpoint.mockClear();
    const off = p.owner.subscribe(s => { if (s.phase === 'saving') void p.owner.dispatch({ type: 'leave' }); });
    const leave = p.owner.dispatch({ type: 'leave' }); await vi.advanceTimersByTimeAsync(3000); await leave;
    expect(p.host.captureCheckpoint).toHaveBeenCalledOnce(); expect(p.host.dispose).toHaveBeenCalledOnce(); expect(p.owner.status().phase).toBe('idle'); off();
  });
  it('trusted suspend invalidates before retiring; OS resume never invokes gameplay Resume', async () => {
    const r = room(), p = r.player(); await p.owner.dispatch({ type: 'reconnect' }); await p.owner.dispatch({ type: 'rehost' });
    await p.owner.suspend(); expect(p.host.invalidateLease).toHaveBeenCalledWith('suspended');
    expect(p.host.invalidateLease.mock.invocationCallOrder[0]).toBeLessThan(p.host.dispose.mock.invocationCallOrder[0]!);
    await p.owner.resume(); expect(p.host.completeBootstrap).not.toHaveBeenCalled(); expect(p.host.request.mock.calls.map((c: any) => c[0].kind)).toEqual(['restore']);
  });
});
