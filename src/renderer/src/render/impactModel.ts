// Impact feel (Art-i spec section 7): the hit signals, the white flash, the art-pixel shake, the hitstop and the
// lingering smoke. Pure: no Pixi. The shake and the smoke run on the presentation clock; the flash counts sim ticks.
import { hitsCrew, type ViewEvent } from './tactical/fxModel';
import type { FeelScale } from './feel';

/** The flash lasts 2 sim ticks (33 ms) at full strength, whatever the frame rate; a hitstop does not extend it. */
export const FLASH_TICKS = 2, FLASH_ALPHA = 0.85, DUEL_FLASH_SHARE = 0.5;
/** 6 art pixels, decaying linearly to 0 over 0.25 s, in whole-art-pixel steps. */
export const SHAKE_ART_PX = 6, SHAKE_SECONDS = 0.25;
export const HITSTOP_SECONDS = 0.06;
export const SMOKE_SECONDS = 3;
/** A room's impactTick that changed since the last drawn frame counts as a hit only while this fresh (ticks), so a
 *  snapshot load or a long pause never replays an old impact. */
export const HIT_FRESH_TICKS = 10;

export interface Shake { left: number; amp: number; t: number }
export function createShake(): Shake { return { left: 0, amp: 0, t: 0 }; }

/** A hit: the shake restarts at its full amplitude (scaled by the feel), or keeps a stronger one still running. */
export function kickShake(s: Shake, feel: FeelScale): void {
  const now = s.left > 0 ? s.amp * (s.left / SHAKE_SECONDS) : 0;
  s.amp = Math.max(now, SHAKE_ART_PX * feel.shake); s.left = s.amp > 0 ? SHAKE_SECONDS : 0;
}

/** Advance by presentation seconds (a hitstop passes 0, so the shake holds). */
export function stepShake(s: Shake, pdt: number): void {
  if (s.left <= 0) return;
  s.left = Math.max(0, s.left - pdt); s.t += pdt;
}

/** The offset now, in world units of the shaken container's parent: a whole number of art pixels times `artPx` (the
 *  size of one art pixel there: 2 x the world scale). Zero when no shake runs. */
export function shakeOffset(s: Shake, artPx: number): { x: number; y: number } {
  if (s.left <= 0) return { x: 0, y: 0 };
  const a = s.amp * (s.left / SHAKE_SECONDS);
  return { x: (Math.round(Math.sin(s.t * 90) * a) || 0) * artPx, y: (Math.round(Math.cos(s.t * 77) * a) || 0) * artPx };
}

/** The flash's alpha `ticksSince` sim ticks after the hit was seen: FLASH_ALPHA x the feel for FLASH_TICKS ticks, then 0. */
export function flashAlpha(ticksSince: number, feel: FeelScale, share = 1): number {
  return ticksSince >= 0 && ticksSince < FLASH_TICKS ? FLASH_ALPHA * feel.flash * share : 0;
}

/**
 * Sector hits: the rooms whose impactTick changed since the last drawn frame and is fresh. The sim stamps impactTick
 * with the tick it resolved and then advances, so the drawn state's tick is already one past it; a change is the hit.
 * `seen` holds each room's impactTick at the last call (null on the first frame of a run: nothing is a hit). Returns
 * the hit rooms and the new `seen`.
 */
export function sectorHits(impactTick: ArrayLike<number>, tick: number, seen: Int32Array | null): { rooms: number[]; seen: Int32Array } {
  const next = Int32Array.from(impactTick), rooms: number[] = [];
  if (seen && seen.length === next.length) {
    for (let r = 0; r < next.length; r++) if (next[r]! >= 0 && next[r] !== seen[r] && tick - next[r]! <= HIT_FRESH_TICKS) rooms.push(r);
  }
  return { rooms, seen: next };
}

/** Duel hits: any view event this frame that is a hit on the crew ship (the feed the tactical effects read). */
export function duelHit(events: readonly ViewEvent[]): boolean { return events.some(hitsCrew); }
