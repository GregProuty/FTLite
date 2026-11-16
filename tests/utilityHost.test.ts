import { describe, expect, it } from 'vitest';
import { createUtilityHost } from '../src/network/utilityHost';
import { createModeRegistry } from '../src/network/modes/registry';
import type { ModeDefinition } from '../src/network/modes/contracts';
import { portEndpoint } from './helpers/portEndpoint';
import type { SessionWorkGate } from '../src/shared/sessionLease';
import { sectorMode } from '../src/network/modes/sector';
import { LAYOUT } from './helpers/sim';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';

const identity = { protocolVersion: 2, modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
function harness() {
  const messages: any[] = [], attachments: unknown[] = []; let constructed = 0, disposed = 0, now = 0;
  const mode: ModeDefinition = { modeId: 'counter', schemaVersion: 1, simVersion: 9, createHost() {
    constructed++; let count = 0;
    return { completeBootstrap() {}, start(bytes) { count = bytes[0]!; }, checkpoint: () => new Uint8Array([count]), restore() {},
      async captureCheckpoint(cause) { return { cause, capturedTick: 0, controlRevision: 0, bytes: new Uint8Array([count]) }; },
      pause() { count++; }, attach(_link, _players, _policy, options) { attachments.push(options); return () => {}; }, dispose() { disposed++; } };
  } };
  const owner = createUtilityHost(createModeRegistry([mode]), { contentDigest: identity.contentDigest,
    clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, onCrash() {} }, message => messages.push(message));
  return { owner, messages, attachments, counters: () => [constructed, disposed], advance() { now++; } };
}
describe('utility trusted process boundary', () => {
  it('stamps each mode notification freshly, copies bytes, and keeps only its newest replacement', () => {
    const messages: any[] = [], candidate = { cause: 'periodic' as const, capturedTick: 0, controlRevision: 0, bytes: new Uint8Array([1]) };
    let publish!: () => void;
    const mode: ModeDefinition = { modeId: 'counter', schemaVersion: 1, simVersion: 9, createHost(deps) {
      publish = () => deps.onCheckpoint?.(candidate);
      return { completeBootstrap() {}, start() { publish(); }, restore() {}, checkpoint: () => candidate.bytes,
        async captureCheckpoint() { publish(); return candidate; }, pause() {}, attach: () => () => {}, dispose() {} };
    } };
    const owner = createUtilityHost(createModeRegistry([mode]), { contentDigest: identity.contentDigest, clock: { nowMs: () => 0 },
      scheduler: { schedule: () => () => {} }, onCrash() {} }, m => messages.push(m));
    try {
      owner.receive({ kind: 'initialize', ...identity }, []);
      owner.receive({ kind: 'command', command: { kind: 'start', requestId: 1, hostGeneration: 7, initBytes: new Uint8Array([0]) } }, []);
      candidate.bytes[0] = 2; publish(); candidate.bytes[0] = 3; publish(); candidate.bytes[0] = 4;
      expect(messages.filter(m => m.kind === 'checkpoint')).toHaveLength(1);
      expect(messages.find(m => m.kind === 'checkpoint').candidate.bytes).toEqual(new Uint8Array([1]));
      owner.receive({ kind: 'ack-checkpoint', requestId: 2, hostGeneration: 7, captureId: 1 }, []);
      expect(messages.filter(m => m.kind === 'checkpoint').at(-1).candidate).toMatchObject({ captureId: 3, bytes: new Uint8Array([3]) });
    } finally { owner.dispose(); }
  });
  it.each(['before-receipt', 'during-receipt'])('observes a missed %s expiry before applying a newer useful grant after utility timer starvation', edge => {
    let now = 0, nonce = 0, id = 0; const samples: number[] = [], scheduled: { delay: number; callback: () => void }[] = [], messages: any[] = [];
    const sessionLease = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 7, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) };
    const owner = createUtilityHost(createModeRegistry([sectorMode]), { contentDigest: __GAMEPLAY_CONTENT_DIGEST__,
      clock: { nowMs: () => now }, leaseClock: { nowMs: () => samples.length ? (now = samples.shift()!) : now, epochMs: () => 100000 + now }, nonce: () => (++nonce).toString(16).padStart(32, '0'),
      scheduler: { schedule(delay, callback) { scheduled.push({ delay, callback }); return () => {}; } }, onCrash() {} }, m => messages.push(m));
    owner.receive({ kind: 'initialize', ...identity, modeId: 'sector', simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, sessionLease }, []);
    const privateMessage = (kind: string, extra: object) => owner.receive({ kind, requestId: ++id, hostGeneration: 7, ...extra }, []);
    const grant = () => { const request = messages.filter(m => m.kind === 'lease-request').at(-1).request;
      privateMessage('lease-grant', { request, grant: { roomId: sessionLease.roomId, hostGeneration: 7, hostSeatId: 0, nonce: request.nonce, expiresAtEpochMs: 100000 + now + 15000 } }); };
    const command = (extra: object) => owner.receive({ kind: 'command', command: { requestId: ++id, hostGeneration: 7, ...extra } }, []);
    command({ kind: 'start', initBytes: new TextEncoder().encode(JSON.stringify({ runId: sessionLease.runId, layoutId: LAYOUT.id, layoutHash: deriveLayout(LAYOUT).layoutHash,
      simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 7, playerCount: 1, characters: [0], unlocked: [] })) });
    grant(); privateMessage('bootstrap-complete', { sessionLease });
    now = 5000; scheduled.find(s => s.delay === 5000)!.callback();
    // No authority scheduler callback occurs between the old expiry and receipt.
    now = 13000;
    if (edge === 'during-receipt') { now = 11999; samples.push(11999, 11999, 13000); }
    grant(); command({ kind: 'checkpoint' });
    const cp = JSON.parse(new TextDecoder().decode(messages.at(-1).response.checkpointBytes));
    expect(cp.phase).toBe('paused'); expect(cp.snapshot.header.tick).toBe(0); owner.dispose();
  });
  it('owns renewal stamps, accepts synchronous current grants and rejects late/foreign private replies', () => {
    let now = 0, gate!: SessionWorkGate, nonce = 0; const messages: any[] = [];
    const sessionLease = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 7, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) };
    const mode: ModeDefinition = { modeId: 'counter', schemaVersion: 1, simVersion: 9, createHost(deps) {
      gate = deps.sessionGate!;
      return { completeBootstrap() {}, start() {}, restore() {}, checkpoint: () => new Uint8Array([Number(gate.check().allowed)]),
        async captureCheckpoint(cause) { return { cause, capturedTick: 0, controlRevision: 0, bytes: new Uint8Array([Number(gate.check().allowed)]) }; },
        pause() {}, attach: () => () => {}, dispose() {} };
    } };
    const owner = createUtilityHost(createModeRegistry([mode]), { contentDigest: identity.contentDigest,
      clock: { nowMs: () => now }, leaseClock: { nowMs: () => now, epochMs: () => 100000 + now }, nonce: () => (++nonce).toString(16).padStart(32, '0'),
      scheduler: { schedule: () => () => {} }, onCrash() {} }, message => { messages.push(message); });
    owner.receive({ kind: 'initialize', ...identity, sessionLease }, []);
    const renewal = messages.find(m => m.kind === 'lease-request')?.request; expect(renewal).toMatchObject(sessionLease);
    owner.receive({ kind: 'command', command: { kind: 'start', requestId: 1, hostGeneration: 7, initBytes: new Uint8Array([0]) } }, []);
    expect(gate.check().allowed).toBe(false);
    const grant = { roomId: sessionLease.roomId, hostGeneration: 7, hostSeatId: 0, nonce: renewal.nonce, expiresAtEpochMs: 115000 };
    owner.receive({ kind: 'lease-grant', requestId: 2, hostGeneration: 7, request: renewal, grant }, []);
    expect(gate.check().allowed).toBe(true);
    owner.receive({ kind: 'lease-invalidate', requestId: 3, hostGeneration: 7, sessionLease: { ...sessionLease, utilityEpoch: 'd'.repeat(32) }, reason: 'suspended' }, []);
    expect(gate.check().allowed).toBe(true); expect(messages.at(-1).response.ok).toBe(false);
    now = 12000; owner.receive({ kind: 'lease-grant', requestId: 4, hostGeneration: 7, request: renewal, grant }, []);
    expect(gate.check().allowed).toBe(false); expect(messages.at(-1).response.ok).toBe(false); owner.dispose();
  });
  it('fails a leased initialize closed when utility-only clock/nonce dependencies are absent', () => {
    const h = harness(); h.owner.receive({ kind: 'initialize', ...identity, sessionLease: { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 7, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) } }, []);
    expect(h.messages.at(-1).kind).toBe('fatal');
  });
  it('forwards validated stream options to the mode and rejects invalid caps before attachment', () => {
    const h = harness(); h.owner.receive({ kind: 'initialize', ...identity }, []);
    const bridge = portEndpoint(); h.owner.receive({ kind: 'transport', ...identity }, [bridge.port]); bridge.receive({ kind: 'transport-ready', ...identity });
    h.owner.receive({ kind: 'command', command: { kind: 'start', requestId: 1, hostGeneration: 7, initBytes: new Uint8Array([0]) } }, []);
    const good = portEndpoint(); h.owner.receive({ kind: 'attach', requestId: 2, hostGeneration: 7, peer: 'p', players: [0], options: { streamed: true, latestPayloadLimit: 4096 } }, [good.port]);
    expect(h.attachments).toEqual([{ streamed: true, latestPayloadLimit: 4096 }]); expect(h.messages.at(-1).ok).toBe(true);
    const bad = portEndpoint(); h.owner.receive({ kind: 'attach', requestId: 3, hostGeneration: 7, peer: 'bad', players: [1], options: { streamed: true, latestPayloadLimit: 4095 } }, [bad.port]);
    expect(h.attachments).toHaveLength(1); expect(bad.closed).toBe(true); h.owner.dispose();
  });
  it.each([{ contentDigest: 'b'.repeat(64) }, { modeId: 'missing' }, { simVersion: 10 }, { protocolVersion: 1 }])('rejects incompatible identity before allocation %j', mismatch => {
    const h = harness(); h.owner.receive({ kind: 'initialize', ...identity, ...mismatch }, []);
    expect(h.messages.at(-1).kind).toBe('fatal'); expect(h.counters()).toEqual([0, 0]);
  });
  it('runs trusted initialization/start/checkpoint/dispose and rejects duplicate initialization', () => {
    const h = harness(); h.owner.receive({ kind: 'initialize', ...identity }, []);
    expect(h.messages.at(-1)).toMatchObject({ kind: 'ready', ...identity });
    h.owner.receive({ kind: 'command', command: { kind: 'start', requestId: 1, hostGeneration: 7, initBytes: new Uint8Array([41]) } }, []);
    h.owner.receive({ kind: 'command', command: { kind: 'checkpoint', requestId: 2, hostGeneration: 7 } }, []);
    expect(h.messages.at(-1).response.checkpointBytes).toEqual(new Uint8Array([41]));
    h.owner.receive({ kind: 'command', command: { kind: 'dispose', requestId: 3, hostGeneration: 7 } }, []);
    h.owner.dispose(); expect(h.counters()).toEqual([1, 1]);
    h.owner.receive({ kind: 'initialize', ...identity }, []); expect(h.messages.at(-1).kind).toBe('fatal');
  });
  it('handshakes the transport port and rejects duplicate/malformed transfers', () => {
    const h = harness(); h.owner.receive({ kind: 'initialize', ...identity }, []);
    const port = portEndpoint(); h.owner.receive({ kind: 'transport', ...identity }, [port.port]);
    port.receive({ kind: 'transport-ready', ...identity }); expect(h.messages.at(-1)).toEqual({ kind: 'transport-ready', hostGeneration: 7 });
    const duplicate = portEndpoint(); h.owner.receive({ kind: 'transport', ...identity }, [duplicate.port]);
    expect(duplicate.closed).toBe(true); expect(port.closed).toBe(true); expect(h.messages.at(-1).kind).toBe('fatal');
  });
  it('does not repeat stamped command effects or duplicate transferred peer attachments', () => {
    const h = harness(); h.owner.receive({ kind: 'initialize', ...identity }, []);
    const transport = portEndpoint(); h.owner.receive({ kind: 'transport', ...identity }, [transport.port]); transport.receive({ kind: 'transport-ready', ...identity });
    const start = { kind: 'command', command: { kind: 'start', requestId: 1, hostGeneration: 7, initBytes: new Uint8Array([4]) } };
    h.owner.receive(start, []); h.owner.receive(start, []); expect(h.counters()).toEqual([1, 0]);
    expect(h.messages.at(-1).response.error.code).toBe('stale-request');
    const first = portEndpoint(), duplicate = portEndpoint(), attach = { kind: 'attach', requestId: 2, hostGeneration: 7, peer: 'human', players: [0] };
    h.owner.receive(attach, [first.port]); expect(h.messages.at(-1).ok).toBe(true);
    h.owner.receive(attach, [duplicate.port]); expect(h.messages.at(-1).ok).toBe(false);
    expect(first.closed).toBe(false); expect(duplicate.closed).toBe(true); h.owner.dispose(); expect(first.closed).toBe(true);
  });
  it('responds to invalid unstamped control with a null protocol correlation', () => {
    const h = harness(); h.owner.receive({ kind: 'initialize', ...identity }, []);
    h.owner.receive({ kind: 'command', command: { kind: 'checkpoint' } }, []);
    expect(h.messages.at(-1)).toEqual({ kind: 'response', response: { requestId: null, hostGeneration: 7, ok: false, error: { code: 'invalid-command', message: 'invalid-command' } } });
    h.owner.dispose();
  });
  it('stops diagnostic serialization at a finite node budget and still disposes after a crash', () => {
    let visited = 0, disposed = 0;
    const diagnostic: Record<string, unknown> = {};
    for (let i = 0; i < 10000; i++) Object.defineProperty(diagnostic, `key${i}`, { enumerable: true, get() { visited++; return i; } });
    const messages: any[] = [];
    const mode: ModeDefinition = { modeId: 'counter', schemaVersion: 1, simVersion: 9, createHost(deps) {
      return { completeBootstrap() {}, start() { deps.onCrash({ checkpoint: new Uint8Array([1]), diagnostic }); }, checkpoint: () => new Uint8Array([1]),
        async captureCheckpoint(cause) { return { cause, capturedTick: 0, controlRevision: 0, bytes: new Uint8Array([1]) }; },
        restore() {}, pause() {}, attach: () => () => {}, dispose() { disposed++; } };
    } };
    const owner = createUtilityHost(createModeRegistry([mode]), { contentDigest: identity.contentDigest,
      clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash() {} }, message => messages.push(message));
    owner.receive({ kind: 'initialize', ...identity }, []);
    owner.receive({ kind: 'command', command: { kind: 'start', initBytes: new Uint8Array([1]), requestId: 1, hostGeneration: 7 } }, []);
    expect(visited).toBeLessThanOrEqual(4096); expect(messages.find(message => message.kind === 'crash').record).toEqual({ checkpoint: new Uint8Array([1]), diagnostic: null });
    expect(disposed).toBe(1);
  });
});
