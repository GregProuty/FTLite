# Codex review: Combat-ii plan half 2 (2026-11-11)

1. **Medium — Task 2, lines 315–321:** Starter Science output is `(1 / 2) × 0.75 = 0.375`, not 0.5. The planned 721 calls yield approximately 0.75104, so completion assertions fail. **Fix:** expect 0.375 output and test exactly 960 total calls, accounting for the initial call; separately test overshoot clamping.

2. **Medium — Task 2, lines 311–312:** The lethal beam reduces shields from 30 to 15 before `leave` clears them; no subsystem disable occurs. Actual counters are `[0, 1, 0]`, not `[0, 1, 1]`. **Fix:** set shield HP to 15 before firing to exercise simultaneous disable and destruction; correct the corresponding spec testing example.

3. **Medium — Task 2, line 273:** Existing `armed()` takes only `hull`. Adding `shieldFreq` as its *third* parameter conflicts with the new two-argument calls. **Fix:** specify `armed(hull = ENEMY_HULL, shieldFreq = 1)` and forward both to `placeEnemy`.

4. **Medium — Task 3, line 434:** Updating expected objects and the enemy literal leaves the existing `targetRowText` debris literal missing required `system`, `status`, and `shieldsUp`; its derived shot literals also fail typechecking. **Fix:** add all three fields as `null` to that debris fixture.

5. **Medium — Task 2, Step 1:** The existing “Science guards” test still expects enemy Confirm to leave `scanning === 0`, contradicting the new behavior. **Fix:** replace its obsolete assertions while retaining the debris-read trap and checking that object scan progress stays unchanged.

6. **Medium — Task 2, selector-loop migration:** The surrounding existing assertion `ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE * 0.5 ≈ 0.7` remains; after Task 1 it evaluates to 0.85. **Fix:** assert `enemyBeamThreshold(s, 0.5) ≈ 0.7` instead.

7. **Medium — Task 2, Step 3; Task 3, Step 1:** Import migrations omit `isEnemySlot` in `science.ts` and `ENEMY_SHIELDS_SLOT` in `hud.test.ts`, despite introducing references to both. **Fix:** explicitly add those imports.

8. **Medium — Task 3, line 458:** The HUD `not.toThrow` loop never installs `guardDebris`; out-of-range typed-array reads can silently return `undefined`, making this insufficient for the spec’s read-trap requirement. **Fix:** expose/reuse the expanded guard and install it before exercising `buildHudModel` on every enemy slot.