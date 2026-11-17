# Codex review exchange: artemis-i-plan

Subject: `docs/superpowers/plans/2026-11-17-artemis-i-consoles.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 23beb82, effort high, 566 s, 8325177 in / 8121327 cached / 52290 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 consoleChange exported from scene.ts breaks the two test files that vi.mock the scene module
Task 5 puts `consoleChange` in `app/duel/scene.ts`. Both `duelMode.ts` and `onlineDuel.ts` are told to call it when they are created. Two existing tests replace that module with a vi.mock factory that returns only `createDuelScene`. In Vitest, reading an export the factory did not define throws ("No 'consoleChange' export is defined on the mock"). So `startDuelMode` throws in duelModeDispose.test.ts, and `createOnlineDuelSession` throws in every test in onlineDuelSession.test.ts. · plan L983-989 (export consoleChange from scene.ts), L1025 (onlineDuel: `const trackConsole = consoleChange(...)` right after the keyboard), L1033 (duelMode: same, at creation), L1041 (Step 4 expects tests/duelModeDispose.test.ts and tests/onlineDuelSession.test.ts to PASS); tests/duelModeDispose.test.ts:L12-17 (scene mock has only createDuelScene); tests/onlineDuelSession.test.ts:L60-72 (scene mock has only createDuelScene); src/renderer/src/app/duel/duelMode.ts:L34-36 and onlineDuel.ts:L67-69 (where the call would go, run at creation). · Task 5 Step 4 fails as written: one test in duelModeDispose and the whole onlineDuelSession suite. The subagent has no instruction for this, and the plan says no existing test changes unless a task names it. · Put `consoleChange` in a small module of its own that no test mocks, for example `src/renderer/src/app/duel/consoleChange.ts`, which imports only `type ConsoleStation`. Import it from there in duelMode.ts and onlineDuel.ts, and export it there for the test. Or add `consoleChange: () => () => {}` to both mock factories and name those two test edits in Task 5.

### [P2] R1-F2 Readout rows, help and map reserves follow the view, not whether the console is drawn
The scene passes `console: true` to `readoutRows`, gives empty help and uses `CONSOLE_RESERVE` whenever `view !== 'interior'`. The console view is null while paused, on the end card and under any banner, and then DuelUi puts the readout back in the right-hand column. So on a paused Weapons screen the right column loses LOCK, CHARGE and MAG (the station block that shows them is hidden) and loses its key help. Off-screen arrows are then only kept 156 px from the right edge, so they can pass under the 220 px readout column. · plan L1010 (`console: true ... when view !== 'interior'`, `help: view === 'interior' ? readoutHelp(view) : []`, the reserves always 228/156); plan L908-909 (placement is 'status' only when `duel.console && station !== 'ship'`); plan L23 (the console view is null while paused or under a banner); readoutModel.ts:L76-83 (the LASER, LOCK, CHARGE and MAG rows the console flag removes); readoutModel.ts:L103-106 (help). · Escape (pause) is ordinary play. The pause screen would show a readout with no laser information and no key help, and arrows could overlap the readout. That is not today's paused screen, and the plan does not state the change. · In `draw`, compute `const hidden = consoleHidden(d, overlay, source.paused())` before the tactical input. Use `onConsole = !hidden && view !== 'interior'` to choose the reserves (`CONSOLE_RESERVE` or `reserveRight: READOUT_COLUMN`), the `console` flag on `readoutRows` and the help (`onConsole ? [] : readoutHelp(view)`). Add a sceneUi or scene test for a paused Weapons frame.

### [P2] R1-F3 Moving INTERIOR_BAND to y 42 breaks worldFit.test.ts, which Task 2 neither lists nor runs; the duelInterior line numbers are wrong
With the band at y 42 and h 678, the Cutter's fit y becomes 42 + (678 − 416) / 2 = 173, not 152. worldFit.test.ts:L56 hard-codes `{ scale: 1, x: 66, y: 152 }`, and it is missing from Task 2's run list and its git add. In duelInterior.test.ts the hard-coded 152 is at L41-42, L89, L92 and L102, but the plan names L43-44 (lines that do not change). · plan L454 (band change; list of tests to run), L527 (Step 4 run list, no worldFit), L535 (git add, no worldFit), L262 (`update tests/duelInterior.test.ts:43-44 only if its assertions change`); tests/worldFit.test.ts:L56; tests/duelInterior.test.ts:L41-42, L89, L102; tests/interiorCamera.test.ts:L9, L29; src/renderer/src/render/duel/interiorModel.ts:L13. · The Task 2 subagent will not see the failure. It then appears in Task 5 Step 5's full suite, in a task with no instruction to fix it, which breaks the 'tests pass unchanged except where a task names them' rule. · In Task 2, name tests/worldFit.test.ts:L56, tests/duelInterior.test.ts:L41-42/L89/L102 and tests/interiorCamera.test.ts:L9/L29. Give the new value (y 173 at stage 1, or derived from INTERIOR_BAND). Add worldFit.test.ts to the Step 4 run list and to the git add.

### [P2] R1-F4 The 'console and repair both in reach' tab test can pass without exercising the rule
The case puts player 0 on the first repair point in the Weapons console's room and expects `tabs.weapons === 'locked'`. If that tile is not in reach of the console, `consoleInReach` returns −1 and the tab is locked anyway, so the test passes without testing the `repairInReach < 0` condition. The plan itself is unsure such a point exists on the cutter. The cutter's Weapons repair point is (8,7), and duelControls reaches the console from (9,6). · plan L361-371 (the case and its hedge); src/renderer/src/sim/duel/tuning.ts:L13 (cutter W repair point [8,7]); tests/duelControls.test.ts:L68-69 ((9,6) is beside the Weapons console); src/renderer/src/app/duel/controls.ts:L21-41 (both helpers). · This is the one rule that separates sitting from repairing (spec §6.3, §8 'including a standing player next to an empty console with a repair in reach'). A vacuous pass leaves it untested. · Before the expectation, assert `consoleInReach(d, 0) === d.weapons` and `repairInReach(d, 0) >= 0`. If no tile on the cutter or the Hound satisfies both, test the rule by stubbing the two inputs (for example, factor the tab rule into a pure function of seat, console in reach and repair in reach).

### [P3] R1-F5 consoleHidden does not hide the console online in phases other than running and paused
Spec §6.1 says the console is null online in any phase other than `running`. The plan's `consoleHidden` uses `source.paused()` (online: phase === 'paused') and banner !== null. So the publication phases 'ended' and 'error' still draw a clickable console, although pump() drops all input outside 'running'. The deviation is not stated. · spec L234-236; plan L1005-1007; src/renderer/src/app/duel/onlineSource.ts:L135 (paused = phase 'paused'); src/renderer/src/net/contracts.ts:L116 (phases running, paused, ended, error); onlineDuel.ts:L200 (input dropped unless running). · In those phases the buttons look clickable but do nothing. · Add a `running()` to DuelViewSource (runtime: `!paused() && !ended()`; online: `publication()?.phase === 'running'`) and use it in `consoleHidden`. Or list this under the plan's deviations.

### [P3] R1-F6 Task 5 names the wrong runtime interface location; two of its test snippets are sketches
Task 5 points at 'the DuelRuntime interface near L40-50' and 'the one that lists `axes(): Axes;`'. L40-60 is FlightRuntime, and FlightRuntime also lists `axes(): Axes;`; DuelRuntime is at L167-207. The consoleHidden test refers to 'a running duel d (as the file's other tests build one)', but sceneUi.test.ts builds no duel and the snippet lists no imports (createDuel, layout, Outcome, consoleHidden). The Task 6 probe test also leaves out its `duelProbeFixture` import. · plan L937, L1014; src/renderer/src/app/duel/runtime.ts:L42-60 (FlightRuntime, `axes(): Axes;` at L47) and L167-207 (DuelRuntime, L188); plan L955-964; tests/sceneUi.test.ts:L1-6 (no duel); plan L1069-1073; tests/uiProbe.test.ts imports (no duelProbeFixture). · A subagent following the line hint could add `mode` and `uiHeld` to FlightRuntime and break createFlightRuntime. tsc would catch it, but only after the fact. · Point at `DuelRuntime` (runtime.ts:L167-207). Write the consoleHidden test out in full, with its imports and the duel fixture (parseShip(cutter), createDuel). Add the uiProbe import.

### [P3] R1-F7 Task 6's F10 step does nothing in the production build, and the CRT 'off' setting would not show the off-CRT button look anyway
Step 6 builds with `npx electron-vite build`, but F10 cycles the CRT setting only when `import.meta.env.DEV` is true. Also, the setting only changes the strength of the CRT effects. The off-CRT button palette (DIM/TEXT/AMBER) appears only when `crt` is false, which `crtActive(view)` gives only on the interior view. · plan L1084, L1090; src/renderer/src/app/crtBoot.ts:L12; src/renderer/src/main.ts:L58 (`dev: import.meta.env.DEV`); src/renderer/src/app/duel/scene.ts:L105 (`crt: crtActive(view)`); plan L20 (the off-CRT button states). · The look check will not produce the weapons-off screenshot as written, and it never checks the off-CRT button colours. · Seed the CRT localStorage key before launch (or use a dev build) for the 'off' strength. Check the off-CRT palette on the SHIP tab (interior) screenshot, where the tab strip draws with `crt` false.

## Verified
- Task 1 merge logic: I traced every test in the new duelInputMerge test file against the proposed createDuelKeyboard: the click hold, the four overlap orders (1/1 each), A/D across the two sources, press and last-wins lockTo, clearUi, clear followed by late releases, a repeat Space after clear, and blur. All give the asserted values. Today's behaviour is kept: PREVENT on keydown and keyup, repeat ignored for PRESS_CODES, no fireUp after a blur cleared Space (input.ts:L48-59 vs plan L192-205), and `clear` still runs on Tab and restart through runtime clearKeys (runtime.ts:L317, L300) and on blur.
- DuelKeyboard has no implementers outside input.ts. The only fake is the vi.mock in duelModeDispose.test.ts:L9, which TypeScript does not check. No test compares a key sample with toEqual (only pointer samples, duelInput.test.ts:L75-77), so the new `held` and `lockTo` fields break nothing.
- Import direction: uiBoundary.test.ts:L39-45 forbids UI value imports only from sim, authority, clientControl, net and src/network. boundary.test.ts:L12-29 checks only the deterministic roots and their transitive imports. Nothing forbids render → app/duel or ui → app/duel type imports, and no render file imports app/ today.
- Task 2 fixtures: createDuel seats player 0 at nav and player 1 at weapons (state.ts:L64-65; duelControls.test.ts:L40-45). The default lock is Room.Shields = 1 (state.ts:L116). canLaunch is true at round start (weapons.ts:L35-38, magazine > 0, no missile). Ship heading 64/256 gives 90°, and speed hypot(3,4) gives 5. The station tile is in reach (duelControls.test.ts:L31-33). The cutter's layout id gives 'CUTTER'. The status table at its longest (12 console rows) is 42+8+24·12+8 = 346, which ends above 492 and 508.
- Layout constants: READOUT_W = 220 − 16 = 204 (readoutModel.ts:L21), TABS_RIGHT 308, SIDE.x 1136, CONSOLE_RESERVE 228/156, stationTop 508 (Helm) and 492 (Weapons) all match spec §2. The Weapons notice x (1280+228−156)/2 = 676 is consistent with weaponsModel.ts:L88.
- tacticalModel edgePoint and spreadArrows have the shapes the plan edits (tacticalModel.ts:L187-203, call sites L281, L292). spreadArrows is exported, so a defaulted 4th parameter is safe.
- Button pattern: Stage sets pointer-events none (Stage.tsx:L7), and the CrtGlow and CrtScreen layers inherit it (CrtContext.tsx:L31, CrtScreen.tsx:L21). Sibling PixelText canvases set no pointer-events (PixelText.tsx:L37-38), so hit-testing reaches the button div. Box/boxCss, Panel, Bar, hex, useCrt and the CRT ramp keys (main, mid, hot, glass, faint, dim) exist with the props the plan uses.
- Task 4: ReadoutPanel's X/Y are module constants that can become per-render (ReadoutPanel.tsx:L19), and crtRowLook is exported (L25). MapOverlay's BX/BY layout matches the plan's edit (MapOverlay.tsx:L15-27). The uiConsole test's mount pattern matches uiDuel.test.tsx:L25-29, and makeUi returns store and actions (helpers/uiStore.ts:L20-26). The sink passes extra view fields through replaceEqualDeep (sinks.ts:L16-19).
- Task 5: scene.draw has no DuelViewSource fakes in tests. interiorZoomScene.test.ts:L38-60 uses the real runtime, which gains mode and uiHeld. main.ts: `actions` exists at L170 for startDuel, and startApp's callbacks already refer to `actions` (declared at L105) lazily, as onExit does (L85).
- Task ordering: each task consumes only what earlier tasks produce (1 → 2 → 3 → 4 → 5 → 6).

## Not verified
- Whether the jsdom version in use provides PointerEvent, so `fireEvent.pointerDown(..., { button: 0 })` carries `button` without the plan's fallback stub; I did not read package.json or node_modules.
- Whether the Hound (the app's ship) still fits the shorter interior band (h 678) without the fit scale dropping; I did not open hound.json.
- Whether the session router disposes the old mode before it creates the new one, so `setConsole(null)` from a disposed single-player mode can never empty the slot after an online session has filled it; createSessionRouter is outside the manifest.
- Whether tests/crtBezel.test.ts, lightsModel.test.ts and interiorCamera.test.ts assert anything beyond what I saw that depends on INTERIOR_BAND.y = 0; I read only the grep hits.
- Whether ESLint (react-hooks/exhaustive-deps) runs in CI and would flag Button's effects; I found no lint configuration in the manifest.
- The exact Weapons console tile on the cutter and whether repair point (8,7) is within inReachOfTile of it; that needs cutter.json and sim/interact, which I did not open.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `a62447c`. 7 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: consoleChange exported from scene.ts breaks the mocked-scene tests

Confirmed. Checked against duelModeDispose.test.ts L12-17 and onlineDuelSession.test.ts L60-72. `consoleChange` now lives in `app/duel/consoleChange.ts`, which no test mocks. Task 5's files, interfaces, wiring and test have moved with it.

## R1-F2 [P2]: Readout rows, help and reserves follow the view

Confirmed. Task 5's draw now computes `hidden` first and `onConsole = !hidden && view !== 'interior'`. That value chooses the reserves, the `console` flag on the rows and the help. A paused console screen therefore falls back to today's column.

## R1-F3 [P2]: INTERIOR_BAND breaks worldFit.test.ts

Confirmed. worldFit.test.ts L56 has y 152, which becomes 173. Task 2 now names every band-derived line, with the new value, and adds worldFit to the run list and the git add.

## R1-F4 [P2]: Repair-and-console tab test can pass vacuously

Confirmed. The tab rule is now a pure `consoleTabs()`, and the repair case tests it directly. The integration case asserts `consoleInReach` and `repairInReach` as preconditions.

## R1-F5 [P3]: consoleHidden online phases

Confirmed. Checked onlineSource.ts L135. `DuelViewSource.running()` was added: online it is phase `running`, locally it is not paused and not ended. `consoleHidden` uses it, and the change is stated as deviation 5.

## R1-F6 [P3]: Wrong runtime interface location; sketch tests

Confirmed. Task 5 now points at `DuelRuntime` at runtime.ts L167-207. The consoleHidden test is written out in full in its own file, with its imports. The uiProbe import has been added.

## R1-F7 [P3]: F10 does nothing in a production build

Confirmed. Checked crtBoot.ts L12. The step has been removed. The off-CRT palette is checked on the interior screenshot instead, where `crt` is false.

## Also changed

- The deviations list was renumbered: the Electron click check is now item 6.

## Files changed

- docs/superpowers/plans/2026-11-17-artemis-i-consoles.md

<!-- end -->

---

