// The generic stream client (H-2 spec §4, gap a): everything a client of the authority does that is not cards. It
// accepts and orders publications (run, sequence and watermark checks), keeps a replica through the mode's adapter,
// owns the receive-time outboxes, the notification queues and their byte budget, the ACK gate and neutralize, and
// sends held frames and commands. The sector's createClientRun (clientRun.ts) is this core plus its card hooks; the
// duel's createDuelStreamClient (duelClient.ts) is this core over a DuelState replica. Each mode passes its own codec,
// publication validator and replica adapter, so neither ever reads the other's module state.
import type { AuthorityEvent, AuthorityMessage, CommandEnvelope, CommandResult, HeldFrame, Link, PlayerId, PublishedState } from '../net/contracts';
import type { MessageCodec } from '../net/codec';
import { hashF64 } from '../../../shared/hash';
import { createCommandOutbox, type CommandOutbox, type OutboxState } from './commandOutbox';
import type { AdmissionPolicy } from '../net/receivePolicy';

export interface CommandProducerStatus {
  state: 'waiting-state' | OutboxState;
  pending: number;
  canAllocate: boolean;
  canControl: boolean;
}
/** How a mode keeps its replica: restore in place when `matches`, else load a replacement. */
export interface ReplicaAdapter<S extends { header: { tick: number } }, R> {
  matches(replica: R, header: S['header']): boolean;
  load(snapshot: S): R;
  restore(replica: R, snapshot: S): void;
  dispose(replica: R): void;
  playerCount(replica: R): number;
}
/** Where a player's held sequence lives (the sector keeps it on its card UI, which translateTick advances). */
export interface HeldSequences { has(player: PlayerId): boolean; get(player: PlayerId): number; set(player: PlayerId, value: number): void }
export interface StreamClientOptions<S extends { header: { tick: number } }, R> {
  runId: string; admissionPolicy?: AdmissionPolicy; remoteStreaming?: boolean;
  codec: MessageCodec<S>;
  /** Object validation of a publication (throws when invalid). */
  validatePublication(value: unknown): PublishedState<S>;
  /** The snapshot's format and version are this build's; otherwise the publication is rejected ('state-version'). */
  supported(publication: PublishedState<S>): boolean;
  replica: ReplicaAdapter<S, R>;
  heldSequences: HeldSequences;
  /** After a publication is applied to the replica, before the per-player watermarks (the sector's card reconcile). */
  onAccepted?(replica: R, publication: PublishedState<S>): void;
  /** For each result of this run, after its outbox saw it and before it is queued (the sector's card result hooks). */
  onResult?(result: CommandResult): void;
}
export interface ClientActions { held: readonly HeldFrame[]; commands: readonly CommandEnvelope[] }
/** A receive-time command budget: whether `player` may allocate another command now. */
export type StreamCommandBudget = (player: PlayerId, control: boolean, staged?: number) => boolean;

export function createStreamClient<S extends { header: { tick: number } }, R>(link: Link, owned: readonly PlayerId[], options: StreamClientOptions<S, R>) {
  const { codec, replica: adapter, heldSequences } = options;
  let replica: R | null = null, publication: PublishedState<S> | null = null, lastEvent = 0, disposed = false;
  const results: { value: CommandResult; floor: number; bytes: number }[] = [], events: { value: AuthorityEvent; floor: number; bytes: number }[] = [];
  let notificationBytes = 0;
  let productionEnabled = !options.remoteStreaming;
  const canProduce = () => !disposed && productionEnabled;
  const auxiliarySequences: number[] = [];
  const receiveTime = options.admissionPolicy === 'receive-time';
  const outboxes = new Map<PlayerId, CommandOutbox>(), outboxStates = new Map<PlayerId, OutboxState>();
  const commandBudget: StreamCommandBudget | undefined = receiveTime ? (player, control, staged = 0) =>
    canProduce() && (outboxes.get(player)?.canAllocate(control, staged) ?? false) : undefined;
  function flushCommands(): void {
    if (!canProduce()) return;
    for (const box of outboxes.values()) for (const envelope of box.takeSendable())
      link.send('reliable-ordered', codec.encodeMessage({ kind: 'command', envelope }));
  }
  let startupSequence: number | null = null;
  function applyPublication(next: PublishedState<S>, strictBytes = false): 'accepted' | 'ignored' | 'rejected' {
      if (disposed || next.runId !== options.runId || next.publicationSequence <= (publication?.publicationSequence ?? 0)) return 'ignored';
      if (!options.supported(next)) { if (strictBytes) link.close('state-version'); return 'rejected'; }
      if (next.tick !== next.snapshot.header.tick) { if (strictBytes) throw Error('publication tick does not match snapshot'); return 'rejected'; }
      if (receiveTime && next.commandHighWater.some((high, player) => owned.includes(player) && !Number.isSafeInteger(high + 1))) return 'rejected';
      const values = Float64Array.from((next.snapshot as unknown as { values: number[] }).values);
      if (hashF64(values) !== next.hash) { if (strictBytes) link.close('state-checksum'); return 'rejected'; }
      if (!replica || !adapter.matches(replica, next.snapshot.header)) {
        const replacement = adapter.load(next.snapshot);
        if (disposed) { adapter.dispose(replacement); return 'ignored'; }
        if (replica) adapter.dispose(replica);
        replica = replacement;
      } else adapter.restore(replica, next.snapshot);
      publication = next; options.onAccepted?.(replica, next);
      // A replacement starts after the authority's admitted IDs; an existing
      // producer may already have newer input in flight and must never rewind.
      for (let player = 0; player < adapter.playerCount(replica); player++) {
        heldSequences.set(player, Math.max(heldSequences.get(player), next.heldHighWater[player]!));
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
    try { return applyPublication(options.validatePublication(value)); } catch { return 'rejected'; }
  }
  /** Trusted mode demultiplexer passes an already codec-validated notification. */
  function acceptNotification(message: Extract<AuthorityMessage<S>, { kind: 'result' | 'event' }>, requiredPublicationSequence = 0): void {
    if (disposed) return;
    if (!Number.isSafeInteger(requiredPublicationSequence) || requiredPublicationSequence < 0) throw Error('invalid notification floor');
    if (message.kind === 'result' && message.runId === options.runId) {
      const box = outboxes.get(message.result.id.player);
      if (box) outboxStates.set(message.result.id.player, box.ack(message.result));
      options.onResult?.(message.result);
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
  function reserveNotification(message: AuthorityMessage<S>): number | null {
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
    const message = codec.decodeMessage(bytes);
    if (disposed) return;
    // decodeMessage already validated the whole publication shape. Preserve the
    // strict path's single snapshot validation inside the replica's load/restore.
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
      if (replica) adapter.dispose(replica);
      replica = null; publication = null; events.length = 0; results.length = 0;
      notificationBytes = 0;
      outboxes.clear(); outboxStates.clear();
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
    state: () => replica, publication: () => publication, commandBudget,
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
      link.send('reliable-ordered', codec.encodeMessage({ kind: 'callout', runId: options.runId, player, sequence, calloutKind: 'contextual' }));
    },
    /** Feel-ii §2.7: a cosmetic crew ping for an owned player, on the auxiliary sequence the callout uses. */
    ping(player: PlayerId, x: number, y: number, target: boolean): void {
      if (!canProduce() || !owned.includes(player) || (receiveTime && !publication) || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const sequence = (auxiliarySequences[player] ?? 0) + 1;
      if (!Number.isSafeInteger(sequence)) { link.close('auxiliary-sequence-exhausted'); return; }
      auxiliarySequences[player] = sequence;
      const clamp = (v: number): number => Math.max(-1e6, Math.min(1e6, v));
      link.send('reliable-ordered', codec.encodeMessage({ kind: 'ping', runId: options.runId, player, sequence, x: clamp(x), y: clamp(y), target }));
    },
    neutralize(player: PlayerId): void {
      // Focus loss stops the ordinary producer. Neutralization only needs a
      // confirmed publication and shares its held sequence with the producer.
      if (disposed || !publication || !owned.includes(player) || !heldSequences.has(player)) return;
      const sequence = heldSequences.get(player) + 1;
      if (!Number.isSafeInteger(sequence)) { link.close('held-sequence-exhausted'); return; }
      heldSequences.set(player, sequence);
      link.send('reliable-ordered', codec.encodeMessage({ kind: 'held', frame: { runId: options.runId, player, tick: publication.tick, sequence,
        held: { moveX: 0, moveY: 0, interactHeld: false } } }));
    },
    send(actions: ClientActions): void {
      if (!canProduce() || (receiveTime && !publication)) return;
      for (const frame of actions.held) if (owned.includes(frame.player)) link.send('unreliable-latest', codec.encodeMessage({ kind: 'held', frame }));
      for (const envelope of [...actions.commands].sort((a,b) => a.id.player-b.id.player || a.id.sequence-b.id.sequence)) if (owned.includes(envelope.id.player)) {
        if (receiveTime) {
          if (outboxStates.get(envelope.id.player) === 'ready') outboxes.get(envelope.id.player)!.enqueue(envelope);
        } else link.send('reliable-ordered', codec.encodeMessage({ kind: 'command', envelope }));
      }
      if (receiveTime) flushCommands();
    },
    dispose
  };
}
export type StreamClient<S extends { header: { tick: number } }, R> = ReturnType<typeof createStreamClient<S, R>>;
