import { decodeMessage, encodeMessage } from '../net/codec';
import type { Admission, CommandEnvelope, CommandReason, CommandResult, LegacyInputEnvelope, PlayerId } from '../net/contracts';

export type AdmittedEnvelope = CommandEnvelope | LegacyInputEnvelope;
export interface Ledger {
  admit(envelope: AdmittedEnvelope, tick: number): Admission;
  finish(result: CommandResult): void;
  highWater(): readonly number[];
}
/** One link's owned players, with one shared semantic/bridge stream per player. */
export function createLedger(owned: readonly PlayerId[]): Ledger {
  const water = [0, 0, 0, 0];
  const pending = new Map<string, { payload: string; tick: number }>();
  const completed = Array.from({ length: 4 }, () => new Map<number, { payload: string; result: CommandResult }>());
  let countTick = -1; const counts = [0, 0, 0, 0];
  function store(player: number, sequence: number, payload: string, result: CommandResult): void {
    const cache = completed[player]!; cache.set(sequence, { payload, result: { ...result, id: { ...result.id } } });
    while (cache.size > 256) cache.delete(cache.keys().next().value!);
  }
  return {
    admit(envelope, tick) {
      const reject = (reason: CommandReason): Admission => ({ status: 'rejected', result: { id: { ...envelope.id }, tick, status: 'rejected', reason } });
      // Canonical codec validation also excludes unknown properties and non-finite payloads.
      let payload: string;
      try {
        const message = 'kind' in envelope ? envelope : { kind: 'command' as const, envelope };
        payload = JSON.stringify(decodeMessage(encodeMessage(message)));
      } catch { return reject('malformed'); }
      const { player, sequence } = envelope.id;
      if (!owned.includes(player)) return reject('unowned');
      const key = `${player}:${sequence}`, waiting = pending.get(key), cached = completed[player]!.get(sequence);
      if (waiting || cached) {
        if ((waiting ?? cached)!.payload !== payload) return reject('conflicting-duplicate');
        return { status: 'duplicate', result: cached ? { ...cached.result, id: { ...cached.result.id } } : { id: { ...envelope.id }, tick: waiting!.tick, status: 'already-processed' } };
      }
      if (sequence <= water[player]!) return { status: 'duplicate', result: { id: { ...envelope.id }, tick, status: 'already-processed' } };
      if (sequence !== water[player]! + 1) return reject('expected-sequence');
      if (countTick !== tick) { countTick = tick; counts.fill(0); }
      if (pending.size >= 256 || counts[player]! >= 16) return reject('over-capacity');
      water[player] = sequence;
      // Control admission uses the next unexecuted tick too, including while paused.
      if (envelope.requestedTick !== tick) {
        const admission = reject('stale-tick');
        if (admission.status === 'rejected') store(player, sequence, payload, admission.result);
        return admission;
      }
      counts[player] = counts[player]! + 1;
      pending.set(key, { payload, tick });
      return { status: 'queued' };
    },
    finish(result) {
      const { player, sequence } = result.id, key = `${player}:${sequence}`, entry = pending.get(key);
      if (!entry) return;
      pending.delete(key); store(player, sequence, entry.payload, result);
    },
    highWater: () => [...water]
  };
}
