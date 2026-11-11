import type { SimState } from './state';
import { nextFloat } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { spawnShot, shotsInFlight } from './debris';
import { nextTarget, ENEMY_SLOT } from './debrisTargets';
import { minutesOf } from './director';
import { TICK_HZ, ENCOUNTER_MAX, ENCOUNTER_COOLDOWN, ENEMY_HULL, ENEMY_FIRST_SHOT, ENEMY_FIRE_INTERVAL, ENEMY_FIRE_MIN, ENEMY_FIRE_JITTER, ENEMY_SHOTS_MAX, ENEMY_BEAM_BASE, ENEMY_BEAM_SCALE, ESCALATION_RATE, SOLO_INTERVAL_MULT } from './tuning';

const TARGETING_KINDS = [StationKind.Weapons, StationKind.Science] as const;

/** Seconds between enemy shots: the foundation's escalation shape with the solo multiplier (spec Combat-i section 5). */
export function fireInterval(minutes: number, players: number): number {
  return Math.max(ENEMY_FIRE_MIN, ENEMY_FIRE_INTERVAL / (1 + ESCALATION_RATE * minutes)) * (players === 1 ? SOLO_INTERVAL_MULT : 1);
}

/** Pure beam threshold against the ship: frequency plays no part until Combat-ii. */
export function enemyBeamHits(u: number, output: number): boolean { return u < ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE * output; }

/** One rng.director draw: seconds x TICK_HZ x (1 +/- ENEMY_FIRE_JITTER), rounded. */
function jitteredTicks(state: SimState, seconds: number): number {
  const u = nextFloat(state.rng.director);
  return Math.round(seconds * TICK_HZ * (1 + ENEMY_FIRE_JITTER * (2 * u - 1)));
}

/** Arrival: no draw; the enemy takes a StableId and the first-warning auto-select applies to it. */
export function arrive(state: SimState): void {
  const e = state.enemy;
  e.present = 1; e.hull = ENEMY_HULL; e.stableId = state.nextStableId++;
  e.departTick = state.tick + ENCOUNTER_MAX * TICK_HZ; e.nextShotTick = state.tick + ENEMY_FIRST_SHOT * TICK_HZ;
  state.telemetry.encounters++;
  for (const kind of TARGETING_KINDS) {
    const i = state.derived.stationOfKind[kind]!;
    if (i >= 0 && state.stations.occupant[i]! >= 0 && state.stations.cursor[i]! < 0) state.stations.cursor[i] = ENEMY_SLOT;
  }
}

/** Departure (destroyed or withdrawn): retarget cursors by StableId before clearing it, then one director draw arms the cooldown. */
export function leave(state: SimState, destroyed: boolean): void {
  const e = state.enemy;
  for (const kind of TARGETING_KINDS) {
    const i = state.derived.stationOfKind[kind]!;
    if (i >= 0 && state.stations.cursor[i] === ENEMY_SLOT) state.stations.cursor[i] = nextTarget(state, e.stableId, ENEMY_SLOT);
  }
  e.present = 0; e.hull = 0; e.stableId = 0; e.nextShotTick = -1; e.departTick = -1;
  if (destroyed) state.telemetry.enemiesDestroyed++;
  e.nextArrivalTick = state.tick + jitteredTicks(state, ENCOUNTER_COOLDOWN);
}

export function damageEnemy(state: SimState, amount: number): void {
  const e = state.enemy;
  e.hull = Math.max(0, e.hull - amount);
  if (e.hull === 0) leave(state, true);
}

/** Per tick, after the director and before the debris step: arrival, else withdrawal, else a due shot (re-arm first, then the cap). */
export function enemySystem(state: SimState): void {
  const e = state.enemy;
  if (!e.present) { if (state.tick >= e.nextArrivalTick) arrive(state); return; }
  if (state.tick >= e.departTick) { leave(state, false); return; }
  if (state.tick < e.nextShotTick) return;
  e.nextShotTick = state.tick + jitteredTicks(state, fireInterval(minutesOf(state), state.playerCount));
  if (shotsInFlight(state) < ENEMY_SHOTS_MAX) spawnShot(state);   // -1 when the table is full: the shot is skipped
}
