import { expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeMessage } from '../src/renderer/src/net/codec';

it('rejects the removed bridge and raw intent fields at the closed wire boundary', () => {
  const encodedLegacyCardInput = new TextEncoder().encode(JSON.stringify({ kind: 'legacyCardInput', runId: 'run', id: { player: 0, sequence: 1 }, requestedTick: 0, input: { station: 0, direction: 0, confirm: true } }));
  expect(() => decodeMessage(encodedLegacyCardInput)).toThrow();
  const raw = { kind: 'held', frame: { runId: 'run', player: 0, sequence: 1, tick: 0, held: { moveX: 0, moveY: 0, interactHeld: false, confirmPressed: true } } };
  expect(() => decodeMessage(new TextEncoder().encode(JSON.stringify(raw)))).toThrow();
});
it('contains no production bridge types, dispatch or render accumulator', () => {
  function files(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []); }
  for (const file of files('src')) expect(readFileSync(file, 'utf8'), file).not.toMatch(/legacyCardInput|LegacyCardInput|MigrationTickInput|stepAccumulator/);
});
