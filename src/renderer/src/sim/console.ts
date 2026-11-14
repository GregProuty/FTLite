import { applyConsoleCommand, commandResult, legacyCardReason, type MigrationTickInput } from './commands';
import type { SimState } from './state';
import { StationKind, STATION_COUNT } from './stationKinds';
import { shiftBar, buyUpgrade, buyReactor, upgradeRows, REACTOR_ROW, BACK_ROW } from './power';
import { cycleCoolant } from './heat';
import { toggleSeal, cycleDoor, doorsCursorCount, doorsCursorTarget } from './doors';
import { stationOnline } from './stations';

import { Dir } from './dir';
import { chargeBeam, weaponsInput } from './weapons';
import { scienceInput, scanStep, systemScanStep } from './science';
import { navigationInput } from './run';
import { regenTorpedo, loadTorpedo } from './torpedoes';

export { Dir };

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

/** Step 2: seated players' input, then the tick's door commands once each, ascending: local toggles, remote cycles, airlocks (spec sections 4, 6; Demo-vii amendment 2). */
export function consoleSystem(state: SimState, input: MigrationTickInput): void {
  chargeBeam(state);
  regenTorpedo(state);
  loadTorpedo(state);
  scanStep(state);
  systemScanStep(state);   // the system scan (spec Demo-x-b section 3)
  const resolved = new Set(state.scratch.commandResults.map(r => `${r.id.player}:${r.id.sequence}`));
  for (let pid = 0; pid < state.playerCount; pid++) {
    let consumed = false;
    const entries = [...input.commands, ...input.legacyCardInput].filter(e => e.id.player === pid).sort((a,b) => a.id.sequence-b.id.sequence);
    for (const envelope of entries) {
      if (resolved.has(`${pid}:${envelope.id.sequence}`)) continue;
      if (consumed) { state.scratch.commandResults.push(commandResult(state, envelope, 'invalid-seat')); continue; }
      if (!('kind' in envelope)) {
        const result = applyConsoleCommand(state, envelope); state.scratch.commandResults.push(result);
        if (result.status === 'applied' && (envelope.command.kind === 'stand' || envelope.command.kind === 'tab')) consumed = true;
        continue;
      }
      const reason = legacyCardReason(state, envelope, true);
      state.scratch.commandResults.push(commandResult(state, envelope, reason));
      if (reason) continue;
      const i = envelope.input.station, dir = envelope.input.direction, confirm = envelope.input.confirm && !state.scratch.confirmUsed[pid];
      const kind = state.derived.stationKind[i]!;
      if (kind === StationKind.Engineering) engineeringInput(state, i, dir, confirm);
      else if (kind === StationKind.Doors) doorsInput(state, i, dir, confirm);
      else if (kind === StationKind.Weapons) weaponsInput(state, i, dir, confirm);
      else if (kind === StationKind.Science) scienceInput(state, i, dir, confirm);
      else if (kind === StationKind.Navigation) navigationInput(state, i, dir, confirm);
    }
  }
  const asc = (set: Set<number>): number[] => [...set].sort((a, b) => a - b);
  for (const e of asc(state.scratch.doorToggles)) toggleSeal(state, e);          // local Interact and offline console presses
  for (const e of asc(state.scratch.doorCycles)) cycleDoor(state, e);
  for (const a of asc(state.scratch.airlockToggles)) state.airlocks.open[a] = state.airlocks.open[a] ? 0 : 1;
}
