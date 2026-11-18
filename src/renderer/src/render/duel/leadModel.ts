// Valkyrn spec §7.4: the minigun's lead pip, Elite Dangerous style. A fixed gun hits a target moving at constant velocity
// when the nose points where the target will be, in the shooter's frame, after the round's flight. Pure: no Pixi; only
// leadPipFor reads a state.
import { HEADING_COUNT } from '../../sim/tactical/tuning';
import { classOf, targetOf, type TacticalState } from '../../sim/tactical/state';

/** The aim point (x, y) in world units and the round's flight time t in seconds. */
export interface Lead { x: number; y: number; t: number }

/**
 * The lead pip for a round of speed `speed` (relative to the shooter, which adds its own velocity, spec §7.1) fired now from
 * (sx, sy) moving (svx, svy) at a target at (tx, ty) moving (tvx, tvy): the target's place in the shooter's frame after the
 * flight, (tx + (tvx − svx)·t, ty + (tvy − svy)·t), with t the least positive root of |r + v·t| = speed·t. A round fired at
 * it meets the target's world position (tx + tvx·t, ty + tvy·t). Null when there is no positive root (the target outruns
 * the round) or the target sits on the shooter.
 */
export function leadPip(sx: number, sy: number, svx: number, svy: number, tx: number, ty: number, tvx: number, tvy: number, speed: number): Lead | null {
  const rx = tx - sx, ry = ty - sy, vx = tvx - svx, vy = tvy - svy;
  const a = vx * vx + vy * vy - speed * speed, b = 2 * (rx * vx + ry * vy), c = rx * rx + ry * ry;
  let t: number;
  if (Math.abs(a) < 1e-9) { if (b >= 0) return null; t = -c / b; }
  else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const q = Math.sqrt(disc), t1 = (-b - q) / (2 * a), t2 = (-b + q) / (2 * a), lo = Math.min(t1, t2), hi = Math.max(t1, t2);
    t = lo > 0 ? lo : hi;
  }
  if (!(t > 0) || !Number.isFinite(t)) return null;
  return { x: tx + vx * t, y: ty + vy * t, t };
}

/** Ship `i`'s lead pip on its target from the state's bodies (no interpolation): the form the scripted pilot's agreement
 *  test reads (Valkyrn Part iii). Null when the class has no gun, or the target is itself or inactive. */
export function leadPipFor(state: TacticalState, i: number): Lead | null {
  const gun = classOf(state, i).slots.gun, j = targetOf(state, i), s = state.ships[i], t = state.ships[j];
  if (!gun || j === i || !s || !t?.active) return null;
  return leadPip(s.x, s.y, s.vx, s.vy, t.x, t.y, t.vx, t.vy, gun.speed);
}

/** Whether the nose line from (x, y) along heading `h` (a heading index, continuous allowed; 0 north, clockwise) passes
 *  within `r` of (px, py), forward only: the pip's "on target" (spec §7.4). */
export function onTarget(x: number, y: number, h: number, px: number, py: number, r: number): boolean {
  const a = (h / HEADING_COUNT) * Math.PI * 2, fx = Math.sin(a), fy = -Math.cos(a), dx = px - x, dy = py - y;
  if (dx * fx + dy * fy <= 0) return false;
  return Math.abs(dx * fy - dy * fx) <= r;
}
