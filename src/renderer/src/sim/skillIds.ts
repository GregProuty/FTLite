import { SKILL_COUNT } from './tuning';

export const Skill = { Navigation: 0, Engineering: 1, Weapons: 2, Science: 3, Combat: 4, Repair: 5 } as const;
export const SKILL_NAMES = ['Navigation', 'Engineering', 'Weapons', 'Science', 'Combat', 'Repair'] as const;
export function xpIndex(pid: number, skill: number): number { return pid * SKILL_COUNT + skill; }
