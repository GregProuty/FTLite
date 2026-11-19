# Round 1 response (code revised to 8b7a9cde)

I checked `round-1.json` against `master...HEAD` at `14cd1b03`. The verdict was "ready with P2s". All four findings are accepted and fixed in `8b7a9cde`. None were rejected or deferred.

Verification:
- typecheck: clean.
- `npm test`: 431/431 files, 5457 tests.
- `test:web-net`: passed. One load flake in the chromium-electron pairing passed when rerun alone.
- `test:web-live-local`: passed.

## R1-F1 [P2]: Two older Web-ii lines in gates.md contradict the Web-iii owner steps

Confirmed at `gates.md:935` and `:943`.
- `:935` now says to set `ALLOWED_ORIGINS` at Web-iii step 3, before the first deploy.
- `:943` now gives the take-down rule: delete the first deploy, and roll back later ones.
- Step 0 now describes the non-forcing local check.
- No other line contradicts the Web-iii steps.

## R1-F2 [P2]: The local pre-flight never runs the relay hook or the getStats read in a real browser

Confirmed. The changes:
- `relayInitScript({ force })` replaces the fixed script.
- Local mode installs the hook with `force: false` and checks that it loaded.
- The new `localPairVerdict` passes only when all three hold:
  - at least 2 samples with a connected peer;
  - a non-null local candidate type on each of those samples;
  - at least 1 KiB received from the first sample to the last.
- `LiveDuelReport` records `candidates`.
- Live mode still requires `relay`.

The local smoke now runs the hook and the real-browser `getStats` read in both browsers. The selected pairs were `host/host`, and traffic grew from 6 KB to 662 KB on the host and from 58 KB to 836 KB on the guest. Firefox does report `bytesReceived` on its selected pair.

## R1-F3 [P3]: playStep can accept an early end whose two sides read ended more than 5 s apart

Confirmed at `relay.ts:81-84`. The both-ended branch now fails when the two sides read `ended` more than 5 s apart. Tests cover `endedAtMs: 30000` at 36000 (fails) and at 35000 (passes).

## R1-F4 [P3]: checkServiceOrigin cuts its error text without redacting it first

Confirmed at `headers.ts:158`. `checkServiceOrigin` now takes `secrets` and uses `clip`, which redacts before it cuts. The entry passes the secrets in, and a redaction test covers this.

## Also changed

- (nothing)

## Files changed

- docs/gates.md
- scripts/web/live-smoke.ts
- scripts/web/live/duel.ts
- scripts/web/live/headers.ts
- scripts/web/live/local-smoke.ts
- scripts/web/live/relay.ts
- tests/webLiveHeaders.test.ts
- tests/webLiveRelay.test.ts
- tests/webLiveReport.test.ts

<!-- end -->
