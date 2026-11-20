// Engineering spike spec §10.3, §11 (Task 9b): the crew's beam and torpedo stand on the Weapons officer's bars, and the
// round starts pew pew 1, beam 0, torpedo 1, so the beam is dark. todaysCrewWeapons gives a tactical state the crew
// weapons the tests written before the spike pin: the beam on 2 bars (2 shots, 40 a tick: today's undamaged laser) and
// the torpedo on 1 (4 units a tick on the 10800 clock: today's 2700-tick magazine), from 3 Weapons bars.
import { DuelSystem, WeaponSlot } from '../../src/renderer/src/sim/tactical/bars';
import type { TacticalState } from '../../src/renderer/src/sim/tactical/state';

/** Give the crew slot today's laser and torpedo by bars (Weapons 3 bars, split [0, 2, 1]). Returns the state. */
export function todaysCrewWeapons(st: TacticalState): TacticalState {
  const sys = st.systems[0]!, power = [0, 0, 0];
  power[WeaponSlot.Beam] = 2; power[WeaponSlot.Torpedo] = 1;
  sys.bars[DuelSystem.Weapons] = 3; sys.weaponPower = power;
  return st;
}

/** W-4 spec §14.1: `todaysCrewWeapons` keeps its meaning for the laser fit (the beam on 2 bars). The Hound's own bars:
 *  pew pew, the autocannon and the torpedo, from as many Weapons bars as they spend (at least the start's 2). */
export function houndWeapons(st: TacticalState, bars: readonly [number, number, number]): TacticalState {
  const sys = st.systems[0]!;
  sys.bars[DuelSystem.Weapons] = Math.max(2, bars[0] + bars[1] + bars[2]); sys.weaponPower = [...bars];
  return st;
}
