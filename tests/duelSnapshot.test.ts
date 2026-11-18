// The duel snapshot (engine refactor spec §6, R-1b): the header with the map hash, the stored and regenerated
// values, and restore validation, at the sim level.
import { describe, expect, it, vi } from 'vitest';
import * as duelState from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { hashF64 } from '../src/shared/hash';
import { flattenDuel, hashDuel, mapHash } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, MAX_DUEL_ROUNDS, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { TACTICAL_MODULES } from '../src/renderer/src/sim/tactical/hash';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
function scriptedDuel(seed: number, ticks: number) {
  const d = createSeatedDuel(CUTTER, seed), pair = createScriptedPair(seed);
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
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.values[8] = s.values[8]! + 0.5; }), DIGEST)).toThrow(/hash does not match its values/);   // ships.0.x
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { (s.header as unknown as Record<string, unknown>).extra = 1; }), DIGEST)).toThrow(/header fields/);
    } finally { disposeDuel(d); }
  });
  it('rejects tactical, presence and repair values the module writers would refuse, even rehashed, before allocating', () => {
    const { d } = scriptedDuel(9, 5108);   // a missile in flight, a damaged crew room and a repair in progress (seed 4 tick 5193 before homing torpedoes, SIM_VERSION 46)
    try {
      const good = saveDuelSnapshot(d, DIGEST), names = new Map<string, number>();
      let at = 1;
      for (const m of TACTICAL_MODULES) for (const f of m.fields(d.tactical)) { names.set(f.name, at); at += f.count; }
      const flying = d.tactical.missiles.findIndex((m) => m.active), slot = `missiles.${flying}`, free = `missiles.${1 - flying}`, owner = d.tactical.missiles[flying]!.owner;
      expect(flying, 'one missile in flight at seed 9 tick 5108').toBeGreaterThanOrEqual(0);
      expect(d.tactical.missiles[1 - flying]!.active).toBe(false);
      const cases: [string, number, number, RegExp][] = [
        ['ships.0.heading', 0, 256, /ships\.0\.heading: out of range/], ['ships.1.heading', 0, 1.5, /ships\.1\.heading/],
        ['systems.0.rooms', 1, 3, /systems\.0\.rooms/], ['systems.0.shields', 0, 4, /systems\.0\.shields/], ['systems.1.magazine', 0, 5, /systems\.1\.magazine/],
        ['systems.0.shots', 0, 2.5, /systems\.0\.shots/], ['systems.0.laserCharge', 0, -1, /systems\.0\.laserCharge/], ['systems.1.lock', 0, 3, /systems\.1\.lock/],
        ['systems.0.cls', 0, 2, /systems\.0\.cls/], ['systems.1.target', 0, 2, /systems\.1\.target/], ['systems.0.hull', 0, -1, /systems\.0\.hull/],
        ['ships.0.released', 0, 2, /ships\.0\.released/], ['hunter.mode', 0, 3, /hunter\.mode/], ['hunter.trailHead', 0, 18, /hunter\.trailHead/],
        ['outcome', 0, 4, /outcome: out of range/], ['ships.length', 0, 3, /does not match the slot count/], ['ships.1.active', 0, 2, /ships\.1\.active: out of range/],
        ['ships.1.active', 0, 0, /ships\.1\.x: an inactive slot holds values/],
        [`${slot}.active`, 0, 2, /active is not 0 or 1/], [`${slot}.flight`, 4, 300, /heading, headingAcc or age/], [`${slot}.flight`, 6, -1, /heading, headingAcc or age/],
        [`${slot}.flight`, 5, 1e300, /headingAcc/], [`${slot}.owner`, 0, 5, /owner is not an active ship slot/],
        [`${free}.flight`, 2, 0.25, /a free entry holds values/], [`${free}.owner`, 0, 1, /a free entry holds values/],
        ['ships.0.headingAcc', 0, 1e300, /ships\.0\.headingAcc/], ['ships.1.headingAcc', 0, -1, /ships\.1\.headingAcc/],
        ['ships.1.skidBudget', 0, -0.5, /ships\.1\.skidBudget/], ['ships.0.graceUntil', 0, 2147483648, /ships\.0\.graceUntil/],
        ['systems.0.cls', 0, 1, /duel slot identity/], ['systems.1.cls', 0, 0, /duel slot identity/],
        ['systems.0.target', 0, 0, /duel slot identity/], ['systems.1.target', 0, 1, /duel slot identity/]
      ];
      const created = vi.spyOn(duelState, 'createDuel');
      for (const [name, k, value, error] of cases) {
        const snap = structuredClone(good); snap.values[names.get(name)! + k] = value; snap.header.hash = hashF64(Float64Array.from(snap.values));
        expect(() => validateDuelSnapshot(CUTTER, snap, DIGEST), `${name}[${k}] = ${value}`).toThrow(error);
      }
      const empty = structuredClone(good);   // slot 1 inactive and zeros, no missiles: internally consistent, but not the duel
      for (const m of TACTICAL_MODULES) for (const f of m.fields(d.tactical)) if (/^(ships|systems)\.1\.|^missiles\./.test(f.name)) empty.values.fill(0, names.get(f.name)!, names.get(f.name)! + f.count);
      empty.header.hash = hashF64(Float64Array.from(empty.values));
      expect(() => validateDuelSnapshot(CUTTER, empty, DIGEST)).toThrow(/duel slot identity/);
      const twice = structuredClone(good);   // the free entry claims the flying missile's owner: two missiles for one ship
      twice.values[names.get(`${free}.active`)!] = 1; twice.values[names.get(`${free}.owner`)!] = owner; twice.header.hash = hashF64(Float64Array.from(twice.values));
      expect(() => validateDuelSnapshot(CUTTER, twice, DIGEST)).toThrow(new RegExp(`ship ${owner} has two missiles in flight`));
      const interiorAt = at + 5 + 4 + 1, fieldsAt = interiorAt;   // after presence, repair, the round module (H-2) and the helm module (Artemis-ii)
      for (const [k, value, error] of [[0, 1e6, /interior sim version/], [1, 12345, /interior layout/], [2, 12345, /interior layout/], [5, 1, /crew count/], [9, 3, /crew count/]] as const) {
        const snap = structuredClone(good); snap.values[fieldsAt + k] = value; snap.header.hash = hashF64(Float64Array.from(snap.values));
        expect(() => validateDuelSnapshot(CUTTER, snap, DIGEST), `interior[${k}] = ${value}`).toThrow(error);
      }
      const space = at - 1;
      for (const [k, value] of [[1 + space, 2], [1 + space + 2, 960], [1 + space + 4, -1]] as const) {
        const snap = structuredClone(good); snap.values[k] = value; snap.header.hash = hashF64(Float64Array.from(snap.values));
        expect(() => validateDuelSnapshot(CUTTER, snap, DIGEST)).toThrow(/presence|repair/);
      }
      // The round module (H-2 spec §7): a round index, the Helm player, a base tick no later than the tick, and a
      // decided tick that is −1 exactly while the round runs.
      for (const [k, value, error] of [[0, -1, /round -1/], [0, 0.5, /round 0.5/], [0, MAX_DUEL_ROUNDS + 1, /round 1025 is invalid/], [0, 1, /round 1 is invalid/],
        [1, 2, /helm player/], [2, 5194, /base tick/], [2, -1, /base tick/], [3, 7, /decided tick/]] as const) {
        const snap = structuredClone(good); snap.values[at + 5 + k] = value; snap.header.hash = hashF64(Float64Array.from(snap.values));
        expect(() => validateDuelSnapshot(CUTTER, snap, DIGEST), `round[${k}] = ${value}`).toThrow(error);
      }
      // Round n begins no earlier than tick 2n (a deciding step and a rematch step per round before it).
      for (const [round, base] of [[1, 1], [MAX_DUEL_ROUNDS, 2 * MAX_DUEL_ROUNDS - 1]] as const) {
        const snap = structuredClone(good); snap.values[at + 5] = round; snap.values[at + 5 + 2] = base; snap.header.hash = hashF64(Float64Array.from(snap.values));
        expect(() => validateDuelSnapshot(CUTTER, snap, DIGEST), `round ${round} at base ${base}`).toThrow(new RegExp(`round ${round} is invalid`));
      }
      expect(created).not.toHaveBeenCalled();
      // Positive control: the spy does intercept snapshot.ts's createDuel, so the assertion above can fail.
      disposeDuel(loadDuelSnapshot(CUTTER, good, DIGEST));
      expect(created).toHaveBeenCalledTimes(1);
      created.mockRestore();
      // A decided round (the hunter down on tick 1, then five end-card ticks): its decided tick lies between the base tick and the tick.
      const dd = createSeatedDuel(CUTTER, 7);
      try {
        dd.tactical.systems[1].hull = 0;
        for (let k = 0; k < 6; k++) stepDuelTick(dd, { held: [], commands: [] });
        expect([dd.tactical.outcome, dd.decidedTick, dd.interior.tick]).toEqual([Outcome.CrewWins, 1, 6]);
        const card = saveDuelSnapshot(dd, DIGEST);
        let ra = 1;
        for (const m of TACTICAL_MODULES) for (const f of m.fields(dd.tactical)) ra += f.count;
        ra += 5;   // after presence and repair
        for (const [base, value] of [[0, -1], [1, 0], [0, 7]] as const) {   // −1; base tick − 1; tick + 1
          const snap = structuredClone(card); snap.values[ra + 2] = base; snap.values[ra + 3] = value; snap.header.hash = hashF64(Float64Array.from(snap.values));
          expect(() => validateDuelSnapshot(CUTTER, snap, DIGEST), `decided tick ${value} at base ${base}`).toThrow(/decided tick/);
        }
      } finally { disposeDuel(dd); }
    } finally { disposeDuel(d); }
  });
  it('accepts every state the scripted duels reach (seeds 1, 4 and 7, every 30 ticks)', () => {
    for (const seed of [1, 4, 7]) {
      const d = createSeatedDuel(CUTTER, seed), pair = createScriptedPair(seed);
      try {
        while (d.tactical.outcome === Outcome.Running) {
          stepDuelTick(d, scriptedInput(pair, d));
          if (d.interior.tick % 30 === 0 || d.tactical.outcome !== Outcome.Running) validateDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
        }
      } finally { disposeDuel(d); }
    }
  }, 60_000);
});
