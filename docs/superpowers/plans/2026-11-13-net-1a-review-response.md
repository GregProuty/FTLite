# Net-1a plan: response to Opus review

Review target: `2026-11-13-net-1a-boundary.md`, implementation baseline `0a47e50`.
This response revises planning only. No gameplay implementation, version bump, bless or commit has occurred.

The sequencing and ownership findings are accepted. The revised plan makes the following decisions rather than leaving alternatives for the implementer.

| Finding | Response and location in revised plan |
|---|---|
| B1 | Task 3 moves raw-step integration tests, helpers, gates, acceptance, replay/golden drivers and parity runners onto a pure headless authority/loopback/translator. Test-only raw-fixture conversion is permitted; shipping raw step overloads are not. Migration contracts define the exact step signature through final removal. |
| H1 | Preserve authority-owned pump per the spec. Add an optional synchronous beforeTick(nextTick, tickTimeMs) scheduling opportunity before ingress freezing, never within step. Task 4 supplies original tick deadlines across catch-up and pause epochs. Missing producers never gate ticks. |
| H2 | Contracts/codec move under renderer/net so they stay in the web project. InputFrame, UI, translator and policy live in pure clientControl. Acceptance moves out of sim in task 3. Pure cue/callout derivation moves out of app/render in task 11. No sim-to-client re-export. |
| H3 | Files lists are minimum scope. Each migration must audit all readers, including aliases, update every affected source/test/helper, and record remaining matches by unmigrated family. Staging required caller changes is explicitly allowed. |
| H4 | Task 5 moves repeat and tab focus for all families before individual card migrations. The bridge narrows to decoded direction/Confirm for unmigrated cards; first-row checks use their published cursor until migrated. Actual tab/seat remains authoritative. Task 1 adds mixed-family Skiff fixtures. |
| H5 | Task 4 now owns setPaused and lifecycle controls together. Player controls use next-unexecuted requestedTick; a trusted couch handle has a separate lifecycle ordinal. Pump-entry pause retains accrued debt and runs none until resume. Tests pin conflict order, resume forwarding and retained debt. |
| M1 | Task 1 rewrites NEVER to the identical literal 2147483647, keeping the strict exponentiation guard and all values unchanged. |
| M2 | Gameplay projection normalizes old target cursors and new target fields to the same target identities, retains weapons.selector, and drops only presentation memory. |
| M3 | Task 9 explicitly emits jump/sectorJump at the just-below-ready publication, validates after jumpStep, resets UI on visit change, and traces mid-step navigation reconciliation removal. Task 1 pins fixtures first. |
| M4 | Task 1 captures independent gameplay projections for the exact golden scenario (2026, four players, 7200 ticks) at 60-tick intervals. Task 11 checks them before the one bump/bless; a required semantic difference needs a reviewed first-divergence trace. |
| M5 | Task 3 defines the interim bounded journal: current snapshot, admission/control state, held frames, semantic/bridge envelopes and results, including the faulting frame. Session tests replay to the pre-fault hash. Task 11 removes only legacy journal entries. |
| M6 | Execution uses an isolated baseline worktree with the approved planning artifacts. Preserve the owner's untracked playtest script; its old API imports will need a separate port. No exclusion or silent modification hides its incompatibility. |
| M7 | Task 10 compares policy output on live completed state and a decoded replica with identical cloned UI on gate seeds; task-1 traces separately guard strategy/cadence. |
| Low: RunId | Inject a monotonically increasing run counter from composition, no Date/random. |
| Low: held frames | Specify ownership/run/tick checks, latest-stream monotonic sequences with allowed gaps, stale/future handling, neutralization and separate command counters; task-3 tests. |
| Low: old loop | Explicitly remove app/loop.ts and its obsolete tests in task 11 after porting useful cases. |
| Low: digest | Specify a sorted build-time SHA-256 source manifest covering sim TS/JSON, shared intent and protocol contracts/codec. Deliberately conservative invalidation; no runtime Node crypto. |
| Low: unflatten | Task 1 adds exact-length validation before mutation, including short/long input rejection and unchanged-state tests. |
| Low: rawPressDecode | Replace the invented function assertion with decodeMessage rejecting an encoded legacy envelope; numeric fixture codec utilities may remain. |

Verification for this response: inspected step/console ordering, raw test helper and acceptance calls, boundary import rules, both TypeScript project include sets, InputFrame placement, raw replay and crash tests, flatten length checks, NEVER and the golden script. Checked the revised plan against the spec's authority clock ownership, pause, admission and between-tick rules. No implementation tests were run because only planning documents changed; implementation gates remain requirements, not reported results.

## Re-review request

Please re-read the revised plan and actual source, not just this disposition table. Reassess B1, H1-H5 and M1-M7, inspect the new migration contracts for contradictions, and report remaining actionable findings with severity and file/line evidence. In particular check the task-3 runner/test migration, task-5 decoded bridge, authority beforeTick opportunity and pause epoch handling. Give an explicit ready/not-ready verdict. Review only: do not edit files, implement, install dependencies or commit.

## Response to second Opus review

Accepted N1-N4 and N6; the plan now names the fixture adoption seam, refreshes after every perTick callback, gives paused clients beforeControls at every pump, requires exact golden hashes through task 4, migrates Navigation choice votes in task 5 and assigns digest generation/injection to task 2. The second-review clarifications specify tests and ownership for each.

N5: added same-machine median suite/acceptance measurements in task 1 and an initial 1.5x task-3 review ceiling. This is a profiling/review gate, not evidence that full byte serialization can meet that target. Pure sim tests without presses may use semantic empty-command steps; gates, parity and acceptance keep bytes. A higher budget requires an explicit decision rather than an implicit timeout increase.

All six low findings are addressed: authoritative sit target reset in tasks 7/8; repeat reset only on seating; whole-src bridge removal guard; legacyReplay modified in task 11; deterministic guard expanded to clientControl/headless; enqueue-only ingress and same-tick beforeTick delivery test. Also made the per-tick replica-equivalence assertion explicit in task 10.

Verified against fixture helper mutations, stations sit/selectTab, Navigation voting, current acceptance timeout cases, Vitest/electron-vite configuration and TypeScript node includes. Planning-only changes; no gameplay tests or performance measurements claimed. Please verify these concrete revised contracts and give a final execution-readiness verdict.

## Final Opus verdict and incorporated clarifications

Opus: **Ready for subagent execution. No blockers.** Final review requested M-A gate fixture adoption and M-B single normalization before task 3. Both are now incorporated: gate setup/mid-run mutations use explicit fixture publication barriers; scripted targets/equipment migrate to commands and Navigation reads client UI. Raw bounded axes cross the wire; sim consumers derive normalized input from the raw frame without normalizing an already normalized vector. Task 1 now explicitly lists median performance measurements. Checked these details against gate-warden, gate-run and shared/intent.ts.

The optional task-3 split was not adopted: keep one acceptance boundary for the connected runner/test/live-app cutover, with the existing internal checklist and exact golden gate. No implementation, runtime tests, performance measurements or version changes were performed during this review cycle.
