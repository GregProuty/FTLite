import { describe, it, expect } from 'vitest';
import { appendTelemetry, TELEMETRY_KEY } from '../src/renderer/src/app/telemetryStore';
import { TELEMETRY_KEEP } from '../src/renderer/src/sim/tuning';

const rec = (seed: number) => ({ seed, version: 1 }) as unknown as import('../src/renderer/src/sim/telemetry').TelemetryRecord;
function memory(initial?: string) {
  const map = new Map<string, string>(); if (initial !== undefined) map.set(TELEMETRY_KEY, initial);
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, read: () => JSON.parse(map.get(TELEMETRY_KEY) ?? 'null') as { seed: number }[] | null };
}

describe('appendTelemetry', () => {
  it('a missing key becomes a one-element array; an existing array is appended in order', () => {
    const m = memory(); appendTelemetry(m, rec(1));
    expect(m.read()!.map((r) => r.seed)).toEqual([1]);
    const n = memory(JSON.stringify([rec(1), rec(2)])); appendTelemetry(n, rec(3));
    expect(n.read()!.map((r) => r.seed)).toEqual([1, 2, 3]);
  });
  it('keeps the newest TELEMETRY_KEEP: fifty plus one drops the oldest and the new record is last', () => {
    const m = memory(JSON.stringify(Array.from({ length: TELEMETRY_KEEP }, (_, i) => rec(i + 1)))); appendTelemetry(m, rec(99));
    const seeds = m.read()!.map((r) => r.seed);
    expect(seeds).toHaveLength(TELEMETRY_KEEP); expect(seeds[0]).toBe(2); expect(seeds[seeds.length - 1]).toBe(99);
    const k = memory(JSON.stringify([rec(1), rec(2), rec(3)])); appendTelemetry(k, rec(4), 2);
    expect(k.read()!.map((r) => r.seed)).toEqual([3, 4]);
  });
  it('malformed JSON and a non-array root are replaced by a one-element array', () => {
    for (const bad of ['{not json', '{}', '42', '"x"', 'null']) { const m = memory(bad); appendTelemetry(m, rec(7)); expect(m.read()!.map((r) => r.seed)).toEqual([7]); }
  });
  it('a throwing getItem or setItem is swallowed', () => {
    let writes = 0;
    expect(() => appendTelemetry({ getItem: () => { throw new Error('denied'); }, setItem: () => { writes++; } }, rec(1))).not.toThrow();
    expect(writes).toBe(0);                                          // a denied read never writes (it is not malformed data)
    expect(() => appendTelemetry({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, rec(1))).not.toThrow();
  });
});
