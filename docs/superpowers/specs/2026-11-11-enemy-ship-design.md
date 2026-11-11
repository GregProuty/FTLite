# Enemy Ship (Combat-i) — Design

Status: approved 2026-11-11 under the autonomous feature loop (`docs/roadmap.md` item 5); every open choice took the recommended option. Parent: `2026-11-09-foundation-design.md` §1 (sub-project 2, ship-to-ship combat), §4 rule 4a (system order), §5 Stations (Weapons, Science, Navigation), §14 ("enemy ship and weapon targeting model"). Builds on 2a-ii/2b-ii (debris, targets, beams, torpedoes, scanning), 4-i (director) and 4-ii (telemetry). This is the first half of sub-project 2; **Combat-ii** (roadmap item 6) adds enemy subsystems, shields and frequencies.

## 1. Goal

Give the crew something that shoots back. An **abstract enemy ship** (no map, no crew: a hull value and a gun) arrives on a schedule, sits off the bow for up to two minutes and fires **shots** at our rooms. Its shots are incoming objects exactly like debris (Science warns of them, Navigation can evade them, Weapons can shoot them down), so every existing station loop applies unchanged; the new choice for the Weapons operator is whether to intercept the shots or **shoot the ship**, which is a new target in the same list. The encounter ends when the enemy's hull reaches zero (destroyed) or its clock runs out (it withdraws). Nothing is gained from a kill yet (loot and scrap come with the run structure, roadmap item 9); the reward is a quieter sky.

**Out of scope:** enemy subsystems, shields and frequency matching against the enemy (Combat-ii), an enemy map or crew, boarding (sub-project 3), loot, more than one enemy at a time, a new HUD panel (the enemy appears in the threat list and the target lists), new art (existing icons are reused).

## 2. Decisions taken (recommended options)

| Question | Options considered | Decision |
|---|---|---|
| What an enemy shot is | (a) an instant hit on a room; (b) a projectile with its own table and systems; (c) an object in the existing debris table with a `kind` byte | **(c)**: Science lead, Navigation evasion, Weapons interception, target cycling, impacts and telemetry all apply for free; only the flight time and hull damage differ. |
| How the enemy enters the target list | (a) a separate cursor mode on Weapons; (b) a pseudo-slot `ENEMY_SLOT = DEBRIS_SLOTS` ordered by its own `StableId` among the warned objects | **(b)**: one list, one cycling rule, one retarget-on-removal rule; the cursor byte already fits. |
| Who schedules encounters | (a) a fifth director hazard type; (b) an independent `enemySystem` with its own timers drawn from `rng.director`, escalating with the same minutes formula | **(b)**: the director's budget and cap are about onboard hazards; an encounter is a two-minute pressure source, not a spawn. The enemy's presence still feeds the director's stress. |
| Fire cadence | (a) fixed interval; (b) `ENEMY_FIRE_INTERVAL / (1 + ESCALATION_RATE × minutes)` floored at `ENEMY_FIRE_MIN`, solo × 1.5, jitter ± 20 %, with at most `ENEMY_SHOTS_MAX` shots in flight | **(b)**: the foundation's escalation shape, reused. |
| Damage to the enemy | beams `ENEMY_BEAM_DAMAGE` (15) on a roll `u < ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE × output` (frequency plays no part until Combat-ii); torpedoes `ENEMY_TORP_DAMAGE` (35) on `torpedoHits` | 100 hull: seven beam hits or three torpedoes, or a mix. |
| Enemy shot damage | hull `ENEMY_SHOT_HULL_DAMAGE` (6, debris is 8), crew 20 in the hit room, the same breach-or-fire room effect | Shots are lighter than debris individually but come every 10 to 15 s. |
| Science and the enemy | the enemy cannot be scanned (nothing to reveal until Combat-ii); its shots can (they carry a frequency like debris) | Science keeps its loop; the enemy row shows in its list without a scan. |
| Encounter end | destroyed at hull ≤ 0, or withdraws at `ENCOUNTER_MAX` (120 s); either way the next arrival is `ENCOUNTER_COOLDOWN` (150 s) × jitter later; shots already in flight keep flying | One encounter at a time. |
| Telemetry | `telemetry.encounters`, `telemetry.enemiesDestroyed`; the record gains `enemy: { met, destroyed }`; the acceptance table gains an `enemy` column `met/destroyed` | Small, and the acceptance question "did the crew ever kill one" becomes answerable. |
| HUD | threat row `Enemy ship: hull 64%` (icon `icon.weapons`), shot rows `Shot: <room> 7s` (icon `icon.sensors`), target rows for the enemy in the Weapons and Science panels | No new assets, no new panel. |

## 3. Architecture

| Module | Responsibility |
|---|---|
| `sim/enemy.ts` (new) | `ENEMY_SLOT`, `enemyPresent`, `arrive`, `leave`, `fireAtUs`, `enemySystem(state)`; `enemyBeamHits(u, output)`; `damageEnemy(state, amount)`. |
| `sim/debris.ts` | `debris.kind` byte (`ObjectKind.Debris = 0`, `ObjectKind.Shot = 1`); `spawnDebris` sets kind 0; new `spawnShot(state)` (same three `rng.hazards` draws, `ENEMY_SHOT_FLIGHT ± ENEMY_SHOT_JITTER`, kind 1); `resolveImpact` takes the hull damage from the kind; `shotsInFlight(state)`. |
| `sim/debrisTargets.ts` | `warnedTargets` appends `ENEMY_SLOT` while the enemy is present, sorted with the objects by `StableId` (`targetStableId(state, slot)`); `isTarget(state, slot)` (active and warned object, or the present enemy); `nextTarget`/`cycleTarget` unchanged over the list. |
| `sim/weapons.ts` | `fireWeapon` fires at `ENEMY_SLOT` with `enemyBeamHits`/`torpedoHits` and `damageEnemy`; readiness, XP, `shots`/`hits` telemetry and `lastShotTick` unchanged. |
| `sim/science.ts` | `scienceInput` ignores Confirm on `ENEMY_SLOT`; `scanStep` unchanged (the cursor on the enemy is "not an unscanned object"). |
| `sim/director.ts` | `rawStress` adds `STRESS_WEIGHTS.enemy × present`; nothing else (enemy shots already count as in-flight objects for the cap, stress and routing). |
| `sim/step.ts` | `enemySystem` runs after `directorSystem` and before `debrisSystem` (so a shot spawned this tick is detected this tick like a director debris spawn). |
| `sim/telemetry.ts` | two scalars and the record's `enemy` block. |
| `sim/acceptance.ts` | the `enemy` column. |
| `sim/state.ts`, `flatten.ts`, `tuning.ts` | the `enemy` block, `debris.kind`, `SIM_VERSION = 10`, the constants in §8. |
| `render/hudModel.ts`, `hud.ts` | threat rows; `DebrisTarget.kind: 'debris' \| 'shot' \| 'enemy'` and the enemy's `hull` fraction on target rows. |

## 4. Authoritative state

```ts
enemy: {
  present: number;         // 0 or 1
  hull: number;            // 0..ENEMY_HULL while present, 0 otherwise
  stableId: number;        // allocated on arrival from nextStableId; 0 while absent
  nextArrivalTick: number; // first ENCOUNTER_FIRST x TICK_HZ; re-armed on leave
  nextShotTick: number;    // -1 while absent
  departTick: number;      // -1 while absent
};
debris.kind: Uint8Array;   // per slot: 0 debris, 1 enemy shot (ObjectKind)
telemetry.encounters: number; telemetry.enemiesDestroyed: number;
```

Flattened: an `enemy` manifest section after `weapons` (six scalars, in the order above); `debris.kind` appended to the `debris` section after `scan` (`DEBRIS_FIELDS = 9`); the two telemetry scalars after `maxStress` (twelve telemetry scalars). `SIM_VERSION` becomes 10; version-9 snapshots are rejected. Initial values: `present 0, hull 0, stableId 0, nextArrivalTick ENCOUNTER_FIRST × TICK_HZ, nextShotTick −1, departTick −1`; `kind` all 0; the counters 0.

`ENEMY_SLOT = DEBRIS_SLOTS` (8). It is never an index into the debris arrays; every reader of a cursor goes through `isTarget` / `targetStableId`.

## 5. The encounter

`enemySystem(state)` runs once per tick, after the director and before the debris step. In order:

1. **Arrival.** If `present === 0` and `tick ≥ nextArrivalTick`: `present = 1`, `hull = ENEMY_HULL`, `stableId = nextStableId++`, `departTick = tick + ENCOUNTER_MAX × TICK_HZ`, `nextShotTick = tick + ENEMY_FIRST_SHOT × TICK_HZ`, `telemetry.encounters += 1`; for each targeting console (Weapons, Science) with an occupant and cursor −1, the cursor becomes `ENEMY_SLOT` (the first-warning auto-select rule, applied to the enemy). No RNG draw. Return (no shot on the arrival tick).
2. **Withdrawal.** If `present === 1` and `tick ≥ departTick`: `leave(state, false)`. Return.
3. **Fire.** If `present === 1` and `tick ≥ nextShotTick`: draw `u` from `rng.director` and re-arm **first**: `nextShotTick = tick + round(fireInterval(minutes, players) × TICK_HZ × jitter)`, `jitter = 1 + ENEMY_FIRE_JITTER × (2u − 1)`; then if `shotsInFlight(state) < ENEMY_SHOTS_MAX` and the debris table has a free slot, `spawnShot(state)` (three `rng.hazards` draws: uniform room, flight jitter, frequency, exactly as `spawnDebris`; flight `ENEMY_SHOT_FLIGHT ± ENEMY_SHOT_JITTER`; `kind = Shot`). A blocked shot (cap or table full) draws nothing from `rng.hazards`.

`fireInterval(minutes, players) = max(ENEMY_FIRE_MIN, ENEMY_FIRE_INTERVAL / (1 + ESCALATION_RATE × minutes)) × (players === 1 ? SOLO_INTERVAL_MULT : 1)`.

`leave(state, destroyed)`: `present = 0`, `hull = 0`, `nextShotTick = −1`, `departTick = −1`; for each targeting console whose cursor is `ENEMY_SLOT`, `cursor = nextTarget(state, stableId, ENEMY_SLOT)` **before** `stableId = 0` (the retarget-on-removal rule of 2a-ii, so the selection advances by `StableId`); if `destroyed`, `telemetry.enemiesDestroyed += 1`; one `rng.director` draw re-arms `nextArrivalTick = tick + round(ENCOUNTER_COOLDOWN × TICK_HZ × jitter)` with the same jitter formula. Shots in flight keep their `kind` and fly on.

**Shooting the enemy** (`fireWeapon`, cursor `ENEMY_SLOT`, enemy present): the readiness checks are unchanged (online, occupied, beam charge 1 or torpedo loaded); one `rng.combat` draw; beam: `enemyBeamHits(u, output) = u < ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE × output` (the selector's frequency is ignored until Combat-ii), torpedo: `torpedoHits(u, output)`; the readiness resets either way; `lastShotTick`, `XP_PER_SHOT`, `telemetry.shots` as today; on a hit `telemetry.hits += 1` and `damageEnemy(state, ENEMY_BEAM_DAMAGE | ENEMY_TORP_DAMAGE)`: `hull = max(0, hull − amount)`, and at 0 `leave(state, true)` at once (the kill resolves in the Weapons step, before this tick's debris step; shots already in flight are unaffected).

**Enemy shot impact** (`resolveImpact`): identical to debris except `hull −= kind === Shot ? ENEMY_SHOT_HULL_DAMAGE : DEBRIS_HULL_DAMAGE`. Evasion, crew damage, the breach-or-fire effect, `impactTick`, telemetry `impacts`/`evadeRolls`/`evasions` and `removeDebris` are shared. Evading or shooting down a shot is the same act as for debris.

**Director coupling:** `rawStress` gains `STRESS_WEIGHTS.enemy (0.30) × present`; enemy shots in flight already count in `activeDebrisCount` (stress 0.20 each, the spawn cap, and the debris routing group) and this is deliberate: while under fire the director spawns fewer onboard hazards. The enemy is never "unattended" (nobody can stand next to it).

## 6. Targets

`targetStableId(state, slot)` is `state.enemy.stableId` for `ENEMY_SLOT`, else `debris.stableId[slot]`. `warnedTargets(state)` returns the active warned object slots plus `ENEMY_SLOT` when present, sorted ascending by `targetStableId`. `isTarget(state, slot)` is `enemy.present === 1` for `ENEMY_SLOT`, else `active && warned`. `nextTarget` and `cycleTarget` are unchanged (they operate on the list and `targetStableId`). `fireWeapon`'s target check becomes `c >= 0 && isTarget(state, c)`; `scienceInput`'s Confirm requires `c !== ENEMY_SLOT` as well; `scanStep` adds the same guard. `removeDebris` is unchanged: it retargets by the removed object's `StableId` and the list may now land on the enemy.

Since the enemy's `StableId` is allocated on arrival, it sorts after every object spawned earlier and before every later one: a Weapons operator already cycling through shots is not jumped to the ship, and the auto-select puts the enemy under the cursor only when nothing was selected.

## 7. HUD

- Threats: while present, the first row is `{ icon: 'icon.weapons', text: 'Enemy ship: hull 64%' }` (`round(hull / ENEMY_HULL × 100)`); shots in flight list as `{ icon: 'icon.sensors', text: 'Shot: <room> 7s F2' }` (the `F` suffix once scanned, as debris does); debris rows unchanged.
- `DebrisTarget` gains `kind: 'debris' | 'shot' | 'enemy'` and `hull: number | null` (the fraction, enemy only). The enemy's row has `room: 'Enemy ship'`, `eta` = seconds until it withdraws, `frequency: null`, `hull`. `hud.ts` renders a target row's name from the kind (`Debris`, `Shot`, `Enemy`) and shows `64%` instead of `F?` for the enemy; the Science panel's scan column is blank for the enemy.
- `HudThreat.icon` union gains `'icon.weapons'`.

## 8. Tuning (first pass, all hypotheses)

```ts
SIM_VERSION = 10
ENCOUNTER_FIRST = 180          // seconds until the first arrival
ENCOUNTER_MAX = 120            // seconds an enemy stays before withdrawing
ENCOUNTER_COOLDOWN = 150       // seconds between a leave and the next arrival, x jitter
ENEMY_HULL = 100
ENEMY_FIRST_SHOT = 5           // seconds after arrival
ENEMY_FIRE_INTERVAL = 15, ENEMY_FIRE_MIN = 6, ENEMY_FIRE_JITTER = 0.2   // escalation shares ESCALATION_RATE and SOLO_INTERVAL_MULT
ENEMY_SHOTS_MAX = 2            // in flight at once
ENEMY_SHOT_FLIGHT = 10, ENEMY_SHOT_JITTER = 2     // seconds; debris is 30 +/- 6
ENEMY_SHOT_HULL_DAMAGE = 6     // debris is 8; crew damage shared (DEBRIS_CREW_DAMAGE)
ENEMY_BEAM_BASE = 0.55, ENEMY_BEAM_SCALE = 0.30   // beam hit chance against the ship: 0.70 at output 0.5
ENEMY_BEAM_DAMAGE = 15, ENEMY_TORP_DAMAGE = 35
STRESS_WEIGHTS.enemy = 0.30
```

Worked numbers (two players, minute 3): the enemy arrives at 3:00, first shot at 3:05, then every 15 / 1.3 ≈ 11.5 s ± 20 %, so about ten shots before it withdraws at 5:00 if nobody shoots back; each shot gives Science 4 s of unmanned warning (18 to 24 s seated) and Navigation a 35 to 50 % evasion roll; unanswered, that is up to 60 hull. A level-2 Weapons operator (output 0.5) charges a beam every 12 s with a 70 % chance of 15 damage: about 2 minutes of continuous fire to destroy it, or 3 torpedoes (hit 90 %) in 30 s of loading if the stock is there. Solo: shots 1.5 × slower. The first gate seed must survive 3:00 to 5:00 under fire with Weapons unmanned (see §10).

## 9. Testing

All under node, no pixi. New `tests/enemy.test.ts`; extended `tests/debris.test.ts`, `tests/weapons.test.ts`, `tests/science.test.ts`, `tests/director.test.ts`, `tests/snapshot.test.ts`, `tests/hud.test.ts`, `tests/telemetry.test.ts`, `tests/acceptance.test.ts`, `tests/gate-survival.test.ts`. Test helper: `placeEnemy(state, hull = ENEMY_HULL)` in `tests/helpers/sim.ts` (sets the block as `arrive` would, with a fresh `StableId`, no draw) and `placeShot(state, room, ticksOut, warned, stableId?, frequency?)` (as `placeDebris` with `kind = Shot`).

- **Schedule:** a fresh state has the §4 initial values; stepping to `ENCOUNTER_FIRST` arrives exactly on that tick (not one before) with `encounters 1`, `hull ENEMY_HULL`, a new `StableId`, `departTick` and `nextShotTick` as specified and **no** `rng.director` or `rng.hazards` draw on the arrival tick; the first shot comes at `ENEMY_FIRST_SHOT` after arrival; a due shot draws exactly one director float then three hazards draws and places a `kind = Shot` object with flight in `ENEMY_SHOT_FLIGHT ± ENEMY_SHOT_JITTER`; with `ENEMY_SHOTS_MAX` shots in flight a due shot re-arms (one director draw) and draws nothing from hazards; `fireInterval` at minutes 0, 3, 10 and the floor, and the solo multiplier; withdrawal exactly at `departTick` (not one before) with one director draw and `nextArrivalTick` in `ENCOUNTER_COOLDOWN × (1 ± jitter)`; shots in flight survive the withdrawal; no shot is fired on the withdrawal tick; a second encounter arrives after the cooldown with a new `StableId` and `encounters 2`.
- **Targets:** `warnedTargets` includes `ENEMY_SLOT` only while present and sorts it by `StableId` among warned objects (enemy allocated between two objects sits between them); `isTarget` for the enemy, a warned object, an unwarned object and a free slot; cycling Up/Down over `[object, enemy, object]` with wrap; arrival auto-selects the enemy only for a seated console with cursor −1 (a console already on an object keeps it); `leave` retargets a cursor on the enemy to the next `StableId` or −1, and the Science cursor likewise; `removeDebris` of the object before the enemy lands the cursor on the enemy.
- **Shooting the enemy:** `enemyBeamHits` thresholds at output 0.5 and 1 (values clear of the float boundary); a beam hit through `fireWeapon` with a pinned combat seed takes 15 hull and counts `shots 1, hits 1`, resets the charge and stamps `lastShotTick`; a beam miss takes nothing and counts `shots 1, hits 0`; a torpedo hit takes 35; the kill: hull 15 and a beam hit → `present 0`, `enemiesDestroyed 1`, cursor retargeted, one director draw (the cooldown), and a shot in flight is still active; firing at the enemy with `selector = BeamF3` and any frequency behaves identically (frequency ignored); firing with cursor `ENEMY_SLOT` while the enemy is absent is rejected (no draw, no shot).
- **Shot impacts:** a shot impact takes `ENEMY_SHOT_HULL_DAMAGE`, damages Conscious crew in the room by 20, leaves a breach or fire, stamps `impactTick`, counts `impacts`; an evaded shot (pinned roll) counts a roll and an evasion and no hull loss; a shot can be scanned (frequency revealed) and shot down by a matched beam exactly like debris.
- **Director:** `rawStress` with the enemy present alone is 0.30; with the enemy and one shot in flight 0.50; `anyUnattended` is false with only the enemy present; `activeHazardCount` counts a shot in flight.
- **Snapshot and hash:** round trip of the `enemy` block, `debris.kind` and the two counters with non-default values; mutating each field alone changes the hash; version-9 rejection; a run saved mid-encounter with a shot in flight continues like the uninterrupted run through the shot's impact and the withdrawal (hash equality).
- **HUD model:** the threat row text and icon for the enemy at hull 64 and for a shot with and without a scanned frequency; the Weapons panel lists the enemy row with `kind 'enemy'`, `room 'Enemy ship'`, the seconds to withdrawal and `hull 0.64`; the Science panel shows it with `scan 0`; the threat list is empty of the enemy when absent.
- **Telemetry and acceptance:** `encounters`/`enemiesDestroyed` round-trip into the record's `enemy` block; the acceptance table's `enemy` column reads `1/0` for one encounter met and none destroyed; the CLI test's expected header gains the column.
- **Survival gate (`tests/gate-survival.test.ts`, seeds 1 to 3, two bots, Weapons unmanned):** still ends with both crew Conscious and `ended 0` at 5 minutes; additionally assert `telemetry.encounters ≥ 1` (the first encounter at 3:00 happens inside the gate). If a seed fails, lower `ENEMY_SHOT_HULL_DAMAGE` to 4, then raise `ENCOUNTER_FIRST` to 210; record the change in `docs/gates.md`; do not weaken the assertions.
- **Combat gate (new test in `tests/enemy.test.ts`):** a scripted Weapons operator at level 2 with pinned combat rolls (all hits) destroys the enemy with seven beams inside one encounter window, through `step()` with Confirm intents each time the charge is full.
- **Golden replay:** re-blessed once (version 10, the enemy block, `kind` and the two counters are hashed; the replay is two minutes long and the first encounter comes at 3:00, so no enemy appears in it and the hashes change only through the new fields) with the cause recorded.

## 10. Gate

Added to `docs/gates.md` as "Combat-i: enemy ship":

- The enemy, debris, weapons, science, director, snapshot, HUD, telemetry and acceptance tests pass; typecheck and build pass; `tests/gate-survival.test.ts` passes on seeds 1 to 3 with at least one encounter inside the window (figures and any tuning change recorded).
- `npm run acceptance 5 1` prints three rows whose `enemy` column reads `1/0` (one encounter met in five minutes, none destroyed by the unmanned crew).
- Manual, two players (`npm run dev`): at 3:00 `Enemy ship: hull 100%` appears in the threats and `Shot: <room> Ns` rows follow every 10 to 15 s; from Weapons (B(7,2)) the target list shows `Enemy 100%` among the shots, Confirm with a charged beam lowers the percentage more often than not, and a torpedo takes a visible chunk; the row and the threat vanish when the hull reaches 0 or after two minutes. Date and notes: pending human playtest.

## 11. Open questions deferred

- Enemy subsystems, shields and frequency matching against the ship: Combat-ii.
- Enemy accuracy against Navigation (today every shot flies true and only our evasion roll matters): revisit with Combat-ii's engines.
- Rewards for a kill (scrap, repairs): run structure, roadmap item 9.
- A console-operating bot so the acceptance soak can measure kills: 4-ii §12.
