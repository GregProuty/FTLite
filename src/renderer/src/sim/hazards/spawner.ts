import type { SimState } from '../state';
import { nextFloat, nextInt } from '../../../../shared/rng';
import { igniteRoom, burningRoomCount } from './fire';
import { activateBreach, activeBreachCount, freeSites } from './breach';
import { failStation } from '../power';
import { activeDebrisCount, spawnDebris } from '../debris';
import { failedStationCount } from '../stations';
import { TICK_HZ, SPAWN_INTERVAL, SPAWN_JITTER, SPAWN_CAP, SPAWN_WEIGHTS } from '../tuning';

export function activeHazardCount(state: SimState): number {
  return burningRoomCount(state) + activeBreachCount(state) + failedStationCount(state) + activeDebrisCount(state);
}

/** Maps a roll in [0, total weight) onto a hazard type by the SPAWN_WEIGHTS intervals (fire, breach, power, debris). */
export function pickSpawnType(roll: number): 'fire' | 'breach' | 'power' | 'debris' {
  const w = SPAWN_WEIGHTS;
  if (roll < w.fire) return 'fire';
  if (roll < w.fire + w.breach) return 'breach';
  return roll < w.fire + w.breach + w.power ? 'power' : 'debris';
}

/** Stand-in for the director until increment 4: a jittered timer spawning a fire, a breach, a power failure or an inbound debris object up to SPAWN_CAP (spec section 7). */
export function spawner(state: SimState): void {
  if (state.tick < state.spawner.nextSpawnTick) return;
  const jitter = 1 + SPAWN_JITTER * (2 * nextFloat(state.rng.director) - 1);
  state.spawner.nextSpawnTick = state.tick + Math.round(SPAWN_INTERVAL * TICK_HZ * jitter);
  if (activeHazardCount(state) >= SPAWN_CAP) return;
  const total = SPAWN_WEIGHTS.fire + SPAWN_WEIGHTS.breach + SPAWN_WEIGHTS.power + SPAWN_WEIGHTS.debris;
  const roll = nextFloat(state.rng.director) * total;
  const type = pickSpawnType(roll);
  if (type === 'fire') {
    const candidates: number[] = [];
    for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r] === 0) candidates.push(r);
    if (candidates.length) igniteRoom(state, candidates[nextInt(state.rng.hazards, candidates.length)]!);
  } else if (type === 'breach') {
    const sites = freeSites(state);
    if (sites.length) activateBreach(state, sites[nextInt(state.rng.hazards, sites.length)]!);
  } else if (type === 'power') {
    const candidates: number[] = [];
    for (let i = 0; i < state.stations.failed.length; i++) if (!state.stations.failed[i]) candidates.push(i);
    if (candidates.length) failStation(state, candidates[nextInt(state.rng.hazards, candidates.length)]!);
  } else spawnDebris(state);
}
