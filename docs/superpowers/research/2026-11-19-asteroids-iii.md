# Asteroids-iii: the report (2026-11-19)

Branch `spike/asteroids-iii`, plan `docs/superpowers/plans/2026-11-19-asteroids-iii.md`, spec `docs/superpowers/specs/2026-11-19-asteroids-iii-design.md` (revision 4, with its §14 amendment). SIM_VERSION is 61. The full suite at the last gameplay change was 492 files, 5923 tests passed, 2 skipped, 0 failed; `npm run test:determinism` and the two-process duel app smoke pass.

## Status in one paragraph

The belt now turns on rails, freed rocks and pieces fly true gravity paths and billiard, rocks rejoin the belt, and the cracks are redrawn. Everything the plan promised is built and merged on the branch. Three things are open for the owner: the feel check passes 6 of 10 shots (the gate wants 7; every miss is criterion (b), touches), after the three-burst scene one of three seeds leaves 16 rocks free at 270 s (the gate wants 10 or fewer), and the manual look gate. The renderer frame-time check is clean: busy p95 4.3 ms, far under 16.7 ms (section 7).

## How to play it

```
cd C:\Users\djuar\FTLite\.worktrees\asteroids-iii
npm run dev
```

Choose Single player, then Hound. Sit at Weapons (the second tab). Click the Torpedo, then click a belt rock to target it, and launch with F. Watch the shockwave, the shards, the pieces' trails and the touches. The lasers (Space) chip a rock and eventually break it into a fan.

## 1. What was built

- **Rails (spec §2, §3.1, §3.2, §13.1).** Every seeded rock is a rail: it has a centre, an offset and an orbit rate, and its position is a pure function `railPos(s, k, T)` of the tick. Idle rocks cost no bytes on the wire (D8). Cluster members tumble about their centre (kind Tumble). Rock pools have a reserve of 160 free slots; the pool stride is 8.
- **Lanes and rigid clusters (§3.5, §13.1, plan deviation 5).** The belt is three lanes (inner, main, outer) at fixed radii, plus three clusters whose centre radii are drawn constructively with a separation of 420. `MapDef` carries `laneSizes`, `clusterRho` and `clusterCentres`, and `mapHash` covers them. Lane rocks turn at their own rate, so the lanes shear.
- **Free motion (§4, §13.3).** `moveFreeSlot` runs five sub-steps per rock: a symmetric age-ramped drag toward the circular velocity, the planet's gravity (GM unchanged, D4), a soft edge past `R_MAP` and a cap counter. Inside a lane zone, a radial lane pull acts (plan deviation 20). Past the Roche limit a rock splits in a tidal break.
- **The grid (§6.1).** A typed-array broad phase for rocks, rebuilt at the start of every step and kept current as rocks move. `rocksNear(s, x, y, h, out)` writes into a caller-owned scratch array and returns the count.
- **Billiards (§5.3, §5.4, §13.4).** Pairs get a restitution curve, r³ mass (`massCube`), soft contacts and a capped separation. A touch counter records contacts. Eviction takes a slot from any kind when the pool is full, and `rockSlotDust` counts a piece that found no slot.
- **Rejoining (§3.4, §13.2, §14).** A settled free rock may rejoin: a lane capture (within `LANE_CAPTURE_DR` of the lane radius), a rigid group of rejoined rails, or its own orbit. D14 adds the cluster join: a rock refused by a cluster's sweep joins the cluster's tumble group when it is near (D <= 200), or joins the cluster's rotation as a plain rail on the ring when it is far, with a 6 u/s snap.
- **Breaking and the Roche break (§5.1, §5.2, §13.3, §13.6, §14).** A torpedo's direct hit is a burst of 8, 6 or 4 pieces with kicks of `v_esc · (0.30 + 0.30 f)` (D13); lasers, collisions, rams and blast secondaries make a fan of 2 or 3 at 0.10 to 0.25. Pushes are capped.
- **Ships and predictions (§6.2, §6.3, plan deviation 1).** A ship-rock contact frees the rock first and moves both bodies (`RAM_SOFT`). The Hunter's and the scripted crew's hazard sweeps use relative velocity. `predict.ts` reads rocks at tick + k.
- **The renderer (§5.6, §7.1, §7.2, §13.5).** Interpolated draw positions, streaks along the relative velocity, banded trails (a ring of 100 samples at 4 Hz), an outline spin, a predicted path, shards, a touch spark and an 80 ms hit-stop on a burst.
- **The cracks (D10, §7.3).** Cracks are drawn inside the outline and grow with wear: one crack at wear 0.25, two at 0.5 and four at 1.

## 2. The build ledger

Source: `.superpowers/sdd/progress.md`. Sixteen tasks; every one was reviewed. "Fix rounds" are review fix rounds before the task closed.

| Task | Content | Commits | Fix rounds | Minor items carried |
|---|---|---|---|---|
| 1 | Master's idle and after-burst baseline | f3c09070..9c9be14b | 0 | idle medians identical across seeds (structural); digest computed twice (plan code) |
| 2 | Crack drawing | ..dfcb5047 | 0 | `crackDraw` recomputes per frame; unbounded `crackCache`; `outlineRadius` comment; containment test duplicate messages |
| 3 | Orbit maths, lanes, series | ..111fcec0 | 0 | `turnPower` uses `k % 2`; `ROCK_GRID_PAD` relies on `300*DT == 5` exactly |
| 4 | The pool, kinds, accessors, memo | ..4f41ba0e | 1 | stride-7 loop in the Asteroids-ii measure script; redundant `markTouched` after `freeRock`; memo-key wording; lasers read rails at T+1 against ships at T (at most 0.8 u) |
| 5 | Seeded lanes and clusters, `validateMap` | ..06c1aac1 | 0 | `validateMap` lacks negative tests and lane-spacing checks |
| 6 | Soft edge, slack | ..e18fb54e | 0 | no switch-off edge-dust test at `R_MAP + 400`; stale header; doc wording |
| 7 | The grid | ..476c5b2c | 1 | `hunter.ts:229` shadows `i`; module scratch arrays are not re-entrant. Deviation: the caller-owned scratch `rocksNear` |
| 8 | Freeing, clocks, the touched mask | ..21fd26fc | 0 | blast, laser and ship pushes lack `massCube`-on tests; touch event velocity is pre-impulse, position post-separation |
| 9 | Rejoin | ..a0b02b01 | 0 | refusal reasons thinly tested; no in-step position-continuity test; `why` cast |
| 10 | Burst, fan, tidal, contact pass | ..129ae490 | 0 | header lacks the Roche sentence; the Roche test cannot catch a same-pass chain break; tidal pieces lag a tick (plan-mandated); long line |
| 11 | Predictions, hazard, threat | ..71032261 | 1 (perf) | `railPosFrom` lacks an `n<0` guard; identity test does not pin `railPos` |
| 12a | Interpolation, path cache, trails | ..4e046db2 | 2 | marks and `pickRock` use tick position against lagged draw position; a lane-capture rejoin can step up to 5 u; `pathCache` `WeakRef` |
| 12b | Shards, touch cue, hit-stop | ..f0b67dcb | 1 | no scene-level test that `layer.draw` is skipped while holding; `ROCK_TOUCH` shares a sound cap tier with knocks |
| 13 | Feel, stress, cost, idle, after-burst | ..91a279ff | 3 measure rounds + 1 review fix round | see below |
| 14 | Bless, SIM 61, re-pins, smoke | ..2a14c35f | 0 | "at SIM 60" wording in smoke comments; `duelCheckpoint` tail only 164 ticks and a stale inline comment; `valkyrnIdentity` title now false; the `duelGates` exception is silent in the title; pewHunter timeout note |
| 15 | Screenshots and this report | this commit | | |

Task 13 in detail:

- **Round 1 (1abad762).** BLOCKED: feel 0 of 10, settled cost p99 3.9 ms, after-burst 17 to 19 free.
- **Owner decisions** (spec revision 4, §14): D13 and D14.
- **Round 2** (801c4b57, 4f45f156, fdd42dea, 0fef0ef1): D13, D14 and the cost fix (the per-step rail table and the staggered rejoin re-check). Cost, stress and idle pass; feel is 6 of 10; after-burst is 24, 25 and 33 free because D14 never fired (the refused rocks were far round the ring).
- **Round 3** (a9122313, d86b8740): the ring join. After-burst 8, 9 and 16.
- **Review fix round** (91a279ff): tests for the D14 safety branches, the ring join's offset bound on the stored offset (a restore edge bug), the rail table checked mid-step, rejoin docs and an ungated young cost variant.

Open in the ledger for the owner: the feel and after-burst items below. Task 4's note "duelGates seed 4 crew loss with 0 laser releases" was resolved by Task 5's later changes (seed 4 passes); seed 2 became the known exception.

## 3. Spec revisions (rev 4, §14)

The Task 13 measure run (1abad762) found three failures: feel 0 of 10, after-burst 17 to 19 free, settled cost p99 3.9 ms. The owner decided:

- **D13** (replaces D11 and §13.6's burst band). The burst kick goes back to medium: `k_j = v_esc(ρ_parent) · (0.30 + 0.30 · f_j)`. The fan stays at 0.10 to 0.25.
- **D14** (amends §13.2). A settled rock refused only because it lies in a tumbling cluster's sweep joins that cluster's group: it must pass every other rejoin check and satisfy `|v − V_group(p)| < CLUSTER_JOIN_SNAP` (6 u/s); it becomes a Tumble with the cluster's centre and its own offset, position unchanged.
- **The cost failure** was an engineering fix, not an owner decision: rail positions are worked out once per step phase, and refused rocks re-check rejoin on a staggered cadence. Both are deterministic.

**§14 amendment (controller, within D14), after the measure run showed the refused rocks sit round the cluster's ring far from its rocks.**

- **Tumble join, near (D <= 200).** Needs the 6 u/s snap and a ring-clearance check; the new member's sweep must cross no rail outside the cluster.
- **Ring join, far** (D > ρo_max + r_max + r + `ASTEROID_GAP`). The rock joins the cluster's rotation as a Rail with ρω = the cluster centre's radius and a constant distance from the centre. Same snap; its sweep must cross no other rail.
- **Neither:** the rock stays Free. With `clusterTumble` off, a tumble join becomes a Rail. Rejoin events carry `how: 'cluster'` and `join: 'tumble' | 'ring'`.

Measured results at d86b8740 are in section 4.

## 4. Gates

Measured from `docs/superpowers/research/2026-11-19-asteroids-iii-measure.json` (simVersion 60 when measured; the SIM 61 bump was proven to leave every run identical per tick), Task 13's report and Task 14's report. Master's baseline is `2026-11-19-asteroids-iii-master-idle.json`.

| Gate | Target | Measured | Pass |
|---|---|---|---|
| Feel, four switches on | >= 7 of 10 shots | 6 of 10 | FAIL (open) |
| Feel, four switches off | reported | 6 of 10 | n/a |
| Stress twins, save and restore, grid against brute force | no failures | none; 1,320 grid checks | PASS |
| Safety counters | 0 | edgeDust 0, rockSlotDust 0, rockCapHits 0 | PASS |
| Cost p99, flying fill (~246 live rocks) | <= 0.5 ms | median 0.032, p99 0.097 ms | PASS |
| Cost p99, settled fill | <= 0.5 ms | median 0.040, p99 0.143 ms | PASS |
| Cost, young settled variant (ungated) | reported | 0.56 ms worst case | see section 6 |
| Idle frees | 0 | 0 across 20 seeds x 600 s | PASS |
| Idle delta medians, windows at 60, 300, 600 s | within 64 B of master | 860, 863, 863 B on seeds 1 to 3; master 860, 863, 863 (+0) | PASS |
| After-burst free at 270 s, three bursts | <= 10 | seed 1: 8; seed 2: 9; seed 3: 16 | FAIL on seed 3 (open) |
| After-burst delta median | within the gate | 1775, 1739, 2159 B (master 1115, 1175, 1225 B) | PASS |
| duelGates | every seed meets its gates | all pass; H-0 seed 2 laser-release check is a known exception | PASS with exception |
| Whole suite | 0 failures | 492 files, 5923 passed, 2 skipped, 0 failed | PASS |
| `npm run test:determinism` | pass | Node 1800 samples and 330 boundaries, Electron 37.10.3, Firefox: pass | PASS |
| Duel app smoke | pass | two-process duel, 168.9 s, `DUEL_TEST_SEED` 423 | PASS |

### Feel, per shot (switches on; every shot has 8 pieces and mass share 1.0)

| Rock | r | Touches | Turned | Pass | Touches, all off | Turned, all off | Pass, all off |
|---|---|---|---|---|---|---|---|
| 29 | 44.9 | 2 | 4 | no (b) | 2 | 4 | no (b) |
| 22 | 44.4 | 3 | 6 | yes | 3 | 6 | yes |
| 17 | 44.4 | 5 | 4 | yes | 3 | 3 | no (d) |
| 25 | 44.3 | 1 | 4 | no (b) | 2 | 3 | no (b, d) |
| 26 | 44.1 | 5 | 4 | yes | 5 | 4 | yes |
| 50 | 44.0 | 4 | 5 | yes | 4 | 5 | yes |
| 21 | 44.0 | 3 | 4 | yes | 3 | 4 | yes |
| 19 | 43.5 | 3 | 4 | yes | 5 | 4 | yes |
| 52 | 42.3 | 2 | 4 | no (b) | 3 | 4 | yes |
| 33 | 41.7 | 0 | 4 | no (b) | 0 | 4 | no (b) |

Per criterion, out of 10: with the switches on, (a) 10, (b) 6, (c) 10, (d) 10; with them off, (a) 10, (b) 7, (c) 10, (d) 8. Criteria: (a) at least 6 pieces, (b) at least 3 touches in 20 s, (c) at least 50% of the burst's born piece mass alive at 30 s (plan deviation 23), (d) at least 4 pieces turned 25 degrees or more by 20 s. The switches do not decide the result: on and off both pass 6.

### After-burst, with master's baseline

| Seed | Peak free | Free at 270 s | Back to <= 10 at | Delta median | Master free at 270 s | Master delta median |
|---|---|---|---|---|---|---|
| 1 | 55 | 8 | 187 s | 1775 B | 3 | 1115 B |
| 2 | 43 | 9 | 196 s | 1739 B | 7 | 1175 B |
| 3 | 55 | 16 | never | 2159 B | 7 | 1225 B |

The refusal tallies (sampled every 60 ticks from 30 s on) show why seed 3 stays high:

| Seed | sweepLane | snap | laneFar | overlap | sweepCluster | sweepRail |
|---|---|---|---|---|---|---|
| 1 | 515 | 277 | 286 | 53 | 115 | 22 |
| 2 | 493 | 213 | 77 | 168 | 457 | 0 |
| 3 | 804 | 600 | 218 | 6 | 6 | 157 |

At 270 s, seed 3's 16 rocks are refused by `sweepLane` (7), `snap` (4), `laneFar`, `sweepRail` and `speed` (3): belt debris in a lane zone that the lane capture will not take.

### duelGates (Task 14)

All Valkyrn seeds pass and H-0 seeds 1 and 3 to 10 pass. **H-0 seed 2** loses the "at least one crew laser release" check and is recorded as a known exception (owner, 2026-11-19) in `LASER_EXEMPT = new Set(['h0:2'])`; its outcome, cap, torpedo and planet assertions still run. The diagnosis:

- The crew launches its single torpedo just before the laser could fire, which freezes the laser, and the torpedo is lost at the edge.
- The Hunter's first laser hit starts a fire near tick 2643. The gunner leaves Weapons for fires and repairs and does not come back while the laser could fire.
- Of 355 ticks where the laser could have fired, 314 had nobody at Weapons and 41 had the torpedo freezing it.
- Rocks blocked the line of sight on 17 of 862 in-arc ticks, and the crew had 0 rock contacts. So the rocks are not the cause.
- `SHIP_HULL` at 77, 85 and 94 (the plan's fallback) ended on the same tick, so it cannot help; the loss is "every character downed".
- At the merge base, 7 of 10 seeds met this gate with exactly one release; this branch releases 43 lasers in total against 29 at the base.

## 5. Stress counts (20 seeds, 4,000 ticks, restore 1,000)

- **Tidal breaks:** 15 breaks, 30 pieces.
- **Rejoins by `how`:** lane 22, group 0, own 0, cluster 0 (tumble 0, ring 0). The stress scene does not produce settled cluster candidates, which is why D14 only shows in the after-burst scene and its unit tests.
- **Refusals by reason:** `laneFar` 76.
- **`stepDuel`:** median 0.016 ms, p99 0.030 ms.
- **Free count every 10 s (the maximum over seeds):** 13, 17, 29, 31, 39, 47.

## 6. Open items for the owner's playtest

1. **Feel: 6 of 10 (gate: 7).** The four failing shots (rocks 29, 25, 52, 33) fail only criterion (b), touches. The kick is the owner's D13 number; pieces billiard less often than the gate expects within 20 s.
2. **After-burst seed 3 leaves 16 rocks free.** They are belt debris in a lane zone that `sweepLane` and `snap` refuse. `LANE_PULL` and `LANE_CAPTURE_DR` are the owner's knobs (plan deviation 20: the lane pull is 0.004/s² ramped in with the drag; capture is within 5 u of the lane radius). Not tuned, per Task 13's Step 4.
3. **duelGates H-0 seed 2 laser-release check: a known exception** (section 4).
4. **Young-variant worst-case cost 0.56 ms.** The ungated worst case is a fill where every free rock is young (clock 120 to 149 ticks old), so every rock is a rejoin candidate on every tick instead of every 30th. The gated flying and settled variants are 0.097 and 0.143 ms p99. The young variant is pathological (a whole map of young rocks at once).
5. **The four switches are all on by default:** `massCube`, `softEdge`, `clusterTumble`, `rocheBreak` (`ROCK_SWITCHES`, one object in rockTuning.ts; only tests and the measure script change it). Feel passes 6 of 10 with them on or off.
6. **The manual look gate** (section 8): cracks, trails, shards, belt motion.
7. **A frame-time hook was added in this task.** `scene.ts` now publishes its fx state as `globalThis.__spikeAsteroidsFx` (one line, read-only use, like `__spikeAsteroids`) so the frame-time check can count fx items. It is in the shipped build's renderer, as the existing `__spikeAsteroids` hook already is. Remove both together if you want them out.
8. **Missing-resource console errors** (`net::ERR_FILE_NOT_FOUND`, ten printed) appear in the screenshot run. They are unrelated to rocks (no page errors; the run was from a fresh profile, and the art pack is a private repo).

## 7. The renderer frame-time check (owner's addition)

`scripts/spike-asteroids-iii-frames.cjs`, in the real Electron app, Single player, Hound, at Weapons on the map, with the crew pinned 300 u outward of the largest main-lane rock. Frame time is `requestAnimationFrame` deltas in the page. Quiet scene: the untouched belt for 12 s. Busy scene: seven script-side torpedo bursts (`breakRock(..., 'torpedo', 'burst')` on the seven largest rocks nearest the crew, 0.5 s apart; a ship fires one torpedo at a time, so several real torpedo bursts in a few seconds are not possible) and then 12 s of the scene playing out, so the window holds the bursts' shockwaves, shards, pieces, streaks and trails. The break's events are carried into the next tick, so the renderer shows its full effects.

| Scene | Frames | p50 ms | p95 ms | p99 ms | max ms | Frames over 16.7 ms |
|---|---|---|---|---|---|---|
| Quiet (86 live rocks, 0 free) | 2890 | 4.2 | 4.3 | 4.3 | 4.4 | 0 |
| Busy | 2889 | 4.2 | 4.3 | 4.3 | 4.4 | 0 |

**During the busy scene:** 129 live rocks, 58 free rocks (plus the 71 rocks left in the belt's rails), and a sampled peak of 43 live fx items (sampled every 100 ms, so the true peak is a little higher; the fx soft cap is 300 and was never close).

**Reading the numbers.** The monitor here refreshes at about 238 Hz, so a frame that keeps up reads 4.2 ms: `requestAnimationFrame` is locked to the display, and these deltas show only that the page stayed inside one refresh interval for the whole busy scene. p95 is nowhere near 16.7 ms, so the answer to the owner's question is no, p95 is not over. For headroom, the same run with the page's CPU slowed 4x through the DevTools protocol (`CPU_THROTTLE=4`; a rough stand-in for a slow machine) gave:

| Scene, CPU x4 | Frames | p50 ms | p95 ms | p99 ms | max ms | Share over 16.7 ms |
|---|---|---|---|---|---|---|
| Quiet | 1577 | 8.3 | 12.6 | 16.5 | 20.8 | 0.4% |
| Busy | 1127 | 12.4 | 16.5 | 16.7 | 28.9 | 1.2% |

At 4x the busy scene's p95 (16.5 ms) sits just under 16.7 ms and p99 at it. If p95 ever goes over on a real slow machine, the trails are the first knob (they are the largest per-rock drawing cost: 100 samples per rock, banded strokes). Nothing was tuned.

## 8. Performance work done during the build

- **Allocation-free `rocksNear`** (Task 7, at the owner's request): the caller owns a scratch array and gets the count.
- **Predictions 10 to 40 times faster** (Task 11 fix round), bit-identical to the first version.
- **A tuple-free `moveFreeSlot`** (Task 12a), bit-identical.
- **A per-step rail table** (Task 13 round 2): every rail's position is worked out once per step phase and the memo answers from it. Proven equal to the memo with `Object.is` over 2,000 stress ticks and more than 100,000 rows, and checked mid-step over 300,000 rows.
- **A staggered rejoin re-check** (`REJOIN_RECHECK_TICKS = 30`): an old Free rock whose clock has run 30 or more ticks past the minimum is checked only when `(T1 − startTick + k) % 30 == 0` (round-relative, so a rematch round behaves as a fresh duel), from the round tick, slot and clock only. An old rock can wait up to 29 ticks (0.5 s) to rejoin.
- **The renderer path cache and banded trails** (Task 12a): the predicted path is computed once per tick, and a trail is drawn as a few alpha bands, not a stroke per sample.
- **The fx cap** (Task 12b): `FX_SOFT_CAP = 300`; above it the oldest specks (shards, puffs) go first, in place.
- **Settled cost** went from p99 3.9 ms (round 1) to 0.143 ms.

## 9. Tuning

Every knob changed in Tasks 13 and 14:

- **D13 burst kick** (owner decision): `v_esc · (0.30 + 0.30 f)` for a burst (spec rev 4); the fan unchanged at 0.10 to 0.25. Effect: feel went from 0 of 10 to 6 of 10, and after-burst free counts rose (24, 25, 33 before the ring join).
- **New constants:** `CLUSTER_JOIN_SNAP = 6` (D14) and `REJOIN_RECHECK_TICKS = 30` (the cost fix).
- **Not changed:** `SETTLE_K_MAX`, `SETTLE_A1` (Task 13 Step 4 forbids tuning structural refusals), `LANE_PULL`, `LANE_CAPTURE_DR`. `SETTLE_A0 = 20` still exists in rockTuning.ts although the dispatch said it was deleted; it was left untouched.
- **Tried and reverted (Task 14):** `SHIP_HULL` 70 to 77, 85 and 94 for duelGates seed 2. No change in the result.
- **Re-pinned fixtures (Task 14):** duelCheckpoint SPLIT 6292 to 6048; duelModules tick 4205 to 2745; duelSnapshot seed 4 tick 8456 to 6649; tacticalSlots 6574 to 7444; the five Valkyrn digests; pewHunter `PD_SEED` 19 to 58 over 120 seeds (the 1000-seed rate is 0.041 against 0.051 at the base, so the defence is unchanged); duelOnlineView seed 7 to seed 1; the duel app smoke `DUEL_TEST_SEED` 6626 to 423.

## 10. Spec problems found while planning and building

From the plan's "Deviations and clarifications", with what was found while building:

- **3. No rejoin across a rail of another rate.** §5.4 says rail-rail pairs are never checked, but §13.2's checks let a rock rejoin at a radius a lane or cluster rock sweeps at another rate, and the two would pass through each other. `rejoinChoice` leaves a rock Free when its padded annulus overlaps the swept annulus of any live rail with a different ρω. Cost: many settled pieces stay Free (the refusal counts by reason are in section 4); this is why after-burst could fail structurally.
- **14. Arithmetic: burst pieces can exceed `FAN_SPLIT_MIN_R` (13).** A 4-piece burst of r 29.9 gives pieces of 13.46, a 6-piece burst of r 39.9 gives 14.6 and an 8-piece burst of a cluster rock of r 55 gives 17.5; these fan-split once more into pieces of 8.3 to 11.1, and the cascade ends one level later. Thresholds kept.
- **17. Scenes the spec does not define.** Idle and after-burst put the crew on a circular orbit at ρ 2780 and pin the Hunter antipodal with its weapons emptied; the after-burst scene breaks the largest live belt rail at 10, 20 and 30 s; cost fills every empty slot (about 240 live rocks); the idle delta gate allows 64 bytes over master's window median.
- **20. The lane-zone drag target was radially unstable.** Revision 3's V* = ω(ρ_lane)·perp(p) is a rigid rotation, not an orbit: a planning simulation pushed a circular rock at ρ 1200 about 55 u off its lane in 10 minutes. Adopted fix (spec 73497bc4): V* = V_c(p) everywhere; in a lane zone a radial pull `−LANE_PULL (ρ − ρ_lane) p/ρ (k / SETTLE_K_MAX)` with `LANE_PULL = 0.004/s²`; rejoin to a lane only within `LANE_CAPTURE_DR = 5 u`. Probe: a rock started circular at ρ 1225 is within 5 u of 1200 after 31 s, its lowest ρ is 1198.76 (overshoot 1.24 u), and it ends at 1200.00004; a circular rock at exactly 1200 stays within 4e-5 u for 10 minutes; rocks started at 1238 and 1162 reach the lane within 35 s without leaving the zone.
- **21. Rejoin events.** A rejoin pushes `{ what: 'rejoin', by: 'settle', how }`; `RockCause` gains `'settle'` and `'tidal'`. Events are not hashed. Later `how: 'cluster'` and `join`.
- **22. The soft edge's extra drag** is applied as two half steps with the age-ramped drag, and only with the soft edge on and ρ > `R_MAP` at the half-drift point.
- **23. Criterion (c) redefined.** With r³ mass, a burst's pieces carry 0.729/√n of the parent's mass even when all survive (0.26 for 8 pieces), so "at least 50% of the parent's mass alive at 30 s" cannot pass. It is measured as at least 50% of the burst's born piece mass, by the active mass law, with the switches on and off alike.
- **24. The no-drag energy test runs at ρ 1700, not 1200,** because 1200 lies in a lane zone where the lane pull acts once the drag ramps in.
- **25. The outer parking ring did not show.** §13.3 expects returning debris to park as an outer ring at ρ about 2650 to 2750. A rock thrown 60 u/s outward from ρ 2700 peaked at 2881 and settled near ρ 1920. The plan tests only that it comes back inside `R_MAP` and is not dust. What the runs show: the safety counters stay at 0 (no edge dust, no slot dust, no cap hits), and refusal counts are dominated by `laneFar`, `sweepLane`, `snap` and `sweepCluster`, not by escaping rocks.
- **Found while building:**
  - Task 13: the `rocksNear` scratch signature (compile fix in the measure script), missing imports in the brief's script, and `SETTLE_A0` not deleted.
  - Task 13, D14: far ring rocks have chord offsets in the thousands of units, so the near tumble join can never take them; this drove the ring-join amendment. The restore edge: the ring join compared |ρ − ρc|, but `settleRocks` stores `offset = p − p·(ρc/ρ)`, whose length can round to just over 200 and fail restore validation (fixed: 92 joined rocks stored an offset over 200 under the old check).
  - Task 14: the "at least one crew laser release" gate was already marginal at the base (7 of 10 seeds at exactly one release), so seed 2 is a known exception, not a regression to fix. The plan's 300-seed cap on the smoke seed search was too small; the search of seeds 301 to 4000 found 423 (decided on tick 4199).
  - Task 14: the duel app smoke's `DUEL_TEST_SEED` is shared with the internet smoke's constant.

## 11. Screenshots

In `C:/Users/djuar/FTLite-shots/asteroids-iii/` (not committed). Seven files, because the plan's "nine" counted the three crack wear levels as three; they are one picture of three rocks. Script: `scripts/spike-asteroids-iii-shots.cjs`.

- `belt-000s.png`: the belt at 0 s, zoom 0.20, the crew near the centre; three arcs of rocks on the right (the lanes), cluster rocks in knots at the left, the planet at the bottom right.
- `belt-120s.png`: the same view 120 s later; the planet has swung to the top and the lanes are now arcs at different angles: the belt visibly turned and sheared.
- `burst-00s.png`: the torpedo's burst on the largest main-lane rock, zoom 0.50: a bright ball with rings at the impact and eight small pieces around it.
- `burst-02s.png`: two seconds later; pieces have flown apart into a loose fan; the shockwave and flash are gone.
- `burst-10s.png`: at 10 s the pieces have long curved trails (thin curved lines) sweeping across the view; the camera follows the crew, so they bend with the gravity and the turning frame.
- `burst-30s.png`: at 30 s the pieces are spread widely, with curved trails still visible.
- `cracks-025-050-100.png`: three neighbouring rocks at zoom 1.20; the left rock shows one crack, the middle two, the right four with a dashed outline (wear 1). Cracks are thin dark lines and faint at 1.0 zoom. (`cracks-crop.png`, a 3x crop of that shot, shows them clearly.)

## 12. The owner's look check (open)

Please look at, in the real app:

- **Lanes too regular?** Do the three lanes read as a belt, or as rings drawn with a compass?
- **Cracks:** do one, two and four cracks at wear 0.25, 0.5 and 1 read at normal zoom?
- **Trails:** are the curved trails clear, or too long, too many, or too faint?
- **Shards:** the 16 shards at a burst, with the shockwave.
- **Spin and hit-stop feel:** the 80 ms freeze on a burst (the refractory is 250 ms).
- **Belt motion:** does the turning belt look right, with the planet's gravity bending the pieces' paths?
- **Touches:** do pieces knock into each other enough (feel is 6 of 10 on this)?
