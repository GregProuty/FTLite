# Round 1 response (tests strengthened; no production code changed)

Reviewed `round-1.json` against the subject at `bc9dd45`. 3 accepted, 0 rejected, 0 deferred. No prior IDs (round 1). All three findings were test-adequacy gaps backed by in-memory mutations; the implementation was already right, so only test files changed. Each fix was checked by re-running Codex's mutations, and two more of mine, against the new tests: every mutation now fails. Verify: `npm run typecheck` exit 0; `npm test` 138 files passed (1 skipped), 1,785 tests passed.

## R1-F1 [P1]: Make the laser occlusion test reach the line-of-sight check

Confirmed. The planet case put the ships 600 apart, so `laserEligible` returned on range (`weapons.ts:41`) before reaching `lineOfSight` (L42). The new test `a release in range and arc misses when the planet or an asteroid blocks the line of sight` places the ships 400 apart along x with the blocker centred between them: the planet, then asteroid 0. It asserts `lineOfSight` false, `inArc` true and distance ≤ `LASER_RANGE`, so only occlusion can cause the miss. It then releases a full charge and asserts shots 1, hits 0, the target's shields and hull unchanged, and a `laser` event with `hit: false`. The old test keeps its arc and range cases. Mutation check: removing `lineOfSight` from `laserEligible` now fails this test.

## R1-F2 [P1]: Test shield-clock preservation with nonzero progress

Confirmed. The level-2 case froze a clock that was already 0. The new test `Shields level 2 holds a part-charged clock exactly, and repair to level 1 resumes it to the exact tick` charges the clock to 450 of 900 (150 ticks at 3), sets Shields to level 2, and asserts 450 on every one of 600 ticks. It then repairs to level 1 and asserts shields 1 with clock 898 after 224 ticks, and shields 2 with clock 0 on tick 225. The old recharge test is retitled to cover only the rates. Mutation check: resetting the clock whenever Shields is at level 2 now fails.

## R1-F3 [P1]: Exercise the hunter's temporal and RNG invariants

Confirmed. Three new tests in `tacticalHunter.test.ts`:
- **Lead:** the crew is dead ahead of the west-facing enemy but moving south at 600 u/s, so the 0.5 s lead point is south-west and the turn is −1. Moving north gives +1. Without the lead the turn would be 0.
- **Trail delay:** with the enemy's missile pointing north, the crew alternates 18 calls east and 18 calls west of the missile for 72 calls (four wraps of the ring buffer). Steering on calls 18–35, 36–53 and 54–71 is exactly +1, −1 and +1, which is the position from exactly 18 calls earlier.
- **One draw:** the rng seed is chosen so the first jitter is at least 3 ticks, and `state.rng` is compared with a reference stream advanced by exactly one `nextInt(13)`. Scheduling takes exactly one draw and sets `fireAt = tick + j`; waiting takes none. Moving the crew out of arc cancels (`fireAt` −1, no draw); moving back takes exactly one more draw; the release then comes on the scheduled tick with no further draws.

Mutation check: removing the velocity lead, reading the newest trail slot, an extra draw when scheduling, and a draw while waiting each make these tests fail.

## Also changed

- (nothing)

## Files changed

- tests/tacticalWeapons.test.ts
- tests/tacticalHunter.test.ts

<!-- end -->
