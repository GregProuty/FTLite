import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { saveSnapshot, loadSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { flatten } from '../src/renderer/src/sim/flatten';
import { step } from '../src/renderer/src/sim/step';
import { Position, Seated } from '../src/renderer/src/sim/components';
import { sitDown } from '../src/renderer/src/sim/stations';
import { NEUTRAL_INTENT, type Intent } from '../src/shared/intent';
import { botIntent } from './helpers/bot';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { LAYOUT, makeState, intents, run, placeDebris, teleport, seconds, room, overdrive } from './helpers/sim';
import { HEAT_MAX } from '../src/renderer/src/sim/tuning';

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
  it('rejects a version-4 snapshot, by header and by the flattened SIM_VERSION', () => {
    const snap = saveSnapshot(makeState(2));
    expect(() => loadSnapshot(LAYOUT, { ...snap, header: { ...snap.header, simVersion: 4 } })).toThrow(/sim version/);
    const values = [...snap.values]; values[0] = 4;
    expect(() => loadSnapshot(LAYOUT, { ...snap, values })).toThrow(/sim version/);
  });
  it('round-trips frequency, scan state, the weapon selector, torpedo state and scanning; each new field alone changes the hash', () => {
    const s = makeState(2, 5);
    placeDebris(s, 3, 900, 1, undefined, 3); s.debris.scanned[0] = 1; s.debris.scan[0] = 1; placeDebris(s, 4, 1200, 1, undefined, 2); s.debris.scan[1] = 0.4;
    s.weapons.selector = 3; s.weapons.torpedoStock = 5; s.weapons.torpedoLoaded = 1; s.weapons.torpedoLoad = 0.25; s.weapons.torpedoRegen = 0.5; s.science.scanning = 1;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(hashState(t)).toBe(hashState(s));
    expect(Array.from(t.debris.frequency)).toEqual(Array.from(s.debris.frequency));
    expect(Array.from(t.debris.scanned)).toEqual(Array.from(s.debris.scanned));
    expect(Array.from(t.debris.scan)).toEqual(Array.from(s.debris.scan));
    expect(t.weapons).toEqual(s.weapons); expect(t.science).toEqual(s.science);
    const base = hashState(makeState(2, 5));
    const mutate = (f: (u: ReturnType<typeof makeState>) => void) => { const u = makeState(2, 5); f(u); return hashState(u); };
    expect(mutate((u) => { u.debris.frequency[2] = 1; })).not.toBe(base);
    expect(mutate((u) => { u.debris.scanned[2] = 1; })).not.toBe(base);
    expect(mutate((u) => { u.debris.scan[2] = 0.5; })).not.toBe(base);
    expect(mutate((u) => { u.weapons.selector = 1; })).not.toBe(base);
    expect(mutate((u) => { u.weapons.torpedoStock = 2; })).not.toBe(base);
    expect(mutate((u) => { u.weapons.torpedoLoaded = 1; })).not.toBe(base);
    expect(mutate((u) => { u.weapons.torpedoLoad = 0.5; })).not.toBe(base);
    expect(mutate((u) => { u.weapons.torpedoRegen = 0.5; })).not.toBe(base);
    expect(mutate((u) => { u.science.scanning = 1; })).not.toBe(base);
  });
  it('weapons charge and fire script is deterministic and survives a mid-charge save/load', () => {
    const mk = () => {
      const s = makeState(1, 9);
      const w = s.derived.stationOfKind[StationKind.Weapons]!, tile = s.derived.stationTile[w]!, width = s.derived.width;
      teleport(s, 0, (tile % width) + 0.5, Math.floor(tile / width) + 0.5);
      s.spawner.nextSpawnTick = 1e9;
      placeDebris(s, room(s, 'A'), 1e6, 1);
      return s;
    };
    const fireAt = seconds(12) + 3;
    const total = fireAt + 12;
    const script = (t: number) => t === 0 || t === fireAt ? intents({ confirmPressed: true }) : t === fireAt + 1 ? intents({ cancelPressed: true }) : intents();
    const a = mk(), b = mk();
    const initial = a.rng.combat.s;
    for (let t = 0; t < total; t++) { step(a, script(t)); step(b, script(t)); }
    expect(hashState(a)).toBe(hashState(b));
    expect(a.rng.combat.s).not.toBe(initial);
    const c = mk();
    for (let t = 0; t < 300; t++) step(c, script(t));
    const d = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(c))));
    for (let t = 300; t < total; t++) step(d, script(t));
    expect(hashState(d)).toBe(hashState(a));
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
  it('round-trips seating, power and stick state', () => {
    const s = makeState(2, 5);
    const eng = s.derived.stationOfKind[3]!;
    sitDown(s, 0, eng); s.stations.cursor[eng] = 5; s.stations.failed[1] = 1; s.stations.repair[1] = 0.25; s.stations.level[2] = 0; s.stick.heldDir[0] = 2; s.stick.repeat[0] = 3;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(hashState(t)).toBe(hashState(s));
    expect(Seated.station[t.crew[0]!]).toBe(eng); expect(t.stations.occupant[eng]).toBe(0); expect(t.stations.cursor[eng]).toBe(5);
    expect(t.stations.failed[1]).toBe(1); expect(t.stations.repair[1]).toBe(0.25); expect(t.stick.heldDir[0]).toBe(2); expect(t.stick.repeat[0]).toBe(3);
  });
  it('round-trips debris, weapons charge and room impact ticks', () => {
    const s = makeState(2, 5);
    placeDebris(s, 3, 900, 1); placeDebris(s, 4, 1200, 0);
    s.weapons.charge = 0.4; s.rooms.impactTick[3] = 77;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(hashState(t)).toBe(hashState(s));
    expect(Array.from(t.debris.active)).toEqual(Array.from(s.debris.active));
    expect(Array.from(t.debris.stableId)).toEqual(Array.from(s.debris.stableId));
    expect(Array.from(t.debris.impactTick)).toEqual(Array.from(s.debris.impactTick));
    expect(Array.from(t.debris.warned)).toEqual(Array.from(s.debris.warned));
    expect(t.weapons.charge).toBe(0.4); expect(t.rooms.impactTick[3]).toBe(77);
  });
  it('round-trips station heat and coolant', () => {
    const s = makeState(2, 5);
    s.stations.heat[1] = 137; s.stations.coolant[1] = 2; s.stations.coolant[4] = 1;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(hashState(t)).toBe(hashState(s));
    expect(Array.from(t.stations.heat)).toEqual(Array.from(s.stations.heat));
    expect(Array.from(t.stations.coolant)).toEqual(Array.from(s.stations.coolant));
    const base = hashState(makeState(2, 5));
    const h = makeState(2, 5); h.stations.heat[2] = 1; expect(hashState(h)).not.toBe(base);          // heat alone changes the hash
    const c = makeState(2, 5); c.stations.coolant[2] = 1; expect(hashState(c)).not.toBe(base);       // coolant alone changes the hash
  });
  it('an overdrive with one unit saved ten ticks before its overheat continues through the failure and fire roll like an uninterrupted run', () => {
    const mk = () => { const s = makeState(1, 9); s.spawner.nextSpawnTick = 1e9; const d = overdrive(s, StationKind.Doors); s.stations.coolant[d] = 1; return s; };
    const whole = mk(); run(whole, 1260);
    expect(whole.stations.failed[whole.derived.stationOfKind[StationKind.Doors]!]).toBe(1);      // net +1 per hazard tick: the overheat lands on tick 1195
    const first = mk(); run(first, 1185);
    expect(first.stations.heat[first.derived.stationOfKind[StationKind.Doors]!]).toBe(HEAT_MAX - 3);
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(first))));
    run(resumed, 75);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
  it('a scan in progress saved mid-scan and continued hashes equal to the uninterrupted run', () => {
    const mk = () => { const s = makeState(1, 9); s.spawner.nextSpawnTick = 1e9; const sci = s.derived.stationOfKind[StationKind.Science]!; placeDebris(s, room(s, 'A'), 1e6, 1, undefined, 2); sitDown(s, 0, sci); s.science.scanning = 1; return s; };
    const whole = mk(); run(whole, 1200);
    expect(whole.debris.scanned[0]).toBe(1);                                     // 16 s scan at level 1 is done by 20 s
    const first = mk(); run(first, 500);
    expect(first.debris.scan[0]).toBeGreaterThan(0); expect(first.debris.scan[0]).toBeLessThan(1);
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(first))));
    run(resumed, 700);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
});
