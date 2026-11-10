import { describe, it, expect } from 'vitest';
import { Seated, Position } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { stationOnline, stationOutput, sitDown, standUp } from '../src/renderer/src/sim/stations';
import { powerPool, powerUsed, failStation, repairStation, shiftBar } from '../src/renderer/src/sim/power';
import { REACTOR_CAPACITY, STATION_MAX, OUTPUT_SLOW, OUTPUT_FAST } from '../src/renderer/src/sim/tuning';
import { makeState } from './helpers/sim';

const idx = (s: ReturnType<typeof makeState>, kind: number) => s.derived.stationOfKind[kind]!;

describe('power model', () => {
  it('starts at the ship allocation with one spare bar', () => {
    const s = makeState(2);
    expect(powerUsed(s)).toBe(9); expect(powerPool(s)).toBe(REACTOR_CAPACITY - 9);
    expect(s.stations.level[idx(s, StationKind.LifeSupport)]).toBe(2);
    expect(Array.from(s.stations.occupant)).toEqual([-1, -1, -1, -1, -1, -1, -1]);
    expect(Seated.station[s.crew[0]!]).toBe(-1);
  });
  it('output scales with level over max at the skill-0 midpoint; offline is 0', () => {
    const s = makeState(1), ls = idx(s, StationKind.LifeSupport);
    const mid = (OUTPUT_SLOW + OUTPUT_FAST) / 2;
    expect(stationOutput(s, ls)).toBeCloseTo((2 / STATION_MAX[StationKind.LifeSupport]) * mid);
    s.stations.level[ls] = 0;
    expect(stationOnline(s, ls)).toBe(false); expect(stationOutput(s, ls)).toBe(0);
  });
  it('shiftBar obeys the pool, the max, the Engineering floor and the failed flag', () => {
    const s = makeState(1), nav = idx(s, StationKind.Navigation), eng = idx(s, StationKind.Engineering), wpn = idx(s, StationKind.Weapons);
    expect(shiftBar(s, nav, 1)).toBe(true); expect(powerPool(s)).toBe(0);
    expect(shiftBar(s, nav, 1)).toBe(false);                         // max 2 and pool 0
    expect(shiftBar(s, wpn, -1)).toBe(true); expect(powerPool(s)).toBe(1);
    expect(shiftBar(s, wpn, 1)).toBe(true); expect(shiftBar(s, wpn, 1)).toBe(false);   // back at max 3
    expect(shiftBar(s, eng, -1)).toBe(false);                        // never below 1
    failStation(s, nav);
    expect(shiftBar(s, nav, 1)).toBe(false);                         // failed stations take no bars
    failStation(s, eng);
    expect(shiftBar(s, wpn, -1)).toBe(false);                        // allocations frozen while Engineering is failed
  });
  it('failure returns bars except for Engineering, repair restores Engineering at its level and others at 0', () => {
    const s = makeState(1), ls = idx(s, StationKind.LifeSupport), eng = idx(s, StationKind.Engineering);
    const before = powerPool(s);
    failStation(s, ls);
    expect(s.stations.level[ls]).toBe(0); expect(powerPool(s)).toBe(before + 2); expect(stationOnline(s, ls)).toBe(false);
    repairStation(s, ls);
    expect(s.stations.failed[ls]).toBe(0); expect(s.stations.level[ls]).toBe(0); expect(stationOnline(s, ls)).toBe(false);
    failStation(s, eng);
    expect(s.stations.level[eng]).toBe(1); expect(stationOnline(s, eng)).toBe(false);
    repairStation(s, eng);
    expect(stationOnline(s, eng)).toBe(true); expect(s.stations.level[eng]).toBe(1);
  });
  it('sitDown snaps to the console tile and sets the cursor; standUp and failure clear the seat', () => {
    const s = makeState(2), eng = idx(s, StationKind.Engineering), doors = idx(s, StationKind.Doors);
    sitDown(s, 0, eng);
    expect(Seated.station[s.crew[0]!]).toBe(eng); expect(s.stations.occupant[eng]).toBe(0);
    expect(Position.x[s.crew[0]!]).toBe(18.5); expect(Position.y[s.crew[0]!]).toBe(9.5);
    expect(s.stations.cursor[eng]).toBe(StationKind.Engineering);
    sitDown(s, 1, doors);
    expect(s.stations.cursor[doors]).toBe(0);
    standUp(s, 0);
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[eng]).toBe(-1);
    failStation(s, doors);
    expect(Seated.station[s.crew[1]!]).toBe(-1); expect(s.stations.occupant[doors]).toBe(-1);
  });
  it('Engineering cutting a station to level 0 stands its occupant', () => {
    const s = makeState(2), nav = idx(s, StationKind.Navigation);
    sitDown(s, 1, nav);
    expect(shiftBar(s, nav, -1)).toBe(true);
    expect(s.stations.level[nav]).toBe(0); expect(Seated.station[s.crew[1]!]).toBe(-1); expect(s.stations.occupant[nav]).toBe(-1);
  });
});
