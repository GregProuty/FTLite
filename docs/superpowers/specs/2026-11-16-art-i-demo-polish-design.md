# Art-i: demo polish for the ship interior

Date: 2026-11-16. Owner request: "I really, really want the game to start to look and feel good", using free and paid packs at 80/20 quality until an artist is hired or the owner learns pixel art. Scope chosen by the owner: the ship interior (the sector game's ship view and the Helm duel's interior walk share the same layers). Research: `reports/Premium pixel art and VFX.md`, `reports/Open art assets for FTLite.md`.

Process tier (grill Q31): views and feel, so one spec, one plan, a subagent build, one implementation review, and the owner's look as the gate. No sim, command, snapshot or authority change; SIM_VERSION and goldens do not move.

## Goal

The interior reads as one lit, living place with one pixel size and one palette, and hits feel heavy, before any paid art arrives. Paid art then drops in without code changes.

## Non-goals

The tactical duel view, the HUD and menus, new crew animation frames, normal-mapped lighting, new sim state.

## 1. Art bible (`docs/art/bible.md`)

One page that every later art change follows:
- **Pixel size:** art is drawn at 16 px per tile and shown at 2x (`TILE_PX` 32). No sprite is rotated or scaled except by whole numbers; effects particles are whole art pixels.
- **House palette:** one palette file, `public/assets/palette.json` (hex list, 32-48 colours), read by both the import script (section 3) and the renderer's procedural colours (section 4). Until the interior pack is bought it is a placeholder Lospec palette chosen in the plan; swapping the file recolours everything.
- **Outlines and light:** crew and usable objects get a dark coloured outline (the darkest shade of their own ramp, not black); floors and walls none. Light comes from the top-left.
- **Value hierarchy:** floors and walls are calm and dark mid-tones; crew, consoles and hazards carry the strongest saturation and contrast.
- **Ramps:** each effect family has one ramp of 5-8 palette colours, from bright to dark: fire (white, yellow, orange, red, brown, smoke grey), plasma and shields (white, cyan, blue, navy), electricity (white, pale blue, violet), venting (white, pale grey, blue-grey).

## 2. Paid assets in the manifest

- `licenses.ts` gains the licence `paid`. A paid entry must have `file` under `paid/`, `source` the store URL, `retrieved` (the purchase date), a `credit` line and `required: false`. The credits screen and `THIRD_PARTY_NOTICES.txt` list paid entries by credit line.
- `public/assets/paid/` is gitignored. The manifest entries (metadata only) are committed.
- A missing paid file falls back exactly as optional art does today (`featureReady`); a fresh clone runs on the free art.

## 3. Import script (`npm run art:import`)

- Reads `art/import.json` (committed): per output, the pack file path relative to the asset source folder, the frame rectangles, the output name and sheet layout. The source folder is `FTLITE_ASSETS` or `C:\Users\djuar\FTLite-assets` by default; it is never inside the repo.
- Remaps every opaque pixel to the nearest house-palette colour (distance in a perceptual space chosen in the plan, ties broken by palette order); alpha is kept as either 0 or 255 (threshold 128).
- Writes the PNGs into `public/assets/paid/` and a contact sheet (every output at 2x on the house background) to `out/art-contact.png` for the owner to look at.
- Deterministic: the same input bytes give the same output bytes. PNG reading and writing uses `pngjs` as a dev dependency (scripts only, never the renderer).
- Tests: the remap with a known palette; every output pixel is in the palette or transparent; determinism.

## 4. Pixel-perfect interior and palette-driven procedural art

- **Snapped world scale.** The screen pixels per art pixel are `2 × worldScale × stageScale`. A pure `snapWorldScale(fit, stageScale)` picks the largest `worldScale ≤ fit` that makes this a whole number; if that is below 0.75 × fit, it keeps `fit` (readability beats crispness). The duel interior (fit 1) and the Skiff are crisp at every stage scale of 1, 1.5, 2 and 3. The sector Cutter (fit 0.655) is crisp at stage 2 and above. World position and shake offsets round to whole screen pixels.
- **Procedural colours from the palette.** The tile layer's floor and wall colours, the door model's colours and the effects' tints read named roles (`floor`, `floorAlt`, `wall`, `wallLight`, `wallShadow`, ...) from a small `palette.ts` that maps roles to palette indices. Walls gain a 1 px top-left light edge and a 1 px bottom-right shadow edge; floors gain a quiet two-tone checker or panel seam (one art pixel), so the flat rectangles read as plating.
- **Floor art hook.** If house floor tiles (`house.floor.0..3`, bound only by imported art) are present, floors draw them instead of the procedural plating. Walls stay procedural thin bands (FTL-style thin walls, the owner 2026-11-13), coloured from the palette.

## 5. Light and colour grade layer

A new interior layer over the ship and under the callouts:
- **Ambient:** a multiply-blended darkening over the interior (one palette colour at a set strength).
- **Lights:** additive, posterised (3-4 alpha steps, hard edges) glow sprites at every console, at each fire tile and at alarm lamps (one per room, procedural). Fire lights flicker; consoles glow steadily, brighter when occupied.
- **Grade by state** (a pure `gradeModel` from state the renderer already reads; one adapter per mode, sector and duel):
  - *normal* — the ambient only;
  - *alert* — hull at or below half, or any fire aboard: alarm lamps on, a red multiply pulse of period 1.6 s over the walls and floors (crew, consoles and hazards stay untinted because they draw above the grade);
  - *vacuum* — rooms below the low-oxygen threshold get a cold blue tint in place of today's red low-O2 tint.
- Layer order inside the world: tiles, grade (multiply), effects below, icons, consoles, crew, boarders, effects above, lights (additive).

## 6. Code particles

- A small emitter (`render/particles/`): pooled `Sprite`s in one container per blend mode (normal and additive), textures of 1x1 to 3x3 art pixels, positions snapped to art pixels, colour stepped along an effect ramp by life (never smoothly blended). A cap of 600 live particles; past the cap the oldest go first.
- Its random source is its own seeded generator, never the sim's; nothing it does reads back into the sim.
- Emitters: fire embers rising and smoke drifting from fire tiles; sparks from damaged systems (duel repair rooms with level > 0, sector systems below full); a venting stream from breaches toward the hole; breach debris on the tick a breach opens.
- Crew working: a repairing crew member bobs 1 art pixel at 4 Hz with sparks at the repair tile; a crew member fighting fire bobs the same with pale foam particles. No new frames.

## 7. Impact feel

On a hull hit (the existing impact signal the effects layer reads): a 2-frame white flash on the hit room, a shake of 6 art pixels decaying over 0.25 s in whole-pixel steps, a hitstop of 60 ms in which particles, sprite animation and shake freeze while the sim and its interpolation keep running, and smoke that lingers 3 s at the hit tile. A `feel` setting (full, reduced, off) scales shake and flash; reduced halves them, off removes shake, flash and hitstop.

## 8. Ambient life

Console screens blink two palette colours at 1-2 Hz with per-console phase; one lamp per room flickers on a seeded schedule; steam puffs every 4-8 s from wall vents; a two-layer parallax starfield (whole-pixel stars, two speeds) behind the hull in space tiles.

## Testing and the gate

- Unit tests: `snapWorldScale` (each stage scale, each ship), palette roles, the remap, `gradeModel` per state, the emitter (cap, deterministic with a fixed seed, pixel snapping, ramp stepping), hitstop timing.
- All existing tests pass; SIM_VERSION and the goldens are unchanged.
- Screenshots by the known method (playwright-core plus Electron) of the sector Skiff, the sector Cutter at stage 2 and the duel interior in normal, alert and vacuum, attached to the review.
- **Owner gate:** the owner looks at the duel interior and the sector ship and says whether it "starts to look and feel good". The art swap (buying the interior pack, choosing the final palette, running the import) is a follow-up, Art-ii.
