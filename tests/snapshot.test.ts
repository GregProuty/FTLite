import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { saveSnapshot, loadSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { flatten } from '../src/renderer/src/sim/flatten';
import { step } from '../src/renderer/src/sim/step';
import { Position } from '../src/renderer/src/sim/components';
import { NEUTRAL_INTENT, type Intent } from '../src/shared/intent';
import { botIntent } from './helpers/bot';
import { LAYOUT, makeState, intents, run } from './helpers/sim';

/** A 2-player state advanced 1500 ticks with the bot, so fires and breaches have spawned and been repaired. */
function advanced(seed: number, players = 2) {
  const s = makeState(players, seed);
  s.spawner.nextSpawnTick = 0;
  for (let i = 0; i < 1500; i++) step(s, Array.from({ length: players }, (_, pid) => botIntent(s, pid)));
  return s;
}

const arbIntent = fc.record<Intent>({
  moveX: fc.double({ min: -2, max: 2, noNaN: false }), moveY: fc.double({ min: -2, max: 2, noNaN: false }),
  interactHeld: fc.boolean(), interactPressed: fc.boolean(), confirmPressed: fc.boolean(), cancelPressed: fc.boolean()
});
const arbScript = (players: number) => fc.array(fc.array(arbIntent, { minLength: players, maxLength: players }), { minLength: 1, maxLength: 400 });

describe('snapshot', () => {
  it('round-trip is identity', () => {
    const s = makeState(3, 11);
    run(s, 200, () => intents({ moveX: 1 }, { moveY: -1 }, { interactHeld: true }));
    const snap = JSON.parse(JSON.stringify(saveSnapshot(s)));
    const t = loadSnapshot(LAYOUT, snap);
    expect(hashState(t)).toBe(hashState(s));
    expect(saveSnapshot(t)).toEqual(snap);
  });
  it('rejects a mismatched layout or format', () => {
    const snap = saveSnapshot(makeState(2));
    expect(() => loadSnapshot(LAYOUT, { ...snap, header: { ...snap.header, layoutHash: 'deadbeef' } })).toThrow(/layout/);
    expect(() => loadSnapshot(LAYOUT, { ...snap, header: { ...snap.header, formatVersion: 99 } })).toThrow(/format/);
  });
  it('property: same seed and intents give the same hash', () => {
    fc.assert(fc.property(fc.integer(), arbScript(2), (seed, script) => {
      const a = advanced(seed), b = advanced(seed);
      for (const tick of script) { step(a, tick); step(b, tick); }
      expect(hashState(a)).toBe(hashState(b));
    }), { numRuns: 50 });
  });
  it('property: save at tick N, load, continue equals an uninterrupted run', () => {
    fc.assert(fc.property(fc.integer(), arbScript(2), fc.nat(), (seed, script, nRaw) => {
      const n = nRaw % script.length;
      const whole = advanced(seed);
      for (const tick of script) step(whole, tick);
      const first = advanced(seed);
      for (let i = 0; i < n; i++) step(first, script[i]!);
      const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(first))));
      for (let i = n; i < script.length; i++) step(resumed, script[i]!);
      expect(hashState(resumed)).toBe(hashState(whole));
    }), { numRuns: 50 });
  });
  it('property: fuzzed intents never produce NaN or out-of-range values', () => {
    fc.assert(fc.property(fc.integer(), arbScript(4), (seed, script) => {
      const s = advanced(seed, 4);
      for (const tick of script) step(s, tick);
      for (const v of flatten(s)) expect(Number.isFinite(v)).toBe(true);
      for (let r = 0; r < s.rooms.o2.length; r++) { expect(s.rooms.o2[r]).toBeGreaterThanOrEqual(0); expect(s.rooms.o2[r]).toBeLessThanOrEqual(s.derived.volume[r]! + 1e-9); }
      for (const eid of s.crew) {
        expect(Position.x[eid]).toBeGreaterThan(0); expect(Position.x[eid]).toBeLessThan(s.derived.width);
        expect(Position.y[eid]).toBeGreaterThan(0); expect(Position.y[eid]).toBeLessThan(s.derived.height);
      }
    }), { numRuns: 50 });
  });
  it('neutral intents are accepted when the array is short', () => {
    const s = makeState(4);
    step(s, [NEUTRAL_INTENT]);
    expect(s.tick).toBe(1);
  });
});
