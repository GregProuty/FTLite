// Audio-i spec section 3: the pure parts of a play.
import { describe, it, expect } from 'vitest';
import { admitVoice, createVoicePool, detuneCents, pickVariant, screenPan, tilePan, worldPan, PAN_WIDTH, VOICE_CAP } from '../src/renderer/src/audio/voices';

const seq = (...xs: number[]): (() => number) => { let k = 0; return () => xs[k++ % xs.length]!; };
const lcg = (seed: number): (() => number) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

describe('voices (Audio-i spec section 3)', () => {
  it('never repeats the last variant when there is a choice', () => {
    const last = new Map<string, number>(), r = seq(0, 0.99, 0.5, 0.1, 0.7, 0.3);
    let prev = -1;
    for (let k = 0; k < 60; k++) { const v = pickVariant(last, 'laser', 5, r); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(5); expect(v).not.toBe(prev); prev = v; }
    expect(pickVariant(last, 'hum', 1, r)).toBe(0); expect(pickVariant(last, 'hum', 1, r)).toBe(0);
    expect(pickVariant(new Map(), 'k', 3, () => 1)).toBe(2);   // random() = 1 stays in range
  });
  it('uses every variant over time', () => {
    const last = new Map<string, number>(), seen = new Set<number>(), r = lcg(7);
    for (let k = 0; k < 200; k++) seen.add(pickVariant(last, 'k', 3, r));
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });
  it('detunes within the spread', () => {
    expect(detuneCents(() => 0)).toBe(-50); expect(detuneCents(() => 1)).toBe(50); expect(detuneCents(() => 0.5)).toBe(0); expect(detuneCents(() => 1, 10)).toBe(10);
  });
  it('pans from the screen, from a world offset and from a tile column', () => {
    expect(screenPan(0, 1280)).toBeCloseTo(-PAN_WIDTH); expect(screenPan(640, 1280)).toBeCloseTo(0); expect(screenPan(1280, 1280)).toBeCloseTo(PAN_WIDTH);
    expect(screenPan(5000, 1280)).toBeCloseTo(PAN_WIDTH); expect(screenPan(Number.NaN, 1280)).toBe(0); expect(screenPan(10, 0)).toBe(0);
    expect(worldPan(0)).toBe(0); expect(worldPan(600)).toBeCloseTo(PAN_WIDTH); expect(worldPan(-9000)).toBeCloseTo(-PAN_WIDTH);
    expect(tilePan(0, 10)).toBeCloseTo(-0.9 * PAN_WIDTH); expect(tilePan(9, 10)).toBeCloseTo(0.9 * PAN_WIDTH);
  });
  it('caps live voices per key at four and steals the oldest', () => {
    const pool = createVoicePool(), ids: number[] = [];
    for (let k = 0; k < VOICE_CAP; k++) { const a = admitVoice(pool, 'laser', 0, 1); expect(a.steal).toEqual([]); ids.push(a.id); }
    expect(admitVoice(pool, 'laser', 0.1, 1).steal).toEqual([ids[0]]);
    expect(admitVoice(pool, 'boom', 0.1, 1).steal).toEqual([]);    // another key has its own cap
    expect(admitVoice(pool, 'laser', 2, 3).steal).toEqual([]);     // every earlier voice ended by t = 2
    expect(pool.voices.map((v) => v.key)).toEqual(['laser']);
  });
});
