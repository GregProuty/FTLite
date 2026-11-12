# Demo Ready (Demo-i) Design

Status: drafted 2026-11-11 at the user's request after the ten-feature loop (`docs/roadmap.md` items 1-10 merged, master a2a27f2). Parent: `2026-11-09-foundation-design.md` §7 (session flow, HUD), §10 (acceptance). Builds on everything merged through Run-iii. This is the first feature whose acceptance is a human two-player session, not only the test suite.

## 1. Goal

A two-player couch session that a newcomer can start, read and finish without the builder in the room: the controls are on screen, the ship is survivable for two, the run's decisions (events, shops, a ready drive) are visible to both players rather than only to the one seated at Navigation, the automated soak exercises the run and not just the ship, and every HUD surface has been looked at by a person once.

**Out of scope (follow-ups, listed in §10):** a drawn sector map, audio, a second ship, more events or unlocks, integer door timers, networking.

## 2. Options considered

- **Where the controls live:** (a) a block of lines in the lobby's summary area **(recommended, chosen)**: pure model text, no new UI element, visible exactly when needed; (b) a page in the credits overlay: hidden behind Cancel; (c) a printed card: not in the build.
- **How the second player sees a run decision:** (a) a one-line run notice in the centre banner slot during play **(chosen)**: the banner is empty while running, both players look there already; (b) duplicate the Navigation panel on every player's block: crowds the blocks; (c) let any seated player resolve events: a new input rule, more than a demo needs.
- **Two-player balance:** (a) a crew-size scale on the director's spawn interval and a later first boarding for crews of two or fewer, tuned until a new two-bot health gate passes **(chosen)**: one lever family, measurable; (b) retune global damage numbers: changes the four-player game; (c) heal faster: hides the problem.
- **Covering the run in the soak:** (a) teach the bot to jump when the drive is ready and no one is seated at Navigation, and to resolve events with the safe choice **(chosen)**; (b) a separate scripted soak: two harnesses to maintain; (c) leave it: the run stays untested at length.

## 3. Controls card (lobby)

`HudModel.lobbyLines: string[]` (`[]` outside the lobby). In the lobby, exactly these six lines, drawn in the summary rows (which are otherwise unused in the lobby) under the progress line:

```
Move: WASD / Left stick        Interact (repair, revive, sit): E / A
Confirm (console action): F / X    Cancel (stand, menu): Q / B
Keyboard 2: Arrows, Enter, Right Shift, Backspace
Walk to a console and press Interact to sit; Up/Down pick, Confirm acts
Fires, breaches and failed consoles: stand next to them and hold Interact
Navigation jumps when the drive reads READY; events and shops appear there
```

`hud.ts` draws `lobbyLines` through the existing eleven summary rows (rows 0-5) when `phase === 'lobby'`; the game-over summary keeps its use of the same rows. No new Pixi objects. The strings are exact and tested; each is at most 76 characters (about 420 px at 1x, centred on 960 px).

## 4. Run notice (centre banner while running)

`HudModel.notice: string` (`''` unless running). While `phase === 'running'`, `hud.ts` shows `notice` in the banner's position at **1x** scale (a new `noticeText` object, `DIM` tint, centred at y = 24; the 2x `banner` stays for lobby/pause/gameover messages and is empty while running). Pure `runNotice(state): string` in `hudModel.ts`, first match wins:

1. Event pending: `` `EVENT: ${title}  —  ${choices[0]}  /  ${choices[1]}` `` (the Navigation operator chooses; the text is for everyone).
2. Shop node and no event pending: `` `SHOP at ${nodeLabel(column, node)}  —  scrap ${scrap}` ``.
3. `jumpCharge >= 1` and no one seated at Navigation: `` `JUMP READY  —  someone take Navigation` ``.
4. `jumpCharge >= 1` and Navigation seated: `` `JUMP READY` ``.
5. Otherwise `''`.

The dash is the ASCII sequence `  -  ` in code (the spec's typographic dash is illustrative); the longest string (event 4) is 83 characters, about 460 px at 1x, so it fits between the clock panel (200 px) and the threat panel (starts at 728 px) with room to spare: the banner centre is 480 px, half-width 230 px → 250 to 710 px.

Threats: the `Event:` and `Shop here` rows move to the **end** of the threat list (after objects), so real hazards keep the four visible slots; with the notice carrying the same information their loss off the bottom is acceptable. The Run-ii HUD tests that pinned them first are updated to pin them last.

## 5. Two-player balance

New tuning: `CREW_INTERVAL_MULT = [1.5, 1.25, 1, 1]` indexed by `playerCount − 1` (replaces the single `SOLO_INTERVAL_MULT 1.5`: the solo value is unchanged, two players get 1.25, three and four 1); `BOARDING_FIRST_SMALL = 330` seconds for `playerCount <= 2` (four-player stays `BOARDING_FIRST 240`); `ENEMY_FIRST_SMALL = 270` for `playerCount <= 2` (four-player `ENCOUNTER_FIRST 210`). `spawnInterval(minutes, players)` multiplies by `CREW_INTERVAL_MULT[players − 1]`; the boarders' and enemy's first-arrival ticks read the small-crew value at creation. No other formula changes.

**Target (the new `tests/gate-duo.test.ts`):** two bots with `DEFAULT_CHARACTERS` (Okoro and Lindqvist) on seeds 1-3 for five minutes: the run does not end, both are Conscious at the end, and **the minimum health of any Conscious crew member over the whole run is at least 25** (today's figures are 0.0/0.1/0.1). The existing `gate-survival` keeps its assertions and figures are re-recorded (it is a two-bot gate too, so it will move; the four-player acceptance soak must still show `running` at 5:00 for seed 1).

**Levers, in order, only if the gate fails after the three changes above:** (1) `CREW_INTERVAL_MULT[1]` 1.25 → 1.4; (2) `BOARDING_FIRST_SMALL` 330 → 400; (3) `DEBRIS_CREW_DAMAGE` 20 → 15 (global; recorded as such). The golden replay is four-player (seed 2026), so the small-crew changes do not touch it; a global lever would, and is re-blessed once if taken.

## 6. The bot runs the ship

`botIntent` gains two behaviours, both for **pid 0 only** (the "captain"), evaluated before its hazard goals:

- **Jump:** when `run.jumpCharge >= 1`, no pending event, and nobody is seated at Navigation: the Navigation console tile is the bot's goal; on arrival (the Confirm target is the console) it presses Confirm to sit; while seated with a ready drive it presses Confirm (the cursor's first row is the first destination on a Hazard node). After the jump (`jumps` changed) it stands (Cancel) and resumes its hazard goals. While the drive is not ready it does not sit.
- **Events and shops:** while seated with an event pending, it moves the cursor to the event's safe choice and confirms: `EVENTS[id].safeChoice`, a new field, `1` for events 0, 1, 2, 3 and 5 (leave, ignore, refuse, go around, decline) and `0` for event 4 (take the scrap; stripping it fails a station). It never buys at a shop.

Hazard goals keep priority when a crew member is Downed (revive first). The acceptance soak's `nodes` column then reads `n/8` with `n >= 3` for every seed-1 row at five minutes (a jump a minute after arrival, less the walk and the events), and the seed-1 four-player row must still be `running`.

## 7. The playtest gate

A human two-player session is the acceptance criterion. `docs/playtest.md` (new) is the script: lobby and controls card; join two keyboards; start; sit at a console each; survive a fire and a debris warning; jump once; resolve an event; visit a shop and buy hull; keep going until a game over or a victory; read the summary; restart with the same seed. Each step has a "what you should see" line taken from this spec and its parents, and a box for notes.

**Triage rule for what the session finds:** a visual overlap, a wrong or missing string, a control that does not do what the card says, or a crash is fixed on the same branch before merge (as "Demo-i fixes", each with a test where one can exist). A balance observation is recorded with the figures and left for a follow-up unless the run ended before the first jump, in which case the §5 levers are re-authorised. A design wish is recorded in §10.

## 8. Tests (vitest, node)

- Controls card: `buildHudModel(null, slots, 'lobby', '')` has the six exact lines; `'running'` and `'gameover'` give `[]`; each line `<= 76` characters.
- Notice: `runNotice` on fixture states (map M, `setEvent(4)` → the exact event string; a Shop node without an event → the shop string with the scrap; `chargeJump` with nobody seated → `JUMP READY  -  someone take Navigation`; seated → `JUMP READY`; otherwise `''`); the model's `notice` is `''` in the lobby even with a ready drive; the pending event beats the shop beats the ready drive. Threat order: with a fire, an enemy and a pending event at a Shop node the rows are enemy, fire, `Event:`, `Shop here`.
- Balance: `spawnInterval` at each player count; `boarders.nextArrivalTick` and `enemy.nextArrivalTick` at creation for 1, 2, 3 and 4 players; `tests/gate-duo.test.ts` as §5 with the figures logged in the gate section; `gate-survival`, `gate-boarding`, `gate-jump`, `gate-run` re-run and re-recorded (jump and run are unaffected: they silence arrivals).
- Bot: on a quiet two-player state with `chargeJump`, pid 0 walks to Navigation, sits, jumps; `jumps` is 1 within `(60 + 20)` seconds of sim time; after the jump it is standing within 2 seconds; with an event pending it resolves `safeChoice` (events 4 and 0 asserted); it never buys at a Shop node (scrap unchanged after 30 s seated); with a Downed teammate and a ready drive it revives first. `EVENTS[i].safeChoice` is `[1, 1, 1, 1, 0, 1]`.
- Acceptance: `npm run acceptance 5 1` rows show `nodes` `>= 3/8` for the three seed-1 rows and `running` for the four-player row (asserted by a new test that runs `runAcceptance` for seed 1, 2 players, 5 minutes and checks `nodesReached >= 3`).
- Playtest: `docs/playtest.md` exists with the twelve steps (a test counts the `- [ ]` steps).

## 9. Gate (`docs/gates.md`, entries start unchecked)

- [ ] `npm test` passes with the §8 tests; golden unchanged unless a global lever was taken (then re-blessed once, recorded).
- [ ] `gate-duo` passes on seeds 1-3 with the minimum Conscious health recorded per seed; the levers taken, if any, in order.
- [ ] `gate-survival`, `gate-boarding`, `gate-jump`, `gate-run` pass; new figures recorded.
- [ ] `npm run acceptance 5 1`: three rows; `nodes >= 3/8` on each; the four-player row `running`.
- [ ] **Playtest (two players, `npm run dev`), dated, with `docs/playtest.md` filled in:** every step seen; the fixes made from it listed with their commits.
- [ ] `npm run typecheck`, `npm test`, `npm run build` pass on the final commit.

## 10. Follow-ups recorded, not built

A drawn sector map (Navigation panel or game-over); audio cues (alarm, fire, impact, jump, victory); a second ship layout; more events and a second unlock tier; any seated player resolving events; integer tick door timers at the next version bump; whatever the playtest adds here.
