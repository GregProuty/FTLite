# Ledger: ui-iii-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Deleting mapPanel.ts breaks tests/layout.test.ts, and the Task 5 grep cannot find it | resolved | 0 | Task 1 repoints tests/layout.test.ts to mapModel and greps render/mapPanel; Task 5 grep now matches mapPanel; confirmed R2 |
| R1-F2 | P1 | The CellRow test compares jsdom's style.background to hex strings; CSSOM gives rgb() | resolved | 0 | CellRow puts hex(fill) in data-ui-cell; the test reads the attribute; confirmed R2 |
| R1-F3 | P2 | The uiperf measurement in Task 5 Step 4 records nothing | resolved | 0 | perf: probe writes fixture 2 every frame with tick/simSeconds/health/progress varied for 60 s; sharing cost timed separately; confirmed R2 |
| R1-F4 | P2 | The probe's engine=react variant never gets the image cache, so the 'after' shots lack icons and glyphs | resolved | 0 | probe hud react branch builds the image cache and passes it to mountUi; confirmed R2 |
| R1-F5 | P2 | The spec §8 HUD render-count and error-boundary tests are missing | resolved | 0 | uiHud.test.tsx gains render-count and error-boundary cases; confirmed R2 |
| R1-F6 | P2 | Task 5's main.ts instruction would use `store` before it is declared | resolved | 0 | main.ts: delete the createHud line, declare hud after store/perf next to duelSink; confirmed R2 |
| R1-F7 | P3 | Port details the Task 3 rules omit or blur | resolved | 0 | Science system-row tint, event-card non-empty advance and number tint, banner TEXT, Doors item!==null, glyph-row predicate; confirmed R2 |
| R1-F8 | P3 | Smaller unstated deviations and a contradiction in Task 1 | resolved | 0 | deviations 4 (Icon as Box) and 5 (cache built in main.ts) added; hud.test.ts entry dropped; confirmed R2 |
