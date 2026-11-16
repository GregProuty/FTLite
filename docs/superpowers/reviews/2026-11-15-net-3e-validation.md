# Net-3e validation: local recovery

**External update:** The exact reviewed Worker is deployed with all four required secrets. Real HTTP admission, native deployed-service gameplay (15.746s), and selected forced-relay gameplay (15.676s) pass. Both apps agree on commands, state and committed checkpoints, with clean shutdown. The strict aggregate report validates localRecovery, deployedService and forcedRelayGameplay as PASS. Two physical computers and actual OS sleep remain NOT_RUN; internetReady is false. The owner has no second computer available now and requested the package. See [external evidence and remaining scenario limits](2026-11-15-net-3e-evidence/README.md). Earlier sections below retain local validation history; deployment and live TURN no longer await approval.

Status: **Tasks 1–8 complete; final whole-slice findings fixed and scoped re-review clean**. Local recovery passes; internet readiness is not claimed. Six recovery scenarios, six original expected-failure cleanup probes and a two-unresponsive-app deadline probe completed. [The fix report](../../../.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-6-fix-1-report.md) records the strict semantic validator, exact gate deadline provenance and common cleanup budget corrections.

The detailed Task 6 report and source-pinned JSON/log/screenshot evidence are in [the recovery workspace](../../../.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-6-report.md). Work uses branch `codex/net-3` in the isolated `56fc/FTLite` checkout. Gameplay digest remains `8a758f1ac9c0728946029c44ffbb1ceaf3d20ed2cfb9567ffcbf2690b1968144`.

The real production applications use Electron 37.10.3, native WebRTC and local workerd 1.20261023.1. Reports pin the launcher/driver, relevant source, all built JS/HTML and passive permission instrumentation. Each recovery pass has a separate 90-second bound and exact owned-process/temp cleanup. The same built application is reused for the native gates.

## Required recovery coverage

| Case | Evidence |
|---|---|
| Skiff host kill and explicit Re-host | Exact committed bytes, same run/seats, paused new generation, old host guest rejoin, full ACK, explicit Resume, canonical agreement |
| Sparse 0/2 Cutter | Same recovery path, vacant-seat bots and existing populated bot memory preserved |
| Host killed while paused | Last committed paused safe point restored |
| Host killed during held upload | Newer local pending checkpoint excluded; committed rollback restored |
| Simultaneous claims | One service winner; loser allocates no utility and follows winner paused |
| Live stale old authority | Main forwarding blocked 25 seconds, utility independently fences, service lease expires, another app claims, delayed real grant rejected |
| Resource/failure probes | Deliberate failure exit nonzero, exact allocated process exits and temporary removal |
| Saved/restoring/paused UI | Actual screenshots at 1280×720 and 640×480, frozen presentation and crew cards retained |

The stale-authority proof records actual utility-local permission-check time and unchanged permission result at final pre-tick, ingress and control boundaries. It does not use a scheduled tick deadline or socket closure as proof. Original and instrumented artifact hashes are retained. Actual OS suspension is **NOT RUN**; only the trusted suspend hook is exercised.

Normal scenario runtimes were 19.590 s (Skiff), 21.519 s (Cutter), 19.369 s (paused loss), 19.049 s (upload rollback), 28.470 s (competing claims) and 42.525 s (replacement stale live utility), each below its unchanged 90-second budget. The historical stale trace is retained but fails the corrected deadline-provenance check. The unresponsive cleanup probe exited 1 as expected in 13.226 s under a reduced 20-second budget. All allocated owned exits and temporary removals were observed. The fix audit found zero live candidates among 82 distinct captured PIDs. Exact source revisions, artifact hashes and later focused coverage are retained rather than representing every report as a final-source rerun.

Committed restore input and canonical state stay exact. Dormant empty bot UI may initialize only through the exact existing first-publication reconciliation rule; producer counters must match authoritative watermarks. Populated decision/cursor/repeat memory stays exact. [The retained diagnostic and ruling](../../../.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-6-development-failures.md) explain this distinction and the investigated driver timing failures.

## Retained regressions

Full root: 2679 tests / 189 files PASS; signalling: 222 / 14 PASS. Later test-driver/report-only edits passed focused coverage; exact source relationships are listed in the Task 6 report. Root and service typechecks/builds passed. Service build was dry-run only. Acceptance ran alone: 28824 ms against the unchanged 30000 ms target. Cross-engine replay passed 1800 samples and 404 result/event boundaries in Node, Electron/Chromium and Firefox, with output under this workspace's `engines/` directory. Existing host, RTC and real-service/native gates passed with all owned exits observed.

Fix round 1 passed 59 focused tests across five files and root typecheck. The affected existing actual-app gate passed again in 49.381 s. Full suites, acceptance and engines were not repeated for these test-only changes; built production artifacts are unchanged. The baseline stderr warnings and earlier unconfirmed Leave failures remain explicitly documented.

## Candidate verification after Tasks 7–8

HTTPS configuration, credential ownership and native ICE-policy construction passed local checks. They do not establish an actual selected relay route. Task 8 retained a fresh six-scenario recovery sweep, real-app gate, native configuration gate, cleanup probes and a local internet-driver rehearsal. Full root regression passed 2784 tests in 195 files; service regression passed 222 tests in 14 files. Acceptance took 28695 ms under the unchanged 30000 ms target. Node, Electron/Chromium and Firefox each passed 1800 samples and 404 boundaries. See the [Task 8 report](../../../.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-8-report.md) for commands, output, exact revisions and diagnostic limitations.

Task 8's review fixes passed 120 focused tests plus root and strict script typechecks. The corrected readiness validator binds all executable runtime bytes and the canonical compiled service origin. Its audit confirms all 22 executable files and all 47 runtime files remain unchanged from the native-tested candidate; explicit historical revision/byte-equality provenance permits reuse without pretending those runs occurred again. Both Important findings passed [scoped re-review](../../../.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-8-rereview-1.md).

The [release record](2026-11-15-net-3e-release-candidate.md) identifies the candidate, disabled rollback, exact Worker bundle/config, source overlay and proposed external action. Current readiness is localRecovery **PASS**; deployedService, forcedRelayGameplay, twoMachineGameplay and actualOsSuspend **NOT_RUN**; internetReady **false**. No live credentials, deployment, billing/DNS/quota changes, upgrades, merge or push were performed. Task 9 remains the concrete external-action approval boundary after final review.

## Final combined fix verification

The [whole-slice review](../../../.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-review.md) found three Important issues: an obsolete host-follow completion could retire the newer session; recovery-launcher preparation bypassed cleanup and deadline protection; and the shutdown observer could end before the permitted save completed. The combined fixes add transition ownership across awaits/catches, protected deadline-bounded preparation, and shutdown observation composed with the save/retirement budget. The local service remains alive until the final save completes. These changes do not establish the cause of historical Leave failures, which remains unconfirmed.

Current source is `65b92a3`, with runtime built at `8d0b221` and exact byte-equality provenance for subsequent tooling-only edits. Full root regression passed **2839 tests / 197 files**; focused verification passed **193 tests / 8 files**; both typechecks passed. Six fresh recovery scenarios, the actual-app gate (51.886s), native configuration gate (467ms), normal local internet-driver run (13.566s), and delayed final-save run (16.081s) passed. The delayed case observed an acknowledged checkpoint after a 2.6s injected delay, with all resources closed. Three preparation negatives and the unresponsive-app cleanup probe exited nonzero as expected with owned resources removed. The detailed [final fix report](../../../.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-fix-report.md) retains exact commands, outputs, failed intermediate runs and source pins.

Candidate and default-disabled rollback archives were rebuilt. Both ZIPs were independently checked for exact unique paths and EXE/ASAR member equality against the audited unpacked applications. Reusable ZIP-member enforcement in `candidate-manifest.ts` remains a Minor follow-up; it is not an unverified mismatch in these archives. The source overlay has 265 independently hashed entries. The final artifact audit passed again in the controller session. Historical service, acceptance and engine evidence is retained with explicit unchanged Worker/config, gameplay digest and 46-runtime-file provenance; those runs are not claimed as new executions. All external fields remain **NOT_RUN**.

The [single final scoped re-review](../../../.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-rereview.md) finds R1–R3 addressed with no new Critical or Important breakage. It independently verifies both ZIPs, all six recovery reports' executable hashes, and the source overlay. Branch `codex/net-3`, its isolated worktree, and evidence are preserved. The next action is the explicit Task 9 deployment/live-test approval described in the release record; no merge or push has occurred.
