// A live duel authority for the round tests (H-2 spec §7, §10): the generic core over the duel rules with a clock the
// test advances one tick at a time, one receive-time link that owns both players, and every message it sends and every
// checkpoint it captures recorded. `prepare` may change the fresh duel before the core sees it (a forced round end).
import { createEncounterCore } from '../../src/renderer/src/authority/core';
import { duelRules, type DuelSession, type DuelTypes } from '../../src/renderer/src/authority/duelRules';
import type { DuelCheckpoint, DuelInit } from '../../src/renderer/src/authority/duelCheckpoint';
import type { CheckpointOf } from '../../src/renderer/src/authority/rules';
import type { CaptureCause } from '../../src/shared/sessionCheckpoint';
import { duelCodec } from '../../src/renderer/src/net/codec';
import type { AuthorityMessage, CommandId, CommandResult, DuelCommand, HeldInput, Link } from '../../src/renderer/src/net/contracts';
import type { DuelSnapshot } from '../../src/renderer/src/sim/duel/snapshot';
import { resolveCutter } from './duelAuthority';
import { ownTestCleanup } from './simLifetime';

const codec = duelCodec(2);
export interface LiveDuel {
  core: ReturnType<typeof createEncounterCore<DuelTypes>>; state: DuelSession; init: DuelInit;
  sent: AuthorityMessage<DuelSnapshot>[]; captures: { checkpoint: DuelCheckpoint; cause: CaptureCause }[];
  /** Send a command for `player`, stamped with the current tick; returns its id. */
  command(player: 0 | 1, command: DuelCommand): CommandId;
  held(player: 0 | 1, held: HeldInput): void;
  /** Advance the clock by `n` ticks, pumping after each. */
  tick(n?: number): void;
  results(): CommandResult[];
  tickNow(): number;
}

export function liveDuel(init: DuelInit, prepare?: (s: DuelSession) => void, restored?: DuelCheckpoint): LiveDuel {
  let now = 0, ordinal = 0;
  const sent: AuthorityMessage<DuelSnapshot>[] = [], captures: LiveDuel['captures'] = [], listeners = new Set<(kind: 'reliable-ordered' | 'unreliable-latest', bytes: Uint8Array) => void>();
  const state = restored ? duelRules.restore(restored.snapshot, resolveCutter, restored.modeMemory) : duelRules.create(init, resolveCutter);
  prepare?.(state);
  const core = createEncounterCore(duelRules, { init, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: resolveCutter,
    clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, onCrash(record) { throw Error(record.error); },
    onCheckpoint: (checkpoint, cause) => { captures.push({ checkpoint: checkpoint as DuelCheckpoint, cause }); } }, state, restored as CheckpointOf<DuelTypes> | undefined);
  ownTestCleanup(() => core.dispose());
  const link: Link = { peer: 'live-duel', caps: { unreliable: true, maxDatagram: 65_536, hidesPeerIp: true, p2p: false },
    send(_kind, bytes) { sent.push(codec.decodeMessage(bytes) as AuthorityMessage<DuelSnapshot>); },
    onMessage(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; }, onClose: () => () => {},
    stats: () => ({ rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: 0 }), close() {} };
  core.attach(link, [0, 1], { admissionPolicy: 'receive-time' });
  const sequences = [restored?.commandHighWater[0] ?? 0, restored?.commandHighWater[1] ?? 0], heldSequences = [restored?.heldHighWater[0] ?? 0, restored?.heldHighWater[1] ?? 0];
  const deliver = (bytes: Uint8Array) => { for (const cb of [...listeners]) cb('reliable-ordered', bytes); };
  return {
    core, state, init, sent, captures,
    command(player, command) {
      const id = { player, sequence: ++sequences[player]! };
      deliver(codec.encodeMessage({ kind: 'command', envelope: { runId: init.runId, id, requestedTick: duelRules.tick(state), command } }));
      return id;
    },
    held(player, held) { deliver(codec.encodeMessage({ kind: 'held', frame: { runId: init.runId, player, tick: duelRules.tick(state), sequence: ++heldSequences[player]!, held } })); },
    tick(n = 1) { for (let k = 0; k < n; k++) { now = ++ordinal * 1000 / 60 + 0.01; core.pump(); } },
    results: () => sent.flatMap((m) => (m.kind === 'result' ? [m.result] : [])),
    tickNow: () => duelRules.tick(state)
  };
}

/** A forced round end (tests only): the hunter's hull at 0, so the first tick decides the round for the crew. */
export function hunterDown(s: DuelSession): void { s.duel.tactical.systems[1].hull = 0; }
