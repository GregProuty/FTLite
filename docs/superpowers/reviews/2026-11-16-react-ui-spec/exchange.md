# Codex review exchange: react-ui-spec

Subject: `docs/superpowers/specs/2026-11-16-react-ui-layer-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 1fd401d, effort high, 407 s, 1491262 in / 1363729 cached / 35603 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 §4's crisp-font claim is false for several text sizes and for scale < 1, so §8's visual criterion cannot pass at its own check sizes
Spec L151-152 says that at snapped scales of 1 and above the DOM font size is a multiple of 16 px, so m5x7's outlines fall on the pixel grid. That holds only for FONT_SIZE (32 px) text. It fails for TITLE_SCALE text (48 × 1.5 = 72 px), for FONT_NATIVE text (16 × 1.5 = 24 px, used by the readout and feel help lines), and for the duel's 1.5 × FONT_SIZE pause banner (48 × 1.5 = 72 px). Scale is also below 1 in ordinary play: computeLetterbox returns the unsnapped `fit` whenever the strip takes height from a 720 px window. Pixi draws every size from a 16 px bitmap atlas with nearest scaling, so its edges stay hard. A DOM TrueType font at 24, 72 or 30.4 px is anti-aliased on half pixels. The spec also assumes devicePixelRatio 1. The renderer never sets a Pixi `resolution`, and whole CSS pixels are not whole device pixels at Windows 125% or 150% scaling. · spec L145-154, L225-228; theme.ts:L22-24 (FONT_NATIVE 16, TEXT_SCALE 2, TITLE_SCALE 3); letterbox.ts:L5 (`fit < 1 ? fit : floor(fit*2)/2`); assets.ts:L34 (BitmapFont.install at 16 px, resolution 1, nearest); readoutPanel.ts:L24 and feelPanel.ts:L29 (FONT_NATIVE help lines); duelMode.ts:L43 (FONT_SIZE * 1.5); renderer.ts:L38 (no resolution/autoDensity); no devicePixelRatio use anywhere in src/renderer/src · The parity promise and the '≤1 px text difference' acceptance check (L226-227) will fail on the 1920×1080 screenshots, where scale is 1.5 and titles and help lines blur, and on the 1280×720 screenshots in an online session, where scale is below 1. An implementer has no rule for what to do instead. · State the real rule. Either (a) render m5x7 text as pre-rasterised glyphs (the BitmapFont atlas page or a sprite sheet via the image cache), positioned and scaled with `image-rendering: pixelated`, so the DOM matches nearest scaling; or (b) accept anti-aliased text at non-multiple sizes and scale < 1, and rewrite the visual criterion to say which screens and sizes must be pixel-identical and which are allowed to differ. Say how DPR ≠ 1 is handled, for example by rounding with `scale × devicePixelRatio` and dividing back, or by declaring DPR 1 an assumption that the visual check records.

### [P1] R1-F2 Tactical pause banner: the spec misplaces it and gives it no data path, and flight mode loses its banner
Spec L191-192 says the tactical view's pause is shown by the same PauseBanner, 'placed where the layer draws it today (centred over the play area left of READOUT_COLUMN)'. The layer actually draws it at (w/2, h/2 − 80) of the full 1280×720 viewport. The position (INTERNAL_W − READOUT_COLUMN)/2, y 80 belongs to duelMode's interior banner, so the two banners sit in different places today. Also, `duelSink.paused` receives `userPaused && view === 'interior' ? text : null` (L190), which is always null in the tactical views, so the tactical paused state has no route to the store. The flight dev view also uses the layer's banner (`paused: runtime.reasons().has('user')`), but `flightSink` has only `feel(rows)` (L59, L196). Deleting the layer's banner removes flight's pause indicator. · spec L59, L120, L188-196; tacticalLayer.ts:L60-62 (banner at w/2, h/2-80), L223 (banner.visible = o.paused); duelMode.ts:L44 (interior banner at (INTERNAL_W-READOUT_COLUMN)/2, 80), L91 (paused: userPaused), L95; flightMode.ts:L59 (paused passed to tacticalModel) · Two implementers would place the banner differently and would invent different sink signatures. As written, the duel's Helm/Weapons pause and the flight pause banner would disappear. · Specify `duelSink.paused({ text, view })` or two fields, `interiorBanner` and `tacticalBanner`, each with its exact position (interior: ((INTERNAL_W−READOUT_COLUMN)/2, 80), anchor 0.5/0.5; tactical: (INTERNAL_W/2, INTERNAL_H/2−80), anchor 0.5/0.5). Add `flightSink.paused(text|null)`. Or keep both positions and give PauseBanner a `placement` prop.

### [P1] R1-F3 Where `data-testid="session-menu"` goes is unspecified, and the smokes' reserved-viewport assertion depends on it
The online smokes assert `canvas.top >= menu.bottom`, where `menu` is the element carrying `[data-testid="session-menu"]`. Today that element is the menu root itself: a full-screen overlay when not playing and only the strip while playing. The spec mounts one `#ui` element over the canvas, holding the menu, the strip and the Stage/HUD (L46, L67, L168). It says only that testids keep the 'same element role' (L35-36). If an implementer puts `session-menu` on `#ui`, `<UiRoot>` or a `<Menu>` wrapper that spans the stage, then `menu.bottom` reaches the window bottom and the assertion fails. · spec L35-36, L46, L67, L168-169; online-app-smoke.cjs:L187 (layout reads session-menu rect); online-app-smoke.ts:L84 and online-recovery-smoke.ts:L114 (`r.canvas.top >= r.menu.bottom`); sessionMenu.ts:L35 (root testid), L58-60 (root is the strip while playing) · A natural React structure breaks two Electron smokes, and decision 7 says they must pass unchanged. · State that `data-testid="session-menu"` and `aria-label="FTLite session menu"` sit on the element that is the full-screen menu overlay when not playing and exactly the strip while playing. Neither `#ui` nor the Stage may carry it. Add a jsdom test that while playing the testid element contains only the strip.

### [P1] R1-F4 The import guard forbids sim constants that the HUD port needs
§8 forbids any `src/renderer/src/ui/**` file from importing a non-type symbol from `sim/`, and decision 6 says components never import sim modules. Yet §7 ports hud.ts's rules line for line, and hud.ts reads runtime constants straight from sim: `STATION_NAMES` (line 2 of a seated player's block), and `STATION_MAX`, `UPGRADE_MAX` and `STATION_OVERDRIVE` (MAX_CELLS, which sets the heat-strip width). HudModel carries neither the station display name nor the cell count, so `<Cells>` and the player block cannot be built under the guard. The existing walker in boundary.test.ts also collects only `.ts` files, so a guard built the same way would skip every `.tsx` component. · spec L32-33, L202-204, L223-224; hud.ts:L9-10 (imports from ../sim/stationKinds, ../sim/tuning), L29 (MAX_CELLS), L52 (heat strip width), L182 (STATION_NAMES[p.seated]); hudModel.ts:L134-147 (no names or maxCells); boundary.test.ts:L9 (`p.endsWith('.ts')`) · The UI-iii plan task fails one way or the other: the guard test is red, or the implementer quietly re-exports sim constants through render/ to get around it. Either way the boundary the spec promises does not hold. · Have `buildHudModel` (or a `hudView` helper in render/) supply `seatedName` and `maxCells`, and have the UI read only the model. Say so in §7. Have the guard walk `.ts` and `.tsx` and name the exact rule (direct imports only, `import type` allowed).

### [P1] R1-F5 §9 understates H-2a-iii's rework: its new duel scene and online duel are built on the Pixi views UI-ii deletes
§9 says only H-2a-iii's menu tasks plus the end-card text and the leave prompt are rewritten. But H-2a-iii adds `app/duel/scene.ts`, a `createDuelScene` that imports `createReadoutPanel`, `createEndScreen` and the tactical layer's `pauseText`, and builds its own Pixi `BitmapText` pause banner and a new `notice` banner ('YOU: HELM', at y 130). It also replaces duelMode.ts wholesale and adds `onlineDuel.ts`, which creates a scene inside the online router factory. After UI-ii, all of that has to be rewritten onto sinks: the notice needs a sink and a React component, and the online duel needs a duelSink passed through the router. §3 adds a further contradiction: the table heading says each file is deleted (L113), while the endScreen row says `endModel` stays (L119), and H-2a-iii edits `endModel` in `render/duel/endScreen.ts`. (H-2a-i and H-2a-ii touch none of these files, so the 'path touch-ups' claim for them is fine.) · spec L113, L119, L235-239; helm-h2a-iii-online-app.md:L10, L1647-1656 (scene.ts, SceneOverlay {banner, layerPaused, end, notice}), L2220-2272 (createReadoutPanel, createEndScreen, BitmapText banner and notice), L2315 ('Replace the whole of duelMode.ts'), L2727 (onlineDuel's createDuelScene); grep of the h2a-i and h2a-ii plans finds only network-side duelMode · The sequencing claim that UI-ii lands first and H-2a needs little change is what lets UI-ii go before H-2a. As written, H-2a-iii's largest task would be built against deleted modules, and the notice banner has no React home. · In §6, add `duelSink.notice(text|null)` and its placement, and say how the online duel gets a duelSink (a router factory dependency). In §9, list H-2a-iii's scene.ts, duelMode.ts and onlineDuel.ts tasks as rewritten onto sinks. Say where `endModel`/`EndView` live after UI-ii: keep `endScreen.ts` holding only the model, or move it to `endModel.ts`.

### [P1] R1-F6 UiRoot's mounting rule, slice resets and the dev views are unspecified
L46 shows `<UiRoot> → <Menu> | <Hud> | <DuelUi>`, but the menu must also show during `screen: 'online'` (session page, strip), so it is not a switch on `app.screen`, and no rule says when Hud or DuelUi mount. No sink is cleared on dispose. Today duelMode hides the Pixi HUD and restores it on dispose, and the duel's Pixi root is destroyed on dispose. With store slices, a stale `hud` model would show over Single player (and over the next online session before its first frame), and a stale `duel` slice would leave the readout and end card visible after M returns to the menu. The `?mode=duel`/`?mode=flight` dev views (L197-198) currently create no store, sinks or layout writes: `startDuel`/`startFlight` call only `renderer.resize`. 'screen is fixed' does not say to what value, and does not say the resize must write the `layout` slice. · spec L46, L75, L83-87, L197-198; duelMode.ts:L36-37, L112-113 (hides then restores stage children, destroys root); main.ts:L99-116 (dev views: resize only, no menu); onlineSession.ts:L94-104 (frame returns early before a descriptor, so the HUD keeps its last model) · Startup, Single player after Multiplayer, and return-to-menu are ordinary paths. Two implementers would gate differently, and the obvious build leaks stale panels between modes. · Give the exact render rule, for example: Menu always; Hud when `screen==='online' && hud && duel===null`; DuelUi when `duel !== null`; FeelPanel when `flight !== null`. Require each sink to expose `clear()`, called from the session or mode dispose (the router's `home()`/`selectSingle()`). For the dev views, specify `screen: 'single'`, `mountUi` with no actions, and `layout` written by their resize.

### [P1] R1-F7 The tactical layer's screen-space zoom, scale and snap-back texts are missing from the inventory
The scope covers everything drawn in screen space (decision 3; the owner asked for all UI items). tacticalLayer draws three texts in viewport coordinates, not world coordinates: `zoomText` (16, h−64), the scale-bar label (beside the bar at h−28), and the 'C: SNAP BACK' hint (w/2, h−12). The scale bar's Graphics is drawn there too. §3 neither moves them nor lists them under 'Stays in Pixi', which mentions only the tactical view's 'in-world labels'. · spec L25, L113-136, L257; tacticalLayer.ts:L60-61 (zoomText, scaleText, hint positions), L217-222 (scale bar, zoom and hint text set per frame from o.overlay) · An implementer cannot tell whether UI-ii should move them, and the inventory the owner asked for is incomplete. · Add a row to §3. Either move `overlay.zoomText`, the scale label and the snap hint into a `<MapOverlay>` in UI-ii (the scale-bar line can go with it as a `<Box>`), or list them under 'Stays in Pixi' with the reason, for example that they share the layer's shake and its per-frame model.

### [P2] R1-F8 setStatus is not one atomic store action, and the 'Settings is not re-rendered' rule cannot move line for line
§2 says the bridge's `onStatus` writes `online.status` (L78), while §5 says `setStatus` becomes a store action (L179). In sessionMenu, setStatus also changes `page`, `hadView`, `recovering` and `leaving` from the same push. With separate writes, React can commit the new status with the old page. Separately, on Settings a non-idle push sets `page = 'session'` but skips render(), so today the user stays on Settings until the next push. In React, a page change is a render, so the session page appears at once. The spec must pick one behaviour. `useNow(1000)` also changes the countdown and receipt-age text from per-frame writes to a free-running 1 s interval, which can lag the true second by up to 1 s. · spec L76-80, L99-100, L173-176, L179; sessionMenu.ts:L177 (setStatus: page/hadView/recovering/leaving plus the Settings skip), L183 (frame() writes per frame); main.ts:L79 · Two implementers would build the status path differently, and one of them gives a visible frame of inconsistent menu state. · Specify that `onStatus` calls a single `actions.setStatus(next)` that performs one `setState` with status, receivedAt and every menu transition. Decide explicitly whether Settings defers the switch to session (keep a `deferredPage`) or switches at once, and port the test to match. Align `useNow` to the next second boundary (setTimeout to `1000 − now % 1000`) and port the countdown test with fake timers.

### [P2] R1-F9 `<Row parts>` layout and measured widths are not pinned, so pixel placement will diverge
hud.ts lays row parts out by measured BitmapText width (`x += ceil(t.width) + gap`), sizes the summary backdrop from measured widths, and centres the banner glyph row by its container width. The spec says only that `theme.rowPx` 'stays its width model' (L205-206). It does not say whether parts are absolutely placed at `round(x × scale)` from `textPx`, which keeps edges whole, or flowed with flex and `gap`, which accumulates fractional widths at scale 1.5 and below 1. It also does not say whether the DOM's kerning and ligatures are turned off so DOM advances equal the hmtx table in theme.ts. · spec L145-148, L205-206; hud.ts:L73 (ceil(t.width)), L274 (bannerGlyphs centred by width), L277-281 (summary width from measured text); theme.ts:L30-51 (ADVANCE, textPx, rowPx) · Two implementers get different glyph and text positions, and with flex layout §4's 'whole pixels' rule fails. · State that `<Row>` positions each part absolutely at internal x computed with `textPx`/`ROW_GLYPH`/`ROW_GAP`, rounded once by `<Box>`. State that `<Text>` sets `font-kerning: none; font-variant-ligatures: none; white-space: pre`. State that the summary and banner-glyph widths use `textPx`/`rowPx`, not DOM measurement.

### [P2] R1-F10 No rule for zustand 5 selector stability; the HUD root changes identity every frame
`tick` changes every frame, so `s.hud` gets a new identity every frame even after `replaceEqualDeep`. Panels that need several top-level fields, such as the clock card (hull, run, simSeconds, director, quirk), the banner (phase, message, players) or the power panel (power, stations, tick, calloutFlash), would naturally be written as `s => ({ ... })`. In zustand 5 a selector that returns a fresh object makes `useSyncExternalStore` loop ('getSnapshot should be cached'). The spec names only `s.hud?.players[i]`-style selectors and never states the rule. · spec L89-93; hudModel.ts:L137-146 (tick, simSeconds, calloutFlash at the root); hud.ts:L258, L262-266 (clock and power read many root fields; flash derives from tick) · This is an easy runtime failure to hit in UI-iii. Without a rule, the 1.5 ms budget and correctness depend on each implementer's habits. · Add a rule: selectors return a store reference or a primitive. Multi-field picks use `useShallow` from `zustand/react/shallow`. Tick-derived values (the callout flash) are selected as primitives (`s => Math.floor(s.hud.tick/10)%2`). Add a dev-mode test that renders each panel twice with an unchanged model and asserts zero re-renders.

### [P2] R1-F11 How the strip height reaches the canvas is unspecified, and the inputBlocked subscription leaves out dispose
Today a ResizeObserver on the menu root calls `resize()` directly, and `reservedHeight()` returns 0 whenever the strip is not shown. The spec has the ResizeObserver write `layout.stripHeight` (L168-169) but does not say what calls main.ts's resize when it changes. It also does not say the value returns to 0 when the strip unmounts, and a ResizeObserver does not report for an element that has been removed. The canvas would stay shifted down after Leave. The inputBlocked subscription (L102-104) also omits today's dispose behaviour, `deps.inputBlocked(true)` on dispose, and does not say that the listener fires on every per-frame HUD setState (harmless only because `setInputBlocked` and the reset are guarded by a value comparison). · spec L82, L102-104, L168-169; main.ts:L71 (reset only on change), L81-88 (RO → resize; reservedHeight), L96 (dispose order); sessionMenu.ts:L176 (0 unless playing), L184 (dispose → inputBlocked(true)); onlineSession.ts:L92 (idempotent) · The smokes' reserved-viewport check runs on this path. A stale `stripHeight` leaves a dead band across the top of the menu and the duel. · Specify: SessionStrip's layout effect writes the measured height on mount and on resize, and writes 0 in its cleanup. main.ts subscribes to `layout.stripHeight` (with an equality check) and calls `resize()`, which computes the letterbox from `innerHeight − stripHeight` and writes scale and offsets back. The inputBlocked listener compares with the previous derived value, and `beforeunload` sets it to true before `session.dispose()`.

### [P2] R1-F12 Failure modes are missing: render errors, and an async or failing image cache
With React 19, an uncaught error in any component unmounts the whole root, so a bad HUD model would also remove the menu strip and its Leave/Pause buttons while the game keeps running. The spec defines no error boundary. Pixi 8's `renderer.extract.base64` is async (Promise<string>), but §4 describes the cache as built synchronously 'after loadAssets', with no await before first render, no timing given, and no fallback if extraction throws. Only the missing-asset case (`featureReady`) is covered. · spec L135-136, L153, L159-163; package.json pixi.js 8.19.0; hud.ts:L19-22 (featureReady/assets.has fallback only) · Startup and ordinary play hit these paths. A blank UI with no way to leave is worse than a missing icon. · Add an error boundary per region (Menu, Hud, DuelUi). On error it logs, keeps the Menu and strip mounted, and hides only the failed region. State that `mountUi` awaits `buildImageCache()` (with per-icon try/catch, where a failure omits the icon) and `document.fonts.load`, and say what is shown if they reject.

## Verified
- Pixi's font loader registers m5x7 as a FontFace: loadFont calls `Assets.load({src, data:{family:'m5x7'}})` (assets.ts:L32-35), which Pixi 8's loadWebFont parser handles with `new FontFace(...)`, `load()` and `document.fonts.add`. The manifest has a `font.m5x7` entry (public/assets/manifest.json:L396). This is from my knowledge of Pixi 8, not from reading node_modules.
- The smokes' native input is compatible with React-controlled inputs: `type` clicks the field, then calls `webContents.insertText`, which fires real input events that onChange sees. `capacity` clicks the select and sends Home/Down/Return keys, which produce a native change event (online-app-smoke.cjs:L192-195). This works as long as the select's value is updated in onChange, or the select is uncontrolled with `defaultValue='2'`.
- The click driver's hit test uses `event.target.closest('[data-testid]')` (online-app-smoke.cjs:L160). A Stage with `pointer-events: none` (spec L166-167) does not intercept it.
- The smokes' text checks against `document.body.innerText` (online-app-smoke.ts:L59, L115, L203; online-recovery-smoke.ts:L266) look for 'Single player', 'You are Player N' and the absence of 'Restored at tick'. HUD and duel strings moving into the DOM are unlikely to collide with these.
- H-2a-i and H-2a-ii do not touch sessionMenu, endScreen, readoutPanel, the app's duelMode.ts or hud.ts. Their `duelMode` hits are the network mode `src/network/modes/duel` (grep of both plans).
- panel.ts is imported by enemyWindow, readoutPanel, endScreen, hud, mapPanel and feelPanel. After UI-ii and UI-iii only enemyWindow remains, which matches the spec's plan to move drawPanel into enemyWindow (L124, L133-134).
- Every file that uses BitmapText (grep) is covered by §3, except tacticalLayer's screen texts (raised as a finding). The interiorView marker labels and enemyWindow's freq/status/problem/title texts are world- or scene-anchored and correctly stay in Pixi.
- online.setInputBlocked is idempotent (onlineSession.ts:L92), and main.ts resets the keyboard only on a change (main.ts:L71), so deriving inputBlocked on every store change is safe as long as the comparison is kept.
- The 'readout no longer shakes' change is real and deliberate: the readout is inside `scene`, which is shaken (duelMode.ts:L45, L98), while the interior banner and end card are outside it (L46).
- React commits from a store update made inside the Pixi ticker are flushed in a microtask before paint, so the canvas and DOM update in the same frame. useSyncExternalStore prevents tearing. This is reasoning from React 18/19 semantics, not a measurement.

## Not verified
- Whether Pixi 8.19's `extract.base64` reads only the frame of a texture cut from a sheet. I believe getPixels reads `texture.frame`, but I did not read node_modules (out of scope).
- Whether Vitest will compile `.tsx` with the automatic JSX runtime without `@vitejs/plugin-react` or `esbuild.jsx` in vitest.config.ts. That depends on how the root tsconfig.json resolves, which is not in the manifest.
- Whether `image-rendering: pixelated` applies to CSS `mask-image` in Chromium 138 (Electron 37), which decides whether tinted glyphs stay crisp when scaled.
- Whether DOM placement of m5x7 matches BitmapText's vertical offset ('caps at +8') at each line height. That needs the font's ascent/descent metrics and a screenshot.
- The 1.5 ms median / 4 ms p95 budget. It cannot be checked without running the app, and I did not run anything.
- tests/mainMenu.test.ts, hudLayout.ts, callouts.ts, sessionRouter.ts, onlineBridge.ts and session.ts L170-187 were not read in full. Nothing in the findings depends on them, beyond what main.ts shows of how they are called.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `7a1213f`. 12 accepted, 0 rejected, 0 deferred; no prior IDs.

## R1-F1 [P1]: §4's crisp-font claim is false for several text sizes and for scale < 1, so §8's visual criterion cannot pass at its own check sizes

Confirmed. theme.ts L22-24 gives FONT_NATIVE 16, TITLE_SCALE 3; letterbox.ts L5 returns unsnapped `fit` below 1; assets.ts L34 installs the BitmapFont at 16 px, nearest. DOM webfont text at 24/72/30.4 px would anti-alias. §4 now draws HUD text with `<PixelText>`: a canvas per text element, glyphs from an atlas rasterised once at 16 px with alpha snapped to 0/255, scaled with `imageSmoothingEnabled = false` — the same rule as BitmapText's nearest scaling, so non-integer glyph scales behave as Pixi does today. `<Box>` and `<PixelText>` round in device pixels using `layout.dpr`. §8's visual criterion now names the scales and what must match. A font fallback is specified.

## R1-F2 [P1]: Tactical pause banner: the spec misplaces it and gives it no data path, and flight mode loses its banner

Confirmed: tacticalLayer.ts L61 places the banner at (w/2, h/2−80); duelMode.ts L44 places the interior one at ((W−READOUT_COLUMN)/2, 80); flightMode.ts L59 passes `paused`. §2 defines `Banners { interior, tactical, notice }`; §6 gives each its exact placement and derivation, and `flightSink.frame` carries banners.

## R1-F3 [P1]: Where `data-testid="session-menu"` goes is unspecified, and the smokes' reserved-viewport assertion depends on it

Confirmed: online-app-smoke.ts L84 asserts `canvas.top >= menu.bottom` on the session-menu rect (online-app-smoke.cjs L187). §5 now pins the testid and aria-label to `<Menu>`'s root, which is the full-screen overlay or exactly the strip, never `#ui` or the stage, with a jsdom test.

## R1-F4 [P1]: The import guard forbids sim constants that the HUD port needs

Confirmed: hud.ts L9-10 imports STATION_NAMES, STATION_MAX, UPGRADE_MAX, STATION_OVERDRIVE; boundary.test.ts L9 walks only `.ts`. §7 adds `HudPlayer.seatedName` and `HudModel.maxCells` to the model; §8's guard walks `.ts` and `.tsx`, checks direct imports, allows `import type` and render/ model and theme modules.

## R1-F5 [P1]: §9 understates H-2a-iii's rework: its new duel scene and online duel are built on the Pixi views UI-ii deletes

Confirmed: the H-2a-iii plan L2223-2269 builds `createDuelScene` from createReadoutPanel, createEndScreen and Pixi banners including `notice`. §9 now lists scene.ts, duelMode.ts and onlineDuel.ts as rebuilt onto `duelSink` with the SceneOverlay→Banners mapping, sink passed through the router's online factory; §3 moves `endModel`/`EndView` to `render/duel/endModel.ts`, removing the "file deleted" contradiction. §6 adds the notice placement.

## R1-F6 [P1]: UiRoot's mounting rule, slice resets and the dev views are unspecified

Confirmed: duelMode.ts L36-37/L112-113 hides and restores the stage; main.ts dev views only resize. §1 now gives the per-region render rule; every sink has `clear()` that its producer calls on dispose (§2, §6, §7); §6 specifies the dev views (store and sinks, `mountUi({ menu: false })`, `screen: 'single'`, layout written by their resize).

## R1-F7 [P1]: The tactical layer's screen-space zoom, scale and snap-back texts are missing from the inventory

Confirmed: tacticalLayer.ts L60-61 and L217-222 draw them in viewport coordinates. §3 adds a row; §6 specifies `MapOverlay` with every position, size and tint; the world-space tactical content is listed explicitly under "Stays in Pixi", and the shake change in §6 now names the overlay too.

## R1-F8 [P2]: setStatus is not one atomic store action, and the 'Settings is not re-rendered' rule cannot move line for line

Confirmed against sessionMenu.ts L177. §2: the bridge calls one `actions.setStatus`, one `setState`. §5: a deliberate, tested change on Settings (`afterSettings`; Back goes there). §2: `useNow` re-arms to each second boundary.

## R1-F9 [P2]: `<Row parts>` layout and measured widths are not pinned, so pixel placement will diverge

Confirmed: hud.ts L73, L274, L277-281. §4 Rows: absolute x from `ROW_GLYPH`, `ceil(textPx)`, `ROW_GAP`; measured widths come from `textPx`/`rowPx`; advances always from theme. Because text is no longer DOM text, kerning and ligatures do not arise.

## R1-F10 [P2]: No rule for zustand 5 selector stability; the HUD root changes identity every frame

Confirmed. §2 adds the selector rule (references or primitives, `useShallow` for multi-field picks, tick-derived primitives); §8 adds a render-count test.

## R1-F11 [P2]: How the strip height reaches the canvas is unspecified, and the inputBlocked subscription leaves out dispose

Confirmed against main.ts L81-88 and sessionMenu.ts L176, L184. §5 specifies the strip's ResizeObserver (height on mount and resize, 0 on cleanup) and main.ts's subscription and resize. §2 specifies inputBlocked's compare-with-last, initial true and true on beforeunload.

## R1-F12 [P2]: Failure modes are missing: render errors, and an async or failing image cache

Confirmed: Pixi 8's extract.base64 returns a Promise. §2 adds per-region error boundaries; §4 has `mountUi` await the font and the image cache, with per-icon try/catch, a Sprite target for sheet frames, and a font fallback.

## Also changed

- §1 diagram and file table updated for `actions.setStatus`, `duelSink.frame`/`flightSink.frame`, `glyphs.ts`, and `ui/duel/Banner`/`MapOverlay`.
- Out of scope now names the duel interior and the tactical world content explicitly, and allows the two model fields of §7.

## Files changed

- docs/superpowers/specs/2026-11-16-react-ui-layer-design.md

<!-- end -->

---

# Round 2 (delta, reviewing 75044f4, effort medium, 112 s, 421921 in / 358488 cached / 8750 out)

Verdict: ready with P2s

## Findings

### [P2] R2-F1 §9's SceneOverlay→Banners mapping drops H-2a-iii's visibility rule and maps a boolean onto a text field
§9 says `banner` maps to `banners.interior` and `layerPaused` to `banners.tactical`. But `layerPaused` is a boolean, and `banners.tactical` is `string | null`. H-2a-iii's scene also shows the interior banner in every view whenever the layer is not paused (`view === 'interior' || !overlay.layerPaused`). The online duel uses this to show its host-pause or disconnect banner over the map views too. §6 defines `banners.interior` as non-null only when `view === 'interior'`. An implementer who copies §6's rule into the scene would hide the online banner in Helm and Weapons. · spec L355-357 (mapping), L267-268 (interior only in the interior view); helm-h2a-iii-online-app.md:L2288 (`layerPaused: boolean`), L2329 (`banner.visible = overlay.banner !== null && (view === 'interior' || !overlay.layerPaused)`), L2803 (online: `banner: bannerText(), layerPaused: false`) · H-2a-iii's refinement will rebuild the scene from this mapping. As written, it loses the online duel's status banner in the map views, or two implementers will each invent their own condition. · State the mapping exactly: `banners.interior = overlay.banner !== null && (view === 'interior' || !overlay.layerPaused) ? overlay.banner : null`, and `banners.tactical = overlay.layerPaused ? pauseText : null`, where pauseText is the scene's `pauseText` option.

### [P2] R2-F2 The error boundary's reset rule ('until its slice is next cleared') has no meaning for the Menu region
§2 says a failed region renders nothing until its slice is next cleared. Hud, DuelUi and FlightUi each have a slice that their producer clears, but Menu has none. So if Menu throws once, it stays blank for the rest of the run. That also removes the strip's Leave and Pause, which this rule exists to protect. The spec also does not say how a boundary detects that its slice was cleared (for example, by a reset key taken from the slice's null-to-non-null transition). · spec L144-146 (boundary rule, 'so a bad HUD model can never take away the strip's Leave and Pause'); L78 (Menu is gated on the mountUi prop, not on a slice); L92-93 (the menu slice is never cleared) · Menu is the one region whose failure strands the player, and two implementers would reset its boundary differently, or not at all. · Give each boundary a reset key. For Hud, DuelUi and FlightUi, a counter bumped by the sink each time the slice goes from null to non-null. For Menu, `menu.page` together with `online.status?.phase`, so the next page change or status push retries it. Say that Menu's fallback still renders a minimal Leave/Return to menu control, or accept and document that it does not.

### [P3] R2-F3 §3 says SessionDeps.hud keeps its `{ update }` type, but §7 adds `clear()` to it
L183-184 says `SessionDeps.hud` keeps its `{ update(m: HudModel) }` type. §7 adds an optional `clear()` to the same dependency's type, and §1 requires every producer to clear on dispose. · spec L183-184 vs L304-305 and L83 · This is a small contradiction that a UI-iii plan writer has to resolve on their own. · Change L183-184 to read `{ update(m: HudModel); clear?(): void }`.

## Prior findings
- R1-F1: resolved — §4 L196-212 replaces DOM webfont text with <PixelText>, drawn from a 16 px atlas with nearest sampling (BitmapText's rule). It handles non-integer scales as parity, and <Box> rounds in device pixels with dpr (L190-195). §8 L338-344 restates the visual criterion per scale and records dpr.
- R1-F2: resolved — §2 L102 defines Banners {interior, tactical, notice}. §6 L267-275 gives each banner's derivation and placement, and they match duelMode.ts:L44 and tacticalLayer.ts:L61 (viewport is INTERNAL_W×INTERNAL_H per duelMode.ts:L35, flightMode.ts:L25). Flight carries banners (L282-283).
- R1-F3: resolved — §5 L244-247 puts the testid and aria-label on <Menu>'s root: the full-screen overlay, or exactly the strip while playing, never #ui or the stage. A jsdom test is in §8 L319-320. This matches sessionMenu.ts:L58-60.
- R1-F4: resolved — §7 L299-302 adds HudPlayer.seatedName and HudModel.maxCells, built in buildHudModel. §8 L333-337 states the guard exactly: .ts and .tsx, direct imports, `import type` allowed, render/ models and theme allowed.
- R1-F5: resolved — §9 L353-362 lists H-2a-iii's scene.ts, duelMode.ts and onlineDuel.ts as rebuilt onto duelSink, with the sink passed through the router factory. endModel moves to render/duel/endModel.ts (§3 L162), and the notice placement is at L275. A residual gap in the banner mapping is raised as a new P2.
- R1-F6: resolved — §1 L76-84 gives the render rule for each region. Every sink has clear(), called on its producer's dispose (L63, L271, L283, L304). The dev views are specified in §6 L287-289.
- R1-F7: resolved — §3 L164 adds a row, and §6 L276-281 specifies MapOverlay. The positions match tacticalLayer.ts:L61 and L217-222: zoom at (16,h−64), bar at by=h−28 with ±5 ticks, label at (bx+px+8, by−8)=h−36, hint at (w/2,h−12) with anchor 0.5/1 in AMBER. The world-space content is listed under 'Stays' (L172-175).
- R1-F8: resolved — §2 L111-114 makes setStatus a single setState covering every transition in sessionMenu.ts:L177. §5 L239-243 states the Settings change explicitly with afterSettings, and its description of today's behaviour (page becomes 'session' without a render, and the stale Back handler at L85 goes home) is accurate. useNow is aligned to the second boundary (L133-135).
- R1-F9: resolved — §4 L215-217 places rows absolutely from ROW_GLYPH, ceil(textPx) and ROW_GAP, takes widths from textPx/rowPx, and takes advances from theme (L201). With canvas glyph text, kerning cannot arise.
- R1-F10: resolved — §2 L120-127 gives the selector rule (references or primitives, useShallow, tick-derived primitives), and §8 L324 adds the render-count test.
- R1-F11: resolved — §5 L248-253: the strip's ResizeObserver writes the height and writes 0 on cleanup, and main.ts subscribes and calls resize() with innerHeight − stripHeight. §2 L137-140 covers the inputBlocked compare-with-last, its initial true and beforeunload. This matches sessionMenu.ts:L176 and L184.
- R1-F12: resolved — §2 L142-149 adds error boundaries per region and the font/cache fallbacks. §4 L221-227 has mountUi await the extract.base64 cache, with try/catch per icon and Sprite targets. The Menu boundary's reset is raised separately as a new P2.

## Verified
- Today's tactical banner and overlay positions (tacticalLayer.ts:L60-61, L217-223) match the §6 placements at spec L272-281, including the scale label's moved position (bx+px+8, by−8).
- duelMode and flightMode pass viewport {INTERNAL_W, INTERNAL_H} to the layer (duelMode.ts:L35, flightMode.ts:L25), so internal-pixel placements on <Stage> are equivalent.
- §5's description of today's Settings behaviour is accurate: sessionMenu.ts:L177 sets page='session' but skips render on Settings, and the Back handler at L85 sets page='home'.
- reservedHeight returns 0 unless page is session and hadView is set (sessionMenu.ts:L176), and dispose calls inputBlocked(true) (L184). These match spec L137-140 and L248-253.
- H-2a-iii's SceneOverlay shape is {banner, layerPaused, end, notice?} (plan L2288), as §9 cites it.

## Not verified
- Whether alpha-snapping the canvas-rasterised m5x7 atlas reproduces Pixi BitmapFont.install's glyph pixels exactly. That needs a runtime comparison, which the §8 visual check is meant to cover.
- Whether the smoke driver's `insertText` and capacity selection fire the events React-controlled inputs need (spec L236-238). I did not read the driver for this round.
- Whether a zustand 5 / React 19 render-count test can be written as §8 L324 describes. This was not exercised, since tests were not run.

---

# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at the round-1 commit. 3 accepted, 0 rejected, 0 deferred; the reviewer resolved all twelve round-1 findings.

## R2-F1 [P2]: §9's SceneOverlay→Banners mapping drops H-2a-iii's visibility rule and maps a boolean onto a text field

Confirmed: helm-h2a-iii-online-app.md L2288 has `layerPaused: boolean`, and L2329 shows the banner when `view === 'interior' || !overlay.layerPaused`. §9 now gives the exact mapping for `interior`, `tactical` (from the scene's `pauseText`) and `notice`, and says §6's single-player rule is a special case of it.

## R2-F2 [P2]: The error boundary's reset rule ('until its slice is next cleared') has no meaning for the Menu region

Confirmed: the menu slice is never cleared. §2 now gives every boundary a reset key: store `epochs` (added to the slice list) for Hud, DuelUi and FlightUi, and `page|phase` for Menu. Menu's fallback keeps the `session-menu` root and offers Leave or Return to menu.

## R2-F3 [P3]: §3 says SessionDeps.hud keeps its `{ update }` type, but §7 adds `clear()` to it

Confirmed. §3 now states the type as `{ update(m: HudModel): void; clear?(): void }`.

## Also changed

- §2 slice list: `epochs: { hud, duel, flight }`.

## Files changed

- docs/superpowers/specs/2026-11-16-react-ui-layer-design.md

<!-- end -->

---

