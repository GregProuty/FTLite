# Ledger: engine-r1a-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The final canonical trace gate cannot run | resolved | 0 | the mode exists: R-0 adds canonical-trace same (R-0 plan decision 3, L626); R-1a now states the R-0 prerequisite in Scope and Global Constraints, and Step 0 stops if 'same' is missing; confirmed R2 |
| R1-F2 | P1 | The factory test accepts conflicting mode identities | resolved | 0 | defineEncounterMode throws unless options.modeId === rules.modeId; the factory test renames the rules sector-copy, asserts replay mode, and checks a mismatch throws; confirmed R2 |
| R1-F3 | P1 | The new authority equivalence test compares the core with itself | resolved | 0 | scripts/golden/authority-trace.ts: pre-refactor boundary trace recorded from master's authority before Task 1 (golden replay, live host with strict and receive-time bindings incl. pause/stale/duplicates/gap/held/callout/300-tick/capture/sealed checkpoint/V3 replay, lease gate with V4 replay, crash record); compared at the end of Task 3; proven to bite; confirmed R2 |
