// Tactical state for the duel (spec §3 to §6). H-0a holds the map and two flying ships; weapons, shields, missiles and the
// hunter join in H-0b. Ship 0 is the crew's, ship 1 the enemy's; they always update in that order.
import { createRng, type RngState } from '../../../../shared/rng';
import { buildGrid, type BroadPhase } from './grid';
import { generateMap, type MapDef, type Spawn } from './map';
import { SHIP_HULL } from './tuning';

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
}

export interface TacticalState { tick: number; seed: number; rng: RngState; map: MapDef; grid: BroadPhase; ships: [Ship, Ship] }

/** Held axes for one ship: turn (+ clockwise) and thrust (+ forward). Nominally −1, 0 or 1; flyShip quantises them by sign (NaN counts as 0). */
export interface Axes { turn: number; thrust: number }
export const NO_AXES: Axes = { turn: 0, thrust: 0 };

/** Body id of the other ship in Ship.graceUntil. */
export function otherShipBody(map: MapDef): number { return map.asteroids.length + 1; }

function shipAt(s: Spawn, bodies: number): Ship {
  return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, heading: s.heading, headingAcc: 0, hull: SHIP_HULL, rooms: [0, 0, 0], graceUntil: new Int32Array(bodies), planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0 };
}

export function createTacticalState(seed: number): TacticalState {
  const rng = createRng(seed);
  const map = generateMap(rng);
  const bodies = map.asteroids.length + 2;
  return { tick: 0, seed, rng, map, grid: buildGrid(map.asteroids, map.rMap), ships: [shipAt(map.spawns[0], bodies), shipAt(map.spawns[1], bodies)] };
}

/** Deep copy of a ship. Any new nested Ship state (arrays, typed arrays) must be copied here. */
export function cloneShip(s: Ship): Ship {
  return { ...s, rooms: [...s.rooms], graceUntil: new Int32Array(s.graceUntil) };
}
