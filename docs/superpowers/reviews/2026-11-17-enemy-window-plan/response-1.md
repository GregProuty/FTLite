# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `bd20a9f8`. 3 accepted, 0 rejected, 0 deferred.

## R1-F1 [P3]: Screenshot harness reports a failed page as an 'ok' shot

Confirmed (plan L2169, L2206, L2246). The page's catch now calls console.error and sets `window.shotFailed`; shot.cjs checks the flag after the ready loop and exits 1.

## R1-F2 [P3]: The single player keyboard intercept wiring is untested

Confirmed (tests/duelModeDispose.test.ts L8-L10 drops the options). Task 7 now makes the mock record the options and adds a test that a shown window's intercept takes Escape and closes the window.

## R1-F3 [P3]: `?mode=duel` gets the window, against the wording of spec §6.5

Confirmed. The plan's resolved-ambiguities line now states this as a deviation, with the reason: `?mode=duel` is the same solo duel as Single player.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-17-enemy-ship-window.md

<!-- end -->
