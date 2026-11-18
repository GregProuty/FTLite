# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `c1c25e9f`. 12 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Out-of-seat hold contradicts the sim

Confirmed. step.ts sets the axes only when the Helm has an attendant, and solo Tab on the Hound works because the other character stays seated. Fix: a new layout field `helmHoldsUnattended`, true on the Valkyrn (§3.1, §4.4). When it is set, an empty Helm flies `throttleThrust(d.throttle)` and a `headingTurn` toward `holdHeading`. On the Hound it is absent (false), so an empty Helm flies zero axes as today and the goldens are unchanged. A test is added in §10.

## R1-F2 [P1]: No mechanism picks the class or records the laser switch

Confirmed. defs.ts has `DUEL_CLASSES` fixed at [Cutter, Hunter], and the tactical state uses `DUEL_CLASSES[0]`. Fix:
- §3.1 adds a layout field `shipClass`.
- §6.1 changes the call to `createTacticalState(seed, crewClass)`.
- `DuelState.crewClass` comes from `opts.cls`, else the layout, else Cutter. `startRound` and the snapshot header carry it, and `loadDuelSnapshot` passes it back.
- `systems[0].cls` is validated against it.
- §8: the laser fit is the class `valkyrnLaser`.

## R1-F3 [P1]: The required laser slot

Confirmed. defs.ts L42-43 types `slots` with a required laser. §6.1 changes it to `laser: LaserDef | null; gun: GunDef | null`:
- With laser null, every laser path is skipped.
- The three laser commands answer `unavailable`, and the refusal flash reads `NO LASER`.
- The weak frequency affects the laser only. This is stated as the one parity exception, and it can be tested with the laser fit.

## R1-F4 [P1]: Crew of one is outside Sci-2's range

Confirmed against the Sci-2 spec at L27, L37 and L44. Fix:
- §3.1 adds the layout field `crew`.
- §4.4 makes `opts.crew` the single source for crew size; if it disagrees with the layout's `crew`, createDuel throws.
- The widened validations are listed: local 1..4, online 2..4, codec unchanged.
- The runtime sites at n = 1 are listed.
- §5 checks against the crew. §10 adds the tests.

## R1-F5 [P1]: The auto-face dead band at 200°/s

Confirmed on accuracy. The nose can stop 2.5° off, which is 26 u at 600 and wider than the 20 u target radius. On chatter: a 3-index step cannot cross a band 3.5 indices wide, so chatter itself was not shown. The fix replaces the sine band for aim either way:
- §6.2 `aimTurn` works on the integer heading difference, with the band |d| ≤ 1.
- Every class asserts `turnStepsPerTick < 3`, so one tick's integer step (at most 3) can never cross the 3-index band.
- The settled nose is within 1.41° of the aim, which is 14.7 u at 600, inside the radius.
- Auto-face keeps its own band.

## R1-F6 [P1]: Gun fire does not end the grace hold

Confirmed in science.ts L30-39. §7.2 makes the rule read `shots + gunShots` and adds the cause `'gun'`, in the order laser, gun, missile, clock. A test is added in §10.

## R1-F7 [P1]: Flight-seat input collisions

Confirmed: Feel-ii uses the right button for heading and Space for auto-face. §5.1 adds a binding table. The right button is the torpedo, and the Flight seat has no click-to-heading or HDG marker. Space is auto-face, and the laser fit's laser auto-fires.

## R1-F8 [P1]: The no-id-literal grep and the Hound silhouette

Confirmed in hullModel.ts L44, hudModel.ts L345 and fleet.ts. Fix:
- §3.2 pins the pattern and the allowed files. The ai value `'hunter'` is excluded, and the sites to fix are listed.
- §3.1 adds a layout field `hull`.
- §4.5 adds a traced Valkyrn silhouette.

## R1-F9 [P2]: Gun state fields and reset rules

Confirmed. §7.3 adds a field table with hash and validator bounds. §7.2 gives the reset rules:
- any shield strip zeroes the gun wear;
- a repair zeroes that Room's wear;
- a Room at level 2 counts hull only;
- when the pool overflows, the round with the highest age is replaced, lowest index on ties.

## R1-F10 [P2]: Room set by approach, not aim

Confirmed: an entry point on the near hemisphere would make the Room depend on approach. §7.2 uses the segment's closest-approach point to the enemy centre, projected on the nose axis, with thirds at ±r/3 and ties going to Shields. §10 tests the front, the side and the rear.

## R1-F11 [P2]: Gun step order, spawn and the pip test

Confirmed. Fix:
- §7.1: the muzzles sit forward at r+1.
- §7.2: the gun fires pre-move in `applyWeaponsInput`. `stepRounds` runs after flight and contacts and sweeps against the post-move circle; a round moves on its spawn tick.
- §10 pins the pip test's flight configuration.

## R1-F12 [P2]: gunHeld and aim on the wire

Confirmed: contracts.ts L34 has neither field. §6.2 and §7.1 add both to `HeldInput`, with the codec, checkpoint and replay. An invalid aim counts as −1. The order is A/D, then face, then aim. The clear rule runs before the set rule.

## Also changed

- §4.1: a missing asset falls back to procedural tiles.
- §6.1: the new classes are appended to `SHIP_CLASSES` so existing indices do not move.

## Files changed

- docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md

<!-- end -->
