import type { SimState } from './state';
import { nextFloat } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { removeDebris } from './debris';
import { cycleTarget, isTarget, isEnemySlot } from './debrisTargets';
import { enemyBeamThreshold, damageEnemy, EnemySystem, startEnemyProblem, lockActive, enemySysUp } from './enemy';
import { enemySystemOf } from './debrisTargets';
import { weaponDef } from './weaponDefs';
import { addScrap } from './scrap';
import { Dir } from './dir';
import { Skill, addXp } from './skills';
import { DT, XP_PER_SHOT, BEAM_CHARGE_TIME, BEAM_MATCH_BASE, BEAM_MATCH_SCALE, BEAM_MISS_BASE, BEAM_MISS_SCALE, TORP_HIT_BASE, TORP_HIT_SCALE, ENEMY_BEAM_DAMAGE, ENEMY_TORP_DAMAGE, LOCK_HIT_BONUS, WEAPON_SLOTS, SLOT_LEVELS, ION_SECONDS, TICK_HZ } from './tuning';

/** Selector values (spec 2b-ii section 5, Loop-iii section 2): beams tuned to frequency selector + 1, the torpedo, then the two extra slots. The values are stable; the cycle order is selectorList's. */
export const Weapon = { BeamF1: 0, BeamF2: 1, BeamF3: 2, Torpedo: 3, Slot1: 4, Slot2: 5 } as const;
/** The extra slot a selector value names, -1 for the Pulse Laser and the Torpedo. */
export const slotOfSelector = (selector: number): number => (selector >= Weapon.Slot1 ? selector - Weapon.Slot1 : -1);
/** The flat selector list (spec Loop-iii section 2): Pulse F1, F2, F3, each filled extra slot, then the Torpedo. */
export function selectorList(state: SimState): number[] {
  const out: number[] = [Weapon.BeamF1, Weapon.BeamF2, Weapon.BeamF3];
  for (let k = 0; k < WEAPON_SLOTS; k++) if (state.weapons.slot[k]) out.push(Weapon.Slot1 + k);
  out.push(Weapon.Torpedo);
  return out;
}

/** Pure beam threshold: matched to the object's frequency or not. */
export function beamHits(u: number, output: number, match: boolean): boolean {
  return u < (match ? BEAM_MATCH_BASE + BEAM_MATCH_SCALE * output : BEAM_MISS_BASE + BEAM_MISS_SCALE * output);
}

/** Pure torpedo threshold: homing, so frequency plays no part. */
export function torpedoHits(u: number, output: number): boolean {
  return u < TORP_HIT_BASE + TORP_HIT_SCALE * output;
}

/** Once per tick: the beam charges while Weapons is online and occupied; the charge is kept otherwise (spec 2a-ii section 5). A filled extra slot also charges then, at its own charge time, while the Weapons level reaches SLOT_LEVELS[k] (spec Loop-iii section 2). */
export function chargeBeam(state: SimState): void {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!, w = state.weapons;
  if (wpn < 0 || !stationOnline(state, wpn) || state.stations.occupant[wpn]! < 0) return;
  const output = stationOutput(state, wpn), level = state.stations.level[wpn]!;
  w.charge = Math.min(1, w.charge + DT * output / BEAM_CHARGE_TIME);
  for (let k = 0; k < WEAPON_SLOTS; k++) if (w.slot[k] && level >= SLOT_LEVELS[k]!) w.charge2[k] = Math.min(1, w.charge2[k]! + DT * output / weaponDef(w.slot[k]!).chargeTime);
}

/** Where a new weapon went (spec Loop-iii section 3), in weapons.lootPlace. */
export const LootPlace = { Slot1: 0, Slot2: 1, Cargo: 2, Sold: 3 } as const;
/** A weapon found or bought (spec Loop-iii section 3): the first empty extra slot (with an empty charge), else the cargo, else sold for half its price in scrap. Stamps the notice fields; no draws. */
export function grantWeapon(state: SimState, id: number, bought: boolean): number {
  const w = state.weapons;
  let place: number = LootPlace.Sold;
  const k = w.slot.indexOf(0);
  if (k >= 0) { w.slot[k] = id; w.charge2[k] = 0; place = LootPlace.Slot1 + k; }
  else if (!w.cargo) { w.cargo = id; place = LootPlace.Cargo; }
  else addScrap(state, Math.floor(weaponDef(id).price / 2));
  w.lootTick = state.tick; w.lootId = id; w.lootPlace = place; w.lootBought = bought ? 1 : 0;
  return place;
}
/** Somewhere to put a new weapon: an empty extra slot or the cargo. */
export const hasRoomForWeapon = (state: SimState): boolean => state.weapons.slot.includes(0) || !state.weapons.cargo;

/** An untuned hit strips a layer and nothing else (spec Demo-i section 11.3). */
function stripLayer(state: SimState): void { const e = state.enemy; e.shieldLayers--; e.lastHitTick = state.tick; e.shieldRecharge = 0; state.telemetry.shieldHits++; state.telemetry.hits++; }

/** Fire the loot weapon in extra slot k (spec Loop-iii section 1): a full charge (and for the missile pod a torpedo in stock); the ion cannon cannot target debris. One rng.combat draw per shot; a volley stops once its target is gone. Returns whether any shot hit. */
function fireLoot(state: SimState, wpn: number, c: number, k: number): boolean {
  const w = state.weapons, id = w.slot[k]!;
  if (!id || w.charge2[k]! < 1) return false;
  const d = weaponDef(id), enemy = isEnemySlot(c);
  if (d.kind === 'ion' && !enemy) return false;
  if (d.kind === 'missile') { if (w.torpedoStock <= 0) return false; w.torpedoStock -= 1; }
  w.charge2[k] = 0;
  const output = stationOutput(state, wpn), e = state.enemy;
  let any = false, last = 0;
  for (let n = 0; n < d.shots; n++) {
    if (enemy ? !e.present : !state.debris.active[c]) break;   // the first shot destroyed it: no further draw
    const u = nextFloat(state.rng.combat); state.telemetry.shots++;
    const layerUp = enemy && enemySysUp(state, EnemySystem.Shields) && e.shieldLayers > 0;
    let result = 0;   // 0 miss, 1 stripped, 2 hit
    if (d.kind === 'laser') {
      if (enemy) {
        const locked = lockActive(state), tuned = !layerUp || locked;   // the beam's tuning rules with no frequency of its own (spec Loop-iii section 1)
        const hit = u < enemyBeamThreshold(state, output) + (locked && layerUp ? LOCK_HIT_BONUS : 0);
        if (locked) state.telemetry.lockedShots++;
        result = hit ? (tuned ? 2 : 1) : 0;
      } else result = beamHits(u, output, false) ? 2 : 0;   // an untuned beam against debris
    } else if (d.kind === 'ion') result = torpedoHits(u, output) ? (layerUp ? 1 : 2) : 0;
    else result = torpedoHits(u, output) ? 2 : 0;   // the missile: homing, ignores shields
    if (result === 1) stripLayer(state);
    else if (result === 2) {
      state.telemetry.hits++;
      if (d.kind === 'ion') { const sys = enemySystemOf(c); if (sys >= 0) e.ionUntil[sys] = state.tick + ION_SECONDS * TICK_HZ; }   // no layer up: a system row is disabled, the hull row takes nothing
      else if (enemy) { startEnemyProblem(state, c); damageEnemy(state, c, d.damage); }
      else removeDebris(state, c);
    }
    if (result) any = true;
    last = result;
  }
  w.lastShotTick = state.tick; w.lastShotTarget = c; w.lastShotResult = last; w.lastShotKind = d.kind === 'missile' ? 1 : 0;
  state.skills.lastShotTick = state.tick; addXp(state, state.stations.occupant[wpn]!, Skill.Weapons, XP_PER_SHOT);
  return any;   // as the beam: true on a hit or a strip
}

/** Fire the selected weapon at the cursor's object. Beam needs a full charge, torpedo a loaded tube; one rng.combat draw; an untuned beam hit on a shielded enemy strips a layer instead of damaging; the readiness resets either way. */
export function fireWeapon(state: SimState): boolean {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!, db = state.debris, w = state.weapons;
  if (wpn < 0 || !stationOnline(state, wpn) || state.stations.occupant[wpn]! < 0) return false;
  const c = state.stations.cursor[wpn]!;
  if (c < 0 || !isTarget(state, c)) return false;
  const k = slotOfSelector(w.selector);
  if (k >= 0) return fireLoot(state, wpn, c, k);
  const enemy = isEnemySlot(c), output = stationOutput(state, wpn);
  let hit = false, stripped = false;
  if (w.selector === Weapon.Torpedo) {
    if (!w.torpedoLoaded) return false;
    hit = torpedoHits(nextFloat(state.rng.combat), output);                      // homing: no shield, no evasion
    w.torpedoLoaded = 0;                                                       // the stock was spent when the tube loaded
  } else {
    if (w.charge < 1) return false;
    w.charge = 0;
    const u = nextFloat(state.rng.combat);                                         // one combat draw for every beam (spec Demo-i section 11.3: the absorbed-without-a-roll rule is gone)
    if (enemy) {
      const e = state.enemy, layerUp = enemySysUp(state, EnemySystem.Shields) && e.shieldLayers > 0, locked = lockActive(state);
      const tuned = !layerUp || locked || w.selector + 1 === e.shieldFreq;            // spec Coop-i amendment C1: the lock and the selector matter only while a layer is up
      hit = u < enemyBeamThreshold(state, output) + (locked && layerUp ? LOCK_HIT_BONUS : 0); stripped = hit && !tuned;
      if (locked) state.telemetry.lockedShots++;
    } else hit = beamHits(u, output, w.selector + 1 === db.frequency[c]);   // the true frequency decides against debris, scanned or not
  }
  w.lastShotTick = state.tick; w.lastShotTarget = c; w.lastShotResult = stripped ? 1 : hit ? 2 : 0; w.lastShotKind = w.selector === Weapon.Torpedo ? 1 : 0;   // for the renderer's bolt, before a kill retargets the cursor (spec Demo-viii section 2, amendment A5)
  state.skills.lastShotTick = state.tick; state.telemetry.shots++; addXp(state, state.stations.occupant[wpn]!, Skill.Weapons, XP_PER_SHOT);
  if (stripped) stripLayer(state);   // an untuned hit strips a layer and nothing else
  else if (hit) {
    state.telemetry.hits++;
    if (enemy) { startEnemyProblem(state, c); damageEnemy(state, c, w.selector === Weapon.Torpedo ? ENEMY_TORP_DAMAGE : ENEMY_BEAM_DAMAGE); } else removeDebris(state, c);
  }
  return hit;
}

/** Seated Weapons input: Up/Down cycle warned targets, Left/Right cycle the selector list with wrap, Confirm fires. */
export function weaponsInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  cycleTarget(state, i, dir);
  if (dir === Dir.Left || dir === Dir.Right) {
    const list = selectorList(state), n = list.length, at = list.indexOf(state.weapons.selector);
    state.weapons.selector = list[at < 0 ? 0 : (at + (dir === Dir.Left ? n - 1 : 1)) % n]!;
  }
  if (confirm) fireWeapon(state);
}
