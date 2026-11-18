// The minigun's lead (Valkyrn spec §7.4): where to point the nose so a round fired now meets the target, for a target
// holding its velocity. Pure and trig-free (+ − × ÷ and sqrt only), so the scripted pilot (sim/duel/scriptedPilot.ts)
// can aim with it; tests/valkyrnLead.test.ts pins it equal to the view's pip (render/duel/leadModel.ts).
import { hx, hy } from './direction';
import { classOf, type TacticalState } from './state';
import { HEADING_COUNT } from './tuning';

/** The time (s) at which a round fired now at `speed` (u/s, relative to the shooter) meets a target at relative position
 *  (rx, ry) moving at relative velocity (vx, vy): the smallest positive root of |r + v·t| = speed·t, or −1 for none. */
export function interceptTime(rx: number, ry: number, vx: number, vy: number, speed: number): number {
  const a = vx * vx + vy * vy - speed * speed, b = 2 * (rx * vx + ry * vy), c = rx * rx + ry * ry;
  if (Math.abs(a) < 1e-9) {   // the target's relative speed equals the round's: the equation is linear
    if (b >= 0) return -1;
    const t = -c / b;
    return t > 0 ? t : -1;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc), t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
  const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
  return lo > 0 ? lo : hi > 0 ? hi : -1;
}

/** Ship i's lead on its locked target, as an offset from ship i (the direction to point the nose), or null: no gun,
 *  no active target, or no intercept. Rounds inherit the ship's velocity (spec §7.1), so the relative velocity is used. */
export function leadOffset(state: TacticalState, i: number): { x: number; y: number } | null {
  const gun = classOf(state, i).slots.gun, j = state.systems[i]!.target, me = state.ships[i]!, t = state.ships[j];
  if (!gun || !t || !t.active || j === i) return null;
  const rx = t.x - me.x, ry = t.y - me.y, vx = t.vx - me.vx, vy = t.vy - me.vy, tl = interceptTime(rx, ry, vx, vy, gun.speed);
  return tl < 0 ? null : { x: rx + vx * tl, y: ry + vy * tl };
}

/** The heading index nearest the direction (dx, dy): the largest dot product with the heading table, the lowest index
 *  on a tie; −1 for the zero vector. */
export function nearestHeading(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return -1;
  let best = 0, bestDot = hx(0) * dx + hy(0) * dy;
  for (let h = 1; h < HEADING_COUNT; h++) {
    const dot = hx(h) * dx + hy(h) * dy;
    if (dot > bestDot) { best = h; bestDot = dot; }
  }
  return best;
}
