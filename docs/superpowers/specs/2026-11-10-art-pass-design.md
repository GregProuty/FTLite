# FTLite Art Pass — Design

**Date:** 2026-11-10. **Status:** approved by the owner in conversation; this is the written spec.
**Parent spec:** `2026-11-09-foundation-design.md` (§7 Rendering, §12 Licence and sourcing rules as amended 2026-11-09).
**Research:** `research/Open art assets for FTLite.md` and the notes in `research_notes/Open art assets for FTLite/`.

## 1. Goal

Replace the placeholder visuals of Increments 0-1 (flat-colour tiles, circles for crew, tinted rectangles for hazards, monospace text) with open-licence pixel art plus a short list of in-house pieces, behind an assets manifest that proves provenance and generates the credits. No simulation change: the sim, its hashes, goldens and the Increment 1 gate are untouched.

**Out of scope:** console, weapon, debris and power art (Increment 2a plan), audio, animation of anything the sim does not already model, a build-time texture atlas, Aseprite-as-source-of-truth.

## 2. Decisions

- **Anchor packs:** *Cozy Space Interiors* by Spaceyyy, the OpenGameArt upload (CC-BY 4.0; the itch edition is a no-redistribution house licence and is not used), for floors, walls and the animated sliding door; *Puny Characters* by Shade (CC0) for crew bodies. Effects from Reactorcore *Fire Smoke Animations* (CC0); UI chrome from Kenney *Pixel UI* and *1-Bit Input Prompts 16x* (CC0); font *m5x7* by Daniel Linssen (CC0).
- **Pipeline A, grid-sliced sheets, no build step:** PNGs are shipped as downloaded; the manifest records provenance and, for sheets, the frame grid and named animations; the renderer slices at load.
- **In-house pieces are drawn by the owner** in Aseprite to the brief in §5 and dropped into `assets/art/`. Every in-house piece has a placeholder (today's Graphics shapes) so a missing file degrades, never crashes.
- **Per-player identity is a tint** on one crew body exported with a light-grey outfit (Pixi `tint` multiplies colours, so the base must be light).
- **The owner downloads the packs** into `assets/raw/` and performs the §12 per-asset verification; the implementer wires them.
- **Art scale:** 16 px native, drawn at 2x (`TILE_PX = 32`), nearest-neighbour scaling everywhere.

## 3. Asset layout and manifest

```
assets/
  raw/                       # third-party packs exactly as downloaded (git-tracked)
    cozy-space-interiors/    # OGA upload, CC-BY 4.0
    puny-characters/         # CC0
    reactorcore-fire-smoke/  # CC0
    kenney-pixel-ui/         # CC0
    kenney-input-prompts/    # CC0
    m5x7/                    # CC0 (TTF)
  art/                       # owner's Aseprite exports (original)
    crew/  tiles/  fx/  icons/
  manifest.json
  licenses.ts                # the allow-list (see below)
```

`manifest.json` is an array; one entry per shipped file:

```json
{
  "file": "raw/cozy-space-interiors/door_slide.png",
  "title": "Cozy Space Interiors",
  "author": "Spaceyyy",
  "source": "https://opengameart.org/content/<page>",
  "archived": "https://web.archive.org/web/<stamp>/<page>",
  "license": "CC-BY-4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
  "retrieved": "2026-11-10",
  "modifications": "none",
  "credit": "\"Cozy Space Interiors\" by Spaceyyy (https://aquumgifts.itch.io/cozy-space-complete), CC-BY 4.0",
  "sheet": { "frameW": 16, "frameH": 16, "animations": { "doorOpen": [0, 1, 2, 3] } }
}
```

- `sheet` is optional (fonts, single images). Frame indices are row-major over the grid. `animations` names are the only names the renderer uses, so a pack can be swapped by editing the manifest.
- In-house files use `"license": "original"`, `author` = the owner, `source` = `"assets/art"`, no `archived`.
- `assets/licenses.ts` exports the allow-list as SPDX-style ids: `CC0-1.0`, `CC-BY-3.0`, `CC-BY-4.0`, `OGA-BY-3.0`, `OFL-1.1`, `original`; `CC-BY-SA-4.0` is allowed only when `modifications` is `"none"`. Anything else fails the assets test. This mirrors §12 and is the single place the rule lives in code.
- A zod schema (`src/renderer/src/render/manifest.ts`) validates the manifest; the same schema is used by the test, the loader and the credits script.

## 4. Renderer changes

All in `src/renderer/src/render/`; nothing in `sim/`, `app/` or `input/` changes except the lobby's Cancel binding for the credits screen (in `app/session.ts`).

- **`assets.ts`:** `loadAssets(manifestUrl): Promise<GameAssets>`. Loads the manifest, validates it, loads every referenced PNG with Pixi `Assets.load` and `scaleMode: 'nearest'`, slices sheets by the frame grid into `Texture[]`, installs the m5x7 `BitmapFont` at 16 px with nearest scaling. Exposes `texture(name)` and `animation(name)`. Pure helpers, tested under node: `sliceGrid(imageW, imageH, frameW, frameH): Rect[]` and `facingFromDelta(dx, dy, previous): Facing8`.
- **Tile layer:** a `Container` of `Sprite`s built once from the layout. Floor variant per room and wall variant (plain / vent / pipes / screen) are chosen deterministically from the room index and tile index, so the ship looks identical every run. Door tiles are `AnimatedSprite`s driven by door state: play `doorOpen` on Closed→Open, play it reversed on Open→Closed, show the `doorSealed` frame while Sealed. The tile layer is rebuilt only when the layout changes (never in Increment 1); door sprites update per frame from state.
- **Hazards:** a breach shows the in-house wall-damage decal over the site tile (horizontal or vertical variant by wall orientation) plus the venting puff animation while active; a burning room shows fire `AnimatedSprite`s on a deterministic subset of its tiles, the count growing with intensity (`ceil(fire / FIRE_CAP × tiles)`), each with a frame offset from the tile index so they do not pulse in unison; a damaged-floor overlay appears on tiles that have burned or been breached and stays for the run (render-only memory keyed by tile index, not sim state). Low oxygen keeps the existing tint overlay, using the pack palette's red, threshold `frac < 0.98` so a full ship draws nothing.
- **Crew:** one `AnimatedSprite` per crew member from the Puny Characters body: 8 facings from `facingFromDelta` over interpolated position deltas (last non-zero delta kept while idle), `walk` while moving, `idle` while still, `down` (last death frame) while Downed, greyscale tint while Dead. Per-player colour via `sprite.tint` from the existing `CREW_COLORS`. The sprite cache stays keyed by `StableId` through `syncCache`.
- **HUD (`hud.ts`):** Kenney Pixel UI 9-slice panels (`NineSliceSprite`) behind the ship block, the threat list and each player block; m5x7 `BitmapText` for all text; health and progress bars as sprite bars; an input-prompt glyph next to each prompt chosen from the player's device key (`kb:*` → key cap for E/Enter, `gp:*` → pad button) using Kenney 1-Bit Input Prompts; the `buildHudModel` contract gains a `deviceKind: 'kb0' | 'kb1' | 'pad'` per player, derived in `session.ts` from `SlotInfo.key`.
- **Credits screen:** in the lobby, Cancel opens a scrolling credits panel listing `credits.generated.ts`; Cancel again closes it. Game-over and running phases are unchanged.
- **Placeholders:** `assets.ts` returns a `missing: string[]` list of planned in-house files not present; the renderer falls back to today's Graphics for those features (breach square, fire rectangle, crew circle, no venting puff, no damaged floor, no glyphs). The HUD shows nothing about missing art; the assets test reports it (see §6).

## 5. In-house art brief

All at 16 px native, Cozy Space Interiors palette, PNG sheets in `assets/art/`, frames left-to-right in one row unless stated. Each lands as its own manifest entry with `"license": "original"`.

| File | Frames | Notes |
|---|---|---|
| `tiles/breach.png` | 2 (horizontal wall, vertical wall) | Wall-damage decal drawn over the wall tile: black void behind, torn metal edge |
| `tiles/floor_damaged.png` | 2 variants | Scorch and debris; overlays a floor tile that has burned or been breached |
| `crew/body_base.png` | Puny Characters layout: 8 facings × (idle, walk 4 frames), plus `down` (1 frame) | Export from the pack with the outfit recoloured to light grey (about `#c8c8c8`) so `tint` works; skin and hair unchanged |
| `crew/sit.png` | 1 frame | Reserved for 2a consoles; optional in this pass |
| `fx/vent.png` | 6 frames | Oxygen puff, white/blue, directed from the breach into space |
| `fx/arc.png` | 4 frames | Electric arc for 2a power failures; optional in this pass |
| `icons/hazards.png` | 10 × 16x16: fire, oxygen, breach, door, repair, medical, power, sensors, weapons, navigation | 1-bit style matching the Kenney prompts; only fire/oxygen/breach/door/repair are used in this pass |

## 6. Credits, CI and testing

- **`scripts/gen-credits.ts`** reads the manifest and writes two committed outputs: `THIRD_PARTY_NOTICES.txt` (grouped by licence; verbatim credit lines; licence URLs; the full OFL text if an OFL font is ever added; CC-BY entries list title, author, source, licence, modifications as CC-BY 4.0 requires) and `src/renderer/src/render/credits.generated.ts` (a `string[]` for the credits screen). `npm run credits` runs it. A test regenerates into memory and fails if the committed outputs are stale.
- **`tests/assets.test.ts`:** the manifest validates against the schema; every file under `assets/raw` and `assets/art` is manifested and every manifested file exists; every licence is on the allow-list and CC-BY-SA entries have `modifications: "none"`; every `sheet` grid divides the PNG's dimensions exactly (dimensions read from the PNG IHDR chunk with a 20-line parser, no new dependency); every animation index is in range; every CC-BY entry has a non-empty `credit` and an `archived` URL; the planned in-house files in §5 that are missing are listed in the test output as a warning, not a failure (optional ones excluded).
- **Render helpers** (`sliceGrid`, `facingFromDelta`, the fire-tile subset selection, placeholder fallback selection) are pure and unit-tested. Pixi itself is not run under node.
- **Manual gate:** `npm run dev` shows the Cozy Space ship with animated doors and tinted Puny crew; doors open on approach and show the sealed frame when sealed; a fire shows animated flames whose count grows; a breach shows the decal (or the placeholder square if the decal is not drawn yet); the HUD uses the bitmap font and panels; the credits screen opens from the lobby; `docs/gates.md` Increment 1 items still pass. Record the result in `docs/gates.md` under a new "Art pass" section.

## 7. Error handling

- A manifest that fails validation stops startup with the zod message on the DOM (same path as an invalid ship, §9 of the parent spec).
- A manifested PNG that fails to load (missing or corrupt) is treated as missing art: the feature falls back to its placeholder and the file is listed in `missing`; a console warning names it. Third-party packs are required (startup error if absent), in-house files are optional.
- A font that fails to load falls back to the current monospace `Text` style.

## 8. Build order (gated increments)

1. **Manifest and credits:** `licenses.ts`, zod schema, `tests/assets.test.ts`, `scripts/gen-credits.ts`, the two anchor packs plus effects, UI and font packs manifested (owner downloads and verifies; implementer wires). *Gate:* assets test green with the real files; `THIRD_PARTY_NOTICES.txt` generated.
2. **Loader and tile layer:** `assets.ts`, floors, walls, animated doors replacing the Graphics tiles. *Gate:* ship renders from sprites; doors animate.
3. **Crew sprites:** facing, idle/walk/down, tinting, grey when Dead. *Gate:* four tinted crew walk and fall.
4. **Effects:** fire, breach decal, venting, damaged floor, low-oxygen tint threshold. *Gate:* hazards readable at a glance in a playtest.
5. **HUD and credits:** panels, bitmap font, prompts with device glyphs, credits screen. *Gate:* the manual gate in §6.

## 9. Known unknowns

Outline-style compatibility between Cozy Space Interiors, Puny Characters, Reactorcore and Kenney packs is unverified until seen together at 2x; the exact frame layout of each sheet is confirmed only after download; Puny Characters' death animation length and whether its last frame reads as "downed" rather than "dead" need a look; the OGA upload of Cozy Space Interiors may lag the itch edition (fewer wall variants). Any of these may change the frame tables in the manifest, not the design.
