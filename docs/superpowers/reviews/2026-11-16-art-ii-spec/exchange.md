# Codex review exchange: art-ii-spec

Subject: `docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 8bb7439, effort high, 302 s, 1173848 in / 1098983 cached / 29119 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Console sprites are padded grid cells, so centring and quarter-turning them misplaces the art
The spec says to centre the console sprite on the desk rectangle and turn it in quarter turns (spec L32). The imported machines and stations sheets do not have one frame per cell, though. Each frame sits at the top-left of a cell as big as the largest frame on that sheet. The manifest can only slice a uniform frameW x frameH grid and has no per-frame size or trim, so the texture an implementer gets for `console.<kind>` is the whole padded cell, not the art. Centring or rotating that texture centres the transparent cell, not the console. · spec L26-32. art/import.json L36-70: the machines frames are 16x27, 16x23, 14x23, 16x15 and 24x14, so the cell is 24x27. The med pod (frame 4) has 13 empty rows under it, and the server rack (frame 0) has 8 empty columns to its right. art/import.json L72-125: stations frames 0-3 are 12x15, 12x15, 13x16 and 13x15 inside a 16x19 cell. scripts/art/importCore.ts:L88-94 packs each frame at its cell's top-left. assets.ts:L91-95 uses sliceGrid(frameW, frameH) with no trim. manifest.ts:L5-9: the sheet schema has frameW and frameH only. I confirmed the layout by viewing stations.png and machines.png: the art sits in the top-left of each cell. · Every console will be off-centre by 1-13 art pixels, by a different amount per kind. A quarter turn about the cell centre moves the art again, and differently for each side. Two implementers will fix this in different ways, or not at all. · Choose one approach in the spec. (a) Give each console its own one-frame output in art/import.json, so the cell is exactly the art (stations frames 0-3 and machines 0, 1 and 4 become seven outputs), and bind each with `name`. Or (b) state that the renderer cuts a Texture of the frame's own w x h from the cell's top-left and list those sizes in the spec. Then define the anchor as the centre of the visible art, rotate about that point, and say how odd sizes such as 13x15 round onto the 2-unit grid.

### [P1] R1-F2 The crew foot anchor is 'measured at load', but the assets API has no pixel access, and 'per sheet' is ambiguous
The anchor y is meant to be the frame's lowest opaque row, measured once per sheet at load. GameAssets only exposes Texture objects, loaded through Pixi's <img> path, and has no function to read pixels. Measuring at runtime would need a new canvas readback that the spec does not describe and that vitest cannot run without a DOM canvas. 'Per sheet' is also unclear: it could mean the lowest row over every frame, over the standing frames only, or a value per frame (walk frames may lift the feet). · spec L21 and L50 (a unit test for 'the per-sheet foot anchor'). assets.ts:L6-15: the GameAssets interface has has, texture, animation, nineSlice and missing only. assets.ts:L26-30 and L52: textures load through the <img> path. crewSprites.ts:L18 sets the anchor once as a constant. · A plan subagent has to invent a pixel-readback path inside the renderer, or quietly hard-code the value, which the spec forbids. Either way the unit test has nothing clear to check. · Measure the row offline, either in `art:import` or by the plan author from the four PNGs, over frames 0-3 (standing). Record it as a constant (`LIMEZU_FOOT_ROW`) with a comment, or as a field in the committed manifest entry. Then test a pure function `footAnchorY(row, frameH) = (row + 1) / frameH` against that value. Remove 'measured at load'.

### [P1] R1-F3 The palette builder is to be 'ported' from a script that is not in the repo, with no requirement to reproduce the committed palette
Section 4 asks for 'the palette builder used for the checkpoint, ported to TypeScript'. The original builder is not anywhere in the repo, and art/palette-overrides.json does not exist. The spec does not give k, the iteration count, which frames feed the k-means, how 'explosion-pack colours kept exact' is decided, how roles and ramps map, or the override values. No test or criterion requires `npm run art:palette` to reproduce the committed palette.json. · spec L45 and L50. A Grep for buildPalette, k-means, palette-overrides and art:palette finds only the spec, the brief and palette.json. palette.json:L3 describes the method in one sentence. Glob art/* returns only art/import.json. package.json:L27-30 has no art:palette script. · A subagent who sees only the plan cannot port code it has never seen. A rebuilt builder will almost certainly produce a different 42-colour palette. The first time anyone runs `art:palette`, palette.json would change and every imported sheet would need a re-import, a silent visual change to the house palette. · Either commit the original builder's source, or write out the algorithm fully in the spec: k=42, the input frame set, the init, the iterations and stop rule, the exact-keep rule, and the role and ramp mapping. Write art/palette-overrides.json now with the current values from palette.json (the fire ramp, flash, lampOn, heldTick, ventSpeck, alert and breach). Add an acceptance check the owner runs locally: with the owner's asset folder, `npm run art:palette` leaves palette.json byte-identical (git diff empty).

### [P1] R1-F4 The 'down' console strip is said to use the failed role, but today's strip is WARN red and the new failed role is khaki
The spec says a down console draws 'the existing screen strip in the `failed` role'. The existing strip is not drawn in the failed role: it uses SCREEN_DOWN = WARN, a red. Meanwhile the new palette's `failed` role is #c3bc6d, a yellow-khaki. One implementer keeps the existing red strip, another uses ROLE.failed and draws a khaki strip that does not read as failed. · spec L33. consoleModel.ts:L13: SCREEN_DOWN = WARN. theme.ts:L7: WARN = 0xff5b4a. palette.json:L75: "failed": "#c3bc6d". effects.ts:L92 already uses ROLE.failed for failed tiles. The override list at spec L45 does not include `failed`. · The two parts of the sentence contradict each other. The khaki colour also suggests that mapping roles from the old palette moved `failed` away from red, which affects every failed-tile overlay as well. · Say 'the existing SCREEN_DOWN (WARN) strip', or add `failed` to the palette overrides with a red taken from the packs and use ROLE.failed for both the strip and the failed tiles. Choose one of the two.

### [P1] R1-F5 Blasts need assets and the hit signal in the same module, and no module has both today
The hits and the duel's random smoke tile exist only inside interiorFeel.onHit. createInteriorFeel takes no assets. The effects layer has the assets but never sees hits. The spec places blasts in `effects.above` and plays them on the presentation clock, but does not say which module owns them, how they get textures, or how frames advance. A Pixi AnimatedSprite runs on the Pixi ticker: freezeAnimations stops it only during a hitstop, and nothing stops it during a pause, so it would not 'hold while paused'. · spec L39-40. interiorFeel.ts:L81: opts are { world, band, feel } with no assets. interiorFeel.ts:L116-136: onHit is private, and L126 draws the duel tile from emitter.random without exposing it. interiorFeel.ts:L145-148: a pause holds the clock, but freezeAnimations runs only on clock.stopped (the hitstop). effects.ts:L20: createEffectsLayer(assets, memory). renderer.ts:L68-69 and duel/interiorView.ts:L58-59: fx.above is added inside effects.above. · Implementers will either add assets to createInteriorFeel, or expose a hits list from it, or re-detect hits in the effects layer, which would draw the duel tile again and pick a different tile. Each builds different frame timing too. The 'held at presentation dt 0' test cannot be written until this is settled. · State that interiorFeel owns the blasts. createInteriorFeel gets an optional `assets` (or the two GameAnimation values). onHit pushes a blast { name, x, y, start: clock.t }, reusing the tile it already picked for the duel smoke. Each frame, draw sets Sprite.texture to frames[floor((clock.t - start) * fps)] (plain Sprites, not AnimatedSprite) and removes the blast after the last frame. The blast sprites go in fx.above under the flash.

### [P2] R1-F6 Blast placement, size, count and cap are underspecified
Several details are left open. 'The hit room's centre tile' has no single answer for even-sized rooms (2x2, 2x1). The scale and anchor are not given (32 art px at 2x covers 2x2 tiles). A sector hit can list several rooms, while the test says 'one per hit'. It is unclear whether the cap of 4 is shared between room blasts and breach sparks. The draw order relative to the white flash is not given. · spec L38-40 and L50. interiorFeel.ts:L129-133 loops over hit.rooms, so one hit can cover several rooms. sources.ts:L166-170: breach openings come from draw, not from onHit. · Two implementers will place and count blasts differently, and the scheduling tests will disagree with each other. · Say: one room blast per hit room, centred on the room's centroid in world units (rounded to 2), at 2x, anchor 0.5/0.5. One spark per opened breach site at the site tile's centre. One shared cap of 4, cutting the oldest. Blasts draw under the flash Graphics.

### [P2] R1-F7 The cursor blink and down strip, placed from the desk rectangle, will land at arbitrary spots on the console art and may be hidden under it
screenCursor and the down strip are positioned from deskPicture's `screen` rectangle, which is the procedural desk's wall-edge strip. On a Maru sprite that point is not the art's own screen, so the amber cursor and the red strip will float over arbitrary pixels of the sprite. The fixtures Graphics is also a child of the desk container. If consoleLayer adds its sprites with addChild after the fixtures, the sprites cover the blink. · spec L33. lightsModel.ts:L62-64 (screenCursor from picture.screen). interiorFeel.ts:L170-171. consoleLayer.ts:L7-8: the container holds one Graphics. renderer.ts:L69 and duel/interiorView.ts:L59: desks.container.addChild(fx.fixtures) is called after the layer is built. · The look gate will show stray blinking pixels, or no blink at all, depending on child order. Implementers will handle it differently. · With consoleArt, either skip the cursor and the down strip (show 'down' through the 60% tint plus the existing glow off), or give a per-kind screen offset inside the sprite. Say that sprites go into a child container inserted below fixtures (addChildAt 0).

### [P2] R1-F8 The carried torpedo at y-30 will sit on a LimeZu character's chest or head
The carried torpedo is drawn at a fixed 30 world units above the crew position, chosen to clear the Puny sprite. A LimeZu frame is 16x32 art px at 2x (64 units tall), feet-anchored, and its figure is much taller than a Puny figure. The spec claims the size change is safe but does not revisit this offset. · crewSprites.ts:L36: `y * TILE_PX - 30 // held overhead, clear of the sprite`. manifest.json:L174-175: Puny frames are 32x32 with feet at anchor 0.75. spec L21. · An ordinary Coop-ii torpedo carry would draw the torpedo across the character's body. · With crewArt, set the carry offset from the measured head row: (footRow - headRow) * 2 + a margin. Add it to the unit tests. Also check callout and label offsets that assume a 1-tile crew.

### [P2] R1-F9 Downed pose: the pivot, turn direction and reset are unspecified
'The standing s frame turned a quarter turn' does not say clockwise or anticlockwise, or which point to rotate about. With the foot anchor (x 0.5, y about 1), a 90-degree turn swings a 64-unit-tall body two tiles sideways out of the crew's tile. The spec also does not say that rotation resets to 0 when the crew member gets up. · spec L20. crewSprites.ts:L73 (anchor set once at creation) and L81 (the downed branch). · A downed crew member can end up drawn across a wall or in the next room, and a revived one can stay rotated. · Specify: rotate +90 degrees (clockwise) about the body's centre, by temporarily setting the anchor to 0.5/0.5 and placing the sprite at the crew position. Restore the foot anchor and rotation 0 on any other state. Add a unit test.

### [P2] R1-F10 The seated facing needs the console's wall side, which the crew layer does not have
Seated crew 'face the console's wall side'. The crew layer only knows Seated.station. The side is computed only inside consoles(), once per console group and keyed by members[0]. Seats at a non-first group member, such as the Skiff's Ops, need a member-to-console lookup. The spec also says nothing about draw order at an s-wall console, where the crew (drawn above the console layer) will stand in front of a console that is south of them. · spec L20. crewSprites.ts:L82 (only Seated.station is read). consoleModel.ts:L69-80: the side is per group, and `members[0] !== i` skips the other members. renderer.ts:L68: consoleDesks is drawn before crew. · Implementers will either recompute wall distances in the crew layer or call consoles() per frame. A missed group lookup gives a wrong facing or a crash on an undefined lookup. · Specify a pure helper `consoleSideOfStation(state): Side[]` built from consoles() (each member maps to its group's side), cached by layoutHash and passed to or computed in the crew layer. State that s-wall overlap is accepted for now, or that crew seated at an s-wall console draw below the desk.

### [P2] R1-F11 Paid manifest entries for LimeZu and Pimen lack the store URLs, dates and the Pimen credit the validator requires
The manifest rejects a paid entry unless it has a source URL, a retrieved date and a credit line. The spec gives only LimeZu's credit line. It gives no LimeZu or Pimen store URL, no purchase date, and no Pimen credit line, and it does not confirm Maru-98's or Pimen's licence terms (whether credit is required and whether redistribution is allowed inside a built app). · spec L17, L26 and L38. manifest.ts:L44-51: paid entries need an http source, `retrieved` and `credit`. manifest.json:L545-551: only the Maru entry exists so far. · A plan subagent will have to invent URLs and dates or fail validation. Shipping in a build without checked terms is a licence risk. · List in the spec, for each of the three packs: the store page URL, the purchase date (2026-11-16) and the exact credit line, for example 'Explosion VFX by Pimen (pimen.itch.io)'. Note where each pack's licence text was read, or flag the Maru-98 and Pimen terms as an owner check before release.

### [P3] R1-F12 The `console.<kind>` naming and the console layer's signature are unstated
`console.<kind>` could mean the numeric StationKind (console.0), the ship-data id (console.lifeSupport) or the display name. createConsoleLayer() takes no assets today, and the spec does not say it gains a parameter. · spec L26. stationKinds.ts:L2-4 (numeric kinds, the STATION_IDS strings and the display names). consoleLayer.ts:L6. renderer.ts:L63 and duel/interiorView.ts:L49 call createConsoleLayer() with no arguments. · The names in the manifest, ASSET_NAMES, FEATURE_NAMES and the tests must all agree. · Use `console.${STATION_IDS[kind]}` (console.navigation ... console.doors) and change the signature to createConsoleLayer(assets: GameAssets), updating both call sites.

## Verified
- Crew sheet frame indices: each crew output takes frames 0-3 from y=0, 24 frames from y=32 and 24 frames from y=64, all 16x32, with 24 columns (art/import.json L225-542 and the same for 07, 13 and 19). Packed row-major (importCore.ts:L89-94), they become a 384x96 sheet. sliceGrid(16,32) gives indices 0-51 in the spec's order: stand 0-3, idle 4-27, walk 28-51 (spec L17).
- The station frames used for consoles match the images: stations.png frames 0-3 are the four orange consoles, and machines.png frame 0 is the tall rack, frame 1 the green machine and frame 4 the wide pod (viewed both PNGs).
- Explosion frame counts: explosion-room has 14 frames of 32x32 (import.json L1574-1663), explosion-hit 11 of 16x16 (L1501-1572) and explosion-big 13 of 64x64 (L1665-1748), matching spec L38.
- The new per-slot crew names (crew.p<k>.*) do not collide with the required Puny crew.* names. The manifest's no-duplicate rule (manifest.ts:L54-63) is satisfied because the names are distinct.
- Boarders use only the Puny crew.idle.s, crew.idle.* and crew.walk.* names (boarderLayer.ts:L46, L58-59), so leaving them on Puny (spec L13) needs no change.
- A console group's first member is well defined: consoles() emits once per group at members[0] (consoleModel.ts:L72-73), and the kind is state.derived.stationKind[members[0]] (derived.ts:L20, L61-64).
- Draw order: consoleDesks sits under crew, and effects.above (which holds fx.above) sits under feel.lights (renderer.ts:L68-69; duel/interiorView.ts:L58-59), consistent with spec L40.
- Fallback mechanics: optional names that are unbound or fail to load go into assets.missing (assets.ts:L74-76), and featureReady checks FEATURE_NAMES (fallback.ts:L19-21), so new features crewArt, consoleArt and blastArt fit the existing pattern.
- No sim change is required by any section. The only randomness used is the presentation emitter (interiorFeel.ts:L126), not the sim RNG.

## Not verified
- That LimeZu rows 0-2 run right, up, left, down. The thumbnail of crew_04.png is consistent with side, back, side, front, but too small to be sure of right versus left.
- The exact visible head height of the LimeZu figures, used in the torpedo-offset finding. It is estimated from the thumbnail, not measured.
- Whether callouts, selection markers or labels position themselves from a 1-tile crew assumption. I did not open those files; they are outside the manifest.
- How 180-degree and 90-degree turned 3/4-view Maru consoles look at s, e and w walls. That is a visual judgement for the owner gate.
- Maru-98 and Pimen licence terms. The licence texts are not in the extracted packs and I did not read the store pages.
- The existence and behaviour of 'the Art-i-b screenshot harness' named in spec L52.
- I read effects.ts only through Grep (createEffectsLayer at L20 and ROLE.failed at L92); I did not read the whole file.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `8bb7439`. 12 accepted, 0 rejected, 0 deferred. The spec was rewritten section by section.

## R1-F1 [P1]: Console sprites are padded grid cells

Confirmed: art/import.json packs each frame at its cell's top-left (importCore.ts:L88-94), and the manifest slices a uniform grid. Section 2 now gives each console sprite its own one-frame output, so the image is exactly the art, and binds it by `name`. It is anchored at its centre, rotated about the centre in quarter turns, and its top-left is rounded to a whole art pixel.

## R1-F2 [P1]: The foot anchor cannot be measured at load

Confirmed (assets.ts exposes textures only). I measured the four standing frames offline: the feet are on row 31 in all four sheets and the head starts at row 7 or 8. Section 1 states the constants `LIMEZU_FOOT_ROW = 31` and `LIMEZU_HEAD_ROW = 7`, sets the foot anchor y to 1, and drops "at load".

## R1-F3 [P1]: The palette builder is not in the repo

Confirmed. Section 4 now writes out the algorithm in full: the inputs, kept colours, k = 48 minus the kept count, the farthest-point initialisation with its weighting and tie order, 12 Lloyd iterations with snapping, the sort, the role and ramp mapping and padding, and the full override contents. The TypeScript builder becomes canonical. The build regenerates palette.json and re-imports, and the owner-local check is that a re-run leaves `git diff` empty.

## R1-F4 [P1]: The down strip's colour is ambiguous

Confirmed (consoleModel.ts:L13 uses WARN; the new `failed` role was khaki). With `consoleArt` the strip is not drawn (see R1-F7), and the overrides set `failed` to `#e06715`, so the failed-station tiles read as a fault.

## R1-F5 [P1]: No module has both the assets and the hit signal

Confirmed (interiorFeel.ts:L81, L116-136). Section 3 now makes interiorFeel the owner. It takes an optional `blasts` pair of GameAnimations and uses plain Sprites framed from `clock.t`, so blasts hold through the hitstop and through a pause.

## R1-F6 [P2]: Blast placement, size and cap are underspecified

Confirmed. Section 3 now specifies:
- one blast per hit room, at the room's centroid rounded to 2;
- in the duel, one blast at the smoke tile;
- one spark per opened breach;
- 2x scale, anchor 0.5/0.5;
- one shared cap of 4, cutting the oldest;
- drawn under the flash.

## R1-F7 [P2]: The cursor and strip would land on arbitrary spots of the sprite

Confirmed (lightsModel.ts:L62-64). With `consoleArt` there is no strip and no cursor. The sprites go into a child container at index 0, under the fixtures.

## R1-F8 [P2]: The carried torpedo would sit on the head

Confirmed (crewSprites.ts:L36, y - 30). With `crewArt` the offset is (31 - 7) × 2 + 6 = 54. The plan also checks the callout offsets.

## R1-F9 [P2]: The downed pose's pivot and reset are unspecified

Confirmed. The pose is now +90 degrees clockwise about the body's centre, with anchor 0.5/0.5 at the crew position. The foot anchor and a rotation of 0 are restored in every other state, and this is tested.

## R1-F10 [P2]: Seated facing needs the console side

Confirmed (consoleModel.ts:L69-80, keyed by members[0]). A pure `stationSides(state)` built from `consoles()` and cached by layoutHash maps every group member to its group's side. Overlap at a south-wall console is accepted.

## R1-F11 [P2]: The paid entries lack URLs, dates and the Pimen credit

Confirmed (manifest.ts:L44-51). New section 5 gives each pack's source URL, a retrieved date of 2026-11-16 and its credit line, and quotes LimeZu's LICENSE.txt. The Maru-98 and Pimen terms become an owner check before release, recorded in docs/gates.md.

## R1-F12 [P3]: Console naming and the layer signature are unstated

Confirmed. Sprites are named `console.<STATION_IDS id>`, and `createConsoleLayer(assets)` is updated at both call sites.

## Also changed

- The downed body is positioned at the crew position, so it lies across the crew member's own tile.

## Files changed

- docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md

<!-- end -->

---

# Round 2 (delta, reviewing a511101, effort medium, 107 s, 335536 in / 270752 cached / 10216 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 Console placement contradicts itself: centred on the desk rectangle and also backed against the wall
Section 2 says the sprite's centre stands on the desk rectangle's centre and also that its back edge is against the wall. Those two rules give the same position only for a sprite as deep as the desk, which is 10 units. Every console sprite is between 28 and 54 units deep. The spec also does not say what happens when a sprite is larger than the 32-unit tile. · spec L34 ('Its anchor is its centre; it stands on the desk rectangle's centre ... with its back edge against the wall'). consoleModel.ts:L17 (DESK_D = 10) and L47 (a flush desk at y = -WALL_GAP = -10, so for a north wall its centre is at tile-local y -5). spec L29-32: the sprite sizes are 12x15 to 13x16 art px (30-32 units deep at 2x), the server rack 16x27 (54 units), the green machine 16x23 (46 units) and the med pod 24x14 (48 units wide). If the server rack's centre sits at y -5, it runs from y -32 to +22, so its back edge is 22 units inside the wall tile and not at the wall face (y -10). · One implementer centres the sprite on the desk, which buries the art in the wall. Another puts the back edge on the wall face, which pushes the art over the crew seat and into the next tile. The 'whole-art-pixel position' test cannot be written until one rule is chosen. The 48-unit med pod and the 54-unit rack also run into neighbouring tiles, and the spec neither accepts nor prevents that. · Keep one rule. Recommended: the back edge sits on the wall face. For a flush wall that is tile-local -WALL_GAP on the wall side, and for a non-flush wall it is the tile edge. Centre the sprite along the wall on the tile centre, rotate it about its centre, then shift it so the rotated back edge touches the face. State that sprites deeper or wider than a tile overlap the neighbouring tiles and that this is accepted, or else scale them down by whole art pixels. Then restate the rounding rule as 'top-left = floor to an even world unit'.

### [P2] R2-F2 The palette algorithm leaves the role of the kept colours in the k-means open
Step 2 does not say whether the kept Pimen colours are part of the k-means input. Nor does it say whether they count as existing centres for the farthest-point distance. It also does not say what happens to an empty cluster during the Lloyd iterations, or what happens if the kept count reaches 48 or more (k ≤ 0). · spec L51-53 (kept colours 'go into the palette exactly'; k = 48 minus the kept count; the init picks the colour that maximises the distance to the nearest centre; 'each centre snapping to the member colour nearest the weighted mean'). spec L58 lists a test for 'the k bound' without defining that bound. · The builder is now canonical and its output is committed (spec L57). Two implementers would get different palettes, and so different imported sheets. The 'k bound' test has no stated rule to check. · Add these rules: (a) the k-means runs only over the non-kept colours; (b) the kept colours seed the nearest-centre distance in the farthest-point init but are never moved; (c) an empty cluster keeps its previous centre; (d) if there are 48 or more kept colours the build fails with an error, otherwise k = 48 - kept, and the test checks exactly that.

## Prior findings
- R1-F1: resolved — Each console is now its own one-frame output bound by name (spec L28-32), so there is no padded cell. The new conflict between centring the sprite and backing it onto the wall is raised as a new finding.
- R1-F2: resolved — spec L21: LIMEZU_FOOT_ROW 31 and LIMEZU_HEAD_ROW 7 are measured offline, anchor y = 32/32. 'At load' is gone, and the test checks the constants (L71).
- R1-F3: resolved — spec L50-58: the algorithm is written out, the overrides are listed, the TS builder is canonical, and the owner-local check is that a re-run leaves git diff empty. The remaining ambiguities are raised as a new P2.
- R1-F4: resolved — With consoleArt the strip is not drawn (spec L35), and the overrides set failed to #e06715 (spec L55). palette.json:L75 is khaki today, so the override is needed and is listed.
- R1-F5: resolved — spec L41 and L44: interiorFeel owns the blasts and takes an optional blasts pair. They are plain Sprites framed from clock.t, which holds during a hitstop and a pause (interiorFeel.ts:L145-147). They are cleared on reset and on a layout change, which matches build() at L102-114.
- R1-F6: resolved — spec L43-45 settles the placement (centroid rounded to 2, the duel smoke tile, one spark per newly opened site at the site tile's centre), the 2x scale and 0.5 anchor, the shared cap of 4 cutting the oldest, and 'under the flash'. The flash is the last child of above (interiorFeel.ts:L90), so the blasts can be inserted before it.
- R1-F7: still open — The child container at index 0 is resolved. The 'no cursor with consoleArt' rule (spec L35, test at L71) has no owner, though. The cursor blink is drawn by interiorFeel into fixtures (interiorFeel.ts:L165-172), not by the console layer. createInteriorFeel's only new option is `blasts` (spec L41), so the feel cannot know consoleArt is on. Fix: add an optional `consoleArt?: boolean` (or `cursor: false`) to createInteriorFeel, passed by renderer.ts:L66 and duel/interiorView.ts:L45, and skip the screenCursor rect when it is set.
- R1-F8: resolved — spec L22: the carry offset is (31-7)*2+6 = 54 with crewArt, replacing the 30 at crewSprites.ts:L36. The plan checks the callouts, and the offset is in the tests (L71).
- R1-F9: resolved — spec L20: +90 degrees clockwise, anchor 0.5/0.5 at the crew position, and the foot anchor and rotation 0 are restored in every other state. Tested (L71).
- R1-F10: resolved — spec L20: a pure stationSides(state) built from consoles(), mapping each group member to its group's side, cached by layoutHash. Seated.station (crewSprites.ts:L82) indexes it directly. The s-wall overlap is accepted (L23).
- R1-F11: resolved — spec L63-67: a source URL, retrieved 2026-11-16 and a credit for each pack, the LimeZu terms quoted, and the Maru and Pimen terms recorded as an owner check in docs/gates.md. This meets the manifest.ts paid-entry requirements.
- R1-F12: resolved — spec L28: console.<STATION_IDS id> with all seven names listed. spec L36: createConsoleLayer(assets) with both call sites updated (renderer.ts:L63, duel/interiorView.ts:L49 today).

## Verified
- The crewArt names crew.p<k>.* do not collide with the existing 'crew' feature names, which are only crew.idle.<f>, crew.walk.<f> and crew.down (fallback.ts:L7). A fresh clone missing the new optional names still takes the Puny path.
- The four LimeZu outputs each have 52 frames of 16x32 with 24 columns: 4 standing in row 0, 24 in row y=32 and 24 in row y=64 (art/import.json L225-542 and its siblings). This matches spec L17.
- The console source rectangles at spec L29-32 match art/import.json: stations frames 0-3 at L76-97, machines frames 0, 1 and 4 at L39-66.
- The Pimen frame counts and sizes at spec L42 match art/import.json: explosion-hit has 11 frames of 16x16 (L1502-1572) and explosion-room has 14 frames of 32x32 (L1575-1663).
- The breach openings and site tile centres are available inside interiorFeel: breachOpenings at interiorFeel.ts:L157, and debrisBurst uses tileCentre(d.siteTile[site]) at sources.ts:L174-175.
- The duel smoke tile is picked inside onHit (interiorFeel.ts:L126), so the duel blast can reuse the same tile without a second random draw.
- Every override colour at spec L55 is already in the committed palette.json colours (L4-47).
- Seated.station is a station index (crewSprites.ts:L82), so a Side[] indexed by station from stationSides lines up with it.

## Not verified
- Whether LimeZu foot row 31 and head row 7 are correct for all four sheets: this needs the paid PNGs, which are outside the repo.
- Whether anchor y = 1 at the crew position puts the LimeZu feet where the Puny feet were. Puny uses anchor 0.75 on a 32-row frame (crewSprites.ts:L18), and the Puny foot row was not measured.
- Whether the Pimen kept-colour count is below 48, so that k > 0: this needs the pack PNGs.
- Whether the 54-unit carry offset fully clears the head once the torpedo's own drawn size (drawTorpedo size 20) is added. I did not read torpedoLayer.ts.

---

# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `a511101`. 3 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F6 and R1-F8 to R1-F12 as resolved; R1-F7 was reopened.

## R1-F7 [P2]: The cursor blink has no owner (reopened)

Confirmed: interiorFeel draws the cursor into the fixtures (interiorFeel.ts:L165-172), so the console layer cannot suppress it. Section 2 now adds an optional `consoleArt?: boolean` to `createInteriorFeel`. renderer.ts and duel/interiorView.ts pass `featureReady(missing, 'consoleArt')`, and when it is set the feel skips the cursor rect.

## R2-F1 [P1]: Console placement contradicts itself

Confirmed: DESK_D is 10 (consoleModel.ts:L17), while the sprites are 28 to 54 units deep. Section 2 now has a single rule: after rotation the back edge sits on the wall face (the line the procedural desk backs onto), the sprite is centred along the wall on the tile's centre line, and its top-left is floored to an even unit. The rack and the med pod overlapping the neighbouring floor is accepted, with no scaling.

## R2-F2 [P2]: The kept colours' role in the k-means is open

Confirmed. Section 4 now states that:
- k-means runs over the non-kept colours only;
- the kept colours seed the initialisation's nearest-centre distance and are never moved;
- an empty cluster keeps its previous centre;
- 48 or more kept colours fail the build;
- the test checks k = 48 minus the kept count and the failure.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md

<!-- end -->

---

