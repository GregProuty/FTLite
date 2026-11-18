# Codex review exchange: web-i-plan

Subject: `docs/superpowers/plans/2026-11-18-web-i-online-in-page.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 82f6afa0, effort high, 1031 s, 18957190 in / 18604400 cached / 91007 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 1: the tick Worker posts its result on the Worker global, but the page waits for it on the relay port, so result() never resolves
tickWorker.ts sends the final measurement with `scope.postMessage({ kind: 'result', ... })`, which goes to the Worker object in the page. page.ts never listens on the Worker for 'message'. It resolves `workerResult` only from `relay.port1`. So `window.bgTab.result()` hangs, and with it the Step 11 smoke and the Step 12 run. · plan L199 (`scope.postMessage({ kind: 'result', ...})`) vs plan L266-267 (the only Worker listener is 'error') and L281-286 (`relay.port1.addEventListener('message', ... else resolveResult(message))`); L297 `await workerResult`; L551-553 and L560 `page.evaluate(() => window.bgTab.result())` has no timeout. · Task 1 is the spec §3.5 gate that everything else waits on. As written it can never produce a ledger entry, and the Playwright evaluate waits forever. · In tickWorker.ts post the result on the relay: `relay!.postMessage({ kind: 'result', ... } satisfies WorkerOut)`. Alternatively, add `worker.addEventListener('message', e => { if (e.data?.kind === 'result') resolveResult(e.data); })` in page.ts. Also give the driver's `result()` evaluate a bounded timeout.

### [P1] R1-F2 Task 1: the catch-up tick driver plus send-time relay stamps let a throttled Worker pass
The production tick driver accrues debt and, after a late wakeup, catches up with bursts of up to 120 ticks rescheduled at 0 ms. A Worker whose timers fire once a second still runs about 600 ticks per 10 s window. Each relayed tick is stamped `sentAt: wall()` when it is sent, not at its deadline, so burst ticks show small relay delays. The one figure that would expose throttling, maxTickLatenessMs, is recorded as data only. A Worker throttled to 1 Hz therefore passes 'worker-ticks', 'relay-delay' and 'tick-windows-missing'. · src/renderer/src/authority/tickDriver.ts:18-23 (debt accrual), :30 (0 ms reschedule while in debt), :37 (up to 120 ticks per pump); plan L208-213 (every onTick counted, `sentAt: wall()`); L139 and L473 (lateness is 'data, not a pass rule'); spec §3.5 L175-176 (the risk is the 60 Hz tick and prompt relay), L191-192. · This is the false pass the measurement exists to rule out. Path A would be chosen even when hidden-tab timers stutter, and the 'Keep this tab visible' fallback would never ship. · Measure relay delay from each tick's deadline: post `deadlineWall = performance.timeOrigin + deadline` and compute delay at receipt against it. Or count a tick toward its window only when `now - deadline <= 2 * 1000 / TICK_HZ`. Keep the spec thresholds (590 per window, p99 growth ≤ 20 ms). Add a report.ts case where on-time windows are full but lateness is 1000 ms, and assert that it fails.

### [P1] R1-F3 Task 5: spawnHostWorker.kill() is not idempotent, so its own test fails
`kill()` checks only `exited`, which is set later in a microtask. Two synchronous kill() calls therefore call `worker.terminate()` twice. The spawn-adapter test calls `worker.kill(); worker.kill();` and then expects `native.terminated` to be 1. · plan L2213 (`kill() { if (exited) return; try { worker.terminate(); } ... queueMicrotask(exit); }`) vs plan L2136-2137 (`worker.kill(); worker.kill(); ... expect(native.terminated).toBe(1)`). · Task 5 Step 5 fails as written. A real owner can also call kill twice: stop() runs on several exit paths. · Add a `killed` flag: `kill() { if (exited || killed) return; killed = true; try { worker.terminate(); } catch {} queueMicrotask(exit); }`.

### [P1] R1-F4 Task 10: changing createProbe's parameter type is not enough, because it calls the MessagePortMain `.on/.off` API
The plan says to change `createProbe(port: MessagePortMain)` to `MessagePort` and that 'the probe already speaks PortFrames through createPortLink'. But its endpoint adapter calls `port.on('message', …)`, `port.off(...)` and `port.on('close', …)`, which are EventEmitter methods of Electron's MessagePortMain. A DOM MessagePort has none of them. The changed file fails tsc under tsconfig.web (DOM lib) and throws a TypeError at `attachProbe` in rtc-page. · scripts/network/rtc-smoke-client.ts:36-39 (`port.on('message', receive)`, `port.off`, `port.on('close', cb)`); plan L4237 (type-only change), L4223 (`createProbe(gamePorts.get(...))` with a DOM MessagePort). · The RTC runtime gate and the room-service gate cannot run their fragmentation probe, and `npm run typecheck` fails in Task 10. · Rewrite createProbe to `const link = createPortLink(browserPortEndpoint(port), 'probe', { latestStreamKey: ... })`, using the file's existing `browserPortEndpoint` import, and drop the electron import.

### [P1] R1-F5 Task 11: the page probe counts every page MessageChannel, including React's never-closed one, so cleanup `ports === 0` can never hold
page-probe.ts replaces `window.MessageChannel` before any page script runs and counts every port that is neither closed nor transferred. React DOM's scheduler creates a module-level MessageChannel in browsers, which have no setImmediate, and never closes it. The page probe sees those ports, so `openPorts()` is at least 2 at shutdown. The rewritten report then rejects every run through `ports !== 0` and `shutdownComplete`. · plan L4429-4430 (subclass counts all channels), L4403-4404 (`openPorts`, `counts().ports`), L4553 and L4583 (shutdown result from the snapshot; `shutdownComplete = … && ports === 0`), L4602 (`['windows', 'ports', 'listeners', 'peers'].some(k => c[k] !== 0)` fails); the app is React 19 (plan L9). · test:online-app-runtime, test:online-recovery-runtime and test:duel-app-runtime fail on every run, for a reason unrelated to the online stack. · Count only online-owned ports: arm the probe from the driver just before Host/Join (`onlineProbe.set({ countPorts: true })`) and record channels only while armed. Alternatively, record only ports that pass through `worker.postMessage` transfers, `ftlite:online:test-port` events, or the page transport. Then assert those are closed or transferred.

### [P1] R1-F6 Tasks 9-11: the large gate rewrites are mapping tables, not code, and the tables contain concrete defects
host-smoke.cjs (327 lines), rtc-smoke.cjs (383), room-service-smoke.cjs (256) and the online-app-smoke.cjs command bodies (258) are specified only as old-to-new tables. A fresh implementer has to reinvent the riskiest code, and the tables have bugs. (a) rtc `early-cleanup` says 'start then immediately rtcPage.dispose()', but rtcPage.dispose only disposes `host` after `startWorkerHost` resolves, so the in-flight Worker is never terminated. (b) `stale-generation` says to intercept 'the generation-1 reply id' while posting the raw command to the generation-2 Worker; the interception has to be armed on the gen-2 host, or the gen-2 owner hits protocol-failure. (c) `early-worker-failure` calls crashWorker in a separate executeJavaScript, which can arrive after the Worker is ready. (d) `status` builds `recovery` from `onlineProbe.take()`, which drains bodies, captures and evidence, but the table never says where main accumulates them. · plan L3836 and L3866-3881 (host-smoke table), L4312-4325 (rtc-smoke table; early-cleanup L4325), L4334-4349 (room-service prose), L4540-4553 (command table); rtc-page L4205-4210 and L4227-4229 (`await host?.dispose()` with `host` unset until resolve); L3871 and L3877; L4402 (`take()` splices); the plan's own placeholder scan L4892. · By the review rules, a step a fresh subagent cannot follow verbatim is a placeholder (P1). These gates are the proof that Electron still works after the switch-over. · Give full replacement files for host-smoke.cjs, rtc-smoke.cjs, room-service-smoke.cjs and the online-app-smoke.cjs command switch. Add in-page helpers for the early cases, such as `startHost(options, { abortAfterSpawn: true })` and `crashOnSpawn`, so the abort or crash happens in the same task as spawn. Track the in-flight start promise in rtcPage.dispose. Name the host index that `intercept` binds to. Accumulate `take()` results in main per Worker.

### [P1] R1-F7 Task 8: setting CORS headers on Durable Object stub responses will probably throw, because fetched responses have immutable headers
The checkpoint, turn and socket routes return `room.fetch(...)` directly. In Workers, a Response obtained through fetch, including a DO stub's fetch, has an immutable header guard. The existing wrapper's `response.headers.set` has only ever run on mutable `Response.json` responses: Electron main's Node fetch and WebSocket send no Origin, and the only Origin test hits POST /v2/rooms. Task 8's new test is the first to send an Origin to `/checkpoint` and to the socket upgrade (a 101 with webSocket). The plan's code sets three headers on those responses with no copy. · services/signalling/src/index.ts:52-54 (`return room.fetch(...)`), :69 (`response.headers.set(...)` outside the try); services/signalling/tests/http.test.ts:42-44 (Origin tested only on POST /v2/rooms); plan L3678-3682 (adds Expose-Headers on the same object), L3637-3651 (new checkpoint-GET and socket tests with Origin). · If the headers are immutable, every page request to checkpoint, turn or socket returns a 500 or a failed upgrade. That breaks Electron online entirely after Web-i, and Task 8 Step 3 fails with no fix in the plan. · Before setting headers, copy the response: `if (response.status === 101 && response.webSocket) response = new Response(null, { status: 101, webSocket: response.webSocket, headers: response.headers }); else response = new Response(response.body, response);`. This is harmless if the headers turn out to be mutable. Keep the new tests, which then also cover this path.

### [P2] R1-F8 Task 11: the internet-app report validator and its fixtures keep the old cleanup field names
Task 11 changes only `INTERNET_ARTIFACTS` (internet-app-report.ts:6) and test lines 80 and 91. The validator at internet-app-report.ts:45-46 still requires `utilities`, `utilityExits`, `utilityPids`, `nativeWindows`, `nativeWindowExits` and `nativePeersEndedWithWindow`. The rewritten wrapper emits `workers`/`workerExits`/`nativePeersEndedWithPage` and no window fields, so the Web-iii live run would be rejected. · scripts/network/internet-app-report.ts:45-46; tests/internetAppReport.test.ts:13-14, 39, 55 (old-name fixtures); plan L4374 ('field renames' named only for internet-app-smoke.ts), L4608-4614; rename table L3733-3745. · Spec §8 says the internet-app manifests are updated in Web-i. Leaving the validator on the old shape moves a failure into Web-iii's live check. · Apply the shared rename table to internet-app-report.ts:45-46 (`c.workers !== c.workerExits`, `workerIds`, drop the window checks, `nativePeersEndedWithPage`). Update tests/internetAppReport.test.ts:13-14, 39 and 55 to match.

### [P2] R1-F9 The classic-Worker fallback covers only the product Worker, not the gate harnesses that hard-code module Workers
If the file:// module Worker fails, Step 7 switches to `format: 'iife'` without `{ type: 'module' }`. Every gate harness still builds `new Worker(url, { type: 'module' })`. The lease smoke loads the chunk through an ES `import` wrapper, and the recovery prelude is concatenated onto an ES chunk. None of these is adjusted. The fallback also contradicts the 'exactly' wording of Global Constraint L28, and spec §3.2, without stating which deviation entry to add. · plan L3576 (fallback), L28; harness Workers at L3561, L3780, L3931, L4207; `import` wrapper at L4137; prelude plus ES source at L4533. · If the fallback is taken, Tasks 9-11 fail in ways the plan does not anticipate. · Spell out the fallback: drop `{ type: 'module' }` in each harness; make the lease wrapper `importScripts('lease-observer.js', '<worker url>')`, with the observer built as iife; keep the prelude concatenation, which is valid for classic scripts; add a D-6 entry with its justification.

### [P2] R1-F10 Task 5: the duelMode.test edit points at the wrong line, so the old source read survives until Task 7 deletes the file
The plan says to change tests/duelMode.test.ts 'line 142' to read src/worker/authorityWorkerMain.ts. Line 142 is a comment. The `readFileSync('src/utility/authorityHost.ts')` assertion is on line 143. Followed literally, the old assertion stays and fails with ENOENT once Task 7 runs `git rm src/utility/authorityHost.ts`. · tests/duelMode.test.ts:141-143; plan L1946 (`line 142 to expect(readFileSync('src/worker/authorityWorkerMain.ts' ...`); plan L3488 (deletes src/utility/authorityHost.ts). · The suite breaks late, in Task 7, far from its cause. · Quote the target text: replace `expect(readFileSync('src/utility/authorityHost.ts', 'utf8'))` (currently line 143), and update the comment on lines 141-142.

### [P3] R1-F11 Task 1 adds pass and validity rules beyond spec §3.5 without recording them as deviations
report.ts adds failures 'tick-windows-missing' (at least 60 windows) and 'lease-starved' (at least 100 completions), and invalid reasons 'page-errors' and 'baseline-hidden'. They are reasonable and stricter than the spec, but the D-1 to D-5 list does not mention them. · plan L437-438 (RULES), L460-469; spec §3.5 L188-193; deviations L33-39. · The fixed decisions require plan deviations to be stated and justified. · Add a short D-6 entry listing the extra rules and why each is safe (they only tighten the rule or reject broken runs).

### [P3] R1-F12 The digest note names only onlineSession.ts, but Task 7 also edits rtcSession.ts and hostProcessProtocol.ts, which are in the same manifest
The claim is correct: the digest changes, nothing hashes it as a golden value, and the runner restamps it. But the note understates the change. Task 7 deletes constants from src/shared/rtcSession.ts and src/shared/hostProcessProtocol.ts, both listed in the digest manifest. · plan L16; build/contentDigest.ts:14,16; plan L3163. · A reviewer checking 'no gameplay change' should see every digest input that changes. · List all three files in L16.

## Verified
- releaseForUnload (plan L1516-1521) calls `stop(undefined, true)`. For an active host that issues `old.service.request({ type: 'host-release' })` (src/main/network/onlineSession.ts:122-125) before `cleanup` closes the socket (:115). serviceClient.request sends the frame synchronously inside the Promise executor (src/network/session/serviceClient.ts:467-478), and 'host-release' is a real request type (:59). The coordinator harness has `service.close: vi.fn()` and flips the phase to active on start-commit (tests/onlineCoordinator.test.ts:13,18).
- Chromium: plan L542 drops exactly Playwright's three throttling-off switches. The validity core matches spec §3.5 L188: hidden throughout (samples plus events), the sibling control's average period ≥ 900 ms, headless invalid, and the test page's own control period recorded as data (L399-402).
- Task 3 copies: Task 7 deletes all eight copied originals plus seatStore/mirrorStore/onlineConfig (plan L2943, L3484-3489). The only Node uses in src/main/network/online*.ts are the sites the plan rewrites (onlineSession.ts:1,261,496-497; onlineDuel.ts:44-45; onlineSector.ts:51-52; onlineMirrors.ts:20,128). src/network has no node:, require, Buffer or process uses.
- Task 3's sed import rewrites resolve correctly from src/network/online ('../session/serviceClient', '../rtc/contracts', '../../shared/*', '../../renderer/src/*').
- Task 4's sed ranges match src/main/network/rtcTransport.ts: lines 1-18 are the Electron import and the contracts, lines 134-155 are startGuestTransport.
- Consumed interfaces exist with the assumed shapes: createUtilityHost(registry, deps, post) and receive(raw, ports) (src/network/utilityHost.ts:13,70); RoomServiceClientOptions (serviceClient.ts:27-33); validateModeMirror (src/main/network/onlineModes.ts:41); validStreamAttachmentOptions accepts `origin` (src/shared/hostProcessProtocol.ts:25-32); copyOnlineStatus, copyOnlinePortDescriptor, validateOnlineResult, OnlineStatusEnvelope and DuelCrewSize (src/shared/onlineSession.ts:20,112-141); moduleSpecifiers (tests/helpers/determinismGuard.ts:4).
- D-1: testProbe is forced false when packaged (plan L1348), refused by validatePageOnlineConfig when packaged (L1360) and gated again in createPageOnline (L2829). The facade exposed on window omits prepareExit and dispose (L2912-2914).
- D-2 is safe either way: the wrapper allows null, 'null' and 'file://' (plan L3668), so Electron works whichever Origin Chromium sends from a file:// page. CORS preflight is already handled (services/signalling/src/index.ts:24-27).
- Worker chunk name: `worker.rollupOptions.output.entryFileNames: 'assets/[name].js'` (plan L3456) yields authorityWorker.js. It is checked by build-output (L3531) and by worker-boot (L3561-3567), which also proves the digest define reached the Worker. The renderer bundle is currently unminified (out/renderer/assets/bridge-g9Q9V1l6.js:1446 keeps named functions), so the recovery needles are plausible.
- Preload: the plan freezes the object before exposing it (L3322) and rejects malformed config to DISABLED (L3324). ipcRenderer.sendSync is part of the sandboxed-preload ipcRenderer surface.
- Determinism: build/contentDigest.ts:14 includes src/shared/onlineSession.ts. scripts/determinism/run.ts:13,17 recompute the digest and fixture.ts:49 restamps it. tests/contentDigest.test.ts:66 compares the define to the computed value, with no hard-coded hash. SIM_VERSION is untouched.
- Task ordering: every task consumes only earlier outputs (3→4→5→6→7). Task 8 precedes Task 10's file:// pages. Task 12 depends only on Task 7's bridge.
- Electron main: the rewrite keeps the `packaged ? __FTLITE_PACKAGED_SERVICE_ORIGIN__ : undefined` expression (plan L3248 vs src/main/index.ts:38), and all existing jobs (fullscreen, duel:record, navigation lock). No CSP exists in src/renderer/index.html that would block the page's fetch, WebSocket or Worker.

## Not verified
- Whether workerd gives Durable Object stub fetch responses immutable headers. This is the basis of the Task 8 finding; I did not run the signalling tests.
- Whether a module Worker loads from Electron 37's sandboxed file:// page. That depends on the GrantFileProtocolExtraPrivileges fuse, and the plan's worker-boot gate checks it. I also did not check IndexedDB availability for that origin.
- Whether Playwright 1.48's Firefox build (Juggler and its cfg prefs, for example forcing background tabs active) overrides firefoxUserPrefs (plan L544) or keeps hidden tabs 'visible'. If it does, every Firefox run would be invalid and Task 1 would be BLOCKED.
- Whether Electron's contextBridge keeps the preload's frozen onlineConfig frozen in the main world (spec §3.3).
- Whether `protocol.handle('file')` intercepts the Worker script fetch, and whether `request.url === pathToFileURL(...).href` matches on Windows (drive-letter case and encoding) (plan L4532-4534).
- I did not run `npx tsc --noEmit` or any test. The checks are by reading source.
- I read out/renderer/assets (outside the manifest) to check renderer minification for the instrumentation-needle question.

---

# Round 1 response (plan revised to 2d49f0fa)

I checked `round-1.json` against the plan at `47cfa22d`. All 12 findings are accepted and fixed, and none was rejected or deferred. Before accepting, I checked these against the source:
- `scripts/network/rtc-smoke-client.ts:36-39`, which uses the MessagePortMain `.on`/`.off` API (R1-F4);
- `tests/duelMode.test.ts:141-143`, where the assertion is on line 143 (R1-F10);
- `scripts/network/internet-app-report.ts:45-46`, which uses the old cleanup field names (R1-F8);
- `tickDriver.ts:18-37`, which shows debt catch-up (R1-F2).

The fixes are in plan commit `2d49f0fa`.

## R1-F1 [P1]: Task 1: the tick Worker posts its result on the Worker global, but the page waits for it on the relay port, so result() never resolves

Confirmed. `tickWorker` now posts `result` on `relay`. `run.ts` wraps every `result()` read in a 30 s timeout.

## R1-F2 [P1]: Task 1: the catch-up tick driver plus send-time relay stamps let a throttled Worker pass

Confirmed against `tickDriver.ts`. The fix to Task 1:
- Each tick carries `dueAt`, its deadline, and relay delay is measured from that deadline.
- A tick counts toward its window only if it ran within 2 tick periods of its deadline.
- A new `report.ts` case asserts that full windows with up to 1 s of lateness fail.

## R1-F3 [P1]: Task 5: spawnHostWorker.kill() is not idempotent, so its own test fails

Confirmed. Added a `killed` flag. `kill()` and the error path each terminate only once.

## R1-F4 [P1]: Task 10: changing createProbe's parameter type is not enough, because it calls the MessagePortMain `.on/.off` API

Confirmed at `rtc-smoke-client.ts:36-39`. `createProbe` is rebuilt on `browserPortEndpoint`, and the `electron` import is removed.

## R1-F5 [P1]: Task 11: the page probe counts every page MessageChannel, including React's never-closed one, so cleanup `ports === 0` can never hold

Confirmed. The page probe now counts ports only after the driver arms `countPorts`, on the first Host or Join click or the sector host/join. That excludes React's scheduler channel.

## R1-F6 [P1]: Tasks 9-11: the large gate rewrites are mapping tables, not code, and the tables contain concrete defects

Confirmed. The fixes:
- **Full replacement files** for `host-smoke.cjs`, `rtc-page.ts`, `rtc-smoke.cjs`, `room-service-smoke.cjs` and `online-app-smoke.cjs`.
- **Early aborts and crashes** now run inside the spawn task.
- **`rtcPage.dispose`** awaits a start that is still in flight.
- **The stale-generation interception** is armed on the generation-2 host.
- **Main accumulates the `take()` results** per Worker in `absorb()`.

`room-service-smoke.cjs` keeps its service client in Electron main. Only the transports, the host Worker, the observer and the guest client move into pages. The app gates (Task 11) cover the page session's own lobby traffic from a `file://` page, so nothing is left uncovered.

## R1-F7 [P1]: Task 8: setting CORS headers on Durable Object stub responses will probably throw, because fetched responses have immutable headers

Confirmed: the routes return `room.fetch(...)` directly (`index.ts:52-54`). The handler now copies the response before setting CORS headers, with a special case for the 101 WebSocket upgrade.

## R1-F8 [P2]: Task 11: the internet-app report validator and its fixtures keep the old cleanup field names

Confirmed at `internet-app-report.ts:45-46`. The zod schema, `checkCleanup` and the `internetAppReport` test fixtures at lines 13-14, 39 and 55 now use the renamed fields.

## R1-F9 [P2]: The classic-Worker fallback covers only the product Worker, not the gate harnesses that hard-code module Workers

Confirmed. The fixes:
- A new deviation, D-6, covers the fallback.
- The Global Constraint at L28 is reconciled with it.
- Task 7 Step 7 lists the change for every harness: drop `type:'module'`, load the lease wrapper with `importScripts` and an iife observer, and keep the prelude concatenation.

## R1-F10 [P2]: Task 5: the duelMode.test edit points at the wrong line, so the old source read survives until Task 7 deletes the file

Confirmed at line 143. The edit now quotes that assertion's text and replaces the comment on lines 141-142.

## R1-F11 [P3]: Task 1 adds pass and validity rules beyond spec §3.5 without recording them as deviations

Confirmed. A new deviation, D-7, lists the extra rules and says why they only tighten the test.

## R1-F12 [P3]: The digest note names only onlineSession.ts, but Task 7 also edits rtcSession.ts and hostProcessProtocol.ts, which are in the same manifest

Confirmed against `build/contentDigest.ts:14,16`. The note at L16 now names all three files.

## Also changed

- Task 9 Step 2: a stray `utilityExits` from an Edit lookup had leaked into the `forcedRendererExits` lines. It is removed.

## Files changed

- docs/superpowers/plans/2026-11-18-web-i-online-in-page.md

<!-- end -->

---

# Round 2 (delta, reviewing 9981e4e6, effort medium, 192 s, 1843759 in / 1705993 cached / 16955 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — tickWorker now posts the result with `relay!.postMessage({ kind: 'result', ... } satisfies WorkerOut)` (plan L205). page.ts resolves it in the relay.port1 listener's `else resolveResult(message)` (L291-293). run.ts wraps all three result() reads in `withTimeout(..., 30000, ...)` (L546-549, L572, L579-580).
- R1-F2: resolved — A tick counts toward its window only when `now - deadline <= ON_TIME_MS` (2*1000/TICK_HZ; L186, L218). Each tick posts `dueAt: performance.timeOrigin + deadline` (L220), and the page measures delay against dueAt (L282-283). The new report case (L421-426) uses delays of up to 983 ms, so p99 growth is far above 20 ms and the case fails 'relay-delay'. TICK_HZ exists at src/renderer/src/sim/tuning.ts:2.
- R1-F3: resolved — Added the `killed` flag (L2215). kill() returns when `exited || killed` (L2233), and failed() terminates only if not killed (L2224). The double kill() call now terminates once.
- R1-F4: resolved — createProbe is rebuilt on `createPortLink(browserPortEndpoint(port), 'probe', ...)` and the MessagePortMain import is deleted (plan L4583-4594). browserPortEndpoint is already imported at scripts/network/rtc-smoke-client.ts:3, and classifyStreamPacket and encodeOpaquePacket at :4.
- R1-F5: resolved — The MessageChannel subclass records ports only while `probe.flags.countPorts` is set (L5422-5424). The wrapper arms it in click(), host-sector and join-sector (armPorts, L5607-5608, L5652-5655). React's module-level scheduler channel is created at page load, before arming, so it is not counted.
- R1-F6: resolved — Full files are now given for host-smoke.cjs, host-smoke-preload.cjs, rtc-page.ts, rtc-smoke.cjs, room-service-smoke.cjs and online-app-smoke.cjs. I checked each part of the fix against Task 5's startWorkerHost. (a) The early abort and crash run inside create(). 'abort-after-spawn' aborts the signal during spawn, which hits `if (options.signal?.aborted) abort()` at L2450 → stop('cancelled') → kill. 'crash-on-spawn' dispatches its ErrorEvent in a microtask after the fully synchronous startWorkerHost body, giving failed() → stop('worker-exit'). (b) rtcPage.dispose awaits hostStarting (L4579). (c) The stale-generation interception is armed on the gen-2 host (`second.intercept(id)`, L4115-4117). The spawn adapter ignores the injected gen-1 reply through its generation check (L2392). (d) absorb() accumulates take() per Worker index (L5550-5567). --inject-worker-failure is still handled by the launcher (room-service-smoke.ts:37).
- R1-F7: resolved — The handler copies the response before setting CORS headers: a 101 with webSocket becomes `new Response(null, {status:101, webSocket, headers})`, and anything else becomes `new Response(response.body, response)` (L3704-3707). `response` is declared with `let` (L3695). The new socket and checkpoint tests cover this path.
- R1-F8: resolved — The internet-app-report cleanup zod schema and checkCleanup use workers/workerExits/workerIds/nativePeersEndedWithPage, with no window fields (L5753-5764). The test fixtures at lines 13-14 and the cases at 39 and 55 are updated (L5766-5773). These keys match the wrapper's shutdown result (L5679-5682).
- R1-F9: resolved — D-6 is added (L39), and L28 is reconciled with it. Task 7 Step 7 lists every harness change: the product Worker, worker-boot, the host-smoke, lease-smoke and rtc-page harnesses with iife worker builds, the lease wrapper switched to importScripts with an iife observer, and the prelude concatenation kept (L3596-3601). The lease wrapper it refers to exists at L4432-4433.
- R1-F10: resolved — The step now quotes the line-143 assertion text and replaces the comment on lines 141-142 (L1965). The Files list says 141-143 (L1859).
- R1-F11: resolved — D-7 (L40) lists tick-windows-missing, lease-starved, page-errors and baseline-hidden, and the on-time and deadline-based relay measurement, with the justification that they only tighten the rules. These match report.ts L474-483.
- R1-F12: resolved — L16 now names onlineSession.ts, rtcSession.ts and hostProcessProtocol.ts.

## Verified
- host-smoke early checks against startWorkerHost (plan L2250-2456): 'abort-before' rejects 'cancelled' before spawn (L2255), so created is false; 'abort-after-spawn' gives cancelled and terminates the Worker; 'crash-on-spawn' gives worker-exit; the later request on the crashed host rejects 'disposed' (L2315).
- host-smoke's killTransport calls controller.dispose(), which fires the PageTransport onExit (plan L1785, L1809) and so stop('transport-exit') (L2387).
- host-smoke's owner and producer split: the owner page posts ports to itself; the preload forwards them through ipcRenderer.postMessage; main relays them to the producer's existing host-smoke-port path. observePage filters by the producer's sender.
- rtc-page's passive relay keeps the old frame filter (`event.data?.type === 'data'`) and the same incoming direction as old rtc-smoke.cjs:73-75 and :148.
- rtc-smoke-client's installPage runs on import when `window` exists (rtc-smoke-client.ts:209) and accepts the rtc-smoke-port MessageEvent with `source: window` (:170), so the attachClient dispatch reaches the production client.
- The rtc-smoke worker counts are consistent: 2 early + 1 real = 3, with pair() asserting workers === 3 and owner-cleanup asserting 3/3. Host native PCs total 6 (2 players, wrong-ticket, stale, cancel, transfer).
- online-app-smoke's ipcMain.handle wrap matches Task 7's registerAppExit, which registers app:prepare-exit through ipc.handle (plan L3200). The snapshot is taken before the handler answers.
- Task 8's CORS copy is applied only when `allowed && origin !== null`, so responses to Electron main's no-Origin requests stay untouched.

## Not verified
- Whether any non-online part of the app creates a MessageChannel after the first armed click (e.g. 'multiplayer') and leaves it open, which would make ports !== 0 in the page probe. I did not search the renderer's dependencies for this.
- Whether Electron's executeJavaScript logs a renderer console error when a page call rejects, e.g. host-smoke's finally-block dispose of a host that never became ready. host-smoke's console-message handler would turn such an error into a failure only during run().
- Whether Node's global WebSocket in Electron 37 main behaves as room-service-smoke.cjs's main-side service client expects. The old harness already ran the client in main, and I did not run it.
- The host-smoke launcher (Task 9 Step 3) is outside the diff. I did not re-check whether it builds the owner page with the worker define and format that rtc-smoke.ts uses.

---

# Round 2 response (no subject change)

I checked `round-2.json` against the plan at `9981e4e6`. The verdict is ready, with no new findings. The reviewer marked all 12 round 1 fixes resolved.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

