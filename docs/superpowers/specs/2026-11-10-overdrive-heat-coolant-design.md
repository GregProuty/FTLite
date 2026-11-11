# Overdrive, Heat and Coolant (Increment 2b-i) — Design

Status: approved in brainstorming 2026-11-10. Parent: `2026-11-09-foundation-design.md` §5 (Power model: "Overdrive, heat and coolant"), §7, §10 ("Overdrive and weapons properties"), §11 item 2b. Builds on `2026-11-10-power-and-consoles-design.md` (2a-i) and `2026-11-10-debris-loop-design.md` (2a-ii), both merged. Increment 2b is split in two at the user's choice: this half gives Engineering its heat-versus-power dial; **2b-ii** (debris frequency, Science scanning, the beam frequency selector, torpedoes) follows as its own spec.

## 1. Goal

Let a seated Engineering operator push any station **one bar above its maximum** (overdrive) for a stronger effect, at the cost of **heat** that climbs while the station is overdriven. A shared pool of four **coolant units**, assigned per station with Confirm, decides how long an overdrive is sustainable: two units hold a station indefinitely, one halves the climb, none overheats it in about ten seconds. At maximum heat the station suffers the existing **power failure** hazard and may start a fire in its room. The intended play is spiking: overdrive Weapons for one shot window, Science during a warning, Medbay while a crew member heals, then drop back or cool.

**Out of scope (later increments):** skill-scaled cooling and Engineering bonus bars with power shedding (3: `coolingPerUnit` takes the seated operator's skill through the `skillLevel()` stub, which returns 0); the Engineering productive predicate (4); everything in 2b-ii. Decisions taken here for those: cooling per unit is computed by one function with a floor-rounded skill term that is 0 today; `stationOutput` keeps `level / STATION_MAX`, so an overdriven station's output exceeds 1 and every consumer (beam charge and hit, evasion, Science lead, injection, heal) already scales.

## 2. Architecture

Approach chosen: **heat and coolant as station arrays plus a new `sim/heat.ts` module**, mirroring how 2a-ii added `debris.ts` next to the spawner. `power.ts` stays about bars; the overheat consequence reuses `failStation` and `igniteRoom`, so no new hazard type exists.

| Module | Responsibility |
|---|---|
| `sim/heat.ts` (new) | `maxLevel(kind)`, `isOverdriven(state, i)`, `coolingPerUnit(state)`, `coolantUsed(state)`, `cycleCoolant(state, i)`, `heatStep(state)` (hazard tick: heat update, then overheats). |
| `sim/power.ts` | `shiftBar(+1)` ceiling becomes `maxLevel(kind)` (overdrive allowed for every kind except Engineering). |
| `sim/console.ts` | Engineering Confirm dispatches to `cycleCoolant` on the cursor's station. |
| `sim/step.ts` | `heatStep` appended to the hazard-tick block after `fireStep`. |
| `sim/state.ts`, `flatten.ts` | `stations.heat`, `stations.coolant` snapshotted and hashed; `STATION_FIELDS` 5 → 7; `SIM_VERSION = 4`. |
| `sim/tuning.ts` | New constants (§6). |
| `render/hudModel.ts`, `hud.ts` | Heat, coolant and overdrive on the Engineering rows and the station strip; coolant pool in the Engineering footer. |

Step order inside `step()` (changes in bold):

1. `interactSystem`
2. `consoleSystem` (Engineering Confirm cycles coolant here)
3. `movementSystem`
4. `doorSystem`
5. hazard tick (12 Hz): `lifeSupportInjection` → `oxygenStep` → `fireStep` → **`heatStep`** (an overheat fire's growth, oxygen use and spread begin on the next hazard tick, but `crewSystem` already damages crew standing in that room on the same sim tick; an overheat's forced stand lands after `consoleSystem`, as a spawner power failure does today, and clears the seat, the occupant and the player's stick state through `standUp`)
6. `spawner`
7. `debrisSystem`
8. `medbayStep`
9. `crewSystem`

## 3. Authoritative state

```ts
// state.ts
stations: {
  level, failed, repair, occupant, cursor,       // as today
  heat:    Int16Array;   // 0..HEAT_MAX, integer, per station
  coolant: Uint8Array;   // 0..COOLANT_MAX_PER_STATION units assigned, per station
};
```

Both arrays are flattened after `cursor` (`STATION_FIELDS = 7`), snapshotted and hashed; `SIM_VERSION` becomes 4 and version-3 snapshots are rejected (existing rule). `layoutHash` is unchanged (no ship data changes). The coolant pool size is the constant `COOLANT_POOL`; `free = COOLANT_POOL − coolantUsed(state)` is derived, never stored. No scratch state is added.

## 4. Overdrive

- `maxLevel(kind) = STATION_MAX[kind] + (kind === Engineering ? 0 : STATION_OVERDRIVE)` with `STATION_OVERDRIVE = 1`. Engineering can never be overdriven (foundation §5).
- `shiftBar(state, i, +1)` succeeds when `level < maxLevel(kind)`, the pool has a bar, neither Engineering nor the target is failed (the 2a-i rules with the new ceiling). `shiftBar(−1)` is unchanged: dropping from `max + 1` to `max` is an ordinary bar move.
- `isOverdriven(state, i) = stationOnline(state, i) && level[i] > STATION_MAX[kind]`. A failed non-Engineering station has level 0 (bars returned to the pool) and so is never overdriven; failed Engineering keeps its reserved level 1 (2a-i) and is excluded by its ceiling anyway.
- `stationOutput` is unchanged: `(level / STATION_MAX) × curve`, so at skill 0 an overdriven Navigation, Science or Medbay runs at `1.5 × 0.75 = 1.125`, Weapons or Life Support at `1.0`, Doors at `1.5` (no effect until increment 3). Consumers already clamp where it matters (beam charge to 1, injection to the room clamp, health to `HEALTH_MAX`); hit and evasion thresholds simply rise (`beamHits` at Weapons level 4: `0.55 + 0.30 × 1.0 = 0.85`; `evades` at Navigation level 3: `0.20 + 0.40 × 1.125 = 0.65`).
- Allocations, overdrive and coolant assignments **persist when nobody is seated** (foundation §5). An unattended overdrive therefore overheats on its own unless two units hold it; that is the intended cost.
- The starter allocation (9 of 10 bars) leaves one spare bar. Only Doors (starter 1, max 1) can be overdriven with that bar alone; every other station is below its max at the start, so overdriving it means withdrawing a bar from elsewhere first (the gate script takes one from Life Support).

## 5. Heat and coolant

**Heat** (`heatStep`, every hazard tick, integer arithmetic, stations in ascending index):

```
if isOverdriven(i):  heat[i] = clamp(heat[i] + HEAT_RISE − coolant[i] × coolingPerUnit(state), 0, HEAT_MAX)
else:                heat[i] = max(0, heat[i] − HEAT_COOL_IDLE)
if heat[i] ≥ HEAT_MAX:  overheat(i)
```

`coolingPerUnit(state) = HEAT_COOL_UNIT + floor(HEAT_COOL_SKILL × skillLevel(seated Engineering operator))`, which is `HEAT_COOL_UNIT` today: the skill term is 0 with the stub and also when nobody is seated at Engineering (foundation: baseline applies unmanned). `HEAT_COOL_SKILL` is introduced in increment 3, not here; this increment defines `coolingPerUnit` as the single place that term will land.

**Overheat** (`heat[i] ≥ HEAT_MAX` after the update, in this order):

1. `failStation(state, i)`: the existing power failure (level 0, bars back to the pool, `repair = 0`, occupant forced to stand). It is repaired exactly like a spawned failure and counts toward `SPAWN_CAP` like one.
2. `heat[i] = 0`.
3. One `rng.hazards` draw `u`; if `u < OVERHEAT_FIRE_CHANCE`, `igniteRoom(state, stationRoom[i])`. The draw is always consumed; `igniteRoom` is a no-op if the room already burns.

A power failure from the spawner does **not** reset heat; the station is then idle (level 0) and its heat decays at `HEAT_COOL_IDLE`. Repairing a station never touches heat or coolant. Coolant assigned to a failed station stays assigned.

**Failed Engineering.** Its operator is forced to stand, so no coolant edit or bar move is possible until it is repaired (`cycleCoolant` is reachable only through seated Engineering input, like `shiftBar`). Heat is unaffected: overdriven stations keep heating at the baseline cooling rate with whatever coolant they hold, and repairing Engineering, or the overdriven station itself, preserves assignments and residual heat.

**Same-tick ordering consequences** (from the step order in §2; each is tested): a Left that drops a station out of overdrive, or a Confirm that adds the unit that balances it, on the tick its heat would reach the maximum prevents that overheat, because `consoleSystem` runs before `heatStep`; a Weapons shot fired on its station's overheat tick resolves before the failure; a Navigation overheat removes that tick's evasion roll, because `debrisSystem` runs after `heatStep`; Life Support still injects on its overheat tick (`lifeSupportInjection` precedes `heatStep`) while the Medbay does not heal on its (`medbayStep` follows); the spawner, running after `heatStep`, counts the new failure and any overheat fire toward `SPAWN_CAP` on that same tick.

**Coolant** (`cycleCoolant(state, i)`, called from Engineering Confirm):

- Preconditions (already true for any seated input): the operator is seated at an online Engineering console. The target is `stationOfKind[cursor]`; if it is `−1` or the Engineering station itself, nothing happens (Engineering cannot overdrive, so it holds no coolant).
- `next = coolant[i] + 1`; if `next > COOLANT_MAX_PER_STATION` or `free < 1`, `next = 0`. Assign `coolant[i] = next`. This is the foundation's "0, 1, 2 and back to 0; a step the pool cannot supply wraps to 0".
- Coolant may be assigned to a station at any level (pre-positioning before an overdrive is intended) and is never consumed: Σ `coolant` ≤ `COOLANT_POOL` is an invariant of every input.
- With `COOLANT_POOL = 4` and a cap of 2, two stations can be held indefinitely at once, or one held and two others slowed.

Worked numbers at the §6 values (hazard tick = 1/12 s): unassisted overdrive reaches `HEAT_MAX` after 120 hazard ticks (10 s); one unit nets `+1` per tick, 240 ticks (20 s); two units net 0 and hold; an idle station cools from max in 60 ticks (5 s). An overdriven Weapons station at skill 0 charges the beam in `6 / 1.0 = 6 s`, so one unassisted window fits one shot with margin; two consecutive shots need a unit or a drop back.

## 6. Tuning (first pass, all hypotheses)

```ts
STATION_OVERDRIVE = 1          // extra level above STATION_MAX for every kind except Engineering
HEAT_MAX = 240                 // integer heat units
HEAT_RISE = 2                  // per hazard tick while overdriven (10 s to max unassisted)
HEAT_COOL_UNIT = 1             // per coolant unit per hazard tick (1 unit: 20 s; 2 units: hold)
HEAT_COOL_IDLE = 4             // per hazard tick while not overdriven (5 s from max to 0)
COOLANT_POOL = 4
COOLANT_MAX_PER_STATION = 2
OVERHEAT_FIRE_CHANCE = 0.5     // rng.hazards, one draw per overheat
```

Everything from 2a-i and 2a-ii stays. `SPAWN_WEIGHTS`, `SPAWN_CAP` and the spawner are unchanged, so the unmanned survival gate seeds are unaffected (no overdrive exists without an Engineering input).

## 7. Input, HUD and rendering

- **Input/app:** unchanged. Engineering's seated controls are now: up/down select a station, right/left shift a bar (right may now reach `max + 1`), Confirm cycles the selected station's coolant.
- **HUD model** (`hudModel.ts`, pure): `EngineeringPanel.rows[]` gains `heat: number` (fraction `heat / HEAT_MAX`, 0..1), `coolant: number` (units) and `overdriven: boolean`; `EngineeringPanel` gains `coolantFree: number`. `max` stays `STATION_MAX[kind]` so the renderer can tell the overdrive cell from normal cells. `HudStation` gains the same `heat`, `coolant` and `overdriven` fields for the station strip.
- **Pixi HUD** (`hud.ts`): `cellRow` draws `max + 1` cell slots when `level > max`, the extra cell in the `WARN` tint; a thin heat bar (reusing `bar()`, `WARN` fill) under any row with `heat > 0`; a `C<n>` label after the cells when `coolant > 0`. The Engineering footer becomes `Pool <n>   Coolant <free>/<COOLANT_POOL>`. The station strip shows the same heat bar and `C<n>` label per station. No new icons.
- **Ship view:** no new effect. An overheat fire is drawn as a fire; the forced stand is visible as today.

## 8. Testing

All under node, no pixi. New file `tests/heat.test.ts`; extensions to `tests/power.test.ts`, `tests/console.test.ts`, `tests/snapshot.test.ts`, `tests/hud.test.ts`.

- **Heat** (fixtures have nobody at Engineering, so they also cover the unattended overdrive of §4; the spawner is disabled in every heat fixture so an unrelated failure cannot invalidate it): an overdriven station with no coolant gains exactly `HEAT_RISE` per hazard tick and nothing on non-hazard ticks; with one unit it gains `HEAT_RISE − HEAT_COOL_UNIT`; with two units heat is unchanged across 30 s; a station at `max` (not overdriven) with heat loses `HEAT_COOL_IDLE` per hazard tick down to 0 and never below; heat never exceeds `HEAT_MAX` (the overheat fires first). Overheat: after 120 hazard ticks unassisted the station is failed, its level is 0, its occupant (if any) has stood, `heat` is 0, exactly one `rng.hazards` draw was consumed (compare with a cloned stream advanced once), and the station's room burns when the pinned draw is below `OVERHEAT_FIRE_CHANCE` and does not when above (two pinned seeds, probed clear of 0.5); an already-burning room stays at its intensity and the draw is still consumed; a crew member standing in the room loses fire damage on the overheat tick itself; the forced stand resets the occupant's stick state. Two stations overheating on one hazard tick resolve in ascending station index with one draw each (a pinned stream whose first draw ignites and second does not, on two stations in different rooms, asserting both rooms and exactly two draws). The spawner on the overheat tick counts the new failure: with two breaches active and an overheat failure, `activeHazardCount` is `SPAWN_CAP` and the spawn is skipped (only the interval jitter is drawn from `rng.director`). A spawner-style `failStation` on a hot station leaves heat untouched and it then decays idle. Failed Engineering: an overdriven station with one unit keeps heating at `HEAT_RISE − HEAT_COOL_UNIT` while Engineering is failed; repairing Engineering, or failing and repairing the station itself, leaves coolant and heat as they were. Same-tick cases from §5: Navigation overheating on an impact tick draws no `rng.combat` roll and the hull takes the hit; Life Support's overheat tick still injects (`o2Counters.injected` grows); the Medbay's overheat tick heals nobody. `isOverdriven` is false for a failed station and for Engineering at any level. `stationOutput` of an overdriven Navigation at skill 0 is `1.125`; Weapons `1.0`.
- **Power:** `shiftBar(+1)` takes a max-2 station to 3 with a bar in the pool and refuses a fourth; refuses Engineering above 1; `−1` from `max + 1` returns the bar to the pool.
- **Console (Engineering seated):** Confirm on a non-Engineering row cycles coolant 0 → 1 → 2 → 0; with 3 units assigned elsewhere, Confirm on a station at 0 gives 1 and a second Confirm (pool exhausted) wraps to 0; Confirm on the Engineering row changes nothing; Σ coolant equals the pre-input sum plus the step; the seating Confirm is still consumed by `satThisTick` (the shared guard is covered by the existing 2a-i test that a Doors sit toggles no door; `sitDown` also resets the Engineering cursor to the Engineering row, so no separate coolant assertion is possible without mocking). Same-tick cases from §5: on the tick an overdriven station would overheat, a Left edge on it (to `max`) leaves it online with heat decayed by `HEAT_COOL_IDLE`, and a Confirm taking it from one unit to two leaves heat unchanged and the station online; a seated Weapons operator's Confirm on the Weapons overheat tick resolves the shot (one `rng.combat` draw, charge 0) and the station then fails and stands them.
- **Scripted-intent gate test** (replaces the 2a-i Engineering gate test's "Confirm does nothing" assertion): sit at Engineering; move the cursor to Life Support and Left once (2 → 1, pool 2); move the cursor to Weapons and Right twice (2 → 4: the fourth bar is the overdrive); Confirm twice (two units); run 30 s and assert Weapons is still level 4, not failed, `heat < HEAT_MAX`; Confirm once (wraps to 0 units); run until the station fails, asserting it happens within 10 s + 2 hazard ticks, that the Weapons seat (occupied by player 2 in the fixture) was vacated, and that heat is 0.
- **Property (fast-check):** random sequences of Engineering stick edges and Confirms over 60 s of stepping, checked after every hazard tick, keep Σ `coolant ≤ COOLANT_POOL`, every `coolant[i] ≤ COOLANT_MAX_PER_STATION`, `0 ≤ heat[i] ≤ HEAT_MAX`, `level[i] ≤ maxLevel(kind)`, and Σ `level ≤ capacity` (the foundation §10 overdrive properties).
- **Snapshot and hash:** round trip covers `heat` and `coolant`; mutating only `heat`, then only `coolant`, each changes the hash; a run with one unit on the overdriven station saved ten ticks before its overheat (tick 1185 of 1195), restored and continued through the failure and fire roll, hashes equal to the uninterrupted run; version-3 snapshots are rejected.
- **HUD model:** Engineering rows carry `heat`, `coolant`, `overdriven` and the panel `coolantFree`; `HudStation` carries the same three; values derived from tuning constants, not literals.
- **Boundary and existing suites:** unchanged and green. Survival gate seeds 1 to 3 unchanged (no spawner change).
- **Golden replay:** re-blessed once, in the task that bumps `SIM_VERSION` and adds the two arrays, with the cause in the commit message and in `.superpowers/sdd/progress.md`. Later tasks leave it unchanged unless a task's commit message states otherwise.

## 9. Gate

Added to `docs/gates.md` as "Increment 2b-i":

- The heat, power, console, property, snapshot and HUD-model tests pass; typecheck and build pass; survival gate seeds 1 to 3 pass unmanned.
- Manual, two players: an Engineering operator pushes Weapons to a fourth cell drawn in the warning tint and the heat bar climbs; two Confirms show `C2` and the bar stops climbing; at `C0` the bar reaches the top and Weapons shows `Power: Weapons` in the threat list with the Weapons operator stood up. Whether an overheat also starts a fire is a 50% roll and is **not** a gate condition (the pinned automated test covers ignition); note it if seen.

## 10. Open questions deferred

- Whether a hot station should throttle output before failing (a soft ceiling): no; the foundation's model is a hard failure, and the heat bar is the warning. Revisit after playtests.
- Whether coolant should also speed idle cooling: no (foundation: idle cooling is a flat base rate); it keeps "two units hold one station" the only rule to learn.
- Whether an overheat should also damage the seated operator: no; the forced stand and the fire chance are the cost. Revisit with 2b-ii if overdrive proves too cheap.

## 11. Amendments from the plan
- `maxLevel(kind)` lives in `sim/power.ts` next to `shiftBar` (section 2 put it in `heat.ts`); `heat.ts` imports `failStation` from `power.ts`, so the reverse placement would make an import cycle.
- `coolingPerUnit(state)` returns `HEAT_COOL_UNIT` with the skill term deferred to increment 3 (section 5 describes the future formula).
- The Pixi heat bar is a 2 px strip under the cells rather than reusing `bar()` (section 7), so it fits inside the 18 px row.
- The `overdrive(state, kind)` test helper lives in `tests/helpers/sim.ts` and widens `power.capacity` to 20 so heat fixtures never fight the pool; the spawner-cap fixture uses two breaches rather than fires because `fireStep` draws spread rolls from `rng.hazards` and would move the pinned overheat draw.
