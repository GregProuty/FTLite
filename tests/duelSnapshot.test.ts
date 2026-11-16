// The duel snapshot (engine refactor spec §6, R-1b): the header with the map hash, the stored and regenerated
// values, and restore validation, at the sim level.
import { describe, expect, it } from 'vitest';
import { hashF64 } from '../src/shared/hash';
import { flattenDuel, hashDuel, mapHash } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { spaceModule } from '../src/renderer/src/sim/tactical/hash';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
function scriptedDuel(seed: number, ticks: number) {
  const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
  for (let k = 0; k < ticks && d.tactical.outcome === Outcome.Running; k++) stepDuelTick(d, scriptedInput(pair, d));
  return { d, pair };
}

describe('the duel snapshot (spec §6)', () => {
  it('stores flattenDuel under a header with the map hash, and restores to the same hash and the same future', () => {
    const { d, pair } = scriptedDuel(1, 1200);
    try {
      const snap = saveDuelSnapshot(d, DIGEST);
      expect(Object.keys(snap.header)).toEqual(['snapshotFormat', 'simVersion', 'contentDigest', 'tick', 'playerCount', 'layoutId', 'layoutHash', 'seed', 'mapHash', 'hash']);
      expect(snap.header).toMatchObject({ snapshotFormat: 1, tick: 1200, playerCount: 2, seed: 1, mapHash: mapHash(d.tactical.map), hash: hashDuel(d) });
      expect(snap.values).toEqual(Array.from(flattenDuel(d)));
      const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(snap)), DIGEST), pairR = structuredClone(pair);
      try {
        expect(hashDuel(r)).toBe(hashDuel(d));
        expect(r.interior.tick).toBe(r.tactical.tick);
        for (let k = 0; k < 600; k++) { stepDuelTick(d, scriptedInput(pair, d)); stepDuelTick(r, scriptedInput(pairR, r)); expect(hashDuel(r)).toBe(hashDuel(d)); }
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
  it('regenerates the map, grid, repair points and Derived; never stores events', () => {
    const { d } = scriptedDuel(3, 300);
    try {
      const r = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
      try {
        expect(r.tactical.map).toEqual(d.tactical.map); expect(r.tactical.grid).toEqual(d.tactical.grid);
        expect(r.points).toEqual(d.points); expect(r.interior.derived.layoutHash).toBe(d.interior.derived.layoutHash);
        expect(r.events).toEqual([]); expect(r.tactical.events).toEqual([]);
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
  it('rejects a snapshot before allocating: format, version, digest, layout, map, count, ticks and hash', () => {
    const { d } = scriptedDuel(2, 120);
    try {
      const good = saveDuelSnapshot(d, DIGEST);
      const bad = (f: (s: typeof good) => void) => { const s = structuredClone(good); f(s); return s; };
      const rehash = (s: typeof good) => { s.header.hash = hashF64(Float64Array.from(s.values)); };
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { (s.header as { snapshotFormat: number }).snapshotFormat = 2; }), DIGEST)).toThrow(/format 2 not supported/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.header.simVersion = 1; }), DIGEST)).toThrow(/sim version/);
      expect(() => validateDuelSnapshot(CUTTER, good, 'f'.repeat(64))).toThrow(/content digest/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.header.layoutHash = 'deadbeef'; }), DIGEST)).toThrow(/layout does not match/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.header.mapHash = '00000000'; }), DIGEST)).toThrow(/map does not match its seed/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.header.seed = 3; }), DIGEST)).toThrow(/map does not match its seed/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.values.push(0); rehash(s); }), DIGEST)).toThrow(/length does not match/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.values[1] = s.values[1]! + 1; rehash(s); }), DIGEST)).toThrow(/ticks differ/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.values[6] = s.values[6]! + 0.5; }), DIGEST)).toThrow(/hash does not match its values/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { (s.header as unknown as Record<string, unknown>).extra = 1; }), DIGEST)).toThrow(/header fields/);
    } finally { disposeDuel(d); }
  });
  it('rejects tactical, presence and repair values the module writers would refuse, even rehashed, before allocating', () => {
    const { d } = scriptedDuel(7, 5156);   // a missile in flight, a damaged crew room and a repair in progress
    try {
      const good = saveDuelSnapshot(d, DIGEST), names = new Map<string, number>();
      let at = 1;
      for (const f of spaceModule.fields(d.tactical)) { names.set(f.name, at); at += f.count; }
      const slot = d.tactical.missiles[0] ? 'missiles.0' : 'missiles.1', empty = d.tactical.missiles[0] ? 'missiles.1' : 'missiles.0';
      const cases: [string, number, number, RegExp][] = [
        ['ships.0.heading', 0, 256, /ships\.0\.heading: out of range/], ['ships.1.heading', 0, 1.5, /ships\.1\.heading/],
        ['ships.0.rooms', 1, 3, /ships\.0\.rooms/], ['ships.0.shields', 0, 3, /ships\.0\.shields/], ['ships.1.magazine', 0, 5, /ships\.1\.magazine/],
        ['ships.0.shots', 0, 2.5, /ships\.0\.shots/], ['ships.0.laserCharge', 0, -1, /ships\.0\.laserCharge/], ['ships.1.lock', 0, 3, /ships\.1\.lock/],
        ['ships.0.released', 0, 2, /ships\.0\.released/], ['hunter.mode', 0, 2, /hunter\.mode/], ['hunter.trailHead', 0, 18, /hunter\.trailHead/],
        ['outcome', 0, 4, /outcome: out of range/], [slot, 0, 2, /presence is not 0 or 1/], [slot, 5, 300, /heading or age/], [slot, 7, -1, /heading or age/],
        [empty, 3, 0.25, /an empty slot holds values/], ['ships.0.graceUntil', 0, 2147483648, /ships\.0\.graceUntil/]
      ];
      for (const [name, k, value, error] of cases) {
        const snap = structuredClone(good); snap.values[names.get(name)! + k] = value; snap.header.hash = hashF64(Float64Array.from(snap.values));
        expect(() => validateDuelSnapshot(CUTTER, snap, DIGEST), `${name}[${k}] = ${value}`).toThrow(error);
      }
      const space = at - 1;
      for (const [k, value] of [[1 + space, 2], [1 + space + 2, 960], [1 + space + 4, -1]] as const) {
        const snap = structuredClone(good); snap.values[k] = value; snap.header.hash = hashF64(Float64Array.from(snap.values));
        expect(() => validateDuelSnapshot(CUTTER, snap, DIGEST)).toThrow(/presence|repair/);
      }
    } finally { disposeDuel(d); }
  });
  it('accepts every state the scripted duels reach (seeds 1, 4 and 7, every 30 ticks)', () => {
    for (const seed of [1, 4, 7]) {
      const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
      try {
        while (d.tactical.outcome === Outcome.Running) {
          stepDuelTick(d, scriptedInput(pair, d));
          if (d.interior.tick % 30 === 0 || d.tactical.outcome !== Outcome.Running) validateDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
        }
      } finally { disposeDuel(d); }
    }
  }, 60_000);
});
