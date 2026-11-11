import type { SimState } from './state';
import { Life, LifeState } from './components';
import { StationKind } from './stationKinds';
import { stationOnline } from './stations';
import { isProductive } from './productive';
import { STATION_SKILL, addXp } from './skills';
import { DT, XP_RATE } from './tuning';

/** Step 2b: continuous XP for every online station with a Conscious seated operator that is productive right now. Weapons and Life Support earn at their events instead (spec 3-i section 5). */
export function xpSystem(state: SimState): void {
  const d = state.derived;
  for (let i = 0; i < state.stations.level.length; i++) {
    const kind = d.stationKind[i]!;
    if (kind === StationKind.Weapons || kind === StationKind.LifeSupport) continue;
    const pid = state.stations.occupant[i]!;
    if (pid < 0 || !stationOnline(state, i) || Life.state[state.crew[pid]!] !== LifeState.Conscious) continue;
    if (isProductive(state, i)) addXp(state, pid, STATION_SKILL[kind]!, XP_RATE * DT);
  }
}
