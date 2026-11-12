import type { SimState } from './state';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { cycleTarget, ENEMY_SLOT, isEnemySlot } from './debrisTargets';
import { DT, SCAN_TIME, LOCK_SECONDS, TICK_HZ } from './tuning';
import { lockActive } from './enemy';

/** A lock is possible (spec Coop-i section 1): Science online with the cursor on the scanned enemy's hull row and no lock running. */
export function canLock(state: SimState, i: number): boolean {
  const e = state.enemy;
  return stationOnline(state, i) && state.stations.cursor[i] === ENEMY_SLOT && e.present === 1 && e.scanned === 1 && !lockActive(state);
}

/** Seated Science input: Up/Down cycle warned targets; Confirm starts a scan of the selected unscanned object or of the enemy hull row (spec 2b-ii section 4, Combat-ii section 5). */
export function scienceInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  cycleTarget(state, i, dir);
  if (!confirm) return;
  const c = state.stations.cursor[i]!, db = state.debris, e = state.enemy;
  if (c < 0) return;
  if (isEnemySlot(c)) {
    if (c === ENEMY_SLOT && e.present && !e.scanned) state.science.scanning = 1;   // only the hull row scans the ship (spec Combat-ii section 5)
    else if (canLock(state, i)) e.lockUntilTick = state.tick + LOCK_SECONDS * TICK_HZ;   // scanned: Confirm locks the frequency for Weapons (spec Coop-i section 1)
    return;
  }
  if (db.active[c] && db.warned[c] && !db.scanned[c]) state.science.scanning = 1;
}

/** Once per tick: the running scan progresses while Science is online and occupied and its cursor is an unscanned warned object or the unscanned enemy hull row. */
export function scanStep(state: SimState): void {
  if (!state.science.scanning) return;
  const sci = state.derived.stationOfKind[StationKind.Science]!;
  if (sci < 0 || !stationOnline(state, sci) || state.stations.occupant[sci]! < 0) return;
  const c = state.stations.cursor[sci]!, db = state.debris, e = state.enemy;
  if (c < 0) return;
  if (isEnemySlot(c)) {
    if (c !== ENEMY_SLOT || !e.present || e.scanned) return;
    e.scan = Math.min(1, e.scan + DT * stationOutput(state, sci) / SCAN_TIME);
    if (e.scan >= 1) { e.scanned = 1; state.science.scanning = 0; }
    return;
  }
  if (!db.active[c] || !db.warned[c] || db.scanned[c]) return;
  db.scan[c] = Math.min(1, db.scan[c]! + DT * stationOutput(state, sci) / SCAN_TIME);
  if (db.scan[c]! >= 1) { db.scanned[c] = 1; state.science.scanning = 0; }
}
