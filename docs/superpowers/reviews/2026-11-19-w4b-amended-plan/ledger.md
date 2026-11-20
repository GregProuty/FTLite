# Ledger: w4b-amended-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 8 breaks tests/valkyrnRounds.test.ts:58, which Step 10 runs and expects to PASS | fixed:R1 | 0 | Task 8: valkyrnRounds.test.ts added as a kind (a) edit (Files, Step 9, Step 10, git add); fences bullet says it is not a fence |
| R1-F2 | P2 | Task 9 writes two tests into tests/onlineDuelSession.test.ts but never stages that file | fixed:R1 | 0 | Task 9: onlineDuelSession.test.ts in Files and git add |
| R1-F3 | P2 | Task 11 does not say where the PEW PEW tag goes in the JSX, and placed early it sits under the card's click overlay | fixed:R1 | 0 | Task 11: the pew tag renders after the console-card-pew div; test asserts the DOM order |
| R1-F4 | P3 | Task 5 tolerates a failing duelGates seed, but the known-red window opens duelGates only at Task 7 | fixed:R1 | 0 | Global Constraints: the duelGates known-red entry opens at Task 5 |
