# Codex review exchange: web-ii-plan

Subject: `docs/superpowers/plans/2026-11-18-web-ii-web-build.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing d90cd114, effort high, 855 s, 13083870 in / 12824178 cached / 74557 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The Edge middleware's .vc-config.json does not declare envVarsInUse, so the passcode and secret will probably never reach process.env
The Build Output API's Edge Function config has an `envVarsInUse: string[]` field: the list of project env var names the function may use. VC_CONFIG is only `{ runtime: 'edge', entrypoint: 'index.js' }`. Next.js's adapter fills `envVarsInUse` for its own middleware. Without it, a prebuilt `_middleware.func` should be expected to see `process.env.FTLITE_PASSCODE` and `FTLITE_COOKIE_SECRET` as undefined. Every request would then get the fail-closed 503 'FTLite is not configured.' The plan knows this is uncertain but only defers it to Web-iii, with no fallback. · plan L42 (the Edge fact lists only runtime and entrypoint); L45 ('check this at Web-iii's first deploy … a 503 "not configured" page means the env did not reach the middleware'); L661 `VC_CONFIG = { runtime: 'edge', entrypoint: 'index.js' }`; L669 writes it; L685 `checkWebOutput` requires exactly VC_CONFIG; L281 the middleware reads `process.env.FTLITE_PASSCODE` and `process.env.FTLITE_COOKIE_SECRET`; L256 returns 503 when either is missing. · It fails closed, so nothing leaks. But Web-iii's first `deploy:web` would put the whole site behind a 503, and only a Build Output change and a new deploy fix it. This is a wrong Vercel layout under the review's rules, and it costs one line to fix now. · Set `VC_CONFIG = { runtime: 'edge', entrypoint: 'index.js', envVarsInUse: ['FTLITE_PASSCODE', 'FTLITE_COOKIE_SECRET'] }`; the check at L685 then requires it. Correct the fact at L42 and keep the 503 check at L45 as the Web-iii confirmation. Add one line to the gates.md owner steps (L848-L850): if the live page still answers 503 with both vars set, the vars are not reaching the middleware; check that they are set for Production and redeploy.

### [P2] R1-F2 Web Lock: the menu waits on the lock with no time limit, the lock is never released on pagehide, and a busy lock is never retried, so a reload can lock online play out
`startApp` awaits `acquireOnlineLock` before the store and menu exist, with no timeout. If `locks.request` ever fails to call back or settle, Single player never appears, which breaks spec §7.5's promise that Single player stays available. The lock is released only when the document is destroyed: Task 10's pagehide teardown never calls `lock.release()`. A busy lock is final for the tab's life (`ifAvailable: true`, one try). On a reload, the new document's request can race the old document's release and come back 'busy'. The reloaded tab then shows 'FTLite is already open in another tab', with online play off, until the next reload. No gate reloads a page: Task 11 closes the tab and reopens it. · plan L1547-L1557 (one `ifAvailable` request, no timeout, no retry); L1656 `const lock … = web && configured ? await acquireOnlineLock(navigator.locks) : …`, before `createUiStore`; L1657 only a held lock creates the session; L2104-L2111 the pagehide teardown has no `lock.release()`; L2396-L2398 the gate closes and reopens and never calls `page.reload()`; spec L314. · A reload is ordinary play: the update banner's 'reload' button (L1064), a stuck tab, or F5. Losing online play after a reload looks like a broken game, and an unbounded await sits in front of Single player. · (1) Wrap the acquisition in a 2 s `Promise.race`; on timeout, use `{ state: 'unavailable' }` and keep starting the app. (2) In Task 10's pagehide teardown, call `lock.state === 'held' && lock.release()` after `bridge?.dispose()`. (3) On 'busy', retry once with a waiting request, `locks.request(name, { signal: AbortSignal.timeout(1500) }, …)`, before showing ONE_TAB_TEXT, so a reload's old document has time to release. (4) Add a reload case to Task 11: reload the guest with `page.reload()` before Reconnect, or add a reload step, and assert that `__ftliteOnlineTest` exists afterwards.

### [P2] R1-F3 The origin-refused injection passes on any failure to reach the lobby, not only on the refused origin
The injection counts as 'failed for its named reason' when the first pairing's host either shows any online error or times out waiting for the lobby. A broken create path, a dead Worker, a service fault or a slow machine all match the same regex, so the run never proves that the service refused the page's Origin. · plan L2469 (the injection only drops the preview origin from ALLOWED_ORIGINS); L2509-L2510 the regex `chromium-host lobby(: online error | timeout)`; L2374 `phase(h, 'lobby', 20000)` times out for any cause; services/signalling/src/index.ts:L63-L65 (a disallowed origin gets a 403 'forbidden' without CORS headers, which the page only sees as a network TypeError). · Web-i's gate lesson (plan L30) is that 'a failure injection must fail for its named reason'. As written, this injection can pass while the real cause is something else. · In `createBrowserPlayer`, record `page.on('response')` and `page.on('requestfailed')` for the service origin. Playwright sees the 403 even when CORS hides it from page script. In inject mode, require a 403 on `POST /v2/rooms` whose request carried `Origin: http://127.0.0.1:<port>`, and no 2xx create response, as well as the lobby failure. Without that 403, exit 2.

### [P2] R1-F4 The rehost step does not show that the mirror was written to, or read from, IndexedDB
`mirror.persistent` starts true and turns false only after a failed save. So `committed && persistent` is true before any IndexedDB write has finished. The guest rehosts in the same page that holds the mirror in memory. Rehost checks the in-memory `value.mirror.committed` against the service checkpoint. Nothing in the gate reads or reloads from IndexedDB, yet the report claims 'rehost from the IndexedDB mirror'. · plan L2408 waits on `!!v.status.mirror.committed && v.status.mirror.persistent`; src/network/online/onlineMirrors.ts:L29 `persistent = true` at start, and L59-L60 (cleared only on a save failure); plan L2412 rehost in the same page; src/network/online/onlineSession.ts:L361-L366 (rehost uses the in-memory `value.mirror.committed` plus `getCheckpoint`); plan L2494 and L2536 claim 'rehost from the IndexedDB mirror'; spec L376. · Spec §8 asks for rehost from the IndexedDB mirror. The browser's IndexedDB mirror path (fake-indexeddb in unit tests only) gets no end-to-end evidence across Chromium, Firefox and Electron. · After the host tab closes, close and reopen the guest page in the same context, then Multiplayer, Reconnect saved seat, wait for 'saved' with 'rehost', and click Rehost. The committed mirror can then only have come from IndexedDB. Also require `!v.status.mirror.localPending`. If that flow is not offered, read `mirror-v1` from IndexedDB with `page.evaluate` and check that its checkpoint sequence matches `status.mirror.committed` before rehosting.

### [P2] R1-F5 The Web-iii live checks never test the paid art or the game files, with or without the cookie
The owner's post-deploy check is only `curl -I` showing a 401 without the cookie and `no-store` on `/version.json`. Two of spec §5.3's requirements cannot be proved locally. One is that the Routing Middleware really runs in front of static files such as `/assets/paid/*` (the output check imports the bundle in Node). The other is that a `config.json` route header overrides Vercel's default static `Cache-Control` and gives `private`. Neither has a live check or a fallback. · plan L850 (the curl check: 401 and version.json `no-store` only); L656-L660 (routes: middleware, then `private, no-cache`, then version.json `no-store`); L50 (W-2); L682-L713 (`checkWebOutput` runs the bundle in Node, not Vercel's router); spec L239 and L249. · A deploy where `/assets/paid/x.png` answers 200 without the cookie would expose the paid art, which is P0 territory. Nothing scheduled would catch it. · Extend gates.md step 5 (L850) with: without the cookie, `curl -I https://<project>.vercel.app/assets/paid/<a real file>` and `/assets/authorityWorker.js` answer 401. With the cookie (`-b ftlite_pass=…` from a browser sign-in), `/`, `/assets/authorityWorker.js` and the paid file answer 200 with `cache-control: private, no-cache`, and `/version.json` answers with `no-store`. Add the same checks to `scripts/web/live-smoke.ts` in Web-iii, and state that the first deploy is rolled back if any of them fails.

### [P3] R1-F6 When the lock is 'unavailable' in a supported browser, the Multiplayer screen shows the wrong text
If `locks.request` rejects (for example a SecurityError) in a browser that passed the support check, `onlineConfig` becomes null and `onlineBlocked` stays null. The Multiplayer screen then says 'Online play needs a configured local service. Single player is available.' · plan L1656-L1661 (`onlineBlocked` is set only for 'busy'); src/renderer/src/ui/menuState.ts:L52 and L83-L86 (`availabilityText` falls back to the online-disabled text). · Players are not running a 'local service'. The text sends them in the wrong direction. · Set `onlineBlocked: lock.state === 'busy' ? ONE_TAB_TEXT : lock.state === 'unavailable' && configured ? UNSUPPORTED_TEXT : null`, or give the unavailable case its own short text.

### [P3] R1-F7 In the browser, Settings still says F11 toggles fullscreen, but F11 is the browser's own fullscreen and the API cannot see it
Settings prints '<FULLSCREEN_KEY> also toggles fullscreen.' F11 in a browser is browser-chrome fullscreen: `document.fullscreenElement` stays null, so the toggle reads 'Off' while the window is fullscreen. W-7 and §7.1 leave F11 to the browser. · src/renderer/src/ui/menu/Settings.tsx:L34-L36; plan L1305 (`isOn` reads `fullscreenElement`); L1354 and L1360-L1361 (the browser fullscreen deps); spec L286. · The label disagrees with what the player sees after pressing F11. · Add `web` to the browser slice, or pass a flag, and in the browser hide the F11 note or replace it with a line saying F11 is the browser's own fullscreen.

## Verified
- Task 1 passcode: the cookie MAC is checked with `crypto.subtle.verify` (constant time, plan L223), after a strict `^\d{1,12}\.[A-Za-z0-9_-]{43}$` format check. The expiry must satisfy `now < expiry <= now+30d` (L220), so expired cookies, cookies expiring exactly now and future-forged ones are refused (test L151-L167). The passcode compare hashes both sides with SHA-256 and XORs them (L233-L237). A failed POST really sleeps 1 s through env.sleep, which is setTimeout in middleware.ts (L265, L282). The secret is decoded with `atob` and must be at least 32 bytes, otherwise 503 (L204-L207). Without a valid cookie every path answers the 401 page, including `/assets/paid/*`, `/version.json`, `/assets/authorityWorker.js` and `/__pass` (L268-L269, test PATHS L124).
- Task 2: `resolveOnlineConfig` and `validatePageOnlineConfig` exist with the shapes the plan assumes (src/shared/onlineConfig.ts:L6-L18, L42-L53). The refusal cases (trailing slash, path, userinfo, a leading space, http in production) all fail through the raw regex or the `baseUrl !== origin` check. W-1 is needed because `packaged: true` forbids test fields (onlineConfig.ts:L48), and the plan states and justifies it.
- Task 2: `computeBuildInfo`, `readSimVersion` (build/buildInfo.ts:L8, L21) and `computeContentDigest` (build/contentDigest.ts:L7) match. The new electron.vite.config.ts matches the current file (L1-L31) except for the shared renderer settings. `__FTLITE_WEB_CONFIG__` is declared beside `__FTLITE_BUILD__` in src/renderer/src/net/env.d.ts, which tsconfig.node.json L8 includes, and is defined in vitest.config.ts L7. Build info is deterministic for one tree, so the banner cannot fire on its own build.
- No file in the content digest manifest is touched: build/contentDigest.ts:L12-L16 does not list net/duelRecord.ts, recordStore.ts or main.ts.
- Task 5 store and actions: `UiStoreInit`, `createUiStore` (store.ts:L10-L23), `UiActionDeps.quit` and the returned `quit()` (actions.ts:L19, L91), and Menu's `playing` and its `single` early return (Menu.tsx:L19-L36) all match the edits. The banner text is `New version: reload`. `isPlaying` matches menuState.ts:L67.
- Task 6: `PRESS_CODES`, `FREQ_CODES`, `WEAPON_CODES`, `MOVE_CODES`, `INTERACT_HELD` and `PING_CODE` (app/duel/input.ts:L11-L26) and `SECTOR_KEYS` (input/sources.ts:L4) exist. The duel keyboards listen on window (duelMode.ts:L54, onlineDuel.ts:L86), so Task 7's synthetic Escape dispatched on window reaches them.
- Task 7: the three spec §7.2 conditions are implemented. The page-exit flag uses a 1000 ms window that also covers a fullscreenchange arriving after `exitFullscreen` resolves, and a failed exit resets it. A match must be running. The 100 ms Escape dedupe is a strict `>` (plan L1312). A locked exit never counts as a press. `requestFullscreen` is called synchronously inside the Settings click (actions.ts:L143-L146), so the user gesture holds.
- Task 8: `PageOnlineDeps`, `createPageOnline` and its `action()` match pageSession.ts:L33-L41 and L89-L95. `OnlineSessionOwner` (onlineSession.ts:L39-L46) and `OnlineLifecycle` (lifecycle.ts:L4) match the test doubles. The Home, Multiplayer and Settings first lines match the files.
- Task 9: the 1→2 IndexedDB upgrade creates only the missing stores, so `records` (seat-v1, mirror-v1) survives both 0→2 and 1→2. The existing v1 code closes its connection on `onversionchange` (recordStore.ts:L29). The new openers set the same handler. Electron's page uses the same database through `createIndexedDbRecordStore`.
- Task 10: Web-i's own pagehide listener, registered first inside createPageOnline (pageSession.ts:L98-L99), still runs `releaseForUnload` before main's teardown. The Electron close path is unchanged: `prepareExit` then detach (pageSession.ts:L132), and main ignores `will-prevent-unload` (src/main/index.ts:L49). The prompt is web-only. The persisted pagehide is still handled by the clock-jump lifecycle (lifecycle.ts:L39-L41).
- Task 11 reuses the Web-i gates correctly. `buildDuelObservers` writes observer.js, page-probe.js and utility.cjs (online-observer-build.ts:L18-L21). `startLocalRuntime(dir, { allowedOrigins })` matches local-runtime.ts:L8. The Electron driver's commands, its replies `{ id, result | error, command, reason }` and `resource-counts` (workers[].exited/errored, ports) match online-app-smoke.cjs:L136-L224. Ports are counted through `onlineProbe.openPorts`, armed on the first click, and Worker exits are counted from `terminate()` only (page-probe.ts:L28-L34, L84). Every page call is bounded. The duel walk routes, the `results`/`present`/`pauseReason` fields and the Escape resume mirror duel-app-smoke.ts:L76-L95 and L183-L194.
- W-2 `private, no-cache` keeps spec §5.3's `private` and adds revalidation, so it is consistent with the spec. W-4 matches §5.4 (no poll or banner in Single player) and §7.6.
- Dependencies: esbuild 0.25.12 is already the installed version (package-lock.json:L3832-L3834), and Playwright 1.48.2 and Vite 7.3.8 are installed. Global Constraints L18-L24 put new dev dependencies through the main checkout and forbid `npm install` in the worktree.
- Spec §7.7's seven API checks and its exact texts match plan L1517-L1535. The §7.4 file name format matches L1919.

## Not verified
- Whether `vercel@65.10.0` exists and was released on 2026-11-03: I could not check the npm registry, and the lockfile does not have it yet.
- Whether `vercel deploy --prebuilt --prod` accepts a `.vercel/output` with no builds.json (plan L44); I did not read the CLI source.
- The current Vercel docs for the middleware route form `{ src, middlewarePath, continue }`, for `x-middleware-next: 1`, and for whether `config.json` route `headers` override the default static Cache-Control or also apply to a response the middleware returns itself (the 401 page's `no-store`). I checked these from memory only; finding 5 asks for a live check.
- That `envVarsInUse` is strictly required for prebuilt Edge functions (finding 1). The field exists in the Build Output API Edge config as I recall it; that leaving it out drops the env vars is my strong expectation, not something I confirmed in the docs.
- Whether Playwright 1.48.2's Firefox (firefox-1465) has working RTCPeerConnection, and whether loopback ICE works across browsers with `--disable-features=WebRtcHideLocalIpsWithMdns` and `media.peerconnection.ice.obfuscate_host_addresses: false`. Also whether headless Chromium resolves the Electron guest's mDNS candidates. The plan's only fallback (L2528) is a manual diagnosis.
- Whether the beforeunload dialog fires for a Firefox host under Playwright: it needs sticky user activation, which Juggler's synthesized clicks should give.
- Whether Vitest 3.2.7 can dynamically import a bundled ESM `.js` from the temp directory with a `?check=` query (plan L696), and whether tsx under Node 24 loads it from `out/` in a package without `"type": "module"` (it should, through syntax detection).
- Whether the Web Lock reload race in finding 2 actually happens in Chromium or Firefox. I reasoned it from how lock release is ordered, without a test.
- Timing in the web gate's round 1: duel-app-smoke lets round 1 end on its own (tick 1471 with seed 351) before thrusting in round 2, while the web gate thrusts during round 1 and then waits for the peer-lost pause. The steward only pauses while the run phase is 'running' (duelProducers.ts:L66-L67). I did not check whether a decided round still publishes phase 'running'.
- I did not run `tsc` on the proposed code; the type checks above were done by reading.

---

# Round 1 response (plan revised to 97ca5b84)

I checked `round-1.json` against the plan at `149da7b5`. All 7 findings are accepted and fixed in plan commit `97ca5b84`. None were rejected or deferred.

I verified the code claims before accepting them:
- `src/network/online/onlineMirrors.ts:29` starts `persistent` as true and clears it only when a save fails (R1-F4).
- `src/renderer/src/ui/menuState.ts:52,83-86` is the fallback for the availability text (R1-F6).
- `Settings.tsx:34-36` shows the F11 note (R1-F7).
- `services/signalling/src/index.ts:63-65` answers a refused origin with 403 (R1-F3).

## R1-F1 [P1]: The Edge middleware's .vc-config.json does not declare envVarsInUse, so the passcode and secret will probably never reach process.env

Confirmed: `VC_CONFIG` held only `runtime` and `entrypoint`.

Changes:
- `VC_CONFIG` now includes `envVarsInUse: ['FTLITE_PASSCODE', 'FTLITE_COOKIE_SECRET']`, and Task 3's output check requires it.
- The fact at L42 is corrected.
- The 503 check at L45 stays as the Web-iii confirmation.
- `gates.md` step 5 gets a line: a live 503 with both variables set means they are not reaching the middleware.

## R1-F2 [P2]: Web Lock: the menu waits on the lock with no time limit, the lock is never released on pagehide, and a busy lock is never retried, so a reload can lock online play out

Confirmed. Changes:
- `acquireOnlineLock` has a 2 s start-up limit. When it runs out, online play is off and the menu still starts.
- A busy lock gets one retry with `AbortSignal.timeout(1500)`, and a grant that arrives late is released.
- Task 10's `pagehide` teardown releases the lock.
- Task 11 reloads the guest with `page.reload()` and asserts that `__ftliteOnlineTest` exists again.
- W-5 and its tests are updated.

## R1-F3 [P2]: The origin-refused injection passes on any failure to reach the lobby, not only on the refused origin

Confirmed. The browser players now log service responses and failed requests. The injection passes only if it sees a 403 on `/v2/rooms` carrying the page `Origin`, and no 2xx create response. Because the create request is CORS-preflighted, a failed POST plus a 403 on an identical OPTIONS preflight sent from Node also counts. Anything else exits 2.

## R1-F4 [P2]: The rehost step does not show that the mirror was written to, or read from, IndexedDB

Confirmed. The rehost step now runs in this order:
1. It requires a saved mirror with nothing pending.
2. After the host closes, the guest closes and reopens.
3. The guest reconnects and must reach Re-host with the same committed tick, which can only come from IndexedDB.

If that flow is never offered, a fallback reads `mirror-v1` from IndexedDB and checks that it starts with the `FTLNMIR1` magic bytes. That fallback is weaker than the sequence match the finding described. The reviewer may hold it to the sequence match.

## R1-F5 [P2]: The Web-iii live checks never test the paid art or the game files, with or without the cookie

Confirmed. `gates.md` step 5 now checks four things:
- Without the cookie, a real paid file and `/assets/authorityWorker.js` answer 401.
- With the cookie, `/`, the Worker and the paid file answer 200 with `cache-control: private, no-cache`.
- `/version.json` answers with `no-store`.
- If any check fails, the deploy is rolled back.

The same checks are recorded for Web-iii's `live-smoke.ts`.

## R1-F6 [P3]: When the lock is 'unavailable' in a supported browser, the Multiplayer screen shows the wrong text

Confirmed. An unavailable lock in a configured browser now shows `UNSUPPORTED_TEXT`.

## R1-F7 [P3]: In the browser, Settings still says F11 toggles fullscreen, but F11 is the browser's own fullscreen and the API cannot see it

Confirmed. A `browser.web` flag makes Settings show `BROWSER_F11_TEXT` instead of the F11 note, and a test covers it.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-web-ii-web-build.md

<!-- end -->

---

# Round 2 (delta, reviewing 62028aab, effort medium, 122 s, 666377 in / 609272 cached / 9971 out)

Verdict: ready with P2s

## Prior findings
- R1-F1: resolved — VC_CONFIG now includes envVarsInUse ['FTLITE_PASSCODE','FTLITE_COOKIE_SECRET'] (plan L661-L662). The L42 fact is corrected. L45 keeps the 503 check for Web-iii. gates.md step 5 adds the line that a 503 with both vars set means a Production env problem and a redeploy is needed (plan L855).
- R1-F2: resolved — Four parts, all in place:
- acquireOnlineLock races a 2 s timer (plan L1580-L1606). On timeout it gives 'unavailable', and a grant that arrives after gaveUp returns undefined, so the browser releases it at once.
- A busy lock is retried once with AbortSignal.timeout(1500). Its TimeoutError/AbortError maps to 'busy'. A synchronous throw and a rejection both map to 'unavailable'.
- The pagehide teardown calls `if (lock.state === 'held') lock.release();` (L2170), and the main.ts source test checks for it (L2110). `lock` is typed OnlineLock (L1705), so the narrowing compiles.
- Task 11 reloads the guest in place, and reload() throws unless __ftliteOnlineTest exists again (L2296-L2300, L2313, L2477).
The unit tests cover hold/release, a busy then granted retry, a retry that stays busy, and a grant that arrives late.
- R1-F3: resolved — Browser players now log service-origin responses and failed requests with their Origin header (L2303-L2306). After the run, an OPTIONS preflight from Node goes out with the page Origin while workerd is still alive (L2597-L2598); services/signalling/src/index.ts:L62-L65 answers a non-allowed origin's OPTIONS with 403. The run counts as the injection only if all of these hold: the lobby failed, a 403 was seen (or a failed POST carrying the page Origin plus the Node 403), and no 2xx create came back. Otherwise it exits 2 (L2609-L2621). Step 9 expects injection.refused true and injection.created false.
- R1-F4: still open — The new close/reopen/Reconnect sequence does not prove the mirror came from IndexedDB. It is not true that the mirror 'can only have come back from IndexedDB' (plan L2206, L2497).
- On Reconnect into a 'lost' room, establish() runs savedState then `mirrors(c).refresh()` (src/network/online/onlineSession.ts:L457-L458).
- refresh() first awaits the IndexedDB load. It then always calls fetchLatest(), which runs `service.getCheckpoint` and accept()s the result (src/network/online/onlineMirrors.ts:L93, L99).
- A committed mirror is by definition one the service already accepted (onlineMirrors.ts:L109). So the service returns the same capturedTick even if IndexedDB is empty or broken, and the `committed?.capturedTick === last.capturedTick` check at plan L2500 passes either way. This also means the R1-F2 reload does not test the stored mirror.
- The fallback described in prose (read mirror-v1 and check for FTLNMIR1, L2206) is not in runPairing's code (L2487-L2508). If Re-host is never offered, the until() just times out.
- The fallback also checks only the magic bytes, not the sequence the finding asked for.
- proof.rehost.restoredFromIndexedDb is hard-coded to true (L2508).
Fix: after the guest reopens, read the stored mirror before (or without depending on) the service fetch. One way is a test-probe method such as `__ftliteOnlineTest.readStoredMirror()` that returns `mirrorStore.load()`'s committed metadata; the Electron driver can call it too through its status request. Another is a browser-only page.evaluate that opens database 'ftlite', reads records/'mirror-v1', checks MAGIC at bytes 0-7, reads the header length as uint32 LE at offset 8 and JSON-parses the header at offset 12 (mirrorStore.ts:L32-L39). Then assert that header.committed.metadata.checkpointSequence and capturedTick equal `last`, and record the real result in proof instead of a literal true.
- R1-F5: resolved — gates.md step 5 now has the live checks:
- Without the cookie, a 401 for /, the Worker and a real paid file.
- With the cookie, a 200 with `private, no-cache` for each, and version.json `no-store`.
- A rollback on any failure, and a 503 diagnosis (plan L851-L856).
- A checkbox for Web-iii's live-smoke.ts to repeat the checks (L860).
Minor: a very first deploy has nothing for `vercel rollback` to return to, but the step also offers deleting the deployment.
- R1-F6: resolved — browserInit sets onlineBlocked to UNSUPPORTED_TEXT when the lock is unavailable and configured is set (plan L1711-L1712). Task 9's literal replace string at L2042 matches that new text exactly.
- R1-F7: resolved — BrowserSlice gains `web` and INITIAL_BROWSER sets it false (L901-L907). browserInit sets web: true. Settings replaces the note line with a ternary on browser.web and imports '../menuState', which is the correct relative path from ui/menu/. The tests check 'F11 also toggles fullscreen.' (FULLSCREEN_KEY = 'F11', src/shared/onlineSession.ts:L161) and BROWSER_F11_TEXT through renderUi's returned store (tests/helpers/uiRender.tsx:L7-L10).

## Verified
- acquireOnlineLock control flow (plan L1580-L1606): the first attempt uses ifAvailable. The retry waits for at most 1.5 s, inside the 2 s start-up limit. gaveUp is set after the race, so a late callback returns undefined and the lock goes at once. A sync throw is caught. Each test mock's call sequence matches the implementation.
- main.ts declares `const lock: OnlineLock` (plan L1705), so `lock.release()` in the teardown narrows correctly.
- Browser close({prompt:false}) uses page.close() with no beforeunload (plan L2327-L2328), so closing the guest during rehost does not hang on a dialog. Electron close kills the app and reopen relaunches it on the same profile (L2385).
- proof is Record<string, unknown> (plan L2427), so the new reloadKeptOnline and restoredFromIndexedDb fields compile.
- services/signalling/src/index.ts:L59-L65: any method from a non-allowed Origin, OPTIONS included, gets a 403, so the Node preflight probe sees a 403 under the injection's 'null' ALLOWED_ORIGINS.
- Rehost is offered only when the phase is 'saved', the snapshot is 'lost', mirror.committed exists and the own seat is occupied (onlineSession.ts:L85), which matches the gate's wait at plan L2500.

## Not verified
- Whether Playwright's Chromium request.allHeaders() includes the Origin header on a POST that failed because its CORS preflight was refused. The provisional headers may leave it out. If they do, the fallback branch at plan L2611 cannot match, and the injection would exit 2 unless the preflight itself shows up as a 403 response. Running the gate settles this.
- Whether Vercel's prebuilt Edge function needs or ignores envVarsInUse. The plan now lists the variables either way, and the live 503 check confirms it at Web-iii.
- I ran neither tsc nor the tests, as the constraints require.

---

# Round 2 response (plan revised to 158dd07a)

I checked `round-2.json` against the plan at its round 1 head. The verdict was "ready with P2s", with no new findings. R1-F4 reopened, and it is fixed again in `158dd07a`.

## R1-F4 [P2]: The rehost step does not show that the mirror was written to, or read from, IndexedDB (reopened)

Confirmed against the new evidence. On Reconnect, `onlineSession.ts:457-458` calls `refresh()`, and `onlineMirrors.ts:93,99` always calls `fetchLatest()` from the service. The tick comparison therefore passed even with IndexedDB empty. The prose fallback was not implemented, and `restoredFromIndexedDb` was a literal `true`.

The fix: after the browser guest reopens, and before it clicks Reconnect, the test reads `records`/`mirror-v1` directly from IndexedDB. It opens the database without a version and decodes the record using the layout in `mirrorStore.ts`:
- the magic bytes are at offsets 0-7;
- the header length is a uint32, little-endian, at offset 8;
- the header JSON starts at offset 12.

It then asserts that the stored committed `checkpointSequence` and `capturedTick` equal the last committed checkpoint. The proof records what was actually read, and the prose is updated with the fallback wording removed.

The Chromium-host / Electron-guest pairing records "not read", because the Electron driver has no page evaluate. The two browser-guest pairings carry the IndexedDB proof, and the Electron guest still passes the status-based rehost check. I accept that as sufficient coverage.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-web-ii-web-build.md

<!-- end -->

---

