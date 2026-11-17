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
