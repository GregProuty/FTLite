# Engineering spike Part i: the sim (reactor bars, overdrive and coolant, oxygen, breaches, venting, doors) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the duel sim the Engineering spike's rules with no UI. The rules are:

- FTL reactor bars on the crew ship, read by every ship-0 rate and gate;
- an overdrive bar with heat and a shared coolant pool;
- the sector oxygen, fire-spread, door and airlock code running on the duel interior;
- breaches from enemy hits, patched by hand;
- firefighting in every room;
- low-air damage;
- four new commands (`shipPower`, `shipCoolant`, `shipDoor`, `shipAirlock`) on the wire.

**Architecture:**

- The powered bars are tactical state (`ShipSystems.bars`, hashed in the `ship` module). Every ship-0 reader reads them through `effectiveBars` (`sim/tactical/bars.ts`), which also applies Room damage, so a hit gates at once.
- A new duel module `power` (`sim/duel/power.ts`, between `helm` and `interior`) holds heat, coolant and failed flags and the rules that move bars.
- `sim/duel/hazards.ts` holds the duel's own Life Support injection, door and airlock toggles, breach patching and the work-job picker.
- `stepDuelTick` gains the spec §7 order: power commands → work → movement → doorSystem → stepDuel → hit damage → firePhase (cadence, fire roll, breach roll) → clampToCapacity → on the hazard tick injection, oxygenStep, fireStep, heat → health (fire, then low air).
- SIM_VERSION goes 53 → 54 as a version-only, blessed step first (Task 1). Every gameplay change after it is a same-version bless at 54 (Task 12).
- **What each system's bars do, isolated (coordinator 2026-11-18).** Spec §10 (Amendment 2) is binding and overrides §2 and §9 where they differ. Each of the Engines, Weapons and Sensors effects has its own self-contained task near the end, so it can be replaced without touching the rest:
  - **Task 8:** Engines → throttle cap (1 bar = 25 %) and engine factor;
  - **Tasks 9a and 9b:** Weapons → the officer's allocation across pew pew, the beam and the torpedo (`weaponPower`), then each weapon's effects;
  - **Task 10:** Sensors → range and the fog gates, scan rate, and capacity lost to Ops hazards.
  Each one can be replaced without touching Tasks 1 to 7 (bars, the ship module, effectiveBars, shields, heat, coolant, the clamp, oxygen, breaches, fire, doors, the command plumbing). Until its task lands, that system's bars are counted and clamped but read by nothing: Engines, Weapons and Sensors keep today's Room-damage rules.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, zod 3 (wire), the deterministic duel sim (`sim/duel/*`, `sim/tactical/*`), the sector hazard code (`sim/hazards/*`, `sim/doors.ts`), and the golden scripts under `scripts/golden/`.

**Spec:** `docs/superpowers/specs/2026-11-18-engineering-spike-design.md` (converged at cf4d6775): §2 (reactor, capacity, where the bars live, readers, rate tables, scans, magazine), §3 (overdrive, heat, coolant, overheat), §4 (no quirk, oxygen, injection, breaches, patching, low air, fire, every-room firefighting, work precedence, events, venting), §5 (doors), §7 (commands, reasons, the power module, clampToCapacity, step order), §8 (the sim tests and determinism).

**Shared names:** the contract `eng-contract.md` (the controller hands it to both parts). This plan changes it in four places, listed under Decisions 1 to 4. Part ii (HUD, app actions, interior clicks, smoke, screenshots, the report's feel section) is a separate plan executed after this one on the same branch.

**Branch and worktree:**

- All work happens in the git worktree `C:\Users\djuar\FTLite\.worktrees\engineering` on branch `spike/engineering`, made from master (SIM_VERSION 53, after Valkyrn and Sci-2).
- The controller creates the worktree with its junctions (`node_modules`, `services\signalling\node_modules`, `.art`, `public\assets\paid`). Executors do not.
- Every command runs from the worktree root. The oracle and trace baselines check their `cwd`, so record them in this worktree.

## Global Constraints

- **Version.** Part i owns SIM_VERSION **53 → 54 on `spike/engineering` only**.
  1. Task 1 records the baselines at 53 (`npx tsx scripts/golden/canonical-trace.ts baseline`, `npx tsx scripts/golden/duel-oracle.ts baseline`).
  2. Task 1 bumps the version alone and runs `npm run bless`. The bless guard runs the per-tick proofs and they must pass, because no gameplay has changed yet.
  3. Tasks 2 to 11 change gameplay at 54. Task 12 re-blesses with a same-version `npm run bless`, which is allowed as "a deliberate gameplay change" (`scripts/golden/blessGuard.ts`).
  4. Never pass `--fresh`. Never hand-edit goldens. Never re-record the baselines after Task 1.
- **Generated files come only from `npm run bless`:** `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`.
- **The fallout rule (Decision 9, binding on every task).** Doors now close, fire follows oxygen and spreads, shields start at 1 layer, hits breach, and Weapons and Engines damage 1 no longer slows a ship holding 2 bars. Existing tests will fail. Classify each failure exactly once:
  - **(a) The test pins a rule the spec replaces.** Examples: doors held open at creation, `DUEL_FIRE_GROW` growth, "a fire never goes out by itself", shields start at 2, one draw per hit, `rooms[Weapons] ≥ 2` as the crew's laser gate, the ENGINE_FACTOR level table for ship 0, the duel module kind list, the snapshot layout, the flatten key list. Update the test to the new rule, citing "Engineering spike spec §n" in a comment on the changed line.
  - **(b) The test pins a number that comes from a whole run.** Examples: tick counts, outcomes, telemetry totals, golden hashes, scripted-duel results such as `tests/tacticalSlots.test.ts:161`. Goldens change only through Task 12's bless. Any other pinned number changes to the new value, with the comment `// Engineering spike (SIM 54): was <old>`.
  - **(c) The test is a balance gate or band.** Examples: `tests/duelGates.test.ts` aggregates, the survival and passive bands, the Valkyrn pilot gate bands. Mark it `it.skip`, with a comment on the line above: `// Engineering spike (branch only): band out of range after the spike's rules; recorded in docs/superpowers/research/2026-11-18-engineering-spike.md, not re-tuned`. Copy the failing values into the report's gate table (Task 12).
  - Never edit a band's limits. Never delete a test. Never skip a test of kind (a) or (b).
- **Sim rules:**
  - Only `+ − × ÷` and `sqrt` in sim code, enforced by the determinism guard (`tests/helpers/determinismGuard.ts` allows `Math.abs/ceil/floor/round/min/max/sign/imul/sqrt`). No trig.
  - Every random draw comes from `d.interior.rng.hazards`, in the order spec §7 names: the hit rolls (fire then breach, per hit, in event order), then fireStep's spread rolls, then the overheat rolls in ascending system index.
- **Exact names and values (binding):**
  - **`sim/tactical/bars.ts`:**
    - `DuelSystem = { Shields: 0, Weapons: 1, Engines: 2, Sensors: 3, Oxygen: 4 }`, `DUEL_SYSTEM_COUNT = 5`, `OVERDRIVE_SYSTEMS = 4`;
    - spec §10.1: `SYSTEM_MAX = [4,9,4,3,2]`, `SYSTEM_SLOTS = [5,10,5,4,2]`, `SYSTEM_TACTICAL_ROOM = [1,0,2,-1,-1]`;
    - spec §10.1: `REACTOR_BARS = 10`, `START_BARS = [2,2,3,1,1]` (1 spare at the start); `knock = ceil(slots / 2)` (Weapons 5); Sensors capacity is slots − hazards in its room, 0 while failed (Task 10);
    - the tables (Task 2) `SHIELD_LAYERS_BY_BARS = [0,0,1,1,2,2]`, `SHIELD_RATE_BY_BARS = [0,2,3,4,5,6]`, `OXY_FACTOR_BY_BARS = [0,0.5,1]`;
    - the functions `knock(k)`, `damageCapacity(sys, k)`, `effectiveBars(sys, k)`;
    - Task 8 (Engines, spec §10.2): `THROTTLE_CAP_BY_BARS = [0,1,2,3,4,4]`, `ENGINE_FACTOR_BY_BARS = [0,1,1,1,1,1.25]`, `throttleCap(sys)`, `throttleAllowed(sys, level)`;
    - Task 9a (Weapons allocation, spec §10.3): `WeaponSlot = { Pew: 0, Beam: 1, Torpedo: 2 }`, `WEAPON_SLOTS = 3`, `WEAPON_BAR_MAX = 3`, `START_WEAPON_POWER = [1,0,1]`, `weaponBarsUsable(sys)`, `trimmedWeaponPower(sys)`, `weaponBars(sys, slot)`;
    - Task 9b (Weapons effects, spec §10.3), by a weapon's bars 0..4 (4 = the overdrive bar: 3's effect at 1.25× the rate): `PEW_SHOTS_BY_BARS = [0,2,3,3,3]`, `PEW_RATE_BY_BARS = [0,27,27,40,50]`, `BEAM_SHOTS_BY_BARS = [0,1,2,2,2]`, `BEAM_RATE_BY_BARS = [0,40,40,60,75]`, `TORPEDO_RELOAD_BY_BARS = [0,4,6,8,10]`, `TORPEDO_LEVELS_BY_BARS = [1,1,1,2,2]`, `MAGAZINE_REGEN_UNITS = 10800`;
    - Task 10 (Sensors, spec §10.4): `SCAN_SCIENCE_BY_BARS = [0,5,6,7,8]`, `SCAN_OTHER_BY_BARS = [0,2,2,3,3]`, `SENSOR_RANGE_BY_BARS = [300,900,1400,2000,2800]`.
  - **`ShipSystems`** gains `bars: number[5]` (Task 2), `weaponPower: number[3]` (Task 9a, 0..4 each, after `bars` in the `ship` module) and pew pew's `pewCharge`, `pewHold`, `pewLock`, `pewTargeted`, `pewBurst`, `pewBurstClock` (Task 9b, at the end of the systems tail).
  - **`sim/tactical/weapons.ts` (Task 9b):** `type Barrel = 'beam' | 'pew'`, `barrelShots(state, i, barrel)`, `laserFull(state, i, barrel = 'beam')`, `laserOffline(state, i, barrel = 'beam')`, `crewSees(state, j)`; `ShipInput.pewLock?` and `pewCharge?`. The laser event gains an optional `weapon?: 'pew'`.
  - **`sim/tactical/science.ts` (Task 10):** `sensorRange(sys)`, `pointSeen(t, x, y)`, `shipSeen(t, i)`, `contactSeen(t, contact)`, `scanProgressRate(t)`. Part ii's fog drawing reads these.
  - **The `weaponPower` command** `{ kind: 'weaponPower'; slot: number; delta: number }` (Task 9a) is for the Weapons seat only. Its reasons, in order: `stale-tick` → `not-at-weapons` → `malformed` → `unavailable`. `laserLock` and `laserCharge` gain `weapon?: 'beam' | 'pew'` (absent means the beam; Task 9b).
  - **`sim/duel/power.ts`:**
    - it re-exports the bars.ts names, plus `COOLANT_POOL_DUEL = 8`, `COOLANT_MAX_PER_SYSTEM = 2`, `POWER_VALUES = 15`;
    - `interface PowerState { heat: number[]; coolant: number[]; failed: number[] }`, each 5 long, `failed` holding 0 or 1;
    - the functions `createPowerState()`, `capacityOf(d,k)`, `sparesOf(d)`, `coolantFree(d)`, `isOverdriven(d,k)`, `validSystem(k)`, `applyPower(d,k,delta)`, `cycleDuelCoolant(d,k)`, `clampToCapacity(d)`, `duelHeatStep(d)`, `validatePowerValues(values)`, and `powerModule` (id `'power'`).
  - **`DuelState`** gains `power: PowerState` and `systemRooms: number[]` (the interior room of each system, −1 none; derived, not snapshotted).
  - **`sim/duel/hazards.ts`:** `duelInjection(d)`, `siteOfRoom(d, room)`, `fireTileOf(d, room)`, `validDoor(d, edge)`, `validAirlock(d, index)`, `toggleDoor(d, edge)`, `toggleAirlock(d, index)`, `type WorkJob`, `workJob(d, eid, here)`, `patchWork(d, site, workers)`.
  - **`sim/duel/fire.ts`:** `extinguishRoomWork(d, room, workers)`, `hitRolls(d, events)`. `DUEL_FIRE_GROW` is removed.
  - **`sim/duel/tuning.ts`:** `DUEL_BREACH_CHANCE_LASER = 0.2`, `DUEL_BREACH_CHANCE_MISSILE = 0.5`, `LOW_AIR_FRAC = 0.25`.
  - **`net/contracts.ts` `DuelCommand`** gains `{ kind: 'shipPower'; system: number; delta: number }`, `{ kind: 'shipCoolant'; system: number }`, `{ kind: 'shipDoor'; edge: number }` and `{ kind: 'shipAirlock'; index: number }`.
  - **`HealthEvent` `crewHurt.cause`** is `'fire' | 'hit' | 'air'`.
- **Git:** never `git add -A`, `git add .` or `git stash`; stage by name. Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (passed as a second `-m`). Files are UTF-8.
- **Test commands:**
  - targeted: `npx vitest run <files>`;
  - typecheck: `npx tsc -b`;
  - the full suite: `npx vitest run --maxWorkers=4`, always after `npx electron-vite build`.
  - Never run two vitest processes at once.
  - `tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts` and `tests/gate-*.test.ts` can time out under load. Rerun a failing one alone before calling it a failure.
  - Tasks 2 to 11 (9a and 9b included) must leave `npx tsc -b` clean, with their own new tests and the listed touched tests green. The full suite is first required green in Task 12.
  - **One exemption:** `tests/duelCheckpoint.test.ts`'s "the duel codec admits exactly the duel modules' command kinds" is red from Task 4 (the power module declares the four ship kinds) until Task 5 puts them on the wire. Every other listed test must be green at the end of its task.
- **Comments:** each new file gets a header comment citing the spec section. Exports get doc comments. Changed lines that need a reason cite "Engineering spike spec §x".

## Decisions where the spec leaves room, and where the code forces a choice

Line numbers were verified against master at `cf4d6775`, which already carries Valkyrn (`crewClass`, the gun) and Sci-2. **Match every edit by the quoted text**, not the number.

1. **Contract change: the command kinds are `shipPower`, `shipCoolant`, `shipDoor` and `shipAirlock`, not `power`, `coolant`, `door` and `airlock`.** The one `Command` union (`net/contracts.ts:94`) already holds the sector's `{ kind: 'power'; station; target; delta }` and `{ kind: 'coolant'; station; target }` (`net/contracts.ts:53-54`). A duel kind with the same name and a different shape would break every narrowing on `Command`. Part ii's actions send these names.
2. **Contract change: `PowerState.failed` is `number[]` (0 or 1), not `boolean[]`.** `vector` fields hold numbers (`sim/module.ts`). A numeric array is also one member in the completeness walk (`tests/duelModules.test.ts:20-21`), so `power.failed` is covered by its field name.
3. **Contract change: there is no `SYSTEM_ROOM` id table.** The spike runs on the Hound and the Cutter (the goldens and most tests), and on the Valkyrn, so a Hound-only id list would be wrong elsewhere. `DuelState.systemRooms` is derived in `createDuel`:
   - Shields, Weapons and Engines are their tactical Room's repair-point room;
   - Sensors is the Science station's room, else the Weapons room;
   - Oxygen is the Life Support station's room, else −1.
   On the Hound this gives R, O, E, O and L, exactly spec §2's table. `systemRooms` joins `DUEL_NOT_SNAPSHOTTED`.
4. **Contract change: `knock`, `damageCapacity` and `effectiveBars` live in `sim/tactical/bars.ts` and are re-exported by `sim/duel/power.ts`.** `bars.ts` imports only `type ShipSystems`, and its tactical-room table is literal (`[1, 0, 2, -1, -1]`, a test pins it to `Room`), because `tactical/state.ts` imports `START_BARS` from it.
5. **Bars on every crew class.** Slot 0 gets START_BARS whatever its class (Cutter, Valkyrn, Valkyrn laser fit), and every ship-0 reader of spec §2 reads bars. The Valkyrn's gun (`sim/tactical/gun.ts`) keeps today's Room-damage rules, because the spec does not mention it. The Hunter's `bars` stay `[0,0,0,0,0]` and are never read.
6. **The shield cap is `min(class layers, SHIELD_LAYERS_BY_BARS[bars])`.** Every class has `SHIELD_LAYERS` (2) today (`sim/tactical/defs.ts:91`), so this is spec §2's `floor(bars / 2)` for the Hound. The `min` keeps the validator's `shields ≤ most(layers) + 1` bound true for any class. The crew slot therefore starts a round at 1 layer (`systemsFor`).
7. **The engine factor for slot 0 (Task 8)** is `cls.engineFactor[0] × ENGINE_FACTOR_BY_BARS[bars]`, using spec §10.2's table. Every class's `engineFactor[0]` is 1 today, so the table is the spec's exactly. `flyShip` keeps its `engines` level parameter (eight test files call it) and gains a trailing `factor` parameter defaulting to `engineFactor(cls, engines)`. `flySlot` and `predictFlight` pass `shipEngineFactor(state, i)`, so the prediction equals the flight.
8. **The scan row (Task 10)** is chosen by `scan.rate` (SCAN_RATE_SCIENCE → the Science row, else the other row). The duel passes SCAN_RATE_SCIENCE exactly when the scan's station `by` is Science (`sim/duel/step.ts`, the contactScan loop), so this is spec §2's "row by `by`" with no station lookup in tactical code. `scan.rate` keeps today's values, so the validator (`sim/tactical/hash.ts`, `'scan.rate'`) and the takeover comparison are unchanged.
9. **The fallout rule (Global Constraints) is how this spike handles the existing suite.** A spike is not merged until the owner plays it (spec §1), so the gates are recorded, not re-tuned.
10. **Hit rolls.** `firePhase` calls the new `hitRolls`, which per qualifying hit in event order makes the fire roll (none if the room is burning) and then the breach roll (none if the room's site is already active, or the room has no site). `igniteFromHits` stays as a fire-only export, because `tests/duelFire.test.ts` unit-tests it, but the step no longer calls it. The breach roll targets `siteOfRoom`, the room's lowest-index breach site. The Hound has exactly one per room.
11. **Work jobs and events.** Each worker picks one job by spec §4's precedence: a fire (at the room's repair point, else its breach-site tile), then an active breach in reach, then the room's damaged tactical Room at its point. A worker's room is the room they stand in, so jobs never tie across rooms; within a room, breach sites are tried in ascending index. Point-room fires and repairs push today's `fireWork`, `repairWork`, `fireOut` and `repairDone`. Non-point fires and breaches push nothing (spec §4 Events).
12. **Power commands are applied sorted by (player, sequence)**, after the Sci-1 loops and before work, so "the last in player order wins" (spec §7) holds whatever the envelope order. Reasons: `stale-tick` → `malformed` (bad system, delta, edge or index) → `unavailable` (an invalid, away or not-conscious player; then for `shipPower`, no spare, at capacity, or 0 bars). `shipCoolant` answers `applied` when the value changed, else `noop`. `shipDoor` and `shipAirlock` answer `applied`.
13. **The hazard tick** is `(tick − d.baseTick) % HAZARD_EVERY === 0`, with `tick` the interior tick being stepped. It runs after firePhase and clampToCapacity and before healthPhase. `duelHeatStep` runs last in it, so an overheat ignition there is seen by the next tick's fireStep.
14. **The door toggle** is Closed/Open → HeldOpen and HeldOpen → Closed, each zeroing `closeTimer` and `sealRequested`. Sealed is unreachable in the duel. `createDuel` no longer fills `HeldOpen`, so doors start `DoorState.Closed` (createSimState's default).
15. **No quirk.** createDuel passes `{ quirk: 3 }` (Lucky Hull) to createSimState. Its only hook is sector debris (`sim/quirks.ts`), which the duel never runs. The quirk draw itself is still made, as createSimState always does.
16. **The throttle cap and the bots (Task 8).** Both bots ask for throttle 4 at full thrust: the scripted pair (`sim/duel/scripted.ts:318-320`) and the Valkyrn pilot (`sim/duel/scriptedPilot.ts`, via `flight` and `PILOT_AWAY_THROTTLE`). `runDuel` and `runValkyrnDuel` throw on any refused scripted command (`tests/helpers/scriptedDuel.ts:39`). With a cap of 3 at the start (Engines 3 bars, spec §10.2), every golden and gate run would throw. So both bots pass their wanted level through `levelWithinCap` (the cap for forward, 0 for a reverse at cap 0) before comparing it with `d.throttle`. This is a sim change to the bots, recorded in the report.
17. **Weapons (Tasks 9a and 9b).**
    - **The trim is computed, not stored, for every reader.** `trimmedWeaponPower` first drops any 4th bar when the Weapons system lacks its overdrive bar, then takes bars one at a time from the highest slot (torpedo, then beam, then pew pew) until no more are spent than the effective Weapons bars. A hit inside stepDuel therefore trims at once, and `clampToCapacity` writes the trimmed values back.
    - **A 4th bar** is allowed only while the Weapons system's effective bars exceed `SYSTEM_MAX` (9), and on one weapon at a time. A weapon at 4 has 3's effect at 1.25× its charge or reload (the tables' last column).
    - **Pew pew** is a second laser on the crew's class laser (range, arc, hull, burst gap, charge units) with its own six fields. It shares `freq` and the `shots`, `laserHits` and `layersStripped` counters, so hostility and telemetry count its shots as laser shots. Its events carry `weapon: 'pew'`.
    - **Starting state.** Pew pew starts full and targeted on Shields, like the beam. The beam at 0 bars is offline, so its charge is zeroed every tick.
    - **The Valkyrn gun class (laser null)** has neither laser.
    - **A crew torpedo already in flight when its bars go** hits for 1 level (`TORPEDO_LEVELS_BY_BARS[0] = 1`).
    - **The torpedo's auto-launch** needs the target seen, like auto-fire (`crewSees`).
    - **`ShipInput.pewLock` and `pewCharge` are optional,** so the dozen ShipInput literals in tests compile unchanged.
18. **Sensors (Task 10).**
    - **The fog lives in `science.ts`.** `weapons.ts` imports `shipSeen` from it, and science.ts imports nothing from weapons.ts, so there is no import cycle.
    - **"Seen" means within sensor range of the crew ship's centre.** The enemy contact is the crew's target ship. The derelict uses `derelictPos`.
    - **Hazard capacity.** Sensors capacity from hazards is a duel rule (`sim/duel/sensors.ts`, via `capacityOf`), because tactical code can't see the interior. A clamp after the hazard tick catches fires that spread or ignite there.
    - **The gates** are on `contactScan`, `laserLock` and `torpLock` with a room ≥ 0 (clearing needs nothing seen), and on `designate` with a contact ≥ 0. A running scan pauses while its contact is unseen.
    - **The scripted gunner** sends no lock while the target is unseen.
19. **Measurements for the report (spec §1)** come from `scripts/engineering-spike-measure.ts`, run at 53 (Task 1) and at the end (Task 12): the flattened duel length for a Hound duel, and the mean ms per tick over a 3600-tick scripted Cutter duel. Task 12 adds the gate table. Part ii adds feel and screenshots to the same report file.
20. **The bots fight with pew pew (Task 9b Step 7b).** The beam starts dark, so:
    - the scripted Helm lines up when either laser is full and targeted;
    - the scripted gunner re-locks with `laserLock { weapon: 'pew' }` and holds the torpedo while pew pew has a shot;
    - telemetry's `weaponsIdleTicks` counts a full laser on either barrel.
    The console's "WEAPONS OFFLINE" situation is Part ii's.
21. **The Shield loot is cancelled by the cap (spike only).** The derelict's Shield loot (`sim/tactical/science.ts:74`) adds a layer over the class layers, but the crew's shield cap (Task 3) drops any layer above `SHIELD_LAYERS_BY_BARS[bars]` the same tick. In the spike that loot does nothing. Task 12 notes it in the report's known limits; the bar cap is not changed for it.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/renderer/src/sim/tuning.ts` | modify (T1) | SIM_VERSION 54 |
| `scripts/engineering-spike-measure.ts` | create (T1) | snapshot length and tick cost |
| `docs/superpowers/research/2026-11-18-engineering-spike.md` | create (T1), modify (T12) | the report's sim measurements, gate table, determinism |
| `src/renderer/src/sim/tactical/bars.ts` | create (T2), append (T8, T9a, T9b, T10) | systems, slots, shield and oxygen tables, `knock`, `damageCapacity`, `effectiveBars`; then the isolated Engines, Weapons and Sensors sections |
| `src/renderer/src/sim/tactical/state.ts` | modify (T2, T9a, T9b) | `ShipSystems.bars`, `weaponPower`, the pew fields, the laser event's `weapon?`; the start values; the 1-layer start |
| `src/renderer/src/sim/tactical/hash.ts` | modify (T2, T9a, T9b) | the `bars`, `weaponPower` and pew fields, rules and clone |
| `src/renderer/src/sim/tactical/weapons.ts` | modify (T3), replace (T9b), modify (T10) | shields by bars (T3); the beam and pew pew barrels, per-weapon shots, rates and the torpedo (T9b); `crewSees` (T10) |
| `src/renderer/src/sim/tactical/missiles.ts` | modify (T9b) | the crew torpedo's levels |
| `src/renderer/src/sim/tactical/physics.ts`, `predict.ts` | modify (T8) | `shipEngineFactor`, `flyShip(…, factor)`, flySlot and predictFlight |
| `src/renderer/src/sim/tactical/science.ts` | modify (T10) | the fog (`sensorRange`, `pointSeen`, `shipSeen`, `contactSeen`), `scanProgressRate`, the scan pause |
| `src/renderer/src/sim/duel/power.ts` | create (T4), modify (T8, T9a, T10) | PowerState, capacity (Sensors hazards), power, coolant, clamp, heat, the module, validation |
| `src/renderer/src/sim/duel/engines.ts` | create (T8) | `clampThrottle` |
| `src/renderer/src/sim/duel/weaponSlots.ts` | create (T9a) | `applyWeaponPower`, `clampWeaponPower` |
| `src/renderer/src/sim/duel/sensors.ts` | create (T10) | `sensorsHazards` |
| `src/renderer/src/sim/duel/state.ts` | modify (T4, T6, T7) | `power`, `systemRooms`, quirk 3, doors Closed, cause `'air'` |
| `src/renderer/src/sim/duel/modules.ts` | modify (T4) | powerModule in DUEL_MODULES, `systemRooms` excluded |
| `src/renderer/src/sim/duel/snapshot.ts` | modify (T4) | the power values' offset and validation |
| `src/renderer/src/net/contracts.ts`, `net/codec.ts` | modify (T5, T9a, T9b) | the four ship commands; `weaponPower`; the laser commands' `weapon` |
| `src/renderer/src/sim/duel/hazards.ts` | create (T5), modify (T6, T7) | toggles; injection; sites, fire tiles, jobs, patching |
| `src/renderer/src/sim/duel/step.ts` | modify (T5 to T10) | commands, clamp, doorSystem, hazard tick, the work phase, the throttle cap, weaponPower, `weapon`, the fog gates |
| `src/renderer/src/sim/duel/scripted.ts` | modify (T8, T10) | the scripted pair's throttle within the cap; no lock on an unseen target |
| `src/renderer/src/sim/duel/fire.ts`, `duel/tuning.ts` | modify (T6, T7) | no DUEL_FIRE_GROW; extinguishRoomWork, hitRolls; breach and air constants |
| `src/renderer/src/sim/duel/health.ts` | modify (T7) | low-air damage |
| `tests/engBars`, `engPower`, `engCommands`, `engHazards`, `engWork`, `engEngines`, `engWeaponPower`, `engWeapons`, `engSensors`, `engDeterminism` `.test.ts` | create | the spec §8 and §10 sim tests |
| `tests/tacticalDeterminism.test.ts`, `duelModules.test.ts`, `duelCheckpoint.test.ts`, plus fallout files | modify | key lists, kinds, examples; the fallout rule |

---

### Task 1: The version-only bump to 54, and the baseline measurements

**Files:**
- Modify: `src/renderer/src/sim/tuning.ts:7`
- Create: `scripts/engineering-spike-measure.ts`
- Create: `docs/superpowers/research/2026-11-18-engineering-spike.md`
- Regenerated by bless: `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`

**Interfaces:**
- Consumes: `runDuel` (`tests/helpers/scriptedDuel.ts:49`), `createDuel`, `flattenDuel`, `parseShip`.
- Produces: SIM_VERSION 54; the report file with a "Sim measurements" table that Task 12 completes.

- [ ] **Step 1: Record the baselines at 53**

Run, in this order:

```bash
npx tsx scripts/golden/canonical-trace.ts baseline
npx tsx scripts/golden/duel-oracle.ts baseline
```

Expected: both print that a baseline was written, at sim version 53.

- [ ] **Step 2: Write the measurement script**

Create `scripts/engineering-spike-measure.ts`:

```ts
// Engineering spike spec §1 deliverables: the duel snapshot's size and the sim's tick cost, before and after the spike.
// `npx tsx scripts/engineering-spike-measure.ts` prints one JSON line: the flattened duel length (values) on a fresh
// Hound duel, and the mean milliseconds per tick of a 3600-tick scripted Cutter duel (seed 1), best of three runs.
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { flattenDuel } from '../src/renderer/src/sim/duel/hash';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { runDuel } from '../tests/helpers/scriptedDuel';

const TICKS = 3600;
const d = createDuel(parseShip(hound), 1);
const values = flattenDuel(d).length;
disposeDuel(d);
let best = Infinity;
for (let k = 0; k < 3; k++) {
  const t0 = performance.now();
  const r = runDuel(1, 'scripted', TICKS);
  const ms = (performance.now() - t0) / r.telemetry.ticks;
  if (ms < best) best = ms;
}
console.log(JSON.stringify({ simVersion: SIM_VERSION, houndDuelValues: values, msPerTick: Number(best.toFixed(4)), ticks: TICKS }));
```

- [ ] **Step 3: Run it at 53 and write the report skeleton**

Run: `npx tsx scripts/engineering-spike-measure.ts`
Expected: one JSON line with `"simVersion":53`.

Create `docs/superpowers/research/2026-11-18-engineering-spike.md`, putting the printed numbers in place of `<v53>` and `<ms53>`:

```markdown
# Engineering spike report (2026-11-18)

Spec: docs/superpowers/specs/2026-11-18-engineering-spike-design.md. Branch `spike/engineering`.

## Sim measurements (Part i)

| Measure | Before (SIM 53) | After (SIM 54) |
|---|---|---|
| Hound duel flattened values | <v53> | (Task 12) |
| ms per tick, 3600-tick scripted Cutter duel, best of 3 | <ms53> | (Task 12) |

## Gates and bands after the spike (Part i, Task 12)

(Task 12)

## Determinism (Part i, Tasks 11 and 12)

(Task 12)
```

- [ ] **Step 4: Bump the version alone**

In `src/renderer/src/sim/tuning.ts`, change `export const SIM_VERSION = 53;` to `export const SIM_VERSION = 54;`.

- [ ] **Step 5: Bless**

Run: `npm run bless`
Expected: the bump proofs pass (version-only: no gameplay changed), and four `blessed ...` lines print.

- [ ] **Step 6: Run the golden and oracle tests**

Run: `npx vitest run tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/duelOracle.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tuning.ts scripts/engineering-spike-measure.ts docs/superpowers/research/2026-11-18-engineering-spike.md tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json
git commit -m "chore(engineering-spike): SIM_VERSION 54 (version only, blessed) and the baseline measurements" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tactical bars: the table module and `ShipSystems.bars`

**Files:**
- Create: `src/renderer/src/sim/tactical/bars.ts`
- Modify: `src/renderer/src/sim/tactical/state.ts` (ShipSystems, systemsFor, emptySystems)
- Modify: `src/renderer/src/sim/tactical/hash.ts` (shipFields, systemsRules, cloneTacticalFromModule)
- Modify: `tests/tacticalDeterminism.test.ts:115,121-122`
- Test: `tests/engBars.test.ts`

**Interfaces:**
- Consumes: `ShipSystems`, `Room` (`sim/tactical/state.ts:14`), `vector` (`sim/module.ts`).
- Produces: the Task 2 bars.ts names in Global Constraints; `ShipSystems.bars: number[]` (5 long), START_BARS on slot 0 and zeros elsewhere; the `systems.<i>.bars` ship-module field.

- [ ] **Step 1: Write the failing test**

Create `tests/engBars.test.ts`:

```ts
// Engineering spike spec §2: the reactor bars on the tactical side (sim/tactical/bars.ts), ShipSystems.bars, the start
// of a round, and the bars field in the ship module (hash, snapshot rule, clone).
import { describe, expect, it } from 'vitest';
import { damageCapacity, DuelSystem, effectiveBars, knock, START_BARS, SYSTEM_SLOTS, SYSTEM_TACTICAL_ROOM } from '../src/renderer/src/sim/tactical/bars';
import { cloneTactical, createTacticalState, Room } from '../src/renderer/src/sim/tactical/state';
import { flattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';

describe('engineering spike: tactical bars (spec §2)', () => {
  it('the tactical-room table is Room order, knock is ceil(slots / 2), capacity is 5/2/0, 10/5/0 and 5/2/0 by damage', () => {
    expect(SYSTEM_TACTICAL_ROOM).toEqual([Room.Shields, Room.Weapons, Room.Engines, -1, -1]);
    expect([0, 1, 2, 3, 4].map(knock)).toEqual([3, 5, 3, 2, 1]);
    const sys = { rooms: [0, 0, 0] as [number, number, number] };
    const caps = (k: number) => [0, 1, 2].map((dmg) => { const r = SYSTEM_TACTICAL_ROOM[k]!; if (r >= 0) sys.rooms[r as 0 | 1 | 2] = dmg; const c = damageCapacity(sys, k); sys.rooms = [0, 0, 0]; return c; });
    expect(caps(DuelSystem.Shields)).toEqual([5, 2, 0]);
    expect(caps(DuelSystem.Weapons)).toEqual([10, 5, 0]);
    expect(caps(DuelSystem.Engines)).toEqual([5, 2, 0]);
    expect(caps(DuelSystem.Sensors)).toEqual([4, 4, 4]);   // no tactical Room (its hazards are the duel module's, Task 10)
    expect(caps(DuelSystem.Oxygen)).toEqual([2, 2, 2]);
    expect(SYSTEM_SLOTS).toEqual([5, 10, 5, 4, 2]);
  });
  it('effectiveBars is min(bars, damage capacity): a level-2 Room reads 0 bars the moment it is hit', () => {
    const sys = { rooms: [0, 0, 0] as [number, number, number], bars: [4, 9, 3, 1, 1] };
    expect(effectiveBars(sys, DuelSystem.Weapons)).toBe(9);
    sys.rooms[Room.Weapons] = 1; expect(effectiveBars(sys, DuelSystem.Weapons)).toBe(5);
    sys.rooms[Room.Weapons] = 2; expect(effectiveBars(sys, DuelSystem.Weapons)).toBe(0);
    sys.rooms[Room.Shields] = 1; expect(effectiveBars(sys, DuelSystem.Shields)).toBe(2);
  });
  it('the crew slot starts each round at START_BARS and 1 shield layer; the Hunter holds zero bars and its 2 layers', () => {
    const s = createTacticalState(1);
    expect(s.systems[0].bars).toEqual([...START_BARS]);
    expect(s.systems[0].shields).toBe(1);
    expect(s.systems[1].bars).toEqual([0, 0, 0, 0, 0]);
    expect(s.systems[1].shields).toBe(2);
  });
  it('bars are hashed, validated (0..10) and cloned', () => {
    const s = createTacticalState(3), before = flattenTactical(s);
    s.systems[0].bars[DuelSystem.Sensors] = 0;
    expect(flattenTactical(s)).not.toEqual(before);
    const copy = cloneTactical(s);
    expect(copy.systems[0].bars).toEqual(s.systems[0].bars);
    expect(copy.systems[0].bars).not.toBe(s.systems[0].bars);
    const values = Array.from(flattenTactical(s));
    expect(validateTacticalValues(s, values, 0)).toBe(values.length);
    s.systems[0].bars[0] = 11;                                             // out of 0..10: refused by name
    expect(() => validateTacticalValues(s, Array.from(flattenTactical(s)), 0)).toThrow(/systems\.0\.bars/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/engBars.test.ts`
Expected: FAIL, because `sim/tactical/bars` cannot be resolved.

- [ ] **Step 3: Create `sim/tactical/bars.ts`**

```ts
// Engineering spike spec §2 (docs/superpowers/specs/2026-11-18-engineering-spike-design.md): the crew ship's reactor
// bars on the tactical side. The powered bars are ShipSystems.bars (a `ship` module field); every ship-0 reader reads
// them through effectiveBars, which also applies the tactical Room's damage, so a hit inside stepDuel gates at once
// (spec §2, R3-F1). Constants and pure functions only: state.ts imports this file, so it imports only types from it.
import type { ShipSystems } from './state';

/** The five powered systems, in bar order (spec §2). */
export const DuelSystem = { Shields: 0, Weapons: 1, Engines: 2, Sensors: 3, Oxygen: 4 } as const;
export const DUEL_SYSTEM_COUNT = 5;
/** Systems 0..3 take an overdrive bar, coolant and heat; Oxygen (4) none (spec §3). */
export const OVERDRIVE_SYSTEMS = 4;
/** Each system's max bars, and its slots (max plus the overdrive slot; Oxygen has none). Spec §10.1: Weapons is three
 *  weapons × 3. */
export const SYSTEM_MAX: readonly number[] = [4, 9, 4, 3, 2];
export const SYSTEM_SLOTS: readonly number[] = [5, 10, 5, 4, 2];
/** The tactical Room whose damage knocks each system's slots out, −1 for none (Sensors, Oxygen). Literal Room values
 *  (Shields 1, Weapons 0, Engines 2; tests/engBars.test.ts pins them to Room), because state.ts imports this file. */
export const SYSTEM_TACTICAL_ROOM: readonly number[] = [1, 0, 2, -1, -1];
/** Spec §10.1: the Hound's reactor, and every round's start (9 used, 1 spare; Engines 3 = 75 % throttle). */
export const REACTOR_BARS = 10;
export const START_BARS: readonly number[] = [2, 2, 3, 1, 1];

/** Spec §2 rate tables (start values), indexed by effective bars 0..slots. */
export const SHIELD_LAYERS_BY_BARS: readonly number[] = [0, 0, 1, 1, 2, 2];
export const SHIELD_RATE_BY_BARS: readonly number[] = [0, 2, 3, 4, 5, 6];
export const OXY_FACTOR_BY_BARS: readonly number[] = [0, 0.5, 1];
// The Engines, Weapons and Sensors tables and helpers are added by Tasks 8, 9 and 10 (isolated: a later owner
// amendment rewrites them), each in its own section at the end of this file.

/** The slots one damage level knocks out of system k: ceil(slots / 2), so level 2 is off (spec §2). */
export function knock(k: number): number { return Math.ceil(SYSTEM_SLOTS[k]! / 2); }

/** System k's capacity from its tactical Room's damage alone: max(0, slots − damage × knock). A failed system's 0, and
 *  Sensors' hazards (spec §10.4), are the duel power module's (capacityOf); tactical code sees neither, because
 *  clampToCapacity lowers the bars the same tick. */
export function damageCapacity(sys: Pick<ShipSystems, 'rooms'>, k: number): number {
  const r = SYSTEM_TACTICAL_ROOM[k]!, damage = r >= 0 ? sys.rooms[r]! : 0;
  return Math.max(0, SYSTEM_SLOTS[k]! - damage * knock(k));
}

/** System k's effective bars: min(powered bars, damage capacity). Every ship-0 reader of spec §2 reads this. */
export function effectiveBars(sys: Pick<ShipSystems, 'rooms' | 'bars'>, k: number): number {
  return Math.min(sys.bars[k]!, damageCapacity(sys, k));
}
```

- [ ] **Step 4: Add `bars` to `ShipSystems`, `systemsFor` and `emptySystems`**

In `src/renderer/src/sim/tactical/state.ts`:

(a) Add to the imports at the top of the file:

```ts
import { DUEL_SYSTEM_COUNT, SHIELD_LAYERS_BY_BARS, START_BARS } from './bars';
```

(b) In `interface ShipSystems`, replace

```ts
  gunShots: number; gunHits: number;
}
```

with

```ts
  gunShots: number; gunHits: number;
  /** Engineering spike spec §2: the crew ship's powered reactor bars per system (Shields, Weapons, Engines, Sensors,
   *  Oxygen; sim/tactical/bars.ts). START_BARS on the crew slot at a round's start, zeros on every other slot (never read). */
  bars: number[];
}
```

(c) In `systemsFor`, replace

```ts
    cls, target, hull: c.hull, rooms: [0, 0, 0], shields: c.shields.layers, shieldClock: 0, laserCharge: crew && laser ? laser.chargeUnits : 0, laserHold: 0, fireHeld: false, lock: Room.Shields,
```

with

```ts
    // Engineering spike spec §2 (Decision 6): the crew slot starts at its START_BARS shield cap (1 layer at 2 bars).
    cls, target, hull: c.hull, rooms: [0, 0, 0], shields: crew ? Math.min(c.shields.layers, SHIELD_LAYERS_BY_BARS[START_BARS[0]!]!) : c.shields.layers, shieldClock: 0, laserCharge: crew && laser ? laser.chargeUnits : 0, laserHold: 0, fireHeld: false, lock: Room.Shields,
```

and in the same function replace

```ts
    gunHeat: 0, gunLocked: false, gunCooldown: 0, gunMuzzle: 0, gunWear: 0, gunHull: 0, gunRoomWear: [0, 0, 0], gunShots: 0, gunHits: 0
  };
}
```

with

```ts
    gunHeat: 0, gunLocked: false, gunCooldown: 0, gunMuzzle: 0, gunWear: 0, gunHull: 0, gunRoomWear: [0, 0, 0], gunShots: 0, gunHits: 0,
    bars: crew ? [...START_BARS] : Array<number>(DUEL_SYSTEM_COUNT).fill(0)   // Engineering spike spec §2
  };
}
```

(d) In `emptySystems`, replace

```ts
    gunHeat: 0, gunLocked: false, gunCooldown: 0, gunMuzzle: 0, gunWear: 0, gunHull: 0, gunRoomWear: [0, 0, 0], gunShots: 0, gunHits: 0 };
}
```

with

```ts
    gunHeat: 0, gunLocked: false, gunCooldown: 0, gunMuzzle: 0, gunWear: 0, gunHull: 0, gunRoomWear: [0, 0, 0], gunShots: 0, gunHits: 0,
    bars: Array<number>(DUEL_SYSTEM_COUNT).fill(0) };
}
```

- [ ] **Step 5: Hash, validate and clone the bars**

In `src/renderer/src/sim/tactical/hash.ts`:

(a) Add to the imports:

```ts
import { DUEL_SYSTEM_COUNT, SYSTEM_SLOTS } from './bars';
```

(b) In `shipFields`, replace

```ts
    fields.push(vector(`systems.${i}.gunRoomWear`, 3, (s) => s.systems[i]!.gunRoomWear));   // Valkyrn spec §7.3
```

with

```ts
    fields.push(vector(`systems.${i}.gunRoomWear`, 3, (s) => s.systems[i]!.gunRoomWear));   // Valkyrn spec §7.3
    fields.push(vector(`systems.${i}.bars`, DUEL_SYSTEM_COUNT, (s) => s.systems[i]!.bars));   // Engineering spike spec §2
```

(c) In `systemsRules`, replace

```ts
  gunRoomWear: within(0, most((c) => c.slots.gun?.hitsPerLevel) - 1), gunShots: count, gunHits: count
});
```

with

```ts
  gunRoomWear: within(0, most((c) => c.slots.gun?.hitsPerLevel) - 1), gunShots: count, gunHits: count,
  bars: within(0, Math.max(...SYSTEM_SLOTS))   // Engineering spike spec §2, §10.1: 0..10 per system
});
```

(d) In `cloneTacticalFromModule`, replace

```ts
    systems: s.systems.map((y) => ({ ...y, rooms: [0, 0, 0], gunRoomWear: [0, 0, 0] })) as TacticalState['systems'],
```

with

```ts
    systems: s.systems.map((y) => ({ ...y, rooms: [0, 0, 0], gunRoomWear: [0, 0, 0], bars: [0, 0, 0, 0, 0] })) as TacticalState['systems'],
```

- [ ] **Step 6: Update the flatten key guard**

In `tests/tacticalDeterminism.test.ts`:
- change the systems key list (line 115) to begin with `'bars'`: the sorted list starts `['bars', 'cls', 'fireHeld', ...`;
- change `2 * 37` to `2 * 42` in the `expect(flattenTactical(st).length)` line (line 123);
- append `; Engineering spike spec §2: per slot the 5 bars.` to the end of the comment just above it (the comment's last line is line 122).

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/engBars.test.ts tests/tacticalDeterminism.test.ts tests/duelModules.test.ts`
Expected: engBars and tacticalDeterminism PASS. duelModules PASS (the bars are a ship field). Then run `npx tsc -b`, expecting it to be clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/tactical/bars.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/hash.ts tests/engBars.test.ts tests/tacticalDeterminism.test.ts
git commit -m "feat(engineering-spike): reactor bars on the crew ship (bars.ts tables, ShipSystems.bars hashed, 1-layer start)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Shields read bars

**Files:**
- Modify: `src/renderer/src/sim/tactical/weapons.ts` (the shields block of tickWeapons)
- Test: `tests/engBars.test.ts` (append)

**Interfaces:**
- Consumes: Task 2's `effectiveBars`, `DuelSystem`, `SHIELD_LAYERS_BY_BARS`, `SHIELD_RATE_BY_BARS`.
- Produces: the crew ship's shield cap and recharge by Shields bars (spec §2). Weapons, Engines and Sensors are not touched here (Tasks 8 to 10).

- [ ] **Step 1: Write the failing test**

Append to `tests/engBars.test.ts`, moving the new imports to the top of the file:

```ts
import { tickWeapons, IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { SHIELD_RATE_BY_BARS } from '../src/renderer/src/sim/tactical/bars';

describe('engineering spike: shields read bars (spec §2)', () => {
  it('the layer cap and rate follow bars; layers above the cap drop at once and the clock resets; the Hunter is unchanged', () => {
    const s = createTacticalState(1), sys = s.systems[0];
    sys.bars[DuelSystem.Shields] = 4; sys.shields = 1; sys.shieldClock = 0;
    tickWeapons(s, 0, IDLE_INPUT);
    expect(sys.shieldClock).toBe(SHIELD_RATE_BY_BARS[4]);
    sys.shields = 2; sys.shieldClock = 10; sys.bars[DuelSystem.Shields] = 2;
    tickWeapons(s, 0, IDLE_INPUT);
    expect(sys.shields).toBe(1); expect(sys.shieldClock).toBe(0);
    sys.bars[DuelSystem.Shields] = 1;
    tickWeapons(s, 0, IDLE_INPUT);
    expect(sys.shields).toBe(0);
    sys.bars[DuelSystem.Shields] = 4; sys.rooms[Room.Shields] = 1;   // damage 1: capacity 2, so 1 layer at most
    sys.shields = 2; tickWeapons(s, 0, IDLE_INPUT);
    expect(sys.shields).toBe(1);
    s.systems[1].shields = 2; tickWeapons(s, 1, IDLE_INPUT);
    expect(s.systems[1].shields).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engBars.test.ts`
Expected: FAIL. The shield clock rises at today's `SHIELD_RATE[0]` (3), not 5, and the layers do not drop.

- [ ] **Step 3: The crew shields block**

In `src/renderer/src/sim/tactical/weapons.ts`:

(a) Add `import { DuelSystem, effectiveBars, SHIELD_LAYERS_BY_BARS, SHIELD_RATE_BY_BARS } from './bars';`.

(b) In `tickWeapons`, replace

```ts
  if (s.shields >= c.shields.layers) s.shieldClock = 0;
  else if ((s.shieldClock += c.shields.rate[s.rooms[Room.Shields]]!) >= c.shields.rechargeUnits) { s.shields++; s.shieldClock = 0; }   // rate 0: held
```

with

```ts
  if (i === CREW_SLOT) {   // Engineering spike spec §2: the crew's shields by bars; layers above the cap drop at once
    const bars = effectiveBars(s, DuelSystem.Shields), cap = Math.min(c.shields.layers, SHIELD_LAYERS_BY_BARS[bars]!);
    if (s.shields > cap) { s.shields = cap; s.shieldClock = 0; }
    if (s.shields >= cap) s.shieldClock = 0;
    else if ((s.shieldClock += SHIELD_RATE_BY_BARS[bars]!) >= c.shields.rechargeUnits) { s.shields++; s.shieldClock = 0; }   // rate 0: held
  } else if (s.shields >= c.shields.layers) s.shieldClock = 0;
  else if ((s.shieldClock += c.shields.rate[s.rooms[Room.Shields]]!) >= c.shields.rechargeUnits) { s.shields++; s.shieldClock = 0; }   // rate 0: held
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/engBars.test.ts tests/disabledSystems.test.ts tests/tacticalDeterminism.test.ts`, then `npx tsc -b`.
Expected: engBars PASS. A shields-at-damage assertion for ship 0 in disabledSystems is fallout kind (a). `tsc -b` is clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/tactical/weapons.ts tests/engBars.test.ts
git commit -m "feat(engineering-spike): the crew shields' layer cap and recharge read Shields bars" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Add any fallout test files you fixed to the `git add` line by name.

---

### Task 4: The duel power module (capacity, power, coolant, clamp, heat, snapshot)

**Files:**
- Create: `src/renderer/src/sim/duel/power.ts`
- Modify: `src/renderer/src/sim/duel/state.ts` (DuelState, createDuel)
- Modify: `src/renderer/src/sim/duel/modules.ts` (powerModule, DUEL_MODULES, DUEL_NOT_SNAPSHOTTED)
- Modify: `src/renderer/src/sim/duel/snapshot.ts` (the power offset and validation)
- Modify: `tests/duelModules.test.ts:9,40,140,150`
- Test: `tests/engPower.test.ts`

**Interfaces:**
- Consumes: Task 2's bars.ts names; `chance` (`shared/rng.ts`); `igniteRoom` (`sim/hazards/fire.ts`); HEAT_* and OVERHEAT_FIRE_CHANCE (`sim/tuning.ts:77-83`).
- Produces: every power.ts name in Global Constraints; `DuelState.power`, `DuelState.systemRooms`.

- [ ] **Step 1: Write the failing test**

Create `tests/engPower.test.ts`:

```ts
// Engineering spike spec §2, §3, §7: the duel power module: capacity from damage and failure, moving bars, coolant
// cycling, clampToCapacity, the heat rules per hazard tick, overheat, the module's fields and the snapshot.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { applyPower, capacityOf, clampToCapacity, coolantFree, cycleDuelCoolant, duelHeatStep, DuelSystem, isOverdriven, sparesOf, validatePowerValues } from '../src/renderer/src/sim/duel/power';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { HEAT_MAX } from '../src/renderer/src/sim/tuning';
import { nextFloat } from '../src/shared/rng';

const HOUND = parseShip(hound);
const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const bars = (d: DuelState) => d.tactical.systems[0].bars;
/** Move bars so Engines holds its overdrive bar (5): the spare bar, then Sensors' (spec §10.1 start: Engines 3, 1 spare). */
function overdriveEngines(d: DuelState): void {
  expect(applyPower(d, DuelSystem.Engines, 1)).toBe('applied');
  expect(applyPower(d, DuelSystem.Sensors, -1)).toBe('applied');
  expect(applyPower(d, DuelSystem.Engines, 1)).toBe('applied');
}
function withDuel(f: (d: DuelState) => void): void { const d = createDuel(HOUND, 7); try { f(d); } finally { disposeDuel(d); } }

describe('engineering spike: the power module (spec §2, §3)', () => {
  it('a fresh duel: 9 bars used, 1 spare, 8 coolant free; the Hound system rooms are R, O, E, O, L', () => withDuel((d) => {
    expect(sparesOf(d)).toBe(1); expect(coolantFree(d)).toBe(8);
    const id = (r: number) => (r < 0 ? '-' : HOUND.rooms[r]!.id);
    expect(d.systemRooms.map(id)).toEqual(['R', 'O', 'E', 'O', 'L']);
  }));
  it('bars never exceed the reactor or capacity; −1 at 0 and +1 with no spare are unavailable', () => withDuel((d) => {
    expect(applyPower(d, DuelSystem.Shields, 1)).toBe('applied');        // the one spare bar
    expect(applyPower(d, DuelSystem.Weapons, 1)).toBe('unavailable');   // no spare
    applyPower(d, DuelSystem.Sensors, -1);
    expect(bars(d)[DuelSystem.Sensors]).toBe(0);
    expect(applyPower(d, DuelSystem.Sensors, -1)).toBe('unavailable');
    expect(sparesOf(d)).toBe(1);
    d.tactical.systems[0].rooms[Room.Engines] = 1;                        // capacity 2, Engines holds 3
    expect(applyPower(d, DuelSystem.Engines, 1)).toBe('unavailable');
    expect(applyPower(d, DuelSystem.Weapons, 1)).toBe('applied');
    expect(sparesOf(d)).toBe(0);
  }));
  it('damage lowers capacity; clampToCapacity returns the excess (the overdrive bar first); repair adds no bar', () => withDuel((d) => {
    overdriveEngines(d);
    expect(bars(d)[DuelSystem.Engines]).toBe(5); expect(isOverdriven(d, DuelSystem.Engines)).toBe(true);
    d.tactical.systems[0].rooms[Room.Engines] = 1;
    expect(capacityOf(d, DuelSystem.Engines)).toBe(2);
    clampToCapacity(d);
    expect(bars(d)[DuelSystem.Engines]).toBe(2); expect(sparesOf(d)).toBe(3);
    d.tactical.systems[0].rooms[Room.Engines] = 0;
    clampToCapacity(d);
    expect(bars(d)[DuelSystem.Engines]).toBe(2);
  }));
  it('coolant cycles 0 → 1 → 2 → 0; a step the pool cannot supply wraps to 0', () => withDuel((d) => {
    expect(cycleDuelCoolant(d, 0)).toBe('applied'); expect(d.power.coolant[0]).toBe(1);
    expect(cycleDuelCoolant(d, 0)).toBe('applied'); expect(d.power.coolant[0]).toBe(2);
    expect(cycleDuelCoolant(d, 0)).toBe('applied'); expect(d.power.coolant[0]).toBe(0);
    d.power.coolant = [2, 2, 2, 1, 0];                                     // 1 free: 1 → 2 is supplied
    expect(cycleDuelCoolant(d, 3)).toBe('applied'); expect(d.power.coolant[3]).toBe(2);
    expect(coolantFree(d)).toBe(0);
    expect(cycleDuelCoolant(d, 3)).toBe('applied'); expect(d.power.coolant[3]).toBe(0);   // 2 → 0
    d.power.coolant = [2, 2, 2, 0, 2];                                     // 8 used (Oxygen's slot borrowed for the test)
    expect(cycleDuelCoolant(d, 3)).toBe('noop'); expect(d.power.coolant[3]).toBe(0);      // 0 → 1 not supplied: wraps to 0
  }));
  it('heat: +2 per hazard tick overdriven at 0 coolant, +1 at 1, held at 2; −4 when not overdriven', () => withDuel((d) => {
    overdriveEngines(d);
    duelHeatStep(d); expect(d.power.heat[2]).toBe(2);
    d.power.coolant[2] = 1; duelHeatStep(d); expect(d.power.heat[2]).toBe(3);
    d.power.coolant[2] = 2; duelHeatStep(d); expect(d.power.heat[2]).toBe(3);
    applyPower(d, DuelSystem.Engines, -1); duelHeatStep(d); expect(d.power.heat[2]).toBe(0);
  }));
  it('overheat fails the system, returns its bars, draws once, and the system takes bars again at heat 0', () => withDuel((d) => {
    overdriveEngines(d);
    d.power.heat[2] = HEAT_MAX - 2;
    const probe = { ...d.interior.rng.hazards }, lit = nextFloat(probe) < 0.5;
    duelHeatStep(d);
    expect(d.interior.rng.hazards).toEqual(probe);                         // exactly one draw
    expect(d.power.failed[2]).toBe(1); expect(d.power.heat[2]).toBe(HEAT_MAX);
    expect(bars(d)[DuelSystem.Engines]).toBe(0); expect(sparesOf(d)).toBe(5);
    expect(d.interior.rooms.fire[d.systemRooms[2]!]! > 0).toBe(lit);
    expect(capacityOf(d, DuelSystem.Engines)).toBe(0);
    expect(applyPower(d, DuelSystem.Engines, 1)).toBe('unavailable');
    d.power.coolant[2] = 2;
    duelHeatStep(d); expect(d.power.heat[2]).toBe(HEAT_MAX - 3);            // failed: −1 × (1 + coolant)
    d.power.heat[2] = 2; duelHeatStep(d);
    expect(d.power.heat[2]).toBe(0); expect(d.power.failed[2]).toBe(0);
    expect(applyPower(d, DuelSystem.Engines, 1)).toBe('applied');
  }));
  it('the power values round-trip a snapshot; bad values are refused', () => withDuel((d) => {
    overdriveEngines(d); d.power.heat[2] = 40; d.power.coolant[2] = 2;
    const back = loadDuelSnapshot(HOUND, saveDuelSnapshot(d, DIGEST), DIGEST);
    try { expect(hashDuel(back)).toBe(hashDuel(d)); expect(back.power).toEqual(d.power); } finally { disposeDuel(back); }
    expect(() => validatePowerValues([0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow(/coolant/);
    expect(() => validatePowerValues([0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toThrow(/heat/);
    expect(() => validatePowerValues([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2])).toThrow(/failed/);
  }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engPower.test.ts`
Expected: FAIL, because `sim/duel/power` cannot be resolved.

- [ ] **Step 3: Create `sim/duel/power.ts`**

```ts
// Engineering spike spec §2, §3, §7 (docs/superpowers/specs/2026-11-18-engineering-spike-design.md): the crew ship's
// reactor, overdrive, heat and coolant. The powered bars are tactical state (systems[0].bars, sim/tactical/bars.ts);
// this duel module holds the rest (DuelState.power: heat, coolant, failed) and every rule that moves bars. Heat steps
// on the hazard tick with heat.ts's numbers and no quirk term; an overheat draws once on rng.hazards.
import { chance } from '../../../../shared/rng';
import { igniteRoom } from '../hazards/fire';
import { vector, type ModuleField, type SimModule } from '../module';
import { damageCapacity, DUEL_SYSTEM_COUNT, OVERDRIVE_SYSTEMS, REACTOR_BARS, SYSTEM_MAX } from '../tactical/bars';
import { HEAT_COOL_IDLE, HEAT_COOL_UNIT, HEAT_MAX, HEAT_RISE, OVERHEAT_FIRE_CHANCE } from '../tuning';
import type { DuelState } from './state';
export {
  DuelSystem, DUEL_SYSTEM_COUNT, OVERDRIVE_SYSTEMS, SYSTEM_MAX, SYSTEM_SLOTS, SYSTEM_TACTICAL_ROOM, REACTOR_BARS, START_BARS, knock, damageCapacity, effectiveBars
} from '../tactical/bars';

/** Spec §3: Artemis's 8 shared coolant units; each overdrivable system holds 0..2. */
export const COOLANT_POOL_DUEL = 8;
export const COOLANT_MAX_PER_SYSTEM = 2;
/** The power module's canonical values: heat, coolant and failed, 5 each. */
export const POWER_VALUES = 3 * DUEL_SYSTEM_COUNT;

/** Spec §7: per system the heat (0..HEAT_MAX, integer), the coolant (0..2; Oxygen 0) and failed (0 or 1; Oxygen 0). */
export interface PowerState { heat: number[]; coolant: number[]; failed: number[] }
export function createPowerState(): PowerState {
  return { heat: Array<number>(DUEL_SYSTEM_COUNT).fill(0), coolant: Array<number>(DUEL_SYSTEM_COUNT).fill(0), failed: Array<number>(DUEL_SYSTEM_COUNT).fill(0) };
}

const barsOf = (d: DuelState): number[] => d.tactical.systems[0].bars;

/** A system index 0..4. */
export function validSystem(k: number): boolean { return Number.isInteger(k) && k >= 0 && k < DUEL_SYSTEM_COUNT; }
/** Spec §2: system k's capacity: 0 while failed, else max(0, slots − damage × knock). */
export function capacityOf(d: DuelState, k: number): number { return d.power.failed[k] ? 0 : damageCapacity(d.tactical.systems[0], k); }
/** The reactor's spare bars. */
export function sparesOf(d: DuelState): number { let used = 0; for (const b of barsOf(d)) used += b; return REACTOR_BARS - used; }
/** The coolant pool's free units. */
export function coolantFree(d: DuelState): number { let used = 0; for (const c of d.power.coolant) used += c; return COOLANT_POOL_DUEL - used; }
/** Spec §3: overdriven while the powered bars exceed the max (only the overdrive bar does); never Oxygen. */
export function isOverdriven(d: DuelState, k: number): boolean { return k < OVERDRIVE_SYSTEMS && barsOf(d)[k]! > SYSTEM_MAX[k]!; }

/** Spec §7 `shipPower`: +1 needs a spare bar and room under capacity; −1 needs a bar. `system` and `delta` are valid. */
export function applyPower(d: DuelState, system: number, delta: number): 'applied' | 'unavailable' {
  const b = barsOf(d), now = b[system]!;
  if (delta === 1) {
    if (sparesOf(d) < 1 || now >= capacityOf(d, system)) return 'unavailable';
    b[system] = now + 1;
    return 'applied';
  }
  if (now <= 0) return 'unavailable';
  b[system] = now - 1;
  return 'applied';
}

/** Spec §3 `shipCoolant` (system 0..3): 0 → 1 → 2 → 0; a step the pool cannot supply wraps to 0, as cycleCoolant does.
 *  'noop' when the value does not change. */
export function cycleDuelCoolant(d: DuelState, system: number): 'applied' | 'noop' {
  const c = d.power.coolant, now = c[system]!, next = now >= COOLANT_MAX_PER_SYSTEM ? 0 : now + 1;
  const value = next > now && coolantFree(d) < next - now ? 0 : next;
  if (value === now) return 'noop';
  c[system] = value;
  return 'applied';
}

/** Spec §7: lower every system's bars to its capacity; the excess returns to the pool (a count of bars, so the
 *  overdrive bar is the first to go). */
export function clampToCapacity(d: DuelState): void {
  const b = barsOf(d);
  for (let k = 0; k < DUEL_SYSTEM_COUNT; k++) { const cap = capacityOf(d, k); if (b[k]! > cap) b[k] = cap; }
}

/** Spec §3, one hazard tick, systems 0..3 in ascending index: overdriven +HEAT_RISE − coolant; idle −HEAT_COOL_IDLE;
 *  failed −HEAT_COOL_UNIT × (1 + coolant) and clears at 0. Reaching HEAT_MAX fails the system (heat held at HEAT_MAX, its
 *  bars to the pool at once) and draws once at OVERHEAT_FIRE_CHANCE, always, igniting the system's room when there is
 *  one (igniteRoom is a no-op on a burning room). */
export function duelHeatStep(d: DuelState): void {
  const p = d.power;
  for (let k = 0; k < OVERDRIVE_SYSTEMS; k++) {
    const cool = p.coolant[k]! * HEAT_COOL_UNIT;
    if (p.failed[k]) {
      p.heat[k] = Math.max(0, p.heat[k]! - HEAT_COOL_UNIT - cool);
      if (p.heat[k] === 0) p.failed[k] = 0;
      continue;
    }
    p.heat[k] = Math.max(0, p.heat[k]! + (isOverdriven(d, k) ? HEAT_RISE - cool : -HEAT_COOL_IDLE));
    if (p.heat[k]! < HEAT_MAX) continue;
    p.heat[k] = HEAT_MAX; p.failed[k] = 1;
    barsOf(d)[k] = 0;   // the clamp, inline (spec §7): a failed system's capacity is 0
    const lit = chance(d.interior.rng.hazards, OVERHEAT_FIRE_CHANCE), room = d.systemRooms[k]!;
    if (lit && room >= 0) igniteRoom(d.interior, room);
  }
}

/** Check the power module's 15 values (heat, coolant, failed) without writing them; throws naming the first bad one. */
export function validatePowerValues(values: ArrayLike<number>): void {
  if (values.length !== POWER_VALUES) throw new Error(`duel snapshot power: ${values.length} values, expected ${POWER_VALUES}`);
  let coolant = 0;
  for (let k = 0; k < DUEL_SYSTEM_COUNT; k++) {
    const heat = values[k]!, c = values[DUEL_SYSTEM_COUNT + k]!, f = values[2 * DUEL_SYSTEM_COUNT + k]!, over = k < OVERDRIVE_SYSTEMS;
    if (!Number.isInteger(heat) || heat < 0 || heat > HEAT_MAX || (!over && heat !== 0)) throw new Error(`duel snapshot power heat ${k}: ${heat} is out of range`);
    if (!Number.isInteger(c) || c < 0 || c > COOLANT_MAX_PER_SYSTEM || (!over && c !== 0)) throw new Error(`duel snapshot power coolant ${k}: ${c} is out of range`);
    if ((f !== 0 && f !== 1) || (!over && f !== 0)) throw new Error(`duel snapshot power failed ${k}: ${f} is not 0 or 1`);
    coolant += c;
  }
  if (coolant > COOLANT_POOL_DUEL) throw new Error(`duel snapshot power coolant: ${coolant} units, the pool is ${COOLANT_POOL_DUEL}`);
}

/** Spec §7: the `power` duel module (after `helm`, before `interior`): heat, coolant and failed per system. The bars
 *  are the `ship` module's (systems.0.bars). Snapshot validation is validatePowerValues (sim/duel/snapshot.ts). */
const POWER: ModuleField<DuelState>[] = [
  vector('power.heat', DUEL_SYSTEM_COUNT, (d) => d.power.heat),
  vector('power.coolant', DUEL_SYSTEM_COUNT, (d) => d.power.coolant),
  vector('power.failed', DUEL_SYSTEM_COUNT, (d) => d.power.failed)
];
export const powerModule: SimModule<DuelState> = {
  id: 'power',
  fields: () => POWER,
  notSnapshotted: {},
  commands: ['shipPower', 'shipCoolant', 'shipDoor', 'shipAirlock'],
  reasons: ['stale-tick', 'malformed', 'unavailable', 'duel-decided']
};
```

The power module owns all four engineering commands (doors included). They are one family of ship-view commands (spec §7).

- [ ] **Step 4: DuelState gains `power` and `systemRooms`**

In `src/renderer/src/sim/duel/state.ts`:

(a) Change `import { createTacticalState, type TacticalState } from '../tactical/state';` to `import { createTacticalState, Room, type TacticalState } from '../tactical/state';`, and add `import { createPowerState, type PowerState } from './power';`.

(b) In `interface DuelState`, replace

```ts
  crewClass: number;
}
```

with

```ts
  crewClass: number;
  /** Engineering spike spec §3, §7: the power module (heat, coolant, failed per system); the bars are systems[0].bars. */
  power: PowerState;
  /** Engineering spike Decision 3: each system's interior room (Shields, Weapons, Engines: their repair point's room;
   *  Sensors: the Science station's, else Weapons'; Oxygen: the Life Support station's, else −1). Derived from the layout. */
  systemRooms: number[];
}
```

(c) In `createDuel`, replace

```ts
    return { interior, tactical, present: Array<boolean>(crew).fill(true), repair: [0, 0, 0], points, nav, weapons, science, events: [], round: 0, helmPlayer, baseTick: 0, decidedTick: -1, throttle: 0, holdHeading: -1, crewClass };
```

with

```ts
    const pointRoom = (r: number): number => points.find((p) => p.tacticalRoom === r)?.room ?? -1;
    const ls = interior.derived.stationOfKind[StationKind.LifeSupport] ?? -1;
    const systemRooms = [pointRoom(Room.Shields), pointRoom(Room.Weapons), pointRoom(Room.Engines),
      science >= 0 ? interior.derived.stationRoom[science]! : pointRoom(Room.Weapons), ls >= 0 ? interior.derived.stationRoom[ls]! : -1];   // Engineering spike Decision 3
    return { interior, tactical, present: Array<boolean>(crew).fill(true), repair: [0, 0, 0], points, nav, weapons, science, events: [], round: 0, helmPlayer, baseTick: 0, decidedTick: -1, throttle: 0, holdHeading: -1, crewClass,
      power: createPowerState(), systemRooms };
```

`power.ts` imports only `type DuelState` from `state.ts`, so the runtime import is one-way and there is no cycle.

- [ ] **Step 5: Register the module**

In `src/renderer/src/sim/duel/modules.ts`:

(a) Add `import { powerModule } from './power';`.

(b) In `DUEL_NOT_SNAPSHOTTED`, replace `  events: 'per-tick repair events, cleared every tick'` with:

```ts
  events: 'per-tick repair events, cleared every tick',
  systemRooms: 'each system\'s interior room, derived from the layout by createDuel (Engineering spike Decision 3)'
```

(c) In `DUEL_MODULES`, replace

```ts
  { module: helmModule as SimModule<never>, state: (d) => d, path: '' },
```

with

```ts
  { module: helmModule as SimModule<never>, state: (d) => d, path: '' },
  { module: powerModule as SimModule<never>, state: (d) => d, path: '' },   // Engineering spike spec §7
```

and update the file's header comment to name `power` after `helm`.

- [ ] **Step 6: The snapshot reads the power values at their offset**

In `src/renderer/src/sim/duel/snapshot.ts`:

(a) Add `import { POWER_VALUES, validatePowerValues } from './power';`.

(b) Replace

```ts
  const space = seed.spaceLength, repairAt = 1 + space + n, roundAt = repairAt + 3, helmAt = roundAt + 4, interiorAt = helmAt + 2;
```

with

```ts
  const space = seed.spaceLength, repairAt = 1 + space + n, roundAt = repairAt + 3, helmAt = roundAt + 4, powerAt = helmAt + 2, interiorAt = powerAt + POWER_VALUES;   // Engineering spike spec §7: power after helm
```

(c) Directly after the held-heading check, which ends with `if (!validHoldHeading(holdHeading)) throw new Error(`duel snapshot held heading ${holdHeading} is invalid`);`, add:

```ts
  validatePowerValues(values.slice(powerAt, interiorAt));   // Engineering spike spec §7: heat, coolant, failed
```

- [ ] **Step 7: Update the module test**

In `tests/duelModules.test.ts`:
- Import `powerModule` from `../src/renderer/src/sim/duel/power`.
- Line 42: add `powerModule` to the `duelNames` list after `helmModule`.
- Line 107: the hash loop `for (const { module, state } of DUEL_MODULES.slice(0, 5)) {` becomes `for (const { module, state } of DUEL_MODULES.filter(({ module }) => module.id !== 'interior')) {   // Engineering spike spec §7: every non-interior module, power included`. With power added after helm, `slice(0, 5)` would silently skip helm and power.
- Line 140 (the explicit flatten expectation): after `d.throttle, d.holdHeading,` insert `...d.power.heat, ...d.power.coolant, ...d.power.failed,`.
- Line 150: the sorted kind list becomes `['contactScan', 'designate', 'heading', 'laserCharge', 'laserFrequency', 'laserLock', 'missileLaunch', 'presence', 'rematch', 'shipAirlock', 'shipCoolant', 'shipDoor', 'shipPower', 'sit', 'stand', 'throttle', 'torpLock']`.
- Mark each changed line `// Engineering spike spec §7`.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/engPower.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts tests/duelCheckpoint.test.ts`, then `npx tsc -b`.

Expected:
- engPower and duelModules PASS.
- duelSnapshot PASS. A test that hard-codes an offset after `helm` is fallout kind (a): shift it by `POWER_VALUES`.
- duelCheckpoint's "the duel codec admits exactly the duel modules' command kinds" fails until Task 5 puts the four kinds on the wire. That is the one exemption in Global Constraints; leave it red until Task 5.
- `tsc -b` is clean (`SimModule.commands` is `readonly string[]`).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/duel/power.ts src/renderer/src/sim/duel/state.ts src/renderer/src/sim/duel/modules.ts src/renderer/src/sim/duel/snapshot.ts tests/engPower.test.ts tests/duelModules.test.ts
git commit -m "feat(engineering-spike): the duel power module (capacity, bars, coolant, clamp, heat and overheat, snapshot)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The four commands: wire, toggles, step admission, the clamp

**Files:**
- Modify: `src/renderer/src/net/contracts.ts` (DuelCommand)
- Modify: `src/renderer/src/net/codec.ts` (duelWire.commands)
- Create: `src/renderer/src/sim/duel/hazards.ts` (validDoor, validAirlock, toggleDoor, toggleAirlock)
- Modify: `src/renderer/src/sim/duel/step.ts` (imports, DUEL_KINDS, the command block, clamp after firePhase)
- Modify: `tests/duelCheckpoint.test.ts:143` (examples)
- Test: `tests/engCommands.test.ts`

**Interfaces:**
- Consumes: Task 4's `applyPower`, `cycleDuelCoolant`, `clampToCapacity`, `validSystem`, `OVERDRIVE_SYSTEMS`; `DoorState` (`sim/grid.ts:4`).
- Produces: the four `DuelCommand` kinds; `validDoor(d, edge): boolean`, `validAirlock(d, index): boolean`, `toggleDoor(d, edge): void`, `toggleAirlock(d, index): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/engCommands.test.ts`:

```ts
// Engineering spike spec §5, §7: shipPower, shipCoolant, shipDoor and shipAirlock: who may send them, their reasons in
// order, the door and airlock toggles, the last in player order winning, the decided round.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { applyPower, DuelSystem, sparesOf } from '../src/renderer/src/sim/duel/power';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { DoorState } from '../src/renderer/src/sim/grid';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { sitDown } from '../src/renderer/src/sim/stations';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const env = (d: DuelState, player: number, command: DuelCommand, tick = d.interior.tick): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: tick, command });
const step = (d: DuelState, commands: DuelEnvelope[]) => stepDuelTick(d, { held: [NONE, NONE], commands });
function withDuel(f: (d: DuelState) => void): void { const d = createDuel(HOUND, 11); try { f(d); } finally { disposeDuel(d); } }
const bars = (d: DuelState) => d.tactical.systems[0].bars;

describe('engineering spike: the four ship commands (spec §7)', () => {
  it('shipPower from a standing player and from a seated one; reasons stale → malformed → unavailable', () => withDuel((d) => {
    let r = step(d, [env(d, 0, { kind: 'shipPower', system: DuelSystem.Sensors, delta: -1 })]);
    expect(r[0]).toMatchObject({ status: 'applied' }); expect(bars(d)[DuelSystem.Sensors]).toBe(0);
    sitDown(d.interior, 1, d.weapons);
    r = step(d, [env(d, 1, { kind: 'shipPower', system: DuelSystem.Weapons, delta: 1 })]);
    expect(r[0]).toMatchObject({ status: 'applied' }); expect(bars(d)[DuelSystem.Weapons]).toBe(3);
    r = step(d, [env(d, 1, { kind: 'shipPower', system: DuelSystem.Weapons, delta: 1 })]);   // the start's spare bar too
    expect(r[0]).toMatchObject({ status: 'applied' }); expect(sparesOf(d)).toBe(0);
    r = step(d, [env(d, 0, { kind: 'shipPower', system: 0, delta: 1 }, d.interior.tick - 1)]);
    expect(r[0]).toMatchObject({ status: 'rejected', reason: 'stale-tick' });
    for (const bad of [{ system: 5, delta: 1 }, { system: 0, delta: 2 }, { system: 1.5, delta: 1 }]) {
      r = step(d, [env(d, 0, { kind: 'shipPower', ...bad })]);
      expect(r[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
    }
    r = step(d, [env(d, 0, { kind: 'shipPower', system: DuelSystem.Shields, delta: 1 })]);   // no spare
    expect(r[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    const eid = d.interior.crew[0]!; Life.state[eid] = LifeState.Downed; Health.cur[eid] = 0;
    r = step(d, [env(d, 0, { kind: 'shipPower', system: DuelSystem.Weapons, delta: -1 })]);
    expect(r[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    d.present[1] = false;
    r = step(d, [env(d, 1, { kind: 'shipPower', system: DuelSystem.Weapons, delta: -1 })]);
    expect(r[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
  }));
  it('the power commands apply in player order, whatever the envelope order', () => withDuel((d) => {
    applyPower(d, DuelSystem.Engines, 1);                                   // spend the start's spare bar first
    const a = env(d, 1, { kind: 'shipPower', system: DuelSystem.Shields, delta: 1 }), b = env(d, 0, { kind: 'shipPower', system: DuelSystem.Sensors, delta: -1 });
    const r = step(d, [a, b]);   // player 0 frees a bar first, so player 1's +1 Shields applies
    expect(r.map((x) => x.status)).toEqual(['applied', 'applied']);
    expect(bars(d)[DuelSystem.Shields]).toBe(3); expect(sparesOf(d)).toBe(0);
  }));
  it('shipCoolant cycles, noop when unchanged; malformed for Oxygen or out of range', () => withDuel((d) => {
    expect(step(d, [env(d, 0, { kind: 'shipCoolant', system: 1 })])[0]).toMatchObject({ status: 'applied' });
    expect(d.power.coolant[1]).toBe(1);
    expect(step(d, [env(d, 0, { kind: 'shipCoolant', system: 4 })])[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
    d.power.coolant = [2, 2, 2, 0, 2];   // a full pool (Oxygen's slot borrowed for the test)
    expect(step(d, [env(d, 0, { kind: 'shipCoolant', system: 3 })])[0]).toMatchObject({ status: 'noop' });
  }));
  it('shipDoor toggles auto ↔ held open remotely; shipAirlock toggles open; bad indices are malformed', () => withDuel((d) => {
    const edge = d.interior.derived.doorEdges[0]!;
    d.interior.doors.state[edge] = DoorState.Closed;   // Task 6 makes Closed the start; until then createDuel holds doors open
    expect(step(d, [env(d, 0, { kind: 'shipDoor', edge })])[0]).toMatchObject({ status: 'applied' });
    expect(d.interior.doors.state[edge]).toBe(DoorState.HeldOpen);
    step(d, [env(d, 1, { kind: 'shipDoor', edge })]);
    expect(d.interior.doors.state[edge]).toBe(DoorState.Closed);
    expect(step(d, [env(d, 0, { kind: 'shipAirlock', index: 1 })])[0]).toMatchObject({ status: 'applied' });
    expect(d.interior.airlocks.open[1]).toBe(1);
    step(d, [env(d, 0, { kind: 'shipAirlock', index: 1 })]);
    expect(d.interior.airlocks.open[1]).toBe(0);
    const wall = d.interior.derived.edgeIsDoor.findIndex((x) => x === 0);
    for (const c of [{ kind: 'shipDoor', edge: 999 }, { kind: 'shipAirlock', index: 2 }, { kind: 'shipAirlock', index: -1 }, ...(wall >= 0 ? [{ kind: 'shipDoor', edge: wall }] : [])] as DuelCommand[])
      expect(step(d, [env(d, 0, c)])[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
  }));
  it('on a decided round the four kinds answer duel-decided', () => withDuel((d) => {
    d.tactical.outcome = Outcome.CrewWins;
    const r = step(d, [env(d, 0, { kind: 'shipPower', system: 0, delta: -1 }), env(d, 0, { kind: 'shipDoor', edge: 0 }), env(d, 0, { kind: 'shipCoolant', system: 0 }), env(d, 0, { kind: 'shipAirlock', index: 0 })]);
    expect(r.every((x) => x.status === 'rejected' && x.reason === 'duel-decided')).toBe(true);
  }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engCommands.test.ts`
Expected: FAIL. Either tsc-in-vitest reports unknown command kinds, or every result is `not-in-duel`.

- [ ] **Step 3: The four kinds on the wire**

In `src/renderer/src/net/contracts.ts`, in `DuelCommand`, replace

```ts
  /** On a decided round's end card: start the next round (H-2 spec §7). */
  | { kind: 'rematch' }
```

with

```ts
  /** On a decided round's end card: start the next round (H-2 spec §7). */
  | { kind: 'rematch' }
  /** Engineering spike spec §7 (any present, conscious player; the sim checks ranges): move one reactor bar into (+1) or
   *  out of (−1) system 0..4 (Shields, Weapons, Engines, Sensors, Oxygen); cycle system 0..3's coolant; toggle a door
   *  edge auto ↔ held open; toggle an airlock open or closed. Named ship* because the sector owns `power` and `coolant`. */
  | { kind: 'shipPower'; system: number; delta: number }
  | { kind: 'shipCoolant'; system: number }
  | { kind: 'shipDoor'; edge: number }
  | { kind: 'shipAirlock'; index: number }
```

In `src/renderer/src/net/codec.ts`, in `duelWire.commands`, replace

```ts
      z.object({ kind: z.literal('rematch') }).strict(),
      z.object({ kind: z.literal('setPaused'), paused: z.boolean() }).strict()
```

with

```ts
      z.object({ kind: z.literal('rematch') }).strict(),
      // Engineering spike spec §7: integers; the sim answers an out-of-range one malformed.
      z.object({ kind: z.literal('shipPower'), system: z.number().int(), delta: z.number().int() }).strict(),
      z.object({ kind: z.literal('shipCoolant'), system: z.number().int() }).strict(),
      z.object({ kind: z.literal('shipDoor'), edge: z.number().int() }).strict(),
      z.object({ kind: z.literal('shipAirlock'), index: z.number().int() }).strict(),
      z.object({ kind: z.literal('setPaused'), paused: z.boolean() }).strict()
```

and append `; the Engineering spike adds shipPower, shipCoolant, shipDoor and shipAirlock` to the doc comment above `duelWire`.

In `tests/duelCheckpoint.test.ts:143`, add to `examples`: `shipPower: { kind: 'shipPower', system: 1, delta: -1 }, shipCoolant: { kind: 'shipCoolant', system: 0 }, shipDoor: { kind: 'shipDoor', edge: 2 }, shipAirlock: { kind: 'shipAirlock', index: 1 }`.

- [ ] **Step 4: The toggles**

Create `src/renderer/src/sim/duel/hazards.ts`:

```ts
// Engineering spike spec §4, §5 (docs/superpowers/specs/2026-11-18-engineering-spike-design.md): the duel's own pieces
// of the interior hazards: the door and airlock toggles the ship-view clicks send (any player, no range check). Tasks 6
// and 7 add Life Support injection, breach sites, firefighting tiles, work jobs and patching.
import { DoorState } from '../grid';
import type { DuelState } from './state';

/** A door edge index of the layout. */
export function validDoor(d: DuelState, edge: number): boolean {
  const de = d.interior.derived;
  return Number.isInteger(edge) && edge >= 0 && edge < de.edgeIsDoor.length && de.edgeIsDoor[edge] === 1;
}
/** An airlock index of the layout. */
export function validAirlock(d: DuelState, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < d.interior.derived.airlockRoom.length;
}
/** Spec §5 (Decision 14): auto (Closed or Open) → held open; held open → auto (Closed). Sealed never occurs in the duel. */
export function toggleDoor(d: DuelState, edge: number): void {
  const doors = d.interior.doors;
  doors.state[edge] = doors.state[edge] === DoorState.HeldOpen ? DoorState.Closed : DoorState.HeldOpen;
  doors.closeTimer[edge] = 0; doors.sealRequested[edge] = 0;
}
/** Spec §5: an airlock opens to space, or closes. */
export function toggleAirlock(d: DuelState, index: number): void {
  const open = d.interior.airlocks.open;
  open[index] = open[index] ? 0 : 1;
}
```

- [ ] **Step 5: The step admits the four kinds**

In `src/renderer/src/sim/duel/step.ts`:

(a) Add these imports:

```ts
import { applyPower, clampToCapacity, cycleDuelCoolant, OVERDRIVE_SYSTEMS, validSystem } from './power';
import { toggleAirlock, toggleDoor, validAirlock, validDoor } from './hazards';
```

(b) Replace

```ts
const DUEL_KINDS = ['sit', 'stand', 'presence', 'laserLock', 'torpLock', 'laserCharge', 'missileLaunch', 'rematch', 'throttle', 'heading', 'contactScan', 'designate', 'laserFrequency'];
```

with

```ts
const DUEL_KINDS = ['sit', 'stand', 'presence', 'laserLock', 'torpLock', 'laserCharge', 'missileLaunch', 'rematch', 'throttle', 'heading', 'contactScan', 'designate', 'laserFrequency',
  'shipPower', 'shipCoolant', 'shipDoor', 'shipAirlock'];   // Engineering spike spec §7
/** Engineering spike spec §7: the ship-view commands. */
const SHIP_KINDS = new Set(['shipPower', 'shipCoolant', 'shipDoor', 'shipAirlock']);
```

(c) Replace

```ts
  crew.scanner = t.scan.contact < 0 || attendant(d, t.scan.by) >= 0;   // spec §4.6: after admission, so a same-tick takeover keeps it
```

with

```ts
  crew.scanner = t.scan.contact < 0 || attendant(d, t.scan.by) >= 0;   // spec §4.6: after admission, so a same-tick takeover keeps it
  // Engineering spike spec §7 (Decision 12): shipPower, shipCoolant, shipDoor and shipAirlock from any valid, present,
  // conscious player, seated or standing, with no range or view check, applied in (player, sequence) order so the last
  // in player order wins. The tactical admissions above read the bars as they stood at the start of the tick.
  const engineer = (pid: number): boolean => validPlayer(d, pid) && d.present[pid] === true && conscious(d, pid);
  const shipCommands = input.commands.filter((e) => SHIP_KINDS.has(e.command.kind)).sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence);
  for (const e of shipCommands) {
    const c = e.command;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    const wellFormed = c.kind === 'shipPower' ? validSystem(c.system) && (c.delta === 1 || c.delta === -1)
      : c.kind === 'shipCoolant' ? Number.isInteger(c.system) && c.system >= 0 && c.system < OVERDRIVE_SYSTEMS
      : c.kind === 'shipDoor' ? validDoor(d, c.edge)
      : c.kind === 'shipAirlock' ? validAirlock(d, c.index) : false;
    if (!wellFormed) { result(e, 'malformed'); continue; }
    if (!engineer(e.id.player)) { result(e, 'unavailable'); continue; }
    if (c.kind === 'shipPower') { if (applyPower(d, c.system, c.delta) === 'applied') result(e); else result(e, 'unavailable'); }
    else if (c.kind === 'shipCoolant') result(e, undefined, cycleDuelCoolant(d, c.system));
    else if (c.kind === 'shipDoor') { toggleDoor(d, c.edge); result(e); }
    else if (c.kind === 'shipAirlock') { toggleAirlock(d, c.index); result(e); }
  }
```

(d) Replace

```ts
  firePhase(d, tick);   // duel-fire spec §1: growth and damage, then this tick's hits roll (rng.hazards)
```

with

```ts
  firePhase(d, tick);   // duel-fire spec §1: the damage cadence, then this tick's hits roll (rng.hazards)
  clampToCapacity(d);   // Engineering spike spec §7: excess bars back to the pool after every damage rise this tick
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/engCommands.test.ts tests/engPower.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts tests/codecModeWire.test.ts`, then `npx tsc -b`.
Expected: all PASS, and `tsc -b` is clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/sim/duel/hazards.ts src/renderer/src/sim/duel/step.ts tests/engCommands.test.ts tests/duelCheckpoint.test.ts
git commit -m "feat(engineering-spike): shipPower, shipCoolant, shipDoor and shipAirlock on the wire and in the step; clamp after damage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The interior hazards run: no quirk, closed doors, doorSystem, the hazard tick, fire by oxygen

**Files:**
- Modify: `src/renderer/src/sim/duel/state.ts` (createSimState options, no HeldOpen fill)
- Modify: `src/renderer/src/sim/duel/hazards.ts` (duelInjection)
- Modify: `src/renderer/src/sim/duel/fire.ts` (firePhase without growth)
- Modify: `src/renderer/src/sim/duel/tuning.ts` (remove DUEL_FIRE_GROW)
- Modify: `src/renderer/src/sim/duel/step.ts` (doorSystem, the hazard tick)
- Modify: `src/renderer/src/sim/duel/scripted.ts:144-182` (goalTiles and bfsPath plan through doors whatever their state)
- Modify: `tests/duelScripted.test.ts:35-42` (path tiles are not wall tiles, rather than not solid)
- Test: `tests/engHazards.test.ts`

**Interfaces:**
- Consumes: `doorSystem` (`sim/doors.ts:83`), `oxygenStep(state, injection)` (`sim/hazards/oxygen.ts`), `fireStep` (`sim/hazards/fire.ts:23`), `passageFor`, `totalO2` (`sim/hazards/oxygen.ts`), `quirkPassageMult`, `quirkDoorDelayMult` (`sim/quirks.ts`), Task 4's `duelHeatStep`.
- Produces: `duelInjection(d: DuelState): void`; doors start Closed; the hazard tick in the step.

- [ ] **Step 1: Write the failing test**

Create `tests/engHazards.test.ts`:

```ts
// Engineering spike spec §4, §5: the interior hazards on the duel: no quirk, closed doors, Life Support by Oxygen bars,
// venting through an airlock, fire by oxygen, fire spread through open and closed doors, an airlock held across ticks.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { applyPower, DuelSystem } from '../src/renderer/src/sim/duel/power';
import { toggleAirlock, toggleDoor } from '../src/renderer/src/sim/duel/hazards';
import { DoorState } from '../src/renderer/src/sim/grid';
import { igniteRoom, fireStep } from '../src/renderer/src/sim/hazards/fire';
import { passageFor, totalO2 } from '../src/renderer/src/sim/hazards/oxygen';
import { quirkDoorDelayMult, quirkPassageMult } from '../src/renderer/src/sim/quirks';
import { FIRE_SPREAD_P, PASSAGE_CLOSED } from '../src/renderer/src/sim/tuning';
import { nextFloat } from '../src/shared/rng';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const room = (id: string) => HOUND.rooms.findIndex((r) => r.id === id);
/** A duel with the enemy switched off, so only the interior changes. */
function quiet(seed = 3): DuelState { const d = createDuel(HOUND, seed); d.tactical.ships[1]!.active = false; return d; }
const run = (d: DuelState, ticks: number) => { for (let k = 0; k < ticks; k++) stepDuelTick(d, { held: [NONE, NONE], commands: [] }); };
const frac = (d: DuelState, r: number) => d.interior.rooms.o2[r]! / d.interior.derived.volume[r]!;
function withDuel(f: (d: DuelState) => void, seed = 3): void { const d = quiet(seed); try { f(d); } finally { disposeDuel(d); } }

describe('engineering spike: the interior hazards (spec §4, §5)', () => {
  it('a fresh duel: doors closed (auto), the quirk hooks neutral, every room full', () => withDuel((d) => {
    for (const e of d.interior.derived.doorEdges) expect(d.interior.doors.state[e]).toBe(DoorState.Closed);
    expect(d.interior.run.quirk).toBe(3);
    expect(quirkPassageMult(d.interior)).toBe(1); expect(quirkDoorDelayMult(d.interior)).toBe(1);
    expect(totalO2(d.interior)).toBeCloseTo(d.interior.derived.volume.reduce((a, v) => a + v, 0), 9);
  }));
  it('Oxygen at 0 bars: the air falls; at 1 bar it stays full', () => {
    withDuel((d) => { const full = totalO2(d.interior); run(d, 600); expect(totalO2(d.interior)).toBeCloseTo(full, 6); });
    withDuel((d) => { const full = totalO2(d.interior); applyPower(d, DuelSystem.Oxygen, -1); run(d, 600); expect(totalO2(d.interior)).toBeLessThan(full - 1e-3); });
  });
  it('an open airlock vents its room below 10 % in about 2 s and puts its fire out', () => withDuel((d) => {
    const L = room('L');
    igniteRoom(d.interior, L);
    toggleAirlock(d, 1);                                   // the Hound's airlock 1 is in L
    let t = 0; while (frac(d, L) >= 0.1 && t < 600) { run(d, 1); t++; }
    expect(t).toBeLessThanOrEqual(300);
    run(d, 360);
    expect(d.interior.rooms.fire[L]).toBe(0);
  }));
  it('an airlock held open stays open across 600 ticks (the Doors fail-safe never fires)', () => withDuel((d) => {
    toggleAirlock(d, 0); run(d, 600); expect(d.interior.airlocks.open[0]).toBe(1);
    const e = d.interior.derived.doorEdges[0]!; toggleDoor(d, e); run(d, 600); expect(d.interior.doors.state[e]).toBe(DoorState.HeldOpen);
  }));
  it('fire spreads through an open door at FIRE_SPREAD_P and through a closed one at 0.05 ×', () => {
    // E's only edge is the E–H door (edge 0), so one draw per fireStep decides the spread.
    const E = room('E'), H = room('H'), edge = 0;
    const drawWith = (d: DuelState, lo: number, hi: number): void => {
      for (let s = 1; s < 5_000_000; s++) { const probe = { s }; const v = nextFloat(probe); if (v >= lo && v < hi) { d.interior.rng.hazards.s = s; return; } }
      throw new Error('no state found');
    };
    withDuel((d) => {
      igniteRoom(d.interior, E); toggleDoor(d, edge);
      expect(passageFor(d.interior, edge)).toBe(1);
      drawWith(d, FIRE_SPREAD_P * PASSAGE_CLOSED, FIRE_SPREAD_P); fireStep(d.interior);
      expect(d.interior.rooms.fire[H]! > 0).toBe(true);
    });
    withDuel((d) => {
      igniteRoom(d.interior, E);
      expect(passageFor(d.interior, edge)).toBe(PASSAGE_CLOSED);
      drawWith(d, FIRE_SPREAD_P * PASSAGE_CLOSED, FIRE_SPREAD_P); fireStep(d.interior);
      expect(d.interior.rooms.fire[H]).toBe(0);
      drawWith(d, 0, FIRE_SPREAD_P * PASSAGE_CLOSED); fireStep(d.interior);
      expect(d.interior.rooms.fire[H]! > 0).toBe(true);
    });
  });
  it('a fire grows only on hazard ticks by oxygen (no DUEL_FIRE_GROW), and starves out below 10 % air', () => withDuel((d) => {
    const Q = room('Q'); igniteRoom(d.interior, Q); run(d, 1);   // tick 0 is a hazard tick
    const f0 = d.interior.rooms.fire[Q]!; run(d, 4);
    expect(d.interior.rooms.fire[Q]).toBe(f0);            // ticks 1..4: no hazard tick, and no per-tick DUEL_FIRE_GROW
    applyPower(d, DuelSystem.Oxygen, -1);                  // no injection, so only the closed doors' leak refills Q
    d.interior.rooms.o2[Q] = 0.02 * d.interior.derived.volume[Q]!;
    run(d, 240);
    expect(d.interior.rooms.fire[Q]).toBe(0);
  }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engHazards.test.ts`
Expected: FAIL. Doors are HeldOpen, the quirk is not 3, and `duelInjection` is not run.

- [ ] **Step 3: createDuel: quirk 3, doors closed**

In `src/renderer/src/sim/duel/state.ts`:

(a) Replace

```ts
  const interior = createSimState(layout, crew, seed, Array<number>(crew).fill(RECRUIT));
  try {
    interior.doors.state.fill(DoorState.HeldOpen);
```

with

```ts
  // Engineering spike spec §4 (Decision 15): quirk 3 (Lucky Hull) touches only sector debris, so every quirk hook the
  // duel's hazards reach is neutral. Spec §5 (Decision 14): the doors start in auto (Closed), no longer held open.
  const interior = createSimState(layout, crew, seed, Array<number>(crew).fill(RECRUIT), { quirk: 3 });
  try {
```

(b) Change `import { DoorState, roomAt } from '../grid';` to `import { roomAt } from '../grid';`.

(c) In the `createDuel` doc comment, change "every door held open" to "every door in auto (closed), quirk 3 (Engineering spike spec §4, §5)".

- [ ] **Step 4: Life Support injection**

Append to `src/renderer/src/sim/duel/hazards.ts`:

```ts
import { DuelSystem, effectiveBars, OXY_FACTOR_BY_BARS } from '../tactical/bars';
import { HAZARD_DT, INJECT_FRAC } from '../tuning';

/** Spec §4 Life Support injection, before each oxygenStep: every room asks INJECT_FRAC × V × HAZARD_DT ×
 *  OXY_FACTOR[Oxygen bars]; oxygenStep's clamp to free volume and its venting skip apply. Bypasses the sector
 *  lifeSupportInjection (its station output and seated bonus). */
export function duelInjection(d: DuelState): void {
  const st = d.interior, V = st.derived.volume, inj = st.injectionScratch;
  const f = OXY_FACTOR_BY_BARS[effectiveBars(d.tactical.systems[0], DuelSystem.Oxygen)]!;
  for (let r = 0; r < V.length; r++) inj[r] = INJECT_FRAC * V[r]! * HAZARD_DT * f;
}
```

Move the two new `import` lines to the top of the file with the others.

- [ ] **Step 5: firePhase drops its growth**

In `src/renderer/src/sim/duel/fire.ts`:

(a) Replace the import block

```ts
import {
  DUEL_EXTINGUISH_RATE_SOLO, DUEL_EXTINGUISH_RATE_TEAM, DUEL_EXTINGUISH_UNITS, DUEL_FIRE_CHANCE_LASER, DUEL_FIRE_CHANCE_MISSILE, DUEL_FIRE_DAMAGE_TICKS, DUEL_FIRE_GROW
} from './tuning';
```

with

```ts
import {
  DUEL_EXTINGUISH_RATE_SOLO, DUEL_EXTINGUISH_RATE_TEAM, DUEL_EXTINGUISH_UNITS, DUEL_FIRE_CHANCE_LASER, DUEL_FIRE_CHANCE_MISSILE, DUEL_FIRE_DAMAGE_TICKS
} from './tuning';
```

and remove `import { FIRE_CAP } from '../tuning';`.

(b) Replace the whole `firePhase` function (its doc comment through its closing brace) with:

```ts
/** The step's fire after stepDuel (`tick` is the tick being stepped), Engineering spike spec §4: on the round's every
 *  DUEL_FIRE_DAMAGE_TICKS-th tick each burning point room raises its Room one level (to 2, the weapon-hit cap); then this
 *  tick's hits roll for new fires. Growth, shrink and spread are the sector fireStep's alone, on the hazard tick. */
export function firePhase(d: DuelState, tick: number): void {
  const rooms = d.tactical.systems[0].rooms;
  if ((tick - d.baseTick) % DUEL_FIRE_DAMAGE_TICKS === DUEL_FIRE_DAMAGE_TICKS - 1)
    for (const p of d.points) if (pointBurning(d, p) && rooms[p.tacticalRoom]! < 2) rooms[p.tacticalRoom as 0 | 1 | 2]++;
  igniteFromHits(d, d.tactical.events);
}
```

(c) Rewrite the file's header comment (lines 1 to 4, each starting `// `). Today it says the duel runs only ignition, growth to FIRE_CAP, the damage cadence and the extinguish work, and that the sector fireStep never runs. Make it say instead:
- ignition from enemy hits (with Task 7's breach roll), the level damage cadence and the extinguish work are here;
- growth by oxygen, shrink and spread are the sector fireStep's, run on the duel's hazard tick (Engineering spike spec §4).
Keep the first line's `// Duel fire (duel-fire spec §1): the crew ship's fires, kept in the interior's own rooms.fire and rooms.fireRepair (so` sentence about storage.

In `src/renderer/src/sim/duel/tuning.ts`:
- delete the line `export const DUEL_FIRE_GROW = 1 / 60;`;
- in the doc comment above the fire constants (it spans lines 35 and 36 with ` *  ` prefixes), remove the clause that a fire "grows DUEL_FIRE_GROW per tick to FIRE_CAP and never goes out by itself" and put in its place "grows, shrinks and spreads by the sector fireStep (Engineering spike spec §4)". Keep the rest of the comment and the line prefixes.

- [ ] **Step 6: doorSystem and the hazard tick in the step**

In `src/renderer/src/sim/duel/step.ts`:

(a) Add these imports:

```ts
import { doorSystem } from '../doors';
import { fireStep } from '../hazards/fire';
import { oxygenStep } from '../hazards/oxygen';
import { HAZARD_EVERY } from '../tuning';
import { duelHeatStep } from './power';
import { duelInjection } from './hazards';
```

Merge them with the existing `./power` and `./hazards` imports from Task 5, so each module is imported once.

(b) Replace

```ts
  movementSystem(st, intents);   // skips seated and downed crew, and anyone who stood this tick
  stepDuel(d.tactical, crew);
```

with

```ts
  movementSystem(st, intents);   // skips seated and downed crew, and anyone who stood this tick
  doorSystem(st);   // Engineering spike spec §5: auto doors open for crew and close behind (the Doors station stays online)
  stepDuel(d.tactical, crew);
```

(c) Replace

```ts
  clampToCapacity(d);   // Engineering spike spec §7: excess bars back to the pool after every damage rise this tick
```

with

```ts
  clampToCapacity(d);   // Engineering spike spec §7: excess bars back to the pool after every damage rise this tick
  if ((tick - d.baseTick) % HAZARD_EVERY === 0) {   // Engineering spike spec §7 (Decision 13): the hazard tick, 12 Hz
    duelInjection(d);
    oxygenStep(st, st.injectionScratch);
    fireStep(st);
    duelHeatStep(d);   // overheat draws last; each overheat clamps its bars inline
  }
```

(d) Update `stepDuelTick`'s doc comment, replacing "fire (growth, damage, ignition from this tick's hits)" with "the doors; fire (the damage cadence, then the hits' fire and breach rolls); the bar clamp; on the hazard tick Life Support, oxygen, fire growth and spread, and heat (Engineering spike spec §7)".

- [ ] **Step 7: The scripted crew plans through closed doors (bot pathing)**

`bfsPath` and `goalTiles` (`sim/duel/scripted.ts`) use `solidAt`, which treats a Closed door as solid (`sim/grid.ts:14-21`). With the doors in auto, every bot path through a doorway is now null, and the Cutter's spawns are all in one room. A real crew member walks into an auto door, `doorSystem` opens it the next tick, and they pass. So the bots plan through door tiles whatever their state, and the movement code does the rest.

In `src/renderer/src/sim/duel/scripted.ts`:

(a) Directly above `export function goalTiles`, add:

```ts
/** Engineering spike spec §5: a tile the bots may plan through: inside the grid and not a wall. Door tiles count
 *  whatever their state, because an auto door opens for a crew member walking into it (doorSystem). */
function walkable(d: DuelState, tx: number, ty: number): boolean {
  const de = d.interior.derived;
  return tx >= 0 && ty >= 0 && tx < de.width && ty < de.height && de.wallTile[ty * de.width + tx] === 0;
}
```

(b) In `goalTiles`, replace `    if (Math.sqrt(ddx * ddx + ddy * ddy) <= REACH && !solidAt(st, i % w, Math.floor(i / w))) out.add(i);` with `    if (Math.sqrt(ddx * ddx + ddy * ddy) <= REACH && walkable(d, i % w, Math.floor(i / w))) out.add(i);`.

(c) In `bfsPath`, replace `      if (solidAt(st, nx, ny)) continue;` with `      if (!walkable(d, nx, ny)) continue;   // Engineering spike spec §5: through auto doors too`.

(d) Change the section comment `// --- Walking (spec §3): a BFS over the Cutter's walkable tiles, doors held open, four-way only. ---` to `// --- Walking (spec §3): a BFS over the layout's walkable tiles (door tiles included, Engineering spike spec §5), four-way only. ---`. In `bfsPath`'s doc comment, change `Walkable means not solid (doors are held open in the duel).` to `Walkable means not a wall: door tiles count whatever their state (Engineering spike spec §5).`

(e) If `solidAt` is no longer used in the file, remove it from its import so `noUnusedLocals` passes.

In `tests/duelScripted.test.ts`, in the walk test (`walks four-way through walkable tiles only, ...`), replace the assertion `expect(solidAt(st, next % w, Math.floor(next / w))).toBe(false);` with `expect(st.derived.wallTile[next]).toBe(0);   // Engineering spike spec §5: door tiles are walkable whatever their state`. Drop the `solidAt` import if it is unused. This is fallout kind (a).

Append to `tests/engHazards.test.ts` (add the imports at the top of the file: `import cutter from '../src/renderer/src/sim/ship/cutter.json';`, `import { Seated } from '../src/renderer/src/sim/components';` and `import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';`):

```ts
describe('engineering spike: the scripted crew with closed doors (spec §5)', () => {
  it('an unseated scripted pair on the Cutter reaches Navigation and Weapons within 1200 ticks, through auto doors', () => {
    const d = createDuel(parseShip(cutter), 1), pair = createScriptedPair(1);
    try {
      for (const e of d.interior.derived.doorEdges) expect(d.interior.doors.state[e]).toBe(DoorState.Closed);
      let t = 0;
      const seatOf = (pid: number) => Seated.station[d.interior.crew[pid]!]!;
      while ((seatOf(0) !== d.nav || seatOf(1) !== d.weapons) && t < 1200) { stepDuelTick(d, scriptedInput(pair, d)); t++; }
      expect(seatOf(0)).toBe(d.nav); expect(seatOf(1)).toBe(d.weapons);
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 8: Run the tests and the touched suites**

Run: `npx vitest run tests/engHazards.test.ts tests/engPower.test.ts tests/engCommands.test.ts tests/duelFire.test.ts tests/duelInterior.test.ts tests/duelHealth.test.ts tests/duel.test.ts tests/duelScripted.test.ts`, then `npx tsc -b`.

Expected: the three eng files PASS. Fix failures in duelFire, duelInterior, duelHealth and duel by the fallout rule. In particular:
- `tests/duelFire.test.ts` imports `DUEL_FIRE_GROW`. Remove the import, and rewrite its growth test to "a fire grows only through fireStep on the hazard tick", which is kind (a).
- "never goes out by itself" becomes "goes out below 10 % air", kind (a).

`tsc -b` must be clean, including every file that imported `DUEL_FIRE_GROW`. Find them with `grep -rn DUEL_FIRE_GROW src tests scripts`.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/duel/state.ts src/renderer/src/sim/duel/hazards.ts src/renderer/src/sim/duel/fire.ts src/renderer/src/sim/duel/tuning.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/scripted.ts tests/engHazards.test.ts tests/duelScripted.test.ts
git commit -m "feat(engineering-spike): the interior hazards run on the duel (closed doors, doorSystem, oxygen and Life Support by bars, fire by air and spread, heat on the hazard tick, quirk 3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Add the fallout test files you fixed to the `git add` line by name.

---

### Task 7: Breaches, firefighting in every room, work precedence, low air

**Files:**
- Modify: `src/renderer/src/sim/duel/tuning.ts` (breach chances, LOW_AIR_FRAC)
- Modify: `src/renderer/src/sim/duel/fire.ts` (`extinguishRoomWork`, `hitRolls`, firePhase calls hitRolls)
- Modify: `src/renderer/src/sim/duel/hazards.ts` (`siteOfRoom`, `fireTileOf`, `WorkJob`, `workJob`, `patchWork`)
- Modify: `src/renderer/src/sim/duel/step.ts` (repairPhase)
- Modify: `src/renderer/src/sim/duel/state.ts` (cause `'air'`)
- Modify: `src/renderer/src/sim/duel/health.ts` (low air)
- Test: `tests/engWork.test.ts`

**Interfaces:**
- Consumes: `activateBreach`, `repairBreach` (`sim/hazards/breach.ts`); `extinguishRoom`, `igniteRoom`; `inReachOfTile` (`sim/interact.ts`); `O2_DAMAGE`, `DT` (`sim/tuning.ts`).
- Produces: the hazards.ts and fire.ts names in Global Constraints; `crewHurt` with cause `'air'`.

- [ ] **Step 1: Write the failing test**

Create `tests/engWork.test.ts`:

```ts
// Engineering spike spec §4: hit rolls (fire, then breach, per hit), venting through a breach and patching it at its
// site tile, firefighting at a non-point room's breach-site tile, the work precedence (fire > breach > repair), and
// low-air damage to standing and seated crew.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { hitRolls } from '../src/renderer/src/sim/duel/fire';
import { healthPhase } from '../src/renderer/src/sim/duel/health';
import { siteOfRoom } from '../src/renderer/src/sim/duel/hazards';
import { DUEL_BREACH_CHANCE_LASER, DUEL_EXTINGUISH_UNITS, DUEL_FIRE_CHANCE_LASER, LOW_AIR_FRAC } from '../src/renderer/src/sim/duel/tuning';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { roomBreached } from '../src/renderer/src/sim/hazards/oxygen';
import { Position } from '../src/renderer/src/sim/components';
import { sitDown } from '../src/renderer/src/sim/stations';
import { Room, type DuelEvent } from '../src/renderer/src/sim/tactical/state';
import { DT, O2_DAMAGE } from '../src/renderer/src/sim/tuning';
import { nextFloat } from '../src/shared/rng';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false }, HOLD: HeldInput = { moveX: 0, moveY: 0, interactHeld: true };
const room = (id: string) => HOUND.rooms.findIndex((r) => r.id === id);
function quiet(seed = 4): DuelState { const d = createDuel(HOUND, seed); d.tactical.ships[1]!.active = false; return d; }
function withDuel(f: (d: DuelState) => void): void { const d = quiet(); try { f(d); } finally { disposeDuel(d); } }
const place = (d: DuelState, pid: number, x: number, y: number) => { const e = d.interior.crew[pid]!; Position.x[e] = x; Position.y[e] = y; };
const hold = (d: DuelState, ticks: number) => { for (let k = 0; k < ticks; k++) stepDuelTick(d, { held: [HOLD, NONE], commands: [] }); };
const laser = (room: number): DuelEvent => ({ kind: 'laser', ship: 1, hit: true, stripped: false, room, x1: 0, y1: 0, x2: 0, y2: 0 });

describe('engineering spike: breaches and work (spec §4)', () => {
  it('per hit: the fire roll, then the breach roll, two draws; none for a burning room or an active site', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const d = quiet(seed);
      try {
        const point = d.points.find((p) => p.tacticalRoom === Room.Weapons)!, site = siteOfRoom(d, point.room);
        const probe = { ...d.interior.rng.hazards }, fire = nextFloat(probe) < DUEL_FIRE_CHANCE_LASER, breach = nextFloat(probe) < DUEL_BREACH_CHANCE_LASER;
        hitRolls(d, [laser(Room.Weapons)]);
        expect(d.interior.rng.hazards).toEqual(probe);
        expect(d.interior.rooms.fire[point.room]! > 0).toBe(fire);
        expect(d.interior.breaches.active[site]).toBe(breach ? 1 : 0);
        igniteRoom(d.interior, point.room); activateBreach(d.interior, site);
        const still = { ...d.interior.rng.hazards };
        hitRolls(d, [laser(Room.Weapons)]);
        expect(d.interior.rng.hazards).toEqual(still);
      } finally { disposeDuel(d); }
    }
  });
  it('a breach vents its room; patching it at its site tile stops the venting', () => withDuel((d) => {
    const O = room('O'), site = siteOfRoom(d, O);                 // the Hound's O site is (10, 4)
    activateBreach(d.interior, site);
    place(d, 0, 10.5, 5.5);
    hold(d, DUEL_EXTINGUISH_UNITS / 4 - 1);
    expect(roomBreached(d.interior, O)).toBe(true);
    hold(d, 1);
    expect(roomBreached(d.interior, O)).toBe(false);
  }));
  it('a fire in a non-point room is put out at its breach-site tile', () => withDuel((d) => {
    const Q = room('Q');                                          // no repair point; site (15, 5)
    igniteRoom(d.interior, Q); place(d, 0, 15.5, 6.5);
    hold(d, DUEL_EXTINGUISH_UNITS / 4);
    expect(d.interior.rooms.fire[Q]).toBe(0);
  }));
  it('work precedence: fire, then breach, then repair', () => withDuel((d) => {
    const R = room('R'), site = siteOfRoom(d, R);                 // point (4, 11), site (4, 13): both in reach of (4.5, 12.5)
    igniteRoom(d.interior, R); activateBreach(d.interior, site); d.tactical.systems[0].rooms[Room.Shields] = 1;
    place(d, 0, 4.5, 12.5);
    hold(d, 1);
    expect(d.interior.rooms.fireRepair[R]).toBeGreaterThan(0);
    expect(d.interior.breaches.repair[site]).toBe(0); expect(d.repair[Room.Shields]).toBe(0);
    hold(d, DUEL_EXTINGUISH_UNITS / 4);
    expect(d.interior.rooms.fire[R]).toBe(0);
    expect(d.interior.breaches.repair[site]).toBeGreaterThan(0); expect(d.repair[Room.Shields]).toBe(0);
    hold(d, DUEL_EXTINGUISH_UNITS / 4);
    expect(d.interior.breaches.active[site]).toBe(0);
    hold(d, 2);
    expect(d.repair[Room.Shields]).toBeGreaterThan(0);
  }));
  it('low air hurts every conscious character below 25 %, seated ones too, with cause air', () => withDuel((d) => {
    sitDown(d.interior, 1, d.weapons);
    for (let r = 0; r < d.interior.rooms.o2.length; r++) d.interior.rooms.o2[r] = (LOW_AIR_FRAC - 0.01) * d.interior.derived.volume[r]!;
    d.events = [];
    healthPhase(d, []);
    const hurt = d.events.filter((e) => e.kind === 'crewHurt' && e.cause === 'air');
    expect(hurt.map((e) => (e.kind === 'crewHurt' ? e.player : -1)).sort()).toEqual([0, 1]);
    expect(hurt.every((e) => e.kind === 'crewHurt' && Math.abs(e.amount - O2_DAMAGE * DT) < 1e-12)).toBe(true);
  }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engWork.test.ts`
Expected: FAIL, because `hitRolls`, `siteOfRoom` and `LOW_AIR_FRAC` are not exported.

- [ ] **Step 3: Tuning**

Append to `src/renderer/src/sim/duel/tuning.ts`:

```ts
/** Engineering spike spec §4: a qualifying enemy hit (a laser hit by ship 1, a missile on ship 0) rolls a breach in the
 *  struck Room's repair room after its fire roll (rng.hazards, one draw, none if that room's site is already active). */
export const DUEL_BREACH_CHANCE_LASER = 0.2;
export const DUEL_BREACH_CHANCE_MISSILE = 0.5;
/** Engineering spike spec §4: crew in a room below this oxygen fraction lose O2_DAMAGE health a second. */
export const LOW_AIR_FRAC = 0.25;
```

- [ ] **Step 4: Sites, fire tiles, jobs and patching**

Append to `src/renderer/src/sim/duel/hazards.ts`, merging the imports at the top:

```ts
import { repairBreach } from '../hazards/breach';
import { inReachOfTile } from '../interact';
import { DUEL_EXTINGUISH_RATE_SOLO, DUEL_EXTINGUISH_RATE_TEAM, DUEL_EXTINGUISH_UNITS } from './tuning';
import type { RepairPoint } from './state';

/** The room's lowest-index breach site, or −1 (spec §4: the Hound has exactly one per room). */
export function siteOfRoom(d: DuelState, room: number): number {
  const sites = d.interior.derived.siteRoom;
  for (let s = 0; s < sites.length; s++) if (sites[s] === room) return s;
  return -1;
}

/** Spec §4: where a room's fire is fought: its repair point's tile if it has one, else its breach-site tile, else −1. */
export function fireTileOf(d: DuelState, room: number): number {
  const point = d.points.find((p) => p.room === room);
  if (point) return point.tile;
  const s = siteOfRoom(d, room);
  return s >= 0 ? d.interior.derived.siteTile[s]! : -1;
}

/** One worker's job this tick (spec §4 work precedence, Decision 11). */
export type WorkJob =
  | { kind: 'pointFire'; point: RepairPoint }
  | { kind: 'fire'; room: number }
  | { kind: 'breach'; site: number }
  | { kind: 'repair'; point: RepairPoint };

/** The job of a standing worker `eid` in room `here`: the room's fire (at its point, else its breach-site tile), then an
 *  active breach site in reach (ascending), then the point's damaged Room; null when none is in reach. */
export function workJob(d: DuelState, eid: number, here: number): WorkJob | null {
  if (here < 0) return null;
  const st = d.interior, point = d.points.find((p) => p.room === here);
  if (st.rooms.fire[here]! > 0) {
    if (point) { if (inReachOfTile(st, eid, point.tile)) return { kind: 'pointFire', point }; }
    else { const tile = fireTileOf(d, here); if (tile >= 0 && inReachOfTile(st, eid, tile)) return { kind: 'fire', room: here }; }
  }
  const sites = st.derived.siteRoom;
  for (let s = 0; s < sites.length; s++) if (sites[s] === here && st.breaches.active[s] && inReachOfTile(st, eid, st.derived.siteTile[s]!)) return { kind: 'breach', site: s };
  if (point && d.tactical.systems[0].rooms[point.tacticalRoom]! > 0 && inReachOfTile(st, eid, point.tile)) return { kind: 'repair', point };
  return null;
}

/** Spec §4 patching: `workers` add the fire work loop's units to the site's breaches.repair (a 0..1 fraction of
 *  DUEL_EXTINGUISH_UNITS, in whole units); true when the breach is patched (repairBreach). */
export function patchWork(d: DuelState, site: number, workers: number): boolean {
  const done = d.interior.breaches.repair, units = Math.round(done[site]! * DUEL_EXTINGUISH_UNITS) + (workers === 1 ? DUEL_EXTINGUISH_RATE_SOLO : workers * DUEL_EXTINGUISH_RATE_TEAM);
  if (units >= DUEL_EXTINGUISH_UNITS) { repairBreach(d.interior, site); return true; }
  done[site] = units / DUEL_EXTINGUISH_UNITS;
  return false;
}
```

`hazards.ts` imports `type RepairPoint` and `type DuelState` only, so there's no cycle with `state.ts`.

- [ ] **Step 5: Hit rolls and room extinguishing**

In `src/renderer/src/sim/duel/fire.ts`:

(a) Change the tuning import to add `DUEL_BREACH_CHANCE_LASER, DUEL_BREACH_CHANCE_MISSILE`, and add `import { activateBreach } from '../hazards/breach';` and `import { siteOfRoom } from './hazards';`.

(b) Directly after `function hitChance(...) { ... }`, add:

```ts
/** Engineering spike spec §4: a qualifying hit's breach chance (the hits hitChance counts), or 0. */
function breachChance(e: DuelEvent): number {
  if (hitChance(e) === 0) return 0;
  return e.kind === 'laser' ? DUEL_BREACH_CHANCE_LASER : DUEL_BREACH_CHANCE_MISSILE;
}

/** Engineering spike spec §4 (Decision 10): per qualifying hit in event order, the fire roll (none for a burning room;
 *  success ignites and pushes fireStart), then the breach roll on the room's site (none when it has no site or the site
 *  is active; success activates it). Every draw is rng.hazards. */
export function hitRolls(d: DuelState, events: readonly DuelEvent[]): void {
  for (const e of events) {
    if (e.kind !== 'laser' && e.kind !== 'missileEnd') continue;
    const p = hitChance(e);
    if (p === 0) continue;
    const point = d.points.find((q) => q.tacticalRoom === e.room);
    if (!point) continue;
    if (!pointBurning(d, point) && chance(d.interior.rng.hazards, p) && igniteRoom(d.interior, point.room)) d.events.push({ kind: 'fireStart', room: e.room });
    const site = siteOfRoom(d, point.room);
    if (site >= 0 && !d.interior.breaches.active[site] && chance(d.interior.rng.hazards, breachChance(e))) activateBreach(d.interior, site);
  }
}
```

(c) In `firePhase`, replace `  igniteFromHits(d, d.tactical.events);` with `  hitRolls(d, d.tactical.events);   // Engineering spike spec §4: fire then breach, per hit`.

(d) Replace the whole `extinguishWork` function with:

```ts
/** Add `workers` players' extinguish work to a burning room this tick (any room, Engineering spike spec §4); true when
 *  the fire went out. Work is whole units (fireRepair × DUEL_EXTINGUISH_UNITS, rounded back so the fraction never drifts). */
export function extinguishRoomWork(d: DuelState, room: number, workers: number): boolean {
  const done = d.interior.rooms.fireRepair, units = Math.round(done[room]! * DUEL_EXTINGUISH_UNITS) + (workers === 1 ? DUEL_EXTINGUISH_RATE_SOLO : workers * DUEL_EXTINGUISH_RATE_TEAM);
  if (units >= DUEL_EXTINGUISH_UNITS) { extinguishRoom(d.interior, room); return true; }
  done[room] = units / DUEL_EXTINGUISH_UNITS;
  return false;
}

/** A repair point's fire: extinguishRoomWork on its room. */
export function extinguishWork(d: DuelState, p: RepairPoint, workers: number): boolean { return extinguishRoomWork(d, p.room, workers); }
```

- [ ] **Step 6: The work phase**

In `src/renderer/src/sim/duel/step.ts`:

(a) Change `import { extinguishWork, firePhase, pointBurning } from './fire';` to `import { extinguishRoomWork, extinguishWork, firePhase, pointBurning } from './fire';`, and add `patchWork, workJob` to the `./hazards` import.

(b) Replace the whole `repairPhase` function (from its doc comment `/** Each standing, present, conscious player holding Interact inside a damaged or burning room's repair room and in reach` through its closing brace) with:

```ts
/** Each standing, present, conscious player holding Interact does one job (Engineering spike spec §4, Decision 11):
 *  the room's fire (at its repair point, else its breach-site tile), then a breach in reach, then the point's damaged
 *  Room. A burning point room's repair progress holds. Point-room fire and repair work push today's repairWork or
 *  fireWork per worker in player order, then per Room in Room order a repairDone or fireOut (H-0c-ii-a spec §4);
 *  fires in other rooms and breaches push nothing (spec §4 Events). */
function repairPhase(d: DuelState, held: readonly HeldInput[]): void {
  const crewShip = d.tactical.systems[0], workers: number[][] = [[], [], []];
  const fireCrew = new Map<number, number>(), breachCrew = new Map<number, number>();
  for (let pid = 0; pid < d.interior.playerCount; pid++) {
    if (!d.present[pid] || !conscious(d, pid) || seated(d, pid) || !(held[pid] ?? NO_HELD).interactHeld) continue;
    const eid = d.interior.crew[pid]!, job = workJob(d, eid, roomAt(d.interior, Position.x[eid]!, Position.y[eid]!));
    if (!job) continue;
    if (job.kind === 'pointFire' || job.kind === 'repair') {
      workers[job.point.tacticalRoom]!.push(pid);
      d.events.push({ kind: job.kind === 'pointFire' ? 'fireWork' : 'repairWork', player: pid, room: job.point.tacticalRoom });
    } else if (job.kind === 'fire') fireCrew.set(job.room, (fireCrew.get(job.room) ?? 0) + 1);
    else breachCrew.set(job.site, (breachCrew.get(job.site) ?? 0) + 1);
  }
  for (const p of d.points) {
    const r = p.tacticalRoom as 0 | 1 | 2, n = workers[r]!.length;
    if (pointBurning(d, p)) {   // the fire first; the room's repair progress stays put while it burns
      if (n > 0 && extinguishWork(d, p, n)) d.events.push({ kind: 'fireOut', room: r, players: workers[r]! });
      continue;
    }
    if (crewShip.rooms[r] === 0) { d.repair[r] = 0; continue; }
    if (n === 0) continue;
    d.repair[r] += n === 1 ? REPAIR_RATE_SOLO : n * REPAIR_RATE_TEAM;
    if (d.repair[r] >= REPAIR_UNITS) { crewShip.rooms[r]--; crewShip.gunRoomWear[r] = 0; d.repair[r] = 0;   /* Valkyrn spec §7.2 */ d.events.push({ kind: 'repairDone', room: r, players: workers[r]! }); }
  }
  for (const [room, n] of [...fireCrew].sort((a, b) => a[0] - b[0])) extinguishRoomWork(d, room, n);   // Engineering spike spec §4: rooms with no point
  for (const [site, n] of [...breachCrew].sort((a, b) => a[0] - b[0])) patchWork(d, site, n);
}
```

Check that `inReachOfTile` is still used in step.ts. If it is not, remove its import (`import { inReachOfTile } from '../interact';`), or tsc's `noUnusedLocals` will fail.

- [ ] **Step 7: Low air**

In `src/renderer/src/sim/duel/state.ts`, replace `  | { kind: 'crewHurt'; player: number; amount: number; cause: 'fire' | 'hit' }` with `  | { kind: 'crewHurt'; player: number; amount: number; cause: 'fire' | 'hit' | 'air' }   // 'air': Engineering spike spec §4`.

In `src/renderer/src/sim/duel/health.ts`:

(a) Change the tuning import to `import { DEBRIS_CREW_DAMAGE, DT, ENEMY_SHOT_CREW_DAMAGE, FIRE_DAMAGE, HEALTH_MAX, MEDBAY_HEAL, O2_DAMAGE, REACH } from '../tuning';`, and the duel tuning import to `import { DUEL_REVIVE_TICKS, LOW_AIR_FRAC } from './tuning';`.

(b) In `healthPhase`, replace

```ts
    const took = hurt(d, pid, FIRE_DAMAGE * DT);
    if (took > 0) events.push({ kind: 'crewHurt', player: pid, amount: took, cause: 'fire' });
  }
```

with

```ts
    const took = hurt(d, pid, FIRE_DAMAGE * DT);
    if (took > 0) events.push({ kind: 'crewHurt', player: pid, amount: took, cause: 'fire' });
  }
  for (let pid = 0; pid < crewSize(d); pid++) {   // Engineering spike spec §4: low air, after fire, seated or standing
    if (!isConscious(d, pid)) continue;
    const r = roomOf(d, pid);
    if (r < 0 || st.rooms.o2[r]! >= LOW_AIR_FRAC * st.derived.volume[r]!) continue;
    const took = hurt(d, pid, O2_DAMAGE * DT);
    if (took > 0) events.push({ kind: 'crewHurt', player: pid, amount: took, cause: 'air' });
  }
```

and add "then low air (Engineering spike spec §4)" after "fire damage" in the doc comment.

- [ ] **Step 8: Run the tests and the touched suites**

Run: `npx vitest run tests/engWork.test.ts tests/engHazards.test.ts tests/engCommands.test.ts tests/engPower.test.ts tests/duelFire.test.ts tests/duelHealth.test.ts tests/duel.test.ts tests/duelTelemetry.test.ts`, then `npx tsc -b`.

Expected:
- The four eng files PASS.
- Fallout in the rest is fixed by the fallout rule. Any step-level test that counts hazard draws per hit is kind (a): two draws now.
- If any app or render code switches on `crewHurt.cause` exhaustively, tsc flags it. Map `'air'` like `'fire'` in that file, with a spec comment.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/duel/tuning.ts src/renderer/src/sim/duel/fire.ts src/renderer/src/sim/duel/hazards.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/state.ts src/renderer/src/sim/duel/health.ts tests/engWork.test.ts
git commit -m "feat(engineering-spike): breaches from hits and patching, firefighting in every room, work precedence, low-air damage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Add the fallout test files you fixed to the `git add` line by name.

---

### Task 8 (isolated): Engines → 1 bar = 25 % throttle, and the engine factor (spec §10.2)

**Isolation:** everything this task adds lives in:
- the "Engines" section at the end of `sim/tactical/bars.ts`;
- `sim/duel/engines.ts`;
- one call in `clampToCapacity`;
- one line after the ship commands;
- one check in the throttle loop;
- the scripted pair's level;
- `shipEngineFactor` and its two callers.

**Files:**
- Modify: `src/renderer/src/sim/tactical/bars.ts` (append the Engines section)
- Create: `src/renderer/src/sim/duel/engines.ts`
- Modify: `src/renderer/src/sim/duel/power.ts` (clampToCapacity calls clampThrottle)
- Modify: `src/renderer/src/sim/tactical/physics.ts` (flyShip's `factor`, `shipEngineFactor`, flySlot), `src/renderer/src/sim/tactical/predict.ts` (predictFlight)
- Modify: `src/renderer/src/sim/duel/step.ts` (the throttle loop; clampThrottle after the ship commands)
- Modify: `src/renderer/src/sim/duel/scripted.ts:318-320` (the pair's wanted level)
- Modify: `src/renderer/src/sim/duel/scriptedPilot.ts:127-139` (the Valkyrn pilot's levels)
- Test: `tests/engEngines.test.ts`

**Interfaces:**
- Consumes: Task 2's `effectiveBars` and `DuelSystem`; `THROTTLE_MAX`, `THROTTLE_MIN` (`sim/duel/throttle.ts`).
- Produces:
  - `THROTTLE_CAP_BY_BARS`, `ENGINE_FACTOR_BY_BARS`, `throttleCap(sys): number`, `throttleAllowed(sys, level): boolean`, `levelWithinCap(sys, level): number` (bars.ts);
  - `clampThrottle(d: DuelState): void` (engines.ts);
  - `shipEngineFactor(state, i): number` (physics.ts);
  - `flyShip(s, axes, tuning, engines = 0, cls = CUTTER_CLASS, factor = engineFactor(cls, engines))`.

- [ ] **Step 1: Write the failing test**

Create `tests/engEngines.test.ts`:

```ts
// Engineering spike spec §10.2 (Amendment 2; §9.1's rules stand): 1 Engines bar = 25 % throttle (cap = bars, to 4), the
// engine factor [0, 1, 1, 1, 1, 1.25]; a throttle above the cap is unavailable; reverse needs a bar; the stored throttle
// is lowered to the cap the same tick; the prediction flies as the ship does.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { clampToCapacity, DuelSystem } from '../src/renderer/src/sim/duel/power';
import { throttleCap } from '../src/renderer/src/sim/tactical/bars';
import { flySlot, shipEngineFactor } from '../src/renderer/src/sim/tactical/physics';
import { predictFlight } from '../src/renderer/src/sim/tactical/predict';
import { cloneShip, createTacticalState, Room } from '../src/renderer/src/sim/tactical/state';
import { DEFAULT_FLIGHT } from '../src/renderer/src/sim/tactical/tuning';
import { sitDown } from '../src/renderer/src/sim/stations';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const env = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[]) => stepDuelTick(d, { held: [NONE, NONE], commands });

describe('engineering spike: Engines bars (spec §10.2)', () => {
  it('the cap and the factor by bars; damage 2 is off at once', () => {
    const s = createTacticalState(2), sys = s.systems[0];
    expect([0, 1, 2, 3, 4, 5].map((b) => { sys.bars[DuelSystem.Engines] = b; return [throttleCap(sys), shipEngineFactor(s, 0)]; }))
      .toEqual([[0, 0], [1, 1], [2, 1], [3, 1], [4, 1], [4, 1.25]]);
    sys.bars[DuelSystem.Engines] = 3; sys.rooms[Room.Engines] = 2;
    expect(throttleCap(sys)).toBe(0); expect(shipEngineFactor(s, 0)).toBe(0);
  });
  it('the prediction flies exactly as the ship does at the overdrive factor', () => {
    const s = createTacticalState(2);
    s.systems[0].bars[DuelSystem.Engines] = 5;
    const axes = { turn: 1, thrust: 1 }, path = predictFlight(s, 0, axes, 30, 1).points, ship = cloneShip(s.ships[0]);
    const live = { ...s, ships: [ship, s.ships[1]] as typeof s.ships };
    for (let k = 0; k < 30; k++) flySlot(live, 0, axes, DEFAULT_FLIGHT);
    expect(path[path.length - 1]).toEqual({ x: ship.x, y: ship.y });
  });
  it('a throttle above the cap is unavailable; reverse needs a bar; a lowered cap lowers the stored throttle the same tick', () => {
    const d = createDuel(HOUND, 5);
    try {
      sitDown(d.interior, 0, d.nav);
      expect(step(d, [env(d, 0, { kind: 'throttle', level: 4 })])[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });   // start: 3 bars, 75 %
      expect(step(d, [env(d, 0, { kind: 'throttle', level: 3 })])[0]).toMatchObject({ status: 'applied' });
      const less = () => step(d, [env(d, 1, { kind: 'shipPower', system: DuelSystem.Engines, delta: -1 })]);
      less(); expect(d.throttle).toBe(2);
      less(); expect(d.throttle).toBe(1);
      less(); expect(d.throttle).toBe(0);
      expect(step(d, [env(d, 0, { kind: 'throttle', level: -1 })])[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
      d.tactical.systems[0].bars[DuelSystem.Engines] = 2; d.throttle = -1;
      d.tactical.systems[0].rooms[Room.Engines] = 2; clampToCapacity(d);
      expect(d.throttle).toBe(0);                                         // damage to 0 bars: a reverse throttle becomes 0
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engEngines.test.ts`
Expected: FAIL, because `throttleCap` and `shipEngineFactor` are not exported.

- [ ] **Step 3: The Engines section of `bars.ts`**

Append to `src/renderer/src/sim/tactical/bars.ts`:

```ts
// ---- Engines (Task 8; Engineering spike spec §10.2, Amendment 2; isolated) ----
/** Spec §10.2: the top forward throttle level at each effective Engines bar count 0..5: 1 bar = 25 %, capped at 4. */
export const THROTTLE_CAP_BY_BARS: readonly number[] = [0, 1, 2, 3, 4, 4];
/** Spec §10.2: the thrust and turn factor at each effective Engines bar count; the overdrive bar adds 25 %. */
export const ENGINE_FACTOR_BY_BARS: readonly number[] = [0, 1, 1, 1, 1, 1.25];
/** The crew ship's top forward throttle level now. */
export function throttleCap(sys: Pick<ShipSystems, 'rooms' | 'bars'>): number { return THROTTLE_CAP_BY_BARS[effectiveBars(sys, DuelSystem.Engines)]!; }
/** Whether throttle `level` is allowed now: up to the cap, and reverse (−1) only with a bar (a cap above 0). */
export function throttleAllowed(sys: Pick<ShipSystems, 'rooms' | 'bars'>, level: number): boolean {
  const cap = throttleCap(sys);
  return level === -1 ? cap > 0 : level <= cap;
}
/** The nearest allowed level to `level` (the bots' throttle, Decision 16): itself, else the cap for forward, else 0. */
export function levelWithinCap(sys: Pick<ShipSystems, 'rooms' | 'bars'>, level: number): number {
  return throttleAllowed(sys, level) ? level : level > 0 ? throttleCap(sys) : 0;
}
```

- [ ] **Step 4: `sim/duel/engines.ts` and the clamp**

Create `src/renderer/src/sim/duel/engines.ts`:

```ts
// Engineering spike spec §10.2 (Amendment 2; §9.1's clamp stands), Task 8, isolated: the Helm throttle follows the
// Engines bars. When the cap falls (bars removed, damage, failure) the stored throttle drops to it the same tick; at 0
// bars a reverse becomes 0.
import { throttleCap } from '../tactical/bars';
import type { DuelState } from './state';

export function clampThrottle(d: DuelState): void {
  const cap = throttleCap(d.tactical.systems[0]);
  if (d.throttle > cap) d.throttle = cap;
  else if (d.throttle === -1 && cap === 0) d.throttle = 0;
}
```

In `src/renderer/src/sim/duel/power.ts`:
- add `import { clampThrottle } from './engines';`;
- in `clampToCapacity`, replace `  for (let k = 0; k < DUEL_SYSTEM_COUNT; k++) { const cap = capacityOf(d, k); if (b[k]! > cap) b[k] = cap; }` with:

```ts
  for (let k = 0; k < DUEL_SYSTEM_COUNT; k++) { const cap = capacityOf(d, k); if (b[k]! > cap) b[k] = cap; }
  clampThrottle(d);   // Task 8, spec §10.2
```

- [ ] **Step 5: Flight and prediction read the factor**

In `src/renderer/src/sim/tactical/physics.ts`:

(a) Change `import { classOf, Room, type Axes, type Ship, type TacticalState } from './state';` to `import { classOf, CREW_SLOT, Room, type Axes, type Ship, type TacticalState } from './state';`, and add `import { DuelSystem, effectiveBars, ENGINE_FACTOR_BY_BARS } from './bars';`.

(b) Replace

```ts
export function flyShip(s: Ship, axes: Axes, tuning: FlightTuning, engines = 0, cls: ShipClassDef = CUTTER_CLASS): void {
```

with

```ts
export function flyShip(s: Ship, axes: Axes, tuning: FlightTuning, engines = 0, cls: ShipClassDef = CUTTER_CLASS, factor = engineFactor(cls, engines)): void {
```

and `  const f = engineFactor(cls, engines);` with `  const f = factor;   // Engineering spike Decision 7: flySlot and predictFlight pass shipEngineFactor`.

(c) Replace

```ts
/** Ship slot i's flight for one tick: its body, its Engines level and its class. */
export function flySlot(state: TacticalState, i: number, axes: Axes, tuning: FlightTuning): void {
  flyShip(state.ships[i]!, axes, tuning, state.systems[i]!.rooms[Room.Engines], classOf(state, i));
}
```

with

```ts
/** Engineering spike spec §10.2 (Task 8): ship i's thrust and turn factor: the crew slot's from its effective Engines
 *  bars (times its class's undamaged factor, 1 for every class today), any other slot's from its Engines level as before. */
export function shipEngineFactor(state: TacticalState, i: number): number {
  const sys = state.systems[i]!, cls = classOf(state, i);
  return i === CREW_SLOT ? cls.engineFactor[0]! * ENGINE_FACTOR_BY_BARS[effectiveBars(sys, DuelSystem.Engines)]! : engineFactor(cls, sys.rooms[Room.Engines]);
}

/** Ship slot i's flight for one tick: its body, its engine factor and its class. */
export function flySlot(state: TacticalState, i: number, axes: Axes, tuning: FlightTuning): void {
  flyShip(state.ships[i]!, axes, tuning, state.systems[i]!.rooms[Room.Engines], classOf(state, i), shipEngineFactor(state, i));
}
```

In `src/renderer/src/sim/tactical/predict.ts`:
- change `import { flyShip } from './physics';` to `import { flyShip, shipEngineFactor } from './physics';`;
- replace `  const cls = classOf(state, shipIndex), engines = state.systems[shipIndex]!.rooms[Room.Engines];` with `  const cls = classOf(state, shipIndex), engines = state.systems[shipIndex]!.rooms[Room.Engines], factor = shipEngineFactor(state, shipIndex);   // Task 8`;
- replace `    flyShip(s, axes, tuning, engines, cls);` with `    flyShip(s, axes, tuning, engines, cls, factor);`.

- [ ] **Step 6: The step's throttle check and clamp**

In `src/renderer/src/sim/duel/step.ts`:

(a) Add `import { throttleAllowed } from '../tactical/bars';` and `import { clampThrottle } from './engines';`.

(b) Replace

```ts
    if (!validThrottle(level)) { result(e, 'malformed'); continue; }
```

with

```ts
    if (!validThrottle(level)) { result(e, 'malformed'); continue; }
    if (!throttleAllowed(d.tactical.systems[0], level)) { result(e, 'unavailable'); continue; }   // Task 8, spec §10.2: the Engines cap
```

(c) Directly after the closing `}` of the ship-commands loop (`for (const e of shipCommands) { ... }`, from Task 5), add:

```ts
  clampThrottle(d);   // Task 8, spec §10.2: an Engines bar removed this tick lowers the throttle before the axes read it
```

- [ ] **Step 7: The scripted pair stays within the cap (Decision 16)**

In `src/renderer/src/sim/duel/scripted.ts`:
- add `import { levelWithinCap } from '../tactical/bars';`;
- replace

```ts
      const level = axes.thrust > 0 ? THROTTLE_MAX : axes.thrust < 0 ? THROTTLE_MIN : 0;
```

with

```ts
      const level = levelWithinCap(d.tactical.systems[0], axes.thrust > 0 ? THROTTLE_MAX : axes.thrust < 0 ? THROTTLE_MIN : 0);   // Engineering spike Decision 16: within the Engines cap (3 at the start)
```

In `src/renderer/src/sim/duel/scriptedPilot.ts` (the Valkyrn pilot; `flight` returns THROTTLE_MAX at `:79`, `:86`, `:92` (via `levelOf`) and `:104`, and `runValkyrnDuel`'s `requireApplied` throws on any refusal):
- add `import { levelWithinCap } from '../tactical/bars';`;
- in `scriptedPilotInput`, replace

```ts
        if (d.throttle !== PILOT_AWAY_THROTTLE) {
          cmds.push({ kind: 'throttle', level: PILOT_AWAY_THROTTLE });
```

with

```ts
        const away = levelWithinCap(sys, PILOT_AWAY_THROTTLE);   // Engineering spike Decision 16
        if (d.throttle !== away) {
          cmds.push({ kind: 'throttle', level: away });
```

- and replace

```ts
      if (f.level !== d.throttle) cmds.push({ kind: 'throttle', level: f.level });
```

with

```ts
      const level = levelWithinCap(sys, f.level);   // Engineering spike Decision 16: within the Engines cap
      if (level !== d.throttle) cmds.push({ kind: 'throttle', level });
```

(`sys` is `d.tactical.systems[0]`, already declared at the top of `scriptedPilotInput`.)

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/engEngines.test.ts tests/engPower.test.ts tests/engCommands.test.ts tests/disabledSystems.test.ts tests/duelThrottle.test.ts tests/feelIiModels.test.ts tests/duelScripted.test.ts tests/scriptedPilot.test.ts tests/duelGates.test.ts`, then `npx tsc -b`. A scripted throttle refused `unavailable` (thrown by `requireApplied`) is a bug in Step 7, not fallout. A duelGates band out of range is fallout kind (c).
Expected: the eng files PASS. Fix the others by the fallout rule. A ship-0 Engines-level table assertion, or a throttle-4 command expected `applied` at the start, is kind (a). `tsc -b` is clean.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/tactical/bars.ts src/renderer/src/sim/duel/engines.ts src/renderer/src/sim/duel/power.ts src/renderer/src/sim/tactical/physics.ts src/renderer/src/sim/tactical/predict.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/scripted.ts src/renderer/src/sim/duel/scriptedPilot.ts tests/engEngines.test.ts
git commit -m "feat(engineering-spike): Engines bars cap the Helm throttle at 25 % a bar and set the engine factor (Amendment 2, isolated)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Add the fallout test files you fixed to the `git add` line by name.

---

### Task 9a (isolated): Weapons → the officer's allocation: bars per weapon, `weaponPower`, the trim (spec §10.3)

**Isolation:** this task adds only the allocation:
- the first part of the "Weapons" section of `sim/tactical/bars.ts`;
- `ShipSystems.weaponPower` and its field;
- `sim/duel/weaponSlots.ts`;
- one call in `clampToCapacity`;
- the `weaponPower` command.
Nothing reads the allocation until Task 9b.

**Files:**
- Modify: `src/renderer/src/sim/tactical/bars.ts` (append the Weapons allocation section)
- Modify: `src/renderer/src/sim/tactical/state.ts` (ShipSystems.weaponPower, systemsFor, emptySystems)
- Modify: `src/renderer/src/sim/tactical/hash.ts` (the field, its rule, clone)
- Create: `src/renderer/src/sim/duel/weaponSlots.ts`
- Modify: `src/renderer/src/sim/duel/power.ts` (clampToCapacity, powerModule commands and reasons)
- Modify: `src/renderer/src/net/contracts.ts`, `src/renderer/src/net/codec.ts` (the command)
- Modify: `src/renderer/src/sim/duel/step.ts` (DUEL_KINDS, the weaponPower loop)
- Modify: `tests/tacticalDeterminism.test.ts`, `tests/duelModules.test.ts:150`, `tests/duelCheckpoint.test.ts:143`
- Test: `tests/engWeaponPower.test.ts`

**Interfaces:**
- Consumes: Task 2's `effectiveBars`, `DuelSystem`, `SYSTEM_MAX`.
- Produces:
  - `WeaponSlot = { Pew: 0, Beam: 1, Torpedo: 2 }`, `WEAPON_SLOTS = 3`, `WEAPON_BAR_MAX = 3`, `START_WEAPON_POWER = [1, 0, 1]`;
  - `weaponBarsUsable(sys)`, `trimmedWeaponPower(sys): number[]`, `weaponBars(sys, slot): number` (bars.ts);
  - `ShipSystems.weaponPower: number[]` (0..4 each);
  - `applyWeaponPower(d, slot, delta): 'applied' | 'unavailable'` and `clampWeaponPower(d)` (weaponSlots.ts);
  - the command `{ kind: 'weaponPower'; slot: number; delta: number }`.

- [ ] **Step 1: Write the failing test**

Create `tests/engWeaponPower.test.ts`:

```ts
// Engineering spike spec §10.3 (Amendment 2): the Weapons officer splits the Weapons bars across pew pew, the beam and
// the torpedo, 0..3 each, a 4th only with the overdrive bar; bars come off the highest slot first, the overdrive bar
// first; weaponPower is the Weapons seat's (stale, seat, malformed, unavailable).
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { applyPower, clampToCapacity, DuelSystem } from '../src/renderer/src/sim/duel/power';
import { trimmedWeaponPower, WeaponSlot } from '../src/renderer/src/sim/tactical/bars';
import { createTacticalState, Room } from '../src/renderer/src/sim/tactical/state';
import { sitDown } from '../src/renderer/src/sim/stations';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const env = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[]) => stepDuelTick(d, { held: [NONE, NONE], commands });
const wp = (d: DuelState) => d.tactical.systems[0].weaponPower;

describe('engineering spike: the Weapons allocation (spec §10.3)', () => {
  it('the round starts pew pew 1, beam 0, torpedo 1; the Hunter holds none', () => {
    const s = createTacticalState(1);
    expect(s.systems[0].weaponPower).toEqual([1, 0, 1]);
    expect(s.systems[1].weaponPower).toEqual([0, 0, 0]);
  });
  it('the trim: the overdrive bar first, then the highest slot down, one bar at a time, at once through effectiveBars', () => {
    const s = createTacticalState(1), sys = s.systems[0];
    sys.bars[DuelSystem.Weapons] = 10; sys.weaponPower = [3, 3, 4];
    expect(trimmedWeaponPower(sys)).toEqual([3, 3, 4]);
    sys.bars[DuelSystem.Weapons] = 9;
    expect(trimmedWeaponPower(sys)).toEqual([3, 3, 3]);                  // the 4th bar goes first
    sys.bars[DuelSystem.Weapons] = 7;
    expect(trimmedWeaponPower(sys)).toEqual([3, 3, 1]);                  // then the torpedo
    sys.bars[DuelSystem.Weapons] = 10; sys.rooms[Room.Weapons] = 1;      // damage 1: capacity 5
    expect(trimmedWeaponPower(sys)).toEqual([3, 2, 0]);
  });
  it('weaponPower: the seat, the slot and delta, a free bar, below 3 (4 only with the overdrive bar); −1 at 0 is unavailable', () => {
    const d = createDuel(HOUND, 9);
    try {
      expect(step(d, [env(d, 0, { kind: 'weaponPower', slot: WeaponSlot.Beam, delta: 1 })])[0]).toMatchObject({ status: 'rejected', reason: 'not-at-weapons' });
      sitDown(d.interior, 1, d.weapons);
      for (const bad of [{ slot: 3, delta: 1 }, { slot: 0, delta: 2 }])
        expect(step(d, [env(d, 1, { kind: 'weaponPower', ...bad })])[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Beam, delta: 1 })])[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });   // 2 bars, 2 spent
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Beam, delta: -1 })])[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });  // the beam holds 0
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Torpedo, delta: -1 })])[0]).toMatchObject({ status: 'applied' });
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Beam, delta: 1 })])[0]).toMatchObject({ status: 'applied' });
      expect(wp(d)).toEqual([1, 1, 0]);
      applyPower(d, DuelSystem.Weapons, 1);                                // the one spare bar: 3 Weapons bars
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Pew, delta: 1 })])[0]).toMatchObject({ status: 'applied' });
      expect(wp(d)).toEqual([2, 1, 0]);
      applyPower(d, DuelSystem.Weapons, -1); applyPower(d, DuelSystem.Weapons, -1); clampToCapacity(d);
      expect(wp(d)).toEqual([1, 0, 0]);                                   // the beam's bar goes before pew pew's
    } finally { disposeDuel(d); }
  });
  it('a 4th bar only with the overdrive bar, and only on one weapon', () => {
    const d = createDuel(HOUND, 9);
    try {
      const sys = d.tactical.systems[0];
      sys.bars = [0, 10, 0, 0, 0]; sys.weaponPower = [3, 3, 3];
      sitDown(d.interior, 1, d.weapons);
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Pew, delta: 1 })])[0]).toMatchObject({ status: 'applied' });
      expect(wp(d)).toEqual([4, 3, 3]);
      sys.bars[DuelSystem.Weapons] = 9; sys.weaponPower = [3, 3, 2];
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Torpedo, delta: 1 })])[0]).toMatchObject({ status: 'applied' });
      expect(step(d, [env(d, 1, { kind: 'weaponPower', slot: WeaponSlot.Torpedo, delta: 1 })])[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });   // 9 bars: no 4th
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engWeaponPower.test.ts`
Expected: FAIL, because `weaponPower` and `trimmedWeaponPower` do not exist.

- [ ] **Step 3: The Weapons allocation section of `bars.ts`**

Append to `src/renderer/src/sim/tactical/bars.ts`:

```ts
// ---- Weapons, the allocation (Task 9a; Engineering spike spec §10.3, Amendment 2; isolated) ----
/** Spec §10.3: the three crew weapons in slot order: pew pew (a burst laser), the beam (today's laser), the torpedo. */
export const WeaponSlot = { Pew: 0, Beam: 1, Torpedo: 2 } as const;
export const WEAPON_SLOTS = 3;
/** A weapon's bars without the overdrive bar; the overdrive bar can be one weapon's 4th (spec §10.3). */
export const WEAPON_BAR_MAX = 3;
/** Spec §10.3: the round starts pew pew 1, beam 0, torpedo 1 (2 Weapons bars). */
export const START_WEAPON_POWER: readonly number[] = [1, 0, 1];
type WeaponSys = Pick<ShipSystems, 'rooms' | 'bars' | 'weaponPower'>;
/** The Weapons bars the officer can spend now (the effective Weapons bars). */
export function weaponBarsUsable(sys: Pick<ShipSystems, 'rooms' | 'bars'>): number { return effectiveBars(sys, DuelSystem.Weapons); }
/** Spec §10.3 (Decision 17): the bars each weapon stands on now. Without the overdrive bar (usable ≤ 9) no weapon keeps a
 *  4th; then while more are spent than usable, one bar comes off the highest slot that has one (torpedo, beam, pew pew). */
export function trimmedWeaponPower(sys: WeaponSys): number[] {
  const usable = weaponBarsUsable(sys), t = sys.weaponPower.slice();
  if (usable <= SYSTEM_MAX[DuelSystem.Weapons]!) for (let k = 0; k < WEAPON_SLOTS; k++) if (t[k]! > WEAPON_BAR_MAX) t[k] = WEAPON_BAR_MAX;
  let spent = t[0]! + t[1]! + t[2]!;
  for (let k = WEAPON_SLOTS - 1; k >= 0 && spent > usable;) { if (t[k]! > 0) { t[k] = t[k]! - 1; spent--; } else k--; }
  return t;
}
/** The bars weapon `slot` stands on now (trimmed). */
export function weaponBars(sys: WeaponSys, slot: number): number { return trimmedWeaponPower(sys)[slot]!; }
```

- [ ] **Step 4: `ShipSystems.weaponPower`, hashed**

In `src/renderer/src/sim/tactical/state.ts`:
- extend the bars import to `import { DUEL_SYSTEM_COUNT, SHIELD_LAYERS_BY_BARS, START_BARS, START_WEAPON_POWER, WEAPON_SLOTS } from './bars';`;
- in `ShipSystems`, after the `bars: number[];` member, add:

```ts
  /** Engineering spike spec §10.3: the Weapons bars the officer gave each weapon (pew pew, beam, torpedo; 0..3, or 4 with
   *  the overdrive bar). The crew slot starts at START_WEAPON_POWER, every other slot at zeros (never read). Readers trim it. */
  weaponPower: number[];
```

- in `systemsFor`, replace `    bars: crew ? [...START_BARS] : Array<number>(DUEL_SYSTEM_COUNT).fill(0)   // Engineering spike spec §2` with:

```ts
    bars: crew ? [...START_BARS] : Array<number>(DUEL_SYSTEM_COUNT).fill(0),   // Engineering spike spec §2
    weaponPower: crew ? [...START_WEAPON_POWER] : Array<number>(WEAPON_SLOTS).fill(0)   // spec §10.3
```

- in `emptySystems`, replace `    bars: Array<number>(DUEL_SYSTEM_COUNT).fill(0) };` with `    bars: Array<number>(DUEL_SYSTEM_COUNT).fill(0), weaponPower: Array<number>(WEAPON_SLOTS).fill(0) };`.

In `src/renderer/src/sim/tactical/hash.ts`:
- extend the bars import to `import { DUEL_SYSTEM_COUNT, SYSTEM_SLOTS, WEAPON_BAR_MAX, WEAPON_SLOTS } from './bars';`;
- after the `systems.${i}.bars` vector line, add `    fields.push(vector(`systems.${i}.weaponPower`, WEAPON_SLOTS, (s) => s.systems[i]!.weaponPower));   // spec §10.3`;
- in `systemsRules`, replace `  bars: within(0, Math.max(...SYSTEM_SLOTS))   // Engineering spike spec §2, §10.1: 0..10 per system` with the two lines `  bars: within(0, Math.max(...SYSTEM_SLOTS)),   // Engineering spike spec §2, §10.1: 0..10 per system` and `  weaponPower: within(0, WEAPON_BAR_MAX + 1)   // spec §10.3`;
- in `cloneTacticalFromModule`, change `bars: [0, 0, 0, 0, 0] }` to `bars: [0, 0, 0, 0, 0], weaponPower: [0, 0, 0] }`.

In `tests/tacticalDeterminism.test.ts`:
- add `'weaponPower'` at the end of the sorted systems key list;
- change `2 * 42` to `2 * 45`, appending `and the 3 weaponPower values` to the comment.

- [ ] **Step 5: `sim/duel/weaponSlots.ts` and the clamp**

Create `src/renderer/src/sim/duel/weaponSlots.ts`:

```ts
// Engineering spike spec §10.3 (Amendment 2), Task 9a, isolated: the Weapons officer moves bars between pew pew, the
// beam and the torpedo. Writing always stores the trimmed values first, so bars lost to damage never come back by
// themselves.
import { SYSTEM_MAX, DuelSystem, trimmedWeaponPower, WEAPON_BAR_MAX, weaponBarsUsable } from '../tactical/bars';
import type { DuelState } from './state';

/** `weaponPower` (slot 0..2, delta ±1, both valid). +1 needs an unspent Weapons bar and the weapon below 3, or below 4
 *  while the Weapons system holds its overdrive bar and no weapon has a 4th yet. −1 needs a bar on the weapon. */
export function applyWeaponPower(d: DuelState, slot: number, delta: number): 'applied' | 'unavailable' {
  const sys = d.tactical.systems[0], t = trimmedWeaponPower(sys), now = t[slot]!;
  if (delta === -1) {
    if (now === 0) return 'unavailable';
  } else {
    const usable = weaponBarsUsable(sys), spent = t[0]! + t[1]! + t[2]!;
    const top = usable > SYSTEM_MAX[DuelSystem.Weapons]! && !t.some((b) => b > WEAPON_BAR_MAX) ? WEAPON_BAR_MAX + 1 : WEAPON_BAR_MAX;
    if (spent >= usable || now >= top) return 'unavailable';
  }
  for (let k = 0; k < t.length; k++) sys.weaponPower[k] = t[k]!;
  sys.weaponPower[slot] = now + delta;
  return 'applied';
}

/** Spec §10.3: clampToCapacity writes the trimmed values back. */
export function clampWeaponPower(d: DuelState): void {
  const sys = d.tactical.systems[0], t = trimmedWeaponPower(sys);
  for (let k = 0; k < t.length; k++) sys.weaponPower[k] = t[k]!;
}
```

In `src/renderer/src/sim/duel/power.ts`:
- add `import { clampWeaponPower } from './weaponSlots';`;
- in `clampToCapacity`, after `  clampThrottle(d);   // Task 8, spec §10.2`, add `  clampWeaponPower(d);   // Task 9a, spec §10.3`;
- in `powerModule`, change `commands` to `['shipPower', 'shipCoolant', 'shipDoor', 'shipAirlock', 'weaponPower']` and `reasons` to `['stale-tick', 'not-at-weapons', 'malformed', 'unavailable', 'duel-decided']`.

- [ ] **Step 6: The command on the wire and in the step**

In `src/renderer/src/net/contracts.ts`, after `  | { kind: 'shipAirlock'; index: number }` add:

```ts
  /** Engineering spike spec §10.3: the Weapons seat moves one bar onto (+1) or off (−1) weapon slot 0..2 (pew pew, beam,
   *  torpedo). The sim checks the ranges. */
  | { kind: 'weaponPower'; slot: number; delta: number }
```

In `src/renderer/src/net/codec.ts`, after the `shipAirlock` schema line, add `      z.object({ kind: z.literal('weaponPower'), slot: z.number().int(), delta: z.number().int() }).strict(),   // spec §10.3`.

In `src/renderer/src/sim/duel/step.ts`:

(a) Add `import { WEAPON_SLOTS } from '../tactical/bars';` (merge it with the existing `../tactical/bars` import) and `import { applyWeaponPower } from './weaponSlots';`.

(b) In `DUEL_KINDS`, change `  'shipPower', 'shipCoolant', 'shipDoor', 'shipAirlock'];   // Engineering spike spec §7` to `  'shipPower', 'shipCoolant', 'shipDoor', 'shipAirlock', 'weaponPower'];   // Engineering spike spec §7, §10.3`.

(c) Directly after the ship-commands loop's closing `}`, and before Task 8's `clampThrottle(d);` line, add:

```ts
  // Task 9a, spec §10.3: weaponPower from the Weapons seat's attendant, in (player, sequence) order: stale, the seat,
  // the slot and delta, then the allocation rules.
  for (const e of input.commands.filter((x) => x.command.kind === 'weaponPower').sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence)) {
    const c = e.command;
    if (c.kind !== 'weaponPower') continue;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (gunner < 0 || e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }
    if (!Number.isInteger(c.slot) || c.slot < 0 || c.slot >= WEAPON_SLOTS || (c.delta !== 1 && c.delta !== -1)) { result(e, 'malformed'); continue; }
    if (applyWeaponPower(d, c.slot, c.delta) === 'applied') result(e); else result(e, 'unavailable');
  }
```

In `tests/duelModules.test.ts:150`, add `'weaponPower'` at the end of the sorted kind list. In `tests/duelCheckpoint.test.ts:143`, add `weaponPower: { kind: 'weaponPower', slot: 1, delta: 1 }` to `examples`.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/engWeaponPower.test.ts tests/engBars.test.ts tests/engPower.test.ts tests/engCommands.test.ts tests/tacticalDeterminism.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts`, then `npx tsc -b`.
Expected: all PASS, and `tsc -b` is clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/tactical/bars.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/duel/weaponSlots.ts src/renderer/src/sim/duel/power.ts src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/sim/duel/step.ts tests/engWeaponPower.test.ts tests/tacticalDeterminism.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts
git commit -m "feat(engineering-spike): the Weapons officer splits the Weapons bars across three weapons (weaponPower, the trim; Amendment 2, isolated)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9b (isolated): Weapons → pew pew, the beam and the torpedo by their bars (spec §10.3)

**Isolation:** everything this task adds lives in:
- the second part of the "Weapons" section of `bars.ts`;
- the six pew fields on `ShipSystems`;
- the rewritten `sim/tactical/weapons.ts`;
- the torpedo's levels in `missiles.ts`;
- the `weapon` field of the laser commands;
- the laser event's optional `weapon`.
The Hunter's laser and torpedo are unchanged.

**Files:**
- Modify: `src/renderer/src/sim/tactical/bars.ts` (append the Weapons effects section)
- Modify: `src/renderer/src/sim/tactical/state.ts` (the pew fields; the laser event's `weapon?`)
- Modify: `src/renderer/src/sim/tactical/hash.ts` (the pew fields, rules)
- Replace: `src/renderer/src/sim/tactical/weapons.ts` (the whole file, below)
- Modify: `src/renderer/src/sim/tactical/missiles.ts` (`land`: the crew torpedo's levels)
- Modify: `src/renderer/src/net/contracts.ts`, `src/renderer/src/net/codec.ts` (the laser commands' `weapon`)
- Modify: `src/renderer/src/sim/duel/step.ts` (the laser commands fold into `pewLock` and `pewCharge`)
- Modify: `src/renderer/src/sim/duel/scripted.ts` (the Helm and gunner treat pew pew as the primary weapon), `src/renderer/src/sim/duel/telemetry.ts:161` (weaponsIdleTicks counts either barrel)
- Modify: `tests/tacticalDeterminism.test.ts`, `tests/duelModules.test.ts:58`
- Test: `tests/engWeapons.test.ts`

**Interfaces:**
- Consumes: Task 9a's `weaponBars` and `WeaponSlot`; Task 3's shield tables.
- Produces:
  - `BEAM_SHOTS_BY_BARS`, `BEAM_RATE_BY_BARS`, `PEW_SHOTS_BY_BARS`, `PEW_RATE_BY_BARS`, `TORPEDO_RELOAD_BY_BARS`, `TORPEDO_LEVELS_BY_BARS`, `MAGAZINE_REGEN_UNITS` (bars.ts);
  - `type Barrel = 'beam' | 'pew'`, `barrelShots(state, i, barrel)`, `laserFull(state, i, barrel = 'beam')`, `laserOffline(state, i, barrel = 'beam')`, `crewSees(state, j)` (weapons.ts; Task 10 replaces the body of `crewSees`);
  - `ShipInput.pewLock?` and `pewCharge?`;
  - `ShipSystems.pewCharge`, `pewHold`, `pewLock`, `pewTargeted`, `pewBurst`, `pewBurstClock`;
  - the laser commands' `weapon?: 'beam' | 'pew'`.

- [ ] **Step 1: Write the failing test**

Create `tests/engWeapons.test.ts`:

```ts
// Engineering spike spec §10.3 (Amendment 2): pew pew (a second laser on today's rules and its own state: 2/3/3 shots,
// charge 27/27/40), the beam (today's laser: 1/2/2 shots, charge 40/40/60), the torpedo (reload 4/6/8, 3 bars → hits
// raise the Room 2 levels), the overdrive 4th bar (3's effect at 1.25× the rate), 0 bars off; the Hunter unchanged.
import { describe, expect, it } from 'vitest';
import { barrelShots, canLaunch, IDLE_INPUT, laserOffline, tickWeapons, applyWeaponsInput, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { MAGAZINE_REGEN_UNITS, WeaponSlot } from '../src/renderer/src/sim/tactical/bars';
import { createTacticalState, placeMissile, Room, type DuelEvent, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { resolveMissiles } from '../src/renderer/src/sim/tactical/missiles';
import { LASER_BURST_GAP_TICKS, LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { makeHostile } from './helpers/hostile';

/** The crew facing the enemy 300 units east, in arc and range, no asteroids (tests/weaponsUpdate.test.ts's idiom). */
function facing(): TacticalState {
  const st = makeHostile(createTacticalState(5));
  st.map = { ...st.map, asteroids: [] };
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  return st;
}
function tick(st: TacticalState, input: ShipInput = IDLE_INPUT): Extract<DuelEvent, { kind: 'laser' }>[] {
  st.events = [];
  applyWeaponsInput(st, 0, input); tickWeapons(st, 0, input);
  st.tick++;
  return st.events.filter((e): e is Extract<DuelEvent, { kind: 'laser' }> => e.kind === 'laser' && e.ship === 0);
}
/** All of ship 0's laser events over n ticks. */
function volley(st: TacticalState, n: number): Extract<DuelEvent, { kind: 'laser' }>[] { const out = []; for (let k = 0; k < n; k++) out.push(...tick(st)); return out; }

describe('engineering spike: three weapons (spec §10.3)', () => {
  it('shots by bars: pew pew 0/2/3/3/3, the beam 0/1/2/2/2; 0 bars is offline', () => {
    const st = createTacticalState(1), sys = st.systems[0];
    expect([0, 1, 2, 3, 4].map((b) => { sys.weaponPower = [b, b, 0]; sys.bars[1] = 10; return [barrelShots(st, 0, 'pew'), barrelShots(st, 0, 'beam')]; }))
      .toEqual([[0, 0], [2, 1], [3, 2], [3, 2], [3, 2]]);
    sys.weaponPower = [1, 0, 1]; sys.bars[1] = 2;
    expect(laserOffline(st, 0, 'beam')).toBe(true); expect(laserOffline(st, 0, 'pew')).toBe(false);
  });
  it('the round start: pew pew fires a 2-shot volley on its own (auto-fire), the beam stays dark', () => {
    const st = facing();
    const shots = volley(st, 1 + LASER_BURST_GAP_TICKS + 2);
    expect(shots.map((e) => e.weapon)).toEqual(['pew', 'pew']);
    expect(st.systems[0].laserCharge).toBe(0);                          // the dark beam holds no charge
  });
  it('charge rates: pew pew 27/27/40/50, the beam 40/40/60/75 per tick', () => {
    for (const [b, pew, beam] of [[1, 27, 40], [2, 27, 40], [3, 40, 60], [4, 50, 75]] as const) {
      const st = createTacticalState(1), sys = st.systems[0];
      sys.bars[1] = 10; sys.weaponPower = [b, b === 4 ? 3 : b, 0];
      sys.pewCharge = 0; sys.laserCharge = 0; sys.laserTargeted = false; sys.pewTargeted = false;
      tickWeapons(st, 0, IDLE_INPUT);
      expect(sys.pewCharge).toBe(pew);
      if (b !== 4) expect(sys.laserCharge).toBe(beam);
    }
  });
  it('the torpedo: reload 4/6/8 a tick on the 10800 clock; 0 bars cannot launch or reload; 3 bars hit 2 levels', () => {
    for (const [b, rate] of [[1, 4], [2, 6], [3, 8]] as const) {
      const st = createTacticalState(1), sys = st.systems[0];
      sys.bars[1] = 10; sys.weaponPower = [0, 0, b]; sys.magazine -= 1; sys.magazineClock = 0;
      tickWeapons(st, 0, IDLE_INPUT);
      expect(sys.magazineClock).toBe(rate);
    }
    const st = createTacticalState(1), sys = st.systems[0];
    sys.weaponPower = [1, 0, 0]; sys.magazine -= 1; sys.magazineClock = 0;
    for (let k = 0; k < 3000; k++) tickWeapons(st, 0, IDLE_INPUT);
    expect(sys.magazineClock).toBe(0); expect(canLaunch(st, 0)).toBe(false);
    expect(MAGAZINE_REGEN_UNITS).toBe(10800);
    const hit = facing(), hs = hit.systems[0];
    hs.bars[1] = 10; hs.weaponPower = [0, 0, 3]; hs.torpRoom = Room.Engines;
    placeMissile(hit, 0, { x: hit.ships[1].x, y: hit.ships[1].y, vx: 0, vy: 0, heading: 64, headingAcc: 0, age: 30 });
    resolveMissiles(hit);
    expect(hit.systems[1].rooms[Room.Engines]).toBe(2);
  });
  it('the Hunter keeps today\'s single laser', () => {
    const st = createTacticalState(1);
    expect(barrelShots(st, 1, 'beam')).toBe(1); expect(barrelShots(st, 1, 'pew')).toBe(0);
    expect(st.systems[1].laserCharge).toBe(0); expect(LASER_CHARGE_UNITS).toBeGreaterThan(0);
  });
});
```

The hit test assumes a missile at the target's centre lands on it in `resolveMissiles` (the spec §4 contact order). If `land` needs a `torpLock` or owner target, `hs.torpRoom` and `systems[0].target === 1` already hold, because createTacticalState locks slot 0 on slot 1.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engWeapons.test.ts`
Expected: FAIL, because `barrelShots` is not exported and `pewCharge` does not exist.

- [ ] **Step 3: The Weapons effects section of `bars.ts`**

Append to `src/renderer/src/sim/tactical/bars.ts`:

```ts
// ---- Weapons, the effects (Task 9b; Engineering spike spec §10.3, Amendment 2; isolated) ----
// Indexed by a weapon's bars 0..4; 4 is the overdrive bar, 3's effect at 1.25× the charge or reload rate.
export const PEW_SHOTS_BY_BARS: readonly number[] = [0, 2, 3, 3, 3];
export const PEW_RATE_BY_BARS: readonly number[] = [0, 27, 27, 40, 50];
export const BEAM_SHOTS_BY_BARS: readonly number[] = [0, 1, 2, 2, 2];
export const BEAM_RATE_BY_BARS: readonly number[] = [0, 40, 40, 60, 75];
export const TORPEDO_RELOAD_BY_BARS: readonly number[] = [0, 4, 6, 8, 10];
/** The Room levels a crew torpedo hit adds (to the cap of 2). A torpedo already in flight when its bars go hits for 1. */
export const TORPEDO_LEVELS_BY_BARS: readonly number[] = [1, 1, 1, 2, 2];
/** The crew magazine's units clock: at 4 a tick (1 bar) a missile takes 2700 ticks, today's MAGAZINE_REGEN_TICKS. */
export const MAGAZINE_REGEN_UNITS = 10800;
```

- [ ] **Step 4: The pew fields and the event's `weapon`**

In `src/renderer/src/sim/tactical/state.ts`:

(a) In `ShipSystems`, after `  weaponPower: number[];` add:

```ts
  /** Engineering spike spec §10.3 (the crew only; zeros elsewhere): pew pew, a second laser on today's laser rules with
   *  its own charge, hold, lock Room, targeted flag, burst shots still to fire and burst clock. It shares `freq`. */
  pewCharge: number; pewHold: number; pewLock: number; pewTargeted: boolean; pewBurst: number; pewBurstClock: number;
```

(b) In `systemsFor`, replace `    weaponPower: crew ? [...START_WEAPON_POWER] : Array<number>(WEAPON_SLOTS).fill(0)   // spec §10.3` with:

```ts
    weaponPower: crew ? [...START_WEAPON_POWER] : Array<number>(WEAPON_SLOTS).fill(0),   // spec §10.3
    // spec §10.3: pew pew starts full and targeted on the enemy's Shields, as the beam does (the FTL opener).
    pewCharge: crew && laser ? laser.chargeUnits : 0, pewHold: 0, pewLock: Room.Shields, pewTargeted: crew && laser !== null, pewBurst: 0, pewBurstClock: 0
```

(c) In `emptySystems`, change `weaponPower: Array<number>(WEAPON_SLOTS).fill(0) };` to `weaponPower: Array<number>(WEAPON_SLOTS).fill(0), pewCharge: 0, pewHold: 0, pewLock: 0, pewTargeted: false, pewBurst: 0, pewBurstClock: 0 };`.

(d) In `DuelEvent`, replace

```ts
  | { kind: 'laser'; ship: number; hit: boolean; stripped: boolean; room: number; x1: number; y1: number; x2: number; y2: number }
```

with

```ts
  | { kind: 'laser'; ship: number; hit: boolean; stripped: boolean; room: number; x1: number; y1: number; x2: number; y2: number; weapon?: 'pew' }   // weapon: a pew pew shot (Engineering spike spec §10.3); absent for the beam
```

In `src/renderer/src/sim/tactical/hash.ts`:
- in `SYSTEMS_TAIL`, replace the line

```ts
  'gunHeat', 'gunLocked', 'gunCooldown', 'gunMuzzle', 'gunWear', 'gunHull', 'gunShots', 'gunHits'] as const satisfies readonly (keyof ShipSystems)[];   // the gun's, Valkyrn spec §7.3; gunRoomWear closes the record
```

with

```ts
  'gunHeat', 'gunLocked', 'gunCooldown', 'gunMuzzle', 'gunWear', 'gunHull', 'gunShots', 'gunHits',   // the gun's, Valkyrn spec §7.3; gunRoomWear closes the record
  'pewCharge', 'pewHold', 'pewLock', 'pewTargeted', 'pewBurst', 'pewBurstClock'] as const satisfies readonly (keyof ShipSystems)[];   // pew pew's, Engineering spike spec §10.3
```

- change `const FLAGS = new Set<string>(['released', 'fireHeld', 'laserTargeted', 'gunLocked']);` to `const FLAGS = new Set<string>(['released', 'fireHeld', 'laserTargeted', 'gunLocked', 'pewTargeted']);`;
- in `systemsRules`, replace `  weaponPower: within(0, WEAPON_BAR_MAX + 1)   // spec §10.3` with:

```ts
  weaponPower: within(0, WEAPON_BAR_MAX + 1),   // spec §10.3
  pewCharge: within(0, most((c) => c.slots.laser?.chargeUnits)), pewHold: count, pewLock: room, pewTargeted: flagBit,
  pewBurst: within(0, Math.max(...PEW_SHOTS_BY_BARS) - 1), pewBurstClock: within(0, most((c) => c.slots.laser?.burstGapTicks))
```

- add `PEW_SHOTS_BY_BARS` to the bars import.

In `tests/duelModules.test.ts:58`, add `pewTargeted` to the flag alternation in `changedFirst`'s first regex, so it reads `/\.(active|released|fireHeld|laserTargeted|gunLocked|pewTargeted)$/` (a flag flips; `+1` on a boolean field would write 2). Mark it `// Engineering spike spec §10.3`.

In `tests/tacticalDeterminism.test.ts`:
- add `'pewBurst', 'pewBurstClock', 'pewCharge', 'pewHold', 'pewLock', 'pewTargeted'` in sorted position in the systems key list, after `'missilesLost'`;
- change `2 * 45` to `2 * 51`, appending `and pew pew's 6` to the comment.

- [ ] **Step 5: Replace `sim/tactical/weapons.ts`**

Replace the whole file with:

```ts
// Laser, shields and the magazine (spec §5, §7a, the §7 weapons state transitions table), on each ship's systems record
// and its class's weapon definitions. A ship's laser fires at its locked target (engine refactor spec §5). The crew ship
// (Engineering spike spec §10.3) has two lasers on today's laser rules, the beam (today's, on the laser* fields) and pew
// pew (a burst laser on the pew* fields), and every crew weapon reads the bars the Weapons officer gave it (bars.ts).
// Commands arrive as one ShipInput per ship per tick; the duel step builds these from the authority's admitted commands.
import { inArc, lineOfSight } from './geometry';
import { launchMissile } from './missiles';
import { tickGun } from './gun';
import {
  BEAM_RATE_BY_BARS, BEAM_SHOTS_BY_BARS, DuelSystem, effectiveBars, MAGAZINE_REGEN_UNITS, PEW_RATE_BY_BARS, PEW_SHOTS_BY_BARS, SHIELD_LAYERS_BY_BARS, SHIELD_RATE_BY_BARS,
  TORPEDO_RELOAD_BY_BARS, weaponBars, WeaponSlot
} from './bars';
import { classOf, CREW_SLOT, missileOf, Room, type Axes, type TacticalState } from './state';

/** One ship's inputs for one tick. `helm` / `weapons`: a present player is seated at that console ("attended", spec §8). */
export interface ShipInput {
  helm: boolean;
  weapons: boolean;
  /** Turn and thrust, read only while `helm`. */
  axes: Axes;
  /** `laserLock {room}`: the target Room to lock, −1 to clear the crew laser's target (FTL targeting spec §2), or null
   *  for no command this tick. */
  laserLock: number | null;
  /** `torpLock {room}` (FTL targeting spec §2, the crew only): the torpedo's target Room, −1 to clear, or null. */
  torpLock: number | null;
  /** `laserCharge {held}`: true = press, false = release, null = no command this tick. The crew's laser charges by
   *  itself, so for the crew a press fires a full laser and a release does nothing (FTL targeting spec §2). */
  laserCharge: boolean | null;
  /** `missileLaunch`. */
  missileLaunch: boolean;
  /** Valkyrn spec §7.1: the gun's trigger, held at the Weapons station by its attendant (the duel step computes it from
   *  the held input; every other input sets false). Read only by a class with a gun. */
  gunHeld: boolean;
  /** Sci-1 spec §4.6: whether the station running the ship's scan is attended (true when no scan runs). The duel step
   *  computes it for the crew; every other input sets true. */
  scanner: boolean;
  /** Engineering spike spec §10.3 (the crew only): pew pew's lock and press (`laserLock` / `laserCharge` with
   *  `weapon: 'pew'`), as laserLock and laserCharge are the beam's; absent or null for none. */
  pewLock?: number | null;
  pewCharge?: boolean | null;
}

/** A crew that sits at both consoles and does nothing. */
export const IDLE_INPUT: ShipInput = { helm: true, weapons: true, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, laserCharge: null, missileLaunch: false, gunHeld: false, scanner: true };
/** Nobody at either console: a ship nobody flies. */
export const UNCREWED_INPUT: ShipInput = { helm: false, weapons: false, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, laserCharge: null, missileLaunch: false, gunHeld: false, scanner: true };

/** Engineering spike spec §10.3: the crew's two lasers. The beam is today's laser on the laser* fields; pew pew has its own. */
export type Barrel = 'beam' | 'pew';
interface BarrelKeys {
  charge: 'laserCharge' | 'pewCharge'; hold: 'laserHold' | 'pewHold'; lock: 'lock' | 'pewLock';
  targeted: 'laserTargeted' | 'pewTargeted'; burst: 'laserBurst' | 'pewBurst'; clock: 'laserBurstClock' | 'pewBurstClock';
}
const KEYS: Readonly<Record<Barrel, BarrelKeys>> = {
  beam: { charge: 'laserCharge', hold: 'laserHold', lock: 'lock', targeted: 'laserTargeted', burst: 'laserBurst', clock: 'laserBurstClock' },
  pew: { charge: 'pewCharge', hold: 'pewHold', lock: 'pewLock', targeted: 'pewTargeted', burst: 'pewBurst', clock: 'pewBurstClock' }
};

/** Engineering spike spec §10.3: the shots one release of ship i's `barrel` fires: the crew's by its weapon's bars
 *  (pew pew 2/3/3, the beam 1/2/2), any other ship's beam by its class (pew pew: none). 0 without a laser slot. */
export function barrelShots(state: TacticalState, i: number, barrel: Barrel = 'beam'): number {
  const laser = classOf(state, i).slots.laser, s = state.systems[i]!;
  if (!laser) return 0;
  if (i !== CREW_SLOT) return barrel === 'beam' ? laser.shots : 0;
  return barrel === 'beam' ? BEAM_SHOTS_BY_BARS[weaponBars(s, WeaponSlot.Beam)]! : PEW_SHOTS_BY_BARS[weaponBars(s, WeaponSlot.Pew)]!;
}
/** The charge per tick of ship i's `barrel`: the crew's by its weapon's bars, any other ship's by its Weapons level. */
function barrelRate(state: TacticalState, i: number, barrel: Barrel): number {
  const laser = classOf(state, i).slots.laser!, s = state.systems[i]!;
  if (i !== CREW_SLOT) return laser.chargeRate[s.rooms[Room.Weapons]]!;
  return barrel === 'beam' ? BEAM_RATE_BY_BARS[weaponBars(s, WeaponSlot.Beam)]! : PEW_RATE_BY_BARS[weaponBars(s, WeaponSlot.Pew)]!;
}

/** Whether ship i's `barrel` is fully charged; never for a class without a laser (Valkyrn spec §6.1). */
export function laserFull(state: TacticalState, i: number, barrel: Barrel = 'beam'): boolean {
  const laser = classOf(state, i).slots.laser;
  return laser !== null && state.systems[i]![KEYS[barrel].charge] >= laser.chargeUnits;
}

/** Admission (spec §7 table; the duel step uses these to give reject reasons): laserCharge is accepted only with no missile in flight. */
export function canCharge(state: TacticalState, i: number): boolean { return missileOf(state, i) === null; }
/** Weapons update spec §2: whether ship i's target ship is active and its centre within the class's torpedo range of
 *  ship i's, from any bearing. */
export function torpedoInRange(state: TacticalState, i: number): boolean {
  const a = state.ships[i]!, j = state.systems[i]!.target, b = state.ships[j], range = classOf(state, i).slots.missile.range;
  if (!b || !b.active || j === i) return false;
  const dx = b.x - a.x, dy = b.y - a.y;
  return dx * dx + dy * dy <= range * range;
}
/** missileLaunch is accepted only with no missile in flight, a missile in the magazine, the torpedo powered (the crew,
 *  spec §10.3: its weapon's bars ≥ 1; any other ship: Weapons below level 2) and the target within torpedo range. */
export function canLaunch(state: TacticalState, i: number): boolean {
  const s = state.systems[i]!;
  const up = i === CREW_SLOT ? weaponBars(s, WeaponSlot.Torpedo) >= 1 : s.rooms[Room.Weapons] < 2;
  return missileOf(state, i) === null && s.magazine > 0 && up && torpedoInRange(state, i);
}
/** A lock target must be a Room index. */
export function validLock(room: number): boolean { return Number.isInteger(room) && room >= 0 && room <= 2; }
/** FTL targeting spec §2: a `laserLock` or `torpLock` command's room, a Room index or −1 (clear the target). */
export function validTarget(room: number): boolean { return room === -1 || validLock(room); }

/** Whether ship i's `barrel` is off: the crew's with 0 bars on that weapon (spec §10.3), any other ship's beam at Weapons
 *  damage level 2 (owner 2026-11-17, FTL-style), and any other ship's pew pew always. An off laser cannot charge, hold or
 *  fire and keeps no charge. A laserCharge command is still admitted (canCharge), to no effect. */
export function laserOffline(state: TacticalState, i: number, barrel: Barrel = 'beam'): boolean {
  if (i === CREW_SLOT) return barrelShots(state, i, barrel) === 0;
  return barrel === 'pew' || state.systems[i]!.rooms[Room.Weapons] >= 2;
}

/** The laser cannot charge, hold or fire while its ship's missile flies or its Weapons console is empty (spec §7 table). */
export function laserFrozen(state: TacticalState, i: number, input: ShipInput): boolean {
  return missileOf(state, i) !== null || !input.weapons;
}

/** Whether ship i's laser would hit ship j now: j an active slot inside the ±60° arc and range, with line of sight (spec §7a). */
export function laserEligible(state: TacticalState, i: number, j: number): boolean {
  const a = state.ships[i]!, b = state.ships[j], laser = classOf(state, i).slots.laser;
  if (!laser || !b || !b.active || j === i) return false;   // Valkyrn spec §6.1: no laser, no shot
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx * dx + dy * dy > laser.range * laser.range) return false;
  return inArc(a.heading, dx, dy, laser.arcCos) && lineOfSight(state, a.x, a.y, b.x, b.y);
}

/** Engineering spike spec §10.4: whether the crew sees ship j, for auto-fire and the torpedo's auto-launch. Task 10
 *  (Sensors) replaces this body with the sensor-range check; until then the crew sees everything. */
export function crewSees(state: TacticalState, j: number): boolean { return state.ships[j] !== undefined; }

/** One shot of ship i's `barrel` at its target and that barrel's lock room as they stand now (spec §7a; weapons update
 *  spec §1: every shot of a burst re-checks eligibility, strips shields or strikes the room, counts and pushes its own
 *  `laser` event; a pew pew shot's event carries `weapon: 'pew'`). */
function shoot(state: TacticalState, i: number, barrel: Barrel): void {
  const laser = classOf(state, i).slots.laser;
  if (!laser) return;
  const a = state.ships[i]!, as = state.systems[i]!, j = as.target, b = state.ships[j] ?? a, bs = state.systems[j], hit = laserEligible(state, i, j);
  const lock = as[KEYS[barrel].lock];
  let stripped = false, room = -1;
  as.shots++;
  if (hit && bs) {
    as.laserHits++;
    if (bs.shields > 0) {   // Sci-1 spec §4.4: the crew laser tuned to the weak frequency strips 2 layers (as many as are up)
      const n = i === CREW_SLOT && as.freq === state.weakFreq ? Math.min(2, bs.shields) : 1;
      bs.shields -= n; bs.shieldClock = 0; bs.gunWear = 0; as.layersStripped += n; stripped = true;   // Valkyrn spec §7.2: any strip zeroes the gun wear
    }
    else {
      room = lock;
      if (bs.rooms[lock]! < 2) bs.rooms[lock as 0 | 1 | 2]++;
      bs.hull = Math.max(0, bs.hull - laser.hull);
    }
  }
  state.events.push(barrel === 'pew'
    ? { kind: 'laser', ship: i, hit, stripped, room, x1: a.x, y1: a.y, x2: b.x, y2: b.y, weapon: 'pew' }
    : { kind: 'laser', ship: i, hit, stripped, room, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
}

/** A full charge's release: the first shot now, the rest of the burst queued a burst gap apart. */
function fireLaser(state: TacticalState, i: number, barrel: Barrel): void {
  const as = state.systems[i]!, laser = classOf(state, i).slots.laser, k = KEYS[barrel];
  if (!laser) return;
  shoot(state, i, barrel);
  as[k.charge] = 0; as[k.hold] = 0;
  as[k.burst] = Math.max(0, barrelShots(state, i, barrel) - 1); as[k.clock] = as[k.burst] > 0 ? laser.burstGapTicks : 0;
}

/** Weapons update spec §1: a pending burst shot fires a burst gap after the one before, attended or not, whatever flies;
 *  an off laser drops it, and (spec §10.3) a shot whose bar is gone never fires. */
function stepBurst(state: TacticalState, i: number, barrel: Barrel): void {
  const s = state.systems[i]!, k = KEYS[barrel];
  if (s[k.burst] === 0) return;
  if (laserOffline(state, i, barrel)) { s[k.burst] = 0; s[k.clock] = 0; return; }
  const left = Math.max(0, barrelShots(state, i, barrel) - 1);
  if (s[k.burst] > left) { s[k.burst] = left; if (left === 0) { s[k.clock] = 0; return; } }
  s[k.clock] = s[k.clock] - 1;
  if (s[k.clock] > 0) return;
  shoot(state, i, barrel);
  s[k.burst] = s[k.burst] - 1; s[k.clock] = s[k.burst] > 0 ? classOf(state, i).slots.laser?.burstGapTicks ?? 0 : 0;
}

/** Apply ship i's weapon commands for this tick, before anything moves (spec §7 table). The crew's ship (FTL targeting
 *  spec §2; Engineering spike spec §10.3): `laserLock` / `pewLock` set each laser's target (−1 clears it, keeping the
 *  lock room for a manual shot) and `torpLock` the torpedo's; a press fires a full laser; then, attended, a laser with a
 *  target fires its burst when full, eligible and seen, and a torpedo with a target launches when legal and seen. */
export function applyWeaponsInput(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.systems[i]!, crew = i === CREW_SLOT, armed = classOf(state, i).slots.laser !== null;   // Valkyrn spec §6.1: a null laser skips lock, charge and auto-fire
  if (armed && input.weapons && input.laserLock !== null) {   // first: a burst shot reads this tick's lock
    if (validLock(input.laserLock)) { s.lock = input.laserLock; if (crew) s.laserTargeted = true; }
    else if (input.laserLock === -1 && crew) s.laserTargeted = false;
  }
  if (armed && crew && input.weapons && input.pewLock !== undefined && input.pewLock !== null) {   // spec §10.3
    if (validLock(input.pewLock)) { s.pewLock = input.pewLock; s.pewTargeted = true; }
    else if (input.pewLock === -1) s.pewTargeted = false;
  }
  if (input.weapons && crew && input.torpLock !== null && validTarget(input.torpLock)) s.torpLock = input.torpLock;
  stepBurst(state, i, 'beam');
  if (crew) stepBurst(state, i, 'pew');
  tickGun(state, i, input);   // Valkyrn spec §7.1: before anything moves; its clocks run attended or not (Decision 8)
  if (!input.weapons) { s.fireHeld = false; return; }   // unattended: Fire lets go without firing or discarding
  if (laserOffline(state, i)) { s.laserCharge = 0; s.laserHold = 0; }   // a hit after its clock ran last tick: no shot
  if (crew && laserOffline(state, i, 'pew')) { s.pewCharge = 0; s.pewHold = 0; }
  if (armed && input.laserCharge !== null && canCharge(state, i)) {
    if (crew) { if (input.laserCharge && s.laserBurst === 0 && laserFull(state, i)) fireLaser(state, i, 'beam'); }   // a single press
    else if (input.laserCharge) s.fireHeld = true;
    else if (s.fireHeld) {
      s.fireHeld = false;
      if (laserFull(state, i)) fireLaser(state, i, 'beam');
      else { s.laserCharge = 0; s.laserHold = 0; }
    }
  }
  if (armed && crew && input.pewCharge === true && canCharge(state, i) && s.pewBurst === 0 && laserFull(state, i, 'pew')) fireLaser(state, i, 'pew');   // a single press
  const seen = crew && crewSees(state, s.target);
  if (armed && crew && s.laserTargeted && s.laserBurst === 0 && laserFull(state, i) && !laserFrozen(state, i, input) && laserEligible(state, i, s.target) && seen) fireLaser(state, i, 'beam');   // auto-fire
  if (armed && crew && s.pewTargeted && s.pewBurst === 0 && laserFull(state, i, 'pew') && !laserFrozen(state, i, input) && laserEligible(state, i, s.target) && seen) fireLaser(state, i, 'pew');
  if (input.missileLaunch && canLaunch(state, i)) {
    launchMissile(state, i);
    s.fireHeld = false;
  }
  if (crew && s.torpLock >= 0 && canLaunch(state, i) && seen) launchMissile(state, i);   // auto-launch, once
}

/** One tick of ship i's `barrel` charge and hold (spec §7; FTL targeting spec §2: the crew's lasers charge by themselves,
 *  with no hold, and stay full until they fire; any other ship's charges while Fire is held and vents after the hold). */
function tickBarrel(state: TacticalState, i: number, input: ShipInput, barrel: Barrel): void {
  const s = state.systems[i]!, laser = classOf(state, i).slots.laser, k = KEYS[barrel];
  if (laserOffline(state, i, barrel)) { s[k.charge] = 0; s[k.hold] = 0; s[k.burst] = 0; s[k.clock] = 0; return; }   // off: every tick, frozen or not
  if (laser === null || s[k.burst] !== 0 || laserFrozen(state, i, input)) return;   // no charging while a burst shot is pending
  if (i === CREW_SLOT) { if (!laserFull(state, i, barrel)) s[k.charge] = Math.min(laser.chargeUnits, s[k.charge] + barrelRate(state, i, barrel)); }
  else if (s.fireHeld && !laserFull(state, i)) s.laserCharge = Math.min(laser.chargeUnits, s.laserCharge + barrelRate(state, i, 'beam'));
  else if (laserFull(state, i) && ++s.laserHold >= laser.holdTicks) { s.laserCharge = 0; s.laserHold = 0; }   // vents; recharges if still held
}

/** Advance ship i's lasers, shields and magazine by one tick (spec §5, §7; Engineering spike spec §2, §10.3). */
export function tickWeapons(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.systems[i]!, c = classOf(state, i);
  tickBarrel(state, i, input, 'beam');
  if (i === CREW_SLOT) tickBarrel(state, i, input, 'pew');
  if (i === CREW_SLOT) {   // Engineering spike spec §2: the crew's shields by bars; layers above the cap drop at once
    const bars = effectiveBars(s, DuelSystem.Shields), cap = Math.min(c.shields.layers, SHIELD_LAYERS_BY_BARS[bars]!);
    if (s.shields > cap) { s.shields = cap; s.shieldClock = 0; }
    if (s.shields >= cap) s.shieldClock = 0;
    else if ((s.shieldClock += SHIELD_RATE_BY_BARS[bars]!) >= c.shields.rechargeUnits) { s.shields++; s.shieldClock = 0; }   // rate 0: held
  } else if (s.shields >= c.shields.layers) s.shieldClock = 0;
  else if ((s.shieldClock += c.shields.rate[s.rooms[Room.Shields]]!) >= c.shields.rechargeUnits) { s.shields++; s.shieldClock = 0; }   // rate 0: held
  if (s.magazine >= c.slots.missile.magazine) s.magazineClock = 0;
  else if (i === CREW_SLOT) {   // spec §10.3: the torpedo's reload by its bars on a units clock; 0 bars holds the clock
    const rate = TORPEDO_RELOAD_BY_BARS[weaponBars(s, WeaponSlot.Torpedo)]!;
    if (rate > 0 && (s.magazineClock += rate) >= MAGAZINE_REGEN_UNITS) { s.magazine++; s.magazineClock = 0; }
  } else if (++s.magazineClock >= c.slots.missile.regenTicks) { s.magazine++; s.magazineClock = 0; }
}
```

Before writing it, diff the current file against this text. The only intended behaviour changes are: the two barrels, `barrelShots`, the crew's per-weapon rates and shots, `crewSees`, and the torpedo reload. Everything else, including the Valkyrn `tickGun` call and Task 3's shields block, is carried over verbatim. If the branch's file has gained anything since Task 3, keep it.

- [ ] **Step 6: The crew torpedo's levels**

In `src/renderer/src/sim/tactical/missiles.ts`:
- change `import { classOf, emptyMissile, missileOf, placeMissile, type DuelEvent, type Missile, type TacticalState } from './state';` to `import { classOf, CREW_SLOT, emptyMissile, missileOf, placeMissile, type DuelEvent, type Missile, type TacticalState } from './state';`;
- add `import { TORPEDO_LEVELS_BY_BARS, weaponBars, WeaponSlot } from './bars';`;
- in `land`, replace `  if (sys.rooms[room] < 2) sys.rooms[room]++;` with:

```ts
  const levels = m.owner === CREW_SLOT ? TORPEDO_LEVELS_BY_BARS[weaponBars(owner, WeaponSlot.Torpedo)]! : 1;   // Engineering spike spec §10.3: 3 bars hit 2 levels
  sys.rooms[room] = Math.min(2, sys.rooms[room] + levels);
```

- [ ] **Step 7: The laser commands name a weapon**

In `src/renderer/src/net/contracts.ts`, replace

```ts
  | { kind: 'laserLock'; room: number }
```

with

```ts
  | { kind: 'laserLock'; room: number; weapon?: 'beam' | 'pew' }   // weapon: Engineering spike spec §10.3, absent = the beam
```

and `  | { kind: 'laserCharge'; held: boolean }` with `  | { kind: 'laserCharge'; held: boolean; weapon?: 'beam' | 'pew' }`.

In `src/renderer/src/net/codec.ts`, replace

```ts
      z.object({ kind: z.literal('laserLock'), room: z.number().int().min(-1).max(MAX_INDEX) }).strict(),
```

with

```ts
      z.object({ kind: z.literal('laserLock'), room: z.number().int().min(-1).max(MAX_INDEX), weapon: z.enum(['beam', 'pew']).optional() }).strict(),   // Engineering spike spec §10.3
```

and `      z.object({ kind: z.literal('laserCharge'), held: z.boolean() }).strict(),` with `      z.object({ kind: z.literal('laserCharge'), held: z.boolean(), weapon: z.enum(['beam', 'pew']).optional() }).strict(),`.

In `src/renderer/src/sim/duel/step.ts`, in the weapons loop, replace

```ts
    if (c.kind === 'laserLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } crew.laserLock = c.room; }   // −1 clears the target
    else if (c.kind === 'torpLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } crew.torpLock = c.room; }
    else if (c.kind === 'laserCharge') { if (!canCharge(d.tactical, 0)) { result(e, 'missile-in-flight'); continue; } crew.laserCharge = c.held; }
```

with

```ts
    if ((c.kind === 'laserLock' || c.kind === 'laserCharge') && c.weapon !== undefined && c.weapon !== 'beam' && c.weapon !== 'pew') { result(e, 'malformed'); continue; }
    if (c.kind === 'laserLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } if (c.weapon === 'pew') crew.pewLock = c.room; else crew.laserLock = c.room; }   // −1 clears; spec §10.3: weapon
    else if (c.kind === 'torpLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } crew.torpLock = c.room; }
    else if (c.kind === 'laserCharge') { if (!canCharge(d.tactical, 0)) { result(e, 'missile-in-flight'); continue; } if (c.weapon === 'pew') crew.pewCharge = c.held; else crew.laserCharge = c.held; }
```

Also add a `weapon` round-trip to `tests/duelCheckpoint.test.ts`'s examples: change `laserLock: { kind: 'laserLock', room: 1 }` to `laserLock: { kind: 'laserLock', room: 1, weapon: 'pew' }`.

- [ ] **Step 7b: The bots fight with pew pew; telemetry counts either barrel (Decision 20)**

The beam starts the round dark (0 bars), so a bot that only lines up and locks the beam would never fire.

In `src/renderer/src/sim/duel/scripted.ts`:

(a) In the Helm's facing rule (`:118`), replace

```ts
  if (laserFull(t, 0) && t.systems[0].laserTargeted && ex * ex + ey * ey <= LASER_RANGE * LASER_RANGE && !inArc(s.heading, ex, ey, LASER_ARC_COS))
```

with

```ts
  const ready = (laserFull(t, 0, 'pew') && t.systems[0].pewTargeted) || (laserFull(t, 0) && t.systems[0].laserTargeted);   // Engineering spike Decision 20: pew pew first
  if (ready && ex * ex + ey * ey <= LASER_RANGE * LASER_RANGE && !inArc(s.heading, ex, ey, LASER_ARC_COS))
```

(b) In `gunner`, replace

```ts
  if (!sys.laserTargeted || sys.lock !== want) out.push({ kind: 'laserLock', room: want });
```

with

```ts
  if (!sys.pewTargeted || sys.pewLock !== want) out.push({ kind: 'laserLock', room: want, weapon: 'pew' });   // Engineering spike Decision 20: pew pew is the primary
```

and replace

```ts
  if (canLaunch(t, 0) && !(laserFull(t, 0) && laserEligible(t, 0, target)) && sys.laserBurst === 0 && t.tick - pair.lastLaunch >= MISSILE_GAP) {
```

with

```ts
  if (canLaunch(t, 0) && !(laserFull(t, 0, 'pew') && laserEligible(t, 0, target)) && sys.pewBurst === 0 && t.tick - pair.lastLaunch >= MISSILE_GAP) {
```

In `src/renderer/src/sim/duel/telemetry.ts:161`, replace `laserFull(tac, 0) && !canLaunch(tac, 0)` with `(laserFull(tac, 0) || laserFull(tac, 0, 'pew')) && !canLaunch(tac, 0)`, and append to the comment above it: `; either laser (Engineering spike Decision 20)`.

The beam keeps today's lock, so a scenario that powers the beam still auto-fires it on its old lock. The console's "WEAPONS OFFLINE" situation (`render/duel/situationModel.ts`) belongs to Part ii.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/engWeapons.test.ts tests/engWeaponPower.test.ts tests/engBars.test.ts tests/tacticalDeterminism.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts tests/duelScripted.test.ts tests/duelTelemetry.test.ts tests/weaponsUpdate.test.ts tests/ftlTargeting.test.ts tests/tacticalWeapons.test.ts tests/tacticalMissiles.test.ts tests/disabledSystems.test.ts tests/duelWeaponsView.test.ts tests/valkyrnGun.test.ts`, then `npx tsc -b`.

Expected:
- engWeapons, engWeaponPower, engBars, tacticalDeterminism, duelModules and duelCheckpoint PASS.
- The crew's 2-shot beam at the start, its level-based Weapons gate, today's magazine for the crew, and one-level crew torpedo hits are now kind (a): update those assertions to the §10.3 rules, setting `weaponPower` where a test needs the beam powered.
- Hunter assertions must still pass unchanged. If one fails, that is a bug.
- `tsc -b` is clean. If a render model narrows the laser event exhaustively, the optional `weapon` field needs no change.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/tactical/bars.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/missiles.ts src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/scripted.ts src/renderer/src/sim/duel/telemetry.ts tests/engWeapons.test.ts tests/tacticalDeterminism.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts
git commit -m "feat(engineering-spike): pew pew, the beam and the torpedo by the officer's bars (Amendment 2, isolated)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Add the fallout test files you fixed to the `git add` line by name.

---

### Task 10 (isolated): Sensors → range and fog gates, scan rate, and hazard capacity (spec §10.4)

**Isolation:** everything this task adds lives in:
- the "Sensors" section at the end of `bars.ts`;
- the fog functions in `sim/tactical/science.ts`;
- `crewSees`'s body in `weapons.ts`;
- `sim/duel/sensors.ts` (the hazard capacity) and its call in `capacityOf`;
- the gates in the step;
- the scripted gunner's seen check;
- one clamp after the hazard tick.

**Files:**
- Modify: `src/renderer/src/sim/tactical/bars.ts` (append the Sensors section)
- Modify: `src/renderer/src/sim/tactical/science.ts` (`sensorRange`, `pointSeen`, `shipSeen`, `contactSeen`, `scanProgressRate`; scanStep)
- Modify: `src/renderer/src/sim/tactical/weapons.ts` (`crewSees` body)
- Create: `src/renderer/src/sim/duel/sensors.ts`
- Modify: `src/renderer/src/sim/duel/power.ts` (`capacityOf` for Sensors)
- Modify: `src/renderer/src/sim/duel/step.ts` (the gates; a clamp after the hazard tick)
- Modify: `src/renderer/src/sim/duel/scripted.ts` (the gunner locks only a seen target)
- Test: `tests/engSensors.test.ts`

**Interfaces:**
- Consumes: Task 2's `effectiveBars`, `DuelSystem`, `SYSTEM_SLOTS`; `derelictPos` (`sim/tactical/science.ts:62`); `Contact` (`sim/tactical/state.ts`); `SCAN_RATE_SCIENCE` (`sim/tactical/tuning.ts:135`).
- Produces:
  - `SCAN_SCIENCE_BY_BARS`, `SCAN_OTHER_BY_BARS`, `SENSOR_RANGE_BY_BARS` (bars.ts);
  - `sensorRange(sys): number`, `pointSeen(t, x, y): boolean`, `shipSeen(t, i): boolean`, `contactSeen(t, contact): boolean`, `scanProgressRate(t): number` (science.ts; Part ii's fog drawing reads these);
  - `sensorsHazards(d): number` (sensors.ts).

- [ ] **Step 1: Write the failing test**

Create `tests/engSensors.test.ts` (`contactScan` at 0 Sensors bars stays `unavailable`, spec §2 Scans, which §10 doesn't override):

```ts
// Engineering spike spec §10.4 (Amendment 2): sensor range by Sensors bars, contacts seen within it, the sim gates
// (contactScan, laser/pew/torpedo locks, designate: unavailable when unseen; a running scan pauses unseen; auto-fire
// needs the target seen), the scan rate table, and Sensors capacity lost to fire and breach in Ops.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { capacityOf, clampToCapacity, DuelSystem } from '../src/renderer/src/sim/duel/power';
import { contactSeen, scanProgressRate, scanStep, sensorRange, shipSeen } from '../src/renderer/src/sim/tactical/science';
import { crewSees } from '../src/renderer/src/sim/tactical/weapons';
import { Contact, createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from '../src/renderer/src/sim/tactical/tuning';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { sitDown } from '../src/renderer/src/sim/stations';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const env = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[]) => stepDuelTick(d, { held: [NONE, NONE], commands });
/** Put the enemy `dist` units east of the crew ship. */
const enemyAt = (d: DuelState, dist: number) => { const a = d.tactical.ships[0], b = d.tactical.ships[1]; b.x = a.x + dist; b.y = a.y; };

describe('engineering spike: Sensors (spec §10.4)', () => {
  it('range and scan rate by bars', () => {
    const s = createTacticalState(1), sys = s.systems[0];
    expect([0, 1, 2, 3, 4].map((b) => { sys.bars[DuelSystem.Sensors] = b; return sensorRange(sys); })).toEqual([300, 900, 1400, 2000, 2800]);
    s.scan.rate = SCAN_RATE_SCIENCE;
    expect([0, 1, 2, 3, 4].map((b) => { sys.bars[DuelSystem.Sensors] = b; return scanProgressRate(s); })).toEqual([0, 5, 6, 7, 8]);
    s.scan.rate = SCAN_RATE_OTHER;
    expect([0, 1, 2, 3, 4].map((b) => { sys.bars[DuelSystem.Sensors] = b; return scanProgressRate(s); })).toEqual([0, 2, 2, 3, 3]);
  });
  it('seen within range of the crew ship\'s centre; a running scan pauses unseen; crewSees follows', () => {
    const d = createDuel(HOUND, 13);
    try {
      const t = d.tactical;
      enemyAt(d, 800); expect(shipSeen(t, 1)).toBe(true); expect(contactSeen(t, Contact.Enemy)).toBe(true); expect(crewSees(t, 1)).toBe(true);
      enemyAt(d, 1000); expect(shipSeen(t, 1)).toBe(false); expect(crewSees(t, 1)).toBe(false);
      t.scan.contact = 0; t.scan.level = 1; t.scan.progress = 10; t.scan.rate = SCAN_RATE_SCIENCE;
      scanStep(t, true); expect(t.scan.progress).toBe(10);
      enemyAt(d, 500); scanStep(t, true); expect(t.scan.progress).toBe(15);
    } finally { disposeDuel(d); }
  });
  it('the gates: contactScan, laser and pew pew and torpedo locks, and designate need the contact seen', () => {
    const d = createDuel(HOUND, 13);
    try {
      sitDown(d.interior, 0, d.nav); sitDown(d.interior, 1, d.weapons); enemyAt(d, 1200);
      for (const [pid, c] of [[0, { kind: 'contactScan', contact: 0 }], [1, { kind: 'laserLock', room: 1 }], [1, { kind: 'laserLock', room: 1, weapon: 'pew' }], [1, { kind: 'torpLock', room: 2 }]] as [number, DuelCommand][])
        expect(step(d, [env(d, pid, c)])[0], c.kind).toMatchObject({ status: 'rejected', reason: 'unavailable' });
      enemyAt(d, 600);
      expect(step(d, [env(d, 1, { kind: 'laserLock', room: 1 })])[0]).toMatchObject({ status: 'applied' });
      step(d, [env(d, 1, { kind: 'shipPower', system: DuelSystem.Sensors, delta: -1 })]);              // 0 bars: range 300, rate 0
      expect(step(d, [env(d, 0, { kind: 'contactScan', contact: 0 })])[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
      expect(step(d, [env(d, 1, { kind: 'laserLock', room: -1 })])[0]).toMatchObject({ status: 'applied' });   // clearing needs nothing seen
    } finally { disposeDuel(d); }
  });
  it('Sensors capacity loses a slot per hazard in its room (fire, breach), 0 while failed', () => {
    const d = createDuel(HOUND, 13);
    try {
      const O = d.systemRooms[DuelSystem.Sensors]!, site = d.interior.derived.siteRoom.findIndex((r) => r === O);
      expect(capacityOf(d, DuelSystem.Sensors)).toBe(4);
      igniteRoom(d.interior, O); expect(capacityOf(d, DuelSystem.Sensors)).toBe(3);
      activateBreach(d.interior, site); expect(capacityOf(d, DuelSystem.Sensors)).toBe(2);
      d.tactical.systems[0].bars[DuelSystem.Sensors] = 4; clampToCapacity(d);
      expect(d.tactical.systems[0].bars[DuelSystem.Sensors]).toBe(2);
      d.power.failed[DuelSystem.Sensors] = 1; expect(capacityOf(d, DuelSystem.Sensors)).toBe(0);
    } finally { disposeDuel(d); }
  });
});
```

The derelict's seen check isn't tested here. `contactSeen(t, Contact.Derelict)` is covered through the `contactScan` gate by Part ii's fog view. Add a one-line assertion if a derelict position helper is handy: `derelictPos(t)` within `sensorRange`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engSensors.test.ts`
Expected: FAIL, because `sensorRange` and `contactSeen` are not exported.

- [ ] **Step 3: The Sensors section of `bars.ts`**

Append to `src/renderer/src/sim/tactical/bars.ts`:

```ts
// ---- Sensors (Task 10; Engineering spike spec §10.4, Amendment 2; isolated) ----
/** Spec §10.4: scan progress per tick by effective Sensors bars 0..4, for a Science scan and a Helm/Weapons scan. */
export const SCAN_SCIENCE_BY_BARS: readonly number[] = [0, 5, 6, 7, 8];
export const SCAN_OTHER_BY_BARS: readonly number[] = [0, 2, 2, 3, 3];
/** Spec §10.4: the crew's sensor range (map units) by effective Sensors bars 0..4. */
export const SENSOR_RANGE_BY_BARS: readonly number[] = [300, 900, 1400, 2000, 2800];
```

- [ ] **Step 4: The fog in `science.ts`**

In `src/renderer/src/sim/tactical/science.ts`:

(a) Change `import { classOf, CREW_SLOT, idleScan, Loot, type TacticalState } from './state';` to `import { classOf, Contact, CREW_SLOT, idleScan, Loot, type ShipSystems, type TacticalState } from './state';`, and the tuning import to add `SCAN_RATE_SCIENCE`: `import { DT, HEADING_COUNT, HOSTILE_AFTER_TICKS, LOOT_HULL, SALVAGE_RANGE, SALVAGE_SPEED, SALVAGE_TICKS, SCAN_RATE_SCIENCE, SCAN_UNITS, TRAP_HULL } from './tuning';`. Add `import { DuelSystem, effectiveBars, SCAN_OTHER_BY_BARS, SCAN_SCIENCE_BY_BARS, SENSOR_RANGE_BY_BARS } from './bars';`.

(b) Directly above `export function scanStep`, add:

```ts
/** Engineering spike spec §10.4 (Task 10): the crew's sensor range by its effective Sensors bars. */
export function sensorRange(sys: Pick<ShipSystems, 'rooms' | 'bars'>): number { return SENSOR_RANGE_BY_BARS[effectiveBars(sys, DuelSystem.Sensors)]!; }
/** Whether a point is within sensor range of the crew ship's centre (a torpedo in flight, for Part ii's fog). */
export function pointSeen(t: TacticalState, x: number, y: number): boolean {
  const a = t.ships[CREW_SLOT], r = sensorRange(t.systems[CREW_SLOT]), dx = x - a.x, dy = y - a.y;
  return dx * dx + dy * dy <= r * r;
}
/** Whether ship slot i is seen by the crew: the crew's own slot always; any other active slot within sensor range. */
export function shipSeen(t: TacticalState, i: number): boolean {
  if (i === CREW_SLOT) return true;
  const b = t.ships[i];
  return b !== undefined && b.active && pointSeen(t, b.x, b.y);
}
/** Whether a scan contact (Contact.Enemy: the crew's target ship; Contact.Derelict: the wreck) is seen. */
export function contactSeen(t: TacticalState, contact: number): boolean {
  if (contact === Contact.Enemy) return shipSeen(t, t.systems[CREW_SLOT].target);
  const p = derelictPos(t);
  return pointSeen(t, p.x, p.y);
}
/** Spec §2 Scans (Decision 8), §10.4: a running scan's progress this tick, from its station's row (scan.rate keeps the
 *  base rate, SCAN_RATE_SCIENCE for Science, so it picks the row) at the crew's current effective Sensors bars. */
export function scanProgressRate(t: TacticalState): number {
  const row = t.scan.rate === SCAN_RATE_SCIENCE ? SCAN_SCIENCE_BY_BARS : SCAN_OTHER_BY_BARS;
  return row[effectiveBars(t.systems[CREW_SLOT], DuelSystem.Sensors)]!;
}
```

`derelictPos` is declared later in the same file as a function declaration, so calling it here is fine.

(c) In `scanStep`, replace

```ts
  if (!scanner) { Object.assign(s, idleScan()); return; }
  s.progress += s.rate;
```

with

```ts
  if (!scanner) { Object.assign(s, idleScan()); return; }
  if (!contactSeen(t, s.contact)) return;   // spec §10.4: a running scan pauses while its contact is unseen
  s.progress += scanProgressRate(t);         // spec §2, §10.4: no longer s.rate
```

- [ ] **Step 5: `crewSees` reads the fog**

In `src/renderer/src/sim/tactical/weapons.ts`:
- add `import { shipSeen } from './science';` (science.ts imports nothing from weapons.ts, so there is no cycle);
- replace

```ts
export function crewSees(state: TacticalState, j: number): boolean { return state.ships[j] !== undefined; }
```

with

```ts
export function crewSees(state: TacticalState, j: number): boolean { return shipSeen(state, j); }   // Task 10, spec §10.4
```

and update its doc comment to: `/** Engineering spike spec §10.4 (Task 10): whether the crew sees ship j, for auto-fire and the torpedo's auto-launch. */`.

- [ ] **Step 6: Sensors capacity from hazards**

Create `src/renderer/src/sim/duel/sensors.ts`:

```ts
// Engineering spike spec §10.4 (Amendment 2), Task 10, isolated: Sensors loses one slot of capacity for each hazard in
// its room (a fire, each active breach), back when the fire is out or the breach is patched.
import type { DuelState } from './state';

/** The hazards in the Sensors room now: 1 for a fire, plus 1 per active breach site there. 0 when it has no room. */
export function sensorsHazards(d: DuelState): number {
  const st = d.interior, room = d.systemRooms[3]!;
  if (room < 0) return 0;
  let n = st.rooms.fire[room]! > 0 ? 1 : 0;
  const sites = st.derived.siteRoom;
  for (let s = 0; s < sites.length; s++) if (sites[s] === room && st.breaches.active[s]) n++;
  return n;
}
```

In `src/renderer/src/sim/duel/power.ts`:
- add `import { sensorsHazards } from './sensors';` and add `DuelSystem`, `SYSTEM_SLOTS` to the `../tactical/bars` import;
- replace

```ts
export function capacityOf(d: DuelState, k: number): number { return d.power.failed[k] ? 0 : damageCapacity(d.tactical.systems[0], k); }
```

with

```ts
export function capacityOf(d: DuelState, k: number): number {
  if (d.power.failed[k]) return 0;
  if (k === DuelSystem.Sensors) return Math.max(0, SYSTEM_SLOTS[k]! - sensorsHazards(d));   // Task 10, spec §10.4: fire and breach in its room
  return damageCapacity(d.tactical.systems[0], k);
}
```

In `src/renderer/src/sim/duel/step.ts`, in the hazard-tick block from Task 6, replace `    duelHeatStep(d);   // overheat draws last; each overheat clamps its bars inline` with:

```ts
    duelHeatStep(d);   // overheat draws last; each overheat clamps its bars inline
    clampToCapacity(d);   // Task 10, spec §10.4: a fire that spread into the Sensors room costs it a slot this tick
```

- [ ] **Step 7: The gates in the step**

In `src/renderer/src/sim/duel/step.ts`:

(a) Add `import { contactSeen, shipSeen } from '../tactical/science';` (merge it with the existing `scanCommand` import from that module), and merge `DuelSystem, effectiveBars` into the existing `../tactical/bars` import.

(b) In the weapons loop, replace Task 9b's two lock branches

```ts
    if (c.kind === 'laserLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } if (c.weapon === 'pew') crew.pewLock = c.room; else crew.laserLock = c.room; }   // −1 clears; spec §10.3: weapon
    else if (c.kind === 'torpLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } crew.torpLock = c.room; }
```

with

```ts
    if (c.kind === 'laserLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } if (c.room >= 0 && !shipSeen(d.tactical, d.tactical.systems[0].target)) { result(e, 'unavailable'); continue; } if (c.weapon === 'pew') crew.pewLock = c.room; else crew.laserLock = c.room; }   // −1 clears; spec §10.3: weapon; §10.4: seen
    else if (c.kind === 'torpLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } if (c.room >= 0 && !shipSeen(d.tactical, d.tactical.systems[0].target)) { result(e, 'unavailable'); continue; } crew.torpLock = c.room; }   // spec §10.4: seen
```

A malformed room is still `malformed`, and clearing (−1) needs nothing seen.

(c) In the designate loop, replace

```ts
    if (c !== -1 && c !== 0 && c !== 1) { result(e, 'malformed'); continue; }
    if (c === t.designated) { result(e, undefined, 'noop'); continue; }
```

with

```ts
    if (c !== -1 && c !== 0 && c !== 1) { result(e, 'malformed'); continue; }
    if (c >= 0 && !contactSeen(t, c)) { result(e, 'unavailable'); continue; }   // Task 10, spec §10.4
    if (c === t.designated) { result(e, undefined, 'noop'); continue; }
```

(d) In the contactScan loop, replace

```ts
    if (t.known[c]! >= CONTACT_MAX_LEVEL[c]!) { result(e, 'unavailable'); continue; }
```

with

```ts
    if (t.known[c]! >= CONTACT_MAX_LEVEL[c]!) { result(e, 'unavailable'); continue; }
    if (effectiveBars(t.systems[0], DuelSystem.Sensors) === 0) { result(e, 'unavailable'); continue; }   // Task 10, spec §2 Scans: no Sensors, no scan
    if (!contactSeen(t, c)) { result(e, 'unavailable'); continue; }   // Task 10, spec §10.4: unseen
```

- [ ] **Step 8: The scripted gunner locks only what it sees**

In `src/renderer/src/sim/duel/scripted.ts`:
- add `import { shipSeen } from '../tactical/science';`, merging it with any existing import from that module;
- in `gunner`, replace

```ts
  if (!sys.laserTargeted || sys.lock !== want) out.push({ kind: 'laserLock', room: want });
  if (missileOf(t, 0) || sys.torpLock >= 0) return;
```

with

```ts
  if (!shipSeen(t, target)) return;   // Engineering spike spec §10.4: a lock on an unseen target is refused
  if (!sys.laserTargeted || sys.lock !== want) out.push({ kind: 'laserLock', room: want });
  if (missileOf(t, 0) || sys.torpLock >= 0) return;
```

- [ ] **Step 9: Run the tests**

Run: `npx vitest run tests/engSensors.test.ts tests/engCommands.test.ts tests/engWeapons.test.ts tests/engPower.test.ts tests/duelScripted.test.ts`, plus every science test file (`ls tests | grep -i -E "scien|scan|designat"`), then `npx tsc -b`.
Expected: the eng files PASS. Science and targeting fallout (a lock or scan of a far contact expected `applied`) is kind (a). `tsc -b` is clean.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/sim/tactical/bars.ts src/renderer/src/sim/tactical/science.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/duel/sensors.ts src/renderer/src/sim/duel/power.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/scripted.ts tests/engSensors.test.ts
git commit -m "feat(engineering-spike): Sensors range and the fog gates, the scan rate, and Sensors capacity from Ops hazards (Amendment 2, isolated)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Add the fallout test files you fixed to the `git add` line by name.

---

### Task 11: Determinism: hash agreement and snapshot round trips with every new system running

**Files:**
- Test: `tests/engDeterminism.test.ts`

**Interfaces:**
- Consumes: `hashDuel`, `saveDuelSnapshot`, `loadDuelSnapshot`, the four commands, `DuelSystem`, `HEAT_MAX`. Both players stay present; it doesn't use passiveInput, which marks them away so every engineering command would be `unavailable`.
- Produces: the spec §8 determinism proof for Part i.

- [ ] **Step 1: Write the test**

Create `tests/engDeterminism.test.ts`:

```ts
// Engineering spike spec §8 determinism: with bars, heat (an overheat), doors, airlocks, oxygen, fire spread and breaches
// all running, two duels from one seed and one command script hash alike every 60 ticks over a seed sweep, every
// scripted command is applied, and a mid-run snapshot reload continues with the same hashes. Both players stay present
// and standing (no one at Weapons, so the crew never fires and the enemy holds until rt 1800: no hits change the bars).
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { DuelSystem } from '../src/renderer/src/sim/duel/power';
import { HEAT_MAX } from '../src/renderer/src/sim/tuning';
import { Life, LifeState } from '../src/renderer/src/sim/components';

const HOUND = parseShip(hound);
const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The engineering script (spec §10.1 start: 1 spare bar): Engines to its overdrive bar with no coolant (heat +2 per
 *  hazard tick, so it overheats near tick 640), coolant on Shields, the R–H door held (edge 1, off the crew's air path:
 *  O and Q only leak to the Hold through closed doors), airlock 0 (the Hold) opened and closed, then the freed bars into Sensors and Oxygen. */
const SCRIPT: readonly [number, number, DuelCommand][] = [
  [30, 0, { kind: 'shipPower', system: DuelSystem.Engines, delta: 1 }], [31, 1, { kind: 'shipPower', system: DuelSystem.Sensors, delta: -1 }],
  [40, 0, { kind: 'shipPower', system: DuelSystem.Engines, delta: 1 }], [60, 1, { kind: 'shipCoolant', system: DuelSystem.Shields }],
  [400, 0, { kind: 'shipDoor', edge: 1 }], [420, 1, { kind: 'shipAirlock', index: 0 }], [900, 1, { kind: 'shipAirlock', index: 0 }],
  [1200, 0, { kind: 'shipPower', system: DuelSystem.Sensors, delta: 1 }], [1201, 0, { kind: 'shipPower', system: DuelSystem.Oxygen, delta: 1 }]
];
let seq = 0;
function tickOf(d: DuelState): DuelEnvelope[] {
  const t = d.interior.tick - d.baseTick;
  return SCRIPT.filter(([at]) => at === t).map(([, player, command]) => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command }));
}
/** Play `ticks` ticks; push a hash every 60; return the statuses of the script's results and the highest Engines heat. */
function play(d: DuelState, ticks: number, hashes: string[]): { statuses: string[]; maxHeat: number; failed: boolean } {
  const statuses: string[] = [];
  let maxHeat = 0, failed = false;
  for (let k = 0; k < ticks; k++) {
    for (const r of stepDuelTick(d, { held: [NONE, NONE], commands: tickOf(d) })) statuses.push(r.status);
    maxHeat = Math.max(maxHeat, d.power.heat[DuelSystem.Engines]!); failed ||= d.power.failed[DuelSystem.Engines] === 1;
    if (d.interior.tick % 60 === 0) hashes.push(hashDuel(d));
  }
  return { statuses, maxHeat, failed };
}

describe('engineering spike: determinism (spec §8)', () => {
  it('two runs of one seed and script agree every 60 ticks over seeds 1 to 5; every command applies; Engines overheats', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const a = createDuel(HOUND, seed), b = createDuel(HOUND, seed), ha: string[] = [], hb: string[] = [];
      try {
        const ra = play(a, 1800, ha); play(b, 1800, hb);
        expect(ha, `seed ${seed}`).toEqual(hb);
        expect(ra.statuses, `seed ${seed}`).toEqual(SCRIPT.map(() => 'applied'));
        expect(ra.maxHeat, `seed ${seed}`).toBe(HEAT_MAX); expect(ra.failed, `seed ${seed}`).toBe(true);
        for (let p = 0; p < 2; p++) expect(Life.state[a.interior.crew[p]!], `seed ${seed} player ${p}`).toBe(LifeState.Conscious);
      } finally { disposeDuel(a); disposeDuel(b); }
    }
  }, 120_000);
  it('a snapshot at tick 950 reloads and continues with the same hashes', () => {
    const a = createDuel(HOUND, 2), ha: string[] = [], hb: string[] = [];
    try {
      play(a, 950, []);
      const b = loadDuelSnapshot(HOUND, saveDuelSnapshot(a, DIGEST), DIGEST);
      try { play(a, 900, ha); play(b, 900, hb); expect(hb).toEqual(ha); } finally { disposeDuel(b); }
    } finally { disposeDuel(a); }
  }, 60_000);
});
```

The overheat is asserted for every seed, which covers F4's "at least one". Before hostility (rt 1800) nothing damages the Engines Room, so the timing is the same in every seed: Engines overdriven from tick 40, +2 heat per hazard tick, HEAT_MAX at about tick 640. If a seed shows otherwise, read its heat trace before weakening the assertion.

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/engDeterminism.test.ts`
Expected: PASS. A failure is a real determinism bug in Tasks 2 to 10. Debug it with superpowers:systematic-debugging: compare `flattenDuel` value by value at the first differing hash, using `duelSchema` names from `scripts/golden/duelOracle.ts` to name the field.

- [ ] **Step 3: Commit**

```bash
git add tests/engDeterminism.test.ts
git commit -m "test(engineering-spike): hash agreement over a seed sweep and a snapshot reload with every engineering system running" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The fallout, the re-bless at 54, the gates and the report's sim numbers

**Files:**
- Modify: any failing test file, by the fallout rule only
- Regenerated by bless: `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`
- Modify: `docs/superpowers/research/2026-11-18-engineering-spike.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a green full suite on the branch, blessed goldens at 54, and the report's sim measurements, gate table and determinism lines.

- [ ] **Step 1: Bless the gameplay change at 54**

Run: `npm run bless`
Expected: a same-version bless (every artifact is stored at 54 since Task 1), so no bump proof runs, and four `blessed ...` lines print. If it refuses, read the message. A refusal here means an artifact is not at 54: rerun Task 1 Step 5's state check with `git log -- tests/golden`.

- [ ] **Step 2: Build and run the full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: a list of failures. Rerun each timeout-prone file (Global Constraints) alone before counting it.

- [ ] **Step 3: Apply the fallout rule to every failure**

Work through each failing test in turn:

1. Read the test and name its kind: (a) a replaced rule, (b) a whole-run number, or (c) a band.
2. Apply exactly the action for that kind (Global Constraints), with the required comment.
3. For (c), copy the failing values into a scratch list for Step 5.
4. Rerun that file alone until it is green, or skipped for (c).

Re-run the full suite until it is green. A failure that fits none of (a) to (c), such as a crash, a validator refusal or a NaN, is a bug: fix the sim code, not the test, and add a regression assertion to the matching `tests/eng*.test.ts`.

- [ ] **Step 4: Run the typecheck and the duel app smoke**

Run: `npx tsc -b`, then `npm run test:duel-app-runtime`.
Expected: both are clean. The app smoke runs the duel in the real app with no new UI. If it fails only on a pinned whole-run number, that is kind (b).

- [ ] **Step 5: Measure, and write the report's sim sections**

Run: `npx tsx scripts/engineering-spike-measure.ts`
Expected: one JSON line with `"simVersion":54`.

In `docs/superpowers/research/2026-11-18-engineering-spike.md`:
- Fill the After column of the measurements table with the new numbers.
- Replace the gate section's `(Task 12)` with a table of every test skipped under rule (c): its file and name, its band, and the measured value.
- Below that table, add the per-seed `telemetryLine` output that `npx vitest run tests/duelGates.test.ts` prints, which is logged even for skipped aggregate tests. Run that file's per-seed tests with `--reporter=verbose` to capture the lines.
- Add a "Known limits" section listing:
  - the Shield loot cancelled by the bar cap (Decision 21);
  - the bots fighting with pew pew only (Decision 20);
  - the bots never moving bars.
- Replace the determinism section's `(Task 12)` with: `tests/engDeterminism.test.ts: hash agreement over seeds 1-5 (1800 ticks, every 60) and a snapshot reload at tick 950: PASS. Goldens re-blessed at SIM 54 (same-version bless).` Add the duel golden's new outcome and ticks from the bless output.

- [ ] **Step 6: Commit**

```bash
git add tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json docs/superpowers/research/2026-11-18-engineering-spike.md
git commit -m "test(engineering-spike): re-bless at SIM 54, the fallout rule applied, gates recorded in the report" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Stage every fallout test file you changed by name in the same `git add`; list them with `git status --short tests`.

---

## Self-review against the spec

| Spec | Covered by |
|---|---|
| §2 the five systems, start bars, capacity, the clamp's direction (with §10.1's values) | Task 2 (bars.ts, the start), Task 4 (capacityOf, applyPower, clampToCapacity) |
| §2 where the bars live (ShipSystems.bars in the ship module) | Task 2 |
| §2 shields: the layer cap, rate, 1-layer start, layers above the cap drop | Tasks 2 and 3 |
| §10.1 reactor 10, maxima, the start (9 used, 1 spare), knock | Tasks 2 and 4 |
| §10.2 Engines: the throttle cap (1 bar = 25 %), the engine factor, flight and prediction, reverse, the clamp; the scripted pair within the cap | Task 8 (isolated) |
| §10.3 Weapons: the allocation (0..3, a 4th with overdrive), `weaponPower {slot, delta}`, the trim (overdrive bar first, highest slot down) | Task 9a (isolated) |
| §10.3 Weapons: pew pew (its own laser state, 2/3/3 shots, 27/27/40), the beam (1/2/2, 40/40/60), the torpedo (reload 4/6/8, 2 levels at 3), `weapon` on the laser commands, the Hunter unchanged | Task 9b (isolated) |
| §10.4 Sensors: range, seen, the gates (scan, locks, designate), the scan pause, auto-fire seen, the scan table, hazard capacity | Task 10 (isolated) |
| §2 the readers see damage at once (effectiveBars); admission reads start-of-tick bars | Tasks 2, 8, 9a, 9b and 10 (the admissions stay above the power block) |
| §3 overdrive, coolant (8, 0..2, wrap), heat per hazard tick, overheat (fail, bars, one draw always, ascending), recovery at 0, fire heat out | Task 4 (and the hazard tick in Task 6) |
| §4 no quirk; oxygen per room; the duel injection; breaches (chances, fire then breach, single site); patching storage | Tasks 6 and 7 |
| §4 low air (25 %, seated too, cause air, after fire); fire by fireStep only, spread open and closed; the damage cadence kept | Tasks 6 and 7 |
| §4 firefighting in every room; work precedence; events; venting | Tasks 6 and 7 |
| §5 doors start auto; the toggle; airlocks; the fail-safe never fires | Tasks 5 and 6 |
| §7 the commands, DUEL_KINDS, duel-decided, reasons; the power module and its place; the snapshot; module completeness | Tasks 4, 5, 9a and 9b |
| §7 clampToCapacity placement; the step order; rng order | Tasks 5 to 10 (Decision 13) |
| §8 every sim test; determinism; goldens re-blessed | Tasks 2 to 12 |
| §1 snapshot size, tick cost, determinism in the report | Tasks 1 and 12 (Part ii adds feel and screenshots) |
| §9.3 console power strips, locked notches; §10.3 the Weapons console's three weapons and their bars; §10.4 ghosts and fog drawing | Part ii |

Out of scope for Part i, and owned by Part ii: the HUD, actions, interior clicks, the app smoke clicks, screenshots, and the report's feel sections.
