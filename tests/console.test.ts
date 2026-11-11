import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Intent } from '../src/shared/intent';
import { coolantUsed } from '../src/renderer/src/sim/heat';
import { Seated, Position, Life, LifeState, Health } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { confirmTarget, ConfirmKind, interactTarget, TargetKind } from '../src/renderer/src/sim/interact';
import { failStation, powerPool, maxLevel } from '../src/renderer/src/sim/power';
import { sitDown } from '../src/renderer/src/sim/stations';
import { DoorState } from '../src/renderer/src/sim/grid';
import { hashState } from '../src/renderer/src/sim/hash';
import { REPAIR_TIME_POWER, STICK_REPEAT_TICKS, HEAT_MAX, HEAT_RISE, HEAT_COOL_UNIT, HEAT_COOL_IDLE, COOLANT_POOL, HAZARD_EVERY } from '../src/renderer/src/sim/tuning';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from '../src/renderer/src/sim/state';
import { createRng, nextFloat } from '../src/shared/rng';
import { makeState, intents, run, teleport, seconds, placeDebris, overdrive, room } from './helpers/sim';

const idx = (s: ReturnType<typeof makeState>, kind: number) => s.derived.stationOfKind[kind]!;
const at = (s: ReturnType<typeof makeState>, pid: number, i: number) => { const t = s.derived.stationTile[i]!, w = s.derived.width; teleport(s, pid, (t % w) + 0.5, Math.floor(t / w) + 0.5); };
const confirm = { confirmPressed: true }, up = { moveY: -1 }, down = { moveY: 1 }, left = { moveX: -1 }, right = { moveX: 1 };

describe('sitting and standing', () => {
  it('Confirm at a console in the same room sits; the player is locked and cannot repair; Cancel stands', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering);
    teleport(s, 0, 17.5, 9.5);                                         // room C, half a tile from the Engineering console
    expect(confirmTarget(s, 0)).toEqual({ kind: ConfirmKind.Console, index: eng });
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(eng); expect(Position.x[s.crew[0]!]).toBe(18.5);
    run(s, 10, () => intents({ moveX: 1, moveY: 1 }));
    expect(Position.x[s.crew[0]!]).toBe(18.5); expect(Position.y[s.crew[0]!]).toBe(9.5);
    expect(interactTarget(s, 0).kind).toBe(TargetKind.None);
    expect(confirmTarget(s, 0).kind).toBe(ConfirmKind.None);
    run(s, 1, () => intents({ cancelPressed: true }));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[eng]).toBe(-1);
  });
  it('Interact edge also stands; a stand edge beats Confirm and stick edges on the same tick', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering);
    sitDown(s, 0, eng);
    const pool = powerPool(s);
    run(s, 1, () => intents({ interactPressed: true, confirmPressed: true, moveX: 1 }));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(powerPool(s)).toBe(pool);
    expect(Position.x[s.crew[0]!]).toBe(18.5); expect(Position.y[s.crew[0]!]).toBe(9.5);   // the stand tick consumes the stick input
  });
  it('a console within reach but across a wall is not a target and Confirm does nothing', () => {
    // The starter ship keeps every console away from its walls, so move Life Support to the first E tile right of the G/E wall (x = 7).
    const modified = JSON.parse(JSON.stringify(starter)) as typeof starter;
    modified.stations.find((st) => st.id === 'lifeSupport')!.tile = [8, 9];
    const s = createSimState(parseShip(modified), 1, 1);
    teleport(s, 0, 6.6, 9.5);                                          // in G, 1.4 tiles from the console tile's near edge: within REACH, other room
    expect(confirmTarget(s, 0).kind).toBe(ConfirmKind.None);
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(Position.x[s.crew[0]!]).toBe(6.6);
    teleport(s, 0, 8.5, 10.5);                                         // in E: same room, in reach
    expect(confirmTarget(s, 0)).toEqual({ kind: ConfirmKind.Console, index: idx(s, StationKind.LifeSupport) });
  });
  it('an offline or occupied console refuses; two Confirms seat the lower pid', () => {
    const s = makeState(2), nav = idx(s, StationKind.Navigation);
    at(s, 0, nav); at(s, 1, nav);
    run(s, 1, () => intents(confirm, confirm));
    expect(s.stations.occupant[nav]).toBe(0); expect(Seated.station[s.crew[1]!]).toBe(-1);
    run(s, 1, () => intents({ cancelPressed: true }, {}));
    s.stations.level[nav] = 0;
    run(s, 1, () => intents({}, confirm));
    expect(Seated.station[s.crew[1]!]).toBe(-1);
  });
  it('the seating Confirm is consumed: a Doors sit does not toggle a door that tick', () => {
    const s = makeState(1), doors = idx(s, StationKind.Doors);
    at(s, 0, doors);
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(doors);
    expect(Array.from(s.doors.state).every((v) => v !== DoorState.Sealed)).toBe(true);
  });
  it('a Downed occupant stands in the same tick', () => {
    const s = makeState(2), med = idx(s, StationKind.Medbay);
    sitDown(s, 1, med);
    Health.cur[s.crew[1]!] = 0.01; s.rooms.fire[s.derived.stationRoom[med]!] = 1;          // burning Medbay downs the occupant this tick (fire damage outpaces healing)
    run(s, 1);
    expect(Life.state[s.crew[1]!]).toBe(LifeState.Downed); expect(Seated.station[s.crew[1]!]).toBe(-1); expect(s.stations.occupant[med]).toBe(-1);
  });
});

describe('Engineering console', () => {
  it('up/down move the cursor over kinds with wrap; right/left move bars; refusals leave state unchanged', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering), nav = idx(s, StationKind.Navigation);
    sitDown(s, 0, eng);
    expect(s.stations.cursor[eng]).toBe(StationKind.Engineering);
    run(s, 1, () => intents(down)); run(s, 1, () => intents({}));
    expect(s.stations.cursor[eng]).toBe(StationKind.LifeSupport);
    for (let i = 0; i < 4; i++) { run(s, 1, () => intents(up)); run(s, 1, () => intents({})); }
    expect(s.stations.cursor[eng]).toBe(StationKind.Navigation);
    run(s, 1, () => intents(right));
    expect(s.stations.level[nav]).toBe(2); expect(powerPool(s)).toBe(0);
    run(s, STICK_REPEAT_TICKS * 3, () => intents(right));             // held: repeats are refused at max / empty pool
    expect(s.stations.level[nav]).toBe(2);
    run(s, 1, () => intents(left));
    expect(s.stations.level[nav]).toBe(1); expect(powerPool(s)).toBe(1);
    for (let i = 0; i < 3; i++) { run(s, 1, () => intents(down)); run(s, 1, () => intents({})); }
    expect(s.stations.cursor[eng]).toBe(StationKind.Engineering);
    run(s, 1, () => intents(left));
    expect(s.stations.level[eng]).toBe(1);                              // never below 1
  });
  it('holding right adds one bar per repeat interval while the pool lasts', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering), wpn = idx(s, StationKind.Weapons);
    sitDown(s, 0, eng); s.stations.level[wpn] = 0;                       // pool 3, weapons max 3
    s.stations.cursor[eng] = StationKind.Weapons;
    run(s, STICK_REPEAT_TICKS * 2 + 1, () => intents(right));
    expect(s.stations.level[wpn]).toBe(3); expect(powerPool(s)).toBe(0);
  });
  it('Confirm cycles the selected station\'s coolant 0, 1, 2, 0; wraps to 0 when the pool is exhausted; does nothing on the Engineering row', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering), wpn = idx(s, StationKind.Weapons), nav = idx(s, StationKind.Navigation);
    sitDown(s, 0, eng);
    run(s, 1, () => intents(confirm));
    expect(coolantUsed(s)).toBe(0);                                      // Engineering row: nothing
    s.stations.cursor[eng] = StationKind.Weapons;
    const stepTo = (expected: number, delta: number) => { const before = coolantUsed(s); run(s, 1, () => intents(confirm)); expect(s.stations.coolant[wpn]).toBe(expected); expect(coolantUsed(s)).toBe(before + delta); };
    stepTo(1, 1); stepTo(2, 1); stepTo(0, -2);                            // the pool total moves by exactly the step
    stepTo(1, 1); stepTo(2, 1);                                           // back to 2
    s.stations.coolant[idx(s, StationKind.Science)] = 1;                  // 3 of 4 used
    s.stations.cursor[eng] = StationKind.Navigation;
    run(s, 1, () => intents(confirm)); expect(s.stations.coolant[nav]).toBe(1); expect(coolantUsed(s)).toBe(COOLANT_POOL);
    run(s, 1, () => intents(confirm)); expect(s.stations.coolant[nav]).toBe(0);   // the step to 2 cannot be supplied: wrap
    expect(coolantUsed(s)).toBe(3);
  });
  it('same tick: a Left out of overdrive, or a Confirm to two units, on the would-be overheat tick prevents it', () => {
    const a = makeState(1), engA = idx(a, StationKind.Engineering), wpnA = overdrive(a, StationKind.Weapons);
    a.spawner.nextSpawnTick = 1e9; sitDown(a, 0, engA); a.stations.cursor[engA] = StationKind.Weapons;
    a.stations.heat[wpnA] = HEAT_MAX - HEAT_RISE;
    run(a, 1, () => intents(left));                                            // consoleSystem (level 4 -> 3) precedes heatStep
    expect(a.stations.level[wpnA]).toBe(3); expect(a.stations.failed[wpnA]).toBe(0);
    expect(a.stations.heat[wpnA]).toBe(HEAT_MAX - HEAT_RISE - HEAT_COOL_IDLE);   // idle cooling instead of an overheat
    const b = makeState(1), engB = idx(b, StationKind.Engineering), wpnB = overdrive(b, StationKind.Weapons);
    b.spawner.nextSpawnTick = 1e9; sitDown(b, 0, engB); b.stations.cursor[engB] = StationKind.Weapons;
    b.stations.heat[wpnB] = HEAT_MAX - (HEAT_RISE - HEAT_COOL_UNIT); b.stations.coolant[wpnB] = 1;   // one unit: the next update would reach HEAT_MAX
    run(b, 1, () => intents(confirm));                                         // 1 -> 2 units before heatStep: net 0
    expect(b.stations.coolant[wpnB]).toBe(2); expect(b.stations.failed[wpnB]).toBe(0); expect(b.stations.heat[wpnB]).toBe(HEAT_MAX - (HEAT_RISE - HEAT_COOL_UNIT));
  });
  it('same tick: a Weapons shot on the Weapons overheat tick resolves before the failure stands the operator', () => {
    const s = makeState(2), wpn = overdrive(s, StationKind.Weapons);
    s.spawner.nextSpawnTick = 1e9;
    placeDebris(s, room(s, 'A'), 600, 1); sitDown(s, 1, wpn); s.weapons.charge = 1;
    s.stations.heat[wpn] = HEAT_MAX - HEAT_RISE; s.rng.hazards.s = 1;         // no fire
    const oneDraw = createRng(s.rng.combat.s); nextFloat(oneDraw);
    run(s, 1, () => intents({}, confirm));
    expect(s.rng.combat.s).toBe(oneDraw.s); expect(s.weapons.charge).toBe(0);  // the shot was taken
    expect(s.stations.failed[wpn]).toBe(1); expect(Seated.station[s.crew[1]!]).toBe(-1);
  });
  it('property: random Engineering inputs over 60 s keep coolant within the pool, heat within range, levels within maxLevel and the capacity, checked every hazard tick', () => {
    const arbDir = fc.constantFrom({}, up, down, left, right);
    const arbScript = fc.array(fc.record({ dir: arbDir, confirm: fc.boolean() }), { minLength: 720, maxLength: 720 });   // 720 x 5 ticks = 3600 ticks = 60 s
    const check = (s: ReturnType<typeof makeState>) => {
      let used = 0, levels = 0;
      for (let i = 0; i < s.stations.level.length; i++) {
        used += s.stations.coolant[i]!; levels += s.stations.level[i]!;
        if (s.stations.coolant[i]! > 2 || s.stations.heat[i]! < 0 || s.stations.heat[i]! > HEAT_MAX || s.stations.level[i]! > maxLevel(s.derived.stationKind[i]!)) return false;
      }
      return used <= COOLANT_POOL && levels <= s.power.capacity;
    };
    fc.assert(fc.property(fc.integer({ min: 1, max: 1e6 }), arbScript, (seed, script) => {
      const s = makeState(1, seed), eng = idx(s, StationKind.Engineering);
      s.spawner.nextSpawnTick = 1e9;                                       // no unrelated failures: Engineering stays occupied for the whole script
      sitDown(s, 0, eng);
      for (const e of script) {
        for (let k = 0; k < HAZARD_EVERY; k++) {                           // one stick edge per 5 ticks, Confirm edges every tick while true
          run(s, 1, () => intents({ ...e.dir, confirmPressed: e.confirm }));
          if (!check(s)) return false;                                     // checked after every tick, so nothing can hide behind a later input
        }
      }
      return s.tick === script.length * HAZARD_EVERY && s.stations.occupant[eng] === 0 && !s.ended;
    }), { numRuns: 20 });
  });
});

describe('Doors console', () => {
  it('cycles doors and toggles the selected one remotely; local and remote on one tick toggle once', () => {
    const s = makeState(2), doors = idx(s, StationKind.Doors);
    sitDown(s, 0, doors);
    const first = s.derived.doorEdges[0]!, last = s.derived.doorEdges.at(-1)!;
    run(s, 1, () => intents(up));
    expect(s.derived.doorEdges[s.stations.cursor[doors]!]).toBe(last);
    run(s, 1, () => intents({})); run(s, 1, () => intents(down));
    expect(s.derived.doorEdges[s.stations.cursor[doors]!]).toBe(first);
    run(s, 1, () => intents(confirm));
    expect(s.doors.state[first]).toBe(DoorState.Sealed);
    // Player 1 stands in the corridor below that door (edge 0 is the A/I door at (2,4): no console within reach there, and 1.4 tiles from the
    // door centre keeps it outside DOOR_ZONE so it will not auto-open) and presses Confirm on the same tick as the remote press: one toggle, so
    // the door is unsealed to Closed, not re-sealed.
    const t = s.derived.edgeTile[first]!, w = s.derived.width;
    teleport(s, 1, (t % w) + 0.5, Math.floor(t / w) + 1.9);
    expect(confirmTarget(s, 1)).toEqual({ kind: ConfirmKind.Door, index: first });
    run(s, 1, () => intents(confirm, confirm));
    expect(s.doors.state[first]).toBe(DoorState.Closed);
    run(s, 1, () => intents({}, {}));
    expect(s.doors.state[first]).toBe(DoorState.Closed);
  });
  it('a remote seal on an occupied door is deferred until the tile is clear', () => {
    const s = makeState(2), doors = idx(s, StationKind.Doors);
    sitDown(s, 0, doors);
    const first = s.derived.doorEdges[0]!, t = s.derived.edgeTile[first]!, w = s.derived.width;
    teleport(s, 1, (t % w) + 0.5, Math.floor(t / w) + 0.5);          // player 1 stands on the door tile
    run(s, 1, () => intents(confirm, {}));
    expect(s.doors.state[first]).not.toBe(DoorState.Sealed); expect(s.doors.sealRequested[first]).toBe(1);
    teleport(s, 1, (t % w) + 0.5, Math.floor(t / w) + 2.5);          // step off
    run(s, 1, () => intents({}, {}));
    expect(s.doors.state[first]).toBe(DoorState.Sealed);
  });
});

describe('scripted-intent gate: Science, Weapons, Navigation', () => {
  it('Science: a 16 s object is unwarned unmanned, warned at the end of the seating tick, and stays warned after Cancel', () => {
    const s = makeState(1), i = idx(s, StationKind.Science), A = s.derived.roomIndex.get('A')!;
    s.spawner.nextSpawnTick = 1e9;
    at(s, 0, i);
    placeDebris(s, A, seconds(16));
    run(s, 1);
    expect(s.debris.warned[0]).toBe(0);                                            // unmanned lead is 4 s
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(i); expect(s.debris.warned[0]).toBe(1);   // sitting precedes detection in the tick
    run(s, 1, () => intents({ cancelPressed: true }));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.debris.warned[0]).toBe(1);
  });
  it('Weapons: sit, charge to full, Confirm fires one shot (destroyed or missed, charge 0, one combat draw), Cancel stands', () => {
    const s = makeState(1), i = idx(s, StationKind.Weapons), A = s.derived.roomIndex.get('A')!;
    s.spawner.nextSpawnTick = 1e9;
    at(s, 0, i); placeDebris(s, A, 1e6, 1);
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(i); expect(s.stations.cursor[i]).toBe(0);
    let n = 0; while (s.weapons.charge < 1 && n++ < seconds(12) + 2) run(s, 1);
    expect(s.weapons.charge).toBe(1);
    const oneDraw = createRng(s.rng.combat.s); nextFloat(oneDraw);
    run(s, 1, () => intents(confirm));
    expect(s.weapons.charge).toBe(0); expect(s.rng.combat.s).toBe(oneDraw.s);         // exactly one combat draw per shot
    const destroyed = s.debris.active[0] === 0;
    expect(destroyed ? s.stations.cursor[i] : s.debris.warned[0]).toBe(destroyed ? -1 : 1);
    run(s, 1, () => intents({ cancelPressed: true }));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[i]).toBe(-1);
  });
  it('Navigation: seated, an impact draws exactly one combat roll; a low roll evades with hull unchanged', () => {
    const s = makeState(1), i = idx(s, StationKind.Navigation), A = s.derived.roomIndex.get('A')!;
    s.spawner.nextSpawnTick = 1e9;
    at(s, 0, i);
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(i);
    s.rng.combat.s = 7;                                                            // first draw 0.012 < 0.35
    const expected = createRng(7); nextFloat(expected);
    placeDebris(s, A, 1);
    run(s, 2);
    expect(s.rng.combat.s).toBe(expected.s);
    expect(s.debris.active[0]).toBe(0); expect(s.hull).toBe(100); expect(s.rooms.impactTick[A]).toBe(-1);
    run(s, 1, () => intents({ cancelPressed: true }));
    expect(Seated.station[s.crew[0]!]).toBe(-1);
  });
  for (const kind of [StationKind.LifeSupport, StationKind.Medbay]) {
    it(`Confirm sits at kind ${kind} and Cancel stands; the stick does nothing while seated`, () => {
      const s = makeState(1), i = idx(s, kind), t = s.derived.stationTile[i]!, w = s.derived.width;
      teleport(s, 0, (t % w) + 0.5, Math.floor(t / w) + 1.5);        // one tile below, same room, in reach
      run(s, 1, () => intents(confirm));
      expect(Seated.station[s.crew[0]!]).toBe(i); expect(s.stations.occupant[i]).toBe(0);
      run(s, 20, () => intents({ moveX: 1, confirmPressed: true }));
      expect(Seated.station[s.crew[0]!]).toBe(i); expect(Position.x[s.crew[0]!]).toBe((t % w) + 0.5);
      run(s, 1, () => intents({ cancelPressed: true }));
      expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[i]).toBe(-1);
    });
  }
});

describe('scripted-intent gate: Engineering overdrive', () => {
  it('overdriven Weapons with two units holds 30 s; at zero units it overheats within 10 s and stands the Weapons operator', () => {
    const s = makeState(2), eng = idx(s, StationKind.Engineering), wpn = idx(s, StationKind.Weapons), ls = idx(s, StationKind.LifeSupport);
    s.spawner.nextSpawnTick = 1e9;
    sitDown(s, 0, eng); sitDown(s, 1, wpn);
    const edge = (p: Partial<Intent>) => { run(s, 1, () => intents(p, {})); run(s, 1, () => intents({}, {})); };
    edge(down);                                                               // cursor Engineering -> Life Support
    edge(left); expect(s.stations.level[ls]).toBe(1); expect(powerPool(s)).toBe(2);
    edge(up); edge(up); edge(up);                                             // Life Support -> Engineering -> Science -> Weapons
    expect(s.stations.cursor[eng]).toBe(StationKind.Weapons);
    edge(right); edge(right);
    expect(s.stations.level[wpn]).toBe(4); expect(powerPool(s)).toBe(0);
    edge(confirm); edge(confirm);
    expect(s.stations.coolant[wpn]).toBe(2);
    run(s, seconds(30));
    expect(s.stations.level[wpn]).toBe(4); expect(s.stations.failed[wpn]).toBe(0); expect(s.stations.heat[wpn]).toBeLessThan(HEAT_MAX);
    expect(s.stations.occupant[wpn]).toBe(1);
    edge(confirm);
    expect(s.stations.coolant[wpn]).toBe(0);
    let failedAt = -1;
    for (let t = 0; t < seconds(10) + 2 * HAZARD_EVERY && failedAt < 0; t++) { run(s, 1); if (s.stations.failed[wpn]) failedAt = t; }
    expect(failedAt).toBeGreaterThanOrEqual(0);
    expect(s.stations.level[wpn]).toBe(0); expect(s.stations.heat[wpn]).toBe(0);
    expect(Seated.station[s.crew[1]!]).toBe(-1); expect(s.stations.occupant[wpn]).toBe(-1);
    expect(Seated.station[s.crew[0]!]).toBe(eng);                             // the Engineering operator is unaffected
  });
});

describe('power repair', () => {
  it('a failed station is an Interact target in reach and repairs after REPAIR_TIME_POWER', () => {
    const s = makeState(1), ls = idx(s, StationKind.LifeSupport);
    failStation(s, ls); at(s, 0, ls);
    expect(interactTarget(s, 0)).toEqual({ kind: TargetKind.Power, index: ls });
    run(s, seconds(REPAIR_TIME_POWER) - 5, () => intents({ interactHeld: true }));
    expect(s.stations.failed[ls]).toBe(1);
    run(s, 10, () => intents({ interactHeld: true }));
    expect(s.stations.failed[ls]).toBe(0);
  });
  it('two repairers finishing the same station in one tick leave no residual progress', () => {
    const s = makeState(2), eng = idx(s, StationKind.Engineering);
    failStation(s, eng); at(s, 0, eng); at(s, 1, eng);
    s.stations.repair[eng] = 0.999;
    run(s, 1, () => intents({ interactHeld: true }, { interactHeld: true }));
    expect(s.stations.failed[eng]).toBe(0); expect(s.stations.repair[eng]).toBe(0);
  });
  it('same seed and intents with console use hash equal', () => {
    const script = (t: number) => (t === 0 ? intents(confirm) : t < 40 ? intents(down) : t === 40 ? intents(right) : t === 50 ? intents({ cancelPressed: true }) : intents({}));
    const a = makeState(1, 9), b = makeState(1, 9), eng = idx(a, StationKind.Engineering);
    at(a, 0, eng); at(b, 0, eng);
    run(a, 60, script); run(b, 60, script);
    expect(hashState(a)).toBe(hashState(b));
  });
});
