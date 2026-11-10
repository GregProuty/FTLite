import { describe, it, expect } from 'vitest';
import { lifeSupportInjection } from '../src/renderer/src/sim/hazards/lifeSupport';
import { totalO2, oxygenStep } from '../src/renderer/src/sim/hazards/oxygen';
import { activateBreach, repairBreach } from '../src/renderer/src/sim/hazards/breach';
import { failStation } from '../src/renderer/src/sim/power';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { INJECT_FRAC, HAZARD_DT, STATION_MAX, OUTPUT_SLOW, OUTPUT_FAST, LS_SEATED_BONUS } from '../src/renderer/src/sim/tuning';
import { makeState, run, seconds, room } from './helpers/sim';

const ls = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.LifeSupport]!;

describe('Life Support injection', () => {
  it('requests level-scaled injection per room, more when seated, none when offline or failed', () => {
    const s = makeState(1), i = ls(s), G = room(s, 'G');
    const mid = (OUTPUT_SLOW + OUTPUT_FAST) / 2, unit = INJECT_FRAC * s.derived.volume[G]! * HAZARD_DT * mid;
    lifeSupportInjection(s);
    expect(s.injectionScratch[G]).toBeCloseTo(unit * (2 / STATION_MAX[StationKind.LifeSupport]));
    sitDown(s, 0, i); lifeSupportInjection(s);
    expect(s.injectionScratch[G]).toBeCloseTo(unit * (2 / STATION_MAX[StationKind.LifeSupport]) * (1 + LS_SEATED_BONUS));
    s.stations.level[i] = 3; lifeSupportInjection(s);
    expect(s.injectionScratch[G]).toBeCloseTo(unit * (1 + LS_SEATED_BONUS));
    s.stations.level[i] = 0; lifeSupportInjection(s);
    expect(s.injectionScratch[G]).toBe(0);
    s.stations.level[i] = 2; failStation(s, i); lifeSupportInjection(s);
    expect(s.injectionScratch[G]).toBe(0);
  });
  it('a quiet ship at the starter allocation stays full; with Life Support failed it drains', () => {
    const full = Array.from(makeState(2).derived.volume).reduce((a, b) => a + b, 0);
    const s = makeState(2); s.spawner.nextSpawnTick = 1e9;
    run(s, seconds(60));
    expect(totalO2(s)).toBeGreaterThan(0.99 * full); expect(s.o2Counters.injected).toBeGreaterThan(0);
    const t = makeState(2); t.spawner.nextSpawnTick = 1e9; failStation(t, ls(t));
    run(t, seconds(60));
    expect(t.o2Counters.injected).toBe(0); expect(totalO2(t)).toBeLessThan(totalO2(s));
  });
  it('a breached room receives nothing until repaired (existing oxygenStep rule still applies)', () => {
    const s = makeState(1); s.spawner.nextSpawnTick = 1e9;
    activateBreach(s, 6);
    s.rooms.o2[room(s, 'G')] = 0;
    run(s, seconds(5));
    expect(s.rooms.o2[room(s, 'G')]).toBeLessThan(0.3 * s.derived.volume[room(s, 'G')]!);
  });
  it('injection requested for a breached room adds no mass until the breach is repaired', () => {
    const s = makeState(0), G = room(s, 'G');
    activateBreach(s, 6);
    s.rooms.o2[G] = 0;
    lifeSupportInjection(s);
    expect(s.injectionScratch[G]).toBeGreaterThan(0);                    // requested ...
    const onlyG = new Float64Array(s.injectionScratch.length); onlyG[G] = s.injectionScratch[G]!;   // isolate G: other rooms would absorb injection after neighbour flow
    const before = s.o2Counters.injected;
    oxygenStep(s, onlyG);
    expect(s.o2Counters.injected).toBe(before);                          // ... but refused while breached
    repairBreach(s, 6);
    s.rooms.o2[G] = 0;
    oxygenStep(s, onlyG);
    expect(s.o2Counters.injected).toBeGreaterThan(before);
    expect(s.rooms.o2[G]).toBeGreaterThan(0);
  });
});
