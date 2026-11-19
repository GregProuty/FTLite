# Codex review exchange: 2026-11-18-playtest2feedback-spec

Subject: `docs/superpowers/specs/2026-11-18-playtest2feedback-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing d4ef7118, effort high, 361 s, 1691220 in / 1574956 cached / 34151 out; 1 failed attempt)

Verdict: changes requested

## Findings

### [P1] R1-F1 The continuous throttle is quantised to quarters, and any reverse becomes full reverse
§3 says the throttle is per mille, the thrust axis is throttle/1000 forward and throttle/250 in reverse, and 'the flight code is unchanged'. But flyShip rounds the thrust axis to quarters and flies any negative axis as full reverse. So the 'ramp' reaches the ship as steps at 125, 375, 625 and 875 per mille. Below −31 per mille the reverse is a single on/off step to full reverse. Separately, §7 says the flight step does change (thruster push, speed cap), which contradicts 'unchanged'. · spec L84, L96-L99, L242; physics.ts:L32 (`Math.round(axes.thrust * 4)` / 4), physics.ts:L53 ('any reverse is full reverse'). Arithmetic: 124/1000·4 = 0.496 rounds to 0, and 125 rounds to 1 (¼). −31/250·4 = −0.496 rounds to −0, giving 0, while −32 gives −0.512, which rounds to −1, which is full reverse. throttle.ts:L20 is today's level-based throttleThrust, which can't keep 'its shape' with per-mille input. · The owner's core note is a lever that moves continuously. As written, the thrust either moves in four steps (if the implementer keeps flyShip) or flies continuously (if the implementer drops the rounding, which changes the Artemis §5.3 rule). Reverse is binary either way unless L53 changes. Two implementers would build different ships. predictPath shares flyShip, so whichever choice is made must be the same in both. · State the flyShip change explicitly: the thrust axis is used unrounded (or rounded to thousandths, Math.round(thrust·1000)/1000), clamped to [−1, 1]. Reverse becomes proportional: `ax -= h0 · cls.thrust · cls.reverseFraction · |q| · f`. Note that the Hunter and the dev flight view pass whole axes, so they fly as before, and that predictPath picks the change up through the shared flyShip. Give the new throttleThrust exactly: `t < 0 ? t / 250 : t / 1000`. Delete 'the flight code is unchanged'.

### [P1] R1-F2 The spec never says which of §2-§5 apply to the Valkyrn, though it sits in the same crew slot
The crew slot (slot 0) holds the Valkyrn whenever crewClass is Valkyrn. The spec says CREW_FLIGHT is 'used for the crew slot', removes the `throttle` command everywhere, makes an unattended Helm (naming `helmHoldsUnattended`, which is the Valkyrn's layout flag) ramp to 0, and boosts 'any turn of the crew ship'. The fixed decision and Out of scope say the Valkyrn keeps today's controls. Today the Valkyrn's Flight seat steps the throttle with W/S notches, through the same command the spec deletes, and it flies its stored throttle while the seat is empty. · spec L76-L77, L101-L111, L162, L244, L306; runtime.ts:L392-L395 (the Flight seat queues `throttle` from throttleRequest); step.ts:L284-L287 (helmHoldsUnattended flies d.throttle); scriptedPilot.ts:L121-L139 (the Valkyrn pilot sends throttle commands and PILOT_AWAY_THROTTLE); defs.ts:L100-L101 (Valkyrn classes in the crew slot). · It's impossible to remove the throttle command and also keep the Valkyrn's throttle controls. An implementer has to guess whether the Valkyrn gets the held ramp, Newtonian flight, a gas tank, helmPower and the boost. Any guess either violates the fixed decision or leaves the sim with two throttle models. · Add a Valkyrn rule. Recommended: keep the Valkyrn on today's flight and controls by gating §2-§5 on the crew class (Cutter/Hound: a class flag such as `newtonianHelm`). The Valkyrn then keeps DEFAULT_FLIGHT, gets no thrusters, no boost and no helmPower (refused `unavailable`), and keeps an unattended throttle that holds. Then decide how the Valkyrn's W/S sets the throttle without the `throttle` command: either keep the command and admit it only for that class, or give the Valkyrn the held ramp too with an explicit owner sign-off. Update scriptedPilot to match.

### [P1] R1-F3 'Steering clears the held heading' reverses today's aim rule, and the change isn't limited to the crew ship
Today a valid held aim becomes the held heading (Valkyrn §6.2), so the nose keeps turning onto the last aim. §4a says a held aim sets holdHeading to −1. It also says the priority in helmTurn is unchanged and that the code 'stays as it is for the Valkyrn'. But the holdHeading write is in stepDuelTick, which every class shares, not in helmTurn. · spec L147-L153, L274; step.ts:L282-L283 (`else if (heldAim(h) >= 0) d.holdHeading = heldAim(h)`); step.ts:L284-L286 (the Valkyrn's unattended flight turns on that held heading); scriptedPilot.ts:L121-L125 (it stands up relying on 'the ship flies the last aim'). · Applied as written, the change also hits the Valkyrn: a pilot who stands up loses the course their aim set. Limited to the crew class, it needs a branch the spec doesn't describe. Two implementers would put it in different places. · Write the rule as a class-gated change at step.ts L283: for the crew classes (Cutter/Hound) a held aim sets holdHeading = −1, and for the Valkyrn it stays `holdHeading = heldAim(h)`. Add a Valkyrn regression test that a held aim still becomes the held heading.

### [P1] R1-F4 The code has no per-slot flight tuning, and the predictions would still fly the crew with drag
§2 and §7 say the crew slot uses CREW_FLIGHT and the Hunter uses DEFAULT_FLIGHT. But stepDuel takes one tuning and passes it to every slot. predictPath and predictFlight also default to DEFAULT_FLIGHT, and the scripted crew's hazard check and the app's drawn path call them for slot 0. The spec names no interface for choosing a tuning per slot, and doesn't ask the predictions to use CREW_FLIGHT. · spec L76-L77, L242-L243; tactical/duel.ts:L24, L32 (one `tuning` for every flySlot); physics.ts:L62-L68; predict.ts:L23, L29 (`tuning = DEFAULT_FLIGHT`); scripted.ts:L87 (`predictPath(t, 0, axes, AVOID_TICKS, 4)` with no tuning); physics.ts:L28 (the shared flyShip exists 'so the prediction is exact'). · One implementer passes a tuning array, another adds a field to the class, a third branches on slot === CREW_SLOT. A missed predictPath caller draws or avoids along a path with drag while the ship coasts without it. The scripted gates and the Helm's drawn path would then be wrong. · Specify one mechanism. Recommended: `flightFor(state, i): FlightTuning`, returning CREW_FLIGHT for CREW_SLOT when the class is a crew-Helm class and DEFAULT_FLIGHT otherwise. stepDuel/flySlot use it instead of the single `tuning` argument (keep the argument only for the test configurations), and predictFlight defaults to `flightFor(state, shipIndex)`. List every predictPath/predictFlight caller (scripted.ts L87, scriptedPilot hazardAway, the app's situation/console path) as switching to it.

### [P1] R1-F5 The top speed cap's rule is not exact
'Any thrust component that would take the speed past 400 in the velocity's direction is dropped, and the rest is kept' leaves several things open. Is the parallel component dropped whole, or trimmed so the speed lands exactly on 400? What happens at |v| = 0, where there is no direction? A perpendicular component always raises |v| (to sqrt(|v|² + dv⊥²)), so the speed creeps past 400 while the ship turns. That contradicts the test 'thrust stops adding speed at 400'. Is the cap taken from the velocity before or after gravity? Is the edge spring capped? · spec L71-L75, L242, L265; physics.ts:L49-L54 (gravity, the edge and thrust all summed into one ax/ay before one integration). Creep: a 35 u/s² push across the velocity at 400 gives sqrt(400² + 0.583²) ≈ 400.0004 per tick. Main thrust 45° off the velocity adds about 0.0025 u/s per tick, about 1.5 u/s every 10 s. · Each reading gives different float trajectories, so the goldens and the 'stops at 400' test depend on which one the implementer picks. With no drag, the creep is never undone. · Give the exact algorithm, in flyShip order. (1) dv = (main + thruster accel) · DT. (2) s0 = |v|, v1 = v + dv, s1 = |v1|. (3) If s1 > max(MAX_SPEED, s0), scale v1 by max(MAX_SPEED, s0) / s1. That uses + − × ÷ sqrt only, keeps the perpendicular turn, and never adds speed past the cap or past the current speed. (4) Then add (gravity + edge) · DT, uncapped. State that s1 = 0 skips the scale. Rewrite the test as 'speed never exceeds max(400, the speed before thrust) on a thrust-only tick'.

### [P1] R1-F6 The boosted turn's dead band leaves out auto-face, and the boost rule depends on itself
§4a fixes the band only in aimTurn and headingTurn, but the boost also applies to auto-face, which goes through faceTurn with AUTO_FACE_SIN. That band is about ±1.78 index units wide, the same as a 1× step, and the boosted step is about 3.56. The scripted crew holds `face` to line up. The rule is also circular: the band depends on whether the tick is boosted, and the boost applies only if the turn axis is non-zero. 'Stop within it' doesn't say |d| < step or |d| ≤ step, or whether headingAcc's fraction counts. headingTurn is the Hunter's module function, and defs.ts asserts a turn of under 3 steps 'so the aim band' holds. · spec L156-L169; hunter.ts:L30-L48 (autoFaceTurn and headingTurn both use faceTurn's AUTO_FACE_SIN band); tuning.ts:L125-L127 (the band is sized for 'a step of 1 or 2 heading units'); step.ts:L101-L104 (|d| ≤ 1); scripted.ts:L119 (`face: true`); defs.ts:L115-L117. 2 × TURN_STEPS_PER_TICK = 2 × 1.778 = 3.556. · A boosted auto-face, and the scripted crew's line-up, can step across the band and chatter, and each chattering tick spends gas. Implementers would also settle the circularity differently, so the nose stops at different headings. · Define it once. step = turnStepsPerTick × engineFactor × (boost-eligible ? RCS_TURN_BOOST : 1), where boost-eligible means rcsGas ≥ RCS_TURN_GAS and engineFactor > 0, decided before the turn is computed. aimTurn, headingTurn and autoFaceTurn (faceTurn) all take that step and return 0 when the target is within ceil(step) indices (for faceTurn, sin of step·360/256°). The tick is boosted only if that turn is non-zero. Keep the Hunter's calls at its own unboosted step, and add a matching assertion for 2× in defs.ts.

### [P1] R1-F7 The authority's held-input lists and checkpoint schemas don't know the new fields
§7 only adds the new held fields to the codec's held schema and the online frames. The authority lists held fields explicitly in four places. The watchdog's expiry check only expires a player when moveX, moveY, interact, face, gunHeld or aim is set. A pause deletes face, aim and gunHeld by name. Both checkpoint held schemas are `.strict()`. · spec L222-L225; authority/core.ts:L327-L331 (expiry check), core.ts:L435 (pause clear), authority/checkpoint.ts:L40 and authority/duelCheckpoint.ts:L73 (strict held objects); net/codec.ts:L151; receivePolicy.ts:L4 (REMOTE_HELD_TIMEOUT_MS = 250). · Say a held frame is lost or the link stalls while ↑ or Q is held (rcsY/rcsX only). The watchdog never neutralises that player, so the authority keeps venting gas for as long as the stall lasts, and a pause can leave thrusters venting. A checkpoint holding throttleHeld/rcsX/rcsY fails its strict schema, so a durable restore breaks. · Add throttleHeld, rcsX and rcsY (as z.number().int().min(−1).max(1).optional()) to all three held schemas. Add `throttleHeld/rcsX/rcsY !== 0` to the expiry check at core.ts L329, and delete them in the pause clear at L435. State the degraded behaviour: a stale frame holds for at most 250 ms (15 ticks, at most +105 per mille of throttle and 120 gas per axis), then the Helm reads as released and the throttle returns to 0. Add a test for a lost release frame.

### [P1] R1-F8 Removing the `throttle` command and A/D turning breaks consumers the spec doesn't list
§3's removal list and §7's file list leave out several places that read the throttle command, the throttle base or A/D turning. · spec L47-L54, L101-L106, L150-L155, L209-L211. Not covered: onlineSource.ts:L141-L155 (`throttleBase`, `shownThrottle`, axes from throttleThrust); onlineDuel.ts:L102-L103, L201-L202, L255-L257 (`throttleSent`); scene.ts:L238, L246 (`sitThrottle` decides whether the player 'acted'); telemetry.ts:L132-L133 (bait = moveX turning or throttle ≠ 0; the crew no longer turns by moveX); input.ts:L9-L14, L109 (the throttleUp/Down KeyActions and Shift+W full burn); controlsList.ts:L32-L33, L52-L53, L71; runtime.ts:L423 (headingBase 'turning' = moveX), runtime.ts:L427 (A/D raises the 'turn' refusal with Engines off, but A/D now strafes and thrusters still work); HelmStation.tsx:L64-L66 (the turn buttons hold KeyA/KeyD under 'HOLD TO TURN'); situationModel.ts:L110 (the predicted path's axes, with no rcs/boost); uiProbe.ts:L21. The puffs at L210 say the runtime 'already learns' the vented axes 'from the sim's axes', but runtime.ts:L321 recomputes sentAxes from held input and d.throttle after the step, so the gas state it would test is already the next tick's. · Each of these either stops compiling or quietly does the wrong thing: telemetry baits miscounted, a strafe refused as a turn, turn buttons that now strafe, puffs drawn from the wrong tank state. Fresh subagents only change the files the plan lists. · Add these files and rules to §3, §6 and §7. Recommended: the sim records the tick's vented axes (`rcsVentX/Y` and `boosted`, unhashed scratch, or derived and exposed) for the puffs. Telemetry counts an aim-held or held-heading turn or a vent as a manoeuvre. The Helm's turn buttons become port/starboard thruster buttons (or go). The 'turn' refusal follows aim steering, not A/D. Shift+W, the throttle KeyActions and the controls list entries are removed.

### [P2] R1-F9 The stand-in budget of 4 doesn't match Engineering's start of 3 Engines bars, and the merge note leaves the engine factor open
With the stand-in, the round starts at ENGINE 3 / COMPRESSOR 1, a 75 % cap. After merge, HELM_BARS becomes Engineering's Engines effective bars, which start at 3 (§10.1). The same compressor 1 start then gives ENGINE 2, a 50 % cap. That contradicts Engineering §9's owner rule of '75 % throttle by default'. Engineering's engine factor `[0,1,1,1,1,1.25]` indexes Engines bars. This spec says ENGINE bars 'don't change turning' but that a 5th ENGINE bar gives 1.25×. Which number the factor reads (Engines bars or the ENGINE share) is undefined. 'Bars come off COMPRESSOR first until it fits' doesn't say what 'fits' means. Both this spike and pew pew claim SIM_VERSION 53 → 54. · spec L173-L196, L164, L181-L182, L249; engineering-spike-design.md:L296, L306, L365, L379-L381; pew-pew-weapons-design.md:L126. · The owner will tune the power split at a 75 % start that the merged game won't have. Whoever merges second has to make game-design decisions the note doesn't record. · Extend the merge note. (a) Either Engineering's Engines start becomes 4 (and the reactor's spare drops to 0) or the merged start split is compressor 0 at 3 bars; mark it as an owner call. (b) The engine factor reads Engines effective bars, not the ENGINE share; only the cap reads the share. (c) Losing a bar takes it from COMPRESSOR while compressor > 0, and only then from ENGINE. (d) Whichever spike merges second takes the next SIM_VERSION.

### [P2] R1-F10 Gas rules contradict each other, and the bounds and full-tank behaviour are unspecified
§4 says an axis pushes while 'the tank is above 0' and also that it vents 'only if the tank holds at least its cost' (8). The sixtieths accumulator doesn't say what happens at a full tank: does rcsAcc keep counting, reset to 0, or carry the remainder? The refill is 'gas = min(gas + whole, RCS_TANK)'? §7 asks for snapshot bounds but gives no values. It doesn't say whether the compressor refills while the Helm is unattended or the round is decided. · spec L123, L129-L130, L133-L139, L228-L234; snapshot.ts:L173-L178 (today's helm bounds are explicit per field). · A tank at 1..7 units thrusts under one rule and not the other. rcsAcc handling at the cap changes exact refill tick counts, which is what the 'refill timing is exact' test checks, and it changes the hash. · Use 'rcsGas ≥ RCS_GAS_PER_TICK' at L123. Specify: each tick rcsAcc += COMPRESSOR_BARS_RATE[compressor] (0/50/100/150), then gas += floor(rcsAcc/60) and rcsAcc %= 60, then gas = min(gas, RCS_TANK). When the tank is full, rcsAcc is set to 0. The refill runs every running tick, attended or not. Snapshot bounds: rcsGas an integer 0..RCS_TANK, rcsAcc an integer 0..59, compressor an integer 0..3, throttle an integer −250..1000.

### [P2] R1-F11 Some acceptance tests can't be reached with the stand-in budget
With HELM_BARS = 4 and compressor ≤ 3, ENGINE is always ≥ 1, so 'ENGINE 0 gives a floor of 0' and the ENGINE ≥ 1 reverse rule can't be exercised. 'Held W reaches 1000 after ceil(1000/7) ticks' fails from the round start, whose cap is 750 (ENGINE 3). 'Losing bars' can't happen until Engineering lands. · spec L174, L177-L179, L188, L191, L257, L260; ceil(1000/7) = 143 ticks, against a start cap of 3 × 250 = 750. · A subagent will either write tests that fail or quietly skip them. · Make HELM_BARS a createDuel/test parameter (or a tuning a test can override), and state the test setup: compressor 0 for the 1000 test, HELM_BARS 3 with compressor 3 for the ENGINE 0 floor. Alternatively, move the ENGINE 0 and losing-bars tests to the merge.

### [P2] R1-F12 The scripted crew still turns with moveX, so 'the A/D branch never fires for the crew Helm' is false
§4a says helmTurn's moveX branch never fires for the crew Helm because the client sends moveX = 0. The scripted crew's Helm sends `moveX: axes.turn` for every non-face turn, and the sim still admits moveX turning for every class. So the scripted crew turns by a path human players no longer have, gets no aim band, and clears holdHeading the old way. A modified online client could do the same. · spec L150-L153, L244-L246; scripted.ts:L321; step.ts:L110, L282. · The scripted duel gates would measure a ship humans can't fly. The client-only rule also isn't what the authority enforces. · Either have the sim ignore moveX turning for the crew Helm classes (an authority rule), with the scripted crew moved to `aim` (as scriptedPilot does), or keep moveX in the sim and reword L151 to say the human client stops sending it while the scripted crew still uses it.

## Verified
- The ramp numbers match: 7/tick × 60 = 420 per mille/s, ceil(1000/7) = 143 ticks ≈ 2.4 s; 34/tick × 60 = 2040/s, and 1000/34 takes 30 ticks = 0.5 s (spec L89-L93).
- The gas numbers match: 1000/8 = 125 ticks ≈ 2.1 s for one axis; compressor 1/2/3 bars at 50/100/150 sixtieths a tick fill 1000 units in 1200/600/400 ticks = 20/10/6.7 s (spec L127-L137).
- heldAim, aimTurn and helmTurn exist as the spec describes, and the priority is A/D, then face, then aim, then held heading (step.ts:L92-L116).
- The helm module holds throttle and holdHeading as scalars, and the snapshot validates them positionally at helmAt and helmAt+1 (modules.ts:L59-L69; snapshot.ts:L149, L173-L178). New fields would need helmAt/interiorAt offsets updated.
- HeldInput has the optional face/aim/gunHeld fields, and the codec's held schema is strict (contracts.ts:L36; codec.ts:L151). The throttle command is in DuelCommand, duelWire and DUEL_KINDS (contracts.ts:L86; codec.ts:L121; step.ts:L32). Unknown kinds are rejected (step.ts:L272).
- authority/duelRules.ts has no 'throttle' or 'heading' match (grep), so naming it as a place to remove/add the command may be unnecessary, or it may handle kinds generically.
- flyShip is shared by stepDuel and predictPath (physics.ts:L28; predict.ts:L34). With stabilise 0, the skid capture runs but no cut is applied (physics.ts:L45), so CREW_FLIGHT's stabilise 0 works without code changes.
- ENGINE_FACTOR [1, 0.6, 0] scales both turn and thrust in flyShip (tuning.ts:L45; physics.ts:L33-L34, L52-L53), which matches spec L100 and L164-L165.
- The runtime's `steer` is only taken for the 'flight' seat (runtime.ts:L503), so the Helm's LMB steering needs a new source; spec L145 covers sending, but not that line.
- At the Helm seat, Q/E presses and Digit1/2 are unused today (runtime.ts:L419-L433; Digit1/2 are taken only on Weapons per contactController.ts:L65), so the new Helm keys don't collide with an existing Helm binding.
- Pew pew §3 keeps A/D turning for the manual torpedo at the Weapons seat, which doesn't conflict with this spec's Helm-only A/D change (pew-pew-weapons-design.md:L96-L98, L102).

## Not verified
- I read the spec from the working tree, not via `git show f5acc6b8`. HEAD d4ef7118 is a refine-brief commit, so the spec should be the same, but I didn't diff it.
- There's no ledger.md in the run dir (only round-1 attempt files), so this round has no prior IDs.
- Beyond the manifest, I read authority/core.ts, authority/checkpoint.ts, authority/duelCheckpoint.ts, sim/tactical/duel.ts, predict.ts, hunter.ts, scriptedPilot.ts and the grep results for throttle/holdHeading and predictPath, all to support findings 3, 4, 6, 7 and 8.
- I didn't check whether online held frames are sent every frame or only on change, so the exact size of a stale-frame error is estimated from the 250 ms watchdog.
- I didn't read the Valkyrn spec §4.4/§6.2 text itself. Its rules are inferred from the code comments at step.ts:L276-L278 and scriptedPilot.ts:L121.
- I didn't check whether the arrow keys and Q/E are in input.ts's PREVENT set (page scroll in the browser build), or whether HeldFlags/sample() can expose them without new fields.
- I didn't verify whether the Hunter's AI predicts the crew ship's path with drag (hunterThink internals weren't read).
- I didn't read runtime.ts L200-L240 in full; I only saw the sentAxes/throttle declarations through grep.

---

# Round 1 response (spec revised to rev after d4ef7118)

Reviewed `round-1.json` against the subject at `d4ef7118`. 12 accepted, 0 rejected, 0 deferred. Round 1 has no prior IDs. The spec was rewritten in one pass.

## R1-F1 [P1]: The continuous throttle is quantised to quarters, and any reverse becomes full reverse

Confirmed: physics.ts L32 rounds the thrust to quarters, and L53 makes any reverse full reverse. §3 now says `flyShip` rounds the axis to thousandths and clamps it to [−1, 1], and reverse is proportional to |q|. It defines `crewThrust`, and notes that whole axes and the Valkyrn's levels fly exactly as today. The sentence "the flight code is unchanged" is gone.

## R1-F2 [P1]: The spec never says which of §2-§5 apply to the Valkyrn

Confirmed: defs.ts L100-L101 has the Valkyrn classes in the crew slot, and step.ts L284-L286 has `helmHoldsUnattended`. The new §1 adds a `newtonianHelm` class flag, true only for the Cutter. The Valkyrn keeps `DEFAULT_FLIGHT`, the `throttle` command and its notches, A/D turning, aim-to-heading and its scripted pilot. The `throttle` command now stays and is `unavailable` for `newtonianHelm` classes.

## R1-F3 [P1]: 'Steering clears the held heading' reverses today's aim rule

Confirmed: step.ts L283 turns a held aim into the held heading. §4a keeps today's rule for every class, so on release the nose settles on the last aim, and there's no class gate. A test pins the Valkyrn's behaviour.

## R1-F4 [P1]: The code has no per-slot flight tuning

Confirmed: duel.ts L24 and L32, and predict.ts's defaults. §2 adds `flightFor(state, i)`, used by `stepDuel`/`flySlot` and as the default tuning for `predictPath` and `predictFlight`. The three callers are listed. `stepDuel`'s `tuning` argument stays as a test override.

## R1-F5 [P1]: The top speed cap's rule is not exact

Confirmed. §2 now gives the algorithm the reviewer proposed: thrust is capped at max(400, s0), then gravity and the edge are added uncapped. It runs only on the drag-0 path. The test now reads "never exceeds max(400, the speed before thrust)".

## R1-F6 [P1]: The boosted turn's dead band leaves out auto-face, and the boost rule depends on itself

Confirmed: hunter.ts L41-L48 and tuning.ts L125-L127. The rule changed instead of the bands: a tick is boosted only when the target is far, meaning |d| > 4 indices for an aim or held heading, or outside sin 5° for auto-face. That's decided before the step by one pure function, `helmBoost`. Inside the band, today's 1× bands finish the turn, so the boosted step never reaches them. The Hunter's turn functions are untouched. `defs.ts` asserts 2 × step < 4.

## R1-F7 [P1]: The authority's held-input lists and checkpoint schemas don't know the new fields

Confirmed: core.ts L329 and L435, and checkpoint.ts L40. §7 adds the fields to all three schemas, to the expiry check and to the pause clear. It states the 250 ms lost-release bound (105 per mille, 120 gas), and §8 tests it.

## R1-F8 [P1]: Removing the `throttle` command and A/D turning breaks consumers the spec doesn't list

Confirmed: onlineSource.ts L141-L155 and scene.ts L238, among others. §3, §4a, §6 and §7 now cover:
- the throttle base and prediction, online and local;
- `sitThrottle`;
- telemetry;
- the key actions and Shift+W;
- the controls list;
- the turn buttons, which become thruster buttons;
- the turn refusal;
- the predicted path;
- the UI probe.

The puffs now read an unhashed `d.helmVent` scratch, written by the sim each tick.

## R1-F9 [P2]: The stand-in budget of 4 doesn't match Engineering's start of 3

Confirmed: engineering spec L365. The §5 merge note now:
- marks the start split as an owner call at merge, recommending that Engines start at 4;
- says the engine factor reads the Engines bars and only the cap reads ENGINE;
- says SIM_VERSION goes to the spike that merges second, which covers pew pew too.

The losing-bars rule is now exact.

## R1-F10 [P2]: Gas rules contradict each other

Confirmed. §4 now:
- uses `rcsGas ≥ 8`;
- gives the exact accumulator steps;
- resets `rcsAcc` at a full tank;
- runs the compressor every running tick.

§7 lists the snapshot bounds.

## R1-F11 [P2]: Some acceptance tests can't be reached with the stand-in budget

Confirmed. `HELM_BARS` is now a `createDuel` option, and §8 states each test's setup: compressor 0 for the 1000 test, the start cap of 750, and HELM_BARS 3 with compressor 3 for ENGINE 0.

## R1-F12 [P2]: The scripted crew still turns with moveX

Confirmed: scripted.ts L321. §4a makes ignoring `moveX` turning for `newtonianHelm` classes an authority rule, and moves the scripted crew to `aim` or `face`.

## Also changed

- §3 renames the crew throttle to a new field `thrMille`, because the `throttle` level field stays for the Valkyrn.
- §7 gives the full step order, including the `helmVent` write.

## Files changed

- docs/superpowers/specs/2026-11-18-playtest2feedback-design.md

<!-- end -->

---

# Round 2 (delta, reviewing 576c38de, effort medium, 160 s, 857845 in / 781984 cached / 14107 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 The unattended crew Helm's rule assumes a flight branch the Hound layout doesn't have
§3 says that with no Helm attendant, the crew Helm's throttle returns to 0 and the ship coasts, and that 'a held heading still turns it'. §4 says the compressor runs unattended. But today an unattended Helm on a layout without helmHoldsUnattended (the Hound/Cutter) leaves crew.helm false, so stepDuel flies NO_AXES. The ship isn't turned by a held heading at all, and the per-mille ramp-down would never reach flyShip. The spec doesn't say whether a newtonianHelm class now sets crew.helm = true while unattended. It also doesn't say which axes that slot flies: the heading turn, the boost from helmBoost(d, NO_HELD), and crewThrust(thrMille) while it returns to 0. The two mirrors of the sim's rule aren't named either. · spec L140, L106-L107, L166; step.ts:L279-L287 (only `st.layout.helmHoldsUnattended === true` sets crew.helm and flies a heading turn and throttle; the comment says 'any other (the Hound's) flies zero axes as before'); tactical/duel.ts:L32 (`inputs[i]!.helm ? inputs[i]!.axes : NO_AXES`); situationModel.ts:L109 and runtime.ts:L322 (both return NO_AXES for an unattended non-Valkyrn Helm). · Implementer A keeps today's branch. A pilot who stands up then gets an instant cut of the main thrust and no held-heading turn, so the 'returns to 0 over 30 ticks' ramp is invisible. Implementer B adds a newtonianHelm unattended branch that thrusts down the ramp, turns onto the held heading and may spend boost gas. That gives different trajectories and goldens, and the drawn path and sentAxes disagree with whichever the sim does. · State the rule for an unattended crew Helm in §3 and §7's step order. Recommended: for a newtonianHelm class with no attendant, the step sets crew.helm = true and flies `{ turn: running && holdHeading >= 0 ? headingTurn(...) : 0, turnBoost: helmBoost(d, NO_HELD), thrust: crewThrust(thrMille), rcsX: 0, rcsY: 0 }`. Apply the same rule in situationModel.stateAxes (L109) and runtime.ts sentAxes (L322), and add an §8 test that a crew ship whose Helm stands at thrMille 1000 thrusts down the 30-tick return and turns onto its held heading. Otherwise, keep NO_AXES and delete 'A held heading still turns it' and the returning-thrust claim.

### [P2] R2-F2 HELM_BARS as a createDuel option, helmVent and helmPower aren't fitted to the module contract or the rematch
§5 and §8 take HELM_BARS 'from the duel's options (createDuel)', but createDuel takes positional arguments and has no options object. startRound rebuilds the next round with createDuel and passes only the layout, seed, helm player, crew and class, so a test's HELM_BARS reverts to 4 at the rematch. The spec calls HELM_BARS 'not state' and d.helmVent 'unsnapshotted', but tests/duelModules.test.ts fails on any DuelState member that isn't a field or listed in DUEL_NOT_SNAPSHOTTED. The helm module's `commands` (['throttle','heading']) and `reasons` lists must also gain helmPower and 'unavailable'. A test pins the full kind list. · spec L216, L300, L174-L175, L326, L121, L230-L231; state.ts:L84 (`createDuel(layout, seed, helmPlayer = 0, crew = DUEL_CREW_MIN, cls?)`); step.ts:L125 (startRound's createDuel call); modules.ts:L59-L65 (helm module commands/reasons), L92 (DUEL_NOT_SNAPSHOTTED); tests/duelModules.test.ts:L68-L70, L150-L151. · A subagent adding these will hit failing module-contract tests or guess a createDuel signature. A HELM_BARS that is lost on the rematch makes a round-2 test silently run at 4 bars. · Name the interface: a sixth createDuel parameter (or an `opts: { helmBars?: number }` object) stored as `d.helmBars`. startRound passes `d.helmBars` through. List `helmBars` and `helmVent` in DUEL_NOT_SNAPSHOTTED with their reasons. Add 'helmPower' to helmModule.commands and 'unavailable' to its reasons, and update the duelModules.test.ts L150 list. For the online authority and client, state that both use the default.

### [P3] R2-F3 The auto-face boost band isn't wider than the boosted step, and the settle test names the wrong function
§4a says 'far' is 'outside a band wider than the boosted step'. But sin 5° is 5 × 256/360 ≈ 3.556 index units, the same as the boosted step (2 × 1.778), and with headingAcc carried a boosted tick can step 4 whole indices. So a boosted auto-face can step up to about 0.44 index past the target. That lands inside AUTO_FACE_SIN's ±1.78 band, so the nose doesn't chatter, but the stated rule is wrong. §8's settle test checks '`aimTurn` returns 0 for 10 straight ticks' for the held heading and auto-face too, but those go through headingTurn and autoFaceTurn. · spec L197-L201, L357-L358; tuning.ts:L127 (AUTO_FACE_SIN = sin 2.5°); hunter.ts:L41-L46; step.ts:L112-L115. · It's a small inconsistency, but a subagent may write the test against aimTurn for every case, or 'fix' the band to match the text. · Use BOOST_FACE_SIN = sin 6° (≈4.27 indices > 4), or reword the rule to 'any overshoot stays inside AUTO_FACE_SIN'. Phrase the test as 'helmTurn returns 0 for 10 straight ticks'.

## Prior findings
- R1-F1: resolved — spec L113-L119: flyShip rounds to thousandths and reverse is proportional, with crewThrust defined. With |q| = 1, the product `…·|q|·f` is bit-identical to today's physics.ts L53, and quarters round-trip exactly through /1000.
- R1-F2: resolved — spec L56-L69 adds the newtonianHelm gate and the Valkyrn keep-list. The throttle command is kept for the Valkyrn only (L121).
- R1-F3: resolved — spec L183-L187 keeps step.ts L283 for every class. Only the moveX clear at L282 is gated, and there's a Valkyrn test (L359).
- R1-F4: resolved — spec L78-L86: flightFor is used by stepDuel and as predict.ts's default (a TS default parameter can read state and shipIndex). The callers are listed.
- R1-F5: resolved — spec L88-L96 gives the exact algorithm, only on the drag-0 path, and the test is reworded (L340).
- R1-F6: resolved — spec L190-L206: the 'far' rule is decided before the step by helmBoost. The aim and heading margin |d| > 4 can't overshoot (at most 4 whole steps from |d| ≥ 5). The auto-face band wording is a separate P3 above.
- R1-F7: resolved — spec L275-L285 adds the three schemas, the expiry check, the pause clear and the 105/120 bound (15 × 7 and 15 × 8), and §8 tests them. It matches core.ts L329 and L435.
- R1-F8: resolved — §3 L130-L138, §4a L207-L211, §6 L250-L271 and §7 L288-L289 cover the listed consumers. d.helmVent replaces the post-step sentAxes recompute.
- R1-F9: still open — (a)-(c) are fixed (spec L239-L246). But the losing-bars rule at L237-L238, `compressor = min(compressor, HELM_BARS, 3)`, now takes lost bars from ENGINE first. At 4 bars with compressor 1, losing one gives compressor 1 and ENGINE 2, a 50 % cap. That reverses the earlier 'bars come off COMPRESSOR first' and the round-1 fix asked for (compressor drops while > 0). Either write `compressor = max(0, min(3, compressor − lost, HELM_BARS))` or mark ENGINE-first as an owner decision.
- R1-F10: resolved — spec L156-L167 and L294-L298: gas ≥ 8, the exact accumulator, the reset at full and the unattended compressor are all stated, along with the bounds. The refill arithmetic checks: 60000/50 = 1200 ticks, 600 and 400.
- R1-F11: resolved — The test setups are stated at spec L326-L334, with the 750 start cap and ENGINE 0 via HELM_BARS 3 / compressor 3. The missing createDuel option interface is raised as a new P2.
- R1-F12: resolved — spec L186-L189: the sim ignores moveX turning for newtonianHelm classes (an authority rule), the scripted crew moves to aim or face, and §8 L355 tests it.

## Verified
- physics.ts:L32 and L53: the whole-axis bit-identity claim (spec L117-L118) holds, since x·1 is exact and quarters are exact in /1000.
- The admission order fits the existing pattern: step.ts L262-L268 checks stale-tick, then invalid-seat, then unavailable.
- core.ts L329 and L435 are the expiry and pause lists the spec names (spec L281-L282).
- predict.ts:L23 and L29: predictPath and predictFlight take (state, shipIndex), so `flightFor(state, shipIndex)` works as a default (spec L84).
- situationModel.ts:L116 is a predictFlight caller for CREW_SLOT, as spec L86 says.
- runtime.ts:L238: isConsoleCommand exists, as spec L289 says.
- tactical/duel.ts:L24 and L32: one tuning per call, so the override-only semantics (spec L82-L83) are a clean change.
- The arithmetic in spec L108, L110, L167, L171 and L283-L284 checks: ceil(1000/7) = 143, ceil(1000/34) = 30, 1000/8 = 125, 15×7 = 105, 15×8 = 120.
- AUTO_FACE_SIN (tuning.ts:L127) is sin 2.5°, about 1.78 indices, so a boosted overshoot of at most 0.44 index stays inside it.

## Not verified
- Whether Digit1 and Digit2 (input.ts:L20 WEAPON_CODES) are seat-gated so they don't clash with §5's 1/2 helmPower keys. §5's key text is unchanged since round 1, so I didn't pursue it.
- Whether Q/E as thruster keys clash with existing seat or interact bindings (the §4 key list is unchanged).
- authority/checkpoint.ts L40 and duelCheckpoint.ts L73: I didn't re-read them this round and relied on round 1's citations.
- Whether the Hunter and the dev flight view only ever pass whole thrust axes (spec L117): I relied on round 1's statement.

---

# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `576c38de`. 3 accepted, 0 rejected, 0 deferred, plus R1-F9 reopened and fixed again. The reviewer confirmed R1-F1 to R1-F8 and R1-F10 to R1-F12 as resolved.

## R1-F9 [P2]: The stand-in budget of 4 doesn't match Engineering's start of 3 (reopened)

Confirmed: `min(compressor, HELM_BARS, 3)` takes lost bars from ENGINE first. §5 now reads `max(0, min(3, compressor − lost, HELM_BARS))`, so bars come off COMPRESSOR first, as round 1's fix intended.

## R2-F1 [P1]: The unattended crew Helm's rule assumes a flight branch the Hound layout doesn't have

Confirmed: step.ts L279-L287 sets `crew.helm` only for `helmHoldsUnattended`, and duel.ts L32 flies NO_AXES otherwise. §3 now states the rule for a `newtonianHelm` class with no attendant: `crew.helm = true`, the held-heading turn, `helmBoost(d, NO_HELD)`, `crewThrust(thrMille)` and no thrusters. It's mirrored in `situationModel.stateAxes` and `runtime.ts`'s `sentAxes`. §7's step order references it, and §8 tests the 30-tick return.

## R2-F2 [P2]: HELM_BARS, helmVent and helmPower aren't fitted to the module contract or the rematch

Confirmed: state.ts L84 has positional parameters only, and modules.ts L59-L65 has the commands and reasons. Changes:
- §5 adds `createDuel`'s sixth parameter, `opts: { helmBars }`, stored as `d.helmBars` and passed on by `startRound`;
- §7 adds the module contract: `DUEL_NOT_SNAPSHOTTED` entries for `helmBars` and `helmVent`, `helmPower` in `commands`, `unavailable` in `reasons`, and the `duelModules.test.ts` update.

## R2-F3 [P3]: The auto-face boost band isn't wider than the boosted step

Confirmed: sin 5° is about 3.56 indices, which isn't more than a 4-index step. `BOOST_FACE_SIN` is now sin 6° (about 4.27 indices), and the settle test names `helmTurn`.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-playtest2feedback-design.md

<!-- end -->

---

# Round 3 (delta, reviewing 5d95232c, effort medium, 54 s, 176794 in / 139430 cached / 4635 out)

Verdict: ready

## Findings

### [P3] R3-F1 §8 says tests set compressor through createDuel options, but the named opts object only carries helmBars, and a snapshot restore drops helmBars
§5 now defines the option as `opts: { helmBars?: number }` only. §8's lead-in still says the tests 'set HELM_BARS and compressor through createDuel options', so the two texts disagree on where a test's starting compressor comes from. Several tests depend on that start: 'compressor 0 (cap 1000)', 'HELM_BARS 3 with compressor 3', and the new unattended test, which needs thrMille 1000 and so needs compressor 0. Separately, snapshot.ts rebuilds the duel with a five-argument createDuel. A restored duel therefore always gets helmBars 4, which is consistent with 'online uses the default' but isn't stated. · spec L225-L227 (opts: { helmBars?: number }); spec L342 ('set HELM_BARS and compressor through createDuel options'); spec L345, L350, L375; src/renderer/src/sim/duel/snapshot.ts:L203 (createDuel(layout, seed, 0, playerCount, crewClass)); state.ts:L84 · A subagent will either add `compressor` to opts (an interface §5 doesn't define) or guess at a field write or helmPower commands. A round-trip test on a helmBars-3 duel would silently restore at 4. · Reword L342: tests set `helmBars` through createDuel's opts and reach a compressor value by writing `d.compressor` after creation, or by sending helmPower. Add to §5 or §7 that a snapshot restore (snapshot.ts L203) uses the default helmBars, like the online authority.

## Prior findings
- R1-F9: resolved — §5 L248-L249 now uses max(0, min(3, compressor − lost, HELM_BARS)). Checked: from 4 bars with compressor 1, losing 2 gives compressor 0 and ENGINE 2, so bars come off COMPRESSOR first, then ENGINE. From compressor 3, losing 1 gives compressor 2 and ENGINE stays 1. Merge note (a)-(c) at L250-L257 covers the start split as an owner call, the engine factor reading Engines effective bars, and SIM_VERSION going to whichever spike merges second.
- R2-F1: resolved — §3 L140-L148 states the unattended newtonianHelm rule: crew.helm = true, the heading turn, helmBoost(d, NO_HELD), crewThrust(thrMille), and rcs 0. It mirrors the existing helmHoldsUnattended branch (step.ts L284-L286). §7 step 2 (L318-L319) references it, and the §8 test is at L375-L376. crew.helm is read only by duel.ts L32 for flight, so setting it unattended has no other side effects. thrust comes after the step-3 ramp, which matches step 7.
- R2-F2: resolved — §5 L225-L227 names the sixth parameter, its storage as d.helmBars and the pass-through in startRound (step.ts L125). §7 L311-L315 adds DUEL_NOT_SNAPSHOTTED entries for helmBars and helmVent (modules.ts L92 shape), helmPower in commands, unavailable in reasons (modules.ts L63-L64) and the test-list update. A leftover inconsistency at L342 and the snapshot restore are raised as a new P3.
- R2-F3: resolved — BOOST_FACE_SIN is sin 6°, which is 6×256/360 ≈ 4.27 indices, more than the 4 whole indices a boosted tick can step (2 × 1.778 plus the accumulator). The settle test at L373-L374 now names helmTurn (step.ts L109).

## Verified
- The unattended rule matches today's helmHoldsUnattended branch (step.ts L284-L286), and crew.helm is read only by tactical/duel.ts L32
- helmTurn (step.ts L109-L116) orders moveX, then face, then aim, then held heading. With NO_HELD it falls through to headingTurn, so helmBoost(d, NO_HELD) checks the held heading's band
- createDuel is positional with five parameters (state.ts L84). startRound (step.ts L125), runtime.ts L251, duelRules.ts L31 and snapshot.ts L203 are its callers
- helmModule commands and reasons (modules.ts L63-L64) and DUEL_NOT_SNAPSHOTTED (modules.ts L92-L99) have the shape §7 assumes
- Arithmetic for the losing-bars formula and for sin 6° in heading indices

## Not verified
- Line ranges of situationModel.stateAxes L106-L110 and runtime.ts sentAxes L321-L322: not re-read, because they were already cited by R2-F1's evidence
- tests/duelModules.test.ts's pinned lists: not re-read, because the spec only says to update them

---

# Round 3 response (spec revised)

Reviewed `round-3.json` against the subject at `5d95232c`. Verdict ready. 1 accepted (P3), 0 rejected, 0 deferred. The reviewer confirmed R1-F9 and R2-F1 to R2-F3 as resolved.

## R3-F1 [P3]: §8 says tests set compressor through createDuel options

Confirmed: §5's `opts` carries only `helmBars`, and snapshot.ts L203 calls a five-argument `createDuel`.
- §8's lead-in now says tests set `helmBars` through `opts`, and reach a compressor value by writing `d.compressor` or sending `helmPower`.
- §5 states that a snapshot restore uses the default `helmBars`, like the online authority.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-playtest2feedback-design.md

<!-- end -->

---

