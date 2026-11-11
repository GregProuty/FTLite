import { describe, it, expect } from 'vitest';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { stationOutput, sitDown } from '../src/renderer/src/sim/stations';
import { shiftBar, maxLevel, failStation, repairStation } from '../src/renderer/src/sim/power';
import { isOverdriven, coolingPerUnit, coolantUsed, cycleCoolant, heatStep } from '../src/renderer/src/sim/heat';
import { STATION_MAX, STATION_OVERDRIVE, HEAT_COOL_UNIT, COOLANT_POOL, COOLANT_MAX_PER_STATION, HEAT_MAX, HEAT_RISE, HEAT_COOL_IDLE, HAZARD_EVERY, FIRE_START, HULL_MAX, HEALTH_MAX, DEBRIS_HULL_DAMAGE, SPAWN_CAP, HEAT_COOL_SKILL } from '../src/renderer/src/sim/tuning';
import { Seated, Health } from '../src/renderer/src/sim/components';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { activeHazardCount } from '../src/renderer/src/sim/director';
import { createRng, nextFloat } from '../src/shared/rng';
import { makeState, overdrive, run, room, seconds, teleport, placeDebris, intents, setSkill } from './helpers/sim';
import { Skill } from '../src/renderer/src/sim/skills';

const down = { moveY: 1 };

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

const atStation = (s: ReturnType<typeof makeState>, pid: number, i: number) => { const t = s.derived.stationTile[i]!, w = s.derived.width; teleport(s, pid, (t % w) + 0.5, Math.floor(t / w) + 0.5); };

describe('heat', () => {
  it('rises HEAT_RISE per hazard tick while overdriven with no coolant, never on other ticks, and caps at an overheat', () => {
    const s = makeState(1), nav = overdrive(s, StationKind.Navigation);
    s.director.nextSpawnTick = 1e9;
    expect(s.stations.occupant[idx(s, StationKind.Engineering)]).toBe(-1);    // unattended: nobody at Engineering
    run(s, 1);                                                                 // tick 0 is a hazard tick
    expect(s.stations.heat[nav]).toBe(HEAT_RISE);
    run(s, HAZARD_EVERY - 1);
    expect(s.stations.heat[nav]).toBe(HEAT_RISE);                              // ticks 1..4 do nothing
    run(s, HAZARD_EVERY);
    expect(s.stations.heat[nav]).toBe(2 * HEAT_RISE);
    run(s, seconds(10) - 2 * HAZARD_EVERY - HAZARD_EVERY);                     // up to and including the 119th hazard tick
    expect(s.stations.heat[nav]).toBe(HEAT_MAX - HEAT_RISE); expect(s.stations.failed[nav]).toBe(0);
    run(s, HAZARD_EVERY);                                                      // 120th hazard tick: overheat
    expect(s.stations.failed[nav]).toBe(1); expect(s.stations.level[nav]).toBe(0); expect(s.stations.heat[nav]).toBe(0);
  });
  it('one unit halves the climb (20 s), two units hold it indefinitely', () => {
    const a = makeState(1), nav = overdrive(a, StationKind.Navigation);
    a.director.nextSpawnTick = 1e9; a.stations.coolant[nav] = 1;
    run(a, seconds(20) - HAZARD_EVERY);
    expect(a.stations.heat[nav]).toBe(HEAT_MAX - 1); expect(a.stations.failed[nav]).toBe(0);
    run(a, HAZARD_EVERY);
    expect(a.stations.failed[nav]).toBe(1);
    const b = makeState(1), nav2 = overdrive(b, StationKind.Navigation);
    b.director.nextSpawnTick = 1e9; b.stations.coolant[nav2] = 2; b.stations.heat[nav2] = HEAT_MAX / 2;   // nonzero start: a net-negative rate would show as a drop, not hide behind the 0 clamp
    run(b, seconds(30));
    expect(b.stations.heat[nav2]).toBe(HEAT_MAX / 2); expect(b.stations.failed[nav2]).toBe(0); expect(b.stations.level[nav2]).toBe(3);
  });
  it('a station at or below its max cools HEAT_COOL_IDLE per hazard tick to a floor of 0; a spawner-style failure leaves heat to decay', () => {
    const s = makeState(1), nav = idx(s, StationKind.Navigation), wpn = idx(s, StationKind.Weapons);
    s.director.nextSpawnTick = 1e9;
    s.stations.heat[nav] = HEAT_MAX - 1; s.stations.heat[wpn] = 10;
    run(s, 1);
    expect(s.stations.heat[nav]).toBe(HEAT_MAX - 1 - HEAT_COOL_IDLE); expect(s.stations.heat[wpn]).toBe(10 - HEAT_COOL_IDLE);
    run(s, HAZARD_EVERY * 2);
    expect(s.stations.heat[wpn]).toBe(0);                                      // 10 - 12 floors at 0
    run(s, seconds(5));
    expect(s.stations.heat[nav]).toBe(0);
    const t = makeState(1), sci = overdrive(t, StationKind.Science);
    t.director.nextSpawnTick = 1e9;
    run(t, seconds(5));
    const hot = t.stations.heat[sci]!; expect(hot).toBeGreaterThan(0);
    failStation(t, sci);
    expect(t.stations.heat[sci]).toBe(hot);                                    // a power failure does not reset heat
    run(t, HAZARD_EVERY);
    expect(t.stations.heat[sci]).toBe(hot - HEAT_COOL_IDLE);
  });
  it('overheat fails the station, stands its occupant, zeroes heat and draws exactly one hazards roll that may ignite the room', () => {
    const mk = (seed: number) => {
      const s = makeState(2), doors = overdrive(s, StationKind.Doors);
      s.director.nextSpawnTick = 1e9; sitDown(s, 1, doors);
      s.stations.heat[doors] = HEAT_MAX - HEAT_RISE; s.rng.hazards.s = seed;
      s.stick.heldDir[1] = 2; s.stick.repeat[1] = 3;                           // stick state the forced stand must clear
      atStation(s, 0, idx(s, StationKind.Navigation));                         // player 0 stands in the Doors room (A) for the fire-damage check
      return { s, doors, r: s.derived.stationRoom[doors]! };
    };
    const one = createRng(7); nextFloat(one);
    const a = mk(7);                                                           // first draw 0.012 < 0.5: fire
    run(a.s, 1, () => intents({}, down));                                      // the Doors operator holds a direction, so stick state is nonzero until the forced stand
    expect(a.s.stations.failed[a.doors]).toBe(1); expect(a.s.stations.heat[a.doors]).toBe(0);
    expect(Seated.station[a.s.crew[1]!]).toBe(-1); expect(a.s.stations.occupant[a.doors]).toBe(-1);
    expect(a.s.stick.heldDir[1]).toBe(0); expect(a.s.stick.repeat[1]).toBe(0);
    expect(a.s.rooms.fire[a.r]).toBe(FIRE_START); expect(a.s.rng.hazards.s).toBe(one.s);
    expect(Health.cur[a.s.crew[0]!]).toBeLessThan(HEALTH_MAX);                 // crewSystem applies fire damage on the overheat tick itself
    const b = mk(1);                                                           // first draw 0.627 >= 0.5: no fire
    const oneB = createRng(1); nextFloat(oneB);
    run(b.s, 1);
    expect(b.s.stations.failed[b.doors]).toBe(1); expect(b.s.rooms.fire[b.r]).toBe(0); expect(b.s.rng.hazards.s).toBe(oneB.s);
    const c = mk(7);                                                           // already burning: intensity kept, the draw still consumed
    c.s.rooms.fire[c.r] = 3;
    heatStep(c.s);                                                             // direct call: through step(), fireStep would also draw spread rolls and grow the fire
    expect(c.s.stations.failed[c.doors]).toBe(1); expect(c.s.rooms.fire[c.r]).toBe(3); expect(c.s.rng.hazards.s).toBe(one.s);
  });
  it('two stations overheating on one hazard tick resolve in ascending index with one draw each', () => {
    const s = makeState(1), wpn = overdrive(s, StationKind.Weapons), sci = overdrive(s, StationKind.Science);
    s.director.nextSpawnTick = 1e9;
    expect(wpn).toBeLessThan(sci);                                             // starter layout: Weapons precedes Science in station order
    expect(s.derived.stationRoom[wpn]).not.toBe(s.derived.stationRoom[sci]);
    s.stations.heat[wpn] = HEAT_MAX - HEAT_RISE; s.stations.heat[sci] = HEAT_MAX - HEAT_RISE; s.rng.hazards.s = 8;   // draws 0.156 (fire), 0.625 (none)
    const two = createRng(8); nextFloat(two); nextFloat(two);
    run(s, 1);
    expect(s.stations.failed[wpn]).toBe(1); expect(s.stations.failed[sci]).toBe(1);
    expect(s.rooms.fire[s.derived.stationRoom[wpn]!]).toBe(FIRE_START); expect(s.rooms.fire[s.derived.stationRoom[sci]!]).toBe(0);
    expect(s.rng.hazards.s).toBe(two.s);
  });
  it('the spawner on the overheat tick counts the new failure: at the cap it skips its spawn', () => {
    const s = makeState(1), nav = overdrive(s, StationKind.Navigation);
    expect(activateBreach(s, 0)).toBe(true); expect(activateBreach(s, 1)).toBe(true);   // two hazards that draw no RNG
    s.stations.heat[nav] = HEAT_MAX - HEAT_RISE; s.rng.hazards.s = 1;          // overheat draw 0.627: no fire
    s.director.nextSpawnTick = s.tick;                                          // the spawner runs this tick, after heatStep
    const jitterOnly = createRng(s.rng.director.s); nextFloat(jitterOnly);
    run(s, 1);
    expect(s.stations.failed[nav]).toBe(1);
    expect(activeHazardCount(s)).toBe(SPAWN_CAP);                              // 2 breaches + the overheat failure: nothing spawned
    expect(s.rng.director.s).toBe(jitterOnly.s);                               // only the interval jitter was drawn, no type roll
    const t = makeState(1), nav2 = overdrive(t, StationKind.Navigation);
    expect(activateBreach(t, 0)).toBe(true);                                   // one breach
    t.stations.heat[nav2] = HEAT_MAX - HEAT_RISE; t.rng.hazards.s = 7;         // overheat draw 0.012: fire in the Navigation room
    t.director.nextSpawnTick = t.tick;
    const jitterOnly2 = createRng(t.rng.director.s); nextFloat(jitterOnly2);
    run(t, 1);
    expect(t.rooms.fire[t.derived.stationRoom[nav2]!]).toBe(FIRE_START);
    expect(activeHazardCount(t)).toBe(SPAWN_CAP);                              // breach + failure + the overheat fire: the spawner saw the fire too
    expect(t.rng.director.s).toBe(jitterOnly2.s);
  });
  it('a failed Engineering ejects its operator, and no coolant or bar input lands until it is repaired', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering), wpn = idx(s, StationKind.Weapons);
    s.director.nextSpawnTick = 1e9;
    sitDown(s, 0, eng); s.stations.cursor[eng] = StationKind.Weapons; s.stations.coolant[wpn] = 1;
    const levels = Array.from(s.stations.level);
    failStation(s, eng);
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[eng]).toBe(-1);
    run(s, 3, () => intents({ confirmPressed: true, moveX: 1 }));             // Confirm and Right through step(): the player is standing, so nothing reaches the console
    expect(s.stations.coolant[wpn]).toBe(1); expect(coolantUsed(s)).toBe(1); expect(Array.from(s.stations.level)).toEqual(levels);
  });
  it('failed Engineering freezes nothing thermal; coolant and residual heat survive failures and repairs', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering), nav = overdrive(s, StationKind.Navigation);
    s.director.nextSpawnTick = 1e9; s.stations.coolant[nav] = 1;
    failStation(s, eng);
    run(s, seconds(5));                                                        // 60 hazard ticks at net +1
    expect(s.stations.heat[nav]).toBe(60 * (HEAT_RISE - HEAT_COOL_UNIT)); expect(s.stations.coolant[nav]).toBe(1);
    repairStation(s, eng);
    expect(s.stations.coolant[nav]).toBe(1); expect(s.stations.heat[nav]).toBe(60);
    failStation(s, nav); repairStation(s, nav);
    expect(s.stations.coolant[nav]).toBe(1); expect(s.stations.heat[nav]).toBe(60);   // repair touches neither
  });
  it('same tick: a Navigation overheat removes that tick\'s evasion roll and the hull takes the impact', () => {
    const s = makeState(2), nav = overdrive(s, StationKind.Navigation);
    s.director.nextSpawnTick = 1e9; sitDown(s, 1, nav);
    s.stations.heat[nav] = HEAT_MAX - HEAT_RISE; s.rng.hazards.s = 1;          // no fire
    placeDebris(s, room(s, 'D'), 0, 1);                                        // impacts this tick, in debrisSystem after heatStep
    const combat = s.rng.combat.s;
    run(s, 1);
    expect(s.stations.failed[nav]).toBe(1); expect(s.rng.combat.s).toBe(combat); expect(s.hull).toBe(HULL_MAX - DEBRIS_HULL_DAMAGE);
  });
  it('same tick: Life Support still injects on its overheat tick; the Medbay does not heal on its', () => {
    const a = makeState(1), ls = overdrive(a, StationKind.LifeSupport);
    a.director.nextSpawnTick = 1e9; a.stations.heat[ls] = HEAT_MAX - HEAT_RISE; a.rng.hazards.s = 1;
    a.rooms.o2[room(a, 'A')] = 0;
    run(a, 1);
    expect(a.stations.failed[ls]).toBe(1); expect(a.o2Counters.injected).toBeGreaterThan(0);
    const b = makeState(1), med = overdrive(b, StationKind.Medbay);
    b.director.nextSpawnTick = 1e9; b.stations.heat[med] = HEAT_MAX - HEAT_RISE; b.rng.hazards.s = 1;
    atStation(b, 0, med); Health.cur[b.crew[0]!] = 50;
    run(b, 1);
    expect(b.stations.failed[med]).toBe(1); expect(Health.cur[b.crew[0]!]).toBe(50);
  });
});

describe('cooling skill', () => {
  it('a level-5 engineer adds one cooling per unit while seated; level 4 and unseated are baseline; heat holds flat with one unit and rises when they stand', () => {
    const s = makeState(2), eng = idx(s, StationKind.Engineering), nav = overdrive(s, StationKind.Navigation);
    s.director.nextSpawnTick = 1e9;
    expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT);
    setSkill(s, 0, Skill.Engineering, 4); sitDown(s, 0, eng); expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT);
    setSkill(s, 0, Skill.Engineering, 5); expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT + 1); expect(Math.floor(HEAT_COOL_SKILL * 5)).toBe(1);
    s.stations.coolant[nav] = 1; s.stations.heat[nav] = 100;
    run(s, HAZARD_EVERY * 12);
    expect(s.stations.heat[nav]).toBe(100);                                        // 2 - 1 x 2 = 0 per hazard tick
    run(s, 1, () => intents({ cancelPressed: true }, {}));                           // the engineer stands: baseline cooling
    const after = s.stations.heat[nav]!;
    run(s, HAZARD_EVERY * 10);
    expect(s.stations.heat[nav]).toBe(after + 10);                                   // +1 per hazard tick with one baseline unit
  });
});
