# Ledger: artemis-i-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | consoleChange exported from scene.ts breaks the two test files that vi.mock the scene module | fixed:R1 | 0 | consoleChange moved to app/duel/consoleChange.ts (unmocked); Task 5 files and test updated |
| R1-F2 | P2 | Readout rows, help and map reserves follow the view, not whether the console is drawn | fixed:R1 | 0 | Task 5 draw: onConsole = !hidden && view!=='interior' drives reserves, console flag, help |
| R1-F3 | P2 | Moving INTERIOR_BAND to y 42 breaks worldFit.test.ts, which Task 2 neither lists nor runs; the duelInterior line numbers are wrong | fixed:R1 | 0 | Task 2 names worldFit:56, duelInterior:41-42/89/92/102, interiorCamera:9/29, y 173; run list and git add |
| R1-F4 | P2 | The 'console and repair both in reach' tab test can pass without exercising the rule | fixed:R1 | 0 | tab rule factored into pure consoleTabs(); repair case tested on it; integration case asserts preconditions |
| R1-F5 | P3 | consoleHidden does not hide the console online in phases other than running and paused | fixed:R1 | 0 | DuelViewSource.running(); consoleHidden(d, overlay, running); deviation 5 stated |
| R1-F6 | P3 | Task 5 names the wrong runtime interface location; two of its test snippets are sketches | fixed:R1 | 0 | DuelRuntime L167-207 named; consoleHidden test written in full in new file; uiProbe import added |
| R1-F7 | P3 | Task 6's F10 step does nothing in the production build, and the CRT 'off' setting would not show the off-CRT button look anyway | fixed:R1 | 0 | F10 step removed; off-CRT palette checked on the interior screenshot |
