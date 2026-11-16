# Net-3e validation: local recovery

Status: **local recovery PASS after fix round 1; scoped re-review pending**. Six recovery scenarios, six original expected-failure cleanup probes and a two-unresponsive-app deadline probe completed. Internet readiness is not claimed. [The fix report](../../../.superpowers/sdd/2026-11-15-net-3e-recovery-internet/task-6-fix-1-report.md) records the strict semantic validator, exact gate deadline provenance and common cleanup budget corrections.

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

Local recovery PASS is the prerequisite for Task 7. Deployed service, HTTPS configuration, TURN/forced relay, WAN and two physical computers/different networks are **NOT RUN**. No credentials, deployment, billing/DNS/quota changes, upgrades, merge or push were performed.
