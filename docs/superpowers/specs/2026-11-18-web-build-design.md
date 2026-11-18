# Web build design: FTLite in the browser, multiplayer first

Date: 2026-11-18. Status: design approved by the owner in conversation; this document records it.

## 1. Goal and owner decisions

The aim is to distribute FTLite as a website. Friends open a link, enter a passcode, and play a networked duel in their browser.

The owner made these decisions on 2026-11-18:

| # | Question | Decision |
|---|---|---|
| D1 | Do the browser and Electron both stay? | **Both stay, with one networking path.** The browser path becomes the only online path, and Electron becomes a thin window running the same page code. |
| D2 | Who is it for at first? | **The owner and invited friends only.** It is a private site behind a passcode. The build is made locally, including the gitignored paid art, and uploaded with the Vercel CLI. Vercel never builds from git. |
| D3 | Should it ship in stages? | **No. It is one project, because the game is multiplayer first.** Nothing goes live until browser multiplayer works. Internally the work splits into three parts (§9). |
| D4 | Which browsers? | **Chrome, Edge and Firefox on desktop**, all supported and tested. Safari is "not tested, may work". There is no mobile support; play is keyboard and mouse only. |
| D5 | Which Vercel plan? | **Hobby (free)**, at a `*.vercel.app` address. There is no custom domain. |
| D6 | Where does the host's simulation run? | **In the host's browser, in a Web Worker.** Players connect peer to peer over WebRTC, using the existing Cloudflare lobby service and TURN. The simulation reaches the network only through `Link`/`Session` and `PortFrame` ports, so a later Cloudflare Durable Object host can replace the Worker without changing the page. |

These are out of scope:
- **A public release.** Its gate is §10.
- **A custom domain.**
- **Safari testing.**
- **Mobile or touch support.**
- **A Durable Object game host** (D6 keeps the door open).
- **Gameplay changes.** SIM_VERSION stays as it is on master, and this project never changes it.

## 2. Where things stand

These findings come from a read of master on 2026-11-18.

### 2.1 What runs in each process today

| Piece | Runs in | Files |
|---|---|---|
| Window and the IPC handlers for fullscreen and duel records | Electron main process | `src/main/index.ts` |
| Online session state machine and lobby client | Electron main process | `src/main/network/onlineSession.ts` and its helpers (`onlinePeers`, `onlineDuel`, `onlineSector`, `onlineMirrors`, `onlineModes`, `onlineIce`, `onlineRetry`, `onlineConfig`) |
| Host's game simulation | Electron utility process | `src/utility/authorityHost.ts` → `src/network/utilityHost.ts` with `authorityModes` |
| WebRTC peers | A hidden `show:false` BrowserWindow | `src/main/network/transportWindow.ts`, `src/preload/networkTransport.ts`, `src/renderer/networkTransport.ts` → `src/network/transport/bridge.ts` |
| Game screen | Renderer | `src/renderer/src/main.ts`, with `window.ftlite` from `src/preload/index.ts` |

These pieces connect in four ways:
- **The renderer and the main process** use `ipcRenderer.invoke` on the `online:*`, `duel:record` and `app:fullscreen` channels (`src/shared/onlineSession.ts:129-169`). Main pushes `app:suspend` and `app:resume` from `powerMonitor`.
- **The game data stream** is a `MessageChannelMain` port, which is re-posted to the page and validated by `src/renderer/src/app/onlineBridge.ts`.
- **The main and utility processes** exchange messages and transfer `MessagePortMain` ports.
- **The hidden window** uses RTC request and response IPC. Each attempt carries a transferred data port, and the data moves as `PortFrame`s (`src/network/portLink.ts`).

### 2.2 Code that is already portable

These pieces already work outside Electron:
- **WebRTC.** It uses the browser's `RTCPeerConnection` (`src/network/rtc/peer.ts:57`), and there is no Node WebRTC library.
- **The lobby client** (`src/network/session/serviceClient.ts`). `fetch` and `WebSocket` are injected, and it hashes with `crypto.subtle`.
- **Network code with no Node imports:** `utilityHost.ts`, `hostRuntime.ts`, `portLink.ts`, `modes/*`, `rtc/*`, `state/*`, `transport/controller.ts` and `session/leaseGate.ts`.
- **The renderer.** It has no `process`, `require` or `node:` imports, and every `window.ftlite` call site is optional-chained.
- **Asset loading** (`render/assets.ts`). It already resolves URLs against `document.baseURI`.

### 2.3 Code that needs a browser version

- **`node:crypto` and `Buffer`.** These are used in `onlineSession.ts`, `onlineDuel.ts`, `onlineSector.ts` and `onlineMirrors.ts` (for synchronous `createHash('sha256')`, `randomBytes` and base64), and in `seatStore.ts` and `mirrorStore.ts`.
- **Files on disk.**
  - `seatStore.ts` writes `online-seat-v1.json` (at most 8,192 bytes) and `mirrorStore.ts` writes `online-mirror-v1.bin` (at most 557,056 bytes, magic `FTLNMIR1`). Both are atomic temp-plus-rename writes under `userData`, and both already have a file-system seam.
  - `duelRecords.ts` appends `playtest/duel-YYYY-MM-DD.jsonl` (8 KiB per record, 16 MiB per file).
- **The utility entry point.** `authorityHost.ts` uses `process.parentPort`, `node:perf_hooks`, `randomBytes` and `process.exit`. `platformPort.ts`'s `emitterPortEndpoint` adapts only Node and Electron emitters.
- **Electron-only files:** `transportWindow.ts`, `onlinePlatform.ts`, `onlineIpc.ts` and `onlineExit.ts`. They use `BrowserWindow`, `ipcMain`, `MessageChannelMain`, `powerMonitor`, `utilityProcess` and the window-close events.
- **Service configuration.** `onlineConfig.ts` accepts exactly one of `FTLITE_LOCAL_SERVICE_URL`, `FTLITE_SERVICE_URL` or the build define `__FTLITE_PACKAGED_SERVICE_ORIGIN__`. Loopback gives `iceMode:'loopback'`, and https gives `'turn'`.

### 2.4 The Cloudflare lobby service

`services/signalling` is the Worker `ftlite-signalling-dev`, with SQLite Durable Objects `Room` and `Directory`.

- **Origin check.** The Worker's `fetch` wrapper checks the request `Origin` against `ALLOWED_ORIGINS` for every route, including the socket upgrade. It allows a `null` or missing origin (`services/signalling/src/index.ts:58-62`). `room/sockets.ts` has no origin logic of its own.
- **CORS responses.** For an allowed origin it sets `Access-Control-Allow-Origin` and `Vary` (`index.ts:69`), and the preflight allows the custom request headers (`index.ts:26`). It does **not** set `Access-Control-Expose-Headers`. A page therefore cannot read the `X-FTL-Checkpoint` response header of a checkpoint GET (`room/checkpoints.ts:44`, read at `serviceClient.ts:507-508`). Today this works only because Electron's main-process `fetch` ignores CORS.
- **`ALLOWED_ORIGINS` is a Wrangler secret**, provisioned as `null` through `wrangler secret bulk` (`docs/superpowers/reviews/2026-11-15-net-3e-evidence/README.md:12`). It is not in `wrangler.jsonc`.
- **TURN.** The service mints TURN credentials, valid for 3,600 s, from the `ftlite-dev` TURN app.

## 3. Where things run after this project

The topology is the same in the browser and in Electron.

| Piece | Runs in | Replaces |
|---|---|---|
| Game screen | Page | (unchanged) |
| Online session state machine and lobby client | **Page** | The Electron main process |
| WebRTC peers | **Page** (Chrome and Firefox do not offer `RTCPeerConnection` in Workers) | The hidden transport window |
| Host's game simulation | **A dedicated Web Worker**, created by the page only while hosting | The Electron utility process |
| Wiring | Standard `MessageChannel` ports carrying the existing `PortFrame` protocol | Electron IPC and `MessagePortMain` |

### 3.1 The `OnlinePlatform` seam

The session's dependencies on Node and Electron all go behind one injected interface. The exact names are settled in the plan.

- **Clock and scheduler.** These use `performance.now`, `Date.now` and `setTimeout`.
- **Random bytes and nonces.** These use `crypto.getRandomValues`.
- **Synchronous SHA-256.** This is a small built-in TypeScript implementation that keeps today's synchronous call sites. Before it replaces `createHash`, it must match Node's `crypto` byte for byte on a fixed set of test vectors and random inputs.
- **Base64.** This replaces the `Buffer` calls with `btoa`/`atob` on byte strings, or a small codec.
- **Storage.**
  - **A new byte key-value seam, `OnlineRecordStore`:** `get(key) → Uint8Array | null`, `put(key, bytes)` and `delete(key)`. The keys are `seat-v1` and `mirror-v1`. Each `put` replaces one record in one IndexedDB transaction (database `ftlite`, store `records`), so the temp-plus-rename step goes away.
  - **What stays:** the seat and mirror stores keep their size caps, validators, mirror layout (`FTLNMIR1`) and payload check, and they move to this seam. The old `SeatStoreFileSystem`/`MirrorFileSystem` file-handle seams are removed.
  - **Replacements for Node:** `node:path` `join` is no longer needed. `randomUUID` becomes `crypto.randomUUID()`. `Buffer.byteLength` becomes `TextEncoder` length, and `Buffer` copies become `Uint8Array`.
- **Suspend and resume (OS sleep only).** The session's `suspend()` and `resume()` retire the game and reconnect (`onlineSession.ts:569-577`), so they must fire only on real sleep and wake, **never on `visibilitychange`**. A hidden tab keeps playing (§3.5).
  - **The browser trigger:** the page platform raises suspend and resume from a clock-jump detector. A 1 s page `setInterval` compares the `Date.now()` and `performance.now()` deltas. A wall-clock gap more than 15 s larger than the monotonic gap counts as one suspend-then-resume. A long gap on its own does not count, because Chrome's intensive throttling can delay hidden-tab timers by up to a minute. Some platforms keep `performance.now()` running through sleep, so this detector can miss a sleep. In that case the existing socket-loss and lease-expiry paths recover as they do today after a network drop. A `pagehide` with `persisted: true` (back-forward cache) counts as a suspend, and its `pageshow` as a resume.
  - **The Electron trigger:** main keeps pushing `app:suspend`/`app:resume` from `powerMonitor` to the page (§3.3), and the page platform uses that in place of the detector.
  - **Who consumes it:** both triggers feed the session's `suspend()`/`resume()`, which invalidates the lease on suspend as `hostProcess.ts:233-240` does, and the existing `lifecycle.onSuspend`/`onResume` callers in `duelMode.ts:79-80` and `flightMode.ts:54-55`.
- **Exit save.** This replaces `onlineExit.ts`.
  - **The browser:** the exit is best effort. On `pagehide`, the session sends the release over the open signalling WebSocket and closes the peers. It does not attempt a new checkpoint capture, because a page cannot wait for async work and a `keepalive` fetch is capped at 64 KiB while a checkpoint can reach 512 KiB. Recovery relies on the latest periodic checkpoint already at the service and in every player's IndexedDB mirror.
  - **Electron:** a full exit save is kept (§3.3).
- **Host start.** `new Worker(...)` starts the host's simulation. The session talks to it only through ports.
- **Online configuration.** One service origin is baked in at build time (§5.1). Loopback keeps `iceMode:'loopback'` for local tests.

### 3.2 The host Worker

**The Worker entry.** A new entry, `src/worker/authorityWorker.ts`, runs `createUtilityHost(authorityModes, …)`.
- It runs on a web port endpoint, which is `emitterPortEndpoint`'s browser counterpart over `MessagePort` `message` events.
- It reads the clock and nonce from the platform.
- It never calls `process.exit`: the page calls `worker.terminate()`.
- It keeps the build define `__GAMEPLAY_CONTENT_DIGEST__`.

**Its owner in the page.** `hostProcess.ts` becomes the platform-neutral owner `src/network/host/workerHost.ts`.
- It implements the existing `HostProcessHandle` unchanged: `onCheckpoint`, `ackCheckpoint`, `captureCheckpoint`, `onLeaseRequest` with replay of the latest request, `applyLease`, `invalidateLease`, `completeBootstrap`, `request` with its 5 s timeouts, `attachPeer`, `onExit` and the 250 ms dispose.
- It keeps the protocol validation and the crash-record bounds.
- Its `HostPlatform` changes to the Worker version:
  - `spawn` is `new Worker(new URL('../../worker/authorityWorker.ts', import.meta.url), { type: 'module' })`;
  - `kill` is `terminate()`;
  - `onExit` fires on the Worker `error` event, or after `terminate()`.

**Readiness.** Today the readiness gate has three parts: utility ready, window ready, and the bridge's `transport-ready`. It becomes two parts: Worker ready, and `transport-ready`. The page-side transport controller (`transport/bridge.ts` and `controller.ts`) answers the Worker's `transport` port with `transport-ready`, as the hidden window's bridge does today (`utilityHost.ts:158-165`).

**Tests.** The existing `hostProcess` and bridge unit tests are ported to the new owner. They are not deleted.

### 3.3 Electron afterwards

Electron's main process keeps only these jobs:
1. **Opening the window.** The main window now sets `backgroundThrottling: false`, because the RTC peers, the session and the lease relay move into it. This matches the hidden transport window today (`transportWindow.ts:33-36`). Electron can opt out of throttling, and the browser cannot.
2. **Fullscreen**, through the existing `app:fullscreen` handler and the F11 handling.
3. **Loading the page.**
4. **`duel:record`**, so Electron keeps writing to disk.
5. **Pushing `app:suspend` and `app:resume`** from `powerMonitor` to the page (§3.1).
6. **The exit save on close.**
   - **The close handshake:** main keeps a window `close` and `before-quit` interception. It asks the page to run the session's `prepareExit` over a new `app:prepare-exit` invoke, and closes when the page answers or after 3 s, whichever comes first. This is today's `onlineExit.ts` behaviour, with the work now done in the page.
   - **The leave prompt:** main also handles `will-prevent-unload` by allowing the unload, so the page's `beforeunload` prompt (§7.6) never silently blocks an Electron close. The page also skips `beforeunload` when `window.ftlite` is present.
7. **Handing the page its online config** (below).

The page starts the host Worker in Electron exactly as it does in the browser. These are deleted:
- the utility process and the hidden transport window;
- `transportWindow.ts`, `onlinePlatform.ts`, `onlineIpc.ts`, `onlineExit.ts`'s main-side session code, `hostProcess.ts` (moved, §3.2) and `rtcTransport.ts`;
- the RTC IPC channels;
- the `online` half of `window.ftlite`.

#### The page session factory and its renderer API

The new module `src/renderer/src/app/online/pageSession.ts` exports `createPageOnline(config: PageOnlineConfig)`.
- **What it builds:** the session from its dependencies (the page platform §3.1, the service client with the page's `fetch` and `WebSocket`, the record store, the host owner §3.2, and the page transport controller).
- **What it returns:** an object with the same shape as today's `OnlinePreloadApi` (the online half of `window.ftlite`), plus `onPort(cb)`. Game ports are handed to `onPort` directly, with no `window.postMessage` envelope.
- **How the renderer uses it:** `main.ts` builds the bridge from this object in place of `window.ftlite.online`, so `onlineAvailable` and the existing screens are unchanged.

`PageOnlineConfig` is `{ serviceOrigin, iceMode, allowInsecureLocalhost, packaged, sectorOnlineTest, duelTestSeed }`, validated by the existing `resolveOnlineConfig` rules. It reaches the page in one of two ways:
- **Electron:** main resolves it from the same environment variables and `app.isPackaged` as today (`FTLITE_LOCAL_SERVICE_URL`, `FTLITE_SERVICE_URL`, `FTLITE_SECTOR_ONLINE_TEST`, `FTLITE_DUEL_TEST_SEED`). The preload exposes it as a frozen `window.ftlite.onlineConfig`. The test-only fields are honoured only when unpackaged, as today.
- **The web build:** `build:web` bakes the config in as a define. The `sectorOnlineTest` and `duelTestSeed` fields can be set only by a `--test` build. A production build refuses them, and always has `packaged: true`.

**The trust boundary moves.** The seat token and the session used to live only in Electron's main process, and now live in page JavaScript. The session object is never put on `window`, and the passcode cookie is `HttpOnly`. Any script running in the page could still read the seat token. This is accepted: the page loads only its own bundled code.

Because Electron also stores the seat and mirror in IndexedDB, saved seats from an older Electron build are not migrated. A one-time loss of the saved seat is accepted.

### 3.4 Room for a cloud host later (D6)

The page reaches the host's simulation only through `Link`/`Session` and `PortFrame` ports. So a later Durable Object host would replace "start a Worker" with "open a WebSocket to the room". It would make no other change to the page.

### 3.5 The background-tab risk and the first-task test

Chrome and Firefox throttle hidden tabs. The design assumes two things:
- the host Worker's timers keep the duel's 60 Hz tick (`TICK_HZ`) in a hidden tab;
- RTC data-channel and `MessagePort` events keep arriving promptly in the page.

The page main thread also matters, not only the Worker. The session, the RTC relay and the lease round trip all run there. The lease is renewed every 5 s against a 12 s local lease, going Worker → page → signalling WebSocket → page → Worker. Page timers in a hidden tab are clamped to at least 1 s (`serviceClient.ts:319-333` yields with `setTimeout(0)`).

**Web-i Task 1 is a test that measures this before anything is built on it.**

**The test setup.** A test page starts a Worker ticking at 60 Hz. The page relays a message loop over an `RTCDataChannel` pair, and runs a lease-style round trip every 5 s: Worker → page → a WebSocket to local workerd → page → Worker. Playwright drives Chromium and Firefox. The run is **headed**: the test page is put behind a second foreground tab in the same window and kept there for 10 minutes. The test records:
- the Worker tick rate;
- the relay delay;
- the lease round-trip gaps;
- a page-side 100 ms `setInterval` control.

**Valid run.** The run counts only if `document.visibilityState` is `'hidden'` throughout, and the control interval is visibly clamped, to an average period of at least 900 ms. That proves the browser really throttled the page. Headless runs do not count, because they never hide the page.

**Pass**, in both browsers:
- the Worker holds at least 59 ticks a second over every 10 s window;
- the 99th-percentile relay delay grows by no more than 20 ms compared with a visible run;
- no lease round-trip gap exceeds 8 s.

**Fail.** If either browser fails, the plan adds a **"Keep this tab visible: the match runs on your computer"** warning, which shows while the hosting tab is hidden. It also moves any timer-driven page work on the lease path onto event-driven `MessagePort` and WebSocket callbacks. Any other fallback (for example, an audio source) is adopted only if Task 1 shows that it actually stops the throttling.

The test result and the chosen path are recorded in the Web-i plan.

## 4. Mixed play and versions

A browser build and an Electron build from the same commit have the same `RoomCompatibility`, so they can join each other's lobbies. It has six fields: protocol version, mode ID, schema version, sim version, content digest and layout hash (`serviceClient.ts:61-64`).

A tab on a different build, newer or older, is refused by the existing `incompatible` check. The error text is direction-neutral: **"This lobby runs a different version. Both players should reload."** The update banner (§5.4) tells each player whether their own tab is out of date.

## 5. Vercel

### 5.1 The build

**The build command.** `npm run build:web` runs a plain Vite build of the renderer, with no Electron main or preload. Its config is `vite.web.config.ts`, which shares the renderer settings with `electron.vite.config.ts`.

**What it includes.** The entries are `index.html` and the host Worker. It drops `networkTransport.html`. It injects the `__GAMEPLAY_CONTENT_DIGEST__` and `__FTLITE_BUILD__` build defines.

**The service origin.** The build reads `FTLITE_WEB_SERVICE_ORIGIN`. It refuses to build unless the value is exactly one https origin, or a loopback origin when building a local test.

**The paid art.** `public/` is copied as is, so the paid PNGs come from the local, gitignored `public/assets/paid`. The build fails if `public/assets/paid` is missing, so a deploy cannot ship without the art by mistake. A local-only `--allow-missing-paid` flag skips this check for tests.

**The output.** The result is written in Vercel's Build Output API format to `.vercel/output`:
- `static/` holds the game;
- `functions/` holds the passcode middleware (§5.3);
- `config.json` holds the routes.

### 5.2 The deploy

`npm run deploy:web` runs `build:web` and then `vercel deploy --prebuilt --prod`. Vercel never builds from git.

**One-time setup is the owner's:**
1. `npx vercel login`.
2. `vercel link`, to a new Hobby project.
3. Set the environment variables `FTLITE_PASSCODE` and `FTLITE_COOKIE_SECRET` (32 random bytes, base64) in Vercel's settings.

The project pins the Vercel CLI as a dev dependency.

**Production only.** Vercel's git integration stays disconnected, so only `--prod` deploys exist. The one stable `https://<project>.vercel.app` origin is the only origin allowed at Cloudflare. Preview addresses are not allowed.

### 5.3 The passcode

A Vercel Routing Middleware (Edge runtime, available on Hobby) runs on every request.

**Who gets through.** A request with a valid `ftlite_pass` cookie passes. Any other request gets a small built-in passcode page, an HTML form that posts to `/__pass`. The passcode page and `/__pass` are the only paths served without the cookie. This includes `/assets/paid/*`, `version.json` and the Worker script.

**The check.** `/__pass` compares the submitted code with `FTLITE_PASSCODE` in constant time.

**On success.** It sets the cookie `ftlite_pass=<expiry>.<HMAC-SHA256(secret, expiry)>` with `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` (30 days), then redirects to `/`.

**On failure.** It waits 1 s, then shows the form again with "Wrong passcode".

**Changing access.** The owner changes `FTLITE_PASSCODE` in Vercel to change the code. Changing `FTLITE_COOKIE_SECRET` signs everyone out.

**Caching.** Paid art and the game files are served with `Cache-Control: private`, so shared caches never hold them.

### 5.4 Updates while the game is open

Each build writes `version.json` with `{ build: __FTLITE_BUILD__, sim: SIM_VERSION, digest }`. It is served with `Cache-Control: no-store`.

The menu fetches it at start and every 5 minutes while on the menu or in a lobby. If the build differs from the running build, it shows a banner, **"New version: reload"**, with a reload button. The banner never interrupts a match.

## 6. Cloudflare

**Expose the checkpoint header (code change, Web-i).** `index.ts` adds `Access-Control-Expose-Headers: X-FTL-Checkpoint` to every response for an allowed origin that is not null. A signalling test asserts the header. Without it, rehost and mirror refresh fail from a page (§2.4).

**Socket upgrades.** The `index.ts` wrapper already gates socket upgrades by `Origin`. A signalling test is added: an upgrade with a disallowed `Origin` gets 403, and an upgrade with an allowed origin succeeds.

**Allowed origins (Web-iii, the owner's login).** `ALLOWED_ORIGINS` is a secret, so it is set with `wrangler secret put ALLOWED_ORIGINS`. The value is the full comma list, `null,https://<project>.vercel.app`. The `null` entry stays, because Electron's `file://` page sends `Origin: null` once the session runs in the page. Then one `wrangler deploy` ships the Expose-Headers change.

**Local test origins.** For the gates, the local workerd runs with `ALLOWED_ORIGINS` set to `null,http://localhost:<preview port>,http://127.0.0.1:<preview port>`. Electron also has to work in dev: its dev page is served from the electron-vite dev server, so the dev origin is added in local dev runs.

**TURN.** Credential minting is unchanged. The page's session asks for credentials through the existing `onlineIce.ts` cache and rate limit.

**The service is not behind the passcode.** Anyone who learns its URL can create lobbies within the existing admission limits:
- five creates per IP per minute;
- 100 charged active rooms;
- 1,000 TURN attempts per UTC day.

This is accepted for the private playtest, and it is a gate before any public release (§10).

## 7. Browser behaviour

### 7.1 Keys and mouse

While the game has focus, `preventDefault` stops the browser's own handling of these keys:
- Tab (focus moves);
- Space, arrows, PageUp/PageDown and Home/End (scrolling);
- Backspace (navigation);
- the game's other bound keys.

F11 is left to the browser. The context menu is turned off over the stage. Ctrl+wheel and pinch-zoom are turned off over the stage, while the plain wheel keeps zooming the map. Browser-reserved shortcuts such as Ctrl+W and Ctrl+T cannot be caught. The help screen does not mention them.

### 7.2 Fullscreen

`window.ftlite.window` is absent in the browser, so the Settings fullscreen toggle uses the Fullscreen API (`requestFullscreen` and `exitFullscreen`).

**On entering fullscreen,** the page tries `navigator.keyboard?.lock(['Escape'])`. The path is chosen by whether that promise resolves, not by browser name.

**If the lock resolves** (Chrome and Edge): Esc reaches the game, and holding Esc leaves fullscreen, which is the browser's own rule.

**If the lock is missing or rejects** (Firefox, or a Chrome lock failure): Esc leaves fullscreen first. A `fullscreenchange` to not-fullscreen is then treated as one Esc press (pause, or close a window) only if all three of these hold:
- the page did not start the exit itself (a flag is set around the page's own `exitFullscreen` call, such as the Settings toggle);
- a match is running;
- no Escape `keydown` reached the game in the last 100 ms (so the press never counts twice).

### 7.3 Audio

Browsers block audio until a user gesture. The audio context resumes on the first pointer or key event: the passcode form submit, or the first menu click. Menu music then starts as it does today. No sound is lost, because nothing plays before that first gesture anyway.

### 7.4 Saved data

- The existing `localStorage` keys stay as they are: `ftlite-progress`, `ftlite-settings`, `ftlite-telemetry`, `ftlite-feel` and `ftlite-crt`.
- The seat and the mirror move to IndexedDB (§3.1). On first online use the page calls `navigator.storage.persist()`, and a refusal is not an error.
- Duel records go to an IndexedDB store, `duelRecords`, keyed by date with the same per-record and per-day caps.
- Settings gains **"Download playtest log"**. It saves one combined file, `ftlite-playtest-<first date>-to-<last date>.jsonl`: today's per-record format, oldest first. It downloads through a `Blob` link.

### 7.5 One online tab

The online session takes the Web Lock `ftlite-online` for as long as it exists. A second tab that cannot get the lock shows **"FTLite is already open in another tab"** on the Multiplayer screen. Single player stays available in that tab.

### 7.6 Leaving the page

While hosting, in a lobby or in a match, `beforeunload` triggers the browser's standard leave prompt. Browsers show their own text. The prompt is skipped in Electron (§3.3).

On `pagehide`, the session does the best-effort release (§3.1). No new checkpoint is captured. If the host's tab is gone, the existing rehost flow lets a player continue the match from the latest periodic checkpoint at the service, or from their IndexedDB mirror, as it does when an Electron host quits today. Up to one checkpoint interval of play can be lost.

### 7.7 Unsupported browsers

At start the page checks for:
- `RTCPeerConnection`
- `Worker`
- `indexedDB`
- `crypto.subtle`
- `crypto.getRandomValues`
- `MessageChannel`
- `navigator.locks`

If any is missing, it shows **"FTLite needs a recent Chrome, Edge or Firefox on a computer."** in place of Multiplayer, and Single player still runs. Safari passes the checks and shows a one-line "Safari is not tested" note on the menu.

## 8. Testing

These gates carry over:
- `npm run typecheck`;
- `npm test`;
- `npm run test:determinism`, on Node, Electron and Firefox;
- the signalling service tests.

The game stays deterministic, and SIM_VERSION does not change.

**Portable code:**
- **SHA-256:** the vectors and fuzz checks against `node:crypto` from §3.1.
- **IndexedDB stores:** these run against `fake-indexeddb` in Vitest, covering the round trip, the caps, corrupt payloads and the mirror payload check.
- **The web port endpoint:** a unit test over a real `MessageChannel`.
- **`createUtilityHost`:** it runs in a test Worker, if Vitest supports one, or behind the same port interface.

**Electron network gates.** Every script that loads the deleted utility process, hidden window or `powerMonitor` has a stated fate. All of them still run actual Electron against local workerd and keep their failure-injection checks. Checks for the hidden window or utility exiting become checks that the Worker terminates and the ports close.

| npm entry / script | Today loads | Fate |
|---|---|---|
| `test:host-runtime` (`host-smoke.cjs`/`.ts`, `host-smoke-page.ts`, `host-smoke-preload.cjs`) | `out/main/hostProcess.js` and `transportWindow.js`; patches `utilityProcess.fork` | **Rewritten** as a page smoke for the Worker owner (§3.2): spawn, readiness, request timeouts, `captureCheckpoint`, crash, dispose |
| `test:rtc-runtime` (`rtc-smoke*.cjs/.ts`, `rtc-smoke-client.ts`, `rtc-smoke-native.cjs`, `rtc-smoke-report.ts`) | `transportWindow.js`, the hidden window | **Rewritten** as a page RTC smoke: two Electron pages, with the controller in the page |
| `rtc-config-smoke.*` | the RTC config in the hidden window | **Rewritten** to check ICE config handling in the page |
| `lease-smoke.cjs`/`.ts`, `lease-smoke-lifecycle.ts` | `hostProcess.js`, `utilityProcess.fork` | **Rewritten** against the Worker owner, with the same lease cases |
| `test:room-service-runtime` (`room-service-smoke.*`, `room-service-report.ts`) | `hostProcess.js`, `transportWindow.js` | **Rewritten** for the new topology. Its four `--inject-*` failures keep exiting nonzero |
| `test:online-app-runtime` (`online-app-*`) | `powerMonitor.emit('suspend')` in `online-app-smoke.cjs:179`; reports hash `authorityHost.js`, `hostProcess.js`, `transportWindow.js`, `networkTransport.html` | **Rewritten.** The suspend injection becomes main pushing `app:suspend`/`app:resume` to the page, which is the real Electron path (§3.3). The artifact lists in `online-app-report.ts` swap the deleted files for the Worker chunk and the page entry |
| `test:online-recovery-runtime` (`online-recovery-*`) | an instrumented `authorityHost.js` (`online-recovery-report.ts:84`, `online-recovery-utility.*`) | **Rewritten.** The instrumentation wraps the Worker entry instead |
| `test:duel-app-runtime` (`duel-app-*`) | the online stack, through the app | **Rewritten** for the page session. Its checks are unchanged |
| `test:internet-app-runtime` (`internet-app-*`, `candidate-manifest.ts`) | manifests that hash `authorityHost.js`, `hostProcess.js`, `transportWindow.js`, `networkTransport.html` | **Manifests updated** in Web-i. The live check in Web-iii is a new browser script, `scripts/web/live-smoke.ts` |
| `test:determinism` | its own `scripts/determinism/electron.cjs` runner | **Unchanged** |

**Electron minimized host (new).** An Electron host is minimized for 60 s during a duel. The duel keeps ticking at 60 Hz and keeps its lease, which checks `backgroundThrottling: false` (§3.3).

**Electron close (new).** Closing the window during a match runs `app:prepare-exit` and leaves a fresh checkpoint at the service within 3 s.

**Browser network gates (new):**
- These are Playwright runs of Chromium and Firefox against local workerd, loopback ICE and a `vite preview` of the web build.
- The runs cover:
  - host and join;
  - a short scripted duel whose authority publication matches the guest;
  - guest reconnect with the saved seat;
  - rehost from the IndexedDB mirror after the host tab closes.
- The pairings are:
  - Chromium host with a Firefox guest;
  - a Firefox host with a Chromium guest;
  - a Chromium host with an Electron guest.

**Passcode tests:**
- The middleware's unit tests cover a wrong code, a right code, an expired cookie and a tampered cookie.
- A `vercel dev`-free check of the built `.vercel/output` confirms that every static path except the passcode page needs the cookie.

**The background-tab test** in §3.5.

**The live check (Web-iii):** a new script, `scripts/web/live-smoke.ts`, runs against the live URL. It enters the passcode from an environment variable. It runs two browser profiles with `iceTransportPolicy: 'relay'` (forced through TURN), host, join, play 60 s and leave.

## 9. Parts

This is one project with nothing live until it is done (D3). The three parts each get their own plan and refine, and they merge in order:

1. **Web-i: the online stack moves into the page.**
   - Task 1 is the background-tab test (§3.5).
   - Then come the `OnlinePlatform` seam, SHA-256 and base64, the IndexedDB stores and the host Worker.
   - The session moves into the page, Electron switches over and the Electron-only online code is deleted.
   - The signalling service gets the Expose-Headers change and the socket-origin test (§6). It is not deployed until Web-iii.
   - The Electron network gates are rewritten.
   - Gate: everything in §8 except the browser, passcode and live checks.
2. **Web-ii: the web build and browser behaviour.**
   - This covers `build:web`, the Build Output, the middleware, `version.json` and the banner, and all of §7.
   - It also adds the browser network gates and the passcode tests.
3. **Web-iii: going live.** The owner does the steps that need their login, and Claude drives the rest:
   1. `wrangler secret put ALLOWED_ORIGINS` with `null,https://<project>.vercel.app`, then `wrangler deploy` for the Expose-Headers change (§6).
   2. Vercel login, link and the environment variables.
   3. `deploy:web`.
   4. The live TURN check (§8).
   5. The owner's playtest with a friend.

**Done means:** two people on different networks open the `.vercel.app` link and pass the passcode. One hosts and the other joins by code. They finish a duel. Rehost works after the host tab closes.

## 10. Gates before any public release

These are added to `docs/gates.md` and not done in this project:
- **Art licences.** The 2MT Hound map licence does not cover video games, so it needs written permission or a replacement. The Maru-98 and Pimen terms need checking for web distribution.
- **Lobby service access.** It needs a passcode or account check, or stricter admission limits, before strangers can reach it.
- **Vercel plan.** Hobby is for non-commercial use, so move to Pro before anything commercial.
