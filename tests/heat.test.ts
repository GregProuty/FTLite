import { describe, it, expect } from 'vitest';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { stationOutput } from '../src/renderer/src/sim/stations';
import { shiftBar, maxLevel, failStation } from '../src/renderer/src/sim/power';
import { isOverdriven, coolingPerUnit, coolantUsed, cycleCoolant } from '../src/renderer/src/sim/heat';
import { STATION_MAX, STATION_OVERDRIVE, HEAT_COOL_UNIT, COOLANT_POOL, COOLANT_MAX_PER_STATION } from '../src/renderer/src/sim/tuning';
import { makeState, overdrive } from './helpers/sim';

const idx = (s: ReturnType<typeof makeState>, kind: number) => s.derived.stationOfKind[kind]!;

describe('overdrive ceiling', () => {
  it('every kind but Engineering may hold one bar above STATION_MAX', () => {
    for (let k = 0; k < STATION_MAX.length; k++) expect(maxLevel(k)).toBe(STATION_MAX[k]! + (k === StationKind.Engineering ? 0 : STATION_OVERDRIVE));
    const s = makeState(1), nav = idx(s, StationKind.Navigation), eng = idx(s, StationKind.Engineering);
    s.power.capacity = 20;
    expect(shiftBar(s, nav, 1)).toBe(true); expect(shiftBar(s, nav, 1)).toBe(true);   // 1 -> 2 -> 3
    expect(s.stations.level[nav]).toBe(3); expect(isOverdriven(s, nav)).toBe(true);
    expect(shiftBar(s, nav, 1)).toBe(false);                                             // never above max + 1
    expect(shiftBar(s, eng, 1)).toBe(false); expect(isOverdriven(s, eng)).toBe(false);  // Engineering stays at 1
    expect(shiftBar(s, nav, -1)).toBe(true); expect(isOverdriven(s, nav)).toBe(false);  // back to max is an ordinary move
  });
  it('isOverdriven is false for a failed station; output scales past 1 while overdriven', () => {
    const s = makeState(1), nav = overdrive(s, StationKind.Navigation), wpn = overdrive(s, StationKind.Weapons);
    expect(stationOutput(s, nav)).toBeCloseTo(1.125); expect(stationOutput(s, wpn)).toBeCloseTo(1.0);
    failStation(s, nav);
    expect(isOverdriven(s, nav)).toBe(false); expect(s.stations.level[nav]).toBe(0);
  });
});

describe('coolant', () => {
  it('cycles 0, 1, 2, 0 on a station; the pool caps the total; Engineering holds none', () => {
    const s = makeState(1), wpn = idx(s, StationKind.Weapons), sci = idx(s, StationKind.Science), eng = idx(s, StationKind.Engineering);
    expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT);
    expect(cycleCoolant(s, wpn)).toBe(true); expect(s.stations.coolant[wpn]).toBe(1);
    expect(cycleCoolant(s, wpn)).toBe(true); expect(s.stations.coolant[wpn]).toBe(2);
    expect(cycleCoolant(s, wpn)).toBe(true); expect(s.stations.coolant[wpn]).toBe(0);     // wraps past the per-station cap
    cycleCoolant(s, wpn); cycleCoolant(s, wpn); cycleCoolant(s, sci);                       // 2 + 1 = 3 used
    expect(coolantUsed(s)).toBe(3);
    expect(cycleCoolant(s, sci)).toBe(true); expect(s.stations.coolant[sci]).toBe(2); expect(coolantUsed(s)).toBe(COOLANT_POOL);
    const nav = idx(s, StationKind.Navigation);
    expect(cycleCoolant(s, nav)).toBe(false); expect(s.stations.coolant[nav]).toBe(0);     // pool exhausted: the step wraps to 0, nothing changes
    expect(cycleCoolant(s, eng)).toBe(false); expect(s.stations.coolant[eng]).toBe(0);
    expect(cycleCoolant(s, -1)).toBe(false);
    expect(COOLANT_MAX_PER_STATION).toBe(2);
  });
});
