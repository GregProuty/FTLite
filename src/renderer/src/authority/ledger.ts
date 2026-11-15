import { createMessageCodec } from '../net/codec';
import { MAX_PLAYERS } from '../../../shared/intent';
import type { Admission, CommandEnvelope, CommandReason, CommandResult, PlayerId } from '../net/contracts';
import { inputTickAllowed, type AdmissionPolicy } from '../net/receivePolicy';

export type AdmittedEnvelope = CommandEnvelope;
export interface LedgerState {
  commandHighWater: number[];
  recentResults: { envelope: CommandEnvelope; result: CommandResult }[];
  admissionTick: number;
  admissionCounts: number[];
}
export interface Ledger {
  /** The paused authority supplies the players already recovered since its last
   * control drain. Only a queued over-budget resume consumes this allowance. */
  admit(envelope: AdmittedEnvelope, tick: number, recoveredPlayers?: Set<PlayerId>, policy?: AdmissionPolicy): Admission;
  finish(result: CommandResult): void;
  highWater(): readonly number[];
  export(): LedgerState;
  restore(value: LedgerState): void;
}
/** One link's owned players, with one shared command stream per player. */
export function createLedger(owned: readonly PlayerId[], playerLimit = MAX_PLAYERS): Ledger {
  const { decodeMessage, encodeMessage } = createMessageCodec(playerLimit);
  if (new Set(owned).size !== owned.length || owned.some(p => !Number.isInteger(p) || p < 0 || p >= playerLimit)) throw new Error('invalid ledger ownership');
  const water = Array<number>(playerLimit).fill(0);
  const pending = new Map<string, { payload: string; tick: number }>();
  const completed = Array.from({ length: playerLimit }, () => new Map<number, { payload: string; result: CommandResult }>());
  let countTick = -1; const counts = Array<number>(playerLimit).fill(0);
  function store(player: number, sequence: number, payload: string, result: CommandResult): void {
    const { admission: _admission, ...semantic } = result;
    const cache = completed[player]!; cache.set(sequence, { payload, result: { ...semantic, id: { ...result.id } } });
    // New terminal capacity rejections can finish before older pending work.
    // The checkpoint invariant requires retaining the high-water result.
    while (cache.size > 256) cache.delete([...cache.keys()].find(id => id !== water[player])!);
  }
  return {
    admit(envelope, tick, recoveredPlayers, policy = 'strict') {
      const respond = (admission: Admission): Admission => {
        if (policy === 'strict' || admission.status === 'queued') return admission;
        const validOwner = owned.includes(envelope.id.player) && admission.result.reason !== 'malformed';
        const high = validOwner ? water[envelope.id.player]! : 0;
        return { ...admission, result: { ...admission.result, admission: {
          expectedSequence: high + 1, disposition: validOwner && envelope.id.sequence <= high ? 'terminal' : 'retryable'
        } } };
      };
      return respond(admit());
      function admit(): Admission {
        const reject = (reason: CommandReason): Admission => ({ status: 'rejected', result: { id: { ...envelope.id }, tick, status: 'rejected', reason } });
        // Canonical codec validation also excludes unknown properties and non-finite payloads.
        let payload: string;
        try {
          const message = { kind: 'command' as const, envelope };
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
        const overBudget = counts[player]! >= 16;
        const recovery = overBudget && recoveredPlayers !== undefined && !recoveredPlayers.has(player)
          && envelope.command.kind === 'setPaused' && envelope.command.paused === false;
        if (pending.size >= 256 || (overBudget && !recovery)) {
          const admission = reject('over-capacity');
          if (policy === 'receive-time') {
            water[player] = sequence;
            if (admission.status === 'rejected') store(player, sequence, payload, admission.result);
          }
          return admission;
        }
        water[player] = sequence;
        // Control admission uses the next unexecuted tick too, including while paused.
        if (!inputTickAllowed(envelope.requestedTick, tick, policy)) {
          const admission = reject('stale-tick');
          if (admission.status === 'rejected') store(player, sequence, payload, admission.result);
          return admission;
        }
        if (recovery) recoveredPlayers!.add(player);
        else counts[player] = counts[player]! + 1;
        pending.set(key, { payload, tick });
        return { status: 'queued' };
      }
    },
    finish(result) {
      const { player, sequence } = result.id, key = `${player}:${sequence}`, entry = pending.get(key);
      if (!entry) return;
      pending.delete(key); store(player, sequence, entry.payload, result);
    },
    highWater: () => [...water],
    export() {
      if (pending.size) throw new Error('cannot checkpoint pending ledger');
      return { commandHighWater: [...water], admissionTick: countTick, admissionCounts: [...counts],
        recentResults: completed.flatMap(cache => [...cache.values()].map(entry => {
          const message = JSON.parse(entry.payload) as { envelope: CommandEnvelope };
          return { envelope: message.envelope, result: structuredClone(entry.result) };
        })) };
    },
    restore(value) {
      const validUInt = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
      if (!value || Object.keys(value).sort().join(',') !== 'admissionCounts,admissionTick,commandHighWater,recentResults' ||
        !Array.isArray(value.commandHighWater) || value.commandHighWater.length !== playerLimit ||
        !Array.isArray(value.admissionCounts) || value.admissionCounts.length !== playerLimit ||
        !Array.isArray(value.recentResults) || value.recentResults.length > 256 * playerLimit ||
        !Number.isSafeInteger(value.admissionTick) || value.admissionTick < -1 ||
        (value.admissionTick === -1 && (value.admissionCounts.some(n => n !== 0) || value.commandHighWater.some(n => n !== 0))) ||
        !Array.from(value.commandHighWater).every(validUInt) || !Array.from(value.admissionCounts).every(n => validUInt(n) && n <= 16)) throw new Error('invalid ledger checkpoint');
      const staged = completed.map(() => new Map<number, { payload: string; result: CommandResult }>());
      for (const entry of value.recentResults) {
        if (!entry || Object.keys(entry).sort().join(',') !== 'envelope,result') throw new Error('invalid ledger result');
        const e = entry.envelope, r = entry.result;
        const payload = JSON.stringify(decodeMessage(encodeMessage({ kind: 'command', envelope: e })));
        decodeMessage(encodeMessage({ kind: 'result', runId: e.runId, result: r }));
        // Wire admission metadata describes a response-time stream, never a persisted semantic outcome.
        if (Object.prototype.hasOwnProperty.call(r, 'admission')) throw new Error('admission metadata in ledger cache');
        if ((r.status === 'rejected') !== (r.reason !== undefined) || !owned.includes(e.id.player) || e.id.player !== r.id.player || e.id.sequence !== r.id.sequence || e.id.sequence > value.commandHighWater[e.id.player]! || r.status === 'already-processed' || staged[e.id.player]!.has(e.id.sequence)) throw new Error('invalid ledger cache');
        staged[e.id.player]!.set(e.id.sequence, { payload, result: structuredClone(r) });
        if (staged[e.id.player]!.size > 256) throw new Error('ledger cache capacity');
      }
      for (let p = 0; p < playerLimit; p++) {
        if (value.admissionCounts[p]! > value.commandHighWater[p]! || (value.commandHighWater[p]! > 0 && !staged[p]!.has(value.commandHighWater[p]!))) throw new Error('missing ledger high-water result');
      }
      for (let p = 0; p < playerLimit; p++) { water[p] = value.commandHighWater[p]!; counts[p] = value.admissionCounts[p]!; completed[p] = staged[p]!; }
      countTick = value.admissionTick; pending.clear();
    }
  };
}
