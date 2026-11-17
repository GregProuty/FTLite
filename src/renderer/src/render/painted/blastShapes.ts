// Painted blasts (art spike): the timing and the shapes of an ink-outlined explosion on a painted ship. The live list,
// the cap and the frame clock are blastModel.ts's (liveBlasts, blastFrame): these timings are 60 "frames" a second so a
// blast holds in a hitstop and a pause and is removed at its end exactly as the bought one. Pure: no Pixi.
import { TILE_PX } from '../../../../shared/resolution';
import type { Blast, BlastTimings } from '../blastModel';
import { hash2 } from '../particles/random';

/** A room blast lasts 1.1 s (the smoke lingers), a hit spark 0.5 s. */
export const PAINTED_TIMING: BlastTimings = { room: { frames: 66, fps: 60 }, hit: { frames: 30, fps: 60 } };
/** The fireball's full radius in world units. */
export const BLAST_RADIUS = { room: TILE_PX * 1.25, hit: TILE_PX * 0.6 } as const;

/** 0 at the blast's start to 1 at its end. */
export function blastProgress(b: Blast, t: number): number {
  const k = PAINTED_TIMING[b.kind];
  return Math.min(1, Math.max(0, (t - b.start) * k.fps / k.frames));
}

/** A per-blast hash in [0, 1) for detail `k` (spike lengths, debris angles): from the blast's place and start, never a random source. */
export function blastHash(b: Blast, k: number): number {
  return hash2(Math.round(b.x) * 7919 + Math.round(b.y), k * 131 + Math.round(b.start * 60));
}

/** A starburst outline as flat [x, y, ...] points: `spikes` points out to `radius`, valleys in at `radius x inner`, each
 *  spike's length jittered by the blast's hash, turned by `turn` radians. */
export function burstPoints(b: Blast, cx: number, cy: number, radius: number, spikes: number, inner: number, turn: number, salt: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < spikes * 2; k++) {
    const a = turn + (k / (spikes * 2)) * Math.PI * 2, jitter = 0.78 + 0.44 * blastHash(b, salt + k);
    const r = (k % 2 === 0 ? radius : radius * inner) * jitter;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}
