import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawnHostWorker, startWorkerHost, type HostPlatform } from '../src/network/host/workerHost';

const identity = { modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
class Port { closed = false; close() { this.closed = true; } }
function harness() {
  const worker = new EventEmitter(), transport = new EventEmitter(), suspend = new EventEmitter();
  const sent: any[] = [], ports: Port[] = [], connected: unknown[] = [];
  let killed = 0, transportDisposed = 0, failTransfer = false, failConnect = false;
  const platform: HostPlatform = {
    spawn: () => ({ postMessage(message, transfer) { if (failTransfer && transfer?.length) throw Error('transfer'); sent.push(message); },
      onMessage(cb) { worker.on('message', cb); return () => worker.off('message', cb); },
      onExit(cb) { worker.on('exit', cb); return () => worker.off('exit', cb); }, kill() { killed++; } }),
    createTransport: () => ({ controller: { startAttempt: vi.fn(), receiveSignal: vi.fn(), onSignal: vi.fn(), onAttemptClosed: vi.fn(), closeAttempt: vi.fn(), dispose: vi.fn() } as never,
      connect(port) { if (failTransfer || failConnect) throw Error('transfer'); connected.push(port); },
      onExit(cb) { transport.on('exit', cb); return () => transport.off('exit', cb); }, dispose() { transportDisposed++; } }),
    createChannel: () => { const a = new Port(), b = new Port(); ports.push(a, b); return { port1: a, port2: b } as never; },
    onSuspend(cb) { suspend.on('suspend', cb); return () => suspend.off('suspend', cb); },
    onResume(cb) { suspend.on('resume', cb); return () => suspend.off('resume', cb); }
  };
  const ready = async (overrides = {}) => {
    await Promise.resolve(); await Promise.resolve();
    worker.emit('message', { kind: 'ready', protocolVersion: 2, ...identity, ...overrides });
    await Promise.resolve();
    worker.emit('message', { kind: 'transport-ready', hostGeneration: 7 });
  };
  const response = (requestId: number | null, overrides = {}) => worker.emit('message', { kind: 'response', response: { requestId, hostGeneration: 7, ok: true, ...overrides } });
  return { platform, sent, ports, connected, ready, response, worker, transport, suspend,
    failTransfer() { failTransfer = true; }, failConnect() { failConnect = true; }, counts: () => [killed, transportDisposed] };
}
afterEach(() => vi.useRealTimers());
describe('the host Worker owner (web build spec §3.2)', () => {
  it('deduplicates private capture delivery, copies observer bytes and acknowledges only adopted IDs', async () => {
    const h = harness(), starting = startWorkerHost(identity, h.platform); await h.ready(); const owner = await starting;
    const candidate = { captureId: 1, capturedTick: 0, controlRevision: 0, cause: 'initial', bytes: new Uint8Array([4]) };
    h.worker.emit('message', { kind: 'checkpoint', hostGeneration: 7, candidate });
    const seen: any[] = []; owner.onCheckpoint(c => { seen.push(c); c.bytes[0] = 99; });
    const requested = owner.captureCheckpoint('exit');
    const exit = { ...candidate, captureId: 2, cause: 'exit' };
    h.worker.emit('message', { kind: 'checkpoint', hostGeneration: 7, candidate: exit });
    h.worker.emit('message', { kind: 'captured', requestId: 1, hostGeneration: 7, ok: true, candidate: exit });
    expect((await requested).bytes).toEqual(new Uint8Array([4]));
    expect(seen.map(c => c.captureId)).toEqual([1, 2]);
    const late: any[] = []; owner.onCheckpoint(c => late.push(c)); expect(late[0].bytes).toEqual(new Uint8Array([4]));
    await expect(owner.ackCheckpoint(3)).rejects.toThrow('capture-unavailable');
    const ack = owner.ackCheckpoint(2); expect(h.sent.at(-1)).toMatchObject({ kind: 'ack-checkpoint', captureId: 2 }); h.response(2); await ack;
    const disposing = owner.dispose(); h.response(3); await disposing;
  });
  it.each([{ bytes: new Uint8Array(262145) }, { captureId: 0 }, { cause: 'unknown' }, { capturedTick: -1 }, { extra: true }])('rejects malformed private capture %j', bad => {
    const h = harness(), starting = startWorkerHost(identity, h.platform);
    const rejected = expect(starting).rejects.toThrow('protocol-failure');
    h.worker.emit('message', { kind: 'checkpoint', hostGeneration: 7, candidate: { captureId: 1, capturedTick: 0, controlRevision: 0, cause: 'initial', bytes: new Uint8Array([4]), ...bad } });
    return rejected;
  });
  it('invalidates leased capability on both trusted suspend and resume and removes observers', async () => {
    const h = harness(), sessionLease = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 7, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) };
    const starting = startWorkerHost({ ...identity, sessionLease }, h.platform); await h.ready(); const owner = await starting;
    h.suspend.emit('suspend'); expect(h.sent.at(-1)).toMatchObject({ kind: 'lease-invalidate', reason: 'suspended' }); h.response(1);
    h.suspend.emit('resume'); expect(h.sent.at(-1)).toMatchObject({ kind: 'lease-invalidate', reason: 'resumed' }); h.response(2);
    const disposing = owner.dispose(); h.response(3); await disposing; expect(h.suspend.eventNames()).toEqual([]);
  });
  it('retains only the latest renewal before readiness and retires stale replies locally', async () => {
    const h = harness(), sessionLease = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 7, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) };
    const p = startWorkerHost({ ...identity, sessionLease }, h.platform);
    const first = { ...sessionLease, nonce: 'd'.repeat(32) }, second = { ...sessionLease, nonce: 'e'.repeat(32) };
    h.worker.emit('message', { kind: 'lease-request', hostGeneration: 7, request: first });
    h.worker.emit('message', { kind: 'lease-request', hostGeneration: 7, request: second });
    await h.ready(); const owner = await p, requests: unknown[] = []; owner.onLeaseRequest(r => requests.push(r));
    expect(requests).toEqual([second]);
    const grant = { roomId: sessionLease.roomId, hostGeneration: 7, hostSeatId: 0, nonce: first.nonce, expiresAtEpochMs: 15000 };
    await expect(owner.applyLease(first, grant)).rejects.toThrow('stale-lease');
    const applying = owner.applyLease(second, { ...grant, nonce: second.nonce }); expect(h.sent.at(-1).kind).toBe('lease-grant'); h.response(1); await applying;
    const completing = owner.completeBootstrap(); expect(h.sent.at(-1).kind).toBe('bootstrap-complete'); h.response(2); await completing;
    const disposing = owner.dispose(); h.response(3); await disposing;
  });
  it('forwards trusted streaming and actual RTC cap while rejecting missing caps before transfer', async () => {
    const h = harness(), starting = startWorkerHost(identity, h.platform); await h.ready(); const owner = await starting;
    const bad = new Port(); await expect(owner.attachPeer('p', [0], bad as never, { streamed: true })).rejects.toThrow('invalid-peer'); expect(bad.closed).toBe(true);
    const offered = new Port(), attaching = owner.attachPeer('p', [0], offered as never, { streamed: true, latestPayloadLimit: 4096 });
    expect(h.sent.at(-1)).toMatchObject({ kind: 'attach', options: { streamed: true, latestPayloadLimit: 4096 } });
    h.worker.emit('message', { kind: 'attached', requestId: 1, hostGeneration: 7, ok: true }); await attaching;
    const disposing = owner.dispose(); h.response(2); await disposing;
  });
  it('stamps only owner IDs, rejects caller stamps and resolves bounded response bytes', async () => {
    const h = harness(), starting = startWorkerHost(identity, h.platform); await h.ready(); const owner = await starting;
    await expect(owner.request({ kind: 'checkpoint', requestId: 99 } as never)).rejects.toThrow('invalid-command');
    const pending = owner.request({ kind: 'checkpoint' });
    expect(h.sent.at(-1).command).toEqual({ kind: 'checkpoint', requestId: 1, hostGeneration: 7 });
    h.response(1, { checkpointBytes: new Uint8Array([4]) }); expect((await pending).ok).toBe(true);
    const disposing = owner.dispose(); h.response(2); await disposing; expect(h.counts()).toEqual([1, 1]);
    await owner.dispose(); await expect(owner.request({ kind: 'checkpoint' })).rejects.toThrow('disposed');
  });
  it.each([{ protocolVersion: 1 }, { modeId: 'wrong' }, { contentDigest: 'b'.repeat(64) }])('rejects incompatible ready identity %j', async bad => {
    const h = harness(), pending = startWorkerHost(identity, h.platform); const rejected = expect(pending).rejects.toThrow('incompatible-ready');
    await h.ready(bad); await rejected; expect(h.counts()).toEqual([1, 1]);
  });
  it('times out startup after five seconds and cancels startup without leaking resources', async () => {
    vi.useFakeTimers(); const h = harness(), pending = startWorkerHost(identity, h.platform);
    const rejected = expect(pending).rejects.toThrow('ready-timeout'); await vi.advanceTimersByTimeAsync(5000); await rejected;
    expect(h.counts()).toEqual([1, 1]);
    const abort = new AbortController(), h2 = harness(), p2 = startWorkerHost({ ...identity, signal: abort.signal }, h2.platform);
    const cancelled = expect(p2).rejects.toThrow('cancelled'); abort.abort(); await cancelled; expect(h2.counts()).toEqual([1, 1]);
  });
  it.each(['worker', 'transport'] as const)('rejects pending once and disposes its pair on %s exit', async source => {
    const h = harness(), p = startWorkerHost(identity, h.platform); await h.ready(); const owner = await p;
    const reasons: string[] = []; owner.onExit(reason => reasons.push(reason));
    const request = owner.request({ kind: 'checkpoint' }); const rejected = expect(request).rejects.toThrow(`${source}-exit`);
    h[source].emit('exit'); h[source].emit('exit'); await rejected; expect(reasons).toEqual([`${source}-exit`]); expect(h.counts()).toEqual([1, 1]);
  });
  it('closes both half-transferred ports on connection failure', async () => {
    const h = harness(); h.failTransfer(); const p = startWorkerHost(identity, h.platform), rejected = expect(p).rejects.toThrow('transfer-failed');
    await h.ready(); await rejected; expect(h.ports.every(port => port.closed)).toBe(true); expect(h.counts()).toEqual([1, 1]);
  });
  it('closes the untransferred half when the page transport refuses the port', async () => {
    const h = harness(); h.failConnect(); const p = startWorkerHost(identity, h.platform), rejected = expect(p).rejects.toThrow('transfer-failed');
    await h.ready(); await rejected; expect(h.ports[1]!.closed).toBe(true); expect(h.counts()).toEqual([1, 1]);
  });
  it('transfers the transport port once the Worker is ready and resolves only on its validated transport-ready', async () => {
    const h = harness(), p = startWorkerHost(identity, h.platform); let settled = false; void p.then(() => { settled = true; });
    h.worker.emit('message', { kind: 'transport-ready', hostGeneration: 7 }); expect(h.ports).toHaveLength(0);
    h.worker.emit('message', { kind: 'ready', protocolVersion: 2, ...identity });
    expect(h.ports).toHaveLength(2); expect(h.sent.at(-1)).toMatchObject({ kind: 'transport', protocolVersion: 2, ...identity }); expect(h.connected).toEqual([h.ports[1]]);
    await Promise.resolve(); expect(settled).toBe(false);
    h.worker.emit('message', { kind: 'transport-ready', hostGeneration: 6 }); await Promise.resolve(); expect(settled).toBe(false);
    h.worker.emit('message', { kind: 'transport-ready', hostGeneration: 7 });
    const owner = await p, dispose = owner.dispose(); h.response(1); await dispose;
  });
  it('ignores stale generations but fails duplicate and uncorrelated responses', async () => {
    for (const invalid of ['duplicate', 'null']) {
      const h = harness(), p = startWorkerHost(identity, h.platform); await h.ready(); const owner = await p;
      const request = owner.request({ kind: 'checkpoint' }); h.response(1, { hostGeneration: 6 });
      h.response(1); await request;
      const next = owner.request({ kind: 'checkpoint' }); const rejected = expect(next).rejects.toThrow('protocol-failure');
      h.response(invalid === 'null' ? null : 1); await rejected; expect(h.counts()).toEqual([1, 1]);
    }
  });
  it('bounds request timeout and disposal even when the Worker is unresponsive', async () => {
    vi.useFakeTimers(); const h = harness(), p = startWorkerHost(identity, h.platform); await h.ready(); const owner = await p;
    const request = owner.request({ kind: 'checkpoint' }), rejected = expect(request).rejects.toThrow('request-timeout');
    await vi.advanceTimersByTimeAsync(5000); await rejected; await owner.dispose(); expect(h.counts()).toEqual([1, 1]);
    const h2 = harness(), p2 = startWorkerHost(identity, h2.platform); await h2.ready(); const owner2 = await p2;
    const dispose = owner2.dispose(); await vi.advanceTimersByTimeAsync(250); await dispose; expect(h2.counts()).toEqual([1, 1]);
  });
  it('suspends with a trusted pause and keeps resume paused', async () => {
    const h = harness(), p = startWorkerHost(identity, h.platform); await h.ready(); const owner = await p;
    h.suspend.emit('suspend'); expect(h.sent.at(-1).command).toMatchObject({ kind: 'pause', reason: 'system-suspend' });
    h.response(1); h.suspend.emit('resume'); expect(h.sent).toHaveLength(3);
    const dispose = owner.dispose(); h.response(2); await dispose;
  });
  it('owns transferred peer ports and rejects invalid or failed attachments', async () => {
    const h = harness(), p = startWorkerHost(identity, h.platform); await h.ready(); const owner = await p;
    const bad = new Port(); await expect(owner.attachPeer('', [0], bad as never)).rejects.toThrow('invalid-peer'); expect(bad.closed).toBe(true);
    const port = new Port(), attaching = owner.attachPeer('host', [0], port as never);
    h.worker.emit('message', { kind: 'attached', requestId: 1, hostGeneration: 7, ok: true }); await attaching;
    h.failTransfer(); const failed = new Port(); await expect(owner.attachPeer('other', [0], failed as never)).rejects.toThrow('transfer-failed');
    expect(failed.closed).toBe(true); expect(h.counts()).toEqual([1, 1]);
  });
  it('forwards bounded opaque crash records and cleans up even when the observer throws', async () => {
    const h = harness(), records: unknown[] = [];
    const p = startWorkerHost({ ...identity, onCrash(record) { records.push(record); throw Error('observer'); } }, h.platform);
    await h.ready(); const owner = await p;
    const request = owner.request({ kind: 'checkpoint' }), rejected = expect(request).rejects.toThrow('authority-crash');
    h.worker.emit('message', { kind: 'crash', hostGeneration: 7, record: { checkpoint: new Uint8Array([8]), diagnostic: { modeFault: 4 } } });
    await rejected; expect(records).toEqual([{ checkpoint: new Uint8Array([8]), diagnostic: { modeFault: 4 } }]); expect(h.counts()).toEqual([1, 1]);
  });
  it('reports a Worker fatal as a protocol failure of the Worker', async () => {
    const h = harness(), p = startWorkerHost(identity, h.platform); await h.ready(); const owner = await p, reasons: string[] = [];
    owner.onExit(reason => reasons.push(reason)); h.worker.emit('message', { kind: 'fatal', hostGeneration: 7, reason: 'invalid-message' });
    expect(reasons).toEqual(['worker-protocol-failure']); expect(h.counts()).toEqual([1, 1]);
  });
});
describe('the Worker spawn adapter (web build spec §3.2)', () => {
  class FakeWorker extends EventTarget { posted: unknown[][] = []; terminated = 0; postMessage(m: unknown, t: Transferable[]) { this.posted.push([m, t]); } terminate() { this.terminated++; } }
  it('forwards message data and transfers, and reports one exit after terminate', async () => {
    const native = new FakeWorker(), worker = spawnHostWorker(() => native), seen: unknown[] = [], exits = vi.fn();
    worker.onMessage(m => seen.push(m)); worker.onExit(exits);
    native.dispatchEvent(Object.assign(new Event('message'), { data: { kind: 'ready' } }));
    const channel = new MessageChannel(); worker.postMessage({ kind: 'transport' }, [channel.port1]);
    expect(native.posted[0]).toEqual([{ kind: 'transport' }, [channel.port1]]); expect(seen).toEqual([{ kind: 'ready' }]);
    worker.kill(); worker.kill(); await Promise.resolve();
    expect(native.terminated).toBe(1); expect(exits).toHaveBeenCalledOnce();
    expect(() => worker.postMessage({ kind: 'late' })).toThrow('worker-exited');
    channel.port1.close(); channel.port2.close();
  });
  it('treats a Worker error as an exit, prevents its default report and terminates it', () => {
    const native = new FakeWorker(), worker = spawnHostWorker(() => native), exits = vi.fn(); worker.onExit(exits);
    const error = new Event('error', { cancelable: true }); native.dispatchEvent(error);
    expect(error.defaultPrevented).toBe(true); expect(native.terminated).toBe(1); expect(exits).toHaveBeenCalledOnce();
    const late = vi.fn(); worker.onExit(late); expect(late).toHaveBeenCalledOnce();
  });
});
