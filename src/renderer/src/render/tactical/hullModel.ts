// Hull silhouettes spec section 1: the ships' outlines and rooms on the console maps, in ship units (nose +f,
// starboard +s; one unit is SHIP_RADIUS * zoom px). The Hound is traced from the bought 2-Minute Tabletop painting
// (only these coordinates are in git; the 2MT licence caveat applies); the scout is an original design. Pure: no Pixi.

import type { HULL_IDS } from '../../sim/ship/fleet';

export type HullId = (typeof HULL_IDS)[number];   // Valkyrn spec §4.5: 'hound' | 'scout' | 'valkyrn', Part i's list (Decision 6)
/** Flat [f, s, f, s, ...] polygons. rooms[0] Weapons, rooms[1] Shields, rooms[2] Engines (ROOM_NAMES order). */
export interface Hull { outline: readonly number[]; rooms: readonly (readonly number[])[] }

/** The enemy's blinking marker ring, as a multiple of the ship's radius (the shield rings start at 1.6). */
export const ENEMY_RING = 1.35;

const HOUND: Hull = {
  outline: [
    -0.565, -0.847, -0.03, -0.817, 0.101, -0.676, 0.282, -0.565, 0.424, -0.333, 0.474, -0.434, 0.524, -0.454, 0.776, -0.434,
    0.827, -0.363, 0.706, -0.353, 0.706, -0.313, 1.018, -0.282, 1.18, -0.121, 1.15, 0.151, 0.998, 0.282, 0.676, 0.292, 0.696, 0.353,
    0.837, 0.353, 0.756, 0.434, 0.484, 0.444, 0.413, 0.343, 0.272, 0.565, 0.171, 0.605, -0.061, 0.807, -0.585, 0.827, -0.605, 0.766,
    -0.766, 0.766, -1.029, 0.676, -1.2, 0.474, -1.16, 0.424, -1.099, 0.424, -1.089, 0.333, -0.827, 0.292, -0.847, -0.141, -0.817, -0.323,
    -1.089, -0.343, -1.099, -0.434, -1.16, -0.434, -1.19, -0.504, -1.139, -0.615, -0.998, -0.726, -0.877, -0.766, -0.615, -0.766
  ],
  rooms: [
    [1.1, -0.12, 1.1, 0.14, 0.96, 0.26, 0.5, 0.26, 0.5, -0.26, 0.96, -0.26],
    [0.4, -0.32, 0.4, 0.32, -0.06, 0.4, -0.06, -0.4],
    [-0.16, -0.28, -0.16, 0.28, -0.8, 0.28, -0.8, -0.28]
  ]
};

const SCOUT: Hull = {
  outline: [
    0.92, 0, 1.19, 0.09, 1.23, 0.17, 0.86, 0.24, 0.62, 0.46, 0.3, 0.58, -0.02, 0.46, -0.24, 0.22, -0.62, 0.2, -0.98, 0.52,
    -1.12, 0.5, -0.98, 0.2, -1.08, 0.12, -1.08, -0.12, -0.98, -0.2, -1.12, -0.5, -0.98, -0.52, -0.62, -0.2, -0.24, -0.22,
    -0.02, -0.46, 0.3, -0.58, 0.62, -0.46, 0.86, -0.24, 1.23, -0.17, 1.19, -0.09
  ],
  rooms: [
    [0.88, -0.2, 0.88, 0.2, 0.46, 0.36, 0.46, -0.36],
    [0.36, -0.42, 0.36, 0.42, -0.06, 0.4, -0.06, -0.4],
    [-0.18, -0.18, -0.18, 0.18, -0.94, 0.18, -0.94, -0.18]
  ]
};

/** Valkyrn spec §4.5: traced from the bought 2-Minute Tabletop painting, rotated so the nose is +f, by the Hound's steps
 *  (downscale 8, alpha 50 %, 3 px close, Moore trace, Douglas-Peucker 2.5 px, length 2.4 units). The rooms are widened over
 *  the wing roots to the 0.2 floor: Weapons over Ops, Shields the missile bay's rack half, Engines its ramp half. */
const VALKYRN: Hull = {
  outline: [
    -0.611, -1.201, -0.375, -1.191, -0.302, -1.146, -0.393, -1.091, 0.117, -0.264, 0.662, -0.155, 0.717, -0.155, 0.726, -0.227,
    0.762, -0.246, 0.926, -0.1, 1.099, -0.082, 1.199, 0, 1.117, 0.073, 0.944, 0.082, 0.817, 0.227, 0.753, 0.227,
    0.717, 0.146, 0.662, 0.146, 0.126, 0.255, -0.393, 1.101, -0.302, 1.173, -0.393, 1.201, -0.593, 1.201, -0.684, 1.164,
    -0.675, 1.128, -0.566, 1.082, -0.447, 0.573, -0.438, 0.418, -0.493, 0.309, -0.611, 0.209, -0.72, 0.2, -0.929, 0.555,
    -1.002, 0.555, -1.066, 0.491, -1.029, 0.218, -1.175, 0.2, -1.193, 0.155, -1.193, 0.045, -1.111, 0, -1.111, -0.036,
    -1.175, -0.055, -1.193, -0.1, -1.193, -0.209, -1.029, -0.246, -1.048, -0.564, -0.929, -0.555, -0.729, -0.218, -0.611, -0.236,
    -0.447, -0.427, -0.438, -0.582, -0.557, -1.091, -0.684, -1.146, -0.675, -1.182
  ],
  rooms: [
    [0.68, -0.13, 0.68, 0.12, 0.08, 0.23, 0.08, -0.24],
    [-0.02, -0.4, -0.02, 0.4, -0.28, 0.4, -0.28, -0.4],
    [-0.3, -0.42, -0.3, 0.42, -0.48, 0.28, -0.7, 0.1, -0.7, -0.1, -0.48, -0.28]
  ]
};

const freeze = (h: Hull): Hull => Object.freeze({ outline: Object.freeze([...h.outline]), rooms: Object.freeze(h.rooms.map((r) => Object.freeze([...r]))) });
export const HULLS: Readonly<Record<HullId, Hull>> = Object.freeze({ hound: freeze(HOUND), scout: freeze(SCOUT), valkyrn: freeze(VALKYRN) });

/** Whether `v` names a hull: the view's guard on a layout's `hull` (the schema already limits it to HULL_IDS, Decision 6). */
export function isHullId(v: unknown): v is HullId { return typeof v === 'string' && Object.prototype.hasOwnProperty.call(HULLS, v); }
/** Valkyrn spec §3.2, §4.5: the crew's ship flies its layout's hull (the Hound's when the layout has none); the enemy is the scout. */
export function hullFor(crew: boolean, layoutHull?: string): HullId { return !crew ? 'scout' : isHullId(layoutHull) ? layoutHull : 'hound'; }

/** A room's centre in ship units: the mean of its polygon's vertices. */
export function roomCentre(hull: HullId, room: number): { f: number; s: number } {
  const poly = HULLS[hull].rooms[room]!;
  let f = 0, s = 0;
  for (let i = 0; i < poly.length; i += 2) { f += poly[i]!; s += poly[i + 1]!; }
  return { f: f / (poly.length / 2), s: s / (poly.length / 2) };
}

/** Even-odd point in polygon (flat [x, y, ...]). */
export function pointInPolygon(x: number, y: number, poly: readonly number[]): boolean {
  let inside = false;
  for (let i = 0, n = poly.length / 2, j = n - 1; i < n; j = i++) {
    const xi = poly[2 * i]!, yi = poly[2 * i + 1]!, xj = poly[2 * j]!, yj = poly[2 * j + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when segment AB properly crosses segment CD (each strictly separates the other's ends; touching is not a crossing). */
export function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  return o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 && o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0;
}

/** The unsigned area of a polygon (shoelace). */
export function polygonArea(poly: readonly number[]): number {
  let a = 0;
  for (let i = 0, n = poly.length / 2, j = n - 1; i < n; j = i++) a += poly[2 * j]! * poly[2 * i + 1]! - poly[2 * i]! * poly[2 * j + 1]!;
  return Math.abs(a) / 2;
}
