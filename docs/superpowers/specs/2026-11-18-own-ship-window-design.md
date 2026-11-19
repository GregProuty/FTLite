# Own ship window: FTL-style paired ship views on the consoles

Date: 2026-11-18. Status: design approved by the owner in conversation; spec awaiting owner review.

## 1. Why

A player seated at Helm, Weapons, Science or Flight watches the map and the enemy window. Their own ship shows only as
rows in the status table (`FIRE` and low `HULL` blink as `'alert'` rows) and in full on the SHIP tab. The owner's worry:
"they could not notice that the ship is on fire." FTL solves this by always showing your ship on the left and the enemy
on the right. We copy that pairing with small windows.

## 2. What the player sees

- An **OWN SHIP** window on every console (Helm, Weapons, Science, Flight), at the **top left, just right of the status
  table**. It mirrors the enemy contact window on the right across the map. It shows always, whether or not a contact is
  open. It does not show on the SHIP tab (the full interior is already there) or in the standing `interior` view.
- Frame and header copy the contact window's look (`Panel`, `CRT` ramp, `FONT_NATIVE`):
  - title `OWN SHIP`;
  - `SHLD` pips (up / of), as the contact window draws them;
  - `HULL` bar and value. At or below 25 % of max hull (the readout's existing rule) the value draws as an inverse
    alert block that blinks at `ALERT_BLINK_HZ`.
- The drawing is the **real interior**, shrunk to fit the drawing box:
  - every room's tiles filled `CRT.glass`, with a 1 px `CRT.main` outline on each tile edge that borders another room or
    open space (so rooms read as FTL-style boxes);
  - the three tactical rooms (Weapons, Shields, Engines, via `d.points`) take the contact window's damage look for their
    level: `roomLook(true, level, blink(t, DAMAGE_BLINK_HZ))` fill/stroke/hatch from `crtTheme.ts`;
  - a **burning** room (`pointBurning(d, p)`) fills `CRT.hot`, blinking at `ALERT_BLINK_HZ`, and shows a 2 px bar along
    its bottom edge with `extinguishProgress(d, p)` while above 0;
  - each crew member is a 3×3 `CRT.hot` dot at its position (`crewHealthMarks(d)`); a downed one draws hollow.
  - No room labels (too small); fire and damage are read by colour and blink.
- **Fire start flash:** for 2 s after any `fireStart` event, the window's border draws `CRT.hot` at 2 px and blinks at
  `ALERT_BLINK_HZ`. The existing fire alarm sound is unchanged.
- The window is display-only: it takes no clicks, but it swallows pointer and wheel events like the contact window so a
  click on it never reaches the map.

## 3. Layout

`render/duel/consoleLayout.ts` gains:

```ts
/** Own ship window spec §3: top left, right of the status table, mirroring CONTACT across the map. */
export const OWN_SHIP = { x: STATUS.x + STATUS.w + EDGE, y: STATUS.y, w: 240, h: 170 } as const;
/** Its drawing box under the title and status rows. */
export const OWN_SHIP_BOX = { x: OWN_SHIP.x + 8, y: OWN_SHIP.y + 34, w: OWN_SHIP.w - 16, h: OWN_SHIP.h - 42 } as const;
```

- `OWN_SHIP` must not overlap `TABS`, `STATION` (any station's top), `FLIGHT`, `SIDE` or `CONTACT`. A layout test
  checks this.
- The map's off-screen arrows keep clear of it. The left reserve rises to `OWN_SHIP.x + OWN_SHIP.w + EDGE` only for an
  arrow whose y is within `OWN_SHIP`'s band. If the arrow code can't do a banded reserve simply, fall back to raising
  `STATUS_RESERVE` on the left side; the plan picks one after reading the arrow code.
- The enemy contact window is unchanged. Making it smaller to match is a possible follow-up, not part of this spec.

## 4. Architecture

All pure view-model plus one display component, following the contact window's pattern.

- **`render/duel/ownShipModel.ts`** (new, pure, no React/Pixi):
  `ownShipModel(d: DuelState, box: { x: number; y: number; w: number; h: number }, t: number, flashUntil: number): OwnShipView`

  ```ts
  interface OwnShipView {
    shields: { up: number; of: number };
    hull: { value: number; fill: number; alert: boolean };
    tiles: { x: number; y: number; s: number; fill: number }[];   // one per room tile, internal px, s = tile size
    edges: number[];                                                // outline segments x1,y1,x2,y2,... internal px
    damage: { points: number[]; fill: number | null; stroke: number; hatch: { colour: number; segments: number[] } | null }[];
    fires: { x: number; y: number; w: number; progress: number }[];  // the bar along each burning room's bottom edge
    crew: { x: number; y: number; downed: boolean }[];
    flash: boolean;                                                 // the border is in its fire-start flash (lit phase)
  }
  ```

  - Fit: scale the interior's tile grid (`derived.width` × height) uniformly into `box`, centred, whole-pixel tile size
    when it is at least 3 px, otherwise fractional. Tile `t` → `(t % w, ⌊t / w⌋)`, as `interiorOverlay` does.
  - Rooms come from `d.interior.derived.roomTiles`. Edges: for each room tile, emit each side whose neighbour is not
    in the same room.
  - Damage and fire use `d.points`, `d.tactical.systems[CREW_SLOT].rooms`, `pointBurning` and `extinguishProgress`,
    the same sources as `interiorOverlay` and `readoutRows`.
  - Hull and shields come from `d.tactical.systems[CREW_SLOT]` and `classOf(d.tactical, CREW_SLOT)`, as the readout
    uses them.
  - Colours are resolved here (CRT ramp numbers, blink applied with `t`), so React does no blinking, matching
    `contactModel`.
- **`ui/duel/OwnShipWindow.tsx`** (new): `Panel` + header (`PixelText`, pips, `Bar`) + one inline SVG over
  `OWN_SHIP_BOX` in internal px (`viewBox` = box, `crispEdges`), drawing tiles, edges, damage polygons and hatch, fire
  fills and bars, and crew dots. Move `polyPoints` and `segPath` out of `ContactWindow.tsx` into a small shared module
  (`ui/duel/svgPaths.ts`) and use them from both.
- **View plumbing:** `DuelUiView` (`ui/views.ts`) gains `ownShip: OwnShipView | null`. `app/duel/scene.ts` builds it
  beside `contactModel` when `station !== null && station !== 'ship'`, and otherwise passes `null`. `DuelUi.tsx` renders
  `<OwnShipWindow>` inside the CRT provider, after `ReadoutPanel`.
- **Fire-start flash:** `scene.ts` keeps `flashUntil` (seconds, render time). When the frame's duel events include a
  `fireStart`, it sets `flashUntil = t + 2`. The model's `flash` is `t < flashUntil && blink(t, ALERT_BLINK_HZ)`.
  This is render-only state; nothing enters the sim.

## 5. Out of scope

- No sim change: `SIM_VERSION` and the golden replay are unchanged.
- No breach or oxygen look yet. When the Engineering spike adds them, the model gains a `breaches` list and an oxygen
  tint per room; the view shape leaves room for that.
- No clicks on the window. Clicking to jump to the SHIP tab can come later.
- The enemy contact window does not change size.

## 6. Testing

- `ownShipModel` unit tests on a built duel state:
  - every room tile maps inside `box`; the fit is centred;
  - edges: a single-room 2×2 block yields only its 8 perimeter segments;
  - a burning point room yields a `fires` entry with the extinguish progress and a `CRT.hot` tile fill in the lit
    blink phase;
  - a damaged room at level 1 and 2 yields the `roomLook` fill, stroke and hatch;
  - hull alert at ≤ 25 % and not above; shields `up/of` match the crew ship;
  - crew dots at the crew's scaled positions, `downed` set for a downed crew member;
  - `flash` true only before `flashUntil` and in the lit phase.
- Layout test: `OWN_SHIP` inside the 1280×720 stage and clear of `TABS`, every `STATION` top, `FLIGHT`, `SIDE` and
  `CONTACT`.
- Component test (the existing `ContactWindow` test harness): renders the panel and SVG, draws one tile rect per room
  tile, and does not render when `ownShip` is `null`.
- Manual look check: run the app, start a fire, and screenshot Helm, Weapons and Flight with the window flashing. The
  owner's look gate stays open after merge.
