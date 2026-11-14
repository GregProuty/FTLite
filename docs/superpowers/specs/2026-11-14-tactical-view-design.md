# Tactical View and Helm Flight (design)

Status: spec written 2026-11-14 from thesis grill Q12, Q16, Q18 and Q23 to Q23c. Not yet reviewed. **Gospel: `docs/vision/napkin.md`; binding answers: `docs/vision/thesis-grill.md`.** Numbers marked *(start)* are starting values for tuning. Defaults marked **(rec.)** are Claude's; the owner can overturn any of them.

This spec covers **the large map, the ship's flight, the Helm's controls and the zoomable camera**. It replaces the Helm demo spec's arena (§3), flight (§4, §6) and camera (§10, first two bullets); weapons, shields, rooms, repair, the hunter, networking and acceptance stay in `2026-11-14-helm-demo-design.md`. It is the first thing built: everything else in the duel sits on top of it.

## 1. The owner's words

> "core demo i want to build will be around the helm mini game. This is sid meiers pirates inspired navigation around a gravity well in a tactical top down view. Helm will manage the thrust, velocity and turning of the ship to navigate through obsticals, and around enemies. weapons will share that view to target weapons"

> "im just talking about the tactical view. We need to be able to scroll in and out in a large map, and the helm pilots the ship through this map." (Q23)

Reference: the bridge-simulator genre's tactical view (the owner named Artemis Spaceship Bridge Simulator). This game takes the ideas (a zoomable map, a bearing ring, arcs drawn on the map) and designs its own screens, art, names and layout. It does not reproduce another game's interface (foundation §12, direction spec A10).

## 2. Decisions (grill)

| Q | Decision |
|---|---|
| Q12 | Arcade with real momentum and gravity; mild drag; a stabilise assist on release; slingshots work |
| Q16 | One planet: gravity plus a damaging wall |
| Q18 | Direct stick: turn, thrust, reverse, stabilise on release |
| Q23 | A large map, bigger than one screen, that the player zooms in and out of; the Helm flies through it |
| Q23b | The camera follows the player's ship; the player can pan away and snap back |
| Q23c | One planet, an asteroid belt ring and a few loose asteroid clusters, stored as data |

## 3. The map

The map is a circle about 4 to 5 times wider than the old arena, with the planet at its centre. It is **data** (a `MapDef`), so a moon, a debris field or a goal circle is added by adding a body, not by changing code.

| Thing | Rule | Values *(start)* |
|---|---|---|
| Map edge | Circle of radius `R_MAP`. Past the edge a soft spring pushes bodies back in; no damage. Drawn as a faint boundary | `R_MAP` 2800 units |
| Planet | Static at the origin; pulls every body; contact costs hull and bounces (Q16) | radius 70; `GM` 2.5e6 (circular orbit at r = 250 moves at 100 u/s; the pull at the belt is about 2 u/s², at the edge about 0.3 u/s²); softening `ε` 20; contact 4 hull, bounce keeps 50% of normal speed, 1 s grace |
| Asteroid belt | A ring of static asteroids between two radii, with 3 **gaps** at seeded bearings wide enough to fly through at speed. Threading the belt is the Helm's obstacle course | inner radius 1100, outer 1300; about 70 asteroids, radius 15 to 45; gaps 160 units wide |
| Loose clusters | 3 clusters of 4 to 7 asteroids at seeded positions between the belt and the edge; cover and obstacles | cluster radius 150; asteroid radius 20 to 55 |
| Asteroids (all) | Static circles. They do not pull. Contact costs hull and bounces | contact 1 hull |
| Spawns | Two spawn points on opposite sides, outside the belt, in slow orbits going the same way, so a fight starts with an approach | r = 2000 |

**Seeded layout:** belt positions, gap bearings and cluster positions come from `rng.tactical` and the duel seed. A generator rejects overlaps (with the planet, each other, the spawns and the gap corridors), so every seed gives a fair map. The layout is part of the published run setup, so both screens draw the same map.

## 4. Physics and determinism

Unchanged from the Helm demo spec §4, restated here because flight is built first:

- 60 Hz inside the Net-1 authority. Float64 with only `+ − × ÷`, `Math.sqrt`, `abs`, `min`, `max`, `floor`, `round`, `sign` (the AST guard, `tests/determinismGuard.test.ts`). No trigonometry.
- **Headings:** a generated table of 256 unit vectors (`sim/tactical/headings.ts`, written by `scripts/gen-headings.ts` outside the sim). Heading = index 0 to 255 plus a fractional turn accumulator.
- **Gravity:** `a = −GM · d / (r2 + ε²)^{3/2}`, with the power computed as `q · sqrt(q)`.
- **Integration:** semi-implicit Euler once per tick, bodies in a fixed order, circle collisions resolved in a fixed order.
- **Broad phase:** about 100 static asteroids. A fixed uniform grid (cell 200 units) built once per map gives each body's nearby asteroids; the cell order is fixed, so results are deterministic. This keeps collisions and line-of-sight cheap as maps grow.

Tests: a circular orbit at r = 250 holds radius within 2% over 60 s; bounded energy drift on a 5-minute coast; same seed and commands give the same hash; every seed from 1 to 200 produces a valid map (no overlaps, three passable gaps, clear spawns).

## 5. Flying the ship (the Helm)

Direct stick (Q18). The Helm's client sends **held axes every tick on the existing held-input channel** (`HeldInput.moveX` = turn, `moveY` = thrust, from `net/contracts.ts`) **(rec.)**, so the stick needs no new command kind.

| Input | Effect *(start)* |
|---|---|
| Turn | 150°/s, × the Engines factor (demo spec §5) |
| Thrust forward | 120 u/s² along the heading, × the Engines factor |
| Thrust reverse | 40% of forward |
| Drag | velocity × (1 − 0.15 · dt) each tick; terminal speed under full thrust is about 800 u/s, so crossing the map takes several seconds, not a minute |
| **Stabilise** | While both axes are zero, the assist cancels **sideways** velocity (perpendicular to the heading) at up to 80 u/s². It never cancels gravity or forward speed, so a released ship stops skidding but still coasts, falls and orbits (Q12) **(rec.)** |

Keys: keyboard W/S thrust, A/D turn; gamepad left stick (x turn, y thrust) or d-pad, with triggers as an alternative for thrust and reverse.

**Feel targets** (tuned by hand in the dev view, §8): from a standstill near the belt, a pilot can thread a gap within 15 s of trying; a slingshot past the planet at r ≈ 150 changes direction by more than 90° and leaves faster than it came in; a released ship at cruise speed stops skidding within 1 s.

## 6. The camera (client-only)

Each player has their own camera and zoom (Q23b). Camera state lives in the client's UI state (alongside `ClientUiState`), is never sent to the authority and is never part of the sim hash.

- **Follow by default.** The camera centres on the player's own ship. North is fixed at the top and the ship rotates **(rec.)**, so the planet and the orbits stay still on screen and a slingshot reads as a curve.
- **Zoom.** Continuous between the closest and the widest view, eased over 0.15 s. Zoom is about the cursor when using the mouse wheel, and about the screen centre for keys and gamepad.
  - Closest: about 1.2 px per unit (the ship is about 48 px across; fine flying and aiming).
  - Widest: the whole map fits the screen height (about 0.12 px per unit at 720 px).
  - Default at the start: about 0.5 px per unit (the ship, the nearby belt and part of the well in view).
- **Pan away.** Dragging with the mouse (right or middle button) or the gamepad's right stick moves the camera off the ship. The camera stays where it was put until the player snaps back.
- **Snap back.** One key (keyboard `C`, gamepad right-stick click) recentres on the ship with a 0.2 s ease and resumes following.
- **Off-screen arrows.** At the screen edge, arrows point to things that are off-screen: the player's own ship (always), the enemy, and the planet. Each shows its distance.
- **Keys:** keyboard `−`/`=` and the mouse wheel zoom; gamepad shoulders zoom. These never clash with the Helm's flight keys or Weapons' keys (demo spec §7).

Because the camera is per player, the gunner can watch the enemy while the Helm watches the planet.

## 7. What the view draws

Original placeholder shapes in Pixi Graphics; the world container is scaled and translated by the camera. Drawn in this order (back to front):

1. **Background:** deep space and a faint parallax star field (render only, seeded from the run).
2. **Grid:** a coordinate grid in world units, labelled with column letters and row numbers so players can call positions ("they're in D4"). Grid spacing switches with zoom (500 units at wide zoom, 250 at close) so lines never crowd.
3. **Gravity contours:** faint rings around the planet at fixed pulls (for example 40, 10 and 3 u/s²), so the well's strength is visible at any zoom.
4. **The map edge.**
5. **Bodies:** the planet (shaded disc), asteroids (rough original polygons generated from each asteroid's seed). At wide zoom the belt draws as a textured band with its gaps visible, and single asteroids are drawn only above a minimum on-screen size.
6. **Ships:** original wedge silhouettes with three room segments (demo spec §5). **Below a minimum on-screen size, a ship draws as a fixed-size icon** (a chevron pointing along its heading, coloured crew or enemy), so ships never vanish at wide zoom.
7. **Per-console layers:**
   - **Helm:** the **predicted path** (about 2 s ahead at close zoom, rising to about 8 s at wide zoom), computed with the same pure physics function from the latest state; a velocity vector; a heading line; the thrust and turn state; a **bearing ring** around the ship (0 to 359, north = 0) at close and middle zoom.
   - **Weapons** (drawn by the weapons work, demo spec §7): laser arc, room lock, missile path. Listed here so the layer order is fixed.
8. **Screen-space overlay:** off-screen arrows, the zoom level, a scale bar, the snap-back hint while panned, the player's status and the other player's status.

Rendering interpolates between published states (render time = latest state minus one tick), so motion stays smooth at 60 fps today and over Net-3's 20 to 30 Hz deltas later.

## 8. The dev flight view

Before the duel exists, a **dev-only flight view** loads a map and one ship flown by one player on one machine, with the full camera. Its job is to tune §5's feel targets by hand. It is a workbench (like the H-1 split view in the demo spec), never a game mode offered to players (Q15). It also shows a debug panel: speed, distance to the planet, current pull, and frame and tick time.

## 9. Architecture

- **Sim (`sim/tactical/`):** `map.ts` (`MapDef`, the seeded generator and its validation), `bodies.ts` and `physics.ts` (gravity, thrust, drag, stabilise, integration, collisions, the broad-phase grid), `headings.ts` (generated), `tuning.ts`. It imports nothing from the sector-run sim except shared helpers (RNG, hashing). The duel's state (`TacticalState`) owns the bodies; weapons, rooms and the hunter (demo spec) add to it.
- **Pure prediction:** `predictPath(state, shipId, seconds)` lives in `sim/tactical/physics.ts`, has no side effects and is used by the render for the predicted path. It never feeds back into the sim.
- **Client view (`render/tactical/`):** `camera.ts` (follow, pan, snap, zoom, screen ↔ world transforms; pure and unit-tested), `tacticalLayer.ts` (the draw order in §7), `offscreen.ts` (edge arrows), `grid.ts`.
- **Input:** the Helm's held axes go through the existing held-input path. Camera inputs (zoom, pan, snap) are handled in the client and never become commands.

## 10. Build order

| Step | Delivers | Checks |
|---|---|---|
| TV-0 | Map data and generator, physics, headings table, held-input flight, headless tests | Orbit, energy, hash and 200-seed map tests in `npm test`; AST guard green |
| TV-1 | Camera, the §7 draw order for the Helm, the dev flight view | Camera transform unit tests; the §5 feel targets met by hand; the owner flies it |
| then | The duel on top (demo spec H-0 onward): weapons, rooms, repair, hunter | Demo spec §15 |

TV-0 and TV-1 are the first half of the demo spec's H-0 and H-1.

## 11. Open questions (defaults taken meanwhile)

1. North-up with a rotating ship, not heading-up (§6). **(rec.)**
2. The camera stays where it was panned until the player snaps back; no automatic return (§6). **(rec.)**
3. Everything on the map is visible to both players; no sensor range or fog in the demo (§7). **(rec.)**
4. Turn and thrust ride the existing held-input channel (§5). **(rec.)**
5. Map size, belt radii and spawns at r = 2000 (§3) need checking against the duel's 3 to 5 minute target once the hunter exists. *(start)*

## Change log

- 2026-11-14: written from grill Q12, Q16, Q18 and Q23 to Q23c.
