// One command union, result type and reason enum (engine refactor spec §6, R-1a): the duel's commands are members of
// Command, its envelopes carry a runId, its reasons join the closed COMMAND_REASONS enum the codec validates, and the
// result keeps `already-processed` and the wire-only `admission`. The ledger validates with the mode's codec and tags
// the sector end record on its wrapper.
import { describe, expect, it } from 'vitest';
import { createLedger } from '../src/renderer/src/authority/ledger';
import { COMMAND_REASONS, type CommandEnvelope, type CommandResult } from '../src/renderer/src/net/contracts';
import { createMessageCodec, decodeMessage, encodeMessage, sectorCodec } from '../src/renderer/src/net/codec';
import { LOCAL_DUEL_RUN, type DuelEnvelope, type DuelResult } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { telemetryRecord } from '../src/renderer/src/sim/telemetry';
import { makeState } from './helpers/sim';
import { CUTTER } from './helpers/scriptedDuel';

describe('one command union and result type', () => {
  it('the duel reasons are members of the closed reason enum the result codec validates', () => {
    expect(COMMAND_REASONS.slice(-5, -2)).toEqual(['not-in-duel', 'not-at-weapons', 'missile-in-flight']);   // then H-2's round reasons (codecModeWire.test.ts)
    for (const reason of ['not-in-duel', 'not-at-weapons', 'missile-in-flight'] as const) {
      const message = { kind: 'result' as const, runId: 'r', result: { id: { player: 0, sequence: 1 }, tick: 3, status: 'rejected' as const, reason } };
      expect(decodeMessage(encodeMessage(message))).toEqual(message);
    }
    expect(() => encodeMessage({ kind: 'result', runId: 'r', result: { id: { player: 0, sequence: 1 }, tick: 3, status: 'rejected', reason: 'made-up' } } as never)).toThrow();
  });
  it('keeps already-processed and the wire-only admission metadata', () => {
    const processed = { kind: 'result' as const, runId: 'r', result: { id: { player: 0, sequence: 1 }, tick: 3, status: 'already-processed' as const, admission: { expectedSequence: 2, disposition: 'terminal' as const } } };
    expect(decodeMessage(encodeMessage(processed))).toEqual(processed);
  });
  it('a duel envelope is a CommandEnvelope with a runId, and a duel result is a CommandResult', () => {
    const d = createDuel(CUTTER, 1);
    try {
      const other = [0, 1, 2, 3].find((k) => k !== d.nav && k !== d.weapons)!;   // a console the duel does not use
      const sit: DuelEnvelope = { runId: LOCAL_DUEL_RUN, id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'sit', station: other } };
      const shared: CommandEnvelope = sit;
      expect(shared.runId).toBe('duel');   // an offline duel stamps LOCAL_DUEL_RUN
      const results: DuelResult[] = stepDuelTick(d, { held: [], commands: [shared as DuelEnvelope] });
      const typed: CommandResult[] = results;
      expect(typed).toEqual([{ id: { player: 0, sequence: 1 }, tick: 0, status: 'rejected', reason: 'not-in-duel' }]);
    } finally { disposeDuel(d); }
  });
  it('the ledger validates envelopes with the mode codec: a kind the mode does not own is malformed', () => {
    const ledger = createLedger([0], 1, sectorCodec);
    const presence: CommandEnvelope = { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'presence', present: false } };
    expect(ledger.admit(presence, 0)).toEqual({ status: 'rejected', result: { id: { player: 0, sequence: 1 }, tick: 0, status: 'rejected', reason: 'malformed' } });
    const pause: CommandEnvelope = { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'setPaused', paused: true } };
    expect(ledger.admit(pause, 0)).toEqual({ status: 'queued' });
    expect(() => createMessageCodec(2).encodeMessage({ kind: 'command', envelope: { ...pause, id: { player: 2, sequence: 1 } } })).toThrow();
    expect(sectorCodec(2).encodeMessage({ kind: 'command', envelope: pause })).toEqual(createMessageCodec(2).encodeMessage({ kind: 'command', envelope: pause }));
  });
  it('the sector end record is tagged on the wrapper; the record itself is unchanged', () => {
    const record = telemetryRecord(makeState(), 5);
    const event = { kind: 'event' as const, event: { runId: 'r', eventSequence: 1, tick: 0, payload: { kind: 'ended' as const, record: { mode: 'sector' as const, record } } } };
    expect(decodeMessage(encodeMessage(event))).toEqual(event);
    expect(() => encodeMessage({ ...event, event: { ...event.event, payload: { kind: 'ended', record } } } as never)).toThrow();
  });
});
