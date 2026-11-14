import { WEAPON_ITEM } from '../sim/shop';
import type { Command, CommandEnvelope, CommandResult, EventRef, HeldFrame, LegacyInputEnvelope, RunId, VisitRef } from '../net/contracts';
import type { SimState } from '../sim/state';
import { NEUTRAL_FRAME, type InputFrame } from './inputFrame';
import { Life, LifeState, Seated } from '../sim/components';
import { ConfirmKind, confirmTarget } from '../sim/interact';
import { Dir } from '../sim/dir';
import { STICK_EDGE_THRESHOLD, STICK_REPEAT_TICKS } from '../sim/tuning';
import { eventRef, navigationOfficer, visitRef } from '../sim/commands';
import { EVENT_DEFS } from '../sim/events';
import { StationKind, STATION_COUNT, STATION_NAMES } from '../sim/stationKinds';
import { stationOnline } from '../sim/stations';
import { navRows } from '../sim/run';
import { canSwap, swapSlot, selectorList, weaponRef } from '../sim/weapons';
import { warnedTargets, targetRef, weaponsTargetSlot, scienceTargetSlot } from '../sim/debrisTargets';
import { upgradeRows, REACTOR_ROW, BACK_ROW, canUpgrade, canBuyReactor } from '../sim/power';
import { doorsCursorCount, doorsCursorTarget } from '../sim/doors';

export interface CardUiState {
  runId: RunId;
  players: { nextSequence: number; heldSequence: number; heldDir: number; repeat: number; lastTick: number; botDecisionTick?: number; seat: number; pendingVoteSequence: number; pendingVoteTick: number; pendingVote: { event: EventRef; choice: number } | null }[];
  stations: { rowKey: string | null; page: 'main' | 'upgrades' }[];
  groupBar: boolean[];
  navigationVisit: VisitRef | null;
}
export interface ClientActions { held: HeldFrame[]; commands: CommandEnvelope[]; legacyCardInput: LegacyInputEnvelope[] }
export interface CardRow { key: string; enabled: boolean; text: string; action: Command | null }
export function cardRows(view: SimState, station: number, ui?: CardUiState): readonly CardRow[] {
  const kind = view.derived.stationKind[station], online = stationOnline(view, station), available = online || view.derived.stationGroup[station]! < 0;
  if (kind === StationKind.Navigation) return navRows(view).map((row, index): CardRow => {
    const visit = visitRef(view);
    const action: Command | null = row.select === 'choice' ? { kind: 'vote', event: eventRef(view), choice: row.index }
      : row.select === 'buy' ? { kind: 'buy', station, visit, item: row.index, expectedOffer: row.index === WEAPON_ITEM ? view.run.shopWeapon : 0 }
      : row.select === 'jump' ? { kind: 'jump', station, visit, destination: row.index }
      : row.select === 'sector' ? { kind: 'sectorJump', station, visit }
      : row.select === 'wait' ? { kind: 'wait', station, visit }
      : row.select === 'evade' ? { kind: 'evade', station } : null;
    return { key: row.select === 'none' ? `text:${index}` : `${row.select}:${row.index}`, text: row.text, enabled: row.enabled, action };
  });
  if (kind === StationKind.Engineering) {
    if (ui?.stations[station]?.page === 'upgrades') return upgradeRows(view).map(system => system === BACK_ROW ? { key: 'back', text: 'BACK', enabled: true, action: null } : system === REACTOR_ROW ? { key: 'reactor', text: 'Reactor', enabled: online && canBuyReactor(view), action: { kind: 'buyReactor', station, expectedBonus: view.run.reactorBonus } } : { key: `upgrade:${system}`, text: STATION_NAMES[system]!, enabled: online && canUpgrade(view, system), action: { kind: 'buyUpgrade', station, system, expectedLevel: view.run.upgrades[system]! } });
    return [...Array.from({ length: STATION_COUNT }, (_, system): CardRow => { const target = view.derived.stationOfKind[system]!; return { key: target >= 0 ? `station:${target}` : `missing:${system}`, text: STATION_NAMES[system]!, enabled: available && target >= 0, action: target >= 0 ? { kind: 'coolant', station, target } : null }; }), { key: 'upgrades', text: 'UPGRADES', enabled: true, action: null }];
  }
  if (kind === StationKind.Doors) return Array.from({ length: doorsCursorCount(view) }, (_, row): CardRow => { const target = doorsCursorTarget(view, row)!; return target.kind === 'door' ? { key: `door:${target.edge}`, text: `Door ${target.edge}`, enabled: available, action: { kind: 'doorCycle', station, edge: target.edge, mode: online ? 'cycle' : 'seal' } } : { key: `airlock:${target.index}`, text: `Airlock ${target.index}`, enabled: online, action: { kind: 'airlockToggle', station, airlock: target.index } }; });
  if (kind === StationKind.Science) return [
    ...warnedTargets(view, false).map((slot): CardRow => { const target = targetRef(view, slot)!; return { key: target.kind === 'object' ? `object:${target.stableId}` : `enemy:${target.stableId}:${target.room}`, text: `Target ${target.stableId}`, enabled: available, action: { kind: 'selectTarget', station, target } }; }),
    { key: 'system', text: 'Scan system', enabled: online, action: { kind: 'systemScan', station, visit: visitRef(view) } }
  ];
  if (kind === StationKind.Weapons) {
    const rows: CardRow[] = warnedTargets(view).map(slot => { const target = targetRef(view, slot)!; return { key: target.kind === 'object' ? `object:${target.stableId}` : `enemy:${target.stableId}:${target.room}`, text: `Target ${target.stableId}`, enabled: available, action: { kind: 'selectTarget', station, target } }; });
    if (canSwap(view)) { const slot = swapSlot(view); rows.push({ key: 'swap', text: 'SWAP', enabled: available, action: { kind: 'swapCargo', station, slot, expectedCargo: view.weapons.cargo, expectedEquipped: view.weapons.slot[slot]! } }); }
    return rows;
  }
  return [];
}
/** Stable-key fallback is independent of retained canonical UI slots. */
export function cardRowIndex(view: SimState, station: number, ui?: CardUiState): number {
  const rows = cardRows(view, station, ui), key = ui?.stations[station]?.rowKey, found = rows.findIndex(row => row.key === key);
  if (view.derived.stationKind[station] === StationKind.Weapons) {
    const slot = weaponsTargetSlot(view);
    if (slot >= 0) return warnedTargets(view).indexOf(slot);
    return key === 'swap' && canSwap(view) ? rows.length - 1 : -1;
  }
  if (view.derived.stationKind[station] === StationKind.Science) { const slot = scienceTargetSlot(view); return slot < 0 ? rows.length - 1 : warnedTargets(view, false).indexOf(slot); }
  if (view.derived.stationKind[station] === StationKind.Navigation) return found >= 0 && rows[found]!.action ? found : rows.findIndex(row => row.action !== null);
  if (found >= 0) return found;
  return view.derived.stationKind[station] === StationKind.Engineering && ui?.stations[station]?.page !== 'upgrades' ? StationKind.Engineering : rows.length ? 0 : -1;
}
export function createCardUiState(runId: RunId, players: number): CardUiState {
  return { runId, players: Array.from({ length: players }, () => ({ nextSequence: 1, heldSequence: 0, heldDir: Dir.None, repeat: 0, lastTick: -1, seat: -1, pendingVoteSequence: 0, pendingVoteTick: -1, pendingVote: null })), stations: [], groupBar: [], navigationVisit: null };
}
export function createCardUi(runId = ''): CardUiState { return createCardUiState(runId, 0); }
export function pauseActions(ui: CardUiState, player: number, tick: number, paused: boolean): ClientActions {
  const producer = ui.players[player];
  if (!producer || !Number.isSafeInteger(producer.nextSequence)) throw new Error('input sequence exhausted');
  return { held: [], legacyCardInput: [], commands: [{ runId: ui.runId, id: { player, sequence: producer.nextSequence++ }, requestedTick: tick, command: { kind: 'setPaused', paused } }] };
}
const sameEvent = (a: EventRef, b: EventRef): boolean => a.eventId === b.eventId && a.visit.sector === b.visit.sector && a.visit.beacon === b.visit.beacon && a.visit.arrivalTick === b.visit.arrivalTick;
/** Reconcile completed publications without mutating gameplay or advancing repeats. */
export function reconcileCardUi(view: SimState, ui: CardUiState): void {
  while (ui.stations.length < view.derived.stationKind.length) ui.stations.push({ rowKey: null, page: 'main' });
  const visit = visitRef(view), previous = ui.navigationVisit;
  const changed = !previous || previous.sector !== visit.sector || previous.beacon !== visit.beacon || previous.arrivalTick !== visit.arrivalTick;
  const nav = view.derived.stationOfKind[StationKind.Navigation]!;
  if (nav >= 0) {
    const memory = ui.stations[nav]!;
    if (changed) memory.rowKey = null;
    memory.rowKey = cardRows(view, nav, ui)[cardRowIndex(view, nav, ui)]?.key ?? null;
  }
  ui.navigationVisit = visit;
}
/** Publications reconcile lifecycle/acknowledgments without advancing repeat. */
export function reconcileUi(view: SimState, ui: CardUiState, runId: RunId, water: readonly number[]): void {
  if (ui.runId !== runId) Object.assign(ui, createCardUiState(runId, view.playerCount));
  while (ui.stations.length < view.derived.stationKind.length) ui.stations.push({ rowKey: null, page: 'main' });
  for (let p = 0; p < view.playerCount; p++) {
    ui.players[p] ??= createCardUiState(runId, 1).players[0]!;
    const producer = ui.players[p]!, seat = Seated.station[view.crew[p]!]!;
    producer.nextSequence = Math.max(producer.nextSequence, (water[p] ?? 0) + 1);
    if (seat !== producer.seat && (seat < 0 || producer.seat < 0)) {
      producer.heldDir = Dir.None; producer.repeat = 0; producer.lastTick = -1;
      for (const i of [producer.seat, seat]) if (i >= 0) {
        const group = view.derived.stationGroup[i]!; if (group >= 0) ui.groupBar[group] = false;
        for (const member of group >= 0 ? view.derived.groupStations[group]! : [i]) ui.stations[member] = { rowKey: null, page: 'main' };
      }
    }
    producer.seat = seat;
    // Admission high-water alone is insufficient: pause can publish an unexecuted tick.
    if (producer.pendingVote && (view.run.event < 0 || view.run.eventChoice >= 0 || !sameEvent(producer.pendingVote.event, eventRef(view)) || ((water[p] ?? 0) >= producer.pendingVoteSequence && view.tick > producer.pendingVoteTick))) producer.pendingVote = null;
  }
  while (ui.groupBar.length < view.groups.tab.length) ui.groupBar.push(false);
  reconcileCardUi(view, ui);
  // Automatic aim acquisition supersedes the old local SWAP highlight. Keep
  // intentional SWAP focus only while the authority still has no target.
  const weapons = view.derived.stationOfKind[StationKind.Weapons]!, target = view.weapons.target;
  if (weapons >= 0 && view.stations.occupant[weapons]! >= 0 && target) ui.stations[weapons]!.rowKey = target.kind === 'object' ? `object:${target.stableId}` : `enemy:${target.stableId}:${target.room}`;
}
/** Rejections are terminal without a publication; applied results may precede state.
 * Only the matching vote ID can retire the latest optimistic choice here.
 */
export function reconcileCommandResult(ui: CardUiState, result: CommandResult): void {
  const producer = ui.players[result.id.player];
  if (result.status === 'rejected' && producer?.pendingVote && result.id.sequence === producer.pendingVoteSequence) producer.pendingVote = null;
}
/** Client-owned 0.5 threshold, horizontal tie, and eight-tick repeat. */
export function stickEdge(ui: CardUiState, pid: number, moveX: number, moveY: number, tick = ui.players[pid]!.lastTick + 1): Dir {
  const ax = Math.abs(moveX), ay = Math.abs(moveY);
  const dir = ax < STICK_EDGE_THRESHOLD && ay < STICK_EDGE_THRESHOLD ? Dir.None : ax >= ay ? (moveX > 0 ? Dir.Right : Dir.Left) : (moveY > 0 ? Dir.Down : Dir.Up);
  const p = ui.players[pid]!;
  if (tick <= p.lastTick) return Dir.None;
  const elapsed = p.lastTick < 0 ? 1 : tick - p.lastTick; p.lastTick = tick;
  if (dir === Dir.None) { p.heldDir = Dir.None; p.repeat = 0; return Dir.None; }
  if (dir !== p.heldDir) { p.heldDir = dir; p.repeat = STICK_REPEAT_TICKS; return dir; }
  p.repeat -= elapsed;
  if (p.repeat <= 0) { p.repeat = STICK_REPEAT_TICKS + p.repeat % STICK_REPEAT_TICKS; return dir; }
  return Dir.None;
}
export { Dir };
/** Up from the first selectable card row enters the group tab bar. */
export function atFirstRow(state: SimState, i: number, ui?: CardUiState): boolean {
  if (!stationOnline(state, i)) return true;
  const first = state.derived.stationKind[i] === StationKind.Navigation ? cardRows(state, i, ui).findIndex(row => row.action !== null) : 0;
  return cardRowIndex(state, i, ui) <= first;
}
/** Translate only completed state plus client memory. Held movement/Interact remain raw. */
export function translateTick(view: SimState, ui: CardUiState, frames: readonly InputFrame[], tick: number, players?: readonly number[]): ClientActions {
  const out: ClientActions = { held: [], commands: [], legacyCardInput: [] };
  for (let player = 0; player < view.playerCount; player++) {
    if (players && !players.includes(player)) continue;
    const f = frames[player] ?? NEUTRAL_FRAME, producer = ui.players[player]!;
    const sequence = (): number => { if (!Number.isSafeInteger(producer.nextSequence)) throw new Error('input sequence exhausted'); return producer.nextSequence++; };
    const emit = (command: Command): void => { out.commands.push({ runId: ui.runId, id: { player, sequence: sequence() }, requestedTick: tick, command }); };
    if (!Number.isSafeInteger(producer.heldSequence + 1)) throw new Error('input sequence exhausted');
    out.held.push({ runId: ui.runId, player, tick, sequence: ++producer.heldSequence, held: { moveX: f.moveX, moveY: f.moveY, interactHeld: f.interactHeld } });
    const eid = view.crew[player]!, seat = Seated.station[eid]!;
    if (Life.state[eid] !== LifeState.Conscious) continue;
    const navOfficer = navigationOfficer(view), override = seat < 0 || player !== navOfficer;
    let confirm = f.confirmPresses > 0;
    if (confirm && override && view.run.event >= 0 && view.run.eventChoice < 0) {
      const event = eventRef(view), previous = producer.pendingVote && sameEvent(event, producer.pendingVote.event) ? producer.pendingVote.choice : view.run.vote[player]!;
      const choice = (previous + 1) % EVENT_DEFS[view.run.event]!.choices.length;
      emit({ kind: 'vote', event, choice }); producer.pendingVote = { event, choice }; producer.pendingVoteSequence = producer.nextSequence - 1; producer.pendingVoteTick = tick; confirm = false;
    } else if (confirm && override && view.run.jumpPending >= 0) {
      emit({ kind: 'jumpAgree', pending: { visit: visitRef(view), requestedAtTick: view.run.jumpPendingTick, destination: view.run.jumpPending } }); confirm = false;
    }
    if (seat < 0) {
      if (confirm) { const target = confirmTarget(view, player); if (target.kind === ConfirmKind.Door) emit({ kind: 'toggleDoorLocal', edge: target.index }); else if (target.kind === ConfirmKind.Console) emit({ kind: 'sit', station: target.index }); }
      continue;
    }
    if (f.cancelPresses > 0 || f.interactPresses > 0) { emit({ kind: 'stand' }); continue; }
    // A repeated producer call for the same tick cannot invent a second direction edge.
    const dir = stickEdge(ui, player, f.moveX, f.moveY, tick);
    const group = view.derived.stationGroup[seat]!;
    if (group >= 0) {
      if (ui.groupBar[group]) {
        const members = view.derived.groupStations[group]!;
        if (dir === Dir.Left || dir === Dir.Right) emit({ kind: 'tab', group, station: members[(view.groups.tab[group]! + (dir === Dir.Right ? 1 : members.length - 1)) % members.length]! });
        else if (dir === Dir.Down) ui.groupBar[group] = false;
        continue;
      }
      if (dir === Dir.Up && atFirstRow(view, seat, ui)) { ui.groupBar[group] = true; continue; }
      if (!stationOnline(view, seat)) continue;
    }
    const kind = view.derived.stationKind[seat]!;
    if (kind === StationKind.Science) {
      const rows = cardRows(view, seat, ui); let index = cardRowIndex(view, seat, ui);
      if (dir === Dir.Up || dir === Dir.Down) {
        index = index < 0 ? 0 : (index + (dir === Dir.Up ? rows.length - 1 : 1)) % rows.length;
        const action = rows[index]!.action;
        emit({ kind: 'selectTarget', station: seat, target: action?.kind === 'selectTarget' ? action.target : null });
      }
      const row = rows[index]; ui.stations[seat]!.rowKey = row?.key ?? null;
      if (confirm && row?.action) {
        const action = row.action;
        if (action.kind === 'systemScan') emit(action);
        else if (action.kind === 'selectTarget' && action.target) {
          if (action.target.kind === 'enemy' && view.enemy.scanned) emit({ kind: 'lockFrequency', station: seat, enemyId: action.target.stableId });
          else emit({ kind: 'scan', station: seat, target: action.target });
        }
      }
      continue;
    }
    if (kind === StationKind.Weapons) {
      const memory = ui.stations[seat]!, rows = cardRows(view, seat, ui);
      let index = cardRowIndex(view, seat, ui), weapon = weaponRef(view);
      // A swap into an empty slot removes its row. The next input resumes at
      // the first warned target before applying that input's direction.
      if (index < 0 && memory.rowKey === 'swap' && !canSwap(view) && (dir !== Dir.None || confirm)) {
        index = rows.length ? 0 : -1; memory.rowKey = rows[index]?.key ?? null;
        const action = rows[index]?.action;
        if (action?.kind === 'selectTarget') emit(action);
      }
      if (dir === Dir.Up || dir === Dir.Down) {
        index = rows.length ? index < 0 ? 0 : (index + (dir === Dir.Up ? rows.length - 1 : 1)) % rows.length : -1;
        const row = rows[index]; memory.rowKey = row?.key ?? null;
        emit({ kind: 'selectTarget', station: seat, target: row?.action?.kind === 'selectTarget' ? row.action.target : null });
      }
      if (dir === Dir.Left || dir === Dir.Right) {
        const list = selectorList(view), at = list.indexOf(weapon.selector);
        weapon = weaponRef(view, list[at < 0 ? 0 : (at + (dir === Dir.Left ? list.length - 1 : 1)) % list.length]!);
        emit({ kind: 'selectWeapon', station: seat, weapon });
      }
      if (confirm) {
        const row = rows[index];
        if (row?.action?.kind === 'swapCargo') { const slot = Math.max(0, weapon.selector - 4); emit({ ...row.action, slot, expectedEquipped: view.weapons.slot[slot]! }); }
        else if (row?.action?.kind === 'selectTarget' && row.action.target) emit({ kind: 'fire', station: seat, weapon, target: row.action.target });
      }
      continue;
    }
    if (kind === StationKind.Engineering || kind === StationKind.Doors) {
      const memory = ui.stations[seat]!, rows = cardRows(view, seat, ui); let index = cardRowIndex(view, seat, ui);
      if (!rows.length) continue;
      if (dir === Dir.Up || (kind === StationKind.Doors && dir === Dir.Left)) index = (index + rows.length - 1) % rows.length;
      else if (dir === Dir.Down || (kind === StationKind.Doors && dir === Dir.Right)) index = (index + 1) % rows.length;
      const row = rows[index]!; memory.rowKey = row.key;
      if (kind === StationKind.Engineering && memory.page === 'main' && (dir === Dir.Left || dir === Dir.Right) && row.action?.kind === 'coolant') emit({ kind: 'power', station: seat, target: row.action.target, delta: dir === Dir.Right ? 1 : -1 });
      if (confirm) {
        if (row.key === 'upgrades') { memory.page = 'upgrades'; memory.rowKey = cardRows(view, seat, ui)[0]?.key ?? null; }
        else if (row.key === 'back') { memory.page = 'main'; memory.rowKey = 'upgrades'; }
        else if (row.enabled && row.action) emit(row.action);
      }
      continue;
    }
    if (kind === StationKind.Navigation) {
      const memory = ui.stations[seat]!, rows = cardRows(view, seat, ui);
      let index = cardRowIndex(view, seat, ui);
      if (index < 0) continue;
      if (dir === Dir.Up || dir === Dir.Down) {
        const delta = dir === Dir.Up ? -1 : 1;
        do index = (index + delta + rows.length) % rows.length; while (!rows[index]!.action);
      }
      const row = rows[index]!; memory.rowKey = row.key;
      // Readiness advances before the authority's C phase. Confirm still sends
      // the explicit travel action when the preceding publication is not ready.
      if (confirm && row.action) emit(row.action);
    }
  }
  return out;
}
