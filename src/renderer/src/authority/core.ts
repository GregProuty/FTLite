import type { AuthorityMessage, ClientMessage, CommandEnvelope, CommandResult, HeldFrame, HeldInput, Link, PublishedState, RunInit, Unsubscribe } from '../net/contracts';
import { decodeMessage, encodeMessage } from '../net/codec';
import { saveSnapshot, type Snapshot } from '../sim/snapshot';
import { hashState } from '../sim/hash';
import type { SimState } from '../sim/state';
import { stepCommands } from '../sim/step';
import type { MigrationTickInput } from '../sim/commands';
import { telemetryRecord } from '../sim/telemetry';
import { TICK_HZ } from '../sim/tuning';
import { createLedger, type AdmittedEnvelope, type Ledger } from './ledger';
import { admitLegacyCardInput } from './legacyCardInput';
import type { AuthorityDeps } from './authority';

interface Binding { link: Link; players: readonly number[]; ledger: Ledger; ingress: ClientMessage[]; unsubscribe: Unsubscribe[] }
export interface JournalTick { tick: number; input: MigrationTickInput; heldSequences: readonly number[]; results: readonly CommandResult[]; controls: readonly CommandEnvelope[] }
export interface CrashRecord {
  tick: number; seed: number; error: string; baseline: Snapshot;
  baselineHighWater: readonly number[]; baselineHeldSequences: readonly number[];
  baselineControlRevision: number; ticks: readonly JournalTick[]; snapshotAfterFault: Snapshot | null;
  baselineControlState: { phase: PublishedState['phase']; pauseOwner: number | null; revision: number };
  baselineHeld: readonly HeldInput[];
}
/** Internal owner. Only the public wrapper constructs it in shipping code. */
export function createAuthorityCore(deps: AuthorityDeps & { init: RunInit }, state: SimState) {
  const bindings = new Set<Binding>();
  const held: HeldInput[] = Array.from({ length: state.playerCount }, () => ({ moveX: 0, moveY: 0, interactHeld: false }));
  const heldSequences = Array.from({ length: state.playerCount }, () => 0);
  const ledger = createLedger(Array.from({ length: state.playerCount }, (_, p) => p));
  let pending: { binding: Binding; envelope: AdmittedEnvelope }[] = [];
  let controls: CommandEnvelope[] = [], publicationSequence = 0, eventSequence = 0, controlRevision = 0;
  let controlResults: CommandResult[] = [];
  let phase: PublishedState['phase'] = state.ended ? 'ended' : 'running', pauseOwner: number | null = null;
  let disposed = false, pumping = false, cancelTimer: Unsubscribe | null = null;
  let epoch = deps.clock.nowMs(), deadlineOrdinal = 1;
  let nextDeadline = epoch + deadlineOrdinal * 1000 / TICK_HZ;
  let baseline = saveSnapshot(state), baselineHighWater: readonly number[] = heldSequences.slice(), baselineHeldSequences: readonly number[] = heldSequences.slice(), baselineControlRevision = 0;
  let baselineHeld = held.map((h) => ({ ...h }));
  let baselineControlState: CrashRecord['baselineControlState'] = { phase, pauseOwner, revision: controlRevision };
  let ticks: JournalTick[] = [];
  const highWater = (): number[] => ledger.highWater().slice(0, state.playerCount);
  function send(binding: Binding, message: AuthorityMessage, reliable = false): void { binding.link.send(reliable ? 'reliable-ordered' : 'unreliable-latest', encodeMessage(message)); }
  function publishCompletedState(): void {
    if (disposed || phase === 'error') return;
    const publication: PublishedState = { runId: deps.init.runId, tick: state.tick, publicationSequence: ++publicationSequence,
      snapshot: saveSnapshot(state), hash: hashState(state), phase, pauseOwner, controlRevision, commandHighWater: highWater(), eventSequence };
    const bytes = encodeMessage({ kind: 'state', state: publication });
    for (const binding of bindings) binding.link.send('unreliable-latest', bytes);
  }
  function result(binding: Binding, value: CommandResult): void {
    binding.ledger.finish(value); send(binding, { kind: 'result', runId: deps.init.runId, result: value }, true);
  }
  function acceptHeld(binding: Binding, frame: HeldFrame): void {
    if (frame.runId !== deps.init.runId || !binding.players.includes(frame.player) || frame.tick !== state.tick || frame.sequence <= heldSequences[frame.player]!) return;
    heldSequences[frame.player] = frame.sequence; held[frame.player] = { ...frame.held };
  }
  function drainIngress(): void {
    for (const binding of bindings) {
      const incoming = binding.ingress.splice(0);
      for (const message of incoming) {
        if (message.kind === 'held') { acceptHeld(binding, message.frame); continue; }
        if (message.kind === 'callout') continue; // Presentation remains a local adapter until the event migration.
        const envelope = message.kind === 'command' ? message.envelope : message;
        if (!binding.players.includes(envelope.id.player)) { send(binding, { kind: 'result', runId: deps.init.runId, result: { id: envelope.id, tick: state.tick, status: 'rejected', reason: 'unowned' } }, true); continue; }
        if (envelope.runId !== deps.init.runId) { send(binding, { kind: 'result', runId: deps.init.runId, result: { id: envelope.id, tick: state.tick, status: 'rejected', reason: 'wrong-run' } }, true); continue; }
        const admission = 'kind' in envelope ? admitLegacyCardInput(binding.ledger, envelope, state.tick) : binding.ledger.admit(envelope, state.tick);
        if (admission.status !== 'queued') { send(binding, { kind: 'result', runId: deps.init.runId, result: admission.result }, true); continue; }
        if (phase === 'ended' || phase === 'error') {
          result(binding, { id: envelope.id, tick: state.tick, status: 'rejected', reason: 'unavailable' });
          continue;
        }
        pending.push({ binding, envelope });
      }
    }
  }
  function applyControls(): void {
    const control = pending.filter((p) => !('kind' in p.envelope) && p.envelope.command.kind === 'setPaused');
    if (!control.length) return;
    pending = pending.filter((p) => !control.includes(p));
    let paused = false;
    for (const entry of control) {
      const envelope = entry.envelope as CommandEnvelope;
      if (envelope.command.kind !== 'setPaused') continue;
      paused ||= envelope.command.paused; pauseOwner = envelope.id.player;
      controls.push(envelope); controlRevision++;
      const outcome: CommandResult = { id: envelope.id, tick: state.tick, status: 'applied' };
      controlResults.push(outcome); result(entry.binding, outcome);
    }
    phase = paused ? 'paused' : 'running';
    if (!paused) pauseOwner = null;
    // Task 4 replaces this interim epoch reset with retained debt.
    epoch = deps.clock.nowMs(); deadlineOrdinal = 1; nextDeadline = epoch + 1000 / TICK_HZ;
    if (paused) held.forEach((h) => { h.moveX = 0; h.moveY = 0; h.interactHeld = false; });
    publishCompletedState();
  }
  function schedule(): void {
    if (disposed || phase === 'ended' || phase === 'error') return;
    cancelTimer?.(); cancelTimer = deps.scheduler.schedule(1000 / 120, pump);
  }
  function pump(): void {
    if (disposed || pumping) return;
    pumping = true;
    try {
      try { deps.beforeControls?.(); } catch { /* absent producer never prevents authority progress */ }
      drainIngress(); applyControls();
      let count = 0;
      while (phase === 'running' && deps.clock.nowMs() + 1e-7 >= nextDeadline && count++ < 120) {
        // Producer opportunities happen outside execution; absent or failed producers never gate ticks.
        try { deps.beforeTick?.(state.tick, nextDeadline); } catch { /* producer failed: run with admitted input */ }
        drainIngress(); applyControls();
        if (phase !== 'running') break;
        const frozen = pending; pending = [];
        const input: MigrationTickInput = { held: held.map((h) => ({ ...h })), commands: [], legacyCardInput: [] };
        for (const entry of frozen) {
          if ('kind' in entry.envelope) (input.legacyCardInput as AdmittedEnvelope[]).push(entry.envelope);
          else (input.commands as CommandEnvelope[]).push(entry.envelope);
        }
        const record: JournalTick = { tick: state.tick, input, heldSequences: [...heldSequences], results: controlResults, controls }; controls = []; controlResults = []; ticks.push(record);
        const executed = stepCommands(state, input); record.results = [...record.results, ...executed];
        for (const value of executed) { const entry = frozen.find((p) => p.envelope.id.player === value.id.player && p.envelope.id.sequence === value.id.sequence); if (entry) result(entry.binding, value); }
        nextDeadline = epoch + ++deadlineOrdinal * 1000 / TICK_HZ;
        if (state.ended) {
          phase = 'ended';
          const event = { runId: deps.init.runId, eventSequence: ++eventSequence, tick: state.tick, payload: { kind: 'ended' as const, record: telemetryRecord(state, deps.init.seed) } };
          for (const binding of bindings) send(binding, { kind: 'event', event }, true);
        }
        publishCompletedState();
        if (state.tick % 300 === 0) { baseline = saveSnapshot(state); baselineHighWater = highWater(); baselineHeldSequences = [...heldSequences]; baselineControlRevision = controlRevision;
          baselineHeld = held.map((h) => ({ ...h })); baselineControlState = { phase, pauseOwner, revision: controlRevision }; ticks = []; }
      }
    } catch (error) {
      phase = 'error'; let snapshotAfterFault: Snapshot | null = null;
      try { snapshotAfterFault = saveSnapshot(state); } catch { /* corrupted state */ }
      deps.onCrash({ tick: state.tick, seed: deps.init.seed, error: String(error), baseline, baselineHighWater, baselineHeldSequences, baselineControlRevision, baselineHeld, baselineControlState, ticks, snapshotAfterFault });
    } finally { pumping = false; schedule(); }
  }
  schedule();
  return {
    attach(link: Link, players: readonly number[]): Unsubscribe {
      if (disposed || players.some((p) => !Number.isInteger(p) || p < 0 || p >= state.playerCount || [...bindings].some((b) => b.players.includes(p))) || new Set(players).size !== players.length) throw new Error('invalid player ownership');
      const binding: Binding = { link, players: [...players], ledger, ingress: [], unsubscribe: [] }; bindings.add(binding);
      const detach = (): void => {
        if (!bindings.delete(binding)) return;
        for (const off of binding.unsubscribe) off();
        for (const entry of pending) if (entry.binding === binding) ledger.finish({ id: entry.envelope.id, tick: state.tick, status: 'rejected', reason: 'unavailable' });
        pending = pending.filter((p) => p.binding !== binding);
        for (const p of players) held[p] = { moveX: 0, moveY: 0, interactHeld: false };
      };
      binding.unsubscribe.push(link.onMessage((_kind, bytes) => {
        try { const message = decodeMessage(bytes); if (message.kind === 'state' || message.kind === 'result' || message.kind === 'event') { link.close('invalid-client-message'); return; }
          if (binding.ingress.length >= 256) { link.close('ingress-overflow'); return; } binding.ingress.push(message);
        } catch { link.close('malformed'); }
      }), link.onClose(detach));
      publishCompletedState(); schedule(); return detach;
    },
    pump, publishCompletedState,
    dispose(): void { if (disposed) return; disposed = true; cancelTimer?.(); for (const binding of bindings) for (const off of binding.unsubscribe) off(); bindings.clear(); pending = []; controls = []; }
  };
}
