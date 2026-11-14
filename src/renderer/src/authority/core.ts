import type { AuthorityMessage, ClientMessage, CommandEnvelope, CommandResult, HeldFrame, HeldInput, LifecyclePause, Link, PublishedState, RunInit, Unsubscribe } from '../net/contracts';
import { decodeMessage, encodeMessage } from '../net/codec';
import { saveSnapshot, type Snapshot } from '../sim/snapshot';
import { hashState } from '../sim/hash';
import { hashF64 } from '../../../shared/hash';
import { assertSimStateLive, disposeSimState, type SimState } from '../sim/state';
import { stepCommands } from '../sim/step';
import { isPauseControl, type TickInput } from '../sim/commands';
import { telemetryRecord } from '../sim/telemetry';
import { createTickDriver } from './tickDriver';
import { createLedger, type AdmittedEnvelope, type Ledger } from './ledger';
import type { AuthorityDeps, AttachOptions } from './authority';
import { inputTickAllowed, REMOTE_HELD_TIMEOUT_MS, type AdmissionPolicy } from '../net/receivePolicy';
import type { AuthorityEvent, ClientAuxMessage } from '../net/contracts';
import { audioCues, cueCounters } from '../events/audioCues';
import { calloutFor } from '../events/callout';
import { replayDataEqual, type ReplayAction, type ReplayFrame, type Replay } from '../sim/replay';
import type { CardUiState } from '../clientControl/cardController';
import { validateCheckpoint, type Checkpoint } from './checkpoint';
import { Life, LifeState } from '../sim/components';

interface Binding { id: number; link: Link; players: readonly number[]; admissionPolicy: AdmissionPolicy; ledger: Ledger; ingress: { message: ClientMessage; order: number; receivedAt?: number }[]; unsubscribe: Unsubscribe[] }
export type JournalControl = { source: 'player'; order: number; envelope: CommandEnvelope } | { source: 'lifecycle'; order: number; ordinal: number; control: LifecyclePause };
export interface JournalTick { tick: number; input: TickInput; heldSequences: readonly number[]; results: readonly CommandResult[]; controls: readonly JournalControl[] }
export interface CrashRecord {
  init: RunInit; checkpoint: Checkpoint; frames: ReplayFrame[]; lastPublishedSequence: number;
  tick: number; seed: number; error: string; baseline: Snapshot;
  baselineHighWater: readonly number[]; baselineHeldSequences: readonly number[];
  baselineControlRevision: number; baselineLifecycleOrdinal: number; ticks: readonly JournalTick[]; snapshotAfterFault: Snapshot | null;
  baselineControlState: { phase: PublishedState['phase']; pauseOwner: number | null; pauseReason: string | null; revision: number };
  baselineHeld: readonly HeldInput[];
}
/** Internal owner. Only the public wrapper constructs it in shipping code. */
export function createAuthorityCore(deps: AuthorityDeps & { init: RunInit }, state: SimState, restored?: Checkpoint, external = false) {
  assertSimStateLive(state);
  try { return createLiveAuthorityCore(deps, state, restored, external); }
  catch (error) { disposeSimState(state); throw error; }
}

function createLiveAuthorityCore(deps: AuthorityDeps & { init: RunInit }, state: SimState, restored?: Checkpoint, external = false) {
  const bindings = new Set<Binding>();
  const held: HeldInput[] = Array.from({ length: state.playerCount }, () => ({ moveX: 0, moveY: 0, interactHeld: false }));
  const heldSequences = Array.from({ length: state.playerCount }, () => 0);
  const heldReceipts: (number | null)[] = heldSequences.map(() => null);
  const ledger = createLedger(Array.from({ length: state.playerCount }, (_, p) => p), state.playerCount);
  let pending: { binding: Binding; envelope: AdmittedEnvelope }[] = [];
  // Captured batches are no longer in pending/controlQueue. Retain their ledger
  // ownership until completion so a fault followed by detach can finish them.
  let inFlight: typeof pending = [];
  let controls: JournalControl[] = [], publicationSequence = 0, eventSequence = 0, controlRevision = 0;
  let receiveOrder = 0, lifecycleOrdinal = 0, appliedLifecycleOrdinal = 0, baselineLifecycleOrdinal = 0;
  let controlQueue: { record: JournalControl; binding?: Binding }[] = [];
  // Recovery never replenishes the persisted gameplay allowance. Its lifetime is
  // one control drain, shared by live ingress and recorded replay admissions.
  const recoveredPlayers = new Set<number>();
  let pauseReason: string | null = null, tickTimeMs: number | null = null;
  let controlResults: CommandResult[] = [];
  let phase: PublishedState['phase'] = state.ended ? 'ended' : 'running', pauseOwner: number | null = null;
  let disposed = false, pumping = false;
  let previousCues = cueCounters(state), completedHash = hashState(state);
  const auxiliarySequences = heldSequences.map(() => 0);
  const pendingCallouts = new Map<number, ClientAuxMessage>();
  let baseline = saveSnapshot(state, deps.contentDigest), baselineHighWater: readonly number[] = heldSequences.slice(), baselineHeldSequences: readonly number[] = heldSequences.slice(), baselineControlRevision = 0;
  let baselineHeld = held.map((h) => ({ ...h }));
  let baselineControlState: CrashRecord['baselineControlState'] = { phase, pauseOwner, pauseReason, revision: controlRevision };
  let ticks: JournalTick[] = [];
  let botMemory: CardUiState[] = [];
  let bindingOrdinal = 0, replaying = false;
  let replayVersion: 2 | 3 = 2;
  let frames: ReplayFrame[] = [], activeFrame: ReplayFrame | null = null;
  const deferredDetaches = new Set<Unsubscribe>();
  let flushingDetaches = false;
  let durableBaseline: Checkpoint;
  const replayBindings = new Map<number, Binding>();
  function begin(action: ReplayAction): void {
    if (activeFrame) throw new Error('nested replay boundary');
    activeFrame = { tick: state.tick, eventSequenceBefore: eventSequence, action: structuredClone(action), results: [], events: [] };
    frames.push(activeFrame);
  }
  function complete(): ReplayFrame {
    const frame = activeFrame!;
    if (phase !== 'error') frame.after = { tick: state.tick, hash: completedHash, phase, eventSequence, publicationSequence, controlRevision };
    if (phase !== 'error') inFlight = [];
    activeFrame = null;
    flushDetaches();
    return frame;
  }
  function flushDetaches(): void {
    if (activeFrame || flushingDetaches) return;
    flushingDetaches = true;
    try {
      for (const detach of deferredDetaches) { deferredDetaches.delete(detach); detach(); }
    } finally { flushingDetaches = false; }
  }

  if (restored) {
    ledger.restore({ commandHighWater: restored.commandHighWater, recentResults: restored.recentResults, admissionTick: restored.admissionTick, admissionCounts: restored.admissionCounts });
    heldSequences.splice(0, heldSequences.length, ...restored.heldHighWater);
    if (!external) held.splice(0, held.length, ...structuredClone(restored.held));
    publicationSequence = restored.publicationSequence; eventSequence = restored.eventSequence; controlRevision = restored.controlRevision;
    receiveOrder = restored.receiveOrder; lifecycleOrdinal = appliedLifecycleOrdinal = restored.lifecycleOrdinal;
    botMemory = structuredClone(restored.botControllers);
    phase = state.ended ? 'ended' : external ? 'paused' : restored.phase;
    pauseOwner = external ? null : restored.pauseOwner; pauseReason = external && !state.ended ? 'restore' : restored.pauseReason;
  }
  function captureCheckpoint(botControllers: readonly CardUiState[] = botMemory): Checkpoint {
    return validateCheckpoint(state.layout, { checkpointVersion: 2, init: deps.init, snapshot: saveSnapshot(state, deps.contentDigest),
      ...ledger.export(), eventSequence, publicationSequence, controlRevision, receiveOrder, lifecycleOrdinal,
      botControllers: [...botControllers], paused: phase === 'paused', phase, pauseOwner, pauseReason,
      heldHighWater: [...heldSequences], held: held.map(h => ({ ...h })) }, deps.contentDigest);
  }
  function sealCheckpoint(botControllers: readonly CardUiState[]): Checkpoint {
    if (disposed || pumping) throw new Error('checkpoint requires completed boundary');
    if (phase === 'error') throw new Error('cannot checkpoint faulted authority');
    // Check controller memory before any admission or acknowledgment side effect.
    captureCheckpointWithBots(botControllers);
    try {
      drainIngress(); applyControls();
      rejectPending();
      botMemory = structuredClone([...botControllers]);
      return captureCheckpoint();
    } catch (error) { recordFault(error); throw error; }
  }
  function rejectPending(): void {
    begin({ kind: 'seal' });
    for (const entry of pending) result(entry.binding, { id: entry.envelope.id, tick: state.tick, status: 'rejected', reason: 'unavailable' });
    pending = [];
    complete();
  }
  function captureCheckpointWithBots(botControllers: readonly CardUiState[]): void {
    // Pending ledger entries are sealed below; validate UI against a detached empty ledger first.
    const empty = createLedger(Array.from({ length: state.playerCount }, (_, p) => p), state.playerCount).export();
    validateCheckpoint(state.layout, { checkpointVersion: 2, init: deps.init, snapshot: saveSnapshot(state, deps.contentDigest), ...empty,
      eventSequence, publicationSequence, controlRevision, receiveOrder, lifecycleOrdinal, botControllers: [...botControllers],
      paused: phase === 'paused', phase, pauseOwner, pauseReason, heldHighWater: [...heldSequences], held }, deps.contentDigest);
  }

  const highWater = (): number[] => ledger.highWater().slice(0, state.playerCount);
  function resetBaseline(refreshBots = true): void {
    if (refreshBots && deps.botControllers) botMemory = structuredClone([...deps.botControllers()]);
    baseline = saveSnapshot(state, deps.contentDigest); baselineHighWater = highWater(); baselineHeldSequences = [...heldSequences];
    baselineControlRevision = controlRevision; baselineLifecycleOrdinal = appliedLifecycleOrdinal;
    baselineHeld = held.map((h) => ({ ...h })); baselineControlState = { phase, pauseOwner, pauseReason, revision: controlRevision };
    ticks = []; controls = []; controlResults = [];
    durableBaseline = captureCheckpoint(); frames = [];
  }
  function send(binding: Binding, message: AuthorityMessage, reliable = false): void {
    if (message.kind === 'result') {
      if (binding.admissionPolicy === 'receive-time') {
        const invalid = message.result.reason === 'unowned' || message.result.reason === 'wrong-run' || message.result.reason === 'malformed';
        const high = invalid ? 0 : ledger.highWater()[message.result.id.player]!;
        message = { ...message, result: { ...message.result, admission: { expectedSequence: high + 1,
          disposition: !invalid && message.result.id.sequence <= high ? 'terminal' : 'retryable' } } };
      }
      activeFrame?.results.push(structuredClone(message.result));
    }
    binding.link.send(reliable ? 'reliable-ordered' : 'unreliable-latest', encodeMessage(message));
  }
  function publishCompletedState(reliable = false): void {
    if (disposed || phase === 'error') return;
    // Hash the exact freshly captured canonical values, avoiding a second field
    // traversal. No state/hash cache: direct fixture mutations remain observable.
    const sequence = ++publicationSequence, snapshot = saveSnapshot(state, deps.contentDigest);
    const publication: PublishedState = { runId: deps.init.runId, tick: state.tick, publicationSequence: sequence,
      snapshot, hash: (completedHash = hashF64(Float64Array.from(snapshot.values))), phase, pauseOwner, pauseReason, controlRevision, lagTicks: driver.lagTicks(), tickTimeMs,
      commandHighWater: highWater(), heldHighWater: [...heldSequences], auxiliaryHighWater: [...auxiliarySequences], eventSequence };
    const bytes = encodeMessage({ kind: 'state', state: publication });
    // A stopped clock cannot replace a lost latest packet. Control boundaries
    // share reliable delivery with the events that depend on their state.
    const channel = reliable || phase === 'paused' || phase === 'ended' ? 'reliable-ordered' : 'unreliable-latest';
    for (const binding of bindings) binding.link.send(channel, bytes);
  }
  function result(binding: Binding, value: CommandResult): void {
    binding.ledger.finish(value); send(binding, { kind: 'result', runId: deps.init.runId, result: value }, true);
  }
  function emit(payload: AuthorityEvent['payload']): void {
    const event: AuthorityEvent = { runId: deps.init.runId, eventSequence: ++eventSequence, tick: state.tick, payload };
    if (payload.kind !== 'callout') activeFrame?.events.push({ eventSequence, tick: state.tick, kind: payload.kind });
    for (const binding of bindings) send(binding, { kind: 'event', event }, true);
  }
  function flushCallouts(): void {
    const hadCallouts = pendingCallouts.size > 0;
    for (const player of [...pendingCallouts.keys()].sort((a, b) => a - b)) {
      if (phase !== 'running' || Life.state[state.crew[player]!] === LifeState.Dead) continue;
      const context = calloutFor(state, player);
      emit({ kind: 'callout', player, text: context.text, station: context.flash });
    }
    pendingCallouts.clear();
    if (hadCallouts) { begin({ kind: 'cursor', receiveOrder }); complete(); }
  }
  function acceptHeld(binding: Binding, frame: HeldFrame, receivedAt?: number): void {
    if (frame.runId !== deps.init.runId || !binding.players.includes(frame.player) || !inputTickAllowed(frame.tick, state.tick, binding.admissionPolicy) || frame.sequence <= heldSequences[frame.player]!) return;
    heldSequences[frame.player] = frame.sequence; held[frame.player] = { ...frame.held };
    if (binding.admissionPolicy === 'receive-time' && !replaying) heldReceipts[frame.player] = receivedAt!;
  }
  function neutralizeExpired(players: number[]): void {
    begin({ kind: 'watchdog', players });
    for (const p of players) { held[p] = { moveX: 0, moveY: 0, interactHeld: false }; heldReceipts[p] = null; }
    complete();
  }
  function expireHeld(): void {
    if (replaying) return;
    const now = deps.clock.nowMs(), expired: number[] = [];
    for (let p = 0; p < held.length; p++) if (heldReceipts[p] !== null && now - heldReceipts[p]! >= REMOTE_HELD_TIMEOUT_MS) {
      heldReceipts[p] = null;
      if (held[p]!.moveX !== 0 || held[p]!.moveY !== 0 || held[p]!.interactHeld) expired.push(p);
    }
    if (expired.length) neutralizeExpired(expired);
  }
  function drainIngress(): void {
    const incoming = [...bindings].flatMap((binding) => binding.ingress.splice(0).map((entry) => ({ ...entry, binding }))).sort((a, b) => a.order - b.order);
    const recorded = incoming.filter(entry => entry.message.kind !== 'callout');
    if (recorded.length) begin({ kind: 'admission', entries: recorded.map(({ binding, message, order }) => ({ binding: binding.id, players: [...binding.players], message: message as Exclude<ClientMessage, { kind: 'callout' }>, order,
      ...(binding.admissionPolicy === 'receive-time' ? { admissionPolicy: binding.admissionPolicy, effectiveTick: state.tick } : {}) })) });
    for (const { binding, message, order, receivedAt } of incoming) {
      if (message.kind === 'held') { acceptHeld(binding, message.frame, receivedAt); continue; }
      if (message.kind === 'callout') {
        if (message.runId === deps.init.runId && binding.players.includes(message.player) && message.sequence > auxiliarySequences[message.player]!) {
          auxiliarySequences[message.player] = message.sequence;
          pendingCallouts.set(message.player, message);
        }
        continue;
      }
      const envelope = message.envelope;
      if (!binding.players.includes(envelope.id.player)) { send(binding, { kind: 'result', runId: deps.init.runId, result: { id: envelope.id, tick: state.tick, status: 'rejected', reason: 'unowned' } }, true); continue; }
      if (envelope.runId !== deps.init.runId) { send(binding, { kind: 'result', runId: deps.init.runId, result: { id: envelope.id, tick: state.tick, status: 'rejected', reason: 'wrong-run' } }, true); continue; }
      const admission = binding.ledger.admit(envelope, state.tick, phase === 'paused' ? recoveredPlayers : undefined, binding.admissionPolicy);
      if (admission.status !== 'queued') {
        send(binding, { kind: 'result', runId: deps.init.runId, result: admission.result }, true);
        if (binding.admissionPolicy === 'receive-time' && admission.result.reason === 'conflicting-duplicate' && !replaying) binding.link.close('conflicting-duplicate');
        continue;
      }
      if (phase === 'ended' || phase === 'error') {
        result(binding, { id: envelope.id, tick: state.tick, status: 'rejected', reason: 'unavailable' });
        continue;
      }
      if (isPauseControl(envelope)) controlQueue.push({ binding, record: { source: 'player', order, envelope } });
      else pending.push({ binding, envelope });
    }
    if (recorded.length) complete();
    if (incoming.some(entry => entry.message.kind === 'callout')) { begin({ kind: 'cursor', receiveOrder }); complete(); }
  }
  function applyControls(): void {
    const queue = controlQueue.sort((a, b) => a.record.order - b.record.order); controlQueue = [];
    recoveredPlayers.clear();
    if (!queue.length) return;
    const nested = activeFrame !== null;
    if (!nested) begin({ kind: 'controls' });
    for (const entry of queue) if (entry.record.source === 'player') inFlight.push({ binding: entry.binding!, envelope: entry.record.envelope });
    if (phase === 'ended' || phase === 'error') {
      for (const entry of queue) if (entry.record.source === 'player') result(entry.binding!, { id: entry.record.envelope.id, tick: state.tick, status: 'rejected', reason: 'unavailable' });
      if (!nested) complete(); return;
    }
    // A long pause can have arbitrarily many trusted focus signals but no sim tick.
    // Checkpoint the completed boundary instead of growing that journal forever.
    // Portable history is rotated only after a complete boundary, below.
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
    emit({ kind: 'pause', paused, owner, reason: reason ?? 'resume' });
    driver.setPaused(paused);
    if (paused) held.forEach((h) => { h.moveX = 0; h.moveY = 0; h.interactHeld = false; });
    publishCompletedState(true);
    complete();
    if (!replaying && controls.length >= 256) { rejectPending(); resetBaseline(); }
  }
  function executeTick(_nextTick: number, deadline: number): void {
    // Producer opportunities happen outside execution; absent or failed producers never gate ticks.
    try { if (!replaying) deps.beforeTick?.(state.tick, deadline); } catch { /* producer failed: run with admitted input */ }
    drainIngress();
    expireHeld();
    flushCallouts();
    // Controls received here wait for the next pump; they cannot leak into the sim phase.
    const frozen = pending; pending = [];
    const input: TickInput = { held: held.map((h) => ({ ...h })), commands: [] };
    for (const entry of frozen) {
      // Admission/dedup always retain the original bytes. The simulator still
      // enforces exact ticks on a separate execution envelope.
      (input.commands as CommandEnvelope[]).push(entry.binding.admissionPolicy === 'receive-time' ? { ...entry.envelope, requestedTick: state.tick } : entry.envelope);
    }
    begin({ kind: 'tick', input, heldSequences: [...heldSequences] });
    inFlight = frozen;
    const record: JournalTick = { tick: state.tick, input, heldSequences: [...heldSequences], results: controlResults, controls }; controls = []; controlResults = []; if (!replaying) ticks.push(record);
    const executed = stepCommands(state, input); record.results = [...record.results, ...executed];
    const nextCues = cueCounters(state);
    for (const cue of audioCues(previousCues, nextCues)) emit({ kind: 'cue', cue });
    previousCues = nextCues;
    for (const value of executed) { const entry = frozen.find((p) => p.envelope.id.player === value.id.player && p.envelope.id.sequence === value.id.sequence); if (entry) result(entry.binding, value); }
    tickTimeMs = deadline;
    if (state.ended) {
      phase = 'ended'; driver.dispose(); applyControls();
      emit({ kind: 'ended', record: telemetryRecord(state, deps.init.seed) });
    }
    publishCompletedState();
    complete();
    if (!replaying && state.tick % 300 === 0) { applyControls(); rejectPending(); resetBaseline(); }
  }
  function pump(): void {
    if (disposed || pumping) return;
    pumping = true;
    try {
      try { deps.beforeControls?.(); } catch { /* absent producer never prevents authority progress */ }
      drainIngress();
      expireHeld();
      // Accrue through this boundary before any pause control changes the active epoch.
      driver.setPaused(phase !== 'running');
      applyControls();
      flushCallouts();
      driver.pump();
      if (!replaying && frames.length > 4096) { applyControls(); rejectPending(); resetBaseline(); }
    } catch (error) { recordFault(error); }
    finally { pumping = false; }
  }
  function recordFault(error: unknown): void {
    // Public checkpoint and attach frames can fail outside pump. Abandon their
    // incomplete frame before flushing cleanup, and preserve the durable baseline.
    activeFrame = null; phase = 'error'; driver.dispose(); flushDetaches(); applyControls(); let snapshotAfterFault: Snapshot | null = null;
    try { snapshotAfterFault = saveSnapshot(state, deps.contentDigest); } catch { /* corrupted state */ }
    deps.onCrash({ init: structuredClone(deps.init), checkpoint: structuredClone(durableBaseline), frames: structuredClone(frames), lastPublishedSequence: publicationSequence, tick: state.tick, seed: deps.init.seed, error: String(error), baseline, baselineHighWater, baselineHeldSequences, baselineControlRevision, baselineLifecycleOrdinal, baselineHeld, baselineControlState, ticks, snapshotAfterFault });
  }
  const driver = createTickDriver(deps.clock, { schedule: (delay) => deps.scheduler.schedule(delay, pump) }, executeTick);
  let unbindLifecycle: void | Unsubscribe = undefined;
  try {
    if (phase === 'ended') driver.dispose();
    else if (phase !== 'running') driver.setPaused(true);
    // Validate the baseline before replacing a live owner's lifecycle callback.
    resetBaseline(!restored);
    unbindLifecycle = deps.bindLifecyclePause?.((control) => {
    if (disposed || phase === 'ended' || phase === 'error') return;
    if (typeof control.paused !== 'boolean' || !control.reason || control.reason.length > 128) throw new Error('invalid lifecycle control');
    if (controlQueue.length >= 256 || !Number.isSafeInteger(lifecycleOrdinal + 1)) throw new Error('lifecycle control capacity');
    begin({ kind: 'lifecycle', order: ++receiveOrder, ordinal: ++lifecycleOrdinal, control: { ...control } });
    controlQueue.push({ record: { source: 'lifecycle', order: receiveOrder, ordinal: lifecycleOrdinal, control: { ...control } } });
    complete();
    });
  } catch (error) {
    disposed = true;
    // Attempt every release without hiding the construction error.
    try { driver.dispose(); } catch { /* cleanup failure */ }
    try { unbindLifecycle?.(); } catch { /* cleanup failure */ }
    throw error;
  }
  return {
    attach(link: Link, players: readonly number[], options: AttachOptions = {}): Unsubscribe {
      const admissionPolicy = options.admissionPolicy ?? 'strict';
      if (admissionPolicy !== 'strict' && admissionPolicy !== 'receive-time') throw new Error('invalid admission policy');
      if (disposed || players.some((p) => !Number.isInteger(p) || p < 0 || p >= state.playerCount || [...bindings].some((b) => b.players.includes(p))) || new Set(players).size !== players.length) throw new Error('invalid player ownership');
      const binding: Binding = { id: ++bindingOrdinal, link, players: [...players], admissionPolicy, ledger, ingress: [], unsubscribe: [] }; bindings.add(binding);
      if (admissionPolicy === 'receive-time') replayVersion = 3;
      const detach = (): void => {
        // Finish the entire captured admission/control/tick batch before changing
        // ownership. Replay sees the outer outcome first, then this detach.
        if (activeFrame) { if (bindings.has(binding)) deferredDetaches.add(detach); return; }
        if (!bindings.delete(binding)) return;
        for (const off of binding.unsubscribe) off();
        begin({ kind: 'detach', binding: binding.id, players: [...binding.players] });
        for (const entry of [...pending, ...inFlight]) if (entry.binding === binding) ledger.finish({ id: entry.envelope.id, tick: state.tick, status: 'rejected', reason: 'unavailable' });
        pending = pending.filter((p) => p.binding !== binding);
        inFlight = inFlight.filter((p) => p.binding !== binding);
        for (const entry of controlQueue) if (entry.binding === binding && entry.record.source === 'player') ledger.finish({ id: entry.record.envelope.id, tick: state.tick, status: 'rejected', reason: 'unavailable' });
        controlQueue = controlQueue.filter((entry) => entry.binding !== binding);
        for (const p of players) { held[p] = { moveX: 0, moveY: 0, interactHeld: false }; heldReceipts[p] = null; }
        complete();
        // Discarded ingress already consumed receive ordinals, including auxiliary bytes.
        binding.ingress.length = 0;
        begin({ kind: 'cursor', receiveOrder }); complete();
      };
      try {
      binding.unsubscribe.push(link.onMessage((_kind, bytes) => {
        try { const message = decodeMessage(bytes); if (message.kind === 'state' || message.kind === 'result' || message.kind === 'event') { link.close('invalid-client-message'); return; }
          if (binding.ingress.length >= 256) { link.close('ingress-overflow'); return; } binding.ingress.push({ message, order: ++receiveOrder,
            ...(admissionPolicy === 'receive-time' && message.kind === 'held' ? { receivedAt: deps.clock.nowMs() } : {}) });
        } catch { link.close('malformed'); }
      }));
      binding.unsubscribe.push(link.onClose(detach));
      begin({ kind: 'publish' }); publishCompletedState(true); complete(); return detach;
      } catch (error) {
        detach();
        if (activeFrame) recordFault(error);
        throw error;
      }
    },
    pump, publishCompletedState, checkpoint: sealCheckpoint,
    replay(): Replay { return structuredClone({ version: replayVersion, init: deps.init, initial: durableBaseline.snapshot, checkpoint: durableBaseline, frames }); },
    replayFrame(frame: ReplayFrame): ReplayFrame {
      if (disposed || activeFrame || frame.tick !== state.tick || frame.eventSequenceBefore < eventSequence) throw new Error('invalid replay boundary');
      replaying = true; eventSequence = frame.eventSequenceBefore;
      const action = frame.action;
      const before = frames.length;
      if (action.kind === 'admission') {
        for (const entry of action.entries) {
          let binding = replayBindings.get(entry.binding);
          if (!binding) {
            binding = { id: entry.binding, players: entry.players, admissionPolicy: entry.admissionPolicy ?? 'strict', ledger, ingress: [], unsubscribe: [], link: { send() {} } as unknown as Link };
            replayBindings.set(entry.binding, binding); bindings.add(binding);
          }
          if (JSON.stringify(binding.players) !== JSON.stringify(entry.players)) throw new Error('replay ownership changed');
          if (binding.admissionPolicy !== (entry.admissionPolicy ?? 'strict') || (entry.effectiveTick !== undefined && entry.effectiveTick !== state.tick)) throw new Error('replay admission mapping changed');
          receiveOrder = Math.max(receiveOrder, entry.order);
          binding.ingress.push({ message: entry.message, order: entry.order });
        }
        drainIngress();
      } else if (action.kind === 'lifecycle') {
        begin(action); receiveOrder = Math.max(receiveOrder, action.order); lifecycleOrdinal = action.ordinal;
        controlQueue.push({ record: { source: 'lifecycle', order: action.order, ordinal: action.ordinal, control: action.control } }); complete();
      } else if (action.kind === 'controls') applyControls();
      else if (action.kind === 'tick') {
        if (phase !== 'running' || !replayDataEqual(action.input.held, held) || JSON.stringify(action.heldSequences) !== JSON.stringify(heldSequences)) throw new Error('replay held divergence');
        executeTick(state.tick, 0);
      } else if (action.kind === 'publish') { begin(action); publishCompletedState(true); complete(); }
      else if (action.kind === 'seal') rejectPending();
      else if (action.kind === 'cursor') { begin(action); receiveOrder = action.receiveOrder; complete(); }
      else if (action.kind === 'watchdog') neutralizeExpired(action.players);
      else {
        begin(action);
        const binding = replayBindings.get(action.binding);
        for (const entry of pending) if (entry.binding === binding) ledger.finish({ id: entry.envelope.id, tick: state.tick, status: 'rejected', reason: 'unavailable' });
        pending = pending.filter(p => p.binding !== binding);
        for (const entry of controlQueue) if (entry.binding === binding && entry.record.source === 'player') ledger.finish({ id: entry.record.envelope.id, tick: state.tick, status: 'rejected', reason: 'unavailable' });
        controlQueue = controlQueue.filter(e => e.binding !== binding);
        if (binding) bindings.delete(binding); replayBindings.delete(action.binding);
        for (const p of action.players) held[p] = { moveX: 0, moveY: 0, interactHeld: false };
        complete();
      }
      const actual = frames[before];
      if (!actual || !replayDataEqual(actual.action, action)) throw new Error('replay action divergence');
      frames.splice(before);
      return actual;
    },
    captureCheckpoint,
    cursors: () => ({ runId: deps.init.runId, publicationSequence, eventSequence, controlRevision }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      const errors: unknown[] = [];
      const cleanup = (action: () => void): void => { try { action(); } catch (error) { errors.push(error); } };
      cleanup(() => driver.dispose()); cleanup(() => unbindLifecycle?.());
      for (const binding of bindings) for (const off of binding.unsubscribe) cleanup(off);
      bindings.clear(); deferredDetaches.clear(); pending = []; inFlight = []; controls = []; controlQueue = []; pendingCallouts.clear();
      disposeSimState(state);
      if (errors.length) throw errors[0];
    }
  };
}
