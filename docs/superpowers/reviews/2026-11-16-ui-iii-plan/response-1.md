# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `b151a88`. 8 accepted, 0 rejected, 0 deferred; no prior IDs.

## R1-F1 [P1]: Deleting mapPanel.ts breaks tests/layout.test.ts, and the Task 5 grep cannot find it

Confirmed: tests/layout.test.ts L11 imports from render/mapPanel, and 'render/panel' is not a substring of 'render/mapPanel'. Task 1 now repoints that import to render/mapModel and greps for any other importer. Task 5's grep now matches `mapPanel`.

## R1-F2 [P1]: The CellRow test compares jsdom's style.background to hex strings; CSSOM gives rgb()

Confirmed: style colours serialise as rgb(). CellRow now writes `hex(fill)` into its `data-ui-cell` attribute, and the test reads the attribute.

## R1-F3 [P2]: The uiperf measurement in Task 5 Step 4 records nothing

Confirmed against sinks.ts L16-18. The probe now writes fixture 2 every frame for 60 s with tick, simSeconds, health and progress varied. The sharing pass, which runs outside `perf.run`, is timed separately.

## R1-F4 [P2]: The probe's engine=react variant never gets the image cache, so the 'after' shots lack icons and glyphs

Confirmed (main.ts startProbe has its own mountUi). Task 5 Step 1 now builds the cache in the probe's hud/react branch as well.

## R1-F5 [P2]: The spec §8 HUD render-count and error-boundary tests are missing

Confirmed against spec L335-336. uiHud.test.tsx gains a render-count case (spies or Profiler; structuredClone pushed twice gives zero extra renders and writes) and an error-boundary case (a throwing panel leaves session-menu; recovery after clear plus a valid model bumps epochs.hud).

## R1-F6 [P2]: Task 5's main.ts instruction would use `store` before it is declared

Confirmed (main.ts L59 vs L69). Step 1 now deletes the createHud line and declares the hud sink after store and perf, next to duelSink.

## R1-F7 [P3]: Port details the Task 3 rules omit or blur

Confirmed against hud.ts L228, L143, L149, L88, L246 and L274. All six rules are added to the matching bullets.

## R1-F8 [P3]: Smaller unstated deviations and a contradiction in Task 1

Confirmed. Deviations 4 (Icon as a Box with background or mask) and 5 (main.ts builds the cache and passes it to mountUi) are added. The stray tests/hud.test.ts entry is dropped.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-ui-iii-react-sector-hud.md

<!-- end -->
