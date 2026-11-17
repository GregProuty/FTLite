# Ledger: crt-map-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 5 rewrites store.ts from the prototype base and drops the sector HUD slice master added | fixed:R1 | 0 | store.ts replacement now keeps hud: null and epochs.hud; step says diff against current file first |
| R1-F2 | P2 | Baselines and expected test counts are from fbba4da, before the master merge | fixed:R1 | 0 | counts restated as deltas from the Step 0 baseline (artGuards +5, +9; suite +57 in +7) |
| R1-F3 | P2 | Task 7's 'sim unchanged' and 'theme unchanged' diffs use a base from before the master merge | fixed:R1 | 0 | Step 0 records BASE=HEAD; Task 7 diffs against $BASE |
| R1-F4 | P3 | menuState.ts line anchor is stale | fixed:R1 | 0 | anchor menuState.ts:32 |
| R1-F5 | P3 | The grid's major lines use `dim`, but the spec says `faint`, and no spec note covers it | fixed:R1 | 0 | spec note 7: major grid lines dim at 0.5, minors faint |
