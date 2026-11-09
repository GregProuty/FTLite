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
- **In-house pieces are drawn by the owner** in Aseprite to the brief in §5 and dropped into `public/assets/art/`. Every in-house piece has a placeholder (today's Graphics shapes) so a missing file degrades, never crashes.
- **Per-player identity is a tint** on one crew body exported with a light-grey outfit (Pixi `tint` multiplies colours, so the base must be light).
- **The owner downloads the packs** into `public/assets/raw/<pack>/` (and later drops in-house exports into `public/assets/art/`) and performs the §12 per-asset verification; the implementer wires them.
- **Art scale:** 16 px native, drawn at 2x (`TILE_PX = 32`), nearest-neighbour scaling everywhere.
- **Tile rendering** is a container of plain sprites, not `@pixi/tilemap`; the parent spec §7 is amended to say so.
- **Geometry of the anchor packs** (resolved here, not left to inspection): Puny Characters frames are 32×32 with a roughly 16 px figure; the crew sprite is anchored at (0.5, 0.75) and placed at the crew member's sim position, so the feet sit at the bottom of the 0.6-tile collision box. Cozy Space front walls are 16×32. A wall tile gets the tall front-wall sprite (anchored bottom-left on the wall tile, extending one tile upward) **only when the tile above it is not a floor** (void or another wall); a wall tile with a floor directly above it (the bottom walls of the starter's lower rooms, and the shared boundary rows) gets the flat 16×16 `wall.flat` frame so no floor is ever covered. Wall sprites are added in row order so lower walls draw over upper ones; the crew layer draws above all tiles (no y-sorting against walls in this pass; the resulting overlap when a crew member stands directly under a tall wall is accepted).

## 3. Asset layout and manifest

```
public/                       # Vite public dir: copied verbatim into out/renderer/ at build
  assets/
    raw/                      # third-party packs exactly as downloaded (git-tracked)
      cozy-space-interiors/   # OGA upload, CC-BY 4.0
      puny-characters/        # CC0
      reactorcore-fire-smoke/ # CC0
      kenney-pixel-ui/        # CC0
      kenney-input-prompts/   # CC0
      m5x7/                   # CC0 (TTF)
    art/                      # owner's Aseprite exports and derived edits
      crew/  tiles/  fx/  icons/
    manifest.json
  THIRD_PARTY_NOTICES.txt     # generated directly here by scripts/gen-credits.ts (§6); shipped inside the app
src/renderer/src/render/licenses.ts   # the allow-list (see below)
```

**Delivery into the built app.** `electron.vite.config.ts` sets `renderer.publicDir` to the repo-root `public/`, so Vite copies `public/assets/**` and the notices file into `out/renderer/`, which `electron-builder.yml` already packages (`out/**/*`). The loader fetches `./assets/manifest.json` relative to `index.html`, which works both under the dev server and from `file://` in the packaged app. `electron-builder.yml` additionally lists `public/THIRD_PARTY_NOTICES.txt` under `extraResources` so a plain-text copy also lands in the installed app's `resources/` folder for anyone who never opens the game. The gate (§8) includes `npm run build` and a check that `out/renderer/assets/manifest.json` and `out/renderer/THIRD_PARTY_NOTICES.txt` exist.

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
  "required": true,
  "sheet": {
    "frameW": 16, "frameH": 32,
    "frames": { "door.closed": 0, "door.sealed": 4 },
    "animations": { "door.open": { "frames": [0, 1, 2, 3], "fps": 12, "loop": false } }
  }
}
```

- `sheet` is optional (fonts, single images: those bind one name via `"name": "ui.panel"`). Frame indices are row-major over the grid. `frames` binds **static names** to frame indices; `animations` binds names to `{frames, fps, loop}`. A 9-slice UI image adds `"nineSlice": { "left": 4, "top": 4, "right": 4, "bottom": 4 }` in source pixels.
- **Name contract.** `src/renderer/src/render/assetNames.ts` lists every name the renderer uses, grouped: tiles (`floor.0..3`, `wall.flat`, `wall.plain`, `wall.vent`, `wall.pipes`, `wall.screen`, `door.closed`, `door.sealed`, `door.open`), hazards (`breach.h`, `breach.v`, `floor.damaged.0..1`, `fire.loop`, `vent.puff`, `fx.arc`), crew (`crew.idle.<dir>`, `crew.walk.<dir>` for the 8 directions `n ne e se s sw w nw`, `crew.down`, `crew.sit`), icons (`icon.fire`, `icon.oxygen`, `icon.breach`, `icon.door`, `icon.repair`, `icon.medical`, `icon.power`, `icon.sensors`, `icon.weapons`, `icon.navigation`), ui (`ui.panel`, `ui.bar.bg`, `ui.bar.fill`, `prompt.kb.E`, `prompt.kb.F`, `prompt.kb.Q`, `prompt.kb.Enter`, `prompt.kb.ShiftRight`, `prompt.kb.Backspace`, `prompt.pad.A`, `prompt.pad.X`, `prompt.pad.B`), font (`font.m5x7`). Each name is marked required or optional in that file. Consumers in this pass: `icon.fire` and `icon.breach` prefix threat-list lines, `icon.repair` sits beside a repair Interact prompt and `icon.door` beside a seal/unseal Confirm prompt, `icon.oxygen` marks the low-oxygen HUD state; `icon.medical/power/sensors/weapons/navigation`, `crew.sit` and `fx.arc` are bound (optional) but have no consumer until Increment 2a. All in-house names are optional; all pack names are required. The assets test asserts every required name is bound exactly once across the manifest, no name is bound twice, and every bound name is in the list (so a typo cannot silently become dead art). Swapping a pack is then a manifest edit plus the test.
- **`required`** (default true): a required file that is missing or unloadable stops startup (§7); an optional file is a planned in-house piece whose absence selects the placeholder. The in-house entries of §5 are present in the manifest from Task 1 with `required: false`, so their bindings exist before the files do.
- **Provenance of derived files.** A file in `public/assets/art/` that is an edit of a third-party asset keeps that asset's `title`, `author`, `source`, `license` and `credit`, with `modifications` describing the edit and `editedBy` naming the owner (for example `crew/body_base.png`: Puny Characters, Shade, CC0-1.0, "outfit recoloured to light grey for runtime tinting"). Only pieces drawn from scratch use `"license": "original"`, `author` = the owner, `source` = `"assets/art"`, no `archived`.
- `src/renderer/src/render/licenses.ts` exports the allow-list as SPDX-style ids: `CC0-1.0`, `CC-BY-3.0`, `CC-BY-4.0`, `OGA-BY-3.0`, `OFL-1.1`, `original`; `CC-BY-SA-4.0` is allowed only when `modifications` is `"none"`. Anything else fails the assets test. This mirrors §12 and is the single place the rule lives in code.
- A zod schema (`src/renderer/src/render/manifest.ts`) validates the manifest; the same schema is used by the test, the loader and the credits script.

## 4. Renderer changes

All in `src/renderer/src/render/` plus three contained changes in `app/session.ts`: the lobby credits sub-state (§4 Credits), a `deviceKind` per player derived from `SlotInfo.key`, and a `renderer.reset()` call in `start()`. Nothing in `sim/` or `input/` changes.

- **`assets.ts`:** `loadAssets(manifestUrl): Promise<GameAssets>`. Loads the manifest, validates it, loads every referenced PNG with Pixi `Assets.load` and `scaleMode: 'nearest'`, slices sheets by the frame grid into `Texture[]`, installs the m5x7 `BitmapFont` at 16 px with nearest scaling. Exposes `texture(name)`, `animation(name)` (returning `{textures, fps, loop}`), `nineSlice(name)` and `missing: string[]` (optional names whose file is absent or failed). Pure helpers, tested under node: `sliceGrid(imageW, imageH, frameW, frameH): Rect[]`, `facingFromDelta(dx, dy, previous): Facing8`, `pickVariant(seedIndex, count): number`.
- **Tile layer:** a `Container` of `Sprite`s built once from the layout. Floor variant per room and wall variant (plain / vent / pipes / screen) come from `pickVariant` over the room index and tile index, so the ship looks identical every run. The tile layer is rebuilt only when the layout changes (never in Increment 1).
- **Doors** are reconciled, not event-driven, because several ticks can pass per rendered frame and a Sealed→Closed or Open→Sealed change may skip states. Per door the renderer keeps `{ progress: number }` (0 = closed, 1 = open, fractional in between). Pure `advanceDoor(progress, target: 0 | 1, dtSeconds, DOOR_ANIM_SECONDS): number` moves `progress` towards the target by `dt / DOOR_ANIM_SECONDS` (0.25 s) and clamps. Displayed texture: if the door is Sealed, the `door.sealed` static frame regardless of progress (sealing is instant); otherwise `door.open` frame `round(progress × (n − 1))`. Target is 1 for Open and 0 for Closed or Sealed, so a door unsealed while closed shows frame 0 at once and a door sealed mid-animation resumes from its progress when unsealed. Initial progress on load is 1 for Open, else 0. `advanceDoor` and the texture choice are tested as pure logic for every state pair, including skipped states and 60 Hz calls with fractional remainders.
- **Hazards:** a breach shows the wall-damage decal over the site tile (`breach.h` for a site on a top or bottom wall, `breach.v` for a side wall, decided from which neighbour is the room's floor tile) plus `vent.puff` while active, positioned on the site tile and oriented away from that floor tile (the vent direction is the vector from the floor tile to the site tile). The **damaged floor** overlay goes on floor tiles, never wall tiles: for a breach, the 4-neighbour floor tiles of the site that belong to the breached room; for a fire, every tile that displayed a flame. The overlay persists for the run in render-only memory keyed by tile index. A burning room shows `fire.loop` sprites on a deterministic subset of its tiles, the count `ceil(fire / FIRE_CAP × tiles)`, chosen by `pickVariant` order so the subset grows stably, each with a frame offset from the tile index so they do not pulse in unison. Low oxygen keeps the existing tint overlay, using the pack palette's red, threshold `frac < 0.98` so a full ship draws nothing.
- **Crew:** one `AnimatedSprite` per crew member: 8 facings from `facingFromDelta` over interpolated position deltas (last non-zero delta kept while idle), `crew.walk.<dir>` while moving, `crew.idle.<dir>` while still, `crew.down` while Downed, greyscale tint while Dead. Per-player colour via `sprite.tint` from the existing `CREW_COLORS`. The sprite cache stays keyed by `StableId` through `syncCache`.
- **Run reset.** The renderer keeps per-run memory (damaged-floor set, facing history, previous positions, door frame indices). `renderer.reset()` clears all of it; `session.start()` calls it before the first draw of a new run, so a restart never shows the last run's scorch marks or facings. Memory lives in a pure `RenderMemory` object with its own unit test (two runs through one object).
- **HUD (`hud.ts`):** Kenney Pixel UI 9-slice panels (`NineSliceSprite`, borders from the manifest) behind the ship block, the threat list and each player block; m5x7 `BitmapText` for all text; health and progress bars as sprite bars. `HudPlayer.prompt` is split into `interactPrompt` and `confirmPrompt` (each a string, empty when none), and `buildHudModel` gains `deviceKind: 'kb0' | 'kb1' | 'pad' | null` per player (`kb:0` → `kb0`, `kb:1` → `kb1`, `gp:*` → `pad`, `null` key or empty/reconnect slot → `null`). Each non-empty prompt is drawn with its glyph: Interact → `prompt.kb.E` / `prompt.kb.Enter` / `prompt.pad.A`; Confirm → `prompt.kb.F` / `prompt.kb.ShiftRight` / `prompt.pad.A`'s sibling `prompt.pad.X`; no glyph when `deviceKind` is `null`. Cancel is shown only on the lobby and game-over banners (`prompt.kb.Q` / `prompt.kb.Backspace` / `prompt.pad.B`).
- **Credits screen** is a lobby sub-state `creditsOpen` in `session.ts`: Cancel from any *active* (joined) slot opens it (before anyone has joined there is no routed input, so a player joins first; the lobby banner says so); while open, joins and reclaims are suspended (`DeviceManager.update` is called with `allowJoin: false` and reclaim edges are ignored for that frame), Confirm and Cancel both close it and Confirm does **not** start the run; up/down on any active player's stick scrolls (one line per 150 ms while held); a frame with both Confirm and Cancel pressed closes it (Cancel wins, nothing else happens). `buildHudModel` gains `credits: string[] | null` and `creditsScroll: number`. Session tests: open, scroll, close by Cancel, close by Confirm without starting, simultaneous Confirm+Cancel, a new device pressing Interact while credits are open does not join.
- **Placeholders:** for every optional name in `missing`, the renderer falls back to today's Graphics for that feature (breach square, fire rectangle, crew circle, no venting puff, no damaged floor, no glyphs). The HUD shows nothing about missing art; the assets test reports it (§6).

## 5. In-house art brief

All at 16 px native (crew at the pack's 32×32 frame), Cozy Space Interiors palette, PNG sheets in `public/assets/art/`, frames left-to-right in one row unless stated. Each is a manifest entry from Task 1 with `required: false`; pieces drawn from scratch are `"license": "original"`, the crew export keeps Puny Characters' provenance (§3).

| File | Frames | Notes |
|---|---|---|
| `tiles/breach.png` | 2 (horizontal wall, vertical wall) | Wall-damage decal drawn over the wall tile: black void behind, torn metal edge |
| `tiles/floor_damaged.png` | 2 variants | Scorch and debris; overlays a floor tile that has burned or been breached |
| `crew/body_base.png` | Puny Characters layout (32×32 frames): 8 facings × (idle, walk 4 frames), plus `down` (1 frame) | Derived from Shade's Puny Characters (CC0), outfit recoloured to light grey (about `#c8c8c8`) so `tint` works; skin and hair unchanged; manifest keeps Shade as author with the recolour as `modifications` |
| `crew/sit.png` | 1 frame | Reserved for 2a consoles; optional in this pass |
| `fx/vent.png` | 6 frames | Oxygen puff, white/blue, directed from the breach into space |
| `fx/arc.png` | 4 frames | Electric arc for 2a power failures; optional in this pass |
| `icons/hazards.png` | 10 × 16x16: fire, oxygen, breach, door, repair, medical, power, sensors, weapons, navigation | 1-bit style matching the Kenney prompts; only fire/oxygen/breach/door/repair are used in this pass |

## 6. Credits, CI and testing

- **`scripts/gen-credits.ts`** reads the manifest and writes two committed outputs: `public/THIRD_PARTY_NOTICES.txt` (grouped by licence; verbatim credit lines; licence URLs; the full OFL text if an OFL font is ever added; CC-BY entries list title, author, source, licence, modifications as CC-BY 4.0 requires) and `src/renderer/src/render/credits.generated.ts` (a `string[]` for the credits screen). `npm run credits` runs it. A test regenerates into memory and fails if the committed outputs are stale.
- **`tests/assets.test.ts`:** the manifest validates against the schema; every file under `public/assets/raw` and `public/assets/art` is manifested (an unmanifested file fails); every `required` manifested file exists; an optional file may be absent and is then listed in the test output as a warning; every licence is on the allow-list and CC-BY-SA entries have `modifications: "none"`; every `sheet` grid divides the PNG's dimensions exactly (dimensions read from the PNG IHDR chunk with a 20-line parser, no new dependency); every frame and animation index is in range; every required name in `assetNames.ts` is bound exactly once, no name is bound twice, every bound name is listed; every CC-BY entry has a non-empty `credit` and an `archived` URL; derived `art/` files name a third-party author only together with that asset's licence and a non-empty `modifications`.
- **Render helpers** (`sliceGrid`, `facingFromDelta`, `pickVariant`, `advanceDoor` and the door texture choice, the tall-vs-flat wall choice, the fire-tile subset selection, damaged-floor tile mapping for a breach site, `RenderMemory.reset`, placeholder fallback selection) are pure and unit-tested. Session tests cover the credits sub-state. Pixi itself is not run under node.
- **Build check:** `npm run build` then assert `out/renderer/assets/manifest.json` and `out/renderer/THIRD_PARTY_NOTICES.txt` exist (a vitest test that runs only when `out/` is present, plus a line in the gate checklist).
- **Manual gate:** `npm run dev` shows the Cozy Space ship with animated doors and tinted Puny crew; doors open on approach and show the sealed frame when sealed, including after a seal/unseal while another door is mid-animation; a fire shows animated flames whose count grows; a breach shows the decal (or the placeholder square if the decal is not drawn yet) and the vent puff points outward; a restart shows no scorch marks from the previous run; the HUD uses the bitmap font and panels with the right glyph per device; the credits screen opens from the lobby and Confirm closes it without starting; the packaged build (`npm run dist`, installed) shows the same art; `docs/gates.md` Increment 1 items still pass. Record the result in `docs/gates.md` under a new "Art pass" section.

## 7. Error handling

- A manifest that fails validation stops startup with the zod message on the DOM (same path as an invalid ship, §9 of the parent spec).
- A `required` file that is missing or fails to load stops startup with a message listing the files (third-party packs are required). An optional file that is missing or fails to load is placeholder art: the name goes into `missing`, a console warning names the file, and the feature uses its Graphics fallback. An unmanifested file is a test failure, not a runtime condition.
- The m5x7 font is a required third-party file, so a failed font load is a startup error like any other required asset; there is no runtime font fallback.

## 8. Build order (gated increments)

1. **Manifest, names and credits:** `public/` dir and `publicDir` config, `licenses.ts`, `assetNames.ts`, zod schema, `tests/assets.test.ts`, `scripts/gen-credits.ts`, `extraResources` in `electron-builder.yml`, every pack and every planned in-house entry manifested (owner downloads and verifies; implementer wires). *Gate:* assets test green with the real files; `THIRD_PARTY_NOTICES.txt` generated; `npm run build` ships the assets.
2. **Loader, tile layer and doors:** `assets.ts`, `RenderMemory`, floors, walls, reconciled door animation replacing the Graphics tiles. *Gate:* ship renders from sprites; doors animate correctly through every state pair.
3. **Crew sprites:** facing, idle/walk/down, tinting, grey when Dead, run reset. *Gate:* four tinted crew walk and fall; a restart clears facings.
4. **Effects:** fire, breach decal, venting, damaged floor, low-oxygen tint threshold. *Gate:* hazards readable at a glance in a playtest; damaged floors reset on restart.
5. **HUD and credits:** panels, bitmap font, split prompts with device glyphs, credits sub-state. *Gate:* the manual gate in §6.

## 9. Known unknowns

Outline-style compatibility between Cozy Space Interiors, Puny Characters, Reactorcore and Kenney packs is unverified until seen together at 2x; the exact frame layout of each sheet is confirmed only after download; Puny Characters' death animation length and whether its last frame reads as "downed" rather than "dead" need a look; the OGA upload of Cozy Space Interiors may lag the itch edition (fewer wall variants, in which case `wall.vent/pipes/screen` bind to the same frame as `wall.plain` until drawn). These change frame tables and bindings in the manifest. The geometry decisions in §2 (anchors, wall overlap, no y-sorting) are design decisions made here; if the packs' actual canvases differ from the research, revisit §2 before Task 2.
