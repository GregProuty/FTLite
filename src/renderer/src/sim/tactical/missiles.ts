// Cruise missiles (spec §7b and the missile rows of the §4 collision matrix). At most one per ship, at its owner's index.
// A missile thrusts for its fuel time and coasts until it expires, attended or not; it has no drag. Gravity bends it.
import { hx, hy, wrapHeading } from './direction';
import { roomAtImpact } from './geometry';
import { queryGrid } from './grid';
import { gravityAccel } from './physics';
import type { DuelEvent, Missile, TacticalState } from './state';
import {
  DT, MISSILE_ARM_TICKS, MISSILE_FUEL_TICKS, MISSILE_HULL, MISSILE_LAUNCH_SPEED, MISSILE_LIFE_TICKS, MISSILE_RADIUS, MISSILE_SPAWN_OFFSET,
  MISSILE_THRUST, MISSILE_TURN_STEPS_PER_TICK, R_MAP, SHIP_RADIUS
} from './tuning';

type EndCause = Extract<DuelEvent, { kind: 'missileEnd' }>['cause'];

export function launchMissile(state: TacticalState, i: number): void {
  const s = state.ships[i]!, h0 = hx(s.heading), h1 = hy(s.heading);
  state.missiles[i] = {
    x: s.x + h0 * MISSILE_SPAWN_OFFSET, y: s.y + h1 * MISSILE_SPAWN_OFFSET,
    vx: s.vx + h0 * MISSILE_LAUNCH_SPEED, vy: s.vy + h1 * MISSILE_LAUNCH_SPEED,
    heading: s.heading, headingAcc: 0, age: 0
  };
  s.magazine--; s.missilesLaunched++;
}

function end(state: TacticalState, i: number, cause: EndCause): void {
  const m = state.missiles[i]!;
  state.events.push({ kind: 'missileEnd', ship: i, cause, x: m.x, y: m.y });
  if (cause !== 'ship') state.ships[i]!.missilesLost++;
  state.missiles[i] = null;
}

/** One tick of missile i's flight. `steer` is the gunner's turn axis (0 when the Weapons console is empty). */
export function flyMissile(state: TacticalState, i: number, steer: number): void {
  const m = state.missiles[i];
  if (!m) return;
  m.age++;
  m.headingAcc += (Math.sign(steer) || 0) * MISSILE_TURN_STEPS_PER_TICK;
  while (m.headingAcc >= 1) { m.heading = wrapHeading(m.heading + 1); m.headingAcc -= 1; }
  while (m.headingAcc <= -1) { m.heading = wrapHeading(m.heading - 1); m.headingAcc += 1; }
  let [ax, ay] = gravityAccel(m.x, m.y);
  if (m.age <= MISSILE_FUEL_TICKS) { ax += hx(m.heading) * MISSILE_THRUST; ay += hy(m.heading) * MISSILE_THRUST; }
  m.vx += ax * DT; m.vy += ay * DT;
  m.x += m.vx * DT; m.y += m.vy * DT;
}

function touches(m: Missile, x: number, y: number, r: number): boolean {
  const dx = m.x - x, dy = m.y - y, rr = MISSILE_RADIUS + r;
  return dx * dx + dy * dy < rr * rr;
}

/** Land missile i on ship k at its impact point: shields are bypassed (spec §7b, Q20). */
function land(state: TacticalState, i: number, k: number): void {
  const m = state.missiles[i]!, target = state.ships[k]!, room = roomAtImpact(target, m.x, m.y) as 0 | 1 | 2;
  if (target.rooms[room] < 2) target.rooms[room]++;
  target.hull = Math.max(0, target.hull - MISSILE_HULL);
  state.ships[i]!.missileHits++;
  end(state, i, 'ship');
}

/** Missile contacts in spec §4 order, per missile in owner order: statics and the edge, then ships by id, then the other
 *  missile. Then a missile that survived its MISSILE_LIFE_TICKS-th tick self-destructs (after that tick's move and contacts). */
export function resolveMissiles(state: TacticalState): void {
  for (let i = 0; i < 2; i++) {
    const m = state.missiles[i];
    if (!m) continue;
    const p = state.map.planet;
    if (touches(m, p.x, p.y, p.r)) { end(state, i, 'planet'); continue; }
    if (queryGrid(state.grid, m.x, m.y, MISSILE_RADIUS).some((k) => { const a = state.map.asteroids[k]!; return touches(m, a.x, a.y, a.r); })) { end(state, i, 'asteroid'); continue; }
    if (m.x * m.x + m.y * m.y > R_MAP * R_MAP) { end(state, i, 'edge'); continue; }
    let landed = false;
    for (let k = 0; k < 2 && !landed; k++) {
      if (k === i && m.age <= MISSILE_ARM_TICKS) continue;
      const s = state.ships[k]!;
      if (touches(m, s.x, s.y, SHIP_RADIUS)) { land(state, i, k); landed = true; }
    }
    if (landed) continue;
    const o = state.missiles[1 - i];
    if (o && touches(m, o.x, o.y, MISSILE_RADIUS)) { end(state, i, 'missile'); end(state, 1 - i, 'missile'); }
  }
  for (let i = 0; i < 2; i++) if (state.missiles[i] && state.missiles[i]!.age >= MISSILE_LIFE_TICKS) end(state, i, 'expired');
}
