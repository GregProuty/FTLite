# Art-iii: set dressing (bunks, seats, couch, lockers, crates)

Date: 2026-11-17. Art-ii put the bought crew, consoles and blasts on screen; the rooms are still empty floor. The owner asked for beds, lockers and crates around the rooms ("ok do it", 2026-11-17). The ship layouts carry room names and systems but no prop data, so the props are placed by a deterministic rule from the room's type, in the renderer only. The art comes from the Maru-98 packs already extracted to `C:\Users\djuar\FTLite-assets\`.

Process tier (grill Q31): views and art, so one spec, one plan, a subagent build, one implementation review, and the owner's look as the gate. No sim, command, snapshot or authority change; SIM_VERSION and goldens do not move; no ship layout file changes.

## Goal

Rooms read as lived-in by what they hold (bunks in the crew quarters, seats in the galley, lockers and crates in the holds) without anyone authoring prop positions, and a fresh clone without the paid art draws exactly as today.

## Non-goals

Props the sim knows about (blocking movement, interaction, damage), hand-authored per-ship prop files, props in rooms with a console other than the medbay's extra bed, animated props, new art, any change to the house palette.

## 1. Assets: only frames the palette already counts

Every prop uses a rectangle that `art/import.json` already lists (Art-ii's `furniture.png` and `lockers.png` outputs), so `npm run art:palette` counts exactly the same frames (it counts each pack + rectangle once) and `palette.json` does not change: the build checks that `art:palette` leaves `palette.json` byte-identical and adds a test that `countColours` gives the same counts before and after the new outputs. Each prop becomes its own one-frame output (exactly the art, so it can turn about its centre), bound by `name` in the manifest (licence `paid`, Maru-98 entry rules as in Art-ii section 5), optional names grouped as the feature `propArt`:

| name | sheet (`maru-98-mars/...`) | rectangle x, y, w, h | what, and where its back is |
|---|---|---|---|
| `prop.bunk.a` | `habitable-building/habitable building tileset.png` | 97, 49, 14, 22 | bed; headboard and pillow at the top |
| `prop.bunk.b` | same | 129, 48, 14, 23 | bed; headboard and pillow at the top |
| `prop.seats` | same | 16, 88, 25, 15 | two seats side by side; backrests at the top |
| `prop.couch` | same | 88, 88, 23, 15 | orange couch; backrest at the top |
| `prop.locker.a` | `mars-tools/Mars Tools.png` | 19, 29, 18, 33 | tall locker; its back at the top |
| `prop.locker.b` | same | 59, 29, 18, 33 | tall locker; its back at the top |
| `prop.crate` | same | 90, 96, 12, 16 | crate |

Every sprite's back is at the top: drawn as is it stands against a north wall, and it turns by quarter turns for the other walls (the plan checks each against the sheet by eye and records it).

## 2. Which rooms get what

A pure `roomKind(room: { name: string; system: string | null })`, matching the name case-insensitively:
- `quarters` (name contains "quarters"): `prop.bunk.a`, `prop.bunk.b`, `prop.bunk.a`;
- `galley` (name contains "galley" or "mess"): `prop.seats`, `prop.couch`, `prop.locker.a`;
- `hold` (name contains "hold", "store" or "cargo"): `prop.crate`, `prop.locker.a`, `prop.crate`, `prop.locker.b`;
- `medbay` (system `medbay`): `prop.bunk.a`;
- any other room: nothing.

The list is the room's order of props; a room gets as many as it has slots that fit (section 3), up to the list's length.

## 3. Where props stand

A pure `propSlots(state): { room: number; tile: number; side: Side; name: string }[]`, cached by `layoutHash` plus the joined room names and systems. Per dressed room (in room order):
1. **Candidates:** floor tiles of the room with a wall tile (`#`) as a 4-neighbour, excluding
   - station tiles (`derived.stationTile`) and their 4-neighbours;
   - door and opening tiles (`derived.edgeTile` of every edge) and their 4-neighbours;
   - crew spawn tiles (`layout.spawns`);
   - floor tiles that are 4-neighbours of a breach site (`derived.siteTile`) or an airlock (`derived.airlockTile`), both of which are wall tiles;
   - the magazine tile (`derived.magazineTile`, when present) and its 4-neighbours;
   - the room's lamp tile (Art-i-b's `lampPoints`: the room's lowest tile index).
2. **Side:** the wall side, the first of n, e, s, w with a `#` neighbour.
3. **Order:** candidates sorted by `hashU32(hashString(layoutHash), tile)` ascending (the hashes Art-i-b's wall vents use, `render/particles/random.ts`), ties by tile index.
4. **Fit:** a name fits a candidate when the prop's depth from the wall face (2 x its height in art pixels for side n or s, 2 x its width for e or w, after the quarter turn, minus `WALL_GAP`) is at most the room's floor depth from that candidate: 32 world units times the number of consecutive floor tiles of the same room starting at the candidate and going away from its wall. A prop that fits never crosses a wall other than its own.
5. **Take:** in that order, skipping any candidate that is 4-adjacent or diagonal to a slot already taken in any room; a candidate is taken when at least one not-yet-used name of the room's list fits it, and gets the first such name. It stops when the room's list is used up or no candidates remain. Names that fit no remaining candidate are not drawn.

Same layout and names, same slots, every run. Some dressed rooms end with fewer props than their list, or none (by hand count: on the Cutter the Crew Quarters 2 bunks, the Galley 3, the Upper Hold 1 crate (one tile deep, so no locker fits), the Lower Hold and Aft Store none, since the magazine, doors and lamp take their wall tiles; on the Skiff the Hold 1 crate; the plan pins the exact slots and names in a test); that is accepted. A separate pure `propCandidates(state)` exposes step 1 for testing. The rule also dresses the starter ship (its Crew Quarters and Medbay).

## 4. Drawing

- A new prop layer (`createPropLayer(assets)`) with its own container, added directly after the tiles container in both views (`renderer.ts` and `duel/interiorView.ts`), so the grade, fire and breach effects, room icons, consoles, the magazine, fixtures and crew all draw over the props, as they do over the floor. It rebuilds only when the cache key in section 3 changes.
- Placement uses Art-ii's `consolePlacement(side, true, w, h)` (the prop is flush: a candidate always has its wall on that side): the back edge on the wall face, centred along the wall on the tile's centre line, rotated by quarter turns about its centre, top-left floored to an even world unit. Sprites deeper or wider than a tile overlap neighbouring floor (accepted).
- No tint, no state; the prop layer does not depend on `consoleArt`. With `propArt` missing the layer is empty (today's look).

## 5. The crew and props

The sim does not know about props, so a crew member can walk across a prop's floor; props draw under the crew. The exclusions keep props off doors, consoles, spawns and the magazine; any remaining overlap is a look point for the owner's gate, not a defect.

## Testing and the gate

- Unit tests: `roomKind` for every room on the Cutter, Skiff and starter and for the generic rules; `propCandidates` (none on or next to a station, door or opening, the magazine, a breach site or airlock; no spawn or lamp tile; every candidate has a wall neighbour on its side); `propSlots` (deterministic for a layout; no two slots adjacent or diagonal; names in list order skipping names that do not fit; no placed prop rectangle crossing the face of any wall but its own; the exact slots and names for the Cutter and Skiff pinned); the placement per side through `consolePlacement`; the prop layer's order (directly after the tiles in both views), its rebuild rule, and nothing drawn without `propArt`; the manifest names and paid rules; `countColours` unchanged and `palette.json` unchanged.
- All existing tests pass; SIM_VERSION and the goldens are unchanged; no file under `src/renderer/src/sim` changes.
- Screenshots (the Art-ii harness): the Cutter and the Skiff, normal; saved to `C:\Users\djuar\FTLite-shots\art-iii\`.
- **Owner gate:** do the rooms read as lived-in, and do any props sit where crew walk in a way that looks wrong?
