import type { SimState } from './state';
import { nextFloat, nextInt, type RngState } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { Dir } from './dir';
import { clearObjects } from './debris';
import { leave } from './enemy';
import { activeBoarderCount } from './boarders';
import { enterPhase, Phase } from './director';
import { EndReason } from './crew';
import { TICK_HZ, DT, RUN_COLUMNS, EDGE_CHANCE, JUMP_CHARGE_TIME, ENCOUNTER_AFTER_JUMP, BOARDING_AFTER_JUMP } from './tuning';

/** The node map (spec Run-i section 5): nodes per column and, per node, a bitmask of the next column's reachable nodes. Draws only from the given stream, in a fixed order. */
export function generateMap(rng: RngState, columns: number): { colNodes: Uint8Array; edgeMask: Uint8Array } {
  const colNodes = new Uint8Array(columns), edgeMask = new Uint8Array(columns * 3);
  colNodes[0] = 1; colNodes[columns - 1] = 1;
  for (let c = 1; c < columns - 1; c++) colNodes[c] = 2 + nextInt(rng, 2);
  for (let c = 0; c < columns - 1; c++) {
    const next = colNodes[c + 1]!;
    for (let n = 0; n < colNodes[c]!; n++) {
      let mask = 0;
      for (let d = 0; d < next; d++) if (nextFloat(rng) < EDGE_CHANCE) mask |= 1 << d;
      if (mask === 0) mask = 1 << nextInt(rng, next);
      edgeMask[c * 3 + n] = mask;
    }
    for (let d = 0; d < next; d++) {
      let incoming = false;
      for (let n = 0; n < colNodes[c]!; n++) if (edgeMask[c * 3 + n]! & (1 << d)) incoming = true;
      if (!incoming) { const n = nextInt(rng, colNodes[c]!); edgeMask[c * 3 + n] = edgeMask[c * 3 + n]! | (1 << d); }
    }
  }
  return { colNodes, edgeMask };
}

export function nodeLabel(column: number, node: number): string { return `Node ${column + 1}${String.fromCharCode(97 + node)}`; }

/** Destination node indices in the next column, ascending; empty in the last column. */
export function reachable(state: SimState): number[] {
  const r = state.run, out: number[] = [];
  if (r.column >= RUN_COLUMNS - 1) return out;
  const mask = r.edgeMask[r.column * 3 + r.node]!, next = r.colNodes[r.column + 1]!;
  for (let d = 0; d < next; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

/** First system of the tick: the drive charges from arrival, whatever else happens (spec section 6). */
export function jumpStep(state: SimState): void { state.run.jumpCharge = Math.min(1, state.run.jumpCharge + DT / JUMP_CHARGE_TIME); }

/** Seated Navigation input: Up/Down cycle the destinations, a Confirm edge with a ready drive jumps (spec section 6). */
export function navigationInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  const list = reachable(state), c = state.stations.cursor, n = list.length;
  if (!n) { c[i] = 0; return; }
  if (c[i]! >= n) c[i] = 0;
  if (dir === Dir.Up) c[i] = (c[i]! + n - 1) % n; else if (dir === Dir.Down) c[i] = (c[i]! + 1) % n;
  if (confirm && state.run.jumpCharge >= 1) jumpShip(state);
}

/** The jump (spec section 6): leave the encounter, keep the ship, re-arm the clocks, maybe win. */
export function jumpShip(state: SimState): void {
  const r = state.run, list = reachable(state), nav = state.derived.stationOfKind[StationKind.Navigation]!;
  if (!list.length) return;
  const cursor = nav >= 0 ? Math.min(state.stations.cursor[nav]!, list.length - 1) : 0;
  r.node = list[Math.max(0, cursor)]!; r.column += 1; r.nodesReached += 1; r.jumpCharge = 0;
  if (nav >= 0) state.stations.cursor[nav] = 0;
  state.telemetry.jumps++;
  clearObjects(state);
  if (state.enemy.present) leave(state, false);
  state.enemy.nextArrivalTick = state.tick + ENCOUNTER_AFTER_JUMP * TICK_HZ;
  if (activeBoarderCount(state) === 0) state.boarders.nextArrivalTick = state.tick + BOARDING_AFTER_JUMP * TICK_HZ;
  enterPhase(state, Phase.BuildUp);
  if (r.column === RUN_COLUMNS - 1) { state.ended = 1; state.endReason = EndReason.Victory; }
}
