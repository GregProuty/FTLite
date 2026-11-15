// Contacts (spec §4 collision matrix, ship rows; missiles join in H-0b). Each ship meets the planet, then asteroids in
// ascending index, in ship order; then the two ships meet. Push out, bounce keeping RESTITUTION of the normal speed,
// and cost hull only once per CONTACT_GRACE_TICKS per pair.
import { queryGrid } from './grid';
import { otherShipBody, type Ship, type TacticalState } from './state';
import { ASTEROID_CONTACT_HULL, CONTACT_GRACE_TICKS, PLANET_CONTACT_HULL, RESTITUTION, SHIP_CONTACT_HULL, SHIP_RADIUS } from './tuning';

/** True when this contact cost hull (outside the pair's grace window). */
function hitStatic(state: TacticalState, s: Ship, cx: number, cy: number, cr: number, body: number, hull: number): boolean {
  const dx = s.x - cx, dy = s.y - cy, rr = SHIP_RADIUS + cr, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2), nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1;
  s.x = cx + nx * rr; s.y = cy + ny * rr;
  const vn = s.vx * nx + s.vy * ny;
  if (vn < 0) { s.vx -= (1 + RESTITUTION) * vn * nx; s.vy -= (1 + RESTITUTION) * vn * ny; }
  if (state.tick < s.graceUntil[body]!) return false;
  s.hull = Math.max(0, s.hull - hull);
  s.graceUntil[body] = state.tick + CONTACT_GRACE_TICKS;
  return true;
}

function shipShip(state: TacticalState): void {
  const [a, b] = state.ships, body = otherShipBody(state.map);
  const dx = b.x - a.x, dy = b.y - a.y, rr = 2 * SHIP_RADIUS, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  const d = Math.sqrt(d2), nx = d > 0 ? dx / d : 1, ny = d > 0 ? dy / d : 0, half = (rr - d) / 2;
  a.x -= nx * half; a.y -= ny * half; b.x += nx * half; b.y += ny * half;
  const an = a.vx * nx + a.vy * ny, bn = b.vx * nx + b.vy * ny;
  if (an - bn > 0) {   // closing: exchange the normal components, then keep RESTITUTION of each
    const an2 = RESTITUTION * bn, bn2 = RESTITUTION * an;
    a.vx += (an2 - an) * nx; a.vy += (an2 - an) * ny;
    b.vx += (bn2 - bn) * nx; b.vy += (bn2 - bn) * ny;
  }
  if (state.tick < a.graceUntil[body]!) return;
  for (const s of [a, b]) { s.hull = Math.max(0, s.hull - SHIP_CONTACT_HULL); s.graceUntil[body] = state.tick + CONTACT_GRACE_TICKS; s.shipHits++; }
}

/** One ship's static contacts (spec §4 order): the planet, then asteroids in ascending index. Exported for the
 *  single-ship flight step (H-1 spec §9). */
export function hitStatics(state: TacticalState, s: Ship): void {
  const { map, grid } = state;
  if (hitStatic(state, s, map.planet.x, map.planet.y, map.planet.r, 0, PLANET_CONTACT_HULL)) s.planetHits++;
  for (const k of queryGrid(grid, s.x, s.y, SHIP_RADIUS)) {
    const a = map.asteroids[k]!;
    if (hitStatic(state, s, a.x, a.y, a.r, k + 1, ASTEROID_CONTACT_HULL)) s.asteroidHits++;
  }
}

/** Spec §4 order, per body in ship order: its static contacts, then its moving contacts. Ship 0 meets the planet and
 *  asteroids, then ship 1 (the pair is resolved once, here); then ship 1 meets the planet and asteroids. */
export function resolveContacts(state: TacticalState): void {
  hitStatics(state, state.ships[0]);
  shipShip(state);
  hitStatics(state, state.ships[1]);
}
