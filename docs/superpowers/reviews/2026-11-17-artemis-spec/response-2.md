# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `7e3e683`. 3 new accepted, 2 reopened fixed again, 0 rejected. R1-F1–F4, F6, F7 and F9–F12 confirmed resolved.

## R1-F5 [P1]: Predicted path, flame, telemetry and scripted prediction read held W/S

Confirmed: 'wanted' was circular. scripted.ts L92-93 calls hazardAway before it decides. §5.5 now predicts with `{ turn: pair.axes.turn, thrust: throttleThrust(d.throttle) }`.

## R1-F8 [P2]: Admission and module placement

Confirmed. snapshot.ts L128-145 uses fixed offsets. §5.1 now names `helmAt = roundAt + 4; interiorAt = helmAt + 1` and the integer range check. §8 adds the rejection cases.

## R2-F1 [P1]: The wire step was dropped

Confirmed. codec.ts L110-121 is a closed strict list. §5.2 restores a Wire paragraph: contracts plus codec with `z.number().finite()`, so a bad level is answered `malformed` by the sim. It lands in step 1. §8 adds a codec round trip.

## R2-F2 [P2]: clear() empties the physical keyboard; auto-repeat counts as fireDown

Confirmed. input.ts L48-53 adds repeats to held. §6.2 splits `clear()` (Tab, restart and blur, as today) from `clearUi()` (console change). A repeat keydown never counts a fireDown. §7 and §8 are updated.

## R2-F3 [P3]: HeldFlags undefined

Confirmed. §6.1 defines it inline as new in app/duel/input.ts.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-17-artemis-consoles-design.md

<!-- end -->
