# Round 2 response (implementation revised, 182d1f5)

Reviewed `round-2.json`. Codex confirmed R1-F1 to R1-F3 resolved and raised one new finding. 1 accepted (P1), 0 rejected, 0 deferred.

## R2-F1 [P1]: The canonical hash test never changes the version value

Confirmed: the test only changed crew health, so it would still pass with the version-zeroing line removed. The fix:
- `canonicalValues(values)` is now split out of `canonical(state)`, in `scripts/golden/versionOnly.ts`.
- A new test hashes a fresh state's flattened values, then the same values with index 0 bumped (equal hashes), then with index 1 bumped (different hashes).
- The health-field test stays.
- Mutation check: with `v[0] = 0` removed, the new test fails (1 failed, 9 passed). With the line restored, all 10 pass.

`npm run typecheck` is clean. This change is test-only plus a pure extraction, so the full suite was not re-run.

## Also changed

- (nothing)

## Files changed

- scripts/golden/versionOnly.ts
- tests/versionOnly.test.ts

<!-- end -->
