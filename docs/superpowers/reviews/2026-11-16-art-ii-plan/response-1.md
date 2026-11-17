# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `3bffb3a`. 2 accepted, 0 rejected, 0 deferred.

## R1-F1 [P2]: A downed player's bubble floats above the lying LimeZu body

Confirmed: calloutModel.ts:L31 always shows Help! for a downed player, and the plan's lift was chosen once per layer. Task 2's callouts.ts edit now picks the lift per player with `liftFor(state, pid)`. A conscious player gets CALLOUT_LIFT_LIMEZU (64); a downed or dead one gets the new CALLOUT_LIFT_DOWN_LIMEZU (16 + 10 = 26); Puny keeps CALLOUT_LIFT_PUNY. It reads `Life.state[state.crew[pid]]`, the same lookup bubbles() uses. The constant, the interface list, the test and Decision 6 are updated. These edits were checked against calloutModel.ts and the crewSprites.ts imports but were not run in the prototype.

## R1-F2 [P3]: The git status checks can be tripped by untracked review files

Confirmed. Task 6 now runs `git diff --exit-code -- src/renderer/src/render/palette.json art public/assets/manifest.json && echo CLEAN` and expects `CLEAN`, noting that PNG determinism is Task 1's md5 check. Step 0.1 now allows untracked files under docs/superpowers/reviews/.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-art-ii-bought-art.md

<!-- end -->
