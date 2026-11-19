# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `3c9f45ec`. 8 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Pew pew untargeted at round start in the test

Confirmed against Part i L2530 and Decision 17. The Task 8 test now expects target Room.Shields and ready true.

## R1-F2 [P1]: aimWeapon 'pew' breaks FlightStation

Confirmed: FlightStation.tsx:22, :27; DuelUi.tsx:45. Task 8 narrows the value at the DuelUi call site and stages DuelUi.tsx.

## R1-F3 [P1]: Torpedo fog test moves the wrong pool entry

Confirmed: state.ts:247-251 uses the first free entry. The test now uses the returned entry, and the deferred bullets are removed.

## R1-F4 [P1]: Task 11 overwrites Part i's report

Confirmed. Task 11 is now a Modify that keeps Part i's sections and appends Part ii's.

## R1-F5 [P2]: Duplicate measurement script

Confirmed. It is dropped, and Part i's script and lines are quoted.

## R1-F6 [P2]: Optional ConsoleInput calls

Confirmed: actions.ts:49. The calls now use `?.()`.

## R1-F7 [P2]: Fog hides the round-start enemy in existing tests

Confirmed: SPAWN_RADIUS 2000 against a start range of 900. Task 9 gives the grep and one recipe (move ships[1] to within 600), and Task 10 repeats it.

## R1-F8 [P3]: HUD deviations and overlapping markers

Confirmed. The heat bar turns hot above 75 %. The breach marker is offset half a tile when it shares a tile with a fire. Decision 16 puts the coolant count in the header over the reactor column.

## Also changed

- Task 8 Step 5b: situationModel's WEAPONS OFFLINE shows only when every weapon is dark (handed over from Part i refine R1-F5), with a test.

## Files changed

- docs/superpowers/plans/2026-11-18-engineering-spike-ii-hud.md

<!-- end -->
