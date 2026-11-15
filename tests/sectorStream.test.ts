import { describe, expect, it } from 'vitest';
import { makeState, LAYOUT, teleport } from './helpers/sim';
import { ownTestCleanup, createSimState } from './helpers/simLifetime';
import { createFixtureAuthority } from './helpers/authorityFixture';
import { createClientRun } from '../src/renderer/src/clientControl/clientRun';
import { encodeMessage, decodeMessage } from '../src/renderer/src/net/codec';
import type { Link, ChannelKind, PublishedState, AuthorityMessage } from '../src/renderer/src/net/contracts';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { saveSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashF64 } from '../src/shared/hash';
import { createSectorRemoteClient, createSectorStreamBinding, publicationToImage, imageToPublication, encodeSectorNotification } from '../src/network/modes/sectorStream';
import { encodeFull, encodeStatePacket, decodeControl, encodeControl, classifyStreamPacket, decodeOpaquePacket, encodeOpaquePacket, decodeStatePacket, inspectState } from '../src/network/state/imageCodec';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { telemetryRecord } from '../src/renderer/src/sim/telemetry';
import { sectorMode } from '../src/network/modes/sector';
import { Health, Life, LifeState, Position } from '../src/renderer/src/sim/components';
import { createHostRuntime } from '../src/network/hostRuntime';
import { createModeRegistry } from '../src/network/modes/registry';
import { portEndpoint } from './helpers/portEndpoint';
import { sitDown, standUp } from '../src/renderer/src/sim/stations';

function endpoint() {
  const messages = new Set<(kind: ChannelKind, bytes: Uint8Array) => void>(), closes = new Set<(reason: string) => void>();
  const sent: { kind: ChannelKind; bytes: Uint8Array }[] = [], reasons: string[] = [];
  let closed = false;
  const link: Link = { peer: 'test', caps: { unreliable: true, maxDatagram: 16088, hidesPeerIp: true, p2p: false },
    send(kind, bytes) { if (!closed) sent.push({ kind, bytes: bytes.slice() }); },
    onMessage(cb) { messages.add(cb); return () => { messages.delete(cb); }; },
    onClose(cb) { closes.add(cb); return () => { closes.delete(cb); }; },
    close(reason) { if (closed) return; closed = true; reasons.push(reason); for (const cb of [...closes]) cb(reason); },
    stats: () => ({ rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: 0 }) };
  return { link, sent, reasons, listeners: () => messages.size + closes.size, receive(bytes: Uint8Array, kind: ChannelKind = 'reliable-ordered') { for (const cb of [...messages]) cb(kind, bytes); } };
}
function fixture(players = 1) {
  const state = makeState(players), clock = { now: 0, nowMs() { return this.now; } };
  const init = { runId: 'stream', seed: 1, playerCount: players, characters: [], unlocked: [], contentDigest: __GAMEPLAY_CONTENT_DIGEST__, layoutId: LAYOUT.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION };
  const crashes: unknown[] = [];
  const authority = createFixtureAuthority({ init, contentDigest: init.contentDigest, resolveLayout: () => LAYOUT, clock,
    scheduler: { schedule: () => () => {} }, onCrash: e => crashes.push(e) }, state);
  return { state, clock, init, authority, crashes };
}
const options = { runId: 'stream', contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: () => LAYOUT };
function publication(state = makeState(1), sequence = 1): PublishedState {
  const snapshot = saveSnapshot(state);
  return { runId: 'stream', tick: state.tick, publicationSequence: sequence, snapshot, hash: hashF64(Float64Array.from(snapshot.values)),
    phase: 'running', pauseOwner: null, pauseReason: null, controlRevision: 0, lagTicks: 0, tickTimeMs: null,
    commandHighWater: Array(state.playerCount).fill(0), heldHighWater: Array(state.playerCount).fill(0), auxiliaryHighWater: Array(state.playerCount).fill(0), eventSequence: 0 };
}

describe('sector publication and acceptance boundary', () => {
  it('discards all pre-ACK input without consuming IDs or replaying it after a valid full ACK', () => {
    const f = fixture(), wire = endpoint(), stream = createSectorStreamBinding(wire.link, { ...options, clock: f.clock, latestPayloadLimit: 4096 });
    ownTestCleanup(() => stream.dispose());
    f.authority.attach(stream.link, [0], { ...stream.attachOptions, admissionPolicy: 'receive-time' });
    const initial = inspectState(decodeStatePacket(wire.sent[0]!.bytes)).sequence;
    let ordinal = 0;
    const command = (sequence: number) => wire.receive(encodeOpaquePacket('input', 'command', ++ordinal, encodeMessage({ kind: 'command', envelope: {
      runId: 'stream', id: { player: 0, sequence }, requestedTick: 0, command: { kind: 'setPaused', paused: true }
    } })));
    command(1);
    wire.receive(encodeOpaquePacket('input', 'held:0', ++ordinal, encodeMessage({ kind: 'held', frame: {
      runId: 'stream', player: 0, tick: 0, sequence: 10, held: { moveX: 1, moveY: 0, interactHeld: true }
    } })), 'unreliable-latest');
    wire.receive(encodeOpaquePacket('input', 'callout', ++ordinal, encodeMessage({ kind: 'callout', runId: 'stream', player: 0, sequence: 10, calloutKind: 'contextual' })));
    f.authority.pump();
    expect(f.authority.checkpoint([])).toMatchObject({ commandHighWater: [0], heldHighWater: [0], receiveOrder: 0, phase: 'running' });
    // Retain a newer image without sending it (tick 1 is outside the cadence).
    const retainedState = makeState(1); retainedState.tick = 1;
    const retained = publication(retainedState, initial + 1);
    stream.attachOptions.publicationSink!(retained, false);
    wire.receive(encodeControl({ kind: 'full-received', sequence: initial }, ++ordinal)); command(1);
    wire.receive(encodeControl({ kind: 'ack', sequence: initial + 1 }, ++ordinal)); command(1);
    wire.receive(encodeControl({ kind: 'ack', sequence: 999 }, ++ordinal)); command(1); f.authority.pump();
    expect(f.authority.checkpoint([]).commandHighWater).toEqual([0]);
    wire.receive(encodeControl({ kind: 'ack', sequence: initial }, ++ordinal)); f.authority.pump();
    expect(f.authority.checkpoint([]).commandHighWater).toEqual([0]);
    command(1); f.authority.pump();
    expect(f.authority.checkpoint([])).toMatchObject({ commandHighWater: [1], phase: 'paused', heldHighWater: [0], receiveOrder: 1 });
    expect(wire.reasons).toEqual([]); expect(f.crashes).toEqual([]);
  });
  it('resets readiness for a replacement binding and accepts synchronous send-time ACK then input', () => {
    const wire = endpoint();
    const first = createSectorStreamBinding(wire.link, { ...options, clock: { nowMs: () => 0 }, latestPayloadLimit: 4096 });
    first.attachOptions.publicationSink!(publication(), true);
    wire.receive(encodeControl({ kind: 'ack', sequence: 1 }, 1)); first.dispose();
    const replacement = createSectorStreamBinding(wire.link, { ...options, clock: { nowMs: () => 0 }, latestPayloadLimit: 4096 });
    ownTestCleanup(() => replacement.dispose());
    const received: Uint8Array[] = []; replacement.link.onMessage((_, bytes) => received.push(bytes));
    const input = encodeOpaquePacket('input', 'callout', 2, encodeMessage({ kind: 'callout', runId: 'stream', player: 0, sequence: 1, calloutKind: 'contextual' }));
    wire.receive(encodeControl({ kind: 'ack', sequence: 1 }, 1)); wire.receive(input); expect(received).toEqual([]);
    const send = wire.link.send;
    wire.link.send = (kind, bytes) => {
      send(kind, bytes);
      const sequence = inspectState(decodeStatePacket(bytes)).sequence;
      wire.receive(encodeControl({ kind: 'ack', sequence }, 3)); wire.receive(input);
    };
    replacement.attachOptions.publicationSink!(publication(undefined, 2), true);
    expect(received).toHaveLength(1); expect(wire.reasons).toEqual([]);
  });
  it('streams a fully valid snapshot above the unchanged 65536 local JSON limit', () => {
    const width = 3202, layout = parseShip({ ...LAYOUT, id: 'long-hull', width, height: 5,
      rows: ['#'.repeat(width), ...Array(3).fill('#' + 'a'.repeat(width - 2) + '#'), '#'.repeat(width)],
      rooms: [{ id: 'a', name: 'Hull', system: null }], edges: [], airlocks: [], consoleGroups: [], magazine: undefined,
      stations: LAYOUT.stations.map((st, i) => ({ ...st, room: 'a', tile: [i + 2, 2] })), spawns: [[1, 1], [2, 1], [3, 1], [4, 1]],
      breachSites: Array.from({ length: 3200 }, (_, i) => ({ room: 'a', tile: [i + 1, 0], width: 1 })) });
    const state = createSimState(layout, 1, 1); state.breaches.repair.fill(0.12345678901234567);
    const value = publication(state), validation = { ...options, resolveLayout: () => layout };
    expect(new TextEncoder().encode(JSON.stringify({ kind: 'state', state: value })).length).toBeGreaterThan(65536);
    expect(() => encodeMessage({ kind: 'state', state: value })).toThrow('byte limit');
    const packet = encodeStatePacket(encodeFull(publicationToImage(value, validation)), 1); expect(packet.length).toBeLessThanOrEqual(131072);
    const wire = endpoint(), remote = createSectorRemoteClient(wire.link, [0], { ...validation, clock: { nowMs: () => 0 } }); ownTestCleanup(() => remote.dispose());
    wire.receive(packet); expect(remote.publication()).toEqual(value); expect(remote.commandStatus(0).canAllocate).toBe(true);
    const owner = createFixtureAuthority({ init: { runId: 'stream', seed: 1, playerCount: 1, characters: [], unlocked: [], contentDigest: options.contentDigest,
      layoutId: layout.id, layoutHash: state.derived.layoutHash, simVersion: SIM_VERSION }, ...validation, contentDigest: options.contentDigest,
      clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash() { throw Error('unexpected crash'); } }, state);
    const captured: PublishedState[] = []; owner.attach(endpoint().link, [0], { publicationSink: p => captured.push(p) });
    expect(captured).toHaveLength(1); expect(captured[0]!.hash).toBe(value.hash);
  });
  it('delivers detached objects before encoding and keeps mixed local state and replay identical', () => {
    const f = fixture(2), local = endpoint(), remote = endpoint(), seen: PublishedState[] = [];
    f.authority.attach(local.link, [0]);
    f.authority.attach(remote.link, [1], { publicationSink(value) { seen.push(structuredClone(value)); value.hash = 'changed'; } });
    expect(remote.sent).toEqual([]);
    const last = decodeMessage(local.sent.at(-1)!.bytes);
    expect(last.kind).toBe('state');
    if (last.kind === 'state') expect(last.state).toEqual(seen.at(-1));
    expect(f.authority.replay().frames.at(-1)!.after!.hash).toBe(seen.at(-1)!.hash);
  });
  it('rejects malformed object metadata or snapshot before mutating a confirmed replica', () => {
    const wire = endpoint(), client = createClientRun(wire.link, [0], options); ownTestCleanup(() => client.dispose());
    const first = publication(); expect(client.acceptPublication(first)).toBe('accepted');
    const replica = client.state(), prior = saveSnapshot(replica!);
    expect(client.acceptPublication(first)).toBe('ignored');
    expect(client.acceptPublication({ ...first, runId: 'other', publicationSequence: 2 })).toBe('ignored');
    expect(client.acceptPublication({ ...first, publicationSequence: 2, heldHighWater: [] })).toBe('rejected');
    const bad = structuredClone(first); bad.publicationSequence = 2; bad.snapshot.header.rngStates.hazards! ^= 1;
    expect(client.acceptPublication(bad)).toBe('rejected');
    const badValues = structuredClone(first); badValues.publicationSequence = 2; badValues.snapshot.values[6] = -1; badValues.hash = hashF64(Float64Array.from(badValues.snapshot.values));
    expect(client.acceptPublication(badValues)).toBe('rejected');
    expect(client.state()).toBe(replica); expect(saveSnapshot(replica!)).toEqual(prior);
  });
  it('rejects an exhausted producer watermark before changing the remote replica', () => {
    const wire = endpoint(), client = createClientRun(wire.link, [0], { ...options, remoteStreaming: true, admissionPolicy: 'receive-time' }); ownTestCleanup(() => client.dispose());
    const state = makeState(1); client.acceptPublication(publication(state)); const before = saveSnapshot(client.state()!);
    state.tick = 3; const next = publication(state, 2); next.commandHighWater = [Number.MAX_SAFE_INTEGER];
    expect(client.acceptPublication(next)).toBe('rejected'); expect(saveSnapshot(client.state()!)).toEqual(before);
  });
  it('keeps remote production disabled until an explicit successful validated ACK', () => {
    const wire = endpoint(), client = createClientRun(wire.link, [0], { ...options, admissionPolicy: 'receive-time', remoteStreaming: true });
    ownTestCleanup(() => client.dispose()); client.acceptPublication(publication());
    expect(client.commandStatus(0).canAllocate).toBe(false); client.callout(0); expect(wire.sent).toEqual([]);
    expect(client.acknowledgePublication(2)).toBe(false);
    expect(client.acknowledgePublication(1)).toBe(true); expect(client.commandStatus(0).canAllocate).toBe(true);
    wire.link.close('gone'); expect(client.acknowledgePublication(1)).toBe(false); expect(client.state()).toBeNull();
  });
  it('binds image identity to publication metadata and validates the whole snapshot', () => {
    const original = publication(), image = publicationToImage(original, options);
    expect(imageToPublication(image, options)).toEqual(original);
    expect(() => imageToPublication({ ...image, tick: 9 }, options)).toThrow();
    expect(() => imageToPublication({ ...image, epoch: 'wrong' }, options)).toThrow();
    const altered = JSON.parse(new TextDecoder().decode(image.metadata)); altered.snapshot.header.rngStates.hazards ^= 1;
    expect(() => imageToPublication({ ...image, metadata: new TextEncoder().encode(JSON.stringify(altered)) }, options)).toThrow();
  });
  it('enables the actual remote client after ACK and releases its world on close', () => {
    const wire = endpoint(), client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } });
    ownTestCleanup(() => client.dispose());
    wire.receive(encodeStatePacket(encodeFull(publicationToImage(publication(), options)), 1));
    expect(wire.sent.map(p => decodeControl(p.bytes).kind)).toEqual(['full-received', 'ack']);
    expect(client.commandStatus(0).canAllocate).toBe(true);
    const world = client.state()!; wire.link.close('gone'); expect(client.state()).toBeNull(); expect(world.crew).toEqual([]);
  });
  it('releases a replacement world when close occurs inside layout resolution', () => {
    const wire = endpoint(), client = createClientRun(wire.link, [0], { ...options, remoteStreaming: true,
      resolveLayout() { wire.link.close('during-accept'); return LAYOUT; } }); ownTestCleanup(() => client.dispose());
    expect(client.acceptPublication(publication())).toBe('ignored'); expect(client.state()).toBeNull();
  });
  it.each(['throw', 'close'] as const)('never enables production when the initial ACK send will %s', behavior => {
    const wire = endpoint(), send = wire.link.send;
    wire.link.send = (kind, bytes) => { if (decodeControl(bytes).kind === 'ack') { if (behavior === 'throw') throw Error('failed'); wire.link.close('during-ack'); } else send(kind, bytes); };
    const client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } }); ownTestCleanup(() => client.dispose());
    wire.receive(encodeStatePacket(encodeFull(publicationToImage(publication(), options)), 1));
    expect(client.commandStatus(0).canAllocate).toBe(false); expect(client.state()).toBeNull();
  });
  it('does not retain stream listeners when an already closed link notifies during construction', () => {
    for (const remote of [true, false]) {
      const wire = endpoint(); wire.link.onClose = cb => { cb('already-closed'); return () => {}; };
      const owner = remote ? createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } })
        : createSectorStreamBinding(wire.link, { ...options, clock: { nowMs: () => 0 }, latestPayloadLimit: 4096 });
      expect(wire.listeners()).toBe(0); owner.dispose();
    }
  });
  it('reconciles results immediately but presents same-tick controls only after their covering publication', () => {
    const f = fixture(), host = endpoint(), guest = endpoint();
    const stream = createSectorStreamBinding(host.link, { ...options, clock: f.clock, latestPayloadLimit: 4096 }); ownTestCleanup(() => stream.dispose());
    const client = createSectorRemoteClient(guest.link, [0], { ...options, clock: f.clock }); ownTestCleanup(() => client.dispose());
    f.authority.attach(stream.link, [0], { ...stream.attachOptions, admissionPolicy: 'receive-time' });
    const deliverHost = () => { for (const p of host.sent.splice(0)) guest.receive(p.bytes, p.kind); };
    const deliverGuest = () => { for (const p of guest.sent.splice(0)) host.receive(p.bytes, p.kind); };
    deliverHost(); deliverGuest(); const initial = client.publication()!;
    const command = { runId: 'stream', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'setPaused' as const, paused: true } };
    client.send({ held: [], commands: [command] }); expect(client.commandStatus(0).pending).toBe(1); deliverGuest(); f.authority.pump();
    const packets = host.sent.splice(0), notifications = packets.filter(p => classifyStreamPacket(p.bytes).stream === 'sector-notification');
    expect(notifications).toHaveLength(2);
    for (const p of notifications) guest.receive(p.bytes, p.kind);
    expect(client.commandStatus(0).pending).toBe(0); expect(client.takeResults()).toEqual([]); expect(client.takeEvents()).toEqual([]);
    for (const p of packets.filter(p => classifyStreamPacket(p.bytes).stream === 'state')) { expect(p.kind).toBe('reliable-ordered'); guest.receive(p.bytes, p.kind); }
    expect(client.publication()!.tick).toBe(initial.tick); expect(client.publication()!.publicationSequence).toBe(initial.publicationSequence + 1);
    expect(client.takeResults()).toMatchObject([{ status: 'applied' }]); expect(client.takeEvents()).toMatchObject([{ payload: { kind: 'pause', paused: true } }]);
    host.receive(encodeOpaquePacket('input', 'command', 100, encodeMessage({ kind: 'command', envelope: command }))); f.authority.pump();
    expect(host.sent).toHaveLength(1); deliverHost(); expect(client.takeResults()).toMatchObject([{ status: 'applied' }]); expect(f.crashes).toEqual([]);
  });
  it('preserves a codec-valid ended notification over 4 KiB with a bounded reliable envelope', () => {
    const wire = endpoint(), client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } }); ownTestCleanup(() => client.dispose());
    const state = makeState(1), record = telemetryRecord(state, 1); record.run.unlocks = Array.from({ length: 100 }, (_, i) => `${i}:${'x'.repeat(100)}`);
    const message: AuthorityMessage = { kind: 'event', event: { runId: 'stream', eventSequence: 1, tick: 0, payload: { kind: 'ended', record } } };
    const bytes = encodeMessage(message); expect(bytes.length).toBeGreaterThan(4096);
    const packet = encodeSectorNotification(message, 1, 1); expect(decodeOpaquePacket(packet).bytes.subarray(9)).toEqual(bytes);
    wire.receive(packet); wire.receive(encodeStatePacket(encodeFull(publicationToImage(publication(state), options)), 2));
    expect(client.takeEvents()).toEqual([message.event]); expect(wire.reasons).toEqual([]);
  });
  it('requires trusted streaming selection and negotiated payload cap on mode attachment', () => {
    let pump = () => {};
    const f = fixture(), mode = sectorMode.createHost({ contentDigest: options.contentDigest, clock: f.clock,
      scheduler: { schedule: (_, callback) => { pump = callback; return () => {}; } }, onCrash() {} }); ownTestCleanup(() => mode.dispose());
    mode.start(new TextEncoder().encode(JSON.stringify(f.init)));
    expect(() => mode.attach(endpoint().link, [0], 'receive-time', { streamed: true })).toThrow();
    const wire = endpoint(); mode.attach(wire.link, [0], 'receive-time', { streamed: true, latestPayloadLimit: 4096 });
    pump(); // Queued ownership is installed at a completed authority boundary.
    expect(classifyStreamPacket(wire.sent[0]!.bytes).stream).toBe('state');
    mode.dispose(); expect(wire.listeners()).toBe(0);
  });
  it('bounds queued remote notifications by count below the byte budget', () => {
    const wire = endpoint(), client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } }); ownTestCleanup(() => client.dispose());
    for (let i = 1; i <= 1024; i++) wire.receive(encodeSectorNotification({ kind: 'result', runId: 'stream', result: { id: { player: 0, sequence: i }, tick: 0, status: 'noop' } }, 1000, i));
    expect(wire.reasons).toEqual([]);
    wire.receive(encodeSectorNotification({ kind: 'result', runId: 'stream', result: { id: { player: 0, sequence: 1025 }, tick: 0, status: 'noop' } }, 1000, 1025));
    expect(wire.reasons).toEqual(['notification-history-unavailable']); expect(client.takeResults()).toEqual([]);
  });
  it('rejects an unreliable full before replica mutation', () => {
    const wire = endpoint(), client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } }); ownTestCleanup(() => client.dispose());
    wire.receive(encodeStatePacket(encodeFull(publicationToImage(publication(), options)), 1), 'unreliable-latest');
    expect(wire.reasons).toHaveLength(1); expect(client.state()).toBeNull();
  });
  it.each(['direction', 'unreliable', 'malformed', 'oversized'] as const)('rejects %s notifications before accepting gameplay', failure => {
    const wire = endpoint(), client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } }); ownTestCleanup(() => client.dispose());
    const notification = encodeSectorNotification({ kind: 'result', runId: 'stream', result: { id: { player: 0, sequence: 1 }, tick: 0, status: 'applied' } }, 1, 1);
    const payload = decodeOpaquePacket(notification).bytes;
    if (failure === 'malformed') payload[0] = 2;
    const packet = failure === 'direction' ? encodeOpaquePacket('input', 'command', 1, encodeMessage({ kind: 'callout', runId: 'stream', player: 0, sequence: 1, calloutKind: 'contextual' }))
      : failure === 'oversized' ? encodeOpaquePacket('state', 'sector-notification', 1, new Uint8Array(65546))
      : encodeOpaquePacket('state', 'sector-notification', 1, payload);
    wire.receive(packet, failure === 'unreliable' ? 'unreliable-latest' : 'reliable-ordered');
    expect(wire.reasons).toHaveLength(1); expect(client.state()).toBeNull(); expect(client.takeResults()).toEqual([]);
  });
  it('rejects guest state writes and wrongly channeled input before authority ingress', () => {
    for (const statePacket of [true, false]) {
      const f = fixture(), wire = endpoint(), stream = createSectorStreamBinding(wire.link, { ...options, clock: f.clock, latestPayloadLimit: 4096 }); ownTestCleanup(() => stream.dispose());
      f.authority.attach(stream.link, [0], stream.attachOptions); const before = f.authority.cursors();
      const packet = statePacket ? encodeStatePacket(encodeFull(publicationToImage(publication(), options)), 1)
        : encodeOpaquePacket('input', 'command', 1, encodeMessage({ kind: 'command', envelope: { runId: 'stream', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'setPaused', paused: true } } }));
      wire.receive(packet, 'unreliable-latest'); f.authority.pump();
      expect(wire.reasons).toHaveLength(1); expect(f.authority.cursors()).toEqual(before); expect(f.crashes).toEqual([]);
    }
  });
  it('bounds queued remote notifications by bytes as well as count', () => {
    const wire = endpoint(), client = createSectorRemoteClient(wire.link, [0], { ...options, clock: { nowMs: () => 0 } }); ownTestCleanup(() => client.dispose());
    const record = telemetryRecord(makeState(1), 1); record.run.unlocks = Array.from({ length: 100 }, (_, i) => `${i}:${'x'.repeat(100)}`);
    for (let i = 1; i <= 100; i++) wire.receive(encodeSectorNotification({ kind: 'event', event: { runId: 'stream', eventSequence: i, tick: 0, payload: { kind: 'ended', record } } }, 1000, i));
    expect(wire.reasons).toEqual(['notification-history-unavailable']); expect(client.takeEvents()).toEqual([]);
  });
  it('keeps presentation separate with stable player IDs and snaps same-tick teleport, seat and target changes', () => {
    const wire = endpoint(), clock = { now: 0, nowMs() { return this.now; } }, state = makeState(1);
    const client = createSectorRemoteClient(wire.link, [0], { ...options, clock }); ownTestCleanup(() => client.dispose()); let seq = 0;
    const publish = (overrides: Partial<PublishedState> = {}) => { const p = { ...publication(state, ++seq), ...overrides }; wire.receive(encodeStatePacket(encodeFull(publicationToImage(p, options)), seq)); return p; };
    publish(); const first = client.presentation.sample(0)[0]!; expect(first.id).toBe('crew:0'); expect(Object.keys(first).sort()).toEqual(['generation', 'id', 'x', 'y']);
    const eid = state.crew[0]!; teleport(state, 0, Position.x[eid]! + 0.1, Position.y[eid]!); publish();
    const teleported = client.presentation.sample(0)[0]!; expect(teleported.x).toBeCloseTo(first.x + 0.1); expect(teleported.generation).not.toBe(first.generation);
    sitDown(state, 0, 0); publish(); const seated = client.presentation.sample(0)[0]!; expect(seated.generation).not.toBe(teleported.generation);
    state.weapons.target = { kind: 'object', stableId: 99 }; publish(); expect(client.presentation.sample(0)[0]!.generation).not.toBe(seated.generation);
    const confirmed = saveSnapshot(client.state()!); client.presentation.sample(10000); expect(saveSnapshot(client.state()!)).toEqual(confirmed);
    wire.link.close('end'); expect(client.presentation.sample(10000)).toHaveLength(1); client.dispose(); expect(client.presentation.sample(10000)).toEqual([]);
  });
  it.each(['teleport', 'seat', 'weapons-target', 'science-target', 'life', 'sector', 'ended'] as const)('snaps %s from populated advancing-tick interpolation history', transition => {
    const wire = endpoint(), clock = { now: 0, nowMs() { return this.now; } }, state = makeState(1);
    const client = createSectorRemoteClient(wire.link, [0], { ...options, clock }); ownTestCleanup(() => client.dispose());
    const eid = state.crew[0]!; let sequence = 0;
    // End the history within legal movement distance of the seat, so seating
    // must be detected by its own generation field rather than teleport inference.
    sitDown(state, 0, 0); const seatX = Position.x[eid]!, y = Position.y[eid]!; standUp(state, 0);
    const startX = seatX - 0.12;
    const publish = (phase: PublishedState['phase'] = 'running') => {
      const value = { ...publication(state, ++sequence), phase };
      wire.receive(encodeStatePacket(encodeFull(publicationToImage(value, options)), sequence));
    };
    for (const tick of [0, 3, 6, 9]) {
      state.tick = tick; clock.now = tick * 1000 / 60; teleport(state, 0, startX + tick * 0.01, y); publish();
    }
    const before = client.presentation.sample(150)[0]!;
    expect(before.x).toBeCloseTo(startX + 0.03); expect(before.id).toBe('crew:0');
    state.tick = 12; clock.now = 200; teleport(state, 0, startX + 0.12, y);
    if (transition === 'teleport') teleport(state, 0, seatX + 1, y);
    if (transition === 'seat') sitDown(state, 0, 0);
    if (transition === 'weapons-target') state.weapons.target = { kind: 'object', stableId: 99 };
    if (transition === 'science-target') state.science.target = { kind: 'object', stableId: 99 };
    if (transition === 'life') { Life.state[eid] = LifeState.Downed; Health.cur[eid] = 0; Life.bleed[eid] = 15; }
    if (transition === 'sector') state.run.sector = 1;
    if (transition === 'ended') { state.ended = 1; state.endReason = 1; }
    publish(transition === 'ended' ? 'ended' : 'running');
    expect(wire.reasons).toEqual([]); expect(client.publication()!.tick).toBe(12);
    const confirmed = saveSnapshot(client.state()!), expectedX = transition === 'teleport' ? seatX + 1 : seatX;
    for (const now of [200, 225, 250, 251, 10000]) {
      const point = client.presentation.sample(now)[0]!;
      expect(point.x).toBeCloseTo(expectedX); expect(point.y).toBe(y);
      if (transition === 'sector' || transition === 'ended') expect(point.generation).toBe(before.generation);
      else expect(point.generation).not.toBe(before.generation);
    }
    expect(saveSnapshot(client.state()!)).toEqual(confirmed);
  });
  it('forwards trusted stream options and uses generic latest keys for a second mode', () => {
    let selected: unknown; const port = portEndpoint();
    const runtime = createHostRuntime(createModeRegistry([{ modeId: 'counter', schemaVersion: 1, simVersion: 9,
      latestStreamKey() { throw Error('legacy classifier must not see stream framing'); },
      createHost: () => ({ completeBootstrap() {}, start() {}, restore() {}, pause() {}, checkpoint: () => new Uint8Array([1]), dispose() {},
        attach(link, _players, _policy, chosen) { selected = chosen; link.send('unreliable-latest', encodeOpaquePacket('input', 'held:0', 1, new Uint8Array([1]))); return () => {}; } }) }]),
      { contentDigest: options.contentDigest, clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash() {} }, { modeId: 'counter', schemaVersion: 1, simVersion: 9, hostGeneration: 1 });
    ownTestCleanup(() => runtime.dispose()); runtime.handle({ kind: 'start', requestId: 1, hostGeneration: 1, initBytes: new Uint8Array([1]) });
    runtime.attachPeer('p', [0], port.port, { streamed: true, latestPayloadLimit: 4096 });
    expect(selected).toEqual({ streamed: true, latestPayloadLimit: 4096 }); expect(port.closed).toBe(false); expect(port.sent).toHaveLength(1);
  });
});
