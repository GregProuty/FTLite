# Round 1 response (spec revised)

Reviewed `round-1.json` against `5aaa8b7`. 10 accepted, 0 rejected, 0 deferred.

All ten were confirmed by computing the constraints with a script (point in polygon, proper segment crossings, convexity, simple polygon, max radius, room area, hatch line counts at zoom 0.5 over 16 lattice offsets). The revised coordinates in section 1 pass every constraint; the numbers are recorded in the spec.

## R1-F1 [P1]: Hound Weapons room outside the nose

Confirmed. New room 1.1,-0.12 .. 0.5,-0.26 (6 vertices), inside.

## R1-F2 [P1]: Scout fork radius

Confirmed both options failed. Tips now (1.23,±0.17), inner fork (1.19,±0.09); max radius 1.242 under 1.25 (ENEMY_RING − 0.1, per R1-F10).

## R1-F3 [P1]: Scout rooms too small for the hatch

Confirmed (the wedge averaged 1.8 to 3.0 hatch lines per room at zoom 0.5; the new rooms 1.2 to 1.7). Rooms enlarged to at least 0.2 square units (tested), and a damaged room now gets a tone fill (mid on the crew, dim on the enemy), so damage reads as a patch regardless of hatch count.

## R1-F4 [P2]: Edge crossing

Confirmed. The constraint and test now include proper edge crossings; the Hound Shields room clears the notches.

## R1-F5 [P2]: Damage states

Accepted; section 2 has the full table.

## R1-F6 [P2]: Zoom 2

Confirmed ZOOM_MAX 1.2; changed.

## R1-F7 [P2]: hull consumers

Accepted as proposed.

## R1-F8 [P3]: Vertex count

Confirmed; 25.

## R1-F9 [P3]: 1-unit

Changed to 1 px.

## R1-F10 [P3]: Axis mapping and ring limit

Accepted; ENEMY_RING moves to hullModel and tacticalLayer re-exports it; margin 0.1.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-17-hull-silhouettes-design.md

<!-- end -->
