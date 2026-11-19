# Codex review exchange: engineering-spike-i-sim-plan-v2

Subject: `docs/superpowers/plans/2026-11-18-engineering-spike-i-sim.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing c766762f, effort high, 929 s, 20060550 in / 19715836 cached / 78076 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 10's fog-gate test sends `designate` from the Weapons seat, so the step answers invalid-seat, not unavailable
The 'the gates' test seats player 0 at Navigation and player 1 at Weapons, then expects `[1, { kind: 'designate', contact: 0 }]` to come back `rejected/unavailable` with the enemy at 1200. The designate loop checks the seat first: `if (scientist < 0 || e.id.player !== scientist) { result(e, 'invalid-seat'); continue; }`. That runs before malformed and before Task 10's new `contactSeen` check. Nobody sits at Science, so `scientist` is −1 and the result is `invalid-seat`. The test cannot pass against the step as written. · plan L2830-2832 (sitDown 0→nav, 1→weapons; the designate case from pid 1 expects 'unavailable'); plan L3033-3035 (the seen check sits after the seat check); src/renderer/src/sim/duel/step.ts:257 (scientist = attendant(d, d.science)), :267-271 (invalid-seat before malformed); hound.json:179-183 (Science is a separate station in O) · Task 10 Step 9 requires engSensors to PASS, and the Global Constraints require each task's own tests to be green. An executor will either hit a red test with no instruction, or weaken the assertion. The designate fog gate, which spec §10.4 requires, would then go untested. · Make the designate case come from a seated scientist. For example, create the duel with a crew of 3 (`createDuel(HOUND, 13, 0, 3)`), call `sitDown(d.interior, 2, d.science)`, and send `[2, { kind: 'designate', contact: 0 }]`. Add a third NONE to the step helper's `held`, or rely on `?? NO_HELD`. Optionally add a positive case: designate at 600 is `applied`.

### [P2] R1-F2 Task 12 Step 5 captures telemetry lines that a skipped aggregate gate never prints
Step 5 says the per-seed `telemetryLine` output is 'logged even for skipped aggregate tests' and can be captured with `--reporter=verbose`. In tests/duelGates.test.ts the lines are printed only by the aggregate test's `console.log`. The per-seed tests use telemetryLine only as an expect message, which appears only on failure. A test marked `it.skip` under rule (c) never runs, so nothing is logged. If the per-seed tests are skipped too, no line exists at all. · plan L3232; tests/duelGates.test.ts:14-22 (per-seed: telemetryLine only inside expect messages), :23-26 (the aggregate test's console.log is the only printer); :2-3 names `npx tsx scripts/duel-telemetry.ts` as the tuning tool · The report's gate table is a spec §1 deliverable. An executor following the step will find no lines to copy and must improvise the source of the numbers. · Have Step 5 run `npx tsx scripts/duel-telemetry.ts`, which exists, and paste its per-seed lines and gate summary. Alternatively, extend scripts/engineering-spike-measure.ts to print `GATE_SEEDS.map((s) => telemetryLine(runDuel(s, 'scripted')))` and `gateSummary`. Delete the 'logged even for skipped' sentence.

### [P2] R1-F3 Task 12 Step 1 says the re-bless is 'at 54' and diagnoses a refusal as 'an artifact is not at 54'
Task 12's Interfaces say 'blessed goldens at 54'. Step 1 is titled 'Bless the gameplay change at 54', and its refusal hint says 'A refusal here means an artifact is not at 54'. The Global Constraints and the step's own Expected line say every artifact is at 55 after Task 1. A same-version bless is accepted only when every stored version equals SIM_VERSION (55). A refusal therefore means an artifact is not at 55, or is missing. · plan L3196, L3198-3201 vs plan L42-46; scripts/golden/blessGuard.ts:26-30 (stale = stored ≠ current; a far stale version is refused) · An executor debugging a refusal would hunt for the wrong version, and might re-run Task 1's bump or reach for `--fresh`, which is forbidden. · Replace '54' with '55' in L3196, the Step 1 title, and the refusal hint ('an artifact is not at 55: check `git log -- tests/golden tests/fixtures` for Task 1's bless commit').

### [P2] R1-F4 Two spec §8 sim tests are missing: the fire-cadence damage clamp and the magazine's 2700-tick regain
Spec §8 lists 'a fire-cadence damage rise clamps bars the same tick' and 'the magazine units clock regains a missile at 2700 ticks'. No plan test drives firePhase's DUEL_FIRE_DAMAGE_TICKS cadence and then checks that the system's bars were clamped in the same step. engPower calls clampToCapacity directly. engWeapons checks only the per-tick reload rate (4/6/8/10) and never the regain at 10800 units. The self-review still claims '§8 every sim test'. · spec L273-274; plan L2527-2539 (per-tick rate only); plan L679-689 (a direct clampToCapacity call); plan L3271 (the self-review claim); grep of the plan finds DUEL_FIRE_DAMAGE_TICKS only in code edits (L1426-1448), not in any test · The clamp's placement after firePhase (spec §7 step 8, Task 5 Step 5(d)) is a step-order rule that no test pins. A misplaced clamp, for example before firePhase, would pass every listed test. · Add to engWork or engPower: a quiet Hound duel with Engines at 3 bars and room E burning, stepped so that (tick − baseTick) % 900 === 899. Assert that after that one step the Engines Room is 1, `bars[Engines]` is 2 and the throttle is clamped. Add to engWeapons: with torpedo bars 1 and magazine −1, run 2699 tickWeapons calls and assert the magazine has not yet regained, then one more and assert it has.

### [P3] R1-F5 Two test notes leave fixes to the executor ('move both ships…', 'read its heat trace before weakening')
The torpedo-levels test is followed by a conditional: if a rock detonates the missile first, move both ships to a clear spot. That leaves the test's setup to be decided at execution. Task 11 likewise says 'If a seed shows otherwise, read its heat trace before weakening the assertion', which invites weakening a determinism assertion. · plan L2540-2547 and L2567; plan L3171; src/renderer/src/sim/tactical/missiles.ts:122-125 (a rock touch detonates before the ship check) · The brief treats 'check at execution' as a defect. Two executors could set different positions or relax different assertions. · For the torpedo test, either deactivate the rocks, or place the ships with a fixed clear position computed in the test (assert `touchesSolid(st, x, y, 30)` is false and fail loudly). For Task 11, state that the assertion is never weakened, and that a seed that does not overheat is a bug to debug.

### [P3] R1-F6 Decision 18 gates the crew's auto-launch on sight, which spec §10.4 doesn't list, without calling it a deviation
Spec §10.4's sim gates are contactScan, laser lock, torpedo lock and designation (admission), the scan pause, and auto-fire. Task 10 Step 5 also holds the crew's torpedo auto-launch while the enemy is unseen. The plan presents this as part of the spec rather than as a stated deviation. The manual `missileLaunch` path, which the Valkyrn pilot uses, stays ungated, so the two launch paths now differ. · spec L434-439; plan L124, L127, L2952-2953; src/renderer/src/sim/tactical/weapons.ts:232-236 (manual and auto launch) · A reviewer or tuner reading the spec won't expect a held torpLock to wait for sight, or the asymmetry with missileLaunch. · Add one sentence to Decision 18 marking the auto-launch gate as a plan-level extension, with its reason (an accepted lock must not fire blind once the target leaves sight), and note that missileLaunch is ungated. Alternatively, drop the auto-launch gate.

## Verified
- Task 2's quoted edits match master exactly: state.ts:193 (the systemsFor shields line), :196-198 (the systemsFor tail), :202-203 (the emptySystems tail); hash.ts:125 (gunRoomWear vector), :239-240 (systemsRules tail), :201 (clone systems). tacticalDeterminism.test.ts:116 is the sorted key list starting 'cls' (so 'bars' sorts first), and :127 contains '2 * 41'. The 41 + 5 + 3 = 49 arithmetic holds.
- bars.ts imports only `type ShipSystems`. state.ts and hash.ts read the bars constants only inside functions (systemsFor, shipFields, systemsRules), so the existing state↔hash runtime cycle is safe. vector() (module.ts:36-42) writes into the existing array, so the clone's fresh `bars: [0,0,0,0,0]` and `weaponPower: [0,0,0]` are filled by unflatten.
- The validator regex in hash.ts:268-275 maps `systems.N.bars` and `systems.N.weaponPower` to systemsRules keys, and inactive slots must hold zeros (emptySystems gives zeros). The engBars refusal test throws with a message containing 'systems.0.bars'.
- Task 3's quote (weapons.ts:249-250) matches, CREW_SLOT is imported (weapons.ts:11), and the engBars shields expectations follow from SHIELD_LAYERS/RATE_BY_BARS with Cutter layers 2.
- Task 4's quotes match: duel/state.ts:10 and :110, modules.ts:98 and :109, snapshot.ts:149 and :178. duelRoundOf (snapshot.ts:108) reads round values before helm, so the power offset after helm leaves it untouched. The duelModules walk (tests/duelModules.test.ts:20-35) treats power.heat, coolant and failed as numeric-array members covered by the powerModule field names. systemRooms is excluded. Changing the hash loop from slice(0,5) to the filter adds the round, helm and power fields, and every one of them moves the hash.
- The engPower heat and overheat expectations match tuning.ts:77-83 (HEAT_MAX 240, RISE 2, COOL_UNIT 1, COOL_IDLE 4, OVERHEAT_FIRE_CHANCE 0.5). chance() makes exactly one nextFloat draw (shared/rng.ts:24-26). The Hound's systemRooms derive to R, O, E, O, L from HOUND_REPAIR_POINTS (duel/tuning.ts:18-22) and its science and lifeSupport stations (hound.json:179-200).
- Task 5's quotes match: step.ts:33 (DUEL_KINDS), :283 (crew.scanner), :310 (firePhase); codec.ts:127-128; contracts.ts:98-99. stepDecided (step.ts:160) answers duel-decided for any DUEL_KINDS member. Every new reason is in COMMAND_REASONS (contracts.ts:106-110). The DuelCommand and DuelEnvelope types come from sim/duel/commands.ts:5,10.
- Task 6: createSimState accepts `{ quirk }` (state.ts:104-139); quirks.ts:15-18 makes quirk 3 neutral for passage and door delay. doorSystem's fail-safe needs the Doors station online, and every duel layout has a doors station with allocation ≥ 1 (hound.json:191-195; cutter, valkyrn and skiff likewise). passageFor gives PASSAGE_OPEN 1 for HeldOpen (oxygen.ts:13, tuning.ts:18). Hound edge 0 is the E–H door, and fireStep draws once per burning edge side (hazards/fire.ts:32-37). DOOR_ZONE 1.0 lets a bot blocked at a closed door open it.
- Task 6 Step 7: solidAt treats a Closed door as solid (grid.ts:14-21), and `wallTile` exists on Derived (derived.ts:10). The bfsPath and goalTiles quotes (scripted.ts:153, :169) and duelScripted.test.ts:39 match. solidAt stays used by reviveTiles and roomTiles, so its import remains.
- Task 7: the health.ts quotes (:101-103) and helpers (crewSize, isConscious, roomOf, hurt) exist, as do the crewHurt type line (duel/state.ts:37) and the fire.ts quotes (:10-12, :42-54, :56-63). activateBreach and repairBreach exist (hazards/breach.ts:4-14). The work-precedence test survives the slow breach vent (PASSAGE_BREACH 0.1).
- Task 8: the physics.ts and predict.ts quotes (physics.ts:6, :29, :33, :61-64; predict.ts:5, :31, :34) match. step.ts:241 matches, as do scripted.ts:319 and scriptedPilot.ts:114, :125-126, :141. PILOT_AWAY_THROTTLE is 0, so levelWithinCap always keeps it. Hunter flight is unchanged: shipEngineFactor(i≠0) = engineFactor(cls, rooms).
- Task 9b: the weapons.ts quotes (:72, :86, :183, :191-192, :245, :251-252) and missiles.ts:104-106 match. Hunter paths are byte-identical: laserOffline, canLaunch, the magazine and shields stay on their non-crew branches; fireLaser uses laser.shots for non-crew; the new stepBurst trim never triggers for the Hunter (laserBurst ≤ shots − 1); land adds 1 level as before. gun.ts reads Room damage directly (gun.ts:48-51), so the Valkyrn gun is unaffected.
- Decision 20's first-tick move always applies. At the gunner's first seated tick, Weapons effective bars are 2 (capacity 10/5/0) and the allocation is [1,0,1]. Pew −1 gives [0,0,1], then beam +1 has a free bar and top 3, giving [0,1,1]. Both run in (player, sequence) order in the weaponPower loop. The move sits before Task 10's `shipSeen` return, so sight never blocks it, and no noop can occur (requireApplied, tests/helpers/scriptedDuel.ts:39-46).
- Task 10: the step.ts quotes (:220-221, :271-272, :280), the science.ts quotes (:6-7, :49-50) and the weapons.ts auto-fire and auto-launch lines (:230, :236) match. Sight is computed at admission from ship positions and start-of-tick bars, so the scripted gunner's `shipSeen` and the step's gate read the same state. The gunner and the Valkyrn pilot send no other gated command (the scripted.ts and scriptedPilot.ts command kinds are listed). science.ts has no import path back to weapons.ts.
- Golden procedure: blessGuard.ts:22-36 runs the bump proofs only when a stored version differs, and allows a same-version bless (Task 12). Task 1's bump with no gameplay change meets the oracle's 'bump' rule (duelOracle.ts:364-369: version = baseline + 1, tied to the stored goldens at 54). Part ii's consumed names (throttleCap, sensorRange, pointSeen, contactSeen, trimmedWeaponPower, weaponBarsUsable, BEAM_SHOTS_BY_BARS, WeaponSlot, fireTileOf, LOW_AIR_FRAC, capacityOf, sparesOf, coolantFree, isOverdriven) are all produced with compatible signatures.
- No pew pew remnant survives: the plan has no pew charge, lock, burst or `weapon` field. The only PEW_ mention is the merge plug-in in Decision 22 (plan L132).

## Not verified
- I did not run `npx tsc --noEmit`, so the claim that each task leaves tsc clean is reasoned from the source, not compiled.
- Whether every seed 1-5 duel in Task 11 stays undecided, and keeps both crew conscious, for 1800 ticks with nobody at the Helm (a planet or asteroid contact could decide the round and turn the script's results into duel-decided). This needs a run.
- Whether the scripted pair on the Cutter reaches both consoles within 1200 ticks through auto doors (Task 6's new test), and within 1500 ticks for Task 9b's gunner test. That depends on the Cutter's layout and needs a run.
- Whether seed 1's asteroids leave (-300,-300) clear for the torpedo-levels test (missiles.ts:122-125). I did not read the generated map.
- Whether `npm run test:duel-app-runtime` (Task 12 Step 4) drives the throttle to 4 or relies on held-open doors. A refusal there would fit none of the fallout kinds. I did not read scripts/network/duel-app-smoke.ts.
- I looked beyond the manifest for specific checks: hound.json, sim/state.ts (createSimState), stations.ts (sitDown, stationOnline), interact.ts, quirks.ts, hazards/breach.ts, derived.ts, grid.ts, defs.ts, gun.ts, missiles.ts, scriptedPilot.ts, situationModel.ts, tests/helpers/scriptedDuel.ts, tests/duelOracle.test.ts, tests/duelCheckpoint.test.ts and tests/codecModeWire.test.ts. Each read was targeted at a specific claim in the plan.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `cea6cced`. 6 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: designate from the Weapons seat answers invalid-seat

Confirmed: step.ts:267-271 checks the seat first. The test now uses a crew of 3, with player 2 seated at Science, and adds a positive case at 600.

## R1-F2 [P2]: Skipped gates print no telemetry

Confirmed: duelGates.test.ts:23-26. Step 5 now uses scripts/duel-telemetry.ts.

## R1-F3 [P2]: Stale 54 in Task 12

Confirmed. These now read 55. The other 54s are the baseline or "before" values and a line reference.

## R1-F4 [P2]: Two §8 tests missing

Confirmed. A same-tick clamp test (Task 8) and a magazine regain test at 2700 ticks (Task 9b) are added.

## R1-F5 [P3]: Deferred test setup

Confirmed: missiles.ts:122-125. The rocks are cleared and touchesSolid is asserted. The determinism assertion is never weakened.

## R1-F6 [P3]: The auto-launch gate is not called a deviation

Confirmed. Decision 18 now marks it as a plan extension and gives the reason. The manual missileLaunch stays ungated.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-engineering-spike-i-sim.md

<!-- end -->

---

