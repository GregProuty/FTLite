import { describe, it, expect } from 'vitest';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation, repairStation, shiftBar } from '../src/renderer/src/sim/power';
import { Seated } from '../src/renderer/src/sim/components';
import { DT, TORP_LOAD_TIME, TORP_REGEN_TIME, TORP_START, TORP_CAP } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, seconds, overdrive } from './helpers/sim';

const wpn = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Weapons]!;

describe('torpedo loading', () => {
  it('loads only while seated and online with stock and an empty tube; completion moves one from stock to the tube', () => {
    const s = makeState(1), i = wpn(s);
    s.director.nextSpawnTick = 1e9;
    expect(s.weapons.torpedoStock).toBe(TORP_START);
    run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(0);                                      // nobody seated
    sitDown(s, 0, i);                                                           // starter level 2: output 0.5
    run(s, 1);
    expect(s.weapons.torpedoLoad).toBeCloseTo(DT * 0.5 / TORP_LOAD_TIME);
    run(s, seconds(TORP_LOAD_TIME / 0.5) + 2);                                  // 20 s
    expect(s.weapons.torpedoLoaded).toBe(1); expect(s.weapons.torpedoStock).toBe(TORP_START - 1); expect(s.weapons.torpedoLoad).toBe(0);
    run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(0);                                      // tube full: no second load
    s.weapons.torpedoLoaded = 0; s.weapons.torpedoStock = 0;
    run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(0);                                      // no stock
  });
  it('standing or failing mid-load keeps progress and stock; a loaded torpedo survives both; level 1 and overdrive load in 40 s and 10 s', () => {
    const s = makeState(2), i = wpn(s);
    s.director.nextSpawnTick = 1e9; sitDown(s, 0, i);
    run(s, seconds(5));
    run(s, 1, () => intents({ cancelPressed: true }, {}));                       // loadTorpedo precedes the stand: this tick still loads once
    const partial = s.weapons.torpedoLoad; expect(partial).toBeGreaterThan(0);
    run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(partial); expect(s.weapons.torpedoStock).toBe(TORP_START);
    sitDown(s, 0, i); failStation(s, i); run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(partial); expect(Seated.station[s.crew[0]!]).toBe(-1);
    repairStation(s, i); shiftBar(s, i, 1); shiftBar(s, i, 1);                 // back online at level 2 (the pool had 1 + 2 returned bars)
    s.weapons.torpedoLoaded = 1; sitDown(s, 0, i);
    run(s, 1, () => intents({ cancelPressed: true }, {})); failStation(s, i);
    expect(s.weapons.torpedoLoaded).toBe(1);
    const a = makeState(1), ia = wpn(a); a.director.nextSpawnTick = 1e9; a.stations.level[ia] = 1; sitDown(a, 0, ia);
    run(a, seconds(40) - 2); expect(a.weapons.torpedoLoaded).toBe(0);           // level 1 (output 0.25): 40 s
    run(a, 4); expect(a.weapons.torpedoLoaded).toBe(1);
    const b = makeState(1), ib = overdrive(b, StationKind.Weapons); b.director.nextSpawnTick = 1e9; b.stations.coolant[ib] = 2; sitDown(b, 0, ib);   // two units hold the overdrive (unassisted it would overheat on tick 595)
    run(b, seconds(10) + 2); expect(b.weapons.torpedoLoaded).toBe(1);
    run(a, seconds(39)); expect(a.weapons.torpedoLoaded).toBe(1); expect(a.weapons.torpedoLoad).toBe(0);   // tube full: nothing loads until it is fired
  });
});

describe('torpedo regeneration', () => {
  it('adds one unit every TORP_REGEN_TIME s while Weapons is online, seated or not; holds at the cap; pauses offline', () => {
    const s = makeState(1), i = wpn(s);
    s.director.nextSpawnTick = 1e9;
    run(s, 1);
    expect(s.weapons.torpedoRegen).toBeCloseTo(DT / TORP_REGEN_TIME);
    run(s, seconds(TORP_REGEN_TIME) + 1);
    expect(s.weapons.torpedoStock).toBe(TORP_START + 1); expect(s.weapons.torpedoRegen).toBeLessThan(0.01);
    s.weapons.torpedoStock = TORP_CAP; s.weapons.torpedoRegen = 0.5;
    run(s, 60);
    expect(s.weapons.torpedoStock).toBe(TORP_CAP); expect(s.weapons.torpedoRegen).toBe(0.5);   // holds at the cap
    s.weapons.torpedoStock = 2; failStation(s, i);
    run(s, 60);
    expect(s.weapons.torpedoRegen).toBe(0.5);                                   // offline: paused
  });
});
