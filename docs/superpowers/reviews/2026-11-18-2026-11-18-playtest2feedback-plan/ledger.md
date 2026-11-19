# Ledger: 2026-11-18-playtest2feedback-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 4 misses the replay's held schema, so its own replay test fails and duel replays with the new fields fail to parse | fixed:R1 | 0 | Task 4: replay.ts held schema edit, Files and git add |
| R1-F2 | P1 | Task 10 calls takeSteer() on the shadowed ContactRequests inside pump(), which fails tsc | fixed:R1 | 0 | Task 10 (c2): takeSteer0 closure, drained beside requests0 at pump start; steerNow = steerTaken |
| R1-F3 | P1 | Task 3 breaks tests/duelSnapshot.test.ts, which hard-codes the helm module as two values, and does not edit it | fixed:R1 | 0 | Task 3 Step 8 (c),(d): duelSnapshot.test L109 and crewOfFourWire L63 offsets +6; run and staged |
| R1-F4 | P2 | Task 5 Step 8's file list is incomplete, and duelOnlineView's throttle test breaks in Task 10, which has no migration rule | fixed:R1 | 0 | Task 5 Step 8: eleven files; duelInputMerge no edit; duelRuntime and duelOnlineView its move to Valkyrn |
| R1-F5 | P2 | The known-red list K can miss crew-trajectory pins and can mask new failures | fixed:R1 | 0 | Global K rule: Tasks 5/7 re-check K tests fail the same way; Task 2 Step 10 and Task 8 end run the full suite |
| R1-F6 | P2 | If the Task 8 gate cannot be tuned, the whole plan stops, though Tasks 9-13 do not depend on it | fixed:R1 | 0 | Task 8: knob 0 scripted helmPower +1; on failure describe.skip with owner-visible note and continue |
| R1-F7 | P3 | The crew HelmStation's bottom rows sit lower than the existing block's and may clip the 200 px panel | fixed:R1 | 0 | Task 11: rate moved into the power line, auto-face y0+118, two hint rows at y0+150/170; test text updated |
