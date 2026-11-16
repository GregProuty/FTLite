# Round 1 response (implementation revised, 87b2360)

Reviewed `round-1.json` against the code; a parallel Opus whole-branch review raised overlapping points, folded in here. 3 accepted (1 P0, 1 P1, 1 P2), 0 rejected, 0 deferred.

## R1-F1 [P0]: A valid basic.json can bypass the version guard

Accepted. Today the first `simVersion` sits about 200 bytes into `basic.json` (`replay.init`), so the current file does not bypass. But the 4,096-byte read was fragile: a reshaped file would silently drop `basic.json` from the check. The fix:
- A new `scripts/golden/storedVersion.ts` parses the whole file and reads the structural version.
- An existing file whose version cannot be read throws. Only a missing file counts as absent.
- `duelVersion` is hardened the same way.
- Tests cover a version beyond 4,096 bytes and a file with no version.

## R1-F2 [P1]: The retired baseline still has an overwrite command

Accepted. `scripts/capture-net1a-baseline.ts` now prints that the baseline is retired, points to `npm run bless -- --baseline`, and exits 1 before doing any work.

## R1-F3 [P2]: The same-mode proof has no automated failure test

Accepted. R-1a's proof depends on it. The comparison in `versionOnly.ts` now takes injected traces. The new `tests/versionOnly.test.ts` checks that:
- identical traces pass;
- a changed golden tick fails and names that tick;
- a missing, extra or shorter determinism run fails;
- a moved version is refused;
- a missing baseline fails;
- `canonical()` changes when one crew field is mutated.

## Also changed

From the Opus final review:
- The canonical-trace baseline records its repo root and HEAD. It is stored under a path keyed by a hash of the repo root, so worktrees and sessions sharing the temp folder never collide. `same` and `check` refuse a baseline from another root.
- The dead `versionOnly` option of `blessRefusal` is removed.
- `docs/gates.md` documents `npm run bless` (all three artifacts behind the guard), `npm run bless -- --baseline`, and `canonical-trace.ts baseline`, `same` and `check`.

Deferred from that review, out of R-0's scope: on a bump, the duel golden is not covered by a per-tick gameplay proof, a gap that predates R-0. It must land before the next duel-affecting version bump (R-2).

Verified:
- `npm run typecheck`;
- 39 tests in the 6 touched or guard files;
- `npm run bless -- --baseline` passes at SIM 37;
- `canonical-trace baseline` then `same` passes;
- the full verify (typecheck, build, `npm test`): 3,088 of 3,089 pass; the one failure is the known worktree-only `tests/onlineAppRuntime.test.ts` flake.

## Files changed

- docs/gates.md
- scripts/bless-golden.ts
- scripts/capture-net1a-baseline.ts
- scripts/golden/blessGuard.ts
- scripts/golden/storedVersion.ts
- scripts/golden/versionOnly.ts
- tests/blessGuard.test.ts
- tests/versionOnly.test.ts

<!-- end -->
