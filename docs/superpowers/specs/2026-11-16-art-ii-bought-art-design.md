# Art-ii: the bought art in the ship interior

Date: 2026-11-16. The owner bought Maru-98's Mars colony sets, LimeZu's Modern Interiors and Pimen's Explosion VFX (`reports/Premium pixel art and VFX.md`), extracted to `C:\Users\djuar\FTLite-assets\` (outside the repo). Branch `art-ii` already holds the import checkpoint: `art/import.json` (floors, consoles and machines, furniture, lockers, four premade crew, three explosions), a 42-colour house palette built from those frames with fire, flash, lamp and alert taken from the explosion pack, and the dark Maru plating bound to `house.floor.0..3` (no grates, the owner 2026-11-16). This spec puts the rest of the imported art on screen.

Process tier (grill Q31): views and art, so one spec, one plan, a subagent build, one implementation review, and the owner's look as the gate. No sim, command, snapshot or authority change; SIM_VERSION and goldens do not move.

## Goal

Crew, consoles and hits use the bought art, so the interior stops looking like placeholder geometry, and the tools that made the palette live in the repo so a later pack can be added the same way.

## Non-goals

Set dressing (beds, lockers, crates placed in rooms: the layout has no prop data yet; a later Art-iii), boarders (stay on Puny), the tactical view, HUD and menus, a drawn downed pose, new sim state.

## 1. Crew: one LimeZu character per player

- **Assets.** The four imported sheets `paid/limezu/crew_04.png`, `crew_07.png`, `crew_13.png`, `crew_19.png`: 16 x 32 frames, 24 per row, 52 frames; frames 0-3 standing, 4-27 idle, 28-51 walk; each group in the order right, up, left, down (LimeZu's layout), 6 frames per direction for idle and walk. Manifest entries bind per-slot names that do not collide with the existing required `crew.*` names (which stay bound to Puny for the fallback and for boarders): `crew.p<k>.stand.<d>` (frame), `crew.p<k>.idle.<d>` (6 frames, 6 fps, loop) and `crew.p<k>.walk.<d>` (6 frames, 10 fps, loop), for slot k in 0-3 and d in e, n, w, s. They are registered as optional names in `ASSET_NAMES` and grouped as the feature `crewArt` (all 48 names).
- **Who wears which.** Player slot `Owner.pid % 4` picks sheet k (0 = 04, 1 = 07, 2 = 13, 3 = 19). With `crewArt` ready the per-player tint (`CREW_COLORS`) is not applied, since the look identifies the player; dead crew keep the grey tint.
- **Facing.** A pure `facing4(f: Facing8)`: n and s as they are; e, ne, se to e; w, nw, sw to w.
- **States.** Standing still: the idle animation for the facing. Walking: the walk animation, phase offset by the crew id as today. Seated: the standing frame facing the console's wall side, from a pure `stationSides(state): Side[]` built from `consoles()` (each member of a console group maps to its group's side), cached by `layoutHash`. Downed: the standing s frame rotated +90 degrees (clockwise) about the body's centre: anchor 0.5/0.5 and positioned at the crew position, so the body lies across the crew's own tile, at 85 % alpha; dead the same, grey. Any other state restores the foot anchor and rotation 0.
- **Size and anchor.** A frame is 16 x 32 art pixels at 2x (32 x 64 world units). The feet are on row 31 and the head starts at row 7 in all four sheets (measured offline from the standing frames; constants `LIMEZU_FOOT_ROW = 31`, `LIMEZU_HEAD_ROW = 7` with a comment saying so). Foot anchor y = `(LIMEZU_FOOT_ROW + 1) / 32` = 1, x 0.5; the feet stand where the Puny feet stood (the crew position).
- **Things above the head.** The carried torpedo moves to `(LIMEZU_FOOT_ROW - LIMEZU_HEAD_ROW) * 2 + 6` = 54 world units above the crew position with `crewArt` (30 today). Callouts are already placed per crew position by the callout layer; the plan checks their offset against the taller sprite and raises it the same way if it overlaps.
- **Draw order.** Crew stay above consoles. A crew member seated at a south-wall console overlaps the console's art; accepted for Art-ii.
- **Fallback.** Without `crewArt` (a fresh clone) the crew draw exactly as today (Puny, tinted, 8 facings).

## 2. Consoles: Maru machines at the stations

- **Assets.** Each console sprite is its own one-frame output in `art/import.json` (so the image is exactly the art, no padding), bound by `name` as `console.<id>` with `<id>` from `STATION_IDS` (`console.navigation`, `console.weapons`, `console.science`, `console.engineering`, `console.lifeSupport`, `console.medbay`, `console.doors`): optional names, feature `consoleArt`.
  - navigation, weapons, science, doors: the four orange console variants (habitable building, sprites at 18,17 12x15; 50,17 12x15; 82,16 13x16; 113,17 13x15), in that order;
  - engineering: the server rack (tilesets 80,22 16x27);
  - lifeSupport: the green machine (tilesets 16,28 16x23);
  - medbay: the med pod (tilesets 112,33 24x14);
  - a console group uses its first member's sprite.
- **Placement.** The sprite replaces the procedural desk. Its anchor is its centre; it stands on the desk rectangle's centre (from `deskPicture`), with its back edge against the wall: the art is drawn facing south (back to a north wall), and for an e, s or w wall it rotates by quarter turns about its centre. The position rounds so the sprite's top-left lands on a whole art pixel (odd sizes such as 13 x 15 round the centre down).
- **State.** `free`: plain; `occupied`: tint at 80 % brightness; `down`: tint at 60 % brightness. With `consoleArt` the procedural screen strip and Art-i-b's cursor blink are not drawn (their positions belong to the procedural desk); the console glows stay, off for `down` as today.
- **Layer.** `createConsoleLayer(assets)` (both call sites updated). The sprites go into a child container inserted at index 0 of the console layer's container, so the Art-i-b fixtures (lamps) stay above them. The layer still redraws only when a console's look or the layout changes.
- **Fallback.** Without `consoleArt` the procedural desks, screen strips and cursor blink draw as today.

## 3. Explosions on hits

- **Owner.** The interior feel (`interiorFeel.ts`) owns the blasts: it already sees the hits (Art-i-b section 7) and the breach openings. `createInteriorFeel` gains an optional `blasts?: { room: GameAnimation; hit: GameAnimation }`, passed by the sector renderer and the duel interior view when the feature `blastArt` is ready.
- **Assets.** `paid/pimen/explosion-room.png` (14 frames, 32 x 32) and `explosion-hit.png` (11 frames, 16 x 16) bound as one-shot animations `fx.blast.room` (20 fps) and `fx.blast.hit` (24 fps), optional, feature `blastArt`. `explosion-big.png` stays imported but unbound until a ship-death view exists.
- **When and where.** One room blast per hit room, centred on the room's centroid (the mean of its tile centres, in world units, rounded to 2) in the sector; in the duel one room blast at the floor tile the hit smoke already picks. One hit spark per newly opened breach site, at the site tile's centre. Scale 2x, anchor 0.5/0.5.
- **Timing.** Plain `Sprite`s, not `AnimatedSprite`: each draw sets the texture to frame `floor((clock.t - start) * fps)` from the presentation clock, so blasts hold during the hitstop and while paused, and are removed after the last frame. One shared cap of 4 live blasts; a fifth cuts the oldest. `reset()` and a layout change clear them.
- **Layer.** In the feel's `above` container, under the flash Graphics, normal blend.
- **Fallback.** Without `blastArt` nothing extra draws (the Art-i-b flash, shake, smoke and debris remain).

## 4. The art tools in the repo

- **`scripts/art/buildPalette.ts` (`npm run art:palette`)**, canonical from now on. Algorithm:
  1. Input: every opaque pixel (alpha >= 128) of every frame in `art/import.json`, counted per RGB colour. Colours from outputs whose pack path starts with `pimen-explosions/` are "kept": they go into the palette exactly.
  2. k-means in OKLab with k = 48 minus the number of kept colours: initial centres by farthest-point, starting from the most frequent colour, each next centre the colour maximising (squared OKLab distance to the nearest centre) x ln(1 + count), ties to the earlier colour in (count descending, then RGB ascending) order; then up to 12 Lloyd iterations, each centre snapping to the member colour nearest the weighted mean, stopping early when the centres stop changing.
  3. Palette = centres plus kept colours, deduplicated, sorted by OKLab lightness.
  4. Roles and ramps: each current role colour maps to its nearest palette colour; each ramp maps entry by entry, dropping repeats, padded to 5 with the colours nearest its last entry.
  5. Overrides: `art/palette-overrides.json` (committed with this spec's build) replaces roles and ramps by name: the fire ramp `#fffff0 #feef98 #f8ca1c #faae1e #f68420 #944510 #596686 #3a3a50`, the first entry of plasma, electric and vent `#fffff0`, and the roles flash `#fffff0`, fireFallback `#f68420`, lampOn `#f8ca1c`, heldTick `#f8ca1c`, ventSpeck `#fffff0`, alert `#e06715`, breach `#944510`, failed `#e06715` (failed reads as a fault, not the khaki the mapping gave).
  6. Writes `src/renderer/src/render/palette.json`; deterministic (same inputs, same bytes).
- **Regeneration.** The build runs `npm run art:palette` and then `npm run art:import` on the owner's machine and commits the palette it produces (it may differ slightly from the checkpoint's, which came from a scratch script); re-running both afterwards leaves `git diff` empty, which is the owner-local acceptance check.
- **Tests** use generated PNGs in a temp folder, never the owner's asset folder: determinism, kept colours present, overrides applied, every role and ramp colour in the palette, the k bound.
- **The art bible** (`docs/art/bible.md`) gains an "Adding a pack" section: extract outside the repo, add frames to `art/import.json` (one output per sprite that is placed or rotated on its own), `npm run art:palette` (only when the palette should change), `npm run art:import`, check `.art/contact.png`, bind names in the manifest with licence `paid`, the store URL, the purchase date and the credit line, `npm run credits`.

## 5. Licences and credits

Paid manifest entries (licence `paid`, `required: false`, `retrieved: 2026-11-16`):
- Maru-98: source `https://maru-98.itch.io/`, credit `Mars colony pixel art by Maru-98 (maru-98.itch.io)` (already on the branch for the floors).
- LimeZu: source `https://limezu.itch.io/moderninteriors`, credit `Modern Interiors by LimeZu (limezu.itch.io)`. The pack's LICENSE.txt allows commercial use and editing, forbids resale and redistribution of the asset, and requires credit.
- Pimen: source `https://pimen.itch.io/explosion-effect`, credit `Explosion VFX by Pimen (pimen.itch.io)`.
- The Maru-98 and Pimen packs ship no licence text; their store pages' terms (commercial use, credit) are an owner check before any public release, recorded in `docs/gates.md`.

## Testing and the gate

- Unit tests: `facing4`; the slot-to-sheet pick; the foot anchor and the carry offset from the row constants; the downed rotation and its reset; `stationSides` (a group's members share a side); the console name per kind, the quarter turn per side and the whole-art-pixel position; the look tints; with `consoleArt`, no strip or cursor; blast scheduling (one per hit room, one spark per opening, cap 4 cutting the oldest, frame from the presentation clock, held at dt 0, removed after the last frame, cleared on reset); the palette builder (above); each feature missing draws as today.
- All existing tests pass; SIM_VERSION and the goldens are unchanged.
- Screenshots (the Art-i-b harness): the duel interior and the sector Skiff and Cutter, normal and with a hit and a fire; saved to `C:\Users\djuar\FTLite-shots\art-ii\`.
- **Owner gate:** the owner looks at the crew, consoles and hits and says whether the interior now looks like a game.
