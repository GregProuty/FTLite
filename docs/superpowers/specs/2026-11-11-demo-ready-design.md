# Demo Ready (Demo-i) Design

Status: drafted 2026-11-11 at the user's request after the ten-feature loop (`docs/roadmap.md` items 1-10 merged, master a2a27f2); amended the same day from the Codex spec reviews (`research/codex-review-demo-spec-1.md`, `-2.md`, 24 findings). Parent: `2026-11-09-foundation-design.md` §7 (session flow, HUD), §10 (acceptance). Builds on everything merged through Run-iii. This is the first feature whose acceptance is a human two-player session, not only the test suite.

## 1. Goal

A two-player couch session that a newcomer can start, read and finish without the builder in the room: the controls are on screen, the ship is survivable for two, the run's decisions (events, shops, a ready drive) are visible to both players rather than only to the one seated at Navigation, the automated soak exercises the run and not just the ship, and every HUD surface has been looked at by a person once.

**Out of scope (follow-ups, listed in §10):** a drawn sector map, audio, a second ship, more events or unlocks, integer door timers, networking.

## 2. Options considered

- **Where the controls live:** (a) a block of lines in the lobby's summary area **(recommended, chosen)**: pure model text, no new UI element, visible exactly when needed; (b) a page in the credits overlay: hidden behind Cancel; (c) a printed card: not in the build.
- **How the second player sees a run decision:** (a) a two-line run notice in the centre banner slot during play **(chosen)**: the banner is empty while running, both players look there already; (b) duplicate the Navigation panel on every player's block: crowds the blocks; (c) let any seated player resolve events: a new input rule, more than a demo needs.
- **Two-player balance:** (a) a crew-size scale on the director's spawn interval and a later first boarding and first encounter for crews of two or fewer, tuned until a new two-bot health gate passes **(chosen)**: one lever family, measurable; (b) retune global damage numbers: changes the four-player game; (c) heal faster: hides the problem.
- **Covering the run in the soak:** (a) teach the bot to jump when the drive is ready and no one is seated at Navigation, and to resolve events with the safe choice **(chosen)**; (b) a separate scripted soak: two harnesses to maintain; (c) leave it: the run stays untested at length.

## 3. Controls card (lobby)

The real bindings (`src/renderer/src/input/sources.ts`): keyboard 1 is WASD, E Interact, F Confirm, Q Cancel; keyboard 2 is the arrows, Enter Interact, Right Shift Confirm, Backspace Cancel; gamepad left stick, A Interact, X Confirm, B Cancel (the glyph names already used by the HUD). **Interact** (held) repairs, revives and fights; **Confirm** (pressed) sits at a console or toggles a door when `confirmTarget` finds one in reach, and acts on a console while seated; **Cancel** stands.

`HudModel.lobbyLines: string[]` (`[]` outside the lobby). In the lobby, exactly these six ASCII lines:

```
Move: WASD or left stick      Interact: E / A      Confirm: F / X      Cancel: Q / B
Keyboard 2: arrows, Enter (Interact), Right Shift (Confirm), Backspace (Cancel)
Stand by a console and press Confirm to sit. Up/Down pick a row, Confirm acts, Cancel stands
Hold Interact next to a fire, a breach, a failed console or a downed friend
Navigation jumps when the drive reads READY. Events and shops are chosen there
Jump before the ship falls apart. Reach node 8 to win
```

Layout: the lobby banner (2x, y 24-56) and its glyph row (y 64) stay; the progress line stays at y 88 (the position of summary row 0). The card uses summary rows **2-7** (y 124 to 214), leaving row 1 blank as a gap; the player blocks begin at y 446. `hud.ts` sets rows 2-7 from `lobbyLines` when `phase === 'lobby'` and hides rows 0-1 and 8-10; the game-over summary keeps its use of rows 0-10 and `lobbyLines` is `[]` then. No new Pixi objects.

Width: the longest line is 84 characters. The 16 px bitmap font averages about 5.5 px per glyph (measured in the Run-ii and Run-iii reviews from the TTF advance table), so about 460 px centred on 960. A model test pins each line to at most `LOBBY_LINE_MAX = 90` characters, and the §4 pixel budget (`LOBBY_PX_MAX = 560` px, measured once by the implementer) is the fit criterion.

## 4. Run notice (centre banner while running)

`HudModel.notice: string[]` (0 to 2 lines; `[]` unless `phase === 'running'`). Pure `runNotice(state): string[]` in `hudModel.ts`, first match wins, exact ASCII strings:

1. Event pending (`run.event >= 0 && run.eventChoice < 0`): `[ \`EVENT: ${title}\`, \`${choices[0]}  /  ${choices[1]}\` ]`. Once a choice is made the event no longer matches; rules 2-4 apply.
2. Shop node (no pending event): `[ \`SHOP at ${nodeLabel(column, node)}   scrap ${scrap}\`, 'Hull +25 (30)   Torpedoes +2 (20)   Upgrade +1 bar (50)' ]` (the second line is 55 characters). The notice is a location cue with the price list; the items are bought from Navigation.
3. `jumpCharge >= 1` and nobody seated at Navigation: `['JUMP READY   someone take Navigation']`.
4. `jumpCharge >= 1` and Navigation seated: `['JUMP READY']`.
5. Otherwise `[]`.

Each line is at most `NOTICE_LINE_MAX = 64` characters (the longest today is event 4's choice line, 62: `Take the scrap (+40)  /  Strip it bare (+60, a station fails)`), about 340 px at 5.5 px per glyph. The gap between the clock panel (ends x 204) and the threat panel (starts x 728) is 524 px, so a 340 px line centred at 480 spans 310 to 650 and clears the clock panel by about 106 px and the threat panel by about 78 px. **Pixel budget:** every notice line must measure at most `NOTICE_PX_MAX = 400` px with the font's advance widths (that leaves 48 px to the threat panel), and every card line at most `LOBBY_PX_MAX = 560` px (centred on 960, 200 px clear each side). A model test pins every possible notice line (all six events' two lines, the shop lines, the two ready lines) to `<= 64` characters; the implementer measures every card and notice string once with the font's advance table (scratch script), records the widest of each in the gate, and fails the task if either pixel budget is exceeded (shorten the string, not the budget).

`hud.ts`: a new `noticeRows` pair of 16 px `DIM` texts, anchored top-centre at (480, 24) and (480, 42), set from `notice`. Visibility by phase, mutually exclusive: `banner` (2x `message`) in lobby, paused, gameover and error; `noticeRows` in running only; `bannerGlyphs` in lobby and gameover only (as today). `message` is `''` while running, as today.

Threats: the `Event:` and `Shop here` rows move to the **end** of the threat list (after objects), so real hazards keep the four visible slots; the notice carries the same information. The Run-ii HUD tests that pinned them first are updated to pin them last.

## 5. Two-player balance

Tuning: `CREW_INTERVAL_MULT = [1.5, 1.25, 1, 1]` indexed by `playerCount − 1` replaces `SOLO_INTERVAL_MULT` in both `spawnInterval(minutes, players)` (`director.ts`) and `fireInterval(minutes, players)` (`enemy.ts`, which also used the solo multiplier; enemy fire slows for two players as well): solo unchanged at 1.5; two players 1.25; three and four 1. `BOARDING_FIRST_SMALL = 330` and `ENCOUNTER_FIRST_SMALL = 270` seconds: `createSimState` initialises `boarders.nextArrivalTick` and `enemy.nextArrivalTick` from the small-crew values when `playerCount <= 2`, else from `BOARDING_FIRST`/`ENCOUNTER_FIRST` as today. **Scope:** these affect only the first arrival of a run; the post-jump re-arms (`BOARDING_AFTER_JUMP`, `ENCOUNTER_AFTER_JUMP`) and the cooldowns (`BOARDING_COOLDOWN`, `ENCOUNTER_COOLDOWN`) are unchanged for every crew size. No other formula changes.

**The duo gate** (`tests/gate-duo.test.ts`): two bots with `DEFAULT_CHARACTERS` (Okoro, Lindqvist) on seeds 1-3 for five minutes, stepping with `botIntent` for both. Metric, exactly the existing survival gate's: after every `step`, for each crew member whose `Life.state` is Conscious at that moment, `minHealth = min(minHealth, Health.cur)`; the baseline is that same statistic from `gate-survival` on 2026-11-11: **0.0 / 0.1 / 0.1** for seeds 1 / 2 / 3 (the "health at 4:00" figures 69.2/47.3 etc. are a different sample). Pass: the run does not end, both are Conscious at the end, and `minHealth >= 25` on every seed. `gate-survival` keeps its assertions and re-records its figures.

**Levers, in order, each taken only if the duo gate still fails, stopping at the first that passes:** (1) `CREW_INTERVAL_MULT[1]` 1.25 → 1.4; (2) `BOARDING_FIRST_SMALL` 330 → 400; (3) `DEBRIS_CREW_DAMAGE` 20 → 15 (global). After every lever, re-run `gate-survival`, `gate-boarding` and `npm run acceptance 5 1`, and record all figures; the four-player acceptance row for seed 1 must stay `running` at 5:00 with no first death, or the lever is reverted and the next tried. The golden replay is four-player (seed 2026): the small-crew changes do not touch it; a global lever would, and it is then re-blessed once with the cause recorded.

## 6. The bot runs the ship

`botIntent(state, pid)` is pure per tick; the behaviours below derive everything from the state (tick parity stands in for memory). Order of precedence inside `botIntent`:

1. **Urgent interactions, as today:** a Conscious bot whose `interactTarget` is a boarder in the room (`Fight`) or a Downed teammate in reach (`Revive`) holds Interact. These outrank every run behaviour; a boarder outranks revive, as the sim already rules.
2. **Run behaviour, pid 0 only** (`runActive` = drive ready, no event pending, nobody seated at Navigation, or already seated there):
   - **Standing with `runActive`:** the Navigation console tile is the sole goal, **replacing** the hazard goals, and a repair target (`Fire`, `Breach`, `Power`) in reach is **ignored** while walking there; when `confirmTarget(state, 0)` is the Navigation console the bot returns `confirmPressed: true` (the sim seats it in `interactSystem`; it acts from the next tick).
   - **Seated at Navigation:** let `rows = navRows(state)` and `c` the console cursor (an index into `rows`). The target **position** `t` is the index in `rows` of the row that is a `choice` with `row.index === EVENTS[run.event].safeChoice` while an event is pending, else of the first row with `select === 'jump'` (its `row.index` is `reachable(state)[0]`; on a Shop node the eight `buy` rows precede it), else `−1`. If `t >= 0` and `c !== t`: on even ticks return `moveY = t > c ? 1 : −1`, on odd ticks neutral (one stick edge per two ticks; the stepper skips `none` rows, so the pulse count may be less than `|t − c|`, which is fine because the rule re-evaluates every tick). If `c === t`: return `confirmPressed: true` when the row is a `choice`, or when it is a `jump` row and `jumpCharge >= 1`. If `t === −1` (the last column) return neutral.
   - **Seated at Navigation with `jumpCharge < 1` and no event pending:** return `cancelPressed: true` (stand). This is the state right after a jump (charge 0), so the bot stands within a tick of arriving, and it never sits while the drive is charging because the standing rule above requires a ready drive.
   - The bot never moves the cursor to a `buy` row, so it never buys.
3. **Ordinary interactions and hazard goals as today** (hold Interact on a repair target in reach; walk to fires, breaches, failed consoles and Downed teammates) when the run behaviour is not active.

`EVENTS[i].safeChoice: 0 | 1` is a new field on the event data: `[1, 1, 1, 1, 0, 1]` (leave, ignore, refuse, go around, take the scrap, decline). Other bots (pid > 0) are unchanged and never sit.

Expected soak effect: with the drive ready at 1:00 and a walk of about 1.5 s from the spawn, the first jump lands at about 1:02 and later ones a minute plus the walk after each arrival (events add a few ticks), so a five-minute soak reaches node 4 or 5 when the bot is free; `nodes >= 3/8` is the floor the gate asks for the two- and four-player rows.

## 7. The playtest gate

A human two-player session is the acceptance criterion. `docs/playtest.md` (new) is the script. It has a header block `Date:`, `Players:`, `Seed:`, `Build (commit):`, and twelve steps, each a `- [ ]` line followed by an indented `See:` line (what the screen should show, taken from this spec and its parents) and a `Notes:` line:

1. Lobby: banner, controls card, `Runs N  Best N` line. 2. Join two keyboards (two blocks light up). 3. Start; the clock, threats and power panels fill; the director line shows the ship's quirk. 4. One player sits at Engineering (rows, pool, coolant); the other at Weapons or Science. 5. A fire: hold Interact in the room until it is out. 6. A debris warning: Science scans, Weapons shoots or Navigation evades. 7. `JUMP READY   someone take Navigation`; sit, pick `Node 2a`/`2b`, Confirm; the threats clear, the clock reads `node 2/8`. 8. An event: both see the notice; the operator picks; the effect lands. 9. A shop: the price line; buy hull from Navigation; `Scrap` drops in the footer. 10. A boarding: fight it in the room. 11. Game over or victory: summary lines (score, ship, best, unlocks), gains. 12. Confirm restarts with the same seed; the lobby shows the new `Runs`/`Best`.

**Triage rule for what the session finds:** a visual overlap, a wrong or missing string, a control that does not do what the card says, or a crash is fixed on the same branch before merge (as "Demo-i fixes", each with a test where one can exist). A balance observation is recorded with the figures and left for a follow-up, unless the run ended before the first jump, in which case the §5 levers are re-authorised. A design wish is recorded in §10.

**Gate entry format** (`docs/gates.md`, the manual row): `- [x] Playtest YYYY-MM-DD, 2 players, seed N, build <commit>: steps 1-12 <seen | notes per failed step>; fixes: <commit list>.`

## 8. Tests (vitest, node)

- Controls card: `buildHudModel(null, slots, 'lobby', '').lobbyLines` equals the six exact lines; `'running'` and `'gameover'` give `[]`; every line `<= LOBBY_LINE_MAX`.
- Notice: `runNotice` on fixture states (map M): `setEvent(s, 4)` → exactly `['EVENT: Supply cache', 'Take the scrap (+40)  /  Strip it bare (+60, a station fails)']`; after `resolveEvent(s, 0)` at a Shop node at column 1 node 0 with `grantScrap(s, 45)` applied after the resolve → exactly `['SHOP at Node 2a   scrap 45', 'Hull +25 (30)   Torpedoes +2 (20)   Upgrade +1 bar (50)']` (the §4 literals are the source of truth); `chargeJump` with nobody seated → the single ready line; seated → `['JUMP READY']`; a fresh quiet state → `[]`; an event pending at a Shop node with a ready drive → the event lines (priority). The model's `notice` is `[]` in the lobby even with a ready drive. Every line of every possible notice (six events' two lines, the shop lines, both ready lines) `<= NOTICE_LINE_MAX`. Threat order: with a fire, an enemy and a pending event at a Shop node the rows are enemy, fire, `Event:`, `Shop here`.
- Balance: `spawnInterval(m, players)` at players 1-4 equals `base × [1.5, 1.25, 1, 1]`; `boarders.nextArrivalTick` is `330 × 60` and `enemy.nextArrivalTick` `270 × 60` for 1 and 2 players, `240 × 60` and `210 × 60` for 3 and 4; after a jump the re-arms are `BOARDING_AFTER_JUMP`/`ENCOUNTER_AFTER_JUMP` for both crew sizes. `gate-duo` as §5 with the figures logged in the gate section; `gate-survival`, `gate-boarding`, `gate-jump`, `gate-run` re-run and re-recorded (jump and run silence arrivals and use `quirk 3`; they must still end at 25200).
- Bot (quiet two-player states, enemy and boarders silenced, Recruits, map M all-Hazard unless stated): (1) `chargeJump` at tick 0: pid 0 is seated at Navigation by tick **1200** (20 s; the scripted walk in `gate-jump` seats at tick 92, so the margin is wide), `jumps === 1` by tick **1500**, and standing (`Seated.station === −1`) within **120** ticks of the jump; pid 1 is never seated at any tick; a fire ignited in the spawn room at tick 0 does not delay the seating past 1200 (the repair target is ignored while the run behaviour is active). (2) `setNodeTypes({'1:0': Event})`, `chargeJump`, override `run.event = 4` after the arrival, then run: `eventChoice === EVENTS[4].safeChoice (0)`, scrap `+40`, no station failed; the same with event 0 → `eventChoice 1`, no fire, scrap unchanged by the event. (3) `setNodeTypes({'1:0': Shop})`, `grantScrap(100)` after the arrival, drive ready: the bot jumps on; `purchases === 0`; scrap equals `100 + 15` at the next arrival. (4) pid 1 Downed within `REACH` of pid 0 at tick 0 with `chargeJump`: `Life.reviveProgress[crew[1]]` rises before pid 0 is ever seated, `jumps === 0` until pid 1 is Conscious, then the jump follows. (5) a boarder in pid 0's room with a ready drive: the bot fights (`interactHeld`) and does not sit until the boarder is dead. (6) `EVENTS.map((e) => e.safeChoice)` equals `[1, 1, 1, 1, 0, 1]`.
- Acceptance: a test runs `runAcceptance` for seed 1 at 1, 2 and 4 players for 5 minutes and asserts `nodesReached >= 3` for the 2- and 4-player records, `endReason === 'running'` and `firstDeath === null` for the 4-player record; the 1-player record is only logged (the solo bot leaves the ship to jump and its end is recorded, not asserted).
- Playtest doc: a test parses `docs/playtest.md` and asserts the four header fields (`Date:`, `Players:`, `Seed:`, `Build (commit):`), exactly twelve `- [ ]` steps whose text begins, in order, with `Lobby`, `Join`, `Start`, `Sit`, `Fire`, `Debris`, `Jump`, `Event`, `Shop`, `Boarding`, `Game over`, `Restart`, and that each step is followed by a non-empty `See:` line and a `Notes:` line.

## 9. Gate (`docs/gates.md`, entries start unchecked)

- [ ] `npm test` passes with the §8 tests (card, notice, threat order, balance constants and arrivals, the six bot cases, the acceptance assertions, the playtest doc); golden unchanged unless a global lever was taken (then re-blessed once, recorded).
- [ ] `gate-duo` passes on seeds 1-3 with `minHealth` recorded per seed and the baseline 0.0/0.1/0.1 beside it; the levers taken, if any, in order, with the four-player acceptance row after each.
- [ ] `gate-survival`, `gate-boarding`, `gate-jump` (25200), `gate-run` (25200) pass; new figures recorded.
- [ ] `npm run acceptance 5 1`: three rows; `nodes >= 3/8` on the 2- and 4-player rows; the four-player row `running` with no first death; the widest card and notice lines measured and recorded.
- [ ] Playtest, in the §7 entry format, with `docs/playtest.md` filled in and the fixes listed.
- [ ] `npm run typecheck`, `npm test`, `npm run build` pass on the final commit.

## 10. Follow-ups recorded, not built

A drawn sector map (Navigation panel or game-over); audio cues (alarm, fire, impact, jump, victory); a second ship layout; more events and a second unlock tier; any seated player resolving events; integer tick door timers at the next version bump; whatever the playtest adds here.

## 11. Ship combat, FTL style (added 2026-11-11 evening at the user's request)

The user wants the demo's ship combat to match FTL's mechanics as far as the existing model allows. What exists (Combat-i/ii): one enemy at a time with hull and three systems (weapons, engines, shields) that repair themselves; its shots fly at random rooms; our beam (tuned to one of three frequencies) is absorbed outright by raised shields unless tuned to the scanned shield frequency, and our torpedoes bypass shields; the enemy evades while its engines are up; it withdraws after a fixed stay; a kill pays scrap. The FTL mechanics added here, each mapped onto that model:

| FTL | FTLite (this section) |
|---|---|
| Shield **layers** that absorb laser hits one at a time and recharge | `enemy.shieldLayers` 0..max, `shieldRecharge` 0..1; an untuned beam hit strips one layer; a tuned beam pierces; torpedoes bypass; layers recharge while the shield system is up |
| Enemy weapon charge visible, firing at your systems | `enemy.shotArmTick` exposes the charge; shots are **aimed** at rooms with an online console and can fail that console on impact |
| Enemies get tougher deeper in the sector | hull and shield layers scale with the column |
| Enemies flee by jumping at low hull, and offer **surrender** | at 25% hull with engines up the enemy starts an 8 s flee; holding fire during it pays surrender scrap; damaging it voids the offer; killing it pays the kill |
| Missiles ignore shields and are limited | torpedoes, as today |

### 11.1 State and version

```ts
enemy.maxHull: number;          // hull on arrival for this encounter (scaled by column); 0 while absent
enemy.shieldLayers: number;     // 0..enemyShieldMax(column); 0 while absent or shields down
enemy.shieldRecharge: number;   // 0..1 progress to the next layer
enemy.shotArmTick: number;      // tick the current nextShotTick was armed (-1 while absent): the weapon charge is (tick - shotArmTick) / (nextShotTick - shotArmTick)
enemy.fleeing: number;          // 0/1: the flee countdown is running (departTick re-armed)
enemy.surrenderIntact: number;  // 0/1: no damaging hit since the flee began
telemetry.shieldHits, telemetry.enemyFled, telemetry.surrenderOffers, telemetry.surrenders: number;
```

Flattened in the `enemy` section after `scan`, in the order above (`ENEMY_FIELDS = 15 + 6 = 21`); the four telemetry scalars after `purchases` (`TELEMETRY_SCALARS = 24`). `SIM_VERSION = 16`; version-15 snapshots are rejected. Initial values all 0 except `shotArmTick −1`.

### 11.2 Tuning (first pass)

`ENEMY_SHIELD_LAYERS = [1, 1, 1, 2, 2, 2, 2, 2]` by column (`enemyShieldMax(column)`), `SHIELD_RECHARGE_TIME = 6` s per layer, `ENEMY_HULL_PER_COLUMN = 10` (`enemyMaxHull(column) = ENEMY_HULL + 10 × column`), `ENEMY_AIM_CHANCE = 0.6`, `ENEMY_SHOT_SYSTEM_CHANCE = 0.5`, `ENEMY_FLEE_FRAC = 0.25`, `ENEMY_FLEE_DELAY = 8` s, `SCRAP_SURRENDER = 20`. `ENEMY_BEAM_DAMAGE 15`, `ENEMY_TORP_DAMAGE 35`, `ENCOUNTER_MAX 120`, `SCRAP_ENEMY 30` unchanged.

### 11.3 Rules (exact; draws named)

**Arrival** (`arrive`): as today plus `maxHull = enemyMaxHull(run.column)`, `hull = maxHull`, `shieldLayers = enemyShieldMax(run.column)`, `shieldRecharge = 0`, `shotArmTick = tick`, `fleeing = 0`, `surrenderIntact = 0`. Still one hazards draw (the shield frequency).

**Per tick** (`enemySystem`), in this order, replacing Combat-ii's list: (1) absent → arrive if due, return. (2) Repairs as today; a repaired Shields system starts with `shieldLayers 0, shieldRecharge 0`; a repaired Weapons system sets `nextShotTick = tick + ENEMY_FIRST_SHOT × TICK_HZ` and `shotArmTick = tick`. (3) **Shield recharge:** if `sysHp[Shields] > 0 && shieldLayers < enemyShieldMax(column)`: `shieldRecharge = min(1, shieldRecharge + DT / SHIELD_RECHARGE_TIME)`; at 1 → `shieldLayers += 1`, `shieldRecharge = 0`. No draw. (4) **Flee start:** if `!fleeing && hull <= ENEMY_FLEE_FRAC × maxHull && sysHp[Engines] > 0`: `fleeing = 1`, `surrenderIntact = 1`, `departTick = tick + ENEMY_FLEE_DELAY × TICK_HZ`, `telemetry.surrenderOffers += 1`. No draw. (5) Engines pause as today (`departTick += 1` while engines are down, fleeing or not). (6) Withdrawal if `tick >= departTick`: `leave(state, false)`. (7) Fire as today (re-arm with one director draw, `shotArmTick = tick`; spawn only with weapons up and under the cap).

**Shots are aimed** (`spawnShot` → `spawnObject` for `ObjectKind.Shot` only): the room choice becomes two hazards draws: `u = nextFloat`; `rooms = ` the rooms of online stations (`stationOnline`), in station-index order, de-duplicated; if `u < ENEMY_AIM_CHANCE && rooms.length > 0` → `room = rooms[nextInt(rooms.length)]`, else `room = nextInt(volume.length)` (uniform, as today). Then the flight and frequency draws as today: **four** hazards draws per shot (debris keeps three). **Shot impact on a console** (`resolveImpact`, Shot kind only, after the hull damage and before the breach/fire attempt): for each online station whose tile is in the hit room, in station-index order: one hazards draw `v`; if `v < ENEMY_SHOT_SYSTEM_CHANCE` → `failStation(state, i)`. Debris impacts are unchanged.

**Beams against shields** (`fireWeapon`, enemy slot `c`, replacing `beamAbsorbed`): let `tuned = sysHp[Shields] === 0 || shieldLayers === 0 || selector + 1 === shieldFreq`. One combat draw `u` always (the absorbed-without-a-roll rule is gone); `hit = u < enemyBeamThreshold(state, output)`. If `hit`: when `tuned` → `damageEnemy(state, c, ENEMY_BEAM_DAMAGE)` as today; otherwise → `shieldLayers −= 1`, `shieldRecharge = 0`, `telemetry.shieldHits += 1`, `telemetry.hits += 1`, no hull or system damage. A miss does nothing either way. Torpedoes are unchanged (homing, bypass). `beamAbsorbed` is deleted; its tests become shield-layer tests.

**Damage voids surrender** (`damageEnemy`): any call while `fleeing` sets `surrenderIntact = 0`. When `sysHp[Shields]` reaches 0: `shieldLayers = 0`, `shieldRecharge = 0`. A kill (`hull 0`) → `leave(state, true)` as today (kill scrap, even while fleeing).

**Leave** (`leave(state, destroyed)`): before clearing, if `!destroyed && fleeing`: `surrenderIntact ? (addScrap(SCRAP_SURRENDER), telemetry.surrenders += 1) : telemetry.enemyFled += 1`. Then clear the six new fields (`maxHull 0`, layers 0, recharge 0, `shotArmTick −1`, `fleeing 0`, `surrenderIntact 0`) along with today's. The cooldown draw as today. The jump's `leave(state, false)` while fleeing counts as a flee (no surrender scrap: the ship left, not the enemy).

Pure helpers in `enemy.ts`: `enemyMaxHull(column)`, `enemyShieldMax(column)`, `enemyWeaponCharge(state): number` (0 when absent or weapons down; else `clamp((tick − shotArmTick) / max(1, nextShotTick − shotArmTick), 0, 1)`), `fleeSecondsLeft(state)` (`ceil((departTick − tick) / TICK_HZ)` while fleeing, else 0).

### 11.4 HUD and record

- Enemy hull row (`targetRowText`, exact): `` `Enemy ${round(hull / maxHull × 100)}% ${fleeing ? `FLEE ${fleeSecondsLeft}s` : `${eta}s`} ${marker} [${'#'.repeat(layers)}${'.'.repeat(max − layers)}] W${round(weaponCharge × 100)}%` `` where `marker` is `S-` with shields down, `S${freq}` when scanned, else `S?` (as today), and the bracket is omitted when shields are down (`S-` alone). Examples: `Enemy 64% 90s S2 [#.] W70%`, `Enemy 20% FLEE 7s S- W30%`. `DebrisTarget` gains `layers: number | null`, `layersMax: number | null`, `weaponCharge: number | null`, `fleeSeconds: number | null`; subsystem rows are unchanged.
- Threat row (exact): `` `Enemy ship: hull ${pct}%${shields up ? ` shields ${layers}/${max}` : ''}${...DOWN suffixes as today}${fleeing ? ' FLEEING' : ''
}` `` (the `DOWN` suffixes are today's `weapons DOWN` etc.).
- Run notice (§4) gains rule **1b** between the event and the shop: `fleeing && surrenderIntact` → `[\`ENEMY SURRENDERS   hold fire ${fleeSecondsLeft}s for +${SCRAP_SURRENDER} scrap\`]` (45 characters at most). The bot ignores it (it does not fire anyway).
- Record: `enemy` gains `fled: number; surrenders: number; shieldHits: number` (after `disables`). The acceptance table's `enemy` column becomes `met/destroyed/fled/disables`.

### 11.5 Tests

- Arrival at column 0 and column 5 (`s.run.column = 5` before `arrive`): `maxHull 100/150`, `shieldLayers 1/2`, `shotArmTick === tick`; `enemyWeaponCharge` is 0 on the arrival tick, rises to 1 at `nextShotTick`, and is 0 while weapons are down.
- Recharge: with one layer stripped, `shieldRecharge` reaches 1 after `6 × 60` ticks and the layer returns; no recharge while shields are down or layers are at max; a repaired shield system starts at 0 layers and recharges.
- Beams: with shields up and an untuned selector, a hit (the next `rng.combat` value is read from a copy of the stream with `createRng(s.rng.combat.s)` and `nextFloat`, and the fixture's output is chosen so the value is below the threshold) strips one layer and counts `shieldHits 1`, `hits 1`, hull unchanged; a second hit at 0 layers damages the hull; a tuned beam at full layers damages the hull and leaves the layers; a miss leaves everything; torpedoes bypass at full layers; `damageEnemy` taking the shield system to 0 zeroes the layers.
- Aimed shots: `spawnShot` with the Weapons console online draws four hazards values and, when `u < 0.6`, lands in a console room (assert against a reference stream copy); with `u >= 0.6` any room; with every console offline, uniform; a Shot impact in a console room draws once more and fails the console when `v < 0.5`, not otherwise; a debris impact in the same room draws nothing extra and never fails a console.
- Flee and surrender (`placeEnemy` then `arrive`-equivalent fields set, or `arrive` through `step`): a beam that takes the hull to 24% with engines up starts the flee (`fleeing 1`, `departTick = tick + 480`, `surrenderOffers 1`); engines down at 24% does not start it; the enemy leaves 480 ticks later with `surrenders 1` and `+20` scrap if untouched; a damaging hit during the flee voids it (`surrenderIntact 0`, `enemyFled 1` on departure, no scrap); a kill during the flee pays `SCRAP_ENEMY` and counts `destroyed`; a jump during the flee counts `enemyFled` and pays nothing; engines downed during the flee stall `departTick`.
- HUD: the hull row strings above in four states (full layers, one stripped, shields down, fleeing); the threat row; the surrender notice and its priority (an event beats it, it beats the shop); the record's `enemy` block; the table's `enemy` column.
- Snapshot: every new field round-trips and changes the hash; version-15 rejected.
- Gates: `gate-survival` and `gate-boarding` re-run and re-recorded (aimed shots and the fourth hazards draw shift every seed); `gate-jump` and `gate-run` unchanged (arrivals silenced); the duo gate of §5 is tuned **after** this section lands, so its levers absorb the combat change. Golden re-blessed once for the version bump (and once more only if §5 takes a global lever, each recorded).

### 11.6 Gate additions

- [ ] The §11.5 tests pass; the four gates re-recorded with the combat change named as the cause of drift.
- [ ] Playtest step 6 becomes: a debris warning **and** an enemy encounter: see the enemy row with its shield bracket and weapon charge, strip a layer with an untuned beam, scan, pierce with a tuned beam, see the flee and the surrender notice, hold fire for the scrap once and kill once across the session. `docs/playtest.md` gains these as step 6's `See:` line.
