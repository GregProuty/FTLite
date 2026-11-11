# Codex review: Run-i spec half 2 (2026-11-11)

1. **Medium — §7 L84; §9 L113:** The Node-only clock assertion has no model field to inspect: `HudModel` exposes seconds, while `hud.ts` builds `HULL … TIME …s` inside Pixi. **Fix:** specify the complete replacement text, expose a pure formatter/model field, and test exact output plus the null-state fallback.

2. **Medium — §9 L109:** Cursor wrapping and “select the last destination” can pass vacuously with one reachable destination. An unseated Confirm can also seat the player. **Fix:** pin `colNodes[1] = 3`, mask `0b101`, expected reachable `[0, 2]`; assert both wrap directions, destination 2, and that a seating Confirm with full charge does not jump.

3. **Medium — §9 L111:** Setting only `column = 6` leaves `nodesReached = 0`; the prescribed increment produces 1, contradicting the expected 7. **Fix:** initialize `node = 0`, `nodesReached = 6`, and `telemetry.jumps = 6`; assert both counters become 7 in unit and session tests.

4. **Medium — §9 L115:** The walking script lacks inputs and character selection. Confirm near the intervening doors seals them; overshooting Navigation can select Doors instead. **Fix:** pin Recruits: from `(2.5, 9.5)`, send `moveY: -1` for 105 ticks without Confirm, then neutral movement plus Confirm; assert the Navigation seat before repeatedly confirming. Default Okoro needs different timing.

5. **Medium — §9 L115:** The enemy-silencing fallback misdiagnoses this gate. Repeated Confirm jumps before `enemySystem` processes the arrival due 60 seconds after the preceding jump; the 120-second boarding timer also never matures. **Fix:** explicitly make this a quiet mechanism gate from the outset, or define deliberate encounter dwell time for a combat gate; remove the conditional fallback ambiguity.

6. **Medium — §9 L110:** The scan-reset fixture covers only an enemy-present jump. `removeDebris` never clears `science.scanning`; with no enemy, `leave` is skipped, allowing scanning to remain enabled after clearing every object. **Fix:** explicitly require scan cancellation and add an enemy-absent fixture scanning the sole debris object.

7. **Medium — §9 L112:** Continuation asserts only hash equality and one jump. Losing the saved cursor can still satisfy both by jumping to destination 0. **Fix:** save with two destinations and cursor 1; assert the restored cursor before stepping and the exact destination afterward, against an uninterrupted run.

8. **High — §9 L111–112, testing §6 L80:** Victory is set during console input, but unchanged `crewSystem` can overwrite it with hull/crew loss later that tick. The prescribed tests never exercise this collision. **Fix:** define terminal-result precedence and add final-jump fixtures with zero hull and lethal environmental damage; assert the resulting reason, ending-tick telemetry, and single session record.

9. **Medium — §9 L110:** Persistence coverage omits explicit §6 rules: boarder movement/sabotage clocks, crew life/bleed/revive state, skill stamps, oxygen/repair progress, doors, heat/coolant, and weapon selector/loading/regeneration state. **Fix:** seed these with distinct non-default values and compare them immediately before/after direct `jumpShip`.

10. **Medium — §9 L113:** Model assertions cannot verify the required footer strings or empty final-column rendering; neither has a specified automated assertion. **Fix:** extract pure Navigation text formatting and assert `Evade 35%   Jump 64%`, `Evade 35%   Jump READY`, and the agreed final-column footer with no rows.

11. **Low — §9 L114:** “Fixtures updated” leaves the record/table contract under-specified. Existing telemetry uses whole-object equality; acceptance has three regexes anchored at the old `boarders` ending, and no victory row. **Fix:** give exact `run` fixtures, append `nodes` to the header and anchored row expectations, and include a `'victory'` row with `3/8`; retain hull, crew, and running mapping assertions.

12. **Medium — §10 L122–127:** Automated gates are already checked without Run-i evidence. Existing `docs/gates.md` entries record completed checks with dated figures and actual acceptance output. **Fix:** start unchecked; check only after verification, recording baseline/final figures, any global tuning changes, golden hash, and the dated three-row acceptance table.