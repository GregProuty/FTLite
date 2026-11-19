# Codex review exchange: valkyrn-ii-ship-and-views-plan

Subject: `docs/superpowers/plans/2026-11-18-valkyrn-ii-ship-and-views.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 77064aa0, effort high, 986 s, 25701408 in / 25348390 cached / 86951 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 3 rewrites fleet.ts in full and deletes Part i's HULL_IDS, which schema.ts imports
Task 3 Step 5 says `src/renderer/src/sim/ship/fleet.ts` "becomes:" and then gives the whole file. That file has no `HULL_IDS`. Part i Task 3 Step 4 appends `export const HULL_IDS = ['hound', 'scout', 'valkyrn'] as const;` to fleet.ts, and `schema.ts` gets `import { HULL_IDS } from './fleet'` and `hull: z.enum(HULL_IDS).optional()`. After Task 3 Step 5, schema.ts imports a name that no longer exists, so Task 3 Step 6's `npx tsc -b` fails. The plan never mentions HULL_IDS. Decision 6 also misreads Part i: it says schema.ts may hold quoted ids, but Part i put them in fleet.ts precisely so that it does not. · plan L669-698 (fleet.ts "becomes:", no HULL_IDS); plan L49 and L704 (Decision 6); Part i plan L50 (Decision 6: HULL_IDS in fleet.ts, Part ii's HullId can be (typeof HULL_IDS)[number]), L870-876 (append HULL_IDS), L878 and L888 (schema imports it, z.enum(HULL_IDS)); current .worktrees/sci-2/src/renderer/src/sim/ship/fleet.ts:1-7 · Task 3 cannot pass its tsc gate as written. An executor who reads the literal-test output through Decision 6 may also turn `hull` into z.string(), which breaks Part i's valkyrnCrew test (it expects `{ hull: 'cutter' }` to be rejected). · Make Step 5 an append or edit, not a replacement: keep Part i's `HULL_IDS` export and add LINES/FLEET/tubeLoadsItself/SOLO_SHIPS around it. In hullModel.ts, write `export type HullId = (typeof HULL_IDS)[number]` (importing the type from fleet), or keep the literal union and add a test that it equals HULL_IDS. Drop Decision 6's conditional: schema.ts carries no id literal after Part i.

### [P1] R1-F2 Inserting the Valkyrn controls section at index 1 breaks settingsAndControls.test.ts:39 (sections[1] is the sector list)
Task 8 Step 8 puts `{ title: 'Single player: Valkyrn' }` second in `controlSections()` and updates only line 36's title list. Line 39 still reads `const sector = sections[1]!.rows...` and line 40 then expects it to contain the labels of SECTOR_KEYS: W, A, S, D, E, F, Q, R. Index 1 is now the Flight rows (Mouse, Hold left mouse, ..., Tab), which lack 'A', 'D' and 'F', so the existing test fails. · plan L2282 (return order and the :36 edit only), plan L2008 (file list names only :36); .worktrees/sci-2/tests/settingsAndControls.test.ts:36, :39-40; .worktrees/sci-2/src/renderer/src/input/sources.ts:4 (SECTOR_KEYS up W, left A, down S, right D, interact E, confirm F, cancel Q, callout R) · Task 8 Step 9 runs tests/settingsAndControls.test.ts and expects PASS. It will fail, and the executor has no instruction for fixing it. · In Task 8 Step 8 also change line 39 to `const sector = sections.find(s => s.title === 'Multiplayer')!.rows...` (or `sections[2]`), and list `tests/settingsAndControls.test.ts:36,39` in the Files line. Alternatively, append the Valkyrn section after 'Multiplayer' and keep its index.

### [P2] R1-F3 pushGunHits infers the shield pop from gunWear instead of Part i's gunHit.stripped
Part i gives the `gunHit` event `stripped: boolean` explicitly for Part ii's shield pop. Part ii's `pushGunHits` ignores it and pops when `s.gunWear === 0` after the frame, and floats `-1` when `s.gunHull === 0`. Events are drained once per frame, and a frame can span several ticks. Two shield hits in one frame where the second is the strip pop twice. A strip followed by another hit pops never. The same applies to hull steps. The test builds events without `stripped`, under `as never`, which hides the type mismatch. · plan L1960-1972 (pushGunHits), L1774 (test events lack stripped, cast as never); Part i plan L46 (Decision 2: gunHit carries stripped; the view's shield pop reads it), L1660 (event type), L2243-2252 (the sim sets stripped and resets gunWear and gunHull); spec L269-270 · The shield pop is wrong whenever two hits land in one frame. This is the feedback the spec asks for (§7.4), and the test cannot catch it. · Pop on `e.room < 0 && e.stripped`. For `-1`, either keep the gunHull heuristic and document its limits, or compare the target's hull with its value at the previous frame. Give the test's events a real `stripped` field and drop the `as never`.

### [P2] R1-F4 Task 7 Step 5 repeats Part i's type-only null-laser guards; its quoted find-texts no longer exist
Part i Task 2 (its Decision 11) already turns hitModel's `const units = classOf(state, ship).slots.laser.chargeUnits;` into `const laser = …; if (!laser) return null;`. It turns consoleModel's `burst: classOf(t, 0).slots.laser.shots,` into `?.shots ?? 0`. It inserts `if (!laser) return { kind: 'none' };` after laserSituation's long line, and guards contactModel:180. Part ii's Task 7 Step 5 and Step 4's first bullet give those same pre-Part-i texts as the strings to find and replace. The Global Constraints tell executors to find each edit by its quoted text. · plan L1853-1858 (split the laserSituation line), L1888-1895 (hitModel, contactModel, burst); plan L26 (find by quoted text); Part i plan L55, L185, L579-582 · An executor either stalls on a missing anchor or adds a second guard. It is harmless but ambiguous, which the brief counts as a defect for verbatim execution. · Rewrite those bullets against Part i's post-state. hitModel's enemyCharge and the burst guard are already done, so drop them. In laserSituation, Part i's guard already returns 'none', so no split is needed. For contactModel:180, change only Part i's ternary to the `if (cls.slots.laser)` form, or leave it.

### [P2] R1-F5 leadPip's nine-number signature disagrees with Part iii's adapter leadPip(st, 0)
Part ii produces `leadPip(sx, sy, svx, svy, tx, ty, tvx, tvy, speed): Lead | null`. Part iii's tests/valkyrnLead.test.ts calls `leadPip(st, 0)` with a cast, assumes a (state, i) form, and leaves the fix to execution. As written it is a tsc error: 9 arguments expected, 2 given. · plan L1485 and L1607 (signature); Part iii plan L163, L178-182 (viewOffset calls leadPip(st, 0)), L274 ("If leadPip's signature differs, fix the adapter") · The two sibling parts disagree on a produced name's signature, and Part iii's executor has to discover that during execution. · Pin the signature in the shared contract and in Part iii's adapter: `leadPip(s.x, s.y, s.vx, s.vy, t.x, t.y, t.vx, t.vy, GUN_SPEED)`, then subtract the shooter's position. Or have Part ii also export a `leadPipFor(state, i)` wrapper that Part iii calls.

### [P2] R1-F6 The gun's left-button state can stick on when the button is released off the canvas or the window loses focus
`left` is set by the canvas's pointerdown. It is cleared only by the canvas's pointerup, a canvas pointermove with the button bit clear, or `clear()`. The pointer source listens on the canvas only. Press on the map, drag onto the Flight block, Helm block or contact window (DOM over the canvas), and release there: the canvas sees no up or move, so `gunHeld` stays true and the minigun keeps firing until the pointer comes back over the canvas. Alt-tab while holding does the same. Decision 12 acknowledges the canvas gets no moves over the DOM side tools. · plan L980-986 (leftHeld set and cleared only by canvas handlers and clear), L55 (Decision 12); .worktrees/sci-2/src/renderer/src/app/duel/input.ts:240-244 (listeners on `target`); .worktrees/sci-2/src/renderer/src/app/duel/duelMode.ts:56 (target is the canvas) · The pilot overheats and wastes fire they did not ask for. That is a visible control bug on the one new binding the spec centres on (§5.1: left mouse held). · On pointerdown with button 0, call `setPointerCapture` (or add a window-level pointerup/pointercancel listener) and clear `left` on window blur. Add a test: pointerdown on the target, pointerup dispatched on window, then leftHeld() is false.

### [P3] R1-F7 Three conditional branches are already decided by the sibling plans
Decision 6 (schema literals) cannot trigger: Part i uses `z.enum(HULL_IDS)` imported from fleet.ts, and its fallback would break Part i's test. The '0/1 gunLocked' alternative is dead: Part i types `gunLocked: boolean`. Decision 21 / Task 4 Step 13 is certain: Sci-2 sets the per-player record arrays to `z.array(uint).min(2).max(4)`. Each is written as 'if X, do Y' where X is already known. · plan L49, L704, L1849, L64, L1253-1256; Part i plan L888, L1629, L744; Sci-2 plan L593-594 · Executors have to probe what the plans already state, and Decision 6's fallback contradicts Part i. · Remove Decision 6 and the gunLocked note. Make Step 13 an unconditional edit: change `const crew = z.array(uint).min(2).max(4)` to `.min(1)` in net/duelRecord.ts.

### [P3] R1-F8 In the Tab ship view the seated pilot's keys still fly the ship (A/D turn and clear the held bearing)
With shipView set, `play` still runs the Flight branch: W/S throttle, F or right-click launch, Q/E. `activeHeld` still sends `moveX` and `face`, so A/D (the walking keys a player reaches for in the interior view) turn the ship and, by Part i's rule, clear holdHeading. Only the gun and the bearing are suppressed. · plan L1071-1077, L1080-1107 (Flight branch not gated on shipView), L1115-1121 (activeHeld moveX and face unconditional); Part i plan L1369 (A/D or face clears holdHeading) · The pilot changes course without seeing the map. The spec leaves input in ship view unstated (§4.4), so the plan should choose explicitly. · Either zero moveX and face and skip the Flight branch (apart from Tab) while shipView is set, or state in Decision 11 that the ship view keeps the Flight bindings, and add a test for the chosen rule.

## Verified
- valkyrn.json (plan L403-463) passes every superRefine rule in .worktrees/sci-2/src/renderer/src/sim/ship/schema.ts:28-121, checked by hand: rows 19 wide x 7; all six rooms drawn; the five doors are '+' and touch only their two rooms; every '+' has an edge; the room graph is connected; the six breach sites are '#' tiles adjacent to their room, unique, and on the outer hull; 7 stations, one per kind; total allocation 8 (Hound's); the console groups are on room floor tiles, with grouped stations on the group tile and no shared ungrouped tiles; spawns.min(4) holds with all four on floor; both airlocks are '#' with exactly one inward room neighbour, space or out of bounds opposite, and not breach sites.
- Repair points (13,4) O, (6,3) R, (2,3) E are floor tiles of their rooms and not station tiles; createDuel's checks (.worktrees/sci-2/src/renderer/src/sim/duel/state.ts:91-95) take DUEL_REPAIR_POINTS[layout.id].
- Parity under spec §3.3: Valkyrn systems equal the Hound's (hound.json:27-62 non-null systems); station kinds equal; repair points [0,1,2]; console groups minus navigation+weapons equal the Hound's [science,engineering,doors] (hound.json:209-212).
- BATTLEMAPS.valkyrn arithmetic: origin (-7.5,-12.5) at 70 px puts tile centres at 560+70tx and 910+70ty; bounds from the (35,28)-(2174,2178) box are x -7, y -12.1, w 30.557, h 30.714.
- battlemapFor now reads only its own asset. featureReady(…,'battlemap') is used nowhere else (grep of src/renderer/src), and propLayer.test.ts:28 needs this change once FEATURE_NAMES.battlemap gains a second name.
- The no-id-literal regex finds, on sci-2 today, only hudModel.ts:345 outside the allowed files (plus hullModel.ts, fleet.ts and defs.ts, which are allowed). None of Part ii's new src files (FlightStation, ShipPicker, leadModel, runtime, scene, settingsStore, store, menuState) adds a quoted id; the literals are in tests or allowed files.
- UI boundary (tests/uiBoundary.test.ts:39-45 checks direct value imports only): ShipPicker imports only ../context, ./MenuButton and ./styles; FlightStation imports render/* and ui/*; Settings.tsx already imports app/settingsStore; the picker list reaches React through the settings slice filled in main.ts.
- Consumed sci-2 interfaces exist with the assumed shapes: seatOf/stepTorpRoom/consoleInReach (controls.ts), sitDown seats every group member (stations.ts:31-39), PointerSource/createPointerSource text anchors (input.ts:176-262), WEAPON_CODES/FREQ_CODES/PRESS_CODES/PING_CODE/FIRE_HELD (input.ts:11-26), runtime anchors (runtime.ts:232-486), scene anchors (scene.ts:169-283), contactController intercept lines (contactController.ts:120-133), consoleModel/consoleTabs (consoleModel.ts:55-99), TabStrip, TargetingLine's `from` local, HelmStation:70 hint, the consoleLayout constants (STATION, EDGE, weaponCard), sitModel SIT_CARDS/shown/resetSits, headingOf/pickRadius/interpolatedShip/pickContact exports, CrtView already includes 'flight' (crt.ts:7), and the __FTLITE_STAGE__ hook (duelMode.ts:69-70).
- Part i names consumed by Part ii match Part i's plan: createDuel(layout, seed, helmPlayer, crew, cls), DuelState.crewClass, classIndexById, VALKYRN_CLASS/VALKYRN_LASER_CLASS, GUN fields (speed, lifeTicks, heatMax), createTacticalState(seed, slots, crewClass), ShipClass.Valkyrn, ShipSystems.gunHeat/gunLocked (boolean)/gunWear/gunHull, TacticalState.rounds (GunRound with active), tickGun(state, i, input), HeldInput.aim/gunHeld, layout.crew/helmHoldsUnattended/hull, slots.laser/gun nullable, and aim setting holdHeading (Part i L1369-1373).
- The Flight seat bindings in plan Task 4 and Task 8 cover spec §5.1 row by row. Tab at n=1 toggles the console and ship view with no presence swap. There is no heading command and no HDG map marker (holdHeading -1 in the Flight map input).
- Hound behaviour is preserved by each change as written: crew>1 branches in the runtime; the sentAxes rewrite is equivalent when helmHoldsUnattended is absent; the stateAxes rewrite is equivalent; consoleTabs adds no flight key on the Hound; combatModel adds no gun keys without a gun; lobbyLines through tubeLoadsItself gives the same output; the contactController laser default is true.
- leadPip maths checked on the plan's pure cases: rest-relative target t=500/700; outrun target gives both roots negative, so null; coincident gives t=0, so null; onTarget at heading 64 points +x.
- Crosshair, pip, brackets, heat bar and tracers use CRT.mid/hot/main/dim only. Task 7's crtColours case covers on/off and locked/unlocked; the NOTES pool of 13 fits the full frame's 8 words.
- The VALKYRN hull outline has 53 vertices (106 numbers). The room polygon areas (0.216, 0.208, 0.210) and the f-ordering of the room centres (0.38 > -0.15 > -0.49) match the hullModel test edits.

## Not verified
- Whether setting the enemy hull to 0 and running one tick decides the round as CrewWins (the valkyrnRuntime 'valid solo record' case): the sim's outcome check was not traced.
- Whether the VALKYRN room polygons are fully inside the outline and cross no outline edge near the wing-root notches (around f -0.44, s ±0.58): only partly hand-checked; the plan says it checked this with the test's predicates.
- Whether the two sim fly-out lead tests meet their 10 u and radius bounds with the 12 u lateral muzzle offset and heading quantisation (stepRounds and the tickGun spawn are Part i code that does not exist yet).
- Whether tests/menu.test.tsx lines 51, 52 and 93 run with a settings fixture that has `ships` (a settings:null fixture would render no ship-hound button).
- Whether the gameplay content digest (build/contentDigest) changing because of the new sim/ship files affects any `same` script: neither script was read.
- Task 1 Step 9's expected alpha bbox (21,16,2180,2186) and Decision 1's trace against the painting: the PNG is outside the repo and was not opened.
- I read ui/menu, actions.ts, store.ts and the helpers beyond the manifest's named files, to check the picker wiring.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `77064aa0`. 8 accepted, 0 rejected, 0 deferred; no prior IDs.

## R1-F1 [P1]: Task 3 rewrites fleet.ts in full and deletes Part i's HULL_IDS, which schema.ts imports

Confirmed. Part i plan L870-888 appends `HULL_IDS` to `fleet.ts` and makes `schema.ts` import it for `z.enum(HULL_IDS)`; the Task 3 Step 5 listing omitted it. The listing now ends with Part i's `HULL_IDS` export, unchanged, with a line saying `schema.ts` imports it. `hullModel.ts` line 5 becomes `export type HullId = (typeof HULL_IDS)[number]` with a type-only import, so the lists cannot drift. Decision 6 now states Part i's layout as a fact, and the Step 5 fallback to `z.string()` and the schema `git add` note are removed. The `isHullId` doc comment no longer calls the field a plain string.

## R1-F2 [P1]: Inserting the Valkyrn controls section at index 1 breaks settingsAndControls.test.ts:39

Confirmed. `.worktrees/sci-2/tests/settingsAndControls.test.ts:39` reads `sections[1]` for the SECTOR_KEYS. Task 8 Step 8 now also changes that line to `sections.find(s => s.title === 'Multiplayer')!`, and the Files line lists `:36,39`.

## R1-F3 [P2]: pushGunHits infers the shield pop from gunWear instead of Part i's gunHit.stripped

Confirmed. Part i Decision 2 and L1422 give `gunHit` a `stripped` flag. `pushGunHits` now pops on `e.room < 0 && e.stripped`. The `-1` keeps the frame-end `gunHull === 0` test because the event carries no hull flag. Its doc comment states the limit: two room hits in one frame, the first stepping the hull, float no `-1`, which needs a frame hitch since rounds leave 6 ticks apart. The test events are typed `ViewEvent[]` with `stripped`, the `as never` is gone, and a non-stripping shield hit (spark only) is added.

## R1-F4 [P2]: Task 7 Step 5 repeats Part i's type-only null-laser guards

Confirmed. Part i plan L579-582 (Task 2 Step 9) already makes the `hitModel`, `contactModel:180`, `consoleModel` burst and `laserSituation` edits. Task 7 Step 4's `laserSituation` bullet now says to leave Part i's guard, since it already returns `none`. Step 5 drops the three repeated bullets, and only `chargeRow` is left. `hitModel.ts`, `contactModel.ts` and `consoleModel.ts` are removed from Task 7's Files, `git add`, title and commit message, and from the file table row. Part i's contact-line ternary stays: the enemy is always the Hunter.

## R1-F5 [P2]: leadPip's nine-number signature disagrees with Part iii's adapter leadPip(st, 0)

Confirmed. Part iii plan L178-182 calls `leadPip(st, 0)`. Task 6 now pins the nine-number `leadPip` in its Interfaces as the contract and adds `leadPipFor(state, i)`. That function reads ship `i`, `targetOf` and the class's `gun.speed`, and returns null without a gun or an active target. A pure test checks it against the nine-number form and against the Cutter (null). Part iii's adapter must call `leadPipFor(st, 0)`: that is a cross-plan item for the coordinator.

## R1-F6 [P2]: The gun's left-button state can stick on when released off the canvas or on blur

Confirmed. `.worktrees/sci-2/src/renderer/src/app/duel/input.ts:240-244` listens on the canvas only. `createPointerSource` gains an optional `release` source (the window): its `pointerup` (button 0) and `blur` clear `left`, and `destroy` removes them. `duelMode.ts` passes `window`. A new `tests/duelInput.test.ts` case covers a release on the window, a blur, a canvas release and listener cleanup. Decision 12 now states the rule.

## R1-F7 [P3]: Three conditional branches are already decided by the sibling plans

Confirmed. `.worktrees/sci-2/src/renderer/src/net/duelRecord.ts:26` is `const crew = z.array(uint).min(2).max(4);`, and Part i types `gunLocked: boolean` (L28). Decision 6's conditional and the `gunLocked` 0/1 note are removed. Decision 21 and Task 4 Step 13 are now an unconditional `.min(1)` edit, and `net/duelRecord.ts` is in Task 4's Files and `git add`. The self-review "Placeholders" line is updated.

## R1-F8 [P3]: In the Tab ship view the seated pilot's keys still fly the ship

Confirmed: the plan's `activeHeld` sent `moveX`/`face` regardless of `shipView`. Chosen rule (Decision 11): the ship view keeps the course. The runtime's `look` flag zeroes `moveX` and drops `face` while the Flight seat is in the ship view, and the pointer bearing and gun were already dropped there. Throttle, launch and Q/E still work because they do not turn the ship. The ship-view runtime test now holds A and Space and asserts `moveX: 0` with no `face`.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-valkyrn-ii-ship-and-views.md

<!-- end -->

---

# Round 2 (delta, reviewing 21b41758, effort medium, 55 s, 326336 in / 279965 cached / 4946 out)

Verdict: ready

## Findings

### [P3] R2-F1 Task 4 Step 16 still carries the old conditional git-add note for duelRecord.ts
Step 16's `git add` now always lists `src/renderer/src/net/duelRecord.ts` and `tests/duelInput.test.ts`. The note below it still reads "(Add src/renderer/src/net/duelRecord.ts and any fake-pointer test file if Steps 4 or 13 changed them.)". That is a leftover of the conditional that R1-F7 removed, and it contradicts the self-review line saying no step depends on how a sibling turned out. · plan Task 4 Step 16, git add line (now includes net/duelRecord.ts and tests/duelInput.test.ts) and the parenthetical directly after the commit block; plan Self-review 'Placeholders' line (L2463) · It is harmless, but it tells executors to probe for a change that Step 13 now always makes. · Delete the parenthetical. If other fake PointerSource objects outside tests/duelInput.test.ts get `leftHeld`, name those files explicitly instead.

## Prior findings
- R1-F1: resolved — The Step 5 listing keeps HULL_IDS as its last export. hullModel derives HullId from it through an `import type`, which TypeScript allows in a typeof position. hullModel.ts and fleet.ts are both in the literal test's ALLOWED set (plan L545). Decision 6 now states Part i's layout as fact, and the z.string fallback is gone.
- R1-F2: resolved — Task 8 Step 8 rewrites line 39 to find the 'Multiplayer' section, and the Files line lists :36,39.
- R1-F3: resolved — pushGunHits pops on e.stripped. Part i's DuelEvent has `stripped: boolean` (Part i plan L1662), and ViewEvent = DuelEvent | ContactEvent (fxModel.ts:14), so the typed test array compiles without `as never`. The expected sequence spark, spark, pop, spark with one '-1' matches the code. The hull heuristic and its limit are documented.
- R1-F4: resolved — Step 4 leaves Part i's laserSituation guard alone. Step 5 keeps only chargeRow. hitModel, contactModel and consoleModel are dropped from Files, git add and the file table.
- R1-F5: resolved — leadPipFor(state, i) is added and tested. targetOf exists (state.ts:213) and ships carry `active` (state.ts:22). The current Part iii plan no longer contains leadPip at all, so the remaining cross-plan wiring is outside this subject.
- R1-F6: resolved — The optional `release` source gets pointerup and blur listeners and removes them in destroy. It matches EventSource's (e: never) signature (input.ts:84-87), and destroy's single loop (input.ts:260) can take the extra calls. duelMode passes window. The new test uses the existing fakeTarget's fire and count and the existing `half`.
- R1-F7: resolved — Decision 6's conditional and the gunLocked note are removed. Step 13 is an unconditional `.min(1)` edit, and duelRecord.ts is in Files and git add. One stale parenthetical in Step 16 is raised above as a P3.
- R1-F8: resolved — Decision 11 picks a rule. The runtime's `look` flag zeroes moveX and drops face. The rig exposes `hold` (plan L803, L807), and the test asserts moveX 0 and no face.

## Verified
- createPointerSource at .worktrees/sci-2/src/renderer/src/app/duel/input.ts:204-262 has the `on` loop, destroy and clear that Task 4's edits anchor on
- tests/duelInput.test.ts:5-11 fakeTarget provides fire() and count() as the new left-button test uses them
- fxModel.ts:14 ViewEvent includes DuelEvent; Part i plan L1662 gunHit carries stripped
- state.ts:213 targetOf(state, i) exported; state.ts:22 active: boolean on bodies, as leadPipFor reads
- plan L545 ALLOWED includes render/tactical/hullModel.ts and sim/ship/fleet.ts, so the HullId comment's quoted ids and HULL_IDS are allowed
- plan L803/L807 rig returns hold, used by the revised ship-view test

## Not verified
- Whether other test files construct a PointerSource object literal that needs `leftHeld`. I did not search beyond duelInput.test.ts.
- How the current Part iii plan reads the lead pip. It no longer references leadPip, and I did not review it beyond that grep.

---

# Round 2 response (plan revised)

Reviewed `round-2.json` against the subject at `30abe756`. 1 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F8 as resolved.

## R2-F1 [P3]: Task 4 Step 16 still carries the old conditional git-add note for duelRecord.ts

Confirmed. The parenthetical after Task 4 Step 16's commit block was a leftover of the removed conditional, and it is deleted. I checked the fake-pointer half too. `grep PointerSource` over `.worktrees/sci-2/tests` finds only tests that call `createPointerSource` on a fake target (duelInput, duelModeAudio, duelModeDispose, feelIiInput, scienceInput), and none builds a `PointerSource` object by hand. Step 4's "Any test object typed `PointerSource` gains `leftHeld`" line now says so, so no file needs naming.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-valkyrn-ii-ship-and-views.md

<!-- end -->

---

