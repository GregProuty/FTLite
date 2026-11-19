# Codex review exchange: engineering-spike-ii-hud-plan-v2

Subject: `docs/superpowers/plans/2026-11-18-engineering-spike-ii-hud.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing c766762f, effort high, 721 s, 14889874 in / 14602489 cached / 59057 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 2's input.ts edits are quoted from before asteroids-ii and match nothing on master
Four of Task 2 Step 4's quoted 'Replace' blocks in app/duel/input.ts don't match current master. Asteroids-ii added `rockLock?` to ConsoleInput and `rockTo` to the keyboard. If an executor pasted the plan's replacement text anyway, rockTo would be lost from clear() and sample(). · plan L511 quotes ConsoleInput as one line ending `frequency(freq: number): void }`; master input.ts:36-38 ends `frequency(freq: number): void;` and then has the `rockLock?(weapon, rock): void }` member. Plan L529 `let presses = …` has no `rockTo`; master input.ts:105 does. Plan L538 `const clear` has no `rockTo = null`; master input.ts:125 does. Plan L551-552 (sample's `out` and its reset) have no rockTo; master input.ts:148-149 do. Only `frequency(freq) { freqTo = freq; }` (plan L544, input.ts:140) still matches. Existing test tests/duelRuntime.test.ts:457-458 drives `rockTo`. · An executor can't apply the edits as written. A forced paste breaks the rock-target clear that asteroids-ii relies on, along with its tests. · Re-quote all four edits from master. ConsoleInput: insert the `ship?` member after the `rockLock?` member, before the closing `}`. Keep `rockTo` in the `let`, in clear(), in the `out` literal and in the reset line, and add only `ship` / `ship = []`.

### [P1] R1-F2 Task 8's WeaponsStation rewrite drops asteroids-ii's rock targeting, and an existing test imports what it removes
Step 10 replaces the whole of WeaponsStation.tsx with a version written before asteroids-ii. It removes `export const WEAPONS_HINT`, the `rock` parameter of `targetText`, the cards' right-click `rockLock?(weapon, -1)` clear, 'TGT ROCK', and the `ROCKS n` count. The plan never states or justifies this regression. tsc -b and vitest will fail. · plan L2131: `targetText = (room: number)`, with no WEAPONS_HINT, no rockLock and no ROCKS line (L2101-2229). Master WeaponsStation.tsx:30 has `targetText(room, rock = false)`, :42 has `actions.console.rockLock?.(weapon, -1)`, :63 has `export const WEAPONS_HINT`, :72/84/93 have the rock flags, and :108 has `ROCKS ${weapons.rocks}`. tests/rockTargetUi.test.tsx:13 imports `{ targetText, WEAPONS_HINT }`, :38 calls `targetText(1, true)`, and :59-62 assert WEAPONS_HINT and the ROCKS width. tsconfig.web.json includes `tests/**/*`. Step 11 (L2237) does not run rockTargetUi. · The task fails its `npx tsc -b` gate. Even after patching, it silently removes the shipped rock-target UI, which spec §11 does not ask for. · Rewrite Step 10 on top of master's file. Keep targetText(room, rock), WEAPONS_HINT, the rock-aware right-click clear (in Pick), TGT ROCK on BEAM and TORPEDO, and the ROCKS count. Then fit FREE and the pip hint around them, and add tests/rockTargetUi.test.tsx to Step 11's run list.

### [P1] R1-F3 Task 8's model edits also predate asteroids-ii: the WeaponsPanel quote doesn't match, and the laserSituation quote matches twice
Step 4's WeaponsPanel replacement quotes a line that no longer closes the interface. Step 6's `laserSituation` replacement text now appears twice: once in the rock-target branch and once in the enemy branch. Two executors would edit different lines. Separately, the Task 8 model test clears rocks the pre-asteroids way. · plan L1908 quotes `… refused?: RefusedView | null }`; consoleModel.ts:37 ends `refused?: RefusedView | null;` and is followed by :38-40 `laserRock?; torpRock?; torpRockFlying?; rocks?: number }`. plan L1991 `  if (laserOffline(t, CREW_SLOT)) return { kind: 'offline' };` matches situationModel.ts:46 (inside the `sysRock.laserRock >= 0` branch) and :59. plan L1881 resets only `t.map.asteroids` and `t.grid`, while the repo's own helper tests/feelIiModels.test.ts:46 also resets `st.rocks = initRocks(st.map)`, because lineOfSight now walks the rock pool (geometry.ts:26). · Step 4 can't be applied as written. In Step 6, if only :59 is edited, a beam-dark ship aiming at a rock still shows WEAPONS OFFLINE on the BEAM card, which contradicts Decision 14. · Quote L37-40 and insert `weaponBars?: number[]; weaponFree?: number` before `rocks?: number }`. State that both laserOffline lines (:46 and :59) get the weaponsOffline treatment, or quote each with its surrounding line. In the test, clear rocks as feelIiModels' clearRocks does (import initRocks).

### [P1] R1-F4 Task 7's pre-flight grep for THROTTLE_CAP_BY_BARS can't match Part i's declaration
Step 1 greps `THROTTLE_CAP_BY_BARS = \[0, 1, 2, 3, 4, 4\]`. Part i declares the table with a type annotation, so the grep prints nothing, and the plan says 'If any prints nothing, stop and report'. · plan L1434: `git grep -n "THROTTLE_CAP_BY_BARS = \[0, 1, 2, 3, 4, 4\]"`. Part i plan L2021: `export const THROTTLE_CAP_BY_BARS: readonly number[] = [0, 1, 2, 3, 4, 4];`. · Every executor halts at Task 7 Step 1, even though Part i built exactly the right name. · Grep `THROTTLE_CAP_BY_BARS: readonly number\[\] = \[0, 1, 2, 3, 4, 4\]`, or grep the name alone and check the values in the tests.

### [P2] R1-F5 The fog still gives away an unseen enemy: its exact range in text, the sit-down zoom, and map clicks or pings at its hidden spot
Task 9 hides the enemy's silhouette, marks and lock, but several other paths still read the real enemy:
- laserSituation returns `{ kind: 'range', range }` for an unseen enemy, so the Weapons status sentence and the BEAM card reason print 'OUT OF RANGE 2134/450'.
- The sit-down zoom frames both ships using the enemy's real position.
- pickContact and pickShip scan every active ship, so a click at the hidden enemy opens its window and a ping snaps onto it. · situationModel.ts:56 returns the range. weaponsModel.ts:166-169 builds the status sentence from laserSituation whatever `ships` holds. consoleModel.ts:115 builds the card reason from laserSituation. scene.ts:250 `if (e?.active) zoomTo(… frameZoom(e.x - own.x, …))`. scene.ts:184 and :203 pickContact for the click and the ping. tacticalModel.ts:471-475: pickShip loops over all active slots. Plan Task 9 Steps 5 and 8 (L2446-2548) gate only the drawing. Spec §10.4 L431: unseen contacts are drawn as a ghost. · A player can learn an unseen enemy's distance and bearing without Sensors power, which undercuts the fog the spike is meant to test. · In the scene, gate on fogView.seen.enemy:
- skip zoomTo when the enemy is unseen;
- pass a `seen` flag to pickContact (or skip Contact.Enemy) for the click and the ping;
- have laserSituation (or the scene's input) return 'none' for an unseen target, so no range or arc words show.
Add one test for each path.

### [P2] R1-F6 The refused LAUNCH reason now runs into FREE and past the Weapons block
With three 90 px cards, the torpedo card's text starts at tx = 218. 'LAUNCH: OUT OF RANGE' is about 120 px at FONT_NATIVE, which runs to about 338, past `right` (304), over the right-aligned FREE count and outside the 312 px panel. Longer reasons such as TORPEDO UNPOWERED run further. The plan says the text stays clear. · plan L1940: card x = x0 + i × 96, w 90, so T.x is 212 and tx is 218. plan L2213 draws FREE right-aligned at `right` on row y0+116. plan L2215 draws the refusal at `tx` on the same row. plan L2231 claims '(x 220), which stays clear of FREE'. FONT_NATIVE text is about 6 px per glyph (tests/rockTargetUi.test.tsx:62 budgets textPx(s, 1)). · The most common LAUNCH refusal overlaps on the console the owner will play. · Draw every refusal from x0, or move FREE to its own spot (for example under the pips, or on the y0+134 row beside ROCKS). Then add a jsdom or textPx width assertion like rockTargetUi's.

### [P3] R1-F7 Out-of-date numbers in the plan text
Global Constraints say Task 1 records the baselines at 54, but Task 1 Step 2 and the Self-review say 55. The plan cites `scene.ts:291` for the HUD rule, but it is now :305. Decision 11 gives the panel as y 546–712, but powerPanel() gives y 557 (with the header text at 529). · plan L26 vs L146-152 and L2796. plan L74 and L2782 vs scene.ts:305. plan L76 vs Task 1's layout (powerBarY(9) = 563, minus pad 6 = 557). · These are small, but executors match by these numbers. · L26: 'at 55'. Cite scene.ts:305. Decision 11: 'y 529 (header) / 557–712 (backing)'.

## Verified
- Part i's names match what Part ii uses:
- power.ts re-exports DuelSystem, DUEL_SYSTEM_COUNT, OVERDRIVE_SYSTEMS, SYSTEM_MAX, SYSTEM_SLOTS, REACTOR_BARS, START_BARS and effectiveBars (Part i L754-756).
- power.ts defines COOLANT_POOL_DUEL=8, capacityOf, sparesOf, coolantFree, isOverdriven and PowerState {heat, coolant, failed: number[]} (L759-781).
- Also matching: fireTileOf(d, room) (L1727), LOW_AIR_FRAC (L1706), and throttleCap(sys: Pick<'rooms'|'bars'>) (L2025).
- Weapons names match: WeaponSlot {Pew:0,Beam:1,Torpedo:2} as const, weaponBarsUsable, trimmedWeaponPower(WeaponSys), weaponBars (L2324-2343), BEAM_SHOTS_BY_BARS [0,1,2,2,2] (L2582), and the command `{ kind: 'weaponPower'; slot; delta }` (L2423).
- Fog names match: sensorRange, pointSeen, shipSeen, contactSeen (L2885-2902), and the four ship commands in contracts (L1120).
- No pew pew remnant survives: no pew charge, lock, pick-up, number key or `weapon` field (grep over the plan). This agrees with Part i L68-70 and spec §11 L451-453. Part i's laserOffline (beamShots===0) and canLaunch (torpedo bars ≥1) (Part i L2618-2632) match Task 8's weaponsOffline and refusal ordering.
- These quoted edits match master once each:
- actions.ts:56-57 and :75;
- runtime.ts:372-373 (the new line is inserted after the signature; the trailing comment stays) and the two throttleRequest calls at :404 and :433;
- onlineDuel.ts:191-192, :201 and :310;
- scene.ts:18, :138, :161, :173, :181, :271, :279 and :297;
- duelMode.ts:55, :81-82 and :114;
- interiorView.ts:23-24, 46, 51, 70, 95, 101, 110, 135, 146 and 100 (`container, world, memory,`);
- consoleModel.ts:12, 26, 58, 109, 113, 115 and 127;
- HelmStation.tsx:36, 46 and 53; DuelUi.tsx:30 and :46;
- situationModel.ts:200-202 (refusal);
- tacticalModel.ts:88, 106, 144, 418-419, 453 and 457;
- weaponsModel.ts:146-147, 155, 178 and 250; tacticalLayer.ts:246; contactModel.ts:93 and :118;
- feelIiModels.test.ts:215 and :220 (the plan says lines 213 and 218).
- The helpers the plan relies on exist with the assumed shapes: Placement {scale,x,y} (interiorCamera.ts:12); Derived doorTileToEdge, airlockOfTile, siteRoom, siteTile, roomTiles and volume (derived.ts:11-17); rooms.fireRepair and breaches.repair (state.ts:31,35); DoorState.HeldOpen=3 (grid.ts:4); INTERIOR_BAND y 42 and TILE_PX 32; createInteriorView's defaulted args (interiorView.ts:55); Box attrs, boxCss, CrtProvider/CrtGlow/useCrt, blink and ALERT_BLINK_HZ (crtTheme.ts:14); Button's disabled → aria-disabled, which ignores presses (Button.tsx:45,56); and placeMissile and createCamera.
- Hound geometry in the tests: the door at (12,7) is O–Q, the airlock at (0,7) is the Hold's, (14,7) is Quarters floor, and Q's breach site (15,5) is also its fire tile, so the half-tile offset applies (hound.json:108-121,129-133,221-225).
- Task 1 layout arithmetic: the panel is x 6–334 and y 557–712. Every layout assertion in tests/shipHudModel's rewrite holds, and the airTint expected values are exact in IEEE doubles (0.15, 0.3 and 0.55).
- Online path: Task 3 sends `k.ship` first in onlineDuel's play, which runs only while running, synced, focused and not decided (onlineDuel.ts:260-270). Unfocused pumps drain the keyboard and stopInput clears it (onlineDuel.ts:140,252). The interior-click wiring is gated on `focused && !blocked`, as takeClick is (onlineDuel.ts:304). Ship-command refusals are not surfaced in either mode. The plan lists 'a refusal flash' as a candidate (L2751), and spec §6 doesn't require one.
- HUD clicks don't block the interior: the Stage root is pointerEvents:none (Stage.tsx:7), so the nested CrtGlow inset div inherits it, and only the Hit targets set 'auto'.
- Ship commands survive a Single-player Tab because runtime's isConsoleCommand (runtime.ts:239) doesn't include them.
- Fog state is per screen and deterministic in tests: stepFog takes an explicit `now` and epoch, and the ghost alpha arithmetic is exact (0.9 at 1 s; deleted at 10 s).
- Task 11 smoke: the selectors exist (Home.tsx:10 'single-player', ShipPicker.tsx:11 'ship-${id}'), the staging hook sits beside __ftliteDuel (duelMode.ts:81-82), there are exactly nine check() lines, and the output paths are concrete.

## Not verified
- Whether the Task 3 runtime rig's scheduler advance actually steps a tick between the two frames. I didn't read runtime.ts's tick pacing beyond L345-L513; tests/duelRuntime.test.ts:37-48 uses a similar rig.
- Whether jsdom in this repo's vitest setup delivers `button` on fireEvent.pointerDown. Existing console tests rely on it, but I didn't open one to confirm.
- Whether any runtime validator rejects the smoke's staged `bars[3] = 3` (bar total 12, above the reactor's 10) in Single player before screenshot 5. Part i's hash rules for `systems.<i>.bars` weren't read.
- Whether the smoke's walk (D 1800 ms, W pulses, E) reliably seats at Weapons on the Hound. It can only be checked by running the app.
- The full list of existing scene and UI tests that need the Hunter moved inside 900 (Task 9 Step 9). The grep recipe is plausible, but I didn't enumerate the results.
- I read tests/rockTargetUi.test.tsx, tests/feelIiModels.test.ts, sim/tactical/geometry.ts and sim/tactical/rocks.ts, which are beyond the manifest, to confirm the asteroids-ii findings.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `c766762f`. 7 accepted, 0 rejected, 0 deferred. Every quoted edit in Tasks 1 to 9 was re-checked against current master (asteroids-ii).

## R1-F1 [P1]: input.ts quotes predate asteroids-ii

Confirmed: input.ts:36-38, :105, :125, :148-149. Re-quoted, with rockTo kept.

## R1-F2 [P1]: WeaponsStation rewrite drops rock targeting

Confirmed: WeaponsStation.tsx:30, :42, :63. Rebuilt on master's file, with rockTargetUi in the run.

## R1-F3 [P1]: Model quotes predate asteroids-ii

Confirmed: consoleModel.ts:37-40; situationModel.ts:46 and :59. Re-quoted with context, and the test clears rocks.

## R1-F4 [P1]: THROTTLE_CAP grep cannot match

Confirmed against Part i's declaration. The exact fixed-string grep is used, and the other pre-flight greps were checked.

## R1-F5 [P2]: Fog leaks

Confirmed: scene.ts:184, :203, :250; situationModel.ts:56. The picks, the zoom and the laser words are gated, with a test for each.

## R1-F6 [P2]: Refusal text overruns FREE

Confirmed. Refusals are drawn from x0, FREE is right-aligned, and a width test is added.

## R1-F7 [P3]: Stale numbers

Confirmed and corrected.

## Also changed

- The BEAM rename word edits are spelled out in feelIiUi, feelUi and uiConsole.

## Files changed

- docs/superpowers/plans/2026-11-18-engineering-spike-ii-hud.md

<!-- end -->

---

