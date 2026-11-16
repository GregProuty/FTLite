import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { isRoomId, isRoomToken, parseBoundedJson, validateCompatibility, type RoomCompatibility } from '../../shared/roomSession';
import { rtcKeys, rtcRecord } from '../../shared/rtcSession';

/** Main-only credentials. Never use this record as a renderer status or IPC payload. */
export interface SavedSeatV1 {
  version: 1; serviceOrigin: string; roomId: string; joinCode: string; compatibility: RoomCompatibility;
  seatId: number; seatGeneration: number; seatToken: string;
}
export type SeatStoreErrorCode = 'storage-invalid' | 'storage-read-failed' | 'storage-write-failed' | 'storage-clear-failed';
export class SeatStoreError extends Error {
  constructor(readonly code: SeatStoreErrorCode) { super(code); this.name = 'SeatStoreError'; }
}
/** Structural filesystem seam. Handles remain owned and closed by the store. */
export interface SeatStoreFileHandle {
  read(buffer: Uint8Array, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
  writeFile(data: string, options: { encoding: 'utf8' }): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}
export interface SeatStoreFileSystem {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  open(path: string, flags: string, mode?: number): Promise<SeatStoreFileHandle>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
}
const MAX_BYTES = 8192;
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
const missing = (error: unknown): boolean => rtcRecord(error) && error.code === 'ENOENT';

/** Queue reads as well as mutations so callers observe invocation order, even after failures. */
export function createSeatStore(directory: string, filesystem: SeatStoreFileSystem = { mkdir, open, rename, unlink }) {
  const path = join(directory, 'online-seat-v1.json');
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  }
  return {
    load(): Promise<SavedSeatV1 | null> {
      return enqueue(async () => {
        let handle: SeatStoreFileHandle;
        try { handle = await filesystem.open(path, 'r'); }
        catch (error) { if (missing(error)) return null; throw new SeatStoreError('storage-read-failed'); }
        let bytes: Uint8Array;
        try {
          // One byte beyond the cap distinguishes exact-size records without an unbounded read/stat race.
          const buffer = new Uint8Array(MAX_BYTES + 1); let length = 0;
          while (length < buffer.length) {
            const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
            if (bytesRead === 0) break;
            length += bytesRead;
          }
          bytes = buffer.subarray(0, length);
        } catch { throw new SeatStoreError('storage-read-failed'); }
        finally { try { await handle.close(); } catch { /* No raw OS errors or credential-bearing paths. */ } }
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
      let text: string;
      try {
        if (!validateSavedSeat(record)) throw new SeatStoreError('storage-invalid');
        text = JSON.stringify(record);
        if (Buffer.byteLength(text, 'utf8') > MAX_BYTES || !validateSavedSeat(parseBoundedJson(text, MAX_BYTES))) throw new SeatStoreError('storage-invalid');
      } catch { throw new SeatStoreError('storage-invalid'); }
      return enqueue(async () => {
        const temporary = path + '.' + randomUUID() + '.tmp';
        let handle: SeatStoreFileHandle | undefined;
        let temporaryOwned = false;
        try {
          await filesystem.mkdir(directory, { recursive: true });
          handle = await filesystem.open(temporary, 'wx', 0o600);
          temporaryOwned = true;
          await handle.writeFile(text, { encoding: 'utf8' });
          await handle.sync();
          await handle.close(); handle = undefined;
          await filesystem.rename(temporary, path);
          temporaryOwned = false;
        } catch { throw new SeatStoreError('storage-write-failed'); }
        finally {
          if (handle) { try { await handle.close(); } catch { /* Preserve the fixed operation error. */ } }
          if (temporaryOwned) { try { await filesystem.unlink(temporary); } catch { /* Cleanup failure cannot replace the fixed write error. */ } }
        }
      });
    },
    clear(): Promise<void> {
      return enqueue(async () => {
        try { await filesystem.unlink(path); }
        catch (error) { if (!missing(error)) throw new SeatStoreError('storage-clear-failed'); }
      });
    },
  };
}
export type SeatStore = ReturnType<typeof createSeatStore>;
