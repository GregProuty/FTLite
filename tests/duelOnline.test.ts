// The duel online, headless (H-2 spec §6, §7, §10): two createDuelRemoteClients on streamed receive-time loopback
// links, one per seat, the scripted pair driving each seat through its own client only, at the 20 Hz the sender
// publishes; the away steward, the peer-lost pause and its order; rejoin; rematch through the clients.
import { describe, expect, it } from 'vitest';
import { runModeReplay } from '../src/renderer/src/authority/replay';
import type { DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import type { AuthorityEvent, CommandResult, HeldInput } from '../src/renderer/src/net/contracts';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createScriptedPair, scriptedInput, type ScriptedPair } from '../src/renderer/src/sim/duel/scripted';
import { duelRoundRecord } from '../src/renderer/src/sim/duel/summary';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { Seated } from '../src/renderer/src/sim/components';
import { hashF64 } from '../src/shared/hash';
import { onlineDuel, type Seat } from './helpers/onlineDuel';
import { resolveCutter } from './helpers/duelAuthority';
import { GATE_SEEDS, CAP_TICKS } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
/** One seat's producer: on each new confirmed publication, the scripted pair reads that seat's replica and the seat
 *  sends its own player's held input (on every publication, so the 250 ms receive-time watchdog never neutralises a
 *  held thrust or repair) and commands, through its client only. */
function producer(seat: Seat, seed: number) {
  let pair: ScriptedPair = createScriptedPair(seed), seen = 0, round = 0;
  const results: CommandResult[] = [], events: AuthorityEvent[] = [];
  return {
    results, events,
    step() {
      results.push(...seat.client.takeResults()); events.push(...seat.client.takeEvents());
      const d = seat.client.state(), p = seat.client.publication();
      if (!d || !p || p.publicationSequence === seen || seat.client.commandStatus(seat.seat).state !== 'ready') return;
      seen = p.publicationSequence;
      if (d.round !== round) { round = d.round; pair = createScriptedPair(d.tactical.seed); }
      if (p.phase !== 'running' || d.tactical.outcome !== Outcome.Running) return;
      const input = scriptedInput(pair, d), held: HeldInput = input.held[seat.seat] ?? { moveX: 0, moveY: 0, interactHeld: false };
      seat.client.held(seat.seat, held);
      for (const e of input.commands) if (e.id.player === seat.seat) seat.client.command(seat.seat, e.command);
    }
  };
}

describe('two clients over the loopback, one per seat (spec §10)', () => {
  let seedsFlown = 0, crewLaserReleases = 0;   // summed over the seeds, checked after them
  it.each(GATE_SEEDS.map((seed) => [seed]))('seed %i: the scripted pair through the clients reaches an outcome; replicas, journal and round record agree; nothing is stale-tick', async (seed) => {
    // Each seed is seconds of synchronous CPU; yield a macrotask first so vitest's worker RPC is answered between seeds
    // (ten seeds back to back otherwise block the worker past its 60 s RPC timeout).
    await new Promise<void>((resolve) => setImmediate(resolve));
    const rig = onlineDuel(seed), a = rig.connect(0), b = rig.connect(1), pa = producer(a, seed), pb = producer(b, seed);
    rig.tick(2);
    expect(a.client.commandStatus(0).state).toBe('ready');
    // The journal is emptied at every 300-tick boundary, so each window's watchdog frames are counted on its last tick
    // (authority tick % 300 === 299), just before the reset, and the final window after the loop.
    const watchdogs = () => rig.authority.replay().frames.filter((f) => f.action.kind === 'watchdog').length;
    let watchdogCount = 0, windows = 0;
    for (let k = 0; k < CAP_TICKS && a.client.state()?.tactical.outcome === Outcome.Running; k++) {
      pa.step(); pb.step(); rig.tick();
      if (rig.session().duel.interior.tick % 300 === 299) { watchdogCount += watchdogs(); windows++; }
    }
    expect(windows, 'every full journal window was read').toBe(Math.floor((rig.session().duel.interior.tick + 1) / 300));
    rig.tick(6); pa.step(); pb.step();
    const d = a.client.state()!;
    expect(d.tactical.outcome, 'the round reached an outcome').not.toBe(Outcome.Running);
    // Both replicas are the authority's state at the same publication.
    const cp = rig.authority.checkpoint([]) as DuelCheckpoint, hash = hashF64(Float64Array.from(cp.snapshot.values));
    for (const s of [a, b]) { expect(s.client.publication()!.hash).toBe(hash); expect(hashDuel(s.client.state()!)).toBe(hash); }
    // The journal since the last baseline replays offline to the same hash.
    const replay = rig.authority.replay(), rerun = runModeReplay(JSON.parse(JSON.stringify(replay)), DIGEST, resolveCutter);
    const ticks = replay.frames.filter((f) => f.action.kind === 'tick');
    // Merge with the Engineering spike (kind b, a whole-run coincidence): seed 10's round is decided at 6594, so the six ticks
    // above end on a 300-tick journal reset (6600) with no tick frame yet; then the window's baseline is the authority's state.
    if (ticks.length === 0) expect(hashF64(Float64Array.from((replay as unknown as { initial: { values: number[] } }).initial.values))).toBe(hash);
    else expect(rerun.hashes.at(-1)).toBe(ticks.at(-1)!.after!.hash);
    // Held input refreshed every publication: the receive-time watchdog never neutralised a seat during the round.
    expect(watchdogCount + watchdogs()).toBe(0);
    const results = [...pa.results, ...pb.results];
    expect(results.length).toBeGreaterThan(0);
    // Each seat produced input through its own client: its held frames were admitted (the Helm can fly a round on held
    // input alone, so a seat need not send a command), and the commands sent were applied.
    for (const seat of [0, 1]) expect(a.client.publication()!.heldHighWater[seat], `seat ${seat} held frames admitted`).toBeGreaterThan(0);
    expect(results.some((r) => r.status === 'applied'), 'a command was applied').toBe(true);
    expect(results.filter((r) => r.reason === 'stale-tick')).toEqual([]);
    // Each client's round record is the authority's: the round record builder over the session's summary.
    const authorityRecord = duelRoundRecord(rig.session().summary!, 0, seed, 0);
    expect(authorityRecord).toMatchObject({ outcome: d.tactical.outcome, ticks: d.decidedTick });
    for (const p of [pa, pb]) {
      const rounds = p.events.filter((e) => e.payload.kind === 'round');
      expect(rounds).toHaveLength(1);
      const record = (rounds[0]!.payload as Extract<AuthorityEvent['payload'], { kind: 'round' }>).record;
      expect(record).toEqual(authorityRecord);
      expect(cp.modeMemory.telemetry.ticks).toBe(record.ticks);
    }
    seedsFlown++; crewLaserReleases += authorityRecord.laserReleases[0];
  }, 300_000);
  it('across the ten seeds the crew ship released its laser: a passive crew cannot pass the seeds', () => {
    expect(seedsFlown).toBe(GATE_SEEDS.length);
    expect(crewLaserReleases).toBeGreaterThan(0);
  });
  it('a rematch through a client replaces the replica: a new round seed, baseTick the tick after the rematch, monotone ticks and sequences', () => {
    const rig = onlineDuel(3), a = rig.connect(0), b = rig.connect(1);
    rig.tick(3);
    a.client.command(0, { kind: 'rematch' }); rig.tick(4);
    expect(a.client.takeResults().filter((r) => r.id.player === 0).map((r) => r.reason)).toEqual(['duel-running']);
    rig.forceHunterDown(); rig.tick(6);
    const before = { tick: a.client.publication()!.tick, sequence: a.client.publication()!.publicationSequence, replica: a.client.state()! };
    expect([before.replica.round, before.replica.tactical.outcome]).toEqual([0, Outcome.CrewWins]);
    b.client.command(1, { kind: 'rematch' }); rig.tick(6);
    const after = a.client.state()!, p = a.client.publication()!;
    expect(after).not.toBe(before.replica);   // a new round's seed replaces the replica
    expect([after.round, after.tactical.outcome, after.tactical.seed]).toEqual([1, Outcome.Running, rig.session().duel.tactical.seed]);
    expect(after.tactical.seed).not.toBe(3);
    expect(after.baseTick).toBe(rig.session().duel.baseTick);
    expect(after.baseTick).toBeGreaterThan(before.tick);
    expect(p.tick).toBeGreaterThan(before.tick); expect(p.publicationSequence).toBeGreaterThan(before.sequence);
    expect(hashDuel(b.client.state()!)).toBe(b.client.publication()!.hash);
    expect(b.client.takeResults().filter((r) => r.id.player === 1).map((r) => r.status)).toEqual(['applied']);
  });
});

describe('reconnects and round context (spec §8, §10)', () => {
  it('a guest reconnecting mid-round reads the round, its seed and the Helm player from state; one reconnecting across a round end misses only that round event', () => {
    const rig = onlineDuel(5, { helmPlayer: 1 }), a = rig.connect(0);
    let b = rig.connect(1);
    rig.tick(3);
    rig.forceHunterDown(); rig.tick(6);
    a.client.command(0, { kind: 'rematch' }); rig.tick(6);
    // Mid-round 1: the guest drops and comes back.
    b.detach(); rig.tick(6);
    b = rig.connect(1); rig.tick(3);
    const d = b.client.state()!;
    expect([d.round, d.tactical.seed, d.helmPlayer]).toEqual([1, rig.session().duel.tactical.seed, 1]);
    // Across a round end: the guest is away when round 1 is decided.
    a.client.command(0, { kind: 'setPaused', paused: false }); rig.tick(3);
    b.detach(); rig.tick(6);
    a.client.command(0, { kind: 'setPaused', paused: false }); rig.tick(3);
    rig.forceHunterDown(); rig.tick(6);
    b = rig.connect(1); rig.tick(3);
    const hostRounds = a.client.takeEvents().filter((e) => e.payload.kind === 'round').map((e) => (e.payload as { record: { round: number } }).record.round);
    expect(hostRounds).toEqual([0, 1]);   // the host's renderer holds every round's record
    expect(b.client.takeEvents().filter((e) => e.payload.kind === 'round')).toEqual([]);   // events before its startup are not replayed
    expect([b.client.state()!.round, b.client.state()!.decidedTick]).toEqual([1, rig.session().duel.decidedTick]);   // but its state says the round is decided
  });
  it('helmPlayer 1 seats the guest at the Helm, and a restore keeps the seating', () => {
    const rig = onlineDuel(6, { helmPlayer: 1 }), a = rig.connect(0), b = rig.connect(1);
    rig.tick(6);
    const d = b.client.state()!;
    expect(Seated.station[d.interior.crew[1]!]).toBe(d.nav);
    expect(Seated.station[d.interior.crew[0]!]).toBe(d.weapons);
    const cp = rig.authority.checkpoint([]) as DuelCheckpoint;
    const again = onlineDuel(6, { restore: cp }), c = again.connect(1);
    again.tick(3);
    expect(Seated.station[c.client.state()!.interior.crew[1]!]).toBe(c.client.state()!.nav);
    expect(c.client.state()!.helmPlayer).toBe(1);
    expect(c.client.publication()!.phase).toBe('paused');   // a restore always starts paused
    void a;
  });
});
