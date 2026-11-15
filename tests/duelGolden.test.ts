// The duel golden and the same-seed hash (H-0c-ii-a spec §6). `npm run bless` rewrites the golden deliberately.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { flattenDuel, hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { CUTTER, DUEL_GOLDEN, DUEL_GOLDEN_EVERY, DUEL_GOLDEN_SEED, runDuel } from './helpers/scriptedDuel';

interface DuelGolden { simVersion: number; seed: number; outcome: number; ticks: number; finalHash: string; every: number; hashes: string[] }

describe('the duel golden (spec §6)', () => {
  it('replays the scripted pair at its seed to the recorded hashes (run `npm run bless` to update deliberately)', () => {
    expect(existsSync(DUEL_GOLDEN)).toBe(true);
    const golden = JSON.parse(readFileSync(DUEL_GOLDEN, 'utf8')) as DuelGolden;
    expect([golden.simVersion, golden.seed, golden.every]).toEqual([SIM_VERSION, DUEL_GOLDEN_SEED, DUEL_GOLDEN_EVERY]);
    const r = runDuel(golden.seed, 'scripted', undefined, golden.every);
    const first = r.hashes.findIndex((h, i) => h !== golden.hashes[i]);
    expect(first, `first divergence at tick ${(first + 1) * golden.every}`).toBe(-1);
    expect([r.telemetry.outcome, r.telemetry.ticks, r.hashes.length]).toEqual([golden.outcome, golden.ticks, golden.hashes.length]);
    expect(r.finalHash).toBe(golden.finalHash);
  }, 60_000);
  it('two independent duels from the same seed have the same hash on every tick; another seed differs', () => {
    const a = createDuel(CUTTER, 7), b = createDuel(CUTTER, 7), pa = createScriptedPair(7), pb = createScriptedPair(7);
    try {
      expect(hashDuel(a)).toBe(hashDuel(b));
      while (a.tactical.outcome === Outcome.Running) {
        stepDuelTick(a, scriptedInput(pa, a)); stepDuelTick(b, scriptedInput(pb, b));
        expect(hashDuel(b), `tick ${a.interior.tick}`).toBe(hashDuel(a));
      }
      expect(b.tactical.outcome).toBe(a.tactical.outcome);
      expect(runDuel(8, 'scripted').finalHash).not.toBe(hashDuel(a));
    } finally { disposeDuel(a); disposeDuel(b); }
  }, 60_000);
  it('flattenDuel starts with SIM_VERSION, so a version bump changes every duel hash', () => {
    const d = createDuel(CUTTER, 1);
    expect(flattenDuel(d)[0]).toBe(SIM_VERSION);
    disposeDuel(d);
  });
});
