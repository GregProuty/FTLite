import type { SimState } from '../state';
import { chance } from '../../../../shared/rng';
import { passageFor } from './oxygen';
import { HAZARD_DT, FIRE_GROW_FRAC, FIRE_SHRINK_FRAC, FIRE_GROW_RATE, FIRE_SHRINK_RATE, FIRE_CAP, FIRE_START, FIRE_SPREAD_P } from '../tuning';

export function igniteRoom(state: SimState, room: number): boolean {
  if (state.rooms.fire[room]! > 0) return false;
  state.rooms.fire[room] = FIRE_START;
  state.rooms.fireRepair[room] = 0;
  return true;
}

export function extinguishRoom(state: SimState, room: number): void {
  state.rooms.fire[room] = 0;
  state.rooms.fireRepair[room] = 0;
}

export function burningRoomCount(state: SimState): number {
  let n = 0; for (const f of state.rooms.fire) if (f > 0) n++; return n;
}

/** Growth/shrink by room oxygen, then one spread roll per burning edge side, in edge order (spec §5 Fire). */
export function fireStep(state: SimState): void {
  const d = state.derived, fire = state.rooms.fire, dt = HAZARD_DT;
  for (let r = 0; r < fire.length; r++) {
    if (fire[r]! <= 0) continue;
    const frac = state.rooms.o2[r]! / d.volume[r]!;
    if (frac > FIRE_GROW_FRAC) fire[r] = Math.min(FIRE_CAP, fire[r]! + FIRE_GROW_RATE * dt);
    else if (frac < FIRE_SHRINK_FRAC) fire[r] = Math.max(0, fire[r]! - FIRE_SHRINK_RATE * dt);
    if (fire[r] === 0) state.rooms.fireRepair[r] = 0;
  }
  for (let e = 0; e < d.edgeA.length; e++) {
    const a = d.edgeA[e]!, b = d.edgeB[e]!;
    const p = FIRE_SPREAD_P * passageFor(state, e);
    if (fire[a]! > 0 && fire[b] === 0 && chance(state.rng.hazards, p)) igniteRoom(state, b);
    if (fire[b]! > 0 && fire[a] === 0 && chance(state.rng.hazards, p)) igniteRoom(state, a);
  }
}
