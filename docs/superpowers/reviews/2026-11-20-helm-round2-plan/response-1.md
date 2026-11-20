# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `ad9a1447`. 6 accepted, 0 rejected, 0 deferred. No prior IDs (round 1).

## R1-F1 [P1]: Task 1's pre-flight cannot pass: the branch head is the plan commit, not 02b1ef81, and the tree has untracked review files

Confirmed. `git log` shows 187fc4fe and ad9a1447 on top of 02b1ef81, and the run dir has untracked round files. Task 1 Step 1 now checks that 02b1ef81 is an ancestor of HEAD, that `src`, `tests`, `scripts` and `package.json` do not differ from 02b1ef81, and that those paths are clean. It says the docs commits and untracked review files are expected. Step 5 defines `HR2_BASE` as the head at the start, whose code is 02b1ef81's.

## R1-F2 [P1]: Task 2's hash test loop does not typecheck: `d[key] = value` over keys of mixed type

Confirmed. A write through a key union of a `number` field and a `boolean` field is checked against their intersection, so it fails TS2322. `tests/` is in the typecheck. Task 2 keeps the numeric loop for `thrMille`, `gas` and `gasIdle`, and gives `thrCut` its own set, check and reset line after the loop.

## R1-F3 [P2]: The kind (a) lists miss two tests the helm changes break or silently shift

Confirmed both. `tests/duelThrottle.test.ts:57` pins `helmModule.commands` to `['throttle', 'heading']`. `tests/crewOfFourWire.test.ts:64` hard-codes the helm module's `+ 3`. Task 3's duelThrottle edit now also adds `'throttleCut'` to line 57. Task 2 now edits crewOfFourWire line 64 to `+ 6` with a new comment, lists it under Files, runs it in Step 7, and stages it.

## R1-F4 [P2]: Task 14 Step 7's DUEL_TEST_SEED search repeats a range the smoke's own history says was empty

Confirmed against `scripts/network/duel-app-smoke.ts:L22-24`. The search now covers seeds 1..4000 with LIMIT 5000, the range and limit of the last re-pick that found 423. BLOCKED is reported only if that whole range is empty.

## R1-F5 [P3]: The refill test follows §3.3's rule, while §8's '240 ticks later' wording is one tick off; record which wins

Confirmed. The test follows §3.3's rule. Decision 19 is new: it records that "full 240 ticks after that" counts the 240 refill ticks, the first on index 29 and the last on index 268.

## R1-F6 [P3]: helmThrottle's clamp test cannot fail on 'the bar coming back does not raise it'

Confirmed against `sim/duel/power.ts:L72-75`: `clampToCapacity` lowers the bars to 2, so clearing the room damage leaves cap 500. The test now calls `engines(d, 4)` after the repair, so the cap is back at 1000 while the test checks the throttle stays at 500. The comment is corrected.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-20-helm-round2.md

<!-- end -->
