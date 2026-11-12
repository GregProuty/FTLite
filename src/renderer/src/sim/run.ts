import type { SimState } from './state';
import { nextFloat, nextInt, type RngState } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { Dir } from './dir';
import { clearObjects } from './debris';
import { leave } from './enemy';
import { activeBoarderCount } from './boarders';
import { enterPhase, Phase } from './director';
import { EndReason } from './crew';
import { EVENTS, choiceEnabled, resolveEvent } from './events';
import { SHOP_ITEM_COUNT, itemLabel, itemEnabled, buy } from './shop';
import { addScrap } from './scrap';
import { TICK_HZ, DT, RUN_COLUMNS, EDGE_CHANCE, SHOP_CHANCE, EVENT_CHANCE, SCRAP_PER_JUMP, EVENT_COUNT, JUMP_CHARGE_TIME, ENCOUNTER_AFTER_JUMP, BOARDING_AFTER_JUMP } from './tuning';
import { quirkChargeMult } from './quirks';

/** Longest Navigation panel text: the console panel is 234 px wide, row text starts at x=20 and the bitmap font averages about 5.5 px per glyph, so 36 glyphs fit. */
export const NAV_TEXT_MAX = 36;
export const NodeType = { Hazard: 0, Event: 1, Shop: 2 } as const;
export interface NavRow { text: string; select: 'none' | 'choice' | 'buy' | 'jump'; index: number; enabled: boolean }

/** Node types (spec Run-ii section 3): one draw per middle node after every edge draw; a shop is guaranteed without a draw. */
export function assignNodeTypes(rng: RngState, colNodes: Uint8Array, nodeType: Uint8Array, draw: (rng: RngState) => number = nextFloat): void {
  const columns = colNodes.length; nodeType.fill(NodeType.Hazard);
  for (let c = 1; c < columns - 1; c++) for (let n = 0; n < colNodes[c]!; n++) { const u = draw(rng); nodeType[c * 3 + n] = u < SHOP_CHANCE ? NodeType.Shop : u < SHOP_CHANCE + EVENT_CHANCE ? NodeType.Event : NodeType.Hazard; }
  for (let c = 1; c < columns - 1; c++) for (let n = 0; n < colNodes[c]!; n++) if (nodeType[c * 3 + n] === NodeType.Shop) return;
  nodeType[Math.floor(columns / 2) * 3] = NodeType.Shop;
}

/** The node map (spec Run-i section 5): nodes per column and, per node, a bitmask of the next column's reachable nodes. Draws only from the given stream, in a fixed order. */
export function generateMap(rng: RngState, columns: number): { colNodes: Uint8Array; edgeMask: Uint8Array; nodeType: Uint8Array } {
  const colNodes = new Uint8Array(columns), edgeMask = new Uint8Array(columns * 3), nodeType = new Uint8Array(columns * 3);
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
  assignNodeTypes(rng, colNodes, nodeType);
  return { colNodes, edgeMask, nodeType };
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
export function jumpStep(state: SimState): void { state.run.jumpCharge = Math.min(1, state.run.jumpCharge + DT / (JUMP_CHARGE_TIME * quirkChargeMult(state))); }

/** Step 1b of the jump (spec Run-ii section 6): the arrival award and, at an Event node, the event id (one loot draw). */
function arrive(state: SimState): void {
  const r = state.run; r.event = -1; r.eventChoice = -1; addScrap(state, SCRAP_PER_JUMP);
  if (r.nodeType[r.column * 3 + r.node] === NodeType.Event) r.event = nextInt(state.rng.loot, EVENT_COUNT);
}

/** The Navigation list (spec Run-ii section 6): a pending event, else a shop's items then the destinations, else the destinations. */
export function navRows(state: SimState): NavRow[] {
  const r = state.run, rows: NavRow[] = [];
  if (r.event >= 0 && r.eventChoice < 0) {
    const ev = EVENTS[r.event]!;
    rows.push({ text: ev.title, select: 'none', index: 0, enabled: false }, { text: ev.text, select: 'none', index: 0, enabled: false });
    for (let k = 0; k < 2; k++) rows.push({ text: ev.choices[k]!, select: 'choice', index: k, enabled: choiceEnabled(state, r.event, k) });
    return rows;
  }
  if (r.nodeType[r.column * 3 + r.node] === NodeType.Shop) {
    rows.push({ text: `Shop   scrap ${r.scrap}`, select: 'none', index: 0, enabled: false });
    for (let i = 0; i < SHOP_ITEM_COUNT; i++) rows.push({ text: itemLabel(state, i), select: 'buy', index: i, enabled: itemEnabled(state, i) });
  }
  for (const d of reachable(state)) rows.push({ text: nodeLabel(r.column + 1, d), select: 'jump', index: d, enabled: true });
  return rows;
}

/** Keep the cursor on an existing selectable row, else the first selectable row (0 if none) (spec Run-ii section 6). */
export function clampNavCursor(state: SimState): void {
  const nav = state.derived.stationOfKind[StationKind.Navigation]!; if (nav < 0) return;
  const rows = navRows(state), c = state.stations.cursor[nav]!;
  if (rows[c] && rows[c]!.select !== 'none') return;
  const first = rows.findIndex((row) => row.select !== 'none'); state.stations.cursor[nav] = first < 0 ? 0 : first;
}

/** Seated Navigation input: Up/Down move over the selectable rows, a Confirm edge acts on the row: choose, buy or (with a ready drive) jump (spec Run-ii section 6). */
export function navigationInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  clampNavCursor(state);
  const rows = navRows(state), c = state.stations.cursor, n = rows.length;
  if (!rows.some((row) => row.select !== 'none')) return;
  const stepTo = (delta: number) => { let k = c[i]!; do k = (k + delta + n) % n; while (rows[k]!.select === 'none'); c[i] = k; };
  if (dir === Dir.Up) stepTo(-1); else if (dir === Dir.Down) stepTo(1);
  if (!confirm) return;
  const row = rows[c[i]!]!;
  if (row.select === 'choice' && row.enabled) { resolveEvent(state, row.index); clampNavCursor(state); }
  else if (row.select === 'buy' && row.enabled) { buy(state, row.index); clampNavCursor(state); }
  else if (row.select === 'jump' && state.run.jumpCharge >= 1) jumpShip(state, row.index);
}

/** The jump (spec Run-i section 6, Run-ii section 6): leave the encounter, keep the ship, arrive (scrap, maybe an event), re-arm the clocks, maybe win. A destination not reachable is a no-op. */
export function jumpShip(state: SimState, destination: number): void {
  const r = state.run, list = reachable(state), nav = state.derived.stationOfKind[StationKind.Navigation]!;
  if (!list.includes(destination)) return;
  r.node = destination; r.column += 1; r.nodesReached += 1; r.jumpCharge = 0;
  if (nav >= 0) state.stations.cursor[nav] = 0;
  state.telemetry.jumps++;
  arrive(state);
  clearObjects(state);
  if (state.enemy.present) { state.enemy.surrenderIntact = 0; leave(state, false); }   // the ship left, not the enemy: a flee in progress counts as a flight, no surrender bounty (spec Demo-i section 11.3)
  state.enemy.nextArrivalTick = state.tick + ENCOUNTER_AFTER_JUMP * TICK_HZ;
  if (activeBoarderCount(state) === 0) state.boarders.nextArrivalTick = state.tick + BOARDING_AFTER_JUMP * TICK_HZ;
  enterPhase(state, Phase.BuildUp);
  if (r.column === RUN_COLUMNS - 1) { state.ended = 1; state.endReason = EndReason.Victory; }
}
