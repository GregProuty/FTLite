// The duel interior's zoom and follow camera (interior zoom spec, 2026-11-17). Pure: no Pixi. The runtime (or the online
// source) records each frame's input into the camera; the interior view places its world from it every draw, against
// the fit, the painted bounds and the stage scale. Every level is a whole number of screen pixels per art pixel and every
// position a whole screen pixel, so the art stays crisp (Art-i spec section 4).
import type { Band, Fit } from '../worldFit';

/** The zoom levels, relative to the fit: one step out, four in. */
export const ZOOM_OUT_MAX = -1, ZOOM_IN_MAX = 4;

export interface Point { x: number; y: number }
/** Where the world goes: its scale and where ship-local (0,0) lands, in internal pixels. */
export interface Placement { scale: number; x: number; y: number }

export interface InteriorCamera {
  /** −1 .. +4; 0 is the fit. */
  level: number;
  /** Above level 0: centre on the active character (true) or hold the dragged view (false). */
  follow: boolean;
  /** The last placement drawn, which a drag and a cursor-anchored zoom start from (null: the fit). */
  last: Placement | null;
  /** The input recorded since the last placement. */
  notches: number;
  anchor: Point | null;
  dragX: number;
  dragY: number;
}

export function createInteriorCamera(): InteriorCamera {
  return { level: 0, follow: true, last: null, notches: 0, anchor: null, dragX: 0, dragY: 0 };
}

/** One frame's input: zoom steps (positive in), the cursor for a wheel zoom (null: the band's centre), a drag, and C. */
export interface InteriorInput { notches: number; anchor: Point | null; dragX: number; dragY: number; follow: boolean }
export function interiorInput(cam: InteriorCamera, input: InteriorInput): void {
  if (input.follow) { cam.follow = true; cam.dragX = 0; cam.dragY = 0; }
  cam.dragX += input.dragX; cam.dragY += input.dragY;
  if (input.notches !== 0) { cam.notches += input.notches; cam.anchor = input.anchor; }
}

const clearPending = (cam: InteriorCamera): void => { cam.notches = 0; cam.anchor = null; cam.dragX = 0; cam.dragY = 0; };

/** A new round: the fit again, following. */
export function resetInteriorCamera(cam: InteriorCamera): void { Object.assign(cam, createInteriorCamera()); }

/** Tab: the level stays, the view follows the newly active character. */
export function refollowInteriorCamera(cam: InteriorCamera): void { cam.follow = true; clearPending(cam); }

/** Screen pixels per art pixel at a level, for a fit of k: max(1, k + level), k made whole first when the fit could not snap. */
export function artPxAt(k: number, level: number): number {
  if (level === 0) return k;
  return Math.min(Math.round(k) + ZOOM_IN_MAX, Math.max(1, Math.round(k) + level));
}

/** The lowest level that is still a step: −1 unless it would be no smaller than the fit. */
export function minLevel(k: number): number { return artPxAt(k, ZOOM_OUT_MAX) < k - 1e-9 ? ZOOM_OUT_MAX : 0; }

/** `rect`: the ship's painted (or tile) bounds in ship-local pixels; `fit`: the band fit at level 0; `stage`: the letterbox scale. */
export interface InteriorGeometry { band: Band; rect: { x: number; y: number; w: number; h: number }; fit: Fit; stage: number }

/** One axis: centred when the ship is no larger than the band, otherwise kept so neither ship edge comes inside the band's. */
function clampAxis(p: number, s: number, bandMin: number, bandLen: number, rectMin: number, rectLen: number): number {
  const len = rectLen * s;
  if (len <= bandLen) return bandMin + (bandLen - len) / 2 - rectMin * s;
  return Math.min(bandMin - rectMin * s, Math.max(bandMin + bandLen - (rectMin + rectLen) * s, p));
}

/**
 * The world's placement this frame, consuming the recorded input: a drag (above level 0) first, at the old scale, which
 * stops the follow; then the zoom; then the follow (centred on `target`, ship-local pixels), the cursor or band-centre
 * anchor, or the centred ship at level 0 or below; then the clamp and whole screen pixels. Level 0 is exactly the fit.
 */
export function placeInterior(cam: InteriorCamera, g: InteriorGeometry, target: Point | null): Placement {
  const { band, rect, fit, stage } = g, k = 2 * fit.scale * stage;
  const scaleAt = (level: number): number => (level === 0 ? fit.scale : artPxAt(k, level) / (2 * stage));
  const old = cam.last ?? { scale: fit.scale, x: fit.x, y: fit.y };
  const clamp = (p: Placement): Placement => ({ scale: p.scale, x: clampAxis(p.x, p.scale, band.x, band.w, rect.x, rect.w), y: clampAxis(p.y, p.scale, band.y, band.h, rect.y, rect.h) });
  let from = old;
  if (cam.level > 0 && (cam.dragX !== 0 || cam.dragY !== 0)) { cam.follow = false; from = clamp({ scale: old.scale, x: old.x + cam.dragX, y: old.y + cam.dragY }); }
  const zoomed = cam.notches !== 0;
  cam.level = Math.max(minLevel(k), Math.min(ZOOM_IN_MAX, cam.level + cam.notches));
  if (cam.level <= 0) cam.follow = true;   // back at the fit (or out): the next zoom in follows the character again
  const anchor = zoomed && cam.anchor ? cam.anchor : { x: band.x + band.w / 2, y: band.y + band.h / 2 };
  clearPending(cam);
  let out: Placement;
  if (cam.level === 0) out = { scale: fit.scale, x: fit.x, y: fit.y };
  else {
    const s = scaleAt(cam.level), cx = band.x + band.w / 2, cy = band.y + band.h / 2;
    const raw = cam.level < 0 ? { scale: s, x: 0, y: 0 }   // centred by the clamp
      : cam.follow ? { scale: s, x: cx - (target?.x ?? rect.x + rect.w / 2) * s, y: cy - (target?.y ?? rect.y + rect.h / 2) * s }
      : { scale: s, x: anchor.x - ((anchor.x - from.x) / from.scale) * s, y: anchor.y - ((anchor.y - from.y) / from.scale) * s };
    const c = clamp(raw), whole = (v: number): number => Math.round(v * stage) / stage;
    out = { scale: s, x: whole(c.x), y: whole(c.y) };
  }
  cam.last = out;
  return out;
}
