// The page's saved online records (web build spec §3.1): one IndexedDB key-value store replacing the seat and mirror
// files. Each put replaces one record in one transaction, so the temporary-file-plus-rename step is gone.
export type OnlineRecordKey = 'seat-v1' | 'mirror-v1';
export interface OnlineRecordStore {
  get(key: OnlineRecordKey): Promise<Uint8Array | null>;
  put(key: OnlineRecordKey, bytes: Uint8Array): Promise<void>;
  delete(key: OnlineRecordKey): Promise<void>;
}
export const ONLINE_RECORD_DATABASE = 'ftlite', ONLINE_RECORD_VERSION = 1, ONLINE_RECORD_STORE = 'records';
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
    const work = new Promise<IDBDatabase>((resolve, reject) => {
      const r = factory.open(ONLINE_RECORD_DATABASE, ONLINE_RECORD_VERSION);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ONLINE_RECORD_STORE)) r.result.createObjectStore(ONLINE_RECORD_STORE); };
      r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); if (opening === work) opening = undefined; }; resolve(db); };
      r.onerror = () => reject(r.error ?? Error('indexeddb-open-failed'));
      r.onblocked = () => reject(Error('indexeddb-blocked'));
    });
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
