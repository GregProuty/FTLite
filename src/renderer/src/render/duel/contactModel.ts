// The contact window's view model (enemy ship window spec §4.2, §6.4; Sci-1 spec §7.2): one map contact by contact id
// and scan level, as screen-ready data in internal px: the title and the SCAN button; for the enemy at Level 1 or more
// its shields, hull, outline and rooms fitted to the drawing box (labels and damage looks only at Level 2), the laser's
// lock room (Level 2) and the Weapons station's weapon list; and the info lines (the hostility line, Level 2's readings,
// the derelict's loot, trap, range and salvage hint; the unknown enemy's Level 1 scan line). `t` is the scene's presentation clock, so the window blinks with
// the map frame for frame; React draws only what this returns.
import { hasTurret } from '../../sim/tactical/defs';
import { derelictPos } from '../../sim/tactical/science';
import { classOf, Contact, CREW_SLOT, missileOf, targetOf, type TacticalState } from '../../sim/tactical/state';
import { HUNTER_MISSILE_COOLDOWN_TICKS, SALVAGE_TICKS, SCAN_UNITS } from '../../sim/tactical/tuning';
import { ALERT_BLINK_HZ, blink, CRT, DAMAGE_BLINK_HZ, HATCH_ANGLE, HATCH_SPACING, roomLevel, roomLook } from '../tactical/crtTheme';
import { hatchSegments } from '../tactical/dashModel';
import { HULLS, hullFor, roomCentre } from '../tactical/hullModel';
import { bubbleAlpha, quantCells, shieldCells, type Ellipse, type ShieldFx } from '../shieldFx';
import { CONTACT_BOX } from './consoleLayout';
import type { WeaponsPanel } from './consoleModel';
import { FREQ_NAMES, hostilityLine, LOOT_NAMES, scanButton, type ScanButton } from './scienceModel';
import { shortArcs } from './hackFx';
import { HACK_TICKS } from '../../sim/tactical/tuning';
import { TICK_HZ } from '../../sim/tuning';

/** The room labels, rooms[0] Weapons, rooms[1] Shields, rooms[2] Engines (the lock buttons' words). */
export const ROOM_LABELS = ['WEAP', 'SHLD', 'ENG'] as const;
/** The unknown enemy's line while its Level 1 scan runs (FTL targeting spec §1: a pick-up below Level 1 starts it). */
export const SCANNING_ROOMS = 'SCANNING: ROOMS AT LEVEL 1';
/** The unknown enemy's line with a weapon picked up and no scan running (the scan not sent, or not arrived yet). */
export const ROOMS_NEED_SCAN = 'ROOMS AT SCAN LEVEL 1';
/** Internal px kept clear between the outline and the drawing box's edges. */
export const CONTACT_PAD = 8;
/** Feel-i (console feel spec §3): the unknown enemy's silhouette below Level 1, in ship units nose right (f forward, s
 *  starboard): a plain hull and the three rooms every class has today, stern to nose ENG, SHLD, WEAP (rooms[0] Weapons,
 *  rooms[1] Shields, rooms[2] Engines, as the sim's Room order), so a room can be targeted before the scan fills it in. */
export const UNKNOWN_SHAPE = {
  outline: [1.35, 0, 0.85, -0.62, -1.1, -0.62, -1.35, 0, -1.1, 0.62, 0.85, 0.62] as readonly number[],
  rooms: [
    [0.42, -0.42, 1.0, -0.42, 1.0, 0.42, 0.42, 0.42],
    [-0.3, -0.42, 0.3, -0.42, 0.3, 0.42, -0.3, 0.42],
    [-1.02, -0.42, -0.42, -0.42, -0.42, 0.42, -1.02, 0.42]
  ] as readonly (readonly number[])[]
};

export interface ContactRoom {
  label: string;
  /** roomCentre in window space: where the label and the lock mark sit. */
  centre: { x: number; y: number };
  /** The room polygon, flat [x, y, ...] in internal px. */
  points: number[];
  fill: number | null; stroke: number;
  /** Null when roomLook gives no hatch; else its colour and flat segment endpoints [x1, y1, x2, y2, ...]. */
  hatch: { colour: number; segments: number[] } | null;
  /** Hacking spike §3.2, R1-8: switched off by a landed hack: the seconds left and this frame's short-circuit arcs (flat
   *  segments); absent or null when not hacked. */
  hacked?: { seconds: number; arcs: number[] } | null;
  /** Hacking spike §3.2: the running hack's hold 0..1 while this room is being hacked, else absent or null. */
  hacking?: number | null;
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
  /** The crew laser's target room (FTL targeting spec §1: while it has one), at Level 1 or more; W-4 amendment §3.6: on a
   *  class with a turret gun, the target room, whenever the rooms are drawn. */
  lockRoom: number | null;
  /** The crew torpedo's target room (FTL targeting spec §1), at Level 1 or more. */
  torpRoom: number | null;
  /** Weapons only, the enemy at Level 1 or more: LASER (the station block's charge row) and TORPEDO, each lit while picked up. */
  weapons: null | { laser: ContactLaser; missile: { magazine: number; lit: boolean } };
  /** The aim is armed (Weapons only). */
  aim: boolean;
  /** The weapon picked up while the aim is armed (FTL targeting spec §1), else null. */
  aimWeapon: 'laser' | 'torpedo' | null;
  /** The SCAN button; null with nothing selected. */
  scan: ScanButton | null;
  lines: ContactLine[];
  /** Duel polish i spec §B: each struck room's flash, its polygon and fill alpha (a hot fill fading 0.6 to 0). */
  flash: { room: number; points: number[]; alpha: number }[];
  /** Feel-i: the drawing is the unknown enemy's "?" silhouette (below Level 1), drawn dashed. */
  unknown?: boolean;
  /** W-4 amendment §3.6: a plain click on a room, with nothing picked up, sets the crew's target room: the Weapons station
   *  of a class with a turret gun (the Hound). Absent: no. */
  roomClick?: boolean;
  /** UI round Part 3 §3.4: the Hunter render placed in the box (the frame's corners through the outline's fit), at Level 1 or more with art given. */
  art: { url: string; x: number; y: number; w: number; h: number } | null;
  /** UI round Part 3 §3.2: the shield bubble ellipse, its resting alpha and the shimmering hex cells (cell radius `cell` px), when a fx is given and the enemy is drawn. */
  shield: { ellipse: Ellipse; bubble: number; cells: { x: number; y: number; alpha: number }[]; cell: number } | null;
  /** The SHLD/HULL row's top y, under the drawing box. */
  statusY: number;
}
export interface ContactModelInput {
  state: TacticalState;
  /** The shown contact (0 the enemy, 1 the derelict), or null (Science with nothing selected). */
  contact: 0 | 1 | null;
  aim: boolean;
  /** The weapon the armed aim carries (FTL targeting spec §1); default the laser. */
  weapon?: 'laser' | 'torpedo';
  station: 'helm' | 'weapons' | 'science' | 'flight';
  /** Presentation seconds, for the blinks. */
  t: number;
  /** The Weapons station block's panel (its charge row), or null elsewhere. */
  weapons: Pick<WeaponsPanel, 'charge'> | null;
  /** Duel polish i spec §B: the shown ship's struck rooms and their flash alphas now (hitModel flashesFor); default none. */
  flashes?: readonly { room: number; alpha: number }[];
  /** Engineering spike §10.4: whether the shown contact is inside the sensor range (the scene's fog); default true. */
  seen?: boolean;
  /** UI round 2b: the drawing box for the live stage (consoleLayout(stage).CONTACT_BOX); default the reference's CONTACT_BOX. */
  box?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** UI round Part 3: the Hunter render and its frame in ship units (f to image x, s to image y); drawn at Level 1 or more. */
  art?: { url: string; frame: { f0: number; s0: number; f1: number; s1: number } } | null;
  /** UI round Part 3: the shield fx and the enemy's ship slot. */
  shield?: { fx: ShieldFx; slot: number } | null;
}

/** Hex cell radius (px) of the enemy window's shield shimmer. */
export const CONTACT_SHIELD_CELL = 5;

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
/** Hacking spike §3.2, R1-8: room r of the crew's target as a hack shows it, at every scan level (the "?" rooms too: which
 *  room is hacked is shown, accepted): off (`ENG 23`: the room's name and seconds, code review 5; the arcs) or being hacked (the hold). */
function hackLook(i: ContactModelInput, room: ContactRoom, r: number): ContactRoom {
  const t = i.state, down = t.systems[targetOf(t, CREW_SLOT)]?.hacked[r] ?? 0;
  if (down > 0) { const seconds = Math.ceil(down / TICK_HZ); return { ...room, label: `${ROOM_LABELS[r] ?? ''} ${seconds}`, hacked: { seconds, arcs: shortArcs(room.points, i.t, r) } }; }
  if (t.hackRoom === r) return { ...room, hacking: Math.min(1, t.hackTicks / HACK_TICKS) };
  return room;
}

export function contactModel(i: ContactModelInput): ContactView | null {
  const { state } = i, b = i.box ?? CONTACT_BOX, box = { x: b.x, y: b.y, w: b.w, h: b.h };
  const alert = blink(i.t, ALERT_BLINK_HZ) ? CRT.hot : CRT.main;
  const bare = (contact: 0 | 1 | null, title: string, lines: ContactLine[] = []): ContactView => ({
    contact, title, shields: null, hull: null, box, art: null, shield: null, statusY: box.y + box.h + 6, outline: [], rooms: [], lockRoom: null, torpRoom: null, weapons: null, aim: false, aimWeapon: null, flash: [],
    scan: contact === null ? null : scanButton(state, contact, i.station), lines
  });
  if (i.contact === null) return i.station === 'science' ? bare(null, 'NO CONTACT SELECTED') : null;
  if (i.seen === false) return { ...bare(i.contact, 'CONTACT LOST', [line('OUT OF SENSOR RANGE', CRT.mid)]), scan: null };   // Engineering spike §10.4: no drawing, no picks, no scan
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
  const crewSys = state.systems[CREW_SLOT], weapon = i.weapon ?? 'laser';
  // W-4 amendment §3.6: on a class with a turret gun (the Hound) the bracket is the target room whenever the rooms are drawn
  // (laserTargeted stays false there); on any other class it is the laser's target, while it has one.
  const turretGun = hasTurret(classOf(state, CREW_SLOT)), lockRoom = turretGun ? crewSys.lock : crewSys.laserTargeted ? crewSys.lock : null;
  const roomClick = turretGun && i.station === 'weapons';
  const weaponRows = (): ContactView['weapons'] => (i.station === 'weapons' || i.station === 'flight') && i.weapons   // Valkyrn spec §5: Flight's rows too
    ? { laser: { label: i.weapons.charge.label, value: i.weapons.charge.value, fill: i.weapons.charge.bar?.fill ?? 0, lit: i.aim && weapon === 'laser', enabled: classOf(state, CREW_SLOT).slots.laser !== null, note: null },
        missile: { magazine: crewSys.magazine, lit: i.aim && weapon === 'torpedo' } }
    : null;
  if (level < 1) {
    // Feel-i (console feel spec §3): below Level 1 the window still works: a "?" silhouette of the three rooms, targeted
    // by position (FTL targeting's pick-up still starts the Level 1 scan, which fills them in).
    const s = state.scan, at = contactFit(UNKNOWN_SHAPE.outline, box);
    const place = (poly: readonly number[]): number[] => {
      const out: number[] = [];
      for (let k = 0; k + 1 < poly.length; k += 2) { const q = at(poly[k]!, poly[k + 1]!); out.push(q.x, q.y); }
      return out;
    };
    const rooms: ContactRoom[] = UNKNOWN_SHAPE.rooms.map((poly, r) => {
      let f = 0, sd = 0;
      for (let k = 0; k + 1 < poly.length; k += 2) { f += poly[k]!; sd += poly[k + 1]!; }
      return hackLook(i, { label: '?', centre: at(f / (poly.length / 2), sd / (poly.length / 2)), points: place(poly), fill: null, stroke: CRT.mid, hatch: null }, r);
    });
    const weapons = weaponRows(), picked = i.aim && weapons !== null;
    const lines = s.contact === Contact.Enemy && s.level === 1
      ? [line(SCANNING_ROOMS, CRT.main, Math.min(1, s.progress / SCAN_UNITS[1]!))]
      : picked ? [line(ROOMS_NEED_SCAN, CRT.mid)] : [];
    return { ...bare(Contact.Enemy, 'UNKNOWN CONTACT', lines), outline: place(UNKNOWN_SHAPE.outline), rooms, unknown: true,
      lockRoom, roomClick, torpRoom: crewSys.torpLock >= 0 ? crewSys.torpLock : null,
      weapons, aim: picked, aimWeapon: picked ? weapon : null,
      flash: (i.flashes ?? []).flatMap((f) => { const r = rooms[f.room]; return r && f.alpha > 0 ? [{ room: f.room, points: r.points, alpha: f.alpha }] : []; }) };
  }
  const sys = state.systems[slot]!, cls = classOf(state, slot), full = level >= 2;
  const hull = hullFor(false), shape = HULLS[hull], at = contactFit(shape.outline, box);
  const place = (poly: readonly number[]): number[] => {
    const out: number[] = [];
    for (let k = 0; k + 1 < poly.length; k += 2) { const q = at(poly[k]!, poly[k + 1]!); out.push(q.x, q.y); }
    return out;
  };
  const phase = blink(i.t, DAMAGE_BLINK_HZ);
  const rooms: ContactRoom[] = shape.rooms.map((poly, r) => {
    const look = roomLook(false, full ? roomLevel(sys.rooms[r] ?? 0) : 0, phase), points = place(poly), c = roomCentre(hull, r);   // Level 1: no damage
    return hackLook(i, {
      label: full ? ROOM_LABELS[r] ?? '' : '?', centre: at(c.f, c.s), points, fill: look.fill, stroke: look.stroke,
      hatch: look.hatch === null ? null : { colour: look.hatch, segments: hatchSegments(points, HATCH_SPACING, HATCH_ANGLE) }
    }, r);
  });
  const weapons = weaponRows();
  const lines: ContactLine[] = [], hostile = hostilityLine(state);
  if (hostile) lines.push(line(hostile.text, hostile.alert ? alert : CRT.main));
  if (full) {   // Level 2's readings (presentation of the hunter's existing state)
    lines.push(line(`WEAK FREQ ${FREQ_NAMES[state.weakFreq] ?? ''}`));
    lines.push(line('ENEMY LASER', CRT.main, cls.slots.laser ? Math.min(1, sys.laserCharge / cls.slots.laser.chargeUnits) : 0));
    const ready = sys.magazine > 0 && missileOf(state, slot) === null && state.tick - state.hunter.lastLaunch >= HUNTER_MISSILE_COOLDOWN_TICKS;
    lines.push(line(ready ? 'TORPEDO READY' : 'RELOADING'));
  }
  const placed = place(shape.outline);
  let nx0 = Infinity, nx1 = -Infinity, ny0 = Infinity, ny1 = -Infinity;
  for (let k = 0; k + 1 < placed.length; k += 2) { nx0 = Math.min(nx0, placed[k]!); nx1 = Math.max(nx1, placed[k]!); ny0 = Math.min(ny0, placed[k + 1]!); ny1 = Math.max(ny1, placed[k + 1]!); }
  const ellipse: Ellipse = { cx: (nx0 + nx1) / 2, cy: (ny0 + ny1) / 2, rx: 0.56 * (nx1 - nx0), ry: 0.56 * (ny1 - ny0) };
  const nose = { x: 1, y: 0 }, star = { x: 0, y: 1 };
  const art = i.art ? (() => {
    const a = at(i.art.frame.f0, i.art.frame.s0), z = at(i.art.frame.f1, i.art.frame.s1);
    return { url: i.art.url, x: a.x, y: a.y, w: z.x - a.x, h: z.y - a.y };
  })() : null;
  const shield = i.shield ? { ellipse, bubble: bubbleAlpha(i.shield.fx, i.shield.slot, sys.shields), cells: quantCells(shieldCells(i.shield.fx, i.shield.slot, ellipse, CONTACT_SHIELD_CELL, nose, star)), cell: CONTACT_SHIELD_CELL } : null;
  return {
    art, shield, statusY: box.y + box.h + 6,
    contact: Contact.Enemy, title: 'ENEMY SHIP',
    shields: { up: sys.shields, of: cls.shields.layers },
    hull: { value: sys.hull, fill: Math.max(0, Math.min(1, sys.hull / cls.hull)) },
    box, outline: placed, rooms, lockRoom, roomClick, torpRoom: crewSys.torpLock >= 0 ? crewSys.torpLock : null,
    weapons, aim: i.aim && weapons !== null, aimWeapon: i.aim && weapons !== null ? weapon : null,
    scan: scanButton(state, Contact.Enemy, i.station), lines,
    flash: (i.flashes ?? []).flatMap((f) => { const r = rooms[f.room]; return r && f.alpha > 0 ? [{ room: f.room, points: r.points, alpha: f.alpha }] : []; })
  };
}
