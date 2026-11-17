# Codex review exchange: ui-iii-plan

Subject: `docs/superpowers/plans/2026-11-16-ui-iii-react-sector-hud.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 2d4b0da, effort high, 496 s, 4864335 in / 4694788 cached / 46094 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Deleting mapPanel.ts breaks tests/layout.test.ts, and the Task 5 grep cannot find it
Task 5 deletes render/mapPanel.ts, but tests/layout.test.ts imports MAP_W, MAP_H, nodeX and nodeY from it. The grep pattern in Task 5 Step 1 does not match that import, so the breakage is never fixed and Step 2 (typecheck and npm test) fails. · tests/layout.test.ts:L11 `import { MAP_W, MAP_H, nodeX, nodeY } from '../src/renderer/src/render/mapPanel'` (used at L25, L57). Plan L663 greps `renderer.hud\|createHud\|createMapPanel\|render/panel\|from './panel'`. 'render/mapPanel' matches none of these alternatives ('render/panel' is not a substring of 'render/mapPanel'). Plan L138 keeps the re-export only 'until Task 5 deletes it'. Plan L658 lists the deletions but not this test. · Task 5 cannot pass its own Step 2. The spec (§8, spec L339) lists `layout` among the pure model tests that must pass unchanged. · In Task 1, point tests/layout.test.ts at render/mapModel.ts, or have Task 5 do it. Add `mapPanel` to the Task 5 grep, e.g. `renderer.hud\|createHud\|mapPanel\|render/panel\|from './panel'`, and list tests/layout.test.ts under Task 5's Modify files.

### [P1] R1-F2 The CellRow test compares jsdom's style.background to hex strings; CSSOM gives rgb()
The CellRow cases read `(e as HTMLElement).style.background` and expect `hex(BAR_ON)` etc., which are `#rrggbb` strings. CSSOM serialises a specified sRGB colour as `rgb(r, g, b)`, in browsers and in jsdom's cssstyle, so the actual values will be `rgb(111, 212, 78)` and the like. All three `toEqual` colour assertions fail even when CellRow is correct. · Plan L259 `cells = () => [...].map((e) => (e as HTMLElement).style.background)`; L262, L264, L266 `toEqual([hex(BAR_ON), ...])`. ui/stage/color.ts:L3 `hex` returns `#${rgb.toString(16)...}`. Plan L423 sets `style={{ background: hex(fill), ... }}`. No existing UI test reads style colours (grep of tests for `style.background` returns nothing), so there is no precedent showing it works. · The test as written contradicts its own expectations, so the Task 2 Step 4 run fails and the implementer has to guess a fix. · Have CellRow put the colour on an attribute, e.g. `attrs={{ 'data-ui-cell': hex(fill) }}`, and read `e.getAttribute('data-ui-cell')`. Or normalise the expected value the same way, e.g. set `hex(BAR_ON)` on a scratch element's `style.background` and read it back.

### [P2] R1-F3 The uiperf measurement in Task 5 Step 4 records nothing
Step 4 says to record `?uiperf=1` for fixture 2 'written repeatedly with the same model'. An equal model makes createSink return before `perf.run`, so no sample is ever taken and the counter prints median 0 / p95 0. The spec's budget is for a running HUD, whose model changes every frame (tick, simSeconds, boarders, otherCrewStatus). · ui/sinks.ts:L16-L18: `if (next === prev) return; perf.run(...)`. ui/perf.ts:L16 samples only inside `run`. Plan L669. Spec L131-L133: '1.5 ms median and 4 ms p95 over a 60-second running sector', recorded in each part's visual check. HudModel.tick and simSeconds change each frame (hudModel.ts:L137, L556). · The only budget check in the plan cannot fail, so the 60 Hz full-model sharing pass and the Hud re-render (a controller low-confidence item) go unmeasured. · In the probe, write fixture 2 every animation frame with `tick` (and `simSeconds`) incremented and one player's health or progress varied, for 60 s. Record median and p95, and state that the sharing pass is outside `perf.run` (or move it inside for the measurement).

### [P2] R1-F4 The probe's engine=react variant never gets the image cache, so the 'after' shots lack icons and glyphs
Task 4 Step 3 defers the 'after' shots to Task 5 because 'Task 5's mount change must exist for engine=react to show icons'. Task 5 Step 1 builds the cache and passes `images` only in `startApp`; nothing updates the probe branch. The probe's `mountUi` call therefore still has no images, and the Step 4 comparison of glyph and icon positions has nothing to compare. · Plan L644 (the deferral), L653 and L662 (startApp only), L657 (uiProbe.ts only drops engine=pixi). main.ts:L170-L188: startProbe's separate `mountUi` call. · The visual gate, the plan's own acceptance check for icon and glyph placement, cannot be met as written. An implementer may 'fix' differences that are only missing images. · In Task 5 Step 1, have the probe's `probe=hud&engine=react` branch also run `buildImageCache(hudImageNames(assets.missing), ICON_KINDS, createPixiImageSource(renderer, assets))` and pass `images` to `mountUi`.

### [P2] R1-F5 The spec §8 HUD render-count and error-boundary tests are missing
Spec §8 requires a render-count test (render each HUD panel, push an unchanged model twice, assert no re-render) and an error-boundary test (a throwing HUD panel leaves the menu strip mounted). The uiHud.test.tsx list covers neither, and the plan does not state this as a deviation. · Spec L335-L336. Plan L515-L523 (the uiHud.test.tsx assertions) and L38-L42 (the stated deviations, which do not include this). · The hud region's RegionBoundary and its epoch reset (plan L618) are new wiring with no test. The memo and sharing guarantee that the 60 Hz budget depends on is also untested. · Add two cases to tests/uiHud.test.tsx. (1) Count renders of PlayerBlock and SidePanels with a React Profiler or a spy, push `structuredClone(m)` twice and assert zero extra commits. (2) Feed a model that makes one panel throw (e.g. `players: [null]` cast), assert the menu's `session-menu` root is still present with `menu` on, then assert recovery after `clear()` plus a fresh update bumps `epochs.hud`.

### [P2] R1-F6 Task 5's main.ts instruction would use `store` before it is declared
Step 1 says to replace `createHud(renderer.hud, assets)` with `createHudSink(store, perf)` and claims the store already exists before that point. In startApp, `const hud = createHud(...)` is at L59 and `const store = createUiStore(...)` at L69. An in-place replacement hits TS2448 (block-scoped variable used before its declaration) and would be a TDZ ReferenceError at runtime. · main.ts:L59 `const hud = createHud(renderer.hud, assets);`, main.ts:L69 `const store = createUiStore(...)`. Plan L662: 'The store must exist before the router; UI-ii already moved it there.' · The instruction is ambiguous for a subagent that sees only this task, and the literal reading fails typecheck. · Say it explicitly: delete L59, and declare `const hud = createHudSink(store, perf);` after `store` (next to `duelSink` at L70). Build `images` before `mountUi` at L119.

### [P3] R1-F7 Port details the Task 3 rules omit or blur
Several hud.ts rules are missing from Task 3's text, or stated loosely enough that implementers could differ. (a) Science: the system row's non-cursor tint is `c.system.enabled ? BLUE : DIM` and target rows are TEXT; only the cursor tint is stated. (b) Event card: a text line advances y only when it is non-empty. (c) Event card: the choice tint applies to the number as well as the label. (d) The banner's tint is TEXT. (e) Doors footB also requires `c.item !== null`. (f) Headline's `rowLayout` for the glyph-row centring must use the same `images.has` predicate that `<Row>` uses. · hud.ts:L228 (system row tint), L143 (`if (line) y += LINE`), L149 (`row.n.tint = tint`), L88 (`text(TEXT, TITLE_SCALE)`), L246, L274. Plan L505-L506, L599, L601, L559, L512, L562. · consoleRows.ts is called 'a pure port', so most implementers will read hud.ts. But the uiConsoleRows test list is written from these bullets, and a test written from them alone would encode the omissions. · Add each rule to the matching bullet in Task 3 Step 1 and Step 3.

### [P3] R1-F8 Smaller unstated deviations and a contradiction in Task 1
(a) The spec says `<Icon>` draws an `<img>` with `image-rendering: pixelated`; the plan uses a Box with `background-image`, without listing it as a deviation. (b) Task 1 lists 'extend tests/hud.test.ts (one case for the two exports)' but then puts that case in uiHudSink.test.ts. (c) The spec says `mountUi` awaits the image cache; the plan builds it in main.ts and passes the result in. That is equivalent, but it is not stated. · Spec L235-L236, L64. Plan L80, L147, L353-L368, L662. · Reviewers and implementers can't tell intent from accident. · Add (a) and (c) to 'Deviations from the spec'. Drop the tests/hud.test.ts entry from Task 1's Files list.

## Verified
- hudModel.ts exports every helper Task 3 consumes (clockLine L152, sectorLine L154, timeLine L156, directorText L157, threatTint L133, STATION_SHORT L96, glyphName L205, skillsLine L79, tabLabel L87, engineeringFooter L111, weaponsStrip L248, weaponsFooterLines L264, weaponsFooterTone L271, weaponsLootLine L273, weaponsRowTexts L277, SCIENCE_ROWS L246, scienceFooter L161, targetRowText L308, navigationFooterLines L165, mapTitle L169). STATION_MAX and UPGRADE_MAX are already imported (L10). STATION_OVERDRIVE and STATION_NAMES need importing or are present (L16), as the plan says.
- ui/sinks.ts:L13-L21: createSink(store, key, perf) has the shape the plan assumes. Widening K to include 'hud' and adding epochs.hud makes the uiHudSink test's counts (1, 2, epoch 1, then 3 after two clears) correct.
- fallback.ts:L7-L26 (FEATURE_NAMES.icons and .glyphs, featureReady(ReadonlySet, Feature)) and assetNames.ts:L36 and L43 (icon.* keys, with icon.medical extra) match images.ts. The hudImageNames and buildImageCache test expectations hold: 2 texture calls, ICON_KINDS.length (8) glyph calls, 2 warnings.
- rowLayout test numbers recomputed: glyph at 0, icon at 20, 'Repair' at 40, 'Cancel' at 40 + ceil(textPx('Repair')) + 12 with no Q glyph (not in the cache); width = that x + ceil(textPx('Cancel')). This matches the code and hud.ts fillRow (L69-L74).
- CellRow cell fill logic recomputed against hud.ts:L51. level 3/max 2 gives [ON, ON, AMBER]; level 1/max 3 gives [ON, OFF, OFF]; failed 2/2 gives [FAIL, FAIL]. Status, coolant and cols x positions and the select bar (-4, 3, width+8, LINE) match hud.ts L34-L56. POWER_ROW.glyph is true (hudLayout.ts:L31). The glyph offset x+8-10, y+15-10 with a 20×20 frame centred at (10, 10) matches hud.ts:L35 and L45. drawIcon at size 16 stays inside 20×20.
- Box (attrs Record<string,string>, style), Bar (colour, data-ui-bar-fill, round(f*w)), PixelText (data-text/x/y/anchorx; no getContext without an atlas), Panel, Stage, hex and UiContext/useUi exist with the props the plan uses (ui/stage/*.tsx, ui/context.tsx:L9-L13). tests/helpers/uiStore.ts:L20 makeUi exists.
- Pixi 8.19 ExtractSystem.d.ts:L504 `base64(options: ExtractImageOptions | Container | Texture)`; BaseExtractOptions has target, frame?, resolution?, clearColor?, antialias? (L118-L189); ImageOptions fields are optional (L66, L89). Both calls in app/uiImages.ts type-check. renderer.ts:L50 passes no resolution, so extracted images are 1:1.
- No Pixi in the UI graph: hudModel.ts imports roomIconModel, theme, hudLayout, enemyWindowModel, shotResult, calloutModel and sim/clientControl modules, and none of these (or enemyShipLayout, events/, sim/, clientControl/, input/) imports pixi.js (grep). uiBoundary.test.ts:L39-L45 checks only direct value imports from sim/authority/clientControl/net/network, so the ui/** files in the plan comply.
- Deletions: the only importers of hud.ts/createHud are main.ts:L6/L59 and tests/hudSlots.test.ts (deleted). panel.ts is imported by hud.ts, mapPanel.ts and enemyWindow.ts:L12. renderer.hud is used only in main.ts. No test fake constructs Renderer with a hud field. tintColor is imported only by hud.ts (roomIcons re-export kept).
- Task 4 fixtures: sim/state.ts:L106 `createSimState(layout, playerCount, seed, characters = DEFAULT_CHARACTERS, options)` and L93 disposeSimState exist. cardController.ts:L80 createCardUi exists. buildHudModel's DEV throw (hudModel.ts:L524-L525) fires only for an invalid 'player' viewer, so couch mode is safe.
- Smokes: online-app-smoke.ts and online-recovery-smoke.ts read only document.body.innerText for menu strings ('Single player', 'You are Player N' from SessionPage.tsx:L31, 'Restored at tick'). The driver's 'layout' (online-app-smoke.cjs:L187) uses the first `canvas` in the document, which is Pixi's (appended in createRenderer before #ui). PixelText canvases and the pointer-events-none stage do not change either.
- Port order and visibility checked against hud.ts: side panels are hidden in lobby/gameover (L257); the map shows only while running (L259) and draws above the side panels (L77-L84); players draw in order, each block above the previous card (L94-L105); the event card is above the console cards and credits above everything (L127-L165). The summary backdrop formula (L276-L282), the event card y sequence (L142-L158), console card geometry (L116-L123, L110-L113) and the map shapes and marks (mapPanel.ts:L36-L57) match the plan's Task 3 text, apart from the P3 items listed.

## Not verified
- Whether a 60 Hz replaceEqualDeep plus Hud re-render meets 1.5 ms median / 4 ms p95. The plan's measurement cannot show it (see finding), and nothing can be run in a read-only review. Note that Hud selects the whole model and SidePanels/Headline/SummaryCard take `m`, so they re-render every frame; the spec's selector rule (spec L127-L129) prefers a tick primitive.
- Whether extract.base64 on a Sprite of a trimmed or sheet-frame texture returns exactly the frame's orig size. Pixi uses the Sprite's local bounds, which suggests yes, but I could not run it.
- CSS mask-image with a data URL in Electron 37. Chromium has supported unprefixed mask-image since 120, but I could not confirm it here.
- How SVG shape-rendering=crispEdges circles compare with Pixi's antialias:false Graphics circles at non-integer letterbox scales. This needs the screenshots.
- Whether buildHudModel in couch mode with createCardUi() (0-player card state) and a 4-player state reads card UI arrays out of range for pids 1-3 (cardRowIndex). I did not read cardController beyond the createCardUi signature.
- The exact jsdom 31 / cssstyle serialisation of `background` (finding 2). It rests on CSSOM's rgb() serialisation rule; I did not read node_modules/cssstyle, which is outside the allowed reads.
- The tests/uiProbe.test.ts contents and the tests/helpers/cardUi.ts fixtures the spec names; I did not read them.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `b151a88`. 8 accepted, 0 rejected, 0 deferred; no prior IDs.

## R1-F1 [P1]: Deleting mapPanel.ts breaks tests/layout.test.ts, and the Task 5 grep cannot find it

Confirmed: tests/layout.test.ts L11 imports from render/mapPanel, and 'render/panel' is not a substring of 'render/mapPanel'. Task 1 now repoints that import to render/mapModel and greps for any other importer. Task 5's grep now matches `mapPanel`.

## R1-F2 [P1]: The CellRow test compares jsdom's style.background to hex strings; CSSOM gives rgb()

Confirmed: style colours serialise as rgb(). CellRow now writes `hex(fill)` into its `data-ui-cell` attribute, and the test reads the attribute.

## R1-F3 [P2]: The uiperf measurement in Task 5 Step 4 records nothing

Confirmed against sinks.ts L16-18. The probe now writes fixture 2 every frame for 60 s with tick, simSeconds, health and progress varied. The sharing pass, which runs outside `perf.run`, is timed separately.

## R1-F4 [P2]: The probe's engine=react variant never gets the image cache, so the 'after' shots lack icons and glyphs

Confirmed (main.ts startProbe has its own mountUi). Task 5 Step 1 now builds the cache in the probe's hud/react branch as well.

## R1-F5 [P2]: The spec §8 HUD render-count and error-boundary tests are missing

Confirmed against spec L335-336. uiHud.test.tsx gains a render-count case (spies or Profiler; structuredClone pushed twice gives zero extra renders and writes) and an error-boundary case (a throwing panel leaves session-menu; recovery after clear plus a valid model bumps epochs.hud).

## R1-F6 [P2]: Task 5's main.ts instruction would use `store` before it is declared

Confirmed (main.ts L59 vs L69). Step 1 now deletes the createHud line and declares the hud sink after store and perf, next to duelSink.

## R1-F7 [P3]: Port details the Task 3 rules omit or blur

Confirmed against hud.ts L228, L143, L149, L88, L246 and L274. All six rules are added to the matching bullets.

## R1-F8 [P3]: Smaller unstated deviations and a contradiction in Task 1

Confirmed. Deviations 4 (Icon as a Box with background or mask) and 5 (main.ts builds the cache and passes it to mountUi) are added. The stray tests/hud.test.ts entry is dropped.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-ui-iii-react-sector-hud.md

<!-- end -->

---

