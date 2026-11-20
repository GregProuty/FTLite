# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `79fc2a7b`. 8 accepted, 0 rejected, 0 deferred. Each was checked against master's code before the spec changed.

## R1-F1 [P1]: The ping clock keeps running while paused or frozen, so re-rolled pings around a still enemy close in on its position

Confirmed: `scene.ts` L244 passes `performance.now() / 1000` to `stepFog` on every frame, paused or not. §2.3 now times pings on the tactical state's tick counter (`TacticalState.tick`, `state.ts` L175, read only), with `BLIP_PING_TICKS = 120` and the index `floor(t.tick / 120)`, and gives the reason. The derelict's and the torpedo's ghosts keep the presentation clock. §4 adds the frozen-state test, and §7 item 5 records the call.

## R1-F2 [P1]: `age` is undefined for a ping made partway through a period

Confirmed. The held ping now stores `madeAt` (a tick), and §2.3 defines `age = (t.tick - madeAt) / ((index + 1) * BLIP_PING_TICKS - madeAt)` within 0..1, so every ping starts at age 0. §2.4's tracker shape and §4's test (a ping made 78 ticks into a period) follow.

## R1-F3 [P1]: An off-screen blip gives no direction on the map, and it is off-screen at the default zoom

Confirmed: `scene.ts` L412 leaves an unseen enemy out of `ships`, and `tacticalModel.ts` L588 builds the enemy arrow only for a ship in that list; `ArrowTarget` (L98) has no blip member. §3 now adds an edge arrow toward an off-screen ping centre through the existing `arrow()` helper, as a new `ArrowTarget` `'blip'` named `BLIP` with `~<n>` (nearest 100), separate from the `'enemy'` arrow so the goal glow and the FIRING SOLUTION mark never attach. §1, §4 and §7 item 6 follow.

## R1-F4 [P2]: The on-screen test for the blip is not stated; the ghosts' rule would drop a visible large circle

Confirmed (`tacticalModel.ts` L655 culls ghosts by `onScreen(g.x, g.y, 40)`; `ringCrossesRect` is at L266). §3 now names the draw field `TacticalDraw.blip`, draws the circle when its ring crosses the view or its centre is on screen, and the `?` only when the centre is on screen.

## R1-F5 [P2]: The readout's fog input: the behaviour when it is absent, and the other callers, are not stated

Confirmed. §3 now specifies an optional `fog` on `readoutRows`' input, the exact row text, `NO CONTACT` when no fog or no blip is passed, and that only the scene's drawing call passes it.

## R1-F6 [P2]: Existing fog tests that the change breaks are not listed

Confirmed. §2.4 makes `FogView.blip` optional so the test literals need no edit, and §4 opens with the rewritten `tests/engineeringFog.test.ts` cases (the enemy ghost cases become the blip cases; the `NO CONTACT` case stays as the no-fog case).

## R1-F7 [P2]: The hash is not defined

Confirmed. §2.3 now gives the formula: a seed mix of `epoch` and `index + 1` with `Math.imul`, a 32-bit finaliser, `u` from the low 16 bits and `v` from the high 16, and says it reads no `Math.random` and no sim random state. §4 pins `u` and `v` for three fixed pairs.

## R1-F8 [P3]: The sit card's placement still reveals which half of the map an unseen enemy is in

Confirmed (`scene.ts` L446 passes the true enemy's `y` against the crew's). §3 now has the scene use the ping's centre for that test while the enemy is unseen, with a test in §4.

## Also changed

- §6 notes two older places that may give an unseen enemy away and are left as they are (the Helm path stopping on an unseen ship, and the `TORPEDO INBOUND` row), from the reviewer's not-verified list.

## Files changed

- docs/superpowers/specs/2026-11-19-sensors-blip-design.md

<!-- end -->
