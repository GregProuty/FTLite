# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `78f3b85e`. 4 accepted, 0 rejected, 0 deferred. Each was checked against the plan, the revised W-4b plan and the W-4 branch's code in `.worktrees/w4` (3b2a90c5).

## R1-F1 [P2]: Task 3 never tests pew pew in hand during a MANUAL flight (slot 0's slew and tickPew's MAN gain)

Confirmed: every slew and fire case in Task 3's `w4Flight.test.ts` set `gunMode {slot: 1}` and `weaponSel: 1`; slot 0 appeared only in the `pewFire` refusal case. Task 3's test file gains a case after the "MAN gun fights on AUTO" one: pew pew's own switch on MAN, pew pew selected, a reticle due west, a MANUAL torpedo flying. It asserts `pewManual` true, `pewTurret > 0` (toward the ship, not the reticle), `pewShots > 0` with no `pewFire` sent, and that one tick's gain from an empty charge equals `pewGain(t, 0, false)` (AUTO's 6 at one bar against MAN's 7; the three-argument `pewGain` is W-4b Task 4's, and today's is at `pew.ts` L31). The file's imports gain `pewGain`.

## R1-F2 [P3]: Task 1's pre-flight check does not look for handControl, which Task 3 now anchors on

Confirmed. Step 1's `git grep` now also looks for `export function handControl` in `src/renderer/src/sim/tactical/state.ts`, and the stop sentence names it.

## R1-F3 [P3]: Gate line 4's 'R and Shift+R still flip the tags' leaves out that the words stay AUTO/HOLD during the flight

Confirmed against W-4b's Decision 9 (the light is the switch, the word is what the gun does). Gate item 4 now reads that R and Shift+R flip each tag's light, and the words stay AUTO or HOLD until the flight ends.

## R1-F4 [P3]: The merge-version note is only in the plan; the report and gate entry Task 8 writes say W-4 ends at V + 1 (61)

Confirmed. Step 8's report line and the gate note line now both say the merge to master bumps once more (the branch is cut from SIM 60 and master is at 61). No step's mechanics change.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md

<!-- end -->
