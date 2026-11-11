# Codex review: Run-i plan half 2 (2026-11-11)

1. **Medium — Task 2, Step 1 (headline tests):** Appending tests leaves existing exact headline expectations at `tests/hud.test.ts:303,309,312` stale, so the suite fails. Add `  Reached node 1 of 8` to all three existing expectations.

2. **Medium — Task 2, Step 3 (`telemetry.ts`):** The builder references `RUN_COLUMNS`, but the plan omits its import; the existing file does not import it. Add `RUN_COLUMNS` to the tuning import.

3. **Low — Task 2, Step 3 (`headlineSummary`):** Spec §7 explicitly uses `nodesReached + 1`; the plan uses `column + 1`. They agree under the invariant, but this does not follow the specified data source. Use `state.run.nodesReached + 1`.

4. **Low — Task 2, Steps 1/4 (render verification):** The tests exercise model fields and formatters; neither named render test invokes `createHud`. Thus destination rendering, cursor highlighting, stale-row hiding, last-column rendering, and `top.text` wiring remain untested. Add a HUD rendering test covering those behaviors and switching from another console to Navigation.