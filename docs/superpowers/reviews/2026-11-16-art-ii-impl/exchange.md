# Codex review exchange: art-ii-impl

Subject: `art/import.json art/palette-overrides.json docs/art/bible.md docs/gates.md docs/superpowers/plans/2026-11-16-art-ii-bought-art.md docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md package.json public/THIRD_PARTY_NOTICES.txt public/assets/manifest.json scripts/art-palette.ts scripts/art/buildPalette.ts src/renderer/src/render/assetNames.ts src/renderer/src/render/blastModel.ts src/renderer/src/render/calloutModel.ts src/renderer/src/render/callouts.ts src/renderer/src/render/consoleLayer.ts src/renderer/src/render/consoleModel.ts src/renderer/src/render/credits.generated.ts src/renderer/src/render/crewArt.ts src/renderer/src/render/crewSprites.ts src/renderer/src/render/duel/interiorView.ts src/renderer/src/render/fallback.ts src/renderer/src/render/interiorFeel.ts src/renderer/src/render/palette.json src/renderer/src/render/renderer.ts tests/artImport.test.ts tests/blasts.test.ts tests/buildPalette.test.ts tests/consoleArt.test.ts tests/crewArt.test.ts tests/palette.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 133bf9f, effort high, 303 s, 3067841 in / 2936649 cached / 25568 out)

Verdict: ready

## Findings

### [P3] R1-F1 The art bible's palette text no longer matches the regenerated palette
The bible still says the Art-ii pack palette brings the floors down to dark mid-tones, and the ramps table still lists electric as 'white, pale blue, violet'. The regenerated ROLE.floor is #bad2e0, a light blue about as light as the old #c7cfcc. The electric ramp is now #fffff0 #bad2e0 #6daec3 #565972 #3a3a50, with no violet: #7a367b mapped to the slate #565972. · docs/art/bible.md:L31 ('Art-ii's pack palette brings floors down to dark mid-tones'), docs/art/bible.md:L43 (electric 'white, pale blue, violet'); diff L3839 (floor #bad2e0), diff L3889-L3895 (electric ramp). Neither bible line is in the Art-ii hunks (diff L1879, L1909). · The bible is the rule page for the next pack (the new 'Adding a pack' section points there), and it now describes colours the palette does not have. A fresh clone's procedural floor is still light. Arcs and electric particles lose their violet hue, which the owner may want to see at the look gate. · Update bible L31: the paid Maru plating is dark, but the procedural floor role stays light (#bad2e0). Update the electric row of the ramps table to the mapped steps, or add an `electric` override in art/palette-overrides.json if the owner wants violet back (#6c70a4 or #bea8d5 are in the palette).

### [P3] R1-F2 The callout lift per player (liftFor) has no test
callouts.ts picks the callout lift per player: Puny 0.6 tile, LimeZu standing 64, LimeZu downed or dead 26, and Puny whenever `crew` or `crewArt` is missing. No test drives createCalloutLayer to check it. crewArt.test.ts only checks the constants and bubbleAnchor's `lift` parameter. · diff L3124-L3131 (liftFor), diff L3150 (its use); tests/crewArt.test.ts at diff L4429-L4434 (only bubbleAnchor with an explicit lift); progress.md L302 (the Task 2 minor 'liftFor untested'). · A wrong feature check or downed check here (for example, the bubble left at 19.2 units, inside a LimeZu head, or a downed bubble floating 64 units over an empty tile) passes the suite. Plan Decision 6 promises this behaviour. · Add one test that builds createCalloutLayer with the fakeAssets from crewArt.test.ts, with and without crewArt. Draw one bubble for a conscious player and one for a downed player, then check each root.y against bubbleAnchor(..., CALLOUT_LIFT_LIMEZU / CALLOUT_LIFT_DOWN_LIMEZU / CALLOUT_LIFT_PUNY).y - 20 - TAIL.

### [P3] R1-F3 The palette builder reads frames without the importer's bounds check
countColours indexes `img.data` for every frame rectangle without checking that it fits the pack image. A rectangle past the edge reads undefined: `undefined < 128` is false, so the pixel counts as colour 0 (black) and can drag a k-means centre. runImport reports the same mistake as a problem, but art:palette runs before art:import. Related: an index override past a ramp's length leaves a sparse array (undefined goes into toHex), and tidyRamp throws on an empty ramp. · diff L2872-L2877 (no bounds check); scripts/art/importCore.ts:L134 (the importer's 'rectangle ... is outside' check); diff L2952 (index override), diff L2930-L2933 (tidyRamp on an empty list reads out[-1]); progress.md L301. · The committed config and overrides avoid all three cases, so today's palette is right. But the new 'Adding a pack' flow tells the owner to run art:palette right after editing art/import.json, and a typo there silently changes the palette instead of failing with a message. · In countColours, throw `art:palette: rectangle x,y wxh is outside <pack> (WxH)` when f.x + f.w > img.width or f.y + f.h > img.height, mirroring importCore.ts:L134. In mapRoles, reject an index override >= the ramp's length. Add one test for the out-of-bounds frame.

## Verified
- Determinism boundary: the diff's file list (diff headers L1-L4481) touches no file under src/renderer/src/sim, authority, src/network or src/shared. blastModel.ts only reads shared/resolution (diff L3036). assetNames.ts imports STATION_IDS from sim/stationKinds, a constant read (diff L2990). No sim RNG: the duel blast reuses the presentation emitter's draw for the smoke tile, with no second draw (diff L3663-L3667). tests/artGuards.test.ts:L39/L48 walk render/ automatically, so crewArt.ts and blastModel.ts are covered without editing that file. buildPalette.ts and pngjs are imported only from scripts/ and tests (diff L2804, L2832-L2836).
- Fresh-clone fallback: assets.ts:L76 marks every unloaded optional name missing. Every paid name is used only behind a feature check: crewSprites (useLimeZu = crew && crewArt, diff L3396; the paid stand texture only when useLimeZu, L3425; Puny path unchanged, L3446-L3453), consoleLayer (useArt, L3182/L3190; the procedural desk and strip otherwise), the feel (blasts only when opts.blasts, L3620-L3622/L3633/L3701; the cursor skipped only with consoleArt, L3713), and both views pass blasts and consoleArt from featureReady (renderer.ts L3943-L3944, interiorView.ts L3488-L3489). A grep of src for fx.blast, consoleArtName and crew.p names finds no other caller. Without blasts, `above` stays [particles, flash] (L3622; test L4109).
- Crew: facing4, crewSlot = pid % 4, stand/idle/walk frame indices in the order e, n, w, s (crewArt.ts diff L3304-L3348; the manifest matches limezuSheet, test L4419). Downed: stand.s, anchor 0.5/0.5, +pi/2, alpha 0.85. Dead: grey and opaque. Every other pose resets the anchor to 0.5/1 and rotation to 0 unconditionally after setAnim (crewSprites.ts:L94), so Downed to a seated-s pose (same texture name) still resets: the Task 2 minor is resolved by construction. stationSides is cached per layoutHash (L89). The walk phase is offset by StableId (L92). The carry lift is 54 with LimeZu, 30 with Puny (L3397/L3406).
- Consoles: STATION_IDS order matches the StationKind numbers (stationKinds.ts:L2-L4). consoleArtName uses the group's first member. SIDE_ROTATION n 0, e +pi/2, s pi, w -pi/2 turns the south-facing art into the room. consolePlacement backs onto the desk's outer edge (WALL_GAP = 10, consoleModel.ts:L20, even), is centred along the wall, floors the top-left to even units, and swaps the box for e/w (diff L3257-L3266; test L4250-L4265). The sprites go in a child container at index 0, under `g` and the feel's fixtures added later (consoleLayer L3180-L3181, renderer.ts L3948, interiorView.ts:L64). Tints are 0xffffff, 0xcccccc and 0x999999. Redraws happen only on a look or layout key (L3187-L3188). The one-frame console outputs in art/import.json:L1750-L1840 match the spec's rectangles.
- Blasts: one room blast per hit room at roomCentroid, rounded to even units. The duel's blast goes on the smoke's tile. One spark per breach opening at the siteTile centre. Cap 4 is shared and cuts the oldest (addBlast). The frame comes from clock.t after advance, so it holds through the hitstop and at dt 0 (interiorFeel.ts:L161-L163). Blasts are removed after the last frame and cleared on reset() and build() (diff L3649/L3732). They sit in `above`, under the flash. renderer.reset() calls feel.reset() on a new run (renderer.ts:L89), so no blast leaks across runs.
- Palette builder: farthest-point start weighted by ln(1 + count), with ties to the earlier colour (strict >) in (count desc, RGB asc) order. Kept colours seed `near` but are never centres. Up to 12 Lloyd iterations snap to member colours, an empty cluster keeps its centre, and the loop stops early. The output is sorted by OKLab L then RGB. Ramps are tidied and padded to 5. An override colour not in the palette fails the build. Output is JSON.stringify(…, 2) plus a newline, deterministic (diff L2862-L2975). A frame counted twice is counted once, and the console rectangles in art/import.json:L1754-L1835 equal the existing cuts at L39-L97, so the palette is unchanged by them (Decision 2).
- palette.json: 48 colours, and every role and ramp colour is in `colours` (checked by hand against diff L3760-L3902). The overrides are applied exactly as spec L55 lists them (art/palette-overrides.json, diff L1856-L1874). floorSeam = ambient (#a6a7a8) and wallLight = lampOff (#6c6e85) keep the equalities master already had (#a8b5b2 and #577277), as expected from nearest mapping. failed = #e06715 is the spec-mandated fault colour.
- Manifest and credits: every paid entry has licence paid, required false, retrieved 2026-11-16, the store URL and the credit line (manifest.json:L1046-L1211, diff L2124-L2266). parseManifest rejects a duplicate file or name (manifest.ts:L54-L62), which withdraws the Task 3 'no dup check' minor. explosion-big.png is imported (art/import.json:L1747) but unbound (test L4050). THIRD_PARTY_NOTICES and credits.generated.ts carry the LimeZu, Maru-98 and Pimen lines (diff L2073-L2109, L3281-L3285).
- Call sites: createConsoleLayer(assets) and createInteriorFeel(options) are updated in both views, and bubbleAnchor's new `lift` defaults to the old 0.6 tile (grep of src). The duel and the sector are wired the same way.
- Tests exercise the diff: buildPalette 7, crewArt 13, consoleArt 10, blasts 9 (counted in diff L4112-L4480), matching plan Decision 14. The artImport test replacement matches Decision 12.
- Leftovers: the Sonnet 5.5 commit trailers are accepted by the controller, so no finding. Of the Task 3 and 4 minors: the consoleArt check in three places is plan-mandated; the duplicated blasts literal and the redundant `timing && opts.blasts` are harmless; the duel test not pinning the smoke tile is correct by construction (the same `tile` variable, diff L3664-L3666).

## Not verified
- `tsc --noEmit` / `npx tsc -b` and lint were not run: this session has no shell tool, only Read, Grep and Glob. I read the types by hand and found no error; progress.md L306 records tsc ok in Task 6.
- The test suite was not run (forbidden). Pass status is taken from progress.md L306 (3530/3530).
- The owner-local check that `npm run art:palette` then `npm run art:import` leaves git diff empty needs the paid packs; progress.md L306 says CLEAN.
- The look of the screenshots in C:\Users\djuar\FTLite-shots\art-ii\, and whether the merged alert, lowO2, impact, doorSealed and failed colour (#e06715) and the alert multiply tint read well on screen. That is the owner's look gate.
- The run-dir ledger.md named in the brief does not exist at docs/superpowers/reviews/2026-11-16-art-ii-impl/ledger.md. Only the untracked prompt and stderr files are listed in git status. This is round 1, so prior is empty.
- Read beyond the manifest: I grepped assets.ts, manifest.ts, stationKinds.ts, derived.ts, importCore.ts and tests/artGuards.test.ts, and read art/import.json, the docs/art/bible.md ramps table and interiorFeel.ts L150-L179, to trace the fallback, the ordering and the dedup claims.

---

# Round 1 response (fixes in 95e275e)

Reviewed `round-1.json` against the branch at `133bf9f`. 3 accepted, 0 rejected, 0 deferred. After the fix: `npx tsc -b` is clean, the full suite passes (3532 tests in 251 files), and `art:palette` + `art:import` + `git diff --exit-code` prints CLEAN.

## R1-F1 [P3]: The bible's palette text no longer matches

Confirmed: ROLE.floor is #bad2e0 and the electric ramp has no violet. The bible now says the procedural floor role stays light and the bought Maru plating is what makes floors dark. The fire, plasma, electric and vent rows describe the actual palette.json steps.

## R1-F2 [P3]: liftFor has no test

Confirmed. crewArt.test.ts now drives createCalloutLayer with and without crewArt, for a conscious and a downed player, and checks each bubble against bubbleAnchor with the matching lift. BitmapText is mocked in that file, as hudSlots.test.ts does, because node cannot measure text.

## R1-F3 [P3]: The palette builder has no bounds check

Confirmed against importCore.ts:L134. countColours now throws on a rectangle outside its pack, mapRoles rejects an index override past the ramp's length, and tidyRamp throws on an empty ramp. A test covers the out-of-bounds frame using a temp-dir PNG.

## Also changed

- (nothing)

## Files changed

- docs/art/bible.md
- tests/crewArt.test.ts
- scripts/art/buildPalette.ts
- tests/buildPalette.test.ts

<!-- end -->

---

