import { describe, it, expect } from 'vitest';
import { enemySystem, fireInterval, leave, enemyBeamHits } from '../src/renderer/src/sim/enemy';
import { ObjectKind, shotsInFlight, debrisSystem, spawnDebris } from '../src/renderer/src/sim/debris';
import { ENEMY_SLOT, targetStableId, isTarget, warnedTargets, nextTarget, cycleTarget } from '../src/renderer/src/sim/debrisTargets';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Dir } from '../src/renderer/src/sim/dir';
import { minutesOf } from '../src/renderer/src/sim/director';
import { createRng, nextFloat, nextInt } from '../src/shared/rng';
import { TICK_HZ, ENCOUNTER_FIRST, ENCOUNTER_MAX, ENCOUNTER_COOLDOWN, ENEMY_HULL, ENEMY_FIRST_SHOT, ENEMY_FIRE_JITTER, ENEMY_SHOTS_MAX, ENEMY_SHOT_FLIGHT, ENEMY_SHOT_JITTER, FREQ_COUNT, SOLO_INTERVAL_MULT, DEBRIS_SLOTS, HULL_MAX, ENEMY_SHOT_HULL_DAMAGE, DEBRIS_HULL_DAMAGE, ENEMY_BEAM_DAMAGE, ENEMY_BEAM_BASE, ENEMY_BEAM_SCALE, ENEMY_TORP_DAMAGE, XP_PER_SHOT, DEBRIS_CREW_DAMAGE, STRESS_WEIGHTS } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, armSpawn, placeEnemy, placeShot, placeDebris, room, intents, teleport, seconds } from './helpers/sim';
import { fireWeapon, Weapon } from '../src/renderer/src/sim/weapons';
import { scienceInput, scanStep } from '../src/renderer/src/sim/science';
import { isProductive } from '../src/renderer/src/sim/productive';
import { failStation } from '../src/renderer/src/sim/power';
import { rawStress, anyUnattended, activeHazardCount } from '../src/renderer/src/sim/director';
import { Health } from '../src/renderer/src/sim/components';
import { Skill, xpIndex } from '../src/renderer/src/sim/skills';
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
    sitDown(s, 0, w); placeDebris(s, A, 600, 1); sitDown(s, 1, c);   // Science sits after the warning, so its cursor is on slot 0
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
    const tick = s.tick; const dr = createRng(7); nextFloat(dr); nextFloat(dr); const u3 = nextFloat(dr);
    run(s, 1, () => [NEUTRAL_INTENT, NEUTRAL_INTENT]);
    expect(s.rng.director.s).toBe(dr.s);                             // director jitter + type, then the enemy re-arm: three draws
    expect(s.enemy.nextShotTick).toBe(tick + Math.round(fireInterval(minutesOf(s), 2) * T * jitter(u3)));   // the third-float pin fails if the systems are swapped
    const shot = Array.from(s.debris.active).map((a, k) => (a && s.debris.kind[k] === ObjectKind.Shot ? k : -1)).find((k) => k >= 0)!;
    expect(shot).toBeGreaterThanOrEqual(0);
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
    placeDebris(s, A, 600, 1); placeEnemy(s); const b = placeDebris(s, A, 600, 1);
    sitDown(s, 0, w); sitDown(s, 1, c); s.stations.cursor[w] = ENEMY_SLOT; s.stations.cursor[c] = ENEMY_SLOT;
    leave(s, false);
    expect(s.stations.cursor[w]).toBe(b); expect(s.stations.cursor[c]).toBe(b);
    const t = makeState(1), w2 = wpn(t); const a2 = placeDebris(t, A, 600, 1); placeEnemy(t);
    sitDown(t, 0, w2); expect(t.stations.cursor[w2]).toBe(a2);
    t.debris.impactTick[a2] = t.tick; t.director.nextSpawnTick = 1e9; debrisSystem(t);   // impact removes a2
    expect(t.stations.cursor[w2]).toBe(ENEMY_SLOT);
    const alone = makeState(1), w3 = wpn(alone); placeEnemy(alone); sitDown(alone, 0, w3); expect(alone.stations.cursor[w3]).toBe(ENEMY_SLOT);
    leave(alone, false); expect(alone.stations.cursor[w3]).toBe(-1);
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

/** Replace every debris array with a Proxy that throws on a read at ENEMY_SLOT, so a test proves the pseudo-slot never indexes the table. */
function guardDebris(s: ReturnType<typeof makeState>): void {
  const trap = <A extends object>(arr: A): A => new Proxy(arr, { get(t, p) { if (p === String(ENEMY_SLOT)) throw new Error(`debris array read at ENEMY_SLOT`); const v = Reflect.get(t, p); return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v; } });
  const db = s.debris as unknown as Record<string, object>;
  for (const key of Object.keys(db)) db[key] = trap(db[key]!);
}

describe('enemy: shooting the ship (combat 7 -> 0.012 hits, combat 4 -> 0.924 misses at output 0.5)', () => {
  const armed = (hull = ENEMY_HULL) => { const s = makeState(1); quiet(s); placeEnemy(s, hull); const w = wpn(s); sitDown(s, 0, w); s.stations.cursor[w] = ENEMY_SLOT; s.weapons.charge = 1; return { s, w }; };
  it('enemyBeamHits thresholds', () => {
    expect(enemyBeamHits(0.69, 0.5)).toBe(true); expect(enemyBeamHits(0.71, 0.5)).toBe(false); expect(enemyBeamHits(0.84, 1)).toBe(true); expect(enemyBeamHits(0.86, 1)).toBe(false);
  });
  it('a beam hit takes 15 hull, counts the shot and hit, resets the charge, stamps the shot and draws once; a miss takes nothing', () => {
    const { s } = armed(); s.rng.combat.s = 7; const one = createRng(7); nextFloat(one);
    expect(fireWeapon(s)).toBe(true);
    expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_BEAM_DAMAGE); expect([s.telemetry.shots, s.telemetry.hits]).toEqual([1, 1]); expect(s.weapons.charge).toBe(0); expect(s.skills.lastShotTick).toBe(s.tick); expect(s.rng.combat.s).toBe(one.s);
    expect(s.skills.xp[xpIndex(0, Skill.Weapons)]).toBe(XP_PER_SHOT);
    const m = armed(); m.s.rng.combat.s = 4;
    expect(fireWeapon(m.s)).toBe(false); expect(m.s.enemy.hull).toBe(ENEMY_HULL); expect([m.s.telemetry.shots, m.s.telemetry.hits]).toEqual([1, 0]); expect(m.s.weapons.charge).toBe(0);
    // seed 6: first combat float 0.526 (checked below) hits the enemy at 0.70 (BASE + SCALE * 0.5) but would miss a mismatched debris beam at 0.20
    expect(nextFloat(createRng(6))).toBeCloseTo(0.526, 3); expect(ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE * 0.5).toBeCloseTo(0.7, 10);
    for (const selector of [Weapon.BeamF1, Weapon.BeamF2, Weapon.BeamF3]) {   // frequency ignored
      const { s } = armed(); s.weapons.selector = selector; s.rng.combat.s = 6;
      expect(fireWeapon(s)).toBe(true); expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_BEAM_DAMAGE);
    }
  });
  it('a torpedo hit takes 35 and unloads the tube; a miss takes nothing', () => {
    const { s } = armed(); s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoaded = 1; s.rng.combat.s = 7;
    expect(fireWeapon(s)).toBe(true); expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_TORP_DAMAGE); expect(s.weapons.torpedoLoaded).toBe(0);
    const m = armed(); m.s.weapons.selector = Weapon.Torpedo; m.s.weapons.torpedoLoaded = 1; m.s.rng.combat.s = 4;
    expect(fireWeapon(m.s)).toBe(false); expect(m.s.enemy.hull).toBe(ENEMY_HULL);
  });
  it('the kill: hull 15 and a beam hit destroys the enemy, retargets, draws the cooldown once, and leaves a shot in flight', () => {
    const { s, w } = armed(15); const A = room(s, 'A'); const k = placeShot(s, A, 600, 1); const b = placeDebris(s, A, 600, 1);
    s.stations.cursor[w] = ENEMY_SLOT; s.rng.combat.s = 7; s.rng.director.s = 7; const dr = createRng(7), u = nextFloat(dr);
    expect(fireWeapon(s)).toBe(true);
    expect([s.enemy.present, s.enemy.hull, s.telemetry.enemiesDestroyed, s.telemetry.shots, s.telemetry.hits]).toEqual([0, 0, 1, 1, 1]);
    expect(s.stations.cursor[w]).toBe(k);   // the next StableId after the enemy's: the shot (placed after placeEnemy) sorts first
    expect(s.rng.director.s).toBe(dr.s); expect(s.enemy.nextArrivalTick).toBe(s.tick + Math.round(ENCOUNTER_COOLDOWN * T * jitter(u)));
    expect(s.debris.active[k]).toBe(1); expect(s.debris.kind[k]).toBe(ObjectKind.Shot);
  });
  it('readiness rejections against the enemy: absent, offline, unoccupied, uncharged, unloaded (no draw, no shot)', () => {
    const check = (s: ReturnType<typeof makeState>) => { const c0 = s.rng.combat.s; expect(fireWeapon(s)).toBe(false); expect(s.rng.combat.s).toBe(c0); expect(s.telemetry.shots).toBe(0); expect(s.enemy.hull).toBe(s.enemy.present ? ENEMY_HULL : 0); };
    const absent = armed(); absent.s.enemy.present = 0; absent.s.enemy.hull = 0; check(absent.s);
    const off = armed(); failStation(off.s, off.w); check(off.s);                                   // failStation also stands the operator
    const failedSeated = armed(); failedSeated.s.stations.failed[failedSeated.w] = 1; check(failedSeated.s);      // failed byte alone, operator still seated: the online guard
    const unpowered = armed(); unpowered.s.stations.level[unpowered.w] = 0; check(unpowered.s);                   // allocation 0, operator still seated
    const empty = armed(); empty.s.stations.occupant[empty.w] = -1; check(empty.s);
    const low = armed(); low.s.weapons.charge = 0.5; check(low.s);
    const noTorp = armed(); noTorp.s.weapons.selector = Weapon.Torpedo; noTorp.s.weapons.torpedoLoaded = 0; check(noTorp.s);
  });
  it('a kill on a due-shot tick fires nothing: destroyed in the Weapons step, enemySystem finds it absent', () => {
    const s = makeState(2); quiet(s); placeEnemy(s, 15); const w = wpn(s); sitDown(s, 0, w); s.stations.cursor[w] = ENEMY_SLOT; s.weapons.charge = 1;
    s.enemy.nextShotTick = s.tick; s.rng.combat.s = 7; const d1 = createRng(s.rng.director.s); nextFloat(d1); const h = s.rng.hazards.s;
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect(s.enemy.present).toBe(0); expect(s.telemetry.enemiesDestroyed).toBe(1); expect(shotsInFlight(s)).toBe(0); expect(s.rng.director.s).toBe(d1.s); expect(s.rng.hazards.s).toBe(h);
  });
});

describe('enemy: shot impacts and guards', () => {
  it('an unevaded shot takes 6 hull, 20 crew health, leaves one hazard, stamps impactTick and counts; an evaded shot counts a roll and an evasion only', () => {
    const s = makeState(1), A = room(s, 'A'); quiet(s); teleport(s, 0, 2.5, 2.5); s.rng.hazards.s = 7;   // 0.012 < 0.5: breach first
    placeShot(s, A, 0); debrisSystem(s);
    expect(s.hull).toBe(100 - ENEMY_SHOT_HULL_DAMAGE); expect(Health.cur[s.crew[0]!]).toBe(100 - DEBRIS_CREW_DAMAGE);
    const breaches = Array.from(s.breaches.active).filter((b, i) => b && s.derived.siteRoom[i] === A).length, fire = s.rooms.fire[A]! > 0 ? 1 : 0;
    expect([breaches, fire]).toEqual([1, 0]); expect(s.rooms.impactTick[A]).toBe(s.tick); expect(s.telemetry.impacts).toBe(1); expect(s.debris.active[0]).toBe(0);
    const f = makeState(1); quiet(f); teleport(f, 0, 2.5, 2.5); f.rng.hazards.s = 1;   // fire first
    placeShot(f, A, 0); debrisSystem(f);
    expect([Array.from(f.breaches.active).filter((b, i) => b && f.derived.siteRoom[i] === A).length, f.rooms.fire[A]! > 0 ? 1 : 0]).toEqual([0, 1]);
    const e = makeState(1); quiet(e); sitDown(e, 0, e.derived.stationOfKind[StationKind.Navigation]!); e.rng.combat.s = 7; placeShot(e, A, 0); debrisSystem(e);
    expect([e.telemetry.evadeRolls, e.telemetry.evasions, e.telemetry.impacts, e.hull]).toEqual([1, 1, 0, 100]);
  });
  it('a shot can be scanned and shot down exactly like debris', () => {
    const s = makeState(1), B = room(s, 'B'); quiet(s); const c = sci(s); sitDown(s, 0, c); const k = placeShot(s, B, 6000, 1, undefined, 2);
    s.stations.cursor[c] = k; scienceInput(s, c, -1, true); expect(s.science.scanning).toBe(1);
    run(s, seconds(20)); expect(s.debris.scanned[k]).toBe(1); expect(s.debris.frequency[k]).toBe(2);
    run(s, 1, () => intents({ cancelPressed: true }));
    const w = wpn(s); sitDown(s, 0, w); s.stations.cursor[w] = k; s.weapons.selector = Weapon.BeamF2; s.weapons.charge = 1; s.rng.combat.s = 7;
    expect(fireWeapon(s)).toBe(true); expect(s.debris.active[k]).toBe(0); expect([s.telemetry.shots, s.telemetry.hits]).toEqual([1, 1]);
  });
  it('Science guards: Confirm on the enemy starts no scan; scanStep with the cursor on the enemy touches nothing; neither reads a debris array at ENEMY_SLOT', () => {
    const s = makeState(1), A = room(s, 'A'); placeEnemy(s); const c = sci(s); sitDown(s, 0, c); const k = placeDebris(s, A, 600, 1); s.debris.scan[k] = 0.4;
    s.stations.cursor[c] = ENEMY_SLOT; guardDebris(s);
    scienceInput(s, c, -1, true); expect(s.science.scanning).toBe(0);
    s.science.scanning = 1; scanStep(s); expect(s.science.scanning).toBe(1); expect(s.debris.scan[k]).toBe(0.4);
  });
  it('productive: the enemy alone makes neither Science nor Navigation productive; one shot in flight does', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); s.enemy.nextShotTick = 1e9;   // no enemy fire either: the enemy alone
    const c = sci(s), n = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, c); sitDown(s, 1, n);
    expect(isProductive(s, c)).toBe(false); expect(isProductive(s, n)).toBe(false);
    const before = [s.director.sinceProductive[StationKind.Science], s.director.sinceProductive[StationKind.Navigation]];
    run(s, seconds(10));
    expect(s.director.sinceProductive[StationKind.Science]).toBe(before[0]! + seconds(10)); expect(s.director.sinceProductive[StationKind.Navigation]).toBe(before[1]! + seconds(10));
    expect(s.skills.xp[0 * 6 + 3]).toBe(0); expect(s.skills.xp[1 * 6 + 0]).toBe(0);                  // no Science or Navigation XP
    placeShot(s, room(s, 'A'), 6000, 1);
    expect(isProductive(s, c)).toBe(true); expect(isProductive(s, n)).toBe(true);
    s.science.scanning = 1; s.stations.cursor[c] = ENEMY_SLOT; guardDebris(s); expect(isProductive(s, c)).toBe(true);   // through anyWarned, not the scan branch; the guard proves no debris array is read at ENEMY_SLOT
  });
  it('director: rawStress with the enemy alone is 0.30, with one shot 0.50; the enemy is never unattended; a shot counts toward the hazard cap', () => {
    const s = makeState(2); placeEnemy(s);
    expect(rawStress(s)).toBeCloseTo(STRESS_WEIGHTS.enemy, 12); expect(anyUnattended(s)).toBe(false); expect(activeHazardCount(s)).toBe(0);
    placeShot(s, room(s, 'A'), 600);
    expect(rawStress(s)).toBeCloseTo(STRESS_WEIGHTS.enemy + STRESS_WEIGHTS.debris, 12); expect(activeHazardCount(s)).toBe(1);
  });
});

describe('combat gate: a level-2 Weapons operator destroys the enemy with seven beams inside the window', () => {
  it('seven shots, seven hits, destroyed before departTick', () => {
    const s = makeState(2, 1); quiet(s); const w = wpn(s); sitDown(s, 0, w); placeEnemy(s); s.enemy.nextShotTick = 1e9; s.stations.cursor[w] = ENEMY_SLOT; s.weapons.charge = 0;
    const depart = s.enemy.departTick; let shots = 0;
    while (s.enemy.present && s.tick < depart) {
      const fire = s.weapons.charge >= 1; if (fire) { s.rng.combat.s = 7; shots++; }
      run(s, 1, () => intents(fire ? { confirmPressed: true } : {}, {}));
    }
    expect(shots).toBe(7); expect([s.telemetry.shots, s.telemetry.hits, s.telemetry.enemiesDestroyed]).toEqual([7, 7, 1]); expect(s.enemy.present).toBe(0); expect(s.tick).toBeLessThan(depart);
  });
});
