import type { SimState } from './state';
import { spendScrap } from './scrap';
import { HULL_MAX, TORP_CAP, SHOP_HULL, SHOP_HULL_COST, SHOP_TORPEDOES, SHOP_TORPEDOES_COST, SHOP_FUEL, FUEL_COST } from './tuning';

export const SHOP_ITEM_COUNT = 3;   // hull, torpedoes, fuel: upgrades are bought at the Engineering console (spec Loop-ii section 3)
const FUEL_ITEM = 2;

export function itemLabel(state: SimState, i: number): string {
  if (i === 0) return `Hull +${SHOP_HULL} (${SHOP_HULL_COST} scrap)`;
  if (i === 1) return `Torpedoes +${SHOP_TORPEDOES} (${SHOP_TORPEDOES_COST} scrap)`;
  return `Fuel +${SHOP_FUEL} (${FUEL_COST} scrap)`;
}
export function itemEnabled(state: SimState, i: number): boolean {
  const scrap = state.run.scrap;
  if (i === 0) return scrap >= SHOP_HULL_COST && state.hull < HULL_MAX;
  if (i === 1) return scrap >= SHOP_TORPEDOES_COST && state.weapons.torpedoStock < TORP_CAP;
  return i === FUEL_ITEM && scrap >= FUEL_COST;
}
/** Buy item i if enabled (spec Run-ii section 8). No draws. */
export function buy(state: SimState, i: number): void {
  if (!itemEnabled(state, i)) return;
  if (i === 0) { spendScrap(state, SHOP_HULL_COST); state.hull = Math.min(HULL_MAX, state.hull + SHOP_HULL); }
  else if (i === 1) { spendScrap(state, SHOP_TORPEDOES_COST); state.weapons.torpedoStock = Math.min(TORP_CAP, state.weapons.torpedoStock + SHOP_TORPEDOES); }
  else { spendScrap(state, FUEL_COST); state.run.fuel += SHOP_FUEL; }
  state.telemetry.purchases++;
}
