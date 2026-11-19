# Round 1 response (code revised to 2cf622a1)

Reviewed `round-1.json` against `8cd4d314`. 3 accepted, 0 rejected, 0 deferred. Verify (`npm run typecheck && npx vitest run --reporter=dot`): typecheck clean, 368 files / 4902 tests pass. impl.diff and impl-index.txt in the run dir are regenerated for the new HEAD.

## R1-F1 [P1]: The born mask outlives its tick

Confirmed: duel.ts cleared the masks only in beginRockTick, while geometry.ts lineOfSight and rocks.ts firstBlocker read rockBorn between ticks (scripted pair, situation model), and a clone gets fresh masks. Fixed in 8156d631: `stepDuel` now also clears both masks after the outcome and before `tick++`, and keeps the start-of-tick clear. New `tests/rockMaskBetweenTicks.test.ts` is RED before the fix: lineOfSight across a just-born piece was true live and false on the clone. After the fix both agree and the masks are all zero. The same-version bless (2cf622a1) moved only basic.json's contentDigest; the duel goldens and determinism-v2 are unchanged. The seeds 1-20 twins and save/restore match.

## R1-F2 [P2]: Three spec rules had tests that would not catch a regression

Confirmed. Fixed in 45f74556:
- (a) A three-body once-per-pair setup. With the rockDone skip removed it fails (a.x -37 vs -32.5).
- (b) An r 15 unequal-mass impulse test that checks both velocities. It fails with is/ik swapped.
- (c) The static ram test asserts the hp drop of 0.156. It fails without case-2 ram damage.
All three mutations were restored.

## R1-F3 [P3]: A launch admitted against a rock that broke earlier in the same tick

Confirmed (the weapons.ts order). Fixed in 670e8421: `applyWeaponsInput` records `torpRock >= 0` after the rockLock fold. If a shot earlier in the same call broke the rock, it skips the manual and auto launch that tick. A test was written first and seen failing (missilesLaunched 1 at the enemy, now 0). The plan's deviation 11 notes that the command can still read 'applied'.

## Also changed

- The run dir's impl.diff and impl-index.txt are regenerated for HEAD 2cf622a1.

## Files changed

- src/renderer/src/sim/tactical/duel.ts
- src/renderer/src/sim/tactical/weapons.ts
- src/renderer/src/sim/tactical/hash.ts
- src/renderer/src/sim/tactical/rocks.ts
- src/renderer/src/sim/tactical/state.ts
- tests/rockMaskBetweenTicks.test.ts
- tests/rockContacts.test.ts
- tests/rockShips.test.ts
- tests/rockBlast.test.ts
- tests/golden/basic.json
- docs/superpowers/plans/2026-11-18-asteroids-ii.md

<!-- end -->
