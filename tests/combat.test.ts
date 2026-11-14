import { describe, it, expect } from 'vitest';
import { heldStep as step } from './helpers/heldInput';
import { enemyMaxHull, enemyShieldMax, enemyWeaponCharge, fleeSecondsLeft, damageEnemy, EnemySystem, leave } from '../src/renderer/src/sim/enemy';
import { spawnShot, debrisSystem, spawnDebris } from '../src/renderer/src/sim/debris';
import { ENEMY_SLOT, ENEMY_SHIELDS_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { failStation } from '../src/renderer/src/sim/power';
import { fireWeapon, Weapon } from '../src/renderer/src/sim/weapons';
import { jumpShip, reachable } from '../src/renderer/src/sim/run';
import { createRng, nextFloat, nextInt, type RngState } from '../src/shared/rng';
import { TICK_HZ, ENEMY_FIRST_SHOT, ENEMY_HULL, ENEMY_BEAM_DAMAGE, ENEMY_TORP_DAMAGE, ENEMY_SYS_HP, ENEMY_FLEE_DELAY, scrapSurrender, scrapEnemy, FREQ_COUNT, ENEMY_SHOT_FLIGHT, ENEMY_SHOT_JITTER, SHOT_BREACH_FIRST } from '../src/renderer/src/sim/tuning';
import { makeState, quiet, placeEnemy, placeShot, placeDebris, run, disableSystem, wake } from './helpers/sim';

const T = TICK_HZ;
const wpn = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Weapons]!;
/** The first seed in 1..200 whose first float satisfies the predicate (spec Demo-i section 11.5: choose the state, not the selector). */
const seedWhere = (ok: (u: number) => boolean): number => { for (let seed = 1; seed <= 200; seed++) if (ok(nextFloat(createRng(seed)))) return seed; throw new Error('no seed'); };
const HIT_SEED = seedWhere((u) => u < 0.5), MISS_SEED = seedWhere((u) => u > 0.95);

/** Weapons seated, charged, cursor on the enemy hull row, selector BeamF1 (tuned when shieldFreq is 1); the director silenced and no shot due. */
function armed(hull = ENEMY_HULL, shieldFreq = 1) {
  const s = makeState(2); quiet(s); placeEnemy(s, hull, shieldFreq); s.enemy.nextShotTick = 1e9;
  const w = wpn(s); sitDown(s, 0, w); s.stations.cursor[w] = ENEMY_SLOT; s.weapons.charge = 1; s.weapons.selector = Weapon.BeamF1;
  return { s, w };
}

describe('combat: arrival, scaling and the weapon charge', () => {
  it('column 0: maxHull 100, one layer, the first shot armed, the charge 0 on arrival and 1 when due; column 5: 150 and two layers; weapons down reads 0', () => {
    for (const [column, maxHull, layers] of [[0, 100, 1], [5, 150, 2]] as const) {
      const s = makeState(2); quiet(s); wake(s); s.run.column = column; s.enemy.nextArrivalTick = s.tick; const t = s.tick;
      step(s, []);
      expect([s.enemy.present, s.enemy.maxHull, s.enemy.hull, s.enemy.shieldLayers, s.enemy.shieldRecharge, s.enemy.fleeing, s.enemy.surrenderIntact]).toEqual([1, maxHull, maxHull, layers, 0, 0, 0]);
      expect([enemyMaxHull(column), enemyShieldMax(column)]).toEqual([maxHull, layers]);
      expect(s.enemy.shotArmTick).toBe(t); expect(s.enemy.nextShotTick).toBe(t + ENEMY_FIRST_SHOT * T);
      const now = s.tick; s.tick = t; expect(enemyWeaponCharge(s)).toBe(0); s.tick = s.enemy.nextShotTick; expect(enemyWeaponCharge(s)).toBe(1);
      s.tick = t + ENEMY_FIRST_SHOT * T * 2; expect(enemyWeaponCharge(s)).toBe(1);   // clamped
      s.enemy.sysHp[EnemySystem.Weapons] = 0; expect(enemyWeaponCharge(s)).toBe(0); s.tick = now;
    }
    expect(enemyShieldMax(99)).toBe(2); expect(enemyWeaponCharge(makeState(2))).toBe(0);
  });
});

describe('combat: shield recharge', () => {
  const placed = () => { const s = makeState(2); quiet(s); s.run.column = 5; placeEnemy(s); s.enemy.nextShotTick = 1e9; return s; };
  it('one layer returns after 6 x 60 steps; full layers stay at recharge 0; down shields with no layers never recharge; a shield repair restarts from 0', () => {
    const s = placed(); expect(s.enemy.shieldLayers).toBe(2); s.enemy.shieldLayers = 1;
    run(s, 6 * T); expect([s.enemy.shieldLayers, s.enemy.shieldRecharge]).toEqual([2, 0]);
    run(s, 100); expect([s.enemy.shieldLayers, s.enemy.shieldRecharge]).toEqual([2, 0]);
    const d = placed(); disableSystem(d, EnemySystem.Shields); d.enemy.shieldLayers = 0; run(d, 7 * T); expect([d.enemy.shieldLayers, d.enemy.shieldRecharge]).toEqual([0, 0]);
    const r = placed(); disableSystem(r, EnemySystem.Shields); r.enemy.shieldLayers = 0; r.enemy.sysRepairTick[EnemySystem.Shields] = r.tick; step(r, []);
    expect([r.enemy.sysHp[EnemySystem.Shields], r.enemy.shieldLayers]).toEqual([ENEMY_SYS_HP, 0]);   // the repair tick: layers 0, recharge restarts (one tick of progress)
    expect(r.enemy.shieldRecharge).toBeCloseTo(1 / 360, 12);
    run(r, 6 * T); expect(r.enemy.shieldLayers).toBe(1);
  });
});

describe('combat: beams against shield layers', () => {
  it('an untuned hit strips a layer with one combat draw and no hull damage; a second at layers 0 damages; a tuned hit pierces; a miss does nothing', () => {
    const { s } = armed(ENEMY_HULL, 2); s.weapons.selector = Weapon.BeamF1; s.rng.combat.s = HIT_SEED;   // BeamF1 against frequency 2: untuned
    const one = createRng(HIT_SEED); nextFloat(one);
    expect(fireWeapon(s)).toBe(true);
    expect([s.enemy.shieldLayers, s.enemy.shieldRecharge, s.enemy.hull, s.telemetry.shieldHits, s.telemetry.hits, s.telemetry.shots, s.weapons.charge]).toEqual([0, 0, ENEMY_HULL, 1, 1, 1, 0]);
    expect(s.rng.combat.s).toBe(one.s); expect(s.skills.lastShotTick).toBe(s.tick);
    s.weapons.charge = 1; s.rng.combat.s = HIT_SEED;
    expect(fireWeapon(s)).toBe(true);
    expect([s.enemy.hull, s.telemetry.hits, s.telemetry.shieldHits, s.telemetry.shots]).toEqual([ENEMY_HULL - ENEMY_BEAM_DAMAGE, 2, 1, 2]);
    const t = armed(ENEMY_HULL, 1); t.s.rng.combat.s = HIT_SEED;   // BeamF1 against frequency 1: tuned
    expect(fireWeapon(t.s)).toBe(true); expect([t.s.enemy.hull, t.s.enemy.shieldLayers, t.s.telemetry.shieldHits, t.s.telemetry.hits]).toEqual([ENEMY_HULL - ENEMY_BEAM_DAMAGE, 1, 0, 1]);
    for (const freq of [1, 2]) {
      const m = armed(ENEMY_HULL, freq); m.s.rng.combat.s = MISS_SEED; const c1 = createRng(MISS_SEED); nextFloat(c1);
      expect(fireWeapon(m.s)).toBe(false);
      expect([m.s.enemy.hull, m.s.enemy.shieldLayers, m.s.telemetry.shots, m.s.telemetry.hits, m.s.telemetry.shieldHits, m.s.weapons.charge]).toEqual([ENEMY_HULL, 1, 1, 0, 0, 0]); expect(m.s.rng.combat.s).toBe(c1.s);
    }
  });
  it('shields down: every selector pierces; a torpedo hits the hull for 35 and leaves the layers; damaging the shield system to 0 zeroes the layers', () => {
    const d = armed(ENEMY_HULL, 2); disableSystem(d.s, EnemySystem.Shields); d.s.rng.combat.s = HIT_SEED;
    expect(fireWeapon(d.s)).toBe(true); expect([d.s.enemy.hull, d.s.telemetry.shieldHits]).toEqual([ENEMY_HULL - ENEMY_BEAM_DAMAGE, 0]);
    const t = armed(ENEMY_HULL, 2); t.s.weapons.selector = Weapon.Torpedo; t.s.weapons.torpedoLoaded = 1; t.s.rng.combat.s = HIT_SEED;
    expect(fireWeapon(t.s)).toBe(true); expect([t.s.enemy.hull, t.s.enemy.shieldLayers, t.s.telemetry.shieldHits]).toEqual([ENEMY_HULL - ENEMY_TORP_DAMAGE, 1, 0]);
    const k = armed(); k.s.enemy.shieldRecharge = 0.5; damageEnemy(k.s, ENEMY_SHIELDS_SLOT, 30);
    expect([k.s.enemy.sysHp[EnemySystem.Shields], k.s.enemy.shieldLayers, k.s.enemy.shieldRecharge]).toEqual([0, 0, 0]);
  });
});

describe('combat: aimed shots', () => {
  const quietConsoles = () => { const s = makeState(2); quiet(s); placeEnemy(s); s.enemy.nextShotTick = 1e9; for (let i = 0; i < s.stations.level.length; i++) { const k = s.derived.stationKind[i]; if (k !== StationKind.Weapons && k !== StationKind.Engineering) s.stations.level[i] = 0; } return s; };
  const consoleRooms = (s: ReturnType<typeof makeState>): number[] => { const out: number[] = []; for (let i = 0; i < s.stations.level.length; i++) if (s.stations.failed[i] === 0 && s.stations.level[i]! > 0) { const r = s.derived.roomOfTile[s.derived.stationTile[i]!]!; if (!out.includes(r)) out.push(r); } return out; };
  const advanceShot = (hz: RngState) => { nextFloat(hz); nextInt(hz, FREQ_COUNT); };   // the flight float and the frequency
  it('u < 0.6 picks among the console rooms and u >= 0.6 any room; either way four hazards draws', () => {
    const lowSeed = seedWhere((u) => u < 0.6), highSeed = seedWhere((u) => u >= 0.6);
    for (const seed of [lowSeed, highSeed]) {
      const s = quietConsoles(); const rooms = consoleRooms(s); expect(rooms.length).toBe(2); s.rng.hazards.s = seed;
      const hz = createRng(seed), u = nextFloat(hz); const want = u < 0.6 ? rooms[nextInt(hz, rooms.length)]! : nextInt(hz, s.derived.volume.length);
      const flight = ENEMY_SHOT_FLIGHT + (2 * nextFloat(hz) - 1) * ENEMY_SHOT_JITTER, freq = 1 + nextInt(hz, FREQ_COUNT);
      const slot = spawnShot(s);
      expect(s.debris.room[slot]).toBe(want); expect(s.debris.frequency[slot]).toBe(freq); expect(s.debris.impactTick[slot]).toBe(s.tick + Math.round(flight * T)); expect(s.rng.hazards.s).toBe(hz.s);
      if (u < 0.6) expect(rooms).toContain(s.debris.room[slot]);
    }
    const none = quietConsoles(); for (let i = 0; i < none.stations.level.length; i++) failStation(none, i);
    expect(consoleRooms(none)).toEqual([]); none.rng.hazards.s = lowSeed;
    const hz = createRng(lowSeed); nextFloat(hz); const want = nextInt(hz, none.derived.volume.length); advanceShot(hz);
    const slot = spawnShot(none); expect(none.debris.room[slot]).toBe(want); expect(none.rng.hazards.s).toBe(hz.s);
    const d = quietConsoles(); const dz = createRng(d.rng.hazards.s); const dr = nextInt(dz, d.derived.volume.length); advanceShot(dz); const ds = spawnDebris(d);   // debris keeps three draws and the uniform room
    expect(d.debris.room[ds]).toBe(dr); expect(d.rng.hazards.s).toBe(dz.s);
  });
  it('a shot impact makes one extra hazards draw per online console in the room and fails it below 0.5; debris never does', () => {
    const base = () => { const s = makeState(1); quiet(s); for (let i = 0; i < s.stations.level.length; i++) if (s.derived.stationKind[i] !== StationKind.Weapons) s.stations.level[i] = 0; return s; };
    const failSeed = seedWhere((u) => u < 0.5), keepSeed = seedWhere((u) => u >= 0.5);
    for (const [seed, fails] of [[failSeed, true], [keepSeed, false]] as const) {
      const s = base(), w = wpn(s), R = s.derived.roomOfTile[s.derived.stationTile[w]!]!; s.rng.hazards.s = seed; placeShot(s, R, 0); debrisSystem(s);
      expect(s.stations.failed[w]).toBe(fails ? 1 : 0);
      const d = base(); const hz = createRng(seed); nextFloat(hz); d.rng.hazards.s = hz.s; placeDebris(d, R, 0); debrisSystem(d);   // a debris impact: the stream minus the one console draw
      expect(s.rng.hazards.s).toBe(d.rng.hazards.s); expect(d.stations.failed[w]).toBe(0);
    }
    const e = base(), w = wpn(e), R = e.derived.roomOfTile[e.derived.stationTile[w]!]!; e.rng.hazards.s = failSeed; placeDebris(e, R, 0); debrisSystem(e); expect(e.stations.failed[w]).toBe(0);
  });
});

describe('combat: flee and surrender', () => {
  /** A tuned beam (BeamF1 against frequency 1) fired directly; the rest runs through step. */
  const fleer = (hull: number) => { const f = armed(hull, 1); f.s.enemy.departTick = f.s.tick + 600 * T; return f; };
  const shoot = (s: ReturnType<typeof makeState>) => { s.weapons.charge = 1; s.rng.combat.s = HIT_SEED; return fireWeapon(s); };
  it('a beam to hull 25 starts the flee on the next tick; 26 does not; engines down at the crossing blocks it', () => {
    const { s } = fleer(40); expect(s.enemy.maxHull).toBe(100);
    expect(shoot(s)).toBe(true); expect(s.enemy.hull).toBe(25); expect(s.enemy.fleeing).toBe(0);
    const t0 = s.tick; step(s, []);
    expect([s.enemy.fleeing, s.enemy.surrenderIntact, s.enemy.departTick, s.telemetry.surrenderOffers]).toEqual([1, 1, t0 + ENEMY_FLEE_DELAY * T, 1]);
    const n = fleer(41); shoot(n.s); expect(n.s.enemy.hull).toBe(26); step(n.s, []); expect([n.s.enemy.fleeing, n.s.telemetry.surrenderOffers]).toEqual([0, 0]);
    const d = fleer(25); disableSystem(d.s, EnemySystem.Engines); step(d.s, []); expect([d.s.enemy.fleeing, d.s.telemetry.surrenderOffers]).toEqual([0, 0]);
  });
  it('untouched for the countdown: the enemy leaves and pays the surrender bounty', () => {
    const { s } = fleer(25); const t0 = s.tick, scrap0 = s.run.scrap; step(s, []);
    expect(s.enemy.departTick).toBe(t0 + 480); expect(fleeSecondsLeft(s)).toBe(8);
    while (s.enemy.present && s.tick < t0 + 600) step(s, []);
    expect(s.enemy.present).toBe(0); expect(s.tick).toBe(t0 + 481);
    expect([s.telemetry.surrenders, s.telemetry.enemyFled, s.telemetry.enemiesDestroyed, s.run.scrap - scrap0]).toEqual([1, 0, 0, scrapSurrender(s.run.column)]);
    expect([s.enemy.maxHull, s.enemy.shieldLayers, s.enemy.shieldRecharge, s.enemy.shotArmTick, s.enemy.fleeing, s.enemy.surrenderIntact]).toEqual([0, 0, 0, -1, 0, 0]);
  });
  it('a damaging hit during the flee voids the surrender: the departure counts a flee and pays nothing', () => {
    const { s } = fleer(40); shoot(s); step(s, []); const scrap0 = s.run.scrap;
    expect(shoot(s)).toBe(true); expect(s.enemy.surrenderIntact).toBe(0); expect(s.enemy.fleeing).toBe(1);
    while (s.enemy.present && s.tick < 2000) step(s, []);
    expect([s.telemetry.enemyFled, s.telemetry.surrenders, s.run.scrap - scrap0, s.telemetry.surrenderOffers]).toEqual([1, 0, 0, 1]);
  });
  it('a kill during the flee pays the kill, not the surrender', () => {
    const { s } = fleer(25); step(s, []); s.enemy.hull = 15; const scrap0 = s.run.scrap;
    expect(shoot(s)).toBe(true);
    expect([s.enemy.present, s.telemetry.enemiesDestroyed, s.telemetry.surrenders, s.telemetry.enemyFled, s.run.scrap - scrap0]).toEqual([0, 1, 0, 0, scrapEnemy(s.run.column)]);
  });
  it('a jump during an intact flee counts a flee and pays no surrender scrap; downed engines stop the clock', () => {
    const j = fleer(25); step(j.s, []); expect(j.s.enemy.fleeing).toBe(1);
    const c = makeState(2); quiet(c); const cs0 = c.run.scrap; jumpShip(c, reachable(c)[0]!);   // control: the jump's own scrap
    const s0 = j.s.run.scrap; jumpShip(j.s, reachable(j.s)[0]!);
    expect([j.s.enemy.present, j.s.telemetry.enemyFled, j.s.telemetry.surrenders, j.s.run.scrap - s0]).toEqual([0, 1, 0, c.run.scrap - cs0]);
    const e = fleer(25); step(e.s, []); disableSystem(e.s, EnemySystem.Engines); const dep = e.s.enemy.departTick; step(e.s, []); step(e.s, []);
    expect(e.s.enemy.departTick).toBe(dep + 2);
  });
  it('fleeSecondsLeft counts down from the departure tick and is 0 when not fleeing', () => {
    const { s } = armed(); expect(fleeSecondsLeft(s)).toBe(0);
    s.enemy.fleeing = 1; s.enemy.departTick = s.tick + 7 * T; expect(fleeSecondsLeft(s)).toBe(7); s.enemy.departTick = s.tick + 7 * T - 1; expect(fleeSecondsLeft(s)).toBe(7); s.enemy.departTick = s.tick + 6 * T; expect(fleeSecondsLeft(s)).toBe(6);
    s.enemy.present = 0; expect(fleeSecondsLeft(s)).toBe(0);
  });
});

describe('combat: the hit stamp (spec Demo-ii section 4)', () => {
  it('lastHitTick is -1 after placeEnemy and after leave; damageEnemy, a shield strip and a torpedo hit stamp state.tick', () => {
    const p = makeState(2); placeEnemy(p); expect(p.enemy.lastHitTick).toBe(-1);
    const d = makeState(2); placeEnemy(d); d.tick = 77; damageEnemy(d, ENEMY_SLOT, 15); expect(d.enemy.lastHitTick).toBe(77);
    const { s } = armed(ENEMY_HULL, 2); s.tick = 123; s.rng.combat.s = HIT_SEED;   // BeamF1 against frequency 2: an untuned hit strips a layer
    expect(fireWeapon(s)).toBe(true); expect([s.telemetry.shieldHits, s.enemy.lastHitTick]).toEqual([1, 123]);
    const t = armed(ENEMY_HULL, 2); t.s.tick = 200; t.s.weapons.selector = Weapon.Torpedo; t.s.weapons.torpedoLoaded = 1; t.s.rng.combat.s = HIT_SEED;
    expect(fireWeapon(t.s)).toBe(true); expect(t.s.enemy.lastHitTick).toBe(200);
    leave(t.s, false); expect(t.s.enemy.lastHitTick).toBe(-1);
    const a = makeState(2); quiet(a); a.run.column = 0; a.enemy.nextArrivalTick = a.tick; step(a, []); expect(a.enemy.lastHitTick).toBe(-1);
  });
});

describe('combat: hits make fires (spec Demo-vi section 3)', () => {
  const G = (s: ReturnType<typeof makeState>) => s.derived.roomIndex.get('G')!;   // no console in Crew Quarters: the impact roll is the first hazards draw
  const site = (s: ReturnType<typeof makeState>) => Array.from(s.derived.siteRoom).indexOf(G(s));
  const impact = (kind: 'shot' | 'debris', seed: number) => { const s = makeState(0); quiet(s); s.rng.hazards.s = seed; if (kind === 'shot') placeShot(s, G(s), 0); else placeDebris(s, G(s), 0); debrisSystem(s); return { fire: s.rooms.fire[G(s)]! > 0, breach: s.breaches.active[site(s)] === 1 }; };
  it('a shot tries a fire first unless u < SHOT_BREACH_FIRST (0.25); debris keeps 50/50; the draw is made either way', () => {
    expect(SHOT_BREACH_FIRST).toBe(0.25);
    const low = seedWhere((u) => u < 0.25), mid = seedWhere((u) => u >= 0.25 && u < 0.5), high = seedWhere((u) => u >= 0.5);
    expect(impact('shot', low)).toEqual({ fire: false, breach: true });
    expect(impact('shot', mid)).toEqual({ fire: true, breach: false });
    expect(impact('shot', high)).toEqual({ fire: true, breach: false });
    expect(impact('debris', mid)).toEqual({ fire: false, breach: true });
    expect(impact('debris', high)).toEqual({ fire: true, breach: false });
    const s = makeState(0); quiet(s); s.rng.hazards.s = mid; const hz = createRng(mid); nextFloat(hz); placeShot(s, G(s), 0); debrisSystem(s); expect(s.rng.hazards.s).toBe(hz.s);
  });
});
