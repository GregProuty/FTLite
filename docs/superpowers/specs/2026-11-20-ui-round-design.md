# UI round: simplify the screen, fill the window, shields that read

Date: 2026-11-20. Status: design approved in brainstorming (owner), spec written; plans not started.
Source: the owner's playtest list of 2026-11-19 ("Juarez, 9:28 PM") plus "fix aspect ratio" and "a small fps counter".
The brainstorm that began 2026-11-19 (session 5a470033) died in the overnight restart; this one resumed it.

## 0. The rule for the whole round

**Each view shows only what matters to that view or mini-game.** Anything else is removed or moved to the one view where
it matters. Two things are constant in every view: the ship's hull/shield HUD (top left) and the power strip (bottom left).

Out of scope here: the asteroid colours and crack look ("asteroids more background, no bright colours"). Another session
is doing that on `asteroids-look`. This round takes only the "no targeting" half of that item (§1.4).

## Build order and base

Three parts, each with its own plan, branch, review and merge, in this order:

1. **Part 1, quick fixes** (§1): sim changes plus small UI fixes. Bumps SIM_VERSION by one.
2. **Part 2, layout** (§2): filling the window, removing the info box and zoom box, a HUD in every view. Drawing and layout only; SIM unchanged.
3. **Part 3, look** (§3): shields, enemy shots in ship view, the two FTL ship windows. Drawing and art only; SIM unchanged.

Base: master **after Helm round 2 merges** (it is built at SIM 64 and touches the Helm terminal and Settings). The plans
are written once it has merged. W-4 (which the owner first chose to stack on) is already on master.

## 1. Part 1: quick fixes

### 1.1 Hunter hull 123 → 95
`HUNTER_HULL` in `src/renderer/src/sim/tactical/tuning.ts` goes 123 → 95 (−23%). The crew ships are unchanged.

### 1.2 Valkyrn faster
- **Correction (planning, 2026-11-20):** the brainstorm's "shared top speed of 400" was wrong. `MAX_SPEED = 400` only
  caps a ship flying with drag 0, and since Helm round 2 no game ship does (`tuning.ts` says so). Every game ship's top
  speed is its thrust over its drag: Hound and Hunter 120 / 0.15 = 800 u/s, Valkyrn 160 / 0.15 ≈ 1067 u/s. A 520 cap
  would have made the Valkyrn slower. So no per-class cap.
- `VALKYRN_THRUST` 160 → **200** u/s². That raises the Valkyrn's acceleration and its top speed by 25% (top ≈ 1333 u/s);
  the Hound and the Hunter stay at 800. The turn rate is unchanged (200°/s). `MAX_SPEED` is not touched.
- Asteroid speed (`ROCK_MAX_SPEED`) is not touched.

### 1.3 Grid off by default
`MapGridSetting` (`render/tactical/mapGrid.ts`) gains `'off'`, which draws no grid lines (the sector letters and the scale
bar stay). `DEFAULT_MAP_GRID` becomes `'off'`. Settings shows Off / Gravity well / Square. Every saved record holds a
grid value (the old default was written on the first save), so the settings record goes to **version 3**: a version 2
record keeps every field but its grid, which reads `'off'`; a version 3 record keeps its grid. A grid picked after this
change is kept.

### 1.4 No torpedo range ring, no rock targeting
- Remove the torpedo's dashed range circle about the crew ship (`tacticalLayer.ts`, "Weapons update spec §2" block).
  "IN RANGE / OUT OF RANGE" stays on the torpedo card.
- Rocks are no longer weapon targets: a click on a rock does not set a laser or torpedo target, no rock hover mark, no
  rock brackets, no dashed torpedo ring on a rock. The "… A ROOM OR ROCK" hints become "… A ROOM", and the "ROCKS n"
  counter on the Weapons panel goes. Rocks still collide and still take hits from shots that fly into them; only aiming
  at them goes. This changes input handling, not the sim's rules. If the sim holds a rock-target command, it stays valid
  but the UI never sends it (no SIM change from this item alone).

### 1.5 Pause keeps the UI
- Pausing no longer hides anything: the terminal, the tab strip, the enemy window, the own ship window and the ship HUD
  stay drawn and frozen. `consoleHidden` (`app/duel/scene.ts`) stops treating a pause as a reason to hide. The ended
  round and the banners keep their current rules.
- The enemy window no longer closes for good on a pause (`contactController.ts`). It stays open while paused.
- While paused, the pointer still hovers (tooltips, highlights) so the owner can inspect. Gameplay presses stay dropped,
  as today.
- The pause text (`PAUSED   ESC: RESUME   F11: FULLSCREEN   M: MAIN MENU`, or online `PAUSED BY PLAYER n` /
  `PARTNER LOST`) draws as one line at **top centre**, at the native font size, on a small panel from y 66 to y 90. That
  is under the map's headline (y 12) and info line (y 44), and centred, so it clears the tab strip, the hull bar, the
  status table, the own ship window and the enemy window. Same place on every view, in the CRT style on terminals and in
  the interior colours in ship view.

### 1.6 F11 fullscreen in game
In the web build, F11 is caught by the page (keydown, `preventDefault`) and toggles the existing
`app/web/browserFullscreen.ts` Fullscreen API path, menu or game, so the Settings switch follows it and Esc reaches the
game where the keyboard lock works. If a browser keeps F11 for itself, its own fullscreen still happens. The Electron
build already toggles its window on F11 (`src/main/index.ts`) and is unchanged. Settings' browser note changes to say
F11 toggles fullscreen. The controls list already shows F11.

### 1.7 FPS counter
A small FPS readout in the **bottom-right corner** (`NN FPS`, right edge 8 px in, top at y 702, under the console scale
bar's label), in every view and the menus, above the menu layer: whole frames per second, averaged over the last half
second, at the native small font, dim. Settings gains "FPS counter" (on/off), **on** by default, saved
with the other settings.

### 1.8 Tests and gates
- SIM_VERSION +1; golden and oracle fixtures re-blessed with the reason recorded. The Hunter's hull and the Valkyrn's
  speed are pinned by unit tests (class table, clamp per class).
- Unit tests: grid `'off'` parses, defaults and draws no lines; no rock target from a click; `consoleHidden` false on a
  pause; the pause line's box does not intersect the HUD's or the tab strip's boxes; the FPS average.

## 2. Part 2: layout

### 2.1 Fill the window (aspect ratio)
Today the stage is a fixed 1280×720 (`src/shared/resolution.ts`), scaled in half steps, with bars on all four sides.

- The internal height stays **720** units. The internal width follows the window: `W = round(720 × windowW / windowH)`.
  For windows narrower than 16:9 the width stays 1280 and the height grows instead (`H = round(1280 × windowH /
  windowW)`). So the short side is always 720 or 1280 units and nothing gets smaller than today.
- Scaling becomes smooth (any factor), not half steps. Pixel text stays crisp by snapping each text box to whole device
  pixels.
- The map and the ship view show more space; their cameras use the real viewport, not 1280×720.
- Every panel is anchored to a corner or an edge (top-left, top-right, bottom-left, bottom-right, top-centre,
  bottom-centre) with its current margins, not to a 1280×720 position. `consoleLayout.ts`'s fixed rects become functions
  of the viewport. `INTERNAL_W` / `INTERNAL_H` stay as the 16:9 reference and the minimum, not the stage size.
- The main menu, Settings and the end card centre in the viewport.
- Window resizes re-lay out live.

### 2.2 Remove the info box
The readout panel (`ui/duel/ReadoutPanel.tsx`, rows from `render/duel/readoutModel.ts`) is removed from every view. Its
rows move as follows:

| Row | Goes to |
|---|---|
| Own HULL / SHIELD | The constant hull/shield HUD, top left, every view (§2.4) |
| Own WEAPONS / SHIELDS / ENGINES (OK, damaged, FIRE, repair bar) | The matching power strip column, every view (§2.4) |
| Enemy HULL / SHIELD / ROOMS | The enemy ship window only (Weapons, Science), which already draws the rooms |
| LASER lock / CHARGE / MAG | Removed (the Weapons cards show them) |
| Own HEALTH | A small bar under the hull HUD, **only when hurt or downed** |
| P2..P4 AWAY / DOWNED | Ship view only: a small tag on that crew member |
| HELM / WEAPONS EMPTY, COASTING | Ship view only: the empty console's icon blinks |
| ENEMY range / BEARING | Helm only, beside the map's enemy marker |
| TORPEDO INBOUND | A banner in every view |
| Help lines | Removed from screen; they stay in Settings → Controls |

The flight mode's feel rows (Valkyrn flight) are not the info box and stay.

### 2.3 Remove the zoom box
The side column (`ui/duel/SideColumn.tsx`: ZOOM, −, value, +, CAMERA/SNAP) is removed, along with any "ZOOM 0.50" text
and the zoom help lines. The mouse wheel and the −/= keys still zoom the map. C still snaps the camera back. Sitting down
still frames the fight automatically. The ship interior keeps its wheel zoom and drag pan.

### 2.4 One HUD in every view
The ship view's HUD (`ui/duel/ShipHud.tsx`): the segmented hull bar and shields top left, the power strip bottom left.
It now draws on every terminal too, in the CRT amber there and the interior colours in ship view, in the same place.
On terminals it replaces the status table and the separate `PowerStrip`. Room state moves onto the strip's system
columns: damaged levels shown on the column, FIRE as a blinking inverse label, the repair or extinguish progress as the
column's bar. Clicks on the strip work on every view, as they do in ship view today. Terminal panels that sat where the
HUD now goes shift to clear it, and the own ship window moves below the HUD.

### 2.4a Terminal layout at 1280×720 (decided at planning, 2026-11-20)
Part 2 is built in two plans: **2a** (§2.2-§2.4, this layout) and **2b** (§2.1, filling the window). 2a keeps the fixed
1280×720 stage. 2b then turns every rect below into an anchor.
- **The HUD** stays where the ship view has it: hull bar and shields top left (x 12-330, y 46-114), a health row under
  them when hurt or downed (y 124-150: HEALTH and a bar, or DOWNED blinking), and the power panel bottom left (x 6-334, y 529-712 with its REACTOR line).
- **The station blocks** (Helm, Weapons, Science) and the Valkyrn's Flight block move to the right of the power panel,
  bottom aligned: `STATION.x = 346` (Helm 346-646; Flight beside it at 658-958). The Flight block already sat there.
- **The own ship window** moves under the HUD: x 12, y 160, 240×170 (to y 330).
- **The enemy window** moves up to the top-right corner (y 42), where the zoom box was: x 968-1268, y 42-462.
- **The map's top band** (status sentence, info line) runs from the tab strip to the enemy window's left edge (408-968).
- **The sit card** draws at the top (y 100, or 156 under the online notice), centred on the top band (x 688), clamped left so a wide card ends 8 px before the enemy window.
- **The map's reserves:** left 264 (the own ship window's right edge + 12), right 12, or the enemy window's 324 while
  it shows.
- **The console strip** (the WEAP / ENG / SENS POWER strip) goes: the HUD's power panel shows every system. Science's
  sensor range moves onto the Science block (`SENSOR RANGE n`).
- **C: SNAP BACK** shows at native size left of the scale bar (bottom right) while the camera is free, on the consoles
  too, since the zoom box that lit its SNAP button is gone. The `ZOOM 0.50` text goes everywhere.
- **Room state on the power columns** (WEAP, SHLD, ENG, the three tactical rooms): a damaged room's column name turns
  hot, an offline room's name sits on an inverse block, a burning room's name blinks inverse, and the repair or
  extinguish progress is a 2 px bar under the name.
- **Helm range and bearing:** the Helm map gets the Weapons map's info line (`BRG 074  RNG 728`, no TORP) at y 44, or
  `NO CONTACT IN SENSOR RANGE`. That is "beside the marker" made consistent with Weapons. The off-screen arrow already
  carries the range.
- **Ship view only:** `TORPEDO INBOUND` (the old readout's rule: the enemy torpedo within 600) blinks hot at top centre
  (centred on y 106, FONT_SIZE: between the pause line and the notice). An AWAY player gets an `AWAY` label under their character, the way DOWNED does. An empty Helm or
  Weapons console's badge blinks WARN.

### 2.5 Tests and gates
- Layout unit tests: for viewports of 16:9, 21:9, 32:9, 4:3 and 16:10, no two panels overlap, every panel is inside the
  viewport, and the anchors hold their margins.
- The readout model and the side column are deleted with their tests. New tests cover where each moved row now appears.
- Screenshots at 1280×720, 2560×1080 and 1024×768 window sizes, of every terminal and the ship view, go to
  `FTLite-shots/ui-round/` for the owner's look gate.

## 3. Part 3: look

### 3.1 Shields in the HUD
The shield pips become a **shield bar**: one segment per layer. A raised layer is lit. The recharging layer fills from
left to right with its real progress. A layer flashes when it is hit and goes dark when it drops. Same in the CRT amber
on terminals.

### 3.2 The hex shimmer (owner 2026-11-20)
One shield look, used by the ship view and both FTL ship windows:
- **At rest:** a faint bubble (a thin ellipse about the hull), brighter with more layers; gone when no layer is up.
- **On a hit stopped by the shield:** a patch of **hexagon cells** lights at the impact point and shimmers outward a few
  cells, each ring later and dimmer, fading out in about **0.5 s**.
- **On a hit that drops a layer:** the same patch, then the whole bubble's hex grid flickers once.
- **When the last layer drops:** the grid flickers and the bubble goes out.

The hex grid is clipped to the ellipse. Cells near the edge stay brighter, so it reads as a curved surface. Ship view
uses the shield colour; the FTL windows use the CRT amber ramp. It is drawing only: each hit position and time comes
from the existing view events.

### 3.3 Enemy shots in ship view
Enemy fire (laser bolts, pew rounds, torpedoes) is drawn in the ship view. Each shot flies in from the screen edge on
its real bearing toward where it lands. Stopped by the shield, it bursts on the bubble (with §3.2's shimmer). Through
the shield, it flies on to the room it hits, with a flash, a short shake (respecting the shake setting) and the room's
damage. Torpedoes get a short trail. All of it comes from the existing view events and the hit model; no sim change.

### 3.4 Enemy ship window: a real Hunter in amber
- A new **original Hunter** is rendered in Blender through `tools/sprite-render` (the crew3D pipeline): top down, a
  hull matching its three rooms (weapons, shields, engines). It must not copy any existing game's ship.
- In the window it draws in the **amber CRT style**: the render becomes the amber ramp (luminance to ramp, plus the
  scanlines and glow the CRT layer already gives).
- On top: the room outlines, the targeting marks (laser brackets, torpedo diamond), the hover stroke, and the §3.2
  shield bubble. Scanning reveals it as today: an unscanned contact shows a dim silhouette with `?` rooms.
- The window's info lines lose anything the window already shows (the enemy hull and shield rows from §2.2 live here
  as one hull bar and one shield bar under the picture).
- The art is credited as original in the asset manifest. The owner's look gate covers it.

### 3.5 Own ship window: the painted ship in amber
The own ship window draws the painted Hound or Valkyrn (`public/assets/paid/2mt/*.png`, already licensed) in the same
amber treatment, with room damage, fire and crew dots on top and the §3.2 bubble. It shows on terminals only (the ship
view already is the ship).

### 3.6 Tests and gates
- Unit tests: the shimmer's cell timing and fade, the bubble brightness per layer, the shot path from bearing to
  landing point, the amber ramp mapping.
- Screenshots of a stopped hit, a layer drop, a hull hit, and both windows scanned and unscanned go to
  `FTLite-shots/ui-round/`. The owner's look gate decides on the Hunter render and the shimmer.

## 4. Decisions log (owner, 2026-11-19 / 2026-11-20)

- Base: build after the in-flight work (first W-4, now Helm round 2), not beside it.
- "Get rid of the zoom" means the zoom box only; the wheel stays.
- The info box goes; its rows move per the table in §2.2 (option A).
- Pause: a text line in a clear spot, never hiding the UI, so the owner can pause to examine it (option B).
- Aspect ratio: fill the window and show more of the game (option A).
- FPS counter added, bottom right.
- Hunter hull 95; Valkyrn thrust 200 (option A; its "top speed 520" was dropped at planning, see §1.2).
- FTL ship windows: real ship art, kept in the amber CRT style.
- Hunter art: a new original Blender render (option A).
- Shields: a hexagonal shimmer on hit.
