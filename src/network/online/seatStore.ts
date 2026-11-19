import { isRoomId, isRoomToken, parseBoundedJson, validateCompatibility, type RoomCompatibility } from '../../shared/roomSession';
import { rtcKeys, rtcRecord } from '../../shared/rtcSession';
import type { OnlineRecordStore } from './recordStore';

/** Page-private credentials. Never use this record as a status or UI payload. */
export interface SavedSeatV1 {
  version: 1; serviceOrigin: string; roomId: string; joinCode: string; compatibility: RoomCompatibility;
  seatId: number; seatGeneration: number; seatToken: string;
}
export type SeatStoreErrorCode = 'storage-invalid' | 'storage-read-failed' | 'storage-write-failed' | 'storage-clear-failed';
export class SeatStoreError extends Error {
  constructor(readonly code: SeatStoreErrorCode) { super(code); this.name = 'SeatStoreError'; }
}
const MAX_BYTES = 8192, KEY = 'seat-v1' as const;
function validOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return value === url.origin && !url.username && !url.password && (url.protocol === 'https:'
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  } catch { return false; }
}
export function validateSavedSeat(value: unknown): value is SavedSeatV1 {
  return rtcRecord(value) && rtcKeys(value, ['version', 'serviceOrigin', 'roomId', 'joinCode', 'compatibility', 'seatId', 'seatGeneration', 'seatToken'])
    && value.version === 1 && validOrigin(value.serviceOrigin) && isRoomId(value.roomId)
    && typeof value.joinCode === 'string' && /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(value.joinCode)
    && validateCompatibility(value.compatibility) && Number.isSafeInteger(value.seatId) && (value.seatId as number) >= 0 && (value.seatId as number) < 4
    && Number.isSafeInteger(value.seatGeneration) && (value.seatGeneration as number) > 0 && isRoomToken(value.seatToken);
}

/** Queue reads as well as mutations so callers observe invocation order, even after failures. */
export function createSeatStore(records: OnlineRecordStore) {
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  }
  return {
    load(): Promise<SavedSeatV1 | null> {
      return enqueue(async () => {
        let bytes: Uint8Array | null;
        try { bytes = await records.get(KEY); } catch { throw new SeatStoreError('storage-read-failed'); }
        if (bytes === null) return null;
        if (bytes.length > MAX_BYTES) throw new SeatStoreError('storage-invalid');
        let value: unknown;
        try { value = parseBoundedJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes), MAX_BYTES); }
        catch { throw new SeatStoreError('storage-invalid'); }
        if (!validateSavedSeat(value)) throw new SeatStoreError('storage-invalid');
        return value;
      });
    },
    async save(record: SavedSeatV1): Promise<void> {
      // Capture now; callers cannot mutate credentials while an earlier operation is pending.
      let bytes: Uint8Array;
      try {
        if (!validateSavedSeat(record)) throw new SeatStoreError('storage-invalid');
        const text = JSON.stringify(record);
        bytes = new TextEncoder().encode(text);
        if (bytes.length > MAX_BYTES || !validateSavedSeat(parseBoundedJson(text, MAX_BYTES))) throw new SeatStoreError('storage-invalid');
      } catch { throw new SeatStoreError('storage-invalid'); }
      return enqueue(async () => {
        try { await records.put(KEY, bytes); } catch { throw new SeatStoreError('storage-write-failed'); }
      });
    },
    clear(): Promise<void> {
      return enqueue(async () => {
        try { await records.delete(KEY); } catch { throw new SeatStoreError('storage-clear-failed'); }
      });
    },
  };
}
export type SeatStore = ReturnType<typeof createSeatStore>;
