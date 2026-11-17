# CRT map: the console screens as an amber ship display

Date: 2026-11-17. Owner request: "change the tactical map to a CRT amber color ... basically i want it to look like you're looking at a display on the spaceship, i think it will be good for vibes/ immersion". References (owner, saved outside the repo): `C:\Users\djuar\FTLite-shots\refs\crt-amber-reference.webp` (amber-red phosphor, dot-matrix glyphs, bloom, curved glass, brown bezel), `crt-vt320-amber-terminal.webp` (crisp monospace, fine scanlines, double-line frame, solid amber bars with dark text for the selected item, dim secondary text), `crt-amber-tv-glow.jpg` (visible phosphor dot grid, strong bloom, dark teal-grey glass, curved tube, worn bezel).

Process tier (grill Q31): views and feel, so one spec, one plan, a subagent build, one implementation review, and the owner's look as the gate. No sim, command, snapshot or authority change; SIM_VERSION and goldens do not move.

## Goal

When a player is at a console (the Helm map, the Weapons map, the flight view), the whole screen reads as a monochrome amber CRT on the ship: amber phosphor on dark glass, a soft glow, scanlines, a darkened edge and a bezel. Everything stays as readable as today: friend and foe, damage, locks, missile paths, the arc and the readout can still be told apart at a glance.

## Non-goals

The interior (on foot) view, the menus and lobby, the end card, the enemy window of the sector game, sound, any change to what the map shows or how it is controlled, a curved (barrel-distorted) screen.

## 1. Where it applies

- The **console views**: every view of the duel and flight modes that draws the tactical layer (`render/tactical/tacticalLayer.ts`) — today the Helm map, the Weapons map and the flight view — plus the React overlays shown with them (`ui/duel/MapOverlay.tsx`, `ui/duel/ReadoutPanel.tsx`, `ui/duel/FlightUi.tsx`, banners shown over a console view).
- The **interior view** (on foot) keeps today's look, including its readout panel. A switch between views switches the look at once (no fade).
- A pure `crtActive(view)` decides it, from the same view value the duel scene already uses to show the tactical layer or the interior.

## 2. The amber palette

- A new pure module `render/tactical/crtTheme.ts` holds one phosphor ramp and the roles that use it:
  - `glass` #0c0e0b (the dark, slightly teal-grey tube between strokes, not pure black),
  - `faint` #2a1a08, `dim` #7a4a10, `mid` #c47a12, `main` #ffae1a, `hot` #ffd36b (the brightest phosphor, near-white amber).
- Every colour the tactical layer and its overlays draw maps to a role (the plan lists each current constant and its role): space `glass`; grid and contours `faint`/`dim`; planet fill `faint`, its rim `mid`; asteroids `dim` with a `mid` edge; stars `dim` dots; paths and velocity `mid`; text `main`, secondary text `mid`.
- **Telling things apart without hue:**
  - the crew's own ship: solid `hot` fill;
  - the enemy: outlined in `main` with a hollow centre and a blinking (1 Hz) outer bracket;
  - shield rings: dashed `mid`;
  - room damage level 1: `main` hatch, level 2: blinking `hot`;
  - the lock and the selected target: the VT320 inverse bar, a solid `main` block with `glass` text;
  - warnings (low hull, incoming missile): blinking inverse bars;
  - missile path: dotted `main`; beam hit: `hot` line, beam miss: `dim` line; bursts and sparks: `hot` → `mid`.
- Nothing in the console views keeps a non-amber hue (a test checks every colour the console views draw against the ramp).

## 3. The CRT screen

Applied to the console views only, in two places, because the map is drawn by Pixi and the overlays are React DOM over it:
- **Pixi (the tactical layer's container):** a glow (bloom on bright strokes) and a faint noise flicker, via `pixi-filters` (v6, the PixiJS 8 line; added as a dependency) or a small custom filter if the package does not fit.
- **One screen overlay over both (a fixed React element above the stage, pointer events off):** scanlines (a repeating horizontal line every 3 device pixels at low alpha), a fine dot or aperture-grille mask, a vignette darkening the corners, and a slow brightness flicker (presentation time, a few percent).
- **React text and boxes** in console views get the amber colours and a CSS glow (`text-shadow`/`filter: drop-shadow` in `main` at low alpha); the readout panel's frame becomes a double-line border (VT320).
- **Bezel:** a dark warm-brown rounded frame (about 16 px) around the stage area in console views, with an inner shadow, so the screen sits inside a monitor. The map content is not cropped: the frame overlaps only the edge band, and the plan checks the corner labels and readout stay inside.
- **No barrel curvature:** it would misalign the React overlays with the Pixi map; the vignette and rounded bezel corners give the curved feel instead.

## 4. Strength setting

- `localStorage` key `ftlite-crt`: `full`, `subtle` (default), `off`; read at boot in a try/catch like `ftlite-feel`; a pure `crtScale(setting)` gives the glow, scanline, mask, flicker and vignette strengths (off keeps the amber palette but no screen effects). F10 cycles it in dev builds only, as F9 does for feel. No menu UI.
- `subtle` keeps 1-unit lines (missile paths, the arc edge, the compass ticks) readable at the default zoom; `full` is the reference look.

## 5. Performance

The glow filter runs on the tactical container only; the overlay is static CSS (no per-frame work except the flicker opacity). The console view must keep its frame rate at 1080p (the plan measures with the existing `?uiperf=1` counter before and after).

## Testing and the gate

- Unit tests: `crtActive` per view; the theme roles map every former tactical colour constant; the console views draw only ramp colours (a test over the draw lists / colour constants); `crtScale` per setting; the setting read and save.
- All existing tests pass; SIM_VERSION and the goldens are unchanged.
- Screenshots (the existing harness approach): the Helm map, the Weapons map with a lock and a missile in flight, the flight view, and the interior unchanged, at `subtle` and `full`; saved to `C:\Users\djuar\FTLite-shots\crt-map\` beside the references.
- **Owner gate:** does it feel like looking at a display on the ship, and can everything still be read?
