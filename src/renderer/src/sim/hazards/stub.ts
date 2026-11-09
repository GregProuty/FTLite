import type { SimState } from '../state';
import { chance, nextFloat, nextInt } from '../../../../shared/rng';
import { igniteRoom, burningRoomCount } from './fire';
import { activateBreach, activeBreachCount, freeSites } from './breach';
import { HAZARD_DT, TICK_HZ, STUB_INJECT_FRAC, SPAWN_INTERVAL, SPAWN_JITTER, SPAWN_CAP, SPAWN_FIRE_WEIGHT } from '../tuning';

/** Increment 1 stand-in for Life Support: every room is injected at a flat rate (oxygen.ts skips breached rooms). */
export function stubInjection(state: SimState): void {
  const V = state.derived.volume;
  for (let r = 0; r < V.length; r++) state.injectionScratch[r] = STUB_INJECT_FRAC * V[r]! * HAZARD_DT;
}

export function activeHazardCount(state: SimState): number {
  return burningRoomCount(state) + activeBreachCount(state);
}

/** Increment 1 stand-in for the director: a jittered timer that spawns a fire or a breach up to SPAWN_CAP. */
export function stubSpawner(state: SimState): void {
  if (state.tick < state.spawner.nextSpawnTick) return;
  const jitter = 1 + SPAWN_JITTER * (2 * nextFloat(state.rng.director) - 1);
  state.spawner.nextSpawnTick = state.tick + Math.round(SPAWN_INTERVAL * TICK_HZ * jitter);
  if (activeHazardCount(state) >= SPAWN_CAP) return;
  if (chance(state.rng.director, SPAWN_FIRE_WEIGHT)) {
    const candidates: number[] = [];
    for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r] === 0) candidates.push(r);
    if (candidates.length) igniteRoom(state, candidates[nextInt(state.rng.hazards, candidates.length)]!);
  } else {
    const sites = freeSites(state);
    if (sites.length) activateBreach(state, sites[nextInt(state.rng.hazards, sites.length)]!);
  }
}
