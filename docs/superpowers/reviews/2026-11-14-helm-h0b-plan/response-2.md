# Round 2 response (plan revised)

Reviewed `round-2.json` against the subject at `c8ead31`. 1 accepted (P2), 0 rejected, 0 deferred. Codex confirmed R1-F1, R1-F2 and R1-F4 resolved, and confirmed R1-F3's code fix. R1-F3's test coverage is the same point as R2-F1, and both are fixed here.

## R2-F1 [P2]: Complete the expiry regression assertions requested in R1-F3 (with R1-F3)

Confirmed. The test checked only age, removal, the cause and `missilesLost`, so it would not catch a missile that stopped moving on its last tick or a laser that unfroze a tick late. The test now gives the missile `vx` 60 in open space and gives the crew a frozen full charge (hold 50). On tick 479 the hold stays 50 and the missile is alive. On tick 480 the missile is removed, its `expired` event's `x` is more than 0.9 past its tick-479 `x` (the 480th move happened before expiry), and the hold is 51 (the laser unfroze that same tick). Re-checked by applying the plan task by task to a fresh worktree of master: each task typechecks and passes (137, 162, 179).

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-14-helm-h0b-combat.md

<!-- end -->
