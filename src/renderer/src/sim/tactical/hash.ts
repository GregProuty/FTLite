// Canonical flatten and hash of the tactical state (spec §4: same seed and inputs give the same hash), now declared as
// the `space` sim module (engine refactor spec §6): flatten, unflatten and the completeness test all come from its
// field list. The map is a pure function of the seed, so only its asteroid count is flattened. Per-tick events are
// outputs, reset every tick, and not hashed. −0 is written as 0. The field order is the H-0 order, unchanged.
import { hashF64 } from '../../../../shared/hash';
import { flag, flattenModule, moduleLength, scalar, unflattenModule, vector, type ModuleField, type SimModule } from '../module';
import { HEADING_COUNT, HUNTER_TRAIL_TICKS, LASER_CHARGE_UNITS, MAGAZINE, SHIELD_LAYERS, SHIP_HULL } from './tuning';
import { HunterMode, Outcome, type Missile, type Ship, type TacticalState } from './state';

/** Values per missile slot: a presence flag, then x, y, vx, vy, heading, headingAcc, age (zeros when empty). */
export const MISSILE_SLOT = 8;

/** A ship's scalar fields in canonical order; `rooms` comes after `hull` and `graceUntil` closes the ship. */
const SHIP_HEAD = ['x', 'y', 'vx', 'vy', 'heading', 'headingAcc', 'hull'] as const;
const SHIP_TAIL = ['planetHits', 'asteroidHits', 'shipHits', 'released', 'skidBudget', 'skidSign',
  'shields', 'shieldClock', 'laserCharge', 'laserHold', 'fireHeld', 'lock', 'magazine', 'magazineClock',
  'shots', 'laserHits', 'layersStripped', 'missilesLaunched', 'missileHits', 'missilesLost'] as const;
const SHIP_FLAGS = new Set<string>(['released', 'fireHeld']);
export const MISSILE_KEYS = ['x', 'y', 'vx', 'vy', 'heading', 'headingAcc', 'age'] as const satisfies readonly (keyof Missile)[];
/** Compile-time completeness: a `Missile` member missing from MISSILE_KEYS makes this `never` assignment fail typecheck. */
type MissingMissileKeys = Exclude<keyof Missile, (typeof MISSILE_KEYS)[number]>;
const missileKeysComplete: MissingMissileKeys extends never ? true : never = true;
void missileKeysComplete;
const HUNTER_HEAD = ['mode', 'room', 'timer', 'working', 'fireAt', 'lastLaunch', 'trailHead'] as const;

type Numeric<T> = { [K in keyof T]: T[K] extends number | boolean ? K : never }[keyof T];
function shipField(i: 0 | 1, key: Numeric<Ship>): ModuleField<TacticalState> {
  const name = `ships.${i}.${key}`;
  return SHIP_FLAGS.has(key) ? flag(name, (s) => s.ships[i][key] as boolean, (s, v) => { (s.ships[i] as unknown as Record<string, boolean>)[key] = v; })
    : scalar(name, (s) => s.ships[i][key] as number, (s, v) => { (s.ships[i] as unknown as Record<string, number>)[key] = v; });
}
function missileField(i: 0 | 1): ModuleField<TacticalState> {
  return {
    name: `missiles.${i}`, count: MISSILE_SLOT,
    read(s, out) { const m = s.missiles[i]; if (!m) { for (let k = 0; k < MISSILE_SLOT; k++) out.push(0); return; } out.push(1, m.x, m.y, m.vx, m.vy, m.heading, m.headingAcc, m.age); },
    write(s, values, offset) {
      const present = values[offset]!;
      if (present !== 0 && present !== 1) throw new Error(`missiles.${i}: presence ${present}`);
      if (present === 0) { for (let k = 1; k < MISSILE_SLOT; k++) if (values[offset + k] !== 0) throw new Error(`missiles.${i}: empty slot holds values`); s.missiles[i] = null; return; }
      const m = {} as Missile;
      MISSILE_KEYS.forEach((key, k) => { m[key] = values[offset + 1 + k]!; });
      s.missiles[i] = m;
    }
  };
}

const cache = new Map<number, ModuleField<TacticalState>[]>();
/** The field list for a map with `asteroids` asteroids (graceUntil holds asteroids + 2 bodies). */
function tacticalFields(asteroids: number): ModuleField<TacticalState>[] {
  let fields = cache.get(asteroids);
  if (fields) return fields;
  fields = [
    scalar('tick', (s) => s.tick, (s, v) => { s.tick = v; }),
    scalar('seed', (s) => s.seed, (s, v) => { s.seed = v; }),
    scalar('rng.s', (s) => s.rng.s, (s, v) => { s.rng.s = v; }),
    scalar('map.asteroids.length', (s) => s.map.asteroids.length, (s, v) => { if (v !== s.map.asteroids.length) throw new Error(`asteroid count ${v} does not match the map (${s.map.asteroids.length})`); }),
    scalar('outcome', (s) => s.outcome, (s, v) => { s.outcome = v; })
  ];
  for (const i of [0, 1] as const) {
    for (const key of SHIP_HEAD) fields.push(shipField(i, key));
    fields.push(vector(`ships.${i}.rooms`, 3, (s) => s.ships[i].rooms));
    for (const key of SHIP_TAIL) fields.push(shipField(i, key));
    fields.push(vector(`ships.${i}.graceUntil`, asteroids + 2, (s) => s.ships[i].graceUntil));
  }
  fields.push(missileField(0), missileField(1));
  for (const key of HUNTER_HEAD) fields.push(key === 'working'
    ? flag('hunter.working', (s) => s.hunter.working, (s, v) => { s.hunter.working = v; })
    : scalar(`hunter.${key}`, (s) => s.hunter[key] as number, (s, v) => { (s.hunter as unknown as Record<string, number>)[key] = v; }));
  fields.push(vector('hunter.trail', 2 * HUNTER_TRAIL_TICKS, (s) => s.hunter.trail));
  cache.set(asteroids, fields);
  return fields;
}

/** The `space` module: today's TacticalState (spec §3), in the H-0 canonical order. */
export const spaceModule: SimModule<TacticalState> = {
  id: 'space',
  fields: (s) => tacticalFields(s.map.asteroids.length),
  notSnapshotted: {
    map: 'regenerated from the seed by generateMap; the duel snapshot checks its mapHash',
    grid: 'the broad-phase grid, rebuilt from the map',
    systems: 'the same Ship objects as ships until R-2 moves the systems record out',
    events: 'per-tick events for the views, cleared every tick'
  },
  commands: ['laserLock', 'laserCharge', 'missileLaunch'],
  reasons: ['not-at-weapons', 'missile-in-flight', 'malformed', 'stale-tick', 'unavailable']
};

export function flattenTactical(s: TacticalState): Float64Array {
  const out: number[] = [];
  flattenModule(spaceModule, s, out);
  return Float64Array.from(out, (v) => (v === 0 ? 0 : v));
}
/** The number of values flattenTactical writes for this state's map. */
export function tacticalLength(s: TacticalState): number { return moduleLength(spaceModule, s); }
/** Write tactical values back into a state made from the same seed (same map); returns the offset after them. */
export function unflattenTactical(s: TacticalState, values: ArrayLike<number>, offset = 0): number { return unflattenModule(spaceModule, s, values, offset); }

export function hashTactical(s: TacticalState): string { return hashF64(flattenTactical(s)); }

/** Deep copy of a tactical state, derived from the space module (engine refactor spec §6: clone comes from the module's
 *  fields): the copy gets fresh containers of the state's shape, then every field's values are written into it. The map
 *  and the broad-phase grid are immutable after creation and are shared; the per-tick events are copied. −0 is kept. */
export function cloneTacticalFromModule(s: TacticalState): TacticalState {
  const shell = (src: Ship): Ship => ({ ...src, rooms: [0, 0, 0], graceUntil: new Int32Array(src.graceUntil.length) });
  const copy: TacticalState = { ...s, rng: { s: 0 }, ships: [shell(s.ships[0]), shell(s.ships[1])], missiles: [null, null],
    hunter: { ...s.hunter, trail: new Float64Array(s.hunter.trail.length) }, events: s.events.map((e) => ({ ...e })) };
  copy.systems = copy.ships;
  const values: number[] = [];
  flattenModule(spaceModule, s, values);
  unflattenModule(spaceModule, copy, values, 0);
  return copy;
}

const int = (v: number): boolean => Number.isInteger(v);
/** graceUntil is an Int32Array: a value outside signed 32 bits would wrap on restore and fail the hash only after allocation. */
const int32 = (v: number): boolean => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
const count = (v: number): boolean => Number.isInteger(v) && v >= 0;
const within = (lo: number, hi: number) => (v: number): boolean => Number.isInteger(v) && v >= lo && v <= hi;
/** headingAcc: physics.ts and missiles.ts drain it with `while (>= 1)` and `while (<= -1)`, so it always rests in (-1, 1). */
const acc = (v: number): boolean => Number.isFinite(v) && v > -1 && v < 1;
const bit = within(0, 1), heading = within(0, HEADING_COUNT - 1), room = within(0, 2), any = (): boolean => true;
/** Each ship field's per-value rule; every field not listed must hold finite values only (checked by the caller). */
const SHIP_RULES: Readonly<Record<string, (v: number) => boolean>> = {
  heading, headingAcc: acc, hull: (v) => v >= 0 && v <= SHIP_HULL, skidBudget: (v) => Number.isFinite(v) && v >= 0, rooms: within(0, 2), planetHits: count, asteroidHits: count, shipHits: count,
  released: bit, skidSign: within(-1, 1), shields: within(0, SHIELD_LAYERS), shieldClock: count,
  laserCharge: within(0, LASER_CHARGE_UNITS), laserHold: count, fireHeld: bit, lock: room, magazine: within(0, MAGAZINE), magazineClock: count,
  shots: count, laserHits: count, layersStripped: count, missilesLaunched: count, missileHits: count, missilesLost: count, graceUntil: int32
};
// Built on first use: state.ts imports this file for cloneTactical, so its enums are read lazily.
const topRules = (): Readonly<Record<string, (v: number) => boolean>> => ({
  tick: count, seed: within(0, 0xffffffff), 'rng.s': within(0, 0xffffffff), outcome: within(Outcome.Running, Outcome.Draw),
  'hunter.mode': within(HunterMode.Hunt, HunterMode.Repair), 'hunter.room': room, 'hunter.timer': int, 'hunter.working': bit,
  'hunter.fireAt': (v) => Number.isInteger(v) && v >= -1, 'hunter.lastLaunch': int, 'hunter.trailHead': within(0, HUNTER_TRAIL_TICKS - 1), 'hunter.trail': any
});

/** Check tactical values against the space module's field bounds and slot invariants without writing them anywhere:
 *  heading indices, integer counters, room levels 0..2, shield layers, the magazine, the hunter's and the outcome's
 *  enums, the map's asteroid count, and each missile slot (presence 0 or 1; an empty slot holds only zeros; a missile's
 *  heading index and age). `shape` is any tactical state made from the same seed (only its map is read). Throws naming the
 *  first bad field. */
export function validateTacticalValues(shape: TacticalState, values: ArrayLike<number>, offset = 0): void {
  let at = offset;
  const top = topRules();
  for (const f of spaceModule.fields(shape)) {
    const slice = Array.from({ length: f.count }, (_, k) => values[at + k]!);
    const bad = (why: string): never => { throw new Error(`duel snapshot tactical ${f.name}: ${why} (${slice.slice(0, 8).join(', ')})`); };
    if (slice.some((v) => typeof v !== 'number' || !Number.isFinite(v))) bad('not finite');
    if (f.name === 'map.asteroids.length') { if (slice[0] !== shape.map.asteroids.length) bad('does not match the map'); }
    else if (f.name.startsWith('missiles.')) {
      const [present, , , , , head, headAcc, age] = slice as [number, number, number, number, number, number, number, number];
      if (!bit(present)) bad('presence is not 0 or 1');
      if (present === 0 && slice.some((v) => v !== 0)) bad('an empty slot holds values');
      if (present === 1 && (!heading(head) || !acc(headAcc) || !count(age))) bad('heading, headingAcc or age out of range');
    } else {
      const ship = /^ships\.[01]\.(.+)$/.exec(f.name), rule = ship ? SHIP_RULES[ship[1]!] : top[f.name];
      if (rule && !slice.every(rule)) bad('out of range');
    }
    at += f.count;
  }
}
