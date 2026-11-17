# Art-iii: set dressing (beds, seats, crates, lockers)

Date: 2026-11-17. Art-ii put the bought crew, consoles and blasts on screen; the rooms are still empty floor. The owner asked for beds, lockers and crates around the rooms ("ok do it", 2026-11-17). The ship layouts carry room names and systems but no prop data, so the props are placed by a deterministic rule from the room's type, in the renderer only. Art from the packs already extracted to `C:\Users\djuar\FTLite-assets\` (Maru-98 Mars sets).

Process tier (grill Q31): views and art, so one spec, one plan, a subagent build, one implementation review, and the owner's look as the gate. No sim, command, snapshot or authority change; SIM_VERSION and goldens do not move; no ship layout file changes.

## Goal

Every ship's rooms read as lived-in by what they hold (bunks in the crew quarters, seats in the galley, crates in the holds) without anyone authoring prop positions, and a fresh clone without the paid art draws exactly as today.

## Non-goals

Props the sim knows about (blocking movement, interaction, damage), hand-authored per-ship prop files, props in rooms with a console (the console is that room's furniture) other than the medbay's extra bed, animated props, new art beyond the packs already bought.

## 1. Assets

One one-frame output per prop sprite in `art/import.json` (so the image is exactly the art and can turn about its centre), bound by `name` in the manifest (licence `paid`, Maru-98 entry rules as in Art-ii section 5), optional names grouped as the feature `propArt`:

| name | source sheet (`maru-98-mars/...`) | rectangle (x, y, w, h) | what |
|---|---|---|---|
| `prop.bunk.a` | `habitable-building/habitable building tileset.png` | 97, 49, 14, 22 | bed, pillow at the top |
| `prop.bunk.b` | same | 129, 48, 14, 23 | bed, pillow at the top |
| `prop.seats` | same | 57, 88, 14, 25 | two seats, one above the other |
| `prop.couch` | same | 130, 94, 13, 25 | orange couch |
| `prop.locker` | `mars-tools/Mars Tools.png` | 19, 29, 18, 33 | tall white locker |
| `prop.crates.stack` | same | 122, 88, 12, 24 | crates stacked |
| `prop.crates.pile` | same | 153, 88, 23, 24 | crate pile |
| `prop.crate` | same | 90, 96, 12, 16 | one crate |

Each sprite is drawn facing south (its back, the pillow or the locker's back, to a north wall). The palette does not change: `npm run art:palette` counts each distinct frame once, and these rectangles are new frames, so the plan re-runs `art:palette` and states whether the palette moved; if it moved, the build commits the regenerated palette and re-imports (the Art-ii determinism check still holds afterwards).

## 2. Which rooms get what

A pure `roomKind(room)` from the layout's room `name` and `system` (case-insensitive name match):
- `quarters` (name contains "quarters"): bunks, alternating `prop.bunk.a` and `prop.bunk.b`, at most 3;
- `galley` (name contains "galley" or "mess"): `prop.seats`, `prop.couch`, `prop.locker`, in that order, at most 3;
- `hold` (name contains "hold" or "store" or "cargo"): `prop.crates.pile`, `prop.crates.stack`, `prop.crate`, `prop.locker`, in that order, at most 4;
- `medbay` (system `medbay`): one `prop.bunk.a`;
- every other room (corridors, passages, airlocks, the bridge, engines, reactor, weapons, sensors, oxygen, door control, ops): nothing.

On today's ships that dresses the Cutter's Crew Quarters, Galley, Upper Hold, Lower Hold, Aft Store and Medbay, and the Skiff's Hold and Medbay.

## 3. Where props stand

A pure `propSlots(state)`, cached by `layoutHash`, lists the candidate tiles of each dressed room: floor tiles of that room with a wall tile (`#`) as a 4-neighbour, excluding
- station tiles (`derived.stationTile`) and their 4-neighbours,
- tiles that are a door or opening edge tile, and the 4-neighbours of any door or opening tile,
- crew spawn tiles (`layout.spawns`),
- breach sites and airlock tiles.

The wall side of a candidate is the side with a wall neighbour; with two (a corner) the first of n, e, s, w. Candidates are ordered by `hashU32(hashString(layoutHash), tile)` (the hashes Art-i-b's wall vents use, `render/particles/random.ts`), ties by tile index, then taken in order, skipping any tile 4-adjacent or diagonal to a tile already taken, until the room's list is used up or the room has no candidates left. Same layout, same props, every run and on every machine.

## 4. Drawing

- Props draw in the console layer's sprite container (Art-ii section 2), under the console sprites, so the Art-i-b fixtures stay above and the crew walk above the props. The layer still redraws only when the layout or a console's look changes.
- Placement uses Art-ii's `consolePlacement(side, flush, w, h)`: the prop's back edge on the wall face of its wall side (flush, because a candidate always has a wall neighbour on that side), centred along the wall on the tile's centre line, rotated by quarter turns about its centre, top-left floored to an even world unit. Sprites deeper or wider than a tile overlap neighbouring floor (accepted, as for the rack and med pod).
- No tint, no state. Props ignore damage, fire and vacuum (the grade and lights draw over them as over the floor).
- With `propArt` missing, no props draw (today's look).

## 5. The crew and props

The sim does not know about props, so a crew member can walk across a prop's floor; props draw under the crew. Excluding door neighbours, station neighbours and spawns keeps props off the busiest paths; any remaining overlap is a look point for the owner's gate, not a defect.

## Testing and the gate

- Unit tests: `roomKind` for every room name on the Cutter and Skiff and for the generic rules; `propSlots` (no slot on a station, station neighbour, door neighbour, spawn, breach site or airlock tile; every slot has a wall neighbour on its side; no two props adjacent or diagonal; deterministic for a layout; the per-kind caps); the sprite placement per side through `consolePlacement`; the console layer draws props under the console sprites and not at all without `propArt`; the manifest names and paid rules.
- All existing tests pass; SIM_VERSION and the goldens are unchanged; no file under `src/renderer/src/sim` changes.
- Screenshots (the Art-ii harness): the Cutter and the Skiff, normal; saved to `C:\Users\djuar\FTLite-shots\art-iii\`.
- **Owner gate:** do the rooms read as lived-in, and do any props sit where crew walk in a way that looks wrong?
