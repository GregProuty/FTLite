import type { CommandEnvelope, EventRef, HeldFrame, LegacyInputEnvelope, RunId } from '../net/contracts';
import type { SimState } from '../sim/state';
import { NEUTRAL_FRAME, type InputFrame } from './inputFrame';

export interface CardUiState {
  runId: RunId;
  players: { nextSequence: number; heldSequence: number; heldDir: number; repeat: number; pendingVote: { event: EventRef; choice: number } | null }[];
  stations: { rowKey: string | null; page: 'main' | 'upgrades' }[];
  groupBar: boolean[];
}
export interface ClientActions { held: HeldFrame[]; commands: CommandEnvelope[]; legacyCardInput: LegacyInputEnvelope[] }
export function createCardUi(runId = ''): CardUiState { return { runId, players: [], stations: [], groupBar: [] }; }
/** Reconciliation does not advance repeat. Tasks 5–9 move each family's UI here. */
export function reconcileUi(view: SimState, ui: CardUiState, runId: RunId, water: readonly number[]): void {
  if (ui.runId !== runId) { ui.runId = runId; ui.players = []; ui.stations = []; ui.groupBar = []; }
  for (let p = 0; p < view.playerCount; p++) {
    ui.players[p] ??= { nextSequence: 1, heldSequence: 0, heldDir: -1, repeat: 0, pendingVote: null };
    ui.players[p]!.nextSequence = Math.max(ui.players[p]!.nextSequence, (water[p] ?? 0) + 1);
  }
  while (ui.stations.length < view.stations.cursor.length) ui.stations.push({ rowKey: null, page: 'main' });
  while (ui.groupBar.length < view.groups.bar.length) ui.groupBar.push(false);
}
/** Raw axes are sent unchanged. Each sim consumer retains its original clampIntent operation. */
export function translateTick(view: SimState, ui: CardUiState, frames: readonly InputFrame[], tick: number): ClientActions {
  const out: ClientActions = { held: [], commands: [], legacyCardInput: [] };
  for (let player = 0; player < view.playerCount; player++) {
    const f = frames[player] ?? NEUTRAL_FRAME, producer = ui.players[player]!;
    if (!Number.isSafeInteger(producer.heldSequence + 1) || !Number.isSafeInteger(producer.nextSequence)) throw new Error('input sequence exhausted');
    const held = { moveX: f.moveX, moveY: f.moveY, interactHeld: f.interactHeld };
    out.held.push({ runId: ui.runId, player, tick, sequence: ++producer.heldSequence, held });
    if (f.interactPresses <= 0 && f.confirmPresses <= 0 && f.cancelPresses <= 0) continue;
    out.legacyCardInput.push({ kind: 'legacyCardInput', runId: ui.runId, id: { player, sequence: producer.nextSequence++ }, requestedTick: tick,
      input: { ...held, interactPressed: f.interactPresses > 0, confirmPressed: f.confirmPresses > 0, cancelPressed: f.cancelPresses > 0 } });
  }
  return out;
}
