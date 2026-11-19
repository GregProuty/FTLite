// Asteroids-iii §7.1, §13.5 (renderer only): each rock slot's history for smooth motion and trails, view-owned and never
// hashed. A rail is drawn at tick − 1 + α by rotating its centre and offset (any Math here: renderer); a free rock is lerped
// from its last-tick position. Free rocks keep a ring of TRAIL_LEN samples at TRAIL_HZ: a rock younger than YOUNG_AGE_S
// shows TRAIL_YOUNG_S of it, an older one TRAIL_OLD_S. A slot's history resets when its kind or r changes or it jumps more
// than JUMP_RESET_U between ticks, which covers slot reuse on guests (who get no rock events).
import { isRail, RockKind, rockSlots, ROCK_STRIDE, rockT, rockX, rockY } from '../../sim/tactical/rocks';
import { orbitRate, SPIN_RATE } from '../../sim/tactical/rails';
import type { TacticalState } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
import type { Point } from './camera';

export const TRAIL_HZ = 4, TRAIL_YOUNG_S = 25, TRAIL_OLD_S = 6, YOUNG_AGE_S = 60, JUMP_RESET_U = 50;
export const TRAIL_LEN = TRAIL_YOUNG_S * TRAIL_HZ;
const TRAIL_EVERY = TICK_HZ / TRAIL_HZ;
export interface RockTrack { tick: number; n: number; kind: Float64Array; r: Float64Array; px: Float64Array; py: Float64Array; cx: Float64Array; cy: Float64Array; trail: Float64Array; head: Int32Array; len: Int32Array }

export function createRockTrack(): RockTrack {
  return { tick: -1, n: 0, kind: new Float64Array(0), r: new Float64Array(0), px: new Float64Array(0), py: new Float64Array(0), cx: new Float64Array(0), cy: new Float64Array(0), trail: new Float64Array(0), head: new Int32Array(0), len: new Int32Array(0) };
}
export function resetRockTrack(t: RockTrack): void { t.tick = -1; t.len.fill(0); t.head.fill(0); }
function sized(t: RockTrack, n: number): void {
  Object.assign(t, { n, tick: -1, kind: new Float64Array(n), r: new Float64Array(n), px: new Float64Array(n), py: new Float64Array(n), cx: new Float64Array(n), cy: new Float64Array(n), trail: new Float64Array(n * TRAIL_LEN * 2), head: new Int32Array(n), len: new Int32Array(n) });
}
/** Once per frame: on a new tick, shift each slot's positions, reset what changed, and sample the free rocks' trails. */
export function updateRockTrack(t: RockTrack, s: TacticalState): void {
  const n = rockSlots(s);
  if (t.n !== n) sized(t, n);
  if (s.tick === t.tick) return;
  const first = t.tick < 0, sample = first || Math.floor(s.tick / TRAIL_EVERY) !== Math.floor(t.tick / TRAIL_EVERY);
  for (let k = 0; k < n; k++) {
    const kind = s.rocks[k * ROCK_STRIDE]!;
    if (kind === RockKind.Gone) { t.kind[k] = 0; t.len[k] = 0; continue; }
    const x = rockX(s, k), y = rockY(s, k), r = s.rocks[k * ROCK_STRIDE + 5]!;
    const reset = first || t.kind[k] !== kind || t.r[k] !== r || Math.hypot(x - t.cx[k]!, y - t.cy[k]!) > JUMP_RESET_U;
    if (reset) { t.px[k] = x; t.py[k] = y; t.len[k] = 0; t.head[k] = 0; } else { t.px[k] = t.cx[k]!; t.py[k] = t.cy[k]!; }
    t.cx[k] = x; t.cy[k] = y; t.kind[k] = kind; t.r[k] = r;
    if (kind === RockKind.Free && (reset || sample)) {
      const at = (k * TRAIL_LEN + t.head[k]!) * 2;
      t.trail[at] = x; t.trail[at + 1] = y;
      t.head[k] = (t.head[k]! + 1) % TRAIL_LEN; t.len[k] = Math.min(TRAIL_LEN, t.len[k]! + 1);
    }
  }
  t.tick = s.tick;
}
/** Where to draw rock k this frame: a rail at tick − 1 + α (its anchor at least), a free rock lerped from its last tick. */
export function rockDrawPos(t: RockTrack | null, s: TacticalState, k: number, alpha: number): Point {
  const v = s.rocks, b = k * ROCK_STRIDE;
  if (isRail(v[b]!)) {
    const cx = v[b + 1]!, cy = v[b + 2]!, ox = v[b + 3]!, oy = v[b + 4]!, n = Math.max(0, s.tick - 1 + alpha - v[b + 7]!);
    const ac = (orbitRate(Math.hypot(cx, cy)) * n) / TICK_HZ, ao = ac + (v[b] === RockKind.Tumble ? (SPIN_RATE * n) / TICK_HZ : 0);
    return { x: Math.cos(ac) * cx - Math.sin(ac) * cy + Math.cos(ao) * ox - Math.sin(ao) * oy, y: Math.sin(ac) * cx + Math.cos(ac) * cy + Math.sin(ao) * ox + Math.cos(ao) * oy };
  }
  if (!t || t.tick !== s.tick || k >= t.n) return { x: v[b + 1]!, y: v[b + 2]! };
  return { x: t.px[k]! + (t.cx[k]! - t.px[k]!) * alpha, y: t.py[k]! + (t.cy[k]! - t.py[k]!) * alpha };
}
/** Rock k's trail in world units, oldest first: 25 s while it is younger than 60 s, 6 s after; empty for a rail. */
export function rockTrail(t: RockTrack, s: TacticalState, k: number): Point[] {
  if (k >= t.n || s.rocks[k * ROCK_STRIDE] !== RockKind.Free) return [];
  const young = (s.tick - rockT(s, k)) / TICK_HZ < YOUNG_AGE_S, keep = Math.min(t.len[k]!, (young ? TRAIL_YOUNG_S : TRAIL_OLD_S) * TRAIL_HZ), out: Point[] = [];
  for (let i = keep; i >= 1; i--) {
    const at = (k * TRAIL_LEN + ((t.head[k]! - i + TRAIL_LEN) % TRAIL_LEN)) * 2;
    out.push({ x: t.trail[at]!, y: t.trail[at + 1]! });
  }
  return out;
}
