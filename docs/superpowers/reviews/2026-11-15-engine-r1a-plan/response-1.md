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
