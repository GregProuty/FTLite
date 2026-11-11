# Codex review: Combat-ii plan half 1 (2026-11-11)

1. **High — Task 1, Step 5:** `damageEnemy` calls `enemySystemOf`, but the prescribed imports omit it. **Fix:** import `enemySystemOf` from `debrisTargets.ts`.

2. **High — Task 1, Step 6, HUD stop-gap:** changing lengths from 9 to 12 cannot fix the failure. `hudModel.target()` and the threat loop treat slots 9–11 as debris and dereference an undefined room; the Science builder also indexes debris scan data. **Fix:** move all three HUD guard migrations and subsystem row projection into Task 1, updating affected fixtures there.

3. **High — Task 1, Steps 4–6:** adding subsystem rows makes the existing `productive.anyWarned()` return true for an enemy alone. The existing enemy productivity test fails, and the survival gate runs with incorrect productivity/XP behavior. **Fix:** move the objects-only predicate (`k < DEBRIS_SLOTS`) into Task 1 before running the gate.

4. **Medium — Task 1, Step 1, snapshot continuation:** repair at saved tick +10 replaces the old +15 shot deadline with **saved tick +310**. After 40 ticks, assert `shotsInFlight === 0`, Weapons HP `30`, repair timer `-1`, and `nextShotTick === 410` for this fixture. Task 1 also leaves `scanStep` unchanged, so assert `enemy.scan === 0`. **Fix:** defer scan growth to Task 2; to cover the repaired shot, advance through tick 410, then assert one shot and compare hashes.

5. **Medium — Task 1, Step 1, subsystem kill fixture:** `placeEnemy(k, 15)` gives shields 30 HP. A 15-damage beam kills the hull but leaves shields at 15 before `leave` clears them; `enemyDisables` is **0**, not 1. **Fix:** pre-damage shields to 15 before the killing beam, or expect zero disables. The spec’s testing example contains the same arithmetic error.

6. **Medium — Task 1, Step 1, existing beam-hit test:** the plan misses `expect(ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE * 0.5).toBeCloseTo(0.7, 10)`. The new constants produce **0.85**, so Step 6 fails. **Fix:** replace that assertion with `expect(enemyBeamThreshold(s, 0.5)).toBeCloseTo(0.7, 10)`.

7. **Medium — Task 1, Step 1, departure repair test:** asserting cleared arrays after `leave` cannot prove repairs happened first; skipping repairs entirely produces identical results. **Fix:** use downed Engines with repair and departure due together. Assert departure occurs: repairing before the engines-pause check prevents an extra departure tick.

8. **Medium — Task 1, Step 1, repair coverage:** no test repairs Shields while the enemy remains present, and repair/pause/damage tests do not establish their promised RNG neutrality. **Fix:** assert Shields remain down immediately before their deadline, restore to 30 at it, clear their timer, and absorb mismatched beams again; compare RNG states around isolated repair, pause, and nonlethal damage calls.

9. **Medium — Task 1, Step 6, survival fallback:** changing `ENEMY_FIRE_INTERVAL` to 20 leaves the existing `fireInterval` test pinned to 15, `150 / 13`, and 7.5. The fallback therefore cannot yield the promised green suite. **Fix:** explicitly update those expectations for the selected tuning, retaining escalation, floor, and solo checks, before the single re-bless.

10. **Low — Task 1, Step 1, arrival fixture:** bookkeeping correctly models one hazards draw, but the fixture never pins hazards state 7 as required by the spec. **Fix:** set `s.rng.hazards.s = 7` before capturing `h0`; assert frequency 1 and final hazards state `1831565820`, alongside unchanged director state.