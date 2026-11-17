// The duel's stream client (H-2 spec §4): the generic stream client (streamClient.ts) over a DuelState replica, with
// the duel codec and publication validation. A publication is validated once, on its way in; the replica is restored
// in place from it (restoreDuelSnapshot) and replaced only for a new round's seed or a new layout. The client allocates
// command and held sequences from the confirmed watermarks, so a producer only says what to send.
import type { CommandId, DuelCommand, HeldInput, Link, PlayerId, PublishedState } from '../net/contracts';
import { duelCodec, duelPublicationSchema } from '../net/codec';
import type { ResolveLayout } from '../authority/rules';
import { DUEL_PLAYERS, DUEL_SNAPSHOT_FORMAT, loadDuelSnapshot, restoreDuelSnapshot, validateDuelSnapshot, type DuelSnapshot } from '../sim/duel/snapshot';
import { disposeDuel, type DuelState } from '../sim/duel/state';
import { SIM_VERSION } from '../sim/tuning';
import { createStreamClient } from './streamClient';
import type { AdmissionPolicy } from '../net/receivePolicy';

export type DuelPublication = PublishedState<DuelSnapshot>;
export interface DuelClientOptions { runId: string; contentDigest: string; resolveLayout: ResolveLayout; admissionPolicy?: AdmissionPolicy; remoteStreaming?: boolean }
const codec = duelCodec(DUEL_PLAYERS);

/** Object validation of a duel publication: the shared schema, the tick and the duel snapshot validator. */
export function validateDuelPublication(value: unknown, options: Pick<DuelClientOptions, 'resolveLayout' | 'contentDigest'>): DuelPublication {
  const publication = duelPublicationSchema.parse(value) as DuelPublication;
  publication.snapshot = validateDuelSnapshot(options.resolveLayout(publication.snapshot.header.layoutId), publication.snapshot, options.contentDigest);
  return publication;
}

export function createDuelStreamClient(link: Link, owned: readonly PlayerId[], options: DuelClientOptions) {
  const held = [0, 0], next = [1, 1];
  // Snapshots this client validated itself; any other (the strict byte path) is validated before an in-place restore.
  const validated = new WeakSet<DuelSnapshot>();
  const core = createStreamClient<DuelSnapshot, DuelState>(link, owned, {
    runId: options.runId, admissionPolicy: options.admissionPolicy, remoteStreaming: options.remoteStreaming, codec,
    validatePublication(value) { const p = validateDuelPublication(value, options); validated.add(p.snapshot); return p; },
    supported: (p) => p.snapshot.header.snapshotFormat === DUEL_SNAPSHOT_FORMAT && p.snapshot.header.simVersion === SIM_VERSION,
    replica: {
      matches: (d, h) => h.layoutId === d.interior.layout.id && h.layoutHash === d.interior.derived.layoutHash && h.seed === d.tactical.seed,
      load: (snapshot) => loadDuelSnapshot(options.resolveLayout(snapshot.header.layoutId), snapshot, options.contentDigest),
      restore(d, snapshot) {
        const checked = validated.has(snapshot) ? snapshot : validateDuelSnapshot(options.resolveLayout(snapshot.header.layoutId), snapshot, options.contentDigest);
        restoreDuelSnapshot(d, checked, options.contentDigest);
      },
      dispose: disposeDuel,
      playerCount: () => DUEL_PLAYERS
    },
    heldSequences: { has: (p) => p === 0 || p === 1, get: (p) => held[p]!, set: (p, v) => { held[p] = v; } },
    onAccepted(_replica, publication) { for (const p of [0, 1]) next[p] = Math.max(next[p]!, publication.commandHighWater[p]! + 1); }
  });
  return {
    ...core,
    /** Send `command` for an owned player, stamped with the confirmed tick, when its outbox can take it; its id, or null. */
    command(player: PlayerId, command: DuelCommand): CommandId | null {
      const publication = core.publication(), status = core.commandStatus(player);
      if (!publication || !owned.includes(player) || !(command.kind === 'setPaused' ? status.canControl : status.canAllocate)) return null;
      const id = { player, sequence: next[player]! };
      if (!Number.isSafeInteger(id.sequence)) { link.close('command-sequence-exhausted'); return null; }
      next[player] = id.sequence + 1;
      core.send({ held: [], commands: [{ runId: options.runId, id, requestedTick: publication.tick, command }] });
      return id;
    },
    /** Send an owned player's held input with the next held sequence; the sequence, or null while it cannot produce. */
    held(player: PlayerId, input: HeldInput): number | null {
      const publication = core.publication();
      if (!publication || !owned.includes(player) || core.commandStatus(player).state === 'waiting-state') return null;
      const sequence = held[player]! + 1;
      if (!Number.isSafeInteger(sequence)) { link.close('held-sequence-exhausted'); return null; }
      held[player] = sequence;
      core.send({ held: [{ runId: options.runId, player, tick: publication.tick, sequence, held: { ...input } }], commands: [] });
      return sequence;
    }
  };
}
export type DuelStreamClient = ReturnType<typeof createDuelStreamClient>;
