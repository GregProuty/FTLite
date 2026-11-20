// Net-4a §4.1, gate G2 (spec 2026-11-19-net-4a-duel-prediction-design §6): restore, then step, is exact. A scripted
// Cutter duel is run straight, its inputs and hashes kept; at every third tick a copy is restored in place from that
// tick's snapshot and stepped 12 ticks with the same inputs, and its hash must equal the straight run's. `bursts` breaks
// the biggest belt rock every 300 ticks inside the step function both runs use (a deterministic function of the state),
// so the Asteroids-iii pieces are covered. Run by tests/predictionRestore.test.ts on Node and by the cross-engine run.
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { hashDuel } from '../../src/renderer/src/sim/duel/hash';
import { createScriptedPair, scriptedInput } from '../../src/renderer/src/sim/duel/scripted';
import { loadDuelSnapshot, restoreDuelSnapshot, saveDuelSnapshot, type DuelSnapshot } from '../../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../../src/renderer/src/sim/duel/state';
import { stepDuelTick, type DuelInput } from '../../src/renderer/src/sim/duel/step';
import { breakRock } from '../../src/renderer/src/sim/tactical/rockBreak';
import { beginRockTick, rockAlive, rockAt } from '../../src/renderer/src/sim/tactical/rocks';

const CUTTER = parseShip(cutter);
/** The largest live belt rock, or −1 (tests/helpers/rockStress.ts's biggestBelt, inlined: this file is bundled for browsers). */
function biggestBelt(d: DuelState): number {
  const t = d.tactical; let best = -1;
  for (let k = 0; k < t.map.beltCount; k++) if (rockAlive(t, k) && (best < 0 || rockAt(t, k).r > rockAt(t, best).r)) best = k;
  return best;
}
/** A torpedo-style burst of the biggest live belt rock, toward the planet (spike-asteroids-iii-idle's script-side burst). */
export function burstRock(d: DuelState): void {
  const t = d.tactical, k = biggestBelt(d);
  if (k >= 0) { const a = rockAt(t, k); breakRock(t, k, -a.x, -a.y, 'torpedo', 0, 'burst'); beginRockTick(t); }
}
/** A step function that, every `every` ticks (0: never), bursts the biggest belt rock first. A deterministic function
 *  of the state, so a straight run and a restored copy (or the predictor, through its `step` option) burst alike. */
export function burstStep(every: number) {
  return (d: DuelState, input: DuelInput): void => {
    if (every > 0 && d.interior.tick > 0 && d.interior.tick % every === 0) burstRock(d);
    stepDuelTick(d, input);
  };
}
export function duelRestoreCheck(digest: string, options: { seed?: number; ticks?: number; bursts?: boolean } = {}): { checks: number; finalHash: string } {
  const seed = options.seed ?? 3, ticks = options.ticks ?? 1800, step = burstStep(options.bursts ? 300 : 0);
  const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
  const inputs: DuelInput[] = [], hashes: string[] = [hashDuel(d)], snaps = new Map<number, DuelSnapshot>();
  let copy: DuelState | null = null, checks = 0;
  try {
    for (let k = 0; k < ticks; k++) {
      if (k % 3 === 0) snaps.set(k, saveDuelSnapshot(d, digest));
      const input = scriptedInput(pair, d);
      inputs.push(structuredClone(input));
      step(d, input);
      hashes.push(hashDuel(d));
    }
    for (const [k, snap] of snaps) {
      if (k + 12 > ticks) continue;
      if (!copy) copy = loadDuelSnapshot(CUTTER, snap, digest); else restoreDuelSnapshot(copy, snap, digest);
      for (let j = 0; j < 12; j++) step(copy, inputs[k + j]!);
      const got = hashDuel(copy), want = hashes[k + 12]!;
      if (got !== want) throw Error(`duel restore at tick ${k} differs after 12 ticks: ${got} != ${want}`);
      checks++;
    }
    return { checks, finalHash: hashes[ticks]! };
  } finally { disposeDuel(d); if (copy) disposeDuel(copy); }
}
