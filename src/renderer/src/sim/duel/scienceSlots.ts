// Hacking spike (spec 2026-11-20-science-hacking-design §2.4, §6 R1-5): the Science officer moves Sensors bars onto and
// off the hack module, as weaponSlots.ts moves Weapons bars between the weapons. Writing always stores the trimmed value
// first, so Sensors bars lost to damage or Engineering never come back to the hack by themselves.
import { DuelSystem, effectiveBars, hackBars, HACK_BAR_MAX } from '../tactical/bars';
import type { DuelState } from './state';
import type { ShipSystems } from '../tactical/state';

/** Why sciencePower {delta} would be refused now, or null: NO BAR (−1 at 0), NO FREE BAR (+1 with every effective Sensors
 *  bar already on the hack), MAX (+1 at HACK_BAR_MAX). Judged on the trimmed value. */
export function sciencePowerRefusal(d: DuelState, delta: number): 'NO BAR' | 'NO FREE BAR' | 'MAX' | null { return hackPowerRefusal(d.tactical.systems[0], delta); }
/** sciencePowerRefusal on a systems record (the Science panel's refusal words read it too). */
export function hackPowerRefusal(sys: Pick<ShipSystems, 'rooms' | 'bars' | 'hackPower'>, delta: number): 'NO BAR' | 'NO FREE BAR' | 'MAX' | null {
  const now = hackBars(sys);
  if (delta === -1) return now === 0 ? 'NO BAR' : null;
  return now >= HACK_BAR_MAX ? 'MAX' : now >= effectiveBars(sys, DuelSystem.Sensors) ? 'NO FREE BAR' : null;
}
/** `sciencePower` (delta ±1, valid), or refused (sciencePowerRefusal): the trimmed value written back, then ±1. */
export function applySciencePower(d: DuelState, delta: number): 'applied' | 'unavailable' {
  if (sciencePowerRefusal(d, delta) !== null) return 'unavailable';
  const sys = d.tactical.systems[0];
  sys.hackPower = hackBars(sys) + delta;
  return 'applied';
}
/** clampToCapacity writes the trimmed value back. */
export function clampSciencePower(d: DuelState): void {
  const sys = d.tactical.systems[0];
  sys.hackPower = hackBars(sys);
}
