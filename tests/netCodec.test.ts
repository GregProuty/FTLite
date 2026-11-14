import { describe, it, expect } from 'vitest';
import { decodeMessage, encodeMessage, latestMessageMetadata, MAX_MESSAGE_BYTES } from '../src/renderer/src/net/codec';
import type { AuthorityMessage, ClientMessage } from '../src/renderer/src/net/contracts';
import { commands, commandMessage, heldMessage } from './helpers/net';
import { createSimState } from '../src/renderer/src/sim/state';
import { saveSnapshot } from '../src/renderer/src/sim/snapshot';
import { telemetryRecord } from '../src/renderer/src/sim/telemetry';
import { LAYOUT } from './helpers/sim';

const raw = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
const roundTrip = (value: ClientMessage | AuthorityMessage) => decodeMessage(encodeMessage(value));
describe('closed wire codec', () => {
  it.each(commands)('round trips command $kind without adding fields', (command) => {
    expect(roundTrip(commandMessage(command))).toEqual(commandMessage(command));
  });
  it.each(commands)('rejects unknown fields on command $kind', (command) => {
    const message = commandMessage(command);
    if (message.kind !== 'command') throw new Error('fixture');
    expect(() => decodeMessage(raw({ ...message, envelope: { ...message.envelope, command: { ...command, bogus: true } } }))).toThrow();
  });
  it('round trips callout and the distinct temporary immutable bridge', () => {
    const callout: ClientMessage = { kind: 'callout', runId: 'run-1', player: 3, sequence: 1, calloutKind: 'contextual' };
    const legacy: ClientMessage = { kind: 'legacyCardInput', runId: 'run-1', id: { player: 0, sequence: 1 }, requestedTick: 0,
      input: { moveX: 0.8, moveY: 0.8, interactHeld: true, interactPressed: false, confirmPressed: true, cancelPressed: false } };
    expect(roundTrip(callout)).toEqual(callout);
    expect(roundTrip(legacy)).toEqual(legacy);
    expect(() => decodeMessage(raw({ ...callout, text: 'forged' }))).toThrow();
    expect(() => decodeMessage(raw({ ...callout, calloutKind: 'chat' }))).toThrow();
  });
  it('preserves raw diagonal, subnormal and one-ulp Float64 axes; normalizes negative zero', () => {
    for (const value of [0.8, Number.MIN_VALUE, 1 - Number.EPSILON / 2, -1, -0]) {
      const message = heldMessage(); message.frame.held.moveX = value;
      const decoded = roundTrip(message);
      expect(decoded).toEqual({ ...message, frame: { ...message.frame, held: { ...message.frame.held, moveX: value === 0 ? 0 : value } } });
    }
  });
  it.each([NaN, Infinity, -Infinity, 1.0000000000000002, -1.0000000000000002])('rejects invalid axis %s at encoding', (value) => {
    const message = heldMessage(); message.frame.held.moveX = value;
    expect(() => encodeMessage(message)).toThrow();
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe command sequences %s', (sequence) => {
    expect(() => decodeMessage(raw(commandMessage({ kind: 'stand' }, sequence)))).toThrow();
  });
  it('rejects zero sequence, unowned-range players, unsafe ticks/indexes and malformed nested refs', () => {
    expect(() => decodeMessage(raw(commandMessage({ kind: 'stand' }, 0)))).toThrow();
    const held = heldMessage(); held.frame.player = 4; expect(() => decodeMessage(raw(held))).toThrow();
    held.frame.player = 0; held.frame.tick = Number.MAX_SAFE_INTEGER + 1; expect(() => decodeMessage(raw(held))).toThrow();
    expect(() => decodeMessage(raw(commandMessage({ kind: 'sit', station: 65536 })))).toThrow();
    expect(() => decodeMessage(raw(commandMessage({ kind: 'scan', station: 0, target: { kind: 'object', stableId: 0 } })))).toThrow();
    expect(() => decodeMessage(raw({ kind: 'held', frame: { ...held.frame, tick: 0, held: { moveX: '0', moveY: 0, interactHeld: false } } }))).toThrow();
  });
  it('accepts old-run and unowned-but-in-range data structurally for authority admission', () => {
    expect(roundTrip(heldMessage(3, 1, 'previous-run'))).toEqual(heldMessage(3, 1, 'previous-run'));
  });
  it('rejects excess bytes, invalid UTF-8, malformed JSON and unknown tags', () => {
    expect(() => decodeMessage(new Uint8Array(MAX_MESSAGE_BYTES + 1))).toThrow();
    for (const data of [new Uint8Array([0xff]), raw({ kind: 'unknown' }), raw({ ...commandMessage(), extra: 1 }), raw({ kind: 'command', envelope: { command: { kind: 'unknown' } } }), new TextEncoder().encode('{')]) {
      expect(() => decodeMessage(data)).toThrow();
    }
  });
  it('round trips real state, results and every reliable event payload losslessly', () => {
    const sim = createSimState(LAYOUT, 2, 17);
    const state: AuthorityMessage = { kind: 'state', state: { runId: 'run-1', tick: 0, publicationSequence: 1,
      snapshot: saveSnapshot(sim), hash: '0123456789abcdef', phase: 'running', pauseReason: null, lagTicks: 0, tickTimeMs: null, pauseOwner: null, controlRevision: 0,
      commandHighWater: [0, 0], eventSequence: 0 } };
    expect(roundTrip(state)).toEqual(state);
    const result: AuthorityMessage = { kind: 'result', runId: 'run-1', result: { id: { player: 0, sequence: 1 }, tick: 0, status: 'rejected', reason: 'unsupported' } };
    expect(roundTrip(result)).toEqual(result);
    const payloads = [{ kind: 'cue' as const, cue: 'shot' as const }, { kind: 'callout' as const, player: 0, text: 'Need help!', station: null },
      { kind: 'pause' as const, paused: true, owner: 0, reason: 'focus' }, { kind: 'ended' as const, record: telemetryRecord(sim, 17) }];
    for (const payload of payloads) {
      const message: AuthorityMessage = { kind: 'event', event: { runId: 'run-1', eventSequence: 1, tick: 0, payload } };
      expect(roundTrip(message)).toEqual(message);
      expect(() => decodeMessage(raw({ ...message, event: { ...message.event, payload: { ...payload, extra: true } } }))).toThrow();
    }
    expect(() => decodeMessage(raw({ ...result, result: { ...result.result, reason: 'anything' } }))).toThrow();
    expect(() => decodeMessage(raw({ ...state, state: { ...state.state, snapshot: { ...state.state.snapshot, values: [null] } } }))).toThrow();
  });
  it('extracts per-run/player latest metadata and leaves reliable messages outside latest streams', () => {
    expect(latestMessageMetadata(encodeMessage(heldMessage(0, 7)))).toEqual({ key: 'held:run-1:0', sequence: 7 });
    expect(latestMessageMetadata(encodeMessage(heldMessage(1, 3)))).toEqual({ key: 'held:run-1:1', sequence: 3 });
    expect(latestMessageMetadata(encodeMessage(commandMessage()))).toBeNull();
  });
});



describe('wire limit edges', () => {
  it('rejects raw JSON overflow/nonfinite axes and unknown nested input fields', () => {
    for (const number of ['1e309', '-1e309', 'null', '"0"']) {
      const data = new TextEncoder().encode('{"kind":"held","frame":{"runId":"r","player":0,"tick":0,"sequence":1,"held":{"moveX":' + number + ',"moveY":0,"interactHeld":false}}}');
      expect(() => decodeMessage(data)).toThrow();
    }
    const message = heldMessage();
    expect(() => decodeMessage(raw({ ...message, frame: { ...message.frame, held: { ...message.frame.held, pressed: true } } }))).toThrow();
  });
  it('accepts safe sequence/tick maximums without truncation and rejects zero auxiliary sequences', () => {
    const message = heldMessage(3, Number.MAX_SAFE_INTEGER); message.frame.tick = Number.MAX_SAFE_INTEGER;
    expect(roundTrip(message)).toEqual(message);
    expect(() => decodeMessage(raw({ kind: 'callout', runId: 'r', player: 0, sequence: 0, calloutKind: 'contextual' }))).toThrow();
  });
  it('rejects oversized encoding, excessive publication vectors and unknown RNG keys', () => {
    const sim = createSimState(LAYOUT, 2, 17), snapshot = saveSnapshot(sim);
    const message: AuthorityMessage & { kind: 'state' } = { kind: 'state', state: { runId: 'r', tick: 0, publicationSequence: 1,
      snapshot, hash: 'h', phase: 'paused', pauseReason: 'player', lagTicks: 0, tickTimeMs: null, pauseOwner: 0, controlRevision: 1, commandHighWater: [0, 0], eventSequence: 0 } };
    expect(latestMessageMetadata(encodeMessage(message))).toEqual({ key: 'state:r', sequence: 1 });
    expect(() => decodeMessage(raw({ ...message, state: { ...message.state, commandHighWater: [0, 0, 0, 0, 0] } }))).toThrow();
    expect(() => decodeMessage(raw({ ...message, state: { ...message.state, snapshot: { ...snapshot, header: { ...snapshot.header, rngStates: { ...snapshot.header.rngStates, extra: 1 } } } } }))).toThrow();
    snapshot.values = Array(40_000).fill(1);
    expect(() => encodeMessage(message)).toThrow(/byte limit/);
    snapshot.values = Array(65_537).fill(0);
    expect(() => encodeMessage(message)).toThrow();
  });
  it('round trips full-range finite Float64 state values and normalizes negative zero', () => {
    const snapshot = saveSnapshot(createSimState(LAYOUT, 2, 17)); snapshot.values = [Number.MAX_VALUE, Number.MIN_VALUE, -0, 0.3333333333333333];
    const message: AuthorityMessage = { kind: 'state', state: { runId: 'r', tick: 0, publicationSequence: 1, snapshot, hash: 'h', phase: 'running', pauseReason: null, lagTicks: 0, tickTimeMs: null,
      pauseOwner: null, controlRevision: 0, commandHighWater: [0, 0], eventSequence: 0 } };
    const decoded = roundTrip(message); if (decoded.kind !== 'state') throw new Error('fixture');
    expect(decoded.state.snapshot.values).toEqual([1.7976931348623157e308, 5e-324, 0, 0.3333333333333333]);
  });
});
