# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `0e0e0609`. 2 accepted, 0 rejected, 0 deferred; all 12 round-1 IDs confirmed resolved.

## R2-F1 [P3]: avoid gated differently from the window

Confirmed: scene.ts:L176 `onConsole` ignores the seat, while L179 `onMap` does not. §3 now says the scene passes `avoid` exactly when it builds `ownShip` (`onMap`). The §6 scene test covers seated-on-SHIP, seated-on-map and standing-on-map.

## R2-F2 [P3]: on-screen object in A's margin band gets an arrow

Confirmed against tacticalModel.ts:L258. §3 now tests the on-screen point against the ungrown `avoid`, so an object in the margin band is visible and gets no arrow. The grown `A` is still used for edgePoint's point.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-own-ship-window-design.md

<!-- end -->
