# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at `0379cb98`. 5 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Task 1 lists commands before the codec has them
Confirmed: tests/duelModules.test.ts:144 and duelCheckpoint.test.ts:136-142 compare kinds with a fixed list and the codec. Took option (a): Task 1 declares scienceModule with empty commands and reasons and expects `[[], []]`; Task 2 Step 8 fills both and updates scienceState; Task 2's commit stages hash.ts and scienceState.test.ts.

## R1-F2 [P1]: Task 4's progress breaks Task 2's progress-0 expectations
Confirmed (spec 4.3: first progress step in the admitting tick). Task 2's two assertions use toMatchObject without progress.

## R1-F3 [P1]: The science tab key breaks duelConsoleModel L106
Confirmed: L106 is an exact toEqual on tabs. Task 8's test updates now include L106 with `science: 'locked'` (the file is already staged in Task 8's commit).

## R1-F4 [P2]: The Science block is an unmarked deviation
Confirmed against spec 7.3. Decision 10 now states it is a deviation and why.

## R1-F5 [P3]: Line numbers off by one
Confirmed: L75 and L155. Fixed, and the L21 rule restates the outcome word.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-17-sci-1-science-scans.md

<!-- end -->
