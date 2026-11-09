import type { SimState } from './state';

export const DoorState = { Closed: 0, Open: 1, Sealed: 2 } as const;

export function tileIndex(state: SimState, x: number, y: number): number {
  return Math.floor(y) * state.derived.width + Math.floor(x);
}

/** Single solidity query used by movement and reach (spec §5 Crew). */
export function solidAt(state: SimState, tx: number, ty: number): boolean {
  const d = state.derived;
  if (tx < 0 || ty < 0 || tx >= d.width || ty >= d.height) return true;
  const i = ty * d.width + tx;
  if (d.wallTile[i]) return true;
  const edge = d.doorTileToEdge[i]!;
  if (edge >= 0) return state.doors.state[edge] !== DoorState.Open;
  return false;
}

export function roomAt(state: SimState, x: number, y: number): number {
  const d = state.derived;
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= d.width || ty >= d.height) return -1;
  return d.roomOfTile[ty * d.width + tx]!;
}

/**
 * The room whose conditions apply at a point. Inside a room that is the room; on a door tile (roomAt is -1)
 * it is the worse of the 4-neighbour rooms (fire counts most, then lowest oxygen fraction); -1 if none.
 */
export function conditionRoomAt(state: SimState, x: number, y: number): number {
  const r = roomAt(state, x, y);
  if (r >= 0) return r;
  const d = state.derived;
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= d.width || ty >= d.height) return -1;
  let best = -1, bestScore = -Infinity;
  // Neighbours in ascending tile-index order: up, left, right, down.
  const around = [[tx, ty - 1], [tx - 1, ty], [tx + 1, ty], [tx, ty + 1]] as const;
  for (const [nx, ny] of around) {
    if (nx < 0 || ny < 0 || nx >= d.width || ny >= d.height) continue;
    const nr = d.roomOfTile[ny * d.width + nx]!;
    if (nr < 0) continue;
    const score = (state.rooms.fire[nr]! > 0 ? 2 : 0) + (1 - state.rooms.o2[nr]! / d.volume[nr]!);
    if (score > bestScore) { best = nr; bestScore = score; }
  }
  return best;
}
