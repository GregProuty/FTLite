// Net-4a §3.8: correction smoothing. A re-simulation (a correction or a retarget) replaces P at once, so the drawn world
// would jump. Each ship and missile instead keeps a visual offset, shown minus new, that decays linearly to zero over
// SMOOTH_MS; a second correction inside it adds to what is still shown. Rock jump brief §2: the rocks keep one draw-tick
// offset the same way (P's tick shown minus new, which a retarget moves). Drawing only: the sim, P and the predictor's
// rules do not change. Pure, with no Pixi; the caller passes the time.
import type { PredictedBodies, PredictedBody } from '../../clientControl/duelPredictor';
import { HEADING_COUNT } from '../../sim/tactical/tuning';

/** §3.8: how long a correction's offset takes to decay to zero. */
export const SMOOTH_MS = 100;
/** A position offset past this many units is a respawn or a teleport, not a correction: that body jumps, as before. */
export const SMOOTH_MAX_U = 200;

export interface BodyOffset { x: number; y: number; h: number }
export interface SmoothOffsets { ships: (BodyOffset | null)[]; missiles: (BodyOffset | null)[] }
/** One body's offset when set and the time it was set; it decays from there. */
interface Held { x: number; y: number; h: number; at: number }

const decayed = (o: Held | null, now: number): BodyOffset | null => {
  if (!o) return null;
  const k = 1 - (now - o.at) / SMOOTH_MS;
  return k > 0 ? { x: o.x * k, y: o.y * k, h: o.h * k } : null;
};
/** The new offset of one body: what is still shown plus before − after (the heading the short way round), or null when the
 *  body appeared or went (a presence change) or moved past the sanity bound. */
function shifted(was: Held | null, before: PredictedBody | null | undefined, after: PredictedBody | null | undefined, now: number): Held | null {
  if (!before || !after) return null;
  const cur = decayed(was, now), dx = before.x - after.x + (cur?.x ?? 0), dy = before.y - after.y + (cur?.y ?? 0);
  if (dx * dx + dy * dy > SMOOTH_MAX_U * SMOOTH_MAX_U) return null;
  let dh = before.h - after.h; dh -= Math.round(dh / HEADING_COUNT) * HEADING_COUNT;
  const h = dh + (cur?.h ?? 0);
  return dx === 0 && dy === 0 && h === 0 ? null : { x: dx, y: dy, h, at: now };
}

const tickDecayed = (o: { v: number; at: number } | null, now: number): number => { if (!o) return 0; const k = 1 - (now - o.at) / SMOOTH_MS; return k > 0 ? o.v * k : 0; };

export function createCorrectionSmoother() {
  let ships: (Held | null)[] = [], missiles: (Held | null)[] = [], tick: { v: number; at: number } | null = null;
  return {
    /** A re-simulation moved P from `before` to `after` at `now`: each ship and missile keeps showing where it was, and
     *  the rocks the tick they were drawn at (`ticks`: P's tick before minus after, a retarget's size taken back). */
    shift(before: PredictedBodies, after: PredictedBodies, now: number, ticks = 0): void {
      ships = after.ships.map((a, i) => shifted(ships[i] ?? null, before.ships[i], a, now));
      missiles = after.missiles.map((a, i) => shifted(missiles[i] ?? null, before.missiles[i], a, now));
      const v = ticks + tickDecayed(tick, now); tick = v === 0 ? null : { v, at: now };
    },
    /** The offsets to add to the drawn bodies at `now` (null: none), by ship slot; missiles by owner. */
    offsets(now: number): SmoothOffsets { return { ships: ships.map((o) => decayed(o, now)), missiles: missiles.map((o) => decayed(o, now)) }; },
    /** Rock jump brief §2: the draw-tick offset to add to the rocks at `now` (0: none). */
    tickOffset: (now: number): number => tickDecayed(tick, now),
    clear(): void { ships = []; missiles = []; tick = null; }
  };
}
export type CorrectionSmoother = ReturnType<typeof createCorrectionSmoother>;
