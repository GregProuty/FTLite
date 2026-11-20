// Engineering spike spec §10.3 (Amendment 2), Task 9a, isolated: the Weapons officer moves bars between pew pew, the
// beam and the torpedo. Writing always stores the trimmed values first, so bars lost to damage never come back by
// themselves.
import { SYSTEM_MAX, DuelSystem, trimmedWeaponPower, WEAPON_BAR_MAX, weaponBarsUsable } from '../tactical/bars';
import type { DuelState } from './state';

/** W-4 spec §9: why weaponPower {slot, delta} would be refused now, or null: NO BAR (−1 at 0), NO FREE BAR (+1 with every
 *  usable bar spent), MAX (+1 at the slot's top: 3, or 4 with the overdrive bar and no other 4th). The app's W/S flash. */
export function weaponPowerRefusal(d: DuelState, slot: number, delta: number): 'NO BAR' | 'NO FREE BAR' | 'MAX' | null {
  const sys = d.tactical.systems[0], t = trimmedWeaponPower(sys), now = t[slot]!;
  if (delta === -1) return now === 0 ? 'NO BAR' : null;
  const usable = weaponBarsUsable(sys), spent = t[0]! + t[1]! + t[2]!;
  const top = usable > SYSTEM_MAX[DuelSystem.Weapons]! && !t.some((b) => b > WEAPON_BAR_MAX) ? WEAPON_BAR_MAX + 1 : WEAPON_BAR_MAX;
  return spent >= usable ? 'NO FREE BAR' : now >= top ? 'MAX' : null;
}
/** `weaponPower` (slot 0..2, delta ±1, both valid), or refused (weaponPowerRefusal). +1 needs an unspent Weapons bar and
 *  the weapon below 3, or below 4 while the Weapons system holds its overdrive bar and no weapon has a 4th yet. −1 needs
 *  a bar on the weapon. */
export function applyWeaponPower(d: DuelState, slot: number, delta: number): 'applied' | 'unavailable' {
  if (weaponPowerRefusal(d, slot, delta) !== null) return 'unavailable';
  const sys = d.tactical.systems[0], t = trimmedWeaponPower(sys);
  for (let k = 0; k < t.length; k++) sys.weaponPower[k] = t[k]!;
  sys.weaponPower[slot] = t[slot]! + delta;
  return 'applied';
}

/** Spec §10.3: clampToCapacity writes the trimmed values back. */
export function clampWeaponPower(d: DuelState): void {
  const sys = d.tactical.systems[0], t = trimmedWeaponPower(sys);
  for (let k = 0; k < t.length; k++) sys.weaponPower[k] = t[k]!;
}
