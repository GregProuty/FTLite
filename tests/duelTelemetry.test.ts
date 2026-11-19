import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position } from '../src/renderer/src/sim/components';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { stepDuelTick, type DuelInput } from '../src/renderer/src/sim/duel/step';
import { BAIT_WINDOW_TICKS, createTelemetry, endedFromPlanet, recordTick, type DuelTelemetry } from '../src/renderer/src/sim/duel/telemetry';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { missileOf, Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';
import { inTorpedoRange } from './helpers/torpedoRange';
import { todaysCrewWeapons } from './helpers/crewWeapons';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const HOLD: HeldInput = { moveX: 0, moveY: 0, interactHeld: true };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
/** One tick, folded into the telemetry when one is given. */
function step(d: DuelState, t: DuelTelemetry | null, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]): void {
  const input: DuelInput = { held, commands };
  stepDuelTick(d, input);
  if (t) recordTick(t, d, input);
}
/** Stand player pid up and put them at tile (tx, ty), as if they had walked there. */
function standAt(d: DuelState, t: DuelTelemetry | null, pid: number, tx: number, ty: number): void {
  step(d, t, [cmd(d, pid, { kind: 'stand' })]);
  const eid = d.interior.crew[pid]!;
  Position.x[eid] = tx + 0.5; Position.y[eid] = ty + 0.5;
}

describe('repair events (H-0c-ii-a spec §4)', () => {
  it('a repairWork per worker every tick of work, a repairDone when the level drops, cleared every tick', () => {
    const d = createSeatedDuel(layout, 5), ship = d.tactical.systems[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, null, 0, 1, 6);
    expect(d.events).toEqual([]);
    for (let k = 0; k < 239; k++) {
      step(d, null, [], [HOLD, NONE]);
      expect(d.events).toEqual([{ kind: 'repairWork', player: 0, room: Room.Engines }]);
    }
    step(d, null, [], [HOLD, NONE]);
    expect(d.events).toEqual([{ kind: 'repairWork', player: 0, room: Room.Engines }, { kind: 'repairDone', room: Room.Engines, players: [0] }]);
    step(d, null, [], [HOLD, NONE]);   // the room is at 0: nothing to work on
    expect(d.events).toEqual([]);
  });
  it('a joint finish names both workers; the events are not hashed', () => {
    const d = createSeatedDuel(layout, 5), ship = d.tactical.systems[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, null, 0, 1, 6); standAt(d, null, 1, 1, 7);
    for (let k = 0; k < 95; k++) step(d, null, [], [HOLD, HOLD]);
    const h = hashDuel(d);
    d.events = [{ kind: 'repairDone', room: 0, players: [1] }];
    expect(hashDuel(d)).toBe(h);
    step(d, null, [], [HOLD, HOLD]);
    expect(d.events.at(-1)).toEqual({ kind: 'repairDone', room: Room.Engines, players: [0, 1] });
  });
});

describe('telemetry (H-0c-ii-a spec §4)', () => {
  it('a first sit from the standing start is not a console swap; a sit at the other console is (start-aboard spec §1)', () => {
    const d = createDuel(layout, 5), t = createTelemetry(d), w = d.interior.derived.width;
    const goTo = (pid: number, station: number) => { const tile = d.interior.derived.stationTile[station]!, eid = d.interior.crew[pid]!; Position.x[eid] = (tile % w) + 0.5; Position.y[eid] = Math.floor(tile / w) + 0.5; };
    goTo(0, d.nav); step(d, t, [cmd(d, 0, { kind: 'sit', station: d.nav })]);
    expect(d.interior.stations.occupant[d.nav]).toBe(0);
    expect(t.consoleSwaps).toBe(0);
    step(d, t, [cmd(d, 0, { kind: 'stand' })]);
    goTo(0, d.weapons); step(d, t, [cmd(d, 0, { kind: 'sit', station: d.weapons })]);
    expect(d.interior.stations.occupant[d.weapons]).toBe(0);
    expect(t.consoleSwaps).toBe(1);
  });
  it('counts a repair start on the first tick of work and again on resumed work; a finish per level dropped', () => {
    const d = createSeatedDuel(layout, 5), t = createTelemetry(d), ship = d.tactical.systems[0];
    ship.rooms[Room.Weapons] = 2;
    step(d, t, [cmd(d, 1, { kind: 'stand' })]);                            // the gunner stands in reach of the Weapons point
    for (let k = 0; k < 480; k++) step(d, t, [], [NONE, HOLD]);              // both levels, held throughout
    expect(ship.rooms[Room.Weapons]).toBe(0);
    expect(t.players[1]).toMatchObject({ repairsStarted: 1, repairsFinished: 2, repairingTicks: 480, walkingTicks: 1 });
    ship.rooms[Room.Weapons] = 1;                                           // a new hit while still holding: the same work goes on
    for (let k = 0; k < 10; k++) step(d, t, [], [NONE, HOLD]);
    expect(t.players[1]!.repairsStarted).toBe(1);
    step(d, t);                                                             // let go for one tick, then resume: a new start
    for (let k = 0; k < 230; k++) step(d, t, [], [NONE, HOLD]);
    expect(t.players[1]).toMatchObject({ repairsStarted: 2, repairsFinished: 3 });
    expect(t.players[0]).toMatchObject({ repairsStarted: 0, repairsFinished: 0, walkingTicks: 0, repairingTicks: 0 });
    expect(t.weaponsEmptyTicks).toBe(t.ticks);
    expect(t.helmEmptyTicks).toBe(0);
  });
  it('credits a joint finish to both players', () => {
    const d = createSeatedDuel(layout, 5), t = createTelemetry(d), ship = d.tactical.systems[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, t, 0, 1, 6); standAt(d, t, 1, 1, 7);
    for (let k = 0; k < 96; k++) step(d, t, [], [HOLD, HOLD]);
    expect(t.players.map((p) => [p.repairsStarted, p.repairsFinished])).toEqual([[1, 1], [1, 1]]);
  });
  it('a crew ship that dies on the planet ends the duel from planet contact', () => {
    const d = createSeatedDuel(layout, 5), t = createTelemetry(d), s = d.tactical.ships[0], p = d.tactical.map.planet;
    s.x = p.x + p.r + SHIP_RADIUS - 5; s.y = p.y; s.vx = -10; s.vy = 0; d.tactical.systems[0].hull = 1;
    step(d, t);
    expect(t.outcome).toBe(Outcome.EnemyWins);
    expect(t.terminal).toEqual([['planet'], []]);
    expect(t.ships[0].planetContacts).toBe(1);
    expect(endedFromPlanet(t)).toBe(true);
  });
  it('a laser kill is attributed to the laser, not the planet', () => {
    const d = createSeatedDuel(layout, 5), t = createTelemetry(d), [s, e] = d.tactical.ships;
    todaysCrewWeapons(d.tactical);   // Engineering spike spec §10.3: the round starts the beam dark; give it its bars
    e.x = s.x + hx(s.heading) * 200; e.y = s.y + hy(s.heading) * 200; e.vx = s.vx; e.vy = s.vy; d.tactical.systems[1].shields = 0; d.tactical.systems[1].hull = 1;
    d.tactical.systems[0].laserCharge = LASER_CHARGE_UNITS;
    step(d, t, [cmd(d, 1, { kind: 'laserCharge', held: true })]);   // FTL targeting spec §2: one press fires a full laser
    expect(t.outcome).toBe(Outcome.CrewWins);
    expect(t.terminal).toEqual([[], ['laser']]);
    expect(t.ships[0]).toMatchObject({ laserReleases: 1, laserHits: 1, laserMisses: 0, layersStripped: 0 });
    expect(endedFromPlanet(t)).toBe(false);
  });
  it('an enemy planet contact after a crew manoeuvre with the enemy near is a bait; without one, or too late, it is not', () => {
    const bait = (manoeuvre: boolean, wait: number): number => {
      const d = createSeatedDuel(layout, 5), t = createTelemetry(d), [s, e] = d.tactical.ships, p = d.tactical.map.planet;
      e.x = s.x + 500; e.y = s.y; e.vx = s.vx; e.vy = s.vy;                  // within 900 of the crew, far from the planet
      step(d, t, [], [manoeuvre ? { moveX: 1, moveY: 0, interactHeld: false } : NONE, NONE]);
      for (let k = 0; k < wait; k++) step(d, t);
      e.x = p.x - p.r - SHIP_RADIUS + 5; e.y = p.y; e.vx = 10; e.vy = 0;     // into the planet's far side
      step(d, t);
      expect(t.ships[1].planetContacts).toBe(1);
      return t.baits;
    };
    expect(bait(true, 0)).toBe(1);
    expect(bait(false, 0)).toBe(0);
    expect(bait(true, BAIT_WINDOW_TICKS)).toBe(0);
  });
  it('counts Weapons as idle only with nothing to do: full, no launch possible, enemy out of the arc', () => {
    const d = createSeatedDuel(layout, 5), t = createTelemetry(d), s = d.tactical.systems[0];
    todaysCrewWeapons(d.tactical);   // Engineering spike spec §10.3: the round starts the beam dark; give it its bars
    s.laserCharge = LASER_CHARGE_UNITS;
    step(d, t);                                                             // the duel's start: the enemy beyond torpedo range (weapons update spec §2)
    expect(t.weaponsIdleTicks).toBe(1);
    inTorpedoRange(d.tactical);
    step(d, t);                                                             // a launch is possible (enemy astern in range, magazine full)
    expect(t.weaponsIdleTicks).toBe(1);
    s.magazine = 0;
    step(d, t);
    expect(t.weaponsIdleTicks).toBe(2);
    step(d, t, [cmd(d, 1, { kind: 'stand' })]);                             // nobody at Weapons: not idle, empty
    expect([t.weaponsIdleTicks, t.weaponsEmptyTicks]).toEqual([2, 1]);
  });
  it('counts missile launches and their losses by cause', () => {
    const d = createSeatedDuel(layout, 5), t = createTelemetry(d);
    inTorpedoRange(d.tactical);
    step(d, t, [cmd(d, 1, { kind: 'missileLaunch' })]);
    while (missileOf(d.tactical, 0) && d.tactical.outcome === Outcome.Running) step(d, t);
    const c = t.ships[0], lost = Object.values(c.missileLosses).reduce((a, b) => a + b, 0) + c.missileHitsByRoom.reduce((a, b) => a + b, 0);
    expect(c.missilesLaunched).toBe(1);
    expect(lost).toBe(1);
  });
});

describe('a set throttle is a manoeuvre (Artemis spec §5.3)', () => {
  it('an enemy planet contact while the throttle is set counts as a bait; with the throttle back at STOP for the window it does not', () => {
    const bait = (levels: number[], wait: number): number => {
      const d = createSeatedDuel(layout, 5), t = createTelemetry(d), [s, e] = d.tactical.ships, p = d.tactical.map.planet;
      e.x = s.x + 500; e.y = s.y; e.vx = s.vx; e.vy = s.vy;                  // within 900 of the crew, far from the planet
      for (const level of levels) step(d, t, [cmd(d, 0, { kind: 'throttle', level })]);
      for (let k = 0; k < wait; k++) step(d, t);
      e.x = p.x - p.r - SHIP_RADIUS + 5; e.y = p.y; e.vx = 10; e.vy = 0;     // into the planet's far side
      step(d, t);
      expect(t.ships[1].planetContacts).toBe(1);
      return t.baits;
    };
    expect(bait([2], 0)).toBe(1);
    expect(bait([2, 0], BAIT_WINDOW_TICKS)).toBe(0);
  });
});
