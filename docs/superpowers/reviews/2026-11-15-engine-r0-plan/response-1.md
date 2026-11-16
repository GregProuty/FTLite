# Round 1 response (plan revised)

Reviewed `round-1.json`. 2 accepted (2 P0), 0 rejected, 0 deferred. Both were confirmed against the plan and the scripts.

## R1-F1 [P0]: A failed bless can bypass the version-only guard on retry

Confirmed: the guard was decided from `basic.json` alone (`blessGuard.ts:L11-L16`), and the goldens were written before the determinism fixture was validated. Now `npm run bless` computes and validates all three artifacts in memory and writes none unless all three are ready. It runs the per-tick `verifyVersionOnly()` if **any** pinned artifact's stored version differs from `SIM_VERSION`. New tests in `tests/blessGuard.test.ts` cover the mixed state (basic.json at 37, another artifact at 36) still requiring the guard, and a failure while staging the third artifact writing nothing. A manual check (only `duel-1.json` set back to 36) refused and wrote nothing.

## R1-F2 [P0]: The log cleanup can discard concurrent edits

Confirmed (`run.ts:L14-L15, L60-L64`). The determinism step now runs `npm run test:determinism -- --output-dir=out/r0-determinism` (`--output-dir` is the script's real flag, and `out/` is git-ignored). Every `git checkout` and `git restore` step is removed, and a new global constraint forbids checkout, restore, stash or clean. The run leaves `git status` unchanged.

## Also changed

- Expected output lines and the full-suite count were updated for master's newer commits. Re-verified by extracting the plan task by task into a fresh worktree: 15, 8, 8, 30 and 146 tests; full suite 3,081 passed. The only failure is `tests/onlineAppRuntime.test.ts`, which fails in any worktree outside the main checkout. The extracted tree is byte-identical to the prototype.

## Files changed

- docs/superpowers/plans/2026-11-16-engine-r0-guards.md

<!-- end -->
