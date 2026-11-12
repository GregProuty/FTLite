import type { SimState } from './state';
import { Position, Life, LifeState } from './components';
import { DoorState } from './grid';
import { StationKind } from './stationKinds';
import { stationOnline } from './stations';
import { quirkDoorDelayMult } from './quirks';
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

/** Length of the Doors console's cursor list: the interior doors (ascending edge order), then the airlocks (spec Demo-vii amendment 3). */
export function doorsCursorCount(state: SimState): number { return state.derived.doorEdges.length + state.derived.airlockRoom.length; }

export type DoorsCursorTarget = { kind: 'door'; edge: number } | { kind: 'airlock'; index: number };

/** What cursor value c selects: a door edge, an airlock index, or null when c is outside the list. */
export function doorsCursorTarget(state: SimState, c: number): DoorsCursorTarget | null {
  const edges = state.derived.doorEdges;
  if (c < 0 || c >= doorsCursorCount(state)) return null;
  return c < edges.length ? { kind: 'door', edge: edges[c]! } : { kind: 'airlock', index: c - edges.length };
}

/**
 * The Doors console's remote cycle on an interior door: Auto (Closed/Open) -> Sealed -> Held open -> Auto (spec Demo-vii amendment 19:
 * sealing stays one press, as before Demo-vii; venting a room needs its other doors sealed, so sealing is the common command). A pending seal counts as Sealed.
 */
export function cycleDoor(state: SimState, edge: number): void {
  if (!state.derived.edgeIsDoor[edge]) return;
  const st = state.doors.state[edge]!;
  if (st === DoorState.Sealed || state.doors.sealRequested[edge]) { state.doors.sealRequested[edge] = 0; state.doors.state[edge] = DoorState.HeldOpen; state.doors.closeTimer[edge] = 0; return; }
  if (st === DoorState.HeldOpen) { state.doors.state[edge] = DoorState.Closed; state.doors.closeTimer[edge] = 0; return; }
  toggleSeal(state, edge);   // Auto: seal now, or once the doorway clears
}

/** True when the Doors station is online (powered, not failed). Remote holds and airlocks depend on it. */
export function doorsOnline(state: SimState): boolean {
  const i = state.derived.stationOfKind[StationKind.Doors]!;
  return i >= 0 && stationOnline(state, i);
}

/** Fail-safe (spec Demo-vii amendment 2): with the Doors station offline every airlock closes and every held door returns to Closed. */
function doorsFailSafe(state: SimState): void {
  if (doorsOnline(state)) return;
  state.airlocks.open.fill(0);
  for (let e = 0; e < state.doors.state.length; e++) {
    if (state.doors.state[e] === DoorState.HeldOpen) { state.doors.state[e] = DoorState.Closed; state.doors.closeTimer[e] = 0; }
  }
}

export function doorSystem(state: SimState): void {
  const d = state.derived;
  doorsFailSafe(state);
  for (let e = 0; e < d.edgeIsDoor.length; e++) {
    if (!d.edgeIsDoor[e]) continue;
    if (state.doors.state[e] === DoorState.Sealed) continue;
    if (state.doors.sealRequested[e] && !crewOnTile(state, d.edgeTile[e]!)) {
      state.doors.state[e] = DoorState.Sealed; state.doors.sealRequested[e] = 0; state.doors.closeTimer[e] = 0;
      continue;
    }
    if (state.doors.state[e] === DoorState.HeldOpen) continue;   // held open from the Doors console: crew never rewrite it, no close timer (spec Demo-vii amendment 1)
    if (crewInZone(state, e)) {
      state.doors.state[e] = DoorState.Open; state.doors.closeTimer[e] = DOOR_CLOSE_DELAY * quirkDoorDelayMult(state);
    } else if (state.doors.state[e] === DoorState.Open) {
      state.doors.closeTimer[e] = Math.max(0, state.doors.closeTimer[e]! - DT);
      if (state.doors.closeTimer[e] === 0 && !crewOnTile(state, d.edgeTile[e]!)) state.doors.state[e] = DoorState.Closed;
    }
  }
}
