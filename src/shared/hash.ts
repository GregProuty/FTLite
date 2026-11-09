// FNV-1a 32-bit over the raw bytes of a Float64Array. All supported platforms are little-endian;
// the byte view is explicit so a big-endian host would be caught by the golden replays, not silently differ.
export function hashF64(values: Float64Array): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
