# Task 3 review — 67bc42d..895bd4e

## Spec Compliance

- **Spec compliant for Task 3.** Reviewed the task brief, constraints, implementation report, conditional replay-v4 ruling, and the complete supplied diff in bounded passes. All requested production interfaces and compatibility-hash changes are present; `hostRuntime.ts` contains the authorized lifetime integration. Existing checkpoint, protocol, simulation, and replay formats are not changed by this task (`src/shared/sessionCheckpoint.ts:3`, `src/network/modes/contracts.ts:14`, `src/main/network/hostProcess.ts:18`, `build/contentDigest.ts:14`).
- Initial capture precedes startup completion; periodic capture reuses the settled durable baseline; visit/end, pause, and paused-control changes enqueue completed-boundary capture. Exit explicitly pauses and settles work (`src/renderer/src/authority/core.ts:95`, `src/renderer/src/authority/core.ts:125`, `src/renderer/src/authority/core.ts:443`, `src/renderer/src/authority/core.ts:493`).
- Cannot verify from this diff: the later persistence owner's 3,000 ms graceful commit deadline, initial DO-commit gating, upload/mirror limits, and native/service recovery. These are explicitly deferred integration work, not missing Task 3 implementation (`.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-3-report.md:66`).

## Strengths

- The periodic path avoids a second destructive public seal and does not drain newly arriving running ingress. The regression compares captured and uncaptured runs through ticks 300/600/601, including exact results, final checkpoint state, and absence of additional `unavailable` outcomes (`src/renderer/src/authority/core.ts:108`, `src/renderer/src/authority/core.ts:443`, `tests/sessionCapture.test.ts:155`).
- Capture errors retain the live running request for a later boundary, reject faulted/stopped captures appropriately, and preserve the independently cloned last-good crash baseline. Tests cover temporarily invalid bot memory, pending ledger rejection, exit/fence replay equality, and real sector bot memory (`src/renderer/src/authority/core.ts:82`, `src/renderer/src/authority/core.ts:112`, `src/renderer/src/authority/core.ts:467`, `tests/sessionCapture.test.ts:104`, `tests/checkpointV2.test.ts:16`, `tests/replayV3.test.ts:9`).
- Mode startup notifications are staged until installation succeeds; retired callbacks are suppressed and completed requests verify their original owner. Utility IDs remain monotonic across replacement, request/event identity is correlated, and storage is limited to an unacknowledged delivery plus replacement with exit pinning (`src/network/hostRuntime.ts:17`, `src/network/hostRuntime.ts:43`, `src/network/utilityHost.ts:16`, `src/network/utilityHost.ts:23`, `tests/sessionCapture.test.ts:134`, `tests/sessionCapture.test.ts:208`).
- Waiter/request limits include in-progress reentrant delivery. Main deduplicates adoption by per-handle capture high-water mark, validates private delivery shape/cap, and independently copies bytes for observers and request results (`src/renderer/src/authority/core.ts:84`, `src/renderer/src/authority/core.ts:542`, `src/network/utilityHost.ts:120`, `src/main/network/hostProcess.ts:57`, `src/main/network/hostProcess.ts:189`, `src/shared/hostProcessProtocol.ts:6`, `tests/sessionCapture.test.ts:91`, `tests/hostProcess.test.ts:34`).

## Issues

- Critical: none found.
- Important: none found.
- Minor: none found.

## Verification and limits

- Read the full supplied diff; no test suites or Git commands were rerun, and no production/test files were changed.
- Focused check outside diff context: risk that capture settlement or baseline reuse could hide admitted work, cross an open replay frame, or disturb lease fencing. Read the existing `captureCheckpoint`, `sealCheckpoint`, `rejectPending`, `resetBaseline`, ingress/control, and fence helpers cut off by the core hunks (`src/renderer/src/authority/core.ts:163`, `src/renderer/src/authority/core.ts:181`, `src/renderer/src/authority/core.ts:200`, `src/renderer/src/authority/core.ts:238`, `src/renderer/src/authority/core.ts:318`). These preserve explicit settlement and independent replay actions.
- Focused check outside the diff: risk that paused clocks stop pumping and miss the 5,000 ms paused-control requirement. The existing driver continues scheduling at 120 Hz while paused; Task 3 flushes captures in the completing pump (`src/renderer/src/authority/tickDriver.ts:28`, `src/renderer/src/authority/core.ts:462`). This establishes the intended scheduling path, not a real-time guarantee under an indefinitely blocked process.
- Reported verification, not independently rerun: 259 tests across 15 files passed, typecheck/build passed, four unchanged golden checks passed, and exact committed-HEAD acceptance passed in 28.738 s against the unchanged 30 s target. The report discloses existing Git line-ending advisories; the prior ruling also classifies existing optional-art warnings as known noise (`.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-3-report.md:43`, `.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-3-report.md:49`, `docs/superpowers/reviews/2026-11-15-net-3e-rulings.md:21`). Raw execution transcripts were not provided in this review package; runtime pass/timing claims remain implementer evidence.

## Assessment

**Task quality: Approved.** The change separates completed-boundary capture from the public destructive checkpoint path, carries bounded ownership through the utility/main boundary, and adds behavioral regressions for the relevant reentrancy and lifetime risks. No Task 3 correction is required before proceeding to the deferred persistence integration.
