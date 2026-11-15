# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at the brief commit. 3 accepted (1 P1, 2 P2), 0 rejected, 0 deferred. All three were confirmed in the plan's code.

## R1-F1 [P1]: The star field does not provide the required parallax

Confirmed: the stars were baked into the static background (plan L1558-1565), so they never moved, against parent §10b layer 1. The 220 seeded stars now sit in their own `Graphics`, drawn once as a 2×2 tile. Each frame only sets its position to `starOffset(centre) − (w, h)`, where `starOffset` is −centre × `STAR_PARALLAX` (0.02 screen px per world unit, the same at every zoom), wrapped to one screen. A model test covers the rate, the wrap and zoom-independence, and a layer test covers the tile position after a pan. The allocation test still passes. Decision 8 is updated.

## R1-F2 [P2]: Dragging and wheeling in one frame loses cursor-anchored zoom

Confirmed: `pan()` clears the anchor that the earlier `zoomBy` set. The runtime's `frame()` now pans before the wheel zoom. A new runtime test sends both in one frame and checks the camera ends free with the zoom anchored at the cursor.

## R1-F3 [P2]: The browser-default test omits key release

Confirmed. The input test now fires keyup for Tab, Space, the arrows and Backspace and asserts `preventDefault`, and also asserts that other keys don't call it.

## Also changed

- Decisions 2 and 8, the Task 3 and 4 interfaces, and the test counts. Re-verified by extracting the plan task by task into a fresh worktree at master `7e54824`: tasks 1 to 5 run 5, 19, 20, 2 and 9 tests, and every task typechecks and passes in order. Full suite: 1,872 passed.

## Files changed

- docs/superpowers/plans/2026-11-15-helm-h1a-flight-view.md

<!-- end -->
