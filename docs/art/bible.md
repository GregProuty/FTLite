# FTLite art bible

Every art change follows this page: bought packs, the owner's own pixel art, and procedural shapes drawn in code.
Source: Art-i spec (`docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md`, section 1).

## Pixel size

- Art is drawn at **16 px per tile** and shown at **2x** (`TILE_PX` = 32 world units per tile). One art pixel is **2 world units**.
- Every procedural rectangle, stroke and particle is a whole number of art pixels: even world units, at even offsets.
  A stroke counts by the band it paints, not its path: Pixi 8 paints `alignment × width` inside the path and the rest outside,
  so the door panels use a 2-unit stroke with alignment 1 (inside) on an even rectangle.
- No sprite is rotated except by quarter turns (today the bought consoles, turned to their wall, and a downed crew member), and none is scaled except by whole numbers (the world scale is snapped so that one art pixel is a whole number of screen pixels; see `snapWorldScale` in `src/renderer/src/render/worldFit.ts`).
- Wall band: `PANEL_THICK` 12 units (6 art pixels) at `BAND` 10 from the tile edge, the same line and thickness as a door's panels.

## House palette

- One file: `src/renderer/src/render/palette.json`, written by `npm run art:palette` and read by the renderer (`palette.ts`) and by the import script (`npm run art:import`).
- `colours` is the whole palette; every **role** (a named use, such as `floor`, `wall`, `doorFill`) and every **ramp** colour must be one of them (a test checks).
- Code never writes a colour literal for the ship interior (`tiles.ts`, `doorModel.ts`, `wallModel.ts`, `effects.ts`): it reads `ROLE.<name>`. A test fails on any `0x` literal in those files.
- Imported art is remapped to the nearest palette colour (OKLab). Changing the palette means a rebuild and a re-import.
- The palette is built from the bought packs (Art-ii): `npm run art:palette` (`scripts/art/buildPalette.ts`) counts every opaque pixel of every distinct frame in `art/import.json`, keeps the explosion pack's colours exactly, fills the rest of the 48 colours by k-means in OKLab, maps the previous palette's roles and ramps onto the new colours, then applies `art/palette-overrides.json` (the fire ramp, the white ramp starts and eight roles set by hand). The same packs give the same bytes. Never edit `palette.json` by hand: change the overrides and rebuild.

## Outlines and light

- Crew and usable objects (consoles, doors, lockers, anything you press a key at) get a **dark coloured outline**: the darkest shade of their own ramp, never black.
- Floors and walls get **no outline**.
- Light comes from the **top-left**: walls carry a one-art-pixel `wallLight` edge on their top and left faces and a one-art-pixel `wallShadow` edge on their bottom and right faces. Bought or drawn art shades the same way.

## Value hierarchy

- Floors and walls are calm, dark mid-tones with low saturation; they are the stage, not the actors. (The Art-i-a placeholder floor, `c7cfcc`, is lighter than this on purpose, to keep today's look; the procedural floor role is still light, `#bad2e0` in the Art-ii pack palette. The bought Maru plating, `house.floor.*`, is what brings floors down to dark mid-tones.)
- Crew, consoles and hazards (fire, breaches, sparks) carry the strongest saturation and contrast, so the eye finds them first.
- Floors get only a quiet one-art-pixel `floorSeam` panel line per tile.

## Ramps

Each effect family uses one ramp, bright to dark, 5 to 8 palette colours, listed in `palette.json`. Particles step along their ramp by life; they are never blended smoothly.

| Ramp | Steps |
|---|---|
| `fire` | white, pale yellow, yellow, amber, orange, brown, slate, dark slate |
| `plasma` | white, pale blue, cyan, blue, steel blue, dark slate, navy |
| `electric` | white, pale blue, cyan, slate, dark slate |
| `vent` | white, pale blue, grey, teal, blue-grey |

## Bought art (paid packs)

- Files live in `public/assets/paid/` (gitignored); their manifest entries (licence `paid`, store URL, purchase date, credit line, `required: false`) are committed.
- A paid file replaces free art by taking over the free entry's name in a manifest edit, never by binding the same name twice.
- Packs are cut and remapped by `npm run art:import` from `art/import.json`; the source folder is `FTLITE_ASSETS`, else `C:\Users\djuar\FTLite-assets`, never inside the repo. Check `.art/contact.png` after every import.
- Registered paid names today, each group a feature that falls back as a whole when any name is missing:
  - `house.floor.0` to `house.floor.3` (`houseFloor`, Maru-98): the procedural floor without them.
  - `crew.p<k>.stand.<d>`, `crew.p<k>.idle.<d>`, `crew.p<k>.walk.<d>` for k 0-3, d n e s w (`crewArt`, LimeZu, 48 names): the tinted Puny crew without them. Player slot `pid % 4` wears sheet 04, 07, 13 or 19.
  - `console.<STATION_IDS id>` (`consoleArt`, Maru-98, 7 names): the procedural desks, screen strips and cursor blink without them.
  - `fx.blast.room`, `fx.blast.hit` (`blastArt`, Pimen): no blasts without them. `explosion-big.png` is imported but unbound.

## Adding a pack

1. Extract the pack outside the repo, under `C:\Users\djuar\FTLite-assets` (or the folder `FTLITE_ASSETS` names).
2. Add its frames to `art/import.json`: one output per sheet, and one output per sprite that is placed or rotated on its own (a one-frame output is exactly the art, with no padding from a shared cell).
3. Only when the palette should change: `npm run art:palette`. It reads every frame in `art/import.json`, so a new pack moves the palette; re-import everything after it.
4. `npm run art:import`, then look at `.art/contact.png`.
5. Bind the names in `public/assets/manifest.json`: licence `paid`, `required: false`, `source` the store page URL, `retrieved` the purchase date, the credit line, and `modifications` `frames cut and remapped to the FTLite house palette by npm run art:import` with `editedBy` `FTLite art import`. Register new names as optional in `src/renderer/src/render/assetNames.ts` and group them as a feature in `fallback.ts`, with a drawing path for when they are missing (a fresh clone has no paid files).
6. `npm run credits`, and commit the manifest, the generated notices and credits, `art/import.json` and (if rebuilt) `palette.json`, never the PNGs.
