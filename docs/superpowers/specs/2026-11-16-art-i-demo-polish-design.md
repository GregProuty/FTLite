# Art-i: demo polish for the ship interior

Date: 2026-11-16. Owner request: "I really, really want the game to start to look and feel good", using free and paid packs at 80/20 quality until an artist is hired or the owner learns pixel art. Scope chosen by the owner: the ship interior (the sector game's ship view and the Helm duel's interior walk share the same layers). Research: `reports/Premium pixel art and VFX.md`, `reports/Open art assets for FTLite.md`.

Process tier (grill Q31): views and feel. Art-i is two milestones, each with its own plan, subagent build, one implementation review and the owner's look as the gate:
- **Art-i-a, pipeline and crispness:** sections 1-4.
- **Art-i-b, light and feel:** sections 5-8.

No sim, command, snapshot or authority change in either; SIM_VERSION and goldens do not move. The renderer only reads sim state, never the sim RNG.

## Goal

The interior reads as one lit, living place with one pixel size and one palette, and hits feel heavy, before any paid art arrives. Paid art then drops in without code changes for every name Art-i registers (section 2).

## Non-goals

The tactical duel view, the HUD, menus and a settings screen, new crew animation frames, normal-mapped lighting, new sim state, fire or oxygen in the duel.

## 1. Art bible (`docs/art/bible.md`) — Art-i-a

One page that every later art change follows:
- **Pixel size:** art is drawn at 16 px per tile and shown at 2x (`TILE_PX` 32), so one art pixel is 2 world units. Every procedural rectangle, stroke and particle is a whole number of art pixels (even world units, at even offsets). No sprite is rotated or scaled except by whole numbers.
- **House palette:** one file, `src/renderer/src/render/palette.json` (section 4), read by the import script and the renderer.
- **Outlines and light:** crew and usable objects get a dark coloured outline (the darkest shade of their own ramp, not black); floors and walls none. Light comes from the top-left.
- **Value hierarchy:** floors and walls are calm, dark mid-tones; crew, consoles and hazards carry the strongest saturation and contrast.
- **Ramps:** each effect family has one ramp of 5-8 palette colours, bright to dark, listed in `palette.json`: `fire` (white, yellow, orange, red, brown, smoke grey), `plasma` (white, cyan, blue, navy), `electric` (white, pale blue, violet), `vent` (white, pale grey, blue-grey).

## 2. Paid assets in the manifest — Art-i-a

- `manifest.ts`: the file regex becomes `^(raw|art|paid)\/[^\s]+$`. `licenses.ts` gains the licence `paid`, excluded from `LICENSE_URLS` like `original`.
- `superRefine` rules: licence `paid` ⇔ file under `paid/`; a paid entry must have `required: false`, `source` a URL (the store page), `retrieved` (the purchase date) and a `credit` line. No two entries may bind the same name (a paid file replaces free art by taking over the free entry's name in a manifest edit, never by shadowing it).
- Notices (`creditsText.ts`): a paid entry prints its title, author, credit line and `Licence: paid (commercial licence, <licenseUrl or source>)`; the credits screen lists its credit line.
- `public/assets/paid/` is added to `.gitignore`. The manifest entries (metadata only) are committed.
- **Registered names:** `house.floor.0` to `house.floor.3` are added to `ASSET_NAMES` as optional and grouped as the feature `houseFloor` in `FEATURE_NAMES`. A missing paid file falls back through `featureReady` like any optional art; a fresh clone runs on the free art. The packaged build copies whatever is in `public/` at build time, so a build made without `paid/` ships the fallback.

## 3. Import script (`npm run art:import`) — Art-i-a

- Reads `art/import.json` (committed): per output, the pack file path relative to the asset source folder, frame rectangles, output file and sheet layout. The source folder is `FTLITE_ASSETS`, else `C:\Users\djuar\FTLite-assets`; never inside the repo.
- **Validates everything first, writes nothing on failure:** a missing source folder, a missing pack file, a frame rectangle outside its image, or an output path outside `public/assets/paid/` each produce one line; the script lists every problem and exits 1.
- Remaps every opaque pixel to the nearest house-palette colour in OKLab (ties broken by palette order); alpha becomes 0 or 255 (threshold 128).
- Writes the PNGs into `public/assets/paid/` and a contact sheet (every output at 2x on the palette's `background` role) to `.art/contact.png` (gitignored, outside `out/`).
- Deterministic: the same input bytes give the same output bytes. PNG reading and writing uses `pngjs` as a dev dependency (scripts only, never the renderer).
- Tests: the remap with a known palette; every output pixel is a palette colour or transparent; determinism; each validation failure.

## 4. Pixel-perfect interior and palette-driven procedural art — Art-i-a

**Snapped fit.** Screen pixels per art pixel = `2 × worldScale × stageScale`. A pure `snapWorldScale(fit, stage)`: `n = floor(2 × fit × stage)`; if `n ≥ 1` and `n / (2 × stage) ≥ 0.75 × fit` the scale is `n / (2 × stage)`, else `fit` (readability beats crispness). `worldFit` and `duelFit` take the stage scale and return the snapped `{ scale, x, y }`, re-centred in their band, with `x` and `y` rounded so `x × stage` and `y × stage` are whole. The renderer passes that same object to the callouts and the projectiles; the stage scale comes from the letterbox on every resize, and a resize resets the projectile layer's cached paths (they are presentation only). Expected table (tested):

| ship / band | stage 1 | 1.5 | 2 | 2.5 | 3 |
|---|---|---|---|---|---|
| duel interior, any ship (fit 1) | 1 | 1 | 1 | 1 | 1 |
| sector Skiff (fit 1) | 1 | 1 | 1 | 1 | 1 |
| sector Cutter (fit 0.655) | 0.5 | 0.655 (kept) | 0.5 | 0.6 | 0.5 |
| sector starter (fit 0.76) | 0.76 (kept) | 0.667 | 0.75 | 0.6 | 0.667 |

"Kept" means the snapped scale fell below 0.75 × fit, so the fit is used unsnapped (not crisp). The Cutter's 24 % shrink at stage 1 is accepted. Below stage 1 (a window smaller than 1280 × 720) `n` can be 0 and the fit is kept.

**Procedural art on the art-pixel grid.** Walls and doors become whole art pixels: `PANEL_THICK` 12 with `BAND` 10 (12 + 10 + 10 = `TILE_PX`; today they are 11 and 10), jambs, ticks, seal bar and the panel outline stroke even and at even offsets, vent specks 2 or 4 world units at even positions. A unit test checks every `wallPicture` and `doorPicture` rectangle has even x, y, w and h. Walls gain a one-art-pixel light edge on their top and left faces and a one-art-pixel shadow edge on their bottom and right; floors gain a quiet two-tone panel seam, one art pixel wide, every tile.

**Palette.** `palette.json` holds `{ colours: hex[], roles: { [role]: hex }, ramps: { [ramp]: hex[] } }` and is imported statically by the renderer and the import script (changing it means a rebuild). Roles: `background`, `floor`, `floorSeam`, `wall`, `wallLight`, `wallShadow`, `doorFill`, `doorOutline`, `space`, `ambient`, `alert`, `vacuum`, `flash`, `lampOn`, `lampOff`, `screenA`, `screenB`. A test checks every role and ramp colour is in `colours`. The tile layer, the door model and the effects read roles instead of their module constants. Until the interior pack is bought, `colours` is a placeholder Lospec palette the plan picks and records; Art-ii replaces it with the pack's own.

**Floor art hook.** When the `houseFloor` feature is ready, floors draw `house.floor.N` (N chosen by a hash of the tile index) instead of the procedural plating. Walls stay procedural thin bands (the owner, 2026-11-13).

## 5. Light and colour grade — Art-i-b

**Containers.** Two new containers inside each interior world: `grade` (multiply) right above the tiles, and `lights` (additive) above everything that shows the ship but under text. Exact `addChild` orders:
- sector (`renderer.ts`): tiles, grade, effects.below, icons, consoleDesks, magazine, crew, boarders, effects.above, lights;
- duel (`interiorView.ts`): tiles, grade, effects.below, icons, desks, damage, crew, boarders, effects.above, lights, marks, labels.
Crew, consoles and hazards draw above the grade, so its tint never reaches them. Multiply and add are basic blend modes in Pixi 8 (the plan confirms no advanced-blend import is needed).

**Grade model.** A pure `gradeModel(input, timeSeconds)` returns `{ ambient: number; alert: boolean; pulse: number; vacuum: { room: number; strength: number }[] }`; alert and vacuum are independent and can both be on.
- `ambient`: the `ambient` role multiplied over the floors and walls at a fixed strength.
- `alert`: hull fraction ≤ 0.5 or any fire aboard. While on, `pulse = 0.5 − 0.5 cos(2π t / 1.6)` drives an `alert`-role multiply over the floors and walls at up to 0.35 strength, and each room's lamp shows `lampOn`.
- `vacuum`: every room whose oxygen fraction is below `LOW_O2_THRESHOLD` (0.98), strength `LOW_O2_MAX_ALPHA × (1 − frac)` as today; it replaces today's red low-O2 tint (`o2Layer`, normal blend) with the `vacuum` role's colour.

**Adapters** build the input:
- sector: hull fraction = `state.hull / HULL_MAX` (`sim/tuning.ts`); fire aboard = any fire tile; per-room oxygen as `effects.ts` reads it today.
- duel: hull fraction = `d.tactical.systems[CREW_SLOT].hull` over that ship class's `hull` (`sim/tactical/defs.ts`); fire aboard and vacuum are always off (the duel runs no fire or oxygen).

**Lights.** Posterised glow sprites (3-4 alpha steps, hard edges, drawn from the palette): at every console (steady; brighter when occupied), at every fire tile (flickering), and at each room's lamp. A room's lamp sits on its top-left floor tile at a fixed art-pixel offset. In the duel the repair labels and markers draw above the lights, so they are never washed out. The duel's existing damage tint keeps its own colours and draws above the grade, so it stacks with the alert pulse by design.

## 6. Code particles — Art-i-b

- An emitter (`render/particles/`): pooled `Sprite`s in two containers (normal and additive), textures of 1x1 to 3x3 art pixels, positions snapped to art pixels, colour stepped along one ramp by life (never smoothly blended). At most 600 live particles; past the cap the oldest go first.
- Its random source is its own generator seeded from the layout hash; it never reads the sim RNG and nothing it does reads back into the sim.
- **Emitters and their signals:**
  - fire embers rising and smoke drifting, from each fire tile (sector only);
  - sparks from each failed station (`stations.failed[i] === 1`, sector) and each damaged duel repair room (tactical level > 0, at its repair tile); the sparks add to the existing `fx.arc`;
  - a venting stream from each breach toward its hole, and debris on the tick a breach opens (sector);
  - crew working: a working crew member bobs 1 art pixel at 4 Hz with sparks at the target (foam particles when the target is a fire). Sector working = conscious, unseated, `interactTarget(state, player)` is a fire, breach or station repair, and that target's repair progress rose since the previous drawn tick (kept in `RenderMemory`). Duel working = a repair-work event for that player in the latest tick's `d.events`.

## 7. Impact feel — Art-i-b

- **Hit signal.** Sector: a room's `rooms.impactTick` equal to the current tick (today's signal). Duel: `hitsCrew(e)` over the tick's view events (the same feed the tactical effects read).
- **On a hit:** a white `flash`-role flash on the hit room (in the duel, the whole interior at half strength, since its hits carry no room) for 2 sim ticks (33 ms); a shake of 6 art pixels decaying linearly over 0.25 s in whole-art-pixel steps; a hitstop of 60 ms; smoke at the hit room for 3 s (sector) or at a random interior floor tile chosen by the particle generator (duel).
- **Replaces, not stacks:** the new shake replaces the sector shake (`SHAKE_*` in `projectileModel.ts`) and the duel interior shake from `fxModel.ts`; the white flash replaces the red `impactLayer` flash. The shake moves the sector world and projectiles container (as today), and in the duel only the interior world (the readout column and tactical view keep their own behaviour).
- **Hitstop:** a presentation clock in the renderer stops for 60 ms: particles, sprite animation and shake freeze; the sim, its interpolation and the flash's tick count keep running.
- **Feel setting:** `localStorage` key `ftlite-feel`, values `full` (default), `reduced`, `off`, read once at boot inside a try/catch like the other storage reads in `main.ts`; a pure `feelScale(setting)` returns `{ shake, flash, hitstop }` multipliers (1/1/1, 0.5/0.5/1, 0/0/0) and is unit-tested. No menu UI in Art-i; a dev key (F9) cycles it in dev builds only.

## 8. Ambient life — Art-i-b

- Console screens blink between `screenA` and `screenB` at 1-2 Hz, the phase per console from the particle generator.
- Each room's lamp (section 5) flickers on a schedule from the particle generator when not in alert.
- Steam puffs every 4-8 s from wall vents: wall tiles next to a floor tile, picked where `hash(layoutHash, tile) mod 8 = 0`.
- A two-layer starfield in a container under the world, filling the view's band (sector `WORLD_BAND`, duel `INTERIOR_BAND`), stars of one art pixel at whole-pixel positions, the layers drifting left at 4 and 10 art px/s (the ship is "flying"); the ship's floors and walls cover it.

## Testing and the gates

- Unit tests: `snapWorldScale` (the table), even-grid procedural rectangles, palette roles and ramps, the paid manifest rules and notices, the remap and import validation, `gradeModel` (alert, vacuum, both, neither), both adapters, the emitter (cap, deterministic with a fixed seed, pixel snapping, ramp stepping), the working derivations, `feelScale`, hitstop timing.
- All existing tests pass; SIM_VERSION and the goldens are unchanged.
- Screenshots by the known method (playwright-core plus Electron): Art-i-a — the sector Skiff at stage 1.5, the sector Cutter at stages 1 and 2, the duel interior; Art-i-b — the duel interior normal and alert, the sector ship in alert and in vacuum (a breached room).
- **Owner gates:** after Art-i-a, the owner looks at crispness and the palette; after Art-i-b, whether it "starts to look and feel good". Buying the interior pack, choosing the final palette and running the import is Art-ii.
