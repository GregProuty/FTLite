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
