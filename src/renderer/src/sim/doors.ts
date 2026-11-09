import type { SimState } from './state';
import { Position, Life, LifeState } from './components';
import { DoorState } from './grid';
import { CREW_HALF, DOOR_ZONE, DOOR_CLOSE_DELAY, DT } from './tuning';

function tileCentre(state: SimState, tileIdx: number): [number, number] {
  const w = state.derived.width, tx = tileIdx % w;
  return [tx + 0.5, (tileIdx - tx) / w + 0.5];
}

/** True if any Conscious crew member's centre is within DOOR_ZONE of the door tile centre. */
export function crewInZone(state: SimState, edge: number): boolean {
  const [cx, cy] = tileCentre(state, state.derived.edgeTile[edge]!);
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] !== LifeState.Conscious) continue;
    if (Math.abs(Position.x[eid]! - cx) <= DOOR_ZONE && Math.abs(Position.y[eid]! - cy) <= DOOR_ZONE) return true;
  }
  return false;
}

/** True if any crew member's AABB (any life state) overlaps the tile. */
export function crewOnTile(state: SimState, tileIdx: number): boolean {
  const [cx, cy] = tileCentre(state, tileIdx);
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Math.abs(Position.x[eid]! - cx) < 0.5 + CREW_HALF && Math.abs(Position.y[eid]! - cy) < 0.5 + CREW_HALF) return true;
  }
  return false;
}

/** Local or remote seal toggle. Sealing a door with someone in it is deferred until the tile is clear. */
export function toggleSeal(state: SimState, edge: number): void {
  if (!state.derived.edgeIsDoor[edge]) return;
  if (state.doors.state[edge] === DoorState.Sealed) { state.doors.state[edge] = DoorState.Closed; state.doors.closeTimer[edge] = 0; return; }
  if (state.doors.sealRequested[edge]) { state.doors.sealRequested[edge] = 0; return; }
  if (crewOnTile(state, state.derived.edgeTile[edge]!)) { state.doors.sealRequested[edge] = 1; return; }
  state.doors.state[edge] = DoorState.Sealed; state.doors.closeTimer[edge] = 0;
}

export function doorSystem(state: SimState): void {
  const d = state.derived;
  for (let e = 0; e < d.edgeIsDoor.length; e++) {
    if (!d.edgeIsDoor[e]) continue;
    if (state.doors.state[e] === DoorState.Sealed) continue;
    if (state.doors.sealRequested[e] && !crewOnTile(state, d.edgeTile[e]!)) {
      state.doors.state[e] = DoorState.Sealed; state.doors.sealRequested[e] = 0; state.doors.closeTimer[e] = 0;
      continue;
    }
    if (crewInZone(state, e)) {
      state.doors.state[e] = DoorState.Open; state.doors.closeTimer[e] = DOOR_CLOSE_DELAY;
    } else if (state.doors.state[e] === DoorState.Open) {
      state.doors.closeTimer[e] = Math.max(0, state.doors.closeTimer[e]! - DT);
      if (state.doors.closeTimer[e] === 0 && !crewOnTile(state, d.edgeTile[e]!)) state.doors.state[e] = DoorState.Closed;
    }
  }
}
