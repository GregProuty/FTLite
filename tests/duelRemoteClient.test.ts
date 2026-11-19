// The duel's remote client (H-2 spec §4): a streamed duel attachment on a queued link pair, the host binding on one end
// and createDuelRemoteClient on the other. The client produces nothing before its full state is acknowledged, then
// tracks the authority at the sender's 20 Hz, and its commands come back on duel-notification.
import { seatDuelCrew } from './helpers/duelSeat';
import { describe, expect, it } from 'vitest';
import { createEncounterCore } from '../src/renderer/src/authority/core';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { createDuelRemoteClient, createDuelStreamBinding } from '../src/network/modes/duelStream';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { classifyStreamPacket } from '../src/network/state/imageCodec';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { linkPair } from './helpers/linkPair';
import { ownTestCleanup } from './helpers/simLifetime';
import { todaysCrewWeapons } from './helpers/crewWeapons';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
function rig(seed: number, drop?: (k: number) => boolean) {
  let now = 0, ordinal = 0;
  const clock = { nowMs: () => now }, init = duelInit(seed, 'remote-duel'), session = duelRules.create(init, resolveCutter);
  seatDuelCrew(session.duel);   // the old seated start (createDuel leaves both standing)
  todaysCrewWeapons(session.duel.tactical);   // Engineering spike spec §10.3: the beam and torpedo stand on bars (the round starts the beam dark)
  const core = createEncounterCore(duelRules, { init, contentDigest: DIGEST, resolveLayout: resolveCutter, clock, scheduler: { schedule: () => () => {} }, onCrash(r) { throw Error(r.error); } }, session);
  const pair = linkPair('remote', drop), binding = createDuelStreamBinding(pair.host.link, { resolveLayout: resolveCutter, contentDigest: DIGEST, clock, latestPayloadLimit: 16088 });
  const client = createDuelRemoteClient(pair.guest.link, [1], { runId: init.runId, contentDigest: DIGEST, resolveLayout: resolveCutter, clock });
  ownTestCleanup(() => { client.dispose(); binding.dispose(); core.dispose(); });
  return { core, session, pair, binding, client,
    attach() { core.attach(binding.link, [1], { ...binding.attachOptions, admissionPolicy: 'receive-time' }); },
    tick(n = 1) { for (let k = 0; k < n; k++) { now = ++ordinal * 1000 / 60 + 0.01; core.pump(); pair.flush(); } } };
}

describe('the duel remote client (spec §4)', () => {
  it('produces nothing until its full state is acknowledged, then follows the authority', () => {
    const r = rig(4);
    expect(r.client.command(1, { kind: 'stand' })).toBeNull();
    r.attach();
    expect(r.client.publication()).toBeNull();
    r.pair.flush();
    expect(r.client.publication()).not.toBeNull();
    expect(r.client.commandStatus(1).state).toBe('ready');
    r.tick(30);
    expect(hashDuel(r.client.state()!)).toBe(r.client.publication()!.hash);
    expect(r.session.duel.interior.tick - r.client.publication()!.tick).toBeLessThan(3);
  });
  it('sends ordinary state every third tick, and its commands are answered on duel-notification', () => {
    const r = rig(4);
    r.attach(); r.pair.flush();
    const states: number[] = [];
    const seen = () => { const p = r.client.publication()!; if (states.at(-1) !== p.tick) states.push(p.tick); };
    for (let k = 0; k < 30; k++) { r.tick(); seen(); }
    expect(states.slice(1).every((t, k) => t - states[k]! === 3)).toBe(true);
    const notifications: string[] = [];
    r.pair.host.link.onMessage(() => {});
    const send = r.pair.host.link.send.bind(r.pair.host.link);
    r.pair.host.link.send = (kind, bytes) => { notifications.push(classifyStreamPacket(bytes).stream); send(kind, bytes); };
    expect(r.client.command(1, { kind: 'laserCharge', held: true })).toEqual({ player: 1, sequence: 1 });
    r.tick(6);
    expect(notifications).toContain('duel-notification');
    expect(r.client.takeResults()).toEqual([expect.objectContaining({ id: { player: 1, sequence: 1 }, status: 'applied' })]);
    expect(r.client.state()!.tactical.systems[0].shots).toBe(1);   // FTL targeting spec §2: the press fired the full laser
  });
  it('absorbs dropped ordinary publications and still converges', () => {
    const r = rig(6, (k) => k % 5 === 0);
    r.attach(); r.pair.flush();
    r.tick(90);
    expect(hashDuel(r.client.state()!)).toBe(r.client.publication()!.hash);
    expect(r.session.duel.interior.tick - r.client.publication()!.tick).toBeLessThanOrEqual(6);
  });
});
