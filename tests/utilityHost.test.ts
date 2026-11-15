import { describe, expect, it } from 'vitest';
import { createUtilityHost } from '../src/network/utilityHost';
import { createModeRegistry } from '../src/network/modes/registry';
import type { ModeDefinition } from '../src/network/modes/contracts';
import { portEndpoint } from './helpers/portEndpoint';

const identity = { protocolVersion: 2, modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
function harness() {
  const messages: any[] = [], attachments: unknown[] = []; let constructed = 0, disposed = 0, now = 0;
  const mode: ModeDefinition = { modeId: 'counter', schemaVersion: 1, simVersion: 9, createHost() {
    constructed++; let count = 0;
    return { start(bytes) { count = bytes[0]!; }, checkpoint: () => new Uint8Array([count]), restore() {},
      pause() { count++; }, attach(_link, _players, _policy, options) { attachments.push(options); return () => {}; }, dispose() { disposed++; } };
  } };
  const owner = createUtilityHost(createModeRegistry([mode]), { contentDigest: identity.contentDigest,
    clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, onCrash() {} }, message => messages.push(message));
  return { owner, messages, attachments, counters: () => [constructed, disposed], advance() { now++; } };
}
describe('utility trusted process boundary', () => {
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
      return { start() { deps.onCrash({ checkpoint: new Uint8Array([1]), diagnostic }); }, checkpoint: () => new Uint8Array([1]), restore() {}, pause() {}, attach: () => () => {}, dispose() { disposed++; } };
    } };
    const owner = createUtilityHost(createModeRegistry([mode]), { contentDigest: identity.contentDigest,
      clock: { nowMs: () => 0 }, scheduler: { schedule: () => () => {} }, onCrash() {} }, message => messages.push(message));
    owner.receive({ kind: 'initialize', ...identity }, []);
    owner.receive({ kind: 'command', command: { kind: 'start', initBytes: new Uint8Array([1]), requestId: 1, hostGeneration: 7 } }, []);
    expect(visited).toBeLessThanOrEqual(4096); expect(messages.find(message => message.kind === 'crash').record).toEqual({ checkpoint: new Uint8Array([1]), diagnostic: null });
    expect(disposed).toBe(1);
  });
});
