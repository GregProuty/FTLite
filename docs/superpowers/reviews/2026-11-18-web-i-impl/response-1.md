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
