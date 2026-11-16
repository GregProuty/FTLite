### Spec Compliance

- ✅ Spec compliant for Task 4: required binary storage, serial upload coordination, typed status, leased app activation, initial DO commit barrier, guest refresh, and owner-scoped Forget are present. The approved filesystem seam and optional checkpoint AbortSignal remain narrowly scoped. No blocking missing or extra behavior found.
- ⚠️ Cannot verify from this diff alone: unchanged utility admission/control/per-tick lease enforcement, HTTP/service fencing, and every checkpoint safe-point trigger. Those are Tasks 1–3 contracts; this review checked their new integration, not their full implementations. Manual re-host and final graceful-exit acceptance remain Task 5 per controller scope.

### Strengths

- `src/main/network/mirrorStore.ts:28`, `:48`, `:64`: strict shape/hash/mode validation, fatal UTF-8 parsing, exact payload lengths and EOF, cap+1 reads, detached invocation bytes, exclusive owned temporary files, sync/rename, and an invocation-ordered queue protect the last valid file and serialize Forget. `tests/mirrorStore.test.ts:19` covers actual filesystem behavior and injected creation/write/rename failures.
- `src/main/network/onlineMirrors.ts:47`, `:67`, `:72`, `:97`: one coalescing disk worker and one upload preserve a newer pending replacement when an older upload settles. Authenticated receipts validate bytes and identity before acceptance; same-rank conflicts resequence rather than falsely satisfy flush. Disk receipt age is not restored. `tests/onlineMirrors.test.ts:27`, `:53`, `:68`, `:85` exercise these failure/order cases.
- `src/main/network/onlineSession.ts:160`, `:212`, `:221`: renewal uses the utility request nonce and cancels superseded correlations; capture subscription precedes Start; adoption ACK is separate from commitment; bootstrap waits for a fresh grant and committed initial candidate. `src/main/network/onlinePlatform.ts:45` removes the ungated app entry.
- `src/main/network/onlineSession.ts:340` orders both store clears after cancellation, while mirror disposal prevents subsequent writes. `tests/onlineCoordinator.test.ts:72` and `tests/onlineMirrors.test.ts:90` exercise late upload/Forget settlement. `src/shared/onlineSession.ts:86` keeps public mirror status strict and credential-free.
- `scripts/network/online-app-smoke.ts:106`, `:111` require observed initial capture/receipt-before-bootstrap and matching periodic host/guest receipts. `task-4-native.json:531`, `:562` record both layouts passing; `:395`, `:409` record zero remaining application resources, exited utilities, and clean helper completion. All 21 recorded source/artifact hashes match the reviewed checkout.

### Issues

#### Critical (Must Fix)

- None.

#### Important (Should Fix)

- None.

#### Minor (Nice to Have)

- `src/main/network/onlineMirrors.ts:46`: disk load translates `MirrorStoreError('save-too-large')` into `save-unavailable`; `fetchLatest` at `:89` likewise collapses validator oversize errors. The store and public contract already distinguish oversized saves, so these paths lose the useful fixed diagnosis. Preserve `save-too-large` alongside `save-invalid` and add a coordinator-level oversized-load assertion. Rejection and last-valid-state protection remain intact.

### Checks and limits

- Read the complete supplied 1,985-line diff in bounded passes; reread only output portions truncated by the tool. No changed source file was separately reread and no git state was changed.
- Named outside-diff risk: an integration ACK or superseded grant might violate the utility's ownership contract. Checked `src/main/network/hostProcess.ts:118` through `:149` and `src/network/utilityHost.ts:17` through `:31`, `:99` through `:124`: bounded capture notification/replacement, ACK advancement, latest renewal replay, and exact current-request validation match the new caller behavior.
- Named evidence risk: native results might describe stale source. Recomputed the 21 SHA-256 values listed at `task-4-native.json:7`; zero mismatches. Native report uses the dirty pre-commit revision plus exact content hashes, as disclosed.
- Reviewed reported RED/GREEN, final covering tests, typechecks, builds and native evidence in `task-4-report.md`; did not rerun evidenced tests. The report contains fixed native stderr categories and Git line-ending advisories; raw stderr is unavailable, so their underlying cause cannot be independently classified here.

### Assessment

**Task quality:** Approved, with one minor diagnostic improvement.

**Reasoning:** The new integration preserves the authority barrier and separates local persistence, adoption acknowledgement, and authenticated commitment. The tests cover the important failure and ordering cases, and the source-matching native evidence supports the loopback activation claim.
