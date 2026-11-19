// Pew pew (spec 2026-11-18-pew-pew-weapons-design §1, §4; W-1): the crew Cutter's and the Hunter's skill-shot gun, on a
// class whose pew slot is not null. Its charge is ticks on the systems record: a third of the bar per rechargeTicks, shots
// thirds, a round spending one; it refills every tick, attended or not, whatever the Weapons damage (spec §6 decision 4).
// The aim is a fine heading (AIM_STEPS to the turn: a heading index times HEADING_COUNT plus its fraction), clamped in
// that space into ±arcSteps about the heading at the moment of firing. A round leaves the nose at the round speed along
// the aim, ignoring the ship's velocity, into the shared pool tactical.pew (gun.ts placeRound's pick). firePew runs from
// applyWeaponsInput (before anything moves); stepPew (Task 3) after the gun rounds. Only + − × ÷ and sqrt.
import type { PewDef } from './defs';
import { dirBetween, hx, hy } from './direction';
import { placeRound } from './gun';
import { classOf, type TacticalState } from './state';
import { AIM_STEPS, HEADING_COUNT } from './tuning';

/** A full charge in ticks: every third stored. */
export function pewFull(def: PewDef): number { return def.shots * def.rechargeTicks; }

/** Whether ship i's pew holds at least one full third (a round can fire); never for a class without the pew. */
export function pewReady(state: TacticalState, i: number): boolean {
  const def = classOf(state, i).slots.pew;
  return def !== null && state.systems[i]!.pewCharge >= def.rechargeTicks;
}

/** A pewFire command's aim (spec §4): a heading index 0..255 and its fraction aimAcc 0..255, both integers. */
export function validAim(aim: unknown, aimAcc: unknown): boolean {
  return typeof aim === 'number' && typeof aimAcc === 'number' && Number.isInteger(aim) && Number.isInteger(aimAcc)
    && aim >= 0 && aim < HEADING_COUNT && aimAcc >= 0 && aimAcc < HEADING_COUNT;
}

/** The fine aim `aim` clamped into ±arcSteps about heading index `heading` (spec §1), in fine heading space: the signed
 *  difference d = ((aim − heading·256 + 1.5·AIM_STEPS) mod AIM_STEPS) − AIM_STEPS/2, clamped, added back and wrapped.
 *  Integers in, an integer 0..AIM_STEPS − 1 out. */
export function clampAim(heading: number, aim: number, arcSteps: number): number {
  const base = heading * HEADING_COUNT, d = ((aim - base + AIM_STEPS + AIM_STEPS / 2) % AIM_STEPS) - AIM_STEPS / 2;
  const c = d > arcSteps ? arcSteps : d < -arcSteps ? -arcSteps : d;
  return (base + c + AIM_STEPS) % AIM_STEPS;
}

/** The unit direction of fine aim `aim`, between its two heading table entries. */
export function aimDir(aim: number): [number, number] {
  return dirBetween(Math.floor(aim / HEADING_COUNT), (aim % HEADING_COUNT) / HEADING_COUNT);
}

/** Ship i's muzzle: its centre plus the nose offset along its heading. */
export function pewMuzzle(state: TacticalState, i: number): { x: number; y: number } {
  const s = state.ships[i]!, f = classOf(state, i).slots.pew?.muzzleForward ?? 0;
  return { x: s.x + hx(s.heading) * f, y: s.y + hy(s.heading) * f };
}

/** Fire ship i's pew along fine aim `aim` (spec §1): with the pew, a valid aim (an integer 0..AIM_STEPS − 1) and at least
 *  a third stored, a round leaves the muzzle at the round speed along the clamped aim, a third is spent, the shot is
 *  counted and a pewFire event pushed; returns whether it fired. */
export function firePew(state: TacticalState, i: number, aim: number): boolean {
  const def = classOf(state, i).slots.pew, s = state.systems[i]!;
  if (!def || !Number.isInteger(aim) || aim < 0 || aim >= AIM_STEPS || s.pewCharge < def.rechargeTicks) return false;
  const [ux, uy] = aimDir(clampAim(state.ships[i]!.heading, aim, def.arcSteps)), m = pewMuzzle(state, i);
  placeRound(state, { x: m.x, y: m.y, vx: ux * def.speed, vy: uy * def.speed, age: 0, owner: i }, state.pew);
  s.pewCharge -= def.rechargeTicks; s.pewShots++;
  state.events.push({ kind: 'pewFire', ship: i, x: m.x, y: m.y });
  return true;
}

/** One tick of ship i's pew recharge (spec §1): one tick of charge while below full, every tick. */
export function tickPew(state: TacticalState, i: number): void {
  const def = classOf(state, i).slots.pew, s = state.systems[i]!;
  if (def && s.pewCharge < pewFull(def)) s.pewCharge++;
}
