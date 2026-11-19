// FTL-style weapon targeting (docs/superpowers/specs/2026-11-17-ftl-targeting-design.md §2, §3): per-weapon targets,
// the crew laser that always charges and never vents, laser auto-fire on a target, the torpedo's single auto-launch
// on its own target, the laserLock −1 / torpLock commands through the duel step and the wire, and the snapshot rules
// for the new fields. The Hunter is unchanged.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { CommandEnvelope } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { flyMissile, resolveMissiles } from '../src/renderer/src/sim/tactical/missiles';
import { flattenTactical, shipModule, spaceModule, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { createTacticalState, missileOf, placeMissile, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { CUTTER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { LASER_BURST_GAP_TICKS, LASER_CHARGE_UNITS, LASER_HOLD_TICKS, MISSILE_RANGE } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT, laserEligible, tickWeapons, validTarget, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { createSeatedDuel } from './helpers/duelSeat';
import { makeHostile } from './helpers/hostile';

const layout = parseShip(cutter);
/** The crew at (−600, −300) facing east, the enemy 300 east facing west: in arc, laser range and torpedo range. */
function facing(): TacticalState {
  const st = makeHostile(createTacticalState(5));
  st.map = { ...st.map, asteroids: [] };
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  return st;
}
const input = (over: Partial<ShipInput> = {}): ShipInput => ({ ...IDLE_INPUT, ...over });
/** One weapons tick of the crew (commands, missile flight and contacts, clocks); returns the crew's laser shots. */
function tick(st: TacticalState, crew: ShipInput = IDLE_INPUT): number {
  st.events = [];
  applyWeaponsInput(st, 0, crew);
  flyMissile(st, 0); resolveMissiles(st);
  tickWeapons(st, 0, crew);
  st.tick++;
  return st.events.filter((e) => e.kind === 'laser' && e.ship === 0).length;
}
const behind = (st: TacticalState): void => { st.ships[1].x = -900; };   // behind the crew: out of arc

describe('the crew laser always charges (spec §2)', () => {
  it('every round starts with the crew laser and magazine full; the Hunter laser starts empty', () => {
    const st = createTacticalState(9);
    expect([st.systems[0].laserCharge, st.systems[0].magazine]).toEqual([LASER_CHARGE_UNITS, CUTTER_CLASS.slots.missile.magazine]);
    // Feel-i (console feel spec §3): the laser starts targeted at Shields, the FTL opener; the torpedo untargeted.
    expect([st.systems[0].laserTargeted, st.systems[0].lock, st.systems[0].torpLock, st.systems[0].torpRoom]).toEqual([true, Room.Shields, -1, -1]);
    expect(st.systems[1].laserCharge).toBe(0);
  });
  it('with a target it charges with no hold and fires its burst on full and eligible', () => {
    const st = facing(), s = st.systems[0];
    s.laserCharge = 0;
    tick(st, input({ laserLock: Room.Engines }));
    expect([s.laserTargeted, s.lock, s.fireHeld]).toEqual([true, Room.Engines, false]);
    const ticks: number[] = [];
    for (let k = 1; k <= 260; k++) if (tick(st) > 0) ticks.push(k);
    // full on the 240th clock (tick 239 after the lock tick), then the burst's first shot the next tick's commands, then its second
    expect(ticks).toEqual([240, 240 + LASER_BURST_GAP_TICKS]);
    expect(s.shots).toBe(2);
  });
  it('holds a full charge out of arc without venting, and fires the tick the enemy comes into arc', () => {
    const st = facing(), s = st.systems[0];
    behind(st);
    tick(st, input({ laserLock: Room.Shields }));
    for (let k = 0; k < 3 * LASER_HOLD_TICKS; k++) expect(tick(st)).toBe(0);
    expect([s.laserCharge, s.laserHold, s.shots]).toEqual([LASER_CHARGE_UNITS, 0, 0]);
    st.ships[1].x = -300;
    expect(laserEligible(st, 0, 1)).toBe(true);
    expect(tick(st)).toBe(1);
  });
  it('re-fires every charge while it keeps its target, and clearing the target (laserLock −1) stops it', () => {
    const st = facing(), s = st.systems[0];
    tick(st, input({ laserLock: Room.Shields }));
    expect(s.shots).toBe(1);                                            // full from the start: fires at once
    for (let k = 0; k < 280; k++) tick(st);
    expect(s.shots).toBe(4);                                            // the burst's second shot, then a full charge and a second burst
    tick(st, input({ laserLock: -1 }));
    expect([s.laserTargeted, s.lock]).toEqual([false, Room.Shields]);   // the lock room stays for a manual shot
    for (let k = 0; k < 600; k++) tick(st);
    expect([s.shots, s.laserCharge]).toEqual([4, LASER_CHARGE_UNITS]);
    tick(st, input({ laserCharge: true }));                             // Space: a single press fires a full laser
    expect(s.shots).toBe(5);
  });
  it('an unattended console neither charges nor auto-fires, and keeps the target', () => {
    const st = facing(), s = st.systems[0];
    behind(st);
    tick(st, input({ laserLock: Room.Shields }));
    s.laserCharge = 100;
    st.ships[1].x = -300;
    for (let k = 0; k < 60; k++) expect(tick(st, input({ weapons: false }))).toBe(0);
    expect([s.laserCharge, s.laserTargeted]).toEqual([100, true]);
  });
  it('the Hunter is unchanged: its lock commands set no target and its full charge still vents', () => {
    const st = facing(), h = st.systems[1];
    applyWeaponsInput(st, 1, input({ laserLock: Room.Weapons, torpLock: Room.Engines }));
    expect([h.lock, h.laserTargeted, h.torpLock]).toEqual([Room.Weapons, false, -1]);
    h.laserCharge = LASER_CHARGE_UNITS; h.fireHeld = true;
    for (let k = 0; k < LASER_HOLD_TICKS; k++) tickWeapons(st, 1, IDLE_INPUT);
    expect(h.laserCharge).toBe(0);
  });
});

describe('the torpedo target (spec §2)', () => {
  it('launches once the enemy comes into range, then clears torpLock and strikes the room it named', () => {
    const st = facing(), s = st.systems[0], e = st.systems[1];
    st.ships[1].x = -600 + MISSILE_RANGE + 40;                          // in laser arc, out of torpedo range
    s.laserCharge = 0;                                                  // and the laser charging, so nothing else fires
    tick(st, input({ torpLock: Room.Engines }));
    for (let k = 0; k < 30; k++) tick(st);
    expect([missileOf(st, 0), s.torpLock]).toEqual([null, Room.Engines]);
    st.ships[1].x = -600 + MISSILE_RANGE - 10;
    tick(st);
    expect(missileOf(st, 0)).not.toBeNull();
    expect([s.torpLock, s.torpRoom, s.missilesLaunched]).toEqual([-1, Room.Engines, 1]);
    s.lock = Room.Weapons;                                              // the laser's lock is not the torpedo's room
    const m = missileOf(st, 0)!;
    Object.assign(m, { x: st.ships[1].x - 5, y: st.ships[1].y, age: 100 });
    resolveMissiles(st);
    expect(st.events.at(-1)).toMatchObject({ kind: 'missileEnd', cause: 'ship', target: 1, room: Room.Engines });
    expect([e.rooms[Room.Engines], e.rooms[Room.Weapons], s.torpRoom]).toEqual([1, 0, -1]);
    for (let k = 0; k < 100; k++) tick(st);
    expect(s.missilesLaunched).toBe(1);                                 // a single shot: no second launch
  });
  it('a manual launch with no torpedo target strikes the laser lock room as it lands', () => {
    const st = facing(), s = st.systems[0], e = st.systems[1];
    tick(st, input({ missileLaunch: true, laserLock: -1 }));
    expect([s.torpRoom, s.torpLock]).toEqual([-1, -1]);
    s.lock = Room.Engines;
    Object.assign(missileOf(st, 0)!, { x: st.ships[1].x - 5, y: st.ships[1].y, age: 100 });
    resolveMissiles(st);
    expect(e.rooms[Room.Engines]).toBe(1);
  });
  it('waits while a torpedo is in flight or the magazine is empty, and torpLock −1 clears the target', () => {
    const st = facing(), s = st.systems[0];
    s.laserCharge = 0;
    placeMissile(st, 0, { x: 2000, y: 2000, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 10 });
    tick(st, input({ torpLock: Room.Shields }));
    expect([s.torpLock, s.missilesLaunched]).toEqual([Room.Shields, 0]);
    st.missiles[0]!.active = false; Object.assign(st.missiles[0]!, { owner: 0, x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
    s.magazine = 0;
    tick(st);
    expect([s.torpLock, s.missilesLaunched]).toEqual([Room.Shields, 0]);
    tick(st, input({ torpLock: -1 }));
    s.magazine = 1;
    tick(st);
    expect([s.torpLock, s.missilesLaunched]).toEqual([-1, 0]);
  });
});

describe('the commands through the duel step and the wire (spec §2)', () => {
  let seq = 0;
  const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
  const step = (d: DuelState, commands: DuelEnvelope[]) => stepDuelTick(d, { held: [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }], commands });
  it('laserLock accepts −1 to clear; torpLock accepts −1..2; anything else is malformed; only the gunner may send them', () => {
    const d = createSeatedDuel(layout, 5), s = d.tactical.systems[0];
    try {
      expect(validTarget(-1) && validTarget(0) && validTarget(2)).toBe(true);
      expect([validTarget(-2), validTarget(3), validTarget(0.5)]).toEqual([false, false, false]);
      const r1 = step(d, [cmd(d, 1, { kind: 'laserLock', room: Room.Engines }), cmd(d, 1, { kind: 'torpLock', room: Room.Weapons }), cmd(d, 0, { kind: 'torpLock', room: 1 })]);
      expect(r1.map((r) => r.reason ?? r.status)).toEqual(['not-at-weapons', 'applied', 'applied']);
      expect([s.laserTargeted, s.lock, s.torpLock]).toEqual([true, Room.Engines, Room.Weapons]);
      const r2 = step(d, [cmd(d, 1, { kind: 'laserLock', room: -1 }), cmd(d, 1, { kind: 'torpLock', room: -1 }), cmd(d, 1, { kind: 'torpLock', room: 3 }), cmd(d, 1, { kind: 'laserLock', room: -2 })]);
      expect(r2.map((r) => r.reason ?? r.status)).toEqual(['applied', 'applied', 'malformed', 'malformed']);
      expect([s.laserTargeted, s.lock, s.torpLock]).toEqual([false, Room.Engines, -1]);
    } finally { disposeDuel(d); }
  });
  it('the ship module owns torpLock, and the duel codec carries it and laserLock −1', () => {
    expect(shipModule.commands).toEqual(['laserLock', 'torpLock', 'rockLock', 'laserCharge', 'missileLaunch']);
    const codec = duelCodec(2), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const command of [{ kind: 'torpLock', room: -1 }, { kind: 'torpLock', room: 2 }, { kind: 'laserLock', room: -1 }])
      expect(codec.decodeMessage(codec.encodeMessage(envelope(command)))).toEqual(envelope(command));
    for (const command of [{ kind: 'torpLock', room: -2 }, { kind: 'torpLock' }, { kind: 'laserLock', room: -2 }, { kind: 'torpLock', room: 1.5 }])
      expect(() => codec.encodeMessage(envelope(command))).toThrow();
  });
  it('snapshot validation bounds laserTargeted to 0/1 and torpLock and torpRoom to −1..2', () => {
    const st = createTacticalState(5), base = Array.from(flattenTactical(st));
    expect(() => validateTacticalValues(st, base)).not.toThrow();
    /** The flat index of a ship-module field: the space module's values come first. */
    const field = (name: string): number => {
      let index = 0;
      for (const f of [...spaceModule.fields(st), ...shipModule.fields(st)]) { if (f.name === name) return index; index += f.count; }
      throw Error(name);
    };
    for (const [name, value] of [['systems.0.laserTargeted', 2], ['systems.0.torpLock', 3], ['systems.0.torpLock', -2], ['systems.0.torpRoom', 3]] as const) {
      const bad = [...base]; bad[field(name)] = value;
      expect(() => validateTacticalValues(st, bad), `${name} ${value}`).toThrow(new RegExp(name.replace(/\./g, '\\.')));
    }
    const ok = [...base]; ok[field('systems.0.torpLock')] = -1; ok[field('systems.0.torpRoom')] = 2;
    expect(() => validateTacticalValues(st, ok)).not.toThrow();
  });
});
