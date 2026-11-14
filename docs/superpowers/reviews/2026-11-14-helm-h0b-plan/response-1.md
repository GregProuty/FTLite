# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `8cfe5be`. 4 accepted (3 P1, 1 P2), 0 rejected, 0 deferred. No prior IDs (round 1). After the fixes, the plan was applied task by task to a fresh worktree of master, and each task typechecked and passed its tests (137, 162, then 179).

## R1-F1 [P1]: Start the hunter's missile cooldown only after a successful launch

Confirmed. `hunterThink` set `lastLaunch` while building the input. `stepDuel` then applies ship 0's weapon commands before ship 1's, so a crew laser hit can raise the enemy's Weapons to level 2 and `applyWeaponsInput` refuses the launch, but the cooldown was already spent. `hunterThink` now only requests the launch. `stepDuel` records the enemy's `missilesLaunched` before the command loop and sets `hunter.lastLaunch = state.tick` only if it went up. The hunter launch test now drives the launch through `stepDuel`. A new test sets up exactly the refused case (enemy Weapons 1, shields 0; the crew's full charge locked on Weapons is released that tick) and asserts Weapons 2, no enemy missile, and `lastLaunch` unchanged. Task 3's interface text states the new rule.

## R1-F2 [P1]: Give pursuit steering a deterministic turn when the target is directly behind

Confirmed. `sideOf` is a cross-product sign, 0 both dead ahead and dead astern, so a lead point or trail point exactly behind gave no turn (and, for the ship, no thrust). The new exported `pursuitTurn(heading, dx, dy)` returns `sideOf`, except +1 (clockwise) when the cross product is 0 and the dot product is negative. Ship pursuit and missile steering both use it; threat avoidance keeps its own rule. New test: an enemy facing west with the crew due east gets `{ turn: 1, thrust: 0 }`; a missile pointing north with the trail due south steers 1; `pursuitTurn` dead ahead is 0.

## R1-F3 [P1]: Expire missiles at the end of their 480th flight tick

Confirmed. `flyMissile` incremented `age` and expired on `age > 480` before moving, so a missile lived into a 481st call and the laser stayed frozen one tick longer. As the finding says, changing that to `>=` would drop the 480th move. `flyMissile` now only moves. `resolveMissiles` ends, as `'expired'`, any missile still alive with `age >= MISSILE_LIFE_TICKS` after all contacts. `stepDuel` runs that before the weapon clocks, so the laser unfreezes on the same tick. Thrust still applies while `age <= 360`. New tests: an eastbound missile at age 359 gains at least `MISSILE_THRUST · DT` on tick 360 and only gravity (under 0.2 u/s) on tick 361; a missile at age 478 in open space is alive after tick 479 and gone at the end of tick 480, with the `expired` event and `missilesLost` 1. The old combined turn-and-expire test is now a turn-only test.

## R1-F4 [P2]: Test the resumed full-charge hold timer without a fresh press

Confirmed: no test covered decision 4's central case. New missiles test: charge to full and hold for 100 ticks; launch, so charge and hold freeze for 50 ticks at (full, 100) with `fireHeld` false; the missile hits the planet and the hold resumes that tick (101); after the remaining ticks it is at 179, then vents to (0, 0) on the 180th; 60 more ticks with no press leave the charge at 0.

## Also changed

- Task 2 and Task 3 expected counts: 11 missile tests, 15 hunter and duel tests.

## Files changed

- docs/superpowers/plans/2026-11-14-helm-h0b-combat.md

<!-- end -->
