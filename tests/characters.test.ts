import { describe, it, expect } from 'vitest';
import { CHARACTERS, RECRUIT, DEFAULT_CHARACTERS, Asset, Complication, characterOf, repairTraitMult, speedMult, fireDamageMult, o2DamageMult, xpMult, coolingTraitBonus, bleedoutMult } from '../src/renderer/src/sim/characters';
import { Skill, xpIndex, skillCurve } from '../src/renderer/src/sim/skills';
import { createSimState } from '../src/renderer/src/sim/state';
import { saveSnapshot, loadSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown, stationOutput } from '../src/renderer/src/sim/stations';
import { SKILL_COUNT, XP_THRESHOLDS, STATION_MAX } from '../src/renderer/src/sim/tuning';
import { LAYOUT, makeState, RECRUITS } from './helpers/sim';

describe('character data', () => {
  it('four playable characters with distinct names and traits on different mechanics; Recruit is neutral', () => {
    const playable = CHARACTERS.slice(0, 4);
    expect(new Set(playable.map((c) => c.name)).size).toBe(4);
    for (const c of playable) { expect(c.asset).not.toBe(Asset.None); expect(c.complication).not.toBe(Complication.None); expect(c.headStart.length).toBeGreaterThan(0); }
    expect(new Set(playable.map((c) => c.asset)).size).toBe(4); expect(new Set(playable.map((c) => c.complication)).size).toBe(4);
    const r = CHARACTERS[RECRUIT]!;
    expect(r.name).toBe('Recruit'); expect(r.asset).toBe(Asset.None); expect(r.complication).toBe(Complication.None); expect(r.headStart).toEqual([]);
    expect(DEFAULT_CHARACTERS).toEqual([0, 1, 2, 3]);
  });
  it('trait readers return the neutral value for Recruit and the tuned value for the owner', () => {
    const s = makeState(4, 1, DEFAULT_CHARACTERS), n = makeState(1);
    expect(repairTraitMult(s, 0)).toBe(1.25); expect(repairTraitMult(s, 1)).toBe(1); expect(repairTraitMult(n, 0)).toBe(1);
    expect(speedMult(s, 0)).toBe(0.85); expect(speedMult(s, 3)).toBe(1.2); expect(speedMult(s, 1)).toBe(1); expect(speedMult(n, 0)).toBe(1);
    expect(fireDamageMult(s, 1)).toBe(1.5); expect(fireDamageMult(s, 0)).toBe(1);
    expect(o2DamageMult(s, 2)).toBe(0.5); expect(o2DamageMult(s, 0)).toBe(1);
    expect(xpMult(s, 2)).toBe(0.75); expect(xpMult(s, 0)).toBe(1);
    expect(coolingTraitBonus(s, 1)).toBe(1); expect(coolingTraitBonus(s, 0)).toBe(0);
    expect(bleedoutMult(s, 3)).toBe(0.6); expect(bleedoutMult(s, 0)).toBe(1);
    expect(characterOf(n, 0).name).toBe('Recruit');
  });
});

describe('assignment and head starts', () => {
  it('createSimState assigns the default list, falls back to Recruit beyond it, and writes the exact head-start XP matrix', () => {
    const s = createSimState(LAYOUT, 4, 1);
    expect(Array.from(s.crewCharacter)).toEqual([0, 1, 2, 3]);
    const expected = new Float64Array(4 * SKILL_COUNT);
    expected[xpIndex(0, Skill.Repair)] = XP_THRESHOLDS[3]!; expected[xpIndex(1, Skill.Engineering)] = XP_THRESHOLDS[3]!;
    expected[xpIndex(2, Skill.Science)] = XP_THRESHOLDS[2]!; expected[xpIndex(2, Skill.Navigation)] = XP_THRESHOLDS[1]!;     // Reyes: unscaled by Slow Learner
    expected[xpIndex(3, Skill.Weapons)] = XP_THRESHOLDS[3]!;
    expect(Array.from(s.skills.xp)).toEqual(Array.from(expected));
    const short = createSimState(LAYOUT, 3, 1, [2]);
    expect(Array.from(short.crewCharacter)).toEqual([2, RECRUIT, RECRUIT]);
    const neutral = makeState(2);
    expect(Array.from(neutral.crewCharacter)).toEqual([RECRUIT, RECRUIT]); expect(Array.from(neutral.skills.xp).every((v) => v === 0)).toBe(true);
    expect(RECRUITS).toEqual([4, 4, 4, 4]);
  });
  it('crewCharacter round-trips through a snapshot (a non-default assignment, which the loader cannot recreate) and alone changes the hash', () => {
    const s = makeState(2, 5, [3, 2]);
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(Array.from(t.crewCharacter)).toEqual([3, 2]); expect(hashState(t)).toBe(hashState(s));
    const u = makeState(2, 5, [3, 2]); u.crewCharacter[1] = RECRUIT;                                      // only the assignment byte differs: XP was written at creation for [3, 2]
    expect(Array.from(u.skills.xp)).toEqual(Array.from(s.skills.xp)); expect(hashState(u)).not.toBe(hashState(s));
  });
  it('Dubois seated at Weapons runs it at level 3 output', () => {
    const s = createSimState(LAYOUT, 4, 1), wpn = s.derived.stationOfKind[StationKind.Weapons]!;
    sitDown(s, 3, wpn);
    expect(stationOutput(s, wpn)).toBeCloseTo((2 / STATION_MAX[StationKind.Weapons]!) * skillCurve(3));
  });
});
