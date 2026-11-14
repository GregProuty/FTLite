// Combat geometry without angles (spec §4): arcs by dot product, sides by cross product, line of sight by segment
// against circle, and the room a missile strikes by its impact point (spec §5).
import { hx, hy } from './direction';
import { queryGrid } from './grid';
import { Room, type Ship, type TacticalState } from './state';

/** Whether direction (dx, dy) lies inside the ±arc around heading h, given cos(arc) as a literal. A zero vector counts as inside. */
export function inArc(heading: number, dx: number, dy: number, arcCos: number): boolean {
  const d = Math.sqrt(dx * dx + dy * dy);
  return hx(heading) * dx + hy(heading) * dy >= arcCos * d;
}

/** Whether the segment (ax, ay) → (bx, by) passes closer than r to the point (cx, cy). */
export function segmentNear(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): boolean {
  const ex = bx - ax, ey = by - ay, len2 = ex * ex + ey * ey;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((cx - ax) * ex + (cy - ay) * ey) / len2)) : 0;
  const px = ax + ex * t - cx, py = ay + ey * t - cy;
  return px * px + py * py < r * r;
}

/** True when nothing solid (the planet or any asteroid) lies across the segment (spec §7a line of sight). */
export function lineOfSight(state: TacticalState, ax: number, ay: number, bx: number, by: number): boolean {
  const p = state.map.planet;
  if (segmentNear(ax, ay, bx, by, p.x, p.y, p.r)) return false;
  const half = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / 2;
  for (const k of queryGrid(state.grid, (ax + bx) / 2, (ay + by) / 2, half)) {
    const a = state.map.asteroids[k]!;
    if (segmentNear(ax, ay, bx, by, a.x, a.y, a.r)) return false;
  }
  return true;
}

/** The room a hit at (px, py) strikes on ship s (spec §5): nose = Weapons, stern = Engines, flanks = Shields. */
export function roomAtImpact(s: Ship, px: number, py: number): number {
  const dx = px - s.x, dy = py - s.y, h0 = hx(s.heading), h1 = hy(s.heading);
  const f = dx * h0 + dy * h1, side = Math.abs(h0 * dy - h1 * dx);
  if (f >= side) return Room.Weapons;
  if (-f >= side) return Room.Engines;
  return Room.Shields;
}

/** 2-D cross product sign of heading h against (dx, dy): +1 when (dx, dy) is clockwise of h (y down), −1 anticlockwise, 0 on the line. */
export function sideOf(heading: number, dx: number, dy: number): number {
  return Math.sign(hx(heading) * dy - hy(heading) * dx) || 0;
}
