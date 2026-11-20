// The duel on the sim module contract (engine refactor spec §6, R-1b and R-2): every member of the duel's state is a
// module's canonical field or on its declared not-snapshotted list; a member added to any module without either fails
// here; every field moves the hash; the modules' commands and reasons are the duel codec's kinds and members of
// COMMAND_REASONS. The space and ship modules share TacticalState, so it is held to their fields together.
import { describe, expect, it } from 'vitest';
import { COMMAND_REASONS } from '../src/renderer/src/net/contracts';
import { flatten } from '../src/renderer/src/sim/flatten';
import { flattenModule, unflattenModule, type SimModule } from '../src/renderer/src/sim/module';
import { powerModule } from '../src/renderer/src/sim/duel/power';   // Engineering spike spec §7
import { DUEL_MODULES, DUEL_NOT_SNAPSHOTTED, helmModule, interiorModule, presenceModule, repairModule, roundModule } from '../src/renderer/src/sim/duel/modules';
import { flattenDuel, hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { MISSILE_KEYS, ROUND_KEYS, flattenTactical, scienceModule, shipModule, spaceModule, TACTICAL_MODULES, unflattenTactical } from '../src/renderer/src/sim/tactical/hash';
import { cloneTactical, createTacticalState, placeMissile, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { CUTTER } from './helpers/scriptedDuel';

const isGroup = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !ArrayBuffer.isView(v) && (Array.isArray(v) ? v.some((x) => typeof x !== 'number') : Object.getPrototypeOf(v) === Object.prototype);
/** Dotted paths of every member under `root` that is neither a field name nor excluded. A numeric array is one member;
 *  any other array (ship slots, systems records, missile pool entries, presence flags) is walked by index. */
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
/** A missile pool entry is one field per member (active, owner) plus `flight` for its flight values. */
const tacticalNames = (s: TacticalState) => new Set([...TACTICAL_MODULES.flatMap((m) => [...names(m, s)]),
  ...s.missiles.flatMap((_, k) => MISSILE_KEYS.map((key) => `missiles.${k}.${key}`)),
  ...s.rounds.flatMap((_, k) => ROUND_KEYS.map((key) => `rounds.${k}.${key}`)),   // Valkyrn-i: a round pool entry as a missile's
  ...s.pew.flatMap((_, k) => ROUND_KEYS.map((key) => `pew.${k}.${key}`))]);       // W-1: the pew pool's likewise
const tacticalExcluded = { ...spaceModule.notSnapshotted, ...shipModule.notSnapshotted, ...scienceModule.notSnapshotted };
const duelNames = (d: DuelState) => new Set([presenceModule, repairModule, roundModule, helmModule, powerModule, interiorModule].flatMap((m) => [...names(m, d)]));
function played(seed: number, ticks: number): DuelState {
  const d = createSeatedDuel(CUTTER, seed), pair = createScriptedPair(seed);
  for (let k = 0; k < ticks; k++) stepDuelTick(d, scriptedInput(pair, d));
  return d;
}
/** Both pool entries in flight, so every missile field holds values a writer accepts when changed. */
function bothFlying(s: TacticalState): void {
  placeMissile(s, 0, { x: 100, y: -200, vx: 3, vy: 4, heading: 7, headingAcc: 0.25, age: 30 });
  placeMissile(s, 1, { x: -100, y: 200, vx: -3, vy: -4, heading: 9, headingAcc: -0.25, age: 40 });
}
/** Every round pool entry in flight (Valkyrn-i; W-1: the pew pool too), so every round field holds values a writer accepts when changed. */
function allRoundsFlying(s: TacticalState): void {
  s.rounds.forEach((r, k) => Object.assign(r, { active: true, owner: k % 2, x: 10 + k, y: -20, vx: 700, vy: 0, age: 1 + (k % 50) }));
  s.pew.forEach((r, k) => Object.assign(r, { active: true, owner: k % 2, x: 30 + k, y: -40, vx: 0, vy: -900, age: 1 + (k % 20) }));
}
/** A changed first value: flags and 0/1 members flip, everything else moves by one. */
const changedFirst = (name: string, v: number): number => (/\.(active|released|fireHeld|laserTargeted|gunLocked)$/.test(name) || /^derelict\.(trapped|salvaged)$/.test(name) || name.startsWith('present.') || name === 'hunter.working' ? 1 - v : v + 1);
const IDENTITY = new Set(['map.asteroids.length', 'ships.length']);

describe('the duel modules (spec §6 module contract)', () => {
  it('every TacticalState member is a space or ship field or declared not snapshotted, for several maps and slot counts', () => {
    for (const [seed, slots] of [[1, 2], [7, 2], [42, 3]] as const) {
      const s = createTacticalState(seed, slots);
      expect(uncovered(s, tacticalNames(s), tacticalExcluded), `seed ${seed}, ${slots} slots`).toEqual([]);
    }
  });
  it('every DuelState member is a presence, repair, round, helm or interior field, the tactical modules\' state, or declared', () => {
    const d = createSeatedDuel(CUTTER, 1);
    try { expect(uncovered(d, duelNames(d), DUEL_NOT_SNAPSHOTTED, new Set(['tactical']))).toEqual([]); } finally { disposeDuel(d); }
  });
  it('catches a member added to a module without a field or an exclusion', () => {
    const d = createSeatedDuel(CUTTER, 1);
    try {
      (d.tactical as unknown as Record<string, unknown>).newThing = 1;
      (d.tactical.ships[0] as unknown as Record<string, unknown>).newCounter = 0;
      (d.tactical.systems[1] as unknown as Record<string, unknown>).newGauge = 2;
      (d.tactical.hunter as unknown as Record<string, unknown>).newTimer = 3;
      (d as unknown as Record<string, unknown>).newFlag = true;
      expect(uncovered(d.tactical, tacticalNames(d.tactical), tacticalExcluded)).toEqual(['ships.0.newCounter', 'systems.1.newGauge', 'hunter.newTimer', 'newThing']);
      expect(uncovered(d, duelNames(d), DUEL_NOT_SNAPSHOTTED, new Set(['tactical']))).toEqual(['newFlag']);
    } finally { disposeDuel(d); }
  });
  it('a missile pool entry is walked against its fields, and a member added to it is caught', () => {
    const d = played(6, 2746);   // the first tick with a missile in flight (the W-4 merge with asteroids-iii, SIM 62: was 2745 on master; SIM_VERSION 60, asteroids-iii: was 4205; the merge with the Engineering spike and owner 2026-11-19 (playtest2feedback merge, SIM 59): was 2808 (kind b); FTL targeting (SIM_VERSION 49) moved seed 6's from 1726; the weapons update moved it from 6249 (Sci-1's merge left seed 9 no qualifying tick; homing torpedoes moved seed 4's, 5193; the hunter grace spec seed 7's, 5156)
    try {
      expect(d.tactical.missiles.some((m) => m.active), 'seed 6 tick 2746 has a missile in flight').toBe(true);
      expect(uncovered(d.tactical, tacticalNames(d.tactical), tacticalExcluded)).toEqual([]);
      (d.tactical.missiles[1] as unknown as Record<string, unknown>).newMissileThing = 1;
      expect(uncovered(d.tactical, tacticalNames(d.tactical), tacticalExcluded)).toEqual(['missiles.1.newMissileThing']);
    } finally { disposeDuel(d); }
  });
  it('every exclusion names a real member and is not also a field', () => {
    const d = createSeatedDuel(CUTTER, 1);
    try {
      for (const [m, s] of [[spaceModule, d.tactical], [shipModule, d.tactical], [scienceModule, d.tactical], [presenceModule, d], [repairModule, d], [helmModule, d], [interiorModule, d]] as const)
        for (const path of Object.keys(m.notSnapshotted)) { expect(s, path).toHaveProperty(path.split('.')); expect(names(m as SimModule<object>, s).has(path)).toBe(false); }
      for (const path of Object.keys(DUEL_NOT_SNAPSHOTTED)) { expect(d, path).toHaveProperty(path.split('.')); expect(duelNames(d).has(path)).toBe(false); }
    } finally { disposeDuel(d); }
  });
  it('every space, ship, science, presence and repair field changes the duel hash; the interior is covered by its own flatten', () => {
    const d = played(2, 900);
    try {
      bothFlying(d.tactical);
      allRoundsFlying(d.tactical);
      const base = hashDuel(d);
      for (const { module, state } of DUEL_MODULES.filter(({ module }) => module.id !== 'interior')) {   // Engineering spike spec §7: every non-interior module, power included
        const m = module as SimModule<unknown>, s = state(d);
        for (const f of m.fields(s)) {
          if (IDENTITY.has(f.name)) continue;   // identity checks, never written (next test)
          const values: number[] = []; f.read(s, values);
          const changed = [...values]; changed[0] = changedFirst(f.name, changed[0]!);
          f.write(s, changed, 0);
          expect(hashDuel(d), `${m.id}.${f.name}`).not.toBe(base);
          f.write(s, values, 0);
          expect(hashDuel(d), `${m.id}.${f.name} restored`).toBe(base);
        }
      }
      d.interior.rooms.fire[0] = 0.5; expect(hashDuel(d)).not.toBe(base);
    } finally { disposeDuel(d); }
  });
  it('the asteroid and slot counts are identity checks, and a free missile entry holds only zeros', () => {
    const s = createTacticalState(1), values = Array.from(flattenTactical(s));
    values[3] = values[3]! + 1;
    expect(() => unflattenTactical(createTacticalState(1), values)).toThrow(/asteroid count/);
    const slots = Array.from(flattenTactical(s)); slots[5] = 3;
    expect(() => unflattenTactical(createTacticalState(1), slots)).toThrow(/ship slot count 3/);
    expect(() => unflattenTactical(createTacticalState(1, 3), flattenTactical(s))).toThrow(/ship slot count 2/);
    const flight = spaceModule.fields(s).find((f) => f.name === 'missiles.0.flight')!;
    expect(() => flight.write(s, [1, 0, 0, 0, 0, 0, 0], 0)).toThrow(/a free entry holds values/);
    const active = spaceModule.fields(s).find((f) => f.name === 'missiles.0.active')!;
    expect(() => active.write(s, [2], 0)).toThrow(/not 0 or 1/);
  });
  it('flatten is the modules in canonical order after SIM_VERSION: space, ship, science, presence, repair, round, helm, interior', () => {
    const d = played(1, 600);
    try {
      const space: number[] = [], ship: number[] = [], science: number[] = [];
      flattenModule(spaceModule, d.tactical, space); flattenModule(shipModule, d.tactical, ship); flattenModule(scienceModule, d.tactical, science);
      expect(Array.from(flattenTactical(d.tactical))).toEqual([...space, ...ship, ...science].map((v) => (v === 0 ? 0 : v)));
      expect(Array.from(flattenDuel(d))).toEqual([SIM_VERSION, ...flattenTactical(d.tactical), d.present[0] ? 1 : 0, d.present[1] ? 1 : 0, ...d.repair, d.round, d.helmPlayer, d.baseTick, d.decidedTick, d.throttle, d.holdHeading, d.thrMille, d.thrCut ? 1 : 0, d.gas, d.gasIdle, ...d.power.heat, ...d.power.coolant, ...d.power.failed, ...flatten(d.interior)]);   // playtest2feedback §7; Engineering spike spec §7; helm round 2 §8
      const copy = cloneTactical(d.tactical), fresh = createTacticalState(1);
      expect(unflattenTactical(fresh, flattenTactical(copy))).toBe(flattenTactical(copy).length);
      expect(flattenTactical(fresh)).toEqual(flattenTactical(copy));
      const out: number[] = []; flattenModule(presenceModule, d, out);
      expect(unflattenModule(presenceModule, d, out, 0)).toBe(2);
    } finally { disposeDuel(d); }
  });
  it('the modules own the duel\'s command kinds (setPaused is the core\'s), and their reasons are enum members', () => {
    const kinds = DUEL_MODULES.flatMap(({ module }) => [...module.commands]).sort();
    expect(kinds).toEqual(['contactScan', 'designate', 'gunMode', 'heading', 'laserCharge', 'laserFire', 'laserFrequency', 'laserLock', 'laserMode', 'missileLaunch', 'pewFire', 'presence', 'rematch', 'rockLock', 'shipAirlock', 'shipCoolant', 'shipDoor', 'shipPower', 'sit', 'stand', 'throttle', 'throttleCut', 'torpLock', 'torpMode', 'weaponPower']);   // W-1, W-2, W-3 and the Engineering spike spec §7, §10.3 (owner 2026-11-19: no helmPower); W-4 spec §4.1 (gunMode); helm round 2 §2.3
    for (const { module } of DUEL_MODULES) for (const reason of module.reasons) expect(COMMAND_REASONS, `${module.id}: ${reason}`).toContain(reason);
  });
  it('cloneTactical is derived from the space and ship modules: every field is copied, and changing it on the copy leaves the original', () => {
    const d = played(3, 1200);
    try {
      bothFlying(d.tactical);
      const original = flattenTactical(d.tactical), copy = cloneTactical(d.tactical);
      expect(flattenTactical(copy)).toEqual(original);
      expect(copy.map).toBe(d.tactical.map);
      for (const m of TACTICAL_MODULES) for (const f of m.fields(copy)) {
        if (IDENTITY.has(f.name) || /^missiles\.\d+\.active$/.test(f.name)) continue;   // a freed entry would refuse its own values
        const values: number[] = []; f.read(copy, values);
        f.write(copy, values.map((v, k) => (k === 0 ? changedFirst(f.name, v) : v)), 0);
      }
      expect(flattenTactical(d.tactical), 'the original is untouched').toEqual(original);
      expect(flattenTactical(copy)).not.toEqual(original);
    } finally { disposeDuel(d); }
  });
});
