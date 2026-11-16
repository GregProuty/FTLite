# Net-3e combined final-review fix report

Fix base: `865a9b9`. Product/runtime fix: `8d0b221a9922bd4e43914f9e45af92a08c1d4d4a`. Final tool/schema/source pin: `65b92a3d29fdf87bc719658cd071395224182546`. Evidence/docs commit follows these source commits. This is the single combined fix wave for [final-review.md](final-review.md), with one scoped re-review owned by the controller. No reviewer was spawned by this implementer. R1?R3 are implemented and verified; R4's reusable-tool hardening remains explicitly deferred with a concrete independent audit of both rebuilt archives.

## R1 ? host-follow ownership

Each follow transition captures the gameplay epoch immediately after retirement, adopts the advertised generation before yielding, and checks ownership after retirement, join, peer setup, connect, mirror refresh and peer attachment. Its catch only saves/retires the still-current transition. The obsolete-factory path continues disposing its own resource. Peer setup checks its epoch around both awaits; the queued factory also checks before allocation. Attachment failure handling cannot fail a newer gameplay epoch. Mirrors are invalidated synchronously at transition start.

The new regressions defer the older factory (resolve and reject), join, connect, and mirror continuation while generation5 connects. They assert generation5/status survives, its transport stays owned, and only the obsolete resource is disposed. Join/connect cancellation cannot revive Forget. A genuine current factory failure still becomes saved/unavailable and remains recoverable.

RED: `r1-r3-red.txt` contains four R1 failures (factory resolve/reject, stale join allocation, stale mirror) plus two R3 observer failures. Existing connect/cancellation controls passed. `onlineRecovery.test.ts` now has30 passing tests. No simulation, lease duration, checkpoint format, gameplay digest or acceptance threshold changed.

## R2 ? bounded protected preparation

The recovery launcher's report-directory creation, Git work, artifact reads and content hashing now run inside its protected try/finally. Git runs as explicitly owned asynchronous children with bounded output and the original absolute work deadline/cleanup reserve. Preparation failure records a fixed diagnostic and all owned Git outcomes even before source/runtime preparation completes. Git cleanup, instrumentation-read failure and exact-directory cleanup retain the initial failure. Report-write failure emits a fixed code plus the structured report to stdout after cleanup. The installed watchdog is cleared on every protected failure path.

RED: all five cases in `r2-red.txt` observed missed cleanup. The virtual launcher suite now covers failing/stalled Git, artifact-read failure, report-directory failure, and instrumentation failure during cleanup; it asserts removal, nonzero result, owned child retirement, no remaining watchdog and no inappropriate native allocation. Actual bounded negative runs are recorded separately, with exact child PIDs and temporary names: Git failure40ms, stalled Git10,108ms, artifact read80ms, all under the original20,000ms probe budget. The stalled child is forcibly terminated and its exit observed. All three allocate zero native processes and remove their exact temporary directory. `source:null` honestly denotes failed preparation; `tested-source.json` and source snapshots bind these probes to their executed source.

## R3 ? shutdown observation and service lifetime

The observer permits the production3s save plus native retirement inside a maximum4.5s observation window. Recovery/internet launchers pass the remaining request budget minus250ms return slack, constrained by the same absolute launcher deadline and cleanup reserve. The existing5s request cap is unchanged. Native-status observation is bounded before destroying the visible window. Remaining utilities/windows/ports/listeners/peers cause `shutdownComplete:false` and exit1; successful exit is only possible with complete observed retirement.

Fake-timer tests now prove retirement at3.4s cannot be interrupted at2s, and never-retiring resources produce failure inside a supplied700ms budget. Existing shared-request tests retain the absolute shutdown/termination/removal reserve.

During native integration, the strict internet report schema correctly rejected newly added observer fields. The unedited failed report/log/runtime record are retained under `r3-schema-failure-*`. A focused schema RED test (`r3-schema-red.txt`) reproduced rejection of valid bounded observations. The schema now permits only typed bounded optional observations, literal successful completion/acknowledgment, and still rejects partial cleanup, false acknowledgment, invalid timing and unknown fields. Existing reports remain compatible; no cleanup assertion was relaxed.

A second native RED probe exposed concurrent local runtime disposal: stopping workerd before app retirement fenced the host before its exit capture, so the deliberate delay never ran. `r3-sequence-red-native.json` retains `delayed-shutdown-proof-failed` at13,780ms, exact clean exits and zero delayed-save observation; it is not relabelled a pass. Its working manifest and exact three changed source snapshots are retained under `r3-sequence-red-*`. The local runtime now stays alive until every app shutdown/termination completes, then retires under the same absolute deadline.

The final delayed native probe passed at16,081ms. Host cleanup waited2,684.487ms; the final checkpoint PUT was delayed2,600.797ms and actually acknowledged by the live local workerd. Utilities/windows/ports/listeners/native peers and owned processes all retired before success. The normal local driver also passed13,566ms. Both remain loopback-only evidence, rejected as internet proof.

## Covering commands and actual output

```text
npx vitest run tests/onlineRecovery.test.ts tests/onlineCoordinator.test.ts tests/onlineAppDiagnostics.test.ts tests/onlineRecoveryPreparation.test.ts tests/onlineAppRuntime.test.ts tests/onlineRecoveryReport.test.ts tests/internetAppSmoke.test.ts tests/internetAppReport.test.ts
Test Files 8 passed (8)
Tests 193 passed (193)
Duration 11.99s

npm test
Test Files 197 passed (197)
Tests 2839 passed (2839)
Duration 61.02s

npm run typecheck
exit 0

npx tsc --noEmit --target ES2023 --module ESNext --moduleResolution bundler --strict --skipLibCheck --types node --allowSyntheticDefaultImports src/renderer/src/net/env.d.ts scripts/network/online-recovery-smoke.ts scripts/network/internet-app-smoke.ts scripts/network/internet-app-report.ts tests/onlineRecoveryPreparation.test.ts tests/onlineAppDiagnostics.test.ts tests/onlineRecovery.test.ts tests/internetAppReport.test.ts
exit 0
```

Complete outputs and exact command strings are in `final-fix-evidence/verification.json`, `focused-final-green.txt`, `root-tests-final.txt`, `root-typecheck-final.txt`, and `scoped-typecheck-final.txt`. Earlier RED/GREEN logs and the first full-root run remain retained. The final full-root rerun followed the schema/lifetime integration changes. Build and both package commands returned0; output is retained separately. Logs include expected optional-art stderr and native fixed diagnostic categories, plus PowerShell/Git presentation/CRLF advisories; passing does not mean pristine output. The early typecheck attempt caught a fixture tuple typing issue and a missing ambient declaration in the standalone command; both were corrected before the successful final checks.

## Fresh native evidence

Exact invocations, expected/actual exit codes and reusable runners are retained in `recovery-commands.json`, `native-commands.json`, `preparation-commands.json` and `run-*.ps1`.

| Evidence | Outcome | Elapsed |
| --- | --- | --- |
| `recovery-skiff.json` | PASS | 19,456ms |
| `recovery-cutter.json` | PASS | 21,878ms |
| `recovery-paused.json` | PASS | 19,374ms |
| `recovery-upload.json` | PASS | 19,264ms |
| `recovery-race.json` | PASS | 30,961ms |
| `recovery-stale.json` | PASS | 42,579ms |
| `online-app.json` | PASS | 51,886ms |
| `native-config.json` | PASS | 467ms |
| `internet-driver-loopback.json` | PASS | 13,566ms |
| `internet-delayed-shutdown.json` | PASS | 16,081ms |
| `recovery-unresponsive-cleanup.json` | Expected exit1 | 12,765ms |
| `recovery-git-failure.json` | Expected exit1 | 40ms |
| `recovery-git-timeout.json` | Expected exit1 | 10,108ms |
| `recovery-preparation-read-failure.json` | Expected exit1 | 80ms |

All six recovery scenarios executed the newly rebuilt main runtime at source8d0b221. The later65b92a3 commit changes only the observer/internet launcher/report schema/tests. `audit.json` records the actual report source, candidate source and every executable hash for each recovery run. `recovery-source/` preserves exact source bytes for all non-runtime paths named by those reports. `readiness.json` uses explicit full-executable equality provenance; no report revision or result was rewritten. The ordinary online-app, native configuration, normal/delayed local internet and unresponsive-cleanup probes execute the final tooling. Unresponsive cleanup intentionally lacks graceful resource snapshots and proves exact app/utility/helper/workerd exits and temporary removal instead; it finishes12,765ms within20,000ms.

The known historical Leave/cancellation failures remain unexplained. None recurred in these gates. R3 is a separately reproduced observer/service-lifetime issue, not a claimed explanation or repair for those historical failures.

## Candidate, rollback, source and historical boundaries

Current manifest: `final-fix-evidence/candidate.json`, source `65b92a3d29fdf87bc719658cd071395224182546`. Runtime build source:8d0b221. The audit checks zero source differences under `src/`, `build/`, main build config and package/lock files between those source commits, as well as exact compiled runtime hashes. Candidate47 runtime files,265 source files and2,253 ASAR entries are checked. Only `out/main/index.js` differs from the earlier Task8 candidate; all other46 runtime files, gameplay digest and Worker hashes match.

| Artifact | SHA-256 |
| --- | --- |
| `dist/net-3e-final-candidate.zip` (142,823,174 bytes) | `882476a79956a4525aab1d15f115722fab940ebcacc48f7869b4c7aa76e0e5d4` |
| Candidate EXE | `6de18f4b10d1e4aec3d904e6c2e049688d43d981dbc164c54bc9e0a7da275277` |
| Candidate ASAR | `481400b796b40041774d9aa0eb11cffc90b458bd66d43a348dda8f73dab7dd8d` |
| `dist/net-3e-final-rollback-disabled.zip` | `9af99a9c451c280132c7312b52e81c3a452d9bffd03b5b29783aca1b09ea5962` |
| Disabled rollback EXE | `f004293e3a08781f38027d2406757bc2be28012aaf0e1444b24a86bef2bbb87a` |
| Disabled rollback ASAR | `4214f9df4013207a5081a8843817d18eff7b6b77824fb6333afc34be21fc4256` |
| `dist/net-3e-final-driver-source.zip` | `c9b93e55cdcde59dcfb2b11d2010fe3950a307d1c5dac27b6071fd335b4c86bf` |
| Worker bundle (unchanged) | `fda351cb27f57961b61616324012f1d33969226b5356d51d8ad2749dc657eb33` |
| Worker config (unchanged) | `b9faa6b032720827399ddac179f1fe4021f33a6ee9c0a21d5420cac93a3212bc` |

The ZIP-member audit rejects duplicate/unexpected paths and hashes exact `FTLite.exe` and `resources/app.asar` members against each unpacked package. R4 remains a deferred minor in `candidate-manifest.ts`; `package-zip-audit.py` and `zip-member-audit.json` supply the explicit independent check required for this rebuilt candidate/rollback. The operator source ZIP's265 entries are independently checked against the manifest. Large archives stay ignored under `dist`; their metadata and scripts are retained. Current raw changed source/test snapshots and hashes are in `source/` and `tested-source.json`.

The audit executes the packaged resolver from both ASARs: candidate embeds only the intended nonsecret HTTPS origin in main, rollback is disabled, and ambient development overrides reject. Preload/renderer contains no release origin; env/secrets/profiles/tests/scripts/evidence are excluded from the player package. Unsigned installed-package manual gameplay remains NOT_RUN.

The unchanged service suite, acceptance and engine results are retained as historical evidence, not rerun or relabelled. `unchanged-runtime-provenance.json` binds the historical candidate, exact46 unchanged runtime hashes, gameplay digest and unchanged Worker/config hashes. Historical acceptance28.695s remains subject to the unchanged30s target. No gameplay re-bless or dependency upgrade occurred.

```text
npx tsx .superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-fix-evidence/audit.ts
Final-fix audit PASS: exact candidate/default-disabled rollback, compiled config, six recovery reports, native app, local-only driver, negative cleanup, and incomplete readiness.
```

`readiness.json`: localRecovery PASS; deployedService, forcedRelayGameplay, twoMachineGameplay and actualOsSuspend NOT_RUN; internetReady false. No live endpoint/provider/account/secret/root.env action, deploy, merge, push, billing/DNS/quota change or unrelated cleanup occurred. Parent-owned progress, final-review brief, validation and rulings edits were neither overwritten nor staged. Release candidate and operator runbook point to the new manifest/source overlay. Ready for the one scoped re-review of R1?R3 and the explicit R4 disposition.
