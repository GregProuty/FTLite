# Round 1 response (one source fix, tests strengthened)

Reviewed `round-1.json` against the subject at the brief commit. 2 accepted, 0 rejected, 0 deferred. No prior IDs (round 1). Both fixes were checked by re-running the failure modes as mutations against the new tests; each mutation fails them. Verify: `npm run typecheck` exit 0; `npm test` passes in full (see the run in this round's commit).

## R1-F1 [P1]: Reject weapon commands when the gunner is the empty-seat sentinel

Confirmed. `attendant` returns −1 for an empty or away-occupied console (`duel/step.ts:L39`), and the weapon admission compared only `e.id.player !== gunner` (L105). A command claiming player −1 therefore matched an empty Weapons console and was reported applied, while `crew.weapons` was false and the tactical step ignored it. Admission now rejects with `not-at-weapons` when `gunner < 0`, as well as when the player differs. New duel test `a command claiming player −1 is refused when Weapons is empty or its occupant is away`: for Weapons vacated by `stand` and by `presence false`, lock, charge and launch from player −1 are all rejected `not-at-weapons`, the lock stays Shields, `fireHeld` stays false and no missile launches. Mutation check: removing the `gunner < 0` guard makes the test fail.

## R1-F2 [P1]: Exercise populated missiles and events in the clone regression

Confirmed. At the clone point the existing test had no missiles and no events, so shallow copies of either passed. New test `copies missiles and events by value, not by reference`: it launches both missile slots and pushes a laser event and a missileEnd event, then clones. It asserts equal contents, distinct missile objects, a distinct events array and distinct event objects. It then mutates the copy's missiles, changes one copied event and pushes a new one, and asserts the originals are unchanged. The existing identical-future test stays. Mutation check: shallow missile copies, or sharing the events array, now fail it.

## Also changed

- (nothing)

## Files changed

- src/renderer/src/sim/duel/step.ts
- tests/duel.test.ts
- tests/tacticalDeterminism.test.ts

<!-- end -->
