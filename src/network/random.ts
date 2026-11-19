// Platform random source (web build spec §3.1). Lives outside src/shared, which tests/boundary.test.ts holds to the
// deterministic rules (no `crypto`).
import { bytesToHex } from '../shared/bytes';
/** `byteLength` random bytes from crypto.getRandomValues, as lowercase hex (today's randomBytes(n).toString('hex')). */
export function randomHex(byteLength: number): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}
