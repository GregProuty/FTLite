import type { Derived } from '../sim/ship/derived';
import type { SimState } from '../sim/state';
import { StationKind } from '../sim/stationKinds';
import { doorsCursorTarget } from '../sim/doors';

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

// Airlocks and the Doors console selection (spec Demo-vii section 1). Pure: read the state, draw nothing.

/** Whether airlock k is open, and whether it is visibly venting (its room holds more than 1% oxygen). */
export function airlockDraw(state: SimState, k: number): { open: boolean; venting: boolean } {
  const open = state.airlocks.open[k] === 1, r = state.derived.airlockRoom[k]!;
  return { open, venting: open && state.rooms.o2[r]! / state.derived.volume[r]! > 0.01 };
}

/** Unit step from airlock k's room tile through the hull tile into space. */
export function airlockOutward(d: Derived, k: number): { dx: number; dy: number } {
  const t = d.airlockTile[k]!, tx = t % d.width, ty = (t - tx) / d.width;
  for (const [ox, oy] of AROUND) {
    const nx = tx + ox, ny = ty + oy;
    if (nx < 0 || ny < 0 || nx >= d.width || ny >= d.height) continue;
    if (d.roomOfTile[ny * d.width + nx] === d.airlockRoom[k]) return { dx: 0 - ox || 0, dy: 0 - oy || 0 };   // never -0
  }
  return { dx: 0, dy: -1 };
}

export const VENT_PARTICLES = 6, VENT_PERIOD_TICKS = 40, VENT_REACH_TILES = 1.5;

/** Oxygen streaming out of an open airlock: VENT_PARTICLES specks cycling outward, `along` tiles past the hull tile's outer edge, `side` across it. */
export function ventParticles(_out: { dx: number; dy: number }, k: number, tick: number): { along: number; side: number; alpha: number }[] {
  return Array.from({ length: VENT_PARTICLES }, (_, i) => {
    const f = ((tick + i * 7 + k * 13) % VENT_PERIOD_TICKS) / VENT_PERIOD_TICKS;
    return { along: f * VENT_REACH_TILES, side: (((i * 37) % 9) - 4) / 10, alpha: 1 - 0.85 * f };
  });
}

/** The tile of the seated Doors operator's selection (door or airlock), or -1 when nobody is seated or nothing is selected. */
export function doorsCursorTile(state: SimState): number {
  const d = state.derived, i = d.stationOfKind[StationKind.Doors]!;
  if (i < 0 || state.stations.occupant[i]! < 0) return -1;
  const t = doorsCursorTarget(state, state.stations.cursor[i]!);
  if (!t) return -1;
  return t.kind === 'door' ? d.edgeTile[t.edge]! : d.airlockTile[t.index]!;
}
