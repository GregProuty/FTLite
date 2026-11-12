import type { SimState } from './state';
import type { TelemetryRecord } from './telemetry';
import { Skill, xpIndex } from './skillIds';
import { characterOf } from './characters';
import { addScrap } from './scrap';
import { XP_THRESHOLDS, SKILL_MAX, TORP_CAP, UNLOCK_SCRAP, UNLOCK_TORPEDOES } from './tuning';

export interface Progress { version: 1; runs: number; victories: number; bestScore: number; bestNodes: number; unlocked: string[] }
export const EMPTY_PROGRESS: Progress = { version: 1, runs: 0, victories: 0, bestScore: 0, bestNodes: 0, unlocked: [] };
/** Unlocks in display and application order (spec Run-iii section 4). */
export const UNLOCKS: readonly { id: string; name: string; earned: (p: Progress) => boolean }[] = [
  { id: 'scrap-reserve', name: 'Scrap reserve', earned: (p) => p.runs >= 1 },
  { id: 'torpedo-rack', name: 'Torpedo rack', earned: (p) => p.bestNodes >= 4 },
  { id: 'veteran-crew', name: 'Veteran crew', earned: (p) => p.victories >= 1 }
];
export function unlockNames(ids: readonly string[]): string[] { return UNLOCKS.filter((u) => ids.includes(u.id)).map((u) => u.name); }
/** Count a finished run and append the newly earned unlocks, in UNLOCKS order. Pure. */
export function applyRun(p: Progress, r: TelemetryRecord): Progress {
  const next: Progress = { version: 1, runs: p.runs + 1, victories: p.victories + (r.endReason === 'victory' ? 1 : 0), bestScore: Math.max(p.bestScore, r.score), bestNodes: Math.max(p.bestNodes, r.run.nodesReached), unlocked: [...p.unlocked] };
  next.unlocked = UNLOCKS.filter((u) => next.unlocked.includes(u.id) || u.earned(next)).map((u) => u.id);
  return next;
}
export function veteranRepairXp(headStartLevel: number): number { return XP_THRESHOLDS[Math.min(headStartLevel + 1, SKILL_MAX)]!; }
/** Start bonuses at creation (spec Run-iii section 5), after the head starts; sets run.startBonus. */
export function applyStartBonuses(state: SimState, unlocked: readonly string[]): void {
  let mask = 0;
  UNLOCKS.forEach((u, i) => { if (unlocked.includes(u.id)) mask |= 1 << i; });
  state.run.startBonus = mask;
  if (mask & 1) addScrap(state, UNLOCK_SCRAP);
  if (mask & 2) state.weapons.torpedoStock = Math.min(TORP_CAP, state.weapons.torpedoStock + UNLOCK_TORPEDOES);
  if (mask & 4) for (let pid = 0; pid < state.playerCount; pid++) { const level = characterOf(state, pid).headStart.find((h) => h.skill === Skill.Repair)?.level ?? 0; state.skills.xp[xpIndex(pid, Skill.Repair)] = veteranRepairXp(level); }
}
