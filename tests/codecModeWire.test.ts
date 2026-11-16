// The mode wires (R-1b final review). ModeWire is generic over its mode's snapshot, so a mode's wire pairs only with
// its own snapshot type: the @ts-expect-error lines are the proof, since `npm run typecheck` (tests/ is in
// tsconfig.web.json) fails if they compile. And each mode's codec admits only its own `ended` record.
import { describe, expect, it } from 'vitest';
import { codecFor, duelCodec, duelWire, encodeMessage, sectorCodec, sectorWire } from '../src/renderer/src/net/codec';
import type { AuthorityMessage, EndRecord } from '../src/renderer/src/net/contracts';
import type { DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import type { Snapshot } from '../src/renderer/src/sim/snapshot';
import { createSimState } from '../src/renderer/src/sim/state';
import { telemetryRecord } from '../src/renderer/src/sim/telemetry';
import { LAYOUT } from './helpers/sim';

const ended = (record: EndRecord): AuthorityMessage<never> => ({ kind: 'event', event: { runId: 'run-1', eventSequence: 1, tick: 0, payload: { kind: 'ended', record } } });
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const duelEnd: EndRecord = { mode: 'duel', record: { outcome: 2, ticks: 8832, terminal: [['missile'], []], laserReleases: [11, 28], laserHits: [2, 28],
  missilesLaunched: [2, 5], missileHits: [0, 5], repairsFinished: [7, 9] } };

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
