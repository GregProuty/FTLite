# Ledger: art-i-b-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Debris never shows when a hit opens a breach: the hitstop sets pdt to 0 on that frame and the opening is used up anyway | fixed:R1 | 0 | interiorFeel spawns debris regardless of pdt (plan L2016, Decision 11); test L1785 hit on the opening frame then >= DEBRIS_COUNT particles |
| R1-F2 | P1 | gradeCover returns overlapping rectangles, so the multiply darkens twice or three times along every wall | fixed:R1 | 0 | gradeCover rasterises a whole-ship art-pixel mask and emits non-overlapping merged runs (L621, Decision 3); test L516 no cell covered twice, union exact, Cutter and Skiff |
| R1-F3 | P2 | In the sector, stars are 2 internal px but the ship's art pixel is 2 x fit.scale, so the picture mixes pixel sizes | fixed:R1 | 0 | stars(seed, band, t, artPx): size artPx, snapped to artPx, speeds 4/10 x artPx (L1652, Decision 14); test over artPx 2, 4/3, 1.31, 1 |
| R1-F4 | P2 | Deviation (f): console desks and screens are still off the art-pixel grid, and the blink cursor test allows a 1-unit overflow | fixed:R1 | 0 | new Task 5: DESK_W 20, DESK_D 10, SCREEN_D 2, SCREEN_INSET 2, outline 2 inside; onGrid test over every side/flush; cursor test exact bounds (Decision 19) |
| R1-F5 | P2 | InteriorFeel has no destroy(), so every duel restart leaks four shared GraphicsContexts | fixed:R1 | 0 | InteriorFeel.destroy() frees Graphics then shared contexts; interiorView.destroy calls it; sector feel built once, layout change reuses contexts; test L1809 (Decision 18) |
| R1-F6 | P3 | The presentation clock keeps running while the game is paused, unlike the duel's existing fx | fixed:R1 | 0 | duel InteriorView.draw presentDt = paused ? 0 : dt; sector Renderer.draw optional paused param from session.ts/onlineSession.ts phase; tests interiorFeel L1794 and session (Decision 17) |
