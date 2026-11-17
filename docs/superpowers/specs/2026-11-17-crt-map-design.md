# CRT map: the console screens as an amber ship display

Date: 2026-11-17. Owner request: "change the tactical map to a CRT amber color ... basically i want it to look like you're looking at a display on the spaceship, i think it will be good for vibes/ immersion". References (owner, saved outside the repo): `C:\Users\djuar\FTLite-shots\refs\crt-amber-reference.webp` (amber-red phosphor, dot-matrix glyphs, bloom, curved glass, brown bezel), `crt-vt320-amber-terminal.webp` (crisp monospace, fine scanlines, double-line frame, solid amber bars with dark text, dim secondary text), `crt-amber-tv-glow.jpg` (visible phosphor dot grid, strong bloom, dark teal-grey glass, curved tube, worn bezel).

Process tier (grill Q31): views and feel, so one spec, one plan, a subagent build, one implementation review, and the owner's look as the gate. No sim, command, snapshot or authority change; SIM_VERSION and goldens do not move.

## Goal

When a player is at a console (the Helm map, the Weapons map, the flight view), the screen reads as a monochrome amber CRT on the ship: amber phosphor on dark glass, a soft glow, scanlines, a darkened edge and a bezel. Everything stays readable: friend and foe, damage, the lock, warnings, missiles, the arcs and the readout can still be told apart without hue.

## Non-goals

The interior (on foot) view, the menus and lobby, the end card, the latency overlay, the sector game's views, sound, any change to what the map shows or how it is controlled, a curved (barrel-distorted) screen.

## 1. Where it applies, and how React and Pixi know

- **Console views:** the duel's `helm` and `weapons` views (`DuelView` in `app/duel/runtime.ts`) and the flight view (`app/duel/flightMode.ts`). The duel's `interior` view keeps today's look. A switch between views switches the look at once.
- A pure `crtActive(view: DuelView | 'flight'): boolean` (true for helm, weapons, flight).
- **React:** `DuelUiView` and `FlightUiView` (`ui/views.ts`) gain `crt: boolean`; `app/duel/scene.ts` sets it to `crtActive(view)` each frame, `flightMode.ts` sets it to true; `duelProbeFixture` and other fixtures are updated. A `CrtContext` (provider in `DuelUi`/`FlightUi`) gives `{ crt, scale, now }` to `ReadoutPanel`, `Panel`, `Bar`, `Banners` and `MapOverlay`; with `crt` false they render exactly as today, and `theme.ts` is unchanged (the menu and HUD share it).
- **Pixi:** the tactical layer takes the amber palette and the CRT filter only in console views (the tactical layer is drawn only there).

## 2. The amber palette and how meaning survives

A new pure module `render/tactical/crtTheme.ts` holds one phosphor ramp: `glass` #0c0e0b (dark teal-grey tube), `faint` #2a1a08, `dim` #7a4a10, `mid` #c47a12, `main` #ffae1a, `hot` #ffd36b; plus the roles below. In console views every colour drawn by the tactical layer (`tacticalLayer.ts`, `fxModel.ts`, `shipColours.ts`, inline literals included) and the console overlays is one of these six.

**Map roles** (every current constant and literal mapped):
- space `glass`; grid `faint`; contours `dim`; the map edge `EDGE` a dashed `main` ring; planet fill `faint`, lit side `dim`, rim `mid`; asteroids `dim` fill with `mid` edge; stars `dim` dots; strokes that were black or near-black (the chevron's 0x000000, room 0x0b1018) `glass`.
- predicted path solid `mid`; velocity dashed `main`; heading line `main`; engine flame and turn pip `hot`; missile predictor path dotted `main`.
- off-screen arrows (`ARROW_COLOUR`): the crew ship `hot` filled arrow, the enemy `main` hollow arrow, the planet `dim`, a missile `main` small arrow; each arrow keeps its text label.
- effects (`EffectDraw.colour`): beam hit `hot` line, beam miss `dim` line, burst and sparks `hot` fading to `mid`.
- text and compass: grid, row and ring labels `mid`; the compass ring circle and ticks `dim`; arrow labels `main`; the Weapons info line `main`, `hot` when the target is in the arc (today's `GOOD`); the lock label an inverse bar (solid `main`, `glass` text).

**Friend and foe:**
- the crew's ship: solid `hot` fill with `glass` strokes;
- the enemy: hollow (a `main` outline, `glass` inside) with a dashed outer ring blinking `main` ↔ `dim` at 1 Hz; the lock keeps its solid corner brackets around the locked room, so the two shapes never look alike;
- crew missiles: solid `hot` glyph with a solid `mid` trail; enemy missiles: a hollow glyph alternating `main` ↔ `hot` with the enemy ring, with a dashed `dim` trail;
- the own laser arc: `mid` fill at today's alpha with a solid `main` edge; the enemy arc: no fill, a dashed `dim` edge;
- shield rings: dashed `mid` (own), dashed `dim` (enemy).

**Room damage** (per room segment), against each ship's base:
- own ship (solid `hot`): level 1 a `glass` hatch; level 2 alternates between a `glass` cut-out and `hot` at 2 Hz;
- enemy (hollow): level 1 a `main` hatch; level 2 alternates between a solid `hot` fill and a `main` outline with a `main` hatch at 2 Hz;
- the hatch: 1-unit lines at 45 degrees every 4 units, clipped to the segment polygon;
- a ship drawn as a chevron (zoomed out) shows no damage, as today.

**Every blink alternates between two visible states, never off:** a square wave on `floor(t * 2 * hz) % 2` of the presentation time.

**Dashes, dots and hatches:** PixiJS 8 Graphics has no dash style, so a pure `render/tactical/dashModel.ts` provides `dashLine(points, dash, gap)`, `dashCircle(x, y, r, dash, gap)` (segment lists) and `hatchSegments(poly, spacing, angle)` (lines clipped to a convex polygon by line-polygon intersection, no Pixi mask). Lengths are screen pixels: dashed 6 on / 4 off, dotted 1 on / 3 off, hatch spacing 4 at 45 degrees. The plan checks `wedgeSegments` polygons are convex (or clips a concave one by splitting it into triangles). The helpers write into reused arrays (no display objects per frame, per the layer's contract). Each helper is unit-tested.

**Readout semantics:** `ReadoutRow` (`render/duel/readoutModel.ts`) gains an optional `emphasis?: 'good' | 'warn' | 'alert' | 'crew' | 'enemy'`, set by `readoutRows` beside the tints it sets today. With `crt` true `ReadoutPanel` draws by emphasis; with `crt` false it ignores it (the interior keeps its tints):
- `alert` (own low hull; the EMPTY, COASTING and MISSILE INBOUND rows exist only in the interior view and keep their tints there): an inverse bar alternating `main` block / `hot` block with `glass` text;
- `warn` (room damage level 1 and 2, enemy room levels): text plus `hot`; the level digit stays;
- `good` (OK, full charge, repair progress, enemy low hull): `hot` text, never dimmer than a plain value;
- `crew` / `enemy` headings: the crew heading as `main` text, the HUNTER heading as an inverse bar; crew shield pips solid `hot`, enemy pips hollow `main`;
- labels `mid`, values `main`; the LOCK value as an inverse bar.
The plan lists every row `readoutRows` builds and its emphasis.

## 3. The CRT screen

- **Pixi:** on the tactical layer's container only, a glow (bloom on bright strokes) and a faint noise. `pixi-filters` (the v6 line for PixiJS 8) is not a dependency today; the plan adds it if its bloom works with Pixi 8.19 in Electron, otherwise writes one small custom glow filter. With `crtScale().glow` 0 no filter is attached.
- **Screen overlay:** a child of `Stage` in `DuelUi` and `FlightUi`, rendered only when `crt` is true, after `Banners` and before `EndCard` and `LatencyOverlay` (so the end card and the latency overlay are never covered), sized and placed on the letterbox rectangle (`letterbox.ts` offsets and scale), pointer events off. It draws scanlines (a horizontal line every 3 device pixels), a fine aperture-grille mask, a corner vignette and a slow brightness flicker (a few percent, on the presentation clock).
- **Text glow:** one wrapper `div` around the console overlay group (inside `Stage`) gets `filter: drop-shadow(0 0 Npx main@alpha)` scaled by `crtScale().glow`; not per element, and not `text-shadow` (PixelText is a canvas).
- **Readout frame:** with `crt` true the readout panel's border is a double line (VT320 style) in `mid`.
- **Bezel:** a dark warm-brown frame with rounded corners and an inner shadow, drawn on the letterbox rectangle, 3 internal pixels wide, inside every current edge inset (the map grid labels at 4, `READOUT_MARGIN` 8, the Weapons info line at y 12, the snap hint at H-12, the zoom text and scale bar at x 16). A unit test checks every edge-anchored placement lies inside the bezel's inner edge: the grid column and row labels, the off-screen arrows and their labels, the Weapons info line, and the React overlays (readout, zoom text, scale bar, snap hint). World-anchored labels (the bearing ring, the lock) are clipped by the bezel exactly as the screen edge clips them today and are not clamped; the vignette carries most of the framed feel.
- **No barrel curvature:** it would misalign the React overlays with the Pixi map; the vignette and rounded bezel corners give the curved feel.

## 4. Strength setting and clocks

- `render/crt.ts` mirrors `render/feel.ts`: `CRT_KEY = 'ftlite-crt'`, settings `full`, `subtle` (default), `off`, `parseCrt`, `nextCrt`, `loadCrt`, `saveCrt` (try/catch), and a pure `crtScale(setting)` giving glow, scanline, mask, flicker and vignette strengths (`off`: all 0, the amber palette and the bezel stay).
- `app/crtBoot.ts` `installCrt(target)`, called beside `installFeel` in the same three boots in `main.ts`; its target writes a `crt` slice of the UI store (read by `CrtContext`) and the scene's Pixi filter strength. F10 cycles it and saves, in dev builds only (`import.meta.env.DEV`, as F9 does for feel); no menu UI.
- **Blinks:** the tactical layer's `draw` takes a presentation time (`performance.now()` seconds); React blinking rows read `now` from `CrtContext` (a `useNow` tick). Blinks are readability cues, so they run at every setting, including `off`, and while paused.
- `subtle` keeps 1-unit lines (missile paths, the arc edge, compass ticks) readable at the default zoom; `full` is the reference look.

## 5. Performance

Frame time from `renderer.app.ticker.deltaMS`, median and p95 over 10 s, in `?mode=duel` on the Weapons map at 1920x1080, at `off`, `subtle` and `full`. Pass: p95 at most 16.7 ms and no more than 10 % above `off`. (`?uiperf=1` stays for the React side only.)

## Testing and the gate

- Unit tests: `crtActive` per view; `crtScale` and the setting read/save/cycle; `readoutRows` emphasis for every row; the overlay rectangles inside the bezel; and one full-frame colour test: draw a helm and a weapons frame with missiles (both sides), effects, the lock, arrows, damage at levels 1 and 2 on both ships, then walk every Graphics' `context.instructions` and every BitmapText tint and assert each colour is in the ramp.
- With `crt` false (the interior), the React overlays render as today (a snapshot of the props or the existing tests unchanged).
- All existing tests pass; SIM_VERSION and the goldens are unchanged.
- Screenshots (the existing harness approach): the Helm map; the Weapons map with a lock, both missiles in flight and own-ship damage at levels 1 and 2; the flight view; the interior unchanged; at `subtle` and `full`; saved to `C:\Users\djuar\FTLite-shots\crt-map\`.
- **Owner gate:** does it feel like looking at a display on the ship, and can everything still be read?
