# Own ship window: FTL-style paired ship views on the consoles

Date: 2026-11-18. Status: design approved by the owner in conversation; spec in /refine.

## 1. Why

A player seated at Helm, Weapons, Science or Flight watches the map and the enemy window. Their own ship shows only as
rows in the status table (`FIRE` and low `HULL` blink as `'alert'` rows) and in full on the SHIP tab. The owner's worry:
"they could not notice that the ship is on fire." FTL solves this by always showing your ship on the left and the enemy
on the right. We copy that pairing with small windows.

## 2. What the player sees

- An **OWN SHIP** window on every console view (Helm, Weapons, Science, Flight), at the **top left, just right of the
  status table**. It mirrors the enemy contact window on the right across the map. It shows always on a console view,
  whether or not a contact is open. It does not show on the SHIP view (`view === 'interior'`), whether the player is
  standing or seated and Tabbed to SHIP: the full interior is already there.
- Frame: `Panel` at `OWN_SHIP`, CRT ramp, `FONT_NATIVE` text (16 px line). Header rows (x0 = `OWN_SHIP.x + 8`,
  right = `OWN_SHIP.x + OWN_SHIP.w - 8`):
  - row 1 at `OWN_SHIP.y + 4`: the title `OWN SHIP` in `CRT.main`;
  - row 2 at `OWN_SHIP.y + 20`: `SHLD` label (`CRT.mid`) at x0, then one 8×8 pip per shield layer at `x0 + 36 + k * 12`
    (lit: `CRT.main` fill; unlit: 1 px `CRT.mid` border, as the contact window's pips); `HULL` label (`CRT.mid`) at
    `x0 + 100`; a 6 px tall bar at `x0 + 136`, 56 px wide, filled `hull / max hull` in `CRT.main`; the hull value
    right-aligned at `right`.
  - At or below 25 % of max hull (the readout's existing rule) the hull value draws as an inverse block whose colour
    alternates `CRT.hot` / `CRT.main` at `ALERT_BLINK_HZ`, with the digits in `CRT.glass`. The model resolves the
    phase; React does not blink.
  - Every header element lies inside `OWN_SHIP` and above `OWN_SHIP_BOX.y`.
- The drawing is the **real interior**, shrunk to fit `OWN_SHIP_BOX`. Walls, doors and open space are not drawn; the
  dark gaps between rooms are the walls. Every room uses the own-ship look table below, defined in `ownShipModel.ts`
  (not `roomLook`: `CREW_LOOKS` is tuned for the map hull, and its level-2 hot phase would read as fire):

  | Room state | Tile fill | Hatch | Outline |
  | --- | --- | --- | --- |
  | normal (level 0, not burning) | `CRT.glass` | none | `CRT.main` |
  | damaged level 1 | `CRT.dim` | none | `CRT.main` |
  | damaged level 2 | `CRT.dim` | `CRT.main` at 45°, every `HATCH_SPACING` px, drawn only while `blink(t, DAMAGE_BLINK_HZ) === 1` | `CRT.main` |
  | burning (any level) | `CRT.hot` while `blink(t, ALERT_BLINK_HZ) === 1`, else `CRT.mid` | none | `CRT.hot` |

  - Fire overrides damage: a burning room shows only the fire look. In play every burning room is also damaged, because
    an ignition follows a hit that raised the room's level.
  - Damage never uses `CRT.hot` and fire never hatches, so the two never look alike.
  - Only the three tactical rooms (Weapons, Shields, Engines, via `d.points`) can be damaged or burn. Every other room
    is always normal.
  - A burning room with `extinguishProgress(d, p) > 0` draws a 2 px `CRT.glass` bar along the bottom of its rectangle,
    filled from the left in `CRT.main` to the progress. At progress 0 there is no bar.
- Crew: each crew member is a 3×3 `CRT.hot` square inside a 5×5 `CRT.glass` square, centred on its position, so it
  reads on a hot burning room too. A downed crew member is a 5×5 `CRT.hot` 1 px outline with a `CRT.glass` centre.
- No room labels (too small); fire and damage are read by colour and blink.
- **Fire-start flash:** for 2 s after a room catches fire (§4 says how this is detected), the window's border draws
  `CRT.hot` at 2 px while `blink(t, ALERT_BLINK_HZ) === 1`, and the normal `Panel` border otherwise. The existing fire
  alarm sound is unchanged.
- The window is display-only: it takes no clicks, but it swallows pointer, context-menu and wheel events like the
  contact window's root `div`, so a click on it never reaches the map. On the Flight seat the nose does not follow the
  pointer over it (§3).

## 3. Layout and the map around it

`render/duel/consoleLayout.ts` gains:

```ts
/** Own ship window spec §3: top left, right of the status table, mirroring CONTACT across the map. */
export const OWN_SHIP = { x: STATUS.x + STATUS.w + EDGE, y: STATUS.y, w: 240, h: 170 } as const;
/** Its drawing box under the two header rows. */
export const OWN_SHIP_BOX = { x: OWN_SHIP.x + 8, y: OWN_SHIP.y + 40, w: OWN_SHIP.w - 16, h: OWN_SHIP.h - 48 } as const;
```

That is x 228 to 468 and y 42 to 212; the box is x 236 to 460 and y 82 to 204.

- `OWN_SHIP` must lie inside the 1280×720 stage and must not overlap `TABS` (y 8 to 34), the status table's column
  (x below `STATUS.x + STATUS.w`), any `STATION` block, `FLIGHT`, `SIDE` or `CONTACT`. A layout test checks this.
- **Draw order:** `OwnShipWindow` draws after `ReadoutPanel` and before `ContactWindow`, `TargetingLine`, `SitCard` and
  `Banners`. The sit card (centred at x 676) and the banners can overlap the window's right edge by up to about 15 px
  for the longest Weapons title. They are short-lived and draw on top. This overlap is accepted and not tested.
- **Off-screen arrows** (`render/tactical/tacticalModel.ts`): the tactical view input gains an optional
  `avoid?: { x: number; y: number; w: number; h: number }`. The scene passes `OWN_SHIP` exactly when it builds
  `ownShip` (`onMap`, §4); otherwise it passes nothing, which changes nothing.
  - Let `A` be `avoid` grown by `ARROW_MARGIN` on its right and bottom sides, and let `C` be the centre of
    `edgePoint`'s inset rectangle. On a console, `C` is always right of and below `A`: C is about (676, 382) and A's
    corner is (496, 240).
  - In `arrow()`, let `q` be `edgePoint`'s point, or the object's screen point when `edgePoint` returns null (the object
    is on screen). The arrow moves onto the window's boundary when `edgePoint`'s point lies inside `A`, or when the
    on-screen point lies inside the ungrown `avoid` (it is hidden under the window). An on-screen object in A's margin
    band is visible and gets no arrow, as today.
  - The arrow is then placed where the ray from `C` toward the object enters `A`, at parameter `k = max(kx, ky)`, with
    `kx = (A.right - C.x) / dx` and `ky = (A.bottom - C.y) / dy`.
  - It sits on A's right edge when `kx >= ky` (a corner counts as right), and on A's bottom edge otherwise. The angle
    stays the ray's angle, as today.
  - `ArrowDraw` gains an optional `edge?: 'avoidRight' | 'avoidBottom'`, set only on such arrows.
  - `spreadArrows` gains the same optional `avoid`.
    - Arrows with `edge` set group by their edge and spread along it. `avoidRight` uses the side gap, with bounds
      `reserveTop + m` to `A.bottom`. `avoidBottom` uses the top gap, with bounds `reserveLeft + m` to `A.right`.
    - The top edge's group gets lower bound `A.right` and the left edge's group gets upper start `A.bottom`, so
      spreading never pushes an arrow back under the window.
- **Sit-down framing** (`render/duel/sitModel.ts` `frameZoom`, called at the `scene.ts` sit-down): it gains an optional
  `avoid` rect.
  - When the enemy is up and to the left (`dx < 0 && dy < 0`), the zoom is also capped at
    `max((vp.w / 2 - (avoid.x + avoid.w) - FRAME_MARGIN) / |dx|, (vp.h / 2 - (avoid.y + avoid.h) - FRAME_MARGIN) / |dy|)`.
    The framed enemy then clears the window on at least one axis.
  - The existing 0.25 to 1 clamp still applies last.
  - The scene passes `OWN_SHIP`.
- **Flight pointer** (`app/duel/flightPointer.ts`): `OWN_SHIP` joins `BLOCKS`, the rects that are not open map, so the
  Flight nose ignores the pointer over the window.
- The enemy contact window is unchanged. Making it smaller to match is a possible follow-up, not part of this spec.

## 4. Architecture

All pure view-model plus one display component, following the contact window's pattern.

- **`render/duel/ownShipModel.ts`** (new, pure, no React or Pixi):
  `ownShipModel(d: DuelState, box: { x: number; y: number; w: number; h: number }, t: number, flashUntil: number): OwnShipView`

  ```ts
  interface OwnShipView {
    shields: { up: number; of: number };
    hull: { value: number; fill: number; alert: boolean; block: number | null };   // block: the resolved inverse-block colour while alert, else null
    tiles: { x: number; y: number; s: number; fill: number }[];   // one per room tile, internal px, s = tile size
    edges: { colour: number; segments: number[] }[];               // outline segments x1,y1,x2,y2,... grouped by colour
    hatch: number[];                                               // level-2 hatch segments in their lit phase (CRT.main), else []
    fires: { x: number; y: number; w: number; progress: number }[];  // the bar under each burning room with progress > 0
    crew: { x: number; y: number; downed: boolean }[];             // centres, internal px
    flash: boolean;                                                // the border is in the lit phase of its fire-start flash
  }
  ```

  - **Fit:** the grid is `gw = d.interior.derived.width` by `gh = d.interior.derived.height` tiles (`sim/ship/derived.ts`).
    - The tile size is `s = min(box.w / gw, box.h / gh)`, floored to a whole pixel when that is at least 3, otherwise
      kept fractional.
    - The grid is centred in `box`, with its origin rounded to whole pixels.
    - Tile index `k` maps to column `k % gw` and row `⌊k / gw⌋`, as in `interiorOverlay`.
    - A crew position in tiles (`Position.x/y`, the values `crewHealthMarks` multiplies by `TILE_PX`) maps to
      `origin + position * s`.
  - **Rooms** come from `d.interior.derived.roomTiles`. A room's rectangle is its tiles' bounding box. Every room in the
    current layouts is a rectangle, and a test asserts that for every shipped layout.
  - **Edges:** for each room tile, each side whose neighbour is not a tile of the same room, in that room's outline
    colour.
  - **Damage and fire** use `d.points`, `d.tactical.systems[CREW_SLOT].rooms` (through `roomLevel`), `pointBurning` and
    `extinguishProgress`. These are the same sources as `interiorOverlay` and `readoutRows`. The hatch is
    `hatchSegments(rect polygon, HATCH_SPACING, HATCH_ANGLE)` from `render/tactical/dashModel.ts`.
  - **Hull and shields** come from `d.tactical.systems[CREW_SLOT]` and `classOf(d.tactical, CREW_SLOT)`, as the readout
    uses them.
  - **Colours** are resolved here (CRT ramp numbers, with the blink applied from `t`), so React does no blinking. This
    matches `contactModel`.
- **`ui/duel/OwnShipWindow.tsx`** (new):
  - a root `div` that takes the pointer and swallows events, as `ContactWindow`'s does;
  - `Panel`;
  - the header (`PixelText`, pip `Box`es, `Bar`);
  - one inline SVG over `OWN_SHIP_BOX` in internal px (`viewBox` = box), drawing tiles, edges, hatch, fire bars and crew
    in that order;
  - when `flash` is true, a 2 px `CRT.hot` border `Box` over the panel edge.

  `polyPoints` and `segPath` move out of `ContactWindow.tsx` into `ui/duel/svgPaths.ts`, used by both.
- **View plumbing:**
  - `DuelUiView` (`ui/views.ts`) gains `ownShip?: OwnShipView | null`, like the other optional members.
  - `app/duel/scene.ts` builds it only when `onMap` is true, and otherwise passes `null`. `onMap` is the existing flag:
    `view !== 'interior'` and the seat is helm, weapons, science or flight.
  - `DuelUi.tsx` renders `<OwnShipWindow>` in the draw order of §3.
- **Fire-start flash:** detected from state, not from sim events. The scene's drained `ViewEvent`s carry no
  `fireStart`, and an online client never sees the host's sim events. The fire alarm's `ignited` count in
  `audio/interiorSounds.ts` is a state diff for the same reason.
  - `scene.ts` keeps a watch `{ tick, burning: boolean[] }`, with one entry per `d.points` entry from `pointBurning`. It
    also keeps `flashUntil`, in seconds of presentation time `t`.
  - It updates the watch on every drawn frame, whatever the view, so sitting down in a burning ship does not flash.
  - The watch re-baselines with no flash in three cases: when there is no watch yet, after a duel epoch reset, and when
    the frame is not fresh by the fire alarm's rule (`d.tactical.tick` went back, jumped by more than
    `HIT_FRESH_TICKS` from `render/impactModel.ts`, or the length changed).
  - Otherwise, when any entry burns now that did not burn in the watch, it sets `flashUntil = t + 2`.
  - The model's `flash` is `t < flashUntil && blink(t, ALERT_BLINK_HZ) === 1`.
  - The watch is a pure helper exported for tests.
  - This is render-only state; nothing enters the sim.

## 5. Out of scope

- No sim change: `SIM_VERSION` and the golden replay are unchanged.
- No breach or oxygen look yet. When the Engineering spike adds them, the model gains a breach mark and an oxygen tint
  per room, and the look table gains rows.
- No clicks on the window. Clicking to jump to the SHIP tab can come later.
- The enemy contact window does not change size.

## 6. Testing

- `ownShipModel` unit tests on a built duel state:
  - every room tile maps inside `box`, and the grid is centred in it;
  - every room of every shipped layout (hound, scout, valkyrn) is a rectangle;
  - edges: a single-room 2×2 block yields only its 8 perimeter segments;
  - a level-1 and a level-2 point room give the table's fill, and level 2 hatches in phase 1 only;
  - a burning point room, at level 1 and at level 2, gives:
    - the fire fill in both blink phases (`CRT.hot` and `CRT.mid`);
    - no hatch;
    - the `CRT.hot` outline;
    - a `fires` entry only when its extinguish progress is above 0;
  - hull `alert` at ≤ 25 % and not above, with `block` alternating `CRT.hot` / `CRT.main` by phase;
  - shields `up/of` match the crew ship;
  - crew centres at `origin + position * s`, with `downed` set for a downed crew member;
  - `flash` is true only before `flashUntil` and in the lit phase.
- Flash watch tests:
  - a new burning entry sets `flashUntil = t + 2`;
  - the first frame, an epoch reset and a stale tick re-baseline with no flash;
  - a room that was already burning gives no flash.
- Arrow tests (`tacticalModel`):
  - an object hidden under `OWN_SHIP` gets an arrow on A's right or bottom edge;
  - a top-edge arrow that would land on the window moves onto `A`;
  - a ray through A's corner lands on the right edge;
  - two arrows landing on the same avoid edge are spread apart;
  - after spreading, no top-edge arrow sits left of `A.right`;
  - with no `avoid`, the output is unchanged (the existing arrow tests pass as they are).
- `frameZoom` test: an up-left enemy is framed clear of `avoid` on at least one axis; without `avoid` the result is
  unchanged.
- `flightPointer` test: a point inside `OWN_SHIP` is not open map.
- Scene test: seated at Helm with `view === 'interior'`, `ownShip` is null and no `avoid` is passed; seated at Helm on
  the map, both are set; standing on a map view, neither is.
- Layout test: `OWN_SHIP` lies inside the stage and is clear of `TABS`, the status column, every `STATION` block,
  `FLIGHT`, `SIDE` and `CONTACT`; `OWN_SHIP_BOX` lies inside `OWN_SHIP`.
- Component test, in the existing `contactWindow.test.tsx` harness:
  - renders the panel and the SVG;
  - draws one tile rect per room tile;
  - keeps every header element above `OWN_SHIP_BOX.y`;
  - does not render when `ownShip` is null or absent.
- Manual look check: run the app, start a fire, and screenshot Helm, Weapons and Flight with the window flashing. The
  owner's look gate stays open after merge.
