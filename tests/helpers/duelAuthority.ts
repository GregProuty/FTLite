// A duel run through the generic authority core (engine refactor spec §6, R-1b): the scripted pair's held axes and
// commands enter as journal frames, exactly as a live binding's would, so the run exercises the ledger, the duel codec,
// the rules' step, cues, end record, snapshot and checkpoint. Shared by the duel snapshot, replay and size tests.
import { seatDuelCrew } from './duelSeat';
import { createEncounterCore } from '../../src/renderer/src/authority/core';
import { duelRules, type DuelTypes } from '../../src/renderer/src/authority/duelRules';
import type { DuelCheckpoint, DuelInit } from '../../src/renderer/src/authority/duelCheckpoint';
import type { CheckpointOf } from '../../src/renderer/src/authority/rules';
import type { CommandEnvelope, HeldInput } from '../../src/renderer/src/net/contracts';
import { createScriptedPair, scriptedInput, type ScriptedPair } from '../../src/renderer/src/sim/duel/scripted';
import { deriveLayout } from '../../src/renderer/src/sim/ship/derived';
import type { ReplayAction, ReplayFrame } from '../../src/renderer/src/sim/replay';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { CUTTER } from './scriptedDuel';
import { DUEL_LAYOUT } from '../../src/renderer/src/sim/duel/layout';
import type { DuelCrew } from '../../src/renderer/src/sim/duel/state';

/** The layouts a test duel may fly: the Cutter (the scripted scenes are tuned to it) and the Hound (the app's duel ship). */
export const resolveCutter = (id: string) => { if (id === CUTTER.id) return CUTTER; if (id === DUEL_LAYOUT.id) return DUEL_LAYOUT; throw Error('unknown duel layout'); };
export function duelInit(seed: number, runId = `duel-${seed}`, helmPlayer = 0, layout = CUTTER, playerCount: DuelCrew = 2): DuelInit {
  return { runId, layoutId: layout.id, layoutHash: deriveLayout(layout).layoutHash, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed, playerCount, helmPlayer };
}
const deps = (init: DuelInit) => ({ init, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: resolveCutter,
  clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash(record: { error: string }) { throw Error(record.error); } });

/** The producer side: the scripted pair plus the per-player sequences, held sequences and receive order it has used. */
export interface DuelDriver { pair: ScriptedPair; sequences: [number, number]; heldSequences: [number, number]; held: HeldInput[]; order: number }
export function createDriver(seed: number): DuelDriver {
  return { pair: createScriptedPair(seed), sequences: [0, 0], heldSequences: [0, 0], held: [0, 1].map(() => ({ moveX: 0, moveY: 0, interactHeld: false })), order: 0 };
}

export function duelCore(init: DuelInit, restored?: DuelCheckpoint) {
  const state = restored ? duelRules.restore(restored.snapshot, resolveCutter, restored.modeMemory) : duelRules.create(init, resolveCutter);
  if (!restored) seatDuelCrew(state.duel);   // the old seated start (createDuel leaves both standing)
  const core = createEncounterCore(duelRules, deps(init), state, restored as CheckpointOf<DuelTypes> | undefined);
  return { core, state, init };
}
export type DuelCore = ReturnType<typeof duelCore>;

/** One tick: the pair reads the duel, its held axes and commands are admitted as one journal frame, then the tick runs.
 *  Returns the frames the core produced (admission, then tick). */
export function stepScripted(h: DuelCore, driver: DuelDriver): ReplayFrame[] {
  const tick = duelRules.tick(h.state), input = scriptedInput(driver.pair, h.state.duel), frames: ReplayFrame[] = [];
  const entries: Extract<ReplayAction, { kind: 'admission' }>['entries'] = [];
  for (const player of [0, 1] as const) {
    const next = input.held[player] ?? { moveX: 0, moveY: 0, interactHeld: false }, prev = driver.held[player]!;
    if (next.moveX === prev.moveX && next.moveY === prev.moveY && next.interactHeld === prev.interactHeld) continue;
    driver.held[player] = { ...next };
    entries.push({ binding: 1, players: [0, 1], order: ++driver.order, message: { kind: 'held', frame: { runId: h.init.runId, player, tick, sequence: ++driver.heldSequences[player], held: { ...next } } } });
  }
  const commands: CommandEnvelope[] = input.commands.map((e) => ({ runId: h.init.runId, id: { player: e.id.player, sequence: ++driver.sequences[e.id.player as 0 | 1] }, requestedTick: tick, command: e.command }));
  for (const envelope of commands) entries.push({ binding: 1, players: [0, 1], order: ++driver.order, message: { kind: 'command', envelope } });
  const run = (action: ReplayAction) => frames.push(h.core.replayFrame({ tick: duelRules.tick(h.state), eventSequenceBefore: h.core.cursors().eventSequence, action, results: [], events: [] }));
  if (entries.length) run({ kind: 'admission', entries });
  run({ kind: 'tick', input: { held: driver.held.map((x) => ({ ...x })), commands }, heldSequences: [...driver.heldSequences] });
  return frames;
}

/** A checkpoint carried through JSON bytes and the duel validator, as a re-host would see it. */
export function throughBytes(cp: unknown): DuelCheckpoint {
  return duelRules.validateCheckpoint(JSON.parse(JSON.stringify(cp)), __GAMEPLAY_CONTENT_DIGEST__, resolveCutter) as DuelCheckpoint;
}
/** An init for the duel mode as the app registers it (the Hound): the real mode resolves no other layout. */
export const modeDuelInit = (seed: number, runId = `duel-${seed}`, helmPlayer = 0): DuelInit => duelInit(seed, runId, helmPlayer, DUEL_LAYOUT);
