import type { SimState } from './state';
import { Position, Health, Life, LifeState } from './components';
import { conditionRoomAt } from './grid';
import { standUp } from './stations';
import { DT, FIRE_DAMAGE, O2_DAMAGE, SUFFOCATE_FRAC, BLEEDOUT_TIME, BLEED_HAZARD_MULT, HEALTH_MAX, REVIVE_HEALTH_FRAC } from './tuning';

export const EndReason = { None: 0, Hull: 1, Crew: 2 } as const;

export function reviveCrew(state: SimState, eid: number): void {
  void state;
  Life.state[eid] = LifeState.Conscious;
  Health.cur[eid] = HEALTH_MAX * REVIVE_HEALTH_FRAC;
  Life.bleed[eid] = 0; Life.reviveProgress[eid] = 0; Life.reviverPid[eid] = -1;
}

export function consciousCount(state: SimState): number {
  let n = 0;
  for (let pid = 0; pid < state.playerCount; pid++) if (Life.state[state.crew[pid]!] === LifeState.Conscious) n++;
  return n;
}

/** Step 7: environmental damage, Downed/Dead transitions and the run-end check (spec §5 Crew lifecycle). */
export function crewSystem(state: SimState): void {
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] === LifeState.Dead) continue;
    const r = conditionRoomAt(state, Position.x[eid]!, Position.y[eid]!);
    const inFire = r >= 0 && state.rooms.fire[r]! > 0;
    const lowO2 = r >= 0 && state.rooms.o2[r]! / state.derived.volume[r]! < SUFFOCATE_FRAC;
    if (Life.state[eid] === LifeState.Conscious) {
      const dmg = (inFire ? FIRE_DAMAGE : 0) + (lowO2 ? O2_DAMAGE : 0);
      if (dmg > 0) Health.cur[eid] = Math.max(0, Health.cur[eid]! - dmg * DT);
      if (Health.cur[eid] === 0) {
        Life.state[eid] = LifeState.Downed; standUp(state, pid); Life.bleed[eid] = BLEEDOUT_TIME;
        Life.reviveProgress[eid] = 0; Life.reviverPid[eid] = -1;
      }
    } else {
      Life.bleed[eid] = Math.max(0, Life.bleed[eid]! - DT * (inFire || lowO2 ? BLEED_HAZARD_MULT : 1));
      if (Life.bleed[eid] === 0) { Life.state[eid] = LifeState.Dead; Life.reviveProgress[eid] = 0; Life.reviverPid[eid] = -1; }
    }
  }
  if (state.hull <= 0) { state.hull = 0; state.ended = 1; state.endReason = EndReason.Hull; }
  else if (state.playerCount > 0 && consciousCount(state) === 0) { state.ended = 1; state.endReason = EndReason.Crew; }
}
