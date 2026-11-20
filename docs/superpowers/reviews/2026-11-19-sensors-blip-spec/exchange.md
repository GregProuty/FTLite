# Codex review exchange: sensors-blip-spec

Subject: `docs/superpowers/specs/2026-11-19-sensors-blip-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 24d3c28e, effort high, 213 s, 1044085 in / 966443 cached / 19874 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The ping clock keeps running while paused or frozen, so re-rolled pings around a still enemy close in on its position
Pings are timed on `now`, which the scene sets from `performance.now()`. That clock keeps running while the game is paused, while an online copy is frozen after a lost link, and while the tab is in the background. Each 2 s the blip is redrawn at a new offset around an enemy that is not moving. Every circle contains the enemy, with the enemy at least 0.2·r inside each edge. So the overlap of successive circles shrinks toward a disc of radius 0.2·r around the true point, and the average of the centres converges to the exact point. The spec never says what happens on a paused frame. · spec L47-48 ("on the presentation clock (`now`, the clock `stepFog` already takes)"), spec L49-53; scene.ts:L244 `stepFog(fog, d.tactical, performance.now() / 1000, source.epoch())` runs every frame whatever the pause state; scene.ts:L397 `frozen = source.paused() || source.live?.() === false` is never passed to stepFog; scene.ts:L422 the layer is still drawn while paused (`paused: overlay.layerPaused`). · A player can pause in Single player, watch about ten pings and find a still enemy to within 30-120 u. That defeats the blip, which is meant to hide the exact place. · Time the ping from the sim's round tick, which the view only reads: index = floor(roundTick(t) / (BLIP_PING_SECONDS × TICK_HZ)), and age from the ticks since the ping. A paused or frozen state then makes no new ping, and a background tab jump is handled the same way. Alternatively, pass `frozen` into stepFog and make no new ping while it is true. Add a test: a frozen state stepped across 10 s of `now` keeps one ping.

### [P1] R1-F2 `age` is undefined for a ping made partway through a period
The index is `floor(now/2)` and a new ping is due at the next multiple of 2 s. So an enemy first unseen at now = 5.3 gets a ping that lasts only 0.7 s. 'Age 0 at the ping, 1 just before the next' can then be built two ways: `(now − madeAt)/(nextMultiple − madeAt)`, or `(now mod 2)/2`. The second starts the first ping at age 0.65 and alpha 0.61, so the first pulse is lost. The spec does not say which. It also does not say whether the held ping stores the time it was made, which the first reading needs. · spec L47-48, L51 (index `floor(now / BLIP_PING_SECONDS)`), L58-59 (age 0..1, alpha `1 − 0.6 × age`), L67 (held ping `{ index, x, y, r }` has no made-at time), L94-95 (test: 'age runs 0 to 1 across it'). · Two implementers would draw different alphas, and the §4 test cannot tell which is right. With the second reading, an enemy that just slipped out of range appears already faded. · Pick one rule and state it. Recommended: the held ping stores `madeAt`, `age = (now − madeAt) / (BLIP_PING_SECONDS × (index + 1) − madeAt)`, clamped to 0..1, so every ping starts at full alpha. Or, with the tick clock from the finding above, store `madeAtTick`. Add a test case for a ping made 1.3 s into a period.

### [P1] R1-F3 An off-screen blip gives no direction on the map, and it is off-screen at the default zoom
While the enemy is unseen, the scene leaves it out of `ships`, so its edge arrow is not built. The spec adds nothing for a blip whose circle is off-screen. Sensor range is 300 to 2800 u and the console's default zoom is 0.5, so at the default zoom an enemy beyond range is usually off the map. The only other cue is the readout's `BLIP ~n`. It shows only on the ship (interior) view and has no bearing. So on Helm, Weapons, Science and Flight, the 'direction' promised in §1 is often missing unless the player zooms out. · spec L23 ('It gives a direction and a rough distance'), spec L79-80 ('No bearing row'); scene.ts:L412 `ships: fx.kill || !fogView.seen.enemy ? [0] : [0, 1]`; tacticalModel.ts:L588 the enemy arrow only `if (input.ships.includes(foe))`; readoutModel.ts:L150-158 the OUTSIDE rows only in `mode === 'interior'`; bars.ts:L104 `SENSOR_RANGE_BY_BARS = [300, 900, 1400, 2000, 2800]`; camera.ts:L5 `ZOOM_DEFAULT = 0.5`. · Ryan's note asks that the duel not become a search. With no edge cue, the console maps show nothing in ordinary play, the same as today after the ghost fades. · State the off-screen case. Recommended: when the blip's centre is off-screen, draw an edge arrow at the ping's centre, built with the same `arrow()` helper and labelled `BLIP ~<n>` (nearest 100). Give it its own ArrowTarget (e.g. `'blip'`), not `'enemy'`, so the goal glow and the FIRING SOLUTION bracket never attach to it (weaponsModel.ts:L205, L212 read `enemyArrow`). If no arrow is wanted, say so explicitly in §3 and §7.

### [P2] R1-F4 The on-screen test for the blip is not stated; the ghosts' rule would drop a visible large circle
Today the model culls a ghost with `onScreen(g.x, g.y, 40)`. A blip up to 600 u across can have its centre off-screen while its rim crosses the view. The spec does not say whether the blip uses the ghost rule, `onScreen(x, y, r)`, or `ringCrossesRect` as the sensor ring does. · spec L72-76; tacticalModel.ts:L655 (ghosts: `onScreen(g.x, g.y, 40)`); tacticalModel.ts:L654 (sensor ring: `ringCrossesRect`). · Two implementers would cull differently. Copying the ghost code would hide a visible rim, and the `?` would then vanish with it. · State it: draw the circle when `ringCrossesRect(centre, r·z, vp)` or the centre is on screen. Draw the `?` only when the centre is on screen. Name the draw field, e.g. `TacticalDraw.blip?: { x, y, r, alpha } | null` in screen px.

### [P2] R1-F5 The readout's fog input: the behaviour when it is absent, and the other callers, are not stated
`readoutRows` takes no fog today. It is also called three times only for its row count, and in many tests. The spec leaves the input to the plan and only covers 'no blip (no enemy ship)'. It does not say what the row reads when the enemy is active and unseen but no FogView is passed. · spec L78-81; readoutModel.ts:L114, L158; scene.ts:L267, L290, L310 (count-only calls), L437 (the drawn rows); tests/engineeringFog.test.ts:L163-171 expects `NO CONTACT` with no fog passed. · If the input is required, every caller and about 25 test call sites must change. If it is optional, the default has to be chosen. The row count stays the same either way, so `onWeaponsMap` is unaffected. · Specify `ReadoutInput.fog?: FogView | null`. With `fog.blip` set and the enemy unseen, the row reads `BLIP ~${Math.round(d/100)*100}`. Otherwise it reads as today (`NO CONTACT` when unseen). Only scene.ts:L437 passes `fogView`. Keep the existing test at engineeringFog.test.ts:L163 as the no-fog case.

### [P2] R1-F6 Existing fog tests that the change breaks are not listed
Removing the enemy's ghost makes the current enemy-ghost assertions fail. Adding `blip` to `FogView` breaks typecheck on the FogView object literals in tests unless `blip` is optional. §4 lists only new tests. · spec L87-104; tests/engineeringFog.test.ts:L49-60 (expects an enemy ghost at the last seen place and its fade), L65-66 (`ghosts.some(kind==='enemy')` is true); FogView literals without `blip` at L89, L91, L94, L109, L203, L257. · `npm run typecheck` and `npm test` are the final checks. A subagent following §4 alone would hit failures it was not told to expect. · Add to §4: rewrite engineeringFog.test.ts L49-69 as the blip cases (the ghost tests become no-enemy-ghost plus blip-present), and add `blip: null` to the listed literals, or make `blip` optional with absent meaning none.

### [P2] R1-F7 The hash is not defined
'A small integer hash of epoch and the ping's index' giving two numbers in 0..1 does not name a function, a mixing step, or how u and v are drawn from it. Two implementers would produce different offsets. The tests only check determinism and that another index gives another offset. · spec L50-55, L93. · The role asks for a spec two implementers would build the same way. It also matters for golden-style model tests that pin a centre. · Give the formula, e.g. `h = imul(epoch ^ 0x9e3779b9, 0x85ebca6b) ^ imul(index, 0xc2b2ae35)` followed by a murmur3 fmix32. Take u from the low 16 bits / 65536 and v from the high 16 bits / 65536. Or name an existing view-side hash to reuse. Say that it uses no `Math.random` and no sim RNG.

### [P3] R1-F8 The sit card's placement still reveals which half of the map an unseen enemy is in
The scene passes `enemy.y > crew.y` from the true state to `sitCard` whether or not the enemy is seen, and the card moves to the top or bottom to match. This predates the spec and is coarser than the blip. But §3's 'Unchanged' list says nothing else reveals the unseen enemy. · scene.ts:L446 `sitCard(seat, t - sitAt, acted, (d.tactical.ships[enemySlot]?.y ?? 0) > d.tactical.ships[CREW_SLOT].y, ...)`; sitModel.ts:L43-45 (`top: enemyBelow`). · It is a small leak of the true position next to a feature meant to make that position rough. · Either note it in §3, or use the ping's centre's y when `!fogView.seen.enemy` (the blip is there from the first frame, so a centre always exists while the enemy is active).

## Verified
- stepFog has everything the blip needs without a sim change: `t` (the crew ship at t.ships[CREW_SLOT] and the enemy at targetOf), `sensorRange(t.systems[CREW_SLOT])`, `now` and `epoch` (fogModel.ts:L23-27). The enemy's presence and seen flag are already computed (fogModel.ts:L27). The ping's 'true position' is therefore the tick state, not the interpolated one.
- The scene builds one fogView per frame for every view, including the ship (interior) view (scene.ts:L244). So a readout given that fogView in Single player or online needs no sim, wire or hash change.
- The Valkyrn's Flight seat does pass `fog: fogView` (scene.ts:L412 for every map view). The 'Absent (the flight view): no fog' comment (tacticalModel.ts:L182) refers to the old flightMode.ts:L62 caller, which passes no fog. §3's list of Helm, Weapons, Science and Flight is correct.
- Readers of `ghosts` are only tacticalModel.ts:L655 and tacticalLayer.ts:L254. `GhostKind` is also used by GhostDraw (tacticalModel.ts:L113). No reader depends on an enemy ghost existing, so the removal is complete in src (tests aside; see findings).
- Readers of `seen.enemy` (pickShip tacticalModel.ts:L683, camera framing scene.ts:L382, the `ships` list scene.ts:L412, contactModel's `seen` scene.ts:L434) are unaffected by the change, as §3 says.
- With the enemy out of `ships`, the ship draw, contact mark and Science lock ring (tacticalModel.ts:L600), the gravity-grid dents (L521), the enemy edge arrow (L588), the Weapons enemy arc and info (weaponsModel.ts:L193-195), the FIRING SOLUTION bracket (L202-205) and the goal glow (L212, needs enemyArrow) all stay hidden. The enemy torpedo (weaponsModel.ts:L163, L267) and pew rounds (L300) stay fogged.
- Sparks, beams and bursts from unseen points are dropped (scene.ts:L146-155), sounds play centred (scene.ts:L136-138), and the torpedo lock tone needs the enemy seen (scene.ts:L130). The lock refusal `NO CONTACT` (situationModel.ts:L213-215) is unchanged.
- `dashCircle`, `segments` with an alpha, and a `words` text list with tint and alpha are all available in the layer where the ghosts are drawn (tacticalLayer.ts:L245-257), so the dotted circle and `?` need no new drawing primitive.
- The radius arithmetic is consistent: 150 + 0.25×1000 = 400; 150 + 0.25×1800 = 600, so 3000 beyond gives 600 (spec L40-42, L91). The offset of 0.8·r·sqrt(u) keeps the enemy at least 0.2·r inside the edge (spec L51-52).
- 'Nearest 100' is consistent with the example: 1760 rounds to 1800 (spec L101). The ping's centre is at least range − 0.8·r_min ≥ 180 u from the crew, so the row never reads ~0.
- `targetOf` is `state.systems[i].target` (state.ts:L300) and contactSeen uses the same slot (science.ts:L58-59), so the readout's `shipSeen(t, target)` and the fog's `contactSeen` agree.

## Not verified
- Whether any round type starts with the crew's target ship inactive (a derelict-only or peaceful start). Ships are built active by `shipAt` and unused slots by `emptyShip` (state.ts:L214-221), but I did not trace the round setup for every mode.
- Whether `predictFlight`'s contact test (`touchesAhead`, predict.ts:L107) counts the enemy ship. If it does, the Helm path's COLLISION mark would sit at the unseen enemy's real place. touchesAhead was not read; this is outside the manifest.
- Whether the readout's TORPEDO INBOUND row (readoutModel.ts:L163-164, INCOMING_RANGE with no fog check) or `flightAlert` reveals an unseen enemy's torpedo beyond sensor range. This predates the spec and was not traced.
- The exact viewport size and reserves, used to judge how often the blip is off-screen at ZOOM_DEFAULT 0.5. I judged it from the constants, not measured.
- What `source.epoch()` returns in Single player and online (its range and whether it repeats across sessions). It does not affect correctness, given that two clients need not agree.
- situationModel.ts and contactModel.ts beyond the cited lines; the 'CONTACT LOST / OUT OF SENSOR RANGE' window text was taken as unchanged from the `seen` input at scene.ts:L434.

---

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

---

