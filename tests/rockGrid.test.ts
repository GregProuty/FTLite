// Asteroids-iii §6.1, §8.1 (grid): the rock grid finds exactly what a brute-force scan finds while rocks turn, fly, break
// and rejoin; it is rebuilt into the same typed arrays every tick, kept per state object, and links pieces at birth.
import { describe, expect, it } from 'vitest';
import { cloneTactical, createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { peekRockGrid } from '../src/renderer/src/sim/tactical/grid';
import { breakRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { beginRockStep, beginRockTick, endRockStep, rockAlive, RockKind, rocksNearGrid, rockSlots, ROCK_STRIDE, rockX, rockY } from '../src/renderer/src/sim/tactical/rocks';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { stressInput, switchOff } from './helpers/rockStress';
import { mover, rockEvents } from './helpers/rockArena';

describe('the rock grid (spec §6.1)', () => {
  it('equals a brute-force scan for every live rock on every tick of 20 seeded stress runs (200 ticks each, plan deviation 18)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const st = createTacticalState(seed), wrong: string[] = [];
      switchOff(st, 1);
      let broken = 0;
      for (let k = 0; k < st.map.asteroids.length && broken < 6; k++) if (st.map.asteroids[k]!.r >= 40) { breakRock(st, k, 1, 0, 'torpedo', 0, 'burst'); broken++; }
      beginRockTick(st);
      for (let t = 0; t < 200; t++) {
        stepDuel(st, stressInput(st));
        const n = rockSlots(st), live: number[] = [], xs = new Float64Array(n), ys = new Float64Array(n), rs = new Float64Array(n);
        for (let k = 0; k < n; k++) if (rockAlive(st, k)) { live.push(k); xs[k] = rockX(st, k); ys[k] = rockY(st, k); rs[k] = st.rocks[k * ROCK_STRIDE + 5]!; }
        for (const k of live) {
          const brute = live.filter((j) => Math.abs(xs[j]! - xs[k]!) <= rs[k]! + rs[j]! && Math.abs(ys[j]! - ys[k]!) <= rs[k]! + rs[j]!).join(',');
          const grid = rocksNearGrid(st, xs[k]!, ys[k]!, rs[k]!).join(',');
          if (grid !== brute) wrong.push(`tick ${st.tick} rock ${k}: grid ${grid} brute ${brute}`);
        }
      }
      expect(wrong, `seed ${seed}`).toEqual([]);
    }
  }, 120000);
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
    breakRock(st, big, 0, 1, 'torpedo', 0, 'burst');
    for (const p of rockEvents(st, 'split')[0]!.pieces!) expect(rocksNearGrid(st, rockX(st, p), rockY(st, p), 1)).toContain(p);
    endRockStep(st);
    const far = createTacticalState(4), slot = rockSlots(far) - 1;
    mover(far, slot, 3600, 0, 0, 0, 10);   // past the grid's reach (3560): clamped into an edge cell
    beginRockStep(far);
    expect(rocksNearGrid(far, 3600, 0, 5)).toEqual([slot]);
    endRockStep(far);
    expect(far.rocks[slot * ROCK_STRIDE]).toBe(RockKind.Free);
  });
});
