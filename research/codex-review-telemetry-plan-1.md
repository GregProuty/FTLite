# Codex review: 4-ii plan half 1 (2026-11-11)

1. **Medium — Task 1, Step 4, lines 360–362:** `telemetrySystem` records only first death for a Conscious → Dead jump; spec §5 requires both first down and first death. Extend the down-edge condition to include Conscious → Dead and add a fixture asserting both tick/pid pairs.

2. **Medium — Task 1, Step 1, lines 204–210:** The “spawns per type through a pinned director roll” test exercises only Power (`makeState(2)` selects type 2). Comparing against `lastType` leaves the other three increments untested. Pin director seeds selecting each hazard type, assert the expected type explicitly, and assert the complete spawn-counter vector.

3. **Medium — Task 1, Step 1, lines 132–134:** The claimed Dead-idle coverage samples a Downed player twice. Setting `Life.bleed = 100` and calling `telemetrySystem` never produces Dead. Use two players, down one, set their bleed timer to `DT / 2`, step through death, and assert their idle streak continues across subsequent Dead ticks.

4. **Medium — Task 1, Step 1, lines 161–174:** The same-tick pid tie-break is tested only for downing; the deaths occur on separate ticks. Add a three-player fixture where pids 1 and 2 bleed out together while pid 0 remains Conscious, and assert that `firstDeathPid === 1` with the exact transition tick.