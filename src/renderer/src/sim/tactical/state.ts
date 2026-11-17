// Tactical state (spec §3 to §9; engine refactor spec §5, R-2): N ship slots, each a body in space (`ships[i]`) and a
// systems record (`systems[i]`), a missile pool, the hunter's brain and the outcome. The duel fills two slots: the
// crew's Cutter in slot 0 and the hunter in slot 1; slots always update in slot order. A slot's weapons fire at its
// locked target (`systems[i].target`). All fields are flat scalars or arrays, so the flatten and the clone stay simple.
import { createRng, type RngState } from '../../../../shared/rng';
import { DUEL_CLASSES, SHIP_CLASSES, type ShipClassDef } from './defs';
import { buildGrid, type BroadPhase } from './grid';
import { generateMap, type MapDef, type Spawn } from './map';
import { cloneTacticalFromModule } from './hash';
import { HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_TRAIL_TICKS } from './tuning';

/** Tactical rooms (spec §5); the index into ShipSystems.rooms. */
export const Room = { Weapons: 0, Shields: 1, Engines: 2 } as const;

/** At least two ship slots: an encounter always has the crew's ship and one other (engine refactor spec §5). */
export type Slots<T> = [T, T, ...T[]];

/** A ship in space: kinematics, contact grace and the contact counters (engine refactor spec §5: the tactical layer keeps
 *  only kinematics plus a ship index, the slot). An inactive slot holds zeros. */
export interface Ship {
  active: boolean;
  x: number; y: number; vx: number; vy: number;
  /** Heading index 0..255 and the fractional turn accumulator (spec §4). */
  heading: number; headingAcc: number;
  /** Tick from which contact with body id k may cost hull again: 0 the planet, 1..n asteroid k − 1, then the other ship
   *  slots in slot order, skipping its own (shipBody). */
  graceUntil: Int32Array;
  planetHits: number; asteroidHits: number; shipHits: number;
  /** Stabilise (spec §6): true while both axes were zero last tick; the skid captured at release and still to remove, and its side (±1). */
  released: boolean; skidBudget: number; skidSign: number;
}

/** A ship's systems record (engine refactor spec §5, R-2): its class, its locked target, hull, room damage, shields, the
 *  laser, the magazine and the weapon counters. The duel's rules are unchanged: repair acts on `rooms`, and interior power
 *  is not coupled (R-2b links them). An inactive slot holds zeros. */
export interface ShipSystems {
  /** Index into SHIP_CLASSES. */
  cls: number;
  /** The ship slot its weapons fire at. */
  target: number;
  hull: number;
  /** Damage level 0..2 per Room. */
  rooms: [number, number, number];
  /** Shield layers and the recharge clock in the class's recharge units (spec §5). */
  shields: number; shieldClock: number;
  /** Laser (spec §7a): charge 0..chargeUnits (full), ticks a full charge has been held, whether Fire is held, the locked target Room. */
  laserCharge: number; laserHold: number; fireHeld: boolean; lock: number;
  /** Missiles in the magazine and the regain clock in ticks (spec §7b). */
  magazine: number; magazineClock: number;
  /** Telemetry counters (spec §13). */
  shots: number; laserHits: number; layersStripped: number; missilesLaunched: number; missileHits: number; missilesLost: number;
}

/** A cruise missile's flight (spec §7b). */
export interface MissileFlight { x: number; y: number; vx: number; vy: number; heading: number; headingAcc: number; age: number }
/** A missile pool entry: in flight or free, and the ship slot that launched it. At most one in flight per ship; a free
 *  entry holds zeros. */
export interface Missile extends MissileFlight { active: boolean; owner: number }

export const HunterMode = { Hunt: 0, Repair: 1 } as const;
/** The enemy's brain (spec §9). */
export interface Hunter {
  mode: number;
  /** Repair: the Room being repaired, ticks left in this phase, and whether the walk is over. */
  room: number; timer: number; working: boolean;
  /** Tick on which the jittered release is due, or −1 when none is scheduled. */
  fireAt: number;
  lastLaunch: number;
  /** Ring buffer of its target's last HUNTER_TRAIL_TICKS positions (x, y pairs); trailHead is the oldest entry. */
  trail: Float64Array; trailHead: number;
}

export const Outcome = { Running: 0, CrewWins: 1, EnemyWins: 2, Draw: 3 } as const;

/** Per-tick events for the views (shots and missile endings). Reset every tick and not hashed. */
export type DuelEvent =
  /** A laser release. `stripped`: it took a shield layer; `room`: the Room it struck (its level may already have been 2), or −1 (a miss or a stripped layer). */
  | { kind: 'laser'; ship: number; hit: boolean; stripped: boolean; room: number; x1: number; y1: number; x2: number; y2: number }
  /** A missile ended. `target`: the ship it landed on (its own ship for a self-hit), or −1; `room`: the Room it struck, or −1. */
  | { kind: 'missileEnd'; ship: number; cause: 'ship' | 'planet' | 'asteroid' | 'edge' | 'expired' | 'missile'; target: number; room: number; x: number; y: number };

export interface TacticalState {
  tick: number; seed: number; rng: RngState; map: MapDef; grid: BroadPhase;
  /** Each slot's body in space. */
  ships: Slots<Ship>;
  /** Each slot's systems record (the ship module's, sim/tactical/hash.ts). */
  systems: Slots<ShipSystems>;
  /** The missile pool: one entry per ship slot. */
  missiles: Slots<Missile>;
  hunter: Hunter;
  outcome: number;
  events: DuelEvent[];
}

/** Held axes for one ship: turn (+ clockwise) and thrust (+ forward). flyShip quantises the turn by sign and the thrust to quarters (NaN counts as 0; Artemis spec §5.3). */
export interface Axes { turn: number; thrust: number }
export const NO_AXES: Axes = { turn: 0, thrust: 0 };

/** The crew's ship slot. */
export const CREW_SLOT = 0;

/** Body id of ship slot k in ship i's graceUntil: after the planet and the asteroids, the other slots in slot order. */
export function shipBody(map: MapDef, i: number, k: number): number { return map.asteroids.length + 1 + (k < i ? k : k - 1); }

function shipAt(s: Spawn, bodies: number): Ship {
  return { active: true, x: s.x, y: s.y, vx: s.vx, vy: s.vy, heading: s.heading, headingAcc: 0, graceUntil: new Int32Array(bodies),
    planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0 };
}
function emptyShip(bodies: number): Ship {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, graceUntil: new Int32Array(bodies),
    planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0 };
}
function systemsFor(cls: number, target: number): ShipSystems {
  const c = SHIP_CLASSES[cls]!;
  return {
    cls, target, hull: c.hull, rooms: [0, 0, 0], shields: c.shields.layers, shieldClock: 0, laserCharge: 0, laserHold: 0, fireHeld: false, lock: Room.Shields,
    magazine: c.slots.missile.magazine, magazineClock: 0, shots: 0, laserHits: 0, layersStripped: 0, missilesLaunched: 0, missileHits: 0, missilesLost: 0
  };
}
function emptySystems(): ShipSystems {
  return { cls: 0, target: 0, hull: 0, rooms: [0, 0, 0], shields: 0, shieldClock: 0, laserCharge: 0, laserHold: 0, fireHeld: false, lock: 0,
    magazine: 0, magazineClock: 0, shots: 0, laserHits: 0, layersStripped: 0, missilesLaunched: 0, missileHits: 0, missilesLost: 0 };
}
/** A free missile pool entry. */
export function emptyMissile(): Missile { return { active: false, owner: 0, x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 }; }

function hunterFor(crew: Spawn): Hunter {
  const trail = new Float64Array(2 * HUNTER_TRAIL_TICKS);
  for (let k = 0; k < HUNTER_TRAIL_TICKS; k++) { trail[2 * k] = crew.x; trail[2 * k + 1] = crew.y; }
  return { mode: HunterMode.Hunt, room: 0, timer: 0, working: false, fireAt: -1, lastLaunch: -HUNTER_MISSILE_COOLDOWN_TICKS, trail, trailHead: 0 };
}

/** A fill of `slots` ship slots (at least 2): the duel's two at the map's spawns, the crew's Cutter in slot 0 locked on
 *  the hunter in slot 1 and back; any further slot is inactive (R-5's encounters fill them). */
export function createTacticalState(seed: number, slots = DUEL_CLASSES.length): TacticalState {
  if (!Number.isInteger(slots) || slots < 2) throw new Error(`a tactical state needs at least 2 ship slots, not ${slots}`);
  const rng = createRng(seed);
  const map = generateMap(rng);
  const bodies = map.asteroids.length + slots, extra = Array.from({ length: slots - 2 });
  return {
    tick: 0, seed, rng, map, grid: buildGrid(map.asteroids, map.rMap),
    ships: [shipAt(map.spawns[0], bodies), shipAt(map.spawns[1], bodies), ...extra.map(() => emptyShip(bodies))],
    systems: [systemsFor(DUEL_CLASSES[0]!, 1), systemsFor(DUEL_CLASSES[1]!, 0), ...extra.map(emptySystems)],
    missiles: [emptyMissile(), emptyMissile(), ...extra.map(emptyMissile)],
    hunter: hunterFor(map.spawns[0]), outcome: Outcome.Running, events: []
  };
}

/** Ship slot i's class. */
export function classOf(state: TacticalState, i: number): ShipClassDef { return SHIP_CLASSES[state.systems[i]!.cls]!; }
/** The ship slot ship i's weapons are locked on (engine refactor spec §5: weapons fire at the locked target). */
export function targetOf(state: TacticalState, i: number): number { return state.systems[i]!.target; }

/** Ship i's missile in flight, or null (at most one per ship). */
export function missileOf(state: TacticalState, i: number): Missile | null {
  for (const m of state.missiles) if (m.active && m.owner === i) return m;
  return null;
}
/** Put a missile in flight for ship i with these flight values: in the entry it already flies in, or the first free one
 *  (the launch, and tests). Returns it. */
export function placeMissile(state: TacticalState, i: number, f: MissileFlight): Missile {
  const m = missileOf(state, i) ?? state.missiles.find((e) => !e.active);
  if (!m) throw new Error(`no free missile pool entry for ship ${i}`);
  Object.assign(m, { active: true, owner: i, x: f.x, y: f.y, vx: f.vx, vy: f.vy, heading: f.heading, headingAcc: f.headingAcc, age: f.age });
  return m;
}
/** Free ship i's missile entry, with no event (a missile ending goes through the missile step). */
export function removeMissile(state: TacticalState, i: number): void {
  const m = missileOf(state, i);
  if (m) Object.assign(m, emptyMissile());
}

/** Deep copy of the whole tactical state for snapshots, rollback and replay checks, derived from the space and ship
 *  modules' fields (sim/tactical/hash.ts): a field the modules declare is copied without anything listed here. The map
 *  and broad-phase grid are immutable after creation and are shared. */
export function cloneTactical(s: TacticalState): TacticalState { return cloneTacticalFromModule(s); }

/** Deep copy of a ship's body. Any new nested Ship state (arrays, typed arrays) must be copied here. */
export function cloneShip(s: Ship): Ship {
  return { ...s, graceUntil: new Int32Array(s.graceUntil) };
}
