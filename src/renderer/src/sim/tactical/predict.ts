// The Helm's predicted path (spec §10b layer 7): the same flyShip the sim runs, on a copy, with the current axes held.
// Pure: never touches the state. It stops at the first planet or asteroid contact, which it does not resolve.
import { flyMissile } from './missiles';
import { rockAt, rocksNear } from './rocks';
import { flightFor, flyShip } from './physics';
import { classOf, cloneShip, missileOf, Room, type Axes, type TacticalState } from './state';
import { MISSILE_RADIUS, type FlightTuning } from './tuning';

export interface PathPoint { x: number; y: number }

export function touchesSolid(state: TacticalState, x: number, y: number, r: number): boolean {
  const p = state.map.planet;
  const pd = r + p.r;
  if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < pd * pd) return true;
  for (const k of rocksNear(state, x, y, r)) {
    const a = rockAt(state, k), d = r + a.r;
    if ((x - a.x) * (x - a.x) + (y - a.y) * (y - a.y) < d * d) return true;
  }
  return false;
}

/** Positions after every `every` ticks for `ticks` ticks, ending early (with that point) at the first solid contact. */
export function predictPath(state: TacticalState, shipIndex: number, axes: Axes, ticks: number, every: number, tuning?: FlightTuning): PathPoint[] {   // playtest2feedback §2: absent, flightFor
  return predictFlight(state, shipIndex, axes, ticks, every, tuning).points;
}

/** predictPath's points, and the first solid contact it stopped at (Feel-ii spec §1.2: its point and the tick after now,
 *  1-based), or null when the path ran its whole length. */
export function predictFlight(state: TacticalState, shipIndex: number, axes: Axes, ticks: number, every: number, tuning?: FlightTuning): { points: PathPoint[]; contact: (PathPoint & { tick: number }) | null } {
  const s = cloneShip(state.ships[shipIndex]!), stride = Math.max(1, Math.floor(every)), fly = tuning ?? flightFor(state, shipIndex);   // playtest2feedback §2
  const cls = classOf(state, shipIndex), engines = state.systems[shipIndex]!.rooms[Room.Engines];
  const points: PathPoint[] = [];
  for (let t = 1; t <= ticks; t++) {
    flyShip(s, axes, fly, engines, cls);
    if (touchesSolid(state, s.x, s.y, cls.radius)) { points.push({ x: s.x, y: s.y }); return { points, contact: { x: s.x, y: s.y, tick: t } }; }
    if (t % stride === 0) points.push({ x: s.x, y: s.y });
  }
  return { points, contact: null };
}

/** Feel-ii spec §1.6: ship i's torpedo in flight on a copy (flyMissile, the sim's own flight), a point every `every` ticks
 *  for `ticks` ticks, ending at the first solid contact. Empty when it has none in flight. Pure: the state is untouched. */
export function predictMissile(state: TacticalState, i: number, ticks: number, every: number): PathPoint[] {
  const copy: TacticalState = { ...state, missiles: state.missiles.map((m) => ({ ...m })) as TacticalState['missiles'] };
  const m = missileOf(copy, i), stride = Math.max(1, Math.floor(every)), out: PathPoint[] = [];
  if (!m) return out;
  for (let t = 1; t <= ticks; t++) {
    flyMissile(copy, i);
    if (touchesSolid(state, m.x, m.y, MISSILE_RADIUS)) { out.push({ x: m.x, y: m.y }); break; }
    if (t % stride === 0) out.push({ x: m.x, y: m.y });
  }
  return out;
}
