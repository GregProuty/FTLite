# Round 1 response (implementation revised, 160bf93)

Reviewed `round-1.json` against d15c705. 2 accepted, 0 rejected, 0 deferred. The prepared diff `.superpowers/sdd/h2a-i-impl-review.diff` is regenerated for b19761a..HEAD.

## R1-F1 [P1]: On the next SIM_VERSION bump the rematch golden is re-blessed with no proof that covers a rematch

Confirmed: `blessGuard.ts` runs only the sector comparison and the duel oracle, and no oracle run reached an end card. `scripts/golden/duelOracle.ts` gains the run `rematch-1` (seed 1, scripted crew): round 1 is played (it is `scripted-1`, already recorded per tick) and recording starts at the rematch step and covers round 2 per tick, with a `from` field naming the real tick. One run holds one field schema and round 2's map flattens to a different length, so round 1 is not re-recorded. A new `rematchGoldenRefusal` refuses a bump unless the baseline matches the stored `duel-rematch.json` (version, seed, cadence, checkpoints, rematch tick, rounds, final hash). The bless-golden.ts comment now says so. The 20 old runs were checked byte-identical against HEAD's oracle; the new run's record matches the stored rematch golden; `duel-oracle.ts same` passes for all 21 runs.

## R1-F2 [P3]: runRematch does not check that the scripted commands were applied, unlike runDuel

Confirmed. A shared `requireApplied` helper (runDuel's message unchanged) is called by runDuel and by runRematch's `play()` before `recordTick`.

## Also changed

- tests/duelOracle.test.ts: 21 runs, the rematch refusals and the `from` offset.

## Files changed

- scripts/golden/duelOracle.ts
- scripts/bless-golden.ts
- tests/duelOracle.test.ts
- tests/helpers/scriptedDuel.ts

<!-- end -->
