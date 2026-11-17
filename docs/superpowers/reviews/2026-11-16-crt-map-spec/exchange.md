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

# Round 2 (delta, reviewing ab55938, effort medium, 109 s, 319574 in / 268669 cached / 9193 out)

Verdict: changes requested

## Findings

### [P2] R2-F1 Dashed, dotted and hatched lines have no Pixi primitive, and the spec gives no geometry for them
The new roles use dashed or dotted strokes in seven places: the EDGE ring, velocity, the enemy ring, the enemy arc edge, both shield rings, the enemy missile trail and the missile predictor. They also use a hatch clipped to each room segment. PixiJS 8 Graphics has no dash style, and the repo has no dash helper. The spec gives no dash or gap lengths, does not say whether dashes are in screen or world units, and does not say how the hatch is clipped (a mask per segment, or computed line-polygon intersection). · spec L27, L28, L34-L37, L42; src/renderer/src/render/tactical/tacticalLayer.ts:L1-L3 (layer contract: nothing allocated per frame), L103, L124-L125, L185, L191, L97; grep 'dash' over src/renderer/src finds nothing · Two implementers will produce visibly different dashes. Some will tell the own (mid) and enemy (dim) shield rings apart by dash pattern and some will not. A mask per segment would break the layer's no-allocation-per-frame contract. Friend vs foe now rests on solid vs dashed, so the pattern has to be readable at the default zoom. · Add a pure helper in crtTheme.ts or a new dashModel.ts: dashLine(points, dash, gap) and dashCircle(x, y, r, dash, gap) that return segment lists. Use screen-pixel lengths, for example dash 6 / gap 4 and dotted 1 / gap 3. Add hatchSegments(poly, spacing 4, angle 45°), computed by clipping each line to the convex segment polygon with no Pixi mask. Check that wedgeSegments polygons are convex, or say how concave ones are clipped. Unit-test all three helpers.

### [P2] R2-F2 Readout emphasis targets rows that never appear in console views, and makes the positive cues dimmer than plain values
The alert rows (a station EMPTY or COASTING, and MISSILE INBOUND) are built only when mode is 'interior', where crt is false. Under CRT they are dead, and in console views the only alert is own low hull. 'good' maps to mid, which is dimmer than the plain-value colour main. The full-charge HOLD countdown, a fire-now cue, therefore reads weaker than an ordinary value. Enemy low hull (GOOD tint today) is not assigned an emphasis at all. · spec L46, L48, L50; src/renderer/src/render/duel/readoutModel.ts:L71-L83 (the OUTSIDE block, EMPTY, COASTING and MISSILE INBOUND only in interior mode), L58 (enemy low hull GOOD), L66 (full charge GOOD) · An implementer may 'fix' the missing console warning by adding MISSILE INBOUND to console views, which is a non-goal change to what the map shows. Or they may build emphasis paths that never render under CRT. Under CRT, dimming the ready-to-fire and enemy-nearly-dead cues reverses today's emphasis. · Say that alert under CRT applies only to own low hull, and that the interior-only rows keep their tints. Map good to hot, or to main plus a marker, so it is never dimmer than a plain value. Give enemy low hull an explicit emphasis, for example good, shown as hot text.

### [P2] R2-F3 'Blinking' enemy missile and ring are undefined: if blink means on/off, the incoming missile vanishes half the time
The enemy missile glyph 'blinks with the enemy ring' at 1 Hz, and the spec never says what the off phase is. Read as on/off, an incoming missile glyph is invisible 50% of the time, leaving only a dashed dim trail. The same ambiguity applies to the enemy level-2 'blinking solid hot fill' (blinking against what?). · spec L34, L35, L41; tacticalLayer.ts:L183-L187 (today the glyph is always drawn) · Spotting an incoming missile is the core Weapons-map read. Two implementers will choose different off phases. · Define every blink as alternating between two visible states, never off. Enemy ring: main ↔ dim. Enemy missile: hollow main ↔ hollow hot. Enemy level 2: solid hot ↔ main outline with a main hatch. State that blinks are a square wave on floor(t * 2 * Hz) % 2.

## Prior findings
- R1-F1: resolved — Spec L17-L20 adds crt to DuelUiView and FlightUiView, set in scene.ts and flightMode, and a CrtContext with theme.ts unchanged. This matches scene.ts:L85-L101, where the view is known at ui.frame.
- R1-F2: resolved — ReadoutRow gains emphasis, which is ignored when crt is false, with rules per kind (spec L45-L51). The interior-only alert rows and the dim 'good' mapping are raised as a new P2.
- R1-F3: resolved — Damage is defined against each ship's base, with the hatch geometry and the chevron exception (spec L39-L43), and there is a screenshot case at L78. The hatch clipping method is covered by the new dash/hatch P2.
- R1-F4: resolved — Crew and enemy missiles, trails and arcs now have distinct solid/hollow and solid/dashed roles (spec L35-L36). The blink ambiguity is raised as a new P2.
- R1-F5: still open — The bezel is now on the letterbox rectangle at 6 internal px. But the claim that it 'stays inside today's 8-pixel minimum margin' (spec L59) is false. The grid column labels sit top-anchored at y = max(4, …) and the row labels at x = max(4, …) (tacticalModel.ts:L161, L165, L170), so the 6 px bezel covers the top or left 2 px of those labels whenever the grid edge is off screen, which is the normal case. The containment test covers only 'console overlay rectangles' (React), not the Pixi grid labels. Fix: move the label inset to 8+ under CRT, or make the bezel at most 3 px, and extend the containment test to the Pixi labels (grid columns and rows, ring, arrows, info, lock).
- R1-F6: still open — The test method is now fixed (spec L75), but spec L26 claims 'every current constant and literal mapped' and that is false for the text and compass colours. Unmapped: DIM (compass ring circle and ticks, tacticalLayer.ts:L152-L153, L175-L176; grid, row and ring label tints, L56-L58); TEXT (arrow labels L59, info L60 and L204); the info tint GOOD when in arc (L204); and the lockText tint LOCK (L60). Round 0's 'text main, secondary mid' line was deleted in the rewrite, so these now have no role. Add them, for example labels and ring dim/mid, info main with hot when in arc, and the lock label as an inverse bar or main.
- R1-F7: resolved — The overlay is a Stage child after Banners and before EndCard and LatencyOverlay, on the letterbox rectangle (spec L56). This matches DuelUi.tsx:L15-L21.
- R1-F8: resolved — One wrapper div gets drop-shadow and text-shadow is ruled out (spec L57).
- R1-F9: resolved — Frame time now comes from ticker deltaMS, median and p95 over 10 s at three settings, with a pass bar (spec L71).
- R1-F10: resolved — crt.ts and crtBoot.ts mirror feel.ts and feelBoot.ts (feelBoot.ts:L8-L16, dev-gated), and the target writes both a store slice and the Pixi filter (spec L64-L65).
- R1-F11: resolved — draw takes the presentation time and React uses a useNow tick through CrtContext. Blinks run at every setting and while paused (spec L66).
- R1-F12: resolved — 'Selected target' is dropped; the enemy marker is a dashed ring and the lock keeps its corner brackets (spec L34).

## Verified
- The tactical layer is created only by scene.ts and flightMode.ts, and scene.ts hides it in the interior (scene.ts:L64, L85; flightMode.ts:L31), so 'Pixi CRT only in console views' (spec L20) holds.
- Overlay z-order: DuelUi renders MapOverlay, ReadoutPanel, Banners, EndCard, then LatencyOverlay inside Stage (DuelUi.tsx:L15-L21), so the slot named in spec L56 exists.
- fxModel colours BEAM_HIT, BEAM_MISS, BURST and SPARK (fxModel.ts:L17-L18) are covered by the effects role at spec L30.
- feelBoot gates F9 on opts.dev (feelBoot.ts:L10), so the F10 mirror at spec L65 is consistent.
- The scene shake is at most SHAKE_PX = 6 (fxModel.ts:L14), equal to the 6 px bezel, so the shake does not expose an edge gap inside the bezel.
- The Weapons info line is at y 12 (weaponsModel.ts:L88) and the arrows sit at ARROW_MARGIN 28 (tacticalModel.ts:L22), both inside a 6 px bezel.

## Not verified
- Whether the wedgeSegments polygons are convex. This decides whether a simple line-clip hatch works; tacticalModel's wedgeSegments body was not read.
- Whether pixi-filters v6 bloom runs on Pixi 8.19 in Electron. The spec leaves this to the plan.
- Whether Stage scales its children to the letterbox rectangle or the overlay must compute it itself (Stage.tsx not re-read this round).
- The reference images were not viewed this round, because no touched requirement depends on them beyond round 1.

---

# Round 2 response (spec revised)

Reviewed `round-2.json` against `ab55938`. 5 accepted (R1-F5 and R1-F6 reopened, plus R2-F1 to R2-F3), 0 rejected, 0 deferred.

## R1-F5 [P1]: The bezel still clips grid labels (reopened)

Confirmed (tacticalModel.ts:L161-L170, labels at 4). The bezel is now 3 internal px, and the containment test covers the Pixi labels too.

## R1-F6 [P2]: Text and compass colours unmapped (reopened)

Confirmed (tacticalLayer.ts:L56-L60, L152-L153, L175-L176, L204). Added the text and compass roles.

## R2-F1 [P2]: Dash geometry undefined

Confirmed. Added dashModel.ts with screen-pixel lengths, convex clipping and reused arrays, all tested.

## R2-F2 [P2]: Readout emphasis targets rows that never appear

Confirmed (readoutModel.ts:L71-L83, L58, L66). Under CRT, alert applies only to own low hull; the interior-only rows keep their tints; good maps to hot, including enemy low hull.

## R2-F3 [P2]: Blink off-phase undefined

Confirmed. Every blink alternates between two visible states, defined as a square wave, with the pair given for each element.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-17-crt-map-design.md

<!-- end -->

---

# Round 3 (delta, reviewing 274bd43, effort medium, 61 s, 160196 in / 134169 cached / 4558 out)

Verdict: ready with P2s

## Findings

### [P2] R3-F1 The bezel containment test includes labels anchored to the world (ring, lock), which can sit anywhere on screen
Spec L64 now says the containment test covers 'every Pixi label the tactical layer places (grid columns and rows, ring, arrows, info, lock)'. The edge-anchored labels are fine to test: grid labels at max(4, …), arrows inside ARROW_MARGIN 28, and the info line at y 12. The ring and lock labels are not edge-anchored. The bearing ring's labels sit at the own ship's screen position plus (r + 22) along each bearing. The lock label follows the locked enemy room. Either one can be at the screen edge or past it in ordinary play, today and with the bezel alike. · spec L64; src/renderer/src/render/tactical/tacticalModel.ts:L177-L181 (ring labels at x + sx*(r+22) about the ship's screen point), L274 (ringDraw(ownS.x, ownS.y)); weaponsModel.ts:L87 (ring about ownS); tacticalModel.ts:L22, L188 (arrows inset by ARROW_MARGIN); tacticalModel.ts:L161 (grid labels at 4) · As written, the test is either false for some camera states, or an implementer passes it by choosing a centred fixture and believes they have proved something. Worse, they might 'fix' it by clamping ring or lock labels to the screen, which changes what the map shows (a non-goal). · Limit the containment test to edge-anchored placements: grid column and row labels, off-screen arrows and their labels, the Weapons info line, and the React overlays (readout, zoom text, scale bar, snap hint). Say that world-anchored labels (ring, lock) are clipped by the bezel exactly as they are clipped by the screen edge today, and are not clamped.

### [P3] R3-F2 The chevron 'no damage' bullet is now orphaned under the Dashes paragraph
The inserted blink and dash paragraphs split the Room damage list. The bullet 'a ship drawn as a chevron (zoomed out) shows no damage, as today' now follows the dashModel paragraph rather than the damage rules. · spec L40-L43 (Room damage list), L45, L47 (inserted paragraphs), L48 (orphaned bullet) · A plan writer reading by section could miss this rule, or attach it to dashes. · Move L48 back up, to the end of the Room damage list after L43.

## Prior findings
- R1-F5: resolved — The bezel is 3 internal px on the letterbox rectangle, inside every current inset: grid labels at max(4, …) (tacticalModel.ts:L161), READOUT_MARGIN 8, info y 12, the snap hint at H-12, and BX 16. The containment test's scope over world-anchored labels is raised as a new P2.
- R1-F6: resolved — Spec L27-L31 now maps EDGE, stars, the black and near-black strokes (tacticalLayer.ts:L88, L95), path and velocity, heading (L165), FLAME and the turn pip, ARROW_COLOUR, the fx colours, the ring and tick DIM (L152-L153, L175-L176), the info GOOD and the lock label. L80 fixes the test method: walk context.instructions and the BitmapText tints over a full frame.
- R2-F1: resolved — Spec L47 names dashModel.ts with dashLine, dashCircle and hatchSegments. It gives screen-pixel lengths (6/4 dashed, 1/3 dotted, hatch 4 at 45°), convex clipping without a mask, a convexity check on wedgeSegments with a triangle fallback, reused arrays and unit tests. The layer draws in screen coordinates (tacticalLayer.ts:L95, L121), so screen-pixel lengths are consistent with L43's 'units'.
- R2-F2: resolved — Spec L51: under CRT, alert covers only own low hull, and the interior-only rows keep their tints. Spec L53: good maps to hot, which is never dimmer than a plain value, and covers enemy low hull.
- R2-F3: resolved — Spec L45 defines every blink as a two-state square wave, floor(t*2*hz)%2, never off. The pairs are defined at L35 (ring main↔dim), L36 (enemy missile main↔hot, in phase with the ring), L41 (own level 2: glass cut-out↔hot), L42 (enemy level 2: solid hot↔main outline plus hatch) and L51 (alert: main↔hot block).

## Verified
- The 3 px bezel clears every edge inset: grid labels use Math.max(4, …) (tacticalModel.ts:L161), and arrows are inset by ARROW_MARGIN 28 (tacticalModel.ts:L22, L188, L203). The Weapons info line is at y 12 (weaponsModel.ts:L88).
- The tactical layer draws in screen-pixel coordinates (strokes of width 1 and 2 at projected points, tacticalLayer.ts:L95-L208), so the spec's screen-pixel dash and hatch lengths can be built directly.
- Every inline colour literal the R1-F6 evidence named is now mapped in spec L27-L31: 0x000000 at tacticalLayer.ts:L88, 0x0b1018 at L95, EDGE at L125, TEXT heading at L165, DIM ring and ticks at L152-L153 and L175-L176, and the per-effect e.colour at L206-L208.
- The blink definitions at spec L35, L36, L41, L42, L45 and L51 each name two visible states, with nothing that turns off.

## Not verified
- I did not check whether every wedgeSegments polygon is convex. The spec delegates this to the plan and gives a fallback.
- I did not check whether the camera can pan the own ship to the screen edge in the Helm view, which would put ring labels outside the bezel. The lock label clearly can reach the edge, because it follows the enemy.

---

# Round 3 response (spec revised)

Reviewed `round-3.json` against `274bd43`. 2 accepted, 0 rejected, 0 deferred.

## R3-F1 [P2]: The containment test includes world-anchored labels

Confirmed (tacticalModel.ts:L177-L181). The test now covers only edge-anchored placements. The ring and lock labels are clipped as they are today, not clamped.

## R3-F2 [P3]: The chevron bullet is orphaned

Confirmed. The bullet is moved back to the end of the room damage list.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-17-crt-map-design.md

<!-- end -->

---

