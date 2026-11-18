import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { harness } from './helpers/onlineHarness';
import { createRoomServiceClient, type RoomServiceSocket, type RoomServiceSocketEvent } from '../src/network/session/serviceClient';
import { startWorkerHost, type HostPlatform } from '../src/network/host/workerHost';

// Scope: three layers of the lease relay, each shown to move a renewal request or its grant with no timer callback.
//  1. the onlineSession coordinator (bridgeLease), with its scheduler frozen;
//  2. the real serviceClient over a fake socket, with fake timers that are never advanced;
//  3. the real workerHost over a fake Worker, with fake timers that are never advanced.
// Timers that only bound failure (the 5 s request deadline) may be scheduled but never fire. The setTimeout(0) yield in
// serviceClient's readBytes belongs to HTTP checkpoint bodies, not to the WebSocket lease-renew path.
afterEach(() => vi.useRealTimers());

describe('the lease relay is event-driven (web build spec §3.5, fail path)', () => {
  it('relays each renewal request to the service and the grant back to the host with no session timer callback', async () => {
    const scheduled: number[] = [];
    const frozen = { setTimeout: (_cb: () => void, ms: number) => { scheduled.push(ms); return scheduled.length; }, clearTimeout: () => {} };
    const h = harness(1, 0, 0, 'http://127.0.0.1:8787', frozen);
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true });
    expect(await h.owner.dispatch({ type: 'start' })).toEqual({ ok: true });
    for (const nonce of ['1', '2', '3'].map(digit => digit.repeat(32))) {
      h.renewal(nonce);
      await vi.waitFor(() => expect(h.host.applyLease).toHaveBeenCalledWith(expect.objectContaining({ nonce }), expect.objectContaining({ nonce })));
    }
    expect(scheduled.every(ms => ms > 0)).toBe(true);   // no zero-delay yield was scheduled on the frozen scheduler
    expect(h.service.request.mock.calls.filter((call: any) => call[0].type === 'lease-renew').length).toBeGreaterThanOrEqual(4);   // the start's grant plus three
    await h.owner.dispose();
  });

  it('the real service client sends a lease-renew frame and resolves its grant on socket events alone', async () => {
    vi.useFakeTimers();
    const sent: string[] = []; const listeners = new Map<string, Set<(e: RoomServiceSocketEvent) => void>>(); let sequence = 0;
    const socket: RoomServiceSocket = { readyState: 1, bufferedAmount: 0, send: v => { sent.push(v); }, close() {},
      addEventListener: (t, cb) => { const set = listeners.get(t) ?? new Set(); set.add(cb); listeners.set(t, set); }, removeEventListener: (t, cb) => { listeners.get(t)?.delete(cb); } };
    const emit = (payload: unknown) => { for (const cb of [...listeners.get('message') ?? []]) cb({ type: 'message', data: JSON.stringify({ sequence: ++sequence, payload }) }); };
    const compatibility = { protocolVersion: 2, modeId: 'opaque', schemaVersion: 2, simVersion: 35, contentDigest: 'a'.repeat(64), layoutHash: 'b87a0284' } as const;
    const snapshot = { roomId: '1'.repeat(32), runId: '2'.repeat(32), joinCode: 'ABCDEFGH', compatibility, capacity: 2, hostSeatId: 0, hostGeneration: 1, phase: 'lobby', rosterRevision: 1,
      seats: [0, 1].map(seatId => ({ seatId, seatGeneration: 1, occupied: true, connected: true, ready: false })) } as const;
    const session = { snapshot, seatId: 0, seatGeneration: 1, seatToken: 'T'.repeat(43) } as never;
    const delays: number[] = [];
    const clock = { nowMs: () => Date.now(), setTimeout: (cb: () => void, ms: number) => { delays.push(ms); return setTimeout(cb, ms); }, clearTimeout: (id: unknown) => clearTimeout(id as never) };
    const fetch = async (url: string) => Response.json(url.endsWith('/socket-ticket') ? { ticket: 'S'.repeat(43), connectionId: '3'.repeat(32), expiresAtEpochMs: Date.now() + 5000 } : session);
    const c = createRoomServiceClient({ baseUrl: 'https://service', fetch, createWebSocket: () => socket, clock });
    const waiting = c.connect(session); await vi.waitFor(() => expect(sent).toHaveLength(1));
    emit({ type: 'authenticated', session: { snapshot, seatId: 0, seatGeneration: 1 } }); await waiting;
    const before = delays.length, nonce = '4'.repeat(32);
    const renewing = c.request({ type: 'lease-renew', nonce });
    expect(JSON.parse(sent.at(-1)!)).toMatchObject({ type: 'lease-renew', nonce });   // sent synchronously, before any timer
    emit({ type: 'reply', requestId: JSON.parse(sent.at(-1)!).requestId, outcome: { kind: 'lease', lease: { roomId: snapshot.roomId, hostGeneration: 1, hostSeatId: 0, nonce, expiresAtEpochMs: Date.now() + 15000 } } });
    await expect(renewing).resolves.toMatchObject({ kind: 'lease' });   // resolved with no timer advanced
    expect(delays.slice(before).every(ms => ms >= 1000)).toBe(true);   // only the failure deadline was ever scheduled
    c.close();
  });

  it('the real Worker host hands a renewal request to its observer and posts the grant on message events alone', async () => {
    vi.useFakeTimers();
    const worker = new EventEmitter(), sent: any[] = [];
    const platform: HostPlatform = {
      spawn: () => ({ postMessage(message) { sent.push(message); }, onMessage(cb) { worker.on('message', cb); return () => worker.off('message', cb); },
        onExit(cb) { worker.on('exit', cb); return () => worker.off('exit', cb); }, kill() {} }),
      createTransport: () => ({ controller: { startAttempt: vi.fn(), receiveSignal: vi.fn(), onSignal: vi.fn(), onAttemptClosed: vi.fn(), closeAttempt: vi.fn(), dispose: vi.fn() } as never,
        connect() {}, onExit: () => () => {}, dispose() {} }),
      createChannel: () => ({ port1: { close() {} }, port2: { close() {} } }) as never, onSuspend: () => () => {}, onResume: () => () => {} };
    const identity = { modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
    const sessionLease = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 7, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) };
    const starting = startWorkerHost({ ...identity, sessionLease }, platform);
    await Promise.resolve(); await Promise.resolve();
    worker.emit('message', { kind: 'ready', protocolVersion: 2, ...identity }); await Promise.resolve();
    worker.emit('message', { kind: 'transport-ready', hostGeneration: 7 });
    const host = await starting; const requests: any[] = []; host.onLeaseRequest(r => requests.push(r));
    const request = { ...sessionLease, nonce: 'd'.repeat(32) };
    worker.emit('message', { kind: 'lease-request', hostGeneration: 7, request });
    expect(requests).toEqual([request]);   // delivered synchronously, no timer advanced
    const grant = { roomId: sessionLease.roomId, hostGeneration: 7, hostSeatId: 0, nonce: request.nonce, expiresAtEpochMs: 15000 };
    const applying = host.applyLease(request, grant);
    expect(sent.at(-1)).toMatchObject({ kind: 'lease-grant' });   // posted synchronously
    worker.emit('message', { kind: 'response', response: { requestId: sent.at(-1).requestId, hostGeneration: 7, ok: true } }); await applying;
    const disposing = host.dispose(); worker.emit('message', { kind: 'response', response: { requestId: sent.at(-1).requestId, hostGeneration: 7, ok: true } }); await disposing;
  });
});
