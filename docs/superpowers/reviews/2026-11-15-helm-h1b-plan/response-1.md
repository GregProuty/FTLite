# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at the brief commit. 4 accepted (3 P1, 1 P2), 0 rejected, 0 deferred. All four were confirmed against the plan and the sim.

## R1-F1 [P1]: Rapid Tab followed by X or E loses the seat command

Confirmed: `stepDuelTick` checks sits and stands against presence before it applies the presence commands (`sim/duel/step.ts:L80-L96`). So a stand queued after Tab, but in the same tick, was rejected. The runtime now holds back a sit or stand queued after a Tab until the Tab's presence tick has run, and sends it on the next tick (plan decision 12). Two new runtime tests sample Tab then X, and Tab then E at a free console, in separate frames before one tick. Both fail without the fix and pass with it.

## R1-F2 [P1]: Shared arrow spreading changes the H-1a flight view

Confirmed. Spreading is now opt-in through `spreadArrows?: boolean` on the model input, and only the duel boot sets it (decision 18). A new test shows that without the option, the arrows keep H-1a's exact positions for the flight view's input.

## R1-F3 [P1]: The repair acceptance test teleports to the target

Confirmed. A new runtime test damages Engines, stands the gunner with X, and walks it with scripted A for 100 ticks west along row 6, through the one-tile doors at columns 6 and 4, into Engines. It then holds E, and repair progress rises by 10 × the solo rate.

## R1-F4 [P2]: Restart retains the previous seed's star field

Confirmed. The tactical layer gains `reseed(seed)`, which redraws the stars once in the same Graphics, and the duel boot calls it with `runtime.seed` on an epoch change. A new test checks that no display objects are added and that the same number of stars is drawn.

## Also changed

- Plan prose: decisions 12, 15 and 18, the Task 2 interfaces, the file table, scope and test counts.
- Re-verified by extracting the plan task by task into a fresh worktree at master. Each task's tests pass in order (3, 39, 23, 8, 30, 13) with a clean typecheck, and the files are byte-identical to the prototype. Full suite: 1,925 passed.

## Files changed

- docs/superpowers/plans/2026-11-15-helm-h1b-duel-screens.md

<!-- end -->
