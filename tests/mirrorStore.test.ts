import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createMemoryRecordStore, type OnlineRecordStore } from '../src/network/online/recordStore';
import { createMirrorStore, type MirrorFileV1, type SessionMirror } from '../src/network/online/mirrorStore';

export function mirror(sequence = 1, generation = 1, tick = 0, size = 16): SessionMirror {
  const bytes = new Uint8Array(size).fill(sequence);
  return { metadata: { version: 1, protocolVersion: 2, roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: generation, checkpointSequence: sequence, capturedTick: tick,
    payloadSha256: createHash('sha256').update(bytes).digest('hex'), compatibility: { protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'c'.repeat(64), layoutHash: '12345678' } }, bytes };
}
const record = (): MirrorFileV1 => ({ version: 1, serviceOrigin: 'http://localhost:8787', roomId: 'a'.repeat(32), committed: mirror(), pending: mirror(2) });
const u32 = (bytes: Uint8Array, at: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, true);
describe('binary session mirror on the record seam', () => {
  it('round trips two maximum payloads with the exact magic/header/raw order and detached invocation bytes', async () => {
    const records = createMemoryRecordStore(), store = createMirrorStore(records, () => {}), value = record();
    expect(await store.load()).toBeNull(); value.committed = mirror(1, 1, 0, 262144); value.pending = mirror(2, 1, 300, 262144);
    const saved = store.save(value); value.pending.bytes[0] = 99; await saved;
    const loaded = await store.load(), bytes = records.records.get('mirror-v1')!;
    expect(bytes.length).toBeLessThanOrEqual(557056); expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe('FTLNMIR1');
    const end = 12 + u32(bytes, 8); expect(bytes[end]).toBe(1); expect(bytes[end + 262144]).toBe(2); expect(loaded?.pending?.bytes[0]).toBe(2);
    await store.clear(); await store.clear(); expect(await store.load()).toBeNull(); expect(records.records.size).toBe(0);
  });
  it.each(['magic', 'truncated', 'oversize', 'trailing', 'hash', 'utf8', 'extra', 'duplicate'] as const)('rejects %s corruption with fixed errors', async kind => {
    const records = createMemoryRecordStore(), store = createMirrorStore(records, () => {}); await store.save(record());
    let bytes = Uint8Array.from(records.records.get('mirror-v1')!);
    if (kind === 'magic') bytes[0] = 0;
    if (kind === 'truncated') bytes = bytes.subarray(0, bytes.length - 1);
    if (kind === 'oversize') bytes = new Uint8Array(557057);
    if (kind === 'trailing') { const longer = new Uint8Array(bytes.length + 1); longer.set(bytes); bytes = longer; }
    if (kind === 'hash') bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    if (kind === 'utf8') bytes[12] = 255;
    if (kind === 'extra' || kind === 'duplicate') {
      const length = u32(bytes, 8), old = new TextDecoder().decode(bytes.subarray(12, 12 + length));
      const header = new TextEncoder().encode(old.slice(0, -1) + (kind === 'extra' ? ',"seatToken":"secret"}' : ',"version":1}'));
      const next = new Uint8Array(12 + header.length + bytes.length - 12 - length); next.set(bytes.subarray(0, 12));
      new DataView(next.buffer).setUint32(8, header.length, true); next.set(header, 12); next.set(bytes.subarray(12 + length), 12 + header.length); bytes = next;
    }
    records.records.set('mirror-v1', bytes);
    await expect(store.load()).rejects.toMatchObject({ code: kind === 'oversize' ? 'save-too-large' : 'save-invalid' });
  });
  it('validates mode payload and room binding before replacing a valid record', async () => {
    const store = createMirrorStore(createMemoryRecordStore(), m => { if (m.bytes[0] === 3) throw Error('mode mismatch'); }); await store.save(record());
    await expect(store.save({ ...record(), pending: mirror(3) })).rejects.toMatchObject({ code: 'save-invalid' });
    await expect(store.save({ ...record(), roomId: 'd'.repeat(32) })).rejects.toMatchObject({ code: 'save-invalid' }); expect(await store.load()).toEqual(record());
  });
  it.each(['get', 'put', 'delete'] as const)('maps a %s failure to save-unavailable and keeps the committed record', async operation => {
    const inner = createMemoryRecordStore(); let fail = false;
    const records: OnlineRecordStore = { get: k => fail && operation === 'get' ? Promise.reject(Error('secret')) : inner.get(k),
      put: (k, b) => fail && operation === 'put' ? Promise.reject(Error('secret')) : inner.put(k, b), delete: k => fail && operation === 'delete' ? Promise.reject(Error('secret')) : inner.delete(k) };
    const store = createMirrorStore(records, () => {}); await store.save(record()); fail = true;
    const attempt = operation === 'get' ? store.load() : operation === 'put' ? store.save({ ...record(), pending: mirror(4) }) : store.clear();
    await expect(attempt).rejects.toMatchObject({ code: 'save-unavailable' });
    fail = false; expect(await store.load()).toEqual(record());
  });
  it('serializes queued write and Forget, never recreating the cleared record', async () => {
    const store = createMirrorStore(createMemoryRecordStore(), () => {}); await Promise.all([store.save(record()), store.clear()]); expect(await store.load()).toBeNull();
  });
});
