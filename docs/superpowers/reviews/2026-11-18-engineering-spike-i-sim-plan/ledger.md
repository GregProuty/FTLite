# Ledger: engineering-spike-i-sim-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Closed doors stop the scripted pair's BFS, so scripted golden, oracle and gate runs degenerate and duelScripted crashes | resolved | 0 | Task 6 Step 7: walkable() (bounds + wallTile) in goalTiles/bfsPath; closed-door scripted pair test; confirmed R2 |
| R1-F2 | P1 | The scripted Valkyrn pilot still asks for throttle 4, and Decision 16 only clamps scripted.ts | resolved | 0 | Task 8: levelWithinCap in bars.ts; scripted pair and scriptedPilot clamp; Step 8 runs scriptedPilot + duelGates; confirmed R2 |
| R1-F3 | P1 | tests/duelModules.test.ts's hash-coverage helper doesn't flip pewTargeted, so the test fails after Task 9b | resolved | 0 | Task 9b Step 4: pewTargeted in changedFirst regex; Step 8 runs duelModules; confirmed R2 |
| R1-F4 | P1 | Task 11's determinism script never applies an engineering command, because both players are away | resolved | 0 | Task 11: players present, every script result applied, Engines overheat asserted per seed; confirmed R2 |
| R1-F5 | P2 | Consumers of the beam-only helpers aren't adapted to the dark beam at the start | resolved | 0 | Decision 20 + Task 9b Step 7b: bots treat pew pew as primary; telemetry either barrel; situationModel handed to Part ii; confirmed R2 |
| R1-F6 | P2 | The derelict's Shield loot is silently cancelled by the bar cap | resolved | 0 | Decision 21: Shield loot nullified by bar cap; report Known limits; confirmed R2 |
| R1-F7 | P3 | Some quoted edits and line numbers don't match the source text | resolved | 0 | Line numbers corrected; Task 6 Step 5 comment edits described, not quoted; confirmed R2 |
| R1-F8 | P3 | Task 4 knowingly leaves a touched test red, and the hash test doesn't cover the power module | resolved | 0 | Global Constraints exemption for duelCheckpoint Task 4→5; hash loop covers every non-interior module; confirmed R2 |
| R2-F1 | P2 | Task 11's vent isn't 'away from the Q spawns': the held H–O door and the spawn-held Q–O door put the crew's room on the vented volume | fixed:R2 | 0 | Task 11 holds edge 1 (R–H), comment corrected, both players asserted conscious |
| R2-F2 | P3 | The new Decisions are numbered out of order, and one cited line range is off | fixed:R2 | 0 | Decision 19 moved above 20/21; lines 35 and 36 |
