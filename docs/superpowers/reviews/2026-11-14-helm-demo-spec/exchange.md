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

