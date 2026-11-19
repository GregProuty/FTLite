// Engineering spike spec §10.4 (Task 10): a contact is seen (locked, designated, scanned) only within the crew's sensor
// range, 900 at the round's 1 Sensors bar, and the ships spawn about 4000 apart. holdInSight puts both contacts in sight
// for the tests written before the spike, which scan or lock at once.
import { derelictPos } from '../../src/renderer/src/sim/tactical/science';
import type { TacticalState } from '../../src/renderer/src/sim/tactical/state';

/** Hold the crew ship 100 out from the wreck and the enemy 800 out (700 from the crew: seen, past LASER_RANGE 450 and
 *  MISSILE_RANGE 360, so neither ship can hit the other), both still. Call it before each step that must keep them seen. */
export function holdInSight(t: TacticalState): void {
  const p = derelictPos(t), r = Math.sqrt(p.x * p.x + p.y * p.y), ux = p.x / r, uy = p.y / r, a = t.ships[0]!, b = t.ships[1]!;
  a.x = p.x + ux * 100; a.y = p.y + uy * 100; b.x = p.x + ux * 800; b.y = p.y + uy * 800;
  a.vx = a.vy = b.vx = b.vy = 0;
}

/** Hold the enemy `dist` east of the crew ship, still: seen at the start's range (900) and, at the default 700, past
 *  LASER_RANGE and MISSILE_RANGE. For tests that place the crew ship themselves. */
export function enemySeen(t: TacticalState, dist = 700): void {
  const a = t.ships[0]!, b = t.ships[1]!;
  b.x = a.x + dist; b.y = a.y; b.vx = b.vy = 0;
}
