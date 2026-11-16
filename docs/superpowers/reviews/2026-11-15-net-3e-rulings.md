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
