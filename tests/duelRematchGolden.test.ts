// The rematch golden (H-2 spec §7): seed 1's scripted pair to its outcome, a rematch on the first end-card tick, the
// second round to its outcome, hashed every 600 encounter ticks. `npm run bless` rewrites it deliberately.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { roundSeed } from '../src/renderer/src/sim/duel/seeds';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { DUEL_GOLDEN_EVERY, DUEL_GOLDEN_SEED, DUEL_REMATCH_GOLDEN, runRematch, type RematchRun } from './helpers/scriptedDuel';

interface RematchGolden extends Omit<RematchRun, 'seed'> { simVersion: number; seed: number; every: number }

describe('the rematch golden (spec §7)', () => {
  it('replays two rounds of one duel to the recorded hashes (run `npm run bless` to update deliberately)', () => {
    expect(existsSync(DUEL_REMATCH_GOLDEN)).toBe(true);
    const golden = JSON.parse(readFileSync(DUEL_REMATCH_GOLDEN, 'utf8')) as RematchGolden;
    expect([golden.simVersion, golden.seed, golden.every]).toEqual([SIM_VERSION, DUEL_GOLDEN_SEED, DUEL_GOLDEN_EVERY]);
    const r = runRematch(golden.seed, golden.every);
    const first = r.hashes.findIndex((h, i) => h !== golden.hashes[i]);
    expect(first, `first divergence at checkpoint ${first}`).toBe(-1);
    expect([r.rematchTick, r.rounds, r.hashes.length, r.finalHash]).toEqual([golden.rematchTick, golden.rounds, golden.hashes.length, golden.finalHash]);
    // The second round is the round seed after the first, begins the tick after the rematch, and is decided.
    expect(r.rounds.map((x) => x.seed)).toEqual([roundSeed(DUEL_GOLDEN_SEED, 0), roundSeed(DUEL_GOLDEN_SEED, 1)]);
    expect(r.rounds[1]!.baseTick).toBe(r.rematchTick + 1);
    expect(r.rounds.every((x) => x.outcome !== 0)).toBe(true);
  }, 120_000);
});
