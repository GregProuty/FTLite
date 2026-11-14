import type { AuthorityEvent, CommandResult, Link, PlayerId, PublishedState } from '../net/contracts';
import { decodeMessage, encodeMessage } from '../net/codec';
import type { ShipLayout } from '../sim/ship/schema';
import type { SimState } from '../sim/state';
import { loadSnapshot } from '../sim/snapshot';
import { unflatten } from '../sim/flatten';
import { hashF64 } from '../../../shared/hash';
import { createCardUi, reconcileUi, type ClientActions } from './cardController';

export function createClientRun(link: Link, owned: readonly PlayerId[], options: { runId: string; resolveLayout(id: string): ShipLayout }) {
  let replica: SimState | null = null, publication: PublishedState | null = null, lastEvent = 0, disposed = false;
  const ui = createCardUi(options.runId), results: CommandResult[] = [], events: AuthorityEvent[] = [];
  const unsubscribe = link.onMessage((_kind, bytes) => {
    const message = decodeMessage(bytes);
    if (disposed) return;
    if (message.kind === 'state') {
      const next = message.state;
      if (next.runId !== options.runId || next.publicationSequence <= (publication?.publicationSequence ?? 0)) return;
      const values = Float64Array.from(next.snapshot.values);
      if (hashF64(values) !== next.hash) { link.close('state-checksum'); return; }
      if (!replica) replica = loadSnapshot(JSON.parse(JSON.stringify(options.resolveLayout(next.snapshot.header.layoutId))) as ShipLayout, next.snapshot);
      else {
        if (next.snapshot.header.layoutHash !== replica.derived.layoutHash || next.snapshot.header.playerCount !== replica.playerCount) throw new Error('incompatible publication');
        unflatten(replica, values);
      }
      publication = next; reconcileUi(replica, ui, next.runId, next.commandHighWater);
    } else if (message.kind === 'result' && message.runId === options.runId) {
      results.push(message.result); if (results.length > 1024) results.shift();
    } else if (message.kind === 'event' && message.event.runId === options.runId && message.event.eventSequence > lastEvent) {
      lastEvent = message.event.eventSequence; events.push(message.event);
    }
  });
  return {
    state: () => replica, publication: () => publication, ui,
    takeEvents: () => events.splice(0), takeResults: () => results.splice(0),
    send(actions: ClientActions): void {
      if (disposed) return;
      for (const frame of actions.held) if (owned.includes(frame.player)) link.send('unreliable-latest', encodeMessage({ kind: 'held', frame }));
      for (const envelope of [...actions.commands, ...actions.legacyCardInput].sort((a,b) => a.id.player-b.id.player || a.id.sequence-b.id.sequence)) if (owned.includes(envelope.id.player)) link.send('reliable-ordered', encodeMessage('kind' in envelope ? envelope : { kind: 'command', envelope }));
    },
    dispose() { disposed = true; unsubscribe(); events.length = 0; results.length = 0; }
  };
}
