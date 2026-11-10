import type { SimState } from './state';
import { Position, Health, Life, LifeState } from './components';
import { roomAt } from './grid';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { DT, HEALTH_MAX, MEDBAY_HEAL, MEDBAY_SEATED_BONUS } from './tuning';

/** Conscious crew standing in the Medbay room heal while it is online; the operator raises the rate (spec §6). */
export function medbayStep(state: SimState): void {
  const d = state.derived, mb = d.stationOfKind[StationKind.Medbay]!;
  if (mb < 0 || !stationOnline(state, mb)) return;
  const rate = MEDBAY_HEAL * stationOutput(state, mb) * (state.stations.occupant[mb]! >= 0 ? 1 + MEDBAY_SEATED_BONUS : 1);
  const room = d.stationRoom[mb]!;
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] !== LifeState.Conscious) continue;
    if (roomAt(state, Position.x[eid]!, Position.y[eid]!) !== room) continue;
    Health.cur[eid] = Math.min(HEALTH_MAX, Health.cur[eid]! + rate * DT);
  }
}
