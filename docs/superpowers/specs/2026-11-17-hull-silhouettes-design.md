# Hull silhouettes: the Hound and an original drone scout on the tactical map

Date: 2026-11-17. Owner request: "make sure that the player ship in the tactical view looks like a sillouette of the Hound Transport ship instead of just an arrow/triangle ... I also want the enemy in the demo to be a sillouette of [FTL's Auto-Scout]." The Auto-Scout is Subset Games' ship design from FTL, so it is not traced or copied. The owner chose an original drone scout instead (2026-11-17), and its look is part of the owner's gate.

Process tier: views. That means one spec, one plan, a subagent build, one implementation review, and the owner's look as the gate. This is presentation only:
- no sim, command, snapshot or authority change;
- SIM_VERSION and the goldens do not move;
- `SHIP_RADIUS` (collision) is unchanged, because the silhouettes are drawn over the same footprint the wedge used.

## Goal

On the Helm map, the Weapons map and the flight view:
- **the crew's ship** is drawn as the Hound's outline: the twin aft nacelles, the body and the cockpit nose, traced from the Hound painting the interior already shows;
- **the enemy** is drawn as an original unmanned scout: a forked sensor nose, a round sensor disc, a thin spine and swept tail fins.

The two must be told apart by shape alone, as well as by the CRT fill. That fill is unchanged: the crew's ship is solid `hot`, and the enemy is hollow `main` with its blinking dashed ring. Damage, the lock and the shield rings keep working per room.

## Non-goals

- The interior view (it already shows the painted Hound).
- The zoomed-out chevron below `SHIP_CHEVRON_PX`, which stays as it is.
- Collision, hit or arc geometry.
- The Auto-Scout or any FTL ship design.
- Silhouettes for ships other than these two (the sector game, future enemies).
- Painted or textured ship sprites on the map.

## 1. The hull model

A new pure module `render/tactical/hullModel.ts` (no Pixi import):

- `type HullId = 'hound' | 'scout'`.
- `interface Hull { outline: readonly number[]; rooms: readonly (readonly number[])[] }`.
  - Both are flat `[f, s, f, s, ...]` polygons in ship units, with the nose at +f and the ship's right (starboard) at +s, which is the frame the layer already uses (`fx, fy` forward, `rx, ry` right).
  - One ship unit is `SHIP_RADIUS * zoom` screen pixels, as it is for the wedge today.
  - `rooms[0]` is Weapons, `rooms[1]` is Shields and `rooms[2]` is Engines, which are the room indices of `ROOM_NAMES`.
- `HULLS: Readonly<Record<HullId, Hull>>`, frozen constants.
- `hullFor(crew: boolean): HullId`: `'hound'` for the crew's ship, `'scout'` for the enemy.
- `roomCentre(hull: HullId, room: number): { f: number; s: number }`: the mean of the room polygon's vertices.
- `ENEMY_RING = 1.35` moves here from `tacticalLayer.ts`, which re-exports it, so this module and its test need no Pixi.

**Constraints, each unit-tested:**
- Every room polygon is convex. The hatch clips by line-polygon intersection (`isConvex`, `hatchSegments`).
- Every room vertex is strictly inside its hull's outline (point in polygon). No room edge properly crosses an outline edge (segment intersection). Both checks are needed, because the outlines are concave.
- No room polygon's area is less than 0.2 square units. That is 20 px² at the default zoom 0.5 (10 px per unit), so the damage tone in section 2 shows as a patch, not a speck.
- Each outline is a simple polygon (no edge properly crosses a non-adjacent edge).
- The vertex radius limits are 1.25 (`ENEMY_RING` − 0.1) on the scout, so its dashed ring clears the hull by at least 1 px at zoom 0.5, and 1.55 on the Hound, so the first shield ring at 1.6 clears it.

**The Hound** (43 vertices) is traced from the alpha of the bought painting `ship.hound.map` (2-Minute Tabletop). The trace steps were:
1. downscale by 8;
2. threshold alpha at 50 %;
3. close gaps with a 3 px max then min filter;
4. Moore boundary trace;
5. Douglas-Peucker at 2.5 px.

The painting's nose points to image +x with image y down, so f = image x and s = image y. The trace is centred on the painting's opaque bounding box and scaled so its length is 2.4 units. Only these coordinates enter git; the painting does not. The outline derives from the paid painting, so the same 2MT licence caveat applies: permission is needed before sale (reports/Painted battlemap asset matches.md).

```
outline: -0.565,-0.847, -0.03,-0.817, 0.101,-0.676, 0.282,-0.565, 0.424,-0.333, 0.474,-0.434, 0.524,-0.454, 0.776,-0.434,
  0.827,-0.363, 0.706,-0.353, 0.706,-0.313, 1.018,-0.282, 1.18,-0.121, 1.15,0.151, 0.998,0.282, 0.676,0.292, 0.696,0.353,
  0.837,0.353, 0.756,0.434, 0.484,0.444, 0.413,0.343, 0.272,0.565, 0.171,0.605, -0.061,0.807, -0.585,0.827, -0.605,0.766,
  -0.766,0.766, -1.029,0.676, -1.2,0.474, -1.16,0.424, -1.099,0.424, -1.089,0.333, -0.827,0.292, -0.847,-0.141, -0.817,-0.323,
  -1.089,-0.343, -1.099,-0.434, -1.16,-0.434, -1.19,-0.504, -1.139,-0.615, -0.998,-0.726, -0.877,-0.766, -0.615,-0.766
rooms: Weapons (cockpit and forward body)     1.1,-0.12, 1.1,0.14, 0.96,0.26, 0.5,0.26, 0.5,-0.26, 0.96,-0.26     (area 0.294)
       Shields (midship)                      0.4,-0.32, 0.4,0.32, -0.06,0.4, -0.06,-0.4                         (area 0.331)
       Engines (aft core between the nacelles) -0.16,-0.28, -0.16,0.28, -0.8,0.28, -0.8,-0.28                    (area 0.358)
```
Its maximum vertex radius is 1.294.

**The scout** (25 vertices: one on the axis and 12 mirrored pairs) is an original design:

```
outline: 0.92,0, 1.19,0.09, 1.23,0.17, 0.86,0.24, 0.62,0.46, 0.3,0.58, -0.02,0.46, -0.24,0.22, -0.62,0.2, -0.98,0.52,
  -1.12,0.5, -0.98,0.2, -1.08,0.12, -1.08,-0.12, -0.98,-0.2, -1.12,-0.5, -0.98,-0.52, -0.62,-0.2, -0.24,-0.22,
  -0.02,-0.46, 0.3,-0.58, 0.62,-0.46, 0.86,-0.24, 1.23,-0.17, 1.19,-0.09
rooms: Weapons (the fork's root)  0.88,-0.2, 0.88,0.2, 0.46,0.36, 0.46,-0.36     (area 0.235)
       Shields (the sensor disc)  0.36,-0.42, 0.36,0.42, -0.06,0.4, -0.06,-0.4   (area 0.344)
       Engines (the spine)        -0.18,-0.18, -0.18,0.18, -0.94,0.18, -0.94,-0.18 (area 0.274)
```
Its maximum vertex radius is 1.242, at the fork tips.

All of these constraints were computed against the coordinates above while writing this spec, and every one holds.

**What it replaces.** The wedge (`wedgeSegments`, `WEDGE_NOSE`, `WEDGE_TAIL`, `WEDGE_HALF`) and `segmentCentre` are deleted. Their consumers change as follows:
- `tacticalLayer.ts` (L14 import, L118 loop) draws from `HULLS[s.hull]`;
- `weaponsModel.ts` (L13 import, L48-L53 `segmentCentre`, L75) puts the lock on `roomCentre(hullFor(false), room)`;
- `tests/tacticalModel.test.ts` L6 (the import) and L170 (the wedge's three rooms) become a test that both hulls have three rooms;
- `tests/dashModel.test.ts` L3 and L40-L43 (wedge convexity) move into the new `tests/hullModel.test.ts`;
- `tests/duelWeaponsView.test.ts` L13 and L108 use `roomCentre('scout', 0)`.

## 2. Drawing

`ShipDraw` gains a required `hull: HullId`, which `tacticalModel` sets through `hullFor(crew)`. `drawShip` takes the shape from `HULLS[s.hull]` and the colours from `s.crew`; the two always agree in the game. The test fixtures that build `ShipDraw` by hand set `hull` too: in `tests/crtColours.test.ts`, the `ship()` default gets `hull: 'hound'` and the enemy fixtures get `hull: 'scout'`.

When the ship is not a chevron, it is drawn in this order:
1. The outline. The crew's is filled `hot` with a 1 px `glass` stroke. The enemy's is filled `glass` with a 1 px `main` stroke.
2. Each room, by the table below.
3. The enemy's dashed ring at `ENEMY_RING`, then the shield rings, both unchanged.

All strokes and hatch lines are 1 px wide. "Phase" is `blink(t, DAMAGE_BLINK_HZ)` (2 Hz), so phase 0 and phase 1 alternate. Level 2 is exactly the CRT map's rule (CRT spec section 2). The only change is at level 1: a tone fill under the hatch, so a damaged room reads as a patch even where it is too small for more than one or two hatch lines at the default zoom.

| Ship | Room level | Room fill | Room stroke | Hatch |
|---|---|---|---|---|
| crew | 0 | none | `glass` | none |
| crew | 1 | `mid` | `glass` | `glass` |
| crew | 2, phase 0 | `glass` (cut-out) | `hot` | none |
| crew | 2, phase 1 | `hot` (solid, as the outline) | `glass` | none |
| enemy | 0 | none | `mid` | none |
| enemy | 1 | `dim` | `main` | `main` |
| enemy | 2, phase 0 | `hot` | `glass` | none |
| enemy | 2, phase 1 | `glass` (hollow) | `main` | `main` |

This keeps the CRT map's rules:
- every colour is still a ramp colour (the full-frame colour test covers it);
- every blink alternates between two visible states;
- the hatch is unchanged (4 px at 45°, clipped to the room).

**Deviation from the CRT map spec, deliberate:** the level-1 tone fill (`mid` on the crew, `dim` on the enemy) is new. The CRT spec has no fill change at level 1, only the hatch. Rooms inside a real hull outline are smaller than the wedge's segments, which filled the whole wedge. At zoom 0.5 the new rooms get about 1.2 to 1.7 hatch lines on average (the wedge got 1.8 to 3.0), and no room layout inside these outlines reaches 2 lines everywhere. The tone keeps the "two visible states, never off" rule and the ramp colours, and level 2 is unchanged. The owner's look gate judges it.

There are no display objects per frame, and each `Graphics.poly` call gets a fresh array.

Below `SHIP_CHEVRON_PX` (10 px across) the chevron is drawn as today. The lock label offset (`max(14, k·1.6) + 6` px from the ship's centre) clears both hulls, since both lie inside radius 1.3.

## 3. Testing and the gate

- **Unit tests:**
  - `tests/hullModel.test.ts`: each constraint of section 1 for both hulls; `hullFor`; `roomCentre` for both hulls.
  - `tacticalModel`: it sets `hull` per ship.
  - The lock: the marker sits on the scout's locked room centre.
  - `tests/crtColours.test.ts`: the full-frame colour test with both hulls at damage levels 0, 1 and 2 in both phases.
- **Unchanged:** all existing tests pass, with the wedge's tests moved as in section 1. SIM_VERSION and the goldens are unchanged.
- **Screenshots** (the CRT map harness approach), saved to `C:\Users\djuar\FTLite-shots\hull-silhouettes\`:
  - the Weapons map at the default zoom (0.5) with the lock and damage at levels 1 and 2 on both ships. This is a pass/fail check: in this shot, every damaged room on both ships must be told apart from an undamaged one, and level 1 from level 2, in both blink phases (take one shot per phase);
  - the Helm map;
  - the flight view;
  - the Weapons map at `ZOOM_MAX` (1.2) on both ships.
- **Owner gate:** does the crew's ship read as the Hound and the enemy as a distinct drone at a glance, and are damage and the lock still clear?
