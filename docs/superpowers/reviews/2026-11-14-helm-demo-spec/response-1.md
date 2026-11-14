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
