# Codex review exchange: engine-r1b-plan

Subject: `docs/superpowers/plans/2026-11-16-engine-r1b-duel-mode.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing bceb410, effort high, 271 s, 1701222 in / 1597696 cached / 11860 out)

Verdict: changes requested

## Findings

### [P0] R1-F1 Task 1 changes the duel golden’s canonical values
The proposed `flattenDuel` replaces the current short interior tail with the entire sector interior flatten, despite claiming the values and order are unchanged. · plan L438-L450, L489-L510, L529-L532; src/renderer/src/sim/duel/hash.ts:L11-L16; src/renderer/src/sim/flatten.ts:L45-L50; tests/duelGolden.test.ts:L15-L24 · The value sequence changes immediately after the tactical values, so the unedited duel golden cannot pass. · Preserve the existing `flattenDuel` value sequence exactly. Store any additional interior state needed for continuation through a separately defined snapshot representation, and prove both with the golden and continuation tests.

### [P1] R1-F2 Snapshot validation misses tactical writer constraints
`validateDuelSnapshot` checks finite values and validates the interior, but accepts tactical values that module writers reject only after `loadDuelSnapshot` allocates a duel. · plan L683-L711, L718-L726, L342-L347; spec L212 · For example, a missile presence value other than 0 or 1 with a recomputed header hash passes the validator and fails during restore. The promised validation before duel allocation is therefore incomplete. · Validate every tactical field’s bounds and slot invariants, including missile presence and empty-slot zeros, before calling `createDuel`; add a test that calls the validator on a rehashed invalid tactical value.

### [P1] R1-F3 The utility test bypasses the registered utility
The utility test constructs its own registry containing `duelMode`, so it passes even if `authorityHost.ts` fails to register the duel. It also does not perform the required utility-level capture and restore round trip. · plan L2004-L2015, L2360-L2383; spec L215-L216; src/utility/authorityHost.ts:L11 · The test can pass for the wrong reason and cannot establish the stated utility acceptance criterion. · Exercise the built authority utility entry point with a duel initialize, start, capture, and restore sequence, then compare restored hashes; retain a sector identity check.

### [P1] R1-F4 The continuation proof does not establish its checkpoint conditions
The proof checks tick 6000 but never asserts that a missile is in flight, rooms are damaged, or a repair is active at that tick. · plan L60, L883-L915; src/renderer/src/sim/duel/step.ts:L46-L62 · If the scripted scenario changes, the test can still pass while no longer exercising the risky missile and repair fields at the checkpoint. · Assert those three conditions on the split state before capture, or select a split tick that satisfies them and assert it.

### [P1] R1-F5 The module migration leaves tactical cloning manual
The spec requires clone to derive from module fields and explicitly calls for ending the manual `cloneTactical`, but Task 1 leaves that function in place and tests it as the clone path. Only the omission of `create` is declared as a deviation. · spec L118-L138; plan L49, L220-L222, L307-L402; src/renderer/src/sim/tactical/state.ts:L100-L110 · A future tactical field can enter the module snapshot and hash while still being omitted from the independently maintained clone. · Derive tactical cloning from the module fields in Task 1, or state and justify a staged exception to the spec and add a clone completeness check.

## Verified
- The plan’s cited prerequisite interfaces are declared by R-1a, including `createEncounterCore`, `EncounterRules`, and `jsonModeCodecs` (R-1a plan L97-L106, L4241-L4242).
- The proposed tactical field order includes RNG state, ship grace timers, missile ages, and hunter state in the current `flattenTactical` order (plan L357-L375; src/renderer/src/sim/tactical/hash.ts:L15-L28).
- The proposed `mapHash` follows the specified planet, asteroids, belt, clusters, gaps, and spawns order (spec L200-L207; plan L512-L525).
- The hostRuntime exposes synchronous checkpoint bytes and asynchronous capture, and the plan calls both in its mode test (src/network/hostRuntime.ts:L18-L25, L65-L74; plan L1939-L1957).
- The H-1 runtime uses the existing local duel envelope; the plan does not replace that file or change `DuelState`’s shape (src/renderer/src/app/duel/runtime.ts:L7, L216-L217; src/renderer/src/sim/duel/commands.ts:L5-L18; plan L89-L99).
- No reviewed subject or source file differs between the stated commit and the checkout; `git diff --stat b4a7a2c` for those paths was empty.

## Not verified
- R-0 and R-1a are not merged in this checkout, so their planned interfaces could be checked against the prerequisite plan but not compiled as implemented code. R-1b’s Step 0 explicitly stops in that state (plan L23-L24, L101-L104).
- No Jest or Vitest suite was run, as requested. The claimed 8,548-byte size and the exact tick-6000 missile, damage, and repair state were not independently measured.
- The stated review ledger was absent from the checkout, so there were no prior round IDs to assess.
- I read referenced helpers outside the reading manifest where needed to verify findings: `snapshotValidation.ts`, `commands.ts`, `network/utilityHost.ts`, and the determinism guard. The other session’s future netcode edits could not be inspected; the listed netcode paths had no post-`b4a7a2c` commits or current working-tree changes.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan, the code and the prerequisite plans. 5 accepted (1 P0, 4 P1), 0 rejected, 0 deferred.

## R1-F1 [P0]: Task 1 changes the duel golden's canonical values

The P0 came from comparing against master instead of the prerequisite. R-1b runs after R-0, which merges `hash-completeness`. On that branch `flattenDuel` is already `[SIM_VERSION, ...tactical, present, ...repair, ...flatten(interior)]` (`git show hash-completeness:src/renderer/src/sim/duel/hash.ts`), and Task 1 keeps that sequence exactly. The plan did not say so. The Decisions and Task 1 now state that the duel golden baseline is post-R-0's `flattenDuel`. Step 0 runs R-0's full-interior duel golden test and stops if it is absent. The duel golden test remains the proof.

## R1-F2 [P1]: Snapshot validation misses tactical writer constraints

Confirmed. `validateTacticalValues` now checks, before anything is allocated:
- every tactical field's bounds and slot invariants: headings, integer counters, missile presence and empty-slot zeros, room levels 0 to 2, shields, magazine, hunter enums, outcome and tick equality;
- presence and repair.

Two new tests: 19 rehashed invalid values are each rejected, and every state reached by the scripted duels of seeds 1, 4 and 7 (sampled every 30 ticks) is accepted.

## R1-F3 [P1]: The utility test bypasses the registered utility

Confirmed. The new `src/utility/authorityModes.ts` is the registry `authorityHost.ts` builds from. The test drives it through `createUtilityHost`:
- duel initialize, start, 90 ticks, capture-checkpoint, restore;
- a comparison of values, hash and mode memory.

It also checks that the entry point passes that registry, and runs a sector utility. Net-3's `test:host-runtime` passed with the real utility built.

## R1-F4 [P1]: The continuation proof does not establish its checkpoint conditions

Confirmed. The split is now tick 5,156: the first tick from 5,000 on with a missile in flight, a damaged crew room and a repair in progress. The test asserts all three, then runs 5,156 + 3,676 ticks and matches both the per-tick hashes and the end summary.

## R1-F5 [P1]: The module migration leaves tactical cloning manual

Confirmed. `cloneTactical` is now derived from the space module's fields: a one-line wrapper over `cloneTacticalFromModule`. Its existing tests pass unchanged. A new check changes every field of a clone and confirms the original is untouched.

## Also changed

- Test counts. Re-verified by running R-0, R-1a and R-1b in a fresh worktree: R-1b's tasks run 170, 129, 234 and 158 tests, with a full suite of 3,125.

## Files changed

- docs/superpowers/plans/2026-11-16-engine-r1b-duel-mode.md

<!-- end -->

---

# Round 2 (delta, reviewing d0746db, effort medium, 118 s, 743258 in / 681216 cached / 4943 out)

Verdict: changes requested

## Prior findings
- R1-F1: resolved — R-0 already flattens the whole interior in the stated order; the revised plan preserves that sequence and checks for R-0’s interior test (plan L50, L110-L111).
- R1-F2: still open — The validator accepts any integer for ships.*.graceUntil (plan L448, L941), but those fields are Int32Array values (plan L505). A rehashed value of 2147483648 passes validation and becomes -2147483648 when the module writer restores it (plan L300-L305). Restore then fails its hash check after duel allocation. Restrict these values to signed 32-bit integers and test a rehashed out-of-range value.
- R1-F3: resolved — The test drives the registry used by authorityHost through duel capture and restore, compares values, hash and mode memory, and exercises sector (plan L2250-L2286, L2631-L2655).
- R1-F4: resolved — The continuation test asserts a missile in flight, crew-room damage and active repair at the split (plan L1139-L1144).
- R1-F5: resolved — cloneTactical delegates to the module-derived clone, with a field-copy and isolation check (plan L239-L252, L429-L436, L590).

## Verified
- The R-0 hash-completeness branch uses the full interior flatten, and its golden test has the name checked by Task 1 (plan L50, L110-L111).
- Signed 32-bit coercion was confirmed with a read-only Node arithmetic check: Int32Array stores 2147483648 as -2147483648.
- Task 4 replaces sectorStream.ts and authorityHost.ts (plan L2124-L2127). Recent netcode history includes changes to both paths, so concurrent edits there are a predictable integration conflict; neither path currently has working-tree changes.

## Not verified
- R-0 and R-1a are not merged into this checkout, so the full R-1b plan was not compiled or run here.
- The claimed test counts, checkpoint size and tick-5156 scenario were not independently executed; the requested review was read-only.

---

# Round 2 response (plan revised)

Reviewed `round-2.json`. No new findings. Codex confirmed R1-F1, R1-F3, R1-F4 and R1-F5 resolved. R1-F2 is still open on one field.

## R1-F2 [P1]: Snapshot validation misses tactical writer constraints (still open)

Confirmed. `Ship.graceUntil` is an `Int32Array` (plan L508; `src/renderer/src/sim/tactical/state.ts:19`), but its rule accepted any integer. A rehashed 2147483648 would pass validation, wrap to −2147483648 on restore, and fail the hash only after allocation. It is the only typed-array field in the tactical state (`grep Int32Array src/renderer/src/sim/tactical/state.ts`).

Fixes:
- A new `int32` rule (−2³¹..2³¹−1) is used for `graceUntil` in `SHIP_RULES`.
- The same hole existed in the telemetry mode memory: `prev.grace` is restored with `Int32Array.from` but its zod schema allowed any safe integer. It now uses a 32-bit `int32` schema.
- The invalid-value test gains a rehashed `ships.0.graceUntil = 2147483648` case, which brings it to 20 cases; the Decisions text is updated to match.

The validator's message, `duel snapshot tactical ships.0.graceUntil: out of range`, matches the case's regex. Values the scripted duels reach (tick + grace) are far below 2³¹, so the accepted-states test is unaffected. I checked this by reading the code; the build runs both tests.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-engine-r1b-duel-mode.md

<!-- end -->

---

# Round 3 (delta, reviewing ab6be42, effort medium, 62 s, 292109 in / 239360 cached / 2811 out)

Verdict: ready

## Prior findings
- R1-F2: resolved — The tactical validator now bounds graceUntil to signed 32 bits (plan L440-L450), matching its Int32Array storage (plan L508). A rehashed out-of-range value is tested at plan L839-L843. The telemetry memory schema applies the same bound before Int32Array.from restores it (plan L1835-L1859, L1868-L1870).

## Verified
- The snapshot validator calls validateTacticalValues before createDuel (plan L943, L959-L960). The new graceUntil rule covers the remaining typed-array conversion identified in round 2.
- The revised invalid-value count is consistent: 17 tactical cases at plan L833-L840 and three presence or repair cases at plan L845-L849.
- Task 4 has a predictable integration overlap: it replaces authorityHost.ts (plan L2647), which recent netcode commit 740fc31 also changed. The implementer should reconcile that file against current master.

## Not verified
- No implementation or tests were run; this is a read-only review of the plan at ab6be42. R-0 and R-1a interfaces are not on master yet.

---

# Round 3 response (no subject change)

Reviewed `round-3.json`. No new findings. Codex confirmed R1-F2 resolved. Verdict: ready.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

