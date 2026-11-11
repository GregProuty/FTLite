import type { SimState } from './state';
import { nextFloat, nextInt } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { spawnShot, shotsInFlight } from './debris';
import { nextTarget, ENEMY_SLOT, ENEMY_SLOTS, isEnemySlot, enemySystemOf } from './debrisTargets';
import { minutesOf } from './director';
import { TICK_HZ, ENCOUNTER_MAX, ENCOUNTER_COOLDOWN, ENEMY_HULL, ENEMY_FIRST_SHOT, ENEMY_FIRE_INTERVAL, ENEMY_FIRE_MIN, ENEMY_FIRE_JITTER, ENEMY_SHOTS_MAX, ENEMY_BEAM_BASE, ENEMY_BEAM_SCALE, ESCALATION_RATE, SOLO_INTERVAL_MULT, FREQ_COUNT, ENEMY_SYS_HP, ENEMY_SYS_REPAIR, ENEMY_EVADE } from './tuning';

const TARGETING_KINDS = [StationKind.Weapons, StationKind.Science] as const;

/** Seconds between enemy shots: the foundation's escalation shape with the solo multiplier (spec Combat-i section 5). */
export function fireInterval(minutes: number, players: number): number {
  return Math.max(ENEMY_FIRE_MIN, ENEMY_FIRE_INTERVAL / (1 + ESCALATION_RATE * minutes)) * (players === 1 ? SOLO_INTERVAL_MULT : 1);
}

export const EnemySystem = { Weapons: 0, Engines: 1, Shields: 2 } as const;
export const ENEMY_SYSTEM_NAMES = ['weapons', 'engines', 'shields'] as const;
export const ENEMY_SYSTEM_COUNT = ENEMY_SYSTEM_NAMES.length;

/** Beam threshold against the ship: the base and output term minus the evasion the engines provide; not clamped (spec Combat-ii section 5). */
export function enemyBeamThreshold(state: SimState, output: number): number {
  return ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE * output - (state.enemy.sysHp[EnemySystem.Engines]! > 0 ? ENEMY_EVADE : 0);
}
/** Shields up and the selector's frequency is not the shield frequency: the beam is absorbed without a roll. */
export function beamAbsorbed(state: SimState, selector: number): boolean {
  return state.enemy.sysHp[EnemySystem.Shields]! > 0 && selector + 1 !== state.enemy.shieldFreq;
}

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
  e.sysHp.fill(ENEMY_SYS_HP); e.sysRepairTick.fill(-1); e.shieldFreq = 1 + nextInt(state.rng.hazards, FREQ_COUNT); e.scanned = 0; e.scan = 0;   // the one hazards draw (spec Combat-ii section 4)
  state.telemetry.encounters++;
  for (const kind of TARGETING_KINDS) {
    const i = state.derived.stationOfKind[kind]!;
    if (i >= 0 && state.stations.occupant[i]! >= 0 && state.stations.cursor[i]! < 0) state.stations.cursor[i] = ENEMY_SLOT;
  }
}

/** Departure (destroyed or withdrawn): retarget cursors by StableId before clearing it, then one director draw arms the cooldown. */
export function leave(state: SimState, destroyed: boolean): void {
  const e = state.enemy, sci = state.derived.stationOfKind[StationKind.Science]!;
  const scanningEnemy = sci >= 0 && isEnemySlot(state.stations.cursor[sci]!);
  for (const kind of TARGETING_KINDS) {
    const i = state.derived.stationOfKind[kind]!;
    if (i >= 0 && isEnemySlot(state.stations.cursor[i]!)) state.stations.cursor[i] = nextTarget(state, e.stableId, ENEMY_SLOTS);
  }
  e.present = 0; e.hull = 0; e.stableId = 0; e.nextShotTick = -1; e.departTick = -1;
  e.sysHp.fill(0); e.sysRepairTick.fill(-1); e.shieldFreq = 0; e.scanned = 0; e.scan = 0;
  if (scanningEnemy) state.science.scanning = 0;
  if (destroyed) state.telemetry.enemiesDestroyed++;
  e.nextArrivalTick = state.tick + jitteredTicks(state, ENCOUNTER_COOLDOWN);
}

/** Hull damage always; a subsystem row also damages that system, arming its repair when it reaches 0 (spec Combat-ii section 5). */
export function damageEnemy(state: SimState, slot: number, amount: number): void {
  const e = state.enemy, sys = enemySystemOf(slot);
  e.hull = Math.max(0, e.hull - amount);
  if (sys >= 0 && e.sysHp[sys]! > 0) {
    e.sysHp[sys] = Math.max(0, e.sysHp[sys]! - amount);
    if (e.sysHp[sys] === 0) { e.sysRepairTick[sys] = state.tick + ENEMY_SYS_REPAIR * TICK_HZ; state.telemetry.enemyDisables++; }
  }
  if (e.hull === 0) leave(state, true);
}

/** Per tick, after the director and before the debris step: arrival, else repairs, the engines pause, withdrawal, then a due shot (re-arm first; spawn only with weapons up and under the cap). */
export function enemySystem(state: SimState): void {
  const e = state.enemy;
  if (!e.present) { if (state.tick >= e.nextArrivalTick) arrive(state); return; }
  for (let sys = 0; sys < ENEMY_SYSTEM_COUNT; sys++) {
    if (e.sysRepairTick[sys]! >= 0 && state.tick >= e.sysRepairTick[sys]!) {
      e.sysHp[sys] = ENEMY_SYS_HP; e.sysRepairTick[sys] = -1;
      if (sys === EnemySystem.Weapons) e.nextShotTick = state.tick + ENEMY_FIRST_SHOT * TICK_HZ;
    }
  }
  if (e.sysHp[EnemySystem.Engines] === 0) e.departTick += 1;                       // the departure clock stands still while the engines are down
  if (state.tick >= e.departTick) { leave(state, false); return; }
  if (state.tick < e.nextShotTick) return;
  e.nextShotTick = state.tick + jitteredTicks(state, fireInterval(minutesOf(state), state.playerCount));
  if (e.sysHp[EnemySystem.Weapons]! > 0 && shotsInFlight(state) < ENEMY_SHOTS_MAX) spawnShot(state);   // -1 when the table is full: the shot is skipped
}
