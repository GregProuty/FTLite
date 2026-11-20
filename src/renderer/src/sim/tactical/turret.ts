// W-4 spec §3 (W-4b): the Hound's turrets. One pure slew law, shared by the step and the app's prediction (§11): a turret
// is an offset from the nose in fine heading steps (AIM_STEPS to the turn), fixed to the hull, moving toward the wanted
// offset (clampAim's signed difference, pew.ts L55, clamped to the arc) by at most its traverse a tick. Integers in, an
// integer out; only + − and the integer modulo. W-4 spec §3.4, §4.2: AUTO's solutions (onSolution, autoSolution) and the
// per-tick slew of both guns (slewTurrets).
import { weaponBars, WeaponSlot } from './bars';
import { hasTurret } from './defs';
import { hx, hy } from './direction';
import { lineOfSight } from './geometry';
import { gunLead } from './gun';
import { pewLead, pewMuzzle } from './pew';
import { shipSeen } from './science';
import { classOf, CREW_SLOT, handControl, type TacticalState } from './state';
import { AIM_STEPS, AUTO_FIRE_TOLERANCE, AUTOCANNON_AUTO_RANGE, HEADING_COUNT, PEW_RANGE } from './tuning';
import type { ShipInput } from './weapons';   // type only: weapons.ts imports this file

/** The signed fine-step difference of fine aim `aim` from heading index `heading`'s nose, in [−AIM_STEPS/2, AIM_STEPS/2):
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

/** W-4 spec §4.2 (owner 2026-11-19): whether a turret at offset `turret` is on AUTO solution `sol`: within
 *  AUTO_FIRE_TOLERANCE fine steps of it (null: no solution). The step's test after the slew, and the view's bracket. */
export function onSolution(turret: number, sol: number | null): boolean {
  return sol !== null && Math.abs(turret - sol) <= AUTO_FIRE_TOLERANCE;
}

/** W-4 spec §4.2: ship i's AUTO solution for its pew or its autocannon: the lead aim's offset from the nose (a whole heading
 *  × 256 less the nose), when the crew's target ship is seen (shipSeen), its centre lies within the gun's AUTO range of the
 *  own centre (PEW_RANGE, AUTOCANNON_AUTO_RANGE), the line from the gun's muzzle to its centre is clear (lineOfSight: the
 *  planet and rocks), it has an intercept and the offset lies inside ±arcSteps. Ship only: never a torpedo (owner
 *  2026-11-19). null otherwise, and on a class without that turret. */
export function autoSolution(state: TacticalState, i: number, gun: 'pew' | 'gun'): number | null {
  const cls = classOf(state, i), def = gun === 'pew' ? cls.slots.pew : cls.slots.gun, turret = def?.turret ?? null;
  if (!def || !turret) return null;
  const j = state.systems[i]!.target, me = state.ships[i]!, e = state.ships[j];
  if (j === i || !e || !e.active || !shipSeen(state, j)) return null;
  const range = gun === 'pew' ? PEW_RANGE : AUTOCANNON_AUTO_RANGE, dx = e.x - me.x, dy = e.y - me.y;
  if (dx * dx + dy * dy > range * range) return null;
  const m = gun === 'pew' ? pewMuzzle(state, i) : { x: me.x + hx(me.heading) * def.muzzleForward, y: me.y + hy(me.heading) * def.muzzleForward };
  if (!lineOfSight(state, m.x, m.y, e.x, e.y)) return null;
  const lead = gun === 'pew' ? pewLead(state, i, e.x, e.y, e.vx, e.vy) : gunLead(state, i, e.x, e.y, e.vx, e.vy);
  if (lead < 0) return null;
  const off = turretOffset(me.heading, lead);
  return off > turret.arcSteps || off < -turret.arcSteps ? null : off;
}

/** Which AUTO guns sit on their solution after this tick's slew (Task 7 fires them). */
export interface AutoOnSolution { pew: boolean; gun: boolean }
const NONE: AutoOnSolution = Object.freeze({ pew: false, gun: false });

/**
 * W-4 spec §3.4: one tick of ship i's turrets, before anything moves (the pre-move heading), from applyWeaponsInput after
 * stepBurst and before tickGun. Only the crew slot of a turret class, only while Weapons is attended; a gun on 0 bars holds.
 * The gun in hand (handControl: its own switch on MAN, and the selected weapon; owner 2026-11-19) slews toward the reticle
 * (input.turretAim) at its MAN traverse, and holds with no reticle. Every other powered gun is AUTO-driven, a MAN one out of
 * hand too: it slews toward its solution (autoSolution) at its AUTO traverse, or back to the nose with none, and reports on
 * solution when it ends within AUTO_FIRE_TOLERANCE of it (onSolution). It slews in the hold too; only firing waits (§4.3,
 * applyWeaponsInput).
 */
export function slewTurrets(state: TacticalState, i: number, input: ShipInput): AutoOnSolution {
  const cls = classOf(state, i);
  if (i !== CREW_SLOT || !hasTurret(cls) || !input.weapons) return NONE;
  const s = state.systems[i]!, heading = state.ships[i]!.heading, out = { pew: false, gun: false };
  for (const gun of ['pew', 'gun'] as const) {
    const turret = (gun === 'pew' ? cls.slots.pew : cls.slots.gun)?.turret ?? null, slot = gun === 'pew' ? WeaponSlot.Pew : WeaponSlot.Autocannon;
    if (!turret || weaponBars(s, slot) < 1) continue;   // no power, no slew
    const now = gun === 'pew' ? s.pewTurret : s.gunTurret;
    let next = now;
    if (handControl(state, i, input.weaponSel, slot)) {   // the gun in hand (W-4c adds the MANUAL flight inside handControl)
      if (input.turretAim < 0) continue;   // no reticle: it holds
      next = slewTurret(now, heading, input.turretAim, turret.traverse[1], turret.arcSteps);
    } else {   // AUTO-driven: AUTO, and in MAN the gun out of hand (taking control never costs firepower)
      const sol = autoSolution(state, i, gun);
      next = slewTurret(now, heading, turretWorldAim(heading, sol ?? 0), turret.traverse[0], turret.arcSteps);
      out[gun] = onSolution(next, sol);
    }
    if (gun === 'pew') s.pewTurret = next; else s.gunTurret = next;
  }
  return out;
}
