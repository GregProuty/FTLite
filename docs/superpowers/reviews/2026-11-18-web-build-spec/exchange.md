# Codex review exchange: web-build-spec

Subject: `docs/superpowers/specs/2026-11-18-web-build-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 8144734f, effort high, 331 s, 2170308 in / 2040135 cached / 30707 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Mapping visibilitychange to suspend tears down the host on every alt-tab, which contradicts §3.5
§3.1 says visibilitychange and pagehide/pageshow replace powerMonitor. The session's suspend() and resume() are not soft pauses. Both call savedState(c,'suspended'), which runs retireGame and disposes the host and peers, and resume() then dispatches 'reconnect'. If a hidden tab is wired to suspend(), the match ends whenever the host switches tabs. That contradicts §3.5, which assumes the host keeps ticking while hidden. The spec also drops real OS sleep detection: in Electron, main no longer pushes app:suspend/app:resume, and the browser has no equivalent signal. · spec L92, spec L119-121, spec L103-107. src/main/network/onlineSession.ts:L569-577 (suspend/resume → savedState → retireGame L161-173). src/main/network/onlineIpc.ts:L56-57,L65 (powerMonitor push). src/main/network/hostProcess.ts:L233-240 (onSuspend invalidates the lease). src/renderer/src/main.ts:L87 (duel lifecycle uses window.ftlite onSuspend/onResume). · The host would lose the match in ordinary play (tabbing away). Two implementers would wire visibilitychange differently. · State that visibilitychange is never mapped to suspend(). Detect OS sleep in the browser by a wall-clock vs performance.now jump (the session already has 'clock-discontinuity'), and use pagehide(persisted)/freeze only for bfcache. Electron main keeps its powerMonitor push of app:suspend/app:resume to the page as a fifth job. Name the page-side trigger for each existing suspend/resume caller.

### [P1] R1-F2 The bounded exit save cannot run on pagehide, Electron loses its close interception, and beforeunload silently blocks Electron's close
Today's exit save is graceful(): a captureCheckpoint round trip to the host, mirrors.adopt (a disk write) and mirrors.flush (a checkpoint PUT), all inside a 3 s budget. onlineExit.ts calls preventDefault() on window close and on before-quit until that finishes. A pagehide handler cannot wait for async work. The Worker dies with the document, a normal fetch is cancelled, and a keepalive fetch is capped at 64 KiB while checkpoints can be about 512 KiB. Deleting onlineExit.ts with no replacement means Electron also stops saving on close. Separately, §7.6's beforeunload prompt makes Electron cancel the close with no dialog, unless main handles 'will-prevent-unload'. The menu's Quit (window.close()) and the title-bar close would both do nothing while in a lobby or match. · spec L93, L109, L245-247. src/main/network/onlineSession.ts:L245-258, L557-564. src/main/network/onlineExit.ts:L5-20. src/renderer/src/main.ts:L116. src/main/index.ts:L60. · A required behaviour cannot work as stated in the browser, Electron regresses, and the Electron window cannot be closed while hosting. · Restate the browser exit as best-effort: send host-release over the open WebSocket, and rely on the latest periodic checkpoint already at the service and in IndexedDB. Say explicitly that no new capture is guaranteed. For Electron, keep a main-side 'close' interception that asks the page to run prepareExit over IPC, with a 3 s cap, before allowing the close. Also handle 'will-prevent-unload' in main, or skip beforeunload when window.ftlite is present.

### [P1] R1-F3 Cross-origin checkpoint GET cannot read X-FTL-Checkpoint, so rehost and guest mirror refresh fail from a page
The service sets Access-Control-Allow-Origin but never Access-Control-Expose-Headers. getCheckpoint reads the X-FTL-Checkpoint response header. That header is not CORS-safelisted, so in a page (browser, or Electron's file:// page with Origin null) the header reads as null. parseMetadata then throws invalid-frame. Today this works only because Node fetch in main ignores CORS. Rehost and onlineMirrors.refresh both call getCheckpoint. §2.4 says the service already 'returns CORS headers', and §6 only plans to add the origin to the allow list. · spec L69, L195-199, L289. services/signalling/src/index.ts:L69 (ACAO and Vary only). services/signalling/src/room/checkpoints.ts:L44. src/network/session/serviceClient.ts:L507-508, L68-69. src/main/network/onlineMirrors.ts:L92. src/main/network/onlineSession.ts:L362, L390. · The §9 done criterion 'Rehost works after the host tab closes' fails, and so does the Electron guest's mirror. It also needs a service redeploy, which §6 does not plan for. · Add 'Access-Control-Expose-Headers: X-FTL-Checkpoint' to every allowed cross-origin response in index.ts, add a signalling test for it, and list it in §6 and Web-iii step 1. Also state the ALLOWED_ORIGINS the local workerd uses for the gates (the vite preview origin, and 'null' for Electron file://).

### [P1] R1-F4 ALLOWED_ORIGINS is a Wrangler secret, not deploy config, and the origin check is in index.ts, not sockets.ts
§6 says the Vercel origin is added to ALLOWED_ORIGINS 'in the lobby service's deploy config, followed by one wrangler deploy'. wrangler.jsonc has no vars, and the Net-3e evidence records ALLOWED_ORIGINS being provisioned as a secret (value 'null') through 'wrangler secret bulk'. A plain wrangler deploy does not change it. §6 also asks the plan to confirm that room/sockets.ts checks Origin. sockets.ts has no origin logic: the Worker's fetch wrapper checks Origin for every route, including the socket upgrade. · spec L195-197. services/signalling/wrangler.jsonc:L1-13. docs/superpowers/reviews/2026-11-15-net-3e-evidence/README.md:L12. services/signalling/src/index.ts:L58-62 (the check covers operation 'socket' at L52). services/signalling/src/room/sockets.ts:L28-38. · Web-iii step 1 as written would leave the live origin rejected (403), and the sockets.ts task chases code that does not exist. · Web-iii step 1: run 'wrangler secret put ALLOWED_ORIGINS' with the full comma list (keeping 'null'), plus a deploy only if the code changed (it must, for the Expose-Headers fix). Replace the sockets.ts sentence with: the index.ts wrapper already gates socket upgrades, so add a test that an upgrade with a disallowed Origin gets 403.

### [P1] R1-F5 Deleting hostProcess.ts leaves the HostProcessHandle contract and the transport-ready bridge without a named replacement
The session consumes HostProcessHandle and needs all of it: onCheckpoint, ackCheckpoint, captureCheckpoint, onLeaseRequest (with replay of the latest request), applyLease, invalidateLease, completeBootstrap, request with 5 s timeouts, attachPeer, onExit, and a 250 ms dispose. hostProcess.ts implements this together with the three-way readiness gate (utility ready, window ready, bridge 'transport-ready'), protocol validation, and crash-record bounds. utilityHost also requires one 'transport' port whose peer sends 'transport-ready', which today is the hidden window's bridge. The spec deletes hostProcess.ts and says only that 'the session talks to it only through ports'. It never says that a Worker-backed owner must implement the same handle, or who in the page sends transport-ready. · spec L94, L97-99, L109. src/main/network/hostProcess.ts:L16-29, L53-96, L181-237. src/network/utilityHost.ts:L158-165, L182. src/main/network/onlineSession.ts:L22-29, L224-286. · Two implementers would build it differently: one rewrites the owner over Worker.postMessage, the other wires ports ad hoc. The lease and checkpoint recovery guarantees live in this layer. · Specify that hostProcess.ts becomes a platform-neutral 'workerHost' owner implementing HostProcessHandle unchanged over a Worker HostPlatform (spawn = new Worker, kill = terminate, onExit = worker 'error'/terminate). Specify that the page-side transport controller (bridge.ts/controller.ts) answers the 'transport' port with transport-ready, and that its existing unit tests are ported rather than deleted.

### [P1] R1-F6 §8 omits the Electron gates and manifests that load the deleted utility, hidden window and powerMonitor directly
§8 rewrites four gates. test:host-runtime (host-smoke) and test:rtc-runtime (rtc-smoke) also require out/main/hostProcess.js and transportWindow.js and patch utilityProcess.fork. So do lease-smoke.cjs and room-service-smoke. The internet and online-app reports hash out/main/authorityHost.js, hostProcess.js, transportWindow.js and networkTransport.html as required artifacts. The online-recovery report hashes an instrumented authorityHost.js. online-app-smoke's suspend failure injection is powerMonitor.emit('suspend'). None of these is listed, and §8 L301 reuses the internet-app script for the live check. · spec L279-281, L301. package.json:L14-15. scripts/network/host-smoke.cjs:L6-7, L41-42. scripts/network/rtc-smoke.cjs:L7-8, L38-39. scripts/network/lease-smoke.cjs:L60-73. scripts/network/internet-app-report.ts:L6. scripts/network/online-app-report.ts:L3-6. scripts/network/online-recovery-report.ts:L84. scripts/network/online-app-smoke.cjs:L179. · Web-i's gate ('everything in §8') would either fail on missing artifacts or quietly drop the host, RTC and lease coverage. The suspend injection has no new trigger. · List every script and npm entry with its fate: rewritten (host-smoke → Worker owner smoke, rtc-smoke → page RTC smoke), merged, or retired with the coverage it moves to. Update the artifact lists in the report/manifest files. Name the new suspend injection (for example, an Electron app:suspend push or a test hook on the page platform).

### [P1] R1-F7 The §3.5 test can false-pass under Playwright, skips page-side lease renewal, and its silent-audio fallback likely does not work
Several gaps. (a) Headless Chromium and Playwright's Firefox keep every page 'visible'. Unless the run is headed with a second foreground tab in the same window, or a minimized window, no throttling happens and the test passes trivially. (b) The test measures only Worker ticks and a data-channel relay. The lease, however, is renewed on a page round trip every 5 s against a 12 s local lease: Worker → page → signalling WebSocket → page → Worker. Page-side session timers and the serviceClient yieldTimers(setTimeout 0) fall under the 1 s hidden-tab timer clamp. (c) Chrome decides 'audible' from the actual output level, so a silent Web Audio loop is not expected to exempt the tab. · spec L119-131. src/network/session/leaseGate.ts:L9-11. src/main/network/onlineSession.ts:L224-243. src/network/session/serviceClient.ts:L319-333. · A false pass would let Web-i build on the unproven hidden-host assumption, and the stated fallback may be ineffective. · Require headed browsers, a second foreground tab, and assertions that document.visibilityState is 'hidden' and that a page-side setInterval control is visibly clamped. Add a page-side lease round trip over a real local-workerd WebSocket to the measured loop, with pass = no lease gap over 8 s across 10 min. Replace the silent-audio claim with 'test any fallback in Task 1 before adopting it'.

### [P1] R1-F8 Electron's main window keeps default background throttling once the RTC moves into it
The hidden transport window that hosts RTC today sets backgroundThrottling:false. The main BrowserWindow does not, so it defaults to throttled. After the move, the RTC peers, the session and the lease relay run in the main window. A minimized Electron host is then throttled, which is a regression from today's design. §3.3 lists main's remaining jobs and does not change webPreferences. · spec L101-109. src/main/network/transportWindow.ts:L33-36. src/main/index.ts:L20-33. · An Electron host that minimizes during a match could hit lease-expired or link loss, which does not happen today. · In §3.3, require backgroundThrottling:false on the main window (Electron can opt out even though the browser cannot), and add an Electron minimized-host check to the rewritten gates.

### [P1] R1-F9 The page session's construction inputs and its renderer API are unspecified, including the dev and test env overrides the gates depend on
Main builds the session from process.env and app state: FTLITE_LOCAL_SERVICE_URL and FTLITE_SERVICE_URL, FTLITE_SECTOR_ONLINE_TEST (honoured only when unpackaged), FTLITE_DUEL_TEST_SEED and app.isPackaged. A page cannot read these. §3.3 says the overrides are 'kept for development' without saying how they reach the page, or how the browser build keeps the sector and seed entries test-only. The renderer finds online play only through window.ftlite.online (createOnlineBridge, onlineAvailable: !!bridge), and ports arrive by a window postMessage tagged ONLINE_PORT_SOURCE. After deletion the spec names no in-page replacement. It also does not acknowledge that the seat token, which was main-only, now lives in page JS. · spec L95, L109-111. src/main/index.ts:L37-58. src/renderer/src/main.ts:L78-82, L106-110. src/renderer/src/app/onlineBridge.ts:L5-18. src/main/network/onlineSession.ts:L52. · Without this, multiplayer is unreachable in the browser, the rewritten gates cannot set the sector entry or the test seed, and implementers would pick incompatible injection paths (query string, preload, build define). · Specify a page factory that builds the session with the deps, an OnlinePreloadApi-compatible facade plus onPort (direct callback, no window.postMessage), and how config and test flags arrive. Electron passes them from main through the preload as a frozen value. The web build bakes them in only for test builds, and the production build rejects them. Add one sentence on the trust-boundary change (no session object on window).

### [P2] R1-F10 The IndexedDB storage requirement contradicts the existing seam
§3.1 says IndexedDB 'implements the existing SeatStoreFileSystem and MirrorFileSystem seams' and also that 'each write is a single transaction, which replaces the temp-plus-rename step'. The seams are a file-handle filesystem (mkdir, open with flags, read/writeFile/sync/close, rename, unlink, ENOENT codes), and the stores always write a temp file and then rename it. Implementing the seam keeps the rename, so the write is not a single transaction. Both stores also import node:path join, randomUUID and Buffer. · spec L91. src/main/network/seatStore.ts:L23-28, L48-49, L90-107. src/main/network/mirrorStore.ts:L1-2, L17-22, L66-87. · Two implementers would build either an fs emulator over IndexedDB or a new key-value seam, with different atomicity. · Choose one. Recommendation: a new byte key-value seam (get/put/delete of one record per key in one IndexedDB transaction) under the unchanged caps and validators. Drop 'implements the existing seams', and list the node:path, randomUUID and Buffer replacements.

### [P2] R1-F11 The Firefox fullscreenchange-as-Esc rule needs to exclude page-initiated exits and avoid double input
A fullscreenchange to not-fullscreen also fires when the page itself calls exitFullscreen (the Settings toggle) and when the browser leaves fullscreen for other reasons. If Firefox also delivers the Escape keydown, the game would see two Esc presses. The rule is also keyed to a browser name rather than to a Keyboard Lock capability, so Chrome without a successful lock (for example, when lock() rejects) is not covered. · spec L224-226. src/renderer/src/main.ts:L115. · It could unpause or close a window unintentionally, and implementers would detect 'Firefox' differently. · Treat the exit as an Esc only if it was not page-initiated (track a flag set around exitFullscreen), a match is running, and no Escape keydown arrived within the same 100 ms. Choose the path by whether navigator.keyboard.lock resolves, not by user agent.

### [P3] R1-F12 §4 lists only part of RoomCompatibility, and its error text assumes one direction
sameCompatibility also compares schemaVersion and layoutHash. The join error is 'incompatible' in both directions, so 'This lobby runs a newer version' is wrong when the lobby is older than the tab. · spec L137-139. src/network/session/serviceClient.ts:L61-64. · It gives misleading guidance to players and the plan. · List all six fields. Use direction-neutral text ('This lobby runs a different version. Both players should reload.'), or compare against version.json first.

## Verified
- §2.3 sizes and names: seatStore MAX_BYTES 8192 and online-seat-v1.json (src/main/network/seatStore.ts:L29,L49); mirrorStore 557056 and FTLNMIR1 with temp+rename (src/main/network/mirrorStore.ts:L22,L87).
- §2.3 node:crypto use: onlineSession L1, L261, L496-497; onlineDuel L5, L42-43; onlineSector L1, L51-52; onlineMirrors L1, L20, L128 (createHash and Buffer).
- §2.2: serviceClient injects fetch and createWebSocket and hashes with crypto.subtle (src/network/session/serviceClient.ts:L27-33, L76-78). Asset loading resolves against document.baseURI (src/renderer/src/render/assets.ts:L72).
- §2.3: authorityHost uses process.parentPort, node:perf_hooks, randomBytes and process.exit (src/utility/authorityHost.ts:L1-19); emitterPortEndpoint supports only node and electron (src/network/platformPort.ts:L9-18).
- §2.3 onlineConfig behaviour matches the spec: exactly one source, loopback gives iceMode loopback, https gives turn (src/main/network/onlineConfig.ts:L4-15).
- §2.4: the origin check allows a missing Origin or the string 'null' and sets ACAO/Vary (services/signalling/src/index.ts:L59-69). Preflight answers with Allow-Methods/Allow-Headers covering Authorization, Content-Type and the X-FTL-* request headers (L24-27), so JSON POSTs and the checkpoint PUT preflight should pass.
- §2.1: powerMonitor pushes app:suspend and app:resume (src/main/network/onlineIpc.ts:L56-57). The hidden window uses RTC request/response IPC (src/main/network/transportWindow.ts:L40-53).
- The determinism 'Electron' runtime loads its own page through scripts/determinism/electron.cjs as the Chromium engine (scripts/determinism/run.ts:L45-54). It does not depend on the utility process or the hidden window.
- The renderer's window.ftlite call sites are optional-chained (src/renderer/src/main.ts:L78, L81, L88, L97).
- §3.1's 'Exit save' wording correctly identifies onlineExit's role (src/main/network/onlineExit.ts:L4-20), although its replacement is infeasible (finding 2).

## Not verified
- Vercel vendor claims (Routing Middleware on Hobby, Build Output v3 functions/ with an edge .vc-config plus config.json middleware routes under 'vercel deploy --prebuilt', runtime env vars available to prebuilt Edge middleware, Password Protection being paid). I did not check them against current Vercel docs; no network access was used.
- Whether Worker, module dynamic-import and version.json fetches carry the ftlite_pass cookie. Same-origin requests default to credentials 'same-origin', so they should, but this was not tested.
- Whether Electron allows 'new Worker(...)', especially module workers, from a loadFile (file://) page, and what Origin Chromium sends on a WebSocket upgrade from file://. Both are untested, and they affect the Electron path in §3.3.
- Whether Firefox fires the MessagePort 'close' event. bridge.ts:L10-12 and platformPort onClose rely on close detection, and hostRuntime/portLink use onClose for abrupt peer loss.
- Whether Firefox delivers the Escape keydown to content when Esc exits DOM fullscreen (relevant to finding 11).
- Whether Chrome's intensive timer throttling exemption for pages using WebRTC applies to the host tab. This should be measured in the §3.5 test.
- I read build/contentDigest.ts, services/signalling/src/room/checkpoints.ts, src/network/session/leaseGate.ts, package.json scripts and docs/superpowers/reviews/2026-11-15-net-3e-evidence/README.md (via grep) beyond the manifest, to support findings 3, 4, 6 and 7. I did not read src/preload/*, peer.ts, bridge.ts or controller.ts in full, or docs/gates.md.

---

# Round 1 response (spec revised)

I checked `round-1.json` against the subject at `0ac43a37`. All 12 findings are accepted and fixed, and none was rejected or deferred.

## R1-F1 [P1]: Mapping visibilitychange to suspend tears down the host on every alt-tab, which contradicts §3.5

Confirmed. `onlineSession.ts:569-577`: `suspend()` and `resume()` both call `savedState(c,'suspended')` and retire the game, and `resume()` dispatches a reconnect.

Changed §3.1, "Suspend and resume (OS sleep only)":
- `visibilitychange` never maps to suspend.
- In the browser, a clock-jump detector compares wall time with monotonic time. A long gap on its own is ignored, because of intensive throttling, and a missed sleep falls back to the existing socket and lease recovery.
- The bfcache `pagehide`/`pageshow` pair also counts as suspend and resume.
- Electron keeps its `powerMonitor` push.
- The callers in `duelMode.ts` and `flightMode.ts` are named.

## R1-F2 [P1]: The bounded exit save cannot run on pagehide, Electron loses its close interception, and beforeunload silently blocks Electron's close

Confirmed. `onlineSession.ts:245-258` and `onlineExit.ts:5-20`: the exit save is async, and Electron intercepts the close until it finishes.

The fixes:
- **The browser exit** is now a best-effort release with no new capture (§3.1, §7.6). The spec states that up to one checkpoint interval of play can be lost.
- **Electron** keeps a `close`/`before-quit` interception that calls the page over `app:prepare-exit` with a 3 s cap. Main handles `will-prevent-unload`, and the page skips `beforeunload` when `window.ftlite` is present (§3.3 jobs 6 and 7).
- **A new gate** checks the Electron close (§8).

## R1-F3 [P1]: Cross-origin checkpoint GET cannot read X-FTL-Checkpoint, so rehost and guest mirror refresh fail from a page

Confirmed:
- `services/signalling/src/index.ts:69` sets only `Access-Control-Allow-Origin` and `Vary`.
- `room/checkpoints.ts:44` sends `X-FTL-Checkpoint` on the GET.
- `serviceClient.ts:507-508` reads that header.

The fixes:
- §2.4 now states the gap.
- §6 adds `Access-Control-Expose-Headers: X-FTL-Checkpoint`, with a test, as a Web-i code change (also listed in §9).
- §6 also lists the local `ALLOWED_ORIGINS` the gates use.

## R1-F4 [P1]: ALLOWED_ORIGINS is a Wrangler secret, not deploy config, and the origin check is in index.ts, not sockets.ts

Confirmed:
- `wrangler.jsonc` has no vars.
- `net-3e-evidence/README.md:12` records that `ALLOWED_ORIGINS` was provisioned as `null` through `wrangler secret bulk`.
- `index.ts:58-62` gates every route, including the socket upgrade.

The fixes:
- §2.4 is corrected.
- §6 uses `wrangler secret put` with `null` kept, plus a deploy for the code change, and adds a test that a disallowed origin is refused on socket upgrade.
- Web-iii step 1 is updated to match.

## R1-F5 [P1]: Deleting hostProcess.ts leaves the HostProcessHandle contract and the transport-ready bridge without a named replacement

Confirmed. `hostProcess.ts:16-29` defines the handle, and `utilityHost.ts:158-165` expects `transport-ready`.

§3.2 now specifies the following:
- `src/network/host/workerHost.ts` implements `HostProcessHandle` unchanged, over a Worker `HostPlatform` with spawn, kill and onExit.
- The readiness gate becomes Worker ready plus `transport-ready`.
- The page transport controller answers the `transport` port with `transport-ready`.
- The existing tests are ported, not deleted.

## R1-F6 [P1]: §8 omits the Electron gates and manifests that load the deleted utility, hidden window and powerMonitor directly

Confirmed. A grep of `scripts/` for `authorityHost`, `transportWindow`, `hostProcess`, `networkTransport`, `utilityProcess` and `powerMonitor` finds these nine scripts:
- `host-smoke.cjs`
- `internet-app-report.ts`
- `lease-smoke.cjs` and `lease-smoke.ts`
- `online-app-report.ts`
- `online-app-smoke.cjs`
- `online-recovery-report.ts`
- `room-service-smoke.cjs`
- `rtc-smoke.cjs`

`scripts/determinism/run.ts` uses its own `electron.cjs` runner and is unaffected.

The fixes in §8:
- **A table** gives every script and npm entry its fate.
- **The suspend injection** becomes main pushing `app:suspend`.
- **The manifests** are updated in Web-i.
- **The live check** is a new `scripts/web/live-smoke.ts`.
- **The minimized-host and close gates** are new.

## R1-F7 [P1]: The §3.5 test can false-pass under Playwright, skips page-side lease renewal, and its silent-audio fallback likely does not work

Confirmed. `leaseGate.ts:9-11` (5 s renewal) and `serviceClient.ts:319-333` (`setTimeout(0)` yields) show the lease path has page timers.

§3.5 now specifies the following:
- The run is headed, with the test page behind a second foreground tab.
- The run counts only if `document.visibilityState` is `'hidden'` throughout and a clamped control interval proves the page was throttled.
- The measured loop includes a lease-style round trip over a local workerd WebSocket. It passes only if no round-trip gap exceeds 8 s.
- The silent-audio claim is replaced by a rule: a fallback is adopted only if Task 1 shows it works.

## R1-F8 [P1]: Electron's main window keeps default background throttling once the RTC moves into it

Confirmed. `transportWindow.ts:33-36` sets `backgroundThrottling: false` on the hidden window, and `index.ts:20-33` does not set it on the main window.

The fixes:
- §3.3 job 1 requires `backgroundThrottling: false` on the main window.
- §8 adds the minimized-host gate.

## R1-F9 [P1]: The page session's construction inputs and its renderer API are unspecified, including the dev and test env overrides the gates depend on

Confirmed. `index.ts:37-58` reads the env vars and `app.isPackaged`. `main.ts:78` and `onlineBridge.ts` discover online play only through `window.ftlite.online` and a `postMessage` port envelope.

The new §3.3 subsection, "The page session factory and its renderer API", specifies the following:
- `createPageOnline(config)` returns an object shaped like `OnlinePreloadApi`, plus a direct `onPort`.
- `PageOnlineConfig` reaches the page as a frozen preload value in Electron and as a build define on the web.
- The test-only fields are allowed only in unpackaged or `--test` builds.
- The subsection notes that the trust boundary has moved.

## R1-F10 [P2]: The IndexedDB storage requirement contradicts the existing seam

Confirmed. `seatStore.ts:23-28` and `mirrorStore.ts:17-22` are file-handle seams with temp-plus-rename.

§3.1 now has a new `OnlineRecordStore` byte key-value seam with one transaction per put. The old file-system seams are removed, and the replacements for `node:path`, `randomUUID` and `Buffer` are listed.

## R1-F11 [P2]: The Firefox fullscreenchange-as-Esc rule needs to exclude page-initiated exits and avoid double input

Confirmed. §7.2 now chooses the path by whether `keyboard.lock` resolves, not by browser name. It counts an exit as Esc only when all three hold:
- the page did not start the exit itself;
- a match is running;
- no Escape `keydown` arrived in the last 100 ms.

## R1-F12 [P3]: §4 lists only part of RoomCompatibility, and its error text assumes one direction

Confirmed. `serviceClient.ts:61-64` compares six fields. §4 now lists all six and uses direction-neutral error text.

## Also changed

- §3.1: the clock-jump detector ignores long monotonic gaps on their own, because Chrome's intensive throttling can delay hidden-tab timers by about a minute. A missed sleep falls back to the existing socket and lease recovery.

## Files changed

- docs/superpowers/specs/2026-11-18-web-build-design.md

<!-- end -->

---

# Round 2 (delta, reviewing 5f2664f3, effort medium, 114 s, 386356 in / 336677 cached / 10711 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 §6 limits Expose-Headers to non-null origins, which can be read as excluding Electron's Origin: null page
§6 says index.ts adds Access-Control-Expose-Headers 'to every response for an allowed origin that is not null'. The service treats the string 'null' as an allowed origin and echoes Access-Control-Allow-Origin: null for it. After this project, Electron's file:// page sends Origin: null (§6 says so itself). Read naturally, 'not null' excludes that case. An implementer who follows it would leave the Electron page unable to read X-FTL-Checkpoint, so Electron rehost and mirror refresh would fail. That is the R1-F3 failure again, now for every Electron player. · spec L255 (Expose-Headers 'for an allowed origin that is not null'), spec L259 (Electron file:// sends Origin: null). services/signalling/src/index.ts:L60 (origin === 'null' is allowed), L69 (ACAO is set whenever origin !== null, i.e. when the header is present, including the string 'null'). src/network/session/serviceClient.ts:L507-508 (header read). · Two implementers would build this differently, and the literal reading breaks recovery for every Electron player. · Reword the rule as: set Access-Control-Expose-Headers: X-FTL-Checkpoint wherever index.ts:69 sets Access-Control-Allow-Origin, i.e. whenever an Origin header is present and allowed, including the string 'null'. The signalling test should assert the header for both a listed https origin and Origin: null.

### [P2] R2-F2 The §3.5 validity rule could discard runs in which the browser simply did not throttle the page
A run counts only if a page-side 100 ms setInterval is clamped to an average period of at least 900 ms. The same page holds an open RTCDataChannel and a WebSocket. Browsers may exempt such pages from some timer throttling, which is the favourable outcome. Under the rule as written, that run is marked invalid instead of passing, so Task 1 might never produce a valid Chrome run. The rule mixes two questions: was the page hidden, and were its timers throttled? · spec L176-L178 (setup: data channel plus a WebSocket in the same page), spec L184 (valid only if the control is clamped to >=900 ms). · Web-i Task 1 is the gate for the whole design. A validity rule that can reject the good outcome could stall the plan or push it into the fallback for no reason. · Make validity 'visibilityState is hidden throughout', proven by a sibling control tab with no RTC or WebSocket whose interval is clamped. Record the test page's own control period as data, not as a validity condition.

### [P2] R2-F3 A bfcache pagehide is given both the best-effort release and suspend, with no stated order
§3.1 says pagehide with persisted:true counts as suspend, and its pageshow as resume. The exit-save bullet says that on pagehide the session sends the release over the WebSocket and closes the peers. A bfcache pagehide matches both rules. The spec does not say whether it releases the seat, suspends, or both, or in what order. Releasing the seat before resume() reconnects changes what the reconnect finds. · spec L101 (pagehide persisted = suspend), spec L105 (on pagehide, release and close peers), spec L316 (§7.6 pagehide release). · Two implementers would wire the same event differently, and the reconnect after a bfcache restore depends on which one runs. · State one rule, for example: pagehide with persisted:false does the release; pagehide with persisted:true only calls suspend(), with no release; pageshow with persisted:true calls resume().

### [P3] R2-F4 §6's reason for keeping 'null' in ALLOWED_ORIGINS is wrong about the code
§6 says the null entry stays because Electron sends Origin: null. index.ts already allows a missing Origin and the string 'null' unconditionally, without consulting ALLOWED_ORIGINS. So the entry has no effect, and removing it would not break Electron. · spec L259. services/signalling/src/index.ts:L60. · Misleading rationale could cause a later change to the hard-coded allowance to be judged safe or unsafe for the wrong reason. · Say that the null and missing origins are allowed in code (index.ts:60), and that the secret's 'null' entry is kept only to match the existing provisioning.

## Prior findings
- R1-F1: resolved — §3.1 L100-103 never maps visibilitychange to suspend. It adds a clock-jump detector with a stated miss path, keeps Electron's powerMonitor push (§3.3 job 5), and names the duelMode.ts:79-80 and flightMode.ts:54-55 callers, both confirmed. The bfcache overlap with the release is raised separately as a new P2.
- R1-F2: resolved — The browser exit is best effort with no capture (L105, L316). Electron keeps the close and before-quit interception through app:prepare-exit with a 3 s cap, which matches onlineExit.ts:L5-20 and graceful()'s 3 s budget at onlineSession.ts:L248. will-prevent-unload is handled and beforeunload is skipped in Electron (L140, L314).
- R1-F3: still open — §2.4 states the gap and §6 adds the header with a test. However, §6 L255 restricts it to an allowed origin 'that is not null', which reads as excluding the Electron file:// page's Origin: null, and index.ts:L69 does echo ACAO for that page. See the new P1. The local ALLOWED_ORIGINS for the gates is now stated (L261).
- R1-F4: resolved — §2.4 and §6 treat ALLOWED_ORIGINS as a secret set with wrangler secret put, and add a deploy for the code change. The sockets.ts sentence is replaced by the index.ts gate plus a 403 socket test, and Web-iii step 1 matches (L401). A minor rationale error about 'null' is raised as a P3.
- R1-F5: resolved — §3.2 L118-128 names workerHost.ts implementing HostProcessHandle unchanged over a Worker HostPlatform. It reduces readiness to two parts, with the page controller answering transport-ready, and ports the tests. The relative Worker URL from src/network/host resolves to src/worker.
- R1-F6: resolved — The §8 table covers every runtime npm entry in package.json:L13-20 and the script families in scripts/network. This includes rtc-config-smoke, lease-smoke, online-recovery-instrument/utility (as online-recovery-*) and the internet-app manifests. The suspend injection is named, and live-smoke.ts is new.
- R1-F7: resolved — The run is headed with a second foreground tab, the hidden-state check is asserted, a page lease round trip runs over a local workerd WebSocket with an 8 s gap limit, and the silent-audio claim is replaced by 'adopt only if shown'. The control-clamp validity condition may reject the favourable outcome; raised as a new P2.
- R1-F8: resolved — §3.3 job 1 sets backgroundThrottling:false on the main window, and §8 adds a 60 s minimized-host gate.
- R1-F9: resolved — §3.3 L149-160 specifies createPageOnline, the OnlinePreloadApi-shaped return value plus onPort, and the PageOnlineConfig fields and how they reach the page. Test fields are limited to unpackaged or --test builds, and the trust boundary is noted. It is consistent with resolveOnlineConfig's packaged and packagedServiceOrigin rules (onlineConfig.ts:L4-15).
- R1-F10: resolved — L96-99 define the OnlineRecordStore key-value seam with one transaction per put, remove the file-handle seams, keep the caps and validators, and list the node:path, randomUUID and Buffer replacements.
- R1-F11: resolved — §7.2 L288-295 chooses the path by whether keyboard.lock resolves, and requires three conditions: the exit was not page-initiated, a match is running, and there was no Escape keydown within 100 ms.
- R1-F12: resolved — §4 lists all six fields and uses direction-neutral text.

## Verified
- The service allows Origin null or 'null' unconditionally and sets ACAO whenever an Origin header is present (services/signalling/src/index.ts:L59-69). The preflight allows X-FTL-Checkpoint (L26).
- Electron's exit save today is prepareExit → graceful (3 s capture, adopt, flush) → dispose, behind close and before-quit preventDefault (onlineExit.ts:L5-20, onlineSession.ts:L245-258, L557-562). §3.3 job 6 reproduces this.
- suspend() invalidates the lease and retires the game (onlineSession.ts:L569), which matches the §3.1 rationale.
- The duelMode.ts:L79-80 and flightMode.ts:L54-55 lifecycle callers exist as cited.
- The package.json runtime entries (L13-20) all appear in the §8 table, and every scripts/network file maps to a listed family.
- resolveOnlineConfig's packaged rules (src/main/network/onlineConfig.ts:L4-15) are compatible with 'production web build packaged:true with a baked https origin' and with a loopback test build.

## Not verified
- Whether Chromium's WebSocket handshake from an Electron file:// page sends 'Origin: null' or 'Origin: file://'. A 'file://' origin would be refused (index.ts:L60). Worth one check in Web-i.
- Whether module Workers, IndexedDB and navigator.locks (§7.5) all work on Electron's file:// opaque origin. No runtime test was run.
- Exactly which Chrome and Firefox timer-throttling exemptions apply to pages with open RTCDataChannel or WebSocket connections (it drives the new P2).
- onlinePlatform.ts onVisibleGone (window closed or renderer gone → dispose) has no named page equivalent. This is probably moot in the page, but it was not part of the touched-region review.

---

# Round 2 response (spec revised)

I checked `round-2.json` against the subject at `5f2664f3`. All four new findings are accepted, and none was rejected or deferred. The reviewer confirmed 11 of the 12 round 1 fixes. The twelfth, R1-F3, reopened because of the "not null" wording, and the R2-F1 fix closes it.

## R1-F3 [P1]: Cross-origin checkpoint GET cannot read X-FTL-Checkpoint (reopened)

Confirmed that the wording "not null" excluded Electron's `Origin: null`. Fixed under R2-F1.

## R2-F1 [P1]: §6 limits Expose-Headers to non-null origins, which can be read as excluding Electron's Origin: null page

Confirmed. `index.ts:60` allows the string `null`, and `index.ts:69` sets `Access-Control-Allow-Origin` whenever an `Origin` header is present and allowed.

§6 now sets Expose-Headers wherever `index.ts:69` sets `Access-Control-Allow-Origin`, including the string `null`. The test asserts the header for both an https origin and `null`.

## R2-F2 [P2]: The §3.5 validity rule could discard runs in which the browser simply did not throttle the page

Confirmed. The original validity condition, the clamped control interval, was measured on the same page that holds the RTC and WebSocket connections.

In §3.5, a run is now valid when the page stays hidden throughout and a sibling control tab with no connections shows its interval clamped. The test page's own control period is recorded as data only.

## R2-F3 [P2]: A bfcache pagehide is given both the best-effort release and suspend, with no stated order

Confirmed. §3.1 and §7.6 now give one rule:
- `persisted: false` does the release.
- `persisted: true` only suspends.
- Its `pageshow` resumes.

## R2-F4 [P3]: §6's reason for keeping 'null' in ALLOWED_ORIGINS is wrong about the code

Confirmed. `index.ts:60` allows a missing or `null` origin without consulting the secret. §6 now says that, and keeps the secret's `null` entry only to match the existing provisioning.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-web-build-design.md

<!-- end -->

---

# Round 3 (delta, reviewing d67c9b26, effort medium, 20 s, 48215 in / 26627 cached / 1782 out)

Verdict: ready

## Prior findings
- R1-F3: resolved — Fixed by the R2-F1 rewording. spec L259 now ties Expose-Headers to every place index.ts:69 sets ACAO, including Origin: null. The test covers both an https origin and null. Local workerd origins are stated at spec L265.
- R2-F1: resolved — spec L259: 'wherever index.ts:69 sets Access-Control-Allow-Origin ... including the string null'. This matches index.ts:L69 ('allowed && origin !== null', where the null check is on the absent header, not on the string). The test asserts both cases.
- R2-F2: resolved — spec L188: a run is valid if the page stays hidden throughout and a sibling control tab with no connections, hidden the same way, is clamped to at least 900 ms. The test page's own period is recorded only as data, and an exempted page counts as a favourable result.
- R2-F3: resolved — spec L105-L109 states one rule. persisted:false releases. persisted:true only calls suspend(), with no release, and pageshow resumes. This agrees with L101 and with §7.6 at L320.
- R2-F4: resolved — spec L263 says a missing origin and the string null are allowed in code (index.ts:L60) without consulting the secret. It also says the secret's null entry is kept only to match existing provisioning. Both claims match index.ts:L60.

## Verified
- index.ts:L60 allows origin===null (no header) or the string 'null' unconditionally. index.ts:L69 sets ACAO and Vary whenever the header is present and allowed. spec L259 and L263 describe this correctly.
- spec L101 (bfcache counts as suspend/resume) agrees with L105-L109 (persisted:true only suspends, persisted:false releases) and with §7.6 at L320. No contradiction remains.
- spec L188 validity rule: the control is a separate tab, so the R2-F2 conflation is gone. The pass criteria at L190-L193 are unchanged and still independent of the test page's own timer period.
- The §3.1 exit-save restructure at L104-L110 keeps the 64 KiB keepalive / 512 KiB checkpoint rationale and the Electron full-save pointer to §3.3. Nothing was lost in the edit.

## Not verified
- Whether a page with an open WebSocket or RTCPeerConnection is ever put in the back-forward cache. Chrome generally excludes such pages, so the persisted:true path may rarely run during a match. This doesn't change the correctness of the rule, and I didn't check it against current browser behaviour.
- I did not run any signalling tests or the Jest suite (read-only constraint).

---

# Round 3 response (no subject change)

I checked `round-3.json` against the subject at `d67c9b26`. The verdict is ready, with no new findings. The reviewer confirmed that R1-F3, R2-F1, R2-F2, R2-F3 and R2-F4 are resolved.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

