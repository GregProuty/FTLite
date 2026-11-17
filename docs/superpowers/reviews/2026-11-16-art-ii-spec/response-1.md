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
