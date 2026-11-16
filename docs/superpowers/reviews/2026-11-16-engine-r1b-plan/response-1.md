# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan, the code and the prerequisite plans. 5 accepted (1 P0, 4 P1), 0 rejected, 0 deferred.

## R1-F1 [P0]: Task 1 changes the duel golden's canonical values

The P0 came from comparing against master instead of the prerequisite. R-1b runs after R-0, which merges `hash-completeness`. On that branch `flattenDuel` is already `[SIM_VERSION, ...tactical, present, ...repair, ...flatten(interior)]` (`git show hash-completeness:src/renderer/src/sim/duel/hash.ts`), and Task 1 keeps that sequence exactly. The plan did not say so. The Decisions and Task 1 now state that the duel golden baseline is post-R-0's `flattenDuel`. Step 0 runs R-0's full-interior duel golden test and stops if it is absent. The duel golden test remains the proof.

## R1-F2 [P1]: Snapshot validation misses tactical writer constraints

Confirmed. `validateTacticalValues` now checks, before anything is allocated:
- every tactical field's bounds and slot invariants: headings, integer counters, missile presence and empty-slot zeros, room levels 0 to 2, shields, magazine, hunter enums, outcome and tick equality;
- presence and repair.

Two new tests: 19 rehashed invalid values are each rejected, and every state reached by the scripted duels of seeds 1, 4 and 7 (sampled every 30 ticks) is accepted.

## R1-F3 [P1]: The utility test bypasses the registered utility

Confirmed. The new `src/utility/authorityModes.ts` is the registry `authorityHost.ts` builds from. The test drives it through `createUtilityHost`:
- duel initialize, start, 90 ticks, capture-checkpoint, restore;
- a comparison of values, hash and mode memory.

It also checks that the entry point passes that registry, and runs a sector utility. Net-3's `test:host-runtime` passed with the real utility built.

## R1-F4 [P1]: The continuation proof does not establish its checkpoint conditions

Confirmed. The split is now tick 5,156: the first tick from 5,000 on with a missile in flight, a damaged crew room and a repair in progress. The test asserts all three, then runs 5,156 + 3,676 ticks and matches both the per-tick hashes and the end summary.

## R1-F5 [P1]: The module migration leaves tactical cloning manual

Confirmed. `cloneTactical` is now derived from the space module's fields: a one-line wrapper over `cloneTacticalFromModule`. Its existing tests pass unchanged. A new check changes every field of a clone and confirms the original is untouched.

## Also changed

- Test counts. Re-verified by running R-0, R-1a and R-1b in a fresh worktree: R-1b's tasks run 170, 129, 234 and 158 tests, with a full suite of 3,125.

## Files changed

- docs/superpowers/plans/2026-11-16-engine-r1b-duel-mode.md

<!-- end -->
