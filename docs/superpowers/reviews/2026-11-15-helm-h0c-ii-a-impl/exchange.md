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

