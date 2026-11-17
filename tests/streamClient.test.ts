// The generic stream client and its two modes (H-2 spec §4, gap a): the duel's stream client keeps a DuelState replica
// restored in place and replaced on a new round, allocates its own command and held sequences, and cannot be built
// with the sector's codec; a duel client and a sector client in one process never read each other's state.
import { describe, expect, it } from 'vitest';
import { createEncounterCore } from '../src/renderer/src/authority/core';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { createDuelStreamClient } from '../src/renderer/src/clientControl/duelClient';
import { createStreamClient } from '../src/renderer/src/clientControl/streamClient';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { createLoopbackHarness } from '../src/renderer/src/net/loopback';
import { duelCodec, sectorCodec, validatePublication } from '../src/renderer/src/net/codec';
import type { DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import type { DuelState } from '../src/renderer/src/sim/duel/state';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { hashState } from '../src/renderer/src/sim/hash';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { LAYOUT, makeState, quiet } from './helpers/sim';
import { ownTestCleanup } from './helpers/simLifetime';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
function duelRig(seed: number) {
  let now = 0, ordinal = 0, session: ReturnType<typeof duelRules.create> | null = null;
  const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: DIGEST }), pair = transport.connectLocal();
  const init = duelInit(seed, 'stream-duel');
  session = duelRules.create(init, resolveCutter);
  const core = createEncounterCore(duelRules, { init, contentDigest: DIGEST, resolveLayout: resolveCutter, clock: { nowMs: () => now },
    scheduler: { schedule: () => () => {} }, onCrash(r) { throw Error(r.error); } }, session);
  const client = createDuelStreamClient(pair.clientLink, [0, 1], { runId: init.runId, contentDigest: DIGEST, resolveLayout: resolveCutter, admissionPolicy: 'receive-time' });
  ownTestCleanup(() => { client.dispose(); core.dispose(); });
  core.attach(pair.authorityLink, [0, 1], { admissionPolicy: 'receive-time' }); transport.drain();
  return { core, client, session, transport, tick(n = 1) { for (let k = 0; k < n; k++) { now = ++ordinal * 1000 / 60 + 0.01; core.pump(); transport.drain(); } } };
}

describe('the duel stream client (spec §4)', () => {
  it('restores its DuelState replica in place each publication, to the authority\'s hash', () => {
    const r = duelRig(5);
    const first = r.client.state()!;
    expect(first).not.toBeNull();
    for (let k = 0; k < 30; k++) { r.tick(); expect(r.client.state()).toBe(first); expect(hashDuel(first)).toBe(r.client.publication()!.hash); }
    expect(hashDuel(first)).toBe(duelRules.hash(r.session));
  });
  it('allocates command and held sequences from the confirmed watermarks; a rematch replaces the replica', () => {
    const r = duelRig(5);
    expect(r.client.command(1, { kind: 'presence', present: false })).toEqual({ player: 1, sequence: 1 });
    expect(r.client.held(0, { moveX: 1, moveY: 0, interactHeld: false })).toBe(1);
    r.tick(2);
    expect(r.client.takeResults()).toEqual([expect.objectContaining({ id: { player: 1, sequence: 1 }, status: 'applied' })]);
    expect(r.client.state()!.present).toEqual([true, false]);
    expect(r.client.publication()!.heldHighWater).toEqual([1, 0]);
    expect(r.client.command(0, { kind: 'setPaused', paused: true })).toEqual({ player: 0, sequence: 1 });
    r.tick(2); expect(r.client.publication()!.phase).toBe('paused');
    r.client.command(0, { kind: 'setPaused', paused: false }); r.tick(2);
    r.session.duel.tactical.systems[1].hull = 0; r.tick(3);
    const decided = r.client.state()!;
    expect(decided.tactical.outcome).toBe(Outcome.CrewWins);
    r.client.command(0, { kind: 'rematch' }); r.tick(3);
    expect(r.client.state()).not.toBe(decided);
    expect(r.client.state()!.round).toBe(1);
    expect(hashDuel(r.client.state()!)).toBe(duelRules.hash(r.session));
    r.client.neutralize(0);
    expect(r.client.command(7 as 0, { kind: 'stand' })).toBeNull();   // not owned
  });
  it('a duel stream client cannot be built with the sector codec (compile time)', () => {
    const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: DIGEST }), pair = transport.connectLocal();
    const build = () => createStreamClient<DuelSnapshot, DuelState>(pair.clientLink, [0], {
      runId: 'r',
      // @ts-expect-error the sector codec's messages carry sector snapshots, not duel snapshots
      codec: sectorCodec(),
      validatePublication: (v) => validatePublication(v) as never, supported: () => true,
      replica: { matches: () => true, load: () => { throw Error(); }, restore() {}, dispose() {}, playerCount: () => 2 },
      heldSequences: { has: () => true, get: () => 0, set() {} } });
    expect(typeof build).toBe('function');
    expect(typeof createStreamClient<DuelSnapshot, DuelState>).toBe('function');
    expect(duelCodec(2)).toBeDefined();
  });
  it('a duel client and a sector client in one process each keep exactly their own authority\'s state', () => {
    const duel = duelRig(7);
    const state = makeState(2); quiet(state);
    const transport = createLoopbackHarness({ protocolVersion: 1, simVersion: SIM_VERSION, contentDigest: DIGEST }), pair = transport.connectLocal();
    let now = 0;
    const authority = createFixtureAuthority({ contentDigest: DIGEST, clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, resolveLayout: () => LAYOUT,
      onCrash(r) { throw Error(r.error); }, init: { runId: 'stream-sector', layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION,
        contentDigest: DIGEST, seed: 1, playerCount: 2, characters: [], unlocked: [] } }, state);
    const sector = createClientRun(pair.clientLink, [0, 1], { runId: 'stream-sector', contentDigest: DIGEST, resolveLayout: () => LAYOUT });
    ownTestCleanup(() => sector.dispose());
    authority.attach(pair.authorityLink, [0, 1]); transport.drain();
    for (let k = 1; k <= 60; k++) {
      now = k * 1000 / 60 + 0.01; authority.pump(); transport.drain(); duel.tick();
      expect(hashState(sector.state()!)).toBe(hashState(state));
      expect(hashDuel(duel.client.state()!)).toBe(duelRules.hash(duel.session));
    }
    expect(sector.publication()!.snapshot.header).toHaveProperty('formatVersion');
    expect(duel.client.publication()!.snapshot.header).toHaveProperty('snapshotFormat');
  });
});
