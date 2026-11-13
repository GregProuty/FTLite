import type { SimState } from './state';
import { spendScrap } from './scrap';
import { HULL_MAX, TORP_CAP, SHOP_HULL, SHOP_HULL_COST, SHOP_TORPEDOES, SHOP_TORPEDOES_COST, SHOP_FUEL, FUEL_COST } from './tuning';
import { weaponDef } from './weaponDefs';
import { grantWeapon, hasRoomForWeapon } from './weapons';

export const SHOP_ITEM_COUNT = 3;   // hull, torpedoes, fuel: upgrades are bought at the Engineering console (spec Loop-ii section 3)
const FUEL_ITEM = 2;
/** The offered weapon's item index (spec Loop-iii section 3): listed after the fuel while run.shopWeapon holds one. */
export const WEAPON_ITEM = 3;

export function itemLabel(state: SimState, i: number): string {
  if (i === 0) return `Hull +${SHOP_HULL} (${SHOP_HULL_COST} scrap)`;
  if (i === 1) return `Torpedoes +${SHOP_TORPEDOES} (${SHOP_TORPEDOES_COST} scrap)`;
  if (i === WEAPON_ITEM) { const d = weaponDef(state.run.shopWeapon); return `${d.name} (${d.price} scrap)`; }
  return `Fuel +${SHOP_FUEL} (${FUEL_COST} scrap)`;
}
export function itemEnabled(state: SimState, i: number): boolean {
  const scrap = state.run.scrap;
  if (i === 0) return scrap >= SHOP_HULL_COST && state.hull < HULL_MAX;
  if (i === 1) return scrap >= SHOP_TORPEDOES_COST && state.weapons.torpedoStock < TORP_CAP;
  if (i === WEAPON_ITEM) return state.run.shopWeapon > 0 && scrap >= weaponDef(state.run.shopWeapon).price && hasRoomForWeapon(state);   // a full ship cannot buy only to sell (amendment W3)
  return i === FUEL_ITEM && scrap >= FUEL_COST;
}
/** Buy item i if enabled (spec Run-ii section 8, Loop-iii section 3). No draws. */
export function buy(state: SimState, i: number): void {
  if (!itemEnabled(state, i)) return;
  if (i === 0) { spendScrap(state, SHOP_HULL_COST); state.hull = Math.min(HULL_MAX, state.hull + SHOP_HULL); }
  else if (i === 1) { spendScrap(state, SHOP_TORPEDOES_COST); state.weapons.torpedoStock = Math.min(TORP_CAP, state.weapons.torpedoStock + SHOP_TORPEDOES); }
  else if (i === WEAPON_ITEM) { const id = state.run.shopWeapon; spendScrap(state, weaponDef(id).price); state.run.shopWeapon = 0; grantWeapon(state, id, true); }
  else { spendScrap(state, FUEL_COST); state.run.fuel += SHOP_FUEL; }
  state.telemetry.purchases++;
}
