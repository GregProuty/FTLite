# Helm Demo H-0c-ii-a: Headless Gates (design)

Status: written 2026-11-15 under the owner's standing order ("take the recommendation and continue"). Every choice marked **(rec.)** is Claude's; the owner can overturn any of them. Parent spec: `docs/superpowers/specs/2026-11-14-helm-demo-design.md` (§13 scripted pair, telemetry and versioning; §16 telemetry gates; §15 H-0 row). Binding owner answers: `docs/vision/thesis-grill.md` Q11 to Q27.

## 1. Goal and the split

H-0's last row says the scripted duels, walking to repairs included, hit the telemetry targets (parent §15). Parent §16 makes those targets H-0's gate: over seeds 1 to 10, scripted pair against the hunter:
- median duel length 3 to 5 minutes;
- both outcomes occur;
- both weapons are used in every duel;
- no duel ends from planet contact in under 30 s;
- same-seed hash and golden replay pass.

H-0c-ii was the duel's authority wiring plus these gates. The wiring needs Codex's Net-3 (it rewrites `authority/core.ts` and touches `net/contracts.ts`), but the gates do not. So H-0c-ii splits **(rec.)**:
- **H-0c-ii-a (this spec):** the scripted pair, the telemetry, the tuning that meets the gates, the duel golden and the single `SIM_VERSION` bump. It is headless only.
- **H-0c-ii-b:** the authority duel mode, the command-union amendment and the snapshot codec. It waits for Net-3 and is unchanged from the H-0c-i final review's notes.

Known today: in H-1b play, a passive crew died in about 90 s (1:31 against the hunter at seed 2026). The gates measure the scripted pair, not a passive crew, but that number says the tuning will likely need to move.

## 2. What exists (merged)

- `sim/duel/`: `createDuel(layout, seed)`, `stepDuelTick(d, { held, commands })` (seat phase, presence, tactical commands, repair phase, movement, tactical step), `disposeDuel`, `hashDuel`/`flattenDuel`, `tuning.ts` (`REPAIR_UNITS`, solo and pair rates, `CUTTER_REPAIR_POINTS`).
- `sim/tactical/`: the flight and combat sim, `stepDuel`, the hunter (`hunterThink`, standoff band 320 u), per-tick `events` (laser shots, missile endings), `tuning.ts`, `hash.ts`.
- `app/duel/controls.ts` (render side): `repairInReach`, `consoleInReach`, `seatOf`, `cycleLock`. These are pure reads that mirror the sim's rules; the scripted pair may reuse their logic but must live in guarded code (§3).
- Goldens: `tests/golden.test.ts`, `tests/replayV2.test.ts`, `tests/golden/`. `SIM_VERSION = 35` in `sim/tuning.ts`, written into the sector `flatten` (`flatten.ts`, `out[0]`). `flattenDuel` and the tactical flatten do **not** include it today.

## 3. The scripted pair (`sim/duel/scripted.ts`)

A deterministic headless crew for tests and telemetry only, never offered as a seat (Q15).
- **Interface:** `createScriptedPair(seed): ScriptedPair` and `scriptedInput(pair, d): DuelInput`. Each tick it reads the duel state and returns that tick's held input and commands (`requestedTick = d.interior.tick`, with its own per-player sequences). It is pure apart from its own small state object.
- **Determinism:** it lives under `sim/duel/` **(rec.)**, so the determinism guard covers it:
  - only the allowed `Math` methods;
  - no `Date`;
  - randomness only from its own seeded stream (`createRng` from the sim's RNG helpers, seeded from the duel seed with a fixed salt, never `rng.tactical`).
- **The Helm (player 0)**, a fixed priority list evaluated each tick; the first rule that applies sets `{turn, thrust}`:
  1. *Avoid:* take the points of `predictPath(state, 0, current axes, AVOID_TICKS, 4)` (positions only) and test each in order for a *hazard*:
     - the planet: distance to its centre below `planet.r + SHIP_RADIUS + AVOID_MARGIN`;
     - an asteroid: any asteroid from `queryGrid(grid, x, y, SHIP_RADIUS + AVOID_MARGIN)` whose distance is below `a.r + SHIP_RADIUS + AVOID_MARGIN`;
     - the edge: distance from the map centre above `rMap − AVOID_MARGIN`.

     At the first predicted point with any hazard, one hazard is chosen in this order: the planet, then the edge, then the asteroid with the smallest clearance (distance minus `a.r`), ties to the lower asteroid index. The Helm turns toward the heading pointing directly away from the chosen hazard (from the planet's or asteroid's centre, or toward the map centre for the edge), by the sign of the heading error (ties turn clockwise), with thrust 1.
  2. *Line up:* if the gunner holds a full charge and the enemy is within `LASER_RANGE` but outside the laser arc, turn toward the enemy's bearing (sign of the bearing error), with thrust 0.
  3. *Orbit:* otherwise, hold an orbit of radius `ORBIT_R`, seeded once per duel in `[ORBIT_MIN, ORBIT_MAX]`. That band lies outside the belt and inside the edge: `ORBIT_MIN ≥ BELT_OUTER + 200` (1500) and `ORBIT_MAX ≤ R_MAP − 600` (2200). The plan picks the values within those bounds. Let `r` be the ship's distance from the planet and `t` the prograde tangent direction (the direction the ship is already circling, or clockwise at rest).
     - *Desired velocity direction:* `t` rotated toward the planet by `clamp(ORBIT_GAIN · (r − ORBIT_R), −30°, +30°)`. Outside the radius it points inward, and inside it points outward.
     - *Turn:* the Helm turns its nose toward the desired direction (sign of the heading error, ties clockwise).
     - *Thrust:* +1 when the nose is within 45° of the desired direction and either the speed is below `circularSpeed(r) − SPEED_SLACK` or the velocity direction is more than 10° off the desired direction. −1 when the nose is within 45° of the desired direction and the speed is above `circularSpeed(r) + SPEED_SLACK`. Otherwise 0.

     Thrust thus bends the velocity toward the desired direction, which is how the radius is corrected; turning alone changes only the heading.

  Stabilise is not modelled separately: rule 3 releases turn when the heading error is under one heading step.
- **The gunner (player 1):**
  - *Charge:* hold Fire whenever `canCharge` and no charge is held.
  - *Release:* release when the charge is full and the enemy is in arc, in range and in line of sight (the sim's own `geometry.ts` tests). Otherwise keep holding until the sim's hold timer would discard; then release anyway.
  - *Lock:* Shields while the enemy has a shield layer up, then Weapons. A lock change is sent only when it differs from the current lock.
  - *Missile:* launch when `canLaunch`, the enemy is beyond `LASER_RANGE`, and at least `MISSILE_GAP` ticks have passed since the last launch. Steer by the sign of the bearing error from the missile to the enemy.
- **Repair** **(rec.)**: there is one rule, *nearest free character*.
  - Each tick, if a crew room has damage ≥ 1 and nobody is assigned to it, it is assigned to the character with the shortest walk (BFS tile distance) to its repair point. Ties go to player 1.
  - A character takes one assignment at a time. With several rooms damaged, the higher damage level goes first, then room order (Weapons, Shields, Engines).
  - The assigned character stands, walks, holds Interact until the room's level reaches 0, then walks back to its own console and sits. The other character stays at its console.
- **Walking:** the sim has no interior pathfinder today, so the pair adds a BFS over the Cutter's walkable tiles (doors held open) in `sim/duel/scripted.ts`. Each tick it produces `moveX`/`moveY` toward the centre of the next tile on the path, recomputing the path when the character leaves it. The route goes through door tiles only, with no diagonal through a wall corner.
- **Commands and the seat rules:** stand and sit go out as ordinary commands. A sit is sent only when `consoleInReach`-equivalent conditions hold, and the pair never sends a weapon command from a character that is not seated at Weapons. Both characters stay present throughout, so no presence commands are needed.
- **Tunable:** the pair's own constants (`AVOID_TICKS`, `AVOID_MARGIN`, `ORBIT_GAIN`, `ORBIT_MIN`, `ORBIT_MAX`, `SPEED_SLACK`, `MISSILE_GAP`) are named at the top of the file, separate from the game tuning; the plan sets their values from the prototype.

## 4. Telemetry (`sim/duel/telemetry.ts`)

Per duel, accumulated tick by tick from `d` and that tick's events (parent §13's list):
- **Totals:** duration in ticks; outcome.
- **Laser and missiles:** laser releases, hits, misses and shield layers stripped, per ship. Missiles launched, hits by room, and losses by cause (planet, asteroid, edge, expiry, own ship, the other missile), per ship.
- **Contacts:** planet and asteroid contacts per ship. Baits **(rec.)**: an enemy planet or asteroid contact counts as a bait when it follows a crew manoeuvre within the previous 300 ticks.
  - A *crew manoeuvre* is a tick where the Helm's turn or thrust axis is non-zero and the enemy is within 900 u, stamped with its tick.
  - The bait also requires that the distance from the enemy to the obstacle it hit shrank over the window from the stamped tick to the contact. The struck obstacles are identified exactly from the enemy ship's per-body contact grace, `graceUntil`:
    - every damaging contact sets `graceUntil[body] = tick + CONTACT_GRACE_TICKS` (`contacts.ts`);
    - body 0 is the planet, and body `k + 1` is asteroid `k`;
    - each body whose entry was set to that value during the tick was struck that tick, so several in one tick are all found.

    The accumulator keeps the enemy's position at the stamped tick. A contact is a bait when, for that struck body, the enemy's distance to it shrank between then and the contact tick. This needs no sim change.
- **Repairs:** repairs started and finished per player.
- **Time away:** time away from each console, split into walking and repairing.
- **Other:** console swaps; ticks the enemy spent in the crew's laser arc; ticks Weapons had nothing to do: someone is seated at Weapons, no crew missile is in flight (steering one is work), the charge is full or the laser is frozen, no launch is possible (`canLaunch` false, or the enemy is within `LASER_RANGE`), and the enemy is outside the laser arc.

To count repairs, `repairPhase` emits per-tick **repair events** into a new `d.events` list **(rec.)**:
- `{kind: 'repairWork', player, room}` for every player who added repair work this tick;
- `{kind: 'repairDone', room, players}` when a room's level drops, naming every player who worked on it that tick.

The list is cleared each tick, like `tactical.events`, and it is not hashed: it is derived, not state. The repair behaviour does not change. The telemetry accumulator, not the duel state, keeps the previous tick's workers:
- a *repair start* is counted for a player the first tick they work on a room after not working on it the tick before, so resumed work counts again;
- a *repair finish* is credited to every player named in `repairDone`, so joint work credits both.

**Terminal cause** **(rec.)**: the outcome is decided after all of a tick's damage (`duel.ts`), so telemetry records, for each ship whose hull reached 0 on the final tick, what hit it that tick:
- planet contact (its `planetHits` rose);
- asteroid contact;
- ship contact;
- laser (a laser event hit it);
- missile (a missile event landed on it).

A duel **ends from planet contact** when the losing ship (both, for a draw) took a planet contact on its final tick.

`scripts/duel-telemetry.ts` runs the scripted pair over chosen seeds and prints a table per seed plus the gate summary; it is the tuning tool.

## 5. The gates and the tuning (`tests/duelGates.test.ts`)

- **Gate test:** runs seeds 1 to 10 headless with the scripted pair, capped at 15 minutes per duel. It asserts each §16 gate:
  - median length within 180 to 300 s;
  - at least one crew win and one crew loss;
  - every duel has at least one laser release and one missile launch by the crew;
  - no duel ends from a planet contact before tick 1800;
  - every duel ends before the cap.
- **Runtime:** the ten-seed gate always runs in the full suite. No fallback replaces it. If it is slow, the plan may split it into one test per seed, so Vitest's per-test timeout stays sane, and raise that timeout. It may not drop seeds. A separate quick smoke test is allowed in addition.
- **Tuning:** the plan prototypes the tuning that meets the gates. It changes numbers in `sim/tactical/tuning.ts` and `sim/duel/tuning.ts` (hull, shield regen, laser charge time and damage, missile damage, magazine regen, hunter aggression and standoff, repair rate), not the rules. Each changed number is listed in the plan with its old and new value and the reason. Tuning comes before the pair's own numbers: the pair should play reasonably, and the game numbers make the duel last 3 to 5 minutes **(rec.)**.
- **Passive crew (recorded, not gated):** the test also reports, without asserting, how long an untended crew (nobody at either console) survives over the same seeds. Above 60 s is the hope, so a player who walks away briefly is not dead.

## 6. Versioning and the golden

- **Version:** one `SIM_VERSION` bump (35 → 36) for the duel mode's sim behaviour, as parent §13 says.
- **Sector goldens:** the version is written into the sector flatten, so every stored sector hash changes with it, and they are all re-blessed (`npm run bless`). That the change is version-only is proved by what does *not* change: the existing gameplay-projection checks in `tests/golden.test.ts` (the pinned `tests/fixtures/net1a-baseline.json` observations) still pass untouched, and so do the sector gates and traces. The plan lists every re-blessed file, and none of the pinned projection fixtures among them.
- **Duel golden:** `tests/golden/duel-*.json` records the scripted pair's duel at one seed. It stores `SIM_VERSION`, the final `hashDuel`, the outcome, the duration and hashes every 600 ticks. `flattenDuel` gains `SIM_VERSION` as its first value **(rec.)**, so the duel hash changes with the version as the sector hash does. A replay test asserts it, and the same-seed hash test runs two independent duels and compares per-tick hashes.
- **Conflict note:** Codex's Net-3 branch may also bump `SIM_VERSION` or re-bless goldens. Whichever merges second re-bumps and re-blesses; the plan notes this.

## 7. Boundaries

- No change to `authority/`, `net/contracts.ts`, `app/`, `render/` (beyond what tuning changes on screen), or sector behaviour.
- Sim changes are limited to:
  - the repair events;
  - tuning numbers;
  - the new `scripted.ts` and `telemetry.ts`;
  - any helper the pair needs, such as a pathfinder export.
- All of it follows the determinism guard.

## 8. Acceptance

- The gate test passes over seeds 1 to 10.
- The duel golden and same-seed hash pass, and the sector goldens change by the version number only.
- `scripts/duel-telemetry.ts` prints the table.
- The full suite passes, and `npm run typecheck` is clean.
- The solo duel (`npm run dev:duel`) still runs. A screenshot check confirms the duel boots, since tuning changes what the player sees.

## Change log

- 2026-11-15: written. It splits H-0c-ii into the headless gates (a) and the authority wiring (b, waits for Net-3).
- 2026-11-15: refine round 1: sector goldens re-blessed in full and proved version-only by the untouched gameplay projections; the ten-seed gate always runs; exact pair rules and named constants; one repair-assignment rule; terminal-cause attribution; bait and idle definitions; repair-event semantics; `flattenDuel` gains `SIM_VERSION`; missile-to-missile losses.
- 2026-11-15: refine round 2: avoidance hazard tests and the edge test are explicit (predictPath returns positions only); the orbit band is bounded outside the belt and inside the edge; the bait's struck obstacle is identified from the contact tick's counters and the grid.
- 2026-11-15: refine round 3: hazard selection order and tie break; orbit radius correction via a desired velocity direction and thrust; bait attribution from per-body graceUntil changes (every asteroid struck in a tick).
