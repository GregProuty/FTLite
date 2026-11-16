# Ledger: engine-refactor-net3

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P0 | The mode factory omits a required checkpoint method | resolved | 0 | see response-1.md; confirmed R2 |
| R1-F2 | P0 | EncounterRules cannot supply the duel tick to the generic core | resolved | 0 | see response-1.md; confirmed R2 |
| R1-F3 | P1 | Duel completion has no specified wire record | fixed:R3 | 2 | terminal keeps per-ship TerminalCause[] arrays (accumulator order, no duplicates, codec-validated); the continuation proof compares the end summary too |
| R1-F4 | P1 | The duel snapshot format leaves restore rules undecided | resolved | 1 | see response-2.md; confirmed R3 |
| R1-F5 | P1 | The generic replay contract is unspecified | resolved | 0 | see response-1.md; confirmed R2 |
| R1-F6 | P1 | The R-1 history ring has no bound or proof | resolved | 0 | see response-1.md; confirmed R2 |
| R1-F7 | P1 | The unchanged-deps claim omits resolveLayout | resolved | 1 | see response-2.md; confirmed R3 |
| R1-F8 | P2 | Risk 3 understates deferred projection changes | resolved | 0 | see response-1.md; confirmed R2 |
