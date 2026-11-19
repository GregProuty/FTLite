import { createHash, randomBytes } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sha256, sha256Hex } from '../src/shared/sha256';

const node = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
describe('synchronous SHA-256 (web build spec §3.1)', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    ['abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu', 'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1'],
  ])('matches the FIPS 180-2 vector for %j', (text, hex) => {
    expect(sha256Hex(text)).toBe(hex); expect(sha256Hex(new TextEncoder().encode(text))).toBe(hex);
  });
  it('matches the one-million-a vector', () => {
    expect(sha256Hex(new Uint8Array(1_000_000).fill(0x61))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
  it('matches node:crypto byte for byte at every length across three block boundaries', () => {
    for (let length = 0; length <= 200; length++) { const bytes = randomBytes(length); expect(sha256Hex(bytes)).toBe(node(bytes)); }
  });
  it('matches node:crypto on random inputs up to 70 KiB', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 70000 }), bytes => sha256Hex(bytes) === node(bytes)), { numRuns: 300 });
  });
  it('matches node:crypto on a full 512 KiB checkpoint-sized input and on a subarray view', () => {
    const bytes = randomBytes(524288), view = bytes.subarray(7, 524288 - 9);
    expect(sha256Hex(bytes)).toBe(node(bytes)); expect(sha256Hex(view)).toBe(node(view));
  });
  it('returns 32 raw bytes and never mutates its input', () => {
    const input = randomBytes(77), copy = Uint8Array.from(input), digest = sha256(input);
    expect(digest).toBeInstanceOf(Uint8Array); expect(digest.length).toBe(32); expect(Uint8Array.from(input)).toEqual(copy);
    expect(Buffer.from(digest).toString('hex')).toBe(node(input));
  });
});
