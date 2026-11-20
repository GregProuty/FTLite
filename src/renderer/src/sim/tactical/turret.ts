// W-4 spec §3 (W-4b): the Hound's turrets. One pure slew law, shared by the step and the app's prediction (§11): a turret
// is an offset from the nose in fine heading steps (AIM_STEPS to the turn), fixed to the hull, moving toward the wanted
// offset (clampAim's signed difference, pew.ts L55, clamped to the arc) by at most its traverse a tick. Integers in, an
// integer out; only + − and the integer modulo. Task 4 adds AUTO's solutions and the per-tick slew of both guns.
import { AIM_STEPS, HEADING_COUNT } from './tuning';

/** The signed fine-step difference of fine aim `aim` from heading index `heading`'s nose, in (−AIM_STEPS/2, AIM_STEPS/2]:
 *  ((aim − heading·256 + 1.5·AIM_STEPS) mod AIM_STEPS) − AIM_STEPS/2. `aim` may be any integer (it wraps). */
export function turretOffset(heading: number, aim: number): number {
  return ((((aim - heading * HEADING_COUNT + AIM_STEPS + AIM_STEPS / 2) % AIM_STEPS) + AIM_STEPS) % AIM_STEPS) - AIM_STEPS / 2;
}
/** One tick of a turret at offset `turret` on a ship at heading index `heading` toward fine aim `aim`: the wanted offset is
 *  turretOffset clamped to ±arcSteps, and the turret moves toward it by at most `rate` (never past it). */
export function slewTurret(turret: number, heading: number, aim: number, rate: number, arcSteps: number): number {
  const raw = turretOffset(heading, aim), want = raw > arcSteps ? arcSteps : raw < -arcSteps ? -arcSteps : raw, step = want - turret;
  return turret + (step > rate ? rate : step < -rate ? -rate : step);
}
/** A turret's world aim: the fine aim (0..AIM_STEPS − 1) of offset `turret` on the nose of heading index `heading`. */
export function turretWorldAim(heading: number, turret: number): number {
  return (((heading * HEADING_COUNT + turret) % AIM_STEPS) + AIM_STEPS) % AIM_STEPS;
}
