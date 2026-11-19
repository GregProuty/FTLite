// Engineering spike spec §2: the reactor bars on the tactical side (sim/tactical/bars.ts), ShipSystems.bars, the start
// of a round, and the bars field in the ship module (hash, snapshot rule, clone).
import { describe, expect, it } from 'vitest';
import { damageCapacity, DuelSystem, effectiveBars, knock, START_BARS, SYSTEM_SLOTS, SYSTEM_TACTICAL_ROOM } from '../src/renderer/src/sim/tactical/bars';
import { cloneTactical, createTacticalState, Room } from '../src/renderer/src/sim/tactical/state';
import { flattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';

describe('engineering spike: tactical bars (spec §2)', () => {
  it('the tactical-room table is Room order, knock is ceil(slots / 2), capacity is 5/2/0, 10/5/0 and 5/2/0 by damage', () => {
    expect(SYSTEM_TACTICAL_ROOM).toEqual([Room.Shields, Room.Weapons, Room.Engines, -1, -1]);
    expect([0, 1, 2, 3, 4].map(knock)).toEqual([3, 5, 3, 2, 1]);
    const sys = { rooms: [0, 0, 0] as [number, number, number] };
    const caps = (k: number) => [0, 1, 2].map((dmg) => { const r = SYSTEM_TACTICAL_ROOM[k]!; if (r >= 0) sys.rooms[r as 0 | 1 | 2] = dmg; const c = damageCapacity(sys, k); sys.rooms = [0, 0, 0]; return c; });
    expect(caps(DuelSystem.Shields)).toEqual([5, 2, 0]);
    expect(caps(DuelSystem.Weapons)).toEqual([10, 5, 0]);
    expect(caps(DuelSystem.Engines)).toEqual([5, 2, 0]);
    expect(caps(DuelSystem.Sensors)).toEqual([4, 4, 4]);   // no tactical Room (its hazards are the duel module's, Task 10)
    expect(caps(DuelSystem.Oxygen)).toEqual([2, 2, 2]);
    expect(SYSTEM_SLOTS).toEqual([5, 10, 5, 4, 2]);
  });
  it('effectiveBars is min(bars, damage capacity): a level-2 Room reads 0 bars the moment it is hit', () => {
    const sys = { rooms: [0, 0, 0] as [number, number, number], bars: [4, 9, 3, 1, 1] };
    expect(effectiveBars(sys, DuelSystem.Weapons)).toBe(9);
    sys.rooms[Room.Weapons] = 1; expect(effectiveBars(sys, DuelSystem.Weapons)).toBe(5);
    sys.rooms[Room.Weapons] = 2; expect(effectiveBars(sys, DuelSystem.Weapons)).toBe(0);
    sys.rooms[Room.Shields] = 1; expect(effectiveBars(sys, DuelSystem.Shields)).toBe(2);
  });
  it('the crew slot starts each round at START_BARS and 1 shield layer; the Hunter holds zero bars and its 2 layers', () => {
    const s = createTacticalState(1);
    expect(s.systems[0].bars).toEqual([...START_BARS]);
    expect(s.systems[0].shields).toBe(1);
    expect(s.systems[1].bars).toEqual([0, 0, 0, 0, 0]);
    expect(s.systems[1].shields).toBe(2);
  });
  it('bars are hashed, validated (0..10) and cloned', () => {
    const s = createTacticalState(3), before = flattenTactical(s);
    s.systems[0].bars[DuelSystem.Sensors] = 0;
    expect(flattenTactical(s)).not.toEqual(before);
    const copy = cloneTactical(s);
    expect(copy.systems[0].bars).toEqual(s.systems[0].bars);
    expect(copy.systems[0].bars).not.toBe(s.systems[0].bars);
    const values = Array.from(flattenTactical(s));
    expect(validateTacticalValues(s, values, 0)).toBe(values.length);
    s.systems[0].bars[0] = 11;                                             // out of 0..10: refused by name
    expect(() => validateTacticalValues(s, Array.from(flattenTactical(s)), 0)).toThrow(/systems\.0\.bars/);
  });
});
