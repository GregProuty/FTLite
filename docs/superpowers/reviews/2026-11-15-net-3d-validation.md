# Net-3d validation — complete

Approved plan: `../plans/2026-11-15-net-3d-online-sector.md`. Isolated branch `codex/net-3`, source base `695996c`. No deployment or internet readiness is claimed.

| Task | Source | Verification | Review |
|---|---|---|---|
|1: private contract/store/config|`b898ef4`, `c52ea64`|155 focused tests before review;103 covering tests after fix; root typecheck passes. Actual Windows atomic replacement and serialized writes/removals tested. Serializer and failed exclusive-temp creation regressions covered.|Task review found unchecked enumerable array fields; fix rejects extra fields and holes in actions/roster arrays. Scoped re-review approved with no new findings.|
|2: sector handoff|`2e55a1e`|136 focused tests/11files and root typecheck pass. Human/bot/human, stale close, unavailable pending command, held cleanup, sparse seats, real memory restoration and crash cleanup covered.|Spec compliant, quality approved. Deferred multi-seat replacement regression added and approved in the final fix.|
|3: stream ACK/neutralization|`36526be`|120 focused tests and root typecheck pass; real authority pre-ACK input rejection without ID consumption, synchronous ACK callbacks, reliable neutralization and exact120/121tick age checks.|Spec compliant, quality approved; no findings.|
|4: coordinator/reconnect|`37ef32a`, `a96b9c5`|115 focused/affected tests before review;31 covering tests after fix; root typecheck passes. Commit deduplication, original-token retry, late factory bounds, Forget/Leave races, renewal/loss handling and native attempt notifications covered.|Review reproduced lost roster reconciliation during pending issuance; fix coalesces latest-roster passes and isolates per-seat failures without a tight loop. Scoped re-review approved.|
|5: Electron IPC|`993cefb`|130 focused/adjacent tests, both typechecks and ordinary piped build pass. Sender/port ownership, revisioned initial status, cleanup and actual preload transfer tested; both sandbox preloads require only Electron.|Spec compliant, quality approved; no findings. Actual application native proof completed in Task7.|
|6: visible application|`a900937`|210 focused/adjacent tests, root typecheck and build pass. Real stream/authority tests cover seat2 ownership, ACK, focus neutralization and detached freeze; crew-layer tests verify presentation coordinates without confirmed-state writes. Couch/HUD/input regressions pass.|Spec compliant, quality approved; no blockers. Countdown clock origins and frozen Doors selection were corrected and approved in the final fix.|
|7: actual app proof|`5a3f7f5`, evidence `eb176de`|83 focused tests, typecheck/build; normal native run38.330s; guest/transport/timeout probes expected exit1 with cleanup.|Approved after raw diagnostic redaction fix `e198bc5`;26 covering tests/typecheck and affected native fault probe pass; scoped re-review clean.|

Execution reports and chronological rulings: `.superpowers/sdd/2026-11-15-net-3d-online-sector/`. Final full regression/build/native gates pass; all task reviews and the final scoped re-review are approved. Fresh acceptance at source23c8918 passed in28.205s against the unchanged30s target. Earlier41.797s/41.519s observations are historical; no performance optimization is claimed. Cross-engine replay passed Node24.18.0, Electron37.10.3/Chromium138 and Firefox160:1800 canonical samples each,404 result/event boundaries. Evidence: final-validation/acceptance.json and engines-run.json in this plan workspace. The determinism launcher uses the new optional output-dir flag to keep evidence in this plan workspace.

Playable online remains development-only/loopback until3e supplies independent utility lease fencing. Checkpoint mirrors, rehost, deployment/live TURN/forced relay and two physical computers are outside this slice.

Build compatibility: installed electron-vite5 isolated-entry reporter calls terminal cursor methods on piped stdout. A narrow build-only helper supplies missing non-TTY cursor no-ops without suppressing diagnostics/errors. Isolated preload builds avoid relative requires under sandbox; native app proof completed in Task7. No dependency pins changed.



Initial full validation at source `5a3f7f5` (native evidence commit `eb176de`), followed by the final review fixes below:

- Root: **2,452 tests /176 files pass**,57.80s; typecheck passes. Initial full run exposed two stale generic-boundary classifications; exact named mode-adapter exceptions and final full run resolve them.
- Signalling: **222 tests /14 files pass**; typecheck and Wrangler dry-run build pass. Deliberate table-deletion tests emit SQLite errors; async event-handler warning retained in `service-tests.log` for review. No deployment.
- Ordinary app build passes. Existing native host15 checks/8utility exits; RTC17 checks/3utility exits; local-service workerd/Electron/1utility exit all pass.
- Actual production app normal run: **38.330s**, two-process menu/input/ACK/publication/bot takeover/reconnect/paused reconnect on Skiff and sparse Cutter.26 real main ports released,7 native PCs explicitly closed,6 hidden windows exited,2 utility exits,8 Electron process exits,workerd exit, exact temporary-root removal.
- Fault probes: guest death15.741s,transport death14.708s,launcher timeout15.303s each expected exit1 with observed owned cleanup. Reports reject missing evidence; exit0 alone cannot pass.
- Acceptance and Node/Chromium/Firefox replay passed at23c8918 before subsequent IPC lifecycle/harness-only fixes; no later simulation changes.

Durable app evidence: [reports and screenshots](2026-11-15-net-3d-app-evidence/normal/report.json). Other full logs/reports: `.superpowers/sdd/2026-11-15-net-3d-online-sector/final-validation/`. Menu and Player2 HUD screenshots visually inspected. The initially overlapping strip was corrected in the final fix wave; final screenshots show the complete HUD below it. Test wrapper disables native Windows occlusion calculation; production focus guards remain, and native minimize/restore exercises neutralization without fabricated DOM events.

One exploratory failed launcher left `C:/Users/djuar/AppData/Local/Temp/ftlite-online-app-5NHXRP`. Automatic approval review rejected exact-path deletion with `rejected: blocked by policy` and no further reason. No surviving app/workerd processes were found. No alternate deletion attempted; this exploratory gap is separate from successful final normal/probe cleanup.




## Final review fixes and stable-source verification

Final runtime source **`33d674b`**; fix evidence **`2a1e328`**, report **`7d1faa1`**. All six final findings and the recommended multi-seat replacement regression are implemented. Final scoped re-review approved every finding with no new Critical/Important breakage.

- **2,479 root tests /180 files pass**,57.85s (`final-validation/root-tests-final-reviewed.log`). Both final typechecks and ordinary build pass;49 focused renderer/diagnostic tests pass.
- Actual app final normal gate **PASS42.177s**. All eight Electron exits, both utility exits, helper/workerd exits,26 main ports released,seven native peers closed,six hidden-window exits,zero remaining owners,exact temporary-root removal.
- Deliberately unresolved startup/build probes terminate with expected exit1 in2.939s/1.381s. The owned runtime helper makes the deadline interrupt pending builds; worker/helper exits and root cleanup are observed. Startup probe ends before a worker is spawned.
- Final screenshots inspected at1280x720 and640x480: couch,Skiff,Cutter all show the complete HUD below the measured/wrapped strip. Renderer now downscales below native resolution; vacant bot cards keep health/status and show BOT; unavailable slots are hidden. Long bot names no longer overlap health bars.
- Retry display uses a shared epoch deadline while retry admission keeps monotonic enforcement; detached Doors selection uses frozen UI; strict report admission rejects missing generations/artifact hashes and failed reports.
- Final evidence: [normal report](2026-11-15-net-3d-app-evidence/final-fix/normal/report.json), [startup timeout](2026-11-15-net-3d-app-evidence/final-fix/startup-timeout/report.json), [build timeout](2026-11-15-net-3d-app-evidence/final-fix/build-timeout/report.json).

One intermediate native cancellation wait failed and cleaned up; its exact sub-boundary is unknown because the earlier fixed diagnostics omitted phase. It is retained as `final-fix/cancellation-failed`, not called passing. Two subsequent runs passed unchanged cancellation waits. Finite role/expected/actual-phase diagnostics now aid any recurrence. The initially rejected viewport screenshots and bot-label collision evidence are also retained.

Acceptance, engines, signalling and existing native gates above remain applicable: this fix wave changes presentation/test tooling, not simulation, producer or service implementation. The missing review-round1 stderr log is explicitly corrected in the task report; JSON and diagnostic regression remain available.


Final review record: all seven items addressed; no new blocking findings. Branch/worktree preserved, no merge or deployment. [Implementation rulings](2026-11-15-net-3d-rulings.md) record the decisions made during execution.
