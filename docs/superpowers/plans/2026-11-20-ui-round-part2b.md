# UI Round Part 2b (Fill the Window) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game fills any window: no bars, smooth scaling, the map and ship view showing more space, and every panel anchored to an edge or corner.

**Architecture:** One pure function, `stageFit(winW, winH)`, decides the stage size (internal height 720 with the width following the window; narrower than 16:9 keeps width 1280 and grows the height) and the scale (smooth, any factor). Today's `computeLetterbox` callers switch to it: the Pixi stage, the React layout slice (which gains `stageW`/`stageH`) and the three pointer converters. The map and ship-view viewports become the live stage size. The stage-dependent rects (bottom or right anchored) become functions of a `StageSize`: `consoleLayout(stage)`, the HUD's power-panel helpers and the overlay positions. Components read the stage from the store. The top-left rects stay constants.

**Tech Stack:** TypeScript, Pixi v8, React + zustand, Vitest, Electron/web.

**Spec:** `docs/superpowers/specs/2026-11-20-ui-round-design.md` §2.1 and §2.5. §2.4a's layout is the 1280×720 case of this plan.

## Global Constraints

- **Stage size:** `w = max(1280, round(720 × winW / winH))` and `h = 720` when `winW / winH ≥ 16/9`; otherwise `w = 1280` and `h = round(1280 × winH / winW)`. So the short side is always 720 or 1280 units and nothing is smaller than today. `INTERNAL_W`/`INTERNAL_H` stay as the 16:9 reference and the minimum.
- **Scale:** smooth, `scale = min(winW / w, winH / h)` (any factor; no half steps), offsets `floor((win - stage × scale) / 2)` (0 or under a pixel).
- **Anchors:** every panel keeps its §2.4a margins from the edge it belongs to. Top-left items (tabs, the HUD's top block, the own ship window, `STATION.x`) stay constants. Right-anchored items (the contact window, the FPS readout, the scale bar, the feel panel, the sector HUD's right columns) use `stage.w`. Bottom-anchored items (the station blocks, the Flight block, the HUD power panel, the scale bar, the snap hint, the sector HUD's bottom blocks) use `stage.h`. Centred items (the pause line, the alert, the end card, the headline, the summary card) centre on `stage.w / 2`, or in the map's top band where §2.4a says so.
- **Live:** a window resize re-lays out everything on the next frame. A Pixi layer created with a viewport resizes with it.
- **No sim change.** SIM_VERSION is unchanged (66 on master). No golden or fixture change.
- Pixel art stays crisp: the interior's fit still gives whole screen pixels per art pixel at any stage scale.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (a subagent uses its own model's name).

## Working rules (read once)

- **Branch and worktree:** `ui-round-2b` in `C:\Users\djuar\FTLite\.worktrees\ui-round-2b`, from master; junctions as in earlier plans (`node_modules`, `services\signalling\node_modules`). Git Bash from the worktree root. Never touch other checkouts. Never use bare `git stash`. Make code edits with the Edit tool, not sed.
- **Tests:** targeted `npx vitest run <files>`; `npm run typecheck`; full suite `npx vitest run --maxWorkers=4` after `npx electron-vite build`. Never run two vitest processes at once. Load-sensitive files are re-run alone (director, run, snapshot, gate-*, duelGates, power).
- **Defaults keep tests honest:** every new `stage` parameter defaults to `REFERENCE_STAGE` (1280×720), so the existing 1280×720 tests stay as they are and keep passing. New tests cover the other shapes. Don't rewrite a 1280×720 assertion unless its subject changed.
- **Report:** `docs/superpowers/research/2026-11-20-ui-round-2b-report.md`.

---

### Task 1: Worktree, base and the stage fit

**Files:**
- Modify: `src/shared/resolution.ts`, `src/renderer/src/render/letterbox.ts`
- Test: `tests/stageFit.test.ts` (create), `tests/letterbox.test.ts`, `tests/render.test.ts`
- Create: the report

**Interfaces:**
- Produces (resolution.ts): `export interface StageSize { readonly w: number; readonly h: number }`, `export const REFERENCE_STAGE: StageSize = { w: INTERNAL_W, h: INTERNAL_H }`, `export function stageSizeFor(winW: number, winH: number): StageSize`.
- Produces (letterbox.ts): `export function stageFit(winW: number, winH: number): { w: number; h: number; scale: number; offsetX: number; offsetY: number }`. `computeLetterbox` is deleted at the end of Task 2, once nothing calls it.

- [ ] **Step 1:** Create the worktree and junctions. Record `U2B_BASE` and the SIM version. Write the report's `## Task 1` section. The suite baseline may be taken from master's last verification if the base adds only docs; say which.
- [ ] **Step 2: The failing test.** `tests/stageFit.test.ts`:
```ts
// UI round spec §2.1: the stage follows the window: height 720 with the width following (wide), or width 1280 with the
// height following (narrow); the scale is smooth; the stage fills the window to within a pixel.
import { describe, expect, it } from 'vitest';
import { REFERENCE_STAGE, stageSizeFor } from '../src/shared/resolution';
import { stageFit } from '../src/renderer/src/render/letterbox';

describe('stageSizeFor / stageFit (spec §2.1)', () => {
  it.each([
    [1280, 720, 1280, 720], [1920, 1080, 1280, 720], [2560, 1080, 1707, 720], [3840, 1080, 2560, 720],
    [1024, 768, 1280, 960], [1680, 1050, 1280, 800], [800, 600, 1280, 960], [1366, 768, 1281, 720]
  ])('window %ix%i -> stage %ix%i', (ww, wh, sw, sh) => {
    expect(stageSizeFor(ww, wh)).toEqual({ w: sw, h: sh });
  });
  it('never smaller than the reference', () => {
    for (const [ww, wh] of [[300, 900], [2000, 200], [640, 365]] as const) {
      const s = stageSizeFor(ww, wh);
      expect(s.w).toBeGreaterThanOrEqual(REFERENCE_STAGE.w); expect(s.h).toBeGreaterThanOrEqual(REFERENCE_STAGE.h);
    }
  });
  it('the scale is smooth and the stage fills the window within a pixel', () => {
    for (const [ww, wh] of [[1500, 900], [2560, 1080], [1024, 768], [1366, 768], [1920, 1080]] as const) {
      const f = stageFit(ww, wh);
      expect(Math.abs(f.w * f.scale - ww)).toBeLessThan(1.01);
      expect(Math.abs(f.h * f.scale - wh)).toBeLessThan(1.01);
      expect(f.offsetX).toBeGreaterThanOrEqual(0); expect(f.offsetX).toBeLessThan(1);
      expect(f.offsetY).toBeGreaterThanOrEqual(0); expect(f.offsetY).toBeLessThan(1);
    }
    expect(stageFit(2000, 1000).scale).toBeCloseTo(1000 / 720, 6);   // wide: stage 1440x720, not a half step
    expect(stageFit(1500, 900).scale).toBeCloseTo(900 / 768, 6);    // narrow: stage 1280x768
  });
});
```
- [ ] **Step 3:** Run it: FAIL.
- [ ] **Step 4: Implement.** In `resolution.ts` (no DOM words: `tests/boundary.test.ts` scans shared/):
```ts
/** UI round spec §2.1: the stage's size in internal px for a window: height 720 with the width following the window
 *  when it is at least 16:9, else width 1280 with the height following; never smaller than the reference. */
export interface StageSize { readonly w: number; readonly h: number }
export const REFERENCE_STAGE: StageSize = Object.freeze({ w: INTERNAL_W, h: INTERNAL_H });
export function stageSizeFor(winW: number, winH: number): StageSize {
  const ww = Math.max(1, winW), wh = Math.max(1, winH);
  return ww * INTERNAL_H >= wh * INTERNAL_W
    ? { w: Math.max(INTERNAL_W, Math.round((INTERNAL_H * ww) / wh)), h: INTERNAL_H }
    : { w: INTERNAL_W, h: Math.max(INTERNAL_H, Math.round((INTERNAL_W * wh) / ww)) };
}
```
  Update the file's header comment: the constants are the reference and the minimum; the stage itself follows the window. In `letterbox.ts`, add:
```ts
/** UI round spec §2.1: the stage for a window and its smooth scale; the stage fills the window to within a pixel. */
export function stageFit(winW: number, winH: number): { w: number; h: number; scale: number; offsetX: number; offsetY: number } {
  const { w, h } = stageSizeFor(winW, winH), scale = Math.min(winW / w, winH / h);
  return { w, h, scale, offsetX: Math.floor((winW - w * scale) / 2), offsetY: Math.floor((winH - h * scale) / 2) };
}
```
- [ ] **Step 5:** Run: PASS; typecheck clean. Commit: `feat(ui-round-2b): stageFit: the stage follows the window, the scale is smooth`.

---

### Task 2: The stage drives the canvas, the UI layer and the pointer

**Files:**
- Modify: `src/renderer/src/render/renderer.ts:100-110`, `src/renderer/src/main.ts` (the four `resize` closures: 191-198, 239-244, 259-264, 281-286), `src/renderer/src/ui/menuState.ts:35` (`LayoutSlice`), `src/renderer/src/ui/store.ts:23`, `src/renderer/src/app/duel/duelMode.ts:63-66`, `flightMode.ts:39-42`, `onlineDuel.ts:119-122`, `src/renderer/src/render/worldFit.ts:15-19` (check only), `src/renderer/src/render/letterbox.ts` (delete `computeLetterbox`)
- Create: `src/renderer/src/ui/stage/useStage.ts`
- Tests: `tests/letterbox.test.ts`, `tests/render.test.ts` (rewrite to `stageFit`), `tests/uiMenuState.test.ts:111`, `tests/uiSinks.test.ts`, `tests/uiStage.test.tsx`, `tests/uiCrt.test.tsx` (layout literals gain `stageW`, `stageH`), `tests/worldFit.test.ts` (one non-half-step case)

**Interfaces:**
- Produces: `LayoutSlice` gains `stageW: number; stageH: number` (initial 1280, 720). `export function useStage(): StageSize` (`ui/stage/useStage.ts`, a zustand selector returning `{ w: s.layout.stageW, h: s.layout.stageH }` with shallow equality). `Renderer.stage(): StageSize` (the current stage size; `stageScale()` stays and is now the smooth scale). `pointerToStage(canvas: HTMLCanvasElement, cx: number, cy: number): { x: number; y: number }` in `app/duel/pointerToStage.ts` (shared by the three converters).

- [ ] **Step 1: Failing tests.** Rewrite `tests/letterbox.test.ts` and `tests/render.test.ts` to pin `stageFit`: 1280×720 gives scale 1 at offset 0 with stage 1280×720, and 1920×1080 gives scale 1.5. The old half-step case `(1800, 1000)` becomes stage 1296×720 at scale 1000/720. Add `tests/pointerToStage.test.ts`: for a fake canvas whose `getBoundingClientRect` is `{ left: 0, top: 30, width: 2560, height: 1080 }`, `pointerToStage(c, 2560, 1110)` is about `{ x: 1707, y: 720 }`, and `(1280, 570)` is about `{ x: 853.5, y: 360 }` (`toBeCloseTo(…, 0)`). Add a `worldFit.test.ts` case with stage scale 1.37: `snapWorldScale` gives whole screen pixels per art pixel (`2 × worldScale × stage` is an integer ≥ 1).
- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3: Implement.**
  - `renderer.ts`:
```ts
    resize(winW, winH) {
      const f = stageFit(winW, winH);
      app.renderer.resize(winW, winH);
      app.stage.scale.set(f.scale); app.stage.position.set(f.offsetX, f.offsetY);
      if (f.w !== size.w || f.h !== size.h || f.scale !== stage) { stage = f.scale; size = { w: f.w, h: f.h }; projectiles.reset(); }
    },
    stageScale: () => stage,
    stage: () => size,
```
    with `let size: StageSize = REFERENCE_STAGE;` beside `let stage = 1;`, and `stage(): StageSize` added to the `Renderer` interface. If `projectiles.reset()` on every resize step visibly clears shots while a window drags, gate it on the size alone and note it in the report.
  - `main.ts`: each `resize` closure uses `const f = stageFit(w, h)` and `setLayout(store, { scale: f.scale, offsetX: f.offsetX, offsetY: f.offsetY, stageW: f.w, stageH: f.h, dpr })` (the probe and flight closures likewise). Remove the `computeLetterbox` and `INTERNAL_*` imports it no longer needs.
  - `menuState.ts` `LayoutSlice`: add `stageW: number; stageH: number` with a doc line. `store.ts` initial: `stageW: INTERNAL_W, stageH: INTERNAL_H`. `setLayout`'s type already takes a partial.
  - `ui/stage/useStage.ts`:
```ts
// UI round spec §2.1: the stage size (internal px) the UI lays out on, from the layout slice.
import { useShallow } from 'zustand/react/shallow';
import type { StageSize } from '../../../../shared/resolution';
import { useUi } from '../context';
export function useStage(): StageSize { return useUi(useShallow((s) => ({ w: s.layout.stageW, h: s.layout.stageH }))); }
```
    If `useShallow` is not available in the installed zustand, select the two numbers separately and build the object with `useMemo`.
  - `app/duel/pointerToStage.ts`:
```ts
// UI round spec §2.1: a window point to stage px, through the same fit the renderer uses (the canvas fills the window
// below the session strip).
import { stageFit } from '../../render/letterbox';
export function pointerToStage(canvas: { getBoundingClientRect(): { left: number; top: number; width: number; height: number } }, cx: number, cy: number): { x: number; y: number } {
  const r = canvas.getBoundingClientRect(), f = stageFit(r.width, r.height);
  return { x: (cx - r.left - f.offsetX) / f.scale, y: (cy - r.top - f.offsetY) / f.scale };
}
```
    The three converters (duelMode, flightMode, onlineDuel) call it.
  - Delete `computeLetterbox` when `git grep -n computeLetterbox -- src` is empty.
  - `worldFit.ts`: if `snapWorldScale` already yields whole screen pixels per art pixel at any stage (n = floor(2 × fit × stage), worldScale = n / (2 × stage)), leave it and update its comment ("any stage scale, UI round §2.1"). If not, fix it to that rule.
- [ ] **Step 4:** Update the layout-slice literals in tests (`stageW: 1280, stageH: 720`). Run the touched tests plus `tests/uiDuel.test.tsx`, `tests/terminalLayout.test.ts` and `tests/crtBezel.test.ts` (they must still pass at the reference stage); typecheck clean.
- [ ] **Step 5:** Commit: `feat(ui-round-2b): the stage size and smooth scale drive the canvas, the UI layer and the pointer`.

At this commit a wide window shows the UI in the left 1280 px of a wider stage. Tasks 3-5 fill it.

---

### Task 3: Live viewports for the map and the ship view

**Files:**
- Modify: `app/duel/scene.ts:214` (and its viewport uses), `app/duel/duelMode.ts:49`, `app/duel/flightMode.ts:30`, `app/duel/onlineDuel.ts:585`, `app/duel/onlineSource.ts:132-239`, `app/duel/runtime.ts` (viewport field), `render/tactical/tacticalLayer.ts:65-112, 235`, `render/duel/interiorModel.ts:20` (`INTERIOR_BAND`), `render/duel/interiorView.ts:24, 74, 79, 126-138`, `render/duel/shipControls.ts:9, 21`, `render/twinkleLayer.ts:60`, `render/interiorFeel.ts:102`, `render/callouts.ts:56`
- Test: `tests/liveViewport.test.ts` (create)

**Interfaces:**
- Consumes: `renderer.stage()`.
- Produces: the runtimes and the online source take `viewport: Viewport` as a **live object** that the mode mutates in place each frame from `renderer.stage()` (`viewport.w = s.w; viewport.h = s.h`), so every holder of the reference sees the new size without re-plumbing. `TacticalLayer.resize(vp: Viewport): void` rebuilds `bg`, the star tiling and `bloom.filterArea` when the size changed (a no-op otherwise). `interiorBand(stage: StageSize = REFERENCE_STAGE): { x; y; w; h }` replaces the `INTERIOR_BAND` constant (`{ x: 0, y: 42, w: stage.w, h: stage.h - 42 }`). Keep `INTERIOR_BAND` exported as `interiorBand()` for the reference, so tests stay. `createInteriorView` and `shipControlAt` take the band from the current stage (`renderer.stage()`). The backdrop's `coverFit` re-runs on a stage change. `callouts.ts` clamps to the current stage width.

- [ ] **Step 1: Failing test.** `tests/liveViewport.test.ts`:
  - `interiorBand({ w: 1707, h: 720 })` is `{ x: 0, y: 42, w: 1707, h: 678 }`, and the default is the 1280 band.
  - A duel runtime created with a viewport object whose `w` is then set to 1707 centres the follow camera on the new width (`worldToScreen(camera, vp, ship.x, ship.y).x` is 853.5 after one `frame`). Use `createDuelRuntime`'s existing test harness (`git grep -l "createDuelRuntime" -- tests`, `tests/duelRuntime.test.ts`).
  - `createTacticalLayer` then `resize({ w: 1707, h: 720 })` resizes its background (the layer's `bg` width; expose a test hook `debugSize()` returning the current `{ w, h }` if nothing else shows it).
- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3: Implement.**
  - Each mode keeps one `viewport` object and updates it at the top of every frame from `renderer.stage()`. The scene does the same with its own `viewport` and calls `layer.resize(viewport)` each frame (cheap when unchanged).
  - In `tacticalLayer.ts`, keep `w`, `h` as `let`, and move the size-dependent setup into a `resize` that clears and redraws `bg`, rebuilds the star tiling, and resets `bloom.filterArea` and the stars' position base.
  - The interior: `duelFit(width, height, stage, rect?, band = interiorBand())`. `interiorView` reads `interiorBand(renderer.stage())` each draw, rebuilding the clip rect when it changes. `shipControls.ts` takes the band as a parameter from the scene (`interior.placement()` already carries the fit, so pass the band alongside it).
  - `twinkleLayer`/`interiorFeel`: re-cover-fit the backdrop when the stage changes (track the last size).
  - `callouts.ts`: clamp to `stage.w` passed in by its caller.
- [ ] **Step 4:** Run the new test, `tests/duelRuntime.test.ts`, `tests/duelInterior.test.ts`, `tests/interiorCamera.test.ts`, `tests/interiorZoomScene.test.ts`, `tests/worldFit.test.ts`, `tests/crtFilter.test.ts` and `tests/tacticalModel.test.ts`; typecheck clean.
- [ ] **Step 5:** Commit: `feat(ui-round-2b): the map and the ship view use the live stage size`.

---

### Task 4: Anchored console layout and hit tests

**Files:**
- Modify: `render/duel/consoleLayout.ts`, `render/duel/shipHudModel.ts` (power helpers), `app/duel/flightPointer.ts`, `app/duel/scene.ts` (rect uses), every component that reads a stage-dependent rect: `ui/duel/DuelUi.tsx`, `HelmStation.tsx`, `WeaponsStation.tsx`, `ScienceStation.tsx`, `FlightStation.tsx`, `ContactWindow.tsx`, `TargetingLine.tsx`, `ShipHud.tsx`, `SitCard.tsx`, `Banners.tsx`, `MapOverlay.tsx`, `EndCard.tsx`, `FeelPanel.tsx`, `ui/FpsCounter.tsx`, `ui/stage/CrtScreen.tsx`, `render/crt.ts` (`insideBezel` callers)
- Test: `tests/anchoredLayout.test.ts` (create)

**Interfaces:**
- Produces (consoleLayout.ts): `export interface ConsoleLayout { readonly stage: StageSize; readonly stationTop: (s: 'helm' | 'weapons' | 'science') => number; readonly FLIGHT: Rect; readonly CONTACT: Rect; readonly CONTACT_BOX: Rect; readonly CONTACT_RESERVE: number; readonly INFO_BAND: { left: number; right: number }; readonly HUD_POWER: Rect; readonly weaponCard: (w: 'laser' | 'autocannon' | 'torpedo') => …; readonly weaponPips: (slot: 0 | 1 | 2) => …; readonly flightCard: (slot: 0 | 1) => … }` and `export function consoleLayout(stage: StageSize = REFERENCE_STAGE): ConsoleLayout` (memoised per `w×h`). The module keeps today's exported names as the reference layout's values (`export const { FLIGHT, CONTACT, … } = consoleLayout()`, and `stationTop`, `weaponCard`, `weaponPips`, `flightCard` as the reference's functions), so code and tests at 1280×720 don't change. The stage-independent constants (`EDGE`, `TABS`, `TABS_RIGHT`, `HUD_TOP`, `STATION`, `OWN_SHIP*`, `CONSOLE_RESERVE`, `STATUS_RESERVE`) stay plain constants. `useConsoleLayout(): ConsoleLayout` in `ui/stage/useStage.ts` returns `consoleLayout(useStage())`.
- shipHudModel: `powerNameY(stageH = INTERNAL_H)`, `coolantY(stageH)`, `heatY(stageH)`, `powerBarY(k, stageH)`, `powerPanel(stageH)`, using `bottom = stageH - 12`. `HUD.power.bottom` stays 708 as the reference value.
- flightPointer: `onFlightMap(p, contactShown, layout = consoleLayout())`, `onWeaponsMap(p, contactShown, layout)`, `onHelmMap(p, contactShown, layout)`, `helmSteer({ …, layout? })`, `torpedoSteer({ …, layout? })`, `flightPointer({ …, layout? })`. They build their block lists from `layout` and bound by `layout.stage` (not `INTERNAL_W`/`INTERNAL_H`). The scene passes `consoleLayout(viewport)`.

- [ ] **Step 1: Failing test.** `tests/anchoredLayout.test.ts`. For each stage `{1280,720}`, `{1707,720}`, `{2560,720}`, `{1280,800}`, `{1280,960}`:
  - every console rect (tabs, `HUD_TOP`, `HUD_POWER`, each station block, `FLIGHT`, `OWN_SHIP`, `CONTACT`, the pause line box) sits inside the stage, and no two overlap (copy `tests/terminalLayout.test.ts`'s loop and give it the layout);
  - margins: `CONTACT.x + CONTACT.w === stage.w - 12`, `stationTop('weapons') + 268 === stage.h - 12`, `HUD_POWER.y + HUD_POWER.h === stage.h - 8` (as at the reference: 712), and `FLIGHT.y + FLIGHT.h === stage.h - 12`;
  - `INFO_BAND.right === CONTACT.x`;
  - the hit tests: at stage 1707×720 a point at (1700, 100) is inside the contact window (not map while it shows) and a point at (1600, 600) is map; at stage 1280×960 a point at (400, 940) is on the Weapons block (not map).
- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3: Implement** `consoleLayout(stage)` from today's definitions, with `INTERNAL_W` → `stage.w` and `INTERNAL_H` → `stage.h`, and `HUD_POWER` from `powerPanel(stage.h)`. Then the shipHudModel helpers. Then flightPointer. Then the scene: compute `const L = consoleLayout(viewport)` once per frame and use `L.CONTACT`, `L.INFO_BAND`, `L.CONTACT_RESERVE`, and so on, and pass `L` to the hit tests.
- [ ] **Step 4: The components.** Each one that used a stage-dependent rect or `INTERNAL_W`/`INTERNAL_H` reads `useConsoleLayout()` or `useStage()`:
  - Station blocks: `stationTop` and the card helpers from the hook.
  - `ContactWindow`: `L.CONTACT`, `L.CONTACT_BOX`.
  - `TargetingLine`: viewBox and box at `stage.w × stage.h`.
  - `ShipHud`: the power helpers with `stage.h`, and the `Hit` boxes follow.
  - `SitCard`: `sitCardBox(card, L.INFO_BAND)`.
  - `Banners`: centre on `stage.w / 2`.
  - `MapOverlay`: `BY = stage.h - 28`, `SNAP_Y = stage.h - 12`, the console scale bar at `stage.w - 16 - …`; keep the exported constants as the reference values.
  - `EndCard`: centred on the stage.
  - `FeelPanel`: right-anchored on `stage.w`.
  - `FpsCounter`: `x = stage.w - 8`, `y = stage.h - 18`; keep `FPS_X`/`FPS_Y` as the reference values.
  - `CrtScreen`: `w = stage.w, h = stage.h`.
  - `insideBezel` callers pass the stage.
  In `DuelUi.tsx`, the `Banners` `cx` comes from `L.INFO_BAND`.
- [ ] **Step 5:** Run the new test plus `tests/terminalLayout.test.ts`, `tests/flightPointer.test.ts`, `tests/pewInput.test.ts`, `tests/uiDuel.test.tsx`, `tests/uiConsole.test.tsx`, `tests/uiShipHud.test.tsx`, `tests/crtBezel.test.ts`, `tests/fpsCounter.test.tsx`, `tests/pauseLine.test.tsx`, `tests/contactWindow.test.tsx`, `tests/w4Ui.test.tsx`, `tests/targetingUi.test.tsx` and `tests/hudRoomsHealth.test.tsx` (all at the reference stage, unchanged); typecheck clean. Add one render test: with `stageW: 1707` in the layout, the contact window's left edge is at internal x 1395 (`data-*` attribute or the Panel's computed left / scale).
- [ ] **Step 6:** Commit: `feat(ui-round-2b): the console layout, the HUD and the overlays anchor to the stage's edges`.

---

### Task 5: The sector HUD and the flight view anchor too

**Files:**
- Modify: `render/hudLayout.ts`, `ui/hud/*` (the components reading its rects: `SidePanels`, `PlayerBlock`, `MapPanel`, `Credits`, `EventCardView`, `ConsoleCard`, `Headline`, `SummaryCard`), `ui/duel/FlightUi.tsx`, `app/duel/flightMode.ts`
- Test: `tests/hudFit.test.ts` (extend), `tests/anchoredLayout.test.ts` (extend)

**Interfaces:**
- Produces: `hudLayout(stage: StageSize = REFERENCE_STAGE)` returning today's rects: `BLOCK_Y` from `stage.h`, `THREATS.x = stage.w - 408`, right-column `CARD_XS` entries at `stage.w - 428`, `CREDITS` at `stage.w - 80` × `stage.h - 80`, and the centred `NOTICE`/`EVENT_CARD`/`SUMMARY` on `stage.w / 2`. The module keeps today's names as the reference values. `useHudLayout()` reads it from the store.

- [ ] **Step 1: Failing test.** Extend `tests/hudFit.test.ts`: at stages 1707×720 and 1280×960 every sector HUD rect is inside the stage, none overlap where they don't at the reference, right columns end 8 px from the right edge (as at the reference), and bottom blocks end 8 px from the bottom.
- [ ] **Step 2:** Run: FAIL. **Step 3:** Implement `hudLayout(stage)` and point the components at `useHudLayout()`. `Headline` and `SummaryCard` centre on `stage.w / 2`. The flight view (`FlightUi`, `flightMode`) already gets its viewport in Task 3; check its `FeelPanel` and `Banners` follow the stage (Task 4 did the components). **Step 4:** Run the HUD tests (`git grep -l "hudLayout\|ui/hud" -- tests`), typecheck. **Step 5:** Commit: `feat(ui-round-2b): the sector HUD anchors to the stage's edges`.

---

### Task 6: Verification, screenshots and the gate

**Files:** Create `scripts/ui-round-2b-shots.cjs`; modify `docs/gates.md` and the report.

- [ ] **Step 1: Full verification**, one at a time:
  - `npm run typecheck`
  - `npx electron-vite build`
  - `npx vitest run --maxWorkers=4`, re-running load-sensitive files alone
  - `npm run test:determinism`, then `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability`
  - `npm run test:duel-app-runtime`
  - `npm run test:web-output`, since the web build must still bundle
  - `git diff --stat U2B_BASE -- src/renderer/src/sim tests/golden tests/fixtures`, which must print nothing
- [ ] **Step 2: Screenshots.** Copy `scripts/ui-round-2a-shots.cjs`. Set the Electron window's content size per shot (`win.setContentSize` through `electronApp.evaluate`, or launch with the size) and save to `C:\Users\djuar\FTLite-shots\ui-round-2b\`:
  - `{1280x720, 2560x1080, 1024x768}-{helm, weapons-window, ship}.png`, nine shots
  - `resize-live.png`: drag from 1280×720 to 1920×1080 mid-game
  - `menu-2560x1080.png`
  Look at each and check there are no bars, the panels sit on their edges, nothing overlaps, the map and ship view show more space on the wide window, and text stays crisp. Report a product issue as a concern; fix only script mistakes.
- [ ] **Step 3: Gate entry** in `docs/gates.md`: `## UI round Part 2b (fill the window)`, with the automated checks and the screenshots ticked, and an owner check open: "the game fills your browser and monitor at any shape; panels on their edges; text looks right at your window sizes".
- [ ] **Step 4:** Commit the script, gates and report: `docs(ui-round-2b): verification, screenshots, the gate entry`.
