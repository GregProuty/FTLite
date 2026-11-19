// Asteroids-iii §13.3: moveFreeSlot's inlined maths (no per-step tuples) is bit-identical to the tuple-returning original.
import { describe, expect, it } from 'vitest';
import { gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { circularVelocity, lanePull, targetVelocity } from '../src/renderer/src/sim/tactical/rails';
import { moveFreeSlot, rockEdgeAccel, settleRate } from '../src/renderer/src/sim/tactical/rockContacts';
import { EDGE_SETTLE_K, ROCK_GRAVITY, ROCK_MAX_SPEED, ROCK_SWITCHES } from '../src/renderer/src/sim/tactical/rockTuning';
import { DT, R_MAP } from '../src/renderer/src/sim/tactical/tuning';

/** The reference copy: moveFreeSlot as it was before the tuples were removed. */
function moveFreeSlotRef(v: Float64Array, b: number, T1: number, soft = ROCK_SWITCHES.softEdge): boolean {
  const h = DT / 2, k = settleRate(T1 - v[b + 7]!), x = v[b + 1]! + v[b + 3]! * h, y = v[b + 2]! + v[b + 4]! * h;
  const [gx, gy] = gravityAccel(x, y), [ex, ey] = rockEdgeAccel(x, y, soft), [tx, ty] = targetVelocity(x, y), [lx, ly] = lanePull(x, y, k);
  const out = soft && x * x + y * y > R_MAP * R_MAP, [cx, cy] = out ? circularVelocity(x, y) : [0, 0], ke = out ? EDGE_SETTLE_K : 0;
  let vx = v[b + 3]!, vy = v[b + 4]!;
  vx += (tx - vx) * k * h; vy += (ty - vy) * k * h; vx += (cx - vx) * ke * h; vy += (cy - vy) * ke * h;
  vx += (gx * ROCK_GRAVITY + ex + lx) * DT; vy += (gy * ROCK_GRAVITY + ey + ly) * DT;
  vx += (tx - vx) * k * h; vy += (ty - vy) * k * h; vx += (cx - vx) * ke * h; vy += (cy - vy) * ke * h;
  const sp = Math.sqrt(vx * vx + vy * vy), capped = sp > ROCK_MAX_SPEED;
  if (capped) { const f = ROCK_MAX_SPEED / sp; vx *= f; vy *= f; }
  v[b + 1] = x + vx * h; v[b + 2] = y + vy * h; v[b + 3] = vx; v[b + 4] = vy;
  return capped;
}

describe('moveFreeSlot against its tuple-returning reference', () => {
  const starts: [number, number, number, number][] = [[1200, 0, 0, 20], [0, -1100, 30, 5], [1500, 400, -10, 60], [5200, 100, 10, 0], [10, 10, 0, 0], [0, 6000, 50, 80]];
  for (const soft of [true, false]) for (const [x, y, vx, vy] of starts) it(`2000 steps from (${x}, ${y}), soft edge ${soft}: every slot value and cap flag identical`, () => {
    const a = Float64Array.of(2, x, y, vx, vy, 10, 5, 0), c = Float64Array.from(a);
    for (let t = 1; t <= 2000; t++) {
      const fa = moveFreeSlot(a, 0, t, soft), fc = moveFreeSlotRef(c, 0, t, soft);
      expect(fa).toBe(fc);
      for (let i = 1; i <= 4; i++) if (!Object.is(a[i], c[i])) throw new Error(`step ${t} slot ${i}: ${a[i]} vs ${c[i]}`);
    }
  });
});
