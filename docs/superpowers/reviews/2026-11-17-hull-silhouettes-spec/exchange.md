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

# Round 2 (delta, reviewing 47a709e, effort medium, 127 s, 189747 in / 147675 cached / 13529 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 The new damage table changes the CRT map's fixed room-damage rules without the owner's sign-off
The section 2 table does more than pin today's looks. It adds a level-1 tone fill on both ships, `mid` on the crew and `dim` on the enemy. It also changes crew level 2 phase 1 from plain solid `hot` to a `mid` fill with a `glass` hatch, and it fills enemy level 2 phase 1 `dim` where the CRT spec keeps it hollow. These are changes to the CRT map's damage and hatch rules, which are a fixed decision. L117 calls the tone fill "new" but cites no owner approval. · spec L104 (crew level 1: `mid` fill), L106 (crew level 2 phase 1: `mid` fill + `glass` hatch), L108 and L110 (enemy level 1 and level 2 phase 1: `dim` fill), L117 ('The level-1 tone fill ... is new'). CRT spec L41: own ship level 1 is a `glass` hatch, and level 2 alternates a `glass` cut-out and `hot`. CRT spec L42 and L35: the enemy is hollow ('a `main` outline, `glass` inside'), level 1 is a `main` hatch, and level 2 alternates solid `hot` and a `main` outline with a `main` hatch. Today's code matches the CRT spec: tacticalLayer.ts:L124-L126 (crew level 2 'else' branch is a `hot` fill, hatch only at level 1) and L131-L132 (enemy 'else' branch is a `glass` fill). · 'The CRT map's colour roles, blinks and hatch rules stay as they are' is an owner-fixed decision. The plan's subagents would build a damage look that departs from the approved CRT spec. The owner's look gate would then be judging a rule change nobody signed off. The enemy's 'hollow' read (CRT L35) also weakens when its damaged rooms are filled. · Choose one and write it into the spec. (a) Keep the CRT rules exactly: no tone fill, crew level 2 phase 1 solid `hot`, enemy level 1 and level 2 phase 1 `glass` inside. Then meet R1-F3 with room geometry alone, using the hatch-count rule R1-F3 proposed (at least 2 hatch segments per room at k = 10). (b) Get the owner's explicit approval of the tone fill, cite it with its date in the spec, and list the amendment to CRT spec L41-L42 so both specs agree.

### [P3] R2-F2 The tacticalModel.test import of wedgeSegments is not in the consumer list
The 'What it replaces' list cites tests/tacticalModel.test.ts L170 only. The same file also imports `wedgeSegments` at L6. Once the wedge is deleted, that import breaks the build. · spec L86. tests/tacticalModel.test.ts:L6 (`tacticalModel, wedgeSegments, type PrevBody, ...`) and L170. · A subagent working task by task from the list could leave the import in place. The failure is obvious, but it costs a cycle. · Change L86 to 'tests/tacticalModel.test.ts L6 (import) and L170'.

## Prior findings
- R1-F1: resolved — The Hound's Weapons room (1.1,-0.12 / 1.1,0.14 / 0.96,±0.26 / 0.5,±0.26) is inside the nose. At f = 1.1 the outline spans s -0.2005..0.194. At f = 0.96 it spans -0.288..0.283. No edge crosses. The area is 0.294.
- R1-F2: resolved — The tips (1.23,±0.17) have radius 1.2417 and the inner fork (1.19,±0.09) 1.193. Both are under 1.25. The either/or is gone. The fork edges and the fin edges do not cross, so the outline is simple.
- R1-F3: still open — The rooms meet the 0.2 area floor, but the hatch still covers about 1 to 2 lines per room at zoom 0.5. The scout's Weapons room spans 0.98 units in (f+s), which is about 6.9 px across the hatch at k = 10. The Hound's Weapons room spans about 7.1 px. The responder's own numbers are 1.2 to 1.7 lines. Damage reads only because of the new tone fill, and that fill breaks the fixed CRT rules (see the new P1). No hatch-count test was added, and the default-zoom screenshot is still not an explicit pass/fail check (spec L132).
- R1-F4: resolved — The constraint now requires vertices inside AND no proper edge crossing (L43). The Hound's Shields room has fore edge 0.4,±0.32. The outline there is at -0.372 and 0.3635, and the side edges stay inside the notch edges at (0.424,-0.333) and (0.413,0.343).
- R1-F5: resolved — The fill, stroke and hatch are now pinned for every ship, level and phase (L101-L110). What the table says is raised as a new P1.
- R1-F6: resolved — L135 now says ZOOM_MAX (1.2).
- R1-F7: resolved — `hull` is required. The shape comes from HULLS[s.hull] and the colours from s.crew. The crtColours fixtures get hull values (L92). The consumers are listed (L83-L88), apart from one import line, raised as a new P3.
- R1-F8: resolved — L69 says 25 (one vertex on the axis and 12 pairs), which matches L72-L74.
- R1-F9: resolved — L95 and L99 now say 1 px.
- R1-F10: resolved — L55 sets f = image x and s = image y, and L33 makes +s starboard. ENEMY_RING moves to hullModel and tacticalLayer re-exports it (L39). The margin is 0.1 (L46). No other module imports ENEMY_RING (grep).

## Verified
- Hound max vertex radius is 1.294, at (-1.139,-0.615). This is under the 1.55 limit and under the 1.3 the label line relies on (spec L67, L121).
- Scout max radius is 1.2417, at (1.23,±0.17). (-1.12,±0.5) is 1.227. Both are under 1.25 (spec L46, L79).
- Hound Shields: vertices are inside and no edge crosses. The outline is at ±0.37/0.36 at f = 0.4. Area is 0.331 (spec L64).
- Hound Engines: (-0.8,±0.28) is inside the aft inner edge (-0.847,-0.141)->(-0.817,-0.323), which is at f = -0.824 for s = -0.28. Area is 0.358 (spec L65).
- Scout Weapons: (0.88,±0.2) is inside, with the outline at 0.236. (0.46,±0.36) is inside, with the outline at 0.52. No edge crosses the fork edge (1.23,0.17)->(0.86,0.24). Area is 0.235 (spec L75).
- Scout Shields: (-0.06,±0.4) is inside the outline, which is at 0.416 there. No edge crosses. Area is 0.344 (spec L76).
- Scout Engines: the ±0.18 spine clears the outline, which is at 0.2 to 0.22 over f -0.24..-0.62. The aft edge -0.94 is fore of the fin root at -0.98. Area is 0.274 (spec L77).
- No rooms overlap on either hull. All six rooms are convex.
- The consumers of the wedge, segmentCentre and ENEMY_RING (grep over src and tests) match the list at spec L83-L88, apart from tacticalModel.test.ts:L6.
- The lock label offset max(14, k·1.6)+6 px is at least 1.85 units, which clears both hulls (weaponsModel.ts:L77, spec L121).

## Not verified
- Exact hatch segment counts from hatchSegments at every lattice offset and ship heading. I had no script runner, so I estimated the counts from the 45° extent at k = 10.
- Whether the Hound outline faithfully traces the painting. The painting is not in git.
- The visual effect of the thin margins between rooms and outlines: about 0.016 units (0.16 px at zoom 0.5) at the scout Shields aft corners, and 0.023 at the Hound Weapons corner (0.96,0.26). The room and outline strokes may merge there. This is left to the screenshots and the owner's gate.

---

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

---

# Round 3 (delta, reviewing 18e366f, effort medium, 46 s, 85379 in / 66562 cached / 4484 out)

Verdict: changes requested

## Findings

### [P1] R3-F1 The new per-phase pass/fail screenshot check cannot pass: crew level 2 phase 1 is identical to an undamaged crew room by design
The default-zoom check requires that in each blink phase, every damaged room on both ships can be told apart from an undamaged one. The restored level-2 row gives crew level 2 phase 1 a solid `hot` fill with a `glass` stroke and no hatch. Crew level 0 is no fill over the `hot` outline with a `glass` stroke and no hatch. Those two look exactly the same. So the phase-1 crew shot fails the check every time. This is the CRT rule: the blink itself is the signal. The check's wording contradicts the table. · spec L132 ('every damaged room on both ships must be told apart from an undamaged one ... in both blink phases (take one shot per phase)'); spec L103 (crew 0: none / `glass` / none) and L106 (crew 2 phase 1: `hot` solid / `glass` / none), drawn over the L95 `hot`-filled outline. CRT spec L41 (level 2 alternates a `glass` cut-out and `hot`). tacticalLayer.ts:L125 draws the same hot fill + glass stroke for level 0 and for level 2 off-phase. · The check is the explicit acceptance gate for R1-F3. As written, the implementer either fails it or 'fixes' the look by changing crew level 2 phase 1, which would break the CRT rule that was just restored. · Reword L132 as follows. Level 1 must differ from level 0 in each phase. Level 2 must differ from level 0 in at least one phase, and from level 1 in each phase. Crew level 2 phase 1 is expected to match the hull (the blink is the signal).

## Prior findings
- R1-F3: resolved — The level-1 tone fill makes level 1 visible regardless of how many hatch lines a room gets: crew `mid` 0xc47a12 inside `hot` 0xffd36b, and enemy `dim` 0x7a4a10 on `glass` 0x0c0e0b (crtTheme.ts:L6). The default-zoom shot is now an explicit gate (L132). The responder's reason for not adopting the hatch-count rule is stated at L117. This resolution depends on R2-F1, which is still open, and on fixing the new L132 wording finding.
- R2-F1: still open — Level 2 now matches the CRT spec exactly: L105-L106 and L109-L110 match CRT L41-L42 and tacticalLayer.ts:L124-L133. The level-1 tone fill is still a departure from the listed fixed decision 'The CRT map's colour roles, blinks and hatch rules stay as they are'. It is now labelled as a deviation (L117), but it still has no owner sign-off and no amendment to CRT spec L41-L42, so the two specs now disagree. 'The owner's look gate judges it' (L117) is not reflected in the gate question at L136, which does not ask about the level-1 fill, and no fallback is named. Smallest fix: (1) add the level-1 tone fill explicitly to the owner gate question at L136; (2) state the fallback if the owner rejects it: drop the two level-1 fill cells (L104, L108 → none), giving the pure CRT rule; (3) if approved, add a note amending CRT spec L41-L42.
- R2-F2: resolved — L86 now lists tests/tacticalModel.test.ts L6 (the import) and L170.

## Verified
- Restored level-2 rows match the CRT spec and today's code. Crew: phase 0 glass cut-out with hot stroke, phase 1 hot (spec L105-L106 vs CRT L41, tacticalLayer.ts:L124-L125). Enemy: phase 0 hot with glass stroke, phase 1 glass with main stroke and main hatch (spec L109-L110 vs CRT L42, tacticalLayer.ts:L129-L132)
- Every colour in the L101-L110 table is a ramp colour (crtTheme.ts:L6)
- Level 1 vs level 2 are distinguishable in each phase on both ships. Crew: mid + hatch vs glass cut-out or hot. Enemy: dim + hatch vs hot or glass + hatch (spec L104-L110)
- L99 and L117 now agree that level 2 is unchanged and that only level 1 deviates
- The L86 consumer list now covers tests/tacticalModel.test.ts L6 and L170

## Not verified
- Whether the owner actually set 'CRT rules stay as they are' (the responder says the controller wrote it). I treated it as owner-fixed, as the brief states
- The responder's claim at L117 that no room layout inside the outlines reaches 2 hatch lines everywhere at zoom 0.5. I did not recompute the hatch counts
- The enemy level-0 room stroke `mid` (L107) vs today's `main` (tacticalLayer.ts:L131). The row was not touched in this round, so I did not re-review it

---

# Round 3 response (spec revised)

Reviewed `round-3.json` against `18e366f`. 2 accepted, 0 rejected, 0 deferred.

## R3-F1 [P1]: Per-phase check cannot pass

Confirmed: crew level 2 phase 1 equals level 0 by the CRT rule. The check is reworded as proposed.

## R2-F1 [P1]: Level-1 fill sign-off (reopened)

Accepted. The owner gate question now asks about the level-1 fill explicitly. The fallback if rejected is that the two fill cells become none, which is the pure CRT rule. If approved, the CRT spec gets a one-line note.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-17-hull-silhouettes-design.md

<!-- end -->

---

# Round 4 (delta, reviewing 46a8c5d, effort medium, 35 s, 55335 in / 40592 cached / 3110 out)

Verdict: ready with P2s

## Findings

### [P2] R4-F1 Under the stated fallback, the per-phase check fails: enemy level 2 phase 1 looks exactly like enemy level 1
The new fallback (spec L117) sets the two level-1 fill cells to 'none'. Enemy level 1 then becomes no fill over the `glass` hull, a `main` stroke and a `main` hatch. Enemy level 2 phase 1 (L110) is a `glass` fill, a `main` stroke and a `main` hatch. Over the L95 `glass`-filled outline, those two look the same. The reworded check (L132) still requires that 'Level 2 must differ ... from level 1 in each phase', and it has no fallback condition. So if the owner picks hatch-only, the enemy phase-1 shot fails the check. This is the CRT rule itself: CRT spec L42 makes enemy level 2's off-phase a `main` outline with a `main` hatch, which is level 1's look. It is the same pattern as R3-F1, on the other ship. · spec L108 (enemy 1: `dim` / `main` / `main`) with L117 fallback ('the two level-1 fill cells become "none"'); spec L110 (enemy 2 phase 1: `glass` / `main` / `main`); spec L95 (enemy outline filled `glass`); spec L132 ('from level 1 in each phase'); CRT spec L42. · The fallback is a stated build path. If the owner rejects the tone fill, whoever applies the fallback hits a gate that cannot pass. They might then 'fix' it by changing enemy level 2 phase 1, which would break the CRT rule. · Add one sentence to L132: 'Under the hatch-only fallback (section 2), enemy level 2 in phase 1 is expected to match enemy level 1 (the blink is the signal).' Or word the level-2-vs-level-1 clause as 'in at least one phase' once the fallback applies.

## Prior findings
- R2-F1: resolved — Of the finding's two options, the responder chose a gated version of (b). The deviation is named at L117. The owner gate asks about it explicitly at L136. The rejection fallback is exactly the pure CRT rule (fill cells 'none'), which matches CRT spec L41-L42 for fill. Approval triggers a one-line amendment to CRT spec section 2. Level 2 cells L105-L106 and L109-L110 match CRT L41-L42, and hatch and blink rules are unchanged. No dated approval exists yet, so the CRT rules stay intact until the owner decides. The one interaction with the check is raised as a new P2.
- R3-F1: resolved — L132 is reworded as proposed: level 1 ≠ level 0 in each phase; level 2 ≠ level 0 in at least one phase and ≠ level 1 in each phase; crew level 2 phase 1 is expected to match the hull. Checked against the current table. Crew L1 (`mid` fill + `glass` hatch) differs from L2 p0 (`glass` cut-out, `hot` stroke) and from L2 p1 (solid `hot`, no hatch). Enemy L1 (`dim` fill) differs from L2 p0 (`hot`) and from L2 p1 (`glass` hollow + hatch). Enemy L2 p0 differs from L0. So the check can pass with the table as written.

## Verified
- spec L103-L110: the level-2 cells match CRT spec L41 (crew: `glass` cut-out ↔ `hot`) and L42 (enemy: solid `hot` ↔ `main` outline + `main` hatch)
- spec L117: the fallback restores the pure CRT level-1 look (hatch only), matching CRT spec L41-L42
- spec L136: the owner gate asks about the level-1 tone fill explicitly
- spec L132: every level/phase pair the check requires to differ does differ under the current table (L103-L110 over the L95 outline fills)
- The diff touches only L117, L132 and L136. No contradiction with section 1 or with the rest of section 2 (L99, L112-L115)

## Not verified
- Whether the owner's look gate runs before or after merge. If it runs after, the deviation lands on master before sign-off. The spec does not say, and I did not look at process docs.
- The rendered look at zoom 0.5. No screenshots were taken (read-only review).

---

# Round 4 response (spec revised)

Reviewed `round-4.json` against `46a8c5d`. 1 accepted, 0 rejected, 0 deferred.

## R4-F1 [P2]: The fallback breaks the check

Confirmed. Added the sentence as proposed.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-17-hull-silhouettes-design.md

<!-- end -->

---

