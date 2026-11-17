# Ledger: hull-silhouettes-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The Hound's Weapons room pokes out through the nose: its two fore corners are outside the outline | resolved | 0 | Hound Weapons room redrawn inside the nose (fore edge 1.1, ±0.12/0.14); all rooms recomputed; confirmed R2 |
| R1-F2 | P1 | Neither of the two offered fixes for the scout's fork tips meets the 1.30 limit, and the choice is left to the plan | resolved | 0 | scout fork tips set to (1.23,±0.17), inner (1.19,±0.09); max radius 1.242 under the 1.25 limit; no either/or; confirmed R2 |
| R1-F3 | P1 | At the default zoom, the scout's rooms are too small for a level-1 hatch to read | fixed:R2 | 1 | no layout inside these outlines reaches 2 hatch lines everywhere; tone fill carries level 1 (stated deviation); the default-zoom screenshot is now an explicit pass/fail check per blink phase |
| R1-F4 | P2 | Checking only room vertices misses rooms that cross the outline; the Hound's Shields room overhangs both notches | resolved | 0 | constraint now vertices inside AND no proper edge crossing; Hound Shields fore edge 0.4 ±0.32 clears the notches; confirmed R2 |
| R1-F5 | P2 | The room's fill and stroke for each damage state is not pinned down | resolved | 0 | section 2 table: fill, stroke, hatch per ship, level and phase; confirmed R2 |
| R1-F6 | P2 | The screenshot acceptance asks for zoom 2, but the camera clamps zoom to 1.2 | resolved | 0 | screenshot at ZOOM_MAX 1.2; confirmed R2 |
| R1-F7 | P2 | The ShipDraw.hull consumers are not listed, and it is not said which field sets the shape and which the colour | resolved | 0 | hull required; shape from HULLS[s.hull], colours from s.crew; consumers listed with lines; confirmed R2 |
| R1-F8 | P3 | The scout's stated vertex count (26) does not match the 25 listed | resolved | 0 | 25 vertices; confirmed R2 |
| R1-F9 | P3 | '1-unit stroke' can be read as one ship unit | resolved | 0 | 1 px everywhere; confirmed R2 |
| R1-F10 | P3 | The trace's axis mapping is not written down, and the ring limit's source and margin are left implicit | resolved | 0 | axis mapping written (f = image x, s = image y); ENEMY_RING moves to hullModel, limit ENEMY_RING-0.1; confirmed R2 |
| R2-F1 | P1 | The new damage table changes the CRT map's fixed room-damage rules without the owner's sign-off | fixed:R2 | 0 | level 2 restored to the CRT rules exactly; the level-1 tone fill kept as a stated, justified deviation (the 'fixed decision' was controller-authored, not the owner's) |
| R2-F2 | P3 | The tacticalModel.test import of wedgeSegments is not in the consumer list | fixed:R2 | 0 | L6 import listed |
