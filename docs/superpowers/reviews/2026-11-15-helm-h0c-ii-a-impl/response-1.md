# Round 1 response (code fixed)

Reviewed `round-1.json` against the branch. 3 accepted (1 P0, 2 P1), 0 rejected, 0 deferred.

## R1-F1 [P0]: Re-bless does not enforce the per-tick check

Confirmed: `bless-golden.ts` and `rebless-version.ts` could write without a passing `check` after the bump. A new shared helper, `scripts/golden/blessGuard.ts`, enforces it:
- `canonical-trace check` clears a verified marker on entry and writes it only on a pass, recording the current `SIM_VERSION`.
- `bless-golden.ts` refuses a version-bump bless (stored golden version different from `SIM_VERSION`) unless the marker matches `SIM_VERSION`. A same-version bless, for a deliberate gameplay change, is unaffected, so `npm run bless` keeps its normal use.
- `rebless-version.ts` always requires the marker, since it is version-only by definition.

`tests/blessGuard.test.ts` covers the decision function: a bump without a marker refuses, a matching marker allows, a stale marker refuses, and the same version needs no marker. Disabling the marker check made 3 of the 5 tests fail.

## R1-F2 [P1]: The aggregate gate can mask a skipped seed test

Confirmed (`tests/duelGates.test.ts:L13-L29`). The cross-seed test now asserts that the recorded seeds are exactly 1 to 10, and it no longer recomputes a missing seed.

## R1-F3 [P1]: Gate duels ignore rejected scripted commands

Confirmed. `runDuel` now throws, with the seed, tick, command and reason, on any scripted command whose result is not `applied`, so all ten gate seeds check admission. All ten pass with the same outcomes (7 wins, 3 losses, median 251.2 s): no scripted command was being rejected. `scripted.ts` and the duel golden are unchanged. Temporarily inverting the check made seed 1 fail, which confirms it runs.

## Also changed

- `npm run typecheck` is clean and `npm test` passes 1,975 tests.

## Files changed

- scripts/golden/blessGuard.ts
- scripts/golden/canonical-trace.ts
- scripts/bless-golden.ts
- scripts/determinism/rebless-version.ts
- tests/blessGuard.test.ts
- tests/duelGates.test.ts
- tests/helpers/scriptedDuel.ts

<!-- end -->
