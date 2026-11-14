import type { Command, CommandEnvelope, CommandResult, EventRef, HeldFrame, LegacyInputEnvelope, RunId } from '../net/contracts';
import type { SimState } from '../sim/state';
import { NEUTRAL_FRAME, type InputFrame } from './inputFrame';
import { Life, LifeState, Seated } from '../sim/components';
import { ConfirmKind, confirmTarget } from '../sim/interact';
import { Dir } from '../sim/dir';
import { STICK_EDGE_THRESHOLD, STICK_REPEAT_TICKS } from '../sim/tuning';
import { eventRef, navigationOfficer, visitRef } from '../sim/commands';
import { EVENT_DEFS } from '../sim/events';
import { StationKind } from '../sim/stationKinds';
import { stationOnline } from '../sim/stations';
import { navRows, navCursorAfterDirection } from '../sim/run';
import { canSwap, SWAP_SLOT } from '../sim/weapons';
import { warnedTargets } from '../sim/debrisTargets';
import { upgradeRows } from '../sim/power';

export interface CardUiState {
  runId: RunId;
  players: { nextSequence: number; heldSequence: number; heldDir: number; repeat: number; lastTick: number; seat: number; pendingVoteSequence: number; pendingVoteTick: number; pendingVote: { event: EventRef; choice: number } | null }[];
  stations: { rowKey: string | null; page: 'main' | 'upgrades' }[];
  groupBar: boolean[];
}
export interface ClientActions { held: HeldFrame[]; commands: CommandEnvelope[]; legacyCardInput: LegacyInputEnvelope[] }
export function createCardUiState(runId: RunId, players: number): CardUiState {
  return { runId, players: Array.from({ length: players }, () => ({ nextSequence: 1, heldSequence: 0, heldDir: Dir.None, repeat: 0, lastTick: -1, seat: -1, pendingVoteSequence: 0, pendingVoteTick: -1, pendingVote: null })), stations: [], groupBar: [] };
}
export function createCardUi(runId = ''): CardUiState { return createCardUiState(runId, 0); }
export function pauseActions(ui: CardUiState, player: number, tick: number, paused: boolean): ClientActions {
  const producer = ui.players[player];
  if (!producer || !Number.isSafeInteger(producer.nextSequence)) throw new Error('input sequence exhausted');
  return { held: [], legacyCardInput: [], commands: [{ runId: ui.runId, id: { player, sequence: producer.nextSequence++ }, requestedTick: tick, command: { kind: 'setPaused', paused } }] };
}
const sameEvent = (a: EventRef, b: EventRef): boolean => a.eventId === b.eventId && a.visit.sector === b.visit.sector && a.visit.beacon === b.visit.beacon && a.visit.arrivalTick === b.visit.arrivalTick;
/** Publications reconcile lifecycle/acknowledgments without advancing repeat. */
export function reconcileUi(view: SimState, ui: CardUiState, runId: RunId, water: readonly number[]): void {
  if (ui.runId !== runId) Object.assign(ui, createCardUiState(runId, view.playerCount));
  for (let p = 0; p < view.playerCount; p++) {
    ui.players[p] ??= createCardUiState(runId, 1).players[0]!;
    const producer = ui.players[p]!, seat = Seated.station[view.crew[p]!]!;
    producer.nextSequence = Math.max(producer.nextSequence, (water[p] ?? 0) + 1);
    if (seat !== producer.seat && (seat < 0 || producer.seat < 0)) {
      producer.heldDir = Dir.None; producer.repeat = 0; producer.lastTick = -1;
      for (const i of [producer.seat, seat]) if (i >= 0) {
        const group = view.derived.stationGroup[i]!; if (group >= 0) ui.groupBar[group] = false;
      }
    }
    producer.seat = seat;
    // Admission high-water alone is insufficient: pause can publish an unexecuted tick.
    if (producer.pendingVote && (view.run.event < 0 || view.run.eventChoice >= 0 || !sameEvent(producer.pendingVote.event, eventRef(view)) || ((water[p] ?? 0) >= producer.pendingVoteSequence && view.tick > producer.pendingVoteTick))) producer.pendingVote = null;
  }
  while (ui.stations.length < view.stations.cursor.length) ui.stations.push({ rowKey: null, page: 'main' });
  while (ui.groupBar.length < view.groups.tab.length) ui.groupBar.push(false);
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
/** Unmigrated families still expose their published cursor/page; no canonical mirrors. */
export function atFirstRow(state: SimState, i: number): boolean {
  if (!stationOnline(state, i)) return true;
  const c = state.stations.cursor[i]!;
  switch (state.derived.stationKind[i]) {
    case StationKind.Navigation: { const first = navRows(state).findIndex(row => row.select !== 'none'); return first < 0 || c <= first; }
    case StationKind.Weapons: { const list = canSwap(state) ? [...warnedTargets(state), SWAP_SLOT] : warnedTargets(state); return list.indexOf(c) <= 0; }
    case StationKind.Science: return [...warnedTargets(state, false), -1].indexOf(c < 0 ? -1 : c) <= 0;
    case StationKind.Engineering: return state.stations.page[i] === 1 ? upgradeRows(state).indexOf(c) <= 0 : c <= 0;
    case StationKind.Doors: return c <= 0;
    default: return true;
  }
}
/** Translate only completed state plus client memory. Held movement/Interact remain raw. */
export function translateTick(view: SimState, ui: CardUiState, frames: readonly InputFrame[], tick: number): ClientActions {
  const out: ClientActions = { held: [], commands: [], legacyCardInput: [] };
  for (let player = 0; player < view.playerCount; player++) {
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
      if (dir === Dir.Up && atFirstRow(view, seat)) { ui.groupBar[group] = true; continue; }
      if (!stationOnline(view, seat)) continue;
    }
    const kind = view.derived.stationKind[seat]!;
    if (![StationKind.Navigation, StationKind.Engineering, StationKind.Doors, StationKind.Weapons, StationKind.Science].some(k => k === kind)) continue;
    let vote: Command | null = null;
    if (kind === StationKind.Navigation && confirm) {
      const rows = navRows(view), row = rows[navCursorAfterDirection(rows, view.stations.cursor[seat]!, dir)];
      if (row?.select === 'choice') { vote = { kind: 'vote', event: eventRef(view), choice: row.index }; confirm = false; }
    }
    if (dir !== Dir.None || confirm) out.legacyCardInput.push({ kind: 'legacyCardInput', runId: ui.runId, id: { player, sequence: sequence() }, requestedTick: tick, input: { station: seat, direction: dir, confirm } });
    if (vote) emit(vote);
  }
  return out;
}
