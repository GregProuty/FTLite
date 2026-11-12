# Demo Ready (Demo-i) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two-player demo readable, survivable and FTL-like: shield layers, aimed shots, scaling, flee and surrender for the enemy; a controls card; a run notice both players read; two-player balance with a duo gate; a bot that runs the ship so the soak covers the run; a playtest script as the acceptance gate, per `docs/superpowers/specs/2026-11-11-demo-ready-design.md` (§3-§9 and §11).

**Architecture:** Task 1 changes the sim (`enemy.ts`, `weapons.ts`, `debris.ts`, state/flatten/version 16, record) and re-blesses; Task 2 tunes the small-crew balance against the new combat and adds the duo gate; Task 3 teaches the bot the run and covers it in acceptance, plus the playtest script; Task 4 is the HUD (card, notice with the surrender line, threat order, enemy rows); Task 5 is docs. Sim changes end with Task 2 so the golden is blessed at most twice (Task 1 always, Task 2 only on a global lever).

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), Pixi 8.19 (hud.ts only). No new dependencies.

## Spec amendments made by this plan (recorded in Task 5)

- The weapon-charge helper reads `nextShotTick − shotArmTick` with a floor of 1 tick.
- `spawnObject` takes an `aimed` flag; only `spawnShot` sets it.
- The duo gate (§5) is tuned after the combat change (Task 2), so its baseline is the Task 1 figures, not Run-iii's.

## Global Constraints

- `tests/boundary.test.ts` green; sim files ASCII; `hudModel.ts` pixi-free; every test under node.
- Draw accounting (exact): arrival one hazards draw (unchanged); recharge, flee start and the engines pause draw nothing; an aimed shot makes **four** hazards draws (`u`, the room index among console rooms or all rooms, flight, frequency); debris keeps three; a Shot impact in a room with `n` online consoles makes `n` further hazards draws (one per console, station-index order), a debris impact none; every beam against the enemy makes exactly one combat draw (the absorbed-no-roll rule is gone); torpedoes one combat draw as today; `leave` one director draw as today.
- Tick order inside `enemySystem` (exact): arrive-if-absent → repairs → shield recharge → flee start → engines pause → withdrawal → fire.
- Beam rule (exact): `tuned = sysHp[Shields] === 0 || shieldLayers === 0 || selector + 1 === shieldFreq`; `hit = u < enemyBeamThreshold`; hit and tuned → `damageEnemy(c, ENEMY_BEAM_DAMAGE)`; hit and not tuned → `shieldLayers −= 1`, `shieldRecharge = 0`, `shieldHits += 1`, `hits += 1`.
- Flee (exact): `!fleeing && hull <= 0.25 × maxHull && sysHp[Engines] > 0` → `fleeing 1`, `surrenderIntact 1`, `departTick = tick + 480`, `surrenderOffers += 1`; `damageEnemy` while fleeing → `surrenderIntact 0`; `leave(false)` while fleeing → `surrenderIntact ? (addScrap 20, surrenders += 1) : enemyFled += 1`; `leave(true)` → kill scrap as today.
- State and flatten (exact): enemy section after `scan`: `maxHull, shieldLayers, shieldRecharge, shotArmTick, fleeing, surrenderIntact` (`ENEMY_FIELDS = 21`); telemetry after `purchases`: `shieldHits, enemyFled, surrenderOffers, surrenders` (`TELEMETRY_SCALARS = 24`); `SIM_VERSION = 16`.
- Tuning (exact): `ENEMY_SHIELD_LAYERS = [1, 1, 1, 2, 2, 2, 2, 2]`, `SHIELD_RECHARGE_TIME 6`, `ENEMY_HULL_PER_COLUMN 10`, `ENEMY_AIM_CHANCE 0.6`, `ENEMY_SHOT_SYSTEM_CHANCE 0.5`, `ENEMY_FLEE_FRAC 0.25`, `ENEMY_FLEE_DELAY 8`, `SCRAP_SURRENDER 20`; `CREW_INTERVAL_MULT = [1.5, 1.25, 1, 1]`, `BOARDING_FIRST_SMALL 330`, `ENCOUNTER_FIRST_SMALL 270`; `LOBBY_LINE_MAX 90`, `NOTICE_LINE_MAX 64`, `LOBBY_PX_MAX 560`, `NOTICE_PX_MAX 400`.
- Strings (exact, from the spec): the six card lines (§3), the notice lines (§4 and §11.4 rule 1b), the enemy hull row and threat row (§11.4). `EVENTS[i].safeChoice = [1, 1, 1, 1, 0, 1]`.
- Bot (exact, §6): urgent interactions (Fight, Revive) first; `runActive` for pid 0 replaces hazard goals and ignores repair targets; seated rules with the target as a **row position**, even-tick stick pulses, Confirm on the target row, Cancel when seated with the charge below 1 and no event pending; never a `buy` row.
- Gates: Task 1 re-records all four gates (drift expected, cause named); Task 2's duo gate target `minHealth >= 25` with the lever order and the four-player check; `gate-jump`/`gate-run` stay at 25200 throughout. Golden: re-blessed in Task 1 after the gates; again in Task 2 only on a global lever.
- Commits: imperative, `feat:`/`test:`/`docs:`, ending `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. `npm run typecheck`, `npm test`, `npm run build` at the end of every task.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/{enemy,weapons,debris,state,flatten,tuning,telemetry,acceptance}.ts` | Task 1. |
| `src/renderer/src/sim/{director,state,tuning}.ts`, `tests/gate-duo.test.ts` (new) | Task 2. |
| `src/renderer/src/sim/{bot,events}.ts`, `docs/playtest.md` (new), `tests/{bot,playtest}.test.ts` (new) | Task 3. |
| `src/renderer/src/render/{hudModel,hud}.ts` | Task 4. |
| `docs/gates.md`, the spec, `docs/roadmap.md` | Task 5. |

---

### Task 1: FTL combat in the sim

**Files:**
- Modify: `src/renderer/src/sim/enemy.ts`, `weapons.ts`, `debris.ts`, `state.ts`, `flatten.ts`, `tuning.ts`, `telemetry.ts`, `acceptance.ts`, `tests/enemy.test.ts`, `tests/weapons.test.ts`, `tests/debris.test.ts`, `tests/snapshot.test.ts`, `tests/telemetry.test.ts`, `tests/acceptance.test.ts`, `tests/gate-survival.test.ts` (figures only, if any code), `tests/golden/basic.json` (re-bless)
- Create: `tests/combat.test.ts`

**Interfaces:**
- Produces: `enemy.maxHull/shieldLayers/shieldRecharge/shotArmTick/fleeing/surrenderIntact`, `telemetry.shieldHits/enemyFled/surrenderOffers/surrenders`, `enemyMaxHull(column)`, `enemyShieldMax(column)`, `enemyWeaponCharge(state)`, `fleeSecondsLeft(state)`; `beamAbsorbed` removed; record `enemy.fled/surrenders/shieldHits`; the table's `enemy` column `met/destroyed/fled/disables`.

- [ ] **Step 0: Baseline.** Run the four gates with temporary figure logs (then `git checkout` the files); record the lines.

- [ ] **Step 1: Write the failing tests.** First extend the helper `placeEnemy` in `tests/helpers/sim.ts` to initialise the new fields the way `arrive` does (`maxHull = hull` argument, `shieldLayers = enemyShieldMax(state.run.column)`, `shieldRecharge 0`, `shotArmTick = state.tick`, `fleeing 0`, `surrenderIntact 0`), so existing tests keep working; tests that need production arrival call `arrive(state)` through `step` with `enemy.nextArrivalTick = state.tick`. Create `tests/combat.test.ts` covering §11.5 exactly: arrival at columns 0 and 5 (`s.run.column = 5` before the arrival); recharge timing `6 × 60`; the beam cases: predict the next combat value with a clone (`const u = nextFloat(createRng(s.rng.combat.s))`), then make the outcome by **choosing the state**, not the selector: for a guaranteed hit set the Weapons level and skill so `enemyBeamThreshold` exceeds `u` (or disable the engines, which adds `ENEMY_EVADE`), for a guaranteed miss set `s.rng.combat.s` to a seed whose next value is above the threshold (search `seed 1..200` with `createRng` in the test and pick the first), and independently choose tuned vs untuned by setting `selector` against `shieldFreq`; aimed shots against a reference stream copy (`u`, then `nextInt(rooms.length)` or `nextInt(volume.length)`, then flight and frequency); the shot-impact console draws; flee and surrender through `step` with the enemy placed by the extended `placeEnemy` at a hull just above `0.25 × maxHull` and one beam hit taking it below; the jump-during-flee case via `jumpShip(s, reachable(s)[0]!)`. Existing tests to update, by title: `tests/enemy.test.ts` "a due shot re-arms with one director draw, then spawns a Shot with the three hazards draws, in spawnObject order" (four draws, the aimed sequence) and "an unevaded shot takes 6 hull, 20 crew health, leaves one hazard, stamps impactTick and counts; an evaded shot counts a roll and an evasion only" (plus one hazards draw per online console in the hit room) and "beamAbsorbed: shields up and a mismatched selector; never when shields are down" (deleted: replaced by the layer tests), "a beam hit takes 15 hull, counts the shot and hit, resets the charge, stamps the shot and draws once; a miss takes nothing" (now needs a tuned beam or stripped layers; add the untuned sibling that strips a layer with one draw) and "eight shots, seven hits, destroyed before departTick" (re-derive the count: untuned hits strip layers first; use tuned shots or set `shieldLayers = 0`). `tests/weapons.test.ts` has no enemy-shield test; its object tests are unchanged. `tests/snapshot.test.ts`: version 15 → 16 rejection; the new fields round-trip and each changes the hash. `tests/telemetry.test.ts`: `enemy: { met, destroyed, disables, fled, surrenders, shieldHits }` fixture. `tests/acceptance.test.ts`: `rec()`'s `enemy` gains the three fields; the `enemy` column regex becomes `\d+\/\d+\/\d+\/\d+`.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** `tuning.ts`: `SIM_VERSION = 16` and the §11.2 constants. `state.ts`: the six enemy fields (`shotArmTick: -1`, others 0) and four telemetry scalars. `flatten.ts`: `ENEMY_FIELDS = 21`, `TELEMETRY_SCALARS = 24`, puts/gets in the stated order. `enemy.ts`:

```ts
export function enemyMaxHull(column: number): number { return ENEMY_HULL + ENEMY_HULL_PER_COLUMN * column; }
export function enemyShieldMax(column: number): number { return ENEMY_SHIELD_LAYERS[Math.min(column, ENEMY_SHIELD_LAYERS.length - 1)]!; }
export function enemyWeaponCharge(state: SimState): number { const e = state.enemy; if (!e.present || e.sysHp[EnemySystem.Weapons] === 0) return 0; return Math.max(0, Math.min(1, (state.tick - e.shotArmTick) / Math.max(1, e.nextShotTick - e.shotArmTick))); }
export function fleeSecondsLeft(state: SimState): number { const e = state.enemy; return e.present && e.fleeing ? Math.ceil((e.departTick - state.tick) / TICK_HZ) : 0; }
// arrive: + e.maxHull = enemyMaxHull(state.run.column); e.hull = e.maxHull; e.shieldLayers = enemyShieldMax(state.run.column); e.shieldRecharge = 0; e.shotArmTick = state.tick; e.fleeing = 0; e.surrenderIntact = 0;
// leave: before clearing: if (!destroyed && e.fleeing) { if (e.surrenderIntact) { addScrap(state, SCRAP_SURRENDER); state.telemetry.surrenders++; } else state.telemetry.enemyFled++; }  then clear the six fields.
// damageEnemy: if (e.fleeing) e.surrenderIntact = 0; after a system reaches 0: if (sys === EnemySystem.Shields) { e.shieldLayers = 0; e.shieldRecharge = 0; }
// enemySystem: after repairs (a Shields repair sets layers 0/recharge 0; a Weapons repair also sets shotArmTick = tick):
//   if (e.sysHp[Shields] > 0 && e.shieldLayers < enemyShieldMax(column)) { e.shieldRecharge = Math.min(1, e.shieldRecharge + DT / SHIELD_RECHARGE_TIME); if (e.shieldRecharge >= 1) { e.shieldLayers++; e.shieldRecharge = 0; } }
//   if (!e.fleeing && e.hull <= ENEMY_FLEE_FRAC * e.maxHull && e.sysHp[Engines] > 0) { e.fleeing = 1; e.surrenderIntact = 1; e.departTick = state.tick + ENEMY_FLEE_DELAY * TICK_HZ; state.telemetry.surrenderOffers++; }
//   engines pause, withdrawal, fire as today, with e.shotArmTick = state.tick beside the re-arm.
```

`weapons.ts` beam branch: `w.charge = 0; const u = nextFloat(state.rng.combat); if (enemy) { const e = state.enemy, tuned = e.sysHp[EnemySystem.Shields] === 0 || e.shieldLayers === 0 || w.selector + 1 === e.shieldFreq; hit = u < enemyBeamThreshold(state, output); if (hit && !tuned) { e.shieldLayers--; e.shieldRecharge = 0; state.telemetry.shieldHits++; state.telemetry.hits++; stamp/shots/XP as below; return true; } } else hit = beamHits(...)`: restructure so the stamp, `shots++` and XP happen once for every shot, then `if (hit) { hits++; damage or remove }` only for tuned/object hits (the untuned-hit path already counted `hits`). `debris.ts`: `spawnObject(state, kind, flightBase, flightJitter, aimed)`: `let room: number; if (aimed) { const u = nextFloat(hz); const rooms = consoleRooms(state); room = u < ENEMY_AIM_CHANCE && rooms.length ? rooms[nextInt(hz, rooms.length)]! : nextInt(hz, state.derived.volume.length); } else room = nextInt(hz, volume.length);` with `consoleRooms` = de-duplicated `roomOfTile(stationTile[i])` for online stations in index order; `spawnShot` passes `true`. `resolveImpact`: after `impacts++`, `if (db.kind[slot] === ObjectKind.Shot) for (let i = 0; i < stations.level.length; i++) if (stationOnline(state, i) && roomOfStation(i) === room && nextFloat(hz) < ENEMY_SHOT_SYSTEM_CHANCE) failStation(state, i);` (import `failStation` from power; check `power.ts` does not import `debris.ts`). `telemetry.ts`: the record fields; `acceptance.ts`: the column.

- [ ] **Step 4: Run, gates, re-bless.** Focused tests → full suite; gates re-run with logs, figures recorded with the cause "aimed shots: four hazards draws per shot and console-failure draws"; `npm run bless`; typecheck, test, build.

- [ ] **Step 5: Commit** `feat: FTL-style ship combat: shield layers that untuned beams strip and that recharge, shots aimed at consoles that can fail them, hull and layers scaling with the column, a flee at 25% hull with a surrender bounty for holding fire; SIM_VERSION 16 (golden re-blessed)`.

---

### Task 2: Two-player balance and the duo gate

**Files:** `src/renderer/src/sim/{director,state,tuning}.ts`, `tests/gate-duo.test.ts` (new), `tests/director.test.ts` (interval cases), `tests/enemy.test.ts`/`tests/boarders.test.ts` (first-arrival cases), `tests/golden/basic.json` only on a global lever.

- [ ] **Step 1: Tests.** `spawnInterval(m, p)` and `fireInterval(m, p)` for p 1..4 equal their base `× [1.5, 1.25, 1, 1]` (the spec's §5 is amended to cover `fireInterval`, which also used the solo multiplier: enemy fire slows for two players too); `makeState(p, 1)` for p = 1, 2 has `boarders.nextArrivalTick === 330 × 60` and `enemy.nextArrivalTick === 270 × 60`, for p = 3, 4 `240 × 60` and `210 × 60`; after `jumpShip` the re-arms are `tick + BOARDING_AFTER_JUMP × 60` and `tick + ENCOUNTER_AFTER_JUMP × 60` for p = 2 and p = 4 alike. `tests/gate-duo.test.ts`: the survival gate's loop verbatim (`makeState(2, seed, DEFAULT_CHARACTERS)`, `step(s, [botIntent(s, 0), botIntent(s, 1)])` for `seconds(300)` ticks or until `ended`; after every step `minHealth = min(minHealth, Health.cur[eid])` over crew with `Life.state === Conscious`), seeds 1-3, asserting `s.ended === 0`, both Conscious at the end, and `minHealth >= 25`, with the figures string in the assertion message (committed without logs).
- [ ] **Step 2: Implement.** `CREW_INTERVAL_MULT[players − 1]` replaces `SOLO_INTERVAL_MULT` in `spawnInterval` (`director.ts`) and `fireInterval` (`enemy.ts`); `createSimState` initialises `boarders.nextArrivalTick` from `(playerCount <= 2 ? BOARDING_FIRST_SMALL : BOARDING_FIRST) × TICK_HZ` and `enemy.nextArrivalTick` from `(playerCount <= 2 ? ENCOUNTER_FIRST_SMALL : ENCOUNTER_FIRST) × TICK_HZ`; nothing else (post-jump re-arms and cooldowns untouched).
- [ ] **Step 3: Tune.** Run `gate-duo`; if it fails take the levers in order (§5), re-running `gate-survival`, `gate-boarding` and `npm run acceptance 5 1` after each and recording; stop at the first pass; a global lever re-blesses the golden once with the cause.
- [ ] **Step 4: Verify and commit** `feat: two-player balance: a crew-size spawn interval and a later first boarding and encounter for crews of two; the duo health gate`.

---

### Task 3: The bot runs the ship; acceptance covers the run; the playtest script

**Files:** `src/renderer/src/sim/{bot,events}.ts`, `tests/bot.test.ts` (new), `tests/playtest.test.ts` (new), `tests/acceptance.test.ts` (the live run assertion), `docs/playtest.md` (new).

- [ ] **Step 1: Tests** per spec §8 "Bot" (six cases with the stated ticks) and "Acceptance" (`runAcceptance` for seed 1 at 1, 2, 4 players, 5 minutes: `nodesReached >= 3` for 2 and 4 players, four-player `running` and no first death; three five-minute sims take about a minute in total on this machine, so give the test `{ timeout: 300_000 }` like the existing long acceptance test) and "Playtest doc" (header fields, twelve steps with the stated headings in order, `See:` non-empty and `Notes:` per step).
- [ ] **Step 2: Implement** `safeChoice` on `EVENTS`; `botIntent` per §6 with the exact precedence; `docs/playtest.md` with the twelve steps of §7 (step 6 as amended by §11.6) and the header block.
- [ ] **Step 3: Verify** (`npm run acceptance 5 1` rows show `nodes >= 3/8` for 2 and 4 players) **and commit** `feat: the captain bot sits at Navigation when the drive is ready, jumps, and takes each event's safe choice; the soak covers the run; the two-player playtest script`.

---

### Task 4: HUD: controls card, run notice, threat order, enemy rows

**Files:** `src/renderer/src/render/{hudModel,hud}.ts`, `tests/hud.test.ts`, `tests/notice.test.ts` (new).

- [ ] **Step 1: Tests** per spec §8 "Controls card", "Notice" (incl. §11.4 rule 1b and its priority), "Threat order", and §11.5 "HUD" (hull row strings in four states, the threat row). The pixel measurement: the HUD font is `public/assets/raw/m5x7/m5x7.ttf` (installed as a 16 px BitmapFont with `resolution 1`). Write a scratch `measure.ts` in the scratchpad (not committed) and run it with `npx tsx`: read the TTF, parse the table directory, `head` (`unitsPerEm`), `maxp`, `hhea`, `hmtx` (advance widths) and the format-4 `cmap` subtable to map each ASCII code to a glyph id, and sum `advance × 16 / unitsPerEm` per string; print every card and notice string with its width. Record the widest card and notice widths in the report and the gate; fail the task (shorten the string) if a card line exceeds 560 px or a notice line 400 px.
- [ ] **Step 2: Implement** `lobbyLines`, `notice` (`runNotice`), `noticeRows` and phase-exclusive visibility in `hud.ts`, the card in rows 2-7, the threat reordering, `DebrisTarget` fields and `targetRowText`, the threat row string, `HudModel` additions.
- [ ] **Step 3: Verify and commit** `feat: lobby controls card, a two-line run notice both players read (events, shops, ready drive, surrender), hazards before run rows in the threats, enemy rows with shield layers, weapon charge and the flee`.

---

### Task 5: Gate, amendments, roadmap

- [ ] Append the §9 and §11.6 gate section to `docs/gates.md`, entry by entry as the spec lists them: (1) `npm test` with the named test groups and the golden hash(es) and causes; (2) `gate-duo` per seed with `minHealth`, the baseline and the levers with the four-player row after each; (3) the four gates with before/after figures and the cause of drift; (4) `npm run acceptance 5 1` rows, `nodes >= 3/8` on the 2- and 4-player rows, the four-player row `running` with no first death, and the widest card and notice lines in px; (5) the playtest row **unchecked** in the §7 format; (6) `npm run typecheck`, `npm test`, `npm run build` on the final commit; plus the §11.6 entries. Append `## 12. Amendments from the plan` to the spec (the items at the top of this plan, the `fireInterval` crew table, `placeEnemy`'s new fields, any fixture arithmetic corrected). `docs/roadmap.md` item 11 → `in review`. Verify and commit `docs: Demo-i gate figures, amendments, roadmap status`.
