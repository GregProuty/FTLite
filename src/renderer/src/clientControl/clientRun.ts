import type { AuthorityEvent, CommandResult, Link, PlayerId, PublishedState } from '../net/contracts';
import { decodeMessage, encodeMessage } from '../net/codec';
import type { ShipLayout } from '../sim/ship/schema';
import type { SimState } from '../sim/state';
import { loadSnapshot, SNAPSHOT_FORMAT } from '../sim/snapshot';
import { SIM_VERSION } from '../sim/tuning';
import { unflatten } from '../sim/flatten';
import { hashF64 } from '../../../shared/hash';
import { createCardUi, reconcileUi, reconcileCommandResult, type ClientActions } from './cardController';

export type ClientRun = ReturnType<typeof createClientRun>;

export function createClientRun(link: Link, owned: readonly PlayerId[], options: { runId: string; resolveLayout(id: string): ShipLayout }) {
  let replica: SimState | null = null, publication: PublishedState | null = null, lastEvent = 0, disposed = false;
  const ui = createCardUi(options.runId), results: CommandResult[] = [], events: AuthorityEvent[] = [];
  const auxiliarySequences = [0, 0, 0, 0];
  let startupSequence: number | null = null;
  const unsubscribe = link.onMessage((_kind, bytes) => {
    const message = decodeMessage(bytes);
    if (disposed) return;
    if (message.kind === 'state') {
      const next = message.state;
      if (next.runId !== options.runId || next.publicationSequence <= (publication?.publicationSequence ?? 0)) return;
      if (next.snapshot.header.formatVersion !== SNAPSHOT_FORMAT || next.snapshot.header.simVersion !== SIM_VERSION) { link.close('state-version'); return; }
      const values = Float64Array.from(next.snapshot.values);
      if (hashF64(values) !== next.hash) { link.close('state-checksum'); return; }
      if (!replica) replica = loadSnapshot(JSON.parse(JSON.stringify(options.resolveLayout(next.snapshot.header.layoutId))) as ShipLayout, next.snapshot);
      else {
        if (next.snapshot.header.layoutHash !== replica.derived.layoutHash || next.snapshot.header.playerCount !== replica.playerCount) throw new Error('incompatible publication');
        unflatten(replica, values);
      }
      publication = next; reconcileUi(replica, ui, next.runId, next.commandHighWater);
      // A replacement starts after the authority's admitted IDs; an existing
      // producer may already have newer input in flight and must never rewind.
      for (let player = 0; player < replica.playerCount; player++) {
        ui.players[player]!.heldSequence = Math.max(ui.players[player]!.heldSequence, next.heldHighWater[player]!);
        auxiliarySequences[player] = Math.max(auxiliarySequences[player]!, next.auxiliaryHighWater[player]!);
      }
      if (startupSequence === null) startupSequence = next.eventSequence;
    } else if (message.kind === 'result' && message.runId === options.runId) {
      reconcileCommandResult(ui, message.result);
      results.push(message.result); if (results.length > 1024) results.shift();
    } else if (message.kind === 'event' && message.event.runId === options.runId && message.event.eventSequence > lastEvent) {
      lastEvent = message.event.eventSequence;
      if (events.length >= 1024) { events.length = 0; link.close('event-history-unavailable'); return; }
      events.push(message.event);
    }
  });
  return {
    state: () => replica, publication: () => publication, ui,
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
      if (disposed || !owned.includes(player)) return;
      const sequence = auxiliarySequences[player]! + 1;
      if (!Number.isSafeInteger(sequence)) { link.close('auxiliary-sequence-exhausted'); return; }
      auxiliarySequences[player] = sequence;
      link.send('reliable-ordered', encodeMessage({ kind: 'callout', runId: options.runId, player, sequence, calloutKind: 'contextual' }));
    },
    send(actions: ClientActions): void {
      if (disposed) return;
      for (const frame of actions.held) if (owned.includes(frame.player)) link.send('unreliable-latest', encodeMessage({ kind: 'held', frame }));
      for (const envelope of [...actions.commands].sort((a,b) => a.id.player-b.id.player || a.id.sequence-b.id.sequence)) if (owned.includes(envelope.id.player)) link.send('reliable-ordered', encodeMessage({ kind: 'command', envelope }));
    },
    dispose() { disposed = true; unsubscribe(); events.length = 0; results.length = 0; }
  };
}
