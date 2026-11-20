// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §4, §5): the crew Helm's pure rules on a newtonianHelm
// class, shared by the duel step (sim/duel/step.ts), the scripted crew and the app's prediction: the thrust a held
// throttle flies, the ramp and its clamp, the Engines cap and floor, and the vent record. Integers in and out for the
// state; only + − × ÷. Owner 2026-11-19 (the merge with the Engineering spike): no ENGINE/COMPRESSOR split, the cap and the
// floor come from Engineering's effective Engines bars. Helm round 2 (spec 2026-11-19-helm-round2-design §2, §3.3): the
// throttle stays where it is left, reverse reaches −500, and the cold gas is a charge (gasTick).
import { DuelSystem, effectiveBars } from '../tactical/bars';
import type { Axes, ShipSystems } from '../tactical/state';
import { THR_MIN, THR_RAMP } from './tuning';

/** §4, helm round 2 §3.2, §3.3: this tick's vented thruster axes (−1, 0 or 1 each: x port/starboard, y aft/forward): the
 *  axes that actually vented. Per-tick scratch on DuelState (helmVent), never hashed or snapshotted. */
export interface HelmVent { x: number; y: number }
/** A fresh unvented record (a new object each call). */
export function noVent(): HelmVent { return { x: 0, y: 0 }; }

/** Helm round 2 §2.2: the thrust axis a held throttle flies, in −1..1: −500 is full reverse (the class's reverse fraction of
 *  full thrust), 1000 full forward. */
export function crewThrust(m: number): number { return m < 0 ? m / 500 : m / 1000; }

/** A held field (throttleHeld, rcsX, rcsY, §7): 1 or −1 as given; anything else, absent included, is 0. */
export function heldAxis(v: unknown): number { return v === 1 ? 1 : v === -1 ? -1 : 0; }

/** Owner 2026-11-19 (replaces §5's ENGINE share): the crew ship's effective Engines bars (Engineering spike §2: the powered
 *  bars less the Engines Room's damage), 0..5. */
export function engineBars(d: { tactical: { systems: readonly Pick<ShipSystems, 'rooms' | 'bars'>[] } }): number { return effectiveBars(d.tactical.systems[0]!, DuelSystem.Engines); }
/** Owner 2026-11-19: the throttle's cap, min(Engines bars, 4) × 250: 1 bar = 25 %, and the overdrive 5th bar adds no cap. */
export function throttleCap(engine: number): number { return Math.min(Math.max(engine, 0), 4) * 250; }
/** Owner 2026-11-19, helm round 2 §2.2: the throttle's floor: THR_MIN (−500, full reverse) with at least 1 Engines bar, else 0. */
export function throttleFloor(engine: number): number { return engine >= 1 ? THR_MIN : 0; }

/** Helm round 2 §2.1: one tick of the ramp: held 1 (W) adds THR_RAMP, −1 (S) takes it away, and 0 leaves it where it is; then
 *  the clamp to [floor, cap]. */
export function rampThrottle(m: number, held: number, floor: number, cap: number): number {
  const next = held > 0 ? m + THR_RAMP : held < 0 ? m - THR_RAMP : m;
  return Math.max(floor, Math.min(cap, next));
}
/** `ticks` ramp ticks from `m` with one held value (the app's local prediction, §3). */
export function rampTicks(m: number, held: number, floor: number, cap: number, ticks: number): number {
  let out = m;
  for (let k = 0; k < ticks; k++) out = rampThrottle(out, held, floor, cap);
  return out;
}


/** §4, §6: the vent a set of crew axes shows (the puffs and the hiss): its vented axes. */
export function ventOf(axes: Axes): HelmVent { return { x: axes.rcsX ?? 0, y: axes.rcsY ?? 0 }; }
