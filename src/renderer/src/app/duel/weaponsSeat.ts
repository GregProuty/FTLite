// W-4 spec §9 (W-4a): the Hound's Weapons seat, the rules both runtimes share (app/duel/runtime.ts, onlineDuel.ts): the
// selection, W/S's power delta, the held fields, the guns' frequency and the autocannon's rate text. Pure.
import type { HeldInput } from '../../net/contracts';
import { WeaponSlot, weaponBars } from '../../sim/tactical/bars';
import { classOf, Outcome, type TacticalState } from '../../sim/tactical/state';
import { slewTurret } from '../../sim/tactical/turret';
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
/** The seat's held fields: the selection, the reticle as turretAim (an integer 0..65535, else none) and the trigger as
 *  gunHeld only while the autocannon is selected (W-4b: callers pass `trigger && the autocannon's own mode is MAN`, so an
 *  AUTO autocannon sends none). */
export function weaponsSeatHeld(sel: number, trigger: boolean, aim = -1): Pick<HeldInput, 'weaponSel' | 'gunHeld' | 'turretAim'> {
  return { weaponSel: sel, ...(Number.isInteger(aim) && aim >= 0 && aim < 65536 ? { turretAim: aim } : {}), ...(trigger && sel === WeaponSlot.Autocannon ? { gunHeld: true } : {}) };
}
/** W-4 amendment §2.4, §2.5: the mode changes one frame asks for at the Hound's Weapons seat. `base`: each weapon's mode the
 *  app judges from, [pew pew, the autocannon, the torpedo] (the latest queued or sent for it, else the state's). In order:
 *  each Shift+R press sets both guns together (both to AUTO if either is on MAN, else both to MAN; the torpedo is not
 *  touched); each R press flips the selected weapon `sel`; each tag click (`taps`, per weapon) flips its own weapon.
 *  Returns the modes after the frame and which weapons changed: a command goes only for a weapon whose mode changes. */
export function modeRequests(base: readonly [boolean, boolean, boolean], sel: number, presses: Pick<Record<KeyAction, number>, 'weaponMode' | 'weaponModeAll'>, taps: readonly number[] = []): { modes: [boolean, boolean, boolean]; changed: [boolean, boolean, boolean] } {
  const modes: [boolean, boolean, boolean] = [base[0], base[1], base[2]];
  const flip = (w: number): void => { if (w === 0 || w === 1 || w === 2) modes[w] = !modes[w]; };
  for (let n = 0; n < presses.weaponModeAll; n++) { const man = !(modes[0] || modes[1]); modes[0] = man; modes[1] = man; }
  for (let n = 0; n < presses.weaponMode; n++) flip(sel);
  for (let w = 0; w < WEAPON_COUNT; w++) for (let n = 0; n < (taps[w] ?? 0); n++) flip(w);
  return { modes, changed: [modes[0] !== base[0], modes[1] !== base[1], modes[2] !== base[2]] };
}
/** The guns' frequency a frame asks for: 4/5/6, else a console button; null when none or unchanged (frequencyRequest). */
export function gunFreqRequest(base: number, k: Pick<KeySample, 'gunFreqKeyTo' | 'freqTo'>): number | null { return frequencyRequest(base, k.gunFreqKeyTo ?? k.freqTo); }
/** The laser class's frequency key: 3/4/5, else a console button (W-4 spec §9). */
export function laserFreqKey(k: Pick<KeySample, 'freqKeyTo' | 'freqTo'>): number | null | undefined { return k.freqKeyTo ?? k.freqTo; }
/** The AUTOCANNON card's rate: rounds a second at `interval` ticks (`6/S`), OFF at 0. */
export function autocannonRateText(interval: number): string { return interval > 0 ? `${Math.round(600 / interval) / 10}/S` : 'OFF'; }

/** W-4 spec §11 (the crew Helm throttle's analogue, playtest2feedback Decision 14): the own seat's predicted turret for gun
 *  `slot` (0 pew pew, 1 the autocannon): slewTurret applied `k` times (the unacknowledged held frames) from the replica's
 *  turret, with the replica's heading held fixed, the latest sent reticle and the gun's MAN traverse and arc. The replica's
 *  turret as it is unless `manual` (that gun's own mode, amendment §2.6) is MAN, `slot` is the sent selection, the gun has a turret and a bar, a reticle was sent
 *  and the round runs. Only the drawn muzzle line uses it; rounds always come from the replica. */
export function predictTurret(t: TacticalState, slot: 0 | 1, held: Pick<HeldInput, 'weaponSel' | 'turretAim'>, manual: boolean, k: number): number {
  const s = t.systems[0], base = slot === 0 ? s.pewTurret : s.gunTurret, cls = classOf(t, 0), turret = (slot === 0 ? cls.slots.pew : cls.slots.gun)?.turret ?? null;
  const aim = held.turretAim ?? -1;
  if (!manual || held.weaponSel !== slot || turret === null || !Number.isInteger(aim) || aim < 0 || t.outcome !== Outcome.Running
    || weaponBars(s, slot === 0 ? WeaponSlot.Pew : WeaponSlot.Autocannon) < 1) return base;
  let v = base;
  for (let n = 0; n < k; n++) v = slewTurret(v, t.ships[0].heading, aim, turret.traverse[1], turret.arcSteps);
  return v;
}
