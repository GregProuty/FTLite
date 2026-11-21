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
