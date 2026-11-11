import { describe, it, expect } from 'vitest';
import { Seated, Position } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { stationOnline, stationOutput, sitDown, standUp } from '../src/renderer/src/sim/stations';
import { powerPool, powerUsed, failStation, repairStation, shiftBar, maxLevel, bonusBars, powerCapacity, shedPower, SHED_ORDER } from '../src/renderer/src/sim/power';
import { REACTOR_CAPACITY, STATION_MAX, OUTPUT_SLOW, OUTPUT_FAST, COOLANT_POOL } from '../src/renderer/src/sim/tuning';
import { makeState, setSkill, run, intents } from './helpers/sim';
import { Skill } from '../src/renderer/src/sim/skills';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { reviveCrew } from '../src/renderer/src/sim/crew';
import fc from 'fast-check';

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
  it('refuses a bar at maxLevel even with spare power, and below it when the pool is empty', () => {
    const s = makeState(1), nav = idx(s, StationKind.Navigation), wpn = idx(s, StationKind.Weapons);
    s.stations.level[nav] = maxLevel(StationKind.Navigation); s.stations.level[wpn] = 0;
    expect(powerPool(s)).toBeGreaterThan(0);
    expect(shiftBar(s, nav, 1)).toBe(false); expect(s.stations.level[nav]).toBe(maxLevel(StationKind.Navigation));
    s.stations.level[nav] = 0; s.stations.level[wpn] += powerPool(s);    // drain the pool while Navigation is below its ceiling
    expect(powerPool(s)).toBe(0);
    expect(shiftBar(s, nav, 1)).toBe(false); expect(s.stations.level[nav]).toBe(0);
  });
  it('shiftBar reaches max + 1 and no further; -1 from the overdrive bar returns it to the pool', () => {
    const s = makeState(1), doors = idx(s, StationKind.Doors);
    expect(powerPool(s)).toBe(1);
    expect(shiftBar(s, doors, 1)).toBe(true); expect(s.stations.level[doors]).toBe(STATION_MAX[StationKind.Doors]! + 1); expect(powerPool(s)).toBe(0);
    s.power.capacity += 1;
    expect(shiftBar(s, doors, 1)).toBe(false);
    expect(shiftBar(s, doors, -1)).toBe(true); expect(powerPool(s)).toBe(2);
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

describe('bonus bars and shedding', () => {
  it('a level-8 engineer adds two bars while seated; level 3 adds none; standing sheds in SHED_ORDER down to the base capacity', () => {
    const s = makeState(2), eng = idx(s, StationKind.Engineering), doors = idx(s, StationKind.Doors), med = idx(s, StationKind.Medbay), sci = idx(s, StationKind.Science);
    s.director.nextSpawnTick = 1e9;
    setSkill(s, 0, Skill.Engineering, 3); sitDown(s, 0, eng);
    expect(bonusBars(s)).toBe(0); expect(powerCapacity(s)).toBe(REACTOR_CAPACITY); expect(powerPool(s)).toBe(1);
    setSkill(s, 0, Skill.Engineering, 8);
    expect(bonusBars(s)).toBe(2); expect(powerCapacity(s)).toBe(REACTOR_CAPACITY + 2); expect(powerPool(s)).toBe(3);
    expect(shiftBar(s, sci, 1)).toBe(true);                                        // the original spare: Science 1 -> 2
    expect(shiftBar(s, med, 1)).toBe(true); expect(shiftBar(s, med, 1)).toBe(true);   // both bonus bars: Medbay 1 -> 3 (overdrive)
    expect(powerUsed(s)).toBe(12); expect(powerPool(s)).toBe(0); expect(s.stations.level[doors]).toBe(1);
    sitDown(s, 1, doors);
    run(s, 1, () => intents({ cancelPressed: true }, {}));                           // the engineer stands: capacity back to 10, usage 12
    expect(powerUsed(s)).toBe(REACTOR_CAPACITY);
    expect(s.stations.level[doors]).toBe(0); expect(s.stations.level[med]).toBe(2);   // Doors first (1 -> 0, standing player 1), then Medbay (3 -> 2)
    expect(Seated.station[s.crew[1]!]).toBe(-1); expect(s.stations.level[sci]).toBe(2);
    sitDown(s, 0, eng);
    expect(powerPool(s)).toBe(2); expect(s.stations.level[doors]).toBe(0);         // restored capacity does not restore shed bars
  });
  it('failing Engineering with bonus bars allocated sheds despite the allocation freeze; a Downed engineer sheds through crewSystem', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering), sci = idx(s, StationKind.Science), med = idx(s, StationKind.Medbay);
    s.director.nextSpawnTick = 1e9; setSkill(s, 0, Skill.Engineering, 8); sitDown(s, 0, eng);
    shiftBar(s, sci, 1); shiftBar(s, med, 1); shiftBar(s, med, 1);
    expect(powerUsed(s)).toBe(12);
    failStation(s, eng);
    expect(powerUsed(s)).toBe(REACTOR_CAPACITY); expect(s.stations.level[eng]).toBe(1); expect(shiftBar(s, sci, -1)).toBe(false);   // shed happened; the freeze still holds for input
    const t = makeState(1), engT = idx(t, StationKind.Engineering), sciT = idx(t, StationKind.Science), medT = idx(t, StationKind.Medbay);
    t.director.nextSpawnTick = 1e9; setSkill(t, 0, Skill.Engineering, 8); sitDown(t, 0, engT);
    shiftBar(t, sciT, 1); shiftBar(t, medT, 1); shiftBar(t, medT, 1);
    Health.cur[t.crew[0]!] = 0.01; t.rooms.fire[t.derived.stationRoom[engT]!] = 1;   // burning Engineering room downs the operator this tick
    run(t, 1);
    expect(Seated.station[t.crew[0]!]).toBe(-1); expect(powerUsed(t)).toBe(REACTOR_CAPACITY);
  });
  it('shedding keeps the Engineering floor when everything else is empty', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering);
    for (let i = 0; i < s.stations.level.length; i++) s.stations.level[i] = 0;
    s.stations.level[eng] = 1; s.power.capacity = 0;                                 // an impossible deficit: nothing to shed below the floor
    shedPower(s);
    expect(s.stations.level[eng]).toBe(1); expect(powerUsed(s)).toBe(1);
    expect(SHED_ORDER[0]).toBe(StationKind.Doors); expect(SHED_ORDER[SHED_ORDER.length - 1]).toBe(StationKind.Engineering);
  });
  it('shedding one bar at a time follows SHED_ORDER through every station down to the Engineering floor', () => {
    const s = makeState(1);
    for (let i = 0; i < s.stations.level.length; i++) s.stations.level[i] = 1;      // one bar everywhere: usage 7
    s.power.capacity = 7;
    const removed: number[] = [];
    for (let cap = 6; cap >= 0; cap--) {
      s.power.capacity = cap; shedPower(s);
      for (let i = 0; i < s.stations.level.length; i++) if (s.stations.level[i] === 0 && !removed.includes(s.derived.stationKind[i]!)) removed.push(s.derived.stationKind[i]!);
    }
    expect(removed).toEqual([StationKind.Doors, StationKind.Medbay, StationKind.Science, StationKind.Weapons, StationKind.Navigation, StationKind.LifeSupport]);   // Engineering keeps its bar
    expect(s.stations.level[idx(s, StationKind.Engineering)]).toBe(1); expect(powerUsed(s)).toBe(1);
  });
  it('property: with an engineer of level 3, 4, 7 or 8, random inputs, sits, stands and downings keep usage within capacity, coolant within the pool and levels within maxLevel', () => {
    const arbDir = fc.constantFrom({}, { moveY: -1 }, { moveY: 1 }, { moveX: -1 }, { moveX: 1 });
    const arbScript = fc.array(fc.record({ dir: arbDir, confirm: fc.boolean(), stand: fc.boolean(), down: fc.boolean() }), { minLength: 20, maxLength: 200 });
    fc.assert(fc.property(fc.integer({ min: 1, max: 1e6 }), fc.constantFrom(3, 4, 7, 8), arbScript, (seed, level, script) => {
      const s = makeState(2, seed), eng = idx(s, StationKind.Engineering), eid = s.crew[0]!;   // a second, idle crew member keeps the run alive through downings
      s.director.nextSpawnTick = 1e9; setSkill(s, 0, Skill.Engineering, level); sitDown(s, 0, eng);
      const fill = () => { for (const kind of [StationKind.Science, StationKind.Medbay, StationKind.Navigation, StationKind.Weapons]) while (shiftBar(s, idx(s, kind), 1)) { /* spend the whole pool, bonus bars included */ } };
      let usedAboveBase = false, ticks = 0;
      for (const e of script) {
        for (let t = 0; t < 5; t++) {
          if (Life.state[eid] === LifeState.Downed) reviveCrew(s, eid);                      // bring them back so the run keeps using the seat
          if (Seated.station[eid]! < 0 && !e.stand) { sitDown(s, 0, eng); fill(); }         // re-seat and allocate everything the bonus bars allow
          if (e.down && t === 2 && Seated.station[eid]! >= 0) Health.cur[eid] = 0;          // crewSystem downs them this tick: a forced stand through downCrew
          run(s, 1, () => intents({ ...e.dir, confirmPressed: e.confirm, cancelPressed: e.stand && t === 0 }, {}));
          ticks++;
          if (s.ended) return false;                                                        // the run must stay alive for the whole script
          if (powerUsed(s) > s.power.capacity) usedAboveBase = true;
          if (powerUsed(s) > powerCapacity(s)) return false;
          let coolant = 0;
          for (let i = 0; i < s.stations.level.length; i++) { coolant += s.stations.coolant[i]!; if (s.stations.level[i]! > maxLevel(s.derived.stationKind[i]!)) return false; }
          if (coolant > COOLANT_POOL) return false;
        }
      }
      return ticks === script.length * 5 && (level < 4 || usedAboveBase);                   // every tick ran; eligible engineers actually used bonus bars
    }), { numRuns: 25 });
  });
});
