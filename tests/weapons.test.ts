import { describe, it, expect } from 'vitest';
import { LOCK_SECONDS, LOCK_HIT_BONUS, ENEMY_SYS_HP } from '../src/renderer/src/sim/tuning';
import { enemyBeamThreshold, EnemySystem } from '../src/renderer/src/sim/enemy';
import { buildHudModel, type WeaponsPanel } from '../src/renderer/src/render/hudModel';
import fc from 'fast-check';
import { beamHits, torpedoHits, chargeBeam, fireWeapon, Weapon } from '../src/renderer/src/sim/weapons';
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
    expect(s.stations.cursor[i]).toBe(-1);
    run(s, 10, () => intents(down));
    expect(s.stations.cursor[i]).toBe(-1);                                         // stick does nothing with no targets
    placeDebris(s, A, seconds(3));                                                 // inside the unmanned lead: warned next tick
    run(s, 1);
    expect(s.debris.warned[0]).toBe(1); expect(s.stations.cursor[i]).toBe(0);      // auto-selected
    placeDebris(s, A, 600, 1, 50); placeDebris(s, A, 600, 1, 40);                   // slots 1 (id 50) and 2 (id 40); slot 0 has the smallest id
    run(s, 1, () => intents(down)); run(s, 1, () => intents({}));
    expect(s.stations.cursor[i]).toBe(2);                                          // next by id: 40
    run(s, 1, () => intents(down)); run(s, 1, () => intents({}));
    expect(s.stations.cursor[i]).toBe(1);                                          // 50
    run(s, 1, () => intents(down)); run(s, 1, () => intents({}));
    expect(s.stations.cursor[i]).toBe(0);                                          // wraps
    run(s, 1, () => intents(up)); run(s, 1, () => intents({}));
    expect(s.stations.cursor[i]).toBe(1);                                          // wraps backwards to the largest id
    run(s, 1, () => intents(right)); expect(s.stations.cursor[i]).toBe(1);   // left/right leave the target alone
    run(s, 1, () => intents({ cancelPressed: true }));
    const t = makeState(1), j = wpn(t); placeDebris(t, A, 600, 1, 9); placeDebris(t, A, 600, 1, 8);
    sitDown(t, 0, j);
    expect(t.stations.cursor[j]).toBe(1);                                          // smallest id on sit
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
    edge(down); expect(s.weapons.selector).toBe(Weapon.Torpedo); expect(s.stations.cursor[i]).toBe(0);
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
    expect(fireWeapon(hit.s)).toBe(true);
    expect(hit.s.debris.active[0]).toBe(0); expect(hit.s.weapons.charge).toBe(0); expect(hit.s.weapons.torpedoLoaded).toBe(1); expect(hit.s.rng.combat.s).toBe(hit.one.s);
    const miss = armed(Weapon.BeamF1, 2, 1);                                     // mismatch threshold 0.20
    expect(fireWeapon(miss.s)).toBe(false);
    expect(miss.s.debris.active[0]).toBe(1); expect(miss.s.weapons.charge).toBe(0); expect(miss.s.weapons.torpedoLoaded).toBe(1); expect(miss.s.rng.combat.s).toBe(miss.one.s);
    const unscanned = armed(Weapon.BeamF3, 3, 1);                                // the true frequency decides, scanned or not
    expect(unscanned.s.debris.scanned[0]).toBe(0); expect(fireWeapon(unscanned.s)).toBe(true);
  });
  it('a torpedo hits on 0.627 regardless of frequency, misses on 0.956, clears loaded either way and leaves the beam charge', () => {
    const hit = armed(Weapon.Torpedo, 1, 1);
    expect(fireWeapon(hit.s)).toBe(true);
    expect(hit.s.debris.active[0]).toBe(0); expect(hit.s.weapons.torpedoLoaded).toBe(0); expect(hit.s.weapons.charge).toBe(1); expect(hit.s.weapons.torpedoStock).toBe(3); expect(hit.s.rng.combat.s).toBe(hit.one.s);
    const miss = armed(Weapon.Torpedo, 1, 36);
    expect(fireWeapon(miss.s)).toBe(false);
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
    placeDebris(s, A, 600, 1); s.stations.cursor[i] = 0;
    s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoaded = 0; s.weapons.torpedoStock = 0;
    run(s, 1, () => intents(confirm));
    expect(s.debris.active[0]).toBe(1); expect(s.weapons.charge).toBe(1); expect(s.rng.combat.s).toBe(c0);
    s.weapons.selector = Weapon.BeamF1; s.weapons.charge = 0.5; s.weapons.torpedoLoaded = 1;
    run(s, 1, () => intents(confirm));
    expect(s.debris.active[0]).toBe(1); expect(s.weapons.torpedoLoaded).toBe(1); expect(s.rng.combat.s).toBe(c0);
    const unwarned = placeDebris(s, A, 600, 0); s.stations.cursor[i] = unwarned; s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoStock = 2;
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
      if (s.stations.cursor[i]! < 0) return false;
      const output = 0.5;                                                         // starter Weapons level 2, online throughout (spawner off, nobody fails it)
      let shots = 0, loadsCompleted = 0, prevStock = s.weapons.torpedoStock;
      // One tick with every check: exactly one combat draw per predicted shot, stock moves only at a predicted load completion.
      const tick = (dir: object, confirm: boolean): boolean => {
        if (s.stations.cursor[i]! < 0) s.stations.cursor[i] = warnedTargets(s)[0] ?? -1;   // keep a target selected: a hit leaves -1, and an Up/Down edge would otherwise retarget and fire inside the tick
        const w = s.weapons, c = s.stations.cursor[i]!;
        // Readiness after this tick's increments, computed with the sim's own arithmetic (charging and loading precede input).
        const chargeAfter = Math.min(1, w.charge + DT * output / BEAM_CHARGE_TIME);
        const loadCompletes = w.torpedoLoaded === 0 && w.torpedoStock > 0 && Math.min(1, w.torpedoLoad + DT * output / TORP_LOAD_TIME) >= 1;
        const ready = w.selector === Weapon.Torpedo ? (w.torpedoLoaded === 1 || loadCompletes) : chargeAfter >= 1;
        const target = c >= 0 && s.debris.active[c] === 1 && s.debris.warned[c] === 1;
        const willShoot = confirm && ready && target;
        const expected = createRng(s.rng.combat.s); if (willShoot) nextFloat(expected);
        run(s, 1, () => intents({ ...dir, confirmPressed: confirm }));
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
    const i = wpn(s); sitDown(s, 0, i); s.stations.cursor[i] = slot; s.weapons.charge = 1; s.weapons.torpedoLoaded = 1; s.weapons.selector = selector; s.rng.combat.s = seed; s.tick = 777;
    return s;
  };
  const rec = (s: ReturnType<typeof makeState>) => [s.weapons.lastShotTick, s.weapons.lastShotTarget, s.weapons.lastShotResult, s.weapons.lastShotKind];
  it('starts empty', () => { expect(rec(makeState(1))).toEqual([-1, -1, 0, 0]); });
  it('beam miss, strip, system hit, hull hit; torpedo hit and miss at the enemy', () => {
    expect(rec((() => { const s = atEnemy(ENEMY_SLOT, Weapon.BeamF1, MISS); fireWeapon(s); return s; })())).toEqual([777, ENEMY_SLOT, 0, 0]);
    expect(rec((() => { const s = atEnemy(ENEMY_SLOT, Weapon.BeamF2, HIT); fireWeapon(s); expect(s.enemy.shieldLayers).toBe(0); return s; })())).toEqual([777, ENEMY_SLOT, 1, 0]);
    expect(rec((() => { const s = atEnemy(ENEMY_WEAPONS_SLOT, Weapon.BeamF1, HIT); fireWeapon(s); return s; })())).toEqual([777, ENEMY_WEAPONS_SLOT, 2, 0]);
    expect(rec((() => { const s = atEnemy(ENEMY_SLOT, Weapon.BeamF1, HIT); fireWeapon(s); return s; })())).toEqual([777, ENEMY_SLOT, 2, 0]);
    expect(rec((() => { const s = atEnemy(ENEMY_SHIELDS_SLOT, Weapon.Torpedo, HIT); fireWeapon(s); return s; })())).toEqual([777, ENEMY_SHIELDS_SLOT, 2, 1]);
    expect(rec((() => { const s = atEnemy(ENEMY_SLOT, Weapon.Torpedo, MISS); fireWeapon(s); return s; })())).toEqual([777, ENEMY_SLOT, 0, 1]);
  });
  it('a beam hit on debris records the debris slot', () => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A'); s.director.nextSpawnTick = 1e9;
    const k = placeDebris(s, A, 600, 1, undefined, 1); sitDown(s, 0, i); s.stations.cursor[i] = k; s.weapons.charge = 1; s.weapons.selector = Weapon.BeamF1; s.rng.combat.s = HIT; s.tick = 50;
    expect(fireWeapon(s)).toBe(true); expect(rec(s)).toEqual([50, k, 2, 0]);
  });
  it('a refused fire writes nothing', () => {
    const s = atEnemy(ENEMY_SLOT, Weapon.BeamF1, HIT); s.weapons.charge = 0.5; fireWeapon(s); expect(rec(s)).toEqual([-1, -1, 0, 0]);
    const t = atEnemy(ENEMY_SLOT, Weapon.Torpedo, HIT); t.weapons.torpedoLoaded = 0; fireWeapon(t); expect(rec(t)).toEqual([-1, -1, 0, 0]);
    const u = atEnemy(-1, Weapon.BeamF1, HIT); fireWeapon(u); expect(rec(u)).toEqual([-1, -1, 0, 0]);
  });
});

describe('beams under the Science lock (spec Coop-i section 1, amendments C1 and C2)', () => {
  const seedWhere = (ok: (u: number) => boolean): number => { for (let seed = 1; seed <= 2000; seed++) if (ok(nextFloat(createRng(seed)))) return seed; throw new Error('no seed'); };
  const LOW = seedWhere((u) => u < 0.3), MID = seedWhere((u) => u >= 0.72 && u < 0.83), MISS = seedWhere((u) => u > 0.97);
  const atEnemy = (selector: number, seed: number, locked: boolean, freq = 1) => {
    const s = makeState(2); s.director.nextSpawnTick = 1e9; placeEnemy(s, ENEMY_HULL, freq); s.enemy.nextShotTick = 1e9; s.tick = 6000;
    const i = wpn(s); sitDown(s, 0, i); s.stations.cursor[i] = ENEMY_SLOT; s.weapons.charge = 1; s.weapons.torpedoLoaded = 1; s.weapons.selector = selector; s.rng.combat.s = seed;
    if (locked) s.enemy.lockUntilTick = s.tick + LOCK_SECONDS * 60;
    return s;
  };
  it('the threshold the seeds straddle: 0.70 unlocked, 0.85 locked', () => {
    const s = atEnemy(Weapon.BeamF1, MID, true); expect(enemyBeamThreshold(s, 0.5)).toBeCloseTo(0.70); expect(LOCK_HIT_BONUS).toBe(0.15);
  });
  it('a locked beam is tuned for any selector: a hull hit, no strip; lockedShots counts', () => {
    for (const sel of [Weapon.BeamF1, Weapon.BeamF2, Weapon.BeamF3]) {
      const s = atEnemy(sel, LOW, true, 2);
      expect(fireWeapon(s)).toBe(true);
      expect([s.weapons.lastShotResult, s.enemy.shieldLayers, s.enemy.hull, s.telemetry.lockedShots, s.telemetry.shieldHits]).toEqual([2, 1, ENEMY_HULL - 15, 1, 0]);
    }
  });
  it('the lock adds 0.15 to the hit threshold while a layer is up: u in [0.72, 0.83) misses unlocked and hits locked', () => {
    const a = atEnemy(Weapon.BeamF1, MID, false); expect(fireWeapon(a)).toBe(false);
    const b = atEnemy(Weapon.BeamF1, MID, true); expect(fireWeapon(b)).toBe(true); expect(b.weapons.lastShotResult).toBe(2);
  });
  it('the solo path: a matching selector without a lock still fires tuned; a mismatch strips', () => {
    const a = atEnemy(Weapon.BeamF2, LOW, false, 2); fireWeapon(a); expect([a.weapons.lastShotResult, a.enemy.shieldLayers, a.telemetry.lockedShots]).toEqual([2, 1, 0]);
    const b = atEnemy(Weapon.BeamF1, LOW, false, 2); fireWeapon(b); expect([b.weapons.lastShotResult, b.enemy.shieldLayers]).toEqual([1, 0]);
  });
  it('with the shields system down or no layer up every beam is tuned as today, and the lock adds nothing', () => {
    const a = atEnemy(Weapon.BeamF1, MID, true, 2); a.enemy.sysHp[EnemySystem.Shields] = 0; a.enemy.shieldLayers = 0; expect(fireWeapon(a)).toBe(false);
    const b = atEnemy(Weapon.BeamF1, MID, true, 2); b.enemy.shieldLayers = 0; expect(fireWeapon(b)).toBe(false);
    const c = atEnemy(Weapon.BeamF1, LOW, false, 2); c.enemy.shieldLayers = 0; fireWeapon(c); expect(c.weapons.lastShotResult).toBe(2);
    expect(a.enemy.sysHp[EnemySystem.Shields]).toBe(0); expect(ENEMY_SYS_HP).toBeGreaterThan(0);
  });
  it('each fired beam makes exactly one combat draw, locked or not; a locked hit draws what a matched hit draws', () => {
    for (const locked of [false, true]) { const s = atEnemy(Weapon.BeamF1, MISS, locked); fireWeapon(s); const r = createRng(MISS); nextFloat(r); expect(s.rng.combat.s).toBe(r.s); }
    const l = atEnemy(Weapon.BeamF1, LOW, true, 2), m = atEnemy(Weapon.BeamF2, LOW, false, 2); fireWeapon(l); fireWeapon(m);
    expect(l.rng.combat.s).toBe(m.rng.combat.s); expect(l.enemy.hull).toBe(m.enemy.hull);
  });
  it('a torpedo under the lock is not a locked shot; an expired lock does nothing', () => {
    const t = atEnemy(Weapon.Torpedo, LOW, true); fireWeapon(t); expect(t.telemetry.lockedShots).toBe(0);
    const e = atEnemy(Weapon.BeamF1, MID, true); e.tick = e.enemy.lockUntilTick; expect(fireWeapon(e)).toBe(false); expect(e.telemetry.lockedShots).toBe(0);
  });
  it('the Weapons card reads locked while a lock runs', () => {
    const s = atEnemy(Weapon.BeamF1, LOW, true);
    const card = () => buildHudModel(s, [{ status: 'active', key: 'kb:0' }, { status: 'active', key: 'kb:1' }], 'running', '').players[0]!.console as WeaponsPanel;
    expect(card().locked).toBe(true); s.enemy.lockUntilTick = -1; expect(card().locked).toBe(false);
  });
});
