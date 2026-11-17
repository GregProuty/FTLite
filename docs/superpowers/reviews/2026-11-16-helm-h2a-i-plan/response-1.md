# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at `22dfe97`. 5 accepted, 0 rejected, 1 deferred.

## R1-F1 [P1]: An out-of-range round index makes validateDuelCheckpoint loop without bound (roundSeed has no cap)

Confirmed: the round module's only bound on `round` was non-negative safe integer, and `roundSeed` extends its chain one `followingSeed` at a time. `MAX_DUEL_ROUNDS = 1024` is exported from `sim/duel/snapshot.ts` (not `seeds.ts`, which already imports `snapshot.ts`, so the other placement would make a cycle). The round check now rejects `round > MAX_DUEL_ROUNDS` and `2 * round > baseTick` (checked after the base-tick check so the existing `/base tick/` case keeps its message; the 2n bound was checked against the step: each round needs a deciding step and a rematch step), and `roundSeed` throws above the cap. New cases: MAX+1, round 1 at base 0 and 1, and MAX at base 2·MAX−1.

## R1-F2 [P2]: Later SIM bumps re-bless duel-rematch.json on proofs that never run a rematch

Deferred. No further SIM bump is planned in H-2a after 39, and this bump's rematch behaviour is new (proved by the golden's own tests, not a migration). The next bump must add a rematch run to the duel oracle before it re-blesses `duel-rematch.json`; that is recorded in the project's status memory for the next bump.

## R1-F3 [P3]: The restore-equality test passes vacuously if the rematch does not start a round

Confirmed. The test now asserts the rematch result is applied, `d.round === 1`, and that the loop ran 600 iterations; Task 3 Step 1 expects 10 failing tests.

## R1-F4 [P3]: No test validates a paused checkpoint on a decided round, or a bad decidedTick on a decided snapshot

Confirmed. The re-host test pauses on round 2's decided end card, validates through bytes and restores it. Decided-snapshot cases (decidedTick −1, baseTick − 1, tick + 1, each rehashed, `/decided tick/`) are a separate block after `created.mockRestore()`, since the surrounding test asserts `createDuel` is never called; the baseTick − 1 case raises the base to 1 so it is not the −1 case again.

## R1-F5 [P3]: restoreDuelSnapshot keeps the target's per-tick events, so it is not exactly a fresh load

Confirmed against `snapshot.ts` (events are not stored). `restoreDuelSnapshot` clears `d.events` and `d.tactical.events` after `writeBack`; the Task 1 restore test asserts both are empty.

## R1-F6 [P3]: The round-start equivalence test uses a highly composite offset (T = 252)

Confirmed. 255 end-card steps give T = 257, a prime, with a comment why.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-helm-h2a-i-rounds-and-contracts.md

<!-- end -->
