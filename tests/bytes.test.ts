import { randomBytes } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesEqual, bytesToBase64, bytesToHex } from '../src/shared/bytes';
import { randomHex } from '../src/network/random';

describe('portable byte helpers (web build spec §3.1)', () => {
  it('base64 matches Buffer in both directions, including a 512 KiB input', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 5000 }), bytes => {
      const text = bytesToBase64(bytes);
      return text === Buffer.from(bytes).toString('base64') && bytesEqual(base64ToBytes(text), bytes);
    }), { numRuns: 300 });
    const big = randomBytes(524288); expect(bytesToBase64(big)).toBe(big.toString('base64'));
  });
  it('rejects malformed base64 instead of skipping characters as Buffer does', () => {
    expect(() => base64ToBytes('ab$d')).toThrow();
  });
  it('hex matches Buffer and random hex has the requested size and alphabet', () => {
    const bytes = randomBytes(33); expect(bytesToHex(bytes)).toBe(bytes.toString('hex'));
    const value = randomHex(16); expect(value).toMatch(/^[0-9a-f]{32}$/); expect(randomHex(16)).not.toBe(value);
  });
  it('compares bytes exactly', () => {
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
  });
});
