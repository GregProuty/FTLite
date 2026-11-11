import type { SimState } from './state';
import { Dir } from './dir';
import { DEBRIS_SLOTS } from './tuning';

export const ENEMY_SLOT = DEBRIS_SLOTS, ENEMY_WEAPONS_SLOT = DEBRIS_SLOTS + 1, ENEMY_ENGINES_SLOT = DEBRIS_SLOTS + 2, ENEMY_SHIELDS_SLOT = DEBRIS_SLOTS + 3;
/** Hull, weapons, engines, shields: four rows of one enemy (spec Combat-ii section 6). Never indices into the debris arrays. */
export const ENEMY_SLOTS: readonly number[] = [ENEMY_SLOT, ENEMY_WEAPONS_SLOT, ENEMY_ENGINES_SLOT, ENEMY_SHIELDS_SLOT];
export function isEnemySlot(slot: number): boolean { return slot >= DEBRIS_SLOTS; }
/** EnemySystem index of a subsystem slot; -1 for the hull row. */
export function enemySystemOf(slot: number): number { return slot - DEBRIS_SLOTS - 1; }
export function targetStableId(state: SimState, slot: number): number { return isEnemySlot(slot) ? state.enemy.stableId : state.debris.stableId[slot]!; }
/** A slot the consoles may act on: a warned active object, or the present enemy. */
export function isTarget(state: SimState, slot: number): boolean {
  if (isEnemySlot(slot)) return state.enemy.present === 1;
  return state.debris.active[slot] === 1 && state.debris.warned[slot] === 1;
}

/** Warned, active debris slots in ascending StableId: the target order shared by Weapons and Science (spec 2a-ii section 5). Pure over state.debris. */
export function warnedTargets(state: SimState): number[] {
  const db = state.debris, out: number[] = [];
  for (let k = 0; k < db.active.length; k++) if (db.active[k] && db.warned[k]) out.push(k);
  if (state.enemy.present) out.push(...ENEMY_SLOTS);
  return out.sort((a, b) => targetStableId(state, a) - targetStableId(state, b) || a - b);
}

/** The warned slot with the smallest StableId above `afterStableId`, else the smallest overall, else -1. `exclude` slot(s) are ignored (used while removing the enemy). */
export function nextTarget(state: SimState, afterStableId: number, exclude: number | readonly number[] = -1): number {
  const ex = typeof exclude === 'number' ? [exclude] : exclude, list = warnedTargets(state).filter((k) => !ex.includes(k));
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
