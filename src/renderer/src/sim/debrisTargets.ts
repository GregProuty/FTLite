import type { TargetRef } from '../net/contracts';
import type { SimState } from './state';
import { DEBRIS_SLOTS } from './tuning';

/** The enemy's five rooms as target slots (spec Demo-x-c section 4): ENEMY_SLOT is the Hold (the old hull row: hull damage only) and the ship as a whole for Science; then one slot per system room. Never indices into the debris arrays. */
export const ENEMY_SLOT = DEBRIS_SLOTS, ENEMY_WEAPONS_SLOT = DEBRIS_SLOTS + 1, ENEMY_ENGINES_SLOT = DEBRIS_SLOTS + 2, ENEMY_SHIELDS_SLOT = DEBRIS_SLOTS + 3, ENEMY_PILOTING_SLOT = DEBRIS_SLOTS + 4;
export const ENEMY_HOLD_SLOT = ENEMY_SLOT;
/** The enemy's rooms in on-screen order, top to bottom (spec Demo-x-c section 4): Hold, Weapons, Piloting, Engines, Shields. The Hold comes first, so the first enemy slot is always ENEMY_SLOT. */
export const ENEMY_SLOTS: readonly number[] = [ENEMY_HOLD_SLOT, ENEMY_WEAPONS_SLOT, ENEMY_PILOTING_SLOT, ENEMY_ENGINES_SLOT, ENEMY_SHIELDS_SLOT];
export function isEnemySlot(slot: number): boolean { return slot >= DEBRIS_SLOTS; }
/** EnemySystem index of a system room's slot; -1 for the Hold. */
export function enemySystemOf(slot: number): number { return slot - DEBRIS_SLOTS - 1; }
/** EnemyRoom index of an enemy slot: a system room shares its system's index; the Hold is room 4. */
export function enemyRoomOfSlot(slot: number): number { const sys = enemySystemOf(slot); return sys >= 0 ? sys : 4; }
/** The slot targeting an enemy room. */
export function slotOfEnemyRoom(room: number): number { return room === 4 ? ENEMY_HOLD_SLOT : DEBRIS_SLOTS + 1 + room; }
export function targetStableId(state: SimState, slot: number): number { return isEnemySlot(slot) ? state.enemy.stableId : state.debris.stableId[slot]!; }
/** A slot the consoles may act on: a warned active object, or the present enemy. */
export function isTarget(state: SimState, slot: number): boolean {
  if (isEnemySlot(slot)) return state.enemy.present === 1;
  return state.debris.active[slot] === 1 && state.debris.warned[slot] === 1;
}

/** Warned, active debris slots in ascending StableId: the target order shared by Weapons and Science (spec 2a-ii section 5). A present enemy adds its five rooms in on-screen order for Weapons (spec Demo-x-c section 4), or the ship alone (ENEMY_SLOT) for Science (`rooms` false). Pure over state.debris. */
export function warnedTargets(state: SimState, rooms = true): number[] {
  const db = state.debris, out: number[] = [];
  for (let k = 0; k < db.active.length; k++) if (db.active[k] && db.warned[k]) out.push(k);
  if (state.enemy.present) out.push(...(rooms ? ENEMY_SLOTS : [ENEMY_SLOT]));
  const rank = (k: number): number => (isEnemySlot(k) ? DEBRIS_SLOTS + ENEMY_SLOTS.indexOf(k) : k);
  return out.sort((a, b) => targetStableId(state, a) - targetStableId(state, b) || rank(a) - rank(b));
}

/** The warned slot with the smallest StableId above `afterStableId`, else the smallest overall, else -1. `exclude` slot(s) are ignored (used while removing the enemy). */
export function nextTarget(state: SimState, afterStableId: number, exclude: number | readonly number[] = -1): number {
  const ex = typeof exclude === 'number' ? [exclude] : exclude, list = warnedTargets(state).filter((k) => !ex.includes(k));
  if (!list.length) return -1;
  for (const k of list) if (targetStableId(state, k) > afterStableId) return k;
  return list[0]!;
}

/** Resolve identity before accessing a pool slot; enemy rooms are bounded separately. */
export function resolveTarget(state: SimState, ref: TargetRef): number | null {
  if (ref.kind === 'enemy') return state.enemy.present && state.enemy.stableId === ref.stableId && Number.isInteger(ref.room) && ref.room >= 0 && ref.room < 5 ? slotOfEnemyRoom(ref.room) : null;
  const slot = state.debris.stableId.findIndex(id => id === ref.stableId);
  return slot >= 0 && isTarget(state, slot) ? slot : null;
}
/** Pure slot-to-identity conversion for published rows and authoritative lifecycle transitions. */
export function targetRef(state: SimState, slot: number): TargetRef | null {
  if (slot < 0) return null;
  return isEnemySlot(slot) ? { kind: 'enemy', stableId: state.enemy.stableId, room: enemyRoomOfSlot(slot) } : { kind: 'object', stableId: state.debris.stableId[slot]! };
}
export function weaponsTargetSlot(state: SimState): number { return state.weapons.target ? resolveTarget(state, state.weapons.target) ?? -1 : -1; }

export function scienceTargetSlot(state: SimState): number { return state.science.target ? resolveTarget(state, state.science.target) ?? -1 : -1; }
