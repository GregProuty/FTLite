# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at `22dfe97`. 5 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: The ten-seed producer sends held input only when it changes, so the 250 ms receive-time watchdog zeroes the scripted Helm and repairs

Confirmed. `src/renderer/src/authority/core.ts` neutralises receive-time held input not refreshed within `REMOTE_HELD_TIMEOUT_MS` (250, `net/receivePolicy.ts`), and the scripted pair holds discrete axes and `interactHeld` for long stretches. The Task 4 producer now calls `seat.client.held` on every new publication (the `same`/`last` gate is removed), Decision 8 says so, each seed asserts the authority replay has no `watchdog` frame, and a test after the ten seeds checks the summed crew `laserReleases[0]` is above 0. Task 4 now expects 14 tests, run as a whole file.

## R1-F2 [P2]: The content digest no longer covers the client protocol code that moves out of clientRun.ts

Confirmed against `build/contentDigest.ts` (only `clientRun.ts` from clientControl). New Task 1 Step 4b adds `streamClient.ts` and `duelClient.ts` to the digest list and stub entries to the `tests/contentDigest.test.ts` fixture; both join Task 1's files, test run and commit.

## R1-F3 [P2]: The ten-seed rig bypasses the duel mode host from authorityModes, and the deviation is not stated

Confirmed. Decision 10 states the deviation: the tests need `authority.replay()` and the duel session, which `ModeHost` does not expose; the ModeHost path is covered by the wiring test. The rig comment that claimed it used the same parts as the utility is corrected.

## R1-F4 [P2]: The round-record check matches five fields, not the authority's summary

Confirmed. Each client's record is now compared with `toEqual` against `duelRoundRecord(rig.session().summary!, 0, seed, 0)`.

## R1-F5 [P3]: ReplicaAdapter's signatures differ from spec §4 without a stated deviation

Confirmed. Decision 9 records it.

## Also changed

- The full-suite count in Task 5 is 3434 (three new tests).

## Files changed

- docs/superpowers/plans/2026-11-16-helm-h2a-ii-online-stack.md

<!-- end -->
