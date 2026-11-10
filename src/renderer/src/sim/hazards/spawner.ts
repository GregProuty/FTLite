import type { SimState } from '../state';
import { nextFloat, nextInt } from '../../../../shared/rng';
import { igniteRoom, burningRoomCount } from './fire';
import { activateBreach, activeBreachCount, freeSites } from './breach';
import { failStation } from '../power';
import { failedStationCount } from '../stations';
import { TICK_HZ, SPAWN_INTERVAL, SPAWN_JITTER, SPAWN_CAP, SPAWN_WEIGHTS } from '../tuning';

export function activeHazardCount(state: SimState): number {
  return burningRoomCount(state) + activeBreachCount(state) + failedStationCount(state);
}

/** Stand-in for the director until increment 4: a jittered timer spawning a fire, a breach or a power failure up to SPAWN_CAP (spec §7). */
export function spawner(state: SimState): void {
  if (state.tick < state.spawner.nextSpawnTick) return;
  const jitter = 1 + SPAWN_JITTER * (2 * nextFloat(state.rng.director) - 1);
  state.spawner.nextSpawnTick = state.tick + Math.round(SPAWN_INTERVAL * TICK_HZ * jitter);
  if (activeHazardCount(state) >= SPAWN_CAP) return;
  const total = SPAWN_WEIGHTS.fire + SPAWN_WEIGHTS.breach + SPAWN_WEIGHTS.power;
  const roll = nextFloat(state.rng.director) * total;
  if (roll < SPAWN_WEIGHTS.fire) {
    const candidates: number[] = [];
    for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r] === 0) candidates.push(r);
    if (candidates.length) igniteRoom(state, candidates[nextInt(state.rng.hazards, candidates.length)]!);
  } else if (roll < SPAWN_WEIGHTS.fire + SPAWN_WEIGHTS.breach) {
    const sites = freeSites(state);
    if (sites.length) activateBreach(state, sites[nextInt(state.rng.hazards, sites.length)]!);
  } else {
    const candidates: number[] = [];
    for (let i = 0; i < state.stations.failed.length; i++) if (!state.stations.failed[i]) candidates.push(i);
    if (candidates.length) failStation(state, candidates[nextInt(state.rng.hazards, candidates.length)]!);
  }
}
