# Net-3e Task 3 report

Implementation commit: `895bd4ea8de89c2dfc34b9cf4b7aeeb6f1014157` on `codex/net-3`, isolated worktree `C:/Users/djuar/.codex/worktrees/56fc/FTLite`. Parent-owned progress ledger was neither changed nor staged by this task. No cloud, credentials, deployment, native-process cleanup, upgrades, merge, or push.

## Implementation

- Added the exact shared `CaptureCause`, `ModeCheckpoint`, and `CheckpointCandidate` shapes, byte/cursor validation, copy helper, and cause urgency ordering. Added the shared source to the compatibility digest and its mutation fixture.
- Added authority boundary requests distinct from the existing public destructive checkpoint method. Captures occur initially, every 300 completed ticks, after visit changes/end, on pause, and on new paused control revisions. Paused controls capture in their completing pump, within the 5,000ms requirement. Exit requests journal a trusted pause and explicitly settle pending work.
- Ordinary periodic capture clones the already settled 300-tick durable baseline. It does not call the public checkpoint seal, admit new publication-reentrant input, or introduce a second rejection. Running requests with pending ledgers or temporarily invalid controller memory remain pending until a serializable completed boundary. Capture errors cannot fabricate an error-phase checkpoint; faults retain the existing immutable last-good crash baseline.
- Real sector bot controller memory is refreshed for live captures; periodic capture uses the existing baseline's refresh. The sector adapter alone encodes canonical checkpoints as opaque bounded bytes.
- Utility capture IDs increase for its entire lifetime, including mode replacement and modes reusing notification objects. A requested result and its corresponding event reuse the same ID. Delivery holds one unacknowledged candidate plus one newest replacement; an exit replacement is pinned. Request waiters are bounded at 64, including in-progress reentrant observer delivery.
- The generic runtime stages startup notifications until successful mode installation, suppresses failed/retired mode callbacks, and rejects completion of capture requests from a replaced owner. This required the controller-approved `hostRuntime.ts` forwarding/lifetime integration.
- Main owns a per-utility-handle capture high-water mark, deduplicates event/request adoption, copies bytes independently for every observer/request result, validates delivery shape and the 256KiB cap, and exposes explicit adoption acknowledgments. No renderer-facing command was added.
- Protocol 2, SIM_VERSION 35, checkpoint 2, and the Task 2 conditional replay 4 / legacy replay 2 and 3 rules remain unchanged. Capture pause/exit/fence effects use existing replay actions.

## RED evidence

Initial prescribed command:

```text
npx vitest run tests/sessionCapture.test.ts tests/checkpointV2.test.ts tests/checkpointBots.test.ts tests/checkpointStartup.test.ts tests/replayV3.test.ts
```

Result: 4 new capture tests failed, 40 existing tests passed. Failures were missing initial candidates, absent `requestCheckpoint`, absent leased initial candidate, and absent utility candidate delivery. This was run before production capture code was written.

Additional focused RED/GREEN cycles during implementation/self-review:

1. A failed mode startup published its initial candidate before successful installation; the runtime lifetime test failed, then passed after staging and retirement checks.
2. Temporarily nonserializable running captures rejected immediately; the next-boundary retry regression failed, then passed after retaining only cause/waiters for retry.
3. A mode reusing a notification object reused capture ID 1 instead of assigning ID 3 to its newest notification; the utility regression failed, then passed after distinguishing new notifications from correlated request results.
4. A failing observer could add 64 waiters after the current waiter was temporarily removed, exceeding the bound; the regression failed with zero rejected requests, then passed with one rejected request after in-progress waiters remained counted.

One early test expectation assumed a startup `stand` command was applied. The actual simulation can reject it at startup, so that expectation was corrected to compare the exact result with an identical unsaved run and assert that capture waited until tick 1. No gameplay code was changed for that fixture issue.

## GREEN evidence

Final command after source changes:

```text
npx vitest run tests/sessionCapture.test.ts tests/checkpointV2.test.ts tests/checkpointBots.test.ts tests/checkpointStartup.test.ts tests/replayV3.test.ts tests/authorityLease.test.ts tests/contentDigest.test.ts tests/hostProcess.test.ts tests/utilityHost.test.ts tests/modeHost.test.ts tests/sectorStream.test.ts tests/onlineCoordinator.test.ts tests/golden.test.ts tests/networkBoundary.test.ts tests/authorityBoundary.test.ts
```

Result: **259 tests, 15 files passed**, Vitest duration 3.73s. The two source-boundary suites specifically cover the new shared/generic dependency paths. No full suite was run; Task 6 retains broad gates.

- `npm run typecheck`: passed after the final test addition.
- `npm run build`: passed after the final production change; utility, main, preload, and renderer bundles built. Measured tool duration 4.56s.
- `git diff --cached --check`: passed before commit. Git emitted its existing LF-to-CRLF advisories; these were not test/build failures.
- `tests/golden.test.ts`: all four unchanged golden checks passed. No golden was re-blessed.
- Default `npm run acceptance`: all nine unchanged cases (seeds 1/2/3, players 1/2/4, default 20-minute budget) passed. An isolated measured run took **28.724s**. The final run against exact committed HEAD `895bd4e` passed in **28.738s**, below the unchanged 30s target. Timing includes the npm/tsx launch and was measured with `System.Diagnostics.Stopwatch`; output/exit code were checked after completion.

Coverage includes initial tick 0 before bootstrap, periodic ticks exactly 300/600, synchronous publication-reentrant input with equal saved/unsaved gameplay snapshots/results/watermarks and no extra `unavailable`, a request made inside publication completing only after the tick journal, visit/end safe points, immediate paused-control revision 2, explicit paused/exit unavailable results, pending-ledger export rejection, fenced and exit replay equality, real bot decision memory at tick 299 in the tick-300 baseline, last-good tick-300 crash retention after a later fault, exit pinning, increasing IDs across replacement, exact event/request identity, detached byte copies, strict private-delivery validation, and the bounded reentrant waiter case.

## Integration interfaces for the next task

```ts
HostProcessHandle.onCheckpoint(cb: (candidate: CheckpointCandidate) => void): Unsubscribe
HostProcessHandle.ackCheckpoint(captureId: number): Promise<void>
HostProcessHandle.captureCheckpoint(cause: CaptureCause): Promise<CheckpointCandidate>
ModeHost.captureCheckpoint(cause: CaptureCause): Promise<ModeCheckpoint>
ModeHostDeps.onCheckpoint?(candidate: ModeCheckpoint): void
```

- `onCheckpoint` immediately supplies an owned copy of the most recently adopted candidate to a late subscriber. Subsequent event/request duplicates are suppressed for existing subscribers. Each handle is one utility epoch; new handles restart their local adoption state.
- ACK means main adopted bytes, **not** that the DO committed a checkpoint. Main should ACK after placing bytes under its bounded persistence/upload owner. A requested candidate can arrive before its queued notification; ACKing that ID also retires older queued deliveries.
- `captureCheckpoint('exit')` requests a completed paused/settled checkpoint. Main must request/commit it before `dispose()`. The existing disposal method keeps its short teardown contract; the next task owns the 3,000ms graceful-commit deadline and service release.
- Initial capture is automatic. The next task must continue holding the existing bootstrap latch until the initial candidate is committed by the DO; an adoption ACK alone must not release bootstrap. A restored mode also emits an initial paused candidate and never grants bootstrap Resume.
- Private messages are `capture-checkpoint`, `ack-checkpoint`, `checkpoint` (push), and `captured` (request result), correlated by the existing main-stamped request IDs and host generation. No change to public `HostCommandInput`/renderer IPC.
- Fixed local failures use `capture-unavailable` / existing bounded private response errors. A mode replacement invalidates outstanding results from its previous owner.
- Required new methods were added to existing test doubles in `modeHost`, `sectorStream`, `utilityHost`, and `onlineCoordinator`; production behavior of those unrelated owners was not changed.

## Self-review and remaining scope

Reviewed exact staged paths, request/event correlation, pending-ledger handling, cause ordering, reentrant bounds, byte ownership, replacement lifetime, crash baseline retention, generic import boundaries, and replay compatibility. The four concrete issues found during self-review have dedicated RED/GREEN regressions described above.

No known blocker for controller review. Persistence/upload, DO commit receipts, mirror validation, graceful commit timeout, initial commit gating in the main coordinator, and native/service recovery proof remain later tasks by design. Acceptance timing has limited headroom under 30s; no threshold was changed. This task makes no native/internet/deployed-readiness claim.
