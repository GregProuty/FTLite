# Asteroids-iii (Orbiting Belt, Slow Pieces, Visible Gravity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Asteroids-iii spec (`docs/superpowers/specs/2026-11-19-asteroids-iii-design.md`, revision 3: §13 amends §3 to §5 and §7 and wins wherever it conflicts): the belt turns on rails as three lanes, clusters tumble as groups, freed rocks and pieces fly true gravity paths and then settle under an age-ramped drag, swing back from a soft edge, break tidally near the planet, billiard with a restitution curve and r³ masses, and rejoin a lane, a rigid group or their own orbit; a torpedo burst throws pieces at 0.15 to 0.40 of escape speed; the renderer shows it smoothly with trails, spin, a predicted path, shards, a touch cue, hit-stop and redrawn cracks.

**Architecture:** The rock pool stays one hashed `Float64Array` in the tactical state's `space` module, now 8 values per slot (`kind, x, y, vx, vy, r, hp, t`) with kinds Gone 0, Rail 1, Free 2, Tumble 3. A rail slot (Rail or Tumble) holds its centre and offset at tick t and never changes while it turns: its position is a pure function `railPos` of the slot and the tick (new `sim/tactical/rails.ts`), read through accessors (`rockX/rockY/rockVx/rockVy/rockAt`) with a WeakMap memo keyed by every input. During `stepDuel` a step context (a WeakMap, not state) makes rails read at tick + 1. A uniform 96 u rock grid in a WeakMap is rebuilt at the start of every step and kept current as rocks move. New sim rules live beside spike ii's files: `rails.ts` (orbit maths), `rockSettle.ts` (rejoining), the rewritten `rockContacts.ts`, `rockBreak.ts`, `rockBlast.ts`, `rockWeapons.ts`; the renderer gains `render/tactical/rockTrack.ts` (per-slot history).

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, Pixi.js v8 render models, `tsx` scripts, Electron + playwright-core for screenshots.

## Global Constraints

- Work only in `C:/Users/djuar/FTLite/.worktrees/asteroids-iii` (branch `spike/asteroids-iii`). Never touch `C:/Users/djuar/FTLite` or another worktree. Never `git stash`. Never merge or push. Commit only the files a task names.
- Commands run from the worktree root in Git Bash: `cd /c/Users/djuar/FTLite/.worktrees/asteroids-iii`. Tests: `npx vitest run <files>`; types: `npm run typecheck`; whole suite: `npx vitest run`.
- SIM_VERSION goes 59 → **60** in Task 14 only, by the two-step bless: a same-version `npm run bless` of the gameplay at 59, then `npx tsx scripts/golden/canonical-trace.ts baseline` and `npx tsx scripts/golden/duel-oracle.ts baseline` at 59, then the bump to 60 and a version-only `npm run bless` after both `check`s pass. No `--fresh`.
- Determinism guard (`tests/helpers/determinismGuard.ts`, run by `tests/boundary.test.ts` over every file under `src/renderer/src/sim` and what it imports): sim code uses only `+ − × ÷`, `Math.abs`, `ceil`, `floor`, `round`, `min`, `max`, `sign`, `imul`, `sqrt`. No `**`, `Math.pow`, `Math.hypot`, trigonometry, `Date`, `performance`. Fixed constants are literals (`S45 = 0.7071067811865476`). Renderer files (`src/renderer/src/render/**`) may use any Math.
- Spec values, exact (revision 3 where it amends): `ROCK_STRIDE 8`; kinds `Gone 0, Rail 1, Free 2, Tumble 3`; a rail slot is centre (x, y) and offset (vx, vy) at tick t, ρω = |centre|; `CLUSTER_SPIN_PERIOD 200` s; `ROCK_RESERVE 160`; `GM 2.5e6` (unchanged); `ROCK_GRAVITY 1.0`; `ROCK_MAX_SPEED 300` (a safety net, counted in `rockCapHits`); drag `k = 0.06 · clamp((age − 20) / 40, 0, 1)` toward V* by symmetric half steps around the kick; V* = ω(ρ_lane)·perp(p) in a lane zone ([1092, 1161) inner, [1161, 1239) main, [1239, 1308] outer), else V_c(p); soft edge `K_EDGE_ROCK 0.25`, `EDGE_SETTLE_K 0.3`, slack 700 (400 and `K_EDGE` off); Roche `ROCHE_R 175`, r ≥ 13, age ≥ 30 ticks, tidal fan kick 0.03–0.08 v_esc; `REJOIN_MIN_TICKS 120`; `REJOIN_SPEED 0.5`; rejoin bounds `ρ + r ≤ R_MAP − 50`, `ρ − r ≥ PLANET_RADIUS + 80`; group snap `1.5 · ω · |Δρ| < 2`; restore: `|centre| ≥ 150`, `|offset| ≤ 200`, `r` in `[8, 60]`; mass `r³ / 30` (r² off); `BOUNCE_MIN 4`; `e = 0.3 + 0.5 · clamp((vc − 4) / 26, 0, 1)` above it, an e = 0 impulse at or below; separation `0.5 · max(0, overlap − 0.5)` a tick, each rock at most `ROCK_SEPARATE_MAX 8`; `TOUCH_MIN 8`; `ROCK_CRUSH_SPEED 30`; `ROCK_CRUSH_STEP 40`; grid cell 96 u, `ROCK_GRID_PAD 14`; `SHIP_MASS 900`; ship restitution 0.5; `RAM_SOFT 15`; burst 8/6/4 at parent r ≥ 40/30/20 (else dust), offsets 0.85/0.80/0.70 r, kick `v_esc · (0.15 + 0.25 f_j)`; fan 3 at r ≥ 40, 2 at r ≥ 13, offset 0.6 r, kick `v_esc · (0.10 + 0.15 f_j)`; `f_j = frac(j · 0.6180339887498949)`; piece r `0.9 r / √n`; push caps blast `0.5 v_esc(ρ)`, laser `0.25 v_esc(ρ)`; lanes (ρ, r band, count) inner (1122, 15–20, 17), main (1200, 25–45, 36), outer (1278, 15–20, 17); cluster centre ρ separation 420; trails 25 s at 4 Hz while younger than 60 s, else 6 s; outline spin ±0.1–0.5 rad/s; `LASER_ROCK_PUSH 4000`, `BLAST_PUSH 60000`, `BLAST_RADIUS 120` (unchanged).
- The four switches `ROCK_SWITCHES.{massCube, softEdge, clusterTumble, rocheBreak}` (rockTuning.ts) are all `true`; tests that flip one use `withSwitches` (tests/helpers/rockArena.ts), which always restores them; nothing in the app sets them (plan deviation 19).
- Softened forms (§2): `q = ρ² + ε²` (ε = `GRAVITY_EPS` 20); `ω = sqrt(GM / (q·sqrt(q)))`; `V_c(p) = ω · (−y, x)`; `v_esc = sqrt(2·GM / sqrt(q))`; rail step `θ = ω(ρω)·DT` (a Tumble's offset also by `θ_spin = 2π·DT/200`) with the series `c = 1 − θ²/2 + θ⁴/24 − θ⁶/720 + θ⁸/40320`, `s = θ − θ³/6 + θ⁵/120 − θ⁷/5040 + θ⁹/362880`; one step `p′ = (c·x − s·y, s·x + c·y)`.
- Tick order after this plan (fixed): `events = []`, `beginRockTick` (masks cleared), `beginRockStep` (phase T + 1, grid rebuilt), hunter think, weapon commands per active ship in slot order, ships fly, missiles fly, `stepRocks` (part 1 the Roche break or free motion; part 2 contacts), ship contacts, missile contacts, gun rounds, pew rounds, weapon clocks, hostility, scan, salvage, `settleRocks`, outcome, `beginRockTick`, `endRockStep`, `tick++`.
- Transient masks `rockBorn`, `rockDone`, `rockTouched`: one flag per slot, not hashed, not snapshotted, fresh in a clone, cleared at the start and the end of every `stepDuel`. The rail memo and the rock grid are module WeakMaps keyed by the state object: never hashed, snapshotted, published or copied by `cloneTacticalFromModule`.
- The dev flight view's single-ship steps (`stepFlight`, `stepSoloFlight` → `hitStatics`) never write or free the pool (Deviation 1).
- Single player is the gate; no online fx work (§9). All new colours are `CRT.*` ramp constants.
- Goldens and trajectory-pinned tests (`tests/golden.test.ts`, `duelGolden`, `duelRematchGolden`, `determinismHarness`, `duelCheckpoint`, `duelModules`, `duelSnapshot`, `duelScripted`, `tacticalSlots` pinned ticks, telemetry counts) are expected to fail from Task 4 until Task 14. Tasks 1–13 run only their targeted tests plus `npm run typecheck`; Task 14 runs the whole suite.
- Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Deviations and clarifications

1. **The flight view's contacts read the pool through the accessors** (spec §6.2 says the single-ship modes "keep still map asteroids from `map.asteroids` and never read the pool", and calls that unchanged; on master `hitStatics` already reads the pool through `rocksNear`/`rockAt`). Keeping that code means the flight view's drawn belt (which turns) and its contacts agree. `hitStatics` never frees, pushes or writes a rock, so the spec's intent (flight modes do not change the pool) holds. Its relative-velocity bounce now sees the rail's velocity.
2. **Freeing before the motion pass.** Weapon commands (lasers) run before `stepRocks`, while Free rocks still stand at tick T. A rail freed then is written at `railPos(T)` with its rail velocity at T (`freeFrame`), so the motion pass carries it to T + 1 with every other free rock; after the motion pass (contacts, ships, blasts) it is written at `railPos(T + 1)` as §3.4 says. Its clock `t` is T + 1 either way. The step context records whether the motion pass has run.
3. **No rejoin across a rail of another ω.** §5.4 says rail-rail pairs are never checked and rejoin keeps it so, but §13.2's checks ("overlaps no live rock" now, a group scan over rejoined rails only) let a rock rejoin at a radius a lane or cluster rock sweeps at another rate, and the two would later pass through each other. `rejoinChoice` therefore also leaves a rock Free when its padded annulus `[ρ − r − ASTEROID_GAP, ρ + r + ASTEROID_GAP]` overlaps the swept annulus of any live rail whose ρω differs from the chosen one (a Rail's `|p| ± r`, a Tumble's `|centre| ± (|offset| + r)`). Group candidates are Rails only (rejoined rails are Rails), and lane and cluster rails are told apart by their |centre| matching a lane ρ or a cluster centre's ρ within 1e-6.
4. **A lane rock's ρω is |its position|** (§13.1: centre its own position, offset 0), its lane radius to within an ulp; the rate difference this leaves inside one lane moves two of its rocks about 5e-11 u apart in a 3-hour game.
5. **Constructive cluster radii.** Sequential random draws in 1550–2550 often leave no room for the third cluster at 420 separation. The generator draws three slacks in `[0, 160]` (160 = 1000 − 2·420), sorts them, and sets centre ρ_k = 1550 + 420 k + slack_k; the angle is drawn as before until the spawn clearance holds. `MapDef` gains `laneSizes` (inner, main, outer counts; belt order is inner, then main, then outer), `clusterRho` (each centre's ρ) and `clusterCentres` (each centre, the cluster rocks' rail centre); `mapHash` covers all three.
6. **The grid is kept current.** Besides the rebuild at the start of every step and the insert at birth (§6.1), a rock is relinked into its cell whenever the sim moves it (free motion, pair and ship separation, freeing). The 14 u pad stays as margin; the brute-force test holds by construction. `rocksNear` keeps its contract (ascending, no repeats, the bounding-box rule) and still returns a fresh `number[]`, so nested callers stay safe; the gathering and the insertion sort use the grid's reused scratch `Int32Array`. Outside a step (renderer, `predict.ts`, scripted code, unit tests) `rocksNear` scans every slot through the accessors (§6.1). The seeded `state.grid` (`BroadPhase`) stays on the state, unused by rocks, because tests and the snapshot code read it.
7. **The ship-side separation cap.** A ship-rock contact moves the rock at most `ROCK_SEPARATE_MAX` and the ship takes the rest of the overlap, so no contact throws a rock past the grid pad.
8. **Free motion runs rock by rock.** §4 says each sub-step finishes for every rock before the next begins; free rocks never read one another during motion, so running the five sub-steps per rock in slot order gives the same values.
9. **Touch counting reads the clocks before the contact.** The touch counter compares the two rocks' `t` as they stood before this contact freed or pushed them.
10. **Hit-stop timing.** The 80 ms freeze starts on the frame after the burst is drawn, so the impact frame is what holds; shards and the shockwave queued meanwhile wait at age 0.
11. **Shard random.** Shards use the view's seeded `fxRandom` (renderer-only, like every existing rock fx) rather than `Math.random`.
12. **Streaks.** A free rock streaks along its velocity relative to `V_c(p)` when that speed is above `STREAK_MIN_REL = 8`; the tail is `min(90, rel · 1 s)` world units with alpha `min(1, (rel − 8) / 40)`.
13. **Trail sampling.** One ring of 100 samples at 4 Hz per slot (§13.5's 25 s); a rock younger than 60 s shows all of it, an older one the last 6 s (24 samples); the history resets on a kind or r change, or a jump over 50 u between ticks (§7.1).
14. **Spec problem (arithmetic): burst pieces can exceed `FAN_SPLIT_MIN_R`.** §5.1 says every burst piece is under 13. In fact a 4-piece burst of r 29.9 gives pieces of 13.46, a 6-piece burst of r 39.9 gives 14.6 and an 8-piece burst of a cluster rock of r 55 gives 17.5, and those fan-split once more into 2 pieces of 8.3 to 11.1 (under 13, so their next break is dust). The cascade still ends one level later. The plan keeps the spec's thresholds and records this in the report.
15. **No sibling overlap is a burst rule.** §8.1's "no sibling overlaps at birth" is tested for the burst patterns; the fan keeps today's 0.6 r offset, at which its siblings overlap at birth (as on master) and separate under the capped pair rule.
16. **The 5-laser test uses hp 100** so the rock does not break before the fifth shot (an r 45 rock has hp 5 and the laser does 2).
17. **Measurement scenes** (§8.2, §8.3 name the gates but not every scene): the idle and after-burst scenes put the crew on a circular orbit at ρ 2750 (clear of every seeded rock) and pin the Hunter antipodal with its weapons emptied (the duel snapshot needs both slots active); the after-burst scene breaks the largest live belt rail with a script-side burst at 10, 20 and 30 s; the cost gate fills every empty slot with a free rock (about 240 live) and runs the stress driver; the safety counters come from the 20-seed stress run. Master's idle and after-burst baselines are measured in Task 1, before any sim change, with the same script.
18. **The grid test's run length.** "Every tick of 20 seeded stress runs" is 20 seeds × 200 ticks each in the unit test (time budget); the measure script's stress run covers 4,000 ticks per seed.
19. **The switches are one object, not four `const`s.** §13.7 makes them compile-time constants with tests in both states and a measure run with all four off. `ROCK_SWITCHES` is a plain object in rockTuning.ts whose defaults are the constants; only tests (`withSwitches`) and the measure script change it, always restoring it, and the functions that read a switch also take it as a parameter (`rockMass(r, cube)`, `rockEdgeAccel(x, y, soft)`, `seededRail(map, k, tumble)`, `moveFreeSlot(…, soft)`). Peers never differ: nothing in the app writes it.
20. **Spec problem (physics): the lane-zone drag target is radially unstable.** V* = ω(ρ_lane)·perp(p) is a rigid rotation, not an orbit: off the lane radius the drag gives a rock more (outside) or less (inside) speed than its circular speed, so it drifts away from the lane toward the zone edges. A planning simulation of §13.3's step at full drag drifted a circular rock at ρ 1200 by about 55 u in 10 minutes (outside the zones, at 1700, by 0.001 u). In practice most debris is captured within about 100 s of settling, before it drifts far, so the plan builds §13.3 as written, tests the second-order fixed point outside the zones, and reports lane-capture counts (Task 13) so the owner can judge; a capture near a zone edge that would overlap the next lane is refused by deviation 3. A fix the owner could choose: in a zone, target V_c(p) plus a small radial pull toward ρ_lane.
21. **Rejoin events and causes.** The stress run must report lane captures, group rejoins and own-orbit rejoins (§13.7), so a rejoin pushes a view event `{ what: 'rejoin', by: 'settle', how }`; `RockCause` gains `'settle'` and `'tidal'` (the Roche break, §13.3). Events are not hashed.
22. **Spec gap: the soft edge's extra drag is applied as two half steps** with the age-ramped drag (symmetric around the kick), and only with the soft edge on and ρ > R_MAP at the half-drift point.

---

## File Structure

Created:

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/tactical/rails.ts` | Orbit maths: `orbitRate`, `circularVelocity`, `escapeSpeed`, `seriesStep`, `railStep`, `turnPower`, `railPos` with centre, offset and tumble, lane zones and V* (§2, §3.2, §13.1, §13.2). |
| `src/renderer/src/sim/tactical/rockSettle.ts` | `rejoinChoice`, `settleRocks`: the end-of-tick rejoin pass with lane capture, rigid groups and own orbit (§3.4, §13.2). |
| `src/renderer/src/render/tactical/rockTrack.ts` | Renderer per-slot history: interpolated draw positions, trails and their resets (§7.1). |
| `scripts/spike-asteroids-iii-idle.ts` | The quiet scene (idle and after-burst): deltas, frees, free counts; runs on master and the branch. |
| `scripts/spike-asteroids-iii-measure.ts` | Feel check, stress, cost, idle and after-burst gates (§8.2, §8.3). |
| `scripts/spike-asteroids-iii-shots.cjs` | §8.4 screenshots through the solo hook. |
| `tests/helpers/rockStress.ts` | Hunter switch-off, co-orbit parking, the stress driver. |
| `tests/rockRails.test.ts`, `tests/rockMotion.test.ts`, `tests/rockGrid.test.ts`, `tests/rockSettle.test.ts`, `tests/rockCracks.test.ts`, `tests/rockTrack.test.ts`, `tests/rockPredict.test.ts` | Tests for the new rules. |
| `docs/superpowers/research/2026-11-19-asteroids-iii-master-idle.json` | Master's idle and after-burst baseline (Task 1). |
| `docs/superpowers/research/2026-11-19-asteroids-iii-measure.json` | The branch's measurements (Task 13). |
| `docs/superpowers/research/2026-11-19-asteroids-iii.md` | The report (Task 15). |

Modified:

| File | Change |
|---|---|
| `src/renderer/src/sim/tactical/rocks.ts` | Stride 8, kinds (with Tumble), reserve 160, seeded rails, accessors and memo, step context and phase, `freeRock`, clocks, the touched mask, the mass switch, the rock grid's rebuild and `rocksNear`. |
| `src/renderer/src/sim/tactical/rockTuning.ts` | Every new number and `ROCK_SWITCHES`; `ROCK_WAKE_SPEED`, `ROCK_DRAG`, `ROCK_FLING`, `ROCK_BLAST_FLING` (and `ROCK_RESTITUTION` once unused) removed. |
| `src/renderer/src/sim/tactical/tuning.ts` | `LANES`, `LANE_ZONE_EDGES`, `CLUSTER_RHO_SEPARATION`, `CLUSTER_RHO_SLACK`. |
| `src/renderer/src/sim/tactical/grid.ts` | The rock grid (typed arrays, WeakMap, link, query). |
| `src/renderer/src/sim/tactical/rockContacts.ts` | Free motion (`moveFreeSlot`: the symmetric age-ramped drag toward V*, the soft edge, the cap counter), the Roche break, edge slack, the contact-pass rules, the restitution curve, soft contacts and separation, the touch counter. |
| `src/renderer/src/sim/tactical/rockBreak.ts` | Burst 8/6/4, offsets, escape-scaled kicks, the tidal pattern, push frees and restarts the clock, eviction of any kind, `rockSlotDust`, `burst` on the split event. |
| `src/renderer/src/sim/tactical/rockBlast.ts`, `rockWeapons.ts` | The push caps. |
| `src/renderer/src/sim/tactical/contacts.ts` | Ship-rock: free first, two bodies, `RAM_SOFT`, the rock-side separation cap. |
| `src/renderer/src/sim/tactical/map.ts` | Lanes, constructive cluster radii, `laneSizes`, `clusterRho`, `clusterCentres`, the new `validateMap` rules. |
| `src/renderer/src/sim/tactical/state.ts`, `hash.ts` | `rockTouched`, `rockTouches`, `rockSlotDust`, `rockCapHits`, the `touch` and `rejoin` events, the `tidal` and `settle` causes, restore validation of rock slots, clone and `notSnapshotted`. |
| `src/renderer/src/sim/tactical/duel.ts` | `beginRockStep`/`endRockStep`, `settleRocks`. |
| `src/renderer/src/sim/tactical/predict.ts` | Rocks at tick + k (`rockAhead`), `predictRock`. |
| `src/renderer/src/sim/tactical/hunter.ts`, `src/renderer/src/sim/duel/scripted.ts` | Relative-velocity hazard sweeps. |
| `src/renderer/src/sim/duel/hash.ts` | `mapHash` covers `laneSizes`, `clusterRho` and `clusterCentres`. |
| `src/renderer/src/render/tactical/tacticalModel.ts`, `tacticalLayer.ts`, `rockFx.ts`, `fxModel.ts` | `crackPaths`, interpolation, trails, relative streaks, outline spin, predicted path, shards, touch spark, hit-stop. |
| `src/renderer/src/audio/rockSounds.ts` | The touch knock. |
| `src/renderer/src/app/duel/scene.ts` | The rock track and hit-stop. |
| `scripts/profile-duel-publication.ts` | Kind names. |
| `src/renderer/src/sim/tuning.ts` | SIM_VERSION 60 (Task 14). |
| Tests: `tests/helpers/rockArena.ts`, `rockPool`, `rockContacts`, `rockShips`, `rockLaser`, `rockBreak`, `rockBlast`, `rockFx`, `rockSounds`, `tacticalMap`, `tacticalDeterminism`, `contactScene`, plus pinned fixtures in Task 14. Deleted: `scripts/spike-asteroids-ii-measure.ts`, `scripts/spike-asteroids-ii-shots.cjs` (spec §11: replaced). |

Asteroids-ii tests deleted by this design (spec §11), each in the task that removes its rule: the wake speed (`rockPool` "wakes a static rock only above ROCK_WAKE_SPEED", Task 4), a still rock infinitely heavy (`rockContacts` "a static rock touched at vc ≤ 40 stays static", `rockShips` "rammed at 40 u/s stays static", Task 4), edge dust at R_MAP (`rockContacts` "a rock touching the planet, or whose centre leaves the map" is rewritten for the slack, Task 6), fixed fling speeds (`rockBreak`, `rockBlast` 150 and 200 u/s cases, rewritten in Task 10). Spike ii cases whose arithmetic is in r² masses run with `massCube` off (Task 8) rather than being deleted.

---
### Task 1: Master's idle and after-burst baseline (before any sim change)

The spec's idle gate compares the branch's 20 Hz deltas with master's (§8.3). The branch is master's code plus the spec today (`git diff master --stat` lists only the spec), so this task writes the quiet-scene script and records master's numbers before any sim file changes. The same file measures the branch in Task 13.

**Files:**
- Create: `scripts/spike-asteroids-iii-idle.ts`
- Create (by running it): `docs/superpowers/research/2026-11-19-asteroids-iii-master-idle.json`

**Interfaces:**
- Consumes: APIs that exist on master and on the branch: `createDuel`, `disposeDuel`, `stepDuelTick`, `saveDuelSnapshot`, `duelPublicationToImage`, `encodeDelta`, `circularSpeed`, `breakRock(s, k, ux, uy, by, ship, pattern)`, `beginRockTick`, `ROCK_STRIDE`.
- Produces: `export const IDLE_ORBIT_R = 2750`, `IDLE_SEEDS = [1, 2, 3]`, `IDLE_WINDOWS: readonly (readonly [number, number])[]` (`[[60, 61], [300, 301], [600, 601]]`), `BURST_TIMES = [10, 20, 30]`, `BURST_WINDOW = [10, 270]`; `export interface QuietRun { seed: number; seconds: number; bursts: number[]; outcome: number; ticks: number; leftKind1: number; freeEachSecond: number[]; deltas: number[][] }`; `export function quietRun(seed: number, seconds: number, windows: readonly (readonly [number, number])[], bursts?: readonly number[]): QuietRun`; `export function median(xs: readonly number[]): number`. Task 13 imports these.

- [ ] **Step 1: Confirm the branch's code is master's**

Run: `git diff master --stat`
Expected: one file, `docs/superpowers/specs/2026-11-19-asteroids-iii-design.md` (and this plan once committed). If any `src/` file differs, stop and report BLOCKED: the baseline would not be master's.

- [ ] **Step 2: Write `scripts/spike-asteroids-iii-idle.ts`**

```ts
// Asteroids-iii (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md §8.3): the quiet scene for the idle-belt and
// after-burst gates. No player acts: the crew Hound flies a circular orbit at IDLE_ORBIT_R (every seeded rock's surface
// lies inside R_MAP − EDGE_MARGIN = 2700, so the ship never touches one), and the Hunter is pinned antipodal to it after
// every tick with its weapons emptied (the duel snapshot needs both slots active and locked on each other). `bursts`
// (seconds) break the largest live kind-1 belt rock with a torpedo-style burst at those times (script-side, between
// ticks). Reported per run: the 20 Hz delta image sizes in each window, how many slots ever left kind 1, and the kind-2
// count each second. Only APIs that exist on master (SIM 59) and on spike/asteroids-iii are used and kinds are compared
// as numbers (1 Static/Rail, 2 Moving/Free), so this one file measured master's baseline (Task 1) and measures the branch.
//   npx tsx scripts/spike-asteroids-iii-idle.ts [--json <path>]
// The duel helpers read the bundler-defined __GAMEPLAY_CONTENT_DIGEST__; tsx defines nothing, so it is supplied here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { computeContentDigest } from '../build/contentDigest';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick, type DuelInput } from '../src/renderer/src/sim/duel/step';
import { circularSpeed } from '../src/renderer/src/sim/tactical/map';
import { breakRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { beginRockTick, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { SIM_VERSION, TICK_HZ } from '../src/renderer/src/sim/tuning';
import { duelPublicationToImage, type DuelPublication } from '../src/network/modes/duelStream';
import { encodeDelta, type StateImage } from '../src/network/state/imageCodec';
import { hashF64 } from '../src/shared/hash';

export const IDLE_ORBIT_R = 2750;
export const IDLE_SEEDS = [1, 2, 3] as const;
export const IDLE_WINDOWS: readonly (readonly [number, number])[] = [[60, 61], [300, 301], [600, 601]];
export const BURST_TIMES = [10, 20, 30] as const;
export const BURST_WINDOW = [10, 270] as const;
export interface QuietRun { seed: number; seconds: number; bursts: number[]; outcome: number; ticks: number; leftKind1: number; freeEachSecond: number[]; deltas: number[][] }

(globalThis as Record<string, unknown>).__GAMEPLAY_CONTENT_DIGEST__ = computeContentDigest(process.cwd());
const contentDigest = computeContentDigest(process.cwd()), layout = DUEL_LAYOUT;
const options = { resolveLayout: (id: string) => { if (id !== layout.id) throw Error('unknown layout'); return layout; }, contentDigest };
const IDLE: DuelInput = { held: [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }], commands: [] };

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length === 0 ? 0 : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function publication(d: DuelState, sequence: number): DuelPublication {
  const snapshot = saveDuelSnapshot(d, contentDigest);
  return { runId: 'quiet', tick: d.interior.tick, publicationSequence: sequence, snapshot, hash: hashF64(Float64Array.from(snapshot.values)), phase: 'running',
    pauseOwner: null, pauseReason: null, controlRevision: 0, lagTicks: 0, tickTimeMs: null, commandHighWater: [0, 0], heldHighWater: [0, 0], auxiliaryHighWater: [0, 0], eventSequence: 0 };
}
/** The Hunter antipodal to the crew with its weapons empty: it neither fires nor meets a rock. */
function pinHunter(d: DuelState): void {
  const c = d.tactical.ships[0]!, h = d.tactical.ships[1]!, hs = d.tactical.systems[1]!;
  Object.assign(h, { x: -c.x, y: -c.y, vx: -c.vx, vy: -c.vy, heading: (c.heading + 128) % 256, headingAcc: 0 });
  hs.laserCharge = 0; hs.magazine = 0; hs.pewCharge = 0; hs.gunHeat = 0;
}
/** The largest live kind-1 rock among the belt's slots (−1 when none). */
function biggestBeltRail(d: DuelState): number {
  const t = d.tactical; let best = -1;
  for (let k = 0; k < t.map.beltCount; k++) {
    const b = k * ROCK_STRIDE;
    if (t.rocks[b] === 1 && (best < 0 || t.rocks[b + 5]! > t.rocks[best * ROCK_STRIDE + 5]!)) best = k;
  }
  return best;
}

/** One quiet run of `seconds`: deltas (bytes) per window [from, to) seconds at 20 Hz, kind-1 departures, kind-2 counts. */
export function quietRun(seed: number, seconds: number, windows: readonly (readonly [number, number])[], bursts: readonly number[] = []): QuietRun {
  const d = createDuel(layout, seed), t = d.tactical, v = circularSpeed(IDLE_ORBIT_R), ticks = Math.round(seconds * TICK_HZ);
  try {
    Object.assign(t.ships[0], { x: 0, y: -IDLE_ORBIT_R, vx: v, vy: 0, heading: 64, headingAcc: 0 });   // clockwise (y down), as spawnAt
    pinHunter(d);
    const deltas = windows.map(() => [] as number[]), freeEachSecond: number[] = [];
    let previous: StateImage | null = null, sequence = 1, leftKind1 = 0;
    const kinds = Array.from({ length: t.rocks.length / ROCK_STRIDE }, (_, k) => t.rocks[k * ROCK_STRIDE]!);
    for (let k = 1; k <= ticks; k++) {
      stepDuelTick(d, IDLE); pinHunter(d);
      if (bursts.some((s) => Math.round(s * TICK_HZ) === k)) {
        const rock = biggestBeltRail(d), b = rock * ROCK_STRIDE;
        if (rock >= 0) { breakRock(t, rock, -t.rocks[b + 1]!, -t.rocks[b + 2]!, 'torpedo', 0, 'burst'); beginRockTick(t); }
      }
      for (let j = 0; j < kinds.length; j++) { const now = t.rocks[j * ROCK_STRIDE]!; if (kinds[j] === 1 && now !== 1) leftKind1++; kinds[j] = now; }
      if (k % TICK_HZ === 0) { let free = 0; for (let j = 0; j < kinds.length; j++) if (kinds[j] === 2) free++; freeEachSecond.push(free); }
      if (k % 3 !== 0) continue;   // a 20 Hz publication every third tick
      const w = windows.findIndex(([from, to]) => k >= Math.round(from * TICK_HZ) - 3 && k < Math.round(to * TICK_HZ));
      if (w < 0) { previous = null; continue; }
      const image = duelPublicationToImage(publication(d, sequence++), options);
      if (previous && k >= Math.round(windows[w]![0] * TICK_HZ)) deltas[w]!.push(encodeDelta(previous, image).byteLength);
      previous = image;
    }
    return { seed, seconds, bursts: [...bursts], outcome: t.outcome, ticks: t.tick, leftKind1, freeEachSecond, deltas };
  } finally { disposeDuel(d); }
}

const main = (process.argv[1] ?? '').replaceAll('\\', '/').endsWith('scripts/spike-asteroids-iii-idle.ts');
if (main) {
  const at = process.argv.indexOf('--json'), out = at > 0 ? process.argv[at + 1] ?? null : null;
  const idle = IDLE_SEEDS.map((seed) => quietRun(seed, 601, IDLE_WINDOWS));
  const burst = IDLE_SEEDS.map((seed) => quietRun(seed, BURST_WINDOW[1], [BURST_WINDOW], BURST_TIMES));
  const summary = {
    idle: idle.map((r) => ({ seed: r.seed, outcome: r.outcome, leftKind1: r.leftKind1, medians: r.deltas.map(median), max: r.deltas.map((x) => Math.max(...x)) })),
    burst: burst.map((r) => ({ seed: r.seed, outcome: r.outcome, leftKind1: r.leftKind1, deltaMedian: median(r.deltas[0]!), freeAt30: r.freeEachSecond[29], freeAt90: r.freeEachSecond[89], freeAt270: r.freeEachSecond[269] }))
  };
  const result = { simVersion: SIM_VERSION, windows: IDLE_WINDOWS, burstTimes: BURST_TIMES, burstWindow: BURST_WINDOW, summary, idle, burst };
  console.log(JSON.stringify(summary, null, 2));
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result) + '\n'); }
}
```

- [ ] **Step 3: Type-check and run it on master's code**

Run: `npm run typecheck && npx tsx scripts/spike-asteroids-iii-idle.ts --json docs/superpowers/research/2026-11-19-asteroids-iii-master-idle.json`
Expected: typecheck clean; for each idle seed 1–3 the summary shows `outcome: 0`, `leftKind1: 0` and three window medians in the 800–900 byte range (a planning probe of this scene measured 826–865 bytes per delta for seeds 1–3); the burst rows show master's after-burst delta median and free counts (informational). The JSON file holds `simVersion: 59`. Runtime: about a minute.

- [ ] **Step 4: Commit**

```bash
git add scripts/spike-asteroids-iii-idle.ts docs/superpowers/research/2026-11-19-asteroids-iii-master-idle.json
git commit -m "chore(asteroids-iii): the quiet-scene script and master's idle and after-burst baseline (SIM 59)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cracks redrawn inside the outline (§7.3, D10)

Independent of the sim work. The outline is `asteroidShape(index)` (9 radius multipliers at angles 2πk/9, `tacticalModel.ts`); today's cracks (`tacticalLayer.ts` lines 271–279) end at an unrelated vertex's multiplier and can leave the outline.

**Files:**
- Modify: `src/renderer/src/render/tactical/tacticalModel.ts` (append the crack model after `asteroidShape`, the end of the file)
- Modify: `src/renderer/src/render/tactical/tacticalLayer.ts:14` (import) and `:271-279` (the crack loop)
- Test: `tests/rockCracks.test.ts`

**Interfaces:**
- Consumes: `asteroidShape(index: number): number[]` (tacticalModel.ts), `Point` (camera.ts, already imported there), `CRT` (crtTheme.ts).
- Produces: `export const CRACK_COUNT = 4, CRACK_INSET = 0.88, CRACK_MIN_PX = 6`; `export type CrackLine = Point[]`; `export function outlineRadius(shape: readonly number[], angle: number): number`; `export function crackPaths(index: number, wear: number): CrackLine[]` (rock-local, unit radius); `export interface CrackSegDraw { x1: number; y1: number; x2: number; y2: number; light: boolean }`; `export function crackDraw(index: number, wear: number, cx: number, cy: number, r: number): CrackSegDraw[]` (screen px: every cut segment, then every highlight).

- [ ] **Step 1: Write the failing test** `tests/rockCracks.test.ts`:

```ts
// Asteroids-iii §7.3 (D10): the cracks are fixed per rock, grow with wear as prefixes, and stay strictly inside the outline.
import { describe, expect, it } from 'vitest';
import { asteroidShape, CRACK_MIN_PX, crackDraw, crackPaths, outlineRadius } from '../src/renderer/src/render/tactical/tacticalModel';

const TAU = Math.PI * 2;
/** Ray-casting point-in-polygon against the rock's 9-vertex outline (unit radius). */
function inside(index: number, x: number, y: number): boolean {
  const poly = asteroidShape(index).map((m, k) => ({ x: m * Math.cos((k / 9) * TAU), y: m * Math.sin((k / 9) * TAU) }));
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
const length = (line: { x: number; y: number }[]): number => line.slice(1).reduce((t, p, i) => t + Math.hypot(p.x - line[i]!.x, p.y - line[i]!.y), 0);

describe('crack paths (spec §7.3)', () => {
  it('outlineRadius meets the vertices exactly and, between two, the edge joining them', () => {
    const shape = asteroidShape(7);
    for (let k = 0; k < 9; k++) expect(outlineRadius(shape, (k / 9) * TAU)).toBeCloseTo(shape[k]!, 12);
    const mid = outlineRadius(shape, (0.5 / 9) * TAU);
    expect(mid).toBeLessThanOrEqual(Math.max(shape[0]!, shape[1]!));
    expect(mid).toBeGreaterThan(Math.min(shape[0]!, shape[1]!) * Math.cos(Math.PI / 9) - 1e-12);
  });
  it('8 points along every segment lie strictly inside the outline for indices 0 to 500 at wear 0.25, 0.5, 0.75 and 1', () => {
    const outside: string[] = [];
    for (let index = 0; index <= 500; index++) for (const wear of [0.25, 0.5, 0.75, 1]) for (const line of crackPaths(index, wear))
      for (let s = 0; s + 1 < line.length; s++) for (let j = 0; j < 8; j++) {
        const t = j / 7, x = line[s]!.x + (line[s + 1]!.x - line[s]!.x) * t, y = line[s]!.y + (line[s + 1]!.y - line[s]!.y) * t;
        if (!inside(index, x, y)) outside.push(`${index}@${wear}`);
      }
    expect(outside).toEqual([]);
  });
  it('wear shows ceil(wear · 4) cracks cut to (0.35 + 0.45 wear) of their length; higher wear holds lower wear as a prefix', () => {
    expect(crackPaths(3, 0)).toEqual([]);
    for (const index of [0, 11, 250]) {
      let previous = crackPaths(index, 0.01);
      for (const wear of [0.25, 0.4, 0.5, 0.75, 0.9, 1]) {
        const now = crackPaths(index, wear);
        expect(now.length).toBeGreaterThanOrEqual(previous.length);
        previous.forEach((line) => {   // the same crack (or branch) starts at the same fixed point; a cut ends part-way along a
          // segment, so compare every point but the last, and the lengths
          const later = now.find((l) => l[0]!.x === line[0]!.x && l[0]!.y === line[0]!.y)!;
          expect(later).toBeDefined();
          expect(later.length).toBeGreaterThanOrEqual(line.length);
          line.slice(0, -1).forEach((p, j) => { expect(later[j]!.x).toBeCloseTo(p.x, 12); expect(later[j]!.y).toBeCloseTo(p.y, 12); });
          expect(length(later)).toBeGreaterThanOrEqual(length(line) - 1e-12);
        });
        previous = now;
      }
    }
    const one = crackPaths(5, 0.25), full = crackPaths(5, 1);
    expect(one.length).toBe(1);
    expect(length(one[0]!) / length(full[0]!)).toBeCloseTo(0.4625 / 0.8, 9);   // (0.35 + 0.45·0.25) / (0.35 + 0.45·1)
  });
  it('is stable across calls, and cracks 1 and 3 fork once (4 mains and 2 branches at full wear)', () => {
    expect(crackPaths(42, 0.6)).toEqual(crackPaths(42, 0.6));
    expect(crackPaths(42, 1).length).toBe(6);
  });
  it('crackDraw: nothing under CRACK_MIN_PX on screen; otherwise each cut segment and its highlight 0.6 px off perpendicular', () => {
    expect(crackDraw(9, 1, 100, 100, CRACK_MIN_PX - 0.1)).toEqual([]);
    const segs = crackDraw(9, 1, 100, 100, 40), cuts = segs.filter((s) => !s.light), lights = segs.filter((s) => s.light);
    expect(cuts.length).toBe(lights.length);
    expect(cuts.length).toBeGreaterThan(0);
    cuts.forEach((c, i) => {
      const l = lights[i]!, ex = c.x2 - c.x1, ey = c.y2 - c.y1, len = Math.hypot(ex, ey);
      expect(Math.abs(((l.x1 - c.x1) * ex + (l.y1 - c.y1) * ey) / len)).toBeLessThan(1e-9);
      expect(Math.hypot(l.x1 - c.x1, l.y1 - c.y1)).toBeCloseTo(0.6, 9);
    });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/rockCracks.test.ts`
Expected: FAIL (`crackPaths` is not exported).

- [ ] **Step 3: Append the crack model** to the end of `src/renderer/src/render/tactical/tacticalModel.ts`:

```ts
/** Asteroids-iii §7.3 (D10): four fixed cracks per rock, revealed by wear and drawn inside the outline. */
export const CRACK_COUNT = 4, CRACK_INSET = 0.88, CRACK_MIN_PX = 6;
/** A crack polyline in rock-local units (unit radius; multiply by r and add the centre to draw). */
export type CrackLine = Point[];
const CRACK_TAU = Math.PI * 2, CRACK_DEG = Math.PI / 180;
/** §7.3 step 2: the outline's radius along the ray at `angle`: where the ray meets the polygon edge between the two
 *  neighbouring vertices (never one vertex's multiplier). */
export function outlineRadius(shape: readonly number[], angle: number): number {
  const n = shape.length, a = ((angle % CRACK_TAU) + CRACK_TAU) % CRACK_TAU, k = Math.min(n - 1, Math.floor(a / (CRACK_TAU / n))), k1 = (k + 1) % n;
  const a0 = (k * CRACK_TAU) / n, a1 = ((k + 1) * CRACK_TAU) / n;
  const px = shape[k]! * Math.cos(a0), py = shape[k]! * Math.sin(a0), qx = shape[k1]! * Math.cos(a1), qy = shape[k1]! * Math.sin(a1);
  const ex = qx - px, ey = qy - py, dx = Math.cos(a), dy = Math.sin(a);
  return (px * ey - py * ex) / (dx * ey - dy * ex);
}
/** The crack set's own generator (§7.3 step 1: the asteroidShape hash, salt 17), fresh per rock. */
function crackRandom(index: number): () => number {
  let h = ((((index + 1) * 2654435761) >>> 0) ^ 17) >>> 0;
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; return (h % 100000) / 100000; };
}
/** §7.3 step 3: a point pulled back inside CRACK_INSET of the outline along its own ray. */
function clampInside(shape: readonly number[], x: number, y: number): Point {
  const d = Math.hypot(x, y);
  if (d === 0) return { x, y };
  const lim = CRACK_INSET * outlineRadius(shape, Math.atan2(y, x));
  return d > lim ? { x: (x * lim) / d, y: (y * lim) / d } : { x, y };
}
function lineLength(line: CrackLine): number {
  let t = 0;
  for (let i = 1; i < line.length; i++) t += Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y);
  return t;
}
interface FullCrack { main: CrackLine; branch: CrackLine | null; forkAt: number }
const crackCache = new Map<number, FullCrack[]>();
/** §7.3 steps 1–4: crack i starts at a_i = (i + h)·2π/4 at CRACK_INSET of the outline and runs inward as 4 segments of
 *  0.16–0.22, each aimed at the centre ± 35° and clamped inside after the step; cracks 1 and 3 fork once at the end of
 *  segment 2 into a 2-segment branch of 0.12 per segment at ±40° (the second segment turns a further ±15°). */
function fullCracks(index: number): FullCrack[] {
  const cached = crackCache.get(index);
  if (cached) return cached;
  const shape = asteroidShape(index), rnd = crackRandom(index), h = rnd(), out: FullCrack[] = [];
  for (let i = 0; i < CRACK_COUNT; i++) {
    const a = ((i + h) * CRACK_TAU) / CRACK_COUNT, r0 = CRACK_INSET * outlineRadius(shape, a);
    let p: Point = { x: Math.cos(a) * r0, y: Math.sin(a) * r0 }, dir = a + Math.PI, branch: CrackLine | null = null, forkAt = 0;
    const main: CrackLine = [p];
    for (let s = 0; s < 4; s++) {
      const toCentre = Math.hypot(p.x, p.y) > 1e-9 ? Math.atan2(-p.y, -p.x) : dir;
      dir = toCentre + (rnd() * 2 - 1) * 35 * CRACK_DEG;
      const len = 0.16 + 0.06 * rnd();
      p = clampInside(shape, p.x + Math.cos(dir) * len, p.y + Math.sin(dir) * len);
      main.push(p);
      if (s === 1 && (i === 1 || i === 3)) {
        let q = p, bd = dir + (i === 1 ? 40 : -40) * CRACK_DEG;
        forkAt = lineLength(main);
        branch = [q];
        for (let b = 0; b < 2; b++) {
          if (b === 1) bd += (rnd() * 2 - 1) * 15 * CRACK_DEG;
          q = clampInside(shape, q.x + Math.cos(bd) * 0.12, q.y + Math.sin(bd) * 0.12);
          branch.push(q);
        }
      }
    }
    out.push({ main, branch, forkAt });
  }
  crackCache.set(index, out);
  return out;
}
/** The prefix of `line` of arc length `len`. */
function cutLine(line: CrackLine, len: number): CrackLine {
  const out: CrackLine = [line[0]!];
  let left = len;
  for (let i = 1; i < line.length && left > 0; i++) {
    const a = line[i - 1]!, b = line[i]!, seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg <= left) { out.push(b); left -= seg; continue; }
    const t = left / seg;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    left = 0;
  }
  return out;
}
/** §7.3 step 5: wear (0 whole .. 1) shows ceil(wear · 4) of the fixed cracks, each cut to (0.35 + 0.45 · wear) of its
 *  length; a fork's branch shows once the main cut passes the fork, cut to the same share of its own length. Higher wear
 *  always holds lower wear as a prefix. Rock-local units. */
export function crackPaths(index: number, wear: number): CrackLine[] {
  if (!(wear > 0)) return [];
  const w = Math.min(1, wear), n = Math.ceil(w * CRACK_COUNT), share = 0.35 + 0.45 * w, out: CrackLine[] = [], full = fullCracks(index);
  for (let i = 0; i < n; i++) {
    const c = full[i]!, main = share * lineLength(c.main);
    out.push(cutLine(c.main, main));
    if (c.branch && main > c.forkAt) out.push(cutLine(c.branch, share * lineLength(c.branch)));
  }
  return out;
}
/** One crack stroke in screen px: a cut segment, or its highlight (`light`) 0.6 px off along the segment's normal. */
export interface CrackSegDraw { x1: number; y1: number; x2: number; y2: number; light: boolean }
/** §7.3 steps 6–7: the screen strokes of a rock's cracks at centre (cx, cy) and screen radius r: every cut segment, then
 *  every highlight; none when r < CRACK_MIN_PX. */
export function crackDraw(index: number, wear: number, cx: number, cy: number, r: number): CrackSegDraw[] {
  if (r < CRACK_MIN_PX) return [];
  const cuts: CrackSegDraw[] = [], lights: CrackSegDraw[] = [];
  for (const line of crackPaths(index, wear)) for (let i = 1; i < line.length; i++) {
    const x1 = cx + line[i - 1]!.x * r, y1 = cy + line[i - 1]!.y * r, x2 = cx + line[i]!.x * r, y2 = cy + line[i]!.y * r;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len === 0) continue;
    const ox = (-(y2 - y1) / len) * 0.6, oy = ((x2 - x1) / len) * 0.6;
    cuts.push({ x1, y1, x2, y2, light: false });
    lights.push({ x1: x1 + ox, y1: y1 + oy, x2: x2 + ox, y2: y2 + oy, light: true });
  }
  return [...cuts, ...lights];
}
```

- [ ] **Step 4: Draw them.** In `src/renderer/src/render/tactical/tacticalLayer.ts` add `crackDraw` to the import from `./tacticalModel` (line 14). Replace lines 271–279, from `const wear = a.wear ?? 0;   // SPIKE: cracks and a dimmer fill as the rock wears down` through the closing `}` of `for (let k = 0; k < cracks; k++) { ... }`, with:

```ts
        const wear = a.wear ?? 0;   // §7.3: the fill dims at wear ≥ 0.5; the outline keeps CRT.main once worn
        bodies.poly(pts).fill(wear >= 0.5 ? CRT.faint : CRT.dim).stroke({ width: 1, color: wear > 0 ? CRT.main : CRT.mid });
        // §7.3 step 6: cut into the rock: a 1 px CRT.glass line at 0.85, then a 1 px CRT.mid highlight 0.6 px off at 0.5
        for (const s of crackDraw(a.index, wear, a.x, a.y, a.r)) bodies.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).stroke({ width: 1, color: s.light ? CRT.mid : CRT.glass, alpha: s.light ? 0.5 : 0.85 });
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/rockCracks.test.ts tests/tacticalLayer.test.ts tests/crtColours.test.ts tests/rockFx.test.ts && npm run typecheck`
Expected: PASS. (A planning prototype of this algorithm put every sampled point inside the outline for indices 0–500, the smallest margin 0.08 r.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/tactical/tacticalLayer.ts tests/rockCracks.test.ts
git commit -m "feat(asteroids-iii): cracks redrawn inside the outline: fixed per rock, revealed by wear, cut-in style (spec §7.3, D10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rail maths (centre plus offset, tumble), lane zones and the new numbers

**Files:**
- Create: `src/renderer/src/sim/tactical/rails.ts`
- Modify: `src/renderer/src/sim/tactical/rockTuning.ts` (one import line, then append)
- Modify: `src/renderer/src/sim/tactical/tuning.ts` (after `SPAWN_CLEARANCE`, line 35)
- Test: `tests/rockRails.test.ts`

**Interfaces:**
- Consumes: `DT`, `GM`, `GRAVITY_EPS`, `ASTEROID_GAP`, `CLUSTER_RADIUS`, `CLUSTER_R_MAX`, `CLUSTER_CENTRE_MIN`, `CLUSTER_CENTRE_MAX`, `CLUSTER_COUNT`, `BELT_COUNT` (tactical `tuning.ts`); `ROCK_MAX_SPEED` (rockTuning.ts).
- Produces (rails.ts): `export interface RailOut { x: number; y: number; vx: number; vy: number }`; `orbitRate(rho: number): number`; `circularVelocity(x: number, y: number): [number, number]`; `escapeSpeed(rho: number): number`; `seriesStep(theta: number): [number, number]`; `railStep(rhoW: number): [number, number]`; `turnPower(c: number, s: number, n: number): [number, number]`; `SPIN_RATE` (rad/s, 2π / CLUSTER_SPIN_PERIOD); `laneZone(rho: number): number` (lane index or −1); `targetVelocity(x: number, y: number): [number, number]` (§13.2's V*); `railPos(cx: number, cy: number, ox: number, oy: number, t: number, T: number, tumble: boolean, out: RailOut): void`.
- Produces (rockTuning.ts): `ROCK_SWITCHES: { massCube: boolean; softEdge: boolean; clusterTumble: boolean; rocheBreak: boolean }` (all `true`); `ROCK_RAIL_MIN = 150`, `RAIL_OFFSET_MAX = 200`, `ROCK_R_MAX = 60`, `CLUSTER_SPIN_PERIOD = 200`; `REJOIN_MIN_TICKS = 120`, `REJOIN_SPEED = 0.5`, `REJOIN_EDGE_CLEAR = 50`, `REJOIN_PLANET_CLEAR = 80`, `REJOIN_SNAP_FACTOR = 1.5`, `REJOIN_SNAP_MAX = 2`; `SETTLE_K_MAX = 0.06`, `SETTLE_A0 = 20`, `SETTLE_A1 = 60`; `K_EDGE_ROCK = 0.25`, `EDGE_SETTLE_K = 0.3`, `ROCK_EDGE_SLACK = 400`, `ROCK_EDGE_SLACK_SOFT = 700`; `ROCHE_R = 175`, `ROCHE_MIN_AGE = 30`, `TIDAL_KICK_MIN = 0.03`, `TIDAL_KICK_SPAN = 0.05`; `ROCK_MASS_DIVISOR = 30`; `BOUNCE_MIN = 4`, `TOUCH_MIN = 8`, `ROCK_SEPARATE_MAX = 8`, `SEPARATE_SHARE = 0.5`, `SEPARATE_SLOP = 0.5`, `E_LOW = 0.3`, `E_SPAN = 0.5`, `E_RAMP = 26`; `ROCK_GRID_CELL = 96`, `ROCK_GRID_PAD` (14); `RAM_SOFT = 15`; `BURST_8_MIN_R = 40`, `BURST_6_MIN_R = 30`, `BURST_4_MIN_R = 20`, `BURST_OFFSET`, `FAN_OFFSET = 0.6`; `BURST_KICK_MIN = 0.15`, `BURST_KICK_SPAN = 0.25`, `FAN_KICK_MIN = 0.1`, `FAN_KICK_SPAN = 0.15`; `GOLDEN_FRAC = 0.6180339887498949`; `BLAST_PUSH_CAP = 0.5`, `LASER_PUSH_CAP = 0.25`.
- Produces (tuning.ts): `export interface Lane { rho: number; rMin: number; rMax: number; count: number }`, `LANES`, `LANE_ZONE_EDGES = [1092, 1161, 1239, 1308]`, `CLUSTER_RHO_SEPARATION` (420), `CLUSTER_RHO_SLACK` (160).

- [ ] **Step 1: Write the failing test** `tests/rockRails.test.ts`:

```ts
// Asteroids-iii §2, §3.2, §13.1, §13.2, §8.1 (rails): the orbit maths of the rock rails (centre plus offset, the tumble)
// against Math references, the lane zones and V*, and the new numbers.
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/shared/rng';
import { generateMap } from '../src/renderer/src/sim/tactical/map';
import { circularVelocity, escapeSpeed, laneZone, orbitRate, railPos, railStep, SPIN_RATE, targetVelocity, turnPower, type RailOut } from '../src/renderer/src/sim/tactical/rails';
import { ROCK_GRID_PAD, ROCK_SWITCHES } from '../src/renderer/src/sim/tactical/rockTuning';
import { ASTEROID_GAP, BELT_COUNT, CLUSTER_CENTRE_MAX, CLUSTER_CENTRE_MIN, CLUSTER_COUNT, CLUSTER_RHO_SEPARATION, CLUSTER_RHO_SLACK, DT, LANES } from '../src/renderer/src/sim/tactical/tuning';

const out = (): RailOut => ({ x: 0, y: 0, vx: 0, vy: 0 });
const turn = (x: number, y: number, a: number): [number, number] => [Math.cos(a) * x - Math.sin(a) * y, Math.sin(a) * x + Math.cos(a) * y];

describe('the rail maths (spec §2, §3.2, §13.1)', () => {
  it('θ = ω·DT by the series is within 1e-15 of Math at ρ 150; the typical values hold', () => {
    const th = orbitRate(150) * DT, [c, s] = railStep(150);
    expect(Math.abs(c - Math.cos(th))).toBeLessThanOrEqual(1e-15);
    expect(Math.abs(s - Math.sin(th))).toBeLessThanOrEqual(1e-15);
    expect(th).toBeLessThan(0.05);
    expect(orbitRate(1200) * DT).toBeCloseTo(6.338e-4, 6);
    expect(escapeSpeed(1200)).toBeCloseTo(64.545, 2);
    expect(SPIN_RATE).toBeCloseTo((2 * Math.PI) / 200, 15);
  });
  it('turnPower is (c + i s)^n', () => {
    const [c, s] = railStep(1200), th = orbitRate(1200) * DT;
    for (const n of [0, 1, 2, 3, 1000, 4097]) {
      const [pc, ps] = turnPower(c, s, n);
      expect(pc).toBeCloseTo(Math.cos(n * th), 12); expect(ps).toBeCloseTo(Math.sin(n * th), 12);
    }
  });
  it('a lane rail (offset 0) matches a cos/sin reference within 1e-9 u at T = 216,000 and keeps |p| = |centre| within 1e-12', () => {
    for (const rho of [150, 1122, 1200, 1278, 1600, 2000, 2550]) {
      const x = rho * 0.6, y = rho * 0.8, o = out(), [rx, ry] = turn(x, y, 216000 * orbitRate(rho) * DT);
      railPos(x, y, 0, 0, 0, 216000, false, o);
      expect(Math.hypot(o.x - rx, o.y - ry), `ρ ${rho}`).toBeLessThan(1e-9);
      expect(Math.abs(Math.hypot(o.x, o.y) - rho) / rho).toBeLessThan(1e-12);
    }
  });
  it('a Rail turns centre and offset together at ω(|centre|): rigid rotation, velocity ω·perp(p)', () => {
    const o = out(), cx = 1500, cy = -900, ox = 60, oy = 25, rc = Math.hypot(cx, cy), w = orbitRate(rc), a = 50000 * w * DT;
    railPos(cx, cy, ox, oy, 100, 50100, false, o);
    const [px, py] = turn(cx + ox, cy + oy, a);
    expect(Math.hypot(o.x - px, o.y - py)).toBeLessThan(1e-9);
    expect(o.vx).toBeCloseTo(-w * o.y, 9); expect(o.vy).toBeCloseTo(w * o.x, 9);
  });
  it('a Tumble turns its offset by the extra spin: matches a reference, velocity ω·perp(centre) + (ω + ω_spin)·perp(offset)', () => {
    const o = out(), cx = 2000, cy = 300, ox = -80, oy = 40, rc = Math.hypot(cx, cy), w = orbitRate(rc), n = 36000;
    railPos(cx, cy, ox, oy, 0, n, true, o);
    const [Cx, Cy] = turn(cx, cy, n * w * DT), [Ox, Oy] = turn(ox, oy, n * (w + SPIN_RATE) * DT);
    expect(Math.hypot(o.x - (Cx + Ox), o.y - (Cy + Oy))).toBeLessThan(1e-9);
    expect(o.vx).toBeCloseTo(-w * Cy - (w + SPIN_RATE) * Oy, 9);
    expect(o.vy).toBeCloseTo(w * Cx + (w + SPIN_RATE) * Ox, 9);
  });
  it('at T = t the position is centre + offset exactly; before t it throws', () => {
    const o = out();
    railPos(700.125, -999.5, 3.25, -1.5, 40, 40, true, o);
    expect([o.x, o.y]).toEqual([700.125 + 3.25, -999.5 - 1.5]);
    expect(() => railPos(1, 2, 0, 0, 5, 4, false, o)).toThrow(/before/);
  });
  it('prograde matches the ships\' spawn orbits (spawnAt)', () => {
    for (const seed of [1, 7, 42]) for (const s of generateMap(createRng(seed)).spawns) {
      const [vx, vy] = circularVelocity(s.x, s.y);
      expect(vx).toBeCloseTo(s.vx, 9); expect(vy).toBeCloseTo(s.vy, 9);
    }
  });
});

describe('lane zones and V* (spec §13.2)', () => {
  it('splits [1092, 1308] at 1161 and 1239; V* is the lane\'s rigid rotation inside a zone and V_c outside', () => {
    expect([1091, 1092, 1160.9, 1161, 1238.9, 1239, 1308, 1308.1].map(laneZone)).toEqual([-1, 0, 0, 1, 1, 2, 2, -1]);
    const [vx, vy] = targetVelocity(0, 1230), w = orbitRate(1200);
    expect(vx).toBeCloseTo(-w * 1230, 12); expect(vy).toBeCloseTo(0, 12);
    expect(targetVelocity(0, 1700)).toEqual(circularVelocity(0, 1700));
  });
});

describe('the new numbers (spec §3.5, §6.1, §13.7)', () => {
  it('three lanes of 17 + 36 + 17, 78 apart, whose largest cross-lane radius sum plus the gap is at most 75', () => {
    expect(LANES.map((l) => l.rho)).toEqual([1122, 1200, 1278]);
    expect(LANES.reduce((t, l) => t + l.count, 0)).toBe(BELT_COUNT);
    for (let i = 1; i < LANES.length; i++) {
      expect(LANES[i]!.rho - LANES[i - 1]!.rho).toBe(78);
      expect(LANES[i]!.rMax + LANES[i - 1]!.rMax + ASTEROID_GAP).toBeLessThanOrEqual(75);
    }
  });
  it('cluster centres 420 apart fit three in 1550 to 2550 with 160 of slack; the grid pad is 14; every switch defaults on', () => {
    expect(CLUSTER_RHO_SEPARATION).toBe(420);
    expect(CLUSTER_RHO_SLACK).toBe(CLUSTER_CENTRE_MAX - CLUSTER_CENTRE_MIN - (CLUSTER_COUNT - 1) * 420);
    expect(CLUSTER_RHO_SLACK).toBe(160);
    expect(ROCK_GRID_PAD).toBe(14);
    expect(ROCK_SWITCHES).toEqual({ massCube: true, softEdge: true, clusterTumble: true, rocheBreak: true });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/rockRails.test.ts`
Expected: FAIL (cannot resolve `rails`).

- [ ] **Step 3: Add the lane constants to `src/renderer/src/sim/tactical/tuning.ts`** right after the line `export const SPAWN_CLEARANCE = 300;            // no asteroid surface within this of a spawn point`:

```ts
/** Asteroids-iii §3.5: the belt as three lanes (inner, main, outer): each lane's orbital radius, its rock-radius band and
 *  its count (17 + 36 + 17 = BELT_COUNT). Lanes are 78 apart; the largest cross-lane radius sum plus ASTEROID_GAP is 75. */
export interface Lane { rho: number; rMin: number; rMax: number; count: number }
export const LANES: readonly Lane[] = [
  { rho: 1122, rMin: 15, rMax: 20, count: 17 },
  { rho: 1200, rMin: 25, rMax: 45, count: 36 },
  { rho: 1278, rMin: 15, rMax: 20, count: 17 }
];
/** §13.2: the lane zones: [1092, 1161) inner, [1161, 1239) main, [1239, 1308] outer (the part of the belt nearest each lane). */
export const LANE_ZONE_EDGES: readonly number[] = [1092, 1161, 1239, 1308];
/** §3.5: cluster centres' orbital radii differ by at least 2·(CLUSTER_RADIUS + CLUSTER_R_MAX) + ASTEROID_GAP (420), so
 *  clusters never meet each other or the belt; and the slack CLUSTER_CENTRE_MIN..MAX leaves for three of them (160). */
export const CLUSTER_RHO_SEPARATION = 2 * (CLUSTER_RADIUS + CLUSTER_R_MAX) + ASTEROID_GAP;
export const CLUSTER_RHO_SLACK = CLUSTER_CENTRE_MAX - CLUSTER_CENTRE_MIN - (CLUSTER_COUNT - 1) * CLUSTER_RHO_SEPARATION;
```

- [ ] **Step 4: Append the numbers to `src/renderer/src/sim/tactical/rockTuning.ts`.** First add `import { DT } from './tuning';` right after the header comment. Then append:

```ts

// ---- Asteroids-iii (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md, revision 3): every new number ----
/** §13.7: the four switches, all on. Compile-time defaults, never a setting or a UI; plan deviation 19: one object, so the
 *  unit tests and the measure script can run each rule in both states in one process (always restore it). */
export const ROCK_SWITCHES: { massCube: boolean; softEdge: boolean; clusterTumble: boolean; rocheBreak: boolean } = { massCube: true, softEdge: true, clusterTumble: true, rocheBreak: true };
/** §3.1, §13.1: a rail's centre is at least ROCK_RAIL_MIN from the planet and its offset at most RAIL_OFFSET_MAX; a rock's
 *  radius on restore at most ROCK_R_MAX; a Tumble's offset turns once per CLUSTER_SPIN_PERIOD seconds on top of its orbit. */
export const ROCK_RAIL_MIN = 150, RAIL_OFFSET_MAX = 200, ROCK_R_MAX = 60, CLUSTER_SPIN_PERIOD = 200;
/** §3.4, §13.2: rejoining: the clock (ticks), |v − V*| under REJOIN_SPEED (u/s), ρ + r ≤ R_MAP − REJOIN_EDGE_CLEAR,
 *  ρ − r ≥ PLANET_RADIUS + REJOIN_PLANET_CLEAR; a rigid-group snap REJOIN_SNAP_FACTOR · ω · |Δρ| under REJOIN_SNAP_MAX (u/s). */
export const REJOIN_MIN_TICKS = 120, REJOIN_SPEED = 0.5, REJOIN_EDGE_CLEAR = 50, REJOIN_PLANET_CLEAR = 80, REJOIN_SNAP_FACTOR = 1.5, REJOIN_SNAP_MAX = 2;
/** §13.3: the age-ramped settling drag (per second): 0 before SETTLE_A0 s of age, SETTLE_K_MAX from SETTLE_A1 s. */
export const SETTLE_K_MAX = 0.06, SETTLE_A0 = 20, SETTLE_A1 = 60;
/** §13.3 (softEdge): the rocks' edge spring (/s²) and the extra drag toward V_c past R_MAP (/s); the far-edge safety slack
 *  past R_MAP: ROCK_EDGE_SLACK_SOFT with the soft edge, ROCK_EDGE_SLACK without (K_EDGE then, as ships). */
export const K_EDGE_ROCK = 0.25, EDGE_SETTLE_K = 0.3, ROCK_EDGE_SLACK = 400, ROCK_EDGE_SLACK_SOFT = 700;
/** §13.3 (rocheBreak): a free rock inside ROCHE_R with r ≥ FAN_SPLIT_MIN_R and at least ROCHE_MIN_AGE ticks old fan-breaks
 *  ('tidal'), its pieces kicked v_esc · (TIDAL_KICK_MIN + TIDAL_KICK_SPAN · f_j). */
export const ROCHE_R = 175, ROCHE_MIN_AGE = 30, TIDAL_KICK_MIN = 0.03, TIDAL_KICK_SPAN = 0.05;
/** §13.4 (massCube): m = r³ / ROCK_MASS_DIVISOR (r 30 weighs 900, the ship's mass); r² with the switch off. */
export const ROCK_MASS_DIVISOR = 30;
/** §5.4, §13.4: a bounce above BOUNCE_MIN (u/s) closing with e = E_LOW + E_SPAN · clamp((vc − BOUNCE_MIN) / E_RAMP, 0, 1),
 *  else an e = 0 impulse; the touch counter above TOUCH_MIN; each tick a pair corrects SEPARATE_SHARE · max(0, overlap −
 *  SEPARATE_SLOP), each rock moving at most ROCK_SEPARATE_MAX (u). */
export const BOUNCE_MIN = 4, TOUCH_MIN = 8, ROCK_SEPARATE_MAX = 8, SEPARATE_SHARE = 0.5, SEPARATE_SLOP = 0.5, E_LOW = 0.3, E_SPAN = 0.5, E_RAMP = 26;
/** §6.1: the rock grid's cell (u) and its query pad: one tick at the speed cap, the capped separation and 1 (14 u). */
export const ROCK_GRID_CELL = 96;
export const ROCK_GRID_PAD = ROCK_MAX_SPEED * DT + ROCK_SEPARATE_MAX + 1;
/** §6.2: a ship-rock impact (u/s) under this is soft: no hull, no asteroidHits, no grace stamp. */
export const RAM_SOFT = 15;
/** §5.1: the burst's piece counts by parent radius (8 at ≥ 40, 6 at ≥ 30, 4 at ≥ 20, else dust; spike ii's 35 and 25
 *  change on purpose) and birth offsets (× parent r); §5.2: the fan's offset. */
export const BURST_8_MIN_R = 40, BURST_6_MIN_R = 30, BURST_4_MIN_R = 20;
export const BURST_OFFSET: Readonly<Record<4 | 6 | 8, number>> = { 8: 0.85, 6: 0.8, 4: 0.7 };
export const FAN_OFFSET = 0.6;
/** §13.6, §5.2: piece j's kick is v_esc(ρ) · (MIN + SPAN · f_j), f_j the fractional part of j · GOLDEN_FRAC. */
export const BURST_KICK_MIN = 0.15, BURST_KICK_SPAN = 0.25, FAN_KICK_MIN = 0.1, FAN_KICK_SPAN = 0.15;
export const GOLDEN_FRAC = 0.6180339887498949;
/** §5.3: a blast's push on a rock is at most BLAST_PUSH_CAP · v_esc(ρ), a laser's at most LASER_PUSH_CAP · v_esc(ρ). */
export const BLAST_PUSH_CAP = 0.5, LASER_PUSH_CAP = 0.25;
```

(`ROCK_MAX_SPEED` is declared earlier in the file, so `ROCK_GRID_PAD` is 300 · (1/60) + 8 + 1 = 14.)

- [ ] **Step 5: Create `src/renderer/src/sim/tactical/rails.ts`**

```ts
// Asteroids-iii (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md §2, §3.2, §13.1, §13.2): the orbit maths of the
// rock rails, with + − × ÷ and Math.sqrt only (the determinism guard). Softened gravity as physics.ts: q(ρ) = ρ² + ε².
//   orbitRate(ρ)        ω = sqrt(GM / (q·sqrt(q)));      circularVelocity  V_c(p) = ω(|p|)·(−y, x), prograde;
//   escapeSpeed(ρ)      sqrt(2·GM / sqrt(q));            seriesStep(θ)     (cos θ, sin θ) by the §2 series (θ < 0.05);
//   railStep(ρω)        seriesStep(ω(ρω)·DT);            turnPower(c,s,n)  (c + i s)^n by repeated squaring;
//   laneZone, targetVelocity: §13.2's lane zones and the drag and rejoin target V*;
//   railPos: a rail slot (centre and offset at tick t) at tick T: the centre and the offset each turned by P = step^n
//   (a Tumble's offset also by S = spinStep^n) and rescaled to its own length, then added (§13.1).
import { CLUSTER_SPIN_PERIOD } from './rockTuning';
import { DT, GM, GRAVITY_EPS, LANES, LANE_ZONE_EDGES } from './tuning';

const EPS2 = GRAVITY_EPS * GRAVITY_EPS;
/** §13.1: a Tumble's extra spin, rad/s (2π a literal). */
export const SPIN_RATE = (2 * 3.141592653589793) / CLUSTER_SPIN_PERIOD;

/** A position and velocity, written in place (no allocation). */
export interface RailOut { x: number; y: number; vx: number; vy: number }

export function orbitRate(rho: number): number {
  const q = rho * rho + EPS2;
  return Math.sqrt(GM / (q * Math.sqrt(q)));
}
export function circularVelocity(x: number, y: number): [number, number] {
  const q = x * x + y * y + EPS2, w = Math.sqrt(GM / (q * Math.sqrt(q)));
  return [-w * y, w * x];
}
export function escapeSpeed(rho: number): number {
  return Math.sqrt((2 * GM) / Math.sqrt(rho * rho + EPS2));
}
export function seriesStep(th: number): [number, number] {
  const t2 = th * th, t4 = t2 * t2, t6 = t4 * t2, t8 = t4 * t4;
  return [1 - t2 / 2 + t4 / 24 - t6 / 720 + t8 / 40320, th * (1 - t2 / 6 + t4 / 120 - t6 / 5040 + t8 / 362880)];
}
export function railStep(rhoW: number): [number, number] { return seriesStep(orbitRate(rhoW) * DT); }
/** (c + i s)^n for a whole n ≥ 0 (a 3-hour game, about 648,000 ticks, takes at most about 39 products). */
export function turnPower(c: number, s: number, n: number): [number, number] {
  let rc = 1, rs = 0, bc = c, bs = s, k = n;
  while (k > 0) {
    if (k % 2 === 1) { const a = rc * bc - rs * bs; rs = rc * bs + rs * bc; rc = a; }
    k = Math.floor(k / 2);
    if (k > 0) { const a = bc * bc - bs * bs; bs = 2 * bc * bs; bc = a; }
  }
  return [rc, rs];
}
/** §13.2: the lane whose zone holds orbital radius ρ (0 inner, 1 main, 2 outer), or −1 outside [1092, 1308]. */
export function laneZone(rho: number): number {
  const e = LANE_ZONE_EDGES;
  if (rho < e[0]! || rho > e[3]!) return -1;
  return rho < e[1]! ? 0 : rho < e[2]! ? 1 : 2;
}
/** §13.2: V* at (x, y): in a lane zone the lane's rigid rotation ω(ρ_lane)·(−y, x), elsewhere V_c(p). */
export function targetVelocity(x: number, y: number): [number, number] {
  const q = x * x + y * y + EPS2, zone = laneZone(Math.sqrt(x * x + y * y));
  const w = zone >= 0 ? orbitRate(LANES[zone]!.rho) : Math.sqrt(GM / (q * Math.sqrt(q)));
  return [-w * y, w * x];
}
/**
 * §13.1: a rail slot at tick T ≥ t. Its centre (cx, cy) and offset (ox, oy) are those at tick t; ρω = |centre|. Both are
 * turned by P = railStep(ρω)^(T − t), a Tumble's offset also by S = seriesStep(SPIN_RATE·DT)^(T − t); each is rescaled to
 * its own stored length (an offset of 0 is skipped), and p = centre_T + offset_T. Velocity: a Rail ω·perp(p); a Tumble
 * ω·perp(centre_T) + (ω + SPIN_RATE)·perp(offset_T), perp(x, y) = (−y, x). At T = t, p is centre + offset exactly.
 * Throws when T < t: a rail is never read before its anchor tick.
 */
export function railPos(cx: number, cy: number, ox: number, oy: number, t: number, T: number, tumble: boolean, out: RailOut): void {
  const n = T - t, rc = Math.sqrt(cx * cx + cy * cy), w = orbitRate(rc);
  if (n < 0) throw new Error(`railPos: tick ${T} is before the rail's anchor tick ${t}`);
  let Cx = cx, Cy = cy, Ox = ox, Oy = oy;
  if (n > 0) {
    const [c, s] = railStep(rc), [pc, ps] = turnPower(c, s, n);
    const wx = pc * cx - ps * cy, wy = ps * cx + pc * cy, m = Math.sqrt(wx * wx + wy * wy);
    Cx = (rc * wx) / m; Cy = (rc * wy) / m;
    if (ox !== 0 || oy !== 0) {
      let qc = pc, qs = ps;
      if (tumble) { const [sc0, ss0] = seriesStep(SPIN_RATE * DT), [sc, ss] = turnPower(sc0, ss0, n); qc = pc * sc - ps * ss; qs = pc * ss + ps * sc; }
      const ro = Math.sqrt(ox * ox + oy * oy), ux = qc * ox - qs * oy, uy = qs * ox + qc * oy, mo = Math.sqrt(ux * ux + uy * uy);
      Ox = (ro * ux) / mo; Oy = (ro * uy) / mo;
    }
  }
  out.x = Cx + Ox; out.y = Cy + Oy;
  if (tumble) { const ws = w + SPIN_RATE; out.vx = -w * Cy - ws * Oy; out.vy = w * Cx + ws * Ox; }
  else { out.vx = -w * out.y; out.vy = w * out.x; }
}
```

(rockTuning.ts imports only `./tuning`, and rails.ts imports both, so there is no cycle.)

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/rockRails.test.ts tests/boundary.test.ts && npm run typecheck`
Expected: PASS; `boundary.test.ts` now lists `rails.ts`. (A planning check measured offset-0 rail errors of 2e-11 to 7e-11 u at T = 216,000.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/rails.ts src/renderer/src/sim/tactical/rockTuning.ts src/renderer/src/sim/tactical/tuning.ts tests/rockRails.test.ts
git commit -m "feat(asteroids-iii): rail maths (centre plus offset, the tumble, series and squaring), lane zones and V*, the revision 3 numbers and switches (spec §2, §3.2, §13)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The pool: Rail, Free and Tumble kinds, stride 8, accessors, memo, step phase, freeing, validation

This task changes how every rock is stored and read, and replaces waking with freeing. Free-rock motion stays spike ii's (Euler with drag) until Task 6, and `rocksNear` scans every slot until Task 7. Every seeded rock becomes a Rail whose centre is its own position and whose offset is 0 (§13.1); Task 5 gives cluster rocks their cluster centre, an offset and the Tumble kind. Mass stays r² until Task 8's switch.

**Files:**
- Modify: `src/renderer/src/sim/tactical/rocks.ts` (whole file, below)
- Modify: `src/renderer/src/sim/tactical/rockContacts.ts` (whole file, below)
- Modify: `src/renderer/src/sim/tactical/rockBreak.ts` (imports, `pushRock`, `wearRock`, `allocate`)
- Modify: `src/renderer/src/sim/tactical/contacts.ts:4-5` (imports), `:59-98` (`shipRock`)
- Modify: `src/renderer/src/sim/tactical/state.ts:163-177` (the rock event and `TacticalState`), `:281-282` (`createTacticalState`)
- Modify: `src/renderer/src/sim/tactical/hash.ts` (counters, `notSnapshotted`, clone, the rock slot rules)
- Modify: `src/renderer/src/sim/tactical/duel.ts` (`beginRockStep`/`endRockStep`)
- Modify: `src/renderer/src/sim/tactical/rockTuning.ts` (delete `ROCK_WAKE_SPEED`)
- Modify: `src/renderer/src/render/tactical/tacticalModel.ts:391` (`RockKind.Moving` → `RockKind.Free`)
- Modify: `scripts/profile-duel-publication.ts:47,51` (kind names)
- Delete: `scripts/spike-asteroids-ii-measure.ts`, `scripts/spike-asteroids-ii-shots.cjs` (spec §11: replaced by the iii scripts)
- Modify tests: `tests/helpers/rockArena.ts` (whole file), `tests/rockPool.test.ts` (whole file), `tests/rockContacts.test.ts`, `tests/rockShips.test.ts`, `tests/rockLaser.test.ts`, `tests/rockBreak.test.ts`, `tests/tacticalDeterminism.test.ts`, `tests/contactScene.test.ts:194`

**Interfaces:**
- Consumes: `railPos`, `RailOut` (rails.ts, Task 3); `ROCK_RAIL_MIN`, `ROCK_R_MAX`, `ROCK_MIN_R`, `ROCK_HP_PER` (rockTuning.ts).
- Produces (rocks.ts): `ROCK_STRIDE = 8`; `RockKind = { Gone: 0, Rail: 1, Free: 2, Tumble: 3 }`; `isRail(kind: number): boolean` (Rail or Tumble); `ROCK_RESERVE = 160`; `rockCapacity`, `rockHp`, `rockHpMax`, `rockMass`, `rockKind`, `rockAlive`, `rockSlots` (as before); `seededRail(map: MapDef, k: number): [number, number, number, number, number]` (kind, centre x, centre y, offset x, offset y); `initRocks(map: MapDef): Float64Array`; `beginRockStep(s: TacticalState): void`; `rocksMoved(s: TacticalState): void`; `endRockStep(s: TacticalState): void`; `inRockStep(s: TacticalState): boolean`; `rockPhase(s: TacticalState): number`; `freeFrame(s: TacticalState): number`; `rockX`, `rockY`, `rockVx`, `rockVy` `(s: TacticalState, k: number): number`; `rockT(s: TacticalState, k: number): number`; `railCentreRadius(s: TacticalState, k: number): number` (|centre|, a rail's ρω); `interface RockView { x; y; vx; vy; r; hp; kind }` and `rockAt(s, k): RockView` (accessor values); `freeRock(s, k): void`; `markTouched(s, k): void`; `restartClock(s, k): void`; `beginRockTick(s): void` (sizes and clears `rockBorn`, `rockDone`, `rockTouched`); `rockBorn(s, k): boolean`; `rocksNearScan(s, x, y, h): number[]`; `rocksNear(s, x, y, h): number[]`; `writeRock(s, k, kind, x, y, vx, vy, r, hp, t = rockPhase(s)): void`; `segmentEntry`, `firstBlocker` (as before). Removed: `wakesAt`, `wakeRock`, `ROCK_WAKE_SPEED`.
- Produces (state.ts): `TacticalState` gains `rockTouched: Uint8Array`, `rockTouches: number`, `rockSlotDust: number`, `rockCapHits: number`; `RockCause` gains `'tidal'` and `'settle'`; the `rock` DuelEvent's `what` gains `'touch'` and `'rejoin'`, and the event gains `burst?: true`, `speed?: number` and `how?: 'lane' | 'group' | 'own'`.
- Produces (tests/helpers/rockArena.ts): `arena(seed?)`, `mover(st, k, x, y, vx, vy, r, hp?, t?)` (a Free rock), `rail(st, k, x, y, r, hp?)` (a Rail with centre (x, y), offset 0, anchored at `st.tick`), `seeded(st, k)` (slot k as `initRocks` makes it), `fillPool`, `rockEvents` (as before).

- [ ] **Step 1: Write the new pool test** — replace `tests/rockPool.test.ts` with:

```ts
// Asteroids-iii (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md §3.1–§3.4) on spike ii's pool: 160 reserve
// slots of 8 values (kind, x, y, vx, vy, r, hp, t), every seeded rock a Rail at t = 0, the accessors and their memo, the
// step phase, freeing, the rock targets, the eight rock counters, the three transient masks and the restore rules.
import { describe, expect, it } from 'vitest';
import { cloneTactical, createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { flattenTactical, hashTactical, shipModule, spaceModule, unflattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { railPos, type RailOut } from '../src/renderer/src/sim/tactical/rails';
import { beginRockStep, beginRockTick, endRockStep, freeFrame, freeRock, rockAlive, rockAt, rockBorn, rockCapacity, rockHp, rockHpMax, RockKind, rockMass, rockPhase, rockSlots, rocksMoved, ROCK_RESERVE, ROCK_STRIDE, rockVx, rockVy, rockX, rockY } from '../src/renderer/src/sim/tactical/rocks';

/** The flat index of a space or ship field (the space module's values come first). */
function fieldIndex(st: TacticalState, name: string): number {
  let index = 0;
  for (const f of [...spaceModule.fields(st), ...shipModule.fields(st)]) { if (f.name === name) return index; index += f.count; }
  throw Error(name);
}
/** Slot k's rail position and velocity at tick T, straight from railPos. */
function railAt(st: TacticalState, k: number, T: number): RailOut {
  const v = st.rocks, b = k * ROCK_STRIDE, o = { x: 0, y: 0, vx: 0, vy: 0 };
  railPos(v[b + 1]!, v[b + 2]!, v[b + 3]!, v[b + 4]!, v[b + 7]!, T, v[b] === RockKind.Tumble, o);
  return o;
}
const slot = (st: TacticalState, k: number): number[] => Array.from(st.rocks.subarray(k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE));

describe('the asteroids-iii rock pool (spec §3.1)', () => {
  it('has 160 reserve slots of 8 values; every seeded rock is a Rail (centre its position, offset 0) at t = 0 with full hp', () => {
    const st = createTacticalState(3);
    expect([ROCK_RESERVE, ROCK_STRIDE]).toEqual([160, 8]);
    expect(rockSlots(st)).toBe(st.map.asteroids.length + 160);
    expect(rockCapacity(st.map)).toBe(rockSlots(st));
    st.map.asteroids.forEach((a, k) => {
      const v = slot(st, k);
      expect(v).toEqual([RockKind.Rail, a.x, a.y, 0, 0, a.r, rockHp(a.r), 0]);   // Task 5 turns cluster rocks into centre + offset
      const at = rockAt(st, k);   // tick 0: where the map put it (centre + offset, so to the last few bits for a cluster rock)
      expect([at.r, at.hp]).toEqual([a.r, rockHp(a.r)]); expect(at.x).toBeCloseTo(a.x, 9); expect(at.y).toBeCloseTo(a.y, 9);
      expect(rockHpMax(a.r)).toBe(Math.ceil(a.r / 10));
    });
    for (let k = st.map.asteroids.length; k < rockSlots(st); k++) expect(rockAlive(st, k)).toBe(false);
    expect([rockHp(15), rockHp(55), rockMass(30)]).toEqual([2, 6, 900]);
  });
  it('reads a Rail through railPos at the phase tick, and its slot never changes while it turns', () => {
    const st = createTacticalState(3), before = slot(st, 0);
    for (let t = 0; t < 120; t++) stepDuel(st, IDLE_INPUT);
    expect(slot(st, 0)).toEqual(before);
    const p = railAt(st, 0, st.tick);
    expect([rockX(st, 0), rockY(st, 0), rockVx(st, 0), rockVy(st, 0)]).toEqual([p.x, p.y, p.vx, p.vy]);
    expect(rockX(st, 0)).not.toBe(before[1]);   // it moved along its rail
    beginRockStep(st);
    const q = railAt(st, 0, st.tick + 1);
    expect([rockPhase(st), rockX(st, 0), rockY(st, 0)]).toEqual([st.tick + 1, q.x, q.y]);   // §3.3: inside a step, tick + 1
    endRockStep(st);
    expect(rockPhase(st)).toBe(st.tick);
  });
  it('keys the memo by every input: a changed anchor or tick is recomputed; a clone and an in-place restore read the same', () => {
    const st = createTacticalState(3);
    for (let t = 0; t < 30; t++) stepDuel(st, IDLE_INPUT);
    const x0 = rockX(st, 0), anchor = st.rocks[1]!;
    st.rocks[1] = anchor + 5;
    expect(rockX(st, 0)).toBe(railAt(st, 0, st.tick).x);
    expect(rockX(st, 0)).not.toBe(x0);
    st.rocks[1] = anchor;
    expect(rockX(st, 0)).toBe(x0);
    st.tick++;
    expect(rockX(st, 0)).toBe(railAt(st, 0, st.tick).x);
    st.tick--;
    const c = cloneTactical(st);
    expect([rockX(c, 0), rockY(c, 0), rockVx(c, 0), rockVy(c, 0)]).toEqual([rockX(st, 0), rockY(st, 0), rockVx(st, 0), rockVy(st, 0)]);
    const fresh = createTacticalState(3);
    rockX(fresh, 0);                                    // a memo entry at tick 0 ...
    unflattenTactical(fresh, flattenTactical(st));      // ... then an in-place restore to tick 30
    expect([rockX(fresh, 0), rockY(fresh, 0)]).toEqual([rockX(st, 0), rockY(st, 0)]);
  });
  it('freeRock writes the free frame\'s rail position and velocity, t = the phase tick, and marks it touched; Free or Gone is left alone', () => {
    const st = createTacticalState(3);
    for (let t = 0; t < 10; t++) stepDuel(st, IDLE_INPUT);
    const p = railAt(st, 0, st.tick), a = st.map.asteroids[0]!;
    freeRock(st, 0);
    expect(slot(st, 0)).toEqual([RockKind.Free, p.x, p.y, p.vx, p.vy, a.r, rockHp(a.r), st.tick]);
    expect(st.rockTouched[0]).toBe(1);
    const again = slot(st, 0);
    freeRock(st, 0);
    expect(slot(st, 0)).toEqual(again);
    const empty = st.map.asteroids.length;
    freeRock(st, empty);
    expect(rockAlive(st, empty)).toBe(false);
  });
  it('inside a step a rail is freed at tick T before the motion pass and at T + 1 after it, its clock T + 1 either way', () => {
    const st = createTacticalState(3), T = st.tick;
    beginRockStep(st);
    expect(freeFrame(st)).toBe(T);
    const p0 = railAt(st, 0, T);
    freeRock(st, 0);
    expect(slot(st, 0).slice(1, 5)).toEqual([p0.x, p0.y, p0.vx, p0.vy]);
    expect(slot(st, 0)[7]).toBe(T + 1);
    rocksMoved(st);
    expect(freeFrame(st)).toBe(T + 1);
    const p1 = railAt(st, 1, T + 1);
    freeRock(st, 1);
    expect(slot(st, 1).slice(1, 5)).toEqual([p1.x, p1.y, p1.vx, p1.vy]);
    endRockStep(st);
    expect(freeFrame(st)).toBe(T);
  });
});

describe('the rock targets, the tally and the counters (spec §6.1, §8; asteroids-iii §5.4, §5.5)', () => {
  it('every ship system has a laser and torpedo rock target and a break tally; the space module closes with nine counters', () => {
    const st = createTacticalState(3), s = st.systems[0];
    expect([s.laserRock, s.torpRock, s.torpRockFlying, s.rocksBroken]).toEqual([-1, -1, -1, 0]);
    expect([st.rockHits, st.rockSplits, st.rockDust, st.rockBlasts, st.rockCollisions, st.rockEvictions, st.rockTouches, st.rockSlotDust, st.rockCapHits]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const ship = shipModule.fields(st).map((f) => f.name);
    for (const f of ['laserRock', 'torpRock', 'torpRockFlying', 'rocksBroken']) expect(ship).toContain(`systems.0.${f}`);
    expect(spaceModule.fields(st).map((f) => f.name).slice(-10)).toEqual(['rocks', 'rockHits', 'rockSplits', 'rockDust', 'rockBlasts', 'rockCollisions', 'rockEvictions', 'rockTouches', 'rockSlotDust', 'rockCapHits']);
    const three = createTacticalState(3, 3), off = three.systems[2];
    expect([off.laserRock, off.torpRock, off.torpRockFlying, off.rocksBroken]).toEqual([0, 0, 0, 0]);
    expect(() => validateTacticalValues(three, flattenTactical(three))).not.toThrow();
  });
  it('validation bounds the rock targets to the pool (torpRockFlying also −2) and the counters to whole counts', () => {
    const st = createTacticalState(3), base = Array.from(flattenTactical(st)), cap = rockSlots(st);
    const cases: [string, number][] = [['systems.0.laserRock', cap], ['systems.0.laserRock', -2], ['systems.0.torpRock', cap], ['systems.0.torpRockFlying', -3],
      ['systems.0.torpRockFlying', cap], ['systems.0.rocksBroken', -1], ['rockDust', -1], ['rockEvictions', 0.5], ['rockTouches', -1], ['rockSlotDust', 0.5], ['rockCapHits', -1]];
    for (const [name, value] of cases) {
      const bad = [...base]; bad[fieldIndex(st, name)] = value;
      expect(() => validateTacticalValues(st, bad), `${name} ${value}`).toThrow(new RegExp(name.replace(/\./g, '\\.')));
    }
    const ok = [...base]; ok[fieldIndex(st, 'systems.0.laserRock')] = cap - 1; ok[fieldIndex(st, 'systems.0.torpRockFlying')] = -2;
    expect(() => validateTacticalValues(st, ok)).not.toThrow();
  });
  it('restore validation of each slot (spec §3.1, §13.1): kind 0..3, a gone slot all zeros, t a whole tick in 0..tick, r in [8, 60], hp > 0, a rail with |centre| ≥ 150 and |offset| ≤ 200', () => {
    const st = createTacticalState(3), base = Array.from(flattenTactical(st)), rocks = fieldIndex(st, 'rocks'), tick = fieldIndex(st, 'tick'), gone = st.map.asteroids.length;
    const bad = (k: number, j: number, value: number, why: RegExp, tickValue = 0): void => {
      const v = [...base]; v[tick] = tickValue; v[rocks + k * ROCK_STRIDE + j] = value;
      expect(() => validateTacticalValues(st, v), `slot ${k} value ${j} = ${value}`).toThrow(why);
    };
    bad(0, 0, 4, /kind/); bad(gone, 1, 5, /gone slot/); bad(0, 7, 1, /whole tick/); bad(0, 7, 0.5, /whole tick/, 10);
    bad(0, 5, 7.9, /r out of range/); bad(0, 5, 60.1, /r out of range/); bad(0, 6, 0, /hp/); bad(0, 3, 201, /RAIL_OFFSET_MAX/);
    const near = [...base]; near[rocks + 1] = 100; near[rocks + 2] = 0;
    expect(() => validateTacticalValues(st, near)).toThrow(/ROCK_RAIL_MIN/);
    const ok = [...base]; ok[tick] = 10; ok[rocks] = RockKind.Free; ok[rocks + 4] = 3; ok[rocks + 7] = 10;
    expect(() => validateTacticalValues(st, ok)).not.toThrow();
    const tumble = [...base]; tumble[rocks] = RockKind.Tumble; tumble[rocks + 3] = 120; tumble[rocks + 4] = -90;   // |offset| 150
    expect(() => validateTacticalValues(st, tumble)).not.toThrow();
  });
});

describe('the transient masks (spec §3.1, §3.3, §3.4)', () => {
  it('are not hashed, are fresh in a clone, and are cleared at the start and the end of every tick', () => {
    const st = createTacticalState(3), before = hashTactical(st);
    st.rockBorn[4] = 1; st.rockDone[5] = 1; st.rockTouched[6] = 1;
    expect(hashTactical(st)).toBe(before);
    for (const m of ['rockBorn', 'rockDone', 'rockTouched']) expect(spaceModule.notSnapshotted).toHaveProperty(m);
    const c = cloneTactical(st);
    expect(c.rockTouched).not.toBe(st.rockTouched);
    expect([c.rockBorn[4], c.rockDone[5], c.rockTouched[6]]).toEqual([0, 0, 0]);
    expect(rockBorn(st, 4)).toBe(true);
    stepDuel(st, IDLE_INPUT);
    expect([st.rockBorn[4], st.rockDone[5], st.rockTouched[6]]).toEqual([0, 0, 0]);
    st.rockBorn[4] = 1; st.rockTouched[6] = 1; beginRockTick(st);
    expect([rockBorn(st, 4), st.rockTouched[6]]).toEqual([false, 0]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/rockPool.test.ts`
Expected: FAIL (`beginRockStep`, `freeRock`, `rockX` and friends are not exported; `ROCK_RESERVE` is 96).

- [ ] **Step 3: Replace `src/renderer/src/sim/tactical/rocks.ts`** with:

```ts
// Asteroids-iii (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md §3), on spike ii's pool: `state.rocks` is a
// fixed-capacity pool, ROCK_STRIDE values per slot: kind (0 gone, 1 rail, 2 free, 3 tumble), x, y, vx, vy, r, hp, t.
// A rail slot (Rail or Tumble, §13.1) holds its centre (x, y) and its offset (vx, vy) at tick t, and its ρω is |centre|.
// It turns on its rail, worked out from the tick by railPos (rails.ts): a Rail rigidly, a Tumble with its offset spinning
// too, so nothing in the slot changes while it stays there. A Free slot's x, y, vx, vy are live and t is
// the tick it was last born, freed or pushed. Slots 0 .. n − 1 start as the seeded map's asteroids, all Rail at t = 0;
// the ROCK_RESERVE slots after them start empty. `isRail` is true for both rail kinds.
// Readers of a rock's position or velocity use rockX / rockY / rockVx / rockVy / rockAt: a Free slot is read as it stands,
// a rail through railPos at the phase tick, memoised per state object in a WeakMap keyed by every input (kind, centre,
// offset, t and the phase tick), so a stale entry is never returned and the memo is never hashed, snapshotted or copied by a clone.
// The phase (§3.3): during stepDuel (beginRockStep .. endRockStep, a step context in a WeakMap, not state) rails are read
// at tick + 1, because every contact that tick happens after the free rocks move to T + 1; between ticks at tick.
// Freeing (§3.4): a Rail becomes Free at its rail position and velocity in the free frame (T before this step's free
// motion, T + 1 after it; plan deviation 2), with t = the phase tick.
// Per-tick transient masks (§3.1, §3.3, §3.4; not hashed, cleared at the start and the end of every stepDuel tick):
// rockBorn (a new piece this tick), rockDone (had its contact turn), rockTouched (freed, pushed, hit or in a contact).
// Breaking is rockBreak.ts, motion and rock-rock contacts rockContacts.ts, every number rockTuning.ts.
import type { MapDef } from './map';
import { railPos, type RailOut } from './rails';
import { ROCK_HP_PER } from './rockTuning';
import type { TacticalState } from './state';
export type { RockCause } from './state';

export const ROCK_STRIDE = 8;
export const RockKind = { Gone: 0, Rail: 1, Free: 2, Tumble: 3 } as const;
/** §13.1: a rail slot of either kind (a Rail turns rigidly, a Tumble spins its offset too). */
export function isRail(kind: number): boolean { return kind === RockKind.Rail || kind === RockKind.Tumble; }
/** §3.1: spare slots for pieces. */
export const ROCK_RESERVE = 160;

/** The pool's capacity for a map: its asteroids plus the reserve. Also the number of rock bodies in a ship's graceUntil. */
export function rockCapacity(map: MapDef): number { return map.asteroids.length + ROCK_RESERVE; }
/** Spike ii §3.1: the hp a rock of radius r is born with. */
export function rockHp(r: number): number { return Math.ceil(r / ROCK_HP_PER); }
/** Spike ii §3.1: the cracks read hp / hpMax, with hpMax recomputed from r. */
export const rockHpMax = rockHp;
/** Spike ii §3.1: a rock's mass, r² (no unit). */
export function rockMass(r: number): number { return r * r; }

/** §13.1: seeded asteroid k's rail: kind, centre and offset (a lane rock: its own position, offset 0). */
export function seededRail(map: MapDef, k: number): [number, number, number, number, number] {
  const a = map.asteroids[k]!;
  return [RockKind.Rail, a.x, a.y, 0, 0];
}
/** §3.5, §13.1: every seeded rock a rail at t = 0 where the map put it; the reserve empty. */
export function initRocks(map: MapDef): Float64Array {
  const out = new Float64Array(rockCapacity(map) * ROCK_STRIDE);
  map.asteroids.forEach((a, k) => { const [kind, cx, cy, ox, oy] = seededRail(map, k); out.set([kind, cx, cy, ox, oy, a.r, rockHp(a.r), 0], k * ROCK_STRIDE); });
  return out;
}

export const rockKind = (s: TacticalState, k: number): number => s.rocks[k * ROCK_STRIDE]!;
export const rockAlive = (s: TacticalState, k: number): boolean => s.rocks[k * ROCK_STRIDE]! !== RockKind.Gone;
export function rockSlots(s: TacticalState): number { return s.rocks.length / ROCK_STRIDE; }

// ---- §3.3: the step context and the phase ----
interface RockStep { moved: boolean }
const steps = new WeakMap<TacticalState, RockStep>();
/** The start of a stepDuel tick: rails are read at tick + 1 until endRockStep. */
export function beginRockStep(s: TacticalState): void { steps.set(s, { moved: false }); }
/** stepRocks' motion pass is over: Free slots now stand at tick + 1 (plan deviation 2). */
export function rocksMoved(s: TacticalState): void { const c = steps.get(s); if (c) c.moved = true; }
/** The end of a stepDuel tick (before tick++). */
export function endRockStep(s: TacticalState): void { steps.delete(s); }
export function inRockStep(s: TacticalState): boolean { return steps.has(s); }
/** §3.3: the tick rails are read at: tick + 1 inside a step, tick between ticks. */
export function rockPhase(s: TacticalState): number { return steps.has(s) ? s.tick + 1 : s.tick; }
/** Plan deviation 2: the tick a Free slot stands at now: tick before this step's free motion, tick + 1 after it, tick
 *  between ticks. A rail freed now is written at this tick's rail position. */
export function freeFrame(s: TacticalState): number { const c = steps.get(s); return c && !c.moved ? s.tick : rockPhase(s); }

// ---- §3.3: the accessors and the rail memo ----
interface RailMemo { inputs: Float64Array; outputs: Float64Array }
const memos = new WeakMap<TacticalState, RailMemo>();
const scratch: RailOut = { x: 0, y: 0, vx: 0, vy: 0 };
const MEMO_IN = 7;
/** The memo's outputs for rail slot k at the phase tick, recomputed unless every input (kind, centre, offset, t, the
 *  phase tick) matches exactly (Object.is, so −0 and 0 differ). Outputs per slot: x, y, vx, vy at k · 4. */
function railOutputs(s: TacticalState, k: number): Float64Array {
  const n = rockSlots(s);
  let m = memos.get(s);
  if (!m || m.outputs.length !== n * 4) { m = { inputs: new Float64Array(n * MEMO_IN).fill(NaN), outputs: new Float64Array(n * 4) }; memos.set(s, m); }
  const v = s.rocks, b = k * ROCK_STRIDE, i = k * MEMO_IN, inp = m.inputs, T = rockPhase(s);
  const kind = v[b]!, cx = v[b + 1]!, cy = v[b + 2]!, ox = v[b + 3]!, oy = v[b + 4]!, t = v[b + 7]!;
  if (!Object.is(inp[i], kind) || !Object.is(inp[i + 1], cx) || !Object.is(inp[i + 2], cy) || !Object.is(inp[i + 3], ox) || !Object.is(inp[i + 4], oy) || !Object.is(inp[i + 5], t) || !Object.is(inp[i + 6], T)) {
    railPos(cx, cy, ox, oy, t, T, kind === RockKind.Tumble, scratch);
    inp[i] = kind; inp[i + 1] = cx; inp[i + 2] = cy; inp[i + 3] = ox; inp[i + 4] = oy; inp[i + 5] = t; inp[i + 6] = T;
    const o = m.outputs, j = k * 4;
    o[j] = scratch.x; o[j + 1] = scratch.y; o[j + 2] = scratch.vx; o[j + 3] = scratch.vy;
  }
  return m.outputs;
}
export function rockX(s: TacticalState, k: number): number { const b = k * ROCK_STRIDE; return isRail(s.rocks[b]!) ? railOutputs(s, k)[k * 4]! : s.rocks[b + 1]!; }
export function rockY(s: TacticalState, k: number): number { const b = k * ROCK_STRIDE; return isRail(s.rocks[b]!) ? railOutputs(s, k)[k * 4 + 1]! : s.rocks[b + 2]!; }
export function rockVx(s: TacticalState, k: number): number { const b = k * ROCK_STRIDE; return isRail(s.rocks[b]!) ? railOutputs(s, k)[k * 4 + 2]! : s.rocks[b + 3]!; }
export function rockVy(s: TacticalState, k: number): number { const b = k * ROCK_STRIDE; return isRail(s.rocks[b]!) ? railOutputs(s, k)[k * 4 + 3]! : s.rocks[b + 4]!; }
/** Slot k's clock: a rail's anchor tick, a Free rock's last birth, freeing or push. */
export function rockT(s: TacticalState, k: number): number { return s.rocks[k * ROCK_STRIDE + 7]!; }
/** §13.1: a rail's ρω, |centre| (constant while it turns). */
export function railCentreRadius(s: TacticalState, k: number): number { const b = k * ROCK_STRIDE, x = s.rocks[b + 1]!, y = s.rocks[b + 2]!; return Math.sqrt(x * x + y * y); }
export interface RockView { x: number; y: number; vx: number; vy: number; r: number; hp: number; kind: number }
/** Slot k as the accessors read it now. */
export function rockAt(s: TacticalState, k: number): RockView {
  const v = s.rocks, b = k * ROCK_STRIDE;
  if (isRail(v[b]!)) { const o = railOutputs(s, k), j = k * 4; return { kind: v[b]!, x: o[j]!, y: o[j + 1]!, vx: o[j + 2]!, vy: o[j + 3]!, r: v[b + 5]!, hp: v[b + 6]! }; }
  return { kind: v[b]!, x: v[b + 1]!, y: v[b + 2]!, vx: v[b + 3]!, vy: v[b + 4]!, r: v[b + 5]!, hp: v[b + 6]! };
}

// ---- §3.4: freeing, the clock and the touched mask ----
/** §3.4: rock k is touched this tick (freed, pushed, hit or in a contact): it cannot rejoin a rail this tick. */
export function markTouched(s: TacticalState, k: number): void { s.rockTouched[k] = 1; }
/** §3.4: a push restarts a Free rock's clock: t = the phase tick. */
export function restartClock(s: TacticalState, k: number): void { if (s.rocks[k * ROCK_STRIDE] === RockKind.Free) s.rocks[k * ROCK_STRIDE + 7] = rockPhase(s); }
/** §3.4, §13.1: a rail (Rail or Tumble) becomes Free at its rail position and velocity in the free frame, t = the phase
 *  tick, touched. Any other kind is left alone. */
export function freeRock(s: TacticalState, k: number): void {
  const v = s.rocks, b = k * ROCK_STRIDE;
  if (!isRail(v[b]!)) return;
  railPos(v[b + 1]!, v[b + 2]!, v[b + 3]!, v[b + 4]!, v[b + 7]!, freeFrame(s), v[b] === RockKind.Tumble, scratch);
  v[b] = RockKind.Free; v[b + 1] = scratch.x; v[b + 2] = scratch.y; v[b + 3] = scratch.vx; v[b + 4] = scratch.vy; v[b + 7] = rockPhase(s);
  markTouched(s, k);
}

/** §3.1, §3.3, §3.4: the start (and the end) of a tick: the three transient masks cleared (made again at the pool's size
 *  if it changed). */
export function beginRockTick(s: TacticalState): void {
  const n = rockSlots(s);
  if (s.rockBorn.length !== n || s.rockDone.length !== n || s.rockTouched.length !== n) { s.rockBorn = new Uint8Array(n); s.rockDone = new Uint8Array(n); s.rockTouched = new Uint8Array(n); return; }
  s.rockBorn.fill(0); s.rockDone.fill(0); s.rockTouched.fill(0);
}
/** Spike ii §3.1: whether slot k was written with a new piece this tick. */
export function rockBorn(s: TacticalState, k: number): boolean { return s.rockBorn[k] === 1; }

/** Slots of every live rock whose bounding box (at its accessor position) may overlap the square around (x, y) of
 *  half-size h, ascending, no repeats: a scan of every slot (§6.1: the readers outside a step). */
export function rocksNearScan(s: TacticalState, x: number, y: number, h: number): number[] {
  const v = s.rocks, out: number[] = [];
  for (let k = 0, n = rockSlots(s); k < n; k++) {
    const b = k * ROCK_STRIDE;
    if (v[b] === RockKind.Gone) continue;
    const r = v[b + 5]!;
    if (Math.abs(rockX(s, k) - x) <= h + r && Math.abs(rockY(s, k) - y) <= h + r) out.push(k);
  }
  return out;
}
/** The broad phase every caller uses: ascending, no repeats (Task 7 gives the step its grid). */
export function rocksNear(s: TacticalState, x: number, y: number, h: number): number[] { return rocksNearScan(s, x, y, h); }

/** Write slot k's eight values (a rail: its centre in x, y and its offset in vx, vy); t defaults to the phase tick. */
export function writeRock(s: TacticalState, k: number, kind: number, x: number, y: number, vx: number, vy: number, r: number, hp: number, t: number = rockPhase(s)): void {
  s.rocks.set([kind, x, y, vx, vy, r, hp, t], k * ROCK_STRIDE);
}

/** Where the segment a → b first enters circle (cx, cy, r), as t in [0, 1], or −1 when it never does. Starting inside is 0. */
export function segmentEntry(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): number {
  const ex = bx - ax, ey = by - ay, fx = ax - cx, fy = ay - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c < 0) return 0;
  const a = ex * ex + ey * ey;
  if (a === 0) return -1;
  const bb = fx * ex + fy * ey, disc = bb * bb - a * c;
  if (disc < 0 || bb > 0) return -1;
  const t = (-bb - Math.sqrt(disc)) / a;
  return t <= 1 ? t : -1;
}

/** The first solid body along a → b: the planet (−1), a rock slot (≥ 0), or null; with the entry t. */
export function firstBlocker(s: TacticalState, ax: number, ay: number, bx: number, by: number): { rock: number; t: number } | null {
  let best: { rock: number; t: number } | null = null;
  const p = s.map.planet, tp = segmentEntry(ax, ay, bx, by, p.x, p.y, p.r);
  if (tp >= 0) best = { rock: -1, t: tp };
  const half = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / 2;
  for (const k of rocksNear(s, (ax + bx) / 2, (ay + by) / 2, half)) {
    if (s.rockBorn[k] === 1) continue;   // spike ii §6.2: a piece made earlier this tick is not in the way
    const a = rockAt(s, k), t = segmentEntry(ax, ay, bx, by, a.x, a.y, a.r);
    if (t >= 0 && (!best || t < best.t)) best = { rock: k, t };   // ascending k: a tie keeps the lower slot (the planet wins ties)
  }
  return best;
}
```

Delete `export const ROCK_WAKE_SPEED = 40;` and its doc comment from `rockTuning.ts`.

- [ ] **Step 4: Replace `src/renderer/src/sim/tactical/rockContacts.ts`** with this version (spike ii's motion kept; Rail rocks freed first; Task 6 replaces the motion):

```ts
// Spike ii §3.2, §3.3 (docs/superpowers/specs/2026-11-18-asteroids-ii-design.md), asteroids-iii §3.4, §5.4: the free rocks'
// turn in stepDuel, after the missiles fly and before the ship contacts.
// Part 1, motion: every Free rock not born this tick, ascending (spike ii's gravity, drag, cap and semi-implicit Euler
// until asteroids-iii Task 6). Then rocksMoved: free rocks now stand at tick + 1.
// Part 2, contacts, a live outer loop: slot a from 0 upward, reading kinds as they stand now, takes a turn when it is
// Free and not born. Its turn: the planet and edge test (dust, turn over); else rocksNear(a) once, ascending, and each
// b ≠ a still alive, not born and not done is resolved if it touches (a Rail b at its accessor position); a break of a
// ends its turn. Then a is marked done (rockDone). A Rail never takes a turn, so a free-rail pair is always checked by
// the free rock, and rail-rail pairs never are.
import { gravityAccel } from './physics';
import { breakRock, crushDamage, dustRock, wearRock } from './rockBreak';
import { freeRock, markTouched, rockAlive, rockMass, RockKind, rocksMoved, rocksNear, rockSlots, ROCK_STRIDE, rockX, rockY } from './rocks';
import { ROCK_CRUSH_SPEED, ROCK_DRAG, ROCK_GRAVITY, ROCK_MAX_SPEED, ROCK_RESTITUTION } from './rockTuning';
import type { TacticalState } from './state';
import { DT, R_MAP } from './tuning';

function touching(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx, dy = ay - by, rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

/**
 * Spike ii §3.3, asteroids-iii §5.4: rock a and rock b touch. A Rail is freed first (at its rail position and velocity),
 * so every pair is two bodies; both are touched. Normal n from b to a (zero distance: north), closing speed
 * vc = (vb − va) · n. Separate by the overlap, shared by inverse mass. Bounce when vc > 0: j = (1 + e) vc / (1/ma + 1/mb).
 * Above ROCK_CRUSH_SPEED: rockCollisions + 1, a bump event, both amounts applied (a then b), then breaks (a along n, b
 * along −n, each with its post-bounce velocity), neither able to evict a or b.
 */
export function resolveRockPair(s: TacticalState, a: number, b: number): void {
  freeRock(s, a); freeRock(s, b);
  markTouched(s, a); markTouched(s, b);
  const v = s.rocks, A = a * ROCK_STRIDE, B = b * ROCK_STRIDE;
  const dx = v[A + 1]! - v[B + 1]!, dy = v[A + 2]! - v[B + 2]!, d = Math.sqrt(dx * dx + dy * dy);
  const nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1;
  const vc = (v[B + 3]! - v[A + 3]!) * nx + (v[B + 4]! - v[A + 4]!) * ny;
  const ra = v[A + 5]!, rb = v[B + 5]!, ma = rockMass(ra), mb = rockMass(rb), ia = 1 / ma, ib = 1 / mb, overlap = ra + rb - d;
  if (overlap > 0) {
    const sa = (overlap * ia) / (ia + ib), sb = (overlap * ib) / (ia + ib);
    v[A + 1]! += nx * sa; v[A + 2]! += ny * sa; v[B + 1]! -= nx * sb; v[B + 2]! -= ny * sb;
  }
  if (vc > 0) {
    const j = ((1 + ROCK_RESTITUTION) * vc) / (ia + ib);
    v[A + 3]! += nx * j * ia; v[A + 4]! += ny * j * ia; v[B + 3]! -= nx * j * ib; v[B + 4]! -= ny * j * ib;
  }
  if (vc <= ROCK_CRUSH_SPEED) return;
  const da = crushDamage(vc, ma, mb), db = crushDamage(vc, mb, ma);
  const aBreaks = wearRock(s, a, da), bBreaks = wearRock(s, b, db);
  s.rockCollisions++;
  s.events.push({ kind: 'rock', what: 'bump', by: 'collision', rock: a, other: b, x: v[A + 1]! - nx * ra, y: v[A + 2]! - ny * ra, r: ra, vx: v[A + 3]!, vy: v[A + 4]! });
  if (aBreaks) breakRock(s, a, nx, ny, 'collision', -1, 'fan', [a, b]);
  if (bBreaks) breakRock(s, b, -nx, -ny, 'collision', -1, 'fan', [a, b]);
}

export function stepRocks(s: TacticalState): void {
  const v = s.rocks, n = rockSlots(s), keep = 1 - ROCK_DRAG * DT;
  for (let k = 0; k < n; k++) {   // part 1: motion
    const b = k * ROCK_STRIDE;
    if (v[b] !== RockKind.Free || s.rockBorn[k] === 1) continue;
    const [gx, gy] = gravityAccel(v[b + 1]!, v[b + 2]!);
    let vx = (v[b + 3]! + gx * ROCK_GRAVITY * DT) * keep, vy = (v[b + 4]! + gy * ROCK_GRAVITY * DT) * keep;
    const sp = Math.sqrt(vx * vx + vy * vy);
    if (sp > ROCK_MAX_SPEED) { const f = ROCK_MAX_SPEED / sp; vx *= f; vy *= f; }
    v[b + 3] = vx; v[b + 4] = vy;
    v[b + 1]! += vx * DT; v[b + 2]! += vy * DT;
  }
  rocksMoved(s);
  const p = s.map.planet;
  for (let a = 0; a < n; a++) {   // part 2: contacts, reading kinds as they stand now
    const A = a * ROCK_STRIDE;
    if (v[A] !== RockKind.Free || s.rockBorn[a] === 1) continue;
    const x = v[A + 1]!, y = v[A + 2]!, r = v[A + 5]!, planet = touching(x, y, r, p.x, p.y, p.r);
    if (planet || x * x + y * y > R_MAP * R_MAP) { dustRock(s, a, planet ? 'planet' : 'edge'); s.rockDone[a] = 1; continue; }
    for (const o of rocksNear(s, x, y, r)) {
      if (o === a || !rockAlive(s, o) || s.rockBorn[o] === 1 || s.rockDone[o] === 1) continue;
      if (!touching(v[A + 1]!, v[A + 2]!, v[A + 5]!, rockX(s, o), rockY(s, o), v[o * ROCK_STRIDE + 5]!)) continue;
      resolveRockPair(s, a, o);
      if (v[A] !== RockKind.Free || s.rockBorn[a] === 1) break;   // a broke: its turn ends
    }
    s.rockDone[a] = 1;
  }
}
```

- [ ] **Step 5: `rockBreak.ts`: freeing instead of waking.** In `src/renderer/src/sim/tactical/rockBreak.ts`:
  - Replace the import line from `./rocks` with: `import { freeRock, markTouched, restartClock, rockAlive, rockAt, rockHp, RockKind, rockSlots, ROCK_STRIDE, writeRock } from './rocks';`
  - Replace `pushRock` with:

```ts
/** Asteroids-iii §3.4, §5.3: add (dvx, dvy) to rock k's velocity: a Rail is freed first; the push restarts its clock and
 *  touches it. Born or gone: nothing. */
export function pushRock(s: TacticalState, k: number, dvx: number, dvy: number): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  freeRock(s, k); markTouched(s, k); restartClock(s, k);
  const b = k * ROCK_STRIDE;
  s.rocks[b + 3]! += dvx; s.rocks[b + 4]! += dvy;
}
```

  - In `wearRock`, add `markTouched(s, k);` right after the `if (!rockAlive(s, k) || s.rockBorn[k] === 1) return false;` line.
  - In `allocate`, change `if (v[b] !== RockKind.Moving || ...` to `if (v[b] !== RockKind.Free || ...` (Task 10 widens eviction to Rails).
  - In `breakRock`, change `writeRock(s, slot, RockKind.Moving, px, py, vx, vy, rp, rockHp(rp));` to `writeRock(s, slot, RockKind.Free, px, py, vx, vy, rp, rockHp(rp));`.

- [ ] **Step 6: `contacts.ts`: a rail is freed first, then two bodies.** In `src/renderer/src/sim/tactical/contacts.ts` replace line 5 with `import { freeRock, markTouched, restartClock, rockAlive, rockAt, rockMass, rocksNear, ROCK_STRIDE, rockX, rockY } from './rocks';` and replace the doc comment and body of `shipRock` (lines 59–98) with:

```ts
/**
 * Spike ii §5.1, asteroids-iii §6.2: ship i meets rock k in the duel. A Rail is freed first (at its rail position and
 * velocity); every rock is then a second body. Normal n from the rock to the ship, closing speed vc = (vk − vs) · n. The
 * overlap is shared by inverse mass, the impulse (1 + RESTITUTION) vc / (1/ms + 1/mk) when closing, hull by ramHull of the
 * impact vc · mk / (mk + ms). A ship contact is a push: the rock's clock restarts and it is touched. Outside the pair's
 * grace: the hull cost, then the rock's ram damage (the §3.3 formula with the ship as the other body; a fan break along −n).
 */
function shipRock(state: TacticalState, i: number, k: number): void {
  const s = state.ships[i]!, sys = state.systems[i]!, v = state.rocks, b = k * ROCK_STRIDE, radius = classOf(state, i).radius;
  const dx = s.x - rockX(state, k), dy = s.y - rockY(state, k), rr = radius + v[b + 5]!, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  freeRock(state, k); markTouched(state, k); restartClock(state, k);
  const d = Math.sqrt(d2), nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1, body = k + 1;
  const vc = (v[b + 3]! - s.vx) * nx + (v[b + 4]! - s.vy) * ny, mk = rockMass(v[b + 5]!);
  const is = 1 / SHIP_MASS, ik = 1 / mk, overlap = rr - d, ss = (overlap * is) / (is + ik), sk = (overlap * ik) / (is + ik);
  s.x += nx * ss; s.y += ny * ss; v[b + 1]! -= nx * sk; v[b + 2]! -= ny * sk;
  if (vc > 0) {
    const j = ((1 + RESTITUTION) * vc) / (is + ik);
    s.vx += nx * j * is; s.vy += ny * j * is; v[b + 3]! -= nx * j * ik; v[b + 4]! -= ny * j * ik;
  }
  const hull = ramHull((vc * mk) / (mk + SHIP_MASS));
  if (state.tick < s.graceUntil[body]!) return;
  sys.hull = Math.max(0, sys.hull - hull);
  s.graceUntil[body] = state.tick + CONTACT_GRACE_TICKS;
  s.asteroidHits++;
  const dmg = crushDamage(vc, mk, SHIP_MASS);
  if (dmg <= 0) return;
  const broke = wearRock(state, k, dmg), a = rockAt(state, k);
  state.events.push({ kind: 'rock', what: 'bump', by: 'ram', rock: k, x: s.x - nx * radius, y: s.y - ny * radius, r: a.r, vx: a.vx, vy: a.vy, ship: i });
  if (broke) breakRock(state, k, -nx, -ny, 'ram', i, 'fan', [k]);
}
```

Also update the `hitStatics` doc comment to: `/** Ship slot i's static contacts (spec §4 order): the planet, then the rocks at their accessor positions in ascending slot (asteroids-iii plan deviation 1: the flight view never frees or writes a rock). Exported for the single-ship flight step (H-1 spec §9). */`. `ASTEROID_CONTACT_HULL` stays imported (hitStatics uses it).

- [ ] **Step 7: `state.ts`.** In `src/renderer/src/sim/tactical/state.ts`:
  - Replace the rock event's doc comment and line (lines 163–167) with:

```ts
  /** Spike ii §8: rock slot `rock` was hit, split (its `pieces`, piece 0 in its own slot; `burst` for a torpedo's direct
   *  hit), turned to dust (`rock` −1: a piece that found no slot), blasted (x, y the blast point, r its radius) or bumped
   *  in a damaging contact (`bump`: x, y the contact point; `other` the second rock of a rock-rock contact). Asteroids-iii
   *  §5.4: `touch`, two rocks of different clocks met closing above TOUCH_MIN (`other`, the contact point, `speed` the
   *  closing speed); §13.2: `rejoin`, a free rock went back on a rail (`how`: a lane capture, a rigid group or its own orbit;
   *  by 'settle'). `ship`: the ship whose weapon, ram or break caused it (absent for collisions, eviction and lost pieces). */
  | { kind: 'rock'; what: 'hit' | 'split' | 'dust' | 'blast' | 'bump' | 'touch' | 'rejoin'; by: RockCause; rock: number; x: number; y: number; r: number; vx: number; vy: number; ship?: number; pieces?: number[]; other?: number; evicted?: true; burst?: true; speed?: number; how?: 'lane' | 'group' | 'own' };
```

  (Keep the lines between the existing comment's start and the union member as they are if the comment differs slightly; the union member is what changes.)
  - `RockCause` (line 170) becomes `export type RockCause = 'laser' | 'torpedo' | 'collision' | 'ram' | 'planet' | 'edge' | 'tidal' | 'settle';` (§13.3 the Roche break, §13.2 the rejoin event).
  - Replace the `TacticalState` rock lines (174–177) with:

```ts
  /** Spike ii (rocks.ts): the mutable rock pool and its counters (§8; asteroids-iii §5.4 rockTouches, §5.5 rockSlotDust,
   *  §13.3 rockCapHits), then the per-tick transient masks (not hashed, not snapshotted, cleared at the start and the end
   *  of every stepDuel). */
  rocks: Float64Array; rockHits: number; rockSplits: number; rockDust: number; rockBlasts: number; rockCollisions: number; rockEvictions: number; rockTouches: number; rockSlotDust: number; rockCapHits: number;
  rockBorn: Uint8Array; rockDone: Uint8Array; rockTouched: Uint8Array;
```

  - In `createTacticalState` (lines 281–282) add `rockTouches: 0, rockSlotDust: 0, rockCapHits: 0` after `rockEvictions: 0,` and `rockTouched: new Uint8Array(rockCapacity(map))` after the `rockDone` array.

- [ ] **Step 8: `hash.ts`.** In `src/renderer/src/sim/tactical/hash.ts`:
  - Line 13: `import { RockKind, rockCapacity, ROCK_RESERVE, ROCK_STRIDE } from './rocks';` and add `import { RAIL_OFFSET_MAX, ROCK_MIN_R, ROCK_R_MAX, ROCK_RAIL_MIN } from './rockTuning';`.
  - In `spaceFields` (line 117) and in `topRules` (line 264): the counter list becomes `'rockHits', 'rockSplits', 'rockDust', 'rockBlasts', 'rockCollisions', 'rockEvictions', 'rockTouches', 'rockSlotDust', 'rockCapHits'` (topRules: `rockTouches: count, rockSlotDust: count, rockCapHits: count`). Update the comment above `fields.push(vector('rocks', ...` to `// Spike ii (§8), asteroids-iii §3.1: the rock pool (8 values a slot) and its nine counters, last in the space module.`
  - `notSnapshotted` gains `rockTouched: 'asteroids-iii §3.4: slots freed, pushed, hit or in a contact this tick; cleared at the start and the end of every stepDuel tick'`.
  - In `cloneTacticalFromModule`, the copy's masks become `rockBorn: new Uint8Array(s.rockBorn.length), rockDone: new Uint8Array(s.rockDone.length), rockTouched: new Uint8Array(s.rockTouched.length),`. (The rail memo and the rock grid live in WeakMaps keyed by the state object, so the copy has none.)
  - Above `validateTacticalValues` add:

```ts
/** Asteroids-iii §3.1, §13.1: what is wrong with rock slot values v[b .. b + 7] against the state's tick, or null: kind 0..3; a
 *  Gone slot holds zeros; otherwise t a whole tick in 0..tick, r in [ROCK_MIN_R, ROCK_R_MAX], hp > 0, and a rail's (Rail
 *  or Tumble) |centre| at least ROCK_RAIL_MIN and |offset| at most RAIL_OFFSET_MAX. */
function rockSlotProblem(v: readonly number[], b: number, tick: number): string | null {
  const kind = v[b]!;
  if (kind !== RockKind.Gone && kind !== RockKind.Rail && kind !== RockKind.Free && kind !== RockKind.Tumble) return 'kind is not 0, 1, 2 or 3';
  if (kind === RockKind.Gone) { for (let j = 1; j < ROCK_STRIDE; j++) if (v[b + j] !== 0) return 'a gone slot holds values'; return null; }
  const t = v[b + 7]!, r = v[b + 5]!, hp = v[b + 6]!;
  if (!Number.isInteger(t) || t < 0 || t > tick) return 't is not a whole tick in 0..tick';
  if (!(r >= ROCK_MIN_R && r <= ROCK_R_MAX)) return 'r out of range';
  if (!(hp > 0)) return 'hp is not above 0';
  if (kind === RockKind.Rail || kind === RockKind.Tumble) {
    const cx = v[b + 1]!, cy = v[b + 2]!, ox = v[b + 3]!, oy = v[b + 4]!;
    if (Math.sqrt(cx * cx + cy * cy) < ROCK_RAIL_MIN) return 'a rail centre inside ROCK_RAIL_MIN';
    if (Math.sqrt(ox * ox + oy * oy) > RAIL_OFFSET_MAX) return 'a rail offset past RAIL_OFFSET_MAX';
  }
  return null;
}
```

  - Inside `validateTacticalValues`, declare `let tickSeen = 0;` next to `let at = offset;`, and in the field loop, right after the `if (slice.some(... !Number.isFinite(v))) bad('not finite');` line, add:

```ts
    if (f.name === 'tick') tickSeen = slice[0]!;
    if (f.name === 'rocks') for (let k = 0; k * ROCK_STRIDE < slice.length; k++) { const why = rockSlotProblem(slice, k * ROCK_STRIDE, tickSeen); if (why) bad(`slot ${k}: ${why}`); }
```

  Also extend the doc comment of `validateTacticalValues` with: `Asteroids-iii §3.1: every rock slot by rockSlotProblem against the tick.`

- [ ] **Step 9: `duel.ts`: the step context.** In `src/renderer/src/sim/tactical/duel.ts` change the import from `./rocks` to `import { beginRockStep, beginRockTick, endRockStep } from './rocks';`, then in `stepDuel` replace the line `state.events = []; beginRockTick(state);   // spike ii §3.1: ...` with `state.events = []; beginRockTick(state); beginRockStep(state);   // spike ii §3.1: the transient masks start empty; asteroids-iii §3.3: rails read at tick + 1` and wrap everything from `const hunter = hunterSlot(state), n = ...` through the final `beginRockTick(state);   // impl review R1-F1: ...` line in `try { ... } finally { endRockStep(state); }`, leaving `state.tick++;` after the `finally`. Add to the doc comment's order sentence: `(asteroids-iii §3.3: inside the step context rails are read at tick + 1)`.

- [ ] **Step 10: The renderer, the script and the old spike ii scripts.** In `src/renderer/src/render/tactical/tacticalModel.ts` line 391 change `RockKind.Moving` to `RockKind.Free`. In `scripts/profile-duel-publication.ts` line 47 change `RockKind.Moving` to `RockKind.Free` and line 51 `RockKind.Static` to `RockKind.Rail`. Delete the replaced spike ii scripts:

```bash
git rm scripts/spike-asteroids-ii-measure.ts scripts/spike-asteroids-ii-shots.cjs
```

- [ ] **Step 11: The test rigs.** Replace `tests/helpers/rockArena.ts` with:

```ts
// Spike ii and asteroids-iii test rigs: an empty rock arena with the Hunter switched off, rock writers (a Free rock, a
// Rail at its own radius, a seeded slot as the map makes it), a full pool, and the tick's rock events.
import { createTacticalState, type DuelEvent, type TacticalState } from '../../src/renderer/src/sim/tactical/state';
import { beginRockTick, initRocks, rockHp, RockKind, rockSlots, ROCK_STRIDE, writeRock } from '../../src/renderer/src/sim/tactical/rocks';
import { todaysCrewWeapons } from './crewWeapons';

export type RockEvent = Extract<DuelEvent, { kind: 'rock' }>;

/** A tactical state with every rock removed, the Hunter switched off (slot 1 inactive) and the crew ship parked at rest at
 *  (0, −2500), heading north; a fresh tick's masks. */
export function arena(seed = 5): TacticalState {
  const st = todaysCrewWeapons(createTacticalState(seed));   // Engineering spike spec §10.3: the beam and torpedo stand on bars (the round starts the beam dark)
  st.rocks.fill(0);
  Object.assign(st.ships[0], { x: 0, y: -2500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.ships[1].active = false;
  beginRockTick(st);
  return st;
}
/** A Free (kind 2) rock in slot k; its clock t defaults to the phase tick. */
export function mover(st: TacticalState, k: number, x: number, y: number, vx: number, vy: number, r: number, hp = rockHp(r), t?: number): void {
  writeRock(st, k, RockKind.Free, x, y, vx, vy, r, hp, t);
}
/** A Rail (kind 1) rock in slot k at (x, y) now: its centre (x, y), offset 0, anchored at st.tick (it turns at its own radius). */
export function rail(st: TacticalState, k: number, x: number, y: number, r: number, hp = rockHp(r)): void {
  writeRock(st, k, RockKind.Rail, x, y, 0, 0, r, hp, st.tick);
}
/** Seeded asteroid k back in its own slot as the map makes it (a rail at t = 0, full hp). */
export function seeded(st: TacticalState, k: number): void {
  st.rocks.set(initRocks(st.map).subarray(k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE), k * ROCK_STRIDE);
}
/** Every empty slot (but `except`) gets a Free rock of radius r on a far grid, x −2000..1800, y −1600..200. */
export function fillPool(st: TacticalState, r: number, except: readonly number[] = []): void {
  for (let k = 0; k < rockSlots(st); k++)
    if (st.rocks[k * ROCK_STRIDE] === RockKind.Gone && !except.includes(k)) mover(st, k, -2000 + (k % 20) * 200, -1600 + Math.floor(k / 20) * 200, 0, 0, r);
}
/** This tick's rock events, optionally of one kind. */
export function rockEvents(st: TacticalState, what?: RockEvent['what']): RockEvent[] {
  return st.events.filter((e): e is RockEvent => e.kind === 'rock' && (what === undefined || e.what === what));
}
```

`fillPool`'s far grid now has 245-odd slots: rows past y 200 are written too (`Math.floor(k / 20)` up to 12, y up to 800); the tests that use it only need the pool full.

- [ ] **Step 12: Migrate the rock tests to the new kinds.**
  - `tests/rockContacts.test.ts`: delete the test `'a static rock touched at vc ≤ 40 stays static and does not move; above 40 it wakes and takes the impulse'` (spec §11: the wake speed and the infinitely heavy still rock are gone). Replace the test `'a static rock woken at a higher slot takes its own turn in the same pass'` with:

```ts
  it('a rail rock met by a free rock is freed at its rail position and velocity and, at a higher slot, takes its own turn in the same pass', () => {
    const st = arena();
    seeded(st, 5);
    const a5 = rockAt(st, 5);
    mover(st, 2, a5.x - (a5.r + 10) + 3, a5.y, a5.vx + 100, a5.vy, 10, 10);
    stepRocks(st);
    expect(rockKind(st, 5)).toBe(RockKind.Free);
    expect(st.rockDone[5]).toBe(1);
    expect(rockAt(st, 5).vx).toBeGreaterThan(a5.vx);
  });
```

  - `tests/rockShips.test.ts`: add `ROCK_STRIDE` to the import from `rocks` and `rail` to the import from `./helpers/rockArena`. Replace the whole `describe('a static rock (spec §5.1 cases 1 and 2)', ...)` block with:

```ts
describe('a rail rock (asteroids-iii §6.2): freed first, then two bodies', () => {
  it('rammed at 200 u/s relative: freed at its rail position and velocity, then the two-body contact (r 44.6: impact about 138, hull 3)', () => {
    const st = arena();
    rail(st, 100, 20 + 44.6 - 1, -2500, 44.6);
    const before = rockAt(st, 100), hull = st.systems[0].hull;
    Object.assign(st.ships[0], { vx: before.vx + 200, vy: before.vy });
    resolveContacts(st, true);
    expect(rockAt(st, 100).kind).toBe(RockKind.Free);
    expect(rockAt(st, 100).vx).toBeGreaterThan(before.vx);   // thrown east, ahead of the ship
    expect(hull - st.systems[0].hull).toBe(3);
    expect(st.rockTouched[100]).toBe(1);
  });
  it('the single-ship flight never writes the pool: the rail rock keeps its slot, the ship pays today\'s hull 1', () => {
    const st = arena();
    seeded(st, 5);
    const a = rockAt(st, 5), slot = Array.from(st.rocks.subarray(5 * ROCK_STRIDE, 6 * ROCK_STRIDE)), hull = st.systems[0].hull;
    Object.assign(st.ships[0], { x: a.x - (20 + a.r) - 1, y: a.y, vx: 200, vy: 0, heading: 64 });
    stepSoloFlight(st, { turn: 0, thrust: 0 });
    expect(Array.from(st.rocks.subarray(5 * ROCK_STRIDE, 6 * ROCK_STRIDE))).toEqual(slot);
    expect(hull - st.systems[0].hull).toBe(1);
  });
});
```

  (The second test's ship is the crew Cutter at rest offset by 1 u; it flies 200/60 ≈ 3.3 u into the rock on the first tick.) Update the file's header comment: replace `a static rock that does not wake is today's infinitely heavy contact, a hard ram wakes it` with `a rail rock is freed first and is then a second body`.
  - `tests/rockLaser.test.ts`: add `rail` to the import from `./helpers/rockArena`; replace the test `'wakes a static rock'` with:

```ts
  it('frees a rail rock: Free, its rail velocity plus J / m along the shot, 2 damage', () => {
    const st = east();
    rail(st, 100, 200, -2500, 30, 3);
    const before = rockAt(st, 100);
    st.systems[0].laserRock = 100;
    applyWeaponsInput(st, 0, IDLE_INPUT);
    const after = rockAt(st, 100);
    expect(after.kind).toBe(RockKind.Free);
    expect([after.x, after.y]).toEqual([before.x, before.y]);   // freed where its rail had it (outside a step: tick 0)
    expect(after.vx).toBeCloseTo(before.vx + 4000 / 900, 12);
    expect(after.vy).toBeCloseTo(before.vy, 12);
    expect(after.hp).toBe(1);
  });
```

  and in the header comment replace `a static rock wakes` with `a rail rock is freed`.
  - `tests/rockBreak.test.ts`: in the fan test change `expect(p.kind).toBe(RockKind.Moving);` to `expect(p.kind).toBe(RockKind.Free);`. Replace the test `'pushRock wakes a static rock and adds Δv; dustRock clears the slot with a dust event'` with:

```ts
  it('pushRock frees a rail rock and adds Δv to its rail velocity; dustRock clears the slot with a dust event', () => {
    const st = arena();
    seeded(st, 0);
    const rail0 = rockAt(st, 0);
    pushRock(st, 0, 3, 4);
    const p = rockAt(st, 0);
    expect([p.kind, p.x, p.y]).toEqual([RockKind.Free, rail0.x, rail0.y]);
    expect(p.vx).toBeCloseTo(rail0.vx + 3, 12); expect(p.vy).toBeCloseTo(rail0.vy + 4, 12);
    dustRock(st, 0, 'edge');
    expect(rockAlive(st, 0)).toBe(false);
    const dust = rockEvents(st, 'dust');
    expect(dust).toMatchObject([{ rock: 0, by: 'edge' }]);
    expect(dust[0]!.vx).toBeCloseTo(rail0.vx + 3, 12);
    expect(dust[0]).not.toHaveProperty('ship');
    expect(st.rockDust).toBe(1);
  });
```

  - `tests/contactScene.test.ts` line 194: `RockKind.Moving` → `RockKind.Free`.
  - `tests/tacticalDeterminism.test.ts` flatten key guard: the `Object.keys(st).sort()` expectation becomes `['derelict', 'designated', 'events', 'grid', 'hostileAt', 'hunter', 'known', 'map', 'missiles', 'outcome', 'pew', 'rng', 'rockBlasts', 'rockBorn', 'rockCapHits', 'rockCollisions', 'rockDone', 'rockDust', 'rockEvictions', 'rockHits', 'rockSlotDust', 'rockSplits', 'rockTouched', 'rockTouches', 'rocks', 'rounds', 'scan', 'seed', 'ships', 'startTick', 'systems', 'tick', 'weakFreq']` (JavaScript's default sort: upper case before lower case). In the length formula change the counters term `+ 6 + 2 * 55` to `+ 9 + 2 * 55`, and add to the comment above it: `Asteroids-iii: 8 values a rock slot (ROCK_STRIDE), ROCK_RESERVE 160 in the graceUntil bodies, three more counters (rockTouches, rockSlotDust, rockCapHits).`

- [ ] **Step 13: Run the targeted tests and the types**

Run: `npm run typecheck && npx vitest run tests/rockPool.test.ts tests/rockContacts.test.ts tests/rockShips.test.ts tests/rockLaser.test.ts tests/rockBreak.test.ts tests/rockBlast.test.ts tests/rockLock.test.ts tests/rockMaskBetweenTicks.test.ts tests/valkyrnRoundsRocks.test.ts tests/pewRounds.test.ts tests/engWeapons.test.ts tests/tacticalDeterminism.test.ts tests/tacticalContacts.test.ts tests/tacticalSoloFlight.test.ts tests/contactScene.test.ts tests/rockFx.test.ts tests/rockRails.test.ts tests/boundary.test.ts`
Expected: typecheck clean; all PASS. If a test outside this list fails only because a rock now moves on its rail (a pinned position, tick or count), leave it for Task 14; if a listed test fails, fix the code, not the expectation, unless the expectation is one of the rewrites above. `rockFx`'s streak test still passes here (the free rock streak keeps spike ii's absolute-speed rule until Task 12).

- [ ] **Step 14: Commit**

```bash
git add src/renderer/src/sim/tactical/rocks.ts src/renderer/src/sim/tactical/rockContacts.ts src/renderer/src/sim/tactical/rockBreak.ts src/renderer/src/sim/tactical/contacts.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/duel.ts src/renderer/src/sim/tactical/rockTuning.ts src/renderer/src/render/tactical/tacticalModel.ts scripts/profile-duel-publication.ts tests/helpers/rockArena.ts tests/rockPool.test.ts tests/rockContacts.test.ts tests/rockShips.test.ts tests/rockLaser.test.ts tests/rockBreak.test.ts tests/contactScene.test.ts tests/tacticalDeterminism.test.ts
git commit -m "feat(asteroids-iii): the pool on rails: stride 8, Rail and Free kinds, accessors with an input-keyed memo, the step phase, freeing replaces waking, restore rules (spec §3.1-§3.4)" -m "The spike ii wake speed and the infinitely heavy still rock are gone (spec §11); spike-asteroids-ii-measure.ts and -shots.cjs are replaced by the iii scripts." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The map: lanes, cluster separation, seeded rails (lane rocks Rail, cluster rocks Tumble)

**Files:**
- Modify: `src/renderer/src/sim/tactical/map.ts` (`MapDef`, `generateMap`, `validateMap`, a new `laneOf` and `laneBand`)
- Modify: `src/renderer/src/sim/tactical/rocks.ts` (`seededRail`)
- Modify: `tests/helpers/rockArena.ts` (add `withSwitches`)
- Modify: `src/renderer/src/sim/duel/hash.ts:27-31` (`mapHash`)
- Test: `tests/tacticalMap.test.ts` (append)

**Interfaces:**
- Consumes: `LANES`, `Lane`, `CLUSTER_RHO_SEPARATION`, `CLUSTER_RHO_SLACK` (tuning.ts, Task 3); `ROCK_SWITCHES` (rockTuning.ts, Task 3); `seededRail` (rocks.ts, Task 4).
- Produces (map.ts): `MapDef` gains `laneSizes: number[]` (rocks placed per lane, in `LANES` order; the belt's slots are the inner lane's, then the main lane's, then the outer lane's) `clusterRho: number[]` (each cluster centre's orbital radius, in cluster order) and `clusterCentres: { x: number; y: number }[]` (each cluster centre, in cluster order); `export function laneOf(map: MapDef, k: number): number` (the lane index of belt slot k, −1 for a cluster rock); `export function laneBand(lane: Lane): [number, number]` (`[ρ − rMax − ASTEROID_GAP, ρ + rMax + ASTEROID_GAP]`); `export function clusterOf(map: MapDef, k: number): number` (cluster index of slot k, −1 for a belt rock).
- Produces (rocks.ts): `seededRail(map, k, tumble = ROCK_SWITCHES.clusterTumble)`: a belt rock `[Rail, x, y, 0, 0]`; a cluster rock `[Tumble or Rail, centre x, centre y, x − centre x, y − centre y]` (§13.1).
- Produces (tests/helpers/rockArena.ts): `withSwitches(patch: Partial<typeof ROCK_SWITCHES>, run: () => void): void` (sets the switches, runs, always restores them).

- [ ] **Step 1: Write the failing tests** — append to `tests/tacticalMap.test.ts` (add `clusterOf, laneBand, laneOf` to its `map` import, and these imports at the top):

```ts
import { initRocks, RockKind, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { withSwitches } from './helpers/rockArena';
import { ASTEROID_GAP, CLUSTER_RADIUS, CLUSTER_RHO_SEPARATION, CLUSTER_R_MAX, LANES } from '../src/renderer/src/sim/tactical/tuning';
```

```ts
describe('lanes and rigid clusters (asteroids-iii §3.5)', () => {
  it('over 200 seeds: 17, 36 and 17 rocks on their lane radii in their size bands, clusters at least 420 apart in ρ', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const m = generateMap(createRng(seed));
      expect(m.laneSizes, `seed ${seed}`).toEqual(LANES.map((l) => l.count));
      for (let k = 0; k < m.beltCount; k++) {
        const a = m.asteroids[k]!, lane = LANES[laneOf(m, k)]!;
        expect(Math.abs(Math.hypot(a.x, a.y) - lane.rho)).toBeLessThan(1e-9);
        expect(a.r).toBeGreaterThanOrEqual(lane.rMin); expect(a.r).toBeLessThanOrEqual(lane.rMax);
      }
      expect(m.clusterRho).toHaveLength(m.clusterSizes.length);
      for (let i = 1; i < m.clusterRho.length; i++) expect(m.clusterRho[i]! - m.clusterRho[i - 1]!).toBeGreaterThanOrEqual(CLUSTER_RHO_SEPARATION - 1e-9);
      for (let k = m.beltCount; k < m.asteroids.length; k++) {
        const a = m.asteroids[k]!, c = m.clusterRho[clusterOf(m, k)]!;
        expect(Math.abs(Math.hypot(a.x, a.y) - c)).toBeLessThanOrEqual(CLUSTER_RADIUS + 1e-9);
      }
    }
  });
  it('rocks of different lanes can never touch: neighbouring lane radii minus the largest radius sum leave the gap', () => {
    for (let i = 1; i < LANES.length; i++) expect(LANES[i]!.rho - LANES[i - 1]!.rho - LANES[i]!.rMax - LANES[i - 1]!.rMax).toBeGreaterThanOrEqual(ASTEROID_GAP);
    expect(laneBand(LANES[1]!)).toEqual([1200 - 45 - ASTEROID_GAP, 1200 + 45 + ASTEROID_GAP]);
    expect(CLUSTER_RHO_SEPARATION).toBe(2 * (CLUSTER_RADIUS + CLUSTER_R_MAX) + ASTEROID_GAP);
  });
  it('validateMap names a rock off its lane, a lane count, and clusters too close in ρ', () => {
    const m = generateMap(createRng(9));
    const off = { ...m, asteroids: m.asteroids.map((a, k) => (k === 0 ? { ...a, x: a.x * 1.01, y: a.y * 1.01 } : a)) };
    expect(validateMap(off).some((e) => /belt asteroid 0 is off its lane/.test(e))).toBe(true);
    expect(validateMap({ ...m, laneSizes: [16, 37, 17] }).some((e) => /lane/.test(e))).toBe(true);
    expect(validateMap({ ...m, clusterRho: [1600, 1900, 2500] }).some((e) => /clusters 0 and 1 are closer than 420/.test(e))).toBe(true);
  });
  it('seeded rails (§13.1): a belt rock a Rail centred on itself; a cluster rock a Tumble (switch on) or Rail (off) on its cluster centre with its offset', () => {
    const m = generateMap(createRng(4));
    for (const tumble of [true, false]) withSwitches({ clusterTumble: tumble }, () => {
      const v = initRocks(m);
      for (let k = 0; k < m.asteroids.length; k++) {
        const a = m.asteroids[k]!, slot = Array.from(v.subarray(k * ROCK_STRIDE, k * ROCK_STRIDE + 5));
        if (k < m.beltCount) { expect(slot).toEqual([RockKind.Rail, a.x, a.y, 0, 0]); continue; }
        const c = m.clusterCentres[clusterOf(m, k)]!;
        expect(slot).toEqual([tumble ? RockKind.Tumble : RockKind.Rail, c.x, c.y, a.x - c.x, a.y - c.y]);
        expect(Math.hypot(c.x, c.y)).toBeCloseTo(m.clusterRho[clusterOf(m, k)]!, 9);
      }
    });
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run tests/tacticalMap.test.ts`
Expected: FAIL (`laneOf` not exported; `laneSizes` undefined).

- [ ] **Step 3: Rewrite the generator and the validator.** In `src/renderer/src/sim/tactical/map.ts`:
  - The tuning import gains `CLUSTER_RHO_SEPARATION, CLUSTER_RHO_SLACK, LANES, type Lane` and loses `BELT_R_MAX, BELT_R_MIN` (no longer read).
  - `MapDef` gains, after `clusterSizes: number[];`:

```ts
  /** Asteroids-iii §3.5: rocks placed per lane, in LANES order (the belt's slots: the inner lane's, the main lane's, the outer lane's). */
  laneSizes: number[];
  /** Asteroids-iii §3.5: each cluster centre's orbital radius, in cluster order (its rocks turn at this radius's rate). */
  clusterRho: number[];
  /** Asteroids-iii §13.1: each cluster centre, in cluster order (its rocks' rail centre). */
  clusterCentres: { x: number; y: number }[];
```

  - Add after `inCorridor`:

```ts
/** Asteroids-iii §3.5: a lane's band of rock centres' reach: [ρ − rMax − ASTEROID_GAP, ρ + rMax + ASTEROID_GAP]. */
export function laneBand(lane: Lane): [number, number] { return [lane.rho - lane.rMax - ASTEROID_GAP, lane.rho + lane.rMax + ASTEROID_GAP]; }
/** The lane index of belt slot k (in LANES order), or −1 for a cluster rock. */
export function laneOf(map: MapDef, k: number): number {
  if (k < 0 || k >= map.beltCount) return -1;
  let end = 0;
  for (let i = 0; i < map.laneSizes.length; i++) { end += map.laneSizes[i]!; if (k < end) return i; }
  return -1;
}
/** The cluster index of slot k, or −1 for a belt rock. */
export function clusterOf(map: MapDef, k: number): number {
  let end = map.beltCount;
  if (k < end) return -1;
  for (let i = 0; i < map.clusterSizes.length; i++) { end += map.clusterSizes[i]!; if (k < end) return i; }
  return -1;
}
```

  - In `generateMap`, replace the belt loop (from `const asteroids: Circle[] = [];` through `const beltCount = asteroids.length;`) with:

```ts
  // Asteroids-iii §3.5: the belt as lanes. Each lane's rocks sit on its exact radius with radii jittered in its band; the
  // existing angle draws, gap corridors, fits and spawn clearance place them (20,000 tries per lane).
  const asteroids: Circle[] = [], laneSizes: number[] = [];
  for (const lane of LANES) {
    let placed = 0;
    for (let tries = 0; placed < lane.count && tries < 20000; tries++) {
      const r = lane.rMin + nextFloat(rng) * (lane.rMax - lane.rMin);
      const [dx, dy] = dirBetween(nextInt(rng, HEADING_COUNT), nextFloat(rng));
      const c = { x: dx * lane.rho, y: dy * lane.rho, r };
      if (fits(c, asteroids, gaps, spawns, true)) { asteroids.push(c); placed++; }
    }
    laneSizes.push(placed);
  }
  const beltCount = asteroids.length;
```

  - Replace the cluster loop's centre draw. Before `const clusterSizes: number[] = [];` add the constructive radii (plan deviation 5), and inside the `for (let k = 0; k < CLUSTER_COUNT; k++)` loop replace the centre's `for (let t = 0; t < 500 && !found; t++) { ... }` block with one that keeps the radius fixed:

```ts
  // Asteroids-iii §3.5 (plan deviation 5): centre radii at least CLUSTER_RHO_SEPARATION apart: three sorted slacks in
  // [0, CLUSTER_RHO_SLACK] on top of CLUSTER_CENTRE_MIN + k · CLUSTER_RHO_SEPARATION. Clusters then never meet each other
  // or the belt. Only the bearing is redrawn until the spawn clearance holds.
  const slack = [nextFloat(rng), nextFloat(rng), nextFloat(rng)].map((u) => u * CLUSTER_RHO_SLACK).sort((a, b) => a - b);
  const clusterRho = Array.from({ length: CLUSTER_COUNT }, (_, k) => CLUSTER_CENTRE_MIN + k * CLUSTER_RHO_SEPARATION + slack[k]!);
  const clusterCentres: { x: number; y: number }[] = [];
```

```ts
    const rad = clusterRho[k]!;
    for (let t = 0; t < 500 && !found; t++) {
      const [dx, dy] = dirBetween(nextInt(rng, HEADING_COUNT), nextFloat(rng));
      cx = dx * rad; cy = dy * rad;
      found = spawns.every((s) => dist(cx, cy, s.x, s.y) >= CLUSTER_RADIUS + CLUSTER_R_MAX + SPAWN_CLEARANCE);
    }
    clusterCentres.push({ x: cx, y: cy });
```

  (`CLUSTER_COUNT` is 3, so the three slacks cover every cluster.) The return line becomes `return { rMap: R_MAP, planet: { x: 0, y: 0, r: PLANET_RADIUS }, asteroids, beltCount, clusterSizes, laneSizes, clusterRho, clusterCentres, gaps, spawns };`.
  - In `validateMap`, after the `clusterSizes.forEach(...)` line add:

```ts
  // Asteroids-iii §3.5: the lanes and the clusters' ρ separation.
  if (m.laneSizes.length !== LANES.length || m.laneSizes.some((n, i) => n !== LANES[i]!.count)) out.push(`lane sizes ${m.laneSizes.join('/')} are not ${LANES.map((l) => l.count).join('/')}`);
  if (m.laneSizes.reduce((a, b) => a + b, 0) !== m.beltCount) out.push('lane sizes do not add up to the belt');
  if (m.clusterRho.length !== m.clusterSizes.length) out.push(`${m.clusterRho.length} cluster radii for ${m.clusterSizes.length} clusters`);
  for (let i = 0; i < m.clusterRho.length; i++) for (let j = i + 1; j < m.clusterRho.length; j++)
    if (Math.abs(m.clusterRho[i]! - m.clusterRho[j]!) < CLUSTER_RHO_SEPARATION - 1e-9) out.push(`clusters ${i} and ${j} are closer than ${CLUSTER_RHO_SEPARATION} in ρ`);
```

  and inside `m.asteroids.forEach((a, i) => { ... })`, in the `if (i < m.beltCount) { ... }` block, add:

```ts
      const lane = LANES[laneOf(m, i)];
      if (!lane || Math.abs(r - lane.rho) > 1e-9) out.push(`belt asteroid ${i} is off its lane`);
      else if (a.r < lane.rMin || a.r > lane.rMax) out.push(`belt asteroid ${i} is outside its lane's size band`);
```

  and after that block add `else { const c = m.clusterRho[clusterOf(m, i)]; if (c === undefined || Math.abs(r - c) > CLUSTER_RADIUS + 1e-9) out.push(\`cluster asteroid ${i} is off its cluster's radius\`); }` (turn the `if (i < m.beltCount) { ... }` into `if ... else ...`).

- [ ] **Step 4: Seeded rails: lane rocks on themselves, cluster rocks on their centre.** In `src/renderer/src/sim/tactical/rocks.ts` replace `seededRail` with:

```ts
/** §13.1: seeded asteroid k's rail: a belt rock a Rail centred on itself (offset 0); a cluster rock on its cluster's centre
 *  with its offset, a Tumble when the clusterTumble switch is on (else a Rail: the cluster turns rigidly). */
export function seededRail(map: MapDef, k: number, tumble = ROCK_SWITCHES.clusterTumble): [number, number, number, number, number] {
  const a = map.asteroids[k]!, c = clusterOf(map, k);
  if (c < 0) return [RockKind.Rail, a.x, a.y, 0, 0];
  const o = map.clusterCentres[c]!;
  return [tumble ? RockKind.Tumble : RockKind.Rail, o.x, o.y, a.x - o.x, a.y - o.y];
}
```

with `import { clusterOf, type MapDef } from './map';` (replacing the type-only import) and `ROCK_SWITCHES` added to the `./rockTuning` import. (map.ts imports nothing from rocks.ts, so there is no cycle.) A lane rock's ρω is |its position|, which is its lane radius to within an ulp (its offset is 0); the ω difference this leaves between rocks of one lane moves them about 5e-11 u apart in a 3-hour game.

  Add to `tests/helpers/rockArena.ts` (import `ROCK_SWITCHES` from `../../src/renderer/src/sim/tactical/rockTuning`):

```ts
/** Asteroids-iii §13.7: run `run` with some switches set, always restoring them (plan deviation 19). */
export function withSwitches(patch: Partial<typeof ROCK_SWITCHES>, run: () => void): void {
  const saved = { ...ROCK_SWITCHES };
  Object.assign(ROCK_SWITCHES, patch);
  try { run(); } finally { Object.assign(ROCK_SWITCHES, saved); }
}
```

- [ ] **Step 5: `mapHash` covers the new fields.** In `src/renderer/src/sim/duel/hash.ts` change `v.push(map.beltCount, ...map.clusterSizes, ...map.gaps);` to `v.push(map.beltCount, ...map.clusterSizes, ...map.laneSizes, ...map.clusterRho, ...map.clusterCentres.flatMap((c) => [c.x, c.y]), ...map.gaps);`.

- [ ] **Step 5b: The pool test follows the cluster rails.** In `tests/rockPool.test.ts`, first test, replace `expect(v).toEqual([RockKind.Rail, a.x, a.y, 0, 0, a.r, rockHp(a.r), 0]);   // Task 5 turns cluster rocks into centre + offset` with `expect(v).toEqual([...seededRail(st.map, k), a.r, rockHp(a.r), 0]);   // §13.1: lane rocks Rail on themselves, cluster rocks Tumble on their centre` and add `seededRail` to its `rocks` import; rename the test to `'has 160 reserve slots of 8 values; every seeded rock is a rail at t = 0 with full hp'`. The `rockAt` lines of the same test still hold (at tick 0 centre + offset is the rock's own position to within 1e-9).

- [ ] **Step 6: Run the tests**

Run: `npm run typecheck && npx vitest run tests/tacticalMap.test.ts tests/rockPool.test.ts tests/rockContacts.test.ts tests/rockShips.test.ts tests/rockLaser.test.ts tests/rockBreak.test.ts tests/boundary.test.ts`
Expected: typecheck clean (no test or script builds a `MapDef` literal; the tests that spread `{ ...t.map, asteroids: [] }` keep the new fields and `initRocks` then loops over no asteroids); all listed tests PASS, including the existing "every seed from 1 to 200 gives a valid map" and "is a pure function of the seed".

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/map.ts src/renderer/src/sim/tactical/rocks.ts src/renderer/src/sim/duel/hash.ts tests/tacticalMap.test.ts tests/helpers/rockArena.ts tests/rockPool.test.ts
git commit -m "feat(asteroids-iii): the belt as three lanes and clusters 420 apart in ρ; lane rocks Rail on themselves, cluster rocks Tumble on their centre (spec §3.5, §13.1)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Free-rock motion: the age-ramped symmetric drag toward V*, the cap counter, the soft edge

**Files:**
- Modify: `src/renderer/src/sim/tactical/rockContacts.ts` (imports; new exported `settleRate`, `rockEdgeAccel`, `rockEdgeSlack`, `moveFreeSlot`; part 1 of `stepRocks`; the edge test)
- Modify: `src/renderer/src/sim/tactical/rockTuning.ts` (delete `ROCK_DRAG`; reword the `ROCK_GRAVITY` block's comment)
- Modify: `tests/rockContacts.test.ts` (delete the two spike ii motion tests)
- Test: `tests/rockMotion.test.ts`

**Interfaces:**
- Consumes: `gravityAccel(x, y): [number, number]` (physics.ts); `circularVelocity`, `targetVelocity` (rails.ts, Task 3); `SETTLE_K_MAX`, `SETTLE_A0`, `SETTLE_A1`, `K_EDGE_ROCK`, `EDGE_SETTLE_K`, `ROCK_EDGE_SLACK`, `ROCK_EDGE_SLACK_SOFT`, `ROCK_GRAVITY`, `ROCK_MAX_SPEED`, `ROCK_SWITCHES` (rockTuning.ts); `K_EDGE`, `R_MAP`, `DT` (tactical tuning.ts); `TICK_HZ` (`sim/tuning.ts`); `rockPhase` (rocks.ts); `withSwitches` (tests/helpers/rockArena.ts, Task 5).
- Produces (rockContacts.ts): `settleRate(ageTicks: number): number` (§13.3's k); `rockEdgeAccel(x: number, y: number, soft?: boolean): [number, number]`; `rockEdgeSlack(soft?: boolean): number` (700 soft, 400 not); `moveFreeSlot(v: Float64Array, b: number, T1: number, soft?: boolean): boolean` — one tick of §13.3 for the slot at base `b` of `v`, its age `T1 − t`; returns whether the speed cap fired. `stepRocks` counts `s.rockCapHits`. Task 12's path predictor calls `moveFreeSlot` on a copy.

- [ ] **Step 1: Write the failing test** `tests/rockMotion.test.ts`:

```ts
// Asteroids-iii §4, §13.3, §8.1 (motion): a symmetric (Strang) tick: drift, half drag toward V*, kick, half drag, cap,
// drift; the drag ramps with age (0 before 20 s, 0.06/s from 60 s); the soft edge (on and off); the cap counter; the
// planet and the far slack turn rocks to dust.
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { circularVelocity, targetVelocity } from '../src/renderer/src/sim/tactical/rails';
import { moveFreeSlot, rockEdgeAccel, rockEdgeSlack, settleRate, stepRocks } from '../src/renderer/src/sim/tactical/rockContacts';
import { rockAlive, rockAt, RockKind, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { ROCK_EDGE_SLACK, ROCK_EDGE_SLACK_SOFT } from '../src/renderer/src/sim/tactical/rockTuning';
import { DT, GM, GRAVITY_EPS, K_EDGE, R_MAP } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { arena, mover, rockEvents, withSwitches } from './helpers/rockArena';

/** A lone free rock slot (kind, x, y, vx, vy, r, hp, t) at (x, y), velocity V_c plus (dvx, dvy), clock t. */
function slot(x: number, y: number, dvx = 0, dvy = 0, t = 0): Float64Array {
  const [cx, cy] = circularVelocity(x, y);
  return Float64Array.from([RockKind.Free, x, y, cx + dvx, cy + dvy, 10, 1, t]);
}
const energy = (v: Float64Array): number => 0.5 * (v[3]! * v[3]! + v[4]! * v[4]!) - GM / Math.sqrt(v[1]! * v[1]! + v[2]! * v[2]! + GRAVITY_EPS * GRAVITY_EPS);
/** The crew parked on a circular orbit at ρ 2750 on the far side, so it meets nothing in a long run. */
function safeCrew(st: ReturnType<typeof arena>): void {
  const [vx, vy] = circularVelocity(-2750, 0);
  Object.assign(st.ships[0], { x: -2750, y: 0, vx, vy, heading: 0, headingAcc: 0 });
}

describe('free-rock motion (spec §13.3)', () => {
  it('the drag ramps with age: 0 to 20 s, linear to 0.06/s at 60 s, then flat', () => {
    expect([settleRate(0), settleRate(20 * 60), settleRate(40 * 60), settleRate(60 * 60), settleRate(600 * 60)]).toEqual([0, 0, 0.03, 0.06, 0.06]);
  });
  it('is drift, half drag toward V*, kick, half drag, cap, drift', () => {
    const v = slot(0, 1500, 7, -3, 0), T1 = 50 * 60, k = settleRate(T1), x0 = v[1]!, y0 = v[2]!;
    let vx = v[3]!, vy = v[4]!;
    moveFreeSlot(v, 0, T1);
    const hx = x0 + vx * DT / 2, hy = y0 + vy * DT / 2, [gx, gy] = gravityAccel(hx, hy), [tx, ty] = targetVelocity(hx, hy);
    vx += (tx - vx) * k * DT / 2; vy += (ty - vy) * k * DT / 2;
    vx += gx * DT; vy += gy * DT;
    vx += (tx - vx) * k * DT / 2; vy += (ty - vy) * k * DT / 2;
    expect(v[3]).toBeCloseTo(vx, 12); expect(v[4]).toBeCloseTo(vy, 12);
    expect(v[1]).toBeCloseTo(hx + vx * DT / 2, 12); expect(v[2]).toBeCloseTo(hy + vy * DT / 2, 12);
  });
  it('caps the speed at 300 before the second drift and reports it; stepRocks counts rockCapHits', () => {
    const v = Float64Array.from([RockKind.Free, 0, 2000, 400, 0, 10, 1, 0]);
    expect(moveFreeSlot(v, 0, 0)).toBe(true);
    expect(Math.hypot(v[3]!, v[4]!)).toBeLessThanOrEqual(300 + 1e-9);
    expect(v[1]! - 400 * DT / 2).toBeCloseTo(v[3]! * DT / 2, 12);
    expect(moveFreeSlot(slot(0, 1500), 0, 0)).toBe(false);
    const st = arena();
    mover(st, 100, 0, 2000, 400, 0, 10);
    stepRocks(st);
    expect(st.rockCapHits).toBe(1);
  });
  it('with no drag (age under 20 s) its relative energy error stays under 1e-6 over 100 orbits at ρ 1700', () => {
    const v = slot(1700, 0), e0 = energy(v), period = (2 * Math.PI) / Math.sqrt(GM / Math.pow(1700 * 1700 + 400, 1.5));
    let worst = 0;
    for (let n = 0, ticks = Math.round((100 * period) / DT); n < ticks; n++) { moveFreeSlot(v, 0, 0); if (n % 1000 === 0) worst = Math.max(worst, Math.abs((energy(v) - e0) / e0)); }
    expect(worst).toBeLessThan(1e-6);
  });
  it('a circular orbit outside the lane zones is a fixed point to second order: ρ drifts under 0.1 u in 10 minutes with the full drag on', () => {
    const v = slot(0, -1700, 0, 0, -3600);   // 60 s old at T1 = 0: k = 0.06
    let worst = 0;
    for (let n = 0; n < 600 * 60; n++) { moveFreeSlot(v, 0, 0); worst = Math.max(worst, Math.abs(Math.hypot(v[1]!, v[2]!) - 1700)); }
    expect(worst).toBeLessThan(0.1);
  });
  it('the soft edge (§13.3): K_EDGE_ROCK and the slack 700 when on; K_EDGE and 400 when off', () => {
    const [ex] = rockEdgeAccel(R_MAP + 100, 0, true), [hx] = rockEdgeAccel(R_MAP + 100, 0, false);
    expect(ex).toBeCloseTo(-0.25 * 100, 12); expect(hx).toBeCloseTo(-K_EDGE * 100, 12);
    expect([rockEdgeSlack(true), rockEdgeSlack(false)]).toEqual([ROCK_EDGE_SLACK_SOFT, ROCK_EDGE_SLACK]);
    expect(rockEdgeAccel(R_MAP - 1, 0, true)).toEqual([0, 0]);
  });
  for (const soft of [true, false]) it(`a rock thrown out past the edge comes back and is not turned to dust (soft edge ${soft ? 'on' : 'off'})`, () => {
    withSwitches({ softEdge: soft }, () => {
      const st = arena(); safeCrew(st);
      const [cx, cy] = circularVelocity(0, 2700);
      mover(st, 100, 0, 2700, cx, cy + 60, 10);   // y down: +y is outward here
      let far = 0;
      for (let t = 0; t < 120 * 60; t++) { stepDuel(st, IDLE_INPUT); far = Math.max(far, Math.hypot(rockAt(st, 100).x, rockAt(st, 100).y)); }
      expect(rockAlive(st, 100)).toBe(true);
      expect(far).toBeGreaterThan(R_MAP);
      expect(far).toBeLessThan(R_MAP + rockEdgeSlack(soft));
      expect(Math.hypot(rockAt(st, 100).x, rockAt(st, 100).y)).toBeLessThan(R_MAP);
    });
  });
  it('touching the planet turns a rock to dust; so does a centre past R_MAP + the slack; R_MAP + 10 does not', () => {
    const st = arena();
    mover(st, 100, 0, -85, 0, 0, 20);
    mover(st, 101, R_MAP + ROCK_EDGE_SLACK_SOFT + 5, 0, 0, 0, 10);
    mover(st, 102, -(R_MAP + 10), 0, 0, 0, 10);
    stepRocks(st);
    expect([rockAlive(st, 100), rockAlive(st, 101), rockAlive(st, 102)]).toEqual([false, false, true]);
    expect(rockEvents(st, 'dust').map((e) => [e.rock, e.by])).toEqual([[100, 'planet'], [101, 'edge']]);
  });
  it('a rock born this tick does not move', () => {
    const st = arena();
    mover(st, 102, 0, 2000, 50, 0, 10); st.rockBorn[102] = 1;
    stepRocks(st);
    expect(Array.from(st.rocks.subarray(102 * ROCK_STRIDE + 1, 102 * ROCK_STRIDE + 5))).toEqual([0, 2000, 50, 0]);
  });
});
```

(Planning simulations of this integrator: a rock thrown 60 u/s outward from ρ 2700 peaks at ρ 2881 with the soft edge and 2842 without, and is back inside R_MAP within 2 minutes either way; the 10-minute ρ drift at 1700 with full drag is 0.001 u. Inside a lane zone the same check drifts tens of units: see plan deviation 20.)

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/rockMotion.test.ts`
Expected: FAIL (`moveFreeSlot` is not exported).

- [ ] **Step 3: The motion.** In `src/renderer/src/sim/tactical/rockContacts.ts`:
  - Replace the imports from `./physics`, `./rockTuning` and `./tuning` with:

```ts
import { gravityAccel } from './physics';
import { circularVelocity, targetVelocity } from './rails';
import { EDGE_SETTLE_K, K_EDGE_ROCK, ROCK_CRUSH_SPEED, ROCK_EDGE_SLACK, ROCK_EDGE_SLACK_SOFT, ROCK_GRAVITY, ROCK_MAX_SPEED, ROCK_RESTITUTION, ROCK_SWITCHES, SETTLE_A0, SETTLE_A1, SETTLE_K_MAX } from './rockTuning';
import { DT, K_EDGE, R_MAP } from './tuning';
import { TICK_HZ } from '../tuning';
```

  and add `rockPhase` to the `./rocks` import.
  - Add before `stepRocks`:

```ts
/** §13.3: the settling drag's rate for a rock `ageTicks` old (since its last birth, freeing or push): 0 before SETTLE_A0
 *  seconds, rising linearly to SETTLE_K_MAX at SETTLE_A1, flat after. A young piece flies a true gravity path. */
export function settleRate(ageTicks: number): number {
  const f = (ageTicks / TICK_HZ - SETTLE_A0) / (SETTLE_A1 - SETTLE_A0);
  return SETTLE_K_MAX * Math.min(1, Math.max(0, f));
}
/** §13.3: the rocks' edge spring past R_MAP: K_EDGE_ROCK with the soft edge, the ships' K_EDGE without; zero inside. */
export function rockEdgeAccel(x: number, y: number, soft = ROCK_SWITCHES.softEdge): [number, number] {
  const d = Math.sqrt(x * x + y * y);
  if (d <= R_MAP) return [0, 0];
  const k = (-(soft ? K_EDGE_ROCK : K_EDGE) * (d - R_MAP)) / d;
  return [k * x, k * y];
}
/** §13.3: the far-edge safety slack past R_MAP (a free rock past R_MAP + this turns to dust, 'edge'). */
export function rockEdgeSlack(soft = ROCK_SWITCHES.softEdge): number { return soft ? ROCK_EDGE_SLACK_SOFT : ROCK_EDGE_SLACK; }
/**
 * §13.3: one tick of a free rock's motion, the slot at base b of v, its age T1 − t: (1) drift p += v·DT/2; (2) half drag
 * v += (V* − v)·k·DT/2 (and, with the soft edge past R_MAP, + (V_c − v)·EDGE_SETTLE_K·DT/2); (3) kick v += (g·ROCK_GRAVITY +
 * e_rock)·DT; (4) the same half drag again; (5) the ROCK_MAX_SPEED cap; (6) drift p += v·DT/2. V*, V_c, g and e_rock are
 * taken once, at the half-drift point. Returns whether the cap fired (rockCapHits; the stress gate is 0).
 */
export function moveFreeSlot(v: Float64Array, b: number, T1: number, soft = ROCK_SWITCHES.softEdge): boolean {
  const h = DT / 2, k = settleRate(T1 - v[b + 7]!), x = v[b + 1]! + v[b + 3]! * h, y = v[b + 2]! + v[b + 4]! * h;
  const [gx, gy] = gravityAccel(x, y), [ex, ey] = rockEdgeAccel(x, y, soft), [tx, ty] = targetVelocity(x, y);
  const out = soft && x * x + y * y > R_MAP * R_MAP, [cx, cy] = out ? circularVelocity(x, y) : [0, 0], ke = out ? EDGE_SETTLE_K : 0;
  let vx = v[b + 3]!, vy = v[b + 4]!;
  vx += (tx - vx) * k * h; vy += (ty - vy) * k * h; vx += (cx - vx) * ke * h; vy += (cy - vy) * ke * h;
  vx += (gx * ROCK_GRAVITY + ex) * DT; vy += (gy * ROCK_GRAVITY + ey) * DT;
  vx += (tx - vx) * k * h; vy += (ty - vy) * k * h; vx += (cx - vx) * ke * h; vy += (cy - vy) * ke * h;
  const sp = Math.sqrt(vx * vx + vy * vy), capped = sp > ROCK_MAX_SPEED;
  if (capped) { const f = ROCK_MAX_SPEED / sp; vx *= f; vy *= f; }
  v[b + 1] = x + vx * h; v[b + 2] = y + vy * h; v[b + 3] = vx; v[b + 4] = vy;
  return capped;
}
```

  (With `out` false, `ke` is 0 and the edge-drag terms add exactly 0.)
  - In `stepRocks`, the first line becomes `const v = s.rocks, n = rockSlots(s), T1 = rockPhase(s);` and part 1's body (from `const [gx, gy] = gravityAccel(...)` through `v[b + 1]! += vx * DT; v[b + 2]! += vy * DT;`) becomes `if (moveFreeSlot(v, b, T1)) s.rockCapHits++;`. Plan deviation 8: running the sub-steps rock by rock gives the same values as step by step, because free motion never reads another rock.
  - In part 2, `const p = s.map.planet;` becomes `const p = s.map.planet, far = R_MAP + rockEdgeSlack();` and `x * x + y * y > R_MAP * R_MAP` becomes `x * x + y * y > far * far` (§4, §13.3: the far-edge safety rule, `'edge'` dust; the stress run counts it).
  - Update the header comment's part 1 line to: `Part 1, motion: every Free rock not born this tick, ascending, by moveFreeSlot (§13.3: the symmetric age-ramped drag toward V*, the soft edge, the cap, counted in rockCapHits). Then rocksMoved: free rocks now stand at tick + 1. A rock touching the planet, or past R_MAP + rockEdgeSlack(), turns to dust at the start of its contact turn.`
- In `rockTuning.ts` delete `ROCK_DRAG` and change that block's comment to `/** Spike ii §3.2, asteroids-iii §13.3: rock gravity as a share of the ships', and the speed cap (u/s), a safety net counted in rockCapHits. */`.

- [ ] **Step 4: Replace the two spike ii motion tests** in `tests/rockContacts.test.ts`: delete `'gravity, then drag, then the 300 u/s cap, then semi-implicit Euler; a rock born this tick does not move'` and `'a rock touching the planet, or whose centre leaves the map, turns to dust'` (rewritten in `tests/rockMotion.test.ts`; spec §11: edge dust at R_MAP is gone). Remove `gravityAccel` and `DT` from its imports if nothing else there uses them.

- [ ] **Step 5: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockMotion.test.ts tests/rockContacts.test.ts tests/rockBlast.test.ts tests/rockMaskBetweenTicks.test.ts tests/boundary.test.ts`
Expected: PASS. `rockBlast`'s homing test flies its young rock with no drag and still hits.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/tactical/rockContacts.ts src/renderer/src/sim/tactical/rockTuning.ts tests/rockMotion.test.ts tests/rockContacts.test.ts
git commit -m "feat(asteroids-iii): free rocks: a symmetric step with an age-ramped drag toward V*, the soft edge and its slack, the cap counted in rockCapHits (spec §4, §13.3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The rock grid

**Files:**
- Modify: `src/renderer/src/sim/tactical/grid.ts` (append the rock grid)
- Modify: `src/renderer/src/sim/tactical/rocks.ts` (`beginRockStep` rebuilds; `rebuildRockGrid`, `regridRock`, `rocksNearGrid`; `rocksNear` picks; `freeRock` relinks)
- Modify: `src/renderer/src/sim/tactical/rockContacts.ts` (relink after motion and separation)
- Modify: `src/renderer/src/sim/tactical/rockBreak.ts` (`breakRock` links each piece at birth)
- Modify: `src/renderer/src/sim/tactical/contacts.ts` (`shipRock` relinks the rock after its separation)
- Create: `tests/helpers/rockStress.ts`
- Test: `tests/rockGrid.test.ts`

**Interfaces:**
- Consumes: `ROCK_GRID_CELL`, `ROCK_GRID_PAD`, `ROCK_R_MAX`, `ROCK_EDGE_SLACK_SOFT` (rockTuning.ts); `R_MAP` (tuning.ts); the accessors (rocks.ts).
- Produces (grid.ts): `export interface RockGrid { cols: number; origin: number; head: Int32Array; next: Int32Array; cell: Int32Array; scratch: Int32Array }`; `emptyRockGrid(key: object, slots: number): RockGrid`; `peekRockGrid(key: object): RockGrid | undefined`; `linkRock(g: RockGrid, k: number, x: number, y: number): void`; `queryRockGrid(g: RockGrid, x: number, y: number, h: number): number` (count written into `g.scratch`, ascending).
- Produces (rocks.ts): `rebuildRockGrid(s): void`; `regridRock(s, k): void` (relinks slot k at its accessor position, inside a step only); `rocksNearGrid(s, x, y, h): number[]`; `rocksNear` uses the grid inside a step and `rocksNearScan` outside; `beginRockStep` now rebuilds the grid.
- Produces (tests/helpers/rockStress.ts): `switchOff(st: TacticalState, i: number): void`; `headingTo(x: number, y: number, tx: number, ty: number): number`; `parkCoOrbit(st: TacticalState, k: number, gap?: number): void`; `nearestRock(st: TacticalState, dist: (a: RockView) => number, within: number): number`; `biggestBelt(st: TacticalState): number`; `stressInput(st: TacticalState): ShipInput`. Task 13's measure script imports them.

- [ ] **Step 1: Write the stress rigs** `tests/helpers/rockStress.ts`:

```ts
// Asteroids-iii stress rigs (tests and scripts/spike-asteroids-iii-measure.ts): the Hunter switched off as an inactive
// slot holds it, the crew parked on a circular orbit outward of a rock, and spike ii's stress driver (a rock-targeted
// torpedo every 10 s, the laser at the nearest rock whenever charged). Script-side writes, identical in twin runs.
import { circularVelocity } from '../../src/renderer/src/sim/tactical/rails';
import { rockAlive, rockAt, rockSlots, type RockView } from '../../src/renderer/src/sim/tactical/rocks';
import { classOf, missileOf, type TacticalState } from '../../src/renderer/src/sim/tactical/state';
import { IDLE_INPUT, laserFull, type ShipInput } from '../../src/renderer/src/sim/tactical/weapons';

/** Switch slot i off as an inactive slot holds it (zeros): it neither thinks nor collides, and validation accepts it. */
export function switchOff(st: TacticalState, i: number): void {
  const ship = st.ships[i]!, sys = st.systems[i]! as unknown as Record<string, unknown>;
  Object.assign(ship, { active: false, x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0 });
  ship.graceUntil.fill(0);
  for (const key of Object.keys(sys)) sys[key] = Array.isArray(sys[key]) ? (sys[key] as number[]).map(() => 0) : typeof sys[key] === 'boolean' ? false : 0;
}
/** The heading index (0 north, 64 east) nearest the bearing from (x, y) to (tx, ty). Test-side trigonometry. */
export const headingTo = (x: number, y: number, tx: number, ty: number): number => ((Math.round((Math.atan2(tx - x, -(ty - y)) / (2 * Math.PI)) * 256) % 256) + 256) % 256;
/** Park ship 0 `gap` u outward of rock k (away from the planet) on a circular orbit there, facing the rock. */
export function parkCoOrbit(st: TacticalState, k: number, gap = 300): void {
  const a = rockAt(st, k), d = Math.hypot(a.x, a.y), x = a.x + (a.x / d) * gap, y = a.y + (a.y / d) * gap, [vx, vy] = circularVelocity(x, y);
  Object.assign(st.ships[0], { x, y, vx, vy, heading: headingTo(x, y, a.x, a.y), headingAcc: 0 });
}
/** The live rock with the least `dist`, at most `within` (−1 when none). */
export function nearestRock(st: TacticalState, dist: (a: RockView) => number, within: number): number {
  let best = -1, bd = Infinity;
  for (let k = 0; k < rockSlots(st); k++) { if (!rockAlive(st, k)) continue; const d = dist(rockAt(st, k)); if (d <= within && d < bd) { best = k; bd = d; } }
  return best;
}
/** The largest live rock among the belt's slots (−1 when none). */
export function biggestBelt(st: TacticalState): number {
  let best = -1;
  for (let k = 0; k < st.map.beltCount; k++) if (rockAlive(st, k) && (best < 0 || rockAt(st, k).r > rockAt(st, best).r)) best = k;
  return best;
}
/** The stress driver's crew input this tick: every 10 s a rock-targeted torpedo (the magazine topped up; parked
 *  co-orbiting outward of the biggest belt rock when nothing is in range), the hull kept full, and the laser turned onto
 *  the nearest rock whenever it is charged and has no rock target. */
export function stressInput(st: TacticalState): ShipInput {
  const sys = st.systems[0]!, me = st.ships[0]!, input: ShipInput = { ...IDLE_INPUT, rockLock: { laser: null, torpedo: null } };
  sys.hull = classOf(st, 0).hull;
  if (st.tick % 600 === 0 && !missileOf(st, 0)) {
    sys.magazine = classOf(st, 0).slots.missile.magazine;
    let k = nearestRock(st, (a) => Math.hypot(a.x - me.x, a.y - me.y), classOf(st, 0).slots.missile.range);
    if (k < 0) { k = biggestBelt(st); if (k >= 0) parkCoOrbit(st, k); }
    if (k >= 0) input.rockLock.torpedo = k;
  }
  const laser = classOf(st, 0).slots.laser;
  if (laser && sys.laserBurst === 0 && laserFull(st, 0) && sys.laserRock < 0) {
    const k = nearestRock(st, (a) => Math.hypot(a.x - me.x, a.y - me.y) - a.r, laser.range);
    if (k >= 0) { const a = rockAt(st, k); me.heading = headingTo(me.x, me.y, a.x, a.y); me.headingAcc = 0; input.rockLock.laser = k; }
  }
  return input;
}
```

- [ ] **Step 2: Write the failing test** `tests/rockGrid.test.ts`:

```ts
// Asteroids-iii §6.1, §8.1 (grid): the rock grid finds exactly what a brute-force scan finds while rocks turn, fly, break
// and rejoin; it is rebuilt into the same typed arrays every tick, kept per state object, and links pieces at birth.
import { describe, expect, it } from 'vitest';
import { cloneTactical, createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { peekRockGrid } from '../src/renderer/src/sim/tactical/grid';
import { breakRock } from '../src/renderer/src/sim/tactical/rockBreak';
import { beginRockStep, beginRockTick, endRockStep, rockAlive, RockKind, rocksNearGrid, rockSlots, ROCK_STRIDE, rockX, rockY } from '../src/renderer/src/sim/tactical/rocks';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { stressInput, switchOff } from './helpers/rockStress';
import { mover, rockEvents } from './helpers/rockArena';

describe('the rock grid (spec §6.1)', () => {
  it('equals a brute-force scan for every live rock on every tick of 20 seeded stress runs (200 ticks each, plan deviation 18)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const st = createTacticalState(seed), wrong: string[] = [];
      switchOff(st, 1);
      let broken = 0;
      for (let k = 0; k < st.map.asteroids.length && broken < 6; k++) if (st.map.asteroids[k]!.r >= 40) { breakRock(st, k, 1, 0, 'torpedo', 0, 'burst'); broken++; }
      beginRockTick(st);
      for (let t = 0; t < 200; t++) {
        stepDuel(st, stressInput(st));
        const n = rockSlots(st), live: number[] = [], xs = new Float64Array(n), ys = new Float64Array(n), rs = new Float64Array(n);
        for (let k = 0; k < n; k++) if (rockAlive(st, k)) { live.push(k); xs[k] = rockX(st, k); ys[k] = rockY(st, k); rs[k] = st.rocks[k * ROCK_STRIDE + 5]!; }
        for (const k of live) {
          const brute = live.filter((j) => Math.abs(xs[j]! - xs[k]!) <= rs[k]! + rs[j]! && Math.abs(ys[j]! - ys[k]!) <= rs[k]! + rs[j]!).join(',');
          const grid = rocksNearGrid(st, xs[k]!, ys[k]!, rs[k]!).join(',');
          if (grid !== brute) wrong.push(`tick ${st.tick} rock ${k}: grid ${grid} brute ${brute}`);
        }
      }
      expect(wrong, `seed ${seed}`).toEqual([]);
    }
  }, 120000);
  it('is rebuilt into the same typed arrays every tick, kept per state object and never copied by a clone', () => {
    const st = createTacticalState(4);
    stepDuel(st, IDLE_INPUT);
    const g = peekRockGrid(st)!, arrays = [g.head, g.next, g.cell, g.scratch];
    for (let t = 0; t < 100; t++) stepDuel(st, IDLE_INPUT);
    const h = peekRockGrid(st)!;
    expect(h).toBe(g);
    [h.head, h.next, h.cell, h.scratch].forEach((a, i) => expect(a).toBe(arrays[i]));
    expect(peekRockGrid(cloneTactical(st))).toBeUndefined();
  });
  it('links a piece born mid-step at its birth position, and finds a rock far past the edge', () => {
    const st = createTacticalState(4);
    beginRockStep(st);
    const big = st.map.asteroids.findIndex((a) => a.r >= 40);
    breakRock(st, big, 0, 1, 'torpedo', 0, 'burst');
    for (const p of rockEvents(st, 'split')[0]!.pieces!) expect(rocksNearGrid(st, rockX(st, p), rockY(st, p), 1)).toContain(p);
    endRockStep(st);
    const far = createTacticalState(4), slot = rockSlots(far) - 1;
    mover(far, slot, 3600, 0, 0, 0, 10);   // past the grid's reach (3560): clamped into an edge cell
    beginRockStep(far);
    expect(rocksNearGrid(far, 3600, 0, 5)).toEqual([slot]);
    endRockStep(far);
    expect(far.rocks[slot * ROCK_STRIDE]).toBe(RockKind.Free);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run tests/rockGrid.test.ts`
Expected: FAIL (`peekRockGrid` and `rocksNearGrid` are not exported).

- [ ] **Step 4: The grid.** Append to `src/renderer/src/sim/tactical/grid.ts` (and add `import { ROCK_EDGE_SLACK_SOFT, ROCK_GRID_CELL, ROCK_R_MAX } from './rockTuning';` and `R_MAP` to its tuning import):

```ts

// Asteroids-iii §6.1: the rock pool's broad phase, replacing the seeded never-rebuilt grid for rocks. A uniform grid of
// ROCK_GRID_CELL cells over ±(R_MAP + ROCK_EDGE_SLACK_SOFT + ROCK_R_MAX), built into reused typed arrays (cell heads and next
// links) and kept in a WeakMap keyed by the state object, so it is never hashed, snapshotted or copied by a clone. Each
// live rock is linked into the one cell holding its centre; a query widens its box by ROCK_R_MAX plus the pad and writes
// the slots it finds into the reused scratch, ascending by insertion sort (a slot sits in one cell: no repeats).
export interface RockGrid { cols: number; origin: number; head: Int32Array; next: Int32Array; cell: Int32Array; scratch: Int32Array }
const rockGrids = new WeakMap<object, RockGrid>();
const ROCK_GRID_REACH = R_MAP + ROCK_EDGE_SLACK_SOFT + ROCK_R_MAX;
function rockCell(g: RockGrid, v: number): number { return Math.min(g.cols - 1, Math.max(0, Math.floor((v - g.origin) / ROCK_GRID_CELL))); }
/** `key`'s grid for a pool of `slots`, emptied (every head, link and cell −1); made once per key and size, then reused. */
export function emptyRockGrid(key: object, slots: number): RockGrid {
  let g = rockGrids.get(key);
  if (!g || g.next.length !== slots) {
    const cols = Math.ceil((2 * ROCK_GRID_REACH) / ROCK_GRID_CELL);
    g = { cols, origin: -ROCK_GRID_REACH, head: new Int32Array(cols * cols), next: new Int32Array(slots), cell: new Int32Array(slots), scratch: new Int32Array(slots) };
    rockGrids.set(key, g);
  }
  g.head.fill(-1); g.next.fill(-1); g.cell.fill(-1);
  return g;
}
export function peekRockGrid(key: object): RockGrid | undefined { return rockGrids.get(key); }
/** Link slot k into the cell holding (x, y), first unlinking it from the cell it was in. */
export function linkRock(g: RockGrid, k: number, x: number, y: number): void {
  const old = g.cell[k]!;
  if (old >= 0) {
    let prev = -1, at = g.head[old]!;
    while (at >= 0 && at !== k) { prev = at; at = g.next[at]!; }
    if (at === k) { if (prev < 0) g.head[old] = g.next[k]!; else g.next[prev] = g.next[k]!; }
  }
  const c = rockCell(g, y) * g.cols + rockCell(g, x);
  g.next[k] = g.head[c]!; g.head[c] = k; g.cell[k] = c;
}
/** Every slot linked into a cell the square about (x, y) of half-size h touches, into g.scratch ascending; the count. */
export function queryRockGrid(g: RockGrid, x: number, y: number, h: number): number {
  const x0 = rockCell(g, x - h), x1 = rockCell(g, x + h), y0 = rockCell(g, y - h), y1 = rockCell(g, y + h), out = g.scratch;
  let n = 0;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) for (let k = g.head[cy * g.cols + cx]!; k >= 0; k = g.next[k]!) {
    let j = n++;
    while (j > 0 && out[j - 1]! > k) { out[j] = out[j - 1]!; j--; }
    out[j] = k;
  }
  return n;
}
```

Update the file's first comment line to `// Broad phase (spec §4): a fixed uniform grid over the static asteroids, built once per map (the flight view's seeded map). Asteroids-iii: the rock pool's own grid below.`

- [ ] **Step 5: Wire it in `rocks.ts`.** Add `import { emptyRockGrid, linkRock, peekRockGrid, queryRockGrid } from './grid';`, add `ROCK_GRID_PAD, ROCK_R_MAX` to the `./rockTuning` import, then:
  - `beginRockStep` becomes:

```ts
/** The start of a stepDuel tick: rails are read at tick + 1 until endRockStep, and the rock grid is rebuilt at the step
 *  phase (rails at T + 1, free rocks before their motion; §6.1). */
export function beginRockStep(s: TacticalState): void { steps.set(s, { moved: false }); rebuildRockGrid(s); }
```

  - `freeRock`: after `markTouched(s, k);` add `regridRock(s, k);` (a rail freed before the motion pass moves back one tick's arc).
  - Replace `rocksNear` with, and add after `rocksNearScan`:

```ts
/** §6.1: the grid rebuilt from every live rock's accessor position (allocation-free after the first build). */
export function rebuildRockGrid(s: TacticalState): void {
  const n = rockSlots(s), g = emptyRockGrid(s, n);
  for (let k = 0; k < n; k++) if (s.rocks[k * ROCK_STRIDE] !== RockKind.Gone) linkRock(g, k, rockX(s, k), rockY(s, k));
}
/** §6.1, plan deviation 6: slot k relinked at its accessor position (a birth, a freeing, a move); inside a step only. */
export function regridRock(s: TacticalState, k: number): void {
  const g = peekRockGrid(s);
  if (g && inRockStep(s) && g.next.length === rockSlots(s)) linkRock(g, k, rockX(s, k), rockY(s, k));
}
/** rocksNearScan's answer from the grid (its box widened by ROCK_R_MAX and the pad, then the exact bounding-box rule at the
 *  accessor positions); a scan when there is no grid of this pool's size. */
export function rocksNearGrid(s: TacticalState, x: number, y: number, h: number): number[] {
  const g = peekRockGrid(s);
  if (!g || g.next.length !== rockSlots(s)) return rocksNearScan(s, x, y, h);
  const v = s.rocks, out: number[] = [], count = queryRockGrid(g, x, y, h + ROCK_R_MAX + ROCK_GRID_PAD);
  for (let i = 0; i < count; i++) {
    const k = g.scratch[i]!, b = k * ROCK_STRIDE;
    if (v[b] === RockKind.Gone) continue;
    const r = v[b + 5]!;
    if (Math.abs(rockX(s, k) - x) <= h + r && Math.abs(rockY(s, k) - y) <= h + r) out.push(k);
  }
  return out;
}
/** The broad phase every caller uses: ascending, no repeats; the grid inside a step, a scan of every slot outside (§6.1). */
export function rocksNear(s: TacticalState, x: number, y: number, h: number): number[] {
  return inRockStep(s) ? rocksNearGrid(s, x, y, h) : rocksNearScan(s, x, y, h);
}
```

  Update the header comment: replace `(Task 7 gives the step its grid)` wording if present and add a line `// Broad phase (§6.1): the rock grid (grid.ts), rebuilt at beginRockStep and kept current by regridRock; a scan outside a step.`
- In `rockContacts.ts`: add `regridRock` to the `./rocks` import; in `stepRocks` part 1 add `regridRock(s, k);` right after the line `if (moveFreeSlot(v, b, T1)) s.rockCapHits++;`; in `resolveRockPair`, inside `if (overlap > 0) { ... }`, after the four position updates add `regridRock(s, a); regridRock(s, b);`.
- In `rockBreak.ts`: add `regridRock` to the `./rocks` import; in `breakRock`, after `s.rockBorn[slot] = 1;` add `regridRock(s, slot);   // §6.1: a new piece is linked into the grid at birth`.
- In `contacts.ts`: add `regridRock` to the `./rocks` import; in `shipRock` after `s.x += nx * ss; s.y += ny * ss; v[b + 1]! -= nx * sk; v[b + 2]! -= ny * sk;` add `regridRock(state, k);`.

- [ ] **Step 6: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockGrid.test.ts tests/rockPool.test.ts tests/rockContacts.test.ts tests/rockMotion.test.ts tests/rockShips.test.ts tests/rockBreak.test.ts tests/rockBlast.test.ts tests/rockLaser.test.ts tests/valkyrnRoundsRocks.test.ts tests/pewRounds.test.ts tests/boundary.test.ts`
Expected: PASS. If the brute-force test reports a mismatch, the message names the tick and the two lists: find which move skipped `regridRock` (the grid must hold every live rock in the cell of its accessor position).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/grid.ts src/renderer/src/sim/tactical/rocks.ts src/renderer/src/sim/tactical/rockContacts.ts src/renderer/src/sim/tactical/rockBreak.ts src/renderer/src/sim/tactical/contacts.ts tests/helpers/rockStress.ts tests/rockGrid.test.ts
git commit -m "feat(asteroids-iii): the rock grid: 96 u cells in a WeakMap, rebuilt every step into reused typed arrays, pieces linked at birth, moves relinked (spec §6.1)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Billiards: mass r³/30, the restitution curve, e = 0 soft contacts, soft separation, the touch counter

**Files:**
- Modify: `src/renderer/src/sim/tactical/rocks.ts` (`rockMass` reads the `massCube` switch)
- Modify: `src/renderer/src/sim/tactical/rockContacts.ts` (`restitution`, `resolveRockPair`, imports, header comment)
- Modify: `tests/rockContacts.test.ts`, `tests/rockShips.test.ts` (spike ii cases pinned to r² masses run with `massCube` off; new cases)

**Interfaces:**
- Consumes: `BOUNCE_MIN`, `TOUCH_MIN`, `ROCK_SEPARATE_MAX`, `SEPARATE_SHARE`, `SEPARATE_SLOP`, `E_LOW`, `E_SPAN`, `E_RAMP`, `ROCK_MASS_DIVISOR`, `ROCK_SWITCHES` (rockTuning.ts); `restartClock`, `regridRock`, `freeRock`, `markTouched` (rocks.ts); `withSwitches` (rockArena.ts).
- Produces: `rockMass(r: number, cube = ROCK_SWITCHES.massCube): number` (`r³ / 30`, or `r²`); `restitution(vc: number): number` (rockContacts.ts); `resolveRockPair(s, a, b)` with §5.4 and §13.4's rules; `s.rockTouches`; `touch` events `{ kind: 'rock', what: 'touch', by: 'collision', rock: a, other: b, x, y, r, vx, vy, speed }`.

- [ ] **Step 1: Write the failing tests.** In `tests/rockContacts.test.ts`:
  - Add `rail` and `withSwitches` to the import from `./helpers/rockArena`, `rockMass` and `rockT` to the import from `rocks`, and `restitution` to the import from `rockContacts`.
  - Wrap the bodies of these spike ii tests in `withSwitches({ massCube: false }, () => { ... })` (their arithmetic is in r² masses; spec §13.7: each switch is tested in both states): `'conserve momentum along n (and as a vector) within 1e-9 relative'`, `'above 30 the lighter rock takes more: base (vc − 30) / 40 shared by 2·m_other / (ma + mb)'`, `'a pair is resolved once per tick, even when a later turn pushes the two back into each other'`.
  - In the momentum test replace the last line (`expect(Math.hypot(...)).toBeCloseTo(50, 9);   // separated`) with:

```ts
    // §13.4: each tick corrects 0.5 · (overlap − 0.5), shared by inverse mass (each share under the 8 u cap here)
    const d1 = Math.hypot(rockAt(st, 100).x - rockAt(st, 101).x, rockAt(st, 100).y - rockAt(st, 101).y);
    expect(d1).toBeCloseTo(d + 0.5 * (50 - d - 0.5), 9);
```

  - In `'a pair is resolved once per tick, even when a later turn pushes the two back into each other'` replace the three lines from `expect(a.x).toBeCloseTo(-32.5, 4);` through the `toBeLessThan(39)` line, and the comment above them, with:

```ts
    // Motion puts a at −29 and b at 4 (overlap 7); a's turn corrects 0.5 · (7 − 0.5) = 3.25, 1.625 each, and nothing moves
    // a again; c's turn then corrects (b, c): overlap 8.125, 3.8125 shared 9 : 1 by inverse mass (c moves 0.38125).
    expect(a.x).toBeCloseTo(-30.625, 4);
    expect(rockAt(st, 101).x).toBeCloseTo(77.88125, 4);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(39);   // left overlapping: resolved once, not twice
```

  - Add inside `describe('rock-rock pairs (spec §3.3)', ...)`:

```ts
  it('asteroids-iii §13.4: mass is r³ / 30 with massCube on (r 30 weighs the ship\'s 900), r² with it off', () => {
    expect([rockMass(30), rockMass(15), rockMass(45)]).toEqual([900, 112.5, 3037.5]);
    expect([rockMass(30, false), rockMass(15, false)]).toEqual([900, 225]);
    withSwitches({ massCube: false }, () => expect(rockMass(15)).toBe(225));
  });
  it('asteroids-iii §13.4: e = 0.3 + 0.5 · clamp((vc − 4) / 26, 0, 1) above BOUNCE_MIN', () => {
    expect([restitution(4.0001), restitution(17), restitution(30), restitution(200)].map((e) => Number(e.toFixed(6)))).toEqual([0.300002, 0.55, 0.8, 0.8]);
  });
  it('asteroids-iii §13.4: at or under BOUNCE_MIN the contact is an e = 0 impulse: the closing speed goes, momentum is kept, no clock reset', () => {
    for (const cube of [true, false]) withSwitches({ massCube: cube }, () => {
      const st = arena();
      mover(st, 100, 0, 2000, 0, 0, 20, 10, 3); mover(st, 101, 39, 2000, -3, 0, 30, 10, 7);
      const ma = rockMass(20), mb = rockMass(30), p0 = mb * -3;
      resolveRockPair(st, 100, 101);
      const va = rockAt(st, 100).vx, vb = rockAt(st, 101).vx;
      expect(va).toBeCloseTo(vb, 12);                         // no relative normal speed left
      expect(ma * va + mb * vb).toBeCloseTo(p0, 9);           // momentum kept
      expect([rockT(st, 100), rockT(st, 101), st.rockTouches]).toEqual([3, 7, 0]);
      expect([st.rockTouched[100], st.rockTouched[101]]).toEqual([1, 1]);
    });
  });
  it('asteroids-iii §13.4: above BOUNCE_MIN it bounces with the curve\'s e and restarts both clocks', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 20, 10, 3); mover(st, 101, 39, 2000, -6, 0, 20, 10, 7);
    resolveRockPair(st, 100, 101);
    const dv = ((1 + restitution(6)) * 6) / 2;   // equal masses: each changes by (1 + e) · vc / 2
    expect(rockAt(st, 100).vx).toBeCloseTo(-dv, 12);
    expect(rockAt(st, 101).vx).toBeCloseTo(-6 + dv, 12);
    expect([rockT(st, 100), rockT(st, 101)]).toEqual([st.tick, st.tick]);
  });
  it('asteroids-iii §13.4: a deep overlap corrects 0.5 · (overlap − 0.5) a tick, each rock at most ROCK_SEPARATE_MAX; under the slop nothing', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 30, 10); mover(st, 101, 10, 2000, 0, 0, 30, 10);
    resolveRockPair(st, 100, 101);
    expect([rockAt(st, 100).x, rockAt(st, 101).x]).toEqual([-8, 18]);   // 24.75 shared equally is 12.375 each, capped at 8
    const near = arena();
    mover(near, 100, 0, 2000, 0, 0, 20, 10); mover(near, 101, 39.6, 2000, 0, 0, 20, 10);   // overlap 0.4: under the slop
    resolveRockPair(near, 100, 101);
    expect([rockAt(near, 100).x, rockAt(near, 101).x]).toEqual([0, 39.6]);
  });
  it('asteroids-iii §5.4: the touch counter counts closing above TOUCH_MIN between rocks of different clocks; siblings (equal t) do not count', () => {
    const st = arena();
    mover(st, 100, 0, 2000, 0, 0, 20, 10, 3); mover(st, 101, 39, 2000, -10, 0, 20, 10, 7);
    resolveRockPair(st, 100, 101);
    expect(st.rockTouches).toBe(1);
    expect(rockEvents(st, 'touch')).toMatchObject([{ by: 'collision', rock: 100, other: 101, speed: 10 }]);
    const sib = arena();
    mover(sib, 100, 0, 2000, 0, 0, 20, 10, 5); mover(sib, 101, 39, 2000, -10, 0, 20, 10, 5);
    resolveRockPair(sib, 100, 101);
    expect([sib.rockTouches, rockEvents(sib, 'touch')]).toEqual([0, []]);
    const slow = arena();
    mover(slow, 100, 0, 2000, 0, 0, 20, 10, 3); mover(slow, 101, 39, 2000, -8, 0, 20, 10, 7);
    resolveRockPair(slow, 100, 101);
    expect(slow.rockTouches).toBe(0);   // 8 is not above TOUCH_MIN
  });
  it('asteroids-iii §5.4 (review finding 2): a free rock meets a lower-slot rail rock; the rail is freed and the touch counted', () => {
    const st = arena();
    rail(st, 3, 0, 1700, 20);
    const r3 = rockAt(st, 3);
    mover(st, 100, 38, 1700, r3.vx - 12, r3.vy, 20, 10, 5);   // overlapping, closing at 12 relative
    stepDuel(st, IDLE_INPUT);
    expect(rockAt(st, 3).kind).toBe(RockKind.Free);
    expect(st.rockTouches).toBe(1);
    expect(rockEvents(st, 'touch')).toMatchObject([{ rock: 100, other: 3 }]);
  });
```

  (Equal radii give equal masses in either mass rule, so those cases need no switch. `restitution(17)` is 0.3 + 0.5 · 13/26 = 0.55.)
  - In `tests/rockShips.test.ts` add `withSwitches` to the `./helpers/rockArena` import and wrap the bodies of `'shares the impulse by inverse mass: r 15 (m 225) against the ship (m 900) at 200 u/s'` and `'ram damage (vc − 30) / 40 · 2·900 / (900 + m) can break a rock: a bump then the break, both named for the ship'` in `withSwitches({ massCube: false }, () => { ... })`. The hull-cost table (r 15, 30, 45) and the r 44.6 rail ram keep their hull values under the cube mass (impacts 22, 100, 193 and 153 u/s give 1, 2, 4 and 3) and stay unwrapped.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run tests/rockContacts.test.ts tests/rockShips.test.ts`
Expected: FAIL (`restitution` not exported; `rockMass(15)` is 225; no touch events).

- [ ] **Step 3: The mass switch.** In `src/renderer/src/sim/tactical/rocks.ts` replace `rockMass` with:

```ts
/** Spike ii §3.1, asteroids-iii §13.4: a rock's mass (no unit): r³ / ROCK_MASS_DIVISOR with the massCube switch (r 30
 *  weighs 900, the ship's mass), r² without. */
export function rockMass(r: number, cube = ROCK_SWITCHES.massCube): number { return cube ? (r * r * r) / ROCK_MASS_DIVISOR : r * r; }
```

and add `ROCK_MASS_DIVISOR, ROCK_SWITCHES` to its `./rockTuning` import.

- [ ] **Step 4: The pair rules.** In `src/renderer/src/sim/tactical/rockContacts.ts` add `BOUNCE_MIN, E_LOW, E_RAMP, E_SPAN, ROCK_SEPARATE_MAX, SEPARATE_SHARE, SEPARATE_SLOP, TOUCH_MIN` to the `./rockTuning` import (drop `ROCK_RESTITUTION` from it) and `restartClock` to the `./rocks` import, and replace `resolveRockPair` and its doc comment with:

```ts
/** §13.4: the rock-rock restitution above BOUNCE_MIN: E_LOW + E_SPAN · clamp((vc − BOUNCE_MIN) / E_RAMP, 0, 1); 0.8 from
 *  30 u/s, falling toward 0.3 near 4 u/s, so a debris cloud calms in 2 to 3 bounces. */
export function restitution(vc: number): number { return E_LOW + E_SPAN * Math.min(1, Math.max(0, (vc - BOUNCE_MIN) / E_RAMP)); }

/**
 * Asteroids-iii §5.4, §13.4 (on spike ii §3.3): rock a and rock b touch. Each clock is read first (plan deviation 9), then
 * a rail is freed (at its rail position and velocity) so every pair is two bodies, and both are touched. Normal n from b
 * to a (zero distance: north), closing speed vc = (vb − va) · n. The overlap is corrected by SEPARATE_SHARE · max(0,
 * overlap − SEPARATE_SLOP) this tick, shared by inverse mass, each rock moving at most ROCK_SEPARATE_MAX. Above TOUCH_MIN
 * between rocks of different clocks: rockTouches + 1 and a touch event (siblings share t, so they never count). Above
 * BOUNCE_MIN: j = (1 + e(vc)) vc / (1/ma + 1/mb) and both clocks restart (a push); at or below it (and closing): an e = 0
 * impulse j = vc / (1/ma + 1/mb), momentum kept. Above ROCK_CRUSH_SPEED: rockCollisions + 1, a bump event, both amounts
 * applied (a then b), then breaks (a along n, b along −n, each with its post-bounce velocity), neither able to evict a or b.
 */
export function resolveRockPair(s: TacticalState, a: number, b: number): void {
  const v = s.rocks, A = a * ROCK_STRIDE, B = b * ROCK_STRIDE, ta = v[A + 7]!, tb = v[B + 7]!;
  freeRock(s, a); freeRock(s, b);
  markTouched(s, a); markTouched(s, b);
  const dx = v[A + 1]! - v[B + 1]!, dy = v[A + 2]! - v[B + 2]!, d = Math.sqrt(dx * dx + dy * dy);
  const nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1;
  const vc = (v[B + 3]! - v[A + 3]!) * nx + (v[B + 4]! - v[A + 4]!) * ny;
  const ra = v[A + 5]!, rb = v[B + 5]!, ma = rockMass(ra), mb = rockMass(rb), ia = 1 / ma, ib = 1 / mb;
  const fix = SEPARATE_SHARE * Math.max(0, ra + rb - d - SEPARATE_SLOP);
  if (fix > 0) {
    const sa = Math.min(ROCK_SEPARATE_MAX, (fix * ia) / (ia + ib)), sb = Math.min(ROCK_SEPARATE_MAX, (fix * ib) / (ia + ib));
    v[A + 1]! += nx * sa; v[A + 2]! += ny * sa; v[B + 1]! -= nx * sb; v[B + 2]! -= ny * sb;
    regridRock(s, a); regridRock(s, b);
  }
  if (vc > TOUCH_MIN && ta !== tb) {
    s.rockTouches++;
    s.events.push({ kind: 'rock', what: 'touch', by: 'collision', rock: a, other: b, x: v[A + 1]! - nx * ra, y: v[A + 2]! - ny * ra, r: ra, vx: v[A + 3]!, vy: v[A + 4]!, speed: vc });
  }
  if (vc > 0) {
    const bounce = vc > BOUNCE_MIN, j = ((bounce ? 1 + restitution(vc) : 1) * vc) / (ia + ib);
    v[A + 3]! += nx * j * ia; v[A + 4]! += ny * j * ia; v[B + 3]! -= nx * j * ib; v[B + 4]! -= ny * j * ib;
    if (bounce) { restartClock(s, a); restartClock(s, b); }
  }
  if (vc <= ROCK_CRUSH_SPEED) return;
  const da = crushDamage(vc, ma, mb), db = crushDamage(vc, mb, ma);
  const aBreaks = wearRock(s, a, da), bBreaks = wearRock(s, b, db);
  s.rockCollisions++;
  s.events.push({ kind: 'rock', what: 'bump', by: 'collision', rock: a, other: b, x: v[A + 1]! - nx * ra, y: v[A + 2]! - ny * ra, r: ra, vx: v[A + 3]!, vy: v[A + 4]! });
  if (aBreaks) breakRock(s, a, nx, ny, 'collision', -1, 'fan', [a, b]);
  if (bBreaks) breakRock(s, b, -nx, -ny, 'collision', -1, 'fan', [a, b]);
}
```

After this step run `grep -rn ROCK_RESTITUTION src tests scripts` and delete the constant from rockTuning.ts if nothing imports it. Add to the file's header comment: `Pairs (asteroids-iii §5.4, §13.4): only Free rocks take turns; candidates are every live, unborn rock near the turn's rock, ascending; one that had its turn this tick (rockDone) is skipped. A rail never has rockDone, so a free-rail pair is always checked; a rail freed mid-pass takes its own turn later if its slot is higher.`

- [ ] **Step 5: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockContacts.test.ts tests/rockShips.test.ts tests/rockGrid.test.ts tests/rockMaskBetweenTicks.test.ts tests/rockMotion.test.ts tests/rockLaser.test.ts tests/rockBlast.test.ts tests/rockBreak.test.ts tests/boundary.test.ts`
Expected: PASS. `rockLaser`'s push test uses r 30 (mass 900 either way). If a `rockBlast` or `rockBreak` case fails only on a mass-dependent number, wrap it in `withSwitches({ massCube: false }, ...)` the same way and add the file to the commit (Task 10 rewrites those files' break and blast cases).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/tactical/rocks.ts src/renderer/src/sim/tactical/rockContacts.ts src/renderer/src/sim/tactical/rockTuning.ts tests/rockContacts.test.ts tests/rockShips.test.ts
git commit -m "feat(asteroids-iii): billiards: mass r³/30 (switch), the restitution curve, e = 0 soft contacts, soft separation, the touch counter, pushes restart the clock (spec §5.4, §13.4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Rejoining a rail (`settleRocks`): lane capture, rigid groups, own orbit

**Files:**
- Create: `src/renderer/src/sim/tactical/rockSettle.ts`
- Modify: `src/renderer/src/sim/tactical/duel.ts` (call `settleRocks` after `salvageStep`)
- Test: `tests/rockSettle.test.ts`

**Interfaces:**
- Consumes: `circularVelocity`, `laneZone`, `orbitRate`, `targetVelocity` (rails.ts); `LANES`, `ASTEROID_GAP`, `PLANET_RADIUS`, `R_MAP` (tuning.ts); `REJOIN_*` (rockTuning.ts); `isRail`, `railCentreRadius`, `rockPhase`, `RockKind`, `ROCK_STRIDE`, `rockSlots`, `rockX`, `rockY` (rocks.ts).
- Produces: `export interface RejoinChoice { rhoW: number; how: 'lane' | 'group' | 'own' }`; `export function rejoinChoice(s: TacticalState, k: number): RejoinChoice | null`; `export function settleRocks(s: TacticalState): void` (pushes a `rejoin` event per rejoin, `by: 'settle'`, with `how`).

- [ ] **Step 1: Write the failing test** `tests/rockSettle.test.ts`:

```ts
// Asteroids-iii §3.4, §13.2, §8.1 (rejoining): a free rock rejoins a rail at the end of the tick once its clock has run 120
// ticks, it was not touched or born this tick, it is within 0.5 u/s of V*, it is clear of the edge and the planet and it
// overlaps no live rock; its ρω is its lane's in a lane zone, else a matching rejoined rail's (a snap under 2 u/s), else
// its own ρ; and (plan deviation 3) no rail of another ω sweeps across its annulus.
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { laserStrikesRock } from '../src/renderer/src/sim/tactical/rockWeapons';
import { circularVelocity, orbitRate } from '../src/renderer/src/sim/tactical/rails';
import { rejoinChoice, settleRocks } from '../src/renderer/src/sim/tactical/rockSettle';
import { rockAt, RockKind, ROCK_STRIDE, rockX, rockY, writeRock } from '../src/renderer/src/sim/tactical/rocks';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { arena, mover, rail, rockEvents } from './helpers/rockArena';
import { stressInput, switchOff } from './helpers/rockStress';

/** A free rock in slot k at (x, y) moving at V_c plus (dvx, dvy), its clock at t. */
function settled(st: ReturnType<typeof arena>, k: number, x: number, y: number, t: number, dvx = 0, dvy = 0, r = 10): void {
  const [vx, vy] = circularVelocity(x, y);
  mover(st, k, x, y, vx + dvx, vy + dvy, r, 5, t);
}
function safeCrew(st: ReturnType<typeof arena>): void {
  const [vx, vy] = circularVelocity(-2750, 0);
  Object.assign(st.ships[0], { x: -2750, y: 0, vx, vy, heading: 0, headingAcc: 0 });
}
const slot = (st: ReturnType<typeof arena>, k: number): number[] => Array.from(st.rocks.subarray(k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE));

describe('rejoining a rail (spec §3.4, §13.2)', () => {
  it('on its own orbit: Rail with centre p and offset 0, t the tick, a rejoin event; the velocity snaps under 0.5 u/s', () => {
    const st = arena(); st.tick = 500;
    settled(st, 100, 0, 1700, 300, 0.3, 0);
    expect(rejoinChoice(st, 100)).toEqual({ rhoW: 1700, how: 'own' });
    const before = rockAt(st, 100);
    settleRocks(st);
    expect(slot(st, 100)).toEqual([RockKind.Rail, before.x, before.y, 0, 0, 10, 5, 500]);
    expect(rockEvents(st, 'rejoin')).toMatchObject([{ rock: 100, by: 'settle', how: 'own' }]);
    const after = rockAt(st, 100);
    expect(Math.hypot(after.vx - before.vx, after.vy - before.vy)).toBeLessThan(0.5);
  });
  it('waits for the clock (120 ticks), and never rejoins a rock touched or born this tick, or 0.5 u/s or more off V*', () => {
    const st = arena(); st.tick = 500;
    settled(st, 100, 0, 1700, 381); settled(st, 101, 0, -1700, 380); settled(st, 102, 1700, 0, 0); settled(st, 103, -1700, 0, 0); settled(st, 104, 1200, 1200, 0, 0.5, 0);
    st.rockTouched[102] = 1; st.rockBorn[103] = 1;
    expect([100, 101, 102, 103, 104].map((k) => rejoinChoice(st, k) !== null)).toEqual([false, true, false, false, false]);
  });
  it('never past ρ + r > R_MAP − 50 or ρ − r < PLANET_RADIUS + 80, never overlapping a live rock, never across a rail of another ω', () => {
    const st = arena(); st.tick = 500;
    settled(st, 100, 0, 2745, 0);            // 2745 + 10 > 2750
    settled(st, 101, 0, 2735, 0);            // clear of the edge
    settled(st, 102, 0, 155, 0);             // 155 − 10 < 150
    settled(st, 103, 0, 165, 0);
    settled(st, 104, 0, -1500, 0); mover(st, 110, 12, -1500, 0, 0, 8, 5, 490);   // a live rock overlaps it
    writeRock(st, 7, RockKind.Tumble, 1900, 0, 40, 0, 30, 5, 0);                 // a tumbling rail sweeps [1830, 1970]
    settled(st, 105, 0, -1935, 0);
    expect([100, 101, 102, 103, 104, 105].map((k) => rejoinChoice(st, k) !== null)).toEqual([false, true, false, true, false, false]);
  });
  it('in a lane zone it is captured: ρω the lane\'s, centre p · (ρ_lane / ρ), offset p − centre, and it co-rotates with the lane', () => {
    const st = arena(); st.tick = 500;
    const w = orbitRate(1200), x = 0, y = 1230;
    mover(st, 100, x, y, -w * y, w * x, 10, 5, 0);   // V* in the main zone: the lane's rigid rotation
    expect(rejoinChoice(st, 100)).toEqual({ rhoW: 1200, how: 'lane' });
    settleRocks(st);
    const v = slot(st, 100);
    expect([v[0], v[1], v[3], v[7]]).toEqual([RockKind.Rail, 0, 0, 500]);
    expect(v[2]).toBeCloseTo(1200, 9); expect(v[4]).toBeCloseTo(30, 9);
    rail(st, 7, 0, 1200, 20);                        // a lane rock on the same bearing, 30 inward
    for (let n = 0; n < 30; n++) {
      st.tick += 3600;
      const ax = rockX(st, 100), ay = rockY(st, 100), bx = rockX(st, 7), by = rockY(st, 7);
      expect(Math.abs(ax * by - ay * bx) / (Math.hypot(ax, ay) * Math.hypot(bx, by))).toBeLessThan(1e-9);   // still on one bearing
    }
  });
  it('next to a rejoined rail it joins that rail\'s rigid group (snap under 2 u/s), and the two never overlap over 30 minutes; a bigger snap stays Free', () => {
    const st = arena(); st.tick = 500;
    rail(st, 7, 0, 1700, 10);                        // a rejoined rail on its own orbit: [1690, 1710]
    settled(st, 100, 1718 * Math.sin(0.05), 1718 * Math.cos(0.05), 0);   // 86 u along the orbit; padded annulus [1698, 1738]: snap 1.5 · ω · 18 ≈ 0.6
    expect(rejoinChoice(st, 100)).toEqual({ rhoW: 1700, how: 'group' });
    settleRocks(st);
    let closest = Infinity;
    for (let n = 0; n < 30 * 60; n++) { st.tick += 60; closest = Math.min(closest, Math.hypot(rockX(st, 100) - rockX(st, 7), rockY(st, 100) - rockY(st, 7))); }
    expect(closest).toBeGreaterThan(80);   // rigid together: the gap never closes
    const big = arena(); big.tick = 500;
    rail(big, 8, 0, 2000, 60);                       // [1940, 2060]
    settled(big, 100, 0, -2090, 0, 0, 0, 25);        // padded [2055, 2125]: snap 1.5 · ω(2090) · 90 ≈ 2.2
    expect(rejoinChoice(big, 100)).toBeNull();
  });
  it('a rock kicked radially outward by 20 u/s at ρ 1200 settles and rejoins within 180 s', () => {
    const st = arena(); safeCrew(st);
    const [vx, vy] = circularVelocity(1200, 0);
    mover(st, 100, 1200, 0, vx + 20, vy, 10);
    let at = -1;
    for (let t = 0; t < 180 * 60 && at < 0; t++) { stepDuel(st, IDLE_INPUT); if (st.rocks[100 * ROCK_STRIDE] === RockKind.Rail) at = t; }
    expect(at).toBeGreaterThan(0);
  });
  it('5 laser shots on an r 45 rock add up: none is lost to a rejoin (plan deviation 16: hp 100)', () => {
    const st = arena(); safeCrew(st);
    const x = 0, y = 1700, [vx, vy] = circularVelocity(x, y);
    mover(st, 100, x, y, vx, vy, 45, 100);
    for (let shot = 0; shot < 5; shot++) {
      const a = rockAt(st, 100);
      st.events = [];
      laserStrikesRock(st, 0, 100, a.x, a.y);   // a push along the line from the crew ship, 2 damage
      for (let t = 0; t < 150; t++) { stepDuel(st, IDLE_INPUT); expect(st.rocks[100 * ROCK_STRIDE]).toBe(RockKind.Free); }
    }
    const a = rockAt(st, 100), [cx, cy] = circularVelocity(a.x, a.y);
    expect(Math.hypot(a.vx - cx, a.vy - cy)).toBeGreaterThan(3);   // five pushes of 4000 / m(45) add up; one alone is far less
  });
  it('in a stress run every rejoin is inside the ρ bounds', () => {
    const st = createTacticalState(2); switchOff(st, 1);
    const bad: string[] = [];
    let kinds = Array.from({ length: st.rocks.length / ROCK_STRIDE }, (_, k) => st.rocks[k * ROCK_STRIDE]!);
    for (let t = 0; t < 4000; t++) {
      stepDuel(st, stressInput(st));
      const now = kinds.map((_, k) => st.rocks[k * ROCK_STRIDE]!);
      now.forEach((kind, k) => {
        if (kinds[k] !== RockKind.Free || kind !== RockKind.Rail) return;
        const a = rockAt(st, k), rho = Math.hypot(a.x, a.y);
        if (rho + a.r > 2750 || rho - a.r < 150) bad.push(`tick ${st.tick} rock ${k} at ρ ${rho}`);
      });
      kinds = now;
    }
    expect(bad).toEqual([]);
  }, 60000);
});
```

(Bounds: R_MAP − 50 = 2750, PLANET_RADIUS + 80 = 150. With `massCube` on, the r 45 rock weighs 3037.5, so each laser push is 4000 / 3037.5 = 1.32 u/s; five of them, less the epicyclic turn, give about 5.5 u/s, and one alone 1.32. A planning simulation of this integrator put the radial-kick rock's rejoin at about 89 s, at ρ about 1941.)

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/rockSettle.test.ts`
Expected: FAIL (cannot resolve `rockSettle`).

- [ ] **Step 3: Create `src/renderer/src/sim/tactical/rockSettle.ts`**

```ts
// Asteroids-iii §3.4, §13.2 (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md): rejoining a rail, decided in one
// pass at the end of the tick, after the ship contacts, lasers, gun, pew and missiles (stepDuel runs settleRocks last,
// before the outcome). A Free rock may rejoin when its clock has run REJOIN_MIN_TICKS ((T + 1) − t), it was not touched or
// born this tick, |v − V*| < REJOIN_SPEED, ρ + r ≤ R_MAP − REJOIN_EDGE_CLEAR and ρ − r ≥ PLANET_RADIUS + REJOIN_PLANET_CLEAR,
// and it overlaps no live rock. Its ρω, in order: (1) in a lane zone, the lane's ρ (lane capture); (2) otherwise the first
// (lowest-slot) rejoined Rail whose annulus its padded annulus [ρ − r − ASTEROID_GAP, ρ + r + ASTEROID_GAP] overlaps,
// when the snap REJOIN_SNAP_FACTOR · ω · |ρ − ρω_j| is under REJOIN_SNAP_MAX (a rigid group; at or over it the rock stays
// Free); (3) otherwise its own ρ. Plan deviation 3: it also stays Free when a live rail of another ω sweeps across its
// padded annulus, so rail-rail pairs stay impossible. It becomes a Rail with centre p · (ρω / ρ) and offset p − centre,
// t = T + 1, and a `rejoin` event (by 'settle', `how`) tells the views and the measure script.
import { laneZone, orbitRate, targetVelocity } from './rails';
import { REJOIN_EDGE_CLEAR, REJOIN_MIN_TICKS, REJOIN_PLANET_CLEAR, REJOIN_SNAP_FACTOR, REJOIN_SNAP_MAX, REJOIN_SPEED } from './rockTuning';
import { isRail, railCentreRadius, rockPhase, RockKind, rockSlots, ROCK_STRIDE, rockX, rockY } from './rocks';
import type { TacticalState } from './state';
import { ASTEROID_GAP, LANES, PLANET_RADIUS, R_MAP } from './tuning';

export interface RejoinChoice { rhoW: number; how: 'lane' | 'group' | 'own' }
/** Two ω-radii this close are the same rail rate (a lane rock's |centre| is its lane's ρ to an ulp). */
const SAME_RHO = 1e-6;
const laneRail = (rc: number): boolean => LANES.some((l) => Math.abs(rc - l.rho) < SAME_RHO);
const clusterRail = (s: TacticalState, rc: number): boolean => s.map.clusterRho.some((c) => Math.abs(rc - c) < SAME_RHO);
/** The orbital radii live rail j sweeps: a Rail's |p| is constant (it turns rigidly), a Tumble's spins within |centre| ± |offset|. */
function sweep(s: TacticalState, j: number): [number, number] {
  const v = s.rocks, b = j * ROCK_STRIDE, r = v[b + 5]!, rc = railCentreRadius(s, j);
  if (v[b] === RockKind.Tumble) { const ro = Math.sqrt(v[b + 3]! * v[b + 3]! + v[b + 4]! * v[b + 4]!); return [rc - ro - r, rc + ro + r]; }
  const px = v[b + 1]! + v[b + 3]!, py = v[b + 2]! + v[b + 4]!, p = Math.sqrt(px * px + py * py);
  return [p - r, p + r];
}

/** Whether Free rock k rejoins now, and how (every §3.4 and §13.2 rule, plan deviation 3); null when it stays Free. */
export function rejoinChoice(s: TacticalState, k: number): RejoinChoice | null {
  const v = s.rocks, b = k * ROCK_STRIDE, n = rockSlots(s);
  if (v[b] !== RockKind.Free || s.rockBorn[k] === 1 || s.rockTouched[k] === 1) return null;
  if (rockPhase(s) - v[b + 7]! < REJOIN_MIN_TICKS) return null;
  const x = v[b + 1]!, y = v[b + 2]!, r = v[b + 5]!, [tx, ty] = targetVelocity(x, y), dvx = v[b + 3]! - tx, dvy = v[b + 4]! - ty;
  if (dvx * dvx + dvy * dvy >= REJOIN_SPEED * REJOIN_SPEED) return null;
  const rho = Math.sqrt(x * x + y * y);
  if (rho + r > R_MAP - REJOIN_EDGE_CLEAR || rho - r < PLANET_RADIUS + REJOIN_PLANET_CLEAR) return null;
  for (let j = 0; j < n; j++) {
    if (j === k || v[j * ROCK_STRIDE] === RockKind.Gone) continue;
    const dx = rockX(s, j) - x, dy = rockY(s, j) - y, rr = r + v[j * ROCK_STRIDE + 5]!;
    if (dx * dx + dy * dy < rr * rr) return null;
  }
  const lo = rho - r - ASTEROID_GAP, hi = rho + r + ASTEROID_GAP, zone = laneZone(rho);
  let choice: RejoinChoice = { rhoW: rho, how: 'own' };
  if (zone >= 0) choice = { rhoW: LANES[zone]!.rho, how: 'lane' };
  else for (let j = 0; j < n; j++) {
    if (j === k || v[j * ROCK_STRIDE] !== RockKind.Rail) continue;
    const rc = railCentreRadius(s, j);
    if (laneRail(rc) || clusterRail(s, rc)) continue;
    const [a, z] = sweep(s, j);
    if (!(lo < z && hi > a)) continue;
    if (REJOIN_SNAP_FACTOR * orbitRate(rho) * Math.abs(rho - rc) >= REJOIN_SNAP_MAX) return null;
    choice = { rhoW: rc, how: 'group' };
    break;
  }
  for (let j = 0; j < n; j++) {   // plan deviation 3
    if (j === k || !isRail(v[j * ROCK_STRIDE]!)) continue;
    if (Math.abs(railCentreRadius(s, j) - choice.rhoW) < SAME_RHO && v[j * ROCK_STRIDE] === RockKind.Rail) continue;   // same ω: rigid together
    const [a, z] = sweep(s, j);
    if (lo < z && hi > a) return null;
  }
  return choice;
}

/** §3.4, §13.2: the end-of-tick rejoin pass, ascending (a rock that rejoins counts as a live rail for the later ones). */
export function settleRocks(s: TacticalState): void {
  const v = s.rocks, T1 = rockPhase(s);
  for (let k = 0, n = rockSlots(s); k < n; k++) {
    const c = rejoinChoice(s, k);
    if (!c) continue;
    const b = k * ROCK_STRIDE, x = v[b + 1]!, y = v[b + 2]!, f = c.rhoW / Math.sqrt(x * x + y * y), cx = x * f, cy = y * f;
    v[b] = RockKind.Rail; v[b + 1] = cx; v[b + 2] = cy; v[b + 3] = x - cx; v[b + 4] = y - cy; v[b + 7] = T1;
    s.events.push({ kind: 'rock', what: 'rejoin', by: 'settle', rock: k, x, y, r: v[b + 5]!, vx: 0, vy: 0, how: c.how });
  }
}
```

For an own-orbit rejoin `f` is exactly 1, so the centre is p and the offset 0.

- [ ] **Step 4: Run it last in the tick.** In `src/renderer/src/sim/tactical/duel.ts` add `import { settleRocks } from './rockSettle';` and, inside the `try`, insert `settleRocks(state);   // asteroids-iii §3.4, §13.2: the rejoin pass, after every contact and weapon of the tick` on the line after `salvageStep(state);`. Add `settle rocks (asteroids-iii §3.4),` after `salvage,` in the doc comment's order sentence.

- [ ] **Step 5: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockSettle.test.ts tests/rockContacts.test.ts tests/rockMotion.test.ts tests/rockGrid.test.ts tests/rockPool.test.ts tests/boundary.test.ts`
Expected: PASS. The laser push in the 5-shot test is under Task 10's 0.25 · v_esc cap at ρ 1700 (13.6 u/s), so it stays valid after Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/tactical/rockSettle.ts src/renderer/src/sim/tactical/duel.ts tests/rockSettle.test.ts
git commit -m "feat(asteroids-iii): free rocks rejoin at the end of the tick: lane capture, rigid groups, own orbit; never across a rail of another ω (spec §3.4, §13.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Breaking: burst 8/6/4, escape-scaled kicks, the Roche break, push caps, eviction of any kind

**Files:**
- Modify: `src/renderer/src/sim/tactical/rockBreak.ts` (whole file, below)
- Modify: `src/renderer/src/sim/tactical/rockBlast.ts:392-398` (the blast push cap), `rockWeapons.ts:434-439` (`laserStrikesRock`, the laser push cap)
- Modify: `src/renderer/src/sim/tactical/rockContacts.ts` (the Roche break in part 1)
- Modify: `src/renderer/src/sim/tactical/rockTuning.ts` (delete `ROCK_FLING`, `ROCK_BLAST_FLING`)
- Modify tests: `tests/rockBreak.test.ts` (the fan, burst and eviction cases), `tests/rockBlast.test.ts` (the direct hit, the fall-off, the list-before-hit cases)

**Interfaces:**
- Consumes: `escapeSpeed` (rails.ts); `BURST_*`, `FAN_OFFSET`, `FAN_KICK_*`, `TIDAL_KICK_*`, `GOLDEN_FRAC`, `BLAST_PUSH_CAP`, `LASER_PUSH_CAP`, `ROCHE_R`, `ROCHE_MIN_AGE`, `FAN_SPLIT_MIN_R`, `ROCK_SWITCHES` (rockTuning.ts); `isRail`, `regridRock`, `freeRock`, `markTouched`, `restartClock` (rocks.ts).
- Produces (rockBreak.ts): `export type BreakPattern = 'fan' | 'burst' | 'tidal'`; `FAN_DIRS`, `BURST_DIRS` (now with an 8-way table); `pieceCount(r, pattern): 0 | 2 | 3 | 4 | 6 | 8` (`'tidal'` counts as the fan); `pieceRadius(r, n)`; `pieceOffset(pattern, n): number`; `kickFraction(j): number`; `pieceKick(rho, j, pattern): number`; `vacate`, `dustRock`, `pushRock`, `wearRock`, `hitRock`, `breakRock(s, k, ux, uy, by, ship, pattern, exclude?)`, `crushDamage` (signatures as before). A split event carries `burst: true` for the burst pattern. `rockSlotDust` counts pieces lost for lack of a slot.

- [ ] **Step 1: Write the failing tests.** In `tests/rockBreak.test.ts` add `import { escapeSpeed } from '../src/renderer/src/sim/tactical/rails';`, add `kickFraction, pieceKick, pieceOffset, pieceRadius` to the `rockBreak` import and `rail` to the rockArena import, then replace the fan test (`'r 42 gives 3 pieces, ...'`), the zero-direction test and the whole `describe('the burst ...')` block with:

```ts
const ve = escapeSpeed(2000);
describe('the fan (laser, blast-secondary, collision, ram; spec §3.4, §5.2)', () => {
  it('r 42 gives 3 pieces, r 30, r 20 and r 13 give 2, r 12.9 and r 12 dust; each 0.9 r / √n, 0.6 r out, the parent\'s velocity plus v_esc · (0.10 + 0.15 f_j)', () => {
    for (const [r, n] of [[42, 3], [30, 2], [20, 2], [13, 2], [12.9, 0], [12, 0]] as const) {
      const st = arena();
      mover(st, 100, 0, 2000, 10, 0, r);
      breakRock(st, 100, 1, 0, 'laser', 0, 'fan');
      expect(pieceCount(r, 'fan')).toBe(n);
      expect(st.systems[0].rocksBroken, `r ${r}`).toBe(1);
      if (n === 0) { expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 100, by: 'laser', ship: 0, r, x: 0, y: 2000, vx: 10, vy: 0 }]); continue; }
      const split = rockEvents(st, 'split')[0]!, pieces = split.pieces!, rp = (0.9 * r) / Math.sqrt(n), angles = n === 2 ? [-30, 30] : [-40, 0, 40];
      expect(split).not.toHaveProperty('burst');
      expect(pieces[0]).toBe(100);
      pieces.forEach((slot, j) => {
        const p = rockAt(st, slot), a = deg(angles[j]!), k = ve * (0.1 + 0.15 * kickFraction(j));
        expect(p.kind).toBe(RockKind.Free);
        expect(p.r).toBeCloseTo(rp, 12);
        expect(p.hp).toBe(Math.ceil(rp / 10));
        expect(p.x).toBeCloseTo(0.6 * r * Math.cos(a), 9);
        expect(p.y).toBeCloseTo(2000 + 0.6 * r * Math.sin(a), 9);
        expect(p.vx).toBeCloseTo(10 + k * Math.cos(a), 9);
        expect(p.vy).toBeCloseTo(k * Math.sin(a), 9);
        expect(rockBorn(st, slot)).toBe(true);
      });
    }
  });
});

describe('the burst (a torpedo direct hit; spec §5.1, §13.6)', () => {
  it('r 50 and r 40 give 8 pieces, r 35 and r 30 give 6, r 20 gives 4, r 19 dust; a full circle from u, born 0.85/0.80/0.70 r out at v_esc · (0.15 + 0.25 f_j)', () => {
    for (const [r, n] of [[50, 8], [40, 8], [35, 6], [30, 6], [20, 4], [19, 0]] as const) {
      const st = arena();
      mover(st, 100, 0, 2000, 0, 0, r);
      breakRock(st, 100, 0, -3, 'torpedo', 0, 'burst');   // u north (any length)
      expect(pieceCount(r, 'burst')).toBe(n);
      if (n === 0) { expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 100, by: 'torpedo', ship: 0 }]); continue; }
      const split = rockEvents(st, 'split')[0]!, pieces = split.pieces!, rp = (0.9 * r) / Math.sqrt(n), off = pieceOffset('burst', n) * r;
      expect(split.burst).toBe(true);
      expect(pieces).toHaveLength(n);
      expect(pieceOffset('burst', n)).toBe(n === 8 ? 0.85 : n === 6 ? 0.8 : 0.7);
      pieces.forEach((slot, j) => {
        const p = rockAt(st, slot), a = deg((360 * j) / n), k = ve * (0.15 + 0.25 * kickFraction(j));   // from u = (0, −1): (sin θ, −cos θ)
        expect(p.r).toBeCloseTo(rp, 12);
        expect(p.x).toBeCloseTo(off * Math.sin(a), 9);
        expect(p.y).toBeCloseTo(2000 - off * Math.cos(a), 9);
        expect(p.vx).toBeCloseTo(k * Math.sin(a), 9);
        expect(p.vy).toBeCloseTo(-k * Math.cos(a), 9);
      });
    }
  });
  it('no two siblings overlap at birth, for every burst pattern at its smallest and largest parent', () => {
    for (const [r, n] of [[40, 8], [60, 8], [30, 6], [39.9, 6], [20, 4], [29.9, 4]] as const) {
      const rp = pieceRadius(r, n), off = pieceOffset('burst', n) * r;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const ai = (2 * Math.PI * i) / n, aj = (2 * Math.PI * j) / n;
        expect(Math.hypot(off * (Math.cos(ai) - Math.cos(aj)), off * (Math.sin(ai) - Math.sin(aj))), `r ${r} pieces ${i}, ${j}`).toBeGreaterThan(2 * rp);
      }
    }
  });
  it('every kick is in its band: burst 0.15 to 0.40, fan 0.10 to 0.25, tidal 0.03 to 0.08 of v_esc', () => {
    for (let j = 0; j < 8; j++) {
      const b = pieceKick(1200, j, 'burst') / escapeSpeed(1200), f = pieceKick(1200, j, 'fan') / escapeSpeed(1200), t = pieceKick(150, j, 'tidal') / escapeSpeed(150);
      expect(b).toBeGreaterThanOrEqual(0.15); expect(b).toBeLessThan(0.4);
      expect(f).toBeGreaterThanOrEqual(0.1); expect(f).toBeLessThan(0.25);
      expect(t).toBeGreaterThanOrEqual(0.03); expect(t).toBeLessThan(0.08);
    }
    expect(kickFraction(0)).toBe(0);
    expect(kickFraction(1)).toBeCloseTo(0.6180339887498949, 15);
  });
});
```

  In the same file, in `describe('slot use and eviction (spec §3.4)')`: rename the eviction test to `'with no free slot it evicts the smallest rock (Rail or Free) smaller than the piece (ties: lowest slot), never a born or excluded one'` and add, after its loop, this case:

```ts
    const st = arena();
    mover(st, 0, 0, 2000, 0, 0, 30);
    fillPool(st, 9, [50]);
    rail(st, 50, -1500, 1200, 8.2);   // §5.5: a Rail can be evicted too
    breakRock(st, 0, 1, 0, 'collision', -1, 'fan');
    expect(rockEvents(st, 'split')[0]!.pieces).toEqual([0, 50]);
```

  and in `'with nothing smaller the piece is dust ...'` change the counter line to `expect([st.rockDust, st.rockSplits, st.rockEvictions, st.systems[0].rocksBroken, st.rockSlotDust]).toEqual([1, 1, 0, 1, 1]);`.

  In `tests/rockBlast.test.ts` add `import { escapeSpeed } from '../src/renderer/src/sim/tactical/rails';`, `rockMass` to the `rocks` import and `kickFraction` from `rockBreak`, and replace `'bursts the touched rock whatever its hp: ...'`, `'falls off linearly: ...'` and `'takes its list before the direct hit: ...'` with:

```ts
  it('bursts the touched rock whatever its hp: r 50 gives 8, r 35 and r 30 give 6, r 20 gives 4, r 19 dust; piece 0 straight on at v_esc · 0.15 plus the rock', () => {
    for (const [r, n] of [[50, 8], [35, 6], [30, 6], [20, 4], [19, 0]] as const) {
      const st = arena();
      mover(st, 100, -54, 2000, 5, 0, r, 99);
      detonateTorpedo(st, 0, 0, 2000, -300, 0, 100);
      expect(rockEvents(st, 'blast')).toMatchObject([{ rock: 100, by: 'torpedo', ship: 0, x: 0, y: 2000, r: 120 }]);
      expect([st.rockBlasts, st.systems[0].rocksBroken]).toEqual([1, 1]);
      if (n === 0) { expect(rockEvents(st, 'dust')).toMatchObject([{ rock: 100, by: 'torpedo', ship: 0 }]); continue; }
      const pieces = rockEvents(st, 'split')[0]!.pieces!;
      expect(pieces).toHaveLength(n);
      expect(rockAt(st, pieces[0]!).vx).toBeCloseTo(5 - 0.15 * escapeSpeed(Math.hypot(-54, 2000)), 9);   // u: the torpedo's velocity relative to the rock (west)
      expect(rockAt(st, pieces[0]!).vy).toBeCloseTo(0, 9);
    }
  });
});

describe('the blast (spec §4.2 items 2 and 3, asteroids-iii §5.3)', () => {
  it('falls off linearly: damage 2 + 4·fall and push min(60000·fall / m, 0.5 v_esc) along the blast-to-rock line; nothing at or beyond the radius', () => {
    const st = arena(), m = rockMass(50), cap = (x: number, y: number): number => 0.5 * escapeSpeed(Math.hypot(x, y));
    mover(st, 100, -60, 2000, 0, 0, 25, 99);   // the touched rock
    mover(st, 101, 0, 2050, 0, 0, 50, 20);     // surface 0: fall 1
    mover(st, 102, 110, 2000, 0, 0, 50, 20);   // surface 60: fall 0.5
    mover(st, 103, 0, 1831, 0, 0, 50, 20);     // surface 119: fall 1/120
    mover(st, 104, -102, 2136, 0, 0, 50, 20);  // surface 120: outside
    mover(st, 105, 250, 2000, 0, 0, 50, 20);   // surface 200: outside
    mover(st, 106, -10, 1880, 0, 0, 10, 20);   // a light rock near the centre: the cap holds it
    detonateTorpedo(st, 0, 0, 2000, -300, 0, 100);
    expect([blastFall(0), blastFall(60), blastFall(120), blastFall(200)]).toEqual([1, 0.5, 0, 0]);
    expect(rockAt(st, 101).hp).toBe(14); expect(rockAt(st, 101).vy).toBeCloseTo(Math.min(60000 / m, cap(0, 2050)), 9);
    expect(rockAt(st, 102).hp).toBe(16); expect(rockAt(st, 102).vx).toBeCloseTo(Math.min(30000 / m, cap(110, 2000)), 9);
    expect(rockAt(st, 103).hp).toBeCloseTo(20 - (2 + 4 / 120), 12);
    expect(rockAt(st, 103).vy).toBeCloseTo(-Math.min(500 / m, cap(0, 1831)), 9);
    expect(rockAt(st, 104)).toMatchObject({ hp: 20, vx: 0, vy: 0 });
    expect(rockAt(st, 105)).toMatchObject({ hp: 20, vx: 0, vy: 0 });
    const p = rockAt(st, 106);
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(cap(-10, 1880), 9);   // 60000 · fall / m(10) is far over the cap
    expect(rockEvents(st, 'hit').map((e) => e.rock)).toEqual([101, 102, 103, 106]);
  });
```

```ts
  it('takes its list before the direct hit: a slot the pieces reuse (born) is not hit by the blast', () => {
    const st = arena();
    mover(st, 100, -54, 2000, 0, 0, 50, 1);
    fillPool(st, 9);
    mover(st, 120, 60, 2000, 0, 0, 8.5, 5);   // in the radius and the smallest: evicted first
    detonateTorpedo(st, 0, 0, 2000, -200, 0, 100);
    const pieces = rockEvents(st, 'split')[0]!.pieces!, p = rockAt(st, 120), k1 = escapeSpeed(Math.hypot(-54, 2000)) * (0.15 + 0.25 * kickFraction(1));
    expect(pieces).toHaveLength(8);
    expect(pieces[1]).toBe(120);
    expect(p.r).toBeCloseTo((0.9 * 50) / Math.sqrt(8), 12);
    expect(p.hp).toBe(2);
    expect(p.vx).toBeCloseTo(-0.7071067811865476 * k1, 9);   // its own burst velocity (u west, +45°), no blast push
    expect(p.vy).toBeCloseTo(-0.7071067811865476 * k1, 9);
    expect(rockEvents(st, 'hit').some((e) => e.rock === 120)).toBe(false);
    expect(st.rockEvictions).toBe(7);
  });
```

  (Keep the rest of `describe('the blast ...')` as it is; the replaced `describe` header line above includes the first test's opening `describe`, so remove the old `describe('the blast (spec §4.2 items 2 and 3)', () => {` line. The blast resolves no contacts, so rocks that overlap here do not matter.)

  Add a Roche test to `tests/rockMotion.test.ts` (add `escapeSpeed` from rails and `withSwitches` is already imported):

```ts
describe('the Roche break (spec §13.3)', () => {
  it('a free rock inside ρ 175, r ≥ 13 and at least 30 ticks old fan-breaks along its velocity, cause tidal, kicks 0.03 to 0.08 of v_esc', () => {
    const st = arena(); st.tick = 100;
    const [vx, vy] = circularVelocity(0, 160);
    mover(st, 100, 0, 160, vx, vy, 20, 5, 70);    // 30 ticks old
    mover(st, 101, 0, -160, -vx, -vy, 20, 5, 71);  // 29 ticks old: not yet
    mover(st, 102, 160, 0, 0, 0, 12, 5, 0);        // r 12: under FAN_SPLIT_MIN_R
    stepRocks(st);
    const split = rockEvents(st, 'split');
    expect(split.map((e) => [e.rock, e.by])).toEqual([[100, 'tidal']]);
    for (const p of split[0]!.pieces!) {
      const a = rockAt(st, p), dv = Math.hypot(a.vx - vx, a.vy - vy) / escapeSpeed(160);
      expect(dv).toBeGreaterThanOrEqual(0.03 - 1e-9); expect(dv).toBeLessThan(0.08);
    }
    withSwitches({ rocheBreak: false }, () => {
      const off = arena(); off.tick = 100;
      mover(off, 100, 0, 160, vx, vy, 20, 5, 0);
      stepRocks(off);
      expect(rockEvents(off, 'split')).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run tests/rockBreak.test.ts tests/rockBlast.test.ts tests/rockMotion.test.ts`
Expected: FAIL (`kickFraction` not exported; 6 pieces for r 50; no tidal breaks).

- [ ] **Step 3: Replace `src/renderer/src/sim/tactical/rockBreak.ts`** with:

```ts
// Asteroids-iii §5, §13.3, §13.6 (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md), on spike ii's rockBreak: how
// a rock takes a hit, a push, turns to dust and breaks. A torpedo's direct hit bursts the rock into 8, 6 or 4 pieces
// (parent r ≥ 40, ≥ 30, ≥ 20; else dust) evenly round the hit direction, born 0.85, 0.80 or 0.70 r out so no two siblings
// overlap; any other break fans 3 or 2 pieces across the 120° ahead, born 0.6 r out; a tidal break (the Roche rule) is a
// fan with a tiny kick. Piece j leaves at the parent's velocity plus its direction times k_j = v_esc(ρ_parent) · (MIN +
// SPAN · f_j), f_j the fractional part of j · GOLDEN_FRAC: burst 0.15 + 0.25 f, fan 0.10 + 0.15 f, tidal 0.03 + 0.05 f.
// Directions come from literal cos/sin tables turned onto the hit direction by multiplication. Piece 0 keeps the broken
// rock's slot, the others take the lowest empty slots, else evict the smallest rock (any live kind) smaller than the
// piece that is not born this tick and not in `exclude` (ties: the lowest slot), else the piece is dust (rockSlotDust + 1).
// Pieces are Free with t = the phase tick (siblings share t) and are linked into the rock grid at birth. Every slot
// cleared or rewritten clears the rock targets that named it. A slot born this tick takes no damage, push or break. A
// push frees a rail first, restarts the rock's clock and touches it (§3.4).
import { escapeSpeed } from './rails';
import { BURST_4_MIN_R, BURST_6_MIN_R, BURST_8_MIN_R, BURST_KICK_MIN, BURST_KICK_SPAN, BURST_OFFSET, FAN_KICK_MIN, FAN_KICK_SPAN, FAN_OFFSET, FAN_SPLIT_MIN_R, FAN_TRIPLE_MIN_R, GOLDEN_FRAC, ROCK_CRUSH_SPEED, ROCK_CRUSH_STEP, ROCK_MIN_R, TIDAL_KICK_MIN, TIDAL_KICK_SPAN } from './rockTuning';
import { freeRock, markTouched, regridRock, restartClock, rockAlive, rockAt, rockHp, RockKind, rockSlots, ROCK_STRIDE, writeRock } from './rocks';
import type { RockCause, TacticalState } from './state';

export type BreakPattern = 'fan' | 'burst' | 'tidal';
const C30 = 0.8660254037844386, C40 = 0.766044443118978, S40 = 0.6427876096865393, S45 = 0.7071067811865476, S60 = 0.8660254037844386;
/** The fan's piece directions as (cos θ, sin θ) of the turn from the hit direction, piece 0 first: θk = −60° + 120°(k + ½)/n
 *  (2 pieces ±30°, 3 pieces −40°, 0°, +40°; θ clockwise on the y-down map). */
export const FAN_DIRS: Readonly<Record<2 | 3, readonly (readonly [number, number])[]>> = {
  2: [[C30, -0.5], [C30, 0.5]],
  3: [[C40, -S40], [1, 0], [C40, S40]]
};
/** The burst's: θk = 360° · k / n from the hit direction, so piece 0 flies straight on. */
export const BURST_DIRS: Readonly<Record<4 | 6 | 8, readonly (readonly [number, number])[]>> = {
  4: [[1, 0], [0, 1], [-1, 0], [0, -1]],
  6: [[1, 0], [0.5, S60], [-0.5, S60], [-1, 0], [-0.5, -S60], [0.5, -S60]],
  8: [[1, 0], [S45, S45], [0, 1], [-S45, S45], [-1, 0], [-S45, -S45], [0, -1], [S45, -S45]]
};

/** §5.1, §5.2: the pieces a break of a rock of radius r makes (0: dust); a tidal break counts as the fan. */
export function pieceCount(r: number, pattern: BreakPattern): 0 | 2 | 3 | 4 | 6 | 8 {
  if (pattern !== 'burst') return r >= FAN_TRIPLE_MIN_R ? 3 : r >= FAN_SPLIT_MIN_R ? 2 : 0;
  return r >= BURST_8_MIN_R ? 8 : r >= BURST_6_MIN_R ? 6 : r >= BURST_4_MIN_R ? 4 : 0;
}
/** §5.1: a piece's radius, 0.9 r / √n. */
export function pieceRadius(r: number, n: number): number { return (0.9 * r) / Math.sqrt(n); }
/** §5.1, §5.2: the birth offset from the parent's centre, as a share of the parent's r. */
export function pieceOffset(pattern: BreakPattern, n: number): number { return pattern === 'burst' ? BURST_OFFSET[n as 4 | 6 | 8] : FAN_OFFSET; }
/** §5.1: f_j, the fractional part of j · GOLDEN_FRAC. */
export function kickFraction(j: number): number { const p = j * GOLDEN_FRAC; return p - Math.floor(p); }
/** §5.2, §13.3, §13.6: piece j's kick (u/s) at the parent's orbital radius ρ. */
export function pieceKick(rho: number, j: number, pattern: BreakPattern): number {
  const ve = escapeSpeed(rho), f = kickFraction(j);
  return pattern === 'burst' ? ve * (BURST_KICK_MIN + BURST_KICK_SPAN * f) : pattern === 'tidal' ? ve * (TIDAL_KICK_MIN + TIDAL_KICK_SPAN * f) : ve * (FAN_KICK_MIN + FAN_KICK_SPAN * f);
}

/** Clear slot k and every active ship's rock target that names it (§6.1: laser and torpedo to −1, a flying torpedo's to −2). */
export function vacate(s: TacticalState, k: number): void {
  s.rocks.fill(0, k * ROCK_STRIDE, (k + 1) * ROCK_STRIDE);
  s.systems.forEach((sys, i) => {
    if (!s.ships[i]!.active) return;   // an inactive slot's record holds zeros, and keeps them
    if (sys.laserRock === k) sys.laserRock = -1;
    if (sys.torpRock === k) sys.torpRock = -1;
    if (sys.torpRockFlying === k) sys.torpRockFlying = -2;
  });
}
const shipField = (ship: number): { ship?: number } => (ship >= 0 ? { ship } : {});

/** Spike ii §3.5: rock k turns to dust: a dust event with its position, radius and velocity, then the slot is vacated. Not a break. */
export function dustRock(s: TacticalState, k: number, by: RockCause, ship = -1, evicted = false): void {
  const a = rockAt(s, k);
  s.events.push({ kind: 'rock', what: 'dust', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, ...shipField(ship), ...(evicted ? { evicted: true as const } : {}) });
  s.rockDust++;
  vacate(s, k);
}
/** §3.4, §5.3: add (dvx, dvy) to rock k's velocity: a rail is freed first; the push restarts its clock and touches it.
 *  Born or gone: nothing. */
export function pushRock(s: TacticalState, k: number, dvx: number, dvy: number): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  freeRock(s, k); markTouched(s, k); restartClock(s, k);
  const b = k * ROCK_STRIDE;
  s.rocks[b + 3]! += dvx; s.rocks[b + 4]! += dvy;
}
/** Take dmg off rock k's hp (born or gone: nothing, false); true when it is now at or below 0 (the caller breaks it). */
export function wearRock(s: TacticalState, k: number, dmg: number): boolean {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return false;
  markTouched(s, k);
  const b = k * ROCK_STRIDE + 6;
  s.rocks[b]! -= dmg;
  return s.rocks[b]! <= 0;
}
/** A weapon's hit (§4.1, §4.2): wear, a hit event (rockHits + 1), and at hp ≤ 0 a fan break along (ux, uy). */
export function hitRock(s: TacticalState, k: number, dmg: number, ux: number, uy: number, by: RockCause, ship = -1): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  const broke = wearRock(s, k, dmg), a = rockAt(s, k);
  s.events.push({ kind: 'rock', what: 'hit', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, ...shipField(ship) });
  s.rockHits++;
  if (broke) breakRock(s, k, ux, uy, by, ship, 'fan');
}

/** §5.5: a slot for a new piece of radius rp: the lowest empty one, else evict (rockEvictions + 1, a dust event without a
 *  ship) the smallest live rock of any kind smaller than rp that is not born and not in `exclude` (ties: the lowest slot),
 *  else −1. */
function allocate(s: TacticalState, rp: number, exclude: readonly number[], by: RockCause): number {
  const v = s.rocks, n = rockSlots(s);
  for (let j = 0; j < n; j++) if (v[j * ROCK_STRIDE] === RockKind.Gone) return j;
  let best = -1;
  for (let j = 0; j < n; j++) {
    const b = j * ROCK_STRIDE;
    if (v[b] === RockKind.Gone || s.rockBorn[j] === 1 || exclude.includes(j) || v[b + 5]! >= rp) continue;
    if (best < 0 || v[b + 5]! < v[best * ROCK_STRIDE + 5]!) best = j;
  }
  if (best < 0) return -1;
  s.rockEvictions++;
  dustRock(s, best, by, -1, true);   // eviction: not a break (the views and the feel check skip `evicted` dust)
  return best;
}

/**
 * §5: rock k breaks, its hit direction (ux, uy) (need not be unit; zero: north), its cause and ship (−1 none) and the
 * pattern. rocksBroken + 1 for `ship`, once. Too small for pieces (or pieces under ROCK_MIN_R): dust. Otherwise piece j
 * starts at centre + dir · pieceOffset · r with the parent's velocity plus dir · pieceKick, radius 0.9 r / √n, hp
 * ceil(rp / 10), Free, born, linked into the grid, with fresh contact grace; then one split event naming the slots
 * written (`burst: true` for the burst pattern).
 */
export function breakRock(s: TacticalState, k: number, ux: number, uy: number, by: RockCause, ship: number, pattern: BreakPattern, exclude: readonly number[] = []): void {
  if (!rockAlive(s, k) || s.rockBorn[k] === 1) return;
  const a = rockAt(s, k), n = pieceCount(a.r, pattern), rp = n > 0 ? pieceRadius(a.r, n) : 0;
  if (ship >= 0) s.systems[ship]!.rocksBroken++;
  if (n === 0 || rp < ROCK_MIN_R) { dustRock(s, k, by, ship); return; }
  const d = Math.sqrt(ux * ux + uy * uy), hx = d > 0 ? ux / d : 0, hy = d > 0 ? uy / d : -1;
  const dirs = pattern === 'burst' ? BURST_DIRS[n as 4 | 6 | 8] : FAN_DIRS[n as 2 | 3], off = pieceOffset(pattern, n) * a.r, rho = Math.sqrt(a.x * a.x + a.y * a.y), pieces: number[] = [];
  vacate(s, k);
  dirs.forEach(([c, sn], j) => {
    const dx = hx * c - hy * sn, dy = hx * sn + hy * c, kick = pieceKick(rho, j, pattern);
    const px = a.x + dx * off, py = a.y + dy * off, vx = a.vx + dx * kick, vy = a.vy + dy * kick;
    const slot = j === 0 ? k : allocate(s, rp, exclude, by);
    if (slot < 0) {   // no slot: this piece is dust, never silent (§5.5: rockSlotDust)
      s.events.push({ kind: 'rock', what: 'dust', by, rock: -1, x: px, y: py, r: rp, vx, vy, ...shipField(ship) });
      s.rockDust++; s.rockSlotDust++;
      return;
    }
    writeRock(s, slot, RockKind.Free, px, py, vx, vy, rp, rockHp(rp));
    s.rockBorn[slot] = 1;
    regridRock(s, slot);   // §6.1: a new piece is linked into the grid at birth
    for (const body of s.ships) body.graceUntil[slot + 1] = 0;   // a new rock: no contact grace on any ship
    pieces.push(slot);
  });
  s.rockSplits++;
  s.events.push({ kind: 'rock', what: 'split', by, rock: k, x: a.x, y: a.y, r: a.r, vx: a.vx, vy: a.vy, pieces, ...shipField(ship), ...(pattern === 'burst' ? { burst: true as const } : {}) });
}

/** Spike ii §3.3, §5.1: the damage a body of mass `own` takes from a contact closing at vc against a body of mass `other`:
 *  (vc − ROCK_CRUSH_SPEED) / ROCK_CRUSH_STEP · 2·other / (own + other) above the crush speed, else 0. */
export function crushDamage(vc: number, own: number, other: number): number {
  return vc > ROCK_CRUSH_SPEED ? (((vc - ROCK_CRUSH_SPEED) / ROCK_CRUSH_STEP) * 2 * other) / (own + other) : 0;
}
```

Delete `ROCK_FLING` and `ROCK_BLAST_FLING` (and their comments) from rockTuning.ts.

- [ ] **Step 4: The push caps.** In `rockBlast.ts`, add `import { escapeSpeed } from './rails';` and `BLAST_PUSH_CAP` to the rockTuning import, and in the `for (const k of near)` loop replace `dv = (BLAST_PUSH * fall) / rockMass(a.r)` with `dv = Math.min((BLAST_PUSH * fall) / rockMass(a.r), BLAST_PUSH_CAP * escapeSpeed(Math.sqrt(a.x * a.x + a.y * a.y)))` (§5.3). In `rockWeapons.ts`, add `import { escapeSpeed } from './rails';` and `LASER_PUSH_CAP` to the rockTuning import, and replace `laserStrikesRock`'s body with:

```ts
  const a = state.ships[i]!, dx = x - a.x, dy = y - a.y, d = Math.sqrt(dx * dx + dy * dy), ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : -1;
  const r = rockAt(state, k), j = Math.min(LASER_ROCK_PUSH / rockMass(r.r), LASER_PUSH_CAP * escapeSpeed(Math.sqrt(r.x * r.x + r.y * r.y)));   // §5.3: capped
  pushRock(state, k, ux * j, uy * j);
  hitRock(state, k, LASER_ROCK_DAMAGE, ux, uy, 'laser', i);
```

Update both files' header comments: `(asteroids-iii §5.3: the push capped at 0.5 · v_esc(ρ))` and `(asteroids-iii §5.3: the push capped at 0.25 · v_esc(ρ); a rail is freed first)`.

- [ ] **Step 5: The Roche break in the motion pass.** In `rockContacts.ts` add `FAN_SPLIT_MIN_R, ROCHE_MIN_AGE, ROCHE_R` to the rockTuning import, then in `stepRocks` part 1, right after the `continue` for non-Free or born slots, add:

```ts
    const rx = v[b + 1]!, ry = v[b + 2]!;
    if (ROCK_SWITCHES.rocheBreak && rx * rx + ry * ry < ROCHE_R * ROCHE_R && v[b + 5]! >= FAN_SPLIT_MIN_R && T1 - v[b + 7]! >= ROCHE_MIN_AGE) {
      breakRock(s, k, v[b + 3]!, v[b + 4]!, 'tidal', -1, 'tidal');   // §13.3: a tidal fan along its velocity; its pieces are born, so they hold this tick
      continue;
    }
```

  and add to the header comment's part 1 line: `With the rocheBreak switch, a free rock inside ROCHE_R, r ≥ FAN_SPLIT_MIN_R and ROCHE_MIN_AGE ticks old breaks instead (cause 'tidal').`

- [ ] **Step 6: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockBreak.test.ts tests/rockBlast.test.ts tests/rockMotion.test.ts tests/rockLaser.test.ts tests/rockContacts.test.ts tests/rockShips.test.ts tests/rockSettle.test.ts tests/rockGrid.test.ts tests/rockFx.test.ts tests/rockSounds.test.ts tests/boundary.test.ts`
Expected: PASS. `rockLaser`'s break-count case still gives 3/2/2/2/0 (the fan's counts are unchanged); its push case (r 30 at ρ 2508: 4.44 u/s against a cap of 11.2) is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/rockBreak.ts src/renderer/src/sim/tactical/rockBlast.ts src/renderer/src/sim/tactical/rockWeapons.ts src/renderer/src/sim/tactical/rockContacts.ts src/renderer/src/sim/tactical/rockTuning.ts tests/rockBreak.test.ts tests/rockBlast.test.ts tests/rockMotion.test.ts
git commit -m "feat(asteroids-iii): breaking: bursts of 8/6/4 born clear of each other, escape-scaled kicks, the Roche break, push caps, eviction of any kind, rockSlotDust (spec §5, §13.3, §13.6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Ships and the readers that assumed still rocks

**Files:**
- Modify: `src/renderer/src/sim/tactical/contacts.ts` (`shipRock`: `RAM_SOFT`, the rock-side separation cap)
- Modify: `src/renderer/src/sim/tactical/predict.ts` (`rockAhead`, `touchesSolid(…, ahead)`, `predictFlight`, `predictMissile`, `predictRock`)
- Modify: `src/renderer/src/sim/duel/scripted.ts:103-117` (`hazardAway`)
- Modify: `src/renderer/src/sim/tactical/hunter.ts:65-75` (`threatAhead`, now exported)
- Test: `tests/rockPredict.test.ts`; `tests/rockShips.test.ts` (new cases)

**Interfaces:**
- Consumes: `railPos`, `RailOut` (rails.ts); `moveFreeSlot`, `rockEdgeSlack` (rockContacts.ts); `RAM_SOFT`, `ROCK_SEPARATE_MAX`, `ROCK_MAX_SPEED` (rockTuning.ts); the accessors and `rockPhase`, `isRail`, `RockKind` (rocks.ts).
- Produces (predict.ts): `rockAhead(state: TacticalState, k: number, n: number, out: RailOut): void` (a rail on its rail at the phase tick + n, a Free rock in a straight line); `touchesSolid(state, x, y, r, ahead = 0): boolean`; `predictRock(state: TacticalState, k: number, ticks: number, every: number): PathPoint[]` (Task 12 draws it). (hunter.ts) `export function threatAhead(state: TacticalState, i: number): { x: number; y: number } | null`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/rockShips.test.ts` (add `ROCK_SEPARATE_MAX` from rockTuning to its imports):

```ts
describe('soft ship contacts (asteroids-iii §6.2)', () => {
  it('a ship co-orbiting at under 15 u/s relative pushes a rail rock free and loses no hull, counts no hit and stamps no grace', () => {
    const st = arena();
    rail(st, 100, 20 + 30 - 1, -2500, 30);
    const a = rockAt(st, 100), hull = st.systems[0].hull;
    Object.assign(st.ships[0], { vx: a.vx + 10, vy: a.vy });
    resolveContacts(st, true);
    expect(rockAt(st, 100).kind).toBe(RockKind.Free);
    expect(rockAt(st, 100).vx).toBeGreaterThan(a.vx);   // pushed
    expect([st.systems[0].hull, st.ships[0].asteroidHits, st.ships[0].graceUntil[101]]).toEqual([hull, 0, 0]);
  });
  it('a deep overlap moves the rock at most ROCK_SEPARATE_MAX; the ship takes the rest (plan deviation 7)', () => {
    const st = arena();
    mover(st, 100, 20 + 15 - 25, -2500, 0, 0, 15);   // overlap 25 with a light rock
    resolveContacts(st, true);
    expect(rockAt(st, 100).x).toBeCloseTo(10 + ROCK_SEPARATE_MAX, 9);
    expect(rockAt(st, 100).x - st.ships[0].x).toBeCloseTo(35, 9);   // fully separated
  });
});
```

Create `tests/rockPredict.test.ts`:

```ts
// Asteroids-iii §6.3: Helm's predicted path meets rocks where they will be (a rail on its rail, a free rock in a straight
// line); the scripted pilot's hazard check and the Hunter's threat check sweep the ship's velocity relative to each rock;
// the predicted rock path (§7.2) follows the sim's own motion.
import { describe, expect, it } from 'vitest';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { hazardAway } from '../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { threatAhead } from '../src/renderer/src/sim/tactical/hunter';
import { predictFlight, predictRock, rockAhead, touchesSolid } from '../src/renderer/src/sim/tactical/predict';
import { circularVelocity, railPos } from '../src/renderer/src/sim/tactical/rails';
import { moveFreeSlot } from '../src/renderer/src/sim/tactical/rockContacts';
import { rockAt, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { NO_AXES } from '../src/renderer/src/sim/tactical/state';
import type { FlightTuning } from '../src/renderer/src/sim/tactical/tuning';
import { arena, mover, rail } from './helpers/rockArena';

const STILL: FlightTuning = { gravity: false, edge: false, drag: 0, stabilise: 0 };

describe('rocks ahead (spec §6.3)', () => {
  it('rockAhead: a rail at railPos(tick + n), a free rock along its velocity', () => {
    const st = arena(), o = { x: 0, y: 0, vx: 0, vy: 0 }, ref = { x: 0, y: 0, vx: 0, vy: 0 };
    rail(st, 3, 0, 1700, 20); mover(st, 4, 100, 100, 30, -6, 10);
    rockAhead(st, 3, 90, o);
    railPos(0, 1700, 0, 0, st.tick, st.tick + 90, false, ref);
    expect([o.x, o.y]).toEqual([ref.x, ref.y]);
    rockAhead(st, 4, 60, o);
    expect(o.x).toBeCloseTo(130, 9); expect(o.y).toBeCloseTo(94, 9);
  });
  it('the Helm\'s path meets a rail that will reach it, though it is clear of the rock now', () => {
    const st = arena(), a = { ...st.ships[0] };
    rail(st, 3, a.x - 45, a.y, 10);   // 45 behind along the orbit: it moves +x at about 31.6 u/s
    expect(touchesSolid(st, a.x, a.y, 20)).toBe(false);
    const c = predictFlight(st, 0, NO_AXES, 60, 4, STILL).contact;
    expect(c).not.toBeNull();
    expect(c!.tick).toBeGreaterThan(20); expect(c!.tick).toBeLessThan(40);
  });
  it('the scripted pilot ignores a co-orbiting rock ahead and steers off a crossing one', () => {
    const d = createDuel(DUEL_LAYOUT, 3);
    try {
      const t = d.tactical, [vx, vy] = circularVelocity(0, -1700);
      t.rocks.fill(0);
      Object.assign(t.ships[0], { x: 0, y: -1700, vx, vy, heading: 64, headingAcc: 0 });
      Object.assign(t.ships[1], { x: 0, y: 1700 });
      const [cx, cy] = circularVelocity(120, -1700);
      mover(t, 100, 120, -1700, cx, cy, 10);           // 120 ahead on the same orbit, moving with it
      expect(hazardAway(d, NO_AXES)).toBeNull();
      mover(t, 100, 120, -1700, cx - 100, cy, 10);     // the same rock coming at the ship at 100 u/s
      expect(hazardAway(d, NO_AXES)).not.toBeNull();
    } finally { disposeDuel(d); }
  });
  it('the Hunter\'s threat check sweeps its velocity relative to each rock', () => {
    const st = arena();
    st.ships[1].active = true;
    const [vx, vy] = circularVelocity(1700, 0);
    Object.assign(st.ships[1], { x: 1700, y: 0, vx, vy });
    mover(st, 100, 1700, 60, vx, vy, 10);              // 60 ahead, moving with it: no threat
    expect(threatAhead(st, 1)).toBeNull();
    mover(st, 100, 1700, 60, vx, vy - 100, 10);        // closing at 100 u/s: a threat
    expect(threatAhead(st, 1)).not.toBeNull();
  });
  it('predictRock: a rail along its rail, a free rock by the sim\'s own free motion', () => {
    const st = arena();
    rail(st, 3, 0, 1700, 20);
    const railPath = predictRock(st, 3, 120, 30), o = { x: 0, y: 0, vx: 0, vy: 0 };
    railPos(0, 1700, 0, 0, st.tick, st.tick + 120, false, o);
    expect(railPath).toHaveLength(4);
    expect(railPath[3]!.x).toBeCloseTo(o.x, 9); expect(railPath[3]!.y).toBeCloseTo(o.y, 9);
    mover(st, 4, 0, -1500, 40, 5, 10);
    const freePath = predictRock(st, 4, 60, 60), v = Float64Array.from(st.rocks.subarray(4 * ROCK_STRIDE, 5 * ROCK_STRIDE));
    for (let t = 1; t <= 60; t++) moveFreeSlot(v, 0, st.tick + t);
    expect(freePath).toEqual([{ x: v[1], y: v[2] }]);
    expect(rockAt(st, 4).x).toBe(0);   // pure: the state is untouched
  });
});
```

(Numbers: at (0, −2500) a rail moves +x at ω(2500) · 2500 ≈ 31.6 u/s, so a rock 45 u behind with radii 10 + 20 reaches the ship after (45 − 30) / 31.6 ≈ 0.47 s, tick about 28; the free-motion check steps a copy with the phase tick as the sim would between ticks: `moveFreeSlot(v, 0, tick + t)`.)

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run tests/rockPredict.test.ts tests/rockShips.test.ts`
Expected: FAIL (`rockAhead`, `predictRock` and `threatAhead` not exported; the soft contact costs hull).

- [ ] **Step 3: Soft ship contacts.** In `contacts.ts` add `RAM_SOFT, ROCK_SEPARATE_MAX` to the rockTuning import and, in `shipRock`, replace `ss = (overlap * is) / (is + ik), sk = (overlap * ik) / (is + ik)` with `sk = Math.min(ROCK_SEPARATE_MAX, (overlap * ik) / (is + ik)), ss = overlap - sk` (plan deviation 7), and replace `const hull = ramHull((vc * mk) / (mk + SHIP_MASS));` with:

```ts
  const impact = (vc * mk) / (mk + SHIP_MASS);
  if (impact < RAM_SOFT) return;   // §6.2: a soft contact: the rock is pushed and freed, the ship pays nothing
  const hull = ramHull(impact);
```

Extend `shipRock`'s doc comment: `Asteroids-iii §6.2: an impact under RAM_SOFT is soft (no hull, no asteroidHits, no grace stamp, no ram damage); the rock moves at most ROCK_SEPARATE_MAX apart and the ship takes the rest (plan deviation 7).`

- [ ] **Step 4: Rocks ahead in `predict.ts`.** Replace the file's imports and `touchesSolid`, and add `rockAhead` and `predictRock`:

```ts
import { flyMissile } from './missiles';
import { railPos, type RailOut } from './rails';
import { moveFreeSlot, rockEdgeSlack } from './rockContacts';
import { isRail, rockAlive, rockAt, RockKind, rockPhase, rocksNear, rockSlots, ROCK_STRIDE, rockVx, rockVy, rockX, rockY } from './rocks';
import { flightFor, flyShip, shipEngineFactor } from './physics';
import { classOf, cloneShip, missileOf, Room, type Axes, type TacticalState } from './state';
import { DT, MISSILE_RADIUS, R_MAP, type FlightTuning } from './tuning';

export interface PathPoint { x: number; y: number }
const scratchAhead: RailOut = { x: 0, y: 0, vx: 0, vy: 0 };

/** Asteroids-iii §6.3: rock k, n ticks after the phase tick: a rail on its rail (railPos), a Free rock in a straight line. */
export function rockAhead(state: TacticalState, k: number, n: number, out: RailOut): void {
  const v = state.rocks, b = k * ROCK_STRIDE;
  if (isRail(v[b]!)) { railPos(v[b + 1]!, v[b + 2]!, v[b + 3]!, v[b + 4]!, v[b + 7]!, rockPhase(state) + n, v[b] === RockKind.Tumble, out); return; }
  out.x = v[b + 1]! + v[b + 3]! * n * DT; out.y = v[b + 2]! + v[b + 4]! * n * DT; out.vx = v[b + 3]!; out.vy = v[b + 4]!;
}

/** Whether a circle of radius r at (x, y) touches the planet or a rock, the rocks taken `ahead` ticks from now (§6.3);
 *  ahead 0 is the rocks as they stand. A rock farther than its speed can carry it in `ahead` ticks is skipped. */
export function touchesSolid(state: TacticalState, x: number, y: number, r: number, ahead = 0): boolean {
  const p = state.map.planet, pd = r + p.r;
  if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < pd * pd) return true;
  if (ahead === 0) {
    for (const k of rocksNear(state, x, y, r)) {
      const a = rockAt(state, k), d = r + a.r;
      if ((x - a.x) * (x - a.x) + (y - a.y) * (y - a.y) < d * d) return true;
    }
    return false;
  }
  const span = ahead * DT;
  for (let k = 0, n = rockSlots(state); k < n; k++) {
    if (!rockAlive(state, k)) continue;
    const rk = state.rocks[k * ROCK_STRIDE + 5]!, dx = rockX(state, k) - x, dy = rockY(state, k) - y, vx = rockVx(state, k), vy = rockVy(state, k);
    const reach = rk + r + Math.sqrt(vx * vx + vy * vy) * span + 1;
    if (dx * dx + dy * dy > reach * reach) continue;
    rockAhead(state, k, ahead, scratchAhead);
    const ex = scratchAhead.x - x, ey = scratchAhead.y - y, d = rk + r;
    if (ex * ex + ey * ey < d * d) return true;
  }
  return false;
}
```

  In `predictFlight` change `touchesSolid(state, s.x, s.y, cls.radius)` to `touchesSolid(state, s.x, s.y, cls.radius, t)`, and in `predictMissile` change `touchesSolid(state, m.x, m.y, MISSILE_RADIUS)` to `touchesSolid(state, m.x, m.y, MISSILE_RADIUS, t)`. Add at the end of the file:

```ts
/** Asteroids-iii §7.2: rock k's next `ticks` ticks, a point every `every`, contacts ignored: a rail on its rail, a Free
 *  rock by the sim's own free motion on a copy (moveFreeSlot, the phase tick advancing). Empty for a gone slot. Pure. */
export function predictRock(state: TacticalState, k: number, ticks: number, every: number): PathPoint[] {
  const out: PathPoint[] = [], b = k * ROCK_STRIDE, stride = Math.max(1, Math.floor(every)), T = rockPhase(state);
  if (!rockAlive(state, k)) return out;
  if (isRail(state.rocks[b]!)) {
    for (let t = stride; t <= ticks; t += stride) { rockAhead(state, k, t, scratchAhead); out.push({ x: scratchAhead.x, y: scratchAhead.y }); }
    return out;
  }
  const v = Float64Array.from(state.rocks.subarray(b, b + ROCK_STRIDE)), far = R_MAP + rockEdgeSlack();
  for (let t = 1; t <= ticks; t++) {
    moveFreeSlot(v, 0, T + t);
    if (v[1]! * v[1]! + v[2]! * v[2]! > far * far) break;
    if (t % stride === 0) out.push({ x: v[1]!, y: v[2]! });
  }
  return out;
}
```

  Update the file's header comment: `Asteroids-iii §6.3: the path meets rocks where they will be at the same tick (rockAhead).`

- [ ] **Step 5: Relative sweeps.** In `src/renderer/src/sim/duel/scripted.ts` change the imports `rockAt, rocksNear` to `rockAlive, rockSlots, rockVx, rockVy, rockX, rockY, ROCK_STRIDE` (from `../tactical/rocks`), `predictPath` to `predictFlight` (from `../tactical/predict`), add `DT` to its tuning import if not there, and replace `hazardAway` with:

```ts
/** Rule 1 (spec §3; asteroids-iii §6.3): the heading away from the first hazard on the predicted path, as a direction, or
 *  null. Each path point (taken every 4 ticks, the last at the first contact) is tested against each rock moved along its
 *  own velocity to that tick, so the sweep is relative to the rock: a co-orbiting belt is no hazard, a crossing rock is. */
export function hazardAway(d: DuelState, axes: Axes): { x: number; y: number } | null {
  const t = d.tactical, s = t.ships[0], p = t.map.planet, keep = SHIP_RADIUS + AVOID_MARGIN, every = 4;
  const flight = predictFlight(t, 0, axes, AVOID_TICKS, every), pts = flight.points;
  for (let j = 0; j < pts.length; j++) {
    const q = pts[j]!, n = flight.contact && j === pts.length - 1 ? flight.contact.tick : (j + 1) * every;
    if (len(q.x - p.x, q.y - p.y) < p.r + keep) return { x: s.x - p.x, y: s.y - p.y };
    if (len(q.x, q.y) > t.map.rMap - AVOID_MARGIN) return { x: -s.x, y: -s.y };
    let best = -1, bestClear = 0;
    for (let k = 0, m = rockSlots(t); k < m; k++) {
      if (!rockAlive(t, k)) continue;
      const r = t.rocks[k * ROCK_STRIDE + 5]!, ax = rockX(t, k) + rockVx(t, k) * n * DT, ay = rockY(t, k) + rockVy(t, k) * n * DT, dist = len(q.x - ax, q.y - ay);
      if (dist < r + keep && (best < 0 || dist - r < bestClear)) { best = k; bestClear = dist - r; }   // ascending k: ties keep the lower index
    }
    if (best >= 0) return { x: s.x - rockX(t, best), y: s.y - rockY(t, best) };
  }
  return null;
}
```

  In `src/renderer/src/sim/tactical/hunter.ts` add `ROCK_MAX_SPEED` (rockTuning) to the imports, and replace `threatAhead` with:

```ts
/** The first solid body ship i's straight-line path over the lookahead comes within its radius + margin of, or null.
 *  Asteroids-iii §6.3: against a rock the sweep is the ship's velocity relative to the rock's, so a co-orbiting rock is no
 *  threat. Exported for the tests. */
export function threatAhead(state: TacticalState, i: number): { x: number; y: number } | null {
  const s = state.ships[i]!, L = HUNTER_LOOKAHEAD_S, ex = s.x + s.vx * L, ey = s.y + s.vy * L, p = state.map.planet;
  if (segmentNear(s.x, s.y, ex, ey, p.x, p.y, p.r + HUNTER_AVOID_MARGIN)) return p;
  const reach = (Math.sqrt(s.vx * s.vx + s.vy * s.vy) + ROCK_MAX_SPEED) * L + HUNTER_AVOID_MARGIN;
  for (const k of rocksNear(state, s.x, s.y, reach)) {
    const a = rockAt(state, k), rx = s.x + (s.vx - a.vx) * L, ry = s.y + (s.vy - a.vy) * L;
    if (segmentNear(s.x, s.y, rx, ry, a.x, a.y, a.r + HUNTER_AVOID_MARGIN)) return a;
  }
  return null;
}
```

- [ ] **Step 6: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockPredict.test.ts tests/rockShips.test.ts tests/tacticalDeterminism.test.ts tests/tacticalContacts.test.ts tests/feelIiModels.test.ts tests/engWeapons.test.ts tests/boundary.test.ts`
Expected: PASS (`tacticalDeterminism`'s predictPath cases run with no rock near the path, and `engWeapons` clears every rock before its `touchesSolid` check). `duelGates` runs in Task 14.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/contacts.ts src/renderer/src/sim/tactical/predict.ts src/renderer/src/sim/duel/scripted.ts src/renderer/src/sim/tactical/hunter.ts tests/rockPredict.test.ts tests/rockShips.test.ts
git commit -m "feat(asteroids-iii): soft ship contacts under 15 u/s, the rock-side separation cap; predictions meet rocks where they will be; hazard and threat sweeps relative to each rock (spec §6.2, §6.3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The renderer: smooth motion, trails, relative streaks, spin, the predicted path, shards, the touch cue, hit-stop

Renderer only (render files may use any Math). Online guests get no rock events (§9), so trails and streaks are built from state.

**Files:**
- Create: `src/renderer/src/render/tactical/rockTrack.ts`
- Modify: `src/renderer/src/render/tactical/tacticalModel.ts` (input `rockTrack`; `AsteroidDraw` gains `spin`, `trail`; relative streaks; `TacticalDraw.rockPath`; `asteroidSpin`; `crackDraw` gains `spin`)
- Modify: `src/renderer/src/render/tactical/tacticalLayer.ts` (the asteroid loop: spin, trails; the rock path)
- Modify: `src/renderer/src/render/tactical/fxModel.ts` (`FxState.hold`), `rockFx.ts` (shards, puffs, touch spark, `holdFrame`), `src/renderer/src/audio/rockSounds.ts` (the touch knock)
- Modify: `src/renderer/src/app/duel/scene.ts` (the rock track, hit-stop)
- Test: `tests/rockTrack.test.ts`; modify `tests/rockFx.test.ts`, `tests/rockSounds.test.ts`, `tests/rockCracks.test.ts`

**Interfaces:**
- Consumes: `orbitRate`, `SPIN_RATE`, `circularVelocity` (rails.ts); `predictRock` (predict.ts, Task 11); `isRail`, `RockKind`, `rockT`, `rockX`, `rockY`, `rockSlots`, `ROCK_STRIDE` (rocks.ts); `fxRandom`, `FxState`, `FxItem`, `ViewEvent` (fxModel.ts); `crackDraw` (Task 2).
- Produces (rockTrack.ts): `TRAIL_HZ = 4`, `TRAIL_LEN = 100`, `TRAIL_YOUNG_S = 25`, `TRAIL_OLD_S = 6`, `YOUNG_AGE_S = 60`, `JUMP_RESET_U = 50`; `interface RockTrack`; `createRockTrack(): RockTrack`; `resetRockTrack(t: RockTrack): void`; `updateRockTrack(t: RockTrack, s: TacticalState): void`; `rockDrawPos(t: RockTrack | null, s: TacticalState, k: number, alpha: number): Point`; `rockTrail(t: RockTrack, s: TacticalState, k: number): Point[]` (world, oldest first).
- Produces (tacticalModel.ts): `STREAK_MIN_REL = 8, STREAK_S = 1, STREAK_MAX_U = 90`; `asteroidSpin(index: number): number` (rad/s, ±0.1 to 0.5); `crackDraw(index, wear, cx, cy, r, spin = 0)`; `ROCK_PATH_TICKS = 1200, ROCK_PATH_EVERY = 30`. (rockFx.ts) `SHARD_COUNT = 16`, `SHARD_SPEED = [150, 250]`, `SHARD_LIFE = [1, 2]`, `PUFF_COUNT = 6`, `TOUCH_SPARK_S = 0.18`, `HIT_STOP_S = 0.08`; `holdFrame(fx: FxState, dt: number): boolean`. (rockSounds.ts) `ROCK_TOUCH: SoundRequest`.

- [ ] **Step 1: Write the failing tests.** Create `tests/rockTrack.test.ts`:

```ts
// Asteroids-iii §7.1, §7.2, §13.5 (renderer): rails drawn at tick − 1 + α, free rocks lerped from the last tick, trails
// (25 s at 4 Hz while young, 6 s after) that reset on a kind or r change or a jump, streaks relative to V_c, the outline
// spin, and the predicted path of the Weapons map's rock target.
import { describe, expect, it } from 'vitest';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { createRockTrack, JUMP_RESET_U, rockDrawPos, rockTrail, TRAIL_LEN, updateRockTrack } from '../src/renderer/src/render/tactical/rockTrack';
import { asteroidSpin, tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { circularVelocity, orbitRate } from '../src/renderer/src/sim/tactical/rails';
import { NO_AXES } from '../src/renderer/src/sim/tactical/state';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { arena, mover, rail } from './helpers/rockArena';

const model = (st: ReturnType<typeof arena>, extra: Partial<TacticalModelInput> = {}) => tacticalModel({ state: st, prev: st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading })), alpha: 1, camera: createCamera(0, 2000, 1),
  viewport: { w: 1280, h: 720 }, console: 'weapons', axes: NO_AXES, ships: [0], paused: false, reserveRight: 0, ...extra } as TacticalModelInput);

describe('the rock track (spec §7.1, §13.5)', () => {
  it('draws a rail at tick − 1 + α by its rotation, and a free rock lerped from the last tick', () => {
    const st = arena(), track = createRockTrack();
    rail(st, 3, 0, 1700, 20); mover(st, 4, 0, 2000, 30, 0, 10);
    updateRockTrack(track, st);
    stepDuel(st, IDLE_INPUT); updateRockTrack(track, st);
    const p = rockDrawPos(track, st, 3, 0.25), a = orbitRate(1700) * (st.tick - 1 + 0.25 - 0) / 60;
    expect(p.x).toBeCloseTo(-Math.sin(a) * 1700, 9); expect(p.y).toBeCloseTo(Math.cos(a) * 1700, 9);
    const q = rockDrawPos(track, st, 4, 0.5);
    expect(q.x).toBeCloseTo((0 + st.rocks[4 * 8 + 1]!) / 2, 9);
  });
  it('keeps 25 s of 4 Hz samples while a free rock is young and shows 6 s once it is older than 60 s; resets on a kind or r change or a jump', () => {
    const st = arena(), track = createRockTrack(), [vx, vy] = circularVelocity(0, 1700);
    mover(st, 4, 0, 1700, vx, vy + 5, 10);   // 5 u/s off circular, so it does not settle onto a rail within the test
    updateRockTrack(track, st);
    for (let t = 0; t < 40 * 60; t++) { stepDuel(st, IDLE_INPUT); updateRockTrack(track, st); }
    expect(rockTrail(track, st, 4)).toHaveLength(TRAIL_LEN);                  // 25 s × 4 Hz
    st.rocks[4 * 8 + 7] = st.tick - 61 * 60;                                   // older than 60 s
    expect(rockTrail(track, st, 4)).toHaveLength(6 * 4);
    st.rocks[4 * 8 + 5] = 11; stepDuel(st, IDLE_INPUT); updateRockTrack(track, st);
    expect(rockTrail(track, st, 4).length).toBeLessThanOrEqual(1);              // r changed: a new rock in this slot
    st.rocks[4 * 8 + 1]! += JUMP_RESET_U + 1; stepDuel(st, IDLE_INPUT); updateRockTrack(track, st);
    expect(rockTrail(track, st, 4).length).toBeLessThanOrEqual(1);              // jumped
  });
});

describe('the map model (spec §7.1, §7.2, §13.5)', () => {
  it('a free rock streaks only by its speed relative to V_c; a co-orbiting one does not', () => {
    const st = arena(), [vx, vy] = circularVelocity(0, 2000);
    mover(st, 10, 0, 2000, vx, vy, 10); mover(st, 11, 100, 2000, vx + 30, vy, 10);
    const m = model(st), still = m.asteroids.find((a) => a.index === 10)!, fast = m.asteroids.find((a) => a.index === 11)!;
    expect(still.streak).toBeUndefined();
    expect(fast.streak).toBeDefined();
    expect(fast.streak!.alpha).toBeCloseTo(Math.min(1, (Math.hypot(30 + vx - circularVelocity(100, 2000)[0], vy - circularVelocity(100, 2000)[1]) - 8) / 40), 6);
  });
  it('every outline turns at its own hashed rate of 0.1 to 0.5 rad/s, either way', () => {
    for (let i = 0; i < 200; i++) { const w = Math.abs(asteroidSpin(i)); expect(w).toBeGreaterThanOrEqual(0.1); expect(w).toBeLessThanOrEqual(0.5); }
    expect(new Set(Array.from({ length: 50 }, (_, i) => Math.sign(asteroidSpin(i)))).size).toBe(2);
    const st = arena(); rail(st, 3, 0, 2000, 20); st.tick = 600;
    expect(model(st).asteroids.find((a) => a.index === 3)!.spin).toBeCloseTo(asteroidSpin(3) * (600 + 1) / 60, 9);
  });
  it('draws the Weapons map\'s rock target\'s next 20 s as a dotted path; none without a target or off Weapons', () => {
    const st = arena(); rail(st, 3, 0, 2000, 20);
    expect(model(st, { contacts: true }).rockPath).toBeUndefined();
    st.systems[0].laserRock = 3;
    expect(model(st, { contacts: true }).rockPath).toHaveLength(40);
    expect(model(st, { contacts: true, console: 'helm' }).rockPath).toBeUndefined();
  });
});
```

  In `tests/rockFx.test.ts` replace the test `'a break: a burst sized by the rock and 10 to 16 specks; dust: a burst and a puff; a hit alone: nothing'` with the cases below, replace `describe('streaks and cracks in the map model ...')`'s streak test `'a rock faster than 20 u/s streaks behind it ...'` by deleting it (relative streaks are in `tests/rockTrack.test.ts`), and add `holdFrame, HIT_STOP_S, PUFF_COUNT, SHARD_COUNT, TOUCH_SPARK_S` to the rockFx import:

```ts
  it('a burst split: a burst sized by the rock and 16 shards at 150 to 250 u/s fading over 1 to 2 s, and the hit-stop', () => {
    const fx = createFx();
    pushRockFx(fx, [{ ...rock('split', 'torpedo'), burst: true } as ViewEvent]);
    expect(of(fx.items, 'burst')).toMatchObject([{ size: 30 }]);
    const shards = of(fx.items, 'speck');
    expect(shards).toHaveLength(SHARD_COUNT);
    for (const s of shards) {
      const sp = Math.hypot(s.vx! - 20, s.vy!);
      expect(sp).toBeGreaterThanOrEqual(150); expect(sp).toBeLessThanOrEqual(250);
      expect(s.life).toBeGreaterThanOrEqual(1); expect(s.life).toBeLessThanOrEqual(2);
    }
    expect(fx.hold).toBe(HIT_STOP_S);
  });
  it('a fan split or a dust: a burst and a puff of 6 shards, no hit-stop; a hit alone: nothing', () => {
    for (const what of ['split', 'dust'] as const) {
      const fx = createFx(); pushRockFx(fx, [rock(what)]);
      expect(of(fx.items, 'burst')).toHaveLength(1);
      expect(of(fx.items, 'speck')).toHaveLength(PUFF_COUNT);
      expect(fx.hold).toBe(0);
    }
    const hit = createFx(); pushRockFx(hit, [rock('hit')]);
    expect(hit.items).toEqual([]);
  });
  it('a touch: a small spark (a slow billiard\'s cue)', () => {
    const fx = createFx();
    pushRockFx(fx, [{ kind: 'rock', what: 'touch', by: 'collision', rock: 1, other: 2, x: 5, y: 6, r: 10, vx: 0, vy: 0, speed: 9 } as ViewEvent]);
    expect(fx.items).toMatchObject([{ kind: 'spark', life: TOUCH_SPARK_S, x1: 5, y1: 6 }]);
  });
  it('hit-stop: holdFrame holds while fx.hold lasts, then lets drawing go on', () => {
    const fx = createFx();
    expect(holdFrame(fx, 1 / 60)).toBe(false);
    fx.hold = HIT_STOP_S;
    let held = 0;
    for (let k = 0; k < 10; k++) if (holdFrame(fx, 1 / 60)) held++;
    expect(held).toBe(5);   // 80 ms at 60 frames a second
    expect(fx.hold).toBe(0);
  });
```

  In `tests/rockSounds.test.ts` add `ROCK_TOUCH` to the import and append inside the describe:

```ts
  it('a touch plays the soft knock (asteroids-iii §5.6)', () => {
    expect(rockSounds(null, [{ kind: 'rock', what: 'touch', by: 'collision', rock: 1, other: 2, x: 0, y: 0, r: 10, vx: 0, vy: 0, speed: 9 } as ViewEvent], pan, 0).sounds).toEqual([{ ...ROCK_TOUCH, pan: 0.1 }]);
  });
```

  In `tests/rockCracks.test.ts` append inside its describe:

```ts
  it('the cracks turn with the outline (§13.5): crackDraw with a spin is the unspun strokes turned about the centre', () => {
    const a = crackDraw(9, 1, 100, 100, 40), b = crackDraw(9, 1, 100, 100, 40, Math.PI / 2);
    a.forEach((s, i) => { expect(b[i]!.x1).toBeCloseTo(100 - (s.y1 - 100), 9); expect(b[i]!.y1).toBeCloseTo(100 + (s.x1 - 100), 9); });
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run tests/rockTrack.test.ts tests/rockFx.test.ts tests/rockSounds.test.ts tests/rockCracks.test.ts`
Expected: FAIL (`rockTrack` missing; no shards, touch spark, hold or `ROCK_TOUCH`).

- [ ] **Step 3: Create `src/renderer/src/render/tactical/rockTrack.ts`**

```ts
// Asteroids-iii §7.1, §13.5 (renderer only): each rock slot's history for smooth motion and trails, view-owned and never
// hashed. A rail is drawn at tick − 1 + α by rotating its centre and offset (any Math here: renderer); a free rock is lerped
// from its last-tick position. Free rocks keep a ring of TRAIL_LEN samples at TRAIL_HZ: a rock younger than YOUNG_AGE_S
// shows TRAIL_YOUNG_S of it, an older one TRAIL_OLD_S. A slot's history resets when its kind or r changes or it jumps more
// than JUMP_RESET_U between ticks, which covers slot reuse on guests (who get no rock events).
import { isRail, RockKind, rockSlots, ROCK_STRIDE, rockT, rockX, rockY } from '../../sim/tactical/rocks';
import { orbitRate, SPIN_RATE } from '../../sim/tactical/rails';
import type { TacticalState } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
import type { Point } from './camera';

export const TRAIL_HZ = 4, TRAIL_YOUNG_S = 25, TRAIL_OLD_S = 6, YOUNG_AGE_S = 60, JUMP_RESET_U = 50;
export const TRAIL_LEN = TRAIL_YOUNG_S * TRAIL_HZ;
const TRAIL_EVERY = TICK_HZ / TRAIL_HZ;
export interface RockTrack { tick: number; n: number; kind: Float64Array; r: Float64Array; px: Float64Array; py: Float64Array; cx: Float64Array; cy: Float64Array; trail: Float64Array; head: Int32Array; len: Int32Array }

export function createRockTrack(): RockTrack {
  return { tick: -1, n: 0, kind: new Float64Array(0), r: new Float64Array(0), px: new Float64Array(0), py: new Float64Array(0), cx: new Float64Array(0), cy: new Float64Array(0), trail: new Float64Array(0), head: new Int32Array(0), len: new Int32Array(0) };
}
export function resetRockTrack(t: RockTrack): void { t.tick = -1; t.len.fill(0); t.head.fill(0); }
function sized(t: RockTrack, n: number): void {
  Object.assign(t, { n, tick: -1, kind: new Float64Array(n), r: new Float64Array(n), px: new Float64Array(n), py: new Float64Array(n), cx: new Float64Array(n), cy: new Float64Array(n), trail: new Float64Array(n * TRAIL_LEN * 2), head: new Int32Array(n), len: new Int32Array(n) });
}
/** Once per frame: on a new tick, shift each slot's positions, reset what changed, and sample the free rocks' trails. */
export function updateRockTrack(t: RockTrack, s: TacticalState): void {
  const n = rockSlots(s);
  if (t.n !== n) sized(t, n);
  if (s.tick === t.tick) return;
  const first = t.tick < 0, sample = first || Math.floor(s.tick / TRAIL_EVERY) !== Math.floor(t.tick / TRAIL_EVERY);
  for (let k = 0; k < n; k++) {
    const kind = s.rocks[k * ROCK_STRIDE]!;
    if (kind === RockKind.Gone) { t.kind[k] = 0; t.len[k] = 0; continue; }
    const x = rockX(s, k), y = rockY(s, k), r = s.rocks[k * ROCK_STRIDE + 5]!;
    const reset = first || t.kind[k] !== kind || t.r[k] !== r || Math.hypot(x - t.cx[k]!, y - t.cy[k]!) > JUMP_RESET_U;
    if (reset) { t.px[k] = x; t.py[k] = y; t.len[k] = 0; t.head[k] = 0; } else { t.px[k] = t.cx[k]!; t.py[k] = t.cy[k]!; }
    t.cx[k] = x; t.cy[k] = y; t.kind[k] = kind; t.r[k] = r;
    if (kind === RockKind.Free && (reset || sample)) {
      const at = (k * TRAIL_LEN + t.head[k]!) * 2;
      t.trail[at] = x; t.trail[at + 1] = y;
      t.head[k] = (t.head[k]! + 1) % TRAIL_LEN; t.len[k] = Math.min(TRAIL_LEN, t.len[k]! + 1);
    }
  }
  t.tick = s.tick;
}
/** Where to draw rock k this frame: a rail at tick − 1 + α (its anchor at least), a free rock lerped from its last tick. */
export function rockDrawPos(t: RockTrack | null, s: TacticalState, k: number, alpha: number): Point {
  const v = s.rocks, b = k * ROCK_STRIDE;
  if (isRail(v[b]!)) {
    const cx = v[b + 1]!, cy = v[b + 2]!, ox = v[b + 3]!, oy = v[b + 4]!, n = Math.max(0, s.tick - 1 + alpha - v[b + 7]!);
    const ac = (orbitRate(Math.hypot(cx, cy)) * n) / TICK_HZ, ao = ac + (v[b] === RockKind.Tumble ? (SPIN_RATE * n) / TICK_HZ : 0);
    return { x: Math.cos(ac) * cx - Math.sin(ac) * cy + Math.cos(ao) * ox - Math.sin(ao) * oy, y: Math.sin(ac) * cx + Math.cos(ac) * cy + Math.sin(ao) * ox + Math.cos(ao) * oy };
  }
  if (!t || t.tick !== s.tick || k >= t.n) return { x: v[b + 1]!, y: v[b + 2]! };
  return { x: t.px[k]! + (t.cx[k]! - t.px[k]!) * alpha, y: t.py[k]! + (t.cy[k]! - t.py[k]!) * alpha };
}
/** Rock k's trail in world units, oldest first: 25 s while it is younger than 60 s, 6 s after; empty for a rail. */
export function rockTrail(t: RockTrack, s: TacticalState, k: number): Point[] {
  if (k >= t.n || s.rocks[k * ROCK_STRIDE] !== RockKind.Free) return [];
  const young = (s.tick - rockT(s, k)) / TICK_HZ < YOUNG_AGE_S, keep = Math.min(t.len[k]!, (young ? TRAIL_YOUNG_S : TRAIL_OLD_S) * TRAIL_HZ), out: Point[] = [];
  for (let i = keep; i >= 1; i--) {
    const at = (k * TRAIL_LEN + ((t.head[k]! - i + TRAIL_LEN) % TRAIL_LEN)) * 2;
    out.push({ x: t.trail[at]!, y: t.trail[at + 1]! });
  }
  return out;
}
```

- [ ] **Step 4: The map model.** In `src/renderer/src/render/tactical/tacticalModel.ts`:
  - Imports: add `import { predictRock } from '../../sim/tactical/predict';` (next to `predictFlight`), `import { circularVelocity } from '../../sim/tactical/rails';`, `import { rockDrawPos, rockTrail, type RockTrack } from './rockTrack';`; the `rocks` import becomes `rockAlive, rockAt, rockHpMax, RockKind, rockSlots`.
  - Replace the streak constants (`STREAK_MIN_SPEED = 20, STREAK_S = 0.25, STREAK_MAX_U = 90`) and their comment with `/** Asteroids-iii §7.1: a free rock streaks along its velocity relative to V_c(p) when that is above STREAK_MIN_REL (u/s), for STREAK_S seconds of that motion, at most STREAK_MAX_U (plan deviation 12). */ export const STREAK_MIN_REL = 8, STREAK_S = 1, STREAK_MAX_U = 90;` and add `/** §7.2: the predicted path of the Weapons map's rock target: ticks and the dot spacing (20 s, a dot every 0.5 s). */ export const ROCK_PATH_TICKS = 1200, ROCK_PATH_EVERY = 30;`.
  - `AsteroidDraw` becomes `export interface AsteroidDraw extends CircleDraw { index: number; dot: boolean; wear?: number; streak?: { x: number; y: number; alpha: number }; spin?: number; trail?: Point[] }` (doc: `spin` the outline's turn in radians (§13.5), `trail` the free rock's trail in screen px, oldest first).
  - `TacticalModelInput` gains `/** Asteroids-iii §7.1: the scene's rock track (smooth motion and trails); absent: rocks at their tick positions. */ rockTrack?: RockTrack | null;`. `TacticalDraw` gains `/** Asteroids-iii §7.2: the Weapons map's rock target's predicted path (screen px). */ rockPath?: Point[];`.
  - Replace the asteroid loop body (from `const a = rockAt(state, index), r = a.r * z;` through the `asteroids.push(...)`) with:

```ts
    const a = rockAt(state, index), r = a.r * z, w = rockDrawPos(input.rockTrack ?? null, state, index, alpha);
    if (r < DOT_MIN_PX || !onScreen(w.x, w.y, a.r)) continue;
    const p = toS(w.x, w.y);
    let streak: { x: number; y: number; alpha: number } | null = null;
    if (a.kind === RockKind.Free) {   // §7.1: by its speed relative to the circular orbit there, never its absolute speed
      const [cx, cy] = circularVelocity(a.x, a.y), ux = a.vx - cx, uy = a.vy - cy, rel = Math.hypot(ux, uy);
      if (rel > STREAK_MIN_REL) { const tail = Math.min(STREAK_MAX_U, rel * STREAK_S) / rel; streak = { ...toS(w.x - ux * tail, w.y - uy * tail), alpha: Math.min(1, (rel - STREAK_MIN_REL) / 40) }; }
    }
    const trail = input.rockTrack && a.kind === RockKind.Free ? rockTrail(input.rockTrack, state, index).map((q) => toS(q.x, q.y)) : [];
    asteroids.push({ index, x: p.x, y: p.y, r, dot: r < ASTEROID_DOT_PX, wear: Math.max(0, Math.min(1, 1 - a.hp / rockHpMax(a.r))), spin: (asteroidSpin(index) * (state.tick + alpha)) / TICK_HZ,
      ...(streak ? { streak } : {}), ...(trail.length > 1 ? { trail } : {}) });
```

  - After the rock marks block (before the fog block) add:

```ts
  // Asteroids-iii §7.2: the Weapons map's rock target (the laser's, else the torpedo's, else the flying torpedo's) and its next 20 s.
  let rockPath: Point[] | undefined;
  if (input.contacts && input.console === 'weapons') {
    const sys = state.systems[CREW_SLOT]!, k = sys.laserRock >= 0 ? sys.laserRock : sys.torpRock >= 0 ? sys.torpRock : sys.torpRockFlying;
    if (k >= 0 && rockAlive(state, k)) rockPath = predictRock(state, k, ROCK_PATH_TICKS, ROCK_PATH_EVERY).map((q) => toS(q.x, q.y));
  }
```

  and add `...(rockPath ? { rockPath } : {}),` to the returned object next to `...(rockMarks ? { rockMarks } : {}),`.
  - Next to `asteroidShape` add:

```ts
/** Asteroids-iii §13.5: rock `index`'s outline spin, a hashed ±0.1 to 0.5 rad/s (drawing only; the cracks turn with it). */
export function asteroidSpin(index: number): number {
  const h = Math.imul(((index + 1) * 2654435761) >>> 0 ^ 0x9e3779b9, 2246822519) >>> 0, f = (h % 10000) / 10000;
  return (h & 1 ? 1 : -1) * (0.1 + 0.4 * f);
}
```

  - `crackDraw` gains a last parameter `spin = 0`: inside, after computing each local point `line[i]`, turn it by `spin` before scaling: replace the four coordinate expressions with `const c = Math.cos(spin), sn = Math.sin(spin), lx0 = line[i - 1]!.x * c - line[i - 1]!.y * sn, ly0 = line[i - 1]!.x * sn + line[i - 1]!.y * c, lx1 = line[i]!.x * c - line[i]!.y * sn, ly1 = line[i]!.x * sn + line[i]!.y * c;` then `x1 = cx + lx0 * r, y1 = cy + ly0 * r, x2 = cx + lx1 * r, y2 = cy + ly1 * r` (hoist `c` and `sn` above the loops). Update its doc comment: `spin: the outline's turn (§13.5).`

- [ ] **Step 5: The layer.** In `tacticalLayer.ts`, in the asteroid loop: before the streak, draw the trail; turn the outline by the spin; pass the spin to `crackDraw`; after the loop draw the rock path:

```ts
        if (a.trail) for (let i = 1; i < a.trail.length; i++) {   // §7.1, §13.5: the free rock's fading trail, oldest faintest
          const p0 = a.trail[i - 1]!, p1 = a.trail[i]!;
          bodies.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ width: 1, color: CRT.dim, alpha: (0.5 * i) / a.trail.length });
        }
```

  (insert at the top of `for (const a of d.asteroids) {`); change the outline point line to `shape.forEach((m, k) => { const ang = (k / shape.length) * Math.PI * 2 + (a.spin ?? 0); pts.push(a.x + Math.cos(ang) * a.r * m, a.y + Math.sin(ang) * a.r * m); });` and the cracks line to `for (const s of crackDraw(a.index, wear, a.x, a.y, a.r, a.spin ?? 0)) ...`; after the loop:

```ts
      for (const q of d.rockPath ?? []) bodies.rect(Math.round(q.x) - 1, Math.round(q.y) - 1, 2, 2).fill({ color: CRT.mid, alpha: 0.8 });   // §7.2: the target's next 20 s
```

- [ ] **Step 6: Shards, the touch cue, hit-stop and the knock.**
  - `fxModel.ts`: `FxState` gains `/** Asteroids-iii §5.6: seconds of hit-stop left (the tactical layer holds its last drawing). */ hold: number;`; `createFx` returns `hold: 0`; `resetFx` sets `fx.hold = 0`.
  - `rockFx.ts`: add the constants and `holdFrame`, and replace the `split`/`dust` branch and the `bump` branch of `pushRockFx`:

```ts
/** Asteroids-iii §5.6: a burst split throws SHARD_COUNT shards at SHARD_SPEED u/s living SHARD_LIFE s, and holds the
 *  tactical drawing for HIT_STOP_S; a fan split or a dust puffs PUFF_COUNT; a touch sparks for TOUCH_SPARK_S. */
export const SHARD_COUNT = 16, SHARD_SPEED = [150, 250] as const, SHARD_LIFE = [1, 2] as const, PUFF_COUNT = 6, TOUCH_SPARK_S = 0.18, HIT_STOP_S = 0.08;
/** §5.6: whether this frame holds the tactical drawing (hit-stop), spending `dt` of it. Effects and positions hold; after
 *  it the drawing snaps to the live state. The sim never pauses. */
export function holdFrame(fx: FxState, dt: number): boolean {
  if (fx.hold <= 0) return false;
  fx.hold = Math.max(0, fx.hold - dt);
  return true;
}
```

```ts
    if (e.what === 'split' || e.what === 'dust') {   // §5.6
      fx.items.push({ kind: 'burst', age: 0, life: BURST_S * 2, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: BURST, size: e.r });
      if (e.what === 'split' && e.burst) {
        for (let j = 0; j < SHARD_COUNT; j++) fling(fx, 'speck', SHARD_LIFE[0] + fxRandom(fx) * (SHARD_LIFE[1] - SHARD_LIFE[0]), e.x, e.y, (2 * Math.PI * j) / SHARD_COUNT, 0.2, SHARD_SPEED[0], SHARD_SPEED[1], e.vx, e.vy, CRT.main);
        fx.hold = HIT_STOP_S;
      } else {
        const moving = Math.hypot(e.vx, e.vy) > 1, along = moving ? Math.atan2(e.vy, e.vx) : 0;
        for (let n = 0; n < PUFF_COUNT; n++) fling(fx, 'speck', PUFF_S, e.x, e.y, along, moving ? 0.8 : Math.PI, 20, 90, e.vx, e.vy, CRT.mid);
      }
    }
```

  and after the `bump` branch add `else if (e.what === 'touch') fx.items.push({ kind: 'spark', age: 0, life: TOUCH_SPARK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.mid });   // §5.6: a slow billiard's cue`. (The shard speeds are on top of the parent's velocity, so the test subtracts the event's vx 20.) Update the header comment with `asteroids-iii §5.6: shards, puffs, the touch spark, the hit-stop`.
  - `rockSounds.ts`: add `export const ROCK_TOUCH: SoundRequest = { key: 'impactMetal', gain: 0.15, rate: 0.5, dur: 0.15, filter: { type: 'lowpass', from: 600 } };` and, after the `bump` line, `else if (e.what === 'touch') tiers[3]!.push({ sound: ROCK_TOUCH, x: e.x, y: e.y });   // asteroids-iii §5.6: a soft knock, the slow billiards' cue`.

- [ ] **Step 7: The scene.** In `src/renderer/src/app/duel/scene.ts`:
  - Import `createRockTrack, resetRockTrack, updateRockTrack` from `../../render/tactical/rockTrack` and add `holdFrame` to the `rockFx` import.
  - After `const fx = createFx();` (line 208) add `const rockTrack = createRockTrack();   // asteroids-iii §7.1: smooth motion and trails`.
  - In the new-round block, after `resetFx(fx);` add `resetRockTrack(rockTrack);`.
  - Replace `const events = source.drainEvents();` with `const held = holdFrame(fx, dt);   // asteroids-iii §5.6: hit-stop (it holds from the frame after the burst; plan deviation 10)` on the line before it, keeping the line.
  - Change `stepFx(fx, frozen ? 0 : fxDt(fx, dt));` to `stepFx(fx, frozen || held ? 0 : fxDt(fx, dt));`.
  - Before `const input = {` add `updateRockTrack(rockTrack, d.tactical);` and add `rockTrack,` to the input object.
  - Wrap the `layer.draw(model, combatModel(...), t);` call in `if (!held) { ... }` (the model and the overlay are still computed).

- [ ] **Step 8: Run the tests**

Run: `npm run typecheck && npx vitest run tests/rockTrack.test.ts tests/rockFx.test.ts tests/rockSounds.test.ts tests/rockCracks.test.ts tests/rockTargetModel.test.ts tests/tacticalModel.test.ts tests/tacticalLayer.test.ts tests/crtColours.test.ts tests/contactScene.test.ts tests/audioDuel.test.ts tests/duelWeaponsView.test.ts`
Expected: PASS. If `crtColours.test.ts` lists the layer's colours, the new strokes use `CRT.dim` and `CRT.mid` only.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/render/tactical/rockTrack.ts src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/render/tactical/fxModel.ts src/renderer/src/render/tactical/rockFx.ts src/renderer/src/audio/rockSounds.ts src/renderer/src/app/duel/scene.ts tests/rockTrack.test.ts tests/rockFx.test.ts tests/rockSounds.test.ts tests/rockCracks.test.ts
git commit -m "feat(asteroids-iii): the renderer: rails drawn between ticks, free rocks lerped, 25 s trails while young, relative streaks, outline spin, the target's predicted path, shards, the touch cue and hit-stop (spec §5.6, §7, §13.5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Measurements: the feel check, stress, cost, idle and after-burst gates; the tuning rule

**Files:**
- Create: `scripts/spike-asteroids-iii-measure.ts`
- Create (by running it): `docs/superpowers/research/2026-11-19-asteroids-iii-measure.json`
- Conditional (Step 4 only): `src/renderer/src/sim/tactical/rockTuning.ts` (one named knob at a time)

**Interfaces:**
- Consumes: `quietRun`, `median`, `IDLE_SEEDS`, `IDLE_WINDOWS`, `BURST_TIMES`, `BURST_WINDOW` (scripts/spike-asteroids-iii-idle.ts, Task 1); `switchOff`, `parkCoOrbit`, `stressInput` (tests/helpers/rockStress.ts, Task 7); `ROCK_SWITCHES` (rockTuning.ts); the sim.
- Produces: the JSON results the report (Task 15) quotes; an exit code of 1 when a gate fails.

- [ ] **Step 1: Write `scripts/spike-asteroids-iii-measure.ts`**

```ts
// Asteroids-iii measurements (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md §8.2, §8.3, §13.7):
//   npx tsx scripts/spike-asteroids-iii-measure.ts [--json <path>] [--only feel|stress|cost|idle|burst]
// feel   §8.2: seed 2026, the Hunter off, the crew on a circular orbit 300 u outward of each of the 10 largest main-lane
//        rocks, one rock-targeted torpedo each. A shot passes with (a) ≥ 6 real pieces, (b) ≥ 3 touch events within 20 s,
//        (c) ≥ 50% of the parent's mass alive at 30 s, (d) ≥ 4 burst pieces whose velocity relative to V_c turned ≥ 25°
//        by 20 s. Gate: ≥ 7 of 10. §13.7: run with all four switches on (the gate) and all four off (reported).
// stress §8.3: seeds 1-20 × 4,000 ticks, the Hunter off, the stress driver; twins hashed every 500 ticks; a save and
//        restore at 4,000 then 1,000 more ticks; the safety counters (edge dust, rockSlotDust, rockCapHits: gates 0), tidal
//        breaks and their pieces, rejoins by how, the free count every 10 s, stepDuel's p99 (reported).
// cost   §8.3: seeds 1-3, every empty slot filled with a free rock (about 240 live), 2,000 ticks of the stress driver:
//        stepDuel's p99 under 0.5 ms.
// idle   §8.3: seeds 1-20, 600 s with no player action (the quiet scene, crew at ρ 2750, Hunter off): 0 rocks ever freed;
//        and seeds 1-3's 20 Hz deltas at 60, 300 and 600 s, each window's median at most master's (Task 1's JSON).
// burst  §8.3: seeds 1-3, the quiet scene with bursts at 10, 20 and 30 s: the free count back to ≤ 10 by 270 s, and the
//        delta median from 10 to 270 s ≤ 5,500 bytes.
import { performance } from 'node:perf_hooks';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { BURST_TIMES, BURST_WINDOW, IDLE_SEEDS, IDLE_WINDOWS, median, quietRun } from './spike-asteroids-iii-idle';
import { parkCoOrbit, stressInput, switchOff } from '../tests/helpers/rockStress';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { flattenTactical, hashTactical, unflattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { circularVelocity } from '../src/renderer/src/sim/tactical/rails';
import { rockAlive, rockAt, rockHp, RockKind, rockSlots, ROCK_STRIDE, writeRock } from '../src/renderer/src/sim/tactical/rocks';
import { ROCK_SWITCHES } from '../src/renderer/src/sim/tactical/rockTuning';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';

const argAt = (name: string): string | null => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] ?? null : null; };
const only = argAt('--only'), want = (part: string): boolean => only === null || only === part;
const quantile = (xs: readonly number[], q: number): number => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0; };
const round = (v: number, d = 4): number => Number(v.toFixed(d));
const count = (st: TacticalState, kind: number): number => { let n = 0; for (let k = 0; k < rockSlots(st); k++) if (st.rocks[k * ROCK_STRIDE] === kind) n++; return n; };
const isRailKind = (kind: number): boolean => kind === RockKind.Rail || kind === RockKind.Tumble;
const COS25 = Math.cos((25 * Math.PI) / 180);

function feelShot(rock: number) {
  const st = createTacticalState(2026);
  switchOff(st, 1); parkCoOrbit(st, rock, 300);
  const parent = rockAt(st, rock), parentMass = parent.r * parent.r * parent.r, family = new Set<number>(), u0 = new Map<number, [number, number]>();
  let blastAt = -1, pieces = 0, touches = 0, massShare = -1, turned = -1;
  for (let k = 0; k < 4000 && (blastAt < 0 || st.tick - 1 < blastAt + 1800); k++) {
    stepDuel(st, { ...IDLE_INPUT, rockLock: { laser: null, torpedo: k === 0 ? rock : null } });
    const now = st.tick - 1;
    for (const e of st.events) {
      if (e.kind !== 'rock') continue;
      if (e.what === 'split' && e.burst && blastAt < 0) { blastAt = now; pieces = e.pieces!.length; for (const p of e.pieces!) family.add(p); continue; }
      if (blastAt < 0) continue;
      if (e.what === 'touch' && now <= blastAt + 1200) touches++;
      if (e.what === 'split' && family.has(e.rock)) { u0.delete(e.rock); for (const p of e.pieces ?? []) family.add(p); }
      if (e.what === 'dust' && e.rock >= 0 && family.has(e.rock)) { family.delete(e.rock); u0.delete(e.rock); }
    }
    if (blastAt === now) for (const p of family) { const a = rockAt(st, p), [cx, cy] = circularVelocity(a.x, a.y); u0.set(p, [a.vx - cx, a.vy - cy]); }
    if (blastAt >= 0 && now === blastAt + 1200) {
      turned = 0;
      for (const [p, [ux, uy]] of u0) {
        if (!rockAlive(st, p)) continue;
        const a = rockAt(st, p), [cx, cy] = circularVelocity(a.x, a.y), wx = a.vx - cx, wy = a.vy - cy, n = Math.hypot(ux, uy) * Math.hypot(wx, wy);
        if (n > 0 && (ux * wx + uy * wy) / n <= COS25) turned++;
      }
    }
    if (blastAt >= 0 && now === blastAt + 1800) {
      let m = 0;
      for (const p of family) if (rockAlive(st, p)) { const r = rockAt(st, p).r; m += r * r * r; }
      massShare = m / parentMass;
    }
  }
  const pass = pieces >= 6 && touches >= 3 && massShare >= 0.5 && turned >= 4;
  return { rock, r: round(parent.r, 1), blasted: blastAt >= 0, pieces, touches, massShare: round(massShare, 3), turned, pass };
}
function feelRun() {
  const shape = createTacticalState(2026), main0 = shape.map.laneSizes[0]!, main1 = main0 + shape.map.laneSizes[1]!;
  const big = Array.from({ length: main1 - main0 }, (_, j) => main0 + j).sort((x, y) => shape.map.asteroids[y]!.r - shape.map.asteroids[x]!.r || x - y).slice(0, 10);
  const rows = big.map(feelShot), passing = rows.filter((r) => r.pass).length;
  return { rows, passing, gatePass: passing >= 7 };
}
/** Run `run` with every switch set to `on`, always restoring them. */
function switches<T>(on: boolean, run: () => T): T {
  const saved = { ...ROCK_SWITCHES };
  Object.assign(ROCK_SWITCHES, { massCube: on, softEdge: on, clusterTumble: on, rocheBreak: on });
  try { return run(); } finally { Object.assign(ROCK_SWITCHES, saved); }
}
const feel = want('feel') ? { seed: 2026, allOn: switches(true, feelRun), allOff: switches(false, feelRun) } : null;

const stress = want('stress') ? (() => {
  const times: number[] = [], failures: string[] = [], freeEvery10s: number[][] = [];
  let edgeDust = 0, tidalBreaks = 0, tidalPieces = 0, slotDust = 0, capHits = 0;
  const rejoins = { lane: 0, group: 0, own: 0 };
  for (let seed = 1; seed <= 20; seed++) {
    const a = createTacticalState(seed), b = createTacticalState(seed), marks: number[] = [];
    switchOff(a, 1); switchOff(b, 1);
    for (let k = 0; k < 4000; k++) {
      const ia = stressInput(a), ib = stressInput(b), t0 = performance.now();
      stepDuel(a, ia); times.push(performance.now() - t0);
      stepDuel(b, ib);
      for (const e of a.events) {
        if (e.kind !== 'rock') continue;
        if (e.what === 'dust' && e.by === 'edge') edgeDust++;
        if (e.what === 'split' && e.by === 'tidal') { tidalBreaks++; tidalPieces += e.pieces?.length ?? 0; }
        if (e.what === 'rejoin' && e.how) rejoins[e.how]++;
      }
      if (a.tick % 600 === 0) marks.push(count(a, RockKind.Free));
      if ((k + 1) % 500 === 0 && hashTactical(a) !== hashTactical(b)) { failures.push(`seed ${seed} tick ${k + 1}: twin runs differ`); break; }
    }
    slotDust += a.rockSlotDust; capHits += a.rockCapHits;
    freeEvery10s.push(marks);
    const values = flattenTactical(a), c = createTacticalState(seed);
    validateTacticalValues(c, values); unflattenTactical(c, values);
    if (hashTactical(c) !== hashTactical(a)) failures.push(`seed ${seed}: the restored state's hash differs`);
    for (let k = 0; k < 1000; k++) { stepDuel(a, stressInput(a)); stepDuel(c, stressInput(c)); }
    if (hashTactical(c) !== hashTactical(a)) failures.push(`seed ${seed}: save and restore diverged`);
  }
  const safety = { edgeDust, slotDust, capHits };
  return { seeds: 20, ticks: 4000, restoreTicks: 1000, failures, safety, safetyPass: edgeDust === 0 && slotDust === 0 && capHits === 0, tidalBreaks, tidalPieces, rejoins,
    stepDuelMs: { median: round(median(times)), p99: round(quantile(times, 0.99)) }, freeEvery10sMax: Array.from({ length: freeEvery10s[0]?.length ?? 0 }, (_, j) => Math.max(...freeEvery10s.map((m) => m[j] ?? 0))) };
})() : null;

/** Fill every empty slot with a free rock (r 9 to 12) on a spread of orbits from ρ 1350 to 2650, a little off circular. */
function fillFree(st: TacticalState): void {
  let j = 0;
  for (let k = 0; k < rockSlots(st); k++) {
    if (st.rocks[k * ROCK_STRIDE] !== RockKind.Gone) continue;
    const rho = 1350 + ((j * 37) % 1300), ang = j * 2.399963229728653, x = Math.cos(ang) * rho, y = Math.sin(ang) * rho, [vx, vy] = circularVelocity(x, y), r = 9 + (j % 4);
    writeRock(st, k, RockKind.Free, x, y, vx + ((j * 13) % 7) - 3, vy + ((j * 7) % 5) - 2, r, rockHp(r));
    j++;
  }
}
const cost = want('cost') ? (() => {
  const times: number[] = [], live: number[] = [];
  for (const seed of [1, 2, 3]) {
    const st = createTacticalState(seed);
    switchOff(st, 1); fillFree(st);
    for (let k = 0; k < 2000; k++) {
      const input = stressInput(st), t0 = performance.now();
      stepDuel(st, input); times.push(performance.now() - t0);
      if (k % 100 === 0) live.push(rockSlots(st) - count(st, RockKind.Gone));
    }
  }
  const p99 = quantile(times, 0.99);
  return { seeds: [1, 2, 3], ticks: 2000, liveMedian: median(live), liveMin: Math.min(...live), stepDuelMs: { median: round(median(times)), p99: round(p99) }, p99GateMs: 0.5, p99Pass: p99 < 0.5 };
})() : null;

const idle = want('idle') ? (() => {
  let freed = 0;
  const perSeed: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const st = createTacticalState(seed), [vx, vy] = circularVelocity(0, -2750);
    switchOff(st, 1);
    Object.assign(st.ships[0], { x: 0, y: -2750, vx, vy, heading: 64, headingAcc: 0 });
    let kinds = Array.from({ length: rockSlots(st) }, (_, k) => st.rocks[k * ROCK_STRIDE]!), seedFreed = 0;
    for (let k = 0; k < 600 * 60; k++) {
      stepDuel(st, IDLE_INPUT);
      for (let j = 0; j < kinds.length; j++) { const now = st.rocks[j * ROCK_STRIDE]!; if (isRailKind(kinds[j]!) && !isRailKind(now)) seedFreed++; kinds[j] = now; }
    }
    perSeed.push(seedFreed); freed += seedFreed;
  }
  const master = JSON.parse(readFileSync('docs/superpowers/research/2026-11-19-asteroids-iii-master-idle.json', 'utf8')) as { idle: { seed: number; deltas: number[][] }[] };
  const deltas = IDLE_SEEDS.map((seed) => {
    const run = quietRun(seed, 601, IDLE_WINDOWS), base = master.idle.find((m) => m.seed === seed)!;
    const mine = run.deltas.map(median), theirs = base.deltas.map(median);
    return { seed, mine, master: theirs, pass: mine.every((m, w) => m <= theirs[w]!) };
  });
  return { seeds: 20, seconds: 600, freed, perSeed, freedPass: freed === 0, deltas, deltaPass: deltas.every((d) => d.pass) };
})() : null;

const burst = want('burst') ? (() => {
  const rows = IDLE_SEEDS.map((seed) => {
    const run = quietRun(seed, BURST_WINDOW[1], [BURST_WINDOW], BURST_TIMES), last = BURST_TIMES[BURST_TIMES.length - 1]!;
    const back = run.freeEachSecond.findIndex((n, s) => s + 1 >= last && n <= 10), deltaMedian = median(run.deltas[0]!);
    return { seed, peakFree: Math.max(...run.freeEachSecond), backToTenAtS: back < 0 ? -1 : back + 1, freeAt270: run.freeEachSecond[run.freeEachSecond.length - 1], deltaMedian, pass: back >= 0 && deltaMedian <= 5500 };
  });
  return { rows, gatePass: rows.every((r) => r.pass) };
})() : null;

const result = { simVersion: SIM_VERSION, switches: { ...ROCK_SWITCHES }, feel, stress, cost, idle, burst };
console.log(JSON.stringify(result, null, 2));
const out = argAt('--json');
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 2) + '\n'); }
const failed = (feel && !feel.allOn.gatePass) || (stress && (stress.failures.length > 0 || !stress.safetyPass)) || (cost && !cost.p99Pass)
  || (idle && (!idle.freedPass || !idle.deltaPass)) || (burst && !burst.gatePass);
if (failed) process.exitCode = 1;
```

(The feel check's mass share uses r³, the cube mass's shape; the switch-off run compares r³ shares too, so the two runs stay comparable.)

- [ ] **Step 2: Type-check and run it**

Run: `npm run typecheck && npx tsx scripts/spike-asteroids-iii-measure.ts --json docs/superpowers/research/2026-11-19-asteroids-iii-measure.json`
Expected: the JSON prints; runtime a few minutes (the idle part steps 20 × 36,000 ticks). Read each gate: `feel.allOn.gatePass`, `stress.failures` empty and `stress.safetyPass`, `cost.p99Pass`, `idle.freedPass` and `idle.deltaPass`, `burst.gatePass`. The exit code is 0 only when all pass.

- [ ] **Step 3: If every gate passes, commit the results**

```bash
git add scripts/spike-asteroids-iii-measure.ts docs/superpowers/research/2026-11-19-asteroids-iii-measure.json
git commit -m "chore(asteroids-iii): the measure script and its results: feel (switches on and off), stress, cost, idle and after-burst gates (spec §8.2, §8.3, §13.7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: The tuning rule (only when a gate fails).** Change one named knob in `rockTuning.ts` at a time, in the order below for the failing gate, re-run the whole script after each, and stop at the first change that passes every gate. Commit each kept change by itself (`git commit -m "tune(asteroids-iii): <KNOB> <old> -> <new> for the <gate> gate (spec §13: Fable's estimates, confirmed by §8)"` with the attribution line) and record the before and after numbers for the report. If the list runs out, revert the knobs to the spec's values, commit the script and the failing JSON, and report BLOCKED with the numbers (the owner decides; spec §1 decisions D1–D10 and the revision 3 owner choices are not tuned).
  - `feel` under 7 of 10: (1) `SETTLE_A0` 20 → 30 (longer free flight before the drag); (2) `TOUCH_MIN` stays (it defines the counter); stop.
  - `burst` free count not back to ≤ 10: (1) `SETTLE_K_MAX` 0.06 → 0.08; (2) `SETTLE_A1` 60 → 45. Also read `stress.rejoins`: if lane captures are near 0 while free rocks sit in the belt, the lane-zone drift (plan deviation 20) is the cause: report it rather than tuning further.
  - `burst` delta median over 5,500: the same two knobs.
  - `cost` p99 at or over 0.5 ms: no knob; profile `stepDuel` (`node --cpu-prof`), report the top three functions, BLOCKED.
  - `idle` freed > 0 or a delta over master's: a bug (lanes or clusters meet); find it with superpowers:systematic-debugging, fix it with a failing test first, and re-run; not a tuning case.
  - `stress` safety counters non-zero, or twins or restore failing: a bug or a spec bound (report `edgeDust` against the spec's 290 u worst case, `capHits` and `slotDust` with the seeds); not a tuning case.

---

### Task 14: Duel gates, SIM_VERSION 60 by the two-step bless, the whole suite, the app smoke

**Files:**
- Modify: `src/renderer/src/sim/tuning.ts:7` (SIM_VERSION 60); `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json` (by `npm run bless` only)
- Modify (only their pinned values and history comments): trajectory-pinned tests found failing, typically `tests/duelCheckpoint.test.ts`, `tests/duelModules.test.ts`, `tests/duelSnapshot.test.ts`, `tests/duelScripted.test.ts`, `tests/tacticalSlots.test.ts`, `tests/contactScene.test.ts`; `scripts/network/duel-app-smoke.ts` (`DUEL_TEST_SEED`) only if the smoke's forced round end no longer comes inside its step
- Conditional: `src/renderer/src/sim/tactical/tuning.ts` (`SHIP_HULL` only, spec §10 risk 3)

**Interfaces:**
- Consumes: everything above. Produces: no new interfaces; the goldens at SIM_VERSION 60.

- [ ] **Step 1: Typecheck and the duel gates first (before any bless)**

Run: `npm run typecheck && npx vitest run tests/duelGates.test.ts`
Expected: typecheck clean; every per-seed gate passes (an outcome before the cap, a laser release and a launch, no early planet end). Keep the printed telemetry lines for the report.

- [ ] **Step 2: If a duel gate fails** (spec §10 risk 3: the Hunter hits moving rocks), change only `SHIP_HULL` in `src/renderer/src/sim/tactical/tuning.ts`, by +10 % a step (round to a whole number), re-running Step 1 after each, at most three steps. Commit a kept change by itself: `git commit -m "tune(asteroids-iii): SHIP_HULL <old> -> <new> for duelGates (spec §10)"` with the attribution line. If three steps do not pass, revert, record the lines and report BLOCKED.

- [ ] **Step 3: Same-version bless of the gameplay at SIM 59**

Run: `npm run bless`
Expected: it writes `tests/golden/basic.json`, `duel-1.json`, `duel-rematch.json` and `tests/fixtures/determinism-v2.json` at simVersion 59 (a same-version bless is a deliberate gameplay change); no refusal.

- [ ] **Step 4: Record the baselines at 59**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline && npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `baseline at sim version 59: ...` and `duel oracle baseline at sim version 59: ...`.

- [ ] **Step 5: Commit the same-version bless**

```bash
git add tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json
git commit -m "test(asteroids-iii): same-version bless at SIM_VERSION 59 for the orbiting belt (duel goldens re-recorded)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add `tests/fixtures/determinism-v2.json` only if the bless changed it; `git status` shows which.)

- [ ] **Step 6: Bump SIM_VERSION to 60 and bless version-only**

Edit `src/renderer/src/sim/tuning.ts` line 7 to `export const SIM_VERSION = 60;`, then run:

```bash
npx tsx scripts/golden/canonical-trace.ts check && npx tsx scripts/golden/duel-oracle.ts check && npm run bless && npx tsx scripts/golden/canonical-trace.ts golden
```

Expected: both checks report identical per-tick traces (59 → 60, no alias table: the schema did not change between the baseline and now); the bless writes all four artifacts at 60; `golden` reports basic.json differs only in version, content digest and hashes.

- [ ] **Step 7: Commit the bump**

```bash
git add src/renderer/src/sim/tuning.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json
git commit -m "chore(asteroids-iii): SIM_VERSION 59 -> 60 alone, blessed (canonical trace and duel oracle prove every run unchanged per tick)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Run the whole suite and re-pin trajectory fixtures only**

Run: `npx vitest run`
Expected: everything passes except tests that pin a scripted trajectory (a tick, a count or a summary from a scripted duel). For each:
- `tests/duelCheckpoint.test.ts`: run `npx tsx scripts/spike-asteroids-find-split.ts`; keep the test's seed if it has a SPLIT, else take the lowest seed that has one; set `SEED`, `SPLIT` and the `toMatchObject` summary to the printed values, and prepend the history comment with `Seed N's scripted duel is a crew win/loss at tick T (SIM_VERSION 60, asteroids-iii orbiting belt; at SPLIT S).`
- Any other test that names a pinned tick in its comment (`duelModules`' `played(6, …)` "has a missile in flight", `duelSnapshot`'s seed and tick, `duelScripted`'s every-kind seed, `tacticalSlots`' end tick, `contactScene`'s pinned frames): find the new value by the rule its comment states (step the same scripted duel and print the first qualifying tick), update the number and add `(SIM_VERSION 60, asteroids-iii)` to its history comment.
- A failure that is not a pinned trajectory is a bug in Tasks 2–12: fix it there with a failing test first; do not edit the expectation. After such a sim fix: re-run Task 13's script, then `npm run bless` (a same-version bless at 60, which `scripts/golden/blessGuard.ts` allows) and Step 1, and commit the re-blessed goldens with the fix.

Re-run `npx vitest run` until it is green, then commit only the re-pinned tests:

```bash
git add tests/duelCheckpoint.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts tests/duelScripted.test.ts tests/tacticalSlots.test.ts tests/contactScene.test.ts
git commit -m "test(asteroids-iii): re-pin the trajectory fixtures at SIM 60" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(List only the files that changed.)

- [ ] **Step 9: The determinism script and the two-process app smoke**

Run: `npm run test:determinism && npm run test:duel-app-runtime`
Expected: both PASS. If the smoke fails at step 3 because round 1 is no longer decided inside the step's 90 s, re-pick the test seed: write and run this search in the scratchpad (not committed):

```ts
// seed-search.ts: the earliest-decided duel with no flight or weapon input, seeds 1..8000 (the smoke's forced round end).
import { computeContentDigest } from '../build/contentDigest';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
(globalThis as Record<string, unknown>).__GAMEPLAY_CONTENT_DIGEST__ = computeContentDigest(process.cwd());
const IDLE = { held: [{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }], commands: [] };
let best: [number, number] = [0, Infinity];
for (let seed = 1; seed <= 8000; seed++) {
  const d = createDuel(DUEL_LAYOUT, seed);
  try { for (let k = 0; k < 5400 && d.tactical.outcome === Outcome.Running; k++) stepDuelTick(d, IDLE); if (d.tactical.outcome !== Outcome.Running && d.tactical.tick < best[1]) best = [seed, d.tactical.tick]; }
  finally { disposeDuel(d); }
}
console.log(`earliest: seed ${best[0]} decided on tick ${best[1]}`);
```

  (copy it to `scripts/_seed-search.ts`, run `npx tsx scripts/_seed-search.ts`, delete it). Set `DUEL_TEST_SEED` in `scripts/network/duel-app-smoke.ts` to the printed seed (and the internet smoke's shared constant if it has one), rewrite the doc comment's first sentence with the new tick (`decided on tick T`, `SIM_VERSION 60, asteroids-iii`), keep the earlier history, re-run the smoke, and commit `git commit -m "test(asteroids-iii): the duel app smoke's forced-round-end seed <old> -> <new> (decided on tick <T> at SIM 60)"` with the attribution line.

---

### Task 15: Screenshots and the report

The visual check method (Claude's memory note `visual-check-method`): `playwright-core@1.48.2` installed in a scratchpad folder (never the repo), `npm run build` in the worktree, then Electron's `_electron.launch` on the built app. The solo staging hook `globalThis.__spikeAsteroids` (`src/renderer/src/app/duel/duelMode.ts:77`) gives the script the duel and the rock helpers; it needs no change (its `writeRock` takes the new optional `t`).

**Files:**
- Create: `scripts/spike-asteroids-iii-shots.cjs`
- Create: `docs/superpowers/research/2026-11-19-asteroids-iii.md`
- Output (not committed): `C:/Users/djuar/FTLite-shots/asteroids-iii/*.png`

**Interfaces:**
- Consumes: the built app; `__spikeAsteroids.{duel, rockAt, rockSlots, seatWeapons}`; Task 13's JSON; Task 14's duelGates lines.
- Produces: the §8.4 screenshot set and the report.

- [ ] **Step 1: Write `scripts/spike-asteroids-iii-shots.cjs`**

```js
// Asteroids-iii screenshots (docs/superpowers/specs/2026-11-19-asteroids-iii-design.md §8.4): single player at Weapons on
// the CRT map, staged through the solo hook globalThis.__spikeAsteroids (app/duel/duelMode.ts). Usage: install
// playwright-core@1.48.2 in a scratch folder, copy this file there, run `npm run build` in the worktree, then
// `node spike-asteroids-iii-shots.cjs [out dir] [worktree]`. Shots: the belt at 0 and 120 s; a burst at 0, 2, 10 and 30 s;
// cracks at wear 0.25, 0.5 and 1. The crew is pinned co-rotating with the main lane, 300 u outward of its target.
const { _electron } = require('playwright-core');
const { mkdtempSync, mkdirSync } = require('node:fs'); const { join } = require('node:path'); const { tmpdir } = require('node:os');
(async () => {
  const out = process.argv[2] || 'C:/Users/djuar/FTLite-shots/asteroids-iii';
  const root = process.argv[3] || 'C:/Users/djuar/FTLite/.worktrees/asteroids-iii';
  mkdirSync(out, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'ftlite-ast3-'));
  const env = { ...process.env }; delete env.FTLITE_MODE;
  const app = await _electron.launch({ executablePath: 'C:/Users/djuar/FTLite/node_modules/electron/dist/electron.exe', args: [root, `--user-data-dir=${profile}`], env });
  const page = await app.firstWindow();
  const errs = []; page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.waitForTimeout(2500);
  await page.click('[data-testid="single-player"]'); await page.waitForTimeout(2500);
  await page.evaluate(() => globalThis.__spikeAsteroids.seatWeapons()); await page.waitForTimeout(800);
  const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
  const zoom = async (n, key) => { for (let z = 0; z < n; z++) { await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); await page.waitForTimeout(150); } };
  // Pin the crew `gap` u outward of main-lane rock `pick` (the largest, or the middle of three neighbours), turning with the
  // main lane (ω(1200)) from the tick it was staged, on a circular velocity; the Hunter pinned far off. Returns the rock.
  const stage = (opts) => page.evaluate(({ gap, triple }) => {
    const h = globalThis.__spikeAsteroids, t = h.duel().tactical, m = t.map, lo = m.laneSizes[0], hi = lo + m.laneSizes[1], rails = [];
    for (let k = lo; k < hi; k++) { const a = h.rockAt(t, k); if (a.kind === 1) rails.push({ k, ...a, ang: Math.atan2(a.y, a.x) }); }
    let pick;
    if (triple) { rails.sort((p, q) => p.ang - q.ang); let bestGap = Infinity; for (let i = 1; i + 1 < rails.length; i++) { const g = rails[i + 1].ang - rails[i - 1].ang; if (g < bestGap) { bestGap = g; pick = rails[i]; } } }
    else { rails.sort((p, q) => q.r - p.r); pick = rails[0]; }
    const w = Math.sqrt(2.5e6 / Math.pow(1200 * 1200 + 400, 1.5)), tick0 = t.tick, d = Math.hypot(pick.x, pick.y), R = d + gap, a0 = Math.atan2(pick.y, pick.x);
    const heading = (x, y) => ((Math.round((Math.atan2(pick.x - x, -(pick.y - y)) / (2 * Math.PI)) * 256) % 256) + 256) % 256;
    clearInterval(globalThis.__pin);
    const pin = () => {
      const tt = h.duel().tactical, ang = a0 + w * (tt.tick - tick0) / 60, x = Math.cos(ang) * R, y = Math.sin(ang) * R, wr = Math.sqrt(2.5e6 / Math.pow(R * R + 400, 1.5));
      Object.assign(tt.ships[0], { x, y, vx: -wr * y, vy: wr * x, heading: heading(x, y), headingAcc: 0 });
      Object.assign(tt.ships[1], { x: -x, y: -y, vx: 0, vy: 0 });
    };
    pin(); globalThis.__pin = setInterval(pin, 5);
    globalThis.__triple = triple ? rails.filter((r) => Math.abs(r.ang - pick.ang) < 0.2).map((r) => r.k) : [];
    return { rock: pick.k, r: pick.r };
  }, opts);
  const read = (key) => page.evaluate((k) => globalThis.__spikeAsteroids.duel().tactical[k], key);
  const waitMore = (key, from, ms = 15000) => page.waitForFunction(([k, f]) => globalThis.__spikeAsteroids.duel().tactical[k] > f, [key, from], { polling: 16, timeout: ms });

  // belt-000s, belt-120s: the turning belt (zoomed out to the whole belt).
  await stage({ gap: 300, triple: false });
  await zoom(4, 'Minus'); await page.waitForTimeout(500); await shot('belt-000s');
  await page.waitForTimeout(120000); await shot('belt-120s');
  await zoom(4, 'Equal');
  // burst-00s .. burst-30s: a rock-targeted torpedo on the largest main-lane rock.
  const b = await stage({ gap: 300, triple: false });
  const blasts0 = await read('rockBlasts');
  await page.evaluate((k) => { const s = globalThis.__spikeAsteroids.duel().tactical.systems[0]; s.laserRock = -1; s.torpLock = -1; s.torpRock = k; }, b.rock);
  await waitMore('rockBlasts', blasts0); await page.waitForTimeout(100); await shot('burst-00s');
  await page.waitForTimeout(2000); await shot('burst-02s');
  await page.waitForTimeout(8000); await shot('burst-10s');
  await page.waitForTimeout(20000); await shot('burst-30s');
  // cracks: three neighbouring main-lane rocks at wear 0.25, 0.5 and 1 (hp = hpMax · (1 − wear), wear 1 as hp 0.001).
  await stage({ gap: 150, triple: true });
  await page.evaluate(() => {
    const t = globalThis.__spikeAsteroids.duel().tactical;
    globalThis.__triple.slice(0, 3).forEach((k, i) => { const r = t.rocks[k * 8 + 5], max = Math.ceil(r / 10), wear = [0.25, 0.5, 1][i]; t.rocks[k * 8 + 6] = Math.max(0.001, max * (1 - wear)); });
  });
  await zoom(6, 'Equal'); await page.waitForTimeout(600); await shot('cracks-025-050-100');
  await page.evaluate(() => clearInterval(globalThis.__pin));
  console.log('errors', JSON.stringify(errs.slice(0, 10)));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Build and take the shots**

```bash
npm run build
mkdir -p "$SCRATCH/shots3" && cd "$SCRATCH/shots3" && npm init -y >/dev/null && npm i playwright-core@1.48.2 >/dev/null && cp /c/Users/djuar/FTLite/.worktrees/asteroids-iii/scripts/spike-asteroids-iii-shots.cjs . && node spike-asteroids-iii-shots.cjs C:/Users/djuar/FTLite-shots/asteroids-iii C:/Users/djuar/FTLite/.worktrees/asteroids-iii
```

(`$SCRATCH` is the session's scratchpad directory.) Expected: nine `shot ...` lines and `errors []`; runtime about three minutes (the belt waits 120 s). Look at every PNG with the Read tool: the belt has moved between `belt-000s` and `belt-120s` (lanes sheared, gaps smeared); the burst shots show the shockwave and shards at 0 s, pieces with streaks and trails at 2 s, curved trails at 10 s and touched or settling pieces at 30 s; the crack shot shows one, two and four cracks inside the outlines. If a scene is missing (for example, the torpedo found no range), fix the staging and re-run; the sim is not changed for the screenshots.

- [ ] **Step 3: Write the report** `docs/superpowers/research/2026-11-19-asteroids-iii.md` with these sections, filled from Task 13's JSON (`docs/superpowers/research/2026-11-19-asteroids-iii-measure.json`), Task 1's master baseline and Task 14's duelGates lines:
  1. **What was built** (one paragraph per spec section: rails with centre and offset and the tumble, lanes and rigid clusters, free motion, the grid, billiards, rejoining, breaking and the Roche break, ships and predictions, the renderer, the cracks).
  2. **Gates** (a table: gate, target, measured, pass): the feel check with the four switches on and off (per-shot rows: pieces, touches, mass share, turned), stress twins and restore, the safety counters (edge dust, `rockSlotDust`, `rockCapHits`), cost p99, idle frees and the three delta windows against master's, after-burst free count and delta median, duelGates (per-seed lines), the whole suite, `test:determinism`, the app smoke.
  3. **Stress counts**: tidal breaks and their pieces, rejoins by `how` (lane, group, own), the free count every 10 s.
  4. **Tuning** (every knob changed in Tasks 13 and 14, with the before and after numbers; "none" if none).
  5. **Spec problems found while planning and building** (copy the list in this plan's "Deviations and clarifications", items 14 and 20 to 22, and add any found while building).
  6. **Screenshots** (the nine file names with one line each) and **the owner's look check** (open: lanes too regular? trails, spin, hit-stop feel, cracks).

- [ ] **Step 4: Commit**

```bash
git add scripts/spike-asteroids-iii-shots.cjs docs/superpowers/research/2026-11-19-asteroids-iii.md
git commit -m "docs(asteroids-iii): screenshots script and the report (gates, stress counts, tuning, spec problems, look check)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec | Task |
|---|---|
| §1 D1, D2 (rotating belt, shear by lanes) | 3, 4, 5 |
| §1 D3, D5 (escape and edge slingshot) | 6 (soft edge, slack) |
| §1 D4 (GM unchanged), D6, D7 (out) | Global Constraints |
| §1 D8 (rails cost no bytes) | 4 (slot never changes), 13 (idle deltas) |
| §1 D9, §13.6 (kick) | 10 |
| §1 D10, §7.3 (cracks) | 2, 12 (spin) |
| §2 (forms, series, guard) | 3 |
| §3.1–§3.3, §13.1 (pool, kinds, accessors, memo, phase, validation) | 4, 5 |
| §3.4, §13.2 (freeing, clock, rejoin, lane zones, groups) | 4, 8, 9 |
| §3.5 (lanes, cluster separation) | 3, 5 |
| §4, §13.3 (motion, drag ramp, soft edge, Roche, cap counter) | 6, 10 |
| §5.1–§5.5, §13.4 (breaking, caps, contact pass, mass, restitution, separation, eviction) | 8, 10 |
| §5.6 (shards, touch cue, hit-stop) | 12 |
| §6.1 (grid) | 7 |
| §6.2 (ship two-body, RAM_SOFT) | 4, 11 |
| §6.3 (predict, hazard, threat) | 11 |
| §7.1, §7.2, §13.5 (interpolation, streaks, trails, path, spin) | 12 |
| §8.1 unit tests | 2–12 |
| §8.2 feel check, §13.7 switches on/off | 13 |
| §8.3 gates | 13, 14 |
| §8.4 version and screenshots | 14, 15 |
| §11 integration list | 4–12; old ii scripts deleted in 4 |
