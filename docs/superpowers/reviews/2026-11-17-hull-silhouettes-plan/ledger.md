# Ledger: hull-silhouettes-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | The two blink-phase screenshots are not guaranteed to land in different phases | fixed:R1 | 0 | phase pinned in the page via &phase=a¦b (performance.now override); no delay offsets |
| R1-F2 | P2 | Running the CRT Step 4 'exactly' writes the shots into the CRT map's gate folder; the runner has no output folder to replace | fixed:R1 | 0 | Step 3 commands written out with OUT=hull-silhouettes, no cp, stop filter on hull-silhouettes |
| R1-F3 | P3 | The harness's interiorCamera is left to be worked out at execution | fixed:R1 | 0 | createInteriorCamera import and field given verbatim |
| R1-F4 | P3 | Small inaccuracies in Task 1's Interfaces and Task 2 Step 1's expected RED output | fixed:R1 | 0 | hatchSegments dropped from Interfaces; RED expectations corrected (tsc excess property; lock test f 0.633 vs 0.67) |
