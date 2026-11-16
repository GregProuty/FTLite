# Net-3e final whole-slice review

Reviewed range: `5249b50..865a9b9`, branch `codex/net-3`, worktree `C:/Users/djuar/.codex/worktrees/56fc/FTLite`.

Review inputs: final-review brief first; implementation plan/design; current rulings including the controller's decision register; ledger and deferred observations; supplied code review package; targeted current source/tests; Task 8 report and fix-1 provenance/admission records; release candidate and two-machine procedure. Review focused on integration and user expectations across Tasks 1–8, preserving completed Net-3a–d scope. No repository/source/Git mutation, native rerun, broad suite rerun, cloud call, secret access, merge or deployment was performed. The only written artifact is this report. Reproductions below used code bundled or evaluated in memory.

## Strengths

- Permission remains utility-owned: request-start stamping precedes IPC, grants are identity/nonce-bound, and authority admission/control/tick checks fail closed. The interrupted control-prefix and trusted Resume cases have explicit replay-v4 semantics with legacy playback tests.
- Capture and mirror responsibilities are separated well. Completed-boundary capture avoids a second periodic seal; candidate delivery is bounded; initial gameplay waits for a server receipt; uncertain PUTs reconcile authenticated exact bytes; restored authorities remain paused and retain full-ACK admission.
- TURN setup reserves an attempt before asynchronous credential acquisition, binds credentials to authenticated connection identity, includes acquisition in the original deadline, and bounds early signalling. Public IPC remains named and credential-free.
- The release records distinguish local proof from external proof. Current fix-1 provenance compares the complete executable set and canonical service origin; retained native results are identified as historical executions, not relabelled reruns. Deployment, selected relay, two devices and OS sleep remain explicitly NOT_RUN.

## Issues

### Critical (Must Fix)

None found.

### Important (Should Fix)

**R1 — An obsolete host-follow failure tears down the newer generation.**

- Location: `src/main/network/onlineSession.ts:309`; associated flow at `:315` and resource ownership check at `:89`.
- Trigger: while following host generation 4, its transport factory remains pending. A later `host-changed` event starts generation 5 and reaches `connecting`. The generation-4 factory then settles.
- `acquire` correctly detects the obsolete `gameEpoch` and disposes that old resource. Its rejection reaches the `host-changed` catch, which checks only `current(c)`. Both transitions share the same context, so that catch calls `savedState` and retires generation 5 as well. Other awaited continuations in `followHost` likewise use context-only checks.
- Impact: a surviving player loses a valid newer host connection and is returned to saved/reconnect state because an obsolete operation finished. Rapid host releases or failed rehosts can produce successive generations while a native transport is starting; no malformed service message is required.
- Reproduction: bundled the existing `tests/onlineRecovery.test.ts` room fixture in memory; supplied distinct transport objects; deferred the first factory; emitted active host generations 4 then 5; allowed the second transition to settle; then released the first factory. Observed exactly:

  ```json
  {"before":"connecting","generation":5,"disposed":[]}
  {"after":"saved","generation":5,"disposed":[1,2]}
  ```

- Fix: give each follow/recovery transition an ownership stamp spanning its awaits and catch handler. Obsolete continuations may dispose their own resources, but must not overwrite the current snapshot/status or retire current resources. Do not suppress genuine failures of the current transition.
- Regression boundary: add to `tests/onlineRecovery.test.ts` the delayed-old-factory/newer-follow sequence above, plus an old continuation that rejects after the newer one is ready. Assert only the old resource is disposed, newer snapshot/status/peers remain current, and old completion cannot emit saved state. Cover cancellation while awaiting join/connect as part of the same ownership boundary.

**R2 — Recovery-launcher preparation remains outside cleanup and its absolute deadline.**

- Location: `scripts/network/online-recovery-smoke.ts:21` and `:35`; the protected `try` starts at `:114`.
- Trigger: Git preparation fails or stalls, the required built artifact is missing/unreadable, or report-directory preparation fails after the temporary directory was allocated.
- The launcher allocates its directory and installs a referenced watchdog before unprotected synchronous Git/source preparation. Both `execFileSync` calls lack a timeout; a stalled synchronous call prevents the JavaScript watchdog from firing. A thrown preparation error bypasses the native-work `finally`, so the owned temporary directory is not removed and no structured cleanup report is produced. The installed watchdog also remains referenced on that failure path.
- Impact: the new recovery proof launcher does not meet its promised bounded startup/cleanup behavior for preparation failures. This is the same class of failure already corrected in the RTC configuration launcher, but that correction does not protect this entry point.
- Reproduction: evaluated the actual launcher in memory with injected Git failure and virtual filesystem calls, without creating a directory or process. Observed calls: `temp-allocated`, `report-dir`, `watchdog-installed`, `git-failed`, `fixed-failure`; no temp removal, report write, or watchdog clearing occurred. The unbounded synchronous Git wait is also directly visible in source.
- Fix: protect all work after directory allocation, including report-path/source preparation; perform Git as owned, deadline-bounded preparation work or otherwise enforce the same absolute deadline with cleanup reserve. Preserve the initial diagnostic if cleanup fails. Produce bounded negative evidence with exact ownership even when runtime preparation never completes.
- Regression boundary: add focused preparation tests for `online-recovery-smoke.ts` (a dedicated launcher test or shared launcher-preparation suite): injected artifact/read failure, failing Git, and slow Git. Require nonzero exit, completion within the original budget, exact owned-child exits and temp removal, and no native allocation. The existing unresponsive-app probe does not cover this earlier stage.

**R3 — The shared native shutdown observer can exit before a valid three-second save completes.**

- Location: `scripts/network/online-app-smoke.cjs:211`; compare the production save budget at `src/main/network/onlineSession.ts:235` and internet-driver shutdown at `scripts/network/internet-app-smoke.ts:113`.
- Trigger: shut down an active host while its final capture/commit uses more than two seconds of its permitted three-second budget, for example a delayed or unavailable checkpoint service.
- Destroying the visible window starts the production owner's asynchronous disposal/save. The observer then waits only 100 iterations of 20ms before reporting resources and invoking `app.exit(0)`, even if windows, ports or utilities still remain. The production owner is entitled to spend 3000ms saving before its bounded native retirement. A fixed two-second observation loop does not cover that composition.
- Impact: the instrumented internet run can abort correct in-progress cleanup, report false cleanup failure, and terminate the host before its allowed save window completes. The new internet driver directly shuts down active captured sessions, so successful earlier recovery gates that explicitly clicked Leave first do not cover this path.
- Reproduction: evaluated the existing `tests/onlineAppDiagnostics.test.ts` driver fixture in memory with exact fake timers and retirement at 3000ms. The unchanged observer reported at 2000ms with `windows: 1`. This is a deterministic observer-budget reproduction, not a claim of a new native failure or an explanation for historical Leave failures.
- Fix: compose shutdown observation with the owner's existing save/retirement budget and the launcher's remaining absolute deadline; do not prematurely call successful exit while resources still belong to an active disposal. Keep timeout/failure reporting and exact cleanup assertions intact.
- Regression boundary: extend `tests/onlineAppDiagnostics.test.ts` with delayed retirement spanning the full legitimate save budget and a never-retiring failure case. Check the surrounding `waitForAppRequest`/launcher reserve still bounds the whole operation. Run a scoped native shutdown case with delayed final commit after the fix; do not enlarge gameplay or acceptance thresholds.

### Minor (Nice to Have)

**R4 — The reusable candidate audit does not bind the ZIP members to the unpacked application.**

- Location: `scripts/network/candidate-manifest.ts:27` (archive hash) and `:28` (independent unpacked EXE/ASAR hashes).
- Trigger: supply an older ZIP together with a newer unpacked application directory. Runtime comparison against `out` succeeds for the directory, while the unrelated archive receives its own valid hash.
- Impact: a future invocation can emit a seemingly coherent candidate identity whose distribution ZIP contains different runtime bytes. The currently reviewed archive was independently checked by the prior reviewer and has no established member mismatch; this is reusable-tool hardening, not invalidation of that evidence.
- Recommendation: inspect and hash the ZIP's exact EXE/ASAR members and compare them to the audited directory, rejecting duplicates/unexpected paths. At minimum preserve an explicit independent member check when regenerating the candidate after the required source fixes.

## Known risks and deferred-observation triage

- Historical native Leave/cancellation failures remain **unconfirmed**. Later passes establish later successes, not their cause or repair. R3 concerns a distinct, reproducible shutdown-observer timing boundary; it must not be presented as the historical Leave fix. Preserve the earlier failure records and fixed diagnostic/click evidence.
- The earlier frozen Cutter player-count issue is addressed by both layout and player-count replacement checks. Restoration-only wording now clears after running/idle and has a regression. The oversized mirror diagnosis is preserved in the reviewed mapping/tests. No new finding is raised for these resolved minors.
- Replay v4 and dormant-empty bot UI reconciliation follow explicit rulings. The former remains conditional and backward compatible; the latter checks full expected initialization and producer counters rather than ignoring populated memory differences.
- Retained root/service/native results and acceptance 28.695s are evidence for their recorded bytes. The 30s threshold is unchanged and close; no gameplay re-bless is requested. Optional-art stderr, deliberate service-error/async-handler warnings, and CRLF advisories remain disclosed, rather than being called pristine output.

## Recommendations

Apply R1–R3 in the single combined fix wave, then run their focused regressions and the affected native recovery/shutdown/preparation checks. Refresh the candidate, source overlay and affected provenance because R1 changes executable main code; current historical byte equality cannot automatically attest to that new runtime. Preserve prior evidence and run one scoped re-review. R4 can be included as small packaging hardening or explicitly retained with a concrete independent member audit.

## Declined to judge

- Deployed Worker/account/secret correctness: no external authorization or live evidence; explicitly Task 9.
- Actual selected TURN relay and two physical machines/different networks: local native/configuration evidence cannot establish these; required external gates remain NOT_RUN.
- Actual OS sleep and hour-long live credential expiry: synthetic hooks and bounded local tests do not prove these operator scenarios; retain the stated limits.
- Historical Leave/cancellation root cause: not established by the retained failures or this read-only review; retained as an unresolved risk, not silently waived or attributed to R3.
- Re-auditing all completed Net-3a–d service/gameplay internals: outside this final slice's assigned scope; their touched integration contracts were considered.
- Manual installed unsigned-package gameplay and an existing cloud rollback version: not established by compiled-package audits; the release record explicitly defers those checks.

## Assessment

**Ready to merge? With fixes.**

Tasks 1–8 have substantial behavioral coverage and credible, honestly bounded local evidence, but R1 can disrupt a newer recovered session and R2/R3 leave concrete holes in the promised verification lifecycle. Address those before final candidate approval. This verdict grants no merge or deployment authorization; internet readiness remains false until the separately authorized external gates pass.
