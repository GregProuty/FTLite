import type { SimState } from '../state';
import { StationKind } from '../stationKinds';
import { stationOutput } from '../stations';
import { HAZARD_DT, INJECT_FRAC, LS_SEATED_BONUS } from '../tuning';

/** Requested injection per room for the next oxygenStep (which clamps to free volume and skips breached rooms). Spec §6. */
export function lifeSupportInjection(state: SimState): void {
  const d = state.derived, V = d.volume, inj = state.injectionScratch;
  const ls = d.stationOfKind[StationKind.LifeSupport]!;
  const out = ls >= 0 ? stationOutput(state, ls) : 0;
  const bonus = ls >= 0 && state.stations.occupant[ls]! >= 0 ? 1 + LS_SEATED_BONUS : 1;
  for (let r = 0; r < V.length; r++) inj[r] = INJECT_FRAC * V[r]! * HAZARD_DT * out * bonus;
}
