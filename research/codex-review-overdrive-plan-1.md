# Codex review: 2b-i plan, sim and tests (2026-11-10)

1. **High â€” plan lines 117â€“128, 247:** Task 1 appends power tests but leaves the existing â€œrefuses a bar at the station maximum even with spare powerâ€ test unchanged. Its Navigation level-2 allocation now correctly accepts another bar, so the suite fails. Update that test to refuse at `maxLevel(Navigation)` and retain a separate empty-pool case.

2. **High â€” lines 345â€“348:** The already-burning fixture runs `fireStep` before `heatStep`. The Bridge fire consumes one spread draw, then overheat consumes another; the assertion expects only one total draw. Fire also grows from `3` to `3.041666â€¦`. Call `heatStep` directly for this case and assert exact unchanged intensity plus one consumed draw.

3. **Medium â€” lines 511â€“513:** The Confirm ordering test starts at heat `238` with one coolant unit. Without Confirm, the next heat update reaches only `239`; overheat would not occur. Set initial heat to `HEAT_MAX - (HEAT_RISE - HEAT_COOL_UNIT)` (`239`) and assert it remains `239` after Confirm adds the second unit.

4. **Medium â€” lines 329, 335â€“338:** Neutral input makes `consoleSystem` clear the occupantâ€™s stick state before overheat. These assertions therefore cannot verify that forced standing clears it. Supply a matching held direction on the overheat tick so stick state remains nonzero until `failStation`.

5. **Medium â€” lines 496â€“500:** `sitDown` resets Engineeringâ€™s cursor to Engineering, overwriting the Weapons cursor set by this fixture. Even if seating Confirm incorrectly reaches `engineeringInput`, coolant remains zero. Spy on `cycleCoolant` and assert it is never called during seating.

6. **Medium â€” lines 527â€“539:** The property runs at most `240 Ã— 5 = 1,200` ticks (20 seconds), versus the specâ€™s 60 seconds, and checks invariants only after the entire script. Transient violations can disappear before inspection. Run 3,600 ticks and check pool, per-station coolant, heat, and allocation bounds after every step.

7. **Low â€” lines 411â€“418:** The continuation fixture assigns coolant to Science while overheating Doors, so it omits the specified replay case where coolant affects the hot stationâ€™s threshold crossing. Saving at tick `590` is also five ticks before the tick-`595` overheat, not ten. Assign one unit to Doors, save at tick `1185` before its tick-`1195` overheat, and compare continuations through the failure and roll.

8. **Low â€” lines 272, 477:** The prescribed imports leave `heatStep`, `igniteRoom`, and `cycleCoolant` unused in the test files. They fail a `noUnusedLocals` check, although the repositoryâ€™s current typecheck does not enable that option. Use them in the corrected direct-call/spy tests or remove them.

