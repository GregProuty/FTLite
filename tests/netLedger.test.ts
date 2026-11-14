import { describe, expect, it } from 'vitest';
import { createLedger } from '../src/renderer/src/authority/ledger';
import type { CommandEnvelope } from '../src/renderer/src/net/contracts';

const command = (sequence = 1, requestedTick = 0, player = 0): CommandEnvelope => ({ runId: 'run', id: { player, sequence }, requestedTick, command: { kind: 'stand' } });
describe('authority command ledger', () => {
  it('queues once, deduplicates pending and completed IDs, and rejects changed payloads', () => {
    const ledger = createLedger([0]);
    expect(ledger.admit(command(), 0)).toEqual({ status: 'queued' });
    expect(ledger.admit(command(), 0).status).toBe('duplicate');
    expect(ledger.admit({ ...command(), command: { kind: 'moveTo', tile: 1 } }, 0)).toMatchObject({ status: 'rejected', result: { reason: 'conflicting-duplicate' } });
    ledger.finish({ id: command().id, tick: 0, status: 'applied' });
    expect(ledger.admit(command(), 1)).toMatchObject({ status: 'duplicate', result: { status: 'applied' } });
  });
  it('consumes expected stale IDs but not gaps, unowned or malformed input', () => {
    const ledger = createLedger([0]);
    for (const envelope of [command(2), command(1, 0, 1), { ...command(), command: { kind: 'unknown' } } as unknown as CommandEnvelope]) expect(ledger.admit(envelope, 0).status).toBe('rejected');
    expect(ledger.highWater()[0]).toBe(0);
    expect(ledger.admit(command(), 1)).toMatchObject({ result: { reason: 'stale-tick' } });
    expect(ledger.highWater()[0]).toBe(1);
    expect(ledger.admit(command(2, 1), 1).status).toBe('queued');
  });
  it('bounds results to 256 while old IDs never execute again', () => {
    const ledger = createLedger([0]);
    for (let sequence = 1; sequence <= 300; sequence++) {
      expect(ledger.admit(command(sequence, sequence), sequence).status).toBe('queued');
      ledger.finish({ id: { player: 0, sequence }, tick: sequence, status: 'applied' });
    }
    expect(ledger.admit(command(), 301)).toMatchObject({ status: 'duplicate', result: { status: 'already-processed' } });
  });
  it('caps each player at sixteen commands per tick', () => {
    const ledger = createLedger([0]);
    for (let i = 1; i <= 16; i++) expect(ledger.admit(command(i), 0).status).toBe('queued');
    expect(ledger.admit(command(17), 0)).toMatchObject({ result: { reason: 'over-capacity' } });
  });
  it('caps all pending envelopes at 256 independently of tick and preserves the next ID', () => {
    const ledger = createLedger([0]);
    for (let sequence = 1; sequence <= 256; sequence++) expect(ledger.admit(command(sequence, sequence), sequence).status).toBe('queued');
    expect(ledger.admit(command(257, 257), 257)).toMatchObject({ result: { reason: 'over-capacity' } });
    expect(ledger.highWater()[0]).toBe(256);
    ledger.finish({ id: { player: 0, sequence: 1 }, tick: 1, status: 'applied' });
    expect(ledger.admit(command(257, 257), 257).status).toBe('queued');
  });
});
