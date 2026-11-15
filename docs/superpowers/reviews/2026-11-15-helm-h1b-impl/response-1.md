# Round 1 response (code fixed)

Reviewed `round-1.json` against the branch. 5 accepted (4 P1, 1 P2), 0 rejected, 0 deferred. All five were confirmed against the code and the sim's rules.

## R1-F1 [P1]: Weapons queues commands the sim rejects

Confirmed (`step.ts:L110-L111`, `weapons.ts:L33-L38`). The runtime now gates the tick's commands at tick time:
- `laserCharge` goes out only when `canCharge`, and `missileLaunch` only when `canLaunch`.
- A release goes out only after a press that was actually sent.

The sim applies a tick's weapon commands in the order lock, charge, launch, whatever order they arrive in. So a launch in the same tick never voids a charge command (commit `515ef7a`). `chargeSent` is cleared after the loop when a launch went out. Tests cover:
- Space while a missile flies;
- F with an empty magazine, and F with Weapons damage 2;
- F then a Space release before one tick, which fires the full charge and then launches (this test fails on the previous code with 0 shots).

## R1-F2 [P1]: Tab can invalidate commands queued before the switch

Confirmed. Tab drops the left character's pending lock, charge and launch commands. A stand does the same, since it also empties the seat before the weapon check. A charge already sent needs no release: the sim lets go of Fire without firing when Weapons is unattended (`weapons.ts:L75`). New test: F, then Tab, in two frames before one tick gives no `not-at-weapons` result and no stuck charge.

## R1-F3 [P1]: Sampled pointer input survives Tab and restart

Confirmed. After a Tab or a restart in a frame, that frame's sampled drag and wheel are discarded, and Tab also resets the wheel accumulator. Tests for both transitions show the new active camera, and the reset camera, unmoved and unzoomed.

## R1-F4 [P1]: Three crowded arrows can overlap after spreading

Confirmed with the given case. `spreadArrows` now places arrows monotonically along each edge with a minimum gap, clamped to the edge bounds. Tests with 3 and 4 clustered arrows check pairwise gaps and bounds. Spreading stays opt-in, so the flight view is unchanged.

## R1-F5 [P2]: Missile prediction starts from a different position than its glyph

Confirmed. The drawn path's first point is now the interpolated glyph position, and the layer strokes from it. Live state is not mutated. Test at alpha < 1.

## Also changed

- Each new test was confirmed to fail without its fix. `npm run typecheck` is clean and `npm test` passes 1,939 tests.

## Files changed

- src/renderer/src/app/duel/runtime.ts
- src/renderer/src/render/tactical/tacticalModel.ts
- src/renderer/src/render/tactical/weaponsModel.ts
- src/renderer/src/render/tactical/tacticalLayer.ts
- tests/duelRuntime.test.ts
- tests/duelWeaponsView.test.ts

<!-- end -->
