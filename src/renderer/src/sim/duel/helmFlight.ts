// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §4, §5): the crew Helm's pure rules on a newtonianHelm
// class, shared by the duel step (sim/duel/step.ts), the scripted crew and the app's prediction: the thrust a held
// throttle flies, the ramp and its clamp, the Engines cap and floor, the compressor and venting. Integers in and out for
// the state; only + − × ÷. Owner 2026-11-19 (the merge with the Engineering spike): no ENGINE/COMPRESSOR split; the cap
// and the floor come from Engineering's effective Engines bars.
import { DuelSystem, effectiveBars } from '../tactical/bars';
import type { Axes, ShipSystems } from '../tactical/state';
import { RCS_TURN_BOOST } from '../tactical/tuning';
import { COMPRESSOR_RATE, RCS_GAS_PER_TICK, RCS_TANK, THR_MIN, THR_RAMP, THR_RETURN } from './tuning';

/** §4: this tick's vented thruster axes (−1, 0 or 1 each: x port/starboard, y aft/forward), whether the turn was
 *  gas-boosted, and the boosted turn's direction (`turn`: 1 clockwise, −1 anticlockwise, 0 when not boosted; the puffs'
 *  sides, final review M2). Per-tick scratch on DuelState (helmVent), never hashed or snapshotted. */
export interface HelmVent { x: number; y: number; boosted: boolean; turn: number }
/** A fresh unvented record (a new object each call). */
export function noVent(): HelmVent { return { x: 0, y: 0, boosted: false, turn: 0 }; }

/** §3: the thrust axis a held throttle flies, in −1..1: a quarter of the reverse scale per 250 below 0, a thousandth per
 *  mille above. */
export function crewThrust(m: number): number { return m < 0 ? m / 250 : m / 1000; }

/** A held field (throttleHeld, rcsX, rcsY, §7): 1 or −1 as given; anything else, absent included, is 0. */
export function heldAxis(v: unknown): number { return v === 1 ? 1 : v === -1 ? -1 : 0; }

/** Owner 2026-11-19 (replaces §5's ENGINE share): the crew ship's effective Engines bars (Engineering spike §2: the powered
 *  bars less the Engines Room's damage), 0..5. */
export function engineBars(d: { tactical: { systems: readonly Pick<ShipSystems, 'rooms' | 'bars'>[] } }): number { return effectiveBars(d.tactical.systems[0]!, DuelSystem.Engines); }
/** Owner 2026-11-19: the throttle's cap, min(Engines bars, 4) × 250: 1 bar = 25 %, and the overdrive 5th bar adds no cap. */
export function throttleCap(engine: number): number { return Math.min(Math.max(engine, 0), 4) * 250; }
/** Owner 2026-11-19: the throttle's floor: −250 (reverse) with at least 1 Engines bar, else 0. */
export function throttleFloor(engine: number): number { return engine >= 1 ? THR_MIN : 0; }

/** §3: one tick of the ramp: held 1 (W) adds THR_RAMP, −1 (S) takes it away, 0 returns toward 0 by THR_RETURN and stops
 *  there; then the clamp to [floor, cap]. */
export function rampThrottle(m: number, held: number, floor: number, cap: number): number {
  const next = held > 0 ? m + THR_RAMP : held < 0 ? m - THR_RAMP : m > 0 ? Math.max(0, m - THR_RETURN) : Math.min(0, m + THR_RETURN);
  return Math.max(floor, Math.min(cap, next));
}
/** `ticks` ramp ticks from `m` with one held value (the app's local prediction, §3). */
export function rampTicks(m: number, held: number, floor: number, cap: number, ticks: number): number {
  let out = m;
  for (let k = 0; k < ticks; k++) out = rampThrottle(out, held, floor, cap);
  return out;
}

/** §4: one tick of the compressor: the sixtieths add up, the whole units go into the tank, the tank stops at RCS_TANK, and
 *  a full tank holds no remainder. Owner 2026-11-19: no COMPRESSOR share, so it runs at the old start share's rate. */
export function compress(gas: number, acc: number): { gas: number; acc: number } {
  const a = acc + COMPRESSOR_RATE, g = Math.min(gas + Math.floor(a / 60), RCS_TANK);
  return { gas: g, acc: g === RCS_TANK ? 0 : a % 60 };
}

/** §4: whether an axis held `want` (−1, 0 or 1) vents from a tank holding `gas`: it needs a tick's gas. */
export function vents(want: number, gas: number): boolean { return want !== 0 && gas >= RCS_GAS_PER_TICK; }

/** §4, §6: the vent a set of crew axes shows (the puffs and the hiss): its vented axes, and whether its turn is boosted. */
export function ventOf(axes: Axes): HelmVent {
  const boosted = axes.turnBoost === RCS_TURN_BOOST;
  return { x: axes.rcsX ?? 0, y: axes.rcsY ?? 0, boosted, turn: boosted ? Math.sign(axes.turn) || 0 : 0 };
}
