# Codex review exchange: engineering-spike-i-sim-plan

Subject: `docs/superpowers/plans/2026-11-18-engineering-spike-i-sim.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing a3538f12, effort high, 822 s, 15461397 in / 15119241 cached / 65262 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Closed doors stop the scripted pair's BFS, so scripted golden, oracle and gate runs degenerate and duelScripted crashes
Task 6 makes every door start Closed and stops filling HeldOpen. The scripted pair plans its walks with bfsPath, which treats a Closed door tile as solid. No task changes that. On the Cutter, which runDuel, the duel golden, the rematch golden and the oracle all use, every spawn is in room U. Navigation is in B, behind several doors. Player 0's path to B comes back null, so walkTo returns NO_HELD and the Helm is never manned. Only the U–W door, which player 0 happens to stand within DOOR_ZONE of, ever opens. Repair and Medbay walks across other doors fail the same way. The Valkyrn pilot walks with the same walkTo. · plan L112 (Decision 14), plan L1369-1384 (Task 6 Step 3); src/renderer/src/sim/duel/scripted.ts:L158-L182 (bfsPath uses solidAt; the comment at L160 says 'doors are held open in the duel'); src/renderer/src/sim/grid.ts:L14-L21 (solidAt: a door edge is solid unless doorIsOpen); cutter.json:L533-L550 (all spawns in U) and L470 (navigation in B); tests/duelScripted.test.ts:L35 (`bfsPath(...)!` then `for (const next of path)`, which throws a TypeError on null); scriptedPilot.ts:L18, L129-L133 (the pilot uses walkTo). · Task 12 would bless goldens where the bot crew never flies, and the report's gate table would measure a crew that can't reach its consoles. The fallout rule (plan L48-L52) gives executors no class for this. duelScripted crashes, which counts as a 'bug: fix the sim code' with no guidance on the fix. Two executors would fix it differently, or file it as kind (b)/(c). · Add a step to Task 6. Make the bots' path planning treat door tiles as walkable whatever their state, because auto doors open within DOOR_ZONE once movement brings the crew next to them. For example, use `derived.wallTile[i]` (plus bounds) in bfsPath and goalTiles instead of solidAt, and update the L160 comment. Then add a test: on the Cutter with closed doors, an unseated scripted pair reaches Navigation and Weapons within N ticks.

### [P1] R1-F2 The scripted Valkyrn pilot still asks for throttle 4, and Decision 16 only clamps scripted.ts
After Task 8 the start cap is 3 (Engines 3 bars), and the step refuses a throttle above the cap with `unavailable`. scriptedPilot.ts sends THROTTLE_MAX from four places and pushes the command whenever the level differs from d.throttle. runValkyrnDuel calls requireApplied, which throws on any non-applied result, and scriptedPilot.test.ts asserts every result is applied. Task 8 Step 7 clamps only the scripted pair's level. · plan L114 (Decision 16), plan L2079-2094 (Task 8 Step 7, scripted.ts only), plan L2070 (throttle above cap is unavailable); src/renderer/src/sim/duel/scriptedPilot.ts:L79, L86, L92, L104, L139; tests/helpers/valkyrnGate.ts:L34 (requireApplied); tests/helpers/scriptedDuel.ts:L39-L46 (throws on any non-applied status); tests/scriptedPilot.test.ts:L25. · The Valkyrn gate in tests/duelGates.test.ts:L50 and scripts/valkyrn-telemetry.ts throw instead of failing a band, so the fallout rule's kind (c) skip doesn't fit. scriptedPilot.test.ts fails. The executor has to invent the fix. · In Task 8 Step 7, also clamp the pilot. Have `levelOf`, or the `flight()` result, apply the same `throttleAllowed(sys, wanted) ? wanted : wanted > 0 ? throttleCap(sys) : 0` rule before the `f.level !== d.throttle` check at scriptedPilot.ts:L139. Add tests/scriptedPilot.test.ts and tests/duelGates.test.ts to Task 8 Step 8's run list.

### [P1] R1-F3 tests/duelModules.test.ts's hash-coverage helper doesn't flip pewTargeted, so the test fails after Task 9b
The test 'every space, ship, science, presence and repair field changes the duel hash' changes each field's first value with changedFirst. That helper flips only the flags its regex names. Everything else gets v+1. pewTargeted becomes a flag field in Task 9b (FLAGS), and on the crew slot it is true at the start and stays true. Writing 2 into a flag() field stores `2 !== 0`, which is true again, so the hash doesn't change and the assertion fails on 'ship.systems.0.pewTargeted'. Task 9b neither updates the regex nor runs duelModules.test.ts. · plan L2561 (pewTargeted added to FLAGS), plan L2530 (crew pewTargeted starts true), plan L2895 (Task 9b Step 8's run list omits duelModules.test.ts); tests/duelModules.test.ts:L58 (changedFirst regex `active|released|fireHeld|laserTargeted|gunLocked`), L101-L117 (the loop over DUEL_MODULES.slice(0, 5), which includes the ship module); src/renderer/src/sim/module.ts:L32-L33 (a flag write is `values[offset] !== 0`). · Brief item 8: a task leaves a listed coverage test red, and the failure is in the coverage rule itself, not kind (a)/(b)/(c) fallout. · In Task 9b Step 4, add `pewTargeted` to the changedFirst regex at tests/duelModules.test.ts:L58, with a spec §10.3 comment, and add tests/duelModules.test.ts to Step 8's run list. Optionally widen L107's `slice(0, 5)` to cover the new power module as well (see the P3).

### [P1] R1-F4 Task 11's determinism script never applies an engineering command, because both players are away
play() merges passiveInput(d), which sends presence false for both players on tick 0, with the SCRIPT commands. Task 5's admission sends every shipPower, shipCoolant, shipDoor and shipAirlock from an absent player to `unavailable`. So none of the scripted power moves, coolant, held door or airlock ever applies. The test ignores the results and passes, yet it claims that 'heat, venting and spread all run'. · plan L3273-3292 (SCRIPT and play), plan L3256-3260 (the claim); plan L1212 and L1222 (`engineer` requires `d.present[pid] === true`, otherwise `unavailable`); tests/helpers/scriptedDuel.ts:L33-L36 (passiveInput sets both players away on tick 0). · The spec §8 determinism deliverable ('with the new systems running') ends up unproved for overdrive heat, coolant, held doors and airlock venting. These are the paths most likely to break lockstep, and Task 12's report would state a PASS that doesn't cover them. · Keep both players present: use an input with empty held arrays and no presence commands, or the scripted pair. Assert that every SCRIPT command's result is 'applied'. Lengthen the overdrive window, or set coolant 0, so that at least one overheat draw happens inside the 1800 ticks. Also assert that `d.power.failed` or heat reached HEAT_MAX in one seed.

### [P2] R1-F5 Consumers of the beam-only helpers aren't adapted to the dark beam at the start
After Task 9b the beam starts at 0 bars, so laserFull(t, 0) and laserOffline(t, 0), which default to the beam, describe a laser that never charges at the start. The scripted Helm lines up only when `laserFull(t,0) && laserTargeted`, so it never lines up. The gunner only ever re-locks the beam, so pew pew stays on Shields. Telemetry's weaponsIdleTicks reads the beam. The render situation model shows 'WEAPONS OFFLINE' whenever the beam is dark. None of this is listed as a deliberate change. · plan L2655-2658 and L2685-2688 (the defaults are 'beam'), plan L399 (spec §10.3: the beam starts dark); src/renderer/src/sim/duel/scripted.ts:L118, L271, L276; src/renderer/src/sim/duel/telemetry.ts:L161; src/renderer/src/render/duel/situationModel.ts:L46, L187. · The goldens and the report's gate table would measure a bot crew that never aims pew pew, the weapon it actually fires. Between Part i and Part ii, the app would also say WEAPONS OFFLINE at every round start. · Add a Decision. Either have the scripted Helm and gunner treat pew pew as the primary weapon (line up on `laserFull(t,0,'pew') && pewTargeted`; send `laserLock {weapon:'pew'}` when `pewLock !== want`), and have telemetry count either barrel, or explicitly record these as known spike gaps in the report and hand situationModel to Part ii.

### [P2] R1-F6 The derelict's Shield loot is silently cancelled by the bar cap
applyLoot (Loot.Shield) raises crew shields to at most class layers + 1, 'one layer over the class layers'. Task 3's crew shield block then drops any layers above min(class layers, SHIELD_LAYERS_BY_BARS[bars]) on the next tick, so the loot's extra layer disappears at once. Decision 6 mentions the +1 validator bound but not that the loot is lost. · plan L588-593 (Task 3: `if (s.shields > cap) { s.shields = cap; ... }`), plan L104 (Decision 6); src/renderer/src/sim/tactical/science.ts:L74 (`sys.shields = Math.min(c.shields.layers + 1, sys.shields + 1)`). · This is an undocumented gameplay deviation in a spike whose report is meant to say what changed. A Shield-loot derelict becomes worthless. · Either cap at `cap + (shields above class layers granted by loot)`, for example by letting the crew keep a layer above the cap only while `shields > c.shields.layers`, or add a Decision saying the Shield loot is nullified in the spike and note it in the report.

### [P3] R1-F7 Some quoted edits and line numbers don't match the source text
Task 6 Step 5's comment replacements quote text that runs across line breaks and `//` / ` *  ` prefixes in the real files, so a literal search won't find them. Task 2 Step 6 cites lines 121-122 of tacticalDeterminism.test.ts, but the comment is at L122 and the `2 * 37` is at L123. Task 4 cites duelModules 'Line 40' for duelNames, which is at L42. · plan L1446 vs src/renderer/src/sim/duel/fire.ts:L2-L4; plan L1450 vs src/renderer/src/sim/duel/tuning.ts:L34-L35; plan L512 vs tests/tacticalDeterminism.test.ts:L122-L123; plan L962 vs tests/duelModules.test.ts:L42. · These are comment and line-number nits. The plan does say to match edits by quoted text, but these quotes aren't literal. · Quote the comment text with its real line breaks and prefixes, or describe the edit ('reword the header comment to …'), and correct the cited line numbers.

### [P3] R1-F8 Task 4 knowingly leaves a touched test red, and the hash test doesn't cover the power module
Task 4 Step 8 expects duelCheckpoint to fail until Task 5, which contradicts the Global Constraint that every task's listed touched tests are green. The duelModules hash-movement loop covers only DUEL_MODULES.slice(0, 5), so the new power fields are never checked field by field. · plan L88, plan L974; tests/duelModules.test.ts:L107. · The constraint is inconsistent, and the new module has a coverage gap. · Either move the duelCheckpoint example additions into Task 4, or exempt it explicitly in L88. Extend the loop to every non-interior module (`DUEL_MODULES.filter(m => m.module.id !== 'interior')`).

## Verified
- Bless rules: blessGuard.ts:L26-L27 allows a same-version bless with no proofs. Task 1's 53→54 bump goes through verify and the duel oracle. MIGRATIONS has no entry for 53 (duelOracle.ts:L90-L116), so the alias plan is identity, and Task 1 adds no fields, so the version-only bump holds. Task 12's same-version bless is allowed. bless-golden.ts:L51-L63 runs runDuel and runRematch, both of which call requireApplied.
- Task 2's quoted edits match the source: state.ts:L67-L68 (gunShots/gunHits plus the closing brace), L175 (systemsFor's first line), L178-L180, L184-L185; hash.ts:L121 (gunRoomWear vector), L230-L231 (systemsRules tail), L194 (the clone's systems map). The ship field count of 37 per slot, giving 42/45/51, checks out (SYSTEMS_HEAD 3 + rooms 3 + TAIL 28 + gunRoomWear 3).
- No import cycles: bars.ts imports only `type ShipSystems`; state.ts already imports hash.ts (L10); power.ts, engines.ts, weaponSlots.ts, sensors.ts and hazards.ts import only `type DuelState`; science.ts imports nothing from weapons.ts (science.ts:L4-L7).
- The validator error for an out-of-range bar names the field ('duel snapshot tactical systems.0.bars: out of range'), so engBars' /systems\.0\.bars/ matches (hash.ts:L256, L265).
- Task 3's quoted shield lines match weapons.ts:L169-L170. The shield tables give a 1-layer start (SHIELD_LAYERS 2, SHIELD_LAYERS_BY_BARS[2] = 1).
- Task 4: the createDuel return line matches state.ts:L110; StationKind.LifeSupport exists (stationKinds.ts:L2); the Hound's points give systemRooms R, O, E, O (Science in O), L (hound.json:L165-L207, duel/tuning.ts:L18-L22). The snapshot's quoted offset line matches snapshot.ts:L149 and the held-heading check matches L178. The heat numbers match tuning.ts:L77-L83, so +2/+1/0, −4 and the failed cooling of 237 are right. chance is `nextFloat < p` (shared/rng.ts:L24-L26), so the probe test holds.
- A rematch rebuilds the duel through createDuel (step.ts:L125), so power, systemRooms and the bars reset every round.
- Task 5: the codec quote (rematch then setPaused) is unique at codec.ts:L126-L127; contracts.ts:L96-L97 matches; the duelCheckpoint examples are at L143; COMMAND_REASONS contains every reason the power module names (contracts.ts:L104-L108); stepDecided answers duel-decided for anything in DUEL_KINDS (step.ts:L159).
- Doors fail-safe: every duel layout has an online Doors station at allocation 1 (hound.json:L190-L195; cutter, valkyrn and skiff have one too), and stationOnline is failed == 0 and level > 0 (stations.ts:L8-L10). So doorSystem's fail-safe never fires, as spec §5 requires.
- Task 6: the quoted lines match step.ts:L294-L295 and L297, duel/state.ts:L93-L95 and fire.ts:L10-L12; createSimState takes `options.quirk` (state.ts:L104, L138-L139); the quirk 3 hooks are neutral (quirks.ts:L15, L17). The E room's only edge is edge 0 (hound.json:L65-L72), so the fire-spread draw test makes one draw per fireStep.
- Task 7: activateBreach and repairBreach exist (breach.ts:L4-L14); derived.siteTile and siteRoom exist (derived.ts:L15, L56); inReachOfTile uses REACH 1.5 to the tile square, so the O, Q and R site tiles are within reach of the placed positions; the healthPhase quote matches health.ts:L101-L103.
- Task 8: the physics.ts quotes (L29, L33, L61-L64) and predict.ts quotes (L5, L31, L34) match; every class's engineFactor[0] is 1 (tactical/tuning.ts:L45, defs.ts:L90); the scripted.ts:L319 quote matches.
- Task 9b keeps the Hunter byte-identical. The non-crew paths of tickBarrel, stepBurst, fireLaser, shoot, canLaunch and the magazine reduce to today's code (weapons.ts:L118-L125, L160-L172). barrelShots gives the Hunter HUNTER_LASER_SHOTS = 1 (tactical/tuning.ts:L82). The torpedo levels rule for a non-crew owner (min(2, room + 1)) equals today's `if (< 2) ++` (missiles.ts:L93).
- Task 9b fields: SYSTEMS_TAIL and FLAGS quotes match hash.ts:L21-L24. Clone coverage holds: the scalar pew fields are spread and then rewritten, and the bars and weaponPower vectors get fresh arrays. Validator rules exist for every new field, and the Hunter's slot holds zeros.
- Task 9b step.ts quote matches L216-L218; the contracts laserLock and laserCharge lines match L79 and L82; the codec lines match L117 and L119.
- Task 10: the gates read start-of-tick state, and scriptedInput is built from the same state before stepDuelTick. The gunner returns before any lock when the target is unseen, so it never sends a refused laserLock or torpLock. The scripted pair sends no contactScan or designate. The quoted designate and contactScan lines match step.ts:L258-L259 and L267, and the scanStep lines match science.ts:L49-L50.
- Step order and rng.hazards order (spec §7 L246-L261) are implemented in this order: ship commands after the Sci-1 loops; clampThrottle; repairPhase; movement; doorSystem; stepDuel; applyHitDamage; firePhase (cadence, then the fire and breach rolls); clamp; the hazard tick (injection, oxygenStep, fireStep with its spread draws, duelHeatStep with its overheat draws, then Task 10's clamp); healthPhase (fire, then low air).

## Not verified
- Whether the Hound's kEff makes an open airlock vent room L below 10 % within 300 ticks (engHazards). I didn't read derived.ts's kEff computation.
- Whether the 'fire starves below 10 % air within 240 ticks' test holds against the closed-door leak into Q. It depends on kEff, which I didn't compute.
- Whether facing()'s `st.map = {...st.map, asteroids: []}` with the original broad-phase grid is safe for lineOfSight. The plan says it is the weaponsUpdate.test.ts idiom; I didn't open that file.
- I didn't run `npx tsc --noEmit` (I had no shell), so the compile claims come from reading the code: union-key writes in the KEYS table, the narrowing in the `weapon` check.
- Whether render or app code switches exhaustively on crewHurt.cause or on DuelCommand kinds outside src/renderer/src/sim. I didn't grep the app/ and ui/ trees.
- I read cutter.json beyond the manifest, and scriptedPilot.ts, valkyrnGate.ts, scriptedDuel.ts, duelScripted.test.ts, scripts/bless-golden.ts, grid.ts, quirks.ts, interact.ts, breach.ts and defs.ts, to verify findings 1 and 2 and the bless rules.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `1f6dc9ff`. 8 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Closed doors stop the scripted pair's BFS

Confirmed: scripted.ts:L158-L165 uses solidAt, and grid.ts:L14-L21 treats a Closed door as solid. Task 6 Step 7 adds `walkable` (bounds plus wallTile) to goalTiles and bfsPath, updates the comment, and adds a Cutter closed-door test in which the pair reaches Navigation and Weapons.

## R1-F2 [P1]: Scripted Valkyrn pilot asks for throttle 4

Confirmed: scriptedPilot.ts:L79, L86, L92, L104. Task 8 adds `levelWithinCap` and routes both bots through it. Step 8 runs scriptedPilot.test.ts and duelGates.test.ts.

## R1-F3 [P1]: changedFirst does not flip pewTargeted

Confirmed: duelModules.test.ts:L58. Task 9b Step 4 adds it to the regex, and Step 8 runs duelModules.

## R1-F4 [P1]: Determinism script players are away

Confirmed: passiveInput sets presence false. Task 11 keeps the players present, asserts every result is applied, and asserts an Engines overheat in each seed.

## R1-F5 [P2]: Beam-only helper consumers

Confirmed: scripted.ts:L118, L271, L276; telemetry.ts:L161. Decision 20 and Task 9b Step 7b make the bots use pew pew as primary and make telemetry count either barrel. situationModel is handed to Part ii, where it is now in Part ii's plan.

## R1-F6 [P2]: Shield loot cancelled by the cap

Confirmed: science.ts:L74. Decision 21 states that the loot is nullified in the spike, and the report's Known limits lists it.

## R1-F7 [P3]: Quoted edits and line numbers

Confirmed. The line numbers are corrected, and the comment edits that span several lines are described rather than quoted.

## R1-F8 [P3]: A red test between tasks, and hash loop coverage

Confirmed. The Global Constraints exempt duelCheckpoint between Task 4 and Task 5 explicitly, and the hash loop now covers every non-interior module.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-engineering-spike-i-sim.md

<!-- end -->

---

# Round 2 (delta, reviewing f52b8386, effort medium, 236 s, 1765119 in / 1668767 cached / 18893 out)

Verdict: ready with P2s

## Findings

### [P2] R2-F1 Task 11's vent isn't 'away from the Q spawns': the held H–O door and the spawn-held Q–O door put the crew's room on the vented volume
The SCRIPT holds edge 2 open at tick 400 and opens airlock 0 (the Hold) from 420 to 900. The comment says the Hold is 'away from the Q spawns', but the crew's room isn't sealed off. On Hound, edge 2 is the H–O door. Player 0 spawns at (13,7), next to the Q–O door tile (12,7). That puts the crew's centre exactly DOOR_ZONE (1.0) from the door's centre, so doorSystem keeps that auto door Open the whole run. H, O and Q (about 65 tiles) therefore drain through AIRLOCK_PASSAGE = 3 for 8 s. By my rough estimate, Q falls below LOW_AIR_FRAC and both standing players take O2_DAMAGE (6 hp/s) from about tick 500 until well after 900. They lose an estimated ~70 hp by tick 1200. The 1200/1201 shipPower commands need `conscious(d, pid)`, so the new 'every command applies' assertion is only safe by a thin, unmeasured margin. The test's stated rationale is also wrong. · plan L3423-3425 (the 'away from the Q spawns' comment), L3429 (edge 2 at 400, airlock 0 from 420 to 900), L3455 (statuses must all be 'applied'), L1223 (engineer requires conscious); hound.json:L80-L86 (edge 2 is H–O, tile [6,5]), L13 (row 7 has '+' at x=12, the Q–O door), L215-L217 (spawns [13,7], [14,7]); src/renderer/src/sim/tuning.ts:L16 (DOOR_ZONE 1.0, Chebyshev ≤), L22 (AIRLOCK_PASSAGE 3), L34 (O2_DAMAGE 6); src/renderer/src/sim/doors.ts:L20 (`<= DOOR_ZONE` keeps the door open); plan L1890-L1894 (low air hurts below 25 %, seated or standing). · If the margin fails, every seed fails the same way at tick 1200 or 1201, with 'unavailable' from a downed player. The executor gets no guidance for that, and the fix that looks obvious (dropping the applied assertion) would undo R1-F4. Even if the test passes, its comment misdescribes what runs. · Hold a door that is off the crew's air path, for example `{ kind: 'shipDoor', edge: 1 }` (R–H): the Reactor vents with the Hold, and O and Q only leak through closed doors at PASSAGE_CLOSED. Or hold edge 2 only after the airlock closes (for example at tick 950). Also add `expect(Life.state[a.interior.crew[p]!]).toBe(LifeState.Conscious)` for both players at the end of each seed. Correct the comment.

### [P3] R2-F2 The new Decisions are numbered out of order, and one cited line range is off
Decisions 20 and 21 are placed before Decision 19. In rendered Markdown an ordered list numbers its items in sequence, so the item written as '20.' shows as 19, '21.' as 20, and '19.' as 21. The rendered view therefore disagrees with the plan's references to 'Decision 20' (Task 9b Step 7b) and 'Decision 21' (Task 12). Separately, Task 6 Step 5 says the tuning.ts fire doc comment clause 'spans lines 34 and 35'. In the source it spans L35-L36. · plan L131-L137 (the order 20, 21, 19), L2992 and L3535 (references); plan L1466 vs src/renderer/src/sim/duel/tuning.ts:L35-L36 ('a fire grows DUEL_FIRE_GROW per tick to FIRE_CAP and never goes out by itself;'). · It's a nit. An executor reading the rendered plan could match the wrong Decision. The line range is only a pointer, since the edit is described by its text. · Move Decision 19 above 20 and 21. Change 'lines 34 and 35' to 'lines 35 and 36'.

## Prior findings
- R1-F1: resolved — Task 6 Step 7's quoted lines match scripted.ts:L153 and L169 exactly, and both functions have `d` in scope. derived.wallTile exists (derived.ts:L35-L41). Door tiles have roomOfTile -1, so goalTiles' goal sets are unchanged. solidAt is still used at scripted.ts:L253 and L261, so step (e)'s conditional removal of the import is correct. DOOR_ZONE 1.0 opens a door for a crew member who is blocked next to it. The new Cutter test uses names that exist: createScriptedPair(seed), scriptedInput(pair, d), d.nav and d.weapons, and Seated.
- R1-F2: resolved — The quoted pilot lines match scriptedPilot.ts:L123-L124 and L139. `sys` is declared at L112. levelWithinCap(sys, 0) is always 0, so the away branch can't be refused. scriptedPilot.test.ts and duelGates.test.ts are in Step 8's run list.
- R1-F3: resolved — The changedFirst regex at duelModules.test.ts:L58 is quoted correctly, with pewTargeted added. duelModules.test.ts is in Step 8's run list.
- R1-F4: resolved — present defaults to true (state.ts:L110). The results are sorted by player and then sequence (step.ts:L163), and each scripted tick carries one command, so the statuses line up with SCRIPT. The heat arithmetic holds: Engines reaches 5 > SYSTEM_MAX 4 at tick 40, and 240/2 × 5 = 600 ticks gives HEAT_MAX near tick 640 (tuning.ts:L4, L77-L78). After the failure, Sensors and Oxygen each have a spare bar and room under capacity. Edge 2 is a Hound door and airlock 0 exists. The air risk this script introduces is filed as a new P2.
- R1-F5: resolved — The quoted edits match scripted.ts:L118, L271 and L276. The telemetry.ts:L161 substring matches. laserFull gains its barrel parameter in Task 9b (plan L2754), and laserEligible is geometry only (plan L2795). situationModel is handed to Part ii explicitly.
- R1-F6: resolved — Decision 21 records that the loot is nullified, and Task 12's Known limits lists it.
- R1-F7: resolved — The tacticalDeterminism line numbers now match: L115 is the key list, L122 the comment's last line, L123 the expect. duelNames is at L42. The fire.ts header edit is described and keeps the real first line. The tuning.ts line range is still off by one (new P3).
- R1-F8: resolved — Global Constraints L89 gives the exemption explicitly. The widened filter covers round, helm and power, as well as the original five modules. All of those are scalar or vector fields that hashDuel flattens (modules.ts:L50-L69, L102-L111), so a +1 write changes the hash.

## Verified
- scripted.ts:L118, L153, L160, L169, L271, L276 match the plan's quoted replace text verbatim
- scriptedPilot.ts:L112 declares sys; L123-L124 and L139 match the quoted text
- grid.ts:L14-L21: solidAt treats a Closed door tile as solid; derived.ts:L41, L52: wallTile and doorTileToEdge are separate, so walkable() admits door tiles
- doors.ts:L20 and tuning.ts:L16: a crew member blocked next to an auto door is within DOOR_ZONE, so the door opens and the bot pathing works
- tests/helpers/scriptedDuel.ts:L33-L46: passiveInput and requireApplied behave as described in Decision 16 and Task 11's Interfaces
- duelModules.test.ts:L42, L58, L107 match the cited lines; DUEL_MODULES order is space, ship, science, presence, repair, round, helm, interior (modules.ts:L102-L111)
- tacticalDeterminism.test.ts:L115, L122, L123 match Task 2 Step 6
- telemetry.ts:L161 contains `laserFull(tac, 0) && !canLaunch(tac, 0)`
- Task 11 heat timing agrees with HEAT_MAX 240, HEAT_RISE 2, HAZARD_EVERY 5, START_BARS Engines 3 and SYSTEM_MAX 4 (plan L60, L786, L831)
- hound.json: edge 2 is the H–O door, airlock 0 is in H, and the spawns are in Q

## Not verified
- The exact oxygen trajectory of Q during Task 11's 420–900 vent: kEff comes from the layout and wasn't computed, so the ~70 hp loss is an estimate from the PASSAGE_BREACH half-life comment
- Whether the closed-door Cutter test in Task 6 reaches both seats within 1200 ticks: it depends on movement and BFS lengths over the Cutter's layout, which weren't simulated
- Whether the scripted pair's Helm, with pew pew as primary, changes goldens or gate bands beyond what the fallout rule covers: that is only measurable at execution

---

# Round 2 response (plan revised)

Reviewed `round-2.json` against the subject at `dbceeae6`. 2 accepted, 0 rejected, 0 deferred. Every R1 ID is confirmed resolved.

## R2-F1 [P2]: Task 11's vent reaches the crew's room

Confirmed: hound.json edges[2] is H–O, edges[1] is R–H, and spawn (13,7) sits next to the Q–O door, which stays within DOOR_ZONE. The script now holds edge 1 (R–H), the comment is corrected, the import is added, and the test asserts both players are Conscious at the end of each seed.

## R2-F2 [P3]: Decision order and a line range

Confirmed. Decision 19 now sits above 20 and 21, and the tuning.ts range reads lines 35 and 36.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-engineering-spike-i-sim.md

<!-- end -->

---

