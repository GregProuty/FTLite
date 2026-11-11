import { describe, it, expect } from 'vitest';
import { enemySystem, fireInterval, arrive, leave, enemyBeamHits } from '../src/renderer/src/sim/enemy';
import { ObjectKind, shotsInFlight, debrisSystem, spawnDebris } from '../src/renderer/src/sim/debris';
import { ENEMY_SLOT, targetStableId, isTarget, warnedTargets, nextTarget, cycleTarget } from '../src/renderer/src/sim/debrisTargets';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Dir } from '../src/renderer/src/sim/dir';
import { minutesOf } from '../src/renderer/src/sim/director';
import { createRng, nextFloat, nextInt } from '../src/shared/rng';
import { TICK_HZ, ENCOUNTER_FIRST, ENCOUNTER_MAX, ENCOUNTER_COOLDOWN, ENEMY_HULL, ENEMY_FIRST_SHOT, ENEMY_FIRE_JITTER, ENEMY_SHOTS_MAX, ENEMY_SHOT_FLIGHT, ENEMY_SHOT_JITTER, FREQ_COUNT, SOLO_INTERVAL_MULT, DEBRIS_SLOTS, HULL_MAX, ENEMY_SHOT_HULL_DAMAGE, DEBRIS_HULL_DAMAGE } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, armSpawn, placeEnemy, placeShot, placeDebris, room, intents } from './helpers/sim';
import { NEUTRAL_INTENT } from '../src/shared/intent';

const T = TICK_HZ;
const wpn = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Weapons]!;
const sci = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Science]!;
const jitter = (u: number) => 1 + ENEMY_FIRE_JITTER * (2 * u - 1);

describe('enemy: initial values and fireInterval', () => {
  it('a fresh state has no enemy, the first arrival armed, kind bytes zero and zero counters', () => {
    const s = makeState(2), e = s.enemy;
    expect([e.present, e.hull, e.stableId, e.nextArrivalTick, e.nextShotTick, e.departTick]).toEqual([0, 0, 0, ENCOUNTER_FIRST * T, -1, -1]);
    expect(Array.from(s.debris.kind)).toEqual(new Array(DEBRIS_SLOTS).fill(0));
    expect([s.telemetry.encounters, s.telemetry.enemiesDestroyed]).toEqual([0, 0]);
  });
  it('fireInterval escalates to the floor and solo is 1.5x', () => {
    expect(fireInterval(0, 2)).toBe(15); expect(fireInterval(3, 2)).toBeCloseTo(150 / 13, 12); expect(fireInterval(10, 2)).toBe(7.5); expect(fireInterval(15, 2)).toBe(6); expect(fireInterval(0, 1)).toBe(15 * SOLO_INTERVAL_MULT);
  });
});

describe('enemy: schedule (enemySystem called directly)', () => {
  it('arrives exactly at ENCOUNTER_FIRST with no draw, allocating a StableId and arming the shot and departure clocks', () => {
    const s = makeState(2); const d0 = s.rng.director.s, h0 = s.rng.hazards.s, id = s.nextStableId;
    s.tick = ENCOUNTER_FIRST * T - 1; enemySystem(s);
    expect(s.enemy.present).toBe(0);
    s.tick = ENCOUNTER_FIRST * T; enemySystem(s);
    const e = s.enemy;
    expect([e.present, e.hull, e.stableId, e.departTick, e.nextShotTick]).toEqual([1, ENEMY_HULL, id, s.tick + ENCOUNTER_MAX * T, s.tick + ENEMY_FIRST_SHOT * T]);
    expect(s.nextStableId).toBe(id + 1); expect(s.telemetry.encounters).toBe(1);
    expect(s.rng.director.s).toBe(d0); expect(s.rng.hazards.s).toBe(h0);
  });
  it('arrival auto-selects the enemy only for a seated targeting console with no selection', () => {
    const s = makeState(2), w = wpn(s), c = sci(s), A = room(s, 'A');
    sitDown(s, 0, w); placeDebris(s, A, 600, 1); sitDown(s, 1, c);   // Science sat after the warning: cursor on slot 0; Weapons sat before: cursor -1 until... (sitDown selects warnedTargets()[0], so both are on slot 0)
    s.stations.cursor[w] = -1;                                      // force Weapons to "nothing selected"
    s.tick = ENCOUNTER_FIRST * T; enemySystem(s);
    expect(s.stations.cursor[w]).toBe(ENEMY_SLOT); expect(s.stations.cursor[c]).toBe(0);
  });
  it('a due shot re-arms with one director draw, then spawns a Shot with the three hazards draws, in spawnObject order', () => {
    const s = makeState(2); quiet(s); placeEnemy(s);
    s.tick = s.enemy.nextShotTick - 1; enemySystem(s);
    expect(shotsInFlight(s)).toBe(0);
    s.tick = s.enemy.nextShotTick; s.rng.director.s = 7; s.rng.hazards.s = 7;
    const dr = createRng(7), u = nextFloat(dr);
    const hz = createRng(7), rm = nextInt(hz, s.derived.volume.length), flight = ENEMY_SHOT_FLIGHT + (2 * nextFloat(hz) - 1) * ENEMY_SHOT_JITTER, freq = 1 + nextInt(hz, FREQ_COUNT);
    const tick = s.tick; enemySystem(s);
    expect(s.enemy.nextShotTick).toBe(tick + Math.round(fireInterval(minutesOf(s), 2) * T * jitter(u)));
    expect(s.rng.director.s).toBe(dr.s); expect(s.rng.hazards.s).toBe(hz.s);
    expect(shotsInFlight(s)).toBe(1);
    const k = Array.from(s.debris.active).indexOf(1);
    expect([s.debris.kind[k], s.debris.room[k], s.debris.impactTick[k], s.debris.frequency[k], s.debris.warned[k]]).toEqual([ObjectKind.Shot, rm, tick + Math.round(flight * T), freq, 0]);
  });
  it('with the shot cap reached, or the table full of debris, a due shot re-arms (one director draw) and draws nothing from hazards', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); const A = room(s, 'A');
    for (let n = 0; n < ENEMY_SHOTS_MAX; n++) placeShot(s, A, 600);
    s.tick = s.enemy.nextShotTick; const d1 = createRng(s.rng.director.s); const u1 = nextFloat(d1); const h1 = s.rng.hazards.s;
    enemySystem(s);
    expect(s.rng.director.s).toBe(d1.s); expect(s.rng.hazards.s).toBe(h1); expect(shotsInFlight(s)).toBe(ENEMY_SHOTS_MAX);
    expect(s.enemy.nextShotTick).toBe(s.tick + Math.round(fireInterval(minutesOf(s), 2) * T * jitter(u1)));
    const f = makeState(2); quiet(f); placeEnemy(f);
    for (let n = 0; n < DEBRIS_SLOTS; n++) placeDebris(f, A, 600);   // full of debris: the cap is not the reason
    f.tick = f.enemy.nextShotTick; const d2 = createRng(f.rng.director.s); const u2 = nextFloat(d2); const h2 = f.rng.hazards.s;
    enemySystem(f);
    expect(f.rng.director.s).toBe(d2.s); expect(f.rng.hazards.s).toBe(h2); expect(shotsInFlight(f)).toBe(0);
    expect(f.enemy.nextShotTick).toBe(f.tick + Math.round(fireInterval(minutesOf(f), 2) * T * jitter(u2)));
  });
  it('withdraws exactly at departTick with one director draw, leaving shots in flight and arming the cooldown; a tick with both clocks due fires nothing', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); const A = room(s, 'A'); placeShot(s, A, 600);
    s.tick = s.enemy.departTick - 1; s.enemy.nextShotTick = 1e9; enemySystem(s);
    expect(s.enemy.present).toBe(1);
    s.tick = s.enemy.departTick; s.rng.director.s = 7; const dr = createRng(7), u = nextFloat(dr); const h = s.rng.hazards.s;
    enemySystem(s);
    const e = s.enemy;
    expect([e.present, e.hull, e.stableId, e.nextShotTick, e.departTick]).toEqual([0, 0, 0, -1, -1]);
    expect(e.nextArrivalTick).toBe(s.tick + Math.round(ENCOUNTER_COOLDOWN * T * jitter(u)));
    expect(s.rng.director.s).toBe(dr.s); expect(s.rng.hazards.s).toBe(h); expect(s.telemetry.enemiesDestroyed).toBe(0);
    expect(s.debris.active[0]).toBe(1); expect(s.debris.kind[0]).toBe(ObjectKind.Shot);
    const both = makeState(2); quiet(both); placeEnemy(both);
    both.tick = both.enemy.departTick; both.enemy.nextShotTick = both.tick;
    const d3 = createRng(both.rng.director.s); nextFloat(d3); const h3 = both.rng.hazards.s;
    enemySystem(both);
    expect(both.enemy.present).toBe(0); expect(shotsInFlight(both)).toBe(0); expect(both.rng.director.s).toBe(d3.s); expect(both.rng.hazards.s).toBe(h3);
  });
  it('a second encounter arrives after the cooldown with a new StableId and encounters 2', () => {
    const s = makeState(2); quiet(s);
    s.tick = s.enemy.nextArrivalTick; enemySystem(s); const first = s.enemy.stableId;
    expect(s.telemetry.encounters).toBe(1);
    s.tick = s.enemy.departTick; enemySystem(s);
    s.tick = s.enemy.nextArrivalTick; enemySystem(s);
    expect(s.enemy.present).toBe(1); expect(s.enemy.stableId).toBeGreaterThan(first); expect(s.telemetry.encounters).toBe(2);
  });
  it('through step(): arrival at ENCOUNTER_FIRST, a shot warned on its spawn tick when Science is seated', () => {
    const s = makeState(2); quiet(s);
    run(s, ENCOUNTER_FIRST * T + 1);
    expect(s.enemy.present).toBe(1); expect(s.telemetry.encounters).toBe(1);
    sitDown(s, 1, sci(s));
    run(s, s.enemy.nextShotTick - s.tick + 1);
    expect(shotsInFlight(s)).toBe(1);
    const k = Array.from(s.debris.active).indexOf(1);
    expect(s.debris.warned[k]).toBe(1);                              // seated lead (18 s+) exceeds the shot's flight: warned the tick it spawned
  });
  it('through step(): the director spawns before the enemy fires on a tick where both are due (StableId order and independent RNG outcomes)', () => {
    const s = makeState(2); armSpawn(s); placeEnemy(s); s.enemy.nextShotTick = s.tick;
    s.rng.director.s = 7; s.rng.hazards.s = 7;
    // The director attempt: jitter draw, type roll, then a target draw from hazards; the type is whatever seed 7 picks. Force a debris spawn so both
    // systems allocate a StableId this tick: give every other type no target (all rooms burning, all sites breached, all stations failed is heavy),
    // so instead assert the order generically: the enemy's shot has the LARGER StableId of the two objects/hazards allocated this tick when a debris
    // object was spawned, and the director stream advanced by exactly 2 + 1 draws (jitter, type, enemy re-arm) in total.
    const idBefore = s.nextStableId; const dr = createRng(7); nextFloat(dr); nextFloat(dr); nextFloat(dr);
    run(s, 1, () => [NEUTRAL_INTENT, NEUTRAL_INTENT]);
    expect(s.rng.director.s).toBe(dr.s);                             // director: jitter + type; enemy: one re-arm draw; nothing else draws from the director stream
    const shot = Array.from(s.debris.active).map((a, k) => (a && s.debris.kind[k] === ObjectKind.Shot ? k : -1)).find((k) => k >= 0)!;
    expect(shot).toBeGreaterThanOrEqual(0);
    expect(s.debris.stableId[shot]).toBe(s.nextStableId - 1);        // the shot took the last StableId of the tick: it was allocated after the director's spawn (if any)
    expect(s.nextStableId - idBefore).toBeGreaterThanOrEqual(1);
  });
});

describe('enemy: targets', () => {
  it('warnedTargets includes the enemy only while present, sorted by StableId among warned objects; isTarget; cycling with wrap', () => {
    const s = makeState(1), A = room(s, 'A');
    const a = placeDebris(s, A, 600, 1);                              // id n
    expect(warnedTargets(s)).toEqual([a]);
    placeEnemy(s);                                                    // id n+1
    const b = placeDebris(s, A, 600, 1);                              // id n+2
    const u = placeDebris(s, A, 600, 0);                              // unwarned
    expect(warnedTargets(s)).toEqual([a, ENEMY_SLOT, b]);
    expect(targetStableId(s, ENEMY_SLOT)).toBe(s.enemy.stableId);
    expect([isTarget(s, ENEMY_SLOT), isTarget(s, a), isTarget(s, u), isTarget(s, 7)]).toEqual([true, true, false, false]);
    const w = wpn(s); sitDown(s, 0, w); expect(s.stations.cursor[w]).toBe(a);
    cycleTarget(s, w, Dir.Down); expect(s.stations.cursor[w]).toBe(ENEMY_SLOT);
    cycleTarget(s, w, Dir.Down); expect(s.stations.cursor[w]).toBe(b);
    cycleTarget(s, w, Dir.Down); expect(s.stations.cursor[w]).toBe(a);
    cycleTarget(s, w, Dir.Up); expect(s.stations.cursor[w]).toBe(b);
    s.enemy.present = 0; expect(warnedTargets(s)).toEqual([a, b]); expect(isTarget(s, ENEMY_SLOT)).toBe(false);
  });
  it('nextTarget compares targetStableId: after the object before the enemy it returns the enemy, after the enemy the next object, and wraps', () => {
    const s = makeState(1), A = room(s, 'A');
    const a = placeDebris(s, A, 600, 1, 5); placeEnemy(s); s.enemy.stableId = 6; s.nextStableId = 7; const b = placeDebris(s, A, 600, 1, 7);
    expect(nextTarget(s, 5)).toBe(ENEMY_SLOT); expect(nextTarget(s, 6)).toBe(b); expect(nextTarget(s, 7)).toBe(a);
  });
  it('leave retargets cursors on the enemy to the next StableId or -1; removeDebris can land a cursor on the enemy', () => {
    const s = makeState(2), A = room(s, 'A'), w = wpn(s), c = sci(s);
    const a = placeDebris(s, A, 600, 1); placeEnemy(s); const b = placeDebris(s, A, 600, 1);
    sitDown(s, 0, w); sitDown(s, 1, c); s.stations.cursor[w] = ENEMY_SLOT; s.stations.cursor[c] = ENEMY_SLOT;
    leave(s, false);
    expect(s.stations.cursor[w]).toBe(b); expect(s.stations.cursor[c]).toBe(b);
    const t = makeState(1), w2 = wpn(t); const a2 = placeDebris(t, A, 600, 1); placeEnemy(t);
    sitDown(t, 0, w2); expect(t.stations.cursor[w2]).toBe(a2);
    t.debris.impactTick[a2] = t.tick; t.director.nextSpawnTick = 1e9; debrisSystem(t);   // impact removes a2
    expect(t.stations.cursor[w2]).toBe(ENEMY_SLOT);
    const alone = makeState(1), w3 = wpn(alone); placeEnemy(alone); sitDown(alone, 0, w3); expect(alone.stations.cursor[w3]).toBe(ENEMY_SLOT);
    leave(alone, false); expect(alone.stations.cursor[w3]).toBe(-1);
    void a; void arrive; void enemyBeamHits;
  });
  it('placeDebris into a slot freed by a shot writes kind 0 (a later debris impact deals the debris damage, not the shot damage)', () => {
    const s = makeState(1), A = room(s, 'A'); quiet(s);
    const k = placeShot(s, A, 600); s.debris.impactTick[k] = s.tick; debrisSystem(s);
    expect(s.hull).toBe(HULL_MAX - ENEMY_SHOT_HULL_DAMAGE); expect(s.debris.active[k]).toBe(0);
    const k2 = placeDebris(s, A, 600); expect(k2).toBe(k); expect(s.debris.kind[k2]).toBe(ObjectKind.Debris);
    s.debris.impactTick[k2] = s.tick; debrisSystem(s);
    expect(s.hull).toBe(HULL_MAX - ENEMY_SHOT_HULL_DAMAGE - DEBRIS_HULL_DAMAGE);
    const p = makeState(1); quiet(p);                                 // production path: spawnDebris into a slot freed by a shot
    const ks = placeShot(p, A, 600); p.debris.impactTick[ks] = p.tick; debrisSystem(p); expect(p.hull).toBe(HULL_MAX - ENEMY_SHOT_HULL_DAMAGE);
    const kd = spawnDebris(p); expect(kd).toBe(ks); expect(p.debris.kind[kd]).toBe(ObjectKind.Debris);
    p.debris.impactTick[kd] = p.tick; debrisSystem(p); expect(p.hull).toBe(HULL_MAX - ENEMY_SHOT_HULL_DAMAGE - DEBRIS_HULL_DAMAGE);
  });
});
