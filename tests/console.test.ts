import { fixtureCouchViewer } from './helpers/cardUi';
import { weaponSelection } from './helpers/weaponFixture';
import { buildFixtureHud as buildHudModel } from './helpers/cardUi';
import { cardSelection } from './helpers/cardUi';
import { snapshotPhaseStep as propertyPhaseStep } from './helpers/snapshotPhaseFixture';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Intent } from '../src/shared/intent';
import { coolantUsed } from '../src/renderer/src/sim/heat';
import { Seated, Position, Life, LifeState, Health } from '../src/renderer/src/sim/components';
import { StationKind, STATION_COUNT } from '../src/renderer/src/sim/stationKinds';
import { confirmTarget, ConfirmKind, interactTarget, TargetKind } from '../src/renderer/src/sim/interact';
import { failStation, powerPool, maxLevel, baseMax, REACTOR_ROW } from '../src/renderer/src/sim/power';
import { sitDown } from '../src/renderer/src/sim/stations';
import { DoorState } from '../src/renderer/src/sim/grid';
import { hashState } from '../src/renderer/src/sim/hash';
import { TORP_START, REPAIR_TIME_POWER, STICK_REPEAT_TICKS, HEAT_MAX, HEAT_RISE, HEAT_COOL_UNIT, HEAT_COOL_IDLE, COOLANT_POOL, HAZARD_EVERY, REACTOR_CAPACITY, STATION_MAX } from '../src/renderer/src/sim/tuning';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from './helpers/simLifetime';
import { Weapon } from '../src/renderer/src/sim/weapons';
import type { SlotInfo } from '../src/renderer/src/input/deviceManager';
import { createRng, nextFloat } from '../src/shared/rng';
import { makeState as makeAnyState, intents, run, teleport, seconds, placeDebris, overdrive, room, cutterState, quiet, grantScrap } from './helpers/sim';
import { doorsCursorCount, doorsCursorTarget } from '../src/renderer/src/sim/doors';
import { stationOnline } from '../src/renderer/src/sim/stations';
// Heat is the subject here: pin a quirk that leaves it alone (Old Drive), so the seed's natural Hot Reactor draw does not shift every figure (spec Run-iii section 5).
const makeState = (players = 2, seed = 1) => makeAnyState(players, seed, undefined, { quirk: 5 });

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
    expect(cardSelection(s, eng).cursor).toBe(StationKind.Engineering);
    run(s, 1, () => intents(down)); run(s, 1, () => intents({}));
    expect(cardSelection(s, eng).cursor).toBe(StationKind.LifeSupport);
    for (let i = 0; i < 4; i++) { run(s, 1, () => intents(up)); run(s, 1, () => intents({})); }
    expect(cardSelection(s, eng).cursor).toBe(StationKind.Navigation);
    run(s, 1, () => intents(right));
    expect(s.stations.level[nav]).toBe(2); expect(powerPool(s)).toBe(0);
    run(s, STICK_REPEAT_TICKS * 3, () => intents(right));             // held: repeats are refused at max / empty pool
    expect(s.stations.level[nav]).toBe(2);
    run(s, 1, () => intents(left));
    expect(s.stations.level[nav]).toBe(1); expect(powerPool(s)).toBe(1);
    for (let i = 0; i < 3; i++) { run(s, 1, () => intents(down)); run(s, 1, () => intents({})); }
    expect(cardSelection(s, eng).cursor).toBe(StationKind.Engineering);
    run(s, 1, () => intents(left));
    expect(s.stations.level[eng]).toBe(1);                              // never below 1
  });
  it('holding right adds one bar per repeat interval while the pool lasts', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering), wpn = idx(s, StationKind.Weapons);
    sitDown(s, 0, eng); s.stations.level[wpn] = 0;                       // pool 3, weapons max 3
    cardSelection(s, eng).cursor = StationKind.Weapons;
    run(s, STICK_REPEAT_TICKS * 2 + 1, () => intents(right));
    expect(s.stations.level[wpn]).toBe(3); expect(powerPool(s)).toBe(0);
  });
  it('Confirm cycles the selected station\'s coolant 0, 1, 2, 0; wraps to 0 when the pool is exhausted; does nothing on the Engineering row', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering), wpn = idx(s, StationKind.Weapons), nav = idx(s, StationKind.Navigation);
    sitDown(s, 0, eng);
    run(s, 1, () => intents(confirm));
    expect(coolantUsed(s)).toBe(0);                                      // Engineering row: nothing
    cardSelection(s, eng).cursor = StationKind.Weapons;
    const stepTo = (expected: number, delta: number) => { const before = coolantUsed(s); run(s, 1, () => intents(confirm)); expect(s.stations.coolant[wpn]).toBe(expected); expect(coolantUsed(s)).toBe(before + delta); };
    stepTo(1, 1); stepTo(2, 1); stepTo(0, -2);                            // the pool total moves by exactly the step
    stepTo(1, 1); stepTo(2, 1);                                           // back to 2
    s.stations.coolant[idx(s, StationKind.Science)] = 1;                  // 3 of 4 used
    cardSelection(s, eng).cursor = StationKind.Navigation;
    run(s, 1, () => intents(confirm)); expect(s.stations.coolant[nav]).toBe(1); expect(coolantUsed(s)).toBe(COOLANT_POOL);
    run(s, 1, () => intents(confirm)); expect(s.stations.coolant[nav]).toBe(0);   // the step to 2 cannot be supplied: wrap
    expect(coolantUsed(s)).toBe(3);
  });
  it('same tick: a Left out of overdrive, or a Confirm to two units, on the would-be overheat tick prevents it', () => {
    const a = makeState(1), engA = idx(a, StationKind.Engineering), wpnA = overdrive(a, StationKind.Weapons);
    a.director.nextSpawnTick = 1e9; sitDown(a, 0, engA); cardSelection(a, engA).cursor = StationKind.Weapons;
    a.stations.heat[wpnA] = HEAT_MAX - HEAT_RISE;
    run(a, 1, () => intents(left));                                            // consoleSystem (level 4 -> 3) precedes heatStep
    expect(a.stations.level[wpnA]).toBe(3); expect(a.stations.failed[wpnA]).toBe(0);
    expect(a.stations.heat[wpnA]).toBe(HEAT_MAX - HEAT_RISE - HEAT_COOL_IDLE);   // idle cooling instead of an overheat
    const b = makeState(1), engB = idx(b, StationKind.Engineering), wpnB = overdrive(b, StationKind.Weapons);
    b.director.nextSpawnTick = 1e9; sitDown(b, 0, engB); cardSelection(b, engB).cursor = StationKind.Weapons;
    b.stations.heat[wpnB] = HEAT_MAX - (HEAT_RISE - HEAT_COOL_UNIT); b.stations.coolant[wpnB] = 1;   // one unit: the next update would reach HEAT_MAX
    run(b, 1, () => intents(confirm));                                         // 1 -> 2 units before heatStep: net 0
    expect(b.stations.coolant[wpnB]).toBe(2); expect(b.stations.failed[wpnB]).toBe(0); expect(b.stations.heat[wpnB]).toBe(HEAT_MAX - (HEAT_RISE - HEAT_COOL_UNIT));
  });
  it('same tick: a Weapons shot on the Weapons overheat tick resolves before the failure stands the operator', () => {
    const s = makeState(2), wpn = overdrive(s, StationKind.Weapons);
    s.director.nextSpawnTick = 1e9;
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
        if (s.stations.coolant[i]! > 2 || s.stations.heat[i]! < 0 || s.stations.heat[i]! > HEAT_MAX || s.stations.level[i]! > maxLevel(s, s.derived.stationKind[i]!)) return false;
      }
      return used <= COOLANT_POOL && levels <= s.power.capacity;
    };
    fc.assert(fc.property(fc.integer({ min: 1, max: 1e6 }), arbScript, (seed, script) => {
      const s = makeState(1, seed), eng = idx(s, StationKind.Engineering);
      s.director.nextSpawnTick = 1e9;                                       // no unrelated failures: Engineering stays occupied for the whole script
      sitDown(s, 0, eng);
      for (const e of script) {
        for (let k = 0; k < HAZARD_EVERY; k++) {                           // one stick edge per 5 ticks, Confirm edges every tick while true
          propertyPhaseStep(s, intents({ ...e.dir, confirmPressed: e.confirm }));
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
    expect(s.derived.doorEdges[cardSelection(s, doors).cursor!]).toBe(last);
    run(s, 1, () => intents({})); run(s, 1, () => intents(down));
    expect(s.derived.doorEdges[cardSelection(s, doors).cursor!]).toBe(first);
    run(s, 1, () => intents(confirm));
    expect(s.doors.state[first]).toBe(DoorState.Sealed);            // online: Auto -> Sealed, one press as before Demo-vii (spec Demo-vii amendment 19)
    run(s, 1, () => intents({})); run(s, 1, () => intents(confirm));
    expect(s.doors.state[first]).toBe(DoorState.HeldOpen);
    // Player 1 stands in the corridor below that door (edge 0 is the A/I door at (2,4): no console within reach there, and 1.4 tiles from the
    // door centre keeps it outside DOOR_ZONE so it will not auto-open) and presses Confirm on the same tick as the remote press: the local
    // toggle seals the held door, then the remote cycle moves Sealed to Held open (applied after local toggles, spec Demo-vii amendment 2).
    const t = s.derived.edgeTile[first]!, w = s.derived.width;
    teleport(s, 1, (t % w) + 0.5, Math.floor(t / w) + 1.9);
    expect(confirmTarget(s, 1)).toEqual({ kind: ConfirmKind.Door, index: first });
    run(s, 1, () => intents(confirm, confirm));
    expect(s.doors.state[first]).toBe(DoorState.HeldOpen);
    run(s, 1, () => intents({}, {}));
    expect(s.doors.state[first]).toBe(DoorState.HeldOpen);
  });
  it('a remote seal on an occupied door is deferred until the tile is clear', () => {
    const s = makeState(2), doors = idx(s, StationKind.Doors);
    sitDown(s, 0, doors);
    const first = s.derived.doorEdges[0]!, t = s.derived.edgeTile[first]!, w = s.derived.width;
    teleport(s, 1, (t % w) + 0.5, Math.floor(t / w) + 0.5);          // player 1 stands on the door tile
    run(s, 1, () => intents(confirm, {}));                             // Auto -> Sealed, deferred while player 1 stands in the doorway
    expect(s.doors.state[first]).not.toBe(DoorState.Sealed); expect(s.doors.sealRequested[first]).toBe(1);
    teleport(s, 1, (t % w) + 0.5, Math.floor(t / w) + 2.5);          // step off
    run(s, 1, () => intents({}, {}));
    expect(s.doors.state[first]).toBe(DoorState.Sealed);
  });
});

describe('Doors console: held doors, airlocks and the fail-safe (spec Demo-vii section 1, amendments 2 and 3)', () => {
  const doorsOf = (s: ReturnType<typeof cutterState>) => s.derived.stationOfKind[StationKind.Doors]!;
  const seated = () => { const s = cutterState(); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; const i = doorsOf(s); sitDown(s, 0, i); teleport(s, 1, 16.5, 3.5); return { s, i }; };   // player 1 waits in the Medbay, away from every door
  const press = (s: ReturnType<typeof cutterState>, p: Partial<Intent>) => { run(s, 1, () => intents(p, {})); run(s, 1, () => intents({}, {})); };
  it('the cursor walks every door, then every airlock, then wraps, in both directions', () => {
    const { s, i } = seated(), D = s.derived.doorEdges.length, n = doorsCursorCount(s);
    expect(n).toBe(D + 4);
    expect(cardSelection(s, i).cursor).toBe(0);
    const seen: number[] = [];
    for (let k = 0; k < n; k++) { press(s, down); seen.push(cardSelection(s, i).cursor!); }
    expect(seen).toEqual([...Array.from({ length: n - 1 }, (_, k) => k + 1), 0]);
    expect(doorsCursorTarget(s, D - 1)).toEqual({ kind: 'door', edge: s.derived.doorEdges[D - 1] });
    expect(doorsCursorTarget(s, D)).toEqual({ kind: 'airlock', index: 0 });
    expect(doorsCursorTarget(s, n)).toBeNull();
    press(s, up);
    expect(cardSelection(s, i).cursor).toBe(n - 1);
    expect(doorsCursorTarget(s, n - 1)).toEqual({ kind: 'airlock', index: 3 });
  });
  it('Confirm on a door cycles Auto -> Sealed -> Held open -> Auto (spec Demo-vii amendment 19)', () => {
    const { s, i } = seated(), e = s.derived.doorEdges[0]!;
    expect(cardSelection(s, i).cursor).toBe(0);
    press(s, confirm); expect(s.doors.state[e]).toBe(DoorState.Sealed);
    press(s, confirm); expect(s.doors.state[e]).toBe(DoorState.HeldOpen);
    press(s, confirm); expect(s.doors.state[e]).toBe(DoorState.Closed);
  });
  it('Confirm on an airlock toggles it and stamps the Doors productivity tick', () => {
    const { s, i } = seated();
    cardSelection(s, i).cursor = s.derived.doorEdges.length + 2;               // the Engines airlock
    press(s, confirm);
    expect(Array.from(s.airlocks.open)).toEqual([0, 0, 1, 0]);
    expect(s.skills.lastDoorToggleTick).toBe(s.tick - 2);
    press(s, confirm);
    expect(Array.from(s.airlocks.open)).toEqual([0, 0, 0, 0]);
  });
  it('offline, Confirm on an airlock does nothing; on a door it keeps the old path (seal, unseal) and never holds', () => {
    const { s, i } = seated(), e = s.derived.doorEdges[0]!;
    s.stations.level[i] = 0;
    expect(stationOnline(s, i)).toBe(false);
    press(s, confirm); expect(s.doors.state[e]).toBe(DoorState.Sealed);
    press(s, confirm); expect(s.doors.state[e]).toBe(DoorState.Closed);
    cardSelection(s, i).cursor = s.derived.doorEdges.length + 2;
    const stamp = s.skills.lastDoorToggleTick;
    press(s, confirm);
    expect(Array.from(s.airlocks.open)).toEqual([0, 0, 0, 0]);
    expect(s.skills.lastDoorToggleTick).toBe(stamp);
    expect(Array.from(s.doors.state).includes(DoorState.HeldOpen)).toBe(false);
  });
  it('the fail-safe: unpowered or failed, every airlock closes and every held door returns to Closed that tick', () => {
    for (const how of ['power', 'fail'] as const) {
      const { s, i } = seated();
      s.airlocks.open.fill(1); s.doors.state[3] = DoorState.HeldOpen; s.doors.state[5] = DoorState.HeldOpen; s.doors.state[7] = DoorState.Sealed;
      run(s, 1, () => intents({}, {}));
      expect(Array.from(s.airlocks.open)).toEqual([1, 1, 1, 1]);
      if (how === 'power') s.stations.level[i] = 0; else failStation(s, i);
      run(s, 1, () => intents({}, {}));
      expect(Array.from(s.airlocks.open), how).toEqual([0, 0, 0, 0]);
      expect([s.doors.state[3], s.doors.state[5], s.doors.state[7]], how).toEqual([DoorState.Closed, DoorState.Closed, DoorState.Sealed]);
      expect(s.doors.closeTimer[3]).toBe(0);
    }
  });
  it('a command on the tick the station goes offline is undone that tick, before any oxygen moves', () => {
    // Player 0 at Doors opens the Engines airlock (accepted: online when read); player 1 at Engineering pulls the Doors bar on the same tick.
    const { s, i } = seated(), eng = s.derived.stationOfKind[StationKind.Engineering]!, E = room(s, 'E');
    sitDown(s, 1, eng); cardSelection(s, eng).cursor = StationKind.Doors;
    cardSelection(s, i).cursor = s.derived.doorEdges.length + 2;
    while (s.tick % HAZARD_EVERY !== 0) run(s, 1, () => intents({}, {}));   // this tick runs the oxygen step
    const before = s.rooms.o2[E]!, vented = s.o2Counters.vented;
    run(s, 1, () => intents(confirm, left));
    expect(s.stations.level[i]).toBe(0);
    expect(Array.from(s.airlocks.open)).toEqual([0, 0, 0, 0]);
    expect(s.o2Counters.vented).toBe(vented);
    expect(s.rooms.o2[E]).toBeGreaterThanOrEqual(before);
  });
  it('the starter (no airlocks) keeps a cursor over its doors only', () => {
    const s = makeState(1), i = idx(s, StationKind.Doors);
    sitDown(s, 0, i);
    expect(doorsCursorCount(s)).toBe(s.derived.doorEdges.length);
    expect(s.airlocks.open).toHaveLength(0);
  });
});

describe('scripted-intent gate: Science, Weapons, Navigation', () => {
  it('Science: a 16 s object is unwarned unmanned, warned at the end of the seating tick, and stays warned after Cancel', () => {
    const s = makeState(1), i = idx(s, StationKind.Science), A = s.derived.roomIndex.get('A')!;
    s.director.nextSpawnTick = 1e9;
    at(s, 0, i);
    placeDebris(s, A, seconds(16));
    run(s, 1);
    expect(s.debris.warned[0]).toBe(0);                                            // unmanned lead is 4 s
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(i); expect(s.debris.warned[0]).toBe(1);   // sitting precedes detection in the tick
    run(s, 1, () => intents({ cancelPressed: true }));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.debris.warned[0]).toBe(1);
  });
  it('Science scans, Weapons retunes and fires a matched beam, then a torpedo', () => {
    const s = makeState(2), sci = idx(s, StationKind.Science), wpn = idx(s, StationKind.Weapons), A = room(s, 'A');
    s.director.nextSpawnTick = 1e9; s.stations.level[sci] = 2;                   // Science level 2: 8 s scan (the starter has 1)
    s.stations.level[idx(s, StationKind.LifeSupport)] = 1;                      // pay for it from Life Support (pool stays >= 0)
    placeDebris(s, A, seconds(30), 1, undefined, 3);
    at(s, 0, sci); at(s, 1, wpn);
    run(s, 1, () => intents(confirm, confirm));                                 // both sit
    expect(Seated.station[s.crew[0]!]).toBe(sci); expect(Seated.station[s.crew[1]!]).toBe(wpn);
    const sitTick = s.tick;                                                     // loading starts here, whatever the selector shows
    run(s, 1, () => intents(confirm, {}));                                      // Science starts the scan
    expect(s.science.scanning).toBe(1);
    run(s, seconds(8) + 2);
    expect(s.debris.scanned[0]).toBe(1);
    const slots: SlotInfo[] = [{ status: 'active', key: 'kb:0' }, { status: 'active', key: 'kb:1' }];
    expect(buildHudModel(s, fixtureCouchViewer(s), { slots: slots, phase: 'running', message: '' }).threats[0]!.text).toMatch(/ freq 3$/);
    run(s, 1, () => intents({}, right)); run(s, 1, () => intents({}, {})); run(s, 1, () => intents({}, right)); run(s, 1, () => intents({}, {}));
    expect(s.weapons.selector).toBe(Weapon.BeamF3);
    run(s, seconds(12) + 2 - (seconds(8) + 6));                                 // the beam has been charging since the sit: top it up to 12 s + 2 ticks
    expect(s.weapons.charge).toBe(1);
    s.rng.combat.s = 7; const one = createRng(7); nextFloat(one);
    run(s, 1, () => intents({}, confirm));
    expect(s.debris.active[0]).toBe(0); expect(s.rng.combat.s).toBe(one.s); expect(s.weapons.charge).toBe(0);
    const second = placeDebris(s, A, seconds(30), 1, undefined, 1);            // reuses slot 0; already warned, so nothing auto-selects it
    expect(weaponSelection(s).cursor).toBe(-1);
    run(s, 1, () => intents({}, down)); run(s, 1, () => intents({}, {}));       // Down with cursor -1 selects the first warned target
    expect(weaponSelection(s).cursor).toBe(second);
    run(s, 1, () => intents({}, right)); run(s, 1, () => intents({}, {}));
    expect(s.weapons.selector).toBe(Weapon.Torpedo);
    expect(s.weapons.torpedoLoaded).toBe(0);                                     // about 12 s in: not yet
    run(s, sitTick + seconds(20) + 2 - s.tick);                                  // the gate deadline: 20 s + 2 ticks from the sit at level 2
    expect(s.weapons.torpedoLoaded).toBe(1); expect(s.weapons.torpedoStock).toBe(TORP_START - 1); expect(s.debris.active[second]).toBe(1);
    s.rng.combat.s = 7; const oneT = createRng(7); nextFloat(oneT);
    run(s, 1, () => intents({}, confirm));
    expect(s.debris.active[second]).toBe(0); expect(s.rng.combat.s).toBe(oneT.s); expect(s.weapons.torpedoLoaded).toBe(0); expect(s.weapons.torpedoStock).toBe(TORP_START - 1);
    run(s, 1, () => intents({ cancelPressed: true }, { cancelPressed: true }));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(Seated.station[s.crew[1]!]).toBe(-1);
  });
  it('Navigation: seated, an impact draws exactly one combat roll; a low roll evades with hull unchanged', () => {
    const s = makeState(1), i = idx(s, StationKind.Navigation), A = s.derived.roomIndex.get('A')!;
    s.director.nextSpawnTick = 1e9;
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
    s.director.nextSpawnTick = 1e9;
    sitDown(s, 0, eng); sitDown(s, 1, wpn);
    const edge = (p: Partial<Intent>) => { run(s, 1, () => intents(p, {})); run(s, 1, () => intents({}, {})); };
    edge(down);                                                               // cursor Engineering -> Life Support
    edge(left); expect(s.stations.level[ls]).toBe(1); expect(powerPool(s)).toBe(2);
    edge(up); edge(up); edge(up);                                             // Life Support -> Engineering -> Science -> Weapons
    expect(cardSelection(s, eng).cursor).toBe(StationKind.Weapons);
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

// Spec Loop-ii section 2 and rules U2, U4: the Engineering card's UPGRADES row and Upgrades page.
describe('Engineering Upgrades page', () => {
  const UPGRADES = STATION_COUNT, BACK = STATION_COUNT + 1;
  const seat = (scrap = 200) => { const s = makeState(2), eng = idx(s, StationKind.Engineering); quiet(s); sitDown(s, 0, eng); grantScrap(s, scrap); return { s, eng }; };
  const edge = (s: ReturnType<typeof makeState>, i: Partial<Intent>) => { run(s, 1, () => intents(i)); run(s, 1, () => intents({})); };
  const levels = (s: ReturnType<typeof makeState>) => [Array.from(s.stations.level), Array.from(s.stations.coolant), Array.from(s.run.upgrades), s.run.reactorBonus, s.power.capacity, s.run.scrap];
  it('the power page gains the UPGRADES row after Doors: Down from Doors and Up from Navigation reach it; Left/Right and coolant are inert on it', () => {
    const { s, eng } = seat(); cardSelection(s, eng).cursor = StationKind.Doors;
    edge(s, down); expect(cardSelection(s, eng).cursor).toBe(UPGRADES);
    edge(s, down); expect(cardSelection(s, eng).cursor).toBe(StationKind.Navigation);
    edge(s, up); expect(cardSelection(s, eng).cursor).toBe(UPGRADES);
    const before = levels(s); edge(s, left); edge(s, right); expect(levels(s)).toEqual(before); expect(cardSelection(s, eng).page).toBe(0);
    edge(s, up); expect(cardSelection(s, eng).cursor).toBe(StationKind.Doors);
  });
  it('Confirm on UPGRADES opens the page on its first row without touching coolant; the power page is otherwise unchanged', () => {
    const { s, eng } = seat(); cardSelection(s, eng).cursor = UPGRADES; const before = levels(s);
    run(s, 1, () => intents(confirm)); expect([cardSelection(s, eng).page, cardSelection(s, eng).cursor]).toEqual([1, StationKind.Navigation]); expect(levels(s)).toEqual(before);
    const p = seat(); cardSelection(p.s, p.eng).cursor = StationKind.Weapons; run(p.s, 1, () => intents(confirm)); expect(p.s.stations.coolant[idx(p.s, StationKind.Weapons)]).toBe(1); expect(cardSelection(p.s, p.eng).page).toBe(0);   // coolant still cycles on a station row
  });
  it('Up/Down wrap over the upgradeable kinds (Engineering skipped), Reactor and BACK; Left/Right do nothing', () => {
    const { s, eng } = seat(); cardSelection(s, eng).cursor = UPGRADES; run(s, 1, () => intents(confirm)); run(s, 1);
    const seen: number[] = [cardSelection(s, eng).cursor!];
    for (let k = 0; k < 8; k++) { edge(s, down); seen.push(cardSelection(s, eng).cursor!); }
    expect(seen).toEqual([0, 1, 2, 4, 5, 6, REACTOR_ROW, BACK, 0]);
    edge(s, up); expect(cardSelection(s, eng).cursor).toBe(BACK);
    const before = levels(s); edge(s, left); edge(s, right); cardSelection(s, eng).cursor = StationKind.Weapons; edge(s, left); edge(s, right); expect(levels(s)).toEqual(before); expect(cardSelection(s, eng).page).toBe(1);
  });
  it('Confirm buys: a Weapons level for 30 then 45; a reactor bar for 25 arrives unpowered; maxed or unaffordable rows do nothing; BACK returns to UPGRADES on the power page', () => {
    const { s, eng } = seat(200); cardSelection(s, eng).page = 1; cardSelection(s, eng).cursor = StationKind.Weapons; const used = Array.from(s.stations.level);
    run(s, 1, () => intents(confirm)); expect([s.run.upgrades[StationKind.Weapons], s.run.scrap, baseMax(s, StationKind.Weapons)]).toEqual([1, 170, STATION_MAX[StationKind.Weapons]! + 1]);
    run(s, 1); run(s, 1, () => intents(confirm)); expect([s.run.upgrades[StationKind.Weapons], s.run.scrap]).toEqual([2, 125]);
    run(s, 1); run(s, 1, () => intents(confirm)); expect([s.run.upgrades[StationKind.Weapons], s.run.scrap]).toEqual([3, 65]);
    run(s, 1); run(s, 1, () => intents(confirm)); expect([s.run.upgrades[StationKind.Weapons], s.run.scrap, s.telemetry.purchases]).toEqual([3, 65, 3]);   // maxed
    cardSelection(s, eng).cursor = REACTOR_ROW; run(s, 1); run(s, 1, () => intents(confirm)); expect([s.power.capacity, s.run.reactorBonus, s.run.scrap, powerPool(s)]).toEqual([REACTOR_CAPACITY + 1, 1, 40, 2]);
    expect(Array.from(s.stations.level)).toEqual(used);
    grantScrap(s, 10); cardSelection(s, eng).cursor = StationKind.Science; run(s, 1); run(s, 1, () => intents(confirm)); expect([s.run.upgrades[StationKind.Science], s.run.scrap]).toEqual([0, 10]);   // 30 needed
    cardSelection(s, eng).cursor = BACK; run(s, 1); run(s, 1, () => intents(confirm)); expect([cardSelection(s, eng).page, cardSelection(s, eng).cursor]).toEqual([0, UPGRADES]);
  });
  it('standing resets the page; sitting again starts on the power page at Engineering', () => {
    const { s, eng } = seat(); cardSelection(s, eng).cursor = UPGRADES; run(s, 1, () => intents(confirm)); expect(cardSelection(s, eng).page).toBe(1);
    run(s, 1, () => intents({ cancelPressed: true })); expect([Seated.station[s.crew[0]!], cardSelection(s, eng).page]).toEqual([-1, 0]);
    cardSelection(s, eng).page = 1; sitDown(s, 0, eng); expect([cardSelection(s, eng).page, cardSelection(s, eng).cursor]).toEqual([0, StationKind.Engineering]);
    cardSelection(s, eng).page = 1; failStation(s, eng); expect([Seated.station[s.crew[0]!], cardSelection(s, eng).page]).toEqual([-1, 0]);   // a failure stands the officer
  });
  it('only an online, seated Engineering officer buys: an offline console refuses; a standing Confirm and another console never buy', () => {
    const { s, eng } = seat(); cardSelection(s, eng).page = 1; cardSelection(s, eng).cursor = StationKind.Weapons; s.stations.failed[eng] = 1;   // failed under a seated officer (failStation would stand them)
    run(s, 1, () => intents(confirm)); expect([s.run.upgrades[StationKind.Weapons], s.run.scrap]).toEqual([0, 200]);
    const t = makeState(2); quiet(t); grantScrap(t, 200); const w = idx(t, StationKind.Weapons); sitDown(t, 1, w); at(t, 0, idx(t, StationKind.Engineering)); cardSelection(t, idx(t, StationKind.Engineering)).page = 1;
    run(t, 4, () => intents(confirm, confirm)); expect(Seated.station[t.crew[0]!]).toBe(idx(t, StationKind.Engineering)); expect([Array.from(t.run.upgrades), t.run.reactorBonus, t.run.scrap]).toEqual([[0, 0, 0, 0, 0, 0, 0], 0, 200]);
  });
});
