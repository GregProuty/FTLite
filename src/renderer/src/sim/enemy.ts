import type { SimState } from './state';
import { nextFloat, nextInt } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { spawnShot, shotsInFlight } from './debris';
import { nextTarget, ENEMY_SLOT, ENEMY_SLOTS, isEnemySlot, enemySystemOf } from './debrisTargets';
import { minutesOf } from './director';
import { addScrap } from './scrap';
import { TICK_HZ, ENCOUNTER_MAX, NEVER, HULL_MAX, ENCOUNTER_REWARD_HULL, ENEMY_HULL, ENEMY_FIRST_SHOT, ENEMY_FIRE_INTERVAL, ENEMY_FIRE_MIN, ENEMY_FIRE_JITTER, ENEMY_SHOTS_MAX, ENEMY_BEAM_BASE, ENEMY_BEAM_SCALE, ESCALATION_RATE, CREW_INTERVAL_MULT, FREQ_COUNT, ENEMY_SYS_HP, ENEMY_SYS_REPAIR, ENEMY_EVADE, SCRAP_ENEMY, DT, ENEMY_HULL_PER_COLUMN, ENEMY_SHIELD_LAYERS, SHIELD_RECHARGE_TIME, ENEMY_FLEE_FRAC, ENEMY_FLEE_DELAY, SCRAP_SURRENDER } from './tuning';

const TARGETING_KINDS = [StationKind.Weapons, StationKind.Science] as const;

/** Seconds between enemy shots: the foundation's escalation shape with the solo multiplier (spec Combat-i section 5). */
export function fireInterval(minutes: number, players: number): number {
  return Math.max(ENEMY_FIRE_MIN, ENEMY_FIRE_INTERVAL / (1 + ESCALATION_RATE * minutes)) * (CREW_INTERVAL_MULT[players - 1] ?? 1);
}

/** The node encounter (spec Demo-vi section 2), in run.encounter. */
export const Encounter = { None: 0, Pending: 1, Fighting: 2, Won: 3, Over: 4 } as const;

export const EnemySystem = { Weapons: 0, Engines: 1, Shields: 2 } as const;
export const ENEMY_SYSTEM_NAMES = ['weapons', 'engines', 'shields'] as const;
export const ENEMY_SYSTEM_COUNT = ENEMY_SYSTEM_NAMES.length;

/** Beam threshold against the ship: the base and output term minus the evasion the engines provide; not clamped (spec Combat-ii section 5). */
export function enemyBeamThreshold(state: SimState, output: number): number {
  return ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE * output - (state.enemy.sysHp[EnemySystem.Engines]! > 0 ? ENEMY_EVADE : 0);
}
/** Hull on arrival at a column (spec Demo-i section 11.2). */
export function enemyMaxHull(column: number): number { return ENEMY_HULL + ENEMY_HULL_PER_COLUMN * column; }
/** Shield layers on arrival at a column (spec Demo-i section 11.2). */
export function enemyShieldMax(column: number): number { return ENEMY_SHIELD_LAYERS[Math.min(column, ENEMY_SHIELD_LAYERS.length - 1)]!; }
/** The enemy weapon charge 0..1: the share of the arming interval elapsed; 0 when absent or the weapons are down (spec Demo-i section 11.3). */
export function enemyWeaponCharge(state: SimState): number {
  const e = state.enemy;
  if (!e.present || e.sysHp[EnemySystem.Weapons] === 0) return 0;
  return Math.max(0, Math.min(1, (state.tick - e.shotArmTick) / Math.max(1, e.nextShotTick - e.shotArmTick)));
}
/** Whole seconds left on the flee countdown, 0 when not fleeing (spec Demo-i section 11.3). */
export function fleeSecondsLeft(state: SimState): number { const e = state.enemy; return e.present && e.fleeing ? Math.ceil((e.departTick - state.tick) / TICK_HZ) : 0; }

/** One rng.director draw: seconds x TICK_HZ x (1 +/- ENEMY_FIRE_JITTER), rounded. */
function jitteredTicks(state: SimState, seconds: number): number {
  const u = nextFloat(state.rng.director);
  return Math.round(seconds * TICK_HZ * (1 + ENEMY_FIRE_JITTER * (2 * u - 1)));
}

/** Arrival: no draw; the enemy takes a StableId and the first-warning auto-select applies to it; the encounter starts (spec Demo-vi section 2). */
export function arrive(state: SimState): void {
  const e = state.enemy;
  e.present = 1; e.maxHull = enemyMaxHull(state.run.column); e.hull = e.maxHull; e.stableId = state.nextStableId++;
  e.departTick = state.tick + ENCOUNTER_MAX * TICK_HZ; e.nextShotTick = state.tick + ENEMY_FIRST_SHOT * TICK_HZ;
  e.sysHp.fill(ENEMY_SYS_HP); e.sysRepairTick.fill(-1); e.shieldFreq = 1 + nextInt(state.rng.hazards, FREQ_COUNT); e.scanned = 0; e.scan = 0;   // the one hazards draw (spec Combat-ii section 4)
  e.shieldLayers = enemyShieldMax(state.run.column); e.shieldRecharge = 0; e.shotArmTick = state.tick; e.fleeing = 0; e.surrenderIntact = 0; e.lastHitTick = -1;   // spec Demo-i section 11.3, Demo-ii section 4
  state.telemetry.encounters++;
  state.run.encounter = Encounter.Fighting; state.run.encounterTick = state.tick;
  for (const kind of TARGETING_KINDS) {
    const i = state.derived.stationOfKind[kind]!;
    if (i >= 0 && state.stations.occupant[i]! >= 0 && state.stations.cursor[i]! < 0) state.stations.cursor[i] = ENEMY_SLOT;
  }
}

/** Departure (destroyed or withdrawn): retarget cursors by StableId before clearing it, then the encounter ends (spec Demo-vi section 2): a kill or a paid surrender is a win (+hull, the drive boost), anything else is over; no draw, and no further enemy at this node. */
export function leave(state: SimState, destroyed: boolean): void {
  const e = state.enemy, sci = state.derived.stationOfKind[StationKind.Science]!;
  const won = destroyed || (e.fleeing === 1 && e.surrenderIntact === 1);   // read before the flee fields are cleared
  const scanningEnemy = sci >= 0 && isEnemySlot(state.stations.cursor[sci]!);
  for (const kind of TARGETING_KINDS) {
    const i = state.derived.stationOfKind[kind]!;
    if (i >= 0 && isEnemySlot(state.stations.cursor[i]!)) state.stations.cursor[i] = nextTarget(state, e.stableId, ENEMY_SLOTS);
  }
  e.present = 0; e.hull = 0; e.stableId = 0; e.nextShotTick = -1; e.departTick = -1;
  e.sysHp.fill(0); e.sysRepairTick.fill(-1); e.shieldFreq = 0; e.scanned = 0; e.scan = 0;
  if (scanningEnemy) state.science.scanning = 0;
  if (!destroyed && e.fleeing) { if (e.surrenderIntact) { addScrap(state, SCRAP_SURRENDER); state.telemetry.surrenders++; } else state.telemetry.enemyFled++; }   // spec Demo-i section 11.3: a flee ends in a surrender bounty or a flight
  e.maxHull = 0; e.shieldLayers = 0; e.shieldRecharge = 0; e.shotArmTick = -1; e.fleeing = 0; e.surrenderIntact = 0; e.lastHitTick = -1;
  if (destroyed) { state.telemetry.enemiesDestroyed++; addScrap(state, SCRAP_ENEMY); }
  const r = state.run;
  if (r.encounter === Encounter.Fighting) {
    if (won) { r.encounter = Encounter.Won; state.telemetry.encountersWon++; state.hull = Math.min(HULL_MAX, state.hull + ENCOUNTER_REWARD_HULL); r.driveBoost = 1; }
    else r.encounter = Encounter.Over;
  }
  r.encounterTick = state.tick; e.nextArrivalTick = NEVER;   // one enemy per node
}

/** Hull damage always; a subsystem row also damages that system, arming its repair when it reaches 0 (spec Combat-ii section 5). */
export function damageEnemy(state: SimState, slot: number, amount: number): void {
  const e = state.enemy, sys = enemySystemOf(slot);
  e.hull = Math.max(0, e.hull - amount); e.lastHitTick = state.tick;                  // the HUD hit flash (spec Demo-ii section 4)
  if (e.fleeing) e.surrenderIntact = 0;                                              // any damage voids the surrender (spec Demo-i section 11.3)
  if (sys >= 0 && e.sysHp[sys]! > 0) {
    e.sysHp[sys] = Math.max(0, e.sysHp[sys]! - amount);
    if (e.sysHp[sys] === 0) { e.sysRepairTick[sys] = state.tick + ENEMY_SYS_REPAIR * TICK_HZ; state.telemetry.enemyDisables++; if (sys === EnemySystem.Shields) { e.shieldLayers = 0; e.shieldRecharge = 0; } }
  }
  if (e.hull === 0) leave(state, true);
}

/** Per tick, after the director and before the debris step: arrival, else repairs, shield recharge, the flee start, the engines pause, withdrawal, then a due shot (re-arm first; spawn only with weapons up and under the cap). */
export function enemySystem(state: SimState): void {
  const e = state.enemy;
  if (!e.present) { if (state.tick >= e.nextArrivalTick) arrive(state); return; }
  for (let sys = 0; sys < ENEMY_SYSTEM_COUNT; sys++) {
    if (e.sysRepairTick[sys]! >= 0 && state.tick >= e.sysRepairTick[sys]!) {
      e.sysHp[sys] = ENEMY_SYS_HP; e.sysRepairTick[sys] = -1;
      if (sys === EnemySystem.Weapons) { e.nextShotTick = state.tick + ENEMY_FIRST_SHOT * TICK_HZ; e.shotArmTick = state.tick; }
      if (sys === EnemySystem.Shields) { e.shieldLayers = 0; e.shieldRecharge = 0; }   // a repaired shield system starts empty
    }
  }
  if (e.sysHp[EnemySystem.Shields]! > 0 && e.shieldLayers < enemyShieldMax(state.run.column)) {   // recharge: no draw (spec Demo-i section 11.3)
    e.shieldRecharge = Math.min(1, e.shieldRecharge + DT / SHIELD_RECHARGE_TIME);
    if (e.shieldRecharge >= 1 - 1e-9) { e.shieldLayers++; e.shieldRecharge = 0; }   // 360 additions of DT / 6 sum to 0.999999999999997: the layer lands on the 360th tick, as the spec's 6 x 60 says
  }
  if (!e.fleeing && e.hull <= ENEMY_FLEE_FRAC * e.maxHull && e.sysHp[EnemySystem.Engines]! > 0) {   // flee start: no draw
    e.fleeing = 1; e.surrenderIntact = 1; e.departTick = state.tick + ENEMY_FLEE_DELAY * TICK_HZ; state.telemetry.surrenderOffers++;
  }
  if (e.sysHp[EnemySystem.Engines] === 0) e.departTick += 1;                       // the departure clock stands still while the engines are down
  if (state.tick >= e.departTick) { leave(state, false); return; }
  if (state.tick < e.nextShotTick) return;
  e.shotArmTick = state.tick;
  e.nextShotTick = state.tick + jitteredTicks(state, fireInterval(minutesOf(state), state.playerCount));
  if (e.sysHp[EnemySystem.Weapons]! > 0 && shotsInFlight(state) < ENEMY_SHOTS_MAX) spawnShot(state);   // -1 when the table is full: the shot is skipped
}
