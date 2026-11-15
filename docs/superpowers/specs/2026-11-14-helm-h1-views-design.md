# Helm Demo H-1: The Screens (design)

Status: written 2026-11-14 under the owner's standing order ("take the recommendation and continue"). Every choice marked **(rec.)** is Claude's; the owner can overturn any of them. Parent spec: `docs/superpowers/specs/2026-11-14-helm-demo-design.md` (§6 flight, §7 weapons, §8 interior, §10 console map views, §11a solo playtesting, §12 look, §15 milestones). Binding owner answers: `docs/vision/thesis-grill.md` Q11 to Q27; the grill and the parent spec win where this spec disagrees.

## 1. Goal

H-1 is the first time the owner can play the Helm demo. It delivers, on one computer:

1. **A dev flight view:** one ship around the planet, the follow camera and the Helm layer, to tune the flight feel against parent §6's feel targets.
2. **The solo duel:** the full duel against the hunter, where the owner owns both characters and switches between them with Tab (parent §11a). Seated at Navigation the screen is the Helm map view. Seated at Weapons it is the Weapons map view. Standing, it is the FTL-style interior of the Cutter (Q27).

It is not the networked demo (H-2) and does not wire the duel into the authority (H-0c-ii, waiting on Net-3).

## 2. What already exists (merged)

- `sim/tactical/`: the flight and combat sim. It provides `createTacticalState`, `stepFlight`, `stepDuel`, `predictPath`, per-tick `events`, `cloneTactical`.
- `sim/duel/`: `createDuel(layout, seed)`, `stepDuelTick(d, { held, commands })`, `disposeDuel`, the local `DuelEnvelope` commands (`sit`, `stand`, `presence`, `laserLock`, `laserCharge`, `missileLaunch`).
- The renderer:
  - `main.ts` boots one sector `createSession` and ticks it from the Pixi ticker.
  - `render/renderer.ts` owns the 1280×720 internal canvas with letterboxing.
  - The interior layers (`createTileLayer`, `createEffectsLayer`, `createIconLayer`, `createConsoleLayer`, `createCrewLayer`, `createBoarderLayer`) each draw a `SimState`.
  - Text is BitmapText in the `m5x7` font, panels come from `render/panel.ts`, colours from `render/theme.ts`.
- `authority/tickDriver.ts`: `createTickDriver(clock, scheduler, onTick)`, a wall-clock fixed-step accumulator at 60 Hz.
- `input/sources.ts`: keyboard clusters (`kb:0` = WASD + E/F/Q/R, `kb:1` = arrows + Enter/…), gamepads, and `SourceSample`. Nothing handles Tab or the mouse.

## 3. Entry and modes

- **Mode flag** **(rec.)**: `main.ts` reads `new URLSearchParams(location.search).get('mode')`:
  - `flight` starts the dev flight view;
  - `duel` starts the solo duel;
  - anything else (or none) starts today's sector game, unchanged.

  `src/main/index.ts` appends `?mode=<value>` to the page URL when the environment variable `FTLITE_MODE` is set (dev `loadURL` and packaged `loadFile` alike). `package.json` gains `dev:flight` and `dev:duel` scripts that set it. A title-screen choice comes later, with the networked demo.
- **One mode per launch** **(rec.)**: the duel modes do not create the sector session at all, so nothing in today's game changes. Both duel modes reuse `createRenderer`'s Pixi application, stage and letterbox, but hide its sector children (world, enemy window, projectiles, callouts, HUD) and add their own scene container.
- **Seed**: `?seed=<n>` overrides the default (2026); restarting after a duel ends uses seed + 1 **(rec.)**.

## 4. The local duel runtime (`app/duel/runtime.ts`)

Until H-0c-ii puts the duel behind the authority, the renderer steps the duel itself **(rec.)**. This is the one deliberate departure from parent §11a, which says solo runs over loopback; H-0c-ii replaces the runtime's stepping with the loopback authority and keeps everything above it.

- **Clock:** a `createTickDriver` with `performance.now()` and a `setTimeout` scheduler, as the sector session uses. Each tick builds the `DuelInput` from the input layer (§5) and calls `stepDuelTick`. The flight mode calls `stepFlight` instead.
- **Interpolation:** the runtime keeps the previous tick's positions of both ships and any missiles, and the crew positions (the interior already interpolates with `RenderMemory`). The views draw at `alpha = (now − lastTickTime) · 60 / 1000`, clamped to 0..1, as the sector `localRuntime` does.
- **Pause** **(rec.)**:
  - window blur, `visibilitychange` to hidden and system suspend pause the driver;
  - focus resumes it;
  - Escape toggles pause, with a paused banner.

  Pausing never sends presence. Presence is only Tab in solo (parent §11a).
- **End:** when `tactical.outcome` is not Running, the runtime stops stepping. The view shows "Victory", "Defeat" or "Both ships lost", the duel length, and "Enter: new duel (seed n+1)". Restart disposes the old duel (`disposeDuel`) and creates a new one.
- **Events:** each tick's `tactical.events` (laser shots, missile endings) are queued for the views to animate (§7, §8).

## 5. Input (`app/duel/input.ts`)

**Keyboard and mouse first** **(rec.)**, following the owner's KB+M direction; gamepad support is H-2. One keyboard drives the **active character** in the duel, or the one ship in the flight view.

| Key | Standing (interior) | At Navigation (Helm) | At Weapons |
|---|---|---|---|
| W / S | walk up / down | thrust forward / reverse | — |
| A / D | walk left / right | turn anticlockwise / clockwise | steer the missile in flight |
| E | press: sit at a free role console in reach (when no repair is in reach); hold: repair | — | press: next lock room |
| Q | — | — | press: previous lock room |
| Space | — | — | hold: charge the laser; release: fire (full) or discard (partial) |
| F | — | — | launch a missile |
| X | — | stand up | stand up |
| Tab | switch character | switch character | switch character |
| Escape | pause | pause | pause |
| C | — | snap the camera back to the ship | toggle the camera between ship and missile (parent §10a) |
| `−` / `=` and mouse wheel | — | zoom | zoom |
| right or middle drag | — | pan | pan |

- **Held input:** `moveX`/`moveY` come from WASD (the sector source's normalised vector; the sim quantises it by sign). `interactHeld` comes from E. The inactive character's held input is neutral.
- **Commands:** press edges become `DuelEnvelope`s for the active player, with a per-player sequence and `requestedTick` = the tick about to run:
  - E press while standing: `sit` at the role console in reach, if no repair target is in reach. Holding E repairs, so the gunner fixing their own Weapons room stands, then holds E.
  - X: `stand`.
  - Space down and up: `laserCharge {held: true}` and `{held: false}`.
  - F: `missileLaunch`.
  - E and Q at Weapons: `laserLock` to the next or previous Room (Weapons → Shields → Engines → Weapons).
- **Tab (solo, parent §11a):** switches the active player. The runtime sends `presence {present: false}` for the character left and `presence {present: true}` for the one taken, on the same tick. It clears that keyboard's held state, so nothing carries over. The left character stays where it is.
- **Browser behaviour:** the duel input calls `preventDefault` on Tab, Space, the arrow keys and Backspace, so Electron does not move focus or scroll. It also suppresses the context menu on right-drag.
- **Mouse:** a new small `pointer` source (canvas-relative position in internal pixels, wheel delta, and right or middle drag delta) feeds only the camera. Camera input never becomes a command (parent §10).

## 6. The camera (`render/tactical/camera.ts`, pure)

As parent §10a, made concrete:
- **State:** `{ centreX, centreY, zoom, targetZoom, follow: 'ship' | 'missile' | 'free' }`.
- **Zoom:** from 0.12 to 1.2 screen px per unit, starting at 0.5. The wheel and `−`/`=` step it by ×1.25 per notch, eased toward the target over 0.15 s. The wheel zooms about the cursor; keys zoom about the screen centre.
- **Following:** with `follow: 'ship'` (or `'missile'`) the centre is the interpolated position of the followed body. Dragging switches to `'free'` and moves the centre. C snaps back to `'ship'` over 0.2 s, or at Weapons toggles ship and missile while one flies. When the followed missile ends, the camera returns to the ship.
- **Transforms:** `worldToScreen` and `screenToWorld` are pure, so they are unit-tested. North is up.
- Each console keeps its own camera. A character returning to a console finds its camera as it was left (parent §10).

## 7. The console map views (`render/tactical/`)

A pure model (`tacticalModel.ts`) turns `(tactical state, previous positions, alpha, camera, console)` into draw lists. A thin Pixi layer (`tacticalLayer.ts`) draws them with `Graphics` and pooled `BitmapText`. It allocates no display objects per frame (tested as `render.test.ts` tests today's layers).

Draw order, as parent §10b:
1. **Background:** near-black space and a static seeded star field (render-only randomness) **(rec.)**.
2. **The lettered grid:** 500-unit squares, or 250 when zoomed in past 0.6. Columns are A, B, C… from the west edge of the map, rows 1, 2, 3… from the north. Labels sit at the visible top and left edges.
3. **Gravity contours:** rings at 40, 10 and 3 u/s². Their radii come from inverting `gravityAccel` numerically at startup (render code may use `Math.pow`; the determinism guard covers only sim, authority, net, clientControl and events).
4. **The map edge circle.**
5. **Bodies:** the planet as a shaded disc. Asteroids are rough polygons seeded by index. Below a minimum on-screen radius of 2 px they draw as a dot, or are skipped below 0.5 px.
6. **Ships:** the crew ship in cyan, the enemy in red **(rec.)**. Each is a wedge silhouette whose three room segments are tinted by damage level (0 none, 1 amber, 2 red), with shield rings (one per layer). Below 10 px across, a ship becomes a fixed-size chevron along its heading. Missiles are small triangles with fading trails (the last 30 interpolated positions, kept by the view).
7. **Console layers:**
   - **Helm:** the predicted path, from `predictPath` with the current axes: 2 s at zoom ≥ 0.6, rising linearly to 8 s at zoom 0.12, sampled every 4 ticks. Also a velocity vector, a heading line, the thrust and turn indicators, and a bearing ring (0 to 359, north 0, ticks every 10°, labels every 30°) when zoom ≥ 0.3.
   - **Weapons:** the bearing ring, the own laser arc (±60°, range 450) filled faintly, and the enemy's arc dimmer. Also the lock marker on the enemy's locked room, the bearing and range to the enemy, and in missile mode the missile's predicted path. That path comes from a pure missile-path predictor added to `render/tactical/`, which reimplements `flyMissile`'s thrust and gravity on a copy and is tested to match the sim tick for tick.
8. **Effects** from `events`: a laser shot draws a 0.15 s beam (white on a hit, grey on a miss) **(rec.)**. A missile ending draws a 0.3 s burst.
9. **Screen-space overlay** (the console HUD): off-screen arrows (own ship, enemy, planet, missile) with distances; the zoom level; a scale bar; the "C: snap back" hint while panned. A side readout panel shows hull, shield pips, the three room levels and repair progress; at Weapons also the charge bar, hold timer and magazine. It also shows the other character's status (at Helm, at Weapons, walking, repairing, away).

## 8. The interior view (`render/duel/interiorView.ts`)

When the active character stands, the screen shows the Cutter interior **(rec.)**. It is composed directly from today's interior layers: tiles, effects, room icons, consoles, crew, boarders (always empty in the duel). It leaves out the sector enemy window, projectiles, callouts and HUD.

- **Fit:** the ship is fitted into a band of the 1280×720 screen that leaves a 220-px readout column on the right **(rec.)**. Today's `worldFit` fits only the sector band, so the duel uses its own fit with the same rules: centred, never upscaled above 1×.
- **Damage overlay:** each repair point's room is tinted by its tactical room's damage level, with a marker on the repair tile, and a progress ring fills while someone repairs. The two role consoles are outlined: highlighted when free, dimmed when occupied by the other character.
- **Readout column:** the same ship readout as the consoles (hull, shields, rooms, repair), plus a strip that tells the player about the ship outside:
  - "Helm empty: coasting" or "Helm: other character";
  - "Weapons empty" or "Weapons: other character";
  - the enemy's distance and bearing;
  - "incoming missile" when the enemy's missile is within 600.
- **Shake** **(rec.)**: a hit on the crew ship (a laser hit or a missile landing) shakes the interior and the console views for 0.2 s, so a standing player feels the fight.

## 9. The dev flight view (`?mode=flight`)

One `TacticalState` from the seed, stepped with `stepFlight`. The keyboard drives ship 0's axes; ship 1 is moved out of play (parked at the map edge, unpowered) **(rec.)**. The screen is the Helm map view with its overlay, and a **feel panel** in place of the combat readout: speed, sideways (skid) speed, turn rate, gravity at the ship, distance to the planet, and the last 10 s's minimum planet distance. These are the numbers parent §6's feel targets talk about. Tuning stays in `sim/tactical/tuning.ts`, changed by editing and restarting **(rec.)**. A live tuning panel can come later if the owner wants one.

## 10. Architecture and boundaries

- **New code** goes in `src/renderer/src/app/duel/` (runtime, input, mode boot) and `src/renderer/src/render/tactical/` and `render/duel/` (camera, models, layers, interior view, readouts). None of it is under the determinism-guarded roots. The guarded `sim/` code never imports it (the boundary test enforces this).
- **Pure models and thin layers:** every view has a pure `*Model.ts`, unit-tested in Vitest's node environment, and a Pixi layer that only draws the model. Display objects are created once per layer and reused (pooled BitmapText, `Graphics.clear()` and redraw); a test runs each layer for 60 frames and asserts no display objects are created after construction.
- **The runtime is testable headless:** it takes `now`, `scheduler`, `sampleKeys` and `samplePointer` as dependencies. Tests drive it with a fake clock and scripted keys: Tab switches presence, an E press sits, Space charges and fires, the duel ends and restarts.
- **`main.ts`** only reads the mode and calls `startSector(...)` (today's body, moved into a function) or `startDuelMode(...)`.

## 11. Milestones

| # | Part | Delivers |
|---|---|---|
| H-1a | **Flight** | Mode flag and `dev:flight`; the local runtime with `stepFlight`; keyboard and pointer input; the camera; the tactical model and layer (grid, contours, edge, bodies, ship, Helm layer, overlay); the feel panel |
| H-1b | **Duel** | `dev:duel`; the runtime on `stepDuelTick`; duel commands and Tab presence; the Weapons layer and missile-path predictor; the interior view and readouts; event effects and shake; the end screen and restart |

Each part follows the standing order: plan, refine, build subagent-driven, refine the implementation, merge. H-1a goes first, so the owner can fly before the duel lands.

## 12. Acceptance

- **H-1a:** `npm run dev:flight` (and a production build with `FTLITE_MODE=flight`) opens the flight view. The ship turns, thrusts and coasts; stabilise kills a skid; it orbits and slingshots. The camera follows, zooms, pans and snaps back. The grid labels, contours, belt and gaps are visible. A scripted screenshot check (the visual-check method, outside the repo) confirms the view renders, and the unit tests cover the camera, the models and input mapping.
- **H-1b:** `npm run dev:duel` opens the duel at the Helm. Tab switches to the gunner. Space charges and fires; F launches and A/D steer a missile; X stands up into the interior; walking to a damaged room and holding E repairs it; E at the console sits again. The duel ends in victory or defeat and restarts. Headless runtime tests cover each of these through scripted keys, and screenshot checks confirm each screen renders.
- **Both:** the sector game is unchanged, with the full test suite passing and today's goldens untouched.

## 13. Risks

1. **Reusing the interior layers outside `createRenderer`.** They may assume the sector world band or read sector-only state. Mitigation: H-1b's first task renders a duel interior through them in a layer test before building on it.
2. **Allocation per frame in the tactical layer** (many asteroids and path points). Mitigation: draw lists sized once, `Graphics` reused, the no-allocation test.
3. **Text clutter at wide zoom.** Mitigation: labels and rings switch off by zoom thresholds (§7).
4. **Tab and Space stolen by the browser.** Mitigation: `preventDefault` in the duel input, tested with a fake event target.

## Change log

- 2026-11-14: written for H-1 under the standing order.
