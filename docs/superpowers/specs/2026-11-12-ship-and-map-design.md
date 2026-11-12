# Ship, Icons and Sector Map (Demo-iii) Design

Status: drafted 2026-11-12 during the user's playtest ("rearrange the layout of the ship to match the Kestrel ship in FTL ... add icons for the room types ... for navigation i just see node1, node2 can we add a map for visuals ... make this look and feel better"). Parent: `2026-11-09-foundation-design.md` §5 (ship data), §7 (rendering, HUD), §12 (licence and sourcing); builds on Run-i/ii (the node map, node types) and Demo-ii (HUD panels).

## 1. Goal

The ship the players fly looks like an FTL cruiser, every system room says what it is at a glance, and the Navigation operator (and the other player) can see the sector as a map, not a list of `Node 2a` labels.

**Licence:** the icons are **original** vector glyphs with the meanings FTL uses (oxygen, medical cross, engine, sensors, doors, weapons, helm, reactor), drawn in code. FTL's art is neither original nor openly licensed, so §12 of the foundation spec rules it out; the layout below is our own grid inspired by the reference's room arrangement, and the ship is not named after it.

**Out of scope:** new systems (shields, drones, cloaking); ship selection; art sprites for the new rooms beyond the existing tile set; a zoomable map; map fog of war.

## 2. Options considered

- **Which ship the tests use:** (a) keep `starter.json` for every test, gate and the golden replay, and make the new `cutter.json` the ship the app loads, with its own survival gate **(recommended, chosen)**: no churn across 650 tests that name rooms and tiles, the golden stays put, the new ship is still gated; (b) replace `starter.json`: rewrites dozens of fixtures and the golden; (c) ship selection: more than the request.
- **Icons:** (a) Pixi `Graphics` glyphs from a pure description table (`render/roomIcons.ts`) **(chosen)**: original, no asset pipeline, one table for the world and the HUD; (b) a sprite sheet: art the project does not have; (c) text labels: not "icons".
- **Map:** (a) an overlay panel while anyone sits at Navigation, from a pure `HudModel.map` block **(chosen)**: both players see it when it matters; (b) inside the 234 px console panel: too small for eight columns; (c) a dedicated map key: new input.

## 3. The ship (`src/renderer/src/sim/ship/cutter.json`, committed with this spec)

29 × 13 tiles, 17 rooms, 22 doors, one breach site per room, the seven stations, four spawns in the crew quarters; it parses with `parseShip` and every station and door is reachable from every spawn. Stern on the left, bow on the right:

```
          #####
          #TTT#
######### ##+######
#OOO+SSS# #UUU#DDD#
##+##+#####UUU+DDD###########
#EEE#a#WWW+UUU#DDD+CCC+FFF#B#
#EEE+a+WWW##+###+###+##FFF+B#
#EEE#a#WWW+VVV#RRR+NNN+FFF#B#
##+##+#####VVV+RRR###########
#LLL+MMM# #VVV#RRR#
######### ##+######
          #XXX#
          #####
```

Rooms: O Oxygen (lifeSupport), S Upper Hold, E Engines (engineering), a Aft Passage, W Weapons, L Aft Store, M Lower Hold, T Dorsal Airlock, U Crew Quarters, V Galley, X Ventral Airlock, D Medbay, R Reactor (`system: "reactor"`), C Door Control (`system: "doors"`), N Sensors (science), F Forward Corridor, B Bridge (navigation). Stations: navigation B (27,6) 1 bar, doors C (20,5) 1, weapons W (8,6) 2, science N (20,7) 1, medbay D (16,4) 1, lifeSupport O (2,3) 2, engineering E (2,6) 1 (the same allocation as the starter). Spawns (11,4), (12,4), (13,4), (11,5).

**Wiring:** `src/renderer/src/main.ts` loads `cutter.json` instead of `starter.json`. `starter.json` stays the ship of every test, gate, the golden replay and `npm run acceptance` (`sim/acceptance.ts` keeps it). The world view already centres any ship (`renderer.ts`); at 29 × 32 = 928 px it fits the 960 px internal width.

**Gate** (`tests/gate-cutter.test.ts`, new): `createSimState(parseShip(cutter), 2, seed, DEFAULT_CHARACTERS)`, both players driven by `botIntent`, `run.jumpCharge = 0` pinned every tick (a ship-only soak, as `gate-survival`), seeds 1-3, five minutes: the run does not end and both crew are Conscious; min health, min hull, impacts and boardings recorded in the assertion message. If a seed fails, the cause is diagnosed with a per-second log (as Demo-ii did) and recorded; the fix is to the layout (a door, a station tile) or the bot, never a global tuning value, and is stated in §9. Every code path that reads a room's `system` (grep `\.system`) is checked for the new value `"doors"`.

## 4. Room icons

`render/roomIcons.ts` exports `ICON_KINDS = ['navigation', 'weapons', 'science', 'engineering', 'lifeSupport', 'medbay', 'doors', 'reactor']` and `drawIcon(g: Graphics, kind, cx, cy, size, color)` drawing an original glyph centred at `(cx, cy)` in a `size × size` box (strokes 2 px):

| kind | glyph |
|---|---|
| navigation | a helm: circle (r = 0.35 size) with six spokes to r = 0.5 size |
| weapons | a missile: a horizontal capsule (0.8 × 0.3 size) with a pointed nose and two tail fins |
| science | an eye: an almond outline (0.9 × 0.5 size) with a filled pupil (r = 0.12 size) |
| engineering | an engine: two stacked right-pointing chevrons |
| lifeSupport | the text `O2` (16 px font, centred), the one text glyph |
| medbay | a plus/cross (bars 0.8 × 0.25 size) |
| doors | two vertical bars (0.2 × 0.8 size) with a gap of 0.15 size |
| reactor | a lightning bolt (a five-point zig-zag polygon) |

**In the world** (a new `iconLayer` added to `world` above the effects' lower layer and below the crew): for every room whose `system` is an icon kind, the glyph at the centre of the room's centre tile: `tx = floor(mean of its tiles' x)`, `ty = floor(mean of its tiles' y)`, drawn at `((tx + 0.5) × TILE_PX, (ty + 0.5) × TILE_PX)` (for a room whose station tile is that centre tile the glyph sits under the console; that is accepted), `size 20`, colour `0xe8e8e8` at alpha 0.55; `WARN` when that room's station is failed; `FAINT` (`0x5a606c`) when it is unpowered (present, not failed, level 0); a room with `system: "reactor"` uses the reactor glyph and is never tinted. The layer is built once per layout and re-tinted each frame (no per-frame redraw). The `RoomIcon` model per room is pure: `roomIcons(state): { room: number; kind; x: number; y: number; tint: 'normal' | 'failed' | 'unpowered' }[]` in `render/roomIcons.ts` (pixi-free half), tested.

**In the HUD** power panel: a 12 px glyph of the station's kind left of each power row's name (the row text moves right by 14 px), same tint rule (failed takes precedence over unpowered; a failed station is at level 0, so `unpowered` already excludes it).

## 5. The sector map

`HudModel.map: MapModel | null`, built in `buildHudModel` when `phase === 'running'` and some player is seated at Navigation, else `null`:

```ts
interface MapModel {
  columns: { nodes: { type: 'hazard' | 'event' | 'shop'; current: boolean; reachable: boolean; selected: boolean; past: boolean }[] }[];   // RUN_COLUMNS columns
  edges: { from: [number, number]; to: [number, number] }[];   // (column, node) pairs from run.edgeMask
}
```

`edges`: for every column `c` in `0..RUN_COLUMNS − 2`, every node `n < colNodes[c]` and every destination `d < colNodes[c + 1]` with bit `d` set in `edgeMask[c × 3 + n]`, one edge `{ from: [c, n], to: [c + 1, d] }`, past columns included (drawn faint).

`current` = the run's `(column, node)`; `reachable` = in `reachable(state)` (next column only); `selected` = the destination of the Navigation cursor's row when that row is a `jump` row; `past` = `column < run.column`. Types from `run.nodeType`; the last column's node is shown as the exit.

**Drawing** (`render/mapPanel.ts`, Pixi `Graphics`, placed by `hud.ts`): a panel 360 × 116 with its top-left at `(236, 64)`: below the notice rows (y 24..60), left of the enemy panel (x 600..720), right of the clock panel (x ≤ 204). The cutter is centred with its origin at (16, 62), so this band covers only ship rows 0..3 between tile columns 7 and 18 (mostly void, the dorsal airlock, the tops of the crew quarters and the medbay); the middle of the ship and the Bridge (tile column 27) stay visible. Background `0x101420` at alpha 0.6, so the rooms beneath remain readable. Columns at x = 24 + 44 × c (c = 0..7); a column holds at most 3 nodes (Run-i generation guarantees 1 at the ends, 2 or 3 in the middle), at y = 62 + (k − (n − 1) / 2) × 26 (so between y 36 and 88); the type mark sits 12 px below its node (max y 100) and the `EXIT` label under the last column's single node at y 74 + 12. Edges as 1 px lines, `FAINT`; edges out of the current node `DIM`. Nodes: radius 6; `past` nodes `FAINT` filled; the `current` node a `TEXT` filled circle with a 2 px ring at radius 10; `reachable` nodes `TEXT` outlined, the `selected` one filled `WARN` with a ring; others `DIM` outlined. Type marks inside or beside the node (16 px text, centred 12 px below): `$` for a shop, `?` for an event, nothing for a hazard, `EXIT` under the last column's node. A 16 px title at (8, 4): `SECTOR MAP   node ${column + 1}/8   Jump ${READY | n%}` (the same jump text as the Navigation footer). Visible only while `map !== null`. The drawing is a manual gate; the model is tested.

## 6. Tests (vitest, node)

- Ship: `parseShip(cutter)` succeeds; 17 rooms, 22 edges, 17 breach sites, 7 stations each in the room listed in §3; every station reachable from every spawn (the schema already checks; the test pins the counts and the station rooms); `createSimState` on it runs 600 ticks of `step` with two bots without throwing.
- `tests/gate-cutter.test.ts` as §3.
- Icons: `roomIcons(makeState-on-cutter)` lists exactly the seven station rooms plus the reactor room with the right kinds and their room-centre positions; tints: failed Weapons → `'failed'`; Weapons at level 0 → `'unpowered'`; the reactor never tinted; on the starter ship the list matches its systems (the starter has no `doors` room: the doors station is in the Bridge, so the Bridge shows the navigation glyph only).
- Map: `null` with no one at Navigation and outside `running`; on fixture map M (Run-i tests) at column 1 node 2 with the cursor on the first destination: `columns.length 8`, `current` only at (1, 2), `reachable` exactly the next column's reachable nodes, `selected` the cursor's destination, `past` exactly column 0, edges equal to the bits of `edgeMask` for columns 0..6; node types copied from `nodeType` (`setNodeTypes` with a shop and an event).
- Gates and golden: the existing gates and `npm test` unchanged in figures (no sim change); the golden untouched.

## 7. Gate (`docs/gates.md`)

- [ ] `npm test` passes with the §6 tests; golden untouched.
- [ ] `gate-cutter` passes on seeds 1-3 with figures recorded.
- [ ] Manual, two players on the new ship: the layout reads as an FTL-style cruiser; every system room shows its glyph, red when failed and faint when unpowered; the power rows show the same glyphs; sitting at Navigation opens the sector map with the current node, the reachable nodes, the cursor's destination highlighted, `$`/`?` marks and the exit; the map closes when the navigator stands. Date and notes: pending.
- [ ] `npm run typecheck`, `npm test`, `npm run build` pass on the final commit.

## 8. Follow-ups

Shields as a system; ship selection between the starter and the cutter; ship sprites for hull silhouettes; map fog of war; room name labels on hover.

## 9. Amendments

(Filled during implementation.)
