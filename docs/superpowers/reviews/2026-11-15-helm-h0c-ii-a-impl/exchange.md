# Codex review exchange: helm-h0c-ii-a-impl

Subject: `scripts/bless-golden.ts scripts/determinism/rebless-version.ts scripts/duel-telemetry.ts scripts/golden/canonical-trace.ts src/renderer/src/sim/duel/hash.ts src/renderer/src/sim/duel/scripted.ts src/renderer/src/sim/duel/state.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/telemetry.ts src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tuning.ts tests/duel.test.ts tests/duelGates.test.ts tests/duelGolden.test.ts tests/duelReadout.test.ts tests/duelScripted.test.ts tests/duelTelemetry.test.ts tests/fixtures/determinism-v2.json tests/golden/basic.json tests/golden/duel-1.json tests/helpers/scriptedDuel.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing 6391787, effort high, 214 s, 736264 in / 659200 cached / 10375 out)

Verdict: changes requested

## Findings

### [P0] R1-F1 Re-bless does not enforce the per-tick check
The blessing and re-blessing commands can succeed without a successful canonical-trace check after the version bump. · plan L112-L115; scripts/golden/canonical-trace.ts:L75-L103; scripts/bless-golden.ts:L13-L20; scripts/determinism/rebless-version.ts:L23-L34 · If `check` is skipped, `golden` permits changed hashes and digests, while the fixture re-blesser compares sampled fields and boundaries. A gameplay change between samples can therefore be blessed in the wrong order. · Make the blessing and fixture re-bless paths require a successful per-tick comparison against the pre-bump baseline before either writes.

### [P1] R1-F2 The aggregate gate can mask a skipped seed test
When a per-seed test has not run, the aggregate test silently runs that seed without applying its weapon, cap, or planet-end assertions. · spec L106-L112; tests/duelGates.test.ts:L13-L29 · The suite can report a passing aggregate gate even though one seed's required per-seed checks were skipped. · Remove the fallback in the aggregate test and assert that results from all ten per-seed tests are present.

### [P1] R1-F3 Gate duels ignore rejected scripted commands
The ten-seed runner discards command results; admission is asserted only for seed 4 in a separate test. · spec L65; tests/helpers/scriptedDuel.ts:L34-L43; tests/duelScripted.test.ts:L73-L80; tests/duelGates.test.ts:L13-L20 · A seed-specific rejected command could leave all telemetry thresholds passing, concealing a violation of the scripted pair's command requirement. · Assert that every scripted command result is applied inside `runDuel`, so all gate seeds check admission.

## Verified
- The diff changes the planned hull and version constants and places `SIM_VERSION` first in the duel flatten; repair events are excluded from that hash. src/renderer/src/sim/tactical/tuning.ts:L39; src/renderer/src/sim/tuning.ts:L7; src/renderer/src/sim/duel/hash.ts:L11-L19
- Repair work and completion events preserve the existing repair rate and progress calculation. src/renderer/src/sim/duel/step.ts:L48-L62
- The gate lists seeds 1 through 10 and uses a 15-minute tick cap. tests/helpers/scriptedDuel.ts:L14-L19; tests/duelGates.test.ts:L13-L21
- The new guarded files use allowed Math methods and the pair draws from its own seeded RNG. src/renderer/src/sim/duel/scripted.ts:L5-L20; src/renderer/src/sim/duel/scripted.ts:L62-L65
- `git diff --check master...HEAD` passed.

## Not verified
- No test suite, typecheck, solo-duel boot, or H-1 screen check was run under the read-only review constraints.
- The requested 2,000-byte fixture spot checks could not complete because `head` failed in this environment; neither large fixture was read in full.
- The stated review ledger was absent from this checkout, so earlier review rounds and their execution evidence could not be checked.
- To assess the re-bless path, I also read tests/helpers/semanticReplay.ts:L53-L59 and scripts/determinism/fixture.ts:L42-L49, L81-L115. Other files outside the manifest were not inspected.

---

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

---

# Round 2 (delta, reviewing 51fe457, effort medium, 90 s, 361810 in / 326016 cached / 3917 out)

Verdict: changes requested

## Prior findings
- R1-F1: still open — The guard accepts a marker solely by SIM_VERSION (`scripts/golden/blessGuard.ts:L14-L18`, `L37-L39`). After a passing check, a gameplay change at the same version leaves that marker valid, so both blessing paths can write without checking the code they now run (`scripts/bless-golden.ts:L17-L25`; `scripts/determinism/rebless-version.ts:L17-L18`). Bind the marker to the checked inputs and baseline, or rerun the per-tick comparison immediately before writing.
- R1-F2: resolved — The aggregate test requires results for seeds 1–10 and no longer runs missing seeds (`tests/duelGates.test.ts:L22-L24`).
- R1-F3: resolved — The shared runner throws on every scripted command result other than applied (`tests/helpers/scriptedDuel.ts:L39-L45`).

## Verified
- A failing canonical-trace check clears the marker, and a passing check writes it (`scripts/golden/canonical-trace.ts:L76-L89`).
- The per-seed tests retain the weapon, cap, and planet-end assertions (`tests/duelGates.test.ts:L13-L21`).
- The duel step returns command results to the runner (`src/renderer/src/sim/duel/step.ts:L90-L116`, `L128`).

## Not verified
- The two large fixture diffs were not spot-checked: the requested `head -c 2000` command failed in this environment.
- No test suite was run; this was a read-only review, and the requested Jest-suite prohibition was observed.
- The review run directory is deleted in this worktree, so its files could not be inspected.

---

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

---

# Round 3 (delta, reviewing 2683c44, effort medium, 86 s, 322005 in / 291840 cached / 3450 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — Both version-bump write paths invoke the per-tick comparison before writing (scripts/bless-golden.ts:L18-L26; scripts/determinism/rebless-version.ts:L18-L38). The guard refuses a failed comparison (scripts/golden/blessGuard.ts:L13-L17).

## Verified
- The live check passed: 7,200 golden ticks and 108,000 fixture ticks across 19 runs matched from SIM_VERSION 35 to 36 (scripts/golden/versionOnly.ts:L37-L54, L73-L85).
- A missing or same-version baseline is refused, and differing ticks are reported (scripts/golden/versionOnly.ts:L73-L85).
- The touched code passes git diff --check.

## Not verified
- The two large fixture diffs were not spot-checked: the requested bash pipeline failed to start in this environment.
- The test suite was not rerun in this review.

---

# Round 3 response (no subject change)

Reviewed `round-3.json`. No new findings. Codex confirmed R1-F1 resolved. Verdict: ready.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

