import type { Derived } from '../sim/ship/derived';

/** Stable order of a room's tiles: a bijective hash of the tile index, so the burning subset grows as a prefix (spec §4). */
function stableOrder(tiles: readonly number[]): number[] {
  return [...tiles].sort((a, b) => ((Math.imul(a, 0x9e3779b1) >>> 0) - (Math.imul(b, 0x9e3779b1) >>> 0)) || a - b);
}

export function fireTiles(roomTiles: readonly number[], fire: number, fireCap: number): number[] {
  if (fire <= 0 || roomTiles.length === 0) return [];
  const count = Math.min(roomTiles.length, Math.ceil((fire / fireCap) * roomTiles.length));
  return stableOrder(roomTiles).slice(0, Math.max(1, count));
}

const AROUND = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const;   // up, left, right, down (tile-index order)

/** The 4-neighbour floor tiles of a breach site that belong to the breached room (the site itself is a wall tile). */
export function breachDamagedTiles(d: Derived, site: number): number[] {
  const t = d.siteTile[site]!, tx = t % d.width, ty = (t - tx) / d.width, out: number[] = [];
  for (const [ox, oy] of AROUND) {
    const nx = tx + ox, ny = ty + oy;
    if (nx < 0 || ny < 0 || nx >= d.width) continue;
    const n = ny * d.width + nx;
    if (n >= d.roomOfTile.length) continue;
    if (d.roomOfTile[n] === d.siteRoom[site]) out.push(n);
  }
  return out;
}

export function breachFloorNeighbour(d: Derived, site: number): number { return breachDamagedTiles(d, site)[0] ?? -1; }

/** Horizontal wall (floor above or below the site) → 'h'; side wall → 'v'. */
export function breachOrientation(d: Derived, site: number): 'h' | 'v' {
  const f = breachFloorNeighbour(d, site);
  if (f < 0) return 'h';
  return (f % d.width) === (d.siteTile[site]! % d.width) ? 'h' : 'v';
}

/** Rotation for the vent puff, drawn travelling upward (−y) at rotation 0; direction = site − floor neighbour. */
export function ventRotation(d: Derived, site: number): number {
  const f = breachFloorNeighbour(d, site);
  if (f < 0) return 0;
  const s = d.siteTile[site]!;
  const dx = (s % d.width) - (f % d.width), dy = Math.trunc(s / d.width) - Math.trunc(f / d.width);
  if (dy < 0) return 0; if (dx > 0) return Math.PI / 2; if (dy > 0) return Math.PI; return -Math.PI / 2;
}
