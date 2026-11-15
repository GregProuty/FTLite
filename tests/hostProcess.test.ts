import { afterEach, describe, expect, it, vi } from 'vitest';
import { startHostProcess, type HostPlatform } from '../src/main/network/hostProcess';
import { EventEmitter } from 'node:events';

const identity = { modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
class Port { closed = false; close() { this.closed = true; } }
function harness() {
  const utility = new EventEmitter(), transport = new EventEmitter(), suspend = new EventEmitter();
  const sent: any[] = [], ports: Port[] = [];
  let utilityKilled = 0, windowClosed = 0, failTransfer = false, failWindowTransfer = false;
  const platform: HostPlatform = {
    spawn: () => ({ postMessage(message, transfer) { if (failTransfer && transfer?.length) throw Error('transfer'); sent.push(message); },
      onMessage(cb) { utility.on('message', cb); return () => utility.off('message', cb); },
      onExit(cb) { utility.on('exit', cb); return () => utility.off('exit', cb); }, kill() { utilityKilled++; } }),
    createTransport: () => ({ controller: { startAttempt: vi.fn(), receiveSignal: vi.fn(), onSignal: vi.fn(), onAttemptClosed: vi.fn(), closeAttempt: vi.fn(), dispose: vi.fn() }, async load() {}, connect() { if (failTransfer || failWindowTransfer) throw Error('transfer'); },
      onReady(cb) { transport.on('ready', cb); return () => transport.off('ready', cb); },
      onExit(cb) { transport.on('exit', cb); return () => transport.off('exit', cb); }, dispose() { windowClosed++; } }),
    createChannel: () => { const a = new Port(), b = new Port(); ports.push(a, b); return { port1: a, port2: b } as any; },
    onSuspend(cb) { suspend.on('suspend', cb); return () => suspend.off('suspend', cb); },
    onResume(cb) { suspend.on('resume', cb); return () => suspend.off('resume', cb); }
  };
  const ready = async (overrides = {}) => {
    await Promise.resolve(); await Promise.resolve();
    utility.emit('message', { kind: 'ready', protocolVersion: 2, ...identity, ...overrides });
    await Promise.resolve();
    transport.emit('ready'); utility.emit('message', { kind: 'transport-ready', hostGeneration: 7 });
  };
  const response = (requestId: number | null, overrides = {}) => utility.emit('message', { kind: 'response', response: { requestId, hostGeneration: 7, ok: true, ...overrides } });
  return { platform, sent, ports, ready, response, utility, transport, suspend,
    failTransfer() { failTransfer = true; }, failWindowTransfer() { failWindowTransfer = true; }, counts: () => [utilityKilled, windowClosed] };
}
afterEach(() => vi.useRealTimers());
describe('main host process owner', () => {
  it('deduplicates private capture delivery, copies observer bytes and acknowledges only adopted IDs', async () => {
    const h = harness(), starting = startHostProcess(identity, h.platform); await h.ready(); const owner = await starting;
    const candidate = { captureId: 1, capturedTick: 0, controlRevision: 0, cause: 'initial', bytes: new Uint8Array([4]) };
    h.utility.emit('message', { kind: 'checkpoint', hostGeneration: 7, candidate });
    const seen: any[] = []; owner.onCheckpoint(c => { seen.push(c); c.bytes[0] = 99; });
    const requested = owner.captureCheckpoint('exit');
    const exit = { ...candidate, captureId: 2, cause: 'exit' };
    h.utility.emit('message', { kind: 'checkpoint', hostGeneration: 7, candidate: exit });
    h.utility.emit('message', { kind: 'captured', requestId: 1, hostGeneration: 7, ok: true, candidate: exit });
    expect((await requested).bytes).toEqual(new Uint8Array([4]));
    expect(seen.map(c => c.captureId)).toEqual([1, 2]);
    const late: any[] = []; owner.onCheckpoint(c => late.push(c)); expect(late[0].bytes).toEqual(new Uint8Array([4]));
    await expect(owner.ackCheckpoint(3)).rejects.toThrow('capture-unavailable');
    const ack = owner.ackCheckpoint(2); expect(h.sent.at(-1)).toMatchObject({ kind: 'ack-checkpoint', captureId: 2 }); h.response(2); await ack;
    const disposing = owner.dispose(); h.response(3); await disposing;
  });
  it.each([{ bytes: new Uint8Array(262145) }, { captureId: 0 }, { cause: 'unknown' }, { capturedTick: -1 }, { extra: true }])('rejects malformed private capture %j', bad => {
    const h = harness(), starting = startHostProcess(identity, h.platform);
    const rejected = expect(starting).rejects.toThrow('protocol-failure');
    h.utility.emit('message', { kind: 'checkpoint', hostGeneration: 7, candidate: {
      captureId: 1, capturedTick: 0, controlRevision: 0, cause: 'initial', bytes: new Uint8Array([4]), ...bad } });
    return rejected;
  });
  it('invalidates leased capability on both trusted suspend and resume and removes observers', async () => {
    const h = harness(), sessionLease = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 7, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) };
    const starting = startHostProcess({ ...identity, sessionLease }, h.platform); await h.ready(); const owner = await starting;
    h.suspend.emit('suspend'); expect(h.sent.at(-1)).toMatchObject({ kind: 'lease-invalidate', reason: 'suspended' }); h.response(1);
    h.suspend.emit('resume'); expect(h.sent.at(-1)).toMatchObject({ kind: 'lease-invalidate', reason: 'resumed' }); h.response(2);
    const disposing = owner.dispose(); h.response(3); await disposing; expect(h.suspend.eventNames()).toEqual([]);
  });
  it('retains only the latest renewal before readiness and retires stale replies locally', async () => {
    const h = harness(), sessionLease = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 7, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) };
    const p = startHostProcess({ ...identity, sessionLease }, h.platform);
    const first = { ...sessionLease, nonce: 'd'.repeat(32) }, second = { ...sessionLease, nonce: 'e'.repeat(32) };
    h.utility.emit('message', { kind: 'lease-request', hostGeneration: 7, request: first });
    h.utility.emit('message', { kind: 'lease-request', hostGeneration: 7, request: second });
    await h.ready(); const owner = await p, requests: unknown[] = []; owner.onLeaseRequest(r => requests.push(r));
    expect(requests).toEqual([second]);
    const grant = { roomId: sessionLease.roomId, hostGeneration: 7, hostSeatId: 0, nonce: first.nonce, expiresAtEpochMs: 15000 };
    await expect(owner.applyLease(first, grant)).rejects.toThrow('stale-lease');
    const applying = owner.applyLease(second, { ...grant, nonce: second.nonce }); expect(h.sent.at(-1).kind).toBe('lease-grant'); h.response(1); await applying;
    const completing = owner.completeBootstrap(); expect(h.sent.at(-1).kind).toBe('bootstrap-complete'); h.response(2); await completing;
    const disposing = owner.dispose(); h.response(3); await disposing;
  });
  it('forwards trusted streaming and actual RTC cap while rejecting missing caps before transfer', async () => {
    const h = harness(), starting = startHostProcess(identity, h.platform); await h.ready(); const owner = await starting;
    const bad = new Port(); await expect(owner.attachPeer('p', [0], bad as any, { streamed: true })).rejects.toThrow('invalid-peer'); expect(bad.closed).toBe(true);
    const offered = new Port(), attaching = owner.attachPeer('p', [0], offered as any, { streamed: true, latestPayloadLimit: 4096 });
    expect(h.sent.at(-1)).toMatchObject({ kind: 'attach', options: { streamed: true, latestPayloadLimit: 4096 } });
    h.utility.emit('message', { kind: 'attached', requestId: 1, hostGeneration: 7, ok: true }); await attaching;
    const disposing = owner.dispose(); h.response(2); await disposing;
  });
  it('stamps only main IDs, rejects caller stamps and resolves bounded response bytes', async () => {
    const h = harness(), starting = startHostProcess(identity, h.platform); await h.ready(); const owner = await starting;
    await expect(owner.request({ kind: 'checkpoint', requestId: 99 } as any)).rejects.toThrow('invalid-command');
    const pending = owner.request({ kind: 'checkpoint' });
    const command = h.sent.at(-1).command; expect(command).toEqual({ kind: 'checkpoint', requestId: 1, hostGeneration: 7 });
    h.response(1, { checkpointBytes: new Uint8Array([4]) }); expect((await pending).ok).toBe(true);
    const disposing = owner.dispose(); h.response(2); await disposing; expect(h.counts()).toEqual([1, 1]);
    await owner.dispose(); await expect(owner.request({ kind: 'checkpoint' })).rejects.toThrow('disposed');
  });
  it.each([{ protocolVersion: 1 }, { modeId: 'wrong' }, { contentDigest: 'b'.repeat(64) }])('rejects incompatible ready identity %j', async bad => {
    const h = harness(), pending = startHostProcess(identity, h.platform); const rejected = expect(pending).rejects.toThrow('incompatible-ready');
    await h.ready(bad); await rejected; expect(h.counts()).toEqual([1, 1]);
  });
  it('times out startup after five seconds and cancels startup without leaking resources', async () => {
    vi.useFakeTimers(); const h = harness(), pending = startHostProcess(identity, h.platform);
    const rejected = expect(pending).rejects.toThrow('ready-timeout'); await vi.advanceTimersByTimeAsync(5000); await rejected;
    expect(h.counts()).toEqual([1, 1]);
    const abort = new AbortController(), h2 = harness(), p2 = startHostProcess({ ...identity, signal: abort.signal }, h2.platform);
    const cancelled = expect(p2).rejects.toThrow('cancelled'); abort.abort(); await cancelled; expect(h2.counts()).toEqual([1, 1]);
  });
  it.each(['utility', 'transport'] as const)('rejects pending once and disposes its pair on %s exit', async source => {
    const h = harness(), p = startHostProcess(identity, h.platform); await h.ready(); const owner = await p;
    const reasons: string[] = []; owner.onExit(reason => reasons.push(reason));
    const request = owner.request({ kind: 'checkpoint' }); const rejected = expect(request).rejects.toThrow(`${source}-exit`);
    h[source].emit('exit'); h[source].emit('exit'); await rejected; expect(reasons).toEqual([`${source}-exit`]); expect(h.counts()).toEqual([1, 1]);
  });
  it('closes both half-transferred ports on connection failure', async () => {
    const h = harness(); h.failTransfer(); const p = startHostProcess(identity, h.platform), rejected = expect(p).rejects.toThrow('transfer-failed');
    await h.ready(); await rejected; expect(h.ports.every(port => port.closed)).toBe(true); expect(h.counts()).toEqual([1, 1]);
  });
  it('retires transferred utility ownership and closes the untransferred half when the window transfer fails', async () => {
    const h = harness(); h.failWindowTransfer(); const p = startHostProcess(identity, h.platform), rejected = expect(p).rejects.toThrow('transfer-failed');
    await h.ready(); await rejected;
    expect(h.ports[1]!.closed).toBe(true); expect(h.counts()).toEqual([1, 1]);
  });
  it('waits for a validated transport-frame ready before transferring a bridge', async () => {
    const h = harness(), p = startHostProcess(identity, h.platform);
    h.utility.emit('message', { kind: 'ready', protocolVersion: 2, ...identity });
    expect(h.ports).toHaveLength(0);
    h.transport.emit('ready'); expect(h.ports).toHaveLength(2);
    h.utility.emit('message', { kind: 'transport-ready', hostGeneration: 7 });
    const owner = await p, dispose = owner.dispose(); h.response(1); await dispose;
  });
  it('ignores stale generations but fails duplicate and uncorrelated responses', async () => {
    for (const invalid of ['duplicate', 'null']) {
      const h = harness(), p = startHostProcess(identity, h.platform); await h.ready(); const owner = await p;
      const request = owner.request({ kind: 'checkpoint' }); h.response(1, { hostGeneration: 6 });
      h.response(1); await request;
      const next = owner.request({ kind: 'checkpoint' }); const rejected = expect(next).rejects.toThrow('protocol-failure');
      h.response(invalid === 'null' ? null : 1); await rejected; expect(h.counts()).toEqual([1, 1]);
    }
  });
  it('bounds request timeout and disposal even when utility is unresponsive', async () => {
    vi.useFakeTimers(); const h = harness(), p = startHostProcess(identity, h.platform); await h.ready(); const owner = await p;
    const request = owner.request({ kind: 'checkpoint' }), rejected = expect(request).rejects.toThrow('request-timeout');
    await vi.advanceTimersByTimeAsync(5000); await rejected; await owner.dispose(); expect(h.counts()).toEqual([1, 1]);
    const h2 = harness(), p2 = startHostProcess(identity, h2.platform); await h2.ready(); const owner2 = await p2;
    const dispose = owner2.dispose(); await vi.advanceTimersByTimeAsync(250); await dispose; expect(h2.counts()).toEqual([1, 1]);
  });
  it('suspends with a trusted pause and keeps resume paused', async () => {
    const h = harness(), p = startHostProcess(identity, h.platform); await h.ready(); const owner = await p;
    h.suspend.emit('suspend'); expect(h.sent.at(-1).command).toMatchObject({ kind: 'pause', reason: 'system-suspend' });
    h.response(1); h.suspend.emit('resume'); expect(h.sent).toHaveLength(3);
    const dispose = owner.dispose(); h.response(2); await dispose;
  });
  it('owns transferred peer ports and rejects invalid or failed attachments', async () => {
    const h = harness(), p = startHostProcess(identity, h.platform); await h.ready(); const owner = await p;
    const bad = new Port(); await expect(owner.attachPeer('', [0], bad as any)).rejects.toThrow('invalid-peer'); expect(bad.closed).toBe(true);
    const port = new Port(), attaching = owner.attachPeer('host', [0], port as any);
    h.utility.emit('message', { kind: 'attached', requestId: 1, hostGeneration: 7, ok: true }); await attaching;
    h.failTransfer(); const failed = new Port(); await expect(owner.attachPeer('other', [0], failed as any)).rejects.toThrow('transfer-failed');
    expect(failed.closed).toBe(true); expect(h.counts()).toEqual([1, 1]);
  });
  it('forwards bounded opaque crash records and cleans up even when the observer throws', async () => {
    const h = harness(), records: unknown[] = [];
    const p = startHostProcess({ ...identity, onCrash(record) { records.push(record); throw Error('observer'); } }, h.platform);
    await h.ready(); const owner = await p;
    const request = owner.request({ kind: 'checkpoint' }), rejected = expect(request).rejects.toThrow('authority-crash');
    h.utility.emit('message', { kind: 'crash', hostGeneration: 7, record: { checkpoint: new Uint8Array([8]), diagnostic: { modeFault: 4 } } });
    await rejected; expect(records).toEqual([{ checkpoint: new Uint8Array([8]), diagnostic: { modeFault: 4 } }]); expect(h.counts()).toEqual([1, 1]);
  });
});
