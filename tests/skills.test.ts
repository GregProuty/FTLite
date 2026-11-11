import { describe, it, expect } from 'vitest';
import { Skill, STATION_SKILL, levelFor, skillCurve, repairMult, skillLevel, skillLevelOf, addXp } from '../src/renderer/src/sim/skills';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { stationOutput } from '../src/renderer/src/sim/stations';
import { XP_THRESHOLDS, SKILL_MAX, OUTPUT_SLOW, OUTPUT_FAST, REPAIR_SKILL_GAIN, STATION_MAX } from '../src/renderer/src/sim/tuning';
import { makeState, setSkill } from './helpers/sim';

describe('levels', () => {
  it('levelFor steps at every threshold and caps at SKILL_MAX', () => {
    for (let L = 0; L <= SKILL_MAX; L++) {
      expect(levelFor(XP_THRESHOLDS[L]!)).toBe(L);
      if (L > 0) expect(levelFor(XP_THRESHOLDS[L]! - 1)).toBe(L - 1);
    }
    expect(levelFor(XP_THRESHOLDS[SKILL_MAX]! + 1e6)).toBe(SKILL_MAX);
    expect(levelFor(0)).toBe(0);
  });
  it('addXp accumulates, never decreases and caps at the top threshold', () => {
    const s = makeState(2);
    addXp(s, 1, Skill.Repair, 100); addXp(s, 1, Skill.Repair, 150);
    expect(skillLevelOf(s, 1, Skill.Repair)).toBe(1); expect(skillLevelOf(s, 0, Skill.Repair)).toBe(0);
    addXp(s, 1, Skill.Repair, -50); addXp(s, 1, Skill.Repair, 0);
    expect(s.skills.xp[1 * 6 + Skill.Repair]).toBe(250);                             // never decreases
    addXp(s, 1, Skill.Repair, 1e9);
    expect(s.skills.xp[1 * 6 + Skill.Repair]).toBe(XP_THRESHOLDS[SKILL_MAX]); expect(skillLevelOf(s, 1, Skill.Repair)).toBe(SKILL_MAX);
  });
  it('station kinds map to skills: Life Support and Doors train Engineering, the Medbay trains Science', () => {
    expect(STATION_SKILL[StationKind.LifeSupport]).toBe(Skill.Engineering); expect(STATION_SKILL[StationKind.Doors]).toBe(Skill.Engineering);
    expect(STATION_SKILL[StationKind.Medbay]).toBe(Skill.Science); expect(STATION_SKILL[StationKind.Navigation]).toBe(Skill.Navigation);
    const s = makeState(1);
    setSkill(s, 0, Skill.Engineering, 7);
    expect(skillLevel(s, 0, StationKind.LifeSupport)).toBe(7); expect(skillLevel(s, 0, StationKind.Doors)).toBe(7); expect(skillLevel(s, 0, StationKind.Weapons)).toBe(0);
  });
  it('skillCurve and repairMult at the ends; stationOutput at level 10 reaches level / max x 1.0', () => {
    expect(skillCurve(0)).toBeCloseTo((OUTPUT_SLOW + OUTPUT_FAST) / 2); expect(skillCurve(10)).toBeCloseTo(OUTPUT_FAST);
    expect(repairMult(0)).toBe(1); expect(repairMult(10)).toBeCloseTo(1 + 10 * REPAIR_SKILL_GAIN);
    const s = makeState(1), wpn = s.derived.stationOfKind[StationKind.Weapons]!;
    s.stations.occupant[wpn] = 0;                                                 // seated for the output formula
    expect(stationOutput(s, wpn)).toBeCloseTo((2 / STATION_MAX[StationKind.Weapons]!) * 0.75);
    setSkill(s, 0, Skill.Weapons, 10);
    expect(stationOutput(s, wpn)).toBeCloseTo(2 / STATION_MAX[StationKind.Weapons]!);
  });
});
