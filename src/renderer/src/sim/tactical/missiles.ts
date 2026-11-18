// Cruise missiles, drawn and named on screen as torpedoes (spec §7b and the missile rows of the §4 collision matrix;
// homing torpedo spec), in the missile pool: at most one in flight per ship, found by its owner (missileOf). A missile
// homes by itself on its owner's locked target ship while it thrusts, for its fuel time, then coasts unsteered until it
// expires; it has no drag. Gravity bends it. Missiles are flown and resolved in owner order (ship slot order), as before
// the pool, whatever pool entry they sit in.
import { hx, hy, wrapHeading } from './direction';
import { roomAtImpact, sideOf } from './geometry';
import { queryGrid } from './grid';
import { gravityAccel } from './physics';
import { classOf, emptyMissile, missileOf, placeMissile, type DuelEvent, type Missile, type TacticalState } from './state';
import { DT, MISSILE_CRUISE_SPEED, MISSILE_LEAD_CAP_S, MISSILE_MIN_CLOSING, R_MAP } from './tuning';

type EndCause = Extract<DuelEvent, { kind: 'missileEnd' }>['cause'];

export function launchMissile(state: TacticalState, i: number): void {
  const s = state.ships[i]!, sys = state.systems[i]!, def = classOf(state, i).slots.missile, h0 = hx(s.heading), h1 = hy(s.heading);
  placeMissile(state, i, {
    x: s.x + h0 * def.spawnOffset, y: s.y + h1 * def.spawnOffset,
    vx: s.vx + h0 * def.launchSpeed, vy: s.vy + h1 * def.launchSpeed,
    heading: s.heading, headingAcc: 0, age: 0
  });
  sys.magazine--; sys.missilesLaunched++;
}

function end(state: TacticalState, m: Missile, cause: EndCause, target = -1, room = -1): void {
  state.events.push({ kind: 'missileEnd', ship: m.owner, cause, target, room, x: m.x, y: m.y });
  if (cause !== 'ship') state.systems[m.owner]!.missilesLost++;
  Object.assign(m, emptyMissile());
}

/** sin of one heading step, from the table: a wanted thrust direction within one step of the nose needs no turn. */
const STEP_SIN = hx(1);

/**
 * The homing turn (homing torpedo spec §1), −1, 0 or +1, for missile m of ship i: velocity-correcting lead pursuit on
 * i's locked target ship. Time to go is distance over the closing speed (floored at MISSILE_MIN_CLOSING), capped at
 * MISSILE_LEAD_CAP_S; the aim point is the target's position plus its velocity times that; the desired velocity points
 * at the aim point at the missile's speed or the cruise speed, whichever is greater; the wanted thrust direction is the
 * desired velocity minus the current one. 0 when the target is gone (it flies straight) or the wanted direction is
 * within one heading step of the nose; a wanted direction dead astern turns clockwise. Only + − × ÷ and sqrt.
 */
export function homingTurn(state: TacticalState, i: number, m: Missile): number {
  const k = state.systems[i]!.target, t = state.ships[k];
  if (!t || !t.active || k === i) return 0;
  const dx = t.x - m.x, dy = t.y - m.y, dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return 0;
  const closing = ((m.vx - t.vx) * dx + (m.vy - t.vy) * dy) / dist;
  const tgo = Math.min(dist / Math.max(closing, MISSILE_MIN_CLOSING), MISSILE_LEAD_CAP_S);
  const ax = dx + t.vx * tgo, ay = dy + t.vy * tgo, al = Math.sqrt(ax * ax + ay * ay);
  if (al === 0) return 0;
  const speed = Math.max(Math.sqrt(m.vx * m.vx + m.vy * m.vy), MISSILE_CRUISE_SPEED);
  const ex = (ax / al) * speed - m.vx, ey = (ay / al) * speed - m.vy, el = Math.sqrt(ex * ex + ey * ey);
  if (el === 0) return 0;
  const dot = hx(m.heading) * ex + hy(m.heading) * ey, cross = hx(m.heading) * ey - hy(m.heading) * ex;
  if (dot > 0 && Math.abs(cross) < STEP_SIN * el) return 0;
  return sideOf(m.heading, ex, ey) || 1;
}

/** One tick of ship i's missile's flight: while it has fuel it turns by homingTurn and thrusts along its nose; then it
 *  coasts, unsteered. */
export function flyMissile(state: TacticalState, i: number): void {
  const m = missileOf(state, i);
  if (!m) return;
  const def = classOf(state, i).slots.missile;
  m.age++;
  const fuelled = m.age <= def.fuelTicks;
  if (fuelled) m.headingAcc += homingTurn(state, i, m) * def.turnStepsPerTick;
  while (m.headingAcc >= 1) { m.heading = wrapHeading(m.heading + 1); m.headingAcc -= 1; }
  while (m.headingAcc <= -1) { m.heading = wrapHeading(m.heading - 1); m.headingAcc += 1; }
  let [ax, ay] = gravityAccel(m.x, m.y);
  if (fuelled) { ax += hx(m.heading) * def.thrust; ay += hy(m.heading) * def.thrust; }
  m.vx += ax * DT; m.vy += ay * DT;
  m.x += m.vx * DT; m.y += m.vy * DT;
}

function touches(m: Missile, radius: number, x: number, y: number, r: number): boolean {
  const dx = m.x - x, dy = m.y - y, rr = radius + r;
  return dx * dx + dy * dy < rr * rr;
}

/** Land missile m on ship k: it strikes its owner's lock room (homing torpedo spec §2), but a self-hit strikes the room
 *  under the impact point, since a lock names a room on the target. Shields are bypassed (spec §7b, Q20). */
function land(state: TacticalState, m: Missile, k: number): void {
  const target = state.ships[k]!, sys = state.systems[k]!;
  const owner = state.systems[m.owner]!;   // the lock names a room on the owner's target; any other ship takes the impact room
  const room = (k === owner.target && k !== m.owner ? owner.lock : roomAtImpact(target, m.x, m.y)) as 0 | 1 | 2;
  if (sys.rooms[room] < 2) sys.rooms[room]++;
  sys.hull = Math.max(0, sys.hull - classOf(state, m.owner).slots.missile.hull);
  if (k !== m.owner) state.systems[m.owner]!.missileHits++;   // a self-hit is not a hit; the event's target tells them apart
  end(state, m, 'ship', k, room);
}

/** Missile contacts in spec §4 order, per missile in owner order: statics and the edge, then active ships by slot, then
 *  the other missiles in owner order. Then a missile that survived its life's last tick self-destructs (after that
 *  tick's move and contacts). */
export function resolveMissiles(state: TacticalState): void {
  const n = state.ships.length;
  for (let i = 0; i < n; i++) {
    const m = missileOf(state, i);
    if (!m) continue;
    const def = classOf(state, i).slots.missile, p = state.map.planet;
    if (touches(m, def.radius, p.x, p.y, p.r)) { end(state, m, 'planet'); continue; }
    if (queryGrid(state.grid, m.x, m.y, def.radius).some((k) => { const a = state.map.asteroids[k]!; return touches(m, def.radius, a.x, a.y, a.r); })) { end(state, m, 'asteroid'); continue; }
    if (m.x * m.x + m.y * m.y > R_MAP * R_MAP) { end(state, m, 'edge'); continue; }
    let landed = false;
    for (let k = 0; k < n && !landed; k++) {
      const s = state.ships[k]!;
      if (!s.active || (k === i && m.age <= def.armTicks)) continue;
      if (touches(m, def.radius, s.x, s.y, classOf(state, k).radius)) { land(state, m, k); landed = true; }
    }
    if (landed) continue;
    for (let k = 0; k < n; k++) {
      const o = k === i ? null : missileOf(state, k);
      if (o && touches(m, def.radius, o.x, o.y, classOf(state, k).slots.missile.radius)) { end(state, m, 'missile'); end(state, o, 'missile'); break; }
    }
  }
  for (let i = 0; i < n; i++) { const m = missileOf(state, i); if (m && m.age >= classOf(state, i).slots.missile.lifeTicks) end(state, m, 'expired'); }
}
