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
