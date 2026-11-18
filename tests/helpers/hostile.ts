// Sci-1 test helpers (spec 2026-11-17-science-scans §4.1, §4.2, §4.4). makeHostile puts a tactical state in the world
// before Sci-1, for tests whose subject predates it: the enemy hostile from tick 0 (Hunt, full shields), the crew laser
// off the weak frequency (one layer a hit), and the derelict already salvaged. patrol puts a state in Patrol, as a round
// starts (one enemy shield layer down).
import { classOf, HunterMode, type TacticalState } from '../../src/renderer/src/sim/tactical/state';

export function makeHostile(st: TacticalState): TacticalState {
  st.hostileAt = 0; st.hunter.mode = HunterMode.Hunt;
  st.systems[1].shields = classOf(st, 1).shields.layers;
  st.systems[0].freq = (st.weakFreq + 1) % 3;
  st.derelict.salvaged = true; st.derelict.salvage = 0;
  return st;
}

export function patrol(st: TacticalState): TacticalState {
  st.hostileAt = -1; st.hunter.mode = HunterMode.Patrol;
  st.systems[1].shields = classOf(st, 1).shields.layers - 1; st.systems[1].shieldClock = 0;
  return st;
}
