import type { SimState } from './state';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { cycleTarget, ENEMY_SLOT, isEnemySlot } from './debrisTargets';
import { DT, SCAN_TIME } from './tuning';

/** Seated Science input: Up/Down cycle warned targets; Confirm starts a scan of the selected unscanned object (spec 2b-ii section 4). */
export function scienceInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  cycleTarget(state, i, dir);
  if (!confirm) return;
  const c = state.stations.cursor[i]!, db = state.debris;
  if (c === ENEMY_SLOT) { if (state.enemy.present && !state.enemy.scanned) state.science.scanning = 1; return; }   // the hull row scans the ship (scanStep gains its path in Task 2)
  if (c >= 0 && !isEnemySlot(c) && db.active[c] && db.warned[c] && !db.scanned[c]) state.science.scanning = 1;
}

/** Once per tick: the running scan progresses while Science is online and occupied and its cursor is a warned, unscanned object. */
export function scanStep(state: SimState): void {
  if (!state.science.scanning) return;
  const sci = state.derived.stationOfKind[StationKind.Science]!;
  if (sci < 0 || !stationOnline(state, sci) || state.stations.occupant[sci]! < 0) return;
  const c = state.stations.cursor[sci]!, db = state.debris;
  if (c < 0 || isEnemySlot(c) || !db.active[c] || !db.warned[c] || db.scanned[c]) return;
  db.scan[c] = Math.min(1, db.scan[c]! + DT * stationOutput(state, sci) / SCAN_TIME);
  if (db.scan[c]! >= 1) { db.scanned[c] = 1; state.science.scanning = 0; }
}
