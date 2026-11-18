// Weapons update spec §2: a torpedo launches only at a target within MISSILE_RANGE (360). Tests whose subject predates the
// range launch at the duel's start, where the enemy is far off; inTorpedoRange puts the enemy 300 units dead astern of
// the crew, at rest, so a launch is allowed and the crew laser (forward arc) still has no shot.
import { hx, hy } from '../../src/renderer/src/sim/tactical/direction';
import type { TacticalState } from '../../src/renderer/src/sim/tactical/state';

export function inTorpedoRange(t: TacticalState, distance = 300): TacticalState {
  const s = t.ships[0], e = t.ships[t.systems[0].target]!;
  Object.assign(e, { x: s.x - hx(s.heading) * distance, y: s.y - hy(s.heading) * distance, vx: s.vx, vy: s.vy });
  return t;
}
