# Web-i: The Online Stack Moves Into the Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move FTLite's online session, lobby client and WebRTC peers out of Electron's main process and hidden transport window into the game page, and the host's simulation out of the Electron utility process into a dedicated Web Worker, so Electron becomes a thin window running the same page code the web build (Web-ii) will ship.

**Architecture:** The session state machine (`onlineSession.ts` and its helpers) is copied into `src/network/online/` with every Node and Electron dependency replaced by portable code: a built-in synchronous SHA-256, byte/base64 helpers, `crypto.getRandomValues`, and an IndexedDB key-value seam (`OnlineRecordStore`) under the seat and mirror stores. The page owns a transport (`createPageTransport`) that wires the existing RTC owner bookkeeping (moved from `rtcTransport.ts`) straight to the existing RTC controller, with no IPC hop. The host's simulation runs in `src/worker/authorityWorker.ts` (`createUtilityHost` over browser `MessagePort`s), owned by `src/network/host/workerHost.ts`, which implements the unchanged `HostProcessHandle`. `createPageOnline` (renderer) builds the session and returns an `OnlinePreloadApi`-shaped facade plus `onPort`. Electron's main shrinks to seven jobs (window with `backgroundThrottling: false`, fullscreen, page load, `duel:record`, `app:suspend`/`app:resume` push, close handshake over `app:prepare-exit`, and the online config handed over through the preload).

**Tech Stack:** Electron 37.10.3, electron-vite 5.0.0, Vite 7, TypeScript 5.8, React 19 + zustand (untouched), Vitest 3.2.7 (node environment), Playwright 1.48.2 (new, Task 1), fake-indexeddb 6.0.0 (new, Task 2), Cloudflare Workers / Miniflare / workerd 1.20261023.1 (signalling service, unchanged versions).

## Global Constraints

Every task's requirements implicitly include this section.

- **Spec:** `docs/superpowers/specs/2026-11-18-web-build-design.md` (converged at `7995867e`). This plan is part **Web-i** (§9 item 1). Out of scope and left to Web-ii/Web-iii: `build:web`, `vite.web.config.ts`, Vercel, the passcode, `version.json` and the update banner, all of §7 (keys, Fullscreen API, audio unlock, `navigator.storage.persist()`, the `duelRecords` IndexedDB store, "Download playtest log", the Web Lock, `beforeunload` prompt, unsupported-browser checks), the browser network gates, the passcode tests, any `wrangler deploy` or secret change, and the live check.
- **No gameplay change.** `SIM_VERSION` stays as it is on master. `npm run test:determinism` must pass unchanged. The gameplay content digest *does* change, because `src/shared/onlineSession.ts`, `src/shared/rtcSession.ts` and `src/shared/hostProcessProtocol.ts` are in `build/contentDigest.ts`'s manifest and this plan edits all three (Task 7); that is expected, is not a simulation change, and the determinism runner re-stamps digests (`scripts/determinism/fixture.ts:49`).
- **Base:** written against master `7f63859a` (Sci-2 merged: duel crews of 2-4, `SIM_VERSION` 52). If master has moved, rebase line references before each task (`grep -n` the quoted text, never trust a line number alone).
- **Work in the worktree** `.worktrees/web-i` on branch `web-i` from `master`. `node_modules` and `services/signalling/node_modules` must be directory junctions to the main checkout's (the `onlineAppRuntime` "flake" was a missing `services/signalling/node_modules` junction).
- **Stage files by explicit path only.** Never `git add -A`, `git add .` or `git commit -a`. The main checkout has many unrelated untracked files.
- **Every commit message ends with** the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Use the Write tool** for files with complex content (bash heredocs have failed on this machine). Shell examples below use Git Bash syntax.
- **Pinned versions (exact, no caret):** `playwright@1.48.2`, `fake-indexeddb@6.0.0`. Existing pins stay: Electron `37.10.3`, workerd `1.20261023.1`.
- **Gates:** `npm run typecheck`, `npm test`, `npm run test:determinism`, `npm run test:signalling`, `npm run typecheck:signalling`, and the Electron runtime gates in `package.json`. Known load flakes that pass when run alone: director soak, `duelFire`, `snapshot`, `authorityBoundary`, `authorityIngress`, `leaseSmokeCleanup`, `onlineAppRuntime`. `tests/onlineRecoveryInstrumentation.test.ts` needs a built `out/` (`npm run build` first). After `npm run test:determinism`, restore its rewritten tracked logs: `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability/task-5-logs/`.
- **IndexedDB layout (spec §3.1):** database `ftlite`, version `1`, object store `records`, keys `seat-v1` and `mirror-v1`, one record replaced per `put` in one transaction.
- **Store caps unchanged:** seat record at most 8,192 bytes; mirror record at most 557,056 bytes, magic `FTLNMIR1`, header at most 16,384 bytes.
- **Suspend/resume never fire on `visibilitychange`.** Browser trigger: a 1 s interval comparing `Date.now()` and `performance.now()` deltas; a wall gap more than 15 s larger than the monotonic gap is one suspend-then-resume; `pagehide`/`pageshow` with `persisted: true` are suspend/resume. Electron trigger: main pushes `app:suspend`/`app:resume` from `powerMonitor`.
- **Exit:** Electron close waits for the page's `app:prepare-exit` answer or 3,000 ms, whichever comes first. A browser `pagehide` with `persisted: false` sends the release over the open socket and closes the peers, with no checkpoint capture.
- **Worker construction is** `new Worker(new URL('../../worker/authorityWorker.ts', import.meta.url), { type: 'module' })` (spec §3.2), unless Task 7 Step 7's Electron boot check fails and deviation D-6 switches every Worker (product and gate harnesses) to a classic script. The built chunk is `out/renderer/assets/authorityWorker.js` either way.
- **Incompatible error text (spec §4), exact:** `This lobby runs a different version. Both players should reload.`
- **Page-side network code imports no `node:*`, no `electron`, no `process`, no `Buffer`** (`src/network/online`, `src/network/host`, `src/network/transport`, `src/worker`, `src/renderer`). Enforced by `tests/pageBoundary.test.ts` (Task 3, extended in Tasks 5 and 7).
- **The lease cadence is unchanged:** renewal every 5 s against the 12 s local lease (`src/network/session/leaseGate.ts`).

## Spec deviations (recorded for the reviewer)

- **D-1 `testProbe` config field.** `PageOnlineConfig` gains a seventh, test-only field `testProbe: boolean`, set only by an unpackaged Electron build from `FTLITE_ONLINE_TEST_PROBE=1` (the same rule as `FTLITE_SECTOR_ONLINE_TEST`). When set, the page exposes a frozen copy of the online facade at `window.__ftliteOnlineTest` and dispatches a `ftlite:online:test-port` event with each game port. The Electron gates need this because the status reads (`window.ftlite.online.readStatus()`) and the game-port observers (`ftlite:online:main` window messages) they use today disappear with the IPC path. A packaged build and every production path keep the session off `window`.
- **D-2 `Origin: file://` is treated like `null`.** Chromium's WebSocket handshake from a `file://` page may send `Origin: file://` rather than `null`. Task 8 allows it in code next to `null`, with a test, so Electron's socket upgrade never depends on the secret list. Like the Expose-Headers change it ships only at Web-iii's deploy.
- **D-3 `rtcTransport.ts` leaves `src/main` but its owner logic is kept.** The attempt-ID, generation and lifetime bookkeeping (`createRtcTransport`) moves to `src/network/transport/owner.ts` with `MessagePort` in place of `MessagePortMain`; `startGuestTransport` (the hidden-window entry) is deleted. The page still needs that bookkeeping between the session and the RTC controller, and its tests carry over.
- **D-4 `HostPlatform` keeps `onSuspend`/`onResume`,** fed by the page lifecycle, so the Worker owner still invalidates its lease on suspend and resume exactly as `hostProcess.ts:233-240` does.
- **D-6 (conditional) classic Worker.** Only if Task 7 Step 7 shows that Electron's `file://` page cannot start a module Worker: the product Worker and every harness Worker become classic scripts (the full list of changes is in that step). Spec §3.2 names a module Worker; a classic Worker runs the same bundle and protocol, and both Chromium and Firefox support it, so the spec's intent (the host simulation in a dedicated Worker) is unchanged. Record here whether D-6 was taken. **Not taken** (Task 7: `npm run test:worker-boot` started the module Worker from Electron's `file://` page and it answered `incompatible-identity`).
- **D-7 Task 1 rules beyond §3.5.** `report.ts` adds two failures (`tick-windows-missing`: fewer than 60 complete 10 s windows; `lease-starved`: fewer than 100 lease completions) and two invalid reasons (`page-errors`; `baseline-hidden`: the visible baseline was hidden). Each only tightens a spec rule or rejects a broken run, so none can turn a spec failure into a pass. Task 1 also counts a tick toward its window only when it ran within two tick periods of its deadline and measures relay delay from each tick's deadline, because the production tick driver catches up in bursts after a late timer and would otherwise hide 1 Hz throttling.
- **D-8 Task 1 drives the browsers without automation.** As planned, the harness could not hide a tab in either browser. Playwright's Chromium turns on `Emulation.setFocusEmulationEnabled` for every page, which keeps it visible. Playwright's Firefox (Juggler, `chrome/juggler/content/content/main.js`) sets `docShell.forceActiveState = true` on every page. So `run.ts` now spawns the browser headed on `drive.html`, with no automation attached. That page opens the baseline, control and test tabs and a cross-site (`localhost`) foreground tab itself, then POSTs the measurements back. Chromium is Playwright's pinned build launched as a plain binary (without Playwright's three throttling-off switches; `--disable-popup-blocking` only so `drive.html` can open its tabs). Firefox is the installed Firefox (`FIREFOX_BINARY` overrides it). Juggler cannot be switched off, and the stock binary is what players run. Firefox uses a throwaway profile whose `user.js` states the three throttling preferences and silences first-run pages. `report.ts`, the pages, the Worker and every rule are unchanged.
- **D-9 (Task 11) the `stale` recovery scenario is deferred; tracked follow-up.** `scripts/network/online-recovery-smoke.ts --scenario=stale` now fails at once with the named error `stale scenario not ported to the page topology (needs Worker-target evidence)`. It is not part of `npm run test:online-recovery-runtime` (hound-2), which passes. **What is uncovered:** the old-authority fence under a stalled owner. The scenario proved that when the lease owner stalls past the 12 s local lease (a 25 s main block before a real lease grant), the old host's authority stops admitting ticks, ingress and control at its deadline, rejects the late real grant, and never commits again, while the service expires it and a guest rehosts. **Why it cannot be ported as written:** the owner is now the page, so `blockNextGrant`/`busy(25000)` in `page-probe.ts` blocks the page main thread. That thread also carries the RTC transport and the probe's evidence port, so (a) the guest's Resume cannot reach the old Worker during the stall (the old design kept the hidden transport window and utility alive while main stalled), and (b) the Worker's evidence cannot leave the page until the stall ends. **How to restore it:** (1) read the Worker's evidence without the page: attach the wrapper's debugger after load, `Target.setAutoAttach({ autoAttach: true, waitForDebuggerOnStart: false, flatten: true })`, and `Runtime.evaluate` a `globalThis.__recoveryEvidence` copy kept by the prelude in the Worker session (`webContents.debugger.sendCommand(method, params, sessionId)`); have the probe signal the stall start (for example a `console-message` before `busy`) so main writes `host-block.json`; (2) redefine the admission proof for the page topology: assert that inputs queued during the stall reach the old Worker only after its deadline and are refused (`afterDeadlineInputs`, `unavailableResults` read after the stall), instead of during it; (3) update `validateOnlineRecoveryReport`'s stale branch (`utilityAlive` becomes a Worker-alive check through the debugger session). Until then, the lease-gate unit tests and `tests/onlineRecoveryInstrumentation.test.ts` (the exact deadline, observed in the built Worker chunk) are the remaining coverage.
- **D-5 Task count.** Twelve tasks plus one conditional task (Task 12, run only if Task 1 fails). The Electron gate rewrite is three tasks because each covers a different topology (bare Worker owner; two RTC pages; the whole app).

## Task 1 ledger (filled in by Task 1)

| Browser | Valid run | Pass | Min ticks per 10 s window | Relay p99 hidden / visible (ms) | Max lease gap (ms) | Control tab period (ms) | Test page control period (ms) | Max tick lateness (ms) |
|---|---|---|---|---|---|---|---|---|
| Chromium | yes | yes | 598 | 10.70 / 9.87 | 5,010 | 1,917 | 1,000 | 52.3 |
| Firefox | **no** (`baseline-hidden`, 3 of 3 attempts) | no (hidden phase alone met every pass rule in attempts 1 and 3) | 596 | 10.00 / 9.33 | 5,003 | 1,000 | 1,000 | 74.3 |

Chromium 130.0.6723.31 is the Playwright 1.48.2 build; Firefox is the machine's installed Firefox 160. The Firefox row is attempt 3 (`firefox.json`); attempts 1 and 2 are `firefox-attempt-1.json` and `firefox-attempt-2.json`. Their hidden phases: attempt 1 min 599 ticks, relay p99 9.67 / 9.67 ms, max lease gap 5,007 ms (every pass rule met). Attempt 2 min 503 ticks, relay p99 45.3 / 9.67 ms (would fail `worker-ticks` and `relay-delay`; the dips sat in three 10 s windows while the machine was busy with other work). All three were invalid only because the *visible baseline* went hidden partway through (at 2.9 s, 55.8 s and 13.9 s). A diagnostic baseline (not a measurement) showed why: the owner was working on the same desktop. Firefox on Windows reports a fully occluded window as hidden, and the small test window sat over the maximized editor. Chromium's baseline stayed visible.

**Chosen path:** **B** (controller decision 2026-11-18, under the owner's standing order to take the recommendation). Chromium passes. Firefox has no valid run after the three attempts the plan allows: the visible baseline was occluded by other desktop windows, and attempt 2 dipped to 503 ticks per window with relay p99 45 ms, possibly from real throttling. Path B (Task 12: the keep-this-tab-visible warning and an event-driven lease relay) protects Firefox hosts whatever a clean rerun would show. It costs only a warning on a hidden hosting tab, so the Firefox gate is closed conservatively instead of blocking the build. An owner rerun on an idle desktop (`npm run test:bg-tab -- --browser=firefox`) stays optional. If it later passes, the warning can be relaxed for Firefox. Evidence: `docs/superpowers/reviews/2026-11-18-web-i-bg-tab/`, committed with Task 1.

**Web-i gate (Task 13), 2026-11-18, head 38f30b75, Electron 37.10.3, Node 24.18.0:** all PASS. `typecheck` 0; `npm test` 369/370 files, 4943/4944 tests (only the known director soak load flake failed; rerun alone: 35/35 pass); `test:determinism` Node 1800 samples + 330 boundaries, Electron 1800, Firefox UA 1800, all PASS, logs restored, tree clean; `test:signalling`, `typecheck:signalling`, `test:worker-boot`, `test:host-runtime` (15 checks, 8/8 Worker exits), `lease-smoke`, `rtc-config-smoke`, `test:rtc-runtime` (17 checks), `test:room-service-runtime`, `test:online-app-runtime` (2-seat and 4-seat), `test:online-recovery-runtime` (hound-2), `test:duel-app-runtime` (166 s): all exit 0. Invariants: no SIM_VERSION change since the merge base ba07e70e (a diff against current master shows 52 vs 53 only because master moved on); `out/main` and `out/preload` hold only index.js; no `node:`/`electron` imports in the portable dirs. Not run (out of scope): the stale recovery scenario (D-9), internet-app, browser, passcode and live checks.

## File structure

New:

| Path | Responsibility |
|---|---|
| `scripts/web/bg-tab/*` | Task 1's background-tab measurement (pages, tick Worker, echo runtime, driver, pure verdict) |
| `src/shared/sha256.ts` | Synchronous SHA-256 (spec §3.1) |
| `src/shared/bytes.ts` | Base64, hex, byte equality |
| `src/network/random.ts` | `randomHex` (platform random source; kept out of the deterministic `src/shared` graph) |
| `src/network/online/recordStore.ts` | `OnlineRecordStore`, IndexedDB and in-memory implementations |
| `src/network/online/seatStore.ts`, `mirrorStore.ts` | The seat and mirror stores on `OnlineRecordStore` |
| `src/network/online/onlineSession.ts` + `onlinePeers.ts`, `onlineDuel.ts`, `onlineSector.ts`, `onlineMirrors.ts`, `onlineModes.ts`, `onlineIce.ts`, `onlineRetry.ts` | The session stack, Node-free |
| `src/network/online/lifecycle.ts` | `OnlineLifecycle`: Electron and clock-jump suspend/resume triggers |
| `src/network/online/pagePlatform.ts` | The page's `OnlinePlatform` (host start, transports, ports) |
| `src/network/host/contracts.ts` | `HostProcessHandle`, `HostProcessOptions` |
| `src/network/host/workerHost.ts` | The Worker owner (replaces `hostProcess.ts`) |
| `src/network/transport/contracts.ts` | `TransportController`, `RtcLinkStats` |
| `src/network/transport/owner.ts` | The RTC attempt owner (moved from `rtcTransport.ts`) |
| `src/network/transport/pageTransport.ts` | Owner + controller in one page, no IPC |
| `src/worker/authorityWorker.ts`, `authorityWorkerMain.ts`, `authorityModes.ts` | The host Worker entry |
| `src/shared/onlineConfig.ts` | `resolveOnlineConfig` (moved) and `PageOnlineConfig` |
| `src/renderer/src/app/online/pageSession.ts` | `createPageOnline` and its facade |
| `src/main/appExit.ts` | The close handshake (replaces `onlineExit.ts`) |

Deleted in Task 7: `src/main/network/` except `duelRecords.ts`; `src/preload/networkTransport.ts`; `src/renderer/networkTransport.ts` and `.html`; `src/utility/`.

---

### Task 1: Background-tab measurement (spec §3.5)

The design assumes a hidden host tab keeps the Worker's 60 Hz tick, prompt RTC relay and the lease round trip. This task measures that in headed Chromium and Firefox before anything is built on it, and records the verdict in the ledger above.

**Files:**
- Create: `scripts/web/bg-tab/protocol.ts`, `scripts/web/bg-tab/tickWorker.ts`, `scripts/web/bg-tab/page.ts`, `scripts/web/bg-tab/control.ts`, `scripts/web/bg-tab/index.html`, `scripts/web/bg-tab/control.html`, `scripts/web/bg-tab/front.html`, `scripts/web/bg-tab/echoRuntime.ts`, `scripts/web/bg-tab/report.ts`, `scripts/web/bg-tab/run.ts`
- Create: `tests/bgTabReport.test.ts`
- Create (evidence): `docs/superpowers/reviews/2026-11-18-web-i-bg-tab/chromium.json`, `.../firefox.json`
- Modify: `package.json` (devDependency `playwright`, script `test:bg-tab`)
- Modify: this plan's ledger section

**Interfaces:**
- Consumes: `createTickDriver(clock, scheduler, onTick)` from `src/renderer/src/authority/tickDriver.ts` (the production 60 Hz driver; `onTick(nextTick, tickTimeMs)`).
- Produces: `judge(run: BrowserRun): BrowserVerdict`, `percentile(values, p)`, `RULES` (only used by this task and its test).

- [ ] **Step 1: Create the worktree and junctions**

```bash
cd /c/Users/djuar/FTLite
git worktree add .worktrees/web-i -b web-i master
cd .worktrees/web-i
cmd //c mklink /J node_modules ..\\..\\node_modules
cmd //c mklink /J services\\signalling\\node_modules ..\\..\\..\\services\\signalling\\node_modules
if [ -d ../../public/assets/paid ]; then cmd //c mklink /J public\\assets\\paid ..\\..\\..\\public\\assets\\paid; fi
ls services/signalling/node_modules/miniflare >/dev/null && echo junctions-ok
```

Expected: `junctions-ok`. (The paid art is gitignored; the junction only lets the Electron gates draw the bought art. The gates do not depend on it.)

- [ ] **Step 2: Add Playwright and the script**

```bash
cd /c/Users/djuar/FTLite/.worktrees/web-i
npm install --save-dev --save-exact playwright@1.48.2
npx playwright install chromium firefox
```

Then add to `package.json` `"scripts"` (after `"test:internet-app-runtime"`):

```json
    "test:bg-tab": "tsx scripts/web/bg-tab/run.ts",
```

Because `node_modules` is a junction, the install lands in the main checkout's `node_modules`; that is intended (the main checkout's `package.json` gains the same pin when this branch merges).

- [ ] **Step 3: Write the shared shapes**

`scripts/web/bg-tab/protocol.ts`:

```ts
// TEST ONLY (web build spec §3.5): what the background-tab measurement pages report to their driver.
export interface PageMeasurement {
  mode: 'visible' | 'hidden';
  durationMs: number;
  /** Samples of document.visibilityState taken by the page's 100 ms control interval while measuring. */
  visibilitySamples: { hidden: number; visible: number };
  /** `<ms since start>:<state>` for every visibilitychange while measuring. */
  visibilityEvents: string[];
  /** On-time ticks (run within 2 tick periods of their own deadline) of the Worker's production tick driver in each complete 10 s window.
   *  A throttled Worker that catches up in bursts runs late ticks, which do not count. */
  tickWindows: number[];
  /** The latest a tick ran after its own deadline (data, not a pass rule). */
  maxTickLatenessMs: number;
  /** From each tick's deadline (performance.timeOrigin + its tick deadline) to receipt at the far end of the RTCDataChannel pair.
   *  Measured from the deadline, not the send, so a burst of caught-up ticks shows its full lateness. */
  relayDelaysMs: number[];
  /** Gaps between consecutive lease round-trip completions as the Worker sees them, plus the tail gap at stop. */
  leaseGapsMs: number[];
  leaseRoundTripsMs: number[];
  /** Mean period of the page's own 100 ms setInterval (data, not a validity condition). */
  controlPeriodMs: number;
  errors: string[];
}
export interface ControlMeasurement {
  durationMs: number;
  visibilitySamples: { hidden: number; visible: number };
  visibilityEvents: string[];
  periodMs: number;
  intervals: number;
}
export type WorkerIn = { kind: 'start' } | { kind: 'lease-reply'; id: number } | { kind: 'stop' };
export type WorkerOut =
  | { kind: 'tick'; tick: number; dueAt: number }
  | { kind: 'lease'; id: number }
  | { kind: 'result'; tickWindows: number[]; maxTickLatenessMs: number; leaseGapsMs: number[]; leaseRoundTripsMs: number[] };
```

- [ ] **Step 4: Write the tick Worker**

`scripts/web/bg-tab/tickWorker.ts`:

```ts
// TEST ONLY (web build spec §3.5): the host Worker's 60 Hz tick (the production tick driver) and its 5 s lease cadence.
import { createTickDriver } from '../../../src/renderer/src/authority/tickDriver';
import { TICK_HZ } from '../../../src/renderer/src/sim/tuning';
import type { WorkerIn, WorkerOut } from './protocol';

const scope = self as unknown as {
  postMessage(message: WorkerOut): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
};
let relay: MessagePort | undefined, driver: ReturnType<typeof createTickDriver> | undefined;
let windowStart = 0, windowCount = 0, maxLateness = 0, leaseId = 0, lastCompletion = 0;
let leaseTimer: ReturnType<typeof setTimeout> | undefined;
const windows: number[] = [], gaps: number[] = [], trips: number[] = [], sent = new Map<number, number>();
/** A tick counts toward its window only when it ran within two tick periods of its deadline. */
const ON_TIME_MS = 2 * 1000 / TICK_HZ;
function closeWindows(now: number): void {
  while (now >= windowStart + 10000) { windows.push(windowCount); windowCount = 0; windowStart += 10000; }
}
function lease(): void {
  const id = ++leaseId; sent.set(id, performance.now());
  relay!.postMessage({ kind: 'lease', id } satisfies WorkerOut);
  leaseTimer = setTimeout(lease, 5000);
}
function receive(message: WorkerIn): void {
  if (message.kind === 'lease-reply') {
    const started = sent.get(message.id); if (started === undefined) return;
    sent.delete(message.id);
    const now = performance.now(); trips.push(now - started); gaps.push(now - lastCompletion); lastCompletion = now;
    return;
  }
  if (message.kind === 'stop') {
    driver?.dispose(); clearTimeout(leaseTimer);
    const now = performance.now(); closeWindows(now);
    relay!.postMessage({ kind: 'result', tickWindows: windows, maxTickLatenessMs: maxLateness, leaseGapsMs: [...gaps, now - lastCompletion], leaseRoundTripsMs: trips } satisfies WorkerOut);
  }
}
scope.addEventListener('message', event => {
  const message = event.data as WorkerIn;
  if (message.kind !== 'start' || relay || event.ports.length !== 1) return;
  relay = event.ports[0]!;
  relay.addEventListener('message', e => receive(e.data as WorkerIn)); relay.start();
  windowStart = lastCompletion = performance.now();
  driver = createTickDriver({ nowMs: () => performance.now() },
    { schedule(ms, callback) { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); } },
    (tick, deadline) => {
      const now = performance.now(); closeWindows(now);
      if (now - deadline <= ON_TIME_MS) windowCount++;
      maxLateness = Math.max(maxLateness, now - deadline);
      relay!.postMessage({ kind: 'tick', tick, dueAt: performance.timeOrigin + deadline } satisfies WorkerOut);
    });
  lease();
});
```

- [ ] **Step 5: Write the test page and the sibling control page**

`scripts/web/bg-tab/page.ts`:

```ts
// TEST ONLY (web build spec §3.5): a Worker at 60 Hz, its ticks relayed over an RTCDataChannel pair, and a lease-style
// round trip every 5 s (Worker → page → WebSocket to local workerd → page → Worker), as the hosting page will run them.
import type { PageMeasurement, WorkerIn, WorkerOut } from './protocol';

declare global {
  interface Window { bgTab: { ready: Promise<void>; start(): void; result(): Promise<PageMeasurement> } }
}
const params = new URLSearchParams(location.search);
const mode: PageMeasurement['mode'] = params.get('mode') === 'visible' ? 'visible' : 'hidden';
const wsUrl = params.get('ws') ?? '';
const errors: string[] = [], events: string[] = [], relayDelays: number[] = [];
const samples = { hidden: 0, visible: 0 };
let started = 0, last = 0, periods = 0, periodSum = 0, measuring = false;
addEventListener('error', event => errors.push(String(event.message)));
addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
document.addEventListener('visibilitychange', () => { if (measuring) events.push(`${Math.round(performance.now() - started)}:${document.visibilityState}`); });
setInterval(() => {
  if (!measuring) return;
  const now = performance.now();
  samples[document.visibilityState === 'hidden' ? 'hidden' : 'visible']++;
  if (last) { periodSum += now - last; periods++; }
  last = now;
}, 100);
async function channelPair(): Promise<{ send: RTCDataChannel; receive: RTCDataChannel }> {
  const a = new RTCPeerConnection(), b = new RTCPeerConnection();
  a.addEventListener('icecandidate', event => { if (event.candidate) void b.addIceCandidate(event.candidate); });
  b.addEventListener('icecandidate', event => { if (event.candidate) void a.addIceCandidate(event.candidate); });
  const send = a.createDataChannel('ftl-latest-v1', { ordered: false, maxRetransmits: 0 });
  const received = new Promise<RTCDataChannel>(resolve => b.addEventListener('datachannel', event => resolve(event.channel), { once: true }));
  await a.setLocalDescription(); await b.setRemoteDescription(a.localDescription!);
  await b.setLocalDescription(); await a.setRemoteDescription(b.localDescription!);
  const receive = await received;
  await Promise.all([send, receive].map(channel => channel.readyState === 'open' ? undefined
    : new Promise(resolve => channel.addEventListener('open', resolve, { once: true }))));
  return { send, receive };
}
function socket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(Error('echo socket failed')), { once: true });
  });
}
const worker = new Worker(new URL('./tickWorker.ts', import.meta.url), { type: 'module' });
worker.addEventListener('error', event => errors.push('worker: ' + event.message));
const relay = new MessageChannel();
let resolveResult!: (value: Extract<WorkerOut, { kind: 'result' }>) => void;
const workerResult = new Promise<Extract<WorkerOut, { kind: 'result' }>>(resolve => { resolveResult = resolve; });
const ready = (async () => {
  const [{ send, receive }, ws] = await Promise.all([channelPair(), socket()]);
  receive.addEventListener('message', event => {
    const { dueAt } = JSON.parse(event.data as string) as { dueAt: number };
    if (measuring) relayDelays.push(performance.timeOrigin + performance.now() - dueAt);
  });
  ws.addEventListener('message', event => {
    const { id } = JSON.parse(event.data as string) as { id: number };
    relay.port1.postMessage({ kind: 'lease-reply', id } satisfies WorkerIn);
  });
  relay.port1.addEventListener('message', event => {
    const message = event.data as WorkerOut;
    if (message.kind === 'tick') { if (send.readyState === 'open') send.send(JSON.stringify({ tick: message.tick, dueAt: message.dueAt })); }
    else if (message.kind === 'lease') ws.send(JSON.stringify({ id: message.id }));
    else resolveResult(message);
  });
  relay.port1.start();
})();
window.bgTab = {
  ready,
  start() {
    started = performance.now(); last = 0; measuring = true;
    worker.postMessage({ kind: 'start' } satisfies WorkerIn, [relay.port2]);
  },
  async result() {
    relay.port1.postMessage({ kind: 'stop' } satisfies WorkerIn);
    const w = await workerResult; measuring = false;
    return { mode, durationMs: performance.now() - started, visibilitySamples: { ...samples }, visibilityEvents: [...events],
      tickWindows: w.tickWindows, maxTickLatenessMs: w.maxTickLatenessMs, relayDelaysMs: relayDelays, leaseGapsMs: w.leaseGapsMs,
      leaseRoundTripsMs: w.leaseRoundTripsMs, controlPeriodMs: periods ? periodSum / periods : 0, errors: [...errors] };
  }
};
```

`scripts/web/bg-tab/control.ts`:

```ts
// TEST ONLY (web build spec §3.5): the sibling control tab. No RTC and no WebSocket, so the browser's hidden-tab
// throttling applies to it; its 100 ms interval must average at least 900 ms for the run to count.
import type { ControlMeasurement } from './protocol';

declare global { interface Window { bgControl: { start(): void; result(): ControlMeasurement } } }
const samples = { hidden: 0, visible: 0 }, events: string[] = [];
let started = 0, last = 0, sum = 0, count = 0, measuring = false;
document.addEventListener('visibilitychange', () => { if (measuring) events.push(`${Math.round(performance.now() - started)}:${document.visibilityState}`); });
setInterval(() => {
  if (!measuring) return;
  const now = performance.now();
  samples[document.visibilityState === 'hidden' ? 'hidden' : 'visible']++;
  if (last) { sum += now - last; count++; }
  last = now;
}, 100);
window.bgControl = {
  start() { started = performance.now(); last = 0; sum = 0; count = 0; samples.hidden = samples.visible = 0; events.length = 0; measuring = true; },
  result() {
    measuring = false;
    return { durationMs: performance.now() - started, visibilitySamples: { ...samples }, visibilityEvents: [...events], periodMs: count ? sum / count : 0, intervals: count };
  }
};
```

`scripts/web/bg-tab/index.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>bg-tab test page</title>
<p>Background-tab measurement: test page</p>
<script type="module" src="./page.ts"></script>
```

`scripts/web/bg-tab/control.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>bg-tab control</title>
<p>Background-tab measurement: sibling control tab</p>
<script type="module" src="./control.ts"></script>
```

`scripts/web/bg-tab/front.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>bg-tab foreground</title>
<p>Background-tab measurement: this foreground tab hides the others. Leave it in front.</p>
```

- [ ] **Step 6: Write the failing verdict test**

`tests/bgTabReport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { judge, percentile, RULES, type BrowserRun } from '../scripts/web/bg-tab/report';
import type { ControlMeasurement, PageMeasurement } from '../scripts/web/bg-tab/protocol';

function page(mode: 'visible' | 'hidden', overrides: Partial<PageMeasurement> = {}): PageMeasurement {
  return { mode, durationMs: mode === 'hidden' ? 600500 : 60000, visibilitySamples: mode === 'hidden' ? { hidden: 600, visible: 0 } : { hidden: 0, visible: 600 },
    visibilityEvents: [], tickWindows: Array(mode === 'hidden' ? 60 : 6).fill(600), maxTickLatenessMs: 9, relayDelaysMs: Array(1000).fill(2),
    leaseGapsMs: Array(120).fill(5000), leaseRoundTripsMs: Array(120).fill(3), controlPeriodMs: 100, errors: [], ...overrides };
}
const control = (overrides: Partial<ControlMeasurement> = {}): ControlMeasurement =>
  ({ durationMs: 600500, visibilitySamples: { hidden: 600, visible: 0 }, visibilityEvents: [], periodMs: 1000, intervals: 600, ...overrides });
const run = (overrides: Partial<BrowserRun> = {}): BrowserRun =>
  ({ browser: 'chromium', headless: false, visible: page('visible'), hidden: page('hidden'), control: control(), ...overrides });

describe('background-tab verdict (web build spec §3.5)', () => {
  it('passes a valid run that holds 59 ticks a second, the relay and the lease', () => {
    const verdict = judge(run());
    expect(verdict).toMatchObject({ valid: true, pass: true, invalid: [], failures: [] });
    expect(verdict.figures.minTicksPerWindow).toBe(600);
  });
  it.each([
    ['headless', { headless: true }],
    ['too-short', { hidden: page('hidden', { durationMs: 599999 }) }],
    ['test-page-visible', { hidden: page('hidden', { visibilitySamples: { hidden: 599, visible: 1 } }) }],
    ['test-page-visible', { hidden: page('hidden', { visibilityEvents: ['3000:visible'] }) }],
    ['control-visible', { control: control({ visibilitySamples: { hidden: 599, visible: 1 } }) }],
    ['control-not-throttled', { control: control({ periodMs: 899 }) }],
    ['baseline-hidden', { visible: page('visible', { visibilitySamples: { hidden: 1, visible: 599 } }) }],
    ['page-errors', { hidden: page('hidden', { errors: ['boom'] }) }]
  ] as const)('marks the run invalid: %s', (reason, overrides) => {
    const verdict = judge(run(overrides as Partial<BrowserRun>));
    expect(verdict.valid).toBe(false); expect(verdict.pass).toBe(false); expect(verdict.invalid).toContain(reason);
  });
  it('records the test page control period as data, never as a validity condition', () => {
    const verdict = judge(run({ hidden: page('hidden', { controlPeriodMs: 100 }) }));
    expect(verdict.valid).toBe(true); expect(verdict.figures.testPageControlPeriodMs).toBe(100);
  });
  it.each([
    ['worker-ticks', { hidden: page('hidden', { tickWindows: [...Array(59).fill(600), RULES.minTicksPerWindow - 1] }) }],
    ['tick-windows-missing', { hidden: page('hidden', { tickWindows: Array(59).fill(600) }) }],
    ['relay-delay', { hidden: page('hidden', { relayDelaysMs: Array(1000).fill(23) }) }],
    ['lease-gap', { hidden: page('hidden', { leaseGapsMs: [...Array(119).fill(5000), 8001] }) }],
    ['lease-starved', { hidden: page('hidden', { leaseRoundTripsMs: Array(99).fill(3) }) }]
  ] as const)('fails a valid run: %s', (reason, overrides) => {
    const verdict = judge(run(overrides as Partial<BrowserRun>));
    expect(verdict.valid).toBe(true); expect(verdict.pass).toBe(false); expect(verdict.failures).toContain(reason);
  });
  it('fails a Worker throttled to 1 Hz that catches up in bursts, even with full windows', () => {
    // 60 catch-up ticks a second, each up to 1 s late: deadline-stamped relay delays expose it.
    const late = Array.from({ length: 6000 }, (_, i) => (i % 60) * 1000 / 60);
    const verdict = judge(run({ hidden: page('hidden', { tickWindows: Array(60).fill(600), relayDelaysMs: late, maxTickLatenessMs: 1000 }) }));
    expect(verdict.valid).toBe(true); expect(verdict.pass).toBe(false); expect(verdict.failures).toContain('relay-delay');
  });
  it('allows exactly 20 ms of p99 growth and an 8 s gap', () => {
    expect(judge(run({ hidden: page('hidden', { relayDelaysMs: Array(1000).fill(22), leaseGapsMs: [8000] }) })).pass).toBe(true);
  });
  it('takes the nearest-rank percentile', () => {
    expect(percentile([5, 1, 4, 2, 3], 99)).toBe(5); expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 99)).toBe(99);
    expect(percentile([], 99)).toBe(Infinity);
  });
});
```

- [ ] **Step 7: Run it to see it fail**

Run: `npx vitest run tests/bgTabReport.test.ts`
Expected: FAIL, `Cannot find module '../scripts/web/bg-tab/report'`.

- [ ] **Step 8: Write the verdict**

`scripts/web/bg-tab/report.ts`:

```ts
// TEST ONLY (web build spec §3.5): the validity and pass rules of the background-tab measurement, exactly as the spec
// states them. Everything else the pages report is recorded as data.
import type { ControlMeasurement, PageMeasurement } from './protocol';

export const RULES = { minDurationMs: 600000, minControlPeriodMs: 900, minTicksPerWindow: 590, minWindows: 60,
  maxRelayP99GrowthMs: 20, maxLeaseGapMs: 8000, minLeaseCompletions: 100 } as const;
export interface BrowserRun { browser: 'chromium' | 'firefox'; headless: boolean; visible: PageMeasurement; hidden: PageMeasurement; control: ControlMeasurement }
export interface BrowserVerdict {
  browser: BrowserRun['browser']; valid: boolean; invalid: string[]; pass: boolean; failures: string[];
  figures: { minTicksPerWindow: number; windows: number; relayP99HiddenMs: number; relayP99VisibleMs: number; maxLeaseGapMs: number;
    leaseCompletions: number; controlTabPeriodMs: number; testPageControlPeriodMs: number; maxTickLatenessMs: number };
}
/** Nearest-rank percentile; Infinity for no samples (so an empty relay fails). */
export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p / 100 * sorted.length) - 1))]!;
}
const sawVisible = (m: { visibilitySamples: { visible: number }; visibilityEvents: string[] }) =>
  m.visibilitySamples.visible > 0 || m.visibilityEvents.some(event => event.endsWith(':visible'));
export function judge(run: BrowserRun): BrowserVerdict {
  const invalid: string[] = [], failures: string[] = [];
  if (run.headless) invalid.push('headless');
  if (run.hidden.durationMs < RULES.minDurationMs) invalid.push('too-short');
  if (sawVisible(run.hidden)) invalid.push('test-page-visible');
  if (sawVisible(run.control)) invalid.push('control-visible');
  if (!(run.control.periodMs >= RULES.minControlPeriodMs)) invalid.push('control-not-throttled');
  if (run.visible.visibilitySamples.hidden > 0) invalid.push('baseline-hidden');
  if (run.hidden.errors.length || run.visible.errors.length) invalid.push('page-errors');
  const windows = run.hidden.tickWindows, minTicks = windows.length ? Math.min(...windows) : 0;
  if (windows.length < RULES.minWindows) failures.push('tick-windows-missing');
  if (minTicks < RULES.minTicksPerWindow) failures.push('worker-ticks');
  const p99h = percentile(run.hidden.relayDelaysMs, 99), p99v = percentile(run.visible.relayDelaysMs, 99);
  if (!(p99h - p99v <= RULES.maxRelayP99GrowthMs)) failures.push('relay-delay');
  const maxGap = run.hidden.leaseGapsMs.length ? Math.max(...run.hidden.leaseGapsMs) : Infinity;
  if (!(maxGap <= RULES.maxLeaseGapMs)) failures.push('lease-gap');
  if (run.hidden.leaseRoundTripsMs.length < RULES.minLeaseCompletions) failures.push('lease-starved');
  return { browser: run.browser, valid: !invalid.length, invalid, pass: !invalid.length && !failures.length, failures,
    figures: { minTicksPerWindow: minTicks, windows: windows.length, relayP99HiddenMs: p99h, relayP99VisibleMs: p99v, maxLeaseGapMs: maxGap,
      leaseCompletions: run.hidden.leaseRoundTripsMs.length, controlTabPeriodMs: run.control.periodMs,
      testPageControlPeriodMs: run.hidden.controlPeriodMs, maxTickLatenessMs: run.hidden.maxTickLatenessMs } };
}
```

- [ ] **Step 9: Run the verdict test**

Run: `npx vitest run tests/bgTabReport.test.ts`
Expected: PASS (all cases). Note the `minLeaseCompletions` fixture uses 120 completions over 10 minutes, the real cadence.

- [ ] **Step 10: Write the echo runtime and the driver**

`scripts/web/bg-tab/echoRuntime.ts`:

```ts
// TEST ONLY (web build spec §3.5): a local workerd that echoes WebSocket messages, standing in for the lobby service's
// lease reply. The same pinned Miniflare/workerd the signalling gates use (services/signalling/scripts/local-runtime.ts).
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const ECHO = `export default { fetch(request) {
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('echo');
  const [client, server] = Object.values(new WebSocketPair());
  server.accept(); server.addEventListener('message', event => server.send(event.data));
  return new Response(null, { status: 101, webSocket: client });
} };`;
export async function startEchoRuntime(directory: string): Promise<{ wsUrl: string; dispose(): Promise<void> }> {
  const requireService = createRequire(resolve('services/signalling/package.json'));
  const { Miniflare, convertV4MiniflareOptions } = requireService('miniflare');
  if (requireService('workerd/package.json').version !== '1.20261023.1') throw Error('wrong pinned workerd');
  const options = convertV4MiniflareOptions({ name: 'bg-tab-echo', modules: true, script: ECHO, compatibilityDate: '2026-10-23',
    host: '127.0.0.1', port: 0, cf: false, resourceTmpPath: directory });
  options.enableDevRegistry = false; options.telemetry = { enabled: false }; options.logRequests = false;
  const runtime = new Miniflare(options);
  const url = String(await runtime.ready).replace(/\/$/, '');
  return { wsUrl: url.replace(/^http/, 'ws') + '/echo', dispose: () => runtime.dispose() };
}
```

`scripts/web/bg-tab/run.ts`:

```ts
// TEST ONLY (web build spec §3.5). Headed Chromium and Firefox: a visible baseline, then the test page and a sibling
// control tab hidden behind a foreground tab for 10 minutes. Exit 0 pass, 1 fail (valid run), 2 invalid run.
import { build } from 'vite';
import { chromium, firefox, type Browser } from 'playwright';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { startEchoRuntime } from './echoRuntime';
import { judge, type BrowserRun, type BrowserVerdict } from './report';
import type { ControlMeasurement, PageMeasurement } from './protocol';

const arg = (name: string, fallback: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const browsers = arg('browser', 'chromium,firefox').split(',') as BrowserRun['browser'][];
const minutes = Number(arg('minutes', '10')), visibleSeconds = Number(arg('visible-seconds', '60'));
const rawOut = resolve(arg('raw-out', '.superpowers/web-i/bg-tab')), evidenceOut = resolve(arg('evidence-out', 'docs/superpowers/reviews/2026-11-18-web-i-bg-tab'));
const delay = (ms: number) => new Promise(done => setTimeout(done, ms));
/** Every result read is bounded: a page that never answers fails the run instead of hanging it. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timeout')), ms); })]).finally(() => clearTimeout(timer));
}
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
function serve(root: string): Promise<{ origin: string; server: Server }> {
  const server = createServer((request, response) => {
    const path = normalize(join(root, decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname)));
    if (!path.startsWith(root + sep) || !existsSync(path)) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(readFileSync(path));
  });
  return new Promise(done => server.listen(0, '127.0.0.1', () => done({ origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, server })));
}
const launch: Record<BrowserRun['browser'], () => Promise<Browser>> = {
  // Playwright's default Chromium flags switch background throttling off; drop them so the browser behaves as a player's.
  chromium: () => chromium.launch({ headless: false, ignoreDefaultArgs: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] }),
  // Firefox's own defaults, stated so a Playwright profile preference cannot silently switch throttling off.
  firefox: () => firefox.launch({ headless: false, firefoxUserPrefs: { 'dom.min_background_timeout_value': 1000, 'dom.timeout.enable_budget_timer_throttling': true, 'dom.timeout.throttling_delay': 30000 } })
};
async function measure(name: BrowserRun['browser'], origin: string, wsUrl: string): Promise<BrowserVerdict & { run: BrowserRun }> {
  const browser = await launch[name]();
  try {
    const context = await browser.newContext(), query = `ws=${encodeURIComponent(wsUrl)}`;
    const baseline = await context.newPage();
    await baseline.goto(`${origin}/index.html?mode=visible&${query}`); await baseline.evaluate(() => window.bgTab.ready); await baseline.bringToFront();
    await baseline.evaluate(() => window.bgTab.start()); await delay(visibleSeconds * 1000);
    const visible = await withTimeout(baseline.evaluate(() => window.bgTab.result()), 30000, 'visible result') as PageMeasurement; await baseline.close();
    const control = await context.newPage(); await control.goto(`${origin}/control.html`);
    const test = await context.newPage(); await test.goto(`${origin}/index.html?mode=hidden&${query}`); await test.evaluate(() => window.bgTab.ready);
    const front = await context.newPage(); await front.goto(`${origin}/front.html`); await front.bringToFront(); await delay(2000);
    await control.evaluate(() => window.bgControl.start()); await test.evaluate(() => window.bgTab.start());
    console.log(`BG-TAB ${name}: hidden run started; ${minutes} minutes. Do not touch the browser window.`);
    await delay(minutes * 60000);
    const hidden = await withTimeout(test.evaluate(() => window.bgTab.result()), 30000, 'hidden result') as PageMeasurement;
    const controlResult = await withTimeout(control.evaluate(() => window.bgControl.result()), 30000, 'control result') as ControlMeasurement;
    const run: BrowserRun = { browser: name, headless: false, visible, hidden, control: controlResult };
    return { ...judge(run), run };
  } finally { await browser.close(); }
}
async function main(): Promise<void> {
  mkdirSync(rawOut, { recursive: true }); mkdirSync(evidenceOut, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'ftlite-bg-tab-'));
  let server: Server | undefined, echo: Awaited<ReturnType<typeof startEchoRuntime>> | undefined;
  try {
    const root = resolve('scripts/web/bg-tab');
    await build({ configFile: false, envDir: false, logLevel: 'warn', root, base: './', worker: { format: 'es' },
      build: { outDir: join(work, 'site'), emptyOutDir: true, rollupOptions: { input: { index: join(root, 'index.html'), control: join(root, 'control.html'), front: join(root, 'front.html') } } } });
    const site = await serve(resolve(work, 'site')); server = site.server;
    echo = await startEchoRuntime(join(work, 'echo'));
    const verdicts: BrowserVerdict[] = [];
    for (const name of browsers) {
      const { run, ...verdict } = await measure(name, site.origin, echo.wsUrl);
      writeFileSync(join(rawOut, `${name}.json`), JSON.stringify({ ...verdict, run }) + '\n');
      writeFileSync(join(evidenceOut, `${name}.json`), JSON.stringify({ ...verdict, minutes, visibleSeconds, recordedAt: new Date().toISOString() }, null, 2) + '\n');
      console.log(`BG-TAB ${name}: valid=${verdict.valid} pass=${verdict.pass} invalid=[${verdict.invalid}] failures=[${verdict.failures}] ${JSON.stringify(verdict.figures)}`);
      verdicts.push(verdict);
    }
    process.exitCode = verdicts.some(v => !v.valid) ? 2 : verdicts.some(v => !v.pass) ? 1 : 0;
  } finally {
    server?.close(); await echo?.dispose();
    rmSync(work, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
}
main().catch(error => { console.error(error?.stack ?? error); process.exitCode = 2; });
```

- [ ] **Step 11: Typecheck, then a 1-minute smoke of the driver**

```bash
npm run typecheck
npx tsx scripts/web/bg-tab/run.ts --minutes=1 --visible-seconds=10 --raw-out=.superpowers/web-i/bg-tab-smoke --evidence-out=.superpowers/web-i/bg-tab-smoke
```

Expected: typecheck clean; both browsers open headed, run, close; exit code 2 with `invalid=[too-short]` (a 1-minute run is too short by design). Any other invalid reason means the setup is wrong; fix it before Step 12:
- `test-page-visible` or `control-visible`: the foreground tab is not hiding the others (for example, Playwright opened a separate window). Open the foreground page from the test page instead (`await Promise.all([context.waitForEvent('page'), test.evaluate(url => { window.open(url, '_blank'); }, `${origin}/front.html`)])`, then `bringToFront()` on it) and rerun.
- `control-not-throttled` (only meaningful at 10 minutes): Playwright still disables throttling; inspect `chrome://version` command line or `about:config` and drop the offending flag or preference.

- [ ] **Step 12: Run the real measurement (about 23 minutes; do not touch the browser windows)**

Run in the background: `npm run test:bg-tab`
Expected: one `BG-TAB chromium: …` and one `BG-TAB firefox: …` line; exit 0, 1 or 2. An exit 2 (invalid) is retried up to twice more after fixing the cause from Step 11's list. If three runs are invalid, stop and report BLOCKED to the owner: the spec requires a valid run before anything is built on the assumption.

- [ ] **Step 13: Fill in the ledger and commit the evidence**

Copy each browser's figures from `docs/superpowers/reviews/2026-11-18-web-i-bg-tab/<browser>.json` into the ledger table at the top of this plan, and set **Chosen path** to A (both pass: Task 12 is skipped) or B (a valid run failed: Task 12 runs, and later tasks proceed with it scheduled before Task 13).

```bash
git add package.json package-lock.json scripts/web/bg-tab/protocol.ts scripts/web/bg-tab/tickWorker.ts scripts/web/bg-tab/page.ts scripts/web/bg-tab/control.ts \
  scripts/web/bg-tab/index.html scripts/web/bg-tab/control.html scripts/web/bg-tab/front.html scripts/web/bg-tab/echoRuntime.ts scripts/web/bg-tab/report.ts \
  scripts/web/bg-tab/run.ts tests/bgTabReport.test.ts docs/superpowers/reviews/2026-11-18-web-i-bg-tab/chromium.json docs/superpowers/reviews/2026-11-18-web-i-bg-tab/firefox.json \
  docs/superpowers/plans/2026-11-18-web-i-online-in-page.md
git commit -m "test(web-i): background-tab measurement in headed Chromium and Firefox (spec §3.5), ledger recorded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Portable primitives: SHA-256, bytes and the IndexedDB record stores (spec §3.1)

**Files:**
- Create: `src/shared/sha256.ts`, `src/shared/bytes.ts`, `src/network/random.ts`, `src/network/online/recordStore.ts`, `src/network/online/seatStore.ts`, `src/network/online/mirrorStore.ts`
- Create: `tests/sha256.test.ts`, `tests/bytes.test.ts`, `tests/recordStore.test.ts`
- Modify (rewrite): `tests/seatStore.test.ts`, `tests/mirrorStore.test.ts` (they now test the new stores; the old `src/main/network/seatStore.ts` and `mirrorStore.ts` stay, untested, until Task 7 deletes them)
- Modify: `package.json` (devDependency `fake-indexeddb`)

**Interfaces:**
- Produces:
  - `sha256(input: Uint8Array | string): Uint8Array` and `sha256Hex(input: Uint8Array | string): string` (`src/shared/sha256.ts`)
  - `bytesToBase64(bytes: Uint8Array): string`, `base64ToBytes(text: string): Uint8Array`, `bytesToHex(bytes: Uint8Array): string`, `bytesEqual(a: Uint8Array, b: Uint8Array): boolean` (`src/shared/bytes.ts`)
  - `randomHex(byteLength: number): string` (`src/network/random.ts`; not in `src/shared`, which `tests/boundary.test.ts` holds to the deterministic rules)
  - `type OnlineRecordKey = 'seat-v1' | 'mirror-v1'`; `interface OnlineRecordStore { get(key): Promise<Uint8Array | null>; put(key, bytes): Promise<void>; delete(key): Promise<void> }`; `createIndexedDbRecordStore(factory?: IDBFactory): OnlineRecordStore`; `createMemoryRecordStore(): OnlineRecordStore & { records: Map<OnlineRecordKey, Uint8Array> }`; constants `ONLINE_RECORD_DATABASE = 'ftlite'`, `ONLINE_RECORD_VERSION = 1`, `ONLINE_RECORD_STORE = 'records'`
  - `createSeatStore(records: OnlineRecordStore)` returning `{ load(): Promise<SavedSeatV1 | null>; save(record): Promise<void>; clear(): Promise<void> }`; `SavedSeatV1`, `validateSavedSeat`, `SeatStore`, `SeatStoreError` (same names as today)
  - `createMirrorStore(records: OnlineRecordStore, validatePayload: (m: SessionMirror) => void): MirrorStore`; `validateMirror`, `SessionMirror`, `MirrorFileV1`, `MirrorStore`, `MirrorStoreError` (same names as today)

- [ ] **Step 1: Add fake-indexeddb**

```bash
npm install --save-dev --save-exact fake-indexeddb@6.0.0
```

- [ ] **Step 2: Write the failing SHA-256 and bytes tests**

`tests/sha256.test.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sha256, sha256Hex } from '../src/shared/sha256';

const node = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
describe('synchronous SHA-256 (web build spec §3.1)', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    ['abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu', 'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1'],
  ])('matches the FIPS 180-2 vector for %j', (text, hex) => {
    expect(sha256Hex(text)).toBe(hex); expect(sha256Hex(new TextEncoder().encode(text))).toBe(hex);
  });
  it('matches the one-million-a vector', () => {
    expect(sha256Hex(new Uint8Array(1_000_000).fill(0x61))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
  it('matches node:crypto byte for byte at every length across three block boundaries', () => {
    for (let length = 0; length <= 200; length++) { const bytes = randomBytes(length); expect(sha256Hex(bytes)).toBe(node(bytes)); }
  });
  it('matches node:crypto on random inputs up to 70 KiB', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 70000 }), bytes => sha256Hex(bytes) === node(bytes)), { numRuns: 300 });
  });
  it('matches node:crypto on a full 512 KiB checkpoint-sized input and on a subarray view', () => {
    const bytes = randomBytes(524288), view = bytes.subarray(7, 524288 - 9);
    expect(sha256Hex(bytes)).toBe(node(bytes)); expect(sha256Hex(view)).toBe(node(view));
  });
  it('returns 32 raw bytes and never mutates its input', () => {
    const input = randomBytes(77), copy = Uint8Array.from(input), digest = sha256(input);
    expect(digest).toBeInstanceOf(Uint8Array); expect(digest.length).toBe(32); expect(Uint8Array.from(input)).toEqual(copy);
    expect(Buffer.from(digest).toString('hex')).toBe(node(input));
  });
});
```

`tests/bytes.test.ts`:

```ts
import { randomBytes } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesEqual, bytesToBase64, bytesToHex } from '../src/shared/bytes';
import { randomHex } from '../src/network/random';

describe('portable byte helpers (web build spec §3.1)', () => {
  it('base64 matches Buffer in both directions, including a 512 KiB input', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 5000 }), bytes => {
      const text = bytesToBase64(bytes);
      return text === Buffer.from(bytes).toString('base64') && bytesEqual(base64ToBytes(text), bytes);
    }), { numRuns: 300 });
    const big = randomBytes(524288); expect(bytesToBase64(big)).toBe(big.toString('base64'));
  });
  it('rejects malformed base64 instead of skipping characters as Buffer does', () => {
    expect(() => base64ToBytes('ab$d')).toThrow();
  });
  it('hex matches Buffer and random hex has the requested size and alphabet', () => {
    const bytes = randomBytes(33); expect(bytesToHex(bytes)).toBe(bytes.toString('hex'));
    const value = randomHex(16); expect(value).toMatch(/^[0-9a-f]{32}$/); expect(randomHex(16)).not.toBe(value);
  });
  it('compares bytes exactly', () => {
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/sha256.test.ts tests/bytes.test.ts`
Expected: FAIL, modules `../src/shared/sha256` and `../src/shared/bytes` not found.

- [ ] **Step 4: Write SHA-256 and the byte helpers**

`src/shared/sha256.ts`:

```ts
// Synchronous SHA-256 (web build spec §3.1, FIPS 180-4). The page keeps today's synchronous hashing call sites
// (init hashes, mirror payload checks) without node:crypto; crypto.subtle is asynchronous only.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const ror = (x: number, n: number) => (x >>> n) | (x << (32 - n));
const utf8 = new TextEncoder();
/** The 32-byte digest of the bytes, or of a string's UTF-8 encoding. */
export function sha256(input: Uint8Array | string): Uint8Array {
  const bytes = typeof input === 'string' ? utf8.encode(input) : input;
  const length = bytes.length, padded = new Uint8Array(((length + 9 + 63) >>> 6) << 6);
  padded.set(bytes); padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000), false);
  view.setUint32(padded.length - 4, (length << 3) >>> 0, false);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!, b = w[i - 2]!;
      w[i] = (w[i - 16]! + (ror(a, 7) ^ ror(a, 18) ^ (a >>> 3)) + w[i - 7]! + (ror(b, 17) ^ ror(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) >>> 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out = new Uint8Array(32), result = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((value, i) => result.setUint32(i * 4, value, false));
  return out;
}
export function sha256Hex(input: Uint8Array | string): string {
  let hex = ''; for (const byte of sha256(input)) hex += byte.toString(16).padStart(2, '0'); return hex;
}
```

`src/shared/bytes.ts`:

```ts
// Portable byte helpers (web build spec §3.1): the page's replacements for Buffer and node:crypto's randomBytes.
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
/** Strict: atob throws on characters outside the base64 alphabet (callers validate canonical form first). */
export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text), out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
export function bytesToHex(bytes: Uint8Array): string {
  let hex = ''; for (const byte of bytes) hex += byte.toString(16).padStart(2, '0'); return hex;
}
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
```

`src/network/random.ts` (outside `src/shared`: `tests/boundary.test.ts` holds that directory to the deterministic rules, which ban `crypto`):

```ts
import { bytesToHex } from '../shared/bytes';
/** `byteLength` random bytes from crypto.getRandomValues, as lowercase hex (today's randomBytes(n).toString('hex')). */
export function randomHex(byteLength: number): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}
```

- [ ] **Step 5: Run the primitive tests**

Run: `npx vitest run tests/sha256.test.ts tests/bytes.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing record-store and store tests**

`tests/recordStore.test.ts`:

```ts
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createIndexedDbRecordStore, createMemoryRecordStore, ONLINE_RECORD_DATABASE, ONLINE_RECORD_STORE, ONLINE_RECORD_VERSION } from '../src/network/online/recordStore';

const factory = () => new IDBFactory() as unknown as globalThis.IDBFactory;
describe('online record store (web build spec §3.1)', () => {
  it.each([['IndexedDB', () => createIndexedDbRecordStore(factory())], ['memory', () => createMemoryRecordStore()]])('%s: round-trips detached bytes, misses as null and deletes idempotently', async (_name, make) => {
    const store = make(), bytes = new Uint8Array([1, 2, 3]);
    expect(await store.get('seat-v1')).toBeNull();
    await store.put('seat-v1', bytes); bytes[0] = 9;
    const loaded = await store.get('seat-v1'); expect(loaded).toEqual(new Uint8Array([1, 2, 3]));
    loaded![1] = 9; expect(await store.get('seat-v1')).toEqual(new Uint8Array([1, 2, 3]));
    await store.put('seat-v1', new Uint8Array([4])); expect(await store.get('seat-v1')).toEqual(new Uint8Array([4]));
    expect(await store.get('mirror-v1')).toBeNull();
    await store.delete('seat-v1'); await store.delete('seat-v1'); expect(await store.get('seat-v1')).toBeNull();
  });
  it('uses database ftlite version 1 with one records store, and two stores on one factory share it', async () => {
    const idb = factory(), a = createIndexedDbRecordStore(idb), b = createIndexedDbRecordStore(idb);
    await a.put('mirror-v1', new Uint8Array(557056).fill(7)); expect((await b.get('mirror-v1'))!.length).toBe(557056);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = idb.open(ONLINE_RECORD_DATABASE); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    expect(db.version).toBe(ONLINE_RECORD_VERSION); expect(Array.from({ length: db.objectStoreNames.length }, (_, i) => db.objectStoreNames.item(i))).toEqual([ONLINE_RECORD_STORE]); db.close();
  });
  it('refuses unknown keys and non-byte values', async () => {
    const store = createIndexedDbRecordStore(factory());
    await expect(store.get('other' as never)).rejects.toThrow('invalid-record-key');
    await expect(store.put('seat-v1', 'text' as never)).rejects.toThrow('invalid-record');
  });
});
```

`tests/seatStore.test.ts` (replace the whole file):

```ts
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createIndexedDbRecordStore, createMemoryRecordStore, type OnlineRecordStore } from '../src/network/online/recordStore';
import { createSeatStore, type SavedSeatV1 } from '../src/network/online/seatStore';

const seat = (char = 'a'): SavedSeatV1 => ({ version: 1, serviceOrigin: 'http://localhost:8787', roomId: char.repeat(32), joinCode: 'ABCD1234',
  compatibility: { protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'c'.repeat(64), layoutHash: '12345678' },
  seatId: 1, seatGeneration: 1, seatToken: 'S'.repeat(43) });
const text = (value: string) => new TextEncoder().encode(value);
const failing = (operation: 'get' | 'put' | 'delete'): OnlineRecordStore => {
  const inner = createMemoryRecordStore();
  return { get: k => operation === 'get' ? Promise.reject(Error('secret path')) : inner.get(k), put: (k, b) => operation === 'put' ? Promise.reject(Error('secret')) : inner.put(k, b),
    delete: k => operation === 'delete' ? Promise.reject(Error('secret')) : inner.delete(k) };
};
describe('saved seat store on the record seam', () => {
  it('round-trips a detached seat record in IndexedDB and supports a missing record and repeat clear', async () => {
    const store = createSeatStore(createIndexedDbRecordStore(new IDBFactory() as unknown as globalThis.IDBFactory));
    expect(await store.load()).toBeNull(); await store.save(seat());
    const loaded = await store.load(); expect(loaded).toEqual(seat()); loaded!.seatToken = 'X';
    expect((await store.load())!.seatToken).toBe('S'.repeat(43));
    await store.clear(); await store.clear(); expect(await store.load()).toBeNull();
  });
  it.each(['{corrupt', JSON.stringify({ ...seat(), version: 2 }), JSON.stringify({ ...seat(), seatToken: 'bad' }), JSON.stringify({ ...seat(), extra: 'secret' }),
    JSON.stringify({ ...seat(), serviceOrigin: 'http://user:secret@localhost:8787' }), JSON.stringify({ ...seat(), compatibility: { ...seat().compatibility, extra: 'secret' } }),
    JSON.stringify(seat()) + ' '.repeat(8193), '{"version":1,"version":1}'])('rejects corrupt, unknown-version, oversize or unsafe records with a fixed error', async value => {
    const records = createMemoryRecordStore(), store = createSeatStore(records); await records.put('seat-v1', text(value));
    await expect(store.load()).rejects.toMatchObject({ code: 'storage-invalid', message: 'storage-invalid' });
  });
  it('rejects invalid UTF-8 with the fixed error', async () => {
    const records = createMemoryRecordStore(), store = createSeatStore(records); await records.put('seat-v1', new Uint8Array([0x7b, 0xff, 0x7d]));
    await expect(store.load()).rejects.toMatchObject({ code: 'storage-invalid' });
  });
  it('accepts exactly 8 KiB and rejects 8 KiB plus one', async () => {
    const records = createMemoryRecordStore(), store = createSeatStore(records), value = JSON.stringify(seat());
    await records.put('seat-v1', text(value + ' '.repeat(8192 - text(value).length))); expect(await store.load()).toEqual(seat());
    await records.put('seat-v1', text(value + ' '.repeat(8193 - text(value).length))); await expect(store.load()).rejects.toMatchObject({ code: 'storage-invalid' });
  });
  it('serializes save A, forget and save B without resurrecting A', async () => {
    const store = createSeatStore(createMemoryRecordStore());
    await Promise.all([store.save(seat('a')), store.clear(), store.save(seat('b'))]); expect((await store.load())!.roomId).toBe('b'.repeat(32));
    await Promise.all([store.save(seat('c')), store.clear()]); expect(await store.load()).toBeNull();
  });
  it('captures records at save invocation before queued work runs', async () => {
    const store = createSeatStore(createMemoryRecordStore()), record = seat(); const saved = store.save(record); record.seatToken = 'T'.repeat(43); await saved;
    expect((await store.load())!.seatToken).toBe('S'.repeat(43));
  });
  it('rejects invalid saves before replacing the saved credential', async () => {
    const store = createSeatStore(createMemoryRecordStore()); await store.save(seat());
    await expect(store.save({ ...seat(), seatToken: 'bad' })).rejects.toMatchObject({ code: 'storage-invalid' });
    await expect(store.save({ ...seat(), toJSON() { throw Error('secret'); } } as never)).rejects.toMatchObject({ code: 'storage-invalid', message: 'storage-invalid' });
    expect(await store.load()).toEqual(seat());
  });
  it.each([['get', 'load', 'storage-read-failed'], ['put', 'save', 'storage-write-failed'], ['delete', 'clear', 'storage-clear-failed']] as const)('maps a %s failure to the fixed %s error and keeps the queue alive', async (operation, method, code) => {
    const store = createSeatStore(failing(operation));
    await expect(method === 'save' ? store.save(seat()) : store[method]()).rejects.toMatchObject({ code, message: code });
    await (operation === 'put' ? store.load() : store.save(seat()));   // the queue is still alive after the fixed failure
  });
});
```

`tests/mirrorStore.test.ts` (replace the whole file):

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createMemoryRecordStore, type OnlineRecordStore } from '../src/network/online/recordStore';
import { createMirrorStore, type MirrorFileV1, type SessionMirror } from '../src/network/online/mirrorStore';

export function mirror(sequence = 1, generation = 1, tick = 0, size = 16): SessionMirror {
  const bytes = new Uint8Array(size).fill(sequence);
  return { metadata: { version: 1, protocolVersion: 2, roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: generation, checkpointSequence: sequence, capturedTick: tick,
    payloadSha256: createHash('sha256').update(bytes).digest('hex'), compatibility: { protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'c'.repeat(64), layoutHash: '12345678' } }, bytes };
}
const record = (): MirrorFileV1 => ({ version: 1, serviceOrigin: 'http://localhost:8787', roomId: 'a'.repeat(32), committed: mirror(), pending: mirror(2) });
const u32 = (bytes: Uint8Array, at: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, true);
describe('binary session mirror on the record seam', () => {
  it('round trips two maximum payloads with the exact magic/header/raw order and detached invocation bytes', async () => {
    const records = createMemoryRecordStore(), store = createMirrorStore(records, () => {}), value = record();
    expect(await store.load()).toBeNull(); value.committed = mirror(1, 1, 0, 262144); value.pending = mirror(2, 1, 300, 262144);
    const saved = store.save(value); value.pending.bytes[0] = 99; await saved;
    const loaded = await store.load(), bytes = records.records.get('mirror-v1')!;
    expect(bytes.length).toBeLessThanOrEqual(557056); expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe('FTLNMIR1');
    const end = 12 + u32(bytes, 8); expect(bytes[end]).toBe(1); expect(bytes[end + 262144]).toBe(2); expect(loaded?.pending?.bytes[0]).toBe(2);
    await store.clear(); await store.clear(); expect(await store.load()).toBeNull(); expect(records.records.size).toBe(0);
  });
  it.each(['magic', 'truncated', 'oversize', 'trailing', 'hash', 'utf8', 'extra', 'duplicate'] as const)('rejects %s corruption with fixed errors', async kind => {
    const records = createMemoryRecordStore(), store = createMirrorStore(records, () => {}); await store.save(record());
    let bytes = Uint8Array.from(records.records.get('mirror-v1')!);
    if (kind === 'magic') bytes[0] = 0;
    if (kind === 'truncated') bytes = bytes.subarray(0, bytes.length - 1);
    if (kind === 'oversize') bytes = new Uint8Array(557057);
    if (kind === 'trailing') { const longer = new Uint8Array(bytes.length + 1); longer.set(bytes); bytes = longer; }
    if (kind === 'hash') bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    if (kind === 'utf8') bytes[12] = 255;
    if (kind === 'extra' || kind === 'duplicate') {
      const length = u32(bytes, 8), old = new TextDecoder().decode(bytes.subarray(12, 12 + length));
      const header = new TextEncoder().encode(old.slice(0, -1) + (kind === 'extra' ? ',"seatToken":"secret"}' : ',"version":1}'));
      const next = new Uint8Array(12 + header.length + bytes.length - 12 - length); next.set(bytes.subarray(0, 12));
      new DataView(next.buffer).setUint32(8, header.length, true); next.set(header, 12); next.set(bytes.subarray(12 + length), 12 + header.length); bytes = next;
    }
    records.records.set('mirror-v1', bytes);
    await expect(store.load()).rejects.toMatchObject({ code: kind === 'oversize' ? 'save-too-large' : 'save-invalid' });
  });
  it('validates mode payload and room binding before replacing a valid record', async () => {
    const store = createMirrorStore(createMemoryRecordStore(), m => { if (m.bytes[0] === 3) throw Error('mode mismatch'); }); await store.save(record());
    await expect(store.save({ ...record(), pending: mirror(3) })).rejects.toMatchObject({ code: 'save-invalid' });
    await expect(store.save({ ...record(), roomId: 'd'.repeat(32) })).rejects.toMatchObject({ code: 'save-invalid' }); expect(await store.load()).toEqual(record());
  });
  it.each(['get', 'put', 'delete'] as const)('maps a %s failure to save-unavailable and keeps the committed record', async operation => {
    const inner = createMemoryRecordStore(); let fail = false;
    const records: OnlineRecordStore = { get: k => fail && operation === 'get' ? Promise.reject(Error('secret')) : inner.get(k),
      put: (k, b) => fail && operation === 'put' ? Promise.reject(Error('secret')) : inner.put(k, b), delete: k => fail && operation === 'delete' ? Promise.reject(Error('secret')) : inner.delete(k) };
    const store = createMirrorStore(records, () => {}); await store.save(record()); fail = true;
    const attempt = operation === 'get' ? store.load() : operation === 'put' ? store.save({ ...record(), pending: mirror(4) }) : store.clear();
    await expect(attempt).rejects.toMatchObject({ code: 'save-unavailable' });
    fail = false; expect(await store.load()).toEqual(record());
  });
  it('serializes queued write and Forget, never recreating the cleared record', async () => {
    const store = createMirrorStore(createMemoryRecordStore(), () => {}); await Promise.all([store.save(record()), store.clear()]); expect(await store.load()).toBeNull();
  });
});
```

- [ ] **Step 7: Run them to see them fail**

Run: `npx vitest run tests/recordStore.test.ts tests/seatStore.test.ts tests/mirrorStore.test.ts`
Expected: FAIL, `src/network/online/recordStore` (and the store modules) not found.

- [ ] **Step 8: Write the record store**

`src/network/online/recordStore.ts`:

```ts
// The page's saved online records (web build spec §3.1): one IndexedDB key-value store replacing the seat and mirror
// files. Each put replaces one record in one transaction, so the temporary-file-plus-rename step is gone.
export type OnlineRecordKey = 'seat-v1' | 'mirror-v1';
export interface OnlineRecordStore {
  get(key: OnlineRecordKey): Promise<Uint8Array | null>;
  put(key: OnlineRecordKey, bytes: Uint8Array): Promise<void>;
  delete(key: OnlineRecordKey): Promise<void>;
}
export const ONLINE_RECORD_DATABASE = 'ftlite', ONLINE_RECORD_VERSION = 1, ONLINE_RECORD_STORE = 'records';
const KEYS: readonly string[] = ['seat-v1', 'mirror-v1'];
function checkKey(key: string): void { if (!KEYS.includes(key)) throw Error('invalid-record-key'); }
function checkBytes(bytes: unknown): asserts bytes is Uint8Array { if (!(bytes instanceof Uint8Array)) throw Error('invalid-record'); }
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? Error('indexeddb-request-failed')); });
}
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? Error('indexeddb-transaction-failed'));
  });
}
export function createIndexedDbRecordStore(factory: IDBFactory = globalThis.indexedDB): OnlineRecordStore {
  let opening: Promise<IDBDatabase> | undefined;
  function open(): Promise<IDBDatabase> {
    if (opening) return opening;
    const work = new Promise<IDBDatabase>((resolve, reject) => {
      const r = factory.open(ONLINE_RECORD_DATABASE, ONLINE_RECORD_VERSION);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ONLINE_RECORD_STORE)) r.result.createObjectStore(ONLINE_RECORD_STORE); };
      r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); if (opening === work) opening = undefined; }; resolve(db); };
      r.onerror = () => reject(r.error ?? Error('indexeddb-open-failed'));
      r.onblocked = () => reject(Error('indexeddb-blocked'));
    });
    opening = work; void work.catch(() => { if (opening === work) opening = undefined; });
    return work;
  }
  return {
    async get(key) {
      checkKey(key);
      const tx = (await open()).transaction(ONLINE_RECORD_STORE, 'readonly');
      const value: unknown = await request(tx.objectStore(ONLINE_RECORD_STORE).get(key));
      if (value === undefined) return null;
      checkBytes(value); return new Uint8Array(value);
    },
    async put(key, bytes) {
      checkKey(key); checkBytes(bytes);
      const tx = (await open()).transaction(ONLINE_RECORD_STORE, 'readwrite'), done = committed(tx);
      tx.objectStore(ONLINE_RECORD_STORE).put(bytes.slice(), key); await done;
    },
    async delete(key) {
      checkKey(key);
      const tx = (await open()).transaction(ONLINE_RECORD_STORE, 'readwrite'), done = committed(tx);
      tx.objectStore(ONLINE_RECORD_STORE).delete(key); await done;
    }
  };
}
/** A detached in-memory store for tests and for a page without IndexedDB. */
export function createMemoryRecordStore(): OnlineRecordStore & { records: Map<OnlineRecordKey, Uint8Array> } {
  const records = new Map<OnlineRecordKey, Uint8Array>();
  return {
    records,
    async get(key) { checkKey(key); const value = records.get(key); return value ? value.slice() : null; },
    async put(key, bytes) { checkKey(key); checkBytes(bytes); records.set(key, bytes.slice()); },
    async delete(key) { checkKey(key); records.delete(key); }
  };
}
```

- [ ] **Step 9: Write the seat store**

`src/network/online/seatStore.ts`:

```ts
import { isRoomId, isRoomToken, parseBoundedJson, validateCompatibility, type RoomCompatibility } from '../../shared/roomSession';
import { rtcKeys, rtcRecord } from '../../shared/rtcSession';
import type { OnlineRecordStore } from './recordStore';

/** Page-private credentials. Never use this record as a status or UI payload. */
export interface SavedSeatV1 {
  version: 1; serviceOrigin: string; roomId: string; joinCode: string; compatibility: RoomCompatibility;
  seatId: number; seatGeneration: number; seatToken: string;
}
export type SeatStoreErrorCode = 'storage-invalid' | 'storage-read-failed' | 'storage-write-failed' | 'storage-clear-failed';
export class SeatStoreError extends Error {
  constructor(readonly code: SeatStoreErrorCode) { super(code); this.name = 'SeatStoreError'; }
}
const MAX_BYTES = 8192, KEY = 'seat-v1' as const;
function validOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return value === url.origin && !url.username && !url.password && (url.protocol === 'https:'
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  } catch { return false; }
}
export function validateSavedSeat(value: unknown): value is SavedSeatV1 {
  return rtcRecord(value) && rtcKeys(value, ['version', 'serviceOrigin', 'roomId', 'joinCode', 'compatibility', 'seatId', 'seatGeneration', 'seatToken'])
    && value.version === 1 && validOrigin(value.serviceOrigin) && isRoomId(value.roomId)
    && typeof value.joinCode === 'string' && /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(value.joinCode)
    && validateCompatibility(value.compatibility) && Number.isSafeInteger(value.seatId) && (value.seatId as number) >= 0 && (value.seatId as number) < 4
    && Number.isSafeInteger(value.seatGeneration) && (value.seatGeneration as number) > 0 && isRoomToken(value.seatToken);
}

/** Queue reads as well as mutations so callers observe invocation order, even after failures. */
export function createSeatStore(records: OnlineRecordStore) {
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  }
  return {
    load(): Promise<SavedSeatV1 | null> {
      return enqueue(async () => {
        let bytes: Uint8Array | null;
        try { bytes = await records.get(KEY); } catch { throw new SeatStoreError('storage-read-failed'); }
        if (bytes === null) return null;
        if (bytes.length > MAX_BYTES) throw new SeatStoreError('storage-invalid');
        let value: unknown;
        try { value = parseBoundedJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes), MAX_BYTES); }
        catch { throw new SeatStoreError('storage-invalid'); }
        if (!validateSavedSeat(value)) throw new SeatStoreError('storage-invalid');
        return value;
      });
    },
    async save(record: SavedSeatV1): Promise<void> {
      // Capture now; callers cannot mutate credentials while an earlier operation is pending.
      let bytes: Uint8Array;
      try {
        if (!validateSavedSeat(record)) throw new SeatStoreError('storage-invalid');
        const text = JSON.stringify(record);
        bytes = new TextEncoder().encode(text);
        if (bytes.length > MAX_BYTES || !validateSavedSeat(parseBoundedJson(text, MAX_BYTES))) throw new SeatStoreError('storage-invalid');
      } catch { throw new SeatStoreError('storage-invalid'); }
      return enqueue(async () => {
        try { await records.put(KEY, bytes); } catch { throw new SeatStoreError('storage-write-failed'); }
      });
    },
    clear(): Promise<void> {
      return enqueue(async () => {
        try { await records.delete(KEY); } catch { throw new SeatStoreError('storage-clear-failed'); }
      });
    },
  };
}
export type SeatStore = ReturnType<typeof createSeatStore>;
```

- [ ] **Step 10: Write the mirror store**

`src/network/online/mirrorStore.ts`:

```ts
import { isRoomId, parseBoundedJson, validateCheckpointMetadata, ROOM_CHECKPOINT_BYTES, ROOM_CHECKPOINT_METADATA_BYTES, type SessionCheckpointMetadata } from '../../shared/roomSession';
import { rtcKeys, rtcRecord } from '../../shared/rtcSession';
import { sha256Hex } from '../../shared/sha256';
import type { OnlineRecordStore } from './recordStore';

export interface SessionMirror { metadata: SessionCheckpointMetadata; bytes: Uint8Array }
export interface MirrorFileV1 { version: 1; serviceOrigin: string; roomId: string; committed: SessionMirror | null; pending: SessionMirror | null }
export interface MirrorStore { load(): Promise<MirrorFileV1 | null>; save(value: MirrorFileV1): Promise<void>; clear(): Promise<void> }
export class MirrorStoreError extends Error {
  constructor(readonly code: 'save-unavailable' | 'save-invalid' | 'save-too-large') { super(code); this.name = 'MirrorStoreError'; }
}
const MAX_BYTES = 557056, HEADER_BYTES = 16384, KEY = 'mirror-v1' as const;
const utf8 = new TextEncoder(), MAGIC = utf8.encode('FTLNMIR1');
const invalid = () => new MirrorStoreError('save-invalid');
function validOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try { const url = new URL(value); return url.origin === value && !url.username && !url.password && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)); } catch { return false; }
}
export function validateMirror(mirror: SessionMirror, validatePayload: (mirror: SessionMirror) => void): void {
  if (!rtcRecord(mirror) || !rtcKeys(mirror, ['metadata', 'bytes']) || !validateCheckpointMetadata(mirror.metadata) || !(mirror.bytes instanceof Uint8Array) || !mirror.bytes.length) throw invalid();
  if (mirror.bytes.length > ROOM_CHECKPOINT_BYTES || utf8.encode(JSON.stringify(mirror.metadata)).length > ROOM_CHECKPOINT_METADATA_BYTES) throw new MirrorStoreError('save-too-large');
  if (sha256Hex(mirror.bytes) !== mirror.metadata.payloadSha256) throw invalid();
  try { validatePayload(mirror); } catch { throw invalid(); }
}
function encode(value: MirrorFileV1, validate: (m: SessionMirror) => void): Uint8Array {
  if (!rtcRecord(value) || !rtcKeys(value, ['version', 'serviceOrigin', 'roomId', 'committed', 'pending']) || value.version !== 1 || !validOrigin(value.serviceOrigin) || !isRoomId(value.roomId)) throw invalid();
  const describe = (m: SessionMirror | null) => {
    if (m === null) return null;
    validateMirror(m, validate); if (m.metadata.roomId !== value.roomId) throw invalid();
    return { metadata: m.metadata, byteLength: m.bytes.length };
  };
  const header = utf8.encode(JSON.stringify({ version: 1, serviceOrigin: value.serviceOrigin, roomId: value.roomId, committed: describe(value.committed), pending: describe(value.pending) }));
  if (header.length > HEADER_BYTES) throw new MirrorStoreError('save-too-large');
  const committed = value.committed?.bytes ?? new Uint8Array(), pending = value.pending?.bytes ?? new Uint8Array();
  const total = 12 + header.length + committed.length + pending.length;
  if (total > MAX_BYTES) throw new MirrorStoreError('save-too-large');
  const bytes = new Uint8Array(total);
  bytes.set(MAGIC, 0); new DataView(bytes.buffer).setUint32(8, header.length, true);
  bytes.set(header, 12); bytes.set(committed, 12 + header.length); bytes.set(pending, 12 + header.length + committed.length);
  return bytes;
}
function decode(bytes: Uint8Array, validate: (m: SessionMirror) => void): MirrorFileV1 {
  if (bytes.length > MAX_BYTES) throw new MirrorStoreError('save-too-large');
  if (bytes.length < 12 || MAGIC.some((byte, i) => bytes[i] !== byte)) throw invalid();
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true);
  if (length > HEADER_BYTES || length + 12 > bytes.length) throw invalid();
  const h = parseBoundedJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(12, 12 + length)), HEADER_BYTES);
  if (!rtcRecord(h) || !rtcKeys(h, ['version', 'serviceOrigin', 'roomId', 'committed', 'pending'])) throw invalid();
  let offset = 12 + length;
  const entry = (d: unknown): SessionMirror | null => {
    if (d === null) return null;
    if (!rtcRecord(d) || !rtcKeys(d, ['metadata', 'byteLength']) || !validateCheckpointMetadata(d.metadata) || !Number.isSafeInteger(d.byteLength) || (d.byteLength as number) <= 0 || (d.byteLength as number) > ROOM_CHECKPOINT_BYTES || offset + (d.byteLength as number) > bytes.length) throw invalid();
    const mirror = { metadata: d.metadata, bytes: new Uint8Array(bytes.subarray(offset, offset + (d.byteLength as number))) }; offset += d.byteLength as number; return mirror;
  };
  const value = { version: h.version, serviceOrigin: h.serviceOrigin, roomId: h.roomId, committed: entry(h.committed), pending: entry(h.pending) } as MirrorFileV1;
  if (offset !== bytes.length) throw invalid();
  encode(value, validate); return value;
}
/** Invocation-ordered I/O, as the credential store. */
export function createMirrorStore(records: OnlineRecordStore, validatePayload: (m: SessionMirror) => void): MirrorStore {
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> { const result = tail.then(operation); tail = result.catch(() => {}); return result; }
  return {
    load: () => enqueue(async () => {
      let bytes: Uint8Array | null;
      try { bytes = await records.get(KEY); } catch { throw new MirrorStoreError('save-unavailable'); }
      if (bytes === null) return null;
      try { return decode(bytes, validatePayload); } catch (e) { throw e instanceof MirrorStoreError ? e : invalid(); }
    }),
    async save(value) {
      let bytes: Uint8Array;
      try { bytes = encode(value, validatePayload); decode(bytes, validatePayload); } catch (e) { throw e instanceof MirrorStoreError ? e : invalid(); }
      return enqueue(async () => { try { await records.put(KEY, bytes); } catch { throw new MirrorStoreError('save-unavailable'); } });
    },
    clear: () => enqueue(async () => { try { await records.delete(KEY); } catch { throw new MirrorStoreError('save-unavailable'); } })
  };
}
```

- [ ] **Step 11: Run the tests and typecheck**

Run: `npx vitest run tests/sha256.test.ts tests/bytes.test.ts tests/recordStore.test.ts tests/seatStore.test.ts tests/mirrorStore.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json src/shared/sha256.ts src/shared/bytes.ts src/network/random.ts src/network/online/recordStore.ts src/network/online/seatStore.ts src/network/online/mirrorStore.ts \
  tests/sha256.test.ts tests/bytes.test.ts tests/recordStore.test.ts tests/seatStore.test.ts tests/mirrorStore.test.ts
git commit -m "feat(web-i): synchronous SHA-256, byte helpers and the IndexedDB record seam under the seat and mirror stores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The session stack in `src/network/online`, Node-free (spec §3.1, §4)

The session and its helpers are copied (not moved) so the old Electron stack keeps building and running until Task 7 deletes it. Tests switch to the new copies now.

**Files:**
- Create (copy then edit): `src/network/online/onlineSession.ts`, `onlinePeers.ts`, `onlineDuel.ts`, `onlineSector.ts`, `onlineMirrors.ts`, `onlineModes.ts`, `onlineIce.ts`, `onlineRetry.ts` from `src/main/network/`
- Create: `src/network/host/contracts.ts`, `src/network/transport/contracts.ts`, `src/shared/onlineConfig.ts`, `tests/pageBoundary.test.ts`
- Modify: `src/renderer/src/ui/menuState.ts:48`, `tests/menu.test.tsx:57`, `tests/networkBoundary.test.ts:28`
- Modify (import paths): `tests/onlineConfig.test.ts`, `tests/onlineCoordinator.test.ts`, `tests/onlineRecovery.test.ts`, `tests/onlineDuel.test.ts`, `tests/onlineSector.test.ts`, `tests/onlineMirrors.test.ts`, `tests/onlinePeers.test.ts`, `tests/onlineIce.test.ts`, `tests/onlineRetry.test.ts`, `tests/onlineDuelSession.test.ts`, `scripts/network/internet-app-manifest.ts`, `scripts/network/internet-app-report.ts`, `scripts/network/internet-app-smoke.ts`

**Interfaces:**
- Consumes: Task 2's `sha256Hex`, `bytesToBase64`, `base64ToBytes`, `randomHex`, `bytesEqual`, `SavedSeatV1`, `validateSavedSeat`, `SeatStore`, `validateMirror`, `MirrorStore`, `SessionMirror`.
- Produces:
  - `src/network/transport/contracts.ts`: `interface RtcLinkStats { rttMs: number; route: 'lan' | 'internet' }`; `interface TransportController { startAttempt(options: RtcAttemptOptions, port: MessagePort): Promise<{ latestPayloadLimit: number }>; receiveSignal(signal: RtcSignal): Promise<void>; onSignal(cb): Unsubscribe; onAttemptClosed(cb): Unsubscribe; onStats?(cb: (attemptId: string, stats: RtcLinkStats) => void): Unsubscribe; closeAttempt(attemptId: string): Promise<void>; dispose(): Promise<void> }`; re-export `RtcAttemptOptions`.
  - `src/network/host/contracts.ts`: `HostProcessOptions` and `HostProcessHandle` exactly as `src/main/network/hostProcess.ts:11-29`, with `port: MessagePort` in `attachPeer`.
  - `src/network/online/onlineSession.ts`: `createOnlineSession(deps)`, `OnlinePlatform` (with `MessagePort`), `OnlineSessionDeps`, `OnlineSessionOwner` (gains `releaseForUnload(): void`), `OwnedOnlineTransport`, `LINK_STATS_MAX_AGE_MS`.
  - `src/shared/onlineConfig.ts`: `OnlineConfig`, `resolveOnlineConfig` (unchanged rules), `PageOnlineConfig`, `DISABLED_PAGE_ONLINE_CONFIG`, `toPageOnlineConfig(config, env)`, `validatePageOnlineConfig(value)`, `sessionConfigOf(page)`.

- [ ] **Step 1: Write the failing config and boundary tests**

Append to `tests/onlineConfig.test.ts` and change its first import line from `'../src/main/network/onlineConfig'` to `'../src/shared/onlineConfig'`, importing the new names too:

```ts
import { DISABLED_PAGE_ONLINE_CONFIG, resolveOnlineConfig, sessionConfigOf, toPageOnlineConfig, validatePageOnlineConfig } from '../src/shared/onlineConfig';
```

```ts
describe('page online config (web build spec §3.3)', () => {
  const loopback = resolveOnlineConfig({ packaged: false, localServiceUrl: 'http://127.0.0.1:8787' });
  it('carries the resolved origin and honours test-only fields only when unpackaged', () => {
    expect(toPageOnlineConfig(loopback, { packaged: false, sectorOnlineTest: '1', duelTestSeed: '42', testProbe: '1' })).toEqual({
      serviceOrigin: 'http://127.0.0.1:8787', iceMode: 'loopback', allowInsecureLocalhost: true, packaged: false, sectorOnlineTest: true, duelTestSeed: 42, testProbe: true });
    const turn = resolveOnlineConfig({ packaged: true, packagedServiceOrigin: 'https://service.example' });
    expect(toPageOnlineConfig(turn, { packaged: true, sectorOnlineTest: '1', duelTestSeed: '42', testProbe: '1' })).toEqual({
      serviceOrigin: 'https://service.example', iceMode: 'turn', allowInsecureLocalhost: false, packaged: true, sectorOnlineTest: false, duelTestSeed: null, testProbe: false });
  });
  it('parses the duel test seed exactly as main did and disables a disabled config', () => {
    for (const seed of ['', 'x', '-1', '4294967296', '12345678901']) expect(toPageOnlineConfig(loopback, { packaged: false, duelTestSeed: seed }).duelTestSeed).toBeNull();
    expect(toPageOnlineConfig(loopback, { packaged: false, duelTestSeed: '4294967295' }).duelTestSeed).toBe(4294967295);
    expect(toPageOnlineConfig({ enabled: false }, { packaged: false })).toEqual(DISABLED_PAGE_ONLINE_CONFIG);
  });
  it('validates by the same origin rules and maps back to the session config', () => {
    const page = toPageOnlineConfig(loopback, { packaged: false });
    expect(validatePageOnlineConfig(page)).toBe(true); expect(sessionConfigOf(page)).toEqual(loopback);
    expect(validatePageOnlineConfig(DISABLED_PAGE_ONLINE_CONFIG)).toBe(true); expect(sessionConfigOf(DISABLED_PAGE_ONLINE_CONFIG)).toEqual({ enabled: false });
    for (const bad of [{ ...page, serviceOrigin: 'http://evil.example' }, { ...page, iceMode: 'turn' }, { ...page, allowInsecureLocalhost: false },
      { ...page, packaged: true, sectorOnlineTest: true }, { ...page, packaged: true, testProbe: true }, { ...page, duelTestSeed: 1.5 }, { ...page, extra: 1 }, null, 'x'])
      expect(validatePageOnlineConfig(bad)).toBe(false);
  });
});
```

`tests/pageBoundary.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moduleSpecifiers } from './helpers/determinismGuard';

// Web build spec §2.3, §3: page-side online code runs in a browser page or Worker, so it imports no Node or Electron.
export const PAGE_ROOTS = ['src/network/online', 'src/network/host', 'src/network/transport'];
function walk(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(root, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(root, entry.name)] : []);
}
describe('page-side online code is browser-only', () => {
  for (const file of PAGE_ROOTS.flatMap(walk)) it(`${relative('.', file).replaceAll('\\', '/')} imports no node:, electron, process or Buffer`, () => {
    const source = readFileSync(file, 'utf8');
    expect(moduleSpecifiers(source).filter(s => s.startsWith('node:') || s === 'electron' || /^(fs|path|crypto|os|child_process)$/.test(s))).toEqual([]);
    expect(source).not.toMatch(/\bprocess\.|\bBuffer\b|\brequire\(/);
  });
});
```

Run: `npx vitest run tests/onlineConfig.test.ts tests/pageBoundary.test.ts`
Expected: `onlineConfig` FAILS (module `src/shared/onlineConfig` not found); `pageBoundary` passes on Task 2's three files.

- [ ] **Step 2: Write the shared config**

`src/shared/onlineConfig.ts`:

```ts
import { rtcKeys, rtcRecord } from './rtcSession';

export type OnlineConfig = { enabled: false } | { enabled: true; baseUrl: string; allowInsecureLocalhost: boolean; iceMode: 'loopback' | 'turn' };

/** Explicit nonsecret configuration only; never reads environment files. */
export function resolveOnlineConfig(options: { packaged: boolean; localServiceUrl?: string; serviceUrl?: string; packagedServiceOrigin?: string }): OnlineConfig {
  const sources = [options.localServiceUrl, options.serviceUrl, options.packagedServiceOrigin].filter(value => value !== undefined && value !== '');
  if (sources.length !== 1 || (options.packaged ? !options.packagedServiceOrigin : !!options.packagedServiceOrigin)) return { enabled: false };
  const source = sources[0]!, loopback = !!options.localServiceUrl;
  // Check raw origin syntax before URL normalization can erase a path or backslash.
  if (!/^https?:\/\/[^/\\\s@?#]+\/?$/i.test(source)) return { enabled: false };
  try {
    const url = new URL(source);
    if ((loopback ? url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) : url.protocol !== 'https:')
      || url.username || url.password || url.pathname !== '/' || source.includes('?') || source.includes('#')) return { enabled: false };
    return { enabled: true, baseUrl: url.origin, allowInsecureLocalhost: loopback, iceMode: loopback ? 'loopback' : 'turn' };
  } catch { return { enabled: false }; }
}

/** The page's online configuration (web build spec §3.3). `serviceOrigin: null` is online disabled. The last three
 *  fields are test-only and are honoured only by an unpackaged build; `testProbe` is deviation D-1 of the Web-i plan. */
export interface PageOnlineConfig {
  serviceOrigin: string | null; iceMode: 'loopback' | 'turn'; allowInsecureLocalhost: boolean; packaged: boolean;
  sectorOnlineTest: boolean; duelTestSeed: number | null; testProbe: boolean;
}
export const DISABLED_PAGE_ONLINE_CONFIG: PageOnlineConfig = Object.freeze({ serviceOrigin: null, iceMode: 'turn', allowInsecureLocalhost: false,
  packaged: true, sectorOnlineTest: false, duelTestSeed: null, testProbe: false });
const KEYS = ['serviceOrigin', 'iceMode', 'allowInsecureLocalhost', 'packaged', 'sectorOnlineTest', 'duelTestSeed', 'testProbe'];
/** Electron main: the resolved service plus the unpackaged-only test entries, from their environment strings. */
export function toPageOnlineConfig(config: OnlineConfig, env: { packaged: boolean; sectorOnlineTest?: string; duelTestSeed?: string; testProbe?: string }): PageOnlineConfig {
  if (!config.enabled) return { ...DISABLED_PAGE_ONLINE_CONFIG };
  const seed = env.packaged ? undefined : env.duelTestSeed;
  return { serviceOrigin: config.baseUrl, iceMode: config.iceMode, allowInsecureLocalhost: config.allowInsecureLocalhost, packaged: env.packaged,
    sectorOnlineTest: !env.packaged && env.sectorOnlineTest === '1',
    duelTestSeed: seed !== undefined && /^\d{1,10}$/.test(seed) && Number(seed) <= 0xffffffff ? Number(seed) : null,
    testProbe: !env.packaged && env.testProbe === '1' };
}
export function sessionConfigOf(page: PageOnlineConfig): OnlineConfig {
  if (page.serviceOrigin === null) return { enabled: false };
  return resolveOnlineConfig(page.iceMode === 'loopback' ? { packaged: false, localServiceUrl: page.serviceOrigin } : { packaged: false, serviceUrl: page.serviceOrigin });
}
export function validatePageOnlineConfig(value: unknown): value is PageOnlineConfig {
  if (!rtcRecord(value) || !rtcKeys(value, KEYS)) return false;
  const v = value as unknown as PageOnlineConfig;
  if ((v.iceMode !== 'loopback' && v.iceMode !== 'turn') || typeof v.allowInsecureLocalhost !== 'boolean' || typeof v.packaged !== 'boolean'
    || typeof v.sectorOnlineTest !== 'boolean' || typeof v.testProbe !== 'boolean'
    || !(v.duelTestSeed === null || Number.isSafeInteger(v.duelTestSeed) && v.duelTestSeed >= 0 && v.duelTestSeed <= 0xffffffff)) return false;
  if (v.packaged && (v.sectorOnlineTest || v.testProbe || v.duelTestSeed !== null)) return false;
  if (v.serviceOrigin === null) return true;
  if (typeof v.serviceOrigin !== 'string') return false;
  const resolved = sessionConfigOf(v);
  return resolved.enabled && resolved.baseUrl === v.serviceOrigin && resolved.iceMode === v.iceMode && resolved.allowInsecureLocalhost === v.allowInsecureLocalhost;
}
```

Run: `npx vitest run tests/onlineConfig.test.ts`
Expected: PASS (the old cases call `resolveOnlineConfig` with unchanged rules).

- [ ] **Step 3: Write the host and transport contracts**

`src/network/transport/contracts.ts`:

```ts
import type { RtcAttemptOptions, RtcSignal } from '../../shared/rtcSession';

type Unsubscribe = () => void;
export type { RtcAttemptOptions } from '../../shared/rtcSession';
export interface RtcLinkStats { rttMs: number; route: 'lan' | 'internet' }
/** The session's view of one page transport (web build spec §3): attempt lifetime, signals and link figures. */
export interface TransportController {
  startAttempt(options: RtcAttemptOptions, port: MessagePort): Promise<{ latestPayloadLimit: number }>;
  receiveSignal(signal: RtcSignal): Promise<void>;
  onSignal(callback: (signal: RtcSignal) => void): Unsubscribe;
  onAttemptClosed(callback: (attemptId: string) => void): Unsubscribe;
  /** A ready attempt's link figures (H-2 spec §8), about once a second: its RTT and route label. */
  onStats?(callback: (attemptId: string, stats: RtcLinkStats) => void): Unsubscribe;
  closeAttempt(attemptId: string): Promise<void>;
  dispose(): Promise<void>;
}
```

`src/network/host/contracts.ts`:

```ts
import type { HostCommandInput, HostResponse } from '../../shared/netSession';
import type { HostIdentity, StreamAttachmentOptions } from '../../shared/hostProcessProtocol';
import type { CaptureCause, CheckpointCandidate } from '../../shared/sessionCheckpoint';
import type { LeaseFenceReason, LeaseRenewalRequest, SessionLeaseIdentity } from '../../shared/sessionLease';
import type { LeaseGrant } from '../../shared/roomSession';
import type { TransportController } from '../transport/contracts';

type Unsubscribe = () => void;
export interface HostProcessOptions extends HostIdentity {
  sessionLease?: SessionLeaseIdentity;
  signal?: AbortSignal;
  onCrash?(record: { checkpoint: Uint8Array | null; diagnostic: unknown }): void;
}
/** The host simulation's owner (web build spec §3.2), unchanged from the Electron utility owner. */
export interface HostProcessHandle {
  onCheckpoint(callback: (candidate: CheckpointCandidate) => void): Unsubscribe;
  ackCheckpoint(captureId: number): Promise<void>;
  captureCheckpoint(cause: CaptureCause): Promise<CheckpointCandidate>;
  onLeaseRequest(callback: (request: LeaseRenewalRequest) => void): Unsubscribe;
  applyLease(request: LeaseRenewalRequest, grant: LeaseGrant): Promise<void>;
  invalidateLease(reason: LeaseFenceReason): Promise<void>;
  completeBootstrap(): Promise<void>;
  readonly transport: TransportController;
  request(command: HostCommandInput): Promise<HostResponse>;
  attachPeer(peer: string, players: readonly number[], port: MessagePort, options?: StreamAttachmentOptions): Promise<void>;
  onExit(callback: (reason: string) => void): Unsubscribe;
  dispose(): Promise<void>;
}
```

- [ ] **Step 4: Copy the session stack**

```bash
for f in onlineSession onlinePeers onlineDuel onlineSector onlineMirrors onlineModes onlineIce onlineRetry; do cp src/main/network/$f.ts src/network/online/$f.ts; done
cd src/network/online
sed -i "s#'\.\./\.\./network/#'../#g" onlineSession.ts onlinePeers.ts onlineMirrors.ts onlineIce.ts
sed -i "s#from '\./hostProcess'#from '../host/contracts'#; s#from '\./rtcTransport'#from '../transport/contracts'#; s#from '\./onlineConfig'#from '../../shared/onlineConfig'#" onlineSession.ts onlinePeers.ts
sed -i "s#MessagePortMain#MessagePort#g" onlineSession.ts onlinePeers.ts
sed -i "/^import type { MessagePort } from 'electron';$/d" onlineSession.ts onlinePeers.ts
cd ../../..
grep -n "electron\|node:\|Buffer\|randomBytes\|createHash\|\.\./\.\./network/" src/network/online/*.ts
```

Expected: the final `grep` lists only the lines Step 5 edits (`node:crypto` imports and `Buffer`/`createHash`/`randomBytes` uses in `onlineSession.ts`, `onlineDuel.ts`, `onlineSector.ts`, `onlineMirrors.ts`).

- [ ] **Step 5: Replace node:crypto and Buffer**

In `src/network/online/onlineSession.ts`:
- Replace line 1 `import { createHash, randomBytes } from 'node:crypto';` with:

```ts
import { sha256Hex } from '../../shared/sha256';
import { bytesToBase64 } from '../../shared/bytes';
import { randomHex } from '../random';
```

- Replace `utilityEpoch: randomBytes(16).toString('hex')` with `utilityEpoch: randomHex(16)`.
- Replace the two `start` lines (originally 496-497):

```ts
      const bytes = Buffer.from(JSON.stringify(c.mode.init(snapshot, { helmPlayer: action.helmPlayer ?? 0 }))), expectedRosterRevision = snapshot.rosterRevision;
      const proposal = await wait(c, c.service.request({ type: 'start-propose', expectedRosterRevision, initBase64: bytes.toString('base64'), initHash: createHash('sha256').update(bytes).digest('hex') }));
```

with:

```ts
      const bytes = new TextEncoder().encode(JSON.stringify(c.mode.init(snapshot, { helmPlayer: action.helmPlayer ?? 0 }))), expectedRosterRevision = snapshot.rosterRevision;
      const proposal = await wait(c, c.service.request({ type: 'start-propose', expectedRosterRevision, initBase64: bytesToBase64(bytes), initHash: sha256Hex(bytes) }));
```

- Change the doc comment `/** Main-only credentials and resource ownership. Renderer progress never grants gameplay authority. */` to `/** Page-owned credentials and resources (web build spec §3.3). UI progress never grants gameplay authority. */`.

In `src/network/online/onlineDuel.ts` and `src/network/online/onlineSector.ts`, replace `import { createHash } from 'node:crypto';` with:

```ts
import { sha256Hex } from '../../shared/sha256';
import { base64ToBytes } from '../../shared/bytes';
```

and in each file replace:

```ts
  const bytes = Buffer.from(committed.initBase64, 'base64');
  if (createHash('sha256').update(bytes).digest('hex') !== committed.initHash) throw onlineFault('hash-mismatch');
```

with:

```ts
  const bytes = base64ToBytes(committed.initBase64);
  if (sha256Hex(bytes) !== committed.initHash) throw onlineFault('hash-mismatch');
```

(`validateInitBase64` runs first and admits only canonical base64, so `atob` never sees an input `Buffer` would have accepted differently.)

In `src/network/online/onlineMirrors.ts`:
- Replace `import { createHash } from 'node:crypto';` with `import { sha256Hex } from '../../shared/sha256';` and `import { bytesEqual } from '../../shared/bytes';`.
- Replace `Buffer.from(a.bytes).equals(Buffer.from(b.bytes))` with `bytesEqual(a.bytes, b.bytes)`.
- Replace `payloadSha256: createHash('sha256').update(candidate.bytes).digest('hex')` with `payloadSha256: sha256Hex(candidate.bytes)`.

- [ ] **Step 6: Add the unload release to the session**

In `src/network/online/onlineSession.ts`, extend `OnlineSessionOwner`:

```ts
export interface OnlineSessionOwner {
  dispatch(action: OnlineAction): Promise<OnlineResult>; status(): OnlineStatus;
  subscribe(callback: (status: OnlineStatus) => void): Unsubscribe; suspend(): Promise<void>; resume(): Promise<void>; prepareExit(): Promise<void>; dispose(): Promise<void>;
  /** A browser pagehide that is not a back-forward cache entry (web build spec §3.1): send the host release over the
   *  open socket and close the peers synchronously, with no checkpoint capture. The owner is disposed afterwards. */
  releaseForUnload(): void;
  /** The newest link figures of a ready peer link (H-2 spec §8): its route and RTT; null with none, or older than 5 s. */
  linkStats?(): OnlineLinkStats | null;
}
```

and add to the `owner` object, after `prepareExit,`:

```ts
    releaseForUnload() {
      if (disposed) return;
      // stop() issues the host release before cleanup closes the socket (serviceClient's request sends synchronously).
      offVisible(); void stop(undefined, true); disposed = true; listeners.clear(); disposal ??= Promise.resolve();
    },
```

Add one coordinator case to `tests/onlineCoordinator.test.ts` (inside `describe('online coordinator ownership', …)`):

```ts
  it('releases synchronously on unload, with no exit capture, and stays disposed', async () => {
    const h = harness(); await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true }); await h.owner.dispatch({ type: 'start' });
    h.service.request.mockClear(); h.host.captureCheckpoint.mockClear();
    h.owner.releaseForUnload();
    expect(h.service.request.mock.calls.map((c: any) => c[0].type)).toEqual(['host-release']);
    expect(h.host.captureCheckpoint).not.toHaveBeenCalled(); expect(h.service.close).toHaveBeenCalled();
    expect(await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 })).toEqual({ ok: false, code: 'online-disabled' });
    h.owner.releaseForUnload(); await h.owner.dispose();
  });
```

- [ ] **Step 7: Point the tests and scripts at the new modules**

```bash
sed -i "s#'\.\./src/main/network/\(onlineSession\|onlinePeers\|onlineDuel\|onlineSector\|onlineMirrors\|onlineModes\|onlineIce\|onlineRetry\|mirrorStore\|seatStore\)'#'../src/network/online/\1'#g" \
  tests/onlineCoordinator.test.ts tests/onlineRecovery.test.ts tests/onlineDuel.test.ts tests/onlineSector.test.ts tests/onlineMirrors.test.ts \
  tests/onlinePeers.test.ts tests/onlineIce.test.ts tests/onlineRetry.test.ts tests/onlineDuelSession.test.ts
sed -i "s#'\.\./\.\./src/main/network/onlineConfig'#'../../src/shared/onlineConfig'#" scripts/network/internet-app-manifest.ts scripts/network/internet-app-report.ts scripts/network/internet-app-smoke.ts
grep -rn "src/main/network/online\(Session\|Peers\|Duel\|Sector\|Mirrors\|Modes\|Ice\|Retry\|Config\)\|src/main/network/\(mirror\|seat\)Store" tests scripts --include=*.ts
```

Expected: the last grep prints only `tests/linkStats.test.ts` (its `OnlineSessionOwner` type import; Task 7 rewrites that block) and `tests/onlineIpc.test.ts`/`tests/onlinePlatform.test.ts` (deleted in Task 7). `tests/onlineDuel.test.ts` keeps its `../src/main/network/duelRecords` import: `duelRecords.ts` stays in main.

- [ ] **Step 8: The direction-neutral incompatible text (spec §4)**

In `src/renderer/src/ui/menuState.ts:48` replace the value with:

```ts
  'incompatible': 'This lobby runs a different version. Both players should reload.',
```

In `tests/menu.test.tsx:57` replace the expected string with `'This lobby runs a different version. Both players should reload.'` (keep the rest of the line).

- [ ] **Step 9: Extend the boundary tests**

In `tests/networkBoundary.test.ts` line 28, add `'online/onlineSector.ts', 'online/onlineDuel.ts'` to the `src/network` exemption list (the mode adapters may read renderer contracts, as they did under `src/main/network`):

```ts
  for (const file of [...walk('src/network').filter(file => !['modes/sector.ts', 'modes/sectorStream.ts', 'modes/sectorProducers.ts', 'modes/encounterMode.ts', 'modes/streamBinding.ts', 'modes/duel.ts', 'modes/duelStream.ts', 'modes/remoteClient.ts', 'modes/duelProducers.ts', 'online/onlineSector.ts', 'online/onlineDuel.ts'].includes(relative('src/network', file).replaceAll('\\', '/'))),
```

- [ ] **Step 10: Run the ported suites, the boundaries and typecheck**

```bash
npx vitest run tests/onlineConfig.test.ts tests/onlineCoordinator.test.ts tests/onlineRecovery.test.ts tests/onlineDuel.test.ts tests/onlineSector.test.ts \
  tests/onlineMirrors.test.ts tests/onlinePeers.test.ts tests/onlineIce.test.ts tests/onlineRetry.test.ts tests/onlineDuelSession.test.ts \
  tests/menu.test.tsx tests/networkBoundary.test.ts tests/pageBoundary.test.ts tests/uiBoundary.test.ts
npm run typecheck
```

Expected: all PASS; typecheck clean (the old `src/main/network` stack still compiles untouched). If an `onlineCoordinator` case fails only on a `Buffer`-specific assertion, it was relying on Node's lenient base64; fix the fixture to send canonical base64, never the product code.

- [ ] **Step 11: Commit**

```bash
git add src/shared/onlineConfig.ts src/network/host/contracts.ts src/network/transport/contracts.ts \
  src/network/online/onlineSession.ts src/network/online/onlinePeers.ts src/network/online/onlineDuel.ts src/network/online/onlineSector.ts \
  src/network/online/onlineMirrors.ts src/network/online/onlineModes.ts src/network/online/onlineIce.ts src/network/online/onlineRetry.ts \
  src/renderer/src/ui/menuState.ts tests/menu.test.tsx tests/networkBoundary.test.ts tests/pageBoundary.test.ts tests/onlineConfig.test.ts \
  tests/onlineCoordinator.test.ts tests/onlineRecovery.test.ts tests/onlineDuel.test.ts tests/onlineSector.test.ts tests/onlineMirrors.test.ts \
  tests/onlinePeers.test.ts tests/onlineIce.test.ts tests/onlineRetry.test.ts tests/onlineDuelSession.test.ts \
  scripts/network/internet-app-manifest.ts scripts/network/internet-app-report.ts scripts/network/internet-app-smoke.ts
git commit -m "feat(web-i): the session stack in src/network/online without node:crypto or Buffer; page config; neutral version text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The page transport and the web port endpoint (spec §3.2, deviation D-3)

**Files:**
- Modify: `src/network/platformPort.ts` (add `webPortEndpoint`), `src/network/transport/bridge.ts` (alias and `connectTransportPort`; the window-message bridge stays until Task 7)
- Create: `src/network/transport/owner.ts` (from `src/main/network/rtcTransport.ts`), `src/network/transport/pageTransport.ts`
- Test: `tests/platformPort.test.ts` (add a case), `tests/pageTransport.test.ts` (new), `tests/rtcTransportOwner.test.ts` and `tests/linkStats.test.ts` (import path)

**Interfaces:**
- Consumes: `TransportController`, `RtcLinkStats` (Task 3), `createTransportController(options: HiddenControllerOptions)` (`src/network/transport/controller.ts`, unchanged).
- Produces:
  - `webPortEndpoint(port: MessagePort): PortEndpoint` (`src/network/platformPort.ts`)
  - `browserPortEndpoint` (alias of `webPortEndpoint`) and `connectTransportPort(port: MessagePort, identity: HostIdentity): void` (`src/network/transport/bridge.ts`)
  - `createRtcTransport(identity: HostIdentity, wire: RtcTransportWire): TransportController`, `interface RtcTransportWire { send(message: RtcRequest, ports?: MessagePort[]): void; onResponse(cb): Unsubscribe; dispose(): void }` (`src/network/transport/owner.ts`)
  - `type PageTransportOptions = Omit<HiddenControllerOptions, 'identity' | 'respond'>`; `interface PageTransport { controller: TransportController; connect(port: MessagePort): void; onExit(cb: () => void): Unsubscribe; dispose(): void }`; `createPageTransport(identity, options?): PageTransport` (`src/network/transport/pageTransport.ts`)

- [ ] **Step 1: Write the failing tests**

Add to `tests/platformPort.test.ts` (keep its existing cases; add the import next to the existing one):

```ts
import { webPortEndpoint } from '../src/network/platformPort';
it('reads event.data from an actual MessageChannel and removes exact listeners (web build spec §3.2)', async () => {
  const channel = new globalThis.MessageChannel(), port = webPortEndpoint(channel.port1 as unknown as globalThis.MessagePort), received: unknown[] = [];
  try {
    const first = new Promise(resolve => { const off = port.onMessage(data => { received.push(data); off(); resolve(data); }); port.start(); });
    channel.port2.postMessage({ kind: 'transport-ready' }); expect(await first).toEqual({ kind: 'transport-ready' });
    channel.port2.postMessage({ kind: 'stale' }); await new Promise(done => setTimeout(done, 20));
    expect(received).toEqual([{ kind: 'transport-ready' }]);
  } finally { channel.port1.close(); channel.port2.close(); }
});
```

`tests/pageTransport.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createPageTransport } from '../src/network/transport/pageTransport';
import { SESSION_PROTOCOL_VERSION } from '../src/shared/netSession';
import type { RtcAttemptOptions } from '../src/shared/rtcSession';
import type { Link } from '../src/renderer/src/net/contracts';
import type { RtcPeerOptions } from '../src/network/rtc/peer';

const identity = { modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
const config = (attemptId: string): RtcAttemptOptions => ({ attemptId, role: 'offerer', identity: { ...identity, protocolVersion: 2, layoutHash: '1234abcd', runId: 'run',
  roomId: 'room', seatGeneration: 1, localConnectionId: 'host', remoteConnectionId: attemptId }, localTicket: 'local', expectedRemoteTicket: 'remote',
  ticketExpiresAtEpochMs: Date.now() + 20000, iceServers: [] });
function link(cap = 16088): Link {
  const closes = new Set<(reason: string) => void>();
  return { peer: 'remote', caps: { unreliable: true, maxDatagram: cap, p2p: true, hidesPeerIp: false }, send: vi.fn(),
    stats: () => ({ rttMs: 0, lossPct: 0, bufferedBytes: 0, relayed: false }), onMessage: () => () => {},
    onClose(cb) { closes.add(cb); return () => { closes.delete(cb); }; }, close: vi.fn((reason: string) => { for (const cb of [...closes]) cb(reason); }) };
}
function harness() {
  const peers: { options: RtcPeerOptions; resolve(link: Link): void }[] = [];
  const transport = createPageTransport(identity, { createPeer(options) {
    let resolve!: (value: Link) => void; const ready = new Promise<Link>(done => { resolve = done; });
    peers.push({ options, resolve });
    return { ready, close: vi.fn(), receiveSignal: vi.fn(async () => {}), diagnostics: () => ({ rttMs: 0, lossPct: 0, bufferedBytes: 0, relayed: false }) };
  } });
  return { transport, peers };
}
describe('page transport: the RTC owner and controller in one page (web build spec §3)', () => {
  it('runs an attempt from start to ready across the in-page request protocol', async () => {
    const h = harness(), channel = new MessageChannel();
    const ready = h.transport.controller.startAttempt(config('a'), channel.port1);
    await vi.waitFor(() => expect(h.peers).toHaveLength(1));
    h.peers[0]!.resolve(link());
    await expect(ready).resolves.toEqual({ latestPayloadLimit: 16088 });
    h.transport.dispose(); channel.port2.close();
  });
  it('answers the Worker transport port with transport-ready, and only one port', async () => {
    const h = harness(), channel = new MessageChannel(), second = new MessageChannel();
    const received = new Promise(resolve => { channel.port2.addEventListener('message', event => resolve((event as MessageEvent).data), { once: true }); channel.port2.start(); });
    h.transport.connect(channel.port1);
    expect(await received).toEqual({ kind: 'transport-ready', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity });
    expect(() => h.transport.connect(second.port1)).toThrow('transport-unavailable');
    h.transport.dispose(); channel.port2.close(); second.port2.close();
  });
  it('reports a public controller disposal as one exit and an owner disposal as none', async () => {
    const a = harness(), lost = vi.fn(); a.transport.onExit(lost);
    await a.transport.controller.dispose(); await a.transport.controller.dispose(); expect(lost).toHaveBeenCalledOnce();
    const b = harness(), quiet = vi.fn(), late = new MessageChannel(); b.transport.onExit(quiet); b.transport.dispose();
    expect(quiet).not.toHaveBeenCalled();
    await expect(b.transport.controller.startAttempt(config('late'), late.port1)).rejects.toThrow('rtc-disposed'); late.port2.close();
  });
});
```

Run: `npx vitest run tests/platformPort.test.ts tests/pageTransport.test.ts`
Expected: FAIL (`webPortEndpoint` is not exported; `pageTransport` module not found).

- [ ] **Step 2: Add the web port endpoint**

Append to `src/network/platformPort.ts`:

```ts
/** The browser counterpart of emitterPortEndpoint (web build spec §3.2): a DOM MessagePort delivers MessageEvent.data. */
export function webPortEndpoint(port: MessagePort): PortEndpoint {
  return {
    postMessage: data => port.postMessage(data), start: () => port.start(), close: () => port.close(),
    onMessage(callback) { const receive = (event: MessageEvent) => callback(event.data); port.addEventListener('message', receive); return () => port.removeEventListener('message', receive); },
    onClose(callback) {
      port.addEventListener('messageerror', callback); port.addEventListener('close', callback);
      return () => { port.removeEventListener('messageerror', callback); port.removeEventListener('close', callback); };
    }
  };
}
```

In `src/network/transport/bridge.ts`, replace the `export function browserPortEndpoint(port: MessagePort): PortEndpoint { … }` block (lines 6-15) with:

```ts
import { webPortEndpoint } from '../platformPort';
/** The game's port adapter (renderer app/onlineSession.ts) and the controller's: one browser endpoint. */
export const browserPortEndpoint = webPortEndpoint;
/** Answer the host Worker's transport port (web build spec §3.2): the page-side half of the Worker owner's readiness. */
export function connectTransportPort(port: MessagePort, identity: HostIdentity): void {
  port.addEventListener('messageerror', () => port.close());
  port.start();
  port.postMessage({ kind: 'transport-ready', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity });
}
```

and drop `type PortEndpoint` from its `netSession` import if TypeScript reports it unused (it is still used by nothing else in the file). `installTransportBridge` and `startTransportBridge` stay until Task 7 deletes the hidden page.

- [ ] **Step 3: Move the RTC owner**

```bash
cp src/main/network/rtcTransport.ts src/network/transport/owner.ts
sed -i '134,155d' src/network/transport/owner.ts
sed -i '1,18d' src/network/transport/owner.ts
sed -i 's/MessagePortMain/MessagePort/g' src/network/transport/owner.ts
head -3 src/network/transport/owner.ts
```

Expected first line: `export interface RtcTransportWire {`. (Lines 134-155 were the blank line, the hidden-window comment and `startGuestTransport`; lines 1-18 were the Electron import and the interfaces now in `contracts.ts`.)

With the Edit tool, replace that first line `export interface RtcTransportWire {` with:

```ts
import { matchesIdentity, type HostIdentity } from '../../shared/hostProcessProtocol';
import { isRtcAttemptOptions, isRtcResponse, isRtcSignal, RTC_MAX_ATTEMPTS, RTC_OWNER_ATTEMPT_LIMIT, RTC_SETUP_MS,
  type RtcAttemptOptions, type RtcRequest, type RtcSignal } from '../../shared/rtcSession';
import type { RtcLinkStats, TransportController } from './contracts';

type Unsubscribe = () => void;
export type { RtcAttemptOptions, RtcLinkStats, TransportController } from './contracts';
export interface RtcTransportWire {
```

and replace the comment `/** Main owns IDs, generations, lifetime bounds and trusted configuration. No renderer-facing API. */` with `/** The page owner of IDs, generations, lifetime bounds and trusted configuration (web build spec §3). No UI-facing API. */`.

- [ ] **Step 4: Write the page transport**

`src/network/transport/pageTransport.ts`:

```ts
import type { HostIdentity } from '../../shared/hostProcessProtocol';
import type { RtcRequest } from '../../shared/rtcSession';
import { webPortEndpoint } from '../platformPort';
import { connectTransportPort } from './bridge';
import { createTransportController, type HiddenControllerOptions } from './controller';
import type { TransportController } from './contracts';
import { createRtcTransport } from './owner';

type Unsubscribe = () => void;
export type PageTransportOptions = Omit<HiddenControllerOptions, 'identity' | 'respond'>;
export interface PageTransport {
  controller: TransportController;
  /** Answer the host Worker's transport port with transport-ready (web build spec §3.2). One port per transport. */
  connect(port: MessagePort): void;
  /** Fires once when the controller's user disposes it (a transport loss for its owner), never on owner disposal. */
  onExit(callback: () => void): Unsubscribe;
  dispose(): void;
}
/** The RTC owner and the RTC controller in one page (web build spec §3): the request/response protocol the hidden
 *  window carried over IPC now crosses a microtask, so both sides keep their validation and their tests. */
export function createPageTransport(identity: HostIdentity, options: PageTransportOptions = {}): PageTransport {
  const responses = new Set<(message: unknown) => void>(), exits = new Set<() => void>();
  let disposed = false, connected: MessagePort | undefined;
  const hidden = createTransportController({ ...options, identity, respond(message) {
    const copy = structuredClone(message);
    queueMicrotask(() => { if (!disposed) for (const callback of [...responses]) { try { callback(copy); } catch { /* the owner isolates */ } } });
  } });
  const controller = createRtcTransport(identity, {
    send(message: RtcRequest, ports: MessagePort[] = []) {
      if (disposed) throw Error('transport-unavailable');
      const copy = structuredClone(message);
      queueMicrotask(() => {
        if (disposed) { for (const port of ports) { try { port.close(); } catch { /* detached */ } } return; }
        hidden.receive(copy, ports.map(webPortEndpoint));
      });
    },
    onResponse(callback) { responses.add(callback); return () => { responses.delete(callback); }; },
    dispose() {
      // Public controller disposal is a transport exit for its owner; owner disposal sets disposed first.
      if (!disposed) for (const callback of [...exits]) { try { callback(); } catch { /* isolate owners */ } }
      dispose();
    }
  });
  function dispose(): void {
    if (disposed) return; disposed = true;
    void controller.dispose(); hidden.dispose(); responses.clear(); exits.clear();
    try { connected?.close(); } catch { /* already detached */ }
  }
  return {
    controller,
    connect(port) {
      if (disposed || connected) { try { port.close(); } catch { /* detached */ } throw Error('transport-unavailable'); }
      connected = port; connectTransportPort(port, identity);
    },
    onExit(callback) { if (disposed) return () => {}; exits.add(callback); return () => { exits.delete(callback); }; },
    dispose
  };
}
```

- [ ] **Step 5: Point the owner tests at the moved owner**

```bash
sed -i "s#'\.\./src/main/network/rtcTransport'#'../src/network/transport/owner'#" tests/rtcTransportOwner.test.ts tests/linkStats.test.ts
```

- [ ] **Step 6: Run the transport suites and typecheck**

Run: `npx vitest run tests/platformPort.test.ts tests/pageTransport.test.ts tests/rtcTransportOwner.test.ts tests/rtcBridge.test.ts tests/linkStats.test.ts tests/pageBoundary.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/network/platformPort.ts src/network/transport/bridge.ts src/network/transport/owner.ts src/network/transport/pageTransport.ts \
  tests/platformPort.test.ts tests/pageTransport.test.ts tests/rtcTransportOwner.test.ts tests/linkStats.test.ts
git commit -m "feat(web-i): page transport (RTC owner and controller in one page) and the web port endpoint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The host Worker and its owner (spec §3.2, deviation D-4)

**Files:**
- Create: `src/worker/authorityModes.ts`, `src/worker/authorityWorkerMain.ts`, `src/worker/authorityWorker.ts`, `src/network/host/workerHost.ts`
- Create: `tests/authorityWorker.test.ts`, `tests/workerHost.test.ts` (the port of `tests/hostProcess.test.ts`, which Task 7 deletes)
- Modify: `tests/duelMode.test.ts:12,141-143`, `tsconfig.web.json` (include `src/worker/**/*`), `tests/pageBoundary.test.ts` (`PAGE_ROOTS` gains `src/worker`), `tests/uiBoundary.test.ts:20` (`NO_UI_LIB_ROOTS` gains `src/worker`)

**Interfaces:**
- Consumes: `HostProcessHandle`, `HostProcessOptions` (Task 3); `createPageTransport`, `PageTransport`, `PageTransportOptions`, `webPortEndpoint` (Task 4); `createUtilityHost` (`src/network/utilityHost.ts`, unchanged); `randomHex` (Task 2).
- Produces:
  - `src/worker/authorityWorkerMain.ts`: `interface AuthorityWorkerScope { postMessage(message: unknown): void; addEventListener(type: 'message', listener: (event: MessageEvent) => void): void }`; `startAuthorityWorker(scope, contentDigest)` returning the `createUtilityHost` owner.
  - `src/network/host/workerHost.ts`:
    - `interface HostWorker { postMessage(message: unknown, transfer?: MessagePort[]): void; onMessage(cb: (message: any) => void): Unsubscribe; onExit(cb: () => void): Unsubscribe; kill(): void }`
    - `interface HostPlatform { spawn(): HostWorker; createTransport(identity: HostIdentity): Pick<PageTransport, 'controller' | 'connect' | 'onExit' | 'dispose'>; createChannel(): { port1: MessagePort; port2: MessagePort }; onSuspend(cb: () => void): Unsubscribe; onResume?(cb: () => void): Unsubscribe }`
    - `interface WorkerLike { postMessage(message: unknown, transfer: Transferable[]): void; terminate(): void; addEventListener(type: string, listener: (event: any) => void): void; removeEventListener(type: string, listener: (event: any) => void): void }`
    - `defaultAuthorityWorker(): WorkerLike`, `spawnHostWorker(create?: () => WorkerLike): HostWorker`, `createWorkerHostPlatform(options: { lifecycle: { onSuspend(cb: () => void): Unsubscribe; onResume(cb: () => void): Unsubscribe }; createWorker?: () => WorkerLike; transport?: PageTransportOptions }): HostPlatform`, `startWorkerHost(options: HostProcessOptions, platform: HostPlatform): Promise<HostProcessHandle>`
  - Exit reasons: `worker-exit` (was `utility-exit`), `worker-protocol-failure` (was `utility-protocol-failure`); `transport-exit`, `ready-timeout`, `request-timeout`, `transfer-failed`, `protocol-failure`, `incompatible-ready`, `authority-crash`, `cancelled`, `disposed`, `initialize-failed`, `suspend-failed`, `resume-failed`, `system-suspend` unchanged.

- [ ] **Step 1: Write the failing Worker-entry test**

`tests/authorityWorker.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAuthorityWorker } from '../src/worker/authorityWorkerMain';
import { duelMode } from '../src/network/modes/duel';
import { SESSION_PROTOCOL_VERSION } from '../src/shared/netSession';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const off of cleanups.splice(0)) off(); });
const identity = { modeId: 'duel', schemaVersion: duelMode.schemaVersion, simVersion: duelMode.simVersion, contentDigest: __GAMEPLAY_CONTENT_DIGEST__, hostGeneration: 1 };
function worker() {
  const posted: any[] = []; let listener: ((event: MessageEvent) => void) | undefined;
  const owner = startAuthorityWorker({ postMessage: message => posted.push(message), addEventListener: (_type, l) => { listener = l; } }, __GAMEPLAY_CONTENT_DIGEST__);
  cleanups.push(() => owner.dispose());
  return { posted, send: (data: unknown, ports: unknown[] = []) => listener!({ data, ports } as unknown as MessageEvent) };
}
describe('the host Worker entry (web build spec §3.2)', () => {
  it('initializes from the authority modes and answers the transport handshake over a real MessageChannel', async () => {
    const w = worker(); w.send({ kind: 'initialize', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity });
    expect(w.posted.at(-1)).toMatchObject({ kind: 'ready', modeId: 'duel', hostGeneration: 1 });
    const channel = new MessageChannel(); cleanups.push(() => channel.port2.close());
    w.send({ kind: 'transport', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity }, [channel.port1]);
    channel.port2.postMessage({ kind: 'transport-ready', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity });
    await vi.waitFor(() => expect(w.posted.at(-1)).toEqual({ kind: 'transport-ready', hostGeneration: 1 }));
  });
  it('refuses a build with another content digest', () => {
    const w = worker(); w.send({ kind: 'initialize', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity, contentDigest: 'f'.repeat(64) });
    expect(w.posted.at(-1)).toMatchObject({ kind: 'fatal', reason: 'incompatible-identity' });
  });
  it('asks for its first lease renewal with a random 32-hex nonce', () => {
    const w = worker(), sessionLease = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 1, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) };
    w.send({ kind: 'initialize', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity, sessionLease });
    const request = w.posted.find(m => m.kind === 'lease-request');
    expect(request.request).toMatchObject(sessionLease); expect(request.request.nonce).toMatch(/^[0-9a-f]{32}$/);
  });
});
```

Run: `npx vitest run tests/authorityWorker.test.ts`
Expected: FAIL, `src/worker/authorityWorkerMain` not found.

- [ ] **Step 2: Write the Worker entry**

```bash
mkdir -p src/worker && cp src/utility/authorityModes.ts src/worker/authorityModes.ts
```

In `src/worker/authorityModes.ts`, replace the first two comment lines with:

```ts
// The modes the host Worker registers (engine refactor spec §6; web build spec §3.2): the sector and the duel.
// authorityWorkerMain.ts builds its host from exactly this registry, so a test can drive the same one.
```

`src/worker/authorityWorkerMain.ts`:

```ts
// The host's simulation in a dedicated Web Worker (web build spec §3.2): the generic control plane the Electron utility
// ran, over browser MessagePorts. The page terminates the Worker; nothing here exits a process.
import { createUtilityHost } from '../network/utilityHost';
import { webPortEndpoint } from '../network/platformPort';
import { randomHex } from '../network/random';
import { authorityModes } from './authorityModes';

export interface AuthorityWorkerScope {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}
export function startAuthorityWorker(scope: AuthorityWorkerScope, contentDigest: string) {
  const owner = createUtilityHost(authorityModes, {
    contentDigest, clock: { nowMs: () => performance.now() },
    leaseClock: { nowMs: () => performance.now(), epochMs: () => Date.now() }, nonce: () => randomHex(16),
    scheduler: { schedule(delayMs, callback) { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); } },
    onCrash() { /* the generic controller owns bounded crash forwarding and disposal */ }
  }, message => scope.postMessage(message));
  scope.addEventListener('message', event => owner.receive(event.data, Array.from(event.ports, port => webPortEndpoint(port))));
  return owner;
}
```

`src/worker/authorityWorker.ts`:

```ts
// The host Worker's entry (web build spec §3.2), built as out/renderer/assets/authorityWorker.js.
import { startAuthorityWorker, type AuthorityWorkerScope } from './authorityWorkerMain';

declare const __GAMEPLAY_CONTENT_DIGEST__: string;
startAuthorityWorker(self as unknown as AuthorityWorkerScope, __GAMEPLAY_CONTENT_DIGEST__);
```

Add `"src/worker/**/*"` to `tsconfig.web.json`'s `include` (after `"src/utility/**/*"`). In `tests/duelMode.test.ts`: change line 12 to `import { authorityModes } from '../src/worker/authorityModes';`; replace the assertion `expect(readFileSync('src/utility/authorityHost.ts', 'utf8')).toMatch(/createUtilityHost(authorityModes, {/);` (currently line 143) with `expect(readFileSync('src/worker/authorityWorkerMain.ts', 'utf8')).toMatch(/createUtilityHost(authorityModes, {/);`; and replace the two comment lines above it (141-142, starting `// authorityHost.ts is the utility's Electron entry point`) with `// authorityWorkerMain.ts is the host Worker's entry body (web build spec §3.2); the test drives the registry it is` and `// built from, and checks that it is built from exactly that registry.`. Add `'src/worker'` to `PAGE_ROOTS` in `tests/pageBoundary.test.ts` and to `NO_UI_LIB_ROOTS` in `tests/uiBoundary.test.ts:20`.

Run: `npx vitest run tests/authorityWorker.test.ts tests/duelMode.test.ts tests/pageBoundary.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing owner tests**

`tests/workerHost.test.ts` (the port of `tests/hostProcess.test.ts`: the same cases on the Worker owner; window readiness is gone, so the bridge transfer happens as soon as the Worker is ready):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawnHostWorker, startWorkerHost, type HostPlatform } from '../src/network/host/workerHost';

const identity = { modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
class Port { closed = false; close() { this.closed = true; } }
function harness() {
  const worker = new EventEmitter(), transport = new EventEmitter(), suspend = new EventEmitter();
  const sent: any[] = [], ports: Port[] = [], connected: unknown[] = [];
  let killed = 0, transportDisposed = 0, failTransfer = false, failConnect = false;
  const platform: HostPlatform = {
    spawn: () => ({ postMessage(message, transfer) { if (failTransfer && transfer?.length) throw Error('transfer'); sent.push(message); },
      onMessage(cb) { worker.on('message', cb); return () => worker.off('message', cb); },
      onExit(cb) { worker.on('exit', cb); return () => worker.off('exit', cb); }, kill() { killed++; } }),
    createTransport: () => ({ controller: { startAttempt: vi.fn(), receiveSignal: vi.fn(), onSignal: vi.fn(), onAttemptClosed: vi.fn(), closeAttempt: vi.fn(), dispose: vi.fn() } as never,
      connect(port) { if (failTransfer || failConnect) throw Error('transfer'); connected.push(port); },
      onExit(cb) { transport.on('exit', cb); return () => transport.off('exit', cb); }, dispose() { transportDisposed++; } }),
    createChannel: () => { const a = new Port(), b = new Port(); ports.push(a, b); return { port1: a, port2: b } as never; },
    onSuspend(cb) { suspend.on('suspend', cb); return () => suspend.off('suspend', cb); },
    onResume(cb) { suspend.on('resume', cb); return () => suspend.off('resume', cb); }
  };
  const ready = async (overrides = {}) => {
    await Promise.resolve(); await Promise.resolve();
    worker.emit('message', { kind: 'ready', protocolVersion: 2, ...identity, ...overrides });
    await Promise.resolve();
    worker.emit('message', { kind: 'transport-ready', hostGeneration: 7 });
  };
  const response = (requestId: number | null, overrides = {}) => worker.emit('message', { kind: 'response', response: { requestId, hostGeneration: 7, ok: true, ...overrides } });
  return { platform, sent, ports, connected, ready, response, worker, transport, suspend,
    failTransfer() { failTransfer = true; }, failConnect() { failConnect = true; }, counts: () => [killed, transportDisposed] };
}
afterEach(() => vi.useRealTimers());
describe('the host Worker owner (web build spec §3.2)', () => {
  it('deduplicates private capture delivery, copies observer bytes and acknowledges only adopted IDs', async () => {
    const h = harness(), starting = startWorkerHost(identity, h.platform); await h.ready(); const owner = await starting;
    const candidate = { captureId: 1, capturedTick: 0, controlRevision: 0, cause: 'initial', bytes: new Uint8Array([4]) };
    h.worker.emit('message', { kind: 'checkpoint', hostGeneration: 7, candidate });
    const seen: any[] = []; owner.onCheckpoint(c => { seen.push(c); c.bytes[0] = 99; });
    const requested = owner.captureCheckpoint('exit');
    const exit = { ...candidate, captureId: 2, cause: 'exit' };
    h.worker.emit('message', { kind: 'checkpoint', hostGeneration: 7, candidate: exit });
    h.worker.emit('message', { kind: 'captured', requestId: 1, hostGeneration: 7, ok: true, candidate: exit });
    expect((await requested).bytes).toEqual(new Uint8Array([4]));
    expect(seen.map(c => c.captureId)).toEqual([1, 2]);
    const late: any[] = []; owner.onCheckpoint(c => late.push(c)); expect(late[0].bytes).toEqual(new Uint8Array([4]));
    await expect(owner.ackCheckpoint(3)).rejects.toThrow('capture-unavailable');
    const ack = owner.ackCheckpoint(2); expect(h.sent.at(-1)).toMatchObject({ kind: 'ack-checkpoint', captureId: 2 }); h.response(2); await ack;
    const disposing = owner.dispose(); h.response(3); await disposing;
  });
  it.each([{ bytes: new Uint8Array(262145) }, { captureId: 0 }, { cause: 'unknown' }, { capturedTick: -1 }, { extra: true }])('rejects malformed private capture %j', bad => {
    const h = harness(), starting = startWorkerHost(identity, h.platform);
    const rejected = expect(starting).rejects.toThrow('protocol-failure');
    h.worker.emit('message', { kind: 'checkpoint', hostGeneration: 7, candidate: { captureId: 1, capturedTick: 0, controlRevision: 0, cause: 'initial', bytes: new Uint8Array([4]), ...bad } });
    return rejected;
  });
  it('invalidates leased capability on both trusted suspend and resume and removes observers', async () => {
    const h = harness(), sessionLease = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 7, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) };
    const starting = startWorkerHost({ ...identity, sessionLease }, h.platform); await h.ready(); const owner = await starting;
    h.suspend.emit('suspend'); expect(h.sent.at(-1)).toMatchObject({ kind: 'lease-invalidate', reason: 'suspended' }); h.response(1);
    h.suspend.emit('resume'); expect(h.sent.at(-1)).toMatchObject({ kind: 'lease-invalidate', reason: 'resumed' }); h.response(2);
    const disposing = owner.dispose(); h.response(3); await disposing; expect(h.suspend.eventNames()).toEqual([]);
  });
  it('retains only the latest renewal before readiness and retires stale replies locally', async () => {
    const h = harness(), sessionLease = { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 7, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) };
    const p = startWorkerHost({ ...identity, sessionLease }, h.platform);
    const first = { ...sessionLease, nonce: 'd'.repeat(32) }, second = { ...sessionLease, nonce: 'e'.repeat(32) };
    h.worker.emit('message', { kind: 'lease-request', hostGeneration: 7, request: first });
    h.worker.emit('message', { kind: 'lease-request', hostGeneration: 7, request: second });
    await h.ready(); const owner = await p, requests: unknown[] = []; owner.onLeaseRequest(r => requests.push(r));
    expect(requests).toEqual([second]);
    const grant = { roomId: sessionLease.roomId, hostGeneration: 7, hostSeatId: 0, nonce: first.nonce, expiresAtEpochMs: 15000 };
    await expect(owner.applyLease(first, grant)).rejects.toThrow('stale-lease');
    const applying = owner.applyLease(second, { ...grant, nonce: second.nonce }); expect(h.sent.at(-1).kind).toBe('lease-grant'); h.response(1); await applying;
    const completing = owner.completeBootstrap(); expect(h.sent.at(-1).kind).toBe('bootstrap-complete'); h.response(2); await completing;
    const disposing = owner.dispose(); h.response(3); await disposing;
  });
  it('forwards trusted streaming and actual RTC cap while rejecting missing caps before transfer', async () => {
    const h = harness(), starting = startWorkerHost(identity, h.platform); await h.ready(); const owner = await starting;
    const bad = new Port(); await expect(owner.attachPeer('p', [0], bad as never, { streamed: true })).rejects.toThrow('invalid-peer'); expect(bad.closed).toBe(true);
    const offered = new Port(), attaching = owner.attachPeer('p', [0], offered as never, { streamed: true, latestPayloadLimit: 4096 });
    expect(h.sent.at(-1)).toMatchObject({ kind: 'attach', options: { streamed: true, latestPayloadLimit: 4096 } });
    h.worker.emit('message', { kind: 'attached', requestId: 1, hostGeneration: 7, ok: true }); await attaching;
    const disposing = owner.dispose(); h.response(2); await disposing;
  });
  it('stamps only owner IDs, rejects caller stamps and resolves bounded response bytes', async () => {
    const h = harness(), starting = startWorkerHost(identity, h.platform); await h.ready(); const owner = await starting;
    await expect(owner.request({ kind: 'checkpoint', requestId: 99 } as never)).rejects.toThrow('invalid-command');
    const pending = owner.request({ kind: 'checkpoint' });
    expect(h.sent.at(-1).command).toEqual({ kind: 'checkpoint', requestId: 1, hostGeneration: 7 });
    h.response(1, { checkpointBytes: new Uint8Array([4]) }); expect((await pending).ok).toBe(true);
    const disposing = owner.dispose(); h.response(2); await disposing; expect(h.counts()).toEqual([1, 1]);
    await owner.dispose(); await expect(owner.request({ kind: 'checkpoint' })).rejects.toThrow('disposed');
  });
  it.each([{ protocolVersion: 1 }, { modeId: 'wrong' }, { contentDigest: 'b'.repeat(64) }])('rejects incompatible ready identity %j', async bad => {
    const h = harness(), pending = startWorkerHost(identity, h.platform); const rejected = expect(pending).rejects.toThrow('incompatible-ready');
    await h.ready(bad); await rejected; expect(h.counts()).toEqual([1, 1]);
  });
  it('times out startup after five seconds and cancels startup without leaking resources', async () => {
    vi.useFakeTimers(); const h = harness(), pending = startWorkerHost(identity, h.platform);
    const rejected = expect(pending).rejects.toThrow('ready-timeout'); await vi.advanceTimersByTimeAsync(5000); await rejected;
    expect(h.counts()).toEqual([1, 1]);
    const abort = new AbortController(), h2 = harness(), p2 = startWorkerHost({ ...identity, signal: abort.signal }, h2.platform);
    const cancelled = expect(p2).rejects.toThrow('cancelled'); abort.abort(); await cancelled; expect(h2.counts()).toEqual([1, 1]);
  });
  it.each(['worker', 'transport'] as const)('rejects pending once and disposes its pair on %s exit', async source => {
    const h = harness(), p = startWorkerHost(identity, h.platform); await h.ready(); const owner = await p;
    const reasons: string[] = []; owner.onExit(reason => reasons.push(reason));
    const request = owner.request({ kind: 'checkpoint' }); const rejected = expect(request).rejects.toThrow(`${source}-exit`);
    h[source].emit('exit'); h[source].emit('exit'); await rejected; expect(reasons).toEqual([`${source}-exit`]); expect(h.counts()).toEqual([1, 1]);
  });
  it('closes both half-transferred ports on connection failure', async () => {
    const h = harness(); h.failTransfer(); const p = startWorkerHost(identity, h.platform), rejected = expect(p).rejects.toThrow('transfer-failed');
    await h.ready(); await rejected; expect(h.ports.every(port => port.closed)).toBe(true); expect(h.counts()).toEqual([1, 1]);
  });
  it('closes the untransferred half when the page transport refuses the port', async () => {
    const h = harness(); h.failConnect(); const p = startWorkerHost(identity, h.platform), rejected = expect(p).rejects.toThrow('transfer-failed');
    await h.ready(); await rejected; expect(h.ports[1]!.closed).toBe(true); expect(h.counts()).toEqual([1, 1]);
  });
  it('transfers the transport port once the Worker is ready and resolves only on its validated transport-ready', async () => {
    const h = harness(), p = startWorkerHost(identity, h.platform); let settled = false; void p.then(() => { settled = true; });
    h.worker.emit('message', { kind: 'transport-ready', hostGeneration: 7 }); expect(h.ports).toHaveLength(0);
    h.worker.emit('message', { kind: 'ready', protocolVersion: 2, ...identity });
    expect(h.ports).toHaveLength(2); expect(h.sent.at(-1)).toMatchObject({ kind: 'transport', protocolVersion: 2, ...identity }); expect(h.connected).toEqual([h.ports[1]]);
    await Promise.resolve(); expect(settled).toBe(false);
    h.worker.emit('message', { kind: 'transport-ready', hostGeneration: 6 }); await Promise.resolve(); expect(settled).toBe(false);
    h.worker.emit('message', { kind: 'transport-ready', hostGeneration: 7 });
    const owner = await p, dispose = owner.dispose(); h.response(1); await dispose;
  });
  it('ignores stale generations but fails duplicate and uncorrelated responses', async () => {
    for (const invalid of ['duplicate', 'null']) {
      const h = harness(), p = startWorkerHost(identity, h.platform); await h.ready(); const owner = await p;
      const request = owner.request({ kind: 'checkpoint' }); h.response(1, { hostGeneration: 6 });
      h.response(1); await request;
      const next = owner.request({ kind: 'checkpoint' }); const rejected = expect(next).rejects.toThrow('protocol-failure');
      h.response(invalid === 'null' ? null : 1); await rejected; expect(h.counts()).toEqual([1, 1]);
    }
  });
  it('bounds request timeout and disposal even when the Worker is unresponsive', async () => {
    vi.useFakeTimers(); const h = harness(), p = startWorkerHost(identity, h.platform); await h.ready(); const owner = await p;
    const request = owner.request({ kind: 'checkpoint' }), rejected = expect(request).rejects.toThrow('request-timeout');
    await vi.advanceTimersByTimeAsync(5000); await rejected; await owner.dispose(); expect(h.counts()).toEqual([1, 1]);
    const h2 = harness(), p2 = startWorkerHost(identity, h2.platform); await h2.ready(); const owner2 = await p2;
    const dispose = owner2.dispose(); await vi.advanceTimersByTimeAsync(250); await dispose; expect(h2.counts()).toEqual([1, 1]);
  });
  it('suspends with a trusted pause and keeps resume paused', async () => {
    const h = harness(), p = startWorkerHost(identity, h.platform); await h.ready(); const owner = await p;
    h.suspend.emit('suspend'); expect(h.sent.at(-1).command).toMatchObject({ kind: 'pause', reason: 'system-suspend' });
    h.response(1); h.suspend.emit('resume'); expect(h.sent).toHaveLength(3);
    const dispose = owner.dispose(); h.response(2); await dispose;
  });
  it('owns transferred peer ports and rejects invalid or failed attachments', async () => {
    const h = harness(), p = startWorkerHost(identity, h.platform); await h.ready(); const owner = await p;
    const bad = new Port(); await expect(owner.attachPeer('', [0], bad as never)).rejects.toThrow('invalid-peer'); expect(bad.closed).toBe(true);
    const port = new Port(), attaching = owner.attachPeer('host', [0], port as never);
    h.worker.emit('message', { kind: 'attached', requestId: 1, hostGeneration: 7, ok: true }); await attaching;
    h.failTransfer(); const failed = new Port(); await expect(owner.attachPeer('other', [0], failed as never)).rejects.toThrow('transfer-failed');
    expect(failed.closed).toBe(true); expect(h.counts()).toEqual([1, 1]);
  });
  it('forwards bounded opaque crash records and cleans up even when the observer throws', async () => {
    const h = harness(), records: unknown[] = [];
    const p = startWorkerHost({ ...identity, onCrash(record) { records.push(record); throw Error('observer'); } }, h.platform);
    await h.ready(); const owner = await p;
    const request = owner.request({ kind: 'checkpoint' }), rejected = expect(request).rejects.toThrow('authority-crash');
    h.worker.emit('message', { kind: 'crash', hostGeneration: 7, record: { checkpoint: new Uint8Array([8]), diagnostic: { modeFault: 4 } } });
    await rejected; expect(records).toEqual([{ checkpoint: new Uint8Array([8]), diagnostic: { modeFault: 4 } }]); expect(h.counts()).toEqual([1, 1]);
  });
  it('reports a Worker fatal as a protocol failure of the Worker', async () => {
    const h = harness(), p = startWorkerHost(identity, h.platform); await h.ready(); const owner = await p, reasons: string[] = [];
    owner.onExit(reason => reasons.push(reason)); h.worker.emit('message', { kind: 'fatal', hostGeneration: 7, reason: 'invalid-message' });
    expect(reasons).toEqual(['worker-protocol-failure']); expect(h.counts()).toEqual([1, 1]);
  });
});
describe('the Worker spawn adapter (web build spec §3.2)', () => {
  class FakeWorker extends EventTarget { posted: unknown[][] = []; terminated = 0; postMessage(m: unknown, t: Transferable[]) { this.posted.push([m, t]); } terminate() { this.terminated++; } }
  it('forwards message data and transfers, and reports one exit after terminate', async () => {
    const native = new FakeWorker(), worker = spawnHostWorker(() => native), seen: unknown[] = [], exits = vi.fn();
    worker.onMessage(m => seen.push(m)); worker.onExit(exits);
    native.dispatchEvent(Object.assign(new Event('message'), { data: { kind: 'ready' } }));
    const channel = new MessageChannel(); worker.postMessage({ kind: 'transport' }, [channel.port1]);
    expect(native.posted[0]).toEqual([{ kind: 'transport' }, [channel.port1]]); expect(seen).toEqual([{ kind: 'ready' }]);
    worker.kill(); worker.kill(); await Promise.resolve();
    expect(native.terminated).toBe(1); expect(exits).toHaveBeenCalledOnce();
    expect(() => worker.postMessage({ kind: 'late' })).toThrow('worker-exited');
    channel.port1.close(); channel.port2.close();
  });
  it('treats a Worker error as an exit, prevents its default report and terminates it', () => {
    const native = new FakeWorker(), worker = spawnHostWorker(() => native), exits = vi.fn(); worker.onExit(exits);
    const error = new Event('error', { cancelable: true }); native.dispatchEvent(error);
    expect(error.defaultPrevented).toBe(true); expect(native.terminated).toBe(1); expect(exits).toHaveBeenCalledOnce();
    const late = vi.fn(); worker.onExit(late); expect(late).toHaveBeenCalledOnce();
  });
});
```

Run: `npx vitest run tests/workerHost.test.ts`
Expected: FAIL, `src/network/host/workerHost` not found.

- [ ] **Step 4: Write the Worker owner**

`src/network/host/workerHost.ts`:

```ts
import { boundedHostBytes, isHostCommand, positiveSafeInteger, SESSION_PROTOCOL_VERSION, type HostCommandInput, type HostResponse } from '../../shared/netSession';
import { isHostIdentity, isHostResponse, isCheckpointDelivery, matchesIdentity, matchesSessionLease, isLeaseFenceReason, validPeer, validStreamAttachmentOptions,
  type HostIdentity } from '../../shared/hostProcessProtocol';
import { copyCheckpoint, isCaptureCause, type CheckpointCandidate } from '../../shared/sessionCheckpoint';
import { validateSessionLeaseIdentity, validateLeaseRenewalRequest, type LeaseRenewalRequest } from '../../shared/sessionLease';
import { validateLeaseGrant } from '../../shared/roomSession';
import { createPageTransport, type PageTransport, type PageTransportOptions } from '../transport/pageTransport';
import type { HostProcessHandle, HostProcessOptions } from './contracts';

export type { HostProcessHandle, HostProcessOptions } from './contracts';
type Unsubscribe = () => void;
export interface HostWorker {
  postMessage(message: unknown, transfer?: MessagePort[]): void;
  onMessage(cb: (message: any) => void): Unsubscribe;
  onExit(cb: () => void): Unsubscribe;
  kill(): void;
}
/** Structural platform seam: tests exercise the same owner without a real Worker. */
export interface HostPlatform {
  spawn(): HostWorker;
  createTransport(identity: HostIdentity): Pick<PageTransport, 'controller' | 'connect' | 'onExit' | 'dispose'>;
  createChannel(): { port1: MessagePort; port2: MessagePort };
  onSuspend(cb: () => void): Unsubscribe;
  onResume?(cb: () => void): Unsubscribe;
}
export interface WorkerLike {
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
}
/** The page starts the host's simulation only while hosting (web build spec §3.2). */
export function defaultAuthorityWorker(): WorkerLike {
  return new Worker(new URL('../../worker/authorityWorker.ts', import.meta.url), { type: 'module' });
}
/** onExit fires once: on the Worker's error or messageerror event, or after terminate(). */
export function spawnHostWorker(create: () => WorkerLike = defaultAuthorityWorker): HostWorker {
  const worker = create(), exits = new Set<() => void>();
  let exited = false, killed = false;
  function exit(): void {
    if (exited) return; exited = true;
    worker.removeEventListener('error', failed); worker.removeEventListener('messageerror', failed);
    for (const cb of [...exits]) { try { cb(); } catch { /* isolate owners */ } }
    exits.clear();
  }
  function failed(event: { preventDefault?(): void }): void {
    event.preventDefault?.();
    if (!killed) { killed = true; try { worker.terminate(); } catch { /* already gone */ } }
    exit();
  }
  worker.addEventListener('error', failed); worker.addEventListener('messageerror', failed);
  return {
    postMessage(message, transfer = []) { if (exited) throw Error('worker-exited'); worker.postMessage(message, transfer); },
    onMessage(cb) { const listener = (event: MessageEvent) => { if (!exited) cb(event.data); }; worker.addEventListener('message', listener); return () => worker.removeEventListener('message', listener); },
    onExit(cb) { if (exited) { cb(); return () => {}; } exits.add(cb); return () => { exits.delete(cb); }; },
    // Idempotent: a second kill before the exit microtask has run must not terminate twice.
    kill() { if (exited || killed) return; killed = true; try { worker.terminate(); } catch { /* already gone */ } queueMicrotask(exit); }
  };
}
export function createWorkerHostPlatform(options: { lifecycle: { onSuspend(cb: () => void): Unsubscribe; onResume(cb: () => void): Unsubscribe };
  createWorker?: () => WorkerLike; transport?: PageTransportOptions }): HostPlatform {
  return {
    spawn: () => spawnHostWorker(options.createWorker),
    createTransport: identity => createPageTransport(identity, options.transport),
    createChannel: () => new MessageChannel(),
    onSuspend: cb => options.lifecycle.onSuspend(cb),
    onResume: cb => options.lifecycle.onResume(cb)
  };
}
const close = (port: MessagePort) => { try { port.close(); } catch { /* a transferred endpoint may already be detached */ } };

/** The platform-neutral owner of the host Worker (web build spec §3.2). Readiness has two parts now: the Worker's
 *  ready and the page transport's transport-ready answer over the Worker's transport port. */
export async function startWorkerHost(options: HostProcessOptions, platform: HostPlatform): Promise<HostProcessHandle> {
  if (!isHostIdentity(options)) throw Error('invalid-identity');
  if (options.sessionLease !== undefined && (!validateSessionLeaseIdentity(options.sessionLease)
    || options.sessionLease.hostGeneration !== options.hostGeneration)) throw Error('invalid-lease');
  const sessionLease = options.sessionLease && { ...options.sessionLease };
  if (options.signal?.aborted) throw Error('cancelled');
  const identity: HostIdentity = { modeId: options.modeId, schemaVersion: options.schemaVersion, simVersion: options.simVersion,
    contentDigest: options.contentDigest, hostGeneration: options.hostGeneration };
  const worker = platform.spawn();
  let transport: ReturnType<HostPlatform['createTransport']>;
  try { transport = platform.createTransport(identity); } catch (cause) { worker.kill(); throw cause; }
  let stopped = false, stopping = false, ready = false, workerReady = false, bridgeReady = false, connected = false;
  let nextId = 0, disposal: Promise<void> | undefined, exitReason: string | undefined;
  const removers: Unsubscribe[] = [], exits = new Set<(reason: string) => void>(), ownedPorts = new Set<MessagePort>();
  const renewals = new Set<(request: LeaseRenewalRequest) => void>();
  const checkpoints = new Set<(candidate: CheckpointCandidate) => void>();
  let latestCheckpoint: CheckpointCandidate | undefined;
  function adoptCheckpoint(candidate: CheckpointCandidate): void {
    // Each handle owns one Worker epoch. Requested and push deliveries share IDs.
    if (latestCheckpoint && candidate.captureId <= latestCheckpoint.captureId) return;
    latestCheckpoint = copyCheckpoint(candidate);
    for (const cb of [...checkpoints]) { try { cb(copyCheckpoint(candidate)); } catch { /* isolate observers */ } }
  }
  let renewal: LeaseRenewalRequest | undefined;
  const pending = new Map<number, { kind: 'response' | 'attached' | 'captured'; resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  let resolveReady!: (handle: HostProcessHandle) => void, rejectReady!: (error: Error) => void;
  const starting = new Promise<HostProcessHandle>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const readyTimer = setTimeout(() => stop('ready-timeout'), 5000);
  function stop(reason: string): void {
    if (stopped) return; stopped = true; stopping = true; exitReason = reason;
    clearTimeout(readyTimer);
    renewals.clear(); renewal = undefined;
    checkpoints.clear(); latestCheckpoint = undefined;
    for (const remove of removers.splice(0)) { try { remove(); } catch { /* release remaining owners */ } }
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error(reason)); } pending.clear();
    for (const port of ownedPorts) close(port); ownedPorts.clear();
    try { transport.dispose(); } catch { /* still terminate the Worker */ }
    try { worker.kill(); } catch { /* already exited */ }
    if (!ready) rejectReady(Error(reason));
    for (const callback of [...exits]) { try { callback(reason); } catch { /* isolate observers */ } } exits.clear();
  }
  function checkReady(): void {
    if (!stopped && workerReady && bridgeReady) { ready = true; clearTimeout(readyTimer); resolveReady(handle); }
  }
  function connect(): void {
    if (stopped || connected || !workerReady) return; connected = true;
    try {
      const { port1, port2 } = platform.createChannel(); ownedPorts.add(port1); ownedPorts.add(port2);
      worker.postMessage({ kind: 'transport', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity }, [port1]);
      ownedPorts.delete(port1);
      transport.connect(port2); ownedPorts.delete(port2);
    } catch { stop('transfer-failed'); }
  }
  function send<T>(kind: 'response' | 'attached' | 'captured', message: (id: number) => unknown, ports?: MessagePort[]): Promise<T> {
    if (stopped || (stopping && kind !== 'response')) return Promise.reject(Error('disposed'));
    if (pending.size >= 64 || nextId >= Number.MAX_SAFE_INTEGER) return Promise.reject(Error('request-capacity'));
    const id = ++nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => stop('request-timeout'), 5000);
      pending.set(id, { kind, resolve, reject, timer });
      try { worker.postMessage(message(id), ports); if (ports) for (const port of ports) ownedPorts.delete(port); }
      catch { stop('transfer-failed'); }
    });
  }
  function request(command: HostCommandInput, duringDispose = false): Promise<HostResponse> {
    if (stopped || (stopping && !duringDispose)) return Promise.reject(Error('disposed'));
    // Validate caller payload before allocating a stamp. Runtime JS callers cannot inject IDs.
    if (!command || Object.hasOwn(command, 'requestId') || Object.hasOwn(command, 'hostGeneration')
      || !isHostCommand({ ...command, requestId: 1, hostGeneration: identity.hostGeneration })) return Promise.reject(Error('invalid-command'));
    const copy = command.kind === 'start' ? { ...command, initBytes: new Uint8Array(command.initBytes) }
      : command.kind === 'restore' ? { ...command, checkpointBytes: new Uint8Array(command.checkpointBytes) } : { ...command };
    return send('response', requestId => ({ kind: 'command', command: { ...copy, requestId, hostGeneration: identity.hostGeneration } }));
  }
  const handle: HostProcessHandle = {
    onCheckpoint(callback) {
      if (stopped) return () => {};
      if (checkpoints.size >= 64) throw Error('request-capacity');
      checkpoints.add(callback); if (latestCheckpoint) callback(copyCheckpoint(latestCheckpoint));
      return () => { checkpoints.delete(callback); };
    },
    ackCheckpoint(captureId) {
      if (stopped || stopping || !positiveSafeInteger(captureId) || !latestCheckpoint || captureId > latestCheckpoint.captureId) return Promise.reject(Error('capture-unavailable'));
      return send<HostResponse>('response', requestId => ({ kind: 'ack-checkpoint', requestId, hostGeneration: identity.hostGeneration, captureId }))
        .then(reply => { if (!reply.ok) throw Error('capture-unavailable'); });
    },
    captureCheckpoint(cause) {
      if (stopped || stopping || !isCaptureCause(cause)) return Promise.reject(Error('capture-unavailable'));
      return send('captured', requestId => ({ kind: 'capture-checkpoint', requestId, hostGeneration: identity.hostGeneration, cause }));
    },
    onLeaseRequest(callback) {
      if (stopped || !sessionLease) return () => {};
      if (renewals.size >= 64) throw Error('request-capacity');
      renewals.add(callback); if (renewal) callback({ ...renewal });
      return () => { renewals.delete(callback); };
    },
    applyLease(request, grant) {
      if (!renewal || !validateLeaseRenewalRequest(request) || !validateLeaseGrant(grant)
        || Object.keys(renewal).some(k => request[k as keyof LeaseRenewalRequest] !== renewal![k as keyof LeaseRenewalRequest])) return Promise.reject(Error('stale-lease'));
      renewal = undefined;
      return privateRequest('lease-grant', { request: { ...request }, grant: { ...grant } });
    },
    invalidateLease(reason) {
      if (!isLeaseFenceReason(reason)) return Promise.reject(Error('invalid-lease'));
      renewal = undefined; return privateRequest('lease-invalidate', { sessionLease, reason });
    },
    completeBootstrap() { return privateRequest('bootstrap-complete', { sessionLease }); },
    transport: transport.controller,
    request,
    attachPeer(peer, players, port, options) {
      if (stopped || stopping) { close(port); return Promise.reject(Error('disposed')); }
      if (!validPeer(peer, players) || !validStreamAttachmentOptions(options)) { close(port); return Promise.reject(Error('invalid-peer')); }
      ownedPorts.add(port);
      const result = send<void>('attached', requestId => ({ kind: 'attach', peer, players: [...players], requestId, hostGeneration: identity.hostGeneration,
        ...(options ? { options: { ...options } } : {}) }), [port]);
      // Capacity refusal happens before transfer and must release the offered endpoint.
      return result.catch(error => { if (ownedPorts.delete(port)) close(port); throw error; });
    },
    onExit(callback) {
      if (exitReason) { callback(exitReason); return () => {}; }
      exits.add(callback); return () => { exits.delete(callback); };
    },
    dispose() {
      if (disposal) return disposal;
      if (stopped) return Promise.resolve();
      stopping = true;
      disposal = new Promise<void>(resolve => {
        const timer = setTimeout(() => { stop('disposed'); resolve(); }, 250);
        request({ kind: 'dispose' }, true).catch(() => {}).finally(() => { clearTimeout(timer); stop('disposed'); resolve(); });
      });
      return disposal;
    }
  };
  function privateRequest(kind: string, data: object): Promise<void> {
    if (!sessionLease || stopped || stopping) return Promise.reject(Error('lease-unavailable'));
    return send<HostResponse>('response', requestId => ({ kind, requestId, hostGeneration: identity.hostGeneration, ...data }))
      .then(reply => { if (!reply.ok) throw Error('lease-unavailable'); });
  }
  removers.push(worker.onExit(() => stop('worker-exit')), transport.onExit(() => stop('transport-exit')),
    worker.onMessage(message => {
      if (stopped) return;
      if (!message || typeof message !== 'object') { stop('protocol-failure'); return; }
      const generation = message.kind === 'response' ? message.response?.hostGeneration : message.hostGeneration;
      if (positiveSafeInteger(generation) && generation !== identity.hostGeneration) return;
      if (message.kind === 'checkpoint' || message.kind === 'captured') {
        if (generation !== identity.hostGeneration || !isCheckpointDelivery(message)) { stop('protocol-failure'); return; }
        if (message.kind === 'checkpoint') { adoptCheckpoint(message.candidate); return; }
        const item = pending.get(message.requestId);
        if (!item || item.kind !== 'captured') { stop('protocol-failure'); return; }
        pending.delete(message.requestId); clearTimeout(item.timer);
        if (message.ok) { adoptCheckpoint(message.candidate); item.resolve(copyCheckpoint(message.candidate)); }
        else item.reject(Error('capture-unavailable'));
        return;
      }
      if (message.kind === 'lease-request') {
        const r = message.request;
        if (!sessionLease || !validateLeaseRenewalRequest(r)) { stop('protocol-failure'); return; }
        const { nonce: _nonce, ...leaseIdentity } = r;
        if (!matchesSessionLease(leaseIdentity, sessionLease!) || Object.keys(message).some(k => !['kind', 'hostGeneration', 'request'].includes(k))) { stop('protocol-failure'); return; }
        renewal = { ...r };
        for (const cb of [...renewals]) { try { cb({ ...r }); } catch { /* isolate private observers */ } }
        return;
      }
      if (message.kind === 'ready') {
        if (workerReady || !matchesIdentity(message, identity)) { stop('incompatible-ready'); return; }
        workerReady = true; connect(); checkReady(); return;
      }
      if (message.kind === 'transport-ready' && connected && !bridgeReady && message.hostGeneration === identity.hostGeneration) { bridgeReady = true; checkReady(); return; }
      if (message.kind === 'transport-ready' && !connected) return;
      if (message.kind === 'fatal') { stop('worker-protocol-failure'); return; }
      if (message.kind === 'crash' && message.hostGeneration === identity.hostGeneration) {
        try {
          const record = message.record;
          if (!record || (record.checkpoint !== null && !boundedHostBytes(record.checkpoint))
            || new TextEncoder().encode(JSON.stringify(record.diagnostic)).byteLength > 65536) { stop('protocol-failure'); return; }
          options.onCrash?.({ checkpoint: record.checkpoint === null ? null : new Uint8Array(record.checkpoint), diagnostic: record.diagnostic });
        } catch { /* fault observers cannot prevent teardown */ }
        finally { stop('authority-crash'); }
        return;
      }
      const response = message.kind === 'response' ? message.response : message;
      if ((message.kind !== 'response' && message.kind !== 'attached') || !positiveSafeInteger(response?.requestId)
        || response.hostGeneration !== identity.hostGeneration || (message.kind === 'response' ? !isHostResponse(response) : typeof message.ok !== 'boolean')) {
        stop('protocol-failure'); return;
      }
      const item = pending.get(response.requestId);
      if (!item || item.kind !== message.kind) { stop('protocol-failure'); return; }
      pending.delete(response.requestId); clearTimeout(item.timer);
      if (message.kind === 'attached') { if (message.ok) item.resolve(undefined); else item.reject(Error('peer-unavailable')); }
      else item.resolve(response);
    }), platform.onSuspend(() => {
      if (sessionLease && ready && !stopping) { void handle.invalidateLease('suspended').catch(() => stop('suspend-failed')); return; }
      if (ready && !stopping) void request({ kind: 'pause', reason: 'system-suspend' }).then(response => { if (!response.ok) stop('suspend-failed'); }, () => stop('suspend-failed'));
      else stop('system-suspend');
    }));
  if (platform.onResume) removers.push(platform.onResume(() => {
    if (sessionLease && ready && !stopping) void handle.invalidateLease('resumed').catch(() => stop('resume-failed'));
  }));
  const abort = () => stop('cancelled');
  options.signal?.addEventListener('abort', abort, { once: true });
  removers.push(() => options.signal?.removeEventListener('abort', abort));
  if (options.signal?.aborted) abort();
  if (!stopped) {
    try { worker.postMessage({ kind: 'initialize', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity, ...(sessionLease ? { sessionLease } : {}) }); }
    catch { stop('initialize-failed'); }
  }
  return starting;
}
```

The one behavioural addition over `hostProcess.ts` is the line `if (message.kind === 'transport-ready' && !connected) return;`: a `transport-ready` before the transport port exists is ignored (as the old owner effectively did through its `windowReady` gate) rather than falling through to the protocol-failure branch. The `transfers the transport port once the Worker is ready` case covers it.

- [ ] **Step 5: Run the Worker suites and typecheck**

Run: `npx vitest run tests/workerHost.test.ts tests/authorityWorker.test.ts tests/duelMode.test.ts tests/pageBoundary.test.ts tests/uiBoundary.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/worker/authorityModes.ts src/worker/authorityWorkerMain.ts src/worker/authorityWorker.ts src/network/host/workerHost.ts \
  tests/authorityWorker.test.ts tests/workerHost.test.ts tests/duelMode.test.ts tests/pageBoundary.test.ts tests/uiBoundary.test.ts tsconfig.web.json
git commit -m "feat(web-i): the host Worker entry and its page owner implementing HostProcessHandle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The page session factory, platform and lifecycle (spec §3.1, §3.3)

**Files:**
- Create: `src/network/online/lifecycle.ts`, `src/network/online/pagePlatform.ts`, `src/renderer/src/app/online/pageSession.ts`
- Create: `tests/onlineLifecycle.test.ts`, `tests/pagePlatform.test.ts`, `tests/pageSession.test.ts`
- Modify: `tests/pageBoundary.test.ts` (`PAGE_ROOTS` gains `src/renderer/src/app/online`)

**Interfaces:**
- Consumes: `createOnlineSession`, `OnlineSessionDeps`, `OnlineSessionOwner`, `OnlinePlatform` (Task 3); `createSeatStore`, `createMirrorStore`, `createIndexedDbRecordStore`, `OnlineRecordStore` (Task 2); `validateModeMirror` (`src/network/online/onlineModes.ts`); `createPageTransport`, `PageTransportOptions` (Task 4); `startWorkerHost`, `createWorkerHostPlatform`, `HostPlatform` (Task 5); `sessionConfigOf`, `validatePageOnlineConfig`, `PageOnlineConfig` (Task 3); `createRoomServiceClient` (`src/network/session/serviceClient.ts`, unchanged).
- Produces:
  - `src/network/online/lifecycle.ts`: `interface OnlineLifecycle { onSuspend(cb: () => void): Unsubscribe; onResume(cb: () => void): Unsubscribe; dispose(): void }`; `createElectronLifecycle(api: { onSuspend(cb: () => void): Unsubscribe; onResume(cb: () => void): Unsubscribe }): OnlineLifecycle`; `interface ClockJumpDeps { target: { addEventListener(type: string, l: (e: any) => void): void; removeEventListener(type: string, l: (e: any) => void): void }; epochMs(): number; monotonicMs(): number; setInterval(cb: () => void, ms: number): unknown; clearInterval(handle: unknown): void }`; `createClockJumpLifecycle(deps): OnlineLifecycle`; `CLOCK_JUMP_MS = 15000`; `CLOCK_JUMP_INTERVAL_MS = 1000`.
  - `src/network/online/pagePlatform.ts`: `interface PagePlatformOptions { hostPlatform(): HostPlatform; deliver(descriptor: OnlinePortDescriptor, port: MessagePort): void; transport?: PageTransportOptions }`; `createPagePlatform(options): OnlinePlatform`.
  - `src/renderer/src/app/online/pageSession.ts`: `type PortListener = (descriptor: OnlinePortDescriptor, port: MessagePort) => void`; `interface PageOnline extends OnlinePreloadApi { onPort(cb: PortListener): Unsubscribe; prepareExit(): Promise<void>; releaseForUnload(): void; dispose(): Promise<void> }`; `interface PageWindow { addEventListener; removeEventListener; dispatchEvent(event: Event): boolean; ftlite?: FtlitePreloadApi }`; `interface PageOnlineDeps { window: PageWindow; records?; lifecycle?; fetch?; WebSocket?; hostPlatform?(lifecycle: OnlineLifecycle): HostPlatform; createSession?(deps: OnlineSessionDeps): OnlineSessionOwner }`; `createPageOnline(config: PageOnlineConfig, deps: PageOnlineDeps): PageOnline`. Test hook (deviation D-1): with `testProbe && !packaged`, `window.__ftliteOnlineTest` (frozen facade) and a `ftlite:online:test-port` `CustomEvent` (`detail: { descriptor, port }`) before each delivery.

`FtlitePreloadApi` still has its `online` member until Task 7; `pageSession.ts` only reads `window.ftlite?.onSuspend`/`onResume`, which exist today.

- [ ] **Step 1: Write the failing tests**

`tests/onlineLifecycle.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { CLOCK_JUMP_MS, createClockJumpLifecycle, createElectronLifecycle } from '../src/network/online/lifecycle';

function clock() {
  let epoch = 1_000_000, mono = 500, tick: (() => void) | undefined;
  const target = new EventTarget(), clearInterval = vi.fn();
  const lifecycle = createClockJumpLifecycle({ target, epochMs: () => epoch, monotonicMs: () => mono,
    setInterval: (cb, ms) => { expect(ms).toBe(1000); tick = cb; return 1; }, clearInterval });
  const order: string[] = []; lifecycle.onSuspend(() => order.push('suspend')); lifecycle.onResume(() => order.push('resume'));
  return { lifecycle, target, order, clearInterval, step(wall: number, monotonic: number) { epoch += wall; mono += monotonic; tick!(); } };
}
const page = (type: string, persisted: boolean) => Object.assign(new Event(type), { persisted });
describe('suspend and resume triggers (web build spec §3.1)', () => {
  it('counts a wall gap more than 15 s larger than the monotonic gap as one suspend then resume', () => {
    const c = clock();
    c.step(1000, 1000); c.step(60000, 60000); c.step(CLOCK_JUMP_MS + 1000, 1000);   // a throttled minute on both clocks, and exactly 15 s extra, are not sleep
    expect(c.order).toEqual([]);
    c.step(CLOCK_JUMP_MS + 1001, 1000); expect(c.order).toEqual(['suspend', 'resume']);
  });
  it('never fires on visibilitychange', () => {
    const c = clock(); c.target.dispatchEvent(new Event('visibilitychange')); c.step(1000, 1000); expect(c.order).toEqual([]);
  });
  it('treats a back-forward-cache pagehide as suspend and its pageshow as resume, and ignores ordinary ones', () => {
    const c = clock();
    c.target.dispatchEvent(page('pagehide', false)); c.target.dispatchEvent(page('pageshow', false)); expect(c.order).toEqual([]);
    c.target.dispatchEvent(page('pagehide', true)); c.step(120000, 1000);   // the frozen interval's jump is the same suspension
    c.target.dispatchEvent(page('pageshow', true)); expect(c.order).toEqual(['suspend', 'resume']);
    c.step(1000, 1000); expect(c.order).toEqual(['suspend', 'resume']);
  });
  it('stops its interval and page listeners on dispose', () => {
    const c = clock(); c.lifecycle.dispose(); expect(c.clearInterval).toHaveBeenCalledWith(1);
    c.target.dispatchEvent(page('pagehide', true)); expect(c.order).toEqual([]);
  });
  it("relays Electron main's app:suspend and app:resume pushes and unsubscribes on dispose", () => {
    const suspends = new Set<() => void>(), resumes = new Set<() => void>();
    const lifecycle = createElectronLifecycle({ onSuspend: cb => { suspends.add(cb); return () => { suspends.delete(cb); }; }, onResume: cb => { resumes.add(cb); return () => { resumes.delete(cb); }; } });
    const order: string[] = []; lifecycle.onSuspend(() => order.push('s')); lifecycle.onResume(() => order.push('r'));
    for (const cb of suspends) cb(); for (const cb of resumes) cb(); expect(order).toEqual(['s', 'r']);
    lifecycle.dispose(); expect(suspends.size + resumes.size).toBe(0);
  });
});
```

`tests/pagePlatform.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createPagePlatform } from '../src/network/online/pagePlatform';

const identity = { modeId: 'counter', schemaVersion: 1, simVersion: 9, contentDigest: 'a'.repeat(64), hostGeneration: 7 };
const descriptor = { epoch: 1, runId: 'a'.repeat(32), hostGeneration: 1, seatId: 1, compatibility: { protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'b'.repeat(64), layoutHash: '12345678' } };
const port = () => ({ close: vi.fn() }) as never as MessagePort & { close: ReturnType<typeof vi.fn> };
const unused = () => { throw Error('unused'); };
describe('the page online platform (web build spec §3.1)', () => {
  it('delivers only validated increasing descriptors and closes every refused port', () => {
    const deliver = vi.fn(), platform = createPagePlatform({ hostPlatform: unused, deliver });
    const first = port(); platform.publishPort(descriptor, first);
    expect(deliver).toHaveBeenCalledWith(descriptor, first); expect(deliver.mock.calls[0]![0]).not.toBe(descriptor);
    for (const bad of [descriptor, { ...descriptor, epoch: 2, token: 'private' }]) {
      const refused = port(); expect(() => platform.publishPort(bad as never, refused)).toThrow('invalid-port'); expect(refused.close).toHaveBeenCalledOnce();
    }
    const noListener = createPagePlatform({ hostPlatform: unused, deliver: () => { throw Error('no listener'); } }), lost = port();
    expect(() => noListener.publishPort(descriptor, lost)).toThrow('invalid-port'); expect(lost.close).toHaveBeenCalledOnce();
  });
  it('rejects a missing or foreign lease identity before starting a Worker', async () => {
    const hostPlatform = vi.fn(), platform = createPagePlatform({ hostPlatform, deliver: vi.fn() }), signal = new AbortController().signal;
    await expect(platform.startLeasedHost(identity, signal, { roomId: 'a'.repeat(32), runId: 'b'.repeat(32), hostGeneration: 8, hostSeatId: 0, utilityEpoch: 'c'.repeat(32) })).rejects.toThrow('invalid-lease');
    await expect(platform.startLeasedHost(identity, signal, {} as never)).rejects.toThrow('invalid-lease');
    expect(hostPlatform).not.toHaveBeenCalled();
  });
  it('owns a page transport whose public disposal is one loss and whose owner disposal is none', async () => {
    const platform = createPagePlatform({ hostPlatform: unused, deliver: vi.fn() });
    const a = await platform.createTransport(identity), lost = vi.fn(); a.onExit(lost); await a.controller.dispose(); expect(lost).toHaveBeenCalledOnce();
    const late = vi.fn(); a.onExit(late); expect(late).toHaveBeenCalledOnce();
    const b = await platform.createTransport(identity), quiet = vi.fn(); b.onExit(quiet); await b.dispose(); expect(quiet).not.toHaveBeenCalled();
    const after = vi.fn(); b.onExit(after); expect(after).not.toHaveBeenCalled();
  });
  it('makes real MessageChannels for peers and never reports the page as gone', () => {
    const platform = createPagePlatform({ hostPlatform: unused, deliver: vi.fn() }), { port1, port2 } = platform.channel();
    expect(typeof port1.postMessage).toBe('function'); port1.close(); port2.close();
    const gone = vi.fn(); platform.onVisibleGone(gone)(); expect(gone).not.toHaveBeenCalled();
  });
});
```

`tests/pageSession.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createPageOnline } from '../src/renderer/src/app/online/pageSession';
import { createMemoryRecordStore } from '../src/network/online/recordStore';
import { DISABLED_PAGE_ONLINE_CONFIG, type PageOnlineConfig } from '../src/shared/onlineConfig';
import type { OnlineSessionDeps, OnlineSessionOwner } from '../src/network/online/onlineSession';

const status = () => ({ phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null,
  mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: ['host'] } as const);
const descriptor = { epoch: 1, runId: 'a'.repeat(32), hostGeneration: 1, seatId: 1, compatibility: { protocolVersion: 2, modeId: 'duel', schemaVersion: 2, simVersion: 35, contentDigest: 'b'.repeat(64), layoutHash: '12345678' } };
const config = (overrides: Partial<PageOnlineConfig> = {}): PageOnlineConfig => ({ serviceOrigin: 'http://127.0.0.1:8787', iceMode: 'loopback', allowInsecureLocalhost: true,
  packaged: false, sectorOnlineTest: false, duelTestSeed: null, testProbe: false, ...overrides });
function harness(pageConfig: PageOnlineConfig = config()) {
  const listeners = new Set<(value: any) => void>(); let deps!: OnlineSessionDeps;
  const owner: OnlineSessionOwner = { dispatch: vi.fn(async () => ({ ok: true as const })), status: vi.fn(status),
    subscribe: cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, suspend: vi.fn(async () => {}), resume: vi.fn(async () => {}),
    prepareExit: vi.fn(async () => {}), dispose: vi.fn(async () => {}), releaseForUnload: vi.fn(), linkStats: vi.fn(() => ({ route: 'lan' as const, rttMs: 4 })) };
  const suspends = new Set<() => void>(), resumes = new Set<() => void>();
  const lifecycle = { onSuspend: (cb: () => void) => { suspends.add(cb); return () => { suspends.delete(cb); }; },
    onResume: (cb: () => void) => { resumes.add(cb); return () => { resumes.delete(cb); }; }, dispose: vi.fn() };
  const win = new EventTarget() as EventTarget & Record<string, any>;
  const online = createPageOnline(pageConfig, { window: win, records: createMemoryRecordStore(), lifecycle, fetch: vi.fn() as never,
    WebSocket: class {} as never, hostPlatform: vi.fn() as never, createSession: d => { deps = d; return owner; } });
  return { online, owner, deps: () => deps, win, suspends, resumes, lifecycle, push: (value: unknown) => { for (const cb of [...listeners]) cb(value); } };
}
describe('the page online session (web build spec §3.3)', () => {
  it('builds the session from the page config: origin, loopback ICE, test entries and a 32-hex nonce', () => {
    const h = harness(config({ sectorOnlineTest: true, duelTestSeed: 7 })), d = h.deps();
    expect(d.config).toEqual({ enabled: true, baseUrl: 'http://127.0.0.1:8787', allowInsecureLocalhost: true, iceMode: 'loopback' });
    expect(d.sectorTestEntry).toBe(true); expect(d.duelTestSeed).toBe(7); expect(d.nonce()).toMatch(/^[0-9a-f]{32}$/);
    expect(harness(DISABLED_PAGE_ONLINE_CONFIG).deps().config).toEqual({ enabled: false });
  });
  it('refuses an invalid config', () => {
    expect(() => createPageOnline(config({ packaged: true, testProbe: true }), { window: new EventTarget() })).toThrow('invalid-online-config');
  });
  it('validates actions before dispatch and copies results', async () => {
    const h = harness();
    expect(await h.online.rehost()).toEqual({ ok: true }); expect(h.owner.dispatch).toHaveBeenLastCalledWith({ type: 'rehost' });
    expect(await h.online.host({ mode: 'duel', capacity: 3 })).toEqual({ ok: true }); expect(h.owner.dispatch).toHaveBeenLastCalledWith({ type: 'host', mode: 'duel', capacity: 3 });
    const calls = vi.mocked(h.owner.dispatch).mock.calls.length;
    expect(await h.online.host({ mode: 'sector', capacity: 9 })).toEqual({ ok: false, code: 'invalid-action' }); expect(vi.mocked(h.owner.dispatch).mock.calls.length).toBe(calls);
    vi.mocked(h.owner.dispatch).mockResolvedValueOnce({ ok: true, token: 'private' } as never).mockRejectedValueOnce(Error('private'));
    expect(await h.online.join('ABCDEFGH')).toEqual({ ok: false, code: 'invalid-status' }); expect(await h.online.leave()).toEqual({ ok: false, code: 'unavailable' });
  });
  it('pushes revisioned status envelopes, never unknown fields, and answers reads with the latest', async () => {
    const h = harness(), seen: any[] = []; h.online.onStatus(value => seen.push(value));
    expect(await h.online.readStatus()).toEqual({ version: 1, revision: 1, status: status() });
    h.push({ ...status(), persistent: true }); h.push({ ...status(), seatToken: 'private' });
    expect(seen.map(v => v.revision)).toEqual([2, 3]); expect(seen[0].status.persistent).toBe(true);
    expect(seen[1].status.phase).toBe('error'); expect(JSON.stringify(seen)).not.toContain('private');
    expect((await h.online.readStatus()).revision).toBe(3);
  });
  it('answers link figures with the route and RTT only', async () => {
    const h = harness(); expect(await h.online.linkStats!()).toEqual({ route: 'lan', rttMs: 4 });
    vi.mocked(h.owner.linkStats!).mockReturnValueOnce({ route: 'lan', rttMs: 4, address: '192.0.2.1' } as never); expect(await h.online.linkStats!()).toBeNull();
  });
  it('feeds the lifecycle to the session and releases on a non-persisted pagehide only', () => {
    const h = harness(); for (const cb of h.suspends) cb(); for (const cb of h.resumes) cb();
    expect(h.owner.suspend).toHaveBeenCalledOnce(); expect(h.owner.resume).toHaveBeenCalledOnce();
    h.win.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true })); expect(h.owner.releaseForUnload).not.toHaveBeenCalled();
    h.win.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: false })); expect(h.owner.releaseForUnload).toHaveBeenCalledOnce();
    expect(h.lifecycle.dispose).toHaveBeenCalledOnce(); expect(h.suspends.size).toBe(0);
    h.win.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: false })); expect(h.owner.releaseForUnload).toHaveBeenCalledOnce();
  });
  it('runs the exit save then disposal for app:prepare-exit, and still disposes when the save fails', async () => {
    const h = harness(); vi.mocked(h.owner.prepareExit).mockRejectedValueOnce(Error('save'));
    await expect(h.online.prepareExit()).resolves.toBeUndefined();
    expect(h.owner.dispose).toHaveBeenCalledOnce(); expect(h.lifecycle.dispose).toHaveBeenCalledOnce();
  });
  it('hands game ports to one onPort listener and keeps the session off window', () => {
    const h = harness(), received = vi.fn(), early = { close: vi.fn() } as never as MessagePort & { close: ReturnType<typeof vi.fn> };
    expect(() => h.deps().platform.publishPort(descriptor, early)).toThrow('invalid-port'); expect(early.close).toHaveBeenCalledOnce();
    h.online.onPort(received); expect(() => h.online.onPort(vi.fn())).toThrow('invalid-port');
    const next = { close: vi.fn() } as never; h.deps().platform.publishPort({ ...descriptor, epoch: 2 }, next);
    expect(received).toHaveBeenCalledWith({ ...descriptor, epoch: 2 }, next);
    expect(Object.getOwnPropertyNames(h.win)).toEqual([]);
  });
  it('exposes the test probe only when unpackaged and asked (Web-i deviation D-1)', () => {
    const h = harness(config({ testProbe: true })), events: any[] = [];
    h.win.addEventListener('ftlite:online:test-port', event => events.push((event as CustomEvent).detail));
    h.online.onPort(vi.fn()); const p = { close: vi.fn() } as never; h.deps().platform.publishPort(descriptor, p);
    expect(events).toEqual([{ descriptor, port: p }]);
    expect(Object.isFrozen(h.win.__ftliteOnlineTest)).toBe(true); expect(typeof h.win.__ftliteOnlineTest.readStatus).toBe('function');
    expect(h.win.__ftliteOnlineTest.prepareExit).toBeUndefined();
  });
});
```

Add `'src/renderer/src/app/online'` to `PAGE_ROOTS` in `tests/pageBoundary.test.ts`.

Run: `npx vitest run tests/onlineLifecycle.test.ts tests/pagePlatform.test.ts tests/pageSession.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 2: Write the lifecycle**

`src/network/online/lifecycle.ts`:

```ts
// Suspend and resume for the page's online session (web build spec §3.1): OS sleep and wake only, never
// visibilitychange (a hidden hosting tab keeps playing). Electron pushes them from powerMonitor; a browser infers them.
type Unsubscribe = () => void;
export interface OnlineLifecycle { onSuspend(cb: () => void): Unsubscribe; onResume(cb: () => void): Unsubscribe; dispose(): void }
export const CLOCK_JUMP_MS = 15000, CLOCK_JUMP_INTERVAL_MS = 1000;
function hub() {
  const suspends = new Set<() => void>(), resumes = new Set<() => void>();
  const fire = (set: Set<() => void>) => { for (const cb of [...set]) { try { cb(); } catch { /* isolate observers */ } } };
  return {
    suspends, resumes, suspend: () => fire(suspends), resume: () => fire(resumes),
    api: { onSuspend(cb: () => void) { suspends.add(cb); return () => { suspends.delete(cb); }; }, onResume(cb: () => void) { resumes.add(cb); return () => { resumes.delete(cb); }; } }
  };
}
/** Electron: main's app:suspend and app:resume pushes (spec §3.3 job 5), through the preload's onSuspend/onResume. */
export function createElectronLifecycle(api: { onSuspend(cb: () => void): Unsubscribe; onResume(cb: () => void): Unsubscribe }): OnlineLifecycle {
  const h = hub(); let disposed = false;
  const offs = [api.onSuspend(() => { if (!disposed) h.suspend(); }), api.onResume(() => { if (!disposed) h.resume(); })];
  return { ...h.api, dispose() { if (disposed) return; disposed = true; for (const off of offs) off(); h.suspends.clear(); h.resumes.clear(); } };
}
export interface ClockJumpDeps {
  target: { addEventListener(type: string, listener: (event: any) => void): void; removeEventListener(type: string, listener: (event: any) => void): void };
  epochMs(): number; monotonicMs(): number;
  setInterval(cb: () => void, ms: number): unknown; clearInterval(handle: unknown): void;
}
/** Browser: a 1 s interval compares the wall and monotonic deltas; a wall gap more than 15 s larger is one sleep.
 *  A long gap on both clocks is hidden-tab throttling, not sleep. A back-forward-cache pagehide/pageshow is a
 *  suspend/resume. A platform whose monotonic clock runs through sleep is missed here; socket loss and lease expiry
 *  recover it as after a network drop. */
export function createClockJumpLifecycle(deps: ClockJumpDeps): OnlineLifecycle {
  const h = hub();
  let lastEpoch = deps.epochMs(), lastMono = deps.monotonicMs(), frozen = false, disposed = false;
  const resample = () => { lastEpoch = deps.epochMs(); lastMono = deps.monotonicMs(); };
  const timer = deps.setInterval(() => {
    if (disposed) return;
    const epoch = deps.epochMs(), mono = deps.monotonicMs(), jumped = (epoch - lastEpoch) - (mono - lastMono) > CLOCK_JUMP_MS;
    lastEpoch = epoch; lastMono = mono;
    if (jumped && !frozen) { h.suspend(); h.resume(); }
  }, CLOCK_JUMP_INTERVAL_MS);
  const hide = (event: { persisted?: boolean }) => { if (!disposed && event.persisted && !frozen) { frozen = true; h.suspend(); } };
  const show = (event: { persisted?: boolean }) => { if (!disposed && event.persisted && frozen) { frozen = false; resample(); h.resume(); } };
  deps.target.addEventListener('pagehide', hide); deps.target.addEventListener('pageshow', show);
  return { ...h.api, dispose() {
    if (disposed) return; disposed = true; deps.clearInterval(timer);
    deps.target.removeEventListener('pagehide', hide); deps.target.removeEventListener('pageshow', show); h.suspends.clear(); h.resumes.clear();
  } };
}
```

- [ ] **Step 3: Write the page platform**

`src/network/online/pagePlatform.ts`:

```ts
import { copyOnlinePortDescriptor, type OnlinePortDescriptor } from '../../shared/onlineSession';
import { validateSessionLeaseIdentity } from '../../shared/sessionLease';
import { startWorkerHost, type HostPlatform } from '../host/workerHost';
import { createPageTransport, type PageTransportOptions } from '../transport/pageTransport';
import type { OnlinePlatform } from './onlineSession';

export interface PagePlatformOptions {
  hostPlatform(): HostPlatform;
  /** Hand one game port to the page's single listener; throws when there is none. */
  deliver(descriptor: OnlinePortDescriptor, port: MessagePort): void;
  transport?: PageTransportOptions;
}
/** The page's OnlinePlatform (web build spec §3.1): the host Worker, page transports and game-port delivery. */
export function createPagePlatform(options: PagePlatformOptions): OnlinePlatform {
  let lastEpoch = 0;
  return {
    async createTransport(identity) {
      const transport = createPageTransport(identity, options.transport), exits = new Set<() => void>();
      let stopped = false, lost = false;
      const offExit = transport.onExit(() => {
        if (stopped) return; stopped = true; lost = true;
        for (const cb of [...exits]) { try { cb(); } catch { /* isolate owners */ } }
        exits.clear();
      });
      return {
        controller: transport.controller,
        onExit(cb) {
          if (stopped) { if (lost) cb(); return () => {}; }
          if (exits.size >= 64) throw Error('transport-lost');
          exits.add(cb); return () => { exits.delete(cb); };
        },
        async dispose() { if (stopped) return; stopped = true; offExit(); exits.clear(); transport.dispose(); }
      };
    },
    async startLeasedHost(identity, signal, sessionLease) {
      if (!validateSessionLeaseIdentity(sessionLease) || sessionLease.hostGeneration !== identity.hostGeneration) throw Error('invalid-lease');
      return startWorkerHost({ ...identity, signal, sessionLease }, options.hostPlatform());
    },
    channel: () => new MessageChannel(),
    publishPort(descriptor, port) {
      try {
        const copy = copyOnlinePortDescriptor(descriptor);
        if (copy.epoch <= lastEpoch) throw Error('invalid-port');
        options.deliver(copy, port); lastEpoch = copy.epoch;
      } catch {
        try { port.close(); } catch { /* detached */ }
        throw Error('invalid-port');
      }
    },
    // The page itself is the visible owner; its unload is handled by createPageOnline (pagehide, prepare-exit).
    onVisibleGone: () => () => {}
  };
}
```

- [ ] **Step 4: Write the page session factory**

`src/renderer/src/app/online/pageSession.ts`:

```ts
// The online session in the page (web build spec §3.3): the session, its lobby client, its peers and the host Worker
// are built here, in Electron and in a browser alike. The returned facade has the shape of the former preload online
// API plus onPort; the session object itself is never put on window.
import { createOnlineSession, type OnlineSessionDeps, type OnlineSessionOwner } from '../../../../network/online/onlineSession';
import { createSeatStore } from '../../../../network/online/seatStore';
import { createMirrorStore } from '../../../../network/online/mirrorStore';
import { createIndexedDbRecordStore, type OnlineRecordStore } from '../../../../network/online/recordStore';
import { validateModeMirror } from '../../../../network/online/onlineModes';
import { createPagePlatform } from '../../../../network/online/pagePlatform';
import { createClockJumpLifecycle, createElectronLifecycle, type OnlineLifecycle } from '../../../../network/online/lifecycle';
import { createWorkerHostPlatform, type HostPlatform } from '../../../../network/host/workerHost';
import { createRoomServiceClient } from '../../../../network/session/serviceClient';
import { randomHex } from '../../../../network/random';
import { sessionConfigOf, validatePageOnlineConfig, type PageOnlineConfig } from '../../../../shared/onlineConfig';
import { copyOnlineStatus, validateOnlineAction, validateOnlineLinkStats, validateOnlineResult, type DuelCrewSize, type FtlitePreloadApi, type OnlineAction,
  type OnlinePortDescriptor, type OnlinePreloadApi, type OnlineResult, type OnlineStatus, type OnlineStatusEnvelope, type Unsubscribe } from '../../../../shared/onlineSession';

export type PortListener = (descriptor: OnlinePortDescriptor, port: MessagePort) => void;
export interface PageOnline extends OnlinePreloadApi {
  onPort(callback: PortListener): Unsubscribe;
  /** The session's bounded exit save, then disposal (Electron's app:prepare-exit). Settles even when the save fails. */
  prepareExit(): Promise<void>;
  /** A non-persisted pagehide (spec §3.1): the host release over the open socket, no checkpoint capture. */
  releaseForUnload(): void;
  dispose(): Promise<void>;
}
export interface PageWindow {
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
  dispatchEvent(event: Event): boolean;
  ftlite?: FtlitePreloadApi;
}
export interface PageOnlineDeps {
  window: PageWindow;
  records?: OnlineRecordStore;
  lifecycle?: OnlineLifecycle;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  hostPlatform?(lifecycle: OnlineLifecycle): HostPlatform;
  createSession?(deps: OnlineSessionDeps): OnlineSessionOwner;
}
const invalidStatus = (): OnlineStatus => ({ phase: 'error', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: 'invalid-status', retryAtMs: null,
  mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: [] });
export function createPageOnline(config: PageOnlineConfig, deps: PageOnlineDeps): PageOnline {
  if (!validatePageOnlineConfig(config)) throw Error('invalid-online-config');
  const win = deps.window;
  // Capture one native networking implementation for this owner.
  const nativeFetch = deps.fetch ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined);
  const NativeWebSocket = deps.WebSocket ?? globalThis.WebSocket;
  const lifecycle = deps.lifecycle ?? (win.ftlite ? createElectronLifecycle(win.ftlite) : createClockJumpLifecycle({ target: win,
    epochMs: () => Date.now(), monotonicMs: () => performance.now(),
    setInterval: (cb, ms) => setInterval(cb, ms), clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>) }));
  const probe = config.testProbe && !config.packaged;
  let portListener: PortListener | undefined, disposed = false;
  const platform = createPagePlatform({
    hostPlatform: () => (deps.hostPlatform ?? (l => createWorkerHostPlatform({ lifecycle: l })))(lifecycle),
    deliver(descriptor, port) {
      if (!portListener) throw Error('invalid-port');
      if (probe) win.dispatchEvent(new CustomEvent('ftlite:online:test-port', { detail: { descriptor: structuredClone(descriptor), port } }));
      portListener(descriptor, port);
    }
  });
  const scheduler = { setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms), clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  const sessionConfig = typeof nativeFetch === 'function' && typeof NativeWebSocket === 'function' ? sessionConfigOf(config) : { enabled: false } as const;
  const records = deps.records ?? createIndexedDbRecordStore();
  const owner = (deps.createSession ?? createOnlineSession)({
    config: sessionConfig, seatStore: createSeatStore(records), mirrorStore: createMirrorStore(records, validateModeMirror), platform,
    sectorTestEntry: config.sectorOnlineTest, duelTestSeed: config.duelTestSeed ?? undefined,
    clock: { nowMs: () => performance.now(), epochMs: () => Date.now() }, scheduler, nonce: () => randomHex(16),
    service() {
      if (!sessionConfig.enabled) throw Error('online-disabled');
      return createRoomServiceClient({ baseUrl: sessionConfig.baseUrl, allowInsecureLocalhost: sessionConfig.allowInsecureLocalhost,
        fetch: (url, init) => nativeFetch!(url, init), createWebSocket: url => new NativeWebSocket(url),
        clock: { nowMs: () => Date.now(), ...scheduler } });
    }
  });
  let revision = 1;
  const safe = (value: OnlineStatus): OnlineStatus => { try { return copyOnlineStatus(value); } catch { return invalidStatus(); } };
  let current: OnlineStatus;
  try { current = safe(owner.status()); } catch { current = invalidStatus(); }
  const envelope = (): OnlineStatusEnvelope => ({ version: 1, revision, status: copyOnlineStatus(current) });
  const statusListeners = new Set<(value: OnlineStatusEnvelope) => void>();
  const offOwner = owner.subscribe(status => {
    if (disposed || revision >= Number.MAX_SAFE_INTEGER) return;
    current = safe(status); revision++;
    const value = envelope();
    for (const cb of [...statusListeners]) { try { cb(structuredClone(value)); } catch { /* isolate UI observers */ } }
  });
  async function action(value: OnlineAction): Promise<OnlineResult> {
    if (!validateOnlineAction(value)) return { ok: false, code: 'invalid-action' };
    try {
      const result = await owner.dispatch(structuredClone(value));
      return validateOnlineResult(result) ? structuredClone(result) : { ok: false, code: 'invalid-status' };
    } catch { return { ok: false, code: 'unavailable' }; }
  }
  const offSuspend = lifecycle.onSuspend(() => { void owner.suspend().catch(() => {}); });
  const offResume = lifecycle.onResume(() => { void owner.resume().catch(() => {}); });
  const pagehide = (event: { persisted?: boolean }) => { if (!event.persisted) api.releaseForUnload(); };
  win.addEventListener('pagehide', pagehide);
  function detach(): void {
    if (disposed) return; disposed = true;
    offOwner(); offSuspend(); offResume(); lifecycle.dispose(); win.removeEventListener('pagehide', pagehide);
    statusListeners.clear(); portListener = undefined;
  }
  const api: PageOnline = {
    // Exactly the former preload's forms (Sci-2: a duel room for a crew of 2, 3 or 4; the sector is the test-only entry).
    host: room => action(room?.mode === 'sector' ? { type: 'host', mode: 'sector', capacity: room.capacity } : { type: 'host', mode: 'duel', capacity: room?.capacity as DuelCrewSize }),
    join: (code, mode) => action(mode ? { type: 'join', code, mode } : { type: 'join', code }),
    ready: ready => action({ type: 'ready', ready }),
    removeSeat: seatId => action({ type: 'remove-seat', seatId }),
    viewState: (epoch, phase) => action({ type: 'view-state', epoch, phase }),
    reconnect: () => action({ type: 'reconnect' }),
    rehost: () => action({ type: 'rehost' }),
    start: helmPlayer => action(helmPlayer === undefined ? { type: 'start' } : { type: 'start', helmPlayer }),
    retry: () => action({ type: 'retry' }),
    leave: () => action({ type: 'leave' }),
    forgetSeat: () => action({ type: 'forget-seat' }),
    async readStatus() { return envelope(); },
    async linkStats() {
      try { const stats = owner.linkStats?.() ?? null; return validateOnlineLinkStats(stats) ? { route: stats.route, rttMs: stats.rttMs } : null; } catch { return null; }
    },
    onStatus(callback) {
      if (disposed || statusListeners.size >= 64) return () => {};
      statusListeners.add(callback); return () => { statusListeners.delete(callback); };
    },
    onPort(callback) {
      if (disposed) return () => {};
      if (portListener) throw Error('invalid-port');
      portListener = callback;
      return () => { if (portListener === callback) portListener = undefined; };
    },
    prepareExit() { return owner.prepareExit().catch(() => {}).then(() => owner.dispose()).catch(() => {}).finally(detach); },
    releaseForUnload() { if (disposed) return; try { owner.releaseForUnload(); } finally { detach(); } },
    async dispose() { try { await owner.dispose(); } finally { detach(); } }
  };
  if (probe) Object.defineProperty(win, '__ftliteOnlineTest', { configurable: false, enumerable: false, writable: false, value: Object.freeze({
    host: api.host, join: api.join, ready: api.ready, removeSeat: api.removeSeat, viewState: api.viewState, reconnect: api.reconnect, rehost: api.rehost,
    start: api.start, retry: api.retry, leave: api.leave, forgetSeat: api.forgetSeat, readStatus: api.readStatus, linkStats: api.linkStats, onStatus: api.onStatus }) });
  return api;
}
```

- [ ] **Step 5: Run the page-session suites and typecheck**

Run: `npx vitest run tests/onlineLifecycle.test.ts tests/pagePlatform.test.ts tests/pageSession.test.ts tests/pageBoundary.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/network/online/lifecycle.ts src/network/online/pagePlatform.ts src/renderer/src/app/online/pageSession.ts \
  tests/onlineLifecycle.test.ts tests/pagePlatform.test.ts tests/pageSession.test.ts tests/pageBoundary.test.ts
git commit -m "feat(web-i): createPageOnline, the page platform and the OS-sleep-only lifecycle triggers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Electron switches over: thin main, preload, renderer wiring, build, deletions (spec §3.3)

**Files:**
- Rewrite: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/app/onlineBridge.ts`, `electron.vite.config.ts`
- Create: `src/main/appExit.ts`, `tests/appExit.test.ts`, `scripts/network/worker-boot.cjs`
- Modify: `src/shared/onlineSession.ts:130-186`, `src/shared/hostProcessProtocol.ts:42-43`, `src/shared/rtcSession.ts` (the two RTC channel constants), `src/network/transport/bridge.ts`, `src/renderer/src/main.ts:15,78,148-151`, `tsconfig.web.json`, `package.json` (script `test:worker-boot`)
- Modify tests: `tests/onlineBridge.test.ts` (rewrite), `tests/rtcBridge.test.ts:3-4,137-143`, `tests/linkStats.test.ts:13-20,113-128,134`, `tests/build-output.test.ts`, `tests/uiBoundary.test.ts:20`
- Delete: `src/main/network/{transportWindow,onlinePlatform,onlineIpc,onlineExit,hostProcess,rtcTransport,onlineSession,onlinePeers,onlineDuel,onlineSector,onlineMirrors,onlineModes,onlineIce,onlineRetry,onlineConfig,seatStore,mirrorStore}.ts`, `src/preload/networkTransport.ts`, `src/renderer/networkTransport.ts`, `src/renderer/networkTransport.html`, `src/utility/authorityHost.ts`, `src/utility/authorityModes.ts`, `tests/onlineIpc.test.ts`, `tests/onlineExit.test.ts`, `tests/onlinePlatform.test.ts`, `tests/transportWindow.test.ts`, `tests/hostProcess.test.ts`

Test fates of the deleted test files: `onlineIpc.test.ts` → `pageSession.test.ts` (Task 6: action validation, status envelopes, link figures, lifecycle) and `appExit.test.ts`; `onlineExit.test.ts` → `appExit.test.ts`; `onlinePlatform.test.ts` → `pagePlatform.test.ts` (Task 6); `transportWindow.test.ts` → `workerHost.test.ts` (spawn adapter, termination) and `pageTransport.test.ts` (transport exit, single connection); `hostProcess.test.ts` → `workerHost.test.ts` (Task 5).

**Interfaces:**
- Consumes: everything from Tasks 2-6.
- Produces:
  - `src/shared/onlineSession.ts`: `APP_SUSPEND_CHANNEL = 'app:suspend'`, `APP_RESUME_CHANNEL = 'app:resume'`, `APP_PREPARE_EXIT_CHANNEL = 'app:prepare-exit'`, `ONLINE_CONFIG_CHANNEL = 'app:online-config'`; `FtlitePreloadApi { onlineConfig: PageOnlineConfig; onPrepareExit?(handler: () => Promise<void>): Unsubscribe; recordDuel?; onSuspend; onResume; window? }` (no `online`).
  - `src/main/appExit.ts`: `APP_EXIT_TIMEOUT_MS = 3000`; `registerAppExit(app: Pick<App, 'on' | 'off' | 'quit'>, win: BrowserWindow, ipc: Pick<IpcMain, 'handle' | 'removeHandler'>, timeoutMs?: number): void`.
  - `src/renderer/src/app/onlineBridge.ts`: `type OnlinePortListener`, `interface PageOnlineApi extends OnlinePreloadApi { onPort(cb: OnlinePortListener): Unsubscribe }`, `createOnlineBridge(api: PageOnlineApi)`.
  - The built Worker chunk `out/renderer/assets/authorityWorker.js`; `out/main/index.js` is the only main bundle; `out/preload/index.js` the only preload; no `networkTransport.html`.

- [ ] **Step 1: Write the failing close-handshake and bridge tests**

`tests/appExit.test.ts`:

```ts
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAppExit } from '../src/main/appExit';

afterEach(() => vi.useRealTimers());
function harness() {
  const webContents = Object.assign(new EventEmitter(), { mainFrame: {}, isDestroyed: () => false, send: vi.fn() });
  const win = Object.assign(new EventEmitter(), { webContents, isDestroyed: () => false, close: vi.fn() });
  const app = Object.assign(new EventEmitter(), { quit: vi.fn() });
  const handlers = new Map<string, (...args: any[]) => unknown>();
  registerAppExit(app as never, win as never, { handle: (name: string, cb: any) => { handlers.set(name, cb); }, removeHandler: (name: string) => { handlers.delete(name); } } as never, 3000);
  const event = () => ({ preventDefault: vi.fn() });
  const answer = (request: unknown, sender: unknown = webContents, frame: unknown = webContents.mainFrame) => handlers.get('app:prepare-exit')?.({ sender, senderFrame: frame }, request);
  return { win, app, webContents, handlers, event, answer };
}
describe('the Electron close handshake (web build spec §3.3)', () => {
  it('asks the page once across repeated close and quit, accepts only the trusted answer, then quits', async () => {
    const h = harness(), first = h.event(), second = h.event(), quit = h.event();
    h.win.emit('close', first); h.win.emit('close', second); h.app.emit('before-quit', quit);
    expect(first.preventDefault).toHaveBeenCalled(); expect(second.preventDefault).toHaveBeenCalled(); expect(quit.preventDefault).toHaveBeenCalled();
    expect(h.webContents.send.mock.calls).toEqual([['app:prepare-exit', 1]]);
    expect(h.answer(1, {})).toBe(false); expect(h.answer(2)).toBe(false); expect(h.answer(1, h.webContents, {})).toBe(false);
    expect(h.answer(1)).toBe(true);
    await vi.waitFor(() => expect(h.app.quit).toHaveBeenCalledOnce()); expect(h.win.close).not.toHaveBeenCalled();
    const after = h.event(); h.win.emit('close', after); expect(after.preventDefault).not.toHaveBeenCalled();
  });
  it('closes after 3 s when the page never answers', async () => {
    vi.useFakeTimers(); const h = harness(); h.win.emit('close', h.event());
    await vi.advanceTimersByTimeAsync(2999); expect(h.win.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(h.win.close).toHaveBeenCalledOnce(); expect(h.handlers.has('app:prepare-exit')).toBe(false);
  });
  it('closes at once when the page process is gone', async () => {
    const h = harness(); h.win.emit('close', h.event()); h.webContents.emit('render-process-gone');
    await vi.waitFor(() => expect(h.win.close).toHaveBeenCalledOnce());
  });
  it('removes its listeners and handler when the window closes', () => {
    const h = harness(); h.win.emit('closed');
    expect(h.win.listenerCount('close')).toBe(0); expect(h.app.listenerCount('before-quit')).toBe(0); expect(h.handlers.size).toBe(0);
  });
});
```

`tests/onlineBridge.test.ts` (replace the whole file):

```ts
import { describe, expect, it, vi } from 'vitest';
import { createOnlineBridge } from '../src/renderer/src/app/onlineBridge';
import { validateOnlineStatusEnvelope } from '../src/shared/onlineSession';

const status = { phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: ['host'] } as const;
const descriptor = { epoch: 1, runId: 'a'.repeat(32), hostGeneration: 1, seatId: 1, compatibility: { protocolVersion: 2, modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: 'b'.repeat(64), layoutHash: '12345678' } };
const native = vi.hoisted(() => ({ listeners: new Map<string, Set<(...args: any[]) => void>>(), exposed: null as any, invoke: vi.fn(), sendSync: vi.fn() }));
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld(_name: string, value: any) { native.exposed = value; } }, ipcRenderer: {
  invoke: native.invoke, sendSync: native.sendSync,
  on(name: string, cb: (...args: any[]) => void) { const set = native.listeners.get(name) ?? new Set(); set.add(cb); native.listeners.set(name, set); },
  off(name: string, cb: (...args: any[]) => void) { native.listeners.get(name)?.delete(cb); }
} }));
function harness() {
  const statuses = new Set<(value: any) => void>(); let initial!: (value: any) => void, deliver: ((d: any, p: any) => void) | undefined;
  const read = new Promise<any>(resolve => { initial = resolve; }), offPort = vi.fn();
  const api = { host: vi.fn(), join: vi.fn(), ready: vi.fn(), removeSeat: vi.fn(), viewState: vi.fn(), reconnect: vi.fn(), rehost: vi.fn(), start: vi.fn(),
    retry: vi.fn(), leave: vi.fn(), forgetSeat: vi.fn(), readStatus: () => read, prepareExit: vi.fn(), dispose: vi.fn(),
    onStatus(cb: (value: any) => void) { statuses.add(cb); return () => { statuses.delete(cb); }; },
    onPort(cb: (d: any, p: any) => void) { deliver = cb; return offPort; } };
  const bridge = createOnlineBridge(api as never);
  const port = () => ({ close: vi.fn() });
  const transfer = (d: any, p = port()) => { deliver!(d, p); return p; };
  return { bridge, api, statuses, initial, transfer, offPort };
}
describe('the renderer online bridge over the page facade', () => {
  it('delivers ports with detached descriptors and closes stale and malformed transfers', () => {
    const h = harness(), receive = vi.fn(), off = h.bridge.onPort(receive), first = h.transfer(descriptor);
    expect(receive).toHaveBeenCalledWith(descriptor, first); expect(first.close).not.toHaveBeenCalled();
    expect(h.transfer(descriptor).close).toHaveBeenCalledOnce();
    expect(h.transfer({ ...descriptor, epoch: 0 }).close).toHaveBeenCalledOnce();
    expect(h.transfer({ ...descriptor, epoch: 2, token: 'private' }).close).toHaveBeenCalledOnce();
    const second = h.transfer({ ...descriptor, epoch: 2 }); expect(receive).toHaveBeenCalledTimes(2);
    expect(receive.mock.calls[0]![0]).not.toBe(descriptor); expect(second.close).not.toHaveBeenCalled();
    off(); expect(h.transfer({ ...descriptor, epoch: 3 }).close).toHaveBeenCalledOnce();
    h.bridge.dispose(); expect(h.offPort).toHaveBeenCalledOnce();
  });
  it('retires an unclaimed valid epoch so it cannot be replayed after a listener arrives', () => {
    const h = harness(); expect(h.transfer(descriptor).close).toHaveBeenCalledOnce();
    const receive = vi.fn(); h.bridge.onPort(receive);
    expect(h.transfer(descriptor).close).toHaveBeenCalledOnce(); expect(receive).not.toHaveBeenCalled(); h.bridge.dispose();
  });
  it('exposes the named actions only, never the session lifetime', () => {
    const h = harness();
    expect((h.bridge as Record<string, unknown>).prepareExit).toBeUndefined();
    h.bridge.dispose(); expect(h.api.dispose).not.toHaveBeenCalled();
  });
  it('subscribes before initial read, rejects unsafe envelopes and ignores old replies', async () => {
    const h = harness(), receive = vi.fn(), off = h.bridge.onStatus(receive);
    expect(h.statuses.size).toBe(1);
    for (const cb of h.statuses) cb({ version: 1, revision: 2, status: { ...status, persistent: true } });
    h.initial({ version: 1, revision: 1, status }); await Promise.resolve(); await Promise.resolve();
    expect(receive).toHaveBeenCalledTimes(1); expect(receive).toHaveBeenLastCalledWith({ ...status, persistent: true });
    for (const cb of h.statuses) { cb({ version: 1, revision: 2, status }); cb({ version: 1, revision: 3, status: { ...status, seatToken: 'private' } }); }
    expect(receive).toHaveBeenCalledTimes(1); off(); expect(h.statuses.size).toBe(0); h.bridge.dispose();
  });
  it('delivers initial status to a subscriber arriving after the original initial query', async () => {
    const h = harness(); h.initial({ version: 1, revision: 1, status }); await Promise.resolve();
    const first = vi.fn(), off = h.bridge.onStatus(first); await Promise.resolve(); await Promise.resolve();
    expect(first).toHaveBeenCalledWith(status); off(); h.bridge.dispose();
  });
  it('validates fixed versioned bounded status envelope without credential fields', () => {
    expect(validateOnlineStatusEnvelope({ version: 1, revision: 1, status })).toBe(true);
    for (const bad of [{ version: 2, revision: 1, status }, { version: 1, revision: 0, status }, { version: 1, revision: Number.MAX_SAFE_INTEGER + 1, status }, { version: 1, revision: 1, status, seatToken: 'private' }, { version: 1, revision: 1, status: { ...status, seatToken: 'private' } }]) expect(validateOnlineStatusEnvelope(bad)).toBe(false);
  });
});
describe('the isolated preload API (web build spec §3.3)', () => {
  const config = { serviceOrigin: 'http://127.0.0.1:8787', iceMode: 'loopback', allowInsecureLocalhost: true, packaged: false, sectorOnlineTest: false, duelTestSeed: null, testProbe: false };
  it('hands over a validated frozen online config and no online IPC surface', async () => {
    vi.resetModules(); native.listeners.clear(); native.sendSync.mockReset().mockReturnValueOnce(config);
    await import('../src/preload/index');
    expect(native.sendSync).toHaveBeenCalledWith('app:online-config');
    expect(native.exposed.onlineConfig).toEqual(config); expect(Object.isFrozen(native.exposed.onlineConfig)).toBe(true);
    expect(native.exposed.online).toBeUndefined(); expect(native.exposed.invoke).toBeUndefined(); expect(native.exposed.send).toBeUndefined();
    vi.resetModules(); native.sendSync.mockReturnValueOnce({ ...config, serviceOrigin: 'http://evil.example' }); await import('../src/preload/index');
    expect(native.exposed.onlineConfig.serviceOrigin).toBeNull();
  });
  it('runs the page exit handler on app:prepare-exit and answers the same request number', async () => {
    vi.resetModules(); native.listeners.clear(); native.invoke.mockReset().mockResolvedValue(true); native.sendSync.mockReturnValueOnce(null);
    await import('../src/preload/index');
    const handler = vi.fn(async () => {}), off = native.exposed.onPrepareExit(handler);
    for (const cb of native.listeners.get('app:prepare-exit') ?? []) cb({}, 4);
    await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledWith('app:prepare-exit', 4)); expect(handler).toHaveBeenCalledOnce();
    off(); for (const cb of native.listeners.get('app:prepare-exit') ?? []) { cb({}, 'x'); cb({}, 5); }
    await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledWith('app:prepare-exit', 5));
    expect(handler).toHaveBeenCalledOnce(); expect(native.invoke).not.toHaveBeenCalledWith('app:prepare-exit', 'x');
  });
  it('relays app:suspend and app:resume to subscribers', async () => {
    vi.resetModules(); native.listeners.clear(); native.sendSync.mockReturnValueOnce(null); await import('../src/preload/index');
    const off = native.exposed.onSuspend(() => {}); expect(native.listeners.get('app:suspend')?.size).toBe(1); off(); expect(native.listeners.get('app:suspend')?.size).toBe(0);
    const offResume = native.exposed.onResume(() => {}); expect(native.listeners.get('app:resume')?.size).toBe(1); offResume();
  });
});
```

Run: `npx vitest run tests/appExit.test.ts tests/onlineBridge.test.ts`
Expected: FAIL (`appExit` not found; the bridge still takes `(window, api)`; the preload still exposes `online`).

- [ ] **Step 2: Rewrite the shared API block**

In `src/shared/onlineSession.ts`, add `import type { PageOnlineConfig } from './onlineConfig';` to the imports and replace everything from line 130 (`export type Unsubscribe = () => void;`) to the end of the file with:

```ts
export type Unsubscribe = () => void;
export interface OnlineStatusEnvelope { version: 1; revision: number; status: OnlineStatus }
export function validateOnlineStatusEnvelope(value: unknown): value is OnlineStatusEnvelope {
  return rtcRecord(value) && rtcKeys(value, ['version', 'revision', 'status']) && value.version === 1
    && positive(value.revision) && validateOnlineStatus(value.status);
}
/** The page online facade's API (web build spec §3.3): the shape of the former preload online API. */
export interface OnlinePreloadApi {
  /** Host a duel room for a crew of 2, 3 or 4 (Sci-2 spec §4.5); `{ mode: 'sector', capacity }` is the test-only sector entry (spec §10). */
  host(room: { mode: 'duel'; capacity: DuelCrewSize } | { mode: 'sector'; capacity: number }): Promise<OnlineResult>;
  join(code: string, mode?: OnlineMode): Promise<OnlineResult>;
  ready(ready: boolean): Promise<OnlineResult>;
  removeSeat(seatId: number): Promise<OnlineResult>;
  viewState(epoch: number, phase: Extract<OnlineAction, { type: 'view-state' }>['phase']): Promise<OnlineResult>;
  reconnect(): Promise<OnlineResult>;
  rehost(): Promise<OnlineResult>;
  start(helmPlayer?: number): Promise<OnlineResult>;
  retry(): Promise<OnlineResult>;
  leave(): Promise<OnlineResult>;
  forgetSeat(): Promise<OnlineResult>;
  readStatus(): Promise<OnlineStatusEnvelope | Extract<OnlineResult, { ok: false }>>;
  onStatus(callback: (value: OnlineStatusEnvelope) => void): Unsubscribe;
  /** This machine's newest peer link figures, or null with no ready link (H-2 spec §8). */
  linkStats?(): Promise<OnlineLinkStats | null>;
}
/** The duel playtest record channel (H-2 spec §8): one record per call, validated in main. */
export const DUEL_RECORD_CHANNEL = 'duel:record';
/** The window's fullscreen state (Settings, main menu spec): the same native toggle as F11. */
export const WINDOW_FULLSCREEN_CHANNEL = 'app:fullscreen';
/** The key the main process toggles fullscreen on (its before-input-event handler); Settings lists it from here. */
export const FULLSCREEN_KEY = 'F11';
/** OS sleep and wake, pushed by main from powerMonitor (web build spec §3.3 job 5). */
export const APP_SUSPEND_CHANNEL = 'app:suspend';
export const APP_RESUME_CHANNEL = 'app:resume';
/** The close handshake (spec §3.3 job 6): main pushes a request number; the page answers it by invoke when its exit save is done. */
export const APP_PREPARE_EXIT_CHANNEL = 'app:prepare-exit';
/** The page's online configuration, read once by the preload (spec §3.3 job 7). */
export const ONLINE_CONFIG_CHANNEL = 'app:online-config';
export interface WindowPreloadApi {
  isFullScreen(): Promise<boolean>;
  /** Resolves with the requested state once asked, or the current one when the request is refused. */
  setFullScreen(on: boolean): Promise<boolean>;
}
export interface FtlitePreloadApi {
  /** Main's resolved online configuration, frozen; the page builds its own session from it (web build spec §3.3). */
  onlineConfig: PageOnlineConfig;
  /** Register the page's exit save for the close handshake; one handler at a time. */
  onPrepareExit?(handler: () => Promise<void>): Unsubscribe;
  /** Append one duel playtest record (shared/duelRecord.ts) to this machine's playtest log (H-2 spec §8). */
  recordDuel?(record: unknown): Promise<boolean>;
  onSuspend(callback: () => void): Unsubscribe;
  onResume(callback: () => void): Unsubscribe;
  window?: WindowPreloadApi;
}
```

This removes `ONLINE_CHANNELS`, `ONLINE_STATUS_CHANNEL`, `ONLINE_PORT_CHANNEL`, `ONLINE_PORT_SOURCE`, `ONLINE_LINK_STATS_CHANNEL` and `validateOnlinePortEnvelope`. Also delete `TRANSPORT_CHANNEL` and `TRANSPORT_READY_CHANNEL` from `src/shared/hostProcessProtocol.ts` (lines 42-43) and `RTC_REQUEST_CHANNEL` and `RTC_RESPONSE_CHANNEL` from `src/shared/rtcSession.ts` (grep for them).

- [ ] **Step 3: Write the close handshake, the thin main and the preload**

`src/main/appExit.ts`:

```ts
import type { App, BrowserWindow, Event, IpcMain, IpcMainInvokeEvent } from 'electron';
import { APP_PREPARE_EXIT_CHANNEL } from '../shared/onlineSession';

export const APP_EXIT_TIMEOUT_MS = 3000;
/** Close and quit share one exit save (web build spec §3.3 job 6): main asks the page to run its session's prepareExit
 *  over app:prepare-exit and closes when the page answers or after 3 s, whichever comes first. */
export function registerAppExit(app: Pick<App, 'on' | 'off' | 'quit'>, win: BrowserWindow, ipc: Pick<IpcMain, 'handle' | 'removeHandler'>, timeoutMs = APP_EXIT_TIMEOUT_MS): void {
  const contents = win.webContents;
  let work: Promise<void> | undefined, ready = false, quitting = false, request = 0, answer: (() => void) | undefined;
  ipc.removeHandler(APP_PREPARE_EXIT_CHANNEL);
  ipc.handle(APP_PREPARE_EXIT_CHANNEL, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (win.isDestroyed() || contents.isDestroyed() || event.sender !== contents || event.senderFrame !== contents.mainFrame
      || args.length !== 1 || args[0] !== request || !answer) return false;
    answer(); return true;
  });
  function finish(event: Event, quit: boolean): void {
    if (ready) return;
    event.preventDefault(); quitting ||= quit;
    if (work) return;
    // Install ownership before calling out: the page may request another close.
    work = new Promise<void>(resolve => {
      const timer = setTimeout(done, timeoutMs);
      function done(): void { clearTimeout(timer); answer = undefined; contents.off('render-process-gone', done); resolve(); }
      answer = done;
      if (win.isDestroyed() || contents.isDestroyed()) { done(); return; }
      contents.once('render-process-gone', done);
      try { contents.send(APP_PREPARE_EXIT_CHANNEL, ++request); } catch { done(); }
    });
    void work.then(() => {
      ready = true; ipc.removeHandler(APP_PREPARE_EXIT_CHANNEL);
      if (quitting) app.quit(); else if (!win.isDestroyed()) win.close();
    });
  }
  const close = (event: Event) => finish(event, false), quit = (event: Event) => finish(event, true);
  win.on('close', close); app.on('before-quit', quit);
  win.once('closed', () => { win.off('close', close); app.off('before-quit', quit); ipc.removeHandler(APP_PREPARE_EXIT_CHANNEL); });
}
```

`src/main/index.ts` (replace the whole file):

```ts
import { app, BrowserWindow, ipcMain, Menu, powerMonitor, type IpcMainEvent } from 'electron';
import { join } from 'node:path';
import { INTERNAL_W, INTERNAL_H } from '../shared/resolution';
import { DISABLED_PAGE_ONLINE_CONFIG, resolveOnlineConfig, toPageOnlineConfig } from '../shared/onlineConfig';
import { registerAppExit } from './appExit';
import { appendDuelRecord, duelRecordCallAllowed } from './network/duelRecords';
import { APP_RESUME_CHANNEL, APP_SUSPEND_CHANNEL, DUEL_RECORD_CHANNEL, FULLSCREEN_KEY, ONLINE_CONFIG_CHANNEL, WINDOW_FULLSCREEN_CHANNEL } from '../shared/onlineSession';
declare const __FTLITE_PACKAGED_SERVICE_ORIGIN__: string;

/** Electron after the web build (spec §3.3): a thin window with seven jobs. The online session, its peers and the host
 *  Worker run in the page, exactly as in a browser. */
function createWindow(): void {
  const packaged = app.isPackaged;
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    minWidth: INTERNAL_W,
    minHeight: INTERNAL_H,
    fullscreen: packaged,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      devTools: !packaged,
      autoplayPolicy: 'no-user-gesture-required',
      // Job 1: the RTC peers, the session and the lease relay live in this page; a minimized host keeps its 60 Hz.
      backgroundThrottling: false,
      sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true
    }
  });
  const contents = win.webContents;
  const trusted = (event: { sender: unknown; senderFrame: unknown }) => !win.isDestroyed() && !contents.isDestroyed()
    && event.sender === contents && event.senderFrame === contents.mainFrame;
  // Job 7: the online configuration, from the same environment and packaging rules as before (H-2 spec §10 test entries
  // are honoured only unpackaged), handed to the page once through the preload.
  const configured = resolveOnlineConfig({ packaged, localServiceUrl: process.env['FTLITE_LOCAL_SERVICE_URL'], serviceUrl: process.env['FTLITE_SERVICE_URL'],
    packagedServiceOrigin: packaged ? __FTLITE_PACKAGED_SERVICE_ORIGIN__ : undefined });
  const onlineConfig = toPageOnlineConfig(configured, { packaged, sectorOnlineTest: process.env['FTLITE_SECTOR_ONLINE_TEST'],
    duelTestSeed: process.env['FTLITE_DUEL_TEST_SEED'], testProbe: process.env['FTLITE_ONLINE_TEST_PROBE'] });
  const answerConfig = (event: IpcMainEvent) => { event.returnValue = trusted(event) ? onlineConfig : DISABLED_PAGE_ONLINE_CONFIG; };
  ipcMain.removeAllListeners(ONLINE_CONFIG_CHANNEL);
  ipcMain.on(ONLINE_CONFIG_CHANNEL, answerConfig);
  // Job 5: OS sleep and wake, pushed to the page (its session retires the game, then reconnects).
  const push = (channel: string) => () => { if (!win.isDestroyed() && !contents.isDestroyed()) { try { contents.send(channel); } catch { /* closing */ } } };
  const suspend = push(APP_SUSPEND_CHANNEL), resume = push(APP_RESUME_CHANNEL);
  powerMonitor.on('suspend', suspend); powerMonitor.on('resume', resume);
  // Job 6: the exit save on close, and a page leave prompt never silently blocks a close.
  registerAppExit(app, win, ipcMain);
  contents.on('will-prevent-unload', event => event.preventDefault());
  Menu.setApplicationMenu(null);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  // Job 2: fullscreen, from F11 and from Settings' toggle (only this window's own main frame may ask).
  contents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === FULLSCREEN_KEY) {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  ipcMain.removeHandler(WINDOW_FULLSCREEN_CHANNEL);
  ipcMain.handle(WINDOW_FULLSCREEN_CHANNEL, (event, ...args: unknown[]) => {
    if (!trusted(event)) return false;
    if (args.length > 1 || (args.length === 1 && typeof args[0] !== 'boolean')) return false;
    if (args.length === 0) return win.isFullScreen();
    win.setFullScreen(args[0] as boolean);
    return args[0];
  });
  // Job 4: the duel playtest record (H-2 spec §8), trusted as the fullscreen channel is.
  ipcMain.removeHandler(DUEL_RECORD_CHANNEL);
  ipcMain.handle(DUEL_RECORD_CHANNEL, (event, ...args: unknown[]) => {
    if (!duelRecordCallAllowed(win.isDestroyed() || contents.isDestroyed() ? null : contents, event, args)) return false;
    return appendDuelRecord(app.getPath('userData'), args[0]);
  });
  win.on('closed', () => {
    ipcMain.removeHandler(WINDOW_FULLSCREEN_CHANNEL); ipcMain.removeHandler(DUEL_RECORD_CHANNEL); ipcMain.off(ONLINE_CONFIG_CHANNEL, answerConfig);
    powerMonitor.off('suspend', suspend); powerMonitor.off('resume', resume);
  });
  // Job 3: load the page. FTLITE_MODE (H-1 spec §3): `flight` opens the dev flight view and `duel` the solo duel.
  const mode = process.env['FTLITE_MODE'];
  if (process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL']);
    if (mode) url.searchParams.set('mode', mode);
    win.loadURL(url.toString());
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), mode ? { query: { mode } } : undefined);
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { app.quit(); });
```

The `packagedServiceOrigin: packaged ? __FTLITE_PACKAGED_SERVICE_ORIGIN__ : undefined` expression is kept verbatim: `scripts/network/internet-app-manifest.ts` (`assertCandidateServiceOrigin`) finds the compiled `packaged ? "…" : void 0` in `out/main/index.js`.

`src/preload/index.ts` (replace the whole file):

```ts
import { contextBridge, ipcRenderer } from 'electron';
import { APP_PREPARE_EXIT_CHANNEL, APP_RESUME_CHANNEL, APP_SUSPEND_CHANNEL, DUEL_RECORD_CHANNEL, ONLINE_CONFIG_CHANNEL, WINDOW_FULLSCREEN_CHANNEL,
  type FtlitePreloadApi, type Unsubscribe } from '../shared/onlineSession';
import { DISABLED_PAGE_ONLINE_CONFIG, validatePageOnlineConfig, type PageOnlineConfig } from '../shared/onlineConfig';

function lifecycle(channel: typeof APP_SUSPEND_CHANNEL | typeof APP_RESUME_CHANNEL, callback: () => void): Unsubscribe {
  const listener = () => callback(); ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.off(channel, listener); };
}
/** Main's resolved online configuration (web build spec §3.3), read once and frozen. Anything malformed is disabled. */
function readOnlineConfig(): PageOnlineConfig {
  try {
    const value: unknown = ipcRenderer.sendSync(ONLINE_CONFIG_CHANNEL);
    if (validatePageOnlineConfig(value)) return Object.freeze({ ...value });
  } catch { /* disabled below */ }
  return Object.freeze({ ...DISABLED_PAGE_ONLINE_CONFIG });
}
// The close handshake: main pushes a request number; the page's handler runs; the same number is answered.
let exitHandler: (() => Promise<void>) | undefined;
ipcRenderer.on(APP_PREPARE_EXIT_CHANNEL, (_event, request: unknown) => {
  if (!Number.isSafeInteger(request) || (request as number) <= 0) return;
  const handler = exitHandler;
  void Promise.resolve().then(() => handler?.()).catch(() => {}).finally(() => { void ipcRenderer.invoke(APP_PREPARE_EXIT_CHANNEL, request).catch(() => {}); });
});
const api: FtlitePreloadApi = {
  onlineConfig: readOnlineConfig(),
  onSuspend: callback => lifecycle(APP_SUSPEND_CHANNEL, callback),
  onResume: callback => lifecycle(APP_RESUME_CHANNEL, callback),
  onPrepareExit(handler) {
    if (typeof handler !== 'function') return () => {};
    exitHandler = handler;
    return () => { if (exitHandler === handler) exitHandler = undefined; };
  },
  async recordDuel(record) { try { return (await ipcRenderer.invoke(DUEL_RECORD_CHANNEL, structuredClone(record))) === true; } catch { return false; } },
  window: {
    async isFullScreen() { try { return (await ipcRenderer.invoke(WINDOW_FULLSCREEN_CHANNEL)) === true; } catch { return false; } },
    async setFullScreen(on) { try { return (await ipcRenderer.invoke(WINDOW_FULLSCREEN_CHANNEL, on === true)) === true; } catch { return false; } }
  }
};
contextBridge.exposeInMainWorld('ftlite', api);
```

- [ ] **Step 4: Rewrite the renderer bridge and wire the page session**

`src/renderer/src/app/onlineBridge.ts` (replace the whole file):

```ts
import { copyOnlinePortDescriptor, copyOnlineStatus, validateOnlinePortDescriptor, validateOnlineStatusEnvelope,
  type OnlinePortDescriptor, type OnlinePreloadApi, type OnlineStatus, type Unsubscribe } from '../../../shared/onlineSession';

export type OnlinePortListener = (descriptor: OnlinePortDescriptor, port: MessagePort) => void;
/** The page's online facade (app/online/pageSession.ts): the former preload API plus direct game-port delivery. */
export interface PageOnlineApi extends OnlinePreloadApi { onPort(callback: OnlinePortListener): Unsubscribe }
/** The UI's view of the page session: validated status, one game-port owner, and the named online actions only. */
export function createOnlineBridge(api: PageOnlineApi) {
  let disposed = false, epoch = 0, portListener: OnlinePortListener | undefined;
  const removers = new Set<Unsubscribe>();
  const offPort = api.onPort((descriptor, port) => {
    const close = () => { try { port.close(); } catch { /* detached */ } };
    if (disposed || !validateOnlinePortDescriptor(descriptor) || descriptor.epoch <= epoch) { close(); return; }
    epoch = descriptor.epoch;
    if (!portListener) { close(); return; }
    try { portListener(copyOnlinePortDescriptor(descriptor), port); } catch { close(); }
  });
  const { host, join, ready, removeSeat, viewState, reconnect, rehost, start, retry, leave, forgetSeat, readStatus, linkStats } = api;
  return {
    host, join, ready, removeSeat, viewState, reconnect, rehost, start, retry, leave, forgetSeat, readStatus, linkStats,
    onPort(callback: OnlinePortListener): Unsubscribe {
      if (disposed) return () => {};
      if (portListener) throw Error('invalid-port');
      portListener = callback;
      return () => { if (portListener === callback) portListener = undefined; };
    },
    onStatus(callback: (status: OnlineStatus) => void): Unsubscribe {
      if (disposed) return () => {};
      let removed = false, revision = 0;
      const accept = (value: unknown) => {
        if (removed || disposed || !validateOnlineStatusEnvelope(value) || value.revision <= revision) return;
        revision = value.revision;
        try { callback(copyOnlineStatus(value.status)); } catch { /* isolate UI observers */ }
      };
      const off = api.onStatus(accept);
      // Subscribe first: a newer push wins over an initial read that resolves later.
      void api.readStatus().then(accept, () => {});
      const remove = () => { if (!removed) { removed = true; off(); removers.delete(remove); } };
      removers.add(remove); return remove;
    },
    dispose(): void {
      if (disposed) return; disposed = true; offPort(); portListener = undefined;
      for (const off of [...removers]) off(); removers.clear();
    }
  };
}
```

In `src/renderer/src/main.ts`:
- After line 15 (`import { createOnlineBridge } from './app/onlineBridge';`) add:

```ts
import { createPageOnline } from './app/online/pageSession';
import { validatePageOnlineConfig } from '../../shared/onlineConfig';
```

- Replace line 78 (`const bridge = window.ftlite?.online ? createOnlineBridge(window, window.ftlite.online) : null;`) with:

```ts
  // The online session runs in this page (web build spec §3.3); Electron's preload hands it main's resolved config.
  const onlineConfig = window.ftlite?.onlineConfig;
  const pageOnline = onlineConfig && validatePageOnlineConfig(onlineConfig) ? createPageOnline(onlineConfig, { window }) : null;
  const bridge = pageOnline ? createOnlineBridge(pageOnline) : null;
  const offPrepareExit = window.ftlite?.onPrepareExit?.(() => pageOnline ? pageOnline.prepareExit() : Promise.resolve());
```

- In the `beforeunload` handler (lines 148-151), add `offPrepareExit?.();` before `offPort?.();`.

- [ ] **Step 5: Build config, tsconfig and the bridge's old window path**

`electron.vite.config.ts` (replace the whole file):

```ts
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import { computeContentDigest } from './build/contentDigest';
import { ensureIsolatedBuildReporterOutput } from './build/isolatedBuildReporter';
import { computeBuildInfo } from './build/buildInfo';

ensureIsolatedBuildReporterOutput();
const digest = JSON.stringify(computeContentDigest(import.meta.dirname));
export default defineConfig({
  // Electron's main is a thin window (web build spec §3.3); the session, peers and host Worker are page code.
  main: {
    envDir: false,
    define: { __FTLITE_PACKAGED_SERVICE_ORIGIN__: JSON.stringify(process.env['FTLITE_PACKAGED_SERVICE_ORIGIN'] ?? '') },
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } }
  },
  // Sandboxed preloads cannot require a relative shared chunk. Inline the entry's validators.
  preload: { envDir: false, build: { isolatedEntries: true, externalizeDeps: false, rollupOptions: { input: { index: resolve('src/preload/index.ts') } } } },
  // Repo-root public/ is copied verbatim into out/renderer/ at build (assets, manifest, notices).
  renderer: {
    envDir: false,
    // electron-vite's renderer defaults use `envDir || root`; restore the
    // explicit opt-out after that config hook and before Vite loads env files.
    plugins: [react(), { name: 'no-renderer-env-files', enforce: 'post', config: () => ({ envDir: false }) }],
    publicDir: resolve('public'),
    define: { __GAMEPLAY_CONTENT_DIGEST__: digest, __FTLITE_BUILD__: JSON.stringify(computeBuildInfo(import.meta.dirname)) },
    // The host Worker (spec §3.2) is one ES module at a fixed name, so the gates can find and hash it.
    worker: { format: 'es', rollupOptions: { output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name]-[hash].js' } } },
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } }
  }
});
```

In `tsconfig.web.json` `include`: remove `"src/renderer/networkTransport.ts"`, `"src/utility/**/*"` and `"src/main/network/**/*"`.

In `src/network/transport/bridge.ts`, delete `installTransportBridge` and `startTransportBridge` and the imports only they used (`isHostIdentity`, `matchesIdentity`, `TRANSPORT_CHANNEL`, `isRtcRequest`, `RTC_REQUEST_CHANNEL`, `RTC_RESPONSE_CHANNEL`, `createTransportController`, `HiddenControllerOptions`, `PortEndpoint`), leaving the `browserPortEndpoint` alias and `connectTransportPort`:

```ts
import type { HostIdentity } from '../../shared/hostProcessProtocol';
import { SESSION_PROTOCOL_VERSION } from '../../shared/netSession';
import { webPortEndpoint } from '../platformPort';

/** The game's port adapter (renderer app/onlineSession.ts) and the controller's: one browser endpoint. */
export const browserPortEndpoint = webPortEndpoint;
/** Answer the host Worker's transport port (web build spec §3.2): the page-side half of the Worker owner's readiness. */
export function connectTransportPort(port: MessagePort, identity: HostIdentity): void {
  port.addEventListener('messageerror', () => port.close());
  port.start();
  port.postMessage({ kind: 'transport-ready', protocolVersion: SESSION_PROTOCOL_VERSION, ...identity });
}
```

- [ ] **Step 6: Delete the Electron-only online code and its tests**

```bash
git rm src/main/network/transportWindow.ts src/main/network/onlinePlatform.ts src/main/network/onlineIpc.ts src/main/network/onlineExit.ts \
  src/main/network/hostProcess.ts src/main/network/rtcTransport.ts src/main/network/onlineSession.ts src/main/network/onlinePeers.ts \
  src/main/network/onlineDuel.ts src/main/network/onlineSector.ts src/main/network/onlineMirrors.ts src/main/network/onlineModes.ts \
  src/main/network/onlineIce.ts src/main/network/onlineRetry.ts src/main/network/onlineConfig.ts src/main/network/seatStore.ts src/main/network/mirrorStore.ts \
  src/preload/networkTransport.ts src/renderer/networkTransport.ts src/renderer/networkTransport.html src/utility/authorityHost.ts src/utility/authorityModes.ts \
  tests/onlineIpc.test.ts tests/onlineExit.test.ts tests/onlinePlatform.test.ts tests/transportWindow.test.ts tests/hostProcess.test.ts
ls src/main/network
```

Expected: only `duelRecords.ts` remains.

Then fix the remaining test references:
- `tests/uiBoundary.test.ts:20`: remove `'src/utility'` from `NO_UI_LIB_ROOTS`.
- `tests/rtcBridge.test.ts`: delete the `installTransportBridge` import (line 3) and `RTC_REQUEST_CHANNEL` from line 4's import; replace the last case (`'rejects an unexpected window source and releases every bridge port on pagehide'`, lines 137-143) with:

```ts
  it('answers a transport port with transport-ready for its identity only (web build spec §3.2)', async () => {
    const channel = new MessageChannel();
    const received = new Promise(resolve => { channel.port2.addEventListener('message', event => resolve((event as MessageEvent).data), { once: true }); channel.port2.start(); });
    connectTransportPort(channel.port1, identity);
    expect(await received).toEqual({ kind: 'transport-ready', protocolVersion: 2, ...identity });
    channel.port1.close(); channel.port2.close();
  });
```

  and add `import { connectTransportPort } from '../src/network/transport/bridge';`.
- `tests/linkStats.test.ts`: delete line 13 (the `OnlineSessionOwner` import from `src/main/network/onlineSession`), lines 15-20 (the `native` hoist, the `electron` mock and the `registerOnlineIpc` import) and the last line (`afterEach(() => native.handlers.clear());`); add `import { createPageOnline } from '../src/renderer/src/app/online/pageSession';` and `import { createMemoryRecordStore } from '../src/network/online/recordStore';`; replace the case `'the renderer channel answers validated figures to the trusted window only, and is removed with the rest'` (lines 113-128) with:

```ts
  it('the page facade answers validated figures only (web build spec §3.3)', async () => {
    let stats: unknown = { route: 'internet', rttMs: 48.5 };
    const owner = { dispatch: vi.fn(async () => ({ ok: true as const })), status: () => ({ phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null,
      mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: [] }),
      subscribe: () => () => {}, suspend: async () => {}, resume: async () => {}, prepareExit: async () => {}, dispose: async () => {}, releaseForUnload() {}, linkStats: () => stats as never };
    const online = createPageOnline({ serviceOrigin: null, iceMode: 'turn', allowInsecureLocalhost: false, packaged: true, sectorOnlineTest: false, duelTestSeed: null, testProbe: false },
      { window: new EventTarget(), records: createMemoryRecordStore(), lifecycle: { onSuspend: () => () => {}, onResume: () => () => {}, dispose() {} }, createSession: () => owner as never });
    expect(await online.linkStats!()).toEqual({ route: 'internet', rttMs: 48.5 });
    stats = { route: 'internet', rttMs: 48.5, address: '203.0.113.9' }; expect(await online.linkStats!()).toBeNull();
    stats = null; expect(await online.linkStats!()).toBeNull();
    await online.dispose();
  });
```

- `tests/build-output.test.ts`: add a case inside its `describe`:

```ts
  it('ships the host Worker chunk and no hidden transport page (web build spec §3.2, §3.3)', () => {
    expect(existsSync('out/renderer/assets/authorityWorker.js')).toBe(true);
    expect(existsSync('out/renderer/networkTransport.html')).toBe(false);
    expect(existsSync('out/main/authorityHost.js')).toBe(false); expect(existsSync('out/preload/networkTransport.js')).toBe(false);
  });
```

Finally confirm nothing still points at the deleted modules:

```bash
grep -rn "src/main/network/\(online\|hostProcess\|transportWindow\|rtcTransport\|seatStore\|mirrorStore\)\|src/utility\|networkTransport\|ONLINE_CHANNELS\|ONLINE_PORT_SOURCE\|RTC_REQUEST_CHANNEL\|TRANSPORT_READY_CHANNEL\|installTransportBridge\|window\.ftlite\.online\|ftlite?\.online" src tests --include=*.ts --include=*.tsx
```

Expected: no output. (`scripts/network/*` still reference the old topology; Tasks 9-11 rewrite them. They are runtime scripts; `npm run typecheck` covers only their `.ts` files, none of which import a deleted module after Task 3's `onlineConfig` path fix.)

- [ ] **Step 7: The Electron Worker boot check**

`scripts/network/worker-boot.cjs`:

```js
// Electron check (web build spec §3.2): the built page, loaded from file://, starts the module host Worker and it answers.
// No preload and no service: the Worker is asked to initialize with a foreign digest and must refuse it.
const { app, BrowserWindow } = require('electron');
const { resolve } = require('node:path');
app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const timer = setTimeout(() => { console.error('WORKER BOOT FAIL: timeout'); app.exit(1); }, 15000);
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
    await win.loadFile(resolve(__dirname, '../../out/renderer/index.html'));
    const answer = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./assets/authorityWorker.js', location.href), { type: 'module' });
      worker.addEventListener('error', event => reject(String(event.message || 'worker error')));
      worker.addEventListener('message', event => { worker.terminate(); resolve(event.data); });
      worker.postMessage({ kind: 'initialize', protocolVersion: 2, modeId: 'duel', schemaVersion: 2, simVersion: 1, contentDigest: '0'.repeat(64), hostGeneration: 1 });
    })`);
    if (answer?.kind !== 'fatal' || answer.reason !== 'incompatible-identity') throw Error('unexpected answer ' + JSON.stringify(answer));
    console.log('WORKER BOOT PASS: module Worker started from the file:// page and answered');
    clearTimeout(timer); app.exit(0);
  } catch (error) { console.error('WORKER BOOT FAIL:', error?.message ?? error); clearTimeout(timer); app.exit(1); }
});
```

Add to `package.json` scripts: `"test:worker-boot": "electron-vite build && electron scripts/network/worker-boot.cjs",`.

Run: `npm run test:worker-boot`
Expected: `WORKER BOOT PASS: …`. If it fails with a module-script or cross-origin error from the `file://` page, take deviation D-6 and change every Worker to a classic script, then rerun:
- `electron.vite.config.ts`: `worker: { format: 'iife', … }`; `defaultAuthorityWorker`: `new Worker(new URL('../../worker/authorityWorker.ts', import.meta.url))` without `{ type: 'module' }`; `worker-boot.cjs`: drop `{ type: 'module' }`.
- Every harness Worker drops `{ type: 'module' }` and its Vite build uses `worker: { format: 'iife' }`: `host-smoke-page.ts`, `lease-smoke-page.ts`, `rtc-page.ts` (Tasks 9-10), and `scripts/web/bg-tab/page.ts` stays a module Worker (it runs on http, not `file://`).
- The lease wrapper (Task 9 Step 5) becomes a classic script, `importScripts('lease-observer.js', <worker URL>);`, with `lease-smoke-observer.ts` built as `formats: ['iife']` (drop its `export {};`).
- The recovery prelude concatenation (Task 11 Step 2) is unchanged: prelude-then-chunk is valid for a classic script.
- Record D-6 as taken in the deviations list.

- [ ] **Step 8: Run the full unit suite, typecheck and the build test**

```bash
npm run typecheck
npx vitest run tests/appExit.test.ts tests/onlineBridge.test.ts tests/rtcBridge.test.ts tests/linkStats.test.ts tests/uiBoundary.test.ts tests/networkBoundary.test.ts tests/pageBoundary.test.ts tests/build-output.test.ts
npm test
```

Expected: typecheck clean; the named suites PASS; `npm test` PASS apart from the known load flakes (rerun any of them alone). `tests/onlineRecoveryInstrumentation.test.ts` fails here because it reads `out/main/authorityHost.js`; Task 11 moves it to the Worker chunk. Record that one expected failure in the commit message.

- [ ] **Step 9: Manual boot**

Run `npm run dev`, open Multiplayer, confirm the menu shows the online screen with "online disabled" (no service configured) and Single player still plays. Close the window and confirm it closes promptly (the close handshake answers at once with no session). Then `FTLITE_LOCAL_SERVICE_URL=http://127.0.0.1:8787 npm run dev` against a local `wrangler dev` (see Task 8 Step 4 for the dev origin) and confirm Host shows a join code.

- [ ] **Step 10: Commit**

```bash
git add src/main/index.ts src/main/appExit.ts src/preload/index.ts src/shared/onlineSession.ts src/shared/hostProcessProtocol.ts src/shared/rtcSession.ts \
  src/network/transport/bridge.ts src/renderer/src/app/onlineBridge.ts src/renderer/src/main.ts electron.vite.config.ts tsconfig.web.json package.json \
  scripts/network/worker-boot.cjs tests/appExit.test.ts tests/onlineBridge.test.ts tests/rtcBridge.test.ts tests/linkStats.test.ts tests/uiBoundary.test.ts tests/build-output.test.ts
git commit -m "feat(web-i): Electron becomes a thin window; the online stack runs in the page and the host in a Worker

Deletes the utility process, the hidden transport window, the RTC IPC channels and the online half of window.ftlite.
onlineRecoveryInstrumentation still reads out/main/authorityHost.js until Task 11.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(The `git rm` in Step 6 already staged the deletions.)

---

### Task 8: Signalling: expose the checkpoint header and test socket origins (spec §6, deviation D-2; not deployed)

**Files:**
- Modify: `services/signalling/src/index.ts:57-71`
- Create: `services/signalling/tests/origins.test.ts`
- Modify: `services/signalling/scripts/local-runtime.ts` (optional `allowedOrigins`), `services/signalling/README.md` (local dev origin note)

**Interfaces:**
- Produces: `startLocalRuntime(directory: string, options?: { allowedOrigins?: string })` (the default keeps today's behaviour; Web-ii's browser gates pass `null,http://localhost:<port>,http://127.0.0.1:<port>`).

- [ ] **Step 1: Write the failing origin tests**

`services/signalling/tests/origins.test.ts`:

```ts
import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import worker from '../src/index';
import { compatibility, create, request } from './helpers';

const bindings = { IP_HASH_SALT: 'synthetic-runtime-test-salt', ALLOWED_ORIGINS: 'https://allowed.example' };
function call(path: string, headers: Record<string, string>) {
  return worker.fetch(new Request('https://service' + path, { headers: { 'CF-Connecting-IP': '192.0.2.1', ...headers } }), { ...env, ...bindings });
}
it('exposes X-FTL-Checkpoint to a listed https origin and to Origin: null, and to no request without an Origin (web build spec §6)', async () => {
  const session = await create(2);
  for (const origin of ['https://allowed.example', 'null']) {
    const response = await call(`/v2/rooms/${session.snapshot.roomId}/checkpoint`, { Authorization: `Bearer ${session.seatToken}`, Origin: origin });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('X-FTL-Checkpoint');
    await response.body?.cancel();
  }
  const bare = await request('/v2/rooms', { compatibility, capacity: 1 });
  expect(bare.status).toBe(200); expect(bare.headers.get('Access-Control-Expose-Headers')).toBeNull();
});
it('refuses a socket upgrade from a disallowed origin and accepts a listed origin, null and file://', async () => {
  const session = await create(2), path = `/v2/rooms/${session.snapshot.roomId}/socket`;
  expect((await call(path, { Upgrade: 'websocket', Origin: 'https://evil.example' })).status).toBe(403);
  for (const origin of ['https://allowed.example', 'null', 'file://']) {
    const response = await call(path, { Upgrade: 'websocket', Origin: origin });
    expect(response.status).toBe(101);
    response.webSocket!.accept(); response.webSocket!.close(1000);
  }
});
```

Run: `npm run test:signalling -- tests/origins.test.ts`
Expected: FAIL (no `Access-Control-Expose-Headers`; `file://` gets 403).

- [ ] **Step 2: Change the wrapper**

In `services/signalling/src/index.ts`, replace the `fetch` handler (lines 58-71). The checkpoint, turn and socket routes return `room.fetch(...)` directly, and a Response from a Durable Object stub's fetch has immutable headers; until now only the mutable `Response.json` replies of `POST /v2/rooms` ever got CORS headers (Electron main sent no Origin). The handler therefore copies the response before setting headers. It reads:

```ts
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    // A missing origin, the string null (Electron's file:// page over fetch) and file:// (a Chromium WebSocket handshake
    // from a file:// page) are allowed in code; any other origin must be listed in ALLOWED_ORIGINS (web build spec §6).
    const local = origin === null || origin === 'null' || origin === 'file://';
    const allowed = local || (env.ALLOWED_ORIGINS ?? '').split(',').map(x => x.trim()).includes(origin!);
    let response: Response;
    try { response = allowed ? await route(request, env) : serviceError('forbidden', 403); }
    catch (error) { response = errorResponse(error); }
    finally {
      // Early auth/origin/route failures must also release an unread request.
      // Never await an untrusted stream's cancellation promise.
      if (!request.body?.locked) void request.body?.cancel().catch(() => {});
    }
    if (allowed && origin !== null) {
      // Responses from a Durable Object stub's fetch (checkpoint, turn, socket) carry immutable headers: copy before setting.
      response = response.status === 101 && response.webSocket
        ? new Response(null, { status: 101, webSocket: response.webSocket, headers: response.headers })
        : new Response(response.body, response);
      response.headers.set('Access-Control-Allow-Origin', origin); response.headers.set('Vary', 'Origin');
      // A page reads the checkpoint metadata header of a checkpoint GET (rehost and mirror refresh, spec §2.4).
      response.headers.set('Access-Control-Expose-Headers', 'X-FTL-Checkpoint');
    }
    return response;
  },
```

- [ ] **Step 3: Run the service gates**

Run: `npm run test:signalling && npm run typecheck:signalling`
Expected: PASS (including the existing `http.test.ts` origin case).

- [ ] **Step 4: Local runtime origins and the dev note**

In `services/signalling/scripts/local-runtime.ts`, change the signature to `export async function startLocalRuntime(directory: string, options: { allowedOrigins?: string } = {})` and the bindings line to:

```ts
      bindings: { IP_HASH_SALT: 'synthetic-local-native-gate-salt', ...(options.allowedOrigins ? { ALLOWED_ORIGINS: options.allowedOrigins } : {}) },
```

Append to `services/signalling/README.md`:

```markdown
## Local dev with Electron's dev page (Web-i)

The online session now runs in the page. A built Electron page (`file://`) sends `Origin: null` (or `file://` on a
socket), which the Worker allows in code. `npm run dev` serves the page from the electron-vite dev server instead, so a
local `wrangler dev` needs that origin listed: put `ALLOWED_ORIGINS=null,http://localhost:5173` in
`services/signalling/.dev.vars` (gitignored). Production's `ALLOWED_ORIGINS` secret changes only at Web-iii.
```

Run: `npm run test:signalling && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/signalling/src/index.ts services/signalling/tests/origins.test.ts services/signalling/scripts/local-runtime.ts services/signalling/README.md
git commit -m "feat(signalling): expose X-FTL-Checkpoint to pages; socket-origin tests; file:// treated like null (not deployed)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Electron gates (Tasks 9-11): shared rules

Every script in spec §8's table that loaded the utility process, the hidden window or `powerMonitor` is rewritten for the page topology. All of them still run actual Electron 37.10.3 (and, where they did, actual local workerd 1.20261023.1) and keep every failure injection exiting nonzero. These rules apply to Tasks 9, 10 and 11:

- **The production Worker is the built chunk.** Harness pages create it with `new Worker(<file URL of out/renderer/assets/authorityWorker.js>, { type: 'module' })`, passed in by the launcher as a `worker=` query parameter; the owner is the production `startWorkerHost`/`createWorkerHostPlatform` bundled into the harness page by its Vite build. Harness Vite builds set `worker: { format: 'es' }`.
- **Harness windows** are `sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false` (the production window's settings).
- **Report field renames** (validators, fixtures and drivers change together):

| Old field | New field | Meaning now |
|---|---|---|
| `utilities`, `utilityExits` | `workers`, `workerExits` | Host Workers created; Workers terminated (by the owner's `kill`, or after an `error` event) |
| `utilityPids` | `workerIds` | Creation indexes (a Worker has no OS process) |
| `actualExits` (RTC `owner-cleanup`) | `workerExits` | as above |
| `utilitiesCreated` (recovery contenders) | `workersCreated` | as above |
| `nativeWindows`, `nativeWindowExits` | (removed) | there is no hidden window |
| `nativePeersEndedWithWindow` | `nativePeersEndedWithPage` | peer connections still open when their page was destroyed |
| `observedMainPorts` | `observedPagePorts` | `MessagePort`s the page created (via `MessageChannel`) |
| `ports` | `ports` | page `MessagePort`s neither closed nor transferred at the observation point (must be 0) |
| `windows` | `windows` | `BrowserWindow`s left at the end (must be 0) |
| `listeners` | `listeners` | main-process listeners left on `app:online-config` and handlers on `app:prepare-exit` after close (must be 0) |
| `resourcesBeforeForcedExit.utilities`, `forcedUtilityExits` | `resourcesBeforeForcedExit.workers`, `forcedRendererExits` | the killed app's renderer PIDs (`webContents.getOSProcessId()`), observed gone |

- **Utility/hidden-window exit checks become Worker checks:** "the utility exited" becomes "the Worker was terminated and the owner reported `worker-exit` or `disposed`"; "the hidden window was destroyed" becomes "the page transport was disposed and every page `MessagePort` it owned is closed".

---

### Task 9: Gates I: the host runtime and lease smokes (spec §8 rows `test:host-runtime` and `lease-smoke`)

**Files:**
- Modify: `scripts/network/host-smoke-page.ts` (owner API), `scripts/network/host-smoke.cjs` (rewrite), `scripts/network/host-smoke.ts` (build, required checks, report)
- Create: `scripts/network/lease-smoke.html`, `scripts/network/lease-smoke-page.ts`, `scripts/network/lease-smoke-observer.ts`
- Rewrite: `scripts/network/lease-smoke.cjs`; Modify: `scripts/network/lease-smoke.ts`

**Interfaces:**
- Consumes: `startWorkerHost`, `createWorkerHostPlatform`, `WorkerLike` (Task 5); `bytesToBase64`, `base64ToBytes` (Task 2).
- Produces: the page APIs `window.hostSmoke.owner` and `window.leaseSmoke` below (harness only).

- [ ] **Step 1: Give the host-smoke page an owner role**

The harness now uses two pages built from the same `scripts/network/index.html`: an **owner** page (`?role=owner&worker=<URL>`) that owns the production Worker hosts, and the existing **producer** page (`?role=producer`) whose client run stalls. Keeping them apart preserves the old topology: the producer can busy-loop while main still queries the authority through the owner page. Game ports go owner page → preload → main → producer page, the same `host-smoke-port` path the producer already listens on.

Append to `scripts/network/host-smoke-page.ts` (the producer code above it stays):

```ts
import { createWorkerHostPlatform, startWorkerHost, type HostProcessHandle, type WorkerLike } from '../../src/network/host/workerHost';
import { base64ToBytes, bytesToBase64 } from '../../src/shared/bytes';

// The owner role (Web-i): production Worker owners over the built production Worker, driven by main through
// executeJavaScript. Bytes cross the executeJavaScript boundary as base64.
type StartMode = 'normal' | 'abort-before' | 'abort-after-spawn' | 'crash-on-spawn';
interface HostEntry { handle?: HostProcessHandle; exit?: string; starting: Promise<void>; abort: AbortController; worker?: Worker;
  terminated: boolean; errored: boolean; lastOkResponse?: unknown; intercept?: (message: any) => boolean }
const params = new URLSearchParams(location.search);
if (params.get('role') === 'owner') {
  const workerUrl = params.get('worker')!;
  const suspends = new Set<() => void>(), resumes = new Set<() => void>();
  const lifecycle = { onSuspend(cb: () => void) { suspends.add(cb); return () => { suspends.delete(cb); }; }, onResume(cb: () => void) { resumes.add(cb); return () => { resumes.delete(cb); }; } };
  const hosts = new Map<number, HostEntry>();
  let nextHost = 0;
  const entry = (id: number) => { const value = hosts.get(id); if (!value) throw Error('host-unknown'); return value; };
  const handle = (id: number) => { const value = entry(id).handle; if (!value) throw Error('host-unavailable'); return value; };
  // Each host's Worker is observed from construction; the helpers abort or crash it inside the spawn task itself.
  function observedWorker(value: HostEntry, mode: StartMode): () => WorkerLike {
    return () => {
      const worker = new Worker(workerUrl, { type: 'module' }); value.worker = worker;
      const terminate = worker.terminate.bind(worker); worker.terminate = () => { value.terminated = true; terminate(); };
      worker.addEventListener('error', () => { value.errored = true; });
      // Registered before the spawn adapter's own listener, so an armed interception is consumed first.
      worker.addEventListener('message', event => {
        const message = event.data;
        if (value.intercept?.(message)) { event.stopImmediatePropagation(); return; }
        if (message?.kind === 'response' && message.response?.ok && value.lastOkResponse === undefined) value.lastOkResponse = structuredClone(message);
      });
      if (mode === 'abort-after-spawn') value.abort.abort();
      // A microtask: after startWorkerHost's synchronous body has subscribed, before any Worker reply can arrive.
      if (mode === 'crash-on-spawn') queueMicrotask(() => worker.dispatchEvent(new ErrorEvent('error', { message: 'injected worker crash', cancelable: true })));
      return worker;
    };
  }
  const encodeCommand = (command: any) => command.kind === 'start' ? { ...command, initBytes: base64ToBytes(command.initBytes) }
    : command.kind === 'restore' ? { ...command, checkpointBytes: base64ToBytes(command.checkpointBytes) } : command;
  const decodeResponse = (response: any) => response.ok && response.checkpointBytes ? { ...response, checkpointBytes: bytesToBase64(response.checkpointBytes) } : response;
  const owner = {
    start(options: object, mode: StartMode = 'normal'): number {
      const id = ++nextHost, value: HostEntry = { abort: new AbortController(), terminated: false, errored: false, starting: Promise.resolve() };
      hosts.set(id, value);
      if (mode === 'abort-before') value.abort.abort();
      value.starting = startWorkerHost({ ...options, signal: value.abort.signal } as never, createWorkerHostPlatform({ lifecycle, createWorker: observedWorker(value, mode) }))
        .then(h => { value.handle = h; h.onExit(reason => { value.exit = reason; }); }, error => { value.exit = String(error?.message ?? error); });
      return id;
    },
    async settled(id: number) { await entry(id).starting; const value = entry(id); return { ready: !!value.handle, exit: value.exit ?? null }; },
    exit: (id: number) => entry(id).exit ?? null,
    async request(id: number, command: object) { return decodeResponse(await handle(id).request(encodeCommand(command))); },
    async attachLocal(id: number, peer: string, players: number[], options?: object) {
      const { port1, port2 } = new MessageChannel();
      await handle(id).attachPeer(peer, players, port1, options as never);
      // The preload forwards this port to main, which hands it to the producer page (its existing host-smoke-port path).
      window.postMessage({ kind: 'host-smoke-port-out' }, '*', [port2]);
    },
    async dispose(id: number) { await handle(id).dispose(); },
    suspend() { for (const cb of [...suspends]) cb(); },
    resume() { for (const cb of [...resumes]) cb(); },
    /** A Worker crash: an error event on that host's Worker object, which the spawn adapter treats as an exit. */
    crashWorker(id: number) { entry(id).worker!.dispatchEvent(new ErrorEvent('error', { message: 'injected worker crash', cancelable: true })); },
    /** The page transport lost: its controller disposed by its user. */
    async killTransport(id: number) { await handle(id).transport.dispose(); },
    /** One real ok response captured from host `from`'s Worker (the stale-generation replay). */
    lastOkResponse: (from: number) => entry(from).lastOkResponse ?? null,
    /** Replay a message into host `to`'s owner exactly as if its Worker had posted it. */
    inject(to: number, message: unknown) { entry(to).worker!.dispatchEvent(new MessageEvent('message', { data: message })); },
    /** Arm, on host `id`, a one-shot interception of the Worker reply with this request id; resolves with that reply. */
    intercept(id: number, requestId: number) {
      const value = entry(id);
      return new Promise(resolve => { value.intercept = message => {
        if (message?.kind !== 'response' || message.response?.requestId !== requestId) return false;
        value.intercept = undefined; resolve(message.response); return true;
      }; });
    },
    /** Post a raw command straight to host `id`'s Worker, bypassing its owner. */
    rawCommand(id: number, command: object) { entry(id).worker!.postMessage({ kind: 'command', command }); },
    counts() {
      const byHost: Record<number, { created: boolean; terminated: boolean; errored: boolean }> = {};
      for (const [id, value] of hosts) byHost[id] = { created: !!value.worker, terminated: value.terminated, errored: value.errored };
      const created = [...hosts.values()].filter(v => v.worker);
      return { workers: created.length, terminated: created.filter(v => v.terminated).length, byHost };
    }
  };
  (window as any).hostSmoke = { owner };
}
```

`scripts/network/host-smoke-preload.cjs` (replace the whole file):

```js
// Harness-only preload; never included in the production build or renderer API.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hostSmokeReport', value => ipcRenderer.send('host-smoke-event', value));
// Producer page: a port handed over by main.
ipcRenderer.on('host-smoke-port', event => {
  window.postMessage({ kind: 'host-smoke-port' }, '*', event.ports);
});
// Owner page: a game port the page posts to itself goes to main (the documented main-world MessagePort pattern).
window.addEventListener('message', event => {
  if (event.source === window && event.data?.kind === 'host-smoke-port-out' && event.ports.length === 1) ipcRenderer.postMessage('host-smoke-port-out', null, [...event.ports]);
});
```

- [ ] **Step 2: Rewrite the host-smoke main harness**

`scripts/network/host-smoke.cjs` (replace the whole file; the checks and their assertions are the old ones over the owner page, with the topology-specific lines changed):

```js
// Actual Electron harness (Web-i). The owner page runs production Worker owners over the built production Worker; the
// producer page runs the production client. All control and observation hooks live here and in host-smoke-page.ts.
const { app, BrowserWindow, ipcMain } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const directory = app.commandLine.getSwitchValue('host-smoke-dir');
const profile = app.commandLine.getSwitchValue('user-data-dir');
if (!directory || resolve(profile) !== resolve(directory, 'profile')) throw Error('isolated smoke profile required');
app.setPath('userData', profile); app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
const { init, checkpoint: fixture, offsets } = JSON.parse(readFileSync(join(directory, 'fixture.json'), 'utf8'));
const options = { modeId: 'sector', schemaVersion: 1, simVersion: init.simVersion, contentDigest: init.contentDigest, hostGeneration: 1 };
const workerUrl = pathToFileURL(resolve(__dirname, '../../out/renderer/assets/authorityWorker.js')).href;
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const decode = value => JSON.parse(new TextDecoder().decode(value));
const b64 = value => Buffer.from(value).toString('base64');
const assert = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(done => setTimeout(done, ms));
const checks = [], details = {}, hosts = [];
let owner, visible, fatalError, rejectFatal;
const fatal = new Promise((_, reject) => { rejectFatal = reject; }); void fatal.catch(() => {});
function fail(error) { if (!fatalError) { fatalError = error instanceof Error ? error : Error(String(error)); rejectFatal(fatalError); } }
function evidence(check, detail) { checks.push(check); details[check] = detail; console.log(`ACTUAL ${check}: ${detail}`); }
function bounded(promise, label, milliseconds = 3000) {
  let timer;
  return Promise.race([promise, fatal, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label} timeout`)), milliseconds); })])
    .finally(() => clearTimeout(timer));
}
async function until(read, predicate, label, milliseconds = 2500) {
  const deadline = performance.now() + milliseconds;
  let value;
  while (performance.now() < deadline) {
    if (fatalError) throw fatalError;
    value = await read(); if (predicate(value)) return value;
    await delay(10);
  }
  throw Error(`${label} timeout; last=${JSON.stringify(value)}`);
}
const ownerJs = source => bounded(owner.webContents.executeJavaScript(source), 'owner page call', 8000);
const js = source => bounded(visible.webContents.executeJavaScript(source), 'producer page call');
const counts = () => ownerJs('window.hostSmoke.owner.counts()');
/** One owner-page Worker host, with the HostProcessHandle method names the checks use. */
async function startHost(overrides = {}, mode = 'normal') {
  const id = await ownerJs(`window.hostSmoke.owner.start(${JSON.stringify({ ...options, ...overrides })}, ${JSON.stringify(mode)})`);
  const call = (method, ...args) => ownerJs(`window.hostSmoke.owner.${method}(${[id, ...args].map(a => JSON.stringify(a)).join(', ')})`);
  const host = {
    id,
    settled: () => call('settled'),
    exit: () => call('exit'),
    reason: () => until(() => call('exit'), value => value !== null, `host ${id} exit`, 4000),
    async request(command) {
      const wire = command.kind === 'start' ? { ...command, initBytes: b64(command.initBytes) } : command.kind === 'restore' ? { ...command, checkpointBytes: b64(command.checkpointBytes) } : command;
      const response = await call('request', wire);
      return response.ok && response.checkpointBytes ? { ...response, checkpointBytes: Buffer.from(response.checkpointBytes, 'base64') } : response;
    },
    attachLocal: (peer, players, attach) => call('attachLocal', peer, players, attach ?? null),
    dispose: () => call('dispose'),
    killTransport: () => call('killTransport'),
    crashWorker: () => call('crashWorker'),
    intercept: requestId => call('intercept', requestId),
    rawCommand: command => call('rawCommand', command)
  };
  hosts.push(host); return host;
}
async function ready(generation = 1) {
  const host = await startHost({ hostGeneration: generation });
  const settled = await bounded(host.settled(), 'host ready', 6000);
  assert(settled.ready, `host ${generation} did not become ready: ${settled.exit}`);
  return host;
}
async function request(host, command) {
  const response = await host.request(command);
  assert(response.ok, `${command.kind} rejected: ${JSON.stringify(response)}`); return response;
}
async function checkpoint(host) { return decode((await request(host, { kind: 'checkpoint' })).checkpointBytes); }
function tick(cp) { return cp.snapshot.header.tick; }
function x(cp) { return cp.snapshot.values[offsets['crew.0.x']]; }
async function released(host, label) {
  const state = await until(counts, value => value.byHost[host.id]?.created === false || value.byHost[host.id]?.terminated, `${label} Worker termination`);
  assert(state.byHost[host.id], `${label} host unknown`);
  assert(BrowserWindow.getAllWindows().length === (visible && !visible.isDestroyed() ? 2 : 1), `${label} extra window leaked`);
}
async function dispose(host, label) {
  await host.dispose();
  assert(await host.reason() === 'disposed', `${label} exited unexpectedly before disposal`);
  await released(host, label);
}
const status = () => js('window.hostSmoke.status()');
async function attach(host) {
  await host.attachLocal('visible-human', [0]);
  return until(status, value => value.ready, 'human full sync');
}
async function commandResult(sequence) {
  let found;
  await until(async () => {
    const value = await status(); found = value.results.find(result => result.id.sequence === sequence) ?? found; return value;
  }, () => !!found, `command ${sequence} result`);
  assert(found.status === 'applied' || found.status === 'noop', `semantic command rejected: ${JSON.stringify(found)}`);
  assert(found.admission?.disposition === 'terminal', 'receive-time acknowledgement absent');
  return found;
}
async function page(role, preload) {
  const window = new BrowserWindow({ show: true, width: 640, height: 240, webPreferences: {
    nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, webSecurity: true, preload } });
  await window.loadFile(join(directory, 'page/index.html'), { query: role === 'owner' ? { role, worker: workerUrl } : { role } });
  return window;
}

async function run() {
  const preload = join(__dirname, 'host-smoke-preload.cjs');
  owner = await page('owner', preload);
  // A game port the owner page posts to itself reaches main, which hands it to the producer page.
  const forward = event => {
    if (event.sender !== owner.webContents || event.ports.length !== 1 || !visible || visible.isDestroyed()) { for (const p of event.ports) p.close(); return; }
    visible.webContents.postMessage('host-smoke-port', {}, event.ports);
  };
  ipcMain.on('host-smoke-port-out', forward);
  const events = [];
  const observePage = (event, value) => {
    if (!visible || event.sender !== visible.webContents || event.senderFrame !== visible.webContents.mainFrame) return;
    if (value?.kind === 'page-error') fail(Error(`page exception: ${value.message}`)); else events.push(value);
  };
  ipcMain.on('host-smoke-event', observePage);

  // Early startup failures, each injected inside the spawn task itself (Web-i rewrite of the pre-spawn checks).
  const before = await startHost({}, 'abort-before');
  assert((await before.settled()).exit === 'cancelled' && (await counts()).byHost[before.id].created === false, 'already-cancelled start spawned a Worker');
  const aborted = await startHost({}, 'abort-after-spawn');
  assert(JSON.stringify(await aborted.settled()) === JSON.stringify({ ready: false, exit: 'cancelled' }), 'aborted host became ready');
  await released(aborted, 'early-abort');
  evidence('early-abort', 'already-aborted start spawned nothing; abort inside the spawn task rejected cancelled and terminated the Worker');
  const crashed = await startHost({}, 'crash-on-spawn');
  assert(JSON.stringify(await crashed.settled()) === JSON.stringify({ ready: false, exit: 'worker-exit' }), 'crashed host became ready');
  await released(crashed, 'early-worker-failure');
  evidence('early-worker-failure', 'Worker error before readiness: worker-exit, never ready, Worker terminated');
  for (const [label, overrides] of [['mode-mismatch', { modeId: 'unshipped-mode' }], ['content-mismatch', { contentDigest: '0'.repeat(64) }]]) {
    const host = await startHost(overrides);
    const settled = await host.settled();
    assert(!settled.ready && settled.exit === 'worker-protocol-failure', `${label}: ${settled.exit}`);
    await released(host, label); evidence(label, 'actual Worker rejected initialization; owner stopped and terminated it; page transport disposed');
  }

  visible = await page('producer', preload);
  await until(async () => visible.isVisible(), value => value, 'visible producer window');
  assert(await js('typeof process === "undefined" && typeof require === "undefined"'), 'producer page has Node access');
  if (process.argv.includes('--inject-page-failure')) {
    await js('window.hostSmoke.injectPageFailure()'); await bounded(new Promise(() => {}), 'injected page failure');
  }
  if (process.argv.includes('--inject-child-failure')) throw Error('injected Electron child failure');
  if (process.argv.includes('--inject-timeout')) await new Promise(() => {});

  const first = await ready();
  await request(first, { kind: 'start', initBytes: bytes(init) });
  await request(first, { kind: 'restore', checkpointBytes: bytes(fixture) });
  for (const window of [owner, visible]) {
    const preferences = window.webContents.getLastWebPreferences();
    assert(preferences.sandbox && preferences.contextIsolation && !preferences.nodeIntegration && preferences.webSecurity && !window.webContents.getBackgroundThrottling(),
      'harness page preferences wrong');
  }
  assert(await ownerJs('typeof process === "undefined" && typeof require === "undefined"'), 'owner page has Node access');
  assert(owner.webContents.getOSProcessId() !== visible.webContents.getOSProcessId(), 'owner and producer share a renderer process');
  assert((await counts()).byHost[first.id].created, 'host Worker missing');
  evidence('sandbox-topology', `owner page pid=${owner.webContents.getOSProcessId()} hosts the Worker; producer page pid=${visible.webContents.getOSProcessId()}; both sandboxed; Node off`);
  await attach(first);
  const initialResume = await js('window.hostSmoke.resume()'); await commandResult(initialResume.id.sequence);
  await js('window.hostSmoke.neutralProducer()');
  await until(() => checkpoint(first), cp => tick(cp) >= 4, 'initial authority ticks');
  const held = await js('window.hostSmoke.primeHeld()');
  const beforeStall = await until(() => checkpoint(first), cp => cp.held[0].moveX === 1 && cp.heldHighWater[0] >= held.sequence, 'primed held admission');
  const stallPromise = js('window.hostSmoke.stall()');
  stallPromise.catch(fail);
  const start = await until(async () => events.find(event => event.kind === 'stall-start'), value => !!value, 'stall start');
  const during = [];
  // The owner page and the Worker continue while the producer page is blocked.
  await delay(300); during.push(await checkpoint(first));
  await delay(90); during.push(await checkpoint(first));
  assert(!events.some(event => event.kind === 'stall-end'), 'watchdog inspected after producer resumed');
  assert(tick(during[0]) >= tick(beforeStall) + 12 && tick(during[1]) > tick(during[0]), 'authority waited for visible input');
  assert(during.every(cp => cp.held[0].moveX === 0 && cp.held[0].moveY === 0 && !cp.held[0].interactHeld), '250ms watchdog did not neutralize stalled held');
  assert(x(during[0]) > x(beforeStall) && x(during[1]) === x(during[0]), 'held movement/watchdog position evidence absent');
  const delayed = await stallPromise;
  const end = await until(async () => events.find(event => event.kind === 'stall-end'), value => !!value, 'stall end');
  assert(end.milliseconds >= 500 && end.observedTick === start.tick, 'renderer did not actually stall for 500ms');
  const result = await commandResult(delayed.sequence);
  assert(result.status === 'applied' && result.tick >= delayed.requestedTick + 20, `delayed semantic input did not execute at receive time: ${JSON.stringify(result)}`);
  const after = await checkpoint(first);
  assert(after.heldHighWater[0] === start.held.sequence && after.held[0].moveX === -1 && x(after) < x(during[1]), 'delayed valid held input did not apply');
  assert(after.snapshot.values[offsets['run.vote']] === 0, 'translated vote had no authoritative effect');
  const resumed = await status(); assert(resumed.largestGap >= 500, 'renderer callback gap missing');
  evidence('renderer-stall', `busy=${end.milliseconds.toFixed(1)}ms; renderer callback gap=${resumed.largestGap.toFixed(1)}ms; Worker ticks ${tick(beforeStall)} -> ${tick(during[0])} -> ${tick(during[1])} while blocked; no input wait`);
  evidence('watchdog', `held right moved x=${x(beforeStall).toFixed(3)} -> ${x(during[0]).toFixed(3)}; at 300/390ms held neutral and x unchanged before renderer resumed (250ms host receipt watchdog)`);
  evidence('delayed-input', `original requestedTick=${delayed.requestedTick}; translated vote id=${delayed.sequence}, applied tick=${result.tick}, admission=${result.admission.disposition}; held sequence=${start.held.sequence} moved left x=${x(after).toFixed(3)}`);

  await js('window.hostSmoke.detach()'); await delay(30);
  const saved = await checkpoint(first);
  await request(first, { kind: 'restore', checkpointBytes: bytes(saved) });
  const replacement = await attach(first);
  assert(replacement.command === saved.commandHighWater[0] + 1 && replacement.held === saved.heldHighWater[0], 'restored producer sequences did not seed from full sync');
  assert(replacement.phase === 'paused' && replacement.commandStatus.state === 'ready', 'restore must remain paused with a fresh ready outbox');
  const resume = await js('window.hostSmoke.resume()'); const resumeResult = await commandResult(resume.id.sequence);
  assert(resume.id.sequence === saved.commandHighWater[0] + 1, 'new client reused or skipped command ID');
  await js('window.hostSmoke.neutralProducer()');
  const continued = await until(() => checkpoint(first), cp => tick(cp) > tick(saved) + 3 && cp.heldHighWater[0] > saved.heldHighWater[0], 'restored producer continuation');
  evidence('restore-producer', `checkpoint tick=${tick(saved)}; detached/recreated client command=${resume.id.sequence} (${resumeResult.status}); held ${saved.heldHighWater[0]} -> ${continued.heldHighWater[0]}; continued tick=${tick(continued)}`);
  await ownerJs('window.hostSmoke.owner.suspend()');
  const paused = await until(() => checkpoint(first), cp => cp.paused && cp.pauseReason === 'system-suspend', 'trusted suspend pause');
  await delay(90); const stillPaused = await checkpoint(first);
  assert(tick(stillPaused) === tick(paused) && stillPaused.paused, 'suspend hook auto-resumed authority');
  evidence('suspend-hook', `page lifecycle suspend -> system-suspend pause at tick=${tick(paused)}; remains paused; actual OS suspend NOT RUN`);
  await js('window.hostSmoke.detach()');
  const oldResponse = await ownerJs(`window.hostSmoke.owner.lastOkResponse(${first.id})`);
  assert(oldResponse, 'missing Worker output from first generation');
  await dispose(first, 'first host');

  const second = await ready(2); await request(second, { kind: 'start', initBytes: bytes(init) });
  // Replay a real generation-1 response into the generation-2 owner (ignored), then send an obsolete generation-1 command
  // to the actual generation-2 Worker and consume its reply with the interception armed ON THE GENERATION-2 HOST.
  await ownerJs(`window.hostSmoke.owner.inject(${second.id}, ${JSON.stringify(oldResponse)})`);
  const id = 900001;
  const obsolete = second.intercept(id);
  await second.rawCommand({ kind: 'pause', reason: 'obsolete-generation', requestId: id, hostGeneration: 1 });
  const reply = await bounded(obsolete, 'actual obsolete generation rejection');
  assert(reply.hostGeneration === 2 && reply.ok === false && reply.error?.code === 'stale-generation', 'wrong obsolete-command reply');
  const healthy = await checkpoint(second); assert(!healthy.paused, 'stale generation mutated restarted host');
  await delay(45); assert(tick(await checkpoint(second)) > tick(healthy), 'stale response stopped second host');
  evidence('stale-generation', 'real generation-1 response replayed into the generation-2 owner ignored; actual generation-1 command to the generation-2 Worker rejected stale-generation; new host continued');
  await dispose(second, 'second host');
  evidence('successive-hosts', 'two successive ready/start/dispose hosts; both Workers terminated, page transports disposed between hosts');

  const crashedHost = await ready(3); await request(crashedHost, { kind: 'start', initBytes: bytes(init) });
  await crashedHost.crashWorker();
  assert(await crashedHost.reason() === 'worker-exit', 'wrong Worker crash reason');
  await released(crashedHost, 'worker crash');
  const late = await ownerJs(`window.hostSmoke.owner.request(${crashedHost.id}, { kind: 'checkpoint' }).then(() => 'accepted', error => String(error.message))`);
  assert(late === 'disposed', `dead Worker request outcome: ${late}`);
  evidence('worker-crash', 'Worker error event; worker-exit; page transport disposed; new requests rejected');
  const killedTransport = await ready(4); await request(killedTransport, { kind: 'start', initBytes: bytes(init) });
  await killedTransport.killTransport();
  const reason = await killedTransport.reason();
  assert(reason === 'transport-exit', `wrong transport loss reason ${reason}`);
  await released(killedTransport, 'transport kill');
  evidence('transport-kill', `page transport controller disposed; ${reason}; Worker terminated by its owner`);

  const final = await counts();
  ipcMain.off('host-smoke-event', observePage); ipcMain.off('host-smoke-port-out', forward);
  visible.destroy(); owner.destroy();
  assert(final.workers === final.terminated && BrowserWindow.getAllWindows().length === 0, 'owned Workers/windows survived');
  assert(ipcMain.listenerCount('host-smoke-event') === 0 && ipcMain.listenerCount('host-smoke-port-out') === 0, 'owned listeners survived');
  evidence('cleanup', `${final.terminated}/${final.workers} host Workers terminated; zero windows/harness listeners; exact profile cleanup checked by launcher`);
  if (process.argv.includes('--inject-missing-evidence')) checks.splice(checks.indexOf('watchdog'), 1);
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ electron: process.versions.electron, checks, details,
    workers: final.workers, workerExits: final.terminated, windows: BrowserWindow.getAllWindows().length, osSuspend: 'NOT RUN' }));
}

app.on('web-contents-created', (_, contents) => {
  contents.on('render-process-gone', (_, details) => fail(Error(`unexpected renderer exit: ${details.reason}`)));
  contents.on('did-fail-load', (_, code, description) => fail(Error(`page load failed: ${code} ${description}`)));
  contents.on('console-message', event => { if (event.level === 'error' && !String(event.message).includes('injected worker crash')) fail(Error(`page console error: ${event.message}`)); });
});
process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
app.whenReady().then(async () => {
  let status = 0;
  try { await bounded(run(), 'whole actual-process smoke', 30_000); }
  catch (error) { status = 1; console.error(error.stack ?? error); }
  finally {
    // Also clean up partial startup and injected-failure paths; the launcher has a process-tree fallback.
    if (owner && !owner.isDestroyed()) {
      await Promise.allSettled(hosts.map(host => host.dispose()));
      try {
        const final = await bounded(counts(), 'failure cleanup counts', 3000);
        if (final.workers !== final.terminated) { status = 1; console.error('failure cleanup left a Worker running'); }
      } catch (error) { status = 1; console.error(error.message); }
    }
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    app.exit(status);
  }
}).catch(error => { console.error(error); app.exit(1); });
```

The `released` predicate accepts `created === false` for the already-aborted start (no Worker to terminate). The crash checks' `ErrorEvent` is dispatched on the Worker object only, so the page logs no console error; the filter on `'injected worker crash'` is a guard in case the browser reports it anyway.

- [ ] **Step 3: Update the host-smoke launcher**

In `scripts/network/host-smoke.ts`:
- `required`: replace `'utility-kill'` with `'worker-crash'` and `'early-transport-failure'` with `'early-worker-failure'`.
- The Vite page build gains `worker: { format: 'es' }` and a check that the production chunk exists before launching: `if (!existsSync(resolve('out/renderer/assets/authorityWorker.js'))) throw Error('missing built host Worker');`.
- The report check becomes `report.workers !== report.workerExits || report.windows !== 0` (in place of `report.utilities !== report.exits`), and the PASS line reads `${report.workerExits}/${report.workers} Worker exits`.

Run: `npm run test:host-runtime`
Expected: `ACTUAL host runtime PASS: Electron 37.10.3; 15 checks; N/N Worker exits; …` then `ACTUAL isolated profile removed: true`.

- [ ] **Step 4: Write the lease-smoke owner page and Worker observer**

`scripts/network/lease-smoke.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>FTLite lease smoke owner</title>
<p>Lease smoke: the page owns production Worker hosts</p>
<script type="module" src="./lease-smoke-page.ts"></script>
```

`scripts/network/lease-smoke-page.ts`:

```ts
// TEST ONLY (Web-i Task 9): the lease smoke's owner page. Production Worker owners over the built production Worker,
// each wrapped by a generated module that imports lease-smoke-observer first. Main drives it through executeJavaScript.
import { createWorkerHostPlatform, startWorkerHost, type HostProcessHandle } from '../../src/network/host/workerHost';

declare global { interface Window { leaseSmoke: typeof api } }
const wrapper = new URLSearchParams(location.search).get('wrapper')!;
const evidence = new Map<string, unknown>(), ports: MessagePort[] = [];
const hosts: { label: string; handle: HostProcessHandle; current: unknown }[] = [], workers: { label: string; terminated: boolean }[] = [];
const lifecycle = { onSuspend: () => () => {}, onResume: () => () => {} };
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));
function createWorker(label: string) {
  return () => {
    const worker = new Worker(wrapper, { type: 'module', name: label }), record = { label, terminated: false }; workers.push(record);
    const terminate = worker.terminate.bind(worker); worker.terminate = () => { record.terminated = true; terminate(); };
    // The first message the Worker sees, before the owner's initialize: its evidence port (consumed by the observer).
    const channel = new MessageChannel();
    channel.port1.addEventListener('message', event => { evidence.set(label, event.data); }); channel.port1.start();
    worker.postMessage({ kind: 'lease-smoke-evidence' }, [channel.port2]);
    return worker;
  };
}
async function request(index: number, command: object) {
  const response = await hosts[index]!.handle.request(command as never);
  if (!response.ok) throw Error('host-command-failed');
  return response;
}
const api = {
  async start(label: string, identity: object, sessionLease: object, init: unknown): Promise<number> {
    const handle = await startWorkerHost({ ...identity, sessionLease } as never, createWorkerHostPlatform({ lifecycle, createWorker: createWorker(label) }));
    const record = { label, handle, current: null as unknown }; hosts.push(record);
    handle.onLeaseRequest(r => { record.current = r; });
    if (!record.current) throw Error('missing-first-renewal');
    await request(hosts.length - 1, { kind: 'start', initBytes: encode(init) });
    return hosts.length - 1;
  },
  current: (index: number) => hosts[index]!.current,
  async applyLease(index: number, renewal: any, lifetimeMs: number) {
    await hosts[index]!.handle.applyLease(renewal, { roomId: renewal.roomId, hostGeneration: renewal.hostGeneration, hostSeatId: renewal.hostSeatId,
      nonce: renewal.nonce, expiresAtEpochMs: Date.now() + lifetimeMs });
  },
  completeBootstrap: (index: number) => hosts[index]!.handle.completeBootstrap(),
  async attach(index: number) {
    const channel = new MessageChannel(); ports.push(channel.port1);
    await hosts[index]!.handle.attachPeer('controlled-human', [0], channel.port2); channel.port1.start();
  },
  async checkpoint(index: number) { return decode((await request(index, { kind: 'checkpoint' })).checkpointBytes!); },
  async pause(index: number) { await request(index, { kind: 'pause', reason: 'fresh-grant-observation' }); },
  /** One reliable-ordered command frame from the controlled peer, as main posted it on its port before. */
  sendCommand(envelope: unknown) { ports.at(-1)!.postMessage({ version: 1, type: 'data', id: 10000, kind: 'reliable-ordered', bytes: encode({ kind: 'command', envelope }) }); },
  /** Block this page's own thread (the Worker keeps running), as main's thread was blocked before. */
  stall(ms: number) { const start = performance.now(); while (performance.now() - start < ms) { /* deliberate busy wait */ } return performance.now() - start; },
  evidence: (label: string) => evidence.get(label) ?? null,
  async dispose() {
    for (const host of hosts) await host.handle.dispose();
    for (const port of ports) port.close();
    return { workers: workers.length, terminated: workers.filter(w => w.terminated).length };
  }
};
window.leaseSmoke = api;
```

`scripts/network/lease-smoke-observer.ts` (the port of the utility branch of the old `lease-smoke.cjs`; a static import ahead of the production chunk, so its listener and timer override are in place first):

```ts
// TEST ONLY (Web-i Task 9): imported by the generated Worker wrapper BEFORE the production Worker chunk. The real built
// authority owns the gate and the simulation; observation and continuous ingress stay inside the Worker while the page is blocked.
const label = (self as unknown as { name: string }).name;
const scope = self as unknown as { addEventListener(type: 'message', l: (e: MessageEvent) => void): void; postMessage(m: unknown, t?: Transferable[]): void };
const evidence = { firstRequestMs: null as number | null, lastGameplayMs: null as number | null, tick: 0, highWater: [0, 0], attemptsAfterDeadline: 0,
  rejectedAfterDeadline: 0, publications: 0, phase: 'paused', lagTicks: 0, lastTickDeadlineMs: 0 };
let report: MessagePort | undefined;
const save = () => report?.postMessage(structuredClone(evidence));
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));
const send = scope.postMessage.bind(scope);
(self as unknown as { postMessage(m: any, t?: Transferable[]): void }).postMessage = (message, transfer) => {
  if (message?.kind === 'lease-request' && evidence.firstRequestMs === null) { evidence.firstRequestMs = performance.now(); save(); }
  return send(message, transfer ?? []);
};
// The delayed probe withholds later renewal opportunities so its FIRST request is still the matching one after more than
// 12 s. Clocks and gate arithmetic remain the unmodified production code.
if (label === 'delayed') {
  const schedule = setTimeout;
  (self as unknown as { setTimeout: (cb: () => void, ms?: number) => unknown }).setTimeout = (cb, ms) => schedule(cb, ms === 5000 ? 50000 : ms);
}
let runId: string | undefined, incoming = 0;
scope.addEventListener('message', event => {
  const data = event.data;
  if (data?.kind === 'lease-smoke-evidence') { event.stopImmediatePropagation(); report = event.ports[0]; save(); return; }
  if (data?.kind === 'initialize') runId = data.sessionLease?.runId;
  if (data?.kind !== 'attach' || label !== 'running') return;
  const port = event.ports[0]!, post = port.postMessage.bind(port);
  port.postMessage = ((frame: any) => {
    if (frame?.type === 'data') {
      const message = decode(frame.bytes), now = performance.now();
      if (message.kind === 'state') {
        const state = message.state; evidence.publications++;
        if (state.tick > evidence.tick || state.commandHighWater.some((n: number, i: number) => n > evidence.highWater[i]!)) evidence.lastGameplayMs = now;
        evidence.tick = state.tick; evidence.highWater = state.commandHighWater; evidence.phase = state.phase;
        evidence.lagTicks = state.lagTicks; evidence.lastTickDeadlineMs = state.tickTimeMs; save();
      } else if (message.kind === 'result' && evidence.firstRequestMs !== null && now >= evidence.firstRequestMs + 12000 && message.result.reason === 'unavailable') {
        evidence.rejectedAfterDeadline++; save();
      }
      // Release real PortLink backpressure independently of the page's event loop.
      queueMicrotask(() => port.dispatchEvent(new MessageEvent('message', { data: { version: 1, type: 'ack', id: frame.id } })));
    }
    return post(frame);
  }) as typeof port.postMessage;
  const timer = setInterval(() => {
    const now = performance.now();
    if (evidence.firstRequestMs === null) return;
    if (now >= evidence.firstRequestMs + 16000) { clearInterval(timer); save(); return; }
    if (now >= evidence.firstRequestMs + 12000) evidence.attemptsAfterDeadline++;
    port.dispatchEvent(new MessageEvent('message', { data: { version: 1, type: 'data', id: ++incoming, kind: 'reliable-ordered', bytes: encode({ kind: 'command', envelope: {
      runId, id: { player: 0, sequence: evidence.highWater[0]! + 1 }, requestedTick: evidence.tick,
      command: incoming % 2 ? { kind: 'stand' } : { kind: 'setPaused', paused: false } } }) } }));
  }, 100);
});
export {};
```

- [ ] **Step 5: Rewrite the lease-smoke main harness and launcher**

`scripts/network/lease-smoke.cjs` (replace the whole file):

```js
// TEST ONLY (Web-i Task 9): actual Electron. The owner page runs the production Worker owner over the built production
// Worker; the page's own thread is stalled while the Worker keeps running, as main's thread was stalled before.
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomBytes } = require('node:crypto');
const directory = app.commandLine.getSwitchValue('lease-smoke-dir'), profile = app.commandLine.getSwitchValue('user-data-dir');
const probe = app.commandLine.getSwitchValue('lease-probe');
if (!directory || resolve(profile) !== resolve(directory, 'profile')) throw Error('isolated-profile-required');
app.setPath('userData', profile); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
const { init } = JSON.parse(readFileSync(join(directory, 'fixture.json'), 'utf8'));
const identity = { modeId: 'sector', schemaVersion: 1, simVersion: init.simVersion, contentDigest: init.contentDigest, hostGeneration: 1 };
const codes = ['injected-fault', 'native-timeout', 'missing-first-renewal', 'host-command-failed', 'missing-running-evidence', 'lease-deadline-violation',
  'missing-closed-admission-evidence', 'fenced-state-changed', 'held-not-neutral', 'late-matching-grant-accepted', 'late-grant-ticked',
  'fresh-grant-not-paused-or-debt-retained', 'explicit-resume-failed'];
const delay = ms => new Promise(done => setTimeout(done, ms));
function bounded(promise, ms = 6000) {
  let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('native-timeout')), ms); })]).finally(() => clearTimeout(timer));
}
const assert = (condition, code) => { if (!condition) throw Error(code); };
let page;
const js = (source, ms) => bounded(page.webContents.executeJavaScript(source), ms);
async function start(label) {
  const sessionLease = { roomId: randomBytes(16).toString('hex'), runId: init.runId, hostGeneration: 1, hostSeatId: 0, utilityEpoch: randomBytes(16).toString('hex') };
  const index = await js(`window.leaseSmoke.start(${JSON.stringify(label)}, ${JSON.stringify(identity)}, ${JSON.stringify(sessionLease)}, ${JSON.stringify(init)})`);
  return { index, current: () => js(`window.leaseSmoke.current(${index})`) };
}
const grant = (index, renewal) => js(`window.leaseSmoke.applyLease(${index}, ${JSON.stringify(renewal)}, 15000)`);
async function run() {
  await app.whenReady(); let report = { status: 'FAIL', diagnostic: 'native-failure' };
  try {
    page = new BrowserWindow({ show: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } });
    await page.loadFile(join(directory, 'page/lease-smoke.html'), { query: { wrapper: pathToFileURL(join(directory, 'page/worker-wrapper.js')).href } });
    writeFileSync(join(directory, 'owned-pids.json'), JSON.stringify([page.webContents.getOSProcessId()]));
    const running = await start('running');
    if (probe === 'fault') throw Error('injected-fault');
    if (probe === 'timeout' || probe === 'cleanup-timeout') await new Promise(() => {});
    const delayed = await start('delayed'), delayedRequest = await delayed.current();
    await grant(running.index, await running.current()); await js(`window.leaseSmoke.completeBootstrap(${running.index})`);
    await js(`window.leaseSmoke.attach(${running.index})`);
    const stallMs = await js('window.leaseSmoke.stall(16000)', 22000); await delay(100);
    const observed = await js(`window.leaseSmoke.evidence('running')`);
    assert(observed && observed.tick > 100 && observed.publications > 100, 'missing-running-evidence');
    assert(observed.phase === 'paused' && observed.lastGameplayMs <= observed.firstRequestMs + 12000, 'lease-deadline-violation');
    assert(observed.attemptsAfterDeadline > 10 && observed.rejectedAfterDeadline > 10, 'missing-closed-admission-evidence');
    const fenced = await js(`window.leaseSmoke.checkpoint(${running.index})`);
    assert(fenced.snapshot.header.tick === observed.tick && fenced.commandHighWater.every((n, i) => n === observed.highWater[i]), 'fenced-state-changed');
    assert(fenced.held.every(h => h.moveX === 0 && h.moveY === 0 && !h.interactHeld), 'held-not-neutral');
    let delayedMatchingRejected = false;
    try { await grant(delayed.index, delayedRequest); } catch { delayedMatchingRejected = true; }
    assert(delayedMatchingRejected, 'late-matching-grant-accepted');
    const delayedCp = await js(`window.leaseSmoke.checkpoint(${delayed.index})`);
    assert(delayedCp.snapshot.header.tick === 0 && delayedCp.phase === 'paused', 'late-grant-ticked');
    await grant(running.index, await running.current());
    await delay(100); const fresh = await js(`window.leaseSmoke.checkpoint(${running.index})`);
    const freshPaused = fresh.phase === 'paused' && fresh.snapshot.header.tick === observed.tick;
    await js(`window.leaseSmoke.pause(${running.index})`);
    const pausedEvidence = await js(`window.leaseSmoke.evidence('running')`);
    assert(freshPaused && pausedEvidence.lagTicks === 0, 'fresh-grant-not-paused-or-debt-retained');
    await js(`window.leaseSmoke.sendCommand(${JSON.stringify({ runId: init.runId, id: { player: 0, sequence: fresh.commandHighWater[0] + 1 },
      requestedTick: fresh.snapshot.header.tick, command: { kind: 'setPaused', paused: false } })})`);
    await delay(100); const resumed = await js(`window.leaseSmoke.checkpoint(${running.index})`);
    const explicitResume = resumed.phase === 'running' && resumed.snapshot.header.tick > observed.tick && resumed.snapshot.header.tick - observed.tick < 20;
    assert(explicitResume, 'explicit-resume-failed');
    report = { status: 'PASS', diagnostic: 'controlled-grant-proof', electron: process.versions.electron, stallMs, workerEvidence: observed, delayedMatchingRejected,
      delayedProbe: 'renewal timer withheld; matching request aged beyond local lifetime; real Worker clocks',
      freshPaused, freshLagTicks: pausedEvidence.lagTicks, explicitResume, resumedTicks: resumed.snapshot.header.tick - observed.tick };
  } catch (error) { report.diagnostic = codes.find(code => String(error?.message ?? error).includes(code)) ?? 'native-failure'; }
  finally {
    const counts = page && !page.isDestroyed() ? await js('window.leaseSmoke.dispose()', 5000).catch(() => null) : null;
    if (page && !page.isDestroyed()) page.destroy();
    report.workers = counts?.workers ?? 0; report.workerExits = counts?.terminated ?? 0; report.windows = BrowserWindow.getAllWindows().length;
    writeFileSync(join(directory, 'native-report.json'), JSON.stringify(report, null, 2));
    app.exit(report.status === 'PASS' ? 0 : 1);
  }
}
run().catch(() => app.exit(1));
```

In `scripts/network/lease-smoke.ts`:
- Imports gain `import { build } from 'vite';` and `import { pathToFileURL } from 'node:url';`.
- `association()` `source`: replace `'src/utility/authorityHost.ts'` with `'src/worker/authorityWorker.ts', 'src/worker/authorityWorkerMain.ts'`, and `'src/main/network/hostProcess.ts', 'src/main/network/transportWindow.ts', 'src/main/network/onlinePlatform.ts'` with `'src/network/host/workerHost.ts', 'src/network/transport/pageTransport.ts', 'scripts/network/lease-smoke-page.ts', 'scripts/network/lease-smoke-observer.ts', 'scripts/network/lease-smoke.html'`; `artifacts` becomes `readdirSync('out/renderer/assets').filter(name => name.endsWith('.js')).map(name => `out/renderer/assets/${name}`)` plus `'out/renderer/index.html'` (drop both `networkTransport` pushes and `out/main`).
- Replace `existsSync(resolve('out/main/authorityHost.js'))` with `existsSync(resolve('out/renderer/assets/authorityWorker.js'))`.
- After writing `fixture.json`, build the page and the observer and write the wrapper:

```ts
    await build({ configFile: false, envDir: false, logLevel: 'warn', root: resolve('scripts/network'), base: './', worker: { format: 'es' },
      define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(contentDigest) },
      build: { outDir: join(directory, 'page'), emptyOutDir: true, rollupOptions: { input: { lease: resolve('scripts/network/lease-smoke.html') } } } });
    await build({ configFile: false, envDir: false, logLevel: 'warn', build: { outDir: join(directory, 'page'), emptyOutDir: false,
      lib: { entry: resolve('scripts/network/lease-smoke-observer.ts'), formats: ['es'], fileName: () => 'lease-observer.js' } } });
    writeFileSync(join(directory, 'page/worker-wrapper.js'), `import './lease-observer.js';\nimport ${JSON.stringify(pathToFileURL(resolve('out/renderer/assets/authorityWorker.js')).href)};\n`);
```

- The evidence check: replace `details.utilities !== 2 || details.exits !== 2` with `details.workers !== 2 || details.workerExits !== 2`.

Run: `npm run build && npx tsx scripts/network/lease-smoke.ts --report-path=.superpowers/web-i/lease-normal.json`, then each probe: `--probe=fault`, `--probe=timeout`, `--probe=cleanup-timeout`.
Expected: normal prints `"status":"PASS"` with `processCleanup: true, tempCleanup: true`; each probe exits nonzero with its diagnostic (`native-probe-failed`/`launcher-timeout`/`cleanup-timeout`) and still cleans up. `npx vitest run tests/leaseSmokeCleanup.test.ts` PASS (it tests the lifecycle helpers, unchanged).

- [ ] **Step 6: Commit**

```bash
git add scripts/network/host-smoke-page.ts scripts/network/host-smoke.cjs scripts/network/host-smoke.ts scripts/network/lease-smoke.html \
  scripts/network/lease-smoke-page.ts scripts/network/lease-smoke-observer.ts scripts/network/lease-smoke.cjs scripts/network/lease-smoke.ts
git commit -m "test(web-i): host runtime and lease smokes against the page-owned production Worker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Gates II: the RTC, RTC-config and room-service smokes (spec §8 rows `test:rtc-runtime`, `rtc-config-smoke`, `test:room-service-runtime`)

**Files:**
- Create: `scripts/network/rtc-page.ts`, `scripts/network/rtc-page.html`
- Rewrite: `scripts/network/rtc-config-smoke.cjs`; Modify: `scripts/network/rtc-config-smoke.ts`
- Rewrite: `scripts/network/rtc-smoke.cjs`, `scripts/network/room-service-smoke.cjs`; Modify: `scripts/network/rtc-smoke.ts`, `scripts/network/room-service-smoke.ts`, `scripts/network/rtc-smoke-client.ts` (`createProbe` rebuilt on `browserPortEndpoint`, no `electron` import), `scripts/network/rtc-smoke-report.ts`, `scripts/network/room-service-report.ts`
- Modify tests: `tests/rtcRuntimeGate.test.ts`, `tests/roomServiceRuntimeGate.test.ts` (field renames)

**Interfaces:**
- Consumes: `createPageTransport` (Task 4); `startWorkerHost`, `createWorkerHostPlatform` (Task 5); `createRoomServiceClient` (unchanged); the existing `rtc-smoke-client.ts` exports `init`, `createProbe(port)`, `createObserver()`.
- Produces: `window.rtcPage` (below), one page per RTC endpoint.

- [ ] **Step 1: Write the shared RTC endpoint page**

`scripts/network/rtc-page.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>FTLite RTC endpoint</title>
<p>Actual page transport endpoint</p>
<script type="module" src="./rtc-page.ts"></script>
```

`scripts/network/rtc-page.ts`:

```ts
// TEST ONLY (Web-i Task 10): one RTC endpoint per Electron page. A guest page holds a production page transport and the
// production client of rtc-smoke-client (the hidden window and the visible guest page of the old topology, merged as in the
// app); the host page holds the production Worker owner over the built Worker, the host transport and the passive
// observer relay. Main relays signals between pages. Every promise-valued call returns a Settled value, so executeJavaScript
// never has to carry a page error message.
import { createPageTransport, type PageTransport } from '../../src/network/transport/pageTransport';
import { createWorkerHostPlatform, startWorkerHost, type HostProcessHandle, type WorkerLike } from '../../src/network/host/workerHost';
import type { TransportController } from '../../src/network/transport/contracts';
import { base64ToBytes, bytesToBase64 } from '../../src/shared/bytes';
import { createObserver, createProbe } from './rtc-smoke-client';

declare global { interface Window { rtcPage: typeof api } }
type Settled<T> = { ok: true; value: T } | { ok: false; error: string };
const settle = <T,>(promise: Promise<T>): Promise<Settled<T>> =>
  promise.then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error: String((error as Error)?.message ?? error) }));
const workerUrl = new URLSearchParams(location.search).get('worker');
const owned = new Map<string, PageTransport>(), controllers = new Map<string, TransportController>();
const attempts = new Map<string, { readiness: Promise<Settled<{ latestPayloadLimit: number }>>; port: MessagePort }>();
const observers = new Map<string, ReturnType<typeof createObserver>>(), probes = new Map<string, ReturnType<typeof createProbe>>(), relays = new Map<string, MessagePort>();
const signals: { name: string; signal: any }[] = [], workers: { terminated: boolean; errored: boolean }[] = [];
let host: HostProcessHandle | undefined, hostExit: string | null = null, hostStarting: Promise<unknown> | undefined;
const key = (name: string, attemptId: string) => `${name}:${attemptId}`;
const lifecycle = { onSuspend: () => () => {}, onResume: () => () => {} };
function watch(name: string, controller: TransportController): void {
  controllers.set(name, controller);
  controller.onSignal(signal => signals.push({ name, signal }));
}
/** The early-failure helpers act inside the spawn task itself, never in a later executeJavaScript call. */
function createWorker(mode: string, abort: AbortController): () => WorkerLike {
  return () => {
    const worker = new Worker(workerUrl!, { type: 'module' }), record = { terminated: false, errored: false }; workers.push(record);
    const terminate = worker.terminate.bind(worker); worker.terminate = () => { record.terminated = true; terminate(); };
    worker.addEventListener('error', () => { record.errored = true; });
    if (mode === 'abort-after-spawn') abort.abort();
    if (mode === 'crash-on-spawn') queueMicrotask(() => worker.dispatchEvent(new ErrorEvent('error', { message: 'injected worker crash', cancelable: true })));
    return worker;
  };
}
const api = {
  createTransport(name: string, identity: object) { const transport = createPageTransport(identity as never); owned.set(name, transport); watch(name, transport.controller); },
  startHost(options: object, mode: 'normal' | 'abort-after-spawn' | 'crash-on-spawn' = 'normal') {
    const abort = new AbortController();
    const work = startWorkerHost({ ...options, signal: abort.signal } as never, createWorkerHostPlatform({ lifecycle, createWorker: createWorker(mode, abort) }))
      .then(handle => { host = handle; hostExit = null; handle.onExit(reason => { hostExit = reason; }); watch('host', handle.transport); });
    hostStarting = work.catch(() => {});
    return settle(work);
  },
  hostExit: () => hostExit,
  hostRequest(command: any) {
    const wire = command.kind === 'start' ? { ...command, initBytes: base64ToBytes(command.initBytes) }
      : command.kind === 'restore' ? { ...command, checkpointBytes: base64ToBytes(command.checkpointBytes) } : command;
    return settle(host!.request(wire).then((r: any) => r.ok && r.checkpointBytes ? { ...r, checkpointBytes: bytesToBase64(r.checkpointBytes) } : r));
  },
  startAttempt(name: string, options: { attemptId: string }) {
    const { port1, port2 } = new MessageChannel();
    attempts.set(key(name, options.attemptId), { readiness: settle(controllers.get(name)!.startAttempt(options as never, port1)), port: port2 });
    return true;
  },
  readiness: (name: string, attemptId: string) => attempts.get(key(name, attemptId))!.readiness,
  receiveSignal: (name: string, signal: unknown) => settle(controllers.get(name)!.receiveSignal(signal as never)),
  closeAttempt: (name: string, attemptId: string) => settle(controllers.get(name)!.closeAttempt(attemptId)),
  takeSignals: () => signals.splice(0),
  /** Host page: the passive observer relay between the attempt's port and a fresh authority port attached to the Worker
   *  (raw, unmodified forwarding; the observer receives copies and cannot satisfy readiness or any ACK). */
  relayToHost(name: string, attemptId: string, peer: string, players: number[], latestPayloadLimit: number) {
    const k = key(name, attemptId), attempt = attempts.get(k)!, authority = new MessageChannel(), observer = createObserver();
    observers.set(k, observer); relays.set(k, authority.port1);
    const relay = (from: MessagePort, to: MessagePort, incoming: boolean) => {
      from.addEventListener('message', event => { if (event.data?.type === 'data') observer.observe(new Uint8Array(event.data.bytes), incoming); to.postMessage(event.data); });
      from.start();
    };
    relay(authority.port1, attempt.port, true); relay(attempt.port, authority.port1, false);
    return settle(host!.attachPeer(peer, players, authority.port2, { streamed: true, latestPayloadLimit }));
  },
  observerCall(name: string, attemptId: string, method: 'publication' | 'notifications' | 'stats', argument?: number) {
    const observer = observers.get(key(name, attemptId))!;
    return method === 'publication' ? observer.publication(argument!) ?? null : method === 'notifications' ? observer.notifications() : observer.stats();
  },
  /** Guest page: the production client (rtc-smoke-client's installPage) on this attempt's port, through its own rtc-smoke-port path. */
  attachClient(name: string, attemptId: string, player: number, runId?: string) {
    window.dispatchEvent(new MessageEvent('message', { source: window, data: { kind: 'rtc-smoke-port', player, runId }, ports: [attempts.get(key(name, attemptId))!.port] }));
    return true;
  },
  /** Host page: the sacrificial fragmentation probe on an attempt's port (the mid-transfer close). */
  probe(name: string, attemptId: string) { const k = key(name, attemptId); probes.set(k, createProbe(attempts.get(k)!.port)); probes.get(k)!.send(); return true; },
  release(name: string, attemptId: string) {
    const k = key(name, attemptId);
    probes.get(k)?.close('disposed'); probes.delete(k); observers.get(k)?.dispose(); observers.delete(k);
    relays.get(k)?.close(); relays.delete(k); attempts.get(k)?.port.close(); attempts.delete(k); return true;
  },
  disposeTransport(name: string) { const transport = owned.get(name); if (!transport) return false; owned.delete(name); controllers.delete(name); transport.dispose(); return true; },
  killHostTransport: () => settle(host!.transport.dispose()),
  counts: () => ({ workers: workers.length, workerExits: workers.filter(w => w.terminated || w.errored).length }),
  async dispose() {
    await hostStarting;   // a start still in flight finishes first, so its Worker is disposed below as well
    for (const transport of owned.values()) transport.dispose(); owned.clear();
    if (host) await host.dispose().catch(() => {});
    for (const k of [...attempts.keys()]) { const [name, id] = k.split(':'); api.release(name!, id!); }
    return api.counts();
  }
};
window.rtcPage = api;
```

In `scripts/network/rtc-smoke-client.ts`, the probe's adapter used Electron `MessagePortMain` methods (`on`/`off`), which a DOM `MessagePort` lacks. Delete `import type { MessagePortMain } from 'electron';` and replace `createProbe` with:

```ts
/** Sacrificial fragmentation probe over the real generic PortLink/RTC bridge. */
export function createProbe(port: MessagePort) {
  const link = createPortLink(browserPortEndpoint(port), 'probe', { latestStreamKey: bytes => classifyStreamPacket(bytes).stream });
  return { send: () => link.send('reliable-ordered', encodeOpaquePacket('checkpoint', 'probe', 1, new Uint8Array(40000))), close: link.close };
}
```

(`browserPortEndpoint` is already imported at the top of the file.)

- [ ] **Step 2: Rewrite the RTC-config smoke (the smallest; it proves the page wiring first)**

`scripts/network/rtc-config-smoke.cjs` (replace the whole file):

```js
// Configuration-only native test driver (Web-i): the production page transport in one page. Answerers receive no SDP
// and never gather ICE; the native RTCPeerConnection configuration is inspected in the same page.
const { app, BrowserWindow } = require('electron');
const { resolve, join } = require('node:path');
const { writeFileSync } = require('node:fs');
const directory = app.commandLine.getSwitchValue('rtc-config-dir');
if (!directory || resolve(app.commandLine.getSwitchValue('user-data-dir')) !== resolve(directory, 'profile')) throw Error('invalid-test-profile');
app.setPath('userData', join(directory, 'profile')); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
const identity = { modeId: 'sector', schemaVersion: 1, simVersion: 35, contentDigest: app.commandLine.getSwitchValue('content-digest'), hostGeneration: 1 };
let page, failure;
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { failure = 'native-config-timeout'; app.exit(1); }, 12000);
  try {
    page = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } });
    await page.loadFile(join(directory, 'page/rtc-page.html'));
    const js = source => page.webContents.executeJavaScript(source);
    await js(`(() => { const Original = RTCPeerConnection; window.configProbes = [];
      window.RTCPeerConnection = new Proxy(Original, { construct(Target, args) { const pc = Reflect.construct(Target, args); window.configProbes.push(pc); return pc; } });
      window.rtcPage.createTransport('guest', ${JSON.stringify(identity)}); })()`);
    const checks = [];
    for (const policy of ['all', 'relay']) {
      const attemptId = 'config-' + policy;
      const options = { attemptId, role: 'answerer', identity: { ...identity, protocolVersion: 2, runId: 'config-test', roomId: 'config-test', layoutHash: '12345678', seatGeneration: 1,
        localConnectionId: 'answerer', remoteConnectionId: 'offerer' }, localTicket: 'local-test', expectedRemoteTicket: 'remote-test', ticketExpiresAtEpochMs: Date.now() + 30000,
        iceServers: [{ urls: ['turn:127.0.0.1:9?transport=udp', 'turns:127.0.0.1:9?transport=tcp'], username: 'synthetic', credential: 'synthetic' }], iceTransportPolicy: policy };
      await js(`window.configSettled = window.rtcPage.startAttempt('guest', ${JSON.stringify(options)}).then(() => false, () => true); true`);
      let result;
      for (let tries = 0; tries < 100; tries++) {
        result = await js(`(() => { const pc = window.configProbes.at(-1); if (!pc || pc.connectionState === 'closed') return null;
          const c = pc.getConfiguration(); return { policy: c.iceTransportPolicy, servers: c.iceServers.length, urls: c.iceServers[0].urls.length,
            credentialsPreserved: c.iceServers[0].username === 'synthetic' && c.iceServers[0].credential === 'synthetic',
            noGathering: pc.iceGatheringState === 'new', noDescription: pc.localDescription === null && pc.remoteDescription === null }; })()`);
        if (result) break; await new Promise(done => setTimeout(done, 10));
      }
      if (!result || result.policy !== policy || result.servers !== 1 || result.urls !== 2 || !result.credentialsPreserved || !result.noGathering || !result.noDescription) throw Error('native-config-mismatch');
      await js(`window.rtcPage.closeAttempt('guest', ${JSON.stringify(attemptId)})`);
      if (!await js('window.configSettled')) throw Error('unexpected-native-route');
      checks.push(result);
    }
    const peersClosed = await js('window.configProbes.length === 2 && window.configProbes.every(pc => pc.connectionState === "closed")');
    if (!peersClosed) throw Error('native-config-cleanup');
    await js('window.rtcPage.dispose()'); page.destroy();
    if (BrowserWindow.getAllWindows().length !== 0) throw Error('native-window-leak');
    writeFileSync(join(directory, 'proof.json'), JSON.stringify({ electron: process.versions.electron, checks, peersClosed: 2, windows: 0, routeEstablished: false }));
  } catch { failure = failure ?? 'native-config-failed'; }
  finally {
    clearTimeout(watchdog);
    if (page && !page.isDestroyed()) page.destroy();
    if (failure) console.error(failure); app.exit(failure ? 1 : 0);
  }
});
```

In `scripts/network/rtc-config-smoke.ts`, before spawning Electron, build the endpoint page into `<directory>/page` (keeping every existing injection and its report fields):

```ts
    await build({ configFile: false, envDir: false, logLevel: 'warn', root: resolve('scripts/network'), base: './', worker: { format: 'es' },
      define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(digest) },
      build: { outDir: join(directory, 'page'), emptyOutDir: true, rollupOptions: { input: { rtc: resolve('scripts/network/rtc-page.html') } } } });
```

(`digest` is the launcher's existing `computeContentDigest(process.cwd())`; add `import { build } from 'vite';` if absent.)

Run: `npx tsx scripts/network/rtc-config-smoke.ts` then `npx vitest run tests/rtcConfigSmoke.test.ts`
Expected: the smoke PASSes with `proof.json` checks for `all` and `relay`; the injection test suite PASSes unchanged.

- [ ] **Step 3: Rewrite the RTC runtime smoke**

`scripts/network/rtc-smoke.cjs` (replace the whole file; every check keeps its old assertions, with the topology-specific lines changed as commented):

```js
// Native loopback gate (Web-i): production page transports, the page-owned production Worker host, native peers and
// streams. The only broker is a trusted, bounded local test relay in main; no service/WAN claim.
const { app, BrowserWindow, ipcMain } = require('electron');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { readFileSync, writeFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const observeNative = require('./rtc-smoke-native.cjs');
const directory = app.commandLine.getSwitchValue('rtc-smoke-dir'), profile = app.commandLine.getSwitchValue('user-data-dir');
if (!directory || resolve(profile) !== resolve(directory, 'profile')) throw Error('isolated profile required');
app.setPath('userData', profile); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
const { init } = require(join(directory, 'client/rtc-smoke-client.cjs'));
const { checkpoint: fixture, offsets } = JSON.parse(readFileSync(join(directory, 'fixture.json'), 'utf8'));
const workerUrl = pathToFileURL(resolve(__dirname, '../../out/renderer/assets/authorityWorker.js')).href;
const crewX = checkpoint => checkpoint.snapshot.values[offsets['crew.0.x']];
const vote = checkpoint => checkpoint.snapshot.values[offsets['run.vote']];
const identity = { modeId: 'sector', schemaVersion: 1, simVersion: init.simVersion, contentDigest: init.contentDigest, hostGeneration: 1 };
const assert = (value, message) => { if (!value) throw Error(message); };
const delay = ms => new Promise(done => setTimeout(done, ms));
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const b64 = value => Buffer.from(value).toString('base64');
const pairs = [], checks = [], details = {};
let hostPage, router, pumping = false, stopping = false, fatalError, rejectFatal;
const fatal = new Promise((_, reject) => { rejectFatal = reject; }); void fatal.catch(() => {});
function fail(error) { if (!stopping && !fatalError) { fatalError = error; rejectFatal(error); } }
function evidence(name, value) { checks.push(name); details[name] = value; console.log(`ACTUAL RTC ${name}: ${JSON.stringify(value)}`); }
async function bounded(promise, label, ms = 5000, ignoreFatal = false) {
  let timer;
  try { return await Promise.race([promise, ...(ignoreFatal ? [] : [fatal]), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timeout')), ms); })]); }
  finally { clearTimeout(timer); }
}
async function until(read, predicate, label, ms = 5000) {
  const deadline = performance.now() + ms; let value;
  while (performance.now() < deadline) { if (fatalError) throw fatalError; value = await read(); if (predicate(value)) return value; await delay(10); }
  // Do not dump arbitrary reports/signals/native stats, which can contain secrets.
  throw Error(label + ' timeout');
}
const js = (window, source) => bounded(window.webContents.executeJavaScript(source), 'renderer call');
const call = (window, method, ...args) => js(window, `window.rtcPage.${method}(${args.map(a => JSON.stringify(a === undefined ? null : a)).join(', ')})`);
const host = (method, ...args) => call(hostPage, method, ...args);
const nativeStatus = window => js(window, 'window.rtcNative.status()');
async function request(command) {
  const wire = command.kind === 'start' ? { ...command, initBytes: b64(command.initBytes) } : command.kind === 'restore' ? { ...command, checkpointBytes: b64(command.checkpointBytes) } : command;
  const result = await host('hostRequest', wire); assert(result.ok && result.value.ok, 'authority request failed'); return result.value;
}
async function checkpoint() { return JSON.parse(Buffer.from((await request({ kind: 'checkpoint' })).checkpointBytes, 'base64').toString('utf8')); }
/** The first failed readiness of a pair, or its readiness when both succeed (as Promise.all over the old two promises). */
function firstOutcome(settled) {
  return new Promise(done => {
    for (const promise of settled) promise.then(value => { if (!value.ok) done(value); });
    Promise.all(settled).then(values => done(values.find(value => !value.ok) ?? { ok: true, value: values.map(value => value.value) }));
  });
}
async function status(record) {
  const value = await js(record.guest, 'window.rtcSmoke.status()');
  if (record.observed) {
    const notifications = await host('observerCall', 'host', record.id, 'notifications');
    for (const delivery of value.deliveries) {
      const actual = notifications.find(note => note.key === delivery.key && note.floor === delivery.floor && note.tick === delivery.tick);
      assert(actual && delivery.confirmedSequence >= actual.floor && delivery.confirmedTick >= actual.tick, 'actual notification floor violated at dequeue');
    }
  }
  return value;
}
function exactPositions(points, confirmed, label) {
  assert(points.length === confirmed.length && points.length > 0 && new Set(points.map(point => point.id)).size === points.length, label + ' identities');
  for (const point of points) {
    const canonical = confirmed.find(value => value.id === point.id);
    assert(canonical && Object.is(point.x, canonical.x) && Object.is(point.y, canonical.y), label + ' canonical coordinates');
  }
}
function canonicalPositions(value) {
  return Array.from({ length: value.snapshot.header.playerCount }, (_, player) => ({ id: `crew:${player}`,
    x: value.snapshot.values[offsets[`crew.${player}.x`]], y: value.snapshot.values[offsets[`crew.${player}.y`]] }));
}
async function page(guest) {
  const window = new BrowserWindow({ show: guest, width: 640, height: 240, webPreferences: { nodeIntegration: false, contextIsolation: true,
    sandbox: true, backgroundThrottling: false, webSecurity: true, preload: join(__dirname, 'rtc-smoke-preload.cjs') } });
  const events = [];
  const receive = (event, value) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return;
    if (value?.kind === 'page-error') fail(Error('RTC page exception'));
    else { if (events.length >= 128) fail(Error('page event budget')); events.push(value); }
  };
  ipcMain.on('rtc-smoke-event', receive); window.once('closed', () => ipcMain.off('rtc-smoke-event', receive));
  window.webContents.on('render-process-gone', () => { if (!stopping) fail(Error('RTC page renderer exited')); });
  await window.loadFile(join(directory, 'page/rtc-page.html'), { query: { worker: workerUrl } });
  await js(window, `(${observeNative.toString()})()`);   // installed before the page's first RTCPeerConnection
  assert(await js(window, 'typeof process === "undefined" && typeof require === "undefined"'), 'RTC page has Node');
  if (guest) window.show();
  return { window, events };
}
// The bounded local broker: exact route and identity validation, then delivery in issue order.
function deliver(record, destination, name, signal, from, to) {
  if (stopping || record.closed || record.cancel) return;
  if (++record.signals > 512 || signal.attemptId !== record.id || signal.roomId !== record.rtcIdentity.roomId || signal.hostGeneration !== 1
    || signal.seatGeneration !== 1 || signal.from !== from || signal.to !== to) { fail(Error('local broker identity rejected')); return; }
  void call(destination, 'receiveSignal', name, signal).then(applied => {
    if (applied.ok || stopping || record.closed) return;
    if (!(record.wrongTicket || record.staleGeneration) || applied.error !== 'rtc-attempt-failed') fail(Error('local broker application failed'));
  }, error => { if (!stopping && !record.closed) fail(error); });
}
async function pump() {
  if (pumping || stopping || !hostPage) return; pumping = true;
  try {
    for (const { signal } of await host('takeSignals')) {
      const record = pairs.find(r => r.id === signal.attemptId && !r.guest.isDestroyed());
      if (record) deliver(record, record.guest, 'guest', signal, 'host', record.rtcIdentity.remoteConnectionId);
    }
    for (const record of pairs) {
      if (record.guest.isDestroyed()) continue;
      for (const { signal } of await call(record.guest, 'takeSignals')) deliver(record, hostPage, 'host', signal, record.rtcIdentity.remoteConnectionId, 'host');
    }
  } catch (error) { fail(error); } finally { pumping = false; }
}
let nextAttempt = 0;
async function pair(options = {}) {
  const guest = await page(options.player !== undefined);
  await call(guest.window, 'createTransport', 'guest', identity);
  assert((await call(guest.window, 'counts')).workers === 0 && (await host('counts')).workers === 3, 'guest created authority');
  const id = `loopback-${++nextAttempt}`, localTicket = randomBytes(32).toString('hex'), remoteTicket = randomBytes(32).toString('hex');
  const rtcIdentity = { ...identity, protocolVersion: 2, runId: init.runId, roomId: 'local-test-room', layoutHash: init.layoutHash,
    seatGeneration: 1, localConnectionId: 'host', remoteConnectionId: `guest-${nextAttempt}` };
  const record = { id, guest: guest.window, events: guest.events, rtcIdentity, signals: 0, ready: false, closed: false, observed: false, ...options };
  pairs.push(record);
  const base = { attemptId: id, identity: rtcIdentity, ticketExpiresAtEpochMs: Date.now() + 30000, iceServers: [], localTicket, expectedRemoteTicket: remoteTicket };
  await call(guest.window, 'startAttempt', 'guest', { ...base, role: 'answerer', localTicket: remoteTicket,
    expectedRemoteTicket: options.wrongTicket ? randomBytes(32).toString('hex') : localTicket,
    identity: { ...rtcIdentity, localConnectionId: rtcIdentity.remoteConnectionId, remoteConnectionId: 'host' } });
  if (options.player !== undefined) {
    // The production client on the guest's own attempt port, in the same page as its transport (the app's topology).
    await call(guest.window, 'attachClient', 'guest', id, options.player);
    const subscribed = await until(async () => record.events.find(event => event.kind === 'subscribed'), Boolean, 'visible subscription');
    assert(subscribed.canAllocate === false, 'producer enabled before validated state');
  }
  await host('startAttempt', 'host', { ...base, role: 'offerer' });
  const readiness = () => [host('readiness', 'host', id), call(guest.window, 'readiness', 'guest', id)];
  if (options.cancel) {
    await Promise.all([host('closeAttempt', 'host', id), call(guest.window, 'closeAttempt', 'guest', id)]);
    const outcome = await bounded(firstOutcome(readiness()), 'cancelled readiness');
    assert(!outcome.ok && outcome.error === 'rtc-cancelled', 'wrong cancellation rejection');
    record.closed = true; return record;
  }
  if (options.staleGeneration) {
    const stale = await call(guest.window, 'receiveSignal', 'guest', { attemptId: id, roomId: rtcIdentity.roomId, seatGeneration: 1, from: 'host', to: rtcIdentity.remoteConnectionId,
      hostGeneration: 2, kind: 'candidate', candidate: null });
    assert(stale.ok || stale.error === 'rtc-attempt-failed', 'wrong stale rejection');
  }
  if (options.wrongTicket || options.staleGeneration) {
    const outcome = await bounded(firstOutcome(readiness()), 'invalid native admission');
    assert(!outcome.ok && outcome.error === 'rtc-attempt-failed', 'wrong native rejection');
    return record;
  }
  const caps = await bounded(Promise.all(readiness()), 'native RTC readiness', 31000);
  assert(caps.every(cap => cap.ok && cap.value.latestPayloadLimit === 16088), 'negotiated cap missing'); record.ready = true;
  if (options.player !== undefined) {
    assert((await status(record)).publication === null, 'authority attached before readiness');
    const attached = await host('relayToHost', 'host', id, `native-${record.player}`, [record.player], caps[0].value.latestPayloadLimit);
    assert(attached.ok, 'authority attachment failed'); record.observed = true;
    const first = await until(() => status(record), value => value.canAllocate && value.publication?.publicationSequence > 0, 'first validated full/ACK');
    assert(first.controls['full-received'] > 0 && first.controls.ack > 0, 'receipt and validated ACK not independent');
  }
  return record;
}
async function closePair(record) {
  record.closed = true;
  await Promise.all([host('closeAttempt', 'host', record.id), call(record.guest, 'closeAttempt', 'guest', record.id)]);
  if (record.player !== undefined) await js(record.guest, 'window.rtcSmoke.dispose()');
  await host('release', 'host', record.id);
  await until(() => nativeStatus(record.guest), value => value.connections.every(pc => pc.state === 'closed' && pc.listeners === 0
    && pc.channels.every(dc => dc.state === 'closed' && dc.listeners === 0)) && value.timers === 0 && !value.held, 'closed guest native resources');
  await call(record.guest, 'release', 'guest', record.id); await call(record.guest, 'disposeTransport', 'guest');
  record.guest.destroy();
}
async function match(record) {
  const value = await status(record), remote = value.publication;
  const authoritative = await host('observerCall', 'host', record.id, 'publication', remote?.publicationSequence ?? 0);
  assert(remote && authoritative && remote.tick === authoritative.tick && remote.hash === authoritative.hash, 'matched authority identity missing');
  assert(JSON.stringify(remote.snapshot) === JSON.stringify(authoritative.snapshot), 'matched canonical image differs');
  assert(JSON.stringify(remote.commandHighWater) === JSON.stringify(authoritative.commandHighWater), 'matched input watermarks differ');
  assert(JSON.stringify(remote) === JSON.stringify(authoritative), 'matched complete publication differs');
  return remote;
}
const stats = record => host('observerCall', 'host', record.id, 'stats');
async function applied(record, command) {
  assert(command, 'producer did not allocate command');
  const value = await until(() => status(record), state => state.results.some(result => result.id.player === command.id.player && result.id.sequence === command.id.sequence), 'real command result');
  const result = value.results.find(result => result.id.player === command.id.player && result.id.sequence === command.id.sequence);
  const delivery = value.deliveries.find(note => note.key === `result:${command.id.player}:${command.id.sequence}`);
  assert(result.status === 'applied' && result.admission?.disposition === 'terminal' && delivery, 'production command was not applied/dequeued'); return { value, result, delivery };
}
async function run() {
  assert(process.versions.electron === '37.10.3', 'wrong Electron');
  hostPage = (await page(false)).window;
  router = setInterval(() => { void pump(); }, 5);
  // Early startup failures, each injected inside the spawn task (Web-i rewrite of the pre-spawn kill=false checks).
  for (const [mode, reason] of [['abort-after-spawn', 'cancelled'], ['crash-on-spawn', 'worker-exit']]) {
    const settled = await host('startHost', identity, mode);
    assert(!settled.ok && settled.error === reason, 'wrong early failure');
  }
  await until(() => host('counts'), value => value.workers === 2 && value.workerExits === 2, 'early Worker terminations');
  evidence('early-cleanup', 'abort inside the spawn task and a Worker error before readiness both rejected; both Workers terminated');
  assert((await host('startHost', identity)).ok, 'host start failed');
  await request({ kind: 'start', initBytes: bytes(init) });
  await request({ kind: 'restore', checkpointBytes: bytes(fixture) });
  const first = await pair({ player: 0 }), second = await pair({ player: 1 });
  const windows = [hostPage, first.guest, second.guest], pids = windows.map(window => window.webContents.getOSProcessId());
  assert(new Set(pids).size === 3 && (await host('counts')).workers === 3, 'renderers not separate');
  for (const window of windows) {
    const preferences = window.webContents.getLastWebPreferences();
    assert(preferences.sandbox && preferences.contextIsolation && !preferences.nodeIntegration && preferences.webSecurity
      && !window.webContents.getBackgroundThrottling(), 'unsafe topology');
  }
  assert(!hostPage.isVisible() && first.guest.isVisible() && second.guest.isVisible(), 'wrong visible topology');
  evidence('topology', { pages: 3, distinctRenderers: 3, liveWorkers: 1, guestAuthorities: 0 });
  if (process.argv.includes('--inject-page-failure')) { await js(first.guest, 'window.rtcSmoke.injectPageFailure()'); await bounded(new Promise(() => {}), 'page failure'); }
  if (process.argv.includes('--inject-child-failure')) throw Error('injected Electron child failure');
  if (process.argv.includes('--inject-timeout')) await new Promise(() => {});
  evidence('first-full-ack', { first: (await status(first)).controls, second: (await status(second)).controls });
  assert((await stats(first)).maxInputBytes === 0 && (await stats(second)).maxInputBytes === 0, 'input preceded first full/ACK');
  // Initial authority is paused; real player control opens the run.
  await applied(first, await js(first.guest, 'window.rtcSmoke.pause(false)'));
  await js(first.guest, 'window.rtcSmoke.produce(0)'); await js(second.guest, 'window.rtcSmoke.produce(0)');
  await until(checkpoint, cp => cp.snapshot.header.tick >= 9, 'authority running');
  const held = await js(first.guest, 'window.rtcSmoke.primeHeld()');
  const before = await until(checkpoint, cp => cp.held[0].moveX === 1 && cp.heldHighWater[0] >= held.sequence, 'held admission');
  // The first guest's page (its client AND its transport) stalls; the host page and the other guest keep running.
  const otherBefore = (await nativeStatus(second.guest)).connections[0].channels.reduce((sum, dc) => sum + dc.received, 0);
  const stall = js(first.guest, 'window.rtcSmoke.stall()'); void stall.catch(fail);
  const start = await until(async () => first.events.find(event => event.kind === 'stall-start'), Boolean, 'stall start');
  await delay(300); const duringA = await checkpoint();
  await delay(90); const duringB = await checkpoint(), otherDuring = await nativeStatus(second.guest);
  assert(!first.events.some(event => event.kind === 'stall-end'), 'watchdog observation occurred after stall');
  assert(duringA.snapshot.header.tick > before.snapshot.header.tick && duringB.snapshot.header.tick > duringA.snapshot.header.tick, 'Worker blocked by guest');
  assert(duringA.held[0].moveX === 0 && duringB.held[0].moveX === 0, 'receipt watchdog did not neutralize');
  assert(crewX(duringA) === crewX(duringB) && crewX(duringA) > crewX(before), 'watchdog position was not stable');
  assert(otherDuring.connections[0].channels.reduce((sum, dc) => sum + dc.received, 0) > otherBefore, 'the other guest RTC blocked with the stalled guest');
  const delayed = await stall, end = first.events.find(event => event.kind === 'stall-end');
  assert(end.milliseconds >= 500 && end.observedTick === start.tick, 'visible stall missing');
  const command = await applied(first, delayed), after = await checkpoint();
  assert(command.result.tick > delayed.requestedTick + 15, 'delayed command did not execute later');
  assert(vote(after) === 0, 'delayed vote did not change authority');
  await until(checkpoint, value => value.held[0].moveX === -1 && crewX(value) < crewX(duringB), 'delayed held movement');
  assert(after.heldHighWater[1] > 0 && after.commandHighWater[1] === 0, 'peer input ownership crossed');
  evidence('stall-watchdog-command', { busyMs: end.milliseconds, ticks: [before.snapshot.header.tick, duringA.snapshot.header.tick, duringB.snapshot.header.tick],
    commandRequestedTick: delayed.requestedTick, commandAppliedTick: command.result.tick, hostContinued: true, otherGuestRtcContinued: true, watchdogStable: true });
  await js(first.guest, 'window.rtcSmoke.produce(-1)');
  let matches = 0;
  for (let i = 0; i < 16; i++) { await delay(35); await match(first); await match(second); matches += 2; }
  assert((await status(first)).sawInterpolation, 'presentation never differed from confirmed position');
  evidence('canonical-presentation', { matchedPublications: matches, interpolationSeparate: true });
  await js(hostPage, 'window.rtcNative.fault("drop")');
  await until(() => nativeStatus(hostPage), value => value.faults.dropped === 1, 'harness latest drop');
  await js(hostPage, 'window.rtcNative.fault("reorder")');
  await until(() => nativeStatus(hostPage), value => value.faults.reordered === 1, 'harness latest reorder');
  await delay(100); await match(first); await match(second);
  evidence('harness-latest-loss-reorder', { boundary: 'native RTCDataChannel.send, state latest only', dropped: 1, reversedPairs: 1, canonicalRecovered: true, measuredWanLoss: false });
  const recoveryBefore = await stats(first);
  await js(first.guest, 'window.rtcSmoke.suppressAcks(true); window.rtcSmoke.produce(0)');
  const evicted = await until(() => status(first), value => value.stream.resyncs > 0 && value.suppressedAcks >= 64 && value.controls.refresh > 0, 'real baseline eviction/full refresh', 8000);
  await js(first.guest, 'window.rtcSmoke.suppressAcks(false)');
  await until(() => status(first), value => value.controls.ack > evicted.controls.ack + 2 && value.canAllocate, 'post-refresh validated ACK');
  const recoveryAfter = await stats(first);
  assert(recoveryAfter.refreshes > recoveryBefore.refreshes && recoveryAfter.fullReceipts > recoveryBefore.fullReceipts, 'refresh/receipt missing on authority path');
  await match(first); evidence('harness-base-eviction-refresh', { boundary: 'guest client Link validated ACK suppression', suppressed: evicted.suppressedAcks,
    receiverResyncs: evicted.stream.resyncs, reliableFullReceipts: recoveryAfter.fullReceipts, canonicalRecovered: true });
  const cadence = await stats(first), ordinary = cadence.packets.filter(packet => packet.kind === 'delta');
  assert(ordinary.length >= 80 && ordinary.every(packet => packet.tick % 3 === 0), 'ordinary stream did not obey 20Hz tick cadence');
  assert(ordinary.every((packet, index) => index === 0 || packet.tick - ordinary[index - 1].tick >= 3), 'ordinary cadence exceeded 20Hz');
  assert(ordinary.every(packet => packet.bytes < packet.fullBytes && packet.bytes <= 16088), 'delta was not smaller/capped');
  assert(cadence.maxImageBytes > 0 && cadence.maxImageBytes <= 131072 && cadence.maxInputBytes > 0 && cadence.maxInputBytes <= 4096, 'actual framed byte caps');
  evidence('cadence-byte-caps', { deltas: ordinary.length, tickModulo: 3, maxImageBytes: cadence.maxImageBytes, maxInputBytes: cadence.maxInputBytes });
  await js(first.guest, 'window.rtcSmoke.produce(1)');
  const pauseAction = await js(first.guest, 'window.rtcSmoke.pauseDuringInterpolation()');
  assert(pauseAction.before.publication.phase === 'running' && pauseAction.before.interpolationLag > 1e-4, 'pause did not begin during active interpolation');
  const paused = await applied(first, pauseAction.command);
  const cp = await checkpoint(), matched = await match(first);
  assert(cp.paused && matched.phase === 'paused' && matched.tick === cp.snapshot.header.tick && JSON.stringify(matched.snapshot) === JSON.stringify(cp.snapshot), 'paused checkpoint differs');
  assert(paused.value.events.some(event => event.payload.kind === 'pause' && event.payload.paused && event.tick === matched.tick), 'covering pause event missing');
  const pausePacket = (await stats(first)).packets.find(packet => packet.sequence === matched.publicationSequence);
  assert(pausePacket?.kind === 'full' && pausePacket.tick === paused.result.tick, 'pause was not immediate full');
  const snapped = await status(first), pausedCanonicalPositions = canonicalPositions(cp);
  exactPositions(snapped.confirmedPositions, pausedCanonicalPositions, 'paused replica');
  exactPositions(snapped.presentation, pausedCanonicalPositions, 'pause snap');
  await delay(80); exactPositions((await status(first)).presentation, pausedCanonicalPositions, 'paused future sample');
  // LABELLED INJECTION: hold the actual covering state at the guest client Link boundary after real RTC/PortLink receipt.
  await js(first.guest, 'window.rtcSmoke.holdStates()');
  const heldCommand = await js(first.guest, 'window.rtcSmoke.pause(true)');
  const heldKey = `result:${heldCommand.id.player}:${heldCommand.id.sequence}`;
  const heldView = await until(() => status(first), value => value.heldPublications.length === 1
    && value.notifications.some(note => note.key === heldKey)
    && value.notifications.some(note => note.kind === 'event' && note.floor === value.heldPublications[0].sequence), 'held covering full and original notifications');
  const heldSequence = heldView.heldPublications[0].sequence;
  const heldNotifications = heldView.notifications.filter(note => note.floor === heldSequence);
  assert(heldNotifications.some(note => note.key === heldKey) && heldNotifications.some(note => note.kind === 'event')
    && heldNotifications.every(note => note.tick === matched.tick) && heldSequence > matched.publicationSequence,
    'same-tick result/event wire floors missing');
  for (let poll = 0; poll < 5; poll++) {
    const withheld = await status(first);
    assert(withheld.publication.publicationSequence === matched.publicationSequence && withheld.publication.tick === matched.tick
      && !withheld.deliveries.some(note => heldNotifications.some(expected => expected.key === note.key)), 'same-tick notification escaped before covering full');
    await delay(20);
  }
  assert(await js(first.guest, 'window.rtcSmoke.releaseStates()') === 1, 'covering full release missing');
  const covered = await applied(first, heldCommand);
  const sameTick = await until(() => status(first), value => value.publication?.controlRevision > matched.controlRevision
    && heldNotifications.every(note => value.deliveries.some(delivery => delivery.key === note.key && delivery.floor === heldSequence)), 'covering full result/event dequeue');
  const sameTickPacket = (await stats(first)).packets.find(packet => packet.sequence === sameTick.publication.publicationSequence);
  assert(sameTick.publication.tick === matched.tick && sameTickPacket?.kind === 'full' && sameTick.publication.publicationSequence > matched.publicationSequence,
    'same-tick control did not publish immediate full');
  await match(first);
  evidence('pause-full-checkpoint', { tick: matched.tick, sequence: matched.publicationSequence, sameTickControlSequence: sameTick.publication.publicationSequence,
    sameTickControlFull: true, coveringResultEvent: true, canonicalCheckpointExact: true, presentationSnapped: true,
    pauseFromInterpolation: true, pauseLag: pauseAction.before.interpolationLag, sameTickNotificationWithheld: true, withheldPolls: 5,
    notificationFloorsChecked: true, heldFloor: heldSequence, resultDequeuedAtSequence: covered.delivery.confirmedSequence,
    heldDeliveries: sameTick.deliveries.filter(note => note.floor === heldSequence) });
  const selected = await Promise.all([nativeStatus(hostPage), nativeStatus(first.guest), nativeStatus(second.guest)]);
  for (const report of selected) for (const pc of report.connections) {
    assert(pc.state === 'connected' && pc.selected && pc.direct && pc.channels.length === 2, 'selected direct native route missing');
    assert(pc.channels.some(dc => dc.label === 'ftl-reliable-v1' && dc.ordered && dc.maxRetransmits === null)
      && pc.channels.some(dc => dc.label === 'ftl-latest-v1' && !dc.ordered && dc.maxRetransmits === 0)
      && pc.channels.every(dc => dc.maxPacketLifeTime === null && dc.maxBytes <= 16384), 'native channel policy wrong');
  }
  evidence('native-channels-route', { nativePcs: 4, channelsPerPc: 2, selectedRoute: 'direct', addresses: 'redacted', lossZeroMeans: 'unavailable' });
  const resume = await js(second.guest, 'window.rtcSmoke.pause(false)'); await applied(second, resume);
  await js(first.guest, 'window.rtcSmoke.produce(-1)');
  const disconnect = await js(first.guest, 'window.rtcSmoke.disconnectDuringInterpolation()');
  assert(disconnect.before.publication.phase === 'running' && disconnect.before.interpolationLag > 1e-4, 'disconnect did not begin during active interpolation');
  const lastConfirmed = await host('observerCall', 'host', first.id, 'publication', disconnect.before.publication.publicationSequence);
  assert(lastConfirmed && JSON.stringify(lastConfirmed) === JSON.stringify(disconnect.before.publication), 'disconnect confirmed state differs from authority');
  const frozenCanonicalPositions = canonicalPositions(lastConfirmed);
  exactPositions(disconnect.before.confirmedPositions, frozenCanonicalPositions, 'disconnect replica');
  for (const sample of disconnect.samples) exactPositions(sample.points, frozenCanonicalPositions, `disconnect +${sample.offsetMs}ms`);
  const disconnected = await status(first); exactPositions(disconnected.presentation, frozenCanonicalPositions, 'disconnect immediate status');
  await delay(80); const disconnectedLater = await status(first); exactPositions(disconnectedLater.presentation, frozenCanonicalPositions, 'disconnect later status');
  assert(disconnected.closed && !disconnectedLater.canAllocate && !disconnectedLater.producer, 'disconnect producer leak');
  await closePair(first);
  const isolatedTick = (await match(second)).tick; await delay(100); assert((await match(second)).tick > isolatedTick, 'first peer close broke second');
  evidence('two-peer-isolation-disconnect', { ownershipIsolated: true, survivorAdvanced: true, disconnectedPresentationFrozen: true,
    activeInterpolationAtDisconnect: true, frozenAtConfirmedPositions: true, disconnectLag: disconnect.before.interpolationLag,
    confirmedSequence: disconnect.before.publication.publicationSequence, futureSampleOffsetsMs: disconnect.samples.map(sample => sample.offsetMs) });
  for (const [label, flags] of [['wrong-ticket', { wrongTicket: true }], ['stale-generation', { staleGeneration: true }], ['cancel-attempt', { cancel: true }]]) {
    const invalid = await pair(flags); await closePair(invalid); await match(second); evidence(label, 'native rejected/cancelled; survivor canonical; native resources closed');
  }
  const transfer = await pair();
  await js(hostPage, 'window.rtcNative.fault("mid-transfer")');
  await host('probe', 'host', transfer.id);
  await until(() => nativeStatus(hostPage), value => value.faults.closedMidTransfer === 1, 'actual fragmented send close');
  await closePair(transfer); await match(second);
  evidence('mid-transfer-close', 'actual production framing, first fragment sent, native PC closed, survivor canonical');
  await closePair(second);
  const closed = await until(() => nativeStatus(hostPage), value => value.connections.every(pc => pc.state === 'closed' && pc.listeners === 0
    && pc.channels.every(dc => dc.state === 'closed' && dc.listeners === 0)) && value.timers === 0, 'all host native PCs/listeners/timers closed');
  assert(closed.connections.length === 6, 'native attempts missing');
  assert(closed.connections.every(pc => pc.channels.every(dc => dc.maxBytes <= 16384)), 'native fragment exceeded packet cap');
  evidence('native-resource-cleanup', { hostPcsClosed: closed.connections.length, productionListeners: 0, productionTimers: 0 });
  stopping = true; clearInterval(router);
  assert((await host('killHostTransport')).ok, 'host transport disposal failed');
  assert(await until(() => host('hostExit'), value => value !== null, 'host exit') === 'transport-exit', 'host controller did not stop the Worker');
  const final = await host('dispose'); hostPage.destroy();
  assert(final.workers === 3 && final.workerExits === 3 && BrowserWindow.getAllWindows().length === 0, 'owner leak');
  assert(ipcMain.listenerCount('rtc-smoke-event') === 0, 'owner listeners leaked');
  evidence('owner-cleanup', { workers: final.workers, workerExits: final.workerExits, windows: 0, listeners: 0, relayPorts: 0 });
  if (process.argv.includes('--inject-missing-evidence')) checks.splice(checks.indexOf('cadence-byte-caps'), 1);
  writeFileSync(join(directory, 'report.json'), JSON.stringify({ electron: process.versions.electron, checks, details }));
}
app.whenReady().then(async () => {
  let code = 0; const watchdog = setTimeout(() => fail(Error('fixed native RTC gate timeout')), process.argv.includes('--inject-timeout') ? 2500 : 35000);
  try { await bounded(run(), 'whole native RTC gate', 36000); } catch (error) { code = 1; console.error(error.stack ?? error); }
  finally {
    stopping = true; clearTimeout(watchdog); clearInterval(router);
    for (const window of BrowserWindow.getAllWindows()) {
      try { await bounded(js(window, 'window.rtcPage?.dispose()'), 'failure page dispose', 3000, true); } catch (error) { code = 1; console.error(error.message); }
      window.destroy();
    }
    app.exit(code);
  }
});
```

In `scripts/network/rtc-smoke-report.ts`, replace the topology, stall and owner-cleanup conditions:

```ts
    || d.topology.pages !== 3 || d.topology.distinctRenderers !== 3 || d.topology.guestAuthorities !== 0 || d.topology.liveWorkers !== 1
    || !atLeast(d['stall-watchdog-command'].busyMs, 500) || d['stall-watchdog-command'].hostContinued !== true || d['stall-watchdog-command'].otherGuestRtcContinued !== true
```

(in place of the `distinctProcesses`/`liveUtilities` line and the `hiddenRtcContinued` check), and `d['owner-cleanup'].utilities !== 3 || d['owner-cleanup'].actualExits !== 3` with `d['owner-cleanup'].workers !== 3 || d['owner-cleanup'].workerExits !== 3`. In `tests/rtcRuntimeGate.test.ts`, the fixture's `topology` becomes `{ pages: 3, distinctRenderers: 3, liveWorkers: 1, guestAuthorities: 0 }`, `'stall-watchdog-command'` gains `hostContinued: true, otherGuestRtcContinued: true` (and loses `hiddenRtcContinued`), and `'owner-cleanup'` becomes `{ workers: 3, workerExits: 3, windows: 0, listeners: 0, relayPorts: 0 }`; any `it.each` case naming an old key names the new one.

In `scripts/network/rtc-smoke.ts`, keep the `rtc-smoke-client` lib build (main still `require`s its `init`) and add the endpoint page build:

```ts
    await build({ configFile: false, logLevel: 'warn', root: resolve('scripts/network'), base: './', worker: { format: 'es' },
      define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify(digest) },
      build: { outDir: join(temporary, 'page'), emptyOutDir: true, rollupOptions: { input: { rtc: resolve('scripts/network/rtc-page.html') } } } });
```

and drop the `client/index.html` write (no page loads it any more).

Run: `npm run test:rtc-runtime` then `npx vitest run tests/rtcRuntimeGate.test.ts`
Expected: `ACTUAL RTC runtime PASS: <n> required checks; Electron child exit=0 observed; …`; the gate test PASSes.

- [ ] **Step 4: Rewrite the room-service smoke**

`scripts/network/room-service-smoke.cjs` (replace the whole file). The shipping service client stays in main, as the coordinator it was before: this gate's subject is the service, the native RTC transports and the host composition, and the page session's own lobby traffic from a `file://` page is exercised end to end by the app gates (Task 11). The transports, the Worker host, the passive observer and the guest client move into two endpoint pages:

```js
// Test composition (Web-i): the shipping service client in main; production page transports, the page-owned production
// Worker host and the production sector client in two endpoint pages (rtc-page.html).
const { app, BrowserWindow, ipcMain } = require('electron');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { writeFileSync } = require('node:fs');
const { randomBytes, createHash } = require('node:crypto');
const observeNative = require('./rtc-smoke-native.cjs');
const directory = app.commandLine.getSwitchValue('room-service-dir'), profile = app.commandLine.getSwitchValue('user-data-dir');
if (!directory || resolve(profile) !== resolve(directory, 'profile')) throw Error('isolated profile required');
app.setPath('userData', profile); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
const { init: fixtureInit } = require(join(directory, 'client/rtc-smoke-client.cjs'));
const { createRoomServiceClient } = require(join(directory, 'client/service-client.cjs'));
const baseUrl = app.commandLine.getSwitchValue('service-url');
const workerUrl = pathToFileURL(resolve(__dirname, '../../out/renderer/assets/authorityWorker.js')).href;
const identity = { modeId: 'sector', schemaVersion: 1, simVersion: fixtureInit.simVersion, contentDigest: fixtureInit.contentDigest, hostGeneration: 1 };
const compatibility = { ...identity, protocolVersion: 2, layoutHash: fixtureInit.layoutHash }; delete compatibility.hostGeneration;
const assert = (condition, message) => { if (!condition) throw Error(message); };
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const peers = [], pairs = [], timers = [];
let stopping = false, renewTimer, pollTimer, fatalError, rejectFatal, sequence = 0, delayedOffer = false;
const fatal = new Promise((_, reject) => { rejectFatal = reject; }); void fatal.catch(() => {});
const fail = error => { if (!stopping && !fatalError) { fatalError = error; rejectFatal(error); } };
const delay = ms => new Promise(done => setTimeout(done, ms));
async function bounded(promise, label, ms = 5000, ignoreFatal = false) {
  let timer;
  try { return await Promise.race([promise, ...(ignoreFatal ? [] : [fatal]), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timeout')), ms); })]); }
  finally { clearTimeout(timer); }
}
async function until(read, predicate, label) {
  return bounded((async () => { for (;;) { if (fatalError) throw fatalError; const value = await read(); if (predicate(value)) return value; await delay(10); } })(), label);
}
const js = (window, source) => bounded(window.webContents.executeJavaScript(source), 'page call');
const call = (window, method, ...args) => js(window, `window.rtcPage.${method}(${args.map(a => JSON.stringify(a === undefined ? null : a)).join(', ')})`);
const native = peer => js(peer.window, 'window.rtcNative.status()');
async function closeAttempt(peer) {
  const attempt = peer.attempt; if (!attempt || attempt.closed) return;
  attempt.closed = true;
  await call(peer.window, 'closeAttempt', 'peer', attempt.link.attemptId);
  await call(peer.window, 'release', 'peer', attempt.link.attemptId);
}
function event(peer, value) {
  if (value.type === 'roster') { peer.snapshot = value.snapshot; if (['lost', 'ended'].includes(value.snapshot.phase)) void closeAttempt(peer).catch(fail); }
  else if (value.type === 'link-issued') {
    assert(!peer.attempt || peer.attempt.closed, 'live native attempt overwritten');
    const attempt = { link: value.link, started: ++sequence, closed: false, ready: 0 };
    peer.attempt = attempt; peer.attempts.push(attempt);
    // Registration and start are issued in order; readiness must NOT block later signal delivery.
    attempt.registered = call(peer.window, 'startAttempt', 'peer', { ...value.link, iceServers: [] });
    void attempt.registered.then(() => call(peer.window, 'readiness', 'peer', value.link.attemptId)).then(outcome => {
      if (attempt.closed || stopping) return;
      if (!outcome.ok) throw Error('native attempt failed: ' + outcome.error);
      attempt.cap = outcome.value; attempt.ready = ++sequence;
      return peer.service.request({ type: 'link-ready', attemptId: value.link.attemptId });
    }).catch(error => { if (!attempt.closed && !stopping) fail(error); });
  } else if (value.type === 'signal') {
    const attempt = peer.attempt;
    assert(attempt && !attempt.closed && value.signal.attemptId === attempt.link.attemptId, 'signal arrived before registered native attempt');
    assert(++peer.receivedSignals <= 512, 'signal observation budget');
    void attempt.registered.then(() => call(peer.window, 'receiveSignal', 'peer', value.signal)).then(applied => {
      if (!applied.ok && !attempt.closed && !stopping) fail(Error('native signal application failed: ' + applied.error));
    }, error => { if (!attempt.closed && !stopping) fail(error); });
  } else if (value.type === 'link-state') {
    if (value.state === 'ready') {
      assert(peers.every(p => p.attempt?.ready > 0), 'service ready preceded native authentication');
      peer.serviceReady = ++sequence;
    } else {
      peer.closedEvent = value.attemptId;
      if (peer.attempt?.link.attemptId === value.attemptId) void closeAttempt(peer).catch(fail);
    }
  } else if (['host-departed', 'host-changed', 'error'].includes(value.type)) {
    void closeAttempt(peer).catch(fail);
    if (value.type === 'error' && !peer.replacing) fail(Error('service terminal ' + value.error.code));
  }
}
function service(peer) {
  peer.service = createRoomServiceClient({ baseUrl, allowInsecureLocalhost: true,
    clock: { nowMs: Date.now, setTimeout, clearTimeout },
    async fetch(url, init) {
      const response = await fetch(url, init);
      if (url.endsWith('/socket-ticket') && response.ok) peer.socketTicket = await response.clone().json();
      return response;
    },
    createWebSocket(url) {
      const socket = new WebSocket(url); peer.socket = socket;
      return { get readyState() { return socket.readyState; }, get bufferedAmount() { return socket.bufferedAmount; }, close: () => socket.close(),
        addEventListener: (type, callback) => socket.addEventListener(type, callback), removeEventListener: (type, callback) => socket.removeEventListener(type, callback),
        send(text) {
          // Labelled adversarial wire injection only; replies still come from the actual Worker.
          if (peer.mutateSignal) {
            const frame = JSON.parse(text);
            if (frame.type === 'signal') { frame.signal = peer.mutateSignal(frame.signal); peer.mutateSignal = undefined; text = JSON.stringify(frame); }
          }
          socket.send(text);
        } };
    } });
  peer.off = peer.service.onEvent(value => { try { event(peer, value); } catch (error) { fail(error); } });
}
async function makePeer(guest) {
  const window = new BrowserWindow({ show: guest, width: 640, height: 240, webPreferences: { nodeIntegration: false, contextIsolation: true,
    sandbox: true, backgroundThrottling: false, webSecurity: true, preload: join(__dirname, 'rtc-smoke-preload.cjs') } });
  const peer = { window, attempts: [], receivedSignals: 0, events: [] };
  const receive = (e, value) => {
    if (e.sender !== window.webContents || e.senderFrame !== window.webContents.mainFrame) return;
    if (value?.kind === 'page-error') fail(Error('endpoint page exception')); else peer.events.push(value);
  };
  ipcMain.on('rtc-smoke-event', receive); window.once('closed', () => ipcMain.off('rtc-smoke-event', receive));
  window.webContents.on('render-process-gone', () => { if (!stopping) fail(Error('endpoint renderer exited')); });
  await window.loadFile(join(directory, 'page/rtc-page.html'), { query: { worker: workerUrl } });
  await js(window, `(${observeNative.toString()})()`);
  await call(window, 'createTransport', 'peer', identity);
  peers.push(peer); service(peer);
  return peer;
}
// Each page's transport signals reach the service in issue order; the first offer is delayed 75 ms once.
async function pollSignals() {
  for (const peer of peers) {
    if (stopping || peer.window.isDestroyed()) continue;
    for (const { signal } of await call(peer.window, 'takeSignals')) {
      const attempt = peer.attempt;
      if (stopping || !attempt || attempt.closed || signal.attemptId !== attempt.link.attemptId) continue;
      const send = () => { if (!attempt.closed && !stopping) void peer.service.request({ type: 'signal', signal }).catch(fail); };
      if (!delayedOffer && signal.kind === 'description' && signal.description.type === 'offer') { delayedOffer = true; timers.push(setTimeout(send, 75)); }
      else send();
    }
  }
}
async function issue(h, g) {
  h.serviceReady = g.serviceReady = 0;
  const result = await h.service.request({ type: 'link-request', guestSeatId: g.session.seatId });
  await until(async () => h.serviceReady && g.serviceReady, Boolean, 'both native/service ready');
  assert(h.attempt.link.attemptId === result.attemptId && g.attempt.link.attemptId === result.attemptId, 'pair correlation');
  assert(h.attempt.link.identity.seatGeneration === g.session.seatGeneration && g.attempt.link.identity.seatGeneration === g.session.seatGeneration, 'guest-generation mapping');
  assert((await call(h.window, 'counts')).workers === 0, 'authority created before committed start');
  pairs.push([h.attempt, g.attempt]);
  console.log('LOCAL SERVICE native pair ready:', pairs.length);
}
async function replace(peer, other) {
  const old = peer.attempt, otherOld = other.attempt, from = peer.session.seatGeneration;
  peer.replacing = true; peer.off(); peer.service.close(); await closeAttempt(peer); service(peer);
  const session = await peer.service.join(peer.session.snapshot.joinCode, compatibility, peer.session.seatToken);
  peer.session = session; peer.snapshot = await peer.service.connect(session); peer.replacing = false;
  await until(async () => other.closedEvent === otherOld.link.attemptId, Boolean, 'old attempt service invalidation');
  await until(async () => (await Promise.all(peers.map(native))).every(s => s.connections.every(pc => pc.state === 'closed')), Boolean, 'old native PCs closed');
  assert(old.closed && otherOld.closed, 'replacement left old native route live');
  return { seat: peer === peers[0] ? 'host' : 'guest', from, to: session.seatGeneration, closedPcs: 2, ready: false };
}
async function rejectedRequest(peer, mutate, code) {
  peer.mutateSignal = mutate;
  const link = peer.attempt.link;
  const signal = { attemptId: link.attemptId, roomId: link.identity.roomId, hostGeneration: link.identity.hostGeneration,
    seatGeneration: link.identity.seatGeneration, from: link.identity.localConnectionId, to: link.identity.remoteConnectionId, kind: 'candidate', candidate: null };
  await peer.service.request({ type: 'signal', signal }).then(() => { throw Error('invalid wire signal accepted'); }, error => assert(error.code === code, 'wrong rejection ' + error.code));
  console.log('LOCAL SERVICE rejected wire signal:', code);
}
async function replayTicket(peer) {
  const socket = new WebSocket(baseUrl.replace(/^http/, 'ws') + `/v2/rooms/${peer.session.snapshot.roomId}/socket`);
  try {
    return await bounded(new Promise((done, reject) => {
      socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'auth', ...peer.socketTicket, expiresAtEpochMs: undefined })));
      socket.addEventListener('message', () => reject(Error('replayed socket ticket admitted')));
      socket.addEventListener('close', e => done(e.code)); socket.addEventListener('error', () => reject(Error('replay socket transport failed')));
    }), 'ticket replay');
  } finally { socket.close(); }
}
async function run() {
  assert(process.versions.electron === '37.10.3', 'wrong Electron');
  const h = await makePeer(false), g = await makePeer(true);
  pollTimer = setInterval(() => { void pollSignals().catch(fail); }, 5);
  const original = await h.service.create(compatibility, 2);
  g.session = await g.service.join(original.snapshot.joinCode, compatibility);
  h.session = await h.service.join(original.snapshot.joinCode, compatibility, original.seatToken);
  assert(h.session.seatGeneration === 2 && g.session.seatGeneration === 1, 'unequal initial generations missing');
  h.snapshot = await h.service.connect(h.session); g.snapshot = await g.service.connect(g.session);
  await bounded(new Promise((done, reject) => { process.once('message', message => message === 'hibernated' ? done() : reject(Error('runtime hibernation failed'))); process.send('hibernate'); }), 'actual hibernation');
  await issue(h, g);
  const staleTicketCloseCode = await replayTicket(g); assert(staleTicketCloseCode === 1008, 'stale ticket not rejected');
  const oldLink = h.attempt.link;
  const replacements = [await replace(g, h)]; await issue(h, g); replacements[0].ready = true;
  replacements.push(await replace(h, g)); await issue(h, g); replacements[1].ready = true;
  await rejectedRequest(h, signal => ({ ...signal, attemptId: oldLink.attemptId, seatGeneration: oldLink.identity.seatGeneration,
    from: oldLink.identity.localConnectionId, to: oldLink.identity.remoteConnectionId }), 'invalid-state');
  await rejectedRequest(g, signal => ({ ...signal, to: oldLink.identity.remoteConnectionId }), 'forbidden');
  const order = { hostNativeReady: h.attempt.ready, guestNativeReady: g.attempt.ready, serviceReady: Math.min(h.serviceReady, g.serviceReady) };
  const init = { ...fixtureInit, runId: h.session.snapshot.runId };
  const initBase64 = Buffer.from(bytes(init)).toString('base64'), initHash = createHash('sha256').update(bytes(init)).digest('hex');
  await h.service.request({ type: 'ready', ready: true }); await g.service.request({ type: 'ready', ready: true });
  await until(async () => h.snapshot.seats.every(seat => seat.ready), Boolean, 'ready roster');
  const revision = h.snapshot.rosterRevision;
  const proposal = await h.service.request({ type: 'start-propose', expectedRosterRevision: revision, initBase64, initHash });
  const committed = await h.service.request({ type: 'start-commit', proposalId: proposal.proposalId, expectedRosterRevision: revision });
  assert(committed.initBase64 === initBase64 && committed.initHash === initHash, 'committed init mismatch'); order.committed = ++sequence;
  const renew = () => h.service.request({ type: 'lease-renew', nonce: randomBytes(16).toString('hex') });
  await renew(); renewTimer = setInterval(() => { void renew().catch(fail); }, 5000);
  assert((await call(h.window, 'startHost', identity)).ok, 'Worker host start failed'); order.authorityCreated = ++sequence;
  const started = await call(h.window, 'hostRequest', { kind: 'start', initBytes: Buffer.from(bytes(init)).toString('base64') });
  assert(started.ok && started.value.ok, 'actual authority start failed');
  await call(g.window, 'attachClient', 'peer', g.attempt.link.attemptId, 1, init.runId);
  const subscribed = await until(async () => g.events.find(value => value.kind === 'subscribed'), Boolean, 'guest subscription');
  assert(subscribed.canAllocate === false, 'guest input enabled before full ACK');
  assert((await js(g.window, 'window.rtcSmoke.status()')).publication === null, 'publication before authority attachment');
  const attached = await call(h.window, 'relayToHost', 'peer', h.attempt.link.attemptId, 'service-guest', [1], h.attempt.cap.latestPayloadLimit);
  assert(attached.ok, 'authority attachment failed'); order.attached = ++sequence;
  await until(() => js(g.window, 'window.rtcSmoke.status()'), s => s.canAllocate && s.controls.ack > 0 && s.controls['full-received'] > 0, 'actual guest full ACK');
  if (process.argv.includes('--inject-page-failure')) { await js(g.window, 'window.rtcSmoke.injectPageFailure()'); await bounded(new Promise(() => {}), 'page fault'); }
  if (process.argv.includes('--inject-timeout')) await new Promise(() => {});
  const command = await js(g.window, 'window.rtcSmoke.pause(false)');
  assert(command?.id.player === 1, 'owned guest command missing');
  const applied = await until(() => js(g.window, 'window.rtcSmoke.status()'), s => s.results.some(r => r.id.player === 1 && r.id.sequence === command.id.sequence && r.status === 'applied'), 'applied owned command');
  const publication = applied.publication;
  const authoritative = await call(h.window, 'observerCall', 'peer', h.attempt.link.attemptId, 'publication', publication.publicationSequence);
  assert(authoritative && JSON.stringify(authoritative) === JSON.stringify(publication), 'guest/authority publication mismatch');
  const checkpoint = await call(h.window, 'hostRequest', { kind: 'checkpoint' }); assert(checkpoint.ok && checkpoint.value.ok, 'authority checkpoint failed');
  const saved = JSON.parse(Buffer.from(checkpoint.value.checkpointBytes, 'base64').toString('utf8'));
  assert(saved.init.runId === init.runId && publication.runId === init.runId, 'service/authority/guest runId mismatch');
  const statuses = await Promise.all(peers.map(native));
  assert(statuses.every(s => s.connections.at(-1).selected && s.connections.at(-1).direct), 'actual selected direct route missing');
  const observed = await call(h.window, 'observerCall', 'peer', h.attempt.link.attemptId, 'stats');
  const gameplay = { fullReceipts: observed.fullReceipts, validatedAcks: observed.validatedAcks, appliedCommands: 1, matchedPublications: 1, runIdentity: true, direct: true };
  await js(g.window, 'window.rtcSmoke.dispose()');
  for (const peer of peers) { peer.off(); peer.service.close(); await closeAttempt(peer); }
  const closed = await until(async () => Promise.all(peers.map(native)), all => all.every(s => s.timers === 0 && s.connections.every(pc => pc.state === 'closed'
    && pc.listeners === 0 && pc.channels.every(dc => dc.state === 'closed' && dc.listeners === 0))), 'native resource cleanup');
  stopping = true; clearInterval(renewTimer); clearInterval(pollTimer); for (const timer of timers) clearTimeout(timer);
  const hostCounts = await call(h.window, 'dispose'); await call(g.window, 'dispose');
  for (const peer of peers) peer.window.destroy();
  assert(BrowserWindow.getAllWindows().length === 0 && ipcMain.listenerCount('rtc-smoke-event') === 0, 'owner resource leak');
  const report = { electron: process.versions.electron,
    composition: { pairs: pairs.length, hostSeatGeneration: 2, guestSeatGeneration: 1, pairSeatGeneration: pairs[0][0].link.identity.seatGeneration,
      delayedOffer, staleSignalRejected: true, crossSeatRejected: true, staleTicketCloseCode }, order, replacements, gameplay,
    cleanup: { pcs: closed.reduce((n, s) => n + s.connections.length, 0), closedPcs: closed.reduce((n, s) => n + s.connections.filter(pc => pc.state === 'closed').length, 0),
      timers: 0, listeners: 0, workers: hostCounts.workers, workerExits: hostCounts.workerExits, windows: BrowserWindow.getAllWindows().length, ports: 0 } };
  if (process.argv.includes('--inject-missing-evidence')) delete report.gameplay;
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report));
}
app.whenReady().then(async () => {
  let code = 0;
  try { await bounded(run(), 'whole local service native gate', process.argv.includes('--inject-timeout') ? 4000 : 35000); }
  catch (error) { code = 1; console.error(error.stack ?? error); }
  finally {
    stopping = true; clearInterval(renewTimer); clearInterval(pollTimer); for (const timer of timers) clearTimeout(timer);
    for (const peer of peers) { peer.off?.(); peer.service?.close(); }
    let workers = 0, workerExits = 0;
    for (const window of BrowserWindow.getAllWindows()) {
      try { const counts = await bounded(js(window, 'window.rtcPage?.dispose()'), 'failure page dispose', 3000, true); workers += counts?.workers ?? 0; workerExits += counts?.workerExits ?? 0; }
      catch { code = 1; }
      window.destroy();
    }
    console.log(`LOCAL SERVICE native cleanup: workerExits=${workerExits}/${workers}, windows=${BrowserWindow.getAllWindows().length}`);
    app.exit(code);
  }
});
```

The endpoint pages' `ports` are released by `release`/`dispose` (closing every attempt and relay port), so the report's `ports` is 0 by construction once `dispose` resolved. In `scripts/network/room-service-smoke.ts`, keep both lib builds (`rtc-smoke-client.cjs` for `init`, `service-client.cjs` for main's client), drop the `client/index.html` write, and add the endpoint page build exactly as in `rtc-smoke.ts` (output `join(directory, 'page')`). `scripts/network/room-service-report.ts`: `x.utilities !== 1 || x.utilityExits !== 1` becomes `x.workers !== 1 || x.workerExits !== 1`; `tests/roomServiceRuntimeGate.test.ts`'s fixture cleanup becomes `{ pcs: 6, closedPcs: 6, timers: 0, listeners: 0, workers: 1, workerExits: 1, windows: 0, ports: 0 }` and its `['cleanup', 'utilityExits', 0]` case becomes `['cleanup', 'workerExits', 0]`.

Run: `npm run test:room-service-runtime`, then each injection: `npx tsx scripts/network/room-service-smoke.ts --inject-worker-failure` (and `--inject-page-failure`, `--inject-timeout`, `--inject-missing-evidence`), then `npx vitest run tests/roomServiceRuntimeGate.test.ts`
Expected: `ACTUAL LOCAL SERVICE/native RTC PASS: …` for the plain run; each injection exits nonzero; the gate test PASSes.

- [ ] **Step 5: Commit**

```bash
git add scripts/network/rtc-page.ts scripts/network/rtc-page.html scripts/network/rtc-config-smoke.cjs scripts/network/rtc-config-smoke.ts scripts/network/rtc-smoke.cjs \
  scripts/network/rtc-smoke.ts scripts/network/rtc-smoke-client.ts scripts/network/rtc-smoke-report.ts scripts/network/room-service-smoke.cjs scripts/network/room-service-smoke.ts \
  scripts/network/room-service-report.ts tests/rtcRuntimeGate.test.ts tests/roomServiceRuntimeGate.test.ts
git commit -m "test(web-i): RTC, RTC-config and room-service smokes on page transports and the page-owned Worker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Gates III: the whole-app gates, the minimized host and the close gate (spec §8 rows `test:online-app-runtime`, `test:online-recovery-runtime`, `test:duel-app-runtime`, `test:internet-app-runtime`; "Electron minimized host"; "Electron close")

All four app gates run the production app through `scripts/network/online-app-smoke.cjs`. That wrapper loses its main-side instrumentation (utility fork, `MessageChannelMain`, main `fetch`, hidden-window CDP) and gains a page-side probe.

**Files:**
- Create: `scripts/network/page-probe.ts`
- Rewrite: `scripts/network/online-app-smoke.cjs`
- Modify: `scripts/network/online-observer-build.ts` (also builds `page-probe.js`), `scripts/network/online-app-observer.ts`, `scripts/network/duel-app-observer.ts` (port source), `scripts/network/online-recovery-utility.ts` (Worker scope), `scripts/network/online-recovery-utility.cjs` (deleted; replaced by protocol interception), `scripts/network/online-app-smoke.ts`, `scripts/network/online-recovery-smoke.ts`, `scripts/network/duel-app-smoke.ts`, `scripts/network/internet-app-smoke.ts` (env `FTLITE_ONLINE_TEST_PROBE=1`, field renames), `scripts/network/online-app-report.ts`, `scripts/network/online-recovery-report.ts`, `scripts/network/internet-app-report.ts`
- Modify tests: `tests/onlineRecoveryInstrumentation.test.ts`, `tests/onlineAppReport.test.ts`, `tests/onlineRecoveryReport.test.ts`, `tests/internetAppReport.test.ts:80,91`, `tests/internetAppSmoke.test.ts` (artifact list only, through `INTERNET_ARTIFACTS`)

**Interfaces:**
- Consumes: deviation D-1's `window.__ftliteOnlineTest` and `ftlite:online:test-port` (Task 6); `app:prepare-exit` (Task 7); `powerMonitor` → `app:suspend` push (Task 7).
- Produces: `window.onlineProbe` in the app page (harness only; below).

- [ ] **Step 1: Write the page probe**

`scripts/network/page-probe.ts`:
```ts
// TEST ONLY (Web-i Task 11): injected into the app page's main world before any page script by
// scripts/network/online-app-smoke.cjs (CDP Page.addScriptToEvaluateOnNewDocument). It observes the page's own fetch,
// Worker, MessagePorts and online status; product code is unchanged. Main drains it with onlineProbe.take().
type Flags = { holdUploads: boolean; delayExitCommit: boolean; holdRestore: boolean; blockNextGrant: boolean; delayNextFetch: boolean;
  stopping: boolean; recoveryObserve: boolean; countPorts: boolean };
interface WorkerRecord { index: number; terminated: boolean; errored: boolean; runId?: string; utilityEpoch?: string; hostGeneration?: number;
  initialCaptureTick?: number; periodicCapturedTick?: number; bootstrapAfterCommit?: boolean; producerChanges: unknown[]; invalidations: string[];
  captures: { cause: string; bytes: string }[]; restores: string[]; evidence: unknown[] }
const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const busy = (ms: number) => { const end = performance.now() + ms; while (performance.now() < end) { /* deliberate */ } };
const probe = {
  flags: { holdUploads: false, delayExitCommit: false, holdRestore: false, blockNextGrant: false, delayNextFetch: false, stopping: false, recoveryObserve: false, countPorts: false } as Flags,
  bodies: [] as { method: string; bytes: string }[], pendingBody: undefined as string | undefined, heldUploads: 0, exitCommitDelayMs: 0,
  exitCommitAcknowledged: undefined as boolean | undefined, mainBlockedMs: 0, restoreRelease: undefined as (() => void) | undefined,
  workers: [] as WorkerRecord[], ports: new Set<MessagePort>(), gone: new WeakSet<MessagePort>(), phases: [] as string[], mirrorReceipts: [] as any[],
  set(flags: Partial<Flags>) { Object.assign(probe.flags, flags); return true; },
  releaseRestore() { probe.restoreRelease?.(); return true; },
  /** Drain the queued observations; main accumulates them per Worker index (online-app-smoke.cjs absorb()). */
  take() {
    const pendingBody = probe.pendingBody; probe.pendingBody = undefined;
    return { bodies: probe.bodies.splice(0), pendingBody, heldUploads: probe.heldUploads, mainBlockedMs: probe.mainBlockedMs,
      exitCommitDelayMs: probe.exitCommitDelayMs, exitCommitAcknowledged: probe.exitCommitAcknowledged, phases: [...probe.phases], mirrorReceipts: [...probe.mirrorReceipts],
      workers: probe.workers.map(w => ({ ...w, producerChanges: w.producerChanges.splice(0), invalidations: w.invalidations.splice(0),
        captures: w.captures.splice(0), restores: w.restores.splice(0), evidence: w.evidence.splice(0) })) };
  },
  /** Only channels created after the driver armed counting (its first online action): the online stack's own ports,
   *  not React's scheduler channel or any other page-start channel that lives for the page's lifetime. */
  openPorts: () => [...probe.ports].filter(port => !probe.gone.has(port)).length,
  counts() { return { workers: probe.workers.length, workerExits: probe.workers.filter(w => w.terminated || w.errored).length, ports: probe.openPorts(), observedPagePorts: probe.ports.size }; }
};
(window as any).onlineProbe = probe;
// fetch: hold, delay and record checkpoint bodies (the old main-side fetch wrapper, now in the page that fetches).
const nativeFetch = window.fetch.bind(window), delay = (ms: number) => new Promise(done => setTimeout(done, ms));
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input)), checkpoint = url.pathname.endsWith('/checkpoint'), method = init?.method ?? 'GET';
  if (probe.flags.delayNextFetch) { probe.flags.delayNextFetch = false; await delay(1200); }
  if (checkpoint && method === 'PUT' && probe.flags.holdUploads) {
    probe.heldUploads++; probe.pendingBody = b64(new Uint8Array(init!.body as Uint8Array));
    await new Promise((_, reject) => { const abort = () => reject(Error('held-upload-aborted')); if (init?.signal?.aborted) abort(); else init?.signal?.addEventListener('abort', abort, { once: true }); });
  }
  if (checkpoint && method === 'PUT' && probe.flags.stopping && probe.flags.delayExitCommit) {
    probe.flags.delayExitCommit = false; probe.exitCommitAcknowledged = false; const began = performance.now(); await delay(2600); probe.exitCommitDelayMs = performance.now() - began;
  }
  const response = await nativeFetch(input, init);
  if (checkpoint && method === 'PUT' && probe.flags.stopping && probe.exitCommitAcknowledged === false) probe.exitCommitAcknowledged = response.ok;
  if (checkpoint && response.ok) {
    const bytes = method === 'PUT' ? new Uint8Array(init!.body as Uint8Array) : new Uint8Array(await response.clone().arrayBuffer());
    probe.bodies.push({ method, bytes: b64(bytes) }); if (probe.bodies.length > 16) probe.bodies.shift();
    if (method === 'GET' && probe.flags.holdRestore) { probe.flags.holdRestore = false; await new Promise<void>(done => { probe.restoreRelease = done; }); }
  }
  return response;
};
// MessagePorts: online-owned channels (created once counting is armed), and which of them were closed or transferred.
const NativeChannel = window.MessageChannel;
window.MessageChannel = class extends NativeChannel {
  constructor() { super(); if (probe.flags.countPorts) { probe.ports.add(this.port1); probe.ports.add(this.port2); } }
} as typeof MessageChannel;
const close = MessagePort.prototype.close, portPost = MessagePort.prototype.postMessage as (m: unknown, t?: Transferable[]) => void;
MessagePort.prototype.close = function (this: MessagePort) { probe.gone.add(this); return close.call(this); };
const transferred = (list: unknown) => { for (const item of Array.isArray(list) ? list : []) if (item instanceof MessagePort) probe.gone.add(item); };
MessagePort.prototype.postMessage = function (this: MessagePort, message: unknown, transfer?: any) { transferred(transfer); return portPost.call(this, message, transfer); } as never;
// Workers: the old utility postMessage and message observation, on the page's Worker object.
const NativeWorker = window.Worker;
window.Worker = new Proxy(NativeWorker, { construct(Target, args) {
  const worker: Worker = Reflect.construct(Target, args), record: WorkerRecord = { index: probe.workers.length, terminated: false, errored: false,
    producerChanges: [], invalidations: [], captures: [], restores: [], evidence: [] };
  probe.workers.push(record);
  if (probe.flags.recoveryObserve) {
    // The first message the Worker sees, before the owner's initialize; the recovery prelude consumes it.
    const channel = new NativeChannel(); channel.port1.onmessage = event => { record.evidence.push(event.data); if (record.evidence.length > 64) record.evidence.shift(); };
    worker.postMessage({ kind: '__recovery-evidence' }, [channel.port2]);
  }
  const terminate = worker.terminate.bind(worker); worker.terminate = () => { record.terminated = true; terminate(); };
  worker.addEventListener('error', () => { record.errored = true; });
  worker.addEventListener('message', event => {
    const message = event.data;
    if (message?.kind !== 'checkpoint') return;
    const candidate = message.candidate;
    if (candidate?.bytes) { record.captures.push({ cause: candidate.cause, bytes: b64(candidate.bytes) }); if (record.captures.length > 64) record.captures.shift(); }
    if (candidate?.cause === 'initial' && candidate.capturedTick === 0) record.initialCaptureTick = 0;
    if (candidate?.cause === 'periodic' && candidate.capturedTick === 300) record.periodicCapturedTick = 300;
  });
  const post = worker.postMessage.bind(worker) as (m: any, t?: Transferable[]) => void;
  worker.postMessage = ((message: any, transfer?: Transferable[]) => {
    const delayedGrant = message?.kind === 'lease-grant' && probe.flags.blockNextGrant;
    if (delayedGrant) { probe.flags.blockNextGrant = false; const began = performance.now(); busy(25000); probe.mainBlockedMs = performance.now() - began; }
    if (message?.kind === 'initialize') { record.runId = message.sessionLease?.runId; record.utilityEpoch = message.sessionLease?.utilityEpoch; record.hostGeneration = message.hostGeneration; }
    if (message?.kind === 'command' && message.command?.kind === 'restore') record.restores.push(b64(message.command.checkpointBytes));
    if (message?.kind === 'lease-invalidate') record.invalidations.push(message.reason);
    if (message?.kind === 'bootstrap-complete') record.bootstrapAfterCommit = record.initialCaptureTick === 0 && probe.mirrorReceipts.some(m => m.runId === record.runId && m.capturedTick === 0);
    if (message?.kind === 'command') record.producerChanges.push({ kind: message.command?.kind, seatId: message.command?.seatId, player: message.command?.player, human: message.command?.human });
    transferred(transfer); post(message, transfer ?? []);
    // Keep the page's queued timeout/teardown callbacks blocked until the old Worker has examined the late reply.
    if (delayedGrant) busy(500);
  }) as typeof worker.postMessage;
  return worker;
} });
// Status: the test facade (deviation D-1) once the page creates it.
const watch = setInterval(() => {
  const facade = (window as any).__ftliteOnlineTest; if (!facade) return; clearInterval(watch);
  facade.onStatus((envelope: any) => {
    const status = envelope.status;
    if (probe.phases.at(-1) !== status.phase) probe.phases.push(status.phase);
    const m = status.mirror?.committed;
    if (m && !probe.mirrorReceipts.some(old => old.runId === m.runId && old.hostGeneration === m.hostGeneration && old.checkpointSequence === m.checkpointSequence)) {
      probe.mirrorReceipts.push({ runId: m.runId, hostGeneration: m.hostGeneration, checkpointSequence: m.checkpointSequence, capturedTick: m.capturedTick, payloadSha256: m.payloadSha256 });
      if (probe.mirrorReceipts.length > 64) probe.mirrorReceipts.shift();
    }
  });
}, 20);
export {};
```

In `scripts/network/online-observer-build.ts`, add a second iife build of `scripts/network/page-probe.ts` to `observer/page-probe.js` beside `observer/observer.js` (same options as the observer build).

In `scripts/network/online-app-observer.ts` and `scripts/network/duel-app-observer.ts`, replace the `window.addEventListener('message', event => { if (event.source !== window || event.data?.source !== 'ftlite:online:main' || event.ports.length !== 1) return; const port = event.ports[0]!, … descriptor: event.data.descriptor …` header with:

```ts
window.addEventListener('ftlite:online:test-port', (event: Event) => {
  const { descriptor, port } = (event as CustomEvent<{ descriptor: unknown; port: MessagePort }>).detail;
```

keeping the body (`record.descriptor = descriptor`, the `port.postMessage`/`port.close` wraps and the `message` listener) unchanged. The page dispatches this event before the game's own listener receives the same port (Task 6), so the wraps are installed first, as they were.

- [ ] **Step 2: Rewrite the app wrapper**

`scripts/network/online-app-smoke.cjs` (replace the whole file):

```js
// TEST ONLY executable wrapper (Web-i). Loads the unchanged compiled production app; every observation of the online
// stack happens in the page (page-probe.js, injected before any page script) and is read back here.
const electron = require('electron');
const { app, BrowserWindow, ipcMain, powerMonitor, protocol, net, session } = electron;
process.on('uncaughtException', () => { console.error('APP_DRIVER_UNCAUGHT'); app.exit(1); });
const { resolve, join, sep } = require('node:path');
const { pathToFileURL } = require('node:url');
const { readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const observeNative = require('./rtc-smoke-native.cjs');
const clickVerified = require('./online-app-click.cjs');
const directory = app.commandLine.getSwitchValue('online-app-dir');
const role = app.commandLine.getSwitchValue('online-app-role');
const profile = app.commandLine.getSwitchValue('user-data-dir');
if (app.isPackaged || !directory || !['host', 'guest', 'filler', 'incompatible'].includes(role)
  || resolve(profile) !== resolve(directory, role) || !resolve(profile).startsWith(resolve(directory) + sep)) throw Error('isolated test profile required');
app.setPath('userData', profile);
app.disableHardwareAcceleration();
// Multiple real app windows in automation must not be treated as occluded by the harness terminal.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const recoveryObserve = app.commandLine.hasSwitch('recovery-observe-worker');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function checkpointProof(bytes) {
  const b = Buffer.from(bytes), cp = JSON.parse(b.toString());
  return { payloadSha256: hash(b), runId: cp.init.runId, tick: cp.snapshot.header.tick, phase: cp.phase,
    commandHighWater: cp.commandHighWater, heldHighWater: cp.heldHighWater, botMemoryHash: hash(JSON.stringify(cp.botControllers)), botMemory: cp.botControllers,
    reconciledBotMemory: require(join(directory, 'observer/utility.cjs')).reconciledMemory(cp), snapshotHash: hash(JSON.stringify(cp.snapshot)) };
}
// Everything main accumulates from the page probe (onlineProbe.take() drains the page's queues; these keep them).
const recovery = { gets: [], puts: [], restores: [], captures: [], phases: [], invalidations: [], clicks: [], heldUploads: 0 };
const workerRecords = [];   // by creation index
let mirrorReceipts = [], visible, stopping = false, ignoreDriver = false, exitSnapshot, exitAnsweredAt;
const delay = ms => new Promise(done => setTimeout(done, ms));
const js = source => visible.webContents.executeJavaScript(source);
const bound = (list, value) => { list.push(value); if (list.length > 64) list.shift(); };
async function absorb() {
  if (!visible || visible.isDestroyed()) return;
  const taken = await js('window.onlineProbe.take()');
  for (const body of taken.bodies) bound(body.method === 'PUT' ? recovery.puts : recovery.gets, checkpointProof(Buffer.from(body.bytes, 'base64')));
  if (taken.pendingBody) recovery.pending = checkpointProof(Buffer.from(taken.pendingBody, 'base64'));
  for (const w of taken.workers) {
    const record = workerRecords[w.index] ??= { index: w.index, producerChanges: [], evidence: null };
    Object.assign(record, { exited: w.terminated || w.errored, runId: w.runId, utilityEpoch: w.utilityEpoch, hostGeneration: w.hostGeneration,
      initialCaptureTick: w.initialCaptureTick, periodicCapturedTick: w.periodicCapturedTick, bootstrapAfterCommit: w.bootstrapAfterCommit });
    record.producerChanges.push(...w.producerChanges);
    for (const capture of w.captures) bound(recovery.captures, { cause: capture.cause, ...checkpointProof(Buffer.from(capture.bytes, 'base64')) });
    for (const restore of w.restores) bound(recovery.restores, checkpointProof(Buffer.from(restore, 'base64')));
    recovery.invalidations.push(...w.invalidations);
    if (w.evidence.length) { record.evidence = w.evidence.at(-1); writeFileSync(join(directory, `${role}-utility-${w.index}.json`), JSON.stringify(record.evidence)); }
  }
  Object.assign(recovery, { heldUploads: taken.heldUploads, mainBlockedMs: taken.mainBlockedMs || undefined,
    exitCommitDelayMs: taken.exitCommitDelayMs, exitCommitAcknowledged: taken.exitCommitAcknowledged, phases: taken.phases });
  mirrorReceipts = taken.mirrorReceipts;
}
const workerView = () => workerRecords.map(({ index, exited, producerChanges }) => ({ index, exited: !!exited, producerChanges }));
// Instrument before the page loads: rtcNative, the probe and the observer run before any page script.
const probeSource = [`(${observeNative.toString()})({forceRelay:${app.commandLine.hasSwitch('internet-force-relay')}});`,
  readFileSync(join(directory, 'observer/page-probe.js'), 'utf8'),
  recoveryObserve ? 'window.onlineProbe.set({ recoveryObserve: true });' : '',
  readFileSync(join(directory, 'observer/observer.js'), 'utf8')].join('\n');
app.on('browser-window-created', (_, window) => {
  if (visible) return;   // the production app opens exactly one window
  visible = window;
  const diagnosticContext = { role, page: 'application' };
  window.webContents.on('preload-error', () => console.error('APP_PRELOAD_ERROR', diagnosticContext));
  window.webContents.on('console-message', details => { if (details.level === 'error') console.error('APP_PAGE_ERROR', diagnosticContext); });
  for (const method of ['loadFile', 'loadURL']) {
    const original = window[method].bind(window);
    window[method] = async (...args) => {
      window.webContents.debugger.attach('1.3');
      await window.webContents.debugger.sendCommand('Page.enable');
      await window.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: probeSource });
      return original(...args);
    };
  }
});
// The close handshake: snapshot the page after its session's exit save and disposal, just before the window closes.
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, fn) => handle(channel, channel !== 'app:prepare-exit' ? fn : async (event, ...args) => {
  try { await absorb(); exitSnapshot = { ...(await js('window.onlineProbe.counts()')), native: await js('window.rtcNative?.status()') }; } catch { /* page already gone */ }
  const answered = fn(event, ...args); if (answered === true) exitAnsweredAt = Date.now(); return answered;
});
const checkpointPuts = [];
app.whenReady().then(() => {
  session.defaultSession.webRequest.onSendHeaders({ urls: ['*://*/v2/rooms/*/checkpoint'] }, details => {
    if (details.method === 'PUT') checkpointPuts.push({ id: details.id, sentAt: Date.now(), header: details.requestHeaders['X-FTL-Checkpoint'] ?? null });
  });
  session.defaultSession.webRequest.onCompleted({ urls: ['*://*/v2/rooms/*/checkpoint'] }, details => {
    const put = checkpointPuts.find(p => p.id === details.id); if (put) { put.status = details.statusCode; put.completedAt = Date.now(); }
  });
  if (!recoveryObserve) return;
  // The recovery gate's Worker: the observer prelude, then the exactly-instrumented production chunk.
  const workerPath = resolve(__dirname, '../../out/renderer/assets/authorityWorker.js'), workerUrl = pathToFileURL(workerPath).href;
  const source = readFileSync(workerPath, 'utf8'), transformed = require('./online-recovery-instrument.cjs')(source);
  const prelude = readFileSync(join(directory, 'observer/recovery-worker.js'), 'utf8');
  writeFileSync(join(directory, `${role}-instrumentation.json`), JSON.stringify({ sourceSha256: hash(source), observedSha256: hash(transformed),
    transformSha256: hash(readFileSync(require.resolve('./online-recovery-instrument.cjs'))) }));
  protocol.handle('file', request => request.url === workerUrl
    ? new Response(prelude + '\n' + transformed, { headers: { 'Content-Type': 'text/javascript' } })
    : net.fetch(request, { bypassCustomProtocolHandlers: true }));
});
const decodeHeader = header => { try { return JSON.parse(Buffer.from(header.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8')); } catch { return null; } };
async function closeWindow() {
  const closeAt = Date.now(), closed = new Promise(done => visible.once('closed', done));
  visible.close();   // the production close: app:prepare-exit, the page's exit save, then close
  await Promise.race([closed, delay(5000)]);
  return { closeAt, exitAnsweredAt: exitAnsweredAt ?? null, closed: visible.isDestroyed(), snapshot: exitSnapshot ?? null,
    puts: checkpointPuts.filter(p => p.sentAt >= closeAt).map(p => ({ status: p.status ?? null, elapsedMs: (p.completedAt ?? Infinity) - closeAt, metadata: p.header && decodeHeader(p.header) })) };
}
const armPorts = () => js('window.onlineProbe.set({ countPorts: true })');
async function click(id) {
  await armPorts();
  const attempts = await clickVerified({
    prepare: async () => {
      visible.focus();
      return js(`(() => { const id=${JSON.stringify(id)}, e=document.querySelector('[data-testid="'+id+'"]'); if(!e||e.disabled) throw Error('unavailable control');
        window.onlineDriverHit='miss'; const listener=event=>{const target=event.target.closest?.('[data-testid]'); window.onlineDriverHit=target?.dataset.testid===id?'target':event.target.closest?.('button,input,select')?'other':'miss';};
        window.onlineDriverClickListener=listener;document.addEventListener('click',listener,true);
        const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
    },
    send: point => { visible.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 }); visible.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 }); },
    settle: () => delay(60),
    observed: () => js(`(() => {document.removeEventListener('click',window.onlineDriverClickListener,true);delete window.onlineDriverClickListener;return window.onlineDriverHit;})()`)
  });
  bound(recovery.clicks, { id, attempts });
}
async function resources() {
  await absorb();
  return { bounds: visible.getBounds(), minimized: visible.isMinimized(), visible: visible.isVisible(), focused: visible.isFocused(),
    rendererPid: visible.webContents.getOSProcessId(), workers: workerView(), windows: BrowserWindow.getAllWindows().length,
    ports: await js('window.onlineProbe.openPorts()'), native: [await js('window.rtcNative.status()')], listeners: ipcMain.listenerCount('app:online-config') };
}
async function command(message) {
  switch (message.command) {
    case 'status': {
      const page = await js(`(async () => ({status:(await window.__ftliteOnlineTest.readStatus()).status, observations:window.onlineAppObservation(), keys:window.onlineAppKeys, text:document.body.innerText, hidden:document.hidden, focused:document.hasFocus()}))()`);
      await absorb();
      return { ...page, electron: process.versions.electron, recovery,
        mirrorProof: { receipts: mirrorReceipts, workers: workerRecords.map(({ runId, utilityEpoch, hostGeneration, initialCaptureTick, periodicCapturedTick, bootstrapAfterCommit }) =>
          ({ runId, utilityEpoch, hostGeneration, initialCaptureTick, periodicCapturedTick, bootstrapAfterCommit })) } };
    }
    case 'delay-exit-commit': return js('window.onlineProbe.set({ delayExitCommit: true })');
    case 'hold-upload': return js('window.onlineProbe.set({ holdUploads: true })');
    case 'block-next-grant': return js('window.onlineProbe.set({ blockNextGrant: true })');
    case 'hold-restore': return js('window.onlineProbe.set({ holdRestore: true })');
    case 'release-restore': return js('window.onlineProbe.releaseRestore()');
    // The real Electron path (spec §8): main's production powerMonitor handler pushes app:suspend to the page.
    case 'suspend-hook': powerMonitor.emit('suspend'); return true;
    case 'ignore-driver': ignoreDriver = true; return true;
    case 'resize': {
      if (![[1280, 720], [640, 480]].some(([w, h]) => message.width === w && message.height === h)) throw Error('invalid test size');
      visible.setMinimumSize(640, 480); visible.setContentSize(message.width, message.height); await delay(150); return true;
    }
    case 'layout': return js(`(() => { const rect = e => { const r=e.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,width:r.width,height:r.height}; }; return {width:innerWidth,height:innerHeight,menu:rect(document.querySelector('[data-testid="session-menu"]')),canvas:rect(document.querySelector('canvas'))}; })()`);
    case 'click': await click(message.id); return true;
    case 'open-multiplayer': await click('multiplayer'); return true;
    // The sector's test-only entry (H-2 spec §10) through the test facade (Web-i deviation D-1).
    case 'host-sector': if (!Number.isSafeInteger(message.capacity)) throw Error('invalid test capacity');
      await armPorts(); await js(`void window.__ftliteOnlineTest.host({mode:'sector',capacity:${message.capacity}}); true`); return true;
    case 'join-sector': if (!/^[0-9A-Z]{8}$/.test(String(message.code))) throw Error('invalid test code');
      await armPorts(); await js(`void window.__ftliteOnlineTest.join(${JSON.stringify(message.code)},'sector'); true`); return true;
    case 'type': await click(message.id); visible.webContents.insertText(message.text); return true;
    case 'capacity': await click('capacity'); visible.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Home' }); visible.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Home' });
      for (let i = 1; i < message.value; i++) { visible.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' }); visible.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' }); }
      visible.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); visible.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); return true;
    case 'key': visible.restore(); visible.show(); visible.focus(); visible.webContents.focus(); await js('document.activeElement?.blur()'); visible.webContents.sendInputEvent({ type: message.down ? 'keyDown' : 'keyUp', keyCode: message.key }); return true;
    case 'focus': visible.restore(); visible.show(); visible.focus(); visible.webContents.focus(); return true;
    case 'blur': visible.blur(); visible.minimize(); return true;
    case 'screenshot': {
      visible.show(); visible.focus(); await delay(300);
      const capture = await visible.webContents.debugger.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const bytes = Buffer.from(capture.data, 'base64'); if (bytes.length < 1000) throw Error('empty screenshot');
      writeFileSync(message.path, bytes); return { bytes: bytes.length };
    }
    case 'resources': return resources();
    case 'resource-counts': { const r = await resources(); return { workers: r.workers, windows: r.windows, ports: r.ports, listeners: r.listeners, rendererPid: r.rendererPid }; }
    // Only --inject-transport-failure uses this; the run must then fail. Every native peer connection in the page closes.
    case 'transport-death': return js('window.rtcNative.closeAll()');
    // The next lobby request waits 1.2 s: the window the old slow hidden-window load gave the cancel case.
    case 'delay-next-transport': return js('window.onlineProbe.set({ delayNextFetch: true })');
    case 'close-window': { await js('window.onlineProbe.set({ stopping: true })').catch(() => {}); return closeWindow(); }
    case 'shutdown': {
      stopping = true;
      const budget = Number.isFinite(message.shutdownBudgetMs) ? Math.max(0, Math.min(4500, message.shutdownBudgetMs)) : 4500, began = performance.now();
      let closedResult = { snapshot: null };
      if (visible && !visible.isDestroyed()) {
        await js('window.onlineProbe.set({ stopping: true })').catch(() => {});
        closedResult = await Promise.race([closeWindow(), delay(budget).then(() => ({ snapshot: exitSnapshot ?? null }))]);
      }
      if (visible && !visible.isDestroyed()) visible.destroy();
      const s = closedResult.snapshot ?? { workers: workerRecords.length, workerExits: workerRecords.filter(w => w.exited).length, ports: 0, observedPagePorts: 0, native: { connections: [] } };
      const connections = s.native?.connections ?? [];
      const result = { workers: s.workers, workerExits: s.workerExits, workerIds: workerRecords.map(w => w.index),
        windows: BrowserWindow.getAllWindows().length, ports: s.ports, listeners: ipcMain.listenerCount('app:online-config'),
        peers: connections.filter(c => c.state !== 'closed').length, nativePeersObserved: connections.length,
        nativePeerCloses: connections.filter(c => c.state === 'closed').length, nativePeersEndedWithPage: 0, observedPagePorts: s.observedPagePorts };
      result.shutdownComplete = result.workers === result.workerExits && result.windows === 0 && result.ports === 0 && result.listeners === 0 && result.peers === 0;
      if (recovery.exitCommitAcknowledged !== undefined) result.exitCommitAcknowledged = recovery.exitCommitAcknowledged;
      result.exitCommitDelayMs = recovery.exitCommitDelayMs ?? 0;
      result.shutdownElapsedMs = Math.min(budget, performance.now() - began);
      process.send?.({ id: message.requestId, result }, () => app.exit(result.shutdownComplete ? 0 : 1)); return;
    }
    default: throw Error('unknown driver command');
  }
}
// Hold the wrapper alive long enough to report the shutdown result.
app.on('window-all-closed', event => { if (stopping) event?.preventDefault?.(); });
app.on('before-quit', event => { if (stopping) event.preventDefault(); });
const diagnosticCommands = new Set(['status', 'click', 'open-multiplayer', 'host-sector', 'join-sector', 'type', 'capacity', 'key', 'focus', 'blur', 'resize', 'layout', 'screenshot',
  'resources', 'resource-counts', 'transport-death', 'delay-next-transport', 'shutdown', 'close-window', 'delay-exit-commit', 'hold-upload', 'hold-restore', 'release-restore', 'block-next-grant', 'suspend-hook']);
process.on('message', message => { if (ignoreDriver) return; void command(message).then(result => { if (message.command !== 'shutdown') process.send?.({ id: message.requestId, result }); })
  .catch(error => process.send?.({ id: Number.isSafeInteger(message?.requestId) ? message.requestId : 0, error: 'app-driver-command-failed',
    command: diagnosticCommands.has(message?.command) ? message.command : 'unknown', reason: ['native-click-not-delivered', 'native-click-wrong-control'].includes(error?.message) ? error.message : 'command-failed' })); });
require(role === 'incompatible' ? join(directory, 'incompatible-build/main/index.js') : '../../out/main/index.js');
```

Add to `scripts/network/rtc-smoke-native.cjs`'s `window.rtcNative` object: `closeAll() { for (const record of pcs) record.pc.close(); return true; },`.

**The recovery Worker prelude.** `scripts/network/online-recovery-utility.ts` becomes the Worker prelude source. Replace its `export function observeUtility(parent: any, path: string) { … }` with a top-level installer of the same body, changed in exactly four ways: (a) a first `self.addEventListener('message', event => { if (event.data?.kind === '__recovery-evidence') { event.stopImmediatePropagation(); report = event.ports[0]; } })`, registered before anything else, keeps the port (the page probe posts it before the owner's `initialize`); (b) where it wrapped `parent.postMessage`, wrap `self.postMessage` (`const send = self.postMessage.bind(self); (self as any).postMessage = (m: any, t?: Transferable[]) => { …observation…; return send(m, t ?? []); };`); (c) where it used `parent.on('message', event => …event.data…)`, use `self.addEventListener('message', event => …event.data…)`; (d) every evidence write (`writeFileSync(path, …)`/`renameSync`) becomes `report?.postMessage(structuredClone(evidence))`. `reconciledMemory` stays exported for main. In `scripts/network/online-observer-build.ts`, build it twice: as `observer/utility.cjs` (cjs, for `reconciledMemory`, as today) and as `observer/recovery-worker.js` (iife, the prelude the wrapper concatenates). `git rm scripts/network/online-recovery-utility.cjs`.

**Drivers: environment and renames.** Every launcher that spawns the wrapper adds `FTLITE_ONLINE_TEST_PROBE: '1'` to the child env (`online-app-smoke.ts:38`, `online-recovery-smoke.ts:60`, `duel-app-smoke.ts:45`, `internet-app-smoke.ts:62`); `online-recovery-smoke.ts:62` passes `--recovery-observe-worker` in place of `--recovery-observe-utility`. Then, in the drivers, by quoted text:
- `mirrorProof.utilities` → `mirrorProof.workers` (`online-app-smoke.ts:106,109`; `online-recovery-smoke.ts:168,169,214,255`).
- `invalidResources.utilities.length===0`, `mismatchResources.utilities.length===0`, `cancelled.utilities.length===0` → `….workers.length===0` (`online-app-smoke.ts:179,194,200`); the cancel assertion also requires `&&cancelled.ports===0`.
- `r.utilities.every((u:any)=>u.exited)` → `r.workers.every((w:any)=>w.exited)` (`online-recovery-smoke.ts:277`).
- `app.forcedUtilityExits=app.beforeExit.utilities.map((u:any)=>{…})` → `app.forcedRendererExits=[app.beforeExit.rendererPid].map((pid:number)=>{let alive=false;try{process.kill(pid,0);alive=true;}catch{} return {pid,exited:!alive};})`, and the next line's `forcedUtilityExits` → `forcedRendererExits` (`online-recovery-smoke.ts:103-104`, and the `processes.map` destructuring at `:306`).
- The cleanup key lists (`online-app-smoke.ts:231`, `online-recovery-smoke.ts:307`): `['workers','workerExits','windows','ports','listeners','peers','nativePeersObserved','nativePeerCloses','nativePeersEndedWithPage','observedPagePorts']` (summing as today); `workerIds` stays per process.
- `internet-app-smoke.ts` reads `shutdown` results unchanged by spreading them into its cleanup records; its zod schema is the report's (Step 3).

- [ ] **Step 3: Reports, manifests and their tests**

`scripts/network/online-app-report.ts`: `ONLINE_APP_ARTIFACTS` becomes:

```ts
export const ONLINE_APP_ARTIFACTS = ['out/main/index.js','out/preload/index.js','out/renderer/index.html','out/renderer/assets/authorityWorker.js',
  'scripts/network/online-app-smoke.ts','scripts/network/online-app-smoke.cjs','scripts/network/online-app-click.cjs','scripts/network/online-app-observer.ts','scripts/network/page-probe.ts','scripts/network/online-app-runtime.ts','scripts/network/online-app-runtime-worker.ts',
  'src/main/index.ts','src/main/appExit.ts','src/network/online/onlineSession.ts','src/network/online/onlineMirrors.ts','src/network/online/mirrorStore.ts','src/network/online/pagePlatform.ts','src/network/online/onlineSector.ts',
  'src/network/host/workerHost.ts','src/renderer/src/app/online/pageSession.ts','src/shared/onlineSession.ts','src/network/session/serviceClient.ts','src/network/utilityHost.ts','src/network/modes/sector.ts'];
```

and its cleanup checks become:

```ts
  const c = r.cleanup;
  if (!c || !positive(c.workers) || c.workers !== c.workerExits || ['windows', 'ports', 'listeners', 'peers'].some(k => c[k] !== 0)) fail();
  if (!positive(c.nativePeersObserved) || c.nativePeerCloses + c.nativePeersEndedWithPage !== c.nativePeersObserved || !positive(c.observedPagePorts)) fail();
```

`scripts/network/online-recovery-report.ts`: in `ONLINE_RECOVERY_ARTIFACTS` replace `'scripts/network/online-recovery-utility.cjs'` with `'scripts/network/page-probe.ts'` and `'src/main/network/onlineExit.ts'` with `'src/main/appExit.ts'`; line 84's `'out/main/authorityHost.js'` becomes `'out/renderer/assets/authorityWorker.js'`; apply the field renames (`utilitiesCreated` → `workersCreated`, `utilityPids` → `workerIds`, `resourcesBeforeForcedExit.utilities` → `.workers`, `forcedUtilityExits` → `forcedRendererExits`).

`scripts/network/internet-app-report.ts:6`:

```ts
export const INTERNET_ARTIFACTS = ['out/main/index.js','out/preload/index.js','out/renderer/index.html','out/renderer/assets/authorityWorker.js'];
```

and its `cleanup` schema (line 17) and `checkCleanup` (lines 44-47) take the shared renames, since the wrapper's `shutdown` result now carries exactly these keys:

```ts
const cleanup=z.object({pid:pos,exited:z.literal(true),exitCode:z.literal(0),workers:nat,workerExits:nat,workerIds:z.array(nat).max(8),windows:z.literal(0),ports:z.literal(0),listeners:z.literal(0),peers:z.literal(0),nativePeersObserved:pos,nativePeerCloses:nat,nativePeersEndedWithPage:nat,observedPagePorts:pos,shutdownComplete:z.literal(true).optional(),shutdownElapsedMs:z.number().finite().nonnegative().max(5000).optional(),exitCommitDelayMs:z.number().finite().nonnegative().max(5000).optional(),exitCommitAcknowledged:z.literal(true).optional()}).strict();
```

```ts
function checkCleanup(c:z.infer<typeof cleanup>) {
  if(c.workers!==c.workerExits || c.workerIds.length!==c.workers || new Set(c.workerIds).size!==c.workers
    || c.nativePeersObserved!==c.nativePeerCloses+c.nativePeersEndedWithPage)fail();
}
```

In `tests/internetAppReport.test.ts`, the fixtures at lines 13-14 become

```ts
  cleanup:{pid:100+seat,exited:true,exitCode:0,workers:seat?0:1,workerExits:seat?0:1,workerIds:seat?[]:[0],windows:0,ports:0,listeners:0,peers:0,nativePeersObserved:1,nativePeerCloses:1,nativePeersEndedWithPage:0,observedPagePorts:4}});
const duelCleanup = (pid:number,host:boolean) => ({pid,exited:true,exitCode:0,workers:host?1:0,workerExits:host?1:0,workerIds:host?[0]:[],windows:0,ports:0,listeners:0,peers:0,nativePeersObserved:1,nativePeerCloses:1,nativePeersEndedWithPage:0,observedPagePorts:3});
```

and the cases at lines 39 and 55 set `…cleanup.workerExits=0` (in place of `utilityExits`).

Tests: in `tests/onlineAppReport.test.ts` the fixture's cleanup becomes `{ workers: 1, workerExits: 1, windows: 0, ports: 0, listeners: 0, peers: 0, nativePeersObserved: 2, nativePeerCloses: 1, nativePeersEndedWithPage: 1, observedPagePorts: 8 }`; `tests/onlineRecoveryReport.test.ts`'s `cleanup(pid)` helper and fixtures take the same renames (`workerIds: [pid]`) and its `utilitiesCreated` and `forcedUtilityExits` cases follow; `tests/internetAppReport.test.ts:80` iterates `['out/renderer/assets/authorityWorker.js','out/preload/index.js',rendererArtifact]` and `:91` uses `'out/renderer/assets/authorityWorker.js'` in place of `'out/main/hostProcess.js'`.

`tests/onlineRecoveryInstrumentation.test.ts`: read `'out/renderer/assets/authorityWorker.js'` (line 7). The Worker bundle is one ES module, so the sliced lease-gate source calls its validators as plain functions rather than through a `hostProcessProtocol` chunk namespace; give the context both forms:

```ts
  const validators = { validateSessionLeaseIdentity: () => true, isRoomId: () => true, validateLeaseRenewalRequest: () => true, validateLeaseGrant: () => true };
  const create = runInNewContext(gateSource + '\ncreateLeaseGate', { hostProcessProtocol: validators, ...validators, __recoveryLease: (event: any) => events.push(event) });
```

and add `it('instruments the built Worker chunk at exactly one site per needle', () => { expect(() => instrument(source)).not.toThrow(); });`. If a needle is missing because the renderer pipeline emits different text than the old main build, update that needle in `online-recovery-instrument.cjs` to the Worker chunk's text (the transform stays observation-only) and record it in the commit message.

- [ ] **Step 4: The minimized-host and close gates (spec §8, new)**

Add to `scripts/network/duel-app-smoke.ts`, after both seats are `running`:

```ts
    // Web-i (spec §8): an Electron host minimized for 60 s keeps ticking at 60 Hz and keeps its lease (backgroundThrottling: false).
    step = 'minimized host';
    const tickOf = (s: any) => s.observations.at(-1)?.publications.at(-1)?.tick ?? -1;
    const beforeHost = await h.request('status'), beforeAt = performance.now();
    await h.request('blur');   // minimizes the host window
    await delay(30000); const midway = await h.request('resources'); await delay(30000);
    const afterHost = await h.request('status'), afterGuest = await g.request('status'), elapsed = (performance.now() - beforeAt) / 1000;
    await h.request('focus');
    const rate = (tickOf(afterHost) - tickOf(beforeHost)) / elapsed;
    assert(midway.minimized === true, 'host was not minimized');
    assert(rate >= 59, `minimized host ticked at ${rate.toFixed(2)} Hz`);
    assert(afterHost.recovery.invalidations.length === 0 && ['running', 'syncing', 'paused'].includes(afterHost.status.phase), 'minimized host lost its lease');
    assert(tickOf(afterGuest) > tickOf(beforeHost), 'guest stopped receiving the minimized host');
    evidence.minimizedHost = { seconds: elapsed, ticksPerSecond: rate, minimized: true, leaseKept: true };
```

(`invalidations` is the concatenation of the probe's per-Worker `invalidations`; `delay` and `evidence` are the launcher's own helpers; if its local names differ, use them.) Then, as the last scenario before cleanup:

```ts
    // Web-i (spec §8): closing the host window mid-match runs app:prepare-exit and leaves a fresh checkpoint at the service within 3 s.
    step = 'close gate';
    const lastPeriodic = (await h.request('status')).status.mirror.committed?.capturedTick ?? -1;
    const closed = await h.request('close-window');
    const fresh = closed.puts.find((p: any) => p.status === 204 && p.elapsedMs <= 3000 && p.metadata?.capturedTick > lastPeriodic);
    assert(closed.exitAnsweredAt !== null && closed.closed, 'close handshake did not complete');
    assert(!!fresh, `no fresh checkpoint within 3 s of close: ${JSON.stringify(closed.puts)}`);
    evidence.closeGate = { exitAnsweredMs: closed.exitAnsweredAt - closed.closeAt, putElapsedMs: fresh.elapsedMs, capturedTick: fresh.metadata.capturedTick, lastPeriodic };
```

(the host process then exits through the wrapper's own `window-all-closed`; the launcher's cleanup treats a host that exited after `close-window` as shut down). Add `minimizedHost` and `closeGate` to the duel report's required evidence so a missing scenario fails the gate.

- [ ] **Step 5: Run the app gates and their tests**

```bash
npm run build
npx vitest run tests/onlineRecoveryInstrumentation.test.ts tests/onlineAppReport.test.ts tests/onlineRecoveryReport.test.ts tests/internetAppReport.test.ts tests/internetAppSmoke.test.ts tests/onlineAppRuntime.test.ts tests/onlineRecoveryPreparation.test.ts
npm run test:online-app-runtime
npm run test:online-recovery-runtime
npm run test:duel-app-runtime
npx tsx scripts/network/online-app-smoke.ts --inject-transport-failure; echo "exit=$?"
```

Expected: the unit suites PASS; each runtime gate prints its PASS line (the duel gate's report includes `minimizedHost` with `ticksPerSecond >= 59` and `closeGate` with `putElapsedMs <= 3000`); the injected run prints a failure and `exit=1`. `test:internet-app-runtime` needs the live service and stays a Web-iii run; its manifests and unit tests are updated here.

- [ ] **Step 6: Commit**

```bash
git rm scripts/network/online-recovery-utility.cjs
git add scripts/network/page-probe.ts scripts/network/online-app-smoke.cjs scripts/network/online-observer-build.ts scripts/network/online-app-observer.ts \
  scripts/network/duel-app-observer.ts scripts/network/online-recovery-utility.ts scripts/network/rtc-smoke-native.cjs scripts/network/online-app-smoke.ts \
  scripts/network/online-recovery-smoke.ts scripts/network/duel-app-smoke.ts scripts/network/internet-app-smoke.ts scripts/network/online-app-report.ts \
  scripts/network/online-recovery-report.ts scripts/network/internet-app-report.ts scripts/network/online-recovery-instrument.cjs \
  tests/onlineRecoveryInstrumentation.test.ts tests/onlineAppReport.test.ts tests/onlineRecoveryReport.test.ts tests/internetAppReport.test.ts
git commit -m "test(web-i): whole-app gates on the page session; minimized-host and close gates; manifests hash the Worker chunk

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12 (conditional: run only if the Task 1 ledger says path B): keep the hosting tab visible, and an event-driven lease path (spec §3.5 "Fail")

Skip this task, and write "Task 12 skipped: path A" in the ledger, when both browsers passed.

**Files:**
- Create: `src/renderer/src/app/online/hostVisibility.ts`, `tests/hostVisibility.test.ts`, `tests/leaseRelayEvents.test.ts`, `tests/helpers/onlineHarness.ts` (the coordinator harness, moved)
- Modify: `tests/onlineCoordinator.test.ts` (imports the moved harness)
- Modify: `src/renderer/src/main.ts` (start the watcher in a browser page only)

**Interfaces:**
- Consumes: the bridge's `onStatus` (Task 7).
- Produces: `KEEP_VISIBLE_TEXT = 'Keep this tab visible: the match runs on your computer'`; `watchHostVisibility(deps: { document: Pick<Document, 'visibilityState' | 'title' | 'addEventListener' | 'removeEventListener'>; onStatus(cb: (status: OnlineStatus) => void): () => void }): () => void`.

- [ ] **Step 1: Write the failing tests**

`tests/hostVisibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KEEP_VISIBLE_TEXT, watchHostVisibility } from '../src/renderer/src/app/online/hostVisibility';

function page() {
  const target = new EventTarget() as EventTarget & { visibilityState: string; title: string };
  target.visibilityState = 'visible'; target.title = 'FTLite';
  let push = (_status: any) => {};
  const stop = watchHostVisibility({ document: target as never, onStatus: cb => { push = cb; return () => {}; } });
  const hide = (hidden: boolean) => { target.visibilityState = hidden ? 'hidden' : 'visible'; target.dispatchEvent(new Event('visibilitychange')); };
  return { target, hide, push: (role: string | null, phase: string) => push({ role, phase }), stop };
}
describe('the keep-visible warning (web build spec §3.5, fail path)', () => {
  it('shows in the tab title while a hosting tab is hidden during a lobby or match, and restores the title', () => {
    const p = page(); p.push('host', 'running'); p.hide(true); expect(p.target.title).toBe(KEEP_VISIBLE_TEXT);
    p.hide(false); expect(p.target.title).toBe('FTLite');
  });
  it('never shows for a guest or an idle host', () => {
    const p = page(); p.push('guest', 'running'); p.hide(true); expect(p.target.title).toBe('FTLite');
    p.push('host', 'idle'); expect(p.target.title).toBe('FTLite');
  });
  it('clears when hosting ends while hidden, and on stop', () => {
    const p = page(); p.push('host', 'lobby'); p.hide(true); p.push(null, 'idle'); expect(p.target.title).toBe('FTLite');
    p.push('host', 'running'); expect(p.target.title).toBe(KEEP_VISIBLE_TEXT); p.stop(); expect(p.target.title).toBe('FTLite');
  });
});
```

`tests/helpers/onlineHarness.ts` (moved, not rewritten): cut `function deferred<T>()` and `function harness(…)` (lines 6-48 of `tests/onlineCoordinator.test.ts`) into this new file with their imports (`vi` from `vitest`, `createOnlineSession`, `initialOnlineCheckpoint` from `./onlineCheckpoint`, `sectorCompatibility`, `type RoomServiceEvent`), export both, and give `harness` one more trailing parameter:

```ts
export function harness(capacity = 1, ownSeat = 0, monotonicOrigin = 0, serviceOrigin = 'http://127.0.0.1:8787',
  scheduler: { setTimeout(cb: () => void, ms: number): unknown; clearTimeout(id: unknown): void } = { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: id => clearTimeout(id as never) }) {
```

used in place of the inline `scheduler: { setTimeout: (cb, ms) => setTimeout(cb, ms), clearTimeout: id => clearTimeout(id as any) }` in its `createOnlineSession` call. `tests/onlineCoordinator.test.ts` then imports `{ deferred, harness }` from `./helpers/onlineHarness` and is otherwise unchanged.

`tests/leaseRelayEvents.test.ts` (proves no timer callback sits on the lease relay: with a session scheduler whose timers never fire, every Worker renewal request still reaches the service and its grant reaches the Worker):

```ts
import { describe, expect, it, vi } from 'vitest';
import { harness } from './helpers/onlineHarness';

describe('the lease relay is event-driven (web build spec §3.5, fail path)', () => {
  it('relays each renewal request to the service and the grant back to the host with no session timer callback', async () => {
    const scheduled: number[] = [];
    const frozen = { setTimeout: (_cb: () => void, ms: number) => { scheduled.push(ms); return scheduled.length; }, clearTimeout: () => {} };
    const h = harness(1, 0, 0, 'http://127.0.0.1:8787', frozen);
    await h.owner.dispatch({ type: 'host', mode: 'sector', capacity: 1 }); await h.owner.dispatch({ type: 'ready', ready: true });
    expect(await h.owner.dispatch({ type: 'start' })).toEqual({ ok: true });
    for (const nonce of ['1', '2', '3'].map(digit => digit.repeat(32))) {
      h.renewal(nonce);
      await vi.waitFor(() => expect(h.host.applyLease).toHaveBeenCalledWith(expect.objectContaining({ nonce }), expect.objectContaining({ nonce })));
    }
    expect(h.service.request.mock.calls.filter((call: any) => call[0].type === 'lease-renew').length).toBeGreaterThanOrEqual(4);   // the start's grant plus three
    await h.owner.dispose();
  });
});
```

(`vi.waitFor` polls on real timers; only the session's injected scheduler is frozen. The harness host's own 5 s renewal interval uses real timers too and only adds renewals.)

Run: `npx vitest run tests/hostVisibility.test.ts tests/leaseRelayEvents.test.ts tests/onlineCoordinator.test.ts`
Expected: `hostVisibility` FAILS (module missing). `leaseRelayEvents` should already PASS: today's relay path (`onlineSession.ts` `bridgeLease` → `serviceClient.request`, which sends synchronously and resolves on the socket's `message` event → `workerHost.applyLease` → `worker.postMessage`) has no timer on it. If it FAILS, find the timer it waits on (`grep -n "setTimeout\|schedule(" src/network/online/onlineSession.ts src/network/session/serviceClient.ts src/network/host/workerHost.ts`) and move that step onto the socket `message` or `MessagePort` `message` callback that already precedes it, without changing any timeout that only bounds failure.

- [ ] **Step 2: Write the watcher and start it in a browser page**

`src/renderer/src/app/online/hostVisibility.ts`:

```ts
// The fail path of the background-tab measurement (web build spec §3.5): a hidden hosting tab may be throttled, so while
// this tab hosts a lobby or a match and is hidden, its title (what the player sees on the tab strip) says so.
import type { OnlineStatus } from '../../../../shared/onlineSession';

export const KEEP_VISIBLE_TEXT = 'Keep this tab visible: the match runs on your computer';
const HOSTING: readonly OnlineStatus['phase'][] = ['lobby', 'connecting', 'syncing', 'running', 'paused', 'saving'];
export function watchHostVisibility(deps: { document: Pick<Document, 'visibilityState' | 'title' | 'addEventListener' | 'removeEventListener'>;
  onStatus(cb: (status: Pick<OnlineStatus, 'role' | 'phase'>) => void): () => void }): () => void {
  const doc = deps.document;
  let hosting = false, shown = false, saved = doc.title;
  const apply = () => {
    const show = hosting && doc.visibilityState === 'hidden';
    if (show && !shown) { saved = doc.title; doc.title = KEEP_VISIBLE_TEXT; shown = true; }
    else if (!show && shown) { doc.title = saved; shown = false; }
  };
  const off = deps.onStatus(status => { hosting = status.role === 'host' && HOSTING.includes(status.phase); apply(); });
  doc.addEventListener('visibilitychange', apply);
  return () => { off(); doc.removeEventListener('visibilitychange', apply); hosting = false; apply(); };
}
```

Check the phase names against `OnlinePhase` in `src/shared/onlineSession.ts` and keep only those that exist. In `src/renderer/src/main.ts`, after the bridge is created, add `const offVisibility = bridge && !window.ftlite ? watchHostVisibility({ document, onStatus: cb => bridge.onStatus(cb) }) : undefined;` (Electron sets `backgroundThrottling: false`, so the warning is browser-only) and call `offVisibility?.()` in the `beforeunload` cleanup. In Web-i nothing creates a browser page session yet; Web-ii's browser gates exercise it.

Run: `npx vitest run tests/hostVisibility.test.ts tests/leaseRelayEvents.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/app/online/hostVisibility.ts src/renderer/src/main.ts tests/hostVisibility.test.ts tests/leaseRelayEvents.test.ts tests/helpers/onlineHarness.ts tests/onlineCoordinator.test.ts docs/superpowers/plans/2026-11-18-web-i-online-in-page.md
git commit -m "feat(web-i): keep-the-tab-visible warning for a hidden hosting tab; lease relay proven timer-free (spec §3.5 fail path)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The Web-i gate (spec §9: everything in §8 except the browser, passcode and live checks)

**Files:**
- Modify: this plan (ledger: gate results), `docs/roadmap.md` if it tracks Web-i (status line only)

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck
npm test
npm run test:determinism; git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability/task-5-logs/
npm run test:signalling
npm run typecheck:signalling
npm run test:worker-boot
npm run test:host-runtime
npx tsx scripts/network/lease-smoke.ts
npx tsx scripts/network/rtc-config-smoke.ts
npm run test:rtc-runtime
npm run test:room-service-runtime
npm run test:online-app-runtime
npm run test:online-recovery-runtime
npm run test:duel-app-runtime
```

Expected: all PASS. `npm test` may show the known load flakes; rerun each alone and record that it passed alone. `test:determinism` must report the same samples as before Web-i (no simulation change); `git status` must show no tracked file changed after the restore.

- [ ] **Step 2: Check the invariants by hand**

```bash
git diff master -- src/renderer/src/sim/tuning.ts | grep -c SIM_VERSION    # expect 0
ls out/main out/preload                                                     # expect only index.js in each
grep -rn "from 'node:\|from 'electron'" src/network/online src/network/host src/network/transport src/worker src/renderer/src/app/online   # expect nothing
```

- [ ] **Step 3: Record and commit**

Add a "Web-i gate" line under the ledger with the date, the commit and each gate's result (and which flakes were rerun alone). If `docs/roadmap.md` has a Web build entry, set Web-i to "merged pending review" in one line.

```bash
git add docs/superpowers/plans/2026-11-18-web-i-online-in-page.md
git commit -m "docs(web-i): gate results recorded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add `docs/roadmap.md` to the `git add` only if it was edited.)

---

## Self-review

**Spec coverage (Web-i, §9 item 1):**

| Spec item | Task |
|---|---|
| §3.5 background-tab test, validity and pass rules, recorded in the plan, fail path | 1 (measurement, ledger), 12 (conditional fail path) |
| §3.1 clock/scheduler, random bytes, nonces | 3 (`randomHex`, existing `clock`/`scheduler` deps), 6 (page wiring) |
| §3.1 synchronous SHA-256 verified against `node:crypto` vectors and fuzz | 2 |
| §3.1 base64 | 2, 3 |
| §3.1 `OnlineRecordStore` (IndexedDB `ftlite`/`records`, `seat-v1`/`mirror-v1`), caps, validators, `FTLNMIR1`, payload check; file seams removed | 2 (new stores), 7 (old deleted) |
| §3.1 suspend/resume: never `visibilitychange`; clock-jump detector; bfcache; Electron push | 6 (`lifecycle.ts`), 7 (main push, preload) |
| §3.1 exit: browser `pagehide` release without capture; Electron full exit save | 3 (`releaseForUnload`), 6 (pagehide), 7 (`appExit`) |
| §3.1 host start through `new Worker` | 5 |
| §3.2 `src/worker/authorityWorker.ts`, web port endpoint, no `process.exit`, digest define | 4 (`webPortEndpoint`), 5 |
| §3.2 `workerHost.ts` implementing `HostProcessHandle` unchanged; `spawn`/`kill`/`onExit`; two-part readiness; transport-ready from the page | 3 (contract), 4 (`connectTransportPort`), 5 |
| §3.2 existing `hostProcess` and bridge tests ported, not deleted | 5 (`workerHost.test.ts`), 7 (`rtcBridge.test.ts`, `pageTransport.test.ts`) |
| §3.3 seven main jobs incl. `backgroundThrottling: false`, `app:prepare-exit` 3 s, `will-prevent-unload` | 7 |
| §3.3 `createPageOnline`, `OnlinePreloadApi`-shaped facade + `onPort`, `PageOnlineConfig`, frozen `window.ftlite.onlineConfig` | 3 (config), 6 (factory), 7 (preload, main.ts) |
| §3.3 deletions | 7 |
| §4 direction-neutral incompatible text | 3 |
| §6 Expose-Headers incl. `Origin: null`; socket-origin 403 test; not deployed | 8 |
| §8 Electron gates, every row of the fate table; manifests | 9 (`test:host-runtime`, `lease-smoke`), 10 (`test:rtc-runtime`, `rtc-config-smoke`, `test:room-service-runtime`), 11 (`test:online-app-runtime`, `test:online-recovery-runtime`, `test:duel-app-runtime`, `test:internet-app-runtime` manifests); `test:determinism` unchanged (13) |
| §8 minimized host, Electron close | 11 Step 4 |
| §8 portable code tests (SHA-256, IndexedDB stores with fake-indexeddb, web port over a real `MessageChannel`, `createUtilityHost` behind the port interface) | 2, 4, 5 (`authorityWorker.test.ts`) |
| Determinism and `SIM_VERSION` unchanged | Global Constraints; 13 |

Out of scope by design (Web-ii/Web-iii): `build:web`, Vercel, passcode, `version.json`, all of §7, browser gates, live check, deploys.

**Placeholder scan:** every harness the gates run is given in full: `host-smoke.cjs`, `lease-smoke.cjs`, `rtc-config-smoke.cjs`, `rtc-smoke.cjs`, `room-service-smoke.cjs` and `online-app-smoke.cjs` are complete replacement files, and their page sides (`host-smoke-page.ts` owner role, `lease-smoke-page.ts`, `lease-smoke-observer.ts`, `rtc-page.ts`, `page-probe.ts`) are complete code. Remaining edits to existing files (launchers, report validators, fixtures, drivers) are quoted old-to-new replacements of named lines. The early-failure helpers act inside the spawn task (`abort-after-spawn`, `crash-on-spawn`); `rtcPage.dispose` awaits an in-flight start; the stale-generation interception is armed on the generation-2 host; main accumulates `onlineProbe.take()` per Worker index in `absorb()`.

**Type consistency:** `PageOnlineConfig` (7 fields) is the same in Tasks 3, 6, 7; `OnlineLifecycle` (`onSuspend`, `onResume`, `dispose`) in Tasks 5 (structural `lifecycle` option), 6, 7; `HostPlatform.createTransport` returns `Pick<PageTransport, 'controller' | 'connect' | 'onExit' | 'dispose'>` in Task 5 and is produced by `createPageTransport` (Task 4); `OnlineSessionOwner.releaseForUnload` (Task 3) is called by `createPageOnline` (Task 6); `createOnlineBridge(api: PageOnlineApi)` (Task 7) receives `PageOnline` (Task 6), a structural superset; exit reasons `worker-exit`/`transport-exit` match between Tasks 5, 9 and 10.
