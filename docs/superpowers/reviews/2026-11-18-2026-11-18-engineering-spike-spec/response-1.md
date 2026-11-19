# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `b2fb869a`. 12 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: No step order or hazard cadence for the new phases in the duel tick

Confirmed. duel/step.ts never calls the sector step, and the heat numbers are per hazard tick (sim/tuning.ts:L4-L5). §7 now gives a numbered step order with the hazard tick defined as (tick − baseTick) % HAZARD_EVERY = 0, and names the order of the rng.hazards draws.

## R1-F2 [P1]: Duel fire and the sector fireStep double-grow the repair rooms

Confirmed. fireStep grows by oxygen fraction (hazards/fire.ts:L28-L29) and spreads at FIRE_SPREAD_P × passageFor, which is 0.05 through a closed door (sim/tuning.ts:L19). §4 now makes fireStep the one rule for growth, shrink and spread. firePhase drops DUEL_FIRE_GROW and keeps the damage cadence and the hit ignition. The shrink line is corrected to the 10 % / 20 % hysteresis, and the §8 spread test is now statistical, open versus closed at 0.05×.

## R1-F3 [P1]: Fires that spread to non-repair rooms cannot be put out by hand

Confirmed. Hound repair points exist only in O, R and E (duel/tuning.ts). §4 adds the rule that rooms without a point are fought at their breach-site tile (the Hound has one site per room, hound.json). It also states that seated characters take fire and low-air damage, as the duel already does for fire. §8 tests a fire in a non-point room.

## R1-F4 [P1]: Damage-to-bars rule contradicts itself and leaves the level-2 gates

Confirmed. The old formula could not zero a system with damage capped at 2. §2 now sets capacity = max(0, slots − damage × ceil(slots/2)), which gives 5/2/0 and 4/2/0. Excess bars return, the overdrive bar first. For ship 0 the gates read bars, and damage 2 still means off. The Hunter's lock at hunter.ts:L111 is unchanged and stated.

## R1-F5 [P1]: Shield layer cap at round start halves today's shields

Confirmed (SHIELD_LAYERS 2, tactical/tuning.ts:L84; weapons.ts:L158-L159 never strips excess layers). §2 keeps the FTL floor and states that the 1-layer round start is deliberate: Engineering buys the second layer back with bars. It adds the rule that layers above the cap drop at once and the clock resets, with a test.

## R1-F6 [P1]: The rate rule is undefined for several tables

Confirmed. §2 now has an explicit start table for every system and bar count, from 0 to slots, in whole units where the code uses them. Magazine regen becomes a units clock (10800 units, 4 per tick at 2 bars, which is exactly 2700 ticks). The Science and Helm/Weapons scan rates are given per bar. The oxygen factor is given.

## R1-F7 [P1]: Life Support reuse is false

Confirmed (hazards/lifeSupport.ts:L9-L12 reads stationOutput of the sector LS station). §4 now specifies a duel injection, INJECT_FRAC × V × HAZARD_DT × OXY_FACTOR[bars], into every room, with oxygenStep's clamp and venting skip. It bypasses stationOutput and the seated bonus.

## R1-F8 [P1]: The duel interior draws a seeded run quirk

Confirmed (state.ts:L138-L139; quirks.ts hooks). createDuel passes quirk 3 (Lucky Hull), whose only hook is sector debris, which never runs in the duel. §8 has a neutral-hook test.

## R1-F9 [P2]: Heat port changes heat.ts rules and leaves details open

Confirmed. §3 now states the heat rules outright:
- the rise and coolant per hazard tick;
- idle cooling;
- failed cooling at HEAT_COOL_UNIT × (1 + coolant), with heat held at HEAT_MAX on overheat;
- one overheat draw;
- fire heat out;
- coolant wrapping as cycleCoolant.

The §2 table names each system's room (Sensors O, Oxygen L).

## R1-F10 [P2]: Ship-view authority written as a sim rule

Confirmed. §6 states the UI rule and §7 the sim rule: any valid, present, conscious player, seated or standing, with no range or view check. The four kinds are in DUEL_KINDS, and the reason order is given.

## R1-F11 [P2]: Breach patching undefined

Confirmed (duel/step.ts:L73-L76, one job per worker). §4 now stores patch progress in breaches.repair as a whole-unit fraction of DUEL_EXTINGUISH_UNITS. It sets the precedence fire > breach > repair, lowest room on a tie, and orders the rolls per hit: fire first, then breach. The roll activates the room's single site.

## R1-F12 [P3]: Door reuse depends on the Doors station staying online

Confirmed (doors.ts:L75-L85). §5 states that the duel keeps the Doors station online and the fail-safe never fires, with a 600-tick airlock test. §5 also replaces the sector cycleDoor, which passes through Sealed, with a duel auto ↔ held-open toggle.

## Also changed

- §2 adds a per-system room and tactical Room table.
- §4 gives low-air damage the crewHurt cause 'air'.
- §7 names the magazine clock as power-module state.

## Files changed

- docs/superpowers/specs/2026-11-18-engineering-spike-design.md

<!-- end -->
