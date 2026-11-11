import type { SimState } from './state';
import { Dir } from './dir';

/** Warned, active debris slots in ascending StableId: the Weapons target order (spec 2a-ii section 5). Pure over state.debris. */
export function warnedTargets(state: SimState): number[] {
  const db = state.debris, out: number[] = [];
  for (let k = 0; k < db.active.length; k++) if (db.active[k] && db.warned[k]) out.push(k);
  return out.sort((a, b) => db.stableId[a]! - db.stableId[b]!);
}

/** The warned slot with the smallest StableId above `afterStableId`, else the smallest overall, else -1. `excludeSlot` is ignored (used while removing it). */
export function nextTarget(state: SimState, afterStableId: number, excludeSlot = -1): number {
  const db = state.debris, list = warnedTargets(state).filter((k) => k !== excludeSlot);
  if (!list.length) return -1;
  for (const k of list) if (db.stableId[k]! > afterStableId) return k;
  return list[0]!;
}

/** Up/Down cycle the warned targets by StableId with wrap; with none the cursor is -1. Shared by Weapons and Science (spec 2b-ii section 4). */
export function cycleTarget(state: SimState, i: number, dir: number): void {
  const list = warnedTargets(state), c = state.stations.cursor;
  if (!list.length) { c[i] = -1; return; }
  if (dir !== Dir.Up && dir !== Dir.Down) return;
  const k = list.indexOf(c[i]!), n = list.length;
  c[i] = list[k < 0 ? 0 : dir === Dir.Up ? (k + n - 1) % n : (k + 1) % n]!;
}
