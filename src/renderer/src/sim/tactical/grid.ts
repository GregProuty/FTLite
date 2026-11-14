// Broad phase (spec §4): a fixed uniform grid over the static asteroids, built once per map.
// A query returns asteroid indices in ascending order, so every caller visits contacts in one fixed order.
import type { Circle } from './map';
import { BROAD_CELL } from './tuning';

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
