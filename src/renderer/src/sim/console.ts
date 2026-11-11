import type { Intent } from '../../../shared/intent';
import type { SimState } from './state';
import { Seated } from './components';
import { StationKind, STATION_COUNT } from './stationKinds';
import { intentFor } from './step';
import { standUp } from './stations';
import { shiftBar } from './power';
import { cycleCoolant } from './heat';
import { toggleSeal } from './doors';
import { STICK_EDGE_THRESHOLD, STICK_REPEAT_TICKS } from './tuning';

import { Dir } from './dir';
import { chargeBeam, weaponsInput } from './weapons';
import { scienceInput, scanStep } from './science';
import { regenTorpedo, loadTorpedo } from './torpedoes';

export { Dir };

/** Directional edge derived from the stick (spec section 4): one edge on crossing or change, then one every STICK_REPEAT_TICKS while held. Ties go horizontal. */
export function stickEdge(state: SimState, pid: number, moveX: number, moveY: number): number {
  const ax = Math.abs(moveX), ay = Math.abs(moveY);
  const dir = ax < STICK_EDGE_THRESHOLD && ay < STICK_EDGE_THRESHOLD ? Dir.None
    : ax >= ay ? (moveX > 0 ? Dir.Right : Dir.Left) : (moveY > 0 ? Dir.Down : Dir.Up);
  const held = state.stick.heldDir, rep = state.stick.repeat;
  if (dir === Dir.None) { held[pid] = 0; rep[pid] = 0; return Dir.None; }
  if (dir !== held[pid]) { held[pid] = dir; rep[pid] = STICK_REPEAT_TICKS; return dir; }
  const r = rep[pid]! - 1;
  if (r <= 0) { rep[pid] = STICK_REPEAT_TICKS; return dir; }
  rep[pid] = r; return Dir.None;
}

function engineeringInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  const c = state.stations.cursor;
  if (dir === Dir.Up) c[i] = (c[i]! + STATION_COUNT - 1) % STATION_COUNT;
  else if (dir === Dir.Down) c[i] = (c[i]! + 1) % STATION_COUNT;
  else if (dir === Dir.Right || dir === Dir.Left) {
    const target = state.derived.stationOfKind[c[i]!]!;
    if (target >= 0) shiftBar(state, target, dir === Dir.Right ? 1 : -1);
  }
  if (confirm) cycleCoolant(state, state.derived.stationOfKind[c[i]!]!);   // spec 2b-i section 5: the cursor's station after this tick's stick edge
}

function doorsInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  const edges = state.derived.doorEdges, n = edges.length, c = state.stations.cursor;
  if (c[i]! < 0) return;                                              // a ship without doors
  if (dir === Dir.Up || dir === Dir.Left) c[i] = (c[i]! + n - 1) % n;
  else if (dir === Dir.Down || dir === Dir.Right) c[i] = (c[i]! + 1) % n;
  if (confirm) state.scratch.doorToggles.add(edges[c[i]!]!);
}

/** Step 2: seated players' input, then the tick's door toggles (local and remote) once per door, ascending (spec sections 4, 6). */
export function consoleSystem(state: SimState, intents: readonly Intent[]): void {
  chargeBeam(state);
  regenTorpedo(state);
  loadTorpedo(state);
  scanStep(state);
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!, i = Seated.station[eid]!;
    if (i < 0 || state.scratch.satThisTick[pid]) continue;              // players who sat this tick act from the next tick
    const it = intentFor(intents, pid);
    if (it.cancelPressed || it.interactPressed) { standUp(state, pid); state.scratch.stoodThisTick[pid] = 1; continue; }   // standing consumes the tick's stick input
    const dir = stickEdge(state, pid, it.moveX, it.moveY);
    const kind = state.derived.stationKind[i]!;
    if (kind === StationKind.Engineering) engineeringInput(state, i, dir, it.confirmPressed);
    else if (kind === StationKind.Doors) doorsInput(state, i, dir, it.confirmPressed);
    else if (kind === StationKind.Weapons) weaponsInput(state, i, dir, it.confirmPressed);
    else if (kind === StationKind.Science) scienceInput(state, i, dir, it.confirmPressed);
    // Navigation, Life Support, Medbay: no seated controls.
  }
  for (const e of [...state.scratch.doorToggles].sort((a, b) => a - b)) toggleSeal(state, e);
}
