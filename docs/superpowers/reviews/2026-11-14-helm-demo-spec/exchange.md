# Codex review exchange: helm-demo-spec

Subject: `docs/superpowers/specs/2026-11-14-helm-demo-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing bc4280c, effort high, 257 s, 568920 in / 491392 cached / 8227 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The orbit acceptance test conflicts with mandatory drag
A ship cannot retain a circular orbit within 2% for 60 seconds without thrust while the specified drag continuously removes velocity. The test does not specify disabling drag or stabilise. · spec L78 requires the no-thrust orbit test; spec L111 applies drag every tick; spec L112 enables stabilise on released axes. A read-only Node integration using the stated gravity, semi-implicit Euler and drag, with stabilise disabled, exceeds the radius tolerance after 1.4 seconds. Without drag, the radius stays between 249.184 and 250.827 over 60 seconds. · H-0 is gated on a test that contradicts normal flight behavior. Implementers must invent a different physics configuration to pass it. · Define an explicit gravity-only test configuration with drag and stabilise disabled, give the energy-drift test a numerical bound, and separately test the intended dissipative flight behavior.

### [P1] R1-F2 Solo Tab has no authoritative representation of an idle seated player
Tab leaves the inactive character seated but requires its console to behave as empty. Seat occupancy and the specified inputs cannot distinguish this from an active player holding neutral axes. Clearing laserCharge would mean release, not freezing. · spec L126 makes release fire or discard charge; spec L148 and L212 require idle consoles to freeze charge; spec L229 reads console occupancy; spec L231 adds only laserLock, laserCharge and missileLaunch. src/renderer/src/net/contracts.ts:L31 defines HeldInput as axes plus interactHeld. src/renderer/src/authority/core.ts:L195-L202 also clears only held input on disconnect, leaving seating unchanged. · Switching away can leave a charge running, fire it accidentally, or produce behavior that cannot be reconstructed from the authoritative input journal. The same omission affects a disconnected seated gunner. · Specify a journaled control-active transition, or an equivalent explicit input contract, distinct from Fire release. Define which held states are cleared on Tab, stand and disconnect, whether an unattended repair continues, and how control resumes.

### [P1] R1-F3 Define the duel's actual interaction and command phases
The listed interior systems are not an executable subset as described: stations.ts supplies helpers, while stand dispatch and local door-toggle application live in consoleSystem, which also runs excluded sector behavior. Interact is incorrectly described as an existing command. · spec L146 lists movement, doors, stations and interact; spec L229 specifies their duel ordering; spec L152 and L231 call Interact an interaction command. src/renderer/src/sim/step.ts:L35-L45 resets scratch and runs interact, console, movement, then doors. src/renderer/src/sim/commands.ts:L46 excludes stand from interaction dispatch; L87-L94 handles it in the console phase. src/renderer/src/sim/console.ts:L13-L17 runs sector weapon/science effects and L25-L33 dispatches stand and applies door toggles. src/renderer/src/net/contracts.ts:L31 puts interactHeld in HeldInput. · Omitting consoleSystem loses required command processing; reusing it wholesale runs excluded systems. Different phase choices also change sit/stand, movement and repair on the same tick. · Specify the duel phase sequence, scratch reset and tick advancement, its command allowlist, and the extracted stand/local-door handling. State explicitly that repair uses held.interactHeld. Define command precedence for same-tick sit, stand and tactical actions.

### [P1] R1-F4 Complete the collision and boundary rules
Several required physical outcomes lack rules: the map spring has no force law or coefficient; asteroid bounce restitution and repeat-damage policy are absent; ship-to-ship contact is unspecified; missiles have no collision radius. · spec L57 specifies a soft spring without its formula; L58 gives planet restitution and grace; L62 gives asteroid damage and says bounce without equivalent parameters; L74 promises circle collisions in fixed order; L86 supplies only ship radius; L133-L135 requires missile impacts and map-edge destruction. · These are ordinary flight states. Fixed iteration order alone cannot make independently implemented collisions produce the same trajectories, damage or replay. · Add a collision matrix and boundary equations with starting constants. Define contact detection, overlap correction, restitution, damage cooldown scope, missile radius, ship-to-ship behavior and precedence when multiple contacts occur in one tick.

### [P1] R1-F5 Specify laser and missile transitions when control is interrupted
The weapon rules leave partial charge, Fire release during missile flight, and unattended missile propulsion unresolved. A missile normally thrusts automatically, but an unattended missile is said to coast. · spec L126 defines charge release and venting; L134 gives automatic thrust and fuel duration; L136 freezes only a held full charge during missile flight; L148 and L212 say unattended missiles coast unsteered. · Launching with partial charge, releasing Space while steering, and leaving Weapons are normal actions. Implementations could discard or preserve charge, queue a shot, or keep accelerating an unattended missile. · Provide a transition table covering partial/full charge, launch, release during flight, stand, control deactivation and missile termination. Explicitly define unattended thrust, fuel consumption, timer freezing and whether any release can be deferred.

### [P1] R1-F6 The hunter's repair and timing state machine is incomplete
The repair timer has no precise start/end phases or target priority, and permitted actions during repair are incomplete. The firing jitter and reaction lag also lack deterministic sampling rules. · spec L153 says one level takes 4 seconds plus a 6-second walk allowance and selectively stops manoeuvring or firing. L163 says enter Repair for a room, spend 4 seconds per level plus the allowance, then return to Hunt. L162 specifies 0.2-second jitter and 0.3-second reaction lag without defining their distributions, draw timing or history sampling. · A level-2 room could cost 14 or 20 seconds; simultaneous damaged rooms can select different targets; an enemy repairing Weapons might still charge or guide a missile. These choices materially change the intended repair trade-off and replay. · Define repair-target priority, timer start, whether the allowance includes return travel, levels repaired per visit, additional-hit behavior and all enabled actions in each phase. Define jitter sampling and reaction-lag history in ticks, including RNG draw points.

### [P1] R1-F7 Repair-point geometry does not yet enforce repair inside the room
Reusing Power targeting does not enforce the requirement to enter the damaged room. Exact repair tiles are missing, and the Shields location is deferred until after H-0 already requires walking-repair gates. · spec L149-L150 requires repair points and today's Power targeting; L251 gates H-0 on walking repairs, while L301 selects Shields in H-1. src/renderer/src/sim/interact.ts:L70-L75 checks distance only for Power targets, without a room or wall check. src/renderer/src/sim/ship/cutter.json:L488-L494 places the Weapons console in W, also the specified Weapons repair room. Binding docs/vision/thesis-grill.md:L285-L287 requires walking into rooms to repair. · A nearby repair point can be worked through a wall. The claimed walk from both consoles is not guaranteed merely by assigning room names, and H-0 cannot measure the intended travel cost without concrete locations. · Choose all three repair tiles before H-0's interior gates, require the repairer to occupy the target room, and specify target priority/ties. Verify reach and travel from both console positions, explicitly resolving the short Weapons-console-to-Weapons-repair walk.

### [P1] R1-F8 Specify whether duel movement and repairs retain character modifiers
Creating today's SimState and reusing its movement/progress does not imply uniform 4 tiles/s movement or 4-second repairs. The spec does not choose whether character traits, repair skills and XP remain active. · spec L145 assumes 4 tiles/s and L150 specifies 4 seconds per repairer; L229 uses today's SimState. src/renderer/src/sim/state.ts:L81 and L115 use default characters and apply head starts. src/renderer/src/sim/characters.ts:L14 gives player 0 Quick Hands, Heavy Boots and Repair level 3; L27-L30 applies their multipliers. src/renderer/src/sim/movement.ts:L65 applies speedMult. src/renderer/src/sim/interact.ts:L138-L160 applies repair skill/trait multipliers and awards XP. src/renderer/src/sim/tuning.ts:L113-L120 supplies 0.06 skill gain, 1.25 repair and 0.85 speed multipliers. · The default Helm moves at 3.4 tiles/s. Applying existing repair multipliers to a 4-second base gives approximately 2.71 seconds for that character, changing the crew-versus-hunter repair comparison. · Define duel character initialization and whether traits, skills and XP affect movement or tactical repair. Either use explicit neutral behavior or describe the stated timings as baselines and include the modifiers in acceptance expectations.

### [P1] R1-F9 Define shield recharge progress and interruption semantics
The shield rules do not determine when recharge starts, whether hits reset it, or what happens to accumulated progress when Shields damage changes. · spec L88 says one layer recharges every 5 seconds while undamaged; L98 specifies recharge multipliers of 1, 1.5 and stopped; L128 strips a layer on a laser hit; L150 permits damage levels to decrease through repair. · After stripping a second layer, preserving versus resetting recharge progress creates different firing windows. Level-2 damage followed by repair can likewise cause an immediate recharge or a full new wait. · Specify the recharge clock, hit-reset policy, progress representation, behavior while stopped and behavior when the damage multiplier changes. Clarify what 'while undamaged' refers to.

### [P1] R1-F10 A global SIM_VERSION bump cannot preserve sector hash goldens
The requirement to bump SIM_VERSION while leaving sector goldens unchanged contradicts the existing canonical serialization. · spec L233 requires both a SIM_VERSION bump and unchanged sector goldens; L279 repeats the unchanged-golden requirement. src/renderer/src/sim/flatten.ts:L30 includes SIM_VERSION in every flattened state; src/renderer/src/sim/hash.ts:L5-L6 hashes that representation. src/renderer/src/sim/snapshot.ts:L20 and L31 store and validate the same version. · Even an otherwise unchanged sector simulation produces different hashes after the bump. A plan writer cannot satisfy both acceptance requirements. · Explicitly permit version-only regeneration of sector hash goldens while requiring unchanged gameplay figures and gates, or specify mode-specific versioning that preserves the sector version. Define how the new tactical RNG stream stays outside unchanged sector serialization.

## Verified
- The checkout is on master at bc4280c. git diff against 2a7e6ba showed no changes in the subject, binding owner documents, or listed simulation/authority/contracts sources.
- The quoted gravity and speed arithmetic is consistent: circular speed at r=250 is 99.523 u/s; acceleration at r=1200 is 1.735 u/s² and at r=2800 is 0.31885 u/s²; turning is 1.7778 heading steps/tick. Force-then-drag terminal speed is 798 u/s, consistent with 'about 800' (spec L59, L108-L111).
- Navigation, Weapons and Engineering occupy separate Cutter rooms B, W and E, at (27,6), (8,6) and (2,6). The console coordinates have a 25-tile bow-to-stern separation; this alone does not establish a 25-tile walking route (spec L145; src/renderer/src/sim/ship/cutter.json:L468-L531).
- The initial SimState supplies the fields read by the reused systems: station allocations remain positive, hazards are empty, crew are conscious, and carrying is zero. Disabling hazard/director stepping does not inherently prevent walking, automatic doors or seating (src/renderer/src/sim/state.ts:L90-L110, L125; stations.ts:L8-L9; doors.ts:L83-L98).
- TEAM_MULT is 1.25 per holder, and existing interaction progress groups holders by exact target. A tactical target must be added to the multiplier applicability check (spec L150; src/renderer/src/sim/tuning.ts:L218; interact.ts:L109-L138).
- The authority supports multiple player IDs attached to one link, with duplicate-ownership validation, supporting the solo ownership premise (spec L210; src/renderer/src/authority/core.ts:L192-L194).
- The five-question acceptance checklist and three-session threshold match Q22; ship-centred console views, networked two-player scope and walkable interiors match Q15b and Q26-Q27 (spec L217-L220, L262-L269; docs/vision/thesis-grill.md:L141-L145, L214-L223, L274-L290).

## Not verified
- The supplied review directory and ledger.md were absent. No prior IDs were supplied, so prior is empty. No review file was written.
- sed failed with a Windows sandbox CreateFileMapping error. Requested ranges were read using PowerShell instead.
- Finding-driven inspection extended beyond the manifest to console.ts, characters.ts, skills.ts, hash.ts, snapshot.ts, flatten.ts, tests/determinismGuard.test.ts, and additional ranges of authority/core.ts, interact.ts, commands.ts, tuning.ts and cutter.json. These extensions checked dispatch, modifiers, versioning and repair geometry; the wider repository was not reviewed.
- No Jest/Vitest suite, gameplay session, map generator, cross-engine replay or network test was run. Arithmetic checks used read-only Node scripts. Actual Cutter travel time and proposed duel behavior remain unmeasured.
- Net-0 transport decisions, Cloudflare prerequisites, existing renderer/input bindings, Skiff layout claims and recursive AST-guard coverage were not independently verified against their implementations.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `bc4280c`. 10 accepted, 0 rejected, 0 deferred. No prior IDs (round 1).

## R1-F1 [P1]: The orbit acceptance test conflicts with mandatory drag

Confirmed. Drag `v × (1 − 0.15·dt)` (spec §6) removes orbital energy every tick, so a no-thrust orbit cannot hold r = 250 within 2% with drag on. §4's tests now name a gravity-only configuration (drag and stabilise switched off by test tuning) for the orbit (2% over 60 s) and energy (1% over 5 min) checks, and a flight configuration for the dissipative behaviour (terminal speed within 5% of §6, sideways speed below 5 u/s within 1 s of release).

## R1-F2 [P1]: Solo Tab has no authoritative representation of an idle seated player

Confirmed. `HeldInput` is `{moveX, moveY, interactHeld}` (`net/contracts.ts:L31`), and seat occupancy alone cannot tell an idle owner from one holding neutral. §8 adds a per-player `present` flag set by a new `presence {present}` command and by link disconnect/reconnect; an empty console is now "nobody seated, or a seated player who is away". Going away zeroes held input. §11a's Tab sends `presence` false/true on the same tick. The laser side is covered by R1-F5's table: becoming unattended clears `fireHeld` without firing or discarding. An away player's repair pauses with progress kept.

## R1-F3 [P1]: Define the duel's actual interaction and command phases

Confirmed. `stand` is dispatched in `consoleSystem` (`sim/console.ts:L25-L26`), which also runs beams, scans, torpedoes and door toggles (`console.ts:L28-L31`), and `interactHeld` is held input, not a command. §13 now gives the duel's own phase list in `sim/duel/step.ts` (the sector `stepCommands` is not called): scratch reset; seat phase (`sit` through today's validation, limited to Navigation and Weapons; `stand` through a handler extracted from `consoleSystem`; then `presence`); tactical commands validated against post-seat-phase seats; interact on `interactHeld` with tactical repair targets only; movement; tactical step; damage hand-over; tick advance. It also gives the command allowlist and the same-tick ordering. §8's inputs bullet is corrected.

## R1-F4 [P1]: Complete the collision and boundary rules

Confirmed. §3 now gives the edge force law `a = −K_EDGE (|d| − R_MAP) d/|d|` with `K_EDGE` 2 /s², and asteroid restitution (50%) and grace (1 s per ship–asteroid pair). §4 adds a collision matrix: ship–planet, ship–asteroid, ship–ship (equal push-apart, exchange normal components, 50% kept, 1 hull each, pair grace), missile radius 4 destroyed on anything solid or the edge, and the order and accumulation rule for several contacts in one tick.

## R1-F5 [P1]: Specify laser and missile transitions when control is interrupted

Confirmed. The old text said an unattended missile "coasts" while §7b says it thrusts on its own. §7b now states that a missile always burns its fuel and runs its own clocks; "unattended" only zeroes its steering. A Weapons state-transition table covers hold, release (full or partial), commands during missile flight (rejected `missile-in-flight`, charge frozen), launch (charge frozen, `fireHeld` cleared), missile end (unfreeze; firing needs a fresh press), unattended (clear `fireHeld` without firing or discarding; freeze) and re-attended.

## R1-F6 [P1]: The hunter's repair and timing state machine is incomplete

Confirmed. §9 now defines repair priority (highest level first, ties Engines, Weapons, Shields), the visit (6 s walk, then 4 s per level of work, one level per visit, then back to Hunt), which actions are disabled for the whole visit by room, that new hits do not interrupt it, and that the timers count ticks. The firing jitter is one uniform draw of 0 to 12 ticks from `rng.tactical` each time the crew enters arc with line of sight. The missile's reaction lag reads an 18-tick ring buffer of crew positions kept in the hunter's state.

## R1-F7 [P1]: Repair-point geometry does not yet enforce repair inside the room

Confirmed. `interactTarget` checks only distance for Power targets (`sim/interact.ts:L73-L75`). §8 now fixes all three repair tiles: Engines E 2,6; Weapons W 8,7; Shields in the Reactor R 16,8 (traced on the Cutter's row map). It gives a walk table from both consoles (paths through the Cutter's doors at 4 tiles/s; H-0 measures them) and states the gunner's 1-tile Weapons repair, with the console still empty during it. The new target requires the repairer to stand inside the repair point's room as well as within `REACH`; nearest wins, ties by tactical room index. The H-1 deferral of the Shields room is removed (§18 item 18).

## R1-F8 [P1]: Specify whether duel movement and repairs retain character modifiers

Confirmed. Default characters carry traits and head starts (`sim/characters.ts:L14`), movement applies `speedMult` (`movement.ts:L65`), and repair applies skill and trait multipliers and XP (`interact.ts:L138-L160`). §8 now makes both crew the trait-free Recruit (`CHARACTERS[4]`) with no head starts and no XP in the duel, so 4 tiles/s and 4 s per level are exact (§18 item 19).

## R1-F9 [P1]: Define shield recharge progress and interruption semantics

Confirmed. §5's shield row now defines a recharge clock that runs below 2 layers at 1/s ÷ the Shields-room factor, adds a layer at 5 s, resets on a stripping hit, is held (not reset) at Shields level 2, resumes at the new factor after repair, and stays at 0 at full layers. The damage table refers to it.

## R1-F10 [P1]: A global SIM_VERSION bump cannot preserve sector hash goldens

Confirmed. `flatten.ts:L30` writes `SIM_VERSION` first into every flattened state, and `hash.ts` hashes it. §13 now re-blesses the sector goldens for the version number only, with the bless commit showing that only that field changed and the gameplay traces unchanged. The tactical state and `rng.tactical` live only in the duel state's own flatten, so the sector stream list is untouched. Risk 7 is updated to match.

## Also changed

- §8: every Cutter door is held open for the duel. Today's doors open only while the Doors station is online, and power is off in the duel. Found while tracing walk paths for R1-F7. Also §18 item 20.
- §8: `sit` on scenery consoles is rejected (was "can't sit"). The Cutter has no console groups (verified in `cutter.json`).
- §17 risk 8: walk figures updated to the §8 table.

## Files changed

- docs/superpowers/specs/2026-11-14-helm-demo-design.md

<!-- end -->

---

# Round 2 (delta, reviewing 97cd5cb, effort medium, 145 s, 451476 in / 382592 cached / 4487 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 Disconnect presence changes still lack a journaled transition
The new presence command covers Tab, but disconnect and reconnect change authoritative presence without specifying their journal representation or application tick. · spec L172 changes present on link disconnect/reconnection; spec L264 applies presence commands in the seat phase. src/renderer/src/authority/core.ts:L195-L202 clears held input on detach, while L148-L153 journals held inputs and commands. Neutral held input cannot encode presence. · A disconnected seated gunner must freeze charge; an attended gunner with neutral axes need not. Replaying the existing journal cannot distinguish those states unless lifecycle presence changes are recorded. · Specify a trusted, journaled presence lifecycle event, its tick and ordering relative to player commands, and its replay behavior for disconnect and reconnect.

### [P1] R2-F2 Hunter firing schedules releases before charge is ready
The revised jitter rule releases within 12 ticks of acquiring arc and line of sight regardless of charge, and does not define how firing is scheduled again while the target remains continuously eligible. · spec L195 schedules release on the first eligible tick plus 0–12 ticks. spec L136 requires 4 seconds of charging and discards partial charge on release; spec L190 requires the hunter to use the same inputs and rules. · An early acquisition discards the hunter's charge. Implementers must invent whether it retries immediately, waits for full charge, or waits for another arc entry, producing substantially different combat. · Define full-charge and range eligibility, when jitter is sampled relative to readiness, cancellation conditions, and rearming after a release while the target stays in arc. Define initial history values for the 18-tick pursuit buffer.

### [P1] R2-F3 The missile collision matrix does not exempt its launching ship
The matrix destroys a missile on any solid contact, but only delays damage to its own ship. It does not say to ignore the launching ship during the first second. · spec L82 destroys missiles on 'anything solid' and applies ship impact damage only to the enemy or the own ship after one second. spec L143 launches from the nose; L145 says a missile can hit its own ship after one second. · A radius-4 missile launched at the radius-20 ship's nose overlaps its own hull. Reading the matrix literally destroys it immediately; treating the grace period as collision immunity produces a different result. · Explicitly exclude owner-ship contacts from both destruction and damage before the arming age, define the launch centre offset, and specify whether missile–missile contacts destroy both missiles.

### [P1] R2-F4 The replacement skid-stop gate lacks a feasible initial condition
The new one-second sideways-speed test does not specify initial velocity and cannot hold for the cruise-speed skid described elsewhere. · spec L88 requires sideways speed below 5 u/s within one second; L121 gives approximately 800 u/s terminal speed; L122 caps stabilise at 80 u/s²; L126 describes stopping a cruise-speed skid within one second. A 60-step arithmetic check with the stated drag and assist reduces 800 u/s to approximately 614.06 u/s, even without sideways gravity. · The gravity-only gate is now feasible, but the replacement flight gate still requires the plan writer to choose an unstated starting condition or change tuning. · Specify initial sideways and forward velocities, position, heading, and force configuration for the skid test. Align its threshold and the cruise-speed feel target with the chosen assist strength.

### [P1] R2-F5 Weapons repair requires no walk from the Weapons console
The stated one-tile repair walk is not enforced by the chosen tile and existing reach rule. · spec L168 places Weapons at (8,6); L179 places its repair at (8,7) and claims a one-tile walk; L183 permits repair from anywhere in that room within REACH. src/renderer/src/sim/stations.ts:L38-L39 centres the seated character on its console tile; sim/interact.ts:L28-L36 measures distance to the target tile's square; sim/tuning.ts:L39 sets REACH to 1.5. The distance from (8.5,6.5) to the repair tile is only 0.5. · The gunner can stand and repair without moving, so the travel-cost claim and its proposed acceptance measurement are incorrect. · Explicitly document and accept a zero-walk Weapons repair, or choose geometry/eligibility that requires the intended walk. Distinguish distance to the tile from distance to the first eligible repair position.

## Prior findings
- R1-F1: still open — The gravity-only checks are corrected and numerically feasible, but the new skid gate at spec L88 lacks initial conditions and conflicts with the cruise-speed target at L126 under L122's assist limit.
- R1-F2: still open — Tab and unattended repair are specified. Disconnect/reconnect presence at spec L172 still lacks a journaled lifecycle representation; authority/core.ts:L148-L153 records inputs, while L195-L202 only clears held input on detach.
- R1-F3: resolved — spec L262-L274 supplies the separate duel phase list, scratch reset, seat precedence, command allowlist, held Interact, and tick advancement. Held-open doors remove the need for local door-toggle processing.
- R1-F4: still open — Edge force, restitution, damage grace and ship contact are specified. spec L82 still conflicts with the own-ship arming rule at L145 by destroying missiles on any solid contact before arming.
- R1-F5: resolved — spec L147-L159 defines unattended propulsion, charge preservation, ignored release during flight, cleared fireHeld, and the fresh-press requirement on resumption.
- R1-F6: still open — Repair priority, visit duration and disabled actions are now explicit at spec L196. Firing at L195 still lacks charge-readiness and repeat-shot scheduling, and the history buffer lacks startup values.
- R1-F7: still open — Tiles, same-room targeting and tie-breaking are fixed. The claimed one-tile Weapons walk at spec L179 is actually zero under L183 and the existing REACH geometry.
- R1-F8: resolved — spec L169 selects trait-free Recruits, no head starts and no XP, matching characters.ts:L18 and L27-L30.
- R1-F9: resolved — spec L98 and L108 define recharge progress, stripping-hit reset, level-2 suspension, repair resumption and full-layer behavior.
- R1-F10: resolved — spec L276 permits version-only sector golden regeneration and isolates tactical RNG from sector serialization, matching flatten.ts:L30-L31.

## Verified
- HEAD is 97cd5cbdc7ebf2e3b0c1114a010997c5c5700281; the subject diff reports 67 insertions and 22 deletions.
- Read the binding Q11–Q27 answers and napkin, and checked changed rules against the cited source.
- A read-only Node integration of spec L59/L74/L88's gravity-only configuration produced radius 249.184–250.827 over 60 seconds and maximum relative energy error approximately 0.0000435 over five minutes.
- Cutter row data places the selected repair tiles in E, W and R; the same-room requirement at spec L183 addresses the original through-wall targeting defect.
- No files were modified and no Jest suite was run.

## Not verified
- The on-disk ledger could not be read because access was denied; the supplied ledger and response were used.
- Actual movement travel times, duel implementation, cross-engine replay and playtest acceptance were not executed in this specification-only review.
- sed failed with a sandbox CreateFileMapping error; bounded PowerShell reads were used instead.

---

# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `97cd5cb`. 5 new findings accepted, 0 rejected, 0 deferred. Codex confirmed R1-F3, R1-F5, R1-F8, R1-F9 and R1-F10 resolved. R1-F1, R1-F2, R1-F4, R1-F6 and R1-F7 were reopened; each pairs with one new finding and is fixed together with it.

## R2-F1 [P1]: Disconnect presence changes still lack a journaled transition (with R1-F2)

Confirmed. Detach only zeroes held input (`authority/core.ts:L195-L202`), and the journal records commands and lifecycle controls (`core.ts:L18`, `JournalControl` with `source: 'lifecycle'`). §8 now routes detach and attach through that existing lifecycle path as a lifecycle presence control. It is journaled in the tick's `controls` with its ordinal, applied at the next tick boundary, and applied before player commands in the seat phase. Replay reproduces it from the journal.

## R2-F2 [P1]: Hunter firing schedules releases before charge is ready (with R1-F6)

Confirmed. The old rule could release a partial charge, which §7a discards. §9 now holds Fire whenever the laser isn't frozen. It defines eligibility (arc, range, line of sight) and draws the jitter only on the first tick where a full charge and eligibility both hold. It cancels and redraws if either lapses before the release, and notes that a release resets the charge, so repeat shots wait a full charge. The 18-tick pursuit buffer is seeded with the crew ship's spawn position.

## R2-F3 [P1]: The missile collision matrix does not exempt its launching ship (with R1-F4)

Confirmed. "Anything solid" included the launching ship. The §4 matrix now separates missile against planet, asteroid or edge (destroyed); against the other ship (lands, then destroyed); against its own ship (ignored entirely for 60 ticks, then lands); and missile against missile (both destroyed, no damage). §7b gives the spawn point: centre + heading × 25 (ship radius 20, missile radius 4, 1 clear).

## R2-F4 [P1]: The replacement skid-stop gate lacks a feasible initial condition (with R1-F1)

Confirmed. An 80 u/s² assist cannot remove an 800 u/s skid in 1 s. §4's flight test now starts at 300 u/s forward and 60 u/s sideways, heading north, gravity and edge off, and requires sideways speed below 5 u/s within 60 ticks. A Node check with the stated drag and assist gives 0.00. The terminal-speed test now has a 30 s window, since the drag time constant is about 6.7 s; the check gives 789.2 u/s, within 5% of 800. §6's feel target is restated as a skid of up to 60 u/s stopping within 1 s.

## R2-F5 [P1]: Weapons repair requires no walk from the Weapons console (with R1-F7)

Confirmed. A seated character sits on the console tile (`stations.ts:L38-L39`), and `REACH` 1.5 is measured to the tile's square (`interact.ts:L28-L36`), so 8,7 is in reach from 8,6. §8 now accepts this explicitly: the gunner's own-room repair needs no walk by design, and standing up still empties the console for the whole repair. The table says "none", and walks are now defined as the path to the first in-reach position.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-14-helm-demo-design.md

<!-- end -->

---

# Round 3 (delta, reviewing a18602c, effort medium, 80 s, 203534 in / 143872 cached / 2611 out)

Verdict: changes requested

## Findings

### [P1] R3-F1 Lifecycle presence records need an explicit player target
The new lifecycle presence payload records whether someone is present but does not identify whose presence changes. The existing lifecycle journal wrapper supplies no player identity either. · spec L177 specifies `{present: false}` / `{present: true}` inside a lifecycle JournalControl. src/renderer/src/authority/core.ts:L18 contains only source, order, ordinal and control for lifecycle records; L192-L202 associates each live binding with a players array. spec L250 explicitly allows two player IDs on one link. · Replay has no live binding from which to recover the affected player. Disconnecting player 0 and disconnecting player 1 can therefore produce indistinguishable presence records with different required simulation outcomes. · Define a discriminated lifecycle presence control carrying a player ID, or an explicit player-ID list. Specify that attach/detach records all affected binding players, with deterministic ordering, and extend JournalControl's control union accordingly. Replay must apply those recorded targets without consulting transport bindings.

## Prior findings
- R1-F1: resolved — spec L91 separates gravity-only and dissipative tests and supplies numerical bounds; L129 aligns the skid feel target with 60 u/s.
- R1-F2: still open — Tab and unattended behavior are defined, but the lifecycle payload at spec L177 omits the affected player. The lifecycle JournalControl at authority/core.ts:L18 has no player or binding field, leaving disconnect replay incomplete.
- R1-F4: resolved — spec L57 and L75-L87 define boundary and collision behavior; L84 now explicitly ignores owner contacts for 60 ticks, and L146 supplies launch clearance.
- R1-F6: resolved — spec L202 now schedules jitter only with full charge and eligibility, defines cancellation and recharging, and seeds pursuit history. L203 defines repair priority, walk/work timing, one-level visits and disabled actions.
- R1-F7: resolved — spec L185-L190 fixes repair tiles, requires same-room eligibility, defines target ties and explicitly accepts zero-walk Weapons repair. H-0 includes these rules at L301.
- R2-F1: still open — spec L177-L179 adds journaling and application ordering, but not the player identity needed to replay the transition; authority/core.ts:L18 cannot supply it.
- R2-F2: resolved — spec L202 requires full charge plus arc, range and LOS before sampling jitter, cancels on loss of readiness, and defines repeat charging and initial pursuit history.
- R2-F3: resolved — spec L84 exempts owner contacts from destruction and damage for 60 ticks; L85 destroys both colliding missiles; L146 places the missile centre 25 units from the ship centre.
- R2-F4: resolved — spec L91 specifies heading, velocities, disabled environmental forces and duration. Arithmetic gives 0 u/s sideways after 60 ticks and 789.18 u/s forward after 30 seconds.
- R2-F5: resolved — spec L186-L189 explicitly accepts no Weapons repair walk and measures other walks to first reach. This matches stations.ts:L38, interact.ts:L28-L36 and tuning.ts:L39.

## Verified
- HEAD is a18602c1f85cd02993256023e57a5dd930173e18 on master; the subject has no working-tree diff against that commit. The actual revision diff matches the supplied delta.
- Read-only Node arithmetic using spec L59, L74 and L91 produced a 60-second orbit radius range of 249.861–254.913 and maximum relative energy drift of 0.0000871 over five minutes, within the stated gates.
- Repair points lie in the specified Cutter rooms, and Weapons repair is reachable from the console position: spec L185-L190; cutter.json:L12-L15 and L488-L493.
- Checked the revised rules against thesis-grill.md Q11–Q27 and napkin.md; accepting an already-in-room repair while standing preserves Q27's room-based repair requirement.

## Not verified
- The on-disk ledger read was denied; review history was taken from the supplied ledger and responder text.
- No Jest suite or implemented duel simulation was run. Numerical checks establish feasibility of the revised gates, not gameplay feel or runtime integration.
- Unchanged material outside the awaited findings and directly affected interactions was not re-reviewed.

---

# Round 3 response (spec revised)

Reviewed `round-3.json` against the subject at `a18602c`. 1 new finding accepted, 0 rejected, 0 deferred. Codex confirmed R1-F1, R1-F4, R1-F6, R1-F7, R2-F2, R2-F3, R2-F4 and R2-F5 resolved. R1-F2 and R2-F1 remain open on the same point as R3-F1 and are fixed with it.

## R3-F1 [P1]: Lifecycle presence records need an explicit player target (with R1-F2, R2-F1)

Confirmed. The lifecycle `JournalControl` (`authority/core.ts:L18`) carries `source`, `order`, `ordinal` and `control`, with no player. A binding holds a `players` array (`core.ts:L192-L202`), and one link carries two players in solo (§11a). §8 now defines `LifecyclePresence = { kind: 'presence'; players: number[]; present: boolean }` as a new member of the lifecycle control union beside `LifecyclePause`, with `players` set to the binding's full list in ascending order. `JournalControl.control` widens to `LifecyclePause | LifecyclePresence`. Replay applies the recorded `players` and never consults transport bindings.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-14-helm-demo-design.md

<!-- end -->

---

