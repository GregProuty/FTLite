// Asteroids-iv (docs/superpowers/specs/2026-11-20-asteroids-iv-cell-rocks-design.md §3.1, §3.2, §5.2, §5.3, §10a): the
// cells a rock is built of. Pure: no state. Only + − × ÷, bit operations, Math.sqrt, floor, max and imul (the determinism
// guard). Cells sit on a hexagonal lattice: cell (q, r) is at (q + r / 2, r · S3) spacings, and two cells are neighbours
// one lattice step apart. A template is seeded asteroid `index`'s fixed cell set, centred on its centre of mass, its
// farthest hit circle exactly at the asteroid's map radius R. A rock is a template and a mask of its cells (bit i: cell i;
// at most 31 cells, so every mask is a positive 32-bit integer).
import type { MapDef } from './map';
import { CRATER_K, RIM_DROP } from './rockTuning';

export const S3 = 0.8660254037844386, HIT_K = 0.5773502691896258, CONTACT_K = 0.5, CELL_MAX = 31;
/** The six lattice steps to a cell's neighbours, by rising angle from +x on the y-down map: 0°, 60°, ... 300°. */
export const NEIGHBOURS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

/** §3.2: a size class: cells out to squared lattice distance l2 (q² + qr + r²), the rim beyond inner2, the floor the rim
 *  drops stop at, and the count before any drop. */
export interface Shell { readonly l2: number; readonly inner2: number; readonly floor: number; readonly full: number }
const SHELLS: readonly Shell[] = [{ l2: 1, inner2: 0, floor: 4, full: 7 }, { l2: 4, inner2: 1, floor: 13, full: 19 }, { l2: 7, inner2: 4, floor: 25, full: 31 }];
export function shellFor(R: number): Shell { return R <= 20 ? SHELLS[0]! : R <= 40 ? SHELLS[1]! : SHELLS[2]!; }

/** A 32-bit hash of an asteroid's index, a lattice cell and a salt. */
export function cellHash(index: number, q: number, r: number, salt: number): number {
  let h = Math.imul((index + 1) ^ 0x9e3779b9, 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ ((q + 8) * 16 + (r + 8)), 0x85ebca6b) >>> 0; h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h ^ (salt | 0), 0xc2b2ae35) >>> 0; h = (h ^ (h >>> 13)) >>> 0;
  return h;
}

/** What a mask of a template comes to: its cell count, its centre of mass (gx, gy) in the template's frame, its bounding
 *  radius r about that centre (the farthest cell centre plus the hit radius), each live cell's offset from the centre of
 *  mass in rising cell order, and `aim`, the index (into ox, oy) of the cell nearest the centre of mass. */
export interface Shape { readonly mask: number; readonly n: number; readonly gx: number; readonly gy: number; readonly r: number; readonly ox: Float64Array; readonly oy: Float64Array; readonly aim: number }
export interface Template {
  readonly index: number; readonly R: number; readonly d: number; readonly n: number;
  /** The cell count before the rim drops (7, 19 or 31: the mass share), and the mask with every cell. */
  readonly fullCount: number; readonly full: number;
  readonly q: Int8Array; readonly r: Int8Array; readonly x: Float64Array; readonly y: Float64Array;
  /** nb[i]: the mask of cell i's neighbours in the template. */
  readonly nb: Int32Array;
  readonly hitR: number; readonly contactR: number;
  readonly shapes: Map<number, Shape>;
}

/** §3.2, §10a 4: the template of an asteroid of map radius R. */
export function buildTemplate(index: number, R: number, salt: number): Template {
  const sh = shellFor(R), all: { q: number; r: number; rim: boolean; h: number }[] = [];
  for (let r = -3; r <= 3; r++) for (let q = -3; q <= 3; q++) {
    const d2 = q * q + q * r + r * r;
    if (d2 <= sh.l2) all.push({ q, r, rim: d2 > sh.inner2, h: cellHash(index, q, r, salt) });
  }
  const cand = all.filter((c) => c.rim && c.h % 100 < RIM_DROP).sort((a, b) => a.h - b.h || a.r - b.r || a.q - b.q);
  const dropped = new Set(cand.slice(0, all.length - sh.floor)), kept = all.filter((c) => !dropped.has(c)), n = kept.length;
  let cx = 0, cy = 0;
  for (const c of kept) { cx += c.q + c.r / 2; cy += c.r * S3; }
  cx /= n; cy /= n;
  let far = 0;
  for (const c of kept) { const lx = c.q + c.r / 2 - cx, ly = c.r * S3 - cy; far = Math.max(far, Math.sqrt(lx * lx + ly * ly)); }
  const d = R / (far + HIT_K), q = new Int8Array(n), r = new Int8Array(n), x = new Float64Array(n), y = new Float64Array(n), nb = new Int32Array(n);
  kept.forEach((c, i) => { q[i] = c.q; r[i] = c.r; x[i] = (c.q + c.r / 2 - cx) * d; y[i] = (c.r * S3 - cy) * d; });
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const dq = q[j]! - q[i]!, dr = r[j]! - r[i]!;
    if (dq * dq + dq * dr + dr * dr === 1) nb[i] = nb[i]! | (1 << j);
  }
  return { index, R, d, n, fullCount: sh.full, full: n === 31 ? 0x7fffffff : (1 << n) - 1, q, r, x, y, nb, hitR: d * HIT_K, contactR: d * CONTACT_K, shapes: new Map() };
}

const templates = new WeakMap<MapDef, (Template | undefined)[]>();
/** §10a 3: seeded asteroid `index`'s template, built once per map (its salt from the asteroid's place). */
export function templateFor(map: MapDef, index: number): Template {
  let list = templates.get(map);
  if (!list) { list = []; templates.set(map, list); }
  let t = list[index];
  if (!t) {
    const a = map.asteroids[index];
    if (!a) throw new Error(`no seeded asteroid ${index}`);
    t = buildTemplate(index, a.r, Math.floor(a.x * 4) * 7919 + Math.floor(a.y * 4));
    list[index] = t;
  }
  return t;
}

export function popcount(mask: number): number { let n = 0; for (let v = mask; v !== 0; v &= v - 1) n++; return n; }

/** §5.2 step 4: the connected groups of `mask` (neighbour connectivity), written to out[0 .. count) in rising order of
 *  each group's lowest cell; the count. */
export function components(t: Template, mask: number, out: number[]): number {
  let rest = mask, count = 0;
  while (rest !== 0) {
    let comp = rest & -rest;
    for (;;) {
      let grow = comp;
      for (let i = 0; i < t.n; i++) if ((comp >>> i) & 1) grow |= t.nb[i]!;
      grow &= mask;
      if (grow === comp) break;
      comp = grow;
    }
    out[count++] = comp; rest &= ~comp;
  }
  return count;
}

/** The shape of a non-empty mask, memoised per template. */
export function shapeOf(t: Template, mask: number): Shape {
  let s = t.shapes.get(mask);
  if (s) return s;
  const n = popcount(mask);
  if (n === 0) throw new Error('an empty rock has no shape');
  const ox = new Float64Array(n), oy = new Float64Array(n);
  let gx = 0, gy = 0;
  for (let i = 0; i < t.n; i++) if ((mask >>> i) & 1) { gx += t.x[i]!; gy += t.y[i]!; }
  gx /= n; gy /= n;
  let far2 = 0, near2 = Infinity, aim = 0, j = 0;
  for (let i = 0; i < t.n; i++) if ((mask >>> i) & 1) {
    const x = t.x[i]! - gx, y = t.y[i]! - gy, d2 = x * x + y * y;
    ox[j] = x; oy[j] = y;
    if (d2 > far2) far2 = d2;
    if (d2 < near2) { near2 = d2; aim = j; }
    j++;
  }
  s = { mask, n, gx, gy, r: Math.sqrt(far2) + t.hitR, ox, oy, aim };
  t.shapes.set(mask, s);
  return s;
}

/** The cells of `mask` left of the line through (px, py) along (ux, uy): cross(u, cell − P) ≥ 0. Template frame. */
function leftOf(t: Template, mask: number, px: number, py: number, ux: number, uy: number): number {
  let left = 0;
  for (let i = 0; i < t.n; i++) if (((mask >>> i) & 1) && ux * (t.y[i]! - py) - uy * (t.x[i]! - px) >= 0) left |= 1 << i;
  return left;
}
export interface CutOut { left: number; right: number; ux: number; uy: number }
/** §5.2 steps 2 and 3: divide `mask` by the line through (px, py) along the unit direction (ux, uy), template frame. A
 *  line with one side empty is moved through the centre of mass; if a side is still empty, u is turned a quarter turn.
 *  `out`: the two sides and the direction finally used. A mask of two or more cells is always divided. */
export function cutSides(t: Template, mask: number, px: number, py: number, ux: number, uy: number, out: CutOut): void {
  let left = leftOf(t, mask, px, py, ux, uy);
  if (left === 0 || left === mask) { const s = shapeOf(t, mask); px = s.gx; py = s.gy; left = leftOf(t, mask, px, py, ux, uy); }
  if (left === 0 || left === mask) { const tx = -uy; uy = ux; ux = tx; left = leftOf(t, mask, px, py, ux, uy); }
  out.left = left; out.right = mask & ~left; out.ux = ux; out.uy = uy;
}

const C60 = 0.5, C120 = -0.5;
const sectors: number[] = [0, 0, 0, 0, 0, 0, 0, 0], cutScratch: CutOut = { left: 0, right: 0, ux: 0, uy: 0 };
/** §5.3, §10a 5: the shatter about (px, py) (a cell's centre) with hit direction (ux, uy), template frame. Cells within
 *  CRATER_K spacings of the point are the crater (left out). The rest is divided by three lines through the point (along u,
 *  and u turned 60° and 120°) and each sector's connected groups are written to out; the count. One group only: it is cut
 *  once through its centre of mass along u. */
export function shatterGroups(t: Template, mask: number, px: number, py: number, ux: number, uy: number, out: number[]): number {
  const reach2 = CRATER_K * t.d * CRATER_K * t.d, vx = ux * C60 - uy * S3, vy = ux * S3 + uy * C60, wx = ux * C120 - uy * S3, wy = ux * S3 + uy * C120;
  let rest = 0;
  sectors.fill(0);
  for (let i = 0; i < t.n; i++) {
    if (!((mask >>> i) & 1)) continue;
    const dx = t.x[i]! - px, dy = t.y[i]! - py;
    if (dx * dx + dy * dy <= reach2) continue;
    const k = (ux * dy - uy * dx >= 0 ? 1 : 0) | (vx * dy - vy * dx >= 0 ? 2 : 0) | (wx * dy - wy * dx >= 0 ? 4 : 0);
    sectors[k] = sectors[k]! | (1 << i); rest |= 1 << i;
  }
  let count = 0;
  const part: number[] = [];
  for (let k = 0; k < 8; k++) {
    if (sectors[k] === 0) continue;
    const n = components(t, sectors[k]!, part);
    for (let j = 0; j < n; j++) out[count++] = part[j]!;
  }
  if (count === 1 && popcount(rest) >= 2) {
    const s = shapeOf(t, rest);
    cutSides(t, rest, s.gx, s.gy, ux, uy, cutScratch);
    count = components(t, cutScratch.left, out);
    const n = components(t, cutScratch.right, part);
    for (let j = 0; j < n; j++) out[count++] = part[j]!;
  }
  return count;
}
