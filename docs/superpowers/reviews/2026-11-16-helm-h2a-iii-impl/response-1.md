# Round 1 response (implementation revised, 07d7fa4)

Reviewed `round-1.json`. 7 accepted, 0 rejected, 0 deferred. The prepared diff is regenerated for 6aa656f..HEAD. Full suite 254 files, 3560 tests pass; the duel smoke passes (43951 ms).

## R1-F1 [P2]: Reconnect and retry from a saved sector seat skip the sector test-only gate

Confirmed in `onlineSession.ts` (the gate covered host and join only). Reconnect, retry and resume now refuse a sector mode unless `sectorTestEntry`, and the action list does not offer reconnect/retry for a saved sector seat when the gate is off (the 'saved' phase can only hold a sector context entered with the gate on). A gate test stores a sector seat and dispatches reconnect.

## R1-F2 [P2]: A Space release during a pause is lost and is never re-sent

Confirmed. A release is re-sent whenever Space is up and the confirmed replica has shown the charge held for over 250 ms (only the Weapons seat can hold it), as Decision 7 says. Session test.

## R1-F3 [P2]: A link close with no matching status push freezes the view without CONNECTION LOST

Confirmed. A `linkClosed` flag set on close shows the banner at once and prefers the frozen copy; it clears on attach. LEAVING… still shows for saving, idle and ended. Session test.

## R1-F4 [P2]: The record's jitter is not per round, and it includes the reconnect gap

Confirmed. The source's `takeArrivals()` is drained per record and no gap is recorded across an attach; a round with a disconnect keeps its earlier gaps but not the reconnect time. Session test.

## R1-F5 [P2]: The online duel session has no unit tests

Confirmed. `tests/onlineDuelSession.test.ts` (7 tests) drives the session with fakes: presence first after ready on each attach, quantised held every pump, focus loss without a pause, Enter and the leave prompt, the re-sent release, the banner on close, per-round record figures. The `duel:record` sender/frame/arity check is a pure `duelRecordCallAllowed()` in `duelRecords.ts`, called by `index.ts` and tested. Each of the F1-F4 and F7 tests was checked to fail with its fix reverted.

## R1-F6 [P3]: duel:record appends without a rate or file-size bound

Confirmed. `appendDuelRecord` refuses past 16 MiB per day and returns false. Test.

## R1-F7 [P3]: Single player sends live held axes on the end card

Confirmed. `frame()` sends neutral held input while the round is decided, matching online. duelRuntime test.

## Also changed

- (nothing)

## Files changed

- src/main/network/onlineSession.ts
- src/main/network/duelRecords.ts
- src/main/index.ts
- src/renderer/src/app/duel/onlineDuel.ts
- src/renderer/src/app/duel/onlineSource.ts
- src/renderer/src/app/duel/runtime.ts
- tests/onlineDuelSession.test.ts
- tests/onlineDuel.test.ts
- tests/duelRuntime.test.ts

<!-- end -->
