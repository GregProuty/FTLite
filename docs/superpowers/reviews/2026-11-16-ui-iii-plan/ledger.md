# Ledger: ui-iii-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Deleting mapPanel.ts breaks tests/layout.test.ts, and the Task 5 grep cannot find it | fixed:R1 | 0 | Task 1 repoints tests/layout.test.ts to mapModel and greps render/mapPanel; Task 5 grep now matches mapPanel |
| R1-F2 | P1 | The CellRow test compares jsdom's style.background to hex strings; CSSOM gives rgb() | fixed:R1 | 0 | CellRow puts hex(fill) in data-ui-cell; the test reads the attribute |
| R1-F3 | P2 | The uiperf measurement in Task 5 Step 4 records nothing | fixed:R1 | 0 | perf: probe writes fixture 2 every frame with tick/simSeconds/health/progress varied for 60 s; sharing cost timed separately |
| R1-F4 | P2 | The probe's engine=react variant never gets the image cache, so the 'after' shots lack icons and glyphs | fixed:R1 | 0 | probe hud react branch builds the image cache and passes it to mountUi |
| R1-F5 | P2 | The spec §8 HUD render-count and error-boundary tests are missing | fixed:R1 | 0 | uiHud.test.tsx gains render-count and error-boundary cases |
| R1-F6 | P2 | Task 5's main.ts instruction would use `store` before it is declared | fixed:R1 | 0 | main.ts: delete the createHud line, declare hud after store/perf next to duelSink |
| R1-F7 | P3 | Port details the Task 3 rules omit or blur | fixed:R1 | 0 | Science system-row tint, event-card non-empty advance and number tint, banner TEXT, Doors item!==null, glyph-row predicate |
| R1-F8 | P3 | Smaller unstated deviations and a contradiction in Task 1 | fixed:R1 | 0 | deviations 4 (Icon as Box) and 5 (cache built in main.ts) added; hud.test.ts entry dropped |
