import type { SimState } from './state';
import { Life, LifeState, Seated } from './components';
import { stationOnline } from './stations';

/** Indices into telemetry.repairs (spec 4-ii section 5). */
export const REPAIR_FIRE = 0, REPAIR_BREACH = 1, REPAIR_POWER = 2;

/** Last system in step(), after crewSystem and before tick++: final-state samples of manning and activity, and the life-state edges (spec 4-ii section 5). */
export function telemetrySystem(state: SimState): void {
  const t = state.telemetry, st = state.stations, d = state.derived;
  for (let i = 0; i < st.occupant.length; i++) if (st.occupant[i]! >= 0 && stationOnline(state, i)) t.mannedTicks[d.stationKind[i]!]!++;
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!, seat = Seated.station[eid]!;
    const active = (seat >= 0 && stationOnline(state, seat)) || state.scratch.activeThisTick[pid] === 1;
    if (active) t.idleRun[pid] = 0;
    else { t.idleRun[pid]!++; if (t.idleRun[pid]! > t.longestIdle[pid]!) t.longestIdle[pid] = t.idleRun[pid]!; }
    const life = Life.state[eid]!, prev = t.prevLife[pid]!;
    // Leaving Conscious is the "down" edge (a Conscious -> Dead jump in one tick sets both); reaching Dead is the "death" edge.
    if (prev === LifeState.Conscious && life !== LifeState.Conscious && t.firstDownTick < 0) { t.firstDownTick = state.tick; t.firstDownPid = pid; }
    if (prev !== LifeState.Dead && life === LifeState.Dead && t.firstDeathTick < 0) { t.firstDeathTick = state.tick; t.firstDeathPid = pid; }
    t.prevLife[pid] = life;
  }
}
