import type { AuthorityMessage, ClientMessage, CommandEnvelope, CommandResult, HeldFrame, HeldInput, LifecyclePause, Link, PublishedState, RunInit, Unsubscribe } from '../net/contracts';
import { decodeMessage, encodeMessage } from '../net/codec';
import { saveSnapshot, type Snapshot } from '../sim/snapshot';
import { hashState } from '../sim/hash';
import type { SimState } from '../sim/state';
import { stepCommands } from '../sim/step';
import { isPauseControl, type MigrationTickInput } from '../sim/commands';
import { telemetryRecord } from '../sim/telemetry';
import { createTickDriver } from './tickDriver';
import { createLedger, type AdmittedEnvelope, type Ledger } from './ledger';
import { admitLegacyCardInput } from './legacyCardInput';
import type { AuthorityDeps } from './authority';

interface Binding { link: Link; players: readonly number[]; ledger: Ledger; ingress: { message: ClientMessage; order: number }[]; unsubscribe: Unsubscribe[] }
export type JournalControl = { source: 'player'; order: number; envelope: CommandEnvelope } | { source: 'lifecycle'; order: number; ordinal: number; control: LifecyclePause };
export interface JournalTick { tick: number; input: MigrationTickInput; heldSequences: readonly number[]; results: readonly CommandResult[]; controls: readonly JournalControl[] }
export interface CrashRecord {
  tick: number; seed: number; error: string; baseline: Snapshot;
  baselineHighWater: readonly number[]; baselineHeldSequences: readonly number[];
  baselineControlRevision: number; baselineLifecycleOrdinal: number; ticks: readonly JournalTick[]; snapshotAfterFault: Snapshot | null;
  baselineControlState: { phase: PublishedState['phase']; pauseOwner: number | null; pauseReason: string | null; revision: number };
  baselineHeld: readonly HeldInput[];
}
/** Internal owner. Only the public wrapper constructs it in shipping code. */
export function createAuthorityCore(deps: AuthorityDeps & { init: RunInit }, state: SimState) {
  const bindings = new Set<Binding>();
  const held: HeldInput[] = Array.from({ length: state.playerCount }, () => ({ moveX: 0, moveY: 0, interactHeld: false }));
  const heldSequences = Array.from({ length: state.playerCount }, () => 0);
  const ledger = createLedger(Array.from({ length: state.playerCount }, (_, p) => p));
  let pending: { binding: Binding; envelope: AdmittedEnvelope }[] = [];
  let controls: JournalControl[] = [], publicationSequence = 0, eventSequence = 0, controlRevision = 0;
  let receiveOrder = 0, lifecycleOrdinal = 0, appliedLifecycleOrdinal = 0, baselineLifecycleOrdinal = 0;
  let controlQueue: { record: JournalControl; binding?: Binding }[] = [];
  let pauseReason: string | null = null, tickTimeMs: number | null = null;
  let controlResults: CommandResult[] = [];
  let phase: PublishedState['phase'] = state.ended ? 'ended' : 'running', pauseOwner: number | null = null;
  let disposed = false, pumping = false;
  let baseline = saveSnapshot(state), baselineHighWater: readonly number[] = heldSequences.slice(), baselineHeldSequences: readonly number[] = heldSequences.slice(), baselineControlRevision = 0;
  let baselineHeld = held.map((h) => ({ ...h }));
  let baselineControlState: CrashRecord['baselineControlState'] = { phase, pauseOwner, pauseReason, revision: controlRevision };
  let ticks: JournalTick[] = [];
  const highWater = (): number[] => ledger.highWater().slice(0, state.playerCount);
  function checkpoint(): void {
    baseline = saveSnapshot(state); baselineHighWater = highWater(); baselineHeldSequences = [...heldSequences];
    baselineControlRevision = controlRevision; baselineLifecycleOrdinal = appliedLifecycleOrdinal;
    baselineHeld = held.map((h) => ({ ...h })); baselineControlState = { phase, pauseOwner, pauseReason, revision: controlRevision };
    ticks = []; controls = []; controlResults = [];
  }
  function send(binding: Binding, message: AuthorityMessage, reliable = false): void { binding.link.send(reliable ? 'reliable-ordered' : 'unreliable-latest', encodeMessage(message)); }
  function publishCompletedState(): void {
    if (disposed || phase === 'error') return;
    const publication: PublishedState = { runId: deps.init.runId, tick: state.tick, publicationSequence: ++publicationSequence,
      snapshot: saveSnapshot(state), hash: hashState(state), phase, pauseOwner, pauseReason, controlRevision, lagTicks: driver.lagTicks(), tickTimeMs, commandHighWater: highWater(), eventSequence };
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
    const incoming = [...bindings].flatMap((binding) => binding.ingress.splice(0).map((entry) => ({ ...entry, binding }))).sort((a, b) => a.order - b.order);
    for (const { binding, message, order } of incoming) {
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
      if (isPauseControl(envelope)) controlQueue.push({ binding, record: { source: 'player', order, envelope } });
      else pending.push({ binding, envelope });
    }
  }
  function applyControls(): void {
    const queue = controlQueue.sort((a, b) => a.record.order - b.record.order); controlQueue = [];
    if (!queue.length) return;
    if (phase === 'ended' || phase === 'error') {
      for (const entry of queue) if (entry.record.source === 'player') result(entry.binding!, { id: entry.record.envelope.id, tick: state.tick, status: 'rejected', reason: 'unavailable' });
      return;
    }
    // A long pause can have arbitrarily many trusted focus signals but no sim tick.
    // Checkpoint the completed boundary instead of growing that journal forever.
    if (controls.length + queue.length > 256) checkpoint();
    let paused = false, owner: number | null = null, reason: string | null = null;
    for (const entry of queue) {
      const record = entry.record;
      const value = record.source === 'lifecycle' ? record.control.paused : isPauseControl(record.envelope) && record.envelope.command.paused;
      if (value) {
        paused = true; owner = record.source === 'player' ? record.envelope.id.player : null;
        reason = record.source === 'lifecycle' ? record.control.reason : 'player';
      }
      controls.push(record); controlRevision++;
      if (record.source === 'lifecycle') appliedLifecycleOrdinal = record.ordinal;
      if (record.source === 'player') {
        const outcome: CommandResult = { id: record.envelope.id, tick: state.tick, status: 'applied' };
        controlResults.push(outcome); result(entry.binding!, outcome);
      }
    }
    phase = paused ? 'paused' : 'running'; pauseOwner = owner; pauseReason = reason;
    driver.setPaused(paused);
    if (paused) held.forEach((h) => { h.moveX = 0; h.moveY = 0; h.interactHeld = false; });
    publishCompletedState();
  }
  function executeTick(_nextTick: number, deadline: number): void {
    // Producer opportunities happen outside execution; absent or failed producers never gate ticks.
    try { deps.beforeTick?.(state.tick, deadline); } catch { /* producer failed: run with admitted input */ }
    drainIngress();
    // Controls received here wait for the next pump; they cannot leak into the sim phase.
    const frozen = pending; pending = [];
    const input: MigrationTickInput = { held: held.map((h) => ({ ...h })), commands: [], legacyCardInput: [] };
    for (const entry of frozen) {
      if ('kind' in entry.envelope) (input.legacyCardInput as AdmittedEnvelope[]).push(entry.envelope);
      else (input.commands as CommandEnvelope[]).push(entry.envelope);
    }
    const record: JournalTick = { tick: state.tick, input, heldSequences: [...heldSequences], results: controlResults, controls }; controls = []; controlResults = []; ticks.push(record);
    const executed = stepCommands(state, input); record.results = [...record.results, ...executed];
    for (const value of executed) { const entry = frozen.find((p) => p.envelope.id.player === value.id.player && p.envelope.id.sequence === value.id.sequence); if (entry) result(entry.binding, value); }
    tickTimeMs = deadline;
    if (state.ended) {
      phase = 'ended'; driver.dispose(); applyControls();
      const event = { runId: deps.init.runId, eventSequence: ++eventSequence, tick: state.tick, payload: { kind: 'ended' as const, record: telemetryRecord(state, deps.init.seed) } };
      for (const binding of bindings) send(binding, { kind: 'event', event }, true);
    }
    publishCompletedState();
    if (state.tick % 300 === 0) checkpoint();
  }
  function pump(): void {
    if (disposed || pumping) return;
    pumping = true;
    try {
      try { deps.beforeControls?.(); } catch { /* absent producer never prevents authority progress */ }
      drainIngress();
      // Accrue through this boundary before any pause control changes the active epoch.
      driver.setPaused(phase !== 'running');
      applyControls();
      driver.pump();
    } catch (error) {
      phase = 'error'; driver.dispose(); applyControls(); let snapshotAfterFault: Snapshot | null = null;
      try { snapshotAfterFault = saveSnapshot(state); } catch { /* corrupted state */ }
      deps.onCrash({ tick: state.tick, seed: deps.init.seed, error: String(error), baseline, baselineHighWater, baselineHeldSequences, baselineControlRevision, baselineLifecycleOrdinal, baselineHeld, baselineControlState, ticks, snapshotAfterFault });
    } finally { pumping = false; }
  }
  const driver = createTickDriver(deps.clock, { schedule: (delay) => deps.scheduler.schedule(delay, pump) }, executeTick);
  if (phase === 'ended') driver.dispose();
  const unbindLifecycle = deps.bindLifecyclePause?.((control) => {
    if (disposed || phase === 'ended' || phase === 'error') return;
    if (typeof control.paused !== 'boolean' || !control.reason || control.reason.length > 128) throw new Error('invalid lifecycle control');
    if (controlQueue.length >= 256 || !Number.isSafeInteger(lifecycleOrdinal + 1)) throw new Error('lifecycle control capacity');
    controlQueue.push({ record: { source: 'lifecycle', order: ++receiveOrder, ordinal: ++lifecycleOrdinal, control: { ...control } } });
  });
  return {
    attach(link: Link, players: readonly number[]): Unsubscribe {
      if (disposed || players.some((p) => !Number.isInteger(p) || p < 0 || p >= state.playerCount || [...bindings].some((b) => b.players.includes(p))) || new Set(players).size !== players.length) throw new Error('invalid player ownership');
      const binding: Binding = { link, players: [...players], ledger, ingress: [], unsubscribe: [] }; bindings.add(binding);
      const detach = (): void => {
        if (!bindings.delete(binding)) return;
        for (const off of binding.unsubscribe) off();
        for (const entry of pending) if (entry.binding === binding) ledger.finish({ id: entry.envelope.id, tick: state.tick, status: 'rejected', reason: 'unavailable' });
        pending = pending.filter((p) => p.binding !== binding);
        for (const entry of controlQueue) if (entry.binding === binding && entry.record.source === 'player') ledger.finish({ id: entry.record.envelope.id, tick: state.tick, status: 'rejected', reason: 'unavailable' });
        controlQueue = controlQueue.filter((entry) => entry.binding !== binding);
        for (const p of players) held[p] = { moveX: 0, moveY: 0, interactHeld: false };
      };
      binding.unsubscribe.push(link.onMessage((_kind, bytes) => {
        try { const message = decodeMessage(bytes); if (message.kind === 'state' || message.kind === 'result' || message.kind === 'event') { link.close('invalid-client-message'); return; }
          if (binding.ingress.length >= 256) { link.close('ingress-overflow'); return; } binding.ingress.push({ message, order: ++receiveOrder });
        } catch { link.close('malformed'); }
      }), link.onClose(detach));
      publishCompletedState(); return detach;
    },
    pump, publishCompletedState,
    dispose(): void { if (disposed) return; disposed = true; driver.dispose(); unbindLifecycle?.(); for (const binding of bindings) for (const off of binding.unsubscribe) off(); bindings.clear(); pending = []; controls = []; controlQueue = []; }
  };
}
