// The duel's seeds (H-2 spec §2): a room's first seed comes from its runId, every round's seed from the one before.
// A seed is valid when its map passes validateMap; the next valid seed advances by one (wrapping at 2^32) and gives up
// after MAX_SEED_STEPS. Pure and deterministic, so both machines compute the same seeds for a room.
import { duelSeedFacts, MAX_DUEL_ROUNDS } from './snapshot';

/** How many seeds nextValidSeed tries before it gives up. */
export const MAX_SEED_STEPS = 16;

/** The first valid seed at or after `seed`; throws after MAX_SEED_STEPS invalid ones. */
export function nextValidSeed(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error(`invalid duel seed ${seed}`);
  let s = seed;
  for (let k = 0; k < MAX_SEED_STEPS; k++) {
    if (duelSeedFacts(s).valid) return s;
    s = (s + 1) >>> 0;
  }
  throw new Error(`no valid duel map within ${MAX_SEED_STEPS} seeds of ${seed}`);
}

/** The seed after a round's: the next valid seed after `seed + 1`. */
export function followingSeed(seed: number): number { return nextValidSeed((seed + 1) >>> 0); }

const chains = new Map<number, number[]>();
/** Round n's seed for a duel whose init seed is `initSeed` (round 0 is the init seed itself), memoised per init seed.
 *  The round is bounded by MAX_DUEL_ROUNDS, so a forged round never extends the chain without limit. */
export function roundSeed(initSeed: number, round: number): number {
  if (!Number.isSafeInteger(round) || round < 0 || round > MAX_DUEL_ROUNDS) throw new Error(`invalid duel round ${round}`);
  let chain = chains.get(initSeed);
  if (!chain) {
    chain = [initSeed]; chains.set(initSeed, chain);
    if (chains.size > 4) chains.delete(chains.keys().next().value as number);
  }
  while (chain.length <= round) chain.push(followingSeed(chain[chain.length - 1]!));
  return chain[round]!;
}

/** A room's first seed (spec §2): the runId's first eight hex digits as a u32, then the next valid seed. */
export function seedFromRunId(runId: string): number {
  if (!/^[0-9a-f]{32}$/.test(runId)) throw new Error('a duel runId is 32 lowercase hex characters');
  return nextValidSeed(parseInt(runId.slice(0, 8), 16));
}
