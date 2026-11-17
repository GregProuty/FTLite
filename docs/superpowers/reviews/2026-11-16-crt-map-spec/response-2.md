# Round 2 response (spec revised)

Reviewed `round-2.json` against `ab55938`. 5 accepted (R1-F5 and R1-F6 reopened, plus R2-F1 to R2-F3), 0 rejected, 0 deferred.

## R1-F5 [P1]: The bezel still clips grid labels (reopened)

Confirmed (tacticalModel.ts:L161-L170, labels at 4). The bezel is now 3 internal px, and the containment test covers the Pixi labels too.

## R1-F6 [P2]: Text and compass colours unmapped (reopened)

Confirmed (tacticalLayer.ts:L56-L60, L152-L153, L175-L176, L204). Added the text and compass roles.

## R2-F1 [P2]: Dash geometry undefined

Confirmed. Added dashModel.ts with screen-pixel lengths, convex clipping and reused arrays, all tested.

## R2-F2 [P2]: Readout emphasis targets rows that never appear

Confirmed (readoutModel.ts:L71-L83, L58, L66). Under CRT, alert applies only to own low hull; the interior-only rows keep their tints; good maps to hot, including enemy low hull.

## R2-F3 [P2]: Blink off-phase undefined

Confirmed. Every blink alternates between two visible states, defined as a square wave, with the pair given for each element.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-17-crt-map-design.md

<!-- end -->
