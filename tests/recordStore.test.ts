import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createIndexedDbRecordStore, createMemoryRecordStore, ONLINE_RECORD_DATABASE, ONLINE_RECORD_STORE, ONLINE_RECORD_VERSION } from '../src/network/online/recordStore';

const factory = () => new IDBFactory() as unknown as globalThis.IDBFactory;
describe('online record store (web build spec §3.1)', () => {
  it.each([['IndexedDB', () => createIndexedDbRecordStore(factory())], ['memory', () => createMemoryRecordStore()]])('%s: round-trips detached bytes, misses as null and deletes idempotently', async (_name, make) => {
    const store = make(), bytes = new Uint8Array([1, 2, 3]);
    expect(await store.get('seat-v1')).toBeNull();
    await store.put('seat-v1', bytes); bytes[0] = 9;
    const loaded = await store.get('seat-v1'); expect(loaded).toEqual(new Uint8Array([1, 2, 3]));
    loaded![1] = 9; expect(await store.get('seat-v1')).toEqual(new Uint8Array([1, 2, 3]));
    await store.put('seat-v1', new Uint8Array([4])); expect(await store.get('seat-v1')).toEqual(new Uint8Array([4]));
    expect(await store.get('mirror-v1')).toBeNull();
    await store.delete('seat-v1'); await store.delete('seat-v1'); expect(await store.get('seat-v1')).toBeNull();
  });
  it('uses database ftlite version 1 with one records store, and two stores on one factory share it', async () => {
    const idb = factory(), a = createIndexedDbRecordStore(idb), b = createIndexedDbRecordStore(idb);
    await a.put('mirror-v1', new Uint8Array(557056).fill(7)); expect((await b.get('mirror-v1'))!.length).toBe(557056);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = idb.open(ONLINE_RECORD_DATABASE); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    expect(db.version).toBe(ONLINE_RECORD_VERSION); expect(Array.from({ length: db.objectStoreNames.length }, (_, i) => db.objectStoreNames.item(i))).toEqual([ONLINE_RECORD_STORE]); db.close();
  });
  it('refuses unknown keys and non-byte values', async () => {
    const store = createIndexedDbRecordStore(factory());
    await expect(store.get('other' as never)).rejects.toThrow('invalid-record-key');
    await expect(store.put('seat-v1', 'text' as never)).rejects.toThrow('invalid-record');
  });
});
