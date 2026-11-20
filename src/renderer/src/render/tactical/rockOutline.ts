// Asteroids-iv spec §7, §10a 7 (renderer only, any Math): the drawn outline and seams of a rock's cells. Each cell is a
// hexagon; a lattice corner is shared by three cells and is named by the sum of their lattice coordinates, so neighbours
// always agree on it. A corner's place is fixed per template, whatever cells a rock still has: it is moved by a hashed
// offset (up to CORNER_JITTER spacings), and a corner on the template's own rim is eased so the rim reads as stone, not as
// a cog: one shared by two template cells (the notch between them) moves NOTCH_OUT spacings away from them, one that
// belongs to a single template cell (a tip) moves TIP_IN spacings toward it. A corner where three template cells meet is
// not eased. Because no corner moves when a rock is divided, two pieces fit exactly along their cut. Points are world
// units about the mask's centre of mass. Cached per template and mask; drawing only (shots and contacts meet the cells'
// circles).
import { NEIGHBOURS, S3, shapeOf, type Template } from '../../sim/tactical/rockCells';

export const CORNER_JITTER = 0.18, NOTCH_OUT = 0.2, TIP_IN = 0.13;
/** `loops`: closed boundary loops as flat x, y pairs, the largest first (any others are holes). `seams`: the edges between
 *  two live neighbours as flat x1, y1, x2, y2. */
export interface RockOutline { loops: number[][]; seams: number[] }
const cache = new WeakMap<Template, Map<number, RockOutline>>(), cornerCache = new WeakMap<Template, Map<string, { x: number; y: number }>>();
const mix = (a: number, b: number, c: number): number => { let h = Math.imul((a + 1) ^ 0x9e3779b9, 0x85ebca6b) >>> 0; h = Math.imul(h ^ (b + 4096), 0xc2b2ae35) >>> 0; h = Math.imul(h ^ (c + 4096), 0x27d4eb2f) >>> 0; return (h ^ (h >>> 15)) >>> 0; };
/** Corner c of cell i lies between its neighbours c and c + 1: thrice its lattice place is 3·cell + step c + step c + 1. */
const keyOf = (t: Template, i: number, c: number): string => { const a = NEIGHBOURS[c]!, b = NEIGHBOURS[(c + 1) % 6]!; return `${3 * t.q[i]! + a[0] + b[0]},${3 * t.r[i]! + a[1] + b[1]}`; };

/** Every lattice corner of the template's cells at its fixed drawn place, in the template's frame. */
function cornersOf(t: Template): Map<string, { x: number; y: number }> {
  const cached = cornerCache.get(t);
  if (cached) return cached;
  const acc = new Map<string, { n: number; sx: number; sy: number; x: number; y: number }>();
  for (let i = 0; i < t.n; i++) for (let c = 0; c < 6; c++) {
    const a = NEIGHBOURS[c]!, b = NEIGHBOURS[(c + 1) % 6]!, fq = a[0] + b[0], fr = a[1] + b[1], k = keyOf(t, i, c);
    let e = acc.get(k);
    if (!e) { e = { n: 0, sx: 0, sy: 0, x: t.x[i]! + ((fq + fr / 2) / 3) * t.d, y: t.y[i]! + ((fr * S3) / 3) * t.d }; acc.set(k, e); }
    e.n++; e.sx += t.x[i]!; e.sy += t.y[i]!;
  }
  const out = new Map<string, { x: number; y: number }>();
  for (const [k, e] of acc) {
    const [kq, kr] = k.split(',').map(Number) as [number, number], h = mix(t.index, kq, kr), ang = (h % 6283) / 1000, amp = (((h >>> 13) % 1000) / 1000) * CORNER_JITTER * t.d;
    let x = e.x, y = e.y;
    if (e.n < 3) {
      const dx = x - e.sx / e.n, dy = y - e.sy / e.n, l = Math.hypot(dx, dy) || 1, by = (e.n === 2 ? NOTCH_OUT : -TIP_IN) * t.d;
      x += (dx / l) * by; y += (dy / l) * by;
    }
    out.set(k, { x: x + Math.cos(ang) * amp, y: y + Math.sin(ang) * amp });
  }
  cornerCache.set(t, out);
  return out;
}

export function rockOutline(t: Template, mask: number): RockOutline {
  let byMask = cache.get(t);
  if (!byMask) { byMask = new Map(); cache.set(t, byMask); }
  const hit = byMask.get(mask);
  if (hit) return hit;
  const sh = shapeOf(t, mask), corners = cornersOf(t), live = new Map<string, number>();
  for (let i = 0; i < t.n; i++) if ((mask >>> i) & 1) live.set(`${t.q[i]},${t.r[i]}`, i);
  // The edge facing neighbour c runs from corner c − 1 to corner c. A rim edge (no live neighbour) joins the boundary.
  const next = new Map<string, string>(), seams: number[] = [];
  for (const i of live.values()) for (let c = 0; c < 6; c++) {
    const nb = NEIGHBOURS[c]!, j = live.get(`${t.q[i]! + nb[0]},${t.r[i]! + nb[1]}`), from = keyOf(t, i, (c + 5) % 6), to = keyOf(t, i, c);
    if (j === undefined) next.set(from, to);
    else if (i < j) { const p = corners.get(from)!, q = corners.get(to)!; seams.push(p.x - sh.gx, p.y - sh.gy, q.x - sh.gx, q.y - sh.gy); }
  }
  const loops: number[][] = [];
  while (next.size > 0) {
    const loop: number[] = [];
    for (let k = next.keys().next().value as string; next.has(k);) { const e = corners.get(k)!; loop.push(e.x - sh.gx, e.y - sh.gy); const to = next.get(k)!; next.delete(k); k = to; }
    loops.push(loop);
  }
  loops.sort((a, b) => b.length - a.length);
  const out = { loops, seams };
  byMask.set(mask, out);
  return out;
}
