# Codex review: Demo-i spec half 2 (2026-11-11)

1. **High — §6, lines 79–83.** The bot cannot perform the specified jump flow: `botIntent` returns movement or `interactHeld`, never `confirmPressed`; once seated, it returns neutral input, so it neither jumps nor stands. **Fix:** specify explicit Confirm edges for sitting and jumping, and Cancel after `jumps` changes.

2. **High — §6, lines 79–83.** “Move the cursor to the safe choice” needs to account for `navigationInput` moving only on `stickEdge` edges. A sustained `moveY` repeats only after `STICK_REPEAT_TICKS`; it does not move one selectable row per tick. **Fix:** specify edge pulses with neutral release ticks, and define how the bot identifies the desired selectable row after cursor clamping.

3. **High — §6, lines 79–83.** Seating requires Confirm while `confirmTarget` returns that console; merely reaching its tile is not sufficient. **Fix:** require the bot to check the live `ConfirmTarget` and press Confirm only when it is the Navigation console, then wait until seated before console input.

4. **High — §6, lines 79–83.** “Downed first” is not guaranteed by the existing priority: `interactTarget` gives a nearby boarder priority over revive, and `botIntent` returns that target before pathing or any new run behavior. **Fix:** define whether Downed priority overrides boarder fighting, and explicitly order new run goals behind revive targeting.

5. **Medium — §6, lines 79–83.** `EVENTS` has no `safeChoice` field, and the supplied values are policy assertions rather than derivable from current event data. **Fix:** add the field to the event type/data and test each event’s resolved effect against its declared safe choice.

6. **High — §8, lines 89–92.** The acceptance test only checks the two-player `nodesReached >= 3` value, while the gate also requires all three seed-1 rows to reach at least three nodes and the four-player row to remain running. **Fix:** assert the 1-, 2-, and 4-player records from `npm run acceptance 5 1`, including each node count and the four-player end reason.

7. **Medium — §8, lines 89–92.** The proposed jump bot test says “within `(60 + 20)` seconds” but does not pin where the clock starts or how the 20-second walk allowance is measured; it also omits an assertion that pid 1 does not sit or issue Navigation input. **Fix:** define the start tick, assert jump and stand deadlines relative to it, and verify pid 0-only behavior.

8. **Medium — §8, lines 89–92.** “Resolves `safeChoice` (events 4 and 0 asserted)” does not require proving the bot selected the declared safe choice; the existing `gate-run` test pins event 4 but deliberately confirms row 0. **Fix:** assert `eventChoice === EVENTS[id].safeChoice` and the corresponding event effect for both IDs.

9. **Medium — §8, lines 89–92.** The no-shop test’s “scrap unchanged after 30 s seated” can pass without a bot ever navigating or attempting a purchase. **Fix:** start at a Shop node with a known selectable cursor and sufficient scrap, assert the bot remains seated for the interval, and check purchase telemetry and scrap.

10. **Medium — §8, lines 89–92.** The Downed-first test does not define how it proves the bot revived first; with a ready drive, it could pass after charging/jumping without reviving. **Fix:** assert revive progress/completion occurs before any Navigation sit or jump, and include the boarder-priority case if the intended rule covers it.

11. **Low — §8, lines 89–92.** The “twelve steps” playtest test counts `- [ ]` lines but does not validate that the steps cover the specified session or include observable “what you should see” lines and notes. **Fix:** require the twelve expected step headings or contents, plus a dated notes field.

12. **Medium — §9, lines 94–100.** The gate entries are unchecked as requested, but the spec does not define the dated playtest record’s format; `docs/gates.md` uses dated checklist entries with notes/figures and explicit pending manual items. **Fix:** specify the appended gate entry format: date, players, seed, per-step result/notes, and commits for fixes.