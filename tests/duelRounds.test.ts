// Rounds inside one duel run (H-2 spec §7, §10): the round module, the decided round's end card, the rematch, the
// round-start equivalence and restore equality, the round record, the frozen accumulator, the redefined checkpoint
// validator and the Helm player.
import { describe, expect, it } from 'vitest';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import type { DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { Seated } from '../src/renderer/src/sim/components';
import { LOCAL_DUEL_RUN, type DuelCommand, type DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { flattenDuel, hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_MODULES } from '../src/renderer/src/sim/duel/modules';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { followingSeed, roundSeed } from '../src/renderer/src/sim/duel/seeds';
import { duelRoundOf, loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import type { SimModule } from '../src/renderer/src/sim/module';
import { canonicalFields } from '../src/renderer/src/sim/canonicalFields';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { CUTTER } from './helpers/scriptedDuel';
import { duelInit, resolveCutter, throughBytes } from './helpers/duelAuthority';
import { hunterDown, liveDuel } from './helpers/liveDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
let sequence = 0;
const env = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope => ({ runId: LOCAL_DUEL_RUN, id: { player, sequence: ++sequence }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, { held: [], commands });
/** A duel whose first tick decides the round for the crew. */
function decided(seed = 3): DuelState { const d = createDuel(CUTTER, seed); d.tactical.systems[1].hull = 0; step(d); return d; }
/** Named canonical values: `<module>.<field>`, the interior expanded into its sector field names. */
function named(d: DuelState): Map<string, number[]> {
  const out = new Map<string, number[]>(), values = Array.from(flattenDuel(d));
  let at = 1;
  for (const { module, state } of DUEL_MODULES) {
    const m = module as SimModule<unknown>;
    const fields = m.id === 'interior' ? canonicalFields(d.interior.layout, d.interior.playerCount).map((f) => ({ name: f.name, count: f.count })) : m.fields(state(d));
    for (const f of fields) { out.set(`${m.id}.${f.name}`, values.slice(at, at + f.count)); at += f.count; }
  }
  return out;
}

describe('the Helm player (spec §2)', () => {
  it('createDuel seats helmPlayer at Navigation and the other at Weapons; the seating and the round module survive a save and load', () => {
    for (const helm of [0, 1] as const) {
      const d = createDuel(CUTTER, 5, helm);
      try {
        expect(Seated.station[d.interior.crew[helm]!]).toBe(d.nav);
        expect(Seated.station[d.interior.crew[1 - helm]!]).toBe(d.weapons);
        expect([d.round, d.helmPlayer, d.baseTick, d.decidedTick]).toEqual([0, helm, 0, -1]);
        const r = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
        try { expect(Seated.station[r.interior.crew[helm]!]).toBe(r.nav); expect(r.helmPlayer).toBe(helm); expect(hashDuel(r)).toBe(hashDuel(d)); } finally { disposeDuel(r); }
      } finally { disposeDuel(d); }
    }
    expect(() => createDuel(CUTTER, 5, 2 as 0)).toThrow(/helm player/);
  });
});

describe('a decided round and the rematch (spec §7)', () => {
  it('a rematch while the round runs is rejected duel-running and changes nothing', () => {
    const d = createDuel(CUTTER, 3);
    try {
      const r = step(d, [env(d, 0, { kind: 'rematch' })]);
      expect(r).toEqual([expect.objectContaining({ status: 'rejected', reason: 'duel-running' })]);
      expect([d.round, d.tactical.outcome, d.interior.tick]).toEqual([0, Outcome.Running, 1]);
    } finally { disposeDuel(d); }
  });
  it('the deciding step records decidedTick; the end card advances both ticks with no physics and answers every command', () => {
    const d = decided();
    try {
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      expect(d.decidedTick).toBe(1);
      const ships = structuredClone(d.tactical.ships), interior = Array.from(flattenDuel(d)).slice(-200);
      const kinds: DuelCommand[] = [{ kind: 'laserCharge', held: true }, { kind: 'missileLaunch' }, { kind: 'stand' }, { kind: 'sit', station: d.nav }, { kind: 'laserLock', room: 1 }];
      const first = stepDuelTick(d, { held: [{ moveX: 1, moveY: -1, interactHeld: true }, { moveX: -1, moveY: 1, interactHeld: false }], commands: kinds.map((c) => env(d, 0, c)) });
      expect(first.map((r) => r.reason)).toEqual(Array(5).fill('duel-decided'));
      expect(d.tactical.ships).toEqual(ships);   // no physics: the held stick moves nothing
      expect([d.interior.tick, d.tactical.tick]).toEqual([2, 2]);
      expect(Array.from(flattenDuel(d)).slice(-200).filter((v, k) => v !== interior[k]).length).toBeLessThanOrEqual(1);   // only the interior tick
      d.present[1] = false;
      const results = step(d, [env(d, 0, { kind: 'rematch' }), env(d, 0, { kind: 'presence', present: false }), env(d, 1, { kind: 'rematch' }), env(d, 0, { kind: 'rematch' }, 0)]);
      expect(results.map((r) => r.reason ?? r.status)).toEqual(['applied', 'applied', 'stale-tick', 'unavailable']);
      expect(results.every((r) => r.tick === 2)).toBe(true);
      expect([d.round, d.present]).toEqual([1, [false, false]]);
    } finally { disposeDuel(d); }
  });
  it('a rematch builds the next round on the next tick: the following valid seed, base tick, carried presence, same Helm player, a fresh interior', () => {
    const d = createDuel(CUTTER, 3, 1);
    d.tactical.systems[1].hull = 0; step(d);
    try {
      for (let k = 0; k < 10; k++) step(d);
      expect(d.interior.tick).toBe(11);
      d.present[0] = false;
      const interior = d.interior, seed = d.tactical.seed;
      const results = step(d, [env(d, 1, { kind: 'rematch' }), env(d, 1, { kind: 'rematch' })]);
      expect(results.map((r) => r.status)).toEqual(['applied', 'noop']);
      expect(d.interior).not.toBe(interior);
      expect([d.round, d.helmPlayer, d.baseTick, d.decidedTick, d.tactical.seed]).toEqual([1, 1, 12, -1, followingSeed(seed)]);
      expect([d.interior.tick, d.tactical.tick, d.tactical.outcome]).toEqual([12, 12, Outcome.Running]);
      expect(d.present).toEqual([false, true]);
      expect(Seated.station[d.interior.crew[1]!]).toBe(d.nav);
      expect(d.tactical.ships.every((s) => s.graceUntil.every((g) => g === 12))).toBe(true);
      expect(roundSeed(3, 1)).toBe(d.tactical.seed);
    } finally { disposeDuel(d); }
  });
  it('a round started at T agrees with a fresh duel of its seed in every canonical field for 600 ticks, apart from the tick stamps', () => {
    const d = decided(4);
    try {
      // decided(4) ends on tick 1; 255 end-card steps and the rematch step put the round's base at T = 257, a prime, so
      // no tick-periodic rule can agree at T and at 0 by its period dividing T.
      for (let k = 0; k < 255; k++) step(d);
      step(d, [env(d, 0, { kind: 'rematch' })]);
      const T = d.baseTick, fresh = createDuel(CUTTER, d.tactical.seed), pa = createScriptedPair(d.tactical.seed), pb = createScriptedPair(d.tactical.seed);
      // Tick stamps: these hold an encounter tick, so a round started at T holds the fresh duel's value plus T.
      const stamps = /^(space\.tick|space\.ships\.\d+\.graceUntil|space\.hunter\.lastLaunch|interior\.tick)$/, fireAt = 'space.hunter.fireAt';
      try {
        for (let k = 0; k <= 600; k++) {
          const a = named(d), b = named(fresh);
          for (const [name, values] of a) {
            if (name.startsWith('round.')) continue;
            const want = b.get(name)!, shift = stamps.test(name) ? T : name === fireAt && want[0]! >= 0 ? T : 0;
            expect(values, `${name} at round tick ${k}`).toEqual(want.map((v) => v + shift));
          }
          if (d.tactical.outcome !== Outcome.Running) break;
          stepDuelTick(d, scriptedInput(pa, d)); stepDuelTick(fresh, scriptedInput(pb, fresh));
        }
        expect([d.round, d.baseTick]).toEqual([1, T]);
      } finally { disposeDuel(fresh); }
    } finally { disposeDuel(d); }
  }, 60_000);
  it('after a rematch, the stepped duel hashes as its saved-and-loaded copy at every tick for 600 ticks', () => {
    const d = decided(6);
    try {
      expect(step(d, [env(d, 0, { kind: 'rematch' })]).map((r) => r.status)).toEqual(['applied']);
      expect(d.round).toBe(1);
      const pair = createScriptedPair(d.tactical.seed);
      let ticks = 0;
      for (let k = 0; k < 600 && d.tactical.outcome === Outcome.Running; k++, ticks++) {
        stepDuelTick(d, scriptedInput(pair, d));
        const r = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
        try { expect(hashDuel(r), `tick ${d.interior.tick}`).toBe(hashDuel(d)); } finally { disposeDuel(r); }
      }
      expect(ticks).toBe(600);   // the rematch round ran: the loop is not vacuous
    } finally { disposeDuel(d); }
  }, 60_000);
});

describe('rounds through the authority (spec §7, §10)', () => {
  it('end card: 20 mixed commands from both players all get results, none pending; ticks and publications go on; then a rematch starts round 1 and a capture restores', async () => {
    const live = liveDuel(duelInit(3, 'rounds'), hunterDown);
    live.tick(2);
    expect(live.state.duel.tactical.outcome).toBe(Outcome.CrewWins);
    const decidedAt = live.tickNow(), published = live.sent.filter((m) => m.kind === 'state').length;
    const ids = [];
    for (const player of [0, 1] as const) for (const c of [{ kind: 'laserCharge', held: true }, { kind: 'laserCharge', held: false }, { kind: 'missileLaunch' }, { kind: 'stand' },
      { kind: 'laserLock', room: 0 }, { kind: 'laserLock', room: 2 }, { kind: 'sit', station: 0 }, { kind: 'presence', present: true }] as DuelCommand[]) ids.push(live.command(player, c));
    live.tick();
    // A pause seals pending work (Net-3), so the controls go after the tick that answered the duel commands.
    ids.push(live.command(0, { kind: 'setPaused', paused: true }));
    live.tick();
    ids.push(live.command(1, { kind: 'setPaused', paused: false }));
    live.tick();
    ids.push(live.command(0, { kind: 'rematch' }), live.command(1, { kind: 'rematch' }));
    expect(ids.length).toBeGreaterThanOrEqual(20);
    expect(live.tickNow()).toBeGreaterThan(decidedAt);
    live.tick();
    const results = live.results();
    for (const id of ids) expect(results.filter((r) => r.id.player === id.player && r.id.sequence === id.sequence), `${id.player}#${id.sequence}`).toHaveLength(1);
    const reasons = (player: number) => results.filter((r) => r.id.player === player).sort((a, b) => a.id.sequence - b.id.sequence).map((r) => r.reason ?? r.status);
    const card = ['duel-decided', 'duel-decided', 'duel-decided', 'duel-decided', 'duel-decided', 'duel-decided', 'duel-decided', 'applied'];
    expect(reasons(0)).toEqual([...card, 'applied', 'applied']);   // the pause, then the first rematch
    expect(reasons(1)).toEqual([...card, 'applied', 'noop']);      // the resume, then the second rematch in the same tick
    expect(live.sent.filter((m) => m.kind === 'state').length).toBeGreaterThan(published + 2);
    expect(live.state.duel.round).toBe(1);
    expect(live.state.duel.tactical.outcome).toBe(Outcome.Running);
    const cp = throughBytes(live.core.captureCheckpoint());
    expect(cp.phase).toBe('running');
    const again = liveDuel(cp.init, undefined, cp);
    expect(duelRules.hash(again.state)).toBe(duelRules.hash(live.state));
  });
  it('emits one round record on the deciding tick and captures safe points at the decision (its snapshot tick is decidedTick) and at the rematch', () => {
    const live = liveDuel(duelInit(3, 'records'), hunterDown);
    live.tick(30);
    const rounds = live.sent.flatMap((m) => (m.kind === 'event' && m.event.payload.kind === 'round' ? [m.event] : []));
    expect(rounds).toHaveLength(1);
    const d = live.state.duel;
    expect(rounds[0]!.tick).toBe(d.decidedTick);
    expect(rounds[0]!.payload).toEqual({ kind: 'round', record: { ...live.state.summary, round: 0, seed: 3, baseTick: 0 } });
    expect(live.sent.some((m) => m.kind === 'event' && m.event.payload.kind === 'ended')).toBe(false);
    const decision = live.captures.filter((c) => c.cause === 'safe-point');
    expect(decision.map((c) => c.checkpoint.snapshot.header.tick)).toEqual([d.decidedTick]);
    expect(duelRoundOf(decision[0]!.checkpoint.snapshot)).toMatchObject({ decidedTick: d.decidedTick, baseTick: 0, outcome: Outcome.CrewWins });
    expect(decision[0]!.checkpoint.modeMemory.telemetry.ticks).toBe(d.decidedTick);
    live.command(0, { kind: 'rematch' }); live.tick(2);
    expect(live.captures.filter((c) => c.cause === 'safe-point').map((c) => duelRoundOf(c.checkpoint.snapshot).round)).toEqual([0, 1]);
  });
  it('the accumulator freezes on the decision: a capture 60 ticks into the end card restores to exactly the round record', () => {
    const live = liveDuel(duelInit(4, 'frozen'), hunterDown);
    live.tick(70);
    const record = live.sent.flatMap((m) => (m.kind === 'event' && m.event.payload.kind === 'round' ? [m.event.payload.record] : []))[0]!;
    expect(live.tickNow() - live.state.duel.decidedTick).toBeGreaterThanOrEqual(60);
    const cp = throughBytes(live.core.captureCheckpoint());
    expect(cp.phase).toBe('running');
    expect(cp.modeMemory.telemetry.ticks).toBe(live.state.duel.decidedTick);
    const restored = duelRules.restore(cp.snapshot, resolveCutter, cp.modeMemory);
    try {
      const { round: _r, seed: _s, baseTick: _b, ...summary } = record;
      expect(restored.summary).toEqual(summary);
    } finally { duelRules.dispose(restored); }
  });
  it('validates checkpoints of later rounds, paused on the end card, and a re-host restore in round 2; refuses a wrong seed, Helm player or ended phase', () => {
    const live = liveDuel(duelInit(5, 'rehost', 1), hunterDown);
    live.tick(2);
    live.command(1, { kind: 'rematch' }); live.tick(2);
    live.state.duel.tactical.systems[1].hull = 0; live.tick(2);
    live.command(0, { kind: 'rematch' }); live.tick(2);
    expect(live.state.duel.round).toBe(2);
    live.command(0, { kind: 'setPaused', paused: true }); live.tick();
    const cp = throughBytes(live.core.captureCheckpoint());
    expect([cp.phase, cp.snapshot.header.seed, cp.init.seed]).toEqual(['paused', roundSeed(5, 2), 5]);
    const rehost = liveDuel(cp.init, undefined, cp);
    expect(duelRules.hash(rehost.state)).toBe(duelRules.hash(live.state));
    expect(Seated.station[rehost.state.duel.interior.crew[1]!]).toBe(rehost.state.duel.nav);
    const bad = (f: (c: DuelCheckpoint) => void) => { const c = structuredClone(cp); f(c); return () => throughBytes(c); };
    expect(bad((c) => { c.init.seed = 6; })).toThrow(/seed/);
    expect(bad((c) => { c.init.helmPlayer = 0; })).toThrow(/helm player/);
    expect(bad((c) => { c.phase = 'ended'; c.paused = false; })).toThrow(/terminal phase/);
    expect(bad((c) => { c.modeMemory.telemetry.ticks += 1; })).toThrow(/telemetry/);
    // A decided round's checkpoint, running on the end card, validates.
    live.state.duel.tactical.systems[1].hull = 0;
    live.command(0, { kind: 'setPaused', paused: false }); live.tick(3);
    expect(live.state.duel.tactical.outcome).not.toBe(Outcome.Running);
    expect(throughBytes(live.core.captureCheckpoint()).phase).toBe('running');
    // Paused on the decided round's end card: the checkpoint validates and a re-host restores it.
    live.command(0, { kind: 'setPaused', paused: true }); live.tick();
    const card = throughBytes(live.core.captureCheckpoint()), cardRound = duelRoundOf(card.snapshot);
    expect([card.phase, cardRound.round, cardRound.outcome]).toEqual(['paused', 2, Outcome.CrewWins]);
    const rehostCard = liveDuel(card.init, undefined, card);
    expect(duelRules.hash(rehostCard.state)).toBe(duelRules.hash(live.state));
  });
});
