# Codex review exchange: web-i-impl

Subject: `docs/superpowers/plans/2026-11-18-web-i-online-in-page.md electron.vite.config.ts package-lock.json package.json scripts/network/duel-app-observer.ts scripts/network/duel-app-smoke.ts scripts/network/host-smoke-page.ts scripts/network/host-smoke-preload.cjs scripts/network/host-smoke.cjs scripts/network/host-smoke.ts scripts/network/internet-app-manifest.ts scripts/network/internet-app-report.ts scripts/network/internet-app-smoke.ts scripts/network/lease-smoke-observer.ts scripts/network/lease-smoke-page.ts scripts/network/lease-smoke.cjs scripts/network/lease-smoke.html scripts/network/lease-smoke.ts scripts/network/online-app-observer.ts scripts/network/online-app-probe-preload.cjs scripts/network/online-app-report.ts scripts/network/online-app-smoke.cjs scripts/network/online-app-smoke.ts scripts/network/online-observer-build.ts scripts/network/online-recovery-report.ts scripts/network/online-recovery-smoke.ts scripts/network/online-recovery-utility.cjs scripts/network/online-recovery-utility.ts scripts/network/page-port-tracker.ts scripts/network/page-probe.ts scripts/network/room-service-report.ts scripts/network/room-service-smoke.cjs scripts/network/room-service-smoke.ts scripts/network/rtc-config-smoke.cjs scripts/network/rtc-config-smoke.ts scripts/network/rtc-page.html scripts/network/rtc-page.ts scripts/network/rtc-smoke-client.ts scripts/network/rtc-smoke-native.cjs scripts/network/rtc-smoke-report.ts scripts/network/rtc-smoke.cjs scripts/network/rtc-smoke.ts scripts/network/worker-boot.cjs scripts/web/bg-tab/control.html scripts/web/bg-tab/control.ts scripts/web/bg-tab/drive.html scripts/web/bg-tab/drive.ts scripts/web/bg-tab/echoRuntime.ts scripts/web/bg-tab/front.html scripts/web/bg-tab/index.html scripts/web/bg-tab/page.ts scripts/web/bg-tab/protocol.ts scripts/web/bg-tab/report.ts scripts/web/bg-tab/run.ts scripts/web/bg-tab/tickWorker.ts services/signalling/README.md services/signalling/scripts/local-runtime.ts services/signalling/src/index.ts services/signalling/tests/origins.test.ts src/main/appExit.ts src/main/index.ts src/main/network/onlineConfig.ts src/main/network/onlineExit.ts src/main/network/onlineIpc.ts src/main/network/onlinePlatform.ts src/main/network/seatStore.ts src/main/network/transportWindow.ts src/network/host/contracts.ts src/network/host/workerHost.ts src/network/online/lifecycle.ts src/network/online/mirrorStore.ts src/network/online/onlineDuel.ts src/network/online/onlineIce.ts src/network/online/onlineMirrors.ts src/network/online/onlineModes.ts src/network/online/onlinePeers.ts src/network/online/onlineRetry.ts src/network/online/onlineSector.ts src/network/online/onlineSession.ts src/network/online/pagePlatform.ts src/network/online/recordStore.ts src/network/online/seatStore.ts src/network/platformPort.ts src/network/random.ts src/network/transport/bridge.ts src/network/transport/contracts.ts src/network/transport/owner.ts src/network/transport/pageTransport.ts src/preload/index.ts src/preload/networkTransport.ts src/renderer/networkTransport.html src/renderer/networkTransport.ts src/renderer/src/app/online/hostVisibility.ts src/renderer/src/app/online/pageSession.ts src/renderer/src/app/onlineBridge.ts src/renderer/src/main.ts src/renderer/src/ui/menuState.ts src/shared/bytes.ts src/shared/hostProcessProtocol.ts src/shared/onlineConfig.ts src/shared/onlineSession.ts src/shared/rtcSession.ts src/shared/sha256.ts src/utility/authorityHost.ts src/worker/authorityModes.ts src/worker/authorityWorker.ts src/worker/authorityWorkerMain.ts tests/appExit.test.ts tests/authorityWorker.test.ts tests/bgTabReport.test.ts tests/build-output.test.ts tests/bytes.test.ts tests/duelMode.test.ts tests/fixtures/web-i-recovery-hound-2.json tests/helpers/onlineHarness.ts tests/hostVisibility.test.ts tests/internetAppReport.test.ts tests/leaseRelayEvents.test.ts tests/linkStats.test.ts tests/menu.test.tsx tests/mirrorStore.test.ts tests/networkBoundary.test.ts tests/onlineAppDiagnostics.test.ts tests/onlineAppReport.test.ts tests/onlineBridge.test.ts tests/onlineConfig.test.ts tests/onlineCoordinator.test.ts tests/onlineDuel.test.ts tests/onlineDuelSession.test.ts tests/onlineExit.test.ts tests/onlineIce.test.ts tests/onlineIpc.test.ts tests/onlineLifecycle.test.ts tests/onlineMirrors.test.ts tests/onlinePeers.test.ts tests/onlinePlatform.test.ts tests/onlineRecovery.test.ts tests/onlineRecoveryInstrumentation.test.ts tests/onlineRecoveryReport.test.ts tests/onlineRetry.test.ts tests/onlineSector.test.ts tests/pageBoundary.test.ts tests/pagePlatform.test.ts tests/pageSession.test.ts tests/pageTransport.test.ts tests/platformPort.test.ts tests/recordStore.test.ts tests/roomServiceRuntimeGate.test.ts tests/rtcBridge.test.ts tests/rtcRuntimeGate.test.ts tests/rtcTransportOwner.test.ts tests/seatStore.test.ts tests/sha256.test.ts tests/transportWindow.test.ts tests/uiBoundary.test.ts tests/workerHost.test.ts tsconfig.web.json` (impl). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 959676ca, effort high, 485 s, 5848164 in / 5636343 cached / 32308 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 An Electron build from master cannot host against the deployed signalling service, and nothing a candidate builder reads says so
After this merge, the Electron page makes the service calls itself, so every request now carries an Origin (`null`, or `file://` on the socket). The deployed service predates Task 8. It refuses `Origin: file://`, and for `Origin: null` it calls `response.headers.set` on the immutable Durable Object responses for socket, checkpoint and turn. Either way an Electron candidate built from master cannot open a room socket, fetch TURN credentials or read checkpoints until the service is redeployed. The plan records only that Task 8 'ships only at Web-iii's deploy'. That reads as if Electron online play from master stays broken until Web-iii. `docs/gates.md` has no Web-i entry or warning at all. · services/signalling/src/index.ts:L62 (file:// allowed only in the new code) and L74-79 (copy before setting headers, new); diff L5002 and L5015 (master: `allowed` without file://, and headers set directly on `response`); plan L36 (D-2 'ships only at Web-iii's deploy'); plan L3702 (DO stub responses have immutable headers; only `POST /v2/rooms` got CORS headers before, because Electron main sent no Origin); docs/gates.md L811 and L850-877 (the candidate and redeploy procedure, with no Web-i note; a grep for 'web-i' in gates.md finds nothing); services/signalling/README.md diff L4942-4947 (covers only `npm run dev` origins). · The owner builds tester installers from master for playtests. Earlier milestones went out with 'service needs no redeploy', and Web-i changes no SIM_VERSION, so the natural assumption is again no redeploy. Hosting, joining, rehost and reconnect would then all fail in ordinary use on the first playtest build after this merge. That is the release-blocker class the brief names. · Keep master's Electron build working by deploying the Task 8 service change ahead of Web-iii. It is backward compatible: older Electron builds call from main with no Origin, so the new copy and Expose-Headers branch never runs for them, and `null`/`file://` need no `ALLOWED_ORIGINS` change. Reword D-2 at plan L36 to match. Whether or not you deploy early, add a Web-i entry to docs/gates.md saying that an Electron candidate built at or after 31c498d8 needs a signalling service deployed from that revision or later, and that the deployed service must be redeployed before any tester installer is built.

### [P2] R1-F2 No check starts the module host Worker from a packaged (asar) build
The Worker is built as `new Worker(new URL('../../worker/authorityWorker.ts', import.meta.url), { type: 'module' })` and loads from `out/renderer/assets/authorityWorker.js`. A packaged build loads it from inside app.asar over file://. Every Web-i gate, including `test:worker-boot` (which closed D-6), runs the unpackaged `out/`. A tester installer is the first time a module Worker would be fetched from inside an asar archive. · src/network/host/workerHost.ts:L33-35; electron.vite.config.ts:L28; package.json diff L235 (`test:worker-boot` = `electron-vite build && electron scripts/network/worker-boot.cjs`, unpackaged); plan L39 (D-6 decided on the unpackaged boot); plan L56 (gate list, no packaged run). · Hosting needs the Worker. If it fails to load from asar, every packaged host fails at `ready-timeout`, while every gate still passes. · Before the next installer, run the worker-boot check, or one host-runtime or duel-app pass, against `npm run package:candidate` output (win-unpacked with app.asar), and record the result in the plan ledger. If it fails, unpack the Worker chunk through `asarUnpack`.

### [P2] R1-F3 The duel host's leave→idle assertion was dropped without a recorded deviation
On master the duel gate ended with both seats leaving through the menu and reaching idle. The host now closes its window for the close gate, so only the guest's duel leave→idle is still asserted. D-9 covers only `stale`, and the plan has no entry for this. · diff L401-402 (removed: `for (const app of [g, h]) { await app.request('click', { id: 'leave' }); } await phase(h, 'idle'); await phase(g, 'idle');`); scripts/network/duel-app-smoke.ts (diff L418-422: guest leave only); a grep of the plan for 'leave…idle' finds no match. Partial cover elsewhere: scripts/network/online-app-smoke.ts:L168 (sector host leave→idle) and online-recovery-smoke 'leave-old-host' (diff L2671). · The duel is the menu's Multiplayer. Its renderer-side leave (onlineDuel's `leave: () => actions.leave()` in src/renderer/src/main.ts:L111) is not the sector's, so a regression in the host's duel leave would pass every gate. · Add a host duel leave→idle step that does not conflict with the close gate (for example, host a second duel lobby after the guest leaves and leave it from the host). Or record the gap as a stated deviation next to D-9.

### [P3] R1-F4 No test covers the clock-jump path's un-awaited suspend() then resume() on an active host
`createClockJumpLifecycle` fires suspend and resume synchronously, back to back (lifecycle.ts:L37). By trace the owner handles this safely: suspend's synchronous `savedState` retires the game, resume's second `savedState` only chains `gameRetiring`, and exactly one `reconnect` follows. The Worker host's own suspend listener sees `stopping` and goes to `stop('system-suspend')`, as on master. Every existing test awaits suspend before calling resume, though, so none covers this ordering. · src/network/online/lifecycle.ts:L37; src/renderer/src/app/online/pageSession.ts:L96-97 (`void owner.suspend()` / `void owner.resume()`); src/network/online/onlineSession.ts:L573-581; src/network/host/workerHost.ts:L263-270; tests/onlineRecovery.test.ts:L71, L79, L250 (all `await p.owner.suspend(); await p.owner.resume()`); tests/onlineLifecycle.test.ts:L14-19 (trigger only). · Web-ii's browser path relies on this ordering. A future change to suspend's synchronous prefix could cause a double reconnect or a stale-host race, and no test would catch it. · In tests/onlineRecovery.test.ts, add a case on an active hosted run that calls `void owner.suspend(); void owner.resume();` without awaiting. Assert that `invalidateLease` was called with 'suspended' then 'resumed', that the old host was disposed once, and that exactly one reconnect was dispatched.

## Verified
- Session move preserves behaviour (diff L6364-6541, L6022-6363). onlineSession, onlinePeers, onlineDuel, onlineSector, onlineMirrors and onlineIce differ from their src/main/network originals only by import paths, MessagePortMain→MessagePort, and the stated replacements: sha256Hex for createHash, bytesToBase64/base64ToBytes/bytesEqual for Buffer, randomHex for randomBytes. onlineModes and onlineRetry are 100% renames. The only new behaviour is `releaseForUnload` (onlineSession.ts:L583-587).
- mirrorStore keeps magic FTLNMIR1, the 557,056-byte cap and the 16,384-byte header cap, now over OnlineRecordStore (diff L6055-6110). seatStore keeps the 8,192-byte cap (seatStore.ts:L14). recordStore uses database 'ftlite', version 1, store 'records', keys seat-v1 and mirror-v1, one put per readwrite transaction (recordStore.ts:L9-L53).
- workerHost implements HostProcessHandle unchanged (diff L5709-5969). Readiness is workerReady plus bridgeReady from transport-ready (workerHost.ts:L115-117, L236-241). The lease is invalidated on suspend and resume (L263-270, D-4). kill is idempotent through `exited || killed` (L57). The 5 s ready, request and lease paths are identical to hostProcess.ts.
- Clock-jump detector: a 1 s interval and the rule `(Δwall − Δmono) > 15000` (lifecycle.ts:L5, L33-38). bfcache pagehide/pageshow with persisted:true suspends and resumes (L39-40). No visibilitychange listener exists (tests/onlineLifecycle.test.ts:L20-22). Electron uses createElectronLifecycle over the preload's app:suspend/app:resume (pageSession.ts:L50; main/index.ts:L44-46).
- A non-persisted pagehide calls releaseForUnload (pageSession.ts:L98-99, L133). That calls `stop(undefined, true)`, which issues host-release before cleanup closes the socket and captures no checkpoint (onlineSession.ts:L123-129). If main's 3 s cap fires first, the later pagehide still sends the release.
- Close handshake (appExit.ts:L7-37): a 3000 ms timer, an early finish on render-process-gone, one request per close or quit (a second close is preventDefault'ed and joins), a request-number-matched answer only from the main frame, and `ready` set before win.close()/app.quit() so the second close passes through. `will-prevent-unload` is preventDefault'ed, which allows unload (main/index.ts:L49). The preload answers even with no handler (preload/index.ts:L20-24). tests/appExit.test.ts covers the double close, the timeout and render-process-gone.
- Trust boundary: the session object stays inside createPageOnline. The only window property is `__ftliteOnlineTest`, a frozen, non-writable, non-configurable facade without the seat token, set only when `testProbe && !packaged` (pageSession.ts:L53, L136-138). toPageOnlineConfig sets the test fields only when unpackaged, and validatePageOnlineConfig rejects packaged configs carrying them (shared/onlineConfig.ts:L30-37, L48). The preload freezes the config and falls back to disabled (preload/index.ts:L11-17). Main answers the config only to its own main frame (main/index.ts:L32-33, L40).
- Signalling: `file://` is allowed like `null` (index.ts:L62). On every allowed response with an Origin, the response is copied (101 with webSocket handled) before Allow-Origin, Vary and Expose-Headers: X-FTL-Checkpoint are set (L72-79). tests/origins.test.ts covers checkpoint GET exposure for a listed origin and null, and socket 403/101 for evil, listed, null and file://.
- Hidden-tab warning: active only when `bridge && !window.ftlite`, so off in Electron, and keyed on role === 'host', so off in Single player (main.ts:L88; hostVisibility.ts:L16). The lease relay path is timer-free across coordinator, serviceClient and workerHost (tests/leaseRelayEvents.test.ts).
- Merge of master: main.ts wires SOLO_SHIPS, soloShip, the Valkyrn laser fit and installCrt through createPageOnline and createOnlineBridge (main.ts:L71-L136). A grep across src, tests, scripts and build finds no import of any deleted module (main/network/*, utility/authorityHost, networkTransport); only build-output.test.ts asserts their absence.
- Gate rewrites reviewed: online-app-report and online-recovery-report rename utility/window counters to worker/page counters with the same equalities, and unobserved counters now stay null. stale fails by name under D-9 (diff L2601). The duel gate adds the minimized-host (≥59 Hz, lease kept) and close-gate (fresh checkpoint ≤3 s, workers===workerExits, ports 0, exit 0) assertions, both required (diff L369-L443).

## Not verified
- `tsc -b`, `tsc --noEmit -p tsconfig.web.json` and lint: this session had no shell tool, so I could not run them. The plan ledger (plan L56) records `typecheck` 0 at 38f30b75, but not at the merge 100e8548.
- Master originals were compared through the prepared diff (.superpowers/sdd/web-i-impl.diff), not `git show master:`, because no shell was available. The diff omits docs/ and tests/fixtures/.
- No tests or Electron gates were run (constraint). The gate results come from plan L56.
- That Chromium's WebSocket handshake from a file:// page sends `Origin: file://` and that DO stub responses throw on `headers.set` are taken from plan L36 and L3702, not observed.
- That a module Worker loads from inside app.asar in a packaged Electron 37 build (P2 finding above).
- Whether the 100e8548 merge commit's own changes (master's Valkyrn/CRT files) contain conflicts beyond main.ts: the prepared diff's commit list omits the merge commit, so only the final state of the files in the manifest was checked.

---

# Round 1 response (code revised to 60e368da)

I checked `round-1.json` against `master...HEAD` at `100e8548`. All 4 findings are accepted and fixed in `60e368da`. None were rejected or deferred.

Verification:
- `npm run typecheck` is clean.
- `npm test` passed with load flakes only. The last full run had 7 failures out of 5,117 tests (5,110 passed). The set of failing tests changed from run to run, and all 7 pass when run alone (159/159).

## R1-F1 [P1]: An Electron build from master cannot host against the deployed signalling service, and nothing a candidate builder reads says so

Confirmed against the code:
- `services/signalling/src/index.ts:62` admits `file://` only in the new code.
- `index.ts:74-79` copies the response before setting headers, which is also new.
- `docs/gates.md` had no Web-i entry.

Fixed in documentation; the service is not deployed. The deploy is outward-facing and needs the owner's Cloudflare login, which the spec assigns to Web-iii. The controller therefore does not deploy it, and the owner is told that the early deploy is the recommended fix.

Changes:
- `docs/gates.md` gains a Web-i section. It says that an Electron candidate built at or after `31c498d8` needs the signalling service deployed from that revision or later. It explains why the change is backward compatible with older Electron builds, and why it needs no `ALLOWED_ORIGINS` change for `null` or `file://`. It gives the deploy command and adds an unchecked owner gate: "Redeploy the signalling service before building any Electron candidate from master".
- Deviation D-2 in the plan is reworded the same way.

## R1-F2 [P2]: No check starts the module host Worker from a packaged (asar) build

Confirmed: every gate ran the unpacked `out/`.

Fixed:
- `npm run package:candidate`, followed by the new `scripts/network/worker-boot-packaged.cjs`, prints `WORKER BOOT PASS` on Electron 37.10.3. The module Worker boots from inside `app.asar`, so `asarUnpack` is not needed.
- `scripts/network/worker-boot.cjs` now honours `FTLITE_BOOT_PAGE`.
- The result is recorded in the plan.

## R1-F3 [P2]: The duel host's leave→idle assertion was dropped without a recorded deviation

Confirmed against diff L401-402. Fixed with plan deviation D-10, next to D-9. It names three things:
- **What is uncovered:** the host's leave→idle in a duel.
- **What still covers it:** the sector host's leave→idle in `online-app-smoke`, and the recovery check `leave-old-host`.
- **How to restore it:** after the guest leaves, host a second duel lobby and leave it from the host.

## R1-F4 [P3]: No test covers the clock-jump path's un-awaited suspend() then resume() on an active host

Confirmed: every existing test awaits `suspend()` before calling `resume()`.

Fixed: `tests/onlineRecovery.test.ts` gains a case on an active hosted run that calls `void owner.suspend(); void owner.resume();`. The case asserts that:
- `invalidateLease` receives `['suspended', 'service-fenced']`;
- the old host is disposed exactly once;
- exactly one `service.join` follows.

The second reason is `service-fenced`, not the `resumed` the finding predicted. `suspend()` retires the host synchronously, so `resume()` finds no host, and the old host's lease is fenced when the service rejoin replaces it. That still means exactly one reconnect and no double dispose. It matches the trace in the finding.

## Also changed

- (nothing)

## Files changed

- docs/gates.md
- docs/superpowers/plans/2026-11-18-web-i-online-in-page.md
- scripts/network/worker-boot.cjs
- scripts/network/worker-boot-packaged.cjs
- tests/onlineRecovery.test.ts

<!-- end -->

---

# Round 2 (delta, reviewing 6afb9af5, effort medium, 48 s, 190939 in / 155556 cached / 3272 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — docs/gates.md L908-L922 adds a Web-i section. It names commit 31c498d8, says to redeploy before building any Electron candidate from master, explains why the change is backward compatible and why null/file:// need no ALLOWED_ORIGINS change, gives `npx wrangler deploy` from services/signalling, and adds an unchecked owner gate. Plan D-2 (L36) no longer says 'ships only at Web-iii's deploy'; it now says the deploy must happen before any Electron candidate and may happen ahead of Web-iii. The deploy itself is correctly left to the owner, which the finding allowed ('whether or not you deploy early').
- R1-F2: resolved — scripts/network/worker-boot-packaged.cjs copies dist/win-unpacked and renames resources/app.asar to page.asar so the bundled resources/app/main.cjs (worker-boot.cjs) runs. It then loads page.asar/out/renderer/index.html with the packaged FTLite.exe. worker-boot.cjs honours FTLITE_BOOT_PAGE (L10). The result (WORKER BOOT PASS, Electron 37.10.3, no asarUnpack) is recorded in plan L57 and gates.md. Small caveat: package:candidate (package.json L23) does not rebuild out/ first, so the check depends on a fresh electron-vite build. The gate procedure builds first anyway.
- R1-F3: resolved — Plan D-10 (L43) records the gap next to D-9: the host's renderer-side duel leave reaching idle is no longer asserted. It names the partial cover (online-app-smoke sector host leave, online-recovery-smoke leave-old-host) and how to restore the check. gates.md L921 lists it as an open item. This is the 'record as a stated deviation' option the finding offered.
- R1-F4: resolved — tests/onlineRecovery.test.ts L254-263 builds an active hosted run (reconnect then rehost), clears the mocks, then calls `void suspend(); void resume();` without awaiting. It asserts invalidateLease ['suspended','service-fenced'], dispose called once and join called once. The trace matches the code. suspend (onlineSession.ts L573) queues 'suspended' and then savedState→retireGame, which synchronously queues 'service-fenced' (L175) and clears c.host. resume (L578) sees no c.host, so no 'resumed' is queued, and it reconnects exactly once (L580). The finding predicted 'resumed', but the test pins the actual, safe ordering, so the risk is covered. The response explains 'service-fenced' as coming from the rejoin. In fact the synchronous retire on suspend queues it, as the test's own comment says. The difference does not change what the test covers.

## Verified
- onlineSession.ts L165-L183, L573-L581: suspend retires the host synchronously through savedState→retireGame, which queues invalidateLease('service-fenced') at L175. resume then finds c.host undefined and dispatches a single reconnect. This matches the new test's assertions.
- tests/onlineRecovery.test.ts L15-L66: the harness's host.invalidateLease, dispose and service.join are vi.fn mocks. The new case uses the same active-host setup as the existing L250 case.
- scripts/network/worker-boot.cjs L10: FTLITE_BOOT_PAGE falls back to out/renderer/index.html, so the unpackaged test:worker-boot behaves as before.
- scripts/network/worker-boot-packaged.cjs: renaming app.asar lets Electron fall back to resources/app/, the page loads from inside the asar archive, and the temp dir is removed in finally.
- docs/gates.md L908-L922 and plan L36, L43, L57 agree with each other: the redeploy is an owner step, D-9 and D-10 are open items, and the packaged check is recorded.

## Not verified
- I did not run the packaged worker-boot check or the new unit test (read-only review; running the suite and the Electron gates was ruled out), so the recorded PASS results are taken from the plan and gates.md.
- The signalling service has not been redeployed. That is the owner's step and stays unchecked in gates.md L916. Electron candidates built from master will fail online play until it is done.

---

# Round 2 response (no subject change)

I checked `round-2.json` against `6afb9af5`. The verdict is ready, with no new findings, and all 4 round 1 fixes are confirmed resolved.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

