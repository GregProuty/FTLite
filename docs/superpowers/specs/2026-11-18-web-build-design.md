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

`services/signalling` is the Worker `ftlite-signalling-dev`, with SQLite Durable Objects `Room` and `Directory`. It already checks the request `Origin` against `ALLOWED_ORIGINS` and returns CORS headers. It allows a `null` or missing origin, which is what Electron sends (`services/signalling/src/index.ts:59-69`). It also mints TURN credentials, valid for 3,600 s, from the `ftlite-dev` TURN app.

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
- **Storage.** IndexedDB implements the existing `SeatStoreFileSystem` and `MirrorFileSystem` seams, under database `ftlite` and store `files`. Each write is a single transaction, which replaces the temp-plus-rename step. The size caps and the payload check stay as they are.
- **Suspend and resume.** `visibilitychange` and `pagehide`/`pageshow` replace `powerMonitor`.
- **Exit save.** A best-effort, bounded checkpoint save on `pagehide` replaces `onlineExit.ts`.
- **Host start.** `new Worker(...)` starts the host's simulation. The session talks to it only through ports.
- **Online configuration.** One service origin is baked in at build time (§5.1). Loopback keeps `iceMode:'loopback'` for local tests.

### 3.2 The host Worker

A new entry, `src/worker/authorityWorker.ts`, runs `createUtilityHost(authorityModes, …)`. It runs on a web port endpoint, which is `emitterPortEndpoint`'s browser counterpart over `MessagePort` `message` events. It reads clock and nonce from the platform. The Worker never calls `process.exit`: the page calls `worker.terminate()`. It keeps the build define `__GAMEPLAY_CONTENT_DIGEST__`.

### 3.3 Electron afterwards

Electron's main process keeps only four jobs:
- opening the window;
- fullscreen, through the existing `app:fullscreen` handler and the F11 handling;
- loading the page;
- `duel:record` (Electron may keep writing to disk).

The page starts the host Worker in Electron exactly as it does in the browser. The utility process, the hidden transport window, `transportWindow.ts`, `onlinePlatform.ts`, `onlineIpc.ts`, `onlineExit.ts`, `hostProcess.ts`, `rtcTransport.ts`, the RTC IPC channels and the `online` half of `window.ftlite` are deleted.

Electron gets its service origin the same way as the web build (§5.1), with the existing environment-variable overrides kept for development. Because Electron also stores the seat and mirror in IndexedDB, saved seats from an older Electron build are not migrated. A one-time loss of the saved seat is accepted.

### 3.4 Room for a cloud host later (D6)

The page reaches the host's simulation only through `Link`/`Session` and `PortFrame` ports. So a later Durable Object host would replace "start a Worker" with "open a WebSocket to the room". It would make no other change to the page.

### 3.5 The background-tab risk and the first-task test

Chrome and Firefox throttle hidden tabs. The design assumes two things:
- the host Worker's timers keep the duel's 60 Hz tick (`TICK_HZ`) in a hidden tab;
- RTC data-channel and `MessagePort` events keep arriving promptly in the page.

**Web-i Task 1 is a test that measures this before anything is built on it.** A test page starts a Worker ticking at 60 Hz and relays a message loop through the page over an `RTCDataChannel` pair. It is driven by Playwright in Chromium and Firefox, runs 10 minutes with the tab hidden, and records the tick rate and the relay delay.

The test passes if, in both browsers:
- the Worker holds at least 59 ticks a second over every 10-second window;
- the 99th-percentile relay delay grows by no more than 20 ms compared with the visible tab.

If either browser fails, the plan adds the fallback:
- a **"Keep this tab visible: the match runs on your computer"** warning that shows while the hosting tab is hidden;
- a silent, looping Web Audio source while hosting, because an audible tab is not throttled in Chrome.

The test result and the chosen path are recorded in the Web-i plan.

## 4. Mixed play and versions

A browser build and an Electron build from the same commit have the same `RoomCompatibility` (protocol version, mode ID, sim version and content digest), so they can join each other's lobbies.

A tab running an older build is refused by the existing compatibility check, and the error text says **"This lobby runs a newer version. Reload to update."** (§5.4).

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

**Allowed origins.** The production `https://<project>.vercel.app` is added to `ALLOWED_ORIGINS` in the lobby service's deploy config, followed by one `wrangler deploy`. The origin is added alongside the existing allowance for null or missing origins, so Electron keeps working.

**Socket upgrades.** WebSocket upgrades from the page carry the `Origin` header. The plan confirms that `room/sockets.ts` checks it the same way, and adds a test if it does not.

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

**On entering fullscreen:**
- **Chrome and Edge:** the page calls `navigator.keyboard.lock(['Escape'])`. Esc then reaches the game, and holding Esc leaves fullscreen, which is the browser's own rule.
- **Firefox:** it has no Keyboard Lock. Esc leaves fullscreen first, so a `fullscreenchange` to not-fullscreen during a match is treated as one Esc press (pause or close a window), the same as the keyboard path.

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

While hosting, in a lobby or in a match, `beforeunload` triggers the browser's standard leave prompt. Browsers show their own text.

On `pagehide`, the session runs the bounded exit save (§3.1). If the host's tab is gone, the existing rehost flow lets a player continue the match from their mirrored checkpoint, as it does when an Electron host quits today.

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

**Electron network gates:**
- `test:room-service-runtime`, `test:online-app-runtime`, `test:online-recovery-runtime` and `test:duel-app-runtime` are rewritten for the new topology.
- They still run actual Electron against local workerd, and they keep their failure-injection checks.
- The topology checks for the hidden window and the utility process become checks that the Worker exits and the ports close.

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

**The live check (Web-iii):** the existing `test:internet-app-runtime` style script is pointed at the live URL. It runs two browser profiles with `iceTransportPolicy: 'relay'` (forced through TURN), host, join, play 60 s and leave.

## 9. Parts

This is one project with nothing live until it is done (D3). The three parts each get their own plan and refine, and they merge in order:

1. **Web-i: the online stack moves into the page.**
   - Task 1 is the background-tab test (§3.5).
   - Then come the `OnlinePlatform` seam, SHA-256 and base64, the IndexedDB stores and the host Worker.
   - The session moves into the page, Electron switches over and the Electron-only online code is deleted.
   - The Electron network gates are rewritten.
   - Gate: everything in §8 except the browser, passcode and live checks.
2. **Web-ii: the web build and browser behaviour.**
   - This covers `build:web`, the Build Output, the middleware, `version.json` and the banner, and all of §7.
   - It also adds the browser network gates and the passcode tests.
3. **Web-iii: going live.** The owner does the steps that need their login, and Claude drives the rest:
   1. The service's allowed origin and `wrangler deploy`.
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
