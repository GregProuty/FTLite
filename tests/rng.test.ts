import { describe, it, expect } from 'vitest';
import { createRng, nextU32, nextFloat, nextInt, chance } from '../src/shared/rng';

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(12345), b = createRng(12345);
    for (let i = 0; i < 100; i++) expect(nextU32(a)).toBe(nextU32(b));
  });
  it('differs between seeds', () => {
    expect(nextU32(createRng(1))).not.toBe(nextU32(createRng(2)));
  });
  it('matches a known first value for seed 0', () => {
    // Reference value computed once from the mulberry32 algorithm; locks the implementation.
    expect(nextU32(createRng(0))).toBe(1144304738);
  });
  it('nextFloat is in [0,1) and nextInt in [0,n)', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const f = nextFloat(r); expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(1);
      const k = nextInt(r, 9); expect(k).toBeGreaterThanOrEqual(0); expect(k).toBeLessThan(9);
    }
  });
  it('chance(p) is true about p of the time', () => {
    const r = createRng(3); let hits = 0;
    for (let i = 0; i < 10000; i++) if (chance(r, 0.25)) hits++;
    expect(hits).toBeGreaterThan(2300); expect(hits).toBeLessThan(2700);
  });
  it('state is a plain serializable object', () => {
    const r = createRng(9); nextU32(r);
    const copy = JSON.parse(JSON.stringify(r));
    expect(nextU32(copy)).toBe(nextU32(r));
  });
});
