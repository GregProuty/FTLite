// Sci-1 test helpers (spec 2026-11-17-science-scans §4.1, §4.2, §4.4). makeHostile puts a tactical state in the world
// before Sci-1, for tests whose subject predates it: the enemy hostile from tick 0, the crew laser off the weak
// frequency (one layer a hit), and the derelict already salvaged. holding puts a state in the hold a round starts in
// (hostileAt -1; full shields, owner decision 2026-11-17).
import type { TacticalState } from '../../src/renderer/src/sim/tactical/state';

export function makeHostile(st: TacticalState): TacticalState {
  st.hostileAt = 0;
  st.systems[0].freq = (st.weakFreq + 1) % 3;
  st.derelict.salvaged = true; st.derelict.salvage = 0;
  return st;
}

export function holding(st: TacticalState): TacticalState {
  st.hostileAt = -1;
  return st;
}
