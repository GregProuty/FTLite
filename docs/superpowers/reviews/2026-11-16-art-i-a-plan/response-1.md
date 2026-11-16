# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `3b8069a`. 5 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Two reported deviations are not stated in the plan

Confirmed. effects.ts:L84 keeps `p.rotation = ventRotation(d, s)`, projectiles.ts:L126 rounds the shake to whole internal pixels, and no Decision mentioned either. Decision 18 now states (f), the shake, and (g), the vent puff's quarter-turn rotation, as left for Art-i-b. The bible's pixel rule now allows quarter turns and names the vent puff.

## R1-F2 [P2]: The bible drops "dark" from the value hierarchy

Confirmed (spec L25 against plan L338). The bible keeps "calm, dark mid-tones" and notes that the placeholder floor is lighter on purpose. Decision 19 records the same.

## R1-F3 [P2]: Step 0 skips the signalling junction and calls the failure a flake

Confirmed against the recorded finding (memory worktree-signalling-junction, 2026-11-16): `.worktrees/` checkouts lack services/signalling/node_modules. Step 0.1 now creates that junction and says to remove it before `git worktree remove`. Step 0.3 and Task 7 now expect 0 failures and say to stop on any. The "1 failed" and "2 files" counts are reconciled.

## R1-F4 [P3]: The tileLayer rebuild assertion compares the array with itself

Confirmed: plan L1368 kept the live `children` array. The test now copies it and records `n` before `layer.build`. The always-true frame check is replaced by a ≤ 32 check on the width and height.

## R1-F5 [P3]: No guard enforces that pngjs and scripts/ never reach the renderer

Confirmed: artGuards walked only the RNG imports. A new describe block checks every `.ts` file under render/ and app/ for `pngjs` or `scripts/` imports. The Task 5, Task 7 and prototype-table counts are updated to +190; the new guard is marked as not prototype-run.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-art-i-a-pipeline.md

<!-- end -->
