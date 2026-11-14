# Round 2 response (plan revised)

Reviewed `round-2.json` against the subject at `a6629f2`. 1 accepted, 0 rejected, 0 deferred. Codex confirmed R1-F1, R1-F2 and R1-F3 resolved.

## R2-F1 [P1]: Captured skid budget ignores drag and creates reverse skid

Confirmed. Drag scales the velocity each tick (plan Task 3, `keep`), but the budget did not shrink with it, so the assist kept removing skid that drag had already taken. Node reproduced the reversal. After the drag step, `flyShip` now also applies `s.skidBudget *= keep`, so the budget follows the real remaining skid. A Node check of the fixed loop from a 300 u/s skid ends at vx 0 and budget 0, never going below 0. New Task 3 test: a 300 u/s sideways skid, no field, 400 ticks; `vx` never goes negative and ends at exactly 0 with the budget at 0. The existing budget assertion now expects `(10 − 80·dt) · (1 − 0.15·dt)`. Extracted task by task into a scratch worktree, every task typechecks and its tests pass (120 at the end).

## Also changed

- Task 3 and Task 4 expected counts: 15 flight tests.

## Files changed

- docs/superpowers/plans/2026-11-14-helm-h0a-flight-sim.md

<!-- end -->
