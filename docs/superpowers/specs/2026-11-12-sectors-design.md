# Sectors, Fuel and the Pursuit (Loop-i) Design

Status: 2026-11-12. From the user's direction after two FTL design transcripts: "I want to match their game loop as closely as possible before play testing and branching off into a more unique game." This is FTL-loop item 1, the biggest gap. FTL's real loop is route choice under a clock: visit as many beacons as you dare for scrap and loot before the rebel fleet catches you, then reach the exit. The fleet is the roguelike "hunger clock"; a mod that removed it showed players the game falls apart without it. FTLite today visits exactly one node per column of a single 8-column map, so there is no route trade-off.

## 1. Sectors

- A run is `SECTORS` (3) sectors. Each sector has its own map of `SECTOR_COLUMNS` (6) columns: column 0 is the arrival beacon, the last column is the **exit**, and the middle columns hold 2 to 4 beacons each (today: 2 or 3; up to 4 lets sideways routes matter). The node index stride becomes 4 (`column * 4 + node`).
- Map edges: today's forward edges (each beacon reaches at least one beacon in the next column, every beacon has an incoming edge), **plus sideways edges**: in a middle column, every beacon is joined to the beacons directly above and below it. Sideways jumps let a crew visit extra beacons, at the cost of fuel and time.
- Generation draws only from `rng.map`, in a fixed order: per sector, the column counts, the forward edges, then the node types (today's draws per middle beacon, plus the new Empty type in section 4). The sideways edges need no draws.
- Jumping from the exit starts the next sector: a new map, the pursuit reset (section 3), `sector += 1`, and arrival at column 0. Jumping from the last sector's exit wins the run (until the final battle, a later feature).
- Every sector guarantees one shop, as today's map does.
- **Depth** replaces the old column in every rule that scales with progress: `depth = sector × SECTOR_COLUMNS + column` (0 to 17). Scrap rewards (Demo-ix), enemy hull and shield scaling, and score use depth wherever they used `run.column`.

## 2. Fuel

- New run field `fuel`, starting at `FUEL_START` (8). Every jump costs 1: forward, sideways, or to the next sector.
- With no fuel, the Navigation card offers **Wait for help** instead of destinations. It takes `WAIT_SECONDS` (20), advances the pursuit one step (section 3), then one `rng.loot` draw: with `WAIT_FUEL_CHANCE` (0.6) a passing trader gives 2 fuel; otherwise nothing, and you can wait again.
- Sources: destroying an enemy gives `1 + nextInt(rng.loot, 2)` fuel (1 or 2); a cleared asteroid field gives 1; events may give or take fuel (text and outcomes are a content task, not this feature); shops sell fuel (`Fuel +2`, `FUEL_COST` 12 scrap).
- The HUD clock card shows `FUEL 6`; the Navigation card shows the fuel left after the chosen jump.

## 3. The pursuit

- New run field `pursuit`: the column the pursuing fleet has reached in the current sector, a real number. It starts at `PURSUIT_START` (−1.5) on arrival in a sector and advances `PURSUIT_STEP` (0.75) after every jump and every wait. With these values a crew gets about eight jumps per sector before the fleet reaches the exit column: five forward and about three to spare for sideways exploration.
- A beacon is **overrun** when its column is at or behind `floor(pursuit)`. Arriving at an overrun beacon, or the pursuit overrunning the beacon you are at, triggers a **pursuit fight**: the normal encounter rules (Demo-vi), with an elite enemy (`PURSUIT_HULL_MULT` 1.5 times hull, fire interval × 0.75), no scrap or fuel reward, and contact after `ENCOUNTER_START` as usual. Only one pursuit fight per beacon visit.
- Overrun beacons lose their own content (no event, shop or asteroid field).
- The map panel draws the fleet front as a red band across the overrun columns. The Navigation rows mark overrun destinations `FLEET`.
- Name in the game: **the Pursuit** (original; not FTL's "Rebel fleet").

## 4. Beacon types

- Adds **Empty** (`NodeType.Empty = 4`): a quiet beacon with nothing but the per-jump scrap. FTL has plenty of empty beacons, which makes the good ones worth hunting.
- Middle-beacon draw thresholds (one draw each, as today): Shop 0.15, Event 0.25, Asteroid 0.15, Empty 0.15, else Hazard (0.30). The guaranteed shop stays.
- The exit beacon is a Hazard (a fight on the way out) except in the last sector, where it stays quiet until the final battle exists.

## 4b. A peaceful start, and random encounters after each jump (added 2026-11-12)

The user: "lets make the game start with a peaceful zone and then random encounters after each jump".

- **Peaceful arrival beacons.** Column 0 of every sector is peaceful while you are there: no enemy, no pursuit fight, and the director spawns nothing (no fires, breaches, power failures, debris or boarding parties). Hazards already burning when you arrive at a new sector's column 0 still run their course. The drive charges as usual, so players learn the controls, set up power and jump when ready. The first sector's start replaces today's timed first enemy (`ENCOUNTER_FIRST`, `ENCOUNTER_FIRST_SMALL`, `BOARDING_FIRST_SMALL`): nothing arrives until the first jump.
- **The director wakes on the first jump.** Its clocks (spawn interval, escalation minutes and the boarding clock) start from the tick of the first jump out of a peaceful beacon, not from tick 0, so the first beacon's calm does not count toward escalation.
- **Random encounters, hidden until you arrive.** A beacon's type is still drawn when the map is made, but the crew does not see it until they jump there, as in FTL. The map and the Navigation rows show only `?` for unvisited beacons, except shops, which are always shown, and the exit, which is marked `EXIT`. Visited beacons show their type. Overrun beacons show `FLEET`. Each arrival is therefore a surprise: a fight, an asteroid field, an event, a shop or nothing.
- **HUD.** At a peaceful beacon the notice reads `Safe here. Jump when ready`; the threats panel is empty.
- **Tests.** No spawn, enemy or boarding party at a peaceful beacon over 300 s; the director's first spawn comes its usual interval after the first jump; beacon types hidden on the map and in the Navigation rows except shops, the exit and visited beacons; the notice.

## 5. Bots

- The captain bot (pid 0) picks destinations as today: the lowest forward destination. It never jumps sideways, never waits unless out of fuel (then always waits), and treats an overrun destination as a last resort. Gates should still win; record their new end ticks.

## 6. State and versions

New run fields: `sector`, `fuel`, `pursuit`, `pursuitFought` (0/1 for the current beacon), and `waitUntilTick` (−1 none). The map arrays become stride 4. All are flattened. `SIM_VERSION` 24 (after Coop-ii's 23). The golden is re-blessed once.

## 7. Tests

- Map: per sector, 6 columns, 1 / 2–4 / 1 beacons, forward-edge invariants as today, sideways edges between vertical neighbours in middle columns, one guaranteed shop; draws only from `rng.map`, deterministic per seed.
- Jumps: forward, sideways and sector jumps each cost 1 fuel; with 0 fuel only Wait is offered; Wait takes 20 s, advances the pursuit, then the 0.6 / 2 fuel draw.
- Pursuit: starts at −1.5, +0.75 per jump and wait; overrun by `floor`; arriving at an overrun beacon, or being overrun where you stand, starts one elite fight with no rewards; overrun beacons lose their content.
- Rewards: fuel from kills (1 or 2) and fields (1); the shop's fuel row; depth-based scrap and enemy scaling.
- Victory after the last sector's exit; the old 8-column victory gone.
- HUD: `FUEL n`, the Navigation card's fuel after the jump, `FLEET` marks, the red band on the map, Wait for help.
- Snapshot round trip and hash for every new field; version 23 rejected.
- Gates: every gate, re-recorded with causes; jump and run gates follow the new victory rule; no floor lowered.

## 8. Gate

- [x] Section 7 tests; golden re-blessed once; gate figures recorded.
- [x] Visual check by Claude: the sector map with sideways routes, the fleet band, `FUEL`, a sector jump, Wait for help.
- [ ] Manual, the user: does the route choice feel like FTL (greed against the clock)?

## 9. Amendments

(Filled during review and implementation.)

### Claude's review (the Codex spec review timed out, exit 124), 2026-11-12. These rules override earlier text where they differ.

- **S1. Leaving a sector.** The exit beacon has no forward edges. At the exit the Navigation rows offer `Jump to sector 2` (or `Escape: win the run` in the last sector) once the drive is ready, costing 1 fuel. This is the only way out of a sector.
- **S2. No softlocks.** With 0 fuel anywhere (the exit included), Navigation offers only `Wait for help`. Waiting is always possible, advances the pursuit and has a 0.6 chance of 2 fuel per wait, so a crew can always eventually move. An overrun exit still lets you leave once the drive is ready, after or during the pursuit fight.
- **S3. Sideways loops** are allowed (FTL lets you backtrack); each costs fuel and pursuit, so the clock limits them.
- **S4. Draw order.** The first sector's map is generated at run creation, as today. Each later sector's map is generated at the sector jump, in the same fixed draw order from `rng.map`. The wait's fuel draw and the kill's fuel draw use `rng.loot`. No other stream changes.
- **S5. One pursuit fight per visit.** `pursuitFought` resets on every jump. A pursuit fight replaces the beacon's own content (no Hazard-node fight on top). Once fought, staying at the beacon brings no second one.
- **S6. Events still fire** at an Event beacon on arrival even though its type was hidden; hiding is presentation only.
- **S7. Peaceful beacon and the pursuit.** Column 0 is never overrun while the crew is there for the first time (pursuit starts at −1.5 and needs two jumps to reach 0), so the peace cannot be broken by the fleet on arrival.

### Implementation amendments, 2026-11-12 (Loop-i execution)

- **I1. Peace is a flag, not only column 0.** `peaceful(state)` is `column === 0 && run.calm === 1`. `calm` is 1 at the run start and after every sector jump and 0 after any other jump. The flag lets the hazard gates and unit tests leave the peace at the start beacon without a jump (`wake()` / `hazardStart()` in `tests/helpers/sim.ts`), so their depth-0 scaling and figures stay as before. New run fields beyond section 6: `calm`, `wakeTick` (the first jump's tick, -1 before; `minutesOf` counts from it) and `visited` (one byte per beacon, flattened).
- **I2. The director at a peaceful beacon** updates stress only: no phase steps and no spawn attempts. The first jump enters Build Up, so its first spawn comes one escalated spawn interval (with the usual jitter draw) after the jump.
- **I3. No timed first enemy or party.** A new state arms neither (`NEVER`) and starts with no encounter (`Encounter.None`). `ENCOUNTER_FIRST`, `ENCOUNTER_FIRST_SMALL`, `BOARDING_FIRST` and `BOARDING_FIRST_SMALL` stay in `tuning.ts` only as the hazard gates' schedule (`hazardStart`).
- **I4. The pursuit fight** starts at arrival on an overrun beacon (inside the jump) or, per tick, when the front overruns the beacon you are at (`pursuitSystem`, step 5a, before the field). It waits while another enemy is present and stops a running asteroid field with no reward. The elite is the enemy that arrives while `pursuitFought` is 1: hull `round(maxHull x 1.5)`, fire interval x 0.75, no scrap, no fuel and no surrender bounty. Overrun beacons hold no content (`contentOf`): no event draw, no shop rows, no field.
- **I5. Row codes.** Jump rows and `jumpPending` carry beacon indices (`column x 4 + node`); the exit's sector row is `EXIT_JUMP` (24). `jumpShip` takes `{ column, node }`; `sectorJump` is the exit's jump. The pending notice names the sector (`Jump to sector 2? (1/2)`, `Escape: win the run? (1/2)`).
- **I6. Navigation rows.** Destination rows read `Node 3a  ?`, `Node 2b  Shop`, `Node 6a  EXIT`, `Node 2a  FLEET`, or once visited `Hostile`, `Event`, `Asteroid field`, `Empty`. Wait for help replaces the destinations with no fuel; during the wait the row reads `Waiting for help  19s`. Waiting needs no drive charge. The shop's Fuel row is the ninth item (after the upgrades); the shop notice line is `Hull +25 (30)  Torpedoes +2 (20)  Fuel +2 (12)  Upgrade (50)`.
- **I7. HUD.** The clock card grew a line: `HULL 100   TIME 12s   FUEL 8` then `SECTOR 1/3   node 2/6` (one line did not fit the 240 px card in the visual check); the power panel moved down 18 px. The Navigation footer is `Evade 35%  Jump READY  Fuel 8>7  Scrap 30` (now > after the highlighted jump; plain `Fuel 8` on other rows). The map title is `SECTOR 1/3   node 2/6   Jump 64%`. On the map a beacon's mark (`?`, `$`, `!` for a visited event) sits inside an 8 px node so the vertical sideways edges do not cross it (found in the visual check); EXIT stays below the exit. The game-over headline reads `Reached sector S node C`. The pursuit contact line is `The Pursuit has caught up: elite ship approaching`.
- **I8. Victory and the exit.** The exit is a Hazard fight on the way out in sectors 1 and 2 and quiet in the last. A sector's column 0 is quiet. Escaping pays no arrival scrap; it counts as a jump and a node reached.
- **I9. Float thresholds.** The node-type thresholds are cumulated with rounding (0.15 + 0.25 + 0.15 + 0.15 is 0.7000000000000001 in floating point), so a draw of exactly 0.70 is Hazard.
- **I10. Plan file names.** The plan names `tests/shop.test.ts`; the shop tests live in `tests/events.test.ts`, so the Fuel row's test is there. The elite-enemy tests sit in `tests/run.test.ts` beside the rest of the Pursuit.

#### Changed test files and why

- `tests/helpers/sim.ts`: stride 4 and the six-column fixture map M (`MAP_M_NODES`, `MAP_M_MASKS`); `at` / `ahead` beacons for `jumpShip`; `wake`, `woke`, `hazardStart`; `armSpawn` wakes the state (its spawn is the point).
- `tests/run.test.ts`: the map-generation tests rewritten for six columns, 2-4 beacons, stride 4, the Empty type and the new thresholds; sideways destinations; victory moved to the last sector's escape; the last sector's exit is quiet; jumps take beacons; Empty joins the quiet arrivals; new sections for sectors, fuel, waiting, depth, field fuel and the Pursuit.
- `tests/map.test.ts`: six columns, sideways edges in the model, the `SECTOR 1/3` title, types shown once visited; new fleet-front and hidden-beacon tests.
- `tests/events.test.ts`: jumps take beacons; the last column is 5 and its arrival no longer wins; sideways rows in the shop and event lists; the Fuel row (nine items); destination rows read `?`; a new fuel-row test.
- `tests/hud.test.ts`: six-column fixtures; row counts with the sideways and Fuel rows; the clock card's two lines; the Navigation footer's fuel; the headline `Reached sector S node C`; `?` rows.
- `tests/notice.test.ts`: the shop price line with fuel; the pending jump's beacon code; the awake fixture (the peaceful start has its own test); the start is no encounter; new Pursuit, peaceful-start and sector-jump notice tests.
- `tests/session.test.ts`: the victory setups start at the last sector's exit; the headline text.
- `tests/snapshot.test.ts`: six-column fixtures; version 23 rejected; the enemy block's initial `NEVER`; awake states for the Build Up and won-encounter continuations; a new round trip for every Loop-i run field.
- `tests/telemetry.test.ts`: the record's `columns` is 6.
- `tests/progression.test.ts`: the map stream's state after creation (the six-column map draws differently).
- `tests/enemy.test.ts`: no timed first enemy (the crew-size first times now checked through `hazardStart`); awake states where an arrival is the point; new kill-fuel and no-timed-enemy tests.
- `tests/boarders.test.ts`: no first boarding armed (the gate schedule checked through `hazardStart`); awake states for the arrival tests; a new peaceful-beacon test.
- `tests/director.test.ts`: states awake (`woke`) so the director's own tests run from tick 0 as before; new peaceful-start tests.
- `tests/combat.test.ts`, `tests/heat.test.ts`, `tests/characters.test.ts`: awake states where an arrival or a spawn is the point.
- `tests/bot.test.ts`: new captain-route tests (lowest forward, overrun last, sector jump, escape, waiting).
- `tests/gate-survival.test.ts`, `tests/gate-cutter.test.ts`: the hazard soak keeps the old schedule at the start beacon (`hazardStart`); figures unchanged.
- `tests/gate-boarding.test.ts`: the start beacon woken; the forced boarding unchanged.
- `tests/gate-jump.test.ts`, `tests/gate-run.test.ts`: three sectors, 18 jumps, victory on the escape; the quiet ship silenced every tick and later sectors' maps set to Hazard; the run gate's scrap counts every arrival's depth.
- `tests/golden/basic.json`: re-blessed once (SIM_VERSION 24, a8534c8f -> dca013d4).

#### Gates (min health, seeds 1/2/3), before -> after; no floor lowered

- `gate-survival`: 77.7 / 47.8 / 68.9 -> unchanged (min hull 72 / 68 / 84).
- `gate-cutter`: 59.1 / 61.5 / 65.6 -> unchanged.
- `gate-duo`: 28.8 / 28.8 / 47.6 -> 50.9 / 41.8 / 38.6 (min hull 80 / 48 / 60 -> 84 / 92 / 92); floor 25. Cause: the live run now starts with a minute of peace and wakes the director at the first jump.
- `gate-boarding`: 29.1 / 24.0 / 48.9 -> 32.5 / 49.9 / 48.9 (no health floor). Cause: the captain's jumps land on a different map.
- `gate-jump`: end tick 25207 (7 jumps) -> 64818 (18 jumps, six waits for help while the drive charged). `gate-run` passes with every arrival paid by depth.
- `npm run acceptance 5 1`: the bots still reach node 4 in five minutes at every crew size; spawns, impacts and idle streaks shift with the peaceful first minute (`.superpowers/sdd/loop-i-gates-after.md`).
- **I11. Codex implementation review (research/codex-review-sectors-impl.md), 2026-11-12:** no findings on the softlock, rng, pursuit, peaceful-start and victory paths.
