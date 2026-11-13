import { describe, it, expect } from 'vitest';
import { sectorJump, startWait, navRows, overrun, requestJump, EXIT_JUMP, atExit } from '../src/renderer/src/sim/run';
import { enemySystem, enemyMaxHull, enemyShieldMax, enemyShieldCap, fireInterval, damageEnemy, Encounter, EnemySystem, EnemyRoom } from '../src/renderer/src/sim/enemy';
import { ENEMY_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { depthOf, peaceful } from '../src/renderer/src/sim/depth';
import { minutesOf, directorSystem, spawnInterval } from '../src/renderer/src/sim/director';
import { EndReason, downCrew } from '../src/renderer/src/sim/crew';
import { saveSnapshot, loadSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { createRng, nextFloat } from '../src/shared/rng';
import { TICK_HZ, SECTORS, SECTOR_COLUMNS, ENCOUNTER_START, ENCOUNTER_MAX, ENEMY_FIRE_JITTER, SPAWN_JITTER, ENCOUNTER_SPAWN_MULT, NEVER, WARDEN_HULL_MULT, WARDEN_FIRE_MULT, WARDEN_SHIELD_EXTRA, SHIELD_RECHARGE_TIME } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, mapM, chargeJump, armSpawn, LAYOUT } from './helpers/sim';

// Spec Loop-iv sections 1, 2 and 4: the final beacon past the last exit and the Warden that guards it.
const T = TICK_HZ;
/** At the last sector's exit with a charged drive: a quiet director and no boarders. */
const lastExit = (players = 2, seed = 1) => { const s = makeState(players, seed); quiet(s); mapM(s); s.run.sector = SECTORS - 1; s.run.column = SECTOR_COLUMNS - 1; s.run.node = 0; chargeJump(s); return s; };
/** Engaged: the jump to the final beacon, boarders held off. */
const engaged = (players = 2, seed = 1) => { const s = lastExit(players, seed); sectorJump(s); s.boarders.nextArrivalTick = 1e9; return s; };
/** The Warden present (arrived by the normal rule ENCOUNTER_START seconds after the jump). */
const withWarden = (players = 2, seed = 1) => { const s = engaged(players, seed); run(s, ENCOUNTER_START * T + 1); return s; };

describe('the final beacon (spec Loop-iv section 1)', () => {
  it('the last exit\'s jump costs 1 fuel and moves the crew to the final beacon: no win, no arrival scrap or loot draw, a contact ENCOUNTER_START seconds out', () => {
    const s = lastExit(); const fuel = s.run.fuel, scrap = s.run.scrap, jumps = s.telemetry.jumps, loot = s.rng.loot.s;
    sectorJump(s);
    expect([s.run.finalBeacon, s.ended, s.run.fuel, s.telemetry.jumps, s.run.scrap, s.rng.loot.s, s.run.sector, s.run.column]).toEqual([1, 0, fuel - 1, jumps + 1, scrap, loot, SECTORS - 1, SECTOR_COLUMNS - 1]);
    expect([s.run.encounter, s.enemy.nextArrivalTick, s.run.jumpCharge, s.run.calm, s.run.pursuitFought]).toEqual([Encounter.Pending, s.tick + ENCOUNTER_START * T, 0, 0, 0]);
    expect(atExit(s)).toBe(false);
    const early = makeState(2); quiet(early); mapM(early); early.run.column = SECTOR_COLUMNS - 1; chargeJump(early); sectorJump(early);
    expect([early.run.finalBeacon, early.run.sector]).toEqual([0, 1]);   // an earlier sector's exit still goes to the next sector
  });
  it('never calm, never overrun: the pursuit far ahead changes nothing and the Warden arrives, not the elite', () => {
    const s = engaged(); s.run.pursuit = 99;
    expect([overrun(s, s.run.column), peaceful(s)]).toEqual([false, false]);
    run(s, ENCOUNTER_START * T + 1);
    expect([s.enemy.present, s.run.pursuitFought, s.run.encounter]).toEqual([1, 0, Encounter.Fighting]);
  });
  it('no escape: the drive never charges, Navigation offers no way on (fuel or none), the exit jump, a wait and a requested jump are refused', () => {
    const s = engaged(); run(s, 60 * T);
    expect(s.run.jumpCharge).toBe(0);
    expect(navRows(s).map((r) => r.select)).toEqual(['evade']);
    s.run.fuel = 0; expect(navRows(s).map((r) => r.select)).toEqual(['evade']);
    expect(startWait(s)).toBe(false); expect(s.run.waitUntilTick).toBe(-1);
    s.run.fuel = 3; s.run.jumpCharge = 1; const jumps = s.telemetry.jumps; sectorJump(s); requestJump(s, EXIT_JUMP);
    expect([s.run.fuel, s.telemetry.jumps, s.run.finalBeacon, s.ended, s.run.jumpPending]).toEqual([3, jumps, 1, 0, -1]);
  });
  it('the director keeps running there, at its fight rate once the Warden is fighting', () => {
    const s = withWarden(); armSpawn(s); s.run.encounter = Encounter.Fighting;
    const d = createRng(s.rng.director.s), u = nextFloat(d);
    directorSystem(s);
    expect(s.director.nextSpawnTick).toBe(s.tick + Math.round(spawnInterval(minutesOf(s), 2) * ENCOUNTER_SPAWN_MULT * T * (1 + SPAWN_JITTER * (2 * u - 1))));
  });
});

describe('the Warden (spec Loop-iv section 2)', () => {
  it('its numbers: 1.5 x the final depth\'s hull, one shield layer over the depth\'s maximum (recharged to it), the fire interval x 0.7, no withdrawal clock', () => {
    expect([WARDEN_HULL_MULT, WARDEN_FIRE_MULT, WARDEN_SHIELD_EXTRA]).toEqual([1.5, 0.7, 1]);
    const s = withWarden(), e = s.enemy, depth = depthOf(s);
    expect(depth).toBe(SECTORS * SECTOR_COLUMNS - 1);
    expect([e.maxHull, e.hull, e.shieldLayers, enemyShieldCap(s), e.departTick]).toEqual([Math.round(enemyMaxHull(depth) * WARDEN_HULL_MULT), Math.round(enemyMaxHull(depth) * WARDEN_HULL_MULT), enemyShieldMax(depth) + 1, enemyShieldMax(depth) + 1, NEVER]);
    e.shieldLayers = 0; e.shieldRecharge = 0; e.nextShotTick = 1e9;
    run(s, (enemyShieldMax(depth) + 1) * SHIELD_RECHARGE_TIME * T); expect(e.shieldLayers).toBe(enemyShieldMax(depth) + 1);
    run(s, SHIELD_RECHARGE_TIME * T); expect(e.shieldLayers).toBe(enemyShieldMax(depth) + 1);
    const f = withWarden(); f.tick = f.enemy.nextShotTick; const dr = createRng(f.rng.director.s), u = nextFloat(dr), minutes = minutesOf(f);
    enemySystem(f);
    expect(f.enemy.nextShotTick).toBe(f.tick + Math.round(fireInterval(minutes, 2) * WARDEN_FIRE_MULT * T * (1 + ENEMY_FIRE_JITTER * (2 * u - 1))));
  });
  it('an ordinary enemy elsewhere keeps its numbers', () => {
    const s = makeState(2); quiet(s); mapM(s); s.run.sector = 1; s.run.column = 3; s.run.calm = 0; s.run.wakeTick = 0; s.enemy.nextArrivalTick = s.tick; run(s, 1);
    expect([s.enemy.maxHull, s.enemy.shieldLayers, enemyShieldCap(s), s.enemy.departTick]).toEqual([enemyMaxHull(9), enemyShieldMax(9), enemyShieldMax(9), s.tick - 1 + ENCOUNTER_MAX * T]);
  });
  it('never flees or surrenders: below the flee threshold with engines up it fights on, and it never withdraws (engines down or not)', () => {
    const s = withWarden(); s.enemy.nextShotTick = 1e9; s.enemy.hull = Math.round(s.enemy.maxHull * 0.1);
    run(s, (ENCOUNTER_MAX + 10) * T);
    expect([s.enemy.present, s.enemy.fleeing, s.enemy.surrenderIntact, s.telemetry.surrenderOffers, s.ended]).toEqual([1, 0, 0, 0, 0]);
    s.enemy.sysHp[EnemySystem.Engines] = 0; s.enemy.sysRepairTick[EnemySystem.Engines] = 1e9; run(s, 60);
    expect([s.enemy.present, s.enemy.departTick]).toEqual([1, NEVER]);
  });
  it('destroying it wins the run: Victory, with no scrap, fuel or loot draw', () => {
    const s = withWarden(); const scrap = s.run.scrap, fuel = s.run.fuel, loot = s.rng.loot.s;
    damageEnemy(s, ENEMY_SLOT, s.enemy.hull);
    expect([s.ended, s.endReason, s.run.scrap, s.run.fuel, s.rng.loot.s, s.telemetry.enemiesDestroyed, s.weapons.lootTick]).toEqual([1, EndReason.Victory, scrap, fuel, loot, 1, -1]);
    const t = s.tick; run(s, 3); expect(s.tick).toBe(t);
  });
  it('destroyed by its own interior fire it also wins', () => {
    const s = withWarden(); s.enemy.hull = 0.001; s.enemy.roomFire[EnemyRoom.Bridge] = 5;
    run(s, 1);
    expect([s.ended, s.endReason]).toEqual([1, EndReason.Victory]);
  });
  it('the usual defeats stand: hull 0, or the crew down', () => {
    const h = withWarden(); h.hull = 0; run(h, 1); expect([h.ended, h.endReason]).toEqual([1, EndReason.Hull]);
    const c = withWarden(); downCrew(c, 0); downCrew(c, 1); run(c, 1); expect([c.ended, c.endReason]).toEqual([1, EndReason.Crew]);
  });
});

describe('snapshot: the final beacon (spec Loop-iv section 4)', () => {
  it('finalBeacon round-trips and alone changes the hash', () => {
    const s = withWarden();
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(hashState(t)).toBe(hashState(s)); expect(t.run.finalBeacon).toBe(1);
    const a = makeState(2, 7), b = makeState(2, 7); b.run.finalBeacon = 1;
    expect(a.run.finalBeacon).toBe(0); expect(hashState(b)).not.toBe(hashState(a));
  });
});
