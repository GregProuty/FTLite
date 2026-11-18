// The Hunter's hostility (hunter grace spec): each round opens with HUNTER_GRACE_TICKS of grace, in which the Hunter holds
// its position and its fire; it turns hostile when the grace runs out or as soon as the crew fires (a laser release or a
// missile launch this round). The step reads it before the Hunter thinks; the music follows it (calm until hostile).
import type { DuelState } from './state';
import { HUNTER_GRACE_TICKS } from './tuning';

/** Whether the Hunter is hostile now: the round's grace is over, or the crew has fired this round. The crew ship's
 *  counters start at 0 each round (the rematch builds a fresh tactical state), and the tactical tick starts at baseTick. */
export function hunterHostile(d: DuelState): boolean {
  const crew = d.tactical.systems[0]!;
  return d.tactical.tick - d.baseTick >= HUNTER_GRACE_TICKS || crew.shots > 0 || crew.missilesLaunched > 0;
}
