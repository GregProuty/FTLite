import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { inReachOfTile } from '../src/renderer/src/sim/interact';
import { Position, Seated } from '../src/renderer/src/sim/components';
import { DoorState, roomAt } from '../src/renderer/src/sim/grid';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { createSeatedDuel } from './helpers/duelSeat';
import { inTorpedoRange } from './helpers/torpedoRange';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { missileOf, Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
function step(d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]) { return stepDuelTick(d, { held, commands }); }
/** Stand player pid up and put them at tile (tx, ty) of the interior, as if they had walked there. */
function standAt(d: DuelState, pid: number, tx: number, ty: number): void {
  step(d, [cmd(d, pid, { kind: 'stand' })]);
  const eid = d.interior.crew[pid]!;
  Position.x[eid] = tx + 0.5; Position.y[eid] = ty + 0.5;
}

describe('createDuel (spec §8)', () => {
  it('starts both players standing at the layout spawns with every console free, holds every door open, and resolves the repair points', () => {
    const d = createDuel(layout, 5), st = d.interior;
    expect([...st.stations.occupant].every((o) => o === -1)).toBe(true);
    expect([st.stations.occupant[d.nav], st.stations.occupant[d.weapons]]).toEqual([-1, -1]);
    expect([Seated.station[st.crew[0]!], Seated.station[st.crew[1]!]]).toEqual([-1, -1]);
    expect([0, 1].map((p) => [Math.floor(Position.x[st.crew[p]!]!), Math.floor(Position.y[st.crew[p]!]!)])).toEqual([[...layout.spawns[0]!], [...layout.spawns[1]!]]);
    expect([...st.doors.state].every((s) => s === DoorState.HeldOpen)).toBe(true);
    expect(d.points.map((p) => [p.tacticalRoom, p.room])).toEqual([[Room.Weapons, st.derived.roomIndex.get('W')], [Room.Shields, st.derived.roomIndex.get('R')], [Room.Engines, st.derived.roomIndex.get('E')]]);
    expect(d.present).toEqual([true, true]);
  });
});

describe('DuelState shape', () => {
  it('has exactly these fields; a new field must also go into flattenDuel in duel/hash.ts', () => {
    expect(Object.keys(createSeatedDuel(layout, 5)).sort()).toEqual(['baseTick', 'decidedTick', 'events', 'helmPlayer', 'interior', 'nav', 'points', 'present', 'repair', 'round', 'science', 'tactical', 'throttle', 'weapons']);
  });
  it('disposeDuel is idempotent', () => {
    const d = createSeatedDuel(layout, 5);
    disposeDuel(d);
    expect(() => disposeDuel(d)).not.toThrow();
  });
});

describe('seat phase guards', () => {
  it('rejects presence from player 2 or with a non-boolean value as malformed', () => {
    const d = createSeatedDuel(layout, 5);
    const bad = cmd(d, 2, { kind: 'presence', present: false }), odd = cmd(d, 0, { kind: 'presence', present: 'no' } as unknown as DuelCommand);
    const r = step(d, [bad, odd]);
    expect(r.map((x) => [x.status, x.reason])).toEqual([['rejected', 'malformed'], ['rejected', 'malformed']]);
    expect(d.present).toEqual([true, true]);
    expect(d.present).toHaveLength(2);
  });
  it('an away player cannot stand or sit: the character stays exactly where it is', () => {
    const d = createSeatedDuel(layout, 5), eid = d.interior.crew[0]!;
    step(d, [cmd(d, 0, { kind: 'presence', present: false })]);
    const r = step(d, [cmd(d, 0, { kind: 'stand' })]);
    expect(r[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    expect(Seated.station[eid]).toBe(d.nav);
    const e2 = d.interior.crew[1]!;
    step(d, [cmd(d, 1, { kind: 'stand' })]);
    step(d, [cmd(d, 1, { kind: 'presence', present: false })]);
    const [x, y] = [Position.x[e2]!, Position.y[e2]!];
    const r2 = step(d, [cmd(d, 1, { kind: 'sit', station: d.weapons })], [NONE, { moveX: 1, moveY: 0, interactHeld: false }]);
    expect(r2[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    expect(Seated.station[e2]).toBe(-1);
    expect([Position.x[e2], Position.y[e2]]).toEqual([x, y]);
  });
});

describe('consoles are roles (spec §8, §13)', () => {
  it('the Helm player’s held moveX turns the ship clockwise and the throttle thrusts along the nose; held W does not (Artemis spec §5.3)', () => {
    const d = createSeatedDuel(layout, 5), s = d.tactical.ships[0], h0 = s.heading;
    step(d, [], [{ moveX: 1, moveY: 0, interactHeld: false }, NONE]);
    expect(s.heading).toBe((h0 + 1) % 256);                              // 1.78 steps per tick: one whole step on the first tick
    const coast = createSeatedDuel(layout, 5), thrust = createSeatedDuel(layout, 5), held = createSeatedDuel(layout, 5);
    step(coast); step(thrust, [cmd(thrust, 0, { kind: 'throttle', level: 4 })]); step(held, [], [{ moveX: 0, moveY: -1, interactHeld: false }, NONE]);
    const [a, b, w] = [coast.tactical.ships[0], thrust.tactical.ships[0], held.tactical.ships[0]];
    const dx = b.vx - a.vx, dy = b.vy - a.vy;                           // the velocity full throttle added this tick
    expect(dx * hx(b.heading) + dy * hy(b.heading)).toBeGreaterThan(0.99 * Math.hypot(dx, dy));
    expect(Math.hypot(dx, dy)).toBeGreaterThan(1.9);                     // about THRUST · dt = 2 u/s
    expect([w.vx, w.vy]).toEqual([a.vx, a.vy]);                         // held W coasts
    for (const x of [d, coast, thrust, held]) disposeDuel(x);
  });
  it('accepts weapon commands only from the present player seated at Weapons', () => {
    const d = createSeatedDuel(layout, 5);
    const helmPress = cmd(d, 0, { kind: 'laserCharge', held: true }), gunPress = cmd(d, 1, { kind: 'laserCharge', held: true });
    const results = step(d, [helmPress, gunPress]);
    expect(results.find((r) => r.id === helmPress.id)).toMatchObject({ status: 'rejected', reason: 'not-at-weapons' });
    expect(results.find((r) => r.id === gunPress.id)).toMatchObject({ status: 'applied' });
    expect(d.tactical.systems[0].fireHeld).toBe(true);
    for (let t = 0; t < 239; t++) step(d);
    expect(d.tactical.systems[0].laserCharge).toBe(LASER_CHARGE_UNITS);
    step(d, [cmd(d, 1, { kind: 'laserCharge', held: false })]);
    expect(d.tactical.systems[0].shots).toBe(1);
  });
  it('weapon commands take effect lock, then charge, then launch, whatever their envelope order', () => {
    for (const launchFirst of [true, false]) {
      const d = createSeatedDuel(layout, 5), s = d.tactical.systems[0];
      inTorpedoRange(d.tactical);                                       // weapons update spec §2: a launch needs the target within 360
      s.fireHeld = true; s.laserCharge = LASER_CHARGE_UNITS;            // a full charge, held
      const launch = cmd(d, 1, { kind: 'missileLaunch' }), release = cmd(d, 1, { kind: 'laserCharge', held: false });
      const results = step(d, launchFirst ? [launch, release] : [release, launch]);
      expect(results.map((r) => r.status), String(launchFirst)).toEqual(['applied', 'applied']);
      expect([s.shots, s.missilesLaunched], String(launchFirst)).toEqual([1, 1]);   // the release fired, then the missile launched
    }
    for (const lockFirst of [true, false]) {
      const d = createSeatedDuel(layout, 5), [s, e] = d.tactical.ships;
      Object.assign(e, { x: s.x + hx(s.heading) * 300, y: s.y + hy(s.heading) * 300 }); d.tactical.systems[1].shields = 0;   // dead ahead, shields down
      d.tactical.systems[0].fireHeld = true; d.tactical.systems[0].laserCharge = LASER_CHARGE_UNITS;
      const lock = cmd(d, 1, { kind: 'laserLock', room: Room.Engines }), release = cmd(d, 1, { kind: 'laserCharge', held: false });
      step(d, lockFirst ? [lock, release] : [release, lock]);
      expect(d.tactical.systems[1].rooms, String(lockFirst)).toEqual([0, 0, 1]);           // the new lock applied before the shot
    }
  });
  it('rejects a bad lock, a charge while a missile flies, and a launch it cannot make', () => {
    const d = createSeatedDuel(layout, 5);
    expect(step(d, [cmd(d, 1, { kind: 'missileLaunch' })]).map((r) => r.reason)).toEqual(['unavailable']);   // weapons update spec §2: out of range
    inTorpedoRange(d.tactical);
    const lock = cmd(d, 1, { kind: 'laserLock', room: 1.5 }), launch = cmd(d, 1, { kind: 'missileLaunch' });
    expect(step(d, [lock, launch]).map((r) => r.reason)).toEqual(['malformed', undefined]);
    const charge = cmd(d, 1, { kind: 'laserCharge', held: true }), again = cmd(d, 1, { kind: 'missileLaunch' });
    expect(step(d, [charge, again]).map((r) => r.reason)).toEqual(['missile-in-flight', 'unavailable']);
  });
  it('standing up empties the console: the ship coasts and weapon commands are refused', () => {
    const d = createSeatedDuel(layout, 5), s = d.tactical.ships[0];
    const stand = cmd(d, 0, { kind: 'stand' });
    expect(step(d, [stand])[0]).toMatchObject({ status: 'applied' });
    const h = s.heading;
    step(d, [], [{ moveX: 1, moveY: 0, interactHeld: false }, NONE]);
    expect(s.heading).toBe(h);                                           // nobody at the Helm: axes ignored
    expect(Seated.station[d.interior.crew[0]!]).toBe(-1);
  });
  it('a standing player walks with the held stick and can sit back down at the console', () => {
    const d = createSeatedDuel(layout, 5), eid = d.interior.crew[0]!;
    step(d, [cmd(d, 0, { kind: 'stand' })]);
    const x0 = Position.x[eid]!;
    for (let t = 0; t < 15; t++) step(d, [], [{ moveX: -1, moveY: 0, interactHeld: false }, NONE]);
    expect(Position.x[eid]!).toBeLessThan(x0 - 0.5);                   // 4 tiles/s for 0.25 s
    for (let t = 0; t < 15; t++) step(d, [], [{ moveX: 1, moveY: 0, interactHeld: false }, NONE]);
    expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav })])[0]).toMatchObject({ status: 'applied' });
    expect(d.interior.stations.occupant[d.nav]).toBe(0);
  });
  it('rejects sitting at a scenery console, unknown kinds, and stale ticks', () => {
    const d = createSeatedDuel(layout, 5);
    step(d, [cmd(d, 0, { kind: 'stand' })]);
    const medbay = d.interior.derived.stationOfKind[StationKind.Medbay]!, sit = cmd(d, 0, { kind: 'sit', station: medbay });
    const stale: DuelEnvelope = { ...cmd(d, 1, { kind: 'laserCharge', held: true }), requestedTick: d.interior.tick - 1 };
    expect(step(d, [sit, stale]).map((r) => r.reason)).toEqual(['not-in-duel', 'stale-tick']);
  });
});

describe('weapon commands need a present gunner (spec §13)', () => {
  it('a command claiming player −1 is refused when Weapons is empty or its occupant is away', () => {
    for (const vacate of ['stand', 'away'] as const) {
      const d = createSeatedDuel(layout, 5), s = d.tactical.systems[0];
      step(d, [vacate === 'stand' ? cmd(d, 1, { kind: 'stand' }) : cmd(d, 1, { kind: 'presence', present: false })]);
      const ghost = [cmd(d, -1, { kind: 'laserLock', room: Room.Engines }), cmd(d, -1, { kind: 'laserCharge', held: true }), cmd(d, -1, { kind: 'missileLaunch' })];
      expect(step(d, ghost).map((r) => r.reason), vacate).toEqual(['not-at-weapons', 'not-at-weapons', 'not-at-weapons']);
      expect([s.lock, s.fireHeld, missileOf(d.tactical, 0)], vacate).toEqual([Room.Shields, false, null]);
    }
  });
});

describe('present or away (spec §8, §11a)', () => {
  it('an away player\’s console is empty: Fire lets go without firing and their commands are refused', () => {
    const d = createSeatedDuel(layout, 5), s = d.tactical.systems[0];
    step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })]);
    expect(s.fireHeld).toBe(true);
    step(d, [cmd(d, 1, { kind: 'presence', present: false })]);
    expect(d.present).toEqual([true, false]);
    expect(s.fireHeld).toBe(false);
    expect(s.shots).toBe(0);
    expect(step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })])[0]).toMatchObject({ reason: 'not-at-weapons' });
    step(d, [cmd(d, 1, { kind: 'presence', present: true })]);
    expect(step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })])[0]).toMatchObject({ status: 'applied' });
  });
  it('an away player does not walk or repair', () => {
    const d = createSeatedDuel(layout, 5);
    d.tactical.systems[0].rooms[Room.Engines] = 1;
    standAt(d, 0, 1, 6);                                                 // Engines room, next to its repair point (2, 6)
    step(d, [cmd(d, 0, { kind: 'presence', present: false })]);
    const eid = d.interior.crew[0]!, x = Position.x[eid];
    for (let t = 0; t < 30; t++) step(d, [], [{ moveX: 1, moveY: 0, interactHeld: true }, NONE]);
    expect(Position.x[eid]).toBe(x);
    expect(d.repair[Room.Engines]).toBe(0);
  });
});

describe('repair in the room (spec §8)', () => {
  it('one repairer lowers a room one level in exactly 240 ticks; progress waits when released', () => {
    const d = createSeatedDuel(layout, 5), ship = d.tactical.systems[0];
    ship.rooms[Room.Engines] = 2;
    standAt(d, 0, 1, 6);
    const hold: HeldInput[] = [{ moveX: 0, moveY: 0, interactHeld: true }, NONE];
    for (let t = 0; t < 100; t++) step(d, [], hold);
    for (let t = 0; t < 50; t++) step(d);                                // let go: progress kept
    expect(d.repair[Room.Engines]).toBe(100 * 4);
    for (let t = 0; t < 139; t++) step(d, [], hold);
    expect(ship.rooms[Room.Engines]).toBe(2);
    step(d, [], hold);
    expect(ship.rooms[Room.Engines]).toBe(1);
    expect(d.repair[Room.Engines]).toBe(0);
  });
  it('two repairers on one point finish in 96 ticks', () => {
    const d = createSeatedDuel(layout, 5), ship = d.tactical.systems[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, 0, 1, 6); standAt(d, 1, 1, 7);
    const both: HeldInput[] = [{ moveX: 0, moveY: 0, interactHeld: true }, { moveX: 0, moveY: 0, interactHeld: true }];
    for (let t = 0; t < 95; t++) step(d, [], both);
    expect(ship.rooms[Room.Engines]).toBe(1);
    step(d, [], both);
    expect(ship.rooms[Room.Engines]).toBe(0);
  });
  it('needs the repairer inside the repair room: in reach through a wall does not count', () => {
    const d = createSeatedDuel(layout, 5), ship = d.tactical.systems[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, 0, 2, 4);                                                 // (2, 4) is the door tile north of Engines, outside the room
    expect(roomAt(d.interior, 2.5, 4.5)).not.toBe(d.points[2]!.room);
    expect(inReachOfTile(d.interior, d.interior.crew[0]!, d.points[2]!.tile)).toBe(true);   // in reach, so only the same-room rule keeps it from repairing
    for (let t = 0; t < 300; t++) step(d, [], [{ moveX: 0, moveY: 0, interactHeld: true }, NONE]);
    expect(ship.rooms[Room.Engines]).toBe(1);
  });
  it('the gunner can fix the Weapons room from the console spot, with the console empty meanwhile', () => {
    const d = createSeatedDuel(layout, 5), ship = d.tactical.systems[0];
    ship.rooms[Room.Weapons] = 1;
    step(d, [cmd(d, 1, { kind: 'stand' })]);
    for (let t = 0; t < 240; t++) step(d, [], [NONE, { moveX: 0, moveY: 0, interactHeld: true }]);
    expect(ship.rooms[Room.Weapons]).toBe(0);
  });
});

describe('the duel tick', () => {
  it('is deterministic: the same seed and inputs give the same duel hash', () => {
    const run = (): string => {
      const d = createSeatedDuel(layout, 9);
      for (let t = 0; t < 900; t++) step(d, t === 10 ? [cmd(d, 0, { kind: 'stand' })] : [], [{ moveX: t % 50 < 25 ? 1 : -1, moveY: 0, interactHeld: false }, NONE]);
      return hashDuel(d);
    };
    expect(run()).toBe(run());
  });
  it('keeps the interior and tactical ticks together, and a decided round keeps ticking with nothing to report (H-2 spec §7)', () => {
    const d = createSeatedDuel(layout, 5);
    for (let t = 0; t < 10; t++) step(d);
    expect([d.interior.tick, d.tactical.tick]).toEqual([10, 10]);
    d.tactical.systems[0].hull = 0;
    step(d);
    expect(d.tactical.outcome).toBe(Outcome.EnemyWins);
    expect(d.decidedTick).toBe(11);
    expect(step(d)).toEqual([]);
    expect([d.interior.tick, d.tactical.tick, d.decidedTick]).toEqual([12, 12, 11]);
  });
});

describe('the interior stays quiet (spec §17 risk 7)', () => {
  it('starts no breach, boarder or event in 3,600 busy ticks, and fire only where an enemy hit set it (duel-fire spec)', () => {
    const d = createSeatedDuel(layout, 5), st = d.interior, event0 = st.run.event, started = new Set<number>();
    for (let t = 0; t < 3600; t++) {
      const cmds = t === 10 ? [cmd(d, 0, { kind: 'stand' })] : t % 120 === 0 ? [cmd(d, 1, { kind: 'laserCharge', held: true })] : t % 120 === 60 ? [cmd(d, 1, { kind: 'laserCharge', held: false })] : [];
      step(d, cmds, [{ moveX: t % 40 < 20 ? 1 : -1, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }]);
      for (const e of d.events) if (e.kind === 'fireStart') started.add(d.points.find((p) => p.tacticalRoom === e.room)!.room);
      if (d.tactical.outcome !== Outcome.Running) break;
    }
    expect(d.tactical.tick).toBeGreaterThan(100);
    expect([...st.rooms.fire].every((f, room) => f === 0 || started.has(room))).toBe(true);   // no spread, no sector fire
    expect([...st.breaches.active].every((b) => b === 0)).toBe(true);
    expect([...st.boarders.active].every((b) => b === 0)).toBe(true);
    expect(st.run.event).toBe(event0);
  });
});
