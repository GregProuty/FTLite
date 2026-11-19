# Asteroids-iii: an orbiting belt, slow pieces and visible gravity (design)

**Date:** 2026-11-19.
**Branch:** `spike/asteroids-iii`.
**Builds on:** Asteroids-ii (`docs/superpowers/specs/2026-11-18-asteroids-ii-design.md`, merged at 1dd2740e).
**Research:** `reports/Orbital gravity and fragmenting asteroids.md`, with its notes in
`research_notes/Orbital gravity and fragmenting asteroids/`.
**Revision 2:** the Fable review's findings are applied. The table at the end lists each finding and its fix.

## 1. Goal and owner decisions

The owner wants asteroids that visibly respond to gravity. A torpedo hit should blow a rock into several pieces, and those
pieces should fly out and billiard into the other asteroids. The physics should be worked out with formulas so that it stays
cheap for a few hundred bodies. The owner also wants the crack drawing on damaged rocks redone, because it looks bad and some
lines fall outside the rock (§7.3).

Gravity cannot be seen today for three reasons:
- **The pieces are too fast.** They leave at 150 to 200 u/s. Escape speed at the belt is about 64.5 u/s and the pull there is
  about 1.74 u/s², so the pieces fly straight and are gone before the pull can bend them.
- **Belt rocks don't move.** They stay still until something wakes them.
- **Plain drag of 0.1/s kills orbits.** It drains a rock's orbital speed, and a circling rock falls into the planet in about
  47 s.

Owner decisions, all made on 2026-11-19:

| # | Decision |
|---|---|
| D1 | The belt rotates, in the same direction as the ships' orbits. |
| D2 | Real shear: each orbit moves at its own circular speed, so the gaps smear out over a duel. The review showed that free shear inside a 14%-filled belt makes rocks touch all the time (finding 1). So the belt is built as **lanes** (§3.5). Rocks in one lane share an orbit, and the lanes shear past each other at their true speeds. Each cluster turns as one group. This keeps D2's look (shear, smearing gaps) and stops the touching. The owner may still pick a rigid belt instead. |
| D3 | Escaping pieces are fine. They loop back off the edge (D5). |
| D4 | GM stays at 2.5e6, because the owner likes how Helm feels now. |
| D5 | Rocks that reach the edge slingshot back. They no longer turn to dust at the edge. |
| D6 | Torpedo gravity is dropped from this work. Lasers stay straight. |
| D7 | The moon is its own spec, after this one. |
| D8 | Architecture A: rocks on rails, worked out from the tick, cost no bytes per tick. |
| D9 | The burst kick is medium: real pieces leave at 0.30 to 0.60 of escape speed. |
| D10 | Redraw the cracks so they stay inside the outline and read as fractures (§7.3). |

## 2. Terms and shared formulas

- **Orbital radius:** written ρ = |p| for a point p = (x, y) in the plane. The planet is at the origin.
- **Rock radius:** written r. It is the rock's size, never its distance from the planet.
- **Softened forms:** let q(ρ) = ρ² + ε². Then:
  - circular speed is `v_c(ρ) = ρ · sqrt(GM / (q·sqrt(q)))`;
  - escape speed is `v_esc(ρ) = sqrt(2·GM / sqrt(q))`;
  - the circular velocity vector is `V_c(p) = sqrt(GM / (q·sqrt(q))) · (−y, x)`, which needs no division by ρ.
- **Prograde:** the direction `spawnAt` gives ships (heading + 64, in `map.ts`). That is t̂ = (−y, x)/ρ. A test checks
  `V_c(spawn position)` against `spawnAt`'s velocity.
- **Rail step:** θ(ρ_ω) = ω · DT, with ω = sqrt(GM / (q·sqrt(q))) taken at the rail's ω-radius ρ_ω (§3.1).
  - Typical values: θ ≈ 6.3e-4 rad at ρ 1200, 2.2e-4 at ρ 2400 and about 0.037 at ρ 78.
  - The step's cosine and sine come from series that stay accurate to about 1e-16 for θ < 0.05:
    - `c = 1 − θ²/2 + θ⁴/24 − θ⁶/720 + θ⁸/40320`
    - `s = θ − θ³/6 + θ⁵/120 − θ⁷/5040 + θ⁹/362880`
  - One step turns a point prograde: p′ = (c·x − s·y, s·x + c·y).
  - No rail is ever made with ρ_ω < 150 (§3.4), so θ stays under 0.05.
- **Allowed maths:** all new sim code obeys the determinism guard: + − × ÷ and `Math.sqrt` only. No `**`, `Math.pow`,
  `Math.hypot` or trig. Fixed constants are written as literals, for example S45 = 0.7071067811865476.

## 3. The rock pool and rails

### 3.1 Layout
- **Stride:** `ROCK_STRIDE` goes from 7 to 8 values: `kind, x, y, vx, vy, r, hp, t`.
- **Kinds:** `Gone 0`, `Rail 1` (replaces `Static`) and `Free 2` (today's `Moving`, renamed).
- **A Rail slot:**
  - `x, y` hold its position at tick t.
  - `vx` holds its ω-radius ρ_ω, the radius whose angular rate it turns at. For a belt rock or a rejoined rock that is its own
    ρ. For a cluster rock it is the cluster centre's ρ (§3.5).
  - `vy` is 0.
  - Nothing in a Rail slot changes while it stays on its rail, so it costs no delta bytes.
- **A Free slot:** `x, y, vx, vy` are live, and t is the tick it was last born, freed or pushed (§3.4).
- **Reserve:** `ROCK_RESERVE` goes from 96 to 160.
- **Hash and snapshot:** the pool is still hashed and snapshotted as one vector.
- **Restore validation (new):**
  - kind is in 0..2;
  - t is a whole number in 0..tick;
  - a Rail has ρ ≥ 150 and ρ_ω ≥ 150;
  - r is in [`ROCK_MIN_R`, 60];
  - hp > 0 for any rock that is not Gone.

### 3.2 Where a rail rock is: `railPos(s, k, T)`
`railPos(s, k, T)` is a pure function of slot k's values and the tick T.
1. Let n = T − t, with n ≥ 0.
2. Raise the step (c, s) from θ(ρ_ω) to the power n, by repeated squaring of complex numbers. A 3-hour game is about 648,000
   ticks, which takes at most about 39 multiplications.
3. Turn (x, y) by the result, giving w.
4. Rescale to the rock's own radius: `p = ρ0 · w / |w|`, with ρ0 = sqrt(x² + y²). This removes any change in length, to
   within 1e-12 relative.
5. The velocity is `(ω·(−p_y), ω·p_x)` with the slot's ω. For a lane or rejoined rail this equals V_c(p). For a cluster rock
   it is the group's rigid rotation.

### 3.3 Tick phase and the accessors
**Tick phase.** During `stepDuel` the state is at tick T, and everything that moves goes from T to T + 1.
- Free rocks move in `stepRocks` before any contact, so every contact that tick happens at T + 1.
- Rail rocks are therefore read at `railPos(·, T + 1)` inside the step. The accessor's phase is `s.tick + 1` while
  `stepDuel` runs.
- Between ticks (state at T + 1, after `tick++`) readers get `railPos(·, s.tick)`, which is the same positions.
- One flag on the step's context (not on the state) selects the phase. Outside a step the phase is always `s.tick`.

**Accessors.** `rockX`, `rockY`, `rockVx` and `rockVy`, plus `rockAt`, which builds on them:
- **Free:** read the slot.
- **Rail:** use `railPos`, through a memo.
- **The memo:** a module-level cache keyed by state object (a WeakMap). It holds, per slot, the inputs it was computed from
  (x, y, ρ_ω, t, phase tick) and the result. A hit needs every input to match exactly.
  - Because the memo is keyed by every input, it is safe across clone, restore, in-place restore on guests, late join and the
    flight modes. A stale entry can never be returned.
  - It is not state, so it is never hashed, snapshotted or published.
- **Callers:** every reader of rock position or velocity uses the accessors. The full list is in §11. Direct reads of
  `v[b + 1..4]` stay only inside `rocks.ts` and the slot writers.

### 3.4 Freeing, pushes and rejoining
**Freeing.** A rail rock becomes Free whenever a laser push, a blast, any rock contact or any ship contact touches it.
- Its slot is rewritten with `railPos(T + 1)`, the rail velocity and t = T + 1.
- `ROCK_WAKE_SPEED` is removed.

**Pushes reset the clock.** Any push on a Free rock (laser, blast, rock contact above `BOUNCE_MIN` or ship contact) sets
t = T + 1. A per-tick transient mask, `rockTouched` (not hashed, cleared with the others), records every rock touched that
tick, whether it moved or was hit.

**Rejoining.** Rejoin is decided in one pass at the end of the tick, after the ship contacts, lasers, gun, pew and missiles
(new `settleRocks`, run last in `stepDuel` before `tick++`). A Free rock rejoins a rail when all of these hold:
- (T + 1) − t ≥ `REJOIN_MIN_TICKS` (120);
- `rockTouched` is clear for it, and it was not born this tick;
- |v − V_c(p)| < `REJOIN_SPEED` (0.5 u/s);
- `ρ + r ≤ R_MAP − 50` and `ρ − r ≥ PLANET_RADIUS + 80`;
- its annulus [ρ − r − ASTEROID_GAP, ρ + r + ASTEROID_GAP] overlaps no lane band (§3.5).
  - Debris that settles inside a lane band stays Free and slides gently along the lane under the settling drag (§4).

When a rock rejoins, its slot is rewritten as Rail with x, y = p, ρ_ω = ρ and t = T + 1. The velocity snaps by under 0.5 u/s.

### 3.5 Seeded start: lanes and rigid clusters
**The belt is built as lanes.** The belt region is unchanged at 1100 to 1300. Each lane is a circle radius with a band of rock
radii:

| Lane | ρ | Rock radius r |
|---|---|---|
| inner | 1122 | 15 to 20 |
| main | 1200 | 25 to 45 |
| outer | 1278 | 15 to 20 |

- **Spacing:** neighbouring lanes are 78 apart, and the largest radius sum plus `ASTEROID_GAP` is 45 + 20 + 10 = 75. Rocks
  in different lanes can therefore never touch, though they shear past each other at their own ω.
- **No drift within a lane:** rocks in one lane share ρ exactly, so they never move relative to each other.
- **Lane band:** a lane's band is [ρ_lane − r_max − gap, ρ_lane + r_max + gap].
- **Same rules otherwise:** placement uses the existing angle draws, the gap corridors, `fits` and spawn clearance.
- **Count:** `BELT_COUNT 70` splits as 36 main and 17 in each side lane.
- **Generator changes:** `generateMap` and `validateMap` change: lane radii replace the random radial position, and each lane
  has its own size band. The map hash changes, which is expected.

**Each cluster turns as one group.** Every rock in a cluster becomes a Rail with ρ_ω = the cluster centre's ρ, so the cluster
turns as one piece.
- **Separation:** cluster centres are drawn so that their ρ values differ by at least
  `2·(CLUSTER_RADIUS + CLUSTER_R_MAX) + ASTEROID_GAP = 420`. The range 1550 to 2550 fits three clusters. This is a new
  generator rule and a new `validateMap` rule. Clusters therefore never meet each other or the belt.
- **When one is freed:** a freed cluster rock starts with its rigid-rotation velocity. That is up to about ±2.5 u/s off
  circular at the cluster's edge, so it then drifts and settles under §4.

**At tick 0:** all seeded rocks start as Rail with t = 0. With no player action, no rock is ever freed (gate in §8.3).

## 4. Free-rock motion (`stepRocks`, part 1)

Each tick, every Free rock not born this tick moves in slot order. Each step finishes for every rock before the next begins:
1. **Drift.** `p += v · DT/2`.
2. **Kick.** `v += (g(p) + e(p)) · DT`.
   - g is `gravityAccel` × `ROCK_GRAVITY` (1.0).
   - e is `edgeAccel` (D5).
3. **Settling drag.** `v += (V_c(p) − v) · SETTLE_K · DT`, with `SETTLE_K` = 0.03/s. This replaces `ROCK_DRAG`.
4. **Speed cap.** The 300 u/s cap is applied here, before the second drift, so no tick moves at an uncapped speed.
5. **Drift.** `p += v · DT/2`.

Steps 1, 2 and 5 are leapfrog in its drift-kick-drift form: one force evaluation and no stored acceleration. Ships keep
semi-implicit Euler.

**Ends of a free rock's life:**
- **Planet:** touching the planet still turns it to dust.
- **Far edge:** a safety rule turns anything past `R_MAP + ROCK_EDGE_SLACK` (400) to dust (`'edge'`).
  - The worst case worked out in review is about 290 u past the edge, under the 400 slack.
  - The stress run counts how often this rule fires. The gate is 0.

## 5. Breaking (`rockBreak.ts`, `rockBlast.ts`, `rockWeapons.ts`)

### 5.1 The burst (a torpedo's direct hit)
The thresholds change on purpose: 35 → 30 and 25 → 20. The 8-piece row is new.

| Parent r | Pieces | Piece r = 0.9 r/√n | Birth offset from centre |
|---|---|---|---|
| ≥ 40 | 8 | about 0.318 r (≥ 12.7) | 0.85 r |
| ≥ 30 | 6 | about 0.367 r (≥ 11.0) | 0.80 r |
| ≥ 20 | 4 | 0.45 r (≥ 9.0) | 0.70 r |
| < 20 | dust | | |

- **Birth offsets:** the offsets are chosen so that neighbouring pieces do not overlap at birth (review finding 9).
- **Later breaks:** every burst piece is under `FAN_SPLIT_MIN_R` (13), so a second break of a burst piece is dust. This is the
  cascade's natural limit.
- **Directions:** `BURST_DIRS` gains an 8-way table, still evenly spaced and turned to the hit direction.
- **Velocity:** piece j gets the parent's accessor velocity plus dir · k_j, where:
  - `k_j = v_esc(ρ_parent) · (0.30 + 0.30 · f_j)`;
  - `f_j` = the fractional part of `j · 0.6180339887498949`.
  - That is about 19 to 39 u/s at the belt.
- **Born state:** born pieces are Free, with t = T + 1, so siblings share t (§5.4).

### 5.2 The fan (a laser, collision, ram or blast-secondary break)
- **Counts:** 3 or 2 pieces, as now (`FAN_TRIPLE_MIN_R` 40 and `FAN_SPLIT_MIN_R` 13), at the same 0.6 r offset as now.
- **Velocity:** `k_j = v_esc(ρ) · (0.10 + 0.15 · f_j)`, which is about 6 to 16 u/s at the belt. This replaces `ROCK_FLING`.

### 5.3 Push caps
- **Blast:** Δv = min(`BLAST_PUSH` · fall / m, 0.5 · v_esc(ρ)).
- **Laser:** Δv = min(`LASER_ROCK_PUSH` / m, 0.25 · v_esc(ρ)). This is new: without it, an r 9 piece would get 49 u/s.
- **Rail rocks:** a rail rock in either case is freed first.
- **Unchanged:** the ship push from blasts.

### 5.4 The contact pass (`stepRocks`, part 2)
- **Taking turns:** only Free rocks take turns, in ascending slot order, reading kinds as they are now.
- **Candidates:** a turn's candidates are every live rock that is not born this tick near it, from the grid (§6), in
  ascending slot order.
- **Who is skipped:** a candidate is skipped when it has already had a turn this tick (`rockDone`).
  - A Rail candidate never has `rockDone` set, so a free-rail pair is always checked by the free rock.
  - Rail-rail pairs are never checked. Lanes and cluster separation make them impossible at the seeded start, and rejoin
    keeps it so.
- **A rail rock freed mid-pass:** it becomes Free. If its slot is higher than the turn in progress, it takes its own turn
  later this tick.
- **Resolving a touching pair:**
  - free any Rail rock;
  - separate by inverse mass, moving each rock at most `ROCK_SEPARATE_MAX` (8 u) per pair per tick;
  - at a closing speed above `BOUNCE_MIN` (4 u/s), bounce with restitution 0.8;
  - at or below that, make the contact perfectly inelastic along the normal: remove the closing component and give no
    bounce.
- **Crush:** `ROCK_CRUSH_SPEED` (30) and `ROCK_CRUSH_STEP` (40) are unchanged.
- **The touch counter (new):** above `TOUCH_MIN` (8 u/s), and only for pairs with different t, `rockTouches++` and a `touch`
  event (rock, other, x, y, closing speed). Siblings share t, so they don't count.
- **Unchanged:** a break of a still ends its turn.

### 5.5 Eviction
- **Who can be evicted:** `allocate` can now evict a Rail or Free rock. It picks the smallest rock smaller than the new piece,
  never one in `exclude`, and the lowest slot on a tie.
- **When nothing qualifies:** the piece is dust, as now.
- **Counter:** a new counter, `rockSlotDust`, counts pieces lost for lack of a slot. The stress run reports it.

### 5.6 Effect-only shards (renderer)
**Shards and puffs:**
- **On a burst `split`:** 16 shards at 150 to 250 u/s that fade over 1 to 2 s, plus today's shockwave.
- **On a fan `split` or `dust`:** a puff of 6 shards.
- **On a `touch`:** a small spark and a soft knock sound (new, so slow billiards have a cue).
- Shards use `Math.random`, because they are renderer-only.

**Hit-stop:** an 80 ms freeze of the tactical layer's drawing on a burst.
- During the freeze, effects and positions hold.
- Afterwards the drawing snaps to the live state. There is no catch-up, and the sim never pauses.

## 6. Broad phase, ships and other consumers

### 6.1 The grid (`grid.ts`)
The seeded never-rebuilt grid and the linear scan of moving rocks are both replaced.
- **Rebuild:** a uniform grid of 96 u cells is rebuilt once per `stepDuel`, at the start. It uses accessor positions at the
  step phase (rails at T + 1, free rocks before their motion).
- **Storage:** it lives in a module WeakMap keyed by state object, and is never shared between clones.
  `cloneTacticalFromModule` must not copy it.
- **No allocation:** it is built into reused typed arrays (cell heads plus next links).
- **Queries:** a query writes into a reused scratch array and insertion-sorts it ascending. `rocksNear` keeps its contract:
  ascending, with no repeats.
- **Query padding:** queries pad by `ROCK_GRID_PAD` = 300·DT + `ROCK_SEPARATE_MAX` + 1 = 14 u. This covers one tick's motion
  and the capped separation.
- **New pieces:** they are inserted into the grid when they are born. Since born slots are skipped this tick anyway, the
  insert only keeps the grid's later queries honest.
- **Readers outside `stepDuel`:** the renderer, `predict.ts` and scripted between-tick code scan all slots through the
  accessors. That is at most about 240 slots, and allocation-free.

### 6.2 Ship against rock (the duel's path)
- **Every rock is two-body:** `SHIP_MASS` 900 and restitution 0.5. A Rail rock is freed first.
- **Soft contact (new):** below an impact of `RAM_SOFT` (15 u/s), there is no hull cost, no `asteroidHits` and no grace stamp.
  The rock is still pushed and freed. At or above 15, today's `ramHull` and ram damage apply.
- **Unchanged:** the dev flight view's single-ship modes (`stepFlight` and `stepSoloFlight` → `hitStatics`) keep still map
  asteroids from `map.asteroids` and never read the pool.

### 6.3 Things that assumed still rocks
- **`predict.ts` (Helm's collision marker):** it tests the ship's future position at tick + k against rocks at the same tick
  + k. Rail rocks use `railPos(·, tick + k)`, and Free rocks are extrapolated linearly.
- **`scripted.ts` `hazardAway` (it drives `duelGates`) and `hunter.ts` `threatAhead`:** these sweep the ship's velocity
  *relative to each rock* (from the accessor) against the rock's circle. A co-orbiting belt therefore no longer looks like a
  threat, and a crossing rock does.
- **Out of scope:** the Hunter still has no notion of rock targeting or cover (out of scope).

## 7. What you see (renderer only)

### 7.1 Motion
- **Smooth motion:** rocks are interpolated as ships already are.
  - Rail rocks are drawn at `railPos(tick − 1 + α)`, using a fractional n in the same series. That is renderer maths, so trig
    is allowed there.
  - Free rocks are drawn at a lerp from the renderer's previous position.
- **Streaks and trails:**
  - A free rock gets a streak when its speed *relative to* V_c(p) is above 8 u/s, not when its absolute speed is. A co-orbiting
    rock does not streak.
  - Free rocks get a 6 s fading trail from the renderer's per-slot history.
  - The history for a slot resets whenever that slot's kind or r changes, or it jumps more than 50 u in one frame. That
    covers slot reuse on guests, who get no rock events.

### 7.2 The predicted path
The rock targeted on the Weapons map shows a dotted path for the next 20 s. The renderer works it out with the same accessor,
`gravityAccel`, `edgeAccel` and settling drag. It ignores contacts.

### 7.3 Cracks, redrawn (D10)
**The bug** (`tacticalLayer.ts`, lines 276 to 280):
- Each crack's end takes an unrelated vertex's multiplier, `shape[(k+3)%9]·0.95`, at another angle. Outline multipliers run
  0.72 to 1.08, so an end can sit at 1.03 r where the outline is at 0.72 r.
- The bend midpoint can also leave the outline.
- The cracks are 1.5 px hot spokes from the centre, so they read as glowing lines rather than fractures.

**The redraw** is a pure function `crackPaths(index, wear)` in `tacticalModel.ts`. It has no Pixi and returns polylines in
rock-local units (multiply by r and add the centre to draw).
1. **Fixed crack set.** Each rock index has a fixed set of 4 full cracks, seeded with the `asteroidShape` hash, salt 17.
2. **Start.** Crack i starts at angle `a_i` = (i + hash) · 2π/4, at 0.88 × the outline's radius at that angle.
   - The outline's radius at any angle is the distance along the ray to the polygon edge between the two neighbouring
     vertices, found by interpolating along that edge, not taken from one vertex.
3. **Inward path.** It runs inward as 4 segments, each 0.16 to 0.22 r long.
   - Each segment turns by a hashed angle in ±35°, biased toward the centre.
   - After every step, the point is clamped to at most 0.88 × the outline's radius at its own angle.
4. **One fork.** Cracks 1 and 3 fork once, at the end of segment 2: a 2-segment branch of 0.12 r per segment, at ±40°.
5. **Growth.** Wear reveals the fixed polylines and never scales them.
   - Crack count is `ceil(wear · 4)`. Today's is `1 + floor(wear·4)`; the change is intended.
   - Each shown crack is cut to the arc length `(0.35 + 0.45 · wear) ×` its full length.
   - Higher wear always contains lower wear as a prefix.
6. **Style.** Cracks are cut into the rock: a 1 px line in `CRT.glass` at alpha 0.85, with a 1 px `CRT.mid` highlight offset
   0.6 px perpendicular at alpha 0.5. The highlight carries the contrast on the `CRT.faint` fill at wear ≥ 0.5.
   - The fill dims at wear ≥ 0.5, as now.
   - The outline keeps `CRT.main` when the rock is worn.
7. **Small rocks.** No cracks are drawn when the rock's screen radius is under 6 px.

**Tests:**
- 8 points sampled along every segment all lie strictly inside the outline polygon, for indices 0 to 500 and wear in
  {0.25, 0.5, 0.75, 1}.
- The prefix property holds.
- Results are stable across calls.
- A screenshot of rocks at wear 0.25, 0.5 and 1 joins the §8.4 set for the owner's look check.

## 8. Gates and tests

### 8.1 Unit tests
**Rails:**
- Positions match a `Math.cos`/`Math.sin` reference to within 1e-9 u at T = 216,000.
- |p| = ρ0 to within 1e-12 relative.
- Accessor values are equal after save/restore, after clone and after an in-place restore, at any tick.
- The memo never returns a value for changed inputs.
- Prograde matches `spawnAt`.
- θ is accurate to 1e-15 at ρ 150.

**Motion:**
- With drag off, leapfrog's relative energy error stays under 1e-6 over 100 orbits at ρ 1200.
- An unkicked free rock at ρ 1200 holds ρ within 1% for 10 minutes.
- A rock kicked *radially outward* by 20 u/s at ρ 1200 settles and rejoins within 180 s.
- A rock pushed past the edge comes back and is not turned to dust.
- Touching the planet turns a rock to dust.
- No rock rejoins outside the ρ bounds or inside a lane band.

**Breaking:**
- Piece counts, radii and birth offsets for each pattern.
- No sibling overlaps at birth.
- Every kick is in its band.
- The blast and laser push caps hold.
- 5 laser shots on an r 45 rock add up: none is lost to a rejoin.

**Grid:**
- Its pairs equal a brute-force all-pairs check on every tick of 20 seeded stress runs.
- Rebuilding it allocates nothing after warm-up.

**Contacts:**
- A ship co-orbiting at under 15 u/s relative speed pushes rocks free and loses no hull.
- A crossing ship pays today's `ramHull`.
- A soft rock-rock contact under 4 u/s removes the closing speed and gives no bounce.
- A free rock meets a lower-slot rail rock (review finding 2).

**Map:**
- Lanes, band spacing and cluster ρ separation hold in `validateMap` over 200 seeds.

### 8.2 The feel check (`scripts/spike-asteroids-iii-measure.ts`)
**Setup:**
- seed 2026, with the Hunter off;
- the crew ship on a circular orbit co-orbiting the target, 300 u outward of it;
- one torpedo at each of the 10 largest main-lane rocks.

**A shot passes when it meets all four of these:**
- (a) ≥ 6 real pieces;
- (b) `rockTouches` ≥ 3 within 20 s, counting only touches above 8 u/s between rocks that are not siblings;
- (c) ≥ 50% of the parent's mass still alive at 30 s;
- (d) ≥ 4 pieces whose velocity *relative to V_c* has turned ≥ 25° by 20 s. This measures the visible curve against the
  co-rotating frame, not just the orbit itself.

The gate is ≥ 7 of 10 shots passing.

### 8.3 Gates
| Gate | Target |
|---|---|
| Cost | p99 `stepDuel` < 0.5 ms under a stress script with about 240 live rocks |
| Determinism | twin runs and save/restore agree over seeds 1–20 × 4,000 ticks |
| Duel gates | `tests/duelGates.test.ts` passes |
| Idle belt | no player action, 600 s: 0 rocks ever freed. 20 Hz delta at t = 60, 300 and 600 s ≤ master's |
| After 3 bursts | free-rock count back to ≤ 10 within 240 s; delta median ≤ 5.5 KB |
| Safety counters | `ROCK_EDGE_SLACK` dust = 0 and `rockSlotDust` = 0 in the stress run |

### 8.4 Version and screenshots
- **SIM_VERSION:** goes up by one from master's version at build time. Master is 59 today, so this would be 60. It uses the
  usual two-step bless.
- **Determinism guard:** `boundary.test.ts` covers the new files.
- **Screenshots**, using the visual check method, into `FTLite-shots/asteroids-iii/`:
  - a burst at 0, 2, 10 and 30 s;
  - the belt at 0 and 120 s;
  - cracks at three wear levels.

## 9. Out of scope

- the moon (D7);
- torpedo gravity (D6);
- rock fx for online guests, except that trails and streaks work from state;
- Hunter rock tactics;
- a priority stream or quantised rock deltas;
- rock-to-rock gravity.

## 10. Risks

| Risk | What we do |
|---|---|
| Lanes look too regular | Each lane jitters its rock radii inside the band, never its ρ. If it still looks like rails, the owner's look gate decides. |
| Debris in a lane band stays free, so deltas grow | The after-burst gate measures it. Fallback: let debris rejoin inside a band at the lane's exact ρ, if the angular gap clears. |
| The Hunter hits moving rocks | The duel gates show it. Fallback: tune `SHIP_HULL` only if the gates fail. |

## 11. Integration list (from the review)

**Rewritten for kinds, slots or the grid:**
- `sim/tactical/rocks.ts`: init, accessors, `rocksNear` and wake removal;
- `rockContacts.ts`;
- `contacts.ts`: rock contacts 68–92 and the soft contact;
- `rockBreak.ts`: `pushRock`, `allocate`/eviction, birth, `vacate` and the event positions;
- `rockBlast.ts` and `rockWeapons.ts`: the caps and freeing;
- `grid.ts`;
- `hash.ts`: the stride, the validation rules, and the memo and grid kept out of clone;
- `state.ts`: the `rockTouched` mask and the counters;
- `duel.ts`: `settleRocks`, run last;
- `map.ts`: lanes and cluster separation;
- `rockTuning.ts`: every new number;
- `app/duel/duelMode.ts` at line 77, the dev rock hooks.

**Moved to the accessors:**
- `sim/tactical/`: `gun.ts`, `pew.ts`, `missiles.ts`, `weapons.ts`, `geometry.ts`, `predict.ts` and `hunter.ts`;
- `sim/duel/`: `scripted.ts` and `telemetry.ts`;
- the renderer: `render/duel/situationModel.ts` and `render/tactical/tacticalModel.ts` (lines 378, 381, 493 and 564).

`duelAudio.ts` reads events only and does not change.

**Tests:**
- `tests/helpers/rockArena.ts` and the roughly 20 rock test files move to the new kinds.
- The Asteroids-ii cases removed by this design are deleted, with a note in the plan:
  - wake speed;
  - a still rock infinitely heavy;
  - edge dust;
  - fixed fling speeds.
- `scripts/spike-asteroids-ii-*` are replaced by `scripts/spike-asteroids-iii-measure.ts`.

## 12. Review log (Fable, 2026-11-19)

| Findings | Fix and where |
|---|---|
| 1 (shear churn) | Lanes and rigid clusters, §3.5. Soft inelastic contacts, §5.4. The idle gate, §8.3. |
| 2 (missed pairs) | The contact-pass rules, §5.4. |
| 3, 4 (table lifecycle and bookkeeping) | The pure `railPos` and an input-keyed memo, §3.2–3.3. Free rocks read from the slot. The grid in a WeakMap, §6.1. |
| 5 (rejoin past the edge) | The ρ bounds, §3.4. |
| 6 (rejoin eats pushes) | `REJOIN_SPEED` 0.5, the push clock reset and the end-of-tick pass, §3.4. |
| 7 (laser push) | The laser cap, §5.3. |
| 8 (hull) | `RAM_SOFT`, §6.2. |
| 9 (feel check) | Birth offsets, §5.1. The touch counter, §5.4. A redefined check, §8.2. |
| 10 (still-rock consumers) | §6.3. |
| 11 (streaks, interpolation) | §7.1. |
| 12 (eviction) | §5.5. |
| 13 (grid pad, allocation) | §6.1. |
| 14 (thresholds) | Marked as intended, §5.1. |
| 15–17 (numbers and notation) | §2, §8.1. |
| 18 (readers list) | §11. |
| 19 (touched mask) | §3.4. |
| 20 (restore validation) | §3.1. |
| 21 (soft-contact cue) | §5.6. |
| 22 (trails on guests) | §7.1. |
| 23 (hit-stop) | §5.6. |
| 24 (cap order) | §4. |
| 25 (edge spring) | Confirmed correct, no change. |
| 26 (cracks) | §7.3. |
