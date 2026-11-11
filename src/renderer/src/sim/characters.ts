import type { SimState } from './state';
import { Skill, xpIndex } from './skillIds';
import { XP_THRESHOLDS, TRAIT_REPAIR_MULT, TRAIT_SLOW_SPEED, TRAIT_FAST_SPEED, TRAIT_COOLING_BONUS, TRAIT_FIRE_DAMAGE, TRAIT_O2_DAMAGE, TRAIT_XP_MULT, TRAIT_BLEEDOUT } from './tuning';

export const Asset = { None: 0, QuickHands: 1, CoolHead: 2, IronLungs: 3, Sprinter: 4 } as const;
export const Complication = { None: 0, HeavyBoots: 1, Flammable: 2, SlowLearner: 3, Frail: 4 } as const;
export const ASSET_NAMES = ['', 'Quick Hands', 'Cool Head', 'Iron Lungs', 'Sprinter'] as const;
export const COMPLICATION_NAMES = ['', 'Heavy Boots', 'Flammable', 'Slow Learner', 'Frail'] as const;

export interface Character { name: string; asset: number; complication: number; headStart: readonly { skill: number; level: number }[] }

/** The pre-made crew (spec 3-ii section 3). Index 4, Recruit, is the trait-free baseline used by tests and by any slot beyond the default list. */
export const CHARACTERS: readonly Character[] = [
  { name: 'Okoro', asset: Asset.QuickHands, complication: Complication.HeavyBoots, headStart: [{ skill: Skill.Repair, level: 3 }] },
  { name: 'Lindqvist', asset: Asset.CoolHead, complication: Complication.Flammable, headStart: [{ skill: Skill.Engineering, level: 3 }] },
  { name: 'Reyes', asset: Asset.IronLungs, complication: Complication.SlowLearner, headStart: [{ skill: Skill.Science, level: 2 }, { skill: Skill.Navigation, level: 1 }] },
  { name: 'Dubois', asset: Asset.Sprinter, complication: Complication.Frail, headStart: [{ skill: Skill.Weapons, level: 3 }] },
  { name: 'Recruit', asset: Asset.None, complication: Complication.None, headStart: [] }
];
export const RECRUIT = 4;
export const DEFAULT_CHARACTERS: readonly number[] = [0, 1, 2, 3];

export function characterOf(state: SimState, pid: number): Character {
  return CHARACTERS[state.crewCharacter[pid]!] ?? CHARACTERS[RECRUIT]!;
}

export function repairTraitMult(state: SimState, pid: number): number { return characterOf(state, pid).asset === Asset.QuickHands ? TRAIT_REPAIR_MULT : 1; }
export function speedMult(state: SimState, pid: number): number {
  const c = characterOf(state, pid);
  return c.asset === Asset.Sprinter ? TRAIT_FAST_SPEED : c.complication === Complication.HeavyBoots ? TRAIT_SLOW_SPEED : 1;
}
export function fireDamageMult(state: SimState, pid: number): number { return characterOf(state, pid).complication === Complication.Flammable ? TRAIT_FIRE_DAMAGE : 1; }
export function o2DamageMult(state: SimState, pid: number): number { return characterOf(state, pid).asset === Asset.IronLungs ? TRAIT_O2_DAMAGE : 1; }
export function xpMult(state: SimState, pid: number): number { return characterOf(state, pid).complication === Complication.SlowLearner ? TRAIT_XP_MULT : 1; }
export function coolingTraitBonus(state: SimState, pid: number): number { return characterOf(state, pid).asset === Asset.CoolHead ? TRAIT_COOLING_BONUS : 0; }
export function bleedoutMult(state: SimState, pid: number): number { return characterOf(state, pid).complication === Complication.Frail ? TRAIT_BLEEDOUT : 1; }

/** Write each crew member's head-start levels as XP, once, at creation. Not scaled by Slow Learner. */
export function applyHeadStarts(state: SimState): void {
  for (let pid = 0; pid < state.playerCount; pid++) for (const h of characterOf(state, pid).headStart) state.skills.xp[xpIndex(pid, h.skill)] = XP_THRESHOLDS[h.level]!;
}
