// Portable byte helpers (web build spec §3.1): the page's replacements for Buffer and node:crypto's randomBytes.
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
/** Strict: atob throws on characters outside the base64 alphabet (callers validate canonical form first). */
export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text), out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
export function bytesToHex(bytes: Uint8Array): string {
  let hex = ''; for (const byte of bytes) hex += byte.toString(16).padStart(2, '0'); return hex;
}
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
