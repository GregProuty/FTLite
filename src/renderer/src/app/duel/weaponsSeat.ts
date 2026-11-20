// W-4 spec §9 (W-4a): the Hound's Weapons seat, the rules both runtimes share (app/duel/runtime.ts, onlineDuel.ts): the
// selection, W/S's power delta, the held fields, the guns' frequency and the autocannon's rate text. Pure.
import type { HeldInput } from '../../net/contracts';
import { WeaponSlot } from '../../sim/tactical/bars';
import { frequencyRequest, type KeyAction, type KeySample } from './input';

/** The three weapons, in slot order. */
export const WEAPON_COUNT = 3;

/** The selection after a frame: a 1/2/3 key or a card click (selectTo) wins; else A/D's press edges step it, wrapping;
 *  while `steering` (W-4a: a MANUAL torpedo flies, W-3's A/D steer it) A/D do not select. */
export function nextWeaponSel(sel: number, k: Pick<KeySample, 'selectTo'> & { presses: Pick<Record<KeyAction, number>, 'selectPrev' | 'selectNext'> }, steering: boolean): number {
  if (k.selectTo !== undefined && k.selectTo !== null && Number.isInteger(k.selectTo) && k.selectTo >= 0 && k.selectTo < WEAPON_COUNT) return k.selectTo;
  if (steering) return sel;
  const steps = k.presses.selectNext - k.presses.selectPrev;
  return (((sel + steps) % WEAPON_COUNT) + WEAPON_COUNT) % WEAPON_COUNT;
}
/** W/S this frame as a bar delta on the selected weapon (W up, S down; at the Weapons seat they are not the throttle). */
export function powerDelta(presses: Pick<Record<KeyAction, number>, 'throttleUp' | 'throttleDown'>): number { return presses.throttleUp - presses.throttleDown; }
/** The seat's held fields: the selection, and the trigger as gunHeld only while the autocannon is selected. */
export function weaponsSeatHeld(sel: number, trigger: boolean): Pick<HeldInput, 'weaponSel' | 'gunHeld'> {
  return { weaponSel: sel, ...(trigger && sel === WeaponSlot.Autocannon ? { gunHeld: true } : {}) };
}
/** The guns' frequency a frame asks for: 4/5/6, else a console button; null when none or unchanged (frequencyRequest). */
export function gunFreqRequest(base: number, k: Pick<KeySample, 'gunFreqKeyTo' | 'freqTo'>): number | null { return frequencyRequest(base, k.gunFreqKeyTo ?? k.freqTo); }
/** The laser class's frequency key: 3/4/5, else a console button (W-4 spec §9). */
export function laserFreqKey(k: Pick<KeySample, 'freqKeyTo' | 'freqTo'>): number | null | undefined { return k.freqKeyTo ?? k.freqTo; }
/** The AUTOCANNON card's rate: rounds a second at `interval` ticks (`6/S`), OFF at 0. */
export function autocannonRateText(interval: number): string { return interval > 0 ? `${Math.round(600 / interval) / 10}/S` : 'OFF'; }
