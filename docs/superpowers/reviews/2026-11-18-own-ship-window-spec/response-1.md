# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `f368ce40`. 12 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: The scene gate shows the window on the SHIP tab for a seated player

Confirmed. scene.ts:L178 `station` is the seat (consoleStation), and L179 `onMap` adds `view !== 'interior'`. Spec §4 now builds `ownShip` only when `onMap`, and §2 says it does not show on the SHIP view whether standing or seated. §6 adds a scene test.

## R1-F2 [P1]: Map objects under the window are hidden and get no off-screen arrow

Confirmed. tacticalModel.ts:L256-258 returns null inside the inset rect, which contains most of OWN_SHIP. §3 now uses the object's screen point when edgePoint returns null; if it falls inside A, the arrow is placed on A's boundary. frameZoom gains an avoid cap for up-left enemies. Tests are in §6.

## R1-F3 [P1]: Slide rule conflicts with spreadArrows, and the corner case is undefined

Confirmed (tacticalModel.ts:L271-298). The "slide" is replaced by ray entry into A at k = max(kx, ky); a corner counts as the right edge. ArrowDraw.edge tags these arrows. spreadArrows takes avoid: avoid-edge groups spread along their own edge, and the top/left groups' bounds exclude A.

## R1-F4 [P1]: Fire and damage looks overlap

Confirmed (crtTheme.ts:L27-31; contactModel.ts:L169 uses ENEMY_LOOKS). §2 now defines an own-ship look table in ownShipModel instead of roomLook. Fire overrides damage, damage never uses CRT.hot, and fire never hatches. The off phase is CRT.mid. Tests are in §6.

## R1-F5 [P2]: The contact window's header layout does not fit 240 × 34 px

Confirmed (ContactWindow.tsx:L44-91). §2 gives explicit row y values and x offsets inside 240 px, and OWN_SHIP_BOX moves to y+40 with h-48. The component test checks that the header sits above the box.

## R1-F6 [P2]: Hull alert blink has no resolved colour

Confirmed. `hull.block` carries the resolved CRT.hot / CRT.main phase, and it is tested.

## R1-F7 [P2]: Edge rule contradiction; non-rectangular rooms

Confirmed (derived.ts walls and doors are not room tiles). The §2 and §4 rule is unified: walls and doors are not drawn. A room's rect is its tile bounding box, and a test asserts every shipped layout's rooms are rectangles. The fire bar shows only when progress > 0.

## R1-F8 [P2]: Crew dot invisible in a burning room

Confirmed. Dots are now 3×3 hot in a 5×5 glass square. A downed crew member is a 5×5 hot outline.

## R1-F9 [P2]: Flight pointer does not exclude the window

Confirmed (app/duel/flightPointer.ts:L11 BLOCKS). OWN_SHIP joins BLOCKS, and it is tested.

## R1-F10 [P2]: Sit card and banners can overlap

Confirmed. The overlap is about 15 px at most. §3 sets the draw order (sit card and banners on top) and documents the overlap as accepted, since both are transient.

## R1-F11 [P3]: Flash baseline missing freshness guard

Confirmed (interiorSounds.ts:L33-35). The watch updates every drawn frame and re-baselines on the first frame, on an epoch reset, and on a stale tick (HIT_FRESH_TICKS, render/impactModel.ts:L14). The helper is pure and tested.

## R1-F12 [P3]: DuelUiView field shape and a name collision

Confirmed (views.ts:L13-24). The field is now `ownShip?: … | null`, the tile index is renamed `k` and the grid width `gw`.

## Also changed

- Grid height named as `d.interior.derived.height` (sim/ship/derived.ts:L7).

## Files changed

- docs/superpowers/specs/2026-11-18-own-ship-window-design.md

<!-- end -->
