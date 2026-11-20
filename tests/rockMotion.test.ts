// Asteroids-iii §4, §13.3, §8.1 (motion): a symmetric (Strang) tick: drift, half drag toward V*, kick (with the lane pull), half drag, cap,
// drift; the drag ramps with age (0 before 20 s, 0.06/s from 60 s); the soft edge (on and off); the cap counter; the
// planet and the far slack turn rocks to dust.
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { circularVelocity, escapeSpeed, lanePull, targetVelocity } from '../src/renderer/src/sim/tactical/rails';
import { moveFreeSlot, rockEdgeAccel, rockEdgeSlack, settleRate, stepRocks } from '../src/renderer/src/sim/tactical/rockContacts';
import { rockAlive, rockAt, RockKind, rockTmpl, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { popcount, templateFor } from '../src/renderer/src/sim/tactical/rockCells';
import { ROCK_EDGE_SLACK, ROCK_EDGE_SLACK_SOFT } from '../src/renderer/src/sim/tactical/rockTuning';
import { DT, GM, GRAVITY_EPS, K_EDGE, R_MAP } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { arena, mover, rockEvents, shaped, tmplOf, withSwitches } from './helpers/rockArena';

/** A lone free rock slot (kind, x, y, vx, vy, r, hp, t) at (x, y), velocity V_c plus (dvx, dvy), clock t. */
function slot(x: number, y: number, dvx = 0, dvy = 0, t = 0): Float64Array {
  const [cx, cy] = circularVelocity(x, y);
  return Float64Array.from([RockKind.Free, x, y, cx + dvx, cy + dvy, 10, 1, t]);
}
const energy = (v: Float64Array): number => 0.5 * (v[3]! * v[3]! + v[4]! * v[4]!) - GM / Math.sqrt(v[1]! * v[1]! + v[2]! * v[2]! + GRAVITY_EPS * GRAVITY_EPS);
/** The crew parked on a circular orbit at ρ 2750 on the far side, so it meets nothing in a long run. */
function safeCrew(st: ReturnType<typeof arena>): void {
  const [vx, vy] = circularVelocity(-2750, 0);
  Object.assign(st.ships[0], { x: -2750, y: 0, vx, vy, heading: 0, headingAcc: 0 });
}

describe('free-rock motion (spec §13.3)', () => {
  it('the drag ramps with age: 0 to 20 s, linear to 0.06/s at 60 s, then flat', () => {
    expect([settleRate(0), settleRate(20 * 60), settleRate(40 * 60), settleRate(60 * 60), settleRate(600 * 60)]).toEqual([0, 0, 0.03, 0.06, 0.06]);
  });
  it('is drift, half drag toward V*, kick (gravity and, in a lane zone, the lane pull), half drag, cap, drift', () => {
    const v = slot(0, 1230, 7, -3, 0), T1 = 50 * 60, k = settleRate(T1), x0 = v[1]!, y0 = v[2]!;
    let vx = v[3]!, vy = v[4]!;
    moveFreeSlot(v, 0, T1);
    const hx = x0 + vx * DT / 2, hy = y0 + vy * DT / 2, [gx, gy] = gravityAccel(hx, hy), [tx, ty] = targetVelocity(hx, hy), [lx, ly] = lanePull(hx, hy, k);
    vx += (tx - vx) * k * DT / 2; vy += (ty - vy) * k * DT / 2;
    vx += (gx + lx) * DT; vy += (gy + ly) * DT;
    vx += (tx - vx) * k * DT / 2; vy += (ty - vy) * k * DT / 2;
    expect(v[3]).toBeCloseTo(vx, 12); expect(v[4]).toBeCloseTo(vy, 12);
    expect(v[1]).toBeCloseTo(hx + vx * DT / 2, 12); expect(v[2]).toBeCloseTo(hy + vy * DT / 2, 12);
  });
  it('caps the speed at 300 before the second drift and reports it; stepRocks counts rockCapHits', () => {
    const v = Float64Array.from([RockKind.Free, 0, 2000, 400, 0, 10, 1, 0]);
    expect(moveFreeSlot(v, 0, 0)).toBe(true);
    expect(Math.hypot(v[3]!, v[4]!)).toBeLessThanOrEqual(300 + 1e-9);
    expect(v[1]! - 400 * DT / 2).toBeCloseTo(v[3]! * DT / 2, 12);
    expect(moveFreeSlot(slot(0, 1500), 0, 0)).toBe(false);
    const st = arena();
    mover(st, 100, 0, 2000, 400, 0, 10);
    stepRocks(st);
    expect(st.rockCapHits).toBe(1);
  });
  it('with no drag (age under 20 s) its relative energy error stays under 1e-6 over 100 orbits at ρ 1700 (plan deviation 24)', () => {
    const v = slot(1700, 0), e0 = energy(v), period = (2 * Math.PI) / Math.sqrt(GM / Math.pow(1700 * 1700 + 400, 1.5));
    let worst = 0;
    for (let n = 0, ticks = Math.round((100 * period) / DT); n < ticks; n++) { moveFreeSlot(v, 0, 0); if (n % 1000 === 0) worst = Math.max(worst, Math.abs((energy(v) - e0) / e0)); }
    expect(worst).toBeLessThan(1e-6);
  });
  it('a circular orbit outside the lane zones is a fixed point to second order: ρ drifts under 0.1 u in 10 minutes with the full drag on', () => {
    const v = slot(0, -1700, 0, 0, -3600);   // 60 s old at T1 = 0: k = 0.06
    let worst = 0;
    for (let n = 0; n < 600 * 60; n++) { moveFreeSlot(v, 0, 0); worst = Math.max(worst, Math.abs(Math.hypot(v[1]!, v[2]!) - 1700)); }
    expect(worst).toBeLessThan(0.1);
  });
  it('in a lane zone a circular rock off its lane settles onto it without leaving the zone; one on the lane stays put (§13.2 lane pull)', () => {
    const off = slot(0, -1225, 0, 0, -3600), on = slot(0, -1200, 0, 0, -3600);   // 60 s old: full drag
    let low = Infinity, near = -1, still = 0;
    for (let n = 1; n <= 600 * 60; n++) {
      moveFreeSlot(off, 0, 0); moveFreeSlot(on, 0, 0);
      const r = Math.hypot(off[1]!, off[2]!);
      low = Math.min(low, r); if (near < 0 && Math.abs(r - 1200) <= 5) near = n / 60;
      still = Math.max(still, Math.abs(Math.hypot(on[1]!, on[2]!) - 1200));
    }
    expect(near).toBeGreaterThan(0); expect(near).toBeLessThan(60);     // within the 5 u capture band inside a minute
    expect(low).toBeGreaterThan(1195);                                   // no real overshoot, far from the 1161 zone edge
    expect(Math.abs(Math.hypot(off[1]!, off[2]!) - 1200)).toBeLessThan(0.01);
    expect(still).toBeLessThan(1e-3);
  });
  it('the soft edge (§13.3): K_EDGE_ROCK and the slack 700 when on; K_EDGE and 400 when off', () => {
    const [ex] = rockEdgeAccel(R_MAP + 100, 0, true), [hx] = rockEdgeAccel(R_MAP + 100, 0, false);
    expect(ex).toBeCloseTo(-0.25 * 100, 12); expect(hx).toBeCloseTo(-K_EDGE * 100, 12);
    expect([rockEdgeSlack(true), rockEdgeSlack(false)]).toEqual([ROCK_EDGE_SLACK_SOFT, ROCK_EDGE_SLACK]);
    expect(rockEdgeAccel(R_MAP - 1, 0, true)).toEqual([0, 0]);
  });
  for (const soft of [true, false]) it(`a rock thrown out past the edge comes back and is not turned to dust (soft edge ${soft ? 'on' : 'off'})`, () => {
    withSwitches({ softEdge: soft }, () => {
      const st = arena(); safeCrew(st);
      const [cx, cy] = circularVelocity(0, 2700);
      mover(st, 100, 0, 2700, cx, cy + 60, 10);   // y down: +y is outward here
      let far = 0;
      for (let t = 0; t < 120 * 60; t++) { stepDuel(st, IDLE_INPUT); far = Math.max(far, Math.hypot(rockAt(st, 100).x, rockAt(st, 100).y)); }
      expect(rockAlive(st, 100)).toBe(true);
      expect(far).toBeGreaterThan(R_MAP);
      expect(far).toBeLessThan(R_MAP + rockEdgeSlack(soft));
      expect(Math.hypot(rockAt(st, 100).x, rockAt(st, 100).y)).toBeLessThan(R_MAP);
    });
  });
  it('touching the planet turns a rock to dust; so does a centre past R_MAP + the slack; R_MAP + 10 does not', () => {
    const st = arena();
    mover(st, 100, 0, -85, 0, 0, 20);
    mover(st, 101, R_MAP + ROCK_EDGE_SLACK_SOFT + 5, 0, 0, 0, 10);
    mover(st, 102, -(R_MAP + 10), 0, 0, 0, 10);
    stepRocks(st);
    expect([rockAlive(st, 100), rockAlive(st, 101), rockAlive(st, 102)]).toEqual([false, false, true]);
    expect(rockEvents(st, 'dust').map((e) => [e.rock, e.by])).toEqual([[100, 'planet'], [101, 'edge']]);
  });
  it('a rock born this tick does not move', () => {
    const st = arena();
    mover(st, 102, 0, 2000, 50, 0, 10); st.rockBorn[102] = 1;
    stepRocks(st);
    expect(Array.from(st.rocks.subarray(102 * ROCK_STRIDE + 1, 102 * ROCK_STRIDE + 5))).toEqual([0, 2000, 50, 0]);
  });
});

describe('the Roche break (spec §13.3)', () => {
  it('a free cell rock of at least 4 cells inside ρ 175 and at least 30 ticks old is cut through its centre of mass along its velocity, cause tidal, its sides parting at 0.04 of v_esc; a plain rock is not', () => {
    const st = arena(); st.tick = 100;
    const [vx, vy] = circularVelocity(0, 160), tm = tmplOf(st, 31), t = templateFor(st.map, tm);
    const old = (k: number, t0: number): void => { st.rocks[k * ROCK_STRIDE + 7] = t0; };
    shaped(st, 100, tm, 0, 160, vx, vy); old(100, 70);       // 30 ticks old
    shaped(st, 101, tm, 0, -160, -vx, -vy); old(101, 71);    // 29 ticks old: not yet
    mover(st, 102, 160, 0, 0, 0, 20, 5, 0);                  // a plain rock: not
    let three = 1;   // cell 0 and its first two neighbours
    for (let c = 1; c < t.n && popcount(three) < 3; c++) if ((t.nb[0]! >>> c) & 1) three |= 1 << c;
    shaped(st, 103, tm, -160, 0, 0, 0, three); old(103, 0);  // 3 cells: under TIDAL_MIN_CELLS
    expect(popcount(three)).toBe(3);
    stepRocks(st);
    const split = rockEvents(st, 'split');
    expect(split.map((e) => [e.rock, e.by])).toEqual([[100, 'tidal']]);
    const sp = Math.hypot(vx, vy), nx = -vy / sp, ny = vx / sp, along: number[] = [];   // the line's normal
    for (const p of split[0]!.pieces!) {
      const a = rockAt(st, p);
      expect(rockTmpl(st, p)).toBe(tm);
      expect((a.vx - vx) * vx + (a.vy - vy) * vy).toBeCloseTo(0, 9);   // the kick is across the velocity
      along.push(((a.vx - vx) * nx + (a.vy - vy) * ny) / escapeSpeed(160));
    }
    expect(Math.max(...along) - Math.min(...along)).toBeCloseTo(0.04, 9);   // the two sides part at 0.04 · v_esc
    const four = (() => { let m = 1; for (let c = 1; c < t.n && popcount(m) < 4; c++) if ((t.nb[0]! >>> c) & 1) m |= 1 << c; return m; })();
    expect(popcount(four)).toBe(4);   // TIDAL_MIN_CELLS exactly, connected through cell 0
    const st4 = arena(); st4.tick = 100;
    shaped(st4, 103, tm, 0, 160, vx, vy, four); st4.rocks[103 * ROCK_STRIDE + 7] = 0;
    stepRocks(st4);
    const broke = [...rockEvents(st4, 'split'), ...rockEvents(st4, 'dust')].filter((e) => e.rock === 103);
    expect(broke).toHaveLength(1); expect(broke[0]!.by).toBe('tidal');
    withSwitches({ rocheBreak: false }, () => {
      const off = arena(); off.tick = 100;
      shaped(off, 100, tm, 0, 160, vx, vy); off.rocks[100 * ROCK_STRIDE + 7] = 0;
      stepRocks(off);
      expect(rockEvents(off, 'split')).toEqual([]);
    });
  });
});
