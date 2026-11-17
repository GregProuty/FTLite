# Round 1 response (fix in 3d01165)

Reviewed `round-1.json` against the branch at `9214370`. 1 accepted, 0 rejected, 0 deferred.

## R1-F1 [P3]: The same-key, new-layout-object branch is never exercised

Confirmed: state.ts:L114 keeps the layout by reference, so the second draw returned at the identity check. The rebuild test now also draws `stateOf({ ...CUTTER })`, a new layout object with the same key, and expects the same sprite and no destroy. propLayer.test.ts passes (5/5) and tsc is clean.

## Also changed

- (nothing)

## Files changed

- tests/propLayer.test.ts

<!-- end -->
