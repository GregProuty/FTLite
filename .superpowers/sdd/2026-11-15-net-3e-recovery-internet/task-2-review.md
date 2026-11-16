# Task 2 review: d81f2f9..740fc31

## Spec Compliance

- **Issues found.** The implementation covers the main Task 2 interfaces and controlled-grant native proof, but control processing can continue after permission closes (R1), and the launcher does not enforce the required whole-process 60-second bound (R2).
- **Scope:** full supplied task diff, base `d81f2f91dafe7c6a626da297fb0b941f5372c8f0`, head `740fc3115e0ef1b436a4bf45f037da74f7158f25`. Actual application migration belongs to Task 4; real-service recovery belongs to Task 6. Their absence is not a finding (`task-2-brief.md:5`, `task-2-brief.md:16`).
- **Cannot independently verify binary provenance:** `lease-native.json:7` records a content digest, but its manifest (`build/contentDigest.ts:12`) excludes the utility entry, utilityHost, hostRuntime, main host bridge, and native launcher/wrapper. The report ties the run to the reviewed commit (`task-2-report.md:5`), but the JSON alone cannot prove which built versions of those files executed. Retain the commit/build association; preferably record hashes of the loaded built artifacts and harness for future source-pinned evidence.

## Strengths

- Utility permission is independent of main's event loop: production supplies monotonic/epoch clocks and cryptographic nonces (`src/utility/authorityHost.ts:12`); leased initialization refuses absent clock/nonce dependencies and installs the gate before requesting renewal (`src/network/utilityHost.ts:62`). The separate leased entry refuses missing/foreign lease identities (`src/main/network/onlinePlatform.ts:47`).
- Main retains only its latest renewal and rejects replaced requests before forwarding a grant (`src/main/network/hostProcess.ts:106`). Utility checks the request against its own lease and pending nonce; the missed-expiry bridge observes old permission before accepting a replacement, including expiry during acceptance (`src/network/utilityHost.ts:90`, `src/network/session/leaseGate.ts:74`). The two receipt-edge tests exercise that subtle transition (`tests/utilityHost.test.ts:24`).
- Tick preflight runs before ordinal/debt consumption (`src/renderer/src/authority/tickDriver.ts:38`). Authority checks around swallowed producer callbacks and after admission settlement (`src/renderer/src/authority/core.ts:374`, `src/renderer/src/authority/core.ts:398`). Tests verify preserved ordinal, cleared fenced debt, and all 300 ticks after an ordinary five-second stall (`tests/authorityLease.test.ts:61`, `tests/authorityLease.test.ts:105`).
- Fence cleanup latches before callbacks, waits for an active replay frame to complete, seals admitted commands, neutralizes held input, and records lifecycle pause (`src/renderer/src/authority/core.ts:138`). New closed ingress is rejected without adding its result to an unrelated replay frame (`src/renderer/src/authority/core.ts:168`). Reentrant publication and replay tests cover the resulting journal (`tests/authorityLease.test.ts:75`).
- Initial bootstrap is separate from ordinary Resume and cannot release a restored authority (`src/renderer/src/authority/core.ts:59`, `src/renderer/src/authority/core.ts:464`, `tests/modeHost.test.ts:39`). Generic utility code invokes mode operations rather than editing canonical simulation state (`src/network/hostRuntime.ts:17`).
- Service cancellation releases pending bytes, timeout, listener, and issuance ownership, retaining bounded request IDs solely to ACK late replies (`src/network/session/serviceClient.ts:457`). Its regression test checks the old timeout cannot kill the next request (`tests/roomServiceClient.test.ts:37`).
- Native proof uses utility-local observation and ACKs while main actually blocks for 16 seconds (`scripts/network/lease-smoke.cjs:32`, `scripts/network/lease-smoke.cjs:105`). Recorded evidence shows 36 post-deadline rejected attempts, fixed tick/high water, paused regrant with zero lag, explicit Resume, two utility exits, and cleanup (`lease-native.json:16`). Fault and timeout reports show failures with process/temp cleanup (`lease-native-fault.json:2`, `lease-native-timeout.json:2`). Controlled grants and the delayed probe's withheld timer are explicitly disclosed (`lease-native.json:4`, `lease-native.json:34`).

## Issues

### Critical

- None found.

### Important

- **R1 — Recheck permission for each player control, not only once for the entire drain.** `src/renderer/src/authority/core.ts:305` checks before taking the queue, but the loop at `:320` applies every queued record and synchronously calls result observers at `:331` without another check. With two admitted Resume commands, the first result observer can invalidate permission (or the clock can reach expiry during the callback), yet the second command still receives `applied` and increments control revision; `:334` then publishes running state before subsequent fencing settles. A reentrant ingress check can already latch the fence, but the remaining controls reside in the local `queue`, outside `rejectPending`'s `controlQueue`. This violates closed-gate player-control rejection and leaves precisely the reentrant control path uncovered by the admission/tick tests. Preserve the currently completed boundary, recheck before each subsequent player control, and journal unavailable results for remaining player work without allowing Resume; retain trusted pause cleanup. Add a focused two-control regression that invalidates from the first result callback, verifies the later control is unavailable, and replays the journal.

- **R2 — The 60-second launcher bound does not cover cleanup.** `scripts/network/lease-smoke.ts:19` awaits the Windows `taskkill` process with no timeout. The 55-second child deadline at `:41` therefore does not bound the whole invocation: cleanup can wait indefinitely before its later three-second child-exit timeout even starts. Additionally, recursive removal at `:63` permits eight linearly delayed retries (3.6 seconds), so the declared cleanup allowances can exceed the remaining five seconds. This misses the explicit whole-launcher bound (`task-2-brief.md:16`) even though the recorded normal/fault/timeout runs are fast. Apply a single absolute deadline to launch and cleanup, reserve a sufficient cleanup budget, bound the killer process itself, and ensure deadline failure emits a fixed diagnostic/nonzero result. Validate the cleanup-timeout path with a focused injected slow killer, not another ordinary 16-second run.

### Minor

- **R3 — Planned test-file extensions are absent.** `task-2-brief.md:3` expressly lists extensions to `tests/authorityClock.test.ts` and `tests/networkBoundary.test.ts`; neither has a hunk in the supplied diff. The new authority-lease tests cover the main driver behavior, and both unchanged suites appear in the reported final run (`task-2-report.md:49`), so this is a file-level plan deviation rather than evidence those existing checks fail. Add the intended boundary-specific cases or explicitly reconcile the brief with the equivalent coverage delivered elsewhere. Explicit bot-input expiry coverage requested at `task-2-brief.md:7` is also not present in the new tests; producer-hook coverage is indirect.
- **R4 — Verification output is not entirely pristine.** `task-2-report.md:53` reports LF-to-CRLF normalization advisories from `git diff --check`. They are described as existing and do not indicate a lease defect, but should be retained as known verification noise rather than described as warning-free output.

## Verification and Limits

- Read the entire supplied diff once in bounded passes, plus the task brief, constraints, implementation report, and all three native JSON reports. No Git commands, test suites, builds, or native probes were rerun. No source/index/branch state was changed; this report is the only review output.
- Completed cut-off functions only: `applyControls` and result/publication callbacks in `core.ts`, the sector dependency/pause adapter, and the utility private-message continuation. These checks establish how synchronous result callbacks can fence control processing and how the mode sees forced closure.
- Focused unchanged-code risk checks: inspected `leaseGate.ts` to verify revision transitions and pending-request matching behind the missed-expiry bridge; inspected `build/contentDigest.ts` to assess which executed artifacts the native evidence digest pins. No broader codebase crawl.
- Reported validation is 376 tests across 23 files, root typecheck/build success, and the three native outcomes (`task-2-report.md:45`, `task-2-report.md:51`, `task-2-report.md:64`). These were reviewed as supplied evidence, not independently rerun. R1 and R2 are source-supported findings; no new reproducer was executed.

## Assessment

**Task quality: Needs fixes.**

The utility fencing, initial bootstrap separation, replay settlement, and native controlled-grant evidence are substantial and well targeted. Fix the control-drain permission gap and enforce a real whole-launcher deadline before approving this task.
