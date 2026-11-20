// Net-4a §4.1, gate G2: from a snapshot at every third tick of a scripted duel, a restored copy stepped 12 ticks with the
// straight run's inputs equals the straight run, quiet and with the Asteroids-iii bursts (a burst every 5 s).
import { describe, expect, it } from 'vitest';
import { duelRestoreCheck } from '../scripts/determinism/duelRestore';

/** Snapshots at ticks 0, 3, ..., each with 12 ticks after it inside the run. */
const CHECKS = Math.floor((1800 - 12) / 3) + 1;   // 597
describe('restore, then step, is exact (Net-4a G2)', () => {
  it('quiet: every third tick for 30 s', () => {
    expect(duelRestoreCheck(__GAMEPLAY_CONTENT_DIGEST__, { seed: 3, ticks: 1800 }).checks).toBe(CHECKS);
  });
  it('busy: a burst every 5 s, every third tick for 30 s', () => {
    expect(duelRestoreCheck(__GAMEPLAY_CONTENT_DIGEST__, { seed: 2, ticks: 1800, bursts: true }).checks).toBe(CHECKS);
  });
});
