// The browser's duel playtest log (web build spec §7.4): each validated record is one line in the IndexedDB store
// duelRecords under its local date, with Electron's caps (8 KiB a record, 16 MiB a day). exportLog joins every day,
// oldest first, into one ftlite-playtest-<first>-to-<last>.jsonl in today's per-record format.
import { DUEL_RECORD_STORE, openFtliteDatabase } from '../../../../network/online/recordStore';
import { DUEL_RECORD_DAY_MAX_BYTES, duelRecordDay, validateDuelRecord } from '../../net/duelRecord';

interface DayRecord { bytes: number; lines: string[] }
export interface PlaytestLog { name: string; text: string; days: number; records: number }
export interface DuelRecordStore { append(value: unknown, now?: Date): Promise<boolean>; exportLog(): Promise<PlaytestLog | null> }
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function validDay(value: unknown): DayRecord | null {
  const v = value as DayRecord | null;
  return v && typeof v === 'object' && Number.isSafeInteger(v.bytes) && Array.isArray(v.lines) && v.lines.every(l => typeof l === 'string' && l.endsWith('\n')) ? v : null;
}
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? Error('indexeddb-request-failed')); });
}
export function createIndexedDbDuelRecordStore(factory: IDBFactory = globalThis.indexedDB, maxDayBytes = DUEL_RECORD_DAY_MAX_BYTES): DuelRecordStore {
  let opening: Promise<IDBDatabase> | undefined;
  function open(): Promise<IDBDatabase> {
    if (opening) return opening;
    const work: Promise<IDBDatabase> = openFtliteDatabase(factory).then(db => { db.onversionchange = () => { db.close(); if (opening === work) opening = undefined; }; return db; });
    opening = work; void work.catch(() => { if (opening === work) opening = undefined; });
    return work;
  }
  return {
    async append(value, now = new Date()) {
      let line: string;
      try { line = JSON.stringify(validateDuelRecord(value)) + '\n'; } catch { return false; }
      const size = new TextEncoder().encode(line).byteLength, day = duelRecordDay(now);
      try {
        const tx = (await open()).transaction(DUEL_RECORD_STORE, 'readwrite'), store = tx.objectStore(DUEL_RECORD_STORE);
        const done = new Promise<boolean>(resolve => { tx.oncomplete = () => resolve(true); tx.onabort = () => resolve(false); tx.onerror = () => resolve(false); });
        const current = store.get(day);
        current.onsuccess = () => {
          const cur = validDay(current.result) ?? { bytes: 0, lines: [] };
          if (cur.bytes + size > maxDayBytes) { tx.abort(); return; }   // the day is full: nothing written
          store.put({ bytes: cur.bytes + size, lines: [...cur.lines, line] }, day);
        };
        return await done;
      } catch { return false; }
    },
    async exportLog() {
      const tx = (await open()).transaction(DUEL_RECORD_STORE, 'readonly'), store = tx.objectStore(DUEL_RECORD_STORE);
      const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
      const days = keys.map((key, i) => [key, validDay(values[i])] as const)
        .filter((entry): entry is readonly [string, DayRecord] => typeof entry[0] === 'string' && DAY.test(entry[0]) && entry[1] !== null)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      if (!days.length) return null;
      return { name: `ftlite-playtest-${days[0]![0]}-to-${days.at(-1)![0]}.jsonl`, text: days.map(([, d]) => d.lines.join('')).join(''),
        days: days.length, records: days.reduce((n, [, d]) => n + d.lines.length, 0) };
    }
  };
}
