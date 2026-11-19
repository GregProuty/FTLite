// W-4 spec §2, §2.1, §13.1: the Hound's loadout (pew pew on a ±60° turret, the autocannon on ±30°, the torpedo, no
// beam), the start power, the slot names, the Valkyrn's and the Hunter's defs untouched, and the gun cooldown bound.
import { describe, expect, it } from 'vitest';
import { AUTOCANNON_INTERVAL_BY_BARS, AUTOCANNON_MAN_INTERVAL_BY_BARS, AUTOCANNON_WEAK_HITS_PER_LAYER, PEW_MAN_GAIN_BY_BARS, START_WEAPON_POWER, trimmedWeaponPower, WeaponSlot } from '../src/renderer/src/sim/tactical/bars';
import { AUTOCANNON, CUTTER_CLASS, GUN, hasTurret, HOUND_PEW, HUNTER_CLASS, HUNTER_PEW, PEW, VALKYRN_CLASS, VALKYRN_LASER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { AUTOCANNON_ROCK_PUSH, AUTOCANNON_ROUNDS_PER_ROCK_HP } from '../src/renderer/src/sim/tactical/rockTuning';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { validateTacticalValues, flattenTactical } from '../src/renderer/src/sim/tactical/hash';
import { AUTOCANNON_ARC_STEPS, AUTOCANNON_AUTO_RANGE, AUTOCANNON_TURRET_TRAVERSE, GUN_AUTO_HEAT_STOP, PEW_ARC_STEPS, PEW_TURRET_TRAVERSE } from '../src/renderer/src/sim/tactical/tuning';

describe("the Hound's loadout (W-4 spec §2)", () => {
  it('pew pew with a ±60° turret, the autocannon (the Valkyrn gun) with a ±30° turret, the torpedo, and no laser', () => {
    expect(CUTTER_CLASS.slots.laser).toBeNull();
    expect(CUTTER_CLASS.slots.gun).toBe(AUTOCANNON);
    expect(CUTTER_CLASS.slots.pew).toBe(HOUND_PEW);
    expect(CUTTER_CLASS.newtonianHelm).toBe(true);
    expect(HOUND_PEW.turret).toEqual({ arcSteps: PEW_ARC_STEPS, traverse: PEW_TURRET_TRAVERSE });
    expect(AUTOCANNON.turret).toEqual({ arcSteps: AUTOCANNON_ARC_STEPS, traverse: AUTOCANNON_TURRET_TRAVERSE });
    expect([AUTOCANNON_ARC_STEPS, PEW_TURRET_TRAVERSE, AUTOCANNON_TURRET_TRAVERSE, AUTOCANNON_AUTO_RANGE, GUN_AUTO_HEAT_STOP]).toEqual([5461, [364, 455], [273, 341], 600, 800]);
    expect(AUTOCANNON.intervalByBars).toEqual([AUTOCANNON_INTERVAL_BY_BARS, AUTOCANNON_MAN_INTERVAL_BY_BARS]);
    expect([...AUTOCANNON_INTERVAL_BY_BARS, ...AUTOCANNON_MAN_INTERVAL_BY_BARS, ...PEW_MAN_GAIN_BY_BARS]).toEqual([0, 10, 8, 6, 5, 0, 8, 7, 5, 4, 0, 7, 10, 14, 18]);
    expect(AUTOCANNON.rock).toEqual({ roundsPerHp: AUTOCANNON_ROUNDS_PER_ROCK_HP, pushPerRound: AUTOCANNON_ROCK_PUSH });
    expect([AUTOCANNON_ROUNDS_PER_ROCK_HP, AUTOCANNON_ROCK_PUSH, AUTOCANNON.weakHitsPerLayer, AUTOCANNON_WEAK_HITS_PER_LAYER]).toEqual([4, 500, 4, 4]);
    const { turret: _t, intervalByBars: _i, rock: _r, weakHitsPerLayer: _w, ...rest } = AUTOCANNON;
    const { turret: _gt, intervalByBars: _gi, rock: _gr, weakHitsPerLayer: _gw, ...gun } = GUN;
    expect(rest).toEqual(gun);   // its hit numbers, heat and rounds are the Valkyrn's
  });
  it('the Valkyrn, its laser fit and the Hunter keep their defs: no turret, no table, no rock, no weak rule', () => {
    expect(GUN).toMatchObject({ turret: null, intervalByBars: null, rock: null, weakHitsPerLayer: null });
    expect([PEW.turret, HUNTER_PEW.turret]).toEqual([null, null]);
    expect(VALKYRN_CLASS.slots.gun).toBe(GUN);
    expect(VALKYRN_LASER_CLASS.slots.laser).not.toBeNull();
    expect(HUNTER_CLASS.slots.pew).toBe(HUNTER_PEW);
    expect([hasTurret(CUTTER_CLASS), hasTurret(HUNTER_CLASS), hasTurret(VALKYRN_CLASS), hasTurret(VALKYRN_LASER_CLASS)]).toEqual([true, false, false, false]);
  });
  it('the slots are Pew 0, Autocannon 1, Torpedo 2 (Beam is the laser fit\'s alias of 1); start 1 / 0 / 1; the trim takes the autocannon before pew pew', () => {
    expect(WeaponSlot).toEqual({ Pew: 0, Autocannon: 1, Torpedo: 2, Beam: 1 });
    expect(START_WEAPON_POWER).toEqual([1, 0, 1]);
    const st = createTacticalState(5), sys = st.systems[0]!;
    expect(sys.weaponPower).toEqual([1, 0, 1]);
    sys.bars[1] = 3; sys.weaponPower = [1, 1, 1];
    sys.bars[1] = 1;
    expect(trimmedWeaponPower(sys)).toEqual([1, 0, 0]);   // torpedo, then the autocannon, then pew pew
  });
  it('the Hound starts with no laser charge and untargeted (the FTL opener is the laser fit\'s)', () => {
    const sys = createTacticalState(5).systems[0]!;
    expect([sys.laserCharge, sys.laserTargeted, sys.laserManual]).toEqual([0, false, false]);
  });
  it('a gun cooldown of 10 validates (the autocannon\'s 1-bar interval, W-4 spec §13.1), 11 does not', () => {
    const st = createTacticalState(5);
    st.systems[0]!.gunCooldown = 10;
    expect(() => validateTacticalValues(st, flattenTactical(st))).not.toThrow();
    st.systems[0]!.gunCooldown = 11;
    expect(() => validateTacticalValues(st, flattenTactical(st))).toThrow(/gunCooldown/);
  });
});
