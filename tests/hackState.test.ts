// Hacking spike (spec 2026-11-20-science-hacking-design §2.1, §2.2, §6 R1-3): the hack state, the Science split of the
// Sensors bars, the gate level a hack imposes, the clone and flatten round trip and the value rules.
import { describe, expect, it } from 'vitest';
import { DuelSystem, hackBars, hackOnline, HACK_MIN_BARS, roomLevel, scannerBars } from '../src/renderer/src/sim/tactical/bars';
import { flattenTactical, unflattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { cloneTactical, createTacticalState, CREW_SLOT, Room } from '../src/renderer/src/sim/tactical/state';

describe('the hack state (hacking spike §2.1)', () => {
  it('starts every round at rest: no hack bars, nothing hacked, no hack running', () => {
    const t = createTacticalState(7);
    expect(t.systems.map((s) => [s.hackPower, [...s.hacked]])).toEqual([[0, [0, 0, 0]], [0, [0, 0, 0]]]);
    expect([t.hackRoom, t.hackTicks]).toEqual([-1, 0]);
  });
  it('round-trips through clone and flatten with a hack running and a room down', () => {
    const t = createTacticalState(7);
    t.systems[CREW_SLOT].hackPower = 2; t.systems[1].hacked[Room.Engines] = 900; t.hackRoom = Room.Weapons; t.hackTicks = 37;
    const copy = cloneTactical(t);
    expect(flattenTactical(copy)).toEqual(flattenTactical(t));
    copy.systems[1].hacked[Room.Engines] = 1;
    expect(t.systems[1].hacked[Room.Engines]).toBe(900);   // a deep copy
    const fresh = createTacticalState(7), values = flattenTactical(t);
    expect(unflattenTactical(fresh, values)).toBe(values.length);
    expect([fresh.systems[CREW_SLOT].hackPower, fresh.systems[1].hacked[Room.Engines], fresh.hackRoom, fresh.hackTicks]).toEqual([2, 900, Room.Weapons, 37]);
    expect(validateTacticalValues(createTacticalState(7), values)).toBe(values.length);
  });
});

describe('the Science split of the Sensors bars (§2.2)', () => {
  const sys = (sensors: number, hackPower: number) => {
    const s = createTacticalState(1).systems[CREW_SLOT];
    s.bars[DuelSystem.Sensors] = sensors; s.hackPower = hackPower;
    return s;
  };
  it('gives the hack its bars trimmed to the effective Sensors bars, and the scanner the rest', () => {
    expect([hackBars(sys(3, 2)), scannerBars(sys(3, 2))]).toEqual([2, 1]);
    expect([hackBars(sys(1, 3)), scannerBars(sys(1, 3))]).toEqual([1, 0]);
    expect([hackBars(sys(2, 0)), scannerBars(sys(2, 0))]).toEqual([0, 2]);
  });
  it('is online from HACK_MIN_BARS (2) bars', () => {
    expect(HACK_MIN_BARS).toBe(2);
    expect([hackOnline(sys(3, 1)), hackOnline(sys(3, 2)), hackOnline(sys(1, 2))]).toEqual([false, true, false]);
  });
  it('reads a hacked room as level 2 for the gates, and its damage level otherwise', () => {
    const s = createTacticalState(1).systems[1];
    s.rooms[Room.Shields] = 1;
    expect(roomLevel(s, Room.Shields)).toBe(1);
    s.hacked[Room.Shields] = 5;
    expect(roomLevel(s, Room.Shields)).toBe(2);
    expect(s.rooms[Room.Shields]).toBe(1);   // the damage itself is untouched
  });
});

describe('the hack value rules (R1-3)', () => {
  const bad = (edit: (t: ReturnType<typeof createTacticalState>) => void, why: RegExp): void => {
    const t = createTacticalState(3); edit(t);
    expect(() => validateTacticalValues(createTacticalState(3), flattenTactical(t))).toThrow(why);
  };
  it('refuses hack bars off the crew, a hacked crew, a mismatched hack, a resting full hold, and a hack on a room already down', () => {
    bad((t) => { t.systems[1].hackPower = 1; }, /only the crew has hack bars/);
    bad((t) => { t.systems[CREW_SLOT].hackPower = 5; }, /hackPower: out of range/);
    bad((t) => { t.systems[CREW_SLOT].hacked[0] = 3; }, /the crew is never hacked/);
    bad((t) => { t.systems[1].hacked[0] = 1801; }, /hacked: out of range/);
    bad((t) => { t.hackRoom = 1; t.hackTicks = 0; }, /disagree/);
    bad((t) => { t.hackRoom = -1; t.hackTicks = 3; }, /disagree/);
    bad((t) => { t.hackRoom = 1; t.hackTicks = 420; }, /hackTicks: out of range/);
    bad((t) => { t.hackRoom = 2; t.hackTicks = 10; t.systems[1].hacked[2] = 50; }, /already down/);
  });
});
