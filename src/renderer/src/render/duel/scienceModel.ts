// The science presentation helpers (Sci-1 spec 2026-11-17-science-scans §7): the hostility line every console shows,
// the Science console's hover readout, the frequency and loot names and the SCAN button's state. Pure: no Pixi, no React.
import { roundTick } from '../../sim/tactical/science';
import { CONTACT_MAX_LEVEL, Contact, type TacticalState } from '../../sim/tactical/state';
import { HOSTILE_AFTER_TICKS, SCAN_UNITS } from '../../sim/tactical/tuning';
import { TICK_HZ } from '../../sim/tuning';
import { screenToWorld, type Camera, type Point, type Viewport } from '../tactical/camera';
import { bearingDeg } from '../tactical/weaponsModel';

export { LOOT_NAMES } from '../tactical/tacticalModel';
/** The laser frequencies, 0..2. */
export const FREQ_NAMES = ['A', 'B', 'C'] as const;
/** HOSTILE shows this long after the turn (spec §7.1: 3 s). */
export const HOSTILE_SHOWN_TICKS = 180;

export interface HostilityLine { text: string; alert: boolean }
/** Spec §7.1: while it holds, INCOMING SCAN (blinking) before the enemy is known to Level 1, then HOSTILE IN n s with
 *  n = ceil((1800 − rt) / 60); once hostile, HOSTILE (blinking) for 3 s; then nothing. */
export function hostilityLine(t: TacticalState): HostilityLine | null {
  const rt = roundTick(t);
  if (t.hostileAt < 0) return t.known[Contact.Enemy] >= 1 ? { text: `HOSTILE IN ${Math.ceil((HOSTILE_AFTER_TICKS - rt) / TICK_HZ)} s`, alert: false } : { text: 'INCOMING SCAN', alert: true };
  return rt - t.hostileAt < HOSTILE_SHOWN_TICKS ? { text: 'HOSTILE', alert: true } : null;
}

/** Spec §7.3: `BRG 327 RNG 1450` from the crew ship `from` to the cursor (internal px): the bearing in whole degrees
 *  clockwise from map up, the range in world units rounded to 10. Null without a cursor. */
export function hoverReadout(cam: Camera, vp: Viewport, from: Point, cursor: Point | null): string | null {
  if (!cursor) return null;
  const w = screenToWorld(cam, vp, cursor.x, cursor.y), dx = w.x - from.x, dy = w.y - from.y;
  return `BRG ${String(bearingDeg(dx, dy)).padStart(3, '0')} RNG ${Math.round(Math.hypot(dx, dy) / 10) * 10}`;
}

export interface ScanButton { label: string; enabled: boolean; progress: number | null }
/** Spec §7.2: the SCAN button for `contact` on `station`: `SCAN n` with the next level, ` (SLOW)` off Science, or
 *  SCANNED when the contact is fully known; the scanner's progress 0..1 while it is on this contact. */
export function scanButton(t: TacticalState, contact: 0 | 1, station: 'helm' | 'weapons' | 'science'): ScanButton {
  const known = t.known[contact];
  if (known >= CONTACT_MAX_LEVEL[contact]) return { label: 'SCANNED', enabled: false, progress: null };
  const progress = t.scan.contact === contact ? Math.min(1, t.scan.progress / SCAN_UNITS[t.scan.level]!) : null;
  return { label: `SCAN ${known + 1}${station === 'science' ? '' : ' (SLOW)'}`, enabled: true, progress };
}
