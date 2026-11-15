import { describe, expect, it } from 'vitest';
import { makeState, LAYOUT, quiet } from './helpers/sim';
import { ownTestCleanup } from './helpers/simLifetime';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { translateTick } from '../src/renderer/src/clientControl/cardController';
import { NEUTRAL_FRAME } from '../src/renderer/src/clientControl/inputFrame';
import { createSectorRemoteClient, createSectorStreamBinding } from '../src/network/modes/sectorStream';
import { encodeMessage, decodeMessage } from '../src/renderer/src/net/codec';
import { decodeOpaquePacket, encodeOpaquePacket } from '../src/network/state/imageCodec';
import type { ChannelKind, HeldInput, Link } from '../src/renderer/src/net/contracts';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';

function endpoint() {
  const messages = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>(), closes = new Set<(reason: string) => void>();
  const sent: { kind: ChannelKind; bytes: Uint8Array }[] = [], reasons: string[] = [];
  let closed = false;
  const link: Link = { peer: 'neutral-test', caps: { unreliable: true, maxDatagram: 16088, hidesPeerIp: true, p2p: false },
    send(kind, bytes) { if (!closed) sent.push({ kind, bytes: bytes.slice() }); },
    onMessage(cb) { messages.add(cb); return () => { messages.delete(cb); }; },
    onClose(cb) { closes.add(cb); return () => { closes.delete(cb); }; },
    close(reason) { if (closed) return; closed = true; reasons.push(reason); for (const cb of [...closes]) cb(reason); },
    stats: () => ({ rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: 0 }) };
  return { link, sent, reasons, receive(bytes: Uint8Array, kind: ChannelKind = 'reliable-ordered') { for (const cb of [...messages]) cb(kind, bytes); } };
}
const options = { runId: 'neutral', contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: () => LAYOUT };
function rig() {
  const state = makeState(2); quiet(state);
  const clock = { now: 0, nowMs() { return this.now; } }, host = endpoint(), guest = endpoint();
  const authority = createFixtureAuthority({ ...options, contentDigest: options.contentDigest, clock,
    init: { runId: options.runId, contentDigest: options.contentDigest, seed: 1, playerCount: 2, characters: [], unlocked: [], layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION },
    scheduler: { schedule: () => () => {} }, onCrash(error) { throw Error(String(error)); } }, state);
  const binding = createSectorStreamBinding(host.link, { ...options, clock, latestPayloadLimit: 4096 });
  const client = createSectorRemoteClient(guest.link, [1], { ...options, clock });
  ownTestCleanup(() => { client.dispose(); binding.dispose(); });
  authority.attach(binding.link, [1], { ...binding.attachOptions, admissionPolicy: 'receive-time' });
  const deliver = () => { for (const p of guest.sent.splice(0)) host.receive(p.bytes, p.kind); authority.pump(); };
  const sync = () => { for (const p of host.sent.splice(0)) guest.receive(p.bytes, p.kind); deliver(); };
  const held = (moveX = 1) => translateTick(client.state()!, client.ui, [NEUTRAL_FRAME, { ...NEUTRAL_FRAME, moveX }], client.publication()!.tick, [1], client.commandBudget);
  return { state, clock, authority, host, guest, client, binding, deliver, sync, held };
}

describe('online reliable held neutralization', () => {
  it('neutralizes while normal input production is suspended, defeats delayed held and permits later focused input', () => {
    const h = rig(); h.sync();
    h.client.send(h.held()); h.deliver();
    expect(h.authority.checkpoint([]).held[1]).toEqual({ moveX: 1, moveY: 0, interactHeld: false });
    h.client.send(h.held()); const delayed = h.guest.sent.splice(0);
    expect(delayed).toHaveLength(1); expect(delayed[0]!.kind).toBe('unreliable-latest');
    // Focus is lost: the normal translate/send loop stops, but this API still sends.
    const nextCommand = h.client.ui.players[1]!.nextSequence;
    h.client.neutralize(1);
    expect(h.guest.sent).toHaveLength(1); expect(h.guest.sent[0]!.kind).toBe('reliable-ordered');
    expect(decodeMessage(decodeOpaquePacket(h.guest.sent[0]!.bytes).bytes)).toEqual({ kind: 'held', frame: {
      runId: 'neutral', player: 1, tick: 0, sequence: 3, held: { moveX: 0, moveY: 0, interactHeld: false }
    } });
    h.deliver();
    for (const packet of delayed) h.host.receive(packet.bytes, packet.kind); h.authority.pump();
    expect(h.authority.checkpoint([])).toMatchObject({ heldHighWater: [0, 3], held: [{ moveX: 0 }, { moveX: 0, moveY: 0, interactHeld: false }], commandHighWater: [0, 0] });
    expect(h.client.ui.players[1]!.nextSequence).toBe(nextCommand);
    h.client.send(h.held(-1)); h.deliver();
    expect(h.authority.checkpoint([])).toMatchObject({ heldHighWater: [0, 4], held: [{ moveX: 0 }, { moveX: -1 }] });
    expect(h.host.reasons).toEqual([]); expect(h.guest.reasons).toEqual([]);
  });
  it('emits nothing before valid state, for unowned players, or after disposal', () => {
    const h = rig(); h.client.neutralize(1); expect(h.guest.sent).toEqual([]);
    expect(h.client.acceptPublication({ invalid: true })).toBe('rejected'); h.client.neutralize(1); expect(h.guest.sent).toEqual([]);
    h.sync(); const sequence = h.client.ui.players[0]!.heldSequence;
    h.client.neutralize(0); h.client.neutralize(99); expect(h.guest.sent).toEqual([]);
    expect(h.client.ui.players[0]!.heldSequence).toBe(sequence);
    h.client.dispose(); h.client.neutralize(1); expect(h.guest.sent).toEqual([]);
  });
  it('exposes the same fresh-sequence path on ClientRun without consuming command IDs', () => {
    const h = rig(); h.sync(); const wire = endpoint();
    const client = createClientRun(wire.link, [1], { ...options, admissionPolicy: 'receive-time' }); ownTestCleanup(() => client.dispose());
    const publication = { ...structuredClone(h.client.publication()!), heldHighWater: [0, 8], commandHighWater: [0, 6] };
    expect(client.acceptPublication(publication)).toBe('accepted'); client.neutralize(1);
    expect(wire.sent[0]!.kind).toBe('reliable-ordered');
    expect(decodeMessage(wire.sent[0]!.bytes)).toMatchObject({ kind: 'held', frame: { player: 1, sequence: 9, tick: 0 } });
    expect(client.ui.players[1]!.nextSequence).toBe(7);
    client.ui.players[1]!.heldSequence = Number.MAX_SAFE_INTEGER; client.neutralize(1);
    expect(wire.sent).toHaveLength(1); expect(wire.reasons).toHaveLength(1);
  });
  it.each([{ moveX: 1, moveY: 0, interactHeld: false }, { moveX: 0, moveY: -1, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: true }])('rejects reliable nonneutral held $moveX/$moveY/$interactHeld', held => {
    const h = rig(); h.sync();
    h.host.receive(encodeOpaquePacket('input', 'held:1', 100, encodeMessage({ kind: 'held', frame: { runId: 'neutral', player: 1, tick: 0, sequence: 1, held } })));
    h.authority.pump(); expect(h.host.reasons).toEqual(['sector-stream-invalid']);
    expect(h.authority.checkpoint([]).heldHighWater).toEqual([0, 0]);
  });
  it.each([
    { runId: 'wrong', player: 1, tick: 0, sequence: 10 },
    { runId: 'neutral', player: 0, tick: 0, sequence: 10 },
    { runId: 'neutral', player: 1, tick: 1, sequence: 10 },
  ])('preserves normal authority validation for reliable neutral $runId/$player/$tick', frame => {
    const h = rig(); h.sync();
    const held: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
    h.host.receive(encodeOpaquePacket('input', `held:${frame.player}`, 100, encodeMessage({ kind: 'held', frame: { ...frame, held } })));
    h.authority.pump(); expect(h.authority.checkpoint([]).heldHighWater).toEqual([0, 0]); expect(h.host.reasons).toEqual([]);
  });
  it('neutralizes while paused without changing pause state or command high-water', () => {
    const h = rig(); h.sync();
    h.client.send({ held: [], commands: [{ runId: 'neutral', id: { player: 1, sequence: 1 }, requestedTick: 0, command: { kind: 'setPaused', paused: true } }] });
    h.deliver(); h.sync(); h.client.neutralize(1); h.deliver();
    expect(h.authority.checkpoint([])).toMatchObject({ phase: 'paused', commandHighWater: [0, 1], heldHighWater: [0, 1] });
    expect(h.host.reasons).toEqual([]);
  });
  it.each([{ age: 120, accepted: 1 }, { age: 121, accepted: 0 }])('preserves the reliable held age boundary at $age ticks', ({ age, accepted }) => {
    const h = rig(); h.sync();
    while (h.state.tick < age) { h.clock.now += 17; h.authority.pump(); }
    h.host.receive(encodeOpaquePacket('input', 'held:1', 100, encodeMessage({ kind: 'held', frame: {
      runId: 'neutral', player: 1, tick: h.state.tick - age, sequence: 1, held: { moveX: 0, moveY: 0, interactHeld: false }
    } })));
    h.authority.pump(); expect(h.authority.checkpoint([]).heldHighWater).toEqual([0, accepted]); expect(h.host.reasons).toEqual([]);
  });
});
