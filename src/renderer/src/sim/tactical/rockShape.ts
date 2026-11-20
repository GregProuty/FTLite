// Asteroids-iv (docs/superpowers/specs/2026-11-20-asteroids-iv-cell-rocks-design.md §6): bodies meet a rock's cells by the
// contact radius d / 2. A plain rock (no template) is one cell of radius r, and every answer here is then today's circle
// answer, written in today's order of operations so plain results stay bit for bit. Callers test the bounding circle
// first. Only + − × ÷ and Math.sqrt.
import { makeCells, rockCellsInto, rockX, rockY, ROCK_STRIDE } from './rocks';
import type { TacticalState } from './state';

/** The deepest (least separated) contact found: the unit normal (nx, ny), the two centres' distance d, the sum rr of the
 *  two contact radii, depth = rr − d (negative when apart), the first rock's cell centre minus that rock's own centre
 *  (ax, ay) and that cell's contact radius ra. */
export interface Contact { nx: number; ny: number; depth: number; d: number; rr: number; ax: number; ay: number; ra: number }
export function makeContact(): Contact { return { nx: 0, ny: -1, depth: -Infinity, d: 0, rr: 0, ax: 0, ay: 0, ra: 0 }; }
const cellsA = makeCells(), cellsB = makeCells();

/** Rock k against the circle (cx, cy, r): the normal from the deepest cell to the circle's centre (zero distance: north).
 *  True when they overlap (d² < rr², as today's test). */
export function rockCircleContact(s: TacticalState, k: number, cx: number, cy: number, r: number, out: Contact): boolean {
  rockCellsInto(s, k, cellsA);
  const rr = r + cellsA.contactR, X = rockX(s, k), Y = rockY(s, k);
  let best = -1, bestD2 = Infinity;
  for (let c = 0; c < cellsA.n; c++) { const dx = cx - cellsA.x[c]!, dy = cy - cellsA.y[c]!, d2 = dx * dx + dy * dy; if (d2 < bestD2) { bestD2 = d2; best = c; } }
  const dx = cx - cellsA.x[best]!, dy = cy - cellsA.y[best]!, d = Math.sqrt(bestD2);
  out.nx = d > 0 ? dx / d : 0; out.ny = d > 0 ? dy / d : -1; out.d = d; out.rr = rr; out.depth = rr - d;
  out.ax = cellsA.x[best]! - X; out.ay = cellsA.y[best]! - Y; out.ra = cellsA.contactR;
  return bestD2 < rr * rr;
}

/** Rock a against rock b: the normal from b's cell to a's cell over the least separated pair of cells (zero distance:
 *  north). True when they overlap. A cell of a out of reach of b's bounding circle is skipped. */
export function rockPairContact(s: TacticalState, a: number, b: number, out: Contact): boolean {
  rockCellsInto(s, a, cellsA); rockCellsInto(s, b, cellsB);
  const rr = cellsA.contactR + cellsB.contactR, bx = rockX(s, b), by = rockY(s, b), reach = s.rocks[b * ROCK_STRIDE + 5]! + cellsA.contactR;
  let bi = 0, bj = 0, bestD2 = Infinity;
  for (let i = 0; i < cellsA.n; i++) {
    const ax = cellsA.x[i]!, ay = cellsA.y[i]!, ex = ax - bx, ey = ay - by;
    if (cellsA.n > 1 && ex * ex + ey * ey >= reach * reach && bestD2 < Infinity) continue;
    for (let j = 0; j < cellsB.n; j++) { const dx = ax - cellsB.x[j]!, dy = ay - cellsB.y[j]!, d2 = dx * dx + dy * dy; if (d2 < bestD2) { bestD2 = d2; bi = i; bj = j; } }
  }
  const dx = cellsA.x[bi]! - cellsB.x[bj]!, dy = cellsA.y[bi]! - cellsB.y[bj]!, d = Math.sqrt(bestD2);
  out.nx = d > 0 ? dx / d : 0; out.ny = d > 0 ? dy / d : -1; out.d = d; out.rr = rr; out.depth = rr - d;
  out.ax = cellsA.x[bi]! - rockX(s, a); out.ay = cellsA.y[bi]! - rockY(s, a); out.ra = cellsA.contactR;
  return bestD2 < rr * rr;
}

/** A cell's centre, its distance d from a point and its hit radius r. */
export interface NearCell { x: number; y: number; d: number; r: number }
/** Rock k's cell whose centre is nearest (x, y) (ties: the lowest cell). */
export function rockNearestCell(s: TacticalState, k: number, x: number, y: number, out: NearCell): void {
  rockCellsInto(s, k, cellsA);
  let best = 0, bestD2 = Infinity;
  for (let c = 0; c < cellsA.n; c++) { const dx = cellsA.x[c]! - x, dy = cellsA.y[c]! - y, d2 = dx * dx + dy * dy; if (d2 < bestD2) { bestD2 = d2; best = c; } }
  out.x = cellsA.x[best]!; out.y = cellsA.y[best]!; out.d = Math.sqrt(bestD2); out.r = cellsA.hitR;
}
const nearScratch: NearCell = { x: 0, y: 0, d: 0, r: 0 };
/** §6: the distance from (x, y) to rock k's nearest cell's surface (hit radius), at least 0. */
export function rockSurfaceDistance(s: TacticalState, k: number, x: number, y: number): number {
  rockNearestCell(s, k, x, y, nearScratch);
  return Math.max(0, nearScratch.d - nearScratch.r);
}
