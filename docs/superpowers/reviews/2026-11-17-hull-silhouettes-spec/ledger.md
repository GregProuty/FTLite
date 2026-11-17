# Ledger: hull-silhouettes-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The Hound's Weapons room pokes out through the nose: its two fore corners are outside the outline | fixed:R1 | 0 | Hound Weapons room redrawn inside the nose (fore edge 1.1, ±0.12/0.14); all rooms recomputed |
| R1-F2 | P1 | Neither of the two offered fixes for the scout's fork tips meets the 1.30 limit, and the choice is left to the plan | fixed:R1 | 0 | scout fork tips set to (1.23,±0.17), inner (1.19,±0.09); max radius 1.242 under the 1.25 limit; no either/or |
| R1-F3 | P1 | At the default zoom, the scout's rooms are too small for a level-1 hatch to read | fixed:R1 | 0 | rooms enlarged (area >= 0.2 units, tested) and damaged rooms get a tone fill so small rooms read |
| R1-F4 | P2 | Checking only room vertices misses rooms that cross the outline; the Hound's Shields room overhangs both notches | fixed:R1 | 0 | constraint now vertices inside AND no proper edge crossing; Hound Shields fore edge 0.4 ±0.32 clears the notches |
| R1-F5 | P2 | The room's fill and stroke for each damage state is not pinned down | fixed:R1 | 0 | section 2 table: fill, stroke, hatch per ship, level and phase |
| R1-F6 | P2 | The screenshot acceptance asks for zoom 2, but the camera clamps zoom to 1.2 | fixed:R1 | 0 | screenshot at ZOOM_MAX 1.2 |
| R1-F7 | P2 | The ShipDraw.hull consumers are not listed, and it is not said which field sets the shape and which the colour | fixed:R1 | 0 | hull required; shape from HULLS[s.hull], colours from s.crew; consumers listed with lines |
| R1-F8 | P3 | The scout's stated vertex count (26) does not match the 25 listed | fixed:R1 | 0 | 25 vertices |
| R1-F9 | P3 | '1-unit stroke' can be read as one ship unit | fixed:R1 | 0 | 1 px everywhere |
| R1-F10 | P3 | The trace's axis mapping is not written down, and the ring limit's source and margin are left implicit | fixed:R1 | 0 | axis mapping written (f = image x, s = image y); ENEMY_RING moves to hullModel, limit ENEMY_RING-0.1 |
