// The Helm's predicted path (spec §10b layer 7): the same flyShip the sim runs, on a copy, with the current axes held.
// Pure: never touches the state. It stops at the first planet or asteroid contact, which it does not resolve.
import { queryGrid } from './grid';
import { flyShip } from './physics';
import type { Axes, Ship, TacticalState } from './state';
import { DEFAULT_FLIGHT, SHIP_RADIUS, type FlightTuning } from './tuning';

export interface PathPoint { x: number; y: number }

export function touchesSolid(state: TacticalState, x: number, y: number, r: number): boolean {
  const p = state.map.planet;
  const pd = r + p.r;
  if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < pd * pd) return true;
  for (const k of queryGrid(state.grid, x, y, r)) {
    const a = state.map.asteroids[k]!, d = r + a.r;
    if ((x - a.x) * (x - a.x) + (y - a.y) * (y - a.y) < d * d) return true;
  }
  return false;
}

/** Positions after every `every` ticks for `ticks` ticks, ending early (with that point) at the first solid contact. */
export function predictPath(state: TacticalState, shipIndex: number, axes: Axes, ticks: number, every: number, tuning: FlightTuning = DEFAULT_FLIGHT): PathPoint[] {
  const src = state.ships[shipIndex]!;
  const s: Ship = { ...src, rooms: [...src.rooms], graceUntil: src.graceUntil };   // flyShip never touches graceUntil
  const out: PathPoint[] = [];
  for (let t = 1; t <= ticks; t++) {
    flyShip(s, axes, tuning);
    if (touchesSolid(state, s.x, s.y, SHIP_RADIUS)) { out.push({ x: s.x, y: s.y }); break; }
    if (t % every === 0) out.push({ x: s.x, y: s.y });
  }
  return out;
}
