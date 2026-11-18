# Spike report: destructible asteroids (2026-11-17)

Spec: `docs/superpowers/specs/2026-11-17-destructible-asteroids-spike.md`. Branch `spike/asteroids` (from master
f588fc0d, SIM_VERSION 49 → 50 on the branch only). Not for merge.

## What was built

- **Rock pool** (`sim/tactical/rocks.ts`): `state.rocks`, a `Float64Array` with 7 values per slot (kind 0 gone / 1
  static / 2 moving, x, y, vx, vy, r, hp). Slots 0..n−1 start as the seeded asteroids. Then come 32 reserve slots for
  fragments. Three counters (`rockHits`, `rockSplits`, `rockShatters`). The pool and the counters sit at the end of
  the `space` module, so they are hashed, snapshotted, cloned and validated like every other field.
- **Broad phase:** the seeded grid is never rebuilt. A grid hit counts only while its slot still holds a static rock,
  and a static rock never moves. Moving fragments are found by a linear scan. `rocksNear` merges both in ascending
  slot order, so every caller still meets rocks in one fixed order. Every consumer moved to it: line of sight,
  contacts, missiles, the Hunter's `threatAhead`, the Helm prediction, the scripted pair and telemetry. A test checks
  it against brute force while fragments drift.
- **Rules as specced (start values kept):** hp = ceil(r/10). Laser −1. Torpedo −4. At 0 hp a rock of r ≥ 30 splits
  into two fragments of r·0.55, thrown forward along the hit at ±45°, 40 u/s. A smaller rock shatters. Fragments
  feel gravity and no drag. A fragment that meets the planet or the map edge is gone. A fragment that meets another
  rock shatters and does 1 hp to that rock. Ships bounce off fragments using the relative speed and pay the normal
  asteroid contact cost (hull 1, with grace). Torpedoes end on fragments as on any rock.
- **Laser:** a shot that misses its target hits the first rock on its line instead: the line to an in-arc, in-range
  target that a rock blocks, or else a ray along the nose to laser range. If the planet comes first, the shot just
  misses. **Auto-dig** (`AUTO_DIG = true`): the crew laser's auto-fire also fires when its target is in arc and range
  and a rock is the first thing in the way. The Hunter never shoots rocks on purpose: it fires only when it can hit.
- **Order within a tick (fixed):** weapon commands (laser hits on rocks), ships fly, missiles fly, rocks fly
  (`stepRocks`, ascending slot), ship contacts, missile contacts (torpedo hits on rocks). A rock breaks the moment its
  hp reaches 0. A split keeps one fragment in the broken rock's slot and puts the other in the lowest empty slot. If
  no slot is free, the second fragment is lost as debris. A reused slot's contact grace is cleared on every ship.
- **Render:** the map draws the live pool. Wear shows as hot crack lines, a brighter outline and, at half wear, a
  dimmer fill, all on the CRT amber ramp (`crtColours.test.ts` now includes a worn rock). A laser that hits a rock
  draws a hot beam and an impact flare. A split or a shatter draws a long burst.
- **Tests:** existing tests updated for the new semantics. The laser test now expects a blocked shot to chip the rock.
  The flatten length and key guard now cover the rocks. The checkpoint and snapshot fixtures moved to the new seed-5
  trajectory. New `tests/asteroidSpike.test.ts` covers the rules, the broad phase against brute force, and the hash
  and clone. The whole suite is green: 350 files, 4720 tests.
- **Goldens:** re-blessed with the normal procedure. The canonical-trace and duel-oracle baselines were recorded at 49
  on master's code. Then a version-only `npm run bless` bumped to 50, then a same-version `npm run bless` blessed the
  spike's gameplay. `--fresh` was not used.

## Numbers

All measured with `npx tsx scripts/spike-asteroids-measure.ts` on the branch and on a detached master worktree.
`scripts/profile-duel-publication.ts` gave the publication cost.

### Snapshot size (typical duel: scripted pair, seed 2026, tick 3000)

| | master (49) | spike (50) | change |
|---|---|---|---|
| snapshot values | 966 | 1,866 | +900 (+93%) |
| snapshot JSON | 3,235 B | 9,386 B | ×2.9 |
| full state image (wire, `encodeFull`) | 8,327 B | 15,527 B | ×1.86 |
| 20 Hz delta image, median (no fragments) | 841 B | 841 B | 0 |
| 20 Hz delta image, max (no fragments) | 1,177 B | 1,177 B | 0 |
| 20 Hz delta image, median, 10 fragments in flight | n/a | 1,274 B | +52% over 841 |

Where the +900 comes from: the pool, (86 + 32) × 7 = 826 values; graceUntil, which grows by 32 bodies per ship = 64
values; and 3 counters. Static rocks repeat x, y and r from the seeded map. Only hp, and kind for the seeded rocks,
are new information.

### Per-tick cost (6,000 ticks; median of three runs)

| | master | spike |
|---|---|---|
| `stepDuelTick` (scripted pair, interior included), median | 4.7 µs | 5.7 µs (+21%) |
| tactical `stepDuel` alone, median | 2.2 µs | 2.8–3.6 µs (+30–60%) |
| tactical with 71 fragments moving (every r ≥ 30 rock broken) | n/a | 14.7 µs median, 142 µs p99 |
| publication, host per tick (budget 1.5 ms) | 0.400 ms | 0.658 ms (+65%) |
| publication, client per publication (budget 1.0 ms) | 0.271 ms | 0.449 ms (+66%) |

The sim cost is negligible even in the stress case. The publication cost grows with the snapshot, which means
validating and image-encoding 900 more values. It stays inside budget but is the largest real cost of the spike.

### Determinism

- Twin runs: seeds 1–20, 4,000 scripted ticks each, hashed every 500 ticks. **All agree.**
- Save and restore: at tick 4,000, save, load, check that the hash matches, then step both copies 1,000 more ticks.
  **All 20 agree.**
- `tests/duelCheckpoint.test.ts` continuation proof (checkpoint through bytes, restore, run to the end): passes on the
  new seed-5 trajectory (SPLIT 7011).
- Golden, rematch golden and determinism-v2 fixture: re-blessed and passing.
- The guard (`boundary.test.ts`) runs on `rocks.ts` and passes. It uses only `+ − × ÷`, sqrt, abs, min, max and ceil.
- `npm run test:duel-app-runtime`: **PASS** on the first try (105.6 s; two processes, hash agreement, peer-lost pause
  and rejoin). It passed again on the final commit 32fe4c68 (105.6 s). The known flake never appeared.

### Play-feel evidence: scripted duels (gate seeds 1–10, the Cutter, the gates' setup)

| | master | spike |
|---|---|---|
| duelGates median round | 218.3 s | 218.3 s |
| crew wins / losses | 8 / 2 (seeds 3, 5) | 9 / 1 (seed 5) |
| rounds whose length changed | n/a | 3 of 10: seed 3 166 → 335 s (loss became a win), seed 4 283 → 300 s, seed 9 263 → 185 s |

Rock events over all 10 spike duels:

- 41 rock hits: 10 by laser (almost all auto-dig), 20 by torpedo, 11 by fragments.
- 10 splits and 21 shatters.
- Ships touched a moving fragment on 4 ticks in total, all in seed 4.

Per duel: 0 hits (seeds 6 and 10) to 23 hits and 5 splits (seed 3). The `duelGates` test still passes: the median is
in 180–300 s and the crew both wins and loses.

How to read this: the scripted pair does not play with rocks on purpose. Most rock hits are torpedoes that used to be
lost on an asteroid and now crack it, plus a few auto-dig shots. The gate median did not move, but individual rounds
are chaotic: one rock hit changes everything after it. Seed 5's checkpoint run flipped from a crew win at 14,986
ticks to a crew loss at 10,882 ticks. The fragment hazard almost never reaches a ship.

## What I think felt good, and what did not

Screenshots, staged with the solo hook: the crew ship 170 u from a rock's surface with the Hunter (still holding)
behind it, the laser targeted on the Hunter's Shields, auto-dig on. They are in `C:\Users\djuar\FTLite-shots\asteroid-spike\`:

- `a0-staged.png`: the line is blocked; the readout says NO SHOT.
- `a1-cracked.png`: after one burst, cracks show, with a beam and a flare at the impact point.
- `a2-split.png`: the moment of the split, with its burst.
- `a3-fragments-0s7.png`: two fragments, and the same burst's second shot goes through the gap and strips a shield
  (SHIELD DOWN).
- `a4-fragments-2s.png` and `a5-fragments-4s.png`: the fragments drifting apart at about 38 u/s.

**Good**

- **Digging out a Hunter works and reads.** In `a3`, the burst that breaks the rock opens the line, and its second
  shot hits the Hunter's shield. That is exactly the "blast the rock between you" beat. The cracks make it readable:
  you can see the rock is nearly through.
- **Torpedoes stop being simply wasted** when they hit a rock: they crack it, and often break it. That gives a miss a
  consequence.
- **Determinism and cost are not the problem.** Everything hashes, survives save and restore, passes the two-process
  smoke, and the sim cost is microseconds.

**Not so good**

- **Digging is slow next to the fight.** A typical r 43–55 belt or cluster rock (hp 5–6) takes three laser bursts,
  about 10–12 s of the Cutter's 4 s charge. That is laser time not spent on the enemy. With auto-dig on, the game
  spends it for you, without the player choosing. That works against "depth for the weapons role". The choice is the
  point, and auto-dig hides it. I would make digging deliberate: the player clicks the rock as the laser's target.
- **The fragment hazard rarely matters.** In the belt, fragments meet a neighbour within about 1 s, shatter and chip
  it. In the first staging both fragments were gone within 1.5 s. In open space they drift at about 40 u/s and fall
  slowly toward the planet. In 10 scripted duels a ship touched a fragment on 4 ticks. "Break a rock to throw
  fragments into the Hunter" needs the Hunter within about 100 u of the rock and the right angle. It is a trick shot,
  not a tactic.
- **Fragments look like static rocks.** They have no motion cue (trail or velocity tick), so at map zoom a drifting
  hazard reads as part of the terrain.
- **Chaos for tuning and tests.** Any rock hit changes the rest of the round. Fixtures pinned to scripted trajectories
  (the checkpoint and snapshot ticks) had to be re-found, and every future tuning change will do the same.
- **Online is half-done in the spike.** The guest sees the rocks change through the snapshot, but `onlineSource`
  derives beams from counters. A rock hit therefore shows as a miss beam along the nose, with no flare and no break
  burst. A real build would derive rock fx from pool diffs.
- **The AI is blind to it.** The Hunter never digs and does not avoid fragments by their motion (it uses their
  current position). The Helm's predicted path does not see fragment motion either.

## Risks

1. **Snapshot and publication cost:** full image ×1.86, host and client publication +65%. This is fine inside budget
   today, but it is the first thing to count against R-5's extra ships.
2. **Grid invariant:** the never-rebuilt grid is correct only because a seeded slot never again holds a static rock.
   Any future rule that creates static rocks, or moves one, breaks it silently. The brute-force test is the guard.
3. **Reserve exhaustion:** with more than 32 fragments at once, the second fragment of a split is dropped. That is
   deterministic but invisible. Breaking every big rock in the stress test used 71 slots, because shattered slots get
   reused.
4. **The duel-oracle bump procedure** cannot bless a gameplay change and a bump together. It needs the two-step
   procedure (version-only bump, then same-version bless). A real build should plan for that.
5. **Map fairness:** belt gaps are guaranteed only at the start. Breaking belt rocks opens new corridors, which is
   arguably the feature, but a breakable belt changes the map spec's guarantees.

## Recommendation: ship a simpler version

Ship **destructible static rocks, without fragments**, and make digging deliberate:

- **State:** one hp value per seeded asteroid (86 values; kind is implied by hp > 0). No reserve, no moving bodies,
  no graceUntil growth, no grid change: dead rocks are filtered. The snapshot grows by about 9% instead of 93%, and
  the publication cost should barely move.
- **Rules:**
  - Rocks crack visibly, then shatter at 0 hp into a debris burst (visual only).
  - The laser hits the first rock that blocks it. A deliberate rock target: click a rock on the Weapons map and the
    laser fires on it. No auto-dig.
  - A torpedo that meets a rock does −4.
  - Consider fewer hp on big rocks (for example ceil(r/15), so 2–4) so that one or two bursts open a line.
- **Fragments, splits, and the "throw rocks at the Hunter" trick:** drop them for now. They cost the most (moving
  bodies, reserve slots, the AI and prediction blind spots, online fx), and in this spike they paid the least. Revisit
  them only if the owner, after playing, specifically wants rock-throwing.

Before building it, the owner should play this branch in single player. Sit at Weapons, target the Hunter while it
hides behind a rock, and judge the dig time. That is the feel question the scripted bots cannot answer.

## Reproduce

- Numbers: `npx tsx scripts/spike-asteroids-measure.ts --json <path>` on this branch and on master; also
  `npx tsx scripts/profile-duel-publication.ts`.
- Screenshots: copy `scripts/spike-asteroids-shots.cjs` into the playwright-core folder, `npm run build` on the
  branch, then `node spike-asteroids-shots.cjs <out dir>`. The solo-only `globalThis.__spikeAsteroids` hook in
  `app/duel/duelMode.ts` stages it. The hook pins both ships while digging, so the shots are staged, not played.
