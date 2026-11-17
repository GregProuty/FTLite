// The duel's producer manager (H-2 spec §6, §10): the away steward, the peer-lost pause after the steward's presence
// is applied, rejoin, the local-port exception, a loss while already paused, and a rejected presence.
import { describe, expect, it } from 'vitest';
import type { Authority } from '../src/renderer/src/authority/authority';
import { duelRules, type DuelTypes } from '../src/renderer/src/authority/duelRules';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { CommandEnvelope, Link } from '../src/renderer/src/net/contracts';
import { saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { hashF64 } from '../src/shared/hash';
import { createDuelProducers } from '../src/network/modes/duelProducers';
import { duelMode } from '../src/network/modes/duel';
import { createDuelRemoteClient } from '../src/network/modes/duelStream';
import { validStreamAttachmentOptions } from '../src/shared/hostProcessProtocol';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { linkPair } from './helpers/linkPair';
import { onlineDuel } from './helpers/onlineDuel';
import { ownTestCleanup } from './helpers/simLifetime';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const peerLost = (rig: ReturnType<typeof onlineDuel>) => rig.captures.filter((c) => c.cause === 'pause' && c.checkpoint.pauseReason === 'peer-lost');

describe('the away steward and the peer-lost pause (spec §6)', () => {
  it('a remote Weapons seat lost mid-charge: the presence false is applied first, then the peer-lost pause, and its capture is delivered', () => {
    const rig = onlineDuel(2), a = rig.connect(0), b = rig.connect(1);
    rig.tick(3);
    expect(b.client.command(1, { kind: 'laserCharge', held: true })).not.toBeNull();
    rig.tick(6);
    expect(rig.session().duel.tactical.systems[0].fireHeld).toBe(true);
    b.detach();
    rig.tick(6);
    const lost = peerLost(rig);
    expect(lost).toHaveLength(1);
    const cp = lost[0]!.checkpoint, presence = cp.recentResults.find((r) => r.envelope.id.player === 1 && r.envelope.command.kind === 'presence');
    expect(presence?.envelope.command).toEqual({ kind: 'presence', present: false });
    expect(presence?.result.status).toBe('applied');
    expect(presence!.result.tick).toBeLessThan(cp.snapshot.header.tick);   // applied on an earlier tick than the pause boundary
    expect(cp.phase).toBe('paused');
    const d = rig.session().duel, charge = d.tactical.systems[0].laserCharge, tick = d.interior.tick, empty = rig.session().telemetry.weaponsEmptyTicks;
    expect(d.present).toEqual([true, false]);
    expect(empty).toBeGreaterThan(0);   // the Weapons console counts empty
    rig.tick(30);
    expect([d.interior.tick, d.tactical.systems[0].laserCharge, rig.session().telemetry.weaponsEmptyTicks]).toEqual([tick, charge, empty]);   // frozen while paused
    expect(a.client.publication()!.pauseReason).toBe('peer-lost');
  });
  it('rejoin: no input before the full-state ACK, then presence true, and the duel stays paused until a resume', () => {
    const rig = onlineDuel(2), a = rig.connect(0), b = rig.connect(1);
    rig.tick(3); b.detach(); rig.tick(6);
    expect(peerLost(rig)).toHaveLength(1);
    const again = rig.connect(1);
    expect(again.client.command(1, { kind: 'presence', present: true })).toBeNull();   // before its state is acknowledged
    rig.tick(2);
    expect(again.client.commandStatus(1).state).toBe('ready');
    expect(rig.producers.stewards().map((s) => s.player)).toEqual([]);   // the steward retired
    expect(again.client.command(1, { kind: 'presence', present: true })).not.toBeNull();
    rig.tick(10);
    expect(again.client.publication()!.phase).toBe('paused');
    expect(rig.session().duel.present[1]).toBe(false);   // nothing steps while paused
    a.client.command(0, { kind: 'setPaused', paused: false }); rig.tick(4);
    expect(again.client.publication()!.phase).toBe('running');
    expect(rig.session().duel.present).toEqual([true, true]);
    expect(peerLost(rig)).toHaveLength(1);   // rejoining never paused or resumed anything by itself
  });
  it('the host\'s own local port going gets a steward but no pause', () => {
    const rig = onlineDuel(2), a = rig.connect(0, 'local'), b = rig.connect(1);
    rig.tick(3); a.detach(); rig.tick(10);
    expect(peerLost(rig)).toEqual([]);
    expect(b.client.publication()!.phase).toBe('running');
    expect(rig.session().duel.present).toEqual([false, true]);
    expect(rig.producers.stewards()).toEqual([{ player: 0, done: true, lost: false, pending: false }]);
  });
  it('a loss while already paused: the presence waits for the resume, no peer-lost pause, captures continue', async () => {
    const rig = onlineDuel(2), a = rig.connect(0), b = rig.connect(1);
    rig.tick(3);
    a.client.command(0, { kind: 'setPaused', paused: true }); rig.tick(3);
    expect(a.client.publication()!.phase).toBe('paused');
    b.detach(); rig.tick(10);
    expect(rig.producers.stewards()).toEqual([{ player: 1, done: false, lost: false, pending: false }]);
    const captured = rig.authority.requestCheckpoint('paused-control'); rig.tick();
    expect((await captured).checkpoint.phase).toBe('paused');
    a.client.command(0, { kind: 'setPaused', paused: false }); rig.tick(6);
    expect(rig.session().duel.present).toEqual([true, false]);
    expect(peerLost(rig)).toEqual([]);
    expect(a.client.publication()!.phase).toBe('running');
  });
  it('a rejected presence is retried once; a second rejection pauses anyway', () => {
    const attached: Link[] = [], pauses: string[] = [], codec = duelCodec(2);
    const authority = { attach(link: Link) { attached.push(link); return () => {}; } } as unknown as Authority<DuelTypes>;
    const producers = createDuelProducers({ authority, runId: 'r', contentDigest: DIGEST, pause: (reason) => pauses.push(reason) });
    ownTestCleanup(() => producers.dispose());
    const human = linkPair('human');
    const off = producers.attachHuman(human.host.link, [1], { admissionPolicy: 'receive-time' }, 'remote');
    producers.beforeControls();   // binds the human, and a steward for the vacant seat 0
    off();                       // the remote human goes
    producers.beforeControls();   // a steward for seat 1, owing the peer-lost pause
    const steward = attached.at(-1)!, commands: CommandEnvelope[] = [];
    steward.onMessage((_k, bytes) => { const m = codec.decodeMessage(bytes); if (m.kind === 'command') commands.push(m.envelope); });
    const s = duelRules.create(duelInit(4, 'r'), resolveCutter), snapshot = saveDuelSnapshot(s.duel, DIGEST); duelRules.dispose(s);
    steward.send('reliable-ordered', codec.encodeMessage({ kind: 'state', state: { runId: 'r', tick: 0, publicationSequence: 1, snapshot, hash: hashF64(Float64Array.from(snapshot.values)),
      phase: 'running', pauseOwner: null, pauseReason: null, controlRevision: 0, lagTicks: 0, tickTimeMs: null, commandHighWater: [0, 3], heldHighWater: [0, 0], auxiliaryHighWater: [0, 0], eventSequence: 0 } }));
    const reject = () => steward.send('reliable-ordered', codec.encodeMessage({ kind: 'result', runId: 'r', result: { id: commands.at(-1)!.id, tick: 1, status: 'rejected', reason: 'stale-tick' } }));
    producers.beforeControls();
    expect(commands.map((c) => [c.id, c.command])).toEqual([[{ player: 1, sequence: 4 }, { kind: 'presence', present: false }]]);
    reject(); producers.beforeControls();
    expect(commands).toHaveLength(2);   // the one retry
    expect(commands[1]!.id).toEqual({ player: 1, sequence: 5 });   // the rejected sequence is consumed: the retry is a new one
    expect(pauses).toEqual([]);
    reject(); producers.beforeControls();
    expect(pauses).toEqual(['peer-lost']);
    expect(commands).toHaveLength(2);
  });
  it('a human who takes a lost seat clears its peer-lost debt, and replacing a bound human owes none', () => {
    const attached: Link[] = [], pauses: string[] = [], codec = duelCodec(2);
    const authority = { attach(link: Link) { attached.push(link); return () => {}; } } as unknown as Authority<DuelTypes>;
    const producers = createDuelProducers({ authority, runId: 'r', contentDigest: DIGEST, pause: (reason) => pauses.push(reason) });
    ownTestCleanup(() => producers.dispose());
    const first = linkPair('first'), second = linkPair('second'), third = linkPair('third');
    const offFirst = producers.attachHuman(first.host.link, [1], { admissionPolicy: 'receive-time' }, 'remote');
    producers.beforeControls();   // binds the first remote human
    offFirst();                   // it goes: seat 1 owes a peer-lost pause...
    producers.attachHuman(second.host.link, [1], { admissionPolicy: 'receive-time' }, 'remote');   // ...until a human takes it first
    producers.beforeControls();
    // Replacing the bound second human with a local third is not a lost peer either.
    const offThird = producers.attachHuman(third.host.link, [1], { admissionPolicy: 'receive-time' }, 'local');
    producers.beforeControls();
    offThird();                   // a local attachment goes: a steward, never a pause
    producers.beforeControls();
    expect(producers.stewards().find((s) => s.player === 1)).toMatchObject({ lost: false });
    const steward = attached.at(-1)!, commands: CommandEnvelope[] = [];
    steward.onMessage((_k, bytes) => { const m = codec.decodeMessage(bytes); if (m.kind === 'command') commands.push(m.envelope); });
    const s = duelRules.create(duelInit(4, 'r'), resolveCutter), snapshot = saveDuelSnapshot(s.duel, DIGEST); duelRules.dispose(s);
    steward.send('reliable-ordered', codec.encodeMessage({ kind: 'state', state: { runId: 'r', tick: 0, publicationSequence: 1, snapshot, hash: hashF64(Float64Array.from(snapshot.values)),
      phase: 'running', pauseOwner: null, pauseReason: null, controlRevision: 0, lagTicks: 0, tickTimeMs: null, commandHighWater: [0, 0], heldHighWater: [0, 0], auxiliaryHighWater: [0, 0], eventSequence: 0 } }));
    producers.beforeControls();
    steward.send('reliable-ordered', codec.encodeMessage({ kind: 'result', runId: 'r', result: { id: commands.at(-1)!.id, tick: 1, status: 'applied' } }));
    producers.beforeControls();
    expect(commands).toHaveLength(1);
    expect(pauses).toEqual([]);
  });
});

describe('the duel mode host wiring (spec §6)', () => {
  it('a stream attachment carries its origin, and the duel mode host pauses for a lost remote peer', () => {
    expect(validStreamAttachmentOptions({ streamed: true, latestPayloadLimit: 16088, origin: 'remote' })).toBe(true);
    expect(validStreamAttachmentOptions({ streamed: true, latestPayloadLimit: 16088, origin: 'elsewhere' })).toBe(false);
    let now = 0;
    const callbacks = new Set<() => void>();
    const host = duelMode.createHost({ contentDigest: DIGEST, clock: { nowMs: () => now }, onCrash(r) { throw Error(JSON.stringify(r.diagnostic)); },
      scheduler: { schedule: (_, cb) => { callbacks.add(cb); return () => { callbacks.delete(cb); }; } } });
    ownTestCleanup(() => host.dispose());
    host.start(new TextEncoder().encode(JSON.stringify(duelInit(2, 'wired'))));
    const pairs = [linkPair('p0'), linkPair('p1')];
    const detach = pairs.map((p, seat) => host.attach(p.host.link, [seat], 'receive-time', { streamed: true, latestPayloadLimit: 16088, origin: 'remote' }));
    const clients = pairs.map((p, seat) => createDuelRemoteClient(p.guest.link, [seat], { runId: 'wired', contentDigest: DIGEST, resolveLayout: resolveCutter, clock: { nowMs: () => now } }));
    ownTestCleanup(() => { for (const c of clients) c.dispose(); });
    const advance = (n: number) => { for (let k = 0; k < n; k++) { now += 1000 / 60; for (const cb of [...callbacks]) { callbacks.delete(cb); cb(); } for (const p of pairs) p.flush(); } };
    advance(10);
    expect(clients[0]!.publication()!.phase).toBe('running');
    detach[1]!(); pairs[1]!.close('gone');
    advance(10);
    const cp = JSON.parse(new TextDecoder().decode(host.checkpoint()));
    expect([cp.phase, cp.pauseReason]).toEqual(['paused', 'peer-lost']);
    expect(clients[0]!.publication()!.pauseReason).toBe('peer-lost');
  });
});
