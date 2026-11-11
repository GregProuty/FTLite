import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { saveSnapshot, loadSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { flatten } from '../src/renderer/src/sim/flatten';
import { step } from '../src/renderer/src/sim/step';
import { Position, Seated, Life, LifeState } from '../src/renderer/src/sim/components';
import { sitDown } from '../src/renderer/src/sim/stations';
import { downCrew } from '../src/renderer/src/sim/crew';
import { NEUTRAL_INTENT, type Intent } from '../src/shared/intent';
import { botIntent } from './helpers/bot';
import { StationKind, STATION_COUNT } from '../src/renderer/src/sim/stationKinds';
import { LAYOUT, makeState, intents, run, placeDebris, placeEnemy, placeShot, disableSystem, teleport, seconds, room, overdrive, setSkill, placeBoarder, setMap, seatNavigator } from './helpers/sim';
import { Skill } from '../src/renderer/src/sim/skills';
import { HEAT_MAX, STRESS_PERIOD, SPAWN_FIRST, TICK_HZ, DEBRIS_SLOTS, ENCOUNTER_FIRST, ENEMY_SYS_HP, BOARDER_SLOTS, JUMP_CHARGE_TIME } from '../src/renderer/src/sim/tuning';
import { ObjectKind, shotsInFlight } from '../src/renderer/src/sim/debris';
import { EnemySystem } from '../src/renderer/src/sim/enemy';
import { ENEMY_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { DoorState } from '../src/renderer/src/sim/grid';
import { failStation } from '../src/renderer/src/sim/power';
import { Phase, cycleBudget } from '../src/renderer/src/sim/director';

/** A 2-player state advanced 1500 ticks with the bot, so fires and breaches have spawned and been repaired. */
function advanced(seed: number, players = 2) {
  const s = makeState(players, seed);
  s.director.nextSpawnTick = 0;
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
  it('rejects a version-12 snapshot, by header and by the flattened SIM_VERSION', () => {
    const snap = saveSnapshot(makeState(2));
    expect(() => loadSnapshot(LAYOUT, { ...snap, header: { ...snap.header, simVersion: 12 } })).toThrow(/sim version/);
    const values = [...snap.values]; values[0] = 12;
    expect(() => loadSnapshot(LAYOUT, { ...snap, values })).toThrow(/sim version/);
  });
  it('round-trips skills and stamps; xp and each stamp alone change the hash', () => {
    const s = makeState(2, 5);
    setSkill(s, 0, Skill.Science, 3); setSkill(s, 1, Skill.Repair, 7); s.skills.xp[Skill.Combat] = 12.5;
    s.skills.lastEngChangeTick = 40; s.skills.lastDoorToggleTick = 41; s.skills.lsDeliveredTick = 45; s.skills.lastShotTick = 46;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(hashState(t)).toBe(hashState(s));
    expect(Array.from(t.skills.xp)).toEqual(Array.from(s.skills.xp));
    expect([t.skills.lastEngChangeTick, t.skills.lastDoorToggleTick, t.skills.lsDeliveredTick, t.skills.lastShotTick]).toEqual([40, 41, 45, 46]);
    const base = hashState(makeState(2, 5));
    const mutate = (f: (u: ReturnType<typeof makeState>) => void) => { const u = makeState(2, 5); f(u); return hashState(u); };
    expect(mutate((u) => { u.skills.xp[3] = 1; })).not.toBe(base);
    expect(mutate((u) => { u.skills.lastEngChangeTick = 1; })).not.toBe(base);
    expect(mutate((u) => { u.skills.lastDoorToggleTick = 1; })).not.toBe(base);
    expect(mutate((u) => { u.skills.lsDeliveredTick = 1; })).not.toBe(base);
    expect(mutate((u) => { u.skills.lastShotTick = 1; })).not.toBe(base);
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
      s.director.nextSpawnTick = 1e9;
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
    const mk = () => { const s = makeState(1, 9); s.director.nextSpawnTick = 1e9; const d = overdrive(s, StationKind.Doors); s.stations.coolant[d] = 1; return s; };
    const whole = mk(); run(whole, 1260);
    expect(whole.stations.failed[whole.derived.stationOfKind[StationKind.Doors]!]).toBe(1);      // net +1 per hazard tick: the overheat lands on tick 1195
    const first = mk(); run(first, 1185);
    expect(first.stations.heat[first.derived.stationOfKind[StationKind.Doors]!]).toBe(HEAT_MAX - 3);
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(first))));
    run(resumed, 75);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
  it('a scan in progress saved mid-scan and continued hashes equal to the uninterrupted run', () => {
    const mk = () => { const s = makeState(1, 9); s.director.nextSpawnTick = 1e9; const sci = s.derived.stationOfKind[StationKind.Science]!; placeDebris(s, room(s, 'A'), 1e6, 1, undefined, 2); sitDown(s, 0, sci); s.science.scanning = 1; return s; };
    const whole = mk(); run(whole, 1200);
    expect(whole.debris.scanned[0]).toBe(1);                                     // 16 s scan at level 1 is done by 20 s
    const first = mk(); run(first, 500);
    expect(first.debris.scan[0]).toBeGreaterThan(0); expect(first.debris.scan[0]).toBeLessThan(1);
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(first))));
    run(resumed, 700);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
  it('a run saved inside an active Engineering productivity window continues like an uninterrupted run through the window expiry', () => {
    const mk = () => { const s = makeState(1, 9); s.director.nextSpawnTick = 1e9; sitDown(s, 0, s.derived.stationOfKind[StationKind.Engineering]!); return s; };
    const script = (t: number) => t === 50 ? intents({ moveY: 1 }) : t === 52 ? intents({ moveX: 1 }) : intents();   // cursor to Life Support, then a bar move at tick 52
    const whole = mk(); for (let t = 0; t < 600; t++) step(whole, script(t));
    expect(whole.skills.lastEngChangeTick).toBe(52); expect(whole.skills.xp[1]).toBeGreaterThan(0);                 // Engineering XP accrued inside the window
    const first = mk(); for (let t = 0; t < 200; t++) step(first, script(t));
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(first))));
    for (let t = 200; t < 600; t++) step(resumed, script(t));
    expect(hashState(resumed)).toBe(hashState(whole));
  });
  it('a fresh director has the initial values; all fifteen director fields round-trip and each alone changes the hash', () => {
    const f = makeState(2).director;
    expect([f.phase, f.phaseTick, f.stress, f.nextStressTick, f.nextSpawnTick, f.budgetLeft, f.lastSpawnTick, f.lastType]).toEqual([Phase.BuildUp, 0, 0, STRESS_PERIOD * TICK_HZ, SPAWN_FIRST * TICK_HZ, cycleBudget(0, 2), -1, -1]);
    expect(Array.from(f.sinceProductive)).toEqual(new Array(STATION_COUNT).fill(0));
    const s = makeState(2, 5), d = s.director;
    d.phase = Phase.Relax; d.phaseTick = 1234; d.stress = 0.37; d.nextStressTick = 1500; d.nextSpawnTick = 2222; d.budgetLeft = 4; d.lastSpawnTick = 1200; d.lastType = 2;
    for (let k = 0; k < STATION_COUNT; k++) d.sinceProductive[k] = 100 + k;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s)))).director;
    expect([t.phase, t.phaseTick, t.stress, t.nextStressTick, t.nextSpawnTick, t.budgetLeft, t.lastSpawnTick, t.lastType]).toEqual([Phase.Relax, 1234, 0.37, 1500, 2222, 4, 1200, 2]);
    expect(Array.from(t.sinceProductive)).toEqual(Array.from(d.sinceProductive));
    const base = hashState(makeState(2, 5));
    const mutate = (f2: (u: ReturnType<typeof makeState>) => void) => { const u = makeState(2, 5); f2(u); return hashState(u); };
    expect(mutate((u) => { u.director.phase = 1; })).not.toBe(base); expect(mutate((u) => { u.director.phaseTick = 1; })).not.toBe(base);
    expect(mutate((u) => { u.director.stress = 0.1; })).not.toBe(base); expect(mutate((u) => { u.director.nextStressTick = 1; })).not.toBe(base);
    expect(mutate((u) => { u.director.nextSpawnTick = 1; })).not.toBe(base); expect(mutate((u) => { u.director.budgetLeft = 1; })).not.toBe(base);
    expect(mutate((u) => { u.director.lastSpawnTick = 1; })).not.toBe(base); expect(mutate((u) => { u.director.lastType = 1; })).not.toBe(base);
    for (let k = 0; k < STATION_COUNT; k++) expect(mutate((u) => { u.director.sinceProductive[k] = 1; })).not.toBe(base);
  });
  it('a run saved mid Build Up continues like an uninterrupted run through at least two phase changes', () => {
    const transitions = (s: ReturnType<typeof makeState>, ticks: number) => { let n = 0, last = s.director.phase; for (let t = 0; t < ticks; t++) { step(s, [NEUTRAL_INTENT, NEUTRAL_INTENT]); if (s.director.phase !== last) { n++; last = s.director.phase; } } return n; };
    const whole = makeState(2, 21); transitions(whole, 6000);
    const first = makeState(2, 21); transitions(first, 1500);
    expect(first.director.phase).toBe(Phase.BuildUp);
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(first))));
    expect(transitions(resumed, 4500)).toBeGreaterThanOrEqual(2);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
  it('every telemetry field round-trips and each alone changes the hash', () => {
    const s = makeState(2, 5), t = s.telemetry;
    t.firstDownTick = 11; t.firstDownPid = 1; t.firstDeathTick = 22; t.firstDeathPid = 0; t.impacts = 3; t.evadeRolls = 4; t.evasions = 2; t.shots = 9; t.hits = 5; t.maxStress = 0.61;
    for (let k = 0; k < STATION_COUNT; k++) t.mannedTicks[k] = 100 + k;
    t.idleRun[0] = 7; t.idleRun[1] = 8; t.longestIdle[0] = 70; t.longestIdle[1] = 80; t.prevLife[0] = 1; t.prevLife[1] = 2;
    t.spawns.set([1, 2, 3, 4]); t.repairs.set([5, 6, 7]); t.phaseEntries.set([3, 2, 2, 1]);
    const u = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s)))).telemetry;
    expect([u.firstDownTick, u.firstDownPid, u.firstDeathTick, u.firstDeathPid, u.impacts, u.evadeRolls, u.evasions, u.shots, u.hits, u.maxStress]).toEqual([11, 1, 22, 0, 3, 4, 2, 9, 5, 0.61]);
    for (const k of ['mannedTicks', 'idleRun', 'longestIdle', 'prevLife', 'spawns', 'repairs', 'phaseEntries'] as const) expect(Array.from(u[k])).toEqual(Array.from(t[k]));
    const base = hashState(makeState(2, 5));
    const mutate = (f: (x: ReturnType<typeof makeState>['telemetry']) => void) => { const x = makeState(2, 5); f(x.telemetry); return hashState(x); };
    expect(mutate((x) => { x.firstDownTick = 1; })).not.toBe(base); expect(mutate((x) => { x.firstDownPid = 1; })).not.toBe(base);
    expect(mutate((x) => { x.firstDeathTick = 1; })).not.toBe(base); expect(mutate((x) => { x.firstDeathPid = 1; })).not.toBe(base);
    expect(mutate((x) => { x.impacts = 1; })).not.toBe(base); expect(mutate((x) => { x.evadeRolls = 1; })).not.toBe(base);
    expect(mutate((x) => { x.evasions = 1; })).not.toBe(base); expect(mutate((x) => { x.shots = 1; })).not.toBe(base);
    expect(mutate((x) => { x.hits = 1; })).not.toBe(base); expect(mutate((x) => { x.maxStress = 0.5; })).not.toBe(base);
    for (let k = 0; k < STATION_COUNT; k++) expect(mutate((x) => { x.mannedTicks[k] = 1; })).not.toBe(base);
    for (let p = 0; p < 2; p++) { expect(mutate((x) => { x.idleRun[p] = 1; })).not.toBe(base); expect(mutate((x) => { x.longestIdle[p] = 1; })).not.toBe(base); expect(mutate((x) => { x.prevLife[p] = 1; })).not.toBe(base); }
    for (let k = 0; k < 4; k++) expect(mutate((x) => { x.spawns[k] = 1; })).not.toBe(base);
    for (let k = 0; k < 3; k++) expect(mutate((x) => { x.repairs[k] = 1; })).not.toBe(base);
    for (let k = 0; k < 4; k++) expect(mutate((x) => { x.phaseEntries[k] = 7; })).not.toBe(base);
  });
  it('a run saved with an idle streak in progress and a Downed crew member continues through a new longest streak and the bleed-out like an uninterrupted run', () => {
    const script = (s: ReturnType<typeof makeState>, ticks: number) => { for (let i = 0; i < ticks; i++) step(s, [NEUTRAL_INTENT, NEUTRAL_INTENT]); };
    const whole = makeState(2, 31); whole.director.nextSpawnTick = 1e9;
    const part = makeState(2, 31); part.director.nextSpawnTick = 1e9;
    for (const s of [whole, part]) { script(s, 100); downCrew(s, 1); script(s, 50); }
    expect(part.telemetry.idleRun[0]).toBeGreaterThan(0); expect(Life.state[part.crew[1]!]).toBe(LifeState.Downed); expect(part.telemetry.firstDeathTick).toBe(-1);
    const savedLongest = part.telemetry.longestIdle[0]!;
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(part))));
    script(whole, 2400); script(resumed, 2400);                      // 40 s: past the 30 s bleed-out
    expect(resumed.telemetry.longestIdle[0]).toBeGreaterThan(savedLongest); expect(resumed.telemetry.firstDeathTick).toBeGreaterThan(150); expect(resumed.telemetry.firstDeathPid).toBe(1);
    const fields = (s: ReturnType<typeof makeState>) => JSON.stringify(s.telemetry, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Int32Array) : v));
    expect(fields(resumed)).toBe(fields(whole));
    expect(hashState(resumed)).toBe(hashState(whole));
  });

  it('round-trips the enemy block, debris kinds and the encounter counters; each alone changes the hash; a fresh state has the initial values', () => {
    const f = makeState(2).enemy;
    expect([f.present, f.hull, f.stableId, f.nextArrivalTick, f.nextShotTick, f.departTick]).toEqual([0, 0, 0, ENCOUNTER_FIRST * TICK_HZ, -1, -1]);
    const s = makeState(2, 5); s.enemy.present = 1; s.enemy.hull = 37; s.enemy.stableId = 41; s.enemy.nextArrivalTick = 9000; s.enemy.nextShotTick = 1234; s.enemy.departTick = 5678;
    s.enemy.sysHp.set([7, 11, 19]); s.enemy.sysRepairTick.set([111, 222, 333]); s.enemy.shieldFreq = 3; s.enemy.scanned = 1; s.enemy.scan = 0.45; s.telemetry.enemyDisables = 4;
    s.debris.kind[2] = 1; s.debris.kind[5] = 1; s.telemetry.encounters = 3; s.telemetry.enemiesDestroyed = 2;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect([t.enemy.present, t.enemy.hull, t.enemy.stableId, t.enemy.nextArrivalTick, t.enemy.nextShotTick, t.enemy.departTick]).toEqual([1, 37, 41, 9000, 1234, 5678]);
    expect(Array.from(t.enemy.sysHp)).toEqual([7, 11, 19]); expect(Array.from(t.enemy.sysRepairTick)).toEqual([111, 222, 333]); expect([t.enemy.shieldFreq, t.enemy.scanned, t.enemy.scan, t.telemetry.enemyDisables]).toEqual([3, 1, 0.45, 4]);
    expect(Array.from(t.debris.kind)).toEqual(Array.from(s.debris.kind)); expect([t.telemetry.encounters, t.telemetry.enemiesDestroyed]).toEqual([3, 2]);
    const base = hashState(makeState(2, 5));
    const mutate = (fn: (u: ReturnType<typeof makeState>) => void) => { const u = makeState(2, 5); fn(u); return hashState(u); };
    expect(mutate((u) => { u.enemy.present = 1; })).not.toBe(base); expect(mutate((u) => { u.enemy.hull = 1; })).not.toBe(base); expect(mutate((u) => { u.enemy.stableId = 1; })).not.toBe(base);
    expect(mutate((u) => { u.enemy.nextArrivalTick = 1; })).not.toBe(base); expect(mutate((u) => { u.enemy.nextShotTick = 1; })).not.toBe(base); expect(mutate((u) => { u.enemy.departTick = 1; })).not.toBe(base);
    for (let k = 0; k < DEBRIS_SLOTS; k++) expect(mutate((u) => { u.debris.kind[k] = 1; })).not.toBe(base);
    for (let k = 0; k < 3; k++) { expect(mutate((u) => { u.enemy.sysHp[k] = 1; })).not.toBe(base); expect(mutate((u) => { u.enemy.sysRepairTick[k] = 1; })).not.toBe(base); }
    expect(mutate((u) => { u.enemy.shieldFreq = 1; })).not.toBe(base); expect(mutate((u) => { u.enemy.scanned = 1; })).not.toBe(base); expect(mutate((u) => { u.enemy.scan = 0.5; })).not.toBe(base); expect(mutate((u) => { u.telemetry.enemyDisables = 1; })).not.toBe(base);
    expect(mutate((u) => { u.telemetry.encounters = 1; })).not.toBe(base); expect(mutate((u) => { u.telemetry.enemiesDestroyed = 1; })).not.toBe(base);
  });
  it('a run saved mid-encounter with a shot due in 10 ticks and the withdrawal in 20 continues like the uninterrupted run through both', () => {
    const whole = makeState(2, 31); whole.director.nextSpawnTick = 1e9;
    const part = makeState(2, 31); part.director.nextSpawnTick = 1e9;
    for (const s of [whole, part]) { run(s, 100); placeEnemy(s); s.enemy.departTick = s.tick + 20; s.enemy.nextShotTick = 1e9; placeShot(s, room(s, 'A'), 10); }
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(part))));
    run(whole, 30); run(resumed, 30);
    expect(resumed.telemetry.impacts).toBe(1); expect(resumed.rooms.impactTick[room(resumed, 'A')]).toBe(110);
    expect(resumed.enemy.present).toBe(0); expect(resumed.enemy.nextArrivalTick).toBeGreaterThan(resumed.tick);
    expect([resumed.enemy.present, resumed.enemy.hull, resumed.enemy.stableId, resumed.enemy.nextArrivalTick, resumed.enemy.nextShotTick, resumed.enemy.departTick]).toEqual([whole.enemy.present, whole.enemy.hull, whole.enemy.stableId, whole.enemy.nextArrivalTick, whole.enemy.nextShotTick, whole.enemy.departTick]);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
  it('a run saved with the enemy weapons down, a repair due in 10 ticks and an enemy scan running continues like the uninterrupted run through the repair and the repaired first shot', () => {
    const setup = (s: ReturnType<typeof makeState>) => { run(s, 100); placeEnemy(s); disableSystem(s, EnemySystem.Weapons); s.enemy.sysRepairTick[EnemySystem.Weapons] = s.tick + 10; s.enemy.nextShotTick = s.tick + 15; const c = s.derived.stationOfKind[StationKind.Science]!; sitDown(s, 1, c); s.stations.cursor[c] = ENEMY_SLOT; s.science.scanning = 1; };
    const whole = makeState(2, 31); whole.director.nextSpawnTick = 1e9; setup(whole);
    const part = makeState(2, 31); part.director.nextSpawnTick = 1e9; setup(part);
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(part))));
    run(whole, 40); run(resumed, 40);
    // The repair at tick 110 set nextShotTick to 110 + 300 = 410, replacing the 115 deadline: no shot yet.
    expect(resumed.enemy.sysHp[EnemySystem.Weapons]).toBe(ENEMY_SYS_HP); expect(resumed.enemy.sysRepairTick[EnemySystem.Weapons]).toBe(-1); expect(resumed.enemy.nextShotTick).toBe(410); expect(shotsInFlight(resumed)).toBe(0);
    expect(resumed.enemy.scan).toBeGreaterThan(0);                                      // the enemy scan runs
    run(whole, 280); run(resumed, 280);                                                 // through tick 420: the repaired weapons fire at 410
    expect(shotsInFlight(resumed)).toBe(1);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
  it('a run saved with the engines down and the departure clock already pushed continues like the uninterrupted run through the repair, the clock stopping at the push of 20 more', () => {
    const setup = (s: ReturnType<typeof makeState>) => { run(s, 0); placeEnemy(s); disableSystem(s, EnemySystem.Engines); s.enemy.sysRepairTick[EnemySystem.Engines] = s.tick + 120; s.enemy.nextShotTick = 1e9; run(s, 100); };
    const whole = makeState(2, 31); whole.director.nextSpawnTick = 1e9; setup(whole);
    const part = makeState(2, 31); part.director.nextSpawnTick = 1e9; setup(part);
    const pushed = part.enemy.departTick;
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(part))));
    expect(resumed.enemy.departTick).toBe(pushed);
    run(whole, 50); run(resumed, 50);
    expect(resumed.enemy.departTick).toBe(pushed + 20); expect(resumed.enemy.sysHp[EnemySystem.Engines]).toBe(ENEMY_SYS_HP);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
  it('round-trips the boarders block and counters (incl. an aloneSince of -2); each field alone changes the hash', () => {
    const s = makeState(2, 5), b = s.boarders;
    b.active.set([1, 0, 1, 0]); b.stableId.set([41, 0, 43, 0]); b.room.set([3, 0, 6, 0]); b.health.set([12.5, 0, 60, 0]); b.nextMoveTick.set([900, 0, 1200, 0]); b.aloneSince.set([-2, -1, 777, -1]); b.nextArrivalTick = 9999;
    s.telemetry.boardings = 2; s.telemetry.boardersKilled = 3;
    const loaded = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s)))), t = loaded.boarders;
    for (const k of ['active', 'stableId', 'room', 'health', 'nextMoveTick', 'aloneSince'] as const) expect(Array.from(t[k])).toEqual(Array.from(b[k]));
    expect(t.nextArrivalTick).toBe(9999); expect([loaded.telemetry.boardings, loaded.telemetry.boardersKilled]).toEqual([2, 3]);
    const base = hashState(makeState(2, 5));
    const mutate = (f: (u: ReturnType<typeof makeState>) => void) => { const u = makeState(2, 5); f(u); return hashState(u); };
    expect(mutate((u) => { u.boarders.nextArrivalTick = 1; })).not.toBe(base);
    for (let k = 0; k < BOARDER_SLOTS; k++) for (const key of ['active', 'stableId', 'room', 'health', 'nextMoveTick'] as const) expect(mutate((u) => { u.boarders[key][k] = 1; })).not.toBe(base);
    for (let k = 0; k < BOARDER_SLOTS; k++) expect(mutate((u) => { u.boarders.aloneSince[k] = -2; })).not.toBe(base);
    expect(mutate((u) => { u.telemetry.boardings = 1; })).not.toBe(base); expect(mutate((u) => { u.telemetry.boardersKilled = 1; })).not.toBe(base);
  });
  it('a run saved mid-fight (after 60 ticks of melee) continues to the kill and the cooldown re-arm like the uninterrupted run', () => {
    const drive = (s: ReturnType<typeof makeState>, n: number) => { for (let i = 0; i < n; i++) step(s, [botIntent(s, 0), botIntent(s, 1)]); };
    const setup = (s: ReturnType<typeof makeState>) => { s.director.nextSpawnTick = 1e9; s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; run(s, 100); teleport(s, 0, 2.5, 9.5); teleport(s, 1, 3.5, 9.5); placeBoarder(s, room(s, 'G'), 30); drive(s, 60); };
    const whole = makeState(2, 31); setup(whole); const part = makeState(2, 31); setup(part);
    expect(part.boarders.health[0]).toBeLessThan(30); expect(part.boarders.active[0]).toBe(1);        // saved mid-fight
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(part))));
    drive(whole, 300); drive(resumed, 300);
    expect(resumed.telemetry.boardersKilled).toBe(1); expect(resumed.boarders.nextArrivalTick).not.toBe(1e9);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
  it('a sabotaged visit (-2) saved mid-containment does not sabotage again after loading', () => {
    const setup = (s: ReturnType<typeof makeState>) => { s.director.nextSpawnTick = 1e9; s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; teleport(s, 0, 2.5, 9.5); teleport(s, 1, 3.5, 9.5); s.doors.state[0] = DoorState.Sealed; const k = placeBoarder(s, room(s, 'A')); s.boarders.aloneSince[k] = -2; failStation(s, 0); };
    const whole = makeState(2, 32); setup(whole); const part = makeState(2, 32); setup(part);
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(part))));
    expect(resumed.boarders.aloneSince[0]).toBe(-2);
    run(whole, 20 * TICK_HZ); run(resumed, 20 * TICK_HZ);
    expect(resumed.stations.failed[1]).toBe(0); expect(resumed.boarders.aloneSince[0]).toBe(-2);     // Doors stays online: the visit already sabotaged
    expect(hashState(resumed)).toBe(hashState(whole));
  });
  it('round-trips the run block, the map stream and telemetry.jumps; each alone changes the hash', () => {
    const s = makeState(2, 5); s.run.column = 3; s.run.node = 2; s.run.nodesReached = 3; s.run.jumpCharge = 0.42; s.run.colNodes.set([1, 3, 2, 3, 2, 2, 3, 1]); s.run.edgeMask[4] = 5; s.telemetry.jumps = 3; s.rng.map.s = 123456;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect([t.run.column, t.run.node, t.run.nodesReached, t.run.jumpCharge, t.telemetry.jumps, t.rng.map.s]).toEqual([3, 2, 3, 0.42, 3, 123456]);
    expect(Array.from(t.run.colNodes)).toEqual(Array.from(s.run.colNodes)); expect(Array.from(t.run.edgeMask)).toEqual(Array.from(s.run.edgeMask));
    expect(saveSnapshot(s).header.rngStates['map']).toBe(123456);
    const base = hashState(makeState(2, 5));
    const mutate = (f: (u: ReturnType<typeof makeState>) => void) => { const u = makeState(2, 5); f(u); return hashState(u); };
    for (const k of ['column', 'node', 'nodesReached', 'jumpCharge'] as const) expect(mutate((u) => { u.run[k] = 0.5; })).not.toBe(base);
    expect(mutate((u) => { u.run.colNodes[1] = 1; })).not.toBe(base); expect(mutate((u) => { u.run.edgeMask[0] = u.run.edgeMask[0]! ^ 1; })).not.toBe(base);
    expect(mutate((u) => { u.telemetry.jumps = 1; })).not.toBe(base); expect(mutate((u) => { u.rng.map.s = 1; })).not.toBe(base);
  });
  it('a run saved mid-charge with the cursor on the second destination continues to the same jump as the uninterrupted run', () => {
    const setup = (s: ReturnType<typeof makeState>) => { s.director.nextSpawnTick = 1e9; s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; setMap(s, [1, 2, 2, 2, 2, 2, 2, 1], { '0:0': 0b11, '1:0': 1, '1:1': 1, '2:0': 1, '2:1': 1, '3:0': 1, '3:1': 1, '4:0': 1, '4:1': 1, '5:0': 1, '5:1': 1, '6:0': 1, '6:1': 1 }); const n = seatNavigator(s, 0); run(s, 1); s.stations.cursor[n] = 1; s.run.jumpCharge = 0.9; return n; };
    const whole = makeState(2, 31), part = makeState(2, 31); const n = setup(whole); setup(part);
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(part))));
    expect(resumed.stations.cursor[n]).toBe(1); expect(resumed.run.jumpCharge).toBe(0.9);
    const drive = (s: ReturnType<typeof makeState>) => run(s, 0.1 * JUMP_CHARGE_TIME * TICK_HZ + 600, () => intents({ confirmPressed: true }, {}));
    drive(whole); drive(resumed);
    expect([resumed.run.column, resumed.run.node, resumed.run.nodesReached]).toEqual([1, 1, 1]);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
});
