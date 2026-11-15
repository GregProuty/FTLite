# Helm Demo H-0c-ii-a: The Headless Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** H-0's last row closes headless. A scripted pair (a deterministic Helm and gunner who walk to repairs and back) fights the hunter over seeds 1 to 10, telemetry records each duel, and a gate test that always runs proves parent §16's targets: median duel length 3 to 5 minutes, crew wins and crew losses both occur, the crew releases the laser and launches a missile in every duel, no duel ends from a planet contact in under 30 s, and every duel ends before the 15-minute cap. One game number moves to get there (hull 30 → 40). `SIM_VERSION` goes 35 → 36, `flattenDuel` starts with it, the sector goldens are re-blessed and proved version-only, and a duel golden pins the scripted duel at seed 1.

**Architecture:** Headless sim and tests only, on top of H-0c-i and H-1b:
- `sim/duel/state.ts` and `step.ts` gain per-tick **repair events** (`d.events`), derived and not hashed; the repair behaviour is unchanged.
- `sim/duel/telemetry.ts` (new): the per-duel accumulator (`createTelemetry`, `recordTick`, `endedFromPlanet`): weapons, missiles, contacts, baits, repairs, time away, console use, the arc, the idle predicate and the terminal cause.
- `sim/duel/scripted.ts` (new): the scripted pair (`createScriptedPair`, `scriptedInput`) with a BFS over the Cutter's walkable tiles (`bfsPath`, `goalTiles`). It lives under `sim/`, so the determinism guard covers it, and it imports nothing from `app/` or `render/`.
- `tests/helpers/scriptedDuel.ts` (new) runs a duel to its end or the cap (`runDuel`) and formats the telemetry; `tests/duelGates.test.ts` is the gate; `scripts/duel-telemetry.ts` is the tuning tool.
- `sim/tactical/tuning.ts`: `SHIP_HULL` 30 → 40.
- `sim/tuning.ts`: `SIM_VERSION` 35 → 36; `sim/duel/hash.ts`: `flattenDuel` starts with `SIM_VERSION`.
- `scripts/bless-golden.ts` also writes the duel golden `tests/golden/duel-1.json`; the new `scripts/determinism/rebless-version.ts` moves `tests/fixtures/determinism-v2.json` to the new version and refuses to write unless only the version and hashes changed.

**Nothing touches `authority/`, `net/contracts.ts`, `app/`, `render/` or any sector behaviour.** The one render-side test that pins the hull (`tests/duelReadout.test.ts`, `30/30`) is updated to `40/40`.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, tsx. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-helm-h0c-ii-a-headless-gates-design.md` (§3 the scripted pair, §4 telemetry and repair events, §5 the gates and the tuning, §6 versioning and the golden, §7 boundaries, §8 acceptance). Parent: `docs/superpowers/specs/2026-11-14-helm-demo-design.md` §8 (interior and repair), §9 (the hunter), §13 (scripted pair, telemetry, versioning), §15 (H-0 row), §16 (the telemetry gates).

## Scope

- **Task 1:** repair events from `repairPhase` into `d.events`, and the telemetry accumulator.
- **Task 2:** the scripted pair: the Helm's avoid / line up / orbit rules, the gunner's rules, nearest-free-character repair with BFS walking.
- **Task 3:** the gate test over seeds 1 to 10, the run-and-format helper, `scripts/duel-telemetry.ts`, and the tuning that meets the gates (`SHIP_HULL` 30 → 40), with the passive-crew survival report.
- **Task 4:** `SIM_VERSION` 35 → 36 with `flattenDuel` leading with it, the sector goldens re-blessed and proved version-only, the determinism fixture re-blessed version-only, the duel golden and the same-seed hash test, and the screenshot check.
- **Not here (H-0c-ii-b, waits for Net-3):** the authority duel mode, the command-union amendment and the snapshot codec.

## Global Constraints

- Determinism guard (`tests/boundary.test.ts`, `tests/helpers/determinismGuard.ts`) scans `src/renderer/src/sim/**`, `authority`, `net`, `clientControl`, `headless`, `events` and `src/shared`, and every local file they import. The new `sim/duel/scripted.ts` and `sim/duel/telemetry.ts` fall under it: only `Math.abs`, `ceil`, `floor`, `round`, `min`, `max`, `sign`, `imul` and `sqrt` (no trigonometry, no `**`); no `Date`, `performance` or other platform globals; randomness only through `src/shared/rng.ts` (`createRng`, `nextFloat`), and the pair never touches `rng.tactical`. Files under `sim/` may not import from `app/`, `render/`, `input/`, `authority/`, `clientControl/`, `headless/` or `tests/`; the pair mirrors `app/duel/controls.ts`'s reach rules with the sim's own helpers instead of importing it.
- **No change to `authority/`, `net/contracts.ts`, `app/`, `render/` or any sector behaviour.** Sim changes are limited to the repair events, `SHIP_HULL`, `SIM_VERSION`, `flattenDuel` and the two new files (spec §7).
- Tick rate 60, `DT` 1/60. Ship 0 is the crew's, ship 1 the hunter's. Player 0 starts at Navigation (the Helm, Cutter tile 27,6), player 1 at Weapons (tile 8,6). Repair points (`sim/duel/tuning.ts`): Weapons 8,7 in W; Shields 16,8 in R; Engines 2,6 in E. Commands carry `requestedTick = d.interior.tick` with a per-player sequence from 0.
- Generated files are never hand-written: `tests/golden/basic.json` and `tests/golden/duel-1.json` come from `npm run bless`, and `tests/fixtures/determinism-v2.json` from `npx tsx scripts/determinism/rebless-version.ts`. The pinned gameplay projections (`tests/fixtures/net1a-baseline.json`, `tests/fixtures/net1a-gates.json`) are never re-blessed.
- **Conflict note (spec §6):** Codex's Net-3 branch may also bump `SIM_VERSION` or re-bless goldens. Whichever merges second bumps again and re-runs Task 4's bless and re-bless steps (`npm run bless`, then `npx tsx scripts/determinism/rebless-version.ts`, which refuses unless the change is version-only).
- Commit with explicit paths only (`git add <paths>`), never `git add -A` or `git add .`: the owner keeps unrelated uncommitted files in this checkout. End every commit message with the Co-Authored-By trailer your own session instructs.
- Run single test files with `npx vitest run <file>`. The full suite is `npm test` (1,969 tests and 1 skipped after this plan; 1,938 and 1 skipped before it). Typecheck is `npm run typecheck` (`tsc -b`; the web project includes `tests/` and `scripts/`).
- Known flakes: `tests/authorityBoundary.test.ts` and `tests/run.test.ts` can time out under full-suite load. If one fails in `npm test`, rerun it alone; it is unrelated to this plan.
- Line endings: write files with LF. The repository normalises on commit (`core.autocrlf`), and the content digest normalises line endings, so the blessed files do not depend on them.

## Decisions the plan makes inside the spec

Each is marked **(rec.)** in the spec's sense: the recommendation, taken under the standing order, which the owner can overturn.

1. **The tuning** (spec §5) **(rec.)**: one game number moves.

   | Number | File | Old | New | Reason |
   |---|---|---|---|---|
   | `SHIP_HULL` | `sim/tactical/tuning.ts` | 30 | 40 | With the master numbers the scripted duels were about a quarter too short (median 174.1 s against the 180 s floor). Hull scales every duel's length roughly linearly without changing who wins it (the same 7 wins and 3 losses before and after) and without touching the rules or the feel of either console. It also lifts the passive crew from 71 to 100 s to 88 to 121 s. |

   No other game number changed: shield regen, laser charge and damage, missile damage, magazine regen, the hunter's aggression and standoff and the repair rate all stay at their H-0b and H-0c values. The pair's own constants (decision 3) were set once from the spec's bounds and were not tuned.

   The tuning iterations (`npx tsx scripts/duel-telemetry.ts`, seeds 1 to 10, lengths in seconds, W crew win, L crew loss):

   | Iteration | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | Median | Passive crew |
   |---|---|---|---|---|---|---|---|---|---|---|---|---|
   | 0: master numbers (hull 30) | 178 W | 219 W | 171 W | 127 L | 158 W | 219 W | 117 L | 227 W | 199 W | 137 L | **174.1** (fails) | 71 to 100 s |
   | 1: hull 40 (taken) | 262.9 W | 287.9 W | 239.4 W | 153.1 L | 226.6 W | 289.6 W | 147.2 L | 306.9 W | 279.3 W | 167.3 L | **251.2** (passes) | 88.5 to 120.8 s |

   Hull 40 lands the median near the middle of the 180 to 300 s band, so small later changes (Net-3, feel tuning) do not tip it out at either end. A win rate of 7 in 10 matches parent §9's "a competent pair wins about 60 to 70%".
2. **The gate results with the plan's numbers** (Task 3's test prints them):

   | Seed | Length | Outcome | Crew laser releases (hits) | Crew missiles | Terminal cause |
   |---|---|---|---|---|---|
   | 1 | 262.9 s | crew win | 43 (41) | 3 | enemy: laser |
   | 2 | 287.9 s | crew win | 46 (45) | 2 | enemy: laser |
   | 3 | 239.4 s | crew win | 42 (41) | 2 | enemy: laser |
   | 4 | 153.1 s | crew loss | 8 (3) | 2 | crew: laser |
   | 5 | 226.6 s | crew win | 41 (40) | 1 | enemy: laser |
   | 6 | 289.6 s | crew win | 48 (47) | 2 | enemy: laser |
   | 7 | 147.2 s | crew loss | 11 (2) | 2 | crew: missile |
   | 8 | 306.9 s | crew win | 50 (48) | 2 | enemy: laser |
   | 9 | 279.3 s | crew win | 47 (46) | 2 | enemy: laser |
   | 10 | 167.3 s | crew loss | 10 (2) | 4 | crew: missile |

   Median 251.2 s; 7 crew wins, 3 crew losses, no draws, none at the cap; no planet-contact ends at all. Passive crew (nobody at either console, recorded, not gated): 88.5, 103.1, 113.0, 108.8, 107.0, 108.4, 106.7, 102.8, 120.8 and 100.3 s for seeds 1 to 10, every one above the 60 s hope. The gate file runs in about 7 s, so it stays one test per seed with a 60 s timeout (spec §5 allows the split) and never drops a seed.
3. **The pair's constants** (spec §3 "Tunable") **(rec.)**, named at the top of `scripted.ts`:

   | Constant | Value | Meaning |
   |---|---|---|
   | `AVOID_TICKS` | 90 | ticks of predicted path (1.5 s, a point every 4 ticks) checked for hazards |
   | `AVOID_MARGIN` | 40 | clearance kept from the planet, asteroids and the edge (u) |
   | `ORBIT_GAIN` | 0.004 | tan of the orbit tilt per unit of radius error (decision 5): full 30° at 144 u off the radius |
   | `ORBIT_MIN`, `ORBIT_MAX` | 1500, 2200 | the orbit radius band, exactly the spec's bounds (`BELT_OUTER + 200`, `R_MAP − 600`) |
   | `SPEED_SLACK` | 8 | u/s around the circular speed (about 35 to 41 u/s in the band) inside which the Helm neither thrusts nor brakes |
   | `MISSILE_GAP` | 900 | ticks (15 s) between crew launches |
   | `PAIR_SALT` | `0x48454c4d` | the pair's stream is `createRng((seed ^ PAIR_SALT) >>> 0)`; its only draw is the orbit radius |

   With these the pair holds its orbit closely (seed 1: radius 1814, the ship's radius stays within 1740 to 1828 for 80% of the duel) and every command it sends is admitted (Task 2's whole-duel test asserts no rejection).
4. **The Helm's avoidance** (spec §3 rule 1) **(rec.)**: the prediction holds the axes the Helm sent on the tick before (zero after it was away); the turn is toward the direction from the chosen hazard's centre to the ship (toward the map centre for the edge), by `sideOf`, ties clockwise, with thrust 1.
5. **The orbit without trigonometry** (spec §3 rule 3) **(rec.)**: the desired direction is `t − u · clamp(ORBIT_GAIN · (r − ORBIT_R), −tan 30°, +tan 30°)`, normalised, with `u` the outward unit vector. That is `t` rotated toward the planet by `atan` of the clamped value, so at most 30° either way as the spec says, using only `sqrt`. The angle tests use literal cosines: 45° (thrust 0), 10° (velocity off course) and one heading step, 360°/256 (turn released).
6. **The gunner** (spec §3) **(rec.)**: Fire is pressed whenever `canCharge` and Fire is not held; it is released when the charge is full and `laserEligible` holds, or when `laserHold ≥ LASER_HOLD_TICKS − 1` (this tick's `tickWeapons` would vent it), so every full charge becomes a release. A launch takes the tick (no charge command alongside it, since a launch lets go of Fire). The missile steers by `pursuitTurn` from the hunter's code (the sign of the bearing error, with a fixed clockwise turn for a target dead astern). Commands go out only while the gunner is seated at Weapons; the lock is sent only when it differs.
7. **Repair and walking** (spec §3) **(rec.)**:
   - A character is *free* when it has no assignment, including while it walks back to its console, so a new damage report can redirect it from the corridor.
   - The walk goal is every tile of the repair room whose centre is within `REACH` of the repair tile (for a console: every tile of the console's room within `REACH` of the console tile). The BFS runs every tick from the character's current tile, which satisfies "recompute when it leaves the path" trivially (29 × 13 tiles).
   - The stick first lines up on the current tile's centre across the next step, then moves along it, scaled so no tick overshoots a centre (a Recruit walks `CREW_SPEED · DT`, 1/15 tile, a tick). Steps are four-way only, so no route crosses a wall corner, and the one-tile doors are entered on their centre line.
   - Measured BFS walks (tiles from the console tile to the nearest goal tile): from Navigation, Weapons 21, Shields 11, Engines 28; from Weapons, Weapons 0, Shields 9, Engines 5. Parent §8's estimates were 22, 11, 27 and none, 8, 6.
   - In the ten gate duels the gunner did almost every repair (it is nearest to Weapons and Engines); the Helm walked to repairs in the three losses.
8. **Telemetry details** (spec §4) **(rec.)**:
   - A repair *finish* is counted per level dropped, so one continuous hold that clears a level-2 room counts one start and two finishes. A new hit while still holding is the same work, not a new start.
   - Time away is per player: ticks standing, split into repairing (a `repairWork` event that tick) and walking (standing otherwise). Console emptiness is counted per console (`helmEmptyTicks`, `weaponsEmptyTicks`).
   - "The enemy in the laser arc" is inside `LASER_RANGE` and the ±60° arc, without the line-of-sight test; the idle predicate uses the same test.
   - A bait uses the last crew manoeuvre stamped on an *earlier* tick than the contact (this tick's stamp is taken after the contacts are checked), within `BAIT_WINDOW_TICKS` (300) of it; a manoeuvre needs the enemy within `BAIT_RANGE` (900).
   - A console swap is a sit at a console other than the one the player last sat at (the scripted pair never swaps).
   - `recordTick` ignores a call after the duel has ended.
9. **The passive crew** (spec §5) **(rec.)**: both players send `presence {present: false}` on tick 0, so neither console is attended for the whole duel and both characters stay where they are.
10. **The duel golden** (spec §6) **(rec.)**: seed 1 (a 262.9 s crew win), a hash every 600 ticks (26 hashes), written by `npm run bless` to `tests/golden/duel-1.json` as indented JSON with `simVersion`, `seed`, `outcome`, `ticks`, `finalHash`, `every` and `hashes`. The same-seed test steps two independent duels from seed 7 side by side and compares the hash after every tick.
11. **The determinism fixture** (found by the prototype; not in the spec's re-bless list): `tests/fixtures/determinism-v2.json` (the Net-1b durability fixture) stores `simVersion` in every recorded checkpoint, so the bump fails `tests/determinismHarness.test.ts` ("snapshot sim version does not match"). Its capture script refuses to overwrite by design. The plan adds `scripts/determinism/rebless-version.ts`: it moves every checkpoint to the current version (init, snapshot header, the snapshot's flattened version value), re-executes the fixture's own schedules, and writes only if every canonical field except `$simVersion`, every sample's place and all 404 result and event boundaries are unchanged. It is not a projection fixture; `net1a-baseline.json` and `net1a-gates.json` are untouched.
12. **Version-only proof for the sector golden**: Task 4 diffs the re-blessed `tests/golden/basic.json` against the committed one and fails if anything other than `simVersion`, `contentDigest`, the snapshots' flattened version value and the hashes changed (the prototype found 14,531 differing leaves, every one of those kinds). The pinned projection checks in `tests/golden.test.ts` and `tests/netParity.test.ts` pass untouched.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/duel/state.ts` | **Replace:** `RepairEvent`; `DuelState.events` (created empty) |
| `src/renderer/src/sim/duel/step.ts` | **Replace:** `repairPhase` pushes repair events; `stepDuelTick` clears `d.events` first |
| `src/renderer/src/sim/duel/telemetry.ts` | **Create:** `createTelemetry`, `recordTick`, `endedFromPlanet`, `BAIT_WINDOW_TICKS`, `BAIT_RANGE` |
| `src/renderer/src/sim/duel/scripted.ts` | **Create:** the scripted pair, `bfsPath`, `goalTiles`, the pair's constants |
| `src/renderer/src/sim/tactical/tuning.ts` | **Replace:** `SHIP_HULL` 30 → 40 (only change) |
| `src/renderer/src/sim/tuning.ts` | **Replace:** `SIM_VERSION` 35 → 36 (only change) |
| `src/renderer/src/sim/duel/hash.ts` | **Replace:** `flattenDuel` starts with `SIM_VERSION` |
| `scripts/duel-telemetry.ts` | **Create:** the tuning tool |
| `scripts/bless-golden.ts` | **Replace:** also writes the duel golden |
| `scripts/determinism/rebless-version.ts` | **Create:** the version-only re-bless of the determinism fixture |
| `tests/helpers/scriptedDuel.ts` | **Create:** `runDuel`, `gateSummary`, `telemetryLine`, `median`, the gate and golden constants |
| `tests/duelTelemetry.test.ts`, `tests/duelScripted.test.ts`, `tests/duelGates.test.ts`, `tests/duelGolden.test.ts` | **Create:** the tests |
| `tests/duel.test.ts` | **Replace:** the `DuelState` shape test lists `events` (only change) |
| `tests/duelReadout.test.ts` | **Replace:** the hull rows read `40/40` and `21/40` (only change) |
| `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/fixtures/determinism-v2.json` | **Generated** in Task 4 |

---

### Task 1: Repair events and the telemetry accumulator

**Files:**
- Modify (whole file): `src/renderer/src/sim/duel/state.ts`, `src/renderer/src/sim/duel/step.ts`, `tests/duel.test.ts`
- Create: `src/renderer/src/sim/duel/telemetry.ts`, `tests/duelTelemetry.test.ts`

**Interfaces:**
- Consumes: `stepDuelTick`, `DuelInput`, `createDuel`, `DuelState`, `hashDuel`; `Seated` (`sim/components.ts`); `inArc` (`sim/tactical/geometry.ts`); `canLaunch`, `laserFull` (`sim/tactical/weapons.ts`); `CONTACT_GRACE_TICKS`, `LASER_ARC_COS`, `LASER_RANGE`; `Outcome`.
- Produces:
  - `state.ts`: `type RepairEvent = { kind: 'repairWork'; player: number; room: number } | { kind: 'repairDone'; room: number; players: number[] }`; `DuelState.events: RepairEvent[]`.
  - `telemetry.ts`: `BAIT_WINDOW_TICKS` (300), `BAIT_RANGE` (900); `type TerminalCause = 'planet' | 'asteroid' | 'ship' | 'laser' | 'missile'`; `type MissileLoss`; `interface ShipTelemetry`, `PlayerTelemetry`, `DuelTelemetry`; `createTelemetry(d: DuelState): DuelTelemetry`; `recordTick(t: DuelTelemetry, d: DuelState, input: DuelInput): void`; `endedFromPlanet(t: DuelTelemetry): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `tests/duelTelemetry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position } from '../src/renderer/src/sim/components';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick, type DuelInput } from '../src/renderer/src/sim/duel/step';
import { BAIT_WINDOW_TICKS, createTelemetry, endedFromPlanet, recordTick, type DuelTelemetry } from '../src/renderer/src/sim/duel/telemetry';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const HOLD: HeldInput = { moveX: 0, moveY: 0, interactHeld: true };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
/** One tick, folded into the telemetry when one is given. */
function step(d: DuelState, t: DuelTelemetry | null, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]): void {
  const input: DuelInput = { held, commands };
  stepDuelTick(d, input);
  if (t) recordTick(t, d, input);
}
/** Stand player pid up and put them at tile (tx, ty), as if they had walked there. */
function standAt(d: DuelState, t: DuelTelemetry | null, pid: number, tx: number, ty: number): void {
  step(d, t, [cmd(d, pid, { kind: 'stand' })]);
  const eid = d.interior.crew[pid]!;
  Position.x[eid] = tx + 0.5; Position.y[eid] = ty + 0.5;
}

describe('repair events (H-0c-ii-a spec §4)', () => {
  it('a repairWork per worker every tick of work, a repairDone when the level drops, cleared every tick', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, null, 0, 1, 6);
    expect(d.events).toEqual([]);
    for (let k = 0; k < 239; k++) {
      step(d, null, [], [HOLD, NONE]);
      expect(d.events).toEqual([{ kind: 'repairWork', player: 0, room: Room.Engines }]);
    }
    step(d, null, [], [HOLD, NONE]);
    expect(d.events).toEqual([{ kind: 'repairWork', player: 0, room: Room.Engines }, { kind: 'repairDone', room: Room.Engines, players: [0] }]);
    step(d, null, [], [HOLD, NONE]);   // the room is at 0: nothing to work on
    expect(d.events).toEqual([]);
  });
  it('a joint finish names both workers; the events are not hashed', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, null, 0, 1, 6); standAt(d, null, 1, 1, 7);
    for (let k = 0; k < 95; k++) step(d, null, [], [HOLD, HOLD]);
    const h = hashDuel(d);
    d.events = [{ kind: 'repairDone', room: 0, players: [1] }];
    expect(hashDuel(d)).toBe(h);
    step(d, null, [], [HOLD, HOLD]);
    expect(d.events.at(-1)).toEqual({ kind: 'repairDone', room: Room.Engines, players: [0, 1] });
  });
});

describe('telemetry (H-0c-ii-a spec §4)', () => {
  it('counts a repair start on the first tick of work and again on resumed work; a finish per level dropped', () => {
    const d = createDuel(layout, 5), t = createTelemetry(d), ship = d.tactical.ships[0];
    ship.rooms[Room.Weapons] = 2;
    step(d, t, [cmd(d, 1, { kind: 'stand' })]);                            // the gunner stands in reach of the Weapons point
    for (let k = 0; k < 480; k++) step(d, t, [], [NONE, HOLD]);              // both levels, held throughout
    expect(ship.rooms[Room.Weapons]).toBe(0);
    expect(t.players[1]).toMatchObject({ repairsStarted: 1, repairsFinished: 2, repairingTicks: 480, walkingTicks: 1 });
    ship.rooms[Room.Weapons] = 1;                                           // a new hit while still holding: the same work goes on
    for (let k = 0; k < 10; k++) step(d, t, [], [NONE, HOLD]);
    expect(t.players[1].repairsStarted).toBe(1);
    step(d, t);                                                             // let go for one tick, then resume: a new start
    for (let k = 0; k < 230; k++) step(d, t, [], [NONE, HOLD]);
    expect(t.players[1]).toMatchObject({ repairsStarted: 2, repairsFinished: 3 });
    expect(t.players[0]).toMatchObject({ repairsStarted: 0, repairsFinished: 0, walkingTicks: 0, repairingTicks: 0 });
    expect(t.weaponsEmptyTicks).toBe(t.ticks);
    expect(t.helmEmptyTicks).toBe(0);
  });
  it('credits a joint finish to both players', () => {
    const d = createDuel(layout, 5), t = createTelemetry(d), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, t, 0, 1, 6); standAt(d, t, 1, 1, 7);
    for (let k = 0; k < 96; k++) step(d, t, [], [HOLD, HOLD]);
    expect(t.players.map((p) => [p.repairsStarted, p.repairsFinished])).toEqual([[1, 1], [1, 1]]);
  });
  it('a crew ship that dies on the planet ends the duel from planet contact', () => {
    const d = createDuel(layout, 5), t = createTelemetry(d), s = d.tactical.ships[0], p = d.tactical.map.planet;
    s.x = p.x + p.r + SHIP_RADIUS - 5; s.y = p.y; s.vx = -10; s.vy = 0; s.hull = 1;
    step(d, t);
    expect(t.outcome).toBe(Outcome.EnemyWins);
    expect(t.terminal).toEqual([['planet'], []]);
    expect(t.ships[0].planetContacts).toBe(1);
    expect(endedFromPlanet(t)).toBe(true);
  });
  it('a laser kill is attributed to the laser, not the planet', () => {
    const d = createDuel(layout, 5), t = createTelemetry(d), [s, e] = d.tactical.ships;
    e.x = s.x + hx(s.heading) * 200; e.y = s.y + hy(s.heading) * 200; e.vx = s.vx; e.vy = s.vy; e.shields = 0; e.hull = 1;
    s.laserCharge = LASER_CHARGE_UNITS; s.fireHeld = true;
    step(d, t, [cmd(d, 1, { kind: 'laserCharge', held: false })]);
    expect(t.outcome).toBe(Outcome.CrewWins);
    expect(t.terminal).toEqual([[], ['laser']]);
    expect(t.ships[0]).toMatchObject({ laserReleases: 1, laserHits: 1, laserMisses: 0, layersStripped: 0 });
    expect(endedFromPlanet(t)).toBe(false);
  });
  it('an enemy planet contact after a crew manoeuvre with the enemy near is a bait; without one, or too late, it is not', () => {
    const bait = (manoeuvre: boolean, wait: number): number => {
      const d = createDuel(layout, 5), t = createTelemetry(d), [s, e] = d.tactical.ships, p = d.tactical.map.planet;
      e.x = s.x + 500; e.y = s.y; e.vx = s.vx; e.vy = s.vy;                  // within 900 of the crew, far from the planet
      step(d, t, [], [manoeuvre ? { moveX: 1, moveY: 0, interactHeld: false } : NONE, NONE]);
      for (let k = 0; k < wait; k++) step(d, t);
      e.x = p.x - p.r - SHIP_RADIUS + 5; e.y = p.y; e.vx = 10; e.vy = 0;     // into the planet's far side
      step(d, t);
      expect(t.ships[1].planetContacts).toBe(1);
      return t.baits;
    };
    expect(bait(true, 0)).toBe(1);
    expect(bait(false, 0)).toBe(0);
    expect(bait(true, BAIT_WINDOW_TICKS)).toBe(0);
  });
  it('counts Weapons as idle only with nothing to do: full, no launch possible, enemy out of the arc', () => {
    const d = createDuel(layout, 5), t = createTelemetry(d), s = d.tactical.ships[0];
    s.laserCharge = LASER_CHARGE_UNITS;
    step(d, t);                                                             // a launch is possible (enemy far, magazine full)
    expect(t.weaponsIdleTicks).toBe(0);
    s.magazine = 0;
    step(d, t);
    expect(t.weaponsIdleTicks).toBe(1);
    step(d, t, [cmd(d, 1, { kind: 'stand' })]);                             // nobody at Weapons: not idle, empty
    expect([t.weaponsIdleTicks, t.weaponsEmptyTicks]).toEqual([1, 1]);
  });
  it('counts missile launches and their losses by cause', () => {
    const d = createDuel(layout, 5), t = createTelemetry(d);
    step(d, t, [cmd(d, 1, { kind: 'missileLaunch' })]);
    while (d.tactical.missiles[0] && d.tactical.outcome === Outcome.Running) step(d, t);
    const c = t.ships[0], lost = Object.values(c.missileLosses).reduce((a, b) => a + b, 0) + c.missileHitsByRoom.reduce((a, b) => a + b, 0);
    expect(c.missilesLaunched).toBe(1);
    expect(lost).toBe(1);
  });
});
```

Replace the whole of `tests/duel.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { inReachOfTile } from '../src/renderer/src/sim/interact';
import { Position, Seated } from '../src/renderer/src/sim/components';
import { DoorState, roomAt } from '../src/renderer/src/sim/grid';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
function step(d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]) { return stepDuelTick(d, { held, commands }); }
/** Stand player pid up and put them at tile (tx, ty) of the interior, as if they had walked there. */
function standAt(d: DuelState, pid: number, tx: number, ty: number): void {
  step(d, [cmd(d, pid, { kind: 'stand' })]);
  const eid = d.interior.crew[pid]!;
  Position.x[eid] = tx + 0.5; Position.y[eid] = ty + 0.5;
}

describe('createDuel (spec §8)', () => {
  it('seats player 0 at Navigation and player 1 at Weapons, holds every door open, and resolves the repair points', () => {
    const d = createDuel(layout, 5), st = d.interior;
    expect([st.stations.occupant[d.nav], st.stations.occupant[d.weapons]]).toEqual([0, 1]);
    expect([Seated.station[st.crew[0]!], Seated.station[st.crew[1]!]]).toEqual([d.nav, d.weapons]);
    expect([...st.doors.state].every((s) => s === DoorState.HeldOpen)).toBe(true);
    expect(d.points.map((p) => [p.tacticalRoom, p.room])).toEqual([[Room.Weapons, st.derived.roomIndex.get('W')], [Room.Shields, st.derived.roomIndex.get('R')], [Room.Engines, st.derived.roomIndex.get('E')]]);
    expect(d.present).toEqual([true, true]);
  });
});

describe('DuelState shape', () => {
  it('has exactly these fields; a new field must also go into flattenDuel in duel/hash.ts', () => {
    expect(Object.keys(createDuel(layout, 5)).sort()).toEqual(['events', 'interior', 'nav', 'points', 'present', 'repair', 'tactical', 'weapons']);
  });
  it('disposeDuel is idempotent', () => {
    const d = createDuel(layout, 5);
    disposeDuel(d);
    expect(() => disposeDuel(d)).not.toThrow();
  });
});

describe('seat phase guards', () => {
  it('rejects presence from player 2 or with a non-boolean value as malformed', () => {
    const d = createDuel(layout, 5);
    const bad = cmd(d, 2, { kind: 'presence', present: false }), odd = cmd(d, 0, { kind: 'presence', present: 'no' } as unknown as DuelCommand);
    const r = step(d, [bad, odd]);
    expect(r.map((x) => [x.status, x.reason])).toEqual([['rejected', 'malformed'], ['rejected', 'malformed']]);
    expect(d.present).toEqual([true, true]);
    expect(d.present).toHaveLength(2);
  });
  it('an away player cannot stand or sit: the character stays exactly where it is', () => {
    const d = createDuel(layout, 5), eid = d.interior.crew[0]!;
    step(d, [cmd(d, 0, { kind: 'presence', present: false })]);
    const r = step(d, [cmd(d, 0, { kind: 'stand' })]);
    expect(r[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    expect(Seated.station[eid]).toBe(d.nav);
    const e2 = d.interior.crew[1]!;
    step(d, [cmd(d, 1, { kind: 'stand' })]);
    step(d, [cmd(d, 1, { kind: 'presence', present: false })]);
    const [x, y] = [Position.x[e2]!, Position.y[e2]!];
    const r2 = step(d, [cmd(d, 1, { kind: 'sit', station: d.weapons })], [NONE, { moveX: 1, moveY: 0, interactHeld: false }]);
    expect(r2[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    expect(Seated.station[e2]).toBe(-1);
    expect([Position.x[e2], Position.y[e2]]).toEqual([x, y]);
  });
});

describe('consoles are roles (spec §8, §13)', () => {
  it('the Helm player’s held axes fly the ship: moveX +1 turns clockwise, W (moveY −1) thrusts along the nose', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0], h0 = s.heading;
    step(d, [], [{ moveX: 1, moveY: 0, interactHeld: false }, NONE]);
    expect(s.heading).toBe((h0 + 1) % 256);                              // 1.78 steps per tick: one whole step on the first tick
    const coast = createDuel(layout, 5), thrust = createDuel(layout, 5);
    step(coast); step(thrust, [], [{ moveX: 0, moveY: -1, interactHeld: false }, NONE]);
    const [a, b] = [coast.tactical.ships[0], thrust.tactical.ships[0]];
    const dx = b.vx - a.vx, dy = b.vy - a.vy;                           // the velocity thrust added this tick
    expect(dx * hx(b.heading) + dy * hy(b.heading)).toBeGreaterThan(0.99 * Math.hypot(dx, dy));
    expect(Math.hypot(dx, dy)).toBeGreaterThan(1.9);                     // about THRUST · dt = 2 u/s
  });
  it('accepts weapon commands only from the present player seated at Weapons', () => {
    const d = createDuel(layout, 5);
    const helmPress = cmd(d, 0, { kind: 'laserCharge', held: true }), gunPress = cmd(d, 1, { kind: 'laserCharge', held: true });
    const results = step(d, [helmPress, gunPress]);
    expect(results.find((r) => r.id === helmPress.id)).toMatchObject({ status: 'rejected', reason: 'not-at-weapons' });
    expect(results.find((r) => r.id === gunPress.id)).toMatchObject({ status: 'applied' });
    expect(d.tactical.ships[0].fireHeld).toBe(true);
    for (let t = 0; t < 239; t++) step(d);
    expect(d.tactical.ships[0].laserCharge).toBe(LASER_CHARGE_UNITS);
    step(d, [cmd(d, 1, { kind: 'laserCharge', held: false })]);
    expect(d.tactical.ships[0].shots).toBe(1);
  });
  it('weapon commands take effect lock, then charge, then launch, whatever their envelope order', () => {
    for (const launchFirst of [true, false]) {
      const d = createDuel(layout, 5), s = d.tactical.ships[0];
      s.fireHeld = true; s.laserCharge = LASER_CHARGE_UNITS;            // a full charge, held
      const launch = cmd(d, 1, { kind: 'missileLaunch' }), release = cmd(d, 1, { kind: 'laserCharge', held: false });
      const results = step(d, launchFirst ? [launch, release] : [release, launch]);
      expect(results.map((r) => r.status), String(launchFirst)).toEqual(['applied', 'applied']);
      expect([s.shots, s.missilesLaunched], String(launchFirst)).toEqual([1, 1]);   // the release fired, then the missile launched
    }
    for (const lockFirst of [true, false]) {
      const d = createDuel(layout, 5), [s, e] = d.tactical.ships;
      Object.assign(e, { x: s.x + hx(s.heading) * 300, y: s.y + hy(s.heading) * 300, shields: 0 });   // dead ahead, shields down
      s.fireHeld = true; s.laserCharge = LASER_CHARGE_UNITS;
      const lock = cmd(d, 1, { kind: 'laserLock', room: Room.Engines }), release = cmd(d, 1, { kind: 'laserCharge', held: false });
      step(d, lockFirst ? [lock, release] : [release, lock]);
      expect(e.rooms, String(lockFirst)).toEqual([0, 0, 1]);           // the new lock applied before the shot
    }
  });
  it('rejects a bad lock, a charge while a missile flies, and a launch it cannot make', () => {
    const d = createDuel(layout, 5);
    const lock = cmd(d, 1, { kind: 'laserLock', room: 1.5 }), launch = cmd(d, 1, { kind: 'missileLaunch' });
    expect(step(d, [lock, launch]).map((r) => r.reason)).toEqual(['malformed', undefined]);
    const charge = cmd(d, 1, { kind: 'laserCharge', held: true }), again = cmd(d, 1, { kind: 'missileLaunch' });
    expect(step(d, [charge, again]).map((r) => r.reason)).toEqual(['missile-in-flight', 'unavailable']);
  });
  it('standing up empties the console: the ship coasts and weapon commands are refused', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0];
    const stand = cmd(d, 0, { kind: 'stand' });
    expect(step(d, [stand])[0]).toMatchObject({ status: 'applied' });
    const h = s.heading;
    step(d, [], [{ moveX: 1, moveY: 0, interactHeld: false }, NONE]);
    expect(s.heading).toBe(h);                                           // nobody at the Helm: axes ignored
    expect(Seated.station[d.interior.crew[0]!]).toBe(-1);
  });
  it('a standing player walks with the held stick and can sit back down at the console', () => {
    const d = createDuel(layout, 5), eid = d.interior.crew[0]!;
    step(d, [cmd(d, 0, { kind: 'stand' })]);
    const x0 = Position.x[eid]!;
    for (let t = 0; t < 15; t++) step(d, [], [{ moveX: -1, moveY: 0, interactHeld: false }, NONE]);
    expect(Position.x[eid]!).toBeLessThan(x0 - 0.5);                   // 4 tiles/s for 0.25 s
    for (let t = 0; t < 15; t++) step(d, [], [{ moveX: 1, moveY: 0, interactHeld: false }, NONE]);
    expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav })])[0]).toMatchObject({ status: 'applied' });
    expect(d.interior.stations.occupant[d.nav]).toBe(0);
  });
  it('rejects sitting at a scenery console, unknown kinds, and stale ticks', () => {
    const d = createDuel(layout, 5);
    step(d, [cmd(d, 0, { kind: 'stand' })]);
    const science = 3, sit = cmd(d, 0, { kind: 'sit', station: science });
    const stale: DuelEnvelope = { ...cmd(d, 1, { kind: 'laserCharge', held: true }), requestedTick: d.interior.tick - 1 };
    expect(step(d, [sit, stale]).map((r) => r.reason)).toEqual(['not-in-duel', 'stale-tick']);
  });
});

describe('weapon commands need a present gunner (spec §13)', () => {
  it('a command claiming player −1 is refused when Weapons is empty or its occupant is away', () => {
    for (const vacate of ['stand', 'away'] as const) {
      const d = createDuel(layout, 5), s = d.tactical.ships[0];
      step(d, [vacate === 'stand' ? cmd(d, 1, { kind: 'stand' }) : cmd(d, 1, { kind: 'presence', present: false })]);
      const ghost = [cmd(d, -1, { kind: 'laserLock', room: Room.Engines }), cmd(d, -1, { kind: 'laserCharge', held: true }), cmd(d, -1, { kind: 'missileLaunch' })];
      expect(step(d, ghost).map((r) => r.reason), vacate).toEqual(['not-at-weapons', 'not-at-weapons', 'not-at-weapons']);
      expect([s.lock, s.fireHeld, d.tactical.missiles[0]], vacate).toEqual([Room.Shields, false, null]);
    }
  });
});

describe('present or away (spec §8, §11a)', () => {
  it('an away player\’s console is empty: Fire lets go without firing and their commands are refused', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0];
    step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })]);
    expect(s.fireHeld).toBe(true);
    step(d, [cmd(d, 1, { kind: 'presence', present: false })]);
    expect(d.present).toEqual([true, false]);
    expect(s.fireHeld).toBe(false);
    expect(s.shots).toBe(0);
    expect(step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })])[0]).toMatchObject({ reason: 'not-at-weapons' });
    step(d, [cmd(d, 1, { kind: 'presence', present: true })]);
    expect(step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })])[0]).toMatchObject({ status: 'applied' });
  });
  it('an away player does not walk or repair', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[0].rooms[Room.Engines] = 1;
    standAt(d, 0, 1, 6);                                                 // Engines room, next to its repair point (2, 6)
    step(d, [cmd(d, 0, { kind: 'presence', present: false })]);
    const eid = d.interior.crew[0]!, x = Position.x[eid];
    for (let t = 0; t < 30; t++) step(d, [], [{ moveX: 1, moveY: 0, interactHeld: true }, NONE]);
    expect(Position.x[eid]).toBe(x);
    expect(d.repair[Room.Engines]).toBe(0);
  });
});

describe('repair in the room (spec §8)', () => {
  it('one repairer lowers a room one level in exactly 240 ticks; progress waits when released', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 2;
    standAt(d, 0, 1, 6);
    const hold: HeldInput[] = [{ moveX: 0, moveY: 0, interactHeld: true }, NONE];
    for (let t = 0; t < 100; t++) step(d, [], hold);
    for (let t = 0; t < 50; t++) step(d);                                // let go: progress kept
    expect(d.repair[Room.Engines]).toBe(100 * 4);
    for (let t = 0; t < 139; t++) step(d, [], hold);
    expect(ship.rooms[Room.Engines]).toBe(2);
    step(d, [], hold);
    expect(ship.rooms[Room.Engines]).toBe(1);
    expect(d.repair[Room.Engines]).toBe(0);
  });
  it('two repairers on one point finish in 96 ticks', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, 0, 1, 6); standAt(d, 1, 1, 7);
    const both: HeldInput[] = [{ moveX: 0, moveY: 0, interactHeld: true }, { moveX: 0, moveY: 0, interactHeld: true }];
    for (let t = 0; t < 95; t++) step(d, [], both);
    expect(ship.rooms[Room.Engines]).toBe(1);
    step(d, [], both);
    expect(ship.rooms[Room.Engines]).toBe(0);
  });
  it('needs the repairer inside the repair room: in reach through a wall does not count', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, 0, 2, 4);                                                 // (2, 4) is the door tile north of Engines, outside the room
    expect(roomAt(d.interior, 2.5, 4.5)).not.toBe(d.points[2]!.room);
    expect(inReachOfTile(d.interior, d.interior.crew[0]!, d.points[2]!.tile)).toBe(true);   // in reach, so only the same-room rule keeps it from repairing
    for (let t = 0; t < 300; t++) step(d, [], [{ moveX: 0, moveY: 0, interactHeld: true }, NONE]);
    expect(ship.rooms[Room.Engines]).toBe(1);
  });
  it('the gunner can fix the Weapons room from the console spot, with the console empty meanwhile', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Weapons] = 1;
    step(d, [cmd(d, 1, { kind: 'stand' })]);
    for (let t = 0; t < 240; t++) step(d, [], [NONE, { moveX: 0, moveY: 0, interactHeld: true }]);
    expect(ship.rooms[Room.Weapons]).toBe(0);
  });
});

describe('the duel tick', () => {
  it('is deterministic: the same seed and inputs give the same duel hash', () => {
    const run = (): string => {
      const d = createDuel(layout, 9);
      for (let t = 0; t < 900; t++) step(d, t === 10 ? [cmd(d, 0, { kind: 'stand' })] : [], [{ moveX: t % 50 < 25 ? 1 : -1, moveY: 0, interactHeld: false }, NONE]);
      return hashDuel(d);
    };
    expect(run()).toBe(run());
  });
  it('keeps the interior and tactical ticks together, and stops when the duel ends', () => {
    const d = createDuel(layout, 5);
    for (let t = 0; t < 10; t++) step(d);
    expect([d.interior.tick, d.tactical.tick]).toEqual([10, 10]);
    d.tactical.ships[0].hull = 0;
    step(d);
    expect(d.tactical.outcome).toBe(Outcome.EnemyWins);
    expect(step(d)).toEqual([]);
    expect([d.interior.tick, d.tactical.tick]).toEqual([11, 11]);
  });
});

describe('the interior stays quiet (spec §17 risk 7)', () => {
  it('starts no fire, breach, boarder or event in 3,600 busy ticks', () => {
    const d = createDuel(layout, 5), st = d.interior, event0 = st.run.event;
    for (let t = 0; t < 3600; t++) {
      const cmds = t === 10 ? [cmd(d, 0, { kind: 'stand' })] : t % 120 === 0 ? [cmd(d, 1, { kind: 'laserCharge', held: true })] : t % 120 === 60 ? [cmd(d, 1, { kind: 'laserCharge', held: false })] : [];
      step(d, cmds, [{ moveX: t % 40 < 20 ? 1 : -1, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }]);
      if (d.tactical.outcome !== Outcome.Running) break;
    }
    expect(d.tactical.tick).toBeGreaterThan(100);
    expect([...st.rooms.fire].every((f) => f === 0)).toBe(true);
    expect([...st.breaches.active].every((b) => b === 0)).toBe(true);
    expect([...st.boarders.active].every((b) => b === 0)).toBe(true);
    expect(st.run.event).toBe(event0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/duelTelemetry.test.ts tests/duel.test.ts`
Expected: FAIL in both files. `tests/duelTelemetry.test.ts` fails to load with "Error: Cannot find module '../src/renderer/src/sim/duel/telemetry' imported from '<repo>/tests/duelTelemetry.test.ts'" (not written yet); in `tests/duel.test.ts` only the shape test fails, with "AssertionError: expected [ 'interior', 'nav', 'points', …(4) ] to deeply equal [ 'events', 'interior', 'nav', …(5) ]", and the other 21 pass.

- [ ] **Step 3: Write the repair events and the telemetry**

Replace the whole of `src/renderer/src/sim/duel/state.ts` with:

```ts
// The duel's state (spec §8, §13): today's SimState for the Cutter interior, the tactical state, who is present, and
// the repair progress of each tactical room. Only the interior systems the duel lists ever run on `interior`.
import { RECRUIT } from '../characters';
import { DoorState, roomAt } from '../grid';
import type { ShipLayout } from '../ship/schema';
import { createSimState, disposeSimState, type SimState } from '../state';
import { StationKind } from '../stationKinds';
import { sitDown } from '../stations';
import { validateMap } from '../tactical/map';
import { createTacticalState, type TacticalState } from '../tactical/state';
import { CUTTER_REPAIR_POINTS } from './tuning';

export interface RepairPoint { tacticalRoom: number; room: number; tile: number }

/** Per-tick repair events (H-0c-ii-a spec §4), for telemetry and views. Derived, not state: cleared every tick and not
 *  hashed. `repairWork`: a player added repair work to a tactical Room this tick. `repairDone`: the Room's level dropped
 *  this tick; `players` names everyone who worked on it this tick, ascending. */
export type RepairEvent =
  | { kind: 'repairWork'; player: number; room: number }
  | { kind: 'repairDone'; room: number; players: number[] };

export interface DuelState {
  interior: SimState;
  tactical: TacticalState;
  /** Whether each player is at the keyboard (spec §8 "present or away"). */
  present: [boolean, boolean];
  /** Repair progress per tactical Room (index = Room), in REPAIR_UNITS. */
  repair: [number, number, number];
  /** Resolved repair points, in tactical Room order. */
  points: RepairPoint[];
  /** Station indices of the two consoles that are roles (spec §8). */
  nav: number; weapons: number;
  /** This tick's repair events, in the order repairPhase makes them (every repairWork, then any repairDone in Room order). */
  events: RepairEvent[];
}

/**
 * A duel on `layout` (the Cutter): two trait-free Recruits (no XP is ever awarded, since xpSystem never runs), every
 * door held open, player 0 seated at Navigation and player 1 at Weapons, and a tactical state from the same seed whose
 * map must validate. Throws if the map or a repair point is invalid, so a bad seed or layout fails loudly.
 */
export function createDuel(layout: ShipLayout, seed: number): DuelState {
  const tactical = createTacticalState(seed);
  const problems = validateMap(tactical.map);
  if (problems.length > 0) throw new Error(`invalid duel map for seed ${seed}: ${problems[0]}`);
  const interior = createSimState(layout, 2, seed, [RECRUIT, RECRUIT]);
  try {
    interior.doors.state.fill(DoorState.HeldOpen);
    const nav = interior.derived.stationOfKind[StationKind.Navigation]!, weapons = interior.derived.stationOfKind[StationKind.Weapons]!;
    if (nav < 0 || weapons < 0) throw new Error('duel layout needs Navigation and Weapons consoles');
    sitDown(interior, 0, nav);
    sitDown(interior, 1, weapons);
    const points = CUTTER_REPAIR_POINTS.map((p) => {
      const room = interior.derived.roomIndex.get(p.room) ?? -1, [tx, ty] = p.tile;
      if (room < 0 || roomAt(interior, tx + 0.5, ty + 0.5) !== room) throw new Error(`repair point ${p.room} ${tx},${ty} is not inside its room`);
      return { tacticalRoom: p.tacticalRoom, room, tile: ty * interior.derived.width + tx };
    });
    return { interior, tactical, present: [true, true], repair: [0, 0, 0], points, nav, weapons, events: [] };
  } catch (err) {
    disposeSimState(interior);   // release its entities and component storage before rethrowing
    throw err;
  }
}

/** Release the duel's interior entities and storage (idempotent, like disposeSimState). */
export function disposeDuel(d: DuelState): void { disposeSimState(d.interior); }
```

Replace the whole of `src/renderer/src/sim/duel/step.ts` with:

```ts
// One duel tick (spec §13 phase list). The sector step (sim/step.ts) is never called on the duel's interior; this runs
// only the interior pieces the duel uses (sit, stand, Interact for repair, movement) and then the tactical stepDuel.
import { NEUTRAL_INTENT, type Intent } from '../../../../shared/intent';
import type { CommandEnvelope, CommandResult, HeldInput } from '../../net/contracts';
import { applyConsoleCommand, applyInteractionCommands } from '../commands';
import { Life, LifeState, Position, Seated } from '../components';
import { roomAt } from '../grid';
import { inReachOfTile } from '../interact';
import { movementSystem } from '../movement';
import { stepDuel } from '../tactical/duel';
import { Outcome } from '../tactical/state';
import { canCharge, canLaunch, validLock, type ShipInput } from '../tactical/weapons';
import type { DuelEnvelope, DuelReason, DuelResult } from './commands';
import type { DuelState } from './state';
import { REPAIR_RATE_SOLO, REPAIR_RATE_TEAM, REPAIR_UNITS } from './tuning';

export interface DuelInput { held: readonly HeldInput[]; commands: readonly DuelEnvelope[] }

const NO_HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The fixed order weapon commands take effect in within one tick. */
const WEAPON_ORDER = ['laserLock', 'laserCharge', 'missileLaunch'] as const;

function resetScratch(d: DuelState): void {
  const sc = d.interior.scratch;
  sc.commandResults.length = 0;
  sc.doorToggles.clear(); sc.doorCycles.clear(); sc.airlockToggles.clear();
  sc.satThisTick.fill(0); sc.stoodThisTick.fill(0); sc.activeThisTick.fill(0);
  sc.voteChoices.fill(-1); sc.jumpConfirm.fill(0); sc.confirmUsed.fill(0);
}

/** A duel sit or stand as today's envelope, so today's validation and handlers apply unchanged. */
function sector(env: DuelEnvelope): CommandEnvelope {
  const c = env.command;
  return { runId: 'duel', id: env.id, requestedTick: env.requestedTick, command: c.kind === 'sit' ? { kind: 'sit', station: c.station } : { kind: 'stand' } };
}

/** The player seated at station i who is present, or −1. */
function attendant(d: DuelState, station: number): number {
  const pid = d.interior.stations.occupant[station]!;
  return pid >= 0 && d.present[pid as 0 | 1] ? pid : -1;
}

function conscious(d: DuelState, pid: number): boolean { return Life.state[d.interior.crew[pid]!] === LifeState.Conscious; }
function seated(d: DuelState, pid: number): boolean { return Seated.station[d.interior.crew[pid]!]! >= 0; }

/** Each standing, present, conscious player holding Interact inside a damaged room's repair room and in reach of its
 *  point. Pushes a repairWork event per worker and a repairDone event per room whose level drops (H-0c-ii-a spec §4). */
function repairPhase(d: DuelState, held: readonly HeldInput[]): void {
  const crewShip = d.tactical.ships[0], workers: number[][] = [[], [], []];
  for (let pid = 0; pid < 2; pid++) {
    if (!d.present[pid as 0 | 1] || !conscious(d, pid) || seated(d, pid) || !(held[pid] ?? NO_HELD).interactHeld) continue;
    const eid = d.interior.crew[pid]!, here = roomAt(d.interior, Position.x[eid]!, Position.y[eid]!);
    const point = d.points.find((p) => crewShip.rooms[p.tacticalRoom]! > 0 && p.room === here && inReachOfTile(d.interior, eid, p.tile));
    if (point) { workers[point.tacticalRoom]!.push(pid); d.events.push({ kind: 'repairWork', player: pid, room: point.tacticalRoom }); }
  }
  for (const p of d.points) {
    const r = p.tacticalRoom as 0 | 1 | 2, n = workers[r]!.length;
    if (crewShip.rooms[r] === 0) { d.repair[r] = 0; continue; }
    if (n === 0) continue;
    d.repair[r] += n === 1 ? REPAIR_RATE_SOLO : n * REPAIR_RATE_TEAM;
    if (d.repair[r] >= REPAIR_UNITS) { crewShip.rooms[r]--; d.repair[r] = 0; d.events.push({ kind: 'repairDone', room: r, players: workers[r]! }); }
  }
}

/**
 * Spec §13, in order: scratch reset (and d.events cleared); seat phase (sit through today's interaction validation,
 * only at the two role consoles; stand through today's handler; then presence); tactical commands validated against the
 * seats after the seat phase and folded into the crew's ShipInput; repair, with its events; movement for standing
 * present players; the tactical stepDuel; the interior tick. Commands apply in the order given (the authority's
 * envelope order). Returns one result per command, sorted by player then sequence. Does nothing once the duel has ended.
 */
export function stepDuelTick(d: DuelState, input: DuelInput): DuelResult[] {
  if (d.tactical.outcome !== Outcome.Running) return [];
  const st = d.interior, tick = st.tick, results: DuelResult[] = [];
  const keep = (s: CommandResult['status']): DuelResult['status'] => (s === 'already-processed' ? 'rejected' : s);   // the duel step never produces already-processed
  const result = (env: DuelEnvelope, reason?: DuelReason): void => {
    results.push(reason ? { id: env.id, tick, status: 'rejected', reason } : { id: env.id, tick, status: 'applied' });
  };
  resetScratch(d);
  d.events = [];

  // Seat phase: sits (today's validation), then stands (today's handler), then presence.
  const away = (e: DuelEnvelope): boolean => !d.present[e.id.player as 0 | 1];   // an away character stays exactly where it is (spec §8)
  const sits = input.commands.filter((e) => e.command.kind === 'sit');
  const allowedSits = sits.filter((e) => e.command.kind === 'sit' && (e.command.station === d.nav || e.command.station === d.weapons));
  for (const e of sits) if (!allowedSits.includes(e)) result(e, 'not-in-duel');
  const liveSits = allowedSits.filter((e) => { if (!away(e)) return true; result(e, 'unavailable'); return false; });
  applyInteractionCommands(st, liveSits.map(sector));
  for (const r of st.scratch.commandResults) results.push({ id: r.id, tick, status: keep(r.status), ...(r.reason ? { reason: r.reason } : {}) });
  for (const e of input.commands) if (e.command.kind === 'stand') {
    if (away(e)) { result(e, 'unavailable'); continue; }
    const r = applyConsoleCommand(st, sector(e));
    results.push({ id: r.id, tick, status: keep(r.status), ...(r.reason ? { reason: r.reason } : {}) });
  }
  for (const e of input.commands) if (e.command.kind === 'presence') {
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if ((e.id.player !== 0 && e.id.player !== 1) || typeof e.command.present !== 'boolean') { result(e, 'malformed'); continue; }
    d.present[e.id.player] = e.command.present; result(e);
  }

  // Tactical commands, against the seats as they now stand. Within a tick they take effect in a fixed order, lock, then
  // charge, then launch (the order applyWeaponsInput applies them), whatever their envelope order; admission is checked
  // in that same order so every result matches what happens. Within one kind, envelope order holds and the last wins.
  const helm = attendant(d, d.nav), gunner = attendant(d, d.weapons);
  const crew: ShipInput = { helm: helm >= 0, weapons: gunner >= 0, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false };
  for (const e of WEAPON_ORDER.flatMap((kind) => input.commands.filter((x) => x.command.kind === kind))) {
    const c = e.command;
    if (c.kind !== 'laserLock' && c.kind !== 'laserCharge' && c.kind !== 'missileLaunch') continue;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (gunner < 0 || e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }   // −1 is the empty-seat value, never a player
    if (c.kind === 'laserLock') { if (!validLock(c.room)) { result(e, 'malformed'); continue; } crew.laserLock = c.room; }
    else if (c.kind === 'laserCharge') { if (!canCharge(d.tactical, 0)) { result(e, 'missile-in-flight'); continue; } crew.laserCharge = c.held; }
    else { if (!canLaunch(d.tactical, 0)) { result(e, 'unavailable'); continue; } crew.missileLaunch = true; }
    result(e);
  }
  for (const e of input.commands) if (!['sit', 'stand', 'presence', 'laserLock', 'laserCharge', 'missileLaunch'].includes(e.command.kind)) result(e, 'not-in-duel');
  if (helm >= 0) { const h = input.held[helm] ?? NO_HELD; crew.axes = { turn: h.moveX, thrust: -h.moveY }; }   // W (moveY −1, up) is thrust forward
  if (gunner >= 0) crew.steer = (input.held[gunner] ?? NO_HELD).moveX;

  repairPhase(d, input.held);
  const intents: Intent[] = [0, 1].map((pid) => {
    const h = input.held[pid] ?? NO_HELD;
    return d.present[pid as 0 | 1] ? { ...NEUTRAL_INTENT, moveX: h.moveX, moveY: h.moveY } : { ...NEUTRAL_INTENT };
  });
  movementSystem(st, intents);   // skips seated and downed crew, and anyone who stood this tick
  stepDuel(d.tactical, crew);
  st.tick++;
  return results.sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence);
}
```

Create `src/renderer/src/sim/duel/telemetry.ts`:

```ts
// Duel telemetry (H-0c-ii-a spec §4, parent §13's list): accumulated tick by tick from the duel state after each
// stepDuelTick, that tick's events and the input it was given. Pure apart from its own accumulator; it never changes
// the duel. Counter diffs (contact counters, launches, graceUntil) are taken against the accumulator's copy of the
// tick before.
import { Seated } from '../components';
import { inArc } from '../tactical/geometry';
import { Outcome } from '../tactical/state';
import { CONTACT_GRACE_TICKS, LASER_ARC_COS, LASER_RANGE } from '../tactical/tuning';
import { canLaunch, laserFull } from '../tactical/weapons';
import type { DuelState } from './state';
import type { DuelInput } from './step';

/** A crew manoeuvre counts toward a bait for this many ticks (spec §4). */
export const BAIT_WINDOW_TICKS = 300;
/** A crew manoeuvre needs the enemy within this distance (u). */
export const BAIT_RANGE = 900;

export type TerminalCause = 'planet' | 'asteroid' | 'ship' | 'laser' | 'missile';
export type MissileLoss = 'planet' | 'asteroid' | 'edge' | 'expired' | 'own' | 'missile';

export interface ShipTelemetry {
  laserReleases: number; laserHits: number; laserMisses: number; layersStripped: number;
  missilesLaunched: number;
  /** Missile hits on the other ship by the Room struck (Weapons, Shields, Engines). */
  missileHitsByRoom: [number, number, number];
  missileLosses: Record<MissileLoss, number>;
  planetContacts: number; asteroidContacts: number;
}

export interface PlayerTelemetry {
  repairsStarted: number; repairsFinished: number;
  /** Ticks standing (away from any console), split into walking and repairing. */
  walkingTicks: number; repairingTicks: number;
}

export interface DuelTelemetry {
  ticks: number;
  outcome: number;
  ships: [ShipTelemetry, ShipTelemetry];
  players: [PlayerTelemetry, PlayerTelemetry];
  /** Enemy planet and asteroid contacts that followed a crew manoeuvre (spec §4 baits). */
  baits: number;
  consoleSwaps: number;
  /** Ticks the Helm and the Weapons console were empty (nobody present seated there). */
  helmEmptyTicks: number; weaponsEmptyTicks: number;
  /** Ticks the enemy was inside the crew's laser arc and range. */
  enemyInArcTicks: number;
  /** Ticks Weapons had nothing to do (spec §4 idle predicate). */
  weaponsIdleTicks: number;
  /** For each ship whose hull reached 0 on the final tick, what hit it that tick; empty for a ship still flying. */
  terminal: [TerminalCause[], TerminalCause[]];
  /** The accumulator's copy of the tick before. */
  prev: { counters: number[][]; grace: [Int32Array, Int32Array]; work: [number, number]; seat: [number, number]; lastConsole: [number, number] };
  /** The last crew manoeuvre: its tick (−1 for none) and the enemy's position then. */
  manoeuvre: { tick: number; x: number; y: number };
}

function shipTelemetry(): ShipTelemetry {
  return {
    laserReleases: 0, laserHits: 0, laserMisses: 0, layersStripped: 0, missilesLaunched: 0, missileHitsByRoom: [0, 0, 0],
    missileLosses: { planet: 0, asteroid: 0, edge: 0, expired: 0, own: 0, missile: 0 }, planetContacts: 0, asteroidContacts: 0
  };
}

const counters = (d: DuelState): number[][] => d.tactical.ships.map((s) => [s.planetHits, s.asteroidHits, s.shipHits, s.missilesLaunched]);
const seats = (d: DuelState): [number, number] => [Seated.station[d.interior.crew[0]!]!, Seated.station[d.interior.crew[1]!]!];

export function createTelemetry(d: DuelState): DuelTelemetry {
  const seat = seats(d);
  return {
    ticks: 0, outcome: d.tactical.outcome, ships: [shipTelemetry(), shipTelemetry()],
    players: [0, 1].map(() => ({ repairsStarted: 0, repairsFinished: 0, walkingTicks: 0, repairingTicks: 0 })) as [PlayerTelemetry, PlayerTelemetry],
    baits: 0, consoleSwaps: 0, helmEmptyTicks: 0, weaponsEmptyTicks: 0, enemyInArcTicks: 0, weaponsIdleTicks: 0, terminal: [[], []],
    prev: { counters: counters(d), grace: [new Int32Array(d.tactical.ships[0].graceUntil), new Int32Array(d.tactical.ships[1].graceUntil)], work: [-1, -1], seat, lastConsole: seat },
    manoeuvre: { tick: -1, x: 0, y: 0 }
  };
}

function dist(ax: number, ay: number, bx: number, by: number): number { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

/** The player present and seated at station i, or −1. */
function attendant(d: DuelState, i: number): number {
  const pid = d.interior.stations.occupant[i]!;
  return pid >= 0 && d.present[pid as 0 | 1] ? pid : -1;
}

/** Fold one finished tick into the accumulator: call right after stepDuelTick(d, input) with the same input. A call
 *  after the duel has ended (stepDuelTick did nothing) is ignored. */
export function recordTick(t: DuelTelemetry, d: DuelState, input: DuelInput): void {
  const tac = d.tactical, tick = tac.tick - 1;   // the tick that just ran
  if (tick < t.ticks) return;
  t.ticks = tac.tick; t.outcome = tac.outcome;
  const now = counters(d), [crew, enemy] = tac.ships;

  // Weapons and missiles, from the tick's events.
  const laserOn = [false, false], missileOn = [false, false];
  for (const e of tac.events) {
    const s = t.ships[e.ship as 0 | 1]!;
    if (e.kind === 'laser') {
      s.laserReleases++;
      if (e.hit) { s.laserHits++; if (e.stripped) s.layersStripped++; else laserOn[1 - e.ship] = true; } else s.laserMisses++;
    } else if (e.cause === 'ship') {
      missileOn[e.target] = true;
      if (e.target === e.ship) s.missileLosses.own++; else s.missileHitsByRoom[e.room as 0 | 1 | 2]++;
    } else s.missileLosses[e.cause]++;
  }
  for (let i = 0; i < 2; i++) t.ships[i]!.missilesLaunched += now[i]![3]! - t.prev.counters[i]![3]!;

  // Contacts and baits. The struck bodies are exactly those whose graceUntil was set this tick.
  const struck: number[][] = [[], []];
  for (let i = 0; i < 2; i++) {
    const g = tac.ships[i]!.graceUntil, old = t.prev.grace[i]!, set = tick + CONTACT_GRACE_TICKS;
    for (let k = 0; k < g.length; k++) if (g[k] !== old[k] && g[k] === set) struck[i]!.push(k);
    t.ships[i]!.planetContacts += now[i]![0]! - t.prev.counters[i]![0]!;
    t.ships[i]!.asteroidContacts += now[i]![1]! - t.prev.counters[i]![1]!;
  }
  const m = t.manoeuvre, ship = tac.map.asteroids.length + 1;
  if (m.tick >= 0 && tick - m.tick <= BAIT_WINDOW_TICKS) for (const k of struck[1]!) {
    if (k === ship) continue;
    const b = k === 0 ? tac.map.planet : tac.map.asteroids[k - 1]!;
    if (dist(enemy.x, enemy.y, b.x, b.y) < dist(m.x, m.y, b.x, b.y)) t.baits++;
  }
  const helm = attendant(d, d.nav);
  if (helm >= 0) {
    const h = input.held[helm];
    if (h && (h.moveX !== 0 || h.moveY !== 0) && dist(crew.x, crew.y, enemy.x, enemy.y) <= BAIT_RANGE) { m.tick = tick; m.x = enemy.x; m.y = enemy.y; }
  }

  // Repairs: a start is the first tick of work on a room after not working on it; a finish credits every named player.
  const work: [number, number] = [-1, -1];
  for (const e of d.events) {
    if (e.kind === 'repairWork') work[e.player as 0 | 1] = e.room;
    else for (const p of e.players) t.players[p as 0 | 1]!.repairsFinished++;
  }
  const seat = seats(d);
  for (let pid = 0; pid < 2; pid++) {
    const p = t.players[pid]!;
    if (work[pid]! >= 0 && work[pid] !== t.prev.work[pid]) p.repairsStarted++;
    if (seat[pid]! < 0) { if (work[pid]! >= 0) p.repairingTicks++; else p.walkingTicks++; }
    if (seat[pid]! >= 0 && t.prev.seat[pid]! < 0) { if (seat[pid] !== t.prev.lastConsole[pid]) t.consoleSwaps++; t.prev.lastConsole[pid as 0 | 1] = seat[pid]!; }
  }

  // Consoles, the arc and the idle predicate.
  const gunner = attendant(d, d.weapons);
  if (helm < 0) t.helmEmptyTicks++;
  if (gunner < 0) t.weaponsEmptyTicks++;
  const ex = enemy.x - crew.x, ey = enemy.y - crew.y, inRange = ex * ex + ey * ey <= LASER_RANGE * LASER_RANGE;
  const arc = inRange && inArc(crew.heading, ex, ey, LASER_ARC_COS);
  if (arc) t.enemyInArcTicks++;
  if (gunner >= 0 && tac.missiles[0] === null && laserFull(tac, 0) && (!canLaunch(tac, 0) || inRange) && !arc) t.weaponsIdleTicks++;

  // Terminal cause: what hit each ship whose hull reached 0 on the final tick.
  if (tac.outcome !== Outcome.Running) for (let i = 0; i < 2; i++) {
    if (tac.ships[i]!.hull > 0) continue;
    const c: TerminalCause[] = [], was = t.prev.counters[i]!, is = now[i]!;
    if (is[0]! > was[0]!) c.push('planet');
    if (is[1]! > was[1]!) c.push('asteroid');
    if (is[2]! > was[2]!) c.push('ship');
    if (laserOn[i]) c.push('laser');
    if (missileOn[i]) c.push('missile');
    t.terminal[i as 0 | 1] = c;
  }

  t.prev = { counters: now, grace: [new Int32Array(crew.graceUntil), new Int32Array(enemy.graceUntil)], work, seat, lastConsole: t.prev.lastConsole };
}

/** True when the duel ended from a planet contact: the losing ship (both, for a draw) took one on its final tick. */
export function endedFromPlanet(t: DuelTelemetry): boolean {
  const losers = t.outcome === Outcome.Draw ? [0, 1] : t.outcome === Outcome.CrewWins ? [1] : t.outcome === Outcome.EnemyWins ? [0] : [];
  return losers.length > 0 && losers.every((i) => t.terminal[i]!.includes('planet'));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/duelTelemetry.test.ts tests/duel.test.ts tests/boundary.test.ts`
Expected: PASS, 130 tests in 3 files (9 telemetry, 22 duel, and 99 in the boundary guard, which now also scans `telemetry.ts`).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/duel/state.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/telemetry.ts tests/duelTelemetry.test.ts tests/duel.test.ts
git commit -m "feat(duel): repair events and the duel telemetry accumulator (Helm H-0c-ii-a)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 2: The scripted pair with BFS walking

**Files:**
- Create: `src/renderer/src/sim/duel/scripted.ts`, `tests/duelScripted.test.ts`

**Interfaces:**
- Consumes: `createRng`, `nextFloat` (`src/shared/rng.ts`); `HeldInput` (type only); `Life`, `LifeState`, `Position`, `Seated`; `roomAt`, `solidAt` (`sim/grid.ts`); `inReachOfTile` (`sim/interact.ts`); `stationOnline` (`sim/stations.ts`); `hx`, `hy`; `inArc`, `sideOf`; `queryGrid`; `pursuitTurn` (`sim/tactical/hunter.ts`); `circularSpeed`; `predictPath`; `Room`, `Axes`; `BELT_OUTER`, `LASER_ARC_COS`, `LASER_HOLD_TICKS`, `LASER_RANGE`, `R_MAP`, `SHIP_RADIUS`; `canCharge`, `canLaunch`, `laserEligible`, `laserFull`; `CREW_SPEED`, `DT`, `REACH` (`sim/tuning.ts`); `DuelCommand`, `DuelEnvelope`, `DuelState`, `DuelInput`; Task 1's `d.events` (in the test).
- Produces: `AVOID_TICKS`, `AVOID_MARGIN`, `ORBIT_GAIN`, `ORBIT_MIN`, `ORBIT_MAX`, `SPEED_SLACK`, `MISSILE_GAP`, `PAIR_SALT`; `interface ScriptedPair { rng; orbitR; seq: [number, number]; axes: Axes; lastLaunch: number; task: [number, number] }`; `createScriptedPair(seed: number): ScriptedPair`; `scriptedInput(pair: ScriptedPair, d: DuelState): DuelInput`; `goalTiles(d: DuelState, room: number, target: number): Set<number>`; `bfsPath(d: DuelState, from: number, goals: ReadonlySet<number>): number[] | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/duelScripted.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Seated } from '../src/renderer/src/sim/components';
import { solidAt } from '../src/renderer/src/sim/grid';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import {
  AVOID_MARGIN, AVOID_TICKS, bfsPath, createScriptedPair, goalTiles, MISSILE_GAP, ORBIT_GAIN, ORBIT_MAX, ORBIT_MIN, scriptedInput, SPEED_SLACK
} from '../src/renderer/src/sim/duel/scripted';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { BELT_OUTER, R_MAP } from '../src/renderer/src/sim/tactical/tuning';

const layout = parseShip(cutter);

describe('the scripted pair (H-0c-ii-a spec §3)', () => {
  it('draws its orbit radius once per seed from its own stream, inside the band outside the belt and inside the edge', () => {
    expect(ORBIT_MIN).toBeGreaterThanOrEqual(BELT_OUTER + 200);
    expect(ORBIT_MAX).toBeLessThanOrEqual(R_MAP - 600);
    expect([AVOID_TICKS, AVOID_MARGIN, ORBIT_GAIN, SPEED_SLACK, MISSILE_GAP].every((v) => v > 0)).toBe(true);
    for (let seed = 1; seed <= 10; seed++) {
      const r = createScriptedPair(seed).orbitR;
      expect(r).toBeGreaterThanOrEqual(ORBIT_MIN); expect(r).toBeLessThanOrEqual(ORBIT_MAX);
      expect(createScriptedPair(seed).orbitR).toBe(r);
    }
    const d = createDuel(layout, 3), rng = d.tactical.rng.s;
    createScriptedPair(3);
    expect(d.tactical.rng.s).toBe(rng);   // never rng.tactical
    disposeDuel(d);
  });
  it('walks four-way through walkable tiles only, and measures the Cutter walks to each repair point', () => {
    const d = createDuel(layout, 1), st = d.interior, w = st.derived.width;
    const walk = (station: number, room: number): number[] => {
      const p = d.points.find((q) => q.tacticalRoom === room)!, path = bfsPath(d, st.derived.stationTile[station]!, goalTiles(d, p.room, p.tile))!;
      let at = st.derived.stationTile[station]!;
      for (const next of path) {
        expect(Math.abs((next % w) - (at % w)) + Math.abs(Math.floor(next / w) - Math.floor(at / w))).toBe(1);
        expect(solidAt(st, next % w, Math.floor(next / w))).toBe(false);
        at = next;
      }
      return path;
    };
    expect([Room.Weapons, Room.Shields, Room.Engines].map((r) => walk(d.nav, r).length)).toEqual([21, 11, 28]);
    expect([Room.Weapons, Room.Shields, Room.Engines].map((r) => walk(d.weapons, r).length)).toEqual([0, 9, 5]);
    disposeDuel(d);
  });
  it('the Helm turns away from the planet and thrusts when its predicted path meets it', () => {
    const d = createDuel(layout, 1), s = d.tactical.ships[0], pair = createScriptedPair(1);
    s.x = 0; s.y = -300; s.vx = 0; s.vy = 150; s.heading = 128;           // falling south onto the planet, nose south
    const input = scriptedInput(pair, d);
    expect(input.held[0]).toEqual({ moveX: 1, moveY: -1, interactHeld: false });   // dead astern of the away direction: clockwise, thrust
    disposeDuel(d);
  });
  it('the nearest free character (the gunner, 5 tiles away) walks to an Engines repair, fixes it and sits again', () => {
    const d = createDuel(layout, 1), pair = createScriptedPair(1), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 1;
    let stood = -1, done = -1, sat = -1;
    for (let k = 0; k < 900 && sat < 0; k++) {
      const results = stepDuelTick(d, scriptedInput(pair, d));
      expect(results.every((r) => r.status === 'applied')).toBe(true);
      if (stood < 0 && Seated.station[d.interior.crew[1]!]! < 0) stood = d.interior.tick;
      if (done < 0 && d.events.some((e) => e.kind === 'repairDone')) done = d.interior.tick;
      if (done >= 0 && Seated.station[d.interior.crew[1]!] === d.weapons) sat = d.interior.tick;
      expect(Seated.station[d.interior.crew[0]!]).toBe(d.nav);              // the Helm stays at its console
    }
    expect(stood).toBe(1);
    expect(ship.rooms[Room.Engines]).toBe(0);
    expect(done).toBeGreaterThan(240);                                     // the walk, then 240 ticks of work
    expect(sat).toBeGreaterThan(done);
    expect(pair.task).toEqual([-1, -1]);
    disposeDuel(d);
  });
  it('plays a whole duel with every command admitted: never a weapon command away from Weapons, never a refused sit', () => {
    const d = createDuel(layout, 4), pair = createScriptedPair(4), kinds = new Set<string>();
    while (d.tactical.outcome === Outcome.Running) {
      const input = scriptedInput(pair, d);
      for (const e of input.commands) { kinds.add(e.command.kind); expect(e.requestedTick).toBe(d.interior.tick); }
      expect(stepDuelTick(d, input).every((r) => r.status === 'applied')).toBe(true);
    }
    expect([...kinds].sort()).toEqual(['laserCharge', 'laserLock', 'missileLaunch', 'sit', 'stand']);
    disposeDuel(d);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/duelScripted.test.ts`
Expected: FAIL, "Error: Cannot find module '../src/renderer/src/sim/duel/scripted' imported from '<repo>/tests/duelScripted.test.ts'" (not written yet).

- [ ] **Step 3: Write the scripted pair**

Create `src/renderer/src/sim/duel/scripted.ts`:

```ts
// The scripted pair (H-0c-ii-a spec §3): a deterministic headless crew for tests and telemetry only, never offered as a
// seat (Q15). Each tick it reads the duel and returns that tick's held input and commands. Player 0 flies (avoid, line
// up, orbit), player 1 fights (charge, release, lock, missile), and either walks to a repair by the nearest-free rule.
// It lives under sim/ so the determinism guard covers it; its only randomness is its own seeded stream.
import { createRng, nextFloat, type RngState } from '../../../../shared/rng';
import type { HeldInput } from '../../net/contracts';
import { Life, LifeState, Position, Seated } from '../components';
import { roomAt, solidAt } from '../grid';
import { inReachOfTile } from '../interact';
import { stationOnline } from '../stations';
import { hx, hy } from '../tactical/direction';
import { inArc, sideOf } from '../tactical/geometry';
import { queryGrid } from '../tactical/grid';
import { pursuitTurn } from '../tactical/hunter';
import { circularSpeed } from '../tactical/map';
import { predictPath } from '../tactical/predict';
import { Room, type Axes } from '../tactical/state';
import { BELT_OUTER, LASER_ARC_COS, LASER_HOLD_TICKS, LASER_RANGE, R_MAP, SHIP_RADIUS } from '../tactical/tuning';
import { canCharge, canLaunch, laserEligible, laserFull } from '../tactical/weapons';
import { CREW_SPEED, DT, REACH } from '../tuning';
import type { DuelCommand, DuelEnvelope } from './commands';
import type { DuelState } from './state';
import type { DuelInput } from './step';

// The pair's own numbers (spec §3 "Tunable"), separate from the game tuning.
/** Ticks of predicted path the Helm checks for hazards, and the clearance it keeps from them (u). */
export const AVOID_TICKS = 90;
export const AVOID_MARGIN = 40;
/** Orbit radius correction: tan of the desired direction's tilt toward the planet per unit of radius error (1/u). */
export const ORBIT_GAIN = 0.004;
/** The orbit radius is drawn once per duel in [ORBIT_MIN, ORBIT_MAX] (spec: ≥ BELT_OUTER + 200, ≤ R_MAP − 600). */
export const ORBIT_MIN = 1500;
export const ORBIT_MAX = 2200;
/** Speed band around the circular speed inside which the Helm neither thrusts nor brakes (u/s). */
export const SPEED_SLACK = 8;
/** Ticks between two crew missile launches. */
export const MISSILE_GAP = 900;
/** Salt for the pair's own stream, so it never shares a sequence with rng.tactical. */
export const PAIR_SALT = 0x48454c4d;

/** tan 30°: the tilt clamp (the desired direction is t + tilt · inward, normalised). */
const TAN_30 = 0.5773502691896257;
const COS_45 = 0.7071067811865476;
const COS_10 = 0.984807753012208;
/** cos of one heading step (360° / 256): under it the nose counts as on the desired direction. */
const COS_STEP = 0.9996988186962042;
const NO_HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };

export interface ScriptedPair {
  rng: RngState;
  orbitR: number;
  /** Next command sequence per player. */
  seq: [number, number];
  /** The Helm's axes on the tick before (the avoidance prediction holds them). */
  axes: Axes;
  /** Tick of the last crew missile launch the pair sent. */
  lastLaunch: number;
  /** The tactical Room each character is assigned to repair, or −1. */
  task: [number, number];
}

export function createScriptedPair(seed: number): ScriptedPair {
  const rng = createRng((seed ^ PAIR_SALT) >>> 0);
  const orbitR = ORBIT_MIN + nextFloat(rng) * (ORBIT_MAX - ORBIT_MIN);
  return { rng, orbitR, seq: [0, 0], axes: { turn: 0, thrust: 0 }, lastLaunch: -MISSILE_GAP, task: [-1, -1] };
}

/** Turn toward (dx, dy): the sign of the heading error, ties clockwise. */
function turnToward(heading: number, dx: number, dy: number): number { return sideOf(heading, dx, dy) || 1; }

function len(x: number, y: number): number { return Math.sqrt(x * x + y * y); }

/** Rule 1 (spec §3): the heading away from the first hazard on the predicted path, as a direction, or null. */
function hazardAway(d: DuelState, axes: Axes): { x: number; y: number } | null {
  const t = d.tactical, s = t.ships[0], p = t.map.planet, keep = SHIP_RADIUS + AVOID_MARGIN;
  for (const q of predictPath(t, 0, axes, AVOID_TICKS, 4)) {
    if (len(q.x - p.x, q.y - p.y) < p.r + keep) return { x: s.x - p.x, y: s.y - p.y };
    if (len(q.x, q.y) > t.map.rMap - AVOID_MARGIN) return { x: -s.x, y: -s.y };
    let best = -1, bestClear = 0;
    for (const k of queryGrid(t.grid, q.x, q.y, keep)) {
      const a = t.map.asteroids[k]!, dist = len(q.x - a.x, q.y - a.y);
      if (dist < a.r + keep && (best < 0 || dist - a.r < bestClear)) { best = k; bestClear = dist - a.r; }   // ascending k: ties keep the lower index
    }
    if (best >= 0) { const a = t.map.asteroids[best]!; return { x: s.x - a.x, y: s.y - a.y }; }
  }
  return null;
}

/** The Helm's axes (spec §3): avoid, then line up, then orbit. */
function helmAxes(pair: ScriptedPair, d: DuelState): Axes {
  const t = d.tactical, s = t.ships[0], e = t.ships[1];
  const away = hazardAway(d, pair.axes);
  if (away) return { turn: turnToward(s.heading, away.x, away.y), thrust: 1 };
  const ex = e.x - s.x, ey = e.y - s.y;
  if (laserFull(t, 0) && s.fireHeld && ex * ex + ey * ey <= LASER_RANGE * LASER_RANGE && !inArc(s.heading, ex, ey, LASER_ARC_COS))
    return { turn: turnToward(s.heading, ex, ey), thrust: 0 };
  // Orbit: t is the prograde tangent (the way the ship already circles, clockwise at rest); tilt it toward the planet
  // when outside the radius and away when inside, by at most 30°.
  const r = len(s.x, s.y), ux = r > 0 ? s.x / r : 0, uy = r > 0 ? s.y / r : -1;
  const cw = s.x * s.vy - s.y * s.vx >= 0, tx = cw ? -uy : uy, ty = cw ? ux : -ux;
  const tilt = Math.max(-TAN_30, Math.min(TAN_30, ORBIT_GAIN * (r - pair.orbitR)));
  let dx = tx - ux * tilt, dy = ty - uy * tilt;
  const dl = len(dx, dy); dx /= dl; dy /= dl;
  const nose = hx(s.heading) * dx + hy(s.heading) * dy;
  const turn = nose >= COS_STEP ? 0 : turnToward(s.heading, dx, dy);
  const speed = len(s.vx, s.vy), vc = circularSpeed(r);
  let thrust = 0;
  if (nose < COS_45) thrust = 0;
  else if (speed > vc + SPEED_SLACK) thrust = -1;
  else if (speed < vc - SPEED_SLACK || s.vx * dx + s.vy * dy < COS_10 * speed) thrust = 1;
  return { turn, thrust };
}

// --- Walking (spec §3): a BFS over the Cutter's walkable tiles, doors held open, four-way only. ---

/** Tiles inside `room` whose centre is within REACH of tile `target`'s square: where a character can act on it. */
export function goalTiles(d: DuelState, room: number, target: number): Set<number> {
  const st = d.interior, w = st.derived.width, tx = target % w, ty = (target - tx) / w, out = new Set<number>();
  for (let i = 0; i < st.derived.roomOfTile.length; i++) {
    if (st.derived.roomOfTile[i] !== room) continue;
    const x = (i % w) + 0.5, y = Math.floor(i / w) + 0.5;
    const ddx = Math.max(tx - x, 0, x - (tx + 1)), ddy = Math.max(ty - y, 0, y - (ty + 1));
    if (Math.sqrt(ddx * ddx + ddy * ddy) <= REACH && !solidAt(st, i % w, Math.floor(i / w))) out.add(i);
  }
  return out;
}

/** Shortest four-way path from tile `from` to the nearest goal tile: the tiles to step through, without `from` itself
 *  ([] when `from` is a goal), or null when none is reachable. Neighbours in a fixed order (up, left, right, down), so
 *  the path is deterministic. Walkable means not solid (doors are held open in the duel). */
export function bfsPath(d: DuelState, from: number, goals: ReadonlySet<number>): number[] | null {
  const st = d.interior, w = st.derived.width, h = st.derived.height, prev = new Int32Array(w * h).fill(-2);
  if (goals.has(from)) return [];
  prev[from] = -1;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!, cx = c % w, cy = (c - cx) / w;
    for (const [nx, ny] of [[cx, cy - 1], [cx - 1, cy], [cx + 1, cy], [cx, cy + 1]] as const) {
      if (solidAt(st, nx, ny)) continue;
      const n = ny * w + nx;
      if (prev[n] !== -2) continue;
      prev[n] = c;
      if (goals.has(n)) {
        const path: number[] = [];
        for (let k = n; k !== from; k = prev[k]!) path.push(k);
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

/** Held stick that moves pid toward the centre of the next path tile: first onto the current tile's centre line
 *  across the step, then along it, scaled so no tick overshoots a centre (a Recruit walks CREW_SPEED · DT a tick). */
function walkToward(d: DuelState, pid: number, next: number): HeldInput {
  const st = d.interior, eid = st.crew[pid]!, w = st.derived.width, x = Position.x[eid]!, y = Position.y[eid]!;
  const nx = (next % w) + 0.5, ny = Math.floor(next / w) + 0.5, cx = Math.floor(x) + 0.5, cy = Math.floor(y) + 0.5;
  const step = CREW_SPEED * DT, clamp = (v: number): number => Math.max(-1, Math.min(1, v / step));
  if (Math.floor(nx) !== Math.floor(x)) {   // a step along x: line up on the row's centre first
    if (Math.abs(cy - y) > 1e-9) return { moveX: 0, moveY: clamp(cy - y), interactHeld: false };
    return { moveX: clamp(nx - x), moveY: 0, interactHeld: false };
  }
  if (Math.abs(cx - x) > 1e-9) return { moveX: clamp(cx - x), moveY: 0, interactHeld: false };
  return { moveX: 0, moveY: clamp(ny - y), interactHeld: false };
}
/** Held stick that walks pid toward the nearest goal tile, settling on its centre; neutral when none is reachable. */
function walkTo(d: DuelState, pid: number, goals: ReadonlySet<number>): HeldInput {
  const st = d.interior, eid = st.crew[pid]!, w = st.derived.width;
  const from = Math.floor(Position.y[eid]!) * w + Math.floor(Position.x[eid]!);
  const path = bfsPath(d, from, goals);
  if (!path) return NO_HELD;
  return walkToward(d, pid, path.length > 0 ? path[0]! : from);
}

/** BFS tile distance from pid's tile to the room's goal tiles (0 in reach already), or Infinity. */
function walkDistance(d: DuelState, pid: number, goals: ReadonlySet<number>): number {
  const st = d.interior, eid = st.crew[pid]!, w = st.derived.width;
  const path = bfsPath(d, Math.floor(Position.y[eid]!) * w + Math.floor(Position.x[eid]!), goals);
  return path ? path.length : Infinity;
}

/** As the sim's sit check (and app/duel/controls consoleInReach): pid standing in the console's room, in reach of its
 *  tile, with no member of its group occupied and one online. */
function canSit(d: DuelState, pid: number, i: number): boolean {
  const st = d.interior, eid = st.crew[pid]!;
  if (Seated.station[eid]! >= 0 || Life.state[eid] !== LifeState.Conscious) return false;
  const g = st.derived.stationGroup[i], members = g !== undefined && g >= 0 ? st.derived.groupStations[g]! : [i];
  if (members.some((j) => st.stations.occupant[j]! >= 0) || !members.some((j) => stationOnline(st, j))) return false;
  return st.derived.stationRoom[i] === roomAt(st, Position.x[eid]!, Position.y[eid]!) && inReachOfTile(st, eid, st.derived.stationTile[i]!);
}

/** As the sim's repair rule: pid standing in the room's repair room and in reach of its point. */
function inRepairReach(d: DuelState, pid: number, room: number): boolean {
  const st = d.interior, eid = st.crew[pid]!, p = d.points.find((q) => q.tacticalRoom === room)!;
  return Seated.station[eid]! < 0 && roomAt(st, Position.x[eid]!, Position.y[eid]!) === p.room && inReachOfTile(st, eid, p.tile);
}

/** Repair assignment (spec §3 nearest free character): damaged rooms without a repairer, higher level first, then Room
 *  order, each to the free character with the shortest walk, ties to player 1. A finished room frees its repairer. */
function assignRepairs(pair: ScriptedPair, d: DuelState): void {
  const rooms = d.tactical.ships[0].rooms;
  for (let pid = 0; pid < 2; pid++) if (pair.task[pid]! >= 0 && rooms[pair.task[pid]!] === 0) pair.task[pid as 0 | 1] = -1;
  const open = [Room.Weapons, Room.Shields, Room.Engines].filter((r) => rooms[r] >= 1 && !pair.task.includes(r)).sort((a, b) => rooms[b] - rooms[a]);
  for (const r of open) {
    const p = d.points.find((q) => q.tacticalRoom === r)!, goals = goalTiles(d, p.room, p.tile);
    let best = -1, bestDist = Infinity;
    for (const pid of [1, 0]) {
      if (pair.task[pid]! >= 0) continue;
      const dist = walkDistance(d, pid, goals);
      if (dist < bestDist) { best = pid; bestDist = dist; }
    }
    if (best >= 0) pair.task[best as 0 | 1] = r;
  }
}

/** The gunner's commands while seated at Weapons (spec §3), and the missile's steer. */
function gunner(pair: ScriptedPair, d: DuelState, out: DuelCommand[]): number {
  const t = d.tactical, s = t.ships[0], e = t.ships[1], ex = e.x - s.x, ey = e.y - s.y;
  const want = e.shields > 0 ? Room.Shields : Room.Weapons;
  if (s.lock !== want) out.push({ kind: 'laserLock', room: want });
  const m = t.missiles[0];
  if (m) return pursuitTurn(m.heading, e.x - m.x, e.y - m.y);
  if (canLaunch(t, 0) && ex * ex + ey * ey > LASER_RANGE * LASER_RANGE && t.tick - pair.lastLaunch >= MISSILE_GAP) {
    out.push({ kind: 'missileLaunch' }); pair.lastLaunch = t.tick;
    return 0;
  }
  if (!canCharge(t, 0)) return 0;
  if (!s.fireHeld) out.push({ kind: 'laserCharge', held: true });
  else if (laserFull(t, 0) && (laserEligible(t, 0, 1) || s.laserHold >= LASER_HOLD_TICKS - 1)) out.push({ kind: 'laserCharge', held: false });   // release on a shot, or before the vent
  return 0;
}

/** This tick's input for the duel: both players' held input and commands, stamped with the duel's tick. */
export function scriptedInput(pair: ScriptedPair, d: DuelState): DuelInput {
  const st = d.interior, held: HeldInput[] = [NO_HELD, NO_HELD], cmds: DuelCommand[][] = [[], []];
  assignRepairs(pair, d);
  for (let pid = 0; pid < 2; pid++) {
    const eid = st.crew[pid]!, seat = Seated.station[eid]!, own = pid === 0 ? d.nav : d.weapons, task = pair.task[pid]!;
    if (task >= 0) {
      if (seat >= 0) { cmds[pid]!.push({ kind: 'stand' }); continue; }
      if (inRepairReach(d, pid, task)) { held[pid] = { moveX: 0, moveY: 0, interactHeld: true }; continue; }
      const p = d.points.find((q) => q.tacticalRoom === task)!;
      held[pid] = walkTo(d, pid, goalTiles(d, p.room, p.tile));
      continue;
    }
    if (seat < 0) {   // walk back to its own console and sit
      if (canSit(d, pid, own)) { cmds[pid]!.push({ kind: 'sit', station: own }); continue; }
      held[pid] = walkTo(d, pid, goalTiles(d, st.derived.stationRoom[own]!, st.derived.stationTile[own]!));
      continue;
    }
    if (seat === d.nav) {
      const axes = helmAxes(pair, d);
      pair.axes = axes;
      held[pid] = { moveX: axes.turn, moveY: -axes.thrust, interactHeld: false };
    } else if (seat === d.weapons) {
      held[pid] = { moveX: gunner(pair, d, cmds[pid]!), moveY: 0, interactHeld: false };
    }
  }
  if (Seated.station[st.crew[0]!]! !== d.nav) pair.axes = { turn: 0, thrust: 0 };
  const commands: DuelEnvelope[] = [];
  for (let pid = 0; pid < 2; pid++) for (const command of cmds[pid]!) commands.push({ id: { player: pid, sequence: pair.seq[pid as 0 | 1]++ }, requestedTick: st.tick, command });
  return { held, commands };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/duelScripted.test.ts tests/boundary.test.ts`
Expected: PASS, 105 tests in 2 files (5 new, and 100 in the boundary guard, which now also scans `scripted.ts`).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/duel/scripted.ts tests/duelScripted.test.ts
git commit -m "feat(duel): the scripted pair with BFS walking to repairs (Helm H-0c-ii-a)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 3: The gates, the tuning tool and the tuning

**Files:**
- Create: `tests/helpers/scriptedDuel.ts`, `tests/duelGates.test.ts`, `scripts/duel-telemetry.ts`
- Modify (whole file): `src/renderer/src/sim/tactical/tuning.ts` (`SHIP_HULL` only), `tests/duelReadout.test.ts` (the two hull rows only)

**Interfaces:**
- Consumes: Tasks 1 and 2 (`createTelemetry`, `recordTick`, `endedFromPlanet`, `createScriptedPair`, `scriptedInput`); `createDuel`, `disposeDuel`, `stepDuelTick`, `hashDuel`; `parseShip`, the Cutter layout; `Outcome`; `TICK_HZ`.
- Produces (`tests/helpers/scriptedDuel.ts`): `CUTTER`; `GATE_SEEDS` (1 to 10); `CAP_TICKS` (54,000); `PLANET_END_MIN_TICKS` (1,800); `DUEL_GOLDEN` (`'tests/golden/duel-1.json'`), `DUEL_GOLDEN_SEED` (1), `DUEL_GOLDEN_EVERY` (600); `interface DuelRun { seed; telemetry; finalHash; hashes }`; `runDuel(seed: number, crew: 'scripted' | 'passive', cap?: number, hashEvery?: number): DuelRun`; `OUTCOME_NAMES`; `median(values)`; `telemetryLine(r: DuelRun): string`; `gateSummary(runs: readonly DuelRun[]): string`.

- [ ] **Step 1: Write the helper, the gate test and the tool**

Create `tests/helpers/scriptedDuel.ts`:

```ts
// Headless duels for the H-0c-ii-a gates (spec §5) and the duel golden (§6): the scripted pair, or a passive crew with
// nobody at either console, against the hunter, with telemetry, up to a tick cap. Shared by tests/duelGates.test.ts,
// tests/duelGolden.test.ts, scripts/duel-telemetry.ts and scripts/bless-golden.ts.
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { hashDuel } from '../../src/renderer/src/sim/duel/hash';
import { createScriptedPair, scriptedInput } from '../../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel, type DuelState } from '../../src/renderer/src/sim/duel/state';
import { stepDuelTick, type DuelInput } from '../../src/renderer/src/sim/duel/step';
import { createTelemetry, endedFromPlanet, recordTick, type DuelTelemetry } from '../../src/renderer/src/sim/duel/telemetry';
import { Outcome } from '../../src/renderer/src/sim/tactical/state';
import { TICK_HZ } from '../../src/renderer/src/sim/tuning';

export const CUTTER = parseShip(cutter);
/** The gate's seeds and cap (parent §16, spec §5): 1 to 10, 15 minutes of ticks. */
export const GATE_SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const CAP_TICKS = 15 * 60 * TICK_HZ;
/** No duel may end from a planet contact in under 30 s (parent §16). */
export const PLANET_END_MIN_TICKS = 30 * TICK_HZ;
/** The duel golden (spec §6): the scripted pair at seed 1, a hash every 600 ticks. */
export const DUEL_GOLDEN = 'tests/golden/duel-1.json';
export const DUEL_GOLDEN_SEED = 1;
export const DUEL_GOLDEN_EVERY = 600;

export interface DuelRun { seed: number; telemetry: DuelTelemetry; finalHash: string; hashes: string[] }

/** Both players go away on tick 0, so neither console is attended for the whole duel. */
function passiveInput(d: DuelState): DuelInput {
  if (d.interior.tick !== 0) return { held: [], commands: [] };
  return { held: [], commands: [0, 1].map((player) => ({ id: { player, sequence: 0 }, requestedTick: 0, command: { kind: 'presence' as const, present: false } })) };
}

/** Run one duel to its end or the cap. `hashEvery` > 0 records hashDuel after every that many ticks. */
export function runDuel(seed: number, crew: 'scripted' | 'passive', cap = CAP_TICKS, hashEvery = 0): DuelRun {
  const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed), t = createTelemetry(d), hashes: string[] = [];
  try {
    while (d.tactical.outcome === Outcome.Running && d.interior.tick < cap) {
      const input = crew === 'scripted' ? scriptedInput(pair, d) : passiveInput(d);
      stepDuelTick(d, input);
      recordTick(t, d, input);
      if (hashEvery > 0 && d.interior.tick % hashEvery === 0) hashes.push(hashDuel(d));
    }
    return { seed, telemetry: t, finalHash: hashDuel(d), hashes };
  } finally { disposeDuel(d); }
}

export const OUTCOME_NAMES = ['running', 'crew win', 'crew loss', 'draw'] as const;

export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** One line per duel: the gate's columns first, then the rest of the telemetry. */
export function telemetryLine(r: DuelRun): string {
  const t = r.telemetry, [c, e] = t.ships, f = (n: number): string => (n / TICK_HZ).toFixed(1);
  const losses = (s: typeof c): string => Object.entries(s.missileLosses).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
  return [
    `seed ${r.seed}: ${f(t.ticks)} s, ${OUTCOME_NAMES[t.outcome]}, terminal crew [${t.terminal[0].join(' ')}] enemy [${t.terminal[1].join(' ')}]${endedFromPlanet(t) ? ', PLANET END' : ''}`,
    `  crew  laser ${c.laserReleases} released, ${c.laserHits} hit (${c.layersStripped} stripped), ${c.laserMisses} missed; missiles ${c.missilesLaunched} launched, hits W/S/E ${c.missileHitsByRoom.join('/')}, lost ${losses(c)}; contacts planet ${c.planetContacts}, asteroid ${c.asteroidContacts}`,
    `  enemy laser ${e.laserReleases} released, ${e.laserHits} hit (${e.layersStripped} stripped), ${e.laserMisses} missed; missiles ${e.missilesLaunched} launched, hits W/S/E ${e.missileHitsByRoom.join('/')}, lost ${losses(e)}; contacts planet ${e.planetContacts}, asteroid ${e.asteroidContacts}; baits ${t.baits}`,
    `  repairs started/finished P0 ${t.players[0].repairsStarted}/${t.players[0].repairsFinished}, P1 ${t.players[1].repairsStarted}/${t.players[1].repairsFinished}; away walking/repairing P0 ${f(t.players[0].walkingTicks)}/${f(t.players[0].repairingTicks)} s, P1 ${f(t.players[1].walkingTicks)}/${f(t.players[1].repairingTicks)} s`,
    `  helm empty ${f(t.helmEmptyTicks)} s, weapons empty ${f(t.weaponsEmptyTicks)} s, enemy in arc ${f(t.enemyInArcTicks)} s, weapons idle ${f(t.weaponsIdleTicks)} s, console swaps ${t.consoleSwaps}`
  ].join('\n');
}

/** The gate summary over a set of scripted duels (spec §5). */
export function gateSummary(runs: readonly DuelRun[]): string {
  const ts = runs.map((r) => r.telemetry), wins = ts.filter((t) => t.outcome === Outcome.CrewWins).length, losses = ts.filter((t) => t.outcome === Outcome.EnemyWins).length;
  return [
    `median length ${(median(ts.map((t) => t.ticks)) / TICK_HZ).toFixed(1)} s (gate 180 to 300)`,
    `crew wins ${wins}, crew losses ${losses}, draws ${ts.filter((t) => t.outcome === Outcome.Draw).length}, at the cap ${ts.filter((t) => t.outcome === Outcome.Running).length} (gate: a win and a loss, none at the cap)`,
    `every duel with a crew laser release and missile launch: ${ts.every((t) => t.ships[0].laserReleases > 0 && t.ships[0].missilesLaunched > 0)}`,
    `planet-contact ends under 30 s: ${ts.filter((t) => endedFromPlanet(t) && t.ticks < PLANET_END_MIN_TICKS).length} (gate 0)`
  ].join('\n');
}
```

Create `tests/duelGates.test.ts`:

```ts
// The H-0 telemetry gates (parent spec §16, H-0c-ii-a spec §5): the scripted pair against the hunter over seeds 1 to
// 10, capped at 15 minutes. Always runs; one test per seed, then the gates over all ten. Tuning tool:
// `npx tsx scripts/duel-telemetry.ts`.
import { describe, expect, it } from 'vitest';
import { endedFromPlanet } from '../src/renderer/src/sim/duel/telemetry';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { TICK_HZ } from '../src/renderer/src/sim/tuning';
import { CAP_TICKS, gateSummary, GATE_SEEDS, median, PLANET_END_MIN_TICKS, runDuel, telemetryLine, type DuelRun } from './helpers/scriptedDuel';

const runs = new Map<number, DuelRun>();

describe('the H-0 telemetry gates: scripted pair against the hunter, seeds 1 to 10', () => {
  for (const seed of GATE_SEEDS) it(`seed ${seed}: ends before the cap, the crew uses both weapons, no planet-contact end under 30 s`, () => {
    const r = runDuel(seed, 'scripted'), t = r.telemetry;
    runs.set(seed, r);
    expect(t.outcome, telemetryLine(r)).not.toBe(Outcome.Running);
    expect(t.ticks).toBeLessThan(CAP_TICKS);
    expect(t.ships[0].laserReleases, telemetryLine(r)).toBeGreaterThanOrEqual(1);
    expect(t.ships[0].missilesLaunched, telemetryLine(r)).toBeGreaterThanOrEqual(1);
    expect(endedFromPlanet(t) && t.ticks < PLANET_END_MIN_TICKS, telemetryLine(r)).toBe(false);
  }, 60_000);
  it('the median duel lasts 3 to 5 minutes, and the crew both wins and loses', () => {
    const all = GATE_SEEDS.map((seed) => runs.get(seed) ?? runDuel(seed, 'scripted')), summary = gateSummary(all);
    console.log(`${all.map(telemetryLine).join('\n')}\n${summary}`);
    const length = median(all.map((r) => r.telemetry.ticks)) / TICK_HZ;
    expect(length, summary).toBeGreaterThanOrEqual(180);
    expect(length, summary).toBeLessThanOrEqual(300);
    expect(all.some((r) => r.telemetry.outcome === Outcome.CrewWins), summary).toBe(true);
    expect(all.some((r) => r.telemetry.outcome === Outcome.EnemyWins), summary).toBe(true);
  }, 120_000);
  it('reports how long a passive crew survives (recorded, not gated; above 60 s is the hope)', () => {
    const lines = GATE_SEEDS.map((seed) => {
      const t = runDuel(seed, 'passive').telemetry;
      return `seed ${seed}: passive crew ${(t.ticks / TICK_HZ).toFixed(1)} s, ${t.outcome === Outcome.EnemyWins ? 'lost' : t.outcome === Outcome.Running ? 'alive at the cap' : 'other'}`;
    });
    console.log(lines.join('\n'));
    expect(lines).toHaveLength(GATE_SEEDS.length);
  }, 120_000);
});
```

Create `scripts/duel-telemetry.ts`:

```ts
// The duel tuning tool (H-0c-ii-a spec §4, §5): runs the scripted pair against the hunter over the chosen seeds (default
// 1 to 10, the gate's), prints each duel's telemetry and the gate summary, then how long a passive crew survives.
// Usage: npx tsx scripts/duel-telemetry.ts [seed ...]
import { TICK_HZ } from '../src/renderer/src/sim/tuning';
import { gateSummary, GATE_SEEDS, median, OUTCOME_NAMES, runDuel, telemetryLine } from '../tests/helpers/scriptedDuel';

const args = process.argv.slice(2).map(Number);
if (args.some((n) => !Number.isInteger(n))) throw Error('usage: npx tsx scripts/duel-telemetry.ts [seed ...]');
const seeds = args.length > 0 ? args : GATE_SEEDS;
const runs = seeds.map((seed) => runDuel(seed, 'scripted'));
for (const r of runs) console.log(telemetryLine(r));
console.log(`\n${gateSummary(runs)}`);
const passive = seeds.map((seed) => runDuel(seed, 'passive').telemetry);
console.log(`\npassive crew (nobody at either console), not gated: ${passive.map((t, i) => `seed ${seeds[i]} ${(t.ticks / TICK_HZ).toFixed(1)} s ${OUTCOME_NAMES[t.outcome]}`).join('; ')}`);
console.log(`passive median ${(median(passive.map((t) => t.ticks)) / TICK_HZ).toFixed(1)} s, shortest ${(Math.min(...passive.map((t) => t.ticks)) / TICK_HZ).toFixed(1)} s`);
```

- [ ] **Step 2: Run the gate to verify it fails on today's numbers**

Run: `npx vitest run tests/duelGates.test.ts`
Expected: FAIL, 1 failed and 11 passed. Every seed test passes on today's numbers (both weapons used, no planet end, none at the cap), and the gate test fails with "AssertionError: median length 174.1 s (gate 180 to 300)" followed by the rest of the summary and "expected 174.08333333333334 to be greater than or equal to 180": 7 wins and 3 losses already, but the duels are too short (decision 1, iteration 0).

- [ ] **Step 3: Tune: hull 30 → 40 (decision 1), and the readout test's hull rows**

Replace the whole of `src/renderer/src/sim/tactical/tuning.ts` with:

```ts
// Helm demo duel tuning (spec docs/superpowers/specs/2026-11-14-helm-demo-design.md, sections 3 to 6).
// Every number here is a *(start)* value for tuning, not a decision.
import { DT } from '../tuning';

export { DT };

/** Headings: a fixed table of unit vectors, index 0 = north, clockwise (spec §4). */
export const HEADING_COUNT = 256;

// Map (§3)
export const R_MAP = 2800;
export const K_EDGE = 2;                       // /s², inward acceleration per unit past the edge
export const PLANET_RADIUS = 70;
export const GM = 2.5e6;
export const GRAVITY_EPS = 20;
export const BELT_INNER = 1100;
export const BELT_OUTER = 1300;
export const BELT_COUNT = 70;
export const BELT_R_MIN = 15;
export const BELT_R_MAX = 45;
export const GAP_COUNT = 3;
export const GAP_WIDTH = 160;
export const GAP_MIN_SEPARATION = 40;          // heading steps between any two gap bearings
export const CLUSTER_COUNT = 3;
export const CLUSTER_RADIUS = 150;             // asteroid centres lie within this of the cluster centre
export const CLUSTER_MIN = 4;
export const CLUSTER_MAX = 7;
export const CLUSTER_R_MIN = 20;
export const CLUSTER_R_MAX = 55;
export const CLUSTER_CENTRE_MIN = 1550;        // clear of the belt: 1300 + 150 + 55 + margin
export const CLUSTER_CENTRE_MAX = 2550;        // clear of the edge: 2800 - 150 - 55 - margin
export const EDGE_MARGIN = 100;                // no asteroid surface within this of the edge
export const ASTEROID_GAP = 10;                // minimum clear space between asteroid surfaces
export const SPAWN_RADIUS = 2000;
export const SPAWN_CLEARANCE = 300;            // no asteroid surface within this of a spawn point

// Ships (§5)
export const SHIP_RADIUS = 20;
export const SHIP_HULL = 40;                  // H-0c-ii-a: 30 → 40 so the scripted duels last 3 to 5 minutes
/** Engines damage level 0 / 1 / 2 scales thrust and turn rate (§5). */
export const ENGINE_FACTOR: readonly number[] = [1, 0.6, 0.25];

// Contacts (§3, §4)
export const RESTITUTION = 0.5;                // share of the normal speed kept after a bounce
export const CONTACT_GRACE_TICKS = 60;         // 1 s before the same pair can cost hull again
export const PLANET_CONTACT_HULL = 4;
export const ASTEROID_CONTACT_HULL = 1;
export const SHIP_CONTACT_HULL = 1;

// Flight (§6)
export const TURN_DEG_PER_S = 150;
export const TURN_STEPS_PER_TICK = (TURN_DEG_PER_S / 360) * HEADING_COUNT * DT;   // about 1.78
export const THRUST = 120;                     // u/s²
export const REVERSE_FRACTION = 0.4;
export const DRAG = 0.15;                      // velocity × (1 − DRAG · dt) per tick
export const STABILISE = 80;                   // u/s² of sideways velocity removed while both axes are zero

// Broad phase (§4)
export const BROAD_CELL = 200;

/** Switches for the §4 test configurations; the game always uses DEFAULT_FLIGHT. */
export interface FlightTuning { gravity: boolean; edge: boolean; drag: number; stabilise: number }
export const DEFAULT_FLIGHT: FlightTuning = { gravity: true, edge: true, drag: DRAG, stabilise: STABILISE };

// Weapons and shields (§5, §7a)
export const LASER_RANGE = 450;
export const LASER_ARC_COS = 0.5;             // ±60° arc: inside when dot(h, d) ≥ cos 60° · |d|
/** Laser charge in whole units, so tick counts are exact: full at LASER_CHARGE_UNITS. Weapons damage level 0 / 1 / 2
 *  charges at these units per tick, which is 4 s × 1 / 1.6 / 2.5 (§5): full in 240 / 384 / 600 ticks. */
export const LASER_CHARGE_UNITS = 9600;
export const LASER_CHARGE_RATE: readonly number[] = [40, 25, 16];
export const LASER_HOLD_TICKS = 180;          // a full charge can be held 3 s, then it vents
export const LASER_HULL = 2;
export const SHIELD_LAYERS = 2;
/** Shield recharge clock in whole units: a layer at SHIELD_RECHARGE_UNITS. Shields damage level 0 / 1 / 2 adds these units
 *  per tick, which is 5 s × 1 / 1.5 / stopped (§5): a layer in 300 / 450 ticks, or never. */
export const SHIELD_RECHARGE_UNITS = 900;
export const SHIELD_RATE: readonly number[] = [3, 2, 0];

// Missiles (§7b, §4 collision matrix)
export const MAGAZINE = 4;
export const MAGAZINE_REGEN_TICKS = 2700;     // 45 s per missile regained
export const MISSILE_RADIUS = 4;
export const MISSILE_SPAWN_OFFSET = 25;       // ship radius 20 + missile radius 4 + 1 clear
export const MISSILE_LAUNCH_SPEED = 60;
export const MISSILE_THRUST = 160;
export const MISSILE_TURN_STEPS_PER_TICK = (120 / 360) * HEADING_COUNT * DT;   // 120°/s, about 1.42
export const MISSILE_FUEL_TICKS = 360;        // 6 s of thrust
export const MISSILE_LIFE_TICKS = 480;        // then 2 s of coasting, then it self-destructs
export const MISSILE_ARM_TICKS = 60;          // its own ship is ignored for the first 1 s
export const MISSILE_HULL = 3;

// The hunter (§9)
export const HUNTER_LEAD_S = 0.5;
export const HUNTER_THRUST_COS = 0.8660254037844386;   // thrust when the heading error is under 30°
export const HUNTER_LOOKAHEAD_S = 0.75;
export const HUNTER_AVOID_MARGIN = 30;
export const HUNTER_JITTER_TICKS = 12;        // release jitter drawn uniformly from 0..12 ticks
export const HUNTER_MISSILE_RANGE = 400;
export const HUNTER_MISSILE_COOLDOWN_TICKS = 1800;
export const HUNTER_TRAIL_TICKS = 18;         // missile pursuit aims where the crew was 0.3 s ago
export const HUNTER_WALK_TICKS = 360;         // 6 s stand-in for crossing its ship
export const REPAIR_WORK_TICKS = 240;         // 4 s per damage level
export const HUNTER_STANDOFF = 320;           // within this it stops pursuing and holds its nose on the crew
export const HUNTER_BRAKE_SPEED = 40;         // and brakes (reverse thrust) when closing faster than this
```

Replace the whole of `tests/duelReadout.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { REPAIR_UNITS } from '../src/renderer/src/sim/duel/tuning';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { createEndScreen, endModel } from '../src/renderer/src/render/duel/endScreen';
import { createReadoutPanel } from '../src/renderer/src/render/duel/readoutPanel';
import { readoutHelp, readoutRows, READOUT_ROWS, READOUT_W, type ReadoutInput, type ReadoutMode } from '../src/renderer/src/render/duel/readoutModel';
import { PAD, textPx } from '../src/renderer/src/render/theme';

const layout = parseShip(cutter);
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
const pairs = (input: ReadoutInput) => readoutRows(input).map((r) => [r.label, r.value]);

describe('the duel readout (H-1 spec §7 item 9, §8)', () => {
  it('both hulls, both shields, the crew rooms and the enemy rooms; the other character status', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[1].hull = 21; d.tactical.ships[1].rooms = [0, 2, 1]; d.tactical.ships[0].rooms[Room.Engines] = 1; d.tactical.ships[0].shields = 1;
    const rows = readoutRows({ duel: d, mode: 'helm', active: 0, other: 'AT WEAPONS' });
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['HELM', ''], ['CUTTER', ''], ['HULL', '40/40'], ['SHIELD', ''], ['WEAPONS', 'OK'], ['SHIELDS', 'OK'], ['ENGINES', 'DMG 1'],
      ['HUNTER', ''], ['HULL', '21/40'], ['SHIELD', ''], ['ROOMS', 'W0 S2 E1'], ['OTHER', 'PRESENT'], ['', 'AT WEAPONS']
    ]);
    expect(rows[3]!.pips).toMatchObject({ n: 1, max: 2 }); expect(rows[9]!.pips).toMatchObject({ n: 2, max: 2 });
    disposeDuel(d);
  });
  it('repair progress is a bar on the damaged room row', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[0].rooms[Room.Shields] = 2; d.repair[Room.Shields] = REPAIR_UNITS / 4;
    const row = readoutRows({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' }).find((r) => r.label === 'SHIELDS')!;
    expect([row.value, row.bar?.fill]).toEqual(['DMG 2', 0.25]);
    disposeDuel(d);
  });
  it('Weapons adds the lock, the charge bar and hold timer, and the magazine', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0];
    s.laserCharge = LASER_CHARGE_UNITS / 2;
    let w = pairs({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' });
    expect(w.slice(11, 15)).toEqual([['LASER', ''], ['LOCK', 'SHIELDS'], ['CHARGE', '50%'], ['MAG', '4/4']]);
    s.laserCharge = LASER_CHARGE_UNITS; s.laserHold = 60;
    w = pairs({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' });
    expect(w[13]).toEqual(['CHARGE', 'HOLD 2.0']);
    disposeDuel(d);
  });
  it('standing, the strip tells about the ship outside: empty consoles, the enemy, an inbound missile', () => {
    const d = createDuel(layout, 5);
    stepDuelTick(d, { held: [], commands: [{ id: { player: 1, sequence: 0 }, requestedTick: 0, command: { kind: 'presence', present: false } }, { id: { player: 0, sequence: 0 }, requestedTick: 0, command: { kind: 'stand' } }] });
    const [crew, enemy] = d.tactical.ships;
    let out = pairs({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' });
    expect(out.slice(11)).toEqual([
      ['OTHER', 'AWAY'], ['', 'AT WEAPONS'], ['OUTSIDE', ''], ['HELM', 'EMPTY'], ['', 'COASTING'], ['WEAPONS', 'EMPTY'],
      ['ENEMY', String(Math.round(Math.hypot(enemy.x - crew.x, enemy.y - crew.y)))], ['BEARING', expect.stringMatching(/^\d{3}$/)]
    ]);
    d.tactical.missiles[1] = { x: crew.x + 500, y: crew.y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 };
    out = pairs({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' });
    expect(out.at(-1)).toEqual(['MISSILE INBOUND', '']);
    disposeDuel(d);
  });
  it('every row and help line fits the 220-px column', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[0].rooms = [2, 2, 2]; d.tactical.ships[0].laserCharge = LASER_CHARGE_UNITS; d.tactical.missiles[0] = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 };
    d.tactical.missiles[1] = { ...d.tactical.ships[0], heading: 0, headingAcc: 0, age: 0 };
    for (const mode of ['helm', 'weapons', 'interior'] as ReadoutMode[]) for (const other of ['AT HELM', 'AT WEAPONS', 'WALKING', 'REPAIRING'] as const) {
      const rows = readoutRows({ duel: d, mode, active: 0, other });
      expect(rows.length).toBeLessThanOrEqual(READOUT_ROWS);
      for (const r of rows) expect(textPx(r.label) + 6 + (r.pips ? 32 : textPx(r.value)), `${mode} ${r.label} ${r.value}`).toBeLessThanOrEqual(READOUT_W - 2 * PAD);
      for (const line of readoutHelp(mode)) expect(textPx(line, 1), line).toBeLessThanOrEqual(READOUT_W - 2 * PAD);
    }
    disposeDuel(d);
  });
  it('the panel: a warm-up of 2 frames, then 60 frames across all three screens add no display objects', () => {
    const d = createDuel(layout, 5), panel = createReadoutPanel({ fontFamily: 'm5x7' });
    const modes: ReadoutMode[] = ['helm', 'weapons', 'interior'];
    const frame = (k: number): void => {
      const mode = modes[Math.floor(k / 7) % 3]!;
      d.tactical.ships[0].rooms[Room.Engines] = k % 3; d.repair[Room.Engines] = (k * 40) % REPAIR_UNITS;
      panel.draw(readoutRows({ duel: d, mode, active: 0, other: 'WALKING' }), readoutHelp(mode));
    };
    frame(0); frame(1);
    const n0 = count(panel.container);
    for (let k = 2; k < 62; k++) frame(k);
    expect(count(panel.container)).toBe(n0);
    disposeDuel(d);
  });
});

describe('the end screen (H-1 spec §4 End)', () => {
  it('names the outcome, the duel length and the next seed', () => {
    expect(endModel(Outcome.Running, 100, 5)).toBeNull();
    expect(endModel(Outcome.CrewWins, 83 * 60 + 30, 2026)).toMatchObject({ title: 'VICTORY', length: 'DUEL LENGTH 1:23', prompt: 'ENTER: NEW DUEL (SEED 2027)' });
    expect(endModel(Outcome.EnemyWins, 60, 7)!.title).toBe('DEFEAT');
    expect(endModel(Outcome.Draw, 60, 7)!.title).toBe('BOTH SHIPS LOST');
  });
  it('shows only while the duel is decided, and allocates nothing after creation', () => {
    const end = createEndScreen({ fontFamily: 'm5x7' }), n0 = count(end.container);
    end.draw(null); expect(end.container.visible).toBe(false);
    end.draw(endModel(Outcome.CrewWins, 600, 5)); expect(end.container.visible).toBe(true);
    end.draw(endModel(Outcome.EnemyWins, 1200, 6));
    expect(count(end.container)).toBe(n0);
  });
});
```

- [ ] **Step 4: Run the gate and the duel tests to verify they pass**

Run: `npx vitest run tests/duelGates.test.ts tests/duelReadout.test.ts tests/duelScripted.test.ts tests/duelTelemetry.test.ts tests/duel.test.ts`
Expected: PASS, 56 tests in 5 files (12 gate, 8 readout, 5 scripted, 9 telemetry, 22 duel), the gate file in about 7 s. The gate test prints decision 2's table (each seed's telemetry and `median length 251.2 s (gate 180 to 300)`, `crew wins 7, crew losses 3, draws 0, at the cap 0`) and the passive crew's survival (88.5 to 120.8 s).

Run: `npx tsx scripts/duel-telemetry.ts`
Expected: the same ten telemetry blocks, the gate summary, and `passive median 106.9 s, shortest 88.5 s`.

Run: `npx vitest run tests/tactical`
Expected: PASS (no tactical test pins the hull).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/scriptedDuel.ts tests/duelGates.test.ts scripts/duel-telemetry.ts src/renderer/src/sim/tactical/tuning.ts tests/duelReadout.test.ts
git commit -m "feat(duel): the H-0 telemetry gates, the duel-telemetry tool and hull 40 (Helm H-0c-ii-a)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 4: SIM_VERSION 36, the re-bless and the duel golden

**Files:**
- Create: `tests/duelGolden.test.ts`, `scripts/determinism/rebless-version.ts`
- Modify (whole file): `src/renderer/src/sim/tuning.ts` (`SIM_VERSION` only), `src/renderer/src/sim/duel/hash.ts`, `scripts/bless-golden.ts`
- Generated: `tests/golden/basic.json`, `tests/golden/duel-1.json` (new), `tests/fixtures/determinism-v2.json`

**Interfaces:**
- Consumes: Task 3's `runDuel`, `CUTTER`, `DUEL_GOLDEN`, `DUEL_GOLDEN_SEED`, `DUEL_GOLDEN_EVERY`; `executeFixture`, `packFixture`, `unpackFixture`, `Fixture` (`scripts/determinism/fixture.ts`); `firstDifference` (`scripts/determinism/protocol.ts`); `computeContentDigest`.
- Produces: `SIM_VERSION = 36`; `flattenDuel(d)[0] === SIM_VERSION`; the duel golden file.

- [ ] **Step 1: Write the failing golden test**

Create `tests/duelGolden.test.ts`:

```ts
// The duel golden and the same-seed hash (H-0c-ii-a spec §6). `npm run bless` rewrites the golden deliberately.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { flattenDuel, hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { CUTTER, DUEL_GOLDEN, DUEL_GOLDEN_EVERY, DUEL_GOLDEN_SEED, runDuel } from './helpers/scriptedDuel';

interface DuelGolden { simVersion: number; seed: number; outcome: number; ticks: number; finalHash: string; every: number; hashes: string[] }

describe('the duel golden (spec §6)', () => {
  it('replays the scripted pair at its seed to the recorded hashes (run `npm run bless` to update deliberately)', () => {
    expect(existsSync(DUEL_GOLDEN)).toBe(true);
    const golden = JSON.parse(readFileSync(DUEL_GOLDEN, 'utf8')) as DuelGolden;
    expect([golden.simVersion, golden.seed, golden.every]).toEqual([SIM_VERSION, DUEL_GOLDEN_SEED, DUEL_GOLDEN_EVERY]);
    const r = runDuel(golden.seed, 'scripted', undefined, golden.every);
    const first = r.hashes.findIndex((h, i) => h !== golden.hashes[i]);
    expect(first, `first divergence at tick ${(first + 1) * golden.every}`).toBe(-1);
    expect([r.telemetry.outcome, r.telemetry.ticks, r.hashes.length]).toEqual([golden.outcome, golden.ticks, golden.hashes.length]);
    expect(r.finalHash).toBe(golden.finalHash);
  }, 60_000);
  it('two independent duels from the same seed have the same hash on every tick; another seed differs', () => {
    const a = createDuel(CUTTER, 7), b = createDuel(CUTTER, 7), pa = createScriptedPair(7), pb = createScriptedPair(7);
    try {
      expect(hashDuel(a)).toBe(hashDuel(b));
      while (a.tactical.outcome === Outcome.Running) {
        stepDuelTick(a, scriptedInput(pa, a)); stepDuelTick(b, scriptedInput(pb, b));
        expect(hashDuel(b), `tick ${a.interior.tick}`).toBe(hashDuel(a));
      }
      expect(b.tactical.outcome).toBe(a.tactical.outcome);
      expect(runDuel(8, 'scripted').finalHash).not.toBe(hashDuel(a));
    } finally { disposeDuel(a); disposeDuel(b); }
  }, 60_000);
  it('flattenDuel starts with SIM_VERSION, so a version bump changes every duel hash', () => {
    const d = createDuel(CUTTER, 1);
    expect(flattenDuel(d)[0]).toBe(SIM_VERSION);
    disposeDuel(d);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/duelGolden.test.ts`
Expected: FAIL, 2 failed and 1 passed: the golden test with "AssertionError: expected false to be true // Object.is equality" (no `tests/golden/duel-1.json` yet) and the flatten test with "AssertionError: expected +0 to be 35 // Object.is equality" (the duel flatten still starts with the tactical tick). The same-seed test already passes.

- [ ] **Step 3: Bump the version, lead the duel flatten with it, and extend the bless**

Replace the whole of `src/renderer/src/sim/tuning.ts` with:

```ts
// Every gameplay constant. All are hypotheses until playtested (spec §13).
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const HAZARD_EVERY = 5;                 // hazards run every 5th tick (12 Hz)
export const HAZARD_DT = DT * HAZARD_EVERY;
export const O2_K = 6;                         // oxygen diffusion rate (per second, per unit conductance)
export const SIM_VERSION = 36;
export const TELEMETRY_KEEP = 50;   // game-over records kept in localStorage (spec 4-ii section 7)
export const REPAIR_FIRE = 0, REPAIR_BREACH = 1, REPAIR_POWER = 2;   // indices into telemetry.repairs (spec 4-ii section 5)
export const ACCEPTANCE_MINUTES = 20;   // default soak length for npm run acceptance
export const HULL_MAX = 100;
export const HEALTH_MAX = 100;
export const CREW_SPEED = 4;      // tiles per second
export const CREW_HALF = 0.3;     // AABB half-extent in tiles (must stay < 0.5, see ship schema reachability)
export const MOVE_EPS = 1e-6;
export const DOOR_ZONE = 1.0;          // Chebyshev distance (tiles) from a door tile's centre that holds it open
export const DOOR_CLOSE_DELAY = 1.0;   // seconds after the zone is clear
export const PASSAGE_OPEN = 1;
export const PASSAGE_CLOSED = 0.05;
export const PASSAGE_SEALED = 0.01;       // lowered further by Doors skill in increment 3
export const PASSAGE_BREACH = 0.1;        // a breach is a hole, not an open door (12-tile room half-life ~14 s)
export const AIRLOCK_PASSAGE = 3 * PASSAGE_OPEN;  // an open airlock is a wide hatch to vacuum: at PASSAGE_OPEN the leak of three closed doors held a burning room at 10% and the fire never died; 3 is the largest value that leaves the cutter's kEff unchanged (spec Demo-vii amendment 12)
export const BREATH_RATE = 0.01;          // oxygen units per second per living crew member
export const FIRE_O2_RATE = 0.02;         // oxygen units per second per unit of fire intensity
export const O2_SNAP_EPS = 1e-9;
export const FIRE_GROW_FRAC = 0.2;     // fire grows while room oxygen fraction is above this
export const FIRE_SHRINK_FRAC = 0.1;   // fire shrinks while below this (B < A: no flicker)
export const FIRE_GROW_RATE = 0.5;     // intensity per second
export const FIRE_SHRINK_RATE = 1.0;   // intensity per second
export const FIRE_CAP = 16;
export const FIRE_START = 1;
export const FIRE_SPREAD_P = 0.0012;   // per hazard tick per burning edge at passage 1 (~7% per 5 s; spec Demo-vi section 3, was 0.0027)
export const FIRE_DAMAGE = 3;           // health per second while in a burning room (the Medbay heals, increment 2a-i)
export const O2_DAMAGE = 6;             // health per second below SUFFOCATE_FRAC
export const SUFFOCATE_FRAC = 0.1;
export const BLEEDOUT_TIME = 30;        // seconds Downed before Dead
export const BLEED_HAZARD_MULT = 2;     // bleed-out speed in fire or low oxygen
export const REVIVE_HEALTH_FRAC = 0.3;
export const REACH = 1.5;               // tiles from crew centre to the nearest point of the target tile
export const REPAIR_TIME_FIRE = 6;      // seconds for one repairer
export const REPAIR_TIME_BREACH = 8;
export const REVIVE_TIME = 4;
export const SPAWN_FIRST = 15;          // seconds until the first spawned hazard once awake (a hazard gate; the game's first jump re-arms the director, spec Loop-i section 4b)
export const SPAWN_INTERVAL = 30;       // seconds between spawned hazards
export const SPAWN_JITTER = 0.2;        // ±fraction of the interval
export const SPAWN_CAP = 3;             // max simultaneous fires + breaches + failed stations

// Power (increment 2a-i)
export const REACTOR_CAPACITY = 10;                 // bars, including Engineering's reserved one
export const STATION_MAX = [2, 3, 2, 1, 3, 2, 1] as const;   // by StationKind: Nav, Wpn, Sci, Eng, LS, Med, Doors (sum 14 > capacity: choices are forced)

export const OUTPUT_SLOW = 0.5, OUTPUT_FAST = 1.0;   // station output multiplier at skill 0..10 via lerp((skill + 10) / 20)
export const REPAIR_TIME_POWER = 6;                 // seconds for one repairer
export const STICK_EDGE_THRESHOLD = 0.5;
export const STICK_REPEAT_TICKS = 8;                // ~130 ms

// Life Support and Medbay (increment 2a-i)
export const INJECT_FRAC = 0.06;          // per second of room volume at full output (starter allocation, unmanned: 2/3 x 0.75 x 0.06 = 0.03, the old stub rate)
export const LS_SEATED_BONUS = 0.5;
export const MEDBAY_HEAL = 4;             // health per second at full output
export const MEDBAY_SEATED_BONUS = 0.5;
export const SPAWN_WEIGHTS = { fire: 1, breach: 1, power: 1, debris: 2 } as const;   // intervals in this order (total 5; fire 2 -> 1, spec Demo-vi section 3)
export const FIRE_SPAWN_CAP = 2;        // the director picks no fire while this many rooms burn; spread, overheats and impacts are not capped (spec Demo-vi section 3)

// Debris (increment 2a-ii)
export const DEBRIS_SLOTS = 8;                        // never reached: SPAWN_CAP counts in-flight debris
export const DEBRIS_FLIGHT = 30, DEBRIS_FLIGHT_JITTER = 6;             // seconds from spawn to impact, +/- jitter
export const SCIENCE_LEAD_UNMANNED = 4;               // seconds of warning with Science unoccupied or offline
export const SCIENCE_LEAD_BASE = 12, SCIENCE_LEAD_SCALE = 16;          // seated lead = base + scale x output (18 s at level 1, 24 s at level 2, skill 0)
export const BEAM_CHARGE_TIME = 4;                    // seconds at output 1 (8 s at level 2, skill 0, on the Skiff; spec Demo-xiii section 4: was 6, a 12 s Pulse)
export const EVADE_BASE = 0.20, EVADE_SCALE = 0.40;                    // evasion chance = base + scale x output
export const DEBRIS_HULL_DAMAGE = 8;                  // of HULL_MAX per impact
export const DEBRIS_CREW_DAMAGE = 20;                 // of HEALTH_MAX per Conscious crew member in the hit room

// Overdrive, heat and coolant (increment 2b-i)
export const STATION_OVERDRIVE = 1;                   // extra level above STATION_MAX for every kind except Engineering
export const HEAT_MAX = 240;                          // integer heat units
export const HEAT_RISE = 2;                           // per hazard tick while overdriven (10 s to max unassisted)
export const HEAT_COOL_UNIT = 1;                      // per coolant unit per hazard tick (1 unit: 20 s; 2 units: hold)
export const HEAT_COOL_IDLE = 4;                      // per hazard tick while not overdriven (5 s from max to 0)
export const COOLANT_POOL = 4;                        // shared units, never consumed
export const COOLANT_MAX_PER_STATION = 2;
export const OVERHEAT_FIRE_CHANCE = 0.5;              // rng.hazards, one draw per overheat
export const FIRE_HEAT_MAX = 6;                       // heat per hazard tick a full fire adds to each online station in its room (spec Demo-xi section 5)
export const FIRE_HEAT_FULL = 8;                      // fire intensity at which the fire heat is full; below it, proportional

// Scanning, frequencies and torpedoes (increment 2b-ii)
export const FREQ_COUNT = 3;
export const SCAN_TIME = 6;                           // seconds at output 1 (16 / 8 / 5.3 s at Science levels 1 / 2 / 3)
/** The Science officer's system scan (spec Demo-x-b section 3): seconds at output 1 (scaled by the output like SCAN_TIME); each finding's chance 0.45 + 0.15 per Science level, capped; the card lists the results for SCAN_RESULT_SECONDS, the notice for SCAN_NOTICE_SECONDS. */
export const SYSTEM_SCAN_TIME = 8, SCAN_DETECT_BASE = 0.45, SCAN_DETECT_SKILL = 0.15, SCAN_DETECT_MAX = 0.95, SCAN_RESULT_SECONDS = 10, SCAN_NOTICE_SECONDS = 5;
/** Hidden things drawn with the map (spec Demo-x-b section 3): an ambusher at an Empty (AMBUSH_CHANCE) or Event (AMBUSH_EVENT_CHANCE) beacon arrives AMBUSH_DELAY s after arrival, warned AMBUSH_WARN s ahead when undetected; a detected one arrives with its shields down FIRST_STRIKE_SECONDS. A cache at an Empty beacon (CACHE_CHANCE) holds CACHE_FUEL fuel (one loot draw below CACHE_FUEL_CHANCE) or scrapCache scrap. */
export const AMBUSH_CHANCE = 0.5, AMBUSH_EVENT_CHANCE = 0.2, AMBUSH_DELAY = 30, AMBUSH_WARN = 3, FIRST_STRIKE_SECONDS = 10, CACHE_CHANCE = 0.4, CACHE_FUEL = 2, CACHE_FUEL_CHANCE = 0.5;
/** A cache's scrap: 20 at depth 0 to 40 at the last depth (17), rounded. */
export const scrapCache = (depth: number): number => 20 + Math.round(20 * depth / (SECTORS * SECTOR_COLUMNS - 1));
export const BEAM_MATCH_BASE = 0.65, BEAM_MATCH_SCALE = 0.30;   // beam tuned to the object's frequency
export const BEAM_MISS_BASE = 0.15, BEAM_MISS_SCALE = 0.10;     // beam on any other frequency
export const TORP_HIT_BASE = 0.85, TORP_HIT_SCALE = 0.10;       // homing: frequency does not matter
export const TORP_START = 3, TORP_CAP = 6;
export const TORP_LOAD_TIME = 10;                     // seconds at output 1 to move one from stock into the tube
export const TORP_REGEN_TIME = 90;                    // seconds per stock unit while Weapons is online
/** Loot weapons (spec Loop-iii sections 1-3): two extra slots, the Weapons level each needs to charge, the ion disable, the kill drop chance (the table is in weaponDefs.ts). */
export const WEAPON_SLOTS = 2, ION_SECONDS = 10, WEAPON_DROP_CHANCE = 0.25;
export const SLOT_LEVELS: readonly number[] = [2, 4];

// Skills and XP (increment 3-i)
export const SKILL_COUNT = 6, SKILL_MAX = 10;
export const XP_THRESHOLDS = [0, 240, 600, 1080, 1680, 2400, 3240, 4200, 5280, 6480, 7800] as const;   // cumulative productive seconds per level
export const XP_RATE = 1;                              // per productive second
export const XP_PER_SHOT = 10;                         // Weapons, per shot taken
export const XP_PER_EVADE_ROLL = 5;                    // Navigation, per evasion roll
export const PRODUCTIVE_WINDOW_TICKS = 300;            // 5 s: a change keeps Engineering or Doors productive this long
export const REPAIR_SKILL_GAIN = 0.06;                 // repair speed 1 + gain x level
export const HEAT_COOL_SKILL = 0.2;                    // extra cooling per unit: floor(0.2 x level)
export const SEAL_SKILL = 0.05;                        // sealed passage x (1 - 0.05 x level)
export const BONUS_BAR_LEVELS = 4;                     // one bonus bar per 4 Engineering levels while seated

// Characters (increment 3-ii): Assets and Complications as multipliers on existing formulas
export const TRAIT_REPAIR_MULT = 1.25;        // Quick Hands
export const TRAIT_SLOW_SPEED = 0.85;         // Heavy Boots
export const TRAIT_FAST_SPEED = 1.2;          // Sprinter
export const TRAIT_COOLING_BONUS = 1;         // Cool Head, per coolant unit while seated at Engineering
export const TRAIT_FIRE_DAMAGE = 1.5;         // Flammable
export const TRAIT_O2_DAMAGE = 0.5;           // Iron Lungs
export const TRAIT_XP_MULT = 0.75;            // Slow Learner
export const TRAIT_BLEEDOUT = 0.6;            // Frail

// Director (increment 4-i)
export const STRESS_PERIOD = 5;                        // seconds between stress recomputes
export const STRESS_WEIGHTS = { fire: 0.25, breach: 0.30, power: 0.20, debris: 0.20, downed: 0.40, enemy: 0.30, boarder: 0.35 } as const;
export const STRESS_RISE = 0.5, STRESS_FALL = 0.15;    // smoothing per period; the fall is halved while a hazard is unattended
export const PEAK_LEVEL = 0.7, RELAX_LEVEL = 0.25;
export const SUSTAIN_SECONDS = 10, FADE_TIMEOUT = 30, RELAX_MIN = 30, RELAX_MAX = 60, STALL_SECONDS = 60;
export const SPAWN_INTERVAL_MIN = 10;                  // seconds; the escalated interval never goes below this
export const ESCALATION_RATE = 0.1;                    // per minute: interval = SPAWN_INTERVAL / (1 + rate x minutes)
export const CREW_INTERVAL_MULT = [1.5, 1.4, 1, 1] as const;   // spawn and fire interval multiplier by crew size, indexed players - 1 (spec Demo-i section 5)
export const SPAWN_CAP_MAX = 6, CAP_MINUTES = 4;        // +1 cap per 4 minutes up to the max
export const BUDGET_BASE = 3, BUDGET_GROWTH = 0.5;      // spawns per Build Up cycle: (base + growth x minutes) x playerScale
export const WEIGHT_MINUTES = 4;                       // power and debris weights grow every 4 minutes
export const ROUTE_BONUS = 2, ROUTE_IDLE_SECONDS = 60;  // routing toward consoles idle longer than this (3-4 players)
export const SINCE_CAP = 36000;                        // ticks: sinceProductive counters stop at 10 minutes

// Enemy ship (Combat-i)
export const ENCOUNTER_FIRST = 210, ENCOUNTER_MAX = 120;   // seconds: the hazard gates' first arrival (the game has no timed first enemy since Loop-i section 4b), stay (survival-gate fallback, spec Combat-i section 13; first pass 180); one enemy per node, no cooldown (spec Demo-vi section 2)
export const NEVER = 2147483647;                      // a tick that never comes: no further arrival at this node
export const ENCOUNTER_START = 8, ENCOUNTER_REWARD_HULL = 8, ENCOUNTER_BOOST = 4, ENCOUNTER_NOTICE_SECONDS = 8, ENCOUNTER_SPAWN_MULT = 2;   // spec Demo-vi: seconds from a Hazard-node arrival to contact, hull for a win, drive charge multiplier after a win, notice seconds, director interval multiplier while fighting
export const SHOT_BREACH_FIRST = 0.25;                 // a Shot impact tries a breach first below this roll, else a fire first (debris 0.5; spec Demo-vi section 3)
export const ENEMY_HULL = 100, ENEMY_FIRST_SHOT = 5;
export const ENEMY_FIRE_INTERVAL = 20, ENEMY_FIRE_MIN = 6, ENEMY_FIRE_JITTER = 0.2;   // escalation shares ESCALATION_RATE and CREW_INTERVAL_MULT (survival-gate fallback, spec Combat-ii section 13; first pass 15)
export const ENEMY_SHOTS_MAX = 1;                      // shots in flight at once (survival-gate fallback, spec Combat-i section 13; first pass 2)
export const ENEMY_SHOT_FLIGHT = 10, ENEMY_SHOT_JITTER = 2;   // seconds (debris is 30 +/- 6)
export const ENEMY_SHOT_HULL_DAMAGE = 10;              // spec Demo-xiii section 4, amendment 5: 4 -> 10, an ignored first enemy costs 20 hull a minute (the lever, not the interval); debris is 8; crew damage shared (survival-gate fallback, spec Combat-i section 13; first pass 6)
export const ENEMY_BEAM_BASE = 0.70, ENEMY_BEAM_SCALE = 0.30;   // engines-up chance 0.70 at output 0.5 after ENEMY_EVADE; was 0.55 before Combat-ii
export const ENEMY_BEAM_DAMAGE = 15, ENEMY_TORP_DAMAGE = 35;
/** FTL-style ship combat (spec Demo-i section 11.2): shield layers by column, recharge seconds per layer, hull per column, aim and console-failure chances, the flee at a hull fraction with its delay, the surrender bounty. */
export const ENEMY_SHIELD_LAYERS: readonly number[] = [1, 1, 1, 2, 2, 2, 2, 2], SHIELD_RECHARGE_TIME = 6, ENEMY_HULL_PER_COLUMN = 10, ENEMY_AIM_CHANCE = 0.6, ENEMY_SHOT_SYSTEM_CHANCE = 0.5;
export const ENEMY_SHOT_CREW_DAMAGE = 12;                // of HEALTH_MAX per Conscious crew member in the room a shot hits (survival-gate lever 2 after aimed shots, Demo-i gate (spec section 12); debris stays 20)
export const ENEMY_FLEE_FRAC = 0.25, ENEMY_FLEE_DELAY = 8;
/** The enemy interior (spec Demo-viii section 2b): rooms (0 Weapons, 1 Engines, 2 Shields, 3 Piloting, 4 Hold), the problem-draw thresholds after a hit, timer seconds, damage per second. */
export const ENEMY_ROOMS = 5, ENEMY_HIT_FIRE = 0.35, ENEMY_HIT_BREACH = 0.15, ENEMY_FIRE_SECONDS = 15, ENEMY_BREACH_SECONDS = 20, ENEMY_FIRE_HULL_DPS = 0.3, ENEMY_FIRE_SYS_DPS = 1.5, ENEMY_BREACH_HULL_DPS = 0.2;
export const ENEMY_SYS_HP = 30, ENEMY_SYS_REPAIR = 45, ENEMY_EVADE = 0.15;   // subsystem health, seconds to self-repair, beam threshold penalty while its Piloting is up (spec Combat-ii section 8; Demo-x-c section 4: Piloting, not the engines)

// Boarders (Boarders-i)
export const BOARDER_SLOTS = 4;
export const BOARDING_FIRST_SMALL = 330, ENCOUNTER_FIRST_SMALL = 270;   // seconds: the hazard gates' first party / first encounter for crews of two or fewer (spec Demo-i section 5; the game itself waits for the first jump, Loop-i section 4b)
export const BOARDING_FIRST = 240, BOARDING_COOLDOWN = 180, BOARDING_JITTER = 0.2;   // seconds: the hazard gates' first party, gap after the last kill (x jitter)
export const BOARDING_PARTY = 2;
export const BOARDER_O2_DPS = O2_DAMAGE, BOARDER_FIRE_DPS = FIRE_DAMAGE;                   // boarders suffocate and burn like the crew, below SUFFOCATE_FRAC (spec Demo-ix section 1)
export const BOARDER_HEALTH = 60, BOARDER_DPS = 6;                                   // health; damage per second to the focused crew member before Combat defence
export const CREW_MELEE_DPS = 8, COMBAT_GAIN = 0.06, COMBAT_DEFENCE = 0.04;          // crew damage per second at level 0; x(1 + gain x level); damage taken x(1 - defence x level)
export const BOARDER_MOVE = 8, BOARDER_SABOTAGE = 15;                                // seconds between moves while alone; seconds alone with an online console before it fails
export const XP_PER_KILL = 20;                                                       // Combat XP to the killer
export const HEALTH_EPS = 1e-9;                                                      // health below this snaps to 0 (melee arithmetic, spec Boarders-i section 2)

// Sector map and jumps (Run-i)
export const EDGE_CHANCE = 0.5;                                                     // chance of each candidate forward edge
/** Sectors (spec Loop-i section 1): sectors per run, columns per sector map (0 the arrival beacon, the last the exit), beacons per middle column, the node index stride (column x 4 + node). */
export const SECTORS = 3, SECTOR_COLUMNS = 6, MIDDLE_MIN = 2, MIDDLE_MAX = 4, NODE_STRIDE = 4;
/** Fuel (spec Loop-i section 2): the start, one per jump; the shop's +2 for 12 scrap; Wait for help's seconds, chance and gift; a kill gives KILL_FUEL_MIN + nextInt(loot, 2), a cleared field FIELD_FUEL. */
export const FUEL_START = 8, FUEL_COST = 12, SHOP_FUEL = 2, WAIT_SECONDS = 20, WAIT_FUEL_CHANCE = 0.6, WAIT_FUEL = 2, KILL_FUEL_MIN = 1, FIELD_FUEL = 1;
/** The Pursuit (spec Loop-i section 3): the fleet front's column on arrival in a sector and its step per jump and per wait; the elite pursuit enemy's hull and fire-interval multipliers. */
export const PURSUIT_START = -1.5, PURSUIT_STEP = 0.75, PURSUIT_HULL_MULT = 1.5, PURSUIT_FIRE_MULT = 0.75;
export const WARDEN_HULL_MULT = 1.5, WARDEN_FIRE_MULT = 0.7, WARDEN_SHIELD_EXTRA = 1;   // the Warden at the final beacon (spec Loop-iv section 2): x the final depth's hull, x the fire interval, layers over the depth's maximum
export const JUMP_CHARGE_TIME = 60;                                                 // seconds from arrival to a ready drive
export const BOARDING_AFTER_JUMP = 120;                                             // seconds after a jump before a party can arrive (no draw); the enemy follows the node type (ENCOUNTER_START, spec Demo-vi section 2)

// Events and shops (Run-ii)
export const SHOP_CHANCE = 0.15, EVENT_CHANCE = 0.25, ASTEROID_CHANCE = 0.15, EMPTY_CHANCE = 0.05;   // node type draw thresholds (map stream, after the edges), else Hazard (0.40) (spec Loop-i section 4: Shop 0.25 -> 0.15, Empty new; Demo-x-b section 2: Empty 0.15 -> 0.05; column 1 is all Hazard without a draw, column 2 has no Empty)
/** Asteroid fields (spec Demo-viii section 1): seconds between field rocks (one hazards draw per re-arm, +/- jitter), the rock flight, how long the field spawns, the extra seconds before it clears (every rock has landed), the reward. */
export const FIELD_INTERVAL = 6, FIELD_JITTER = 0.2, FIELD_FLIGHT = 10, FIELD_FLIGHT_JITTER = 2, FIELD_SECONDS = 60, FIELD_CLEAR_EXTRA = 12;   // FIELD_INTERVAL 4 -> 6 (amendment A2)
/** A field rock hits weaker than debris (spec Demo-viii amendment A1: 15 rocks x 8 hull sank the duo gate's ship): hull, and half the debris crew damage. */
export const ROCK_BREACH_FIRST = 0.75;   // a rock impact tries a breach first below this roll (amendment A4; debris 0.5)
export const FIELD_ROCK_HULL = 3, FIELD_ROCK_CREW = Math.floor(DEBRIS_CREW_DAMAGE / 2);
/** Scrap rewards grow with the column at the moment they are paid (spec Demo-ix section 2): a base plus a per-column step. */
export const scrapPerJump = (column: number): number => 10 + 4 * column;     // paid on arrival, after the jump advanced the column (amendment B8)
export const scrapEnemy = (column: number): number => 20 + 6 * column;
export const scrapSurrender = (column: number): number => 15 + 4 * column;
export const scrapBoarder = (column: number): number => 8 + 2 * column;
export const scrapField = (column: number): number => 15 + 5 * column;       // an asteroid field cleared (Demo-viii)
export const EVENT_SCRAP_SCALE = 0.15;   // event scrap amounts are written for depth 0 and multiplied by 1 + EVENT_SCRAP_SCALE x depth (spec Loop-v section 1)
export const SHOP_HULL = 25, SHOP_HULL_COST = 30, SHOP_TORPEDOES = 2, SHOP_TORPEDOES_COST = 20;
// Upgrades from the Engineering console (Loop-ii): the next level costs BASE + STEP x the levels owned
export const UPGRADE_MAX = 3, UPGRADE_BASE = 30, UPGRADE_STEP = 15;           // levels above STATION_MAX per kind: 30, 45, 60 scrap
export const REACTOR_BONUS_MAX = 5, REACTOR_BASE = 25, REACTOR_STEP = 10;     // reactor bars above REACTOR_CAPACITY: 25, 35, 45, 55, 65 scrap
// Progression and permadeath (Run-iii)
export const SCORE_NODE = 100, SCORE_VICTORY = 500, SCORE_ENEMY = 20, SCORE_BOARDER = 5;
export const UNLOCK_SCRAP = 30, UNLOCK_TORPEDOES = 2;
export const QUIRK_COUNT = 6;
export const QUIRK_PASSAGE_MULT = 2, QUIRK_HEAT_RISE = 1, QUIRK_DOOR_DELAY_MULT = 2, QUIRK_DEBRIS_OFFSET = -2, QUIRK_LEAD_OFFSET = 4, QUIRK_CHARGE_MULT = 1.25;

// HUD budgets (spec Demo-i sections 3 and 4): characters per card and notice line, pixels at 16 px m5x7 (measured from the TTF advance table)
export const CONSOLE_LINE_MAX = 40;   // characters per console-card line (308 px card at about 6.25 px per character, spec Demo-vii section 1)
export const LOBBY_LINE_MAX = 90, NOTICE_LINE_MAX = 64, LOBBY_PX_MAX = 560, NOTICE_PX_MAX = 400;
// Working together (spec Coop-i sections 1 and 2)
export const SHIELD_ROTATE = 30;      // seconds between enemy shield re-tunes while its shields system is up; 20 -> 30 (amendment C14): a level-1 scan takes 16 s, which left 4 s to lock and fire
export const LOCK_SECONDS = 8;        // a Science lock on the shield frequency
export const LOCK_HIT_BONUS = 0.15;   // added to the beam hit threshold under a lock while a layer is up
export const TEAM_MULT = 1.25;        // each holder's rate when two or more hold Interact on one target

export const HIT_FLASH_TICKS = 12;   // ticks the HUD enemy silhouette flashes after our last hit (spec Demo-ii section 4); read only by the HUD model, not hashed
export const EVADE_WINDOW = 1.0;     // seconds of an evasive manoeuvre: impacts inside it roll twice the evade chance (spec Coop-ii section 1)
export const EVADE_COOLDOWN = 6;     // seconds after the manoeuvre before Navigation can start another
export const EVADE_CAP = 0.8;        // the doubled chance is capped here (amendment D1)
export const CARRY_SPEED_MULT = 0.8;  // a crew member carrying a torpedo moves at this fraction of their speed (spec Coop-ii section 2)
export const VOTE_SECONDS = 15;      // an open event resolves by this time at the latest (spec Coop-ii section 3)
export const VOTE_SETTLE = 1;        // once every conscious player has a valid vote, it resolves after this long without a change, so the last voter can still switch (spec Coop-ii amendment D11)
export const CONFIRM_SECONDS = 5;    // a second officer's Confirm must come this soon after the pilot's jump (spec Coop-ii section 3)
```

Replace the whole of `src/renderer/src/sim/duel/hash.ts` with:

```ts
// The duel hash: SIM_VERSION, then the whole tactical flatten plus the interior fields the duel can change (spec §4:
// same seed and inputs give the same hash). The sector flatten covers far more than the duel touches, so it is not
// used here. SIM_VERSION comes first (H-0c-ii-a spec §6), so a version bump changes the duel hash as it does the
// sector one. Per-tick events (d.events) are derived and not hashed.
import { hashF64 } from '../../../../shared/hash';
import { Position, Seated } from '../components';
import { flattenTactical } from '../tactical/hash';
import { SIM_VERSION } from '../tuning';
import type { DuelState } from './state';

export function flattenDuel(d: DuelState): Float64Array {
  const out: number[] = [SIM_VERSION, ...flattenTactical(d.tactical), d.interior.tick, d.present[0] ? 1 : 0, d.present[1] ? 1 : 0, ...d.repair];
  for (let pid = 0; pid < 2; pid++) { const eid = d.interior.crew[pid]!; out.push(Position.x[eid]!, Position.y[eid]!, Seated.station[eid]!); }
  for (const v of d.interior.stations.occupant) out.push(v);
  for (const v of d.interior.doors.state) out.push(v);
  return Float64Array.from(out, (v) => (v === 0 ? 0 : v));
}

export function hashDuel(d: DuelState): string { return hashF64(flattenDuel(d)); }
```

Replace the whole of `scripts/bless-golden.ts` with:

```ts
import { computeContentDigest } from '../build/contentDigest';
import { writeFileSync, mkdirSync } from 'node:fs';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { runSemanticReplay } from '../tests/helpers/semanticReplay';
import { scriptedSemanticReplay } from '../tests/helpers/script';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { DUEL_GOLDEN, DUEL_GOLDEN_EVERY, DUEL_GOLDEN_SEED, runDuel } from '../tests/helpers/scriptedDuel';

const layout = parseShip(starter);
const contentDigest = computeContentDigest(process.cwd());
const replay = scriptedSemanticReplay(2026, 4, 60 * 120, contentDigest);   // 2 minutes, 4 players
const { hashes, finalHash } = runSemanticReplay(layout, replay, 60, contentDigest);
mkdirSync('tests/golden', { recursive: true });
writeFileSync('tests/golden/basic.json', JSON.stringify({ replay, hashes, finalHash }));
console.log(`blessed tests/golden/basic.json: ${hashes.length} checkpoints, final ${finalHash}`);

// The duel golden (H-0c-ii-a spec §6): the scripted pair at one seed, a hash every DUEL_GOLDEN_EVERY ticks.
const duel = runDuel(DUEL_GOLDEN_SEED, 'scripted', undefined, DUEL_GOLDEN_EVERY), t = duel.telemetry;
writeFileSync(DUEL_GOLDEN, JSON.stringify({ simVersion: SIM_VERSION, seed: DUEL_GOLDEN_SEED, outcome: t.outcome, ticks: t.ticks, finalHash: duel.finalHash, every: DUEL_GOLDEN_EVERY, hashes: duel.hashes }, null, 2) + '\n');
console.log(`blessed ${DUEL_GOLDEN}: ${duel.hashes.length} checkpoints, ${t.ticks} ticks, outcome ${t.outcome}, final ${duel.finalHash}`);
```

Create `scripts/determinism/rebless-version.ts`:

```ts
// Version-only re-bless of tests/fixtures/determinism-v2.json after a SIM_VERSION bump (H-0c-ii-a spec §6). The gate
// never runs this. It moves every recorded checkpoint to the current SIM_VERSION (init, snapshot header and the
// snapshot's flattened version value), re-executes the fixture's own schedules, and refuses to write unless the new
// expectations differ from the old only in the version: every canonical field but `$simVersion`, every sample's place
// and every result/event boundary must be unchanged; only the sample hashes (which hash the version) may move.
import { readFileSync, writeFileSync } from 'node:fs';
import { computeContentDigest } from '../../build/contentDigest';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { executeFixture, packFixture, unpackFixture, type Fixture } from './fixture';
import { firstDifference } from './protocol';

const path = 'tests/fixtures/determinism-v2.json';
const old = unpackFixture(JSON.parse(readFileSync(path, 'utf8')) as Fixture);
const from = old.runs[0]!.checkpoint.init.simVersion;
if (from === SIM_VERSION) throw Error(`${path} is already at sim version ${SIM_VERSION}`);
const fixture = structuredClone(old);
for (const run of fixture.runs) {
  const cp = run.checkpoint;
  if (cp.init.simVersion !== from || cp.snapshot.header.simVersion !== from || cp.snapshot.values[0] !== from) throw Error(`${cp.init.runId}: mixed sim versions`);
  cp.init.simVersion = cp.snapshot.header.simVersion = SIM_VERSION;
  cp.snapshot.values[0] = SIM_VERSION;
}
fixture.expected = executeFixture(fixture, computeContentDigest(process.cwd()), false);
const was = old.expected, now = fixture.expected;
if (was.samples.length !== now.samples.length) throw Error(`sample count changed: ${was.samples.length} → ${now.samples.length}`);
now.samples.forEach((s, i) => {
  const o = was.samples[i]!, { $simVersion: a, ...oldFields } = o.fields, { $simVersion: b, ...newFields } = s.fields;
  const place = firstDifference({ ...o, hash: '', fields: oldFields }, { ...s, hash: '', fields: newFields }, `sample ${i}`);
  if (place) throw Error(`not version-only: ${place}`);
  if (a !== from || b !== SIM_VERSION) throw Error(`sample ${i}: $simVersion ${String(a)} → ${String(b)}`);
});
const boundaries = firstDifference(was.boundaries, now.boundaries, 'boundaries');
if (boundaries) throw Error(`not version-only: ${boundaries}`);
writeFileSync(path, JSON.stringify(packFixture(fixture)));
console.log(`re-blessed ${path}: sim version ${from} → ${SIM_VERSION}, ${now.samples.length} samples and ${now.boundaries.length} boundaries unchanged apart from the version and hashes`);
```

- [ ] **Step 4: Re-bless the sector golden and write the duel golden**

Run: `npm run bless`
Expected, the last two lines:
```
blessed tests/golden/basic.json: 120 checkpoints, final 2ec5ef23
blessed tests/golden/duel-1.json: 26 checkpoints, 15772 ticks, outcome 1, final 99e38c36
```

Prove the sector golden changed by the version only (no file is written):

Run:
```bash
git show HEAD:tests/golden/basic.json > "${TMPDIR:-/tmp}/basic-before.json" && node -e "
const fs = require('fs'), a = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')), b = JSON.parse(fs.readFileSync('tests/golden/basic.json', 'utf8'));
const diffs = []; (function walk(x, y, p) { if (JSON.stringify(x) === JSON.stringify(y)) return; if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p + '.' + k); return; } diffs.push(p); })(a, b, '');
const other = diffs.filter((p) => !/(simVersion|contentDigest|\.values\.0|\.hash|^\.hashes\.\d+|^\.finalHash)$/.test(p));
console.log(diffs.length + ' leaves differ, ' + other.length + ' outside version, digest and hashes'); if (other.length) { console.log(other.slice(0, 10)); process.exit(1); }" "${TMPDIR:-/tmp}/basic-before.json"
```
Expected: `14531 leaves differ, 0 outside version, digest and hashes`, exit 0.

- [ ] **Step 5: Re-bless the determinism fixture, version only**

Run: `npx tsx scripts/determinism/rebless-version.ts`
Expected: `re-blessed tests/fixtures/determinism-v2.json: sim version 35 → 36, 1800 samples and 404 boundaries unchanged apart from the version and hashes` (about 10 s). A second run refuses: `tests/fixtures/determinism-v2.json is already at sim version 36`.

- [ ] **Step 6: Run the golden, projection and determinism tests**

Run: `npx vitest run tests/duelGolden.test.ts tests/golden.test.ts tests/netParity.test.ts tests/determinismHarness.test.ts tests/duel.test.ts tests/boundary.test.ts`
Expected: PASS, 167 tests in 6 files (3 duel golden, 4 golden, 24 net parity, 14 determinism harness, 22 duel, 100 boundary). `tests/golden.test.ts`'s pinned gameplay projections (`net1a-baseline.json`, untouched) and `tests/netParity.test.ts` pass unedited.

Run: `git status --short tests/fixtures`
Expected: only ` M tests/fixtures/determinism-v2.json`.

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm test`
Expected: every file passes, 1,969 tests and 1 skipped (see the known flakes in Global Constraints).

- [ ] **Step 8: Check that the duel still boots (manual, outside the repo)**

Run: `npm run build`, then launch the built app with `FTLITE_MODE=duel` (PowerShell: `$env:FTLITE_MODE='duel'; npx electron .`; Git Bash: `FTLITE_MODE=duel npx electron .`), or use the visual-check method (`playwright-core` outside the repo, `_electron.launch({ executablePath: '<repo>/node_modules/electron/dist/electron.exe', args: ['<repo>'], env: { ...process.env, FTLITE_MODE: 'duel' } })`, then `page.screenshot`).

Expected (the prototype's screenshot showed it): the Helm view boots with the readout column reading `CUTTER HULL 40/40` and `HUNTER HULL 40/40`; Tab, Space, F, X and Tab behave as in H-1b, with no page errors (the optional-art `ERR_FILE_NOT_FOUND` console errors are not from this plan). Delete any scratch files; commit nothing from this step.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/tuning.ts src/renderer/src/sim/duel/hash.ts scripts/bless-golden.ts scripts/determinism/rebless-version.ts tests/duelGolden.test.ts tests/golden/basic.json tests/golden/duel-1.json tests/fixtures/determinism-v2.json
git commit -m "feat(duel): SIM_VERSION 36, the duel golden and the version-only re-bless (Helm H-0c-ii-a)"
```

(End the message with your session's Co-Authored-By trailer.)

---

## After H-0c-ii-a

- **H-0 is done headless:** the scripted duels, walking to repairs included, hit parent §16's telemetry targets, and the same-seed hash and golden replay pass. The roadmap's H-0 row can be marked complete apart from H-0c-ii-b.
- **H-0c-ii-b** (waits for Net-3): the authority duel mode, the command-union amendment and the snapshot codec. When it lands, `flattenDuel` already carries `SIM_VERSION`, and the duel golden replays through the authority as well as directly.
- **Conflict with Net-3:** whichever merges second bumps `SIM_VERSION` again and re-runs Task 4 Steps 4 and 5 (`npm run bless`, the version-only diff, `npx tsx scripts/determinism/rebless-version.ts`).
- **Tuning watch:** the crew's missiles rarely hit (the pair launches from beyond laser range and the belt eats them), and the hunter's lasers hit on every release. Neither is a gate, but the live H-2 telemetry should look at both before more numbers move. `npx tsx scripts/duel-telemetry.ts` prints everything parent §13 lists.
- **The owner's check:** `npm run dev:duel`; the hulls read 40/40 and a solo duel runs longer than before.
