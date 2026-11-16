# SDD ledger — plan: docs/superpowers/plans/2026-11-15-net-3d-online-sector.md

Worktree C:/Users/djuar/.codex/worktrees/56fc/FTLite, branch codex/net-3; base939c819. User explicitly APPROVED design/plan and subagent execution. Execute all seven tasks continuously, no fresh approval between tasks. Earlier Net-3 slices complete; do not redispatch them.

Spec: docs/superpowers/specs/2026-11-15-net-3d-online-sector-design.md. Planning commit939c819. Owner checkout unrelated work remains untouched. Existing linked worktree verified; no new worktree/dependency install needed. Baseline source unchanged since final Net-3c root2238/service222 and builds/native pass; subsequent commits documentation only. Repeating unchanged full baseline is unnecessary; focused task gates and final full verification follow.

## Preflight scan

| Tasks | Shared interface/files | Finding/ruling |
|---|---|---|
|1|Contract/config/store tests vs implementations|Consistent; fixed error union needs task-owned explicit names.|
|2|Producer manager hooks/checkpoint/attach|Consistent; initialize manager before first authority baseline.|
|3|ACK gating and reliable neutral held|Consistent; current client/stream APIs need additive changes.|
|4|Coordinator/platform/retry|Consistent; transport lifecycle wrapper and attempt-close subscription required, already planned.|
|5|Main/preload sender checks|Consistent; bridge port transfer cannot expose generic invoke.|
|6|Input/UI/presentation|Consistent; optional draw positions preserve confirmed state.|
|7|Actual app tests/report|Consistent; separate processes, no alternate test coordinator.|
|1,4|Status/actions/store/config|4 consumes exact1 contracts, no alternate credential schema.|
|1,5|IPC/config/store|5 validates1 boundary and injects store/config.|
|1,6|Status/actions/port|6 consumes1 contract through5 bridge.|
|1,7|Store/config/report redaction|7 uses synthetic isolated profiles and loopback only.|
|2,3|sector.ts/sectorStream attachment|2 forwards existing AttachOptions;3 gates stream input before authority.|
|2,4|Host/runtime seat ownership|4 attaches one trusted logical seat per human;2 owns vacant bots.|
|2,6|Player IDs/HUD bot presence|Sparse seats retain indices; no renumbering.|
|2,7|Bot lifecycle/replay|7 proves actual loss/rejoin and checks acceptance/engines.|
|3,4|Streamed attach readiness|4 waits native/service readiness;3 independently enforces full state ACK.|
|3,6|Client neutralize/ACK readiness|6 consumes3 APIs, no manual high-water resets.|
|3,7|Actual input/ACK evidence|7 observes production boundary.|
|4,5|OnlineSessionDeps/platform/owner|5 must preserve signatures and post-ready exit events.|
|4,6|Owner/status/view-state hint|Renderer hint display-only; no authority permission.|
|4,7|Production coordinator|7 must drive shipping coordinator, no replacement harness.|
|5,6|Preload methods/status/ports|Exact typed operations; epoch invalidates stale transfer.|
|5,7|Process/IPC ownership|Test driver isolated; actual production app path.|
|6,7|Menu/input/render|Actual UI controls/nonzero seat HUD proof.|

Ruling: preserve tracked reports as durable review evidence instead of blanket workspace deletion — matches preceding slices — additional repository evidence. No merge/deploy/cloud/credential authorization.
Ruling: reuse verified unchanged baseline — only documentation after7598a47 — final full suites still required.

## Tasks

- Task1 running /root/net3d_task1 (sol high), BASE695996c: contracts/store/config. Approval/headings documentation committed before dispatch; brief extraction succeeded.
- Task2 pending: sector producers.
- Task2 dispatch BASEc52ea64; fresh implementer next.
- Task3 pending: stream safeguards.
- Task4 pending: coordinator/retry.
- Task5 pending: Electron integration.
- Task6 pending: visible application.
- Task7 pending: actual app proof/final validation.

Task1 implemented b898ef4:155 focused tests/typecheck pass; full report present. Reviewer /root/net3d_task1_review (sol high),695996c..b898ef4, pending. Contract roster property is snapshot; status epoch0 allowed before attachment, descriptors/view-state positive. Store factory exports SeatStore and sanitized fixed errors; filename online-seat-v1.json. Config disabled on invalid URL. No dependency changes.

Task1 review NEEDS FIXES: actions/snapshot.seats arrays allow extra enumerable credential fields through structuredClone. Actual probe reproduced. Fixround1/5 dispatched original implementer BASEb898ef4, focused contract regression/typecheck. Later app/IPC/config actual wiring deferred to owning Tasks4–7, not missing Task1 work.

Task1 COMPLETE: fixround1/5 (1addressed,0open),b898ef4..c52ea64; /root/net3d_task1_rereview approved no new findings.103 focused/typecheck pass. All source695996c..c52ea64. Task2 source baselinec52ea64.

Task2 implementer /root/net3d_task2 (astra high), running. Parent owns untracked validation doc; do not stage during worker source commits.
Task2 implemented2e55a1e:136 focused tests/11files, root typecheck pass. Reviewer /root/net3d_task2_review (astra high),c52ea64..2e55a1e, pending. ModeHost and sectorStream fixtures updated for queued initial publication/default bots; no production generic runtime change.
Task2 COMPLETE: reviewer speccompliant/qualityApproved, no blockers. Source2e55a1e; parent docs9013b44. Minor deferred: regression replacing one seat of a multi-seat [0,2] human binding would strengthen intentionally whole-binding retirement coverage; final reviewer triage. Task3 BASE9013b44.
Task3 implementer /root/net3d_task3 (sol high), running. Controller reminded synchronous send/ACK callbacks must be supported, task2 stream fixture safe-boundary pump preserved.
Task3 implemented36526be:120 focused tests/typecheck pass; report APIs acknowledgedSequence(), client.neutralize(player). Reviewer /root/net3d_task3_review (sol high)9013b44..36526be pending. No producer manager/generic mode changes.
Task3 COMPLETE: speccompliant/qualityApproved, no findings. Source36526be, parent docs01ea483. Task4 BASE01ea483.
Task4 implementer /root/net3d_task4 (astra high), running. Permitted minimal tsconfig node include/resolveJsonModule adjustment if main sector factory imports existing validated mode graph; no duplicated validators to evade compiler. Parent owns docs.
Ruling: permit minimal node compiler JSON/include expansion for main sector factory to consume existing validators — avoids divergent validation implementation — additional compile graph coverage, no runtime dependency/policy change.

Ruling: guest reconnect deadline runs through port publication until current-epoch renderer synced/view-state hint, which may end only local retry/UI watchdog — coordinator has no independent guest ACK observer, host actual stream ACK gate remains authoritative — dishonest renderer can misreport its own progress but cannot grant service/native readiness, ingress, ownership, utility creation or resume. Stale epoch rejects and30s timeout closes resources.
Task4 implemented37ef32a:115 focused/7files,typecheck pass. Reviewer /root/net3d_task4_review (astra high),01ea483..37ef32a pending. Report exact OnlineClock nowMs/epochMs, OnlineScheduler setTimeout/clearTimeout; OwnedOnlineTransport controller/onExit/dispose; peer and port ownership detailed. Parent spec clarification and validation docs awaiting commit after worker completed.
Ruling: Task5 transfers actual MessagePorts via validated preload window.postMessage, with renderer-owned typed onPort facade instead of attempting contextBridge callback port cloning — existing native preloads and official Electron MessagePorts guidance use this pattern — add focused bridge module/test and preserve exact source/epoch/descriptor checks; no generic IPC exposure. Source https://www.electronjs.org/docs/latest/tutorial/message-ports checked2026-11-15. Ordinary methods/status remain contextBridge.
Task4 review NEEDS FIXES: lost roster reconcile while issuance pending strands newer guestgen or later healthy seats on rejection. Fixround1/5 original implementer, source37ef32a/currentdocsHEADd1361f2. Cover generation replacement, departure rejection, unchanged failure no tightloop. Nativeactualcomposition and hostACK proof belong laterTasks5/7 and priorTask3 respectively.
Task4 COMPLETE: fixround1/5 (all addressed,0open),37ef32a..a96b9c5; /root/net3d_task4_rereview approved.31 affected/typecheck pass. Parent portbridge design/plan refinement committedfc53dc6. Task5 BASEfc53dc6.
Task5 implementer /root/net3d_task5 (sol high), running. Updated generatedbrief includes renderer-owned onlineBridge facade. Controller requested reliable initialstatus subscription delivery without older query overwritingnewerpush; named read-only status method allowed as routine typed API.
Ruling: Task5 extends shared onlineSession with typed preload API/fixedchannels and strict version1 revisioned status envelope — avoids Electron imports inrenderer and stale initialstatus-query races — extra internalIPC schema, no servicewire change. Monotonic positive safe revision scopedowner/window; subscribe-before-read ignoresolder/equalstatus; existingdigest coverscontract.
Ruling: enable installed electron-vite5 preload isolatedEntries:true/externalizeDeps:false — two preloads now share imports and sandbox cannot require relative split chunks; installeddist typings and officialhttps://electron-vite.org/guide/isolated-build confirm support — duplicate bundledsharedcode/buildtime, preserve sandbox and verify emittedimports plus nativegate. No dependency upgrade/custombundler.
Ruling: fix ordinary piped-build compatibility for pinned isolatedEntries reporter, not only validate withPTY — installed reporter unconditionally invokes missing stdout cursor methods at renderStart (lib-q6ns0vZr.js1035/1103) — narrowly scoped build-only missingmethod no-ops for nonTTY may suppress cursor manipulation only, never diagnostic/error logging; future tool upgrades should remove shim. Plain npm run build must pass. No node_modules patch/dependencyupgrade.
Task5 implemented993cefb:130 focused/9files,both typechecks,pipedbuild pass; both selfcontainedpreloads requireonlyelectron. Reviewer /root/net3d_task5_review (astra high),fc53dc6..993cefb pending. Renderer API exact in report: createOnlineBridge(window,window.ftlite.online) namedops/onStatus(OnlineStatus)/onPort(descriptor,DOMport)/dispose. Installportlistener beforeactions; one portlistener. Rawpreload statusrevision envelope; lifecycleunsubscribers nowavailable. Parentvalidation pending update.
Task5 COMPLETE: speccompliant/qualityApproved,no findings. Actualnative app proof remainsTask7. Source993cefb,parentdocs0a14f0f. Task6 BASE0a14f0f.
Task6 implementer /root/net3d_task6 (astra high), running. Exact typedbridge/report5 provided; primary physical0 mapsassignedlogical; snapshotsowned separately forfreeze; noprofilewritesonline.
Ruling: Task6 may add keyboardsources.reset() and ignore text/control-target keydowns — sampleDevices alone cannot clear held keys accumulated in menus — preserve keyup/blur clearing and couch body-target mapping, add focused regression; adjacent sharedinputmodule change only.
Ruling: Task6 corrects main Start capability to require current host lobby, alloccupied humansready/connected and native+service routesready, refreshing on peer changes; allReady matches seatGeneration — UI cannot infer route readiness from roster and existing source exposedstart tooearly despite dispatchguard — small coordinator/peer integration change plus focused regressions, no authoritychange. Renderer keeps defensive role/roster checks.
Task6 implementeda900937:210 focused/15files,typecheck/build pass. Reviewer /root/net3d_task6_review (astra high),0a14f0f..a900937 pending. Report exact renderer/router/menu APIs and testselectors. No debugglobal/testnetwork substitute. Parentvalidationdoc pending.
Task6 COMPLETE: /root/net3d_task6_review speccompliant/qualityApproved, no blockers. Minor deferred tofinalreview: sessionMenu retrycountdown subtracts renderer performance.now frommain performance.now origin; useepochdeadline/remainingduration and unequal-origin regression. Minor deferred: renderer draw passesclient?.ui instead ofclient?.ui??frozenUi afterstatusrelease, so nondefaultDoorsoutline resets whileHUDretainsselection. Task2 multisearthumanreplacement regression also deferred. Task7 BASE23c8918.
Ruling: Task2 human attach queues to beforeControls/beforeTick, so synchronous initial-close test checks cleanup at next safe boundary — avoids journal reentrancy — consumers must await actual full synchronization, not attach call completion. Per-seat bot controller memory initialized before baseline and reconciled from authoritative watermarks; generic runtime unchanged.

Ruling: final broad review covers this slice695996c..final source plus targeted unchanged seams — earlier Net3 slices already reviewed — earlier latent defects are not exhaustively re-reviewed. Full final regression/native gates remain required.

Ruling: Task1 config uses its own short URL predicate matching service validation, further restricted to HTTP loopback — generic client accepts HTTPS, config does not, so extracting a generic policy is unnecessary — matching predicates require regression coverage if policies change. Task1 exports validate/copy status/descriptor and fixed service-plus-local error union for later consumers.
Ruling: Task7 adds optional determinism --output-dir flag with existing default preserved — parent gate must write this plan's own evidence, not an earlier plan workspace — launcher-only option; default behavior unchanged.
Parent final validation at23c8918: acceptance exit0 in28.2054937s (unchanged30s target); engines exit0 in59.5812186s, Node/Electron/Firefox each1800 samples,404 boundaries. Evidence final-validation/*.log and *.json. Worker7 native/build clearance sent after gates complete. Prior timing gap historical, no optimization claim.

Ruling: Task7 may fix confirmed native app startup failure in online IPC registration after root-cause probe — synchronous BrowserWindow visibility appears false before first show on Windows; trusted ownership must not depend on painting timing — preserve exact sender/main-frame checks and add a focused regression, then rerun native proof.

Task7 native progress: actual menu Host/Join/Ready/Start and guest Player2 stream/ACK reported. Startup visibility regression confirmed/fixed with13 IPC tests; per-call visibility/sender/frame guards retained. Parent attempted screenshot inspection: both reported PNGs zero bytes; worker notified to fix capture and validate nonempty evidence. Native scenario suite not yet complete.

Parent service typecheck and Worker dry-run build pass (final-validation/service-typecheck.log,service-build.log); no deployment performed. Menu PNG recaptured nonempty via CDP and parent visually inspected clear centered menu; HUD image still pending. Worker debugging Windows document.hidden vs visible window for native input; production visibility guard must remain.

Parent signalling suite exit0:222 tests/14 files,23.49s; log final-validation/service-tests.log. Non-pristine output: deliberate DROP TABLE room_meta (tests/directory.test.ts125) and directory_rooms (tests/http.test.ts70) explain SQLite exception logs; additional async event-handler warning retained for final review, no service source changed this slice.

Task7 native progress: input/ACK/publication agreement reported after test-only Chromium native Windows occlusion switch, production visibility guards unchanged. Parent inspected nonempty online-player2.png: real Skiff and P2 interaction prompt. Deferred final-review visual finding: online status strip overlays hull/sector/mission/weapon HUD text at top0–56px. Native blur delivery still under probe; no synthetic DOM blur permitted as substitute.

Parent root suite RED:2447 passed/2 failed across176 files in60.57s. Both failures are networkBoundary generic enumeration treating new explicit sectorProducers and onlineSector adapters as generic code. Ruling: Task7 may add exactly those named sector adapters to explicit guard exceptions — approved mode adapters necessarily import sector definitions; existing sector/sectorStream exceptions establish policy — no broad directory exclusion, preserve all negative generic-boundary tests; targeted rerun required.

Task7 normal gameplay scenarios reported complete in39s for Skiff and sparse Cutter; cleanup still FAILS Object has been destroyed and missing utility exit evidence. Ruling: authorize narrow production shutdown lifecycle fix only after native stack confirms destroyed-window access — cleanup correctness is Task7 gate requirement — preserve actual process/utility exit assertions and regression test; no success claim until full report passes.

Parent native gates on Task7 stable product build: host15 checks/8utility exits PASS; RTC17 checks/3utility exits PASS; local-service workerd/Electron/1utility exit PASS. Reports/logs final-validation. Root typecheck passes after ProcessEnv harness correction. Task7 own native probes cleared.
Automatic approval review rejected worker recursive deletion of exact owned exploratory temp C:/Users/djuar/AppData/Local/Temp/ftlite-online-app-5NHXRP after resolved-path validation; no surviving app/workerd processes reported. No alternate deletion attempted by parent; worker told stop deletion attempts and retain/report cleanup gap. Exact rejection reason requested. Normal launcher temp cleanup independent and still required.

Task7 latest normal app report PASS35.663s:2 utilities/exits,6 hidden windows/exits,7 PCs observed closed,0 windows/ports/main listeners. Guest-death fault exits1 with expected reason and owned resource cleanup. Worker tightening observer for actual MessagePort prototype/transfers because Electron constructor export nonconfigurable; final strict normal rerun pending.
Automatic cleanup rejection supplied no reason beyond literal `rejected: blocked by policy`. Rejected exploratory root remains, no further attempts authorized by parent.

Task7 implemented5a3f7f5/evidenceeb176de, DONE_WITH_CONCERNS: observed HUD overlap deferred final review, exploratory temp automatic-policy rejection disclosed. Final normal38.330s PASS; three probes expected exit1/cleanup. Task reviewer /root/net3d_task7_review running23c8918..5a3f7f5. Parent final root2452/176PASS57.80s, both typechecks/native gates pass. No remaining source implementation pending task review.

Task7 review /root/net3d_task7_review NEEDS FIXES: Important raw stack/preload/page exception messages in smoke.cjs4,48–49 and driver responses violate diagnostic redaction. Original worker fixround1/5 dispatched BASEeb176de (reviewsource5a3f7f5), focused hostile-message regression/typecheck and affected diagnostic probe only.
Task7 minors deferred final review: report validator accepts missing generationAfter (undefined comparison), missing artifact hashes and nonempty failure (launcher separately rejects failure); cooperative launcher watchdog cannot interrupt hung Vite build. Retained native pass remains valid; reviewer inspected all4 reports, no duplicate native suite.

Task7 fixround1 sourcee198bc5: hostile diagnostic RED3fail/GREEN26pass,typecheck pass; affected transport-failure probe expected exit1/cleanup14.581s. Scoped reviewer /root/net3d_task7_rereview (sol high),eb176de..e198bc5 pending. Minor report admission/watchdog issues preserved for final review.

Task7: complete (commits23c8918..e198bc5, review clean after fixround1/5). Re-review raw diagnostic finding ADDRESSED, no new breakage; inspected actual probe JSON hashes/exits. Evidence limitation: review-round1 terminal log not present, so native stderr output claim not independently inspected; worker asked to clarify report without rerun. Deferred admission/watchdog minors carried to finalreview.

Final broad reviewer /root/net3d_final_review (astra high) running695996c..e198bc5 with full approved spec/plan, all deferred findings and validation. Parent confirmed review-round1 JSON/PNG only, appended report correction for absent stderr log without repeat probe.

Final review With fixes:2Important(overlap,noninterruptingbuildwatchdog),4Minor(countdownclock,frozenDoorsUI,reportadmission,stale/botHUD),plusmultiseatregression recommendation. Full findings final-review-findings.md. One combined final fixer next; one scoped re-review afterward. Declined judgments recorded and accepted as explicit scope/evidence limits, not silent drops.

Final combined fixer /root/net3d_final_fix (astra high),BASEe198bc5, all6 findings + multiseat regression, report final-fix-report.md. Parent owns docs/evidence staging; no staging while worker active. Approved plan explicitly preserves branch/worktree/no merge; finishing workflow will keep as-is rather than request a redundant integration choice.

Final fixer sourceaa5950b: root2474/179PASS58.19s, both typechecks/build/scoped checks pass. Native normal gate passed gameplay, but parent VISUAL FAIL:1280 shots hide hull and clip bottomcards;800x600 crops leftHUD/topship/bottomcards despite measured viewport assertions. Ongoing same fix wave returned for actual renderer logical sizing/fit correction before handoff/re-review. New screenshots required; machine viewport proof not sufficient.
Final combined wave sourceaa5950b,f36d441,d58b3f0,33d674b; evidence2a1e328/report7d1faa1. All6findings+multiseatregression addressed by implementer. Parent final root2479/180PASS57.85s, finaltypechecks/build/scoped49pass. Native final42.177sPASS, startup/buildtimeout probes2.939s/1.381sexpectedexit1/ownedcleanup. Parent visually inspected final1280x720/640x480Skiff/Cutter/couch with wrappedstrip/fullHUD and clearBOTcards. One nonreproduced cancellation-wait failure retained; unchangedwaits subsequentlypass twice, finite diagnostics added. One final scoped reviewer /root/net3d_final_rereview (astra high),e198bc5..33d674b running. No second broad review/fix wave.
FINAL COMPLETE: /root/net3d_final_rereview approved all7 findings, no new Critical/Important breakage, no new outofscope findings. Final source33d674b; parent root2479/180pass; all final validation documented. Preserve branch/worktree/evidence per approved plan; no merge/deploy. Nonreproduced cancellation failure and policy-rejected exploratory temp deletion disclosed. Final docs/evidence commit next.
