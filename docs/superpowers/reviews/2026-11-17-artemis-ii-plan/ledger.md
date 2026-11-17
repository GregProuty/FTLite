# Ledger: artemis-ii-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 1 breaks the DuelState shape test in tests/duel.test.ts, and the plan neither updates nor commits it | resolved | 0 | Task 1 Step 8 adds 'throttle' to tests/duel.test.ts:41 key list; Files and git add updated; confirmed R2 |
| R1-F2 | P2 | Task 2 misses one seed-7 pin: duelSnapshot's base-tick case 5157 is SPLIT + 1 | resolved | 0 | Task 2 Step 11 re-pins duelSnapshot L117 5157 to <S + 1>; confirmed R2 |
| R1-F3 | P3 | A few edit anchors are off by a line and could produce a syntax error or a duplicated doc comment | resolved | 0 | duelOracle L105-107 incl. H-2 comment; scripted L94-97; telemetry :14; confirmed R2 |
| R1-F4 | P3 | Online: the console shows the new level one pump late | resolved | 0 | throttleBase also handed over at the end of pump(); confirmed R2 |
