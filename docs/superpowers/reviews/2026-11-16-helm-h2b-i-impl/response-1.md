# Round 1 response (implementation revised, 2bc18e3)

Reviewed `round-1.json`. 6 accepted, 0 rejected, 1 deferred. The prepared diff is regenerated for cf3eb60..HEAD. Full suite 265 files, 3867 tests pass; the duel smoke passes (45834 ms) and the report runs clean on its records. Each new test was checked to fail with its fix reverted.

## R1-F1 [P2]: The session owner's linkStats has no test

Confirmed. A `tests/onlineCoordinator.test.ts` case drives the owner: a fresh figure for a ready attempt is returned, null after 5001 ms, null for an attempt not ready, and a replaced transport's stats are ignored (reached through `host-changed`; the harness's `issue()` gained an optional `hostGeneration`, default 1).

## R1-F2 [P2]: The duel smoke recursively deletes <report dir>/records

Confirmed. The delete is refused (the run fails) unless the report directory is inside `out/`, mirroring the temp-root guard.

## R1-F3 [P3]: A stale route/RTT in the peer defeats main's 5 s freshness check

Confirmed. `sampleStats` resets `route`/`rtt` to null each sample and assigns them only with a selected pair (the catch path leaves them null). rtcPeer test.

## R1-F4 [P3]: The F3 overlay keeps showing the last RTT

Confirmed. A null answer clears `rttMs` (the label persists per Decision 4); `frame()`'s early returns hide the overlay. Session test.

## R1-F5 [P3]: A replayed round-0 seed merges two rooms' rounds and silently drops records

Confirmed. Records dropped as duplicates are counted and printed in the header line. Report test.

## R1-F6 [P3]: Single player's record wiring is untested

Confirmed. The counter moved to `src/renderer/src/app/duel/soloRecorder.ts` without behaviour change and is unit-tested (two pauses then a decision gives 2; the next round starts at 0).

## R1-F7 [P3]: The F3 overlay overlaps the map's grid labels

Deferred: cosmetic; Decision 5 moves the overlay to React (UI-ii), where it is placed clear of the labels.

## Also changed

- (nothing)

## Files changed

- scripts/duel-playtest-model.ts
- scripts/network/duel-app-smoke.ts
- src/network/rtc/peer.ts
- src/renderer/src/app/duel/duelMode.ts
- src/renderer/src/app/duel/onlineDuel.ts
- src/renderer/src/app/duel/soloRecorder.ts
- tests/duelPlaytestReport.test.ts
- tests/duelRuntime.test.ts
- tests/onlineCoordinator.test.ts
- tests/onlineDuelSession.test.ts
- tests/rtcPeer.test.ts

<!-- end -->
