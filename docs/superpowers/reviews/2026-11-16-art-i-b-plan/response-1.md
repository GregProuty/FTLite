# Round 1 response (plan revised, prototype-verified: tsc clean, 3461 tests passed)

Reviewed `round-1.json` against the subject at `753bb0c`. 6 accepted, 0 rejected, 0 deferred. Every fix was re-run in a scratch worktree: `npx tsc -b` clean, `npm run build` ok, full suite 244 files and 3461 tests passed. The new debris and session tests fail without their fix and pass with it.

## R1-F1 [P1]: Debris never shows when a hit opens a breach

Confirmed. Plan L1758-1775 ran `onHit` (which starts the hitstop) before `clock.advance`, then consumed `breachSeen` while skipping the burst at pdt 0; sim/debris.ts:L103-117 opens the breach and stamps impactTick in one call. The burst now spawns regardless of pdt (plan L2016, Decision 11). New test (L1785): a hit on the opening frame, then at least DEBRIS_COUNT visible particles four frames later.

## R1-F2 [P1]: gradeCover returns overlapping rectangles

Confirmed against wallModel.ts:L18-35: the quarters overlap the halves, and the band crosses the floor parts. gradeCover now paints one art-pixel mask of the whole ship and emits non-overlapping merged row runs (L621, Decision 3). New test (L516), on the Cutter and the Skiff: no art pixel is covered twice, and the union is exact.

## R1-F3 [P2]: Stars mix pixel sizes in the sector

Confirmed. `stars(seed, band, t, artPx)` makes each star `artPx` square, snaps it to whole multiples of `artPx`, and drifts at 4 and 10 × `artPx` per second (L1652, Decision 14). The test runs at artPx 2, 4/3, 1.31 and 1. It is no longer a deviation.

## R1-F4 [P2]: Console desks and screens off the art-pixel grid

Confirmed (consoleModel.ts:L15 sets DESK_W 19 and SCREEN_D 3). New Task 5 sets DESK_W 20, DESK_D 10, SCREEN_D 2 and SCREEN_INSET 2, with a 2-wide outline drawn inside. An onGrid test covers every side and flush combination. The cursor test now uses exact bounds, with no +1 (Decision 19). The later tasks are renumbered 6-10.

## R1-F5 [P2]: InteriorFeel leaks shared GraphicsContexts

Confirmed (duelMode.ts:L80 rebuilds the interior on restart). `InteriorFeel.destroy()` (L2063) frees its Graphics and then the shared contexts, and interiorView.destroy calls it. The sector feel is built once; a layout change reuses its contexts. New test (L1809): switching layouts leaves exactly one set of glows, and destroy frees the contexts (Decision 18).

## R1-F6 [P3]: The presentation clock runs while paused

Confirmed (duelMode.ts:L84 freezes only the tactical fx). The duel now passes `runtime.paused() ? 0 : dt` as the presentation dt. The sector Renderer.draw gains an optional `paused` parameter, fed from the phase in session.ts and onlineSession.ts; only renderer-side signatures change, nothing in network, the sim or snapshots. New tests: interiorFeel freezes at dt 0, and session passes `paused` (Decision 17).

## Also changed

- Decisions, File Structure, the prototype table, expected counts (+80, 3461 tests in 244 files) and the self-review were updated to match.

## Files changed

- docs/superpowers/plans/2026-11-16-art-i-b-light-and-feel.md

<!-- end -->
