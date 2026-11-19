// Sci-2 (spec 2026-11-18-sci-2-crew-of-four §4.4, §7, §9 Online): a crew of three online through the duel producers and
// one streamed receive-time client per seat (the H-2 two-seat harness widened). A human attaches at seat 2, sits at
// Science and scans, and every replica is the authority's state; an empty seat gets the away steward's presence false at
// the first running boundary; a dropped seat 2 is stewarded and rejoins; the producers seat players 0..n−1 only.
import { describe, expect, it } from 'vitest';
import type { DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { hashF64 } from '../src/shared/hash';
import { createDuelProducers } from '../src/network/modes/duelProducers';
import { standAtStation } from './helpers/duelSeat';
import { linkPair } from './helpers/linkPair';
import { onlineDuel } from './helpers/onlineDuel';
import { holdInSight } from './helpers/sensorSight';

const peerLost = (rig: ReturnType<typeof onlineDuel>) => rig.captures.filter((c) => c.cause === 'pause' && c.checkpoint.pauseReason === 'peer-lost');

describe('a crew of three online (spec §4.4)', () => {
  it('a human at seat 2 sits at Science and scans; every replica is the authority\'s state', () => {
    const rig = onlineDuel(2, { crew: 3, place: (d) => { standAtStation(d, 2, d.science); holdInSight(d.tactical); } });   // Engineering spike spec §10.4: the scan needs the enemy seen
    const seats = [rig.connect(0), rig.connect(1), rig.connect(2)];
    rig.tick(3);
    expect(seats.map((s) => s.client.commandStatus(s.seat).state)).toEqual(['ready', 'ready', 'ready']);
    const science = rig.session().duel.science;
    expect(seats[2]!.client.command(2, { kind: 'sit', station: science })).not.toBeNull();
    rig.tick(6);
    expect(rig.session().duel.interior.stations.occupant[science]).toBe(2);
    expect(seats[2]!.client.command(2, { kind: 'contactScan', contact: 0 })).not.toBeNull();
    rig.tick(6);
    expect(rig.session().duel.tactical.scan).toMatchObject({ contact: 0, by: science });
    rig.tick(200);
    expect(rig.session().duel.tactical.known[0]).toBe(1);   // Level 1: 900 units at 5 a tick from the Science console
    // Paused, the authority stops stepping, so every replica settles on the authority's state.
    expect(seats[0]!.client.command(0, { kind: 'setPaused', paused: true })).not.toBeNull();
    rig.tick(10);
    const cp = rig.authority.checkpoint([]) as DuelCheckpoint, hash = hashF64(Float64Array.from(cp.snapshot.values));
    expect(cp.snapshot.header.playerCount).toBe(3);
    for (const s of seats) { expect(s.client.publication()!.hash).toBe(hash); expect(hashDuel(s.client.state()!)).toBe(hash); }
    expect(seats[2]!.client.publication()!.heldHighWater).toHaveLength(3);
  });
  it('a crew-3 start with seat 2 empty: the steward\'s presence false is applied and present[2] is false in the next publication', () => {
    const rig = onlineDuel(2, { crew: 3 }), a = rig.connect(0), b = rig.connect(1);
    rig.tick(6);
    const cp = rig.authority.checkpoint([]) as DuelCheckpoint;
    const presence = cp.recentResults.find((r) => r.envelope.id.player === 2 && r.envelope.command.kind === 'presence');
    expect(presence?.envelope.command).toEqual({ kind: 'presence', present: false });
    expect(presence?.result.status).toBe('applied');
    expect(rig.session().duel.present).toEqual([true, true, false]);
    rig.tick(3);
    for (const s of [a, b]) expect(s.client.state()!.present).toEqual([true, true, false]);
    expect(rig.producers.stewards()).toEqual([{ player: 2, done: true, lost: false, pending: false }]);
    expect(peerLost(rig)).toEqual([]);   // a seat empty from the start is no lost peer
    expect(a.client.publication()!.phase).toBe('running');
  });
  it('a dropped seat 2 is stewarded with a peer-lost pause, then rejoins present after the resume', () => {
    const rig = onlineDuel(2, { crew: 3 }), a = rig.connect(0), b = rig.connect(1), c = rig.connect(2);
    rig.tick(3); c.detach(); rig.tick(6);
    expect(peerLost(rig)).toHaveLength(1);
    expect(rig.session().duel.present).toEqual([true, true, false]);
    const again = rig.connect(2);
    rig.tick(2);
    expect(again.client.commandStatus(2).state).toBe('ready');
    expect(rig.producers.stewards()).toEqual([]);   // the steward retired
    expect(again.client.command(2, { kind: 'presence', present: true })).not.toBeNull();
    rig.tick(10);
    a.client.command(0, { kind: 'setPaused', paused: false }); rig.tick(4);
    expect(rig.session().duel.present).toEqual([true, true, true]);
    void b;
  });
  it('the producers seat players 0..n−1 only, and take a crew of 2..4', () => {
    const two = onlineDuel(2), three = onlineDuel(3, { crew: 3 });
    const link = () => linkPair('extra').host.link;
    expect(() => two.producers.attachHuman(link(), [2], { admissionPolicy: 'receive-time' })).toThrow('invalid duel producer');
    expect(() => three.producers.attachHuman(link(), [3], { admissionPolicy: 'receive-time' })).toThrow('invalid duel producer');
    for (const playerCount of [1, 5]) expect(() => createDuelProducers({ authority: two.authority, runId: 'r', contentDigest: __GAMEPLAY_CONTENT_DIGEST__, playerCount, pause: () => {} }), `crew ${playerCount}`).toThrow('invalid duel producer');
  });
});
