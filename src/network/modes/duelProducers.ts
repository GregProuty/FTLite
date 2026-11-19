// The duel's producer manager (H-2 spec §6), the duel's equivalent of sectorProducers.ts. The duel's producers are its
// n humans (Sci-2 spec §4.4: n = init.playerCount, 2..4); a seat with no human attachment, or whose attachment has gone, gets one away steward instead. The steward
// is a loopback producer: at a completed boundary while the run is running it sends `presence {present: false}` once
// through the normal ledger, and otherwise nothing; it keeps no memory. When a remote human's attachment goes (a lost
// peer), the manager pauses the run with 'peer-lost' once the steward's presence has an applied result, so the pause
// checkpoint and its mirror can be captured with nothing pending. Already paused: the presence waits for the resume
// and no peer-lost pause is asked. A rejected presence is retried once; if the retry is rejected too, the manager
// pauses anyway. A local attachment (the host's own renderer port) that goes gets a steward but no pause. Ownership
// changes bind only at the authority's completed-boundary hooks, as in the sector.
import type { Authority, AttachOptions } from '../../renderer/src/authority/authority';
import type { DuelTypes } from '../../renderer/src/authority/duelRules';
import { duelCodec } from '../../renderer/src/net/codec';
import { createLoopbackHarness } from '../../renderer/src/net/loopback';
import type { AuthorityMessage, CommandId, Link, PublishedState, Unsubscribe } from '../../renderer/src/net/contracts';
import type { DuelSnapshot } from '../../renderer/src/sim/duel/snapshot';
import { SIM_VERSION } from '../../renderer/src/sim/tuning';
import { DUEL_CREW_MAX, DUEL_CREW_MIN } from '../../renderer/src/sim/duel/state';

export type AttachmentOrigin = 'local' | 'remote';
interface DuelProducerOptions { authority: Authority<DuelTypes>; runId: string; contentDigest: string; playerCount: number; pause(reason: string): void }
interface Human { link: Link; players: readonly number[]; options: AttachOptions<DuelSnapshot>; origin?: AttachmentOrigin; detach?: Unsubscribe; offClose?: Unsubscribe }
/** One away steward: its loopback link, what it last saw, its presence command, and whether a lost peer awaits its pause. */
interface Steward {
  player: number; link: Link; detach: Unsubscribe; close(): void;
  publication: PublishedState<DuelSnapshot> | null; results: AuthorityMessage<DuelSnapshot>[];
  pending: CommandId | null; done: boolean; rejected: number; lost: boolean; lastSequence: number;
}
const codec = duelCodec(DUEL_CREW_MAX);   // Sci-2 spec §4.3: built once at the room limit

export function createDuelProducers(options: DuelProducerOptions) {
  const { authority, runId, contentDigest, playerCount } = options;
  if (!Number.isInteger(playerCount) || playerCount < DUEL_CREW_MIN || playerCount > DUEL_CREW_MAX) throw Error('invalid duel producer');
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest });
  const desired: (Human | undefined)[] = Array.from({ length: playerCount });   // Sci-2: a seat with no human gets the steward (an empty seat at Start)
  const humans = new Set<Human>(), stewards = new Map<number, Steward>(), lost = new Set<number>();
  let disposed = false;
  function bindSteward(player: number): Steward {
    const pair = transport.connectLocal();
    const steward: Steward = { player, link: pair.clientLink, detach: () => {}, close: () => { pair.host.close('steward-retired'); pair.client.close('steward-retired'); },
      publication: null, results: [], pending: null, done: false, rejected: 0, lost: lost.delete(player), lastSequence: 0 };
    pair.clientLink.onMessage((_kind, bytes) => {
      const message = codec.decodeMessage(bytes) as AuthorityMessage<DuelSnapshot>;
      if (message.kind === 'state') steward.publication = message.state;
      else if (message.kind === 'result') steward.results.push(message);
    });
    try { steward.detach = authority.attach(pair.authorityLink, [player], { admissionPolicy: 'receive-time' }); }
    catch (error) { steward.close(); throw error; }
    return steward;
  }
  function retireSteward(steward: Steward): void {
    stewards.delete(steward.player);
    try { steward.detach(); } finally { steward.close(); }
  }
  /** The steward's one job: presence false while running, retried once, then the peer-lost pause if it owes one. */
  function steward(s: Steward): void {
    for (const message of s.results.splice(0)) {
      if (message.kind !== 'result' || !s.pending || message.result.id.player !== s.pending.player || message.result.id.sequence !== s.pending.sequence) continue;
      s.pending = null;
      if (message.result.status === 'applied') s.done = true;
      else if (++s.rejected >= 2) s.done = true;   // the retry was rejected too: give up, and pause anyway
      if (s.done && s.lost) { s.lost = false; options.pause('peer-lost'); }
    }
    const p = s.publication;
    // Already paused (even with the presence in flight): the presence waits for the resume, and no peer-lost pause follows.
    if (p?.phase === 'paused') s.lost = false;
    if (s.done || s.pending || !p || p.phase === 'paused') return;
    if (p.phase !== 'running') return;
    // A rejected sequence is consumed by the ledger, so a retry never reuses the last sequence this steward sent.
    s.pending = { player: s.player, sequence: Math.max(p.commandHighWater[s.player]! + 1, s.lastSequence + 1) };
    s.lastSequence = s.pending.sequence;
    const envelope = { runId, id: s.pending, requestedTick: p.tick, command: { kind: 'presence' as const, present: false } };
    s.link.send('reliable-ordered', codec.encodeMessage({ kind: 'command', envelope }));
  }
  function cancel(human: Human): void {
    for (const player of human.players) if (desired[player] === human) {
      desired[player] = undefined;
      if (human.detach && human.origin === 'remote') lost.add(player);   // a bound remote seat went: a lost peer
    }
  }
  function wanted(human: Human): boolean { return human.players.every(player => desired[player] === human); }
  function retire(human: Human): void {
    if (!humans.delete(human)) return;
    cancel(human);
    human.offClose?.();
    try { human.detach?.(); } finally { human.link.close('duel-producer-retired'); }
  }
  function boundary(): void {
    if (disposed) return;
    transport.drain();
    // Detach all old owners before any replacement can publish or send input.
    for (const human of humans) if (!wanted(human)) retire(human);
    for (const [player, s] of stewards) if (desired[player]) retireSteward(s);
    for (const human of [...humans]) {
      if (disposed) return;
      if (!wanted(human) || human.detach) continue;
      try { human.detach = authority.attach(human.link, human.players, human.options); }
      catch { retire(human); continue; }
      // The initial publication can synchronously close, replace, or dispose this owner.
      if (disposed || !wanted(human)) { human.detach(); retire(human); }
    }
    if (disposed) return;
    for (let player = 0; player < playerCount; player++) if (!desired[player] && !stewards.has(player)) {
      const s = bindSteward(player);
      if (disposed || desired[player]) { s.detach(); s.close(); } else stewards.set(player, s);
      if (disposed) return;
    }
    transport.drain();
    for (const s of [...stewards.values()]) steward(s);
    transport.drain();
  }
  return {
    attachHuman(link: Link, players: readonly number[], attachOptions: AttachOptions<DuelSnapshot>, origin?: AttachmentOrigin): Unsubscribe {
      if (disposed || !players.length || players.some(p => !Number.isInteger(p) || p < 0 || p >= playerCount)
        || new Set(players).size !== players.length || [...humans].some(h => h.link === link)
        || (attachOptions.admissionPolicy !== undefined && attachOptions.admissionPolicy !== 'strict' && attachOptions.admissionPolicy !== 'receive-time'))
        throw Error('invalid duel producer');
      const human: Human = { link, players: [...players], options: { ...attachOptions }, origin };
      for (const player of players) if (desired[player]) cancel(desired[player]!);
      for (const player of players) desired[player] = human;
      for (const player of players) lost.delete(player);   // a human now holds the seat: no peer-lost debt survives it
      humans.add(human);
      human.offClose = link.onClose(() => cancel(human));
      for (const candidate of humans) if (!wanted(candidate) && !candidate.detach) retire(candidate);
      return () => cancel(human);
    },
    beforeControls: boundary,
    beforeTick(): void { boundary(); },
    controllers: (): readonly never[] => [],
    /** Test probe: which seats have a steward, and whether each still owes its presence or a pause. */
    stewards: () => [...stewards.values()].map(s => ({ player: s.player, done: s.done, lost: s.lost, pending: s.pending !== null })),
    dispose(): void {
      if (disposed) return; disposed = true;
      for (const human of humans) retire(human);
      for (const s of [...stewards.values()]) retireSteward(s);
      desired.fill(undefined);
    }
  };
}
