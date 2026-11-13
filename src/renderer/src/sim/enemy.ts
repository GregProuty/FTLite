import type { SimState } from './state';
import { nextFloat, nextInt } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { spawnShot, shotsInFlight } from './debris';
import { nextTarget, ENEMY_SLOT, ENEMY_SLOTS, isEnemySlot, enemySystemOf } from './debrisTargets';
import { minutesOf } from './director';
import { addScrap } from './scrap';
import { grantWeapon } from './weapons';
import { LOOT_WEAPON_TYPES } from './weaponDefs';
import { depthOf, peaceful } from './depth';
import { TICK_HZ, ENCOUNTER_MAX, NEVER, HULL_MAX, ENCOUNTER_REWARD_HULL, ENEMY_HULL, ENEMY_FIRST_SHOT, ENEMY_FIRE_INTERVAL, ENEMY_FIRE_MIN, ENEMY_FIRE_JITTER, ENEMY_SHOTS_MAX, ENEMY_BEAM_BASE, ENEMY_BEAM_SCALE, ESCALATION_RATE, CREW_INTERVAL_MULT, FREQ_COUNT, ENEMY_SYS_HP, ENEMY_SYS_REPAIR, ENEMY_EVADE, scrapEnemy, DT, ENEMY_HULL_PER_COLUMN, ENEMY_SHIELD_LAYERS, SHIELD_RECHARGE_TIME, ENEMY_FLEE_FRAC, ENEMY_FLEE_DELAY, scrapSurrender, ENEMY_ROOMS, ENEMY_HIT_FIRE, ENEMY_HIT_BREACH, ENEMY_FIRE_SECONDS, ENEMY_BREACH_SECONDS, ENEMY_FIRE_HULL_DPS, ENEMY_FIRE_SYS_DPS, ENEMY_BREACH_HULL_DPS, SHIELD_ROTATE, KILL_FUEL_MIN, PURSUIT_HULL_MULT, PURSUIT_FIRE_MULT, WEAPON_DROP_CHANCE, WARDEN_HULL_MULT, WARDEN_FIRE_MULT, WARDEN_SHIELD_EXTRA } from './tuning';
import { EndReason } from './crew';

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
/** The enemy ship's five rooms (spec Demo-viii section 2b); the three system rooms share the EnemySystem indices. */
export const EnemyRoom = { Weapons: 0, Engines: 1, Shields: 2, Bridge: 3, Hold: 4 } as const;
export const ENEMY_ROOM_NAMES = ['Weapons', 'Engines', 'Shields', 'Bridge', 'Hold'] as const;

/** An enemy system acts as up: health above 0 and no ion disable running (spec Loop-iii section 1: an ionised system acts as down without losing health). */
export function enemySysUp(state: SimState, sys: number): boolean { const e = state.enemy; return e.sysHp[sys]! > 0 && !(e.ionUntil[sys]! > state.tick); }
/** Whole seconds left on a system's ion disable, 0 when none runs. */
export function ionSecondsLeft(state: SimState, sys: number): number { const t = state.enemy.ionUntil[sys]!; return t > state.tick ? Math.ceil((t - state.tick) / TICK_HZ) : 0; }

/** Beam threshold against the ship: the base and output term minus the evasion the engines provide; not clamped (spec Combat-ii section 5). */
export function enemyBeamThreshold(state: SimState, output: number): number {
  return ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE * output - (enemySysUp(state, EnemySystem.Engines) ? ENEMY_EVADE : 0);
}
/** Hull on arrival at a depth (spec Demo-i section 11.2; Loop-i section 1: depth replaces the column). */
export function enemyMaxHull(column: number): number { return ENEMY_HULL + ENEMY_HULL_PER_COLUMN * column; }
/** Shield layers on arrival at a depth (spec Demo-i section 11.2; Loop-i section 1). */
export function enemyShieldMax(column: number): number { return ENEMY_SHIELD_LAYERS[Math.min(column, ENEMY_SHIELD_LAYERS.length - 1)]!; }
/** The enemy at the final beacon is the Warden (spec Loop-iv section 2). */
export const isWarden = (state: SimState): boolean => state.run.finalBeacon === 1;
/** The present enemy's shield layers when full: the depth's maximum, one more for the Warden (spec Loop-iv section 2). */
export function enemyShieldCap(state: SimState): number { return enemyShieldMax(depthOf(state)) + (isWarden(state) ? WARDEN_SHIELD_EXTRA : 0); }
/** Hull on arrival here: the depth's, x1.5 for the Pursuit's elite (spec Loop-i section 3), x WARDEN_HULL_MULT for the Warden (spec Loop-iv section 2). */
function arrivalHull(state: SimState): number {
  const base = enemyMaxHull(depthOf(state));
  return isWarden(state) ? Math.round(base * WARDEN_HULL_MULT) : state.run.pursuitFought ? Math.round(base * PURSUIT_HULL_MULT) : base;
}
/** The enemy weapon charge 0..1: the share of the arming interval elapsed; 0 when absent or the weapons are down (spec Demo-i section 11.3). */
export function enemyWeaponCharge(state: SimState): number {
  const e = state.enemy;
  if (!e.present || !enemySysUp(state, EnemySystem.Weapons)) return 0;
  return Math.max(0, Math.min(1, (state.tick - e.shotArmTick) / Math.max(1, e.nextShotTick - e.shotArmTick)));
}
/** A Science lock is running (spec Coop-i section 1): it ends at lockUntilTick, at a rotation or when the enemy leaves. */
export function lockActive(state: SimState): boolean { const e = state.enemy; return e.present === 1 && e.lockUntilTick >= 0 && state.tick < e.lockUntilTick; }
/** Whole seconds left on the lock, 0 when none runs. */
export function lockSecondsLeft(state: SimState): number { return lockActive(state) ? Math.ceil((state.enemy.lockUntilTick - state.tick) / TICK_HZ) : 0; }
/** Whole seconds to the next shield re-tune; null while absent or the shields system is down (no re-tune then; the repair re-arms the clock). */
export function rotateSecondsLeft(state: SimState): number | null { const e = state.enemy; return e.present && e.sysHp[EnemySystem.Shields]! > 0 && e.shieldRotateTick >= 0 ? Math.max(0, Math.ceil((e.shieldRotateTick - state.tick) / TICK_HZ)) : null; }

/** The re-tune (spec Coop-i section 1, amendment C2): one rng.combat draw picks one of the other frequencies; the scan resets and any lock ends. */
function rotateShields(state: SimState): void {
  const e = state.enemy;
  e.shieldFreq = ((e.shieldFreq - 1 + 1 + nextInt(state.rng.combat, FREQ_COUNT - 1)) % FREQ_COUNT) + 1;
  e.scanned = 0; e.scan = 0; e.lockUntilTick = -1;
  e.shieldRotateTick = state.tick + SHIELD_ROTATE * TICK_HZ;
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
  e.present = 1; e.maxHull = arrivalHull(state); e.hull = e.maxHull; e.stableId = state.nextStableId++;
  e.departTick = isWarden(state) ? NEVER : state.tick + ENCOUNTER_MAX * TICK_HZ; e.nextShotTick = state.tick + ENEMY_FIRST_SHOT * TICK_HZ;   // the Warden never withdraws (spec Loop-iv amendment F2)
  e.sysHp.fill(ENEMY_SYS_HP); e.sysRepairTick.fill(-1); e.shieldFreq = 1 + nextInt(state.rng.hazards, FREQ_COUNT); e.scanned = 0; e.scan = 0;   // the one hazards draw (spec Combat-ii section 4)
  e.shieldLayers = enemyShieldCap(state); e.shieldRecharge = 0; e.shotArmTick = state.tick; e.fleeing = 0; e.surrenderIntact = 0; e.lastHitTick = -1; e.roomFire.fill(0); e.roomBreach.fill(0); e.shieldRotateTick = state.tick + SHIELD_ROTATE * TICK_HZ; e.lockUntilTick = -1; e.ionUntil.fill(-1);   // spec Coop-i section 1: the re-tune clock, no lock; spec Demo-i section 11.3, Demo-ii section 4, Demo-viii section 2b
  state.telemetry.encounters++;
  state.run.encounter = Encounter.Fighting; state.run.encounterTick = state.tick;
  for (const kind of TARGETING_KINDS) {
    const i = state.derived.stationOfKind[kind]!;
    if (i >= 0 && state.stations.occupant[i]! >= 0 && state.stations.cursor[i]! < 0) state.stations.cursor[i] = ENEMY_SLOT;
  }
}

/** Departure (destroyed or withdrawn): retarget cursors by StableId before clearing it, then the encounter ends (spec Demo-vi section 2): a kill or a paid surrender is a win (+hull, the drive boost), anything else is over; no draw, and no further enemy at this node. */
export function leave(state: SimState, destroyed: boolean): void {
  if (!state.enemy.present) return;   // a second call is harmless (spec Demo-viii amendment I2)
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
  const elite = state.run.pursuitFought === 1 || isWarden(state);   // the Pursuit's elite pays no scrap or fuel (spec Loop-i section 3), nor the Warden (spec Loop-iv section 2)
  if (!destroyed && e.fleeing) { if (e.surrenderIntact) { if (!elite) addScrap(state, scrapSurrender(depthOf(state))); state.telemetry.surrenders++; } else state.telemetry.enemyFled++; }   // spec Demo-i section 11.3: a flee ends in a surrender bounty or a flight
  e.maxHull = 0; e.shieldLayers = 0; e.shieldRecharge = 0; e.shotArmTick = -1; e.fleeing = 0; e.surrenderIntact = 0; e.lastHitTick = -1; e.roomFire.fill(0); e.roomBreach.fill(0); e.shieldRotateTick = -1; e.lockUntilTick = -1; e.ionUntil.fill(-1);
  if (destroyed) { state.telemetry.enemiesDestroyed++; if (!elite) { addScrap(state, scrapEnemy(depthOf(state))); state.run.fuel += KILL_FUEL_MIN + nextInt(state.rng.loot, 2); if (nextFloat(state.rng.loot) < WEAPON_DROP_CHANCE) grantWeapon(state, 1 + nextInt(state.rng.loot, LOOT_WEAPON_TYPES), false); } }   // a kill gives 1 or 2 fuel (spec Loop-i section 2), then may drop a weapon: one loot draw for the chance, one for the type (spec Loop-iii section 3; the elite pays nothing, amendment W4)
  const r = state.run;
  if (r.encounter === Encounter.Fighting) {
    if (won) { r.encounter = Encounter.Won; state.telemetry.encountersWon++; state.hull = Math.min(HULL_MAX, state.hull + ENCOUNTER_REWARD_HULL); r.driveBoost = 1; }
    else r.encounter = Encounter.Over;
  }
  r.encounterTick = state.tick; e.nextArrivalTick = NEVER;   // one enemy per node
  if (destroyed && isWarden(state)) { state.ended = 1; state.endReason = EndReason.Victory; }   // destroying the Warden wins the run (spec Loop-iv section 1)
}

/** A system reaching 0: its self-repair is armed; the shields lose every layer (spec Combat-ii section 5). */
function disableEnemySystem(state: SimState, sys: number): void {
  const e = state.enemy;
  e.sysRepairTick[sys] = state.tick + ENEMY_SYS_REPAIR * TICK_HZ; state.telemetry.enemyDisables++;
  if (sys === EnemySystem.Shields) { e.shieldLayers = 0; e.shieldRecharge = 0; }
}

/** The room a hull or system hit lands in (spec Demo-viii section 2b): a system row's own room; the hull row the Bridge or the Hold by one rng.combat draw. */
export function enemyRoomOfHit(state: SimState, slot: number): number {
  const sys = enemySystemOf(slot);
  return sys >= 0 ? sys : EnemyRoom.Bridge + nextInt(state.rng.combat, 2);
}

/** After a hull or system hit (not a miss, not a strip): the room draw (hull row only), then one problem draw: a fire below ENEMY_HIT_FIRE (reset to full if one burns), a breach from 1 - ENEMY_HIT_BREACH (amendment I1). Called before the damage, so the draws are made even on a killing hit. */
export function startEnemyProblem(state: SimState, slot: number): void {
  const e = state.enemy, room = enemyRoomOfHit(state, slot), u = nextFloat(state.rng.combat);
  if (u < ENEMY_HIT_FIRE) e.roomFire[room] = ENEMY_FIRE_SECONDS;
  else if (u >= 1 - ENEMY_HIT_BREACH) e.roomBreach[room] = ENEMY_BREACH_SECONDS;
}

const TIMER_EPS = 1e-9;
/** The interior step (spec Demo-viii section 2b, amendments I2 and I3), first in enemySystem for a present enemy: per room, a fire burns hull and its system (which can go down by the usual rule), a breach drains hull and holds its system's repair; timers count down. Not our shot: no hit flash, no voided surrender. The first time hull reaches 0 the enemy is destroyed and the step returns true at once. */
export function interiorStep(state: SimState): boolean {
  const e = state.enemy;
  for (let r = 0; r < ENEMY_ROOMS; r++) {
    const sys = r < ENEMY_SYSTEM_COUNT ? r : -1;
    if (e.roomFire[r]! > 0) {
      e.hull = Math.max(0, e.hull - ENEMY_FIRE_HULL_DPS * DT);
      if (sys >= 0 && e.sysHp[sys]! > 0) { const hp = e.sysHp[sys]! - ENEMY_FIRE_SYS_DPS * DT; e.sysHp[sys] = hp < TIMER_EPS ? 0 : hp; if (e.sysHp[sys] === 0) disableEnemySystem(state, sys); }
      const left = e.roomFire[r]! - DT; e.roomFire[r] = left < TIMER_EPS ? 0 : left;
    }
    if (e.roomBreach[r]! > 0) {
      e.hull = Math.max(0, e.hull - ENEMY_BREACH_HULL_DPS * DT);
      if (sys >= 0 && e.sysRepairTick[sys]! >= 0) e.sysRepairTick[sys]! += 1;
      const left = e.roomBreach[r]! - DT; e.roomBreach[r] = left < TIMER_EPS ? 0 : left;
    }
    if (e.hull < TIMER_EPS) { e.hull = 0; leave(state, true); return true; }
  }
  return false;
}

/** Hull damage always; a subsystem row also damages that system, arming its repair when it reaches 0 (spec Combat-ii section 5). */
export function damageEnemy(state: SimState, slot: number, amount: number): void {
  const e = state.enemy, sys = enemySystemOf(slot);
  e.hull = Math.max(0, e.hull - amount); e.lastHitTick = state.tick;                  // the HUD hit flash (spec Demo-ii section 4)
  if (e.fleeing) e.surrenderIntact = 0;                                              // any damage voids the surrender (spec Demo-i section 11.3)
  if (sys >= 0 && e.sysHp[sys]! > 0) {
    e.sysHp[sys] = Math.max(0, e.sysHp[sys]! - amount);
    if (e.sysHp[sys] === 0) disableEnemySystem(state, sys);
  }
  if (e.hull === 0) leave(state, true);
}

/** Per tick, after the director and before the debris step: arrival, else repairs, shield recharge, the flee start, the engines pause, withdrawal, then a due shot (re-arm first; spawn only with weapons up and under the cap). */
export function enemySystem(state: SimState): void {
  const e = state.enemy;
  if (!e.present) { if (state.tick >= e.nextArrivalTick && !peaceful(state)) arrive(state); return; }   // nothing arrives at a peaceful beacon (spec Loop-i section 4b)
  if (interiorStep(state)) return;   // first for a present enemy (amendment I3): destroyed by fire, no shot, no withdrawal
  for (let sys = 0; sys < ENEMY_SYSTEM_COUNT; sys++) {
    if (e.sysRepairTick[sys]! >= 0 && state.tick >= e.sysRepairTick[sys]!) {
      e.sysHp[sys] = ENEMY_SYS_HP; e.sysRepairTick[sys] = -1;
      if (sys === EnemySystem.Weapons) { e.nextShotTick = state.tick + ENEMY_FIRST_SHOT * TICK_HZ; e.shotArmTick = state.tick; }
      if (sys === EnemySystem.Shields) { e.shieldLayers = 0; e.shieldRecharge = 0; e.shieldRotateTick = state.tick + SHIELD_ROTATE * TICK_HZ; }   // a repaired shield system starts empty, its re-tune clock a full SHIELD_ROTATE away (spec Coop-i amendment C6)
    }
  }
  const shieldsUp = enemySysUp(state, EnemySystem.Shields), enginesUp = enemySysUp(state, EnemySystem.Engines);   // an ionised system acts as down (spec Loop-iii section 1)
  if (e.sysHp[EnemySystem.Shields]! > 0 && !shieldsUp && e.shieldRotateTick >= 0) e.shieldRotateTick += 1;   // the re-tune clock stands still while the shields are ionised
  if (shieldsUp && e.shieldLayers < enemyShieldCap(state)) {   // recharge: no draw (spec Demo-i section 11.3)
    e.shieldRecharge = Math.min(1, e.shieldRecharge + DT / SHIELD_RECHARGE_TIME);
    if (e.shieldRecharge >= 1 - 1e-9) { e.shieldLayers++; e.shieldRecharge = 0; }   // 360 additions of DT / 6 sum to 0.999999999999997: the layer lands on the 360th tick, as the spec's 6 x 60 says
  }
  if (e.lockUntilTick >= 0 && state.tick >= e.lockUntilTick) e.lockUntilTick = -1;   // the lock runs out (spec Coop-i section 1)
  if (shieldsUp && e.shieldRotateTick >= 0 && state.tick >= e.shieldRotateTick) rotateShields(state);   // no re-tune while the shields system is down (amendment C1)
  const warden = isWarden(state);   // the Warden never flees, surrenders or withdraws (spec Loop-iv section 2, amendment F2)
  if (!warden && !e.fleeing && e.hull <= ENEMY_FLEE_FRAC * e.maxHull && enginesUp) {   // flee start: no draw
    e.fleeing = 1; e.surrenderIntact = 1; e.departTick = state.tick + ENEMY_FLEE_DELAY * TICK_HZ; state.telemetry.surrenderOffers++;
  }
  if (!enginesUp && !warden) e.departTick += 1;            // the departure clock stands still while the engines are down (or ionised)
  if (!warden && state.tick >= e.departTick) { leave(state, false); return; }
  if (state.tick < e.nextShotTick) return;
  e.shotArmTick = state.tick;
  e.nextShotTick = state.tick + jitteredTicks(state, fireInterval(minutesOf(state), state.playerCount) * (warden ? WARDEN_FIRE_MULT : state.run.pursuitFought ? PURSUIT_FIRE_MULT : 1));   // the elite fires faster (spec Loop-i section 3), the Warden faster still (spec Loop-iv section 2)
  if (enemySysUp(state, EnemySystem.Weapons) && shotsInFlight(state) < ENEMY_SHOTS_MAX) spawnShot(state);   // -1 when the table is full: the shot is skipped
}
