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

  `src/main/index.ts` appends `?mode=<value>` to the page URL when the environment variable `FTLITE_MODE` is set (dev `loadURL` and packaged `loadFile` alike). `package.json` gains a `dev:flight` script (H-1a) and a `dev:duel` script (H-1b). Each runs `tsx scripts/dev-mode.ts <mode>`, which sets the variable and starts `electron-vite dev`, because an npm script cannot set an environment variable portably on Windows without adding a dependency **(rec.)**. A title-screen choice comes later, with the networked demo.
- **One mode per launch** **(rec.)**: the duel modes do not create the sector session at all, so nothing in today's game changes. Both duel modes reuse `createRenderer`'s Pixi application, stage and letterbox, but hide its sector children (world, enemy window, projectiles, callouts, HUD) and add their own scene container.
- **Seed**: `?seed=<n>` overrides the default (2026); restarting after a duel ends uses seed + 1 **(rec.)**.

## 4. The local duel runtime (`app/duel/runtime.ts`)

Until H-0c-ii puts the duel behind the authority, the renderer steps the duel itself **(rec.)**. This is the one deliberate departure from parent §11a, which says solo runs over loopback; H-0c-ii replaces the runtime's stepping with the loopback authority and keeps everything above it.

- **Clock:** a `createTickDriver` with `performance.now()` and a `setTimeout` scheduler, as the sector session uses. Each tick builds the `DuelInput` from the input layer (§5) and calls `stepDuelTick`. The flight mode calls the single-ship step of §9 instead.
- **Tick numbers:** commands carry `requestedTick = d.interior.tick` (the duel's own tick, which `stepDuelTick` checks), never the driver's tick count. The driver only paces the steps.
- **Solo start** **(rec.)**: the owner starts as player 0 at the Helm. Player 1 starts *away*. On the very first tick of every duel (including after a restart), the runtime adds `presence {present: false}` for player 1 ahead of any other command, so the gunner's console counts as empty until the first Tab. This is replayable: it is an ordinary command in tick 0's input.
- **Interpolation:** the runtime keeps the previous tick's positions of both ships and any missiles, and the crew positions (the interior already interpolates with `RenderMemory`). The views draw at `alpha = (now − lastTickTime) · 60 / 1000`, clamped to 0..1, as the sector `localRuntime` does.
- **Pause** **(rec.)**: the runtime keeps a set of pause reasons: `user`, `blur`, `hidden` and `suspend`. The driver runs only while the set is empty.
  - Escape toggles `user`, and a paused banner shows while `user` is set.
  - Window blur adds `blur`; focus removes only `blur`.
  - `visibilitychange` to hidden adds `hidden`; visible removes it.
  - System suspend adds `suspend`; resume removes it.

  So regaining focus never undoes an Escape pause. Pausing never sends presence. Presence is only Tab in solo (parent §11a).
- **End:** when `tactical.outcome` is not Running, the runtime stops stepping. The view shows "Victory", "Defeat" or "Both ships lost", the duel length, and "Enter: new duel (seed n+1)".
- **Restart** (Enter on the end screen) **(rec.)**: it starts a fresh duel from scratch.
  - Dispose the tick driver and the old duel (`disposeDuel`), create the new duel and a new driver, and apply the solo start rule above.
  - Reset every view-owned cache: both console cameras to their defaults, missile trails, queued effects and shakes, previous positions for interpolation, `RenderMemory`, and the interior view, which is destroyed and rebuilt (§8).
  - Clear the keyboard's held state and edge counters, and reset command sequences to 0.
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

A pure model (`tacticalModel.ts`) turns `(tactical state, previous positions, alpha, camera, console, current axes)` into draw lists. *Current axes* are the effective inputs the runtime last sent to the sim: the Helm's `{turn, thrust}` (zero when the Helm is empty) and the gunner's missile steering (zero when Weapons is empty). The runtime records them each tick when it builds the `DuelInput`, or the flight step's axes, and exposes them to the views. A thin Pixi layer (`tacticalLayer.ts`) draws them with `Graphics` and pooled `BitmapText`. It allocates no display objects per frame (tested as `render.test.ts` tests today's layers).

Draw order, as parent §10b:
1. **Background:** near-black space and a static seeded star field (render-only randomness) **(rec.)**.
2. **The lettered grid:** 500-unit squares covering ±3000 units (12 × 12: columns A to L from the west, rows 1 to 12 from the north). Zoomed in past 0.6, faint 250-unit lines are added inside the squares, but the **labels always name the 500-unit squares**, so a call-out ("they're in D4") means the same square at every zoom **(rec.)**. Labels sit at the visible top and left edges.
3. **Gravity contours:** rings at 40, 10 and 3 u/s². Their radii come from inverting `gravityAccel` numerically at startup (render code may use `Math.pow`; the determinism guard covers only sim, authority, net, clientControl and events).
4. **The map edge circle.**
5. **Bodies:** the planet as a shaded disc. Asteroids are rough polygons seeded by index. Below a minimum on-screen radius of 2 px they draw as a dot, or are skipped below 0.5 px.
6. **Ships:** the crew ship in cyan, the enemy in red **(rec.)**. Each is a wedge silhouette whose three room segments are tinted by damage level (0 none, 1 amber, 2 red), with shield rings (one per layer). Below 10 px across, a ship becomes a fixed-size chevron along its heading. Missiles are small triangles with fading trails (the last 30 interpolated positions, kept by the view).
7. **Console layers:**
   - **Helm:** the predicted path, from `predictPath` with the current Helm axes: 2 s at zoom ≥ 0.6, rising linearly to 8 s at zoom 0.12, sampled every 4 ticks. Also a velocity vector, a heading line, the thrust and turn indicators, and a bearing ring (0 to 359, north 0, ticks every 10°, labels every 30°) when zoom ≥ 0.3.
   - **Weapons:** the bearing ring, the own laser arc (±60°, range 450) filled faintly, and the enemy's arc dimmer. Also the bearing and range to the enemy, and in missile mode the missile's predicted path.
   - **Both consoles:** the lock marker on the enemy's locked room (parent §7a: "shown on the enemy ship on both screens").
   - **The missile-path predictor** (`render/tactical/missilePath.ts`, pure) **(rec.)**:
     - Inputs: a copy of the missile, its owner's map, and the current steering axis, assumed held constant.
     - Horizon: the missile's remaining life (`MISSILE_LIFE_TICKS − age`), capped at 240 ticks, with a point every 4 ticks.
     - It applies `flyMissile`'s rules exactly: turn at `MISSILE_TURN_STEPS_PER_TICK` by the sign of the steering, thrust while `age ≤ MISSILE_FUEL_TICKS`, gravity, no drag.
     - It stops, keeping the final point, at the first planet or asteroid contact, at the map edge, or at expiry. It ignores ships.
     - Test: for 120 ticks of free flight with a constant steering value, its per-tick positions (stride 1) equal `flyMissile`'s exactly; and it ends at the planet when aimed at it.
8. **Effects** from `events`: a laser shot draws a 0.15 s beam (white on a hit, grey on a miss) **(rec.)**. A missile ending draws a 0.3 s burst. **Contact sparks** (parent §12) come from a render-side detector, since the sim emits no contact events: each tick the runtime compares each ship's `planetHits`, `asteroidHits` and `shipHits` with the previous tick's values, and an increase draws a 0.3 s spark at that ship's position (orange for the planet, grey for an asteroid, white for the other ship) **(rec.)**.
9. **Screen-space overlay** (the console HUD): off-screen arrows (own ship, enemy, planet, missile) with distances; the zoom level; a scale bar; the "C: snap back" hint while panned. A side readout panel shows the crew ship's hull and the enemy's hull (parent §10b: "both hulls"), the crew ship's shield pips, its three room levels and repair progress, and the enemy's shield pips and room levels; at Weapons also the charge bar, hold timer and magazine. It also shows the other character as two rows **(rec.)**: present or away, and where (at Helm, at Weapons, walking, repairing). In solo the other character is always away, so position is what tells the player where they left them.

## 8. The interior view (`render/duel/interiorView.ts`)

When the active character stands, the screen shows the Cutter interior **(rec.)**. It is composed directly from today's interior layers: tiles, effects, room icons, consoles, crew, boarders (always empty in the duel). It leaves out the sector enemy window, projectiles, callouts and HUD.

- **Fit:** the ship is fitted into a band of the 1280×720 screen that leaves a 220-px readout column on the right **(rec.)**. Today's `worldFit` fits only the sector band, so the duel uses its own fit with the same rules: centred, never upscaled above 1×.
- **Damage overlay:** each repair point's room is tinted by its tactical room's damage level, with a marker on the repair tile, and a progress ring fills while someone repairs. The two role consoles are outlined: highlighted when free, dimmed when occupied by the other character.
- **Readout column:** the same ship readout as the consoles (hull, shields, rooms, repair), plus a strip that tells the player about the ship outside:
  - `HELM CREWED` or `HELM EMPTY`, with `COASTING` under it when empty;
  - `WEAPONS CREWED` or `WEAPONS EMPTY`;
  - `ENEMY` (distance) and `BEARING`;
  - `MISSILE INBOUND` when the enemy's missile is within 600.

  These labels are short so they fit the 220-px column at 2× m5x7 **(rec.)**. A console counts as crewed only when a present character sits at it, so in solo a console left by Tab shows as empty.
- **Shake** **(rec.)**: a hit on the crew ship (any enemy laser hit, including one that only strips a shield layer, or a missile landing on it) shakes the interior and the console views for 0.2 s, so a standing player feels the fight.

## 9. The dev flight view (`?mode=flight`)

One `TacticalState` from the seed. `stepFlight` advances both ships and resolves ship-to-ship contact, so the flight view uses a **single-ship step** **(rec.)**, added to the tactical sim as `stepSoloFlight(state, axes, tuning?)`. It runs `flyShip` on ship 0, then ship 0's static contacts only (planet and asteroids; `contacts.ts` exports its existing per-ship static pass for this), then advances the tick. Ship 1 is never stepped, never collides and is not drawn in the flight view. The keyboard drives ship 0's axes. The screen is the Helm map view with its overlay, and a **feel panel** in place of the combat readout: speed, sideways (skid) speed, turn rate, gravity at the ship, distance to the planet, and the last 10 s's minimum planet distance. These are the numbers parent §6's feel targets talk about. Tuning stays in `sim/tactical/tuning.ts`, changed by editing and restarting **(rec.)**. A live tuning panel can come later if the owner wants one.

## 10. Architecture and boundaries

- **New code** goes in `src/renderer/src/app/duel/` (runtime, input, mode boot) and `src/renderer/src/render/tactical/` and `render/duel/` (camera, models, layers, interior view, readouts). None of it is under the determinism-guarded roots. The guarded `sim/` code never imports it (the boundary test enforces this). **The one exception is in the sim itself:** §9's `stepSoloFlight` (new, in `sim/tactical/physics.ts`) and exporting `contacts.ts`'s existing per-ship static-contact pass. Both live under the guarded roots and follow their rules: deterministic arithmetic only, no imports from render, app or input.
- **Pure models and thin layers:** every new view has a pure `*Model.ts`, unit-tested in Vitest's node environment, and a Pixi layer that only draws the model. Display objects are created once and reused (pooled BitmapText, `Graphics.clear()` and redraw).
- **Allocation test** **(rec.)**: a test runs each new layer through a warm-up of 2 frames, then 60 steady-state frames, and asserts the display-object count does not change after warm-up. The reused interior layers (room icons, crew sprites) create their objects on their first draw, so the interior view counts as built after its warm-up. A restart destroys and rebuilds it (§4).
- **The runtime is testable headless:** it takes `now`, `scheduler`, `sampleKeys` and `samplePointer` as dependencies. Tests drive it with a fake clock and scripted keys: Tab switches presence, an E press sits, Space charges and fires, the duel ends and restarts.
- **`main.ts`** only reads the mode and calls `startSector(...)` (today's body, moved into a function) or `startDuelMode(...)`.

## 11. Milestones

| # | Part | Delivers |
|---|---|---|
| H-1a | **Flight** | Mode flag and `dev:flight`; the local runtime with the single-ship step (`stepSoloFlight`, §9); keyboard and pointer input; the camera; the tactical model and layer (grid, contours, edge, bodies, ship, Helm layer, overlay); the feel panel |
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
- 2026-11-14: refine round 1: solo start makes player 1 away on tick 0 (and on restart); commands use the duel's tick; restart recreates the driver and resets every cache; pause reasons; current axes as a model input; single-ship flight step; warm-up allocation rule; missile-path predictor contract; lock marker on both consoles and both hulls in the readout; contact sparks.
- 2026-11-14: refine round 2: §10 names the two tactical-sim changes (stepSoloFlight, exported static-contact pass) as the exception to new code living outside the guarded roots.
- 2026-11-14: from the H-1a prototype: §11 names `stepSoloFlight` (not `stepFlight`); grid labels always name the 500-unit squares; `dev:*` scripts run `scripts/dev-mode.ts`.
- 2026-11-15: from the H-1b prototype: short readout-strip labels that fit the 220-px column; the other character shown as presence plus position; a shield-only laser hit counts for the shake.
