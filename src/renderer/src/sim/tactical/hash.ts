// Canonical flatten and hash of the tactical state (spec §4: same seed and inputs give the same hash), declared as three
// sim modules over the one TacticalState (engine refactor spec §5 and §6, R-2; Sci-1 spec §6.2): `space` (the slots'
// bodies, the missile pool, the hunter, the outcome), `ship` (each slot's systems record) and `science` (hostility, the
// scans, the designation, the weak frequency, the derelict). Flatten, unflatten, clone, validation and the
// completeness test all come from their field lists; flattenTactical is space, ship, science, the duel's order. The map is a
// pure function of the seed, so only its asteroid count is flattened; the slot count is flattened the same way. Per-tick
// events are outputs, reset every tick, and not hashed. −0 is written as 0.
import { hashF64 } from '../../../../shared/hash';
import { flag, flattenModule, moduleLength, scalar, unflattenModule, vector, type ModuleField, type SimModule } from '../module';
import { DUEL_SYSTEM_COUNT, SYSTEM_SLOTS, WEAPON_BAR_MAX, WEAPON_SLOTS } from './bars';
import { pewFullCharge, SHIP_CLASSES, type ShipClassDef } from './defs';
import { AIM_STEPS, DERELICT_FAR_MAX, DERELICT_FAR_MIN, DERELICT_NEAR_MAX, DERELICT_NEAR_MIN, GUN_POOL, HEADING_COUNT, HUNTER_PEW_GAP, HUNTER_TRAIL_TICKS, PEW_POOL, SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from './tuning';
import { rockCapacity, ROCK_RESERVE, ROCK_STRIDE } from './rocks';
import { CREW_SLOT, emptyMissile, emptyRound, HunterMode, Outcome, type GunRound, type Missile, type MissileFlight, type Ship, type ShipSystems, type TacticalState } from './state';

/** Values per missile pool entry: active, owner, then the flight x, y, vx, vy, heading, headingAcc, age, then (W-3) the
 *  manual flag (zeros when free). */
export const MISSILE_SLOT = 10;

/** A ship body's scalar fields in canonical order after `active`; `graceUntil` closes the body. */
const BODY = ['x', 'y', 'vx', 'vy', 'heading', 'headingAcc', 'planetHits', 'asteroidHits', 'shipHits', 'released', 'skidBudget', 'skidSign'] as const satisfies readonly (keyof Ship)[];
/** A systems record's scalar fields in canonical order; `rooms` comes after `hull`. */
const SYSTEMS_HEAD = ['cls', 'target', 'hull'] as const satisfies readonly (keyof ShipSystems)[];
const SYSTEMS_TAIL = ['shields', 'shieldClock', 'laserCharge', 'laserHold', 'fireHeld', 'lock', 'freq', 'laserTargeted', 'torpLock', 'torpRoom', 'laserBurst', 'laserBurstClock', 'magazine', 'magazineClock',
  'shots', 'laserHits', 'layersStripped', 'missilesLaunched', 'missileHits', 'missilesLost', 'laserRock', 'torpRock', 'torpRockFlying', 'rocksBroken',   // the rock targets, spike ii §8
  'gunHeat', 'gunLocked', 'gunCooldown', 'gunMuzzle', 'gunWear', 'gunHull', 'gunShots', 'gunHits', 'pewCharge', 'pewShots', 'pewHits', 'laserManual', 'laserAim', 'torpManual'] as const satisfies readonly (keyof ShipSystems)[];   // the gun's, Valkyrn spec §7.3; the pew's, W-1; the laser mode and burst aim, W-2; the torpedo mode, W-3; gunRoomWear closes the record
const FLAGS = new Set<string>(['released', 'fireHeld', 'laserTargeted', 'gunLocked', 'laserManual', 'torpManual']);
export const MISSILE_KEYS = ['x', 'y', 'vx', 'vy', 'heading', 'headingAcc', 'age'] as const satisfies readonly (keyof MissileFlight)[];
/** Compile-time completeness: a `Missile` member missing from these keys makes this `never` assignment fail typecheck. */
type MissingMissileKeys = Exclude<keyof Missile, (typeof MISSILE_KEYS)[number] | 'active' | 'owner' | 'manual'>;   // W-3: manual is its own bit
const missileKeysComplete: MissingMissileKeys extends never ? true : never = true;
void missileKeysComplete;
/** Values per round pool entry: active, owner, then x, y, vx, vy, age (zeros when free); Valkyrn spec §7.3. */
export const ROUND_SLOT = 7;
export const ROUND_KEYS = ['x', 'y', 'vx', 'vy', 'age'] as const satisfies readonly (keyof GunRound)[];
/** Compile-time completeness: a `GunRound` member missing from these keys makes this `never` assignment fail typecheck. */
type MissingRoundKeys = Exclude<keyof GunRound, (typeof ROUND_KEYS)[number] | 'active' | 'owner'>;
const roundKeysComplete: MissingRoundKeys extends never ? true : never = true;
void roundKeysComplete;
const HUNTER_HEAD = ['mode', 'room', 'timer', 'working', 'fireAt', 'lastLaunch', 'trailHead', 'pewBurst', 'pewClock'] as const;

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
    },
    bit(`missiles.${k}.manual`, (s) => s.missiles[k]!.manual, (s, v) => { s.missiles[k]!.manual = v; })   // W-3 (pew pew spec §4): the mode copied at launch
  ];
}
/** Round pool entry k of `pool` (Valkyrn spec §7.3: the gun's `rounds`; W-1: the pew's `pew`): active, owner, then its
 *  flight; a free entry holds only zeros. */
function roundFields(pool: 'rounds' | 'pew', k: number): ModuleField<TacticalState>[] {
  return [
    bit(`${pool}.${k}.active`, (s) => s[pool][k]!.active, (s, v) => { s[pool][k]!.active = v; }),
    scalar(`${pool}.${k}.owner`, (s) => s[pool][k]!.owner, (s, v) => { s[pool][k]!.owner = v; }),
    {
      name: `${pool}.${k}.flight`, count: ROUND_KEYS.length,
      read(s, out) { const r = s[pool][k]!; for (const key of ROUND_KEYS) out.push(r[key]); },
      write(s, values, offset) {
        const r = s[pool][k]!;
        if (!r.active && (r.owner !== 0 || ROUND_KEYS.some((_, j) => values[offset + j] !== 0))) throw new Error(`${pool}.${k}: a free entry holds values`);
        ROUND_KEYS.forEach((key, j) => { r[key] = values[offset + j]!; });
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
    fields.push(vector(`ships.${i}.graceUntil`, asteroids + ROCK_RESERVE + slots, (s) => s.ships[i]!.graceUntil));
  }
  for (let k = 0; k < slots; k++) fields.push(...missileFields(k));
  for (let k = 0; k < GUN_POOL; k++) fields.push(...roundFields('rounds', k));   // Valkyrn spec §7.3: the round pool, after the missiles
  for (let k = 0; k < PEW_POOL; k++) fields.push(...roundFields('pew', k));      // W-1 (pew pew spec §4): the pew pool, after the gun's
  for (const key of HUNTER_HEAD) fields.push(key === 'working'
    ? flag('hunter.working', (s) => s.hunter.working, (s, v) => { s.hunter.working = v; })
    : scalar(`hunter.${key}`, (s) => s.hunter[key] as number, (s, v) => { (s.hunter as unknown as Record<string, number>)[key] = v; }));
  fields.push(vector('hunter.trail', 2 * HUNTER_TRAIL_TICKS, (s) => s.hunter.trail));
  // Spike ii (§8): the rock pool and its six counters, last in the space module.
  fields.push(vector('rocks', (asteroids + ROCK_RESERVE) * ROCK_STRIDE, (s) => s.rocks),
    ...(['rockHits', 'rockSplits', 'rockDust', 'rockBlasts', 'rockCollisions', 'rockEvictions'] as const).map((k) => scalar<TacticalState>(k, (s) => s[k], (s, v) => { s[k] = v; })));
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
    fields.push(vector(`systems.${i}.gunRoomWear`, 3, (s) => s.systems[i]!.gunRoomWear));   // Valkyrn spec §7.3
    fields.push(vector(`systems.${i}.bars`, DUEL_SYSTEM_COUNT, (s) => s.systems[i]!.bars));   // Engineering spike spec §2
    fields.push(vector(`systems.${i}.weaponPower`, WEAPON_SLOTS, (s) => s.systems[i]!.weaponPower));   // spec §10.3
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
    events: 'per-tick events for the views, cleared every tick',
    rockBorn: 'spike ii §3.1: slots written with a new piece this tick; cleared at the start and the end of every stepDuel tick',
    rockDone: 'spike ii §3.3: slots that had their contact turn this tick; cleared at the start and the end of every stepDuel tick'
  },
  commands: [],
  reasons: []
};
/** The `ship` module (engine refactor spec §6, R-2 stage): one systems record per ship slot, holding today's duel rules. */
export const shipModule: SimModule<TacticalState> = {
  id: 'ship',
  fields: (s) => shipFields(s.systems.length),
  notSnapshotted: {},
  commands: ['laserMode', 'torpMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire'],
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
  const values = new Float64Array(out.length);   // a plain loop, not Float64Array.from with a mapper (Perf-i spec §2.1)
  for (let k = 0; k < out.length; k++) { const v = out[k]!; values[k] = v === 0 ? 0 : v; }
  return values;
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
  const copy: TacticalState = { ...s, rng: { s: 0 }, rocks: new Float64Array(s.rocks.length),
    rockBorn: new Uint8Array(s.rockBorn.length), rockDone: new Uint8Array(s.rockDone.length),
    ships: s.ships.map((b) => ({ ...b, graceUntil: new Int32Array(b.graceUntil.length) })) as TacticalState['ships'],
    systems: s.systems.map((y) => ({ ...y, rooms: [0, 0, 0], gunRoomWear: [0, 0, 0], bars: [0, 0, 0, 0, 0], weaponPower: [0, 0, 0] })) as TacticalState['systems'],
    missiles: s.missiles.map(emptyMissile) as TacticalState['missiles'],
    rounds: s.rounds.map(emptyRound),
    pew: s.pew.map(emptyRound),
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
/** The largest value of `f` over the classes that have it (Valkyrn spec §6.1: a laser or gun slot may be null), 0 when none does. */
const most = (f: (c: ShipClassDef) => number | null | undefined): number => Math.max(0, ...SHIP_CLASSES.map(f).filter((v): v is number => typeof v === 'number'));
/** Each body field's per-value rule; every field must hold finite values (checked first). */
const BODY_RULES: Readonly<Record<string, (v: number) => boolean>> = {
  active: flagBit, heading, headingAcc: acc, skidBudget: (v) => Number.isFinite(v) && v >= 0, planetHits: count, asteroidHits: count, shipHits: count,
  released: flagBit, skidSign: within(-1, 1), graceUntil: int32
};
/** Each systems field's per-value rule, against the largest class (an inactive slot is checked for zeros separately). */
const systemsRules = (slots: number, rocks: number): Readonly<Record<string, (v: number) => boolean>> => ({
  cls: within(0, SHIP_CLASSES.length - 1), target: within(0, slots - 1), hull: (v) => v >= 0 && v <= most((c) => c.hull), rooms: room,
  shields: within(0, most((c) => c.shields.layers) + 1), freq: within(0, 2), shieldClock: count, laserCharge: within(0, most((c) => c.slots.laser?.chargeUnits)), laserHold: count,
  fireHeld: flagBit, lock: room, laserTargeted: flagBit, torpLock: within(-1, 2), torpRoom: within(-1, 2), laserBurst: within(0, most((c) => c.slots.laser?.shots) - 1), laserBurstClock: within(0, most((c) => c.slots.laser?.burstGapTicks)),
  magazine: within(0, most((c) => c.slots.missile.magazine)), magazineClock: count,
  shots: count, laserHits: count, layersStripped: count, missilesLaunched: count, missileHits: count, missilesLost: count,
  // Spike ii §6.1, §8: the rock targets name a pool slot (torpRockFlying also −2, its rock broke); the tally is a count.
  laserRock: within(-1, rocks - 1), torpRock: within(-1, rocks - 1), torpRockFlying: within(-2, rocks - 1), rocksBroken: count,
  // Valkyrn spec §7.3: heat 0..heatMax, cooldown 0..interval, muzzle 0..1, wear below each threshold, counts ≥ 0.
  gunHeat: within(0, most((c) => c.slots.gun?.heatMax)), gunLocked: flagBit, gunCooldown: within(0, most((c) => c.slots.gun?.intervalTicks)), gunMuzzle: within(0, 1),
  gunWear: within(0, most((c) => c.slots.gun?.hitsPerLayer) - 1), gunHull: within(0, most((c) => c.slots.gun?.hitsPerHull) - 1),
  gunRoomWear: within(0, most((c) => c.slots.gun?.hitsPerLevel) - 1), gunShots: count, gunHits: count,
  // W-1 (pew pew spec §4): the counters ≥ 0; the charge is checked against the slot's own class (pewChargeRule).
  pewShots: count, pewHits: count,
  // W-2 (pew pew spec §4): the mode a bit, the burst aim a fine aim or −1 (validateTacticalValues adds the crew-only and burst checks).
  laserManual: flagBit, laserAim: within(-1, AIM_STEPS - 1),
  // W-3 (pew pew spec §4): the torpedo mode a bit (validateTacticalValues adds the crew-only check).
  torpManual: flagBit,
  bars: within(0, Math.max(...SYSTEM_SLOTS)),   // Engineering spike spec §2, §10.1: 0..10 per system
  weaponPower: within(0, WEAPON_BAR_MAX + 1)   // spec §10.3
});
/** W-1 (pew pew spec §4; Task 6 review): a slot's pew charge, 0..its own class's full pew (0 for a class without one). */
const pewChargeRule = (cls: number): ((v: number) => boolean) => {
  const pew = SHIP_CLASSES[cls]?.slots.pew;
  return within(0, pew ? pewFullCharge(pew) : 0);
};
// Built on first use: state.ts imports this file for cloneTactical, so its enums are read lazily.
const topRules = (): Readonly<Record<string, (v: number) => boolean>> => ({
  rockHits: count, rockSplits: count, rockDust: count, rockBlasts: count, rockCollisions: count, rockEvictions: count,
  tick: count, seed: within(0, 0xffffffff), 'rng.s': within(0, 0xffffffff), outcome: within(Outcome.Running, Outcome.Draw),
  'hunter.mode': within(HunterMode.Hunt, HunterMode.Repair), 'hunter.room': room, 'hunter.timer': int, 'hunter.working': flagBit,
  'hunter.fireAt': (v) => Number.isInteger(v) && v >= -1, 'hunter.lastLaunch': int, 'hunter.trailHead': within(0, HUNTER_TRAIL_TICKS - 1), 'hunter.trail': any,
  'hunter.pewBurst': within(0, most((c) => c.slots.pew?.shots)), 'hunter.pewClock': within(0, HUNTER_PEW_GAP),   // W-1
  // Sci-1 spec §6.2 (known is checked per value in validateTacticalValues).
  startTick: count, hostileAt: (v) => Number.isInteger(v) && v >= -1, 'scan.contact': within(-1, 1), 'scan.level': within(0, 2), 'scan.progress': count,
  'scan.rate': (v) => v === 0 || v === SCAN_RATE_OTHER || v === SCAN_RATE_SCIENCE, 'scan.by': count, designated: within(-1, 1), weakFreq: within(0, 2),
  'derelict.orbitR': (v) => Number.isInteger(v) && ((v >= DERELICT_NEAR_MIN && v <= DERELICT_NEAR_MAX) || (v >= DERELICT_FAR_MIN && v <= DERELICT_FAR_MAX)),
  'derelict.phase': within(0, HEADING_COUNT - 1), 'derelict.loot': within(0, 2), 'derelict.trapped': flagBit, 'derelict.salvage': count, 'derelict.salvaged': flagBit
});

/** A field name's slot parts, parsed once per name (Perf-i spec §2.4): validateTacticalValues reads them for every field
 *  of every publication, on the host and on each client. The names are a fixed set per map and slot count. */
interface FieldNameParts { ship: RegExpExecArray | null; missile: RegExpExecArray | null; round: RegExpExecArray | null }
const fieldParts = new Map<string, FieldNameParts>();
function fieldNameParts(name: string): FieldNameParts {
  let parts = fieldParts.get(name);
  if (!parts) {
    parts = { ship: /^(ships|systems)\.(\d+)\.(.+)$/.exec(name), missile: /^missiles\.(\d+)\.(.+)$/.exec(name), round: /^(rounds|pew)\.(\d+)\.(.+)$/.exec(name) };
    fieldParts.set(name, parts);
  }
  return parts;
}

/** Check tactical values (the space then the ship module's) against their field bounds and slot invariants without
 *  writing them anywhere: heading indices, integer counters, room levels 0..2, shields, the laser and the magazine
 *  against the largest class, the hunter's and the outcome's enums, the map's asteroid count and the slot count; an
 *  inactive ship slot holds only zeros; each missile pool entry: active 0 or 1, a free entry holds only zeros, a missile's
 *  owner is an active slot with no other missile in flight, its heading index and age. Each round pool entry likewise: active 0 or 1, a free entry holds only zeros, an owner that is an active slot, an age within the longest gun life (the gun's round pool and the pew's alike, W-1). W-2: only the crew slot's laser is MANUAL, and a slot's laserAim is −1 unless a burst shot is pending. W-3: only the crew slot's torpedo mode is MANUAL, and only the crew's torpedo is manual. `shape` is any tactical state made
 *  from the same seed and slot count (only its map and slot count are read). Throws naming the first bad field; returns
 *  the offset after the values. */
export function validateTacticalValues(shape: TacticalState, values: ArrayLike<number>, offset = 0): number {
  let at = offset;
  const top = topRules(), slots = shape.ships.length, sys = systemsRules(slots, rockCapacity(shape.map)), inactive = new Set<number>(), owners = new Set<number>(), clsOf = new Map<number, number>(), burstOf = new Map<number, number>();
  for (const m of TACTICAL_MODULES) for (const f of m.fields(shape)) {
    const slice = Array.from({ length: f.count }, (_, k) => values[at + k]!);
    const bad = (why: string): never => { throw new Error(`duel snapshot tactical ${f.name}: ${why} (${slice.slice(0, 8).join(', ')})`); };
    if (slice.some((v) => typeof v !== 'number' || !Number.isFinite(v))) bad('not finite');
    const { ship, missile, round } = fieldNameParts(f.name);
    if (f.name === 'map.asteroids.length') { if (slice[0] !== shape.map.asteroids.length) bad('does not match the map'); }
    else if (f.name === 'ships.length') { if (slice[0] !== slots) bad('does not match the slot count'); }
    else if (ship) {
      const i = Number(ship[2]), key = ship[3]!;
      if (ship[1] === 'ships' && key === 'active' && slice[0] === 0) inactive.add(i);
      if (inactive.has(i)) { if (slice.some((v) => v !== 0)) bad('an inactive slot holds values'); }
      else {
        const rule = ship[1] === 'ships' ? BODY_RULES[key] : key === 'pewCharge' ? pewChargeRule(clsOf.get(i) ?? -1) : sys[key];
        if (rule && !slice.every(rule)) bad('out of range');
        if (ship[1] === 'systems' && key === 'cls') clsOf.set(i, slice[0]!);   // validated above; read by pewCharge later in the record
        if (ship[1] === 'systems' && key === 'laserBurst') burstOf.set(i, slice[0]!);   // W-2: read by laserAim later in the record
        if (ship[1] === 'systems' && key === 'laserManual' && i !== CREW_SLOT && slice[0] !== 0) bad('only the crew laser has a manual mode');   // W-2: the Hunter is always AUTO
        if (ship[1] === 'systems' && key === 'laserAim' && i !== CREW_SLOT && slice[0] !== -1) bad('only the crew laser has a manual aim');   // W-2: the Hunter is always AUTO
        if (ship[1] === 'systems' && key === 'laserAim' && slice[0] !== -1 && (burstOf.get(i) ?? 0) === 0) bad('a manual aim with no burst pending');   // W-2: it waits only for a burst's next shot
        if (ship[1] === 'systems' && key === 'torpManual' && i !== CREW_SLOT && slice[0] !== 0) bad('only the crew torpedo has a manual mode');   // W-3: the Hunter is always AUTO
      }
    } else if (missile) {
      // W-3: the manual bit closes the entry, after the flight's MISSILE_KEYS.length values.
      const key = missile[2]!, active = values[at - (key === 'active' ? 0 : key === 'owner' ? 1 : key === 'flight' ? 2 : 2 + MISSILE_KEYS.length)]!;
      if (key === 'active' && !flagBit(slice[0]!)) bad('active is not 0 or 1');
      if (active === 0 && slice.some((v) => v !== 0)) bad('a free entry holds values');
      if (active === 1 && key === 'owner') {
        const o = slice[0]!;
        if (!within(0, slots - 1)(o) || inactive.has(o)) bad('its owner is not an active ship slot');
        if (owners.has(o)) bad(`ship ${o} has two missiles in flight`);
        owners.add(o);
      }
      if (active === 1 && key === 'manual') {   // W-3 (pew pew spec §3, §4): a bit, and only the crew flies a MANUAL torpedo
        if (!flagBit(slice[0]!)) bad('manual is not 0 or 1');
        if (slice[0] === 1 && values[at - 1 - MISSILE_KEYS.length] !== CREW_SLOT) bad('only the crew flies a manual torpedo');   // the entry's owner
      }
      if (active === 1 && key === 'flight') { const [, , , , head, headAcc, age] = slice as number[]; if (!heading(head!) || !acc(headAcc!) || !count(age!)) bad('heading, headingAcc or age out of range'); }
    } else if (round) {   // Valkyrn spec §7.3: a round's entry as a missile's, its age within the longest gun life; W-1: a pew round's within the longest pew life
      const key = round[3]!, active = values[at - (key === 'active' ? 0 : key === 'owner' ? 1 : 2)]!;
      if (key === 'active' && !flagBit(slice[0]!)) bad('active is not 0 or 1');
      if (active === 0 && slice.some((v) => v !== 0)) bad('a free entry holds values');
      if (active === 1 && key === 'owner' && (!within(0, slots - 1)(slice[0]!) || inactive.has(slice[0]!))) bad('its owner is not an active ship slot');
      if (active === 1 && key === 'flight' && !within(0, round[1] === 'pew' ? most((c) => c.slots.pew?.lifeTicks) : most((c) => c.slots.gun?.lifeTicks))(slice[4]!)) bad('age out of range');
    } else if (f.name === 'known') { if (!within(0, 2)(slice[0]!) || !within(0, 1)(slice[1]!)) bad('out of range'); }   // the enemy 0..2, the derelict 0..1
    else { const rule = top[f.name]; if (rule && !slice.every(rule)) bad('out of range'); }
    at += f.count;
  }
  return at;
}
