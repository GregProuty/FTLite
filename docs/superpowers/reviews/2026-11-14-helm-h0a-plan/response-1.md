# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `0fdd1e3`. 3 accepted (2 P1, 1 P2), 0 rejected, 0 deferred. No prior IDs (round 1). After the fixes, the revised plan was extracted task by task into a scratch worktree, and after each task the typecheck and the tactical and boundary tests passed (83, 90, 106, 112, then 119 tests).

## R1-F1 [P1]: Stabilise cancels gravity applied during the same tick

Confirmed, and the problem is wider than the finding. Cancelling all sideways velocity each tick erases gravity whenever its pull is sideways to the nose. A released ship flying nose-forward in orbit would stop orbiting, against spec §6 ("still coasts, falls and orbits"). Moving stabilise before the forces, as suggested, only delays that by a tick: next tick's stabilise would cancel the previous tick's gravity. The fix changes the mechanic. On the tick both axes go to zero, `flyShip` records the sideways speed as `skidBudget`, with its side in `skidSign`, and removes up to `STABILISE · dt` of it per tick, along the fixed perpendicular, until the budget is spent. It runs before this tick's forces, and sideways speed added later is never recorded. `Ship` gains `released`, `skidBudget` and `skidSign` (initialised in `shipAt`, flattened in `hash.ts`). New Task 3 tests: a released ship at rest at r = 1200 still falls on its first tick; a released ship nose-forward in a circular orbit stays within 2% for 60 s with stabilise on; only the captured skid is removed, and a later sideways push is not. The spec §6 Stabilise row is amended to match, with a change-log entry, and the plan records it as decision 6. The existing 60 u/s skid test still passes.

## R1-F2 [P1]: Mixed contacts resolve in a different body order from the spec

Confirmed. Spec §4 orders contacts per body: static contacts, then the other moving bodies. `resolveContacts` ran both ships' statics before the pair. It now runs ship 0's statics, then the ship pair (once), then ship 1's statics, through a new `hitStatics` helper. New Task 4 test: ship 1 sits 1 unit clear of the planet, and ship 0 overlaps it by 5. The pair push moves ship 1 into the planet, and its own planet contact then pushes it out; under the old order it would end inside. Recorded as plan decision 7.

## R1-F3 [P2]: The Engines-factor test never checks damaged turn rate

Confirmed. The test checked only the thrust magnitude. It now also turns for 60 ticks at each Engines level and asserts `heading + headingAcc` equals `TURN_STEPS_PER_TICK × 60 × factor`.

## Also changed

- Task 3 and Task 4 expected counts: 14 flight tests, 5 contact tests.

## Files changed

- docs/superpowers/plans/2026-11-14-helm-h0a-flight-sim.md
- docs/superpowers/specs/2026-11-14-helm-demo-design.md

<!-- end -->
