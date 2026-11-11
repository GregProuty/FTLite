# Codex review: Boarders-i plan half 1 (2026-11-11)

1. **High — Task 1, line 323 (survival gate):** Inserting the boarding assertion after `encounters` references `figures` before its `const` declaration: typecheck fails, and execution throws. **Fix:** construct `figures` before all assertions that use it.

2. **Medium — Lines 188–193 (skip-after-kill fixture):** `CREW_MELEE_DPS * DT + 1e-6` survives pid 0’s blow; pid 1 kills it and earns XP. Also, the last kill must advance `rng.director`, contradicting `streams(two) === before`. This error is inherited from the spec’s test prose. **Fix:** use one blow minus `1e-6`; assert one director draw and unchanged hazards/combat streams.

3. **Medium — Lines 214–217 (ignored Downed crew):** `while (down.tick < due)` never executes `boarderSystem` at `due`, so the boarder remains in G and the movement assertion fails. **Fix:** process the due tick, then assert movement to I.

4. **Medium — Line 291 (return-and-sabotage procedure):** Returning to A resets `aloneSince` to `-1`; movement does not start the destination’s clock. Jumping directly another 900 ticks merely starts it then. **Fix:** seal A, process the next tick to start the clock, and assert failure at `aloneSince + BOARDER_SABOTAGE * TICK_HZ`.

5. **Medium — Lines 119, 179–180; Global Constraints line 28 (lever compatibility):** Tests do not all adapt to tuning. With `BOARDER_HEALTH = 45`, a 30-health marker has fraction `2/3`, and Reyes kills on tick 338, earning fighting XP for 338 ticks rather than 450. **Fix:** derive marker fractions and kill/XP expectations from tuning; rerun unit tests after each lever.

6. **Medium — Line 323 (snapshot version change):** “11 → 12” does not match the real test, which currently rejects version 10. Rejecting 12 would reject the current version; leaving 10 misses the required version-11 regression. **Fix:** explicitly set both the rejected header version and flattened version to **11**.

7. **Medium — Lines 326–348 (snapshot coverage):** The round-trip test discards loaded telemetry, so counter deserialization is untested. The continuation fixture saves a freshly placed boarder, with no fighting progress or sabotaged visit; spec §4’s `-2` continuation requirement remains uncovered. **Fix:** assert loaded counters, save after actual melee ticks, and add continuation of a sabotaged visit that must not sabotage again.

8. **Medium — Movement/sabotage tests, lines 221–260:** No fixture tests choosing the lowest room index when multiple adjacent rooms contain Conscious crew, or resetting an already-running sabotage clock when all consoles become offline. **Fix:** add competing occupied destinations and an online → offline → online console sequence with exact clock assertions.

9. **Medium — Steps 0 and 6, lines 57, 304–323, 543 (gate evidence):** Passing tests print no figure lines: `figures` appears only in assertion messages. The baseline also lacks the required health-at-4:00 instrumentation. **Fix:** add measurement/output before the baseline run and emit per-seed figures for both gates.

10. **Low — Lines 280–286 (combat-gate arithmetic):** Focused health is approximately **32.7**, not 55. With first-pass tuning, the two boarders die on ticks 225 and 450; incoming damage totals 67.3. **Fix:** correct the recorded expectation and assert the derived health value.