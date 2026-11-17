# Codex review exchange: hull-silhouettes-spec

Subject: `docs/superpowers/specs/2026-11-17-hull-silhouettes-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 5aaa8b7, effort high, 312 s, 585235 in / 503458 cached / 31715 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The Hound's Weapons room pokes out through the nose: its two fore corners are outside the outline
The Weapons room's fore corners (1.12, -0.2) and (1.12, 0.2) lie outside the Hound outline. That breaks the spec's own constraint that every room vertex is inside, so the unit test it asks for would fail as written. · spec L39 gives the room as 1.12,-0.2, 1.12,0.2, 0.62,0.22, 0.62,-0.22. spec L35 gives the nose vertices (1.018,-0.282), (1.18,-0.121), (1.15,0.151) and (0.998,0.282). At f = 1.12 the -s edge (1.018,-0.282)->(1.18,-0.121) is at s = -0.282 + 0.630*0.161 = -0.181. The +s edge (1.15,0.151)->(0.998,0.282) is at s = 0.151 + 0.197*0.131 = 0.177. So the inside at f = 1.12 is only s in (-0.181, 0.177). A +f ray from (1.12, 0.2) crosses no edge, so the point is outside. The same holds for (1.12, -0.2). The room clears the outline at s = ±0.2 only up to f ≈ 1.09 to 1.10. The spec's constraint is at L27. · The constraint test fails as written. If the coordinates are used as given, the room's stroke and hatch draw past the nose of the crew's ship. · Move the fore edge to 1.06,-0.2, 1.06,0.2. At f = 1.06 the inside is (-0.240, 0.229). Or keep 1.12 and narrow it to ±0.16. Either way, put the final coordinates in the spec.

### [P1] R1-F2 Neither of the two offered fixes for the scout's fork tips meets the 1.30 limit, and the choice is left to the plan
Section 1 says the scout breaks the 1.30 limit. It lets the plan either scale the scout by 0.95 or move the fork tips in to 1.28. Neither works. Scaling by 0.95 leaves the tips at 1.302. Moving only the tips to f = 1.28 leaves the next vertices, (1.32, ±0.09), at radius 1.323. Two implementers could also pick different options and get different silhouettes. · spec L28 sets the limit at 1.30. spec L47 lists the vertices (1.32,0.09) and (1.36,0.17), with their mirrors on L49. spec L55 gives the two options. |(1.36,0.17)| = sqrt(1.8496+0.0289) = 1.3706, and 0.95 × 1.3706 = 1.3021 > 1.30. |(1.28,0.17)| = 1.291 passes, but |(1.32,0.09)| = sqrt(1.7424+0.0081) = 1.3231 > 1.30. That vertex would also sit ahead of the moved tip and change the fork's shape. · Both of the spec's options fail its own test. The subagent executing the plan would have to invent the geometry. The scout's look is part of the owner's gate. · Put the final scout coordinates in the spec and delete L55's either/or. Two options that pass: scale the whole scout (outline and rooms) by 0.94, which puts the tips at 1.288. Or set the tips to (1.27, ±0.17) and the inner fork to (1.23, ±0.09), at radii 1.281 and 1.233. The fork's root at (0.92, 0) and (0.86, ±0.24) stays as it is.

### [P1] R1-F3 At the default zoom, the scout's rooms are too small for a level-1 hatch to read
Both consoles open at zoom 0.5, so a ship unit is 10 px. At that size the scout's Weapons room is about 2.4 × 3.2 to 4 px, and its Engines spine is 1.8 to 2.4 px wide. The hatch is 1 px lines every 4 px at 45°. The Weapons room spans only about 4.2 px across the hatch direction, so level 1 shows one, at most two, ticks of 2 to 3 px inside 1 px room strokes. The wedge's Weapons triangle at the same zoom spanned about 9.8 px across the hatch (2 to 3 lines). · spec L50 (Weapons 0.86,±0.16 / 0.62,±0.2) and L52 (Engines -0.3,±0.12 / -0.96,±0.09). camera.ts:L5 sets ZOOM_DEFAULT = 0.5 and runtime.ts:L226 and L233 call createCamera() at that default. tuning.ts:L38 SHIP_RADIUS = 20. tacticalLayer.ts:L117 k = SHIP_RADIUS*scale and L132 draws the hatch with HATCH_SPACING. The CRT spec L43 sets the hatch at every 4 px. Screen-space hatch-normal extent of the scout's Weapons room at angle 0: c from -7.21 to -2.97, so 4.24 px. · The CRT spec makes the hatch the only way level-1 enemy damage shows on the map, and the spec's goal (L9) says damage keeps working per room. Default zoom is where most play happens. · Make the scout's rooms bigger. For example, a Weapons room that covers the fork's root and the front of the disc (about f 0.5 to 0.9, s ±0.24), with Shields shifted aft to match, and an Engines spine at least ±0.16. Add a testable rule: at k = 10 (zoom 0.5), hatchSegments on every room of both hulls, in screen space, gives at least 2 segments. Add the default-zoom level-1 screenshot of both ships, which L85 already lists, as an explicit pass/fail check.

### [P2] R1-F4 Checking only room vertices misses rooms that cross the outline; the Hound's Shields room overhangs both notches
The containment test checks only that each room vertex is inside the outline. The Hound outline is concave, so a convex room can have every vertex inside and still cross it. The Shields room's side edges pass outside the two notches at outline vertices (0.424,-0.333) and (0.413,0.343). · spec L27 ('each vertex is inside by a point-in-polygon test'). spec L40 gives Shields as 0.5,±0.36 / -0.02,±0.4. spec L34 has notch vertex 5 at (0.424,-0.333) and L36 has vertex 21 at (0.413,0.343). At f = 0.424 the room's -s edge is at s = -0.366, while the outline pinches in to -0.333. At f = 0.413 the +s edge is at 0.367 against the outline's 0.343. All four Shields vertices pass the point-in-polygon test, for example (0.5,-0.36) with one crossing at the edge (0.474,-0.434)->(0.524,-0.454). · The room's stroke and hatch visibly cross the hull's edge on both sides of the crew's ship, and the specified test would still pass. · Make the rule that every room vertex is inside AND no room edge properly crosses an outline edge, and test both. Narrow the Hound's Shields room to clear the notches, for example a fore edge at f = 0.38 with s ±0.33, keeping the aft edge at -0.02, ±0.4.

### [P2] R1-F5 The room's fill and stroke for each damage state is not pinned down
Section 2 adds a new room stroke (`glass` on the crew, `mid` on the enemy) on top of the outline. The damage bullets still read as the wedge's per-segment fill and stroke. The spec does not say whether undamaged rooms are filled, whether the enemy's level-2 'main outline' replaces the room's `mid` stroke, or what stroke the solid `hot` phases use. Today the solid `hot` phases use a `glass` stroke. · spec L63-L68. tacticalLayer.ts:L124-L133 shows today's per-segment combinations: crew level ≥2 phase 0 is a glass fill with a hot stroke, otherwise a hot fill with a glass stroke; enemy level ≥2 phase 0 is a hot fill with a glass stroke, otherwise a glass fill with a main stroke plus a hatch. · Two implementers would draw different strokes. The look is the owner's gate, and the CRT spec requires the enemy to read hollow with a main outline (CRT spec L35). · Add a table with rows for crew and enemy at level 0, level 1, and level 2 in phase 0 and phase 1, and columns for the room's fill, the room's stroke and the hatch colour. For example: crew level 0 has no fill and a glass stroke; enemy level 0 has no fill and a mid stroke; enemy level 2 phase 1 has a glass fill, a main stroke and a main hatch.

### [P2] R1-F6 The screenshot acceptance asks for zoom 2, but the camera clamps zoom to 1.2
The gate asks for 'one close zoom (zoom 2) on both ships'. The camera cannot reach zoom 2. · spec L88. camera.ts:L5 ZOOM_MAX = 1.2; camera.ts:L27 and L31 clampZoom in createCamera and zoomBy. · The acceptance criterion cannot be met as written. The harness either quietly gets 1.2 or someone edits ZOOM_MAX, and that would break the presentation-only scope. · Change it to 'zoom 1.2 (ZOOM_MAX)'.

### [P2] R1-F7 The ShipDraw.hull consumers are not listed, and it is not said which field sets the shape and which the colour
The spec adds `hull` to ShipDraw, but the CRT colour test builds ShipDraw literals by hand. Its enemy ship would have no hull, or the wrong one. ShipDraw already has `crew`, so a draw could carry crew:true with hull:'scout'. The spec does not say whether drawShip takes the shape from `s.hull` and the colours from `s.crew`. The wedge's test consumers are only covered by 'its tests move to the hulls'. · spec L61 and L57. tests/crtColours.test.ts:L14 (the ship() helper has no hull field) and L23 (the enemy fixture is crew:false). Other consumers: tests/dashModel.test.ts:L3 and L41-L43 (wedgeSegments convexity), tests/tacticalModel.test.ts:L6 and L170, tests/duelWeaponsView.test.ts:L13 and L108-L109 (segmentCentre(0)), weaponsModel.ts:L13, L48-L53 and L75, tacticalLayer.ts:L14 and L118. · A subagent working task by task may not see the hand-built fixture. drawShip would then read HULLS[undefined], or draw the enemy as a Hound, and the 'both hulls' colour test (L82) would not actually test the scout. · Make `hull` required. drawShip takes the shape from HULLS[s.hull] and the colours from s.crew. combatModel uses roomCentre(hullFor(false), room) for the lock. List each file and line above with its replacement: in crtColours, the ship() default gets hull:'hound' and the enemy fixtures (L23, indices 1 and 3) get hull:'scout'. dashModel.test loops over HULLS rooms. tacticalModel.test L170 checks that HULLS[h].rooms has length 3. duelWeaponsView L108 uses roomCentre('scout', 0).

### [P3] R1-F8 The scout's stated vertex count (26) does not match the 25 listed
The heading says 26 vertices, but the outline lists 25: one vertex on the axis, (0.92, 0), plus 12 mirrored pairs. · spec L44 says 26. spec L47-L49 list 10 + 9 + 6 = 25 vertices. The Hound's 43 (L31, L34-L38) does match. · A test or plan step that asserts 26 would fail, or someone would add a vertex to make the count fit. · Change L44 to 25 vertices (one on the axis and 12 mirrored pairs).

### [P3] R1-F9 '1-unit stroke' can be read as one ship unit
L20 defines 'ship units' as SHIP_RADIUS*zoom px. L63-L64 then ask for '1-unit' strokes, which could mean 20 px at zoom 1. The code uses width 1 px. · spec L20, L63, L64. tacticalLayer.ts:L124-L131 uses width: 1. · It is a small chance of misreading, but plan subagents take the spec literally. · Write '1 px' in section 2.

### [P3] R1-F10 The trace's axis mapping is not written down, and the ring limit's source and margin are left implicit
L31 lists the trace steps but not the axis mapping, which for a y-down image with the nose at +x should be f = +x and s = +y. The Hound is asymmetric, so getting this wrong mirrors it. Separately, ENEMY_RING lives in the Pixi module tacticalLayer.ts, so a pure hullModel, or its test, would have to import Pixi to 'measure against ENEMY_RING'. The 0.05 margin is 1 px at zoom 1 and 0.5 px at zoom 0.5, about half a stroke. · spec L28 and L31. tacticalLayer.ts:L7 imports pixi.js and L25 holds ENEMY_RING. tacticalLayer.ts:L109 and L120 map +side to the ship's starboard (screen +x when the heading is north). · Without the mapping, a re-trace cannot be reproduced. The import would pull Pixi into a pure module, and at that margin the ring would visibly touch the fork tips. · Add 'f = image x, s = image y (y down), so +s is starboard'. Move ENEMY_RING into a pure module (crtTheme.ts or hullModel.ts) and have tacticalLayer re-export it. Consider a margin of 0.1.

## Verified
- Convexity, computed by hand for all six rooms (spec L39-L41, L50-L52): every room is a trapezoid or rectangle with its vertices in boundary order, so dashModel.ts:L40-L52 isConvex returns true.
- Every scout room vertex is inside the scout outline by ray casting. Examples: (0.86,0.16) crosses the edge (1.32,0.09)->(1.36,0.17) once; at f = -0.96 the spine's boundary is s = 0.499 on edge (-0.62,0.14)->(-0.98,0.52).
- The Hound's Engines vertices (-0.75,±0.3) are inside, each with one crossing, on edges (-0.847,-0.141)->(-0.817,-0.323) and (-1.089,0.333)->(-0.827,0.292). The aft core boundary is at f ≈ -0.83, aft of the room. The Shields and Weapons aft vertices (0.62,±0.22) are inside too.
- The Hound's largest outline radius is 1.294, at (-1.139,-0.615); next are (-1.19,-0.504) at 1.292 and (-1.2,0.474) at 1.290. That is under 1.55, and under 1.30. Its f range is -1.2 to 1.18 (length 2.38) and its s range -0.847 to 0.827, matching L31's 2.4 and about 0.85. It has 43 vertices as stated.
- The scout's largest radius is 1.3706 at (1.36,±0.17), as L55 says. Its outline is mirror-symmetric pair for pair (L47-L49).
- Side sign: tacticalLayer.ts:L109 and L120 map (f, side) to screen as fx*f + rx*side, with rx = -fy, so at heading north +f is up and +side is screen right, the ship's starboard. A y-down painting with the nose at +x has starboard at +y, so s = +image y draws unmirrored.
- Lock: weaponsModel.ts:L75-L77 sets the label x at enemyS.x + max(14, 1.6k) + 6. That clears the scout's ≤ 1.30k extent once the limit holds. The scout's room centres are Weapons (0.74, 0) and Engines (-0.63, 0), so duelWeaponsView.test.ts:L109 (y = 360) and L113 (x < 640) still hold with roomCentre('scout', …).
- The Helm heading line and thrust flame start 1.3k + 4 px from the centre (tacticalModel.ts:L268, tacticalLayer.ts:L226-L228). That clears the Hound's nose at 1.18 and its nacelles at -1.2.
- Shield rings at 1.6k and above (tacticalLayer.ts:L137) clear both hulls (Hound at 1.294; scout ≤ 1.30 once fixed). The ENEMY_RING value of 1.35 matches tacticalLayer.ts:L25.
- Chevron path unchanged: tacticalModel.ts:L260 computes the chevron flag as 2*SHIP_RADIUS*z < SHIP_CHEVRON_PX, tacticalLayer.ts:L110-L115 draws the chevron, and SHIP_RADIUS = 20 (tuning.ts:L38). The spec touches no sim file.
- Consumers: grep over src and tests finds wedgeSegments, WEDGE_*, segmentCentre and ShipDraw only at the lines listed in the ShipDraw consumers finding, and no other hand-built ShipDraw literals.
- The colours section 2 names (hot, glass, main, mid) are all in the CRT ramp (CRT spec L24).

## Not verified
- Full pairwise self-intersection check of the 43-vertex Hound outline: no shell was available (only Read, Grep and Glob), so I inspected the notch and flap regions by hand (vertices 4-12, 15-21, 32-36) but did not test all edge pairs. The 25-vertex scout outline was checked by hand around the fork and the fins.
- Whether the Hound coordinates were made with s = +image y, and whether they match the painting. The painting is not in git by design.
- Whether the drone scout is clearly original and unlike FTL's Auto-Scout. That is the owner's gate.
- The run dir's ledger.md does not exist (Read returned file not found). I read the spec from the worktree's HEAD (5aaa8b7), whose two commits after 9c9e5a5 are labelled as brief refinements; I did not diff the spec between the two.
- Beyond the manifest I read camera.ts (ZOOM_DEFAULT and ZOOM_MAX), grepped runtime.ts and onlineSource.ts for createCamera, and grepped tuning.ts for SHIP_RADIUS, all for the zoom and readability findings. crtTheme.ts was not opened; HATCH_SPACING 4 is taken from the CRT spec L43 and L48.

---

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

---

