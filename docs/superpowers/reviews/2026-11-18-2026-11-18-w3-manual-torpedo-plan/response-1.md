# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at the brief commit. 5 accepted, 0 rejected, 0 deferred.

## R1-F1 [P2]: The Weapons right-button heading ignores last frame's pick-up, so a right click that cancels a picked-up weapon also re-aims the MANUAL torpedo

Confirmed against scene.ts:162 and :248-253. The Flight seat already counts `lastAimed`. Task 5 Step 5's block now starts with `lastAimed === null &&`. A new scene test picks up the laser while a MANUAL torpedo flies, cancels it with a right press, and expects `takeTorpHeading()` to be null. Decision 8 is updated.

## R1-F2 [P2]: Task 8 Step 1's expected oracle line names <F'> = F + 4 fields, but the script prints the baseline's count; the expected arrows are '->' where the scripts print '→'

Confirmed against duelOracle.ts:386. Task 8 Step 1 now expects Task 1's `<F>`, the baseline's own count, and says why. The arrows in Task 1 Steps 4-5 and Task 8 Step 1 are now `→`.

## R1-F3 [P3]: The card says STEER A/D while A/D cannot steer (the 20-tick boost and the 2 s coast)

Confirmed. The card now shows STEER A/D only while the torpedo can turn (`age > boostTicks && age <= fuelTicks`), FLYING during the boost, and COASTING after the fuel. `torpSteer` and `torpCoast` replace `torpFlyingManual` in the Global Constraints, Task 7's code and tests, Decision 11 and the self-review.

## R1-F4 [P3]: An admitted MANUAL launch is silently skipped when the stored rock target breaks the same tick

Confirmed against weapons.ts:286-310. Task 2 Step 5(d) now gates the rock-broke skip on AUTO only (`s.torpManual || !(…)`), so AUTO is unchanged. A new test shows a MANUAL launch going out on the tick its stored rock breaks, while AUTO still skips.

## R1-F5 [P3]: Task 8 Step 3's 'gates test unchanged' diff is vacuous if the work is done on master

Confirmed. The Global Constraints now name the branch `w3-manual-torpedo` (from master 92733195), Task 1 Step 1 checks it, and Task 8 Step 3 diffs against the fixed base `92733195`.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md

<!-- end -->
