// Hacking spike (spec 2026-11-20-science-hacking-design §3.2, §3.3): the electrical short a hacked room or ship shows.
// Jagged arcs re-seeded SHORT_HZ times a second from the presentation clock, so every frame of one seed is the same
// (pure: render code, not sim code). Segments are flat [x1, y1, x2, y2, ...] like the hatch segments.

/** Re-seeds a second: the arcs jump this often. */
export const SHORT_HZ = 12;
/** A cheap deterministic hash to 0..1 (render only). */
function noise(n: number): number { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

/** Two jagged arcs across a polygon's bounds (flat [x, y, ...]), each 5 segments, from the clock `t` and a `salt` (the
 *  room), as flat segments. */
export function shortArcs(points: readonly number[], t: number, salt = 0): number[] {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k + 1 < points.length; k += 2) { x0 = Math.min(x0, points[k]!); x1 = Math.max(x1, points[k]!); y0 = Math.min(y0, points[k + 1]!); y1 = Math.max(y1, points[k + 1]!); }
  if (!(x1 > x0) || !(y1 > y0)) return [];
  const seed = Math.floor(t * SHORT_HZ) * 13 + salt * 101, out: number[] = [], w = x1 - x0, h = y1 - y0, pad = 0.12;
  for (let a = 0; a < 2; a++) {
    let px = x0 + w * pad, py = y0 + h * (0.2 + 0.6 * noise(seed + a * 7));
    for (let s = 1; s <= 5; s++) {
      const nx = x0 + w * (pad + (1 - 2 * pad) * (s / 5)), ny = y0 + h * (0.15 + 0.7 * noise(seed + a * 7 + s));
      out.push(px, py, nx, ny); px = nx; py = ny;
    }
  }
  return out;
}

/** Sparks around a point (a hacked ship on the map): `n` short jagged spokes at radius r, from the clock and a salt. */
export function sparkSegments(x: number, y: number, r: number, t: number, salt = 0, n = 4): number[] {
  const seed = Math.floor(t * SHORT_HZ) * 17 + salt * 53, out: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = noise(seed + k) * 6.283185307179586, ca = Math.cos(a), sa = Math.sin(a), len = r * (0.35 + 0.3 * noise(seed + k + 9));
    const bx = x + ca * r, by = y + sa * r, mx = bx + ca * len * 0.5 - sa * len * 0.3, my = by + sa * len * 0.5 + ca * len * 0.3;
    out.push(bx, by, mx, my, mx, my, bx + ca * len, by + sa * len);
  }
  return out;
}
