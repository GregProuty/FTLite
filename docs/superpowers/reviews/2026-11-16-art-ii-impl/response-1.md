# Round 1 response (fixes in 95e275e)

Reviewed `round-1.json` against the branch at `133bf9f`. 3 accepted, 0 rejected, 0 deferred. After the fix: `npx tsc -b` is clean, the full suite passes (3532 tests in 251 files), and `art:palette` + `art:import` + `git diff --exit-code` prints CLEAN.

## R1-F1 [P3]: The bible's palette text no longer matches

Confirmed: ROLE.floor is #bad2e0 and the electric ramp has no violet. The bible now says the procedural floor role stays light and the bought Maru plating is what makes floors dark. The fire, plasma, electric and vent rows describe the actual palette.json steps.

## R1-F2 [P3]: liftFor has no test

Confirmed. crewArt.test.ts now drives createCalloutLayer with and without crewArt, for a conscious and a downed player, and checks each bubble against bubbleAnchor with the matching lift. BitmapText is mocked in that file, as hudSlots.test.ts does, because node cannot measure text.

## R1-F3 [P3]: The palette builder has no bounds check

Confirmed against importCore.ts:L134. countColours now throws on a rectangle outside its pack, mapRoles rejects an index override past the ramp's length, and tidyRamp throws on an empty ramp. A test covers the out-of-bounds frame using a temp-dir PNG.

## Also changed

- (nothing)

## Files changed

- docs/art/bible.md
- tests/crewArt.test.ts
- scripts/art/buildPalette.ts
- tests/buildPalette.test.ts

<!-- end -->
