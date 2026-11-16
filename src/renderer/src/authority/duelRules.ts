// The duel's EncounterRules (engine refactor spec §6): the Helm duel behind the generic authority. The state is the
// duel plus its telemetry accumulator (mode memory, outside the hash) and the end summary, computed once at the end.
// `tick` is the interior tick; stepDuelTick advances it and the tactical tick together, and restore checks they agree.
import type { Cue, DuelCommand, CommandEnvelope } from '../net/contracts';
import { duelCodec } from '../net/codec';
import { assertSimStateLive } from '../sim/state';
import { hashDuel } from '../sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot, type DuelSnapshot } from '../sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../sim/duel/state';
import { stepDuelTick } from '../sim/duel/step';
import { duelEndSummary, type DuelEndSummary } from '../sim/duel/summary';
import { createTelemetry, recordTick, type DuelTelemetry } from '../sim/duel/telemetry';
import { Outcome } from '../sim/tactical/state';
import { decodeDuelMemory, encodeDuelMemory, validateDuelCheckpoint, validateDuelInit, type DuelControllers, type DuelInit, type DuelMemory } from './duelCheckpoint';
import type { EncounterRules } from './rules';

export interface DuelSession { duel: DuelState; telemetry: DuelTelemetry; summary: DuelEndSummary | null }
export interface DuelTypes { state: DuelSession; init: DuelInit; controllers: DuelControllers; snapshot: DuelSnapshot; cueBaseline: { outcome: number } }

function session(duel: DuelState, telemetry: DuelTelemetry): DuelSession {
  return { duel, telemetry, summary: duel.tactical.outcome !== Outcome.Running ? duelEndSummary(telemetry) : null };
}

export const duelRules: EncounterRules<DuelTypes> = {
  modeId: 'duel',
  validateInit: (value, contentDigest, resolveLayout) => validateDuelInit(resolveLayout((value as DuelInit | null)?.layoutId as string), value, contentDigest),
  create(init, resolveLayout) { const duel = createDuel(resolveLayout(init.layoutId), init.seed); return session(duel, createTelemetry(duel)); },
  dispose: (s) => disposeDuel(s.duel),
  assertLive: (s) => assertSimStateLive(s.duel.interior),
  playerCount: () => 2,
  tick: (s) => s.duel.interior.tick,
  step(s, input) {
    // The duel codec admits only duel kinds, and the core handles setPaused before the step.
    const duelInput = { held: input.held, commands: input.commands as readonly CommandEnvelope<DuelCommand>[] };
    const results = stepDuelTick(s.duel, duelInput);
    recordTick(s.telemetry, s.duel, duelInput);
    if (!s.summary && s.duel.tactical.outcome !== Outcome.Running) s.summary = duelEndSummary(s.telemetry);
    return results;
  },
  terminal(s) {
    if (s.duel.tactical.outcome === Outcome.Running) return { ended: false, endRecord: null };
    // step and restore (session) set the summary whenever the outcome has left Running, so an ended duel always has one.
    if (!s.summary) throw new Error('an ended duel has no end summary');
    return { ended: true, endRecord: { mode: 'duel', record: s.summary } };
  },
  safePointKey: () => 'duel',
  callouts: () => null,
  cueBaseline: (s) => ({ outcome: s.duel.tactical.outcome }),
  cues(prev, s) {
    const events = s.duel.tactical.events, outcome = s.duel.tactical.outcome, out: Cue[] = [];
    if (events.some((e) => (e.kind === 'laser' && e.ship === 1 && e.hit) || (e.kind === 'missileEnd' && e.cause === 'ship' && e.target === 0))) out.push('impact');
    if (events.some((e) => e.kind === 'laser' && e.ship === 0)) out.push('shot');
    if (events.some((e) => (e.kind === 'laser' && e.ship === 0 && e.hit) || (e.kind === 'missileEnd' && e.cause === 'ship' && e.target === 1))) out.push('hit');
    if (prev.outcome === Outcome.Running && outcome !== Outcome.Running) out.push(outcome === Outcome.CrewWins ? 'victory' : 'defeat');
    return out;
  },
  snapshot: (s, contentDigest) => saveDuelSnapshot(s.duel, contentDigest),
  restore(snapshot, resolveLayout, memory) {
    if (!memory) throw new Error('a duel restore needs its telemetry memory');
    const duel = loadDuelSnapshot(resolveLayout(snapshot.header.layoutId), snapshot, snapshot.header.contentDigest);
    return session(duel, decodeDuelMemory(memory as DuelMemory));
  },
  hash: (s) => hashDuel(s.duel),
  validateCheckpoint: validateDuelCheckpoint,
  commandCodec: duelCodec,
  initialControllers: () => [],
  memory: (s) => encodeDuelMemory(s.telemetry)
};
