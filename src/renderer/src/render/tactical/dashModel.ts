// Dashes, dots and hatches for the CRT map (CRT map spec section 2): PixiJS 8 Graphics has no dash style, so these build
// plain segment lists [x1, y1, x2, y2, ...] in screen pixels that the layer strokes as one path. Each writes into the
// array it is given (cleared first) so a frame allocates nothing. Pure: no Pixi.

/** Dashes along a polyline [x0, y0, x1, y1, ...]: `dash` on, `gap` off, the pattern carried across vertices. */
export function dashLine(points: readonly number[], dash: number, gap: number, out: number[] = []): number[] {
  out.length = 0;
  let on = true, left = dash;   // the current phase and the length left in it
  for (let i = 0; i + 3 < points.length; i += 2) {
    const x0 = points[i]!, y0 = points[i + 1]!, x1 = points[i + 2]!, y1 = points[i + 3]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len === 0) continue;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    let s = 0;
    while (s < len) {
      const step = Math.min(left, len - s);
      if (on) out.push(x0 + ux * s, y0 + uy * s, x0 + ux * (s + step), y0 + uy * (s + step));
      s += step; left -= step;
      if (left <= 1e-9) { on = !on; left = on ? dash : gap; }
    }
  }
  return out;
}

/** Dashes around a circle as chords, the pattern stretched so a whole number of periods closes it (at least one). */
export function dashCircle(x: number, y: number, r: number, dash: number, gap: number, out: number[] = []): number[] {
  out.length = 0;
  if (r <= 0) return out;
  const n = Math.max(1, Math.round((2 * Math.PI * r) / (dash + gap))), period = (2 * Math.PI) / n, onA = (period * dash) / (dash + gap);
  for (let k = 0; k < n; k++) {
    const a0 = k * period, a1 = a0 + onA, m = (a0 + a1) / 2;
    // A dash longer than a quarter turn (a tiny circle) is split at its middle so the chords stay near the circle.
    if (onA > Math.PI / 2) out.push(x + Math.cos(a0) * r, y + Math.sin(a0) * r, x + Math.cos(m) * r, y + Math.sin(m) * r, x + Math.cos(m) * r, y + Math.sin(m) * r, x + Math.cos(a1) * r, y + Math.sin(a1) * r);
    else out.push(x + Math.cos(a0) * r, y + Math.sin(a0) * r, x + Math.cos(a1) * r, y + Math.sin(a1) * r);
  }
  return out;
}

/** Whether a flat polygon [x0, y0, ...] is convex (every turn the same way; collinear points allowed). */
export function isConvex(poly: readonly number[]): boolean {
  const n = poly.length / 2;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const ax = poly[2 * i]!, ay = poly[2 * i + 1]!, bx = poly[(2 * (i + 1)) % (2 * n)]!, by = poly[(2 * (i + 1) + 1) % (2 * n)]!;
    const cx = poly[(2 * (i + 2)) % (2 * n)]!, cy = poly[(2 * (i + 2) + 1) % (2 * n)]!;
    const z = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(z) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(z); else if (Math.sign(z) !== sign) return false;
  }
  return sign !== 0;
}

/**
 * Hatch lines at `angle` (radians from +x), `spacing` apart, clipped to a convex polygon [x0, y0, ...] by line-polygon
 * intersection (no mask). The lines sit on the screen's lattice (p · normal a multiple of spacing), not the polygon's,
 * so neighbouring segments' hatches line up.
 */
export function hatchSegments(poly: readonly number[], spacing: number, angle: number, out: number[] = []): number[] {
  out.length = 0;
  const n = poly.length / 2, dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx;
  if (n < 3 || spacing <= 0) return out;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const c = poly[2 * i]! * nx + poly[2 * i + 1]! * ny; lo = Math.min(lo, c); hi = Math.max(hi, c); }
  for (let c = Math.ceil(lo / spacing) * spacing; c <= hi; c += spacing) {
    let tMin = Infinity, tMax = -Infinity, ax = 0, ay = 0, bx = 0, by = 0;
    for (let i = 0; i < n; i++) {
      const px = poly[2 * i]!, py = poly[2 * i + 1]!, qx = poly[(2 * i + 2) % (2 * n)]!, qy = poly[(2 * i + 3) % (2 * n)]!;
      const sp = px * nx + py * ny - c, sq = qx * nx + qy * ny - c;
      if ((sp > 0 && sq > 0) || (sp < 0 && sq < 0) || sp === sq) continue;
      const k = sp / (sp - sq), x = px + (qx - px) * k, y = py + (qy - py) * k, t = x * dx + y * dy;
      if (t < tMin) { tMin = t; ax = x; ay = y; }
      if (t > tMax) { tMax = t; bx = x; by = y; }
    }
    if (tMax - tMin > 1e-6) out.push(ax, ay, bx, by);
  }
  return out;
}
