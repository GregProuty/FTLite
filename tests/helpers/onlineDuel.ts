// A headless online duel (H-2 spec §10): the duel authority with the duel producer manager and one streamed,
// receive-time attachment per seat, each with a createDuelRemoteClient on a queued link pair, all on a clock the test
// advances one tick at a time. The authority and the producers are composed by hand, not through duelMode.createHost
// (Decision 10), so the authority stays in reach for its replay and the duel session for a forced round end (tests
// only); the ModeHost wiring is the wiring test's in duelProducers.test.ts.
import { createEncounterAuthority } from '../../src/renderer/src/authority/authority';
import { duelRules, type DuelSession, type DuelTypes } from '../../src/renderer/src/authority/duelRules';
import type { EncounterRules } from '../../src/renderer/src/authority/rules';
import type { DuelCheckpoint } from '../../src/renderer/src/authority/duelCheckpoint';
import type { CaptureCause } from '../../src/shared/sessionCheckpoint';
import type { LifecyclePause } from '../../src/renderer/src/net/contracts';
import { createDuelProducers, type AttachmentOrigin } from '../../src/network/modes/duelProducers';
import { createDuelRemoteClient, createDuelStreamBinding } from '../../src/network/modes/duelStream';
import { duelInit, resolveCutter } from './duelAuthority';
import { linkPair, type LinkPair } from './linkPair';
import { ownTestCleanup } from './simLifetime';
import { seatDuelCrew } from './duelSeat';
import type { DuelCrew, DuelState } from '../../src/renderer/src/sim/duel/state';
import { CUTTER } from './scriptedDuel';

export interface Seat { seat: number; pair: LinkPair; client: ReturnType<typeof createDuelRemoteClient>; detach(): void; origin: AttachmentOrigin }
/** `crew` (Sci-2): the run's crew size, 2 by default, a restore's from its init; `place` changes the fresh duel after the
 *  old seated start and before the core sees it (a third player put at a console). */
export function onlineDuel(seed: number, options: { helmPlayer?: number; runId?: string; drop?: (k: number) => boolean; restore?: DuelCheckpoint; crew?: DuelCrew; place?: (d: DuelState) => void } = {}) {
  const runId = options.runId ?? `online-${seed}`, contentDigest = __GAMEPLAY_CONTENT_DIGEST__, crew = options.restore?.init.playerCount ?? options.crew ?? 2;
  let now = 0, ordinal = 0, request: ((control: LifecyclePause) => void) | undefined;
  const clock = { nowMs: () => now }, captures: { checkpoint: DuelCheckpoint; cause: CaptureCause }[] = [];
  let producers!: ReturnType<typeof createDuelProducers>, session: DuelSession | null = null;
  const rules: EncounterRules<DuelTypes> = { ...duelRules,
    create: (init, resolve) => { session = duelRules.create(init, resolve); seatDuelCrew(session.duel); options.place?.(session.duel); return session; },   // the old seated start (createDuel leaves both standing)
    restore: (snap, resolve, memory) => (session = duelRules.restore(snap, resolve, memory)) };
  const authority = createEncounterAuthority(rules, { clock, scheduler: { schedule: () => () => {} }, contentDigest, resolveLayout: resolveCutter,
    onCrash(record) { throw Error(record.error); }, onCheckpoint: (checkpoint, cause) => { captures.push({ checkpoint: checkpoint as DuelCheckpoint, cause }); },
    beforeControls: () => producers.beforeControls(), beforeTick: () => producers.beforeTick(),
    bindLifecyclePause(next) { request = next; return () => { if (request === next) request = undefined; }; } });
  producers = createDuelProducers({ authority, runId, contentDigest, playerCount: crew, pause: (reason) => request?.({ paused: true, reason }) });
  if (options.restore) authority.restore(options.restore); else authority.start(duelInit(seed, runId, options.helmPlayer ?? 0, CUTTER, crew));
  ownTestCleanup(() => { producers.dispose(); authority.dispose(); });
  const seats: (Seat | undefined)[] = Array.from({ length: crew });
  function connect(seat: number, origin: AttachmentOrigin = 'remote'): Seat {
    const pair = linkPair(`seat-${seat}`, options.drop);
    const binding = createDuelStreamBinding(pair.host.link, { resolveLayout: resolveCutter, contentDigest, clock, latestPayloadLimit: 16088 });
    const off = producers.attachHuman(binding.link, [seat], { ...binding.attachOptions, admissionPolicy: 'receive-time' }, origin);
    const client = createDuelRemoteClient(pair.guest.link, [seat], { runId, contentDigest, resolveLayout: resolveCutter, clock });
    const s: Seat = { seat, pair, client, origin, detach() { off(); binding.dispose(); pair.close('detached'); client.dispose(); } };
    ownTestCleanup(() => { client.dispose(); binding.dispose(); });
    seats[seat] = s;
    return s;
  }
  const flush = () => { let moved = 1; while (moved) { moved = 0; for (const s of seats) if (s && !s.pair.host.closed()) moved += s.pair.flush(); } };
  return {
    authority, producers, captures, seats, connect, flush, runId,
    /** The authority's duel session (tests only). */
    session: () => session!,
    /** A forced round end (tests only): the hunter's hull at 0, so the next tick decides the round for the crew. */
    forceHunterDown() { session!.duel.tactical.systems[1].hull = 0; },
    tick(n = 1) { for (let k = 0; k < n; k++) { now = ++ordinal * 1000 / 60 + 0.01; authority.pump(); flush(); } },
    nowMs: () => now,
    advanceClock(ms: number) { now += ms; }
  };
}
