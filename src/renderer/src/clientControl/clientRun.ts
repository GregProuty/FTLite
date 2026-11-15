import type { AuthorityEvent, CommandResult, Link, PlayerId, PublishedState } from '../net/contracts';
import { decodeMessage, encodeMessage } from '../net/codec';
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

export function createClientRun(link: Link, owned: readonly PlayerId[], options: { runId: string; contentDigest?: string; resolveLayout(id: string): ShipLayout; admissionPolicy?: AdmissionPolicy }) {
  let replica: SimState | null = null, publication: PublishedState | null = null, lastEvent = 0, disposed = false;
  const ui = createCardUi(options.runId), results: CommandResult[] = [], events: AuthorityEvent[] = [];
  const auxiliarySequences: number[] = [];
  const receiveTime = options.admissionPolicy === 'receive-time';
  const outboxes = new Map<PlayerId, CommandOutbox>(), outboxStates = new Map<PlayerId, OutboxState>();
  const voteExecutions = new Map<PlayerId, { sequence: number; tick: number }>();
  const commandBudget: CommandBudget | undefined = receiveTime ? (player, control, staged = 0) =>
    !disposed && (outboxes.get(player)?.canAllocate(control, staged) ?? false) : undefined;
  function flushCommands(): void {
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
  const unsubscribe = link.onMessage((_kind, bytes) => {
    const message = decodeMessage(bytes);
    if (disposed) return;
    if (message.kind === 'state') {
      const next = message.state;
      if (next.runId !== options.runId || next.publicationSequence <= (publication?.publicationSequence ?? 0)) return;
      if (next.snapshot.header.formatVersion !== SNAPSHOT_FORMAT || next.snapshot.header.simVersion !== SIM_VERSION) { link.close('state-version'); return; }
      if (next.tick !== next.snapshot.header.tick) throw new Error('publication tick does not match snapshot');
      const values = Float64Array.from(next.snapshot.values);
      if (hashF64(values) !== next.hash) { link.close('state-checksum'); return; }
      if (!replica || next.snapshot.header.layoutId !== replica.layout.id || next.snapshot.header.layoutHash !== replica.derived.layoutHash || next.snapshot.header.playerCount !== replica.playerCount) {
        const replacement = loadSnapshot(JSON.parse(JSON.stringify(options.resolveLayout(next.snapshot.header.layoutId))) as ShipLayout, next.snapshot, options.contentDigest);
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
    } else if (message.kind === 'result' && message.runId === options.runId) {
      const box = outboxes.get(message.result.id.player);
      if (box) outboxStates.set(message.result.id.player, box.ack(message.result));
      reconcileCommandResult(ui, message.result);
      if (receiveTime) {
        const result = message.result, producer = ui.players[result.id.player];
        if ((result.status === 'applied' || result.status === 'noop') && producer?.pendingVote && producer.pendingVoteSequence === result.id.sequence)
          voteExecutions.set(result.id.player, { sequence: result.id.sequence, tick: result.tick });
        reconcileVoteExecutions();
      }
      results.push(message.result); if (results.length > 1024) results.shift();
      if (receiveTime) flushCommands();
    } else if (message.kind === 'event' && message.event.runId === options.runId && message.event.eventSequence > lastEvent) {
      lastEvent = message.event.eventSequence;
      if (events.length >= 1024) { events.length = 0; link.close('event-history-unavailable'); return; }
      events.push(message.event);
    }
  });
  return {
    state: () => replica, publication: () => publication, ui, commandBudget,
    commandStatus(player: PlayerId): CommandProducerStatus {
      const box = outboxes.get(player), allowed = !disposed && owned.includes(player);
      return { state: receiveTime ? outboxStates.get(player) ?? 'waiting-state' : 'ready', pending: box?.size() ?? 0,
        canAllocate: allowed && (!receiveTime || (box?.canAllocate(false) ?? false)),
        canControl: allowed && (!receiveTime || (box?.canAllocate(true) ?? false)) };
    },
    takeEvents(): AuthorityEvent[] {
      if (!publication) return [];
      const ready: AuthorityEvent[] = [];
      while (events.length && events[0]!.tick <= publication.tick) {
        const event = events.shift()!;
        if (event.payload.kind === 'ended' || event.eventSequence > startupSequence!) ready.push(event);
      }
      return ready;
    }, takeResults: () => results.splice(0),
    callout(player: PlayerId): void {
      if (disposed || !owned.includes(player) || (receiveTime && !publication)) return;
      const sequence = (auxiliarySequences[player] ?? 0) + 1;
      if (!Number.isSafeInteger(sequence)) { link.close('auxiliary-sequence-exhausted'); return; }
      auxiliarySequences[player] = sequence;
      link.send('reliable-ordered', encodeMessage({ kind: 'callout', runId: options.runId, player, sequence, calloutKind: 'contextual' }));
    },
    send(actions: ClientActions): void {
      if (disposed || (receiveTime && !publication)) return;
      for (const frame of actions.held) if (owned.includes(frame.player)) link.send('unreliable-latest', encodeMessage({ kind: 'held', frame }));
      for (const envelope of [...actions.commands].sort((a,b) => a.id.player-b.id.player || a.id.sequence-b.id.sequence)) if (owned.includes(envelope.id.player)) {
        if (receiveTime) {
          if (outboxStates.get(envelope.id.player) === 'ready') outboxes.get(envelope.id.player)!.enqueue(envelope);
        } else link.send('reliable-ordered', encodeMessage({ kind: 'command', envelope }));
      }
      if (receiveTime) flushCommands();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { unsubscribe(); }
      finally {
        if (replica) disposeSimState(replica);
        replica = null; publication = null; events.length = 0; results.length = 0;
        outboxes.clear(); outboxStates.clear(); voteExecutions.clear();
      }
    }
  };
}
