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

## Task 3: no zoom box, the HUD on every view, the terminal layout
- Deleted SideColumn.tsx and PowerStrip.tsx. `ConsolePowerStrip` and `powerStrip` are gone, and `ConsoleView` has no `side` and no `power`. `SciencePanel.range` is the sensor range, drawn as `SENSOR RANGE n` on the Science block's top row.
- consoleLayout (§2.4a): `HUD_TOP` (6, 40, 330, 110), `HUD_POWER` (6, 527, 328, 185), `STATION.x` 346, `FLIGHT.x` 658, `OWN_SHIP` (12, 160, 240, 170), `CONTACT` (968, 42, 300, 420), `CONSOLE_RESERVE` {264, 12}, `INFO_BAND` {408, 968}. No STATUS, SIDE, SIDE_H, POWER_STRIP or stripTop. Importing shipHudModel caused no import cycle.
- The scene sends `hud: shipHud(d)` on every view. DuelUi mounts ShipHud right after MapOverlay. The console map shows `C: SNAP BACK` left of the scale bar; there is no zoom text anywhere. The sit card always sits at the top (y 100, or 156 under the notice), centred on INFO_BAND. The pointer hit tests use HUD_TOP and HUD_POWER.
- Stale "readout" comments fixed in interiorView, shipHudModel, tacticalModel, scene and uiProbe.
- Deleted cases: duelConsoleModel's side column case; engineeringConsoleModel's powerStrip case; engineeringConsoleUi's strip assertions and its Science/Weapons strip case; uiConsole's zoom box buttons, finds and presses; crewHelmUi's and engineeringWeapons' power lines; crtBezel's zoom-text rect.
- Rewritten cases: the layout pins (duelConsoleModel, flightPointer, pewInput, ownShipLayout, pauseLine, duelWeaponsView, valkyrnViews, crewSeats); the sit card at the top (feelIiUi); the HUD present at the Helm (shipHudScene); science range (scienceSeat, scienceConsole, scienceUi); uiDuel without zoom text; the uiConsole notice x is 766; the contactScene south probe moved to 70 px (100 px now lands on the Weapons block); tacticalModel's and feelPresentation's avoid cases use a fixture window at the old rect.
- New cases: terminalLayout.test.ts (2), the console snap hint (uiConsole), the HUD power columns on a weapons view (engineeringConsoleUi), the HUD on a weapons view (uiShipHud), and the console snap hint inside the bezel (crtBezel).
- `side:` fixtures were removed from 16 UI test files. The full list is in .superpowers/sdd/task-3-report.md.
- Suite: typecheck clean, build OK. 541 files: 6385 passed, 5 failed, 3 skipped. Four of the failures were this task's and are fixed; those files pass alone (57/57). snapshot.test.ts timed out under load and passes alone (49/49).
- Concerns: the widest sit card (600 px, x 388..988) overlaps the contact window by 20 px. Map clicks less than about 80 px below the centred ship land on the Weapons block. The online notice is still centred at 766 (CONSOLE_RESERVE).

## Task 7: verification, screenshots, the gate
- Typecheck clean; electron-vite build OK; vitest 544 files, 6401 passed, 3 skipped (no load timeouts); determinism PASS (Node, Electron 37.10.3, Firefox 160; duel restore 597 checks); duel app smoke two-process PASS (159 s). `git diff --stat 82efba31 -- tests/golden tests/fixtures src/renderer/src/sim` is empty.
- Screenshots (scripts/ui-round-2a-shots.cjs, C:/Users/djuar/FTLite-shots/ui-round-2a/): 1-helm (+ 1-helm-contact with BRG 074  RNG 728), 2-weapons-window (enemy window top right, sit card at the top, clear), 3-science (SENSOR RANGE 900), 4-ship (full width, empty Weapons badge blinking red; 4-ship-away), 5-damage (burning WEAP blinking, damaged SHLD hot with its progress bar, offline ENG, HEALTH row), 6-flight (Helm block x 346 and Flight block x 658 side by side). No info box, no zoom box.
- Gate entry appended to docs/gates.md; owner look check open.
- Concerns: the AWAY label is hidden under a console badge's name when the away character stands on a console tile, and in DIM it is barely visible on the light floor; the 2 px room progress bar sits on the power panel's bottom border. Not patched. Full detail: .superpowers/sdd/task-7-report.md.

## Final review fixes

1. Critical: `interiorView.ts` had the crew label's `t.position.set(...)` swallowed by a trailing comment, so DOWNED and AWAY labels sat at (0,0). Restored; the placement is now the exported pure helper `crewLabelAt(x, y)` (rounded x, y + half a tile, WARN tint) that the draw loop calls.
   Test: `tests/duelInterior.test.ts`, "a downed character shows its DOWNED label under the character in the DOWNED red, not at (0,0)". It draws a view with a downed character, finds the visible DOWNED label in `world.children`, and checks its position and tint (plus a `crewLabelAt` unit check). Verified it fails with the position call removed and passes with the fix.
2. `crewLabels` were added to `world` twice; now once (after `badgeText`), and the back-to-front comment says the crew labels draw last, above the console badge names. No unused imports remained.
3. Stale comments reworded: weaponsModel (contact window's left edge, INFO_BAND; status row line), ContactWindow.tsx (top right), scene.ts (contact window).
4. Deleted unused `INVERSE_TOP/H/PAD` in `crtRowLook.ts` and the no-op `pairs` helper in `tests/crewList.test.ts`.
5. Spec: §2.2 TORPEDO INBOUND row now "a banner on the ship view (...EVADE in the map's status sentence)"; §2.4a Helm range bullet notes the Valkyrn's Flight view shows the same line.

Results: typecheck clean; the five named test files plus the new test green; full suite 544 files, 6402 passed, 3 skipped, 0 failed (after `electron-vite build`).
AWAY screenshot check: `FTLite-shots/ui-round-2a/4-ship-away.png` regenerated; the red AWAY label sits directly under the away character.
