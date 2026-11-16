# Codex review exchange: engine-r1a-plan

Subject: `docs/superpowers/plans/2026-11-16-engine-r1a-generic-authority.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 3e3055d, effort high, 293 s, 2113718 in / 1951616 cached / 13936 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The final canonical trace gate cannot run
Task 3 invokes an unsupported `same` mode. The available `check` mode also rejects a baseline recorded at the unchanged sim version. · plan L4346-L4349; scripts/golden/canonical-trace.ts:L13-L39; scripts/golden/versionOnly.ts:L73-L76 · The required per-tick preservation gate fails even if the refactor is correct. · Add a same-version comparison mode to the trace script and use it in Task 3, or specify another executable comparison against the Task 1 baseline.

### [P1] R1-F2 The factory test accepts conflicting mode identities
The test registers `sector-copy` with rules whose `modeId` is `sector`; the factory permits that mismatch, while the core labels replays from the rules. · plan L4080-L4083, L4201-L4203, L4267-L4268, L1354; plan L746-L747 · The alternate-mode test passes while its host identity and replay identity disagree, so it does not prove correct mode wiring. · Require `options.modeId === rules.modeId` in `defineEncounterMode`; give the test rules a matching mode ID and assert the resulting replay identity.

### [P1] R1-F3 The new authority equivalence test compares the core with itself
The test compares `createAuthority` with `createEncounterAuthority(sectorRules)`, but the plan implements the former as a direct call to the latter. Its per-tick oracle checks hashes only. · plan L135-L144, L1466-L1467, L55-L57, L4346-L4349; src/renderer/src/authority/core.ts:L416-L444 · A shared regression in admission, lease fencing, checkpoint cadence, or event ordering could satisfy the new equality test without changing a tick hash. · Pin a pre-refactor authority boundary trace from master, including results, events, publications, and checkpoints across lease and replay scenarios, and compare the generic core against it.

## Verified
- The plan file matches commit e5aa9cc, and the scoped authority, mode, codec, and session files have no committed changes between e5aa9cc and HEAD.
- The planned sector rule hooks correspond to existing step, snapshot, hash, cue, callout, telemetry, init, and checkpoint helpers: plan L727-L777; src/renderer/src/sim/step.ts:L30; src/renderer/src/authority/checkpoint.ts:L42-L48.
- The planned host lifecycle matches the current ModeHost surface, including synchronous `checkpoint` and async `captureCheckpoint`: plan L4240-L4264; src/network/modes/contracts.ts:L8-L17; src/network/hostRuntime.ts:L18-L25,L65-L71.
- The online renderer ignores the `ended` record payload, while the local session's planned edit unwraps it: src/renderer/src/app/onlineSession.ts:L53-L59; plan L1780-L1787.
- The content digest includes the changed authority, mode, and codec paths: build/contentDigest.ts:L13-L15. Recent netcode review changes are in main networking and renderer main files outside the plan's edit list.

## Not verified
- No tests or build gates were run, as requested.
- The stated review run directory and ledger are absent from this read-only checkout and from the cited commit, so earlier round output could not be inspected.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan and the code. 3 accepted (3 P1), 0 rejected, 0 deferred.

## R1-F1 [P1]: The final canonical trace gate cannot run

Partly a misreading, but it exposed a real gap. The `same` mode does exist: R-0 adds it to `canonical-trace.ts` (R-0 plan decision 3, line 626), and R-1a runs after R-0. Codex read master, where R-0 is not yet merged. The plan did not say so, though. R-1a now states **Prerequisite: R-0 merged** in Scope and Global Constraints, and its Step 0 stops unless the canonical-trace usage lists `same`. R-1b likewise requires R-1a: its Step 0 requires `tests/encounterMode.test.ts` to pass.

## R1-F2 [P1]: The factory test accepts conflicting mode identities

Confirmed. `defineEncounterMode` now throws unless `options.modeId === rules.modeId`. The factory test uses sector rules renamed to `sector-copy` and asserts the resulting replay's `mode` is `sector-copy`. A new test checks that a mismatch throws.

## R1-F3 [P1]: The new authority equivalence test compares the core with itself

Confirmed: `createAuthority` delegates to the generic core, so comparing the two proved nothing, and the oracle checked hashes only. A new `scripts/golden/authority-trace.ts` records a **pre-refactor authority boundary trace** from master's unchanged authority before Task 1, into git-ignored `out/authority-trace/`. Task 3 checks the generic core against it.

Scenarios recorded:
- the golden replay through the replay executor;
- a live host with strict and receive-time bindings: `setPaused` on and off, a stale tick, cached and conflicting duplicates, a sequence gap, a duplicate while pending, held input, a callout, the 300-tick boundary, a requested capture, a sealed checkpoint and its V3 replay re-run;
- the lease gate: bootstrap, a fence with a queued resume, reopening via `resetPausedEpoch`, and its V4 replay re-run;
- an injected link failure that produces a crash record.

Fields recorded per tick: every result (including `admission`), every event payload, every publication (sequence, tick, channel, phase, hash, pause fields, high-water marks), each capture's cause, tick and byte hash, the crash record's hash, and each replay's version, frame count and re-run hashes. The content digest is masked.

The check catches real changes: an extra `alarm` cue failed at `golden[2]`, and suppressing a player's callouts failed at `live[36]`. R-1b re-records the trace at its start and checks it at its end. The existing tests stay.

## Also changed

- R-1b's prerequisite and trace steps; test counts.
- Re-verified by running R-0, R-1a and R-1b in a fresh worktree: R-1a's tasks run 363, 209 and 152 tests, with a full suite of 3,094; R-1b's full suite is 3,122.

## Files changed

- docs/superpowers/plans/2026-11-16-engine-r1a-generic-authority.md
- docs/superpowers/plans/2026-11-16-engine-r1b-duel-mode.md

<!-- end -->

---

# Round 2 (delta, reviewing 458f03e, effort medium, 100 s, 516228 in / 438528 cached / 4345 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — R-1a requires R-0 and checks for `same` before starting (plan L23, L31, L108-L111). R-0 specifies that mode (R-0 plan L626-L629, L645).
- R1-F2: resolved — The factory rejects mismatched IDs, and the test uses matching `sector-copy` rules and checks the replay mode (plan L4271-L4275, L4305-L4312, L4407-L4410).
- R1-F3: resolved — Task 1 records a pre-refactor boundary trace; Task 3 compares it after the refactor (plan L113-L115, L198-L255, L4559-L4560). It covers results, events, publications, checkpoints, replays, lease behavior, and a crash record.

## Verified
- The trace masks the content digest when hashing checkpoint and replay data (plan L141-L144); snapshots store that digest in their header (src/renderer/src/sim/snapshot.ts:L23-L28). Its baseline path is ignored by Git.
- Recent netcode review commit 3f6a38b changes `src/main/network/onlinePeers.ts` and `onlineSession.ts`, outside R-1a’s edit list. Earlier netcode commits touched `authority/core.ts` and `network/modes/sector.ts`, which R-1a Task 1 and Task 3 replace (plan L91-L92, L4480-L4481); those merged changes are the source this plan must preserve.

## Not verified
- No tests or build gates were run in this read-only review. R-0 is specified as a prerequisite but is not merged in this checkout, so the new trace cannot be executed here.
- Future edits by the active netcode session could not be predicted from the commit log.

---

# Round 2 response (no subject change)

Reviewed `round-2.json`. No new findings. Codex confirmed R1-F1 to R1-F3 resolved. Verdict: ready.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

