// The mode wires (R-1b final review). ModeWire is generic over its mode's snapshot, so a mode's wire pairs only with
// its own snapshot type: the @ts-expect-error lines are the proof, since `npm run typecheck` (tests/ is in
// tsconfig.web.json) fails if they compile. And each mode's codec admits only its own `ended` record.
import { describe, expect, it } from 'vitest';
import { codecFor, duelCodec, duelWire, encodeMessage, sectorCodec, sectorWire } from '../src/renderer/src/net/codec';
import { COMMAND_REASONS, type AuthorityMessage, type EndRecord } from '../src/renderer/src/net/contracts';
import type { DuelEndSummary } from '../src/renderer/src/sim/duel/summary';
import type { DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import type { Snapshot } from '../src/renderer/src/sim/snapshot';
import { createSimState } from '../src/renderer/src/sim/state';
import { telemetryRecord } from '../src/renderer/src/sim/telemetry';
import { LAYOUT } from './helpers/sim';

const ended = (record: EndRecord): AuthorityMessage<never> => ({ kind: 'event', event: { runId: 'run-1', eventSequence: 1, tick: 0, payload: { kind: 'ended', record } } });
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const none = { planet: 0, asteroid: 0, edge: 0, expired: 0, own: 0, missile: 0 };
const summary: DuelEndSummary = { outcome: 2, ticks: 8832, terminal: [['missile'], []], laserReleases: [11, 28], laserHits: [2, 28],
  missilesLaunched: [2, 5], missileHits: [0, 5], repairsFinished: [7, 9], laserMisses: [9, 0], layersStripped: [1, 4],
  missileLosses: [{ ...none, asteroid: 2 }, none], planetContacts: [1, 3], asteroidContacts: [4, 2], baits: 1, consoleSwaps: 2,
  helmEmptyTicks: 30, weaponsEmptyTicks: 40, enemyInArcTicks: 500, weaponsIdleTicks: 60, repairsStarted: [7, 9], walkingTicks: [100, 200], repairingTicks: [50, 60] };
const duelEnd: EndRecord = { mode: 'duel', record: summary };
const round = (record: unknown): AuthorityMessage<never> => ({ kind: 'event', event: { runId: 'run-1', eventSequence: 2, tick: 9000, payload: { kind: 'round', record } as never } });

describe('ModeWire ties a wire to its snapshot type', () => {
  it('pairs each wire with its own snapshot and refuses the other at compile time', () => {
    expect(typeof codecFor<Snapshot>(sectorWire)).toBe('function');
    expect(typeof codecFor<DuelSnapshot>(duelWire)).toBe('function');
    // @ts-expect-error the sector wire's header schema is not a DuelSnapshot header
    codecFor<DuelSnapshot>(sectorWire);
    // @ts-expect-error the duel wire's header schema is not a sector Snapshot header
    codecFor<Snapshot>(duelWire);
  });
});

describe('per-mode end records', () => {
  const sim = createSimState(LAYOUT, 2, 17), sectorEnd: EndRecord = { mode: 'sector', record: telemetryRecord(sim, 17) };
  it('the sector codec round trips its own ended record and rejects the duel\'s', () => {
    const codec = sectorCodec(), message = ended(sectorEnd);
    // The module-level sector codec and sectorCodec() write the same bytes, stable through a decode.
    expect(codec.encodeMessage(message)).toEqual(encodeMessage(message));
    expect(codec.encodeMessage(codec.decodeMessage(encodeMessage(message)))).toEqual(encodeMessage(message));
    expect(codec.decodeMessage(codec.encodeMessage(message))).toEqual(message);
    expect(() => codec.encodeMessage(ended(duelEnd))).toThrow();
    expect(() => codec.decodeMessage(raw(ended(duelEnd)))).toThrow();
  });
  it('the duel codec round trips its own ended record and rejects the sector\'s and a null summary', () => {
    const codec = duelCodec(2), message = ended(duelEnd);
    expect(codec.decodeMessage(codec.encodeMessage(message))).toEqual(message);
    expect(() => codec.encodeMessage(ended(sectorEnd))).toThrow();
    expect(() => codec.decodeMessage(raw(ended(sectorEnd)))).toThrow();
    expect(() => codec.decodeMessage(raw(ended({ mode: 'duel', record: null } as unknown as EndRecord)))).toThrow();
  });
});

describe('the duel round event and the round reasons (H-2 spec §4)', () => {
  const record = { ...summary, round: 3, seed: 1234, baseTick: 8000 };
  it('the duel codec round trips a round record; the sector codec rejects a round event', () => {
    const codec = duelCodec(2);
    expect(codec.decodeMessage(codec.encodeMessage(round(record)))).toEqual(round(record));
    expect(() => codec.decodeMessage(raw(round({ ...record, round: -1 })))).toThrow();
    expect(() => codec.decodeMessage(raw(round({ ...record, extra: 1 })))).toThrow();
    expect(() => codec.decodeMessage(raw(round(summary)))).toThrow();
    expect(() => sectorCodec().encodeMessage(round(record))).toThrow();
    expect(() => sectorCodec().decodeMessage(raw(round(record)))).toThrow();
  });
  it('rematch is a duel command only, and the closed reason enum carries duel-running and duel-decided for every codec', () => {
    const command = (c: unknown) => raw({ kind: 'command', envelope: { runId: 'run-1', id: { player: 0, sequence: 1 }, requestedTick: 0, command: c } });
    expect(duelCodec(2).decodeMessage(command({ kind: 'rematch' }))).toMatchObject({ kind: 'command', envelope: { command: { kind: 'rematch' } } });
    expect(() => sectorCodec().decodeMessage(command({ kind: 'rematch' }))).toThrow();
    expect(COMMAND_REASONS.slice(-2)).toEqual(['duel-running', 'duel-decided']);
    for (const codec of [sectorCodec(), duelCodec(2)]) for (const reason of ['duel-running', 'duel-decided'] as const) {
      const message: AuthorityMessage<never> = { kind: 'result', runId: 'run-1', result: { id: { player: 0, sequence: 1 }, tick: 5, status: 'rejected', reason } };
      expect(codec.decodeMessage(codec.encodeMessage(message))).toEqual(message);
    }
  });
});
