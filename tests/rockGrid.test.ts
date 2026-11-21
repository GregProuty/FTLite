// Asteroids-iii §6.1, §8.1 (grid): the rock grid finds exactly what a brute-force scan finds while rocks turn, fly, break
// and rejoin; it is rebuilt into the same typed arrays every tick, kept per state object, and links pieces at birth.
import { describe, expect, it } from 'vitest';
import { ROCK_GRID_CELL, ROCK_GRID_PAD } from '../src/renderer/src/sim/tactical/rockTuning';
import { cloneTactical, createTacticalState } from '../src/renderer/src/sim/tactical/state';
import type { TacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { peekRockGrid } from '../src/renderer/src/sim/tactical/grid';
import { breakRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { beginRockStep, beginRockTick, endRockStep, rockAlive, rockAt, RockKind, regridRock, rocksNearGrid, rockSlots, ROCK_STRIDE, rockX, rockY } from '../src/renderer/src/sim/tactical/rocks';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { stressInput, switchOff } from './helpers/rockStress';
import { mover, rockEvents } from './helpers/rockArena';

/** The live slots whose recorded grid cell differs from the cell of their accessor position (exact, independent of the query pad). */
function staleLinks(st: TacticalState): number[] {
  const g = peekRockGrid(st)!, bad: number[] = [], cell = (v: number): number => Math.min(g.cols - 1, Math.max(0, Math.floor((v - g.origin) / ROCK_GRID_CELL)));
  for (let k = 0; k < rockSlots(st); k++) if (rockAlive(st, k) && g.cell[k] !== cell(rockY(st, k)) * g.cols + cell(rockX(st, k))) bad.push(k);
  return bad;
}
const nearList = (st: TacticalState, x: number, y: number, h: number): number[] => { const out: number[] = [], n = rocksNearGrid(st, x, y, h, out); return out.slice(0, n); };

describe('the rock grid (spec §6.1)', () => {
  it('equals a brute-force scan for every live rock on every tick of 20 seeded stress runs (200 ticks each, plan deviation 18), every live link in its exact cell', () => {
    let splits = 0, sawFree = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const st = createTacticalState(seed), wrong: string[] = [];
      switchOff(st, 1);
      let broken = 0;
      for (let k = 0; k < st.map.asteroids.length && broken < 6; k++) if (st.map.asteroids[k]!.r >= 40) { const a = rockAt(st, k); breakRock(st, k, a.x, a.y, 1, 0, 'torpedo', 0, 'shatter'); broken++; }
      beginRockTick(st);
      const splits0 = st.rockSplits;
      for (let t = 0; t < 200; t++) {
        stepDuel(st, stressInput(st));
        for (let k = 0; k < rockSlots(st); k++) if (st.rocks[k * ROCK_STRIDE] === RockKind.Free) { sawFree++; break; }
        const stale = staleLinks(st);
        if (stale.length) wrong.push(`tick ${st.tick}: stale links ${stale.join(',')}`);
        const n = rockSlots(st), live: number[] = [], xs = new Float64Array(n), ys = new Float64Array(n), rs = new Float64Array(n);
        for (let k = 0; k < n; k++) if (rockAlive(st, k)) { live.push(k); xs[k] = rockX(st, k); ys[k] = rockY(st, k); rs[k] = st.rocks[k * ROCK_STRIDE + 5]!; }
        for (const k of live) {
          const brute = live.filter((j) => Math.abs(xs[j]! - xs[k]!) <= rs[k]! + rs[j]! && Math.abs(ys[j]! - ys[k]!) <= rs[k]! + rs[j]!).join(',');
          const grid = nearList(st, xs[k]!, ys[k]!, rs[k]!).join(',');
          if (grid !== brute) wrong.push(`tick ${st.tick} rock ${k}: grid ${grid} brute ${brute}`);
        }
      }
      expect(wrong, `seed ${seed}`).toEqual([]);
      splits += st.rockSplits - splits0;
    }
    expect(splits, 'the stress runs split rocks').toBeGreaterThan(0);
    expect(sawFree, 'the stress runs had free rocks').toBeGreaterThan(0);
  }, 120000);
  it('the exact-cell check catches a link left stale by a move larger than the query pad', () => {
    const st = createTacticalState(4), slot = rockSlots(st) - 1;
    mover(st, slot, 500, 500, 0, 0, 10);
    beginRockStep(st);
    expect(staleLinks(st)).toEqual([]);
    const b = slot * ROCK_STRIDE;
    st.rocks[b + 1] = 500 + ROCK_GRID_PAD + 2 * ROCK_GRID_CELL;   // moved with no regridRock
    expect(staleLinks(st)).toEqual([slot]);
    regridRock(st, slot);
    expect(staleLinks(st)).toEqual([]);
    endRockStep(st);
  });
  it('is rebuilt into the same typed arrays every tick, kept per state object and never copied by a clone', () => {
    const st = createTacticalState(4);
    stepDuel(st, IDLE_INPUT);
    const g = peekRockGrid(st)!, arrays = [g.head, g.next, g.cell, g.scratch];
    for (let t = 0; t < 100; t++) stepDuel(st, IDLE_INPUT);
    const h = peekRockGrid(st)!;
    expect(h).toBe(g);
    [h.head, h.next, h.cell, h.scratch].forEach((a, i) => expect(a).toBe(arrays[i]));
    expect(peekRockGrid(cloneTactical(st))).toBeUndefined();
  });
  it('links a piece born mid-step at its birth position, and finds a rock far past the edge', () => {
    const st = createTacticalState(4);
    beginRockStep(st);
    const big = st.map.asteroids.findIndex((a) => a.r >= 40);
    { const a = rockAt(st, big); breakRock(st, big, a.x, a.y, 0, 1, 'torpedo', 0, 'shatter'); }
    for (const p of rockEvents(st, 'split')[0]!.pieces!) expect(nearList(st, rockX(st, p), rockY(st, p), 1)).toContain(p);
    endRockStep(st);
    const far = createTacticalState(4), slot = rockSlots(far) - 1;
    mover(far, slot, 3600, 0, 0, 0, 10);   // past the grid's reach (3560): clamped into an edge cell
    beginRockStep(far);
    expect(nearList(far, 3600, 0, 5)).toEqual([slot]);
    endRockStep(far);
    expect(far.rocks[slot * ROCK_STRIDE]).toBe(RockKind.Free);
  });
});
