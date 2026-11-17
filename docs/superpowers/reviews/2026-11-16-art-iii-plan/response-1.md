# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `9186470`. 4 accepted, 0 rejected, 0 deferred (all P3).

## R1-F1 [P3]: The determinism check reads the cache

Confirmed (plan L360-L391 one-entry cache). The test now clones the slots, evicts the cache with another ship's state, then recomputes and compares.

## R1-F2 [P3]: Starter slots are claimed to be pinned

Confirmed. Decision 5 now says the Cutter's and Skiff's slots are pinned exactly and the starter's are as computed, with only their counts tested.

## R1-F3 [P3]: The packs test decodes every pack twice

Confirmed (buildPalette.ts L37-L41, L158-L163). The reader is now memoised so each pack is decoded once, and the test gets a 30 s timeout.

## R1-F4 [P3]: propKey is rebuilt every frame

Confirmed. draw now returns early when state.layout is the same object it last drew. The rebuild test still holds, since stateOf(CUTTER) passes the same layout object and stateOf(SKIFF) a different one.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-17-art-iii-set-dressing.md

<!-- end -->
