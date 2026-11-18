# Round 1 response (branch revised)

Reviewed `round-1.json` against the branch at `9ac84441`. 1 accepted, 0 rejected, 0 deferred.

## R1-F1 [P2]: The real-app duel smoke still expects a two-seat room, and the menu now defaults to a crew of 3

Confirmed: scripts/network/duel-app-smoke.ts:105-107 created a room at the default crew and asserted capacity 2; duel-app-observer.ts:13 decoded at limit 2; internet-app-smoke.ts:109 and :148 hosted at the default. Fixed: both smokes click `crew-2` before `create-room` (they stay the two-seat runs they were), and the observer decodes at `DUEL_CREW_MAX`. `npm run test:duel-app-runtime` now passes (ACTUAL TWO-PROCESS DUEL APPLICATION PASS, 104 s); tsc -b and the full suite (361 files) pass.

## Also changed

- (nothing)

## Files changed

- scripts/network/duel-app-smoke.ts
- scripts/network/duel-app-observer.ts
- scripts/network/internet-app-smoke.ts

<!-- end -->
