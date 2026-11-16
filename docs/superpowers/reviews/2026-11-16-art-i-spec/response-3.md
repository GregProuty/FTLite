# Round 3 response (spec revised)

Reviewed `round-3.json` against the subject at `1e285dc`. 2 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F5 and R2-F1 as resolved.

## R3-F1 [P2]: The 2-unit airlock outline at offset −2 lands on odd world units

Confirmed. effects.ts:L94 strokes with no alignment, while tiles.ts:L43 sets `alignment: 1` explicitly. Section 4 now specifies alignment 1 (inside) on the rectangle at offset −2, so the stroke paints −2..0, and the test checks the painted band rather than the path.

## R3-F2 [P3]: The door seam is off the grid and the effects have no helpers

Confirmed. doorModel.ts:L31 has the seam at x = HALF − 1, and effects.ts draws every shape inline. Section 4 puts the seam 2 wide at x = HALF, names the pure helpers the plan extracts (fireFallbackRect, breachRect, ventSpeckRect, failedRect, airlockOutlineBand), and rounds the vent speck centre to an even world unit.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md

<!-- end -->
