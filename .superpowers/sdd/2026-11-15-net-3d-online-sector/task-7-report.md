# Net-3d Task 7 report

Status: DONE_WITH_CONCERNS. All requested application scenarios and final fault/timeout probes completed; concerns below are the retained exploratory directory and visual overlay observation. Source commit `5a3f7f5` (`test(net): prove online play through separate production apps`), base `23c8918`, branch `codex/net-3`, worktree `C:/Users/djuar/.codex/worktrees/56fc/FTLite`.

## Implementation and exact consumers

- `scripts/network/online-app-smoke.ts` launches the pinned `startLocalRuntime()` workerd service, builds a passive observer, launches separately profiled real Electron applications, drives their actual menus and native keyboard/mouse input, records source revision/artifact SHA-256 hashes, and performs bounded cleanup. Normal budget 90 seconds; `--report-path=PATH` selects durable JSON and screenshot output. `--inject-guest-failure`, `--inject-transport-failure`, and `--inject-timeout` must fail nonzero. The timeout probe deliberately holds the launcher's wait after actual gameplay and arms its watchdog, so the utility and both applications exist at timeout.
- `online-app-smoke.cjs` is a test-only executable wrapper, refuses packaged builds and any profile outside the exact invocation directory, sets `app.userData`, then requires the actual compiled app index. It does not import an alternate coordinator, service composition, client or gameplay producer. Native menu clicks and `sendInputEvent` keyboard input are used; UI fields are ordinary DOM controls. CDP captures the real rendered page, with a nonempty PNG check. Test code is absent from packaged entries.
- `online-app-observer.ts` listens to the production transferred renderer port, copies actual packets through production codecs/layout validation (real Skiff/Cutter), and observes full receipts, validated ACKs, publication hashes, owned-seat inputs and command results. It never sends a state/ACK/gameplay message. Native hidden-page observers preserve the real Chromium peer/channel implementations. Main MessagePort methods and successful native transfers observe actual endpoint ownership; Electron's constructor export is nonconfigurable, so the final observer uses the native port prototype, with its own bootstrap pair closed and excluded.
- `online-app-report.ts` refuses success without source identity, distinct actual Electron PIDs/exit evidence, expected shutdown/restart termination, observed main ports, native window/peer closure accounting, full receipt/ACK/input/command/agreement evidence, both layouts and sparse logical seat, bot takeover, increased generations, paused reconnect, blur neutralization and all rejection/cancel checks. Exit zero alone cannot pass. Native PC closure is reported separately from release by a confirmed owning-window destruction. Forced guest processes retain resource snapshots and actual exit evidence in their individual process records.
- `package.json` adds `test:online-app-runtime` (build then actual application gate). `services/signalling/README.md` documents normal/probe commands, instrumentation, timing and limits.
- Controller-requested `scripts/determinism/run.ts` accepts optional `--output-dir=PATH`, retaining its prior default. No fixture, threshold or prior-plan artifact changed.
- Controller-requested boundary maintenance adds only `modes/sectorProducers.ts` and `main/network/onlineSector.ts` to named mode-adapter exceptions in `tests/networkBoundary.test.ts`. Negative import tests and all other generic module guards remain intact.

## Native-discovered production fixes (controller authorized)

1. On Windows, immediately after `new BrowserWindow`, `isVisible()` was false; it became true on the next turn for an ordinary visible launch. `registerOnlineIpc` rejected before the app could load. Registration now checks main-owned single registration and destruction, while every invocation still checks actual visibility, exact webContents, main frame, argument shape and transferred-port rejection. Native initial failure was `online-registration-invalid` in `createWindow`.
2. Actual `closed` callbacks found `BrowserWindow.webContents` throwing `Object has been destroyed`. Native stack identified `onlinePlatform.onVisibleGone`'s unsubscribe; the identical pattern existed in `onlineIpc.remove` and hidden `transportWindow.dispose`. Those cleanup paths now retain the original webContents reference for listener removal. No catch-and-ignore workaround was added. Focused tests simulate the native getter becoming unusable after destruction. The normal native gate subsequently observes actual utility/window/process exits without these exceptions.

## Focus/visibility and screenshots

The automation desktop initially reported `document.hidden=true` while the native window was visible and DOM keyboard events had correct `KeyF`/`KeyD`, BODY target and focus. The wrapper disables Chromium `CalculateNativeWinOcclusion` for these test processes. Production focus/visibility guards remain active. Native minimize/restore causes genuine visibility/focus loss and reliable neutralization without global pause; no DOM visibility/focus property or event is fabricated. Visible application launch uses `windowsHide:false`; helper subprocesses use `windowsHide:true`.

`capturePage()` initially returned empty bytes in this environment. Final evidence uses actual Chromium `Page.captureScreenshot`, rejects empty output, and retains menu, Player 2 Skiff and Player 3 Cutter PNGs under the durable normal evidence directory. Parent inspected the menu and gameplay images. Visual observation retained for final review: the compact online strip overlaps underlying hull/sector/mission/weapon text at the top of the game. This is not hidden by the gate.

## TDD and focused verification

- Report RED: `npx vitest run tests/onlineAppReport.test.ts` exited 1 because the new validator module did not exist. Initial GREEN 19/19; final strengthened validator suite 22/22.
- Startup RED: `npx vitest run tests/onlineIpc.test.ts` exited 1, 12 passed/1 failed with `online-registration-invalid`. GREEN after the registration fix: 13/13.
- Native destruction RED: `npx vitest run tests/onlinePlatform.test.ts tests/onlineIpc.test.ts` exited 1, 18 passed/2 failed with destroyed-getter exceptions. GREEN with adjacent RTC owner tests: 29/29 across 3 files.
- Parent full-root run reported 2447 passed/2 failed, both stale mode-adapter boundary enumeration. Exact exceptions were corrected; focused boundary suite passed 32/32. Parent owns the full-root log and total accounting; no duplicate full suite was run here.
- Final focused command: `npx vitest run tests/onlineAppReport.test.ts tests/onlineIpc.test.ts tests/onlinePlatform.test.ts tests/networkBoundary.test.ts tests/rtcTransportOwner.test.ts`: **83/83 tests, 5/5 files, exit 0**.
- `npm run typecheck`: exit 0. Parent's earlier typecheck found inferred env-object deletion typing; explicitly typed `NodeJS.ProcessEnv`, then both parent and implementer typechecks passed.
- `npm run build`: exit 0 after the final production cleanup fixes; main 111 modules, preload 8 modules, renderer 878 modules. Ordinary piped build. No dependency/pin/protocol/SIM/checkpoint/serialization changes.
- Scoped `git diff --check`: exit 0. Routine Windows LF/CRLF notices only.

## Final source-pinned native evidence

Durable directory: `docs/superpowers/reviews/2026-11-15-net-3d-app-evidence/`.

All final commands use compiled production code and source revision `5a3f7f5`. JSON includes exact artifact hashes and the truthful dirty flag (controller-owned validation/rulings/evidence were uncommitted; runtime source was committed). Electron **37.10.3**, workerd **1.20261023.1**. The local service binds ephemeral loopback only, reads no `.env` files, uses synthetic local platform IP/quota salt, empty ICE servers, no provider credentials/TURN/deployment.

Normal command:

```text
npx tsx scripts/network/online-app-smoke.ts --report-path=docs/superpowers/reviews/2026-11-15-net-3d-app-evidence/normal/report.json
ACTUAL APP 2-seat skiff: input, ACK, bot, restart and paused rejoin proved
ACTUAL APP 4-seat cutter: input, ACK, bot, restart and paused rejoin proved
ACTUAL TWO-PROCESS ONLINE APPLICATION PASS
Exit 0; reported runtime 38,330 ms (<90,000 ms).
```

Normal observed proof:

- Eight distinct Electron process PIDs: actual host, initial/restarted guest processes, one incompatible-build application, and a short-lived real filler application. Four guest process deaths are deliberate restarts; all other final exits are observed exit 0. Two actual authority utility exits, workerd exit and exact temporary-root removal observed.
- Gracefully observed ownership cleanup: 26 actual main ports released; 7 observed native PCs explicitly closed; 6 hidden windows and all 6 closed events; remaining windows/ports/registered transport/status event listeners/peer owners all zero. Forced guest process records separately retain native resources before termination plus actual process exits; the aggregate graceful-window counts do not pretend killed renderers emitted JS close events.
- Skiff capacity 2, guest logical seat 1/Player 2: 8 full receipts, 54 validated ACKs, 2 applied pause/resume commands, 3 canonical host/guest matches; only guest-seat inputs. Bot held high-water 47→82 after guest process death. Generation 3→5 across two rejoin restarts (the preceding cancel/remove check had already advanced the reservation generation).
- Cutter capacity 4, sparse humans 0/2, bots 1/3, guest Player 3: 8 full receipts, 54 ACKs, 2 applied commands, 3 canonical matches; bot held high-water 49→77. Generation 1→3. The filler uses the real production menu to occupy seat 1, then the host's real Remove control removes it before Start. No starter fixture or seat renumbering is used.
- Both runs verify full ACK order before resumed input and matching run ID/sequence/tick/hash; reliable neutral after native focus/visibility loss while ticks continue; paused guest restart stays paused with unchanged tick. Old producers end with their actual killed processes.
- Invalid code returns not-found without a seat/hidden transport/utility. A separately copied compiled app with a different compiled digest returns incompatible and leaves host occupied-seat count unchanged. It uses the same actual menu, candidate compatibility logic and service. Cancellation deliberately delays native transport load completion, invokes actual Leave while connection is pending, returns to real Couch, then verifies no native transport/utility/listener remains after delayed work settles.

Final fault probes (each actual command exited 1 as required):

```text
npx tsx scripts/network/online-app-smoke.ts --inject-guest-failure --report-path=docs/superpowers/reviews/2026-11-15-net-3d-app-evidence/guest-failure/report.json
15,741 ms; failure "injected guest process death"; Electron exits 3/3; utility exits 1/1; observed main ports 6.

npx tsx scripts/network/online-app-smoke.ts --inject-transport-failure --report-path=docs/superpowers/reviews/2026-11-15-net-3d-app-evidence/transport-failure/report.json
14,708 ms; failure "injected transport death"; Electron exits 3/3; utility exits 1/1; observed main ports 6.

npx tsx scripts/network/online-app-smoke.ts --inject-timeout --report-path=docs/superpowers/reviews/2026-11-15-net-3d-app-evidence/timeout/report.json
15,303 ms; failure "launcher timeout"; Electron exits 3/3; utility exits 1/1; observed main ports 8.
```

Every final probe observes actual workerd exit and `temporaryRemoved:true`, remaining windows/ports/registered transport/status listeners/peer owners all zero. The deliberate guest-death and normal restart cases preserve live resource snapshots before targeted process termination. All four final JSON reports were separately read and checked for exact source revision, expected outcome, all Electron exits, matching positive utility/exit counts, workerd exit and exact-root removal. Final logs copied alongside each report. A credential/address-field scan of final JSON found no seatToken, local/remote ticket, SDP, candidate, Authorization/Bearer or loopback-address output. Reported screenshots are actual application renders; no test fixture scene is substituted.

## Exploratory failure cleanup exception

One earlier exploratory launcher run exposed an IPC-disconnect/exit-event race: `ChildProcess.send` happened after disconnection but before `exit`, causing an unhandled channel-closed event. The final launcher checks connectivity, handles asynchronous send errors and ChildProcess errors, and continues cleanup on individual failures. Subsequent final runs/probes are evaluated independently.

Read-only OS inspection after that exploratory failure found no remaining application/workerd processes. Its one exact temporary root remains:

`C:/Users/djuar/AppData/Local/Temp/ftlite-online-app-5NHXRP`

Automatic approval review rejected both resolved-path/equality-checked PowerShell recursive removal and direct `Remove-Item -LiteralPath` of that same root. The exact stated reason was **`rejected: blocked by policy`**, with no more specific reason supplied. Controller instructed no further deletion attempts or alternate mechanism. This retained exploratory directory is a real cleanup gap, separate from final normal/probe `temporaryRemoved:true` evidence. No global process kill or deletion outside an invocation's checked root was used.

## Limits and handoff

Loopback, one Windows machine and test-only occlusion handling are explicit. NOT RUN: independent utility lease gate, checkpoint mirroring, explicit rehost/recovery, deployed service, live TURN/forced relay, WAN, two physical machines. Packaged online remains disabled. Parent owns validation/rulings/ledger and full root/service/acceptance/engine/regression evidence, plus independent review. No subagents were dispatched, no merge/deploy performed, no prior plan artifacts changed, no owner checkout altered.

Self-review checked actual application composition, no credential logging, real layouts and native input, ordering evidence, source identity, incompatible artifact isolation, asynchronous IPC errors, expected restart vs graceful exits, transferred port accounting, bounded fault cleanup, exact temp deletion guards and staying out of controller-owned docs. Remaining concerns are the explicitly retained exploratory temp root and the observed top-strip overlap for final review.
