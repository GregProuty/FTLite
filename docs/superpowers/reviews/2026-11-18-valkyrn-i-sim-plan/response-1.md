# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `77064aa0`. 4 accepted, 0 rejected, 0 deferred; no prior IDs.

## R1-F1 [P1]: A same-version bless rewrites tests/golden/basic.json (its embedded content digest moves), so the git-status expectations in Task 5 Step 10 and Task 8 Step 2 cannot hold

Confirmed. `.worktrees/sci-2/scripts/bless-golden.ts:45-48` always restages basic.json from `scriptedSemanticReplay(..., contentDigest)`, `build/contentDigest.ts:12-16` walks `src/renderer/src/sim` and `authority`, and basic.json embeds `contentDigest`. `canonical-trace.ts golden` (`scripts/golden/canonical-trace.ts:30-44`) compares against the basic.json copy that `baseline` records (Task 2 Step 1) and allows only version, digest and hash leaves. Changed: Task 5 Files and Step 10 now expect `M tests/golden/basic.json`, add a `canonical-trace.ts golden` check (`0 outside version, digest and hashes`), and add basic.json to the Task 5 commit. Task 8 Files, Interfaces, the Step 2 heading and Step 2 now expect basic.json alone to move, prove it with `canonical-trace.ts golden`, restrict the `<t1>` diff-stat to determinism-v2.json, and commit the digest-only re-bless. Step 5's report names that commit.

## R1-F2 [P1]: Part ii replaces the whole of fleet.ts and drops Part i's HULL_IDS, which schema.ts imports

Confirmed. Part ii's plan L667-699 replaces `fleet.ts` wholesale with no `HULL_IDS`, and this plan's Task 3 Step 4 has `schema.ts` import it for `z.enum(HULL_IDS)`. The real fix belongs in Part ii's fleet.ts block, which this run may not edit. It is reported to the coordinator as a cross-plan item. Changed in this plan: Task 3's Interfaces line and Step 4 state that `schema.ts` imports `HULL_IDS` at load and that any later whole-file rewrite of `fleet.ts` must keep the export. Task 8 Step 5's handover tells Part ii that its Task 3 Step 5 replacement must keep it.

## R1-F3 [P2]: The `added` oracle mode never checks the declared-added fields, so it cannot show that the Hound's gun state stays zero

Confirmed. `.worktrees/sci-2/scripts/golden/duelOracle.ts:179-183` only skips added names, and `recordRun` (L243-258) digests `plan.build` in the baseline's schema, so the new fields are never read. Changed in Task 5 Step 7: `Migration` gains an optional `frozen`. `ADDITIONS[53]` sets it. `recordRun` collects the offsets of every current field that matches `added` (the same offset walk as `aliasPlan`, L143-145) and flags any that differs from its first recorded value. Its returned `problems` carry one line per moved field, so `judgeDuelOracle` fails the run. A new test in `describe('the per-tick record')` freezes `space.ships.0.x`, which moves on tick 265 inside SHORT. With `frozen` it fails, and with `frozen: false` it passes. Decision 1 and the ADDITIONS doc comment describe the check, and the Task 5 Files line lists it.

## R1-F4 [P3]: Decision 16 keeps DuelInit.playerCount at 2..4, where spec §4.4 asks for 1..4 in single player; the deviation is not justified

Confirmed. `DuelInit` is used only in `.worktrees/sci-2/src/renderer/src/authority/duelCheckpoint.ts` and `duelRules.ts`; nothing under `src/renderer/src/app` builds one. Decision 16 now says the spec's single-player widening is moot, because the local runtime calls `createDuel` directly. The one `DuelInit` schema stays 2..4.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-valkyrn-i-sim.md

<!-- end -->
