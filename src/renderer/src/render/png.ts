const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from a PNG's IHDR chunk (bytes 16-23, big-endian). No dependency; enough for grid checks. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24 || SIGNATURE.some((v, i) => bytes[i] !== v)) throw new Error('not a PNG');
  if (String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!) !== 'IHDR') throw new Error('PNG without IHDR first');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}
