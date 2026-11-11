# Increment gates

## Increment 0: headless harness
- [x] `npm test` passes: golden replay, same-seed hash property, snapshot round trip.
- [x] `npm run bless` twice in a row leaves `tests/golden/basic.json` unchanged (verified with `cmp`).

## Increment 1: move and survive
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 (two bots, 5 minutes). Tuning changes made: `FIRE_DAMAGE` 4 -> 3.
  - Reason: with `FIRE_DAMAGE = 4`, seed 3 ended at 268 s (reason 2, both crew dead); health traces showed fires were the drain (100 -> 88 -> 64 -> 52 -> 28 -> 3, in steps of 12-25 per fire; breaches cost nothing). Lowered by 1 per the tuning procedure (floor 2). Golden re-blessed. No other constants changed; `SPAWN_CAP` stays 3, no healing added.
  - Final results (both bots conscious at 300 s): seed 1: health 46/46, max simultaneous hazards 1, 1 repair episode; seed 2: 55/55, max 2, 2 episodes; seed 3: 19/19, max 2, 2 episodes. Seed 3 has a thin margin.
  - The gate also asserts that every fire-repair attempt has the repairer inside the burning room (`roomAt(crew) === target.index`): 0 violations on all seeds.
- [x] Mass-balance and branching-graph oxygen tests pass (part of `npm test`, 141 tests).
- [ ] Manual playtest (`npm run dev`): two keyboard players (WASD+E/F/Q, arrows+Enter/RShift/Backspace) survive 5 minutes; both repaired at least one fire and one breach; one revive happened (let a player stand in a fire until Downed). Date and notes: pending human playtest.
- [ ] Pause on alt-tab and on minimise confirmed; sim clock does not advance while paused. (pending human playtest)
- [ ] Gamepad spike (spec §11): with `npm run dev`, then with `npm run dist` installed build:
  - [ ] Xbox-style pad joins with A, moves, interacts; unplug mid-run shows RECONNECT, replug + any button reclaims.
  - [ ] PlayStation-style pad: same.
  - [ ] A third pad model: same (name it).
  - [ ] Two keyboard clusters plus two pads: four players join.
  - Result and any device restrictions: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Art pass
- [x] `tests/assets.test.ts`: manifest valid, every raw/art file manifested, required files present, grids divide, names bound once, licences on the allow-list.
- [x] `tests/credits.test.ts`: `THIRD_PARTY_NOTICES.txt` and `credits.generated.ts` match the manifest (`npm run credits` regenerates them).
- [x] `tests/build-output.test.ts` after `npm run build`: `out/renderer/assets/manifest.json` and `out/renderer/THIRD_PARTY_NOTICES.txt` exist.
- [x] Pure render tests: door state pairs, wall tall/flat rule, fire subsets, breach geometry, facing, render memory reset, credits sub-state.
- [ ] Manual (`npm run dev`): Cozy Space ship with animated doors and tinted Puny crew; doors open on approach and show the sealed frame when sealed, including after a seal/unseal while another door is mid-animation; a fire shows animated flames whose count grows; a breach shows the decal (or the placeholder square until the decal is drawn) and the vent puff points outward; a restart shows no scorch marks from the previous run; the HUD uses the bitmap font and panels with the right glyph per device (kb1: E/F; kb2: Enter/Shift; pad: A/X); the credits screen opens from the lobby with Cancel and Confirm closes it without starting. Date and notes: 2026-11-10, owner's first look: "art looks good so far" (overall impression; the itemised checks above were not individually confirmed, so the box stays open until they are).
- [x] Packaged build (`npm run dist`, installed): loading and `resources/THIRD_PARTY_NOTICES.txt` presence verified on the `win-unpacked` output (see 2026-11-10 note); visual checks remain pending.
- [ ] Increment 1 manual items above still pass. (pending)
- 2026-11-10: the controller verified by `--enable-logging` runs that the dev build and the packaged `win-unpacked` build over `file://` load all 16 required files with exactly the 7 optional-missing warnings, and that renaming `wall.png` triggers the fatal path.
- Optional in-house art not yet present at the time of this gate (placeholders in use): `art/tiles/breach.png`, `art/tiles/floor_damaged.png`, `art/crew/body_base.png`, `art/crew/sit.png`, `art/fx/vent.png`, `art/fx/arc.png`, `art/icons/hazards.png`.

## Increment 2a-i: power and consoles
- [x] `npm test` passes: console (sit/stand, Engineering, Doors, inert stations, power repair, determinism with console use), power, stick edges, Life Support, Medbay, spawner, snapshot round trip of seating/power/stick, ship validation (unknown id, missing kind, fractional/over-max allocation, Engineering floor, budget), HUD model (power strip, panels, power threat, No doors).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with Life Support unmanned at level 2 and power failures in the mix (2026-11-10: min health 51.8 / 81.2 / 75.1; 3 / 3 / 2 power failures spawned).
- [ ] Manual, two players (`npm run dev`): each of the seven consoles can be sat at (Confirm in its room) and left (Cancel or Interact); a bar is moved in Engineering and the strip reflects it; a power failure appears, is repaired by holding Interact at the console, and Engineering comes back at level 1 (others at 0, reallocated); a door is sealed from the Doors console and the blue outline matches the sealed door; a hurt crew member heals in the Medbay. Date and notes: pending human playtest.
  - Console tiles on the starter ship: Navigation A(2,2), Doors A(3,1), Weapons B(7,2), Science D(12,2), Medbay F(17,2), Life Support E(10,9), Engineering C(18,9). The first spawn comes at 15 s and then every ~30 s, one in four being a power failure, so expect to wait a minute or two for one.
- [ ] Manual, solo: five minutes survived against the spawner with Life Support manned at level 2. Date and notes: pending.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Increment 2a-ii: debris loop (closes the foundation's Increment 2a)
- [x] `npm test` passes: debris (slots, target order, detection leads, warned-on-spawn boundary, impact effects and fallbacks, crew damage and immediate down, evasion), weapons (charge, targeting, firing, thresholds), spawner (fourth interval, debris in the cap), scripted-intent gate tests for Science, Weapons and Navigation, snapshot round trip of debris/weapons/impact ticks, HUD model (debris threats, three panels).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with Science, Weapons and Navigation unmanned (2026-11-10; no tuning changed; min hull 68, 84, 68 for seeds 1, 2, 3 with 4, 2, 4 impacts, recorded 2026-11-10).
- [ ] Manual, two players (`npm run dev`): a `Debris` threat appears only after Science is seated (D(12,2)) or in the last 4 s unmanned; from Weapons (B(7,2)) the panel lists targets, the beam bar fills in about 12 s, Confirm removes a target or resets the bar on a miss; an unstopped impact flashes the hit room, lowers `HULL` by 8 and leaves a breach or fire; the Navigation panel (A(2,2)) shows `Evade 35%` while seated. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Increment 2b-i: overdrive, heat and coolant
- [x] `npm test` passes: heat (overdrive ceiling, output past 1, rise/cool rates, hold with two units, idle decay, overheat with one hazards draw and the fire chance, two-station order, spawner cap on the overheat tick, failed Engineering, same-tick Navigation/Life Support/Medbay cases), power (max + 1), console (coolant cycle, pool wrap, Engineering row, same-tick Left/Confirm/shot cases, fast-check invariants over 60 s, scripted overdrive gate), snapshot round trip of heat and coolant with version-3 rejection and continuation through an overheat, HUD model (row and strip thermal fields, free coolant).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 unchanged (no spawner or tuning change outside the new constants).
- [ ] Manual, two players (`npm run dev`): from Engineering (C(18,9)) take a bar from Life Support (Left) and push Weapons (B(7,2)) to a fourth cell drawn in the warning tint; its heat bar climbs; two Confirms show `C2` and the bar stops; Confirm again to `C0` and within about 10 s `Power: Weapons` appears in the threats with the Weapons operator stood up. Whether the overheat also starts a fire is a 50% roll and not a gate condition; note it if seen. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Increment 2b-ii: scanning, frequencies and torpedoes (closes the foundation's Increment 2b)
- [x] `npm test` passes: debris (frequency draw, slot clearing, shared cursor retarget, initial state), science (start, rate, completion, no-op cases, pause on retarget and stand, offline, permanence, discard on impact), weapons (selector, charge preserved, matched/mismatched/torpedo shots, one draw per shot, unready and no-target guards, thresholds), torpedoes (loading, stand/failure persistence, regeneration, cap), scripted handoff gate, properties (stock, draws), snapshot round trip and mid-scan continuation, HUD model (frequencies, selector, torpedo, Science targets, live torpedo fields).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 unmanned after the extra hazards draw per debris spawn (2026-11-10).
- [ ] Manual, two players (`npm run dev`): Science (D(12,2)) selects a `Debris` threat and Confirm shows a rising percentage on its row, after which the threat row and both panels show `F<k>`; Weapons (B(7,2)) uses Left/Right to pick `F<k>` and Confirm removes the object more often than not over a few tries; the torpedo readout climbs from the moment of sitting and reads `Torp LOADED  Stock 2/6` after about 20 s; with `Torp` selected, Confirm removes the object and the readout drops to `Torp 0%  Stock 2/6`; stand at once, and after about 90 s with Weapons powered the stock reads 3/6. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Increment 3-i: skills and XP
- [x] `npm test` passes: skills (table, cap, mapping, curve), productive predicates (every station, stamp production and expiry, unset stamps), XP flow (continuous at the observation point, shot and evasion lumps, Life Support at delivery, Repair, revive excluded), effects (repair speed at level 10 for fire, breach and power, cooling at level 5 integrated, sealed leak at level 10, output at level 10), bonus bars and shedding (order, freeze exception, downing, floor, property), snapshot round trip with stamps, active-window continuation and version-5 rejection, HUD skills and bonus-bar pool.
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with every station unmanned; the bot crew repairs fires and breaches, so Repair XP accrues during the gate (the only skill effect in play, since repair speed only rises from level 1 at 240 s of repairing).
- [ ] Manual, two players (`npm run dev`): the player panel shows `N0 E0 W0 S0 C0 R0`; sitting at Science (D(12,2)) while a `Debris` warning is in flight and repairing fires raise `S` and `R` (level 1 after about four minutes of productive time); with Engineering at level 4 (reach it, or set `XP_THRESHOLDS[4]` on a crew member in a debug build) the Engineering footer shows one more pool bar while seated; allocate the spare and the bonus bar, stand, and the strip drops one bar from Doors. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Increment 3-ii: characters (closes the foundation's Increment 3)
- [x] `npm test` passes: characters (data, readers, default and fallback assignment, exact head-start matrix, snapshot of a non-default assignment, every trait effect incl. the combined Okoro repair time, Slow Learner on all five XP paths, Frail under hazards), snapshot version-6 rejection, HUD character fields and game-over summary gating.
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with the default crew (Okoro and Lindqvist).
- [ ] Manual, two players (`npm run dev`): the lobby shows `P1  Okoro` / `Quick Hands / Heavy Boots` and `P2  Lindqvist` / `Cool Head / Flammable` once joined; in the run Okoro's panel reads `Okoro  N0 E0 W0 S0 C0 R3` and Okoro visibly walks slower than Lindqvist; a game over lists each crew member's skill gains under the banner. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Increment 4-i: director
- [x] `npm test` passes: director (escalation helpers, weights and selection, stress contributions and smoothing, attendance per category, the transition table with isolated exits, spawning fixtures incl. the forced same-tick stand, sinceProductive, routing at 3-4 players), snapshot (initial values, fifteen-field round trip and hash coverage, version-7 rejection, mid-Build-Up continuation with two transitions), HUD director line, and the 20-minute soak with an unkillable crew (every phase at least twice, no stall or Relax overrun; about 1.1 s to run).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with the default crew under the director (2026-11-10; the test records no hull figures, so none are listed).
- [ ] Manual, two players (`npm run dev`): the top-left panel cycles `Build Up` -> `Sustain Peak` -> `Peak Fade` -> `Relax` over a few minutes; hazards arrive only during `Build Up`; after about five minutes they come noticeably faster than at the start. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Increment 4-ii: telemetry and acceptance (closes the foundation's Increment 4 and the Foundation sub-project)
- [x] `npm test` passes: telemetry (initial values, manned ticks and the stale-occupant guard, idle streaks incl. the revive arbitration, the Dead streak and the mixed repair-then-downed case, first down/death with pid and same-tick ties for both edges, the Conscious -> Dead jump, ending-tick capture through step(), final-state sample of a downed operator, scratch clearing, spawns per type across director seeds, phase entries, maxStress, pinned evasion and impact rolls, shots and hits for hit/miss/torpedo/rejected, repairs per kind), record (exact mapping, rounding, present-on-the-ship filter, purity, JSON round trip), snapshot (all 17 telemetry fields round-trip and hash, version-8 rejection, continuation through a new longest idle and a bleed-out), store (missing key, append order, 50-to-51 boundary, malformed roots, throwing storage), session (hull loss and crew loss records, fault without a record, no dependency), HUD (headline lines, CREW LOST, every station manned, the full eight lines at four players), acceptance (oracle equality, repeatability, crew lists, early end, table and CLI orchestration incl. seed de-duplication).
- [x] `npm run acceptance 1 1` prints a header and three rows (1, 2 and 4 players) and exits 0 (2026-11-11).
- [x] Automated soak observables (unmanned-console bot crew; the station-choice and task-clarity questions of foundation section 10 remain for the human playtest), `npm run acceptance`, 2026-11-11:

```
players  seed  ended-at  reason  first-down         first-death     never-manned                                                      longest-idle          spawns      impacts  hits/shots
1        1     14:24.1   crew    Okoro 14:24.1      -               Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  102.4                 3/3/6/8     8        0/0
1        2     16:32.2   hull    -                  -               Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  111.5                 5/2/5/13    13       0/0
1        3     10:36.6   crew    Okoro 10:36.6      -               Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  103.7                 5/2/3/4     4        0/0
2        1     15:30.7   crew    Lindqvist 8:07.9   -               Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  98.2/97.5             7/7/9/11    10       0/0
2        2     14:04.4   crew    Lindqvist 8:45     -               Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  66.1/65.7             5/4/7/13    12       0/0
2        3     13:25     crew    Lindqvist 12:51.5  -               Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  72.3/71.8             8/7/3/11    11       0/0
4        1     15:46.4   crew    Lindqvist 12:47.1  Dubois 13:42.2  Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  77.9/77.3/77.3/133.2  7/11/11/12  12       0/0
4        2     14:37.4   hull    Lindqvist 13:41.6  -               Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  67.6/67.5/67.5/67.4   8/6/11/15   13       0/0
4        3     12:35.2   hull    -                  -               Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  63.6/63.3/63.3/63.1   8/7/2/14    13       0/0
```

  Reading: with no console manned every run ends between 10:36 and 16:32, six by crew loss and three by hull loss; the first downing comes between 8:07 and 14:24; longest idle stretches run 63 to 133 s; no shots are fired. These are the baseline the human playtest with manned consoles should beat.
- [ ] Manual, four players (`npm run dev`): a game over shows exactly eight summary lines in order (run length and reason, first down/first death, never manned, longest idle, then four skill lines), all visible and evenly spaced, and a long `Never manned` line does not run under the threat panel at the top right; `localStorage['ftlite-telemetry']` holds the run's record afterwards (DevTools console). Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Combat-i: enemy ship
- [x] `npm test` passes: enemy (initial values, fireInterval, arrival with no draw and the auto-select, due shots with the exact director and hazards draws in spawnObject order, the shot cap and the full table, withdrawal with the cooldown draw and surviving shots, the both-clocks tick, the second encounter, step() ordering; targets incl. targetStableId, cycling, leave and removeDebris retargeting, kind reset on both the helper and the spawnDebris path; shooting with pinned combat rolls for beam hit/miss, torpedo hit/miss, the kill, seven readiness rejections incl. a seated operator at a failed or unpowered console, the kill on a due-shot tick; shot impacts and evasion, scanning and shooting down a shot; Science and productive guards under a pseudo-slot read trap; director stress and attendance), snapshot (enemy block, kinds and counters round trip and hash, version-9 rejection, mid-encounter continuation through an impact and the withdrawal), HUD (threat rows, target rows, targetWindow, targetRowText), telemetry record and acceptance column, and the golden replay re-blessed once (version 10, final 618154dd).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with the default crew, Weapons unmanned, and the first encounter inside the window (2026-11-11): seed 1 min hull 56, encounter impacts 6, min crew health 19.1; seed 2 min hull 60, 6, 46.4; seed 3 min hull 68, 6, 2.2. Tuning fallbacks taken, in the spec's order, before the single golden re-bless: `ENEMY_SHOT_HULL_DAMAGE` 6 -> 4 (seed 1 still died at 287 s), `ENCOUNTER_FIRST` 180 -> 210 (seed 1 passed, seed 3 died at 296 s), `ENEMY_SHOTS_MAX` 2 -> 1 (3/3 pass). Seed 3's crew margin is thin (2.2 health); the next tuning pass should watch it. With the first arrival at 3:30 the five-minute gate sees 90 of the encounter's 120 s.
- [x] Combat gate: a level-2 Weapons operator with all-hit rolls destroys the enemy in seven beams inside the window.
- [x] `npm run acceptance 5 1`, 2026-11-11, `enemy` column `1/0` on all three rows (one encounter met from 3:30, none destroyed by the unmanned crew):

```
players  seed  ended-at  reason   first-down  first-death  never-manned                                                      longest-idle         spawns   impacts  hits/shots  enemy
1        1     5:00      running  -           -            Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  77.4                 1/2/1/0  5        0/0         1/0
2        1     5:00      running  -           -            Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  86.1/85.5            1/1/2/3  8        0/0         1/0
4        1     5:00      running  -           -            Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  64.1/64.1/64.1/64.1  3/1/1/3  9        0/0         1/0
```

- [ ] Manual, two players (`npm run dev`): at 3:30 `Enemy ship: hull 100%` appears in the threats and `Shot: <room> Ns` rows follow about every 10 to 25 s (a new shot only once the last one has landed or been stopped); from Weapons (B(7,2)) the target list shows `Enemy 100% 118s` among the `Shot ...` rows, Confirm with a charged beam lowers the percentage more often than not, and a torpedo takes a visible chunk; with more than six targets the list scrolls to keep the selection visible; the row and the threat vanish when the hull reaches 0 or after two minutes. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Combat-ii: enemy systems and shields (closes sub-project 2 for this run)
- [x] `npm test` passes: enemy (arrival with one hazards draw pinned to seed 7, four target rows with the slot tie-break and the nextTarget exclude list, the threshold with engines up and down and no clamp, absorbed and matched beams with the combat stream unchanged on absorption, torpedoes bypassing shields, subsystem damage 85/70/55 and the one-time repair timer, the kill with and without a same-hit disable, weapons-down re-arm without a spawn and the unconditional 5 s re-arm on repair, the engines pause and the repair-before-departure order, shields repair, RNG neutrality of repair/pause/damage, the enemy scan incl. output 0.375 and 960 calls, clamp, pause on subsystem rows, stand/offline pause and resume, leave clearing; the four-slot read trap across Science, productive, Weapons and the HUD), snapshot (ten new fields round-trip and hash, version-10 rejection, continuation through the repair and the repaired first shot with a running enemy scan), HUD (row strings in every state, four enemy rows with system/status/shieldsUp, twelve-entry window with the cursor on the shields row, threat suffixes), telemetry record and acceptance column; golden replay re-blessed once (version 11, final 48ba101a).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with the default crew, Weapons unmanned (2026-11-11; the figures differ from Combat-i's because arrival now draws once from `rng.hazards`): seed 1 min hull 52, encounter impacts 7, min crew health 14.9; seed 2 min hull 60, 6, **0.1**; seed 3 min hull 68, 6, 2.4. Tuning fallback taken before the single golden re-bless: `ENEMY_FIRE_INTERVAL` 15 -> 20 (Combat-i's fallback 4; seed 3 died at 267 s at 15). Seed 2's crew margin is now razor-thin: the next tuning pass (boarders will re-balance crew damage anyway) should look at `DEBRIS_CREW_DAMAGE` or the enemy shot's crew damage before adding any new pressure.
- [x] Combat gate: one absorbed `F1` beam against shield frequency 2, then seven `F2` hits destroy the enemy inside the window (`shots 8, hits 7`).
- [x] `npm run acceptance 5 1`, 2026-11-11, `enemy` column `1/0/0` on all three rows:

```
players  seed  ended-at  reason   first-down  first-death  never-manned                                                      longest-idle         spawns   impacts  hits/shots  enemy
1        1     5:00      running  -           -            Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  77.4                 1/2/1/0  4        0/0         1/0/0
2        1     5:00      running  -           -            Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  86.1/85.5            1/1/2/3  9        0/0         1/0/0
4        1     5:00      running  -           -            Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  64.5/64.5/64.5/64.5  2/1/1/4  10       0/0         1/0/0
```

- [ ] Manual, two players (`npm run dev`): from Weapons the enemy shows four rows (`Enemy 100% 118s S?`, `Enemy weapons 100%`, `Enemy engines 100%`, `Enemy shields 100%`); a beam on a non-matching `F` changes no percentage; Science scanning the hull row turns `S?` into `S<k>`, and beams on that `F` land about two times in three (the engines still make some miss); two hits on `Enemy shields` show `Enemy shields DOWN 45s` and `S-`, after which beams on any `F` roll; two hits on `Enemy weapons` stop **new** `Shot:` rows (a shot already in flight still lands or is shot down) until `DOWN` counts down and the row reads `Enemy weapons 100%` again. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## Boarders-i
- [x] `npm test` passes: boarders (initial values, markers at the room centroids, arrival with one hazards draw and the party in one room, arrival-tick fighting and clock start, the 450- and 225-blow melees with no damage on the killing tick, Combat XP incl. the kill award and the Slow Learner multiplier, the lowest-StableId target above Revive, later holders skipping a dead boarder, RNG neutrality of a fight, a struck seated crew member, immediate downing and next-tick focus transfer, the last-Conscious run end, same-tick Medbay healing, boarder immunity to fire and healing, an ignored Downed crew member, pursuit and random moves with the real room graph, containment by a sealed door, the sabotage clock with its -1/tick/-2 sentinels incl. the lowest online console, offline resets and a second visit, director stress and attendance, bot goals and priorities), snapshot (all boarder fields and counters round-trip and hash, version-11 rejection, mid-fight and mid-containment continuations), HUD (threat rows in order, the Fight prompt by StableId, independent marker coordinates), a node test of the marker layer, telemetry record and acceptance column; the golden replay re-blessed once (version 12, final c8056730).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with the default crew (2026-11-11). Baseline before any boarder code (with the new health-at-4:00 figure): seed 1 min hull 52, encounter impacts 7, min health 14.9, health at 4:00 69.2/47.3; seed 2 60, 6, 0.1, 65.1/52.5; seed 3 68, 6, 2.4, 61.9/33.3. After the feature (first-pass tuning, **no lever taken**): seed 1 min hull 52, impacts 7, min health **0.0**, boardings 1, boarders killed 2; seed 2 60, 6, 0.1, 1, 2; seed 3 68, 6, 0.1, 1, 2. Every seed now bottoms out below 5 health, which the spec records as a tuning item: the two-bot crew survives the 4:00 party but only just, on top of the enemy's wear. The next feature's checklist should look at crew damage (`DEBRIS_CREW_DAMAGE`, a separate enemy-shot crew damage) before adding any crew pressure.
- [x] `tests/gate-boarding.test.ts` passes on seeds 1-3 (two bots, the ship otherwise quiet, a forced boarding at 1:00): boardings 1, killed 2 on every seed; min crew health 32.5 / 34.3 / 36.5.
- [x] Combat gate: two Recruits clear a party of two in room G by the 450th tick with no one Downed; the focused crew member ends at 32.7 (the derived `(3 x 225 - 2) x 0.1` loss).
- [x] `npm run acceptance 5 1`, 2026-11-11, three rows with the `boarders` column. Note the solo row: with one bot aboard the party that lands at 4:00 overruns it (crew loss at 4:13), while two and four bots clear it (`1/2`):

```
players  seed  ended-at  reason   first-down    first-death  never-manned                                                      longest-idle         spawns   impacts  hits/shots  enemy  boarders
1        1     4:13.1    crew     Okoro 4:13.1  -            Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  77.4                 1/2/1/0  2        0/0         1/0/0  1/0
2        1     5:00      running  Okoro 4:34.5  -            Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  86.1/85.5            1/1/2/3  9        0/0         1/0/0  1/2
4        1     5:00      running  -             -            Navigation,Weapons,Science,Engineering,Life Support,Medbay,Doors  64.5/64.5/64.5/64.5  2/1/1/4  10       0/0         1/0/0  1/2
```

- [ ] Manual, two players (`npm run dev`): at 4:00 `Boarders: <room> x2` appears and two red diamonds sit in that room; walking in shows `Fight boarder` with a draining bar and the crew member's health falls; sealing the room's doors from the Doors console keeps the party in; after 15 s alone in a room with a console that console reads `Power: ...` in the threats and no second console there fails afterwards; the Medbay heals the fighters afterwards; a solo kill takes about 7.5 s and a paired kill about 3.75 s. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.
