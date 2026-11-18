# Codex review exchange: sci-1-plan

Subject: `docs/superpowers/plans/2026-11-17-sci-1-science-scans.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 982c2493, effort high, 1346 s, 35749927 in / 35321475 cached / 89970 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 1 puts the three new commands in DUEL_MODULES before the codec has them, so two existing tests fail in Task 1
Task 1 Step 7 declares scienceModule with commands ['contactScan','designate','laserFrequency'] and adds it to DUEL_MODULES. Two tests compare the modules' command kinds with a fixed list and with the codec: duelModules.test.ts:144 and duelCheckpoint.test.ts:139-142. The plan only updates them in Task 2 Step 8, and the codec gains the kinds in Task 2 Step 5. So Task 1's targeted run (Step 10, which includes duelModules.test.ts) and Step 12 (which includes duelCheckpoint.test.ts and then the full suite) both fail. · plan L414 (commands in Task 1), L160 (Task 1's scienceState test expects them), L457-461 (DUEL_MODULES gets scienceModule in Task 1), L518 and L546 (Task 1 runs duelModules and duelCheckpoint expecting PASS), L895-897 (the two test edits are in Task 2). tests/duelModules.test.ts:143-144 (exact sorted kinds list). tests/duelCheckpoint.test.ts:136-142 (kinds must equal the examples' keys, and each must round-trip through duelCodec). src/renderer/src/net/codec.ts:110-122 (no contactScan, designate or laserFrequency until Task 2). · A fresh subagent running Task 1 verbatim hits red tests at Step 10, before the bless, with no instruction that allows fixing them. The step-1 bless and commit are then blocked. · Either (a) declare scienceModule with commands: [] and reasons: [] in Task 1 (and expect empty lists in scienceState.test.ts L160), then fill both in Task 2 with the duelModules L144 and duelCheckpoint L139 edits and update scienceState's expectation there; or (b) move the contracts.ts and codec.ts additions and those two test edits into Task 1. Either is behaviour-neutral, because no oracle run sends these commands.

### [P1] R1-F2 Task 4's scan progress breaks Task 2's scienceCommands expectations of progress 0
Two Task 2 tests step the duel once with a contactScan and then assert the scanner holds progress 0: 'stale-tick, then invalid-seat ...' and 'starts at the sender's station and rate'. Task 4 adds scanStep to stepDuel. Per spec §4.3 a scan's first progress step falls in the admitting tick, so after that step progress equals the rate (5 from Science, 2 from Helm or Weapons). Task 4 Step 5 re-runs tests/scienceCommands.test.ts expecting PASS, but Task 4 lists no edit to that file. Tasks 5 and 6 inherit the failure. · plan L696 (expects progress 0 at rate SCAN_RATE_SCIENCE after step), L704 (expects progress 0 for nav/weapons/science after step), L1196-1197 (Task 4 modifies only science.ts and duel.ts), L1370 (scanStep(state, crew.scanner) in stepDuel), L1375 (Task 4 runs scienceCommands expecting PASS); spec L53 (first progress step in tick t); src/renderer/src/sim/duel/step.ts:201 (stepDuel runs in the same stepDuelTick after admission). · Task 4 fails at its own test step, and the Task 2 tests cannot be fixed without an instruction. · In Task 2, assert the scan with toMatchObject({ contact, level, rate, by }) and leave progress out (scanCommand's own unit test already pins progress 0). Or add to Task 4 an explicit edit of those two expectations to progress = rate (5, or 2 from Helm or Weapons).

### [P1] R1-F3 Task 8's new 'science' tab key breaks the exact tabs check at duelConsoleModel.test.ts:106
Task 8 widens ConsoleStation to include 'science', and consoleTabs' records gain science: 'locked'. tests/duelConsoleModel.test.ts:106 asserts model(d, { mode: 'online' })!.tabs with toEqual({ helm: 'locked', weapons: 'locked', ship: 'current' }), which now also receives science: 'locked'. Task 8 only edits L31 of that file (TABS_RIGHT) and runs it in Step 6 expecting PASS. · plan L2338 (Task 8 test updates: only duelConsoleModel L31), L2537-2538 (the records gain science), L2549, L2553 (runs tests/duelConsoleModel.test.ts expecting PASS); tests/duelConsoleModel.test.ts:106 (exact toEqual on tabs); src/renderer/src/render/duel/consoleModel.ts:34-35. · An existing test breaks with no instruction to update it, so Task 8 stops at Step 6. · Add to Task 8's test updates: tests/duelConsoleModel.test.ts L106 becomes toEqual({ helm: 'locked', weapons: 'locked', science: 'locked', ship: 'current' }).

### [P2] R1-F4 The Science block contradicts spec §7.3 'no station block' but is not marked as a deviation
Spec §7.3 says the Science layout has no station block. Decision 10 and Tasks 8, 9 and 12 add a 96-high Science station block at the bottom left, holding the hover readout and key help. The Decisions list it as a choice where the spec leaves room, not as a deviation with a justification. · spec L143 ('Layout: no station block; the map is full width less CONTACT_RESERVE'); plan L44 (Decision 10), L2529 (STATION.h.science = 96), L2421-2424 (test), L4056-4084 (ScienceStation.tsx). · Rule 2 asks that each deviation be stated and justified. This one changes what the owner reviewed, and the owner look gate (Task 13) checks this layout. · Restate Decision 10 as a deviation from spec §7.3 with its reason (the spec gives the hover readout no home, and the side column and contact window are full). Or move the hover line into the side column or the contact window's info lines and drop the block.

### [P3] R1-F5 A few cited line numbers are off by one, and one pinned comment can go stale
Task 6 Step 10 cites duelSnapshot.test.ts L74 for the message 'one missile in flight at seed 7 tick 5156' (it is on L75) and tacticalSlots.test.ts L154 for expect(ticks).toBe(16268) (it is on L155). The duelCheckpoint L21 comment begins 'Seed 7's scripted duel is a crew loss'. The rule only replaces the tick, so if the re-measured outcome flips, the comment goes stale. · plan L1941-1942; tests/duelSnapshot.test.ts:75; tests/tacticalSlots.test.ts:155; tests/duelCheckpoint.test.ts:21. · Small friction for an executor who works by line number. · Cite L75 and L155, and have the L21 rule also restate the outcome word from the measured <o>.

## Verified
- The plan's master assumptions hold: src/renderer/src/sim/tuning.ts:7 is SIM_VERSION = 44; tests/golden/duel-1.json is simVersion 44, 8329 ticks, outcome 2; duel-rematch.json has rematch tick 8329 and rounds of 8329 then 20802 (matches plan L535-538).
- The module helpers exist with the assumed signatures: scalar, flag and vector (module.ts:28-42). The plan's science field list is 17 values in spec §6.2 order, matching the counts in plan L159 and L507. Keeping `known` as one vector fits the completeness walker, which treats a numeric array as one member (duelModules.test.ts:20-35).
- cloneTacticalFromModule builds fresh known, scan and derelict containers, then unflattens the values (plan L433-435 against hash.ts:143-153). Validation is widened: shields up to most layers + 1, freq 0..2, hunter.mode up to Patrol, a special case for known, and the topRules (plan L437-455 against hash.ts:170-216).
- The snapshot offsets stay correct. seedEntry's spaceLength is tacticalLength(shape), which the plan redefines over all TACTICAL_MODULES, so roundAt and duelRoundOf move with it (snapshot.ts:65-72, 95, 129). duelSnapshot.test.ts:105 derives interiorAt from the TACTICAL_MODULES loop.
- MIGRATIONS[44] fits Migration/aliasPlan (duelOracle.ts:78-109, 138-179): duelSchema names the new fields `science.<f>` and `ship.systems.<i>.freq`, which the two `added` regexes cover. The oracle and canonical-trace modes (baseline, check, same, golden) and their messages match scripts/golden/duel-oracle.ts:14-20, duelOracle.ts:337-365 and versionOnly.ts:125-137. bless-golden refuses only on a version mismatch, so the same-version bless in Task 6 proceeds (bless-golden.ts:38-42).
- Tasks 1-5 are dormant. With hostileAt 0, hostilityStep returns at once, tickWeapons' Patrol hold is false, and the Hunt or Repair path never reaches the Patrol branch. There are no new rng draws before Task 6. The scan stays idle because ORACLE_RUNS are only scripted or passive (duelOracle.ts:45-53) and the scripted pair sits only at its own console (scripted.ts:289). The derelict is already salvaged, so salvageStep returns, and scanner = (contact < 0) is true.
- The duelRounds stamp regex gains science.startTick, which matches startRound setting startTick = tick; hostileAt is round-relative and needs no shift (step.ts:87-96; plan L357-362, L514).
- attendant, the seat phase, the throttle loop and DUEL_KINDS in step.ts:29-190 match the plan's insert points. sitDown seats every member of a console group (stations.ts:31-39). The Hound's group lists science first (hound.json:209-214), so seatOf/attendant on d.science work. In the Cutter, Science is ungrouped at station index 3 (cutter.json:497-504), so commandUnion.test.ts:32 still picks Doors (index 1) as its unused console.
- The DuelEvent consumers fire.ts:22-25, health.ts:32-35, telemetry.ts:100-102, fxModel.ts:42-46 and duelSounds.ts:21-31 match the plan's skip edits.
- hunter.ts:58-99 (threatAhead, sideOf and the trail line) supports the Patrol branch. weapons.ts:61-110 (fireLaser, tickWeapons) supports the strip and the shield hold. duel.ts:22-40 supplies the `hunter` variable for hostilityStep.
- The derelict trig uses only dirBetween, which normalises (direction.ts:10-15), so the radius and speed toBeCloseTo checks hold. circularSpeed is at map.ts:26, and spawnAt's prograde heading + 64 matches the velocity heading.
- The physical constants behind the tests line up: SHIELD_LAYERS 2, SHIELD_RATE [3,2,0], SHIELD_RECHARGE_UNITS 900 (300 ticks a layer), SHIP_HULL 40, MAGAZINE 4, LASER_RANGE 450, PLANET_RADIUS 70, SHIP_RADIUS 20 and MISSILE_RADIUS 4 (24 ≥ 22 for the placed missile), and REACH 1.5.
- The layout fits. The consoles' readout is at most 14 rows: 42 + 8 + 24*14 + 8 = 394, under stationTop('weapons') at 460. The contact window at h 420 ends at y 570, clear of the scale-bar row (680) and the side column. The frequency row sits at y0+202..226, inside the 248-high block (top 460). The Science block (612-708) sits on the left, away from the right-hand window.
- The contact controller re-key keeps aim, Esc-then-close and the intercept rules for Helm and Weapons (contactController.ts:36-78 against plan L3179-3231). The scene and online wiring send the requests: runtime.ts:302-370 play/queue/throttleBase and onlineDuel.ts:181-230 play/pump match the plan's insert points. The keyboard's intercept runs before PRESS_CODES (input.ts:85-91), so Science takes S.
- The React tests follow the existing jsdom pattern (contactWindow.test.tsx:1-34: makeUi, UiRoot, createDuelSink, data-testid console-<name>, canvas data-text). Button renders data-ui-button looks idle, hover, lit and disabled (Button.tsx:38-54).
- The other interfaces resolve as the plan uses them: blink, CRT, CRT_RAMP and ALERT_BLINK_HZ (crtTheme.ts:6-19); pickShip and pickRadius (tacticalModel.ts:318-333); createCamera(x, y, zoom) (camera.ts:26); screenToWorld (camera.ts:37); bearingDeg (weaponsModel.ts:43-46); crtActive (crt.ts:9); createUiActions, mountUi, setLayout and setCrtSetting; and the docs/gates.md anchor at L780.

## Not verified
- Whether the scienceScans timing runs (up to 1800 steps from Helm and Weapons) can lose the scan to a downed seated player. At Task 4 the hunter is hostile from tick 0, and after Task 6 from rt 1199. Hits and fires on the crew rooms can down a player, and health.ts:104 then stands them up, so the stepsToKnow helper would throw. Only the crew hull is raised (plan L1236). Setting ships[1].active = false in crew(), as Task 5's wreck() does, would remove the risk. I could not simulate it.
- Whether tests/duelGates.test.ts stays in band after Patrol adds up to 20 s. The plan correctly stops and reports if it does not.
- The exact geometry assumptions in some new tests (the hunter not crashing during 1199 Patrol steps on its spawn orbit, the Task 6 replica run reaching salvage by k=699, no stray derelict inside the pick radius in the pickContact and contactScene tests). Each looked plausible from the code; none was executed.
- The Task 13 screenshot harness APIs beyond the signatures I grepped (createRenderer, loadAssets, parseCrt, createInteriorCamera, renderer.setCrt and the DuelViewSource members), and whether Electron capture works in this environment.
- Whether any test outside those I read pins scripted-run values that the five extra rng draws and Patrol change. Task 6 Step 11's catch-all rule (stop and report) covers these, but I did not enumerate every test.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at `0379cb98`. 5 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Task 1 lists commands before the codec has them
Confirmed: tests/duelModules.test.ts:144 and duelCheckpoint.test.ts:136-142 compare kinds with a fixed list and the codec. Took option (a): Task 1 declares scienceModule with empty commands and reasons and expects `[[], []]`; Task 2 Step 8 fills both and updates scienceState; Task 2's commit stages hash.ts and scienceState.test.ts.

## R1-F2 [P1]: Task 4's progress breaks Task 2's progress-0 expectations
Confirmed (spec 4.3: first progress step in the admitting tick). Task 2's two assertions use toMatchObject without progress.

## R1-F3 [P1]: The science tab key breaks duelConsoleModel L106
Confirmed: L106 is an exact toEqual on tabs. Task 8's test updates now include L106 with `science: 'locked'` (the file is already staged in Task 8's commit).

## R1-F4 [P2]: The Science block is an unmarked deviation
Confirmed against spec 7.3. Decision 10 now states it is a deviation and why.

## R1-F5 [P3]: Line numbers off by one
Confirmed: L75 and L155. Fixed, and the L21 rule restates the outcome word.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-17-sci-1-science-scans.md

<!-- end -->

---

