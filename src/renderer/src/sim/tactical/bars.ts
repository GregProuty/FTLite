// Engineering spike spec §2 (docs/superpowers/specs/2026-11-18-engineering-spike-design.md): the crew ship's reactor
// bars on the tactical side. The powered bars are ShipSystems.bars (a `ship` module field); every ship-0 reader reads
// them through effectiveBars, which also applies the tactical Room's damage, so a hit inside stepDuel gates at once
// (spec §2, R3-F1). Constants and pure functions only: state.ts imports this file, so it imports only types from it.
import type { ShipSystems } from './state';

/** The five powered systems, in bar order (spec §2). */
export const DuelSystem = { Shields: 0, Weapons: 1, Engines: 2, Sensors: 3, Oxygen: 4 } as const;
export const DUEL_SYSTEM_COUNT = 5;
/** Systems 0..3 take an overdrive bar, coolant and heat; Oxygen (4) none (spec §3). */
export const OVERDRIVE_SYSTEMS = 4;
/** Each system's max bars, and its slots (max plus the overdrive slot; Oxygen has none). Spec §10.1: Weapons is three
 *  weapons × 3. */
export const SYSTEM_MAX: readonly number[] = [4, 9, 4, 3, 2];
export const SYSTEM_SLOTS: readonly number[] = [5, 10, 5, 4, 2];
/** The tactical Room whose damage knocks each system's slots out, −1 for none (Sensors, Oxygen). Literal Room values
 *  (Shields 1, Weapons 0, Engines 2; tests/engBars.test.ts pins them to Room), because state.ts imports this file. */
export const SYSTEM_TACTICAL_ROOM: readonly number[] = [1, 0, 2, -1, -1];
/** Spec §10.1: the Hound's reactor, and every round's start (9 used, 1 spare; Engines 3 = 75 % throttle). */
export const REACTOR_BARS = 10;
export const START_BARS: readonly number[] = [2, 2, 3, 1, 1];

/** Spec §2 rate tables (start values), indexed by effective bars 0..slots. */
export const SHIELD_LAYERS_BY_BARS: readonly number[] = [0, 0, 1, 1, 2, 2];
export const SHIELD_RATE_BY_BARS: readonly number[] = [0, 2, 3, 4, 5, 6];
export const OXY_FACTOR_BY_BARS: readonly number[] = [0, 0.5, 1];
// The Engines, Weapons and Sensors tables and helpers are added by Tasks 8, 9 and 10 (isolated: a later owner
// amendment rewrites them), each in its own section at the end of this file.

/** The slots one damage level knocks out of system k: ceil(slots / 2), so level 2 is off (spec §2). */
export function knock(k: number): number { return Math.ceil(SYSTEM_SLOTS[k]! / 2); }

/** System k's capacity from its tactical Room's damage alone: max(0, slots − damage × knock). A failed system's 0, and
 *  Sensors' hazards (spec §10.4), are the duel power module's (capacityOf); tactical code sees neither, because
 *  clampToCapacity lowers the bars the same tick. */
export function damageCapacity(sys: Pick<ShipSystems, 'rooms'>, k: number): number {
  const r = SYSTEM_TACTICAL_ROOM[k]!, damage = r >= 0 ? sys.rooms[r]! : 0;
  return Math.max(0, SYSTEM_SLOTS[k]! - damage * knock(k));
}

/** System k's effective bars: min(powered bars, damage capacity). Every ship-0 reader of spec §2 reads this. */
export function effectiveBars(sys: Pick<ShipSystems, 'rooms' | 'bars'>, k: number): number {
  return Math.min(sys.bars[k]!, damageCapacity(sys, k));
}
