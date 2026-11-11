import type { SimState } from './state';
import { Dir } from './dir';
import { DEBRIS_SLOTS } from './tuning';

/** The enemy ship's pseudo-slot in the target list (spec Combat-i section 6). Never an index into the debris arrays. */
export const ENEMY_SLOT = DEBRIS_SLOTS;
export function targetStableId(state: SimState, slot: number): number { return slot === ENEMY_SLOT ? state.enemy.stableId : state.debris.stableId[slot]!; }
/** A slot the consoles may act on: a warned active object, or the present enemy. */
export function isTarget(state: SimState, slot: number): boolean {
  if (slot === ENEMY_SLOT) return state.enemy.present === 1;
  return state.debris.active[slot] === 1 && state.debris.warned[slot] === 1;
}

/** Warned, active debris slots in ascending StableId: the target order shared by Weapons and Science (spec 2a-ii section 5). Pure over state.debris. */
export function warnedTargets(state: SimState): number[] {
  const db = state.debris, out: number[] = [];
  for (let k = 0; k < db.active.length; k++) if (db.active[k] && db.warned[k]) out.push(k);
  if (state.enemy.present) out.push(ENEMY_SLOT);
  return out.sort((a, b) => targetStableId(state, a) - targetStableId(state, b));
}

/** The warned slot with the smallest StableId above `afterStableId`, else the smallest overall, else -1. `excludeSlot` is ignored (used while removing it). */
export function nextTarget(state: SimState, afterStableId: number, excludeSlot = -1): number {
  const list = warnedTargets(state).filter((k) => k !== excludeSlot);
  if (!list.length) return -1;
  for (const k of list) if (targetStableId(state, k) > afterStableId) return k;
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
