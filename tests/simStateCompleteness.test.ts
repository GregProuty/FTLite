// The sector-state completeness guard: every SimState member is either a canonical field (so it is hashed, snapshotted
// and validated) or explicitly listed in NOT_SNAPSHOTTED next to canonicalFields(). A field added to SimState and
// forgotten in both places would silently escape the hash and the snapshot; this test catches it.
import { describe, expect, it } from 'vitest';
import starter from '../src/renderer/src/sim/ship/starter.json';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { canonicalFields, NOT_SNAPSHOTTED } from '../src/renderer/src/sim/canonicalFields';
import { createSimState, disposeSimState, type SimState } from '../src/renderer/src/sim/state';

const LAYOUTS = { starter: parseShip(starter), cutter: parseShip(cutter), skiff: parseShip(skiff) };

const isGroup = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !ArrayBuffer.isView(v) && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** Dotted paths of every SimState member that neither the manifest nor NOT_SNAPSHOTTED accounts for. */
function uncovered(s: SimState): string[] {
  const names = new Set(canonicalFields(s.layout, s.playerCount).map((f) => f.name));
  const missing: string[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string): void => {
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key, value = obj[key];
      if (names.has(path) || path in NOT_SNAPSHOTTED) continue;
      if (isGroup(value)) walk(value, path);
      else missing.push(path);
    }
  };
  walk(s as unknown as Record<string, unknown>, '');
  return missing;
}

describe('SimState completeness (every field hashed or explicitly excluded)', () => {
  for (const [name, layout] of Object.entries(LAYOUTS)) for (const players of [1, 2, 4].filter((p) => p <= layout.spawns.length)) {
    it(`${name}, ${players} player(s): every member is canonical or in NOT_SNAPSHOTTED`, () => {
      const s = createSimState(layout, players, 7);
      try { expect(uncovered(s)).toEqual([]); } finally { disposeSimState(s); }
    });
  }

  it('catches a member added without a canonical field or an exclusion', () => {
    const s = createSimState(LAYOUTS.starter, 2, 7);
    try {
      (s as unknown as Record<string, unknown>).newThing = 1;
      (s.run as unknown as Record<string, unknown>).newCounter = 0;
      expect(uncovered(s)).toEqual(['run.newCounter', 'newThing']);
    } finally { disposeSimState(s); }
  });

  it('every exclusion names a real member and is not also canonical; every rng stream holds only its seed word', () => {
    const s = createSimState(LAYOUTS.starter, 2, 7);
    try {
      const names = new Set(canonicalFields(s.layout, s.playerCount).map((f) => f.name));
      for (const path of Object.keys(NOT_SNAPSHOTTED)) {
        let obj: unknown = s;
        for (const part of path.split('.')) { expect(obj, path).toHaveProperty([part]); obj = (obj as Record<string, unknown>)[part]; }
        expect(names.has(path), path).toBe(false);
      }
      for (const stream of Object.values(s.rng)) expect(Object.keys(stream)).toEqual(['s']);   // flatten reads rng.<stream>.s only
    } finally { disposeSimState(s); }
  });
});
