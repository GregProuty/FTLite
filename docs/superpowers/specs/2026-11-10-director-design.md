# Director (Increment 4-i) — Design

Status: approved 2026-11-10 under the autonomous feature loop (`docs/roadmap.md` item 3); every open choice took the recommended option. Parent: `2026-11-09-foundation-design.md` §5 (Hazards and the director), §7, §10, §11 item 4. Builds on everything merged through Increment 3-ii, in particular the productive predicates of 3-i (`sim/productive.ts`). Increment 4 is split in two: this half replaces the timer spawner with the director; **4-ii** adds the session telemetry log and the acceptance soak.

## 1. Goal

Replace the fixed 30-second timer spawner with a **director** that paces the run: a **stress** value summarising how much is going wrong drives a four-phase machine (Build Up, Sustain Peak, Peak Fade, Relax) that decides *when* spawns are allowed, while **elapsed-time escalation** decides *how much* (spawn rate, concurrency cap, per-cycle budget, type weights). Hazard selection stays seeded and weighted, down-weights the type just used, and at three or four players **routes** crises toward consoles whose operators have been idle longest. The design principle from the foundation holds: the director adjusts pacing, not difficulty; difficulty comes from overlap and shorter timers, never stronger hazards.

**Out of scope (later features):** the telemetry log, the acceptance observables and the long soak test (4-ii: this increment exposes the director's state so 4-ii only records it); enemy ships (roadmap 5); any change to the hazards themselves.

## 2. Decisions taken (recommended options)

| Question | Decision |
|---|---|
| Stress inputs | Weighted count of active hazards and Downed crew: fire 0.25 per burning room, breach 0.30, power failure 0.20, in-flight debris 0.20, Downed crew 0.40; the raw sum is clamped to 1. |
| Smoothing | Recomputed every `STRESS_PERIOD` (5 s): `stress += (raw − stress) × k`, `k = 0.5` when rising, `0.15` when falling, and `0.075` (half) when falling while any hazard is **unattended** (one definition, §5). |
| Phase levels | Peak at stress ≥ 0.7, relax at stress ≤ 0.25. |
| Escalation shape | Spawn interval `SPAWN_INTERVAL / (1 + ESCALATION_RATE × minutes)` floored at `SPAWN_INTERVAL_MIN` (10 s); cap `SPAWN_CAP + floor(minutes / CAP_MINUTES)` capped at `SPAWN_CAP_MAX` (6); per-cycle budget `floor((BUDGET_BASE + BUDGET_GROWTH × minutes) × playerScale)`; type weights gain `+1` on debris and power per `WEIGHT_MINUTES` (4 min). |
| Player scaling | `playerScale = max(0.5, playerCount / 2)`: 1 player 0.5, 2 players 1, 3 players 1.5, 4 players 2. It scales the budget; the cap adds `floor((playerCount − 2) / 2)` (one more at 4 players) and loses one at a single player (never below 1; `SPAWN_CAP_MAX` is not scaled); solo play also multiplies the spawn interval by `SOLO_INTERVAL_MULT` (1.5). |
| Recently used type | The weight of the type spawned last is halved for the next roll (integer weights, so 2 → 1, 1 → 0.5 is avoided by using doubled integer weights internally). |
| Routing | Enabled at 3 or 4 players: hazard types are grouped by responding console (§7); every type in the group (or groups, on a tie) whose consoles have been idle longest gets `+ROUTE_BONUS` (2) when that idle time exceeds `ROUTE_IDLE_SECONDS` (60 s). |
| Observation point | `sinceProductive` is updated by `xpSystem` right after `consoleSystem`, the same observation point 3-i chose for XP, so the director and XP never disagree about who was productive on a tick. |
| Where it runs | `director.ts` replaces `hazards/spawner.ts` at the same point in `step()`; the hazards keep their own RNG stream for targets; the director uses `rng.director` for every timing and type draw. |
| HUD | A dim line under the clock: `Build Up  stress 42%` (useful for playtests; 4-ii's telemetry reads the same fields). |
| Timer spawner | Deleted, not kept behind a flag; its tests become director tests. |

## 3. Architecture

| Module | Responsibility |
|---|---|
| `sim/director.ts` (new) | `activeHazardCount` (moved from the spawner), `rawStress`, `anyUnattended`, `updateStress`, `phaseStep`, escalation helpers (`spawnInterval`, `spawnCap`, `cycleBudget`, `typeWeights`), `chooseType`, `spawnHazard` (the type → target code moved from the spawner), `directorSystem`. |
| `sim/hazards/spawner.ts` | deleted. `pickSpawnType` becomes `chooseType(weights, roll)` over an explicit weight array. |
| `sim/productive.ts` | unchanged; read for routing and `sinceProductive`. |
| `sim/xp.ts` | `xpSystem` also maintains `director.sinceProductive` for every station kind on the ship (including Weapons and Life Support through their stamp predicates), at the observation point. |
| `sim/state.ts`, `flatten.ts` | `director` block replaces `spawner`; `SIM_VERSION = 8`. |
| `sim/tuning.ts` | the constants in §8; `SPAWN_WEIGHTS` becomes the base weight array. |
| `render/hudModel.ts`, `hud.ts` | `HudModel.director: { phase: string; stress: number }`; one dim text line. |

Step order: unchanged except that `directorSystem` sits where `spawner` was (after the hazard tick, before `debrisSystem`).

## 4. Authoritative state

```ts
director: {
  phase: number;             // Phase.BuildUp 0, SustainPeak 1, PeakFade 2, Relax 3
  phaseTick: number;         // tick the current phase began
  stress: number;            // smoothed 0..1
  nextStressTick: number;    // next recompute (every STRESS_PERIOD)
  nextSpawnTick: number;     // next spawn attempt (Build Up only)
  budgetLeft: number;        // spawns left in this Build Up cycle
  lastSpawnTick: number;     // -1 none (stall timer base is max(lastSpawnTick, phaseTick))
  lastType: number;          // HazardType of the last spawn, -1 none
  sinceProductive: Int32Array;   // per StationKind, ticks since that console was last productive (capped at SINCE_CAP)
};
```

All flattened in a `director` manifest section replacing `spawner` (`DIRECTOR_FIELDS = 8` scalars + 7 ints), snapshotted and hashed; `SIM_VERSION` becomes 8, version-7 snapshots are rejected. Initial: `BuildUp`, `phaseTick 0`, `stress 0`, `nextStressTick STRESS_PERIOD × TICK_HZ`, `nextSpawnTick SPAWN_FIRST × TICK_HZ` (fixed, no draw), `budgetLeft cycleBudget(0, playerCount)`, `lastSpawnTick −1`, `lastType −1`, `sinceProductive` all 0.

`HazardType = { Fire: 0, Breach: 1, Power: 2, Debris: 3 }` replaces the string union.

## 5. Stress

Every `STRESS_PERIOD` seconds (`nextStressTick`):

- `raw = clamp(0.25 × fires + 0.30 × breaches + 0.20 × failedStations + 0.20 × debrisInFlight + 0.40 × downedCrew, 0, 1)`.
- `unattended` (the single definition, matching the repair geometry): a burning room with no Conscious crew member whose centre is in it (`roomAt`); an active breach or failed station with no Conscious crew member within `REACH` of its tile (`inReachOfTile`); a Downed crew member with no Conscious crew member within `REACH` centre to centre. Downed and Dead crew never count as attendants. In-flight debris never counts as unattended (nobody can stand next to it): this narrows the foundation's blanket "unattended hazard" rule and is recorded as an amendment to it.
- `k = raw > stress ? STRESS_RISE : (unattended ? STRESS_FALL × 0.5 : STRESS_FALL)`; `stress += (raw − stress) × k`; clamp to 0..1.

The asymmetry (`0.5` up, `0.15` down) makes stress jump within one or two periods when things go wrong and take about 30 s to settle after they are fixed; the unattended halving keeps a neglected fire from letting the ship relax.

## 6. Phases

Checked every tick after the stress update. `elapsed = (tick − phaseTick) / TICK_HZ`.

| Phase | Spawns | Exits when |
|---|---|---|
| Build Up | yes, when `tick ≥ nextSpawnTick` and `activeHazardCount < spawnCap(minutes, players)`; a blocked attempt is skipped (not queued) and `nextSpawnTick` is re-armed | `stress ≥ PEAK_LEVEL`, **or** `budgetLeft === 0`, **or** `tick − max(lastSpawnTick, phaseTick) ≥ STALL_SECONDS × TICK_HZ` (60 s with no spawn) → Sustain Peak |
| Sustain Peak | no | `elapsed ≥ SUSTAIN_SECONDS` (10 s) → Peak Fade |
| Peak Fade | no | `stress ≤ RELAX_LEVEL` **or** `elapsed ≥ FADE_TIMEOUT` (30 s) → Relax |
| Relax | no | (`elapsed ≥ RELAX_MIN` (30 s) **and** `stress ≤ RELAX_LEVEL`) **or** `elapsed ≥ RELAX_MAX` (60 s) → Build Up |

**Per-tick order inside `directorSystem`:** (1) if `tick ≥ nextStressTick`, update stress (§5) and re-arm `nextStressTick += STRESS_PERIOD × TICK_HZ`; (2) evaluate the current phase's exit conditions and apply at most one transition; (3) if the phase is (still) Build Up and `tick ≥ nextSpawnTick`, make a spawn attempt; (4) if that attempt succeeded and `budgetLeft` reached 0, transition to Sustain Peak at once (this is the only transition that may follow a spawn on the same tick, and only when step 2 made none). Exit conditions are therefore checked **before** spawning, so a stall or a peak reached on a due-spawn tick spawns nothing and draws nothing.

Re-arming contract: entering Build Up draws exactly one `rng.director` float `u` and sets `nextSpawnTick = tick + round(spawnInterval(minutes, players) × TICK_HZ × jitter)` with `jitter = 1 + SPAWN_JITTER × (2u − 1)`, and `budgetLeft = cycleBudget(minutes, players)`. Every phase change sets `phaseTick = tick`. The initial arming at creation is `SPAWN_FIRST × TICK_HZ` with no draw.

Spawn attempt (step 3): draw `u` from `rng.director` and re-arm `nextSpawnTick` with the same formula **first** (so a skipped attempt still advances timing, as today); if `activeHazardCount ≥ spawnCap` stop (no type roll); else one `rng.director` roll chooses the type over the current weights; the target comes from `rng.hazards` as the spawner does today (fire: a non-burning room; breach: a free site; power: a non-failed station; debris: `spawnDebris`); a type with no valid target is skipped (no fallback, no hazards draw). A successful spawn sets `lastSpawnTick = tick`, `lastType`, `budgetLeft −= 1`.

## 7. Escalation, weights and routing

`minutes = tick / (60 × TICK_HZ)` (a float).

- `spawnInterval(minutes, players) = max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL / (1 + ESCALATION_RATE × minutes)) × (players === 1 ? SOLO_INTERVAL_MULT : 1)`; jitter `× (1 ± SPAWN_JITTER)` as today.
- `spawnCap(minutes, players) = max(1, min(SPAWN_CAP_MAX, SPAWN_CAP + floor(minutes / CAP_MINUTES) + floor(max(0, players − 2) / 2)) − (players === 1 ? 1 : 0))` (solo play runs one hazard lower, per the foundation; the ceiling itself is not scaled).
- `cycleBudget(minutes, players) = max(1, floor((BUDGET_BASE + BUDGET_GROWTH × minutes) × max(0.5, players / 2)))`.
- `typeWeights(state)`: start from `SPAWN_WEIGHTS` doubled (`[4, 2, 2, 4]` for fire, breach, power, debris, so halving stays integral); add `2 × floor(minutes / WEIGHT_MINUTES)` to power and debris; halve the `lastType` entry (integer division, minimum 1); then, at 3 or 4 players, add `2 × ROUTE_BONUS` to every routed type (below). `chooseType(weights, roll)` maps `roll × Σweights` onto the intervals in type order.
- **Routing** (players ≥ 3): `idle(kind) = sinceProductive[kind] / TICK_HZ`; a console not on the ship has idle 0. Each type has a **responding-console idle time**: fire → `idle(Doors)`; breach → `min(idle(Doors), idle(LifeSupport))` (the breach is Doors' job, and Life Support's once it is repaired and the room must refill, so an active Life Support operator makes breaches less overdue); power → `idle(Engineering)`; debris → `min(idle(Science), idle(Weapons), idle(Navigation))` (the handoff needs all three, so the least idle governs). The largest idle time wins if it exceeds `ROUTE_IDLE_SECONDS`, and **every type tied at that maximum** gets the bonus (so fire and breach both gain it when Doors is the idle console and Life Support is at least as idle). Disabled at 1 or 2 players (foundation: a small crew cannot staff every console).
- **`sinceProductive`** (every tick, in `xpSystem`, at the observation point right after `consoleSystem`): for each station kind present on the ship, `0` if the station is online with a Conscious seated operator and `isProductive`, else `min(SINCE_CAP, value + 1)`. Weapons and Life Support use their stamp-based predicates from 3-i (`lastShotTick`, `lsDeliveredTick`). Stations whose console is not on the ship stay 0.

## 8. Tuning (first pass, all hypotheses)

```ts
SIM_VERSION = 8
STRESS_PERIOD = 5                        // seconds between stress recomputes
STRESS_WEIGHTS = { fire: 0.25, breach: 0.30, power: 0.20, debris: 0.20, downed: 0.40 }
STRESS_RISE = 0.5, STRESS_FALL = 0.15    // smoothing factors per period; falling is halved while a hazard is unattended
PEAK_LEVEL = 0.7, RELAX_LEVEL = 0.25
SUSTAIN_SECONDS = 10, FADE_TIMEOUT = 30, RELAX_MIN = 30, RELAX_MAX = 60, STALL_SECONDS = 60
SPAWN_FIRST = 15, SPAWN_INTERVAL = 30, SPAWN_JITTER = 0.2, SPAWN_CAP = 3      // kept
SPAWN_INTERVAL_MIN = 10, ESCALATION_RATE = 0.1 per minute, SOLO_INTERVAL_MULT = 1.5
SPAWN_CAP_MAX = 6, CAP_MINUTES = 4
BUDGET_BASE = 3, BUDGET_GROWTH = 0.5 per minute
WEIGHT_MINUTES = 4
ROUTE_BONUS = 2, ROUTE_IDLE_SECONDS = 60
SINCE_CAP = 36000                        // 10 minutes of ticks
```

Worked numbers (two players): at minute 0 the interval is 30 s, cap 3, budget 3, weights `[4, 2, 2, 4]`; at minute 5 the interval is 20 s, cap 4, budget 5; at minute 10 the interval is 15 s, cap 5, budget 8 and the base weights are `[4, 2, 6, 8]` (power tripled, debris doubled); the interval floor of 10 s binds from minute 20 on (minute 30 still gives 10 s, not 7.5 s). Solo: interval × 1.5 and cap one lower (2 at minute 0). A Build Up with budget 3 and 30 s intervals lasts about 90 s unless stress peaks first, then 10 s sustain, up to 30 s fade and 30 to 60 s relax: a cycle of two to three minutes early on, shortening as the run goes.

## 9. HUD

`HudModel.director: { phase: 'Build Up' | 'Sustain Peak' | 'Peak Fade' | 'Relax'; stress: number }` (zeros/`'Build Up'` with no state). `hud.ts` draws `${phase}  stress ${Math.round(stress × 100)}%` in `DIM` on a second line of the top-left panel (the panel grows from 40 to 58 px). Nothing else changes.

## 10. Testing

All under node, no pixi. New `tests/director.test.ts` (absorbing `tests/spawner.test.ts`, which is deleted); extended `tests/snapshot.test.ts`, `tests/hud.test.ts`, `tests/gate-survival.test.ts` (unchanged assertions; figures re-recorded).

- **Stress:** `rawStress` for each contribution **separately** and below saturation (one fire → 0.25, one breach → 0.30, one failed station → 0.20, one in-flight object → 0.20, one Downed crew member → 0.40), then the clamp at 1 with many hazards; smoothing rises by `0.5 × gap` and falls by `0.15 × gap` per period; falls by `0.075 × gap` while any hazard is unattended; `anyUnattended` has an attended and an unattended fixture per category (fire: a Conscious crew member inside the room vs none; breach and failed station: within `REACH` of the tile vs just outside; Downed crew: a Conscious teammate within `REACH` vs none), a Downed or Dead crew member standing next to a hazard does not attend it, and in-flight debris alone is never unattended; recompute happens exactly every `STRESS_PERIOD` seconds and never between.
- **Phase machine (transition table, each row a test, driven through the exported `phaseStep(state)` with the director fields set directly so each exit condition is isolated and the others held false):** Build Up → Sustain Peak on `stress ≥ 0.7` (budget positive, stall far away); on budget exhaustion through a real due spawn with stress low (assert `budgetLeft` decremented to 0 and the transition on that same tick); on the stall timer with stress 0.3 and budget 2: Build Up one tick before `max(lastSpawnTick, phaseTick) + 60 s`, Sustain Peak at it, for both `lastSpawnTick > phaseTick` and the initial `lastSpawnTick = −1`; Sustain Peak → Peak Fade not at 10 s − 1 tick, yes at 10 s; Peak Fade → Relax on `stress ≤ 0.25` and, with stress held at 0.9 (stress recomputes suppressed by setting `nextStressTick` far ahead), not before and yes at the 30 s timeout; Relax → Build Up not at 30 s − 1 tick with stress 0, yes at 30 s with stress 0, not at 30 s with stress 0.5, yes at 60 s with stress 0.9; re-entering Build Up re-arms the budget and the spawn timer with exactly one director draw; no spawn happens in Sustain Peak, Peak Fade or Relax even with `nextSpawnTick` in the past; a peak reached on a due-spawn tick spawns nothing and draws nothing; only one transition per tick.
- **Spawning (every fixture first establishes Build Up, a positive budget, low stress and a due attempt through a test helper `armSpawn(state)`):** the first attempt at `SPAWN_FIRST`; a blocked attempt (cap full) re-arms the timer and advances the director stream exactly once (jitter) with no type roll; a successful attempt draws jitter then one type roll; a type with no valid target skips (hazards stream untouched, director advanced twice); the four explicit-roll fixtures from the old spawner tests, converted to the doubled weight table; in-flight debris and failed stations count toward the cap; the same-tick forced-stand fixture uses the known power-roll director state with every other station already failed so the roll must pick Navigation; after a successful fire spawn `lastType` is Fire and `typeWeights(state)` returns `[2, 2, 2, 4]`, after a breach `[4, 1, 2, 4]` (minimum 1), and the halving happens before the routing bonus.
- **Escalation:** `spawnInterval` at minutes 0, 5, 10, 20 and 30 (the last two both 10 s, proving the floor binds); solo multiplier; `spawnCap` at minutes 0, 4, 8 and the ceiling of 6, the 4-player +1 and the solo −1 (never below 1); `cycleBudget` at 1, 2, 3 and 4 players at minute 0 and minute 4; `typeWeights` at minute 0 (`[4, 2, 2, 4]`), minute 4 (`[4, 2, 4, 6]`), minute 10 (`[4, 2, 6, 8]`), after a fire (`[2, 2, 2, 4]`), and with routing.
- **Routing:** with 3 players at minute 0 and no previous type: Doors idle 61 s and Life Support idle 0 → `[8, 2, 2, 4]` (fire only); Doors idle 61 s and Life Support idle 90 s → `[8, 6, 2, 4]` (fire and breach tie at 61); Engineering idle 61 s alone → `[4, 2, 6, 4]`; Science, Weapons and Navigation all idle 61 s → `[4, 2, 2, 8]`; Science idle 61 s with Weapons at 0 → no bonus (the minimum governs); exactly 60 s → no bonus, 61 s → bonus; at 2 players no bonus ever.
- **sinceProductive:** counts up every tick; resets to 0 only when the station is online with a Conscious seated operator and productive (fixtures: occupied + productive resets; unoccupied with a warned object counts; occupied but offline counts; occupied and unproductive counts); Weapons resets on a shot and counts again after the stamp window; Life Support resets on a delivering hazard tick and counts once the stamp expires; caps at `SINCE_CAP`; stays 0 for a kind not on the ship (a layout without a Doors console).
- **Snapshot and hash:** a fresh state has exactly the §4 initial values; after loading a snapshot with distinct non-default values every one of the eight scalars and seven counters equals the saved value; mutating each of the fifteen fields alone changes the hash; version-7 rejection by header and by the flattened version; a run saved mid-Build-Up continues like an uninterrupted run, and the test counts the phase transitions in the continued stretch and asserts at least two.
- **Survival gate:** seeds 1 to 3 with the default crew still survive 5 minutes; record the new min hull and impact counts in `docs/gates.md`. If a seed fails, raise `SPAWN_INTERVAL_MIN` to 15 or lower `ESCALATION_RATE` to 0.05 and record the change; do not weaken the gate.
- **Headless soak (one test, 72,000 ticks = 20 sim minutes, seed 1, the default crew driven by `botIntent`, with a harness cheat that resets `hull` to `HULL_MAX` and every crew member's health to `HEALTH_MAX` after each tick so the run cannot end and the pacing machine is observed in full):** `tick === 72000` and `ended === 0` at the end; every phase entered at least twice; from any tick in Build Up, `tick − max(lastSpawnTick, phaseTick) ≤ STALL_SECONDS × TICK_HZ + 1`; no Relax lasts longer than `RELAX_MAX` s + 1 tick; stress stays in 0..1 throughout. The test sets its own vitest timeout (60 s) and the implementer records the measured runtime in the task report. (4-ii extends this into the acceptance soak.)
- **HUD model:** phase name and stress percentage.
- **Golden replay:** re-blessed once (version 8, the director replacing the timer, phase-gated spawns) with the cause recorded.

## 11. Gate

Added to `docs/gates.md` as "Increment 4-i":

- The director, snapshot, HUD and survival tests pass, including the transition table and the 20-minute soak; typecheck and build pass.
- Manual, two players: the top-left panel cycles through `Build Up`, `Sustain Peak`, `Peak Fade` and `Relax` over a few minutes; hazards arrive only during `Build Up`; after about five minutes spawns come noticeably faster than at the start.

## 12. Open questions deferred

- Whether stress should also count low hull or a low-oxygen room: not in this increment; revisit with the telemetry in 4-ii.
- Whether routing should ever target Medbay (foundation: no, injuries drive it): no.
- A solo "drone" crew member: sub-project 4.
