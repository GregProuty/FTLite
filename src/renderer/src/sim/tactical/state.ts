// Tactical state for the duel (spec §3 to §9). Ship 0 is the crew's, ship 1 the enemy's; they always update in that
// order. All Ship fields are flat scalars or arrays copied by cloneShip, so the flatten and the clone stay simple.
import { createRng, type RngState } from '../../../../shared/rng';
import { buildGrid, type BroadPhase } from './grid';
import { generateMap, type MapDef, type Spawn } from './map';
import { HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_TRAIL_TICKS, MAGAZINE, SHIELD_LAYERS, SHIP_HULL } from './tuning';

/** Tactical rooms (spec §5); the index into Ship.rooms. */
export const Room = { Weapons: 0, Shields: 1, Engines: 2 } as const;

export interface Ship {
  x: number; y: number; vx: number; vy: number;
  /** Heading index 0..255 and the fractional turn accumulator (spec §4). */
  heading: number; headingAcc: number;
  hull: number;
  /** Damage level 0..2 per Room. */
  rooms: [number, number, number];
  /** Tick from which contact with body id k may cost hull again: 0 planet, 1..n asteroid k−1, n+1 the other ship. */
  graceUntil: Int32Array;
  planetHits: number; asteroidHits: number; shipHits: number;
  /** Stabilise (spec §6): true while both axes were zero last tick; the skid captured at release and still to remove, and its side (±1). */
  released: boolean; skidBudget: number; skidSign: number;
  /** Shield layers 0..2 and the recharge clock in SHIELD_RECHARGE_UNITS (spec §5). */
  shields: number; shieldClock: number;
  /** Laser (spec §7a): charge 0..LASER_CHARGE_UNITS (full), ticks a full charge has been held, whether Fire is held, the locked enemy Room. */
  laserCharge: number; laserHold: number; fireHeld: boolean; lock: number;
  /** Missiles in the magazine and the regain clock in ticks (spec §7b). */
  magazine: number; magazineClock: number;
  /** Telemetry counters (spec §13). */
  shots: number; laserHits: number; layersStripped: number; missilesLaunched: number; missileHits: number; missilesLost: number;
}

/** A cruise missile in flight (spec §7b). At most one per ship, stored at its owner's index. */
export interface Missile { x: number; y: number; vx: number; vy: number; heading: number; headingAcc: number; age: number }

export const HunterMode = { Hunt: 0, Repair: 1 } as const;
/** The enemy's brain (spec §9). */
export interface Hunter {
  mode: number;
  /** Repair: the Room being repaired, ticks left in this phase, and whether the walk is over. */
  room: number; timer: number; working: boolean;
  /** Tick on which the jittered release is due, or −1 when none is scheduled. */
  fireAt: number;
  lastLaunch: number;
  /** Ring buffer of the crew ship's last HUNTER_TRAIL_TICKS positions (x, y pairs); trailHead is the oldest entry. */
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
  ships: [Ship, Ship];
  missiles: [Missile | null, Missile | null];
  hunter: Hunter;
  outcome: number;
  events: DuelEvent[];
}

/** Held axes for one ship: turn (+ clockwise) and thrust (+ forward). Nominally −1, 0 or 1; flyShip quantises them by sign (NaN counts as 0). */
export interface Axes { turn: number; thrust: number }
export const NO_AXES: Axes = { turn: 0, thrust: 0 };

/** Body id of the other ship in Ship.graceUntil. */
export function otherShipBody(map: MapDef): number { return map.asteroids.length + 1; }

function shipAt(s: Spawn, bodies: number): Ship {
  return {
    x: s.x, y: s.y, vx: s.vx, vy: s.vy, heading: s.heading, headingAcc: 0, hull: SHIP_HULL, rooms: [0, 0, 0], graceUntil: new Int32Array(bodies),
    planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0,
    shields: SHIELD_LAYERS, shieldClock: 0, laserCharge: 0, laserHold: 0, fireHeld: false, lock: Room.Shields, magazine: MAGAZINE, magazineClock: 0,
    shots: 0, laserHits: 0, layersStripped: 0, missilesLaunched: 0, missileHits: 0, missilesLost: 0
  };
}

function hunterFor(crew: Spawn): Hunter {
  const trail = new Float64Array(2 * HUNTER_TRAIL_TICKS);
  for (let k = 0; k < HUNTER_TRAIL_TICKS; k++) { trail[2 * k] = crew.x; trail[2 * k + 1] = crew.y; }
  return { mode: HunterMode.Hunt, room: 0, timer: 0, working: false, fireAt: -1, lastLaunch: -HUNTER_MISSILE_COOLDOWN_TICKS, trail, trailHead: 0 };
}

export function createTacticalState(seed: number): TacticalState {
  const rng = createRng(seed);
  const map = generateMap(rng);
  const bodies = map.asteroids.length + 2;
  return {
    tick: 0, seed, rng, map, grid: buildGrid(map.asteroids, map.rMap),
    ships: [shipAt(map.spawns[0], bodies), shipAt(map.spawns[1], bodies)],
    missiles: [null, null], hunter: hunterFor(map.spawns[0]), outcome: Outcome.Running, events: []
  };
}

/** Deep copy of the whole tactical state for snapshots, rollback and replay checks. The map and broad-phase grid are
 *  immutable after creation and are shared. Any new nested state must be copied here; the clone test guards it. */
export function cloneTactical(s: TacticalState): TacticalState {
  const h = s.hunter;
  return {
    ...s, rng: { s: s.rng.s },
    ships: [cloneShip(s.ships[0]), cloneShip(s.ships[1])],
    missiles: [s.missiles[0] ? { ...s.missiles[0] } : null, s.missiles[1] ? { ...s.missiles[1] } : null],
    hunter: { ...h, trail: new Float64Array(h.trail) },
    events: s.events.map((e) => ({ ...e }))
  };
}

/** Deep copy of a ship. Any new nested Ship state (arrays, typed arrays) must be copied here. */
export function cloneShip(s: Ship): Ship {
  return { ...s, rooms: [...s.rooms], graceUntil: new Int32Array(s.graceUntil) };
}
