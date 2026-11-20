// The Helm's predicted path (spec §10b layer 7): the same flyShip the sim runs, on a copy, with the current axes held.
// Pure: never touches the state. Asteroids-iii 6.3: the path meets rocks where they will be at the same tick (rockAhead). It stops at the first planet or asteroid contact, which it does not resolve.
import { flyMissile } from './missiles';
import { orbitRate, railPos, railPosFrom, railStepOut, SPIN_RATE, type Pair, type RailOut } from './rails';
import { moveFreeSlot, rockEdgeSlack } from './rockContacts';
import { isRail, rockAlive, rockAt, RockKind, rockPhase, rocksNear, rockSlots, ROCK_STRIDE, rockX, rockY } from './rocks';
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

/** §6.3: the live rocks read once per prediction call into a reused scratch (SNAP fields per rock), so no step scans the
 *  slots or calls the memo'd accessors: slot, current x, y, r; ρc, ρo (a rail's |centre| and |offset|, −1 for a Free rock);
 *  a speed bound; tumble; the rail's ω and step (c, s); the raw centre/offset/anchor (a Free rock: x, y, vx, vy). */
const SNAP = 16, F_SLOT = 0, F_X = 1, F_Y = 2, F_R = 3, F_RC = 4, F_RO = 5, F_SPEED = 6, F_TUMBLE = 7, F_W = 8, F_C = 9, F_S = 10, F_CX = 11, F_CY = 12, F_OX = 13, F_OY = 14, F_T = 15;
let snap = new Float64Array(SNAP * 64);
const stepPair: Pair = { c: 0, s: 0 };
function snapshotRocks(state: TacticalState): number {
  const v = state.rocks, m = rockSlots(state);
  if (snap.length < m * SNAP) snap = new Float64Array(m * SNAP);
  let n = 0;
  for (let k = 0; k < m; k++) {
    const b = k * ROCK_STRIDE, kind = v[b]!;
    if (kind === RockKind.Gone) continue;
    const j = n++ * SNAP;
    snap[j + F_SLOT] = k; snap[j + F_R] = v[b + 5]!; snap[j + F_TUMBLE] = kind === RockKind.Tumble ? 1 : 0;
    snap[j + F_CX] = v[b + 1]!; snap[j + F_CY] = v[b + 2]!; snap[j + F_OX] = v[b + 3]!; snap[j + F_OY] = v[b + 4]!; snap[j + F_T] = v[b + 7]!;
    if (isRail(kind)) {
      const rc = Math.sqrt(v[b + 1]! * v[b + 1]! + v[b + 2]! * v[b + 2]!), ro = Math.sqrt(v[b + 3]! * v[b + 3]! + v[b + 4]! * v[b + 4]!), w = orbitRate(rc);
      railStepOut(rc, stepPair);
      snap[j + F_X] = rockX(state, k); snap[j + F_Y] = rockY(state, k);
      snap[j + F_RC] = rc; snap[j + F_RO] = ro; snap[j + F_W] = w; snap[j + F_C] = stepPair.c; snap[j + F_S] = stepPair.s;
      // a bound, never the current speed (a Tumble's is not one): ω(ρc + ρo), or ω ρc + (ω + spin) ρo
      snap[j + F_SPEED] = kind === RockKind.Tumble ? w * rc + (w + SPIN_RATE) * ro : w * (rc + ro);
    } else {
      snap[j + F_X] = v[b + 1]!; snap[j + F_Y] = v[b + 2]!; snap[j + F_RC] = -1; snap[j + F_RO] = 0;
      snap[j + F_SPEED] = Math.sqrt(v[b + 3]! * v[b + 3]! + v[b + 4]! * v[b + 4]!);
    }
  }
  return n;
}
/** Whether a circle at (x, y), radius r, touches a snapshot rock `ahead` ticks on (a rail on its rail, a Free rock straight).
 *  A rail whose orbit annulus the circle's |p| misses, or a rock farther than its speed bound reaches, is skipped. */
function hitsSnapshot(state: TacticalState, n: number, x: number, y: number, r: number, ahead: number): boolean {
  const span = ahead * DT, rho = Math.sqrt(x * x + y * y), T = rockPhase(state) + ahead;
  for (let i = 0; i < n; i++) {
    const j = i * SNAP, d = snap[j + F_R]! + r, rc = snap[j + F_RC]!;
    if (rc >= 0 && Math.abs(rho - rc) > snap[j + F_RO]! + d + 1) continue;   // railPos keeps |centre| and |offset| fixed
    const dx = snap[j + F_X]! - x, dy = snap[j + F_Y]! - y, reach = d + snap[j + F_SPEED]! * span + 1;
    if (dx * dx + dy * dy > reach * reach) continue;
    let px: number, py: number;
    if (rc >= 0) {
      railPosFrom(snap[j + F_CX]!, snap[j + F_CY]!, snap[j + F_OX]!, snap[j + F_OY]!, T - snap[j + F_T]!, snap[j + F_TUMBLE] === 1, rc, snap[j + F_W]!, snap[j + F_C]!, snap[j + F_S]!, scratchAhead);
      px = scratchAhead.x; py = scratchAhead.y;
    } else { px = snap[j + F_CX]! + snap[j + F_OX]! * ahead * DT; py = snap[j + F_CY]! + snap[j + F_OY]! * ahead * DT; }
    const ex = px - x, ey = py - y;
    if (ex * ex + ey * ey < d * d) return true;
  }
  return false;
}

/** Whether a circle of radius r at (x, y) touches the planet or a rock, the rocks taken `ahead` ticks from now (§6.3);
 *  ahead 0 is the rocks as they stand. (A path calls hitsSnapshot with one snapshot for all its steps.) */
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
  return hitsSnapshot(state, snapshotRocks(state), x, y, r, ahead);
}

/** The planet test of touchesSolid, then the rocks of the snapshot taken once by the caller. */
function touchesAhead(state: TacticalState, n: number, x: number, y: number, r: number, ahead: number): boolean {
  const p = state.map.planet, pd = r + p.r;
  return (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < pd * pd || hitsSnapshot(state, n, x, y, r, ahead);
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
  const points: PathPoint[] = [], nRocks = snapshotRocks(state);
  for (let t = 1; t <= ticks; t++) {
    flyShip(s, axes, fly, engines, cls, factor);
    if (touchesAhead(state, nRocks, s.x, s.y, cls.radius, t)) { points.push({ x: s.x, y: s.y }); return { points, contact: { x: s.x, y: s.y, tick: t } }; }
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
  const nRocks = snapshotRocks(state);
  for (let t = 1; t <= ticks; t++) {
    flyMissile(copy, i);
    if (touchesAhead(state, nRocks, m.x, m.y, MISSILE_RADIUS, t)) { out.push({ x: m.x, y: m.y }); break; }
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
