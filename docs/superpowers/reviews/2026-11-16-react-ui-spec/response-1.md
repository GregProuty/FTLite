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
