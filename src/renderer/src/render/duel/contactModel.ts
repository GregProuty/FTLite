// The contact window's view model (enemy ship window spec §4.2, §6.4). Pure: one map contact (here an enemy ship) as
// screen-ready data in internal px: the title, shields and hull, the hull outline and its rooms fitted to the drawing
// box with each room's resolved damage look for this frame's blink phase, the laser's lock room, and the Weapons
// station's weapon list. `t` is the scene's presentation clock (performance.now() / 1000), so the window blinks with
// the map frame for frame; React draws only what this returns.
import { classOf, CREW_SLOT, type TacticalState } from '../../sim/tactical/state';
import { blink, DAMAGE_BLINK_HZ, HATCH_ANGLE, HATCH_SPACING, roomLevel, roomLook } from '../tactical/crtTheme';
import { hatchSegments } from '../tactical/dashModel';
import { HULLS, hullFor, roomCentre } from '../tactical/hullModel';
import { CONTACT_BOX } from './consoleLayout';
import type { WeaponsPanel } from './consoleModel';

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
export interface ContactView {
  title: string;
  shields: { up: number; of: number };
  hull: { value: number; fill: number };
  /** The drawing box in internal px (CONTACT_BOX). */
  box: { x: number; y: number; w: number; h: number };
  outline: number[];
  rooms: ContactRoom[];
  /** The crew laser's lock room, only while the shown ship is its target slot. */
  lockRoom: number | null;
  /** Weapons only: LASER (the station block's charge row) and MISSILE (not aimable). */
  weapons: null | { laser: ContactLaser; missile: { magazine: number } };
  /** The aim is armed (Weapons only). */
  aim: boolean;
  /** Duel polish i spec §B: each struck room's flash, its polygon and fill alpha (a hot fill fading 0.6 to 0). */
  flash: { room: number; points: number[]; alpha: number }[];
}
export interface ContactModelInput {
  state: TacticalState;
  /** The shown ship slot. */
  ship: number;
  aim: boolean;
  station: 'helm' | 'weapons';
  /** Presentation seconds, for the damage blink. */
  t: number;
  /** The Weapons station block's panel (its charge row), or null at the Helm. */
  weapons: Pick<WeaponsPanel, 'charge'> | null;
  /** Duel polish i spec §B: the shown ship's struck rooms and their flash alphas now (hitModel flashesFor); default none. */
  flashes?: readonly { room: number; alpha: number }[];
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

export function contactModel(i: ContactModelInput): ContactView | null {
  const { state } = i, body = state.ships[i.ship];
  if (!body || !body.active) return null;
  const sys = state.systems[i.ship]!, cls = classOf(state, i.ship), crew = state.systems[CREW_SLOT];
  const hull = hullFor(false), shape = HULLS[hull], box = { x: CONTACT_BOX.x, y: CONTACT_BOX.y, w: CONTACT_BOX.w, h: CONTACT_BOX.h };
  const at = contactFit(shape.outline, box);
  const place = (poly: readonly number[]): number[] => {
    const out: number[] = [];
    for (let k = 0; k + 1 < poly.length; k += 2) { const p = at(poly[k]!, poly[k + 1]!); out.push(p.x, p.y); }
    return out;
  };
  const phase = blink(i.t, DAMAGE_BLINK_HZ), targeted = crew.target === i.ship;
  const rooms: ContactRoom[] = shape.rooms.map((poly, r) => {
    const look = roomLook(false, roomLevel(sys.rooms[r] ?? 0), phase), points = place(poly), c = roomCentre(hull, r);
    return {
      label: ROOM_LABELS[r] ?? '', centre: at(c.f, c.s), points, fill: look.fill, stroke: look.stroke,
      hatch: look.hatch === null ? null : { colour: look.hatch, segments: hatchSegments(points, HATCH_SPACING, HATCH_ANGLE) }
    };
  });
  const weapons = i.station === 'weapons' && i.weapons
    ? {
        laser: { label: i.weapons.charge.label, value: i.weapons.charge.value, fill: i.weapons.charge.bar?.fill ?? 0, lit: i.aim, enabled: targeted, note: targeted ? null : 'NOT TARGETED' },
        missile: { magazine: crew.magazine }
      }
    : null;
  return {
    title: 'ENEMY SHIP',
    shields: { up: sys.shields, of: cls.shields.layers },
    hull: { value: sys.hull, fill: Math.max(0, Math.min(1, sys.hull / cls.hull)) },
    box, outline: place(shape.outline), rooms,
    lockRoom: targeted ? crew.lock : null,
    weapons,
    aim: i.aim && weapons !== null,
    flash: (i.flashes ?? []).flatMap((f) => { const r = rooms[f.room]; return r && f.alpha > 0 ? [{ room: f.room, points: r.points, alpha: f.alpha }] : []; })
  };
}
