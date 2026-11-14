import { fixtureCouchViewer } from './helpers/cardUi';
import { weaponSelection, fireFixtureWeapon, weaponsDirection } from './helpers/weaponFixture';
import { snapshotPhaseStep as propertyPhaseStep } from './helpers/snapshotPhaseFixture';
import { describe, it, expect } from 'vitest';
import { LOCK_SECONDS, LOCK_HIT_BONUS, ENEMY_SYS_HP } from '../src/renderer/src/sim/tuning';
import { enemyBeamThreshold, EnemySystem } from '../src/renderer/src/sim/enemy';
import { buildHudModel, type WeaponsPanel } from '../src/renderer/src/render/hudModel';
import fc from 'fast-check';
import { beamHits, torpedoHits, chargeBeam, Weapon } from '../src/renderer/src/sim/weapons';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Seated } from '../src/renderer/src/sim/components';
import { BEAM_CHARGE_TIME, DT, TORP_CAP, TORP_LOAD_TIME, ENEMY_HULL } from '../src/renderer/src/sim/tuning';
import { warnedTargets, ENEMY_SLOT, ENEMY_WEAPONS_SLOT, ENEMY_SHIELDS_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { makeState, intents, run, placeDebris, room, seconds, placeEnemy } from './helpers/sim';
import { createRng, nextFloat } from '../src/shared/rng';

const wpn = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Weapons]!;
const up = { moveY: -1 }, down = { moveY: 1 }, left = { moveX: -1 }, right = { moveX: 1 }, confirm = { confirmPressed: true };

describe('beam charge', () => {
  it('progresses only while seated and online, scales with level, is kept on stand and on failure', () => {
    const s = makeState(1), i = wpn(s);
    s.director.nextSpawnTick = 1e9;
    run(s, 10);
    expect(s.weapons.charge).toBe(0);                                              // nobody seated
    sitDown(s, 0, i);                                                              // starter level 2: output 0.5
    run(s, 1);
    expect(s.weapons.charge).toBeCloseTo(DT * 0.5 / BEAM_CHARGE_TIME);
    run(s, seconds(12) + 1);
    expect(s.weapons.charge).toBe(1);
    run(s, 1, () => intents({ cancelPressed: true }));
    run(s, 30);
    expect(s.weapons.charge).toBe(1);                                              // kept while standing
    s.weapons.charge = 0.3; sitDown(s, 0, i); failStation(s, i); run(s, 30);
    expect(s.weapons.charge).toBe(0.3); expect(Seated.station[s.crew[0]!]).toBe(-1);   // failure stood the operator and froze the charge
    const t = makeState(1), j = wpn(t); t.stations.level[j] = 3; sitDown(t, 0, j);
    chargeBeam(t);
    expect(t.weapons.charge).toBeCloseTo(DT * 0.75 / BEAM_CHARGE_TIME);
  });
});

describe('targeting', () => {
  it('sitting selects the smallest warned StableId or -1; the first warning auto-selects; up/down cycle and wrap', () => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A');
    s.director.nextSpawnTick = 1e9;
    sitDown(s, 0, i);
    expect(weaponSelection(s).cursor).toBe(-1);
    run(s, 10, () => intents(down));
    expect(weaponSelection(s).cursor).toBe(-1);                                         // stick does nothing with no targets
    placeDebris(s, A, seconds(3));                                                 // inside the unmanned lead: warned next tick
    run(s, 1);
    expect(s.debris.warned[0]).toBe(1); expect(weaponSelection(s).cursor).toBe(0);      // auto-selected
    placeDebris(s, A, 600, 1, 50); placeDebris(s, A, 600, 1, 40);                   // slots 1 (id 50) and 2 (id 40); slot 0 has the smallest id
    run(s, 1, () => intents(down)); run(s, 1, () => intents({}));
    expect(weaponSelection(s).cursor).toBe(2);                                          // next by id: 40
    run(s, 1, () => intents(down)); run(s, 1, () => intents({}));
    expect(weaponSelection(s).cursor).toBe(1);                                          // 50
    run(s, 1, () => intents(down)); run(s, 1, () => intents({}));
    expect(weaponSelection(s).cursor).toBe(0);                                          // wraps
    run(s, 1, () => intents(up)); run(s, 1, () => intents({}));
    expect(weaponSelection(s).cursor).toBe(1);                                          // wraps backwards to the largest id
    run(s, 1, () => intents(right)); expect(weaponSelection(s).cursor).toBe(1);   // left/right leave the target alone
    run(s, 1, () => intents({ cancelPressed: true }));
    const t = makeState(1), j = wpn(t); placeDebris(t, A, 600, 1, 9); placeDebris(t, A, 600, 1, 8);
    sitDown(t, 0, j);
    expect(weaponSelection(t).cursor).toBe(1);                                          // smallest id on sit
  });
});


describe('selector', () => {
  it('Left/Right cycle F1, F2, F3, Torpedo with wrap and survive standing; Up/Down still cycle targets', () => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A');
    s.director.nextSpawnTick = 1e9; placeDebris(s, A, 600, 1); sitDown(s, 0, i); s.weapons.charge = 1;
    expect(s.weapons.selector).toBe(Weapon.BeamF1);
    const edge = (p: { moveX?: number; moveY?: number }) => { run(s, 1, () => intents(p)); run(s, 1, () => intents({})); };
    edge(right); expect(s.weapons.selector).toBe(Weapon.BeamF2);
    edge(right); edge(right); expect(s.weapons.selector).toBe(Weapon.Torpedo);
    edge(right); expect(s.weapons.selector).toBe(Weapon.BeamF1);                 // wraps
    edge(left); expect(s.weapons.selector).toBe(Weapon.Torpedo);                 // wraps backwards
    expect(s.weapons.charge).toBe(1);                                            // cycling never touches the charge
    edge(down); expect(s.weapons.selector).toBe(Weapon.Torpedo); expect(weaponSelection(s).cursor).toBe(0);
    run(s, 1, () => intents({ cancelPressed: true })); sitDown(s, 0, i);
    expect(s.weapons.selector).toBe(Weapon.Torpedo);                             // persists across sits
  });
});

describe('firing', () => {
  const armed = (selector: number, frequency: number, combatSeed: number) => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A');
    s.director.nextSpawnTick = 1e9; placeDebris(s, A, 600, 1, undefined, frequency); sitDown(s, 0, i);
    s.weapons.charge = 1; s.weapons.torpedoLoaded = 1; s.weapons.selector = selector; s.rng.combat.s = combatSeed;
    const one = createRng(combatSeed); nextFloat(one);
    return { s, i, one };
  };
  it('a matched beam hits on 0.627 and a mismatched one misses on the same draw; charge resets and the torpedo is untouched either way', () => {
    const hit = armed(Weapon.BeamF2, 2, 1);                                      // starter level 2 (output 0.5): match threshold 0.80
    expect(fireFixtureWeapon(hit.s)).toBe(true);
    expect(hit.s.debris.active[0]).toBe(0); expect(hit.s.weapons.charge).toBe(0); expect(hit.s.weapons.torpedoLoaded).toBe(1); expect(hit.s.rng.combat.s).toBe(hit.one.s);
    const miss = armed(Weapon.BeamF1, 2, 1);                                     // mismatch threshold 0.20
    expect(fireFixtureWeapon(miss.s)).toBe(false);
    expect(miss.s.debris.active[0]).toBe(1); expect(miss.s.weapons.charge).toBe(0); expect(miss.s.weapons.torpedoLoaded).toBe(1); expect(miss.s.rng.combat.s).toBe(miss.one.s);
    const unscanned = armed(Weapon.BeamF3, 3, 1);                                // the true frequency decides, scanned or not
    expect(unscanned.s.debris.scanned[0]).toBe(0); expect(fireFixtureWeapon(unscanned.s)).toBe(true);
  });
  it('a torpedo hits on 0.627 regardless of frequency, misses on 0.956, clears loaded either way and leaves the beam charge', () => {
    const hit = armed(Weapon.Torpedo, 1, 1);
    expect(fireFixtureWeapon(hit.s)).toBe(true);
    expect(hit.s.debris.active[0]).toBe(0); expect(hit.s.weapons.torpedoLoaded).toBe(0); expect(hit.s.weapons.charge).toBe(1); expect(hit.s.weapons.torpedoStock).toBe(3); expect(hit.s.rng.combat.s).toBe(hit.one.s);
    const miss = armed(Weapon.Torpedo, 1, 36);
    expect(fireFixtureWeapon(miss.s)).toBe(false);
    expect(miss.s.debris.active[0]).toBe(1); expect(miss.s.weapons.torpedoLoaded).toBe(0); expect(miss.s.weapons.charge).toBe(1); expect(miss.s.rng.combat.s).toBe(miss.one.s);
  });
  it('an unready weapon or a missing target draws nothing: torpedo slot with nothing loaded despite a full charge, beam slot with no charge despite a loaded torpedo', () => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A');
    s.director.nextSpawnTick = 1e9; sitDown(s, 0, i); s.weapons.charge = 1; s.weapons.torpedoLoaded = 1;
    const c0 = s.rng.combat.s;
    run(s, 1, () => intents(confirm));
    expect(s.weapons.charge).toBe(1); expect(s.weapons.torpedoLoaded).toBe(1); expect(s.rng.combat.s).toBe(c0);   // no target
    s.weapons.selector = Weapon.Torpedo; const stock0 = s.weapons.torpedoStock;
    run(s, 1, () => intents(confirm));
    expect(s.weapons.torpedoLoaded).toBe(1); expect(s.weapons.torpedoStock).toBe(stock0); expect(s.rng.combat.s).toBe(c0);   // no target, torpedo selected
    placeDebris(s, A, 600, 1); weaponSelection(s).cursor = 0;
    s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoaded = 0; s.weapons.torpedoStock = 0;
    run(s, 1, () => intents(confirm));
    expect(s.debris.active[0]).toBe(1); expect(s.weapons.charge).toBe(1); expect(s.rng.combat.s).toBe(c0);
    s.weapons.selector = Weapon.BeamF1; s.weapons.charge = 0.5; s.weapons.torpedoLoaded = 1;
    run(s, 1, () => intents(confirm));
    expect(s.debris.active[0]).toBe(1); expect(s.weapons.torpedoLoaded).toBe(1); expect(s.rng.combat.s).toBe(c0);
    const unwarned = placeDebris(s, A, 600, 0); weaponSelection(s).cursor = unwarned; s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoStock = 2;
    run(s, 1, () => intents(confirm));                                           // loaded torpedo, unwarned target: nothing
    expect(s.debris.active[unwarned]).toBe(1); expect(s.weapons.torpedoLoaded).toBe(1); expect(s.weapons.torpedoStock).toBe(2); expect(s.rng.combat.s).toBe(c0);
  });
  it('beamHits and torpedoHits thresholds at outputs 0.5, 0.75, 1.0, probed clear of float boundaries; a match never loses to a mismatch', () => {
    expect(beamHits(0.78, 0.5, true)).toBe(true); expect(beamHits(0.82, 0.5, true)).toBe(false);       // 0.80
    expect(beamHits(0.86, 0.75, true)).toBe(true); expect(beamHits(0.89, 0.75, true)).toBe(false);     // 0.875
    expect(beamHits(0.94, 1.0, true)).toBe(true); expect(beamHits(0.96, 1.0, true)).toBe(false);       // 0.95
    expect(beamHits(0.19, 0.5, false)).toBe(true); expect(beamHits(0.21, 0.5, false)).toBe(false);     // 0.20
    expect(beamHits(0.21, 0.75, false)).toBe(true); expect(beamHits(0.24, 0.75, false)).toBe(false);   // 0.225
    expect(beamHits(0.24, 1.0, false)).toBe(true); expect(beamHits(0.26, 1.0, false)).toBe(false);     // 0.25
    expect(torpedoHits(0.89, 0.5)).toBe(true); expect(torpedoHits(0.91, 0.5)).toBe(false);             // 0.90
    expect(torpedoHits(0.91, 0.75)).toBe(true); expect(torpedoHits(0.94, 0.75)).toBe(false);           // 0.925
    expect(torpedoHits(0.94, 1.0)).toBe(true); expect(torpedoHits(0.96, 1.0)).toBe(false);             // 0.95
    for (const o of [0.25, 0.5, 0.75, 1.0, 1.125]) for (let u = 0.005; u < 1; u += 0.01) expect(Number(beamHits(u, o, true))).toBeGreaterThanOrEqual(Number(beamHits(u, o, false)));
  });
});

describe('same-tick input order', () => {
  it('Right + Confirm on one tick fires the newly selected weapon', () => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A');
    s.director.nextSpawnTick = 1e9; placeDebris(s, A, 600, 1, undefined, 2); sitDown(s, 0, i);
    s.weapons.charge = 1; s.weapons.selector = Weapon.BeamF1; s.rng.combat.s = 1;   // 0.627: a matched beam hits, a mismatched one misses
    run(s, 1, () => intents({ moveX: 1, confirmPressed: true }));
    expect(s.weapons.selector).toBe(Weapon.BeamF2); expect(s.debris.active[0]).toBe(0); expect(s.weapons.charge).toBe(0);   // fired as F2 (a match): F1 would have missed
  });
});

describe('properties', () => {
  it('stock stays in 0..TORP_CAP, loaded is 0 or 1, stock only falls by one at a load completion, and draws equal shots', () => {
    const arbDir = fc.constantFrom({}, up, down);                                // no selector edges: the shot prediction below reads the selector before the tick
    const arbScript = fc.array(fc.record({ dir: arbDir, confirm: fc.boolean() }), { minLength: 1, maxLength: 240 });
    const refill = (s: ReturnType<typeof makeState>, A: number) => { if (s.debris.active.every((a) => !a)) for (let k = 0; k < 3; k++) placeDebris(s, A, 1e6, 1, undefined, 1 + (k % 3)); };
    fc.assert(fc.property(fc.integer({ min: 1, max: 1e6 }), fc.constantFrom(0, 1, 2, 3), arbScript, (seed, selector, script) => {
      const s = makeState(1, seed), i = wpn(s), A = room(s, 'A');
      s.director.nextSpawnTick = 1e9;
      for (let k = 0; k < 3; k++) placeDebris(s, A, 1e6, 1, undefined, 1 + (k % 3));
      sitDown(s, 0, i);                                                           // after the placements, so the sit selects a target
      if (weaponSelection(s).cursor! < 0) return false;
      const output = 0.5;                                                         // starter Weapons level 2, online throughout (spawner off, nobody fails it)
      let shots = 0, loadsCompleted = 0, prevStock = s.weapons.torpedoStock;
      // One tick with every check: exactly one combat draw per predicted shot, stock moves only at a predicted load completion.
      const tick = (dir: object, confirm: boolean): boolean => {
        if (weaponSelection(s).cursor! < 0) weaponSelection(s).cursor = warnedTargets(s)[0] ?? -1;   // keep a target selected: a hit leaves -1, and an Up/Down edge would otherwise retarget and fire inside the tick
        const w = s.weapons, c = weaponSelection(s).cursor!;
        // Readiness after this tick's increments, computed with the sim's own arithmetic (charging and loading precede input).
        const chargeAfter = Math.min(1, w.charge + DT * output / BEAM_CHARGE_TIME);
        const loadCompletes = w.torpedoLoaded === 0 && w.torpedoStock > 0 && Math.min(1, w.torpedoLoad + DT * output / TORP_LOAD_TIME) >= 1;
        const ready = w.selector === Weapon.Torpedo ? (w.torpedoLoaded === 1 || loadCompletes) : chargeAfter >= 1;
        const target = c >= 0 && s.debris.active[c] === 1 && s.debris.warned[c] === 1;
        const willShoot = confirm && ready && target;
        const expected = createRng(s.rng.combat.s); if (willShoot) nextFloat(expected);
        propertyPhaseStep(s, intents({ ...dir, confirmPressed: confirm }));
        if (s.rng.combat.s !== expected.s) return false;                           // one draw for a shot, none otherwise
        if (w.torpedoStock !== prevStock - (loadCompletes ? 1 : 0)) return false;   // the only stock change is a load completion (regeneration needs 90 s; the run is shorter)
        if (w.torpedoStock < 0 || w.torpedoStock > TORP_CAP || (w.torpedoLoaded !== 0 && w.torpedoLoaded !== 1)) return false;
        if (willShoot) shots++; if (loadCompletes) loadsCompleted++;
        prevStock = w.torpedoStock;
        refill(s, A);
        return true;
      };
      // Deterministic prelude: fire the loaded tube once and reload it, so every run completes at least one load.
      s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoaded = 1; s.weapons.charge = 1;
      if (!tick({}, true) || (s.weapons.torpedoLoaded as number) !== 0) return false;
      for (let t = 0; t < seconds(20) + 2; t++) if (!tick({}, false)) return false;
      if ((s.weapons.torpedoLoaded as number) !== 1 || loadsCompleted !== 1) return false;
      s.weapons.selector = selector;
      for (const e of [{ dir: {}, confirm: true }, ...script]) {                   // a forced first Confirm: charge is 1 and the tube is loaded, so it fires on every selector
        for (let t = 0; t < 5; t++) if (!tick(e.dir, e.confirm)) return false;
      }
      return shots >= 2 && loadsCompleted >= 1;
    }), { numRuns: 25 });
  });
});

describe('the last shot, recorded for the renderer (spec Demo-viii section 2)', () => {
  const seedWhere = (ok: (u: number) => boolean): number => { for (let seed = 1; seed <= 200; seed++) if (ok(nextFloat(createRng(seed)))) return seed; throw new Error('no seed'); };
  const HIT = seedWhere((u) => u < 0.3), MISS = seedWhere((u) => u > 0.97);
  const atEnemy = (slot: number, selector: number, seed: number) => {
    const s = makeState(2); s.director.nextSpawnTick = 1e9; placeEnemy(s, ENEMY_HULL, 1); s.enemy.nextShotTick = 1e9;
    const i = wpn(s); sitDown(s, 0, i); weaponSelection(s).cursor = slot; s.weapons.charge = 1; s.weapons.torpedoLoaded = 1; s.weapons.selector = selector; s.rng.combat.s = seed; s.tick = 777;
    return s;
  };
  const rec = (s: ReturnType<typeof makeState>) => [s.weapons.lastShotTick, s.weapons.lastShotTarget, s.weapons.lastShotResult, s.weapons.lastShotKind];
  it('starts empty', () => { expect(rec(makeState(1))).toEqual([-1, -1, 0, 0]); });
  it('beam miss, strip, system hit, hull hit; torpedo hit and miss at the enemy', () => {
    expect(rec((() => { const s = atEnemy(ENEMY_SLOT, Weapon.BeamF1, MISS); fireFixtureWeapon(s); return s; })())).toEqual([777, ENEMY_SLOT, 0, 0]);
    expect(rec((() => { const s = atEnemy(ENEMY_SLOT, Weapon.BeamF2, HIT); fireFixtureWeapon(s); expect(s.enemy.shieldLayers).toBe(0); return s; })())).toEqual([777, ENEMY_SLOT, 1, 0]);
    expect(rec((() => { const s = atEnemy(ENEMY_WEAPONS_SLOT, Weapon.BeamF1, HIT); fireFixtureWeapon(s); return s; })())).toEqual([777, ENEMY_WEAPONS_SLOT, 2, 0]);
    expect(rec((() => { const s = atEnemy(ENEMY_SLOT, Weapon.BeamF1, HIT); fireFixtureWeapon(s); return s; })())).toEqual([777, ENEMY_SLOT, 2, 0]);
    expect(rec((() => { const s = atEnemy(ENEMY_SHIELDS_SLOT, Weapon.Torpedo, HIT); fireFixtureWeapon(s); return s; })())).toEqual([777, ENEMY_SHIELDS_SLOT, 2, 1]);
    expect(rec((() => { const s = atEnemy(ENEMY_SLOT, Weapon.Torpedo, MISS); fireFixtureWeapon(s); return s; })())).toEqual([777, ENEMY_SLOT, 0, 1]);
  });
  it('a beam hit on debris records the debris slot', () => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A'); s.director.nextSpawnTick = 1e9;
    const k = placeDebris(s, A, 600, 1, undefined, 1); sitDown(s, 0, i); weaponSelection(s).cursor = k; s.weapons.charge = 1; s.weapons.selector = Weapon.BeamF1; s.rng.combat.s = HIT; s.tick = 50;
    expect(fireFixtureWeapon(s)).toBe(true); expect(rec(s)).toEqual([50, k, 2, 0]);
  });
  it('a refused fire writes nothing', () => {
    const s = atEnemy(ENEMY_SLOT, Weapon.BeamF1, HIT); s.weapons.charge = 0.5; fireFixtureWeapon(s); expect(rec(s)).toEqual([-1, -1, 0, 0]);
    const t = atEnemy(ENEMY_SLOT, Weapon.Torpedo, HIT); t.weapons.torpedoLoaded = 0; fireFixtureWeapon(t); expect(rec(t)).toEqual([-1, -1, 0, 0]);
    const u = atEnemy(-1, Weapon.BeamF1, HIT); fireFixtureWeapon(u); expect(rec(u)).toEqual([-1, -1, 0, 0]);
  });
});

describe('beams under the Science lock (spec Coop-i section 1, amendments C1 and C2)', () => {
  const seedWhere = (ok: (u: number) => boolean): number => { for (let seed = 1; seed <= 2000; seed++) if (ok(nextFloat(createRng(seed)))) return seed; throw new Error('no seed'); };
  const LOW = seedWhere((u) => u < 0.3), MID = seedWhere((u) => u >= 0.72 && u < 0.83), MISS = seedWhere((u) => u > 0.97);
  const atEnemy = (selector: number, seed: number, locked: boolean, freq = 1) => {
    const s = makeState(2); s.director.nextSpawnTick = 1e9; placeEnemy(s, ENEMY_HULL, freq); s.enemy.nextShotTick = 1e9; s.tick = 6000;
    const i = wpn(s); sitDown(s, 0, i); weaponSelection(s).cursor = ENEMY_SLOT; s.weapons.charge = 1; s.weapons.torpedoLoaded = 1; s.weapons.selector = selector; s.rng.combat.s = seed;
    if (locked) s.enemy.lockUntilTick = s.tick + LOCK_SECONDS * 60;
    return s;
  };
  it('the threshold the seeds straddle: 0.70 unlocked, 0.85 locked', () => {
    const s = atEnemy(Weapon.BeamF1, MID, true); expect(enemyBeamThreshold(s, 0.5)).toBeCloseTo(0.70); expect(LOCK_HIT_BONUS).toBe(0.15);
  });
  it('a locked beam is tuned for any selector: a hull hit, no strip; lockedShots counts', () => {
    for (const sel of [Weapon.BeamF1, Weapon.BeamF2, Weapon.BeamF3]) {
      const s = atEnemy(sel, LOW, true, 2);
      expect(fireFixtureWeapon(s)).toBe(true);
      expect([s.weapons.lastShotResult, s.enemy.shieldLayers, s.enemy.hull, s.telemetry.lockedShots, s.telemetry.shieldHits]).toEqual([2, 1, ENEMY_HULL - 15, 1, 0]);
    }
  });
  it('the lock adds 0.15 to the hit threshold while a layer is up: u in [0.72, 0.83) misses unlocked and hits locked', () => {
    const a = atEnemy(Weapon.BeamF1, MID, false); expect(fireFixtureWeapon(a)).toBe(false);
    const b = atEnemy(Weapon.BeamF1, MID, true); expect(fireFixtureWeapon(b)).toBe(true); expect(b.weapons.lastShotResult).toBe(2);
  });
  it('the solo path: a matching selector without a lock still fires tuned; a mismatch strips', () => {
    const a = atEnemy(Weapon.BeamF2, LOW, false, 2); fireFixtureWeapon(a); expect([a.weapons.lastShotResult, a.enemy.shieldLayers, a.telemetry.lockedShots]).toEqual([2, 1, 0]);
    const b = atEnemy(Weapon.BeamF1, LOW, false, 2); fireFixtureWeapon(b); expect([b.weapons.lastShotResult, b.enemy.shieldLayers]).toEqual([1, 0]);
  });
  it('with the shields system down or no layer up every beam is tuned as today, and the lock adds nothing', () => {
    const a = atEnemy(Weapon.BeamF1, MID, true, 2); a.enemy.sysHp[EnemySystem.Shields] = 0; a.enemy.shieldLayers = 0; expect(fireFixtureWeapon(a)).toBe(false);
    const b = atEnemy(Weapon.BeamF1, MID, true, 2); b.enemy.shieldLayers = 0; expect(fireFixtureWeapon(b)).toBe(false);
    const c = atEnemy(Weapon.BeamF1, LOW, false, 2); c.enemy.shieldLayers = 0; fireFixtureWeapon(c); expect(c.weapons.lastShotResult).toBe(2);
    expect(a.enemy.sysHp[EnemySystem.Shields]).toBe(0); expect(ENEMY_SYS_HP).toBeGreaterThan(0);
  });
  it('each fired beam makes exactly one combat draw, locked or not; a locked hit draws what a matched hit draws', () => {
    for (const locked of [false, true]) { const s = atEnemy(Weapon.BeamF1, MISS, locked); fireFixtureWeapon(s); const r = createRng(MISS); nextFloat(r); expect(s.rng.combat.s).toBe(r.s); }
    const l = atEnemy(Weapon.BeamF1, LOW, true, 2), m = atEnemy(Weapon.BeamF2, LOW, false, 2); fireFixtureWeapon(l); fireFixtureWeapon(m);
    expect(l.rng.combat.s).toBe(m.rng.combat.s); expect(l.enemy.hull).toBe(m.enemy.hull);
  });
  it('a torpedo under the lock is not a locked shot; an expired lock does nothing', () => {
    const t = atEnemy(Weapon.Torpedo, LOW, true); fireFixtureWeapon(t); expect(t.telemetry.lockedShots).toBe(0);
    const e = atEnemy(Weapon.BeamF1, MID, true); e.tick = e.enemy.lockUntilTick; expect(fireFixtureWeapon(e)).toBe(false); expect(e.telemetry.lockedShots).toBe(0);
  });
  it('the Weapons card reads locked while a lock runs', () => {
    const s = atEnemy(Weapon.BeamF1, LOW, true);
    const card = () => buildHudModel(s, fixtureCouchViewer(s), { slots: [{ status: 'active', key: 'kb:0' }, { status: 'active', key: 'kb:1' }], phase: 'running', message: '' }).players[0]!.console as WeaponsPanel;
    expect(card().locked).toBe(true); s.enemy.lockUntilTick = -1; expect(card().locked).toBe(false);
  });
});

// ---- Loop-iii: the loot weapons (spec Loop-iii sections 1 and 2) ----
import { WEAPON_DEFS, LootWeapon, weaponDef } from '../src/renderer/src/sim/weaponDefs';
import { selectorList } from '../src/renderer/src/sim/weapons';
import { enemySysUp, enemyWeaponCharge, enemySystem } from '../src/renderer/src/sim/enemy';
import { ION_SECONDS, WEAPON_DROP_CHANCE, SLOT_LEVELS, TORP_HIT_BASE, TORP_HIT_SCALE, BEAM_MISS_BASE, BEAM_MISS_SCALE, BEAM_MATCH_BASE, BEAM_MATCH_SCALE, ENEMY_EVADE, TICK_HZ, TORP_START, ENEMY_BEAM_DAMAGE, ENEMY_TORP_DAMAGE } from '../src/renderer/src/sim/tuning';
import { ENEMY_ENGINES_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { stationOutput } from '../src/renderer/src/sim/stations';
import { shotsInFlight } from '../src/renderer/src/sim/debris';
import { quiet, disableSystem } from './helpers/sim';
import { nextInt, type RngState } from '../src/shared/rng';
import { Dir } from '../src/renderer/src/sim/dir';

/** The first seed whose draws satisfy the predicate on a fresh stream. */
const seedFor = (ok: (r: RngState) => boolean): number => { for (let seed = 1; seed <= 20000; seed++) if (ok(createRng(seed))) return seed; throw new Error('no seed'); };
/** Weapons seated at the given level, an enemy with one layer and no shot due, the cursor on `slot`, the loot weapon `id` charged in extra slot `k` and selected. */
function lootArmed(id: number, k = 0, slot = ENEMY_SLOT, level = 2) {
  const s = makeState(2); quiet(s); placeEnemy(s, ENEMY_HULL, 2); s.enemy.nextShotTick = 1e9;
  const w = wpn(s); s.stations.level[w] = level; sitDown(s, 0, w); weaponSelection(s).cursor = slot;
  s.weapons.slot[k] = id; s.weapons.charge2[k] = 1; s.weapons.selector = Weapon.Slot1 + k;
  return { s, w, out: stationOutput(s, w) };
}

describe('loot weapons: the table and the slots', () => {
  it('the four weapons carry the spec values; ion seconds 10, drop chance 0.25, slot levels 2 and 4', () => {
    expect(WEAPON_DEFS.slice(1).map((d) => [d.name, d.chargeTime, d.shots, d.damage, d.kind, d.price])).toEqual([
      ['Burst Laser', 9, 2, 10, 'laser', 60], ['Heavy Laser', 12, 1, 30, 'laser', 70], ['Ion Cannon', 7, 1, 0, 'ion', 55], ['Missile Pod', 8, 1, 25, 'missile', 65]]);
    expect([ION_SECONDS, WEAPON_DROP_CHANCE, [...SLOT_LEVELS]]).toEqual([10, 0.25, [2, 4]]);
    const s = makeState(1); expect([Array.from(s.weapons.slot), Array.from(s.weapons.charge2), s.weapons.cargo]).toEqual([[0, 0], [0, 0], 0]);
    expect(Array.from(s.enemy.ionUntil)).toEqual([-1, -1, -1, -1]);
  });
  it('extra slot 1 charges at Weapons level 2 or more, slot 2 at 4 or more, at output / charge time; the beam is unchanged; charge is kept when the level drops', () => {
    const s = makeState(1), i = wpn(s); quiet(s); s.weapons.slot[0] = LootWeapon.Burst; s.weapons.slot[1] = LootWeapon.Heavy; sitDown(s, 0, i);
    const o2 = stationOutput(s, i); chargeBeam(s);
    expect(s.weapons.charge2[0]).toBeCloseTo(DT * o2 / 9); expect(s.weapons.charge2[1]).toBe(0); expect(s.weapons.charge).toBeCloseTo(DT * o2 / BEAM_CHARGE_TIME);
    s.stations.level[i] = 3; chargeBeam(s); expect(s.weapons.charge2[1]).toBe(0);
    s.stations.level[i] = 4; const o4 = stationOutput(s, i), before = s.weapons.charge2[0]!; chargeBeam(s);
    expect(s.weapons.charge2[1]).toBeCloseTo(DT * o4 / 12); expect(s.weapons.charge2[0]).toBeCloseTo(before + DT * o4 / 9);
    s.stations.level[i] = 1; const kept = [s.weapons.charge2[0]!, s.weapons.charge2[1]!]; chargeBeam(s);
    expect(Array.from(s.weapons.charge2)).toEqual(kept);
    s.stations.level[i] = 4; s.weapons.charge2[0] = 1 - 1e-6; chargeBeam(s); expect(s.weapons.charge2[0]).toBe(1);   // capped
    const e = makeState(1), j = wpn(e); quiet(e); sitDown(e, 0, j); chargeBeam(e); expect(Array.from(e.weapons.charge2)).toEqual([0, 0]);   // an empty slot never charges
  });
  it('the selector cycles Pulse F1, F2, F3, the filled extra slots, then the Torpedo', () => {
    const s = makeState(1), i = wpn(s); quiet(s); sitDown(s, 0, i);
    expect(selectorList(s)).toEqual([Weapon.BeamF1, Weapon.BeamF2, Weapon.BeamF3, Weapon.Torpedo]);
    s.weapons.slot[1] = LootWeapon.Ion; expect(selectorList(s)).toEqual([0, 1, 2, Weapon.Slot2, Weapon.Torpedo]);
    s.weapons.slot[0] = LootWeapon.Burst; expect(selectorList(s)).toEqual([0, 1, 2, Weapon.Slot1, Weapon.Slot2, Weapon.Torpedo]);
    s.weapons.selector = Weapon.BeamF3; weaponsDirection(s, i, Dir.Right, false); expect(s.weapons.selector).toBe(Weapon.Slot1);
    weaponsDirection(s, i, Dir.Right, false); expect(s.weapons.selector).toBe(Weapon.Slot2);
    weaponsDirection(s, i, Dir.Right, false); expect(s.weapons.selector).toBe(Weapon.Torpedo);
    weaponsDirection(s, i, Dir.Right, false); expect(s.weapons.selector).toBe(Weapon.BeamF1);
    weaponsDirection(s, i, Dir.Left, false); expect(s.weapons.selector).toBe(Weapon.Torpedo);
    weaponsDirection(s, i, Dir.Left, false); expect(s.weapons.selector).toBe(Weapon.Slot2);
  });
  it('an uncharged or empty slot refuses to fire and draws nothing', () => {
    const { s } = lootArmed(LootWeapon.Heavy); s.weapons.charge2[0] = 0.5; const r0 = s.rng.combat.s;
    expect(fireFixtureWeapon(s)).toBe(false); expect(s.rng.combat.s).toBe(r0); expect(s.telemetry.shots).toBe(0);
    s.weapons.charge2[0] = 1; s.weapons.slot[0] = 0; expect(fireFixtureWeapon(s)).toBe(false); expect(s.rng.combat.s).toBe(r0); expect(s.weapons.charge2[0]).toBe(1);
  });
});

describe('loot weapons: firing at the enemy', () => {
  it('Burst Laser: two shots, one combat draw each; the first strips the layer and the second, now tuned, hits for 10', () => {
    const probe = lootArmed(LootWeapon.Burst), thr = enemyBeamThreshold(probe.s, probe.out);
    const seed = seedFor((r) => nextFloat(r) < thr && nextFloat(r) < thr);
    const { s } = lootArmed(LootWeapon.Burst); s.rng.combat.s = seed;
    const c = createRng(seed); nextFloat(c); nextFloat(c); nextFloat(c);   // two rolls, then the Hold hit's problem draw (no room draw since Demo-x-c)
    expect(fireFixtureWeapon(s)).toBe(true);
    expect([s.enemy.shieldLayers, s.enemy.hull, s.telemetry.shots, s.telemetry.hits, s.telemetry.shieldHits, s.weapons.charge2[0]]).toEqual([0, ENEMY_HULL - 10, 2, 2, 1, 0]);
    expect(s.rng.combat.s).toBe(c.s); expect(s.weapons.charge).toBe(0);   // the beam's charge is its own (never charged here)
  });
  it('Burst Laser under a lock: both shots tuned, 20 damage, the layer kept; both misses draw twice and do nothing', () => {
    const probe = lootArmed(LootWeapon.Burst), thr = enemyBeamThreshold(probe.s, probe.out) + LOCK_HIT_BONUS;
    const seed = seedFor((r) => nextFloat(r) < thr && (nextFloat(r), nextFloat(r) < thr));
    const { s } = lootArmed(LootWeapon.Burst); s.enemy.scanned = 1; s.enemy.lockUntilTick = s.tick + 100; s.rng.combat.s = seed;
    expect(fireFixtureWeapon(s)).toBe(true); expect([s.enemy.hull, s.enemy.shieldLayers, s.telemetry.lockedShots]).toEqual([ENEMY_HULL - 20, 1, 2]);
    const miss = seedFor((r) => nextFloat(r) > 0.99 && nextFloat(r) > 0.99), m = lootArmed(LootWeapon.Burst); m.s.rng.combat.s = miss;
    const c = createRng(miss); nextFloat(c); nextFloat(c);
    expect(fireFixtureWeapon(m.s)).toBe(false); expect([m.s.enemy.hull, m.s.enemy.shieldLayers, m.s.telemetry.shots, m.s.weapons.charge2[0]]).toEqual([ENEMY_HULL, 1, 2, 0]); expect(m.s.rng.combat.s).toBe(c.s);
  });
  it('Burst Laser: a first shot that destroys the enemy ends the volley without a second draw', () => {
    const probe = lootArmed(LootWeapon.Burst), thr = enemyBeamThreshold(probe.s, probe.out);
    const seed = seedFor((r) => nextFloat(r) < thr);
    const { s } = lootArmed(LootWeapon.Burst); s.enemy.shieldLayers = 0; s.enemy.hull = 10; s.rng.combat.s = seed;
    const c = createRng(seed); nextFloat(c); nextFloat(c);
    fireFixtureWeapon(s); expect(s.enemy.present).toBe(0); expect(s.telemetry.shots).toBe(1); expect(s.rng.combat.s).toBe(c.s);
  });
  it('Heavy Laser: one roll; untuned against a layer it strips (a strip reads as a hit, as the beam), tuned with the shields down it hits for 30', () => {
    const probe = lootArmed(LootWeapon.Heavy), thr = enemyBeamThreshold(probe.s, probe.out), seed = seedFor((r) => nextFloat(r) < thr);
    const a = lootArmed(LootWeapon.Heavy); a.s.rng.combat.s = seed; const c = createRng(seed); nextFloat(c);
    expect(fireFixtureWeapon(a.s)).toBe(true); expect([a.s.enemy.shieldLayers, a.s.enemy.hull, a.s.telemetry.shots]).toEqual([0, ENEMY_HULL, 1]); expect(a.s.rng.combat.s).toBe(c.s);
    const b = lootArmed(LootWeapon.Heavy); disableSystem(b.s, EnemySystem.Shields); b.s.enemy.shieldLayers = 0; b.s.rng.combat.s = seed;
    expect(fireFixtureWeapon(b.s)).toBe(true); expect(b.s.enemy.hull).toBe(ENEMY_HULL - 30);
  });
  it('Ion Cannon: one roll at the torpedo chance; a hit strips a layer and does no damage', () => {
    const probe = lootArmed(LootWeapon.Ion), thr = TORP_HIT_BASE + TORP_HIT_SCALE * probe.out;
    const seed = seedFor((r) => { const u = nextFloat(r); return u < thr && u > enemyBeamThreshold(probe.s, probe.out); });   // a hit only at the torpedo's chance
    const { s } = lootArmed(LootWeapon.Ion); s.rng.combat.s = seed; const c = createRng(seed); nextFloat(c);
    fireFixtureWeapon(s); expect([s.enemy.shieldLayers, s.enemy.hull, s.telemetry.shieldHits, s.weapons.charge2[0]]).toEqual([0, ENEMY_HULL, 1, 0]); expect(s.rng.combat.s).toBe(c.s);
    expect(Array.from(s.enemy.ionUntil)).toEqual([-1, -1, -1, -1]);
    const miss = seedFor((r) => nextFloat(r) > thr), m = lootArmed(LootWeapon.Ion); m.s.rng.combat.s = miss;
    expect(fireFixtureWeapon(m.s)).toBe(false); expect(m.s.enemy.shieldLayers).toBe(1);
  });
  it('Ion Cannon: with no layer up a hit on a system row disables it for 10 s without losing health; a hull hit does nothing', () => {
    const probe = lootArmed(LootWeapon.Ion), thr = TORP_HIT_BASE + TORP_HIT_SCALE * probe.out, seed = seedFor((r) => nextFloat(r) < thr);
    const { s } = lootArmed(LootWeapon.Ion, 0, ENEMY_SHIELDS_SLOT); s.enemy.shieldLayers = 0; s.rng.combat.s = seed;
    expect(fireFixtureWeapon(s)).toBe(true);
    expect(s.enemy.ionUntil[EnemySystem.Shields]).toBe(s.tick + ION_SECONDS * TICK_HZ); expect(s.enemy.sysHp[EnemySystem.Shields]).toBe(ENEMY_SYS_HP); expect(s.enemy.hull).toBe(ENEMY_HULL);
    expect(enemySysUp(s, EnemySystem.Shields)).toBe(false); expect(enemySysUp(s, EnemySystem.Weapons)).toBe(true);
    const rot = s.enemy.shieldRotateTick;
    for (let t = 0; t < ION_SECONDS * TICK_HZ; t++) { enemySystem(s); s.tick++; }
    expect([s.enemy.shieldLayers, s.enemy.shieldRecharge]).toEqual([0, 0]); expect(s.enemy.shieldRotateTick).toBe(rot + ION_SECONDS * TICK_HZ);   // no recharge, the re-tune clock stands still
    expect(enemySysUp(s, EnemySystem.Shields)).toBe(true); enemySystem(s); expect(s.enemy.shieldRecharge).toBeGreaterThan(0);
    const h = lootArmed(LootWeapon.Ion); h.s.enemy.shieldLayers = 0; h.s.rng.combat.s = seed;
    expect(fireFixtureWeapon(h.s)).toBe(true); expect(Array.from(h.s.enemy.ionUntil)).toEqual([-1, -1, -1, -1]); expect(h.s.enemy.hull).toBe(ENEMY_HULL);
  });
  it('Ion Cannon: ionised weapons skip a due shot and read no charge; ionised Piloting gives up the evasion (spec Demo-x-c section 4), ionised engines do not', () => {
    const { s } = lootArmed(LootWeapon.Ion); s.enemy.ionUntil[EnemySystem.Weapons] = s.tick + 600; s.enemy.nextShotTick = s.tick;
    expect(enemyWeaponCharge(s)).toBe(0); enemySystem(s); expect(shotsInFlight(s)).toBe(0); expect(s.enemy.nextShotTick).toBeGreaterThan(s.tick);
    const e = lootArmed(LootWeapon.Ion), before = enemyBeamThreshold(e.s, 0.5); e.s.enemy.ionUntil[EnemySystem.Engines] = e.s.tick + 600;
    expect(enemyBeamThreshold(e.s, 0.5)).toBeCloseTo(before); e.s.enemy.ionUntil[EnemySystem.Piloting] = e.s.tick + 600;
    expect(enemyBeamThreshold(e.s, 0.5)).toBeCloseTo(before + ENEMY_EVADE);
    const d = lootArmed(LootWeapon.Ion, 0, ENEMY_ENGINES_SLOT); d.s.enemy.departTick = d.s.tick + 100; d.s.enemy.ionUntil[EnemySystem.Engines] = d.s.tick + 600; enemySystem(d.s);
    expect(d.s.enemy.departTick).toBe(d.s.tick + 101);   // the departure clock stands still, as with the engines down
  });
  it('Missile Pod: spends one torpedo from stock, ignores the shields, one roll at the torpedo chance, 25 damage; no stock, no fire', () => {
    const probe = lootArmed(LootWeapon.Missile), thr = TORP_HIT_BASE + TORP_HIT_SCALE * probe.out, seed = seedFor((r) => nextFloat(r) < thr);
    const { s } = lootArmed(LootWeapon.Missile); s.rng.combat.s = seed; const c = createRng(seed); nextFloat(c); nextFloat(c);
    expect(fireFixtureWeapon(s)).toBe(true);
    expect([s.enemy.hull, s.enemy.shieldLayers, s.weapons.torpedoStock, s.weapons.lastShotKind]).toEqual([ENEMY_HULL - 25, 1, TORP_START - 1, 1]); expect(s.rng.combat.s).toBe(c.s);
    const n = lootArmed(LootWeapon.Missile); n.s.weapons.torpedoStock = 0; const r0 = n.s.rng.combat.s;
    expect(fireFixtureWeapon(n.s)).toBe(false); expect([n.s.weapons.charge2[0], n.s.telemetry.shots]).toEqual([1, 0]); expect(n.s.rng.combat.s).toBe(r0);
  });
});

describe('loot weapons: debris', () => {
  const atDebris = (id: number, freq = 1) => { const s = makeState(1); quiet(s); const w = wpn(s); const k = placeDebris(s, room(s, 'A'), 600, 1, undefined, freq); sitDown(s, 0, w); weaponSelection(s).cursor = k; s.weapons.slot[0] = id; s.weapons.charge2[0] = 1; s.weapons.selector = Weapon.Slot1; return { s, k, out: stationOutput(s, w) }; };
  it('the lasers roll as an untuned beam: a roll between the untuned and tuned chances misses, below the untuned chance it clears the rock', () => {
    const p = atDebris(LootWeapon.Heavy), lo = BEAM_MISS_BASE + BEAM_MISS_SCALE * p.out, hi = BEAM_MATCH_BASE + BEAM_MATCH_SCALE * p.out;
    const mid = seedFor((r) => { const u = nextFloat(r); return u > lo && u < hi; }), low = seedFor((r) => nextFloat(r) < lo);
    const a = atDebris(LootWeapon.Heavy); a.s.rng.combat.s = mid; expect(fireFixtureWeapon(a.s)).toBe(false); expect(a.s.debris.active[a.k]).toBe(1);
    const b = atDebris(LootWeapon.Heavy); b.s.rng.combat.s = low; expect(fireFixtureWeapon(b.s)).toBe(true); expect(b.s.debris.active[b.k]).toBe(0);
    const c = atDebris(LootWeapon.Burst); c.s.rng.combat.s = low; const r = createRng(low); nextFloat(r);
    expect(fireFixtureWeapon(c.s)).toBe(true); expect(c.s.telemetry.shots).toBe(1); expect(c.s.rng.combat.s).toBe(r.s);   // the rock is gone: no second shot
  });
  it('the ion cannon cannot target debris; the missile pod hits it like a torpedo', () => {
    const a = atDebris(LootWeapon.Ion), r0 = a.s.rng.combat.s; expect(fireFixtureWeapon(a.s)).toBe(false); expect([a.s.weapons.charge2[0], a.s.rng.combat.s, a.s.debris.active[a.k]]).toEqual([1, r0, 1]);
    const p = atDebris(LootWeapon.Missile), thr = TORP_HIT_BASE + TORP_HIT_SCALE * p.out, seed = seedFor((r) => { const u = nextFloat(r); return u < thr && u > BEAM_MATCH_BASE + BEAM_MATCH_SCALE * p.out; });
    const b = atDebris(LootWeapon.Missile); b.s.rng.combat.s = seed; expect(fireFixtureWeapon(b.s)).toBe(true); expect([b.s.debris.active[b.k], b.s.weapons.torpedoStock]).toEqual([0, TORP_START - 1]);
  });
  it('weaponDef reads the table', () => { expect(weaponDef(LootWeapon.Ion).short).toBe('Ion'); });
});

// ---- Loop-iii: finding weapons (spec Loop-iii section 3) ----
import { grantWeapon, LootPlace } from '../src/renderer/src/sim/weapons';

describe('grantWeapon: slot, cargo, or sold for half', () => {
  it('fills the first empty extra slot with a fresh charge, then the cargo, then sells for half its price; each stamps the notice fields', () => {
    const s = makeState(1); quiet(s); s.tick = 50; s.run.scrap = 0;
    expect(grantWeapon(s, LootWeapon.Ion, false)).toBe(LootPlace.Slot1); expect([Array.from(s.weapons.slot), s.weapons.cargo]).toEqual([[LootWeapon.Ion, 0], 0]);
    expect([s.weapons.lootTick, s.weapons.lootId, s.weapons.lootPlace, s.weapons.lootBought]).toEqual([50, LootWeapon.Ion, LootPlace.Slot1, 0]);
    s.weapons.charge2[1] = 0.7; s.weapons.slot[0] = 0;
    expect(grantWeapon(s, LootWeapon.Heavy, true)).toBe(LootPlace.Slot1); expect(Array.from(s.weapons.slot)).toEqual([LootWeapon.Heavy, 0]); expect(s.weapons.lootBought).toBe(1);
    expect(grantWeapon(s, LootWeapon.Burst, false)).toBe(LootPlace.Slot2); expect(Array.from(s.weapons.charge2)).toEqual([0, 0]);
    expect(grantWeapon(s, LootWeapon.Missile, false)).toBe(LootPlace.Cargo); expect(s.weapons.cargo).toBe(LootWeapon.Missile);
    expect(grantWeapon(s, LootWeapon.Ion, false)).toBe(LootPlace.Sold); expect([s.run.scrap, s.telemetry.scrapEarned]).toEqual([27, 27]);   // 55 / 2, rounded down
    expect([Array.from(s.weapons.slot), s.weapons.cargo, s.weapons.lootPlace]).toEqual([[LootWeapon.Heavy, LootWeapon.Burst], LootWeapon.Missile, LootPlace.Sold]);
    const r0 = JSON.stringify([s.rng.loot.s, s.rng.combat.s]); grantWeapon(s, LootWeapon.Burst, false); expect(JSON.stringify([s.rng.loot.s, s.rng.combat.s])).toBe(r0);   // no draws
  });
  it('a fresh state has no loot stamp', () => {
    const s = makeState(1); expect([s.weapons.lootTick, s.weapons.lootId, s.weapons.lootPlace, s.weapons.lootBought, s.run.shopWeapon]).toEqual([-1, 0, 0, 0, 0]);
  });
});

describe('the last shot names its weapon and its damage (spec Demo-xiv section 2)', () => {
  const seedWhere = (ok: (u: number) => boolean): number => { for (let seed = 1; seed <= 200; seed++) if (ok(nextFloat(createRng(seed)))) return seed; throw new Error('no seed'); };
  const HIT = seedWhere((u) => u < 0.3), MISS = seedWhere((u) => u > 0.97);
  const atEnemy = (slot: number, selector: number, seed: number, freq = 1) => {
    const s = makeState(2); s.director.nextSpawnTick = 1e9; placeEnemy(s, ENEMY_HULL, freq); s.enemy.nextShotTick = 1e9;
    const i = wpn(s); sitDown(s, 0, i); weaponSelection(s).cursor = slot; s.weapons.charge = 1; s.weapons.torpedoLoaded = 1; s.weapons.selector = selector; s.rng.combat.s = seed; s.tick = 777;
    return s;
  };
  const fired = (s: ReturnType<typeof makeState>) => { fireFixtureWeapon(s); return [s.weapons.lastShotSelector, s.weapons.lastShotDamage]; };
  it('starts at selector 0 and no damage', () => { const s = makeState(1); expect([s.weapons.lastShotSelector, s.weapons.lastShotDamage]).toEqual([0, 0]); });
  it('the Pulse: the selector fired and its hull damage on a hit; 0 on a miss or a strip', () => {
    expect(fired(atEnemy(ENEMY_WEAPONS_SLOT, Weapon.BeamF1, HIT))).toEqual([Weapon.BeamF1, ENEMY_BEAM_DAMAGE]);
    expect(fired(atEnemy(ENEMY_SLOT, Weapon.BeamF3, MISS))).toEqual([Weapon.BeamF3, 0]);
    expect(fired(atEnemy(ENEMY_SLOT, Weapon.BeamF2, HIT))).toEqual([Weapon.BeamF2, 0]);   // freq 1 shields, F2 strips
  });
  it('the torpedo: 35 on a hit', () => { expect(fired(atEnemy(ENEMY_SHIELDS_SLOT, Weapon.Torpedo, HIT))).toEqual([Weapon.Torpedo, ENEMY_TORP_DAMAGE]); });
  it('a refused fire leaves both alone', () => { const s = atEnemy(ENEMY_SLOT, Weapon.BeamF2, HIT); s.weapons.charge = 0; expect(fired(s)).toEqual([0, 0]); });
  it('a loot volley: the slot selector and the volley total (the Burst, both shots landing on a lowered shield)', () => {
    const probe = lootArmed(LootWeapon.Burst), thr = enemyBeamThreshold(probe.s, probe.out);
    const { s } = lootArmed(LootWeapon.Burst); s.enemy.shieldLayers = 0; s.rng.combat.s = seedFor((r) => nextFloat(r) < thr && nextFloat(r) < thr);
    expect(fired(s)).toEqual([Weapon.Slot1, 20]);
    const m = lootArmed(LootWeapon.Missile, 1); m.s.rng.combat.s = seedFor((r) => nextFloat(r) < TORP_HIT_BASE); expect(fired(m.s)).toEqual([Weapon.Slot2, 25]);
  });
});
