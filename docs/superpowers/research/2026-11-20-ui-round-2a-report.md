# UI round Part 2a: report

Spec: docs/superpowers/specs/2026-11-20-ui-round-design.md §2.2-§2.4a. Plan: docs/superpowers/plans/2026-11-20-ui-round-part2a.md.

## Task 1: base
- U2A_BASE = 82efba31 (master 0e64bb02 plus the plan commit, docs only), SIM_VERSION 65, branch ui-round-2a.
- Suite at 0e64bb02 (the Part 1 merge verification, the same source tree): typecheck clean, electron-vite build OK, 539 files, 6417 passed, 3 skipped. Three load-sensitive files (gate-jump, gate-run, run.test) timed out in the full run and passed alone (54/54). Not re-run here, since the plan commit changes no source.

## Task 2: the info box goes
- ReadoutPanel deleted; crtRowLook moved to ui/duel/crtRowLook.ts; DuelUiView has no readout; INTERIOR_BAND is the full width; readoutModel keeps HEALTH_LOW, chargeRow, crewStatus, healthRow, level (level newly exported). Fence: tests/noReadout.test.ts.
- Deleted cases: duelReadout's whole "duel readout" describe; crtReadout.test.ts (its emphasis describe deleted, its crtRowLook cases moved to crtRowLook.test.ts); crewList's READOUT_ROWS case; duelHealthView's column-fit case; duelFireView's FIRE row and help cases; duelConsoleModel's status-table and console-rows cases (and a readoutHelp line); scienceConsole's hostility-row case (and its status-table half); engineeringFog's ENEMY/BEARING case; sensorsBlipReadout's BLIP row case and scene-fog describe; uiDuel's readout panel describe; uiCrt's inverse-bars case; crtBezel's readout rect; pewInput's status-table point and its edge case; uiConsole's find('HULL') at STATUS.
- Rewritten: duelReadout's OFFLINE case pins level() and chargeRow(); crewList and duelHealthView read crewStatus/healthRow directly; duelConsoleModel's charge check uses chargeRow; scienceSeat keeps only crtActive('science'); uiDuel uses the notice as its marker, banners: null to throw, pointer for sharing, notice x INTERNAL_W / 2; uiConsole's no-console case pins no tab strip; uiSinks shares overlay.scaleBar; crtBezel's reserveRight is EDGE.
- Band numbers recomputed (duelInterior, worldFit, interiorCamera); interiorZoomScene's clamp case moves to +2 because +1 no longer overflows the wider band.
- 17 fixture-only readout fields removed; full list in .superpowers/sdd/task-2-report.md.
- Suite: typecheck clean, build OK, 540 files, 6389 passed, 3 skipped; snapshot.test.ts timed out under load and passes alone (49/49).
