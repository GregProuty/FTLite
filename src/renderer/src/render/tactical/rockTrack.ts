// Asteroids-iii §7.1, §13.5 (renderer only): each rock slot's last two places for smooth motion, view-owned and never
// hashed. A rail is drawn at tick − gap·(1 − α) by rotating its centre and offset (any Math here: renderer), gap the whole
// ticks between the last two observed ticks (1 on a host, about 3 on a guest, whose α spans the publication gap); a free
// rock is lerped from its last observed position. A slot's history resets when its kind or r changes or it jumps more
// than JUMP_RESET_U between ticks, which covers slot reuse on guests (who get no rock events). Look pass (docs/
// superpowers/specs/2026-11-20-asteroids-look-design.md §2): no trails are kept or drawn.
import { isRail, RockKind, rockSlots, ROCK_STRIDE, rockX, rockY } from '../../sim/tactical/rocks';
import { orbitRate, SPIN_RATE } from '../../sim/tactical/rails';
import type { TacticalState } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
import type { Point } from './camera';

export const JUMP_RESET_U = 50;
export interface RockTrack { tick: number; gap: number; n: number; kind: Float64Array; r: Float64Array; px: Float64Array; py: Float64Array; cx: Float64Array; cy: Float64Array }

export function createRockTrack(): RockTrack {
  return { tick: -1, gap: 1, n: 0, kind: new Float64Array(0), r: new Float64Array(0), px: new Float64Array(0), py: new Float64Array(0), cx: new Float64Array(0), cy: new Float64Array(0) };
}
export function resetRockTrack(t: RockTrack): void { t.tick = -1; t.gap = 1; }
function sized(t: RockTrack, n: number): void {
  Object.assign(t, { n, tick: -1, gap: 1, kind: new Float64Array(n), r: new Float64Array(n), px: new Float64Array(n), py: new Float64Array(n), cx: new Float64Array(n), cy: new Float64Array(n) });
}
/** Once per frame: on a new tick, record the tick gap (the ticks since the last one seen, at least 1), shift each slot's
 *  positions and reset what changed. */
export function updateRockTrack(t: RockTrack, s: TacticalState): void {
  const n = rockSlots(s);
  if (t.n !== n) sized(t, n);
  if (s.tick === t.tick) return;
  const first = t.tick < 0 || s.tick < t.tick;
  t.gap = first ? 1 : Math.max(1, s.tick - t.tick);
  for (let k = 0; k < n; k++) {
    const kind = s.rocks[k * ROCK_STRIDE]!;
    if (kind === RockKind.Gone) { t.kind[k] = 0; continue; }
    const x = rockX(s, k), y = rockY(s, k), r = s.rocks[k * ROCK_STRIDE + 5]!;
    const reset = first || t.kind[k] !== kind || t.r[k] !== r || Math.hypot(x - t.cx[k]!, y - t.cy[k]!) > JUMP_RESET_U;
    if (reset) { t.px[k] = x; t.py[k] = y; } else { t.px[k] = t.cx[k]!; t.py[k] = t.cy[k]!; }
    t.cx[k] = x; t.cy[k] = y; t.kind[k] = kind; t.r[k] = r;
  }
  t.tick = s.tick;
}
/** The tick a rail and an outline's spin are drawn at this frame: tick − gap·(1 − α), from the last observed tick at α 0
 *  to this one at α 1 (gap 1 without a track: tick − 1 + α). */
export function rockDrawTick(t: RockTrack | null, s: TacticalState, alpha: number): number {
  return s.tick - (t ? t.gap : 1) * (1 - alpha);
}
/** Where to draw rock k this frame: a rail at rockDrawTick (its anchor at least), a free rock lerped from its last tick. */
export function rockDrawPos(t: RockTrack | null, s: TacticalState, k: number, alpha: number): Point {
  const v = s.rocks, b = k * ROCK_STRIDE;
  if (isRail(v[b]!)) {
    const cx = v[b + 1]!, cy = v[b + 2]!, ox = v[b + 3]!, oy = v[b + 4]!, n = Math.max(0, rockDrawTick(t, s, alpha) - v[b + 7]!);
    const ac = (orbitRate(Math.hypot(cx, cy)) * n) / TICK_HZ, ao = ac + (v[b] === RockKind.Tumble ? (SPIN_RATE * n) / TICK_HZ : 0);
    return { x: Math.cos(ac) * cx - Math.sin(ac) * cy + Math.cos(ao) * ox - Math.sin(ao) * oy, y: Math.sin(ac) * cx + Math.cos(ac) * cy + Math.sin(ao) * ox + Math.cos(ao) * oy };
  }
  if (!t || t.tick !== s.tick || k >= t.n) return { x: v[b + 1]!, y: v[b + 2]! };
  return { x: t.px[k]! + (t.cx[k]! - t.px[k]!) * alpha, y: t.py[k]! + (t.cy[k]! - t.py[k]!) * alpha };
}
