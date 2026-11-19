# Ledger: own-ship-window-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The scene gate `station !== null && station !== 'ship'` shows the window on the SHIP tab for a seated player | resolved | 0 | spec §4 gates ownShip on onMap (view !== interior); §2 wording; scene test in §6; confirmed R2 |
| R1-F2 | P1 | Map objects under the window are hidden and get no off-screen arrow | resolved | 0 | spec §3: avoid rect in arrow() covers hidden on-screen objects and edge arrows via ray entry k=max(kx,ky), corner=right; ArrowDraw.edge; spreadArrows bounds; frameZoom avoid cap; tests in §6; confirmed R2 |
| R1-F3 | P1 | Slide rule conflicts with spreadArrows, and the corner case is undefined | resolved | 0 | spec §3: avoid rect in arrow() covers hidden on-screen objects and edge arrows via ray entry k=max(kx,ky), corner=right; ArrowDraw.edge; spreadArrows bounds; frameZoom avoid cap; tests in §6; confirmed R2 |
| R1-F4 | P1 | Fire and damage looks overlap: in practice every burning room is also damaged, and the spec gives no draw order | resolved | 0 | spec §2 own look table (not roomLook), fire overrides damage, damage never CRT.hot, fire never hatches; tests; confirmed R2 |
| R1-F5 | P2 | The contact window's header layout does not fit 240 × 34 px | resolved | 0 | spec §2 header rows with offsets fitting 240 px; OWN_SHIP_BOX moved to y+40; hull.block resolved colour in the view; confirmed R2 |
| R1-F6 | P2 | The hull alert blink has no resolved colour in the view, which contradicts 'React does no blinking' | resolved | 0 | spec §2 header rows with offsets fitting 240 px; OWN_SHIP_BOX moved to y+40; hull.block resolved colour in the view; confirmed R2 |
| R1-F7 | P2 | Edge rule: §2 and §4 disagree about walls; damage polygon and fire bar are undefined for non-rectangular rooms | resolved | 0 | spec §2/§4: walls and doors not drawn; edge rule unified; room rect = tile bbox, rectangle test over shipped layouts; fire bar only at progress > 0; confirmed R2 |
| R1-F8 | P2 | A crew dot is invisible in a burning room | resolved | 0 | crew dot 3x3 hot in 5x5 glass; downed 5x5 hot outline; confirmed R2 |
| R1-F9 | P2 | The Flight seat's pointer rule does not exclude the new window | resolved | 0 | §3 OWN_SHIP joins flightPointer BLOCKS; test; confirmed R2 |
| R1-F10 | P2 | The sit card and banners can overlap the window; the layout test does not cover them | resolved | 0 | §3 draw order: sit card and banners after the window; ~15 px overlap accepted and documented; confirmed R2 |
| R1-F11 | P3 | The flash baseline leaves out the alarm's freshness guard and does not say when tracking runs | resolved | 0 | §4 watch updates every drawn frame, re-baselines on first frame, epoch reset, stale tick per HIT_FRESH_TICKS; confirmed R2 |
| R1-F12 | P3 | DuelUiView field shape and a name collision | resolved | 0 | ownShip?: optional; tile index k, grid width gw; confirmed R2 |
| R2-F1 | P3 | 'Console views pass OWN_SHIP' is gated differently from the window itself | fixed:R2 | 0 | §3 avoid passed exactly when ownShip is built (onMap); scene test covers standing |
| R2-F2 | P3 | An on-screen object in A's margin band, which is not covered by the window, still gets an arrow | fixed:R2 | 0 | §3 on-screen case tests the ungrown avoid; margin band gets no arrow |
