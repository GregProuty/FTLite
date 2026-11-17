# Codex review exchange: crt-map-plan

Subject: `docs/superpowers/plans/2026-11-17-crt-map.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 3c296ea, effort high, 436 s, 7091607 in / 6887189 cached / 34948 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 5 rewrites store.ts from the prototype base and drops the sector HUD slice master added
Task 5 Step 3 replaces all of `ui/store.ts` with a version whose initial state is `duel: null, flight: null, latency: null, epochs: { duel: 0, flight: 0 }, crt: DEFAULT_CRT`. On the branch, `createUiStore` also sets `hud: null` and `epochs: { duel: 0, flight: 0, hud: 0 }`, and `UiState` requires both. · plan L1485-L1508 (L1506: `duel: null, flight: null, latency: null, epochs: { duel: 0, flight: 0 }, crt: DEFAULT_CRT`) vs src/renderer/src/ui/store.ts:L18 (`duel: null, flight: null, hud: null, latency: null, epochs: { duel: 0, flight: 0, hud: 0 }`); menuState.ts:L30 (`hud: import('../render/hudModel').HudModel | null`) and L34 (`epochs: { duel: number; flight: number; hud: number }`); sinks.ts:L19 and L27 (`createHudSink` bumps `s.epochs[key] + 1`); UiRoot.tsx:L12, L17 (reads `s.epochs.hud`); tests/uiSinks.test.ts:L42 (`expect(store.getState().epochs).toEqual({ duel: 0, flight: 0, hud: 0 })`); main.ts:L73 (`createHudSink(store, perf)`). · Step 9's `npx tsc -b` fails because `hud` is missing from the state literal and from `epochs`. `uiSinks.test.ts` L42 fails, and Step 9 expects it to pass unchanged. At runtime the sector HUD's epoch becomes NaN, so the HUD region's error-boundary reset key breaks. The executor cannot pass Task 5 as written. · Do not replace the whole file. Use two Edit steps: add `import { DEFAULT_CRT, type CrtSetting } from '../render/crt';`, change L18 to `duel: null, flight: null, hud: null, latency: null, epochs: { duel: 0, flight: 0, hud: 0 }, crt: DEFAULT_CRT`, and append `setCrtSetting`. Check every other 'replace the whole file' step in Tasks 4 and 5 against HEAD the same way (the others match today).

### [P2] R1-F2 Baselines and expected test counts are from fbba4da, before the master merge
Step 0.3 expects 283 files and 4040 tests, and Task 7 Step 1 expects 290 files and 4097 tests. Tasks 1 and 4 expect artGuards at 194 and 198 (from 189). The branch already has more tests: 292 `tests/**/*.test.*` files before this plan. artGuards now generates 4 + 3 + 2×84 render `.ts` files + 28 app `.ts` files = 203 tests. Master added `render/painted/*` (7 files, so 14 tests). · plan L181, L402 (`Tests 203 passed (203)` … `artGuards 194 (189 before…)`), L1243 (`Tests 231 passed (231)` … `artGuards 198`), L2201 (`Test Files 290 … Tests 4097`), L2452; tests/artGuards.test.ts:L12, L40, L49 (per-file generation); the Glob of src/renderer/src/render/**/*.ts lists 84 files (including painted/blastDraw … tokenDraw) and app/**/*.ts 28; the Glob of tests/**/*.test.{ts,tsx} gives 292 files. · A subagent that follows 'Expected' literally sees different totals at Step 0, Task 1 Step 6, Task 4 Step 7 and Task 7 Step 1. It may stop and report, or it may stop trusting the count check that is meant to catch a missed test. · State counts as deltas from the recorded Step 0 baseline: Task 1 artGuards = baseline + 5; Task 4 artGuards = baseline + 9; Task 7 = baseline + 57 tests in + 7 files; uiBoundary + 2. Alternatively recompute today's absolutes (artGuards 203 → 208 → 212) and drop 'at fbba4da' from Step 0.3.

### [P2] R1-F3 Task 7's 'sim unchanged' and 'theme unchanged' diffs use a base from before the master merge
Task 7 Step 2 runs `git diff fbba4da --stat` over the sim, authority, network, shared and main directories, and over theme.ts, EndCard.tsx and LatencyOverlay.tsx, and expects no output. HEAD now contains merge 869a27e, which brought master's work (art spike, interior zoom, React UI). Any master change to those paths since fbba4da shows up even though this plan changed nothing there. · plan L2208-L2212 (`git diff fbba4da --stat -- src/renderer/src/sim … src/main`; `git diff fbba4da --stat -- src/renderer/src/render/theme.ts …`); the brief's git log: 869a27e `Merge branch 'master' into crt-map` after 6cb6345. · The determinism-boundary check gives a false failure, or trains the executor to ignore output. The check that matters is that the plan's own commits change none of those paths. · Record `BASE=$(git rev-parse HEAD)` in Step 0.1 (at 3c296ea or later) and diff against `$BASE` in Task 7 Step 2. Alternatively use `git diff $(git merge-base HEAD master)`. Keep the SIM_VERSION = 39 and golden test checks.

### [P3] R1-F4 menuState.ts line anchor is stale
The Task 5 Files list says to modify `src/renderer/src/ui/menuState.ts:416`. The `latency: readonly string[] | null;` field it edits is at line 32. The edit uses the old string, which is unique, so it still applies. · plan L1265 (`ui/menuState.ts:416`), L1525-L1535; src/renderer/src/ui/menuState.ts:L32. · A misleading anchor makes the executor search, and it hints that the plan was not re-anchored after the merge. · Change the anchor to `menuState.ts:32` (inside `interface UiState`).

### [P3] R1-F5 The grid's major lines use `dim`, but the spec says `faint`, and no spec note covers it
Decision 2 maps `GRID` to 'major `dim` at 0.5, minor `faint` at 1'. Spec §2 says 'grid `faint`'. Spec notes 1-6 list the other deviations (lock block `mid`, FeelPanel, frame-time bar) but not this one. · plan L52 and L1132 (`color: l.major ? CRT.dim : CRT.faint, alpha: l.major ? 0.5 : 1`); spec L27 ('grid `faint`'); plan L2470-L2477 (spec notes, no grid entry). · The brief says the plan may deviate from the spec only when it states and justifies the deviation; this one is silent (the change itself is harmless). · Add a spec note: major lines `dim` at 0.5 so that 500-unit squares read apart from the 250-unit minors at `faint` (both still ramp colours). Otherwise draw both in `faint`.

## Verified
- Task 1 interfaces: `FeelStorage` (render/feel.ts:L30) and `KeySource` (app/feelBoot.ts:L6, `addEventListener(type: 'keydown', cb: (e: { code: string }) => void)`) exist with the shapes `crt.ts`, `crtBoot.ts` and the test use; nothing in src binds F10 today.
- Task 2: `wedgeSegments()` exists at tacticalModel.ts:L306 and returns `{ room, poly }[]`.
- Task 3: readoutModel.ts L22-L86 match the plan's pre-image line for line (ReadoutRow L22-L29 through the `return rows;` at L84, with `/** Key help` at L87). The replacement uses only existing imports. `createDuel(layout, seed)`, `disposeDuel`, `parseShip`, `Room`, `placeMissile(state, i, flight)` and `REPAIR_UNITS` exist. duelReadout.test.ts compares only label/value tuples (L22-L64), so the new `emphasis` key cannot break it.
- Task 4: the current tacticalLayer.ts (L1-L219) has every constant and literal in Decision 2's table (SPACE 0x05060a, GRID, CONTOUR, EDGE, PLANET*, ROCK*, PATH=GOOD, VELOCITY/MISSILE_PATH/LOCK=AMBER, FLAME, ARROW_COLOUR, DAMAGE, 0x000000 chevron stroke, 0x0b1018 room stroke, SHIELD_RING, DIM/TEXT/GOOD text). Master added no new colour to it. fxModel.ts L7 and L17-L18 match the old strings exactly. The fx colours are read only by the tactical layer: impactModel, interiorView, runtime, onlineSource and weaponsModel import only `ViewEvent`, `hitsCrew`, `interpolatedMissile` and `FxState`. duelWeaponsView.test.ts:L149 compares colours symbolically, as `[BEAM_HIT, BEAM_MISS]`.
- Task 4 types used by crtColours.test.ts exist: `ringDraw` (tacticalModel.ts:L176), ShipDraw, TacticalDraw (grid.spacing, overlay, stars), ArcDraw, WeaponsDraw, LockDraw, MissileDraw, EffectDraw and CombatDraw (weaponsModel.ts:L20-L31).
- Task 5 whole-file replacements other than store.ts match the current files plus only the CRT additions: views.ts, Panel.tsx, Bar.tsx, ReadoutPanel.tsx, MapOverlay.tsx, Banners.tsx, FeelPanel.tsx, DuelUi.tsx and FlightUi.tsx (all read at HEAD).
- Task 5 helpers exist with the assumed shapes: `useNow(periodMs, phaseMs)` (ui/useNow.ts:L5), `hex(rgb, alpha?)` (stage/color.ts:L2), Box with `attrs` and `style` (Box.tsx:L6), `useUi` (context.tsx:L13), PixelText's `canvas[data-text]` (PixelText.tsx:L37), Stage with pointer events off (Stage.tsx:L7), `UiRoot({ menu?: boolean })`, the sinks, and `makeUi` (tests/helpers/uiStore.ts).
- Task 5 fixture edits: the old strings in tests/uiDuel.test.tsx:L24 and L92 and tests/uiSinks.test.ts:L9 and L29 exist exactly. uiProbe.ts:L21-L22 (`    overlay: null\n  };`) matches. duelModeDispose.test.ts:L13-L14 and onlineDuelSession.test.ts:L62-L67 pass untyped objects to mocked scenes. No script under scripts/ builds a DuelUiView or FlightUiView. The producers are only scene.ts, flightMode.ts and uiProbe.ts.
- Task 5 and 6 scene edits: scene.ts:L8 (`import type { Renderer } …`), L96-L97 (`const model = tacticalModel(input);` / `layer.draw(model, combatModel(input));` at 8-space indent) and L102 (`        end: overlay.end,`) match. `DuelView` = 'helm' | 'weapons' | 'interior' (runtime.ts:L156) fits `CrtView`.
- Task 6: flightMode.ts:L7 (`import { computeLetterbox } …`), L61 (`    layer.draw(model);`) and the L62 suffix `overlay: mapOverlayOf(model.overlay) });` match, and `deps.renderer` exists (L17, L28). renderer.ts:L29, L43, L70 and L94 match the four old strings.
- Task 6: main.ts:L19 (`import { createUiStore, setLayout } from './ui/store';`), L29 (`import { installFeel } …`), L54 (the `/** The app (main menu spec…` line), L72 (the startApp store line) and the two `bootFeel(renderer);\n  const store = createUiStore({ onlineAvailable: false });` pairs at L139-L140 and L158-L159 match. startProbe (L176) has no bootFeel, so 'replace all' hits exactly two. `Renderer` is imported (L30). `renderer` is in scope at L72.
- tests/interiorZoomScene.test.ts:L48-L60 builds a fake renderer without `crt()` but draws the scene only in the interior view, so the scene's new `renderer.crt()` call (console branch only) is never reached there.
- uiBoundary: it generates one test per ui `.ts`/`.tsx` file in the value-import block and none of the new UI files sits under the no-UI-lib roots (tests/uiBoundary.test.ts:L34, L40), so +2 for CrtContext.tsx and CrtScreen.tsx is right. artGuards generates two tests per render `.ts` and one per app `.ts`, so +9 for the five new files is right.
- crtBezel.test.ts imports exist: INTERNAL_W/H (shared/resolution.ts:L4-L5), READOUT_COLUMN, READOUT_MARGIN/ROWS/W, FONT_NATIVE/FONT_SIZE/LINE/PAD/textPx (theme.ts:L22-L39), createCamera and pan (camera.ts:L26, L61), createTacticalState (sim/tactical/state.ts:L135), combatModel, FEEL_PANEL_W/MARGIN/H (feelModel.ts:L83-L85), SCALE_BAR_MAX_PX.
- Determinism: no task edits sim, authority, network, shared or main. SIM_VERSION is still 39 (sim/tuning.ts:L7). The new pure modules import only render and app code. performance.now() calls go only in app/duel/scene.ts and flightMode.ts, which the determinism guard does not cover.
- package.json pins pixi.js 8.19.0 and has no pixi-filters yet. package-lock.json exists at the repo root. No test inspects package.json dependencies.
- docs/gates.md:L758 has the exact `## Helm demo (Helm spec §16; H-2 spec §8 to §11)` anchor for Task 7 Step 8.

## Not verified
- Whether pixi-filters@6.1.5 publishes the `pixi-filters/advanced-bloom` subpath and accepts the `{ threshold, bloomScale, brightness, blur, quality }` options with Pixi 8.19.0, and its peer range. Reading node_modules is off limits and the package is not installed yet; the plan's prototype claims it worked.
- Whether `git diff fbba4da` over sim, shared, main, theme.ts, EndCard.tsx and LatencyOverlay.tsx prints anything today. The available tools could not run git, so finding 3 rests on the merge topology, not an observed diff.
- The exact current suite total (the plan's 4040/4097). I counted test files (292) and derived the artGuards count (203) from the file globs; the suite was not run, as instructed.
- That crtFilter.test.ts (jsdom) can build BitmapText and AdvancedBloomFilter under jsdom 31; the plan says the prototype ran it.
- Whether Windows or Electron gives F10 a system meaning (menu-bar activation) that would swallow or double-handle the dev F10 cycle; not checked.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against `3c296ea`. 5 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Task 5 drops the hud slice

Confirmed (store.ts:L18, menuState.ts:L30-L34, uiSinks.test.ts:L42). The replacement keeps hud and epochs.hud, and the step now says to diff against the current file before writing.

## R1-F2 [P2]: Stale counts

Confirmed. Counts are now deltas from the Step 0 baseline.

## R1-F3 [P2]: The diff base predates the merge

Confirmed. Step 0 records BASE and Task 7 diffs against it.

## R1-F4 [P3]: Stale anchor

Confirmed. Changed to menuState.ts:32.

## R1-F5 [P3]: Undocumented grid colour

Confirmed. Added spec note 7.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-17-crt-map.md

<!-- end -->

---

# Round 2 (delta, reviewing a0904cc, effort medium, 36 s, 118167 in / 97898 cached / 3362 out)

Verdict: ready with P2s

## Prior findings
- R1-F1: resolved — The replacement at plan L1487-L1521 is today's src/renderer/src/ui/store.ts (L1-L27) line for line, plus three changes: the `DEFAULT_CRT, type CrtSetting` import (L1492), `crt: DEFAULT_CRT` on the state line (L1506, which keeps `hud: null` and `epochs: { duel: 0, flight: 0, hud: 0 }`) and `setCrtSetting` (L1517-L1520). The added instruction at L1485 to diff against the current file first is a sensible guard.
- R1-F2: still open — Task 1 (L402) and Task 7 Step 1 (L2201) are fixed. Task 4 Step 7 (plan L1243) is only half fixed. It still expects the absolute `Tests 231 passed (231)`, which is 9+1+2+21 plus the old artGuards count of 198. Since the Step 0 artGuards count is now higher (203 by round 1's count), the real total is 245, so the line contradicts the new 'Step 0 count + 9' clause next to it. The stale parenthetical '(189 before this plan, ...)' also remains. Fix: drop `Tests 231 passed (231)`, or restate it as '33 + (artGuards Step 0 count + 9)', and delete '189 before this plan,'. The prototype-verification table at L39 still lists the old absolutes. That is acceptable as a record of history, but L2452's example (`4097 tests in 290 files`) is worth labelling as the prototype figure.
- R1-F3: still open — Task 7 Step 2 (plan L2208, L2211) now runs `git diff $BASE --stat`. `BASE` is only a shell variable set in Step 0.3 (L181), and the role says a fresh subagent runs each task alone, so `$BASE` will be empty in Task 7's shell. With an empty `$BASE` the command becomes `git diff --stat -- <paths>`, which compares the working tree with the index. That prints nothing for committed changes, so the determinism-boundary check passes silently even if a plan commit touched the sim. This is worse than the original false failure. Fix: use a literal base that every task can see, e.g. `git diff 869a27e --stat -- …`. The commits after the merge, 3c296ea and a0904cc, change only docs, so 869a27e is a valid pre-plan base. Alternatively have Task 7 compute the base itself, e.g. `BASE=$(git merge-base HEAD master)`, and state it as part of the step.
- R1-F4: resolved — The Files list at plan L1265 now anchors `menuState.ts:32`, the line of `latency: readonly string[] | null;` inside `interface UiState` that round 1 cited.
- R1-F5: resolved — Spec note 7 (plan L2478) states the deviation: major lines `dim` at 0.5, minor lines `faint`. It gives the reason (500-unit squares read apart from the 250-unit minors) and notes that both are ramp colours.

## Verified
- The plan's store.ts replacement (plan L1487-L1521) differs from the current src/renderer/src/ui/store.ts:L1-L27 only by the crt import, the `crt: DEFAULT_CRT` field and `setCrtSetting`.
- The Task 5 Step 8 fixture edits (plan L1947) match old strings that exist today: tests/uiSinks.test.ts:L9 `end: null, banners, overlay: null });` and L29 `snapHint: false, paused: true }) };`. uiSinks has 5 tests (L12, L18, L27, L36, L47), as plan L1954 expects.
- No absolute test counts remain in Task 1 (L402) or Task 7 Step 1 (L2201). The only leftovers are at L1243 (still open) and in the historical record at L39 and L2452.
- The diff touches no code edits outside the count and diff-base text, the store literal, the anchor and spec note 7, so there are no regressions in other touched regions.

## Not verified
- I did not re-check that the plan's grid code at L52 and L1132 still matches spec note 7's wording. That code is outside the diff, and round 1 had already quoted it as major `dim` at 0.5, minor `faint`.
- I did not re-check src/renderer/src/ui/menuState.ts:L32; I relied on the line round 1 cited.
- I did not compute today's exact artGuards baseline; by the round-1 count it would be 203.

---

# Round 2 response (plan revised)

Reviewed `round-2.json` against `a0904cc`. 2 accepted (both reopened), 0 rejected, 0 deferred.

## R1-F2 [P2]: Task 4 still expects an absolute count (reopened)

Confirmed (plan L1243). It now reads 33 + (the artGuards Step 0 count + 9). The stale 189 is removed and the 4097 example is labelled as the prototype figure.

## R1-F3 [P2]: $BASE is empty in a fresh shell (reopened)

Confirmed. Task 7 now diffs against the literal 869a27e (commits after it are docs only), and the BASE instruction was removed from Step 0.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-17-crt-map.md

<!-- end -->

---

