# Round 1 response (no subject change)

Reviewed `round-1.json` against the subject at `5d91aa69`. 0 accepted, 0 rejected, 1 deferred.

## R1-F1 [P3]: The card's STEER A/D / COASTING words run one tick behind the sim's steering window at both ends

Deferred, and confirmed against missiles.ts. `flyMissile` increments age before testing the window, so the label flips one tick (about 17 ms) away from the sim's edge. At 60 Hz the player cannot see the gap, and the label matches the plan as written (plan L120). It goes into the follow-up list: judge the next tick (`age >= boostTicks && age < fuelTicks`) and move the UI test's edge ages to match.

## Also changed

- (nothing)

## Files changed

<!-- end -->
