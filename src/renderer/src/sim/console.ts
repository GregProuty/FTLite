import type { Intent } from '../../../shared/intent';
import type { SimState } from './state';
import { Seated } from './components';
import { StationKind, STATION_COUNT } from './stationKinds';
import { intentFor } from './step';
import { standUp, selectTab } from './stations';
import { shiftBar, shedPower, buyUpgrade, buyReactor, upgradeRows, REACTOR_ROW, BACK_ROW } from './power';
import { cycleCoolant } from './heat';
import { toggleSeal, cycleDoor, doorsCursorCount, doorsCursorTarget } from './doors';
import { stationOnline } from './stations';
import { STICK_EDGE_THRESHOLD, STICK_REPEAT_TICKS } from './tuning';

import { Dir } from './dir';
import { chargeBeam, weaponsInput } from './weapons';
import { scienceInput, scanStep, systemScanStep } from './science';
import { navigationInput, navRows } from './run';
import { canSwap, SWAP_SLOT } from './weapons';
import { warnedTargets } from './debrisTargets';
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

/** The power page's UPGRADES row (spec Loop-ii rule U2): after the station kinds. */
export const UPGRADES_ROW = STATION_COUNT;

/** Engineering input (spec Loop-ii rule U2). Power page: rows 0..STATION_COUNT (the last is UPGRADES); Left/Right route bars and Confirm cycles coolant on a station row, Confirm on UPGRADES opens the Upgrades page. Upgrades page: Up/Down over upgradeRows, Confirm buys or goes BACK, Left/Right inert. */
function engineeringInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  const c = state.stations.cursor;
  if (state.stations.page[i] === 1) {
    const rows = upgradeRows(state), n = rows.length, at = Math.max(0, rows.indexOf(c[i]!));
    if (dir === Dir.Up) c[i] = rows[(at + n - 1) % n]!;
    else if (dir === Dir.Down) c[i] = rows[(at + 1) % n]!;
    if (!confirm) return;
    const row = c[i]!;
    if (row === BACK_ROW) { state.stations.page[i] = 0; c[i] = UPGRADES_ROW; }
    else if (stationOnline(state, i)) { if (row === REACTOR_ROW) buyReactor(state); else buyUpgrade(state, row); }   // spec Loop-ii rule U4: only at an online Engineering
    return;
  }
  const n = STATION_COUNT + 1;
  if (dir === Dir.Up) c[i] = (c[i]! + n - 1) % n;
  else if (dir === Dir.Down) c[i] = (c[i]! + 1) % n;
  else if ((dir === Dir.Right || dir === Dir.Left) && c[i]! < STATION_COUNT) {
    const target = state.derived.stationOfKind[c[i]!]!;
    if (target >= 0 && shiftBar(state, target, dir === Dir.Right ? 1 : -1)) state.skills.lastEngChangeTick = state.tick;
  }
  if (!confirm) return;
  if (c[i] === UPGRADES_ROW) { state.stations.page[i] = 1; c[i] = upgradeRows(state)[0]!; return; }
  if (cycleCoolant(state, state.derived.stationOfKind[c[i]!]!)) state.skills.lastEngChangeTick = state.tick;   // spec 2b-i section 5: the cursor's station after this tick's stick edge
}

function doorsInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  const n = doorsCursorCount(state), c = state.stations.cursor;
  if (c[i]! < 0 || n === 0) return;                                   // a ship without doors or airlocks
  if (dir === Dir.Up || dir === Dir.Left) c[i] = (c[i]! + n - 1) % n;
  else if (dir === Dir.Down || dir === Dir.Right) c[i] = (c[i]! + 1) % n;
  if (!confirm) return;
  const t = doorsCursorTarget(state, c[i]!), online = stationOnline(state, i);
  if (!t) return;
  // Online: a door cycles Auto -> Held open -> Sealed -> Auto and an airlock toggles. Offline: today's seal toggle on doors only (spec Demo-vii amendment 2).
  if (t.kind === 'door') (online ? state.scratch.doorCycles : state.scratch.doorToggles).add(t.edge);
  else if (online) state.scratch.airlockToggles.add(t.index);
  else return;
  state.skills.lastDoorToggleTick = state.tick;
}

/** Whether a console's cursor is on its first row, so Up leaves for a console group's tab bar (spec Demo-x-a section 1). An offline console counts as on its first row. */
export function atFirstRow(state: SimState, i: number): boolean {
  if (!stationOnline(state, i)) return true;
  const c = state.stations.cursor[i]!;
  switch (state.derived.stationKind[i]) {
    case StationKind.Navigation: { const first = navRows(state).findIndex((row) => row.select !== 'none'); return first < 0 || c <= first; }
    case StationKind.Weapons: { const list = canSwap(state) ? [...warnedTargets(state), SWAP_SLOT] : warnedTargets(state); return list.indexOf(c) <= 0; }
    case StationKind.Science: return [...warnedTargets(state, false), -1].indexOf(c < 0 ? -1 : c) <= 0;
    case StationKind.Engineering: return state.stations.page[i] === 1 ? upgradeRows(state).indexOf(c) <= 0 : c <= 0;
    case StationKind.Doors: return c <= 0;
    default: return true;
  }
}

/** A seated player's stick at a console group (spec Demo-x-a section 1): on the tab bar Left/Right switch the active tab (wrapping) and Down returns to the rows; Up on the first row enters the bar. Returns whether the tab bar took the input. */
function tabInput(state: SimState, pid: number, g: number, i: number, dir: number): boolean {
  const gr = state.groups;
  if (gr.bar[g]) {
    const n = state.derived.groupStations[g]!.length;
    if (dir === Dir.Left || dir === Dir.Right) selectTab(state, pid, g, (gr.tab[g]! + (dir === Dir.Right ? 1 : n - 1)) % n);
    else if (dir === Dir.Down) gr.bar[g] = 0;
    return true;
  }
  if (dir === Dir.Up && atFirstRow(state, i)) { gr.bar[g] = 1; return true; }
  return !stationOnline(state, i);   // an offline tab takes no input but the way to the bar
}

/** Step 2: seated players' input, then the tick's door commands once each, ascending: local toggles, remote cycles, airlocks (spec sections 4, 6; Demo-vii amendment 2). */
export function consoleSystem(state: SimState, intents: readonly Intent[]): void {
  chargeBeam(state);
  regenTorpedo(state);
  loadTorpedo(state);
  scanStep(state);
  systemScanStep(state);   // the system scan (spec Demo-x-b section 3)
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!, i = Seated.station[eid]!;
    if (i < 0 || state.scratch.satThisTick[pid]) continue;              // players who sat this tick act from the next tick
    const it = intentFor(intents, pid);
    if (it.cancelPressed || it.interactPressed) { standUp(state, pid); shedPower(state); state.scratch.stoodThisTick[pid] = 1; continue; }   // standing consumes the tick's stick input
    const dir = stickEdge(state, pid, it.moveX, it.moveY);
    const g = state.derived.stationGroup[i]!;
    if (g >= 0 && tabInput(state, pid, g, i, dir)) continue;   // the tab bar consumes the tick's stick input and Confirm
    const kind = state.derived.stationKind[i]!, confirm = it.confirmPressed && !state.scratch.confirmUsed[pid];   // an agreement or a vote took the press (spec Demo-xi sections 1-2)
    if (kind === StationKind.Engineering) engineeringInput(state, i, dir, confirm);
    else if (kind === StationKind.Doors) doorsInput(state, i, dir, confirm);
    else if (kind === StationKind.Weapons) weaponsInput(state, i, dir, confirm);
    else if (kind === StationKind.Science) scienceInput(state, i, dir, confirm);
    else if (kind === StationKind.Navigation) navigationInput(state, i, dir, confirm);
    // Life Support, Medbay: no seated controls.
  }
  const asc = (set: Set<number>): number[] => [...set].sort((a, b) => a - b);
  for (const e of asc(state.scratch.doorToggles)) toggleSeal(state, e);          // local Interact and offline console presses
  for (const e of asc(state.scratch.doorCycles)) cycleDoor(state, e);
  for (const a of asc(state.scratch.airlockToggles)) state.airlocks.open[a] = state.airlocks.open[a] ? 0 : 1;
}
