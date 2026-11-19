// Engineering spike spec §10.3 (Amendment 2): the Weapons officer splits the Weapons bars across pew pew, the beam and
// the torpedo, 0..3 each, a 4th only with the overdrive bar; bars come off the highest slot first, the overdrive bar
// first; weaponPower is the Weapons seat's (stale, seat, malformed, unavailable).
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { applyPower, clampToCapacity, DuelSystem } from '../src/renderer/src/sim/duel/power';
import { trimmedWeaponPower, WeaponSlot } from '../src/renderer/src/sim/tactical/bars';
import { createTacticalState, Room } from '../src/renderer/src/sim/tactical/state';
import { sitDown } from '../src/renderer/src/sim/stations';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const env = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[]) => stepDuelTick(d, { held: [NONE, NONE], commands });
const wp = (d: DuelState) => d.tactical.systems[0].weaponPower;

describe('engineering spike: the Weapons allocation (spec §10.3)', () => {
  it('the round starts pew pew 1, beam 0, torpedo 1; the Hunter holds none', () => {
    const s = createTacticalState(1);
    expect(s.systems[0].weaponPower).toEqual([1, 0, 1]);
    expect(s.systems[1].weaponPower).toEqual([0, 0, 0]);
  });
  it('the trim: the overdrive bar first, then the highest slot down, one bar at a time, at once through effectiveBars', () => {
    const s = createTacticalState(1), sys = s.systems[0];
    sys.bars[DuelSystem.Weapons] = 10; sys.weaponPower = [3, 3, 4];
    expect(trimmedWeaponPower(sys)).toEqual([3, 3, 4]);
    sys.bars[DuelSystem.Weapons] = 9;
    expect(trimmedWeaponPower(sys)).toEqual([3, 3, 3]);                  // the 4th bar goes first
    sys.bars[DuelSystem.Weapons] = 7;
    expect(trimmedWeaponPower(sys)).toEqual([3, 3, 1]);                  // then the torpedo
    sys.bars[DuelSystem.Weapons] = 10; sys.rooms[Room.Weapons] = 1;      // damage 1: capacity 5
    expect(trimmedWeaponPower(sys)).toEqual([3, 2, 0]);
  });
  it('weaponPower: the seat, the slot and delta, a free bar, below 3 (4 only with the overdrive bar); −1 at 0 is unavailable', () => {
    const d = createDuel(HOUND, 9);
    try {
      expect(step(d, [env(d, 0, { kind: 'weaponPower', slot: WeaponSlot.Beam, delta: 1 })])[0]).toMatchObject({ status: 'rejected', reason: 'not-at-weapons' });
      sitDown(d.interior, 1, d.weapons);
      for (const bad of [{ slot: 3, delta: 1 }, { slot: 0, delta: 2 }])
        expect(step(d, [env(d, 1, { kind: 'weaponPower', ...bad })])[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Beam, delta: 1 })])[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });   // 2 bars, 2 spent
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Beam, delta: -1 })])[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });  // the beam holds 0
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Torpedo, delta: -1 })])[0]).toMatchObject({ status: 'applied' });
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Beam, delta: 1 })])[0]).toMatchObject({ status: 'applied' });
      expect(wp(d)).toEqual([1, 1, 0]);
      applyPower(d, DuelSystem.Weapons, 1);                                // the one spare bar: 3 Weapons bars
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Pew, delta: 1 })])[0]).toMatchObject({ status: 'applied' });
      expect(wp(d)).toEqual([2, 1, 0]);
      applyPower(d, DuelSystem.Weapons, -1); applyPower(d, DuelSystem.Weapons, -1); clampToCapacity(d);
      expect(wp(d)).toEqual([1, 0, 0]);                                   // the beam's bar goes before pew pew's
    } finally { disposeDuel(d); }
  });
  it('a 4th bar only with the overdrive bar, and only on one weapon', () => {
    const d = createDuel(HOUND, 9);
    try {
      const sys = d.tactical.systems[0];
      sys.bars = [0, 10, 0, 0, 0]; sys.weaponPower = [3, 3, 3];
      sitDown(d.interior, 1, d.weapons);
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Pew, delta: 1 })])[0]).toMatchObject({ status: 'applied' });
      expect(wp(d)).toEqual([4, 3, 3]);
      sys.bars[DuelSystem.Weapons] = 9; sys.weaponPower = [3, 3, 2];
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Torpedo, delta: 1 })])[0]).toMatchObject({ status: 'applied' });
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Torpedo, delta: 1 })])[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });   // 9 bars: no 4th
    } finally { disposeDuel(d); }
  });
});
