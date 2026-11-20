// Asteroids-iii §2, §3.2, §13.1, §13.2, §8.1 (rails): the orbit maths of the rock rails (centre plus offset, the tumble)
// against Math references, the lane zones and V*, and the new numbers.
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/shared/rng';
import { generateMap } from '../src/renderer/src/sim/tactical/map';
import { circularVelocity, escapeSpeed, lanePull, laneZone, orbitRate, railPos, railPosFrom, railStep, SPIN_RATE, targetVelocity, turnPower, type RailOut } from '../src/renderer/src/sim/tactical/rails';
import { ROCK_GRID_PAD, ROCK_SWITCHES } from '../src/renderer/src/sim/tactical/rockTuning';
import { ASTEROID_GAP, BELT_COUNT, CLUSTER_CENTRE_MAX, CLUSTER_CENTRE_MIN, CLUSTER_COUNT, CLUSTER_RHO_SEPARATION, CLUSTER_RHO_SLACK, DT, LANES } from '../src/renderer/src/sim/tactical/tuning';

const out = (): RailOut => ({ x: 0, y: 0, vx: 0, vy: 0 });
const turn = (x: number, y: number, a: number): [number, number] => [Math.cos(a) * x - Math.sin(a) * y, Math.sin(a) * x + Math.cos(a) * y];

describe('the rail maths (spec §2, §3.2, §13.1)', () => {
  it('θ = ω·DT by the series is within 1e-15 of Math at ρ 150; the typical values hold', () => {
    const th = orbitRate(150) * DT, [c, s] = railStep(150);
    expect(Math.abs(c - Math.cos(th))).toBeLessThanOrEqual(1e-15);
    expect(Math.abs(s - Math.sin(th))).toBeLessThanOrEqual(1e-15);
    expect(th).toBeLessThan(0.05);
    expect(orbitRate(1200) * DT).toBeCloseTo(6.338e-4, 6);
    expect(escapeSpeed(1200)).toBeCloseTo(64.545, 2);
    expect(SPIN_RATE).toBeCloseTo((2 * Math.PI) / 200, 15);
  });
  it('turnPower is (c + i s)^n', () => {
    const [c, s] = railStep(1200), th = orbitRate(1200) * DT;
    for (const n of [0, 1, 2, 3, 1000, 4097]) {
      const [pc, ps] = turnPower(c, s, n);
      expect(pc).toBeCloseTo(Math.cos(n * th), 12); expect(ps).toBeCloseTo(Math.sin(n * th), 12);
    }
  });
  it('a lane rail (offset 0) matches a cos/sin reference within 1e-9 u at T = 216,000 and keeps |p| = |centre| within 1e-12', () => {
    for (const rho of [150, 1122, 1200, 1278, 1600, 2000, 2550]) {
      const x = rho * 0.6, y = rho * 0.8, o = out(), [rx, ry] = turn(x, y, 216000 * orbitRate(rho) * DT);
      railPos(x, y, 0, 0, 0, 216000, false, o);
      expect(Math.hypot(o.x - rx, o.y - ry), `ρ ${rho}`).toBeLessThan(1e-9);
      expect(Math.abs(Math.hypot(o.x, o.y) - rho) / rho).toBeLessThan(1e-12);
    }
  });
  it('a Rail turns centre and offset together at ω(|centre|): rigid rotation, velocity ω·perp(p)', () => {
    const o = out(), cx = 1500, cy = -900, ox = 60, oy = 25, rc = Math.hypot(cx, cy), w = orbitRate(rc), a = 50000 * w * DT;
    railPos(cx, cy, ox, oy, 100, 50100, false, o);
    const [px, py] = turn(cx + ox, cy + oy, a);
    expect(Math.hypot(o.x - px, o.y - py)).toBeLessThan(1e-9);
    expect(o.vx).toBeCloseTo(-w * o.y, 9); expect(o.vy).toBeCloseTo(w * o.x, 9);
  });
  it('a Tumble turns its offset by the extra spin: matches a reference, velocity ω·perp(centre) + (ω + ω_spin)·perp(offset)', () => {
    const o = out(), cx = 2000, cy = 300, ox = -80, oy = 40, rc = Math.hypot(cx, cy), w = orbitRate(rc), n = 36000;
    railPos(cx, cy, ox, oy, 0, n, true, o);
    const [Cx, Cy] = turn(cx, cy, n * w * DT), [Ox, Oy] = turn(ox, oy, n * (w + SPIN_RATE) * DT);
    expect(Math.hypot(o.x - (Cx + Ox), o.y - (Cy + Oy))).toBeLessThan(1e-9);
    expect(o.vx).toBeCloseTo(-w * Cy - (w + SPIN_RATE) * Oy, 9);
    expect(o.vy).toBeCloseTo(w * Cx + (w + SPIN_RATE) * Ox, 9);
  });
  it('at T = t the position is centre + offset exactly; before t it throws', () => {
    const o = out();
    railPos(700.125, -999.5, 3.25, -1.5, 40, 40, true, o);
    expect([o.x, o.y]).toEqual([700.125 + 3.25, -999.5 - 1.5]);
    expect(() => railPos(1, 2, 0, 0, 5, 4, false, o)).toThrow(/before/);
    expect(() => railPosFrom(1, 2, 0, 0, -1, false, Math.sqrt(5), orbitRate(Math.sqrt(5)), 1, 0, o)).toThrow(/before/);   // railPosFrom guards n < 0 too
  });
  it('prograde matches the ships\' spawn orbits (spawnAt)', () => {
    for (const seed of [1, 7, 42]) for (const s of generateMap(createRng(seed)).spawns) {
      const [vx, vy] = circularVelocity(s.x, s.y);
      expect(vx).toBeCloseTo(s.vx, 9); expect(vy).toBeCloseTo(s.vy, 9);
    }
  });
});

describe('lane zones, V* and the lane pull (spec §13.2)', () => {
  it('splits [1092, 1308] at 1161 and 1239; V* is V_c everywhere, inside a zone too', () => {
    expect([1091, 1092, 1160.9, 1161, 1238.9, 1239, 1308, 1308.1].map(laneZone)).toEqual([-1, 0, 0, 1, 1, 2, 2, -1]);
    expect(targetVelocity(0, 1230)).toEqual(circularVelocity(0, 1230));
    expect(targetVelocity(0, 1700)).toEqual(circularVelocity(0, 1700));
  });
  it('the lane pull is −LANE_PULL · (ρ − ρ_lane) · p/ρ · (k / 0.06) inside a zone, zero outside or with no drag', () => {
    const [ax, ay] = lanePull(0, 1230, 0.06);
    expect(ax).toBeCloseTo(0, 15); expect(ay).toBeCloseTo(-0.004 * 30, 12);   // pulled inward toward 1200
    const [bx] = lanePull(1150, 0, 0.03);
    expect(bx).toBeCloseTo(-0.004 * (1150 - 1122) * 0.5, 12);                 // inner zone, half the drag: half the pull
    expect(lanePull(0, 1700, 0.06)).toEqual([0, 0]);
    expect(lanePull(0, 1230, 0)).toEqual([0, 0]);
  });
});

describe('the new numbers (spec §3.5, §6.1, §13.7)', () => {
  it('three lanes of 17 + 36 + 17, 78 apart, whose largest cross-lane radius sum plus the gap is at most 75', () => {
    expect(LANES.map((l) => l.rho)).toEqual([1122, 1200, 1278]);
    expect(LANES.reduce((t, l) => t + l.count, 0)).toBe(BELT_COUNT);
    for (let i = 1; i < LANES.length; i++) {
      expect(LANES[i]!.rho - LANES[i - 1]!.rho).toBe(78);
      expect(LANES[i]!.rMax + LANES[i - 1]!.rMax + ASTEROID_GAP).toBeLessThanOrEqual(75);
    }
  });
  it('cluster centres 420 apart fit three in 1550 to 2550 with 160 of slack; the grid pad is 14; every switch defaults on', () => {
    expect(CLUSTER_RHO_SEPARATION).toBe(420);
    expect(CLUSTER_RHO_SLACK).toBe(CLUSTER_CENTRE_MAX - CLUSTER_CENTRE_MIN - (CLUSTER_COUNT - 1) * 420);
    expect(CLUSTER_RHO_SLACK).toBe(160);
    expect(ROCK_GRID_PAD).toBe(14);
    expect(ROCK_SWITCHES).toEqual({ massCube: true, softEdge: true, clusterTumble: true, rocheBreak: true });
  });
});
