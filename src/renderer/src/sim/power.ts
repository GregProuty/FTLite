import type { SimState } from './state';
import { StationKind, STATION_COUNT } from './stationKinds';
import { STATION_MAX, STATION_OVERDRIVE, BONUS_BAR_LEVELS, UPGRADE_MAX, UPGRADE_BASE, UPGRADE_STEP, REACTOR_BONUS_MAX, REACTOR_BASE, REACTOR_STEP } from './tuning';
import { spendScrap } from './scrap';
import { releaseOffline, stationOnline } from './stations';
import { Life, LifeState } from './components';
import { Skill, skillLevelOf } from './skills';

export function powerUsed(state: SimState): number { let t = 0; for (const v of state.stations.level) t += v; return t; }
export function powerCapacity(state: SimState): number { return state.power.capacity + bonusBars(state); }
export function powerPool(state: SimState): number { return powerCapacity(state) - powerUsed(state); }

/** Power failure: offline until repaired. Bars return to the pool except Engineering's, which keeps its level frozen (spec §5). */
export function failStation(state: SimState, i: number): void {
  state.stations.failed[i] = 1; state.stations.repair[i] = 0;
  if (state.derived.stationKind[i] !== StationKind.Engineering) state.stations.level[i] = 0;
  releaseOffline(state, i);   // a console group keeps its officer while another member is online (spec Demo-x-a section 1)
  shedPower(state);                                                   // an Engineering failure drops bonus bars; a no-op elsewhere
}

/** Repair complete: Engineering comes back at its kept level (>= 1); any other station comes back at one bar when the pool has one (read after failed clears), else level 0 (spec Demo-ii section 3). */
export function repairStation(state: SimState, i: number): void {
  state.stations.failed[i] = 0; state.stations.repair[i] = 0;
  if (state.derived.stationKind[i] !== StationKind.Engineering) state.stations.level[i] = powerPool(state) >= 1 ? 1 : 0;
}

/** Base bars a station kind may hold: STATION_MAX plus the bought levels (spec Run-ii section 8, Loop-ii section 1). */
export function baseMax(state: SimState, kind: number): number { return STATION_MAX[kind]! + state.run.upgrades[kind]!; }
/** Highest level a station may hold: the base plus the overdrive bar for every kind except Engineering (spec 2b-i section 4). */
export function maxLevel(state: SimState, kind: number): number { return baseMax(state, kind) + (kind === StationKind.Engineering ? 0 : STATION_OVERDRIVE); }

/** Explicit target station index, independent of any card selection. Engineering operator moves one bar to (+1) or from (-1) station i. Returns whether the allocation changed. */
export function shiftBar(state: SimState, i: number, delta: 1 | -1): boolean {
  const d = state.derived, eng = d.stationOfKind[StationKind.Engineering]!;
  if (state.stations.failed[eng]) return false;                       // allocations frozen while Engineering is failed
  if (state.stations.failed[i]) return false;
  const kind = d.stationKind[i]!, level = state.stations.level[i]!;
  if (delta > 0) {
    if (level >= maxLevel(state, kind) || powerPool(state) <= 0) return false;
    state.stations.level[i] = level + 1; return true;
  }
  const floor = kind === StationKind.Engineering ? 1 : 0;
  if (level <= floor) return false;
  state.stations.level[i] = level - 1;
  if (level - 1 === 0) releaseOffline(state, i);
  return true;
}

/** Bonus bars from a Conscious operator seated at an online Engineering: one per BONUS_BAR_LEVELS Engineering levels (spec 3-i section 7). */
export function bonusBars(state: SimState): number {
  const eng = state.derived.stationOfKind[StationKind.Engineering]!;
  if (eng < 0 || !stationOnline(state, eng)) return 0;
  const occ = state.stations.occupant[eng]!;
  if (occ < 0 || Life.state[state.crew[occ]!] !== LifeState.Conscious) return 0;
  return Math.floor(skillLevelOf(state, occ, Skill.Engineering) / BONUS_BAR_LEVELS);
}

/** Shedding order when capacity falls below allocation: shed first to last; Engineering never below 1 (spec 3-i section 7). */
export const SHED_ORDER = [StationKind.Doors, StationKind.Medbay, StationKind.Science, StationKind.Weapons, StationKind.Navigation, StationKind.LifeSupport, StationKind.Engineering] as const;

/** Bring usage back under capacity one bar at a time in SHED_ORDER. Writes levels directly: the one exception to the frozen-while-failed rule. No-op when usage already fits. */
export function shedPower(state: SimState): void {
  const d = state.derived;
  while (powerUsed(state) > powerCapacity(state)) {
    let shed = false;
    for (const kind of SHED_ORDER) {
      const i = d.stationOfKind[kind]!;
      if (i < 0) continue;
      const floor = kind === StationKind.Engineering ? 1 : 0, level = state.stations.level[i]!;
      if (level <= floor) continue;
      state.stations.level[i] = level - 1;
      if (level - 1 === 0) releaseOffline(state, i);
      shed = true; break;
    }
    if (!shed) return;                                                // nothing above its floor: the reserved Engineering bar stays
  }
}

/** run.boughtKind (and the Upgrades page row) for a reactor bar; a station kind otherwise (spec Loop-ii rule U2). */
export const REACTOR_ROW = STATION_COUNT;
/** The Upgrades page's BACK row, after the reactor. */
export const BACK_ROW = STATION_COUNT + 1;
/** Upgradeable kinds in StationKind order, Engineering excluded: its level drives no output (spec Run-ii section 8, Loop-ii amendment A1). */
export const UPGRADE_KINDS = [StationKind.Navigation, StationKind.Weapons, StationKind.Science, StationKind.LifeSupport, StationKind.Medbay, StationKind.Doors] as const;
/** The next level's price with `owned` levels bought (spec Loop-ii section 1): 30, 45, 60. */
export function upgradePrice(owned: number): number { return UPGRADE_BASE + UPGRADE_STEP * owned; }
/** The next reactor bar's price with `owned` bars bought: 25 to 65. */
export function reactorPrice(owned: number): number { return REACTOR_BASE + REACTOR_STEP * owned; }
/** A kind can be raised when it is upgradeable, on the ship, below UPGRADE_MAX and the crew has the scrap. */
export function canUpgrade(state: SimState, kind: number): boolean {
  if (!(UPGRADE_KINDS as readonly number[]).includes(kind) || state.derived.stationOfKind[kind]! < 0) return false;
  const owned = state.run.upgrades[kind]!; return owned < UPGRADE_MAX && state.run.scrap >= upgradePrice(owned);
}
export function canBuyReactor(state: SimState): boolean { const owned = state.run.reactorBonus; return owned < REACTOR_BONUS_MAX && state.run.scrap >= reactorPrice(owned); }
/** Buy the next level of a kind: it takes effect at once (spec Loop-ii section 1). No draws. Returns whether it was bought. */
export function buyUpgrade(state: SimState, kind: number): boolean {
  if (!canUpgrade(state, kind)) return false;
  spendScrap(state, upgradePrice(state.run.upgrades[kind]!)); state.run.upgrades[kind] = state.run.upgrades[kind]! + 1;
  state.telemetry.purchases++; state.run.boughtTick = state.tick; state.run.boughtKind = kind; return true;
}
/** Buy a reactor bar: capacity + 1, the bar arrives unpowered in the pool (spec Loop-ii rule U1). No draws. */
export function buyReactor(state: SimState): boolean {
  if (!canBuyReactor(state)) return false;
  spendScrap(state, reactorPrice(state.run.reactorBonus)); state.run.reactorBonus++; state.power.capacity++;
  state.telemetry.purchases++; state.run.boughtTick = state.tick; state.run.boughtKind = REACTOR_ROW; return true;
}/** The Upgrades page's rows as cursor values (spec Loop-ii rule U2): the upgradeable kinds on the ship, then REACTOR_ROW, then BACK_ROW. */
export function upgradeRows(state: SimState): number[] { return [...UPGRADE_KINDS.filter((k) => state.derived.stationOfKind[k]! >= 0), REACTOR_ROW, BACK_ROW]; }
