import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createOnlineMirrors } from '../src/main/network/onlineMirrors';
import type { MirrorFileV1, SessionMirror } from '../src/main/network/mirrorStore';
const deferred = <T>() => { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const compatibility = { protocolVersion: 2 as const, modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'c'.repeat(64), layoutHash: '12345678' };
const candidate = (id = 1, tick = 0) => ({ captureId: id, capturedTick: tick, controlRevision: 0, cause: 'periodic' as const, bytes: new Uint8Array([id]) });
const remote = (sequence = 1, generation = 1, tick = 0, bytes = new Uint8Array([sequence])): SessionMirror => ({ bytes, metadata: { version: 1, protocolVersion: 2, roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: generation, checkpointSequence: sequence, capturedTick: tick, compatibility, payloadSha256: createHash('sha256').update(bytes).digest('hex') } });
function harness(initial: MirrorFileV1 | null = null, generation = 1, loadGate?: Promise<void>) {
  let saved = initial, server: SessionMirror | null = null, now = 10;
  const abort = new AbortController();
  const store = { load: vi.fn(async () => { if (loadGate) await loadGate; return saved; }), save: vi.fn(async (value: MirrorFileV1) => { saved = structuredClone(value); }), clear: vi.fn(async () => { saved = null; }) };
  const service = { putCheckpoint: vi.fn(async (metadata: SessionMirror['metadata'], bytes: Uint8Array, _options?: { signal?: AbortSignal }) => { server = structuredClone({ metadata, bytes }); }), getCheckpoint: vi.fn(async () => { if (!server) throw { code: 'no-checkpoint' }; return structuredClone(server); }) };
  const owner = createOnlineMirrors({ store, service, serviceOrigin: 'http://localhost:8787', roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: generation, compatibility, signal: abort.signal,
    clock: { nowMs: () => now, epochMs: () => Date.now() }, validatePayload: () => {}, onChange: vi.fn() });
  return { owner, store, service, abort, saved: () => saved, server: () => server, setServer: (value: SessionMirror) => { server = value; }, advance: () => { now += 20; } };
}
describe('bounded authenticated mirror coordination', () => {
  it('preserves oversized load and download diagnoses', async () => {
    const h = harness({ version: 1, serviceOrigin: 'http://localhost:8787', roomId: 'a'.repeat(32), committed: remote(1, 1, 0, new Uint8Array(262145)), pending: null });
    await h.owner.refresh(); expect(h.owner.status().error).toBe('save-too-large');
    h.setServer(remote(1, 1, 0, new Uint8Array(262145)));
    await expect(h.owner.refresh()).rejects.toMatchObject({ code: 'save-too-large' }); expect(h.owner.status().error).toBe('save-too-large'); h.owner.dispose();
  });
  it('bounds initial disk loading and never adopts a late disk result over fresh authenticated progress', async () => {
    vi.useFakeTimers(); const read = deferred<void>(), h = harness(null, 1, read.promise); let adopted = false;
    try {
      const work = h.owner.adopt(candidate()).then(() => { adopted = true; });
      void work.catch(() => {});
      await vi.advanceTimersByTimeAsync(1001); expect(adopted).toBe(true); await work; expect(await h.owner.flush(100)).toBe(true);
      const committed = h.owner.status().committed; read.resolve(); await vi.advanceTimersByTimeAsync(0); expect(h.owner.status().committed).toEqual(committed);
    } finally { h.owner.dispose(); read.resolve(); vi.useRealTimers(); }
  });
  it('does not mistake a conflicting same-sequence receipt for this capture and resequences above the authenticated high water', async () => {
    const h = harness(); h.service.putCheckpoint.mockImplementationOnce(async metadata => { h.setServer(remote(metadata.checkpointSequence, 1, 0, new Uint8Array([99]))); throw { code: 'conflict' }; });
    await h.owner.adopt(candidate()); expect(await h.owner.flush(100)).toBe(true);
    expect(h.server()?.metadata.checkpointSequence).toBe(2); expect(h.server()?.bytes).toEqual(candidate().bytes); h.owner.dispose();
  });
  it('bounds adoption while disk I/O is stalled and lets Forget serialize after the only owned write', async () => {
    const h = harness(), disk = deferred<void>(); vi.useFakeTimers();
    try {
      h.store.save.mockImplementationOnce(async value => { await disk.promise; });
      const adopt = h.owner.adopt(candidate()); await vi.advanceTimersByTimeAsync(1000); await adopt;
      expect(h.owner.status()).toMatchObject({ persistent: false, error: 'save-unavailable', localPending: true });
      expect(h.store.save).toHaveBeenCalledOnce(); h.abort.abort(); disk.resolve(); await h.store.clear(); await vi.advanceTimersByTimeAsync(0); expect(await h.store.load()).toBeNull();
    } finally { h.owner.dispose(); vi.useRealTimers(); }
  });
  it('detaches capture bytes before asynchronous reconciliation and reports invalid new captures without losing committed state', async () => {
    const h = harness(), get = deferred<SessionMirror>(); h.service.getCheckpoint.mockReturnValueOnce(get.promise);
    const c = candidate(), adopted = h.owner.adopt(c); c.bytes[0] = 99; get.resolve(remote(5)); await adopted; expect(await h.owner.flush(100)).toBe(true);
    expect(h.server()?.bytes).toEqual(new Uint8Array([1])); const previous = h.owner.status().committed;
    await expect(h.owner.adopt({ ...candidate(2), bytes: new Uint8Array(262145) })).rejects.toMatchObject({ code: 'save-too-large' });
    expect(h.owner.status()).toMatchObject({ committed: previous, error: 'save-too-large' }); h.owner.dispose();
  });
  it('adopts and persists before PUT, and acknowledges adoption while the DO commit is still pending', async () => {
    const h = harness(), upload = deferred<void>(); h.service.putCheckpoint.mockReturnValueOnce(upload.promise);
    await h.owner.adopt(candidate()); expect(h.saved()?.pending?.metadata.checkpointSequence).toBe(1);
    await vi.waitFor(() => expect(h.service.putCheckpoint).toHaveBeenCalledOnce()); expect(h.owner.status()).toMatchObject({ committed: null, localPending: true });
    expect(await h.owner.flush(5)).toBe(false); upload.resolve(); expect(await h.owner.flush(100)).toBe(true);
    expect(h.saved()?.committed?.metadata.capturedTick).toBe(0); expect(h.saved()?.pending).toBeNull(); h.owner.dispose();
  });
  it('holds one upload and the newest replacement while an older success preserves the newer pending', async () => {
    const h = harness(), first = deferred<void>(), last = deferred<void>(); let concurrent = 0, maximum = 0;
    h.service.putCheckpoint.mockImplementation(async m => { concurrent++; maximum = Math.max(maximum, concurrent); await (m.checkpointSequence === 1 ? first : last).promise; concurrent--; });
    await h.owner.adopt(candidate()); await vi.waitFor(() => expect(concurrent).toBe(1));
    await h.owner.adopt(candidate(2, 300)); await h.owner.adopt(candidate(3, 600)); first.resolve();
    await vi.waitFor(() => expect(h.saved()?.committed?.metadata.checkpointSequence).toBe(1));
    expect(h.saved()?.pending?.metadata.capturedTick).toBe(600); expect(h.service.putCheckpoint.mock.calls.map(c => c[0].capturedTick)).toEqual([0, 600]);
    last.resolve(); expect(await h.owner.flush(100)).toBe(true); expect(maximum).toBe(1); h.owner.dispose();
  });
  it('reconciles uncertain success only by authenticated exact metadata and payload receipt', async () => {
    const h = harness(); h.service.putCheckpoint.mockImplementationOnce(async (metadata, bytes) => { h.setServer({ metadata, bytes }); throw { code: 'timeout' }; });
    await h.owner.adopt(candidate()); expect(await h.owner.flush(100)).toBe(true); expect(h.saved()?.committed).toEqual(h.server());
    h.advance(); expect(h.owner.status().receivedAgeMs).toBe(20); h.owner.dispose();
  });
  it('recovers sequence high water from disk and service without trusting disk receipt time', async () => {
    const h = harness({ version: 1, serviceOrigin: 'http://localhost:8787', roomId: 'a'.repeat(32), committed: remote(5), pending: remote(7) });
    await Promise.resolve(); await Promise.resolve(); expect(h.owner.status().receivedAgeMs).toBeNull(); h.setServer(remote(9));
    await h.owner.refresh(); await h.owner.adopt(candidate()); expect(await h.owner.flush(100)).toBe(true); expect(h.server()?.metadata.checkpointSequence).toBe(10); h.owner.dispose();
  });
  it('ranks a newer generation above an older higher tick and coalesces refresh notifications', async () => {
    const h = harness(null, 2); h.setServer(remote(20, 1, 900)); await h.owner.refresh(); h.setServer(remote(1, 2, 300));
    await Promise.all([h.owner.refresh(), h.owner.refresh(), h.owner.refresh()]); expect(h.saved()?.committed?.metadata).toMatchObject({ hostGeneration: 2, capturedTick: 300 }); h.owner.dispose();
  });
  it('keeps the last valid committed mirror and rejects wrong hash, mode, room and extra metadata', async () => {
    const h = harness(); h.setServer(remote()); await h.owner.refresh(); const previous = h.saved();
    for (const bad of [{ ...remote(2), bytes: new Uint8Array([99]) }, { ...remote(2), metadata: { ...remote(2).metadata, roomId: 'f'.repeat(32) } }, { ...remote(2), metadata: { ...remote(2).metadata, compatibility: { ...compatibility, modeId: 'other' } } }, { ...remote(2), metadata: { ...remote(2).metadata, seatToken: 'secret' } }]) {
      h.setServer(bad); await expect(h.owner.refresh()).rejects.toMatchObject({ code: 'save-invalid' }); expect(h.saved()).toEqual(previous);
    }
    h.owner.dispose();
  });
  it('reports persistence failure separately from successful server commit and retains old disk bytes', async () => {
    const h = harness(); h.setServer(remote()); await h.owner.refresh(); const previous = h.saved(); h.store.save.mockRejectedValue({ code: 'save-unavailable' });
    await h.owner.adopt(candidate(2, 300)); expect(await h.owner.flush(100)).toBe(true);
    expect(h.owner.status()).toMatchObject({ committed: { capturedTick: 300 }, persistent: false, error: 'save-unavailable', localPending: false }); expect(h.saved()).toEqual(previous); h.owner.dispose();
  });
  it('aborts owned I/O and Forget cannot be undone by a late capture/upload', async () => {
    const h = harness(), upload = deferred<void>(); h.service.putCheckpoint.mockReturnValueOnce(upload.promise); await h.owner.adopt(candidate());
    await vi.waitFor(() => expect(h.service.putCheckpoint).toHaveBeenCalledOnce()); const options = h.service.putCheckpoint.mock.calls[0]![2] as { signal: AbortSignal };
    h.abort.abort(); await h.store.clear(); upload.resolve(); await expect(h.owner.adopt(candidate(2))).rejects.toMatchObject({ code: 'cancelled' });
    await new Promise(resolve => setTimeout(resolve, 5)); expect(options.signal.aborted).toBe(true); expect(await h.store.load()).toBeNull(); expect(await h.owner.flush(10)).toBe(false);
  });
});
