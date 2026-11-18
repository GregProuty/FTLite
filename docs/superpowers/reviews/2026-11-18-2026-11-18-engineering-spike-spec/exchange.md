# Codex review exchange: 2026-11-18-engineering-spike-spec

Subject: `docs/superpowers/specs/2026-11-18-engineering-spike-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 06bde9b0, effort high, 254 s, 1012952 in / 923687 cached / 24134 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 No step order or hazard cadence for the new phases in the duel tick
The spec turns on doorSystem, oxygenStep, fireStep, heat, breach rolls, low-air damage and bar knockout, but never says where they run in stepDuelTick or on which ticks. The heat numbers it quotes are 'per hazard tick', and the duel has no hazard tick. Several of these phases draw from rng.hazards, and the draw order isn't given either. · spec L69-L70 ('per hazard tick'), L82-L97, L127 (gives only module/snapshot order, not step order). duel/step.ts:L1-L2 ('The sector step ... is never called on the duel's interior') and L262-L272 (repair, movement, stepDuel, applyHitDamage, firePhase, healthPhase). sim/step.ts:L35 and L45-L53 (sector: hazardTick = state.tick % HAZARD_EVERY; movement → doorSystem → lifeSupportInjection → oxygenStep → fireStep → heatStep). duel/step.ts:L111 (the interior tick starts at baseTick each round). rng.hazards is drawn by fire/fire.ts:L35, heat.ts:L40 and duel/fire.ts:L38. · Two builds would run hazards every tick or every 5th tick, and would key the cadence to st.tick or to tick − baseTick. They would order the fire, breach and spread draws differently on rng.hazards, and put doorSystem before or after movement. Each choice changes rates by up to 5× and changes the goldens. The spec's own bar is that two implementers build the same sim. · Add a numbered duel phase list. For example: seat → tactical commands → power/coolant/door/airlock commands → repair/patch work → movement → doorSystem → stepDuel → applyHitDamage → bar knockout → per hit, in event order, the fire roll then the breach roll → firePhase cadence. Then, on (tick − baseTick) % HAZARD_EVERY === 0: injection → oxygenStep → fireStep → duel heat. Then healthPhase (fire, then low air). Name every rng.hazards draw in that order.

### [P1] R1-F2 Duel fire and the sector fireStep double-grow the repair rooms; the spread test contradicts the code
§4 says the duel fire 'uses the sector fire step' and also 'keeps today's damage cadence'. It never says whether firePhase's per-tick DUEL_FIRE_GROW stays. If it stays, the three repair rooms grow under both rules and every other room only under fireStep. fireStep also spreads through closed doors at PASSAGE_CLOSED (0.05×), so the test 'spreads through an open door but not a closed one' is false against the code. The '15 %' shrink line doesn't match the code either. · spec L93-L95, L146. duel/fire.ts:L48-L51 (grows DUEL_FIRE_GROW = 1/60 per tick at points), duel/tuning.ts:L34. hazards/fire.ts:L28-L29 (FIRE_GROW_RATE·HAZARD_DT above 0.2, shrink below 0.1) and L34 (p = FIRE_SPREAD_P × passageFor). oxygen.ts:L14 (a closed door gives PASSAGE_CLOSED). sim/tuning.ts:L19, L26-L27 (FIRE_SHRINK_FRAC 0.1, not 15 %). · If both growths run, a repair-room fire grows at 1.5 intensity/s against 0.5 in every other room, which is the question-10 double-step. If DUEL_FIRE_GROW is dropped, today's tuning changes silently. The closed-door spread test would fail on some seeds, or pass only by luck. · State that firePhase drops DUEL_FIRE_GROW and keeps only the DUEL_FIRE_DAMAGE_TICKS cadence and the hit ignition, and that fireStep is the one growth, shrink and spread rule for every room. Either keep closed-door spread at PASSAGE_CLOSED and reword the test ('spreads through an open door at FIRE_SPREAD_P and through a closed one at 0.05×, statistically over N hazard ticks'), or add an explicit duel rule that closed doors pass no fire. Correct '15 %' to the 0.1/0.2 hysteresis.

### [P1] R1-F3 Fires that spread to non-repair rooms cannot be put out by hand
Once fire spreads, any of the Hound's eight rooms can burn, including B, where the Helm and Weapons sit. The duel's extinguish work exists only at the three repair points (O, R, E). A fire in B, Q, M, L or H can only die from lack of oxygen or venting. Meanwhile healthPhase burns every conscious character in the room, seated ones included. · spec L94-L97 (spread through open doors; venting is the only other remedy described). duel/step.ts:L73 (repairPhase only finds d.points) and L80-L81 (extinguishWork only at a point). duel/tuning.ts:L18-L22 (Hound points in O, R and E only). duel/health.ts:L97-L102 (fire damage to every conscious character in a burning room, seated or not). hound.json:L165-L177 (navigation and weapons stations both in room B). · This comes up in ordinary play. A fire that spreads to the Bridge burns both seated officers with no manual counterplay, and B has no airlock. It also changes the duel-fire spec's model, where a player can always put a fire out. · Either give every room an extinguish point, with the same work loop and rates (the room's breach-site tile or a named tile per room), or state explicitly that non-point rooms can only be vented or starved, and add a test for it. Say whether seated characters take fire and low-air damage.

### [P1] R1-F4 Damage-to-bars rule contradicts itself and leaves today's 'level 2 = off' gates in place
'Each damage level removes one usable bar' disagrees with `min(powered, max + overdrive − damage)`. Under the formula, damage removes nothing while powered is below capacity (Weapons at 1 bar with damage 1 stays at 1). Because Room damage is capped at 2, the formula can never take Shields (4), Weapons (3) or Engines (3) to 0. The weapon code, however, still shuts Weapons off at rooms ≥ 2 and indexes the engine factor by damage level. The spec doesn't say whether those gates are removed for the crew ship. The Hunter's lock also switches off Shields at rooms == 2, when the crew may still hold a layer. · spec L51-L54, L44-L45, L61. weapons.ts:L51 (canLaunch needs rooms[Weapons] < 2), L61 (laserOffline = rooms[Weapons] ≥ 2), L111, L130, L151. physics.ts:L63 (flyShip gets rooms[Engines] as the level). weapons.ts:L91 and duel/fire.ts:L51 (damage capped at 2). hunter.ts:L111 (laserLock = crew Shields < 2 ? Shields : Weapons). · One build keeps laserOffline, so damage 2 still kills the laser at 1 bar. Another drops it, so the laser can never be shot out. These are different games. The overdrive slot also makes capacity ambiguous: is it max + 1 always, or only while overdriven? · Define capacity = max + (system ≠ Oxygen ? 1 : 0) − rooms[r]. On a damage rise, if powered > capacity, return the excess bars, overdrive bar first. State that the crew ship's laserOffline, canLaunch, stepBurst and flySlot read effective bars (0 = off), not rooms. State whether damage can ever zero a system; if FTL-like knockout is wanted, consider max − damage × ceil(max/2). Record the Hunter-lock consequence.

### [P1] R1-F5 Shield layer cap at round start halves today's shields and has no rule for shields above the cap
The round-start Shields bars are 2, so the cap = floor(2/2) = 1 layer. Today the crew ship has SHIELD_LAYERS = 2. That contradicts 'the round-start bars = today's level-0 value'. The spec also doesn't say what happens to layers already up when bars drop below the cap: tickWeapons never lowers shields above the layer count. · spec L43, L50, L59-L60. tactical/tuning.ts:L84 (SHIELD_LAYERS = 2). defs.ts:L65 (layers is a class constant). weapons.ts:L158-L159 (shields ≥ layers only resets the clock; nothing strips the excess). · Every round would start at half shields against a Hunter tuned so that duels last 3 to 5 minutes (tuning.ts:L40-L41). Two builds would also differ on whether removing a Shields bar drops a live layer. · Choose and state one: either the round start is Shields 4 (taking from another system), or the cap is ceil(bars/2), or the crew's base layers are 1 by design (note the balance change). Add a rule that when the cap falls below current layers, the excess layers drop at once and the clock resets, and add a test for it.

### [P1] R1-F6 'Today's level-0 value, +25 % per bar, interpolated toward off' is undefined for several tables
The rule assumes every table has a level-0 and a level-2 'off' value. Magazine regen is a single tick constant, unaffected by damage today. The scan rates are scalars with no 'off' value. Oxygen injection has no tactical table at all. For the rest, '+25 %' could be additive or compounding, and 'interpolated toward off' isn't defined: linear in bars, or today's level-1 value? Non-integer results also break the whole-unit convention, for example SHIELD_RATE 3 × 1.25 = 3.75. · spec L57-L60, L65-L66. tactical/tuning.ts:L45 (ENGINE_FACTOR [1, 0.6, 0]), L76 (LASER_CHARGE_RATE [40, 25, 0], whole units), L88 (SHIELD_RATE [3, 2, 0]), L92 (MAGAZINE_REGEN_TICKS 2700 scalar), L135-L136 (SCAN_RATE_SCIENCE 5 / OTHER 2 scalars). weapons.ts:L160-L161 (the magazine clock is ++ per tick, not rate-indexed). · Two builds produce different rates at 1, 3, 4 and 5 bars. Weapons at 1 bar would be 20 (linear) or 25 (today's level 1). The magazine and scan tables can't be built from the rule as written. · Write the start tables out in the spec: one row per system, one column per effective bar 0..max+1, with integer units. For the magazine, convert to a rate (units per tick against a units threshold) and give its column. Give scan rates per Sensors bar for both the Science console and Helm/Weapons. Say 'additive: base × (1 + 0.25·(bars − start))' and 'below start: base × bars/start'.

### [P1] R1-F7 Life Support reuse is false: lifeSupportInjection reads the sector LS station, not duel bars, and fills every room
§4 says Life Support '(room L)' injects at a rate set by the duel Oxygen system's effective bars. The existing lifeSupportInjection takes its rate from the sector LifeSupport station's stationOutput (level / STATION_MAX × skill curve, plus a seated bonus) and injects into every room in proportion to its volume, not into room L. The spec gives no level-0 rate for the Oxygen bars to start from. · spec L47, L84-L85. hazards/lifeSupport.ts:L9-L12 (out = stationOutput(LS); inj[r] for every r). stations.ts:L13-L16 (stationOutput = level/STATION_MAX × skillCurve). hound.json:L196-L200 (LS allocation 1). sim/tuning.ts:L50 (STATION_MAX LS = 3), L58 (INJECT_FRAC). · An implementer who reuses the function gets a rate that never changes with the HUD. One who writes a new function must choose between injecting only into L and spreading by volume, which changes how fast distant rooms recover, the core of question 1. · Specify a duel injection: inj[r] = INJECT_FRAC × V[r] × HAZARD_DT × OXY_FACTOR[effective Oxygen bars], with OXY_FACTOR given (for example [0, 0.75, 1.0]), into every non-venting room (or only L, say which). State that it bypasses stationOutput and the seated bonus.

### [P1] R1-F8 The duel interior draws a seeded run quirk that the reused hazard code obeys
createSimState always draws run.quirk from the seed, and createDuel passes no override. The reused code reads that quirk: oxygenStep multiplies closed-door leak by quirkPassageMult (Leaky Seals), and doorSystem stretches the close delay by quirkDoorDelayMult. If heat.ts is ported literally, quirkHeatRise adds to heat rise. The spec never mentions quirks. · spec L72-L76, L80-L83, L101-L102. state.ts:L138 (run.quirk = nextInt(rng.quirk, QUIRK_COUNT)). duel/state.ts:L82 (createSimState(layout, crew, seed, ...) with no options). oxygen.ts:L54. doors.ts:L95. heat.ts:L47. quirks.ts:L14-L17. · Some duel seeds would get leakier doors or slower auto-close, and maybe faster overheating, with no indication to players. That skews the feel answers and the seed-sweep comparisons in the report. · Have createDuel force a neutral quirk (a SimOptions value the hooks treat as none, or a new 'none' quirk). Alternatively state that quirks apply and show them on the HUD. Add a test that the duel's quirk hooks are neutral.

### [P2] R1-F9 Heat port quietly changes heat.ts rules and leaves fire heat, coolant wrap and Sensors' room open
The spec says the heat rules 'come from heat.ts' but changes them. heat.ts's overheat resets heat to 0 immediately, whereas the spec makes a failed system cool from HEAT_MAX at 'HEAT_COOL_IDLE plus its coolant', a rule heat.ts doesn't have. The spec doesn't say whether fireHeat (a burning room heats its stations) is ported. It doesn't say whether a coolant click with an empty pool wraps to 0 or is rejected, and its reasons list doesn't cover coolant. Sensors 'can overheat' and 'roll to set its room alight', but Sensors has no room on the Hound. · spec L67-L73, L118, L128-L129, L55-L56. heat.ts:L37-L40 (overheat: failStation, heat = 0, one draw), L47-L49 (coolant only while overdriven; fireHeat added), L28-L34 (cycleCoolant wraps to 0). duel/tuning.ts:L18-L22 (only Weapons→O, Shields→R, Engines→E have rooms). · These are rule differences a builder has to guess. Two builds would differ on recovery time after an overheat, on fire-driven overheats, and on which room a Sensors overheat ignites. · State the duel heat rules outright: on overheat, does heat stay at HEAT_MAX and then fall by HEAT_COOL_IDLE + coolant × HEAT_COOL_UNIT per hazard tick? Is fireHeat in or out? Does coolant wrap 0→1→2→0, skipping a step the pool can't supply, with result 'applied', or is it rejected 'unavailable'? Name each system's room (Sensors → O, Oxygen → L).

### [P2] R1-F10 Ship-view authority is a UI rule written as a sim rule; power and coolant authority unstated
§5 says the commands are accepted 'from any player whose screen shows the ship view'. The sim can't know that, and the next sentence reduces it to 'conscious and present'. That rule is given only for door and airlock. §6/§7 add power and coolant without saying who may send them. Seated players without the SHIP tab open could still send them online. · spec L104-L106, L112, L127-L129, L148. ui/views.ts:L21 (the HUD is shown when standing or console.station 'ship', a client-only notion). duel/step.ts:L32 (DUEL_KINDS must list the new kinds for stepDecided to answer duel-decided). duel/step.ts:L142. · The rule is implementable only as 'any present, conscious player, any seat'. Saying so removes a disagreement between §5 and §7. Implementers also need to know that power commands follow the same rule and what the decided-round answer is. · Rewrite as: sim rule, `power`, `coolant`, `door` and `airlock` are applied for any valid, present, conscious player, seated or standing, with no range check; UI rule, the HUD (and so the commands) appears only in the ship view. List the four kinds in DUEL_KINDS (duel-decided after the round ends). Give the full reason order (stale-tick → malformed → unavailable → noop).

### [P2] R1-F11 Breach patching: work precedence, storage and roll order undefined
Patching uses 'the same work loop as putting out a fire', but repairPhase gives each player one point per tick. The spec doesn't say which wins when a player is in reach of a burning or damaged point and a breach site at once. It doesn't say where patch progress is stored or in what units. It doesn't say whether a hit's fire roll or breach roll draws first from rng.hazards. · spec L86-L89. duel/step.ts:L73-L76 (one point per worker, the first match). duel/fire.ts:L36-L38 (one rng.hazards draw per qualifying hit). hazards/breach.ts:L4-L14 (breaches.active/repair). hound.json:L135-L158 (sites O [10,4], R [4,13], E [4,1], separate tiles from the repair points). · Two builds would split work differently and order the draws differently, so their goldens diverge. · State that breaches.repair holds progress as a 0..1 fraction of DUEL_EXTINGUISH_UNITS, and fix a precedence (fire > breach > repair for a worker in reach of more than one). State that per hit, the fire roll comes first and then the breach roll, both on rng.hazards, and that a breach roll picks the room's single site (the Hound has exactly one per room).

### [P3] R1-F12 Door and airlock reuse silently depends on the sector Doors station staying online
doorSystem runs doorsFailSafe first. With the sector Doors station offline, it closes every airlock and returns every held-open door to Closed each tick. The duel keeps that station at its allocation of 1 and never fails it, so this works today, but the spec doesn't state the dependency, and 'Doors power' is listed as out of scope. · spec L101-L107, L156. doors.ts:L68-L81 (doorsOnline via stationOnline of the Doors station), L85. hound.json:L190-L195 (doors station, allocation 1). stations.ts:L8-L9. · A later change that touches sector station levels in the duel would silently disable remote doors and airlocks. · State that the duel keeps the sector Doors station at its layout allocation and never fails it, or have the duel call a variant of doorSystem without the fail-safe. Add a test that an airlock stays open across ticks.

## Verified
- The duel never calls the sector step. Hazards, doorSystem and heat don't run in the duel today: duel/step.ts:L1-L2, L262-L272.
- createDuel holds every door open (duel/state.ts:L84), so dropping that is a one-line change, as spec L102 implies.
- Oxygen, fire, fireRepair, breaches, airlocks and door state live in the interior SimState that interiorModule flattens (duel/modules.ts:L72-L89; oxygen.ts and fire.ts write state.rooms, state.breaches and state.airlocks). So spec L130 is plausible: no new field is needed for them.
- heat.ts numbers match spec L69-L70: HEAT_MAX 240, HEAT_RISE 2, HEAT_COOL_UNIT 1, HEAT_COOL_IDLE 4 (sim/tuning.ts:L77-L80). Two coolant units hold the rise level (2 − 2·1 = 0, heat.ts:L47). COOLANT_POOL is 4 (tuning.ts:L81), so spec L68 is right to call 8 a change.
- heat.ts and power.ts are keyed by sector StationKind (power.ts:L28-L30 via run.upgrades and STATION_MAX), so spec L74-L76's choice of a separate duel power module is justified.
- Effective bars can't go negative under the spec's formula: Room damage is capped at 2 (weapons.ts:L91, duel/fire.ts:L51), and the smallest max with damage is Weapons/Engines at 3.
- The Hound has breach sites in every room, including the repair rooms O, R and E, and airlocks in H and L (hound.json:L123-L163, L221-L230), matching spec L86-L87 and L96.
- The ship-view HUD hook exists for standing players or console.station 'ship' (ui/views.ts:L21), and the SHIP tab exists (ui/duel/TabStrip.tsx:L8).
- Every new round is a fresh createDuel (duel/step.ts:L107-L117), so 'start of every round' bars (spec L50) fit the existing round reset if the power state lives on DuelState.
- oxygenStep's LS XP and the sealed-door skill lookup are inert in the duel: sits are allowed only at the role consoles (duel/step.ts:L170-L172), so the LS and Doors occupants are −1 (oxygen.ts:L15-L17, L120-L121), and Sealed is out of scope.

## Not verified
- The '~2 s' airlock vent time (spec L96). It depends on the Hound's derived room volumes and kEff (ship/derived.ts:L90-L91), which I didn't read in full. A rough estimate with kEff = 6 and V ≈ 20 gives ~2.5 s to 10 % air.
- Whether canonicalFields/flatten include doors.closeTimer, breaches.repair and airlocks.open for the Hound. I inferred this from the module comments and didn't read canonicalFields.ts.
- The duel-app smoke, the goldens, and the snapshot-size measurement path. These are outside the manifest.
- The three convention specs (destructible-asteroids spike, duel-fire design, CRT map design). I didn't open them; I took the CRT and fire conventions from the code comments.

---

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

---

# Round 2 (delta, reviewing 86fafcec, effort medium, 150 s, 605450 in / 534460 cached / 14604 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 Bars live in a DuelState module, but every gate that must read them takes only TacticalState and indexes by rooms
§2 says ship 0's laserOffline, canLaunch, flight, laser charge, magazine and shields read the tables by bars, and §7 puts the bars in a new DuelState module `power`. Every function that must change takes a TacticalState and reads `systems[i].rooms[...]`: canLaunch, laserOffline, tickWeapons' chargeRate and shield rate, flyShip through physics, and predictFlight. The spec doesn't say how ship 0's bars reach the tactical state: a field on systems[0], an argument to stepDuel or ShipInput, or a copy each tick. It also leaves out predictFlight. That function runs flyShip with the damage level, and the sim's scripted pilot uses it through predictPath, so the Helm's predicted path and the bot would fly with the wrong engine factor. Tactical commands are admitted in step 1 (canLaunch(d.tactical, 0)), before the power commands in step 2, and the spec never says which bars that admission reads. · spec L63-L67, L205-L206, L212-L217. weapons.ts:L51 (canLaunch reads rooms[Weapons] < 2), L61 (laserOffline), L154-L155 (chargeRate[rooms[Weapons]]), L159 (shields.rate[rooms[Shields]]). physics.ts:L63 (flyShip(..., rooms[Room.Engines], ...)). predict.ts:L31-L34 (engines = rooms[Engines], fed to flyShip). duel/scripted.ts:L87 (predictPath, used by the sim's scripted pilot). duel/step.ts:L200 (canLaunch admission before any new power phase), L268 (stepDuel(d.tactical, crew): no DuelState). · Where the bars live decides the snapshot and hash layout, and the duelModules test has to cover it. One build might store bars on TacticalState.systems[0] and leave the `power` module half-empty. Another might pass bars through ShipInput. Their goldens would differ, and so would their behaviour when a missileLaunch and a Weapons −1 arrive in the same tick. A prediction or scripted pilot left on rooms would quietly desync from the flown path. · Say exactly how ship 0's effective bars reach the tactical code. For example, the tactical system state gains `bars: number[5]`, which the duel writes from `power` before step 1, or stepDuel gains a bars argument. Then list every reader that switches to bars: canLaunch, laserOffline, tickWeapons charge and shields, flyShip in physics, predictFlight/predictPath, and the scan rate. Say that step-1 admission reads the bars as they stood at the start of the tick.

### [P1] R2-F2 The capacity update runs before fire damage, contradicting 'excess bars return at once'
§2 says that when capacity falls (damage rises or the system fails), the excess bars return at once. §7 runs the capacity update at step 8, but firePhase's damage cadence, which also raises a tactical Room, comes later at step 10. A fire-damage rise therefore leaves powered bars above capacity until the next tick's step 8. Meanwhile, the next tick's step-1 admission (canLaunch) runs against those over-capacity bars, and so would stepDuel if the update didn't run first. The spec doesn't say whether repair (step 3) or the overheat at step 11 triggers the same update. · spec L58-L60 ('the excess bars return to the reactor pool at once'), L218-L221 (8 capacity update, then 10 firePhase damage cadence). duel/fire.ts:L51 (the damage cadence does rooms[p.tacticalRoom]++). spec L107 (overheat returns bars, at step 11). · Two implementers would either enforce capacity wherever damage changes or only at step 8. Those give different bars for one tick, and different missile admission on the next tick. The goldens diverge on any seed where a fire's damage tick lands. · Define capacity enforcement as a function, `clampToCapacity`, called right after every change to damage or failure: after stepDuel (step 6/7), after the firePhase damage cadence (step 10) and at overheat (step 11). Alternatively, move the single capacity update to after step 10 and state that overheat clamps inline.

### [P2] R2-F3 The scan rate per Sensors bar is fixed when the scan starts; the spec doesn't say when the table is read or what 0 bars does to a scan
The rate table gives Science and Helm/Weapons scan rates per Sensors bar, with 0 at 0 bars. scanCommand stores the rate in t.scan.rate when the command is applied, so a later Sensors change doesn't touch a scan already running. At 0 bars, a contactScan would start a scan at rate 0 that never progresses, with result 'applied'. The spec doesn't say whether a bar change updates a running scan, or whether a scan at 0 bars is rejected (`unavailable`) or paused. · spec L81-L82 (scan rows), L63-L64. tactical/science.ts:L12-L20 (s.rate set once; same-level re-scan is noop unless the rate is higher). duel/step.ts:L248 (rate chosen at admission from SCAN_RATE_SCIENCE/OTHER). · Two builds would split here: one rereads the rate every tick, the other freezes it. That changes scan times whenever Engineering moves Sensors bars, which is exactly the trade-off the spike is meant to test. · State that the scan's per-tick progress reads the table at the current Sensors bars every tick, so s.rate becomes the station's base or is recomputed each tick. Also state that a contactScan with Sensors at 0 bars is rejected `unavailable`, or that it starts and pauses. Pick one.

### [P2] R2-F4 Fires in non-point rooms, spread ignitions and breaches have no event shape
Today's fireWork, fireOut and fireStart events carry `room` as a tactical Room index (0..2). §4 adds firefighting in B, Q, M, L and H, fire spread through fireStep, breach rolls and patching. None of these has a tactical Room, and the spec defines no events for them. The HUD's breach and fire icons and any cues need to know which room changed. · spec L143-L153. duel/step.ts:L76 and L81 (events keyed by point.tacticalRoom). duel/fire.ts:L38 (fireStart room: e.room, a tactical Room). hazards/fire.ts:L35-L36 (spread ignition pushes no event). · Implementers would each invent different event kinds and fields, or emit none. Events are part of the step's output that tests and the app read. · Add events keyed by interior room index, for example fireWork, fireOut and fireStart with `interiorRoom`, plus breachStart, breachWork and breachPatched. Say whether spread and overheat ignitions push fireStart. Or state that the HUD reads state only and these rooms push no events.

### [P3] R2-F5 The overheat draw's consumption when the room is already burning, and the order across systems, are unstated
§3 says 'One rng.hazards draw at OVERHEAT_FIRE_CHANCE ignites its room if that room isn't burning'. That reads two ways: skip the draw when the room is burning, or always draw, which is what heat.ts does ('draw always consumed'). It also doesn't say in what order several systems overheating on the same hazard tick draw. Weapons and Sensors share room O. · spec L107-L108, L226. heat.ts:L40 (draw always consumed; no-op if burning), L46 (ascending index). · Either reading changes the rng.hazards stream, and so the goldens. · Say 'the draw is always consumed, in ascending system index (Shields, Weapons, Engines, Sensors)'.

## Prior findings
- R1-F1: still open — §7 now gives a numbered order and the hazard cadence (tick − baseTick) % HAZARD_EVERY, which is correct. But steps 9 and 10 put the hit fire/breach rolls before firePhase's damage cadence, while today's firePhase applies the damage cadence first and then igniteFromHits (duel/fire.ts:L45-L54; duel/step.ts:L270). So 'the rest is today's order' (spec L210) is false. A room ignited on a cadence tick would be damaged at once under the spec's order and not under today's. Either restore today's order (10 before 9) or state the change. The capacity-timing problem in the same list is raised as a new finding.
- R1-F2: resolved — spec L143-L148: fireStep is the only growth/shrink/spread rule, DUEL_FIRE_GROW is dropped, and the 20%/10% hysteresis is correct (hazards/fire.ts:L28-L29). Closed-door spread is 0.05× (passageFor oxygen.ts:L14, PASSAGE_CLOSED tuning.ts:L19). The §8 test is statistical.
- R1-F3: resolved — spec L149-L151: rooms without a point are fought at their breach-site tile. hound.json:L123-L163 has exactly one site per room for all eight rooms, and seated damage is stated.
- R1-F4: resolved — spec L53-L67: capacity = max(0, slots − damage × ceil(slots/2)) gives 5/2/0 and 4/2/0. Excess returns with the overdrive bar first, ship-0 gates read bars, and the Hunter lock (hunter.ts:L111) is recorded. How the bars reach the tactical code is raised as a new finding.
- R1-F5: resolved — spec L76, L85-L88: the 1-layer round start is stated as deliberate, the drop of layers above the cap and the clock reset are stated, and there is a test at L234.
- R1-F6: resolved — spec L74-L91: an explicit table for every system and bar count. The magazine units clock of 10800 at 4 per tick = 2700 ticks matches MAGAZINE_REGEN_TICKS. The oxygen factor at 0.5 × INJECT_FRAC 0.06 = 0.03/s matches tuning.ts:L58. When the scan rate is read is raised as a new P2.
- R1-F7: resolved — spec L128-L131: the duel injection INJECT_FRAC × V × HAZARD_DT × OXY_FACTOR into every room, with oxygenStep's clamp and venting skip (oxygen.ts:L111-L117).
- R1-F8: resolved — spec L120-L122: quirk 3. quirks.ts:L18 shows quirk 3's only hook is quirkDebrisHullOffset (debris.ts only). SimOptions.quirk exists (state.ts:L104, L139).
- R1-F9: resolved — spec L101-L111: explicit per-hazard-tick rules, failed cooling (240/1 per 5 ticks = 20 s, 240/3 ≈ 6.7 s), fire heat out, the coolant wrap, and a room per system (L42-L48). The overheat draw's consumption is raised as a new P3.
- R1-F10: resolved — spec L170-L172 (UI rule) and L189-L203 (sim rule: four kinds in DUEL_KINDS, then the reason order stale → malformed → unavailable). stepDecided answers duel-decided for any DUEL_KINDS member (duel/step.ts:L142).
- R1-F11: resolved — spec L132-L139, L152-L153: breaches.repair as a whole-unit fraction (breach.ts:L4-L14 resets it), precedence fire > breach > repair with ties to the lowest room, the fire roll before the breach roll, and a single site per room.
- R1-F12: resolved — spec L163-L165: the Doors station is kept online, so doorsFailSafe never fires (doors.ts:L75-L81), with a 600-tick airlock test. The duel toggle avoids cycleDoor's Sealed path (doors.ts:L60-L65).

## Verified
- Today's duel step order and firePhase internals: duel/step.ts:L262-L271 and duel/fire.ts:L45-L54 (growth and damage first, then igniteFromHits).
- fireStep's hysteresis and spread: hazards/fire.ts:L23-L38. passageFor gives PASSAGE_OPEN for open doors and non-door edges and PASSAGE_CLOSED 0.05 for closed doors: oxygen.ts:L10-L19, tuning.ts:L19.
- The quirk hooks: quirks.ts:L15-L18. Only quirk 3 changes debris, and the override is applied after the draw (state.ts:L138-L139).
- The heat constants match the spec: tuning.ts:L77-L83 (HEAT_MAX 240, RISE 2, COOL_UNIT 1, COOL_IDLE 4, OVERHEAT_FIRE_CHANCE 0.5). HAZARD_EVERY = 5 gives 12 Hz (tuning.ts:L4-L5).
- INJECT_FRAC 0.06, so 0.5 × 0.06 = the 0.03/s stub (tuning.ts:L58). O2_DAMAGE is 6 (tuning.ts:L34).
- The Hound has one breach site in each of B, Q, O, M, L, E, R and H (hound.json:L123-L163), airlocks in H and L (L221-L230), and the Doors station at allocation 1 (L191-L195).
- activateBreach and repairBreach exist and reset breaches.repair (hazards/breach.ts:L4-L14).
- doorSystem's fail-safe and HeldOpen handling: doors.ts:L75-L100. cycleDoor passes through Sealed: doors.ts:L60-L65.
- Every tactical reader of rooms[] is listed (weapons.ts:L51, L61, L154-L159; physics.ts:L63; predict.ts:L31; missiles.ts:L93; hunter.ts:L67-L75, L111).

## Not verified
- Whether opening the doors between a burning room and a venting airlock room actually drives its air below 10 % while Life Support keeps injecting into the burning room (spec L154-L155). roomVenting only skips rooms with their own breach or airlock (oxygen.ts:L28-L33). Checking this needs a sim run.
- Whether the Cutter layout still runs duels (DUEL_REPAIR_POINTS includes cutter, duel/tuning.ts:L24). If it does, the spec's Hound-only room table and its 'one breach site per room' claim would need a Cutter mapping. I didn't read the Cutter layout.
- Whether the sector movementSystem lets crew pass auto (Closed) doors the way the sector game does, now that createDuel stops holding them open. I didn't read movement.ts, since it is outside the touched regions.

---

# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `86fafcec`. 6 accepted (5 new, 1 reopened), 0 rejected, 0 deferred. R1-F2 to R1-F12 are confirmed resolved.

## R1-F1 [P1]: No step order or hazard cadence (reopened)

Confirmed. duel/fire.ts:L45-L54 applies the damage cadence before igniteFromHits. §7 step 8 now keeps today's firePhase order (the damage cadence, then the per-hit fire roll) and adds the breach roll after the fire roll. The steps are renumbered 1 to 10.

## R2-F1 [P1]: Bars in a DuelState module, but the gates take TacticalState

Confirmed (weapons.ts:L51, L61, L154-L159; physics.ts:L63; predict.ts:L31). The bars now live in `ShipSystems.bars`, a canonical `ship` module field, so the tactical readers get them from the state they already take. §2 lists every ship-0 reader, including predictFlight and predictPath, and says the step-1 admission reads the bars as they stood at the start of the tick. The `power` module keeps heat, coolant and failed (§7).

## R2-F2 [P1]: The capacity update runs before fire damage

Confirmed. §7 defines `clampToCapacity`, which runs at the end of step 8 (after the damage cadence and the hit rolls) and inline at each overheat. Repair only raises capacity. §8 has a same-tick clamp test.

## R2-F3 [P2]: Scan rate fixed at the scan's start

Confirmed (science.ts:L12-L20 stores the rate, and L49 adds it). §2 now has a Scans rule: progress is read from the table each tick at the current Sensors bars, using the Science row or the other row by `by`. The scan pauses at 0 bars, and contactScan at 0 bars is `unavailable`. §8 has a test.

## R2-F4 [P2]: New fire and breach cases have no event shape

Confirmed. The spike adds no events for them. §4 Events says the HUD reads the interior state each frame, and the only new event is crewHurt 'air'.

## R2-F5 [P3]: Overheat draw consumption and order

Confirmed (heat.ts:L40). §3 says the draw is always consumed, in ascending system index, and that a second roll in room O is a no-op once the room is lit.

## Also changed

- §8 gains three tests: the prediction matches the flight, scan bars, and the same-tick clamp.

## Files changed

- docs/superpowers/specs/2026-11-18-engineering-spike-design.md

<!-- end -->

---

