import { describe, it, expect } from 'vitest';
import { beamHits, chargeBeam, fireBeam } from '../src/renderer/src/sim/weapons';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Seated } from '../src/renderer/src/sim/components';
import { BEAM_CHARGE_TIME, DT } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, placeDebris, room, seconds } from './helpers/sim';
import { createRng, nextFloat } from '../src/shared/rng';

const wpn = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Weapons]!;
const up = { moveY: -1 }, down = { moveY: 1 }, confirm = { confirmPressed: true };

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
    run(s, 1, () => intents({ cancelPressed: true }));
    const t = makeState(1), j = wpn(t); placeDebris(t, A, 600, 1, 9); placeDebris(t, A, 600, 1, 8);
    sitDown(t, 0, j);
    expect(t.stations.cursor[j]).toBe(1);                                          // smallest id on sit
  });
});

describe('firing', () => {
  it('a hit destroys the target and resets charge; a miss keeps it and resets charge; one combat draw per shot', () => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A');
    placeDebris(s, A, 600, 1); sitDown(s, 0, i); s.weapons.charge = 1; s.rng.combat.s = 7;        // first draw 0.012 < 0.70: hit
    const oneDraw = createRng(7); nextFloat(oneDraw);
    expect(fireBeam(s)).toBe(true);
    expect(s.debris.active[0]).toBe(0); expect(s.weapons.charge).toBe(0); expect(s.stations.cursor[i]).toBe(-1); expect(s.rng.combat.s).toBe(oneDraw.s);
    const t = makeState(1), j = wpn(t);
    placeDebris(t, A, 600, 1); sitDown(t, 0, j); t.weapons.charge = 1; t.rng.combat.s = 4;        // first draw 0.924 >= 0.70: miss
    const oneDrawMiss = createRng(4); nextFloat(oneDrawMiss);
    expect(fireBeam(t)).toBe(false);
    expect(t.debris.active[0]).toBe(1); expect(t.weapons.charge).toBe(0); expect(t.stations.cursor[j]).toBe(0); expect(t.rng.combat.s).toBe(oneDrawMiss.s);
  });
  it('Confirm with no charge or no target does nothing and draws nothing', () => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
    sitDown(s, 0, i); s.weapons.charge = 1;
    const c0 = s.rng.combat.s;
    run(s, 1, () => intents(confirm));
    expect(s.weapons.charge).toBe(1); expect(s.rng.combat.s).toBe(c0);              // no target
    placeDebris(s, A, 600, 1); s.stations.cursor[i] = 0; s.weapons.charge = 0.5;
    run(s, 1, () => intents(confirm));
    expect(s.debris.active[0]).toBe(1); expect(s.rng.combat.s).toBe(c0);           // no charge: the shot is refused, nothing consumed
    expect(s.weapons.charge).toBeGreaterThan(0.5);                                 // charging continued that tick
  });
  it('beamHits thresholds at Weapons levels 1, 2 and 3 and is monotonic in output', () => {
    // Values sit clear of the float boundary (0.55 + 0.30 x 0.25 is not exactly 0.625 in floats).
    expect(beamHits(0.61, 0.25)).toBe(true); expect(beamHits(0.64, 0.25)).toBe(false);     // level 1 threshold 0.625
    expect(beamHits(0.69, 0.5)).toBe(true); expect(beamHits(0.71, 0.5)).toBe(false);       // level 2 threshold 0.70
    expect(beamHits(0.76, 0.75)).toBe(true); expect(beamHits(0.79, 0.75)).toBe(false);     // level 3 threshold 0.775
    for (const u of [0.1, 0.6, 0.7, 0.9]) expect(Number(beamHits(u, 0.75))).toBeGreaterThanOrEqual(Number(beamHits(u, 0.25)));
  });
});
