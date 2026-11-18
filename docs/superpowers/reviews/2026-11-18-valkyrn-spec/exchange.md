# Codex review exchange: valkyrn-spec

Subject: `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 3f25b080, effort high, 310 s, 1125740 in / 1042429 cached / 29206 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Out-of-seat 'holds its throttle and last aim heading' contradicts the sim: an unattended Helm flies nothing
The spec says that while the pilot is out of the seat, the ship holds its throttle and last aim heading, 'as solo Tab already keeps a seated character's settings'. In the code, standing up empties the Helm, and an empty Helm gets zero axes. The throttle and holdHeading values are kept, but they are not flown. Solo Tab on the Hound only works because the other character stays seated and present. The Valkyrn has no other character. · spec L86-87, L125-126 ('when the pilot stands up the ship keeps the last bearing'); step.ts:L188-189 (`crew.axes = {turn:0, thrust:0}` by default), step.ts:L254-258 (axes set only `if (helm >= 0)`); weapons.ts:L12 ('Turn and thrust, read only while `helm`'); runtime.ts:L266-267, L273-277 (solo Tab keeps the other character seated and present); runtime.ts:L306 (`sentAxes = NO_AXES` when the Helm is unattended). · Two implementers will build this differently. One reads it as 'the value persists for when you sit back down', which is today's behaviour, and the ship coasts. The other reads it as 'an autopilot keeps thrusting and turning while you repair'. The second needs a new sim rule. If that rule is applied generally, it changes the Hound, where a Helm player who stands up stops the thrust today. If it is gated on crew size, it is the kind of ship-specific branch §3 forbids. In ordinary solo play every aft repair run hits this case. · Choose one and state it. (a) Coast: an unattended Flight seat gives zero turn and zero thrust, as on the Hound. The throttle and holdHeading values persist and apply again on sit-down. Remove 'as solo Tab already keeps'. (b) Autopilot: add a general rule keyed on a layout or class field (for example `helmHoldsUnattended`), with its own tests. State that the Hound's value is false, so its goldens and duelGates do not change.

### [P1] R1-F2 No mechanism picks the Valkyrn class or records the laser switch; tactical state hard-codes DUEL_CLASSES
The spec says the ship class is data, and that the developer switch is 'recorded in the duel's start data'. Today createTacticalState always fills slot 0 with DUEL_CLASSES[0], the Cutter class. createDuel takes only (layout, seed, helmPlayer). startRound rebuilds every round through createDuel with those same arguments. Nothing links a layout to a class, and no 'start data' structure is named that carries a class or a switch. · spec L29-31, L107, L177-179; defs.ts:L73-76 (`SHIP_CLASSES`, `DUEL_CLASSES = [Cutter, Hunter]`); state.ts (tactical):L193, L202 (`systemsFor(DUEL_CLASSES[0]!, 1, true)`); duel/state.ts:L69, L71; step.ts:L105-106 (`startRound` → `createDuel(d.interior.layout, followingSeed(...), d.helmPlayer)`); Sci-2 spec L33, L39, L44 (DuelInit and snapshot header fields; none for class). · Without a defined path, implementers will diverge. One adds a layout field, another a createDuel parameter, another a global setting read at runtime. The last breaks replay. The switch must also survive rematches and snapshot loads. loadDuelSnapshot calls createDuel and would rebuild the Cutter class. · Name it explicitly. Either add a layout field `shipClass: 'valkyrn'` resolved through SHIP_CLASSES, or add a `createDuel(..., opts: { cls: number })` parameter. Add the laser switch as an explicit class choice, either a third class `valkyrn-laser` or `opts.fitLaser`. Carry it through startRound and the snapshot header or DuelInit, with loadDuelSnapshot passing it back to createDuel. State whether systems.0.cls in the hash is enough to restore it, and add a test that a rematch and a snapshot round trip keep the switch.

### [P1] R1-F3 ShipClassDef requires a laser slot, and every laser path reads it unconditionally; the gun-fitted Valkyrn's laser state and commands are unspecified
`slots` is typed `{ laser: LaserDef; missile: MissileDef }`. systemsFor, laserFull, tickWeapons, laserEligible and auto-fire all read `slots.laser` without checking it exists. The crew starts with a full laser targeted at Shields (the Feel-i opener). The spec says 'the card row follows the class's slots' but does not say: whether `laser` becomes optional; what the laser counters hold on a gun Valkyrn; or what laserLock, laserCharge and laserFrequency answer there. It also does not say what Science's weak-frequency result does with no laser, even though Science is a parity feature. · spec L115, L139, L175-176, L23 (parity: Science); defs.ts:L42-43 (`slots` with a required laser), L62-68; tactical state.ts:L152-156 (`laserCharge: crew ? c.slots.laser.chargeUnits`, `laserTargeted: crew`); weapons.ts:L35, L70, L140 (auto-fire), L150-156; step.ts:L195-197, L224-230 (laserFrequency admitted from the gunner). · If laser becomes optional, these paths crash. If they keep a dummy laser, a hidden laser auto-fires at the Hunter, which is wrong. Two implementers will differ, and the reject reasons the runtime and refusal flashes rely on are left undefined. · Change the type to `slots: { laser: LaserDef | null; gun: GunDef | null; missile: MissileDef }`. With laser null: laserCharge stays 0, laserTargeted is false, and charge, lock, auto-fire and burst are skipped. laserLock, laserCharge and laserFrequency answer one named reason, for example 'unavailable', and refusal flashes read it. Say what the weak frequency means on the gun Valkyrn: either nothing, with a parity-note exception, or it multiplies gunWear. Add a test that the gun Valkyrn never emits a `laser` event.

### [P1] R1-F4 Crew of one is outside Sci-2's validated range, and 'the layout's crew' does not exist
Sci-2 makes createDuel throw for a crew outside 2..4. It also makes the snapshot header's playerCount 2..4 and DuelInit.playerCount `2 | 3 | 4`. It explicitly leaves 'single-player crew sizes other than two' out of scope. The Valkyrn spec says only that it 'extends the sim's loops to n = 1'. §5 relaxes the nav/weapons check with 'or the layout's crew is 1', but the layout schema has no crew field. Separately, §4.4 calls the count `playerCount`, which is a duel parameter. The runtime's solo logic is also two-character: the first-tick `presence false` for player 1, `active: 0|1`, `held = [NEUTRAL, NEUTRAL]`, and stayPresent(other). · spec L81-85, L94-95; Sci-2 spec L27 (throws outside 2..4), L37 (header 2..4), L44 (`2 | 3 | 4`), L14 decision 4, L123; duel/state.ts:L74, L81; schema.ts has no crew or playerCount field (grep: no match); runtime.ts:L244, L273, L275-276, L295-296. · As written, createDuel(valkyrn, seed, 0, 1) throws, and a crew-1 snapshot or checkpoint fails validation. One implementer adds a layout field and another derives the crew from the picker. Without a named list of the runtime's sites, the n = 1 runtime will send a presence command for a player who does not exist. · Add a layout field (for example `crew: 1`) or state that the crew comes only from createDuel's `crew` argument. Then rewrite the §5 check against that one source. List the widened validations: createDuel 1..4; snapshot header 1..4; DuelInit 1 | 2 | 3 | 4, or local-only; the codec stays at 4. List the runtime sites: no first-tick presence at n = 1, no `other`, `held` of length n, and a readout crew list with no rows at n = 1. Add tests at n = 1 for createDuel, the snapshot round trip, and the downed-loses rule.

### [P1] R1-F5 Auto-face's dead band was sized for 150°/s; at the Valkyrn's 200°/s the 'never chatters' claim fails, and the band is wider than the Hunter at range
AUTO_FACE_SIN is sin 2.5°, chosen as one tick's turn at 150°/s. At 200°/s a tick turns about 3.33° (2.37 heading steps, so 2 or 3 integer steps of 1.41°). A 3-step jump is 4.2°, wider than the ±2.5° band (5°, about 3.5 steps), so the nose can step across the band and oscillate. Also, the nose stops up to 2.5° off the cursor. That is 26 u lateral at the gun's 600 u reach, more than the Hunter's 20 u radius. A pilot who puts the crosshair on the pip can still miss at long range. · spec L113 (turn 200°/s), L124-125 ('with auto-face's dead band, so it never chatters'), L136 (about 600 u reach); tuning.ts:L125-127 (the band comment ties it to one tick at 150°/s), L55-56 (TURN_STEPS_PER_TICK = deg/360 × 256 × DT); hunter.ts:L37-48 (headingTurn uses faceTurn with AUTO_FACE_SIN). · Chatter breaks the fighter feel the owner asked for. The gate and screenshots would show the nose jittering on the pip. A dead band wider than the target at range makes the minigun's core skill unreliable, and it also skews the §10 tuning gate. · Derive the band from the class: `faceSin = sin(turnStepsPerTick × 360/256 / 2 + margin)`, or step turns proportionally inside a few headings. Alternatively, keep the turn rate at or below 150°/s. Add a test that aim on a fixed bearing settles with no sign flip for 60 ticks at the Valkyrn's turn rate. Add another that the settled nose is within the Hunter's angular radius at 600 u, or note that long-range misses are intended.

### [P1] R1-F6 Gun fire does not end the Hunter's grace hold: hostility reads only laser shots and missile launches
Sci-1's hostility rule turns the enemy hostile on the crew's first `shots` (laser releases) or `missilesLaunched`, or on the 30 s clock. The spec puts gun fire in separate `gunShots` and `gunHits` counters and does not add the gun to this rule or to the `hostile` event's cause union. So a Valkyrn could strip shields and damage the Hunter during the hold without provoking it. · spec L156-157 (gunShots and gunHits telemetry); science.ts:L30-39 (`crew.shots === 0 && crew.missilesLaunched === 0`, causes 'laser' | 'missile' | 'clock'); tactical state.ts:L106-107 (the `hostile` cause union). · This is hit in the first 30 s of every Valkyrn round. It breaks the Sci-1 opening rule, which is a parity feature, and it also skews the §10 gate's round lengths. · State that the crew's first gun round turns the enemy hostile. Add `gunShots` to ShipSystems (hashed). Extend the rule to `crew.shots + crew.gunShots`, add cause 'gun' (order: laser, gun, missile, clock), and add a test.

### [P1] R1-F7 Flight-seat input map collides with existing Helm and Weapons bindings
§5 says the Flight view 'is the Helm map' with every Helm feature. But Feel-ii binds right-click and right-drag on the Helm map to click-to-heading, and right-click on the own ship to clear it. The spec binds right mouse to the torpedo. Space is the Helm's held auto-face, and on the Weapons console it is the laser press, which matters with the developer laser switch. The spec does not say whether the `heading` command, its HDG readout and its marker exist on the Flight seat, given that `aim` overwrites holdHeading every tick. · spec L19-20, L98-101, L172-176, L185; feel-ii spec L9-11, L62-67 (right button sets the heading; 'R-CLICK MAP' readout); contracts.ts:L32-34 (`face`: Space held at the Helm); runtime.ts:L278-279 (Space is a single laser press on Weapons); step.ts:L213-220 (heading command). · Two implementers will resolve the conflicts differently, and the sit-down card and controls list will not match behaviour. A right click could both launch a torpedo and set a heading in the same frame. · Add a Flight-seat binding table. Left mouse: gun. Right mouse: torpedo, and no click-to-heading or right-drag pan, so `heading` is never sent from the Flight seat. Space: auto-face. With the laser switch on, the laser key is 1 or F, not Space. Q/E: torpedo room. Wheel: throttle presets. Middle-click and G: ping. Tab: console or ship view. Drop the HDG/heading marker from the Flight view, or redefine it as the aim bearing.

### [P1] R1-F8 The no-id-literal grep fails on today's code, and the Helm map would draw the Hound silhouette for the Valkyrn
The grep gate says no layout or class id literals 'outside the data files and the asset tables'. Today's code already contains several. `hullFor(crew)` returns 'hound' for any crew ship, so the tactical map draws the Hound hull. hudModel compares `!== 'cutter'`. fleet.ts hard-codes `shipForCrew → 'hound'`. duel.ts finds the enemy by `ai === 'hunter'`, and 'hunter' is also a class id. `DUEL_REPAIR_POINTS` and `BATTLEMAPS` are keyed by id. The spec names none of these sites, and it does not mention a Valkyrn map silhouette. · spec L32-34, L190, L58; hullModel.ts:L5, L44 (`return crew ? 'hound' : 'scout'`); hudModel.ts:L345 (`!== 'cutter'`); fleet.ts:L3-4; tactical/duel.ts:L15 (`ai === 'hunter'`); defs.ts:L70-71; duel/tuning.ts:L24; battlemapModel.ts:L10-12. · As written, the gate is red on day one, or each implementer chooses their own exemption list, which makes it untestable. The silhouette leak breaks the 'ships differ only in data' rule visibly: the Valkyrn would fly with a Hound outline on the Helm and enemy maps. · Define the grep precisely: the pattern (quoted ids from SHIP_CLASSES and the layout ids), the allowed files (`sim/ship/*.json`, `sim/tactical/defs.ts`, `sim/duel/tuning.ts`, `render/battlemapModel.ts`, `render/tactical/hullModel.ts` tables), and that `ai` profile values are not class ids. Either rename the 'hunter' ai profile or exclude `ai ===` matches. List the sites to fix: hullFor takes a hull id from the layout or class, so the Valkyrn gets its own silhouette (state where the silhouette comes from), and hudModel L345 and fleet.ts read the picker choice.

### [P2] R1-F9 Gun state fields, their owners and reset rules are not pinned
The spec does not say where the heat counter and the lockout flag live; ShipSystems is the obvious place. It also leaves open whether: gunWear, gunHull and gunRoomWear reset on a round start (systemsFor); gunRoomWear resets when the Hunter repairs that Room; gunWear resets when a laser or missile strips a layer; gunRoomWear keeps counting at level 2. 'The oldest round is reused' has no tie rule. It also does not say that gunShots and gunHits are hashed ShipSystems counters, or that a free pool entry holds zeros, which the validator enforces for missiles. · spec L140-157, L194; tactical state.ts:L37-61 (ShipSystems), L152-163 (systemsFor/emptySystems); hash.ts:L22 (the list of hashed system keys), L46-53 (free missile entries must hold zeros); weapons.ts:L85-93 (laser strip resets shieldClock). · These choices change behaviour and hash layout. Two plans would produce different Valkyrn goldens and different kill times. · Add a field table: `systems[i].gunHeat`, `gunLocked`, `gunWear`, `gunHull`, `gunRoomWear[3]`, `gunShots`, `gunHits`, `gunMuzzle`; `tactical.rounds[64]` in the space module, free entries zero. Give reset rules: all zero in systemsFor. A Room repaired one level zeroes that Room's wear. Any shield strip zeroes gunWear. Wear at level 2 still counts hull only. Overflow reuses the highest-age active round, lowest index on ties. List the new hash and validator bounds.

### [P2] R1-F10 'Room by where it lands' is set mostly by approach bearing, not aim; thirds and the impact point are undefined
The spec does not define the impact point. Taking it as the first point where the swept segment meets the circle, it lies on the near hemisphere. From ahead its nose-axis projection is ≥ 0 (and stays above r/3 unless the lateral offset exceeds about 0.94 r), so the aft third (Engines) cannot be hit from the front, and from behind Weapons cannot be hit. The thirds' boundaries (±r/3) and their tie-breaking are not stated. · spec L152-155 ('aiming at a part of the ship is a skill'); defs.ts:L64 (radius 20 for both classes). · The stated design intent (aim at a part) does not match the geometry, and two implementers will pick different points (segment entry, closest approach, centre offset) and boundaries. · Either accept that the Room depends on approach and say so, or use the closest-approach point of the round's line to the enemy centre (or the entry point), projected on the nose axis with thirds at ±r/3 (ties go to Shields). Give the exact formula and add tests from the front, side and rear.

### [P2] R1-F11 Gun step order, muzzle spawn point and the lead-pip fly-out test are underspecified (gravity and drag)
The spec does not say where in stepDuel the gun fires and its rounds move: before or after the ships move, which Hunter position the swept test uses, or whether a round moves on its spawn tick. The muzzles have a lateral offset (12 u) but no forward offset, so they would spawn inside the own ship's 20 u circle. The pip test fires at a 'coasting' Hunter, but ships feel softened gravity and drag, so coasting is not constant velocity. · spec L135-137, L146-149, L163-165, L195-196; weapons.ts:L117-121 (weapons apply 'before anything moves'); physics.ts:L10, L50 (gravity in flight; `tuning.gravity` flag). · Different phase orders give different hit ticks and Valkyrn goldens. The 'within 1 tick' pip test could fail for physics reasons rather than a pip bug. · Pin the order. For example: the gun fires in applyWeaponsInput, spawning at the nose (forward = radius + 1, lateral ±12) from the pre-move pose; rounds move after flySlot and are swept against the Hunter's post-move circle. State that the pip test runs with `gravity: false` and no drag, or far from the planet with a tolerance in units.

### [P2] R1-F12 `gunHeld` and `aim` wire details: gunHeld's codec and replay entry, aim validation, and same-tick order with A/D
Only `aim` is said to ride the codec, checkpoints and replay; `gunHeld` is referred to as a held input but not added to HeldInput, the codec or the replay schemas. There is no rule for an invalid aim (NaN, 256, non-integer). Line 257 clears holdHeading on A/D or Space, and §6.2 says a non-−1 aim sets it, but the spec does not say which wins in a tick where both happen. · spec L122-130, L138; contracts.ts:L34 (HeldInput has no gunHeld or aim); step.ts:L254-258 (clears holdHeading after taking the axes). · Malformed held values must not change state, and the set-versus-clear order changes hashed holdHeading. · Add `gunHeld?: boolean` and `aim?: number` to HeldInput, both absent by default and both in the codec, checkpoint and replay. An aim that is not −1 or an integer 0..255 counts as −1. Order: A/D or Space clear holdHeading first, and aim is applied only when neither is held. Add tests.

## Verified
- Sitting at a console group seats the player at every member: sitDown sets occupant[j] = pid for all group stations (stations.ts:L31-36), standUp clears them all (stations.ts:L55-65), and sit admission checks every member (commands.ts:L55-59). So attendant(d, d.nav) and attendant(d, d.weapons) both return the pilot (step.ts:L49-52, L188), and the throttle, heading, laser/torpedo admission, laserFrequency and scanStation checks (step.ts:L194, L206, L216, L227, L54-57) all hold for the Flight seat. Only the createDuel group check (duel/state.ts:L80-81) needs relaxing, as spec L94-95 says.
- The roleConsole sit filter accepts d.nav or d.weapons, so a sit on the combined seat is admitted (step.ts:L168-169).
- The Hound's repair points are Weapons in O, Shields in R and Engines in E (duel/tuning.ts:L18-22), matching spec L72-73. Airlocks: two, in H and L (hound.json:L221-230). Science/Engineering/Doors share one console group on tile [9,5] (hound.json:L178-195, L209-214).
- Hound numbers in the spec's table: hull 40 (tuning.ts:L39), turn 150°/s (L55), thrust 120 (L57), radius 20 (L38), torpedo range 360 (L104).
- Heat arithmetic: 10 rounds/s = 6 ticks at 60 Hz. 50/6 − 4 ≈ 4.33/tick net, so 1000/4.33 ≈ 231 ticks ≈ 3.85 s. Locked: 1000/8 = 125 ticks ≈ 2.08 s. At level 1, halving gives integer coolings of 2 and 4. Reach: 700 × 52/60 ≈ 607 u ('about 600'). Pool 64 against at most ceil(52/6) = 9 live rounds per gun.
- flyShip reads thrust and turnStepsPerTick from the class (physics.ts:L32-34, L52-53, L63), so a Valkyrn class with its own flight numbers needs no physics change.
- battlemapLayer data is keyed by layout id in an asset table (battlemapModel.ts:L10-18), consistent with spec L76-77's 'from the layout's asset name'.

## Not verified
- I read beyond the manifest to check specific findings: hunter.ts (headingTurn/faceTurn), physics.ts (gravity), stations.ts and commands.ts (console-group seating), science.ts (hostility), hash.ts (grep for module fields), the Feel-ii spec (grep for its bindings), schema.ts (grep for a crew field), and greps for id literals in hullModel.ts, hudModel.ts, fleet.ts and tactical/duel.ts.
- Whether createSimState accepts playerCount 1 and a layout with fewer spawns: not read.
- Snapshot and checkpoint code (sim/duel/snapshot.ts, duelCheckpoint.ts): I relied on the Sci-2 spec's description, since Sci-2 is not merged into this code.
- Whether the duel runtime's Tab inside a console group (groups.tab) conflicts with 'Tab toggles the console and the ship view' on a combined Flight group: not checked.
- scripted.ts and the duelGates harness, for how a scripted Valkyrn pilot would be built, and the duelGates seed count.
- The art import pipeline's support for `rotate: 90` and the docs/gates.md licence line.
- How the online view derives laser events from counters: not read, so the 'events derived from counters' rule for gunHit (spec L156-157) is unchecked; it is single-player only, so low risk.

---

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

---

# Round 2 (delta, reviewing 9cd401f6, effort medium, 139 s, 694787 in / 633447 cached / 11760 out)

Verdict: changes requested

## Findings

### [P2] R2-F1 New positional signatures collide with existing ones: createTacticalState's second argument is already `slots`, and createDuel(layout, seed, opts) drops Sci-2's helmPlayer/crew arguments without saying where they go
§6.1 writes `createTacticalState(seed, crewClass)`, but today's second parameter is the slot count, and tests call it with 3. §4.4 writes `createDuel(layout, seed, opts)` with `opts.crew` and `opts.cls`. Sci-2 fixes that signature as `createDuel(layout, seed, helmPlayer = 0, crew = 2)`, and its loadDuelSnapshot calls `createDuel(layout, seed, 0, n)`. The spec does not say whether helmPlayer moves into opts or whether opts is a fifth argument. · spec L105, L182-185; state.ts (tactical):L193 `createTacticalState(seed: number, slots = DUEL_CLASSES.length)`; tests/tacticalSlots.test.ts:L65 `createTacticalState(seed, 3)`, tests/duelModules.test.ts:L59, L122, tests/tacticalModel.test.ts:L244; Sci-2 spec L27, L39; step.ts:L106 (startRound passes helmPlayer positionally) · Both arguments are numbers, so a literal reading type-checks. `createTacticalState(1, 3)` would silently mean class 3, which is valkyrnLaser once the classes are appended, instead of three slots. Two implementers will pick different signatures for createDuel, and its call sites are startRound, loadDuelSnapshot and the runtime. · Pin both signatures. For example, `createTacticalState(seed, slots = 2, crewClass = ShipClass.Cutter)`. Then `createDuel(layout, seed, opts: { helmPlayer?: number; crew?: number; cls?: number } = {})`, replacing Sci-2's positional helmPlayer and crew, with startRound and loadDuelSnapshot updated to pass opts. Or keep Sci-2's positionals and add `cls` as a fifth argument.

## Prior findings
- R1-F1: resolved — §3.1 adds helmHoldsUnattended, and §4.4 L115-119 gives the rule: throttleThrust(d.throttle), plus headingTurn toward holdHeading when it is ≥ 0. Both functions exist (step.ts:L13, L22; throttle.ts:L20). The Hound keeps zero axes, because step.ts:L254-258 only sets axes when the Helm is attended.
- R1-F2: resolved — §6.1 L182-185 sets the path: DuelState.crewClass comes from opts.cls, else the layout's shipClass, else Cutter. startRound, the snapshot header and loadDuelSnapshot carry it. §3.1 adds shipClass. §8 L268-270 sets the switch through opts.cls = valkyrnLaser. One thing for the plan: the validator at snapshot.ts:L136-137 compares systems.i.cls with DUEL_CLASSES and must be rewritten to use crewClass. §6.1 says it is validated, which covers this.
- R1-F3: still open — The sim paths are covered (spec L177-181), but making laser nullable breaks code the spec does not name. (1) The hash validator computes bounds with `most(c => c.slots.laser.chargeUnits)`, `.shots` and `.burstGapTicks` over every SHIP_CLASSES entry (hash.ts:L186, L195-196). Once valkyrn is appended with laser null, these throw for every snapshot and checkpoint, including the Hound's, and §7.3 lists only the new gun bounds. (2) The view and telemetry models read the crew's laser unconditionally. consoleModel.ts:L90 reads `classOf(t, 0).slots.laser.shots` and situationModel.ts:L41 reads `classOf(t, CREW_SLOT).slots.laser`; both are crew slot 0, so the Flight console would crash. hitModel.ts:L29 reads `classOf(state, ship).slots.laser.chargeUnits` and telemetry.ts:L104 reads `classOf(tac, e.ship).slots.laser.shots`. Fix: state that the validator bounds take the maximum over classes whose laser is not null, and that each site above guards `laser === null`: no laser burst or range row, and no laser readout. Add a test that a Hound snapshot still validates with the Valkyrn classes present, and that the Flight console model builds for the gun Valkyrn.
- R1-F4: resolved — §3.1 adds a crew field, and §4.4 L105-114 makes opts.crew the single source, lists the widened validations (local 1..4, online 2..4, codec 4) and lists the runtime sites at n = 1. §5 L133 checks against the crew, and the tests are at L282-284. The signature question is raised as a new P2.
- R1-F5: resolved — physics.ts:L34-36 confirms that heading is an integer index with a fractional accumulator, so a tick moves the nose 2 or 3 indices at 2.37 steps per tick. With the band |d| ≤ 1, a 3-step from d = 2 lands on d = −1, inside the band, so the nose cannot cross it. The out-of-seat path uses headingTurn's AUTO_FACE_SIN band (about 1.78 indices on each side, so about 3.6 wide), which is also wider than a 3-step. Assuming turnStepsPerTick < 3 is sound for ShipClassDef; missiles are a separate MissileDef.
- R1-F6: resolved — §7.2 L237-238 extends the rule to shots + gunShots and adds the cause 'gun' with a precedence order. This matches science.ts:L37-39. The test is at L293-294.
- R1-F7: resolved — The §5.1 table (L144-159) assigns every input. The right button is the torpedo, there is no click-to-heading, the Flight seat never sends `heading`, and there is no HDG marker. Space is auto-face, and the laser fit's laser auto-fires, so it does not need Space.
- R1-F8: resolved — I grepped `['\"](hound|cutter|scout|valkyrn)['\"]` across src/renderer/src. The only matches are hudModel.ts:L345, hullModel.ts:L5 and L44, fleet.ts:L3-4 and defs.ts:L70. All are either in the allowed list or named as sites to fix (spec L45-53). The hull field and the §4.5 silhouette address the Hound outline leak.
- R1-F9: resolved — The §7.3 field table and bounds (L244-249) are consistent with the §7.2 counters: wear 0..7 with 8 per layer, hull 0..2 with 3 per hull point, room wear 0..5 with 6 per level. The reset rules and the overflow tie-break are at L220-236. Free entries hold zeros.
- R1-F10: still open — The closest approach is taken on 'the round's segment' (L231), meaning one tick's old-to-new sweep, and the round ends on its first contact. That segment is the tick that crosses the circle boundary, at about 11.7 u per tick plus relative velocity. Its closest point to the centre is therefore its end near the entry side, not the aim line's closest approach. So the Room still depends on approach, which contradicts 'aim decides it, not the approach side'. The §10 test 'aiming at the stern from ahead hits Engines' (L292-293) also cannot pass. With the segment, the point lands in the near (Weapons) third. With the infinite line, a shot along the nose axis from ahead has p ≈ 0 (Shields). Fix: use the closest approach of the round's infinite line, through its position along its relative velocity, clamped to the chord inside the circle. Then restate the tests: a side-on target hit with an offset along its axis gives Weapons or Engines, and a nose-on shot gives Shields.
- R1-F11: resolved — The muzzles sit at forward 21 and lateral ±12, which is about 24.2 u from the centre, outside the own 20 u circle (L208). Firing happens pre-move in applyWeaponsInput. stepRounds runs after flight and contacts and moves a round on its spawn tick (L223-227). The pip test's flight config `{gravity:false, edge:false, drag:0, stabilise:0}` matches FlightTuning (tuning.ts:L66-67).
- R1-F12: resolved — HeldInput gains gunHeld and aim, both carried by the codec, checkpoint and replay (L190-191, L209). An invalid aim counts as −1. The clear-then-set order at L199-200 matches today's clear at step.ts:L257.

## Verified
- Heading is an integer index with a headingAcc accumulator (physics.ts:L34-36), so the integer aim band arithmetic in spec L195-198 holds
- Hostility rule and cause order (science.ts:L33-39) match the spec's extension at L237-238
- FlightTuning fields gravity/edge/drag/stabilise exist (tuning.ts:L66-67), so the pip test config at spec L295 is buildable
- The id-literal grep over src/renderer/src matches only files in the allowed list or the listed fix sites (hudModel.ts:L345, hullModel.ts:L5/L44, fleet.ts:L3-4, defs.ts:L70)
- Solo repair and extinguish rates exist (step.ts:L84 REPAIR_RATE_SOLO; fire.ts:L59 DUEL_EXTINGUISH_RATE_SOLO), as spec L111 assumes
- holdHeading is cleared after the axes are taken today (step.ts:L256-257), consistent with spec L199-200
- systems.i.cls is validated against SHIP_CLASSES bounds in hash.ts:L194 and against DUEL_CLASSES in snapshot.ts:L136-137

## Not verified
- Sci-2 is not merged on master (createDuel still takes only helmPlayer, state.ts:L69), so I checked the crew-of-n sites against the Sci-2 spec text, not against code
- I did not check whether hullFor's call sites (the enemy window and console maps) can reach the layout's hull field without new plumbing
- I did not check ENGINE_FACTOR values; I assumed they are ≤ 1, so the engine factor cannot push a tick's step to 3 or more indices

---

# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `f543f9ab`. 3 accepted (2 reopened, 1 new), 0 rejected, 0 deferred. The reviewer resolved R1-F1, F2, F4, F5, F6, F7, F8, F9, F11 and F12.

## R1-F3 [P1]: The required laser slot (reopened)

Confirmed. The new evidence names readers outside the sim, including the bounds in the hash validator. §6.1 now says every reader of `slots.laser` guards null:
- In the hash validator, the laser maxima are taken over classes with a laser, and the gun maxima over classes with a gun.
- `consoleModel` drops the laser burst and range rows.
- `situationModel` drops the laser sentence and gives the gun's reasons instead.
- `hitModel` and telemetry count no laser hits.
- The plan greps every read of `slots.laser` and lists it.

§10 adds two null-laser tests: a Hound snapshot validates with the Valkyrn classes present, and the Flight-seat models build on the gun Valkyrn.

## R1-F10 [P2]: Room by aim (reopened)

Confirmed. A round moves about 11.7 u a tick, so on its last tick it has only just crossed the edge, and the closest point of that tick's short segment sits near the entry side.

§7.2 now uses the round's infinite line of relative motion. On a hit, its closest point to the centre is the middle of the chord the round cuts through the circle. The spec states the consequence: a shot along the enemy's axis always strikes Shields, and choosing Weapons or Engines takes a shot from the side. §10's tests are rewritten to match.

## R2-F1 [P2]: Signature collisions

Confirmed: `createTacticalState`'s second parameter is the slot count, and Sci-2 fixes the positional parameters of `createDuel`. §4.4 pins both:
- `createDuel(layout, seed, helmPlayer = 0, crew = 2, cls?)` keeps Sci-2's positional parameters and adds a fifth.
- `createTacticalState(seed, slots, crewClass)`.
- Every `opts.` reference is replaced.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md

<!-- end -->

---

# Round 3 (delta, reviewing 1a5f16ac, effort medium, 42 s, 111556 in / 86439 cached / 3476 out)

Verdict: ready with P2s

## Findings

### [P2] R3-F1 The Room's 'line of relative motion' uses a different frame from the hit sweep, and its anchor positions are not pinned
§7.2 sweeps the round's absolute segment (old to new position) against the enemy's post-move circle, treated as static. The Room rule instead uses an infinite line 'through the round's position along its velocity minus the enemy's'. The spec does not say which round position (old, new or contact), which enemy position (pre- or post-move), or which enemy velocity (post-move velocity, or this tick's displacement after gravity, drag and collision) to use. The two frames can also disagree. A round the static sweep counts as a hit can have a relative-motion line that misses the circle, so the claim that it 'is the middle of the chord' fails, and p comes from a point outside r. · spec L232-234 (swept segment vs the post-move circle, no enemy motion); spec L238-241 (infinite line of relative motion, 'the round's position', 'velocity minus the enemy's', 'middle of the chord'); spec L242 (thirds at ±r/3 on the nose axis, heading not stated as post-move). · Two implementers will anchor the line differently and get different p values near the ±r/3 boundaries. Because the rule is in the sim, that changes hashes and goldens. The 'middle of the chord' claim, which the §10 Room tests rely on, is not guaranteed under the stated sweep. · Use the sweep's frame. Take the infinite line through the round's old and new positions of this tick, and find its closest point to the enemy's post-move centre. Project the offset on the enemy's post-move heading to get p. This line meets the swept circle by construction, so the chord-middle claim holds. Otherwise, sweep in the relative frame as well, and name the positions and the enemy displacement used. Pin the result in a §10 test with a moving Hunter.

## Prior findings
- R1-F3: resolved — §6.1 L180-188 makes laser nullable. It pins laserCharge 0 and laserTargeted false, skips charge, hold, lock, auto-fire and burst, and answers the three commands 'unavailable' with the NO LASER flash. It requires every slots.laser reader to guard null, the hash maxima included, and states the weak-frequency parity exception. §10 L292-294 and L308-309 add tests for no laser event, unavailable answers and null-laser validation. The slots.laser readers not named are hunter.ts:L71 (the Hunter's own laser, never null) and contactModel.ts:L180 (the enemy's laser). Both are covered by 'among them' plus the plan's grep, and the type change makes them compile errors anyway.
- R1-F10: resolved — §7.2 L238-246 pins the closest-approach point of the infinite line, the projection on the nose axis, the thirds at ±r/3 with ties to Shields, and the consequence: shots along the axis hit Shields. §10 L302-304 restates the tests to match. A remaining frame and anchor ambiguity in the new text is raised as a new P2 finding.
- R2-F1: resolved — §4.4 L105-107 keeps Sci-2's positionals and adds cls as a fifth argument. createTacticalState keeps slots second, with a default, and adds crewClass third, so existing createTacticalState(seed, 3) calls keep their meaning. §6.1 L189-190 and §8 L279 are consistent. A grep finds no 'opts' left in the spec.

## Verified
- spec L105-107: createDuel's fifth argument and createTacticalState's third, with slots second and defaulted, are consistent with L189-192 and L279; a grep for 'opts' in the spec finds no matches.
- spec L180-188: the null-laser rules. A grep of src/renderer/src for 'slots.laser' finds 9 files. hash.ts:L195-196 matches the bounds named in the spec. hunter.ts:L71 and contactModel.ts:L180 read the Hunter's laser, which is never null.
- spec L238-246: the thirds and tie rule are explicit, and the axis-shot consequence follows from a closest-approach projection.
- spec L289-310: the §10 tests match the revised §4.4, §6.1 and §7.2 wording (the cls argument, the crew argument throw, the null-laser validation, and side, fore, aft and axial Room cases).

## Not verified
- I did not re-read the Sci-2 spec to confirm its exact createDuel signature; I relied on the R2-F1 evidence (Sci-2 L27, L39).
- I did not confirm that the duel's startRound and loadDuelSnapshot can get helmPlayer at all five call sites, because they change in Sci-2, which has not merged.

---

# Round 3 response (spec revised)

Reviewed `round-3.json` against the subject at `1a5f16ac`. 1 accepted, 0 rejected, 0 deferred. The reviewer resolved R1-F3, R1-F10 and R2-F1.

## R3-F1 [P2]: The Room line's frame and anchors

Confirmed. §7.2 swept the round's absolute segment, but the Room rule used a relative-motion line with unpinned anchors, so the two frames could disagree.

§7.2 now uses the sweep's own frame:
- The line is the infinite line through the round's old and new positions on the hit tick.
- The point is that line's closest point to the enemy's post-move centre.
- That offset is projected on the enemy's post-move heading.
- The sweep hit the circle, so this line meets it by construction.

§10 adds the same tests with the Hunter at full thrust.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md

<!-- end -->

---

