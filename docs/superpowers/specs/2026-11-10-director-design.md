# Director (Increment 4-i) — Design

Status: approved 2026-11-10 under the autonomous feature loop (`docs/roadmap.md` item 3); every open choice took the recommended option. Parent: `2026-11-09-foundation-design.md` §5 (Hazards and the director), §7, §10, §11 item 4. Builds on everything merged through Increment 3-ii, in particular the productive predicates of 3-i (`sim/productive.ts`). Increment 4 is split in two: this half replaces the timer spawner with the director; **4-ii** adds the session telemetry log and the acceptance soak.

## 1. Goal

Replace the fixed 30-second timer spawner with a **director** that paces the run: a **stress** value summarising how much is going wrong drives a four-phase machine (Build Up, Sustain Peak, Peak Fade, Relax) that decides *when* spawns are allowed, while **elapsed-time escalation** decides *how much* (spawn rate, concurrency cap, per-cycle budget, type weights). Hazard selection stays seeded and weighted, down-weights the type just used, and at three or four players **routes** crises toward consoles whose operators have been idle longest. The design principle from the foundation holds: the director adjusts pacing, not difficulty; difficulty comes from overlap and shorter timers, never stronger hazards.

**Out of scope (later features):** the telemetry log, the acceptance observables and the long soak test (4-ii: this increment exposes the director's state so 4-ii only records it); enemy ships (roadmap 5); any change to the hazards themselves.

## 2. Decisions taken (recommended options)

| Question | Decision |
|---|---|
| Stress inputs | Weighted count of active hazards and Downed crew: fire 0.25 per burning room, breach 0.30, power failure 0.20, in-flight debris 0.20, Downed crew 0.40; the raw sum is clamped to 1. |
| Smoothing | Recomputed every `STRESS_PERIOD` (5 s): `stress += (raw − stress) × k`, `k = 0.5` when rising, `0.15` when falling, and `0.075` (half) when falling while any hazard is **unattended** (no Conscious crew member within `REACH` of it or repairing it). |
| Phase levels | Peak at stress ≥ 0.7, relax at stress ≤ 0.25. |
| Escalation shape | Spawn interval `SPAWN_INTERVAL / (1 + ESCALATION_RATE × minutes)` floored at `SPAWN_INTERVAL_MIN` (10 s); cap `SPAWN_CAP + floor(minutes / CAP_MINUTES)` capped at `SPAWN_CAP_MAX` (6); per-cycle budget `floor((BUDGET_BASE + BUDGET_GROWTH × minutes) × playerScale)`; type weights gain `+1` on debris and power per `WEIGHT_MINUTES` (4 min). |
| Player scaling | `playerScale = max(0.5, playerCount / 2)`: 1 player 0.5, 2 players 1, 3 players 1.5, 4 players 2. It scales the budget; the cap adds `floor((playerCount − 2) / 2)` (one more at 4 players); solo play also multiplies the spawn interval by `SOLO_INTERVAL_MULT` (1.5). |
| Recently used type | The weight of the type spawned last is halved for the next roll (integer weights, so 2 → 1, 1 → 0.5 is avoided by using doubled integer weights internally). |
| Routing | Enabled at 3 or 4 players: the type whose responding consoles have the longest `sinceProductive` (debris → min over Science, Weapons, Navigation; fire and breach → Doors; power → Engineering) gets `+ROUTE_BONUS` (2) when that idle time exceeds `ROUTE_IDLE_SECONDS` (60 s). |
| Where it runs | `director.ts` replaces `hazards/spawner.ts` at the same point in `step()`; the hazards keep their own RNG stream for targets; the director uses `rng.director` for every timing and type draw. |
| HUD | A dim line under the clock: `Build Up  stress 42%` (useful for playtests; 4-ii's telemetry reads the same fields). |
| Timer spawner | Deleted, not kept behind a flag; its tests become director tests. |

## 3. Architecture

| Module | Responsibility |
|---|---|
| `sim/director.ts` (new) | `activeHazardCount` (moved from the spawner), `rawStress`, `anyUnattended`, `updateStress`, `phaseStep`, escalation helpers (`spawnInterval`, `spawnCap`, `cycleBudget`, `typeWeights`), `chooseType`, `spawnHazard` (the type → target code moved from the spawner), `directorSystem`. |
| `sim/hazards/spawner.ts` | deleted. `pickSpawnType` becomes `chooseType(weights, roll)` over an explicit weight array. |
| `sim/productive.ts` | unchanged; read for routing and `sinceProductive`. |
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

All flattened in a `director` manifest section replacing `spawner` (`DIRECTOR_FIELDS = 8` scalars + 7 ints), snapshotted and hashed; `SIM_VERSION` becomes 8, version-7 snapshots are rejected. Initial: `BuildUp`, `phaseTick 0`, `stress 0`, `nextStressTick STRESS_PERIOD × TICK_HZ`, `nextSpawnTick SPAWN_FIRST × TICK_HZ`, `budgetLeft cycleBudget(0)`, `lastSpawnTick −1`, `lastType −1`, `sinceProductive` all 0.

`HazardType = { Fire: 0, Breach: 1, Power: 2, Debris: 3 }` replaces the string union.

## 5. Stress

Every `STRESS_PERIOD` seconds (`nextStressTick`):

- `raw = clamp(0.25 × fires + 0.30 × breaches + 0.20 × failedStations + 0.20 × debrisInFlight + 0.40 × downedCrew, 0, 1)`.
- `unattended`: any burning room with no Conscious crew member inside it, any active breach or failed station with no Conscious crew member within `REACH` of its tile, or any Downed crew member with no Conscious crew member within `REACH`. In-flight debris never counts as unattended (nobody can stand next to it).
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

Entering Build Up re-arms: `budgetLeft = cycleBudget(minutes, players)`, `nextSpawnTick = tick + interval(minutes, players) × jitter`. Phase changes set `phaseTick = tick`. Only one transition per tick.

Spawn attempt (Build Up, `tick ≥ nextSpawnTick`): draw jitter from `rng.director` and re-arm `nextSpawnTick` **first** (so a skipped attempt still advances timing, as today); if `activeHazardCount ≥ cap` stop; else `chooseType` with one `rng.director` roll over the current weights; pick the target from `rng.hazards` as the spawner does today (fire: a non-burning room; breach: a free site; power: a non-failed station; debris: `spawnDebris`); if the type has no valid target the attempt is skipped (no fallback). A successful spawn sets `lastSpawnTick = tick`, `lastType`, `budgetLeft −= 1`.

## 7. Escalation, weights and routing

`minutes = tick / (60 × TICK_HZ)` (a float).

- `spawnInterval(minutes, players) = max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL / (1 + ESCALATION_RATE × minutes)) × (players === 1 ? SOLO_INTERVAL_MULT : 1)`; jitter `× (1 ± SPAWN_JITTER)` as today.
- `spawnCap(minutes, players) = min(SPAWN_CAP_MAX, SPAWN_CAP + floor(minutes / CAP_MINUTES) + floor(max(0, players − 2) / 2))`.
- `cycleBudget(minutes, players) = max(1, floor((BUDGET_BASE + BUDGET_GROWTH × minutes) × max(0.5, players / 2)))`.
- `typeWeights(state)`: start from `SPAWN_WEIGHTS` doubled (`[4, 2, 2, 4]` for fire, breach, power, debris, so halving stays integral); add `2 × floor(minutes / WEIGHT_MINUTES)` to power and debris; halve the `lastType` entry (integer division, minimum 1); at 3 or 4 players add `2 × ROUTE_BONUS` to the routed type (below). `chooseType(weights, roll)` maps `roll × Σweights` onto the intervals in type order.
- **Routing** (players ≥ 3): `idle(kind) = sinceProductive[kind] / TICK_HZ`. Candidate idle times: debris → `min(idle(Science), idle(Weapons), idle(Navigation))` (the handoff needs all three, so the least idle of them governs), fire and breach → `idle(Doors)`, power → `idle(Engineering)`. The type with the largest candidate idle time gets the bonus if that time exceeds `ROUTE_IDLE_SECONDS`; ties go to the earlier type in `HazardType` order. Disabled at 1 or 2 players (foundation: a small crew cannot staff every console).
- **`sinceProductive`** (every tick, in `directorSystem`): for each station kind present on the ship, `0` if the station is online with a Conscious seated operator and `isProductive`, else `min(SINCE_CAP, value + 1)`. Weapons and Life Support use their stamp-based predicates from 3-i. Stations whose console is not on the ship stay 0.

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

Worked numbers: at minute 0 the interval is 30 s, cap 3, budget 3 (two players); at minute 5 the interval is 20 s, cap 4, budget 5; at minute 10 the interval is 15 s, cap 5 and the demanding weights have doubled. A Build Up with budget 3 and 30 s intervals lasts about 90 s unless stress peaks first, then 10 s sustain, up to 30 s fade and 30 to 60 s relax: a cycle of two to three minutes early on, shortening as the run goes.

## 9. HUD

`HudModel.director: { phase: 'Build Up' | 'Sustain Peak' | 'Peak Fade' | 'Relax'; stress: number }` (zeros/`'Build Up'` with no state). `hud.ts` draws `${phase}  stress ${Math.round(stress × 100)}%` in `DIM` on a second line of the top-left panel (the panel grows from 40 to 58 px). Nothing else changes.

## 10. Testing

All under node, no pixi. New `tests/director.test.ts` (absorbing `tests/spawner.test.ts`, which is deleted); extended `tests/snapshot.test.ts`, `tests/hud.test.ts`, `tests/gate-survival.test.ts` (unchanged assertions; figures re-recorded).

- **Stress:** `rawStress` for each weight with one of each hazard and a Downed crew member; clamps at 1 with many hazards; smoothing rises by `0.5 × gap` and falls by `0.15 × gap` per period; falls by `0.075 × gap` while a fire burns with nobody inside it; `anyUnattended` true for a fire with no crew in the room, false with a crew member inside; true for a breach with nobody within reach; false for in-flight debris alone; recompute happens exactly every `STRESS_PERIOD` seconds and never between.
- **Phase machine (transition table, each row a test):** Build Up → Sustain Peak on stress ≥ 0.7 (set `stress` directly before the tick), on budget exhausted (budget 1, one spawn), and on the stall timer (60 s without a spawn because the cap is full of unrepairable fires in a crew-less state); Sustain Peak → Peak Fade after exactly 10 s; Peak Fade → Relax on stress ≤ 0.25 and on the 30 s timeout with stress held high; Relax → Build Up when 30 s have passed with stress ≤ 0.25, not before 30 s even at zero stress, and at 60 s regardless of stress; re-entering Build Up re-arms the budget and the spawn timer; no spawn happens in Sustain Peak, Peak Fade or Relax even with `nextSpawnTick` in the past; only one transition per tick.
- **Spawning:** the first attempt at `SPAWN_FIRST`; a blocked attempt (cap full) re-arms the timer without a type roll (director stream advanced exactly once); a successful attempt draws jitter then one type roll; a type with no valid target skips (hazards stream untouched, director advanced twice); the four explicit-roll fixtures from the old spawner tests, converted to the doubled weight table; in-flight debris and failed stations count toward the cap; `lastType` halves that type's weight on the next roll (two consecutive fires require a roll in the shrunk interval: assert with explicit weights through `chooseType`).
- **Escalation:** `spawnInterval` at minutes 0, 5, 10 and the floor at minute 20 (10 s); solo multiplier; `spawnCap` at minutes 0, 4, 8 and the cap of 6, plus the 4-player +1; `cycleBudget` at 1, 2, 3 and 4 players at minute 0 and minute 4; `typeWeights` at minute 0 (`[4, 2, 2, 4]`), minute 4 (`[4, 2, 4, 6]`), after a fire (`[2, 2, 2, 4]`), and with routing.
- **Routing:** with 3 players and Doors idle 61 s while everything else is productive or 0, fire and breach gain `+4` each in the doubled table; with Science idle 61 s but Weapons at 0, debris gains nothing (the minimum governs); at 2 players no bonus; ties resolve to the earlier type.
- **sinceProductive:** counts up every tick, resets to 0 on a productive tick (seated Navigation with a warned object), caps at `SINCE_CAP`, stays 0 for a kind not on the ship (a layout without a Doors console).
- **Snapshot and hash:** round trip of the `director` block with non-default values; mutating `stress`, `phase` and one `sinceProductive` entry each changes the hash; version-7 rejection; a run saved mid-Build-Up continues like an uninterrupted run through two phase changes.
- **Survival gate:** seeds 1 to 3 with the default crew still survive 5 minutes; record the new min hull and impact counts in `docs/gates.md`. If a seed fails, raise `SPAWN_INTERVAL_MIN` to 15 or lower `ESCALATION_RATE` to 0.05 and record the change; do not weaken the gate.
- **Headless soak (one test, about 20 sim minutes with the bot crew):** every phase is entered at least twice, no Build Up lasts longer than `STALL_SECONDS + 1` s without a spawn or a transition, no Relax lasts longer than `RELAX_MAX + 1` s, and stress stays in 0..1. (4-ii extends this into the acceptance soak.)
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
