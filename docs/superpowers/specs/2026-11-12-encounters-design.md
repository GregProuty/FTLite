# Encounters and Fire Retune (Demo-vi) Design

Status: 2026-11-12. The user said the game "doesnt feel fun yet" and asked for items 1 and 2 of Claude's fun pass: make each node an encounter with a beginning, a goal and an end; retune fire so it serves the fights instead of replacing them. Parent: Combat-i/ii, Run-i/ii, Demo-i §11 (FTL combat), Demo-ii.

## 1. Problems

- **No shape at a node.** The enemy arrives on a timer (30 s after any jump, a cooldown after it leaves), hazards accumulate on the director's clock, and nothing marks a fight as started, won or over; event and shop nodes get the same enemy as hazard nodes.
- **Fire is the whole game.** Every playtest and soak is spent chasing fires: spread is about 15% per 5 s per open edge, the director's fire weight is the largest, and nothing caps simultaneous ambient fires, so two players lose the race while combat sits in the background.

## 2. Encounters

**State** (`run`, flattened after `startBonus`; `SIM_VERSION 18`, version-17 snapshots rejected): `encounter: number` (0 none, 1 pending, 2 fighting, 3 won, 4 over), `encounterTick: number` (the tick it entered its current state, −1 initially), `driveBoost: number` (0/1). Telemetry gains `encountersWon` after the last scalar.

**Where encounters happen.** The start node (column 0) keeps today's first arrival (`ENCOUNTER_FIRST`, or `ENCOUNTER_FIRST_SMALL` for crews of two or fewer) and `encounter = 1` at creation. A jump to a **Hazard** node that is not the last column sets `encounter = 1`, `enemy.nextArrivalTick = tick + ENCOUNTER_START × TICK_HZ` (`ENCOUNTER_START = 8` s). A jump to an **Event** or **Shop** node sets `encounter = 0` and `enemy.nextArrivalTick = NEVER` (`NEVER = 2^31 − 1`): those nodes are quiet. (The Run-i `ENCOUNTER_AFTER_JUMP` constant is retired.)

**Start.** When the enemy arrives (`arrive`), `encounter = 2`, `encounterTick = tick`.

**End** (in `leave(state, destroyed)`, before its cooldown re-arm, which this replaces): if `encounter === 2`:
- destroyed, or a paid surrender: `encounter = 3` (won), `telemetry.encountersWon += 1`, **reward**: `hull = min(HULL_MAX, hull + ENCOUNTER_REWARD_HULL)` (`8`) and `driveBoost = 1` (the kill and surrender scrap are unchanged);
- fled, withdrew (`departTick`) or left by our jump: `encounter = 4` (over, no reward).
In every case `encounterTick = tick` and `enemy.nextArrivalTick = NEVER`: **one enemy per node**. (The `ENCOUNTER_COOLDOWN` re-arm and its director draw are removed; the draw accounting changes and is recorded.)

**Drive boost.** While `driveBoost === 1`, `jumpStep` charges `ENCOUNTER_BOOST` (`4`) times as fast; the jump clears it.

**Notice** (Demo-i §4 `runNotice`), a new rule after the pending event and before the surrender line: for `ENCOUNTER_NOTICE_SECONDS` (`8`) after `encounterTick` when `encounter === 3`: `['ENEMY DEFEATED   +8 hull', 'Drive charging fast']`; when `encounter === 4`: `['Enemy gone']`. While `encounter === 1` and the arrival is due within 8 s: `['Contact: enemy ship approaching']`. Each line within `NOTICE_LINE_MAX`.

## 3. Fire retune

- `FIRE_SPREAD_P` 0.0027 → **0.0012** per hazard tick per burning edge at passage 1 (about 7% per 5 s).
- **Ambient fire cap:** the director does not choose a fire spawn while `burningRoomCount(state) >= FIRE_SPAWN_CAP` (`2`); the type roll is taken over the remaining types (same single draw: the fire weight is treated as 0 for that roll). Spread, overheats and impacts are not capped.
- `SPAWN_WEIGHTS.fire` 2 → **1**.
- **The enemy is the pressure:** while `encounter === 2`, the director's spawn interval is doubled (`ENCOUNTER_SPAWN_MULT 2`).
- **Hits make fires:** a Shot impact tries a fire first and a breach as the fallback (today a 50/50 draw decides; for Shots the draw is still made and `breachFirst = u < 0.25`); debris keeps 50/50.

## 4. Tests

- Encounter states: creation `encounter 1`; arrival → 2; destroyed → 3 with +8 hull (capped) and `driveBoost 1`; surrender paid → 3; fled, withdrew and jumped-away → 4 without reward; `nextArrivalTick === NEVER` after every end; no second enemy at the node over 600 s; a jump to an Event or Shop node → no enemy over 600 s; a jump to a Hazard node → enemy at +8 s; the boost charges 4× and clears on jump; the start node's first arrival unchanged.
- Notice strings and priorities; their lengths.
- Fire: spread probability constant; the ambient cap (with two rooms burning the director never picks fire, a stub roll that would pick fire picks the next type); the fire weight 1; the interval doubled while fighting; Shot impacts fire-first at `u < 0.75`.
- Snapshot round trip and hash for the three run fields and `encountersWon`; version-17 rejected.
- Gates: survival, duo (seed 3's floor back to **25** if it passes, else locked near the observed value with the reason), boarding, cutter, jump, run and `npm run acceptance 5 1` re-run and recorded with before/after figures; golden re-blessed once (SIM_VERSION 18, encounter rules and fire tuning).

## 5. Gate

- [x] §4 tests; golden re-blessed once.
- [x] Every gate re-recorded with the cause; duo seed 3 floor outcome recorded.
- [x] Visual check by Claude (2026-11-12, two idle players, cutter): "Contact: enemy ship approaching" at 265 s, the enemy panel and threat line at 290 s. The win notice and the fast drive are covered by tests only (winning needs a gunner).
- [ ] Manual, two players: each hazard node feels like a fight with a start and an end; fires are a problem, not the game.

## 6. Amendments

- **Shot impact mapping.** Section 3 gives `breachFirst = u < 0.25` for Shots; section 4's "fire-first at u < 0.75" names the same 75 % from the other end of the interval. Implemented as section 3 states (`SHOT_BREACH_FIRST = 0.25`: a Shot tries a breach first when u < 0.25, a fire first otherwise); the test pins u < 0.25 -> breach, u >= 0.25 -> fire, debris still 50/50, one draw either way.
- **Draw accounting.** `leave` no longer draws from `rng.director` (the `ENCOUNTER_COOLDOWN` jitter is gone with the constant). A kill, a withdrawal or a flight makes no director draw; a jump with the enemy present makes one director draw (the Build Up re-arm), not two. Shots keep their jittered re-arm draw. Tests updated for this reason: enemy.test (withdrawal, kill, kill on a due-shot tick, and the old "second encounter after the cooldown" test, now "no second encounter at the node") and run.test (the jump's draw count and the post-jump enemy clock).
- **Where the end is recorded.** `leave` sets `encounterTick = tick` and `nextArrivalTick = NEVER` on every departure; the won/over transition happens only while `encounter === 2` (an enemy placed by a test with `encounter 1` leaves without a reward). A jump with the enemy present passes through "over" and the jump then sets the new node's state, so "Enemy gone" never shows after a jump.
- **Jump state.** Every jump sets `encounterTick = tick` with the new `encounter` (1 at a Hazard node short of the last column, 0 otherwise, the final column included) and clears `driveBoost`.
- **Ambient cap placement.** The cap is applied in `typeWeights` after the halving and the routing bonus (fire weight set to 0), so the weights tests read are the ones the roll uses. `ENCOUNTER_SPAWN_MULT` multiplies the interval in the director re-arm; `spawnInterval` itself is unchanged.
- **Telemetry.** `encountersWon` is flattened after `surrenders`; it is not added to the telemetry record or the acceptance table (not asked for).
- **Tests updated for the retune.** director.test: every `typeWeights` expectation now has fire base 2 instead of 4; the explicit-director-state test uses seeds 16/2/14/8 (second draws 0.144/0.325/0.426/0.625 against [2, 2, 2, 4]); the no-target and failure-in-step tests use seeds 2 (breach) and 14 (power). snapshot.test rejects version 17. No existing test pinned the spread constant or the 50/50 shot impact.
- **Gates.** All pass with no lever taken; figures in docs/gates.md (Demo-vi). `gate-duo` seed 3 rose from 16.8 to 81.5 (its bots jump through quiet nodes and meet no enemy in the window), so its exception at 15 is removed and every seed is on 25. Seeds 1 and 2 fell from 63.4/60.9 to 28.8/28.9, and `gate-survival` seed 2 from 73.7 to 23.7 (that gate has no health floor): the margin is thinner where the bots fight under fire-first hits.
