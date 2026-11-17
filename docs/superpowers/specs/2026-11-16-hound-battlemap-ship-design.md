# Hound battlemap ship (Art-iv) — design

Date: 2026-11-16. Status: design approved by the owner in conversation ("go ahead"). Tier: content + views (one-page spec, build, one review, owner look check).

## Goal

The starting ship's interior should look like a painted VTT battlemap (Roll20 / D&D / Starfinder style) rather than our flat 32 px procedural tiles. We build the 2-Minute Tabletop **Hound-class Transport Ship** exactly as the painting, flipped so the cockpit dome (the helm) faces right.

## Source and licence

- File: `Hound-class Transport Ship (15x11).png` (2100x1540, 140 px per 5-ft square, transparent background) from `HoundClassTransportShip.zip` in the owner's `Downloads\battlemaps`. The owner bought it.
- Licence: CC BY-NC 4.0 (2-Minute Tabletop). The owner says this demo will not be sold in this form, and the art is used under BY-NC with a credit line.
- New gate in `docs/gates.md`: "2-Minute Tabletop Hound art is CC BY-NC: get a commercial licence or replace it before any sale."
- The PNG stays out of git like the other bought art: `npm run art:import` copies it to `public/assets/paid/`. The manifest entry is committed with licence `CC BY-NC 4.0`, the store URL, the purchase date, the credit "Hound-class Transport Ship by 2-Minute Tabletop (2minutetabletop.com), CC BY-NC 4.0", and the modification "mirrored horizontally".
- The Czepeku and Reddit images in that folder are reference only and are never shipped.

## 1. Grid mapping: two tiles per map square

- One map square is 2 game tiles. The image is offset half a tile so that every square boundary (source x = 140k, y = 140k) falls on a **tile centre**. A painted wall line therefore runs through the middle of a row of `#` tiles, and doors (`+`) sit in the painted wall gaps.
- The interior spans square boundaries x 3..14 and y 2..9 of the mirrored image. That gives a layout of about **23 x 15 tiles**: tile `tx` is centred on mirrored source x = 140·(3 + tx/2), and likewise for y. The plan pins the exact numbers after tracing.
- No change to the sim, the ship schema or any tuning. The ship is a new `hound.json` layout that passes `parseShip` (room graph connected, stations reachable from every spawn, airlocks on the hull, breach sites on walls).
- Known cost: wall tiles are half a square thick, while painted walls are about a fifth of a square, so crew stop about 0.15 square short of the painted line. Accepted.

## 2. Rooms (mirrored image, dome to the right)

| Painted room (squares, mirrored) | Room | System | Stations |
|---|---|---|---|
| Dome cockpit, columns 12-13, rows 4-6 | Bridge | navigation | navigation at the pilot seat [20,7]; weapons at the side console [19,5] (separate seats: the duel needs two) |
| Bunk passage, columns 9-11, row 5 (bunks are furniture) | Quarters (corridor role) | null | spawns |
| Galley/common, columns 6-8, rows 4-6 | Ops | science | console group science + engineering + doors at the counter |
| Red-cross room, columns 6-8, rows 2-3 | Medbay | medbay | medbay |
| Table room, columns 6-8, rows 7-8 | Life Support | lifeSupport | lifeSupport |
| Angled room by the upper engine pod, columns 4-5, row 3 | Engines | engineering | none |
| Angled room by the lower engine pod, columns 4-5, row 7 | Reactor | reactor | none |
| Cargo hold, columns 3-5, rows 4-6 | Hold | null | none; its rear ramp is an airlock |

- Doors go only where the painting shows a wall gap. If a room has no painted gap to a neighbour it needs, the plan adds the narrowest door in the wall that the painting's traffic flow implies, and records it.
- Breach sites: one per room, on an outer wall tile. Airlocks: the hold ramp and one hull door the painting shows. Allocations copy the Skiff's (reactor budget unchanged).
- Known deviation: Ops and Quarters have no outer wall in this trace, so their breach sites ([10,4], [15,5]) are interior walls; to fix before the Hound enters the sector (Art-iv-b).
- Station tiles sit on the painted furniture (pilot chair, galley counter, medbed, table). Console groups match the Skiff's.

## 3. Which ship flies

- **Art-iv (this part): the duel.** Single player is the solo duel (`main.ts` `single`), so the Hound replaces the Cutter as the duel ship: `main.ts`, `src/network/modes/duel.ts` and `src/main/network/onlineDuel.ts` use one `DUEL_LAYOUT` (the Hound). The duel's repair points become per-layout (`DUEL_REPAIR_POINTS[layout.id]`): Hound Weapons -> Ops (10,8), Shields -> Reactor (4,11), Engines -> Engines (4,2). The Cutter keeps its points, so the existing duel tests on the Cutter stay valid.
- **Art-iv-b (follow-up): the sector fleet.** `shipForCrew` stays Skiff/Cutter in this part. Putting the Hound in the multiplayer sector needs a newly recorded cross-engine determinism fixture (`tests/fixtures/determinism-v2.json` is authored once, never auto-blessed), which is a separate contract task.
- `ShipId` gains `'hound'` (with a LINES entry) so the layout maps in `main.ts` and `network/modes/sector.ts` can resolve it, and `onlineSector.ts` is unchanged.

## 4. Rendering

- New optional asset `ship.hound.map` and a `battlemapLayer` drawn under every interior layer, at the layout's world origin minus the half-tile offset. The scale is `TILE_PX*2 / 140` world units per source pixel, with linear filtering. Painted art is exempt from the bible's whole-number and palette rules: add one bible paragraph and exempt this layer from the `0x`-literal test only if it needs a literal (it should not).
- When the asset is loaded **and** the ship is the Hound: skip the procedural floor, wall and console sprites (the painting has them). On the Hound each console instead draws a VTT-style marker: a rounded square outline on its tile, tinted by its look (CONSOLE_TINT), so console state still reads. Keep doors, hazards (fire, breach, vacuum, O2), grade, lights, particles, blasts, callouts, room icons and the selection/hover outlines. Door panels stay as they are: at 12 of 32 units they are already as thick as the painted walls (about 0.4 tile).
- Missing asset (a fresh clone without the import): fall back to today's procedural drawing of the Hound layout, so the game still runs. This uses the existing `fallback.ts` feature group pattern.
- Camera: the duel fit (`duelFit`) and the sector fit fit the painted bounds (tiles x -4.87..23.19, y -2.49..17.31, from the image's alpha bounding box), not just the tile bounds, so the engine pods and dome are never cropped. The offset folds into `fit.x/fit.y`, so tile (0,0) stays at the world origin for every consumer.
- Texture: linear filtering with mipmaps for this one texture (it is shown at about a third of its 70 px per tile).
- Import: `art/import.json` outputs gain optional `remap` (default true) and `flipX` (default false). The Hound entry is `remap: false, flipX: true`, one full frame; raw outputs are left out of the contact sheet.

## 5. Crew as VTT tokens

- On the Hound, each player is a round token one tile across (half a square): a dark rim, a fill in the player's colour, and a small top-down figure mark. The token's facing tick shows the move direction.
- States: downed = grey fill and a red X ring; repairing / firefighting / manning = the existing activity icon on the rim; selected / local player = a bright outer ring.
- Drawn with Pixi Graphics from palette roles (no new bought art). Other ships keep the LimeZu sprites.

## 6. Tests and checks

- `hound.json` parses and gets a unit test pinning its traced shape: 23x15, the rows exactly as traced against the painting (the overlay was checked by eye in planning), rooms, systems, doors, stations and airlocks.
- Render model tests: the layer is chosen only for the Hound with the asset loaded; the procedural floor and walls are skipped in that case; the token model gives the right ring for each state.
- `npm test`, typecheck, the determinism check, the smokes, and screenshots via the visual-check method (normal, alert, fire/breach, crew walking through doors) into `C:\Users\djuar\FTLite-shots\art-iv\`.
- Gate: the owner's look check.

## Out of scope

Enemy ships stay as they are. No painted art for other ships. No change to sim walls or doors (thin-wall walls were option B, rejected as weeks of sim work). Art-iii set dressing does not apply to the Hound, since the painting already has the furniture.
