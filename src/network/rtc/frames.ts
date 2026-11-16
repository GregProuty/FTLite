import type { ChannelKind } from '../../renderer/src/net/contracts';
import { PAYLOAD_LIMITS, RTC_ASSEMBLY_TTL_MS, RTC_HEADER_BYTES, RTC_MAX_ASSEMBLIES, RTC_MAX_HEADER_BYTES, RTC_MAX_PACKET_BYTES, RTC_MAX_RECORDS, RTC_MAX_STREAM_CHARS, RTC_MAX_STREAMS, validMetadata, type PayloadClass, type PayloadMetadata } from './contracts';
const CLASSES: readonly PayloadClass[] = ['input', 'state', 'checkpoint', 'control'];
export const RTC_FRAME_MAGIC = 0x4654;
export const RTC_FRAME_VERSION = 1;
function invalid(): never { throw new Error('invalid-rtc-frame'); }
export function rtcPacketLimit(maxMessageSize: number): number {
  if (!Number.isSafeInteger(maxMessageSize) || maxMessageSize < 0) invalid();
  const limit = maxMessageSize === 0 ? RTC_MAX_PACKET_BYTES : Math.min(maxMessageSize, RTC_MAX_PACKET_BYTES);
  if (limit - RTC_MAX_HEADER_BYTES < 4096) invalid();
  return limit;
}
/** Big-endian v1: magic:u16/version:u8/class:u8/streamChars:u16/index:u16/count:u16/reserved:u16,
 * messageId:f64/sequence:f64/total:u32/offset:u32/length:u32, UTF-16 stream, fragment bytes.
 * All integers are exact; canonical fragments use the negotiated packet limit minus actual header. */
export function encodeRtcFrames(bytes: Uint8Array, metadata: PayloadMetadata, messageId: number, packetLimit: number): Uint8Array[] {
  packetLimit = rtcPacketLimit(packetLimit);
  if (!validMetadata(metadata) || !Number.isSafeInteger(messageId) || messageId <= 0
    || !(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > PAYLOAD_LIMITS[metadata.class]) invalid();
  const header = RTC_HEADER_BYTES + metadata.stream.length * 2, capacity = packetLimit - header;
  const count = Math.ceil(bytes.length / capacity), frames: Uint8Array[] = [];
  for (let index = 0; index < count; index++) {
    const offset = index * capacity, length = Math.min(capacity, bytes.length - offset), frame = new Uint8Array(header + length), view = new DataView(frame.buffer);
    view.setUint16(0, RTC_FRAME_MAGIC); view.setUint8(2, RTC_FRAME_VERSION); view.setUint8(3, CLASSES.indexOf(metadata.class));
    view.setUint16(4, metadata.stream.length); view.setUint16(6, index); view.setUint16(8, count);
    view.setFloat64(12, messageId); view.setFloat64(20, metadata.sequence); view.setUint32(28, bytes.length); view.setUint32(32, offset); view.setUint32(36, length);
    for (let i = 0; i < metadata.stream.length; i++) view.setUint16(RTC_HEADER_BYTES + i * 2, metadata.stream.charCodeAt(i));
    frame.set(bytes.subarray(offset, offset + length), header); frames.push(frame);
  }
  return frames;
}
export interface RtcFrame { metadata: PayloadMetadata; messageId: number; total: number; index: number; count: number; offset: number; bytes: Uint8Array }
export function decodeRtcFrame(bytes: Uint8Array, packetLimit: number): RtcFrame {
  packetLimit = rtcPacketLimit(packetLimit);
  if (!(bytes instanceof Uint8Array) || bytes.length < RTC_HEADER_BYTES || bytes.length > packetLimit) invalid();
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), cls = CLASSES[v.getUint8(3)];
  const chars = v.getUint16(4), header = RTC_HEADER_BYTES + chars * 2, index = v.getUint16(6), count = v.getUint16(8);
  const messageId = v.getFloat64(12), sequence = v.getFloat64(20), total = v.getUint32(28), offset = v.getUint32(32), length = v.getUint32(36);
  if (v.getUint16(0) !== RTC_FRAME_MAGIC || v.getUint8(2) !== RTC_FRAME_VERSION || v.getUint16(10) !== 0 || !cls
    || chars === 0 || chars > RTC_MAX_STREAM_CHARS || header > bytes.length || !Number.isSafeInteger(messageId) || messageId <= 0
    || !Number.isSafeInteger(sequence) || sequence <= 0 || total === 0 || total > PAYLOAD_LIMITS[cls]
    || count === 0 || count > RTC_MAX_RECORDS || index >= count || count !== Math.ceil(total / (packetLimit - header))
    || offset !== index * (packetLimit - header) || length !== Math.min(packetLimit - header, total - offset) || length <= 0 || bytes.length !== header + length) invalid();
  let stream = ''; for (let i = 0; i < chars; i++) stream += String.fromCharCode(v.getUint16(RTC_HEADER_BYTES + i * 2));
  return { metadata: { class: cls, stream, sequence }, messageId, total, index, count, offset, bytes: bytes.slice(header) };
}
export interface RtcPacket { metadata: PayloadMetadata; bytes: Uint8Array }
export function createRtcReassembler(packetLimit: number) {
  packetLimit = rtcPacketLimit(packetLimit);
  const partial = new Map<number, { frame: RtcFrame; bytes: Uint8Array; nextIndex: number; expires: number }>();
  const reliable = new Map<string, number>(), latest = new Map<string, number>();
  let newestReliableId = 0;
  function expire(now: number): number { let n = 0; for (const [id, p] of partial) if (now >= p.expires) { partial.delete(id); n++; } return n; }
  function admit(streams: Map<string, number>, metadata: PayloadMetadata): boolean {
    const previous = streams.get(metadata.stream);
    if (previous === undefined && streams.size >= RTC_MAX_STREAMS) invalid();
    return metadata.sequence > (previous ?? 0);
  }
  return {
    get partialCount() { return partial.size; },
    get nextExpiry() { let at = Infinity; for (const p of partial.values()) at = Math.min(at, p.expires); return at; },
    expire,
    clear() { partial.clear(); reliable.clear(); latest.clear(); newestReliableId = 0; },
    accept(bytes: Uint8Array, kind: ChannelKind, now: number): RtcPacket | undefined {
      expire(now); const f = decodeRtcFrame(bytes, packetLimit);
      if (kind === 'unreliable-latest') {
        if (f.count !== 1) invalid();
        if (!admit(latest, f.metadata)) return;
        latest.set(f.metadata.stream, f.metadata.sequence); return { metadata: f.metadata, bytes: f.bytes };
      }
      if (kind !== 'reliable-ordered') invalid();
      let p = partial.get(f.messageId);
      if (!p) {
        if (f.index !== 0 || f.messageId <= newestReliableId || !admit(reliable, f.metadata)) invalid();
        if (f.count > 1 && partial.size >= RTC_MAX_ASSEMBLIES) invalid();
        newestReliableId = f.messageId; reliable.set(f.metadata.stream, f.metadata.sequence);
        if (f.count === 1) return { metadata: f.metadata, bytes: f.bytes };
        p = { frame: f, bytes: new Uint8Array(f.total), nextIndex: 0, expires: now + RTC_ASSEMBLY_TTL_MS }; partial.set(f.messageId, p);
      }
      if (p.nextIndex !== f.index || p.frame.count !== f.count || p.frame.total !== f.total || p.frame.metadata.class !== f.metadata.class
        || p.frame.metadata.stream !== f.metadata.stream || p.frame.metadata.sequence !== f.metadata.sequence) invalid();
      p.bytes.set(f.bytes, f.offset); p.nextIndex++;
      if (p.nextIndex === f.count) { partial.delete(f.messageId); return { metadata: f.metadata, bytes: p.bytes }; }
      return;
    }
  };
}
