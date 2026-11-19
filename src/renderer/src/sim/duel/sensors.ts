// Engineering spike spec §10.4 (Amendment 2), Task 10, isolated: Sensors loses one slot of capacity for each hazard in
// its room (a fire, each active breach), back when the fire is out or the breach is patched.
import type { DuelState } from './state';

/** The hazards in the Sensors room now: 1 for a fire, plus 1 per active breach site there. 0 when it has no room. */
export function sensorsHazards(d: DuelState): number {
  const st = d.interior, room = d.systemRooms[3]!;
  if (room < 0) return 0;
  let n = st.rooms.fire[room]! > 0 ? 1 : 0;
  const sites = st.derived.siteRoom;
  for (let s = 0; s < sites.length; s++) if (sites[s] === room && st.breaches.active[s]) n++;
  return n;
}
