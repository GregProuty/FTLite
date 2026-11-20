# Ledger: w4c-amended-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | Task 3 never tests pew pew in hand during a MANUAL flight (slot 0's slew and tickPew's MAN gain) | fixed:R1 | 0 | Task 3: a slot 0 case added to w4Flight.test.ts (slew, AUTO rounds, AUTO gain) and the pewGain import |
| R1-F2 | P3 | Task 1's pre-flight check does not look for handControl, which Task 3 now anchors on | fixed:R1 | 0 | Task 1 Step 1: the grep and the stop sentence name handControl in state.ts |
| R1-F3 | P3 | Gate line 4's 'R and Shift+R still flip the tags' leaves out that the words stay AUTO/HOLD during the flight | fixed:R1 | 0 | gate item 4 reworded: the light flips, the words stay AUTO or HOLD |
| R1-F4 | P3 | The merge-version note is only in the plan; the report and gate entry Task 8 writes say W-4 ends at V + 1 (61) | fixed:R1 | 0 | Task 8 Step 8: the report line and the gate note carry the merge bump |
