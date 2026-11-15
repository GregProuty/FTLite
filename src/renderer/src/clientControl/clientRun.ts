import type { AuthorityEvent, AuthorityMessage, CommandResult, Link, PlayerId, PublishedState } from '../net/contracts';
import { decodeMessage, encodeMessage, validatePublication } from '../net/codec';
import type { ShipLayout } from '../sim/ship/schema';
import { disposeSimState, type SimState } from '../sim/state';
import { loadSnapshot, restoreSnapshot, SNAPSHOT_FORMAT } from '../sim/snapshot';
import { SIM_VERSION } from '../sim/tuning';
import { hashF64 } from '../../../shared/hash';
import { createCardUi, reconcileUi, reconcileCommandResult, type ClientActions, type CommandBudget } from './cardController';
import { createCommandOutbox, type CommandOutbox, type OutboxState } from './commandOutbox';
import type { AdmissionPolicy } from '../net/receivePolicy';

export type ClientRun = ReturnType<typeof createClientRun>;
export interface CommandProducerStatus {
  state: 'waiting-state' | OutboxState;
  pending: number;
  canAllocate: boolean;
  canControl: boolean;
}

export function createClientRun(link: Link, owned: readonly PlayerId[], options: { runId: string; contentDigest?: string; resolveLayout(id: string): ShipLayout; admissionPolicy?: AdmissionPolicy; remoteStreaming?: boolean }) {
  let replica: SimState | null = null, publication: PublishedState | null = null, lastEvent = 0, disposed = false;
  const ui = createCardUi(options.runId), results: { value: CommandResult; floor: number; bytes: number }[] = [], events: { value: AuthorityEvent; floor: number; bytes: number }[] = [];
  let notificationBytes = 0;
  let productionEnabled = !options.remoteStreaming;
  const canProduce = () => !disposed && productionEnabled;
  const auxiliarySequences: number[] = [];
  const receiveTime = options.admissionPolicy === 'receive-time';
  const outboxes = new Map<PlayerId, CommandOutbox>(), outboxStates = new Map<PlayerId, OutboxState>();
  const voteExecutions = new Map<PlayerId, { sequence: number; tick: number }>();
  const commandBudget: CommandBudget | undefined = receiveTime ? (player, control, staged = 0) =>
    canProduce() && (outboxes.get(player)?.canAllocate(control, staged) ?? false) : undefined;
  function flushCommands(): void {
    if (!canProduce()) return;
    for (const box of outboxes.values()) for (const envelope of box.takeSendable())
      link.send('reliable-ordered', encodeMessage({ kind: 'command', envelope }));
  }
  function reconcileVoteExecutions(): void {
    if (!publication) return;
    for (const [player, executed] of voteExecutions) {
      const producer = ui.players[player];
      if (!producer?.pendingVote || producer.pendingVoteSequence !== executed.sequence) voteExecutions.delete(player);
      else if (publication.tick > executed.tick && publication.commandHighWater[player]! >= executed.sequence) {
        producer.pendingVote = null; voteExecutions.delete(player);
      }
    }
  }
  let startupSequence: number | null = null;
  function applyPublication(next: PublishedState, strictBytes = false): 'accepted' | 'ignored' | 'rejected' {
      if (disposed || next.runId !== options.runId || next.publicationSequence <= (publication?.publicationSequence ?? 0)) return 'ignored';
      if (next.snapshot.header.formatVersion !== SNAPSHOT_FORMAT || next.snapshot.header.simVersion !== SIM_VERSION) { if (strictBytes) link.close('state-version'); return 'rejected'; }
      if (next.tick !== next.snapshot.header.tick) { if (strictBytes) throw Error('publication tick does not match snapshot'); return 'rejected'; }
      if (receiveTime && next.commandHighWater.some((high, player) => owned.includes(player) && !Number.isSafeInteger(high + 1))) return 'rejected';
      const values = Float64Array.from(next.snapshot.values);
      if (hashF64(values) !== next.hash) { if (strictBytes) link.close('state-checksum'); return 'rejected'; }
      if (!replica || next.snapshot.header.layoutId !== replica.layout.id || next.snapshot.header.layoutHash !== replica.derived.layoutHash || next.snapshot.header.playerCount !== replica.playerCount) {
        const replacement = loadSnapshot(JSON.parse(JSON.stringify(options.resolveLayout(next.snapshot.header.layoutId))) as ShipLayout, next.snapshot, options.contentDigest);
        if (disposed) { disposeSimState(replacement); return 'ignored'; }
        if (replica) disposeSimState(replica);
        replica = replacement;
      } else restoreSnapshot(replica, next.snapshot, options.contentDigest);
      publication = next; reconcileUi(replica, ui, next.runId, next.commandHighWater, options.admissionPolicy);
      if (receiveTime) reconcileVoteExecutions();
      // A replacement starts after the authority's admitted IDs; an existing
      // producer may already have newer input in flight and must never rewind.
      for (let player = 0; player < replica.playerCount; player++) {
        ui.players[player]!.heldSequence = Math.max(ui.players[player]!.heldSequence, next.heldHighWater[player]!);
        auxiliarySequences[player] = Math.max(auxiliarySequences[player] ?? 0, next.auxiliaryHighWater[player]!);
        if (receiveTime && owned.includes(player)) {
          const expected = next.commandHighWater[player]! + 1, box = outboxes.get(player);
          if (box) outboxStates.set(player, box.reconcile(expected));
          else { outboxes.set(player, createCommandOutbox(player, expected)); outboxStates.set(player, 'ready'); }
        }
      }
      if (startupSequence === null) startupSequence = next.eventSequence;
      if (receiveTime) flushCommands();
      return 'accepted';
  }
  function acceptPublication(value: unknown): 'accepted' | 'ignored' | 'rejected' {
    if (disposed) return 'ignored';
    try { return applyPublication(validatePublication(value)); } catch { return 'rejected'; }
  }
  /** Trusted mode demultiplexer passes an already codec-validated notification. */
  function acceptNotification(message: Extract<AuthorityMessage, { kind: 'result' | 'event' }>, requiredPublicationSequence = 0): void {
    if (disposed) return;
    if (!Number.isSafeInteger(requiredPublicationSequence) || requiredPublicationSequence < 0) throw Error('invalid notification floor');
    if (message.kind === 'result' && message.runId === options.runId) {
      const box = outboxes.get(message.result.id.player);
      if (box) outboxStates.set(message.result.id.player, box.ack(message.result));
      reconcileCommandResult(ui, message.result);
      if (receiveTime) {
        const result = message.result, producer = ui.players[result.id.player];
        if ((result.status === 'applied' || result.status === 'noop') && producer?.pendingVote && producer.pendingVoteSequence === result.id.sequence)
          voteExecutions.set(result.id.player, { sequence: result.id.sequence, tick: result.tick });
        reconcileVoteExecutions();
      }
      const bytes = reserveNotification(message); if (bytes === null) return;
      results.push({ value: message.result, floor: requiredPublicationSequence, bytes }); if (results.length > 1024) notificationBytes -= results.shift()!.bytes;
      if (receiveTime) flushCommands();
    } else if (message.kind === 'event' && message.event.runId === options.runId && message.event.eventSequence > lastEvent) {
      lastEvent = message.event.eventSequence;
      if (events.length >= 1024) { events.length = 0; link.close('event-history-unavailable'); return; }
      const bytes = reserveNotification(message); if (bytes === null) return;
      events.push({ value: message.event, floor: requiredPublicationSequence, bytes });
    }
  }
  function reserveNotification(message: AuthorityMessage): number | null {
    if (!options.remoteStreaming) return 0;
    // Charge serialized bytes plus a conservative envelope reserve, independently
    // of the count bound. Strict clients retain their existing queue policy.
    const bytes = new TextEncoder().encode(JSON.stringify(message)).byteLength + 128;
    if (events.length + results.length >= 1024 || notificationBytes + bytes > 1_048_576) {
      link.close('notification-history-unavailable'); return null;
    }
    notificationBytes += bytes; return bytes;
  }
  const unsubscribe = link.onMessage((_kind, bytes) => {
    const message = decodeMessage(bytes);
    if (disposed) return;
    // decodeMessage already validated the whole publication shape. Preserve the
    // strict path's single snapshot validation inside load/restoreSnapshot.
    if (message.kind === 'state') {
      applyPublication(message.state, true);
    } else if (message.kind === 'result' || message.kind === 'event') acceptNotification(message);
  });
  let offClose = () => {};
  function dispose(): void {
    if (disposed) return;
    disposed = true; productionEnabled = false;
    try { unsubscribe(); offClose(); }
    finally {
      if (replica) disposeSimState(replica);
      replica = null; publication = null; events.length = 0; results.length = 0;
      notificationBytes = 0;
      outboxes.clear(); outboxStates.clear(); voteExecutions.clear();
    }
  }
  if (options.remoteStreaming) { offClose = link.onClose(dispose); if (disposed) offClose(); }
  return {
    acceptPublication, acceptNotification,
    /** Trusted remote adapter calls this only after synchronous validated-state ACK success. */
    acknowledgePublication(sequence: number): boolean {
      if (disposed || !options.remoteStreaming || publication?.publicationSequence !== sequence) return false;
      productionEnabled = true; flushCommands(); return !disposed;
    },
    state: () => replica, publication: () => publication, ui, commandBudget,
    commandStatus(player: PlayerId): CommandProducerStatus {
      const box = outboxes.get(player), allowed = canProduce() && owned.includes(player);
      return { state: !productionEnabled ? 'waiting-state' : receiveTime ? outboxStates.get(player) ?? 'waiting-state' : 'ready', pending: box?.size() ?? 0,
        canAllocate: allowed && (!receiveTime || (box?.canAllocate(false) ?? false)),
        canControl: allowed && (!receiveTime || (box?.canAllocate(true) ?? false)) };
    },
    takeEvents(): AuthorityEvent[] {
      if (!publication) return [];
      const ready: AuthorityEvent[] = [];
      while (events.length && events[0]!.value.tick <= publication.tick && events[0]!.floor <= publication.publicationSequence) {
        const item = events.shift()!; notificationBytes -= item.bytes; const event = item.value;
        if (event.payload.kind === 'ended' || event.eventSequence > startupSequence!) ready.push(event);
      }
      return ready;
    }, takeResults(): CommandResult[] {
      const ready: CommandResult[] = [];
      let retained = 0;
      for (const item of results) {
        if (item.floor <= (publication?.publicationSequence ?? 0)) { notificationBytes -= item.bytes; ready.push(item.value); }
        else results[retained++] = item;
      }
      results.length = retained;
      return ready;
    },
    callout(player: PlayerId): void {
      if (!canProduce() || !owned.includes(player) || (receiveTime && !publication)) return;
      const sequence = (auxiliarySequences[player] ?? 0) + 1;
      if (!Number.isSafeInteger(sequence)) { link.close('auxiliary-sequence-exhausted'); return; }
      auxiliarySequences[player] = sequence;
      link.send('reliable-ordered', encodeMessage({ kind: 'callout', runId: options.runId, player, sequence, calloutKind: 'contextual' }));
    },
    neutralize(player: PlayerId): void {
      // Focus loss stops the ordinary producer. Neutralization only needs a
      // confirmed publication and shares its held sequence with translateTick.
      if (disposed || !publication || !owned.includes(player)) return;
      const producer = ui.players[player]; if (!producer) return;
      const sequence = producer.heldSequence + 1;
      if (!Number.isSafeInteger(sequence)) { link.close('held-sequence-exhausted'); return; }
      producer.heldSequence = sequence;
      link.send('reliable-ordered', encodeMessage({ kind: 'held', frame: { runId: options.runId, player, tick: publication.tick, sequence,
        held: { moveX: 0, moveY: 0, interactHeld: false } } }));
    },
    send(actions: ClientActions): void {
      if (!canProduce() || (receiveTime && !publication)) return;
      for (const frame of actions.held) if (owned.includes(frame.player)) link.send('unreliable-latest', encodeMessage({ kind: 'held', frame }));
      for (const envelope of [...actions.commands].sort((a,b) => a.id.player-b.id.player || a.id.sequence-b.id.sequence)) if (owned.includes(envelope.id.player)) {
        if (receiveTime) {
          if (outboxStates.get(envelope.id.player) === 'ready') outboxes.get(envelope.id.player)!.enqueue(envelope);
        } else link.send('reliable-ordered', encodeMessage({ kind: 'command', envelope }));
      }
      if (receiveTime) flushCommands();
    },
    dispose
  };
}
