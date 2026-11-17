# Round 2 response (spec revised)

Reviewed `round-2.json` against `47a709e`. 3 accepted (one in part), 0 rejected, 0 deferred.

## R2-F1 [P1]: The damage table changes the CRT rules

Accepted in part. Level 2 now matches the CRT spec exactly: crew phase 1 is solid hot with no hatch, and enemy phase 1 is hollow glass with a main hatch. The level-1 tone fill stays, written as a deliberate, justified deviation from the CRT spec. A note on the brief's fixed decision 'the CRT map's colour roles, blinks and hatch rules stay as they are': the controller wrote it as a scope guard. The owner did not set it, and the owner's look gate judges the tone fill. Option (a) is not reachable with geometry alone. Inside these two outlines, the largest convex rooms that clear the notches and fork average 1.2 to 1.7 hatch lines at zoom 0.5. The minimum is 1, because the hatch is screen-anchored and the ship moves across it. The wedge reached 2 only because its segments were the whole silhouette.

## R1-F3 [P1]: Hatch readability (reopened)

Fixed as described above. The tone fill carries level 1. The default-zoom screenshot is now an explicit pass/fail check, with one shot per blink phase.

## R2-F2 [P3]: Missing import

Confirmed (tacticalModel.test.ts:L6). It is now listed.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-17-hull-silhouettes-design.md

<!-- end -->
