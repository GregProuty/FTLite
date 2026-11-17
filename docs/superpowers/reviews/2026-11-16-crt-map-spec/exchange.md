# Codex review exchange: crt-map-spec

Subject: `docs/superpowers/specs/2026-11-17-crt-map-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 91ed9cb, effort high, 271 s, 1153901 in / 1090092 cached / 22873 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 React has no view value, so crtActive(view) cannot decide the look of the shared overlay components
Spec §1 says crtActive(view) uses the view value the duel scene already has, and that the interior keeps its readout look. But that view never reaches React. DuelUiView has no view field. The same ReadoutPanel, Panel, Bar, PixelText and Banners render in both the interior and the console views. The flight mode has no DuelView at all. · spec L17-L19; src/renderer/src/ui/views.ts:L9-L10 (DuelUiView/FlightUiView carry no view); src/renderer/src/app/duel/scene.ts:L97-L101 (ui.frame gets readout, end, banners and overlay, but not the view); src/renderer/src/ui/duel/DuelUi.tsx:L16-L17 (ReadoutPanel is rendered whatever the view); src/renderer/src/app/duel/runtime.ts:L146 (DuelView = helm|weapons|interior); src/renderer/src/app/duel/flightMode.ts:L62 (the flight frame has no view); src/renderer/src/render/theme.ts:L4 (Panel's PANEL_* colours are shared with the menu and HUD) · An implementer would either guess from `overlay !== null`, which is fragile, or edit theme.ts or Panel globally, which breaks the fixed decision that the interior keeps its look. Two builds would differ, and the uiprobe duel fixture (main.ts:L188) would break if the view shape changed silently. · Add `crt: boolean` to DuelUiView and FlightUiView. Set it in scene.ts as crtActive(view) and to true in flightMode. Update duelProbeFixture. Pass a palette to ReadoutPanel, Panel, Bar, Banners and MapOverlay through a prop or a CrtContext, so theme.ts and the interior stay unchanged.

### [P1] R1-F2 The readout encodes meaning only in hue, and the spec gives no way to carry it once the colours go amber
Spec §2 says the plan maps each colour constant to a role, and that warnings become blinking inverse bars. But readoutModel bakes the meaning into hue tints, and one constant carries opposite meanings. WARN marks own low hull, an EMPTY station and MISSILE INBOUND. GOOD marks a healthy room, enemy low hull, a full charge and the repair bar. The headings and shield pips tell crew from hunter by CREW_SHIP vs ENEMY_SHIP alone. A mapping by constant cannot pick which rows become blinking inverse bars, and ReadoutRow has no field for an inverse bar. The model is also shared with the interior. · spec L26, L32-L33; src/renderer/src/render/duel/readoutModel.ts:L24-L28 (ReadoutRow: labelTint, valueTint, pips.colour, bar.colour only), L34 (levelTint GOOD/AMBER/WARN), L49, L50, L51, L57, L58, L59, L66, L75, L76, L82; src/renderer/src/ui/duel/ReadoutPanel.tsx:L28-L35 · Readability of damage, low hull, an incoming missile and crew vs hunter is the owner's fixed requirement. Built as written, these all turn into a similar amber, or two implementers pick different rows to blink. · Add an optional semantic field to ReadoutRow, e.g. `emphasis?: 'warn' | 'alert' | 'good' | 'crew' | 'enemy'`, set by readoutRows. ReadoutPanel turns it into the CRT treatment only when crt is true; the interior keeps the tints. List every row: low hull, EMPTY/COASTING and MISSILE INBOUND get blinking inverse bars; room levels by text plus mid/main/hot; crew pips solid and enemy pips hollow; the HUNTER heading as an inverse bar.

### [P1] R1-F3 The own-ship damage look contradicts itself and the hatch is undefined
The crew's ship is a solid `hot` fill, and room damage level 2 is a blinking `hot`. On the crew's ship that room is invisible in the on phase, and the off phase is never defined. Level 1, a `main` hatch on a `hot` fill (#ffae1a on #ffd36b), is very low contrast. Pixi Graphics has no hatch fill; the layer fills each room segment with one colour. How damage shows on the hollow enemy, and on a ship drawn as a chevron, is not said. · spec L28, L31; src/renderer/src/render/tactical/tacticalLayer.ts:L84-L95 (chevron fill; per-segment `fill(DAMAGE[...] ?? colour)`), L19 (DAMAGE = [null, AMBER, WARN]) · Damage on the player's own ship is a must-read cue. As written it is unreadable for level 2 and close to unreadable for level 1, and each implementer would invent their own hatch. · Define damage against each base fill. On the own ship (hot), level 1 is a `glass` hatch and level 2 blinks between a `glass` cut-out and `hot`. On the enemy (hollow), level 1 is a `main` hatch and level 2 a blinking solid `hot`. Give the hatch geometry (e.g. 45° 1 px lines every 4 px, clipped to the segment polygon) and say chevrons show no damage. Add a screenshot case with own-ship rooms at levels 1 and 2.

### [P1] R1-F4 Missiles, their trails and the two laser arcs lose friend vs foe
Today a missile's glyph and trail, and each laser arc, are told apart only by CREW_SHIP vs ENEMY_SHIP hue. Spec §2 maps the ships, the predicted missile path, beams and bursts, but not missiles in flight, their trails, or the own vs enemy arc. In one amber both missiles become the same filled triangle, and both arcs differ only by a few percent of alpha. · spec L27-L34, L9 ('friend and foe ... missile paths, the arc ... told apart'); src/renderer/src/render/tactical/tacticalLayer.ts:L183-L187 (missile colour = crew ? CREW_SHIP : ENEMY_SHIP), L143-L144 (enemy arc ENEMY_SHIP at 0.05/0.25, own arc CREW_SHIP at 0.08-0.14/0.5) · Telling an incoming missile from your own is the core friend/foe read on the Weapons map. It is in the spec's own goal but has no treatment. · Add roles. Crew missile: solid `hot` glyph with a solid `mid` trail. Enemy missile: hollow `main` glyph that blinks with the enemy bracket, with a dashed `dim` trail. Own arc: `mid` fill at today's alpha with a solid `main` edge. Enemy arc: no fill and a dashed `dim` edge.

### [P1] R1-F5 The 16 px bezel covers the readout and the edge labels, and its frame and units are undefined
Spec §3 says the bezel is about 16 px, overlaps only the edge band and crops nothing. But today's content sits inside that band: the readout panel at 8 internal px from the top and right edges, the Weapons info line top-anchored at y=12, the snap hint bottom-anchored at H-12, and the zoom text and scale bar at x=15-16. The spec also does not say whether 16 px is CSS or internal pixels, or whether the bezel frames the full-window Stage or the letterboxed 1280x720 rectangle. Stage spans the whole window below the strip. · spec L43; src/renderer/src/render/duel/readoutModel.ts:L20 (READOUT_MARGIN = 8); src/renderer/src/ui/duel/ReadoutPanel.tsx:L15 (X = W-READOUT_W-8, Y = 8); src/renderer/src/render/tactical/weaponsModel.ts:L88 (info y: 12); src/renderer/src/ui/duel/MapOverlay.tsx:L11, L17-L22 (BX=16, zoom text x=16, snap hint at H-12); src/renderer/src/ui/stage/Stage.tsx:L7 (full-window fixed div); src/renderer/src/render/letterbox.ts:L6 (offsets) · 'Not cropped' is a stated outcome that is false for the default layout. The plan's corner check would fail, or an implementer would quietly move the HUD. Bezels on the window vs the letterbox look different whenever the window is not 16:9. · Say that the bezel sits on the letterbox rectangle (offsetX/offsetY/scale), sized in internal pixels. Either make it at most 6 internal px, inside the 8 px minimum margin, or keep 16 px and shift the console-view overlays inward by a named inset (READOUT_MARGIN, the info y, BX and the snap-hint y become 16+). Add a unit test that every console overlay rect lies inside the bezel's inner edge.

### [P2] R1-F6 The colour mapping misses several constants, and the 'only ramp colours' test has no stated method
Unmapped today: the map edge EDGE (a red danger ring), FLAME, the turn pip (AMBER), the heading line (TEXT), the chevron stroke 0x000000, the room stroke 0x0b1018, white stars, the in-arc info tint GOOD, ARROW_COLOUR per target, and the fx colours passed through EffectDraw.colour. PATH and VELOCITY both map to `mid`, though they leave the same origin at the same width. The layer draws with inline constants, with no colour list. The existing tests build real Pixi Graphics and never inspect colours, so 'a test over the draw lists / colour constants' could be built two ways, and one of them (constants only) would miss inline literals. · spec L26, L35, L57; src/renderer/src/render/tactical/tacticalLayer.ts:L14-L19, L71, L88, L95, L125, L160-L173, L204; src/renderer/src/render/tactical/fxModel.ts:L17-L18; src/renderer/src/render/tactical/shipColours.ts:L2; tests/tacticalLayer.test.ts:L13-L31 · Black and near-black strokes are not ramp colours, so a strict test fails or gets weakened ad hoc. A colour-blind velocity/path pair loses a Helm read. · Pick one method: draw one full frame (helm plus weapons, with missiles, effects, lock and arrows), walk each Graphics' `context.instructions` and each BitmapText.tint, and assert every colour is in the ramp. Map the missed constants explicitly: EDGE as a dashed `main`, strokes as `glass`, stars as `dim`, FLAME and the turn pip as `hot`, heading as `main`, path as solid `mid`, velocity as dashed `main`.

### [P2] R1-F7 The screen overlay's z-order is ambiguous and would cover the end card or the menu
The overlay is 'a fixed React element above the stage'. Stage is z 10, the menu z 20, and the EndCard renders inside the same Stage after the banners. An element above the Stage covers the end card, which is a non-goal, and at z ≥ 20 it covers the menu, also a non-goal. A window-fixed element also ignores the session strip offset that Stage applies. · spec L13, L41; src/renderer/src/ui/stage/Stage.tsx:L1, L7 (top = stripHeight, zIndex 10); src/renderer/src/ui/duel/DuelUi.tsx:L16-L20 (EndCard and LatencyOverlay after the banners) · Two implementers would place it differently; one scanlines the end card, the other misses the banners. · Put the overlay as a child of Stage in DuelUi and FlightUi, after Banners and before EndCard and LatencyOverlay, rendered only when crt is true, sized to the letterbox rectangle.

### [P2] R1-F8 A CSS glow via text-shadow does nothing on PixelText, which is a canvas
PixelText is a <canvas> drawn from a glyph atlas and tinted with source-in, so `text-shadow` has no effect on it. `filter: drop-shadow` works, but applied to each of the 30+ text canvases it adds a composited filter layer per element. · spec L42; src/renderer/src/ui/stage/PixelText.tsx:L1-L3, L35-L38 · The two options the spec offers are not equivalent; one silently does nothing. · Say `filter: drop-shadow(0 0 Npx main@alpha)` on one wrapper div around the console overlay group (inside Stage), not text-shadow and not per element, scaled by crtScale().glow.

### [P2] R1-F9 The performance check uses a counter that does not measure frame rate
`?uiperf=1` times each React sink write (flushSync plus render and commit). It sees neither the Pixi glow filter's GPU cost nor the compositor cost of the CSS overlay, so it cannot show whether the console view keeps its frame rate. · spec L53; src/renderer/src/ui/perf.ts:L1-L2, L16; src/renderer/src/main.ts:L33 · The criterion has no observable check for the thing it claims to guard. · Measure frame time from `renderer.app.ticker.deltaMS` (median and p95 over 10 s) in ?mode=duel on the Weapons map at 1080p, at off, subtle and full. Set a pass bar (e.g. p95 ≤ 16.7 ms and no more than 10% worse than off), and keep uiperf only for the React side.

### [P2] R1-F10 Where the CRT setting lives, and how F10 reaches both Pixi and React, is unstated
ftlite-feel keeps its setting on the renderer (FeelTarget feel/setFeel) and is booted in startApp, startFlight and startDuel. The CRT strengths are needed by the Pixi filter and by the React overlay, so a live F10 change must reach both. The spec names only localStorage and 'like ftlite-feel'. · spec L48; src/renderer/src/app/feelBoot.ts:L5-L16; src/renderer/src/main.ts:L47-L50, L59, L137, L156 · An implementer may wire only the renderer, so F10 changes the glow but not the scanlines, or may miss one of the three boots. · Add `render/crt.ts` (CRT_KEY, CRT_SETTINGS, parseCrt, nextCrt, loadCrt, saveCrt, crtScale) mirroring feel.ts, and `app/crtBoot.ts` installCrt with a target that writes a `crt` store slice and the scene's filter. Call it in the same three boots. F10 itself is free: Menu.setApplicationMenu(null) and no renderer code binds F10.

### [P2] R1-F11 The blink clock, and blinking at 'off' and while paused, are unspecified
The 1 Hz enemy bracket and the blinking damage and warning bars need a time source. layer.draw(d, c) takes no clock, and ReadoutPanel is memoised with no time input. The spec names presentation time only for the flicker, and does not say whether blinks run at `off`, where they are readability cues rather than effects, or while paused. · spec L29, L31, L33, L41, L48; src/renderer/src/render/tactical/tacticalLayer.ts:L118 (draw signature); src/renderer/src/ui/duel/ReadoutPanel.tsx:L17 · Using the sim tick would tie presentation to the sim (a fixed decision). Leaving it open lets two implementers disagree on whether `off` removes the warnings' blink. · Pass a presentation clock (performance.now) into layer.draw, and use a React useNow tick for the blinking readout rows. State that blinks run at every setting, including off and while paused, since they are not screen effects.

### [P3] R1-F12 'The selected target' does not exist, and the enemy's blinking bracket would look like the lock bracket
Nothing in the tactical layer or the overlays is 'the selected target' apart from the lock. The lock already draws four corner brackets around the locked room, so a blinking outer corner bracket on the enemy uses the same glyph shape. · spec L29, L32; src/renderer/src/render/tactical/tacticalLayer.ts:L195-L202; src/renderer/src/render/tactical/weaponsModel.ts:L70-L77 · This is minor ambiguity, and the two brackets could confuse the lock read. · Drop 'selected target', or name what it is. Make the enemy marker a different shape (e.g. a blinking diamond or a dashed ring). Keep the lock as solid corner brackets plus the inverse-bar LOCK label.

## Verified
- Only two places create the tactical layer: the duel scene and the dev flight view (createTacticalLayer is called only in app/duel/scene.ts:L64 and app/duel/flightMode.ts:L31, plus tests). The sector game's views do not use it.
- The duel shows the tactical layer for 'helm' and 'weapons', and the interior for 'interior' (scene.ts:L85). The online seat maps 'standing' to 'interior' (onlineSource.ts:L117).
- sceneUi already nulls the map overlay in the interior (scene.ts:L55), but ReadoutPanel and Banners still render in every view (DuelUi.tsx:L16-L18).
- PixelText is a DOM <canvas> tinted from a glyph atlas, not text and not Pixi (PixelText.tsx:L1-L3, L35-L38).
- Stage is fixed below the session strip at z 10, with pointer events off; its comment places the menu above it at z 20 (Stage.tsx:L1, L7).
- pixi-filters is not a dependency today; package.json lists pixi.js 8.19.0, react 19.3.1 and electron 37.10.3. No Pixi filters are used anywhere in src/renderer/src today.
- F10 has no existing binding: Menu.setApplicationMenu(null) (src/main/index.ts:L61), the before-input-event handler only handles FULLSCREEN_KEY (L64-L69), and no renderer source binds F10.
- The ftlite-feel pattern is FEEL_KEY in localStorage, a try/catch load and save, a dev-only F9 cycle, and the setting held on the renderer (render/feel.ts:L4-L40; app/feelBoot.ts:L8-L16).
- Theme colours the console views import today: TEXT, DIM, AMBER, WARN and GOOD (tacticalLayer.ts:L5; readoutModel.ts:L10), PANEL_* (Panel.tsx:L3) and BAR_OFF (Bar.tsx:L2; ReadoutPanel.tsx:L6). The console overlays do not use BLUE.

## Not verified
- Whether pixi-filters v6's peer range covers pixi.js 8.19.0, and whether importing it works in the vitest environment (no network or node_modules reads allowed).
- The size of the glow filter's render area: the stars Graphics is a 2w x 2h tile offset by -w,-h (tacticalLayer.ts:L69-L71, L119). Whether Pixi 8 clips the filter bounds to the screen or renders the full bounds was not checked.
- I did not view the three reference images; the palette was judged against the code, not the references.
- The colours in FeelPanel.tsx, EndCard.tsx and LatencyOverlay.tsx were not read (FeelPanel is in the flight view's scope).
- Whether the ESC pause menu in the duel is the React Menu (z 20) or a banner was not checked; it matters for the overlay z-order finding.

---

# Round 1 response (spec rewritten)

Reviewed `round-1.json` against `91ed9cb`. 12 accepted, 0 rejected, 0 deferred. Each finding was confirmed against the cited code and fixed as follows.

## R1-F1 [P1]: React has no view value

Confirmed (views.ts:L9-L10, scene.ts:L97-L101). Section 1: DuelUiView and FlightUiView gain crt, set in scene.ts and flightMode.ts, plus a CrtContext; theme.ts is unchanged.

## R1-F2 [P1]: The readout encodes meaning only in hue

Confirmed (readoutModel.ts:L24-L82). ReadoutRow gains emphasis, with the rules per kind, used only when crt is true; the plan lists every row.

## R1-F3 [P1]: Own-ship damage contradicts itself

Confirmed (tacticalLayer.ts:L84-L95). Damage is now defined per base (own hot: glass hatch, then glass cut-out blinking at 2 Hz; enemy hollow: main hatch, then blinking hot), with the hatch geometry. Chevrons show no damage. Screenshot case added.

## R1-F4 [P1]: Missiles and arcs lose friend vs foe

Confirmed (tacticalLayer.ts:L143-L187). Section 2 adds roles for crew and enemy missiles, trails, own and enemy arcs, and shields.

## R1-F5 [P1]: The bezel covers labels

Confirmed (readoutModel.ts:L20, MapOverlay.tsx:L11-L22). The bezel is now 6 internal px on the letterbox rectangle, inside the 8 px margin, with a containment test.

## R1-F6 [P2]: Unmapped constants; test method

Confirmed. Every listed constant and literal is mapped, and the colour test walks Graphics context.instructions and BitmapText tints over a full frame.

## R1-F7 [P2]: Overlay z-order

Confirmed (Stage.tsx, DuelUi.tsx:L16-L20). The overlay is a Stage child after Banners and before EndCard and LatencyOverlay, on the letterbox rectangle.

## R1-F8 [P2]: text-shadow on a canvas

Confirmed (PixelText.tsx:L1-L38). It is now one wrapper drop-shadow filter, scaled by glow.

## R1-F9 [P2]: Performance measure

Confirmed (perf.ts). The check now uses ticker deltaMS median and p95 over 10 s at three strengths, with a pass bar.

## R1-F10 [P2]: Setting plumbing

Confirmed (feelBoot.ts, main.ts). Adds crt.ts and crtBoot.ts mirroring feel, a store slice and the filter strength. F10 is free.

## R1-F11 [P2]: Blink clock

Confirmed (tacticalLayer.ts:L118, ReadoutPanel.tsx:L17). The tactical layer's draw takes a presentation time and React uses a useNow tick. Blinks run at every setting and while paused.

## R1-F12 [P3]: Selected target vs lock

Confirmed (tacticalLayer.ts:L195-L202). Dropped the selected target. The enemy marker is a blinking dashed ring, and the lock keeps its corner brackets.

## Also changed

- The latency overlay and the sector views are added to the non-goals.

## Files changed

- docs/superpowers/specs/2026-11-17-crt-map-design.md

<!-- end -->

---

