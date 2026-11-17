// The duel publication validation cache, the in-place restore and the duel's seeds (H-2 spec §2, §4, §5).
import { describe, expect, it } from 'vitest';
import { hashTactical } from '../src/renderer/src/sim/tactical/hash';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import * as snapshots from '../src/renderer/src/sim/duel/snapshot';
import { duelCacheProbe, duelSeedFacts, LAYOUT_CACHE_MAX, loadDuelSnapshot, MAX_DUEL_ROUNDS, restoreDuelSnapshot, saveDuelSnapshot, SEED_CACHE_MAX, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { followingSeed, MAX_SEED_STEPS, nextValidSeed, roundSeed, seedFromRunId } from '../src/renderer/src/sim/duel/seeds';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { validateMap } from '../src/renderer/src/sim/tactical/map';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const played = (seed: number, ticks: number) => {
  const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
  for (let k = 0; k < ticks; k++) stepDuelTick(d, scriptedInput(pair, d));
  return d;
};
const outcome = (f: () => unknown): string => { try { f(); return 'accepted'; } catch (e) { return (e as Error).message; } };

describe('the duel validation cache (spec §5)', () => {
  it('is bounded: at most 8 seeds and 4 layouts, least recently used first out', () => {
    for (let seed = 100; seed < 120; seed++) duelSeedFacts(seed);
    expect(duelCacheProbe().seeds).toBe(SEED_CACHE_MAX);
    expect(duelCacheProbe(100).shapeHash).toBeNull();        // evicted
    expect(duelCacheProbe(119).shapeHash).not.toBeNull();
    duelSeedFacts(112);                                       // touched: now the most recent
    for (let seed = 200; seed < 207; seed++) duelSeedFacts(seed);
    expect(duelCacheProbe(112).shapeHash).not.toBeNull();
    expect(duelCacheProbe(113).shapeHash).toBeNull();
    const d = createDuel(CUTTER, 5);
    try { for (let k = 0; k < 6; k++) validateDuelSnapshot(structuredClone(CUTTER), saveDuelSnapshot(d, DIGEST), DIGEST); } finally { disposeDuel(d); }
    expect(duelCacheProbe().layouts).toBe(LAYOUT_CACHE_MAX);
  });
  it('agrees with an uncached regeneration, and the shape no caller can obtain is never changed by 10,000 validations', () => {
    for (const seed of [1, 7, 2026]) {
      const fresh = createTacticalState(seed);
      expect(duelSeedFacts(seed)).toMatchObject({ valid: validateMap(fresh.map).length === 0, graceLength: fresh.ships[0].graceUntil.length });
    }
    expect(Object.keys(snapshots).filter((k) => /shape|entry|cache/i.test(k)).sort()).toEqual(['LAYOUT_CACHE_MAX', 'SEED_CACHE_MAX', 'duelCacheProbe']);
    const d = played(3, 400);
    try {
      const snap = saveDuelSnapshot(d, DIGEST);
      validateDuelSnapshot(CUTTER, snap, DIGEST);
      const before = duelCacheProbe(3).shapeHash;
      expect(before).toBe(hashTactical(createTacticalState(3)));
      for (let k = 0; k < 10_000; k++) validateDuelSnapshot(CUTTER, snap, DIGEST);
      expect(duelCacheProbe(3).shapeHash).toBe(before);
    } finally { disposeDuel(d); }
  }, 60_000);
  it('accepts and rejects exactly as before, whether the seed is cached or was just evicted', () => {
    const d = played(2, 300);
    try {
      const good = saveDuelSnapshot(d, DIGEST);
      const variants = [good, { ...good, header: { ...good.header, mapHash: '00000000' } }, { ...good, values: good.values.map((v, k) => (k === 9 ? v + 0.5 : v)) },
        { ...good, header: { ...good.header, seed: 3 } }, { ...good, values: good.values.slice(1) }];
      const warm = variants.map((v) => outcome(() => validateDuelSnapshot(CUTTER, v, DIGEST)));
      for (let seed = 300; seed < 300 + SEED_CACHE_MAX + 1; seed++) duelSeedFacts(seed);   // evict seeds 2 and 3
      expect(duelCacheProbe(2).shapeHash).toBeNull();
      expect(variants.map((v) => outcome(() => validateDuelSnapshot(CUTTER, v, DIGEST)))).toEqual(warm);
      expect(warm[0]).toBe('accepted');
      expect(warm.slice(1).every((m) => m !== 'accepted')).toBe(true);
    } finally { disposeDuel(d); }
  });
});

describe('restoreDuelSnapshot (spec §4)', () => {
  it('restores a validated snapshot into an existing duel in place, to the same hash as a load', () => {
    const a = played(4, 200), b = played(4, 900);
    try {
      const snap = validateDuelSnapshot(CUTTER, saveDuelSnapshot(b, DIGEST), DIGEST), interior = a.interior;
      restoreDuelSnapshot(a, snap, DIGEST);
      expect(a.interior).toBe(interior);                       // no new interior
      expect([a.events, a.tactical.events]).toEqual([[], []]);   // as a fresh load: no per-tick events
      expect(hashDuel(a)).toBe(hashDuel(b));
      const loaded = loadDuelSnapshot(CUTTER, snap, DIGEST);
      try { expect(hashDuel(loaded)).toBe(hashDuel(a)); } finally { disposeDuel(loaded); }
    } finally { disposeDuel(a); disposeDuel(b); }
  });
  it('refuses a snapshot of another seed or digest (a new round is a replacement)', () => {
    const a = played(4, 10), c = played(5, 10);
    try {
      const other = validateDuelSnapshot(CUTTER, saveDuelSnapshot(c, DIGEST), DIGEST);
      expect(() => restoreDuelSnapshot(a, other, DIGEST)).toThrow(/load it instead/);
      expect(() => restoreDuelSnapshot(a, validateDuelSnapshot(CUTTER, saveDuelSnapshot(a, DIGEST), DIGEST), 'f'.repeat(64))).toThrow(/versions/);
    } finally { disposeDuel(a); disposeDuel(c); }
  });
});

describe('the duel seeds (spec §2)', () => {
  it('nextValidSeed returns the first valid seed at or after its argument, within 16 steps', () => {
    for (const s of [0, 1, 2026, 0xfffffff0]) {
      const v = nextValidSeed(s), steps = (v - s + 2 ** 32) % 2 ** 32;
      expect(steps).toBeLessThan(MAX_SEED_STEPS);
      expect(validateMap(createTacticalState(v).map)).toEqual([]);
      for (let k = 0; k < steps; k++) expect(validateMap(createTacticalState((s + k) >>> 0).map).length).toBeGreaterThan(0);
    }
    expect(() => nextValidSeed(-1)).toThrow(/invalid duel seed/);
  });
  it('round n is nextValidSeed after round n − 1 plus one; round 0 is the init seed', () => {
    const init = nextValidSeed(77);
    expect(roundSeed(init, 0)).toBe(init);
    let s = init;
    for (let n = 1; n <= 5; n++) { s = nextValidSeed((s + 1) >>> 0); expect(roundSeed(init, n)).toBe(s); expect(followingSeed(roundSeed(init, n - 1))).toBe(s); }
    expect(() => roundSeed(init, MAX_DUEL_ROUNDS + 1)).toThrow(/invalid duel round 1025/);   // bounded before any seed work
  });
  it('a room seed is the runId\'s first eight hex digits as a u32, then the next valid seed', () => {
    expect(seedFromRunId('0000002a' + '0'.repeat(24))).toBe(nextValidSeed(42));
    expect(seedFromRunId('ffffffff' + 'a'.repeat(24))).toBe(nextValidSeed(0xffffffff));
    expect(() => seedFromRunId('XYZ')).toThrow(/32 lowercase hex/);
  });
});
