import type { SimState } from './state';
import { StationKind, STATION_NAMES } from './stationKinds';
import { spendScrap } from './scrap';
import { HULL_MAX, TORP_CAP, SHOP_HULL, SHOP_HULL_COST, SHOP_TORPEDOES, SHOP_TORPEDOES_COST, SHOP_UPGRADE_COST, SHOP_FUEL, FUEL_COST } from './tuning';

/** Upgradeable kinds in StationKind order, Engineering excluded (spec Run-ii section 8). */
export const UPGRADE_KINDS = [StationKind.Navigation, StationKind.Weapons, StationKind.Science, StationKind.LifeSupport, StationKind.Medbay, StationKind.Doors] as const;
export const SHOP_ITEM_COUNT = 2 + UPGRADE_KINDS.length + 1;   // hull, torpedoes, the upgrades, then fuel (spec Loop-i section 2)
const FUEL_ITEM = SHOP_ITEM_COUNT - 1;
const upgradeKind = (i: number): number => UPGRADE_KINDS[i - 2]!;

export function itemLabel(state: SimState, i: number): string {
  if (i === 0) return `Hull +${SHOP_HULL} (${SHOP_HULL_COST} scrap)`;
  if (i === 1) return `Torpedoes +${SHOP_TORPEDOES} (${SHOP_TORPEDOES_COST} scrap)`;
  if (i === FUEL_ITEM) return `Fuel +${SHOP_FUEL} (${FUEL_COST} scrap)`;
  const k = upgradeKind(i); return `${STATION_NAMES[k]} +1 bar (${state.run.upgrades[k] ? 'owned' : `${SHOP_UPGRADE_COST} scrap`})`;
}
export function itemEnabled(state: SimState, i: number): boolean {
  const scrap = state.run.scrap;
  if (i === 0) return scrap >= SHOP_HULL_COST && state.hull < HULL_MAX;
  if (i === 1) return scrap >= SHOP_TORPEDOES_COST && state.weapons.torpedoStock < TORP_CAP;
  if (i === FUEL_ITEM) return scrap >= FUEL_COST;
  const k = upgradeKind(i); return scrap >= SHOP_UPGRADE_COST && state.run.upgrades[k] === 0 && state.derived.stationOfKind[k]! >= 0;
}
/** Buy item i if enabled (spec Run-ii section 8). No draws. */
export function buy(state: SimState, i: number): void {
  if (!itemEnabled(state, i)) return;
  if (i === 0) { spendScrap(state, SHOP_HULL_COST); state.hull = Math.min(HULL_MAX, state.hull + SHOP_HULL); }
  else if (i === 1) { spendScrap(state, SHOP_TORPEDOES_COST); state.weapons.torpedoStock = Math.min(TORP_CAP, state.weapons.torpedoStock + SHOP_TORPEDOES); }
  else if (i === FUEL_ITEM) { spendScrap(state, FUEL_COST); state.run.fuel += SHOP_FUEL; }
  else { spendScrap(state, SHOP_UPGRADE_COST); state.run.upgrades[upgradeKind(i)] = 1; }
  state.telemetry.purchases++;
}
