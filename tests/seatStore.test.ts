import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createIndexedDbRecordStore, createMemoryRecordStore, type OnlineRecordStore } from '../src/network/online/recordStore';
import { createSeatStore, type SavedSeatV1 } from '../src/network/online/seatStore';

const seat = (char = 'a'): SavedSeatV1 => ({ version: 1, serviceOrigin: 'http://localhost:8787', roomId: char.repeat(32), joinCode: 'ABCD1234',
  compatibility: { protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'c'.repeat(64), layoutHash: '12345678' },
  seatId: 1, seatGeneration: 1, seatToken: 'S'.repeat(43) });
const text = (value: string) => new TextEncoder().encode(value);
const failing = (operation: 'get' | 'put' | 'delete'): OnlineRecordStore => {
  const inner = createMemoryRecordStore();
  return { get: k => operation === 'get' ? Promise.reject(Error('secret path')) : inner.get(k), put: (k, b) => operation === 'put' ? Promise.reject(Error('secret')) : inner.put(k, b),
    delete: k => operation === 'delete' ? Promise.reject(Error('secret')) : inner.delete(k) };
};
describe('saved seat store on the record seam', () => {
  it('round-trips a detached seat record in IndexedDB and supports a missing record and repeat clear', async () => {
    const store = createSeatStore(createIndexedDbRecordStore(new IDBFactory() as unknown as globalThis.IDBFactory));
    expect(await store.load()).toBeNull(); await store.save(seat());
    const loaded = await store.load(); expect(loaded).toEqual(seat()); loaded!.seatToken = 'X';
    expect((await store.load())!.seatToken).toBe('S'.repeat(43));
    await store.clear(); await store.clear(); expect(await store.load()).toBeNull();
  });
  it.each(['{corrupt', JSON.stringify({ ...seat(), version: 2 }), JSON.stringify({ ...seat(), seatToken: 'bad' }), JSON.stringify({ ...seat(), extra: 'secret' }),
    JSON.stringify({ ...seat(), serviceOrigin: 'http://user:secret@localhost:8787' }), JSON.stringify({ ...seat(), compatibility: { ...seat().compatibility, extra: 'secret' } }),
    JSON.stringify(seat()) + ' '.repeat(8193), '{"version":1,"version":1}'])('rejects corrupt, unknown-version, oversize or unsafe records with a fixed error', async value => {
    const records = createMemoryRecordStore(), store = createSeatStore(records); await records.put('seat-v1', text(value));
    await expect(store.load()).rejects.toMatchObject({ code: 'storage-invalid', message: 'storage-invalid' });
  });
  it('rejects invalid UTF-8 with the fixed error', async () => {
    const records = createMemoryRecordStore(), store = createSeatStore(records); await records.put('seat-v1', new Uint8Array([0x7b, 0xff, 0x7d]));
    await expect(store.load()).rejects.toMatchObject({ code: 'storage-invalid' });
  });
  it('accepts exactly 8 KiB and rejects 8 KiB plus one', async () => {
    const records = createMemoryRecordStore(), store = createSeatStore(records), value = JSON.stringify(seat());
    await records.put('seat-v1', text(value + ' '.repeat(8192 - text(value).length))); expect(await store.load()).toEqual(seat());
    await records.put('seat-v1', text(value + ' '.repeat(8193 - text(value).length))); await expect(store.load()).rejects.toMatchObject({ code: 'storage-invalid' });
  });
  it('serializes save A, forget and save B without resurrecting A', async () => {
    const store = createSeatStore(createMemoryRecordStore());
    await Promise.all([store.save(seat('a')), store.clear(), store.save(seat('b'))]); expect((await store.load())!.roomId).toBe('b'.repeat(32));
    await Promise.all([store.save(seat('c')), store.clear()]); expect(await store.load()).toBeNull();
  });
  it('captures records at save invocation before queued work runs', async () => {
    const store = createSeatStore(createMemoryRecordStore()), record = seat(); const saved = store.save(record); record.seatToken = 'T'.repeat(43); await saved;
    expect((await store.load())!.seatToken).toBe('S'.repeat(43));
  });
  it('rejects invalid saves before replacing the saved credential', async () => {
    const store = createSeatStore(createMemoryRecordStore()); await store.save(seat());
    await expect(store.save({ ...seat(), seatToken: 'bad' })).rejects.toMatchObject({ code: 'storage-invalid' });
    await expect(store.save({ ...seat(), toJSON() { throw Error('secret'); } } as never)).rejects.toMatchObject({ code: 'storage-invalid', message: 'storage-invalid' });
    expect(await store.load()).toEqual(seat());
  });
  it.each([['get', 'load', 'storage-read-failed'], ['put', 'save', 'storage-write-failed'], ['delete', 'clear', 'storage-clear-failed']] as const)('maps a %s failure to the fixed %s error and keeps the queue alive', async (operation, method, code) => {
    const store = createSeatStore(failing(operation));
    await expect(method === 'save' ? store.save(seat()) : store[method]()).rejects.toMatchObject({ code, message: code });
    await (operation === 'put' ? store.load() : store.save(seat()));   // the queue is still alive after the fixed failure
  });
});
