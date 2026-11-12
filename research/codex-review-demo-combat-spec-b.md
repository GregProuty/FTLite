# Codex review: Demo-i combat section 11.4-11.6 (2026-11-11)

1. **High — §11.4, line 157:** The specified enemy row uses `hull / maxHull`, FLEE time, shield layers, and weapon charge, but `targetRowText` currently uses the `hull` fraction, ETA, and scan suffix only; `DebrisTarget` has none of the four new fields. The examples also don’t match the existing row strings. **Fix:** Define whether `hull` remains a fraction or becomes a value; add and populate `layers`, `layersMax`, `weaponCharge`, and `fleeSeconds`; update the formatter and exact-string assertions.

2. **Medium — §11.4, line 157:** “The bracket is omitted when shields are down (`S-` alone)” conflicts with the specified `W…%` suffix and the example `Enemy 20% FLEE 7s S- W30%`. **Fix:** Say the shield bracket is omitted while retaining the weapon-charge suffix.

3. **High — §11.4, lines 158–159:** The threat-row template leaves `${...DOWN suffixes as today}` ambiguous, and doesn’t explicitly pin the shields-down and fleeing forms. Current threats show hull as a percentage of `ENEMY_HULL` and omit shield status entirely. **Fix:** Specify the exact calculation and ordering for hull, shield layers, each DOWN suffix, and `FLEEING`; add exact threat-string assertions for shields up/down and fleeing.

4. **Medium — §11.4, line 160:** Notice priority is specified, but there’s no exact maximum-length assertion for the surrender line. The stated 45-character maximum depends on the countdown and scrap values staying within the assumed widths. **Fix:** Add the exact rendered line to the notice tests and assert its actual string length against the notice limit.

5. **High — §11.4, lines 161–162:** The record and table change is underspecified against existing tests: telemetry currently maps only `met/destroyed/disables`; acceptance prints `met/destroyed/disables`; its test regexes pin that three-value order. **Fix:** Specify how `fled`, `surrenders`, and `shieldHits` appear in the record and table, then update the fixture, header and row regexes to pin the chosen column order.

6. **Medium — §11.5, line 165:** Arrival assertions don’t say which shield-layer maximum to expect at columns 0 and 5, and don’t identify the tick at which `nextShotTick` is set for the charge check. **Fix:** Pin `layersMax` to 1 and 2, and state the expected `nextShotTick` or arm interval before asserting charge reaches 1.

7. **Medium — §11.5, line 168:** The `u >= 0.6` “any room” assertion is vacuous if it accepts the console room too; “uniform” with all consoles offline has no specified fixture or numeric assertion. **Fix:** Use a reference RNG stream and pin the chosen room for each branch, including offline consoles.

8. **Medium — §11.5, line 169:** The flee cases don’t specify fixture hull/max-hull values, beam damage, or the starting tick, so the 24% transition and `tick + 480` expectation aren’t reproducible as written. **Fix:** Give concrete fixture values and expected hull before/after the beam, then state the flee-start tick and exact departure tick.

9. **Medium — §11.5, line 170:** HUD tests say “four states” but do not pin the exact expected row strings for each state, including values for layers, charge, and flee countdown. **Fix:** List the exact full-layer, stripped-layer, shields-down, and fleeing rows; assert the notice and threat strings exactly.

10. **Low — §11.6, line 176:** “The four gates” is unclear without naming them, and the checklist doesn’t say where the re-recorded figures go. `docs/gates.md` uses unchecked checklist entries and dated, named gate results with figures. **Fix:** Name `gate-survival`, `gate-boarding`, `gate-jump`, and `gate-run`, and require dated results with changed figures and the combat drift cause recorded in `docs/gates.md`.