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
