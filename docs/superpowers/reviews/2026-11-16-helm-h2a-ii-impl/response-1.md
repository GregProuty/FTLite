# Round 1 response (implementation revised, 7d7fd1d)

Reviewed `round-1.json`. 4 accepted, 0 rejected, 1 deferred. The prepared diff is regenerated for 409a1e3..HEAD. Full suite 251 files, 3520 tests pass.

## R1-F1 [P1]: The ten-seed watchdog check reads only about half of each round's journal

Confirmed against `core.ts` (frames emptied at each tick % 300 boundary). The loop now reads the watchdog frames when the authority's tick is `% 300 === 299`, the last tick of each window, plus the final window after the loop, and asserts the number of windows read equals the full windows elapsed. All ten seeds still journal zero watchdog frames.

## R1-F2 [P2]: The ten-seed proof never asserts that each seat produced input

Confirmed. Each seat's `heldHighWater` must be above 0 and a command must be applied. A per-seat applied command was tried and is false on four seeds: the Helm can fly a whole round on held input alone, so it is not required.

## R1-F3 [P3]: A presence still pending when another player pauses re-pauses with peer-lost after the resume

Confirmed. The steward clears `lost` whenever its publication is paused, before the pending early return. A new test (presence in flight, pause, resume, applied) expects no pause and fails without the change.

## R1-F4 [P3]: validateDuelPublication's doc promises a tick check it does not make

Confirmed. It now checks the tick and the hash against the snapshot, as `checkedPublication` does (this also settles the task review's minor about the remote path), and the doc says so.

## R1-F5 [P3]: A replica replacement validates the publication twice

Deferred: a cost only, on the first publication and on a new round; every in-place restore validates once.

## Also changed

- (nothing)

## Files changed

- src/network/modes/duelProducers.ts
- src/renderer/src/clientControl/duelClient.ts
- tests/duelOnline.test.ts
- tests/duelProducers.test.ts

<!-- end -->
