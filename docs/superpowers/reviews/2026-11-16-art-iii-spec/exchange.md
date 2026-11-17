# Codex review exchange: art-iii-spec

Subject: `docs/superpowers/specs/2026-11-17-art-iii-set-dressing-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing b32aa43, effort high, 364 s, 1670184 in / 1587441 cached / 33278 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The palette plan contradicts itself, misstates which frames are new, and regenerating it would change how a fresh clone looks
Spec L30 says both "The palette does not change" and "if it moved, the build commits the regenerated palette". It also says "these rectangles are new frames". Six of the eight are already counted frames from Art-ii. Only crates.stack and crates.pile are new. If those two push art:palette to a different result, the committed palette.json changes, and so do ROLE and RAMP. The procedural fallback draws with ROLE and RAMP, so a fresh clone with no paid art would no longer look as it does today. That breaks the Goal at L9 and a fixed decision. · spec L30, L9. art/import.json:L142-177: furniture.png already holds 97,49,14,22; 129,48,14,23; 57,88,14,25; 130,94,13,25. art/import.json:L203-220: lockers.png already holds 19,29,18,33 and 90,96,12,16. Grep finds no frame at Mars Tools x=122 or x=153. scripts/art/buildPalette.ts:L42-45 counts each pack+rectangle once. palette.ts:L3,L47-48 builds ROLE and RAMP from palette.json, and interiorFeel uses ROLE for fixtures and glows (interiorFeel.ts:L123,L196,L201). The Art-ii spec at L57 makes 'running art:palette again leaves git diff empty' the owner-local check. · One implementer leaves the palette alone, which breaks the Art-ii check that a re-run leaves no diff. Another regenerates it, which recolours the fallback and every paid sprite. Either way, one of the spec's own promises is broken. · Pick one outcome and state it. Recommended: use only frames that are already counted, so the palette provably cannot move. For example, the holds could use prop.crate (90,96,12,16), prop.locker (19,29,18,33) and the second locker (59,29,18,33), and drop the two new crate rectangles. Then say that the palette.json bytes stay the same, and add a test that countColours gives the same counts before and after the import.json change. If the new crate art must stay, say that palette.json is not regenerated in this feature, and that the Art-ii re-run check is suspended until a separate palette pass.

### [P1] R1-F2 prop.seats and prop.couch are side-facing sprites, but the spec says every sprite faces south
L30 says every sprite is drawn facing south, with its back to a north wall. The chosen seats (14x25) and couch (13x25) are the tall, narrow variants. On the sheet they sit beside landscape variants of the same furniture: two seats side by side at 16,88,25,15, and orange couches at 88,88,23,15 and 88,106,23,17. They also come as a mirrored pair at x=130 and x=162. That pattern means they are the east-facing and west-facing views. Turned with the north-wall rule, they will stick out of the wall lengthwise and face along it. · spec L23-24, L30. Sheet maru-98-mars/habitable-building/habitable building tileset.png, row y~88-119: landscape seat pair at x~16, tall seat at x~57, landscape orange couches at x~88 (two of them), tall orange couches at x~130 and x~162 (a mirrored pair), landscape couch at x~192. art/import.json:L154-189 lists exactly these rectangles. · The galley's main props would be drawn sideways to the wall they back onto. Section 1 is also the only place the facing is defined, so an implementer has no way to correct it. · Bind the landscape variants whose back is at the top: seats 16,88,25,15 and couch 88,88,23,15 (or 192,94,23,17), after checking against the sheet which one has its back at the top. Alternatively, add a per-sprite base facing column to the section 1 table and fold it into SIDE_ROTATION. Add one sentence per sprite saying where its back is.

### [P1] R1-F3 Excluding breach sites and airlock tiles does nothing: both are always wall tiles, so props can back straight onto a breach or an airlock
L49 excludes breach sites and airlock tiles from the candidates. Candidates are floor tiles, and the schema requires breach sites and airlocks to be '#' wall tiles, so nothing is ever excluded. The test at L66 ('no slot on a breach site or airlock tile') passes no matter what. On the Skiff Hold, (7,7) sits in front of breach site (7,8) and (8,7) in front of airlock (8,8). Both are candidates with wall side s, so a prop would back flush onto the breach decal or the hull door. The Cutter's Galley (11,9) and Crew Quarters (11,3) also border breach walls. · spec L49, L66. schema.ts:L94 (a breach site must be '#'), schema.ts:L101 (an airlock must be a wall tile). skiff.json:L44 breach H [7,8], L62 airlock H [8,8], rows L12-14. cutter.json:L404-408 breach U [10,3], L406-409 breach V [10,9]. A flush prop overlaps the wall tile by WALL_GAP (consoleModel.ts:L20, L109-112), and breach decals are drawn on the site's wall tile in effects.below, under the console layer (effects.ts:L61, renderer.ts:L73). · The stated outcome, keeping props off breaches and airlocks, is false. Breaches and venting happen in ordinary play, and a crate stacked against an airlock reads as wrong. · Rewrite L49 as: exclude floor tiles that are 4-neighbours of a breach site (derived.siteTile) or an airlock (derived.airlockTile). Change the L66 test to match. Note that on the Skiff Hold this leaves (7,6), (8,6) and (9,7), which still allows the 2 props it gets today.

### [P1] R1-F4 The torpedo magazine tile is not excluded, and the Cutter's Lower Hold has a 50% chance of putting a crate pile on it
The Cutter's magazine is at (6,9) in the Lower Hold (M). That room has exactly two candidates, (6,9) and (7,9), which are adjacent, so the hash order puts the single prop (crates.pile) on one of them. When it lands on (6,9), the magazine rack outline and torpedoes are drawn over the crate pile. That tile is also where the torpedo runner must stand. · spec L45-49 (the exclusion list has no magazine). cutter.json:L581 "magazine": [6, 9]. Rows L15-17: M = (5..7, 9); (5,9) is next to the doors (5,8) and (4,9). derived.ts:L18,L81 magazineTile. renderer.ts:L73 draws magazine.container after consoleDesks. torpedoLayer.ts:L15,L27-28. · The magazine is an interaction tile like a station, and the spec's own reasoning at L62 is to keep props off busy tiles. Whether this happens depends on a hash nobody can predict from the spec. · Add 'the magazine tile (derived.magazineTile) and its 4-neighbours' to the exclusions at L46-49, and add it to the propSlots test at L66. That leaves the Cutter's Lower Hold with zero props. Either accept that and correct the dressed-room list at L41, or exclude only the magazine tile itself, which leaves (7,9) as the one slot.

### [P1] R1-F5 In the console layer, props draw above the grade and above fire and breach effects, which contradicts L57 and hides fires
L57 says the grade and lights draw over props as they do over the floor. In both views, the console container sits above feel.grade (ambient, alert and vacuum tints) and above effects.below (fire sprites, breach decals and failure sparks). Props placed there would stay untinted in a vented or alerted room. A fire on a prop tile would be drawn under a crate pile, which is 46x48 units on a 32-unit tile. · spec L55, L57. renderer.ts:L72-73: tiles, grade, effects.below, icons, consoleDesks, magazine, crew. duel/interiorView.ts:L63 uses the same order. effects.ts:L25,L51 puts the fire sprites in effects.below. interiorFeel.ts:L91 shows the grade holds the ambient, alert and vacuum layers. · The stated outcome is false, and fire readability is a gameplay signal hit in ordinary play. · Draw props in their own container, inserted directly after tiles.container in both renderer.ts:L73 and duel/interiorView.ts:L63. Redraw it only when layoutHash changes. Then the grade, fire, breach decals, consoles, fixtures, magazine and crew all draw over the props, as L57 intends. This also removes the coupling to consoleArt: today consoleLayer.ts:L21-29 only fills the sprite container when consoleArt is ready, and the spec does not say what happens when propArt is present but consoleArt is not.

### [P2] R1-F6 The propSlots interface is underspecified: unclear whether it returns candidates or placements, and the sort order and return type are unstated
L45 says propSlots 'lists the candidate tiles'. L51 then describes the selection, and the L66 tests check adjacency and per-kind caps on propSlots, which only make sense for chosen placements. The return shape is never given: tile, side, prop name and room are all possibilities. 'Ordered by hashU32' does not say ascending. It is also unclear whether names are assigned to slots in the order taken. · spec L45, L51, L66 · Two implementers would expose different shapes, and the plan's tests depend on that shape. · Define it, for example: `propSlots(state): { room: number; tile: number; side: Side; name: string }[]`, giving the taken slots per room in ascending hashU32 order (ties by tile index), with the room's kind list assigned in take order. Optionally add a separate `propCandidates` for the test of the exclusions.

### [P2] R1-F7 The room lamp fixture draws on top of a prop wherever a prop takes a room's top-left tile, and in the Aft Store that always happens
Art-i-b puts each room's lamp at the room's lowest tile index (the top-left tile), offset 6 units. Fixtures draw above the console layer's sprite container. The Aft Store's only candidate is its top-left tile (1,9). The Crew Quarters (11,3), Cutter Medbay (15,3) and Skiff Hold (7,6) top-left tiles are also candidates, so a 4x4 lamp square would sit on top of a bunk or crate. · gradeModel.ts:L100-105 (lampPoints uses min(tiles) plus LAMP_OFFSET 6), interiorFeel.ts:L201, renderer.ts:L74 (fixtures go in consoleDesks.container). spec L55 keeps fixtures above props. cutter.json rows L15 (Aft Store (1..3,9); (2,9) and (3,9) are next to doors). · It is a visible defect on a guaranteed tile. The spec should either decide it or flag it for the owner's gate. · Either exclude the room's lamp tile, which leaves the Aft Store undressed (then correct L41), or state explicitly that the lamp may draw over a prop and add it to the owner's gate question at L69.

### [P3] R1-F8 The starter ship gets dressed too, but the spec never mentions it
L41 lists only the Cutter and the Skiff. starter.json has 'Crew Quarters' (G) and 'Medbay' (F), and sector mode loads that layout, so the rule dresses it as well. · spec L41. starter.json:L21-29 (rooms G 'Crew Quarters' and F 'Medbay'). src/network/modes/sector.ts:L7,L15. fleet.ts:L1 ('the starter stays for tests and gates'). · This gives tests and screenshots an unstated expectation. · Add 'and the starter's Crew Quarters and Medbay' to L41, and include starter room names in the roomKind test at L66.

### [P3] R1-F9 Keying the cache on layoutHash ignores room names and systems, which roomKind depends on
layoutHash covers rows, room ids, edges, sites, airlocks, stations and spawns, but not room names or systems. Two layouts with the same geometry and different names would share a cache entry with the wrong dressing. · spec L45. derived.ts:L72-83 (only `r.id.charCodeAt(0)` is pushed for rooms). · This is latent, not hit by today's ships. · Either key the cache on layoutHash plus the joined room names and systems, or note that the cache assumes names never change for a given geometry.

## Verified
- Worked out the Cutter's Crew Quarters by hand (U = (11..13,3..5); doors (12,2), (10,5), (12,6), (14,4); spawns (11,4), (12,4), (13,4), (11,5)). The candidates are (11,3) n, (13,3) n and (13,5) e. None of them touch each other, so 3 bunks fit (cutter.json rows L9-11, edges, spawns L533-550).
- Worked out the Galley by hand (V = (11..13,7..9); doors (10,7), (12,6), (12,10), (14,8)). The candidates are (13,7) n, (11,8) w, (11,9) s and (13,9) e. (11,8) and (11,9) are adjacent, so exactly 3 props are always placed, which matches the cap of 3.
- Worked out the Lower Hold by hand (M = (5..7,9)). (5,9) is next to the doors at (5,8) and (4,9). The candidates (6,9) and (7,9) are adjacent, so it gets 1 prop. The Upper Hold also gets 1 (from (6,3) or (7,3)) and the Aft Store 1 (only (1,9)). The Cutter Medbay has candidates (15,3), (17,3) and (15,5) and gets 1. The Skiff Hold has 5 candidates and gets at most 2. The Skiff Medbay has only (7,2) and gets 1.
- The list of dressed rooms at L41 is right for the Cutter and Skiff names and systems (cutter.json:L22-106, skiff.json:L18-25). No other room name contains quarters, galley, mess, hold, store or cargo.
- Breach sites and airlocks are always wall tiles (schema.ts:L94, L101). Door edges are always '+' (schema.ts:L79). Edges are 'door' or 'opening' (schema.ts:L16). The derived fields stationTile, edgeTile, siteTile, airlockTile, magazineTile and layoutHash all exist (derived.ts:L6-26).
- hashString and hashU32 exist in particles/random.ts:L5-16, and the wall vents use hashU32(hashString(layoutHash), tile) (particles/sources.ts:L190-194), as the spec says.
- consolePlacement(side, flush, w, h) takes art pixels and doubles them. When flush, the back edge sits at -WALL_GAP (10 units), which is the room-side face of the wall band. Its tile-local results match spec L56 (consoleModel.ts:L20, L106-115; doorModel.ts:L11; TILE_PX 32).
- The console layer redraws on layoutHash plus the console looks, and it empties and destroys the art container's children on every redraw (consoleLayer.ts:L18-28). The crew container draws above consoleDesks in both views (renderer.ts:L73, duel/interiorView.ts:L63).
- Optional paid names are gated per feature by featureReady over FEATURE_NAMES, and new names must be registered in assetNames (fallback.ts:L5-25, assetNames.ts:L27-30). One-frame outputs with a manifest `name` follow the Art-ii console pattern (import.json:L1751-1761, manifest.json:L1056-1057).

## Not verified
- The two new Mars Tools rectangles (122,88,12,24 and 153,88,23,24) are exact bounding boxes, and they really are crates rather than filing cabinets. The Read tool shows the sheet downscaled, so I could not check pixel edges.
- Which way the tall seats (57,88,14,25) and couch (130,94,13,25) face: east or west. My finding rests on the landscape and mirrored variants beside them on the sheet, not on reading individual pixels.
- Whether the 'tall white locker' (Mars Tools 19,29,18,33) is drawn as a front view, which would look wrong turned onto an east or west wall. The quarter-turn rule is a fixed decision, so I did not raise it.
- Whether the starter layout is ever drawn in the app, as opposed to only in tests and the headless and sector modes.
- That the Art-ii screenshot harness at L68 exists and can show the Skiff and the Cutter. I did not read it, as it is outside the manifest.
- I read gradeModel.ts, roomIconModel.ts, torpedoLayer.ts, effects.ts and renderer.ts beyond the manifest, to check draw order, lamps, icons and the magazine. Room icons are drawn only for system rooms, so they don't clash with props in holds or quarters.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `b32aa43`. 9 accepted, 0 rejected, 0 deferred. The spec was rewritten.

## R1-F1 [P1]: The palette plan contradicts itself

Confirmed (buildPalette.ts:L42-45 counts each pack + rectangle once; the two crate rectangles at x 122 and 153 were new). Section 1 now uses only rectangles that art/import.json already lists. The two new crates are dropped; the holds use the two lockers and the small crate. palette.json must stay byte-identical, and a test checks that countColours is unchanged.

## R1-F2 [P1]: The seats and couch face sideways

Confirmed against the sheet: the tall variants are the side views. Section 1 now uses the landscape seats (16,88,25,15) and couch (88,88,23,15), both with their backs at the top, and records where each sprite's back is. The plan checks each by eye.

## R1-F3 [P1]: Excluding breach and airlock tiles did nothing

Confirmed: schema.ts:L94 and L101 make both wall tiles. Section 3 now excludes the floor tiles that are 4-neighbours of a breach site or an airlock.

## R1-F4 [P1]: The magazine tile is not excluded

Confirmed (cutter.json magazine at 6,9). The magazine tile and its 4-neighbours are now excluded. The Cutter's Lower Hold becomes undressed, which section 3 states.

## R1-F5 [P1]: Props would draw above the grade and fires

Confirmed (renderer.ts:L72-73, effects.ts:L25,L51). Props now get their own layer directly after the tiles in both views, so everything else draws over them. It rebuilds on its key and does not depend on consoleArt.

## R1-F6 [P2]: propSlots is underspecified

Confirmed. Section 3 now gives the return type, the ascending hash order with ties by tile index, and names assigned in take order. A separate propCandidates exposes step 1 for testing.

## R1-F7 [P2]: The lamp would draw over a prop

Confirmed (gradeModel.ts:L100-105). Each room's lamp tile is now excluded. The Aft Store becomes undressed, which section 3 states.

## R1-F8 [P3]: The starter ship is not mentioned

Confirmed. Section 3 says the starter's Crew Quarters and Medbay are dressed, and the roomKind test covers the starter.

## R1-F9 [P3]: The cache ignores room names

Confirmed (derived.ts:L72-83). The cache key is now layoutHash plus the joined room names and systems.

## Also changed

- The hold list now uses two lockers and the crate; the pinned Cutter result is stated (Crew Quarters 2, Galley 3, Upper Hold 1, Lower Hold and Aft Store 0).

## Files changed

- docs/superpowers/specs/2026-11-17-art-iii-set-dressing-design.md

<!-- end -->

---

