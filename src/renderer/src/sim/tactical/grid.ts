// Broad phase (spec §4): a fixed uniform grid over the static asteroids, built once per map (the flight view's seeded map). Asteroids-iii: the rock pool's own grid below.
// A query returns asteroid indices in ascending order, so every caller visits contacts in one fixed order.
import type { Circle } from './map';
import { ROCK_EDGE_SLACK_SOFT, ROCK_GRID_CELL, ROCK_R_MAX } from './rockTuning';
import { BROAD_CELL, R_MAP } from './tuning';

export interface BroadPhase { origin: number; cols: number; cells: number[][] }

function cellOf(g: BroadPhase, v: number): number {
  return Math.min(g.cols - 1, Math.max(0, Math.floor((v - g.origin) / BROAD_CELL)));
}

export function buildGrid(asteroids: readonly Circle[], rMap: number): BroadPhase {
  const origin = -(rMap + BROAD_CELL);
  const cols = Math.ceil((2 * (rMap + BROAD_CELL)) / BROAD_CELL);
  const g: BroadPhase = { origin, cols, cells: Array.from({ length: cols * cols }, () => [] as number[]) };
  asteroids.forEach((a, i) => {
    for (let cy = cellOf(g, a.y - a.r); cy <= cellOf(g, a.y + a.r); cy++)
      for (let cx = cellOf(g, a.x - a.r); cx <= cellOf(g, a.x + a.r); cx++) g.cells[cy * cols + cx]!.push(i);
  });
  return g;
}

/** Indices of every asteroid whose cells overlap the square around (x, y) of half-size r, ascending, no repeats. */
export function queryGrid(g: BroadPhase, x: number, y: number, r: number): number[] {
  const found: number[] = [];
  for (let cy = cellOf(g, y - r); cy <= cellOf(g, y + r); cy++)
    for (let cx = cellOf(g, x - r); cx <= cellOf(g, x + r); cx++) for (const i of g.cells[cy * g.cols + cx]!) found.push(i);
  found.sort((a, b) => a - b);
  return found.filter((v, k) => k === 0 || v !== found[k - 1]);
}

// Asteroids-iii §6.1: the rock pool's broad phase, replacing the seeded never-rebuilt grid for rocks. A uniform grid of
// ROCK_GRID_CELL cells over ±(R_MAP + ROCK_EDGE_SLACK_SOFT + ROCK_R_MAX), built into reused typed arrays (cell heads and next
// links) and kept in a WeakMap keyed by the state object, so it is never hashed, snapshotted or copied by a clone. Each
// live rock is linked into the one cell holding its centre; a query widens its box by ROCK_R_MAX plus the pad and writes
// the slots it finds into the reused scratch, ascending by insertion sort (a slot sits in one cell: no repeats).
export interface RockGrid { cols: number; origin: number; head: Int32Array; next: Int32Array; cell: Int32Array; scratch: Int32Array }
const rockGrids = new WeakMap<object, RockGrid>();
const ROCK_GRID_REACH = R_MAP + ROCK_EDGE_SLACK_SOFT + ROCK_R_MAX;
function rockCell(g: RockGrid, v: number): number { return Math.min(g.cols - 1, Math.max(0, Math.floor((v - g.origin) / ROCK_GRID_CELL))); }
/** `key`'s grid for a pool of `slots`, emptied (every head, link and cell −1); made once per key and size, then reused. */
export function emptyRockGrid(key: object, slots: number): RockGrid {
  let g = rockGrids.get(key);
  if (!g || g.next.length !== slots) {
    const cols = Math.ceil((2 * ROCK_GRID_REACH) / ROCK_GRID_CELL);
    g = { cols, origin: -ROCK_GRID_REACH, head: new Int32Array(cols * cols), next: new Int32Array(slots), cell: new Int32Array(slots), scratch: new Int32Array(slots) };
    rockGrids.set(key, g);
  }
  g.head.fill(-1); g.next.fill(-1); g.cell.fill(-1);
  return g;
}
export function peekRockGrid(key: object): RockGrid | undefined { return rockGrids.get(key); }
/** Link slot k into the cell holding (x, y), first unlinking it from the cell it was in. */
export function linkRock(g: RockGrid, k: number, x: number, y: number): void {
  const old = g.cell[k]!;
  if (old >= 0) {
    let prev = -1, at = g.head[old]!;
    while (at >= 0 && at !== k) { prev = at; at = g.next[at]!; }
    if (at === k) { if (prev < 0) g.head[old] = g.next[k]!; else g.next[prev] = g.next[k]!; }
  }
  const c = rockCell(g, y) * g.cols + rockCell(g, x);
  g.next[k] = g.head[c]!; g.head[c] = k; g.cell[k] = c;
}
/** Every slot linked into a cell the square about (x, y) of half-size h touches, into g.scratch ascending; the count. */
export function queryRockGrid(g: RockGrid, x: number, y: number, h: number): number {
  const x0 = rockCell(g, x - h), x1 = rockCell(g, x + h), y0 = rockCell(g, y - h), y1 = rockCell(g, y + h), out = g.scratch;
  let n = 0;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (let k = g.head[cy * g.cols + cx]!; k >= 0; k = g.next[k]!) {
    let j = n++;
    while (j > 0 && out[j - 1]! > k) { out[j] = out[j - 1]!; j--; }
    out[j] = k;
  }
  return n;
}
