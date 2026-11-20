# Round 3 response (spec revised)

Reviewed `round-3.json` against the subject at `4912030e`. 2 accepted, 0 rejected, 0 deferred. The reviewer confirmed R2-F1 to R2-F4 resolved; verdict "ready with P2s".

## R3-F1 [P2]: Commands "kept for tick T + 1" are lost when P already stands at T

Confirmed: with no entry after the anchor the target is `T`, no tick after `T` runs in step 5, and `tick` ran only its own entry's commands, so the kept commands had no consumer. Step 1 now moves pending commands to the front of the first entry after the anchor and, when there is none, leaves them waiting on the predictor for the next entry `tick` appends. §3.3's `tick` runs any waiting commands before the entry's own. Step 2's extra sentence is removed, since the commands now always sit on an entry.

## R3-F2 [P3]: G5 says "Three cases" but lists four

Confirmed. G5 now says four cases, each a 20 s run under the same loss rule, which also applies to (d).

## Also changed

- From the reviewer's `not_verified` list: step 3 now says the target is at least `T`, so `P` is never left behind the confirmed tick; and G5's loss rule caps random losses at three in a row, so a long run cannot reach the cap by chance.

## Files changed

- docs/superpowers/specs/2026-11-19-net-4a-duel-prediction-design.md

<!-- end -->
