# Codex review exchange: ui-ii-plan

Subject: `docs/superpowers/plans/2026-11-16-ui-ii-react-duel-ui.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 0903ed5, effort high, 706 s, 5316411 in / 5128566 cached / 61103 out)

Verdict: ready with P2s

## Findings

### [P2] R1-F1 The ASCII-only glyph atlas drops the online duel's '…' and '—' banner glyphs
`GLYPH_CHARS` is the 95 printable ASCII characters, and `PixelText` skips any character that has no cell, leaving only a 6-px gap (from `advance()`'s default). The online duel's banners contain non-ASCII characters: 'LEAVING…' and 'CONNECTION LOST — RECONNECTING'. Today these are Pixi BitmapText on the font installed under 'm5x7'. Pixi 8's BitmapFontManager calls `ensureCharacters(text)` on that dynamic font, so the two characters are drawn today. After UI-ii they disappear, in ordinary online use (a disconnect, or a Leave). · plan L450 (`GLYPH_CHARS` = 95 ASCII), plan L576-581 (`if (sx !== undefined)` skips the glyph but advances `pen`); src/renderer/src/app/duel/onlineDuel.ts:L193 ('LEAVING…', 'CONNECTION LOST — RECONNECTING'); scene.ts:L86-87 (that banner is today's BitmapText); render/theme.ts:L31-37 (no advance entry for either character, so the default of 6 applies); plan L1170-1174 (the probe samples are ASCII only, so the probe cannot catch it). · The plan's goal is the same glyphs, but these two disappear from the reconnect and leave banners. No test or probe sample covers them. · Add '…' and '—' to `GLYPH_CHARS`, and give `theme.ts`'s ADVANCE table their m5x7 hmtx advances, so the atlas test's layout still matches. Add a unit test asserting that every character of the scene's banner strings (`bannerText`'s literals and the pause texts) has an atlas cell. Add 'CONNECTION LOST — RECONNECTING' and 'LEAVING…' to `PROBE_SAMPLES`.

### [P2] R1-F2 The two calibration constants cannot correct anchored heights or horizontal placement
Deviation 3 and Task 5 Step 3 tune `GLYPH_Y_OFFSET` and then `GLYPH_X_PAD` until there are 0 mismatches. But `GLYPH_X_PAD` only pads cells: the glyph origin is still drawn at `pen*g` (plan L578), so changing it moves nothing. The height that anchors use, `h = cellH*k`, comes from `fontBoundingBoxAscent+Descent` (plan L469, L565-566), and no constant changes it. BitmapText anchors on its own line height, which Pixi measures itself. So if that line height differs from `cellH`, the anchorY 0.5 texts (all three banners) and the anchorY 1 snap hint stay offset by `0.5*(ΔH)*k` or `ΔH*k`, whatever `GLYPH_Y_OFFSET` is. A single offset can match anchor-0 text or anchored text, not both. Likewise, a horizontal offset between Pixi and React has no knob at all. · plan L34-35 and L452-454 (the constants), L566 (the `anchorY*h` placement), L578 (`dx0` ignores `GLYPH_X_PAD` for placement), L1200 ('Adjust GLYPH_Y_OFFSET, then GLYPH_X_PAD, until both scales report 0'); render/assets.ts:L34 (BitmapFont.install, whose line height comes from Pixi's measurement, not fontBoundingBox). · The probe gate (0 mismatches at anchors 0, 0.5 and 1) may be unreachable by construction. The banner and hint positions would then miss the 'same rectangles' criterion, after the probe has spent up to 10 attempts. · Make the line height a calibrated constant (e.g. `GLYPH_LINE_H` in native px, used for `cellH` and for `PixelText`'s `h`), and add a `GLYPH_X_OFFSET` that shifts the drawn origin. Calibrate in this order: `GLYPH_Y_OFFSET` on anchorY 0 samples, `GLYPH_LINE_H` on anchorY 0.5/1 samples, then `GLYPH_X_OFFSET`. Keep `GLYPH_X_PAD` as clipping padding only, and say so.

### [P2] R1-F3 The ?uiperf=1 counter does not measure the React commit in the build it runs on
Three problems:
(1) `<Profiler onRender>` is never called in React's production build. The visual check runs on `npm run build` output (`out/`), so the React half of the counter reads 0 there.
(2) Even in dev, `actualDuration` excludes layout effects, and `PixelText`'s canvas drawing, the main cost, happens in `useLayoutEffect`.
(3) `perf.time` wraps only the sink's sharing pass and `setState`. A zustand change from outside React schedules the useSyncExternalStore re-render for a later microtask, so the render is outside the timed region.
Also, `?uiperf=1` cannot reach a built app: main forwards only `FTLITE_MODE` as `?mode=`, and the 'env flag the probe uses' does not exist. Finally, how frames are delimited and the window-maths test are left to execution. · plan L1154, L1182-1192 (`time`/`commit`, Profiler, 'accumulates per animation frame', test described but not written), L1215 ('append it to the URL… or set the env flag the probe uses'); src/main/index.ts:L88-L94 (only `mode` is forwarded; `src/main` may not change per plan L20); plan L1196 (the probe runs on the build). · The spec §2 budget (1.5 ms median, 4 ms p95) would be 'met' by a number that leaves out the render, the commit and the canvas draws. The plan's one perf gate would be meaningless. · When perf is enabled, run the sink's `setState` inside `flushSync` (react-dom) within `perf.time`, so the render, the commit and the layout effects all run synchronously in the timed region. Drop `<Profiler>`. Define `createUiPerf(enabled, now = performance.now)` with an explicit `endFrame()` called from the sink's `frame`, plus a pure `windowStats(samples): { median; p95 }` with a written test. Have the probe script reach the flag by navigating the loaded page (`page.goto(page.url() + '&uiperf=1')`) instead of a nonexistent env flag.

### [P2] R1-F4 Task 0's prerequisite check uses a branch that no longer exists
H-2a-iii has been merged ('merge h2a-iii', 0903ed5), and the `h2a-iii` branch and worktree are gone. `git diff h2a-iii master -- …` therefore fails with 'unknown revision'. `git log --grep "H-2a-iii"` is case-sensitive and does not match the merge subject 'merge h2a-iii: …'. Task 0's stop condition cannot be evaluated as written. · plan L72-L75; .git/logs/HEAD:L764 ('merge h2a-iii: Merge made by the 'ort' strategy.' → 0903ed5); .git/refs/heads/ holds only master, art-ii and h2b-proto; .worktrees/ has no h2a-iii (Glob). · A fresh subagent running Task 0 hits an error, or concludes that H-2a-iii is not merged, and stops with NEEDS_CONTEXT before any work starts. · Replace the two commands with `git log --oneline -1 -i --grep "merge h2a-iii" master` and `git diff 0903ed5^2 master -- <files>`. Or simply grep master's `scene.ts` for the quoted lines (`createDuelScene(renderer: Renderer, options: { seed: number; pauseText: string })`, the `SceneOverlay` interface, and the two `scene.draw(` calls).

### [P2] R1-F5 Spec §8's render-count test for the duel panels is missing, and the omission is not listed as a deviation
Spec §8 requires 'A render-count test renders each HUD and duel panel, pushes an unchanged model twice, and asserts no re-render.' The plan has no such test. The sink test only shows that an equal view causes no write. The plan says the sinks' no-write test covers this, but it never checks that a partly changed view leaves the memoised panels (MapOverlay, EndCard, Banners, unchanged PixelTexts) un-rendered. That check is the point of `replaceEqualDeep` combined with `React.memo`. · spec L335; plan L1106 (the deleted Pixi allocation tests are 'covered by … the sinks' no-write-on-equal test'); plan L643-731 (uiDuel.test.tsx has no render-count case); plan L29-37 (the deviations list does not mention it). · A regression that defeats the sharing, such as a fresh `banners` object per frame or a non-memo panel, would pass every test, and the perf budget is unmeasured (see the finding above). · Add a jsdom case. Frame view A, then a view where only `readout.rows[0].value` changes. Count renders of `MapOverlay` and `Banners` with a `<Profiler>` in the test (dev React) or with a `vi.fn` render spy on a test-only wrapper, and assert they did not re-render. Push an equal view twice and assert zero commits. Or state the omission as a deviation.

### [P2] R1-F6 The probe's halves cannot match pixel for pixel: the renderer's stage stays visible, and sample extents are unchecked
`startUiProbe` adds BitmapTexts to the renderer's stage without hiding its children. `createRenderer` puts `feel.starfield` at index 0, plus the world, the enemy window and the callouts. The left half is therefore Pixi text over that content, while the right half is React text over the same canvas's other half. A background that differs across the halves, such as the starfield, gives mismatches that no constant can remove. Separately, the test checks only that each sample's anchor x is below 640, not that its full width fits. A `TITLE_SIZE` line holding half of `GLYPH_CHARS` is about 48 × 6 × 3 ≈ 860 internal px, so it spills into the right half and overlaps its React copy. · plan L1177 ('adds one Pixi BitmapText per sample … to the stage'), L1165 (only `s.x < 640` is checked), L1173 ('all of GLYPH_CHARS split in two lines'); src/renderer/src/render/renderer.ts:L55, L70 (stage children and the starfield); scene.ts:L48-49 (the duel hides them, which the probe does not copy). · The calibration gate of 0 mismatches would fail for reasons unrelated to text. The 10-attempt loop then ends with misleading counts sent to the owner. · In `startUiProbe`, hide every existing stage child, as scene.ts:L48-49 does, and draw a solid background rect. In `tests/uiProbe.test.ts`, assert `s.x - s.anchorX*textPx(s.text, s.size/16) >= 0` and `s.x + (1 - s.anchorX)*textPx(s.text, s.size/16) <= 632` for every sample. Split GLYPH_CHARS by size so that each line fits.

### [P3] R1-F7 The `git grep "duel/endScreen"` check will match docs, including this plan
Task 4 Step 1 expects `git grep -n "duel/endScreen"` to print nothing after the move. But the repo's docs contain the string, starting with this plan itself. · plan L995 (the check); plan L98 and L212 (`../render/duel/endScreen`), L623 (`render/duel/endScreen.ts`). · An implementer following the step literally sees output, and may stop or edit docs. · Use `git grep -n "duel/endScreen" -- src tests scripts`.

### [P3] R1-F8 A tactical-layer test still names the removed texts, and Step 8 does not list it
Step 8 lists `duelReadout.test.ts` and `tacticalLayer.test.ts`. But `duelWeaponsView.test.ts` has a case named 'reset hides every text, the zoom, scale, hint and banner included'. It asserts more than 4 visible BitmapTexts after a paused draw, which today includes the zoom, scale and banner texts. It probably still passes (the Weapons ring has 12 labels), but its name and its precondition become stale. · tests/duelWeaponsView.test.ts:L213-L221; plan L1020-1026 (Step 3 removes those texts), L1102-1108 (Step 8's list). · The test describes behaviour that no longer exists, which misleads the next reader. · Add the case to Step 8: rename it to 'reset hides every text until the next draw', and keep the assertion.

### [P3] R1-F9 The readout pips' 1-px border is not scaled with the stage
Pixi strokes the pips with a 1-internal-px line, which the letterbox scales (1.5 device px at scale 1.5). The plan writes `border: 1px solid` in CSS pixels, unscaled. Panel, by contrast, scales its border with `px()`. · plan L771-772; src/renderer/src/render/duel/readoutPanel.ts:L42; plan L525 (Panel's `px()`). · It is a small visual difference on the shield pips at scale 1.5 and above. · Use the same `px(1)` rounding as Panel for the pip border width.

### [P3] R1-F10 uiMenuState.test has one layout expectation, not two
The plan says the two `createUiStore` cases must expect the new layout. Only one case asserts `layout`; the other asserts `settings`. · plan L179; tests/uiMenuState.test.ts:L100 (the `layout` toEqual), L103 (`settings` only). · This is a minor instruction mismatch. · Say 'the `createUiStore` case at L100'.

## Verified
- H-2a-iii's files are now on master (merge 0903ed5). The plan's quotes match master's scene.ts: the `createDuelScene(renderer, { seed, pauseText })` signature (L46), `SceneOverlay { banner; layerPaused; end; notice? }` (L44), the banner/notice rule at L86-88, and the shake at L90-91.
- The scene mapping (Task 4 Step 2) reproduces today's visibility. In Single player (duelMode.ts:L57, banner = layerPaused = userPaused), the interior shows only the scene banner and the map views show only the layer banner (tacticalLayer.ts:L223, `o.paused` = `input.paused` = `overlay.layerPaused`, tacticalModel.ts:L297). Online, layerPaused is false (onlineDuel.ts:L229), so the tactical banner is null and the interior banner shows in every view. `overlayView` is set only in the map branch, and is additionally nulled for the interior.
- Every importer of the deleted files is covered by Task 4: readoutPanel.ts (scene.ts:L11, duelReadout.test.ts:L11), endScreen.ts (scene.ts:L8, duelMode.ts:L8, onlineDuel.ts:L21, duelReadout.test.ts:L10) and feelPanel.ts (flightMode.ts:L7, tacticalLayer.test.ts:L4). `pauseText` is used only by scene.ts:L51. No script imports any of them.
- The only test that builds the changed deps is tests/onlineDuelSession.test.ts:L90 (`createOnlineDuelSession`, scene mocked at L57-59). Step 8's grep finds it, and adding `ui` makes it typecheck.
- The smokes do not read the moved texts. duel-app-smoke.ts reads only the status `text` (document.body.innerText; online-app-smoke.cjs:L172, which canvases do not add to) for lobby strings. duel-app-observer.ts reads only port traffic. The `layout` command's `document.querySelector('canvas')` (online-app-smoke.cjs:L187) still finds the Pixi canvas first, because renderer.ts:L49 appends it before main.ts:L108 appends #ui.
- `FTLITE_MODE=uiprobe` works: src/main/index.ts:L88-94 forwards any `FTLITE_MODE` as `?mode=` for both loadURL and loadFile, and Task 5 adds 'uiprobe' to `readMode` (mode.ts:L6-9).
- Geometry and test arithmetic recomputed: edge(7,10,1.5,1)=21; edge(7,10,1.5,1.25)=20.8; boxCss(1,1,3,3) = {12,6,4,4}; the Bar fill width is 8px (edges 10..17.5 → 10..18); hex values; the atlas test's cellH = ceil(11.2)+ceil(3.4) = 16 and its cell offsets match `buildGlyphAtlas`; snapAlpha's expected bytes.
- Placements match today's Pixi code: readout labels, values and help (readoutPanel.ts:L15, L35-49), pips (L41) and bar (L46); the end card (endScreen.ts:L25-38); the banners (scene.ts:L55-57, tacticalLayer.ts:L61); the zoom text, scale bar, ticks, label and hint (tacticalLayer.ts:L61, L217-222: the 2-px lines become boxes at y-1 and x-1); the feel panel (feelPanel.ts:L6-29). Panel's border and inset highlight match drawPanel (panel.ts:L5-10).
- replaceEqualDeep's outputs match every uiShare expectation. The sinks' write and epoch sequence matches uiSinks.test. setLayout writes only on a change.
- The createSink computed-key `setState` cast should typecheck: `{[x:string]: …; epochs}` is comparable to Partial<UiState>, because every target property is optional. tsconfig.web.json has no noUnusedLocals, so the leftover imports in the edited tests do not break tsc.
- The UI boundary (tests/uiBoundary.test.ts:L39-45) allows the plan's direct value imports (render/theme, readoutModel, interiorModel, feelModel, shared/resolution). The relative paths (`../../../../shared/resolution` from ui/duel, `../../render/...`) resolve correctly.
- Z-order: Stage is fixed at z 10, under the menu root's z 20 (menu/styles.ts:L4-5), and over the canvas (fixed, z auto). Stage's top = stripHeight matches the canvas's top (main.ts:L101), and the letterbox is computed from innerHeight − top, as renderer.resize does (renderer.ts:L76-78).
- RegionBoundary accepts `fallback={null}` (ReactNode). A throwing duel region renders nothing, and the menu region stays mounted. The menu reset key in plan L950 equals master's UiRoot.tsx:L8.
- The Pixi canvas renders at CSS resolution (renderer.ts:L48, no resolution or autoDensity), which bears out deviation 3's claim that the dpr is recorded rather than gated.

## Not verified
- The h2a-iii worktree named in the manifest does not exist (.worktrees holds only art-ii), and the h2a-iii branch ref is gone. I read master's post-merge copies of scene.ts, duelMode.ts, onlineDuel.ts, flightMode.ts, endScreen.ts, main.ts and the tests instead. I went beyond the manifest only to confirm this, via .git/refs/heads and .git/logs/HEAD.
- Pixi 8 internals, which I could not read because node_modules is out of bounds: that BitmapFontManager calls ensureCharacters for characters outside the installed ASCII set (finding 1); that BitmapText anchors on a line height Pixi measures itself, not on fontBoundingBox (finding 2); and that loadWebFont adds the FontFace to document.fonts. If it does, `document.fonts.check('16px m5x7')` holds after loadAssets.
- Whether Chromium's fontBoundingBoxAscent baseline plus GLYPH_Y_OFFSET can match BitmapText's vertical placement for anchor-0 text. Only the probe can show this.
- Whether jsdom's cssstyle reports React's `top: '0'` as '0px' (uiStage.test L396). I expect it does, but did not run it.
- Whether duelWeaponsView.test.ts:L218's `> 4` precondition still holds once the zoom, scale and banner texts are removed. I expect the Weapons ring labels keep it above 4, but did not run it.
- I did not open menu.test.tsx's or uiActions.test.ts's bodies beyond the grep hits; the plan's Step 4 assumes they still pass after the store gains its slices.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `25a22b9`. 10 accepted, 0 rejected, 0 deferred; no prior IDs.

## R1-F1 [P2]: The ASCII-only glyph atlas drops the online duel's '…' and '—' banner glyphs

Confirmed: onlineDuel.ts L193 has 'LEAVING…' and 'CONNECTION LOST — RECONNECTING'. Rather than guessing hmtx advances in theme.ts, the atlas now measures each character's advance with `measureText` (as Pixi's dynamic font does) and stores `atlas.advance`. `GLYPH_CHARS` is ASCII plus `…—` (97). PixelText sizes and places glyphs by the atlas's advances (`atlasTextWidth`). A coverage test checks the scene's banner and end-card strings, the probe samples include both banners, and Task 4 greps the duel sources for any other non-ASCII character.

## R1-F2 [P2]: The two calibration constants cannot correct anchored heights or horizontal placement

Confirmed: `GLYPH_X_PAD` never moved the origin and `cellH` had no knob. Added `GLYPH_LINE_H` (null = measured; used for `cellH`, so for anchors) and `GLYPH_X_OFFSET` (applied to the drawn origin). `GLYPH_X_PAD` is documented as clipping only. Deviation 3 and Task 5 Step 3 give the calibration order: Y offset on anchorY 0 samples, line height on anchorY 0.5/1, then X offset.

## R1-F3 [P2]: The ?uiperf=1 counter does not measure the React commit in the build it runs on

Confirmed: Profiler's onRender does not run in production builds, and actualDuration excludes layout effects. perf.ts now wraps the sink's write in `flushSync`, so render, commit and layout effects run inside the timed region. It has no Profiler, plus a pure `windowStats` and a written `tests/uiPerf.test.ts`. The probe script reaches the flag with `page.goto` on the loaded URL.

## R1-F4 [P2]: Task 0's prerequisite check uses a branch that no longer exists

Confirmed: h2a-iii was merged at 0903ed5 and its branch was deleted. Task 0 now uses `git log -i --grep "merge h2a-iii"`, `git diff 0903ed5^2 master`, and greps for the quoted signature, the interface and the `scene.draw(` calls.

## R1-F5 [P2]: Spec §8's render-count test for the duel panels is missing, and the omission is not listed as a deviation

Confirmed. uiDuel.test.tsx gains a case that frames a view, then a view whose only change is a readout value. It asserts that memoised overlay, banners and end consumers rendered once, and that a third, deep-equal view makes zero store commits.

## R1-F6 [P2]: The probe's halves cannot match pixel for pixel: the renderer's stage stays visible, and sample extents are unchecked

Confirmed: renderer.ts's stage children, including the starfield, stay visible. startUiProbe now hides every stage child and draws one full background rect. The probe test checks each sample's full horizontal and vertical extent within its half and the character coverage, and the GLYPH_CHARS lines are split per size to fit.

## R1-F7 [P3]: The `git grep "duel/endScreen"` check will match docs, including this plan

Confirmed. Scoped to `-- src tests scripts`.

## R1-F8 [P3]: A tactical-layer test still names the removed texts, and Step 8 does not list it

Confirmed (tests/duelWeaponsView.test.ts L213). Step 8 now renames the case and keeps its assertion.

## R1-F9 [P3]: The readout pips' 1-px border is not scaled with the stage

Confirmed. The pip border uses a scaled, device-rounded hairline, the same rule as Panel's border.

## R1-F10 [P3]: uiMenuState.test has one layout expectation, not two

Confirmed. The plan now names the one layout assertion.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-ui-ii-react-duel-ui.md

<!-- end -->

---

