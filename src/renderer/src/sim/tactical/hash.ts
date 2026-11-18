// Canonical flatten and hash of the tactical state (spec §4: same seed and inputs give the same hash), declared as three
// sim modules over the one TacticalState (engine refactor spec §5 and §6, R-2; Sci-1 spec §6.2): `space` (the slots'
// bodies, the missile pool, the hunter, the outcome), `ship` (each slot's systems record) and `science` (hostility, the
// scans, the designation, the weak frequency, the derelict). Flatten, unflatten, clone, validation and the
// completeness test all come from their field lists; flattenTactical is space, ship, science, the duel's order. The map is a
// pure function of the seed, so only its asteroid count is flattened; the slot count is flattened the same way. Per-tick
// events are outputs, reset every tick, and not hashed. −0 is written as 0.
import { hashF64 } from '../../../../shared/hash';
import { flag, flattenModule, moduleLength, scalar, unflattenModule, vector, type ModuleField, type SimModule } from '../module';
import { SHIP_CLASSES } from './defs';
import { DERELICT_FAR_MAX, DERELICT_FAR_MIN, DERELICT_NEAR_MAX, DERELICT_NEAR_MIN, HEADING_COUNT, HUNTER_TRAIL_TICKS, SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from './tuning';
import { emptyMissile, HunterMode, Outcome, type Missile, type MissileFlight, type Ship, type ShipSystems, type TacticalState } from './state';

/** Values per missile pool entry: active, owner, then the flight x, y, vx, vy, heading, headingAcc, age (zeros when free). */
export const MISSILE_SLOT = 9;

/** A ship body's scalar fields in canonical order after `active`; `graceUntil` closes the body. */
const BODY = ['x', 'y', 'vx', 'vy', 'heading', 'headingAcc', 'planetHits', 'asteroidHits', 'shipHits', 'released', 'skidBudget', 'skidSign'] as const satisfies readonly (keyof Ship)[];
/** A systems record's scalar fields in canonical order; `rooms` comes after `hull`. */
const SYSTEMS_HEAD = ['cls', 'target', 'hull'] as const satisfies readonly (keyof ShipSystems)[];
const SYSTEMS_TAIL = ['shields', 'shieldClock', 'laserCharge', 'laserHold', 'fireHeld', 'lock', 'freq', 'magazine', 'magazineClock',
  'shots', 'laserHits', 'layersStripped', 'missilesLaunched', 'missileHits', 'missilesLost'] as const satisfies readonly (keyof ShipSystems)[];
const FLAGS = new Set<string>(['released', 'fireHeld']);
export const MISSILE_KEYS = ['x', 'y', 'vx', 'vy', 'heading', 'headingAcc', 'age'] as const satisfies readonly (keyof MissileFlight)[];
/** Compile-time completeness: a `Missile` member missing from these keys makes this `never` assignment fail typecheck. */
type MissingMissileKeys = Exclude<keyof Missile, (typeof MISSILE_KEYS)[number] | 'active' | 'owner'>;
const missileKeysComplete: MissingMissileKeys extends never ? true : never = true;
void missileKeysComplete;
const HUNTER_HEAD = ['mode', 'room', 'timer', 'working', 'fireAt', 'lastLaunch', 'trailHead'] as const;

type Numeric<T> = { [K in keyof T]: T[K] extends number | boolean ? K : never }[keyof T];
function member(name: string, key: string, get: (s: TacticalState) => object): ModuleField<TacticalState> {
  const rec = (s: TacticalState) => get(s) as Record<string, number | boolean>;
  return FLAGS.has(key) ? flag(name, (s) => rec(s)[key] as boolean, (s, v) => { rec(s)[key] = v; })
    : scalar(name, (s) => rec(s)[key] as number, (s, v) => { rec(s)[key] = v; });
}
const bodyField = (i: number, key: Numeric<Ship>): ModuleField<TacticalState> => member(`ships.${i}.${key}`, key, (s) => s.ships[i]!);
const systemsField = (i: number, key: Numeric<ShipSystems>): ModuleField<TacticalState> => member(`systems.${i}.${key}`, key, (s) => s.systems[i]!);
/** A 0/1 field that refuses any other value (an entry's presence, a slot's activity). */
function bit(name: string, get: (s: TacticalState) => boolean, set: (s: TacticalState, v: boolean) => void): ModuleField<TacticalState> {
  return { name, count: 1, read: (s, out) => { out.push(get(s) ? 1 : 0); },
    write: (s, values, offset) => { const v = values[offset]!; if (v !== 0 && v !== 1) throw new Error(`${name}: ${v} is not 0 or 1`); set(s, v === 1); } };
}
function missileFields(k: number): ModuleField<TacticalState>[] {
  return [
    bit(`missiles.${k}.active`, (s) => s.missiles[k]!.active, (s, v) => { s.missiles[k]!.active = v; }),
    scalar(`missiles.${k}.owner`, (s) => s.missiles[k]!.owner, (s, v) => { s.missiles[k]!.owner = v; }),
    {
      name: `missiles.${k}.flight`, count: MISSILE_KEYS.length,
      read(s, out) { const m = s.missiles[k]!; for (const key of MISSILE_KEYS) out.push(m[key]); },
      write(s, values, offset) {
        const m = s.missiles[k]!;
        if (!m.active && (m.owner !== 0 || MISSILE_KEYS.some((_, j) => values[offset + j] !== 0))) throw new Error(`missiles.${k}: a free entry holds values`);
        MISSILE_KEYS.forEach((key, j) => { m[key] = values[offset + j]!; });
      }
    }
  ];
}

const spaceCache = new Map<string, ModuleField<TacticalState>[]>(), shipCache = new Map<number, ModuleField<TacticalState>[]>();
/** The space field list for `slots` ship slots on a map with `asteroids` asteroids (graceUntil holds asteroids + slots bodies). */
function spaceFields(asteroids: number, slots: number): ModuleField<TacticalState>[] {
  const key = `${asteroids}:${slots}`;
  let fields = spaceCache.get(key);
  if (fields) return fields;
  fields = [
    scalar('tick', (s) => s.tick, (s, v) => { s.tick = v; }),
    scalar('seed', (s) => s.seed, (s, v) => { s.seed = v; }),
    scalar('rng.s', (s) => s.rng.s, (s, v) => { s.rng.s = v; }),
    scalar('map.asteroids.length', (s) => s.map.asteroids.length, (s, v) => { if (v !== s.map.asteroids.length) throw new Error(`asteroid count ${v} does not match the map (${s.map.asteroids.length})`); }),
    scalar('outcome', (s) => s.outcome, (s, v) => { s.outcome = v; }),
    scalar('ships.length', (s) => s.ships.length, (s, v) => { if (v !== s.ships.length) throw new Error(`ship slot count ${v} does not match the state (${s.ships.length})`); })
  ];
  for (let i = 0; i < slots; i++) {
    fields.push(bit(`ships.${i}.active`, (s) => s.ships[i]!.active, (s, v) => { s.ships[i]!.active = v; }));
    for (const key of BODY) fields.push(bodyField(i, key));
    fields.push(vector(`ships.${i}.graceUntil`, asteroids + slots, (s) => s.ships[i]!.graceUntil));
  }
  for (let k = 0; k < slots; k++) fields.push(...missileFields(k));
  for (const key of HUNTER_HEAD) fields.push(key === 'working'
    ? flag('hunter.working', (s) => s.hunter.working, (s, v) => { s.hunter.working = v; })
    : scalar(`hunter.${key}`, (s) => s.hunter[key] as number, (s, v) => { (s.hunter as unknown as Record<string, number>)[key] = v; }));
  fields.push(vector('hunter.trail', 2 * HUNTER_TRAIL_TICKS, (s) => s.hunter.trail));
  spaceCache.set(key, fields);
  return fields;
}
/** The ship field list for `slots` systems records. */
function shipFields(slots: number): ModuleField<TacticalState>[] {
  let fields = shipCache.get(slots);
  if (fields) return fields;
  fields = [];
  for (let i = 0; i < slots; i++) {
    for (const key of SYSTEMS_HEAD) fields.push(systemsField(i, key));
    fields.push(vector(`systems.${i}.rooms`, 3, (s) => s.systems[i]!.rooms));
    for (const key of SYSTEMS_TAIL) fields.push(systemsField(i, key));
  }
  shipCache.set(slots, fields);
  return fields;
}

/** The `space` module: the slots' bodies, the missile pool, the hunter and the outcome (engine refactor spec §5). The
 *  space and ship modules share TacticalState: `systems` is the ship module's. */
export const spaceModule: SimModule<TacticalState> = {
  id: 'space',
  fields: (s) => spaceFields(s.map.asteroids.length, s.ships.length),
  notSnapshotted: {
    map: 'regenerated from the seed by generateMap; the duel snapshot checks its mapHash',
    grid: 'the broad-phase grid, rebuilt from the map',
    events: 'per-tick events for the views, cleared every tick'
  },
  commands: [],
  reasons: []
};
/** The `ship` module (engine refactor spec §6, R-2 stage): one systems record per ship slot, holding today's duel rules. */
export const shipModule: SimModule<TacticalState> = {
  id: 'ship',
  fields: (s) => shipFields(s.systems.length),
  notSnapshotted: {},
  commands: ['laserLock', 'laserCharge', 'missileLaunch'],
  reasons: ['not-at-weapons', 'missile-in-flight', 'malformed', 'stale-tick', 'unavailable']
};
/** The `science` module (Sci-1 spec §6.2): round-relative time and hostility, what each contact is known to, the ship's
 *  one scanner, Science's designation, the enemy's weak frequency and the derelict, in this order. */
const SCIENCE: ModuleField<TacticalState>[] = [
  scalar('startTick', (s) => s.startTick, (s, v) => { s.startTick = v; }),
  scalar('hostileAt', (s) => s.hostileAt, (s, v) => { s.hostileAt = v; }),
  vector('known', 2, (s) => s.known),
  ...(['contact', 'level', 'progress', 'rate', 'by'] as const).map((k) => scalar<TacticalState>(`scan.${k}`, (s) => s.scan[k], (s, v) => { s.scan[k] = v; })),
  scalar('designated', (s) => s.designated, (s, v) => { s.designated = v; }),
  scalar('weakFreq', (s) => s.weakFreq, (s, v) => { s.weakFreq = v; }),
  ...(['orbitR', 'phase', 'loot'] as const).map((k) => scalar<TacticalState>(`derelict.${k}`, (s) => s.derelict[k], (s, v) => { s.derelict[k] = v; })),
  flag('derelict.trapped', (s) => s.derelict.trapped, (s, v) => { s.derelict.trapped = v; }),
  scalar('derelict.salvage', (s) => s.derelict.salvage, (s, v) => { s.derelict.salvage = v; }),
  flag('derelict.salvaged', (s) => s.derelict.salvaged, (s, v) => { s.derelict.salvaged = v; })
];
export const scienceModule: SimModule<TacticalState> = {
  id: 'science',
  fields: () => SCIENCE,
  notSnapshotted: {},
  commands: ['contactScan', 'designate', 'laserFrequency'],
  reasons: ['stale-tick', 'invalid-seat', 'not-at-weapons', 'malformed', 'unavailable']
};
/** The tactical state's modules in canonical order. */
export const TACTICAL_MODULES: readonly SimModule<TacticalState>[] = [spaceModule, shipModule, scienceModule];

/** The space, ship and science modules' values, −0 written as 0. */
export function flattenTactical(s: TacticalState): Float64Array {
  const out: number[] = [];
  for (const m of TACTICAL_MODULES) flattenModule(m, s, out);
  return Float64Array.from(out, (v) => (v === 0 ? 0 : v));
}
/** The number of values flattenTactical writes for this state's map and slots. */
export function tacticalLength(s: TacticalState): number { return TACTICAL_MODULES.reduce((n, m) => n + moduleLength(m, s), 0); }
/** Write tactical values back into a state made from the same seed and slot count; returns the offset after them. */
export function unflattenTactical(s: TacticalState, values: ArrayLike<number>, offset = 0): number {
  for (const m of TACTICAL_MODULES) offset = unflattenModule(m, s, values, offset);
  return offset;
}

export function hashTactical(s: TacticalState): string { return hashF64(flattenTactical(s)); }

/** Deep copy of a tactical state, derived from the space and ship modules (engine refactor spec §6: clone comes from the
 *  modules' fields): the copy gets fresh containers of the state's shape, then every field's values are written into it.
 *  The map and the broad-phase grid are immutable after creation and are shared; the per-tick events are copied. −0 is kept. */
export function cloneTacticalFromModule(s: TacticalState): TacticalState {
  const copy: TacticalState = { ...s, rng: { s: 0 },
    ships: s.ships.map((b) => ({ ...b, graceUntil: new Int32Array(b.graceUntil.length) })) as TacticalState['ships'],
    systems: s.systems.map((y) => ({ ...y, rooms: [0, 0, 0] })) as TacticalState['systems'],
    missiles: s.missiles.map(emptyMissile) as TacticalState['missiles'],
    hunter: { ...s.hunter, trail: new Float64Array(s.hunter.trail.length) }, events: s.events.map((e) => ({ ...e })),
    known: [0, 0], scan: { ...s.scan }, derelict: { ...s.derelict } };   // fresh science containers; the values are written below
  const values: number[] = [];
  for (const m of TACTICAL_MODULES) flattenModule(m, s, values);
  unflattenTactical(copy, values, 0);
  return copy;
}

const int = (v: number): boolean => Number.isInteger(v);
/** graceUntil is an Int32Array: a value outside signed 32 bits would wrap on restore and fail the hash only after allocation. */
const int32 = (v: number): boolean => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
const count = (v: number): boolean => Number.isInteger(v) && v >= 0;
const within = (lo: number, hi: number) => (v: number): boolean => Number.isInteger(v) && v >= lo && v <= hi;
/** headingAcc: physics.ts and missiles.ts drain it with `while (>= 1)` and `while (<= -1)`, so it always rests in (-1, 1). */
const acc = (v: number): boolean => Number.isFinite(v) && v > -1 && v < 1;
const flagBit = within(0, 1), heading = within(0, HEADING_COUNT - 1), room = within(0, 2), any = (): boolean => true;
const most = (f: (c: (typeof SHIP_CLASSES)[number]) => number): number => Math.max(...SHIP_CLASSES.map(f));
/** Each body field's per-value rule; every field must hold finite values (checked first). */
const BODY_RULES: Readonly<Record<string, (v: number) => boolean>> = {
  active: flagBit, heading, headingAcc: acc, skidBudget: (v) => Number.isFinite(v) && v >= 0, planetHits: count, asteroidHits: count, shipHits: count,
  released: flagBit, skidSign: within(-1, 1), graceUntil: int32
};
/** Each systems field's per-value rule, against the largest class (an inactive slot is checked for zeros separately). */
const systemsRules = (slots: number): Readonly<Record<string, (v: number) => boolean>> => ({
  cls: within(0, SHIP_CLASSES.length - 1), target: within(0, slots - 1), hull: (v) => v >= 0 && v <= most((c) => c.hull), rooms: room,
  shields: within(0, most((c) => c.shields.layers) + 1), freq: within(0, 2), shieldClock: count, laserCharge: within(0, most((c) => c.slots.laser.chargeUnits)), laserHold: count,
  fireHeld: flagBit, lock: room, magazine: within(0, most((c) => c.slots.missile.magazine)), magazineClock: count,
  shots: count, laserHits: count, layersStripped: count, missilesLaunched: count, missileHits: count, missilesLost: count
});
// Built on first use: state.ts imports this file for cloneTactical, so its enums are read lazily.
const topRules = (): Readonly<Record<string, (v: number) => boolean>> => ({
  tick: count, seed: within(0, 0xffffffff), 'rng.s': within(0, 0xffffffff), outcome: within(Outcome.Running, Outcome.Draw),
  'hunter.mode': within(HunterMode.Hunt, HunterMode.Repair), 'hunter.room': room, 'hunter.timer': int, 'hunter.working': flagBit,
  'hunter.fireAt': (v) => Number.isInteger(v) && v >= -1, 'hunter.lastLaunch': int, 'hunter.trailHead': within(0, HUNTER_TRAIL_TICKS - 1), 'hunter.trail': any,
  // Sci-1 spec §6.2 (known is checked per value in validateTacticalValues).
  startTick: count, hostileAt: (v) => Number.isInteger(v) && v >= -1, 'scan.contact': within(-1, 1), 'scan.level': within(0, 2), 'scan.progress': count,
  'scan.rate': (v) => v === 0 || v === SCAN_RATE_OTHER || v === SCAN_RATE_SCIENCE, 'scan.by': count, designated: within(-1, 1), weakFreq: within(0, 2),
  'derelict.orbitR': (v) => Number.isInteger(v) && ((v >= DERELICT_NEAR_MIN && v <= DERELICT_NEAR_MAX) || (v >= DERELICT_FAR_MIN && v <= DERELICT_FAR_MAX)),
  'derelict.phase': within(0, HEADING_COUNT - 1), 'derelict.loot': within(0, 2), 'derelict.trapped': flagBit, 'derelict.salvage': count, 'derelict.salvaged': flagBit
});

/** Check tactical values (the space then the ship module's) against their field bounds and slot invariants without
 *  writing them anywhere: heading indices, integer counters, room levels 0..2, shields, the laser and the magazine
 *  against the largest class, the hunter's and the outcome's enums, the map's asteroid count and the slot count; an
 *  inactive ship slot holds only zeros; each missile pool entry: active 0 or 1, a free entry holds only zeros, a missile's
 *  owner is an active slot with no other missile in flight, its heading index and age. `shape` is any tactical state made
 *  from the same seed and slot count (only its map and slot count are read). Throws naming the first bad field; returns
 *  the offset after the values. */
export function validateTacticalValues(shape: TacticalState, values: ArrayLike<number>, offset = 0): number {
  let at = offset;
  const top = topRules(), slots = shape.ships.length, sys = systemsRules(slots), inactive = new Set<number>(), owners = new Set<number>();
  for (const m of TACTICAL_MODULES) for (const f of m.fields(shape)) {
    const slice = Array.from({ length: f.count }, (_, k) => values[at + k]!);
    const bad = (why: string): never => { throw new Error(`duel snapshot tactical ${f.name}: ${why} (${slice.slice(0, 8).join(', ')})`); };
    if (slice.some((v) => typeof v !== 'number' || !Number.isFinite(v))) bad('not finite');
    const ship = /^(ships|systems)\.(\d+)\.(.+)$/.exec(f.name), missile = /^missiles\.(\d+)\.(.+)$/.exec(f.name);
    if (f.name === 'map.asteroids.length') { if (slice[0] !== shape.map.asteroids.length) bad('does not match the map'); }
    else if (f.name === 'ships.length') { if (slice[0] !== slots) bad('does not match the slot count'); }
    else if (ship) {
      const i = Number(ship[2]), key = ship[3]!;
      if (ship[1] === 'ships' && key === 'active' && slice[0] === 0) inactive.add(i);
      if (inactive.has(i)) { if (slice.some((v) => v !== 0)) bad('an inactive slot holds values'); }
      else { const rule = ship[1] === 'ships' ? BODY_RULES[key] : sys[key]; if (rule && !slice.every(rule)) bad('out of range'); }
    } else if (missile) {
      const key = missile[2]!, active = values[at - (key === 'active' ? 0 : key === 'owner' ? 1 : 2)]!;
      if (key === 'active' && !flagBit(slice[0]!)) bad('active is not 0 or 1');
      if (active === 0 && slice.some((v) => v !== 0)) bad('a free entry holds values');
      if (active === 1 && key === 'owner') {
        const o = slice[0]!;
        if (!within(0, slots - 1)(o) || inactive.has(o)) bad('its owner is not an active ship slot');
        if (owners.has(o)) bad(`ship ${o} has two missiles in flight`);
        owners.add(o);
      }
      if (active === 1 && key === 'flight') { const [, , , , head, headAcc, age] = slice as number[]; if (!heading(head!) || !acc(headAcc!) || !count(age!)) bad('heading, headingAcc or age out of range'); }
    } else if (f.name === 'known') { if (!within(0, 2)(slice[0]!) || !within(0, 1)(slice[1]!)) bad('out of range'); }   // the enemy 0..2, the derelict 0..1
    else { const rule = top[f.name]; if (rule && !slice.every(rule)) bad('out of range'); }
    at += f.count;
  }
  return at;
}
