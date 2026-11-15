- **R5 — A queued trusted Resume defeats trusted fence-pause settlement and breaks replay:** ADDRESSED. `src/renderer/src/authority/core.ts:128` selects and explicitly journals removal of queued lifecycle Resume records; `:139` preserves lifecycle pauses; `:151` invokes that behavior before fence neutralization and the appended trusted pause. Consequently the closed-gate Resume can no longer interrupt the fence's pause-only control drain. Ordinary seals retain their previous behavior. `tests/authorityLease.test.ts:39` covers the reported queued-Resume reproduction, paused-only publication, expected control revision, completed replay equality, and later closed-gate Resume rejection; `:62` covers expiry between bootstrap permission sampling and its control application, including replay equality.
- **R5 replay compatibility:** ADDRESSED under the controller-authorized v4 seal extension. `src/renderer/src/authority/replay.ts:23` accepts only optional literal `true` and rejects unknown seal keys; `:55` rejects the extension in v2/v3. `src/renderer/src/authority/core.ts:514` executes the explicit seal instruction independently of expected results, while `:529` rejects a flagged seal that has no queued Resume to remove. `tests/authorityLease.test.ts:51` covers malformed/cross-version/no-op rejection. `tests/replayV3.test.ts:10` covers preservation and subsequent application of a pending trusted Resume across ordinary legacy v2/v3 seals.

### New Breakage in the Fix Diff

- None.

### Out-of-Scope Observations

- None.

### Checks

- Read the supplied `review-f86ab6b..c157a30.diff` once, task brief, previous R5 finding, appended round-2 report, and narrowly related lifecycle/control/replay code and tests. No Git commands, source changes, suite reruns, rebuilds, or native reruns.
- Confirmed that the round-2 report identifies the covering five-file authorityLease/replayV2/replayV3/utilityHost/modeHost command and records exit 0 with 72 tests, plus successful typecheck/build. These are implementer-reported execution results; test assertions were checked against the fix diff.
- Inspected the refreshed normal native report: PASS, 16,908 ms duration, 16,002.9054 ms main stall, and two utility exits. Recomputed all 21 recorded source hashes and 20 built-artifact hashes against the current files: no mismatches. The report explicitly associates the pre-fix checkout commit with the exact tested source snapshot using these hashes; retained prior negative cleanup reports are not presented as evidence for the new authority build.

### Verdict

- **Fix round: All findings addressed, no new Critical/Important breakage.** R5 is closed; the explicit v4 discard effect and legacy seal behavior satisfy the scoped authorization.
