# Codex review: Combat-i plan half 1 (2026-11-11)

1. **Medium — Task 1, Step 1, kind-reset test (lines 225–232).** The test exercises `placeDebris`, so it passes even if production `spawnDebris` fails to overwrite a freed shot’s kind. **Fix:** add a `placeShot → removeDebris → spawnDebris` reuse test; assert kind 0 and an 8-point hull loss.

2. **Medium — Task 1, Step 1, step-order test (lines 176–186).** Same-tick warning proves enemy-before-debris ordering, but does not establish director-before-enemy ordering. **Fix:** make director and enemy spawns due together; assert their StableId allocation order and independently computed RNG outcomes.

3. **Low — Task 1, Step 1, second-encounter test (lines 170–175).** `placeEnemy` bypasses the first encounter counter increment; asserting `encounters === 1` misses the spec’s required second-arrival value of 2. **Fix:** trigger the first arrival through `enemySystem`, withdraw, then trigger the second arrival and assert 2.

4. **Low — Task 1, Step 1, blocked-shot tests (lines 141–151).** The full-table branch never asserts `nextShotTick`; both branches omit the exact expected re-arm value. Consuming a director draw without correctly updating the clock can pass. **Fix:** compute the expected timer from each cloned director stream and assert equality for both blocking conditions.