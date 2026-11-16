# Net-3d final combined fix report

Review baseline: `e198bc5`. Worktree: `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, branch `codex/net-3`. All work below belongs to the one authorized combined final fix wave; no subagents or reviewers were launched. Controller-owned validation, rulings, ledger and task-7 report were not edited or staged.

## Commits and evidence

- `aa5950b`: six review fixes and focused tests, plus recommended multi-seat regression.
- `f36d441`: visual verification exposed the existing minimum-scale clamp; correct downscaling and add full-scene bounds tests.
- `d58b3f0`: retain strictly enumerated role/expected-phase/actual-phase diagnostics after one otherwise unlocalized cancellation wait failure.
- `33d674b`: bot heading width correction after native visual inspection; final production/test source.
- `2a1e328`: exact native reports/screenshots/terminal logs and RED/GREEN/build logs.

Durable evidence root: `docs/superpowers/reviews/2026-11-15-net-3d-app-evidence/final-fix/`. Final normal proof pins full revision `33d674bc3d1d67fac1045cf7a346524edc8f1386`. Its eight recorded SHA-256 artifact hashes were independently recomputed against the current source/build and matched. Dirty=true is truthful: controller documents and evidence were uncommitted during the run; runtime source was committed before launch.

## Finding mapping

1. **Overlay/HUD overlap:** `sessionMenu.reservedHeight()` measures the actual playing strip, including couch; `main.ts` observes it with ResizeObserver and positions/resizes the canvas below it. Native inspection caught a second cause: `computeLetterbox` clamped scale to at least 1, producing negative offsets and cropping the smaller canvas. It now fits below native size while retaining half-step scaling above native size. Final screenshots show full hull/mission, ship and bottom cards at 1280x720 and 640x480. The small online strips actually wrap to 110px; normal strips are 57px. The test-only native resize command relaxes the ordinary application minimum for this stress case; production minimum sizing is unchanged. Canvas rectangle checks alone were insufficient; scene bounds tests and actual screenshots supplement them.
2. **Noninterrupting startup/build watchdog:** Vite/Miniflare startup and observer build run in `online-app-runtime-worker.ts`, an owned subprocess. The unchanged normal 90s deadline aborts the parent's readiness wait even if startup/build never settles. Cleanup requests graceful disposal, then bounds exact helper-tree termination and observes helper exit. Workerd PID is recorded at native spawn, before readiness, and its exit is observed through IPC or exact PID disappearance following forced termination. Existing owned Electron cleanup remains intact. Runtime errors/stderr are normalized, never forwarded raw. Tests/probes deliberately leave startup and observer-build awaits unresolved. No cloud service, configuration discovery or alternate networking composition is used.
3. **Clock-domain mismatch:** main converts the monotonic retry deadline to epoch milliseconds only for IPC display; renderer subtracts Date.now(). Retry enforcement remains in the untouched monotonic retry implementation. Tests use unequal process clock origins and retain retryAfter's exact 8s enforcement boundary.
4. **Frozen Doors selection:** renderer draw now receives `client.ui ?? frozenUi`, matching the HUD fallback. A real streamed-replica test seats the assigned player at Doors, selects a nondefault real door row, detaches via main status, and verifies the same selected tile from the detached UI/state.
5. **Report admission:** require positive safe generationAfter, all eight required source/build hash names with 64 lowercase hexadecimal characters, and no failure field value. Missing/NaN/infinite/fractional/unsafe generations, missing/malformed hashes and declared failure are rejected.
6. **Stale slots/bot ownership:** all four reused HUD slots are visited; unavailable cards/backgrounds/consoles are cleared and hidden, then restored when couch supplies those slots again. Presentation-only `bot` status retains health/state, removes local action prompts, and labels bot ownership explicitly. Native inspection caught long name-plus-BOT text colliding with the health bar: final heading is `P2 BOT`, with the standing bot's character name on the next line. Text-width regression reproduced 174px text crossing the 160px health-bar boundary before the fix.
7. **Recommended multi-seat regression:** one human binding owns [0,2]; replacement of seat 2 retires the entire old binding, restores bot 0, and stale detach/close cannot retire the replacement. Existing producer implementation passes; no producer/simulation code changed. An initial unrelated callout-result assertion was removed because it tested command settlement beyond this ownership regression.

## Exact RED/GREEN and checks

Full captured outputs are retained under `final-fix/checks/` using the named `final-fix-*.log` files. Logs are UTF-8 copies of terminal output. All failures below are retained, rather than described as passing runs.

- Initial RED: `npx vitest run tests/sessionMenu.test.ts tests/onlineRenderer.test.ts tests/onlineAppReport.test.ts tests/sectorProducers.test.ts` ? exit 1, 11 failed/47 passed (`red.log`). The countdown assertion was initially too loose (substring matched a huge number); it was corrected before implementation.
- Corrected RED: `npx vitest run tests/sessionMenu.test.ts tests/onlineRenderer.test.ts tests/onlineAppReport.test.ts tests/sectorProducers.test.ts tests/onlineCoordinator.test.ts tests/hudSlots.test.ts` ? exit 1, 16 failed/72 passed (`red-corrected.log`). Expected failures include main deadline 13000 versus epoch 1800000008000, renderer countdown 1800000003s versus 3s, dropped frozen UI, reconnect instead of bot, stale P3/P4, and invalid report admission. One failure was the subsequently removed unrelated callout assertion.
- Same six-file command GREEN ? exit 0, 88/88 (`ui-green.log`).
- Runtime RED: `npx vitest run tests/onlineAppRuntime.test.ts` ? exit 1, missing runtime-owner module (`runtime-red.log`). GREEN: same command ? exit 0, 2/2 with real helper/workerd processes (`runtime-green.log`). This RED is a missing-module failure; the substantive cancellation/exit behavior is exercised by GREEN and native probes, not claimed as an old-watchdog runtime reproduction.
- Strengthened Doors/native helper/diagnostic coverage: `npx vitest run tests/onlineRenderer.test.ts tests/onlineAppRuntime.test.ts tests/onlineAppDiagnostics.test.ts tests/hudSlots.test.ts` ? exit 0, 16/16 (`scoped-green.log`).
- Full root: `npm test` ? exit 0, 2474/2474, 179/179 files, 58.19s (`root-tests.log`). This ran before the later letterbox, diagnostic-context and bot-label refinements. Parent owns the final full-root rerun at stable source; this report does not claim that earlier total is a final-source full run.
- Letterbox RED: `npx vitest run tests/letterbox.test.ts` ? exit 1, 3 failed/1 passed, negative offsets -29/-240/-320 (`letterbox-red.log`). GREEN: `npx vitest run tests/letterbox.test.ts tests/render.test.ts tests/hudSlots.test.ts tests/hudViewer.test.ts tests/hudFit.test.ts tests/sessionMenu.test.ts` ? exit 0, 46/46 (`letterbox-green.log`).
- Safe wait diagnostic RED/GREEN: `npx vitest run tests/onlineAppDiagnostics.test.ts` ? exit 1, 1 failed/4 passed before helper; exit 0, 5/5 after finite allowlist (`wait-context-red.log`, `wait-context-green.log`). Hostile strings become unknown values; existing exception/payload redaction tests still pass.
- Bot label RED: `npx vitest run tests/hudSlots.test.ts` ? exit 1, width 174 must be less than 160 (`bot-label-red.log`).
- Final focused GREEN: `npx vitest run tests/hudSlots.test.ts tests/hudFit.test.ts tests/hudViewer.test.ts tests/letterbox.test.ts tests/onlineRenderer.test.ts tests/onlineAppDiagnostics.test.ts` ? exit 0, 49/49 (`final-focused.log`).
- `npm run typecheck` ? exit 0, including final source (`typecheck-final.log`). `npm run typecheck:signalling` ? exit 0 (`service-typecheck.log`). `npm run build` ? exit 0, including final source (`build-final.log`). Scoped staged source diff checks passed; ordinary Windows LF/CRLF notices only.

No acceptance, cross-engine replay, service test suite or existing native gate was repeated: no simulation/producer/service implementation changed in this wave.

## Actual native runs and retained failures

All commands use `npx tsx scripts/network/online-app-smoke.ts`; report paths below are relative to the evidence root. Normal target remains 90,000ms.

| Case / arguments | Source | Exit / reported time | Observed outcome |
|---|---|---|---|
| `--report-path=.../normal/report.json` | 33d674b | 0 / 42,177ms | Final normal gate PASS; eight Electron exits, utility exits 2/2, workerd/helper exits, exact temporary removal; windows/ports/listeners/peers zero, six native-window exits, seven native peers closed, 26 main ports observed |
| `--inject-startup-timeout --report-path=.../startup-timeout/report.json` | aa5950b | 1 / 2,939ms | Fixed launcher timeout; unresolved startup, forced helper exit observed, temporary removed; no Electron or workerd was spawned (`workerExit:false` therefore does not mean a leaked worker) |
| `--inject-build-timeout --report-path=.../build-timeout/report.json` | aa5950b | 1 / 1,381ms | Fixed launcher timeout; unresolved observer build after actual workerd startup; actual worker/helper exits and temporary removal observed |
| `--report-path=.../viewport-rejected/report.json` | aa5950b | 0 / 41,521ms | Gameplay gate passed but screenshots rejected: minimum-scale clamp cropped scene. This is not visual acceptance |
| `--report-path=.../cancellation-failed/report.json` | f36d441 | 1 / 19,766ms | Wait failed between delayed Join and Leave-idle; old fixed diagnostic omitted exact expected/actual phase. All process exits, workerd exit and temporary removal observed; guest required owned forced fallback |
| `--report-path=.../viewport-pass-label-collision/report.json` | d58b3f0 | 0 / 41,007ms | Unchanged cancellation waits passed; full scene visible, long bot label still collided. Retained as intermediate evidence |

Timeout helpers are byte-identical between the probe source aa5950b and final source; later changes are rendering and safe wait-context recording. The timeout probes were not repeated solely for revision cosmetics.

Final normal runs real menus/keyboard/RTC/workerd, capacity-2 Skiff and sparse humans 0/2 in capacity-4 Cutter, owned-seat input, canonical host/guest agreement, ACK-before-input, bot takeover, persisted generation increases, paused rejoin and blur neutralization. It includes actual couch gameplay screenshots. Six final screenshots are `normal/{couch,online-player2,online-player3}{,-small}.png`, plus the actual menu. Controller has inspected the scene-fitting screenshots; final bot-label screenshots are supplied for its final inspection.

The cancellation failure remains explicitly **nonreproduced and unexplained at its exact sub-boundary**. No wait threshold or control interaction was changed to make it pass. Finite role/expected/actual-phase context now survives future failures. Two later normal runs passed the same cancellation sequence. Do not describe all runs as green.

## Limits and handoff

No changes to strict ACK admission, main-only credentials, loopback-only configuration, packaged-online disablement, protocol/SIM/checkpoint/replay versions, simulation or service. Fixed diagnostic allowlists are preserved and strengthened; no raw exception/status payload is emitted by the new context helper. Source/test changes are committed; parent owns scoped rereview, final full-root result and final status documents.

Still NOT RUN/deferred: independent utility lease gate, mirrors/checkpoint recovery, rehost, deployed service, live TURN/forced relay, WAN, two physical machines. Native stress sizing and occlusion handling are explicitly test-only. No cloud/.env/secrets/deploy/merge action, no global process kill, and no retry of the previously policy-rejected exploratory temporary-directory deletion. That pre-existing retained directory remains outside this wave's successful per-invocation cleanup evidence.
