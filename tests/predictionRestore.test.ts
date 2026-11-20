// Net-4a §4.1, gate G2: from a snapshot at every third tick of a scripted duel, a restored copy stepped 12 ticks with the
// straight run's inputs equals the straight run, quiet and with the Asteroids-iii bursts (a burst every 5 s). Fable #5: and
// on the Hound (the app's ship) with crews of 3 and 4, the players past the scripted pair holding neutral input.
import { describe, expect, it } from 'vitest';
import { duelRestoreCheck } from '../scripts/determinism/duelRestore';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';

/** Snapshots at ticks 0, 3, ..., each with 12 ticks after it inside the run. */
const CHECKS = Math.floor((1800 - 12) / 3) + 1;   // 597
describe('restore, then step, is exact (Net-4a G2)', () => {
  it('quiet: every third tick for 30 s', () => {
    expect(duelRestoreCheck(__GAMEPLAY_CONTENT_DIGEST__, { seed: 3, ticks: 1800 }).checks).toBe(CHECKS);
  });
  it('busy: a burst every 5 s, every third tick for 30 s', () => {
    expect(duelRestoreCheck(__GAMEPLAY_CONTENT_DIGEST__, { seed: 2, ticks: 1800, bursts: true }).checks).toBe(CHECKS);
  });
  it('the Hound, crews of 3 and 4, busy: every third tick for 30 s', { timeout: 120_000 }, () => {
    const cutter = duelRestoreCheck(__GAMEPLAY_CONTENT_DIGEST__, { seed: 2, ticks: 1800, bursts: true }).finalHash, runs = [3, 4].map((crew) => duelRestoreCheck(__GAMEPLAY_CONTENT_DIGEST__, { seed: 2, ticks: 1800, bursts: true, layout: DUEL_LAYOUT, crew }));
    for (const r of runs) expect(r.checks).toBe(CHECKS);
    // Each run is its own duel: not the default Cutter pair's, and not each other's.
    expect(new Set([cutter, ...runs.map((r) => r.finalHash)]).size).toBe(3);
  });
});
