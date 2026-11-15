# Round 2 response (code fixed)

Reviewed `round-2.json`. No new findings. Codex confirmed R1-F2 and R1-F3 resolved, and re-raised R1-F1 correctly. Fixed again; 0 rejected, 0 deferred.

## R1-F1 [P0]: Re-bless does not enforce the per-tick check (still open, fixed again)

Confirmed: the marker was accepted solely by `SIM_VERSION` (`blessGuard.ts:L14-L18`), so a gameplay change made at the same version after a passing check could still bless. The marker is gone. The new `scripts/golden/versionOnly.ts` exposes `verifyVersionOnly()`, which re-traces the current code at every tick (version zeroed) and compares it against the pre-bump baseline. It is not ok when there is no baseline, when the baseline is already at the current `SIM_VERSION`, or when any tick differs. `bless-golden.ts` calls it immediately before writing for a version-bump bless (same-version blesses are unaffected), and `rebless-version.ts` always calls it. `tests/blessGuard.test.ts` injects the comparison result, and 3 of its 5 tests fail if the result is ignored. A real `check` against the existing baseline reports identical, 35 → 36, over 115,200 ticks.

## Also changed

- `canonical-trace.ts` is now only the CLI. `npm run typecheck` is clean and `npm test` passes 1,975 tests.

## Files changed

- scripts/golden/versionOnly.ts
- scripts/golden/canonical-trace.ts
- scripts/golden/blessGuard.ts
- scripts/bless-golden.ts
- scripts/determinism/rebless-version.ts
- tests/blessGuard.test.ts

<!-- end -->
