// UI round Part 3 spec §3.2: the shield fx model. Pure (no Pixi, no React): hits age on the presentation clock, and
// shieldCells says which hex cells of a ship's shield ellipse shimmer now. A patch lights at the impact and spreads
// ring by ring; a hit that drops a layer adds a whole-grid flicker; the last layer's drop collapses the bubble.
export interface Ellipse { cx: number; cy: number; rx: number; ry: number }
export const SHIMMER_S = 0.5, RING_STEP_S = 0.06, PATCH_RINGS = 3, FLICKER_S = 0.15, COLLAPSE_S = 0.3;

const FLICKER_ALPHA = 0.35, FLICKER_LAST_ALPHA = 0.5, FLASH_S = 0.3;
const SQRT3 = Math.sqrt(3);

/** One hit on a ship's shield: `a` the impact bearing in the ship's own frame (radians, 0 = nose, +PI/2 = starboard),
 *  `age` seconds since it lands (negative while its shot is still flying), `drop` a layer went, `last` that was the last layer. */
export interface ShieldHit { a: number; age: number; drop: boolean; last: boolean; /** the layer that dropped (fixed at the hit), or -1 */ layer: number }
export interface ShieldFx { hits: ShieldHit[][]; collapse: number[] }   // per ship slot; collapse = seconds since the last layer dropped, or -1

export function createShieldFx(slots: number): ShieldFx {
  const hits: ShieldHit[][] = [];
  const collapse: number[] = [];
  for (let i = 0; i < slots; i++) { hits.push([]); collapse.push(-1); }
  return { hits, collapse };
}

export function addShieldHit(fx: ShieldFx, slot: number, a: number, drop: boolean, last: boolean, delay = 0, layer = -1): void {
  const list = fx.hits[slot];
  if (!list) return;   // a slot the fx was not sized for
  list.push({ a, age: -delay, drop, last, layer });
  if (last && delay <= 0) fx.collapse[slot] = 0;
}

/** Ages everything; drops hits older than SHIMMER_S; dt 0 holds. */
export function stepShieldFx(fx: ShieldFx, dt: number): void {
  if (dt <= 0) return;
  for (let s = 0; s < fx.hits.length; s++) {
    const list = fx.hits[s]!;
    const col = fx.collapse[s]!;
    if (col >= 0) fx.collapse[s] = col + dt > COLLAPSE_S ? -1 : col + dt;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const h = list[i]!;
      const was = h.age;
      h.age += dt;
      if (h.last && was < 0 && h.age >= 0) fx.collapse[s] = h.age;   // the last layer drops as its shot lands
      if (h.age <= SHIMMER_S) list[w++] = h;
    }
    list.length = w;
  }
}

/** The ellipse point on bearing `a`, given the ship frame's nose and starboard unit vectors in the drawing's px. */
export function ellipsePoint(e: Ellipse, a: number, nose: { x: number; y: number }, star: { x: number; y: number }): { x: number; y: number } {
  const c = Math.cos(a), s = Math.sin(a);
  const dx = nose.x * c + star.x * s, dy = nose.y * c + star.y * s;
  return { x: e.cx + e.rx * dx, y: e.cy + e.ry * dy };
}

// Axial hex grid, pointy-top, centred on the ellipse centre: x = r*sqrt3*(q + s/2), y = 1.5*r*s (s the row).
function hexDist(dq: number, ds: number): number {
  return (Math.abs(dq) + Math.abs(ds) + Math.abs(dq + ds)) / 2;
}

function nearestCell(e: Ellipse, cell: number, px: number, py: number): { q: number; s: number } {
  const fs = (py - e.cy) / (1.5 * cell);
  const fq = (px - e.cx) / (SQRT3 * cell) - fs / 2;
  // cube rounding
  const fx = fq, fz = fs, fy = -fx - fz;
  let rx = Math.round(fx), ry = Math.round(fy), rz = Math.round(fz);
  const dx = Math.abs(rx - fx), dy = Math.abs(ry - fy), dz = Math.abs(rz - fz);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, s: rz };
}

function cellCentre(e: Ellipse, cell: number, q: number, s: number): { x: number; y: number } {
  return { x: e.cx + SQRT3 * cell * (q + s / 2), y: e.cy + 1.5 * cell * s };
}
function cellInside(e: Ellipse, cell: number, q: number, s: number): boolean {
  const c = cellCentre(e, cell, q, s), nx = (c.x - e.cx) / e.rx, ny = (c.y - e.cy) / e.ry;
  return nx * nx + ny * ny <= 1;
}

/** The cell nearest (px, py) that is inside the ellipse (the grid only draws inside cells): the plain nearest when it is
 *  inside, else the nearest inside cell within a few rings, else the centre cell. */
function insideCell(e: Ellipse, cell: number, px: number, py: number): { q: number; s: number } {
  const n = nearestCell(e, cell, px, py);
  if (cellInside(e, cell, n.q, n.s)) return n;
  let best = { q: 0, s: 0 }, bd = Infinity;
  const R = 4;
  for (let ds = -R; ds <= R; ds++) {
    for (let dq = -R; dq <= R; dq++) {
      if (hexDist(dq, ds) > R) continue;
      const q = n.q + dq, s = n.s + ds;
      if (!cellInside(e, cell, q, s)) continue;
      const c = cellCentre(e, cell, q, s), dd = Math.hypot(c.x - px, c.y - py);
      if (dd < bd) { bd = dd; best = { q, s }; }
    }
  }
  return best;
}

/** The hex cells to draw now in `e` (cell radius `cell` px, pointy-top hexes on an axial grid clipped to the ellipse):
 *  each lit cell's centre and alpha 0..1 (already multiplied by the edge brightening 0.45 + 0.55 * r^2, r the normalised
 *  ellipse radius of the centre). Empty when nothing shimmers. */
export function shieldCells(fx: ShieldFx, slot: number, e: Ellipse, cell: number, nose: { x: number; y: number }, star: { x: number; y: number }): { x: number; y: number; alpha: number }[] {
  const out: { x: number; y: number; alpha: number }[] = [];
  const hits = fx.hits[slot] ?? [];
  let live = false;
  for (const h of hits) if (h.age >= 0 && h.age < SHIMMER_S) { live = true; break; }
  if (!live) return out;

  // The impact cell per hit (the ellipse point pulled one cell toward the centre).
  const impacts: ({ q: number; s: number } | null)[] = hits.map((h) => {
    if (h.age < 0 || h.age >= SHIMMER_S) return null;
    const p = ellipsePoint(e, h.a, nose, star);
    const vx = e.cx - p.x, vy = e.cy - p.y;
    const len = Math.hypot(vx, vy);
    const k = len > cell ? cell / len : 1;
    return insideCell(e, cell, p.x + vx * k, p.y + vy * k);
  });

  const rowStep = 1.5 * cell, colStep = SQRT3 * cell;
  const smax = Math.ceil(e.ry / rowStep) + 1;
  for (let s = -smax; s <= smax; s++) {
    const y = e.cy + s * rowStep;
    const ny = (y - e.cy) / e.ry;
    if (ny * ny > 1) continue;
    const qmax = Math.ceil(e.rx / colStep) + Math.ceil(smax / 2) + 1;
    for (let q = -qmax; q <= qmax; q++) {
      const x = e.cx + colStep * (q + s / 2);
      const nx = (x - e.cx) / e.rx;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1) continue;
      let a = 0;
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i]!, imp = impacts[i];
        if (!imp) continue;
        const k = hexDist(q - imp.q, s - imp.s);
        if (k <= PATCH_RINGS) {
          const start = k * RING_STEP_S;
          if (h.age >= start) a += (1 - 0.25 * k) * (1 - (h.age - start) / (SHIMMER_S - start));
        }
        if (h.drop && h.age < FLICKER_S) a += h.last ? FLICKER_LAST_ALPHA : FLICKER_ALPHA;
      }
      if (a <= 0) continue;
      out.push({ x, y, alpha: Math.min(1, a) * (0.45 + 0.55 * r2) });
    }
  }
  return out;
}

/** The React windows' cells: alpha rounded to 1/20 steps (so the windows group them into a few paths); cells that round to 0 go. */
export function quantCells(cells: readonly { x: number; y: number; alpha: number }[]): { x: number; y: number; alpha: number }[] {
  const out: { x: number; y: number; alpha: number }[] = [];
  for (const c of cells) { const alpha = Math.round(c.alpha * 20) / 20; if (alpha > 0) out.push({ x: c.x, y: c.y, alpha }); }
  return out;
}

/** The resting bubble's stroke alpha: 0 with `up` 0 (fading to 0 over COLLAPSE_S after a collapse), else 0.12 + 0.08 * up, at most 0.5. */
export function bubbleAlpha(fx: ShieldFx, slot: number, up: number): number {
  if (up > 0) return Math.min(0.5, 0.12 + 0.08 * up);
  // The last layer's shot is still in flight (the HUD already shows 0): the bubble holds at one layer until it lands.
  for (const h of fx.hits[slot] ?? []) if (h.last && h.age < 0) return 0.12 + 0.08;
  const c = fx.collapse[slot] ?? -1;
  if (c < 0 || c >= COLLAPSE_S) return 0;
  return (0.12 + 0.08) * (1 - c / COLLAPSE_S);
}

/** The HUD layer flash: the layer index that dropped (fixed when the hit was added; `up` is the fallback for a hit added
 *  without one) and its flash 0..1 (1 at the hit, 0 after 0.3 s), or null. The newest drop wins. */
export function shieldFlash(fx: ShieldFx, slot: number, up = 0): { layer: number; alpha: number } | null {
  let best = -1, layer = up;
  for (const h of fx.hits[slot] ?? []) {
    if (h.drop && h.age >= 0 && h.age < FLASH_S && (best < 0 || h.age < best)) { best = h.age; layer = h.layer >= 0 ? h.layer : up; }
  }
  return best < 0 ? null : { layer, alpha: 1 - best / FLASH_S };
}

/** A flat-coordinate hex polygon [x0,y0,...] of radius r at (x,y), pointy-top. */
export function hexPoints(x: number, y: number, r: number): number[] {
  const p: number[] = [];
  for (let i = 0; i < 6; i++) {
    const t = (Math.PI / 180) * (60 * i - 30);
    p.push(x + r * Math.cos(t), y + r * Math.sin(t));
  }
  return p;
}
