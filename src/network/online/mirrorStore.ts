import { isRoomId, parseBoundedJson, validateCheckpointMetadata, ROOM_CHECKPOINT_BYTES, ROOM_CHECKPOINT_METADATA_BYTES, type SessionCheckpointMetadata } from '../../shared/roomSession';
import { rtcKeys, rtcRecord } from '../../shared/rtcSession';
import { sha256Hex } from '../../shared/sha256';
import type { OnlineRecordStore } from './recordStore';

export interface SessionMirror { metadata: SessionCheckpointMetadata; bytes: Uint8Array }
export interface MirrorFileV1 { version: 1; serviceOrigin: string; roomId: string; committed: SessionMirror | null; pending: SessionMirror | null }
export interface MirrorStore { load(): Promise<MirrorFileV1 | null>; save(value: MirrorFileV1): Promise<void>; clear(): Promise<void> }
export class MirrorStoreError extends Error {
  constructor(readonly code: 'save-unavailable' | 'save-invalid' | 'save-too-large') { super(code); this.name = 'MirrorStoreError'; }
}
const MAX_BYTES = 557056, HEADER_BYTES = 16384, KEY = 'mirror-v1' as const;
const utf8 = new TextEncoder(), MAGIC = utf8.encode('FTLNMIR1');
const invalid = () => new MirrorStoreError('save-invalid');
function validOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try { const url = new URL(value); return url.origin === value && !url.username && !url.password && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); } catch { return false; }
}
export function validateMirror(mirror: SessionMirror, validatePayload: (mirror: SessionMirror) => void): void {
  if (!rtcRecord(mirror) || !rtcKeys(mirror, ['metadata', 'bytes']) || !validateCheckpointMetadata(mirror.metadata) || !(mirror.bytes instanceof Uint8Array) || !mirror.bytes.length) throw invalid();
  if (mirror.bytes.length > ROOM_CHECKPOINT_BYTES || utf8.encode(JSON.stringify(mirror.metadata)).length > ROOM_CHECKPOINT_METADATA_BYTES) throw new MirrorStoreError('save-too-large');
  if (sha256Hex(mirror.bytes) !== mirror.metadata.payloadSha256) throw invalid();
  try { validatePayload(mirror); } catch { throw invalid(); }
}
function encode(value: MirrorFileV1, validate: (m: SessionMirror) => void): Uint8Array {
  if (!rtcRecord(value) || !rtcKeys(value, ['version', 'serviceOrigin', 'roomId', 'committed', 'pending']) || value.version !== 1 || !validOrigin(value.serviceOrigin) || !isRoomId(value.roomId)) throw invalid();
  const describe = (m: SessionMirror | null) => {
    if (m === null) return null;
    validateMirror(m, validate); if (m.metadata.roomId !== value.roomId) throw invalid();
    return { metadata: m.metadata, byteLength: m.bytes.length };
  };
  const header = utf8.encode(JSON.stringify({ version: 1, serviceOrigin: value.serviceOrigin, roomId: value.roomId, committed: describe(value.committed), pending: describe(value.pending) }));
  if (header.length > HEADER_BYTES) throw new MirrorStoreError('save-too-large');
  const committed = value.committed?.bytes ?? new Uint8Array(), pending = value.pending?.bytes ?? new Uint8Array();
  const total = 12 + header.length + committed.length + pending.length;
  if (total > MAX_BYTES) throw new MirrorStoreError('save-too-large');
  const bytes = new Uint8Array(total);
  bytes.set(MAGIC, 0); new DataView(bytes.buffer).setUint32(8, header.length, true);
  bytes.set(header, 12); bytes.set(committed, 12 + header.length); bytes.set(pending, 12 + header.length + committed.length);
  return bytes;
}
function decode(bytes: Uint8Array, validate: (m: SessionMirror) => void): MirrorFileV1 {
  if (bytes.length > MAX_BYTES) throw new MirrorStoreError('save-too-large');
  if (bytes.length < 12 || MAGIC.some((byte, i) => bytes[i] !== byte)) throw invalid();
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true);
  if (length > HEADER_BYTES || length + 12 > bytes.length) throw invalid();
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
/** Invocation-ordered I/O, as the credential store. */
export function createMirrorStore(records: OnlineRecordStore, validatePayload: (m: SessionMirror) => void): MirrorStore {
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> { const result = tail.then(operation); tail = result.catch(() => {}); return result; }
  return {
    load: () => enqueue(async () => {
      let bytes: Uint8Array | null;
      try { bytes = await records.get(KEY); } catch { throw new MirrorStoreError('save-unavailable'); }
      if (bytes === null) return null;
      try { return decode(bytes, validatePayload); } catch (e) { throw e instanceof MirrorStoreError ? e : invalid(); }
    }),
    async save(value) {
      let bytes: Uint8Array;
      try { bytes = encode(value, validatePayload); decode(bytes, validatePayload); } catch (e) { throw e instanceof MirrorStoreError ? e : invalid(); }
      return enqueue(async () => { try { await records.put(KEY, bytes); } catch { throw new MirrorStoreError('save-unavailable'); } });
    },
    clear: () => enqueue(async () => { try { await records.delete(KEY); } catch { throw new MirrorStoreError('save-unavailable'); } })
  };
}
