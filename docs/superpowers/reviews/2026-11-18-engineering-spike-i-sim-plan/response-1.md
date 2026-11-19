# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `1f6dc9ff`. 8 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Closed doors stop the scripted pair's BFS

Confirmed: scripted.ts:L158-L165 uses solidAt, and grid.ts:L14-L21 treats a Closed door as solid. Task 6 Step 7 adds `walkable` (bounds plus wallTile) to goalTiles and bfsPath, updates the comment, and adds a Cutter closed-door test in which the pair reaches Navigation and Weapons.

## R1-F2 [P1]: Scripted Valkyrn pilot asks for throttle 4

Confirmed: scriptedPilot.ts:L79, L86, L92, L104. Task 8 adds `levelWithinCap` and routes both bots through it. Step 8 runs scriptedPilot.test.ts and duelGates.test.ts.

## R1-F3 [P1]: changedFirst does not flip pewTargeted

Confirmed: duelModules.test.ts:L58. Task 9b Step 4 adds it to the regex, and Step 8 runs duelModules.

## R1-F4 [P1]: Determinism script players are away

Confirmed: passiveInput sets presence false. Task 11 keeps the players present, asserts every result is applied, and asserts an Engines overheat in each seed.

## R1-F5 [P2]: Beam-only helper consumers

Confirmed: scripted.ts:L118, L271, L276; telemetry.ts:L161. Decision 20 and Task 9b Step 7b make the bots use pew pew as primary and make telemetry count either barrel. situationModel is handed to Part ii, where it is now in Part ii's plan.

## R1-F6 [P2]: Shield loot cancelled by the cap

Confirmed: science.ts:L74. Decision 21 states that the loot is nullified in the spike, and the report's Known limits lists it.

## R1-F7 [P3]: Quoted edits and line numbers

Confirmed. The line numbers are corrected, and the comment edits that span several lines are described rather than quoted.

## R1-F8 [P3]: A red test between tasks, and hash loop coverage

Confirmed. The Global Constraints exempt duelCheckpoint between Task 4 and Task 5 explicitly, and the hash loop now covers every non-interior module.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-engineering-spike-i-sim.md

<!-- end -->
