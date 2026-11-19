// The Helm's predicted path (spec §10b layer 7): the same flyShip the sim runs, on a copy, with the current axes held.
// Pure: never touches the state. Asteroids-iii 6.3: the path meets rocks where they will be at the same tick (rockAhead). It stops at the first planet or asteroid contact, which it does not resolve.
import { flyMissile } from './missiles';
import { railPos, type RailOut } from './rails';
import { moveFreeSlot, rockEdgeSlack } from './rockContacts';
import { isRail, rockAlive, rockAt, RockKind, rockPhase, rocksNear, rockSlots, ROCK_STRIDE, rockX, rockY } from './rocks';
import { ROCK_MAX_SPEED } from './rockTuning';
import { flightFor, flyShip, shipEngineFactor } from './physics';
import { classOf, cloneShip, missileOf, Room, type Axes, type TacticalState } from './state';
import { DT, MISSILE_RADIUS, R_MAP, type FlightTuning } from './tuning';

export interface PathPoint { x: number; y: number }
const scratchAhead: RailOut = { x: 0, y: 0, vx: 0, vy: 0 };
const solidNear: number[] = [];   // touchesSolid's rocksNear scratch

/** Asteroids-iii 6.3: rock k, n ticks after the phase tick: a rail on its rail (railPos), a Free rock in a straight line. */
export function rockAhead(state: TacticalState, k: number, n: number, out: RailOut): void {
  const v = state.rocks, b = k * ROCK_STRIDE;
  if (isRail(v[b]!)) { railPos(v[b + 1]!, v[b + 2]!, v[b + 3]!, v[b + 4]!, v[b + 7]!, rockPhase(state) + n, v[b] === RockKind.Tumble, out); return; }
  out.x = v[b + 1]! + v[b + 3]! * n * DT; out.y = v[b + 2]! + v[b + 4]! * n * DT; out.vx = v[b + 3]!; out.vy = v[b + 4]!;
}

/** Whether a circle of radius r at (x, y) touches the planet or a rock, the rocks taken `ahead` ticks from now (6.3);
 *  ahead 0 is the rocks as they stand. A rock farther than its speed can carry it in `ahead` ticks is skipped. */
export function touchesSolid(state: TacticalState, x: number, y: number, r: number, ahead = 0): boolean {
  const p = state.map.planet, pd = r + p.r;
  if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < pd * pd) return true;
  if (ahead === 0) {
    const n = rocksNear(state, x, y, r, solidNear);
    for (let i = 0; i < n; i++) {
      const a = rockAt(state, solidNear[i]!), d = r + a.r;
      if ((x - a.x) * (x - a.x) + (y - a.y) * (y - a.y) < d * d) return true;
    }
    return false;
  }
  const span = ahead * DT;
  for (let k = 0, n = rockSlots(state); k < n; k++) {
    if (!rockAlive(state, k)) continue;
    const rk = state.rocks[k * ROCK_STRIDE + 5]!, dx = rockX(state, k) - x, dy = rockY(state, k) - y;
    const reach = rk + r + ROCK_MAX_SPEED * span + 1;   // no rock outruns ROCK_MAX_SPEED: a cheap, safe skip
    if (dx * dx + dy * dy > reach * reach) continue;
    rockAhead(state, k, ahead, scratchAhead);
    const ex = scratchAhead.x - x, ey = scratchAhead.y - y, d = rk + r;
    if (ex * ex + ey * ey < d * d) return true;
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
  const cls = classOf(state, shipIndex), engines = state.systems[shipIndex]!.rooms[Room.Engines], factor = shipEngineFactor(state, shipIndex);   // Task 8
  const points: PathPoint[] = [];
  for (let t = 1; t <= ticks; t++) {
    flyShip(s, axes, fly, engines, cls, factor);
    if (touchesSolid(state, s.x, s.y, cls.radius, t)) { points.push({ x: s.x, y: s.y }); return { points, contact: { x: s.x, y: s.y, tick: t } }; }
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
    if (touchesSolid(state, m.x, m.y, MISSILE_RADIUS, t)) { out.push({ x: m.x, y: m.y }); break; }
    if (t % stride === 0) out.push({ x: m.x, y: m.y });
  }
  return out;
}

/** Asteroids-iii 7.2: rock k's next `ticks` ticks, a point every `every`, contacts ignored: a rail on its rail, a Free
 *  rock by the sim's own free motion on a copy (moveFreeSlot, the phase tick advancing). Empty for a gone slot. Pure. */
export function predictRock(state: TacticalState, k: number, ticks: number, every: number): PathPoint[] {
  const out: PathPoint[] = [], b = k * ROCK_STRIDE, stride = Math.max(1, Math.floor(every)), T = rockPhase(state);
  if (!rockAlive(state, k)) return out;
  if (isRail(state.rocks[b]!)) {
    for (let t = stride; t <= ticks; t += stride) { rockAhead(state, k, t, scratchAhead); out.push({ x: scratchAhead.x, y: scratchAhead.y }); }
    return out;
  }
  const v = Float64Array.from(state.rocks.subarray(b, b + ROCK_STRIDE)), far = R_MAP + rockEdgeSlack();
  for (let t = 1; t <= ticks; t++) {
    moveFreeSlot(v, 0, T + t);
    if (v[1]! * v[1]! + v[2]! * v[2]! > far * far) break;
    if (t % stride === 0) out.push({ x: v[1]!, y: v[2]! });
  }
  return out;
}
