// Asteroids-iii stress rigs (tests and scripts/spike-asteroids-iii-measure.ts): the Hunter switched off as an inactive
// slot holds it, the crew parked on a circular orbit outward of a rock, and spike ii's stress driver (a rock-targeted
// torpedo every 10 s, the laser at the nearest rock whenever charged). Script-side writes, identical in twin runs.
import { circularVelocity } from '../../src/renderer/src/sim/tactical/rails';
import { rockAlive, rockAt, rockSlots, type RockView } from '../../src/renderer/src/sim/tactical/rocks';
import { classOf, missileOf, type TacticalState } from '../../src/renderer/src/sim/tactical/state';
import { IDLE_INPUT, laserFull, type ShipInput } from '../../src/renderer/src/sim/tactical/weapons';

/** Switch slot i off as an inactive slot holds it (zeros): it neither thinks nor collides, and validation accepts it. */
export function switchOff(st: TacticalState, i: number): void {
  const ship = st.ships[i]!, sys = st.systems[i]! as unknown as Record<string, unknown>;
  Object.assign(ship, { active: false, x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0 });
  ship.graceUntil.fill(0);
  for (const key of Object.keys(sys)) sys[key] = Array.isArray(sys[key]) ? (sys[key] as number[]).map(() => 0) : typeof sys[key] === 'boolean' ? false : 0;
}
/** The heading index (0 north, 64 east) nearest the bearing from (x, y) to (tx, ty). Test-side trigonometry. */
export const headingTo = (x: number, y: number, tx: number, ty: number): number => ((Math.round((Math.atan2(tx - x, -(ty - y)) / (2 * Math.PI)) * 256) % 256) + 256) % 256;
/** Park ship 0 `gap` u outward of rock k (away from the planet) on a circular orbit there, facing the rock. */
export function parkCoOrbit(st: TacticalState, k: number, gap = 300): void {
  const a = rockAt(st, k), d = Math.hypot(a.x, a.y), x = a.x + (a.x / d) * gap, y = a.y + (a.y / d) * gap, [vx, vy] = circularVelocity(x, y);
  Object.assign(st.ships[0], { x, y, vx, vy, heading: headingTo(x, y, a.x, a.y), headingAcc: 0 });
}
/** The live rock with the least `dist`, at most `within` (−1 when none). */
export function nearestRock(st: TacticalState, dist: (a: RockView) => number, within: number): number {
  let best = -1, bd = Infinity;
  for (let k = 0; k < rockSlots(st); k++) { if (!rockAlive(st, k)) continue; const d = dist(rockAt(st, k)); if (d <= within && d < bd) { best = k; bd = d; } }
  return best;
}
/** The largest live rock among the belt's slots (−1 when none). */
export function biggestBelt(st: TacticalState): number {
  let best = -1;
  for (let k = 0; k < st.map.beltCount; k++) if (rockAlive(st, k) && (best < 0 || rockAt(st, k).r > rockAt(st, best).r)) best = k;
  return best;
}
/** The stress driver's crew input this tick: every 10 s a rock-targeted torpedo (the magazine topped up; parked
 *  co-orbiting outward of the biggest belt rock when nothing is in range), the hull kept full, and the laser turned onto
 *  the nearest rock whenever it is charged and has no rock target. */
export function stressInput(st: TacticalState): ShipInput {
  const sys = st.systems[0]!, me = st.ships[0]!, input: ShipInput = { ...IDLE_INPUT, rockLock: { laser: null, torpedo: null } };
  sys.hull = classOf(st, 0).hull;
  if (st.tick % 600 === 0 && !missileOf(st, 0)) {
    sys.magazine = classOf(st, 0).slots.missile.magazine;
    let k = nearestRock(st, (a) => Math.hypot(a.x - me.x, a.y - me.y), classOf(st, 0).slots.missile.range);
    if (k < 0) { k = biggestBelt(st); if (k >= 0) parkCoOrbit(st, k); }
    if (k >= 0) input.rockLock.torpedo = k;
  }
  const laser = classOf(st, 0).slots.laser;
  if (laser && sys.laserBurst === 0 && laserFull(st, 0) && sys.laserRock < 0) {
    const k = nearestRock(st, (a) => Math.hypot(a.x - me.x, a.y - me.y) - a.r, laser.range);
    if (k >= 0) { const a = rockAt(st, k); me.heading = headingTo(me.x, me.y, a.x, a.y); me.headingAcc = 0; input.rockLock.laser = k; }
  }
  return input;
}
