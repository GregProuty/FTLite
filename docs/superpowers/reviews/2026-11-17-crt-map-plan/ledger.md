# Ledger: crt-map-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 5 rewrites store.ts from the prototype base and drops the sector HUD slice master added | resolved | 0 | store.ts replacement now keeps hud: null and epochs.hud; step says diff against current file first; confirmed R2 |
| R1-F2 | P2 | Baselines and expected test counts are from fbba4da, before the master merge | fixed:R2 | 1 | Task 4 Step 7 now relative (33 + artGuards Step 0 + 9); stale 189 removed; prototype example labelled |
| R1-F3 | P2 | Task 7's 'sim unchanged' and 'theme unchanged' diffs use a base from before the master merge | fixed:R2 | 1 | Task 7 diffs against the literal pre-plan base 869a27e (later commits docs only) |
| R1-F4 | P3 | menuState.ts line anchor is stale | resolved | 0 | anchor menuState.ts:32; confirmed R2 |
| R1-F5 | P3 | The grid's major lines use `dim`, but the spec says `faint`, and no spec note covers it | resolved | 0 | spec note 7: major grid lines dim at 0.5, minors faint; confirmed R2 |
