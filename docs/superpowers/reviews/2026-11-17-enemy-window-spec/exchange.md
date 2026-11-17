# Codex review exchange: enemy-window-spec

Subject: `docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing c1d87177, effort high, 249 s, 1417987 in / 1335679 cached / 21810 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 T and Esc cannot go through createDuelKeyboard().ui; that object only carries React clicks into the keyboard
The spec routes T and Esc through 'the duel keyboard's UI handling (createDuelKeyboard().ui)'. But `.ui` is a ConsoleInput with press/hold/lock, which React buttons use to push edges into the keyboard. Keys travel the other way: a keydown listener on `window` turns Escape into presses.pause, and the runtime reads that. Nothing in that path can see the window state in the UI store. Nothing in it can swallow Escape before it counts as a pause. · spec L28, L87; input.ts:L22 (ConsoleInput = press/hold/lock), L63-L67 (keydown → PRESS_CODES, Escape → pause, counted unconditionally), L80-L88 (ui object); duelMode.ts:L42-L43 (keyboard on window, ui handed to setConsole); actions.ts:L42-L52 (console actions forward to the keyboard) · Two implementers would build this differently. One might add a KeyAction 'contact' that reaches the sim runtime, which has no window state. Another might add a second React keydown listener, which would race the keyboard's pause count. As written, Esc would pause and close the window in the same press. · Declare a new interface. For example, createDuelKeyboard(target, opts?: { intercept?(code: string): boolean }) calls intercept on a non-repeat keydown before PRESS_CODES and drops the press when it returns true. duelMode and onlineDuel pass a function backed by the UI store (new dep, e.g. `contact: ContactKeys` from the actions). It handles KeyT (toggle) and Escape (cancel aim, then close) only while the window is shown, and returns false otherwise. Add input.ts tests: an intercepted Escape adds no pause edge, and a released intercept gives one.

### [P1] R1-F2 Esc is taken by a window that may be invisible: the console is hidden while paused, but the window state is never cleared on pause
The scene sets `console: null` whenever the duel is paused for any reason (user, blur, suspend, the partner's pause online), under any banner, or once the duel is decided. The spec closes the window only on the SHIP tab, the duel ending, ✕, Esc, T, a click or the ship dying. Take a duel paused by blur, or by the partner online, with `contact` still set. Esc is 'taken by the window', so it cancels or closes a window nobody can see, and the player cannot resume. Online, Esc on a paused publication normally sends setPaused(false). · spec L28, L31, L92; scene.ts:L66-L70 (consoleHidden: !running, banner, layerPaused, outcome), L110, L133; onlineDuel.ts:L62-L70 (Esc on paused/running sends setPaused), L204-L209 · This clashes with Esc pause/resume in ordinary play, in both single player and online. · Define 'shown' as contact !== null && duel.console !== null && duel.console.station is 'helm' or 'weapons'. Esc and T are taken only while it is shown. Clear `contact` (and the aim) whenever the console becomes null or SHIP: pause of any kind, end card, decided round, new round epoch. Add tests: with the window open, a blur or partner pause hides it, and the next Esc resumes.

### [P1] R1-F3 The data path for the contact model is unspecified: React has no tactical state, the scene cannot read the store
contactModel needs the tactical state, the crew slot, the station, the window state and the blink time. The React layer only receives DuelUiView: readout, banners, overlay, crt and ConsoleView. That view has no enemy rooms, shields, hull, target or active flag. The scene, which has the state, only holds a write-only DuelSink, so it cannot read `contact` from the store. The spec says neither who calls contactModel nor how its output reaches ContactWindow. The hover point is the same problem: an input to the model means either a store write per pointermove fed back to the scene, or React computing it locally. · spec L76-L85; views.ts:L11-L13 (DuelUiView fields); consoleModel.ts:L15-L24 (ConsoleView has no enemy data); scene.ts:L84, L133-L140 (options.ui.frame is the only UI channel); sinks.ts:L9-L24 (Sink has frame/clear only) · Two implementers would build this differently: a new DuelUiView field filled by the scene, or a raw state slice pushed to React. The latter would also re-render each frame, since the sink skips writes only for deep-equal views. · State it explicitly. (1) The scene gets a new read dep `contact(): ContactState | null` (from the store). It calls contactModel with performance.now()/1000 and writes the result to a new optional `DuelUiView.contact?: ContactView | null`. (2) The hover point and the room pick are computed in React from ContactView's room polygons with pointInPolygon. So the hover lives in component state and is not a model input or a store field. Alternatively, make the model's hover input an explicit store field and accept the writes.

### [P1] R1-F4 The map left-click has no consumer: the pointer sample is drained inside the runtime and the online source, not where pickShip can run
The spec adds a left-click sample to PointerSample and says a map click 'calls pickShip'. But PointerSource.sample() is called and consumed inside runtime.frame (single player) and inside source.frame (online, and only when focused and not blocked). pickShip needs the current camera and interpolated ship positions, which live in the scene's inputs. The spec names no step that takes the click from the runtime, hit-tests it, and opens the window in the UI store. Nor does it say when the click is dropped (paused, console hidden, online unfocused). · spec L22-L24, L83, L86; input.ts:L109-L116 (PointerSample has no click), L143-L146 (pointerdown only records position and starts right/middle drag); duelMode.ts:L52; runtime.ts:L137, L380-L385 (pointer sampled and consumed by the runtime); onlineDuel.ts:L262 (pointer.sample() or null) · The plan cannot assign this to a subagent without inventing the path, and the solo and online paths would likely differ. · Declare the path. For example: PointerSample gains `click: { x: number; y: number } | null` (the last button-0 pointerdown on the canvas, cleared by sample and clear). Both runtimes expose it to the scene through a new DuelViewSource method `takeClick()`. The scene runs pickShip on the frame's camera, prev and alpha only when the console is shown with station helm or weapons, and calls a new store action (e.g. `actions.contact.click(slot | null)`). A click with no hit does nothing. Test this in a scene or runtime test, not in the component test.

### [P1] R1-F5 The enemy damage table is not shareable today; it is inline in the Pixi closure
The spec says the window uses 'the same enemy damage table and blink as tacticalLayer.ts drawShip', but that table is local code inside createTacticalLayer's drawShip, which imports Pixi. There is no pure, exported function to reuse. Unless the spec declares the extraction, the plan will copy the table into contactModel, and the unit test 'match the map's table' would only compare two copies. · spec L53, L101; tacticalLayer.ts:L109-L145 (fill/stroke/hatch decided inline per crew/level/phase), L144 (hatch via hatchSegments); hullModel.ts:L1-L3 (pure, no table) · An interface the spec relies on does not exist and is not declared new. Copies drift, which breaks 'the window and the map always agree'. · Declare a new pure export, e.g. `roomLook(crew: boolean, level: number, phase: 0 | 1): { fill: number | null; stroke: number; hatch: number | null }` in crtTheme.ts or hullModel.ts. Refactor drawShip to call it, with pixels unchanged and covered by the existing layer tests. contactModel uses it with phase = blink(t, DAMAGE_BLINK_HZ). Hatch lines come from dashModel.hatchSegments on the window-space polygon.

### [P1] R1-F6 Window placement wording contradicts itself and the layout test
§4 puts the window 'over the right part of the map area, inside the console reserve (CONSOLE_RESERVE), under the side column'. CONSOLE_RESERVE is a pair of margins (left = status table edge, right = 156 px for the side column), not a rectangle. 'Under the side column' inside that reserve is a strip 156 px wide (x ≥ 1124, SIDE.x = 1136). The layout test then requires the window to 'lie inside the map area', the area between the reserves. Both cannot be true. 'Overlaps no console element' does not list the elements. Missing are the console scale bar at the bottom right, the top-centre ENEMY BRG info line, the banners and the off-screen arrows kept inside reserveRight. · spec L40, L116; consoleLayout.ts:L10-L14 (STATION, SIDE x=1136 y=42 w=132, CONSOLE_RESERVE {left,right}); SideColumn.tsx:L18 (panel h=96, so y 42-138); MapOverlay.tsx:L30 (console scale bar right-anchored at INTERNAL_W-16); weaponsModel.ts:L81 (info centred between reserves at y=12); tacticalModel.ts:L295 (arrows clamp inside reserveRight) · Two implementers would place it differently, and the acceptance test cannot be written until the rectangle and the list of elements are defined. · Fix the rectangle in the spec as a new export `CONTACT` in consoleLayout.ts, e.g. right edge at INTERNAL_W - EDGE, top at SIDE.y + 96 + EDGE, explicit w and h, bottom above the scale bar row. Define 'console elements' as TABS, STATUS, STATION (both heights), SIDE, the scale bar row, the info line and the screen centre ± the crew ship's drawn radius at max zoom. Say whether the map's reserveRight grows while the window is open so off-screen arrows are not hidden under it.

### [P2] R1-F7 Window pointer handling: Stage is pointer-events none, and 'right-click anywhere' has no channel on the map
Overlays sit in a Stage with pointer-events none, and only Buttons set auto. A click on a Panel or label falls through to the canvas, so 'clicks on the window are consumed' holds only if the window's root sets pointer-events auto, which the spec doesn't say. Once it does, the canvas gets no pointermove or wheel over the window: zoom stops, right-drag can't start there, and the canvas contextmenu handler no longer applies. Separately, §5.5 cancels the aim on 'right-click anywhere', but §6 leaves right/middle drag unchanged and adds only a left-click sample. A right-click on the map reaches only the canvas drag code. · spec L35, L70, L86; Stage.tsx:L7 (pointerEvents none); Button.tsx:L2-L3, L57-L58 (only buttons auto; contextmenu prevented); input.ts:L143-L146, L153 (right button starts drag; contextmenu prevented on canvas only) · Without pointer-events auto, map clicks pass through the window body. With it, 'right-click anywhere' is ambiguous: window only, or the map too (a camera drag start also disarming). · State that the window root is pointer-events auto, prevents contextmenu, mousedown and auxclick like Button, and swallows wheel. Pick one: right-click on the window cancels, or a right pointerdown anywhere cancels. If anywhere, add `rightDown` to the click sample in the previous finding and say a camera drag also disarms.

### [P2] R1-F8 The blink clock is unnamed; React's CRT clock and the map's clock are out of phase
The map blinks on performance.now()/1000. CrtContext.now is Date.now()/1000, stepped every 125 ms. blink() is floor(t*2*hz)%2, so the two clocks give different phases and the window's level-2 rooms would not blink in step with the map's. The spec only says 'the time used for blinks'. · spec L53, L76; scene.ts:L130 (layer.draw(..., performance.now() / 1000)); CrtContext.tsx:L12, L21-L22; useNow.ts:L6, L11 (Date.now()); crtTheme.ts:L17-L19 · 'The window and the map always agree' would be false on screen, and the 'both blink phases' screenshot check would catch it. · Say the scene computes the room looks with the same performance.now()/1000 it passes to layer.draw, and ships the resolved fill, stroke and hatch in ContactView. React then draws colours and does no blinking itself.

### [P2] R1-F9 The map prints no ship slot label, so the title row's 'same label the map prints' is undefined
The tactical map prints no per-ship slot label. It prints only the arrow label `ENEMY <distance>`, the lock label `LOCK <room>` and the `ENEMY BRG … RNG …` info line. · spec L44; tacticalModel.ts:L209, L298 (ARROW_NAMES, arrow label); weaponsModel.ts:L70, L81; tacticalLayer.ts:L270-L273 (only lockText and info texts) · Implementers would invent different labels, and the component test cannot assert one. · Name the text, e.g. 'SLOT 1', or reuse ARROW_NAMES.enemy ('ENEMY'). Drop 'the same label the map prints'.

### [P2] R1-F10 A station change from Weapons to Helm (Tab in single player) leaves the aim state undefined
In single player, Tab takes the other character, so the station can go from weapons to helm with the window open. Helm 'cannot aim', but the spec disarms only on Esc, right-click, LASER, close or SHIP. An armed aim on Helm would keep the hidden cursor and reticle over the drawing, and a room click there 'does nothing'. · spec L31, L60, L64-L70, L92; consoleModel.ts:L36 (single-player 'switch' tab); duelMode.ts:L44 (consoleChange clears UI holds on a station change) · Helm could end up with a reticle and no aim, and two implementers would handle it differently. · Add: any station change disarms the aim, and the window stays open for weapons↔helm. Hook it to the same station-change edge consoleChange uses. Add a component test.

### [P2] R1-F11 Several 'component' tests exercise app-layer behaviour a .tsx component test cannot reach
These tests sit in tests/contactWindow.test.tsx: 'a map click on the enemy opens the window', 'T toggles it' and 'with the window closed, Esc still pauses'. The canvas pointer source, the runtime's pause count and the online leave-prompt path don't exist in a React component render, so those cases can't run there. · spec L107-L115; input.ts:L134-L169 (canvas pointer source); runtime.ts:L137 (pause consumed in runtime); onlineDuel.ts:L204-L209 · Either the acceptance criteria get quietly weakened, or the plan writes integration harnesses it hasn't scoped. · Split the tests. input.ts: the intercept swallows Escape and KeyT only while shown. Scene or runtime: a click sample plus pickShip opens the window. onlineDuel: leavePromptKeys and setPaused are unchanged with the window closed, and Esc while it is shown sends nothing. Keep the window-only cases (arm, pick → lock(1), cancel, Helm, SHIP tab) in the component test.

### [P3] R1-F12 The hit radius is not quite the cull radius it claims to match
The spec says the hit radius is 'the same radius the map uses to cull it, SHIP_RADIUS*1.9*drawnScale(z) on screen'. The cull radius is max(2*SHIP_RADIUS, 1.9*SHIP_RADIUS*drawnScale(z)/z) world units, i.e. max(2*SHIP_RADIUS*z, 1.9*SHIP_RADIUS*drawnScale(z)) px. pickShip also has to skip the crew slot and inactive slots, which the spec leaves implicit. · spec L23, L83; tacticalModel.ts:L272; state.ts:L100 (CREW_SLOT) · Minor, but the unit test's 'within the drawn radius' boundary depends on which formula is meant. · Write the formula exactly (keep the 16 px minimum) and add 'slots other than CREW_SLOT with ships[i].active only'.

## Verified
- actions.console.lock(room) exists and forwards to the duel keyboard's lockTo (actions.ts:L42-L51, input.ts:L87). Both runtimes turn it into a laserLock command only when seated at Weapons (runtime.ts:L327-L341, onlineDuel.ts:L184). So 'Helm cannot aim' is already enforced at the command level, and no sim change is needed.
- systems[CREW_SLOT].target, .lock, .rooms, .shields and .hull exist in sim state (state.ts:L36-L52, L100, L143), and classOf gives the class's layers (state.ts:L150). They are reachable from the scene, but not from the React views (views.ts:L11-L13).
- hullModel.ts is pure and exports HULLS, hullFor(false) === 'scout', roomCentre and pointInPolygon (hullModel.ts:L41-L62). The room polygons and outline can be reused directly in SVG.
- React buttons and the canvas do not double-handle: the Stage is pointer-events none (Stage.tsx:L7), and Buttons set auto and preventDefault (Button.tsx:L40-L58). The pointer source listens on the canvas only (duelMode.ts:L45), so a click on a pointer-events-auto element never reaches it.
- CrtScreen inherits pointer-events none from the Stage (CrtScreen.tsx:L1-L3), and CrtGlow is a plain div with only a CSS filter (CrtContext.tsx:L28-L32). A child with pointer-events auto and cursor none inside CrtGlow will get events and hide the cursor under the scanline overlay.
- KeyT is unbound today (input.ts:L8-L11; no other KeyT reference under src/renderer/src).
- WEAP/SHLD/ENG labels: the WeaponsStation LOCKS are ['WEAP','SHLD','ENG'] (WeaponsStation.tsx:L18), and rooms[1] is Shields (hullModel.ts:L6), so 'SHLD room calls lock(1)' is consistent.
- The fixed decisions hold: laser only, lock-only aim through the existing command, Helm view-only, CRT ramp, no sim change. The spec contains no violation of them.

## Not verified
- I read the spec from the working tree, not from commit a8b6ff73, because I had no git access. HEAD c1d87177 is a refine-brief commit, so the spec text is presumably the same.
- I did not read the CRT map and Artemis consoles specs in full; I took the colour roles and click routing from the code instead.
- I did not check how the UI test harness renders the duel region (tests/ layout and existing component test helpers), so whether a canvas-level test is feasible is unchecked.
- I did not check the .art/shots harness or docs/gates.md for the screenshot and gate steps.
- Electron's default context menu behaviour over a pointer-events-auto overlay was not checked.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `a8b6ff73`. 12 accepted, 0 rejected, 0 deferred. Each claim was checked against the cited code (input.ts, scene.ts, sinks.ts, views.ts, consoleLayout.ts, actions.ts, Stage.tsx, duelMode.ts) before fixing; sections 3-8 of the spec were rewritten.

## R1-F1 [P1]: T and Esc cannot go through createDuelKeyboard().ui; that object only carries React clicks into the keyboard

Confirmed against the cited code. §6.2: new createDuelKeyboard opts.intercept(code) consulted before PRESS_CODES; both modes pass it; tests in input.test

## R1-F2 [P1]: Esc is taken by a window that may be invisible: the console is hidden while paused, but the window state is never cleared on pause

Confirmed against the cited code. §3 defines shown (contact set, console non-null, helm/weapons); sync clears contact whenever hidden (any pause, banner, end, decided, SHIP, new epoch); Esc only taken while shown

## R1-F3 [P1]: The data path for the contact model is unspecified: React has no tactical state, the scene cannot read the store

Confirmed against the cited code. §6.4-6.5: scene owns a ContactController option, builds contactModel and ships DuelUiView.contact; hover computed in React from view polygons

## R1-F4 [P1]: The map left-click has no consumer: the pointer sample is drained inside the runtime and the online source, not where pickShip can run

Confirmed against the cited code. §6.2: pointer source takeClick() separate from sample(); scene option takeClick; scene runs pickShip on the frame's camera and calls controller.click; online drops while unfocused/blocked

## R1-F5 [P1]: The enemy damage table is not shareable today; it is inline in the Pixi closure

Confirmed against the cited code. §6.3: new pure roomLook(crew, level, phase) export in crtTheme.ts; drawShip refactored to call it; crtColours test pins the table

## R1-F6 [P1]: Window placement wording contradicts itself and the layout test

Confirmed against the cited code. §4.1: new CONTACT export (968,150,300x360) and SIDE_H; reserveRight grows to 324 while shown; layout test lists the elements

## R1-F7 [P2]: Window pointer handling: Stage is pointer-events none, and 'right-click anywhere' has no channel on the map

Confirmed against the cited code. §6.6: window root pointer-events auto, prevents contextmenu/mousedown/auxclick, swallows wheel; §5 cancel is right-click on the window only, map right-click keeps the drag

## R1-F8 [P2]: The blink clock is unnamed; React's CRT clock and the map's clock are out of phase

Confirmed against the cited code. §6.4: t is the scene's performance.now()/1000 passed to layer.draw; view ships resolved colours, React does not blink

## R1-F9 [P2]: The map prints no ship slot label, so the title row's 'same label the map prints' is undefined

Confirmed against the cited code. §4.2 title row is ENEMY SHIP plus close; slot-label wording dropped

## R1-F10 [P2]: A station change from Weapons to Helm (Tab in single player) leaves the aim state undefined

Confirmed against the cited code. §3 Station change: any station change disarms, window stays open; via sync's station edge; controller test

## R1-F11 [P2]: Several 'component' tests exercise app-layer behaviour a .tsx component test cannot reach

Confirmed against the cited code. §8 split: controller, model, tacticalModel pickShip, crtColours, input, scene, online and component tests

## R1-F12 [P3]: The hit radius is not quite the cull radius it claims to match

Confirmed against the cited code. §3 hit radius max(16, 2*SHIP_RADIUS*z, 1.9*SHIP_RADIUS*drawnScale(z)), non-crew active slots only, nearest wins

## Also changed

- Sections 4.2 (drawing box 276x200, 8 px padding), 6.1 controller method table and 6.6 actions are new detail needed by the fixes.

## Files changed

- docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md

<!-- end -->

---

