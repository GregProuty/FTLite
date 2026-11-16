# Helm H-2a-i: Rounds and the Duel Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The duel becomes a series of rounds inside one authority run, and its contracts are ready for the network. A decided round is an end card that keeps ticking and answers every command; `rematch` there starts the next round in place on the next tick, from the round seed after this one, with the init's Helm player. A hashed `round` module (`round`, `helmPlayer`, `baseTick`, `decidedTick`) carries the round context, so the step, the snapshot, the checkpoint validator and late clients all read it from state. The authority emits one `round` record per decided round; the telemetry accumulator restarts per round and freezes on the decision. `DuelInit` gains `helmPlayer`; the duel wire gains `rematch`, the `round` event and the reasons `duel-running` and `duel-decided`; the end summary widens to the Helm §13 list. Publication validation becomes cheap through two bounded caches, with an in-place `restoreDuelSnapshot`. SIM_VERSION goes 38 → 39 through the spec's bless sequence, proved per tick by the sector comparison and the duel oracle's `MIGRATIONS[38]`, then a rematch golden is added with `--fresh`.

**Architecture:**
- `sim/duel/snapshot.ts`: the seed cache (validity, `mapHash`, field offsets, grace length and the tactical shape, never exposed) and the layout cache (`Derived`, canonical fields); `restoreDuelSnapshot`; `duelRoundOf`; the round module's validation.
- `sim/duel/seeds.ts` (new): `nextValidSeed`, `followingSeed`, `roundSeed`, `seedFromRunId`.
- `sim/duel/state.ts`, `modules.ts`, `step.ts`, `telemetry.ts`, `summary.ts`: the round module and its four members; `createDuel(layout, seed, helmPlayer = 0)`; the decided-round step, the rematch and the in-place next round; the per-round, freezing accumulator; the widened summary and `DuelRoundRecord`.
- `authority/rules.ts` and `core.ts`: an optional `records(prev, state)` hook, emitted after a tick's cues. `authority/duelRules.ts`: rounds (terminal never ends the run; the safe-point key is `duel:<round>:<decided>`; the round record). `authority/duelCheckpoint.ts`: `helmPlayer` in the init and the redefined checkpoint rules.
- `net/contracts.ts`, `net/codec.ts`: `rematch`, the `round` payload through a new `ModeWire.events` hook, the two reasons, the widened summary schema. `sim/replay.ts`, `authority/replay.ts`: the replay frame's event kind admits `round`.
- `network/modes/duel.ts`: duel schema version 2. `scripts/golden/duelOracle.ts`: `MIGRATIONS[38]`. `scripts/bless-golden.ts`: the rematch golden joins the pinned set.
- `scripts/profile-duel-publication.ts` (new): the publication budget gate.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, tsx, zod 3, Electron 37. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md` §2 (seats and swap, seed), §4 (the shared schema pieces), §5 (the validation cache and its budget), §7 (rounds, the redefined checkpoint validator, the versioning and bless sequence), §8 (the widened summary) and the H-2a row of §11. This is the first of three H-2a plans: H-2a-ii (`2026-11-16-helm-h2a-ii-online-stack.md`) builds the headless online stack on it, and H-2a-iii (`2026-11-16-helm-h2a-iii-online-app.md`) the application.

## Scope

- **Prerequisite:** master at `0c194e7` or later (the main menu: Single player, Multiplayer, Settings, and Art-i-a; SIM_VERSION 38). Task 1 Step 0 checks it.
- **Task 1:** the bless baselines at 38; the validation cache, `restoreDuelSnapshot`, the duel seeds and the publication profile, measured before and after the cache. Golden-neutral.
- **Task 2:** the duel wire for rounds: `rematch`, the `round` event, the two reasons, the widened summary. Golden-neutral.
- **Task 3:** rounds in the sim, the rules, the core hook and the checkpoint; SIM_VERSION 39; `MIGRATIONS[38]`; check, bless, golden.
- **Task 4:** the rematch golden, blessed with `--fresh` in its own commit.
- **Task 5:** the gates: the full suite, the duel gates, determinism, the host runtime and the online application.
- **Not in H-2a-i:** the stream clients, the producer manager and steward (H-2a-ii); the main process, the renderer and the smokes (H-2a-iii); H-2b and H-2c.

## Global Constraints

- **Prerequisite: master `0c194e7` or later.** Do not start on an older checkout.
- **The §7 baselines are taken before any H-2 sim change.** Task 1 Step 1 records both at SIM_VERSION 38, on the unchanged checkout; nothing else may run first.
- Determinism guard (`tests/boundary.test.ts`): `sim/duel/seeds.ts`, `snapshot.ts`, `step.ts`, `summary.ts`, `authority/duelRules.ts` and `duelCheckpoint.ts` fall under it: only `Math.abs`, `ceil`, `floor`, `round`, `min`, `max`, `sign`, `imul` and `sqrt`; no platform globals; randomness only through `src/shared/rng.ts`. Files under `sim/` import nothing from `authority/`, `clientControl/`, `app/` or `render/`.
- **Generated files come only from `npm run bless`:** `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json` and `tests/fixtures/determinism-v2.json` are never edited by hand.
- **Never discard working-tree changes.** No step runs `git checkout`, `git restore`, `git stash` or `git clean`: the owner and other sessions keep uncommitted work in the main checkout. Every check that writes evidence writes it under the git-ignored `out/`.
- **A git worktree needs both junctions:** `node_modules` to the main checkout's `node_modules`, and `services\signalling\node_modules` to the main checkout's `services\signalling\node_modules` (PowerShell `New-Item -ItemType Junction`). Without the second, `tests/onlineAppRuntime.test.ts` and the online smokes fail; that is not a flake.
- **Commands need no shell features.** Every `Run:` line works as written in Windows PowerShell 5.1 and in Git Bash.
- Commit with explicit paths only (`git add <paths>`), never `git add -A` or `git add .`. End every commit message with the Co-Authored-By trailer your own session instructs.
- Run single test files with `npx vitest run <file>`. The full suite is `npm test` (it reads the built `out/`; build first). Typecheck is `npm run typecheck`.
- Known flakes under full-suite load (each passes alone; rerun the file alone): `tests/authorityBoundary.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts` ("a run saved mid Build Up") and `tests/director.test.ts` (the 20-minute soak).
- Line endings: write files with LF.
- **The code is exact.** A file shown in full is written as shown. Each `replace:` block occurs exactly once in its file at that point of the plan: replace it with the `with:` block, in the order given. The plans were re-extracted step by step into a fresh worktree and reproduce the prototype byte for byte.

## Decisions the plan makes inside the spec

Each is the recommendation, taken under the standing order; the owner can overturn any of them.

1. **Three plans, not two** **(rec.)**: the spec's split (§11) puts the client stack beside the session; the brief's puts the contracts and the sim first. This plan is that first part; the second part is itself split in two, the headless online stack (H-2a-ii, proved over the loopback as §11 asks before any application work) and the application (H-2a-iii). Each merges with the suite green.
2. **The round module's members are four flat `DuelState` fields** **(rec.)**: `round`, `helmPlayer`, `baseTick` and `decidedTick`, in a module with id `round` flattened after `repair` and before `interior`. The duel oracle names them `round.round`, `round.helmPlayer`, `round.baseTick` and `round.decidedTick`, exactly the spec's `MIGRATIONS[38]` pattern, and the module completeness test sees each as a field.
3. **`baseTick` is the first tick of the new round** **(rec.; the spec's "the rematch tick")**: the rematch is applied by the step that runs on decided tick T, and the next round begins on tick T + 1, so `baseTick = T + 1`, the round's snapshot at `baseTick` is the fresh round, and the accumulator's `ticks` (tick − `baseTick`) starts at 0.
4. **The tick-stamp audit** (spec §7, found by the round-start equivalence test): the stamps are the interior and tactical ticks, every ship's `graceUntil` (filled with T: a fresh duel's 0 is already expired at tick 0, as T is at T), the hunter's `lastLaunch` (moved by T) and `fireAt` when scheduled (it is then T plus the fresh value; −1 stays −1). Nothing in the Cutter interior that the duel runs is tick-stamped. The test compares every other canonical field exactly for 600 ticks.
5. **The next round is built in place** **(rec.)**: `startRound` creates a fresh duel (a fresh interior world) and `Object.assign`s it into the decided one after disposing its interior, so every holder of the `DuelState` keeps it and no ECS entity is reused across rounds. The restore-equality test passes at every tick for 600 ticks after a rematch.
6. **The end card's results** (spec §7): the first `rematch` from a player present at the tick's start is applied, a second that tick is `noop`, one from an away player is rejected `unavailable` and one stamped for another tick `stale-tick` (receive-time admission restamps, so only a local caller can be stale); `presence` applies as ever; every other duel command is rejected `duel-decided`; a `rematch` while the round runs is rejected `duel-running`. The decided step also clears the tactical events, so the deciding tick's cues never repeat.
7. **The `records` hook reads the cue baseline** **(rec.)**: the core calls `records(previousCues, state)` after the tick's cues; the duel's baseline becomes `{ outcome, round }`, and a round record is emitted when the same round leaves Running. The duel never reports `ended` any more; its `EndRecord` variant stays in the codec, now carrying the widened summary.
8. **The widened summary** (spec §8): `missileLosses` is per ship, each a record of the accumulator's six causes in their order; every other figure is a per-ship or per-player pair, or a single count. `DuelRoundRecord` is the summary plus `round`, `seed` and `baseTick`.
9. **The layout cache is keyed by the layout object** **(rec.; the spec says by `layout.id` and `layoutHash`)**: computing the `layoutHash` is `deriveLayout`, the cost the cache avoids, so the key is the layout object itself, and the entry holds its id and `layoutHash`, which validation compares exactly as before. Bounded at 4 like the spec's.
10. **`roundSeed` keeps a memoised chain** **(rec.)**: round n's seed applies `nextValidSeed(s + 1)` n times from the init seed; the chain is kept for four init seeds, so validating a checkpoint of round n does not regenerate n maps.
11. **The replay frame's event kind gains `round`** (not a wire schema): a duel replay records the round events like any other.
12. **The rematch golden** (`tests/golden/duel-rematch.json`): seed 1's scripted pair to its outcome, a rematch from player 0 on the first end-card tick, a fresh scripted pair for round 2 to its outcome, `hashDuel` whenever the encounter tick is a multiple of 600: `{ simVersion, seed, every, rematchTick, rounds: [{ seed, baseTick, outcome, ticks }], finalHash, hashes }`, read by `duelVersionFromText` for the guard.
13. **The publication budget, measured** (spec §5; this machine, seed 2026 at tick 3,600, 600 samples, two runs): before the cache the host's median per tick is 0.598 to 0.792 ms and the client's per publication 0.706 to 0.940 ms (restore by `loadDuelSnapshot`); after it, 0.376 to 0.387 ms and 0.262 to 0.272 ms (restore by `restoreDuelSnapshot`). Both budgets (1.5 ms and 1.0 ms) are met after the cache, with room; the script exits 1 above them.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/duel/snapshot.ts` | **Modify:** the two caches, `duelSeedFacts`, `duelCacheProbe`, `restoreDuelSnapshot`, `duelRoundOf`, the round module's checks |
| `src/renderer/src/sim/duel/seeds.ts` | **Create:** the duel's seeds |
| `src/renderer/src/sim/duel/state.ts`, `modules.ts`, `step.ts`, `telemetry.ts`, `summary.ts` | **Modify:** the round module, the Helm player, the decided step and the rematch, the per-round accumulator, the widened summary |
| `src/renderer/src/authority/rules.ts`, `core.ts`, `duelRules.ts`, `duelCheckpoint.ts`, `replay.ts` | **Modify:** the `records` hook, rounds in the rules, the init and checkpoint rules, the replay event kind |
| `src/renderer/src/net/contracts.ts`, `codec.ts` | **Modify:** `rematch`, the `round` event, the reasons, `ModeWire.events`, the summary schema |
| `src/renderer/src/sim/replay.ts`, `sim/tuning.ts` | **Modify:** the replay event kind; SIM_VERSION 39 |
| `src/network/modes/duel.ts` | **Modify:** duel schema version 2 |
| `scripts/golden/duelOracle.ts`, `scripts/bless-golden.ts` | **Modify:** `MIGRATIONS[38]`; the rematch golden in the pinned set |
| `scripts/profile-duel-publication.ts` | **Create:** the budget gate |
| `tests/duelCache.test.ts`, `tests/duelRounds.test.ts`, `tests/duelRematchGolden.test.ts`, `tests/helpers/liveDuel.ts` | **Create:** the tests and the live duel harness |
| `tests/helpers/duelAuthority.ts`, `tests/helpers/scriptedDuel.ts` | **Modify:** `helmPlayer` in the test init; `runRematch` |
| `tests/codecModeWire.test.ts`, `commandUnion.test.ts`, `duelSummary.test.ts`, `duelCheckpoint.test.ts`, `duel.test.ts`, `duelMode.test.ts`, `duelModules.test.ts`, `duelSnapshot.test.ts`, `blessGuard.test.ts` | **Modify:** to the new contracts (listed per task) |

---

### Task 1: The baselines, the validation cache, the duel seeds and the budget

**Files:**
- Create: `src/renderer/src/sim/duel/seeds.ts`, `scripts/profile-duel-publication.ts`, `tests/duelCache.test.ts`
- Modify: `src/renderer/src/sim/duel/snapshot.ts`, `src/renderer/src/authority/duelCheckpoint.ts`

**Interfaces:**
- Consumes: `createTacticalState`, `validateMap`, `mapHash`, `TACTICAL_MODULES`, `tacticalLength`, `hashTactical`, `deriveLayout`, `canonicalFields`.
- Produces:
  - `snapshot.ts`: `SEED_CACHE_MAX` (8), `LAYOUT_CACHE_MAX` (4); `duelSeedFacts(seed): { valid, mapHash, spaceLength, graceLength }`; `duelCacheProbe(seed?): { seeds, layouts, shapeHash }` (tests only; never the shape); `restoreDuelSnapshot(d, snapshot, contentDigest): void`.
  - `seeds.ts`: `MAX_SEED_STEPS` (16); `nextValidSeed(seed)`, `followingSeed(seed)`, `roundSeed(initSeed, round)`, `seedFromRunId(runId)`.

- [ ] **Step 0: Check the prerequisite**

Run: `git merge-base --is-ancestor 0c194e7 HEAD`
Expected: exit 0 (master's Art-i-a merge, on top of the main menu merge `2871669`, is in this checkout). **If it exits 1, stop.**

Run: `npx vitest run tests/duelGolden.test.ts`
Expected: PASS, 4 tests in 1 file (the SIM 38 duel golden).

- [ ] **Step 1: Record both §7 baselines at SIM_VERSION 38, before anything changes**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 38: golden 7200 ticks, determinism-v2 108000 ticks in 19 runs; written to <temp>\trace.json`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version 38: 20 runs, 205178 ticks, 315 named fields per tick; written to <temp>\duel-oracle.json`, exit 0. The oracle baseline is tied to `tests/golden/duel-1.json`.

- [ ] **Step 2: Write the profile script and measure the budget before the cache**

The restore uses `restoreDuelSnapshot` when the build has it, else `loadDuelSnapshot`, so the same script measures both sides of the change; it finds seed 2026's next valid seed without the seed cache.

Create `scripts/profile-duel-publication.ts`:

````ts
// The duel publication budget (H-2 spec §5): on seed 2026 (its next valid seed) mid-duel, the host's median cost per
// tick for the snapshot, two validations and two image encodes (one per streamed attachment), and the client's cost
// per received publication (decode, validate, restore). Budgets: host under 1.5 ms, client under 1.0 ms.
// Explicit diagnostic: npx tsx scripts/profile-duel-publication.ts [--json <path>]
// The restore uses restoreDuelSnapshot when the build has it (after the cache), else loadDuelSnapshot, so the same
// script measures the code before and after the cache.
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { computeContentDigest } from '../build/contentDigest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import * as snapshots from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { validateMap } from '../src/renderer/src/sim/tactical/map';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { duelPublicationToImage, imageToDuelPublication, type DuelPublication } from '../src/network/modes/duelStream';
import { decodeState, encodeDelta, encodeFull, type StateImage } from '../src/network/state/imageCodec';
import { hashF64 } from '../src/shared/hash';

const contentDigest = computeContentDigest(process.cwd());
const layout = parseShip(cutter), resolveLayout = (id: string) => { if (id !== layout.id) throw Error('unknown layout'); return layout; };
const options = { resolveLayout, contentDigest };
let seed = 2026;
while (validateMap(createTacticalState(seed).map).length > 0) seed++;   // seed 2026's next valid seed, without the seed cache
const WARM = 3000, SAMPLES = 600;
const restore: (d: DuelState | null, snap: snapshots.DuelSnapshot) => DuelState = (snapshots as { restoreDuelSnapshot?: unknown }).restoreDuelSnapshot
  ? (d, snap) => { if (d) { snapshots.restoreDuelSnapshot(d, snap, contentDigest); return d; } return snapshots.loadDuelSnapshot(layout, snap, contentDigest); }
  : (d, snap) => { if (d) disposeDuel(d); return snapshots.loadDuelSnapshot(layout, snap, contentDigest); };

function publication(d: DuelState, sequence: number): DuelPublication {
  const snapshot = snapshots.saveDuelSnapshot(d, contentDigest);
  return { runId: 'profile', tick: d.interior.tick, publicationSequence: sequence, snapshot, hash: hashF64(Float64Array.from(snapshot.values)), phase: 'running',
    pauseOwner: null, pauseReason: null, controlRevision: 0, lagTicks: 0, tickTimeMs: null, commandHighWater: [0, 0], heldHighWater: [0, 0], auxiliaryHighWater: [0, 0], eventSequence: 0 };
}
const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

const d = createDuel(layout, seed), pair = createScriptedPair(seed);
let replica: DuelState | null = null;
try {
  for (let k = 0; k < WARM; k++) stepDuelTick(d, scriptedInput(pair, d));
  const host: number[] = [], client: number[] = [];
  let previous: StateImage | null = null;
  for (let k = 0; k < SAMPLES; k++) {
    stepDuelTick(d, scriptedInput(pair, d));
    let t = performance.now();
    const pub = publication(d, k + 1), images = [duelPublicationToImage(pub, options), duelPublicationToImage(pub, options)];
    const bytes = images.map((image) => (previous ? encodeDelta(previous, image) : encodeFull(image)));
    host.push(performance.now() - t);
    t = performance.now();
    const received = imageToDuelPublication(decodeState(bytes[0]!, previous ?? undefined), options);
    replica = restore(replica, received.snapshot);
    client.push(performance.now() - t);
    previous = images[0]!;
  }
  const result = { seed, tick: d.interior.tick, samples: SAMPLES, restore: 'restoreDuelSnapshot' in snapshots ? 'restoreDuelSnapshot' : 'loadDuelSnapshot',
    hostMedianMs: Number(median(host).toFixed(3)), clientMedianMs: Number(median(client).toFixed(3)), hostBudgetMs: 1.5, clientBudgetMs: 1.0 };
  console.log(`duel publication profile, seed ${seed} at tick ${result.tick} (${SAMPLES} samples, restore by ${result.restore}): host ${result.hostMedianMs} ms per tick (budget 1.5), client ${result.clientMedianMs} ms per publication (budget 1.0)`);
  const at = process.argv.indexOf('--json');
  if (at > 0 && process.argv[at + 1]) { mkdirSync(dirname(process.argv[at + 1]!), { recursive: true }); writeFileSync(process.argv[at + 1]!, JSON.stringify(result, null, 2) + '\n'); }
  if (result.hostMedianMs >= 1.5 || result.clientMedianMs >= 1.0) process.exitCode = 1;
} finally { disposeDuel(d); if (replica) disposeDuel(replica); }
````

Run: `npx tsx scripts/profile-duel-publication.ts --json out/h2a-profile/before.json`
Expected: `duel publication profile, seed 2026 at tick 3600 (600 samples, restore by loadDuelSnapshot): host <h> ms per tick (budget 1.5), client <c> ms per publication (budget 1.0)`. Exit 0, or 1 when a figure is over its budget, which the client's can be before the cache; this run only records. The prototype measured host 0.598 and 0.792 ms, client 0.706 and 0.940 ms (two runs). Keep `out/h2a-profile/before.json` for the merge evidence.

- [ ] **Step 3: Write the failing test**

Create `tests/duelCache.test.ts`:

````ts
// The duel publication validation cache, the in-place restore and the duel's seeds (H-2 spec §2, §4, §5).
import { describe, expect, it } from 'vitest';
import { hashTactical } from '../src/renderer/src/sim/tactical/hash';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import * as snapshots from '../src/renderer/src/sim/duel/snapshot';
import { duelCacheProbe, duelSeedFacts, LAYOUT_CACHE_MAX, loadDuelSnapshot, restoreDuelSnapshot, saveDuelSnapshot, SEED_CACHE_MAX, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { followingSeed, MAX_SEED_STEPS, nextValidSeed, roundSeed, seedFromRunId } from '../src/renderer/src/sim/duel/seeds';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { validateMap } from '../src/renderer/src/sim/tactical/map';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const played = (seed: number, ticks: number) => {
  const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
  for (let k = 0; k < ticks; k++) stepDuelTick(d, scriptedInput(pair, d));
  return d;
};
const outcome = (f: () => unknown): string => { try { f(); return 'accepted'; } catch (e) { return (e as Error).message; } };

describe('the duel validation cache (spec §5)', () => {
  it('is bounded: at most 8 seeds and 4 layouts, least recently used first out', () => {
    for (let seed = 100; seed < 120; seed++) duelSeedFacts(seed);
    expect(duelCacheProbe().seeds).toBe(SEED_CACHE_MAX);
    expect(duelCacheProbe(100).shapeHash).toBeNull();        // evicted
    expect(duelCacheProbe(119).shapeHash).not.toBeNull();
    duelSeedFacts(112);                                       // touched: now the most recent
    for (let seed = 200; seed < 207; seed++) duelSeedFacts(seed);
    expect(duelCacheProbe(112).shapeHash).not.toBeNull();
    expect(duelCacheProbe(113).shapeHash).toBeNull();
    const d = createDuel(CUTTER, 5);
    try { for (let k = 0; k < 6; k++) validateDuelSnapshot(structuredClone(CUTTER), saveDuelSnapshot(d, DIGEST), DIGEST); } finally { disposeDuel(d); }
    expect(duelCacheProbe().layouts).toBe(LAYOUT_CACHE_MAX);
  });
  it('agrees with an uncached regeneration, and the shape no caller can obtain is never changed by 10,000 validations', () => {
    for (const seed of [1, 7, 2026]) {
      const fresh = createTacticalState(seed);
      expect(duelSeedFacts(seed)).toMatchObject({ valid: validateMap(fresh.map).length === 0, graceLength: fresh.ships[0].graceUntil.length });
    }
    expect(Object.keys(snapshots).filter((k) => /shape|entry|cache/i.test(k)).sort()).toEqual(['LAYOUT_CACHE_MAX', 'SEED_CACHE_MAX', 'duelCacheProbe']);
    const d = played(3, 400);
    try {
      const snap = saveDuelSnapshot(d, DIGEST);
      validateDuelSnapshot(CUTTER, snap, DIGEST);
      const before = duelCacheProbe(3).shapeHash;
      expect(before).toBe(hashTactical(createTacticalState(3)));
      for (let k = 0; k < 10_000; k++) validateDuelSnapshot(CUTTER, snap, DIGEST);
      expect(duelCacheProbe(3).shapeHash).toBe(before);
    } finally { disposeDuel(d); }
  }, 60_000);
  it('accepts and rejects exactly as before, whether the seed is cached or was just evicted', () => {
    const d = played(2, 300);
    try {
      const good = saveDuelSnapshot(d, DIGEST);
      const variants = [good, { ...good, header: { ...good.header, mapHash: '00000000' } }, { ...good, values: good.values.map((v, k) => (k === 9 ? v + 0.5 : v)) },
        { ...good, header: { ...good.header, seed: 3 } }, { ...good, values: good.values.slice(1) }];
      const warm = variants.map((v) => outcome(() => validateDuelSnapshot(CUTTER, v, DIGEST)));
      for (let seed = 300; seed < 300 + SEED_CACHE_MAX + 1; seed++) duelSeedFacts(seed);   // evict seeds 2 and 3
      expect(duelCacheProbe(2).shapeHash).toBeNull();
      expect(variants.map((v) => outcome(() => validateDuelSnapshot(CUTTER, v, DIGEST)))).toEqual(warm);
      expect(warm[0]).toBe('accepted');
      expect(warm.slice(1).every((m) => m !== 'accepted')).toBe(true);
    } finally { disposeDuel(d); }
  });
});

describe('restoreDuelSnapshot (spec §4)', () => {
  it('restores a validated snapshot into an existing duel in place, to the same hash as a load', () => {
    const a = played(4, 200), b = played(4, 900);
    try {
      const snap = validateDuelSnapshot(CUTTER, saveDuelSnapshot(b, DIGEST), DIGEST), interior = a.interior;
      restoreDuelSnapshot(a, snap, DIGEST);
      expect(a.interior).toBe(interior);                       // no new interior
      expect(hashDuel(a)).toBe(hashDuel(b));
      const loaded = loadDuelSnapshot(CUTTER, snap, DIGEST);
      try { expect(hashDuel(loaded)).toBe(hashDuel(a)); } finally { disposeDuel(loaded); }
    } finally { disposeDuel(a); disposeDuel(b); }
  });
  it('refuses a snapshot of another seed or digest (a new round is a replacement)', () => {
    const a = played(4, 10), c = played(5, 10);
    try {
      const other = validateDuelSnapshot(CUTTER, saveDuelSnapshot(c, DIGEST), DIGEST);
      expect(() => restoreDuelSnapshot(a, other, DIGEST)).toThrow(/load it instead/);
      expect(() => restoreDuelSnapshot(a, validateDuelSnapshot(CUTTER, saveDuelSnapshot(a, DIGEST), DIGEST), 'f'.repeat(64))).toThrow(/versions/);
    } finally { disposeDuel(a); disposeDuel(c); }
  });
});

describe('the duel seeds (spec §2)', () => {
  it('nextValidSeed returns the first valid seed at or after its argument, within 16 steps', () => {
    for (const s of [0, 1, 2026, 0xfffffff0]) {
      const v = nextValidSeed(s), steps = (v - s + 2 ** 32) % 2 ** 32;
      expect(steps).toBeLessThan(MAX_SEED_STEPS);
      expect(validateMap(createTacticalState(v).map)).toEqual([]);
      for (let k = 0; k < steps; k++) expect(validateMap(createTacticalState((s + k) >>> 0).map).length).toBeGreaterThan(0);
    }
    expect(() => nextValidSeed(-1)).toThrow(/invalid duel seed/);
  });
  it('round n is nextValidSeed after round n − 1 plus one; round 0 is the init seed', () => {
    const init = nextValidSeed(77);
    expect(roundSeed(init, 0)).toBe(init);
    let s = init;
    for (let n = 1; n <= 5; n++) { s = nextValidSeed((s + 1) >>> 0); expect(roundSeed(init, n)).toBe(s); expect(followingSeed(roundSeed(init, n - 1))).toBe(s); }
  });
  it('a room seed is the runId\'s first eight hex digits as a u32, then the next valid seed', () => {
    expect(seedFromRunId('0000002a' + '0'.repeat(24))).toBe(nextValidSeed(42));
    expect(seedFromRunId('ffffffff' + 'a'.repeat(24))).toBe(nextValidSeed(0xffffffff));
    expect(() => seedFromRunId('XYZ')).toThrow(/32 lowercase hex/);
  });
});
````

Run: `npx vitest run tests/duelCache.test.ts`
Expected: FAIL: the module `src/renderer/src/sim/duel/seeds.ts` does not exist.

- [ ] **Step 4: The duel seeds**

Create `src/renderer/src/sim/duel/seeds.ts`:

````ts
// The duel's seeds (H-2 spec §2): a room's first seed comes from its runId, every round's seed from the one before.
// A seed is valid when its map passes validateMap; the next valid seed advances by one (wrapping at 2^32) and gives up
// after MAX_SEED_STEPS. Pure and deterministic, so both machines compute the same seeds for a room.
import { duelSeedFacts } from './snapshot';

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
/** Round n's seed for a duel whose init seed is `initSeed` (round 0 is the init seed itself), memoised per init seed. */
export function roundSeed(initSeed: number, round: number): number {
  if (!Number.isSafeInteger(round) || round < 0) throw new Error(`invalid duel round ${round}`);
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
````

- [ ] **Step 5: The caches and the in-place restore**

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

````ts
// fresh duel and requires hashDuel to equal the hash the header records.
import { hashF64 } from '../../../../shared/hash';
import { canonicalFields } from '../canonicalFields';
import { deriveLayout } from '../ship/derived';
import type { ShipLayout } from '../ship/schema';
import { validateCanonicalValues } from '../snapshotValidation';
import { validateMap } from '../tactical/map';
import { createTacticalState } from '../tactical/state';
import { DUEL_CLASSES } from '../tactical/defs';
import { TACTICAL_MODULES, tacticalLength, validateTacticalValues } from '../tactical/hash';
import { REPAIR_UNITS } from './tuning';
````

with:

````ts
// fresh duel and requires hashDuel to equal the hash the header records.
// The publication validation cache (H-2 spec §5): what validation regenerates from a seed (the map, its validity and
// hash, the field offsets, the grace length) and from a layout (Derived, the canonical fields) is memoised in two small
// bounded caches. Every check keeps its order; only the regeneration is shared. The cached tactical shape is read only
// by validateTacticalValues and never leaves this module.
import { hashF64 } from '../../../../shared/hash';
import { canonicalFields, type CanonicalField } from '../canonicalFields';
import { deriveLayout, type Derived } from '../ship/derived';
import type { ShipLayout } from '../ship/schema';
import { validateCanonicalValues } from '../snapshotValidation';
import { validateMap } from '../tactical/map';
import { createTacticalState, type TacticalState } from '../tactical/state';
import { DUEL_CLASSES } from '../tactical/defs';
import { TACTICAL_MODULES, hashTactical, tacticalLength, validateTacticalValues } from '../tactical/hash';
import { REPAIR_UNITS } from './tuning';
````

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

````ts

export function saveDuelSnapshot(d: DuelState, contentDigest: string): DuelSnapshot {
````

with:

````ts

/** The seed cache's and the layout cache's bounds (H-2 spec §5). */
export const SEED_CACHE_MAX = 8;
export const LAYOUT_CACHE_MAX = 4;
interface SeedEntry {
  valid: boolean; mapHash: string; spaceLength: number; fieldOffsets: ReadonlyMap<string, number>; graceLength: number;
  /** createTacticalState(seed), read only by validateTacticalValues; never returned to a caller. */
  shape: TacticalState;
}
interface LayoutEntry { id: string; layoutHash: string; derived: Derived; fields: readonly CanonicalField[]; interiorCount: number; tickOffset: number }
const seedCache = new Map<number, SeedEntry>();
const layoutCache = new Map<ShipLayout, LayoutEntry>();
function remember<K, V>(cache: Map<K, V>, key: K, max: number, make: () => V): V {
  const hit = cache.get(key);
  if (hit !== undefined) { cache.delete(key); cache.set(key, hit); return hit; }   // least recently used goes first
  const value = make();
  cache.set(key, value);
  if (cache.size > max) cache.delete(cache.keys().next().value as K);
  return value;
}
function seedEntry(seed: number): SeedEntry {
  return remember(seedCache, seed, SEED_CACHE_MAX, () => {
    const shape = createTacticalState(seed), fieldOffsets = new Map<string, number>();
    let offset = 1;
    for (const m of TACTICAL_MODULES) for (const f of m.fields(shape)) { fieldOffsets.set(f.name, offset); offset += f.count; }
    return { valid: validateMap(shape.map).length === 0, mapHash: mapHash(shape.map), spaceLength: tacticalLength(shape), fieldOffsets,
      graceLength: shape.ships[0].graceUntil.length, shape };
  });
}
/** Keyed by the layout object: computing its layoutHash (deriveLayout) is the cost the cache avoids. */
function layoutEntry(layout: ShipLayout): LayoutEntry {
  return remember(layoutCache, layout, LAYOUT_CACHE_MAX, () => {
    const derived = deriveLayout(layout), fields = canonicalFields(layout, DUEL_PLAYERS), last = fields[fields.length - 1]!;
    return { id: layout.id, layoutHash: derived.layoutHash, derived, fields, interiorCount: last.offset + last.count, tickOffset: fields.find((f) => f.name === 'tick')!.offset };
  });
}
/** What a seed's map is, from the cache: whether it validates, its mapHash, and the length of a ship's graceUntil. */
export function duelSeedFacts(seed: number): { valid: boolean; mapHash: string; spaceLength: number; graceLength: number } {
  const e = seedEntry(seed);
  return { valid: e.valid, mapHash: e.mapHash, spaceLength: e.spaceLength, graceLength: e.graceLength };
}
/** Test probe (H-2 spec §5): the cache sizes and, for a cached seed, hashTactical of its shape (never the shape). */
export function duelCacheProbe(seed?: number): { seeds: number; layouts: number; shapeHash: string | null } {
  const e = seed === undefined ? undefined : seedCache.get(seed);
  return { seeds: seedCache.size, layouts: layoutCache.size, shapeHash: e ? hashTactical(e.shape) : null };
}

export function saveDuelSnapshot(d: DuelState, contentDigest: string): DuelSnapshot {
````

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

````ts
  if (h.contentDigest !== contentDigest) throw new Error('duel snapshot content digest does not match');
  const derived = deriveLayout(layout);
  if (h.layoutId !== layout.id || h.layoutHash !== derived.layoutHash) throw new Error('duel snapshot layout does not match');
````

with:

````ts
  if (h.contentDigest !== contentDigest) throw new Error('duel snapshot content digest does not match');
  const lay = layoutEntry(layout), derived = lay.derived;
  if (h.layoutId !== layout.id || h.layoutHash !== derived.layoutHash) throw new Error('duel snapshot layout does not match');
````

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

````ts
  if (typeof h.mapHash !== 'string' || typeof h.hash !== 'string') throw new Error('duel snapshot hashes are invalid');
  const tactical = createTacticalState(h.seed);   // the map and grid only: no interior allocation
  if (validateMap(tactical.map).length > 0) throw new Error('duel snapshot seed makes an invalid map');
  if (mapHash(tactical.map) !== h.mapHash) throw new Error('duel snapshot map does not match its seed');
  if (!Array.isArray(snap.values) || snap.values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('duel snapshot values must be finite numbers');
````

with:

````ts
  if (typeof h.mapHash !== 'string' || typeof h.hash !== 'string') throw new Error('duel snapshot hashes are invalid');
  const seed = seedEntry(h.seed);   // the map and grid only, from the cache: no interior allocation
  if (!seed.valid) throw new Error('duel snapshot seed makes an invalid map');
  if (seed.mapHash !== h.mapHash) throw new Error('duel snapshot map does not match its seed');
  if (!Array.isArray(snap.values) || snap.values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('duel snapshot values must be finite numbers');
````

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

````ts
  const values = (snap.values as number[]).map((v) => (v === 0 ? 0 : v));
  const fields = canonicalFields(layout, DUEL_PLAYERS), last = fields[fields.length - 1]!, interiorCount = last.offset + last.count;
  const space = tacticalLength(tactical), interiorAt = 1 + space + 2 + 3;
  if (values.length !== interiorAt + interiorCount) throw new Error('duel snapshot length does not match the layout and map');
  if (values[0] !== SIM_VERSION) throw new Error('duel snapshot sim version does not match its values');
  if (values[2] !== h.seed) throw new Error('duel snapshot seed does not match its values');
  if (validateTacticalValues(tactical, values, 1) !== 1 + space) throw new Error('duel snapshot tactical length does not match');   // bounds and slot invariants, before anything is allocated
  // The duel's slot identity: exactly its two slots, both active, the Cutter and the hunter, each locked on the other.
  const at = new Map<string, number>();
  let offset = 1;
  for (const m of TACTICAL_MODULES) for (const f of m.fields(tactical)) { at.set(f.name, offset); offset += f.count; }
  const slotValue = (name: string): number => values[at.get(name)!]!;
  if (slotValue('ships.length') !== DUEL_CLASSES.length
````

with:

````ts
  const values = (snap.values as number[]).map((v) => (v === 0 ? 0 : v));
  const space = seed.spaceLength, interiorAt = 1 + space + 2 + 3;
  if (values.length !== interiorAt + lay.interiorCount) throw new Error('duel snapshot length does not match the layout and map');
  if (values[0] !== SIM_VERSION) throw new Error('duel snapshot sim version does not match its values');
  if (values[2] !== h.seed) throw new Error('duel snapshot seed does not match its values');
  if (validateTacticalValues(seed.shape, values, 1) !== 1 + space) throw new Error('duel snapshot tactical length does not match');   // bounds and slot invariants, before anything is allocated
  // The duel's slot identity: exactly its two slots, both active, the Cutter and the hunter, each locked on the other.
  const slotValue = (name: string): number => values[seed.fieldOffsets.get(name)!]!;
  if (slotValue('ships.length') !== DUEL_CLASSES.length
````

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

````ts
  if (interior[5] !== DUEL_PLAYERS || interior[9] !== DUEL_PLAYERS) throw new Error('duel snapshot interior crew count does not match');
  const interiorTick = values[interiorAt + fields.find((f) => f.name === 'tick')!.offset];
  if (values[1] !== h.tick || interiorTick !== h.tick) throw new Error('duel snapshot interior and tactical ticks differ from the header');
````

with:

````ts
  if (interior[5] !== DUEL_PLAYERS || interior[9] !== DUEL_PLAYERS) throw new Error('duel snapshot interior crew count does not match');
  const interiorTick = values[interiorAt + lay.tickOffset];
  if (values[1] !== h.tick || interiorTick !== h.tick) throw new Error('duel snapshot interior and tactical ticks differ from the header');
````

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

````ts
    layoutId: layout.id, layoutHash: derived.layoutHash, seed: h.seed, mapHash: h.mapHash, hash: h.hash }, values };
}
````

with:

````ts
    layoutId: layout.id, layoutHash: derived.layoutHash, seed: h.seed, mapHash: h.mapHash, hash: h.hash }, values };
}

/** Write a validated snapshot's modules back into `d`, then check its ticks and hashDuel against the header. */
function writeBack(d: DuelState, snap: DuelSnapshot): void {
  if (unflattenDuelModules(d, snap.values, 1) !== snap.values.length) throw new Error('duel snapshot length does not match');
  if (d.interior.tick !== d.tactical.tick) throw new Error('duel snapshot interior and tactical ticks differ');
  if (hashDuel(d) !== snap.header.hash) throw new Error('restored duel hash does not match the snapshot');
}
````

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

````ts
  const d = createDuel(layout, snap.header.seed);
  try {
    if (unflattenDuelModules(d, snap.values, 1) !== snap.values.length) throw new Error('duel snapshot length does not match');
    if (d.interior.tick !== d.tactical.tick) throw new Error('duel snapshot interior and tactical ticks differ');
    if (hashDuel(d) !== snap.header.hash) throw new Error('restored duel hash does not match the snapshot');
    return d;
  } catch (error) { disposeDuel(d); throw error; }
}
````

with:

````ts
  const d = createDuel(layout, snap.header.seed);
  try { writeBack(d, snap); return d; } catch (error) { disposeDuel(d); throw error; }
}

/**
 * Restore a snapshot into an existing duel in place (H-2 spec §4): the client applies 20 publications a second, and
 * loadDuelSnapshot allocates a fresh interior on every call. `snapshot` is a value validateDuelSnapshot already
 * returned (the publication path validates once), so it is not validated again; its layout and seed must be the
 * duel's own (a new seed, a new round, is a replacement: load it instead). A failure leaves `d` unusable: dispose it.
 */
export function restoreDuelSnapshot(d: DuelState, snapshot: DuelSnapshot, contentDigest: string): void {
  const h = snapshot.header;
  if (h.contentDigest !== contentDigest || h.simVersion !== SIM_VERSION) throw new Error('duel snapshot versions do not match');
  if (h.layoutId !== d.interior.layout.id || h.layoutHash !== d.interior.derived.layoutHash || h.seed !== d.tactical.seed) throw new Error('duel snapshot is for another layout or seed: load it instead');
  writeBack(d, snapshot);
}
````

- [ ] **Step 6: The checkpoint's map checks read the seed cache**

In `src/renderer/src/authority/duelCheckpoint.ts`, replace:

````ts
import type { ShipLayout } from '../sim/ship/schema';
import { DUEL_PLAYERS, validateDuelSnapshot, type DuelSnapshot } from '../sim/duel/snapshot';
import type { DuelTelemetry, MissileLoss } from '../sim/duel/telemetry';
import { TERMINAL_CAUSES } from '../sim/duel/summary';
import { validateMap } from '../sim/tactical/map';
import { createTacticalState } from '../sim/tactical/state';
import { SIM_VERSION } from '../sim/tuning';
````

with:

````ts
import type { ShipLayout } from '../sim/ship/schema';
import { DUEL_PLAYERS, duelSeedFacts, validateDuelSnapshot, type DuelSnapshot } from '../sim/duel/snapshot';
import type { DuelTelemetry, MissileLoss } from '../sim/duel/telemetry';
import { TERMINAL_CAUSES } from '../sim/duel/summary';
import { SIM_VERSION } from '../sim/tuning';
````

In `src/renderer/src/authority/duelCheckpoint.ts`, replace:

````ts
  if (init.contentDigest !== contentDigest || init.layoutId !== layout.id || init.layoutHash !== deriveLayout(layout).layoutHash) throw new Error('incompatible duel');
  if (validateMap(createTacticalState(init.seed).map).length > 0) throw new Error('invalid duel map for this seed');
  return init;
````

with:

````ts
  if (init.contentDigest !== contentDigest || init.layoutId !== layout.id || init.layoutHash !== deriveLayout(layout).layoutHash) throw new Error('incompatible duel');
  if (!duelSeedFacts(init.seed).valid) throw new Error('invalid duel map for this seed');   // from the seed cache (H-2 spec §5)
  return init;
````

In `src/renderer/src/authority/duelCheckpoint.ts`, replace:

````ts
  for (const { envelope, result } of cp.recentResults) if (envelope.runId !== cp.init.runId || result.tick > cp.snapshot.header.tick) throw new Error('inconsistent checkpoint cache');
  const t = cp.modeMemory.telemetry, bodies = createTacticalState(cp.init.seed).ships[0].graceUntil.length;   // the map's bodies plus the other ship slots
  if (t.prev.grace.some((g) => g.length !== bodies) || t.ticks !== cp.snapshot.header.tick) throw new Error('inconsistent duel telemetry');
````

with:

````ts
  for (const { envelope, result } of cp.recentResults) if (envelope.runId !== cp.init.runId || result.tick > cp.snapshot.header.tick) throw new Error('inconsistent checkpoint cache');
  const t = cp.modeMemory.telemetry, bodies = duelSeedFacts(cp.init.seed).graceLength;   // the map's bodies plus the other ship slots
  if (t.prev.grace.some((g) => g.length !== bodies) || t.ticks !== cp.snapshot.header.tick) throw new Error('inconsistent duel telemetry');
````

- [ ] **Step 7: Run the tests, the typecheck and the budget after the cache**

Run: `npx vitest run tests/duelCache.test.ts tests/duelSnapshot.test.ts tests/duelCheckpoint.test.ts`
Expected: PASS, 19 tests in 3 files (8, 5 and 6).

Run: `npm run typecheck`
Expected: exit 0, no output.

Run: `npx tsx scripts/profile-duel-publication.ts --json out/h2a-profile/after.json`
Expected: `... restore by restoreDuelSnapshot): host <h> ms per tick (budget 1.5), client <c> ms per publication (budget 1.0)`, exit 0, both figures lower than Step 2's. The prototype measured host 0.387 and 0.376 ms, client 0.272 and 0.262 ms.

- [ ] **Step 8: Prove the task golden-neutral**

Run: `npx tsx scripts/golden/duel-oracle.ts same`
Expected: `duel oracle: 20 runs, 205178 ticks, 315 named fields, results, events and telemetry identical at every tick field for field, sim version 38 → 38 (baseline HEAD <sha>)`, exit 0.

Run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: `per-tick canonical trace unchanged at sim version 38: golden 7200 ticks, determinism-v2 108000 ticks in 19 runs (baseline HEAD <sha>)`, exit 0.

- [ ] **Step 9: Commit**

```
git add scripts/profile-duel-publication.ts src/renderer/src/sim/duel/seeds.ts src/renderer/src/sim/duel/snapshot.ts src/renderer/src/authority/duelCheckpoint.ts tests/duelCache.test.ts
git commit -m "H-2a-i task 1: the duel validation cache, restoreDuelSnapshot, the duel seeds, the publication profile"
```

---

### Task 2: The duel wire for rounds

**Files:**
- Modify: `src/renderer/src/net/contracts.ts`, `src/renderer/src/net/codec.ts`, `src/renderer/src/sim/duel/summary.ts`, `src/renderer/src/sim/replay.ts`, `src/renderer/src/authority/replay.ts`
- Modify (tests): `tests/codecModeWire.test.ts`, `tests/duelSummary.test.ts`, `tests/commandUnion.test.ts`, `tests/duelCheckpoint.test.ts`

**Interfaces:**
- Produces:
  - `contracts.ts`: `DuelCommand` gains `{ kind: 'rematch' }`; `COMMAND_REASONS` ends `'duel-running', 'duel-decided'`; `AuthorityEvent['payload']` gains `{ kind: 'round'; record: DuelRoundRecord }`.
  - `codec.ts`: `ModeWire.events(p, shared): CommandOption[]` (the sector's is empty); the duel wire's `rematch` command and `round` event; the widened duel summary schema.
  - `summary.ts`: `MISSILE_LOSSES`; the widened `DuelEndSummary`; `DuelRoundRecord`; `duelRoundRecord(summary, round, seed, baseTick)`.

- [ ] **Step 1: Write the failing tests**

In `tests/codecModeWire.test.ts`, replace:

````ts
import { codecFor, duelCodec, duelWire, encodeMessage, sectorCodec, sectorWire } from '../src/renderer/src/net/codec';
import type { AuthorityMessage, EndRecord } from '../src/renderer/src/net/contracts';
import type { DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
````

with:

````ts
import { codecFor, duelCodec, duelWire, encodeMessage, sectorCodec, sectorWire } from '../src/renderer/src/net/codec';
import { COMMAND_REASONS, type AuthorityMessage, type EndRecord } from '../src/renderer/src/net/contracts';
import type { DuelEndSummary } from '../src/renderer/src/sim/duel/summary';
import type { DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
````

In `tests/codecModeWire.test.ts`, replace:

````ts
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const duelEnd: EndRecord = { mode: 'duel', record: { outcome: 2, ticks: 8832, terminal: [['missile'], []], laserReleases: [11, 28], laserHits: [2, 28],
  missilesLaunched: [2, 5], missileHits: [0, 5], repairsFinished: [7, 9] } };

````

with:

````ts
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const none = { planet: 0, asteroid: 0, edge: 0, expired: 0, own: 0, missile: 0 };
const summary: DuelEndSummary = { outcome: 2, ticks: 8832, terminal: [['missile'], []], laserReleases: [11, 28], laserHits: [2, 28],
  missilesLaunched: [2, 5], missileHits: [0, 5], repairsFinished: [7, 9], laserMisses: [9, 0], layersStripped: [1, 4],
  missileLosses: [{ ...none, asteroid: 2 }, none], planetContacts: [1, 3], asteroidContacts: [4, 2], baits: 1, consoleSwaps: 2,
  helmEmptyTicks: 30, weaponsEmptyTicks: 40, enemyInArcTicks: 500, weaponsIdleTicks: 60, repairsStarted: [7, 9], walkingTicks: [100, 200], repairingTicks: [50, 60] };
const duelEnd: EndRecord = { mode: 'duel', record: summary };
const round = (record: unknown): AuthorityMessage<never> => ({ kind: 'event', event: { runId: 'run-1', eventSequence: 2, tick: 9000, payload: { kind: 'round', record } as never } });

````

In `tests/codecModeWire.test.ts`, replace:

````ts
    expect(() => codec.decodeMessage(raw(ended({ mode: 'duel', record: null } as unknown as EndRecord)))).toThrow();
  });
});
````

with:

````ts
    expect(() => codec.decodeMessage(raw(ended({ mode: 'duel', record: null } as unknown as EndRecord)))).toThrow();
  });
});

describe('the duel round event and the round reasons (H-2 spec §4)', () => {
  const record = { ...summary, round: 3, seed: 1234, baseTick: 8000 };
  it('the duel codec round trips a round record; the sector codec rejects a round event', () => {
    const codec = duelCodec(2);
    expect(codec.decodeMessage(codec.encodeMessage(round(record)))).toEqual(round(record));
    expect(() => codec.decodeMessage(raw(round({ ...record, round: -1 })))).toThrow();
    expect(() => codec.decodeMessage(raw(round({ ...record, extra: 1 })))).toThrow();
    expect(() => codec.decodeMessage(raw(round(summary)))).toThrow();
    expect(() => sectorCodec().encodeMessage(round(record))).toThrow();
    expect(() => sectorCodec().decodeMessage(raw(round(record)))).toThrow();
  });
  it('rematch is a duel command only, and the closed reason enum carries duel-running and duel-decided for every codec', () => {
    const command = (c: unknown) => raw({ kind: 'command', envelope: { runId: 'run-1', id: { player: 0, sequence: 1 }, requestedTick: 0, command: c } });
    expect(duelCodec(2).decodeMessage(command({ kind: 'rematch' }))).toMatchObject({ kind: 'command', envelope: { command: { kind: 'rematch' } } });
    expect(() => sectorCodec().decodeMessage(command({ kind: 'rematch' }))).toThrow();
    expect(COMMAND_REASONS.slice(-2)).toEqual(['duel-running', 'duel-decided']);
    for (const codec of [sectorCodec(), duelCodec(2)]) for (const reason of ['duel-running', 'duel-decided'] as const) {
      const message: AuthorityMessage<never> = { kind: 'result', runId: 'run-1', result: { id: { player: 0, sequence: 1 }, tick: 5, status: 'rejected', reason } };
      expect(codec.decodeMessage(codec.encodeMessage(message))).toEqual(message);
    }
  });
});
````

In `tests/duelSummary.test.ts`, replace:

````ts
import { describe, expect, it } from 'vitest';
import { duelEndSummary } from '../src/renderer/src/sim/duel/summary';
import type { DuelTelemetry } from '../src/renderer/src/sim/duel/telemetry';
````

with:

````ts
import { describe, expect, it } from 'vitest';
import { duelEndSummary, duelRoundRecord } from '../src/renderer/src/sim/duel/summary';
import type { DuelTelemetry } from '../src/renderer/src/sim/duel/telemetry';
````

In `tests/duelSummary.test.ts`, replace:

````ts
      ships: [
        { laserReleases: 3, laserHits: 5, laserMisses: 99, layersStripped: 98, missilesLaunched: 7, missileHitsByRoom: [1, 2, 4], missileLosses: {}, planetContacts: 97, asteroidContacts: 96 },
        { laserReleases: 11, laserHits: 13, laserMisses: 95, layersStripped: 94, missilesLaunched: 17, missileHitsByRoom: [20, 30, 40], missileLosses: {}, planetContacts: 93, asteroidContacts: 92 }
      ],
      players: [{ repairsStarted: 91, repairsFinished: 23, walkingTicks: 90, repairingTicks: 89 }, { repairsStarted: 88, repairsFinished: 29, walkingTicks: 87, repairingTicks: 86 }],
      terminal: [['planet', 'missile'], ['laser']]
    } as unknown as DuelTelemetry;
    const s = duelEndSummary(t);
    expect(s).toEqual({ outcome: 2, ticks: 1234, terminal: [['planet', 'missile'], ['laser']], laserReleases: [3, 11], laserHits: [5, 13],
      missilesLaunched: [7, 17], missileHits: [7, 90], repairsFinished: [23, 29] });
    for (const v of [s, s.terminal, s.terminal[0], s.terminal[1], s.laserReleases, s.laserHits, s.missilesLaunched, s.missileHits, s.repairsFinished])
      expect(Object.isFrozen(v)).toBe(true);
  });
````

with:

````ts
      ships: [
        { laserReleases: 3, laserHits: 5, laserMisses: 99, layersStripped: 98, missilesLaunched: 7, missileHitsByRoom: [1, 2, 4], missileLosses: { planet: 1, asteroid: 2, edge: 3, expired: 4, own: 5, missile: 6 }, planetContacts: 97, asteroidContacts: 96 },
        { laserReleases: 11, laserHits: 13, laserMisses: 95, layersStripped: 94, missilesLaunched: 17, missileHitsByRoom: [20, 30, 40], missileLosses: { missile: 16, own: 15, expired: 14, edge: 13, asteroid: 12, planet: 11 }, planetContacts: 93, asteroidContacts: 92 }
      ],
      players: [{ repairsStarted: 91, repairsFinished: 23, walkingTicks: 90, repairingTicks: 89 }, { repairsStarted: 88, repairsFinished: 29, walkingTicks: 87, repairingTicks: 86 }],
      terminal: [['planet', 'missile'], ['laser']],
      baits: 85, consoleSwaps: 84, helmEmptyTicks: 83, weaponsEmptyTicks: 82, enemyInArcTicks: 81, weaponsIdleTicks: 80
    } as unknown as DuelTelemetry;
    const s = duelEndSummary(t);
    expect(s).toEqual({ outcome: 2, ticks: 1234, terminal: [['planet', 'missile'], ['laser']], laserReleases: [3, 11], laserHits: [5, 13],
      missilesLaunched: [7, 17], missileHits: [7, 90], repairsFinished: [23, 29],
      laserMisses: [99, 95], layersStripped: [98, 94], missileLosses: [{ planet: 1, asteroid: 2, edge: 3, expired: 4, own: 5, missile: 6 }, { planet: 11, asteroid: 12, edge: 13, expired: 14, own: 15, missile: 16 }],
      planetContacts: [97, 93], asteroidContacts: [96, 92], baits: 85, consoleSwaps: 84, helmEmptyTicks: 83, weaponsEmptyTicks: 82, enemyInArcTicks: 81, weaponsIdleTicks: 80,
      repairsStarted: [91, 88], walkingTicks: [90, 87], repairingTicks: [89, 86] });
    expect(Object.keys(s.missileLosses[1])).toEqual(['planet', 'asteroid', 'edge', 'expired', 'own', 'missile']);   // the accumulator's order, whatever the input's
    for (const v of [s, s.terminal, s.terminal[0], s.terminal[1], s.laserReleases, s.laserHits, s.missilesLaunched, s.missileHits, s.repairsFinished,
      s.missileLosses, s.missileLosses[0], s.missileLosses[1], s.repairsStarted, s.walkingTicks, s.repairingTicks])
      expect(Object.isFrozen(v)).toBe(true);
    expect(duelRoundRecord(s, 2, 77, 9000)).toEqual({ ...s, round: 2, seed: 77, baseTick: 9000 });
    expect(Object.isFrozen(duelRoundRecord(s, 2, 77, 9000))).toBe(true);
  });
````

In `tests/commandUnion.test.ts`, replace:

````ts
  it('the duel reasons are members of the closed reason enum the result codec validates', () => {
    expect(COMMAND_REASONS.slice(-3)).toEqual(['not-in-duel', 'not-at-weapons', 'missile-in-flight']);
    for (const reason of ['not-in-duel', 'not-at-weapons', 'missile-in-flight'] as const) {
````

with:

````ts
  it('the duel reasons are members of the closed reason enum the result codec validates', () => {
    expect(COMMAND_REASONS.slice(-5, -2)).toEqual(['not-in-duel', 'not-at-weapons', 'missile-in-flight']);   // then H-2's round reasons (codecModeWire.test.ts)
    for (const reason of ['not-in-duel', 'not-at-weapons', 'missile-in-flight'] as const) {
````

The continuation proof now checks the summary's original fields as a subset (the summary widens):

In `tests/duelCheckpoint.test.ts`, replace:

````ts
        expect(resumed.core.captureCheckpoint().modeMemory, 'the final telemetry accumulator of the restored run').toEqual(reference.core.captureCheckpoint().modeMemory);
        expect(end.endRecord).toEqual({ mode: 'duel', record: { outcome: Outcome.EnemyWins, ticks: referenceHashes.length,
          terminal: [['missile'], []], laserReleases: [11, 28], laserHits: [2, 28], missilesLaunched: [2, 5], missileHits: [0, 5], repairsFinished: [7, 9] } });
````

with:

````ts
        expect(resumed.core.captureCheckpoint().modeMemory, 'the final telemetry accumulator of the restored run').toEqual(reference.core.captureCheckpoint().modeMemory);
        expect(end.endRecord).toMatchObject({ mode: 'duel', record: { outcome: Outcome.EnemyWins, ticks: referenceHashes.length,
          terminal: [['missile'], []], laserReleases: [11, 28], laserHits: [2, 28], missilesLaunched: [2, 5], missileHits: [0, 5], repairsFinished: [7, 9] } });
````

Run: `npx vitest run tests/codecModeWire.test.ts tests/duelSummary.test.ts tests/commandUnion.test.ts`
Expected: FAIL, 5 tests: `duelRoundRecord` is not a function, and neither codec knows `rematch` or the `round` event.

- [ ] **Step 2: The widened summary and the round record**

In `src/renderer/src/sim/duel/summary.ts`, replace:

````ts
// The duel's end summary (engine refactor spec §6): a plain, frozen value computed once when the duel ends, from the
// telemetry accumulator. Per-ship pairs are [crew ship, enemy ship]; repairsFinished is per player. `terminal` keeps the
// accumulator's per-ship cause arrays as they are (one tick can kill a ship several ways), each in TERMINAL_CAUSES
// order without duplicates, and empty for a ship that survived.
import type { DuelTelemetry, TerminalCause } from './telemetry';

/** The accumulator's order of terminal causes (telemetry.ts recordTick). */
export const TERMINAL_CAUSES = ['planet', 'asteroid', 'ship', 'laser', 'missile'] as const satisfies readonly TerminalCause[];
type Pair = readonly [number, number];
````

with:

````ts
// The duel's end summary (engine refactor spec §6, widened by H-2 spec §8 to the Helm §13 list): a plain, frozen value
// computed once when a round is decided, from the telemetry accumulator. Per-ship pairs are [crew ship, enemy ship];
// per-player pairs are [player 0, player 1]. `terminal` keeps the accumulator's per-ship cause arrays as they are (one
// tick can kill a ship several ways), each in TERMINAL_CAUSES order without duplicates, and empty for a ship that
// survived. The round record (H-2 spec §7) is the summary plus the round, its seed and its first tick.
import type { DuelTelemetry, MissileLoss, TerminalCause } from './telemetry';

/** The accumulator's order of terminal causes (telemetry.ts recordTick). */
export const TERMINAL_CAUSES = ['planet', 'asteroid', 'ship', 'laser', 'missile'] as const satisfies readonly TerminalCause[];
/** The accumulator's missile loss causes, in its order. */
export const MISSILE_LOSSES = ['planet', 'asteroid', 'edge', 'expired', 'own', 'missile'] as const satisfies readonly MissileLoss[];
type Pair = readonly [number, number];
````

In `src/renderer/src/sim/duel/summary.ts`, replace:

````ts
  readonly repairsFinished: Pair;
}

const pair = (f: (i: 0 | 1) => number): readonly [number, number] => Object.freeze([f(0), f(1)] as [number, number]);
export function duelEndSummary(t: DuelTelemetry): DuelEndSummary {
  const ship = (i: 0 | 1) => t.ships[i];
  return Object.freeze({
````

with:

````ts
  readonly repairsFinished: Pair;
  readonly laserMisses: Pair; readonly layersStripped: Pair;
  readonly missileLosses: readonly [Readonly<Record<MissileLoss, number>>, Readonly<Record<MissileLoss, number>>];
  readonly planetContacts: Pair; readonly asteroidContacts: Pair;
  readonly baits: number; readonly consoleSwaps: number;
  readonly helmEmptyTicks: number; readonly weaponsEmptyTicks: number; readonly enemyInArcTicks: number; readonly weaponsIdleTicks: number;
  readonly repairsStarted: Pair; readonly walkingTicks: Pair; readonly repairingTicks: Pair;
}
/** One decided round (H-2 spec §7): its summary, its index from 0, its seed and the encounter tick it began on. */
export type DuelRoundRecord = DuelEndSummary & { readonly round: number; readonly seed: number; readonly baseTick: number };

const pair = (f: (i: 0 | 1) => number): readonly [number, number] => Object.freeze([f(0), f(1)] as [number, number]);
const losses = (l: Record<MissileLoss, number>): Readonly<Record<MissileLoss, number>> =>
  Object.freeze(Object.fromEntries(MISSILE_LOSSES.map((k) => [k, l[k]])) as Record<MissileLoss, number>);
export function duelEndSummary(t: DuelTelemetry): DuelEndSummary {
  const ship = (i: 0 | 1) => t.ships[i], player = (i: 0 | 1) => t.players[i];
  return Object.freeze({
````

In `src/renderer/src/sim/duel/summary.ts`, replace:

````ts
    missileHits: pair((i) => ship(i).missileHitsByRoom[0] + ship(i).missileHitsByRoom[1] + ship(i).missileHitsByRoom[2]),
    repairsFinished: pair((i) => t.players[i].repairsFinished)
  });
}
````

with:

````ts
    missileHits: pair((i) => ship(i).missileHitsByRoom[0] + ship(i).missileHitsByRoom[1] + ship(i).missileHitsByRoom[2]),
    repairsFinished: pair((i) => player(i).repairsFinished),
    laserMisses: pair((i) => ship(i).laserMisses), layersStripped: pair((i) => ship(i).layersStripped),
    missileLosses: Object.freeze([losses(ship(0).missileLosses), losses(ship(1).missileLosses)] as const),
    planetContacts: pair((i) => ship(i).planetContacts), asteroidContacts: pair((i) => ship(i).asteroidContacts),
    baits: t.baits, consoleSwaps: t.consoleSwaps,
    helmEmptyTicks: t.helmEmptyTicks, weaponsEmptyTicks: t.weaponsEmptyTicks, enemyInArcTicks: t.enemyInArcTicks, weaponsIdleTicks: t.weaponsIdleTicks,
    repairsStarted: pair((i) => player(i).repairsStarted), walkingTicks: pair((i) => player(i).walkingTicks), repairingTicks: pair((i) => player(i).repairingTicks)
  });
}
/** The round record: the summary, then the round, its seed and its base tick, frozen. */
export function duelRoundRecord(summary: DuelEndSummary, round: number, seed: number, baseTick: number): DuelRoundRecord {
  return Object.freeze({ ...summary, round, seed, baseTick });
}
````

- [ ] **Step 3: The contracts**

In `src/renderer/src/net/contracts.ts`, replace:

````ts
import type { TelemetryRecord } from '../sim/telemetry';
import type { DuelEndSummary } from '../sim/duel/summary';

````

with:

````ts
import type { TelemetryRecord } from '../sim/telemetry';
import type { DuelEndSummary, DuelRoundRecord } from '../sim/duel/summary';

````

In `src/renderer/src/net/contracts.ts`, replace:

````ts
  | { kind: 'missileLaunch' }
  | { kind: 'setPaused'; paused: boolean };
````

with:

````ts
  | { kind: 'missileLaunch' }
  /** On a decided round's end card: start the next round (H-2 spec §7). */
  | { kind: 'rematch' }
  | { kind: 'setPaused'; paused: boolean };
````

In `src/renderer/src/net/contracts.ts`, replace:

````ts
export interface CommandEnvelope<C extends Command = Command> { runId: RunId; id: CommandId; requestedTick: number; command: C }
/** The shared base reasons, then the duel's (spec §6: the enum is closed, so every module's reasons join it). */
export const COMMAND_REASONS = [
  'wrong-run', 'unowned', 'malformed', 'expected-sequence', 'stale-tick', 'over-capacity',
  'invalid-seat', 'stale-target', 'unavailable', 'unsupported', 'conflicting-duplicate',
  'not-in-duel', 'not-at-weapons', 'missile-in-flight'
] as const;
````

with:

````ts
export interface CommandEnvelope<C extends Command = Command> { runId: RunId; id: CommandId; requestedTick: number; command: C }
/** The shared base reasons, then the duel's (spec §6: the enum is closed, so every module's reasons join it). H-2 adds
 *  the round module's two: a rematch while the round runs, and a round command on a decided round's end card. */
export const COMMAND_REASONS = [
  'wrong-run', 'unowned', 'malformed', 'expected-sequence', 'stale-tick', 'over-capacity',
  'invalid-seat', 'stale-target', 'unavailable', 'unsupported', 'conflicting-duplicate',
  'not-in-duel', 'not-at-weapons', 'missile-in-flight', 'duel-running', 'duel-decided'
] as const;
````

In `src/renderer/src/net/contracts.ts`, replace:

````ts
    | { kind: 'pause'; paused: boolean; owner: PlayerId | null; reason: string }
    | { kind: 'ended'; record: EndRecord };
}
````

with:

````ts
    | { kind: 'pause'; paused: boolean; owner: PlayerId | null; reason: string }
    | { kind: 'ended'; record: EndRecord }
    /** A duel round was decided (H-2 spec §7); only the duel codec admits it. */
    | { kind: 'round'; record: DuelRoundRecord };
}
````

- [ ] **Step 4: The codec: `ModeWire.events`, `rematch`, the `round` event and the summary schema**

In `src/renderer/src/net/codec.ts`, replace:

````ts
import type { DuelSnapshot } from '../sim/duel/snapshot';
import { TERMINAL_CAUSES } from '../sim/duel/summary';

````

with:

````ts
import type { DuelSnapshot } from '../sim/duel/snapshot';
import { MISSILE_LOSSES, TERMINAL_CAUSES } from '../sim/duel/summary';

````

In `src/renderer/src/net/codec.ts`, replace:

````ts
  endRecord(p: Primitives, shared: SharedSchemas): z.ZodTypeAny;
}
````

with:

````ts
  endRecord(p: Primitives, shared: SharedSchemas): z.ZodTypeAny;
  /** The mode's own authority event payloads, appended to the shared payload union (H-2 spec §4: the duel's `round`). */
  events(p: Primitives, shared: SharedSchemas): CommandOption[];
}
````

In `src/renderer/src/net/codec.ts`, replace:

````ts
  },
  endRecord: (_p, { telemetry }) => z.object({ mode: z.literal('sector'), record: telemetry }).strict()
};
/** The duel's wire (engine refactor spec §6): its own command kinds plus the core's setPaused, and the duel snapshot
 *  header (sim/duel/snapshot.ts). */
export const duelWire: ModeWire<DuelSnapshot> = {
````

with:

````ts
  },
  endRecord: (_p, { telemetry }) => z.object({ mode: z.literal('sector'), record: telemetry }).strict(),
  events: () => []
};
/** The duel's summary and round record (sim/duel/summary.ts), the fields of each in order. */
function duelSummaryShape({ uint }: Primitives) {
  const pair = z.tuple([uint, uint]);
  const causes = z.array(z.enum(TERMINAL_CAUSES)).max(TERMINAL_CAUSES.length)
    .refine((list) => list.every((c, k) => k === 0 || TERMINAL_CAUSES.indexOf(list[k - 1]!) < TERMINAL_CAUSES.indexOf(c)), 'terminal causes out of order or repeated');
  const losses = z.object(Object.fromEntries(MISSILE_LOSSES.map((k) => [k, uint])) as Record<(typeof MISSILE_LOSSES)[number], typeof uint>).strict();
  return { outcome: z.number().int().min(0).max(3), ticks: uint, terminal: z.tuple([causes, causes]),
    laserReleases: pair, laserHits: pair, missilesLaunched: pair, missileHits: pair, repairsFinished: pair,
    laserMisses: pair, layersStripped: pair, missileLosses: z.tuple([losses, losses]), planetContacts: pair, asteroidContacts: pair,
    baits: uint, consoleSwaps: uint, helmEmptyTicks: uint, weaponsEmptyTicks: uint, enemyInArcTicks: uint, weaponsIdleTicks: uint,
    repairsStarted: pair, walkingTicks: pair, repairingTicks: pair };
}
/** The duel's wire (engine refactor spec §6): its own command kinds plus the core's setPaused, and the duel snapshot
 *  header (sim/duel/snapshot.ts). H-2 adds `rematch` and the `round` event. */
export const duelWire: ModeWire<DuelSnapshot> = {
````

In `src/renderer/src/net/codec.ts`, replace:

````ts
      z.object({ kind: z.literal('missileLaunch') }).strict(),
      z.object({ kind: z.literal('setPaused'), paused: z.boolean() }).strict()
````

with:

````ts
      z.object({ kind: z.literal('missileLaunch') }).strict(),
      z.object({ kind: z.literal('rematch') }).strict(),
      z.object({ kind: z.literal('setPaused'), paused: z.boolean() }).strict()
````

In `src/renderer/src/net/codec.ts`, replace:

````ts
  },
  /** The frozen end summary (sim/duel/summary.ts). Never null: the duel rules compute it on the step that ends the duel
   *  and on the restore of an ended duel, before any `ended` event is published. */
  endRecord({ uint }) {
    const pair = z.tuple([uint, uint]);
    const causes = z.array(z.enum(TERMINAL_CAUSES)).max(TERMINAL_CAUSES.length)
      .refine((list) => list.every((c, k) => k === 0 || TERMINAL_CAUSES.indexOf(list[k - 1]!) < TERMINAL_CAUSES.indexOf(c)), 'terminal causes out of order or repeated');
    const duelSummary = z.object({ outcome: z.number().int().min(0).max(3), ticks: uint, terminal: z.tuple([causes, causes]),
      laserReleases: pair, laserHits: pair, missilesLaunched: pair, missileHits: pair, repairsFinished: pair }).strict();
    return z.object({ mode: z.literal('duel'), record: duelSummary }).strict();
  }
````

with:

````ts
  },
  /** The frozen end summary (sim/duel/summary.ts). Never null: an ended duel always carries its summary. */
  endRecord(p) {
    return z.object({ mode: z.literal('duel'), record: z.object(duelSummaryShape(p)).strict() }).strict();
  },
  /** A decided round's record: the summary plus its round, seed and base tick (H-2 spec §7). */
  events(p) {
    return [z.object({ kind: z.literal('round'), record: z.object({ ...duelSummaryShape(p), round: p.uint, seed: p.u32, baseTick: p.uint }).strict() }).strict()];
  }
````

In `src/renderer/src/net/codec.ts`, replace:

````ts
  z.object({ kind: z.literal('pause'), paused: z.boolean(), owner: player.nullable(), reason: text }).strict(),
  z.object({ kind: z.literal('ended'), record: wire.endRecord(prims, { telemetry }) }).strict()
]);
````

with:

````ts
  z.object({ kind: z.literal('pause'), paused: z.boolean(), owner: player.nullable(), reason: text }).strict(),
  z.object({ kind: z.literal('ended'), record: wire.endRecord(prims, { telemetry }) }).strict(),
  ...wire.events(prims, { telemetry })
]);
````

- [ ] **Step 5: The replay frame's event kind**

In `src/renderer/src/sim/replay.ts`, replace:

````ts
  tick: number; eventSequenceBefore: number; action: ReplayAction;
  results: CommandResult[]; events: { eventSequence: number; tick: number; kind: 'cue' | 'pause' | 'ended' }[]; after?: ReplayOutcome;
}
````

with:

````ts
  tick: number; eventSequenceBefore: number; action: ReplayAction;
  results: CommandResult[]; events: { eventSequence: number; tick: number; kind: 'cue' | 'pause' | 'ended' | 'round' }[]; after?: ReplayOutcome;
}
````

In `src/renderer/src/authority/replay.ts`, replace:

````ts
]);
const frameSchema = z.object({ tick: uint, eventSequenceBefore: uint, action, results: z.array(z.unknown()).max(1024), events: z.array(z.object({ eventSequence: uint.min(1), tick: uint, kind: z.enum(['cue', 'pause', 'ended']) }).strict()).max(256),
  after: z.object({ tick: uint, hash: z.string().regex(/^[0-9a-f]{8}$/), phase: z.enum(['running', 'paused', 'ended', 'error']), eventSequence: uint, publicationSequence: uint, controlRevision: uint }).strict().optional()
````

with:

````ts
]);
const frameSchema = z.object({ tick: uint, eventSequenceBefore: uint, action, results: z.array(z.unknown()).max(1024), events: z.array(z.object({ eventSequence: uint.min(1), tick: uint, kind: z.enum(['cue', 'pause', 'ended', 'round']) }).strict()).max(256),
  after: z.object({ tick: uint, hash: z.string().regex(/^[0-9a-f]{8}$/), phase: z.enum(['running', 'paused', 'ended', 'error']), eventSequence: uint, publicationSequence: uint, controlRevision: uint }).strict().optional()
````

- [ ] **Step 6: Run the tests and the typecheck; prove the task golden-neutral**

Run: `npx vitest run tests/codecModeWire.test.ts tests/duelSummary.test.ts tests/commandUnion.test.ts tests/duelCheckpoint.test.ts tests/netCodec.test.ts`
Expected: PASS, 89 tests in 5 files (5, 1, 5, 6 and 72).

Run: `npm run typecheck`
Expected: exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts same`
Expected: as Task 1 Step 8, exit 0.

Run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: as Task 1 Step 8, exit 0.

- [ ] **Step 7: Commit**

```
git add src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/sim/duel/summary.ts src/renderer/src/sim/replay.ts src/renderer/src/authority/replay.ts tests/codecModeWire.test.ts tests/duelSummary.test.ts tests/commandUnion.test.ts tests/duelCheckpoint.test.ts
git commit -m "H-2a-i task 2: the duel wire for rounds: rematch, the round event, the round reasons, the widened summary"
```

---

### Task 3: Rounds in the duel (SIM_VERSION 39)

**Files:**
- Create: `tests/duelRounds.test.ts`, `tests/helpers/liveDuel.ts`
- Modify: `src/renderer/src/sim/duel/state.ts`, `modules.ts`, `step.ts`, `telemetry.ts`, `snapshot.ts`, `src/renderer/src/authority/rules.ts`, `core.ts`, `duelRules.ts`, `duelCheckpoint.ts`, `src/renderer/src/sim/tuning.ts`, `src/network/modes/duel.ts`, `scripts/golden/duelOracle.ts`
- Modify (tests): `tests/helpers/duelAuthority.ts`, `tests/duel.test.ts`, `tests/duelCheckpoint.test.ts`, `tests/duelMode.test.ts`, `tests/duelModules.test.ts`, `tests/duelSnapshot.test.ts`
- Regenerated by `npm run bless`: `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/fixtures/determinism-v2.json`

**Interfaces:**
- Consumes: Task 1's `followingSeed`, `roundSeed`, `duelSeedFacts`; Task 2's contracts.
- Produces:
  - `state.ts`: `DuelState` gains `round`, `helmPlayer: 0 | 1`, `baseTick`, `decidedTick`; `createDuel(layout, seed, helmPlayer = 0)`.
  - `modules.ts`: `roundModule` (id `round`, commands `['rematch']`).
  - `step.ts`: `stepDuelTick` steps a decided round (the end card) and applies `rematch`.
  - `snapshot.ts`: `DuelRoundValues`, `duelRoundOf(snapshot)`.
  - `rules.ts`: `EncounterRules.records?(prev, state): AuthorityEvent['payload'][]`.
  - `duelRules.ts`: `DuelTypes['cueBaseline']` is `{ outcome; round }`; `records`.
  - `duelCheckpoint.ts`: `DuelInit.helmPlayer: 0 | 1`.
  - `tests/helpers/liveDuel.ts`: `liveDuel(init, prepare?, restored?)`, `hunterDown(session)`.

- [ ] **Step 1: Write the failing tests and the live duel harness**

Create `tests/helpers/liveDuel.ts`:

````ts
// A live duel authority for the round tests (H-2 spec §7, §10): the generic core over the duel rules with a clock the
// test advances one tick at a time, one receive-time link that owns both players, and every message it sends and every
// checkpoint it captures recorded. `prepare` may change the fresh duel before the core sees it (a forced round end).
import { createEncounterCore } from '../../src/renderer/src/authority/core';
import { duelRules, type DuelSession, type DuelTypes } from '../../src/renderer/src/authority/duelRules';
import type { DuelCheckpoint, DuelInit } from '../../src/renderer/src/authority/duelCheckpoint';
import type { CheckpointOf } from '../../src/renderer/src/authority/rules';
import type { CaptureCause } from '../../src/shared/sessionCheckpoint';
import { duelCodec } from '../../src/renderer/src/net/codec';
import type { AuthorityMessage, CommandId, CommandResult, DuelCommand, HeldInput, Link } from '../../src/renderer/src/net/contracts';
import type { DuelSnapshot } from '../../src/renderer/src/sim/duel/snapshot';
import { resolveCutter } from './duelAuthority';
import { ownTestCleanup } from './simLifetime';

const codec = duelCodec(2);
export interface LiveDuel {
  core: ReturnType<typeof createEncounterCore<DuelTypes>>; state: DuelSession; init: DuelInit;
  sent: AuthorityMessage<DuelSnapshot>[]; captures: { checkpoint: DuelCheckpoint; cause: CaptureCause }[];
  /** Send a command for `player`, stamped with the current tick; returns its id. */
  command(player: 0 | 1, command: DuelCommand): CommandId;
  held(player: 0 | 1, held: HeldInput): void;
  /** Advance the clock by `n` ticks, pumping after each. */
  tick(n?: number): void;
  results(): CommandResult[];
  tickNow(): number;
}

export function liveDuel(init: DuelInit, prepare?: (s: DuelSession) => void, restored?: DuelCheckpoint): LiveDuel {
  let now = 0, ordinal = 0;
  const sent: AuthorityMessage<DuelSnapshot>[] = [], captures: LiveDuel['captures'] = [], listeners = new Set<(kind: 'reliable-ordered' | 'unreliable-latest', bytes: Uint8Array) => void>();
  const state = restored ? duelRules.restore(restored.snapshot, resolveCutter, restored.modeMemory) : duelRules.create(init, resolveCutter);
  prepare?.(state);
  const core = createEncounterCore(duelRules, { init, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: resolveCutter,
    clock: { nowMs: () => now }, scheduler: { schedule: () => () => {} }, onCrash(record) { throw Error(record.error); },
    onCheckpoint: (checkpoint, cause) => { captures.push({ checkpoint: checkpoint as DuelCheckpoint, cause }); } }, state, restored as CheckpointOf<DuelTypes> | undefined);
  ownTestCleanup(() => core.dispose());
  const link: Link = { peer: 'live-duel', caps: { unreliable: true, maxDatagram: 65_536, hidesPeerIp: true, p2p: false },
    send(_kind, bytes) { sent.push(codec.decodeMessage(bytes) as AuthorityMessage<DuelSnapshot>); },
    onMessage(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; }, onClose: () => () => {},
    stats: () => ({ rttMs: 0, lossPct: 0, relayed: false, bufferedBytes: 0 }), close() {} };
  core.attach(link, [0, 1], { admissionPolicy: 'receive-time' });
  const sequences = [restored?.commandHighWater[0] ?? 0, restored?.commandHighWater[1] ?? 0], heldSequences = [restored?.heldHighWater[0] ?? 0, restored?.heldHighWater[1] ?? 0];
  const deliver = (bytes: Uint8Array) => { for (const cb of [...listeners]) cb('reliable-ordered', bytes); };
  return {
    core, state, init, sent, captures,
    command(player, command) {
      const id = { player, sequence: ++sequences[player]! };
      deliver(codec.encodeMessage({ kind: 'command', envelope: { runId: init.runId, id, requestedTick: duelRules.tick(state), command } }));
      return id;
    },
    held(player, held) { deliver(codec.encodeMessage({ kind: 'held', frame: { runId: init.runId, player, tick: duelRules.tick(state), sequence: ++heldSequences[player]!, held } })); },
    tick(n = 1) { for (let k = 0; k < n; k++) { now = ++ordinal * 1000 / 60 + 0.01; core.pump(); } },
    results: () => sent.flatMap((m) => (m.kind === 'result' ? [m.result] : [])),
    tickNow: () => duelRules.tick(state)
  };
}

/** A forced round end (tests only): the hunter's hull at 0, so the first tick decides the round for the crew. */
export function hunterDown(s: DuelSession): void { s.duel.tactical.systems[1].hull = 0; }
````

Create `tests/duelRounds.test.ts`:

````ts
// Rounds inside one duel run (H-2 spec §7, §10): the round module, the decided round's end card, the rematch, the
// round-start equivalence and restore equality, the round record, the frozen accumulator, the redefined checkpoint
// validator and the Helm player.
import { describe, expect, it } from 'vitest';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import type { DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { Seated } from '../src/renderer/src/sim/components';
import { LOCAL_DUEL_RUN, type DuelCommand, type DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { flattenDuel, hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_MODULES } from '../src/renderer/src/sim/duel/modules';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { followingSeed, roundSeed } from '../src/renderer/src/sim/duel/seeds';
import { duelRoundOf, loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import type { SimModule } from '../src/renderer/src/sim/module';
import { canonicalFields } from '../src/renderer/src/sim/canonicalFields';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { CUTTER } from './helpers/scriptedDuel';
import { duelInit, resolveCutter, throughBytes } from './helpers/duelAuthority';
import { hunterDown, liveDuel } from './helpers/liveDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
let sequence = 0;
const env = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope => ({ runId: LOCAL_DUEL_RUN, id: { player, sequence: ++sequence }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, { held: [], commands });
/** A duel whose first tick decides the round for the crew. */
function decided(seed = 3): DuelState { const d = createDuel(CUTTER, seed); d.tactical.systems[1].hull = 0; step(d); return d; }
/** Named canonical values: `<module>.<field>`, the interior expanded into its sector field names. */
function named(d: DuelState): Map<string, number[]> {
  const out = new Map<string, number[]>(), values = Array.from(flattenDuel(d));
  let at = 1;
  for (const { module, state } of DUEL_MODULES) {
    const m = module as SimModule<unknown>;
    const fields = m.id === 'interior' ? canonicalFields(d.interior.layout, d.interior.playerCount).map((f) => ({ name: f.name, count: f.count })) : m.fields(state(d));
    for (const f of fields) { out.set(`${m.id}.${f.name}`, values.slice(at, at + f.count)); at += f.count; }
  }
  return out;
}

describe('the Helm player (spec §2)', () => {
  it('createDuel seats helmPlayer at Navigation and the other at Weapons; the seating and the round module survive a save and load', () => {
    for (const helm of [0, 1] as const) {
      const d = createDuel(CUTTER, 5, helm);
      try {
        expect(Seated.station[d.interior.crew[helm]!]).toBe(d.nav);
        expect(Seated.station[d.interior.crew[1 - helm]!]).toBe(d.weapons);
        expect([d.round, d.helmPlayer, d.baseTick, d.decidedTick]).toEqual([0, helm, 0, -1]);
        const r = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
        try { expect(Seated.station[r.interior.crew[helm]!]).toBe(r.nav); expect(r.helmPlayer).toBe(helm); expect(hashDuel(r)).toBe(hashDuel(d)); } finally { disposeDuel(r); }
      } finally { disposeDuel(d); }
    }
    expect(() => createDuel(CUTTER, 5, 2 as 0)).toThrow(/helm player/);
  });
});

describe('a decided round and the rematch (spec §7)', () => {
  it('a rematch while the round runs is rejected duel-running and changes nothing', () => {
    const d = createDuel(CUTTER, 3);
    try {
      const r = step(d, [env(d, 0, { kind: 'rematch' })]);
      expect(r).toEqual([expect.objectContaining({ status: 'rejected', reason: 'duel-running' })]);
      expect([d.round, d.tactical.outcome, d.interior.tick]).toEqual([0, Outcome.Running, 1]);
    } finally { disposeDuel(d); }
  });
  it('the deciding step records decidedTick; the end card advances both ticks with no physics and answers every command', () => {
    const d = decided();
    try {
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      expect(d.decidedTick).toBe(1);
      const ships = structuredClone(d.tactical.ships), interior = Array.from(flattenDuel(d)).slice(-200);
      const kinds: DuelCommand[] = [{ kind: 'laserCharge', held: true }, { kind: 'missileLaunch' }, { kind: 'stand' }, { kind: 'sit', station: d.nav }, { kind: 'laserLock', room: 1 }];
      const first = stepDuelTick(d, { held: [{ moveX: 1, moveY: -1, interactHeld: true }, { moveX: -1, moveY: 1, interactHeld: false }], commands: kinds.map((c) => env(d, 0, c)) });
      expect(first.map((r) => r.reason)).toEqual(Array(5).fill('duel-decided'));
      expect(d.tactical.ships).toEqual(ships);   // no physics: the held stick moves nothing
      expect([d.interior.tick, d.tactical.tick]).toEqual([2, 2]);
      expect(Array.from(flattenDuel(d)).slice(-200).filter((v, k) => v !== interior[k]).length).toBeLessThanOrEqual(1);   // only the interior tick
      d.present[1] = false;
      const results = step(d, [env(d, 0, { kind: 'rematch' }), env(d, 0, { kind: 'presence', present: false }), env(d, 1, { kind: 'rematch' }), env(d, 0, { kind: 'rematch' }, 0)]);
      expect(results.map((r) => r.reason ?? r.status)).toEqual(['applied', 'applied', 'stale-tick', 'unavailable']);
      expect(results.every((r) => r.tick === 2)).toBe(true);
      expect([d.round, d.present]).toEqual([1, [false, false]]);
    } finally { disposeDuel(d); }
  });
  it('a rematch builds the next round on the next tick: the following valid seed, base tick, carried presence, same Helm player, a fresh interior', () => {
    const d = createDuel(CUTTER, 3, 1);
    d.tactical.systems[1].hull = 0; step(d);
    try {
      for (let k = 0; k < 10; k++) step(d);
      expect(d.interior.tick).toBe(11);
      d.present[0] = false;
      const interior = d.interior, seed = d.tactical.seed;
      const results = step(d, [env(d, 1, { kind: 'rematch' }), env(d, 1, { kind: 'rematch' })]);
      expect(results.map((r) => r.status)).toEqual(['applied', 'noop']);
      expect(d.interior).not.toBe(interior);
      expect([d.round, d.helmPlayer, d.baseTick, d.decidedTick, d.tactical.seed]).toEqual([1, 1, 12, -1, followingSeed(seed)]);
      expect([d.interior.tick, d.tactical.tick, d.tactical.outcome]).toEqual([12, 12, Outcome.Running]);
      expect(d.present).toEqual([false, true]);
      expect(Seated.station[d.interior.crew[1]!]).toBe(d.nav);
      expect(d.tactical.ships.every((s) => s.graceUntil.every((g) => g === 12))).toBe(true);
      expect(roundSeed(3, 1)).toBe(d.tactical.seed);
    } finally { disposeDuel(d); }
  });
  it('a round started at T agrees with a fresh duel of its seed in every canonical field for 600 ticks, apart from the tick stamps', () => {
    const d = decided(4);
    try {
      for (let k = 0; k < 250; k++) step(d);
      step(d, [env(d, 0, { kind: 'rematch' })]);
      const T = d.baseTick, fresh = createDuel(CUTTER, d.tactical.seed), pa = createScriptedPair(d.tactical.seed), pb = createScriptedPair(d.tactical.seed);
      // Tick stamps: these hold an encounter tick, so a round started at T holds the fresh duel's value plus T.
      const stamps = /^(space\.tick|space\.ships\.\d+\.graceUntil|space\.hunter\.lastLaunch|interior\.tick)$/, fireAt = 'space.hunter.fireAt';
      try {
        for (let k = 0; k <= 600; k++) {
          const a = named(d), b = named(fresh);
          for (const [name, values] of a) {
            if (name.startsWith('round.')) continue;
            const want = b.get(name)!, shift = stamps.test(name) ? T : name === fireAt && want[0]! >= 0 ? T : 0;
            expect(values, `${name} at round tick ${k}`).toEqual(want.map((v) => v + shift));
          }
          if (d.tactical.outcome !== Outcome.Running) break;
          stepDuelTick(d, scriptedInput(pa, d)); stepDuelTick(fresh, scriptedInput(pb, fresh));
        }
        expect([d.round, d.baseTick]).toEqual([1, T]);
      } finally { disposeDuel(fresh); }
    } finally { disposeDuel(d); }
  }, 60_000);
  it('after a rematch, the stepped duel hashes as its saved-and-loaded copy at every tick for 600 ticks', () => {
    const d = decided(6);
    try {
      step(d, [env(d, 0, { kind: 'rematch' })]);
      const pair = createScriptedPair(d.tactical.seed);
      for (let k = 0; k < 600 && d.tactical.outcome === Outcome.Running; k++) {
        stepDuelTick(d, scriptedInput(pair, d));
        const r = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST);
        try { expect(hashDuel(r), `tick ${d.interior.tick}`).toBe(hashDuel(d)); } finally { disposeDuel(r); }
      }
    } finally { disposeDuel(d); }
  }, 60_000);
});

describe('rounds through the authority (spec §7, §10)', () => {
  it('end card: 20 mixed commands from both players all get results, none pending; ticks and publications go on; then a rematch starts round 1 and a capture restores', async () => {
    const live = liveDuel(duelInit(3, 'rounds'), hunterDown);
    live.tick(2);
    expect(live.state.duel.tactical.outcome).toBe(Outcome.CrewWins);
    const decidedAt = live.tickNow(), published = live.sent.filter((m) => m.kind === 'state').length;
    const ids = [];
    for (const player of [0, 1] as const) for (const c of [{ kind: 'laserCharge', held: true }, { kind: 'laserCharge', held: false }, { kind: 'missileLaunch' }, { kind: 'stand' },
      { kind: 'laserLock', room: 0 }, { kind: 'laserLock', room: 2 }, { kind: 'sit', station: 0 }, { kind: 'presence', present: true }] as DuelCommand[]) ids.push(live.command(player, c));
    live.tick();
    // A pause seals pending work (Net-3), so the controls go after the tick that answered the duel commands.
    ids.push(live.command(0, { kind: 'setPaused', paused: true }));
    live.tick();
    ids.push(live.command(1, { kind: 'setPaused', paused: false }));
    live.tick();
    ids.push(live.command(0, { kind: 'rematch' }), live.command(1, { kind: 'rematch' }));
    expect(ids.length).toBeGreaterThanOrEqual(20);
    expect(live.tickNow()).toBeGreaterThan(decidedAt);
    live.tick();
    const results = live.results();
    for (const id of ids) expect(results.filter((r) => r.id.player === id.player && r.id.sequence === id.sequence), `${id.player}#${id.sequence}`).toHaveLength(1);
    const reasons = (player: number) => results.filter((r) => r.id.player === player).sort((a, b) => a.id.sequence - b.id.sequence).map((r) => r.reason ?? r.status);
    const card = ['duel-decided', 'duel-decided', 'duel-decided', 'duel-decided', 'duel-decided', 'duel-decided', 'duel-decided', 'applied'];
    expect(reasons(0)).toEqual([...card, 'applied', 'applied']);   // the pause, then the first rematch
    expect(reasons(1)).toEqual([...card, 'applied', 'noop']);      // the resume, then the second rematch in the same tick
    expect(live.sent.filter((m) => m.kind === 'state').length).toBeGreaterThan(published + 2);
    expect(live.state.duel.round).toBe(1);
    expect(live.state.duel.tactical.outcome).toBe(Outcome.Running);
    const cp = throughBytes(live.core.captureCheckpoint());
    expect(cp.phase).toBe('running');
    const again = liveDuel(cp.init, undefined, cp);
    expect(duelRules.hash(again.state)).toBe(duelRules.hash(live.state));
  });
  it('emits one round record on the deciding tick and captures safe points at the decision (its snapshot tick is decidedTick) and at the rematch', () => {
    const live = liveDuel(duelInit(3, 'records'), hunterDown);
    live.tick(30);
    const rounds = live.sent.flatMap((m) => (m.kind === 'event' && m.event.payload.kind === 'round' ? [m.event] : []));
    expect(rounds).toHaveLength(1);
    const d = live.state.duel;
    expect(rounds[0]!.tick).toBe(d.decidedTick);
    expect(rounds[0]!.payload).toEqual({ kind: 'round', record: { ...live.state.summary, round: 0, seed: 3, baseTick: 0 } });
    expect(live.sent.some((m) => m.kind === 'event' && m.event.payload.kind === 'ended')).toBe(false);
    const decision = live.captures.filter((c) => c.cause === 'safe-point');
    expect(decision.map((c) => c.checkpoint.snapshot.header.tick)).toEqual([d.decidedTick]);
    expect(duelRoundOf(decision[0]!.checkpoint.snapshot)).toMatchObject({ decidedTick: d.decidedTick, baseTick: 0, outcome: Outcome.CrewWins });
    expect(decision[0]!.checkpoint.modeMemory.telemetry.ticks).toBe(d.decidedTick);
    live.command(0, { kind: 'rematch' }); live.tick(2);
    expect(live.captures.filter((c) => c.cause === 'safe-point').map((c) => duelRoundOf(c.checkpoint.snapshot).round)).toEqual([0, 1]);
  });
  it('the accumulator freezes on the decision: a capture 60 ticks into the end card restores to exactly the round record', () => {
    const live = liveDuel(duelInit(4, 'frozen'), hunterDown);
    live.tick(70);
    const record = live.sent.flatMap((m) => (m.kind === 'event' && m.event.payload.kind === 'round' ? [m.event.payload.record] : []))[0]!;
    expect(live.tickNow() - live.state.duel.decidedTick).toBeGreaterThanOrEqual(60);
    const cp = throughBytes(live.core.captureCheckpoint());
    expect(cp.phase).toBe('running');
    expect(cp.modeMemory.telemetry.ticks).toBe(live.state.duel.decidedTick);
    const restored = duelRules.restore(cp.snapshot, resolveCutter, cp.modeMemory);
    try {
      const { round: _r, seed: _s, baseTick: _b, ...summary } = record;
      expect(restored.summary).toEqual(summary);
    } finally { duelRules.dispose(restored); }
  });
  it('validates checkpoints of later rounds, paused on the end card, and a re-host restore in round 2; refuses a wrong seed, Helm player or ended phase', () => {
    const live = liveDuel(duelInit(5, 'rehost', 1), hunterDown);
    live.tick(2);
    live.command(1, { kind: 'rematch' }); live.tick(2);
    live.state.duel.tactical.systems[1].hull = 0; live.tick(2);
    live.command(0, { kind: 'rematch' }); live.tick(2);
    expect(live.state.duel.round).toBe(2);
    live.command(0, { kind: 'setPaused', paused: true }); live.tick();
    const cp = throughBytes(live.core.captureCheckpoint());
    expect([cp.phase, cp.snapshot.header.seed, cp.init.seed]).toEqual(['paused', roundSeed(5, 2), 5]);
    const rehost = liveDuel(cp.init, undefined, cp);
    expect(duelRules.hash(rehost.state)).toBe(duelRules.hash(live.state));
    expect(Seated.station[rehost.state.duel.interior.crew[1]!]).toBe(rehost.state.duel.nav);
    const bad = (f: (c: DuelCheckpoint) => void) => { const c = structuredClone(cp); f(c); return () => throughBytes(c); };
    expect(bad((c) => { c.init.seed = 6; })).toThrow(/seed/);
    expect(bad((c) => { c.init.helmPlayer = 0; })).toThrow(/helm player/);
    expect(bad((c) => { c.phase = 'ended'; c.paused = false; })).toThrow(/terminal phase/);
    expect(bad((c) => { c.modeMemory.telemetry.ticks += 1; })).toThrow(/telemetry/);
    // A decided round's checkpoint, running on the end card, validates.
    live.state.duel.tactical.systems[1].hull = 0;
    live.command(0, { kind: 'setPaused', paused: false }); live.tick(3);
    expect(live.state.duel.tactical.outcome).not.toBe(Outcome.Running);
    expect(throughBytes(live.core.captureCheckpoint()).phase).toBe('running');
  });
});
````

The test init names the Helm player:

In `tests/helpers/duelAuthority.ts`, replace:

````ts
export const resolveCutter = (id: string) => { if (id !== CUTTER.id) throw Error('unknown duel layout'); return CUTTER; };
export function duelInit(seed: number, runId = `duel-${seed}`): DuelInit {
  return { runId, layoutId: CUTTER.id, layoutHash: deriveLayout(CUTTER).layoutHash, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed, playerCount: 2 };
}
````

with:

````ts
export const resolveCutter = (id: string) => { if (id !== CUTTER.id) throw Error('unknown duel layout'); return CUTTER; };
export function duelInit(seed: number, runId = `duel-${seed}`, helmPlayer: 0 | 1 = 0): DuelInit {
  return { runId, layoutId: CUTTER.id, layoutHash: deriveLayout(CUTTER).layoutHash, simVersion: SIM_VERSION, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed, playerCount: 2, helmPlayer };
}
````

The existing duel tests, to the new contract (a decided round keeps ticking; the run never ends; the round module; duel schema version 2):

In `tests/duel.test.ts`, replace:

````ts
  it('has exactly these fields; a new field must also go into flattenDuel in duel/hash.ts', () => {
    expect(Object.keys(createDuel(layout, 5)).sort()).toEqual(['events', 'interior', 'nav', 'points', 'present', 'repair', 'tactical', 'weapons']);
  });
````

with:

````ts
  it('has exactly these fields; a new field must also go into flattenDuel in duel/hash.ts', () => {
    expect(Object.keys(createDuel(layout, 5)).sort()).toEqual(['baseTick', 'decidedTick', 'events', 'helmPlayer', 'interior', 'nav', 'points', 'present', 'repair', 'round', 'tactical', 'weapons']);
  });
````

In `tests/duel.test.ts`, replace:

````ts
  });
  it('keeps the interior and tactical ticks together, and stops when the duel ends', () => {
    const d = createDuel(layout, 5);
````

with:

````ts
  });
  it('keeps the interior and tactical ticks together, and a decided round keeps ticking with nothing to report (H-2 spec §7)', () => {
    const d = createDuel(layout, 5);
````

In `tests/duel.test.ts`, replace:

````ts
    expect(d.tactical.outcome).toBe(Outcome.EnemyWins);
    expect(step(d)).toEqual([]);
    expect([d.interior.tick, d.tactical.tick]).toEqual([11, 11]);
  });
````

with:

````ts
    expect(d.tactical.outcome).toBe(Outcome.EnemyWins);
    expect(d.decidedTick).toBe(11);
    expect(step(d)).toEqual([]);
    expect([d.interior.tick, d.tactical.tick, d.decidedTick]).toEqual([12, 12, 11]);
  });
````

In `tests/duelCheckpoint.test.ts`, replace:

````ts
function runToEnd(h: DuelCore, driver: ReturnType<typeof createDriver>, hashes: string[], frames: ReplayFrame[] = [], until = Infinity) {
  while (!duelRules.terminal(h.state, h.init).ended && duelRules.tick(h.state) < until) {
    for (const frame of stepScripted(h, driver)) { frames.push(frame); if (frame.action.kind === 'tick') hashes.push(frame.after!.hash); }
````

with:

````ts
function runToEnd(h: DuelCore, driver: ReturnType<typeof createDriver>, hashes: string[], frames: ReplayFrame[] = [], until = Infinity) {
  while (h.state.duel.tactical.outcome === Outcome.Running && duelRules.tick(h.state) < until) {   // to the round's decision (H-2: the run itself never ends)
    for (const frame of stepScripted(h, driver)) { frames.push(frame); if (frame.action.kind === 'tick') hashes.push(frame.after!.hash); }
````

In `tests/duelCheckpoint.test.ts`, replace:

````ts
        expect(splitHashes).toEqual(referenceHashes);
        const end = duelRules.terminal(reference.state, reference.init);
        expect(end.ended).toBe(true);
        expect(duelRules.terminal(resumed.state, resumed.init)).toEqual(end);
        expect(resumed.core.captureCheckpoint().modeMemory, 'the final telemetry accumulator of the restored run').toEqual(reference.core.captureCheckpoint().modeMemory);
        expect(end.endRecord).toMatchObject({ mode: 'duel', record: { outcome: Outcome.EnemyWins, ticks: referenceHashes.length,
          terminal: [['missile'], []], laserReleases: [11, 28], laserHits: [2, 28], missilesLaunched: [2, 5], missileHits: [0, 5], repairsFinished: [7, 9] } });
        expect(Object.isFrozen(end.endRecord!.record)).toBe(true);
        expect(referenceHashes.length).toBeGreaterThan(SPLIT);
        console.log(`continuation proof: seed ${SEED}, ${SPLIT} + ${referenceHashes.length - SPLIT} ticks; summary ${JSON.stringify(end.endRecord!.record)}`);
      } finally { resumed.core.dispose(); }
````

with:

````ts
        expect(splitHashes).toEqual(referenceHashes);
        // A decided round is the end card, never the end of the run (H-2 spec §7): its summary is the session's.
        expect(duelRules.terminal(reference.state, reference.init)).toEqual({ ended: false, endRecord: null });
        const end = reference.state.summary;
        expect(resumed.state.summary).toEqual(end);
        expect(resumed.core.captureCheckpoint().modeMemory, 'the final telemetry accumulator of the restored run').toEqual(reference.core.captureCheckpoint().modeMemory);
        expect(end).toMatchObject({ outcome: Outcome.EnemyWins, ticks: referenceHashes.length,
          terminal: [['missile'], []], laserReleases: [11, 28], laserHits: [2, 28], missilesLaunched: [2, 5], missileHits: [0, 5], repairsFinished: [7, 9] });
        expect(Object.isFrozen(end)).toBe(true);
        expect(referenceHashes.length).toBeGreaterThan(SPLIT);
        console.log(`continuation proof: seed ${SEED}, ${SPLIT} + ${referenceHashes.length - SPLIT} ticks; summary ${JSON.stringify(end)}`);
      } finally { resumed.core.dispose(); }
````

In `tests/duelCheckpoint.test.ts`, replace:

````ts
    const examples: Record<string, unknown> = { sit: { kind: 'sit', station: 0 }, stand: { kind: 'stand' }, presence: { kind: 'presence', present: true },
      laserLock: { kind: 'laserLock', room: 1 }, laserCharge: { kind: 'laserCharge', held: true }, missileLaunch: { kind: 'missileLaunch' } };
    const kinds = DUEL_MODULES.flatMap(({ module }) => [...module.commands]);
````

with:

````ts
    const examples: Record<string, unknown> = { sit: { kind: 'sit', station: 0 }, stand: { kind: 'stand' }, presence: { kind: 'presence', present: true },
      laserLock: { kind: 'laserLock', room: 1 }, laserCharge: { kind: 'laserCharge', held: true }, missileLaunch: { kind: 'missileLaunch' }, rematch: { kind: 'rematch' } };
    const kinds = DUEL_MODULES.flatMap(({ module }) => [...module.commands]);
````

In `tests/duelMode.test.ts`, replace:

````ts
    };
    const u = utility('duel', 1);
    expect(u.command({ kind: 'start', initBytes: encode(duelInit(2, 'utility-duel')) }).ok).toBe(true);
````

with:

````ts
    };
    const u = utility('duel', 2);   // duel schema version 2 (H-2 spec §7)
    expect(u.command({ kind: 'start', initBytes: encode(duelInit(2, 'utility-duel')) }).ok).toBe(true);
````

In `tests/duelModules.test.ts`, replace:

````ts
import { flattenModule, unflattenModule, type SimModule } from '../src/renderer/src/sim/module';
import { DUEL_MODULES, DUEL_NOT_SNAPSHOTTED, interiorModule, presenceModule, repairModule } from '../src/renderer/src/sim/duel/modules';
import { flattenDuel, hashDuel } from '../src/renderer/src/sim/duel/hash';
````

with:

````ts
import { flattenModule, unflattenModule, type SimModule } from '../src/renderer/src/sim/module';
import { DUEL_MODULES, DUEL_NOT_SNAPSHOTTED, interiorModule, presenceModule, repairModule, roundModule } from '../src/renderer/src/sim/duel/modules';
import { flattenDuel, hashDuel } from '../src/renderer/src/sim/duel/hash';
````

In `tests/duelModules.test.ts`, replace:

````ts
const tacticalExcluded = { ...spaceModule.notSnapshotted, ...shipModule.notSnapshotted };
const duelNames = (d: DuelState) => new Set([presenceModule, repairModule, interiorModule].flatMap((m) => [...names(m, d)]));
function played(seed: number, ticks: number): DuelState {
````

with:

````ts
const tacticalExcluded = { ...spaceModule.notSnapshotted, ...shipModule.notSnapshotted };
const duelNames = (d: DuelState) => new Set([presenceModule, repairModule, roundModule, interiorModule].flatMap((m) => [...names(m, d)]));
function played(seed: number, ticks: number): DuelState {
````

In `tests/duelModules.test.ts`, replace:

````ts
  });
  it('flatten is the modules in canonical order after SIM_VERSION: space, ship, presence, repair, interior', () => {
    const d = played(1, 600);
````

with:

````ts
  });
  it('flatten is the modules in canonical order after SIM_VERSION: space, ship, presence, repair, round, interior', () => {
    const d = played(1, 600);
````

In `tests/duelModules.test.ts`, replace:

````ts
      expect(Array.from(flattenTactical(d.tactical))).toEqual([...space, ...ship].map((v) => (v === 0 ? 0 : v)));
      expect(Array.from(flattenDuel(d))).toEqual([SIM_VERSION, ...flattenTactical(d.tactical), d.present[0] ? 1 : 0, d.present[1] ? 1 : 0, ...d.repair, ...flatten(d.interior)]);
      const copy = cloneTactical(d.tactical), fresh = createTacticalState(1);
````

with:

````ts
      expect(Array.from(flattenTactical(d.tactical))).toEqual([...space, ...ship].map((v) => (v === 0 ? 0 : v)));
      expect(Array.from(flattenDuel(d))).toEqual([SIM_VERSION, ...flattenTactical(d.tactical), d.present[0] ? 1 : 0, d.present[1] ? 1 : 0, ...d.repair, d.round, d.helmPlayer, d.baseTick, d.decidedTick, ...flatten(d.interior)]);
      const copy = cloneTactical(d.tactical), fresh = createTacticalState(1);
````

In `tests/duelModules.test.ts`, replace:

````ts
    const kinds = DUEL_MODULES.flatMap(({ module }) => [...module.commands]).sort();
    expect(kinds).toEqual(['laserCharge', 'laserLock', 'missileLaunch', 'presence', 'sit', 'stand']);
    for (const { module } of DUEL_MODULES) for (const reason of module.reasons) expect(COMMAND_REASONS, `${module.id}: ${reason}`).toContain(reason);
````

with:

````ts
    const kinds = DUEL_MODULES.flatMap(({ module }) => [...module.commands]).sort();
    expect(kinds).toEqual(['laserCharge', 'laserLock', 'missileLaunch', 'presence', 'rematch', 'sit', 'stand']);
    for (const { module } of DUEL_MODULES) for (const reason of module.reasons) expect(COMMAND_REASONS, `${module.id}: ${reason}`).toContain(reason);
````

In `tests/duelSnapshot.test.ts`, replace:

````ts
      expect(() => validateDuelSnapshot(CUTTER, twice, DIGEST)).toThrow(new RegExp(`ship ${owner} has two missiles in flight`));
      const interiorAt = at + 5, fieldsAt = interiorAt;
      for (const [k, value, error] of [[0, 1e6, /interior sim version/], [1, 12345, /interior layout/], [2, 12345, /interior layout/], [5, 1, /crew count/], [9, 3, /crew count/]] as const) {
````

with:

````ts
      expect(() => validateDuelSnapshot(CUTTER, twice, DIGEST)).toThrow(new RegExp(`ship ${owner} has two missiles in flight`));
      const interiorAt = at + 5 + 4, fieldsAt = interiorAt;   // after presence, repair and the round module (H-2)
      for (const [k, value, error] of [[0, 1e6, /interior sim version/], [1, 12345, /interior layout/], [2, 12345, /interior layout/], [5, 1, /crew count/], [9, 3, /crew count/]] as const) {
````

In `tests/duelSnapshot.test.ts`, replace:

````ts
        expect(() => validateDuelSnapshot(CUTTER, snap, DIGEST)).toThrow(/presence|repair/);
      }
````

with:

````ts
        expect(() => validateDuelSnapshot(CUTTER, snap, DIGEST)).toThrow(/presence|repair/);
      }
      // The round module (H-2 spec §7): a round index, the Helm player, a base tick no later than the tick, and a
      // decided tick that is −1 exactly while the round runs.
      for (const [k, value, error] of [[0, -1, /round -1/], [0, 0.5, /round 0.5/], [1, 2, /helm player/], [2, 5157, /base tick/], [2, -1, /base tick/], [3, 7, /decided tick/]] as const) {
        const snap = structuredClone(good); snap.values[at + 5 + k] = value; snap.header.hash = hashF64(Float64Array.from(snap.values));
        expect(() => validateDuelSnapshot(CUTTER, snap, DIGEST), `round[${k}] = ${value}`).toThrow(error);
      }
````

Run: `npx vitest run tests/duelRounds.test.ts`
Expected: FAIL, 9 tests: `createDuel` has no Helm player and the duel has no round module.

- [ ] **Step 2: The round module's members and the Helm player**

In `src/renderer/src/sim/duel/state.ts`, replace:

````ts
  events: RepairEvent[];
}
````

with:

````ts
  events: RepairEvent[];
  /** The round module (H-2 spec §7): this round's index from 0, the player seated at the Helm when it began, the
   *  encounter tick it began on, and the tick right after its deciding step (−1 while it runs). */
  round: number; helmPlayer: 0 | 1; baseTick: number; decidedTick: number;
}
````

In `src/renderer/src/sim/duel/state.ts`, replace:

````ts
 * A duel on `layout` (the Cutter): two trait-free Recruits (no XP is ever awarded, since xpSystem never runs), every
 * door held open, player 0 seated at Navigation and player 1 at Weapons, and a tactical state from the same seed whose
 * map must validate. Throws if the map or a repair point is invalid, so a bad seed or layout fails loudly.
 */
export function createDuel(layout: ShipLayout, seed: number): DuelState {
  const tactical = createTacticalState(seed);
````

with:

````ts
 * A duel on `layout` (the Cutter): two trait-free Recruits (no XP is ever awarded, since xpSystem never runs), every
 * door held open, `helmPlayer` (default 0) seated at Navigation and the other player at Weapons, and a tactical state
 * from the same seed whose map must validate. Round 0, beginning on tick 0. Throws if the map, a repair point or
 * `helmPlayer` is invalid, so a bad seed or layout fails loudly.
 */
export function createDuel(layout: ShipLayout, seed: number, helmPlayer: 0 | 1 = 0): DuelState {
  if (helmPlayer !== 0 && helmPlayer !== 1) throw new Error(`invalid duel helm player ${String(helmPlayer)}`);
  const tactical = createTacticalState(seed);
````

In `src/renderer/src/sim/duel/state.ts`, replace:

````ts
    if (nav < 0 || weapons < 0) throw new Error('duel layout needs Navigation and Weapons consoles');
    sitDown(interior, 0, nav);
    sitDown(interior, 1, weapons);
    const points = CUTTER_REPAIR_POINTS.map((p) => {
````

with:

````ts
    if (nav < 0 || weapons < 0) throw new Error('duel layout needs Navigation and Weapons consoles');
    sitDown(interior, helmPlayer, nav);
    sitDown(interior, 1 - helmPlayer, weapons);
    const points = CUTTER_REPAIR_POINTS.map((p) => {
````

In `src/renderer/src/sim/duel/state.ts`, replace:

````ts
    });
    return { interior, tactical, present: [true, true], repair: [0, 0, 0], points, nav, weapons, events: [] };
  } catch (err) {
````

with:

````ts
    });
    return { interior, tactical, present: [true, true], repair: [0, 0, 0], points, nav, weapons, events: [], round: 0, helmPlayer, baseTick: 0, decidedTick: -1 };
  } catch (err) {
````

In `src/renderer/src/sim/duel/modules.ts`, replace:

````ts
// The duel on the sim module contract (engine refactor spec §6, R-1 and R-2): space (the ship slots' bodies, the
// missile pool, the hunter), ship (each slot's systems record), presence, repair and the interior wrapper, in canonical
// order after SIM_VERSION. flattenDuel, the duel snapshot and its restore all come
// from this list; tests/duelModules.test.ts holds every DuelState and TacticalState member to a field or an exclusion.
````

with:

````ts
// The duel on the sim module contract (engine refactor spec §6, R-1 and R-2): space (the ship slots' bodies, the
// missile pool, the hunter), ship (each slot's systems record), presence, repair, round (H-2 spec §7) and the interior
// wrapper, in canonical order after SIM_VERSION. flattenDuel, the duel snapshot and its restore all come
// from this list; tests/duelModules.test.ts holds every DuelState and TacticalState member to a field or an exclusion.
````

In `src/renderer/src/sim/duel/modules.ts`, replace:

````ts
import { canonicalFields } from '../canonicalFields';
import { flag, flattenModule, moduleLength, unflattenModule, vector, type ModuleField, type SimModule } from '../module';
import { shipModule, spaceModule } from '../tactical/hash';
````

with:

````ts
import { canonicalFields } from '../canonicalFields';
import { flag, flattenModule, moduleLength, scalar, unflattenModule, vector, type ModuleField, type SimModule } from '../module';
import { shipModule, spaceModule } from '../tactical/hash';
````

In `src/renderer/src/sim/duel/modules.ts`, replace:

````ts
const REPAIR: ModuleField<DuelState>[] = [vector('repair', 3, (d) => d.repair)];

````

with:

````ts
const REPAIR: ModuleField<DuelState>[] = [vector('repair', 3, (d) => d.repair)];

/** The round (H-2 spec §7): which round this is, who flies the Helm by the init, the encounter tick the round began on,
 *  and the tick after its deciding step (−1 while it runs). The round's seed is the space module's own `seed`. */
export const roundModule: SimModule<DuelState> = {
  id: 'round',
  fields: () => ROUND,
  notSnapshotted: {},
  commands: ['rematch'],
  reasons: ['duel-running', 'duel-decided', 'stale-tick', 'unavailable']
};
const ROUND: ModuleField<DuelState>[] = [
  scalar('round', (d) => d.round, (d, v) => { d.round = v; }),
  scalar('helmPlayer', (d) => d.helmPlayer, (d, v) => { d.helmPlayer = v as 0 | 1; }),
  scalar('baseTick', (d) => d.baseTick, (d, v) => { d.baseTick = v; }),
  scalar('decidedTick', (d) => d.decidedTick, (d, v) => { d.decidedTick = v; })
];

````

In `src/renderer/src/sim/duel/modules.ts`, replace:

````ts
  { module: repairModule as SimModule<never>, state: (d) => d, path: '' },
  { module: interiorModule as SimModule<never>, state: (d) => d, path: '' }
````

with:

````ts
  { module: repairModule as SimModule<never>, state: (d) => d, path: '' },
  { module: roundModule as SimModule<never>, state: (d) => d, path: '' },
  { module: interiorModule as SimModule<never>, state: (d) => d, path: '' }
````

- [ ] **Step 3: The decided step, the rematch and the next round**

In `src/renderer/src/sim/duel/step.ts`, replace:

````ts
// only the interior pieces the duel uses (sit, stand, Interact for repair, movement) and then the tactical stepDuel.
import { NEUTRAL_INTENT, type Intent } from '../../../../shared/intent';
````

with:

````ts
// only the interior pieces the duel uses (sit, stand, Interact for repair, movement) and then the tactical stepDuel.
// H-2 spec §7: a duel is a series of rounds in one run. A decided round's ticks keep advancing with no physics (the end
// card), every command still gets a result, and a `rematch` there starts the next round on the following tick.
import { NEUTRAL_INTENT, type Intent } from '../../../../shared/intent';
````

In `src/renderer/src/sim/duel/step.ts`, replace:

````ts
import type { DuelEnvelope, DuelReason, DuelResult } from './commands';
import type { DuelState } from './state';
import { REPAIR_RATE_SOLO, REPAIR_RATE_TEAM, REPAIR_UNITS } from './tuning';
````

with:

````ts
import type { DuelEnvelope, DuelReason, DuelResult } from './commands';
import { followingSeed } from './seeds';
import { createDuel, disposeDuel, type DuelState } from './state';
import { REPAIR_RATE_SOLO, REPAIR_RATE_TEAM, REPAIR_UNITS } from './tuning';
````

In `src/renderer/src/sim/duel/step.ts`, replace:

````ts
const WEAPON_ORDER = ['laserLock', 'laserCharge', 'missileLaunch'] as const;

````

with:

````ts
const WEAPON_ORDER = ['laserLock', 'laserCharge', 'missileLaunch'] as const;
/** Every duel command kind the step handles; any other kind is rejected not-in-duel. */
const DUEL_KINDS = ['sit', 'stand', 'presence', 'laserLock', 'laserCharge', 'missileLaunch', 'rematch'];

````

In `src/renderer/src/sim/duel/step.ts`, replace:

````ts
/**
 * Spec §13, in order: scratch reset (and d.events cleared); seat phase (sit through today's interaction validation,
````

with:

````ts
/**
 * The next round (H-2 spec §7), built in place in `d` so every holder of the duel keeps it: a fresh duel (a fresh
 * interior world) from the round seed after this one, with the same Helm player and presence, whose every tick stamp
 * is moved to the encounter tick `tick`: the interior and tactical ticks, each ship's graceUntil and the hunter's last
 * launch. A round started at `tick` behaves as a fresh duel started at 0 (tests/duelRounds.test.ts).
 */
function startRound(d: DuelState, tick: number): void {
  const next = createDuel(d.interior.layout, followingSeed(d.tactical.seed), d.helmPlayer);
  next.present = [d.present[0], d.present[1]];
  next.round = d.round + 1; next.baseTick = tick; next.decidedTick = -1;
  next.interior.tick = tick; next.tactical.tick = tick;
  for (const ship of next.tactical.ships) ship.graceUntil.fill(tick);
  next.tactical.hunter.lastLaunch += tick;
  disposeDuel(d);
  Object.assign(d, next);
}

/** A decided round's tick (the end card): no physics, both ticks advance, and every command gets a result. The first
 *  rematch from a present player is applied (a second in the tick is noop) and starts the next round on the next tick;
 *  presence applies as ever; every other duel command is rejected duel-decided. */
function stepDecided(d: DuelState, input: DuelInput): DuelResult[] {
  const st = d.interior, tick = st.tick, results: DuelResult[] = [];
  const result = (env: DuelEnvelope, reason?: DuelReason, status: DuelResult['status'] = 'applied'): void => {
    results.push(reason ? { id: env.id, tick, status: 'rejected', reason } : { id: env.id, tick, status });
  };
  resetScratch(d);
  d.events = []; d.tactical.events = [];
  const presentBefore = [d.present[0], d.present[1]];
  let rematch = false;
  for (const e of input.commands) {
    const c = e.command;
    if (c.kind === 'rematch') {
      if (e.requestedTick !== tick) result(e, 'stale-tick');
      else if (!presentBefore[e.id.player as 0 | 1]) result(e, 'unavailable');
      else if (rematch) result(e, undefined, 'noop');
      else { rematch = true; result(e); }
    } else if (c.kind === 'presence') {
      if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
      if ((e.id.player !== 0 && e.id.player !== 1) || typeof c.present !== 'boolean') { result(e, 'malformed'); continue; }
      d.present[e.id.player] = c.present; result(e);
    } else result(e, DUEL_KINDS.includes(c.kind) ? 'duel-decided' : 'not-in-duel');
  }
  if (rematch) startRound(d, tick + 1);
  else { st.tick++; d.tactical.tick++; }
  return results.sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence);
}

/**
 * Spec §13, in order: scratch reset (and d.events cleared); seat phase (sit through today's interaction validation,
````

In `src/renderer/src/sim/duel/step.ts`, replace:

````ts
 * present players; the tactical stepDuel; the interior tick. Commands apply in the order given (the authority's
 * envelope order). Returns one result per command, sorted by player then sequence. Does nothing once the duel has ended.
 */
export function stepDuelTick(d: DuelState, input: DuelInput): DuelResult[] {
  if (d.tactical.outcome !== Outcome.Running) return [];
  const st = d.interior, tick = st.tick, results: DuelResult[] = [];
````

with:

````ts
 * present players; the tactical stepDuel; the interior tick. Commands apply in the order given (the authority's
 * envelope order). Returns one result per command, sorted by player then sequence. A rematch while the round runs is
 * rejected duel-running; the step that decides the round records `decidedTick`. A decided round steps by stepDecided.
 */
export function stepDuelTick(d: DuelState, input: DuelInput): DuelResult[] {
  if (d.tactical.outcome !== Outcome.Running) return stepDecided(d, input);
  const st = d.interior, tick = st.tick, results: DuelResult[] = [];
````

In `src/renderer/src/sim/duel/step.ts`, replace:

````ts
  }
  for (const e of input.commands) if (!['sit', 'stand', 'presence', 'laserLock', 'laserCharge', 'missileLaunch'].includes(e.command.kind)) result(e, 'not-in-duel');
  if (helm >= 0) { const h = input.held[helm] ?? NO_HELD; crew.axes = { turn: h.moveX, thrust: -h.moveY }; }   // W (moveY −1, up) is thrust forward
````

with:

````ts
  }
  for (const e of input.commands) if (e.command.kind === 'rematch') result(e, 'duel-running');
  for (const e of input.commands) if (!DUEL_KINDS.includes(e.command.kind)) result(e, 'not-in-duel');
  if (helm >= 0) { const h = input.held[helm] ?? NO_HELD; crew.axes = { turn: h.moveX, thrust: -h.moveY }; }   // W (moveY −1, up) is thrust forward
````

In `src/renderer/src/sim/duel/step.ts`, replace:

````ts
  st.tick++;
  return results.sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence);
````

with:

````ts
  st.tick++;
  if (d.tactical.outcome !== Outcome.Running) d.decidedTick = st.tick;   // the snapshot tick of the first decided publication
  return results.sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence);
````

- [ ] **Step 4: One accumulator per round, frozen on the decision**

In `src/renderer/src/sim/duel/telemetry.ts`, replace:

````ts
// the duel. Counter diffs (contact counters, launches, graceUntil) are taken against the accumulator's copy of the
// tick before.
import { Seated } from '../components';
````

with:

````ts
// the duel. Counter diffs (contact counters, launches, graceUntil) are taken against the accumulator's copy of the
// tick before. One accumulator covers one round (H-2 spec §7, §8): its `ticks` count from the round's baseTick, and it
// freezes once the round is decided, so the end card's ticks add nothing and the terminal causes are never recomputed.
import { Seated } from '../components';
````

In `src/renderer/src/sim/duel/telemetry.ts`, replace:

````ts
export interface DuelTelemetry {
  ticks: number;
````

with:

````ts
export interface DuelTelemetry {
  /** Ticks of this round so far, from its baseTick; frozen at decidedTick − baseTick once it is decided. */
  ticks: number;
````

In `src/renderer/src/sim/duel/telemetry.ts`, replace:

````ts
/** Fold one finished tick into the accumulator: call right after stepDuelTick(d, input) with the same input. A call
 *  after the duel has ended (stepDuelTick did nothing) is ignored. */
export function recordTick(t: DuelTelemetry, d: DuelState, input: DuelInput): void {
  const tac = d.tactical, tick = tac.tick - 1;   // the tick that just ran
  if (tick < t.ticks) return;
  t.ticks = tac.tick; t.outcome = tac.outcome;
  const now = counters(d), [crew, enemy] = tac.ships;
````

with:

````ts
/** Fold one finished tick into the accumulator: call right after stepDuelTick(d, input) with the same input. A call
 *  for a tick already counted, or once the round is decided (the end card's ticks), is ignored. */
export function recordTick(t: DuelTelemetry, d: DuelState, input: DuelInput): void {
  const tac = d.tactical, tick = tac.tick - 1;   // the tick that just ran
  if (t.outcome !== Outcome.Running || tick - d.baseTick < t.ticks) return;
  t.ticks = tac.tick - d.baseTick; t.outcome = tac.outcome;
  const now = counters(d), [crew, enemy] = tac.ships;
````

- [ ] **Step 5: The snapshot reads and validates the round module**

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

````ts
// The duel snapshot (engine refactor spec §6, an R-1 deliverable). The values are exactly flattenDuel: SIM_VERSION, the
// tactical state in flattenTactical's order (the space then the ship module), presence, repair, then the interior
// through the sector snapshot path.
// Regenerated, not stored: the map (from the seed, checked by mapHash), the broad-phase grid, the repair points and
````

with:

````ts
// The duel snapshot (engine refactor spec §6, an R-1 deliverable). The values are exactly flattenDuel: SIM_VERSION, the
// tactical state in flattenTactical's order (the space then the ship module), presence, repair, the round (H-2 spec
// §7), then the interior through the sector snapshot path.
// Regenerated, not stored: the map (from the seed, checked by mapHash), the broad-phase grid, the repair points and
````

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

````ts
import { validateMap } from '../tactical/map';
import { createTacticalState, type TacticalState } from '../tactical/state';
import { DUEL_CLASSES } from '../tactical/defs';
````

with:

````ts
import { validateMap } from '../tactical/map';
import { createTacticalState, Outcome, type TacticalState } from '../tactical/state';
import { DUEL_CLASSES } from '../tactical/defs';
````

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

````ts

export function saveDuelSnapshot(d: DuelState, contentDigest: string): DuelSnapshot {
````

with:

````ts

/** The round module's values and the outcome, read from a validated snapshot (H-2 spec §7). */
export interface DuelRoundValues { round: number; helmPlayer: 0 | 1; baseTick: number; decidedTick: number; outcome: number }
export function duelRoundOf(snapshot: DuelSnapshot): DuelRoundValues {
  const e = seedEntry(snapshot.header.seed), v = snapshot.values, at = 1 + e.spaceLength + 2 + 3;
  return { round: v[at]!, helmPlayer: v[at + 1]! as 0 | 1, baseTick: v[at + 2]!, decidedTick: v[at + 3]!, outcome: v[e.fieldOffsets.get('outcome')!]! };
}

export function saveDuelSnapshot(d: DuelState, contentDigest: string): DuelSnapshot {
````

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

````ts
  const values = (snap.values as number[]).map((v) => (v === 0 ? 0 : v));
  const space = seed.spaceLength, interiorAt = 1 + space + 2 + 3;
  if (values.length !== interiorAt + lay.interiorCount) throw new Error('duel snapshot length does not match the layout and map');
````

with:

````ts
  const values = (snap.values as number[]).map((v) => (v === 0 ? 0 : v));
  const space = seed.spaceLength, roundAt = 1 + space + 2 + 3, interiorAt = roundAt + 4;
  if (values.length !== interiorAt + lay.interiorCount) throw new Error('duel snapshot length does not match the layout and map');
````

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

````ts
    throw new Error('duel snapshot duel slot identity does not match: two active slots, the Cutter and the hunter, each locked on the other');
  for (let k = 1 + space; k < interiorAt; k++) {
    const v = values[k]!, presence = k < 1 + space + 2;
    if (presence ? v !== 0 && v !== 1 : !Number.isInteger(v) || v < 0 || v >= REPAIR_UNITS) throw new Error(`duel snapshot ${presence ? 'presence' : 'repair'} value ${v} is out of range`);
  }
  const interior = values.slice(interiorAt);
````

with:

````ts
    throw new Error('duel snapshot duel slot identity does not match: two active slots, the Cutter and the hunter, each locked on the other');
  for (let k = 1 + space; k < roundAt; k++) {
    const v = values[k]!, presence = k < 1 + space + 2;
    if (presence ? v !== 0 && v !== 1 : !Number.isInteger(v) || v < 0 || v >= REPAIR_UNITS) throw new Error(`duel snapshot ${presence ? 'presence' : 'repair'} value ${v} is out of range`);
  }
  // The round module: a round index, the Helm player 0 or 1, a base tick no later than the tick, and a decided tick that
  // is −1 exactly while the outcome is Running, otherwise between the base tick and the tick.
  const [round, helm, base, decided] = values.slice(roundAt, interiorAt) as [number, number, number, number];
  const running = values[seed.fieldOffsets.get('outcome')!] === Outcome.Running;
  if (!Number.isSafeInteger(round) || round < 0) throw new Error(`duel snapshot round ${round} is invalid`);
  if (helm !== 0 && helm !== 1) throw new Error(`duel snapshot helm player ${helm} is invalid`);
  if (!Number.isSafeInteger(base) || base < 0 || base > h.tick) throw new Error(`duel snapshot base tick ${base} is invalid`);
  if (running ? decided !== -1 : !Number.isSafeInteger(decided) || decided < base || decided > h.tick) throw new Error(`duel snapshot decided tick ${decided} does not match the outcome`);
  const interior = values.slice(interiorAt);
````

- [ ] **Step 6: The `records` hook**

In `src/renderer/src/authority/rules.ts`, replace:

````ts
// of these: it never imports a sim. Every call the core used to make into sector code goes through a hook here.
import type { Checkpoint, CommandResult, Cue, EndRecord, HeldInput, CommandEnvelope } from '../net/contracts';
import type { CommandCodec } from '../net/codec';
````

with:

````ts
// of these: it never imports a sim. Every call the core used to make into sector code goes through a hook here.
import type { AuthorityEvent, Checkpoint, CommandResult, Cue, EndRecord, HeldInput, CommandEnvelope } from '../net/contracts';
import type { CommandCodec } from '../net/codec';
````

In `src/renderer/src/authority/rules.ts`, replace:

````ts
  cues(prev: T['cueBaseline'], state: T['state']): Cue[];
  snapshot(state: T['state'], contentDigest: string): T['snapshot'];
````

with:

````ts
  cues(prev: T['cueBaseline'], state: T['state']): Cue[];
  /** Mode events a tick produced beyond its cues, against the same baseline (H-2 spec §7: the duel's `round` record on
   *  the tick a round is decided). The core emits each, in order, after the tick's cues. */
  records?(prev: T['cueBaseline'], state: T['state']): AuthorityEvent['payload'][];
  snapshot(state: T['state'], contentDigest: string): T['snapshot'];
````

In `src/renderer/src/authority/core.ts`, replace:

````ts
    for (const cue of rules.cues(previousCues, state)) emit({ kind: 'cue', cue });
    previousCues = nextCues;
````

with:

````ts
    for (const cue of rules.cues(previousCues, state)) emit({ kind: 'cue', cue });
    for (const payload of rules.records?.(previousCues, state) ?? []) emit(payload);
    previousCues = nextCues;
````

- [ ] **Step 7: Rounds in the duel rules**

In `src/renderer/src/authority/duelRules.ts`, replace:

````ts
// The duel's EncounterRules (engine refactor spec §6): the Helm duel behind the generic authority. The state is the
// duel plus its telemetry accumulator (mode memory, outside the hash) and the end summary, computed once at the end.
// `tick` is the interior tick; stepDuelTick advances it and the tactical tick together, and restore checks they agree.
import type { Cue, DuelCommand, CommandEnvelope } from '../net/contracts';
import { duelCodec } from '../net/codec';
````

with:

````ts
// The duel's EncounterRules (engine refactor spec §6): the Helm duel behind the generic authority. The state is the
// duel plus its telemetry accumulator (mode memory, outside the hash) and the end summary, computed once when a round
// is decided. `tick` is the interior tick; stepDuelTick advances it and the tactical tick together, and restore checks
// they agree. H-2 spec §7: the duel is a series of rounds in one run. A decided round never ends the run (terminal is
// never ended; the run ends when the players leave): the round's record goes out as a `round` event on the deciding
// tick, the end card keeps ticking, and a `rematch` there starts the next round with a fresh accumulator.
import type { AuthorityEvent, Cue, DuelCommand, CommandEnvelope } from '../net/contracts';
import { duelCodec } from '../net/codec';
````

In `src/renderer/src/authority/duelRules.ts`, replace:

````ts
import { stepDuelTick } from '../sim/duel/step';
import { duelEndSummary, type DuelEndSummary } from '../sim/duel/summary';
import { createTelemetry, recordTick, type DuelTelemetry } from '../sim/duel/telemetry';
````

with:

````ts
import { stepDuelTick } from '../sim/duel/step';
import { duelEndSummary, duelRoundRecord, type DuelEndSummary } from '../sim/duel/summary';
import { createTelemetry, recordTick, type DuelTelemetry } from '../sim/duel/telemetry';
````

In `src/renderer/src/authority/duelRules.ts`, replace:

````ts

export interface DuelSession { duel: DuelState; telemetry: DuelTelemetry; summary: DuelEndSummary | null }
export interface DuelTypes { state: DuelSession; init: DuelInit; controllers: DuelControllers; snapshot: DuelSnapshot; cueBaseline: { outcome: number } }

````

with:

````ts

/** The duel and this round's accumulator; `summary` is the round's frozen summary once it is decided, else null. */
export interface DuelSession { duel: DuelState; telemetry: DuelTelemetry; summary: DuelEndSummary | null }
export interface DuelTypes { state: DuelSession; init: DuelInit; controllers: DuelControllers; snapshot: DuelSnapshot; cueBaseline: { outcome: number; round: number } }

````

In `src/renderer/src/authority/duelRules.ts`, replace:

````ts
  validateInit: (value, contentDigest, resolveLayout) => validateDuelInit(resolveLayout((value as DuelInit | null)?.layoutId as string), value, contentDigest),
  create(init, resolveLayout) { const duel = createDuel(resolveLayout(init.layoutId), init.seed); return session(duel, createTelemetry(duel)); },
  dispose: (s) => disposeDuel(s.duel),
````

with:

````ts
  validateInit: (value, contentDigest, resolveLayout) => validateDuelInit(resolveLayout((value as DuelInit | null)?.layoutId as string), value, contentDigest),
  create(init, resolveLayout) { const duel = createDuel(resolveLayout(init.layoutId), init.seed, init.helmPlayer); return session(duel, createTelemetry(duel)); },
  dispose: (s) => disposeDuel(s.duel),
````

In `src/renderer/src/authority/duelRules.ts`, replace:

````ts
    const duelInput = { held: input.held, commands: input.commands as readonly CommandEnvelope<DuelCommand>[] };
    const results = stepDuelTick(s.duel, duelInput);
    recordTick(s.telemetry, s.duel, duelInput);
````

with:

````ts
    const duelInput = { held: input.held, commands: input.commands as readonly CommandEnvelope<DuelCommand>[] };
    const round = s.duel.round;
    const results = stepDuelTick(s.duel, duelInput);
    if (s.duel.round !== round) { s.telemetry = createTelemetry(s.duel); s.summary = null; return results; }   // a rematch: a fresh accumulator
    recordTick(s.telemetry, s.duel, duelInput);
````

In `src/renderer/src/authority/duelRules.ts`, replace:

````ts
  },
  terminal(s) {
    if (s.duel.tactical.outcome === Outcome.Running) return { ended: false, endRecord: null };
    // step and restore (session) set the summary whenever the outcome has left Running, so an ended duel always has one.
    if (!s.summary) throw new Error('an ended duel has no end summary');
    return { ended: true, endRecord: { mode: 'duel', record: s.summary } };
  },
  safePointKey: () => 'duel',
  callouts: () => null,
  cueBaseline: (s) => ({ outcome: s.duel.tactical.outcome }),
  cues(prev, s) {
````

with:

````ts
  },
  /** A decided round is the end card, not the end of the run (H-2 spec §7). */
  terminal: () => ({ ended: false, endRecord: null }),
  /** A safe point when a round is decided and when a rematch starts the next. */
  safePointKey: (s) => `duel:${s.duel.round}:${s.duel.tactical.outcome !== Outcome.Running}`,
  callouts: () => null,
  cueBaseline: (s) => ({ outcome: s.duel.tactical.outcome, round: s.duel.round }),
  cues(prev, s) {
````

In `src/renderer/src/authority/duelRules.ts`, replace:

````ts
    if (events.some((e) => (e.kind === 'laser' && e.ship === 0 && e.hit) || (e.kind === 'missileEnd' && e.cause === 'ship' && e.target === 1))) out.push('hit');
    if (prev.outcome === Outcome.Running && outcome !== Outcome.Running) out.push(outcome === Outcome.CrewWins ? 'victory' : 'defeat');
    return out;
  },
````

with:

````ts
    if (events.some((e) => (e.kind === 'laser' && e.ship === 0 && e.hit) || (e.kind === 'missileEnd' && e.cause === 'ship' && e.target === 1))) out.push('hit');
    if (prev.round === s.duel.round && prev.outcome === Outcome.Running && outcome !== Outcome.Running) out.push(outcome === Outcome.CrewWins ? 'victory' : 'defeat');
    return out;
  },
  /** The round record, once, on the tick the round is decided. */
  records(prev, s): AuthorityEvent['payload'][] {
    if (prev.round !== s.duel.round || prev.outcome !== Outcome.Running || s.duel.tactical.outcome === Outcome.Running) return [];
    if (!s.summary) throw new Error('a decided duel round has no summary');
    return [{ kind: 'round', record: duelRoundRecord(s.summary, s.duel.round, s.duel.tactical.seed, s.duel.baseTick) }];
  },
````

- [ ] **Step 8: The init's Helm player and the redefined checkpoint rules**

In `src/renderer/src/authority/duelCheckpoint.ts`, replace:

````ts
// accumulator as its own versioned blob, outside the hash, restored with the duel so a restored duel's end summary
// equals an uninterrupted one's. Everything is validated before any allocation.
import { z } from 'zod';
````

with:

````ts
// accumulator as its own versioned blob, outside the hash, restored with the duel so a restored duel's end summary
// equals an uninterrupted one's. Everything is validated before any allocation. H-2 spec §7: the init names the Helm
// player, and a checkpoint may be from any round of the run (its seed is that round's), on a decided round's end card
// in a running or paused phase, with the accumulator counting from the round's base tick.
import { z } from 'zod';
````

In `src/renderer/src/authority/duelCheckpoint.ts`, replace:

````ts
import type { ShipLayout } from '../sim/ship/schema';
import { DUEL_PLAYERS, duelSeedFacts, validateDuelSnapshot, type DuelSnapshot } from '../sim/duel/snapshot';
import type { DuelTelemetry, MissileLoss } from '../sim/duel/telemetry';
````

with:

````ts
import type { ShipLayout } from '../sim/ship/schema';
import { DUEL_PLAYERS, duelRoundOf, duelSeedFacts, validateDuelSnapshot, type DuelSnapshot } from '../sim/duel/snapshot';
import { roundSeed } from '../sim/duel/seeds';
import type { DuelTelemetry, MissileLoss } from '../sim/duel/telemetry';
````

In `src/renderer/src/authority/duelCheckpoint.ts`, replace:

````ts

export interface DuelInit { runId: string; layoutId: string; layoutHash: string; simVersion: number; contentDigest: string; seed: number; playerCount: number }
/** The duel has no bot producers in R-1, so its controller memory is always empty. */
````

with:

````ts

/** `seed` is round 0's; `helmPlayer` is seated at Navigation in every round (H-2 spec §2). */
export interface DuelInit { runId: string; layoutId: string; layoutHash: string; simVersion: number; contentDigest: string; seed: number; playerCount: number; helmPlayer: 0 | 1 }
/** The duel has no bot producers in R-1, so its controller memory is always empty. */
````

In `src/renderer/src/authority/duelCheckpoint.ts`, replace:

````ts
  runId: text, layoutId: text, layoutHash: text, simVersion: z.literal(SIM_VERSION),
  contentDigest: z.string().regex(/^[0-9a-f]{64}$/), seed: uint.max(0xffffffff), playerCount: z.literal(DUEL_PLAYERS)
}).strict();
````

with:

````ts
  runId: text, layoutId: text, layoutHash: text, simVersion: z.literal(SIM_VERSION),
  contentDigest: z.string().regex(/^[0-9a-f]{64}$/), seed: uint.max(0xffffffff), playerCount: z.literal(DUEL_PLAYERS),
  helmPlayer: z.union([z.literal(0), z.literal(1)])
}).strict();
````

In `src/renderer/src/authority/duelCheckpoint.ts`, replace:

````ts
  cp.snapshot = validateDuelSnapshot(layout, cp.snapshot, contentDigest);
  if (cp.snapshot.header.seed !== cp.init.seed) throw new Error('inconsistent duel checkpoint seed');
  const ended = cp.snapshot.values[1 + 4] !== 0;   // SIM_VERSION, then the space module's tick, seed, rng.s, asteroid count, outcome (then the slot count)
  if (ended !== (cp.phase === 'ended')) throw new Error('inconsistent checkpoint terminal phase');
  if (cp.admissionTick > cp.snapshot.header.tick || cp.paused !== (cp.phase === 'paused')) throw new Error('inconsistent checkpoint');
  const ledger = createLedger([0, 1], DUEL_PLAYERS, duelCodec);
  ledger.restore({ commandHighWater: cp.commandHighWater, recentResults: cp.recentResults, admissionTick: cp.admissionTick, admissionCounts: cp.admissionCounts });
  for (const { envelope, result } of cp.recentResults) if (envelope.runId !== cp.init.runId || result.tick > cp.snapshot.header.tick) throw new Error('inconsistent checkpoint cache');
  const t = cp.modeMemory.telemetry, bodies = duelSeedFacts(cp.init.seed).graceLength;   // the map's bodies plus the other ship slots
  if (t.prev.grace.some((g) => g.length !== bodies) || t.ticks !== cp.snapshot.header.tick) throw new Error('inconsistent duel telemetry');
  // The accumulator's outcome is the snapshot's (values[5], as above), and only an ended duel has terminal causes.
  if (t.outcome !== cp.snapshot.values[1 + 4] || (t.outcome === 0 && t.terminal.some((c) => c.length > 0))) throw new Error('inconsistent duel telemetry');
  return structuredClone(cp);
````

with:

````ts
  cp.snapshot = validateDuelSnapshot(layout, cp.snapshot, contentDigest);
  const r = duelRoundOf(cp.snapshot), decided = r.outcome !== 0, tick = cp.snapshot.header.tick;
  if (cp.snapshot.header.seed !== roundSeed(cp.init.seed, r.round)) throw new Error('inconsistent duel checkpoint seed');   // the round's seed
  if (r.helmPlayer !== cp.init.helmPlayer) throw new Error('inconsistent duel checkpoint helm player');
  if (cp.phase === 'ended' && !decided) throw new Error('inconsistent checkpoint terminal phase');   // a decided round may be running or paused
  if (cp.admissionTick > tick || cp.paused !== (cp.phase === 'paused')) throw new Error('inconsistent checkpoint');
  const ledger = createLedger([0, 1], DUEL_PLAYERS, duelCodec);
  ledger.restore({ commandHighWater: cp.commandHighWater, recentResults: cp.recentResults, admissionTick: cp.admissionTick, admissionCounts: cp.admissionCounts });
  for (const { envelope, result } of cp.recentResults) if (envelope.runId !== cp.init.runId || result.tick > tick) throw new Error('inconsistent checkpoint cache');
  const t = cp.modeMemory.telemetry, bodies = duelSeedFacts(cp.snapshot.header.seed).graceLength;   // the round map's bodies plus the other ship slots
  if (t.prev.grace.some((g) => g.length !== bodies) || t.ticks !== (decided ? r.decidedTick : tick) - r.baseTick) throw new Error('inconsistent duel telemetry');
  // The accumulator's outcome is the snapshot's, and only a decided round has terminal causes.
  if (t.outcome !== r.outcome || (t.outcome === 0 && t.terminal.some((c) => c.length > 0))) throw new Error('inconsistent duel telemetry');
  return structuredClone(cp);
````

- [ ] **Step 9: Duel schema version 2**

In `src/network/modes/duel.ts`, replace:

````ts
// rules. Its producers are the humans alone (the duel has no bots in R-1; a vacant player simply sends nothing), and its
// stream adapter is duelStream. The online duel UI and the main/renderer wiring are H-2.
import { duelRules, type DuelTypes } from '../../renderer/src/authority/duelRules';
````

with:

````ts
// rules. Its producers are the humans alone (the duel has no bots in R-1; a vacant player simply sends nothing), and its
// stream adapter is duelStream. Schema version 2 (H-2 spec §7): the init's helmPlayer, the round module and its checkpoint
// rules, the round event and its two reasons, and the widened end record.
import { duelRules, type DuelTypes } from '../../renderer/src/authority/duelRules';
````

In `src/network/modes/duel.ts`, replace:

````ts
export const duelMode: ModeDefinition = defineEncounterMode<DuelTypes>({
  modeId: 'duel', schemaVersion: 1, simVersion: SIM_VERSION, rules: duelRules, resolveLayout,
  codecs: jsonModeCodecs(duelRules, resolveLayout, 'duel'),
````

with:

````ts
export const duelMode: ModeDefinition = defineEncounterMode<DuelTypes>({
  modeId: 'duel', schemaVersion: 2, simVersion: SIM_VERSION, rules: duelRules, resolveLayout,
  codecs: jsonModeCodecs(duelRules, resolveLayout, 'duel'),
````

- [ ] **Step 10: Run the duel tests at SIM_VERSION 38**

Run: `npx vitest run tests/duelRounds.test.ts tests/duel.test.ts tests/duelCheckpoint.test.ts tests/duelMode.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts tests/duelCache.test.ts`
Expected: PASS, 68 tests in 7 files (10, 22, 6, 7, 10, 5 and 8).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 11: Bump SIM_VERSION to 39 and add `MIGRATIONS[38]`**

In `src/renderer/src/sim/tuning.ts`, replace:

````ts
export const O2_K = 6;                         // oxygen diffusion rate (per second, per unit conductance)
export const SIM_VERSION = 38;
export const TELEMETRY_KEEP = 50;   // game-over records kept in localStorage (spec 4-ii section 7)
````

with:

````ts
export const O2_K = 6;                         // oxygen diffusion rate (per second, per unit conductance)
export const SIM_VERSION = 39;
export const TELEMETRY_KEEP = 50;   // game-over records kept in localStorage (spec 4-ii section 7)
````

In `scripts/golden/duelOracle.ts`, replace:

````ts
    added: [/^space\.ships\.length$/, /^space\.ships\.\d+\.active$/, /^space\.missiles\.\d+\.(active|owner)$/, /^ship\.systems\.\d+\.(cls|target)$/]
  }
};
````

with:

````ts
    added: [/^space\.ships\.length$/, /^space\.ships\.\d+\.active$/, /^space\.missiles\.\d+\.(active|owner)$/, /^ship\.systems\.\d+\.(cls|target)$/]
  },
  /** H-2 (38 → 39): the round module joins after repair; no oracle run sends rematch or a non-default helmPlayer. */
  38: { change: 'H-2: duel rounds', rename: () => undefined, derived: [], added: [/^round\.(round|helmPlayer|baseTick|decidedTick)$/] }
};
````

- [ ] **Step 12: Both proofs before the bless**

Run: `npx tsx scripts/golden/canonical-trace.ts check`
Expected: `per-tick canonical trace identical, sim version 38 → 39: golden 7200 ticks, determinism-v2 108000 ticks in 19 runs (baseline HEAD <sha>)`, exit 0. The sector is version-only.

Run: `npx tsx scripts/golden/duel-oracle.ts check`
Expected: `duel oracle: 20 runs, 205178 ticks, 315 named fields, results, events and telemetry identical at every tick through the 38 → 39 alias table (H-2: duel rounds), sim version 38 → 39 (baseline HEAD <sha>)`, exit 0.

- [ ] **Step 13: Bless (the guard re-runs both proofs), then check the sector golden**

Run: `npm run bless`
Expected, exit 0:
```
blessed tests/golden/basic.json: 120 checkpoints, final 128b3c62
blessed tests/golden/duel-1.json: 26 checkpoints, 15772 ticks, outcome 1, final 0e111f7a
blessed tests/fixtures/determinism-v2.json: sim version 38 → 39, 1800 samples and 404 boundaries unchanged apart from the version and hashes
```

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: 14531 leaves differ, 0 outside version, digest and hashes`, exit 0.

- [ ] **Step 14: Run the duel suites at SIM_VERSION 39**

Run: `npx vitest run tests/duelGolden.test.ts tests/duelGates.test.ts tests/duelOracle.test.ts tests/duelRounds.test.ts tests/duelRuntime.test.ts tests/duelTelemetry.test.ts tests/duelScripted.test.ts`
Expected: PASS, 80 tests in 7 files (4, 12, 14, 10, 26, 9 and 5). `tests/duelGates.test.ts` is unchanged.

- [ ] **Step 15: Commit**

```
git add src/renderer/src/sim/duel/state.ts src/renderer/src/sim/duel/modules.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/telemetry.ts src/renderer/src/sim/duel/snapshot.ts src/renderer/src/sim/tuning.ts src/renderer/src/authority/rules.ts src/renderer/src/authority/core.ts src/renderer/src/authority/duelRules.ts src/renderer/src/authority/duelCheckpoint.ts src/network/modes/duel.ts scripts/golden/duelOracle.ts tests/golden/basic.json tests/golden/duel-1.json tests/fixtures/determinism-v2.json tests/helpers/liveDuel.ts tests/helpers/duelAuthority.ts tests/duelRounds.test.ts tests/duel.test.ts tests/duelCheckpoint.test.ts tests/duelMode.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts
git commit -m "H-2a-i task 3: rounds in the duel (SIM_VERSION 39): the round module, the end card and rematch, the round record, the redefined checkpoint; blessed"
```

---

### Task 4: The rematch golden

**Files:**
- Create: `tests/duelRematchGolden.test.ts`
- Modify: `tests/helpers/scriptedDuel.ts`, `scripts/bless-golden.ts`, `tests/blessGuard.test.ts`
- Created by `npm run bless -- --fresh`: `tests/golden/duel-rematch.json`

**Interfaces:**
- Produces: `scriptedDuel.ts`: `DUEL_REMATCH_GOLDEN`, `RematchRun`, `runRematch(seed, hashEvery, cap?)`.

- [ ] **Step 1: Write the failing test**

Create `tests/duelRematchGolden.test.ts`:

````ts
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
````

In `tests/blessGuard.test.ts`, replace:

````ts
    expect(source).toMatch(/import \{ verifyDuelOracle \} from '\.\/golden\/duelOracle';/);
    expect(source).toMatch(/blessRefusal\(\{ storedVersions: stored, currentVersion: SIM_VERSION, verify: verifyVersionOnly, duel: verifyDuelOracle, fresh: process\.argv\.includes\('--fresh'\), names: \[BASIC, DUEL_GOLDEN, DETERMINISM_FIXTURE\] \}\)/);
  });
````

with:

````ts
    expect(source).toMatch(/import \{ verifyDuelOracle \} from '\.\/golden\/duelOracle';/);
    expect(source).toMatch(/blessRefusal\(\{ storedVersions: stored, currentVersion: SIM_VERSION, verify: verifyVersionOnly, duel: verifyDuelOracle, fresh: process\.argv\.includes\('--fresh'\), names: \[BASIC, DUEL_GOLDEN, DETERMINISM_FIXTURE, DUEL_REMATCH_GOLDEN\] \}\)/);   // the rematch golden joined the pinned set (H-2)
  });
````

Run: `npx vitest run tests/duelRematchGolden.test.ts`
Expected: FAIL: there is no rematch golden yet, and `runRematch` is not exported.

- [ ] **Step 2: The rematch run**

In `tests/helpers/scriptedDuel.ts`, replace:

````ts
// nobody at either console, against the hunter, with telemetry, up to a tick cap. Shared by tests/duelGates.test.ts,
// tests/duelGolden.test.ts, scripts/duel-telemetry.ts and scripts/bless-golden.ts.
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { hashDuel } from '../../src/renderer/src/sim/duel/hash';
````

with:

````ts
// nobody at either console, against the hunter, with telemetry, up to a tick cap. Shared by tests/duelGates.test.ts,
// tests/duelGolden.test.ts, scripts/duel-telemetry.ts and scripts/bless-golden.ts. runRematch is the rematch golden's run
// (H-2 spec §7): two rounds in one duel, the second started by a rematch on the first's end card.
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { LOCAL_DUEL_RUN } from '../../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../../src/renderer/src/sim/duel/hash';
````

In `tests/helpers/scriptedDuel.ts`, replace:

````ts
export const DUEL_GOLDEN_EVERY = 600;

````

with:

````ts
export const DUEL_GOLDEN_EVERY = 600;

/** The rematch golden (H-2 spec §7): seed 1, the scripted pair, one rematch, round 2 to its outcome, a hash every 600 ticks. */
export const DUEL_REMATCH_GOLDEN = 'tests/golden/duel-rematch.json';

````

In `tests/helpers/scriptedDuel.ts`, replace:

````ts
    `planet-contact ends under 30 s: ${ts.filter((t) => endedFromPlanet(t) && t.ticks < PLANET_END_MIN_TICKS).length} (gate 0)`
  ].join('\n');
}
````

with:

````ts
    `planet-contact ends under 30 s: ${ts.filter((t) => endedFromPlanet(t) && t.ticks < PLANET_END_MIN_TICKS).length} (gate 0)`
  ].join('\n');
}

export interface RematchRun { seed: number; rematchTick: number; rounds: { seed: number; baseTick: number; outcome: number; ticks: number }[]; finalHash: string; hashes: string[] }
/** Round 1 with the scripted pair to its outcome, then on the first end-card tick player 0 sends `rematch`, then round 2
 *  with a fresh scripted pair for its seed to its outcome (each round capped at `cap` ticks). `hashEvery` > 0 records
 *  hashDuel whenever the encounter tick is a multiple of it. */
export function runRematch(seed: number, hashEvery: number, cap = CAP_TICKS): RematchRun {
  const d = createDuel(CUTTER, seed), hashes: string[] = [], rounds: RematchRun['rounds'] = [];
  const sample = (): void => { if (hashEvery > 0 && d.interior.tick % hashEvery === 0) hashes.push(hashDuel(d)); };
  const play = (): void => {
    const pair = createScriptedPair(d.tactical.seed), t = createTelemetry(d);
    while (d.tactical.outcome === Outcome.Running && d.interior.tick - d.baseTick < cap) {
      const input = scriptedInput(pair, d);
      stepDuelTick(d, input); recordTick(t, d, input); sample();
    }
    rounds.push({ seed: d.tactical.seed, baseTick: d.baseTick, outcome: t.outcome, ticks: t.ticks });
  };
  try {
    play();
    const rematchTick = d.interior.tick;
    const [result] = stepDuelTick(d, { held: [], commands: [{ runId: LOCAL_DUEL_RUN, id: { player: 0, sequence: 1 }, requestedTick: rematchTick, command: { kind: 'rematch' } }] });
    if (result?.status !== 'applied' || d.round !== 1) throw Error(`seed ${seed}: the rematch on tick ${rematchTick} was ${result?.status}`);
    sample();
    play();
    return { seed, rematchTick, rounds, finalHash: hashDuel(d), hashes };
  } finally { disposeDuel(d); }
}
````

- [ ] **Step 3: The rematch golden joins the pinned set**

In `scripts/bless-golden.ts`, replace:

````ts
// `npm run bless`: the one command that regenerates every pinned artifact (engine refactor spec §7, R-0):
//   tests/golden/basic.json (the sector golden), tests/golden/duel-1.json (the duel golden) and the expectations of
//   tests/fixtures/determinism-v2.json. If ANY of them is stored at a version other than the current SIM_VERSION, a
````

with:

````ts
// `npm run bless`: the one command that regenerates every pinned artifact (engine refactor spec §7, R-0):
//   tests/golden/basic.json (the sector golden), tests/golden/duel-1.json (the duel golden), tests/golden/duel-rematch.json
//   (the rematch golden, H-2 spec §7: two rounds of one duel; the oracle's runs never rematch, so a bump re-blesses it
//   on the same proofs as duel-1.json) and the expectations of
//   tests/fixtures/determinism-v2.json. If ANY of them is stored at a version other than the current SIM_VERSION, a
````

In `scripts/bless-golden.ts`, replace:

````ts
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { DUEL_GOLDEN, DUEL_GOLDEN_EVERY, DUEL_GOLDEN_SEED, runDuel } from '../tests/helpers/scriptedDuel';

````

with:

````ts
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { DUEL_GOLDEN, DUEL_GOLDEN_EVERY, DUEL_GOLDEN_SEED, DUEL_REMATCH_GOLDEN, runDuel, runRematch } from '../tests/helpers/scriptedDuel';

````

In `scripts/bless-golden.ts`, replace:

````ts

const stored = [readStoredVersion(BASIC, basicVersionFromText), readStoredVersion(DUEL_GOLDEN, duelVersionFromText), existsSync(DETERMINISM_FIXTURE) ? storedFixtureVersion() : undefined];
// --fresh: create a missing pinned artifact from scratch (no bump proof can run without it); otherwise a missing one is refused.
const refusal = blessRefusal({ storedVersions: stored, currentVersion: SIM_VERSION, verify: verifyVersionOnly, duel: verifyDuelOracle, fresh: process.argv.includes('--fresh'), names: [BASIC, DUEL_GOLDEN, DETERMINISM_FIXTURE] });
if (refusal) { console.error(refusal); process.exit(1); }
````

with:

````ts

const stored = [readStoredVersion(BASIC, basicVersionFromText), readStoredVersion(DUEL_GOLDEN, duelVersionFromText), existsSync(DETERMINISM_FIXTURE) ? storedFixtureVersion() : undefined,
  readStoredVersion(DUEL_REMATCH_GOLDEN, duelVersionFromText)];
// --fresh: create a missing pinned artifact from scratch (no bump proof can run without it); otherwise a missing one is refused.
const refusal = blessRefusal({ storedVersions: stored, currentVersion: SIM_VERSION, verify: verifyVersionOnly, duel: verifyDuelOracle, fresh: process.argv.includes('--fresh'), names: [BASIC, DUEL_GOLDEN, DETERMINISM_FIXTURE, DUEL_REMATCH_GOLDEN] });
if (refusal) { console.error(refusal); process.exit(1); }
````

In `scripts/bless-golden.ts`, replace:

````ts
  // The determinism fixture's expectations (version-only checked on a bump).
  { path: DETERMINISM_FIXTURE, stage: () => stageDeterminismFixture(contentDigest) }
], (path, content) => { mkdirSync('tests/golden', { recursive: true }); writeFileSync(path, content); });
````

with:

````ts
  // The determinism fixture's expectations (version-only checked on a bump).
  { path: DETERMINISM_FIXTURE, stage: () => stageDeterminismFixture(contentDigest) },
  // The rematch golden (H-2 spec §7): the duel golden's seed and cadence, one rematch, the second round to its outcome.
  { path: DUEL_REMATCH_GOLDEN, stage() {
    const r = runRematch(DUEL_GOLDEN_SEED, DUEL_GOLDEN_EVERY);
    return { content: JSON.stringify({ simVersion: SIM_VERSION, seed: r.seed, every: DUEL_GOLDEN_EVERY, rematchTick: r.rematchTick, rounds: r.rounds, finalHash: r.finalHash, hashes: r.hashes }, null, 2) + '\n',
      message: `blessed ${DUEL_REMATCH_GOLDEN}: ${r.hashes.length} checkpoints, rematch on tick ${r.rematchTick}, rounds ${r.rounds.map((x) => `${x.ticks} ticks outcome ${x.outcome}`).join(' then ')}, final ${r.finalHash}` };
  } }
], (path, content) => { mkdirSync('tests/golden', { recursive: true }); writeFileSync(path, content); });
````

- [ ] **Step 4: Bless with `--fresh`, which creates only the missing artifact**

Run: `npm run bless`
Expected: exit 1, `refusing to bless: pinned artifact(s) missing (tests/golden/duel-rematch.json), so neither bump proof can run. Restore them, or pass --fresh to create the set from scratch`.

Run: `npm run bless -- --fresh`
Expected, exit 0:
```
blessed tests/golden/basic.json: 120 checkpoints, final 128b3c62
blessed tests/golden/duel-1.json: 26 checkpoints, 15772 ticks, outcome 1, final 0e111f7a
blessed tests/fixtures/determinism-v2.json: sim version 39, 1800 samples and 404 boundaries re-executed
blessed tests/golden/duel-rematch.json: 55 checkpoints, rematch on tick 15772, rounds 15772 ticks outcome 1 then 17272 ticks outcome 1, final 5dab688c
```

Run: `git status --short tests/golden tests/fixtures`
Expected: exactly `?? tests/golden/duel-rematch.json`: the other three were rewritten byte for byte.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/duelRematchGolden.test.ts tests/blessGuard.test.ts tests/duelGolden.test.ts`
Expected: PASS, 16 tests in 3 files (1, 11 and 4).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit (the message names what `--fresh` created)**

```
git add scripts/bless-golden.ts tests/helpers/scriptedDuel.ts tests/duelRematchGolden.test.ts tests/golden/duel-rematch.json tests/blessGuard.test.ts
git commit -m "H-2a-i task 4: the rematch golden (tests/golden/duel-rematch.json) joins the pinned set; blessed with --fresh, which created only that artifact (basic.json, duel-1.json and determinism-v2.json unchanged)"
```

---

### Task 5: The gates

**Files:** none (evidence under `out/`).

- [ ] **Step 1: The full suite**

Run: `npm run build`
Expected: exit 0.

Run: `npm test`
Expected: PASS, 240 test files, 3403 tests (known load flakes: rerun alone, see Global Constraints).

- [ ] **Step 2: Determinism**

Run: `npm run test:determinism -- --output-dir=out/h2a-determinism`
Expected: three PASS lines (Node, Electron, Firefox), each `1800 ... samples` (Node also `404 result/event boundaries`), exit 0.

- [ ] **Step 3: The host runtime and the online application (the sector, unchanged)**

Run: `npm run test:host-runtime`
Expected: `ACTUAL host runtime PASS: Electron 37.10.3; 15 checks; 8/8 utility exits; ...`, exit 0.

Run: `npm run test:online-app-runtime -- --report-path=out/h2a-online-app/online-app.json`
Expected: `ACTUAL TWO-PROCESS ONLINE APPLICATION PASS`, exit 0.

## After H-2a-i

- H-2a-ii (`2026-11-16-helm-h2a-ii-online-stack.md`) builds the generic stream client, the duel's remote client, the producer manager with the away steward and the peer-lost pause, and the two-client loopback proof on these contracts.
- The merge evidence for this part: `out/h2a-profile/before.json` and `after.json`, the two proof lines of Task 3 Step 12, the bless lines of Task 3 Step 13 and Task 4 Step 4, and the gate lines of Task 5.
