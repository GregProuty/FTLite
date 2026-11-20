# Asteroids-iv-a: the cost and feel measurements (2026-11-20)

Script: `scripts/spike-asteroids-iii-measure.ts`, SIM_VERSION 64, branch `asteroids-iv`.
Full run: `npx tsx scripts/spike-asteroids-iii-measure.ts --json out/asteroids-iv-a-measure.json` (the script exits 1: several gates below fail).
Cost reruns: `npx tsx scripts/spike-asteroids-iii-measure.ts --only cost --json out/cost1.json` (twice), and the same with `--no-shatter` (new flag: skips the six shatters).
Timings are from a desktop with no other deliberate load. Other background processes were not checked.

## Summary

| Section | Gate | Result |
|---|---|---|
| stress (20 seeds x 4,000 ticks) | safety, twins, save/restore, grid | PASS (no failures, counters 0) |
| cost | p99 < 0.6 ms | PASS (worst p99 0.28 ms) |
| feel | >= 7 of 10 shots pass | FAIL (0 of 10) |
| idle | 0 rocks freed in 600 s; deltas <= master + 64 B | FAIL (294 freed; deltas larger) |
| burst | free count <= 10 by 270 s; delta median <= 5,500 B | FAIL (free count not back; deltas fine) |

The cost gate passes, so no per-slot memo was added.

## Stress

| Item | Value |
|---|---|
| failures | none |
| edgeDust, slotDust, capHits | 0, 0, 0 |
| grid checks vs brute force | 1,320, all agree |
| tidal breaks / pieces | 32 / 58 |
| rejoins | 5 (all lane) |
| stepDuel median / p99 | 0.0161 / 0.0402 ms |
| free count max by 10 s mark | 7, 19, 25, 34, 37, 43 |

## Cost (stepDuel ms, 3 seeds x 2,000 ticks, about 246 live rocks, six largest seeded rocks shattered first)

| Run | Variant | Median | p99 |
|---|---|---|---|
| Full run | flying | 0.0457 | 0.1441 |
| Full run | settled | 0.0517 | 0.1726 |
| Full run | young (reported) | 0.0906 | 0.1765 |
| Cost run 1 | flying | 0.0382 | 0.2812 |
| Cost run 1 | settled | 0.0422 | 0.1847 |
| Cost run 1 | young | 0.0677 | 0.1465 |
| Cost run 2 | flying | 0.0365 | 0.2800 |
| Cost run 2 | settled | 0.0426 | 0.1990 |
| Cost run 2 | young | 0.0701 | 0.1834 |
| No shatters | flying | 0.0349 | 0.2300 |
| No shatters | settled | 0.0437 | 0.1928 |
| No shatters | young | 0.0851 | 0.2099 |

The six shatters add no measurable cost: medians and p99 are within run-to-run noise of the no-shatter run. The step is about 0.04 ms median and under 0.3 ms p99 against a 0.6 ms gate.

## Feel (seed 2026, 10 largest main-lane rocks, one torpedo each)

Criteria: (a) >= 3 pieces, (b) >= 3 touches in 20 s, (c) >= 50% of born mass alive at 30 s, (d) >= 4 pieces turned >= 25 degrees by 20 s.

| Rock | r | Pieces | Touches | Mass share | Turned | a | b | c | d |
|---|---|---|---|---|---|---|---|---|---|
| 29 | 44.9 | 2 | 0 | 1.0 | 2 | no | no | yes | no |
| 22 | 44.4 | 3 | 4 | 0.929 | 0 | yes | yes | yes | no |
| 17 | 44.4 | 3 | 9 | 1.0 | 2 | yes | yes | yes | no |
| 25 | 44.3 | 3 | 3 | 1.0 | 2 | yes | yes | yes | no |
| 26 | 44.1 | 4 | 2 | 1.0 | 3 | yes | no | yes | no |
| 50 | 44.0 | 2 | 0 | 1.0 | 2 | no | no | yes | no |
| 21 | 44.0 | 2 | 1 | 1.0 | 2 | no | no | yes | no |
| 19 | 43.5 | 2 | 2 | 1.0 | 1 | no | no | yes | no |
| 52 | 42.3 | 3 | 2 | 1.0 | 3 | yes | no | yes | no |
| 33 | 41.7 | 3 | 0 | 1.0 | 2 | yes | no | yes | no |

Passes: 0 of 10. Per criterion: a 6, b 3, c 10, d 0. The all-switches-off run gives the same per-criterion counts (6, 3, 10, 0).

Pieces per shot: 2, 3, 3, 3, 4, 2, 2, 2, 3, 3. Median 3, mean 2.7. This is below the "about four to six" the spec expects: four of ten shatters give only two pieces, and none gives more than four. Whether `shatterGroups` should split into more groups is a question for the controller.

Criterion (d) cannot pass as written: no shot has more than 3 pieces, and (d) needs 4 pieces turned. (b), (c), (d) are the owner's playtest questions (spec 12), not blockers.

## Idle (20 seeds, 600 s, no action)

Rocks freed: 294 (gate 0). Per seed: 22, 27, 16, 12, 8, 19, 6, 13, 25, 16, 7, 17, 12, 15, 19, 17, 18, 10, 9, 6.

Delta medians (bytes) for seeds 1-3 at 60, 300 and 600 s, against the master baseline (`2026-11-19-asteroids-iii-master-idle.json`) plus 64:

| Seed | Mine | Master |
|---|---|---|
| 1 | 860, 1007, 635 | 860, 863, 863 |
| 2 | 860, 1391, 635 | 860, 863, 863 |
| 3 | 860, 1151, 635 | 860, 863, 863 |

The 300 s window is 144 to 528 bytes over master, so the delta gate fails. The 600 s window is under master. The baseline was recorded before the state grew one more array, so the comparison no longer strictly applies, but the 300 s excess tracks the freed rocks (each freed rock sends position updates), not a fixed array cost (the 60 s window equals master exactly).

## Burst (seeds 1-3, bursts at 10, 20, 30 s)

| Seed | Peak free | Free at 270 s | Back to <= 10 | Delta median | Pass |
|---|---|---|---|---|---|
| 1 | 36 | 12 | no | 1,583 | no |
| 2 | 32 | 17 | no | 1,693 | no |
| 3 | 44 | 19 | no | 1,967 | no |

The delta gate (<= 5,500) holds easily. The free count is 2 to 9 over the 10 gate at 270 s. Refusal reasons after the bursts (`burstWhy`) are in the JSON: mostly `bounds`, `snap`, `sweepLane`, `sweepCluster` and `overlap`.

## Gates changed and why

**Feel (a), 6 to 3 pieces.** A shatter now divides the rock's cells into real chunks (a cut or a shatter) instead of a fan of small fragments, so six pieces is no longer the right bar. The gate is three. Even so, 4 of 10 shots give two pieces.

**Cost, p99 0.5 to 0.6 ms (spec 9).** Rocks with cells cost more than plain rocks, since a world cell set is worked out on demand. The gate gets 0.1 ms of room. The measured p99 is under half of it. The cost run now shatters the six largest seeded rocks before timing so cells are exercised; the no-shatter comparison shows their cost is not measurable.

## Not run / caveats

Nothing was skipped. The idle baseline predates the new array, so its delta comparison is indicative only. The idle and burst failures were not compared against a master run of the same script; they may be new with the cell work (rocks freed in a quiet scene) and need a look by the controller.
