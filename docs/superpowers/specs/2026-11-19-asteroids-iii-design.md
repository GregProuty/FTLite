# Asteroids-iii: orbiting belt, slow shards, visible gravity (design)

Date 2026-11-19. Branch `spike/asteroids-iii`. Builds on Asteroids-ii (`docs/superpowers/specs/2026-11-18-asteroids-ii-design.md`,
merged 1dd2740e). Research: `reports/Orbital gravity and fragmenting asteroids.md` and its notes in
`research_notes/Orbital gravity and fragmenting asteroids/`.

## 1. Goal and owner decisions

The owner wants asteroids that visibly respond to gravity. A torpedo hit should blow a rock into several pieces, and those
pieces should fly out and billiard into the other asteroids. The physics should be worked out with formulas, so it stays
cheap for a few hundred bodies.

**Why gravity can't be seen today:**
- Pieces leave at 150 to 200 u/s. The escape speed at the belt is about 64.5 u/s and the pull there is about 1.74 u/s², so
  the pieces fly straight and are gone before gravity can bend them.
- Belt rocks stay still until they are woken.
- Plain drag of 0.1/s drains orbital speed: a circling rock falls into the planet in about 47 s.

**Owner decisions (2026-11-19):**

| # | Decision |
|---|---|
| D1 | The belt rotates, in the same direction the ships orbit. |
| D2 | Real shear: each rock moves at its own circular speed, so the gaps smear out and clusters stretch into arcs. |
| D3 | Escaping pieces are fine. The owner accepted about 1 in 5, then chose the "medium" kick (§5.1), where about a third escape and loop back off the edge. |
| D4 | GM stays at 2.5e6. The owner likes how Helm feels now. |
| D5 | Rocks that reach the edge slingshot back. They no longer turn to dust there. |
| D6 | Torpedo gravity is dropped from this work. Lasers stay straight. |
| D7 | The moon gets its own spec, after this one. |
| D8 | Architecture A: orbiting rocks are worked out from the tick number ("rails"). |
| D9 | Medium blast kick: real pieces at 0.30 to 0.60 of escape speed. |

## 2. Terms and shared formulas

**Coordinates:** heading 0 is north and headings run clockwise, as in `direction.ts`. The planet is at the origin. For any
point d = (x, y), with r = |d|:

| Quantity | Formula |
|---|---|
| Softened circular speed | `v_c(r) = sqrt(GM · r² / q^{3/2})`, where `q = r² + ε²`. Already `circularSpeed` in `map.ts`. |
| Escape speed | `v_esc(r) = sqrt(2 · GM / sqrt(q))` |
| Prograde tangent t̂(d) | The unit vector a quarter turn from the outward radial, in the direction `spawnAt` gives ships. The plan fixes the sign from `hx`/`hy` and checks it with a test against `spawnAt`. |
| Angular rate | `ω(R) = v_c(R) / R` |
| Turn per tick | `θ(R) = ω(R) · DT`. About 6.3e-4 rad at R 1200 and 2.8e-4 at R 2400. |

**Rotation step without trig.** The determinism guard allows only + − × ÷ and sqrt, so cos θ and sin θ come from Taylor
series. For θ < 1e-2, these match `Math.cos` and `Math.sin` to better than 1e-16.
- `c = 1 − θ²/2 + θ⁴/24 − θ⁶/720`
- `s = θ − θ³/6 + θ⁵/120 − θ⁷/5040`

All new sim code obeys the guard. `**`, `Math.pow`, `Math.hypot` and trig are all banned. Write q^{3/2} as `q * Math.sqrt(q)`.

## 3. The rock pool and rails

### 3.1 Layout
- **Stride:** `ROCK_STRIDE` goes from 7 to 8: `kind, x, y, vx, vy, r, hp, t`.
- **Kinds:** `Gone 0`, `Rail 1` (replaces `Static`) and `Free 2` (today's `Moving`, renamed).
- **Rail slot:** `x, y` hold the position at its start tick `t`, and `vx, vy` are 0 and unused. None of its values change while
  it stays on the rail, so it costs nothing in the network deltas.
- **Free slot:** `x, y, vx, vy` are live, and `t` is the tick it was freed or born.
- **Reserve:** `ROCK_RESERVE` goes from 96 to 160.
- **Hash:** the pool stays hashed and snapshotted as one vector, at the new length.

### 3.2 Where a rail rock is at tick T
1. Take `R = sqrt(x² + y²)` and `u0 = (x, y) / R`.
2. Take the step `(c, s)` from `θ(R)`, rotating in the prograde sense of §2.
3. Raise the step to the power `n = T − t` by repeated squaring of complex numbers. That is at most about 2·log₂ n
   multiplications: about 34 for a 3-hour game.
4. Rotate `u0` by the result, then rescale to exactly R: `p = R · w / |w|`.
5. The velocity is `v_c(R) · t̂(p)`.

The work is the same arithmetic on every machine, so the result is identical everywhere.

### 3.3 The position table
- **What it is:** a per-tick table beside the pool, holding x, y, vx and vy per slot.
- **When it is built:** `beginRockTick` rebuilds it from scratch at the start of every tick. Rail rocks are worked out by §3.2,
  and free rocks are copied from their slot.
- **Storage:** like `rockBorn`/`rockDone`, it is not hashed, snapshotted or published. Restore and late join give identical
  values, because the table depends only on the pool and the tick.
- **Updates during a tick:** a free rock's motion step (§4) writes both its slot and its table row. Freeing a rail rock (§3.4)
  updates the row too.
- **Readers:** every reader of rock position or velocity goes through accessors over this table. That includes `rockAt`, the
  laser and gun line of sight, missile homing and rock targeting, `pickRock`, the ship contacts, the tactical renderer and
  `duelAudio`. Nobody reads `v[b + 1]` directly any more.

### 3.4 Freeing and rejoining
**Freeing.** A rail rock becomes free when any of these touches it: a laser push, a blast, any rock contact or any ship contact.
- Its slot is rewritten with the current table position, its exact orbital velocity and t = now. Kind becomes `Free`.
- This replaces `ROCK_WAKE_SPEED`; there is no speed floor any more.

**Rejoining.** A free rock rejoins a rail at the end of its motion and contact turn when all of these hold:
- `now − t ≥ REJOIN_MIN_TICKS` (120, which is 2 s);
- it had no contact this tick;
- it was not born this tick;
- `|v − v_c(r) · t̂| < REJOIN_SPEED` (3 u/s).

The slot is then rewritten as `Rail` at its current position with t = now. The velocity snaps by less than 3 u/s.

### 3.5 The seeded start
The map generator is unchanged. `initRocks` writes every seeded asteroid, belt and clusters, as `Rail` with t = 0. The clusters
co-orbit with the ships spawned at r 2000, then shear into arcs over a duel (D2).

## 4. Free-rock motion (`rockContacts.ts`, part 1)

Each free rock not born this tick does the following, in slot order:
1. **Leapfrog, drift-kick-drift.** One force evaluation and no stored acceleration:
   - `p += v · DT/2`
   - `v += (g(p) + e(p)) · DT`
   - `p += v · DT/2`
   
   `g` is `gravityAccel` × `ROCK_GRAVITY` (still 1.0) and `e` is `edgeAccel` (D5). This replaces semi-implicit Euler for rocks.
   Ships are unchanged.
2. **Settling drag.** `v += (v_c(r) · t̂(p) − v) · SETTLE_K · DT`, with `SETTLE_K = 0.03`/s. This replaces `ROCK_DRAG`.
3. **Speed cap.** The 300 u/s cap stays.

**Ends of a free rock's life:**
- **Planet:** touching the planet is still dust (`'planet'`).
- **Edge:** the edge no longer turns rocks to dust (D5); the spring brings them back. A safety rule dusts any rock past
  `R_MAP + ROCK_EDGE_SLACK` (400), cause `'edge'`. With the speed cap this should never fire, and the stress run counts it.

**Expected behaviour:**
- A rock at 60 u/s goes about 42 u past the edge before it turns back.
- A 30 u/s kick fades in about a minute, so pieces arc and wander before settling into a new ring.

## 5. Breaking (`rockBreak.ts`, `rockBlast.ts`)

### 5.1 The burst (a torpedo's direct hit)
**Piece counts:**

| Parent radius | Pieces |
|---|---|
| r ≥ 40 | 8 (new) |
| r ≥ 30 | 6 |
| r ≥ 20 | 4 |
| smaller | dust |

**Pieces:**
- **Radius:** `0.9 r / √n` as now. The smallest pieces are r 40 → 12.7, r 30 → 11.0 and r 20 → 9.0, all above `ROCK_MIN_R 8`.
- **Directions:** `BURST_DIRS` gains an 8-way table built from `S45 = √½`, written as a constant. The directions are evenly
  spaced and turned to the hit direction, as now.
- **Starting position:** each piece starts at the centre + dir · 0.6 r, as now.
- **Kick:** piece j gets the parent's table velocity + dir · `k_j`, where `k_j = v_esc(r_parent) · (0.30 + 0.30 · f_j)`.
  - `f_j` is the fractional part of `j · 0.6180339887498949`, so the spread is fixed by index and uses no RNG.
  - At the belt that is about 19 to 39 u/s.

### 5.2 The fan (laser, collision, ram or blast-secondary break)
- **Counts:** 3 or 2 pieces as now (`FAN_TRIPLE_MIN_R 40`, `FAN_SPLIT_MIN_R 13`).
- **Kick:** `k_j = v_esc · (0.10 + 0.15 · f_j)`, about 6 to 16 u/s at the belt. This replaces `ROCK_FLING`.

### 5.3 The blast shove
- **Falloff and damage:** the same falloff and the same damage as now.
- **Speed change:** a rock's Δv along the push is `min(BLAST_PUSH · fall / m, 0.5 · v_esc(r))`. A rail rock inside the radius is
  freed first.
- **Ships:** the push on ships is unchanged.

### 5.4 Contacts between rocks (`resolveRockPair`)
- **Rail rocks:** any touching pair that includes a rail rock first frees it (§3.4). There is no infinitely heavy case any more.
- **Who takes a turn:** the contact pass gives a turn to free rocks *and* rail rocks. A rail rock's turn checks only other rail
  rocks with a higher slot number, so shear touches are found once.
- **Bounce:** above `BOUNCE_MIN 4` u/s closing speed, the bounce uses restitution 0.8. Below it the pair only separates.
- **Crush:** `ROCK_CRUSH_SPEED 30` and `ROCK_CRUSH_STEP 40` are unchanged.
- **Unchanged:** a broken rock's turn still ends, and pieces born this tick are still skipped.

### 5.5 Effect-only shards (renderer)
- **What to spawn:**
  - On each `split` event from a burst: 16 shards at 150 to 250 u/s that fade over 1 to 2 s, on top of today's shockwave.
  - On a `split` from a fan, and on `dust`: a small puff of about 6 shards.
- **Randomness:** the shards use `Math.random`, which is allowed because they are renderer-only.
- **Hit-stop:** an 80 ms visual hit-stop on bursts. Only the camera and the effects freeze; the sim never pauses.

## 6. Broad phase and ships (`grid.ts`, `contacts.ts`)

**The grid:**
- **What it replaces:** the seeded never-rebuilt grid plus the linear scan of moving rocks.
- **What replaces them:** one uniform grid of 96 u cells, rebuilt in `beginRockTick` from the position table for every live
  rock. Like the table, it is not hashed.
- **Queries:** `rocksNear` keeps its contract: ascending slot numbers and no repeats.
- **Moving rocks:** a free rock that moves during the tick is still found, because the query pads its box by
  `ROCK_GRID_PAD = 300 · DT + 1` u.

**Ship against rock (the duel's `duelStatics` path):**
- Every rock is a two-body contact, as for today's moving rocks: `SHIP_MASS 900` and restitution 0.5. A rail rock is freed first.
- The hull cost and ram damage use today's formulas on the relative impact speed.

**Unchanged:**
- the dev flight view's single-ship modes (`stepFlight`/`hitStatics`) and their still map asteroids;
- the Hunter;
- contact grace.

## 7. Readability (renderer only)

- **Trails:** free rocks get a 6 s fading trail, kept from the renderer's own per-slot position history.
- **Predicted path:** the rock targeted on the Weapons map shows a dotted 20 s predicted path. The renderer works it out with
  the same `gravityAccel`, `edgeAccel` and settling-drag functions. It ignores contacts, so it is an approximation.
- **Unchanged:** today's streaks, cracks, brackets and the `ROCKS n` tally.
- **Online guests:** guests see all rock motion, because the pool reaches them. They still get no rock effects.

## 8. Gates and tests

### 8.1 Unit tests
| Area | What the tests check |
|---|---|
| Rails | Match `Math.cos`/`Math.sin` reference positions to within 1e-9 u at T = 216,000 (1 h); \|p\| = R exactly; table equality after save/restore at an arbitrary tick; prograde sense equals `spawnAt`. |
| Motion | Leapfrog energy error < 1e-6 over 100 orbits with drag off; an unkicked free rock holds r within 1% for 10 min; a rock kicked by 25 u/s settles and rejoins within 120 s; a rock thrown past the edge comes back without being dusted; planet contact dusts. |
| Breaking | Piece counts and radii for each pattern; every kick within its band of v_esc; the blast Δv cap. |
| Grid | Pairs equal a brute-force all-pairs check over seeded stress runs. |
| Contacts | A ship flying with the belt at under 10 u/s relative speed nudges rocks free without hull loss; a crossing ship pays today's ram cost; two rail rocks sheared together both go free and separate without bouncing. |

### 8.2 The feel check
One torpedo is fired at each of the 10 largest belt rocks, with seed 2026, the Hunter off and the crew at rest 300 u outward
of the target. The check passes when at least 7 of the 10 shots meet all four of these:
- ≥ 6 real pieces;
- ≥ 3 rock-rock contacts within 20 s;
- ≥ 50% of the parent's mass still alive at 30 s;
- some piece ≥ 60 u off its straight-line path at 20 s.

### 8.3 Gates
| Gate | Target |
|---|---|
| Cost | p99 `stepDuel` < 0.5 ms under a stress script with about 240 live rocks |
| Determinism | twin runs and save/restore agree over seeds 1 to 20 × 4,000 ticks |
| Duel gates | `tests/duelGates.test.ts` passes |
| Idle delta | 20 Hz delta with no movers ≤ master's |
| Delta after a burst | median ≤ 5.5 KB |
| Edge safety | rule fires 0 times in the stress run |

### 8.4 Versions and screenshots
- **Versions:** SIM_VERSION goes 58 → 59, using the usual two-step bless.
- **Determinism guard:** `boundary.test.ts` covers the new files.
- **Screenshots:** a burst at 0, 2, 10 and 30 s, and the belt at 0 and 120 s, taken by the visual check method into
  `FTLite-shots/asteroids-iii/`.

## 9. Out of scope

- the moon (the next spec, D7);
- torpedo gravity (D6);
- rock effects for online guests;
- a Hunter that knows about rocks;
- the research's priority stream for free rocks, plus quantised rock deltas;
- rock-to-rock gravity: the research found it affordable but not worth adding.

## 10. Risks

- **Shear in the clusters.** Shear may free cluster rocks often, so many clusters could become free rocks for long stretches
  and grow the deltas. The stress run measures free-rock counts over time. If idle free rocks stay above about 30, raise
  `REJOIN_SPEED` to 5.
- **Hunter crashes.** The Hunter doesn't know about rocks, so it may hit moving belt rocks more often. The duel gates will show
  it. The fallback is to tune `SHIP_HULL` only if the gates fail.
- **Tuning knobs.** Every new number lives in `rockTuning.ts`.
