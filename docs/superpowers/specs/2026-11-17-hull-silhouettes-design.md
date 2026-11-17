# Hull silhouettes: the Hound and an original drone scout on the tactical map

Date: 2026-11-17. Owner request: "make sure that the player ship in the tactical view looks like a sillouette of the Hound Transport ship instead of just an arrow/triangle ... I also want the enemy in the demo to be a sillouette of [FTL's Auto-Scout]." The Auto-Scout is Subset Games' ship design from FTL, so it is not traced or copied. The owner chose an original drone scout instead (2026-11-17); its look is part of the owner's gate.

Process tier: views (one spec, one plan, a subagent build, one implementation review, and the owner's look as the gate). Presentation only. No sim, command, snapshot or authority change, and SIM_VERSION and the goldens do not move. `SHIP_RADIUS` (collision) is unchanged: the silhouettes are drawn over the same footprint the wedge used.

## Goal

On the Helm map, the Weapons map and the flight view, the crew's ship is drawn as the Hound's outline: the twin aft nacelles, the body and the cockpit nose, traced from the Hound painting the interior already shows. The enemy is drawn as an original unmanned scout: a forked sensor nose, a round sensor disc, a thin spine and swept tail fins. The two must be told apart by shape alone, as well as by the CRT fill (crew solid `hot`, enemy hollow `main` with its blinking dashed ring, both unchanged). Damage, the lock and the shield rings keep working per room.

## Non-goals

The interior view (it already shows the painted Hound). The zoomed-out chevron below `SHIP_CHEVRON_PX`, which stays as it is. Collision, hit or arc geometry. The Auto-Scout or any FTL ship design. Silhouettes for ships other than these two (the sector game, future enemies). Painted or textured ship sprites on the map.

## 1. The hull model

A new pure module `render/tactical/hullModel.ts`:

- `type HullId = 'hound' | 'scout'`.
- `interface Hull { outline: readonly number[]; rooms: readonly (readonly number[])[] }`: flat `[f, s, f, s, ...]` polygons in ship units, with the nose at +f and the ship's right at +s. The ship's screen size is `SHIP_RADIUS * zoom` per unit, as it is for the wedge today. `rooms[0]` is Weapons, `rooms[1]` is Shields and `rooms[2]` is Engines (the room indices of `ROOM_NAMES`).
- `HULLS: Record<HullId, Hull>`, frozen constants.
- `hullFor(crew: boolean): HullId`: `'hound'` for the crew's ship and `'scout'` for the enemy.
- `roomCentre(hull: HullId, room: number): { f: number; s: number }`: the mean of the room polygon's vertices. It replaces `segmentCentre` in `weaponsModel.ts`, so the lock marker sits on the locked room of the enemy's hull.

Constraints, each unit-tested:
- Every room polygon is convex, because the hatch clips by line-polygon intersection (`isConvex`, `hatchSegments`).
- Every room polygon lies inside its hull's outline (each vertex is inside by a point-in-polygon test).
- No outline vertex lies farther than `ENEMY_RING` minus 0.05 (1.30) from the origin, measured on the scout, and 1.55 on the Hound. Shield rings start at 1.6, so they always clear the hull.
- The outline is a simple polygon (no self-intersections).

**The Hound** (43 vertices): traced from the alpha of the bought painting `ship.hound.map` (2-Minute Tabletop). The steps were: downscale by 8, threshold alpha at 50 %, close gaps with a 3 px max/min filter, Moore boundary trace, Douglas-Peucker at 2.5 px. The result is centred on the painting's opaque bounding box and scaled so its length is 2.4 units (half-width about 0.85). Only the coordinates enter git; the painting does not. The outline is a derivative of the paid painting, so the same 2MT licence caveat applies (permission needed before sale; reports/Painted battlemap asset matches.md).

```
outline: -0.565,-0.847, -0.03,-0.817, 0.101,-0.676, 0.282,-0.565, 0.424,-0.333, 0.474,-0.434, 0.524,-0.454, 0.776,-0.434,
  0.827,-0.363, 0.706,-0.353, 0.706,-0.313, 1.018,-0.282, 1.18,-0.121, 1.15,0.151, 0.998,0.282, 0.676,0.292, 0.696,0.353,
  0.837,0.353, 0.756,0.434, 0.484,0.444, 0.413,0.343, 0.272,0.565, 0.171,0.605, -0.061,0.807, -0.585,0.827, -0.605,0.766,
  -0.766,0.766, -1.029,0.676, -1.2,0.474, -1.16,0.424, -1.099,0.424, -1.089,0.333, -0.827,0.292, -0.847,-0.141, -0.817,-0.323,
  -1.089,-0.343, -1.099,-0.434, -1.16,-0.434, -1.19,-0.504, -1.139,-0.615, -0.998,-0.726, -0.877,-0.766, -0.615,-0.766
rooms: Weapons (cockpit and forward body) 1.12,-0.2, 1.12,0.2, 0.62,0.22, 0.62,-0.22
       Shields (midship)                  0.5,-0.36, 0.5,0.36, -0.02,0.4, -0.02,-0.4
       Engines (aft core between the nacelles) -0.14,-0.3, -0.14,0.3, -0.75,0.3, -0.75,-0.3
```

**The scout** (26 vertices, mirror-symmetric, an original design):

```
outline: 0.92,0, 1.32,0.09, 1.36,0.17, 0.86,0.24, 0.62,0.46, 0.3,0.58, -0.02,0.46, -0.24,0.2, -0.62,0.14, -0.98,0.52,
  -1.12,0.5, -0.98,0.12, -1.08,0.06, -1.08,-0.06, -0.98,-0.12, -1.12,-0.5, -0.98,-0.52, -0.62,-0.14, -0.24,-0.2,
  -0.02,-0.46, 0.3,-0.58, 0.62,-0.46, 0.86,-0.24, 1.36,-0.17, 1.32,-0.09
rooms: Weapons (the fork's root) 0.86,-0.16, 0.86,0.16, 0.62,0.2, 0.62,-0.2
       Shields (the sensor disc) 0.52,-0.3, 0.52,0.3, 0.08,0.36, 0.08,-0.36
       Engines (the spine)       -0.3,-0.12, -0.3,0.12, -0.96,0.09, -0.96,-0.09
```

The scout's fork tips reach 1.36 from the origin along the nose axis (radius about 1.37). That breaks the 1.30 limit above. The plan either scales the scout by 0.95 or moves the fork tips in to 1.28; it records which, and the test holds the limit.

The wedge (`wedgeSegments`, `WEDGE_*`) is removed once nothing uses it, and its tests move to the hulls.

## 2. Drawing

`ShipDraw` gains `hull: HullId`, set by `tacticalModel` through `hullFor(crew)`. In `tacticalLayer.drawShip`, when the ship is not a chevron:

- **The outline:** the crew's is filled solid `hot` with a 1-unit `glass` stroke. The enemy's is filled `glass` with a 1-unit `main` stroke. These are the wedge's base looks today, now on one outline polygon.
- **The rooms:** each room is drawn over the outline with a 1-unit stroke, `glass` on the crew and `mid` on the enemy, so the three rooms read as rooms. Damage applies per room exactly as today:
  - crew level 1: a `glass` hatch;
  - crew level 2: alternates a `glass` cut-out with a `hot` edge and solid `hot` at 2 Hz;
  - enemy level 1: a `main` hatch;
  - enemy level 2: alternates a solid `hot` fill and a `main` outline with a `main` hatch at 2 Hz.
- **Rings:** the enemy's dashed ring at `ENEMY_RING` and the shield rings are unchanged.
- **CRT rules:** every colour is still a ramp colour (the full-frame colour test covers it). There are no display objects per frame. Each `Graphics.poly` call gets a fresh array.

Below `SHIP_CHEVRON_PX` (10 px across) the chevron is drawn as today.

## 3. Testing and the gate

- **Unit tests:**
  - the hull constraints of section 1;
  - `hullFor`;
  - `roomCentre` for both hulls;
  - `tacticalModel` sets `hull` per ship;
  - the lock marker sits on the scout's locked room centre;
  - the existing full-frame CRT colour test with both hulls at damage levels 1 and 2.
- **No regressions:** all existing tests pass (the wedge tests move to the hulls). SIM_VERSION and the goldens are unchanged.
- **Screenshots** (the CRT map harness approach), saved to `C:\Users\djuar\FTLite-shots\hull-silhouettes\`:
  - the Weapons map at the default zoom with the lock and damage at levels 1 and 2 on both ships;
  - the Helm map;
  - the flight view;
  - one close zoom (zoom 2) on both ships.
- **Owner gate:** do the crew's ship read as the Hound and the enemy as a distinct drone at a glance, and are damage and the lock still clear?
