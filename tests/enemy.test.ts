import { describe, it, expect } from 'vitest';
import { enemySystem, fireInterval, leave, EnemySystem, enemyBeamThreshold, damageEnemy, Encounter } from '../src/renderer/src/sim/enemy';
import { ObjectKind, shotsInFlight, debrisSystem, spawnDebris } from '../src/renderer/src/sim/debris';
import { ENEMY_SLOT, ENEMY_SLOTS, ENEMY_WEAPONS_SLOT, ENEMY_ENGINES_SLOT, ENEMY_SHIELDS_SLOT, isEnemySlot, enemySystemOf, targetStableId, isTarget, warnedTargets, nextTarget, cycleTarget } from '../src/renderer/src/sim/debrisTargets';
import { sitDown, standUp, stationOutput } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Dir } from '../src/renderer/src/sim/dir';
import { minutesOf } from '../src/renderer/src/sim/director';
import { createRng, nextFloat, nextInt } from '../src/shared/rng';
import { TICK_HZ, ENCOUNTER_FIRST, ENCOUNTER_FIRST_SMALL, ENCOUNTER_MAX, ENEMY_HULL, ENEMY_FIRST_SHOT, ENEMY_FIRE_JITTER, ENEMY_SHOTS_MAX, ENEMY_SHOT_FLIGHT, ENEMY_SHOT_JITTER, FREQ_COUNT, ENEMY_AIM_CHANCE, CREW_INTERVAL_MULT, DEBRIS_SLOTS, HULL_MAX, ENEMY_SHOT_HULL_DAMAGE, ENEMY_SHOT_CREW_DAMAGE, DEBRIS_HULL_DAMAGE, ENEMY_BEAM_DAMAGE, ENEMY_TORP_DAMAGE, XP_PER_SHOT, DEBRIS_CREW_DAMAGE, STRESS_WEIGHTS, ENEMY_SYS_HP, ENEMY_SYS_REPAIR, ENEMY_EVADE, DT, SCAN_TIME, ENCOUNTER_REWARD_HULL, NEVER } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, armSpawn, placeEnemy, disableSystem, guardDebris, placeShot, placeDebris, room, intents, teleport, seconds } from './helpers/sim';
import { fireWeapon, Weapon } from '../src/renderer/src/sim/weapons';
import { scienceInput, scanStep } from '../src/renderer/src/sim/science';
import { isProductive } from '../src/renderer/src/sim/productive';
import { failStation } from '../src/renderer/src/sim/power';
import { rawStress, anyUnattended, activeHazardCount } from '../src/renderer/src/sim/director';
import { Health } from '../src/renderer/src/sim/components';
import { Skill, xpIndex } from '../src/renderer/src/sim/skills';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { interiorStep, enemyRoomOfHit, EnemyRoom, arrive as enemyArrive } from '../src/renderer/src/sim/enemy';
import { ENEMY_ROOMS, ENEMY_HIT_FIRE, ENEMY_HIT_BREACH, ENEMY_FIRE_SECONDS, ENEMY_BREACH_SECONDS, ENEMY_FIRE_HULL_DPS, ENEMY_FIRE_SYS_DPS, ENEMY_BREACH_HULL_DPS, SCRAP_ENEMY } from '../src/renderer/src/sim/tuning';
import { saveSnapshot, loadSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { LAYOUT } from './helpers/sim';

const T = TICK_HZ;
const wpn = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Weapons]!;
const sci = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Science]!;
const jitter = (u: number) => 1 + ENEMY_FIRE_JITTER * (2 * u - 1);
/** Rooms holding an online console, de-duplicated, in station-index order (spec Demo-i section 11.3). */
const onlineRooms = (s: ReturnType<typeof makeState>): number[] => { const out: number[] = []; for (let i = 0; i < s.stations.level.length; i++) if (s.stations.failed[i] === 0 && s.stations.level[i]! > 0) { const r = s.derived.roomOfTile[s.derived.stationTile[i]!]!; if (!out.includes(r)) out.push(r); } return out; };

describe('enemy: initial values and fireInterval', () => {
  it('a fresh state has no enemy, the first arrival armed, kind bytes zero and zero counters', () => {
    const s = makeState(2), e = s.enemy;
    expect([e.present, e.hull, e.stableId, e.nextArrivalTick, e.nextShotTick, e.departTick]).toEqual([0, 0, 0, ENCOUNTER_FIRST_SMALL * T, -1, -1]);
    for (const [p, first] of [[1, 270], [2, 270], [3, 210], [4, 210]] as const) expect(makeState(p, 1).enemy.nextArrivalTick).toBe(first * T);   // spec Demo-i section 5: later first encounter for crews of two or fewer
    for (const [p, first] of [[1, 330], [2, 330], [3, 240], [4, 240]] as const) expect(makeState(p, 1).boarders.nextArrivalTick).toBe(first * T);
    expect(Array.from(s.debris.kind)).toEqual(new Array(DEBRIS_SLOTS).fill(0));
    expect([s.telemetry.encounters, s.telemetry.enemiesDestroyed]).toEqual([0, 0]);
    expect(Array.from(e.sysHp)).toEqual([0, 0, 0]); expect(Array.from(e.sysRepairTick)).toEqual([-1, -1, -1]); expect([e.shieldFreq, e.scanned, e.scan]).toEqual([0, 0, 0]); expect(s.telemetry.enemyDisables).toBe(0);
  });
  it('fireInterval escalates to the floor and solo is 1.5x', () => {
    expect(fireInterval(0, 3)).toBe(20); expect(fireInterval(3, 3)).toBeCloseTo(200 / 13, 12); expect(fireInterval(10, 3)).toBe(10); expect(fireInterval(30, 3)).toBe(6); expect(fireInterval(0, 1)).toBe(20 * CREW_INTERVAL_MULT[0]!);
    for (const [p, m] of [[1, 1.5], [2, 1.4], [3, 1], [4, 1]] as const) expect(fireInterval(7, p)).toBeCloseTo(fireInterval(7, 3) * m, 12);   // spec Demo-i section 5: crews of two fire 1.4x slower too
  });
});

describe('enemy: schedule (enemySystem called directly)', () => {
  it('arrives exactly at ENCOUNTER_FIRST with no draw, allocating a StableId and arming the shot and departure clocks', () => {
    const s = makeState(2); s.enemy.nextArrivalTick = ENCOUNTER_FIRST * T; s.rng.hazards.s = 7; const d0 = s.rng.director.s, h0 = s.rng.hazards.s, id = s.nextStableId;
    s.tick = ENCOUNTER_FIRST * T - 1; enemySystem(s);
    expect(s.enemy.present).toBe(0); expect(s.rng.hazards.s).toBe(h0);
    const hz = createRng(7); const freq = 1 + nextInt(hz, FREQ_COUNT);
    s.tick = ENCOUNTER_FIRST * T; enemySystem(s);
    const e = s.enemy;
    expect([e.present, e.hull, e.stableId, e.departTick, e.nextShotTick]).toEqual([1, ENEMY_HULL, id, s.tick + ENCOUNTER_MAX * T, s.tick + ENEMY_FIRST_SHOT * T]);
    expect(s.nextStableId).toBe(id + 1); expect(s.telemetry.encounters).toBe(1);
    expect(s.rng.director.s).toBe(d0);
    expect(s.rng.hazards.s).toBe(hz.s); expect(s.enemy.shieldFreq).toBe(freq); expect(freq).toBe(1); expect(hz.s).toBe(1831565820);
    expect(Array.from(s.enemy.sysHp)).toEqual([ENEMY_SYS_HP, ENEMY_SYS_HP, ENEMY_SYS_HP]); expect(Array.from(s.enemy.sysRepairTick)).toEqual([-1, -1, -1]); expect([s.enemy.scanned, s.enemy.scan]).toEqual([0, 0]);
  });
  it('arrival auto-selects the enemy only for a seated targeting console with no selection', () => {
    const s = makeState(2), w = wpn(s), c = sci(s), A = room(s, 'A'); s.enemy.nextArrivalTick = ENCOUNTER_FIRST * T;
    sitDown(s, 0, w); placeDebris(s, A, 600, 1); sitDown(s, 1, c);   // Science sits after the warning, so its cursor is on slot 0
    s.stations.cursor[w] = -1;                                      // force Weapons to "nothing selected"
    s.tick = ENCOUNTER_FIRST * T; enemySystem(s);
    expect(s.stations.cursor[w]).toBe(ENEMY_SLOT); expect(s.stations.cursor[c]).toBe(0);
  });
  it('a due shot re-arms with one director draw, then spawns a Shot with the four hazards draws (the aim, the room, the flight, the frequency), in spawnObject order', () => {
    const s = makeState(2); quiet(s); placeEnemy(s);
    s.tick = s.enemy.nextShotTick - 1; enemySystem(s);
    expect(shotsInFlight(s)).toBe(0);
    s.tick = s.enemy.nextShotTick; s.rng.director.s = 7; s.rng.hazards.s = 7;
    const dr = createRng(7), u = nextFloat(dr);
    const hz = createRng(7), aim = nextFloat(hz), rooms = onlineRooms(s), rm = aim < ENEMY_AIM_CHANCE && rooms.length > 0 ? rooms[nextInt(hz, rooms.length)]! : nextInt(hz, s.derived.volume.length), flight = ENEMY_SHOT_FLIGHT + (2 * nextFloat(hz) - 1) * ENEMY_SHOT_JITTER, freq = 1 + nextInt(hz, FREQ_COUNT);
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
  it('withdraws exactly at departTick with no draw (Demo-vi: no cooldown, NEVER), leaving shots in flight; a tick with both clocks due fires nothing', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); const A = room(s, 'A'); placeShot(s, A, 600);
    s.tick = s.enemy.departTick - 1; s.enemy.nextShotTick = 1e9; enemySystem(s);
    expect(s.enemy.present).toBe(1);
    s.tick = s.enemy.departTick; s.rng.director.s = 7; const dr = createRng(7); const h = s.rng.hazards.s;
    enemySystem(s);
    const e = s.enemy;
    expect([e.present, e.hull, e.stableId, e.nextShotTick, e.departTick]).toEqual([0, 0, 0, -1, -1]);
    expect(e.nextArrivalTick).toBe(NEVER);
    expect(s.rng.director.s).toBe(dr.s); expect(s.rng.hazards.s).toBe(h); expect(s.telemetry.enemiesDestroyed).toBe(0);
    expect(s.debris.active[0]).toBe(1); expect(s.debris.kind[0]).toBe(ObjectKind.Shot);
    const both = makeState(2); quiet(both); placeEnemy(both);
    both.tick = both.enemy.departTick; both.enemy.nextShotTick = both.tick;
    const d3 = createRng(both.rng.director.s); const h3 = both.rng.hazards.s;
    enemySystem(both);
    expect(both.enemy.present).toBe(0); expect(shotsInFlight(both)).toBe(0); expect(both.rng.director.s).toBe(d3.s); expect(both.rng.hazards.s).toBe(h3);
  });
  it('no second encounter at the node: after the departure the arrival clock reads NEVER (Demo-vi; the cooldown is retired)', () => {
    const s = makeState(2); quiet(s);
    s.tick = s.enemy.nextArrivalTick; enemySystem(s);
    expect(s.telemetry.encounters).toBe(1);
    s.tick = s.enemy.departTick; enemySystem(s);
    expect(s.enemy.nextArrivalTick).toBe(NEVER); s.tick += 600 * T; enemySystem(s);
    expect(s.enemy.present).toBe(0); expect(s.telemetry.encounters).toBe(1);
  });
  it('through step(): arrival at ENCOUNTER_FIRST, a shot warned on its spawn tick when Science is seated', () => {
    const s = makeState(2); quiet(s); s.enemy.nextArrivalTick = ENCOUNTER_FIRST * T;
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
    expect(warnedTargets(s)).toEqual([a, ENEMY_SLOT, ENEMY_WEAPONS_SLOT, ENEMY_ENGINES_SLOT, ENEMY_SHIELDS_SLOT, b]);
    expect(targetStableId(s, ENEMY_SLOT)).toBe(s.enemy.stableId);
    expect([isTarget(s, ENEMY_SLOT), isTarget(s, ENEMY_WEAPONS_SLOT), isTarget(s, ENEMY_ENGINES_SLOT), isTarget(s, ENEMY_SHIELDS_SLOT), isTarget(s, a), isTarget(s, u), isTarget(s, 7)]).toEqual([true, true, true, true, true, false, false]);
    expect([isEnemySlot(7), isEnemySlot(8), isEnemySlot(11)]).toEqual([false, true, true]); expect([enemySystemOf(ENEMY_SLOT), enemySystemOf(ENEMY_WEAPONS_SLOT), enemySystemOf(ENEMY_SHIELDS_SLOT)]).toEqual([-1, 0, 2]);
    const w = wpn(s); sitDown(s, 0, w); expect(s.stations.cursor[w]).toBe(a);
    cycleTarget(s, w, Dir.Down); expect(s.stations.cursor[w]).toBe(ENEMY_SLOT);
    cycleTarget(s, w, Dir.Down); expect(s.stations.cursor[w]).toBe(ENEMY_WEAPONS_SLOT);
    cycleTarget(s, w, Dir.Down); expect(s.stations.cursor[w]).toBe(ENEMY_ENGINES_SLOT);
    cycleTarget(s, w, Dir.Down); expect(s.stations.cursor[w]).toBe(ENEMY_SHIELDS_SLOT);
    cycleTarget(s, w, Dir.Down); expect(s.stations.cursor[w]).toBe(b);
    cycleTarget(s, w, Dir.Down); expect(s.stations.cursor[w]).toBe(a);
    cycleTarget(s, w, Dir.Up); expect(s.stations.cursor[w]).toBe(b);
    s.enemy.present = 0; expect(warnedTargets(s)).toEqual([a, b]); expect(ENEMY_SLOTS.map((k) => isTarget(s, k))).toEqual([false, false, false, false]);
  });
  it('nextTarget compares targetStableId: after the object before the enemy it returns the enemy, after the enemy the next object, and wraps', () => {
    const s = makeState(1), A = room(s, 'A');
    const a = placeDebris(s, A, 600, 1, 5); placeEnemy(s); s.enemy.stableId = 6; s.nextStableId = 7; const b = placeDebris(s, A, 600, 1, 7);
    expect(nextTarget(s, 5)).toBe(ENEMY_SLOT); expect(nextTarget(s, 6)).toBe(b); expect(nextTarget(s, 7)).toBe(a);
    expect(nextTarget(s, 6, ENEMY_SLOTS)).toBe(b); expect(nextTarget(s, 5, ENEMY_SLOTS)).toBe(b);
  });
  it('leave retargets cursors on the enemy to the next StableId or -1; removeDebris can land a cursor on the enemy', () => {
    const s = makeState(2), A = room(s, 'A'), w = wpn(s), c = sci(s);
    placeDebris(s, A, 600, 1); placeEnemy(s); const b = placeDebris(s, A, 600, 1);
    sitDown(s, 0, w); sitDown(s, 1, c); s.stations.cursor[w] = ENEMY_SHIELDS_SLOT; s.stations.cursor[c] = ENEMY_WEAPONS_SLOT;
    leave(s, false);
    expect(s.stations.cursor[w]).toBe(b); expect(s.stations.cursor[c]).toBe(b);
    expect(Array.from(s.enemy.sysHp)).toEqual([0, 0, 0]); expect(Array.from(s.enemy.sysRepairTick)).toEqual([-1, -1, -1]); expect([s.enemy.shieldFreq, s.enemy.scanned, s.enemy.scan]).toEqual([0, 0, 0]);
    const t = makeState(1), w2 = wpn(t); const a2 = placeDebris(t, A, 600, 1); placeEnemy(t);
    sitDown(t, 0, w2); expect(t.stations.cursor[w2]).toBe(a2);
    t.debris.impactTick[a2] = t.tick; t.director.nextSpawnTick = 1e9; debrisSystem(t);   // impact removes a2
    expect(t.stations.cursor[w2]).toBe(ENEMY_SLOT);
    const alone = makeState(1), w3 = wpn(alone); placeEnemy(alone); sitDown(alone, 0, w3); expect(alone.stations.cursor[w3]).toBe(ENEMY_SLOT);
    leave(alone, false); expect(alone.stations.cursor[w3]).toBe(-1);
    const sc = makeState(1); placeEnemy(sc); const c4 = sci(sc); sitDown(sc, 0, c4); sc.stations.cursor[c4] = ENEMY_SLOT; sc.science.scanning = 1;
    leave(sc, false); expect(sc.science.scanning).toBe(0);
    const ps = makeState(2), Ap = room(ps, 'A'), wq = wpn(ps), cq = sci(ps); placeDebris(ps, Ap, 600, 1); placeEnemy(ps); const bq = placeDebris(ps, Ap, 600, 1);
    sitDown(ps, 0, wq); sitDown(ps, 1, cq); ps.stations.cursor[cq] = ENEMY_WEAPONS_SLOT; ps.stations.cursor[wq] = ENEMY_SHIELDS_SLOT; ps.science.scanning = 1; ps.debris.scan[bq] = 0.4;
    leave(ps, false);                                                  // the paused object scan survives; both cursors move to the successor
    expect(ps.science.scanning).toBe(0); expect(ps.debris.scan[bq]).toBe(0.4); expect([ps.stations.cursor[wq], ps.stations.cursor[cq]]).toEqual([bq, bq]);
    const none = makeState(2), w5 = wpn(none), c5 = sci(none); placeEnemy(none); sitDown(none, 0, w5); sitDown(none, 1, c5);
    none.stations.cursor[w5] = ENEMY_SHIELDS_SLOT; none.stations.cursor[c5] = ENEMY_ENGINES_SLOT; leave(none, false);
    expect([none.stations.cursor[w5], none.stations.cursor[c5]]).toEqual([-1, -1]);
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

describe('enemy: shooting the ship (combat 7 -> 0.012 hits, combat 4 -> 0.924 misses at output 0.5)', () => {
  const armed = (hull = ENEMY_HULL, shieldFreq = 1) => { const s = makeState(1); quiet(s); placeEnemy(s, hull, shieldFreq); const w = wpn(s); sitDown(s, 0, w); s.stations.cursor[w] = ENEMY_SLOT; s.weapons.charge = 1; return { s, w }; };
  it('enemyBeamThreshold: engines up 0.70 at 0.5 and 0.85 at 1 (after the evasion); engines down raises it by ENEMY_EVADE, unclamped', () => {
    const { s } = armed();
    expect(0.69 < enemyBeamThreshold(s, 0.5)).toBe(true); expect(0.71 < enemyBeamThreshold(s, 0.5)).toBe(false); expect(0.84 < enemyBeamThreshold(s, 1)).toBe(true); expect(0.86 < enemyBeamThreshold(s, 1)).toBe(false);
    disableSystem(s, EnemySystem.Engines);
    expect(0.84 < enemyBeamThreshold(s, 0.5)).toBe(true); expect(0.86 < enemyBeamThreshold(s, 0.5)).toBe(false); expect(0.999 < enemyBeamThreshold(s, 1)).toBe(true);
    expect(enemyBeamThreshold(s, 0.5) - 0.70).toBeCloseTo(ENEMY_EVADE, 12);
  });
  it('a beam hit takes 15 hull, counts the shot and hit, resets the charge, stamps the shot and draws the hit, the hull room and the problem (Demo-viii amendment I1); a miss takes nothing', () => {
    const { s } = armed(); s.rng.combat.s = 7; const one = createRng(7); nextFloat(one); nextInt(one, 2); nextFloat(one);
    expect(fireWeapon(s)).toBe(true);
    expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_BEAM_DAMAGE); expect([s.telemetry.shots, s.telemetry.hits]).toEqual([1, 1]); expect(s.weapons.charge).toBe(0); expect(s.skills.lastShotTick).toBe(s.tick); expect(s.rng.combat.s).toBe(one.s);
    expect(s.skills.xp[xpIndex(0, Skill.Weapons)]).toBe(XP_PER_SHOT);
    const m = armed(); m.s.rng.combat.s = 4;
    expect(fireWeapon(m.s)).toBe(false); expect(m.s.enemy.hull).toBe(ENEMY_HULL); expect([m.s.telemetry.shots, m.s.telemetry.hits]).toEqual([1, 0]); expect(m.s.weapons.charge).toBe(0);
    // seed 6: first combat float 0.526 (checked below) hits the enemy at 0.70 (BASE + SCALE * 0.5) but would miss a mismatched debris beam at 0.20
    expect(nextFloat(createRng(6))).toBeCloseTo(0.526, 3); expect(enemyBeamThreshold(armed().s, 0.5)).toBeCloseTo(0.7, 10);
    for (const selector of [Weapon.BeamF1, Weapon.BeamF2, Weapon.BeamF3]) {   // shields up, one layer: every selector rolls; the matched one pierces, the others strip the layer (spec Demo-i section 11.3)
      const { s } = armed(ENEMY_HULL, 1); s.weapons.selector = selector; s.rng.combat.s = 6; const c0 = createRng(6); nextFloat(c0); if (selector === Weapon.BeamF1) { nextInt(c0, 2); nextFloat(c0); }   // a hull hit adds the room and problem draws (Demo-viii amendment I1)
      const hit = fireWeapon(s);
      expect(hit).toBe(true); expect(s.rng.combat.s).toBe(c0.s); expect([s.telemetry.shots, s.telemetry.hits]).toEqual([1, 1]); expect(s.weapons.charge).toBe(0);
      if (selector === Weapon.BeamF1) { expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_BEAM_DAMAGE); expect([s.enemy.shieldLayers, s.telemetry.shieldHits]).toEqual([1, 0]); }
      else { expect(s.enemy.hull).toBe(ENEMY_HULL); expect([s.enemy.shieldLayers, s.telemetry.shieldHits]).toEqual([0, 1]); }
    }
    for (const selector of [Weapon.BeamF1, Weapon.BeamF2, Weapon.BeamF3]) {   // shields down: every selector rolls and hits at 0.526 < 0.70
      const { s } = armed(ENEMY_HULL, 1); disableSystem(s, EnemySystem.Shields); s.weapons.selector = selector; s.rng.combat.s = 6;
      expect(fireWeapon(s)).toBe(true); expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_BEAM_DAMAGE);
    }
  });
  it('a torpedo hit takes 35 and unloads the tube; a miss takes nothing', () => {
    const { s } = armed(); s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoaded = 1; s.rng.combat.s = 7;
    expect(fireWeapon(s)).toBe(true); expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_TORP_DAMAGE); expect(s.weapons.torpedoLoaded).toBe(0);
    const m = armed(); m.s.weapons.selector = Weapon.Torpedo; m.s.weapons.torpedoLoaded = 1; m.s.rng.combat.s = 4;
    expect(fireWeapon(m.s)).toBe(false); expect(m.s.enemy.hull).toBe(ENEMY_HULL);
  });
  it('the kill: hull 15 and a beam hit destroys the enemy, retargets, makes no director draw (Demo-vi: NEVER), and leaves a shot in flight', () => {
    const { s, w } = armed(15); const A = room(s, 'A'); const k = placeShot(s, A, 600, 1); const b = placeDebris(s, A, 600, 1);
    s.stations.cursor[w] = ENEMY_SLOT; s.rng.combat.s = 7; s.rng.director.s = 7; const dr = createRng(7);
    expect(fireWeapon(s)).toBe(true);
    expect([s.enemy.present, s.enemy.hull, s.telemetry.enemiesDestroyed, s.telemetry.shots, s.telemetry.hits]).toEqual([0, 0, 1, 1, 1]);
    expect(s.stations.cursor[w]).toBe(k);   // the next StableId after the enemy's: the shot (placed after placeEnemy) sorts first
    expect(s.rng.director.s).toBe(dr.s); expect(s.enemy.nextArrivalTick).toBe(NEVER);
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
    s.enemy.nextShotTick = s.tick; s.rng.combat.s = 7; const d1 = createRng(s.rng.director.s); const h = s.rng.hazards.s;   // no director draw: since Demo-vi a kill arms no cooldown
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect(s.enemy.present).toBe(0); expect(s.telemetry.enemiesDestroyed).toBe(1); expect(shotsInFlight(s)).toBe(0); expect(s.rng.director.s).toBe(d1.s); expect(s.rng.hazards.s).toBe(h);
  });
});

describe('enemy: shot impacts and guards', () => {
  it('an unevaded shot takes 6 hull, 20 crew health, leaves one hazard, stamps impactTick and counts; an evaded shot counts a roll and an evasion only', () => {
    const noConsoles = (u: ReturnType<typeof makeState>, r: number) => { for (let i = 0; i < u.stations.level.length; i++) if (u.derived.roomOfTile[u.derived.stationTile[i]!] === r && u.derived.stationKind[i] !== StationKind.Navigation) u.stations.level[i] = 0; };   // a shot impact draws once per online console in the hit room: the consoles of room A are offline here so the breach-or-fire draws below keep their values (the console draws are pinned in combat.test.ts)
    const s = makeState(1), A = room(s, 'A'); quiet(s); noConsoles(s, A); s.stations.level[s.derived.stationOfKind[StationKind.Navigation]!] = 0; teleport(s, 0, 2.5, 2.5); s.rng.hazards.s = 7;   // 0.012 < 0.5: breach first
    placeShot(s, A, 0); debrisSystem(s);
    expect(s.hull).toBe(100 - ENEMY_SHOT_HULL_DAMAGE); expect(Health.cur[s.crew[0]!]).toBe(100 - ENEMY_SHOT_CREW_DAMAGE);
    const breaches = Array.from(s.breaches.active).filter((b, i) => b && s.derived.siteRoom[i] === A).length, fire = s.rooms.fire[A]! > 0 ? 1 : 0;
    expect([breaches, fire]).toEqual([1, 0]); expect(s.rooms.impactTick[A]).toBe(s.tick); expect(s.telemetry.impacts).toBe(1); expect(s.debris.active[0]).toBe(0);
    const f = makeState(1); quiet(f); noConsoles(f, A); f.stations.level[f.derived.stationOfKind[StationKind.Navigation]!] = 0; teleport(f, 0, 2.5, 2.5); f.rng.hazards.s = 1;   // fire first
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
  it('Science guards: Confirm on the enemy hull row starts the ship scan; scanStep with the cursor on the enemy touches nothing; neither reads a debris array at ENEMY_SLOT', () => {
    const s = makeState(1), A = room(s, 'A'); placeEnemy(s); const c = sci(s); sitDown(s, 0, c); const k = placeDebris(s, A, 600, 1); s.debris.scan[k] = 0.4;
    s.stations.cursor[c] = ENEMY_SLOT; guardDebris(s);
    scienceInput(s, c, -1, true); expect(s.science.scanning).toBe(1);
    s.science.scanning = 1; scanStep(s); expect(s.science.scanning).toBe(1); expect(s.debris.scan[k]).toBe(0.4); expect(s.enemy.scan).toBeGreaterThan(0);
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

describe('combat gate: a level-2 Weapons operator strips the shield layer with one untuned beam, then lands seven hits, inside the window', () => {
  it('seven shots, seven hits (one strip, six hull hits and the fires they start), destroyed before departTick', () => {
    const s = makeState(2, 1); quiet(s); const w = wpn(s); sitDown(s, 0, w); placeEnemy(s, ENEMY_HULL, 2); s.enemy.sysHp[EnemySystem.Engines] = 0; s.enemy.nextShotTick = 1e9;   // engines down with no repair armed: no flee starts at 25% hull, this gate is the kill path (the flee has its own tests in combat.test.ts)
    s.stations.cursor[w] = ENEMY_SLOT; s.weapons.charge = 0; s.weapons.selector = Weapon.BeamF1;
    const depart = s.enemy.departTick; let shots = 0;
    while (s.enemy.present && s.tick < depart) {
      const fire = s.weapons.charge >= 1; if (fire) { if (shots > 0) s.weapons.selector = Weapon.BeamF2; s.rng.combat.s = 7; shots++; }
      run(s, 1, () => intents(fire ? { confirmPressed: true } : {}, {}));
      if (fire && shots === 1) expect([s.telemetry.shots, s.telemetry.hits, s.telemetry.shieldHits, s.enemy.shieldLayers, s.enemy.hull]).toEqual([1, 1, 1, 0, ENEMY_HULL]), expect(s.rng.combat.s).not.toBe(7);   // the untuned first beam rolled and stripped the layer
    }
    expect(shots).toBe(7); expect([s.telemetry.shots, s.telemetry.hits, s.telemetry.shieldHits, s.telemetry.enemiesDestroyed]).toEqual([7, 7, 1, 1]);   // Demo-viii: each seed-7 hit also starts a fire aboard, whose burn saves one hull hit expect(s.enemy.present).toBe(0); expect(s.tick).toBeLessThan(depart);
  });
});

describe('enemy systems: repairs, engines and weapons effects (enemySystem called directly)', () => {
  it('weapons down: a due shot re-arms with one director draw and spawns nothing; the repair restores 30 and sets nextShotTick to exactly tick + 5 s', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); disableSystem(s, EnemySystem.Weapons);
    s.tick = s.enemy.nextShotTick; const dr = createRng(s.rng.director.s), u = nextFloat(dr); const h = s.rng.hazards.s;
    enemySystem(s);
    expect(s.rng.director.s).toBe(dr.s); expect(s.rng.hazards.s).toBe(h); expect(shotsInFlight(s)).toBe(0);
    expect(s.enemy.nextShotTick).toBe(s.tick + Math.round(fireInterval(minutesOf(s), 2) * T * jitter(u)));
    const early = makeState(2); quiet(early); placeEnemy(early); disableSystem(early, EnemySystem.Weapons); early.enemy.nextShotTick = early.tick + 10;
    early.tick = early.enemy.sysRepairTick[EnemySystem.Weapons]! - 1; enemySystem(early);
    expect(early.enemy.sysHp[EnemySystem.Weapons]).toBe(0);
    early.tick += 1; enemySystem(early);
    expect(early.enemy.sysHp[EnemySystem.Weapons]).toBe(ENEMY_SYS_HP); expect(early.enemy.sysRepairTick[EnemySystem.Weapons]).toBe(-1); expect(early.enemy.nextShotTick).toBe(early.tick + ENEMY_FIRST_SHOT * T);
    const late = makeState(2); quiet(late); placeEnemy(late); disableSystem(late, EnemySystem.Weapons); late.enemy.nextShotTick = 1e9;
    late.tick = late.enemy.sysRepairTick[EnemySystem.Weapons]!; enemySystem(late);
    expect(late.enemy.nextShotTick).toBe(late.tick + ENEMY_FIRST_SHOT * T);                  // unconditional, even when the old value was later
  });
  it('engines down: departTick advances one per tick, the enemy stays past the original departure, the threshold rises to 0.85; repaired engines stop the clock; none of it draws', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); s.enemy.nextShotTick = 1e9; disableSystem(s, EnemySystem.Engines); s.enemy.sysRepairTick[EnemySystem.Engines] = 1e9;
    const depart = s.enemy.departTick, d0 = s.rng.director.s, h0 = s.rng.hazards.s, c0 = s.rng.combat.s;
    for (let n = 0; n < 100; n++) { s.tick++; enemySystem(s); }
    expect(s.enemy.departTick).toBe(depart + 100);
    expect([s.rng.director.s, s.rng.hazards.s, s.rng.combat.s]).toEqual([d0, h0, c0]);          // pause, repair and damage never draw
    s.tick = depart; enemySystem(s); expect(s.enemy.present).toBe(1);
    expect(enemyBeamThreshold(s, 0.5)).toBeCloseTo(0.85, 12);
    s.enemy.sysRepairTick[EnemySystem.Engines] = s.tick + 1; s.tick += 1; enemySystem(s);
    expect(s.enemy.sysHp[EnemySystem.Engines]).toBe(ENEMY_SYS_HP); const fixed = s.enemy.departTick;
    s.tick += 1; enemySystem(s); expect(s.enemy.departTick).toBe(fixed);
    expect(enemyBeamThreshold(s, 0.5)).toBeCloseTo(0.70, 12);
  });
  it('a repair due on the departure tick happens first (repaired engines do not pause that tick, so the enemy leaves); shields repair while present; damage never arms an intact system twice', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); s.enemy.nextShotTick = 1e9; disableSystem(s, EnemySystem.Engines);
    s.enemy.sysRepairTick[EnemySystem.Engines] = s.enemy.departTick; s.tick = s.enemy.departTick;
    enemySystem(s);
    expect(s.enemy.present).toBe(0);                                                   // the repair ran before the pause check, so departTick was not pushed and the enemy left
    const sh = makeState(1); quiet(sh); placeEnemy(sh, ENEMY_HULL, 1); disableSystem(sh, EnemySystem.Shields); sh.enemy.nextShotTick = 1e9;
    const c1 = sh.rng.combat.s, d1 = sh.rng.director.s, h1 = sh.rng.hazards.s;
    sh.tick = sh.enemy.sysRepairTick[EnemySystem.Shields]! - 1; enemySystem(sh); expect(sh.enemy.sysHp[EnemySystem.Shields]).toBe(0);
    sh.tick += 1; enemySystem(sh);
    expect(sh.enemy.sysHp[EnemySystem.Shields]).toBe(ENEMY_SYS_HP); expect(sh.enemy.sysRepairTick[EnemySystem.Shields]).toBe(-1); expect(sh.enemy.present).toBe(1);
    expect(sh.enemy.shieldLayers).toBe(0); expect([sh.rng.combat.s, sh.rng.director.s, sh.rng.hazards.s]).toEqual([c1, d1, h1]);   // a repaired shield system starts empty and the recharge draws nothing
    const d = makeState(1); quiet(d); placeEnemy(d); const c2 = d.rng.combat.s;
    damageEnemy(d, ENEMY_WEAPONS_SLOT, ENEMY_BEAM_DAMAGE); expect(d.enemy.sysHp[EnemySystem.Weapons]).toBe(ENEMY_SYS_HP - ENEMY_BEAM_DAMAGE); expect(d.enemy.sysRepairTick[EnemySystem.Weapons]).toBe(-1); expect(d.enemy.hull).toBe(ENEMY_HULL - ENEMY_BEAM_DAMAGE);
    damageEnemy(d, ENEMY_WEAPONS_SLOT, ENEMY_BEAM_DAMAGE); const armedAt = d.enemy.sysRepairTick[EnemySystem.Weapons]!;
    expect(d.enemy.sysHp[EnemySystem.Weapons]).toBe(0); expect(armedAt).toBe(d.tick + ENEMY_SYS_REPAIR * T); expect(d.telemetry.enemyDisables).toBe(1);
    damageEnemy(d, ENEMY_WEAPONS_SLOT, ENEMY_BEAM_DAMAGE);
    expect(d.enemy.hull).toBe(ENEMY_HULL - 3 * ENEMY_BEAM_DAMAGE); expect(d.enemy.sysRepairTick[EnemySystem.Weapons]).toBe(armedAt); expect(d.telemetry.enemyDisables).toBe(1);
    damageEnemy(d, ENEMY_ENGINES_SLOT, ENEMY_TORP_DAMAGE); expect(d.enemy.sysHp[EnemySystem.Engines]).toBe(0); expect(d.telemetry.enemyDisables).toBe(2);
    damageEnemy(d, ENEMY_SLOT, ENEMY_BEAM_DAMAGE); expect(Array.from(d.enemy.sysHp)).toEqual([0, 0, ENEMY_SYS_HP]); expect(d.rng.combat.s).toBe(c2);   // damage never draws
    const k = makeState(1); quiet(k); placeEnemy(k, 15); k.enemy.sysHp[EnemySystem.Shields] = 15;   // shields already at 15: the killing beam also disables them
    damageEnemy(k, ENEMY_SHIELDS_SLOT, ENEMY_BEAM_DAMAGE);
    expect([k.enemy.present, k.telemetry.enemiesDestroyed, k.telemetry.enemyDisables]).toEqual([0, 1, 1]); expect(Array.from(k.enemy.sysHp)).toEqual([0, 0, 0]);
    const k2 = makeState(1); quiet(k2); placeEnemy(k2, 15); damageEnemy(k2, ENEMY_SHIELDS_SLOT, ENEMY_BEAM_DAMAGE);   // shields at 30 only drop to 15 before leave clears them: no disable
    expect([k2.enemy.present, k2.telemetry.enemiesDestroyed, k2.telemetry.enemyDisables]).toEqual([0, 1, 0]);
  });
});

describe('enemy systems: shields in the fire path, subsystem rows, the scan', () => {
  const armedAt = (slot: number, shieldFreq = 1, hull = ENEMY_HULL) => { const s = makeState(2); quiet(s); placeEnemy(s, hull, shieldFreq); const w = wpn(s); sitDown(s, 0, w); s.stations.cursor[w] = slot; s.weapons.charge = 1; return { s, w }; };
  it('an untuned beam hit counts the shot and the hit, stamps, awards XP, resets the charge, draws once, strips a layer and damages nothing', () => {
    const { s } = armedAt(ENEMY_SLOT, 2); s.weapons.selector = Weapon.BeamF1; s.rng.combat.s = 7; const one = createRng(7); nextFloat(one);
    expect(fireWeapon(s)).toBe(true);
    expect(s.enemy.hull).toBe(ENEMY_HULL); expect(Array.from(s.enemy.sysHp)).toEqual([ENEMY_SYS_HP, ENEMY_SYS_HP, ENEMY_SYS_HP]); expect(s.weapons.charge).toBe(0); expect(s.enemy.shieldLayers).toBe(0);
    expect([s.telemetry.shots, s.telemetry.hits, s.telemetry.shieldHits]).toEqual([1, 1, 1]); expect(s.skills.xp[xpIndex(0, Skill.Weapons)]).toBe(XP_PER_SHOT); expect(s.skills.lastShotTick).toBe(s.tick); expect(s.rng.combat.s).toBe(one.s);
  });
  it('a torpedo ignores the shields and the selector frequency', () => {
    const { s } = armedAt(ENEMY_SLOT, 2); s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoaded = 1; s.rng.combat.s = 7;
    expect(fireWeapon(s)).toBe(true); expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_TORP_DAMAGE);
  });
  it('beams on a subsystem row damage the system and the hull; a down system takes hull only; the kill through a subsystem row leaves', () => {
    const { s, w } = armedAt(ENEMY_WEAPONS_SLOT); const shoot = () => { s.weapons.charge = 1; s.rng.combat.s = 7; expect(fireWeapon(s)).toBe(true); };
    shoot(); expect([s.enemy.hull, s.enemy.sysHp[EnemySystem.Weapons]]).toEqual([85, 15]);
    shoot(); expect([s.enemy.hull, s.enemy.sysHp[EnemySystem.Weapons], s.telemetry.enemyDisables]).toEqual([70, 0, 1]); expect(s.enemy.sysRepairTick[EnemySystem.Weapons]).toBe(s.tick + ENEMY_SYS_REPAIR * T);
    const armedTick = s.enemy.sysRepairTick[EnemySystem.Weapons];
    shoot(); expect([s.enemy.hull, s.enemy.sysHp[EnemySystem.Weapons], s.telemetry.enemyDisables]).toEqual([55, 0, 1]); expect(s.enemy.sysRepairTick[EnemySystem.Weapons]).toBe(armedTick);
    s.stations.cursor[w] = ENEMY_ENGINES_SLOT; s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoaded = 1; s.rng.combat.s = 7;
    expect(fireWeapon(s)).toBe(true); expect([s.enemy.hull, s.enemy.sysHp[EnemySystem.Engines], s.telemetry.enemyDisables]).toEqual([20, 0, 2]);
    const k = armedAt(ENEMY_SHIELDS_SLOT, 1, 15); k.s.enemy.sysHp[EnemySystem.Shields] = 15; k.s.rng.combat.s = 7;   // the killing beam also drops the shields to 0
    expect(fireWeapon(k.s)).toBe(true); expect([k.s.enemy.present, k.s.telemetry.enemiesDestroyed, k.s.telemetry.enemyDisables]).toEqual([0, 1, 1]);
  });
  it('a full step: a torpedo hit on a down Weapons row on its repair tick damages the hull only, then the repair runs and re-arms the first shot', () => {
    const { s } = armedAt(ENEMY_WEAPONS_SLOT); s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoaded = 1; s.rng.combat.s = 7;
    disableSystem(s, EnemySystem.Weapons); s.enemy.sysRepairTick[EnemySystem.Weapons] = s.tick; const tick = s.tick;
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect(s.enemy.roomFire[EnemyRoom.Weapons]).toBeGreaterThan(0); expect(s.enemy.hull).toBeCloseTo(ENEMY_HULL - ENEMY_TORP_DAMAGE - ENEMY_FIRE_HULL_DPS * DT, 9);   // the hit started a fire in the Weapons room (Demo-viii section 2b): its first tick of burn, and a down system does not burn
    expect(s.enemy.sysHp[EnemySystem.Weapons]).toBe(ENEMY_SYS_HP); expect(s.telemetry.enemyDisables).toBe(0);
    expect(s.enemy.nextShotTick).toBe(tick + ENEMY_FIRST_SHOT * T);
  });
  it('the enemy scan: Confirm on the hull row starts it, scanStep advances and completes it, subsystem rows neither start nor progress it, leave clears it', () => {
    const s = makeState(1); quiet(s); placeEnemy(s, ENEMY_HULL, 3); const c = sci(s); sitDown(s, 0, c); s.stations.cursor[c] = ENEMY_SLOT;
    const output = stationOutput(s, c); expect(output).toBeCloseTo(0.375, 12);                 // starter Science allocation 1 of 2, skill curve 0.75 at level 0
    scienceInput(s, c, -1, true); expect(s.science.scanning).toBe(1);
    scanStep(s); expect(s.enemy.scan).toBeCloseTo(DT * output / SCAN_TIME, 12);
    s.stations.cursor[c] = ENEMY_SHIELDS_SLOT; const paused = s.enemy.scan; scanStep(s); expect(s.enemy.scan).toBe(paused);
    s.stations.cursor[c] = ENEMY_SLOT; const total = Math.ceil(SCAN_TIME / output / DT);     // 960 calls in all reach 1
    for (let n = 1; n < total - 1; n++) scanStep(s);
    expect(s.enemy.scan).toBeLessThan(1); expect(s.science.scanning).toBe(1);
    scanStep(s); expect(s.enemy.scan).toBe(1); expect(s.enemy.scanned).toBe(1); expect(s.science.scanning).toBe(0);
    scanStep(s); expect(s.enemy.scan).toBe(1);                                                // clamped, and scanning is off
    scienceInput(s, c, -1, true); expect(s.science.scanning).toBe(0);                          // scanned: nothing to start
    const t = makeState(1); quiet(t); placeEnemy(t); const c2 = sci(t); sitDown(t, 0, c2); t.stations.cursor[c2] = ENEMY_WEAPONS_SLOT;
    scienceInput(t, c2, -1, true); expect(t.science.scanning).toBe(0);
    t.stations.cursor[c2] = ENEMY_SLOT; scienceInput(t, c2, -1, true); scanStep(t); standUp(t, 0); const kept = t.enemy.scan; scanStep(t); expect(t.enemy.scan).toBe(kept);
    sitDown(t, 0, c2); t.stations.cursor[c2] = ENEMY_SLOT; scienceInput(t, c2, -1, true); scanStep(t); expect(t.enemy.scan).toBeGreaterThan(kept);
    const fk = t.enemy.scan; failStation(t, c2); scanStep(t); expect(t.enemy.scan).toBe(fk);   // a failed Science station pauses the scan
    leave(t, false); expect([t.enemy.scan, t.enemy.scanned, t.science.scanning]).toEqual([0, 0, 0]);
    const kl = makeState(2); quiet(kl); placeEnemy(kl, 15, 1); const wk = wpn(kl), ck = sci(kl); sitDown(kl, 0, wk); sitDown(kl, 1, ck);
    kl.stations.cursor[wk] = ENEMY_SLOT; kl.stations.cursor[ck] = ENEMY_SLOT; kl.weapons.charge = 1; kl.weapons.selector = Weapon.BeamF1; kl.rng.combat.s = 7;
    kl.science.scanning = 1; kl.enemy.scan = 1 - 2 * DT * stationOutput(kl, ck) / SCAN_TIME;                                       // one increment (and a margin) below completion
    run(kl, 1, () => intents({ confirmPressed: true }, {}));                                                                      // the matched beam kills; the scan state is cleared, not completed
    expect([kl.enemy.present, kl.enemy.scan, kl.enemy.scanned, kl.science.scanning]).toEqual([0, 0, 0, 0]);
    const absent = makeState(1); const c3 = sci(absent); sitDown(absent, 0, c3); absent.stations.cursor[c3] = ENEMY_SLOT; scienceInput(absent, c3, -1, true); expect(absent.science.scanning).toBe(0);
  });
  it('productive: a running enemy scan is productive; the enemy alone (all four rows) is not; the read trap covers slots 8 to 11', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); s.enemy.nextShotTick = 1e9; const c = sci(s), n = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, c); sitDown(s, 1, n);
    for (const slot of ENEMY_SLOTS) { s.stations.cursor[c] = slot; expect(isProductive(s, c)).toBe(false); }
    s.science.scanning = 1; s.stations.cursor[c] = ENEMY_WEAPONS_SLOT; expect(isProductive(s, c)).toBe(false); s.science.scanning = 0;   // scanning, but on a system row with no object in flight
    expect(isProductive(s, n)).toBe(false);
    s.stations.cursor[c] = ENEMY_SLOT; s.science.scanning = 1; expect(isProductive(s, c)).toBe(true);
    s.enemy.scanned = 1; expect(isProductive(s, c)).toBe(false);
    const g = makeState(2); quiet(g); placeEnemy(g); const cg = sci(g), wg = wpn(g); sitDown(g, 0, cg); sitDown(g, 1, wg); g.weapons.charge = 1; guardDebris(g);
    for (const slot of ENEMY_SLOTS) {
      g.stations.cursor[cg] = slot; g.stations.cursor[wg] = slot; g.science.scanning = 1;
      expect(() => { scienceInput(g, cg, -1, true); scanStep(g); isProductive(g, cg); g.rng.combat.s = 7; fireWeapon(g); g.weapons.charge = 1; }).not.toThrow();
    }
  });
});

describe('encounters (spec Demo-vi section 2)', () => {
  const fighting = (hull = ENEMY_HULL) => { const s = makeState(2); quiet(s); s.boarders.nextArrivalTick = 1e9; s.tick = s.enemy.nextArrivalTick; enemySystem(s); s.enemy.hull = hull; s.enemy.nextShotTick = 1e9; return s; };
  it('creation: encounter pending, encounterTick -1, no boost, no wins; the start node first arrival is unchanged', () => {
    const s = makeState(2);
    expect([s.run.encounter, s.run.encounterTick, s.run.driveBoost, s.telemetry.encountersWon]).toEqual([Encounter.Pending, -1, 0, 0]);
    for (const [p, first] of [[1, ENCOUNTER_FIRST_SMALL], [2, ENCOUNTER_FIRST_SMALL], [3, ENCOUNTER_FIRST], [4, ENCOUNTER_FIRST]] as const) expect(makeState(p, 1).enemy.nextArrivalTick).toBe(first * T);
  });
  it('arrival starts the fight: encounter 2 at the arrival tick', () => {
    const s = fighting();
    expect([s.enemy.present, s.run.encounter, s.run.encounterTick]).toEqual([1, Encounter.Fighting, s.tick]);
  });
  it('destroyed: won, +8 hull (capped at HULL_MAX), the drive boost, one win, NEVER, and no director draw', () => {
    for (const [hull0, hull1] of [[50, 50 + ENCOUNTER_REWARD_HULL], [95, HULL_MAX]] as const) {
      const s = fighting(10); s.hull = hull0; s.tick += 100; const d0 = s.rng.director.s;
      damageEnemy(s, ENEMY_SLOT, 50);
      expect([s.enemy.present, s.run.encounter, s.run.encounterTick, s.hull, s.run.driveBoost, s.telemetry.encountersWon, s.enemy.nextArrivalTick]).toEqual([0, Encounter.Won, s.tick, hull1, 1, 1, NEVER]);
      expect(s.rng.director.s).toBe(d0);
    }
    expect(ENCOUNTER_REWARD_HULL).toBe(8); expect(NEVER).toBe(2 ** 31 - 1);
  });
  it('a paid surrender is a win; a voided flee, a withdrawal and a jump end the encounter without reward', () => {
    const p = fighting(20); p.enemy.fleeing = 1; p.enemy.surrenderIntact = 1; p.enemy.departTick = p.tick + 1; p.hull = 60; p.tick += 1; enemySystem(p);
    expect([p.enemy.present, p.run.encounter, p.hull, p.run.driveBoost, p.telemetry.encountersWon, p.telemetry.surrenders, p.enemy.nextArrivalTick]).toEqual([0, Encounter.Won, 68, 1, 1, 1, NEVER]);
    const f = fighting(20); f.enemy.fleeing = 1; f.enemy.surrenderIntact = 0; f.enemy.departTick = f.tick + 1; f.hull = 60; f.tick += 1; enemySystem(f);
    expect([f.run.encounter, f.run.encounterTick, f.hull, f.run.driveBoost, f.telemetry.encountersWon, f.telemetry.enemyFled, f.enemy.nextArrivalTick]).toEqual([Encounter.Over, f.tick, 60, 0, 0, 1, NEVER]);
    const w = fighting(); w.hull = 60; w.tick = w.enemy.departTick; enemySystem(w);
    expect([w.enemy.present, w.run.encounter, w.run.encounterTick, w.hull, w.run.driveBoost, w.telemetry.encountersWon, w.enemy.nextArrivalTick]).toEqual([0, Encounter.Over, w.tick, 60, 0, 0, NEVER]);
    const j = fighting(); j.hull = 60; j.enemy.surrenderIntact = 0; leave(j, false);   // what jumpShip does with the enemy present
    expect([j.run.encounter, j.hull, j.run.driveBoost, j.telemetry.encountersWon, j.enemy.nextArrivalTick]).toEqual([Encounter.Over, 60, 0, 0, NEVER]);   // over, no reward; the jump then sets the next node's encounter (run.test)
  });
  it('one enemy per node: after the enemy withdraws nothing arrives for 600 s', () => {
    const s = fighting(); run(s, s.enemy.departTick - s.tick + 1);
    expect([s.enemy.present, s.run.encounter]).toEqual([0, Encounter.Over]);
    run(s, 600 * T);
    expect([s.enemy.present, s.telemetry.encounters, s.enemy.nextArrivalTick]).toEqual([0, 1, NEVER]);
  });
});

describe('the enemy interior: fires, breaches (spec Demo-viii section 2b, amendments I1-I4)', () => {
  const seedFor = (ok: (r: { s: number }) => boolean): number => { for (let seed = 1; seed <= 5000; seed++) if (ok(createRng(seed))) return seed; throw new Error('no seed'); };
  const sat = () => { const s = makeState(2); quiet(s); placeEnemy(s, ENEMY_HULL, 1); s.enemy.nextShotTick = 1e9; s.enemy.departTick = 1e9; s.run.encounter = Encounter.Fighting; const w = wpn(s); sitDown(s, 0, w); s.weapons.charge = 1; s.weapons.selector = Weapon.BeamF1; return { s, w }; };
  const fire = (slot: number, seed: number) => { const { s, w } = sat(); s.stations.cursor[w] = slot; s.rng.combat.s = seed; fireWeapon(s); return s; };
  it('the constants and rooms', () => {
    expect([ENEMY_ROOMS, EnemyRoom.Weapons, EnemyRoom.Engines, EnemyRoom.Shields, EnemyRoom.Bridge, EnemyRoom.Hold]).toEqual([5, 0, 1, 2, 3, 4]);
    expect([ENEMY_HIT_FIRE, ENEMY_HIT_BREACH, ENEMY_FIRE_SECONDS, ENEMY_BREACH_SECONDS, ENEMY_FIRE_HULL_DPS, ENEMY_FIRE_SYS_DPS, ENEMY_BREACH_HULL_DPS]).toEqual([0.35, 0.15, 15, 20, 0.3, 1.5, 0.2]);
    const s = makeState(2); expect([s.enemy.roomFire.length, s.enemy.roomBreach.length, ...s.enemy.roomFire, ...s.enemy.roomBreach].every((v, i) => (i < 2 ? v === 5 : v === 0))).toBe(true);
  });
  it('a system hit lands in its room: the hit draw then one problem draw (fire below 0.35, breach from 0.85, else nothing)', () => {
    for (const [want, ok] of [['fire', (u: number) => u < 0.35], ['breach', (u: number) => u >= 0.85], ['none', (u: number) => u >= 0.35 && u < 0.85]] as const) {
      const seed = seedFor((r) => nextFloat(r) < 0.3 && ok(nextFloat(r)));
      const s = fire(ENEMY_ENGINES_SLOT, seed), ref = createRng(seed); nextFloat(ref); nextFloat(ref);
      expect(s.rng.combat.s).toBe(ref.s);
      expect([s.enemy.roomFire[EnemyRoom.Engines], s.enemy.roomBreach[EnemyRoom.Engines]]).toEqual(want === 'fire' ? [ENEMY_FIRE_SECONDS, 0] : want === 'breach' ? [0, ENEMY_BREACH_SECONDS] : [0, 0]);
      expect(Array.from(s.enemy.roomFire).filter((v) => v > 0).length + Array.from(s.enemy.roomBreach).filter((v) => v > 0).length).toBe(want === 'none' ? 0 : 1);
    }
  });
  it('a hull hit lands in the Bridge or the Hold by one combat draw, before the problem draw; an existing fire resets to 15', () => {
    for (const room of [EnemyRoom.Bridge, EnemyRoom.Hold]) {
      const seed = seedFor((r) => nextFloat(r) < 0.3 && 3 + nextInt(r, 2) === room && nextFloat(r) < 0.35);
      const { s, w } = sat(); s.stations.cursor[w] = ENEMY_SLOT; s.rng.combat.s = seed; s.enemy.roomFire[room] = 2; fireWeapon(s);
      const ref = createRng(seed); nextFloat(ref); nextInt(ref, 2); nextFloat(ref);
      expect(s.rng.combat.s).toBe(ref.s); expect(s.enemy.roomFire[room]).toBe(ENEMY_FIRE_SECONDS);
    }
    const s = makeState(2); const seed = seedFor((r) => nextInt(r, 2) === 1); s.rng.combat.s = seed;
    expect(enemyRoomOfHit(s, ENEMY_SLOT)).toBe(EnemyRoom.Hold); expect(enemyRoomOfHit(s, ENEMY_SHIELDS_SLOT)).toBe(EnemyRoom.Shields); expect(enemyRoomOfHit(s, ENEMY_WEAPONS_SLOT)).toBe(EnemyRoom.Weapons);
  });
  it('a miss and a stripped layer make no draw beyond the hit draw', () => {
    const miss = seedFor((r) => nextFloat(r) > 0.97), s = fire(ENEMY_SLOT, miss), ref = createRng(miss); nextFloat(ref); expect(s.rng.combat.s).toBe(ref.s);
    const hit = seedFor((r) => nextFloat(r) < 0.3), { s: t, w } = sat(); t.weapons.selector = Weapon.BeamF2; t.stations.cursor[w] = ENEMY_SLOT; t.rng.combat.s = hit; fireWeapon(t);
    const r2 = createRng(hit); nextFloat(r2); expect(t.rng.combat.s).toBe(r2.s); expect(t.enemy.shieldLayers).toBe(0);
    for (const x of [s, t]) expect([...x.enemy.roomFire, ...x.enemy.roomBreach].every((v) => v === 0)).toBe(true);
  });
  it('a fire burns 0.3 hull and 1.5 system health per second and can take the system down with the shield rule; a plain room has no system', () => {
    const { s } = sat(); s.enemy.roomFire[EnemyRoom.Shields] = ENEMY_FIRE_SECONDS; const hull0 = s.enemy.hull;
    run(s, T); expect(s.enemy.hull).toBeCloseTo(hull0 - 0.3, 9); expect(s.enemy.sysHp[EnemySystem.Shields]).toBeCloseTo(ENEMY_SYS_HP - 1.5, 9);
    const d = sat().s; d.enemy.sysHp[EnemySystem.Shields] = 1; d.enemy.roomFire[EnemyRoom.Shields] = ENEMY_FIRE_SECONDS; const dis0 = d.telemetry.enemyDisables;
    run(d, T); expect(d.enemy.sysHp[EnemySystem.Shields]).toBe(0); expect(d.enemy.shieldLayers).toBe(0); expect(d.enemy.sysRepairTick[EnemySystem.Shields]).toBeGreaterThan(d.tick); expect(d.telemetry.enemyDisables).toBe(dis0 + 1);
    const h = sat().s; h.enemy.roomFire[EnemyRoom.Hold] = 5; run(h, T); expect(Array.from(h.enemy.sysHp)).toEqual([ENEMY_SYS_HP, ENEMY_SYS_HP, ENEMY_SYS_HP]);
  });
  it('a breach drains 0.2 hull per second and delays its system self-repair one tick per tick', () => {
    const { s } = sat(); disableSystem(s, EnemySystem.Engines); const due = s.enemy.sysRepairTick[EnemySystem.Engines]!; s.enemy.roomBreach[EnemyRoom.Engines] = ENEMY_BREACH_SECONDS; const hull0 = s.enemy.hull;
    run(s, T); expect(s.enemy.hull).toBeCloseTo(hull0 - 0.2, 9); expect(s.enemy.sysRepairTick[EnemySystem.Engines]).toBe(due + T);
  });
  it('timers count down and expire: fire after 15 s, breach after 20 s', () => {
    const { s } = sat(); s.enemy.roomFire[EnemyRoom.Hold] = ENEMY_FIRE_SECONDS; s.enemy.roomBreach[EnemyRoom.Bridge] = ENEMY_BREACH_SECONDS;
    run(s, ENEMY_FIRE_SECONDS * T - 1); expect(s.enemy.roomFire[EnemyRoom.Hold]).toBeGreaterThan(0);
    run(s, 1); expect(s.enemy.roomFire[EnemyRoom.Hold]).toBe(0);
    run(s, (ENEMY_BREACH_SECONDS - ENEMY_FIRE_SECONDS) * T); expect(s.enemy.roomBreach[EnemyRoom.Bridge]).toBe(0);
  });
  it('interior damage never voids a surrender and sets no hit flash', () => {
    const { s } = sat(); s.enemy.fleeing = 1; s.enemy.surrenderIntact = 1; s.enemy.roomFire[EnemyRoom.Bridge] = 10;
    run(s, T); expect([s.enemy.surrenderIntact, s.enemy.lastHitTick]).toEqual([1, -1]);
  });
  it('interior damage to 0 hull is a kill with the win reward, once, and no shot fires that tick', () => {
    const { s } = sat(); s.enemy.hull = 0.001; s.enemy.roomFire[EnemyRoom.Weapons] = 5; s.enemy.roomFire[EnemyRoom.Bridge] = 5; s.enemy.nextShotTick = s.tick; const scrap0 = s.run.scrap;
    expect(interiorStep(s)).toBe(true);
    expect([s.enemy.present, s.telemetry.enemiesDestroyed, s.run.scrap - scrap0, s.run.encounter, s.telemetry.encountersWon, shotsInFlight(s)]).toEqual([0, 1, SCRAP_ENEMY, Encounter.Won, 1, 0]);
    leave(s, true); expect([s.telemetry.enemiesDestroyed, s.run.scrap - scrap0, s.telemetry.encountersWon]).toEqual([1, SCRAP_ENEMY, 1]);
    const t = sat().s; t.enemy.hull = 0.001; t.enemy.roomFire[EnemyRoom.Hold] = 5; t.enemy.nextShotTick = t.tick; run(t, 1);
    expect([t.enemy.present, shotsInFlight(t), t.telemetry.enemiesDestroyed]).toEqual([0, 0, 1]);
    const q = sat().s; expect(interiorStep(q)).toBe(false);
  });
  it('a fire that drops Weapons to 0 blocks the shot due that tick', () => {
    const { s } = sat(); s.enemy.sysHp[EnemySystem.Weapons] = 0.01; s.enemy.roomFire[EnemyRoom.Weapons] = 5; s.enemy.nextShotTick = s.tick; run(s, 1);
    expect([s.enemy.sysHp[EnemySystem.Weapons], shotsInFlight(s)]).toEqual([0, 0]);
  });
  it('both arrays are cleared on arrival and on leave', () => {
    const { s } = sat(); s.enemy.roomFire.fill(3); s.enemy.roomBreach.fill(4); leave(s, false);
    expect([...s.enemy.roomFire, ...s.enemy.roomBreach].every((v) => v === 0)).toBe(true);
    s.enemy.roomFire.fill(3); s.enemy.roomBreach.fill(4); enemyArrive(s);
    expect([...s.enemy.roomFire, ...s.enemy.roomBreach].every((v) => v === 0)).toBe(true);
  });
  it('the snapshot round-trips both arrays; each alone changes the hash', () => {
    const { s } = sat(); s.enemy.roomFire[2] = 7.5; s.enemy.roomBreach[4] = 3.25;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(Array.from(t.enemy.roomFire)).toEqual([0, 0, 7.5, 0, 0]); expect(Array.from(t.enemy.roomBreach)).toEqual([0, 0, 0, 0, 3.25]); expect(hashState(t)).toBe(hashState(s));
    const a = sat().s, base = hashState(a); a.enemy.roomFire[0] = 1; expect(hashState(a)).not.toBe(base);
    const b = sat().s; b.enemy.roomBreach[0] = 1; expect(hashState(b)).not.toBe(base);
  });
});
