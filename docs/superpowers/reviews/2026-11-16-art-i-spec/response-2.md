# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `57f03ea`. 2 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F4 and R1-F6 to R1-F12 as resolved; R1-F5 was reopened.

## R1-F5 [P1]: Procedural walls and doors are off the art-pixel grid (reopened)

Confirmed. The new evidence holds: doorModel.ts:L23-24 computes `w = HALF * (1 - p)` and places the panel at `T - w`, so the width is continuous mid-slide, and the stripes start at `r.x + 4` (L34). Section 4 now quantises the slide to `w = 2 × round(HALF × (1 − p) / 2)` and puts the stripes at even offsets. The test sweeps progress from 0 to 1 in steps of 0.01 for each look and both slides.

## R2-F1 [P2]: The palette role list does not cover the door and effects colours

Confirmed. doorModel.ts:L5 holds SEALED_FILL, HELD_TICK and SPACE_GAP, and effects.ts has colour literals at L13, L15, L70, L79, L94, L103 and L116. Section 4 now:
- adds the roles lowO2, impact, doorSealed, heldTick, spaceGap, fireFallback, breach, airlockOutline, ventSpeck and failed;
- states that no `0x` literal stays in tiles.ts, doorModel.ts, wallModel.ts or effects.ts, enforced by a grep test;
- extends the even-grid rule and its tests to the effects shapes (the airlock outline becomes a 2-unit stroke).

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md

<!-- end -->
