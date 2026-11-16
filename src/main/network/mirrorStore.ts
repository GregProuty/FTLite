import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { isRoomId, parseBoundedJson, validateCheckpointMetadata, ROOM_CHECKPOINT_BYTES, ROOM_CHECKPOINT_METADATA_BYTES, type SessionCheckpointMetadata } from '../../shared/roomSession';
import { rtcKeys, rtcRecord } from '../../shared/rtcSession';

export interface SessionMirror { metadata: SessionCheckpointMetadata; bytes: Uint8Array }
export interface MirrorFileV1 { version: 1; serviceOrigin: string; roomId: string; committed: SessionMirror | null; pending: SessionMirror | null }
export interface MirrorStore { load(): Promise<MirrorFileV1 | null>; save(value: MirrorFileV1): Promise<void>; clear(): Promise<void> }
export class MirrorStoreError extends Error {
  constructor(readonly code: 'save-unavailable' | 'save-invalid' | 'save-too-large') { super(code); this.name = 'MirrorStoreError'; }
}
interface Handle {
  read(buffer: Uint8Array, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
  writeFile(bytes: Uint8Array): Promise<void>; sync(): Promise<void>; close(): Promise<void>;
}
export interface MirrorFileSystem {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  open(path: string, flags: string, mode?: number): Promise<Handle>;
  rename(from: string, to: string): Promise<void>; unlink(path: string): Promise<void>;
}
const MAX_BYTES = 557056, HEADER_BYTES = 16384, MAGIC = 'FTLNMIR1';
const missing = (e: unknown) => rtcRecord(e) && e.code === 'ENOENT';
const invalid = () => new MirrorStoreError('save-invalid');
function validOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try { const url = new URL(value); return url.origin === value && !url.username && !url.password && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); } catch { return false; }
}
export function validateMirror(mirror: SessionMirror, validatePayload: (mirror: SessionMirror) => void): void {
  if (!rtcRecord(mirror) || !rtcKeys(mirror, ['metadata', 'bytes']) || !validateCheckpointMetadata(mirror.metadata) || !(mirror.bytes instanceof Uint8Array) || !mirror.bytes.length) throw invalid();
  if (mirror.bytes.length > ROOM_CHECKPOINT_BYTES || Buffer.byteLength(JSON.stringify(mirror.metadata)) > ROOM_CHECKPOINT_METADATA_BYTES) throw new MirrorStoreError('save-too-large');
  if (createHash('sha256').update(mirror.bytes).digest('hex') !== mirror.metadata.payloadSha256) throw invalid();
  try { validatePayload(mirror); } catch { throw invalid(); }
}
function encode(value: MirrorFileV1, validate: (m: SessionMirror) => void): Buffer {
  if (!rtcRecord(value) || !rtcKeys(value, ['version', 'serviceOrigin', 'roomId', 'committed', 'pending']) || value.version !== 1 || !validOrigin(value.serviceOrigin) || !isRoomId(value.roomId)) throw invalid();
  const describe = (m: SessionMirror | null) => {
    if (m === null) return null;
    validateMirror(m, validate); if (m.metadata.roomId !== value.roomId) throw invalid();
    return { metadata: m.metadata, byteLength: m.bytes.length };
  };
  const header = Buffer.from(JSON.stringify({ version: 1, serviceOrigin: value.serviceOrigin, roomId: value.roomId, committed: describe(value.committed), pending: describe(value.pending) }));
  if (header.length > HEADER_BYTES) throw new MirrorStoreError('save-too-large');
  const prefix = Buffer.alloc(12); prefix.write(MAGIC); prefix.writeUInt32LE(header.length, 8);
  const bytes = Buffer.concat([prefix, header, value.committed?.bytes ?? new Uint8Array(), value.pending?.bytes ?? new Uint8Array()]);
  if (bytes.length > MAX_BYTES) throw new MirrorStoreError('save-too-large');
  return bytes;
}
function decode(bytes: Buffer, validate: (m: SessionMirror) => void): MirrorFileV1 {
  if (bytes.length > MAX_BYTES) throw new MirrorStoreError('save-too-large');
  if (bytes.length < 12 || bytes.subarray(0, 8).toString() !== MAGIC) throw invalid();
  const length = bytes.readUInt32LE(8); if (length > HEADER_BYTES || length + 12 > bytes.length) throw invalid();
  const h = parseBoundedJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(12, 12 + length)), HEADER_BYTES);
  if (!rtcRecord(h) || !rtcKeys(h, ['version', 'serviceOrigin', 'roomId', 'committed', 'pending'])) throw invalid();
  let offset = 12 + length;
  const entry = (d: unknown): SessionMirror | null => {
    if (d === null) return null;
    if (!rtcRecord(d) || !rtcKeys(d, ['metadata', 'byteLength']) || !validateCheckpointMetadata(d.metadata) || !Number.isSafeInteger(d.byteLength) || (d.byteLength as number) <= 0 || (d.byteLength as number) > ROOM_CHECKPOINT_BYTES || offset + (d.byteLength as number) > bytes.length) throw invalid();
    const mirror = { metadata: d.metadata, bytes: new Uint8Array(bytes.subarray(offset, offset + (d.byteLength as number))) }; offset += d.byteLength as number; return mirror;
  };
  const value = { version: h.version, serviceOrigin: h.serviceOrigin, roomId: h.roomId, committed: entry(h.committed), pending: entry(h.pending) } as MirrorFileV1;
  if (offset !== bytes.length) throw invalid();
  encode(value, validate); return value;
}
/** Invocation-ordered I/O and exact temporary ownership match the independent credential store. */
export function createMirrorStore(directory: string, validatePayload: (m: SessionMirror) => void, fs: MirrorFileSystem = { mkdir, open, rename, unlink }): MirrorStore {
  const path = join(directory, 'online-mirror-v1.bin'); let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> { const result = tail.then(operation); tail = result.catch(() => {}); return result; }
  return {
    load: () => enqueue(async () => {
      let handle: Handle;
      try { handle = await fs.open(path, 'r'); } catch (e) { if (missing(e)) return null; throw new MirrorStoreError('save-unavailable'); }
      const bytes = Buffer.alloc(MAX_BYTES + 1); let length = 0;
      try { while (length < bytes.length) { const result = await handle.read(bytes, length, bytes.length - length, length); if (!result.bytesRead) break; length += result.bytesRead; } }
      catch { throw new MirrorStoreError('save-unavailable'); }
      finally { try { await handle.close(); } catch {} }
      try { return decode(bytes.subarray(0, length), validatePayload); } catch (e) { throw e instanceof MirrorStoreError ? e : invalid(); }
    }),
    async save(value) {
      let bytes: Buffer;
      try { bytes = encode(value, validatePayload); decode(bytes, validatePayload); } catch (e) { throw e instanceof MirrorStoreError ? e : invalid(); }
      return enqueue(async () => {
        const temporary = path + '.' + randomUUID() + '.tmp'; let handle: Handle | undefined, owned = false;
        try {
          await fs.mkdir(directory, { recursive: true }); handle = await fs.open(temporary, 'wx', 0o600); owned = true;
          await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = undefined;
          await fs.rename(temporary, path); owned = false;
        } catch { throw new MirrorStoreError('save-unavailable'); }
        finally { if (handle) { try { await handle.close(); } catch {} } if (owned) { try { await fs.unlink(temporary); } catch {} } }
      });
    },
    clear: () => enqueue(async () => { try { await fs.unlink(path); } catch (e) { if (!missing(e)) throw new MirrorStoreError('save-unavailable'); } })
  };
}
