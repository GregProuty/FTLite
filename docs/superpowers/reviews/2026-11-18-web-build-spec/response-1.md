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
