import type { SimState } from '../sim/state';
import { Life, LifeState, Seated } from '../sim/components';
import { interactTarget, TargetKind } from '../sim/interact';
import { STATION_NAMES } from '../sim/stationKinds';
import { baseMax } from '../sim/power';
export interface CalloutText { text: string; icon: string | null; flash: number | null }
/** Presentation metadata for the closed contextual messages emitted by authority. */
export function calloutIcon(text: string): string | null {
  if (text === 'Help!') return 'icon.medical';
  if (text.startsWith('Power to ')) return 'icon.power';
  if (text === 'Fire here!') return 'icon.fire';
  if (text === 'Breach here!') return 'icon.breach';
  if (text === 'Repair here!') return 'icon.repair';
  return null;
}
const OVER_HERE: CalloutText = { text: 'Over here!', icon: null, flash: null };

/** What a press says for this player right now: downed, seated below full power, beside a fire, breach or failed station, else Over here!. */
export function calloutFor(state: SimState, pid: number): CalloutText {
  const eid = state.crew[pid]!;
  if (Life.state[eid] === LifeState.Downed) return { text: 'Help!', icon: 'icon.medical', flash: null };
  const seat = Seated.station[eid]!;
  if (seat >= 0) {
    const kind = state.derived.stationKind[seat]!;
    return state.stations.level[seat]! < baseMax(state, kind) ? { text: `Power to ${STATION_NAMES[kind]}!`, icon: 'icon.power', flash: kind } : OVER_HERE;
  }
  const t = interactTarget(state, pid);
  if (t.kind === TargetKind.Fire) return { text: 'Fire here!', icon: 'icon.fire', flash: null };
  if (t.kind === TargetKind.Breach) return { text: 'Breach here!', icon: 'icon.breach', flash: null };
  if (t.kind === TargetKind.Power) return { text: 'Repair here!', icon: 'icon.repair', flash: null };
  return OVER_HERE;
}
