// The contact window's view model (enemy ship window spec §4.2, §6.4; Sci-1 spec §7.2): one map contact by contact id
// and scan level, as screen-ready data in internal px: the title and the SCAN button; for the enemy at Level 1 or more
// its shields, hull, outline and rooms fitted to the drawing box (labels and damage looks only at Level 2), the laser's
// lock room (Level 2) and the Weapons station's weapon list; and the info lines (the hostility line, Level 2's readings,
// the derelict's loot, trap, range and salvage hint). `t` is the scene's presentation clock, so the window blinks with
// the map frame for frame; React draws only what this returns.
import { derelictPos } from '../../sim/tactical/science';
import { classOf, Contact, CREW_SLOT, missileOf, targetOf, type TacticalState } from '../../sim/tactical/state';
import { HUNTER_MISSILE_COOLDOWN_TICKS, SALVAGE_TICKS } from '../../sim/tactical/tuning';
import { ALERT_BLINK_HZ, blink, CRT, DAMAGE_BLINK_HZ, HATCH_ANGLE, HATCH_SPACING, roomLevel, roomLook } from '../tactical/crtTheme';
import { hatchSegments } from '../tactical/dashModel';
import { HULLS, hullFor, roomCentre } from '../tactical/hullModel';
import { CONTACT_BOX } from './consoleLayout';
import type { WeaponsPanel } from './consoleModel';
import { FREQ_NAMES, hostilityLine, LOOT_NAMES, scanButton, type ScanButton } from './scienceModel';

/** The room labels, rooms[0] Weapons, rooms[1] Shields, rooms[2] Engines (the lock buttons' words). */
export const ROOM_LABELS = ['WEAP', 'SHLD', 'ENG'] as const;
/** Internal px kept clear between the outline and the drawing box's edges. */
export const CONTACT_PAD = 8;

export interface ContactRoom {
  label: string;
  /** roomCentre in window space: where the label and the lock mark sit. */
  centre: { x: number; y: number };
  /** The room polygon, flat [x, y, ...] in internal px. */
  points: number[];
  fill: number | null; stroke: number;
  /** Null when roomLook gives no hatch; else its colour and flat segment endpoints [x1, y1, x2, y2, ...]. */
  hatch: { colour: number; segments: number[] } | null;
}
export interface ContactLaser { label: string; value: string; fill: number; lit: boolean; enabled: boolean; note: string | null }
/** One info line under the drawing: its text, its resolved ramp colour (an alert blinks hot and main), and a bar 0..1. */
export interface ContactLine { text: string; tint: number; bar: number | null }
export interface ContactView {
  /** The shown contact, or null on Science with nothing selected. */
  contact: 0 | 1 | null;
  title: string;
  /** The enemy at Level 1 or more; null otherwise. */
  shields: { up: number; of: number } | null;
  hull: { value: number; fill: number } | null;
  /** The drawing box in internal px (CONTACT_BOX). */
  box: { x: number; y: number; w: number; h: number };
  /** The enemy's outline and rooms at Level 1 or more; empty otherwise. */
  outline: number[];
  rooms: ContactRoom[];
  /** The crew laser's lock room, at Level 2. */
  lockRoom: number | null;
  /** Weapons only, the enemy at Level 1 or more: LASER (the station block's charge row) and MISSILE (not aimable). */
  weapons: null | { laser: ContactLaser; missile: { magazine: number } };
  /** The aim is armed (Weapons only). */
  aim: boolean;
  /** The SCAN button; null with nothing selected. */
  scan: ScanButton | null;
  lines: ContactLine[];
}
export interface ContactModelInput {
  state: TacticalState;
  /** The shown contact (0 the enemy, 1 the derelict), or null (Science with nothing selected). */
  contact: 0 | 1 | null;
  aim: boolean;
  station: 'helm' | 'weapons' | 'science';
  /** Presentation seconds, for the blinks. */
  t: number;
  /** The Weapons station block's panel (its charge row), or null elsewhere. */
  weapons: Pick<WeaponsPanel, 'charge'> | null;
}

/** Ship units (f, s) to the box: one uniform scale fitting the outline's bounds with CONTACT_PAD on every side, the
 *  bounds centred, nose right (f to +x, s to +y). */
export function contactFit(outline: readonly number[], box: { x: number; y: number; w: number; h: number }): (f: number, s: number) => { x: number; y: number } {
  let f0 = Infinity, f1 = -Infinity, s0 = Infinity, s1 = -Infinity;
  for (let k = 0; k + 1 < outline.length; k += 2) {
    const f = outline[k]!, s = outline[k + 1]!;
    f0 = Math.min(f0, f); f1 = Math.max(f1, f); s0 = Math.min(s0, s); s1 = Math.max(s1, s);
  }
  const k = Math.min((box.w - 2 * CONTACT_PAD) / (f1 - f0), (box.h - 2 * CONTACT_PAD) / (s1 - s0));
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, mf = (f0 + f1) / 2, ms = (s0 + s1) / 2;
  return (f, s) => ({ x: cx + (f - mf) * k, y: cy + (s - ms) * k });
}

const line = (text: string, tint: number = CRT.main, bar: number | null = null): ContactLine => ({ text, tint, bar });

export function contactModel(i: ContactModelInput): ContactView | null {
  const { state } = i, box = { x: CONTACT_BOX.x, y: CONTACT_BOX.y, w: CONTACT_BOX.w, h: CONTACT_BOX.h };
  const alert = blink(i.t, ALERT_BLINK_HZ) ? CRT.hot : CRT.main;
  const bare = (contact: 0 | 1 | null, title: string, lines: ContactLine[] = []): ContactView => ({
    contact, title, shields: null, hull: null, box, outline: [], rooms: [], lockRoom: null, weapons: null, aim: false,
    scan: contact === null ? null : scanButton(state, contact, i.station), lines
  });
  if (i.contact === null) return i.station === 'science' ? bare(null, 'NO CONTACT SELECTED') : null;
  if (i.contact === Contact.Derelict) {
    if (state.known[Contact.Derelict] < 1) return bare(Contact.Derelict, 'UNKNOWN CONTACT');
    const dr = state.derelict, p = derelictPos(state), crew = state.ships[CREW_SLOT];
    const range = Math.round(Math.hypot(p.x - crew.x, p.y - crew.y) / 10) * 10;
    const lines = [line(dr.salvaged ? 'SALVAGED' : `LOOT ${LOOT_NAMES[dr.loot] ?? ''}`)];
    if (dr.trapped && !dr.salvaged) lines.push(line('TRAPPED', alert));
    lines.push(line(`RANGE ${range}`));
    if (!dr.salvaged) lines.push(line('CLOSE TO 60, MATCH SPEED', CRT.mid, dr.salvage > 0 ? Math.min(1, dr.salvage / SALVAGE_TICKS) : null));
    return bare(Contact.Derelict, 'DERELICT', lines);
  }
  const slot = targetOf(state, CREW_SLOT), body = state.ships[slot];   // the enemy is drawn through the hunter's slot
  if (!body || !body.active) return null;
  const level = state.known[Contact.Enemy];
  if (level < 1) return bare(Contact.Enemy, 'UNKNOWN CONTACT');
  const sys = state.systems[slot]!, cls = classOf(state, slot), crewSys = state.systems[CREW_SLOT], full = level >= 2;
  const hull = hullFor(false), shape = HULLS[hull], at = contactFit(shape.outline, box);
  const place = (poly: readonly number[]): number[] => {
    const out: number[] = [];
    for (let k = 0; k + 1 < poly.length; k += 2) { const q = at(poly[k]!, poly[k + 1]!); out.push(q.x, q.y); }
    return out;
  };
  const phase = blink(i.t, DAMAGE_BLINK_HZ);
  const rooms: ContactRoom[] = shape.rooms.map((poly, r) => {
    const look = roomLook(false, full ? roomLevel(sys.rooms[r] ?? 0) : 0, phase), points = place(poly), c = roomCentre(hull, r);   // Level 1: no damage
    return {
      label: full ? ROOM_LABELS[r] ?? '' : '?', centre: at(c.f, c.s), points, fill: look.fill, stroke: look.stroke,
      hatch: look.hatch === null ? null : { colour: look.hatch, segments: hatchSegments(points, HATCH_SPACING, HATCH_ANGLE) }
    };
  });
  const weapons = i.station === 'weapons' && i.weapons
    ? { laser: { label: i.weapons.charge.label, value: i.weapons.charge.value, fill: i.weapons.charge.bar?.fill ?? 0, lit: i.aim, enabled: true, note: null }, missile: { magazine: crewSys.magazine } }
    : null;
  const lines: ContactLine[] = [], hostile = hostilityLine(state);
  if (hostile) lines.push(line(hostile.text, hostile.alert ? alert : CRT.main));
  if (full) {   // Level 2's readings (presentation of the hunter's existing state)
    lines.push(line(`WEAK FREQ ${FREQ_NAMES[state.weakFreq] ?? ''}`));
    lines.push(line('ENEMY LASER', CRT.main, Math.min(1, sys.laserCharge / cls.slots.laser.chargeUnits)));
    const ready = sys.magazine > 0 && missileOf(state, slot) === null && state.tick - state.hunter.lastLaunch >= HUNTER_MISSILE_COOLDOWN_TICKS;
    lines.push(line(ready ? 'MISSILE READY' : 'RELOADING'));
  }
  return {
    contact: Contact.Enemy, title: 'ENEMY SHIP',
    shields: { up: sys.shields, of: cls.shields.layers },
    hull: { value: sys.hull, fill: Math.max(0, Math.min(1, sys.hull / cls.hull)) },
    box, outline: place(shape.outline), rooms, lockRoom: full ? crewSys.lock : null, weapons, aim: i.aim && weapons !== null,
    scan: scanButton(state, Contact.Enemy, i.station), lines
  };
}
