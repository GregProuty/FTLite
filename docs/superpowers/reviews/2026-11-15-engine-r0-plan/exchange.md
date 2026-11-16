# Codex review exchange: engine-r0-plan

Subject: `docs/superpowers/plans/2026-11-16-engine-r0-guards.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 3f6a38b, effort high, 200 s, 735993 in / 645632 cached / 8927 out)

Verdict: changes requested

## Findings

### [P0] R1-F1 A failed bless can bypass the version-only guard on retry
The unified bless writes both goldens before validating the determinism fixture, and it decides whether to run the per-tick guard from basic.json alone. · plan L349-L371; plan L299-L310; scripts/golden/blessGuard.ts:L11-L16 · If fixture validation rejects the first run, basic.json is already at SIM 37. A retry treats it as a same-version bless and skips the per-tick comparison, allowing a later sector gameplay change to be blessed. · Validate and stage all three artifacts before writing any of them. Check the stored versions of every pinned artifact, and require the per-tick guard while any artifact is being moved from 36 to 37.

### [P0] R1-F2 The log cleanup can discard concurrent edits
The unconditional checkout restores an entire tracked log directory after the determinism run. · plan L870-L879; scripts/determinism/run.ts:L14-L15; scripts/determinism/run.ts:L60-L64 · Any uncommitted edit another session makes in that directory before the checkout is lost. The directory is currently clean, but the plan is meant to run in a shared checkout. · Run `npm run test:determinism -- --output-dir=out/r0-determinism` and remove the checkout step.

## Verified
- The plan is unchanged from commit e446e0d in the current checkout; the hash-completeness branch has the stated two commits and five-file diff.
- The consumed gameplay-trace and determinism helpers have the assumed exports and signatures: tests/helpers/gameplayTrace.ts:L37-L70,L80,L124; scripts/determinism/fixture.ts:L21-L42,L111; scripts/determinism/protocol.ts:L3.
- The trace is ordered before the 36-to-37 bump and the check before bless: plan L594-L610,L836-L848.
- The baseline mode exits before writes: plan L341-L347. Gate tests still read net1a-gates.json through tests/helpers/gateTrace.ts:L15-L16,L73-L83.
- Net-3's sector mode, online compatibility, and host smoke derive their version from SIM_VERSION: src/network/modes/sector.ts:L93; src/main/network/onlineSector.ts:L29-L38; scripts/network/host-smoke.ts:L39.

## Not verified
- No Jest/Vitest suite or typecheck was run, as requested; compilation and stated output hashes were reviewed statically.
- The review ledger could not be read because docs/superpowers/reviews/2026-11-15-engine-r0-plan/ledger.md is unavailable in this checkout. No awaited prior IDs were supplied.
- To assess the findings, I also inspected tsconfig files, the gate helper, the determinism runner, and the isolated RTC configuration smoke outside the reading manifest.

---

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

---

# Round 2 (delta, reviewing cabc521, effort medium, 79 s, 426134 in / 350848 cached / 3373 out)

Verdict: ready with P2s

## Findings

### [P2] R2-F1 The all-or-nothing claim excludes write failures
The plan says a failed bless writes nothing, but the implementation writes the staged artifacts sequentially. · plan L42, L433-L434, L299-L303, L484 · If a later write fails, earlier artifacts have already changed. The mixed-version guard protects a retry, but the stated all-or-nothing behavior does not hold. · Qualify the claim as covering staging failures, or add a write procedure that can preserve the originals if any write fails.

## Prior findings
- R1-F1: resolved — The plan stages all three artifacts before writing and checks every stored version. The mixed-version and third-stage-failure tests are specified at plan L236-L263; the guard and caller are at plan L288-L303 and L459-L484.
- R1-F2: resolved — The checkout step is gone. Plan L963-L964 uses the supported --output-dir flag shown in scripts/determinism/run.ts:L14-L15 and L60-L64; the destination is git-ignored.

## Verified
- HEAD is cabc521. The changed guard and bless code is consistent with the version-only requirement in spec L247-L249 and the R-0 row at spec L356.
- The plan contains no checkout, restore, stash, or clean command; plan L31 and L963-L964 direct evidence output to out/.
- The hash-completeness branch has the two expected commits and changes the five files named in plan L51 and L67.

## Not verified
- I did not execute the plan or its tests because this review is read-only and the implementation remains in plan code blocks.
- The named review run directory was unavailable in the checkout, so I used the ledger and prior response supplied in the request.

---

# Round 2 response (plan revised)

Reviewed `round-2.json`. Codex confirmed R1-F1 and R1-F2 resolved. 1 accepted (P2), 0 rejected, 0 deferred.

## R2-F1 [P2]: The all-or-nothing claim excludes write failures

Confirmed: the staged artifacts are written one after another. The claim is now qualified. Staging failures write nothing; a failure during the final writes (a disk error) can leave a partial set, and the next bless finds the artifacts at mixed versions and runs the guard again, so a partial set cannot be blessed past it. Decision 1 and the `bless-golden.ts` header comment are updated.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-engine-r0-guards.md

<!-- end -->

---

