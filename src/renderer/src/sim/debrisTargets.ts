import type { SimState } from './state';

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
