import type { SimState } from './state';
import { Life, LifeState } from './components';
import { StationKind } from './stationKinds';
import { stationOnline } from './stations';
import { isProductive } from './productive';
import { STATION_SKILL, addXp } from './skills';
import { DT, XP_RATE, SINCE_CAP } from './tuning';

/** Step 2b: continuous XP for every online station with a Conscious seated operator that is productive right now. Weapons and Life Support earn at their events instead (spec 3-i section 5). */
export function xpSystem(state: SimState): void {
  const d = state.derived, since = state.director.sinceProductive;
  for (let i = 0; i < state.stations.level.length; i++) {
    const kind = d.stationKind[i]!, pid = state.stations.occupant[i]!;
    const operating = pid >= 0 && stationOnline(state, i) && Life.state[state.crew[pid]!] === LifeState.Conscious;
    const productive = operating && isProductive(state, i);
    since[kind] = productive ? 0 : Math.min(SINCE_CAP, since[kind]! + 1);       // the director's idle counters share the XP observation point (spec 4-i section 7)
    if (!productive || kind === StationKind.Weapons || kind === StationKind.LifeSupport) continue;   // event-based XP for those two
    addXp(state, pid, STATION_SKILL[kind]!, XP_RATE * DT);
  }
}
