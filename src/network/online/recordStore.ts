// The page's saved online records (web build spec §3.1): one IndexedDB key-value store replacing the seat and mirror
// files. Each put replaces one record in one transaction, so the temporary-file-plus-rename step is gone.
export type OnlineRecordKey = 'seat-v1' | 'mirror-v1';
export interface OnlineRecordStore {
  get(key: OnlineRecordKey): Promise<Uint8Array | null>;
  put(key: OnlineRecordKey, bytes: Uint8Array): Promise<void>;
  delete(key: OnlineRecordKey): Promise<void>;
}
export const ONLINE_RECORD_DATABASE = 'ftlite', ONLINE_RECORD_VERSION = 2, ONLINE_RECORD_STORE = 'records', DUEL_RECORD_STORE = 'duelRecords';
/** Database ftlite (web build spec §3.1, §7.4): version 1 held `records`; version 2 adds `duelRecords`. Every page module
 *  opens it through here, so no two openers ask for different versions. The upgrade only adds missing stores, so a
 *  version 1 `records` store (seat-v1, mirror-v1) survives untouched. A blocked open (another document still holds an
 *  older version and does not close it) rejects; if that open later succeeds anyway, the late connection is closed at
 *  once so it never holds the database against the next upgrade. */
export function openFtliteDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const r = factory.open(ONLINE_RECORD_DATABASE, ONLINE_RECORD_VERSION);
    r.onupgradeneeded = () => { for (const name of [ONLINE_RECORD_STORE, DUEL_RECORD_STORE]) if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name); };
    r.onsuccess = () => { if (settled) { r.result.close(); return; } settled = true; resolve(r.result); };
    r.onerror = () => { settled = true; reject(r.error ?? Error('indexeddb-open-failed')); };
    r.onblocked = () => { if (settled) return; settled = true; reject(Error('indexeddb-blocked')); };
  });
}
const KEYS: readonly string[] = ['seat-v1', 'mirror-v1'];
function checkKey(key: string): void { if (!KEYS.includes(key)) throw Error('invalid-record-key'); }
function checkBytes(bytes: unknown): asserts bytes is Uint8Array { if (!(bytes instanceof Uint8Array)) throw Error('invalid-record'); }
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? Error('indexeddb-request-failed')); });
}
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? Error('indexeddb-transaction-failed'));
  });
}
export function createIndexedDbRecordStore(factory: IDBFactory = globalThis.indexedDB): OnlineRecordStore {
  let opening: Promise<IDBDatabase> | undefined;
  function open(): Promise<IDBDatabase> {
    if (opening) return opening;
    const work: Promise<IDBDatabase> = openFtliteDatabase(factory).then(db => { db.onversionchange = () => { db.close(); if (opening === work) opening = undefined; }; return db; });
    opening = work; void work.catch(() => { if (opening === work) opening = undefined; });
    return work;
  }
  return {
    async get(key) {
      checkKey(key);
      const tx = (await open()).transaction(ONLINE_RECORD_STORE, 'readonly');
      const value: unknown = await request(tx.objectStore(ONLINE_RECORD_STORE).get(key));
      if (value === undefined) return null;
      checkBytes(value); return new Uint8Array(value);
    },
    async put(key, bytes) {
      checkKey(key); checkBytes(bytes);
      const tx = (await open()).transaction(ONLINE_RECORD_STORE, 'readwrite'), done = committed(tx);
      tx.objectStore(ONLINE_RECORD_STORE).put(bytes.slice(), key); await done;
    },
    async delete(key) {
      checkKey(key);
      const tx = (await open()).transaction(ONLINE_RECORD_STORE, 'readwrite'), done = committed(tx);
      tx.objectStore(ONLINE_RECORD_STORE).delete(key); await done;
    }
  };
}
/** A detached in-memory store for tests and for a page without IndexedDB. */
export function createMemoryRecordStore(): OnlineRecordStore & { records: Map<OnlineRecordKey, Uint8Array> } {
  const records = new Map<OnlineRecordKey, Uint8Array>();
  return {
    records,
    async get(key) { checkKey(key); const value = records.get(key); return value ? value.slice() : null; },
    async put(key, bytes) { checkKey(key); checkBytes(bytes); records.set(key, bytes.slice()); },
    async delete(key) { checkKey(key); records.delete(key); }
  };
}
