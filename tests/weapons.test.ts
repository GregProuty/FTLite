import { describe, it, expect } from 'vitest';
import { beamHits, torpedoHits, chargeBeam, fireWeapon, Weapon } from '../src/renderer/src/sim/weapons';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Seated } from '../src/renderer/src/sim/components';
import { BEAM_CHARGE_TIME, DT } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, placeDebris, room, seconds } from './helpers/sim';
import { createRng, nextFloat } from '../src/shared/rng';

const wpn = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Weapons]!;
const up = { moveY: -1 }, down = { moveY: 1 }, left = { moveX: -1 }, right = { moveX: 1 }, confirm = { confirmPressed: true };

describe('beam charge', () => {
  it('progresses only while seated and online, scales with level, is kept on stand and on failure', () => {
    const s = makeState(1), i = wpn(s);
    s.spawner.nextSpawnTick = 1e9;
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
    s.spawner.nextSpawnTick = 1e9;
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
    s.spawner.nextSpawnTick = 1e9; placeDebris(s, A, 600, 1); sitDown(s, 0, i); s.weapons.charge = 1;
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
    s.spawner.nextSpawnTick = 1e9; placeDebris(s, A, 600, 1, undefined, frequency); sitDown(s, 0, i);
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
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, i); s.weapons.charge = 1; s.weapons.torpedoLoaded = 1;
    const c0 = s.rng.combat.s;
    run(s, 1, () => intents(confirm));
    expect(s.weapons.charge).toBe(1); expect(s.weapons.torpedoLoaded).toBe(1); expect(s.rng.combat.s).toBe(c0);   // no target
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
