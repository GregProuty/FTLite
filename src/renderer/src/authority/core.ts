// The generic authority core (engine refactor spec §6): admission, the tick driver, the journal, checkpoint cadence
// and publication for any encounter. Every gameplay call goes through the EncounterRules hooks; nothing here imports
// a sim. createAuthorityCore is the sector instance, kept for its many callers.
import type { AuthorityMessage, ClientMessage, CommandEnvelope, CommandResult, HeldFrame, HeldInput, LifecyclePause, Link, PublishedState, Unsubscribe } from '../net/contracts';
import { hashF64 } from '../../../shared/hash';
import { isCaptureCause, urgentCapture, type CaptureCause } from '../../../shared/sessionCheckpoint';
import { createTickDriver } from './tickDriver';
import { createLedger, type AdmittedEnvelope, type Ledger } from './ledger';
import type { AttachOptions, AuthorityDeps, EncounterAuthorityDeps } from './authority';
import { inputTickAllowed, REMOTE_HELD_TIMEOUT_MS, type AdmissionPolicy } from '../net/receivePolicy';
import { PING_GAP_MS, type AuthorityEvent, type ClientAuxMessage } from '../net/contracts';
import { replayDataEqual, type ReplayAction, type ReplayFrame, type Replay } from '../sim/replay';
import type { CheckpointOf, EncounterRules, EncounterTypes, FrozenTickInput } from './rules';
import { sectorRules, type SectorTypes } from './sectorRules';
import type { SimState } from '../sim/state';
import type { Checkpoint } from './checkpoint';

/** The core-level pause control, the one command every mode shares (net/contracts.ts). */
function isPauseControl(envelope: CommandEnvelope): envelope is CommandEnvelope & { command: { kind: 'setPaused'; paused: boolean } } {
  return envelope.command.kind === 'setPaused';
}

type Binding<S> = Pick<AttachOptions<S>, 'publicationSink' | 'notificationSink'> & { id: number; link: Link; players: readonly number[]; admissionPolicy: AdmissionPolicy; ledger: Ledger; ingress: { message: ClientMessage; order: number; receivedAt?: number }[]; unsubscribe: Unsubscribe[] };
export type JournalControl = { source: 'player'; order: number; envelope: CommandEnvelope } | { source: 'lifecycle'; order: number; ordinal: number; control: LifecyclePause };
export interface JournalTick { tick: number; input: FrozenTickInput; heldSequences: readonly number[]; results: readonly CommandResult[]; controls: readonly JournalControl[] }
export interface CrashRecord<T extends EncounterTypes = SectorTypes> {
  replayVersion: 2 | 3 | 4;
  init: T['init']; checkpoint: CheckpointOf<T>; frames: ReplayFrame[]; lastPublishedSequence: number;
  tick: number; seed: number; error: string; baseline: T['snapshot'];
  baselineHighWater: readonly number[]; baselineHeldSequences: readonly number[];
  baselineControlRevision: number; baselineLifecycleOrdinal: number; ticks: readonly JournalTick[]; snapshotAfterFault: T['snapshot'] | null;
  baselineControlState: { phase: PublishedState['phase']; pauseOwner: number | null; pauseReason: string | null; revision: number };
  baselineHeld: readonly HeldInput[];
}
/** Internal sector owner. Only the public wrapper constructs it in shipping code. */
export function createAuthorityCore(deps: AuthorityDeps & { init: SectorTypes['init'] }, state: SimState, restored?: Checkpoint, external = false) {
  // The sector core always validated its checkpoints against the live state's own layout.
  return createEncounterCore(sectorRules, { ...deps, resolveLayout: () => state.layout }, state, restored, external);
}
/** Internal owner for any encounter. Only createEncounterAuthority and the replay runner construct it. */
export function createEncounterCore<T extends EncounterTypes>(rules: EncounterRules<T>, deps: EncounterAuthorityDeps<T> & { init: T['init'] }, state: T['state'], restored?: CheckpointOf<T>, external = false) {
  rules.assertLive(state);
  try { return createLiveCore(rules, deps, state, restored, external); }
  catch (error) { rules.dispose(state); throw error; }
}

function createLiveCore<T extends EncounterTypes>(rules: EncounterRules<T>, deps: EncounterAuthorityDeps<T> & { init: T['init'] }, state: T['state'], restored?: CheckpointOf<T>, external = false) {
  type Snap = T['snapshot'];
  type Bind = Binding<Snap>;
  const players = rules.playerCount(state);
  const { decodeMessage, encodeMessage } = rules.commandCodec();
  const tickOf = (): number => rules.tick(state);
  const ended = (): boolean => rules.terminal(state, deps.init).ended;
  const snapshotOf = (): Snap => rules.snapshot(state, deps.contentDigest);
  const validate = (value: unknown): CheckpointOf<T> => rules.validateCheckpoint(value, deps.contentDigest, deps.resolveLayout);
  const memory = (): { modeMemory?: unknown } => rules.memory ? { modeMemory: rules.memory(state) } : {};
  const bindings = new Set<Bind>();
  const held: HeldInput[] = Array.from({ length: players }, () => ({ moveX: 0, moveY: 0, interactHeld: false }));
  const heldSequences = Array.from({ length: players }, () => 0);
  const heldReceipts: (number | null)[] = heldSequences.map(() => null);
  const ledger = createLedger(Array.from({ length: players }, (_, p) => p), players, rules.commandCodec);
  let pending: { binding: Bind; envelope: AdmittedEnvelope }[] = [];
  // Captured batches are no longer in pending/controlQueue. Retain their ledger
  // ownership until completion so a fault followed by detach can finish them.
  let inFlight: typeof pending = [];
  let controls: JournalControl[] = [], publicationSequence = 0, eventSequence = 0, controlRevision = 0;
  let receiveOrder = 0, lifecycleOrdinal = 0, appliedLifecycleOrdinal = 0, baselineLifecycleOrdinal = 0;
  let controlQueue: { record: JournalControl; binding?: Bind }[] = [];
  // Recovery never replenishes the persisted gameplay allowance. Its lifetime is
  // one control drain, shared by live ingress and recorded replay admissions.
  const recoveredPlayers = new Set<number>();
  let pauseReason: string | null = null, tickTimeMs: number | null = null;
  let controlResults: CommandResult[] = [];
  let phase: PublishedState['phase'] = ended() ? 'ended' : deps.sessionGate ? 'paused' : 'running', pauseOwner: number | null = null;
  if (deps.sessionGate && !ended()) pauseReason = 'session-bootstrap';
  let bootstrap = !!deps.sessionGate && !restored, fenced = false, fencePending = false, settlingFence = false;
  let disposed = false, pumping = false;
  let previousCues = rules.cueBaseline(state), completedHash = rules.hash(state);
  const auxiliarySequences = heldSequences.map(() => 0);
  const pendingCallouts = new Map<number, ClientAuxMessage>();
  const lastPings: (number | undefined)[] = [];   // Feel-ii §2.7: each player's last relayed ping (ms), the one-a-second limit
  let baseline = snapshotOf(), baselineHighWater: readonly number[] = heldSequences.slice(), baselineHeldSequences: readonly number[] = heldSequences.slice(), baselineControlRevision = 0;
  let baselineHeld = held.map((h) => ({ ...h }));
  let baselineControlState: CrashRecord['baselineControlState'] = { phase, pauseOwner, pauseReason, revision: controlRevision };
  let ticks: JournalTick[] = [];
  let botMemory: T['controllers'] = rules.initialControllers();
  let bindingOrdinal = 0, replaying = false;
  let replayVersion: 2 | 3 | 4 = 2;
  let frames: ReplayFrame[] = [], activeFrame: ReplayFrame | null = null;
  const deferredDetaches = new Set<Unsubscribe>();
  let flushingDetaches = false;
  let durableBaseline!: CheckpointOf<T>;
  let captureCause: CaptureCause | undefined, capturing = false;
  const captureWaiters: { resolve(value: { checkpoint: CheckpointOf<T>; cause: CaptureCause }): void; reject(error: Error): void }[] = [];
  let observedVisit = rules.safePointKey(state), observedRevision = controlRevision;
  let observedPhase: PublishedState['phase'] = phase;
  function queueCapture(cause: CaptureCause): void { captureCause = urgentCapture(captureCause, cause); }
  function rejectCaptures(): void {
    captureCause = undefined;
    for (const waiter of captureWaiters.splice(0)) waiter.reject(Error('capture unavailable'));
  }
  function deliverCapture(checkpoint: CheckpointOf<T>, cause: CaptureCause): boolean {
    // Own the bytes/state before any reentrant observer can mutate or admit input.
    const captured = structuredClone(checkpoint), waiters = captureWaiters.slice();
    captureCause = undefined;
    try { deps.onCheckpoint?.(captured, cause); } catch {
      // Encoding/delivery can fail independently of a valid live simulation.
      // Retain the request, not another byte snapshot, for the next boundary.
      captureCause = urgentCapture(captureCause, cause); return false;
    }
    captureWaiters.splice(0, waiters.length);
    for (const waiter of waiters) waiter.resolve({ checkpoint: captured, cause });
    return true;
  }
  function flushCapture(completedBaseline?: CheckpointOf<T>): void {
    if (replaying || activeFrame || capturing || !captureCause) return;
    if (disposed || phase === 'error') { rejectCaptures(); return; }
    capturing = true;
    try {
      if (captureCause === 'exit') {
        drainIngress(); lifecycle({ paused: true, reason: 'session-exit' }); applyControls(); rejectPending();
      } else if (phase === 'paused' || phase === 'ended') {
        // Stopped clocks cannot wait for another tick to finish admitted work.
        drainIngress(); applyControls(); rejectPending();
      }
      if ((phase as PublishedState['phase']) === 'error' || disposed) { rejectCaptures(); return; }
      // Never project pending ledger entries away to manufacture a valid save.
      if (pending.length || inFlight.length || controlQueue.some(c => c.record.source === 'player')) return;
      const cause = captureCause!;
      const checkpoint = completedBaseline && cause === 'periodic' ? completedBaseline
        : captureCheckpoint(deps.botControllers ? deps.botControllers() : botMemory);
      if (!deliverCapture(checkpoint, cause)) { if (phase !== 'running') rejectCaptures(); return; }
      observedPhase = phase; observedRevision = controlRevision; observedVisit = rules.safePointKey(state);
    } catch { if (phase !== 'running' || disposed) rejectCaptures(); }
    finally { capturing = false; }
  }
  function observeCaptureBoundary(): void {
    if (!deps.onCheckpoint || replaying || phase === 'error') return;
    const visit = rules.safePointKey(state);
    if (visit !== observedVisit || phase === 'ended' && observedPhase !== 'ended') queueCapture('safe-point');
    if (phase === 'paused' && observedPhase !== 'paused') queueCapture('pause');
    else if (phase === 'paused' && controlRevision !== observedRevision) queueCapture('paused-control');
    observedVisit = visit; observedPhase = phase; observedRevision = controlRevision;
  }
  const replayBindings = new Map<number, Bind>();
  function begin(action: ReplayAction): void {
    if (activeFrame) throw new Error('nested replay boundary');
    activeFrame = { tick: tickOf(), eventSequenceBefore: eventSequence, action: structuredClone(action), results: [], events: [] };
    frames.push(activeFrame);
  }
  function complete(): ReplayFrame {
    const frame = activeFrame!;
    if (phase !== 'error') frame.after = { tick: tickOf(), hash: completedHash, phase, eventSequence, publicationSequence, controlRevision };
    if (phase !== 'error') inFlight = [];
    activeFrame = null;
    settleFence();
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
    botMemory = structuredClone(restored.botControllers) as T['controllers'];
    phase = ended() ? 'ended' : external ? 'paused' : restored.phase;
    pauseOwner = external ? null : restored.pauseOwner; pauseReason = external && !ended() ? 'restore' : restored.pauseReason;
  }
  function captureCheckpoint(botControllers: Readonly<T['controllers']> = botMemory): CheckpointOf<T> {
    return validate({ checkpointVersion: 2, init: deps.init, snapshot: snapshotOf(),
      ...ledger.export(), eventSequence, publicationSequence, controlRevision, receiveOrder, lifecycleOrdinal,
      botControllers: structuredClone(botControllers), paused: phase === 'paused', phase, pauseOwner, pauseReason,
      heldHighWater: [...heldSequences], held: held.map(h => ({ ...h })), ...memory() });
  }
  function sealCheckpoint(botControllers: Readonly<T['controllers']>): CheckpointOf<T> {
    if (disposed || pumping) throw new Error('checkpoint requires completed boundary');
    if (phase === 'error') throw new Error('cannot checkpoint faulted authority');
    // Check controller memory before any admission or acknowledgment side effect.
    captureCheckpointWithBots(botControllers);
    try {
      drainIngress(); applyControls();
      rejectPending();
      botMemory = structuredClone(botControllers) as T['controllers'];
      return captureCheckpoint();
    } catch (error) { recordFault(error); throw error; }
  }
  function rejectPending(discardLifecycleResumes = false): void {
    const discardResumes = discardLifecycleResumes && controlQueue.some(entry => entry.record.source === 'lifecycle' && !entry.record.control.paused);
    if (discardResumes) replayVersion = 4;
    begin({ kind: 'seal', ...(discardResumes ? { discardLifecycleResumes: true as const } : {}) });
    for (const entry of pending) result(entry.binding, { id: entry.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
    pending = [];
    for (const entry of controlQueue) if (entry.record.source === 'player') result(entry.binding!, {
      id: entry.record.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
    // A seal settles deferred player controls as well as simulation commands.
    // A fenced seal rejects earlier trusted Resume intents as well. Record that
    // external lifecycle effect explicitly, preserving ordinary/legacy seals.
    controlQueue = controlQueue.filter(entry => entry.record.source === 'lifecycle' && (!discardResumes || entry.record.control.paused));
    complete();
  }
  function lifecycle(control: LifecyclePause): void {
    begin({ kind: 'lifecycle', order: ++receiveOrder, ordinal: ++lifecycleOrdinal, control: { ...control } });
    controlQueue.push({ record: { source: 'lifecycle', order: receiveOrder, ordinal: lifecycleOrdinal, control: { ...control } } });
    complete();
  }
  function settleFence(): void {
    if (!fencePending || activeFrame || settlingFence || disposed) return;
    settlingFence = true; fencePending = false;
    try {
      rejectPending(true);
      pendingCallouts.clear();
      // Existing watchdog/lifecycle records make offline replay independent of a live lease.
      if (replayVersion === 2) replayVersion = 3;
      neutralizeExpired(held.map((_, player) => player));
      lifecycle({ paused: true, reason: 'session-fenced' });
      applyControls();
    } finally { settlingFence = false; }
  }
  function permitted(allowBootstrap = false): boolean {
    if (replaying || !deps.sessionGate) return true;
    let allowed = false;
    try { allowed = deps.sessionGate.check().allowed === true; } catch { /* permission failures always close */ }
    if (!allowed) {
      if (!fenced) { fenced = true; fencePending = true; }
      settleFence(); return false;
    }
    if (fencePending || settlingFence) return false;
    if (fenced) { driver.resetPausedEpoch(); fenced = false; }
    return allowBootstrap || !bootstrap;
  }
  function rejectIngress(binding: Bind, message: ClientMessage): void {
    if (message.kind === 'command') send(binding, { kind: 'result', runId: deps.init.runId,
      result: { id: message.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' } }, true, false);
  }
  function captureCheckpointWithBots(botControllers: Readonly<T['controllers']>): void {
    // Pending ledger entries are sealed below; validate UI against a detached empty ledger first.
    const empty = createLedger(Array.from({ length: players }, (_, p) => p), players, rules.commandCodec).export();
    validate({ checkpointVersion: 2, init: deps.init, snapshot: snapshotOf(), ...empty,
      eventSequence, publicationSequence, controlRevision, receiveOrder, lifecycleOrdinal, botControllers: structuredClone(botControllers),
      paused: phase === 'paused', phase, pauseOwner, pauseReason, heldHighWater: [...heldSequences], held, ...memory() });
  }

  const highWater = (): number[] => ledger.highWater().slice(0, players);
  function resetBaseline(refreshBots = true): void {
    if (refreshBots && deps.botControllers) botMemory = structuredClone(deps.botControllers()) as T['controllers'];
    baseline = snapshotOf(); baselineHighWater = highWater(); baselineHeldSequences = [...heldSequences];
    baselineControlRevision = controlRevision; baselineLifecycleOrdinal = appliedLifecycleOrdinal;
    baselineHeld = held.map((h) => ({ ...h })); baselineControlState = { phase, pauseOwner, pauseReason, revision: controlRevision };
    ticks = []; controls = []; controlResults = [];
    durableBaseline = captureCheckpoint(); frames = [];
  }
  function send(binding: Bind, message: AuthorityMessage<Snap>, reliable = false, journal = true): void {
    if (message.kind === 'result') {
      if (binding.admissionPolicy === 'receive-time') {
        const invalid = message.result.reason === 'unowned' || message.result.reason === 'wrong-run' || message.result.reason === 'malformed';
        const high = invalid ? 0 : ledger.highWater()[message.result.id.player]!;
        message = { ...message, result: { ...message.result, admission: { expectedSequence: high + 1,
          disposition: !invalid && message.result.id.sequence <= high ? 'terminal' : 'retryable' } } };
      }
      if (journal) activeFrame?.results.push(structuredClone(message.result));
    }
    if (binding.notificationSink && (message.kind === 'result' || message.kind === 'event')) {
      const covering = activeFrame?.action.kind === 'tick' || activeFrame?.action.kind === 'controls';
      binding.notificationSink(structuredClone(message), publicationSequence + (covering ? 1 : 0));
    } else binding.link.send(reliable ? 'reliable-ordered' : 'unreliable-latest', encodeMessage(message));
  }
  function publishCompletedState(reliable = false): void {
    if (disposed || phase === 'error') return;
    // Hash the exact freshly captured canonical values, avoiding a second field
    // traversal. No state/hash cache: direct fixture mutations remain observable.
    const sequence = ++publicationSequence, snapshot = snapshotOf();
    const publication: PublishedState<Snap> = { runId: deps.init.runId, tick: tickOf(), publicationSequence: sequence,
      snapshot, hash: (completedHash = hashF64(Float64Array.from(snapshot.values))), phase, pauseOwner, pauseReason, controlRevision, lagTicks: driver.lagTicks(), tickTimeMs,
      commandHighWater: highWater(), heldHighWater: [...heldSequences], auxiliaryHighWater: [...auxiliarySequences], eventSequence };
    // A stopped clock cannot replace a lost latest packet. Control boundaries
    // share reliable delivery with the events that depend on their state.
    const channel = reliable || phase === 'paused' || phase === 'ended' ? 'reliable-ordered' : 'unreliable-latest';
    // Detach each streamed publication before any local byte encoding. A stream-only
    // authority is not constrained by the local JSON byte ceiling.
    for (const binding of bindings) if (binding.publicationSink) binding.publicationSink(structuredClone(publication), channel === 'reliable-ordered');
    let bytes: Uint8Array | undefined;
    for (const binding of bindings) if (!binding.publicationSink) {
      bytes ??= encodeMessage({ kind: 'state', state: publication });
      binding.link.send(channel, bytes);
    }
  }
  function result(binding: Bind, value: CommandResult): void {
    binding.ledger.finish(value); send(binding, { kind: 'result', runId: deps.init.runId, result: value }, true);
  }
  function emit(payload: AuthorityEvent['payload']): void {
    const event: AuthorityEvent = { runId: deps.init.runId, eventSequence: ++eventSequence, tick: tickOf(), payload };
    if (payload.kind !== 'callout' && payload.kind !== 'ping') activeFrame?.events.push({ eventSequence, tick: tickOf(), kind: payload.kind });   // cosmetic: never in a frame
    for (const binding of bindings) send(binding, { kind: 'event', event }, true);
  }
  function flushCallouts(): void {
    const hadCallouts = pendingCallouts.size > 0;
    for (const player of [...pendingCallouts.keys()].sort((a, b) => a - b)) {
      const context = phase === 'running' ? rules.callouts(state, player) : null;
      if (!context) continue;
      emit({ kind: 'callout', player, text: context.text, station: context.station });
    }
    pendingCallouts.clear();
    if (hadCallouts) { begin({ kind: 'cursor', receiveOrder }); complete(); }
  }
  function acceptHeld(binding: Bind, frame: HeldFrame, receivedAt?: number): void {
    if (frame.runId !== deps.init.runId || !binding.players.includes(frame.player) || !inputTickAllowed(frame.tick, tickOf(), binding.admissionPolicy) || frame.sequence <= heldSequences[frame.player]!) return;
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
      if (held[p]!.moveX !== 0 || held[p]!.moveY !== 0 || held[p]!.interactHeld || held[p]!.face === true) expired.push(p);
    }
    if (expired.length) neutralizeExpired(expired);
  }
  function drainIngress(batch?: (Bind['ingress'][number] & { binding: Bind })[]): void {
    const incoming = batch ?? [...bindings].flatMap((binding) => binding.ingress.splice(0).map((entry) => ({ ...entry, binding }))).sort((a, b) => a.order - b.order);
    // Each leased admission is its own completed journal boundary. A synchronous
    // result observer may fence the session before the next queued envelope.
    if (!batch && deps.sessionGate && !replaying && incoming.length) {
      for (const entry of incoming) drainIngress([entry]);
      return;
    }
    if (!permitted()) {
      for (const { binding, message } of incoming) rejectIngress(binding, message);
      if (incoming.length) { begin({ kind: 'cursor', receiveOrder }); complete(); }
      return;
    }
    const recorded = incoming.filter(entry => entry.message.kind !== 'callout' && entry.message.kind !== 'ping');
    if (recorded.length) begin({ kind: 'admission', entries: recorded.map(({ binding, message, order }) => ({ binding: binding.id, players: [...binding.players], message: message as Exclude<ClientMessage, { kind: 'callout' | 'ping' }>, order,
      ...(binding.admissionPolicy === 'receive-time' ? { admissionPolicy: binding.admissionPolicy, effectiveTick: tickOf() } : {}) })) });
    const pings: Extract<AuthorityEvent['payload'], { kind: 'ping' }>[] = [];   // emitted after complete(): a ping's eventSequence never lands in an admission frame
    for (const { binding, message, order, receivedAt } of incoming) {
      if (message.kind === 'held') { acceptHeld(binding, message.frame, receivedAt); continue; }
      if (message.kind === 'callout') {
        if (message.runId === deps.init.runId && binding.players.includes(message.player) && message.sequence > auxiliarySequences[message.player]!) {
          auxiliarySequences[message.player] = message.sequence;
          pendingCallouts.set(message.player, message);
        }
        continue;
      }
      if (message.kind === 'ping') {   // Feel-ii §2.7: relayed at once to every seat, at most one a second a player, never journalled
        if (message.runId === deps.init.runId && binding.players.includes(message.player) && message.sequence > auxiliarySequences[message.player]!) {
          auxiliarySequences[message.player] = message.sequence;
          const now = deps.clock.nowMs(), last = lastPings[message.player];
          if (!replaying && phase === 'running' && (last === undefined || now - last >= PING_GAP_MS)) { lastPings[message.player] = now; pings.push({ kind: 'ping', player: message.player, x: message.x, y: message.y, target: message.target }); }
        }
        continue;
      }
      const envelope = message.envelope;
      if (!binding.players.includes(envelope.id.player)) { send(binding, { kind: 'result', runId: deps.init.runId, result: { id: envelope.id, tick: tickOf(), status: 'rejected', reason: 'unowned' } }, true); continue; }
      if (envelope.runId !== deps.init.runId) { send(binding, { kind: 'result', runId: deps.init.runId, result: { id: envelope.id, tick: tickOf(), status: 'rejected', reason: 'wrong-run' } }, true); continue; }
      const admission = binding.ledger.admit(envelope, tickOf(), phase === 'paused' ? recoveredPlayers : undefined, binding.admissionPolicy);
      if (admission.status !== 'queued') {
        send(binding, { kind: 'result', runId: deps.init.runId, result: admission.result }, true);
        if (binding.admissionPolicy === 'receive-time' && admission.result.reason === 'conflicting-duplicate' && !replaying) binding.link.close('conflicting-duplicate');
        continue;
      }
      if (phase === 'ended' || phase === 'error') {
        result(binding, { id: envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
        continue;
      }
      if (isPauseControl(envelope)) controlQueue.push({ binding, record: { source: 'player', order, envelope } });
      else pending.push({ binding, envelope });
    }
    if (recorded.length) complete();
    for (const ping of pings) emit(ping);
    if (incoming.some(entry => entry.message.kind === 'callout' || entry.message.kind === 'ping')) { begin({ kind: 'cursor', receiveOrder }); complete(); }
  }
  function applyControls(replayCutoff?: number): void {
    if (!settlingFence && !permitted() && !controlQueue.every(entry => entry.record.source === 'lifecycle' && entry.record.control.paused)) return;
    const queue = controlQueue.sort((a, b) => a.record.order - b.record.order); controlQueue = [];
    if (replayCutoff !== undefined && (!Number.isSafeInteger(replayCutoff) || replayCutoff < 0 || replayCutoff > queue.length)) throw Error('invalid replay control cutoff');
    recoveredPlayers.clear();
    if (!queue.length) return;
    const nested = activeFrame !== null;
    if (!nested) begin({ kind: 'controls' });
    for (const entry of queue) if (entry.record.source === 'player') inFlight.push({ binding: entry.binding!, envelope: entry.record.envelope });
    if (phase === 'ended' || phase === 'error') {
      for (const entry of queue) if (entry.record.source === 'player') result(entry.binding!, { id: entry.record.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
      if (!nested) complete(); return;
    }
    // A long pause can have arbitrarily many trusted focus signals but no sim tick.
    // Checkpoint the completed boundary instead of growing that journal forever.
    // Portable history is rotated only after a complete boundary, below.
    let paused = false, owner: number | null = null, reason: string | null = null;
    let processedCount = 0;
    for (const entry of queue) {
      const record = entry.record;
      if (replayCutoff !== undefined ? processedCount === replayCutoff
        : (record.source === 'player' || !record.control.paused) && !permitted()) break;
      const value = record.source === 'lifecycle' ? record.control.paused : isPauseControl(record.envelope) && record.envelope.command.paused;
      if (value) {
        paused = true; owner = record.source === 'player' ? record.envelope.id.player : null;
        reason = record.source === 'lifecycle' ? record.control.reason : 'player';
      }
      controls.push(record); controlRevision++;
      if (record.source === 'lifecycle') appliedLifecycleOrdinal = record.ordinal;
      if (record.source === 'player') {
        const outcome: CommandResult = { id: record.envelope.id, tick: tickOf(), status: 'applied' };
        controlResults.push(outcome); result(entry.binding!, outcome);
      }
      processedCount++;
    }
    // Permission may close from the final result callback too. Complete the
    // accepted prefix without publishing Resume; the following existing seal
    // and trusted lifecycle records settle the suffix and publish the pause.
    if (replayCutoff !== undefined || !settlingFence && queue.some(entry => entry.record.source === 'player' || !entry.record.control.paused) && !permitted()) {
      activeFrame!.action = { kind: 'controls', processedCount, fenced: true };
      replayVersion = 4;
      controlQueue.unshift(...queue.slice(processedCount));
      complete();
      return;
    }
    phase = paused ? 'paused' : 'running'; pauseOwner = owner; pauseReason = reason;
    emit({ kind: 'pause', paused, owner, reason: reason ?? 'resume' });
    driver.setPaused(paused);
    if (paused) held.forEach((h) => { h.moveX = 0; h.moveY = 0; h.interactHeld = false; delete h.face; });
    publishCompletedState(true);
    complete();
    if (!replaying && controls.length >= 256) { rejectPending(); resetBaseline(); }
    observeCaptureBoundary();
  }
  function executeTick(_nextTick: number, deadline: number): void {
    if (replaying) { drainIngress(); expireHeld(); flushCallouts(); }
    // Controls received here wait for the next pump; they cannot leak into the sim phase.
    const frozen = pending; pending = [];
    const input: FrozenTickInput = { held: held.map((h) => ({ ...h })), commands: [] };
    for (const entry of frozen) {
      // Admission/dedup always retain the original bytes. The simulator still
      // enforces exact ticks on a separate execution envelope.
      (input.commands as CommandEnvelope[]).push(entry.binding.admissionPolicy === 'receive-time' ? { ...entry.envelope, requestedTick: tickOf() } : entry.envelope);
    }
    begin({ kind: 'tick', input, heldSequences: [...heldSequences] });
    inFlight = frozen;
    const record: JournalTick = { tick: tickOf(), input, heldSequences: [...heldSequences], results: controlResults, controls }; controls = []; controlResults = []; if (!replaying) ticks.push(record);
    const executed = rules.step(state, input); record.results = [...record.results, ...executed];
    const nextCues = rules.cueBaseline(state);
    for (const cue of rules.cues(previousCues, state)) emit({ kind: 'cue', cue });
    for (const payload of rules.records?.(previousCues, state) ?? []) emit(payload);
    previousCues = nextCues;
    for (const value of executed) { const entry = frozen.find((p) => p.envelope.id.player === value.id.player && p.envelope.id.sequence === value.id.sequence); if (entry) result(entry.binding, value); }
    tickTimeMs = deadline;
    const end = rules.terminal(state, deps.init);
    if (end.ended) {
      if (!end.endRecord) throw new Error(`${rules.modeId} rules reported ended without an end record`);
      phase = 'ended'; driver.dispose(); applyControls();
      emit({ kind: 'ended', record: end.endRecord });
    }
    publishCompletedState();
    complete();
    const boundary = tickOf() % 300 === 0;
    if (!replaying && boundary) { applyControls(); rejectPending(); resetBaseline(); }
    observeCaptureBoundary();
    if (!replaying && deps.onCheckpoint && boundary) queueCapture('periodic');
    flushCapture(boundary ? durableBaseline : undefined);
  }
  function pump(): void {
    if (disposed || pumping) return;
    pumping = true;
    try {
      if (!permitted()) { drainIngress(); applyControls(); return; }
      try { deps.beforeControls?.(); } catch { /* absent producer never prevents authority progress */ }
      if (!permitted()) { drainIngress(); applyControls(); return; }
      drainIngress();
      expireHeld();
      // Accrue through this boundary before any pause control changes the active epoch.
      driver.setPaused(phase !== 'running');
      applyControls();
      flushCallouts();
      driver.pump();
      if (!replaying && frames.length > 4096) { applyControls(); rejectPending(); resetBaseline(); }
    } catch (error) { recordFault(error); }
    finally { pumping = false; observeCaptureBoundary(); flushCapture(); }
  }
  function recordFault(error: unknown): void {
    // Public checkpoint and attach frames can fail outside pump. Abandon their
    // incomplete frame before flushing cleanup, and preserve the durable baseline.
    activeFrame = null; phase = 'error'; driver.dispose(); flushDetaches(); applyControls(); let snapshotAfterFault: Snap | null = null;
    rejectCaptures();
    try { snapshotAfterFault = snapshotOf(); } catch { /* corrupted state */ }
    deps.onCrash({ replayVersion, init: structuredClone(deps.init), checkpoint: structuredClone(durableBaseline), frames: structuredClone(frames), lastPublishedSequence: publicationSequence, tick: tickOf(), seed: deps.init.seed, error: String(error), baseline, baselineHighWater, baselineHeldSequences, baselineControlRevision, baselineLifecycleOrdinal, baselineHeld, baselineControlState, ticks, snapshotAfterFault });
  }
  const driver = createTickDriver(deps.clock, { schedule: (delay) => deps.scheduler.schedule(delay, pump) }, executeTick, (_tick, deadline) => {
    if (!permitted()) return false;
    try { deps.beforeTick?.(tickOf(), deadline); } catch { /* producer failure cannot bypass permission */ }
    drainIngress(); expireHeld(); flushCallouts();
    return permitted();
  });
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
    if (!control.paused && !permitted()) return;
    lifecycle(control);
    });
    observedPhase = phase; observedRevision = controlRevision; observedVisit = rules.safePointKey(state);
    if (deps.onCheckpoint) deliverCapture(durableBaseline, 'initial');
  } catch (error) {
    disposed = true;
    // Attempt every release without hiding the construction error.
    try { driver.dispose(); } catch { /* cleanup failure */ }
    try { unbindLifecycle?.(); } catch { /* cleanup failure */ }
    throw error;
  }
  return {
    attach(link: Link, owned: readonly number[], options: AttachOptions<Snap> = {}): Unsubscribe {
      const admissionPolicy = options.admissionPolicy ?? 'strict';
      if (admissionPolicy !== 'strict' && admissionPolicy !== 'receive-time') throw new Error('invalid admission policy');
      if (disposed || owned.some((p) => !Number.isInteger(p) || p < 0 || p >= players || [...bindings].some((b) => b.players.includes(p))) || new Set(owned).size !== owned.length) throw new Error('invalid player ownership');
      const binding: Bind = { id: ++bindingOrdinal, link, players: [...owned], admissionPolicy, publicationSink: options.publicationSink, notificationSink: options.notificationSink, ledger, ingress: [], unsubscribe: [] }; bindings.add(binding);
      if (admissionPolicy === 'receive-time' && replayVersion === 2) replayVersion = 3;
      const detach = (): void => {
        // Finish the entire captured admission/control/tick batch before changing
        // ownership. Replay sees the outer outcome first, then this detach.
        if (activeFrame) { if (bindings.has(binding)) deferredDetaches.add(detach); return; }
        if (!bindings.delete(binding)) return;
        for (const off of binding.unsubscribe) off();
        begin({ kind: 'detach', binding: binding.id, players: [...binding.players] });
        for (const entry of [...pending, ...inFlight]) if (entry.binding === binding) ledger.finish({ id: entry.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
        pending = pending.filter((p) => p.binding !== binding);
        inFlight = inFlight.filter((p) => p.binding !== binding);
        for (const entry of controlQueue) if (entry.binding === binding && entry.record.source === 'player') ledger.finish({ id: entry.record.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
        controlQueue = controlQueue.filter((entry) => entry.binding !== binding);
        for (const p of owned) { held[p] = { moveX: 0, moveY: 0, interactHeld: false }; heldReceipts[p] = null; }
        complete();
        // Discarded ingress already consumed receive ordinals, including auxiliary bytes.
        binding.ingress.length = 0;
        begin({ kind: 'cursor', receiveOrder }); complete();
      };
      try {
      binding.unsubscribe.push(link.onMessage((_kind, bytes) => {
        try { const message = decodeMessage(bytes); if (message.kind === 'state' || message.kind === 'result' || message.kind === 'event') { link.close('invalid-client-message'); return; }
          if (!permitted()) { rejectIngress(binding, message); return; }
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
    requestCheckpoint(cause: CaptureCause): Promise<{ checkpoint: CheckpointOf<T>; cause: CaptureCause }> {
      if (!isCaptureCause(cause) || disposed || phase === 'error' || captureWaiters.length >= 64) return Promise.reject(Error('capture unavailable'));
      queueCapture(cause);
      const result = new Promise<{ checkpoint: CheckpointOf<T>; cause: CaptureCause }>((resolve, reject) => captureWaiters.push({ resolve, reject }));
      // Calls from publication/result observers must leave the open journal frame.
      queueMicrotask(() => { if (!pumping) flushCapture(); });
      return result;
    },
    completeBootstrap(): void {
      if (!bootstrap || disposed || pumping || activeFrame || !permitted(true)) throw Error('bootstrap unavailable');
      bootstrap = false;
      lifecycle({ paused: false, reason: 'session-bootstrap' }); applyControls();
    },
    replay(): Replay<T> { return structuredClone({ version: replayVersion, ...(rules.modeId !== 'sector' ? { mode: rules.modeId } : {}), init: deps.init, initial: durableBaseline.snapshot, checkpoint: durableBaseline, frames }); },
    replayFrame(frame: ReplayFrame): ReplayFrame {
      if (disposed || activeFrame || frame.tick !== tickOf() || frame.eventSequenceBefore < eventSequence) throw new Error('invalid replay boundary');
      replaying = true; eventSequence = frame.eventSequenceBefore;
      const action = frame.action;
      const before = frames.length;
      if (action.kind === 'admission') {
        for (const entry of action.entries) {
          let binding = replayBindings.get(entry.binding);
          if (!binding) {
            binding = { id: entry.binding, players: entry.players, admissionPolicy: entry.admissionPolicy ?? 'strict', ledger, ingress: [], unsubscribe: [], link: { send() {} } as unknown as Link } as Bind;
            replayBindings.set(entry.binding, binding); bindings.add(binding);
          }
          if (JSON.stringify(binding.players) !== JSON.stringify(entry.players)) throw new Error('replay ownership changed');
          if (binding.admissionPolicy !== (entry.admissionPolicy ?? 'strict') || (entry.effectiveTick !== undefined && entry.effectiveTick !== tickOf())) throw new Error('replay admission mapping changed');
          receiveOrder = Math.max(receiveOrder, entry.order);
          binding.ingress.push({ message: entry.message, order: entry.order });
        }
        drainIngress();
      } else if (action.kind === 'lifecycle') {
        begin(action); receiveOrder = Math.max(receiveOrder, action.order); lifecycleOrdinal = action.ordinal;
        controlQueue.push({ record: { source: 'lifecycle', order: action.order, ordinal: action.ordinal, control: action.control } }); complete();
      } else if (action.kind === 'controls') applyControls(action.fenced ? action.processedCount : undefined);
      else if (action.kind === 'tick') {
        if (phase !== 'running' || !replayDataEqual(action.input.held, held) || JSON.stringify(action.heldSequences) !== JSON.stringify(heldSequences)) throw new Error('replay held divergence');
        executeTick(tickOf(), 0);
      } else if (action.kind === 'publish') { begin(action); publishCompletedState(true); complete(); }
      else if (action.kind === 'seal') rejectPending(action.discardLifecycleResumes);
      else if (action.kind === 'cursor') { begin(action); receiveOrder = action.receiveOrder; complete(); }
      else if (action.kind === 'watchdog') neutralizeExpired(action.players);
      else {
        begin(action);
        const binding = replayBindings.get(action.binding);
        for (const entry of pending) if (entry.binding === binding) ledger.finish({ id: entry.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
        pending = pending.filter(p => p.binding !== binding);
        for (const entry of controlQueue) if (entry.binding === binding && entry.record.source === 'player') ledger.finish({ id: entry.record.envelope.id, tick: tickOf(), status: 'rejected', reason: 'unavailable' });
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
      rejectCaptures();
      const errors: unknown[] = [];
      const cleanup = (action: () => void): void => { try { action(); } catch (error) { errors.push(error); } };
      cleanup(() => driver.dispose()); cleanup(() => unbindLifecycle?.());
      for (const binding of bindings) for (const off of binding.unsubscribe) cleanup(off);
      bindings.clear(); deferredDetaches.clear(); pending = []; inFlight = []; controls = []; controlQueue = []; pendingCallouts.clear();
      rules.dispose(state);
      if (errors.length) throw errors[0];
    }
  };
}
