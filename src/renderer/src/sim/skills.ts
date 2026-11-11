import type { SimState } from './state';
import { SKILL_MAX, XP_THRESHOLDS, OUTPUT_SLOW, OUTPUT_FAST, REPAIR_SKILL_GAIN } from './tuning';
import { Skill, SKILL_NAMES, xpIndex } from './skillIds';
import { xpMult } from './characters';
export { Skill, SKILL_NAMES, xpIndex };

/** Skill trained and used by each StationKind (foundation section 5): Nav, Wpn, Sci, Eng; Life Support and Doors use Engineering; the Medbay uses Science. */
export const STATION_SKILL = [Skill.Navigation, Skill.Weapons, Skill.Science, Skill.Engineering, Skill.Engineering, Skill.Science, Skill.Engineering] as const;

/** Largest level whose threshold the XP total has reached; table-driven, no transcendental maths. */
export function levelFor(xp: number): number {
  let level = 0;
  while (level < SKILL_MAX && xp >= XP_THRESHOLDS[level + 1]!) level++;
  return level;
}

/** Output multiplier for a skill level: half way between slow and fast at level 0, fast at level 10 (foundation section 5). */
export function skillCurve(level: number): number {
  return OUTPUT_SLOW + (OUTPUT_FAST - OUTPUT_SLOW) * (level + 10) / 20;
}

/** Repair speed multiplier: 1 at level 0, 1.6 at level 10. */
export function repairMult(level: number): number { return 1 + REPAIR_SKILL_GAIN * level; }


export function skillLevelOf(state: SimState, pid: number, skill: number): number {
  return levelFor(state.skills.xp[xpIndex(pid, skill)]!);
}

/** The level of the skill a station kind trains and uses. */
export function skillLevel(state: SimState, pid: number, kind: number): number {
  return skillLevelOf(state, pid, STATION_SKILL[kind]!);
}

/** XP only ever rises (a non-positive amount is ignored), scaled by the crew member's learning trait, capped at the top threshold. */
export function addXp(state: SimState, pid: number, skill: number, amount: number): void {
  if (amount <= 0) return;
  const k = xpIndex(pid, skill);
  state.skills.xp[k] = Math.min(XP_THRESHOLDS[SKILL_MAX]!, state.skills.xp[k]! + amount * xpMult(state, pid));
}
