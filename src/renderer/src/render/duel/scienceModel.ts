// The science presentation helpers (Sci-1 spec 2026-11-17-science-scans §7): the hostility line every console shows,
// the Science console's hover readout, the frequency and loot names and the SCAN button's state. Pure: no Pixi, no React.
import { hackBlocked, roundTick } from '../../sim/tactical/science';
import { hackPowerRefusal } from '../../sim/duel/scienceSlots';
import { hackBars, hackOnline, HACK_BAR_MAX, scannerBars } from '../../sim/tactical/bars';
import { CONTACT_MAX_LEVEL, Contact, CREW_SLOT, type TacticalState } from '../../sim/tactical/state';
import { HACK_TICKS, HOSTILE_AFTER_TICKS, SCAN_UNITS } from '../../sim/tactical/tuning';
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
export function scanButton(t: TacticalState, contact: 0 | 1, station: 'helm' | 'weapons' | 'science' | 'flight'): ScanButton {
  const known = t.known[contact];
  if (known >= CONTACT_MAX_LEVEL[contact]) return { label: 'SCANNED', enabled: false, progress: null };
  const progress = t.scan.contact === contact ? Math.min(1, t.scan.progress / SCAN_UNITS[t.scan.level]!) : null;
  return { label: `SCAN ${known + 1}${station === 'science' ? '' : ' (SLOW)'}`, enabled: true, progress };
}

// ---- Hacking (hacking spike 2026-11-20, spec §3.1) ----
/** The hack module's three room buttons, rooms[0] Weapons, rooms[1] Shields, rooms[2] Engines. */
export const HACK_ROOM_LABELS = ['WEAP', 'SHLD', 'ENG'] as const;
export interface HackRoomButton {
  label: string;
  /** running: being hacked now (a click cancels); down: switched off by a landed hack (`seconds` left); dim: a click would
   *  be refused (offline, no designation, out of range); idle: a click starts a hack. */
  state: 'idle' | 'running' | 'down' | 'dim';
  seconds: number;
  /** Code review 2: what a press says when it would be refused (a dim or down room), else null. */
  refusal?: string | null;
}
export interface HackPanel {
  /** The bars on the scanner and on the hack (trimmed), and the pips each shows. */
  scan: number; hack: number; pips: number;
  online: boolean;
  rooms: HackRoomButton[];
  /** The running hack's hold 0..1, or null. */
  progress: number | null;
  /** The status line and whether it is hot. */
  status: string; alert: boolean;
  /** Code review 2: why a +1 / −1 on HACK's pips would be refused now (NO FREE BAR, MAX, NO BAR), or null; the block shows
   *  it for a moment on a refused click, as a refused room button shows its reason. */
  addRefusal: string | null; removeRefusal: string | null;
}
const secondsLeft = (ticks: number): number => Math.ceil(ticks / TICK_HZ);
/** hackBlocked's reason as the status line says it. */
const blockedWords = (b: NonNullable<ReturnType<typeof hackBlocked>>): string => (b === 'HACK OFFLINE' ? 'HACK: NEED 2 BARS' : `HACK: ${b}`);
/** Spec §3.1: the Science block's SCAN / HACK rows from the state: the pips, the room buttons and one status line —
 *  HACKING <room> n s while a hack holds, else <room> DOWN n s while a room is off (the longest), else why a hack cannot
 *  start (HACK: NEED 2 BARS / SELECT THE ENEMY / OUT OF RANGE), else HACK: PICK A ROOM. */
export function hackPanel(t: TacticalState): HackPanel {
  const crew = t.systems[CREW_SLOT], target = t.systems[crew.target], blocked = hackBlocked(t);
  const rooms: HackRoomButton[] = HACK_ROOM_LABELS.map((label, r) => {
    const down = target?.hacked[r] ?? 0;
    if (t.hackRoom === r) return { label, state: 'running', seconds: 0 };
    if (down > 0) return { label: `${label} ${secondsLeft(down)}`, state: 'down', seconds: secondsLeft(down), refusal: `${label}: ALREADY DOWN` };
    return blocked !== null ? { label, state: 'dim', seconds: 0, refusal: blockedWords(blocked) } : { label, state: 'idle', seconds: 0 };
  });
  let status: string, alert = false;
  const longest = [0, 1, 2].reduce((best, r) => ((target?.hacked[r] ?? 0) > (target?.hacked[best] ?? 0) ? r : best), 0);
  if (t.hackRoom >= 0) { status = `HACKING ${HACK_ROOM_LABELS[t.hackRoom] ?? ''} ${secondsLeft(HACK_TICKS - t.hackTicks)} s`; alert = true; }
  else if ((target?.hacked[longest] ?? 0) > 0) status = `${HACK_ROOM_LABELS[longest]} DOWN ${secondsLeft(target!.hacked[longest]!)} s`;
  else status = blocked !== null ? blockedWords(blocked) : 'HACK: PICK A ROOM';
  return { scan: scannerBars(crew), hack: hackBars(crew), pips: HACK_BAR_MAX, online: hackOnline(crew), rooms,
    progress: t.hackRoom >= 0 ? Math.min(1, t.hackTicks / HACK_TICKS) : null, status, alert,
    addRefusal: hackPowerRefusal(crew, 1), removeRefusal: hackPowerRefusal(crew, -1) };
}
