// Engineering spike spec §10.2 (Amendment 2; §9.1's clamp stands), Task 8, isolated: the Helm throttle follows the
// Engines bars. When the cap falls (bars removed, damage, failure) the stored throttle drops to it the same tick; at 0
// bars a reverse becomes 0.
import { throttleCap } from '../tactical/bars';
import type { DuelState } from './state';

/** Lowers the stored throttle to the Engines cap; a reverse at 0 bars becomes 0. */
export function clampThrottle(d: DuelState): void {
  const cap = throttleCap(d.tactical.systems[0]);
  if (d.throttle > cap) d.throttle = cap;
  else if (d.throttle === -1 && cap === 0) d.throttle = 0;
}
