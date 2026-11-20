// Asteroids-iii §3.4, §13.2, §8.1 (rejoining): a free rock rejoins a rail at the end of the tick once its clock has run 120
// ticks, it was not touched or born this tick, it is within 0.5 u/s of V* (= V_c), it is clear of the edge and the planet and it
// overlaps no live rock; its ρω is its lane's within 5 u of a lane radius (farther off in a zone it stays Free), else a matching rejoined rail's (a snap under 2 u/s), else
// its own ρ; and (plan deviation 3) no rail of another ω sweeps across its annulus.
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { laserStrikesRock } from '../src/renderer/src/sim/tactical/rockWeapons';
import { circularVelocity, orbitRate, SPIN_RATE } from '../src/renderer/src/sim/tactical/rails';
import { rejoinChoice, settleRocks } from '../src/renderer/src/sim/tactical/rockSettle';
import { rockAt, RockKind, ROCK_STRIDE, rockX, rockY, writeRock } from '../src/renderer/src/sim/tactical/rocks';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { arena, mover, rail, rockEvents } from './helpers/rockArena';
import { stressInput, switchOff } from './helpers/rockStress';

/** A free rock in slot k at (x, y) moving at V_c plus (dvx, dvy), its clock at t. */
function settled(st: ReturnType<typeof arena>, k: number, x: number, y: number, t: number, dvx = 0, dvy = 0, r = 10): void {
  const [vx, vy] = circularVelocity(x, y);
  mover(st, k, x, y, vx + dvx, vy + dvy, r, 5, t);
}
function safeCrew(st: ReturnType<typeof arena>): void {
  const [vx, vy] = circularVelocity(-2750, 0);
  Object.assign(st.ships[0], { x: -2750, y: 0, vx, vy, heading: 0, headingAcc: 0 });
}
const slot = (st: ReturnType<typeof arena>, k: number): number[] => Array.from(st.rocks.subarray(k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE));

describe('rejoining a rail (spec §3.4, §13.2)', () => {
  it('on its own orbit: Rail with centre p and offset 0, t the tick, a rejoin event; the velocity snaps under 0.5 u/s', () => {
    const st = arena(); st.tick = 500;
    settled(st, 100, 0, 1700, 300, 0.3, 0);
    expect(rejoinChoice(st, 100)).toEqual({ rhoW: 1700, how: 'own' });
    const before = rockAt(st, 100);
    settleRocks(st);
    expect(slot(st, 100)).toEqual([RockKind.Rail, before.x, before.y, 0, 0, 10, 5, 500]);
    expect(rockEvents(st, 'rejoin')).toMatchObject([{ rock: 100, by: 'settle', how: 'own' }]);
    const after = rockAt(st, 100);
    expect(Math.hypot(after.vx - before.vx, after.vy - before.vy)).toBeLessThan(0.5);
  });
  it('waits for the clock (120 ticks), and never rejoins a rock touched or born this tick, or 0.5 u/s or more off V*', () => {
    const st = arena(); st.tick = 500;
    settled(st, 100, 0, 1700, 381); settled(st, 101, 0, -1700, 380); settled(st, 102, 1700, 0, 0); settled(st, 103, -1700, 0, 0); settled(st, 104, 1200, 1200, 0, 0.5, 0);
    st.rockTouched[102] = 1; st.rockBorn[103] = 1;
    expect([100, 101, 102, 103, 104].map((k) => rejoinChoice(st, k) !== null)).toEqual([false, true, false, false, false]);
  });
  it('never past ρ + r > R_MAP − 50 or ρ − r < PLANET_RADIUS + 80, never overlapping a live rock, never across a rail of another ω', () => {
    const st = arena(); st.tick = 500;
    settled(st, 100, 0, 2745, 0);            // 2745 + 10 > 2750
    settled(st, 101, 2735, 0, 0);            // clear of the edge (on the x axis: 100 and 101 would overlap)
    settled(st, 102, 0, 155, 0);             // 155 − 10 < 150
    settled(st, 103, 165, 0, 0);                // (on the x axis: 102 and 103 would overlap)
    settled(st, 104, 0, -1500, 0); mover(st, 110, 12, -1500, 0, 0, 8, 5, 490);   // a live rock overlaps it
    writeRock(st, 7, RockKind.Tumble, 1900, 0, 40, 0, 30, 5, 0);                 // a tumbling rail sweeps [1830, 1970]
    settled(st, 105, 0, -1935, 0);
    expect([100, 101, 102, 103, 104, 105].map((k) => rejoinChoice(st, k) !== null)).toEqual([false, true, false, true, false, false]);
    const why: { reason: string | null } = { reason: null };
    expect(rejoinChoice(st, 105, why as never)).toBeNull(); expect(why.reason).toBe('sweepCluster');
    rejoinChoice(st, 100, why as never); expect(why.reason).toBe('bounds');
    rejoinChoice(st, 104, why as never); expect(why.reason).toBe('overlap');
  });
  it('within 5 u of its lane it is captured: ρω the lane\'s, centre p · (ρ_lane / ρ), offset p − centre, and it co-rotates with the lane; farther off in the zone it stays Free', () => {
    const st = arena(); st.tick = 500;
    settled(st, 100, 0, 1203, 0);                    // circular (V* = V_c), 3 u outside the main lane
    settled(st, 101, 0, -1215, 0);                   // in the main zone but 15 u off: the lane pull is still working on it
    expect(rejoinChoice(st, 101)).toBeNull();
    expect(rejoinChoice(st, 100)).toEqual({ rhoW: 1200, how: 'lane' });
    settleRocks(st);
    const v = slot(st, 100);
    expect([v[0], v[1], v[3], v[7]]).toEqual([RockKind.Rail, 0, 0, 500]);
    expect(v[2]).toBeCloseTo(1200, 9); expect(v[4]).toBeCloseTo(3, 9);
    expect(st.rocks[101 * ROCK_STRIDE]).toBe(RockKind.Free);
    rail(st, 7, 0, 1200, 20);                        // a lane rock 3 u inward on the same bearing (added after the capture)
    for (let n = 0; n < 30; n++) {
      st.tick += 3600;
      const ax = rockX(st, 100), ay = rockY(st, 100), bx = rockX(st, 7), by = rockY(st, 7);
      expect(Math.abs(ax * by - ay * bx) / (Math.hypot(ax, ay) * Math.hypot(bx, by))).toBeLessThan(1e-9);   // still on one bearing
    }
  });
  it('next to a rejoined rail it joins that rail\'s rigid group (snap under 2 u/s), and the two never overlap over 30 minutes; a bigger snap stays Free', () => {
    const st = arena(); st.tick = 500;
    rail(st, 7, 0, 1700, 10);                        // a rejoined rail on its own orbit: [1690, 1710]
    settled(st, 100, 1718 * Math.sin(0.05), 1718 * Math.cos(0.05), 0);   // 86 u along the orbit; padded annulus [1698, 1738]: snap 1.5 · ω · 18 ≈ 0.6
    expect(rejoinChoice(st, 100)).toEqual({ rhoW: 1700, how: 'group' });
    settleRocks(st);
    let closest = Infinity;
    for (let n = 0; n < 30 * 60; n++) { st.tick += 60; closest = Math.min(closest, Math.hypot(rockX(st, 100) - rockX(st, 7), rockY(st, 100) - rockY(st, 7))); }
    expect(closest).toBeGreaterThan(80);   // rigid together: the gap never closes
    const big = arena(); big.tick = 500;
    rail(big, 8, 0, 2000, 60);                       // [1940, 2060]
    settled(big, 100, 0, -2090, 0, 0, 0, 25);        // padded [2055, 2125]: snap 1.5 · ω(2090) · 90 ≈ 2.2
    expect(rejoinChoice(big, 100)).toBeNull();
  });
  it('a rock kicked radially outward by 20 u/s at ρ 1200 settles and rejoins within 180 s', () => {
    const st = arena(); safeCrew(st);
    const [vx, vy] = circularVelocity(1200, 0);
    mover(st, 100, 1200, 0, vx + 20, vy, 10);
    let at = -1;
    for (let t = 0; t < 180 * 60 && at < 0; t++) { stepDuel(st, IDLE_INPUT); if (st.rocks[100 * ROCK_STRIDE] === RockKind.Rail) at = t; }
    expect(at).toBeGreaterThan(0);
  });
  it('5 laser shots on an r 45 rock add up: none is lost to a rejoin (plan deviation 16: hp 100)', () => {
    const st = arena(); safeCrew(st);
    const x = 0, y = 1700, [vx, vy] = circularVelocity(x, y);
    mover(st, 100, x, y, vx, vy, 45, 100);
    for (let shot = 0; shot < 5; shot++) {
      const a = rockAt(st, 100);
      st.events = [];
      laserStrikesRock(st, 0, 100, a.x, a.y);   // a push along the line from the crew ship, 2 damage
      for (let t = 0; t < 150; t++) { stepDuel(st, IDLE_INPUT); expect(st.rocks[100 * ROCK_STRIDE]).toBe(RockKind.Free); }
    }
    const a = rockAt(st, 100), [cx, cy] = circularVelocity(a.x, a.y);
    expect(Math.hypot(a.vx - cx, a.vy - cy)).toBeGreaterThan(3);   // five pushes of 4000 / m(45) add up; one alone is far less
  });
  it('in a stress run every rejoin is inside the ρ bounds', () => {
    const st = createTacticalState(2); switchOff(st, 1);
    const bad: string[] = [];
    let kinds = Array.from({ length: st.rocks.length / ROCK_STRIDE }, (_, k) => st.rocks[k * ROCK_STRIDE]!);
    for (let t = 0; t < 4000; t++) {
      stepDuel(st, stressInput(st));
      const now = kinds.map((_, k) => st.rocks[k * ROCK_STRIDE]!);
      now.forEach((kind, k) => {
        if (kinds[k] !== RockKind.Free || (kind !== RockKind.Rail && kind !== RockKind.Tumble)) return;   // §14 D14: a cluster join is a Tumble
        const a = rockAt(st, k), rho = Math.hypot(a.x, a.y);
        if (rho + a.r > 2750 || rho - a.r < 150) bad.push(`tick ${st.tick} rock ${k} at ρ ${rho}`);
      });
      kinds = now;
    }
    expect(bad).toEqual([]);
  }, 60000);
});

describe('joining a tumbling cluster\'s group (spec §14 D14)', () => {
  /** A tumbling cluster centred (0, 1900) at tick 500: slot 7 offset (60, 0), slot 8 offset (−60, 0), r 15; it sweeps [1825, 1975]. */
  function cluster(st: ReturnType<typeof arena>): void {
    writeRock(st, 7, RockKind.Tumble, 0, 1900, 60, 0, 15, 5, 500);
    writeRock(st, 8, RockKind.Tumble, 0, 1900, -60, 0, 15, 5, 500);
  }
  /** |V_c(p) − V_group(p)| for the cluster above at tick 500 (centre (0, 1900)). */
  function gap(x: number, y: number): number {
    const w = orbitRate(1900), ws = w + SPIN_RATE, ox = x, oy = y - 1900, [vx, vy] = circularVelocity(x, y);
    return Math.hypot(vx - (-w * 1900 - ws * oy), vy - ws * ox);
  }
  it('a settled rock inside the sweep joins as a Tumble: centre the cluster\'s, offset p − centre, t the tick, its position unchanged, a rejoin event how \'cluster\'; it co-rotates with a cluster rock for 30 minutes at an unchanged distance', () => {
    const st = arena(); st.tick = 500;
    cluster(st);
    settled(st, 100, 0, 1940, 0);
    const before = rockAt(st, 100), why: { reason: string | null } = { reason: null };
    expect(rejoinChoice(st, 100, why as never)).toMatchObject({ how: 'cluster' });
    settleRocks(st);
    const v = slot(st, 100), after = rockAt(st, 100);
    expect([v[0], v[5], v[7]]).toEqual([RockKind.Tumble, 10, 500]);
    expect(v[1]).toBeCloseTo(0, 9); expect(v[2]).toBeCloseTo(1900, 9); expect(v[3]).toBeCloseTo(0, 9); expect(v[4]).toBeCloseTo(40, 9);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1e-9); expect(Math.abs(after.y - before.y)).toBeLessThan(1e-9);
    expect(Math.hypot(after.vx - before.vx, after.vy - before.vy)).toBeLessThan(6);
    expect(rockEvents(st, 'rejoin')).toMatchObject([{ rock: 100, by: 'settle', how: 'cluster' }]);
    const d0 = Math.hypot(rockX(st, 100) - rockX(st, 7), rockY(st, 100) - rockY(st, 7));
    let worst = 0;
    for (let n = 0; n < 30 * 60; n++) { st.tick += 60; worst = Math.max(worst, Math.abs(Math.hypot(rockX(st, 100) - rockX(st, 7), rockY(st, 100) - rockY(st, 7)) - d0)); }
    expect(worst).toBeLessThan(1e-6);
  });
  it('only under the snap: |v − V_group(p)| < 6 u/s joins, at or over it stays Free (refused by sweepCluster)', () => {
    expect(gap(-150, 1900)).toBeLessThan(6); expect(gap(199, 1900)).toBeGreaterThan(6);
    const st = arena(); st.tick = 500;
    cluster(st);
    settled(st, 100, -150, 1900, 0);
    settled(st, 101, 199, 1900, 0);
    expect(rejoinChoice(st, 100)).toMatchObject({ how: 'cluster' });
    const why: { reason: string | null } = { reason: null };
    expect(rejoinChoice(st, 101, why as never)).toBeNull(); expect(why.reason).toBe('sweepCluster');
  });
  it('a rock inside two clusters\' sweeps is refused', () => {
    const st = arena(); st.tick = 500;
    cluster(st);
    writeRock(st, 9, RockKind.Tumble, 0, -2000, 90, 0, 15, 5, 500);   // a second cluster sweeping [1895, 2105]
    settled(st, 100, 0, 1940, 0);
    const why: { reason: string | null } = { reason: null };
    expect(rejoinChoice(st, 100, why as never)).toBeNull(); expect(why.reason).toBe('sweepCluster');
  });
});
