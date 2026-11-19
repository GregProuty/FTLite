# Codex review exchange: engineering-spike-ii-hud-plan

Subject: `docs/superpowers/plans/2026-11-18-engineering-spike-ii-hud.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing a3538f12, effort high, 850 s, 16213148 in / 15910602 cached / 65230 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 8 model test expects pew pew untargeted at round start; Part i starts it targeted on Shields
The Weapons panel test asserts `w.pew` toMatchObject `{ shots: 2, target: -1 }` at round start. Part i's systemsFor starts pew pew with `pewLock: Room.Shields, pewTargeted: crew && laser !== null`. The panel maps `target: sys.pewTargeted ? sys.pewLock : -1`, so it reads 1 (SHLD), not -1. The test cannot pass. · plan L1845 (`expect(w.pew).toMatchObject({ shots: 2, target: -1 })`), L1909 (`target: sys.pewTargeted ? sys.pewLock : -1`); Part i plan L2530 (`pewLock: Room.Shields, pewTargeted: crew && laser !== null`) and Decision 17 L119 ('Pew pew starts full and targeted on Shields, like the beam'). `shots: 2` needs a crew laser (barrelShots returns 0 without one, Part i L2643), so whenever shots is 2, pewTargeted is true. · Task 8 Step 6 fails at its first run, and the executor has to guess whether the test or the model is wrong. · Expect `target: Room.Shields` (import Room) and `ready: true` at round start. Or set `sys.pewTargeted = false` before the assertion and keep -1.

### [P1] R1-F2 Widening aimWeapon to 'pew' breaks FlightStation's prop type (tsc)
Task 8 widens `ContactView.aimWeapon` to `'pew' | 'laser' | 'torpedo' | null`. DuelUi passes `duel.contact?.aimWeapon ?? null` to FlightStation, whose `aim` prop is its own local `type Weapon = 'laser' | 'torpedo'`. `npx tsc -b` fails with TS2322. FlightStation.tsx is not in Task 8's Files or its git add, and the plan says only TargetingLine needs nothing. · plan L2014 (contactModel `aimWeapon` widened), L2015, L2221 ('The widened aimWeapon type flows through unchanged'), L1783 (Files list, no FlightStation), L2236 (git add); src/renderer/src/ui/duel/DuelUi.tsx:45 (`<FlightStation … aim={duel.contact?.aimWeapon ?? null} />`); src/renderer/src/ui/duel/FlightStation.tsx:22 (`type Weapon = 'laser' | 'torpedo'`), :27 (`aim?: Weapon | null`). · Task 8 Step 10's `npx tsc -b` (and every later task's) fails. · Add FlightStation.tsx to Task 8. Either narrow at the call site (`aim={duel.contact?.aimWeapon === 'pew' ? null : duel.contact?.aimWeapon ?? null}`; pew pew has no Flight card, Decision 14) or widen FlightStation's local type. Stage the file in the commit.

### [P1] R1-F3 Task 9 torpedo fog test moves the wrong missile pool entry
The test assumes `missiles` is indexed by owner and moves `t.missiles[1]`. `placeMissile` puts the missile in the first free pool entry, which is missiles[0] on a fresh state. The test therefore moves a free entry. The enemy torpedo stays at r/2, `seen.missile` stays true, and the next assertion fails. The plan itself defers this to a 'check the test's assumptions' step. · plan L2300-2305 (`placeMissile(t, 1, …)`, then `t.missiles[1]!.x = own.x + r * 2;`, then `expect(v.seen.missile).toBe(false)`), L2339-2341 ('TacticalState.missiles is indexed by owner slot … the third case relies on that'); src/renderer/src/sim/tactical/state.ts:227 (`missiles: [emptyMissile(), emptyMissile(), …]`), :247-251 (`missileOf(state, i) ?? state.missiles.find((e) => !e.active)`). · Task 9 Step 9 fails. The check-at-execution bullet is a known-false assumption. · Use the returned entry: `const m = placeMissile(t, 1, {...}); …; m.x = own.x + r * 2;`. Delete the 'check the test's assumptions' bullets at L2339-2341.

### [P1] R1-F4 Task 11 'creates' the spike report with a literal template, overwriting Part i's report
Part i Task 1 creates the same report and Task 12 fills it with the sim measurements, the gate and band table and the determinism lines. Part i's skipped balance gates point at that table in their it.skip comments. Part i says Part ii adds feel and screenshots to that same file. Part ii's Task 11 says 'Create' and gives a whole-file template, with 'Everything else is literal'. That template has no gate table and no list of the pre-existing tests that Tasks 7 to 9 tell the executor to record 'in the report'. The file table also says 'create (T8)'. · plan L107 (`create (T8)`), L2635 ('Create: docs/superpowers/research/2026-11-18-engineering-spike.md'), L2737 ('Everything else is literal'), L2739-2796 (the template), L1598, L2020, L2228, L2548 ('say so / list each one in the report'); Part i plan L51 (the it.skip comment cites the report's gate table), L130 (Decision 19: 'Part ii adds feel and screenshots to the same report file'), L138, L169, L221-239 (Sim measurements, Gates and bands, Determinism sections), L3370. · Following Task 11 as written deletes Part i's gate and fallout record, the evidence the owner needs to judge the spike. The 'list it in the report' instructions in Tasks 7 to 9 have nowhere to land. · Make Task 11 Step 4 a Modify. Keep Part i's sections. Append 'Part ii: what was built', 'App smoke and screenshots', 'Tests updated by Part ii' (from Tasks 7 to 9), 'Feel' and 'Known limits'. Fill 'Numbers' from Part i's measurement lines. Fix the file table to 'modify (T11)'.

### [P2] R1-F5 Task 10's measurement script duplicates Part i's, with a different workload
Part i already creates `scripts/engineering-spike-measure.ts` and runs it at 53 and at 54 (a Hound snapshot length, then a 3600-tick scripted Cutter duel). Part ii adds a second script, `scripts/spike/engineering-measure.ts`, that times idle Hound rounds over 5 seeds. The report would get two different 'tick cost' figures. · plan L106, L2566-2610; Part i plan L130 (Decision 19), L137, L168, L189-218, L3367. · It's redundant code under `scripts/` (type-checked by tsconfig.web.json), and the report's numbers would disagree. · Drop Task 10 Steps 1-2 and the script. Quote Part i's two measurement lines in the report. If an idle-Hound figure is really wanted, say why and label it separately from Part i's.

### [P2] R1-F6 New WeaponsStation calls optional ConsoleInput members without `?.` (certain TS2722), left conditional
Task 8 makes `pewLock?` and `weaponPower?` optional on ConsoleInput. `consoleActions` is annotated `ConsoleInput`, so `actions.console.pewLock(-1)` and `actions.console.weaponPower(slot, ±1)` in the rewritten WeaponsStation are 'possibly undefined' invocations. The plan only says 'if tsc reports them … call them with ?.'. · plan L1943-1944 (optional members), L1980-1981, L2129 (`actions.console.pewLock(-1)`), L2149 (`actions.console.weaponPower(slot, 1)`), L2219 ('If tsc reports them possibly undefined…'); src/renderer/src/ui/actions.ts:49 (`const consoleActions: ConsoleInput = {`), :73 (`console: consoleActions`). · The error is certain, not maybe. A check left to execution is a defect under this review's rules. · Write `actions.console.pewLock?.(-1)` and `actions.console.weaponPower?.(slot, 1)` / `(slot, -1)` in the Step 9 code, and delete the conditional note.

### [P2] R1-F7 The fog hides the round-start enemy, so existing tests break; the plan's fix recipe is open-ended and partly unworkable
Ships spawn on SPAWN_RADIUS 2000 and the round-start sensor range is 900, so the enemy is unseen from the first frame. Existing tests that click or draw the enemy at its spawn will fail. For example, contactScene expects 'ENEMY SHIP' after a click at the enemy's spawn position, and with `seen: false` contactModel returns 'CONTACT LOST'. Step 9 runs only 8 files and says 'fix the test'. Its second recipe ('raise the crew's Sensors bars') tops out at 2800, which may not reach a spawn up to about 4000 away. Failures in other files first show up in Task 10's full suite, which has no fix instruction. · plan L2532 (`ships: fx.kill || !fogView.seen.enemy ? [0] : [0, 1]`), L2539, L2545, L2548; src/renderer/src/sim/tactical/tuning.ts:34 (`SPAWN_RADIUS = 2000`); Part i plan L3039 (`SENSOR_RANGE_BY_BARS = [300, 900, 1400, 2000, 2800]`); tests/contactScene.test.ts:53, :59-68 (click at `enemyOnScreen()`, expects title 'ENEMY SHIP'). · This is the risky path the review asked about (Q8). An executor in Task 10 meets unplanned failures with no rule for them. · In Task 9, grep the scene and UI tests that need a drawn or clickable enemy at round start (contactScene and any others that read enemy marks, arcs or the contact window). Give one recipe: move `t.ships[1]` within 900 of the crew ship before the first draw. Drop the 'raise Sensors' option. Repeat the rule in Task 10 Step 3.

### [P3] R1-F8 Small unstated HUD deviations from spec §6, and overlapping markers in non-point rooms
(a) Spec §6 puts the free coolant under the reactor column. The plan prints it in a header line, 'REACTOR x/10   COOLANT y/8'. (b) The spec's heat bar turns red near HEAT_MAX. The plan colours it by state only (hot while overdriven, blinking while failed, main otherwise). (c) In a non-point room, fireTileOf returns the breach-site tile, so a fire and a breach there draw two markers and two labels on the same tile. · spec L206-208; plan L882, L944; plan L1120 and L1124 (both at `centre(fireTileOf(d, r))` and `centre(der.siteTile[s])`); Part i plan L1672-1677 (fireTileOf returns siteTile for non-point rooms). · Clarity is one of the spike's three questions (spec Questions §2). Overlapping labels are unreadable. · State (a) and (b) as Decisions, or implement them (a FREE pip row under the PWR column; heat tinted hot above e.g. 75 % of heatMax). For (c), offset the breach label by half a tile when a fire marker shares its tile.

## Verified
- Part i names used by Part ii match Part i's plan. capacityOf, sparesOf, coolantFree, isOverdriven, COOLANT_POOL_DUEL and PowerState are in sim/duel/power.ts (Part i L754-776). power.ts re-exports DuelSystem, DUEL_SYSTEM_COUNT, OVERDRIVE_SYSTEMS, SYSTEM_MAX, SYSTEM_SLOTS, REACTOR_BARS, START_BARS and effectiveBars (L749-751). SHIELD_LAYERS_BY_BARS is imported from tactical/bars.ts, as Part ii does (L365). throttleCap is in bars.ts (L1969). trimmedWeaponPower and weaponBarsUsable are in bars.ts (L2241-2244). barrelShots(state, i, barrel) is in weapons.ts (L2641). sensorRange, pointSeen and contactSeen are in science.ts (L3052-3069). fireTileOf is in hazards.ts (L1672). LOW_AIR_FRAC is in duel/tuning.ts (L1651). The contracts lines `{ kind: 'shipAirlock'; index: number }` and `{ kind: 'weaponPower'; slot: number; delta: number }` and `weapon?: 'beam' | 'pew'` are at L1114, L2332 and L2855, so the pre-flight greps match.
- Task 1's quoted edits match shipHudModel.ts lines 1-6, 14-20 and 22-end. ROOM_LEVELS, sysColumnX, sysIconY, sysBarY and HudSystem are used only in shipHudModel.ts, ShipHud.tsx and the two rewritten tests. I recomputed the layout assertions: panel y 557, h 155, x+w 334; bars, heat, coolant and name stack correctly.
- Task 2's quoted edits match app/duel/input.ts: line 36 (ConsoleInput), 101, 121, 135, 143-144, plus the `freqTo?` member. actions.ts:4, :55 and :74 match. Derived.doorTileToEdge and airlockOfTile exist (derived.ts:11, :17). Placement {scale,x,y} is exported from interiorCamera.ts:12. The Hound's O-Q door is at (12,7), the Hold airlock at (0,7), and (14,7) is Quarters floor (hound.json:4-21, :108-112, :221-225).
- Task 3's quoted lines match runtime.ts:362-363 (a prefix match) and onlineDuel.ts:191-192. Single player samples keys every frame and runs play only when unpaused (runtime.ts:485-498), so paused clicks are dropped as Decision 1 says. The online pump drops them off 'running' (onlineDuel.ts:258, :266). Both modes call setConsole(keyboard.ui) (duelMode.ts:55, onlineDuel.ts:87), so HUD clicks reach the same queue, and online they are sent through send() like throttle.
- Task 4 consumes names that exist: CRT tones glass, faint, dim, mid, main and hot, plus blink and ALERT_BLINK_HZ (crtTheme.ts:6, :14, :17); CrtProvider, CrtGlow and useCrt().now (CrtContext.tsx:12-31); useUi and useActions (context.tsx:13-14); Box attrs (Box.tsx:6); boxCss (geometry.ts:8). The Stage sets pointerEvents none (Stage.tsx:7), so the Hit divs' 'auto' is what takes clicks. fireEvent.pointerDown with a button has precedent (contactWindow.test.tsx:59).
- Task 5's quoted lines match interiorView.ts:23-24, 46, 51, 70, 95, 101, 110, 135 and the labels.forEach block at 138-147. interiorModel.ts:13 matches. rooms.fireRepair, breaches.repair, o2 starting at volume, roomIndex, roomTiles, siteRoom and siteTile exist (sim/state.ts:31-35, :116-119; derived.ts). I checked the airTint arithmetic: 0.375→0.15, 0.25→0.3 and 0→0.55 are exact in floating point.
- Task 6's quoted lines match scene.ts:18, 137, 180, 261 and 301, duelMode.ts:51-52, 72-73 and 105, and onlineDuel.ts:308. The left button only clicks; right and middle drag (input.ts:226-227), so a door click never comes from a pan.
- Task 7's quoted lines match consoleModel.ts:12, 26, 54, 105 and 122 (`t` is in scope at :101). They match HelmStation.tsx:36, 46 and 53, and DuelUi.tsx:46. Button renders aria-disabled and ignores presses while disabled (Button.tsx:45, :56). There are exactly three throttleRequest calls (runtime.ts:394, :421; onlineDuel.ts:201). seatDuelCrew seats the helm player at Navigation and the other at Weapons (tests/helpers/duelSeat.ts:10-13).
- Task 8's quoted lines match consoleModel.ts:36 and :109, contactController.ts:14-15, actions.ts:67 and :69, runtime.ts:447, onlineDuel.ts:233 and contactModel.ts:71 and :86. The contact controller carries any Weapon through pickUp, pick and aimWeapon (contactController.ts:94-126). Only DuelUi and FlightStation import WeaponsStation, and targetText stays exported.
- Task 9's quoted lines match tacticalModel.ts:83, 99, 133, 404-405, 422 and 426, weaponsModel.ts:145-146, 154, 177 and 247, and tacticalLayer.ts:246. headingAngle, ringCrossesRect, ownS and z are in scope (tacticalModel.ts:171, :205, :303, :333). createCamera, worldToScreen, createTacticalState, targetOf, missileOf and derelictPos exist with the shapes the test assumes. The off-screen enemy arrow is already gated on `ships` (tacticalModel.ts:384). stepFog is pure in its `now` argument, so the ghosts are per screen and testable.
- Every test file the plan runs exists: the 20 .test.ts files, the 7 .tsx files and both helpers. Smoke selectors: 'single-player' (Home.tsx:10) and `ship-${id}` (ShipPicker.tsx:11). TILE_PX is 32 (shared/resolution.ts:6), as the smoke hard-codes. The smoke has nine check() calls, matching 'nine ok lines'.
- Online refusals for ship commands are not surfaced in either mode. The plan records 'a refusal flash on a full reactor' as a candidate in the report (plan L2790), so it is a known limit rather than a hidden gap.

## Not verified
- Whether `npx tsx -e "import c from './…/cutter.json'; …"` (plan L142) accepts a JSON default import in eval mode. I didn't run it.
- The smoke's walk to the Weapons seat (plan L2690-2698): the spawn tile, the 3.4 tiles/s speed and which console `consoleInReach` picks are heuristics with retries. I didn't check the start-aboard spawn positions or run the app.
- Whether the Hunter is already active at Single-player round start (the smoke force-activates it at L2703), and how far apart the two spawns actually are (I only confirmed SPAWN_RADIUS 2000).
- Which other existing scene and UI tests, beyond tests/contactScene.test.ts, assume a drawn or clickable enemy at round start and will fail under the fog (Task 9). I grepped only contactScene.
- Whether Part i's fallout edits (its Task 12 rule) touch consoleModel.ts, scene.ts or the UI files whose lines Part ii quotes from master. If they do, the quotes may not match the branch.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `3c9f45ec`. 8 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Pew pew untargeted at round start in the test

Confirmed against Part i L2530 and Decision 17. The Task 8 test now expects target Room.Shields and ready true.

## R1-F2 [P1]: aimWeapon 'pew' breaks FlightStation

Confirmed: FlightStation.tsx:22, :27; DuelUi.tsx:45. Task 8 narrows the value at the DuelUi call site and stages DuelUi.tsx.

## R1-F3 [P1]: Torpedo fog test moves the wrong pool entry

Confirmed: state.ts:247-251 uses the first free entry. The test now uses the returned entry, and the deferred bullets are removed.

## R1-F4 [P1]: Task 11 overwrites Part i's report

Confirmed. Task 11 is now a Modify that keeps Part i's sections and appends Part ii's.

## R1-F5 [P2]: Duplicate measurement script

Confirmed. It is dropped, and Part i's script and lines are quoted.

## R1-F6 [P2]: Optional ConsoleInput calls

Confirmed: actions.ts:49. The calls now use `?.()`.

## R1-F7 [P2]: Fog hides the round-start enemy in existing tests

Confirmed: SPAWN_RADIUS 2000 against a start range of 900. Task 9 gives the grep and one recipe (move ships[1] to within 600), and Task 10 repeats it.

## R1-F8 [P3]: HUD deviations and overlapping markers

Confirmed. The heat bar turns hot above 75 %. The breach marker is offset half a tile when it shares a tile with a fire. Decision 16 puts the coolant count in the header over the reactor column.

## Also changed

- Task 8 Step 5b: situationModel's WEAPONS OFFLINE shows only when every weapon is dark (handed over from Part i refine R1-F5), with a test.

## Files changed

- docs/superpowers/plans/2026-11-18-engineering-spike-ii-hud.md

<!-- end -->

---

# Round 2 (delta, reviewing f52b8386, effort medium, 152 s, 938040 in / 866564 cached / 13546 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 Step 5b's weaponsOffline and LAUNCH refusal bring back `rooms[Weapons] ≥ 2` as a crew gate, which Part i removed; feelIiModels breaks and is not in any run list
Step 5b's new `weaponsOffline` starts with `sys.rooms[Room.Weapons] >= 2 ||`. Its `refusal` rewrite also keeps `if (sys.rooms[Room.Weapons] >= 2) return 'WEAPONS OFFLINE';` for LAUNCH. Part i makes the crew's gates bars-only: crew `laserOffline` is `barrelShots === 0`, and crew `canLaunch` is `weaponBars(Torpedo) >= 1`. Part i's fallout rule also names `rooms[Weapons] ≥ 2` as a replaced rule. So with the Weapons room at level 2 and bars still on a weapon, the console reads WEAPONS OFFLINE and refuses LAUNCH while the sim fires and launches. The changed FIRE wording also breaks the existing `tests/feelIiModels.test.ts`, which Step 6 does not run. That file's L213 expects FIRE `null` at round start, but Part ii now gives 'BEAM UNPOWERED' because the beam starts dark. L218 expects WEAPONS OFFLINE for FIRE with `rooms=2`, but FIRE now turns only on the beam's bars. L233-236 asserts `refusal(launch) === null` exactly when `canLaunch` is true, over `rooms` 0..2, and the kept rooms check breaks that. · plan L2026-2029 (`weaponsOffline` with `sys.rooms[Room.Weapons] >= 2 ||`), L2062-2065 (the rooms≥2 LAUNCH line kept), L2101-2102 (Step 6 run list, no feelIiModels); Part i plan L49 (kind (a) lists '`rooms[Weapons] ≥ 2` as the crew's laser gate'), L2771-2774 (crew canLaunch: `weaponBars(s, WeaponSlot.Torpedo) >= 1`), L2784-2786 (crew laserOffline: bars only), L3037 (situationModel belongs to Part ii); tests/feelIiModels.test.ts:213, :218, :233-237; src/renderer/src/render/duel/situationModel.ts:189. · The console gives reasons the sim doesn't act on (the 'never a dead click' rule that feelIiModels guards). The failures first show up in Task 10's full suite, and no recipe there covers them. · Drop `sys.rooms[Room.Weapons] >= 2 ||` from `weaponsOffline`. In `refusal`, delete the kept rooms≥2 LAUNCH line so the torpedo-bars line matches `canLaunch`. Add `tests/feelIiModels.test.ts` to Step 6's run, with the updates spelled out: at L213 set `sys.weaponPower[1] = 1` (beam powered) before asserting `null`, or expect 'BEAM UNPOWERED'; at L218 zero `weaponPower` in place of `rooms[Weapons] = 2` to get WEAPONS OFFLINE; L236 then holds. Name the file in the Step 11 git add.

### [P3] R2-F2 Step 5b's new test leaves the seed and the hx/hy check to execution
The test hand-places the Hunter 200 ahead. The plan then says 'Check `hx` and `hy` against direction.ts', and if an asteroid blocks the line at seed 5, to 'try seeds 6 to 9'. Both are checks deferred to execution. The first isn't needed: `hx` and `hy` exist at direction.ts:6-7. · plan L2072-2079, L2095; src/renderer/src/sim/tactical/direction.ts:6-7. · Under this review's rules, a check left to execution is a defect. It is small here. · Delete the hx/hy check. Make the line of sight certain in the test instead of searching seeds: deactivate the asteroids before the assertions, or assert `lineOfSight(t, …)` true as a precondition at a fixed seed the author has checked.

## Prior findings
- R1-F1: resolved — L1827 imports Room. L1847 expects `{ shots: 2, target: Room.Shields, ready: true }`. This matches L1911's mapping and Part i L2627 (pewLock Shields, pewTargeted true, pewCharge = chargeUnits).
- R1-F2: resolved — L2303-2310 narrows `aim` at DuelUi's FlightStation call site. DuelUi.tsx is in the Files list (L1784) and in the git add (L2325).
- R1-F3: resolved — L2389-2391 uses the entry `placeMissile` returns. The deferred-assumption bullets are gone.
- R1-F4: resolved — File table L107 now reads 'modify (T11)'. Task 11 Files (L2678) and Step 4 (L2778-2780) append to Part i's report and keep its sections, which match Part i L235-246. A 'Tests Part ii updated' section was added (L2808-2812).
- R1-F5: resolved — The script and its steps are gone (L2656-2671). The summary quotes Part i's measurement lines (L2795). A grep finds no stray references to engineering-measure or msPerTick.
- R1-F6: resolved — L2209 and L2229 call `pewLock?.(-1)` and `weaponPower?.(slot, ±1)`. The conditional note is now a plain statement (L2299).
- R1-F7: resolved — Task 9 Step 9 (L2633-2641) gives the grep and one recipe (Hunter to +600) and drops the Sensors option. Task 10 Step 1 (L2671) repeats it. The recipe fits contactScene's rig (tests/contactScene.test.ts:51-53, rt.duel.tactical.ships).
- R1-F8: resolved — Decision 16 (L90) states the coolant-in-header choice. The heat bar turns hot above 0.75·heatMax (L882); PowerColumn has heat and heatMax (L273). The breach marker sits half a tile lower when it shares a fire's tile (L1124-1125), fires are pushed before breaches, and the test expects y + TILE_PX/2 (L1058).

## Verified
- Step 5b's quoted 'replace' texts match situationModel.ts:46-48, :51 and :187-189 exactly, and consoleModel.ts:110's laserCardReason call matches the quoted text
- Part i leaves the laserOffline/laserFull defaults at barrel = 'beam' (Part i L2754, L2784), so situationModel's existing calls still match after Part i
- trimmedWeaponPower and WeaponSlot are exported from sim/tactical/bars (Part i L2329, L2340); pewTargeted and pewBurst are ShipSystems fields (Part i L2619)
- Traced the new 5b test through the planned code: round start gives 'solution' via pew pew (charge full, targeted); weaponPower[0]=0 gives 'none'; weaponPower[2]=0 gives 'offline' and WEAPONS OFFLINE for both FIRE and LAUNCH; seatDuelCrew is imported (L1832)
- hx and hy exist (direction.ts:6-7)
- There is no noUnusedLocals in the tsconfigs, so the leftover laserOffline import in consoleModel is harmless
- valkyrnViews.test.ts:95-99 is unaffected: there is no laser slot, so laserSituation returns early at line 42 and refusal('fire') goes to gunReason at line 185
- Task 10 now has no Files and no stale Step 2 or 3 references; Task 11's summary placeholders point at Task 10 Step 1 and Part i's sections

## Not verified
- Whether the Task 9 Step 9 grep (BRE with `\|` and `\b`) behaves the same in Git for Windows' regex engine; I did not run it
- How Part i's executor will have left tests/feelIiModels.test.ts:213/:218 (the fallout rule decides that), so the exact pre-Part-ii text of those lines is unknown
- Whether seed 5 has a clear line of sight 200 units ahead of the Hound's spawn; not run, because the suite must not be run

---

# Round 2 response (plan revised)

Reviewed `round-2.json` against the subject at `1ce915b4`. 2 accepted, 0 rejected, 0 deferred. Every R1 ID is confirmed resolved.

## R2-F1 [P1]: weaponsOffline reintroduces the rooms gate; feelIiModels breaks

Confirmed in part. Part i's trimmedWeaponPower (Part i plan L2340-L2348) reads effectiveBars, so a level-2 Weapons room already zeroes every weapon, and the sim and console would agree. The rooms check is therefore redundant rather than contradictory. It is dropped anyway, so the bars are the one gate. The feelIiModels breakage is real (L213, L218): the exact edits are now spelled out, and the file is in the Step 6 run and the Step 11 add.

## R2-F2 [P3]: Seed and hx/hy deferred

Confirmed (direction.ts:6-7). The note is removed. The test clears the asteroids and asserts lineOfSight as a precondition at seed 5.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-engineering-spike-ii-hud.md

<!-- end -->

---

