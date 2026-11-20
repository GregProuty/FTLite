# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `1ac33856`. 1 accepted, 0 rejected, 0 deferred. The reviewer confirmed all eight round 1 fixes as resolved (R1-F1 to R1-F8); the verdict is "ready with P2s".

## R2-F1 [P2]: The 'blip' edge arrow's label and distance do not fit the existing arrow() helper as the spec says they do

Confirmed: `tacticalModel.ts` L583-L584 sets every arrow's `distance` to the exact rounded length and its label to the name and that number, `ARROW_NAMES` (L423) is a record over `ArrowTarget`, and the layer's `arrowGlyph` (`tacticalLayer.ts` L180-L186) fills by target with no blip case. §3 now says: `ARROW_NAMES` gains `blip: 'BLIP'`; for `'blip'` the helper sets `distance` to the nearest 100 and the label to `BLIP ~<distance>`; `arrowGlyph` gets its own hollow `CRT.mid` case at the ping's alpha. It also ties the `?` to the same off-screen test the arrow uses, so a centre gets one or the other (the reviewer's second not-verified item).

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-19-sensors-blip-design.md

<!-- end -->
