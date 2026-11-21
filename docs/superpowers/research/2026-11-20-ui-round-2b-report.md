# UI round Part 2b: report

## Task 1

- U2B_BASE = 22b5f58f (master: the 2a merge 4116d122 plus docs-only plan commits). SIM_VERSION = 66.
- Suite baseline taken from the 2a-merge verification (same source tree): 544 files, 6401 passed, 3 skipped; one load timeout passed alone. Not re-run for Task 1.
- Worktree: .worktrees/ui-round-2b, branch ui-round-2b.
- Added `StageSize`, `REFERENCE_STAGE`, `stageSizeFor` (src/shared/resolution.ts) and `stageFit` (letterbox.ts). `computeLetterbox` stays until Task 2.
- TDD: tests/stageFit.test.ts RED (10 failed), then GREEN. stageFit, boundary, smoke, letterbox, render tests: 171 passed. Typecheck clean.

## Task 2

- Commit cde5b5d4: the renderer, the four main.ts resize closures and the pointer (new `app/duel/pointerToStage.ts`, used by duelMode, flightMode and onlineDuel) all use `stageFit`. `LayoutSlice` gains `stageW`/`stageH` (initial 1280x720). New `useStage()` (zustand `useShallow`). New `Renderer.stage()`. `computeLetterbox` is deleted.
- TDD: letterbox/render/pointerToStage/uiStage(useStage)/uiMenuState went RED, then GREEN. The target files plus uiDuel, terminalLayout and crtBezel: 66 passed. Typecheck clean.
- `projectiles.reset()` still runs on a size OR scale change (not on size alone): a 16:9 resize changes the scale but not the size, and the snapped world fit moves with the scale.
- `snapWorldScale` is unchanged (comment only). Concern: the 0.75 readability rule keeps a fit-1 ship unsnapped at smooth scales such as 1.37.
- Full suite: 6417 passed, 3 skipped, 1 failed. The failure is the director soak timeout under another session's CPU load. Re-run alone with a longer timeout, it passes in 34.7 s.

## Task 3

- The map and the ship view follow the live stage. A new `app/duel/liveViewport.ts` (`stageOf`, `createLiveViewport`, `syncViewport`) gives each mode one viewport object, mutated in place every frame. The modes are duelMode, flightMode, the onlineDuel session (one object shared by every source) and the scene. A renderer with no `stage()` falls back to 1280x720.
- New resize paths, each a no-op when the size is unchanged:
  - `TacticalLayer.resize(vp)` rebuilds `bg`, the star tiling and `filterArea`; `debugSize()` is a test hook.
  - `BackdropLayer.resize(stage)` re-runs the cover fit, driven from the `FeelFrame.stage` field.
- The interior band comes from the stage:
  - `interiorBand(stage)` is new; `INTERIOR_BAND` stays as the reference value.
  - `duelFit` and `shipControlAt` take the band.
  - `InteriorView` reads `stageSize()` each draw and exposes `band()`.
- The callouts clamp to the stage width.
- TDD: tests/liveViewport.test.ts went RED with 5 of 7 failing. The runtime follow-camera test passed before the change, because the runtime already held the viewport by reference; it guards that contract. It then went GREEN. The 19 targeted files (273 tests) passed. Typecheck is clean.
- Full suite: 6425 passed, 3 skipped, 1 failed (the director soak load timeout; passes alone, 35/35).

## Task 4

- New `consoleLayout(stage)` in render/duel/consoleLayout.ts, memoised per size. The old exported names keep the 1280x720 values.
- What is anchored to the stage:
  - The station blocks and FLIGHT sit on the bottom edge.
  - The contact window sits in the top-right corner.
  - The power panel sits on the bottom edge: the power helpers take `stageH`.
- `useConsoleLayout()` is new.
- The scene computes `consoleLayout(viewport)` once per frame and uses it for the hit tests, the map reserves, the info band and the contact window's drawing box (`contactModel` gains a `box` input).
- The flightPointer hit tests take a layout and check bounds against `layout.stage`.
- These components read the live layout or stage: the station blocks, ContactWindow, TargetingLine, ShipHud, SitCard, Banners, MapOverlay, EndCard, FeelPanel, FpsCounter and CrtScreen.
- TDD: tests/anchoredLayout.test.ts went RED on the hit tests, then GREEN (12 tests). It covers 5 stages: on-stage, no overlap, margins, INFO_BAND and hit tests. A new contactWindow render test checks that the left edge is at 1395 at stage 1707.
- The brief's point (1700, 100) is in the 12 px margin, not inside the window (x 1395 to 1695). The test uses (1690, 100) instead.
- Full suite: 548 files, 6439 passed, 3 skipped, 0 failed. Typecheck is clean.

## Task 5

Status: DONE. Added hudLayout(stage) (memoised, copies the stage size) with THREATS, NOTICE/EVENT_CARD (centred on the gap between the columns, x + dw/2), CREDITS, BLOCK_Y/blockRect/cardRect (bottom and right anchored); reference names unchanged. useHudLayout() in ui/stage/useStage.ts. SidePanels, PlayerBlock, ConsoleCard, Credits, EventCardView, Headline (CENTER_X = stage.w/2) and SummaryCard (useStage) read it. Flight view: nothing left (viewport synced in Task 3, FeelPanel/Banners in Task 4). TDD note: the implementation was written before the new tests, so no separate RED run was recorded; the tests were added to hudFit.test.ts (reference equality, on-stage, margins, no new overlaps at 1707x720 and 1280x960, notice centring) and anchoredLayout.test.ts (stage-copy memo). Tests: 11 files / 168 pass; tsc -b clean. Files: render/hudLayout.ts, ui/stage/useStage.ts, ui/hud/{SidePanels,PlayerBlock,ConsoleCard,Credits,EventCardView,Headline,SummaryCard}.tsx, tests.

## Task 6

- Verification: typecheck clean; electron-vite build OK; vitest 548 files, 6445 passed, 3 skipped, 0 failed; determinism PASS (Node, Electron 37.10.3, Firefox 160; duel restore 597 checks); `test:web-output` PASS; no diff under sim, goldens or fixtures since 22b5f58f.
- `test:duel-app-runtime` FAILS at step 3 (`the forced round end timeout`), twice. The branch has no sim change. Most likely cause: the slingshot merge in the base (SIM 65 -> 66) moved `DUEL_TEST_SEED` 1921's round end (picked at SIM 63) past the step's 90 s. Needs a new seed search; not patched here.
- Screenshots in `C:\Users\djuar\FTLite-shots\ui-round-2b\` (script `scripts/ui-round-2b-shots.cjs`): Helm, Weapons with the enemy window and the ship view at 1280x720, 2560x1080 and 1280x960 (the window minimum is 1280x720, so 1280x960 stands in for 1024x768), `resize-live.png` and `menu-2560x1080.png`. No bars, panels on their edges, no overlaps, more map on the wide window, text readable, live resize follows.
- Look concern: at 2560x1080 the ship interior snaps to 2/3 of the fit, so it is the same screen size as at 1280x720 and looks small in the wide frame.
- Gate entry `## UI round Part 2b (fill the window)` added to docs/gates.md; owner check open.
