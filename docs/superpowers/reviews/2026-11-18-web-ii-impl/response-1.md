# Round 1 response (code revised to 16907f10)

I checked `round-1.json` against `master...HEAD` at `67d6534d`. The verdict was "ready with P2s". All five findings are accepted and fixed: the code fixes in `4732902d` and the re-run gate ledger in `16907f10`. None were rejected or deferred. The prepared diff file `.superpowers/sdd/web-ii-impl.diff` is regenerated at the new head.

## R1-F1 [P2]: The Web-ii gate was recorded before the master merge and was not re-run at the subject head

Confirmed. The ledger cited head `b532961f` and SIM 53.

I re-ran the full gate at `4732902d`, which includes the master merge at SIM 54. All of these pass:
- typecheck
- build
- `npm test`: only load flakes failed, and each passes when run alone
- determinism on all three runtimes, at SIM 54
- signalling
- `test:web-output`
- `test:web-net`, with the origin-refused injection failing for its named reason
- all seven Electron runtime gates

The plan ledger and `docs/gates.md` now record that head.

## R1-F2 [P2]: Uncaught errors from the Electron guest are found only by parsing a debug-only log line, with no check that the parser ever matched

Confirmed at `players.ts:170-177` and `online-app-smoke.cjs:5`. Two changes:
- `createElectronPlayer` now requires at least one parsed `DBG loaded` line. Without one, it fails with "electron console not watched".
- The comment in `online-app-smoke.cjs` now states that the web-net gate sets `FTL_DEBUG` and treats the `DBG` lines as a contract.

## R1-F3 [P3]: The transport regression test covers only closeAttempt, not the peer-loss path the fix was for

Confirmed. `rtcTransportOwner.test.ts` now covers four more cases:
- a `closed` reply to a ready attempt sends exactly one close frame with the right reason;
- a `failed` reply does the same;
- an `rtc-replaced` second attempt sends exactly one close frame on the old port;
- a re-retire after `closeAttempt` and its reply sends no second frame.

## R1-F4 [P3]: The output check of the bundled middleware asks only about static file paths

Confirmed. `checkWebOutput` now also asks about `/`, `/no-such-file`, `/index.html?x=1` and a HEAD of the Worker. It checks each one without the cookie (it must get the 401 form) and with the cookie (it must pass through).

## R1-F5 [P3]: Nothing in the repo makes a non-prebuilt `vercel` deploy fail

Confirmed. I added a root `vercel.json` whose `buildCommand` fails with "use npm run deploy:web", plus `tests/vercelGuard.test.ts` and a line in the `gates.md` owner steps.

I read the pinned CLI 65.10.0 (read-only):
- `--prebuilt` uploads only `.vercel/output`, with ignore set to `*` and the output directory re-included.
- No build runs, so the failing `buildCommand` cannot affect `deploy:web`.
- A `.vercelignore` was rejected because it would give a silent empty deploy, not a loud failure.

Whether Vercel's server ignores `buildCommand` on a prebuilt deploy cannot be checked without deploying. That check is added to Web-iii's first-deploy checks.

## Also changed

- (nothing)

## Files changed

- scripts/network/online-app-smoke.cjs
- scripts/web/net/players.ts
- tests/rtcTransportOwner.test.ts
- scripts/web/web-output.ts
- vercel.json
- tests/vercelGuard.test.ts
- docs/gates.md
- docs/superpowers/plans/2026-11-18-web-ii-web-build.md

<!-- end -->
