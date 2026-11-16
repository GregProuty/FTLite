# SDD ledger — plan: docs/superpowers/plans/2026-11-15-net-3e-recovery-internet.md

Execution approved by user: continue until done. Worktree C:/Users/djuar/.codex/worktrees/56fc/FTLite, branch codex/net-3, base 5249b50. Preserve existing reviewed Net-3d work. Tasks 1–8 authorized; Task 9 requires concrete external-action approval per approved spec. No merge/push.

Ruling: reuse existing isolated worktree and installed dependencies — verified clean branch and worktree list — owner checkout remains untouched.
Ruling: retain reports and evidence — plan explicitly requires source-pinned evidence — overrides generic scratch cleanup.
Ruling: use prior completed source baseline tests, then focused tests and final full regression — commits since final Net-3d validation are docs only — avoids redundant unchanged baseline run.

## Preflight
| Task | Internal consistency |
|---|---|
| 1 | Gate contracts, fake clocks, digest coverage agree. |
| 2 | Optional generic gate and separate required leased online entry preserve intermediate app. |
| 3 | Nondisruptive baseline and explicit paused settlement distinguish captures from public seal. |
| 4 | Atomic switch removes old online entry; bounded adoption differs from commit. |
| 5 | OS resume distinct from gameplay Resume; recovery always paused. |
| 6 | Controlled grant proof supplemented by real-service proof; local gate precedes HTTPS. |
| 7 | Async credential acquisition fits original setup deadline and bounded signals. |
| 8 | Candidate only, live fields NOT_RUN; final review before offering deployment. |
| 9 | Separate authorized external work; unavailable hardware remains NOT_RUN. |

| Shared tasks | Producer/consumer and finding |
|---|---|
| 1/2, 1/4, 1/5, 1/7 | SessionClock/identity/gate consumed by authority, orchestration, lifecycle, ICE; consistent. |
| 1/3 | Both add shared digest entries; sequential mutation tests preserve both. |
| 2/3 | Utility/host bridge and authority APIs extended sequentially; capture allowed closed. |
| 2/4 | startLeasedHost introduced then old startHost removed atomically. |
| 2/5 | completeBootstrap initial-only; restore cannot release pause. |
| 2/6 | Native controlled-grant fence proof is not real-service claim proof. |
| 2/7 | Abortable service request precedes authenticated connection accessor. |
| 3/4 | Capture IDs per utility epoch, adoption ack distinct from server commit. |
| 3/5 | Bounded exit capture feeds total 3s save deadline. |
| 3/6 | Replay/periodic invariance consumed by real recovery assertions. |
| 4/5 | Mirror store/status feeds saved/rehost lifecycle; service remains authority. |
| 4/6 | Initial commit and periodic candidate proofs feed real-service driver. |
| 4/7 | Coordinator config switch retains lease/mirror invariants. |
| 5/6 | Actual UI/manual claim recovery validated by native driver. |
| 5/7 | Peer replacement/connection identity ordering preserved on rehost. |
| 5/8 | Runbook consumes named rehost and bounded exit lifecycle. |
| 6/7 | Local recovery PASS required before HTTPS wiring. |
| 6/8 | Shared runtime observer/helper and evidence validators reused without alternate coordinator. |
| 6/9 | Local proof cannot promote external statuses. |
| 7/8 | Config/ICE provider consumed by candidate and relay-only driver. |
| 7/9 | Authenticated owner-bound credentials tested live only after approval. |
| 8/9 | Exact artifacts/runbook consumed after concrete authorization. |

No blocking conflicts found. No rubric conflict: required tests assert behavior and report failures; no mandated empty tests or copied logic.

## Tasks
Task 1: dispatch pending; BASE 5249b50.
Tasks 2–8: pending.
Task 9: external authorization boundary, pending concrete candidate.
Task 1: implementing via /root/net3e_task1 (sol high), BASE 5249b50.
Task 1: implementation d81f2f9; focused72/root2521/typecheck PASS. Independent review /root/net3e_review1 active. Bootstrap explicit renewNow after subscription; documented nonce/epoch strict hex.
Task 1: complete (commits 5249b50..d81f2f9, review clean).
Cannot-verify resolved by scope: utility clock/nonce/main isolation and enforcement are explicit Task2 requirements; actual service fence proof is Task6. No missing Task1 behavior. Existing optional-art warning retained as minor baseline observation, no asset changes authorized here.
Task 2: BASE d81f2f9; dispatch next.
Task 2: implementing via /root/net3e_task2 (astra high), BASE d81f2f9.
Task2 interim: authority/clock24, authority/mode22, private bridge29, service/platform64 focused checks passed; root typecheck passed. Reentrant rejected ingress replay pollution found/fixed with dedicated test (8 authority lease tests pass). Native controlled-grant harness in progress; no completion claim yet.
Ruling: beforeTick may receive nextTick/deadline arguments — compatible extension needed to preserve producer opportunity before advancement — existing zero-argument callback remains valid.
Task2 implementation 740fc31: 376 affected tests/typecheck/build PASS. Native controlled-grant normal PASS; fault/timeout expected exit1 with cleanup true. Review pending; missed-expiry grant replacement and replay settlement receive particular attention.
Task2 independent review active: /root/net3e_review2 (astra high). Task3 brief generated, not dispatched until review resolution.
Task2 review needs fixes: R1 per-control gate recheck/reentrant settlement; R2 absolute launcher+cleanup deadline. Fix round1 BASE740fc31.
Task2 minor R3: planned authorityClock/networkBoundary file edits absent; equivalent driver tests reside authorityLease and unchanged suites pass. Ruling: preserve focused test organization; explicit bot expiry case is a real requested-coverage gap and joins fix round1, not merely file-name compliance.
Task2 minor deferred R4: existing Git CRLF advisories retained as verification noise, not code failure.
Task2 evidence limitation: content digest excludes generic utility/main/harness. Existing build/report commit association resolves current provenance statement; retain artifact hashes in later Task6/8 source-pinned reports. No claim JSON alone proves binary provenance.
Ruling: R1 demonstrates replay serialization incompatibility — controls action currently means drain all queued controls, so an externally fenced partial batch cannot reproduce. Use explicit validated action cutoff/count in smallest new replay revision while preserving v2/v3 playback, rather than feeding expected results back into replay execution. Approved spec permits demonstrated format revision with migration tests. Cost: new replay schema coverage and downstream fixture compatibility; no SIM/checkpoint change warranted. Worker directed to document exact contract and backward tests.
Task2 fix round1 implementation f86ab6b: per-control guard + explicit replay4 interrupted-drain metadata (v2/v3 preserved), direct real bot expiry, shared absolute cleanup deadline. Focused92/typecheck/build PASS. Native normal/fault/timeout/slow-killer cleanup-timeout refreshed; exact source and built artifact hashes recorded. Scoped review /root/net3e_rereview2_1 active; not yet complete.
Task 2: fix round 1/5 (3 addressed, 1 open — R5 queued trusted Resume obstructs fence pause and replay; commits 740fc31..f86ab6b). Round2 BASE f86ab6b.
Task2 round2 c157a30: explicit v4 fence seal discardLifecycleResumes:true, legacy semantics retained; focused72/typecheck/build/native normal PASS. Scoped re-review /root/net3e_rereview2_2 (sol high) active. Negative cleanup evidence remains at prior unchanged harness/source snapshot as documented.
Task 2: fix round 2/5 (1 addressed, 0 open — R5 trusted Resume cleanup; commits f86ab6b..c157a30).
Task 2: complete (commits d81f2f9..c157a30, review clean after 2 rounds).
Task3: BASE c157a30; begin completed-boundary capture. Replay4 details in task2 report and docs/superpowers/reviews/2026-11-15-net-3e-rulings.md.
Task3 actual BASE67bc42d (includes evidence/docs milestone). Implementer /root/net3e_task3 (astra high) active. Tasks1–2 complete; do not redispatch.
Task3 implementation895bd4e: focused259/15files,typecheck,build,unchangedgolden PASS. Acceptance28.724s before final committed rerun; exact HEAD result pending report append. Review /root/net3e_review3 (astra high) active. Not complete until review.
Task3 exact committed-HEAD acceptance28.738s PASS (<30s).
Task 3: complete (commits 67bc42d..895bd4e, review clean).
Cannot-verify resolved: graceful3s deadline belongs Task5; initialDOcommit/upload limits Task4; native real-service recovery Task6. All explicit remaining tasks, no Task3 gap.
Task4 BASE895bd4e: next atomic mirrors/app activation.
Task4 implementing /root/net3e_task4 (astra high), BASE895bd4e. Task3 report/review exist but await parent evidence staging; parent progress modified only.
Task4 interim: mirrorStore14 + onlineMirrors8 initial tests GREEN after RED. Atomic app activation wiring underway.
Ruling: checkpoint PUT/GET gain optional AbortSignal options — mirror ownership requires canceling local I/O on disposal — existing callers remain compatible, uncertain server success still requires GET reconciliation. Optional filesystem injection follows seatStore for failure tests.
Task4 interim: coordinator32 + sector/status/HTTP101 passed; actual two-app normal gate passed Skiff/Cutter initial tick0 commit before bootstrap, tick300 capture/guest receipt. Both typechecks/builds passed. Self-review added same-rank metadata exact reconciliation, caller-byte copy, stalled persistence status, candidate errors, receipt age, metadata-only flush waiters. Final disk-load timeout verification/report/commit pending; do not treat interim native source as final.
Task4 implementationc0f3445: final265 distinct focused tests/15files PASS; both typechecks/builds PASS; exact source/artifact native normal50.336s PASS, cleanup complete. Review /root/net3e_review4 active. task-4-report.md and native JSON await parent evidence stage.
Task 4: complete (commits 895bd4e..c0f3445, review approved).
Cannot-verify resolved: utility fence/capture contracts independently reviewed Tasks1–3; service HTTP fence existing contract and real-service integration proof Task6; graceful3s/rehost explicitly Task5.
Task4 minor deferred: onlineMirrors load/fetch maps save-too-large to save-unavailable; preserve fixed error in Task5 touching saved UI, focused test, final review sees finding.
Task5 BASEc0f3445, saved UI/manual rehost next.
Task5 implementing /root/net3e_task5 (astra high), BASEc0f3445. Tasks1–4 complete; reports/reviews/native4 exist awaiting parent evidence commit. Task6 local recovery proof remains prerequisite HTTPS Task7.
Task5 ruling: do not unconditionally rejoin after claim — RoomAuth.join advances seat generation/retires socket, host connection replacement fences lease. For validated own-host host-changed snapshot retain same connection; uncertain successful reply may confirm via fresh service lease-renew query, never reuse that main stamp as utility permission. New utility still originates grant request. Without definitive snapshot reconnect/adopt actual service state and remain recoverable for explicit retry if uncertain own claim is fenced; no guessed generation/automatic claim. Tests must cover lost reply with/without snapshot, other winner, stale event/burned generation. No service protocol extension needed.
Task5 implementationa2618fe/reportb067fa6: final228 covering tests/14files,typecheck/build PASS. Review /root/net3e_review5 active. No native recovery claimed yet. Task4 minor save-too-large addressed pending review.
Task5 review requires fix: frozen renderer allocation compares layoutHash but not playerCount, same-layout new-room capacity mismatch throws. Fix round1 BASEb067fa6.
Task5 minor deferred: later ordinary pauses label latest mirror checkpoint as original restoration tick; route UI wording check into Task6 screenshots/native recovery, final review sees.
Task4 save-too-large minor now addressed by Task5 reviewed mapping/tests.
Task5 fix7994e98: real Cutter3→4 replacement RED→GREEN, playerCount allocation guard, 27 focused tests/typecheck PASS. Scoped review /root/net3e_rereview5 active. Minor restoredtick message remains Task6.
Task 5: fix round 1/5 (1 addressed, 0 open — frozen renderer playerCount compatibility; commits b067fa6..7994e98).
Task 5: complete (commits c0f3445..7994e98, review clean after1round).
Cannot-verify resolved: native recovery/fullACK/UI screenshots explicitly Task6. Do not claim proof before Task6.
Task6 BASE7994e98 pending dispatch. Minor restoration-tick copy from Task5 review should be fixed with focused UI regression during native screenshot verification.
Task6 implementing /root/net3e_task6 (astra high), BASE7994e98. Full local gates and native recovery next. Task7 forbidden until recoveryPASS. No externalactions authorized.
Task6 interim: reportvalidator25/menu33 focused GREEN; actual Skiff/Cutter recovery scenarios passed, screenshots generated. Parent inspected Skiff saved-small/paused-small/rehosting-normal fit/view/cards. Staleprobe not yet PASS: observation JSON truncate/read then Windows rename sharing races fixed harness-only; no production defect established.
Ruling: stale-host proof cannot use scheduled tickTimeMs as actual execution bound — catch-up ticks may have old scheduled timestamps. Publication-observed timestamp can legitimately lag admitted tick completion. Require passive actual utility permission/pre-tick admission observation, provenance/disclosed instrumentation, plus stable canonical tick/water after closed Resume/late grant; no relaxed deadline.
Task6 stable sourcea782ba4; root2676/189 PASS62.01s; service222/14 PASS25.50s; both typechecks/builds PASS. Engines Node/Electron/Firefox1800samples404boundaries PASS (parent inspected log). Acceptance ninecases PASS but final isolated timing pending. Final native sourcepinned/review still pending; Task7 brief generated only, not dispatched.
Task6 upload diagnostic5 ruling: exact restore input bytes and simulation snapshot match; differing dormant Skiff controllers were empty placeholders (both human seats), first publication initializes stations/groupBar/navigationVisit and reconciles producer counters [water0,5]/held[0,123]. Verify expected dormant-empty initialization via existing reconcileUi on committed snapshot, compare ALL fields, explicit water+1/held assertions and strict empty preconditions. Never blanket-normalize populated controllers; Cutter active bot decision/cursor/repeat memory remains exact. Preserve raw hashes/diagnostic5 and reject unexplained memory changes. This is proof correction for existing producer initialization, not changed game semantics or alternate save.
Task6 prior stable gates: acceptance28.824s; host15checks/8exits2.972s,RTC17checks8.686s,service2.855s,actualapp51.314s PASS; no cancellationflake recurrence. Stable report hardening sourcea53915e follows a782ba4; final recovery sweep encountered upload proof issue above, not yet all finalPASS.
Task6 final implementation8d24d2f/evidence379ce1c: six recovery scenarios PASS; six deliberate failures exit1 with complete allocatedcleanup,65observedPIDs0live. Root2679/service222, finalfocused40, both typechecks/builds PASS; acceptance28.824s, engines1800/404 all3PASS; host/RTC/service/actualappPASS. Earlier unconfirmed Leave failures retained, diagnosed observer resourcewait race fixed/regressed. Task6 review pending. Full721KB reviewpackage retained; code-view excludes only bulk .superpowers evidence hunks, reports/evidence separately reviewed.
Task6 review needs fixes (task-6-review.md): R1 validator8falseaccepts for contradictory/missing restore identity/water/ACK/rollback/processcleanup/staleerrors/suspendproof; R2 observed deadline based on outgoing request is later than internal requeststart/minserviceexpiry, exact passive gate samples needed; R3 scenario timer doesn't bound all driver/runtime cleanup, compose absolute90s budget with reserve. Actual runs/artifacthashes check out, but strict gate not accepted. Fixround1 BASE379ce1c. Known baseline stderr advisory retained as minor; no unrelated fixture work required.
Task6 fixround1 source689c835/validator5d08cf1/evidenced7e7754: semanticvalidator42+followup, total59focused/typecheck PASS; exactgate stale42.525s PASS; two-unresponsiveapp20sbudget expectedexit1cleanup13.226s; actualapp49.381s PASS; audit82PIDs0live. Separate detailed fix report task-6-fix-1-report.md. Historicalstale rejected bystrictnewprovenance, other5normal+newstale validated. Scopedreview /root/net3e_rereview6_1 active, Task7 stillblockedbygate notdispatched.
Task 6: fix round 1/5 (3 addressed, 0 open — semantic validator, exact gate deadline, absolute cleanup budget; commits 379ce1c..d7e7754).
Task 6: complete (commits 7994e98..d7e7754, review clean after1round). Local recovery PASS prerequisite satisfied for Task7. ActualOSsleep/WAN/TURN/deployment NOT_RUN. Earlier undiagnosed Leave failures retained as known risk for final review, not hidden/fixed claim.
Task7 next after parent evidence milestone; sourcecontinuity remains d7e7754.
Task7 actual BASE7a1b7c1 after reviewedrecovery evidence milestone; implementer /root/net3e_task7 (astra high) active. Defaultdisabled/configuredHTTPS code/mockTURN only; no live external authorization.
Task7 implementationca80604/evidence4722fbc:276focused/9files,65mockWorker/3files,both typechecks/rootbuild PASS; nativeconfig641ms andSkiffrecovery20.537s PASS;69source/artifacthashchecks match. Review /root/net3e_review7 active. Noactualrelay/liveprovider/external calls.
Task7 review needsfix: rtc-config-smoke tempallocated beforetry/finally and unboundedGit/source preparation; preparation failure leaks target and deadline unbounded. Fixround1 BASE4722fbc. Runtimecredential/config/signalling paths no blockingfindings,69hashesmatch. Minor existingWorker warning retained, no unrelatedfixturefix.
Task7 fixround1 source59e9e74/evidence4672d50: protected/boundednativeprobe prep,5coveringtests/root+directscript typechecksPASS; normalconfig480ms,prep-error72ms,slowGit15.099s,prep+stop-error71ms all expected outcomes within20s;8ownedexits/exacttempcleanup,24hashmatch. Scopedreview /root/net3e_rereview7 active.
Task 7: fix round 1/5 (1 addressed,0open — bounded/protected nativeprobe preparation; commits4722fbc..4672d50).
Task 7: complete (commits7a1b7c1..4672d50, reviewclean after1round). No blockingruntimefindings. Actualrelay/HTTPSnetwork/liveprovider/deployment remainNOT_RUN.
Task8 BASE4672d50 prepared. Controller owns per-task8review and finalwhole-slice review/fixwave/re-review; worker must notspawnreviewer. ExternalTask9 remains separateauthorization afterconcretecandidate.
Task8 implementing /root/net3e_task8 (astra high), BASE4672d50. Localcandidate/driver/runbook only; all externalgates NOT_RUN. Parent finalreview workflow prepared; no permissionquestion until concrete reviewedcandidate.
Task8 implementation0e9d024/evidence80dfded readyreview. Root2784/195,service222/14,37reporttests,typechecks/build/directscripts PASS; acceptance28.695s,engines1800/404all3; sixrecovery/currentapp/nativeconfig/negativecleanup PASS; final localinternetdriver13.645s. Candidatezip557c8dc18ef4225f4f8e538422d9df1067ca74230504a4f70da7b378e98dd202; externalNOT_RUN. Full1.32MBdiff retained; codeview excludesonlybulkworkspaceevidence. Task8review pending.
Task8 review needs fixes: R1 full executable-runtime equality missing (hostProcess/renderer mutation admitted); R2 cross-gate/candidate service-origin binding missing. Fix round1 BASE80dfded, original worker resumed. Minor archive/member consistency deferred to finalreview; current ZIP independently matched. Existing intentional stderr minor retained. External NOT_RUN remains correct.
Task8 fixround1 sourceb125547/evidence865a9b9:120focused/4files,root+directstrict typechecks PASS; all22 executable/47runtime hashes unchanged, explicit historical recovery/native provenance; manifest+driveroverlay updated. Parent reran fix-1/audit.ts exit0. Scopedreview /root/net3e_rereview8_1 active; no product/native rerun needed for tooling-only fix. ExternalNOT_RUN.
Task 8: fix round1/5 (2addressed,0open — complete runtime provenance and canonical service-origin identity; commits80dfded..865a9b9). Task8 complete after scopedclean review. Finalwhole-slice review next baseline5249b50; archive-member tooling minor and known Leave uncertainty explicitly in finalbrief.
Finalwhole-slice review865a9b9:3Important findings R1 stale followHost failure retires newer generation; R2 recoverylauncher pre-try unboundedGit/hash cleanup; R3 observer2s aborts allowed3s graceful save. ONEcombinedfix /root/net3e_final_fix (astra high) BASE865a9b9 dispatched with fullreport, regression/native/candidate refresh. R4ZIP member minor included for smallhardening or explicit newarchive audit. Review declines external/hardware proof and historicalLeavecause correctly; those remain Task9/knownrisk, no waiver or readinessclaim.
Final combinedfix HEADf7564f3 source65b92a3 runtime8d0b221:2839/197fullroot,193focused,bothtypechecks/auditPASS; sixrecovery,normal+delayedshutdownlocaldriver,app51.886s,config467msPASS; unresponsive12.765s expectedexit1 and3prepnegativeclean. Newcandidate882476a79956a4525aab1d15f115722fab940ebcacc48f7869b4c7aa76e0e5d4; R4independentZIPaudit performed, reusabletool minor deferred. One scopedfinalreview next.
Final review R4 parked Minor — Ruling: retain independent exactuniqueZIPmember/EXE/ASAR audit for both newarchives instead of adding newreusableparser in finalfix. Currentarchives verified; costifwrong futurepackaging could omitindependentcheck and pair staleZIP. Keepcheck mandatory untiltoolhardening. Parent reran final-fix-evidence/audit.ts exit0; no duplicate nativeexecution.
Final scopedreview /root/net3e_final_rereview: R1-R3 ADDRESSED, no newCritical/Important; R4Minor explicitlydeferred with both75memberZIPaudits independentlyverified. Reviewer checked36logs,81artifactrefs,265sourcefiles,47runtimefiles and6recovery22executablemaps. Tasks1-8 COMPLETE. Task9 pendingconcreteexternalapproval perplan; all externalNOT_RUN/internetReadyfalse. Branch/worktree/evidencepreserved,nomerge/push. Finalvalidation/release/rulingsupdated; onlydocs bookkeeping after testedsource65b92a3.
