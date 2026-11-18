// The Helm's predicted path (spec §10b layer 7): the same flyShip the sim runs, on a copy, with the current axes held.
// Pure: never touches the state. It stops at the first planet or asteroid contact, which it does not resolve.
import { rockAt, rocksNear } from './rocks';
import { flyShip } from './physics';
import { classOf, cloneShip, Room, type Axes, type TacticalState } from './state';
import { DEFAULT_FLIGHT, type FlightTuning } from './tuning';

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
export function predictPath(state: TacticalState, shipIndex: number, axes: Axes, ticks: number, every: number, tuning: FlightTuning = DEFAULT_FLIGHT): PathPoint[] {
  const s = cloneShip(state.ships[shipIndex]!), stride = Math.max(1, Math.floor(every));
  const cls = classOf(state, shipIndex), engines = state.systems[shipIndex]!.rooms[Room.Engines];
  const out: PathPoint[] = [];
  for (let t = 1; t <= ticks; t++) {
    flyShip(s, axes, tuning, engines, cls);
    if (touchesSolid(state, s.x, s.y, cls.radius)) { out.push({ x: s.x, y: s.y }); break; }
    if (t % stride === 0) out.push({ x: s.x, y: s.y });
  }
  return out;
}
