import { PAYLOAD_LIMITS, validMetadata, type PayloadClass, type PayloadMetadata } from '../rtc/contracts';

export interface StateImage { sequence: number; tick: number; epoch: string; metadata: Uint8Array; values: Float64Array }
export type StateControl = { kind: 'ack' | 'full-received' | 'refresh'; sequence: number };
const IMAGE_MAGIC = 0x474d4953, PACKET_MAGIC = 0x4d525453;
const HEADER = 48, OUTER = 20;
export const STATE_PACKET_OVERHEAD = OUTER + 10;
export const MAX_IMAGE_BYTES = PAYLOAD_LIMITS.state - STATE_PACKET_OVERHEAD;
export const MAX_METADATA_BYTES = 16384;
export const MAX_RETAINED_IMAGES = 64, MAX_RETAINED_BYTES = 8 * 1024 * 1024;
const classes: readonly PayloadClass[] = ['input', 'state', 'checkpoint', 'control'];
export class StateCodecError extends Error {
  constructor(readonly code: 'malformed' | 'checksum' | 'missing-base') { super(`state-${code}`); }
}
function requireValid(value: unknown): asserts value { if (!value) throw new StateCodecError('malformed'); }
function integer(value: number, minimum = 0): boolean { return Number.isSafeInteger(value) && value >= minimum; }
function view(bytes: Uint8Array): DataView { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
function writeText(v: DataView, offset: number, text: string): void { for (let i = 0; i < text.length; i++) v.setUint16(offset + i * 2, text.charCodeAt(i), true); }
function readText(v: DataView, offset: number, length: number): string { let result = ''; for (let i = 0; i < length; i++) result += String.fromCharCode(v.getUint16(offset + i * 2, true)); return result; }
export function imageBytes(image: StateImage): number { return HEADER + image.epoch.length * 2 + image.metadata.length + image.values.length * 8; }
export function copyImage(image: StateImage): StateImage { return { ...image, metadata: image.metadata.slice(), values: image.values.slice() }; }
function validateImage(image: StateImage): void {
  requireValid(image && integer(image.sequence, 1) && integer(image.tick) && typeof image.epoch === 'string' && image.epoch.length <= 128);
  requireValid(image.metadata instanceof Uint8Array && image.metadata.length <= MAX_METADATA_BYTES && image.values instanceof Float64Array);
  requireValid(imageBytes(image) <= MAX_IMAGE_BYTES);
  for (const value of image.values) requireValid(Number.isFinite(value));
}
function checksum(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ (i >= 44 && i < 48 ? 0 : bytes[i]!), 0x01000193);
  return hash >>> 0;
}
function header(image: StateImage, kind: number, base: number, changed: number, length: number): Uint8Array {
  const bytes = new Uint8Array(length), v = view(bytes);
  v.setUint32(0, IMAGE_MAGIC, true); v.setUint8(4, 1); v.setUint8(5, kind); v.setUint16(6, image.epoch.length, true);
  v.setFloat64(8, image.sequence, true); v.setFloat64(16, image.tick, true); v.setFloat64(24, base, true);
  v.setUint32(32, image.values.length, true); v.setUint32(36, image.metadata.length, true); v.setUint32(40, changed, true);
  writeText(v, HEADER, image.epoch); bytes.set(image.metadata, HEADER + image.epoch.length * 2);
  return bytes;
}
export function encodeFull(image: StateImage): Uint8Array {
  validateImage(image);
  const bytes = header(image, 0, 0, image.values.length, imageBytes(image)), v = view(bytes), offset = HEADER + image.epoch.length * 2 + image.metadata.length;
  for (let i = 0; i < image.values.length; i++) v.setFloat64(offset + i * 8, image.values[i]!, true);
  v.setUint32(44, checksum(bytes), true); return bytes;
}
export function encodeDelta(base: StateImage, image: StateImage): Uint8Array {
  validateImage(base); validateImage(image);
  requireValid(base.sequence < image.sequence && base.epoch === image.epoch && base.values.length === image.values.length);
  let count = 0;
  for (let i = 0; i < image.values.length; i++) if (!Object.is(base.values[i], image.values[i])) count++;
  const offset = HEADER + image.epoch.length * 2 + image.metadata.length, length = offset + count * 12;
  requireValid(length <= MAX_IMAGE_BYTES);
  const bytes = header(image, 1, base.sequence, count, length), v = view(bytes);
  let cursor = offset;
  for (let i = 0; i < image.values.length; i++) if (!Object.is(base.values[i], image.values[i])) {
    v.setUint32(cursor, i, true); v.setFloat64(cursor + 4, image.values[i]!, true); cursor += 12;
  }
  v.setUint32(44, view(encodeFull(image)).getUint32(44, true), true); return bytes;
}
export interface StateHeader { kind: 'full' | 'delta'; sequence: number; tick: number; baseSequence: number; epoch: string; valueCount: number; metadataLength: number; changedCount: number; valueOffset: number; checksum: number }
/** Complete structural inspection before any value allocation or full-received receipt. */
export function inspectState(bytes: Uint8Array): StateHeader {
  requireValid(bytes instanceof Uint8Array && bytes.length >= HEADER && bytes.length <= MAX_IMAGE_BYTES);
  const v = view(bytes), kind = v.getUint8(5), epochLength = v.getUint16(6, true);
  requireValid(v.getUint32(0, true) === IMAGE_MAGIC && v.getUint8(4) === 1 && kind <= 1 && epochLength <= 128);
  const sequence = v.getFloat64(8, true), tick = v.getFloat64(16, true), baseSequence = v.getFloat64(24, true);
  const valueCount = v.getUint32(32, true), metadataLength = v.getUint32(36, true), changedCount = v.getUint32(40, true);
  requireValid(integer(sequence, 1) && integer(tick) && integer(baseSequence) && metadataLength <= MAX_METADATA_BYTES);
  const valueOffset = HEADER + epochLength * 2 + metadataLength;
  requireValid(valueOffset + valueCount * 8 <= MAX_IMAGE_BYTES && changedCount <= valueCount);
  requireValid(bytes.length === valueOffset + changedCount * (kind === 0 ? 8 : 12));
  requireValid(kind === 0 ? baseSequence === 0 && changedCount === valueCount : baseSequence > 0 && baseSequence < sequence);
  if (kind === 1) {
    let previous = -1;
    for (let i = 0; i < changedCount; i++) { const index = v.getUint32(valueOffset + i * 12, true); requireValid(index > previous && index < valueCount); previous = index; }
  }
  return { kind: kind === 0 ? 'full' : 'delta', sequence, tick, baseSequence, epoch: readText(v, HEADER, epochLength), valueCount, metadataLength, changedCount, valueOffset, checksum: v.getUint32(44, true) };
}
export function decodeState(bytes: Uint8Array, base?: StateImage): StateImage {
  const h = inspectState(bytes), v = view(bytes);
  if (h.kind === 'delta' && (!base || base.sequence !== h.baseSequence || base.epoch !== h.epoch || base.values.length !== h.valueCount)) throw new StateCodecError('missing-base');
  const values = h.kind === 'full' ? new Float64Array(h.valueCount) : base!.values.slice();
  for (let i = 0; i < h.changedCount; i++) {
    const offset = h.valueOffset + i * (h.kind === 'full' ? 8 : 12), index = h.kind === 'full' ? i : v.getUint32(offset, true);
    const value = v.getFloat64(offset + (h.kind === 'full' ? 0 : 4), true); requireValid(Number.isFinite(value)); values[index] = value;
  }
  const image = { sequence: h.sequence, tick: h.tick, epoch: h.epoch, metadata: bytes.slice(h.valueOffset - h.metadataLength, h.valueOffset), values };
  if (view(encodeFull(image)).getUint32(44, true) !== h.checksum) throw new StateCodecError('checksum');
  return image;
}

/** Share this allocator between all state and opaque producers on one connection endpoint. */
export function createTransportSequence(): () => number {
  let sequence = 0; return () => { requireValid(sequence < Number.MAX_SAFE_INTEGER); return ++sequence; };
}
function encodePacket(kind: number, payloadClass: PayloadClass, stream: string, sequence: number, payload: Uint8Array): Uint8Array {
  requireValid(validMetadata({ class: payloadClass, stream, sequence }) && payload instanceof Uint8Array);
  const offset = OUTER + stream.length * 2;
  requireValid(offset + payload.length <= PAYLOAD_LIMITS[payloadClass]);
  const bytes = new Uint8Array(offset + payload.length), v = view(bytes);
  v.setUint32(0, PACKET_MAGIC, true); v.setUint8(4, 1); v.setUint8(5, kind); v.setUint8(6, classes.indexOf(payloadClass));
  v.setFloat64(8, sequence, true); v.setUint16(16, stream.length, true); writeText(v, OUTER, stream); bytes.set(payload, offset); return bytes;
}
function decodePacket(bytes: Uint8Array): { kind: number; metadata: PayloadMetadata; payload: Uint8Array } {
  requireValid(bytes instanceof Uint8Array && bytes.length >= OUTER && bytes.length <= PAYLOAD_LIMITS.checkpoint);
  const v = view(bytes), kind = v.getUint8(5), payloadClass = classes[v.getUint8(6)], length = v.getUint16(16, true), offset = OUTER + length * 2;
  requireValid(v.getUint32(0, true) === PACKET_MAGIC && v.getUint8(4) === 1 && kind <= 2 && v.getUint8(7) === 0 && v.getUint16(18, true) === 0);
  requireValid(payloadClass && length > 0 && length <= 128 && offset <= bytes.length && bytes.length <= PAYLOAD_LIMITS[payloadClass]);
  const metadata = { class: payloadClass, stream: readText(v, OUTER, length), sequence: v.getFloat64(8, true) };
  requireValid(validMetadata(metadata));
  if (kind === 1) requireValid(payloadClass === 'state' && metadata.stream === 'state');
  if (kind === 2) requireValid(payloadClass === 'control' && metadata.stream === 'state-control');
  return { kind, metadata, payload: bytes.subarray(offset) };
}
export function encodeStatePacket(imageBytes: Uint8Array, transportSequence: number): Uint8Array { return encodePacket(1, 'state', 'state', transportSequence, imageBytes); }
export function decodeStatePacket(bytes: Uint8Array): Uint8Array { const packet = decodePacket(bytes); requireValid(packet.kind === 1); return packet.payload.slice(); }
export function isStatePacket(bytes: Uint8Array): boolean { try { return decodePacket(bytes).kind === 1; } catch { return false; } }
export function classifyStreamPacket(bytes: Uint8Array): PayloadMetadata { return decodePacket(bytes).metadata; }
export function encodeOpaquePacket(payloadClass: PayloadClass, stream: string, transportSequence: number, bytes: Uint8Array): Uint8Array { return encodePacket(0, payloadClass, stream, transportSequence, bytes); }
export function decodeOpaquePacket(bytes: Uint8Array): PayloadMetadata & { bytes: Uint8Array } { const packet = decodePacket(bytes); requireValid(packet.kind === 0); return { ...packet.metadata, bytes: packet.payload.slice() }; }
export function encodeControl(control: StateControl, transportSequence: number): Uint8Array {
  const kind = ['ack', 'full-received', 'refresh'].indexOf(control.kind);
  requireValid(kind >= 0 && integer(control.sequence, kind === 2 ? 0 : 1));
  const bytes = new Uint8Array(12), v = view(bytes); v.setUint8(0, 1); v.setUint8(1, kind); v.setFloat64(4, control.sequence, true);
  return encodePacket(2, 'control', 'state-control', transportSequence, bytes);
}
export function decodeControl(bytes: Uint8Array): StateControl {
  const packet = decodePacket(bytes); requireValid(packet.kind === 2 && packet.payload.length === 12);
  const v = view(packet.payload), kind = (['ack', 'full-received', 'refresh'] as const)[v.getUint8(1)], sequence = v.getFloat64(4, true);
  requireValid(v.getUint8(0) === 1 && kind && v.getUint16(2, true) === 0 && integer(sequence, kind === 'refresh' ? 0 : 1));
  return { kind, sequence };
}

/** Images placed here must already be detached from external callbacks. */
export class ImageStore {
  private images = new Map<number, StateImage>(); private bytes = 0;
  get(sequence: number): StateImage | undefined { return this.images.get(sequence); }
  put(image: StateImage, protectedSequences: readonly number[] = []): void {
    const old = this.images.get(image.sequence); if (old) this.bytes -= imageBytes(old);
    this.images.set(image.sequence, image); this.bytes += imageBytes(image);
    for (const [sequence, value] of this.images) {
      if (this.images.size <= MAX_RETAINED_IMAGES && this.bytes <= MAX_RETAINED_BYTES) break;
      if (protectedSequences.includes(sequence)) continue;
      this.images.delete(sequence); this.bytes -= imageBytes(value);
    }
  }
  clear(): void { this.images.clear(); this.bytes = 0; }
  stats(): { retainedImages: number; retainedBytes: number } { return { retainedImages: this.images.size, retainedBytes: this.bytes }; }
}
