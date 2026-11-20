# UI round Part 1: report

Spec: docs/superpowers/specs/2026-11-20-ui-round-design.md §1. Plan: docs/superpowers/plans/2026-11-20-ui-round-part1.md.

## Task 1: base
- UR1_BASE = e4d25b69, SIM_VERSION 64, branch ui-round-1. HUNTER_HULL = 123, VALKYRN_THRUST = 160.
- Typecheck clean; electron-vite build success.
- Suite: 524 files, 6298 tests (6294 passed, 3 skipped, 1 failed on the first full run). The one failure was tests/power.test.ts (fast-check property "with an engineer of level 3, 4, 7 or 8 ...", seed -890232290, "Property failed after 20 tests"). It passed 19/19 on two solo re-runs: a random-seed flake, not a base regression. Otherwise all PASS.
- Canonical baseline: `baseline at sim version 64: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to C:\Users\djuar\AppData\Local\Temp\ftlite-canonical-trace-0b7ec9c4\trace.json` (exit 0).
- Note: both telemetry scripts show median 136.7 s / 140.1 s, below their 180 s gate, at the base (valkyrn script printed "FAIL: median 140.1 s < 180", exit 0). This is the starting position before any change.

### Gates before (duel-telemetry)
```
seed 1: 143.7 s, crew loss, terminal crew [planet downed] enemy [], PLANET END
  crew  laser 0 released, 0 hit (0 stripped), 0 missed; missiles 1 launched, hits W/S/E 0/0/0, lost edge 1; contacts planet 2, asteroid 1
  crew  pew 10 rounds, gun 7 rounds; hold ended at rt 1799 (clock)
  crew  room levels W/S/E: gun 0/0/0, pew 0/0/0, torpedo 0/0/0
  enemy laser 21 released, 21 hit (2 stripped), 0 missed; missiles 4 launched, hits W/S/E 3/0/0, lost edge 1; contacts planet 5, asteroid 1; baits 0
  repairs started/finished P0 1/2, P1 4/6; away walking/repairing P0 68.5/8.0 s, P1 61.7/27.8 s
  helm empty 76.5 s, weapons empty 89.5 s, enemy in arc 41.1 s, weapons idle 0.0 s, console swaps 0
seed 2: 131.5 s, crew loss, terminal crew [laser] enemy []
  crew  laser 0 released, 0 hit (0 stripped), 0 missed; missiles 1 launched, hits W/S/E 0/1/0, lost none; contacts planet 0, asteroid 2
  crew  pew 12 rounds, gun 10 rounds; hold ended at rt 1799 (clock)
  crew  room levels W/S/E: gun 0/0/0, pew 0/0/0, torpedo 0/1/0
  enemy laser 19 released, 19 hit (1 stripped), 0 missed; missiles 3 launched, hits W/S/E 2/0/0, lost expired 1; contacts planet 0, asteroid 2; baits 1
  repairs started/finished P0 2/3, P1 4/5; away walking/repairing P0 55.5/12.0 s, P1 49.0/23.2 s
  helm empty 67.5 s, weapons empty 72.2 s, enemy in arc 68.3 s, weapons idle 0.0 s, console swaps 0
seed 3: 124.2 s, crew loss, terminal crew [laser] enemy []
  crew  laser 0 released, 0 hit (0 stripped), 0 missed; missiles 1 launched, hits W/S/E 0/1/0, lost none; contacts planet 0, asteroid 0
  crew  pew 10 rounds, gun 16 rounds; hold ended at rt 1799 (clock)
  crew  room levels W/S/E: gun 0/0/0, pew 0/0/0, torpedo 0/1/0
  enemy laser 19 released, 19 hit (2 stripped), 0 missed; missiles 3 launched, hits W/S/E 2/0/0, lost missile 1; contacts planet 1, asteroid 1; baits 0
  repairs started/finished P0 5/2, P1 7/10; away walking/repairing P0 42.2/10.1 s, P1 31.1/40.9 s
  helm empty 52.4 s, weapons empty 72.0 s, enemy in arc 31.3 s, weapons idle 0.0 s, console swaps 0
seed 4: 141.9 s, crew loss, terminal crew [pew] enemy []
  crew  laser 0 released, 0 hit (0 stripped), 0 missed; missiles 1 launched, hits W/S/E 0/1/0, lost none; contacts planet 0, asteroid 0
  crew  pew 14 rounds, gun 40 rounds; hold ended at rt 1799 (clock)
  crew  room levels W/S/E: gun 0/0/0, pew 0/0/0, torpedo 0/1/0
  enemy laser 20 released, 20 hit (1 stripped), 0 missed; missiles 4 launched, hits W/S/E 2/1/0, lost missile 1; contacts planet 1, asteroid 2; baits 1
  repairs started/finished P0 4/2, P1 4/11; away walking/repairing P0 51.0/8.3 s, P1 36.1/44.2 s
  helm empty 59.4 s, weapons empty 80.3 s, enemy in arc 44.1 s, weapons idle 0.0 s, console swaps 0
seed 5: 186.1 s, crew loss, terminal crew [pew] enemy []
  crew  laser 0 released, 0 hit (0 stripped), 0 missed; missiles 3 launched, hits W/S/E 2/1/0, lost none; contacts planet 0, asteroid 1
  crew  pew 33 rounds, gun 23 rounds; hold ended at rt 1799 (clock)
  crew  room levels W/S/E: gun 0/0/0, pew 0/0/0, torpedo 2/1/0
  enemy laser 18 released, 18 hit (3 stripped), 0 missed; missiles 5 launched, hits W/S/E 1/2/0, lost edge 1, missile 1; contacts planet 1, asteroid 4; baits 0
  repairs started/finished P0 1/1, P1 7/10; away walking/repairing P0 50.1/4.0 s, P1 57.3/41.1 s
  helm empty 54.1 s, weapons empty 98.4 s, enemy in arc 93.3 s, weapons idle 0.0 s, console swaps 0
seed 6: 89.7 s, crew loss, terminal crew [downed] enemy []
  crew  laser 0 released, 0 hit (0 stripped), 0 missed; missiles 1 launched, hits W/S/E 0/0/0, lost missile 1; contacts planet 0, asteroid 0
  crew  pew 4 rounds, gun 10 rounds; hold ended at rt 1799 (clock)
  crew  room levels W/S/E: gun 0/0/0, pew 0/0/0, torpedo 0/0/0
  enemy laser 12 released, 12 hit (1 stripped), 0 missed; missiles 2 launched, hits W/S/E 1/0/0, lost missile 1; contacts planet 1, asteroid 3; baits 0
  repairs started/finished P0 3/3, P1 5/5; away walking/repairing P0 26.6/12.0 s, P1 21.2/22.1 s
  helm empty 38.6 s, weapons empty 43.3 s, enemy in arc 21.5 s, weapons idle 0.0 s, console swaps 0
seed 7: 121.6 s, crew loss, terminal crew [downed] enemy []
  crew  laser 0 released, 0 hit (0 stripped), 0 missed; missiles 1 launched, hits W/S/E 0/1/0, lost none; contacts planet 0, asteroid 0
  crew  pew 7 rounds, gun 20 rounds; hold ended at rt 1799 (clock)
  crew  room levels W/S/E: gun 0/0/0, pew 0/0/0, torpedo 0/1/0
  enemy laser 19 released, 19 hit (2 stripped), 0 missed; missiles 3 launched, hits W/S/E 2/0/0, lost missile 1; contacts planet 0, asteroid 2; baits 0
  repairs started/finished P0 2/2, P1 4/8; away walking/repairing P0 44.8/10.4 s, P1 42.5/33.9 s
  helm empty 55.2 s, weapons empty 76.4 s, enemy in arc 39.4 s, weapons idle 0.0 s, console swaps 0
seed 8: 154.0 s, crew loss, terminal crew [laser] enemy []
  crew  laser 0 released, 0 hit (0 stripped), 0 missed; missiles 2 launched, hits W/S/E 0/0/0, lost asteroid 1, missile 1; contacts planet 0, asteroid 0
  crew  pew 8 rounds, gun 17 rounds; hold ended at rt 1799 (clock)
  crew  room levels W/S/E: gun 0/0/0, pew 0/0/0, torpedo 0/0/0
  enemy laser 25 released, 25 hit (4 stripped), 0 missed; missiles 4 launched, hits W/S/E 1/2/0, lost edge 1; contacts planet 1, asteroid 3; baits 0
  repairs started/finished P0 2/2, P1 9/11; away walking/repairing P0 54.7/9.8 s, P1 48.5/44.6 s
  helm empty 64.5 s, weapons empty 93.0 s, enemy in arc 57.7 s, weapons idle 0.0 s, console swaps 0
seed 9: 128.2 s, crew loss, terminal crew [laser] enemy []
  crew  laser 0 released, 0 hit (0 stripped), 0 missed; missiles 1 launched, hits W/S/E 0/1/0, lost none; contacts planet 0, asteroid 0
  crew  pew 2 rounds, gun 0 rounds; hold ended at rt 1799 (clock)
  crew  room levels W/S/E: gun 0/0/0, pew 0/0/0, torpedo 0/1/0
  enemy laser 20 released, 20 hit (1 stripped), 0 missed; missiles 3 launched, hits W/S/E 1/1/0, lost missile 1; contacts planet 0, asteroid 5; baits 2
  repairs started/finished P0 2/1, P1 5/9; away walking/repairing P0 49.3/5.0 s, P1 43.3/37.0 s
  helm empty 54.3 s, weapons empty 80.3 s, enemy in arc 79.7 s, weapons idle 0.0 s, console swaps 0
seed 10: 154.7 s, crew loss, terminal crew [laser] enemy []
  crew  laser 0 released, 0 hit (0 stripped), 0 missed; missiles 1 launched, hits W/S/E 0/0/0, lost edge 1; contacts planet 0, asteroid 0
  crew  pew 6 rounds, gun 1 rounds; hold ended at rt 1799 (clock)
  crew  room levels W/S/E: gun 0/0/0, pew 0/0/0, torpedo 0/0/0
  enemy laser 26 released, 26 hit (3 stripped), 0 missed; missiles 4 launched, hits W/S/E 2/1/0, lost asteroid 1; contacts planet 0, asteroid 4; baits 0
  repairs started/finished P0 2/3, P1 5/7; away walking/repairing P0 74.5/12.0 s, P1 73.3/29.0 s
  helm empty 86.5 s, weapons empty 102.3 s, enemy in arc 97.3 s, weapons idle 0.0 s, console swaps 0

median length 136.7 s (gate 180 to 300)
crew wins 0, crew losses 10, draws 0, at the cap 0 (gate: a win and a loss, none at the cap)
every duel with a crew pew or gun round and a missile launch: true
planet-contact ends under 30 s: 0 (gate 0)

passive crew (nobody at either console), not gated: seed 1 127.2 s crew loss; seed 2 146.5 s crew loss; seed 3 85.1 s crew loss; seed 4 132.5 s crew loss; seed 5 139.6 s crew loss; seed 6 103.2 s crew loss; seed 7 114.5 s crew loss; seed 8 138.1 s crew loss; seed 9 113.7 s crew loss; seed 10 170.8 s crew loss
passive median 129.9 s, shortest 85.1 s
```

### Gates before (valkyrn-telemetry)
```
seed 1: 148.5 s, crew loss, hull crew 0/53 enemy 69/123, terminal crew [planet] enemy [], PLANET END
  gun 366 shots, 319 hits (87.2%); missiles 4 launched, hits W/S/E 0/3/0; enemy laser 6 released, 6 hit, missiles 4; repairs 1/2, away walking/repairing 5.9/10.8 s; contacts planet 8, asteroid 1
seed 2: 121.2 s, crew loss, hull crew 13/53 enemy 101/123, terminal crew [downed] enemy []
  gun 199 shots, 176 hits (88.4%); missiles 2 launched, hits W/S/E 0/1/0; enemy laser 12 released, 12 hit, missiles 3; repairs 2/7, away walking/repairing 8.9/30.2 s; contacts planet 0, asteroid 0
seed 3: 159.6 s, crew loss, hull crew 15/53 enemy 86/123, terminal crew [downed] enemy []
  gun 239 shots, 201 hits (84.1%); missiles 3 launched, hits W/S/E 0/2/0; enemy laser 10 released, 10 hit, missiles 4; repairs 5/8, away walking/repairing 19.2/33.1 s; contacts planet 0, asteroid 0
seed 4: 128.1 s, crew loss, hull crew 0/53 enemy 56/123, terminal crew [planet] enemy [], PLANET END
  gun 211 shots, 168 hits (79.6%); missiles 3 launched, hits W/S/E 0/1/0; enemy laser 6 released, 6 hit, missiles 3; repairs 2/6, away walking/repairing 9.1/24.0 s; contacts planet 8, asteroid 1
seed 5: 156.3 s, crew loss, hull crew 13/53 enemy 99/123, terminal crew [downed] enemy []
  gun 327 shots, 269 hits (82.3%); missiles 3 launched, hits W/S/E 0/1/0; enemy laser 13 released, 13 hit, missiles 4; repairs 3/7, away walking/repairing 8.9/29.0 s; contacts planet 0, asteroid 0
seed 6: 99.1 s, crew loss, hull crew 34/53 enemy 107/123, terminal crew [downed] enemy []
  gun 139 shots, 119 hits (85.6%); missiles 2 launched, hits W/S/E 0/1/0; enemy laser 7 released, 7 hit, missiles 2; repairs 4/3, away walking/repairing 14.9/13.9 s; contacts planet 0, asteroid 0
seed 7: 245.8 s, crew loss, hull crew 9/53 enemy 70/123, terminal crew [downed] enemy []
  gun 615 shots, 530 hits (86.2%); missiles 7 launched, hits W/S/E 0/3/0; enemy laser 15 released, 15 hit, missiles 6; repairs 6/9, away walking/repairing 23.5/37.5 s; contacts planet 0, asteroid 1
seed 8: 262.5 s, crew loss, hull crew 24/53 enemy 65/123, terminal crew [downed] enemy []
  gun 664 shots, 564 hits (84.9%); missiles 8 launched, hits W/S/E 0/5/0; enemy laser 14 released, 14 hit, missiles 7; repairs 3/6, away walking/repairing 9.6/25.8 s; contacts planet 0, asteroid 1
seed 9: 127.3 s, crew loss, hull crew 29/53 enemy 97/123, terminal crew [downed] enemy []
  gun 177 shots, 156 hits (88.1%); missiles 2 launched, hits W/S/E 0/1/0; enemy laser 9 released, 9 hit, missiles 3; repairs 2/7, away walking/repairing 8.9/28.9 s; contacts planet 0, asteroid 2
seed 10: 131.7 s, crew win, hull crew 34/53 enemy 0/123, terminal crew [] enemy [planet], PLANET END
  gun 313 shots, 256 hits (81.8%); missiles 4 launched, hits W/S/E 0/2/0; enemy laser 3 released, 3 hit, missiles 3; repairs 0/0, away walking/repairing 0.5/0.0 s; contacts planet 4, asteroid 1

valkyrn median length 140.1 s (gate 180 to 300)
crew wins 1, hunter wins 9 (gate ≥ 1), draws 0, at the cap 0 (gate 0)
gun 3250 shots, 2758 hits (84.9%) over 10 duels; cap 900 s
FAIL: median 140.1 s < 180
```
