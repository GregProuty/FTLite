import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createIndexedDbRecordStore, createMemoryRecordStore, DUEL_RECORD_STORE, ONLINE_RECORD_DATABASE, ONLINE_RECORD_STORE, ONLINE_RECORD_VERSION, openFtliteDatabase } from '../src/network/online/recordStore';

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
  it('uses database ftlite version 2 with the records and duelRecords stores, and two stores on one factory share it', async () => {
    const idb = factory(), a = createIndexedDbRecordStore(idb), b = createIndexedDbRecordStore(idb);
    await a.put('mirror-v1', new Uint8Array(557056).fill(7)); expect((await b.get('mirror-v1'))!.length).toBe(557056);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = idb.open(ONLINE_RECORD_DATABASE); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    expect(db.version).toBe(2); expect(ONLINE_RECORD_VERSION).toBe(2); expect(Array.from({ length: db.objectStoreNames.length }, (_, i) => db.objectStoreNames.item(i))).toEqual([DUEL_RECORD_STORE, ONLINE_RECORD_STORE]); db.close();
  });
  it('upgrades a version 1 database and keeps its records', async () => {
    const idb = factory();
    await new Promise<void>((resolve, reject) => { const r = idb.open(ONLINE_RECORD_DATABASE, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(ONLINE_RECORD_STORE).put(new Uint8Array([5]), 'seat-v1'); };
      r.onsuccess = () => { r.result.close(); resolve(); }; r.onerror = () => reject(r.error); });
    expect(await createIndexedDbRecordStore(idb).get('seat-v1')).toEqual(new Uint8Array([5]));
  });
  it('keeps the seat and the mirror byte for byte across the version 1 to 2 upgrade, and adds an empty duelRecords', async () => {
    const idb = factory(), seat = Uint8Array.from({ length: 300 }, (_, i) => (i * 7) & 255), mirror = Uint8Array.from({ length: 70000 }, (_, i) => (i * 13 + 1) & 255);
    await new Promise<void>((resolve, reject) => { const r = idb.open(ONLINE_RECORD_DATABASE, 1);
      r.onupgradeneeded = () => { const s = r.result.createObjectStore(ONLINE_RECORD_STORE); s.put(seat, 'seat-v1'); s.put(mirror, 'mirror-v1'); };
      r.onsuccess = () => { r.result.close(); resolve(); }; r.onerror = () => reject(r.error); });
    const store = createIndexedDbRecordStore(idb);
    expect(await store.get('seat-v1')).toEqual(seat); expect(await store.get('mirror-v1')).toEqual(mirror);
    const db = await openFtliteDatabase(idb);
    expect(db.version).toBe(2);
    const count = await new Promise<number>((resolve, reject) => { const r = db.transaction(DUEL_RECORD_STORE).objectStore(DUEL_RECORD_STORE).count(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    expect(count).toBe(0); db.close();
  });
  it('a version 1 connection that will not close blocks the upgrade; the late connection is closed, and a later open succeeds', async () => {
    const idb = factory();
    const old = await new Promise<IDBDatabase>((resolve, reject) => { const r = idb.open(ONLINE_RECORD_DATABASE, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(ONLINE_RECORD_STORE).put(new Uint8Array([3]), 'seat-v1'); };
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    let warned = 0; old.onversionchange = () => { warned += 1; };   // an old document that ignores the upgrade
    const store = createIndexedDbRecordStore(idb);
    await expect(store.get('seat-v1')).rejects.toThrow('indexeddb-blocked');
    expect(warned).toBeGreaterThan(0);
    old.close();
    await new Promise((resolve) => setTimeout(resolve, 20));   // the blocked request finishes; its connection is closed at once
    expect(await store.get('seat-v1')).toEqual(new Uint8Array([3]));
    // No leaked connection: a newer version opens without being blocked (the store closes its own on versionchange).
    const next = await new Promise<IDBDatabase>((resolve, reject) => { const r = idb.open(ONLINE_RECORD_DATABASE, 3); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); r.onblocked = () => reject(Error('blocked')); });
    expect(next.version).toBe(3); next.close();
  });
  it('a version 2 store closes its connection when a newer version is asked for', async () => {
    const idb = factory(), store = createIndexedDbRecordStore(idb);
    await store.put('seat-v1', new Uint8Array([8]));
    const next = await new Promise<IDBDatabase>((resolve, reject) => { const r = idb.open(ONLINE_RECORD_DATABASE, 3); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); r.onblocked = () => reject(Error('blocked')); });
    expect(next.version).toBe(3); next.close();
  });
  it('refuses unknown keys and non-byte values', async () => {
    const store = createIndexedDbRecordStore(factory());
    await expect(store.get('other' as never)).rejects.toThrow('invalid-record-key');
    await expect(store.put('seat-v1', 'text' as never)).rejects.toThrow('invalid-record');
  });
});
