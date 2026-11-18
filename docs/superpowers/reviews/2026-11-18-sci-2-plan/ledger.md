# Ledger: sci-2-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 2 breaks tsc -b in two test files it does not list | fixed:R1 | 0 | Task 2 Step 12b adds ! to scriptedDuel.ts:78 and duelTelemetry.test.ts:84; both in Files and git add |
| R1-F2 | P1 | Task 3 makes a crew-3 duel init valid, so duelMode.test.ts:134 fails | fixed:R1 | 0 | Task 3 Step 7b: duelMode.test.ts:134 uses playerCount 5 and a crew-3 start is asserted ok; file in git add |
| R1-F3 | P1 | Task 7 removes otherStatus and ReadoutInput.other but misses four test files | fixed:R1 | 0 | Task 7: sed extended to scienceConsole/scienceSeat; otherStatus() asserts rewritten as crewStatus with the value map; three files in Files, test run and git add |
| R1-F4 | P2 | Decision 5: REPAIRING shows for anyone standing near damage, even if not repairing | fixed:R1 | 0 | Decision 5 and crewStatus: REPAIRING needs reach plus started work (d.repair[r] > 0 or fireRepair > 0); test adds the ON FOOT-then-REPAIRING step |
| R1-F5 | P3 | Small citation slips in Task 2 Step 7 and Task 5 | fixed:R1 | 0 | loop count stated as 1+5 plus revivers; menu.test.tsx L74 |
