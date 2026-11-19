// Contacts (spec §4 collision matrix, ship rows; missiles are resolved in missiles.ts). Each active ship, in slot order,
// meets the planet, then asteroids in ascending index, then every later active ship. Push out, bounce keeping
// RESTITUTION of the normal speed, and cost hull only once per CONTACT_GRACE_TICKS per pair.
import { breakRock, crushDamage, wearRock } from './rockBreak';
import { freeRock, isRail, markTouched, regridRock, restartClock, rockAlive, rockAt, rockMass, rocksNear, ROCK_STRIDE, rockX, rockY } from './rocks';
import { RAM_HULL_FREE, RAM_HULL_MAX, RAM_HULL_STEP, SHIP_MASS } from './rockTuning';
import { classOf, shipBody, type TacticalState } from './state';
import { ASTEROID_CONTACT_HULL, CONTACT_GRACE_TICKS, PLANET_CONTACT_HULL, RESTITUTION, SHIP_CONTACT_HULL } from './tuning';

/** True when this contact cost ship i hull (outside the pair's grace window). */
function hitStatic(state: TacticalState, i: number, cx: number, cy: number, cr: number, body: number, hull: number, bvx = 0, bvy = 0): boolean {
  const s = state.ships[i]!, sys = state.systems[i]!;
  const dx = s.x - cx, dy = s.y - cy, rr = classOf(state, i).radius + cr, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2), nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1;
  s.x = cx + nx * rr; s.y = cy + ny * rr;
  const vn = (s.vx - bvx) * nx + (s.vy - bvy) * ny;   // SPIKE: against a moving fragment, the speed relative to it
  if (vn < 0) { s.vx -= (1 + RESTITUTION) * vn * nx; s.vy -= (1 + RESTITUTION) * vn * ny; }
  if (state.tick < s.graceUntil[body]!) return false;
  sys.hull = Math.max(0, sys.hull - hull);
  s.graceUntil[body] = state.tick + CONTACT_GRACE_TICKS;
  return true;
}

/** Ships i and j (i < j) meet: pushed apart, normal speeds exchanged and damped, 1 hull each outside the pair's grace. */
function shipShip(state: TacticalState, i: number, j: number): void {
  const a = state.ships[i]!, b = state.ships[j]!, ab = shipBody(state.map, i, j), ba = shipBody(state.map, j, i);
  const dx = b.x - a.x, dy = b.y - a.y, rr = classOf(state, i).radius + classOf(state, j).radius, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  const d = Math.sqrt(d2), nx = d > 0 ? dx / d : 1, ny = d > 0 ? dy / d : 0, half = (rr - d) / 2;
  a.x -= nx * half; a.y -= ny * half; b.x += nx * half; b.y += ny * half;
  const an = a.vx * nx + a.vy * ny, bn = b.vx * nx + b.vy * ny;
  if (an - bn > 0) {   // closing: exchange the normal components, then keep RESTITUTION of each
    const an2 = RESTITUTION * bn, bn2 = RESTITUTION * an;
    a.vx += (an2 - an) * nx; a.vy += (an2 - an) * ny;
    b.vx += (bn2 - bn) * nx; b.vy += (bn2 - bn) * ny;
  }
  if (state.tick < a.graceUntil[ab]!) return;
  for (const [k, body] of [[i, ab], [j, ba]] as const) {
    const s = state.ships[k]!, sys = state.systems[k]!;
    sys.hull = Math.max(0, sys.hull - SHIP_CONTACT_HULL); s.graceUntil[body] = state.tick + CONTACT_GRACE_TICKS; s.shipHits++;
  }
}

/** Ship slot i's static contacts (spec §4 order): the planet, then the rocks at their accessor positions in ascending slot.
 *  Asteroids-iii §6.2, plan deviation 1: the flight view never frees or writes a rock, and a rail counts as still (its
 *  velocity is not used), as before; a Free rock keeps spike ii's relative bounce. Exported for the single-ship flight step
 *  (H-1 spec §9). */
export function hitStatics(state: TacticalState, i: number): void {
  const { map } = state, s = state.ships[i]!;
  if (hitStatic(state, i, map.planet.x, map.planet.y, map.planet.r, 0, PLANET_CONTACT_HULL)) s.planetHits++;
  const n = rocksNear(state, s.x, s.y, classOf(state, i).radius, staticsNear);
  for (let ii = 0; ii < n; ii++) {
    const k = staticsNear[ii]!, a = rockAt(state, k), still = isRail(a.kind);
    if (hitStatic(state, i, a.x, a.y, a.r, k + 1, ASTEROID_CONTACT_HULL, still ? 0 : a.vx, still ? 0 : a.vy)) s.asteroidHits++;
  }
}

const staticsNear: number[] = [], duelNear: number[] = [];   // rocksNear scratches, one per call site (neither loop body re-enters its own site)
/** Spike ii §5.1: a moving rock's hull cost for an impact vc · mk / (mk + ms). */
export function ramHull(impact: number): number { return Math.min(RAM_HULL_MAX, 1 + Math.floor(Math.max(0, impact - RAM_HULL_FREE) / RAM_HULL_STEP)); }

/**
 * Spike ii §5.1, asteroids-iii §6.2: ship i meets rock k in the duel. A Rail is freed first (at its rail position and
 * velocity); every rock is then a second body. Normal n from the rock to the ship, closing speed vc = (vk − vs) · n. The
 * overlap is shared by inverse mass, the impulse (1 + RESTITUTION) vc / (1/ms + 1/mk) when closing, hull by ramHull of the
 * impact vc · mk / (mk + ms). A ship contact is a push: the rock's clock restarts and it is touched. Outside the pair's
 * grace: the hull cost, then the rock's ram damage (the §3.3 formula with the ship as the other body; a fan break along −n).
 */
function shipRock(state: TacticalState, i: number, k: number): void {
  const s = state.ships[i]!, sys = state.systems[i]!, v = state.rocks, b = k * ROCK_STRIDE, radius = classOf(state, i).radius;
  const dx = s.x - rockX(state, k), dy = s.y - rockY(state, k), rr = radius + v[b + 5]!, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  freeRock(state, k); markTouched(state, k); restartClock(state, k);
  const d = Math.sqrt(d2), nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1, body = k + 1;
  const vc = (v[b + 3]! - s.vx) * nx + (v[b + 4]! - s.vy) * ny, mk = rockMass(v[b + 5]!);
  const is = 1 / SHIP_MASS, ik = 1 / mk, overlap = rr - d, ss = (overlap * is) / (is + ik), sk = (overlap * ik) / (is + ik);
  s.x += nx * ss; s.y += ny * ss; v[b + 1]! -= nx * sk; v[b + 2]! -= ny * sk;
  regridRock(state, k);
  if (vc > 0) {
    const j = ((1 + RESTITUTION) * vc) / (is + ik);
    s.vx += nx * j * is; s.vy += ny * j * is; v[b + 3]! -= nx * j * ik; v[b + 4]! -= ny * j * ik;
  }
  const hull = ramHull((vc * mk) / (mk + SHIP_MASS));
  if (state.tick < s.graceUntil[body]!) return;
  sys.hull = Math.max(0, sys.hull - hull);
  s.graceUntil[body] = state.tick + CONTACT_GRACE_TICKS;
  s.asteroidHits++;
  const dmg = crushDamage(vc, mk, SHIP_MASS);
  if (dmg <= 0) return;
  const broke = wearRock(state, k, dmg), a = rockAt(state, k);
  state.events.push({ kind: 'rock', what: 'bump', by: 'ram', rock: k, x: s.x - nx * radius, y: s.y - ny * radius, r: a.r, vx: a.vx, vy: a.vy, ship: i });
  if (broke) breakRock(state, k, -nx, -ny, 'ram', i, 'fan', [k]);
}

/** Spike ii §5.1: ship slot i's static contacts in the duel: the planet as today, then each rock of rocksNear (taken once,
 *  ascending), skipping slots born this tick or no longer alive. */
function duelStatics(state: TacticalState, i: number): void {
  const { map } = state, s = state.ships[i]!;
  if (hitStatic(state, i, map.planet.x, map.planet.y, map.planet.r, 0, PLANET_CONTACT_HULL)) s.planetHits++;
  const n = rocksNear(state, s.x, s.y, classOf(state, i).radius, duelNear);
  for (let ii = 0; ii < n; ii++) {
    const k = duelNear[ii]!;
    if (!rockAlive(state, k) || state.rockBorn[k] === 1) continue;
    shipRock(state, i, k);
  }
}

/** Spec §4 order, per active body in slot order: its static contacts, then its contacts with every later active ship.
 *  `rocks` (spike ii §5.1, the duel): rocks are bodies (duelStatics); without it (stepFlight) today's hitStatics. */
export function resolveContacts(state: TacticalState, rocks = false): void {
  const n = state.ships.length;
  for (let i = 0; i < n; i++) {
    if (!state.ships[i]!.active) continue;
    if (rocks) duelStatics(state, i); else hitStatics(state, i);
    for (let j = i + 1; j < n; j++) if (state.ships[j]!.active) shipShip(state, i, j);
  }
}
