# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at the round-1 commit. 3 accepted, 0 rejected, 0 deferred; the reviewer resolved all twelve round-1 findings.

## R2-F1 [P2]: §9's SceneOverlay→Banners mapping drops H-2a-iii's visibility rule and maps a boolean onto a text field

Confirmed: helm-h2a-iii-online-app.md L2288 has `layerPaused: boolean`, and L2329 shows the banner when `view === 'interior' || !overlay.layerPaused`. §9 now gives the exact mapping for `interior`, `tactical` (from the scene's `pauseText`) and `notice`, and says §6's single-player rule is a special case of it.

## R2-F2 [P2]: The error boundary's reset rule ('until its slice is next cleared') has no meaning for the Menu region

Confirmed: the menu slice is never cleared. §2 now gives every boundary a reset key: store `epochs` (added to the slice list) for Hud, DuelUi and FlightUi, and `page|phase` for Menu. Menu's fallback keeps the `session-menu` root and offers Leave or Return to menu.

## R2-F3 [P3]: §3 says SessionDeps.hud keeps its `{ update }` type, but §7 adds `clear()` to it

Confirmed. §3 now states the type as `{ update(m: HudModel): void; clear?(): void }`.

## Also changed

- §2 slice list: `epochs: { hud, duel, flight }`.

## Files changed

- docs/superpowers/specs/2026-11-16-react-ui-layer-design.md

<!-- end -->
