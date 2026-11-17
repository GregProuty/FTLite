# Enemy ship window (FTL-style targeting) — design

Date: 2026-11-17. Status: approved by the owner in chat ("this looks right"). Tier: views/feel (presentation only).

## 1. Goal

Bring back FTL's enemy-ship panel for the duel. The Weapons officer clicks the enemy on the tactical map. A window opens with a large map of the enemy ship's rooms. They click LASER, the cursor becomes a targeting reticle, and they click the room to target. The Helm can open the same window to see the enemy, but cannot aim. Everything is drawn in the CRT amber style.

This is the first piece of the future **Science** role: clicking things on the system map and scanning them. So the window is built as a general *contact window* about one map contact, here a ship. Later Science work adds other contacts and a scan action to the same window. This spec builds only the ship contact and the laser aim (YAGNI).

## 2. Owner decisions (fixed)

- **Laser only.** Only the laser is aimed from the window. The missile keeps its hand steering (A/D) and shows in the window as not aimable.
- **Aiming only sets the target.** Clicking a room sets the laser's lock room, exactly like the WEAP/SHLD/ENG buttons and E/Q do today. Firing stays on FIRE / Space. There is no auto-fire.
- **Presentation only.**
  - No sim change: `SIM_VERSION` stays 42 and the goldens don't change.
  - The aim goes through the existing lock command, `actions.console.lock(room)`, so it behaves the same in single player and online.
- **CRT style** for now. The window, the room drawing and the reticle use the CRT amber ramp (`CRT` in `render/tactical/crtTheme.ts`).

## 3. Opening and closing

**Shown.** The window is *shown* when all of these hold:
- the contact state is set (`contact !== null`, §6.1);
- the frame's console view is not null (`consoleHidden` false in `app/duel/scene.ts`);
- its station is `'helm'` or `'weapons'`.

Every rule below that takes a key or a click applies only while the window is shown.

**Opening.**
- **Map click.** On the Helm or Weapons console (console view not null, station `'helm'` or `'weapons'`), a left-click on an enemy ship on the tactical map opens the window for that ship. A left-click on a different enemy ship while the window is open switches it to that ship.
- **`T` key.** On the same consoles, `T` toggles the window for the crew ship's laser target slot, `state.systems[CREW_SLOT].target`. This helps when the enemy is small or off screen. `T` is unused today.
- **Hit test.** `pickShip` (§6.2) considers only slots other than `CREW_SLOT` whose ship is active. The ship's screen centre comes from the same interpolated position and camera the map draws with. The hit radius in internal px is `max(16, 2 * SHIP_RADIUS * z, 1.9 * SHIP_RADIUS * drawnScale(z))`, where `z` is the camera zoom. This matches the map's cull radius (`tacticalModel.ts` ships loop) converted to screen px, with a 16 px floor. The nearest hit wins; a click with no hit does nothing.

**Closing.** The window closes, which also disarms the aim, on any of these:
- its ✕ button;
- `T` again;
- a left-click on the shown ship on the map;
- `Esc` when no aim is armed (an armed aim takes the first `Esc`, §5);
- the shown ship becoming inactive;
- the console becoming null, or its station becoming `'ship'`. That covers a pause of any kind (user, blur, suspend, the partner's pause online), any banner, the end card, a decided round, and the SHIP tab;
- a new round (the scene's epoch change).

So a window can never be open while hidden: once it's hidden, the contact state is cleared on the same frame.

**`Esc` and the pause.** `Esc` is the duel's pause key: `PRESS_CODES.Escape` is `'pause'` in `app/duel/input.ts`, and `onlineDuel.ts` also reads it for its leave prompt.
- While the window is shown, `Esc` and `T` are taken by the window. They produce no `pause` edge and nothing else counts them, online included.
- While it isn't shown, they reach the duel exactly as today, so `Esc` pauses, resumes, or answers the leave prompt.
- Because the state clears whenever the console is hidden, a paused duel always gets its `Esc`.

**Station change.** In single player, Tab switches between Helm and Weapons. Any station change disarms the aim and keeps the window open, now as the other station's version. This uses the same station-change edge as `consoleChange` in `duelMode.ts`.

**The game keeps running.** The window isn't modal. The map, the other keys and the console buttons keep working.

**Local to each player.** The contact state belongs to each player's screen and is never sent over the network.

## 4. The window

### 4.1 Placement

A new export `CONTACT` in `render/duel/consoleLayout.ts`, in internal px:
- `w = 300`, `h = 360`;
- `x = INTERNAL_W - EDGE - 300`, which is 968;
- `y = SIDE.y + SIDE_H + EDGE`, which is 150. `SIDE_H = 96` is the side column panel's height, exported beside `SIDE`.

So the window sits at the right edge of the screen, directly below the side column, and ends at y 510.

While the window is shown, the scene passes `reserveRight = INTERNAL_W - CONTACT.x + EDGE` (324) to the map instead of `CONSOLE_RESERVE.right`. The off-screen arrows and the top info line then keep clear of it.

The layout test checks that `CONTACT` overlaps none of these:
- `TABS`, `STATUS`, the station block at both heights (`STATION`, `stationTop`) and `SIDE` (`y` to `y + SIDE_H`);
- the console scale bar row (y ≥ `INTERNAL_H - 40`);
- the info line row (y < 30);
- the screen centre ± 80 px. 80 px is more than the crew hull's drawn radius at `ZOOM_MAX` 1.2.

### 4.2 Contents, top to bottom

1. **Title row:** `ENEMY SHIP` (the contact kind), the ✕ button at the right.
2. **Status row:**
   - shield pips (filled = layers up, out of the class's layers);
   - a `HULL` bar with the hull value, in the status table's bar style.
3. **Ship drawing,** in a 276 × 200 box under the status row:
   - **Outline.** The enemy's hull outline, `HULLS[hullFor(false)]` (the drone scout), scaled uniformly to fit the box with 8 px padding, nose pointing right (+x). Ship unit f maps to +x and s to +y.
   - **Rooms.** Each of the three rooms is its polygon in the same space. Each carries:
     - a label at `roomCentre`: `WEAP`, `SHLD` or `ENG`;
     - its damage look. The fill, stroke and hatch come from the shared `roomLook` (§6.3) for the enemy, its level and the frame's blink phase.
   - **Lock mark.** The crew laser's lock room (`state.systems[CREW_SLOT].lock`) carries a reticle mark at its centre, but only while the shown ship is the crew's laser target slot. It moves on the frame the lock changes, whether from the window, the buttons or E/Q.
4. **Weapon list (Weapons station only):**
   - **`LASER`:** the same charge `label`/`value`/bar as the station block. It is a button.
   - **`MISSILE`:** `MAG n` and `STEER A/D`, greyed, not a button.
   - **Wrong ship.** If the shown ship isn't the crew's laser target slot, LASER is disabled and the row reads `NOT TARGETED`. Today's duel has one enemy, so this only shows in tests.

The **Helm** sees items 1 to 3. It gets no weapon list, no reticle, and no room highlight, and room clicks do nothing.

## 5. Aiming

1. **Arm.** Clicking LASER (Weapons only, enabled) arms the aim; LASER shows lit.
2. **Reticle.** While the aim is armed and the pointer is over the ship drawing box, the drawing box has `cursor: none` and the window draws an amber reticle at the pointer. The reticle is a CRT `hot` ring, 20 internal px across, with four ticks. Elsewhere the normal cursor shows.
3. **Hover.** The room under the pointer, by `pointInPolygon` on its window-space polygon, gets a `hot` stroke. The window computes the hover itself (React component state) from the room polygons in the view. It is not part of the contact state or the model input.
4. **Pick.**
   - A left-click on a room calls `actions.contact.pick(room)`: the controller calls the console lock (the same path as `actions.console.lock(room)`) and disarms. The window stays open.
   - A left-click inside the box but on no room does nothing; the aim stays armed.
5. **Cancel.** These disarm without changing the lock:
   - a right-click on the window;
   - `Esc`;
   - clicking LASER again;
   - closing the window;
   - a station change.

   A right-click on the map doesn't cancel; it keeps its camera drag.

The WEAP/SHLD/ENG buttons, E/Q and the map's lock marker are unchanged and stay in step with the window, because they all read and write the same lock.

## 6. Architecture

### 6.1 Contact controller (new, `app/duel/contactController.ts`, pure)

`createContactController()` holds the state `{ ship: number; aim: boolean } | null`. It has these methods:

| Method | Effect |
|---|---|
| `state()` | Returns the current state. |
| `click(slot: number \| null)` | A map click: open, switch, or close (same slot). `null` does nothing. |
| `toggle(targetSlot: number)` | `T`: open on the target slot, or close. |
| `close()` | Closes the window. |
| `arm()` | Toggles the aim. |
| `cancelAim()` | Disarms the aim. |
| `escape(): boolean` | Disarms if armed, else closes; returns true. Returns false when there is nothing to take. |
| `sync({ shown: boolean; station: ConsoleStation \| null; target: number; active: (slot: number) => boolean; epoch: number })` | Applies the closing rules of §3 once per frame: clears when not shown, the ship is inactive or the epoch changed, and disarms on a station change. It records `shown`, `station` and `target` for the key intercept. |
| `pick(room: number, lock: (room: number) => void)` | Calls `lock(room)` and disarms. It only acts while the aim is armed. |

There is one controller per duel mode (single player and online). It is created beside the keyboard and handed to the scene and the UI actions, the same way the keyboard's `ui` is handed over through `setConsole` today. It is local, never sent and never in the sim.

### 6.2 Inputs

- **Keys.** `createDuelKeyboard(target, opts?)` gains `opts.intercept?: (code: string) => boolean`. On a non-repeat keydown, it calls `intercept(e.code)` before `PRESS_CODES`. When that returns true, the key adds no press edge and isn't added to the held set. The keydown's default is still prevented if `PREVENT` lists it.

  Both modes pass an intercept that reads what `sync` recorded on the last drawn frame: `shown`, `station`, and `target` (`state.systems[CREW_SLOT].target`).
  - `Escape` is taken only while shown: it calls `escape()` and returns true.
  - `KeyT` is taken while shown, calling `close()`, or while the last frame's station was `'helm'` or `'weapons'`, calling `toggle(target)`. Either way it returns true.
  - Every other code, and `KeyT` on a hidden or SHIP console, returns false.

  The online duel uses the same keyboard, so the leave prompt and `setPaused` see no `Esc` while the window is shown, and are unchanged otherwise.
- **Map clicks.** The pointer source (`createPointerSource`) gains `takeClick(): { x: number; y: number } | null`. It returns the last button-0 pointerdown on the canvas, in internal px, and clears it; `clear()` also clears it. It is separate from `sample()`, so the runtime's camera sampling is unchanged.
  - The scene's `draw` gets the click through a new optional scene option, `takeClick?: () => { x: number; y: number } | null`.
  - Online, the mode passes a function that drains and drops the click while unfocused or blocked.
  - On a map view with the console shown at Helm or Weapons, the scene runs `pickShip(input, click)` and calls `contact.click(slot)`. It does this on the frame's state, `prev`, `alpha`, camera and viewport, before building the contact view.
  - React overlays with `pointer-events: auto` (the console buttons and the window) stop the pointerdown reaching the canvas, so a click on them is never a map click.
- **`pickShip`.** A new pure function in `render/tactical/tacticalModel.ts`: `pickShip(input: TacticalModelInput, p: { x: number; y: number }): number | null`. It applies the hit rule of §3.

### 6.3 Shared room look (new export, refactor)

The damage table inside `tacticalLayer.ts`'s `drawShip` moves into a pure export in `render/tactical/crtTheme.ts`:

`roomLook(crew: boolean, level: 0 | 1 | 2, phase: 0 | 1): { fill: number | null; stroke: number; hatch: number | null }`

`drawShip` calls it. The map's pixels are unchanged, and the existing `crtColours` and layer tests cover that. The window uses the same function.

### 6.4 Contact model (new, `render/duel/contactModel.ts`, pure)

`contactModel({ state, ship, aim, station, t, weapons })` returns a `ContactView` or null (null when `ship` is inactive). The fields:
- `title`;
- `shields: { up: number; of: number }`;
- `hull: { value: number; fill: number }`;
- `box`: the drawing box in internal px;
- `outline: number[]` (flat window-space points);
- `rooms: { label: string; points: number[]; fill: number | null; stroke: number; hatch: { colour: number; segments: number[] } | null }[]`. `hatch` is null when `roomLook` gives no hatch. Otherwise its colour is `roomLook`'s hatch colour, and its segments are flat endpoints from `hatchSegments` on the window-space polygon;
- `lockRoom: number | null`;
- `weapons: null | { laser: { label: string; value: string; fill: number; lit: boolean; enabled: boolean; note: string | null }; missile: { magazine: number } }`;
- `aim: boolean`.

`t` is the same `performance.now() / 1000` the scene passes to `layer.draw`, so the window's blinks match the map's frame for frame. React only draws the resolved colours and does no blinking of its own. `weapons` is the existing station block's `WeaponsPanel` charge, reused for the LASER row.

### 6.5 Scene and view

- `DuelUiView` gains `contact?: ContactView | null`.
- Each frame the scene, in this order:
  1. Computes `hidden` (`consoleHidden`) and the console station. The station comes from the seat (`consoleModel`'s station logic) and doesn't depend on the tactical model or its overlay.
  2. Takes the click and runs `pickShip` on the frame's state, `prev`, `alpha`, camera and viewport (`pickShip` reads no reserves). Then calls `controller.click(slot)` when the station is Helm or Weapons and the console isn't hidden.
  3. Runs `controller.sync(...)`, which decides `shown`.
  4. Builds the tactical input, with `reserveRight` 324 when shown and `CONSOLE_RESERVE.right` otherwise.
  5. Runs `tacticalModel`, `consoleModel` and, when shown, `contactModel`.
  6. Writes the frame through `options.ui.frame`, with `contact` set.
- The scene gets the controller as a new optional option `contact?: ContactController`. Without it, nothing changes, which keeps `?mode=duel` and the tests' scenes as they are.

### 6.6 UI

- `actions` gains `contact: { close(); arm(); cancelAim(); pick(room) }`, forwarding to the controller set with `setContact(controller | null)`. It's a no-op while none is set, like `setConsole`.
- `ui/duel/ContactWindow.tsx` (new) draws `ContactView` at `CONTACT`. It uses `Panel`, `PixelText`, `Bar` and `Button` for the rows. The outline, rooms, hatch, lock mark and reticle are an inline SVG in internal px inside `CrtGlow`, so they get the same CRT glow and scanlines as the other console overlays.
- The window root sets `pointer-events: auto`, prevents `contextmenu`, `mousedown` and `auxclick` as `Button` does, and swallows `wheel`. A click on the window never reaches the map, and zooming over the window does nothing.
- `DuelUi` renders it after the station blocks, when `duel.contact` is set.

## 7. Errors and edge cases

- The shown ship is destroyed or inactive: the window closes on the next frame (`sync`).
- Pause, blur, the partner's pause, a banner, the end card, a decided round, the SHIP tab, or a new round: the window closes on that frame (`sync`). `Esc` then pauses or resumes as today.
- The lock is changed elsewhere while the aim is armed: the mark follows, and the aim stays armed.
- The crew laser is offline (its Weapons room is damaged): LASER can still be armed and a room picked. The lock is a target choice, not a shot, as with the buttons today.
- Resize or letterbox: hit tests use internal px, through the existing `toInternal` mapping and the SVG's internal-px coordinates.
- The window covers part of the map, so an enemy under the window can't be clicked there. `T` still works.

## 8. Testing

- **`tests/contactController.test.ts`:**
  - click opens, switches and closes;
  - `toggle`;
  - `escape` disarms, then closes, then returns false;
  - `sync` clears on not-shown, an inactive ship and a new epoch, and disarms on a station change;
  - `pick` calls `lock` only while armed;
  - the intercept takes `KeyT` on a Helm or Weapons station and declines it on a hidden or SHIP console.
- **`tests/contactModel.test.ts`:**
  - rooms and the outline lie inside `box`;
  - room looks (fill, stroke and hatch colour) equal `roomLook(false, level, phase)` for levels 0/1/2 at `t` values in both blink phases;
  - the lock room appears only when the shown ship is the target slot;
  - Helm gets `weapons: null`;
  - a non-target ship gets LASER disabled with `NOT TARGETED`;
  - null for an inactive ship.
- **`tests/tacticalModel.test.ts`:** `pickShip` hits inside the radius at zooms 0.2, 0.5 and 1.2 (including the 16 px floor) and misses outside it, skips the crew slot and inactive slots, and picks the nearest of two.
- **`tests/crtColours.test.ts`:** `roomLook` reproduces the existing table for both crew and enemy, all levels and both phases.
- **`tests/input.test.ts`** (or the existing input test file):
  - an intercepted `Escape` gives no `pause` edge;
  - a declined intercept gives one;
  - `takeClick` returns the last button-0 down once, and ignores buttons 1 and 2.
- **Scene test:** a click sample over the enemy, with the console at Weapons, opens the contact view; with the console hidden it doesn't. The contact view is null after a pause.
- **Online test** (`onlineDuel`'s existing harness): with the window shown, `Esc` sends no `setPaused` and doesn't open the leave prompt; with it closed, it behaves as today.
- **Component test `tests/contactWindow.test.tsx`:**
  - LASER calls `arm`;
  - a click inside the SHLD polygon while armed calls `pick(1)`;
  - a right-click calls `cancelAim`;
  - ✕ calls `close`;
  - Helm renders no weapon list and room clicks call nothing.
- **Layout test:** `CONTACT` against the list in §4.1.
- **Unchanged:** `SIM_VERSION` 42 and the goldens.
- **Screenshots** (`.art/shots` harness):
  - Weapons with the window open: idle, aim armed over a room, and after a pick;
  - Helm with the window open;
  - both blink phases with a damaged room.

  Add the owner look check to `docs/gates.md`.

## 9. Out of scope

- Missile room targeting.
- Auto-fire.
- Scanning and other contact kinds (later Science work).
- A non-CRT look.
- Changing the map's own lock marker.
