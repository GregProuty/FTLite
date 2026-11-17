# Art-ii: the bought art in the ship interior

Date: 2026-11-16. The owner bought Maru-98's Mars colony sets, LimeZu's Modern Interiors and Pimen's Explosion VFX (`reports/Premium pixel art and VFX.md`), extracted to `C:\Users\djuar\FTLite-assets\` (outside the repo). Branch `art-ii` already holds the import checkpoint: `art/import.json` (floors, consoles and machines, furniture, lockers, four premade crew, three explosions), a 42-colour house palette built from those frames with fire, flash, lamp and alert taken from the explosion pack, and the dark Maru plating bound to `house.floor.0..3` (no grates, the owner 2026-11-16). This spec puts the rest of the imported art on screen.

Process tier (grill Q31): views and art, so one spec, one plan, a subagent build, one implementation review, and the owner's look as the gate. No sim, command, snapshot or authority change; SIM_VERSION and goldens do not move.

## Goal

Crew, consoles and hits use the bought art, so the interior stops looking like placeholder geometry, and the tools that made the palette live in the repo so a later pack can be added the same way.

## Non-goals

Set dressing (beds, lockers, crates placed in rooms: the layout has no prop data yet; a later Art-iii), boarders (stay on Puny), the tactical view, HUD and menus, a drawn downed pose, new sim state.

## 1. Crew: one LimeZu character per player

- **Assets.** The four imported sheets `paid/limezu/crew_04.png`, `crew_07.png`, `crew_13.png`, `crew_19.png` (16 x 32 frames, 24 per row; frames 0-3 standing, 4-27 idle, 28-51 walk; each group in the order right, up, left, down, 6 frames per direction for idle and walk). Manifest entries (licence `paid`, credit `Modern Interiors by LimeZu (limezu.itch.io)`, which the LimeZu licence requires) bind per-slot names: `crew.p<k>.stand.<d>`, `crew.p<k>.idle.<d>` (6 frames, 6 fps, loop), `crew.p<k>.walk.<d>` (6 frames, 10 fps, loop), for slot k in 0-3 and d in e, n, w, s. Registered as optional names in `ASSET_NAMES` and grouped as the feature `crewArt`.
- **Who wears which.** Player slot `Owner.pid % 4` picks sheet k (0 = 04, 1 = 07, 2 = 13, 3 = 19). The per-player tint (`CREW_COLORS`) is dropped when `crewArt` is ready, since the look identifies the player; dead crew keep the grey tint.
- **Facing.** The renderer's 8 facings fold to 4: n and s as they are; e, ne, se to e; w, nw, sw to w.
- **States.** Standing still: the idle animation for the facing (it breathes). Walking: the walk animation, phase offset by the crew id as today. Seated at a console: the standing frame facing the console's wall side (n wall: face n). Downed: the standing s frame turned a quarter turn (the art bible allows quarter turns) at 85 % alpha; dead: the same, grey.
- **Size and anchor.** A frame is 16 x 32 art pixels, shown at 2x (32 x 64 world units, a tile wide and two tall). The anchor puts the feet where the Puny feet were: x 0.5, and y at the frame's lowest opaque row (measured once per sheet at load, not hard-coded).
- **Fallback.** Without `crewArt` (a fresh clone) the crew draw exactly as today (Puny, tinted).

## 2. Consoles: Maru machines at the stations

- **Assets.** `paid/maru/stations.png`, `machines.png` (and the frame list in `art/import.json`) bound as `console.<kind>` names, one per station kind, optional, feature `consoleArt`:
  - Navigation, Weapons, Science, Doors: the four orange console variants (stations frames 0-3), in that order;
  - Engineering: the server rack (machines frame 0);
  - Life support: the green machine (machines frame 1);
  - Medbay: the med pod (machines frame 4);
  - a combined console (a console group) uses its first member's kind.
- **Placement.** The sprite replaces the procedural desk: centred on the desk rectangle `deskPicture` already computes, its back to the console's wall. The art is drawn facing south (its back to a north wall); for an e, s or w wall it turns in quarter turns. Positions round to whole art pixels.
- **State.** The console's look still shows: `free` draws the sprite plain; `occupied` draws it at 80 % brightness (tint); `down` draws it at 60 % brightness with the existing screen strip in the `failed` role over it. Art-i-b's cursor blink and console glows stay, positioned from the same desk rectangle.
- **Fallback.** Without `consoleArt` the procedural desks draw as today.

## 3. Explosions on hits

- **Assets.** `paid/pimen/explosion-room.png` (14 frames, 32 x 32) and `explosion-hit.png` (11 frames, 16 x 16) as one-shot animations `fx.blast.room` (20 fps) and `fx.blast.hit` (24 fps), optional, feature `blastArt`. `explosion-big.png` is imported but unused until a ship-death view exists.
- **When.** On every hit the interior feel already sees (Art-i-b section 7): a room blast at the hit room's centre tile (sector), or at the random floor tile the duel's hit smoke already picks (duel); a small hit spark at each breach opening. Blasts play on the presentation clock (they hold during the hitstop and while paused) and remove themselves at the last frame; at most 4 play at once (the oldest is cut).
- **Layer.** In `effects.above` with the other above-crew effects, normal blend, under the lights.
- **Fallback.** Without `blastArt`, nothing extra draws (the Art-i-b flash, shake, smoke and debris remain).

## 4. The art tools in the repo

- `scripts/art/buildPalette.ts` (`npm run art:palette`): the palette builder used for the checkpoint, ported to TypeScript (pngjs, OKLab k-means with deterministic farthest-point init, explosion-pack colours kept exact, roles and ramps mapped from the current palette, then `art/palette-overrides.json` applied: the hand-set fire ramp, flash, lamp, held tick, vent speck, alert and breach). It reads `art/import.json` and the asset folder, writes `src/renderer/src/render/palette.json`, and is deterministic. Tests use generated PNGs in a temp folder.
- The art bible (`docs/art/bible.md`) gains an "Adding a pack" section: extract outside the repo, add frames to `art/import.json`, `npm run art:palette` (only when the palette should change), `npm run art:import`, check `.art/contact.png`, bind names in the manifest with licence `paid` and the store's credit line, `npm run credits`.

## Testing and the gate

- Unit tests: the facing fold, the slot-to-sheet pick, the per-sheet foot anchor, the console kind-to-name map and the quarter-turn per side, the console look tints, blast scheduling (one per hit, cap 4, held at presentation dt 0, removed at the end), the palette builder (determinism, overrides applied, every role and ramp colour in the palette), and the fallbacks (each feature missing draws as today).
- All existing tests pass; SIM_VERSION and the goldens are unchanged.
- Screenshots (the Art-i-b harness): the duel interior and the sector Skiff and Cutter, normal and with a hit and a fire; saved to `C:\Users\djuar\FTLite-shots\art-ii\`.
- **Owner gate:** the owner looks at the crew, consoles and hits and says whether the interior now looks like a game.
