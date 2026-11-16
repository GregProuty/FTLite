# Net-3e implementation rulings

Plan: [recovery and internet verification](../plans/2026-11-15-net-3e-recovery-internet.md). User approved continuous execution with "continue until done". Implementation remains on isolated branch `codex/net-3`; no merge, deployment or live credentials are part of this approval.

## Replay v4 for interrupted controls

Task 2 review demonstrated a serialization limitation: existing replay v2/v3 `controls` means drain the whole queue, but utility lease expiry can interrupt a drain after an applied command's synchronous result callback. Replaying expected result records as executable decisions would weaken independent verification.

Use explicit replay v4 metadata only when this behavior occurs. A controls action may carry the validated pair `processedCount` and `fenced: true`, describing the accepted prefix. A fence seal that discards queued trusted Resume intents may carry `discardLifecycleResumes: true`. Subsequent existing journal effects settle rejected input, neutralize held input and pause. Expected outcomes remain independently checked.

Recording stays v2/v3 until such an effect requires v4. Existing v2/v3 playback and ordinary seal semantics remain supported. Protocol 2, SIM_VERSION 35 and checkpoint 2 stay unchanged. Strict parser, backward playback, reentrant control, queued trusted Resume, bootstrap-expiry and replay equality tests accompany this revision. This uses the approved design's exception for demonstrated serialization incompatibility.

## Task organization and evidence

Task 2's driver/boundary regressions live in `authorityLease.test.ts`; existing authorityClock and networkBoundary suites remain part of covering checks. A direct real bot held/command expiry regression closes the producer coverage requirement.

Native controlled-grant proof is separate from Task 6's real-service recovery proof. Normal evidence records exact source and built-artifact SHA-256 values; negative cleanup probes retain their own tested revision. Do not infer deployed or two-machine success from local tests.

Existing optional-art placeholder warnings and Git line-ending advisories are recorded verification noise. They are not reported as pristine output or new networking failures.

## Claim resolution keeps the winning connection

A seat rejoin replaces its connection, and the service fences an existing host when that connection changes. A confirmed claim therefore retains the winning authenticated connection. A validated own-host event plus a same-connection service renewal query can resolve a lost successful reply; that query does not grant utility permission. The new utility still stamps its own renewal. Without a definitive snapshot, reconnect adopts service state and remains recoverable for explicit retry rather than guessing or automatically claiming.

## Native recovery proof boundaries

Permission evidence observes the exact gate request-start and accepted deadline, including the earlier service-expiry bound. It records actual permission checks, not scheduled tick times or later publication times. Test-only instrumentation preserves decisions and fails on changed source anchors; artifact and transform hashes are retained.

Committed restore input bytes and canonical snapshot remain exact. For dormant, empty bot UI only, expected first-publication initialization is computed with existing reconciliation and compared in full, with producer counters checked against authority watermarks. Populated decision/cursor/repeat memory remains exact. This distinguishes initialization from lost bot memory; unexplained changes reject the report.

Recovery and cleanup share one absolute deadline, including driver requests, runtime disposal, termination and temporary removal. A two-unresponsive-app negative probe verifies this composition. The detailed review and corrected evidence are in the Task 6 workspace reports. Earlier undiagnosed native Leave failures remain disclosed; passing later runs do not establish their cause.

## Decision register and cost if wrong

This register preserves every implementation ruling in ledger order. The workspace and evidence remain available for review.

| Decision | Reason | Cost if wrong |
| --- | --- | --- |
| Reuse the verified isolated worktree and installed dependencies. | Preserve the existing reviewed network work and avoid the owner's unrelated checkout. | Reproduce verification with a clean dependency install if environment drift is discovered. |
| Retain reports and evidence instead of deleting the skill workspace. | The approved plan explicitly requires source-pinned evidence. | Additional repository storage; evidence can later be archived deliberately. |
| Reuse the completed Net-3d source baseline, then run focused and final regression checks. | Intervening baseline changes were documentation only. | Repeat baseline verification if the source association is disproved. |
| Allow optional next-tick/time arguments to `beforeTick`. | Producers need the opportunity before advancement; existing zero-argument callbacks remain compatible. | Adjust callback consumers if an untested caller relies on a different timing contract. |
| Keep equivalent boundary tests in `authorityLease.test.ts`; add the missing real-bot case. | Behavior coverage matters more than the planned filename. | Move or expand tests if discoverability obscures missing coverage. |
| Introduce conditional replay v4 for interrupted controls and queued lifecycle Resume removal. | Legacy whole-drain actions cannot represent an externally fenced prefix. | Maintain the new parser/playback contract and backward compatibility. |
| Add optional abort signals to checkpoint PUT/GET and filesystem injection for mirror tests. | Ownership changes must cancel local I/O; uncertain server acceptance still needs reconciliation. | Repair cancellation/reconciliation if an outstanding accepted request is mishandled. |
| Retain the winning authenticated connection after a confirmed claim. | Rejoining replaces the connection and fences the new host. | A misclassified uncertain claim could require another explicit re-host attempt; service state remains authoritative. |
| Observe actual utility gate admission rather than scheduled or publication time. | Catch-up schedules and asynchronous publication cannot prove the execution deadline. | Update the test-only instrumentation and rerun the stale-host proof if its source anchors cease to match. |
| Reconcile only dormant, empty bot UI initialization and compare every resulting field. | Existing first-publication initialization differs from the exact checkpoint input; populated bot memory must stay exact. | Narrow or remove that exception and rerun recovery proof if a real memory regression was masked. |

Task 8's historical native results are reused only with explicit revision provenance and complete executable-byte equality. The tooling-only fixes do not constitute new native executions. The external deployment, relay and two-machine gates remain unrun until Task 9.

The final review's reusable ZIP-member check is deferred as a Minor tooling improvement. Both rebuilt distribution archives instead receive an explicit independent check of exact unique paths and EXE/ASAR member hashes against their audited unpacked applications. If this decision is wrong, a future packaging run that omits that independent check could pair stale ZIP contents with fresh metadata; the current archives have that check and are not known to differ. Preserve the check until the reusable tool enforces it.
