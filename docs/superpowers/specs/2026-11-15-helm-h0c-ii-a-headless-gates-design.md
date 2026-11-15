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
- Goldens: `tests/golden.test.ts`, `tests/replayV2.test.ts`, `tests/golden/`. `SIM_VERSION = 35` in `sim/tuning.ts`, hashed into every flattened state.

## 3. The scripted pair (`sim/duel/scripted.ts`)

A deterministic headless crew for tests and telemetry only, never offered as a seat (Q15).
- **Interface:** `createScriptedPair(seed): ScriptedPair` and `scriptedInput(pair, d): DuelInput`. Each tick it reads the duel state and returns that tick's held input and commands (`requestedTick = d.interior.tick`, with its own per-player sequences). It is pure apart from its own small state object.
- **Determinism:** it lives under `sim/duel/` **(rec.)**, so the determinism guard covers it:
  - only the allowed `Math` methods;
  - no `Date`;
  - randomness only from its own seeded stream (`createRng` from the sim's RNG helpers, seeded from the duel seed with a fixed salt, never `rng.tactical`).
- **The Helm (player 0):** orbit at a seed-chosen radius in the open band between the belt gaps. It brings the nose round so the enemy enters the laser arc when the gunner is charged, and turns away from the planet when the predicted path (`predictPath`, 2 s) touches it. Stabilise is used by releasing turn when skidding.
- **The gunner (player 1):**
  - keeps the laser charged;
  - releases when the enemy is in arc and in range;
  - locks Shields until the enemy's shields are down, then Weapons;
  - launches a missile every so often when one is available and the enemy is beyond laser range, steering it by the sign of the bearing error to the enemy.
- **Repair:** when one of the crew ship's rooms reaches damage level 1 or more, the character nearest its repair point stands, walks to it and holds Interact until it is repaired, then walks back and sits. The gunner takes Weapons and Shields repairs, and the Helm takes Engines **(rec.)**. While a character is away, its console is empty: the ship coasts or Weapons idles, which is the cost the design wants.
- **Walking:** a tile path over the Cutter's walkable tiles with the doors held open. The plan reuses an existing interior pathfinder if the sim has one (the sector bots); otherwise it adds a BFS over the interior grid in `sim/duel/scripted.ts`. The walk produces `moveX`/`moveY` toward the next tile centre. Corners are cut only through open door tiles.
- **Tunable:** the pair's own numbers (orbit radius band, release rule, missile cadence, repair threshold) are constants at the top of the file, separate from the game tuning.

## 4. Telemetry (`sim/duel/telemetry.ts`)

Per duel, accumulated tick by tick from `d` and that tick's events (parent §13's list):
- **Totals:** duration in ticks; outcome.
- **Laser and missiles:** laser releases, hits, misses and shield layers stripped, per ship. Missiles launched, hits by room, and losses by cause (planet, asteroid, edge, expiry, own ship), per ship.
- **Contacts:** planet and asteroid contacts per ship. Enemy planet and belt contacts within 5 s of a crew manoeuvre that brought the enemy toward them (baits) **(rec.: counted when the enemy's contact happens while the crew ship is within 600 u and turning)**.
- **Repairs:** repairs started and finished per player.
- **Time away:** time away from each console, split into walking and repairing.
- **Other:** console swaps; ticks the enemy spent in the crew's laser arc; ticks Weapons had nothing to do (seated, charge full or frozen, no missile available or in flight, enemy out of arc).

To count repairs, `repairPhase` emits per-tick **repair events** into a new `d.events` list (start, progress, finish per player and room) **(rec.)**:
- the list is cleared each tick, like `tactical.events`;
- it is not hashed, because it is derived and not state;
- the repair behaviour does not change.

`scripts/duel-telemetry.ts` runs the scripted pair over chosen seeds and prints a table per seed plus the gate summary; it is the tuning tool.

## 5. The gates and the tuning (`tests/duelGates.test.ts`)

- **Gate test:** runs seeds 1 to 10 headless with the scripted pair, capped at 15 minutes per duel. It asserts each §16 gate:
  - median length within 180 to 300 s;
  - at least one crew win and one crew loss;
  - every duel has at least one laser release and one missile launch by the crew;
  - no duel ends from a planet contact before tick 1800;
  - every duel ends before the cap.
- **Runtime:** must stay reasonable in the full suite **(rec.: under 20 s on this machine; if slower, the test runs the full gate under `GATES=1` and a 3-seed smoke otherwise, and the plan says which)**.
- **Tuning:** the plan prototypes the tuning that meets the gates. It changes numbers in `sim/tactical/tuning.ts` and `sim/duel/tuning.ts` (hull, shield regen, laser charge time and damage, missile damage, magazine regen, hunter aggression and standoff, repair rate), not the rules. Each changed number is listed in the plan with its old and new value and the reason. Tuning comes before the pair's own numbers: the pair should play reasonably, and the game numbers make the duel last 3 to 5 minutes **(rec.)**.
- **Passive crew (recorded, not gated):** the test also reports, without asserting, how long an untended crew (nobody at either console) survives over the same seeds. Above 60 s is the hope, so a player who walks away briefly is not dead.

## 6. Versioning and the golden

- **Version:** one `SIM_VERSION` bump (35 → 36) for the duel mode's sim behaviour, as parent §13 says.
- **Sector goldens:** they are re-blessed for the version number only. The bless commit shows that only the version field changed, and the sector run's gameplay figures, gates and traces stay unchanged (a test or a diff check proves it).
- **Duel golden:** `tests/golden/duel-*.json` records the scripted pair's duel at one seed. It stores the final `hashDuel`, the outcome, the duration and hashes every 600 ticks. A replay test asserts it, and the same-seed hash test runs two independent duels and compares per-tick hashes.
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
