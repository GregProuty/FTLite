// The duel on the sim module contract (engine refactor spec §6, R-1b): every member of the duel's state is a module's
// canonical field or on its declared not-snapshotted list; a member added to any module without either fails here; every
// field moves the hash; the modules' commands and reasons are the duel codec's kinds and members of COMMAND_REASONS.
import { describe, expect, it } from 'vitest';
import { COMMAND_REASONS } from '../src/renderer/src/net/contracts';
import { flatten } from '../src/renderer/src/sim/flatten';
import { flattenModule, unflattenModule, type SimModule } from '../src/renderer/src/sim/module';
import { DUEL_MODULES, DUEL_NOT_SNAPSHOTTED, interiorModule, presenceModule, repairModule } from '../src/renderer/src/sim/duel/modules';
import { flattenDuel, hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { MISSILE_KEYS, flattenTactical, spaceModule, unflattenTactical } from '../src/renderer/src/sim/tactical/hash';
import { cloneTactical, createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { CUTTER } from './helpers/scriptedDuel';

const isGroup = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !ArrayBuffer.isView(v) && (Array.isArray(v) ? v.some((x) => typeof x !== 'number') : Object.getPrototypeOf(v) === Object.prototype);
/** Dotted paths of every member under `root` that is neither a field name nor excluded. A numeric array is one member;
 *  any other array (ships, missile slots, presence flags) is walked by index. */
function uncovered(root: object, names: ReadonlySet<string>, excluded: Readonly<Record<string, string>>, skip: ReadonlySet<string> = new Set()): string[] {
  const missing: string[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string): void => {
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key, value = obj[key];
      if (names.has(path) || path in excluded || skip.has(path)) continue;
      if (isGroup(value)) walk(value, path); else missing.push(path);
    }
  };
  walk(root as Record<string, unknown>, '');
  return missing;
}
const names = <S>(m: SimModule<S>, s: S) => new Set(m.fields(s).map((f) => f.name));
const duelNames = (d: DuelState) => new Set([presenceModule, repairModule, interiorModule].flatMap((m) => [...names(m, d)]));
function played(seed: number, ticks: number): DuelState {
  const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
  for (let k = 0; k < ticks; k++) stepDuelTick(d, scriptedInput(pair, d));
  return d;
}

describe('the duel modules (spec §6 module contract)', () => {
  it('every TacticalState member is a space field or declared not snapshotted, for several maps', () => {
    for (const seed of [1, 7, 42]) {
      const s = createTacticalState(seed);
      expect(uncovered(s, names(spaceModule, s), spaceModule.notSnapshotted), `seed ${seed}`).toEqual([]);
    }
  });
  it('every DuelState member is a presence, repair or interior field, the space module\'s tactical state, or declared', () => {
    const d = createDuel(CUTTER, 1);
    try { expect(uncovered(d, duelNames(d), DUEL_NOT_SNAPSHOTTED, new Set(['tactical']))).toEqual([]); } finally { disposeDuel(d); }
  });
  it('catches a member added to a module without a field or an exclusion', () => {
    const d = createDuel(CUTTER, 1);
    try {
      (d.tactical as unknown as Record<string, unknown>).newThing = 1;
      (d.tactical.ships[0] as unknown as Record<string, unknown>).newCounter = 0;
      (d.tactical.hunter as unknown as Record<string, unknown>).newTimer = 3;
      (d as unknown as Record<string, unknown>).newFlag = true;
      expect(uncovered(d.tactical, names(spaceModule, d.tactical), spaceModule.notSnapshotted)).toEqual(['ships.0.newCounter', 'hunter.newTimer', 'newThing']);
      expect(uncovered(d, duelNames(d), DUEL_NOT_SNAPSHOTTED, new Set(['tactical']))).toEqual(['newFlag']);
    } finally { disposeDuel(d); }
  });
  it('a missile in flight is walked against the missile keys, and a member added to it is caught', () => {
    const d = played(7, 5156);
    try {
      const flying = d.tactical.missiles.filter((m) => m !== null);
      expect(flying.length, 'seed 7 tick 5156 has a missile in flight').toBeGreaterThan(0);
      const extras = () => flying.flatMap((m, i) => Object.keys(m!).filter((k) => !(MISSILE_KEYS as readonly string[]).includes(k)).map((k) => `${i}.${k}`));
      expect(extras()).toEqual([]);
      (flying[0] as unknown as Record<string, unknown>).newMissileThing = 1;
      expect(extras()).toEqual(['0.newMissileThing']);
    } finally { disposeDuel(d); }
  });
  it('every exclusion names a real member and is not also a field', () => {
    const d = createDuel(CUTTER, 1);
    try {
      for (const [m, s] of [[spaceModule, d.tactical], [presenceModule, d], [repairModule, d], [interiorModule, d]] as const)
        for (const path of Object.keys(m.notSnapshotted)) { expect(s, path).toHaveProperty(path.split('.')); expect(names(m as SimModule<object>, s).has(path)).toBe(false); }
      for (const path of Object.keys(DUEL_NOT_SNAPSHOTTED)) { expect(d, path).toHaveProperty(path.split('.')); expect(duelNames(d).has(path)).toBe(false); }
    } finally { disposeDuel(d); }
  });
  it('every space, presence and repair field changes the duel hash; the interior is covered by its own flatten', () => {
    const d = played(2, 900);
    try {
      const base = hashDuel(d);
      for (const { module, state } of DUEL_MODULES.slice(0, 3)) {
        const m = module as SimModule<unknown>, s = state(d);
        for (const f of m.fields(s)) {
          if (f.name === 'map.asteroids.length') continue;   // an identity check, never written (next test)
          const values: number[] = []; f.read(s, values);
          const changed = [...values]; changed[0] = f.name.startsWith('missiles.') || f.name.startsWith('present.') || f.name.endsWith('released') || f.name.endsWith('fireHeld') || f.name === 'hunter.working' ? 1 - changed[0]! : changed[0]! + 1;
          f.write(s, changed, 0);
          expect(hashDuel(d), `${m.id}.${f.name}`).not.toBe(base);
          f.write(s, values, 0);
          expect(hashDuel(d), `${m.id}.${f.name} restored`).toBe(base);
        }
      }
      d.interior.rooms.fire[0] = 0.5; expect(hashDuel(d)).not.toBe(base);
    } finally { disposeDuel(d); }
  });
  it('the asteroid count is an identity check against the regenerated map, and an empty missile slot holds only zeros', () => {
    const s = createTacticalState(1), values = Array.from(flattenTactical(s));
    values[3] = values[3]! + 1;
    expect(() => unflattenTactical(createTacticalState(1), values)).toThrow(/asteroid count/);
    const slot = spaceModule.fields(s).find((f) => f.name === 'missiles.0')!;
    expect(() => slot.write(s, [0, 1, 0, 0, 0, 0, 0, 0], 0)).toThrow(/empty slot/);
  });
  it('flatten is the modules in canonical order after SIM_VERSION, unchanged from the hash-completeness order', () => {
    const d = played(1, 600);
    try {
      expect(Array.from(flattenDuel(d))).toEqual([SIM_VERSION, ...flattenTactical(d.tactical), d.present[0] ? 1 : 0, d.present[1] ? 1 : 0, ...d.repair, ...flatten(d.interior)]);
      const copy = cloneTactical(d.tactical), fresh = createTacticalState(1);
      expect(unflattenTactical(fresh, flattenTactical(copy))).toBe(flattenTactical(copy).length);
      expect(flattenTactical(fresh)).toEqual(flattenTactical(copy));
      const out: number[] = []; flattenModule(presenceModule, d, out);
      expect(unflattenModule(presenceModule, d, out, 0)).toBe(2);
    } finally { disposeDuel(d); }
  });
  it('the modules own the duel\'s command kinds (setPaused is the core\'s), and their reasons are enum members', () => {
    const kinds = DUEL_MODULES.flatMap(({ module }) => [...module.commands]).sort();
    expect(kinds).toEqual(['laserCharge', 'laserLock', 'missileLaunch', 'presence', 'sit', 'stand']);
    for (const { module } of DUEL_MODULES) for (const reason of module.reasons) expect(COMMAND_REASONS, `${module.id}: ${reason}`).toContain(reason);
  });
  it('cloneTactical is derived from the space module: every field is copied, and changing it on the copy leaves the original', () => {
    const d = played(3, 1200);
    try {
      const original = flattenTactical(d.tactical), copy = cloneTactical(d.tactical);
      expect(flattenTactical(copy)).toEqual(original);
      expect(copy.map).toBe(d.tactical.map); expect(copy.grid).toBe(d.tactical.grid);
      for (const f of spaceModule.fields(copy)) {
        if (f.name === 'map.asteroids.length') continue;
        const values: number[] = []; f.read(copy, values);
        f.write(copy, values.map((v, k) => k === 0 ? (f.name.startsWith('missiles.') || f.name.endsWith('released') || f.name.endsWith('fireHeld') || f.name === 'hunter.working' ? 1 - v : v + 1) : v), 0);
      }
      expect(flattenTactical(d.tactical), 'the original is untouched').toEqual(original);
      expect(flattenTactical(copy)).not.toEqual(original);
    } finally { disposeDuel(d); }
  });
});
