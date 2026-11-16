# Round 3 response (spec revised)

Reviewed `round-3.json`. The reviewer confirmed R1-F7 and R2-F1 resolved. 2 accepted (both P2), 0 rejected, 0 deferred.

## R3-F1 [P2]: decidedTick off by one

Confirmed: the deciding step increments the tick (`step.ts:126`), and the accumulator records `tac.tick` after it (`telemetry.ts:90-92`). `decidedTick` is now defined as the tick right after the deciding step, which is the snapshot tick of the first decided publication and of the `duel:<round>:true` safe point. So `ticks = decidedTick − baseTick` holds exactly, and a validator test pins it on that safe point.

## R3-F2 [P2]: peer loss while already paused

Confirmed. If the run is already paused, the steward defers its presence command until the next resume, and no `peer-lost` pause is requested. If the presence command is rejected (for example `stale-tick`), it is retried once at the next boundary, and the pause is requested anyway if the retry fails too. Both cases are added to the test.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md

<!-- end -->
