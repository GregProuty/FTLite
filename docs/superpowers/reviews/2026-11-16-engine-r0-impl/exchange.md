# Codex review exchange: engine-r0-impl

Subject: `scripts/bless-golden.ts scripts/determinism/bless.ts scripts/determinism/rebless-version.ts scripts/golden/baselineCheck.ts scripts/golden/blessGuard.ts scripts/golden/canonical-trace.ts scripts/golden/versionOnly.ts src/renderer/src/sim/canonicalFields.ts src/renderer/src/sim/duel/hash.ts src/renderer/src/sim/tuning.ts tests/blessGuard.test.ts tests/duelGolden.test.ts tests/fixtures/determinism-v2.json tests/golden.test.ts tests/golden/basic.json tests/golden/duel-1.json tests/netParity.test.ts tests/simStateCompleteness.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing fbdb3bb, effort high, 159 s, 510104 in / 434176 cached / 7580 out)

Verdict: changes requested

## Findings

### [P0] R1-F1 A valid basic.json can bypass the version guard
If basic.json has more than 4,096 bytes before its stored simVersion, basicVersion returns undefined. With the other two artifacts already at the current version, bless proceeds without the per-tick proof. · plan L42; scripts/bless-golden.ts:L33-L40; scripts/golden/blessGuard.ts:L18-L20 · A JSON file with leading whitespace remains valid. An in-memory probe with 4,096 leading spaces, stored version 36, and the other versions at 37 produced no detected stale version. The guard can then overwrite the older golden without proof. · Read and validate the structural simVersion from the complete basic.json. Treat an existing file whose version cannot be read as an error, and test the padded-file case.

### [P1] R1-F2 The retired baseline still has an overwrite command
The retained capture script can rewrite net1a-baseline.json, contrary to the decision that the historical oracle is never written. · plan L42-L43; scripts/capture-net1a-baseline.ts:L1-L6 · An explicit invocation overwrites the pinned baseline even though R-0 retires it to a read-only historical check. · Remove or disable the capture script's write path while leaving the pinned baseline untouched.

### [P2] R1-F3 The same-mode proof has no automated failure test
No test exercises verifyUnchanged or the same CLI branch, despite R-1 depending on their failure behavior. · plan L44; scripts/golden/versionOnly.ts:L98-L104; scripts/golden/canonical-trace.ts:L26-L29; tests/blessGuard.test.ts:L6-L49 · The shared comparison and exit path look correct by inspection, but a later change could make the R-1 proof report success on a changed tick without a test catching it. · Add a small test using a synthetic baseline and injected trace: change one tick hash and assert failure. Cover missing baseline and moved version in the same test group.

## Verified
- The three artifacts are staged before any write, matching the plan's staging guarantee: plan L42; scripts/bless-golden.ts:L43-L57; scripts/golden/blessGuard.ts:L27-L31; tests/blessGuard.test.ts:L35-L48.
- A stale version in any detected artifact invokes the per-tick guard; an absent artifact is ignored as specified by the implemented decision: scripts/golden/blessGuard.ts:L16-L22; tests/blessGuard.test.ts:L21-L27. A missing determinism fixture fails during staging: scripts/determinism/bless.ts:L33-L34.
- On a version bump, fixture staging checks sample fields and positions apart from the version and hash, plus result/event boundaries: plan L42; scripts/determinism/bless.ts:L43-L53.
- The same mode uses the same differences function as check, rejects a missing baseline and a moved version, and exits 1 on failure: plan L44; scripts/golden/versionOnly.ts:L74-L104; scripts/golden/canonical-trace.ts:L22-L29.
- The duel hash includes the full interior canonical flatten, and its test mutates fire, oxygen, and power: plan L45; src/renderer/src/sim/duel/hash.ts:L12-L21; tests/duelGolden.test.ts:L42-L49.
- The default tests inspected do not read net1a-baseline.json; package.json still routes bless to the updated script. Historical docs/gates.md text at L551 describes the pinned baseline and contains no rebless-version reference: tests/netParity.test.ts:L8-L10; tests/golden.test.ts:L10-L19; package.json:L25.

## Not verified
- Generated JSON was skipped as requested. The full suite and cross-engine determinism commands were not rerun under the read-only review constraint.
- The run directory could not be read from the worktree because its tracked files appear deleted there; HEAD versions of brief.md and run.meta were read with git show. No review exchange was modified.

---

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

---

# Round 2 (delta, reviewing 7094119, effort medium, 61 s, 251904 in / 187264 cached / 2668 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 The canonical hash test never changes the version value
The new test says it verifies that canonical hashing ignores the version, but it only changes crew health. It would still pass if the version-zeroing line were removed. · tests/versionOnly.test.ts:L66-L74; scripts/golden/versionOnly.ts:L37-L40; plan L45 · The version-only proof depends on excluding SIM_VERSION from the per-tick hash. This test cannot catch a regression in that behavior. · Test two canonical inputs that differ only at flatten index 0 and assert equal hashes; retain the health-field assertion to prove other changes are detected.

## Prior findings
- R1-F1: resolved — The complete basic.json is parsed and replay.init.simVersion is validated; an unreadable version throws. The test covers a version beyond 4,096 bytes and missing versions. scripts/bless-golden.ts:L33; scripts/golden/storedVersion.ts:L14-L24; tests/versionOnly.test.ts:L8-L22.
- R1-F2: resolved — The capture script has no write path and exits 1. scripts/capture-net1a-baseline.ts:L1-L4.
- R1-F3: resolved — Injected-trace tests cover a changed tick, missing baseline, moved version, and missing or extra runs; the same CLI exits 1 when the shared check fails. tests/versionOnly.test.ts:L28-L53; scripts/golden/canonical-trace.ts:L26-L29.

## Verified
- The version readers feed all three stored versions to the guard, and a detected stale version invokes the per-tick check. scripts/bless-golden.ts:L33-L35; scripts/golden/blessGuard.ts:L15-L21; plan L42.
- The baseline capture command is disabled, and the new R-0 documentation describes the opt-in check and trace modes. scripts/capture-net1a-baseline.ts:L1-L4; docs/gates.md:L731-L735.

## Not verified
- Generated JSON was skipped as requested. Tests and cross-engine determinism were not rerun in this read-only review.
- The run directory is absent from the worktree; its tracked exchange and ledger were read from HEAD. No review file was modified.

---

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

---

