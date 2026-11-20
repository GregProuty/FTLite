# Ledger: helm-round2-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 1's pre-flight cannot pass: the branch head is the plan commit, not 02b1ef81, and the tree has untracked review files | resolved | 0 | Task 1 Step 1 checks 02b1ef81 is an ancestor and src/tests/scripts/package.json match it; HR2_BASE is the head at start; confirmed R2 |
| R1-F2 | P1 | Task 2's hash test loop does not typecheck: `d[key] = value` over keys of mixed type | resolved | 0 | Task 2: numeric loop for thrMille/gas/gasIdle; thrCut gets its own case; confirmed R2 |
| R1-F3 | P2 | The kind (a) lists miss two tests the helm changes break or silently shift | resolved | 0 | Task 2 edits crewOfFourWire L64 (+6); Task 3 adds throttleCut to duelThrottle L57's commands list; confirmed R2 |
| R1-F4 | P2 | Task 14 Step 7's DUEL_TEST_SEED search repeats a range the smoke's own history says was empty | resolved | 0 | Task 14 Step 7 searches seeds 1..4000 before tick 5000; confirmed R2 |
| R1-F5 | P3 | The refill test follows §3.3's rule, while §8's '240 ticks later' wording is one tick off; record which wins | resolved | 0 | Decision 19: 240 refill ticks, full on index 268; confirmed R2 |
| R1-F6 | P3 | helmThrottle's clamp test cannot fail on 'the bar coming back does not raise it' | resolved | 0 | Task 3 clamp test calls engines(d, 4) after the repair; confirmed R2 |
