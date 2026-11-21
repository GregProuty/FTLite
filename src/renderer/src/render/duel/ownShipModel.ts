// The own ship window (own ship window spec §2, §4): the crew's real interior shrunk into the window's box, in the amber
// CRT ramp, with fire, damage, crew, hull and shields resolved here (colours and blinks), so React does no blinking.
// Pure: no React, no Pixi. Also the fire watch the scene keeps for the border's fire-start flash.
import { extinguishProgress, pointBurning } from '../../sim/duel/fire';
import type { DuelState } from '../../sim/duel/state';
import { Life, LifeState, Position } from '../../sim/components';
import { classOf, CREW_SLOT } from '../../sim/tactical/state';
import { ALERT_BLINK_HZ, blink, CRT, DAMAGE_BLINK_HZ, HATCH_ANGLE, HATCH_SPACING, roomLevel } from '../tactical/crtTheme';
import { hatchSegments } from '../tactical/dashModel';
import { HIT_FRESH_TICKS } from '../impactModel';
import { BATTLEMAPS } from '../battlemapModel';
import { bubbleAlpha, shieldCells, type Ellipse, type ShieldFx } from '../shieldFx';
import { interiorFrame } from './enemyShots';

type Box = { x: number; y: number; w: number; h: number };

export interface OwnShipView {
  shields: { up: number; of: number };
  /** `block`: the resolved inverse-block colour while `alert` (hull at or below a quarter), else null. */
  hull: { value: number; fill: number; alert: boolean; block: number | null };
  /** One per room tile, internal px, `s` the tile size. */
  tiles: { x: number; y: number; s: number; fill: number }[];
  /** Outline segments [x1, y1, x2, y2, ...] grouped by colour. */
  edges: { colour: number; segments: number[] }[];
  /** Level-2 hatch segments in their lit phase (drawn CRT.main), else []. */
  hatch: number[];
  /** The 2 px bar under each burning room whose extinguish has begun. */
  fires: { x: number; y: number; w: number; progress: number }[];
  /** Crew centres, internal px. */
  crew: { x: number; y: number; downed: boolean }[];
  /** The border is in the lit phase of its fire-start flash. */
  flash: boolean;
  /** UI round Part 3 §3.5: the painted ship in the tiles' px transform (clipped by the window), or null. */
  painting: { url: string; x: number; y: number; w: number; h: number } | null;
  /** The shield bubble and shimmering hex cells (ellipse = the tiles' bounding box, radii 0.56 x), when a fx is given. */
  shield: { ellipse: Ellipse; bubble: number; cells: { x: number; y: number; alpha: number }[]; cell: number } | null;
  /** The tile fill opacity: 0.6 over a painting, else 1. */
  tileOpacity: number;
}

export interface OwnRoomLook { fill: number; outline: number; hatch: boolean }

/** Spec §2's look table. Fire overrides damage; damage never uses CRT.hot; fire never hatches. */
export function ownRoomLook(level: 0 | 1 | 2, burning: boolean, t: number): OwnRoomLook {
  if (burning) return { fill: blink(t, ALERT_BLINK_HZ) === 1 ? CRT.hot : CRT.mid, outline: CRT.hot, hatch: false };
  if (level === 0) return { fill: CRT.glass, outline: CRT.main, hatch: false };
  return { fill: CRT.dim, outline: CRT.main, hatch: level === 2 && blink(t, DAMAGE_BLINK_HZ) === 1 };
}

/** Spec §4: the uniform tile size (floored when at least 3 px) and the grid's whole-pixel origin, centred in `box`. */
export function ownShipFit(gw: number, gh: number, box: Box): { s: number; ox: number; oy: number } {
  let s = Math.min(box.w / gw, box.h / gh);
  if (s >= 3) s = Math.floor(s);
  return { s, ox: Math.round(box.x + (box.w - gw * s) / 2), oy: Math.round(box.y + (box.h - gh * s) / 2) };
}

/** Spec §4: tile k's sides whose neighbour is not a tile of the same room (owner[k], -1 none), pushed to `out`. */
export function tileEdges(owner: ArrayLike<number>, gw: number, gh: number, k: number, s: number, ox: number, oy: number, out: number[]): void {
  const cx = k % gw, cy = (k - cx) / gw, room = owner[k]!, x = ox + cx * s, y = oy + cy * s;
  const other = (nx: number, ny: number): boolean => nx < 0 || ny < 0 || nx >= gw || ny >= gh || owner[ny * gw + nx] !== room;
  if (other(cx, cy - 1)) out.push(x, y, x + s, y);
  if (other(cx, cy + 1)) out.push(x, y + s, x + s, y + s);
  if (other(cx - 1, cy)) out.push(x, y, x, y + s);
  if (other(cx + 1, cy)) out.push(x + s, y, x + s, y + s);
}

/** UI round Part 3 §3.5: the shield shimmer's hex cell radius (px) in the own ship window. */
export const OWN_SHIELD_CELL = 4;
/** The painting under the tiles: its image, and the shield fx. Absent draws as before (no painting, no shield). */
export interface OwnShipLook { painting: { url: string; w: number; h: number } | null; fx: ShieldFx }

export function ownShipModel(d: DuelState, box: Box, t: number, flashUntil: number, paint?: OwnShipLook): OwnShipView {
  const st = d.interior, dv = st.derived, gw = dv.width, gh = dv.height, { s, ox, oy } = ownShipFit(gw, gh, box);
  const def = paint?.painting ? BATTLEMAPS[st.layout.id] ?? null : null, img = paint?.painting ?? null;
  const painted = !!img && !!def;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  const sys = d.tactical.systems[CREW_SLOT]!, cls = classOf(d.tactical, CREW_SLOT);
  const tiles: OwnShipView['tiles'] = [], byColour = new Map<number, number[]>(), hatch: number[] = [], fires: OwnShipView['fires'] = [];
  dv.roomTiles.forEach((roomTiles, room) => {
    if (roomTiles.length === 0) return;
    const p = d.points.find((q) => q.room === room), burning = !!p && pointBurning(d, p);
    const look = ownRoomLook(p ? roomLevel(sys.rooms[p.tacticalRoom]!) : 0, burning, t);
    const segs = byColour.get(look.outline) ?? []; byColour.set(look.outline, segs);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of roomTiles) {
      const cx = k % gw, cy = (k - cx) / gw, x = ox + cx * s, y = oy + cy * s;
      if (!painted || look.fill !== CRT.glass) tiles.push({ x, y, s, fill: look.fill });   // over a painting only the damaged and burning tiles draw
      bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x + s); by1 = Math.max(by1, y + s);
      tileEdges(dv.roomOfTile, gw, gh, k, s, ox, oy, segs);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + s); y1 = Math.max(y1, y + s);
    }
    if (look.hatch) hatch.push(...hatchSegments([x0, y0, x1, y0, x1, y1, x0, y1], HATCH_SPACING, HATCH_ANGLE));
    if (burning && p) { const progress = extinguishProgress(d, p); if (progress > 0) fires.push({ x: x0, y: y1 - 2, w: x1 - x0, progress }); }
  });
  const alert = sys.hull <= cls.hull / 4;
  const painting = painted ? { url: img!.url, x: ox + def!.origin.x * s, y: oy + def!.origin.y * s, w: img!.w / def!.pxPerTile * s, h: img!.h / def!.pxPerTile * s } : null;
  let shield: OwnShipView['shield'] = null;
  if (paint && Number.isFinite(bx0)) {
    const ellipse: Ellipse = { cx: (bx0 + bx1) / 2, cy: (by0 + by1) / 2, rx: 0.56 * (bx1 - bx0), ry: 0.56 * (by1 - by0) };
    const fr = interiorFrame(d, { x: 0, y: 0, w: gw, h: gh });   // tile to px is a uniform scale plus offset, so the unit vectors carry over
    shield = { ellipse, bubble: bubbleAlpha(paint.fx, CREW_SLOT, sys.shields), cells: shieldCells(paint.fx, CREW_SLOT, ellipse, OWN_SHIELD_CELL, fr.nose, fr.star), cell: OWN_SHIELD_CELL };
  }
  return {
    painting, shield, tileOpacity: painted ? 0.6 : 1,
    shields: { up: sys.shields, of: Math.max(cls.shields.layers, sys.shields) },
    hull: { value: sys.hull, fill: Math.max(0, Math.min(1, sys.hull / cls.hull)), alert, block: alert ? (blink(t, ALERT_BLINK_HZ) === 1 ? CRT.hot : CRT.main) : null },
    tiles,
    edges: [...byColour].filter(([, segments]) => segments.length > 0).map(([colour, segments]) => ({ colour, segments })),
    hatch, fires,
    crew: st.crew.map((eid) => ({ x: ox + Position.x[eid]! * s, y: oy + Position.y[eid]! * s, downed: Life.state[eid] === LifeState.Downed })),
    flash: t < flashUntil && blink(t, ALERT_BLINK_HZ) === 1
  };
}

/** Spec §4: the border's fire-start flash, in presentation seconds. */
export const FIRE_FLASH_S = 2;
export interface FireWatch { tick: number; burning: boolean[] }

/** Spec §4: one drawn frame of the fire watch. No watch, a stale tick (back, or more than HIT_FRESH_TICKS on) or a
 *  changed length re-baselines with no flash; otherwise a point room burning now that did not before flashes. The scene
 *  passes null after an epoch reset. */
export function fireWatch(w: FireWatch | null, d: DuelState, t: number, flashUntil: number): { watch: FireWatch; flashUntil: number } {
  const burning = d.points.map((p) => pointBurning(d, p)), tick = d.tactical.tick, watch = { tick, burning };
  const fresh = !!w && tick >= w.tick && tick - w.tick <= HIT_FRESH_TICKS && w.burning.length === burning.length;
  if (!fresh) return { watch, flashUntil };
  return { watch, flashUntil: burning.some((b, k) => b && !w!.burning[k]) ? t + FIRE_FLASH_S : flashUntil };
}
