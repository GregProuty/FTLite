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

// ---- Engines (Task 8; Engineering spike spec §10.2, Amendment 2; isolated) ----
/** Spec §10.2: the top forward throttle level at each effective Engines bar count 0..5: 1 bar = 25 %, capped at 4. */
export const THROTTLE_CAP_BY_BARS: readonly number[] = [0, 1, 2, 3, 4, 4];
/** Spec §10.2: the thrust and turn factor at each effective Engines bar count; the overdrive bar adds 25 %. */
export const ENGINE_FACTOR_BY_BARS: readonly number[] = [0, 1, 1, 1, 1, 1.25];
/** The crew ship's top forward throttle level now. */
export function throttleCap(sys: Pick<ShipSystems, 'rooms' | 'bars'>): number { return THROTTLE_CAP_BY_BARS[effectiveBars(sys, DuelSystem.Engines)]!; }
/** Whether throttle `level` is allowed now: up to the cap, and reverse (-1) only with a bar (a cap above 0). */
export function throttleAllowed(sys: Pick<ShipSystems, 'rooms' | 'bars'>, level: number): boolean {
  const cap = throttleCap(sys);
  return level === -1 ? cap > 0 : level <= cap;
}
/** The nearest allowed level to `level` (the bots' throttle, Decision 16): itself, else the cap for forward, else 0. */
export function levelWithinCap(sys: Pick<ShipSystems, 'rooms' | 'bars'>, level: number): number {
  return throttleAllowed(sys, level) ? level : level > 0 ? throttleCap(sys) : 0;
}

// ---- Weapons, the allocation (Task 9a; Engineering spike spec §10.3, Amendment 2; isolated) ----
/** Spec §10.3, §11: the three crew weapons in slot order: pew pew (W-1's weapon; its bars set its recharge, spec §11), the beam (today's laser), the torpedo. */
export const WeaponSlot = { Pew: 0, Beam: 1, Torpedo: 2 } as const;
export const WEAPON_SLOTS = 3;
/** A weapon's bars without the overdrive bar; the overdrive bar can be one weapon's 4th (spec §10.3). */
export const WEAPON_BAR_MAX = 3;
/** Spec §10.3: the round starts pew pew 1, beam 0, torpedo 1 (2 Weapons bars). */
export const START_WEAPON_POWER: readonly number[] = [1, 0, 1];
type WeaponSys = Pick<ShipSystems, 'rooms' | 'bars' | 'weaponPower'>;
/** The Weapons bars the officer can spend now (the effective Weapons bars). */
export function weaponBarsUsable(sys: Pick<ShipSystems, 'rooms' | 'bars'>): number { return effectiveBars(sys, DuelSystem.Weapons); }
/** Spec §10.3 (Decision 17): the bars each weapon stands on now. Without the overdrive bar (usable ≤ 9) no weapon keeps a
 *  4th; then while more are spent than usable, one bar comes off the highest slot that has one (torpedo, beam, pew pew). */
export function trimmedWeaponPower(sys: WeaponSys): number[] {
  const usable = weaponBarsUsable(sys), t = sys.weaponPower.slice();
  if (usable <= SYSTEM_MAX[DuelSystem.Weapons]!) for (let k = 0; k < WEAPON_SLOTS; k++) if (t[k]! > WEAPON_BAR_MAX) t[k] = WEAPON_BAR_MAX;
  let spent = t[0]! + t[1]! + t[2]!;
  for (let k = WEAPON_SLOTS - 1; k >= 0 && spent > usable;) { if (t[k]! > 0) { t[k] = t[k]! - 1; spent--; } else k--; }
  return t;
}
/** The bars weapon `slot` stands on now (trimmed). */
export function weaponBars(sys: WeaponSys, slot: number): number { return trimmedWeaponPower(sys)[slot]!; }

// ---- Weapons, the effects (Task 9b; Engineering spike spec §10.3, §11; isolated) ----
// Indexed by a weapon's bars 0..4; 4 is the overdrive bar, 3's effect at 1.25× the charge or reload rate.
/** Spec §11 (the W-1 plug-in, merge decision 1a): the crew pew pew's ticks per third by its bars; 0 bars, no recharge and no
 *  round (refused, `unavailable`). The overdrive 4th bar is 24. The Hunter keeps its class's fixed rechargeTicks. */
export const PEW_TICKS_BY_BARS: readonly number[] = [0, 60, 45, 30, 24];
export const BEAM_SHOTS_BY_BARS: readonly number[] = [0, 1, 2, 2, 2];
export const BEAM_RATE_BY_BARS: readonly number[] = [0, 40, 40, 60, 75];
export const TORPEDO_RELOAD_BY_BARS: readonly number[] = [0, 4, 6, 8, 10];
/** The Room levels a crew torpedo hit adds (to the cap of 2). A torpedo already in flight when its bars go hits for 1. */
export const TORPEDO_LEVELS_BY_BARS: readonly number[] = [1, 1, 1, 2, 2];
/** The crew magazine's units clock: at 4 a tick (1 bar) a missile takes 2700 ticks, today's MAGAZINE_REGEN_TICKS. */
export const MAGAZINE_REGEN_UNITS = 10800;

// ---- Sensors (Task 10; Engineering spike spec §10.4, Amendment 2; isolated) ----
/** Spec §10.4: scan progress per tick by effective Sensors bars 0..4, for a Science scan and a Helm/Weapons scan. */
export const SCAN_SCIENCE_BY_BARS: readonly number[] = [0, 5, 6, 7, 8];
export const SCAN_OTHER_BY_BARS: readonly number[] = [0, 2, 2, 3, 3];
/** Spec §10.4: the crew's sensor range (map units) by effective Sensors bars 0..4. */
export const SENSOR_RANGE_BY_BARS: readonly number[] = [300, 900, 1400, 2000, 2800];
