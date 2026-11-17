// Draws one painted blast (art spike) into a Graphics at presentation time `t`: lingering round smoke puffs, a shockwave
// ring, an ink-outlined starburst fireball (white-yellow core to orange to deep red), inked debris shards, bright spark
// streaks and a first-instant white flash. Smooth sizes, no art-pixel snapping.
import type { Graphics } from 'pixi.js';
import type { Blast } from '../blastModel';
import { BLAST_RADIUS, blastHash, blastProgress, burstPoints } from './blastShapes';
import { ease, easeOut, FLAME, INK, mix, SMOKE_TONES } from './ink';

const LINE = { color: INK, join: 'round', cap: 'round' } as const;

/** Draws the blast into `g` (cleared by the caller) and its smoke cloud into `smoke` (cleared here). Returns the cloud's
 *  opacity: the caller fades it as one layer (an AlphaFilter), since a Graphics' own alpha shows every overlap through. */
export function drawPaintedBlast(smoke: Graphics, g: Graphics, b: Blast, t: number): number {
  const u = blastProgress(b, t), R = BLAST_RADIUS[b.kind], room = b.kind === 'room', { x, y } = b;
  // Smoke puffs, behind everything (their own Graphics, so the merged cloud fades as one): they billow out, rise a
  // little and linger to the end; one ink edge round the whole cloud, a mid grey body and light tops.
  smoke.clear();
  const puffs = room ? 7 : 3, cloud: [number, number, number][] = [];
  if (u > 0.08) for (let k = 0; k < puffs; k++) {
    const a = (k / puffs) * Math.PI * 2 + blastHash(b, 10 + k) * 0.9, grow = easeOut((u - 0.08) / 0.6);
    const dist = R * (0.2 + 0.55 * grow) * (0.7 + 0.5 * blastHash(b, 20 + k)), rad = R * (0.28 + 0.32 * grow) * (0.75 + 0.5 * blastHash(b, 30 + k));
    cloud.push([x + Math.cos(a) * dist, y + Math.sin(a) * dist - R * 0.35 * u, rad]);
  }
  for (const [px, py, r] of cloud) smoke.circle(px, py, r);
  if (cloud.length) smoke.stroke({ width: 4, color: INK });
  for (const [px, py, r] of cloud) smoke.circle(px, py, r);
  if (cloud.length) smoke.fill(SMOKE_TONES[1]);
  for (const [px, py, r] of cloud) smoke.circle(px - r * 0.18, py - r * 0.22, r * 0.62);
  if (cloud.length) smoke.fill(SMOKE_TONES[0]);
  const cloudAlpha = 0.85 * (1 - ease((u - 0.5) / 0.5));
  // The shockwave: a pale ring with an ink edge, racing out and thinning.
  if (u < 0.45) {
    const v = u / 0.45, r = R * (0.5 + 1.7 * easeOut(v)), w = Math.max(0.5, (room ? 6 : 3.5) * (1 - v));
    if (v > 0.15) g.circle(x, y, r).stroke({ width: w + 3, color: INK, alpha: 0.5 * (1 - v) });
    g.circle(x, y, r).stroke({ width: w, color: FLAME[0], alpha: 0.9 * (1 - v) });
  }
  // The fireball: grows fast, then shrinks and darkens as it burns out.
  if (u < 0.6) {
    const s = (0.4 + 0.6 * easeOut(u / 0.14)) * (1 - 0.65 * ease((u - 0.18) / 0.42)), heat = ease((u - 0.12) / 0.45), spikes = room ? 11 : 7;
    const alpha = 1 - ease((u - 0.45) / 0.15), turn = blastHash(b, 1) * Math.PI;
    if (s > 0.02) {
      g.poly(burstPoints(b, x, y, R * s, spikes, 0.62, turn, 100)).fill({ color: mix(FLAME[3], FLAME[4], heat), alpha }).stroke({ width: 3.5, alpha, ...LINE });
      g.poly(burstPoints(b, x, y, R * s * 0.74, spikes, 0.66, turn + 0.25, 200)).fill({ color: mix(FLAME[2], FLAME[3], heat), alpha });
      g.poly(burstPoints(b, x, y, R * s * 0.5, spikes - 2, 0.7, turn + 0.5, 300)).fill({ color: mix(FLAME[1], FLAME[2], heat), alpha });
      g.circle(x, y, R * s * 0.26 * (1 - heat * 0.7)).fill({ color: FLAME[0], alpha });
    }
  }
  // Debris: inked shards thrown out, tumbling, falling still at the end.
  const shards = room ? 8 : 4;
  for (let k = 0; k < shards; k++) {
    const a = (k / shards) * Math.PI * 2 + blastHash(b, 50 + k) * 0.8, d = R * (0.2 + (1.3 + 0.6 * blastHash(b, 60 + k)) * easeOut(u * 1.4));
    const size = (room ? 4.5 : 3) * (0.7 + 0.6 * blastHash(b, 70 + k)), spin = blastHash(b, 80 + k) * 6 + u * 9 * (k % 2 ? 1 : -1);
    const fade = 1 - ease((u - 0.65) / 0.35), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (fade <= 0) continue;
    const pts: number[] = [];
    for (let j = 0; j < 3; j++) { const q = spin + j * 2.1 + (j === 1 ? 0.6 : 0); pts.push(px + Math.cos(q) * size * (j === 0 ? 1.4 : 1), py + Math.sin(q) * size * (j === 0 ? 1.4 : 1)); }
    g.poly(pts).fill({ color: u < 0.25 ? FLAME[2] : SMOKE_TONES[3], alpha: fade }).stroke({ width: 1.5, alpha: fade, ...LINE });
  }
  // Sparks: short bright streaks flying out in the first moments.
  if (u < 0.4) {
    const v = u / 0.4, n = room ? 10 : 7;
    for (let k = 0; k < n; k++) {
      const a = blastHash(b, 90 + k) * Math.PI * 2, d0 = R * (0.3 + 1.6 * easeOut(v)) * (0.6 + 0.6 * blastHash(b, 110 + k)), len = R * 0.32 * (1 - v);
      g.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0).lineTo(x + Math.cos(a) * (d0 + len), y + Math.sin(a) * (d0 + len)).stroke({ width: 2, color: k % 3 ? FLAME[1] : FLAME[0], alpha: 1 - v, cap: 'round' });
    }
  }
  // The first instant: a white flash at the centre.
  if (u < 0.12) {
    const f = 1 - u / 0.12, r = R * 0.48 * (1 + u * 3);
    g.poly(burstPoints(b, x, y, r * 1.45, 9, 0.55, 0.3, 400)).fill({ color: FLAME[1], alpha: f }).stroke({ width: 2.5, alpha: f, ...LINE });
    g.poly(burstPoints(b, x, y, r * 1.0, 9, 0.6, 0.65, 500)).fill({ color: FLAME[0], alpha: f });
  }
  return cloudAlpha;
}
