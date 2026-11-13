import type { SimState } from './state';
import { nextFloat, nextInt, type RngState } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { Dir } from './dir';
import { clearObjects, spawnFieldRock } from './debris';
import { leave, Encounter } from './enemy';
import { activeBoarderCount } from './boarders';
import { enterPhase, Phase } from './director';
import { consciousCount } from './crew';
import { Life, LifeState } from './components';
import { EVENT_DEFS, choiceEnabled, resolveEvent, pickEvent, choiceLabel, isBlue } from './events';
import { SHOP_ITEM_COUNT, WEAPON_ITEM, itemLabel, itemEnabled, buy } from './shop';
import { LOOT_WEAPON_TYPES } from './weaponDefs';
import { addScrap } from './scrap';
import { depthOf, peaceful } from './depth';
import { TICK_HZ, DT, SECTORS, PURSUIT_START, PURSUIT_STEP, WAIT_SECONDS, WAIT_FUEL_CHANCE, WAIT_FUEL, FIELD_FUEL, SECTOR_COLUMNS, NODE_STRIDE, MIDDLE_MIN, MIDDLE_MAX, EDGE_CHANCE, SHOP_CHANCE, EVENT_CHANCE, ASTEROID_CHANCE, EMPTY_CHANCE, scrapPerJump, JUMP_CHARGE_TIME, BOARDING_AFTER_JUMP, ENCOUNTER_START, ENCOUNTER_BOOST, NEVER, FIELD_INTERVAL, FIELD_JITTER, FIELD_SECONDS, FIELD_CLEAR_EXTRA, scrapField, EVADE_WINDOW, EVADE_COOLDOWN, VOTE_SECONDS, VOTE_SETTLE, CONFIRM_SECONDS, AMBUSH_CHANCE, AMBUSH_EVENT_CHANCE, CACHE_CHANCE, AMBUSH_DELAY } from './tuning';
import { stationOnline } from './stations';
import { quirkChargeMult } from './quirks';

/** Longest Navigation panel text: the console panel is 234 px wide, row text starts at x=20 and the bitmap font averages about 5.5 px per glyph, so 36 glyphs fit. */
export const NAV_TEXT_MAX = 36;
export const NodeType = { Hazard: 0, Event: 1, Shop: 2, Asteroid: 3, Empty: 4 } as const;
/** A beacon on the sector map: its column and its node in that column (spec Loop-i section 1). */
export interface Beacon { column: number; node: number }
/** The map arrays' index of a beacon (stride NODE_STRIDE). */
export const beaconIndex = (column: number, node: number): number => column * NODE_STRIDE + node;
export const beaconAt = (index: number): Beacon => ({ column: Math.floor(index / NODE_STRIDE), node: index % NODE_STRIDE });
/** The pending-jump code and row index of the exit's sector jump (spec Loop-i amendment S1): one past every beacon index. */
export const EXIT_JUMP = SECTOR_COLUMNS * NODE_STRIDE;
export interface NavRow { text: string; select: 'none' | 'choice' | 'buy' | 'jump' | 'sector' | 'wait' | 'evade'; index: number; enabled: boolean; blue?: boolean }   // blue: an event choice with a station or crew skill requirement (spec Loop-v section 1)

/** Node types (spec Run-ii section 3, Demo-viii section 1, Loop-i section 4, Demo-x-b section 2): column 1 is all Hazard without a draw (the first jump of a sector meets a ship); one draw per node of the later middle columns after every edge draw (Shop, Event, Asteroid, Empty, else Hazard), an Empty draw in column 2 a Hazard; a shop is guaranteed without a draw. */
export function assignNodeTypes(rng: RngState, colNodes: Uint8Array, nodeType: Uint8Array, draw: (rng: RngState) => number = nextFloat): void {
  const cut = (x: number): number => Math.round(x * 1e9) / 1e9;   // cumulative thresholds without float drift (0.15 + 0.25 + 0.15 + 0.15 is 0.7000000000000001)
  const columns = colNodes.length, e = cut(SHOP_CHANCE + EVENT_CHANCE), a = cut(e + ASTEROID_CHANCE), m = cut(a + EMPTY_CHANCE); nodeType.fill(NodeType.Hazard);
  for (let c = 2; c < columns - 1; c++) for (let n = 0; n < colNodes[c]!; n++) { const u = draw(rng); nodeType[beaconIndex(c, n)] = u < SHOP_CHANCE ? NodeType.Shop : u < e ? NodeType.Event : u < a ? NodeType.Asteroid : u < m && c > 2 ? NodeType.Empty : NodeType.Hazard; }
  for (let c = 1; c < columns - 1; c++) for (let n = 0; n < colNodes[c]!; n++) if (nodeType[beaconIndex(c, n)] === NodeType.Shop) return;
  nodeType[beaconIndex(Math.floor(columns / 2), 0)] = NodeType.Shop;
}

/** One sector's map (spec Run-i section 5, Loop-i section 1): nodes per column (MIDDLE_MIN..MIDDLE_MAX in the middle) and, per node, a bitmask of the next column's reachable nodes; the sideways edges between vertical neighbours need no data. Draws only from the given stream, in a fixed order. */
export function generateMap(rng: RngState, columns: number = SECTOR_COLUMNS): { colNodes: Uint8Array; edgeMask: Uint8Array; nodeType: Uint8Array; ambush: Uint8Array; cache: Uint8Array } {
  const colNodes = new Uint8Array(columns), edgeMask = new Uint8Array(columns * NODE_STRIDE), nodeType = new Uint8Array(columns * NODE_STRIDE);
  colNodes[0] = 1; colNodes[columns - 1] = 1;
  for (let c = 1; c < columns - 1; c++) colNodes[c] = MIDDLE_MIN + nextInt(rng, MIDDLE_MAX - MIDDLE_MIN + 1);
  for (let c = 0; c < columns - 1; c++) {
    const next = colNodes[c + 1]!;
    for (let n = 0; n < colNodes[c]!; n++) {
      let mask = 0;
      for (let d = 0; d < next; d++) if (nextFloat(rng) < EDGE_CHANCE) mask |= 1 << d;
      if (mask === 0) mask = 1 << nextInt(rng, next);
      edgeMask[beaconIndex(c, n)] = mask;
    }
    for (let d = 0; d < next; d++) {
      let incoming = false;
      for (let n = 0; n < colNodes[c]!; n++) if (edgeMask[beaconIndex(c, n)]! & (1 << d)) incoming = true;
      if (!incoming) { const n = nextInt(rng, colNodes[c]!); edgeMask[beaconIndex(c, n)] = edgeMask[beaconIndex(c, n)]! | (1 << d); }
    }
  }
  assignNodeTypes(rng, colNodes, nodeType);
  const { ambush, cache } = hideThings(rng, nodeType);
  return { colNodes, edgeMask, nodeType, ambush, cache };
}

/** The hidden things (spec Demo-x-b section 3), after the types: one draw per Empty or Event beacon in index order for an ambusher (AMBUSH_CHANCE, AMBUSH_EVENT_CHANCE), then one per Empty beacon for a cache (CACHE_CHANCE). Only middle beacons carry those types. */
export function hideThings(rng: RngState, nodeType: Uint8Array): { ambush: Uint8Array; cache: Uint8Array } {
  const ambush = new Uint8Array(nodeType.length), cache = new Uint8Array(nodeType.length);
  for (let k = 0; k < nodeType.length; k++) { const t = nodeType[k]!; if (t === NodeType.Empty || t === NodeType.Event) ambush[k] = nextFloat(rng) < (t === NodeType.Empty ? AMBUSH_CHANCE : AMBUSH_EVENT_CHANCE) ? 1 : 0; }
  for (let k = 0; k < nodeType.length; k++) if (nodeType[k] === NodeType.Empty) cache[k] = nextFloat(rng) < CACHE_CHANCE ? 1 : 0;
  return { ambush, cache };
}

export function nodeLabel(column: number, node: number): string { return `Node ${column + 1}${String.fromCharCode(97 + node)}`; }
/** A destination row: the node label, naming an asteroid field (spec Demo-viii amendment R5). */
export function destinationLabel(state: SimState, column: number, node: number): string { return `${nodeLabel(column, node)}  ${beaconMark(state, column, node)}`; }
/** What the crew knows of a beacon (spec Loop-i sections 3 and 4b): FLEET once overrun, EXIT, a shop always, a visited or charted beacon's type, else ?. Presentation only: the type is drawn with the map. */
export function beaconMark(state: SimState, column: number, node: number): string {
  const r = state.run, k = beaconIndex(column, node), t = r.nodeType[k]!;
  if (overrun(state, column)) return 'FLEET';
  if (column === r.colNodes.length - 1) return 'EXIT';
  if (t === NodeType.Shop) return 'Shop';
  return r.visited[k] || r.revealed[k] ? BEACON_NAMES[t] ?? '?' : '?';   // a beacon charted by a system scan shows its type (spec Demo-x-b section 3)
}
const BEACON_NAMES = ['Hostile', 'Event', 'Shop', 'Asteroid field', 'Empty'] as const;
/** A column at or behind the fleet front is overrun (spec Loop-i section 3): its beacons lose their own content. */
export const overrun = (state: SimState, column: number): boolean => state.run.finalBeacon === 0 && column <= Math.floor(state.run.pursuit);   // the final beacon is never overrun (spec Loop-iv section 1)
/** What the current beacon holds: its type, or -1 once the Pursuit has overrun it (no event, shop or field). */
export const contentOf = (state: SimState): number => overrun(state, state.run.column) ? -1 : state.run.nodeType[hereIndex(state)]!;
/** The beacon the ship is at, as a map index. */
export const hereIndex = (state: SimState): number => beaconIndex(state.run.column, state.run.node);
/** A key that changes on every jump, sideways ones included (the renderer's reset memory). */
export const beaconKey = (state: SimState): number => state.run.nodesReached * SECTOR_COLUMNS * NODE_STRIDE + hereIndex(state);

/** The destinations (spec Loop-i section 1): the next column's forward edges ascending, then in a middle column the sideways neighbours above and below; none from the exit. */
export function reachable(state: SimState): Beacon[] {
  const r = state.run, out: Beacon[] = [], columns = r.colNodes.length;
  if (r.column >= columns - 1) return out;
  const mask = r.edgeMask[hereIndex(state)]!, next = r.colNodes[r.column + 1]!;
  for (let d = 0; d < next; d++) if (mask & (1 << d)) out.push({ column: r.column + 1, node: d });
  if (r.column > 0) for (const n of [r.node - 1, r.node + 1]) if (n >= 0 && n < r.colNodes[r.column]!) out.push({ column: r.column, node: n });
  return out;
}
const canReach = (state: SimState, b: Beacon): boolean => reachable(state).some((x) => x.column === b.column && x.node === b.node);
/** At the sector's exit beacon, where the only way on is the sector jump (spec Loop-i amendment S1). */
export const atExit = (state: SimState): boolean => state.run.finalBeacon === 0 && state.run.column === state.run.colNodes.length - 1;   // the final beacon is past the exit (spec Loop-iv section 1)
/** The exit row's text: the next sector, or the jump to the Warden from the last sector (spec Loop-i amendment S1, Loop-iv section 1). */
export const exitText = (state: SimState): string => state.run.sector >= SECTORS - 1 ? 'Engage the Warden' : `Jump to sector ${state.run.sector + 2}`;

/** First system of the tick: the drive charges from arrival, whatever else happens (spec section 6); ENCOUNTER_BOOST times as fast after a won encounter (spec Demo-vi section 2). */
export function jumpStep(state: SimState): void { if (state.run.finalBeacon) return;   // no escape: the drive does not charge at the final beacon (spec Loop-iv section 1)
  state.run.jumpCharge = Math.min(1, state.run.jumpCharge + (state.run.driveBoost === 1 ? ENCOUNTER_BOOST : 1) * DT / (JUMP_CHARGE_TIME * quirkChargeMult(state))); }

/** Step 1b of the jump (spec Run-ii section 6): the arrival award and, at an Event node, the event id (one loot draw by weight, spec Loop-v section 2). */
function arrive(state: SimState): void {
  const r = state.run; r.event = -1; r.eventChoice = -1; r.vote.fill(-1); r.eventOpenTick = -1; r.voteTick = -1;   // the event's limit starts at the first vote (spec Demo-x-b section 2)
  if (r.finalBeacon) { r.shopWeapon = 0; return; }   // the final beacon is not on the map: no award, no content (spec Loop-iv amendment F1)
  addScrap(state, scrapPerJump(depthOf(state)));
  if (contentOf(state) === NodeType.Event) r.event = pickEvent(state);
  r.shopWeapon = contentOf(state) === NodeType.Shop ? 1 + nextInt(state.rng.loot, LOOT_WEAPON_TYPES) : 0;   // a shop's offered weapon, one loot draw (spec Loop-iii section 3)
}

/** The Navigation station is present but failed or unpowered: no jump can be made (spec Demo-x-b section 2). */
export function helmOffline(state: SimState): boolean { const nav = state.derived.stationOfKind[StationKind.Navigation]!; return nav >= 0 && !stationOnline(state, nav); }
/** A jump row's text while the helm is offline (spec Demo-x-b section 2). */
export const HELM_OFFLINE_ROW = 'Helm offline';

/** Whether a manoeuvre can start now: Navigation present and online, past the cooldown (spec Coop-ii amendment D2; the seat is the caller's check). */
export function evadeReady(state: SimState): boolean {
  const nav = state.derived.stationOfKind[StationKind.Navigation]!;
  return nav >= 0 && stationOnline(state, nav) && state.tick >= state.run.evadeReadyTick;
}
/** The evade row (spec Coop-ii section 1): EVADE: Confirm when ready, EVADING during the manoeuvre, EVADE Ns on the cooldown (whole seconds, rounded up). */
export function evadeRow(state: SimState): NavRow {
  const r = state.run, t = state.tick;
  const text = t < r.evadeUntilTick ? 'EVADING' : t < r.evadeReadyTick ? `EVADE ${Math.ceil((r.evadeReadyTick - t) / TICK_HZ)}s` : 'EVADE: Confirm';
  return { text, select: 'evade', index: 0, enabled: evadeReady(state) };
}
/** Start a manoeuvre from this tick: EVADE_WINDOW seconds of manoeuvre, then EVADE_COOLDOWN seconds (spec Coop-ii section 1). False when not ready. */
export function startEvade(state: SimState): boolean {
  if (!evadeReady(state)) return false;
  state.run.evadeUntilTick = state.tick + EVADE_WINDOW * TICK_HZ; state.run.evadeReadyTick = state.run.evadeUntilTick + EVADE_COOLDOWN * TICK_HZ;
  return true;
}

/** The Navigation list (spec Run-ii section 6, Loop-i section 2): a pending event, else a shop's items then the way on: Wait for help with no fuel (or the wait's countdown), the exit's sector row at the exit, else the destinations; the evade row always last (spec Coop-ii section 1). */
export function navRows(state: SimState): NavRow[] {
  const r = state.run, rows: NavRow[] = [], helm = helmOffline(state);
  if (r.event >= 0 && r.eventChoice < 0) {
    const ev = EVENT_DEFS[r.event]!;   // the title, one or two text rows, two or three choices (spec Loop-v section 1)
    rows.push({ text: ev.title, select: 'none', index: 0, enabled: false });
    for (const line of ev.text) rows.push({ text: line, select: 'none', index: 0, enabled: false });
    for (let k = 0; k < ev.choices.length; k++) rows.push({ text: choiceLabel(state, r.event, k), select: 'choice', index: k, enabled: choiceEnabled(state, r.event, k), blue: isBlue(r.event, k) });
    rows.push(evadeRow(state));
    return rows;
  }
  if (contentOf(state) === NodeType.Shop) {
    rows.push({ text: `Shop   scrap ${r.scrap}`, select: 'none', index: 0, enabled: false });
    for (let i = 0; i < SHOP_ITEM_COUNT; i++) rows.push({ text: itemLabel(state, i), select: 'buy', index: i, enabled: itemEnabled(state, i) });
    if (r.shopWeapon > 0) rows.push({ text: itemLabel(state, WEAPON_ITEM), select: 'buy', index: WEAPON_ITEM, enabled: itemEnabled(state, WEAPON_ITEM) });   // spec Loop-iii section 3
  }
  if (r.finalBeacon) { rows.push(evadeRow(state)); return rows; }   // no way on from the final beacon (spec Loop-iv section 1)
  if (r.waitUntilTick >= 0) rows.push({ text: `Waiting for help  ${Math.max(0, Math.ceil((r.waitUntilTick - state.tick) / TICK_HZ))}s`, select: 'wait', index: 0, enabled: false });
  else if (r.fuel < 1) rows.push({ text: 'Wait for help', select: 'wait', index: 0, enabled: true });
  else if (atExit(state)) rows.push(helm ? { text: HELM_OFFLINE_ROW, select: 'sector', index: EXIT_JUMP, enabled: false } : { text: exitText(state), select: 'sector', index: EXIT_JUMP, enabled: true });
  else for (const d of reachable(state)) rows.push(helm ? { text: HELM_OFFLINE_ROW, select: 'jump', index: beaconIndex(d.column, d.node), enabled: false } : { text: destinationLabel(state, d.column, d.node), select: 'jump', index: beaconIndex(d.column, d.node), enabled: true });
  rows.push(evadeRow(state));
  return rows;
}

/** Keep the cursor on an existing selectable row, else the first selectable row (0 if none) (spec Run-ii section 6). */
export function clampNavCursor(state: SimState): void {
  const nav = state.derived.stationOfKind[StationKind.Navigation]!; if (nav < 0) return;
  const rows = navRows(state), c = state.stations.cursor[nav]!;
  if (rows[c] && rows[c]!.select !== 'none') return;
  const first = rows.findIndex((row) => row.select !== 'none'); state.stations.cursor[nav] = first < 0 ? 0 : first;
}

const SELECT_CODE: Record<NavRow['select'], number> = { none: 0, choice: 1, buy: 2, jump: 3, sector: 4, wait: 5, evade: 6 };
/** A signature of the row list's (select, index) sequence (FNV-1a over 32 bits): equal lists, equal signatures; text and enabled do not count. */
function rowsSignature(rows: readonly NavRow[]): number {
  let h = 2166136261;
  for (const row of rows) { h = Math.imul(h ^ SELECT_CODE[row.select], 16777619) >>> 0; h = Math.imul(h ^ row.index, 16777619) >>> 0; }
  return h;
}
/** Remember the row list's signature and the cursor row's (select, index) (spec Demo-xi section 3). */
function noteNavCursor(state: SimState, nav: number, rows: readonly NavRow[]): void {
  const r = state.run, row = rows[state.stations.cursor[nav]!];
  r.navSig = rowsSignature(rows); r.navSelect = row ? SELECT_CODE[row.select] : 0; r.navIndex = row ? row.index : 0;
}
/** The cursor follows its row (spec Demo-xi section 3): when the row list changed since the last check, the cursor goes to the row with the remembered (select, index), else to row 0; then onto a selectable row (clampNavCursor's rule). Called at the end of every tick and before the officer's input. */
export function trackNavCursor(state: SimState): void {
  const nav = state.derived.stationOfKind[StationKind.Navigation]!; if (nav < 0) return;
  const r = state.run, rows = navRows(state);
  if (r.navSig >= 0 && rowsSignature(rows) !== r.navSig) {
    const k = rows.findIndex((row) => SELECT_CODE[row.select] === r.navSelect && row.index === r.navIndex && row.select !== 'none');
    state.stations.cursor[nav] = k >= 0 ? k : 0;
  }
  clampNavCursor(state);
  noteNavCursor(state, nav, rows);
}

/** Seated Navigation input: Up/Down move over the selectable rows, a Confirm edge acts on the row: choose, buy or (with a ready drive) jump (spec Run-ii section 6). */
export function navigationInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  trackNavCursor(state);
  const rows = navRows(state), c = state.stations.cursor, n = rows.length;
  if (!rows.some((row) => row.select !== 'none')) return;
  const stepTo = (delta: number) => { let k = c[i]!; do k = (k + delta + n) % n; while (rows[k]!.select === 'none'); c[i] = k; };
  if (dir === Dir.Up) stepTo(-1); else if (dir === Dir.Down) stepTo(1);
  noteNavCursor(state, i, rows);   // the officer's own move is the remembered row before any buy or vote this tick
  if (!confirm) return;
  const row = rows[c[i]!]!;
  if (row.select === 'choice' && row.enabled) { const pid = state.stations.occupant[i]!; if (pid >= 0 && state.run.vote[pid] !== row.index) { state.run.vote[pid] = row.index; state.run.voteTick = state.tick; } }   // the officer's vote (spec Coop-ii amendment D7)
  else if (row.select === 'buy' && row.enabled) { buy(state, row.index); clampNavCursor(state); }
  else if ((row.select === 'jump' || row.select === 'sector') && state.run.jumpCharge >= 1) requestJump(state, row.index);
  else if (row.select === 'wait' && row.enabled) startWait(state);
  else if (row.select === 'evade') startEvade(state);
}

/** The jump (spec Run-i section 6, Run-ii section 6): leave the encounter, keep the ship, arrive (scrap, maybe an event), re-arm the clocks, maybe win. A destination not reachable is a no-op. A Hazard node short of the last column is an encounter with contact in ENCOUNTER_START seconds; an Asteroid node a field starting then (spec Demo-viii section 1); Event and Shop nodes are quiet (spec Demo-vi section 2). */
export function jumpShip(state: SimState, destination: Beacon): void {
  const r = state.run;
  if (r.fuel < 1 || !canReach(state, destination)) return;
  r.node = destination.node; r.column = destination.column; r.pursuit += PURSUIT_STEP;
  afterJump(state);
}

/** The jump's common steps (spec Run-i section 6, Loop-i section 2): one fuel, the counters, the drive, arrival (scrap, maybe an event), the encounter left behind, the beacon's own encounter, the clocks. The exit is a Hazard on the way out except in the last sector; column 0 is quiet. */
function afterJump(state: SimState): void {
  const r = state.run, nav = state.derived.stationOfKind[StationKind.Navigation]!, last = r.colNodes.length - 1;
  r.fuel -= 1; r.nodesReached += 1; r.jumpCharge = 0; r.driveBoost = 0; r.jumpPending = -1; r.jumpPendingTick = -1; r.waitUntilTick = -1; r.pursuitFought = 0;
  if (r.wakeTick < 0) r.wakeTick = state.tick;   // the director wakes on the first jump (spec Loop-i section 4b)
  r.calm = r.column === 0 ? 1 : 0; r.visited[hereIndex(state)] = 1;
  if (nav >= 0) state.stations.cursor[nav] = 0;
  r.navSig = -1;   // a new beacon: row 0, no relocation by the old row (spec Demo-xi section 3)
  state.telemetry.jumps++;
  arrive(state);
  clearObjects(state);
  if (state.enemy.present) { state.enemy.surrenderIntact = 0; leave(state, false); }   // the ship left, not the enemy: a flee in progress counts as a flight, no surrender bounty (spec Demo-i section 11.3)
  else if (r.encounter === Encounter.Fighting || r.encounter === Encounter.Pending) endField(state);   // no enemy: leaving a field (or its approach) early, no reward (spec Demo-viii section 1)
  const type = r.finalBeacon ? NodeType.Hazard : r.column === 0 || (r.column === last && r.sector >= SECTORS - 1) ? -1 : r.nodeType[hereIndex(state)]!, hazard = type === NodeType.Hazard;   // the final beacon: the Warden's contact in ENCOUNTER_START seconds (spec Loop-iv section 1)
  r.encounter = hazard || type === NodeType.Asteroid ? Encounter.Pending : Encounter.None; r.encounterTick = state.tick; r.fieldNextTick = -1;
  state.enemy.nextArrivalTick = hazard ? state.tick + ENCOUNTER_START * TICK_HZ : NEVER;   // an asteroid field has no enemy: it starts in fieldSystem
  const sc = state.science; sc.system = 0; sc.systemState = 0; sc.systemStartTick = -1; sc.systemTick = -1; sc.systemResult = 0; r.ambushState = 0;   // one system scan per beacon visit (spec Demo-x-b section 3)
  const k = hereIndex(state);
  if (!r.finalBeacon && r.ambush[k] && !overrun(state, r.column) && (type === NodeType.Empty || type === NodeType.Event)) {   // a hidden ambusher, spent on arrival: contact AMBUSH_DELAY seconds later (spec Demo-x-b section 3)
    r.ambush[k] = 0; r.ambushState = 1; r.encounter = Encounter.Pending; r.encounterTick = state.tick; state.enemy.nextArrivalTick = state.tick + AMBUSH_DELAY * TICK_HZ;
  }
  if (overrun(state, r.column) && !peaceful(state)) startPursuitFight(state);   // the Pursuit replaces the beacon's own encounter (spec Loop-i amendment S5)
  if (activeBoarderCount(state) === 0) state.boarders.nextArrivalTick = state.tick + BOARDING_AFTER_JUMP * TICK_HZ;
  enterPhase(state, Phase.BuildUp);
}

/** The pursuit fight (spec Loop-i section 3): the normal encounter rules with contact in ENCOUNTER_START seconds; the enemy that arrives is the elite (enemy.ts reads pursuitFought). A field in progress stops with no reward. */
function startPursuitFight(state: SimState): void {
  const r = state.run;
  r.pursuitFought = 1; r.encounter = Encounter.Pending; r.encounterTick = state.tick; r.fieldNextTick = -1; r.ambushState = 0;   // the elite replaces any ambusher
  state.enemy.nextArrivalTick = state.tick + ENCOUNTER_START * TICK_HZ;
}
/** Step 5a (spec Loop-i section 3, amendment S5): once per beacon visit, the Pursuit overrunning the beacon you are at starts its fight, after any enemy already here has gone. */
export function pursuitSystem(state: SimState): void {
  const r = state.run;
  if (r.pursuitFought || state.enemy.present || peaceful(state) || !overrun(state, r.column)) return;
  startPursuitFight(state);
}

/** The sector jump from the exit (spec Loop-i section 1, amendments S1 and S4): one fuel; from the last sector it goes to the final beacon (spec Loop-iv section 1), else the next sector's map is drawn from rng.map in the same order, the pursuit resets and the ship arrives at column 0. A no-op away from the exit or without fuel. */
export function sectorJump(state: SimState): void {
  const r = state.run;
  if (r.fuel < 1 || !atExit(state)) return;
  if (r.sector >= SECTORS - 1) { r.finalBeacon = 1; afterJump(state); return; }   // engage the Warden: the jump to the final beacon (spec Loop-iv section 1)
  const map = generateMap(state.rng.map, r.colNodes.length);
  r.colNodes.set(map.colNodes); r.edgeMask.set(map.edgeMask); r.nodeType.set(map.nodeType); r.ambush.set(map.ambush); r.cache.set(map.cache); r.revealed.fill(0); r.visited.fill(0); r.eventsSeen = 0;   // a new sector may draw any event again (spec Loop-v section 2)
  r.sector += 1; r.column = 0; r.node = 0; r.pursuit = PURSUIT_START;
  afterJump(state);
}

/** Wait for help (spec Loop-i section 2, amendment S2): only with no fuel and no wait running; it ends WAIT_SECONDS later. False when it cannot start. */
export function startWait(state: SimState): boolean {
  const r = state.run;
  if (r.fuel >= 1 || r.waitUntilTick >= 0 || r.finalBeacon) return false;
  r.waitUntilTick = state.tick + WAIT_SECONDS * TICK_HZ; return true;
}
/** The wait's end: the pursuit steps once, then one rng.loot draw: below WAIT_FUEL_CHANCE a passing trader gives WAIT_FUEL fuel, else nothing. */
function waitStep(state: SimState): void {
  const r = state.run;
  if (r.waitUntilTick < 0 || state.tick < r.waitUntilTick) return;
  r.waitUntilTick = -1; r.pursuit += PURSUIT_STEP;
  if (nextFloat(state.rng.loot) < WAIT_FUEL_CHANCE) r.fuel += WAIT_FUEL;
  clampNavCursor(state);
}

/** Leaving a field early (spec Demo-viii section 1): the encounter is over with no reward and the field clock stops. */
export function endField(state: SimState): void {
  const r = state.run; r.encounter = Encounter.Over; r.encounterTick = state.tick; r.fieldNextTick = -1;
}

/** The asteroid field (spec Demo-viii section 1), right after the director: at an Asteroid node the field starts ENCOUNTER_START seconds after the jump (Pending -> Fighting); while fighting one rock is due every FIELD_INTERVAL seconds (re-armed with one hazards draw) until FIELD_SECONDS after the start; FIELD_CLEAR_EXTRA seconds later every rock is down and the field is cleared: a win with scrap and the drive boost. A full debris table skips a rock without its spawn draws. */
export function fieldSystem(state: SimState): void {
  const r = state.run;
  if (r.column >= r.colNodes.length - 1 || contentOf(state) !== NodeType.Asteroid || state.enemy.present) return;
  if (r.encounter === Encounter.Pending && state.tick >= r.encounterTick + ENCOUNTER_START * TICK_HZ) { r.encounter = Encounter.Fighting; r.encounterTick = state.tick; r.fieldNextTick = state.tick; }
  if (r.encounter !== Encounter.Fighting) return;
  const start = r.encounterTick;
  if (state.tick >= start + (FIELD_SECONDS + FIELD_CLEAR_EXTRA) * TICK_HZ) {
    r.encounter = Encounter.Won; r.encounterTick = state.tick; r.fieldNextTick = -1; r.driveBoost = 1; state.telemetry.encountersWon++; addScrap(state, scrapField(depthOf(state))); r.fuel += FIELD_FUEL;   // a cleared field gives fuel (spec Loop-i section 2)
    return;
  }
  if (r.fieldNextTick < 0 || state.tick < r.fieldNextTick) return;
  if (state.tick >= start + FIELD_SECONDS * TICK_HZ) { r.fieldNextTick = -1; return; }   // spawning has stopped: no draw
  spawnFieldRock(state);                                                                 // -1 with a full table, and no draw
  const u = nextFloat(state.rng.hazards);
  r.fieldNextTick = state.tick + Math.round(FIELD_INTERVAL * TICK_HZ * (1 + FIELD_JITTER * (2 * u - 1)));
}

/** The pilot's jump (spec Coop-ii section 3): alone (one conscious crew member) it jumps at once; otherwise it waits CONFIRM_SECONDS for a standing crew member's Confirm. A pilot's Confirm while one waits changes nothing. */
export function requestJump(state: SimState, destination: number): void {
  const r = state.run;
  if (consciousCount(state) <= 1) { doJump(state, destination); return; }
  if (r.jumpPending >= 0 || r.fuel < 1 || (destination === EXIT_JUMP ? !atExit(state) : !canReach(state, beaconAt(destination)))) return;
  r.jumpPending = destination; r.jumpPendingTick = state.tick;
}

/** The event's choice from the votes (spec Coop-ii amendments D6 and D8, for two or three options since Loop-v): votes of conscious players for enabled options; the majority, ties to the seated Navigation officer's vote when it is among the tied, else the lowest tied index; none at all: the safe choice. */
export function tallyVotes(state: SimState): { choice: number; voters: number; unanimous: boolean } {
  const r = state.run, counts = EVENT_DEFS[r.event]!.choices.map(() => 0);
  for (let pid = 0; pid < state.playerCount; pid++) { const v = r.vote[pid]!; if (v >= 0 && Life.state[state.crew[pid]!] === LifeState.Conscious && choiceEnabled(state, r.event, v)) counts[v]!++; }
  const voters = counts.reduce((a, b) => a + b, 0), top = Math.max(...counts), tied = counts.filter((c) => c === top).length;
  if (voters === 0) return { choice: EVENT_DEFS[r.event]!.safeChoice, voters, unanimous: false };
  if (tied === 1) return { choice: counts.indexOf(top), voters, unanimous: top === voters };
  const nav = state.derived.stationOfKind[StationKind.Navigation]!, officer = nav >= 0 ? state.stations.occupant[nav]! : -1;
  const ov = officer >= 0 && Life.state[state.crew[officer]!] === LifeState.Conscious ? r.vote[officer]! : -1;
  return { choice: ov >= 0 && choiceEnabled(state, r.event, ov) && counts[ov] === top ? ov : counts.indexOf(top), voters, unanimous: false };
}

/** Step 2a, the single decision point (spec Coop-ii section 3): standing Confirms vote (the first press option 1, then toggling); a vote of a crew member who is not conscious is discarded; the event waits for the first vote (spec Demo-x-b section 2), then resolves when every conscious player has an enabled vote unchanged for VOTE_SETTLE seconds, or VOTE_SECONDS after the first vote. A pending jump goes on a standing Confirm (or once the pilot is the only one conscious) and lapses after CONFIRM_SECONDS. */
/** A jump by its row code: a beacon index, or EXIT_JUMP for the sector jump. */
function doJump(state: SimState, code: number): void { if (code === EXIT_JUMP) sectorJump(state); else jumpShip(state, beaconAt(code)); }

export function decisionSystem(state: SimState): void {
  const r = state.run;
  waitStep(state);   // the wait for help ends (spec Loop-i section 2)
  if (r.event >= 0 && r.eventChoice < 0) {
    for (let pid = 0; pid < state.playerCount; pid++) {
      if (state.scratch.votePress[pid]) { r.vote[pid] = (r.vote[pid]! + 1) % EVENT_DEFS[r.event]!.choices.length; r.voteTick = state.tick; }   // option 1 first, then round the options (spec Loop-v: two or three)
      if (Life.state[state.crew[pid]!] !== LifeState.Conscious) r.vote[pid] = -1;
    }
    if (r.eventOpenTick < 0 && r.vote.some((v) => v >= 0)) r.eventOpenTick = state.tick;   // the event waits for the crew: the limit starts at the first vote, a standing press or the officer's row (spec Demo-x-b section 2)
    let all = consciousCount(state) > 0;
    for (let pid = 0; pid < state.playerCount; pid++) if (Life.state[state.crew[pid]!] === LifeState.Conscious && !(r.vote[pid]! >= 0 && choiceEnabled(state, r.event, r.vote[pid]!))) all = false;
    if (r.eventOpenTick >= 0 && ((all && state.tick - r.voteTick >= VOTE_SETTLE * TICK_HZ) || state.tick >= r.eventOpenTick + VOTE_SECONDS * TICK_HZ)) {
      const t = tallyVotes(state);
      if (t.voters >= 2) { if (t.unanimous) state.telemetry.votesUnanimous++; else state.telemetry.votesSplit++; }
      resolveEvent(state, t.choice); r.vote.fill(-1); r.voteTick = -1; clampNavCursor(state);
    }
  }
  if (r.jumpPending >= 0) {
    if (state.scratch.jumpConfirm.some((v) => v === 1) || consciousCount(state) <= 1) { if (r.jumpCharge >= 1) doJump(state, r.jumpPending); else { r.jumpPending = -1; r.jumpPendingTick = -1; } }
    else if (state.tick >= r.jumpPendingTick + CONFIRM_SECONDS * TICK_HZ) { r.jumpPending = -1; r.jumpPendingTick = -1; }
  }
}
