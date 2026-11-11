# Codex review: Combat-i plan half 2 (2026-11-11)

1. **Medium — Task 2, Step 1, L520–528:** The “enemy alone” fixture runs 10 seconds, but `placeEnemy` schedules a shot at 5 seconds; `quiet` suppresses only director spawns. Seated Science warns immediately, so XP increases and both `sinceProductive` counters reset. **Fix:** set `s.enemy.nextShotTick = 1e9` before running. The XP indices themselves are correct.

2. **Medium — Task 2, Step 3, L598; Task 3, Step 1, L626:** The replacement `anyWarned(state)` introduces an implicit `any` under strict TypeScript. New HUD tests call `quiet`, but neither existing imports nor the instructed additions import it. **Fix:** preserve `anyWarned(state: SimState): boolean` and import `quiet` from helpers.

3. **Medium — Task 3, Step 1, L626:** Only the existing Weapons target expectation is updated. The existing Science exact-array assertion in `tests/hud.test.ts:172` also needs `kind` and `hull`; otherwise the suite fails. **Fix:** add `kind: 'debris', hull: null` to both Science expected targets.

4. **Medium — Task 2, Step 4, L602:** The claim that changing `ENCOUNTER_FIRST` leaves the golden unchanged is false. Its value initializes `enemy.nextArrivalTick`, which Task 1 flattens and hashes from the start, even before an encounter. **Fix:** finalize fallback tuning before the single golden re-bless, or explicitly authorize another re-bless and document its cause.

5. **Medium — Task 2, readiness test, L481–487:** `failStation` both clears allocation and stands the operator. The “offline” fixture therefore also fails the occupancy check and cannot detect a missing online guard. **Fix:** add separate occupied fixtures with `failed = 1` and with allocation `0`, keeping a valid target and ready weapon.

6. **Medium — Task 2, guard tests, L514–529:** The Science guard assertions already pass without the proposed guards: `db.active[8]` is `undefined`, so existing conditions return early. The productive scan test likewise cannot detect pseudo-slot reads. **Fix:** instrument debris-array access to reject index `ENEMY_SLOT`, then exercise Confirm, `scanStep`, and scanning productivity with the cursor there.

7. **Medium — Task 3, Steps 1/3, L626–706:** Tests cover HUD model objects but never the exact `hud.ts` row strings or its slicing/highlighting. Only Weapons receives a panel-level scrolling assertion. **Fix:** test the shared row formatter and both panels’ visible rows/highlight, including Science’s seven-row window, shot scan suffix, and enemy text without frequency or scan suffix.

8. **Low — Task 2, survival extension, L563:** `encounterImpacts` inherits the existing timestamp-based counter, which counts simultaneous impacts only once. That can underreport the new documented encounter figures. **Fix:** accumulate deltas from `s.telemetry.impacts` during the encounter.

9. **Low — Task 4, gate documentation, L737–746:** The template hard-codes arrival at 3:00 and shots every 10–15 seconds despite explicitly permitting arrival/cadence fallbacks. **Fix:** update the gate narrative and manual expectations to the final tuning values.