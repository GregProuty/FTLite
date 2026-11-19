# Playtest2feedback (Helm flight) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the crew's Helm (the Cutter class, drawn as the Hound) Newtonian flight with no drag and a 400 u/s thrust cap, a held throttle that ramps with W/S and springs back to 0, cold gas thrusters on A/D Q/E and the arrows fed by a powered compressor, mouse steering with a gas-boosted turn, and a HELM POWER split between ENGINE and COMPRESSOR. The Valkyrn solo ships stay exactly as they are.

**Architecture:** A new `ShipClassDef.newtonianHelm` flag (true only on the Cutter) selects everything. `flightFor(state, i)` (in `sim/tactical/physics.ts`) gives the crew slot `CREW_FLIGHT` (no drag, no stabilise), and `stepDuel`, `stepFlight`, `stepSoloFlight`, `predictPath` and `predictFlight` default to it, so the prediction stays exact. `flyShip` stops quantising thrust, makes reverse proportional, adds the ship-relative thruster push and the turn boost from `Axes`, and caps thrust at `max(MAX_SPEED, |v| before)` on a drag-0 path; a ship with drag runs today's arithmetic bit for bit. The helm module on `DuelState` gains `thrMille`, `rcsGas`, `rcsAcc` and `compressor` (hashed, snapshotted, bounded), plus `helmBars` (a duel option) and `helmVent` (per-tick scratch). The pure rules live in a new `sim/duel/helmFlight.ts`, and the step's new `crewHelm` runs them in the spec's order. Three optional `HeldInput` fields (`throttleHeld`, `rcsX`, `rcsY`) and one command (`helmPower`) carry the input. The app builds the fields from the keys and the left button, predicts `thrMille` online, and draws the new HelmStation block, the puffs, the steering line and the hiss.

**Tech Stack:** TypeScript, Vitest (+ jsdom for UI tests), Pixi.js (tactical layer), React + zustand (console), zod (codec), Electron/electron-vite.

## Global Constraints

- **Spec (binding):** `docs/superpowers/specs/2026-11-18-playtest2feedback-design.md`, all sections. Its review exchange is in `docs/superpowers/reviews/2026-11-18-2026-11-18-playtest2feedback-spec/exchange.md`.
- **Exact names and values (binding start values; Task 8 may move only the knobs it names):** `newtonianHelm`, `flightFor`, `CREW_FLIGHT = { gravity: true, edge: true, drag: 0, stabilise: 0 }`, `MAX_SPEED = 400`, `THR_MIN = -250`, `THR_MAX = 1000`, `THR_RAMP = 7`, `THR_RETURN = 34`, `crewThrust`, `RCS_TANK = 1000`, `RCS_GAS_PER_TICK = 8`, `RCS_THRUST = 35`, `COMPRESSOR_RATE = [0, 50, 100, 150]`, `RCS_TURN_GAS = 4`, `RCS_TURN_BOOST = 2`, `BOOST_FACE_SIN` (sin 6°), the far band `|d| > 4` (`BOOST_FAR = 4`), `HELM_BARS = 4`, `helmBoost`, `helmVent`, `helmPower`, `sfx.rcs`.
- **Sim rules:** only + − × ÷ and sqrt in `src/renderer/src/sim/**`. The determinism guard (`tests/helpers/determinismGuard.ts`) allows only `Math.abs/ceil/floor/round/min/max/sign/imul/sqrt`, so no `Math.PI`, no trigonometry, no `Math.hypot` and no `**` in sim files. Use the heading tables (`hx`, `hy`). The new state is integers only. No sim file imports from `app/`, `render/`, `input/` or `tests/`.
- **Version (binding):** master was at SIM_VERSION 54 when this plan was written (`src/renderer/src/sim/tuning.ts:7`), and pew pew W-1 plans its own bump. **Task 1 reads the current value `N` when it runs and bumps it to `N + 1` alone.** Below, `N` is the value Task 1 Step 1 prints, and `N + 1` is the version every later task runs at. The bless guard (`scripts/golden/blessGuard.ts`, `tests/blessGuard.test.ts`) only lets a bump through when the canonical trace and the duel oracle prove every run unchanged per tick, which a gameplay change cannot pass. So Task 1 bumps the version alone and blesses (the proof passes because nothing else changed), and Task 13 does the one gameplay re-record as a same-version `npm run bless` (allowed without proofs). Never pass `--fresh`. Never hand-edit `tests/golden/*.json` or `tests/fixtures/determinism-v2.json`. `MIGRATIONS` and `ADDITIONS` in `scripts/golden/duelOracle.ts` are not touched.
- **Known-red window:** two sets of tests may fail between tasks, and no others:
  - **The goldens,** from Task 2 until Task 13's bless: `tests/duelGolden.test.ts`, `tests/duelRematchGolden.test.ts` and `tests/golden.test.ts` (its `basic.json` embeds the content digest of every sim file).
  - **The crew-trajectory list `K`,** from Task 2 until Task 8 re-pins it: `tests/duelGates.test.ts`'s scripted-pair describe, plus every test Task 2 Step 10, Task 5 Step 9 and Task 7 Step 8 record in `K`. A test goes in `K` only if it pins a crew-Cutter trajectory (a seed, a tick, a position, an event count, or a "this seed's duel does X" claim) and its failure message shows a moved number. Any other failure is a bug in the task, and is fixed before its commit.
  - Every other test passes at the end of each task. The Valkyrn gate and every `tests/valkyrn*.test.ts` and `tests/scriptedPilot.test.ts` test must pass at every task unchanged. Each task runs its own targeted tests, and the full suite runs in Task 13.
- **Generated files come only from their scripts:**
  - `tests/golden/*.json` and `tests/fixtures/determinism-v2.json` from `npm run bless`;
  - `public/assets/manifest.json` from `npx tsx scripts/audio-manifest.ts`;
  - `public/THIRD_PARTY_NOTICES.txt` and `src/renderer/src/render/credits.generated.ts` from `npm run credits`.
- **Test commands:**
  - Targeted tests: `npx vitest run <files>`.
  - Type check: `npx tsc -b`.
  - The full suite: `npx vitest run --maxWorkers=4`, always after `npx electron-vite build`.
  - Never run two vitest processes at once. A full-suite timeout under load (`tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts`, `tests/gate-*.test.ts`, `tests/duelGates.test.ts`) is re-run alone before it counts as a failure.
- **Worktree:** all work happens in `C:\Users\djuar\FTLite\.worktrees\playtest2feedback`, on branch `spike/playtest2feedback`, cut from master (spec §1). Task 1 Step 1 creates it.
  - It needs two directory junctions: `node_modules` → `C:\Users\djuar\FTLite\node_modules`, and `services\signalling\node_modules` → `C:\Users\djuar\FTLite\services\signalling\node_modules`. These match the existing `.worktrees/w1-pew-pew`.
  - Never delete a `node_modules` junction in a worktree, including `services/signalling/node_modules`. A missing one is recreated, never "cleaned". Without the signalling junction, `tests/onlineAppRuntime.test.ts` fails, and that failure is not a flake.
  - Spike rule (spec §1): nothing merges until the owner has played it.
- **Determinism logs:** `npm run test:determinism` rewrites tracked logs under `.superpowers/sdd/2026-11-14-net-1b-durability/`. After every run, restore them with `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability` before staging anything.
- **Git:**
  - Never `git add -A`, `git add .` or `git stash`. Stage by name.
  - Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, passed as a second `-m`.
  - Files are UTF-8.
  - Line numbers below were read on master at `a2a02fc4`. **Match every edit by the quoted text,** not the number.
- **Comments:** each new file gets a header comment citing the spec section, and exports get doc comments. Changed lines that need a reason cite "playtest2feedback §x".

## Decisions where the spec leaves room, and where the code forces a choice

1. **The version bump comes first, alone, and the gameplay bless comes last** (see Global Constraints, Version). The bump takes whatever number is free when Task 1 runs (spec §5c, §7).
2. **The crew-trajectory window is recorded, not predicted.** The crew's flight changes in Task 2 (no drag), Task 5 (the held throttle) and Task 7 (steering by aim). The tests that pin a crew-Cutter trajectory cannot be listed before the code runs, so each of those tasks records the ones that fail into the known-red list `K` (in its commit message), under a strict rule: a moved pinned number only. Task 8 re-pins all of `K`, after the scripted crew and the gates are final.
3. **`flightFor` also drives `stepFlight` and `stepSoloFlight`.** Spec §2 names `stepDuel` and the prediction. The dev flight view (`?mode=flight`) draws its path with `predictFlight`, which now defaults to `flightFor`, so its step must agree or its drawn path would be wrong. Its ship is a Cutter in slot 0, so the dev view flies Newtonian too. Its controls (W/S thrust, A/D turn) do not change. The sector map's Helm does not use the tactical sim and is untouched.
4. **`newtonianHelm` is set by spreading over `shipClass(...)`, not by a new positional parameter.** That is, `CUTTER_CLASS = Object.freeze({ ...shipClass(...), newtonianHelm: true })`. Pew pew W-1 adds a positional `pew` parameter to `shipClass`, so this keeps the two spikes' edits to that function apart.
5. **The pure crew-Helm rules live in a new `sim/duel/helmFlight.ts`.** These are `crewThrust`, the ramp, the cap and floor, the compressor, the bar-loss rule and `heldAxis`. `helmBoost`, `crewAxes` and `headingDelta` live in `sim/duel/step.ts`, beside `helmTurn`, because `helmBoost` calls `helmTurn`, and a second file would import `step.ts` back into a file `step.ts` imports.
6. **The throttle command for a newtonianHelm class:** the order is stale-tick, then invalid-seat, then `unavailable` (the class), then malformed, then noop. This puts the class check right after the seat check, as `helmPower` does.
7. **`helmPower`'s admission adds `malformed` after the class check.** The codec admits only `delta` 1 or −1, but a local caller bypasses the codec. The order is stale-tick, invalid-seat, `unavailable` (class), malformed (a delta other than ±1), `unavailable` (range), applied. `malformed` is already one of the helm module's reasons.
8. **The scripted crew's throttle holds the sign of the thrust it wants:** W for 1, S for −1, and neither for 0. Its only targets are the cap, 0 and the floor. The clamp holds it at the cap or the floor, and the return stops at 0, so holding the sign reaches each target, which is spec §7's "hold 1 or −1 … then 0". With the Valkyrn class on the scripted pair, it still sends levels.
9. **The scripted crew steers by `aim` every tick** (the hazard's, the dodge's and the orbit's heading, from `nearestHeading`), or by `face`. It never sends an aim of −1 while flying, because a stale held heading would keep turning it.
10. **A click on a HELM POWER cell switches that bar to the other side.** An ENGINE cell sends `helmPower −1` (the bar goes to COMPRESS), and a COMPRESS cell sends `+1`. Key 1 (`+1`) and key 2 (`−1`) are as the spec says.
11. **Online, a partner sees no puffs and hears no hiss.** `helmVent` is per-tick scratch and is not on the wire (spec §4). The Helm player's own screen predicts it from the local held input and the replica's tank (`ventFor`, with the sim's rule). Single player reads `d.helmVent`.
12. **The hiss is a retriggered one-shot, not a new loop.** The audio engine's loops are the hum and the music. `sfx.rcs` plays every 0.12 s while venting (`rcsHiss`), short (0.16 s), band-passed and quiet.
13. **`sfx.rcs` takes `thrusterFire_002`.** No other Kenney sci-fi file is on disk (`public/assets/raw/kenney-sci-fi-sounds/` holds the files `soundBank.ts` already uses), and the manifest refuses a file that is listed twice. So `thruster` keeps `thrusterFire_000` and `_001` (`numbers: [0, 1]`), and `rcs` takes `numbers: [2]`. A real Kenney hiss is a later swap of the stem. Pew pew W-1 splits `laserSmall` the same way, and the two edits touch different rows.
14. **Online `thrMille` prediction counts the unacknowledged held frames** as the unacknowledged ticks: `max(0, lastSentHeldSequence − publication.heldHighWater[seat])`, capped at 30. The session sends one held frame per 60 Hz pump.
15. **Telemetry's bait "acted" test for a newtonianHelm class** counts a held `face` or `aim`, a vented axis or boost (`d.helmVent`), or `thrMille ≠ 0`. A Valkyrn keeps `moveX ≠ 0 || throttle ≠ 0`.
16. **The PRESSURE gauge's rate reads in tank percent per second:** `COMPRESSOR_RATE[c] / 10` (50 gas a second a bar is 5 %/s).
17. **Old tests of the Valkyrn-only behaviours move to the Valkyrn class on the same layout.** These are the throttle levels, the notches, W/S notch stepping, A/D turning and the unattended hold. The change is `createSeatedDuel(CUTTER, n, 0, 2, ShipClass.Valkyrn)`, which `createDuel`'s existing `cls` parameter allows. Their subject is unchanged, and spec §1 says those behaviours stay for the Valkyrn.
18. **`helmAxes` in `app/duel/input.ts` is left as it is, and a new `crewHelmHeld` builds the crew Helm's held fields.** `helmAxes` is the dev flight view's axes (spec §7's "the Valkyrn's mapping stays"). Single player (`runtime.ts`) and online (`onlineDuel.ts`'s `sessionHeld`) both call `crewHelmHeld`. The keyboard samples the new fields itself, so the console's PORT/STBD buttons (which hold KeyA and KeyD) feed them too.
19. **The spec's line numbers are a little behind master.** asteroids-ii merged after the spec was written (SIM 54), so the line numbers moved:
    - `step.ts`'s helm block is at L292-L300, not L279-L287;
    - `situationModel.stateAxes` is at L119-L124;
    - `runtime.ts`'s `sentAxes` is at about L314;
    - `scene.ts`'s `sitThrottle` is at L248 and L256.
    Every edit below quotes the text instead.

---

### Task 1: The worktree, then SIM_VERSION `N` → `N + 1` alone, proved and blessed

**Files:**
- Modify: `src/renderer/src/sim/tuning.ts:7`
- Regenerated by `npm run bless`: `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`

**Interfaces:**
- Consumes: master.
- Produces: the worktree on `spike/playtest2feedback`; `SIM_VERSION === N + 1` for every later task.

- [ ] **Step 1: Pre-flight (from `C:\Users\djuar\FTLite`, on master)**

Run: `git status --short -- src tests scripts`
Expected: only the untracked `scripts/playtest-audit.ts` (no modified tracked file under `src`, `tests` or `scripts`). If anything else is listed, stop and report.

Run (PowerShell):
```powershell
git worktree add .worktrees/playtest2feedback -b spike/playtest2feedback master
New-Item -ItemType Junction -Path .worktrees\playtest2feedback\node_modules -Target C:\Users\djuar\FTLite\node_modules
New-Item -ItemType Junction -Path .worktrees\playtest2feedback\services\signalling\node_modules -Target C:\Users\djuar\FTLite\services\signalling\node_modules
```
Expected: `Preparing worktree (new branch 'spike/playtest2feedback')`, then two `Junction` entries.

Run (in the worktree, `C:\Users\djuar\FTLite\.worktrees\playtest2feedback`, for every later step of every task): `cmd //c "dir /AL" | grep -i junction` and `cmd //c "dir /AL services\\signalling" | grep -i junction`
Expected: `<JUNCTION>     node_modules [...\FTLite\node_modules]` and `<JUNCTION>     node_modules [...\FTLite\services\signalling\node_modules]`.

Run: `git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`
Expected: `src/renderer/src/sim/tuning.ts:7:export const SIM_VERSION = <N>;`. Note `N`. (It was 54 at `a2a02fc4`; it is 55 if pew pew W-1 merged first.)

- [ ] **Step 2: Record both baselines at SIM_VERSION `N` (in the worktree)**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version <N>: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to <temp>\trace.json`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version <N>: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0. Note `<R>`, `<T>`, `<F>`.

- [ ] **Step 3: The version**

`src/renderer/src/sim/tuning.ts` line 7, `export const SIM_VERSION = <N>;`, becomes:

```ts
export const SIM_VERSION = <N + 1>;
```

(the literal number, for example `55` when `N` is 54). Nothing else in `src/` changes in this task.

- [ ] **Step 4: Both proofs before the bless**

Run: `npx tsx scripts/golden/canonical-trace.ts check`
Expected: `per-tick canonical trace identical, sim version <N> → <N + 1>: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <sha>)`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts check`
Expected: `duel oracle: <R> runs, <T> ticks, <F> named fields, results, events and telemetry identical at every tick field for field, sim version <N> → <N + 1> (baseline HEAD <sha>)`, exit 0, with Step 2's numbers.

- [ ] **Step 5: Bless**

Run: `npm run bless`
Expected, exit 0: four `blessed …` lines, for `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/fixtures/determinism-v2.json` (`sim version <N> → <N + 1>, … unchanged apart from the version and hashes`) and `tests/golden/duel-rematch.json`, each with master's checkpoint counts, ticks and outcomes and new hashes.

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

- [ ] **Step 6: The full suite at `N + 1`**

Run: `npx tsc -b`, then `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: no type errors; the build succeeds; every test file PASS.

- [ ] **Step 7: Commit**

`git status --short -- src tests` lists exactly the five files below.

```bash
git add src/renderer/src/sim/tuning.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json
git commit -m "chore(playtest2feedback): SIM_VERSION <N> -> <N + 1> alone, blessed (canonical trace and duel oracle prove every run unchanged per tick)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `newtonianHelm`, `flightFor`, the speed cap, unquantised thrust, proportional reverse, thrusters and turn boost in `flyShip`

**Files:**
- Modify: `src/renderer/src/sim/tactical/tuning.ts` (append), `src/renderer/src/sim/tactical/defs.ts`, `src/renderer/src/sim/tactical/state.ts:168-169`, `src/renderer/src/sim/tactical/physics.ts`, `src/renderer/src/sim/tactical/duel.ts`, `src/renderer/src/sim/tactical/predict.ts`
- Create: `tests/crewFlight.test.ts`
- Modify (a test the new rule replaces): `tests/duelThrottle.test.ts` (the `it('thrust is quantised to quarters …')` block)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  // sim/tactical/tuning.ts
  export const MAX_SPEED = 400, RCS_THRUST = 35, RCS_TURN_BOOST = 2, BOOST_FAR = 4;
  export const CREW_FLIGHT: FlightTuning;   // { gravity: true, edge: true, drag: 0, stabilise: 0 }
  // sim/tactical/defs.ts: ShipClassDef.newtonianHelm: boolean (true only on CUTTER_CLASS)
  // sim/tactical/state.ts: Axes { turn; thrust; turnBoost?: number; rcsX?: number; rcsY?: number }
  // sim/tactical/physics.ts
  export function flightFor(state: TacticalState, i: number): FlightTuning;
  // flySlot unchanged; stepFlight(state, axes, tuning?), stepSoloFlight(state, axes, tuning?) default per slot to flightFor
  // sim/tactical/duel.ts: stepDuel(state, crew, tuning?: FlightTuning)   (absent: flightFor per slot)
  // sim/tactical/predict.ts: predictPath(…, tuning?), predictFlight(…, tuning?)   (absent: flightFor(state, shipIndex))
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/crewFlight.test.ts`:

```ts
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §1, §2, §3, §4, §4a): the newtonianHelm flag, flightFor's
// per-slot tuning, the drag-0 speed cap, unquantised thrust with proportional reverse, the ship-relative thruster push,
// the turn boost, and the bit-identical flight of every ship that flies with drag.
import { describe, expect, it } from 'vitest';
import { CUTTER_CLASS, HUNTER_CLASS, SHIP_CLASSES, ShipClass, VALKYRN_CLASS, VALKYRN_LASER_CLASS, type ShipClassDef } from '../src/renderer/src/sim/tactical/defs';
import { hx, hy, wrapHeading } from '../src/renderer/src/sim/tactical/direction';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { edgeAccel, engineFactor, flightFor, flyShip, gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { predictFlight, predictPath } from '../src/renderer/src/sim/tactical/predict';
import { createTacticalState, type Axes, type Ship } from '../src/renderer/src/sim/tactical/state';
import { BOOST_FAR, CREW_FLIGHT, DEFAULT_FLIGHT, DT, MAX_SPEED, RCS_THRUST, RCS_TURN_BOOST, THRUST, TURN_STEPS_PER_TICK, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { throttleThrust } from '../src/renderer/src/sim/duel/throttle';

/** flyShip as it stood at master a2a02fc4 (thrust quantised to quarters, any reverse full reverse): every ship that flies
 *  with drag must fly exactly this (spec §3, §8 "Whole thrust axes … fly bit-identically to today"). */
function flyShipToday(s: Ship, axes: Axes, tuning: FlightTuning, engines = 0, cls: ShipClassDef = CUTTER_CLASS): void {
  const turn = Math.sign(axes.turn) || 0, q = (Math.max(-4, Math.min(4, Math.round(axes.thrust * 4))) || 0) / 4;
  const f = engineFactor(cls, engines);
  s.headingAcc += turn * cls.turnStepsPerTick * f;
  while (s.headingAcc >= 1) { s.heading = wrapHeading(s.heading + 1); s.headingAcc -= 1; }
  while (s.headingAcc <= -1) { s.heading = wrapHeading(s.heading - 1); s.headingAcc += 1; }
  const h0 = hx(s.heading), h1 = hy(s.heading);
  const idle = turn === 0 && q === 0, px = -h1, py = h0;
  if (idle && !s.released) { const side = s.vx * px + s.vy * py; s.skidBudget = Math.abs(side); s.skidSign = Math.sign(side); }
  if (!idle) { s.skidBudget = 0; s.skidSign = 0; }
  s.released = idle;
  if (idle && s.skidBudget > 0 && tuning.stabilise > 0) {
    const cut = Math.min(s.skidBudget, tuning.stabilise * DT);
    s.vx -= s.skidSign * cut * px; s.vy -= s.skidSign * cut * py; s.skidBudget -= cut;
  }
  let ax = 0, ay = 0;
  if (tuning.gravity) { const [gx, gy] = gravityAccel(s.x, s.y); ax += gx; ay += gy; }
  if (tuning.edge) { const [ex, ey] = edgeAccel(s.x, s.y); ax += ex; ay += ey; }
  if (q > 0) { const push = q * cls.thrust; ax += h0 * push * f; ay += h1 * push * f; }
  else if (q < 0) { ax -= h0 * cls.thrust * cls.reverseFraction * f; ay -= h1 * cls.thrust * cls.reverseFraction * f; }
  s.vx += ax * DT; s.vy += ay * DT;
  const keep = 1 - tuning.drag * DT;
  s.vx *= keep; s.vy *= keep;
  s.skidBudget *= keep;
  s.x += s.vx * DT; s.y += s.vy * DT;
}
const ship = (over: Partial<Ship>): Ship => ({ ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, ...over });
const speed = (s: Ship): number => Math.sqrt(s.vx * s.vx + s.vy * s.vy);
const NO_GRAVITY: FlightTuning = { ...CREW_FLIGHT, gravity: false };

describe('which ships (spec §1, §2)', () => {
  it('only the Cutter is newtonianHelm; flightFor gives slot 0 CREW_FLIGHT on it and DEFAULT_FLIGHT otherwise', () => {
    expect(SHIP_CLASSES.map((c) => c.newtonianHelm)).toEqual([true, false, false, false]);
    expect(CREW_FLIGHT).toEqual({ gravity: true, edge: true, drag: 0, stabilise: 0 });
    expect(MAX_SPEED).toBe(400);
    const st = createTacticalState(5);
    expect([flightFor(st, 0), flightFor(st, 1)]).toEqual([CREW_FLIGHT, DEFAULT_FLIGHT]);
    for (const cls of [ShipClass.Valkyrn, ShipClass.ValkyrnLaser]) expect(flightFor(createTacticalState(5, 2, cls), 0)).toBe(DEFAULT_FLIGHT);
  });
  it('every newtonianHelm class turns a boosted tick in fewer whole steps than the far band (defs.ts asserts it)', () => {
    for (const c of SHIP_CLASSES.filter((k) => k.newtonianHelm)) expect(RCS_TURN_BOOST * c.turnStepsPerTick).toBeLessThan(BOOST_FAR);
  });
});

describe('a ship that flies with drag flies exactly as today (spec §3)', () => {
  const start = (): Ship => ({ ...createTacticalState(3).ships[0], x: 900, y: -400, vx: 30, vy: 60, heading: 40, headingAcc: 0.25 });
  it('whole axes and every Valkyrn level, for every class and Engines level, bit for bit over 120 ticks', () => {
    const thrusts = [-1, 0, 1, ...[-1, 0, 1, 2, 3, 4].map(throttleThrust)];
    for (const cls of [CUTTER_CLASS, HUNTER_CLASS, VALKYRN_CLASS, VALKYRN_LASER_CLASS]) for (const engines of [0, 1, 2]) for (const turn of [-1, 0, 1]) for (const thrust of thrusts) {
      const a = start(), b = start();
      for (let t = 0; t < 120; t++) { flyShip(a, { turn, thrust }, DEFAULT_FLIGHT, engines, cls); flyShipToday(b, { turn, thrust }, DEFAULT_FLIGHT, engines, cls); }
      expect(a, `${cls.id} engines ${engines} turn ${turn} thrust ${thrust}`).toEqual(b);
    }
  });
});

describe('Newtonian flight (spec §2)', () => {
  it('with no input and gravity off the velocity is identical after 600 ticks', () => {
    const s = ship({ x: 500, y: 500, vx: 30, vy: -40, heading: 10 });
    for (let t = 0; t < 600; t++) flyShip(s, { turn: 0, thrust: 0 }, NO_GRAVITY);
    expect([s.vx, s.vy, s.heading, s.headingAcc]).toEqual([30, -40, 10, 0]);
    expect(s.x).toBeCloseTo(500 + 30 * DT * 600, 6); expect(s.y).toBeCloseTo(500 - 40 * DT * 600, 6);
  });
  it('with gravity the path bends toward the planet', () => {
    const s = ship({ x: 1500, y: 0, vx: 0, vy: 100 });
    for (let t = 0; t < 60; t++) flyShip(s, { turn: 0, thrust: 0 }, CREW_FLIGHT);
    expect(s.vx).toBeLessThan(0);
  });
  it('a thrust-only tick never raises the speed past max(400, the speed before thrust)', () => {
    for (const [v0, heading] of [[390, 0], [399.9, 0], [400, 0], [450, 0], [450, 30], [200, 0]] as const) {
      const s = ship({ vx: 0, vy: -v0, heading });
      for (let t = 0; t < 120; t++) {
        const before = speed(s);
        flyShip(s, { turn: 0, thrust: 1, rcsX: 1, rcsY: 1 }, NO_GRAVITY);
        expect(speed(s), `v0 ${v0} heading ${heading} tick ${t}`).toBeLessThanOrEqual(Math.max(MAX_SPEED, before) + 1e-9);
      }
    }
  });
  it('a perpendicular push at 400 still turns the velocity', () => {
    const s = ship({ vx: 0, vy: -400, heading: 64 });   // nose east, flying north at the cap
    flyShip(s, { turn: 0, thrust: 1 }, NO_GRAVITY);
    expect(s.vx).toBeGreaterThan(0); expect(s.vy).toBeGreaterThan(-400);
    expect(speed(s)).toBeLessThanOrEqual(MAX_SPEED + 1e-9); expect(speed(s)).toBeCloseTo(MAX_SPEED, 9);
  });
  it('gravity can still push the speed past 400, and thrust then cannot add to it', () => {
    const s = ship({ x: 150, y: 0, vx: 0, vy: -420 });
    const before = speed(s);
    flyShip(s, { turn: 0, thrust: 0 }, CREW_FLIGHT);
    expect(speed(s)).not.toBe(before);   // gravity changed it, uncapped
    const t = ship({ vx: 0, vy: -420 });
    flyShip(t, { turn: 0, thrust: 1 }, NO_GRAVITY);
    expect(speed(t)).toBeCloseTo(420, 9);
  });
});

describe('the thrust axis (spec §3)', () => {
  const push = (thrust: number): number => { const s = ship({}); flyShip(s, { turn: 0, thrust }, NO_GRAVITY); return s.vy; };
  it('is no longer quantised to quarters, and reverse is proportional', () => {
    expect(push(0.3)).toBeCloseTo(-0.3 * THRUST * DT, 12);
    expect(push(0.007)).toBeCloseTo(-0.007 * THRUST * DT, 12);
    expect(push(-0.5)).toBeCloseTo(0.5 * 0.4 * THRUST * DT, 12);
    expect(push(-1)).toBeCloseTo(0.4 * THRUST * DT, 12);
    expect(push(2)).toBe(push(1)); expect(push(-3)).toBe(push(-1));
    expect(push(Number.NaN)).toBe(0); expect(Object.is(push(-0), 0) || push(-0) === 0).toBe(true);
  });
  it('is rounded to thousandths', () => {
    expect(push(0.3004)).toBe(push(0.3)); expect(push(0.2996)).toBe(push(0.3));
  });
});

describe('the cold gas thrusters in flight (spec §4)', () => {
  const dv = (heading: number, a: Partial<Axes>, engines = 0): [number, number] => {
    const s = ship({ heading }); flyShip(s, { turn: 0, thrust: 0, ...a }, NO_GRAVITY, engines); return [s.vx, s.vy];
  };
  it('push RCS_THRUST along the nose (rcsY) or its right (rcsX), relative to the ship, at two headings', () => {
    const k = RCS_THRUST * DT;
    for (const [heading, fx, fy] of [[0, 0, -1], [64, 1, 0]] as const) {
      const [ax, ay] = dv(heading, { rcsY: 1 }), [bx, by] = dv(heading, { rcsY: -1 }), [cx, cy] = dv(heading, { rcsX: 1 }), [ex, ey] = dv(heading, { rcsX: -1 });
      expect(ax).toBeCloseTo(fx * k, 12); expect(ay).toBeCloseTo(fy * k, 12);
      expect(bx).toBeCloseTo(-fx * k, 12); expect(by).toBeCloseTo(-fy * k, 12);
      expect(cx).toBeCloseTo(-fy * k, 12); expect(cy).toBeCloseTo(fx * k, 12);   // right of (hx, hy) is (−hy, hx)
      expect(ex).toBeCloseTo(fy * k, 12); expect(ey).toBeCloseTo(-fx * k, 12);
    }
  });
  it('are not scaled by Engines damage: at level 2 the main engine is off and the thrusters still push', () => {
    const [ax, ay] = dv(0, { thrust: 1, rcsY: 1 }, 2);
    expect(ax).toBeCloseTo(0, 12); expect(ay).toBeCloseTo(-RCS_THRUST * DT, 12);
  });
});

describe('the turn boost in flight (spec §4a)', () => {
  it('turnBoost 2 steps twice the class turn; absent or 1 is today\'s', () => {
    const a = ship({}), b = ship({}), c = ship({});
    flyShip(a, { turn: 1, thrust: 0, turnBoost: 2 }, NO_GRAVITY); flyShip(b, { turn: 1, thrust: 0 }, NO_GRAVITY); flyShip(c, { turn: 1, thrust: 0, turnBoost: 1 }, NO_GRAVITY);
    expect(a.heading + a.headingAcc).toBeCloseTo(2 * TURN_STEPS_PER_TICK, 12);
    expect(b).toEqual(c); expect(b.heading + b.headingAcc).toBeCloseTo(TURN_STEPS_PER_TICK, 12);
  });
});

describe('the prediction follows the crew flight (spec §2, §8)', () => {
  it('predictFlight for slot 0 defaults to CREW_FLIGHT and matches the stepped duel tick for tick', () => {
    const st = createTacticalState(5), axes: Axes = { turn: 0, thrust: 0.5 };
    expect(predictPath(st, 0, axes, 30, 1)).toEqual(predictPath(st, 0, axes, 30, 1, CREW_FLIGHT));
    const path = predictFlight(st, 0, axes, 30, 1);
    expect(path.contact).toBeNull();
    for (let k = 0; k < 30; k++) {
      stepDuel(st, { ...IDLE_INPUT, axes });
      expect([k, st.ships[0].x, st.ships[0].y]).toEqual([k, path.points[k]!.x, path.points[k]!.y]);
    }
    expect([st.ships[0].planetHits, st.ships[0].asteroidHits, st.ships[0].shipHits]).toEqual([0, 0, 0]);
  });
  it('the Hunter and the Valkyrn keep drag: their prediction defaults to DEFAULT_FLIGHT', () => {
    const st = createTacticalState(5), v = createTacticalState(5, 2, ShipClass.Valkyrn), axes: Axes = { turn: 1, thrust: 1 };
    expect(predictPath(st, 1, axes, 30, 1)).toEqual(predictPath(st, 1, axes, 30, 1, DEFAULT_FLIGHT));
    expect(predictPath(v, 0, axes, 30, 1)).toEqual(predictPath(v, 0, axes, 30, 1, DEFAULT_FLIGHT));
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/crewFlight.test.ts`
Expected: FAIL (`flightFor` is not exported; `CREW_FLIGHT`, `MAX_SPEED` undefined).

- [ ] **Step 3: The numbers**

Append to `src/renderer/src/sim/tactical/tuning.ts`:

```ts

// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §2, §4, §4a): the crew Helm's Newtonian flight, on a class
// whose `newtonianHelm` is true (the Cutter). Start values, tuned in playtest.
/** §2: the top speed thrust may not push a ship past (u/s); gravity, the edge and bounces still can. */
export const MAX_SPEED = 400;
/** §4: one vented cold gas axis's push (u/s²), in the ship frame; never scaled by Engines damage. */
export const RCS_THRUST = 35;
/** §4a: a gas-boosted turn steps this many times the class's turn a tick. */
export const RCS_TURN_BOOST = 2;
/** §4a: a turn toward an aim or a held heading is far (boosted) while the signed index difference is beyond this; it is
 *  wider than a boosted step (2 × 1.78 = 3.56), so the boost never reaches the aim's own |d| ≤ 1 band. */
export const BOOST_FAR = 4;
/** §2: the crew Helm's flight: gravity and the edge spring, no drag, no stabilise. */
export const CREW_FLIGHT: FlightTuning = { gravity: true, edge: true, drag: 0, stabilise: 0 };
```

- [ ] **Step 4: The class flag and its assertion**

In `src/renderer/src/sim/tactical/defs.ts`:

(a) In the `import { ... } from './tuning';` list, add `BOOST_FAR, RCS_TURN_BOOST,` (keep the list's other names).

(b) In `ShipClassDef`, replace

```ts
  /** Who flies it when no player does: nobody ('crew') or the hunter's state machine (sim/tactical/hunter.ts). */
  readonly ai: 'crew' | 'hunter';
}
```

with

```ts
  /** Who flies it when no player does: nobody ('crew') or the hunter's state machine (sim/tactical/hunter.ts). */
  readonly ai: 'crew' | 'hunter';
  /** Playtest2feedback §1: the crew Helm flies Newtonian (no drag, the held throttle, cold gas, mouse steering, the
   *  ENGINE / COMPRESSOR split) in the crew slot. True only on the Cutter. */
  readonly newtonianHelm: boolean;
}
```

(c) In `shipClass`, replace `    slots: Object.freeze({ laser, gun, missile: MISSILE }), ai` with `    slots: Object.freeze({ laser, gun, missile: MISSILE }), ai, newtonianHelm: false`.

(d) Replace

```ts
export const CUTTER_CLASS = shipClass('cutter', 'crew', SHIP_HULL, LASER);
```

with

```ts
export const CUTTER_CLASS: ShipClassDef = Object.freeze({ ...shipClass('cutter', 'crew', SHIP_HULL, LASER), newtonianHelm: true });   // playtest2feedback §1
```

(e) After the line `for (const c of SHIP_CLASSES) if (!(c.turnStepsPerTick < 3)) throw new Error(...)` (the aim band assertion), insert:

```ts
// Playtest2feedback §4a: a boosted turn (RCS_TURN_BOOST × the class turn) must stay inside the far band, so it never
// steps across the normal turn's own bands and the nose never chatters.
for (const c of SHIP_CLASSES) if (c.newtonianHelm && !(RCS_TURN_BOOST * c.turnStepsPerTick < BOOST_FAR)) throw new Error(`ship class ${c.id} turns ${RCS_TURN_BOOST * c.turnStepsPerTick} boosted heading steps a tick; the far band needs fewer than ${BOOST_FAR}`);
```

- [ ] **Step 5: The axes**

In `src/renderer/src/sim/tactical/state.ts`, replace

```ts
/** Held axes for one ship: turn (+ clockwise) and thrust (+ forward). flyShip quantises the turn by sign and the thrust to quarters (NaN counts as 0; Artemis spec §5.3). */
export interface Axes { turn: number; thrust: number }
```

with

```ts
/** Held axes for one ship: turn (+ clockwise) and thrust (+ forward). flyShip quantises the turn by sign and rounds the
 *  thrust to thousandths in −1..1 (NaN counts as 0; playtest2feedback §3). Playtest2feedback §4, §4a: `turnBoost` (1 or 2,
 *  absent 1) multiplies the turn step; `rcsX` (−1 port, 1 starboard) and `rcsY` (−1 aft, 1 forward) are the cold gas
 *  axes that vented this tick (absent 0). */
export interface Axes { turn: number; thrust: number; turnBoost?: number; rcsX?: number; rcsY?: number }
```

- [ ] **Step 6: Flight**

In `src/renderer/src/sim/tactical/physics.ts`:

(a) Replace the two import lines

```ts
import { classOf, Room, type Axes, type Ship, type TacticalState } from './state';
import { DEFAULT_FLIGHT, DT, GM, GRAVITY_EPS, K_EDGE, R_MAP, type FlightTuning } from './tuning';
```

with

```ts
import { classOf, CREW_SLOT, Room, type Axes, type Ship, type TacticalState } from './state';
import { CREW_FLIGHT, DEFAULT_FLIGHT, DT, GM, GRAVITY_EPS, K_EDGE, MAX_SPEED, R_MAP, RCS_THRUST, type FlightTuning } from './tuning';
```

(b) Replace the whole `flyShip` function (from its doc comment `/** One tick of one ship's flight, without contacts, ...` to its closing `}`) with:

```ts
/** One tick of one ship's flight, without contacts, at Engines damage level `engines` and with the class's thrust and
 *  turn. Shared by the step and by predictPath, so the prediction is exact. Playtest2feedback §2: a ship flying with
 *  drag 0 caps its thrust at max(MAX_SPEED, its speed before the thrust), then adds gravity and the edge uncapped; a ship
 *  flying with drag runs the arithmetic it always has, bit for bit. */
export function flyShip(s: Ship, axes: Axes, tuning: FlightTuning, engines = 0, cls: ShipClassDef = CUTTER_CLASS): void {
  // The turn is quantised by sign; the thrust (playtest2feedback §3) is rounded to thousandths and clamped to −1..1, so the
  // crew's held throttle flies smoothly. `|| 0` maps NaN and −0 to 0. Whole axes (the hunter's −1, 0, 1, the Valkyrn's
  // levels −1, ¼, ½, ¾, 1, the flight view) give exactly the quarter-quantised q they always did.
  const turn = Math.sign(axes.turn) || 0, q = Math.max(-1, Math.min(1, Math.round(axes.thrust * 1000) / 1000)) || 0;
  const boost = axes.turnBoost ?? 1, rcsX = Math.sign(axes.rcsX ?? 0) || 0, rcsY = Math.sign(axes.rcsY ?? 0) || 0;   // §4, §4a
  const f = engineFactor(cls, engines);
  s.headingAcc += turn * boost * cls.turnStepsPerTick * f;
  while (s.headingAcc >= 1) { s.heading = wrapHeading(s.heading + 1); s.headingAcc -= 1; }
  while (s.headingAcc <= -1) { s.heading = wrapHeading(s.heading - 1); s.headingAcc += 1; }
  const h0 = hx(s.heading), h1 = hy(s.heading);
  // Stabilise (spec §6): on the tick both axes go to zero, capture the sideways speed (along px, py, 90° clockwise of the
  // nose) as the skid to remove; then remove up to STABILISE · dt of it per tick until it is gone. Gravity's later
  // sideways pull is never captured, so a released ship still falls and orbits. Runs before this tick's forces.
  const idle = turn === 0 && q === 0 && rcsX === 0 && rcsY === 0, px = -h1, py = h0;
  if (idle && !s.released) { const side = s.vx * px + s.vy * py; s.skidBudget = Math.abs(side); s.skidSign = Math.sign(side); }
  if (!idle) { s.skidBudget = 0; s.skidSign = 0; }
  s.released = idle;
  if (idle && s.skidBudget > 0 && tuning.stabilise > 0) {
    const cut = Math.min(s.skidBudget, tuning.stabilise * DT);
    s.vx -= s.skidSign * cut * px; s.vy -= s.skidSign * cut * py; s.skidBudget -= cut;
  }
  // The field: gravity and the edge spring, summed from 0 in today's order.
  let gx = 0, gy = 0;
  if (tuning.gravity) { const [ax, ay] = gravityAccel(s.x, s.y); gx += ax; gy += ay; }
  if (tuning.edge) { const [ex, ey] = edgeAccel(s.x, s.y); gx += ex; gy += ey; }
  // The pushes: the main engine scaled by the Engines factor, its reverse in proportion (§3: |q| of the full reverse),
  // and the cold gas thrusters (§4: RCS_THRUST per vented axis along the nose or its right, never scaled by the Engines).
  let tx = 0, ty = 0;
  if (q > 0) { const push = q * cls.thrust; tx += h0 * push * f; ty += h1 * push * f; }   // q = 1: push is cls.thrust exactly
  else if (q < 0) { const r = -q; tx -= h0 * cls.thrust * cls.reverseFraction * r * f; ty -= h1 * cls.thrust * cls.reverseFraction * r * f; }   // r = 1: today's full reverse exactly
  if (rcsY !== 0) { tx += h0 * RCS_THRUST * rcsY; ty += h1 * RCS_THRUST * rcsY; }
  if (rcsX !== 0) { tx += px * RCS_THRUST * rcsX; ty += py * RCS_THRUST * rcsX; }
  if (tuning.drag === 0) {
    // §2: thrust first, capped so it never raises the speed past max(MAX_SPEED, the speed before it); a perpendicular push
    // still turns the velocity. Then gravity and the edge, uncapped.
    const s0 = Math.sqrt(s.vx * s.vx + s.vy * s.vy), lim = Math.max(MAX_SPEED, s0);
    let vx = s.vx + tx * DT, vy = s.vy + ty * DT;
    const s1 = Math.sqrt(vx * vx + vy * vy);
    if (s1 > lim && s1 > 0) { const k = lim / s1; vx *= k; vy *= k; }
    s.vx = vx + gx * DT; s.vy = vy + gy * DT;
  } else {
    const ax = gx + tx, ay = gy + ty;   // the field then the push: today's sum, value for value
    s.vx += ax * DT; s.vy += ay * DT;
    const keep = 1 - tuning.drag * DT;
    s.vx *= keep; s.vy *= keep;
    s.skidBudget *= keep;   // drag shrinks the remaining skid too, so the assist never pushes past zero
  }
  s.x += s.vx * DT; s.y += s.vy * DT;
}

/** Playtest2feedback §2: ship slot i's flight tuning. The crew slot flies CREW_FLIGHT (no drag, no stabilise) when its
 *  class is newtonianHelm (the Cutter); every other slot and class keeps DEFAULT_FLIGHT. */
export function flightFor(state: TacticalState, i: number): FlightTuning {
  return i === CREW_SLOT && classOf(state, i).newtonianHelm ? CREW_FLIGHT : DEFAULT_FLIGHT;
}
```

(c) Replace

```ts
/** One duel tick of flight: the active ships fly in slot order, then contacts resolve, then the tick advances. */
export function stepFlight(state: TacticalState, axes: readonly Axes[], tuning: FlightTuning = DEFAULT_FLIGHT): void {
  state.ships.forEach((s, i) => { if (s.active) flySlot(state, i, axes[i] ?? { turn: 0, thrust: 0 }, tuning); });
```

with

```ts
/** One duel tick of flight: the active ships fly in slot order, then contacts resolve, then the tick advances. `tuning`
 *  overrides every slot's (the §4 test configurations); absent, each slot flies flightFor (playtest2feedback §2). */
export function stepFlight(state: TacticalState, axes: readonly Axes[], tuning?: FlightTuning): void {
  state.ships.forEach((s, i) => { if (s.active) flySlot(state, i, axes[i] ?? { turn: 0, thrust: 0 }, tuning ?? flightFor(state, i)); });
```

(d) Replace

```ts
export function stepSoloFlight(state: TacticalState, axes: Axes, tuning: FlightTuning = DEFAULT_FLIGHT): void {
  flySlot(state, 0, axes, tuning);
```

with

```ts
export function stepSoloFlight(state: TacticalState, axes: Axes, tuning?: FlightTuning): void {
  flySlot(state, 0, axes, tuning ?? flightFor(state, 0));   // playtest2feedback Decision 3: as its drawn prediction
```

- [ ] **Step 7: The duel step and the prediction default to `flightFor`**

In `src/renderer/src/sim/tactical/duel.ts`:

(a) Replace `import { flySlot } from './physics';` with `import { flightFor, flySlot } from './physics';`, and `import { DEFAULT_FLIGHT, type FlightTuning } from './tuning';` with `import type { FlightTuning } from './tuning';`.

(b) Replace

```ts
export function stepDuel(state: TacticalState, crew: ShipInput, tuning: FlightTuning = DEFAULT_FLIGHT): void {
```

with

```ts
export function stepDuel(state: TacticalState, crew: ShipInput, tuning?: FlightTuning): void {   // playtest2feedback §2: `tuning` overrides every slot; absent, flightFor
```

(c) Replace

```ts
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) flySlot(state, i, inputs[i]!.helm ? inputs[i]!.axes : NO_AXES, tuning);
```

with

```ts
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) flySlot(state, i, inputs[i]!.helm ? inputs[i]!.axes : NO_AXES, tuning ?? flightFor(state, i));
```

In `src/renderer/src/sim/tactical/predict.ts`:

(a) Replace `import { flyShip } from './physics';` with `import { flightFor, flyShip } from './physics';`, and `import { DEFAULT_FLIGHT, MISSILE_RADIUS, type FlightTuning } from './tuning';` with `import { MISSILE_RADIUS, type FlightTuning } from './tuning';`.

(b) Replace

```ts
export function predictPath(state: TacticalState, shipIndex: number, axes: Axes, ticks: number, every: number, tuning: FlightTuning = DEFAULT_FLIGHT): PathPoint[] {
```

with

```ts
export function predictPath(state: TacticalState, shipIndex: number, axes: Axes, ticks: number, every: number, tuning?: FlightTuning): PathPoint[] {   // playtest2feedback §2: absent, flightFor
```

(c) Replace

```ts
export function predictFlight(state: TacticalState, shipIndex: number, axes: Axes, ticks: number, every: number, tuning: FlightTuning = DEFAULT_FLIGHT): { points: PathPoint[]; contact: (PathPoint & { tick: number }) | null } {
  const s = cloneShip(state.ships[shipIndex]!), stride = Math.max(1, Math.floor(every));
```

with

```ts
export function predictFlight(state: TacticalState, shipIndex: number, axes: Axes, ticks: number, every: number, tuning?: FlightTuning): { points: PathPoint[]; contact: (PathPoint & { tick: number }) | null } {
  const s = cloneShip(state.ships[shipIndex]!), stride = Math.max(1, Math.floor(every)), fly = tuning ?? flightFor(state, shipIndex);   // playtest2feedback §2
```

and in its loop replace `    flyShip(s, axes, tuning, engines, cls);` with `    flyShip(s, axes, fly, engines, cls);`.

- [ ] **Step 8: The quarter-quantisation test the spec replaces**

In `tests/duelThrottle.test.ts`, replace the whole `it('thrust is quantised to quarters: 0.5 is half the forward push, 0.3 flies as 0.25, 0.1 as none; any reverse is full reverse', () => { … });` block with:

```ts
  it('playtest2feedback §3: thrust is rounded to thousandths, not quarters, and reverse is proportional', () => {
    const NO_FIELD: FlightTuning = { gravity: false, edge: false, drag: 0, stabilise: DEFAULT_FLIGHT.stabilise };
    const push = (thrust: number): number => {
      const s: Ship = { ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0 };
      flyShip(s, { turn: 0, thrust }, NO_FIELD);
      return s.vy;
    };
    expect(push(1)).toBeCloseTo(-THRUST * DT, 12);
    expect(push(0.5)).toBeCloseTo(-0.5 * THRUST * DT, 12);
    expect(push(0.3)).toBeCloseTo(-0.3 * THRUST * DT, 12);
    expect(push(-0.25)).toBeCloseTo(0.25 * 0.4 * THRUST * DT, 12); expect(push(-1)).toBeCloseTo(0.4 * THRUST * DT, 12);
    expect(push(NaN)).toBe(push(0));
  });
```

- [ ] **Step 9: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/crewFlight.test.ts tests/tacticalFlight.test.ts tests/duelThrottle.test.ts tests/tacticalSlots.test.ts tests/tacticalContacts.test.ts tests/tacticalSoloFlight.test.ts tests/flightRuntime.test.ts tests/disabledSystems.test.ts tests/leadModel.test.ts tests/valkyrnClasses.test.ts tests/valkyrnFlight.test.ts tests/valkyrnRuntime.test.ts tests/scriptedPilot.test.ts tests/determinismGuard.test.ts`
Expected: PASS. If a test here fails, Step 6 is wrong. Only the Cutter crew's flight changed, and the tests in this list do not pin a Cutter duel trajectory.

- [ ] **Step 10: Record the crew-trajectory failures (`K`, part 1)**

Run: `npx vitest run tests/duel*.test.ts tests/feel*.test.ts tests/tactical*.test.ts tests/online*.test.ts tests/sci*.test.ts tests/science*.test.ts tests/hunter*.test.ts tests/rock*.test.ts tests/spike*.test.ts tests/asteroid*.test.ts`
Expected: PASS except the goldens and tests that pin a crew-Cutter trajectory. Read each failure:
- If it pins a trajectory (a seed or tick in its text, a position, a count, or "has a missile in flight at tick …") and its message shows the number moved, write it down as `<file> › <test name>`. That is `K`, part 1.
- If it fails any other way, fix this task's code until it passes.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/defs.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/physics.ts src/renderer/src/sim/tactical/duel.ts src/renderer/src/sim/tactical/predict.ts tests/crewFlight.test.ts tests/duelThrottle.test.ts
git commit -m "feat(playtest2feedback): newtonianHelm on the Cutter, flightFor's CREW_FLIGHT, the 400 u/s thrust cap, unquantised thrust and proportional reverse, thrusters and turn boost in flyShip" -m "Known-red K (part 1): <one line per test from Step 10, or 'none'>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The helm module's new state, the duel option `helmBars`, the pure crew-Helm rules, hash, snapshot and bounds

**Files:**
- Modify: `src/renderer/src/sim/duel/tuning.ts` (append), `src/renderer/src/sim/duel/state.ts`, `src/renderer/src/sim/duel/modules.ts`, `src/renderer/src/sim/duel/snapshot.ts`, `src/renderer/src/sim/duel/step.ts` (`startRound`, `stepDecided`)
- Create: `src/renderer/src/sim/duel/helmFlight.ts`, `tests/helmModule.test.ts`
- Modify (tests the new shapes touch): `tests/duelModules.test.ts`, `tests/duel.test.ts:46`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  // sim/duel/tuning.ts
  export const THR_MIN = -250, THR_MAX = 1000, THR_RAMP = 7, THR_RETURN = 34;
  export const RCS_TANK = 1000, RCS_GAS_PER_TICK = 8, RCS_TURN_GAS = 4;
  export const COMPRESSOR_RATE: readonly number[];   // [0, 50, 100, 150]
  export const COMPRESSOR_MAX = 3, HELM_BARS = 4, HELM_BARS_MAX = 5;
  export const BOOST_FACE_SIN: number;               // sin 6°
  // sim/duel/helmFlight.ts
  export interface HelmVent { x: number; y: number; boosted: boolean }
  export function noVent(): HelmVent;
  export function crewThrust(m: number): number;
  export function heldAxis(v: unknown): number;
  export function engineBars(d: Pick<DuelState, 'helmBars' | 'compressor'>): number;
  export function throttleCap(engine: number): number;
  export function throttleFloor(engine: number): number;
  export function compressorMax(helmBars: number): number;
  export function rampThrottle(m: number, held: number, floor: number, cap: number): number;
  export function rampTicks(m: number, held: number, floor: number, cap: number, ticks: number): number;
  export function compress(gas: number, acc: number, compressor: number): { gas: number; acc: number };
  export function vents(want: number, gas: number): boolean;
  export function compressorAfterLoss(compressor: number, lost: number, helmBars: number): number;
  // sim/duel/state.ts: DuelState.thrMille, rcsGas, rcsAcc, compressor, helmBars, helmVent;
  //   createDuel(layout, seed, helmPlayer?, crew?, cls?, opts: { helmBars?: number } = {})
  // sim/duel/modules.ts: HELM fields throttle, holdHeading, thrMille, rcsGas, rcsAcc, compressor;
  //   DUEL_NOT_SNAPSHOTTED.helmBars, .helmVent
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/helmModule.test.ts`:

```ts
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §4, §5, §7): the helm module's new fields, the duel
// option helmBars, the round-start split, the pure crew-Helm rules (ramp, cap and floor, compressor, losing bars), and the
// fields in the hash, the flatten order, the snapshot and its bounds.
import { describe, expect, it } from 'vitest';
import { hashF64 } from '../src/shared/hash';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { flattenDuel, hashDuel } from '../src/renderer/src/sim/duel/hash';
import { compress, compressorAfterLoss, compressorMax, crewThrust, engineBars, heldAxis, noVent, rampThrottle, rampTicks, throttleCap, throttleFloor, vents } from '../src/renderer/src/sim/duel/helmFlight';
import { DUEL_MODULES, DUEL_NOT_SNAPSHOTTED } from '../src/renderer/src/sim/duel/modules';
import { moduleLength, type SimModule } from '../src/renderer/src/sim/module';
import { loadDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { COMPRESSOR_RATE, HELM_BARS, RCS_GAS_PER_TICK, RCS_TANK, THR_MAX, THR_MIN, THR_RAMP, THR_RETURN } from '../src/renderer/src/sim/duel/tuning';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The flattened offset of helm.throttle: after SIM_VERSION and every module before helm. */
function helmOffset(d: DuelState): number {
  let at = 1;
  for (const { module, state } of DUEL_MODULES) { if (module.id === 'helm') return at; at += moduleLength(module as SimModule<unknown>, state(d)); }
  throw new Error('no helm module');
}

describe('the numbers (spec §3, §4, §5)', () => {
  it('are the spec\'s start values', () => {
    expect([THR_MIN, THR_MAX, THR_RAMP, THR_RETURN, RCS_TANK, RCS_GAS_PER_TICK, HELM_BARS]).toEqual([-250, 1000, 7, 34, 1000, 8, 4]);
    expect(COMPRESSOR_RATE).toEqual([0, 50, 100, 150]);
  });
});

describe('a fresh duel (spec §4, §5)', () => {
  it('starts at throttle 0 with a full tank, no remainder, compressor 1 of 4 bars and nothing vented', () => {
    const d = createDuel(CUTTER, 5);
    try {
      expect([d.thrMille, d.rcsGas, d.rcsAcc, d.compressor, d.helmBars, engineBars(d)]).toEqual([0, RCS_TANK, 0, 1, 4, 3]);
      expect(d.helmVent).toEqual({ x: 0, y: 0, boosted: false });
    } finally { disposeDuel(d); }
  });
  it('takes helmBars 0..5 as a duel option; the start split is min(1, helmBars); anything else throws', () => {
    for (const [bars, compressor] of [[0, 0], [1, 1], [3, 1], [5, 1]] as const) {
      const d = createDuel(CUTTER, 5, 0, 2, undefined, { helmBars: bars });
      try { expect([d.helmBars, d.compressor]).toEqual([bars, compressor]); } finally { disposeDuel(d); }
    }
    for (const bad of [-1, 6, 1.5, Number.NaN]) expect(() => createDuel(CUTTER, 5, 0, 2, undefined, { helmBars: bad }), String(bad)).toThrow(/invalid duel helm bars/);
  });
  it('a rematch carries helmBars into the next round, with a fresh helm', () => {
    const d = createSeatedDuel(CUTTER, 5, 0, 2, undefined, { helmBars: 2 });
    try {
      Object.assign(d, { thrMille: 500, rcsGas: 10, rcsAcc: 7, compressor: 0 });
      d.tactical.outcome = Outcome.CrewWins; d.decidedTick = d.interior.tick;
      stepDuelTick(d, { held: [NONE, NONE], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'rematch' } }] });
      expect(d.round).toBe(1);
      expect([d.helmBars, d.compressor, d.thrMille, d.rcsGas, d.rcsAcc]).toEqual([2, 1, 0, RCS_TANK, 0]);
    } finally { disposeDuel(d); }
  });
});

describe('the pure rules (spec §3, §4, §5)', () => {
  it('crewThrust is a quarter per 250 in reverse and a thousandth per mille forward', () => {
    expect([-250, -125, 0, 250, 500, 1000].map(crewThrust)).toEqual([-1, -0.5, 0, 0.25, 0.5, 1]);
  });
  it('heldAxis reads 1 and −1, and anything else as 0', () => {
    expect([1, -1, 0, undefined, 2, 0.5, '1', true].map(heldAxis)).toEqual([1, -1, 0, 0, 0, 0, 0, 0]);
  });
  it('the cap is min(ENGINE, 4) × 250 and the floor −250 from ENGINE 1; the compressor tops out at min(3, bars)', () => {
    expect([0, 1, 2, 3, 4, 5].map(throttleCap)).toEqual([0, 250, 500, 750, 1000, 1000]);
    expect([0, 1, 4].map(throttleFloor)).toEqual([0, -250, -250]);
    expect([0, 2, 3, 4, 5].map(compressorMax)).toEqual([0, 2, 3, 3, 3]);
  });
  it('held W reaches 1000 in 143 ticks at cap 1000 and stops at 750 at cap 750; held S reaches −250 in 36', () => {
    expect(rampTicks(0, 1, -250, 1000, 142)).toBe(994); expect(rampTicks(0, 1, -250, 1000, 143)).toBe(1000);
    expect(rampTicks(0, 1, -250, 750, 200)).toBe(750);
    expect(rampTicks(0, -1, -250, 1000, 35)).toBe(-245); expect(rampTicks(0, -1, -250, 1000, 36)).toBe(-250); expect(rampTicks(0, -1, -250, 1000, 99)).toBe(-250);
  });
  it('let go, it returns to 0 by 34 a tick from either side and stops there', () => {
    const down: number[] = [];
    for (let m = 1000, k = 0; k < 31; k++) { m = rampThrottle(m, 0, -250, 1000); down.push(m); }
    expect(down.slice(0, 3)).toEqual([966, 932, 898]); expect(down[28]).toBe(14); expect(down[29]).toBe(0); expect(down[30]).toBe(0);
    expect(down.every((m) => m >= 0)).toBe(true);
    expect(rampTicks(-250, 0, -250, 1000, 7)).toBe(-12); expect(rampTicks(-250, 0, -250, 1000, 8)).toBe(0);
  });
  it('the clamp holds the cap and the floor: ENGINE 0 holds it at 0 whatever is held', () => {
    expect(rampThrottle(1000, 0, -250, 750)).toBe(750);   // a cap that drops clamps the same tick
    expect([rampTicks(0, 1, 0, 0, 10), rampTicks(0, -1, 0, 0, 10)]).toEqual([0, 0]);
  });
  it('the compressor refills an empty tank in exactly 1200, 600 and 400 ticks at 1, 2 and 3 bars, and never at 0', () => {
    for (const [bars, ticks] of [[1, 1200], [2, 600], [3, 400]] as const) {
      let s = { gas: 0, acc: 0 };
      for (let k = 0; k < ticks - 1; k++) s = compress(s.gas, s.acc, bars);
      expect(s.gas, `${bars} bars at ${ticks - 1}`).toBeLessThan(RCS_TANK);
      s = compress(s.gas, s.acc, bars);
      expect([s.gas, s.acc], `${bars} bars at ${ticks}`).toEqual([RCS_TANK, 0]);
      expect(compress(s.gas, s.acc, bars)).toEqual({ gas: RCS_TANK, acc: 0 });   // a full tank holds no remainder
    }
    let z = { gas: 0, acc: 0 };
    for (let k = 0; k < 2000; k++) z = compress(z.gas, z.acc, 0);
    expect(z).toEqual({ gas: 0, acc: 0 });
    expect(compress(990, 50, 3)).toEqual({ gas: 993, acc: 20 });
  });
  it('an axis vents only when held and the tank holds a tick\'s gas', () => {
    expect([vents(1, 8), vents(-1, 1000), vents(0, 1000), vents(1, 7)]).toEqual([true, true, false, false]);
  });
  it('losing bars comes off COMPRESSOR first', () => {
    expect(compressorAfterLoss(2, 1, 3)).toBe(1); expect(compressorAfterLoss(1, 2, 2)).toBe(0); expect(compressorAfterLoss(3, 0, 2)).toBe(2); expect(compressorAfterLoss(3, 0, 5)).toBe(3);
  });
  it('noVent is a fresh unvented record each call', () => {
    const a = noVent(), b = noVent();
    expect(a).toEqual({ x: 0, y: 0, boosted: false }); expect(a).not.toBe(b);
  });
});

describe('the fields in the hash, the flatten and the snapshot (spec §7)', () => {
  it('thrMille, rcsGas, rcsAcc and compressor move the hash; helmBars and helmVent do not', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const base = hashDuel(d);
      for (const [key, value] of [['thrMille', 7], ['rcsGas', 992], ['rcsAcc', 50], ['compressor', 2]] as const) {
        const was = d[key]; d[key] = value;
        expect(hashDuel(d), key).not.toBe(base);
        d[key] = was;
      }
      expect(hashDuel(d)).toBe(base);
      d.helmBars = 3; d.helmVent = { x: 1, y: -1, boosted: true };
      expect(hashDuel(d)).toBe(base);
      expect(Object.keys(DUEL_NOT_SNAPSHOTTED)).toEqual(expect.arrayContaining(['helmBars', 'helmVent']));
    } finally { disposeDuel(d); }
  });
  it('flatten carries the helm module as throttle, holdHeading, thrMille, rcsGas, rcsAcc, compressor', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d, { thrMille: -100, rcsGas: 437, rcsAcc: 17, compressor: 2 });
      const at = helmOffset(d);
      expect(Array.from(flattenDuel(d)).slice(at, at + 6)).toEqual([d.throttle, d.holdHeading, -100, 437, 17, 2]);
    } finally { disposeDuel(d); }
  });
  it('round-trips through the snapshot; a restore takes the default helmBars and no vent', () => {
    const d = createSeatedDuel(CUTTER, 5, 0, 2, undefined, { helmBars: 3 });
    try {
      Object.assign(d, { thrMille: -100, rcsGas: 437, rcsAcc: 17, compressor: 2, helmVent: { x: 1, y: 0, boosted: true } });
      const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST))), DIGEST);
      try {
        expect([r.thrMille, r.rcsGas, r.rcsAcc, r.compressor, r.helmBars, hashDuel(r)]).toEqual([-100, 437, 17, 2, HELM_BARS, hashDuel(d)]);
        expect(r.helmVent).toEqual({ x: 0, y: 0, boosted: false });
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
  it('refuses values out of bounds, even rehashed', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const snap = saveDuelSnapshot(d, DIGEST), at = helmOffset(d);
      for (const [k, bad, name] of [[2, 1001, 'thrMille'], [2, -251, 'thrMille'], [2, 0.5, 'thrMille'], [3, -1, 'rcsGas'], [3, 1001, 'rcsGas'], [4, 60, 'rcsAcc'], [4, -1, 'rcsAcc'], [5, 4, 'compressor'], [5, -1, 'compressor']] as const) {
        const s = structuredClone(snap); s.values[at + k] = bad; s.header.hash = hashF64(Float64Array.from(s.values));
        expect(() => validateDuelSnapshot(CUTTER, s, DIGEST), `${name} ${bad}`).toThrow(new RegExp(`${name} ${bad} is invalid`));
      }
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/helmModule.test.ts`
Expected: FAIL (`Cannot find module '../src/renderer/src/sim/duel/helmFlight'`).

- [ ] **Step 3: The numbers**

Append to `src/renderer/src/sim/duel/tuning.ts`:

```ts

// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §4, §4a, §5): the crew Helm's held throttle, its cold
// gas and its power split, on a newtonianHelm class. Start values, tuned in playtest.
/** §3: the held throttle in per mille, from full reverse (−250) to full forward (1000). */
export const THR_MIN = -250;
export const THR_MAX = 1000;
/** §3: per mille a tick while W or S is held (0 to 1000 in 143 ticks), and toward 0 while neither is (1000 to 0 in 30). */
export const THR_RAMP = 7;
export const THR_RETURN = 34;
/** §4: the cold gas tank, the gas one vented axis spends a tick, and the gas a boosted turn spends a tick (§4a). */
export const RCS_TANK = 1000;
export const RCS_GAS_PER_TICK = 8;
export const RCS_TURN_GAS = 4;
/** §4: the compressor's sixtieths of gas a tick at 0..3 COMPRESSOR bars (an empty tank refills in never, 20, 10, 6.7 s). */
export const COMPRESSOR_RATE: readonly number[] = [0, 50, 100, 150];
export const COMPRESSOR_MAX = 3;
/** §5: the Helm's bar budget (a stand-in until the Engineering spike's Engines bars), and the most a test may set. */
export const HELM_BARS = 4;
export const HELM_BARS_MAX = 5;
/** §4a: sin 6°: auto-face's turn is far (boosted) while its target lies outside this of the nose (about 4.27 indices). */
export const BOOST_FACE_SIN = 0.10452846326765347;
```

- [ ] **Step 4: The pure rules**

Create `src/renderer/src/sim/duel/helmFlight.ts`:

```ts
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §4, §5): the crew Helm's pure rules on a newtonianHelm
// class, shared by the duel step (sim/duel/step.ts), the scripted crew and the app's prediction: the thrust a held
// throttle flies, the ramp and its clamp, the ENGINE cap and floor, the compressor, venting, and losing bars. Integers in
// and out for the state; only + − × ÷.
import type { DuelState } from './state';
import { COMPRESSOR_MAX, COMPRESSOR_RATE, RCS_GAS_PER_TICK, RCS_TANK, THR_MIN, THR_RAMP, THR_RETURN } from './tuning';

/** §4: this tick's vented thruster axes (−1, 0 or 1 each: x port/starboard, y aft/forward) and whether the turn was
 *  gas-boosted. Per-tick scratch on DuelState (helmVent), never hashed or snapshotted. */
export interface HelmVent { x: number; y: number; boosted: boolean }
/** A fresh unvented record (a new object each call). */
export function noVent(): HelmVent { return { x: 0, y: 0, boosted: false }; }

/** §3: the thrust axis a held throttle flies, in −1..1: a quarter of the reverse scale per 250 below 0, a thousandth per
 *  mille above. */
export function crewThrust(m: number): number { return m < 0 ? m / 250 : m / 1000; }

/** A held field (throttleHeld, rcsX, rcsY, §7): 1 or −1 as given; anything else, absent included, is 0. */
export function heldAxis(v: unknown): number { return v === 1 ? 1 : v === -1 ? -1 : 0; }

/** §5: the ENGINE share of the Helm's bars. */
export function engineBars(d: Pick<DuelState, 'helmBars' | 'compressor'>): number { return d.helmBars - d.compressor; }
/** §5: the throttle's cap, min(ENGINE, 4) × 250. */
export function throttleCap(engine: number): number { return Math.min(Math.max(engine, 0), 4) * 250; }
/** §5: the throttle's floor: −250 (reverse) with ENGINE ≥ 1, else 0. */
export function throttleFloor(engine: number): number { return engine >= 1 ? THR_MIN : 0; }
/** §5: the most COMPRESSOR bars a budget allows, min(3, helmBars). */
export function compressorMax(helmBars: number): number { return Math.min(COMPRESSOR_MAX, helmBars); }

/** §3: one tick of the ramp: held 1 (W) adds THR_RAMP, −1 (S) takes it away, 0 returns toward 0 by THR_RETURN and stops
 *  there; then the clamp to [floor, cap]. */
export function rampThrottle(m: number, held: number, floor: number, cap: number): number {
  const next = held > 0 ? m + THR_RAMP : held < 0 ? m - THR_RAMP : m > 0 ? Math.max(0, m - THR_RETURN) : Math.min(0, m + THR_RETURN);
  return Math.max(floor, Math.min(cap, next));
}
/** `ticks` ramp ticks from `m` with one held value (the app's local prediction, §3). */
export function rampTicks(m: number, held: number, floor: number, cap: number, ticks: number): number {
  let out = m;
  for (let k = 0; k < ticks; k++) out = rampThrottle(out, held, floor, cap);
  return out;
}

/** §4: one tick of the compressor at `compressor` bars: the sixtieths add up, the whole units go into the tank, the tank
 *  stops at RCS_TANK, and a full tank holds no remainder. */
export function compress(gas: number, acc: number, compressor: number): { gas: number; acc: number } {
  const a = acc + COMPRESSOR_RATE[compressor]!, g = Math.min(gas + Math.floor(a / 60), RCS_TANK);
  return { gas: g, acc: g === RCS_TANK ? 0 : a % 60 };
}

/** §4: whether an axis held `want` (−1, 0 or 1) vents from a tank holding `gas`: it needs a tick's gas. */
export function vents(want: number, gas: number): boolean { return want !== 0 && gas >= RCS_GAS_PER_TICK; }

/** §5 (after the Engineering spike): the COMPRESSOR share once the budget falls to `helmBars` by `lost` bars. Bars come
 *  off COMPRESSOR first, and ENGINE is what remains. */
export function compressorAfterLoss(compressor: number, lost: number, helmBars: number): number {
  return Math.max(0, Math.min(COMPRESSOR_MAX, compressor - lost, helmBars));
}
```

- [ ] **Step 5: The state and the duel option**

In `src/renderer/src/sim/duel/state.ts`:

(a) Replace `import { DUEL_REPAIR_POINTS } from './tuning';` with:

```ts
import { DUEL_REPAIR_POINTS, HELM_BARS, HELM_BARS_MAX, RCS_TANK } from './tuning';
import { noVent, type HelmVent } from './helmFlight';
```

(b) In `DuelState`, after the `holdHeading: number;` member, insert:

```ts
  /** Playtest2feedback §3, §4, §5 (the helm module): the crew Helm's held throttle in per mille, −250..1000; the cold gas
   *  tank, 0..RCS_TANK, and its compressor's sixtieths, 0..59; the COMPRESSOR share of the Helm's bars, 0..min(3,
   *  helmBars). A fresh duel and every new round: 0, a full tank, 0, min(1, helmBars). A class that is not newtonianHelm
   *  (the Valkyrn) holds them unused. */
  thrMille: number; rcsGas: number; rcsAcc: number; compressor: number;
  /** §5: the Helm's bar budget, a duel option (createDuel's opts.helmBars, default HELM_BARS) carried into the next round;
   *  not state (DUEL_NOT_SNAPSHOTTED). */
  helmBars: number;
  /** §4: this tick's vented thruster axes and boost, per-tick scratch for the puffs and the hiss; not state. */
  helmVent: HelmVent;
```

(c) Replace the `createDuel` signature line

```ts
export function createDuel(layout: ShipLayout, seed: number, helmPlayer = 0, crew: number = DUEL_CREW_MIN, cls?: number): DuelState {
```

with

```ts
export function createDuel(layout: ShipLayout, seed: number, helmPlayer = 0, crew: number = DUEL_CREW_MIN, cls?: number, opts: { helmBars?: number } = {}): DuelState {
  const helmBars = opts.helmBars ?? HELM_BARS;   // playtest2feedback §5: tests set 0..HELM_BARS_MAX; the app and a restore use the default
  if (!Number.isInteger(helmBars) || helmBars < 0 || helmBars > HELM_BARS_MAX) throw new Error(`invalid duel helm bars ${String(helmBars)}`);
```

(d) In its return statement, replace `throttle: 0, holdHeading: -1, crewClass };` with:

```ts
throttle: 0, holdHeading: -1, crewClass,
      thrMille: 0, rcsGas: RCS_TANK, rcsAcc: 0, compressor: Math.min(1, helmBars), helmBars, helmVent: noVent() };   // playtest2feedback §4, §5: 3 + 1 with the stand-in
```

(e) In the `createDuel` doc comment, after `Round 0, beginning on tick 0, the throttle at STOP.` insert ` Playtest2feedback §5: opts.helmBars is the Helm's bar budget (default HELM_BARS); the round starts with compressor min(1, helmBars).`

- [ ] **Step 6: The module, its exclusions, the rounds and the decided tick**

In `src/renderer/src/sim/duel/modules.ts`, replace

```ts
const HELM: ModuleField<DuelState>[] = [
  scalar('throttle', (d) => d.throttle, (d, v) => { d.throttle = v; }),
  scalar('holdHeading', (d) => d.holdHeading, (d, v) => { d.holdHeading = v; })
];
```

with

```ts
const HELM: ModuleField<DuelState>[] = [
  scalar('throttle', (d) => d.throttle, (d, v) => { d.throttle = v; }),
  scalar('holdHeading', (d) => d.holdHeading, (d, v) => { d.holdHeading = v; }),
  // Playtest2feedback §7: the crew Helm's held throttle, the cold gas tank, its compressor's sixtieths, the COMPRESSOR share.
  scalar('thrMille', (d) => d.thrMille, (d, v) => { d.thrMille = v; }),
  scalar('rcsGas', (d) => d.rcsGas, (d, v) => { d.rcsGas = v; }),
  scalar('rcsAcc', (d) => d.rcsAcc, (d, v) => { d.rcsAcc = v; }),
  scalar('compressor', (d) => d.compressor, (d, v) => { d.compressor = v; })
];
```

and in `DUEL_NOT_SNAPSHOTTED`, replace `  events: 'per-tick repair events, cleared every tick'` with:

```ts
  events: 'per-tick repair events, cleared every tick',
  helmBars: 'the Helm\'s bar budget: a duel option fixed per duel, createDuel\'s opts.helmBars (playtest2feedback §5)',
  helmVent: 'per-tick scratch: this tick\'s vented thruster axes and boost, recomputed every running tick (playtest2feedback §4)'
```

In `src/renderer/src/sim/duel/step.ts`:

(a) After `import { createDuel, disposeDuel, type DuelState } from './state';` add `import { noVent } from './helmFlight';`.

(b) In `startRound`, replace

```ts
  const next = createDuel(d.interior.layout, followingSeed(d.tactical.seed), d.helmPlayer, d.interior.playerCount, d.crewClass);   // Valkyrn spec §6.1: the class carries over
```

with

```ts
  const next = createDuel(d.interior.layout, followingSeed(d.tactical.seed), d.helmPlayer, d.interior.playerCount, d.crewClass, { helmBars: d.helmBars });   // Valkyrn spec §6.1: the class carries over; playtest2feedback §5: so does the bar budget
```

(c) In `stepDecided`, replace `  d.events = []; d.tactical.events = [];` with `  d.events = []; d.tactical.events = []; d.helmVent = noVent();   // playtest2feedback §4: the end card vents nothing`.

- [ ] **Step 7: The snapshot's bounds**

In `src/renderer/src/sim/duel/snapshot.ts`:

(a) Replace `import { REPAIR_UNITS } from './tuning';` with `import { COMPRESSOR_MAX, RCS_TANK, REPAIR_UNITS, THR_MAX, THR_MIN } from './tuning';`, and after `import { createDuel, disposeDuel, DUEL_CREW_MAX, LOCAL_CREW_MIN, type DuelState } from './state';` add `import { noVent } from './helmFlight';`.

(b) Replace

```ts
  const space = seed.spaceLength, repairAt = 1 + space + n, roundAt = repairAt + 3, helmAt = roundAt + 4, interiorAt = helmAt + 2;
```

with

```ts
  const space = seed.spaceLength, repairAt = 1 + space + n, roundAt = repairAt + 3, helmAt = roundAt + 4, interiorAt = helmAt + 6;   // playtest2feedback §7: the helm module holds six values
```

(c) After the two lines

```ts
  const holdHeading = values[helmAt + 1]!;
  if (!validHoldHeading(holdHeading)) throw new Error(`duel snapshot held heading ${holdHeading} is invalid`);
```

insert:

```ts
  // Playtest2feedback §7: the crew Helm's held throttle −250..1000, the tank 0..RCS_TANK, its sixtieths 0..59 and the
  // COMPRESSOR share 0..3, each an integer.
  const whole = (v: number, lo: number, hi: number): boolean => Number.isInteger(v) && v >= lo && v <= hi;
  const [thrMille, rcsGas, rcsAcc, compressor] = values.slice(helmAt + 2, interiorAt) as [number, number, number, number];
  if (!whole(thrMille, THR_MIN, THR_MAX)) throw new Error(`duel snapshot thrMille ${thrMille} is invalid`);
  if (!whole(rcsGas, 0, RCS_TANK)) throw new Error(`duel snapshot rcsGas ${rcsGas} is invalid`);
  if (!whole(rcsAcc, 0, 59)) throw new Error(`duel snapshot rcsAcc ${rcsAcc} is invalid`);
  if (!whole(compressor, 0, COMPRESSOR_MAX)) throw new Error(`duel snapshot compressor ${compressor} is invalid`);
```

(d) In `restoreDuelSnapshot`, replace `  d.events = []; d.tactical.events = [];   // not snapshotted: a restore holds no per-tick events, as a fresh load` with:

```ts
  d.events = []; d.tactical.events = []; d.helmVent = noVent();   // not snapshotted: a restore holds no per-tick events or vent, as a fresh load
```

- [ ] **Step 8: The tests the new shapes touch**

(a) In `tests/duelModules.test.ts`, inside `it('flatten is the modules in canonical order …')`, replace `d.throttle, d.holdHeading, ...flatten(d.interior)]);` with `d.throttle, d.holdHeading, d.thrMille, d.rcsGas, d.rcsAcc, d.compressor, ...flatten(d.interior)]);`.

(b) In `tests/duel.test.ts` line 46, in the sorted key list, replace `'holdHeading', 'crewClass'].sort());` with `'holdHeading', 'crewClass', 'thrMille', 'rcsGas', 'rcsAcc', 'compressor', 'helmBars', 'helmVent'].sort());`.

- [ ] **Step 9: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/helmModule.test.ts tests/duelModules.test.ts tests/duel.test.ts tests/duelThrottle.test.ts tests/duelSnapshot.test.ts tests/duelRounds.test.ts tests/duelCheckpoint.test.ts tests/simStateCompleteness.test.ts tests/determinismGuard.test.ts tests/valkyrnFlight.test.ts`
Expected: PASS, apart from tests already in `K`.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/sim/duel/tuning.ts src/renderer/src/sim/duel/helmFlight.ts src/renderer/src/sim/duel/state.ts src/renderer/src/sim/duel/modules.ts src/renderer/src/sim/duel/snapshot.ts src/renderer/src/sim/duel/step.ts tests/helmModule.test.ts tests/duelModules.test.ts tests/duel.test.ts
git commit -m "feat(playtest2feedback): the helm module's thrMille, rcsGas, rcsAcc and compressor (hashed, snapshotted, bounded), the helmBars duel option and the helmVent scratch, and the pure crew-Helm rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The three held fields on the wire, in both checkpoints, and in the authority's expiry and pause

**Files:**
- Modify: `src/renderer/src/net/contracts.ts:36`, `src/renderer/src/net/codec.ts:151`, `src/renderer/src/authority/checkpoint.ts:40`, `src/renderer/src/authority/duelCheckpoint.ts:73`, `src/renderer/src/authority/core.ts` (`expireHeld`, the pause clear)
- Create: `tests/helmWire.test.ts`

**Interfaces:**
- Consumes: Task 3 (`d.thrMille`, which the expiry test reads; its ramp lands in Task 5, see Step 6).
- Produces: `HeldInput.throttleHeld?`, `HeldInput.rcsX?`, `HeldInput.rcsY?`: each an integer −1..1, absent 0.

- [ ] **Step 1: Write the failing test**

Create `tests/helmWire.test.ts`:

```ts
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §7): the three held fields on the codec, in the sector and
// duel checkpoints and the replay, optional, integers −1..1; the authority expires a held frame that holds only one of
// them, and a pause deletes all three.
import { describe, expect, it } from 'vitest';
import { validateCheckpoint } from '../src/renderer/src/authority/checkpoint';
import { validateDuelCheckpoint, type DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { parseEncounterReplay } from '../src/renderer/src/authority/replay';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { REMOTE_HELD_TIMEOUT_MS } from '../src/renderer/src/net/receivePolicy';
import { DUEL_CREW_MAX } from '../src/renderer/src/sim/duel/state';
import { sitDown } from '../src/renderer/src/sim/stations';
import { checkpointRig } from './helpers/checkpointRig';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { liveDuel } from './helpers/liveDuel';
import { LAYOUT } from './helpers/sim';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const frame = (held: Record<string, unknown>) => ({ kind: 'held', frame: { runId: 'r', player: 0, tick: 0, sequence: 1, held: { ...NONE, ...held } } });
const TIMEOUT_TICKS = Math.ceil(REMOTE_HELD_TIMEOUT_MS / (1000 / 60));

describe('the held fields on the codec (spec §7)', () => {
  it('carry throttleHeld, rcsX and rcsY as −1, 0 or 1, each optional; anything else is refused', () => {
    const codec = duelCodec(DUEL_CREW_MAX), ok = frame({ throttleHeld: 1, rcsX: -1, rcsY: 0 });
    expect(codec.decodeMessage(raw(ok))).toEqual(ok);
    expect(codec.decodeMessage(raw(frame({})))).toEqual(frame({}));
    for (const bad of [{ throttleHeld: 2 }, { rcsX: -2 }, { rcsY: 0.5 }, { throttleHeld: '1' }, { rcsX: true }])
      expect(() => codec.decodeMessage(raw(frame(bad))), JSON.stringify(bad)).toThrow();
  });
});

describe('the held fields in the checkpoints and the replay (spec §7)', () => {
  it('ride the duel authority\'s held frames into its checkpoint and replay, and the checkpoint refuses a bad one', () => {
    const live = liveDuel(duelInit(5, 'rcs-wire'));
    live.held(0, { ...NONE, throttleHeld: -1, rcsX: 1, rcsY: -1 });
    live.tick(2);
    const cp = JSON.parse(JSON.stringify(live.core.captureCheckpoint())) as DuelCheckpoint;
    expect(cp.held[0]).toEqual({ ...NONE, throttleHeld: -1, rcsX: 1, rcsY: -1 });
    expect(() => validateDuelCheckpoint(cp, DIGEST, resolveCutter)).not.toThrow();
    for (const bad of [{ throttleHeld: 2 }, { rcsX: 0.5 }, { rcsY: -3 }]) expect(() => validateDuelCheckpoint({ ...cp, held: [{ ...NONE, ...bad }, cp.held[1]!] }, DIGEST, resolveCutter), JSON.stringify(bad)).toThrow();
    const replay = JSON.parse(JSON.stringify(live.core.replay())) as unknown;
    expect(() => parseEncounterReplay(duelRules, replay, DIGEST, resolveCutter)).not.toThrow();
    expect(JSON.stringify(replay)).toContain('"rcsX":1');
  });
  it('are optional in the sector checkpoint, and refused there out of range', () => {
    const h = checkpointRig(), cp = JSON.parse(JSON.stringify(h.authority.checkpoint([])));
    cp.held[0] = { ...NONE, throttleHeld: 1, rcsX: -1, rcsY: 1 };
    expect(() => validateCheckpoint(LAYOUT, cp, DIGEST)).not.toThrow();
    cp.held[0] = { ...NONE, rcsY: 2 };
    expect(() => validateCheckpoint(LAYOUT, cp, DIGEST)).toThrow();
  });
});

describe('the authority clears them (spec §7)', () => {
  const helmDuel = (runId: string) => liveDuel(duelInit(5, runId), (s) => { sitDown(s.duel.interior, 0, s.duel.nav); });
  const heldOf = (l: ReturnType<typeof helmDuel>) => (JSON.parse(JSON.stringify(l.core.captureCheckpoint())) as DuelCheckpoint).held[0]!;
  it('an expired held frame holding only throttleHeld is expired, and the throttle returns to 0', () => {
    const l = helmDuel('thr-expire');
    l.held(0, { ...NONE, throttleHeld: 1 }); l.tick();
    expect(heldOf(l)).toMatchObject({ throttleHeld: 1 });
    l.tick(TIMEOUT_TICKS + 2);
    expect(heldOf(l).throttleHeld).toBeUndefined();
    expect(l.state.duel.thrMille).toBeLessThanOrEqual(7 * (TIMEOUT_TICKS + 3));   // a stale W adds at most a timeout's ramp
    l.tick(10);
    expect(l.state.duel.thrMille).toBe(0);
  });
  it('an expired frame holding only rcsX or only rcsY is expired too', () => {
    for (const held of [{ rcsX: -1 }, { rcsY: 1 }]) {
      const l = helmDuel(`rcs-expire-${held.rcsX ?? 0}-${held.rcsY ?? 0}`);
      l.held(0, { ...NONE, ...held }); l.tick();
      l.tick(TIMEOUT_TICKS + 2);
      const h = heldOf(l);
      expect([h.rcsX, h.rcsY], JSON.stringify(held)).toEqual([undefined, undefined]);
    }
  });
  it('a pause deletes all three', () => {
    const l = helmDuel('rcs-pause');
    l.held(0, { ...NONE, throttleHeld: 1, rcsX: 1, rcsY: -1 }); l.tick();
    l.command(0, { kind: 'setPaused', paused: true }); l.tick();
    expect(l.core.captureCheckpoint().phase).toBe('paused');
    const h = heldOf(l);
    expect(['throttleHeld' in h, 'rcsX' in h, 'rcsY' in h]).toEqual([false, false, false]);
  });
});
```

The first test in the last describe reads the ramp, which Task 5 adds. This task runs every other test in the file, and Task 5 Step 10 runs the whole file.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/helmWire.test.ts -t "codec|checkpoints|pause|only rcsY"`
Expected: FAIL (the codec and both checkpoints refuse the unknown keys).

- [ ] **Step 3: The type**

In `src/renderer/src/net/contracts.ts`, replace

```ts
export interface HeldInput { moveX: number; moveY: number; interactHeld: boolean; face?: boolean; aim?: number; gunHeld?: boolean }
```

with

```ts
/** Playtest2feedback §7: `throttleHeld` (1 W, −1 S), `rcsX` (−1 port, 1 starboard) and `rcsY` (−1 aft, 1 forward) are the
 *  crew Helm's held throttle and thrusters, each an integer −1..1; absent means 0. */
export interface HeldInput { moveX: number; moveY: number; interactHeld: boolean; face?: boolean; aim?: number; gunHeld?: boolean; throttleHeld?: number; rcsX?: number; rcsY?: number }
```

- [ ] **Step 4: The three schemas**

In `src/renderer/src/net/codec.ts`, replace

```ts
const held = z.object({ moveX: axis, moveY: axis, interactHeld: z.boolean(), face: z.boolean().optional(), aim: z.number().int().min(-1).max(255).optional(), gunHeld: z.boolean().optional() }).strict();   // face: Feel-i's auto-face; aim, gunHeld: Valkyrn spec §6.2, §7.1
```

with

```ts
const heldAxis = z.number().int().min(-1).max(1).optional();   // playtest2feedback §7: absent means 0
const held = z.object({ moveX: axis, moveY: axis, interactHeld: z.boolean(), face: z.boolean().optional(), aim: z.number().int().min(-1).max(255).optional(), gunHeld: z.boolean().optional(),
  throttleHeld: heldAxis, rcsX: heldAxis, rcsY: heldAxis }).strict();   // face: Feel-i's auto-face; aim, gunHeld: Valkyrn spec §6.2, §7.1; the crew Helm's throttle and thrusters: playtest2feedback §7
```

In `src/renderer/src/authority/checkpoint.ts`, replace

```ts
  held: z.array(z.object({ moveX: z.number().finite().min(-1).max(1), moveY: z.number().finite().min(-1).max(1), interactHeld: z.boolean(), face: z.boolean().optional(), aim: z.number().int().min(-1).max(255).optional(), gunHeld: z.boolean().optional() }).strict()).min(1).max(MAX_PLAYERS)
```

with

```ts
  held: z.array(z.object({ moveX: z.number().finite().min(-1).max(1), moveY: z.number().finite().min(-1).max(1), interactHeld: z.boolean(), face: z.boolean().optional(), aim: z.number().int().min(-1).max(255).optional(), gunHeld: z.boolean().optional(),
    throttleHeld: z.number().int().min(-1).max(1).optional(), rcsX: z.number().int().min(-1).max(1).optional(), rcsY: z.number().int().min(-1).max(1).optional() }).strict()).min(1).max(MAX_PLAYERS)   // playtest2feedback §7
```

In `src/renderer/src/authority/duelCheckpoint.ts`, replace

```ts
const held = z.object({ moveX: z.number().finite().min(-1).max(1), moveY: z.number().finite().min(-1).max(1), interactHeld: z.boolean(), face: z.boolean().optional(), aim: z.number().int().min(-1).max(255).optional(), gunHeld: z.boolean().optional() }).strict();
```

with

```ts
const held = z.object({ moveX: z.number().finite().min(-1).max(1), moveY: z.number().finite().min(-1).max(1), interactHeld: z.boolean(), face: z.boolean().optional(), aim: z.number().int().min(-1).max(255).optional(), gunHeld: z.boolean().optional(),
  throttleHeld: z.number().int().min(-1).max(1).optional(), rcsX: z.number().int().min(-1).max(1).optional(), rcsY: z.number().int().min(-1).max(1).optional() }).strict();   // playtest2feedback §7
```

- [ ] **Step 5: The authority's expiry and pause**

In `src/renderer/src/authority/core.ts`:

(a) Replace

```ts
      if (held[p]!.moveX !== 0 || held[p]!.moveY !== 0 || held[p]!.interactHeld || held[p]!.face === true || held[p]!.gunHeld === true || held[p]!.aim !== undefined) expired.push(p);   // Valkyrn spec §6.2: an expired aim clears
```

with

```ts
      const h = held[p]!;   // Valkyrn spec §6.2: an expired aim clears; playtest2feedback §7: so does a held throttle or thruster
      if (h.moveX !== 0 || h.moveY !== 0 || h.interactHeld || h.face === true || h.gunHeld === true || h.aim !== undefined || (h.throttleHeld ?? 0) !== 0 || (h.rcsX ?? 0) !== 0 || (h.rcsY ?? 0) !== 0) expired.push(p);
```

(b) Replace

```ts
    if (paused) held.forEach((h) => { h.moveX = 0; h.moveY = 0; h.interactHeld = false; delete h.face; delete h.aim; delete h.gunHeld; });   // Valkyrn spec §6.2: a pause clears the aim and the trigger
```

with

```ts
    if (paused) held.forEach((h) => { h.moveX = 0; h.moveY = 0; h.interactHeld = false; delete h.face; delete h.aim; delete h.gunHeld; delete h.throttleHeld; delete h.rcsX; delete h.rcsY; });   // Valkyrn spec §6.2: a pause clears the aim and the trigger; playtest2feedback §7: and the throttle and thrusters
```

- [ ] **Step 6: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/helmWire.test.ts -t "codec|checkpoints|pause|only rcsY"`, then `npx vitest run tests/valkyrnFlight.test.ts tests/checkpointV2.test.ts tests/duelCheckpoint.test.ts tests/onlineNeutralization.test.ts tests/authority.test.ts tests/replayV3.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/authority/checkpoint.ts src/renderer/src/authority/duelCheckpoint.ts src/renderer/src/authority/core.ts tests/helmWire.test.ts
git commit -m "feat(playtest2feedback): throttleHeld, rcsX and rcsY held fields on the codec and both checkpoints; the authority expires and pauses them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The held throttle, the unattended crew Helm, `helmPower`, and `throttle` refused for the crew

**Files:**
- Modify: `src/renderer/src/net/contracts.ts` (`DuelCommand`), `src/renderer/src/net/codec.ts` (`duelWire.commands`), `src/renderer/src/sim/duel/modules.ts` (`helmModule`), `src/renderer/src/sim/duel/step.ts`, `src/renderer/src/sim/duel/scripted.ts`
- Create: `tests/crewThrottle.test.ts`
- Modify (tests): `tests/duelModules.test.ts`, `tests/duelThrottle.test.ts`, `tests/duelScripted.test.ts`, and the `it` blocks Step 8 lists

**Interfaces:**
- Consumes: Task 3 (`helmFlight.ts`, the state), Task 4 (`HeldInput.throttleHeld`).
- Produces:
  ```ts
  // net/contracts.ts: DuelCommand gains | { kind: 'helmPower'; delta: 1 | -1 }
  // sim/duel/step.ts: crewHelm(d, h | null, crew) (module-private); DUEL_KINDS gains 'helmPower'
  // helmModule.commands = ['throttle', 'heading', 'helmPower']; helmModule.reasons = ['invalid-seat', 'malformed', 'stale-tick', 'unavailable']
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/crewThrottle.test.ts`:

```ts
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §5, §7, §8): the crew Helm's held throttle in the duel
// step (the ramp, the cap and floor from the ENGINE share, the clamp on the tick a bar moves, the unattended return), the
// helmPower command and its admission, and the throttle command refused for a newtonianHelm class but not the Valkyrn.
import { describe, expect, it } from 'vitest';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { helmModule } from '../src/renderer/src/sim/duel/modules';
import { disposeDuel, DUEL_CREW_MAX, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const W: HeldInput = { ...NONE, throttleHeld: 1 }, S: HeldInput = { ...NONE, throttleHeld: -1 };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]) => stepDuelTick(d, { held, commands });
const hold = (d: DuelState, h: HeldInput, ticks: number): number[] => { const out: number[] = []; for (let k = 0; k < ticks; k++) { step(d, [], [h, NONE]); out.push(d.thrMille); } return out; };
const power = (delta: number): DuelCommand => ({ kind: 'helmPower', delta } as DuelCommand);
const statuses = (r: ReturnType<typeof stepDuelTick>) => r.map((x) => (x.status === 'rejected' ? x.reason : x.status));

describe('the held throttle (spec §3, §5, §8)', () => {
  it('with compressor 0 (cap 1000) held W reaches 1000 in 143 ticks; from the round start (cap 750) it stops at 750', () => {
    const d = createSeatedDuel(CUTTER, 5), e = createSeatedDuel(CUTTER, 5);
    try {
      d.compressor = 0;
      const up = hold(d, W, 143);
      expect([up[0], up[141], up[142]]).toEqual([7, 994, 1000]);
      expect(hold(e, W, 200).at(-1)).toBe(750);
    } finally { disposeDuel(d); disposeDuel(e); }
  });
  it('held S reaches −250; let go, it returns to 0 at 34 a tick with no overshoot', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      expect(hold(d, S, 36).at(-1)).toBe(-250);
      d.compressor = 0; hold(d, W, 200);
      const down = hold(d, NONE, 31);
      expect([down[0], down[28], down[29], down[30]]).toEqual([966, 14, 0, 0]);
      expect(down.every((m) => m >= 0)).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('moving a bar off ENGINE clamps thrMille that same tick', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.compressor = 0; hold(d, W, 143);
      expect(d.thrMille).toBe(1000);
      expect(statuses(step(d, [cmd(d, 0, power(-1))], [W, NONE]))).toEqual(['applied']);
      expect([d.compressor, d.thrMille]).toEqual([1, 750]);
    } finally { disposeDuel(d); }
  });
  it('HELM_BARS 3 with compressor 3 is ENGINE 0: the floor and the cap are 0', () => {
    const d = createSeatedDuel(CUTTER, 5, 0, 2, undefined, { helmBars: 3 });
    try {
      d.compressor = 3;
      expect([hold(d, W, 20).at(-1), hold(d, S, 20).at(-1)]).toEqual([0, 0]);
    } finally { disposeDuel(d); }
  });
  it('only the Helm attendant\'s throttleHeld counts: Weapons holding W changes nothing', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try { for (let k = 0; k < 20; k++) step(d, [], [NONE, W]); expect(d.thrMille).toBe(0); } finally { disposeDuel(d); }
  });
});

describe('the unattended crew Helm (spec §3)', () => {
  it('returns to 0; a Helm that stands at 1000 thrusts down the 30-tick return and turns onto its held heading', () => {
    const d = createSeatedDuel(CUTTER, 5), twin = createSeatedDuel(CUTTER, 5);
    try {
      for (const x of [d, twin]) { x.compressor = 0; hold(x, W, 143); }
      for (const x of [d, twin]) expect(statuses(step(x, [cmd(x, 0, { kind: 'heading', heading: 64 })], [W, NONE]))).toEqual(['applied']);
      twin.thrMille = 0;   // the twin stands with its throttle already at 0
      for (const x of [d, twin]) expect(statuses(step(x, [cmd(x, 0, { kind: 'stand' })]))).toEqual(['applied']);
      expect([d.thrMille, twin.thrMille]).toEqual([966, 0]);
      expect([d.tactical.ships[0].vx, d.tactical.ships[0].vy]).not.toEqual([twin.tactical.ships[0].vx, twin.tactical.ships[0].vy]);   // it thrust while standing
      const down = hold(d, NONE, 29);
      expect([down[27], down[28]]).toEqual([14, 0]);
      for (let k = 0; k < 120; k++) step(d);
      const diff = ((64 - d.tactical.ships[0].heading + 384) % 256) - 128;
      expect(Math.abs(diff)).toBeLessThanOrEqual(4);
    } finally { disposeDuel(d); disposeDuel(twin); }
  });
});

describe('the throttle command (spec §3)', () => {
  it('is refused unavailable for the crew Helm, after the stale and seat checks; it still works for the Valkyrn', () => {
    const d = createSeatedDuel(CUTTER, 5), v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      const r = step(d, [cmd(d, 0, { kind: 'throttle', level: 2 }, d.interior.tick + 1), cmd(d, 0, { kind: 'throttle', level: 2 }), cmd(d, 0, { kind: 'throttle', level: 9 }), cmd(d, 1, { kind: 'throttle', level: 2 })]);
      expect(statuses(r)).toEqual(['stale-tick', 'unavailable', 'unavailable', 'invalid-seat']);   // sorted by player, then sequence
      expect(d.throttle).toBe(0);
      expect(statuses(step(v, [cmd(v, 0, { kind: 'throttle', level: 2 })]))).toEqual(['applied']);
      expect(v.throttle).toBe(2);
    } finally { disposeDuel(d); disposeDuel(v); }
  });
});

describe('helmPower (spec §5, §7)', () => {
  it('the helm module owns it and its unavailable reason', () => {
    expect([helmModule.commands, helmModule.reasons]).toEqual([['throttle', 'heading', 'helmPower'], ['invalid-seat', 'malformed', 'stale-tick', 'unavailable']]);
  });
  it('starts at 3 + 1; +1 moves a bar to ENGINE and −1 to COMPRESSOR; refused at both ends of the range', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      expect([d.helmBars - d.compressor, d.compressor]).toEqual([3, 1]);
      expect(statuses(step(d, [cmd(d, 0, power(1))]))).toEqual(['applied']); expect(d.compressor).toBe(0);
      expect(statuses(step(d, [cmd(d, 0, power(1))]))).toEqual(['unavailable']); expect(d.compressor).toBe(0);
      expect(statuses(step(d, [cmd(d, 0, power(-1)), cmd(d, 0, power(-1)), cmd(d, 0, power(-1))]))).toEqual(['applied', 'applied', 'applied']);   // envelope order within a tick
      expect(d.compressor).toBe(3);
      expect(statuses(step(d, [cmd(d, 0, power(-1))]))).toEqual(['unavailable']); expect(d.compressor).toBe(3);
    } finally { disposeDuel(d); }
  });
  it('the top end is min(3, HELM_BARS)', () => {
    const d = createSeatedDuel(CUTTER, 5, 0, 2, undefined, { helmBars: 2 });
    try {
      expect(statuses(step(d, [cmd(d, 0, power(-1)), cmd(d, 0, power(-1))]))).toEqual(['applied', 'unavailable']);
      expect(d.compressor).toBe(2);
    } finally { disposeDuel(d); }
  });
  it('admits in order: stale-tick, the Helm seat, the class, the delta, then the range', () => {
    const d = createSeatedDuel(CUTTER, 5), v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      expect(statuses(step(d, [cmd(d, 0, power(1), d.interior.tick + 1), cmd(d, 0, power(2)), cmd(d, 1, power(1))]))).toEqual(['stale-tick', 'malformed', 'invalid-seat']);
      expect(d.compressor).toBe(1);
      expect(statuses(step(v, [cmd(v, 0, power(1)), cmd(v, 0, power(2))]))).toEqual(['unavailable', 'unavailable']);   // the Valkyrn has no split
    } finally { disposeDuel(d); disposeDuel(v); }
  });
  it('round-trips the duel codec as delta 1 or −1 only', () => {
    const codec = duelCodec(DUEL_CREW_MAX), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const delta of [1, -1]) expect(codec.decodeMessage(codec.encodeMessage(envelope({ kind: 'helmPower', delta })))).toEqual(envelope({ kind: 'helmPower', delta }));
    for (const bad of [{ kind: 'helmPower' }, { kind: 'helmPower', delta: 2 }, { kind: 'helmPower', delta: 0 }, { kind: 'helmPower', delta: '1' }, { kind: 'helmPower', delta: 1, extra: 1 }])
      expect(() => codec.encodeMessage(envelope(bad)), JSON.stringify(bad)).toThrow();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/crewThrottle.test.ts`
Expected: FAIL (no ramp: `thrMille` stays 0; `helmPower` is `not-in-duel`; the codec refuses `helmPower`).

- [ ] **Step 3: The command on the contract and the codec**

In `src/renderer/src/net/contracts.ts`, in `DuelCommand`, replace

```ts
  | { kind: 'heading'; heading: number }
```

with

```ts
  | { kind: 'heading'; heading: number }
  /** Playtest2feedback §5: move one of the crew Helm's bars: +1 to ENGINE (the COMPRESSOR share falls by 1), −1 to
   *  COMPRESSOR. The codec admits only 1 and −1. */
  | { kind: 'helmPower'; delta: 1 | -1 }
```

In `src/renderer/src/net/codec.ts`, in `duelWire.commands`, replace

```ts
      z.object({ kind: z.literal('heading'), heading: z.number().finite() }).strict(),   // Feel-ii's click-to-heading
```

with

```ts
      z.object({ kind: z.literal('heading'), heading: z.number().finite() }).strict(),   // Feel-ii's click-to-heading
      z.object({ kind: z.literal('helmPower'), delta: z.union([z.literal(1), z.literal(-1)]) }).strict(),   // playtest2feedback §5
```

In `src/renderer/src/sim/duel/modules.ts`, replace

```ts
  commands: ['throttle', 'heading'],
  reasons: ['invalid-seat', 'malformed', 'stale-tick']
};
const HELM: ModuleField<DuelState>[] = [
```

with

```ts
  commands: ['throttle', 'heading', 'helmPower'],   // playtest2feedback §5: the crew Helm's power split
  reasons: ['invalid-seat', 'malformed', 'stale-tick', 'unavailable']   // playtest2feedback §3, §5: throttle and helmPower on the wrong class or out of range
};
const HELM: ModuleField<DuelState>[] = [
```

- [ ] **Step 4: The step: admission**

In `src/renderer/src/sim/duel/step.ts`:

(a) Replace `import { noVent } from './helmFlight';` (Task 3) with:

```ts
import { compressorMax, crewThrust, engineBars, heldAxis, noVent, rampThrottle, throttleCap, throttleFloor } from './helmFlight';
```

(b) Replace

```ts
const DUEL_KINDS = ['sit', 'stand', 'presence', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'missileLaunch', 'rematch', 'throttle', 'heading', 'contactScan', 'designate', 'laserFrequency'];
```

with

```ts
const DUEL_KINDS = ['sit', 'stand', 'presence', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'missileLaunch', 'rematch', 'throttle', 'heading', 'contactScan', 'designate', 'laserFrequency', 'helmPower'];
```

(c) In the throttle loop, replace

```ts
    if (helm < 0 || e.id.player !== helm) { result(e, 'invalid-seat'); continue; }
    if (!validThrottle(level)) { result(e, 'malformed'); continue; }
```

with

```ts
    if (helm < 0 || e.id.player !== helm) { result(e, 'invalid-seat'); continue; }
    if (classOf(d.tactical, 0).newtonianHelm) { result(e, 'unavailable'); continue; }   // playtest2feedback §3: the crew Helm holds its throttle (Decision 6)
    if (!validThrottle(level)) { result(e, 'malformed'); continue; }
```

(d) After the heading loop (the one ending `    d.holdHeading = h; result(e);` and `  }`), insert:

```ts
  // Playtest2feedback §5: the Helm's power split, checked like the heading: stale, the Helm attendant, the class (only a
  // newtonianHelm class splits its bars), the delta (±1; Decision 7), then the range 0..min(3, helmBars) for the
  // COMPRESSOR share. +1 moves a bar to ENGINE. Envelope order holds within a tick.
  for (const e of input.commands) if (e.command.kind === 'helmPower') {
    const delta: number = e.command.delta;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (helm < 0 || e.id.player !== helm) { result(e, 'invalid-seat'); continue; }
    if (!classOf(d.tactical, 0).newtonianHelm) { result(e, 'unavailable'); continue; }
    if (delta !== 1 && delta !== -1) { result(e, 'malformed'); continue; }
    const next = d.compressor - delta;
    if (next < 0 || next > compressorMax(d.helmBars)) { result(e, 'unavailable'); continue; }
    d.compressor = next; result(e);
  }
```

- [ ] **Step 5: The step: the crew Helm's tick**

In `src/renderer/src/sim/duel/step.ts`:

(a) After the `helmTurn` function (it ends `  return d.holdHeading >= 0 ? headingTurn(d.tactical, 0, d.holdHeading) : 0;` and `}`), insert:

```ts
/** Playtest2feedback (spec §3, §5, §7's step order 2, 3 and 7): the crew Helm's tick on a newtonianHelm class, attended
 *  (`h` is the attendant's held input) or not (null). The turn comes from the state before the step. Then the throttle
 *  ramp runs on the attendant's throttleHeld (0 with no attendant), with its clamp to the ENGINE share's floor and cap.
 *  Then the crew's axes: the ship flies attended or not, coasting once the throttle is back at 0, and a held heading still
 *  turns it. Runs only while the round runs (stepDuelTick). */
function crewHelm(d: DuelState, h: HeldInput | null, crew: ShipInput): void {
  const held = h ?? NO_HELD, turn = helmTurn(d, held);
  if (h) {
    if ((Math.sign(h.moveX) || 0) !== 0 || h.face === true) d.holdHeading = -1;
    else if (heldAim(h) >= 0) d.holdHeading = heldAim(h);
  }
  const engine = engineBars(d);
  d.thrMille = rampThrottle(d.thrMille, h ? heldAxis(h.throttleHeld) : 0, throttleFloor(engine), throttleCap(engine));
  crew.helm = true;
  crew.axes = { turn, thrust: crewThrust(d.thrMille) };
}
```

(b) Replace

```ts
  if (helm >= 0) {
    const h = input.held[helm] ?? NO_HELD;
    crew.axes = { turn: helmTurn(d, h), thrust: throttleThrust(d.throttle) };
```

with

```ts
  if (classOf(t, 0).newtonianHelm) crewHelm(d, helm >= 0 ? input.held[helm] ?? NO_HELD : null, crew);   // playtest2feedback §3, §7: attended or not
  else if (helm >= 0) {
    const h = input.held[helm] ?? NO_HELD;
    crew.axes = { turn: helmTurn(d, h), thrust: throttleThrust(d.throttle) };
```

(c) In the comment block just above that `if`, append the line `  // Playtest2feedback §3: a newtonianHelm class runs crewHelm instead, attended or not.`

- [ ] **Step 6: The scripted crew holds the throttle**

In `src/renderer/src/sim/duel/scripted.ts`:

(a) Replace `import { missileOf, Room, targetOf, type Axes } from '../tactical/state';` with `import { classOf, missileOf, Room, targetOf, type Axes } from '../tactical/state';`, and after `import { THROTTLE_MAX, THROTTLE_MIN, throttleThrust } from './throttle';` add `import { crewThrust } from './helmFlight';`.

(b) In `helmAxes`, replace

```ts
  const away = hazardAway(d, { turn: pair.axes.turn, thrust: throttleThrust(d.throttle) });
```

with

```ts
  const away = hazardAway(d, { turn: pair.axes.turn, thrust: classOf(t, 0).newtonianHelm ? crewThrust(d.thrMille) : throttleThrust(d.throttle) });   // playtest2feedback §7: the thrust it flies now
```

(c) In `scriptedInput`, replace

```ts
      // Artemis spec §5.5: the throttle stands for the wanted thrust (1 → 4, 0 → 0, −1 → −1), sent only when it changes.
      const level = axes.thrust > 0 ? THROTTLE_MAX : axes.thrust < 0 ? THROTTLE_MIN : 0;
      if (level !== d.throttle) cmds[pid]!.push({ kind: 'throttle', level });
      held[pid] = axes.face ? { moveX: 0, moveY: 0, interactHeld: false, face: true } : { moveX: axes.turn, moveY: 0, interactHeld: false };
```

with

```ts
      // Artemis spec §5.5: the throttle stands for the wanted thrust (1 → 4, 0 → 0, −1 → −1), sent only when it changes.
      // Playtest2feedback §7 (Decision 8): on a newtonianHelm class it holds W for thrust, S for reverse, neither for 0.
      const crewHelm = classOf(d.tactical, 0).newtonianHelm, thr = Math.sign(axes.thrust) || 0;
      if (!crewHelm) {
        const level = axes.thrust > 0 ? THROTTLE_MAX : axes.thrust < 0 ? THROTTLE_MIN : 0;
        if (level !== d.throttle) cmds[pid]!.push({ kind: 'throttle', level });
      }
      const lever = crewHelm && thr !== 0 ? { throttleHeld: thr } : {};
      held[pid] = axes.face ? { moveX: 0, moveY: 0, interactHeld: false, face: true, ...lever } : { moveX: axes.turn, moveY: 0, interactHeld: false, ...lever };
```

- [ ] **Step 7: The tests the contract touches**

(a) `tests/duelModules.test.ts`, in `it('the modules own the duel\'s command kinds …')`: replace `'designate', 'heading', 'laserCharge',` with `'designate', 'heading', 'helmPower', 'laserCharge',`.

(b) `tests/duelThrottle.test.ts`: replace

```ts
    expect([helmModule.commands, helmModule.reasons]).toEqual([['throttle', 'heading'], ['invalid-seat', 'malformed', 'stale-tick']]);   // Feel-ii adds the held heading
```

with

```ts
    expect([helmModule.commands, helmModule.reasons]).toEqual([['throttle', 'heading', 'helmPower'], ['invalid-seat', 'malformed', 'stale-tick', 'unavailable']]);   // Feel-ii adds the held heading; playtest2feedback the power split
```

- [ ] **Step 8: Old tests of the Valkyrn's throttle move to the Valkyrn class (Decision 17)**

Run: `git grep -n "kind: 'throttle'\|throttle(" -- tests ':!tests/valkyrn*' ':!tests/scriptedPilot.test.ts' ':!tests/crewThrottle.test.ts' ':!tests/helmWire.test.ts'`

The listing is in `tests/duelThrottle.test.ts`, `tests/duel.test.ts`, `tests/duelCheckpoint.test.ts`, `tests/duelScripted.test.ts`, `tests/duelTelemetry.test.ts`, `tests/feelHeading.test.ts`, `tests/feelIiModels.test.ts` and `tests/onlineDuelSession.test.ts`. Apply these edits, and nothing else:

1. **In `tests/duelThrottle.test.ts`:**
   - Add `import { ShipClass } from '../src/renderer/src/sim/tactical/defs';`.
   - Add, after the `throttle` helper, `/** Playtest2feedback Decision 17: the throttle levels are the Valkyrn's; the Cutter holds its throttle. */ const seatedValkyrn = (seed: number): DuelState => createSeatedDuel(CUTTER, seed, 0, 2, ShipClass.Valkyrn);`.
   - Replace every `createSeatedDuel(CUTTER, 5)` and `createSeatedDuel(CUTTER, 1)` in the file with `seatedValkyrn(5)` and `seatedValkyrn(1)`.
   - In `it('round-trips mid-throttle …')`, the `loadDuelSnapshot(CUTTER, …)` call stays as it is. The header carries the class.
2. **In each other listed file:** find every `it` whose body sends `{ kind: 'throttle', … }`, calls a `throttle(…)` helper, or asserts that `d.throttle` flies the ship. Add `, 0, 2, ShipClass.Valkyrn` to that `it`'s `createSeatedDuel(…)` / `createDuel(…)` call. If the call already passes a helm player and a crew, add only the trailing `ShipClass.Valkyrn`. Then add `import { ShipClass } from '../src/renderer/src/sim/tactical/defs';` to the file if it is missing.
   - In `tests/onlineDuelSession.test.ts`, the replica is built by `createSeatedDuel(CUTTER, 7)`. The tests whose subject is the client's throttle prediction (`throttleSent`, the notch keys) build it with `createSeatedDuel(CUTTER, 7, 0, 2, ShipClass.Valkyrn)`.
3. **In `tests/duelScripted.test.ts`:** in the `it` that collects the scripted pair's command kinds (`kinds = new Set<string>()`), delete `'throttle'` from the expected set. The scripted crew holds `throttleHeld` instead (Decision 8). Its comment gains `playtest2feedback: no throttle commands on the Cutter`.

Change no assertion's numbers in this step. A moved number is `K` (Step 9).

- [ ] **Step 9: Run the tests; record `K`, part 2**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/crewThrottle.test.ts tests/helmWire.test.ts tests/helmModule.test.ts tests/crewFlight.test.ts tests/duelThrottle.test.ts tests/duelModules.test.ts tests/valkyrnFlight.test.ts tests/valkyrnRuntime.test.ts tests/scriptedPilot.test.ts`
Expected: PASS, including `tests/helmWire.test.ts`'s expiry-and-ramp test.

Run: `npx vitest run tests/duel*.test.ts tests/feel*.test.ts tests/online*.test.ts tests/sci*.test.ts tests/science*.test.ts`
Expected: PASS except the goldens and `K`. Add each new trajectory-pin failure to `K` by Task 2 Step 10's rule. Any other failure is fixed in this task. That includes a test whose subject is the Valkyrn throttle but that Step 8 missed: it gets Step 8's edit.

- [ ] **Step 10: Commit**

Stage the source files and the new test by name, then every test file Step 8 edited, by name (`git status --short tests` lists them):

```bash
git add src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/sim/duel/modules.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/scripted.ts tests/crewThrottle.test.ts tests/duelModules.test.ts tests/duelThrottle.test.ts
git add <each other test file Step 8 edited>
git commit -m "feat(playtest2feedback): the held throttle ramp and clamp, the unattended crew Helm, helmPower, and the throttle command refused for a newtonianHelm class" -m "Known-red K (part 2): <one line per test added in Step 9, or 'none'>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Cold gas thrusters, the compressor and `helmVent`

**Files:**
- Modify: `src/renderer/src/sim/duel/step.ts` (`crewHelm`)
- Create: `tests/crewThrusters.test.ts`

**Interfaces:**
- Consumes: Task 2 (`Axes.rcsX/rcsY` in `flyShip`), Task 3 (`compress`, `vents`, `noVent`, `RCS_GAS_PER_TICK`), Task 5 (`crewHelm`).
- Produces: `crewHelm` vents `rcsY` then `rcsX`, runs the compressor every running tick, and writes `d.helmVent`. The crew's axes carry `rcsX`, `rcsY` (the vented axes only).

- [ ] **Step 1: Write the failing test**

Create `tests/crewThrusters.test.ts`:

```ts
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §4, §7, §8): the cold gas thrusters in the duel step: the
// ship-relative push at two headings, 8 gas an axis, fore/aft before side, never below 0, the compressor's exact refill
// every running tick attended or not, the thrusters working with the Engines failed, and helmVent as unhashed scratch.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { RCS_TANK } from '../src/renderer/src/sim/duel/tuning';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { DT, RCS_THRUST } from '../src/renderer/src/sim/tactical/tuning';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const step = (d: DuelState, h: HeldInput = NONE, other: HeldInput = NONE) => stepDuelTick(d, { held: [h, other], commands: [] });
/** Two identical seated duels at heading `heading`, still: the second is the no-input twin. */
function pair(heading: number): [DuelState, DuelState] {
  const out = [createSeatedDuel(CUTTER, 5), createSeatedDuel(CUTTER, 5)] as [DuelState, DuelState];
  for (const d of out) Object.assign(d.tactical.ships[0], { heading, headingAcc: 0, vx: 0, vy: 0 });
  return out;
}

describe('the push (spec §4)', () => {
  it('each key pushes the right ship-relative way at two headings', () => {
    for (const heading of [0, 64]) for (const [held, fx, fy] of [[{ rcsY: 1 }, 1, 0], [{ rcsY: -1 }, -1, 0], [{ rcsX: 1 }, 0, 1], [{ rcsX: -1 }, 0, -1]] as const) {
      const [d, twin] = pair(heading);
      try {
        step(d, { ...NONE, ...held }); step(twin);
        const f = [hx(heading), hy(heading)], r = [-hy(heading), hx(heading)];   // the nose and its right
        const ex = (fx * f[0]! + fy * r[0]!) * RCS_THRUST * DT, ey = (fx * f[1]! + fy * r[1]!) * RCS_THRUST * DT;
        expect(d.tactical.ships[0].vx - twin.tactical.ships[0].vx, `${heading} ${JSON.stringify(held)}`).toBeCloseTo(ex, 9);
        expect(d.tactical.ships[0].vy - twin.tactical.ships[0].vy, `${heading} ${JSON.stringify(held)}`).toBeCloseTo(ey, 9);
        expect(d.helmVent).toEqual({ x: held.rcsX ?? 0, y: held.rcsY ?? 0, boosted: false });
      } finally { disposeDuel(d); disposeDuel(twin); }
    }
  });
  it('Engines failed (level 2): the main engine is off and the thrusters still push', () => {
    const [d, twin] = pair(0);
    try {
      for (const x of [d, twin]) x.tactical.systems[0].rooms[Room.Engines] = 2;
      step(d, { ...NONE, rcsY: 1, throttleHeld: 1 }); step(twin, { ...NONE, throttleHeld: 1 });
      expect(d.tactical.ships[0].vy - twin.tactical.ships[0].vy).toBeCloseTo(-RCS_THRUST * DT, 9);
    } finally { disposeDuel(d); disposeDuel(twin); }
  });
});

describe('the gas (spec §4)', () => {
  it('each vented axis costs 8; with 8 gas and both held only rcsY vents; the tank never goes below 0', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.compressor = 0;
      step(d, { ...NONE, rcsY: 1 }); expect(d.rcsGas).toBe(RCS_TANK - 8);
      step(d, { ...NONE, rcsX: -1, rcsY: -1 }); expect(d.rcsGas).toBe(RCS_TANK - 24);
      d.rcsGas = 8;
      step(d, { ...NONE, rcsX: 1, rcsY: 1 });
      expect([d.rcsGas, d.helmVent]).toEqual([0, { x: 0, y: 1, boosted: false }]);
      d.rcsGas = 5;
      for (let k = 0; k < 10; k++) step(d, { ...NONE, rcsX: 1, rcsY: 1 });
      expect([d.rcsGas, d.helmVent]).toEqual([5, { x: 0, y: 0, boosted: false }]);
    } finally { disposeDuel(d); }
  });
  it('only the Helm attendant vents: Weapons holding a thruster spends nothing', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try { d.compressor = 0; step(d, NONE, { ...NONE, rcsX: 1, rcsY: 1 }); expect([d.rcsGas, d.helmVent.x, d.helmVent.y]).toEqual([RCS_TANK, 0, 0]); } finally { disposeDuel(d); }
  });
  it('the compressor refills an empty tank in exactly 1200, 600 and 400 ticks at 1 to 3 bars, attended or not; rcsAcc resets full', () => {
    for (const [bars, ticks] of [[1, 1200], [2, 600], [3, 400]] as const) {
      const d = createSeatedDuel(CUTTER, 5);
      try {
        Object.assign(d, { compressor: bars, rcsGas: 0, rcsAcc: 0 });
        for (let k = 0; k < ticks - 1; k++) step(d);
        expect(d.rcsGas, `${bars} bars at ${ticks - 1}`).toBeLessThan(RCS_TANK);
        step(d);
        expect([d.rcsGas, d.rcsAcc], `${bars} bars`).toEqual([RCS_TANK, 0]);
      } finally { disposeDuel(d); }
    }
    const u = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(u, { compressor: 2, rcsGas: 0, rcsAcc: 0 });
      stepDuelTick(u, { held: [NONE, NONE], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: u.interior.tick, command: { kind: 'stand' } }] });
      for (let k = 1; k < 600; k++) step(u);
      expect(u.rcsGas).toBe(RCS_TANK);   // the compressor runs with the Helm empty
    } finally { disposeDuel(u); }
    const z = createSeatedDuel(CUTTER, 5);
    try { Object.assign(z, { compressor: 0, rcsGas: 0 }); for (let k = 0; k < 600; k++) step(z); expect(z.rcsGas).toBe(0); } finally { disposeDuel(z); }
  });
  it('helmVent is recomputed every tick and never moves the hash', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      step(d, { ...NONE, rcsX: 1 }); expect(d.helmVent.x).toBe(1);
      step(d); expect(d.helmVent).toEqual({ x: 0, y: 0, boosted: false });
      const base = hashDuel(d); d.helmVent = { x: -1, y: 1, boosted: true }; expect(hashDuel(d)).toBe(base);
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/crewThrusters.test.ts`
Expected: FAIL (nothing vents; the gas never moves).

- [ ] **Step 3: The thrusters and the compressor in `crewHelm`**

In `src/renderer/src/sim/duel/step.ts`:

(a) Replace `import { compressorMax, crewThrust, engineBars, heldAxis, noVent, rampThrottle, throttleCap, throttleFloor } from './helmFlight';` with:

```ts
import { compress, compressorMax, crewThrust, engineBars, heldAxis, noVent, rampThrottle, throttleCap, throttleFloor, vents } from './helmFlight';
import { RCS_GAS_PER_TICK, REPAIR_RATE_SOLO, REPAIR_RATE_TEAM, REPAIR_UNITS } from './tuning';
```

and delete the old line `import { REPAIR_RATE_SOLO, REPAIR_RATE_TEAM, REPAIR_UNITS } from './tuning';`.

(b) Replace the whole `crewHelm` function from Task 5 (its doc comment and body) with:

```ts
/** Playtest2feedback (spec §3, §4, §5, §7's step order 2 to 7): the crew Helm's tick on a newtonianHelm class, attended
 *  (`h` is the attendant's held input) or not (null). In order:
 *  - the turn, from the state before the step;
 *  - the throttle ramp on the attendant's throttleHeld (0 with no attendant), clamped to the ENGINE share's floor and cap;
 *  - the fore/aft then the side thruster, each venting a tick's gas when held by the attendant and the tank holds it;
 *  - the compressor, every running tick, attended or not;
 *  - this tick's helmVent;
 *  - the crew's axes, which fly attended or not (coasting once the throttle is back at 0), with a held heading still
 *    turning it.
 *  Runs only while the round runs (stepDuelTick). */
function crewHelm(d: DuelState, h: HeldInput | null, crew: ShipInput): void {
  const held = h ?? NO_HELD, turn = helmTurn(d, held);
  if (h) {
    if ((Math.sign(h.moveX) || 0) !== 0 || h.face === true) d.holdHeading = -1;
    else if (heldAim(h) >= 0) d.holdHeading = heldAim(h);
  }
  const engine = engineBars(d);
  d.thrMille = rampThrottle(d.thrMille, h ? heldAxis(h.throttleHeld) : 0, throttleFloor(engine), throttleCap(engine));
  const rcsY = ventAxis(d, h ? heldAxis(h.rcsY) : 0), rcsX = ventAxis(d, h ? heldAxis(h.rcsX) : 0);   // fore/aft first (§4)
  const c = compress(d.rcsGas, d.rcsAcc, d.compressor); d.rcsGas = c.gas; d.rcsAcc = c.acc;
  d.helmVent = { x: rcsX, y: rcsY, boosted: false };
  crew.helm = true;
  crew.axes = { turn, thrust: crewThrust(d.thrMille), rcsX, rcsY };
}
/** Playtest2feedback §4: an axis held `want` vents when the tank holds a tick's gas; it spends it and returns `want`, else 0. */
function ventAxis(d: DuelState, want: number): number {
  if (!vents(want, d.rcsGas)) return 0;
  d.rcsGas -= RCS_GAS_PER_TICK;
  return want;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/crewThrusters.test.ts tests/crewThrottle.test.ts tests/helmModule.test.ts tests/helmWire.test.ts tests/crewFlight.test.ts tests/valkyrnFlight.test.ts tests/scriptedPilot.test.ts tests/determinismGuard.test.ts`
Expected: PASS. (The scripted crew uses no thrusters, so `K` does not grow. It gains no gas use either, because the compressor only refills a full tank.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/duel/step.ts tests/crewThrusters.test.ts
git commit -m "feat(playtest2feedback): cold gas thrusters (fore/aft before side, 8 gas an axis), the compressor every running tick, and the helmVent scratch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Mouse steering, the gas-boosted turn, `moveX` ignored for the crew, and the scripted crew turning by `aim` or `face`

**Files:**
- Modify: `src/renderer/src/sim/tactical/hunter.ts` (`autoFacePoint`), `src/renderer/src/sim/duel/step.ts` (`helmTurn`, `helmBoost`, `headingDelta`, `crewAxes`, `crewHelm`), `src/renderer/src/sim/duel/helmFlight.ts` (`ventOf`), `src/renderer/src/sim/duel/scripted.ts`
- Create: `tests/crewSteering.test.ts`
- Modify (tests): the `it` blocks Step 7 lists

**Interfaces:**
- Consumes: Task 2 (`Axes.turnBoost`, `RCS_TURN_BOOST`, `BOOST_FAR`), Task 3 (`BOOST_FACE_SIN`, `RCS_TURN_GAS`), Task 6 (`crewHelm`, `ventAxis`).
- Produces:
  ```ts
  // sim/tactical/hunter.ts
  export function autoFacePoint(state: TacticalState, i: number): { x: number; y: number };   // autoFaceTurn's lead vector
  // sim/duel/step.ts
  export function headingDelta(heading: number, target: number): number;   // signed index difference, −128..127
  export function helmBoost(d: DuelState, h: HeldInput): number;          // 1 or RCS_TURN_BOOST
  export function crewAxes(d: DuelState, h: HeldInput, thrMille?: number): Axes;   // the app's prediction
  // helmTurn: moveX turns only a class that is not newtonianHelm
  // sim/duel/helmFlight.ts
  export function ventOf(axes: Axes): HelmVent;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/crewSteering.test.ts`:

```ts
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §4a, §7, §8): mouse steering by the held aim, the aim
// becoming the held heading, moveX ignored on a newtonianHelm class, the gas boost (far only, 4 gas a tick, 2× the step),
// settling without chatter on an aim, a held heading and auto-face, the Valkyrn unchanged, and the scripted crew's aim.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { Seated } from '../src/renderer/src/sim/components';
import { ventOf } from '../src/renderer/src/sim/duel/helmFlight';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { crewAxes, headingDelta, helmBoost, helmTurn, stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { RCS_TANK } from '../src/renderer/src/sim/duel/tuning';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { RCS_TURN_BOOST, TURN_STEPS_PER_TICK } from '../src/renderer/src/sim/tactical/tuning';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const step = (d: DuelState, h: HeldInput = NONE, commands: Parameters<typeof stepDuelTick>[1]['commands'] = []) => stepDuelTick(d, { held: [h, NONE], commands });
const nose = (d: DuelState): number => d.tactical.ships[0].heading + d.tactical.ships[0].headingAcc;
/** A seated crew duel, the crew ship still at (0, 1600) nose north, whose Hunter is parked inactive and still at (dx, dy)
 *  from it, so auto-face has a fixed target. */
function still(dx = 0, dy = -600): DuelState {
  const d = createSeatedDuel(CUTTER, 5);
  Object.assign(d.tactical.ships[0], { x: 0, y: 1600, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(d.tactical.ships[1], { x: dx, y: 1600 + dy, vx: 0, vy: 0, active: false });
  return d;
}
/** Steps with `h` until helmTurn has been 0 for 10 straight ticks; returns the ticks taken (fails past `cap`) and checks the
 *  turn never changes sign once it has started. */
function settle(d: DuelState, h: HeldInput, cap = 400): number {
  let quiet = 0, sign = 0;
  for (let k = 1; k <= cap; k++) {
    const t = helmTurn(d, h);
    if (t !== 0 && sign !== 0) expect(Math.sign(t), `tick ${k}: the turn reversed`).toBe(sign);
    if (t !== 0) sign = Math.sign(t);
    step(d, h);
    quiet = helmTurn(d, h) === 0 ? quiet + 1 : 0;
    if (quiet >= 10) return k;
  }
  throw new Error('never settled');
}

describe('steering by the held aim (spec §4a)', () => {
  it('a held aim turns the crew ship toward it; on release it settles on the last aim, which is the held heading', () => {
    const d = still();
    try {
      for (let k = 0; k < 10; k++) step(d, { ...NONE, aim: 64 });
      expect(d.holdHeading).toBe(64);
      expect(nose(d)).toBeGreaterThan(10);
      settle(d, NONE);
      expect(Math.abs(headingDelta(d.tactical.ships[0].heading, 64))).toBeLessThanOrEqual(2);
    } finally { disposeDuel(d); }
  });
  it('a held moveX does not turn a newtonianHelm class, nor clear its held heading', () => {
    const d = still();
    try {
      step(d, NONE, [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'heading', heading: 0 } }]);
      for (let k = 0; k < 30; k++) step(d, { ...NONE, moveX: 1 });
      expect([d.tactical.ships[0].heading, d.holdHeading]).toEqual([0, 0]);
      expect(helmTurn(d, { ...NONE, moveX: -1 })).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('the Valkyrn is unchanged: its A/D still turn it and its held aim still becomes the held heading', () => {
    const v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      const h0 = v.tactical.ships[0].heading;
      for (let k = 0; k < 10; k++) step(v, { ...NONE, moveX: 1 });
      expect(v.tactical.ships[0].heading).not.toBe(h0);
      step(v, { ...NONE, aim: 40 }); expect(v.holdHeading).toBe(40);
      expect(helmBoost(v, { ...NONE, aim: 200 })).toBe(1);   // no boost on a class that is not newtonianHelm
    } finally { disposeDuel(v); }
  });
});

describe('the gas boost (spec §4a)', () => {
  it('a far turn with gas runs at 2× and spends 4 gas a tick', () => {
    const d = still();
    try {
      d.compressor = 0;
      expect(helmBoost(d, { ...NONE, aim: 100 })).toBe(RCS_TURN_BOOST);
      step(d, { ...NONE, aim: 100 });
      expect(nose(d)).toBeCloseTo(RCS_TURN_BOOST * TURN_STEPS_PER_TICK, 9);
      expect([d.rcsGas, d.helmVent.boosted]).toEqual([RCS_TANK - 4, true]);
    } finally { disposeDuel(d); }
  });
  it('under 4 gas, inside the band, with no turn, or with the Engines failed it runs at 1× and spends nothing', () => {
    const d = still();
    try {
      d.compressor = 0; d.rcsGas = 3;
      step(d, { ...NONE, aim: 100 });
      expect(nose(d)).toBeCloseTo(TURN_STEPS_PER_TICK, 9);
      expect([d.rcsGas, d.helmVent.boosted]).toEqual([3, false]);
      d.rcsGas = RCS_TANK; d.holdHeading = -1;   // the aim above became the held heading: clear it
      const h = d.tactical.ships[0].heading;
      expect(helmBoost(d, { ...NONE, aim: (h + 4) % 256 })).toBe(1);   // |d| = 4 is inside the band
      expect(helmBoost(d, { ...NONE, aim: (h + 5) % 256 })).toBe(RCS_TURN_BOOST);
      expect(helmBoost(d, NONE)).toBe(1);                              // no aim, no held heading: no turn
      d.tactical.systems[0].rooms[Room.Engines] = 2;
      expect(helmBoost(d, { ...NONE, aim: (h + 100) % 256 })).toBe(1);
    } finally { disposeDuel(d); }
  });
  it('a boosted turn settles on an aim, a held heading and the auto-face target without oscillating', () => {
    const a = still(), b = still(), c = still(600, 0);
    try {
      settle(a, { ...NONE, aim: 140 });
      expect(Math.abs(headingDelta(a.tactical.ships[0].heading, 140))).toBeLessThanOrEqual(1);
      step(b, NONE, [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: b.interior.tick, command: { kind: 'heading', heading: 200 } }]);
      settle(b, NONE);
      expect(Math.abs(headingDelta(b.tactical.ships[0].heading, 200))).toBeLessThanOrEqual(2);
      settle(c, { ...NONE, face: true });
      expect(Math.abs(headingDelta(c.tactical.ships[0].heading, 64))).toBeLessThanOrEqual(2);   // the Hunter due east
      expect(a.rcsGas + b.rcsGas + c.rcsGas).toBeLessThan(3 * RCS_TANK);   // the far part was boosted
    } finally { disposeDuel(a); disposeDuel(b); disposeDuel(c); }
  });
});

describe('the app\'s prediction of the axes (spec §6)', () => {
  it('crewAxes flies the held thrust, the held thrusters while the tank holds them, and the boost', () => {
    const d = still();
    try {
      d.thrMille = 500;
      expect(crewAxes(d, { ...NONE, rcsX: 1, rcsY: -1, aim: 100 })).toEqual({ turn: 1, turnBoost: RCS_TURN_BOOST, thrust: 0.5, rcsX: 1, rcsY: -1 });
      d.rcsGas = 12;   // the boost takes 4, the fore/aft 8, nothing left for the side
      expect(crewAxes(d, { ...NONE, rcsX: 1, rcsY: -1, aim: 100 })).toEqual({ turn: 1, turnBoost: RCS_TURN_BOOST, thrust: 0.5, rcsX: 0, rcsY: -1 });
      expect(ventOf(crewAxes(d, { ...NONE, rcsY: 1 }))).toEqual({ x: 0, y: 1, boosted: false });
    } finally { disposeDuel(d); }
  });
});

describe('the scripted crew (spec §4a, §7)', () => {
  it('turns by aim or face, holds the throttle, and never sends moveX, throttle or thruster input', () => {
    const d = createSeatedDuel(CUTTER, 1), pair = createScriptedPair(1);
    try {
      let aims = 0;
      for (let k = 0; k < 1800; k++) {
        const input = scriptedInput(pair, d), atHelm = Seated.station[d.interior.crew[0]!] === d.nav;
        for (const h of input.held) expect([h.rcsX, h.rcsY]).toEqual([undefined, undefined]);
        if (atHelm) expect(input.held[0]!.moveX).toBe(0);   // seated at the Helm it never turns by moveX
        if (input.held[0]?.aim !== undefined) aims++;
        expect(input.commands.some((e) => e.command.kind === 'throttle')).toBe(false);
        stepDuelTick(d, input);
      }
      expect(aims).toBeGreaterThan(0);
    } finally { disposeDuel(d); }
  });
});
```

In the scripted test, a standing bot's `moveX` is its walking stick, so only the seated Helm's is checked to be 0.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/crewSteering.test.ts`
Expected: FAIL (`headingDelta`, `helmBoost`, `crewAxes` and `ventOf` are not exported).

- [ ] **Step 3: Auto-face's lead vector, shared**

In `src/renderer/src/sim/tactical/hunter.ts`, replace

```ts
export function autoFaceTurn(state: TacticalState, i: number): number {
  const me = state.ships[i]!, t = state.ships[state.systems[i]!.target]!;
  return faceTurn(me.heading, t.x - me.x + t.vx * HUNTER_LEAD_S, t.y - me.y + t.vy * HUNTER_LEAD_S);
}
```

with

```ts
export function autoFaceTurn(state: TacticalState, i: number): number {
  const p = autoFacePoint(state, i);
  return faceTurn(state.ships[i]!.heading, p.x, p.y);
}

/** Playtest2feedback §4a: auto-face's target as a vector from ship i: its target's position led by HUNTER_LEAD_S (the
 *  boost's far test reads the same point autoFaceTurn turns to). Pure. */
export function autoFacePoint(state: TacticalState, i: number): { x: number; y: number } {
  const me = state.ships[i]!, t = state.ships[state.systems[i]!.target]!;
  return { x: t.x - me.x + t.vx * HUNTER_LEAD_S, y: t.y - me.y + t.vy * HUNTER_LEAD_S };
}
```

- [ ] **Step 4: The vent of a set of axes**

Append to `src/renderer/src/sim/duel/helmFlight.ts` (and add `import type { Axes } from '../tactical/state';` and `import { RCS_TURN_BOOST } from '../tactical/tuning';` to its imports):

```ts

/** §4, §6: the vent a set of crew axes shows (the puffs and the hiss): its vented axes, and whether its turn is boosted. */
export function ventOf(axes: Axes): HelmVent {
  return { x: axes.rcsX ?? 0, y: axes.rcsY ?? 0, boosted: axes.turnBoost === RCS_TURN_BOOST };
}
```

- [ ] **Step 5: The turn, the boost, the prediction and the crew Helm in the step**

In `src/renderer/src/sim/duel/step.ts`:

(a) Imports. Replace `import { autoFaceTurn, headingTurn } from '../tactical/hunter';` with `import { autoFacePoint, autoFaceTurn, headingTurn } from '../tactical/hunter';`. Replace `import { HEADING_COUNT, SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from '../tactical/tuning';` with `import { BOOST_FAR, HEADING_COUNT, RCS_TURN_BOOST, SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from '../tactical/tuning';`. Replace `import { classOf, CONTACT_MAX_LEVEL, Outcome } from '../tactical/state';` with `import { classOf, CONTACT_MAX_LEVEL, Outcome, Room, type Axes } from '../tactical/state';`. After that line add:

```ts
import { hx, hy } from '../tactical/direction';
import { engineFactor } from '../tactical/physics';
```

Replace `import { RCS_GAS_PER_TICK, REPAIR_RATE_SOLO, REPAIR_RATE_TEAM, REPAIR_UNITS } from './tuning';` with `import { BOOST_FACE_SIN, RCS_GAS_PER_TICK, RCS_TURN_GAS, REPAIR_RATE_SOLO, REPAIR_RATE_TEAM, REPAIR_UNITS } from './tuning';`.

(b) Replace

```ts
export function helmTurn(d: DuelState, h: HeldInput): number {
  if ((Math.sign(h.moveX) || 0) !== 0) return h.moveX;
```

with

```ts
export function helmTurn(d: DuelState, h: HeldInput): number {
  // Playtest2feedback §4a: an authority rule: moveX turns only a class that is not newtonianHelm (the crew's A/D are thrusters).
  if (!classOf(d.tactical, 0).newtonianHelm && (Math.sign(h.moveX) || 0) !== 0) return h.moveX;
```

and in its doc comment replace `A/D, else auto-face's turn,` with `A/D (not on a newtonianHelm class, playtest2feedback §4a), else auto-face's turn,`.

(c) Replace the whole `crewHelm` function from Task 6 (its doc comment and body; keep `ventAxis` after it) with:

```ts
/** Playtest2feedback §4a: the signed heading-index difference from `heading` to `target`, −128..127. */
export function headingDelta(heading: number, target: number): number {
  return ((target - heading + HEADING_COUNT + HEADING_COUNT / 2) % HEADING_COUNT) - HEADING_COUNT / 2;
}

/** Playtest2feedback §4a: the crew turn's boost this tick, RCS_TURN_BOOST or 1. It is boosted on a newtonianHelm class when
 *  all of these hold:
 *  - helmTurn turns;
 *  - the Engines turn the ship at all;
 *  - the tank holds RCS_TURN_GAS;
 *  - the target is far. For the aim or the held heading, far is |headingDelta| > BOOST_FAR. For auto-face, the led target
 *    lies outside BOOST_FACE_SIN of the nose, or behind it.
 *  Both far bands are wider than a boosted step, so the normal step and today's bands finish the turn. Pure, from the state
 *  before the step: the step and the app's prediction both call it. */
export function helmBoost(d: DuelState, h: HeldInput): number {
  const t = d.tactical, cls = classOf(t, 0);
  if (!cls.newtonianHelm || helmTurn(d, h) === 0 || engineFactor(cls, t.systems[0].rooms[Room.Engines]) <= 0 || d.rcsGas < RCS_TURN_GAS) return 1;
  const heading = t.ships[0].heading;
  if (h.face === true) {
    const p = autoFacePoint(t, 0), dist = Math.sqrt(p.x * p.x + p.y * p.y), h0 = hx(heading), h1 = hy(heading);
    const near = h0 * p.x + h1 * p.y > 0 && Math.abs(h0 * p.y - h1 * p.x) <= BOOST_FACE_SIN * dist;
    return near ? 1 : RCS_TURN_BOOST;
  }
  const aim = heldAim(h), target = aim >= 0 ? aim : d.holdHeading;   // helmTurn turns, so one of them is set
  return Math.abs(headingDelta(heading, target)) > BOOST_FAR ? RCS_TURN_BOOST : 1;
}

/** Playtest2feedback §3, §6: the axes the app predicts the crew ship flies, from the state as it stands and a held input:
 *  - the turn and its boost (helmTurn, helmBoost);
 *  - the thrust of `thrMille` (the duel's by default, or the app's local prediction of it);
 *  - the held thrusters that the tank would let vent, the boost's gas first and then fore/aft before side, as the step
 *    spends it.
 *  Pure. */
export function crewAxes(d: DuelState, h: HeldInput, thrMille: number = d.thrMille): Axes {
  const boost = helmBoost(d, h), y = heldAxis(h.rcsY), x = heldAxis(h.rcsX);
  let gas = d.rcsGas - (boost === RCS_TURN_BOOST ? RCS_TURN_GAS : 0);
  const rcsY = vents(y, gas) ? y : 0;
  if (rcsY !== 0) gas -= RCS_GAS_PER_TICK;
  const rcsX = vents(x, gas) ? x : 0;
  return { turn: helmTurn(d, h), turnBoost: boost, thrust: crewThrust(thrMille), rcsX, rcsY };
}

/** Playtest2feedback (spec §3, §4, §4a, §5, §7's step order 2 to 7): the crew Helm's tick on a newtonianHelm class,
 *  attended (`h` is the attendant's held input) or not (null). In order:
 *  - the turn and its boost, from the state before the step;
 *  - a held aim becomes the held heading, and auto-face clears it (moveX never touches it on this class);
 *  - the throttle ramp on the attendant's throttleHeld (0 with no attendant), clamped to the ENGINE share's floor and cap;
 *  - the boost's gas, then the fore/aft and then the side thruster, each venting a tick's gas when the attendant holds it
 *    and the tank holds it;
 *  - the compressor, every running tick, attended or not;
 *  - this tick's helmVent;
 *  - the crew's axes, which fly attended or not.
 *  Runs only while the round runs (stepDuelTick). */
function crewHelm(d: DuelState, h: HeldInput | null, crew: ShipInput): void {
  const held = h ?? NO_HELD, turn = helmTurn(d, held), boost = helmBoost(d, held);
  if (h) {
    if (h.face === true) d.holdHeading = -1;
    else if (heldAim(h) >= 0) d.holdHeading = heldAim(h);
  }
  const engine = engineBars(d);
  d.thrMille = rampThrottle(d.thrMille, h ? heldAxis(h.throttleHeld) : 0, throttleFloor(engine), throttleCap(engine));
  if (boost === RCS_TURN_BOOST) d.rcsGas -= RCS_TURN_GAS;
  const rcsY = ventAxis(d, h ? heldAxis(h.rcsY) : 0), rcsX = ventAxis(d, h ? heldAxis(h.rcsX) : 0);
  const c = compress(d.rcsGas, d.rcsAcc, d.compressor); d.rcsGas = c.gas; d.rcsAcc = c.acc;
  d.helmVent = { x: rcsX, y: rcsY, boosted: boost === RCS_TURN_BOOST };
  crew.helm = true;
  crew.axes = { turn, turnBoost: boost, thrust: crewThrust(d.thrMille), rcsX, rcsY };
}
```

- [ ] **Step 6: The scripted crew steers by `aim` or `face`**

In `src/renderer/src/sim/duel/scripted.ts`:

(a) After `import { predictPath } from '../tactical/predict';` add `import { nearestHeading } from '../tactical/lead';`, and replace `import type { DuelInput } from './step';` with `import { aimTurn, type DuelInput } from './step';`.

(b) Replace the whole `helmAxes` function (its doc comment and body) with:

```ts
/** The Helm's axes (spec §3): avoid, then dodge an inbound torpedo, then line up (a full laser with a target, FTL targeting
 *  spec §3; Feel-i: by holding auto-face, as a player would, so `face` is set and `turn` is the turn it will make), then orbit. The hazard check predicts with the thrust the ship flies
 *  at this tick before any new command (the throttle's, Artemis spec §5.5; the held throttle's, playtest2feedback §7).
 *  Playtest2feedback §4a (Decision 9): every branch but auto-face names its heading as `aim` (the hazard's, the dodge's
 *  and the orbit's, nearest index), and `turn` is the turn that aim flies. */
function helmAxes(pair: ScriptedPair, d: DuelState): Axes & { face?: boolean; aim: number } {
  const t = d.tactical, s = t.ships[0], e = t.ships[targetOf(t, 0)]!;
  const toward = (dx: number, dy: number): Axes & { aim: number } => { const aim = nearestHeading(dx, dy); return { turn: aimTurn(s.heading, aim), thrust: 1, aim }; };
  const away = hazardAway(d, { turn: pair.axes.turn, thrust: classOf(t, 0).newtonianHelm ? crewThrust(d.thrMille) : throttleThrust(d.throttle) });   // playtest2feedback §7: the thrust it flies now
  if (away) return toward(away.x, away.y);
  // Dodge (homing torpedo spec): the enemy's torpedo within EVADE_RANGE, turn the nose square across its line of approach,
  // on the side the ship already moves to, at full thrust.
  const inbound = missileOf(t, targetOf(t, 0));
  if (inbound) {
    const mx = inbound.x - s.x, my = inbound.y - s.y;
    if (mx * mx + my * my <= EVADE_RANGE * EVADE_RANGE) {
      const side = s.vx * -my + s.vy * mx >= 0 ? 1 : -1;
      return toward(-my * side, mx * side);
    }
  }
  const ex = e.x - s.x, ey = e.y - s.y;
  if (laserFull(t, 0) && t.systems[0].laserTargeted && ex * ex + ey * ey <= LASER_RANGE * LASER_RANGE && !inArc(s.heading, ex, ey, LASER_ARC_COS))
    return { turn: autoFaceTurn(t, 0), thrust: 0, face: true, aim: -1 };
  const o = orbitSteer(d, pair.orbitR), aim = nearestHeading(o.dx, o.dy);
  return { turn: aimTurn(s.heading, aim), thrust: o.thrust, aim };
}
```

(c) In `scriptedInput`, replace

```ts
      held[pid] = axes.face ? { moveX: 0, moveY: 0, interactHeld: false, face: true, ...lever } : { moveX: axes.turn, moveY: 0, interactHeld: false, ...lever };
```

with

```ts
      // Playtest2feedback §4a, §7: the crew Helm turns by aim or face, never moveX (the Valkyrn class still turns by moveX).
      held[pid] = axes.face ? { moveX: 0, moveY: 0, interactHeld: false, face: true, ...lever }
        : crewHelm ? { moveX: 0, moveY: 0, interactHeld: false, aim: axes.aim, ...lever } : { moveX: axes.turn, moveY: 0, interactHeld: false, ...lever };
```

(d) `pair.axes = axes;` stays. The stored axes carry the aim's turn, which the next tick's hazard check holds.

- [ ] **Step 7: Old tests of the crew Helm's A/D turn move to the Valkyrn class (Decision 17)**

Run: `git grep -ln "moveX: 1\|moveX: -1\|moveX: -?1 }" -- tests ':!tests/valkyrn*' ':!tests/scriptedPilot.test.ts' ':!tests/crew*.test.ts'`

In each listed file, find every `it` whose subject is the Helm's A/D turning the crew ship, or A/D clearing the held heading. Those `it` blocks pass a held `moveX` while the Helm attendant is seated and then assert a heading, a turn, `holdHeading === -1`, or `heldTurn`/`helmTurn` returning the moveX. Each such `it` builds its duel with `, 0, 2, ShipClass.Valkyrn` as in Task 5 Step 8, and the file gains the `ShipClass` import if it is missing. A `moveX` that walks a standing character is not the Helm's, and is left alone. Change no assertion's numbers.

- [ ] **Step 8: Run the tests; record `K`, part 3**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/crewSteering.test.ts tests/crewThrusters.test.ts tests/crewThrottle.test.ts tests/helmModule.test.ts tests/helmWire.test.ts tests/crewFlight.test.ts tests/feelAutoFace.test.ts tests/hunter*.test.ts tests/valkyrnFlight.test.ts tests/valkyrnRuntime.test.ts tests/scriptedPilot.test.ts tests/determinismGuard.test.ts`
Expected: PASS. (`autoFaceTurn` is unchanged value for value; the Hunter and the Valkyrn did not move.)

Run: `npx vitest run tests/duel*.test.ts tests/feel*.test.ts tests/online*.test.ts tests/sci*.test.ts tests/science*.test.ts`
Expected: PASS except the goldens and `K`. Add new trajectory-pin failures to `K` by Task 2 Step 10's rule. A test that fails because it holds A/D at the crew Helm and expects a turn gets Step 7's edit.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/duel/helmFlight.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/scripted.ts tests/crewSteering.test.ts
git add <each test file Step 7 edited>
git commit -m "feat(playtest2feedback): mouse steering by the held aim, the gas-boosted far turn (helmBoost), moveX ignored for a newtonianHelm class, crewAxes for the app, and the scripted crew steering by aim or face" -m "Known-red K (part 3): <one line per test added in Step 8, or 'none'>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Telemetry's "acted" test, the duel gates tuned back into 3 to 5 minutes, and every `K` test re-pinned

**Files:**
- Modify: `src/renderer/src/sim/duel/telemetry.ts` (the bait's manoeuvre test)
- Modify (tuning, only the knobs Step 4 names): `src/renderer/src/sim/duel/scripted.ts`, `src/renderer/src/sim/tactical/tuning.ts`
- Modify (re-pins): the test files of `K` (from the three commit messages)
- Create: `tests/crewTelemetry.test.ts`

**Interfaces:**
- Consumes: Tasks 2 to 7.
- Produces: a green `tests/duelGates.test.ts` (both describes) and an empty `K`.

- [ ] **Step 1: Write the failing test**

Create `tests/crewTelemetry.test.ts`:

```ts
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, Decision 15): telemetry's bait manoeuvre counts the crew
// Helm acting by a held face or aim, a vented thruster or boost, or a held throttle that is not 0; never by moveX.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createTelemetry, recordTick } from '../src/renderer/src/sim/duel/telemetry';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** One tick with the Helm holding `h`, the Hunter parked 200 u from the crew ship (inside the bait range); the manoeuvre tick. */
function acted(h: HeldInput): number {
  const d = createSeatedDuel(CUTTER, 5), t = createTelemetry(d);
  try {
    const s = d.tactical.ships[0];
    Object.assign(d.tactical.ships[1], { x: s.x + 200, y: s.y, vx: 0, vy: 0 });
    const input = { held: [h, NONE], commands: [] };
    stepDuelTick(d, input); recordTick(t, d, input);
    return t.manoeuvre.tick;
  } finally { disposeDuel(d); }
}

describe('the crew Helm\'s manoeuvre (Decision 15)', () => {
  it('a held throttle, a thruster, an aim or auto-face is a manoeuvre; moveX alone and nothing are not', () => {
    expect([acted({ ...NONE, throttleHeld: 1 }), acted({ ...NONE, rcsX: 1 }), acted({ ...NONE, aim: 100 }), acted({ ...NONE, face: true })]).toEqual([0, 0, 0, 0]);
    expect([acted(NONE), acted({ ...NONE, moveX: 1 })]).toEqual([-1, -1]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/crewTelemetry.test.ts`
Expected: FAIL (a thruster or an aim is not counted, and moveX is).

- [ ] **Step 3: The manoeuvre test**

In `src/renderer/src/sim/duel/telemetry.ts`:

(a) Replace `import type { DuelInput } from './step';` with `import { heldAim, type DuelInput } from './step';`.

(b) Replace

```ts
  if (helm >= 0) {
    const turning = (input.held[helm]?.moveX ?? 0) !== 0;   // Artemis spec §5.3: the Helm turns, or the throttle is not 0
    if ((turning || d.throttle !== 0) && dist(crew.x, crew.y, enemy.x, enemy.y) <= BAIT_RANGE) { m.tick = tick; m.x = enemy.x; m.y = enemy.y; }
  }
```

with

```ts
  if (helm >= 0) {
    // Artemis spec §5.3: the Helm turns, or the throttle is not 0. Playtest2feedback Decision 15: on a newtonianHelm class, a
    // held face or aim, a vented thruster or boost (helmVent), or a held throttle that is not 0.
    const h = input.held[helm], v = d.helmVent;
    const manoeuvre = classOf(tac, 0).newtonianHelm
      ? h?.face === true || (h !== undefined && heldAim(h) >= 0) || v.x !== 0 || v.y !== 0 || v.boosted || d.thrMille !== 0
      : (h?.moveX ?? 0) !== 0 || d.throttle !== 0;
    if (manoeuvre && dist(crew.x, crew.y, enemy.x, enemy.y) <= BAIT_RANGE) { m.tick = tick; m.x = enemy.x; m.y = enemy.y; }
  }
```

Run: `npx vitest run tests/crewTelemetry.test.ts tests/duelTelemetry.test.ts`
Expected: PASS, apart from `K` tests already recorded.

- [ ] **Step 4: Tune the gates**

Run: `npx tsx scripts/duel-telemetry.ts`
Read the summary's four lines. The gate is all of these:
- the median length is 180 to 300 s;
- at least one crew win and one crew loss, and none at the cap;
- every duel has a crew laser release and a missile launch;
- 0 planet-contact ends under 30 s.

If the gate already holds, go to Step 5. Otherwise move one knob at a time, in this order, within these bounds, re-running the tool after each move. Stop at the first setting where the gate holds:

1. `ORBIT_MIN` / `ORBIT_MAX` (`sim/duel/scripted.ts`): 1500 / 2200 within 1400..1700 / 2000..2500, moved together in steps of 50. With no drag, a wider orbit holds the planet off.
2. `SPEED_SLACK` (`sim/duel/scripted.ts`): 8 within 4..24, in steps of 2. The bang-bang orbit has no drag to damp it.
3. `EVADE_RANGE` (`sim/duel/scripted.ts`): 350 within 250..450, in steps of 25.
4. `AVOID_TICKS` / `AVOID_MARGIN` (`sim/duel/scripted.ts`): 90 / 40 within 60..150 / 30..80, in steps of 10.
5. `MISSILE_GAP` (`sim/duel/scripted.ts`): 1500 within 900..2100, in steps of 100.
6. `MAX_SPEED` (`sim/tactical/tuning.ts`): 400 within 300..450, in steps of 25. This is the spec's own start value, so move it only if knobs 1 to 5 cannot pass the gate.

Each moved constant's doc comment gains `playtest2feedback (SIM <N + 1>): <old> → <new> from the gate (median <s> s, <w> wins, <l> losses)`. If no setting inside these bounds holds, stop and report the closest summary instead of widening a bound.

Then run: `npx vitest run tests/duelGates.test.ts`
Expected: PASS, both describes. (The Valkyrn gate never moved: its class flies with drag and its pilot is unchanged.)

- [ ] **Step 5: Re-pin every test in `K`**

`K` is the union of the "Known-red K" lines in the commits of Tasks 2, 5 and 7. For each test in `K`:

1. Run it alone: `npx vitest run <file> -t "<test name>"`. Read the assertion that fails: the pinned number (a seed, a tick, a count or a coordinate) and what it claims.
2. Find the new number by running the same scenario: the same seed, the same scripted pair or held input, the same tick count, read with the same expression. For the common pin "seed S has a missile in flight at tick T" (for example `tests/duelModules.test.ts`'s `played(6, 2808)`), save this probe as `C:\Users\djuar\AppData\Local\Temp\claude\...\scratchpad\probe-missile.ts`, adjusting `seed` and `from`:

   ```ts
   import { createScriptedPair, scriptedInput } from '../../../../../FTLite/.worktrees/playtest2feedback/src/renderer/src/sim/duel/scripted';
   import { stepDuelTick } from '../../../../../FTLite/.worktrees/playtest2feedback/src/renderer/src/sim/duel/step';
   import { seatDuelCrew } from '../../../../../FTLite/.worktrees/playtest2feedback/tests/helpers/duelSeat';
   import { createDuel } from '../../../../../FTLite/.worktrees/playtest2feedback/src/renderer/src/sim/duel/state';
   import { CUTTER } from '../../../../../FTLite/.worktrees/playtest2feedback/tests/helpers/scriptedDuel';
   const seed = 6, from = 2808, d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
   seatDuelCrew(d);
   for (let k = 0; k < 20000; k++) {
     if (k >= from - 2000 && d.tactical.missiles.some((m) => m.active)) { console.log(`seed ${seed}: first tick >= ${from - 2000} with a missile in flight: ${k}`); break; }
     stepDuelTick(d, scriptedInput(pair, d));
   }
   ```

   Run it with `npx tsx <that path>` from the worktree. The relative imports must reach the worktree; adjust the `../` depth to the scratchpad's real path, or copy the probe into the worktree as `scripts/probe-tmp.ts` and delete it before staging. For any other pinned quantity, the probe prints that quantity from the same scenario instead.
3. Replace only the pinned number in the test, never the assertion's form. Append to its comment `playtest2feedback (SIM <N + 1>) moved it from <old>`. If the test's claim holds for no tick of its seed any more (say, the seed never launches), take the nearest seed from 1 to 20 for which it holds (the probe loops the seeds), and say so in the comment.

When `K` is done, run: `npx vitest run tests/duel*.test.ts tests/feel*.test.ts tests/tactical*.test.ts tests/online*.test.ts tests/sci*.test.ts tests/science*.test.ts tests/hunter*.test.ts tests/rock*.test.ts tests/valkyrn*.test.ts tests/scriptedPilot.test.ts tests/crew*.test.ts tests/helm*.test.ts`
Expected: PASS except the three goldens (`tests/duelGolden.test.ts`, `tests/duelRematchGolden.test.ts`, and `tests/golden.test.ts` if it is listed).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/duel/telemetry.ts tests/crewTelemetry.test.ts
git add <each tuning source Step 4 changed> <each test file Step 5 re-pinned>
git commit -m "feat(playtest2feedback): telemetry counts the crew Helm's held throttle, thrusters, aim and face; duel gates tuned back to 3 to 5 minutes; crew-trajectory pins moved" -m "Gate: <the four summary lines from Step 4>" -m "Re-pinned: <one line per K test: file, test, old -> new>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Single player: the crew Helm's keys, mouse steering, `helmPower` presses, NO PRESSURE, and the prediction

**Files:**
- Modify: `src/renderer/src/app/duel/input.ts`, `src/renderer/src/app/duel/flightPointer.ts`, `src/renderer/src/app/duel/runtime.ts`, `src/renderer/src/app/duel/scene.ts`, `src/renderer/src/app/duel/duelMode.ts`, `src/renderer/src/render/duel/situationModel.ts`, `src/renderer/src/render/duel/consoleModel.ts` (`HELM_CONTROLS`, the `thrMille` input)
- Create: `tests/crewHelmClient.test.ts`

**Interfaces:**
- Consumes: Task 4 (`HeldInput` fields), Task 5 (`helmPower`), Task 7 (`crewAxes`, `helmBoost`).
- Produces:
  ```ts
  // app/duel/input.ts
  export const RCS_CODES: { readonly port: readonly string[]; readonly starboard: readonly string[]; readonly fore: readonly string[]; readonly aft: readonly string[] };
  export const POWER_CODES: Readonly<Record<string, 1 | -1>>;   // Digit1 +1, Digit2 −1
  // KeySample gains throttleHeld?, rcsX?, rcsY?, power? ; ConsoleInput gains helmPower?(delta: 1 | -1)
  export function crewHelmHeld(k: Pick<KeySample, 'throttleHeld' | 'rcsX' | 'rcsY'>, steer: number): Pick<HeldInput, 'throttleHeld' | 'rcsX' | 'rcsY' | 'aim'>;
  // app/duel/flightPointer.ts
  export function onHelmMap(p: { x: number; y: number }, contactShown: boolean): boolean;
  export function helmSteer(i: { pointer: { x: number; y: number } | null; ship: { x: number; y: number }; zoom: number; contactShown: boolean }): number | null;
  // app/duel/runtime.ts: DuelRuntimeDeps.steerHeld?(): boolean; DuelRuntime.thrMille(): number
  // app/duel/scene.ts: DuelSceneOptions.leftHeld?(): boolean; DuelViewSource.thrMille?(): number
  // render/duel/situationModel.ts: RefusedControl gains 'thrusters'; refusal(d, 'thrusters') → 'NO PRESSURE' | null
  // render/duel/consoleModel.ts: ConsoleModelInput.thrMille?: number
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/crewHelmClient.test.ts`:

```ts
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §4, §4a, §5, §6): Single player's crew Helm: the keys
// (W/S held, A/D Q/E and the arrows as thrusters, 1 and 2 as power), the held frame (moveX 0, the three fields, the
// steer's aim only while the left button is held), helmPower presses, no throttle commands, the NO PRESSURE and steer
// refusals, the predicted axes, the Helm map's steer bearing, and the state's axes for an unattended crew Helm.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuelKeyboard, crewHelmHeld, emptyPresses, type EventSource, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { helmSteer, onHelmMap } from '../src/renderer/src/app/duel/flightPointer';
import { refusal, stateAxes } from '../src/renderer/src/render/duel/situationModel';
import { crewAxes } from '../src/renderer/src/sim/duel/step';
import { crewThrust } from '../src/renderer/src/sim/duel/helmFlight';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { seatDuelCrew, createSeatedDuel } from './helpers/duelSeat';

const layout = parseShip(cutter);
const TICK_MS = 1000 / 60;
const NONE = { moveX: 0, moveY: 0, interactHeld: false };

function fakeTarget() {
  const fns = new Map<string, ((e: never) => void)[]>();
  const target: EventSource & { fire(type: string, e: object): void } = {
    addEventListener(type: string, fn: (e: never) => void) { fns.set(type, [...(fns.get(type) ?? []), fn]); },
    removeEventListener() {},
    fire(type, e) { for (const f of fns.get(type) ?? []) f(e as never); }
  };
  return target;
}
const key = (code: string) => ({ code, repeat: false, preventDefault() {} });

describe('the crew Helm\'s keys (spec §3, §4, §5)', () => {
  it('W/S hold the throttle; A Q ← and D E → push port and starboard; ↑ ↓ fore and aft; opposite keys cancel; 1 and 2 are power', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t);
    const sample = (codes: string[]): KeySample => { for (const c of codes) t.fire('keydown', key(c)); const s = kb.sample(); for (const c of codes) t.fire('keyup', key(c)); return s; };
    expect([sample(['KeyW']).throttleHeld, sample(['KeyS']).throttleHeld, sample(['KeyW', 'KeyS']).throttleHeld, sample([]).throttleHeld]).toEqual([1, -1, 0, 0]);
    for (const c of ['KeyA', 'KeyQ', 'ArrowLeft']) expect(sample([c]).rcsX, c).toBe(-1);
    for (const c of ['KeyD', 'KeyE', 'ArrowRight']) expect(sample([c]).rcsX, c).toBe(1);
    expect([sample(['KeyA', 'KeyD']).rcsX, sample(['ArrowUp']).rcsY, sample(['ArrowDown']).rcsY, sample(['ArrowUp', 'ArrowDown']).rcsY]).toEqual([0, 1, -1, 0]);
    expect([sample(['Digit1']).power, sample(['Digit2']).power, sample(['Digit1', 'Digit1']).power]).toEqual([1, -1, 1]);   // the same key held twice is one press
    kb.ui.helmPower?.(-1); kb.ui.helmPower?.(-1);
    expect(kb.sample().power).toBe(-2);
    expect(kb.sample().power).toBe(0);
  });
  it('crewHelmHeld leaves every zero field out and sends the steer as aim', () => {
    expect(crewHelmHeld({ throttleHeld: 1, rcsX: -1, rcsY: 0 }, 64)).toEqual({ throttleHeld: 1, rcsX: -1, aim: 64 });
    expect(crewHelmHeld({}, -1)).toEqual({});
  });
});

describe('the Helm map\'s steer (spec §4a)', () => {
  it('is the bearing from the ship to the pointer on the open map, and nothing on the ship or over a console block', () => {
    const ship = { x: 640, y: 360 };
    expect(helmSteer({ pointer: { x: 640, y: 160 }, ship, zoom: 1, contactShown: false })).toBe(0);
    expect(helmSteer({ pointer: { x: 840, y: 360 }, ship, zoom: 1, contactShown: false })).toBe(64);
    expect(helmSteer({ pointer: { x: 642, y: 361 }, ship, zoom: 1, contactShown: false })).toBeNull();
    expect(helmSteer({ pointer: null, ship, zoom: 1, contactShown: false })).toBeNull();
    expect(onHelmMap({ x: 30, y: 700 }, false)).toBe(false);   // the Helm block, bottom left
    expect(onHelmMap({ x: 640, y: 360 }, false)).toBe(true);
  });
});

function fakeTime() {
  let now = 0, seq = 0;
  const tasks: { at: number; seq: number; cb: () => void }[] = [];
  return {
    now: () => now,
    scheduler: { schedule(delay: number, cb: () => void) { const t = { at: now + delay, seq: seq++, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    advance(ms: number) {
      const end = now + ms;
      for (;;) { tasks.sort((a, b) => a.at - b.at || a.seq - b.seq); const t = tasks[0]; if (!t || t.at > end) break; tasks.shift(); now = Math.max(now, t.at); t.cb(); }
      now = end;
    }
  };
}
const idle = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });
function rig() {
  const time = fakeTime();
  let keys = idle(), steer: number | null = null, holding = false;
  const rt = createDuelRuntime({
    now: time.now, scheduler: time.scheduler, seed: 5, viewport: { w: 1280, h: 720 }, layout,
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses(), power: 0 }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    takeSteer: () => { const s = steer; steer = null; return s; }, steerHeld: () => holding
  });
  seatDuelCrew(rt.duel);
  return {
    rt,
    set(k: Partial<KeySample>) { keys = { ...keys, ...k }; },
    steer(h: number | null) { steer = h; }, hold(on: boolean) { holding = on; },
    tick() { time.advance(TICK_MS); rt.frame(1 / 60); }
  };
}

describe('Single player at the crew Helm (spec §3, §4, §4a, §5)', () => {
  it('sends moveX 0 and the three held fields; W/S presses send no throttle command', () => {
    const r = rig();
    r.tick();
    r.set({ moveX: -1, moveY: -1, throttleHeld: 1, rcsX: -1, presses: { ...emptyPresses(), throttleUp: 1 } });
    r.tick(); r.tick();
    expect(r.rt.held()[0]).toMatchObject({ moveX: 0, throttleHeld: 1, rcsX: -1 });
    expect(r.rt.lastResults().length).toBe(0);
    expect(r.rt.duel.thrMille).toBeGreaterThan(0);
    expect(r.rt.thrMille()).toBe(r.rt.duel.thrMille);
    r.rt.dispose();
  });
  it('1 and 2 send helmPower', () => {
    const r = rig();
    r.tick();
    r.set({ power: 1 }); r.tick(); r.tick();
    expect(r.rt.duel.compressor).toBe(0);
    r.set({ power: -2 }); r.tick(); r.tick();
    expect(r.rt.duel.compressor).toBe(2);
    r.rt.dispose();
  });
  it('steers by the held left button only: the steer is the held aim, and let go there is none', () => {
    const r = rig();
    r.tick();
    r.hold(true); r.steer(64); r.tick();
    expect(r.rt.held()[0]!.aim).toBe(64);
    r.tick();
    expect(r.rt.held()[0]!.aim).toBe(64);   // the last bearing holds while the pointer is over a block
    r.hold(false); r.tick(); r.tick();
    expect(r.rt.held()[0]!.aim).toBeUndefined();
    expect(r.rt.duel.holdHeading).toBe(64);   // the sim holds the last aim as the held heading
    r.rt.dispose();
  });
  it('a thruster press with under a tick\'s gas says NO PRESSURE; a steer with the Engines off says ENGINES OFFLINE', () => {
    const r = rig();
    r.tick();
    Object.assign(r.rt.duel, { rcsGas: 0, compressor: 0 });
    r.set({ rcsX: 1 }); r.tick();
    expect(r.rt.takeRefusals()).toContainEqual({ control: 'thrusters', reason: 'NO PRESSURE' });
    r.rt.duel.tactical.systems[0].rooms[Room.Engines] = 2;
    r.hold(true); r.steer(64); r.tick();
    expect(r.rt.takeRefusals()).toContainEqual({ control: 'turn', reason: 'ENGINES OFFLINE' });
    r.rt.dispose();
  });
  it('the predicted axes are the sim\'s crewAxes for the held input', () => {
    const r = rig();
    r.tick();
    r.set({ throttleHeld: 1, rcsY: 1 }); r.tick();
    expect(r.rt.axes()).toEqual(crewAxes(r.rt.duel, r.rt.held()[0]!));
    r.rt.dispose();
  });
});

describe('the duel state alone (spec §3)', () => {
  it('stateAxes flies an unattended crew Helm: the throttle\'s return and the held heading', () => {
    const d = createSeatedDuel(layout, 5);
    try {
      Object.assign(d, { thrMille: 400, holdHeading: 100 });
      expect(stateAxes(d)).toEqual(crewAxes(d, NONE));
      expect(stateAxes(d).thrust).toBe(crewThrust(400));
      expect(refusal(d, 'thrusters')).toBeNull();
      d.rcsGas = 7; expect(refusal(d, 'thrusters')).toBe('NO PRESSURE');
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/crewHelmClient.test.ts`
Expected: FAIL (`crewHelmHeld`, `helmSteer` and `onHelmMap` are not exported; the samples carry no `rcsX`).

- [ ] **Step 3: The keys**

In `src/renderer/src/app/duel/input.ts`:

(a) After `import { clampThrottle, THROTTLE_MAX } from '../../sim/duel/throttle';` add `import type { HeldInput } from '../../net/contracts';`.

(b) After the `PING_CODE` export, insert:

```ts
/** Playtest2feedback §4: the crew Helm's cold gas keys: A, Q and ← push to port, D, E and → to starboard, ↑ forward, ↓ aft. */
export const RCS_CODES = { port: ['KeyA', 'KeyQ', 'ArrowLeft'], starboard: ['KeyD', 'KeyE', 'ArrowRight'], fore: ['ArrowUp'], aft: ['ArrowDown'] } as const;
/** Playtest2feedback §5: 1 moves a Helm bar to ENGINE (helmPower +1), 2 to COMPRESSOR (−1). */
export const POWER_CODES: Readonly<Record<string, 1 | -1>> = { Digit1: 1, Digit2: -1 };
```

(c) In `ConsoleInput`, replace

```ts
  rockLock?(weapon: 'laser' | 'torpedo', rock: number): void }
```

with

```ts
  rockLock?(weapon: 'laser' | 'torpedo', rock: number): void;
  /** Playtest2feedback §5: a HELM POWER cell's click (+1 to ENGINE, −1 to COMPRESSOR); optional so older fakes still fit. */
  helmPower?(delta: 1 | -1): void }
```

(d) In `KeySample`, after the `freqTo` member, insert:

```ts
  /** Playtest2feedback §3, §4: the crew Helm's held throttle (1 W, −1 S, 0 both or neither) and thrusters (rcsX −1 port,
   *  1 starboard; rcsY −1 aft, 1 forward; opposite keys cancel). createDuelKeyboard always sets them. */
  throttleHeld?: number; rcsX?: number; rcsY?: number;
  /** Playtest2feedback §5: the net helmPower presses since the previous sample (1 and 2, and the HELM POWER cells). */
  power?: number;
```

(e) After `helmAxes`, insert:

```ts
/** Playtest2feedback §3, §4, §4a: the crew Helm's held fields from a key sample and the held steer (a heading index, or −1
 *  while the left button is up). A zero field is left out (absent means 0 on the wire). The Valkyrn's mapping is
 *  helmAxes and the throttle notches, unchanged. */
export function crewHelmHeld(k: Pick<KeySample, 'throttleHeld' | 'rcsX' | 'rcsY'>, steer: number): Pick<HeldInput, 'throttleHeld' | 'rcsX' | 'rcsY' | 'aim'> {
  const t = k.throttleHeld ?? 0, x = k.rcsX ?? 0, y = k.rcsY ?? 0;
  return { ...(t !== 0 ? { throttleHeld: t } : {}), ...(x !== 0 ? { rcsX: x } : {}), ...(y !== 0 ? { rcsY: y } : {}), ...(steer >= 0 ? { aim: steer } : {}) };
}
```

(f) In `createDuelKeyboard`:

1. Replace `let presses = emptyPresses(), lockTo: number | null = null,` with `let presses = emptyPresses(), power = 0, lockTo: number | null = null,`.
2. After `    if (!e.repeat && FREQ_CODES[e.code] !== undefined) freqTo = FREQ_CODES[e.code]!;`, add `    if (!e.repeat && !has(e.code) && POWER_CODES[e.code] !== undefined) power += POWER_CODES[e.code]!;   // playtest2feedback §5`.
3. In `clearUi`, replace `throttleTo = null; freqTo = null; };` with `throttleTo = null; freqTo = null; power = 0; };`.
4. In `clear`, replace `presses = emptyPresses(); lockTo = null;` with `presses = emptyPresses(); power = 0; lockTo = null;`.
5. In `consoleInput`, replace `    frequency(freq) { freqTo = freq; }` with:

```ts
    frequency(freq) { freqTo = freq; },
    helmPower(delta) { power += delta; }   // playtest2feedback §5: a HELM POWER cell
```

6. Replace

```ts
      const out: KeySample = { moveX: x / len, moveY: y / len, interactHeld: has(INTERACT_HELD), fireHeld: held.fire, presses, held, lockTo, torpTo, rockTo, throttleTo, freqTo };
      presses = emptyPresses(); lockTo = null; torpTo = null; rockTo = null; throttleTo = null; freqTo = null;
```

with

```ts
      // Playtest2feedback §3, §4: the crew Helm's held throttle and thrusters, each opposite pair cancelling.
      const any = (codes: readonly string[]): number => (codes.some(has) ? 1 : 0);
      const rcsX = any(RCS_CODES.starboard) - any(RCS_CODES.port), rcsY = any(RCS_CODES.fore) - any(RCS_CODES.aft);
      const throttleHeld = (has(MOVE_CODES.up) ? 1 : 0) - (has(MOVE_CODES.down) ? 1 : 0);
      const out: KeySample = { moveX: x / len, moveY: y / len, interactHeld: has(INTERACT_HELD), fireHeld: held.fire, presses, held, lockTo, torpTo, rockTo, throttleTo, freqTo, throttleHeld, rcsX, rcsY, power };
      presses = emptyPresses(); lockTo = null; torpTo = null; rockTo = null; throttleTo = null; freqTo = null; power = 0;
```

- [ ] **Step 4: The Helm map's steer**

Append to `src/renderer/src/app/duel/flightPointer.ts`:

```ts

/** Playtest2feedback §4a: the console blocks over the crew Helm's map: the tab strip, the side column and the Helm block. */
const HELM_BLOCKS: readonly Rect[] = BLOCKS.slice(0, 3);
/** Whether a screen point is on the crew Helm map's open part: on the screen, clear of its blocks, and of the contact window
 *  while it is shown. */
export function onHelmMap(p: Point, contactShown: boolean): boolean {
  if (p.x < 0 || p.y < 0 || p.x >= INTERNAL_W || p.y >= INTERNAL_H) return false;
  if (contactShown && inside(p, CONTACT)) return false;
  return !HELM_BLOCKS.some((r) => inside(p, r));
}
/** Playtest2feedback §4a: the bearing the held left button steers to on the crew Helm's map: from the own ship's drawn
 *  marker to the pointer, or null (send nothing: the last bearing stands) off the open map or on the ship itself. */
export function helmSteer(i: { pointer: Point | null; ship: Point; zoom: number; contactShown: boolean }): number | null {
  const p = i.pointer;
  return p && onHelmMap(p, i.contactShown) && Math.hypot(p.x - i.ship.x, p.y - i.ship.y) > pickRadius(i.zoom) ? headingOf(p.x - i.ship.x, p.y - i.ship.y) : null;
}
```

- [ ] **Step 5: The situation model**

In `src/renderer/src/render/duel/situationModel.ts`:

(a) Replace `import { helmTurn } from '../../sim/duel/step';` with `import { crewAxes, helmTurn } from '../../sim/duel/step';`, and after it add `import { RCS_GAS_PER_TICK } from '../../sim/duel/tuning';`.

(b) In `stateAxes`, replace

```ts
  if (d.tactical.outcome !== Outcome.Running) return NO_AXES;
  const pid = d.interior.stations.occupant[d.nav]!, attended = pid >= 0 && d.present[pid] === true;
```

with

```ts
  if (d.tactical.outcome !== Outcome.Running) return NO_AXES;
  // Playtest2feedback §3: the crew Helm flies attended or not (the throttle's return and the held heading, no thrusters).
  if (classOf(d.tactical, CREW_SLOT).newtonianHelm) return crewAxes(d, { moveX: 0, moveY: 0, interactHeld: false });
  const pid = d.interior.stations.occupant[d.nav]!, attended = pid >= 0 && d.present[pid] === true;
```

(c) Replace `export type RefusedControl = 'fire' | 'launch' | 'turn' | 'auto-face' | 'throttle' | 'heading' | 'laser';` with:

```ts
export type RefusedControl = 'fire' | 'launch' | 'turn' | 'auto-face' | 'throttle' | 'heading' | 'laser' | 'thrusters';   // thrusters: playtest2feedback §4
```

(d) In `refusal`, replace `  return sys.rooms[Room.Engines] >= 2 ? 'ENGINES OFFLINE' : null;` with:

```ts
  if (control === 'thrusters') return d.rcsGas < RCS_GAS_PER_TICK ? 'NO PRESSURE' : null;   // playtest2feedback §4: cold gas is not the Engines
  return sys.rooms[Room.Engines] >= 2 ? 'ENGINES OFFLINE' : null;
```

In `src/renderer/src/render/duel/consoleModel.ts`, replace `const HELM_CONTROLS: readonly RefusedControl[] = ['turn', 'auto-face', 'throttle', 'heading'];` with `const HELM_CONTROLS: readonly RefusedControl[] = ['turn', 'auto-face', 'throttle', 'heading', 'thrusters'];   // playtest2feedback §4: NO PRESSURE shows on the Helm block`. In `ConsoleModelInput`, after the `throttle?: number;` member, insert:

```ts
  /** Playtest2feedback §3, §6: the crew Helm's thrMille to show (Single player the sim's; online the local prediction); the duel's when absent. */
  thrMille?: number;
```


- [ ] **Step 6: The runtime**

In `src/renderer/src/app/duel/runtime.ts`:

(a) Imports. Replace `import { helmTurn, stepDuelTick } from '../../sim/duel/step';` with `import { crewAxes, helmTurn, stepDuelTick } from '../../sim/duel/step';`. Replace `import { accumulateWheel, emptyPresses, frequencyRequest, helmAxes, NO_HELD_FLAGS, throttleRequest, WHEEL_IDLE_MS, type HeldFlags, type KeySample, type PointerSample } from './input';` with `import { accumulateWheel, crewHelmHeld, emptyPresses, frequencyRequest, helmAxes, NO_HELD_FLAGS, throttleRequest, WHEEL_IDLE_MS, type HeldFlags, type KeySample, type PointerSample } from './input';`.

(b) In `DuelRuntimeDeps`, after `  gunHeld?(): boolean;`, insert:

```ts
  /** Playtest2feedback §4a: whether the left button is held on the canvas (the crew Helm steers while it is). */
  steerHeld?(): boolean;
```


(c) In `DuelRuntime`, after `  throttle(): number;`, insert:

```ts
  /** Playtest2feedback §3, §6: the crew Helm's thrMille the console shows (the sim's: Single player steps it locally). */
  thrMille(): number;
```


(d) Replace `const isConsoleCommand = (c: DuelCommand): boolean => isWeaponsCommand(c) || c.kind === 'throttle' || c.kind === 'heading' ||` with `const isConsoleCommand = (c: DuelCommand): boolean => isWeaponsCommand(c) || c.kind === 'throttle' || c.kind === 'heading' || c.kind === 'helmPower' ||`.

(e) Replace `  let shipView = false, steer = -1, gunPrev = false;` with:

```ts
  let shipView = false, steer = -1, gunPrev = false;
  // Playtest2feedback §4, §4a: the crew Helm's left button and thrusters on the last frame (the refusals' press edges).
  let steerPrev = false, rcsPrev = { x: 0, y: 0 };
  const newtonian = (): boolean => classOf(d.tactical, 0).newtonianHelm;
```

and in `newRound`, replace `    shipView = false; steer = -1; gunPrev = false;` with `    shipView = false; steer = -1; gunPrev = false; steerPrev = false; rcsPrev = { x: 0, y: 0 };`.

(f) After the tick, replace

```ts
    sentAxes = ended() ? NO_AXES : helm >= 0 ? { turn: heldTurn(d, held[helm]!), thrust: throttleThrust(d.throttle) }   // Artemis spec §5.3; Feel-i's auto-face
```

with

```ts
    sentAxes = ended() ? NO_AXES : newtonian() ? crewAxes(d, helm >= 0 ? held[helm]! : NEUTRAL)   // playtest2feedback §3, §6: the sim's rule, attended or not
      : helm >= 0 ? { turn: heldTurn(d, held[helm]!), thrust: throttleThrust(d.throttle) }   // Artemis spec §5.3; Feel-i's auto-face
```

(g) In `play`, replace

```ts
    if (seat === 'helm') {
      if (p.camera > 0) snapBack(cameras.helm);
      const level = throttleRequest(throttleBase(), p, k.throttleTo);   // W/S a notch, or a notch click (Artemis spec §5.4)
```

with

```ts
    if (seat === 'helm' && newtonian()) {   // playtest2feedback §3-§5: W/S, the thrusters and the steer go out on the held frame
      if (p.camera > 0) snapBack(cameras.helm);
      if (heading !== null && Number.isInteger(heading) && heading >= -1 && heading < 256 && heading !== headingBase(k.fireHeld)) queue({ kind: 'heading', heading });   // RMB; only auto-face clears the hold
      const power = k.power ?? 0;
      for (let n = 0; n < Math.abs(power); n++) queue({ kind: 'helmPower', delta: power > 0 ? 1 : -1 });   // 1 to ENGINE, 2 to COMPRESSOR
      const off = refusal(d, 'turn'), held = k.held ?? NO_HELD_FLAGS, steering = deps.steerHeld?.() ?? false;
      if (off) {
        if (steering && !steerPrev) refuse('turn', off);   // §4a: the steer, not A/D
        if (held.fire && !prevHeld.fire) refuse('auto-face', off);
        if ((held.up && !prevHeld.up) || (held.down && !prevHeld.down)) refuse('throttle', off);
        if (heading !== null && heading >= 0) refuse('heading', off);
      }
      const rx = k.rcsX ?? 0, ry = k.rcsY ?? 0, gas = refusal(d, 'thrusters');
      if (gas && ((rx !== 0 && rcsPrev.x === 0) || (ry !== 0 && rcsPrev.y === 0))) refuse('thrusters', gas);   // §4: NO PRESSURE
      steerPrev = steering; rcsPrev = { x: rx, y: ry };
      return k;
    }
    if (seat === 'helm') {
      if (p.camera > 0) snapBack(cameras.helm);
      const level = throttleRequest(throttleBase(), p, k.throttleTo);   // W/S a notch, or a notch click (Artemis spec §5.4)
```

(h) In `frame`, replace

```ts
      if (seatNow !== 'flight') steer = -1; else if (steerNow !== null && !shipView) steer = steerNow;   // the last bearing holds over the side tools
```

with

```ts
      // Playtest2feedback §4a: the crew Helm steers only while the left button is held (the last bearing holds over a block);
      // let go, no aim goes out and the sim holds the last one as the held heading.
      const crewHelmNow = seatNow === 'helm' && newtonian(), steering = crewHelmNow && (deps.steerHeld?.() ?? false);
      if (crewHelmNow) steer = steering ? steerNow ?? steer : -1;
      else if (seatNow !== 'flight') steer = -1; else if (steerNow !== null && !shipView) steer = steerNow;   // the last bearing holds over the side tools
```

and replace

```ts
      activeHeld = ended() ? NEUTRAL : { moveX: look ? 0 : Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld,
```

with

```ts
      activeHeld = ended() ? NEUTRAL : { moveX: look || crewHelmNow ? 0 : Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld,   // playtest2feedback §4: A/D are thrusters at the crew Helm
        ...(crewHelmNow ? crewHelmHeld(k, -1) : {}),
```

(i) In the returned object, replace `    throttle: throttleBase,` with:

```ts
    throttle: throttleBase,
    thrMille: () => d.thrMille,
```


- [ ] **Step 7: The scene and the mode**

In `src/renderer/src/app/duel/scene.ts`:

(a) Replace `import { flightPointer } from './flightPointer';` with `import { flightPointer, helmSteer } from './flightPointer';`.

(b) In `DuelViewSource`, after `  throttle(): number;`, insert:

```ts
  /** Playtest2feedback §3, §6: the crew Helm's thrMille to show (online, the local prediction). Absent: the duel's. */
  thrMille?(): number;
```


(c) In `DuelSceneOptions`, after the `takeAim` member, insert:

```ts
  /** Playtest2feedback §4a: whether the left button is held on the canvas (the crew Helm steers while it is). */
  leftHeld?: () => boolean;
```


(d) Replace `      if (contact && click && onMap && station !== 'flight') {   // Valkyrn spec §5.1: on the Flight seat the left button is the gun` with:

```ts
      const crewHelmMap = station === 'helm' && view === 'helm' && classOf(d.tactical, CREW_SLOT).newtonianHelm;   // playtest2feedback §4a
      if (contact && click && onMap && station !== 'flight' && !crewHelmMap) {   // Valkyrn spec §5.1: on the Flight seat the left button is the gun; on the crew Helm it only steers
```

(e) After the Flight seat's pointer block (it ends `        if (f.launch) options.requests?.launch();` and `      }`), insert:

```ts
      // Playtest2feedback §4a: on the crew Helm's map the held left button steers, every frame: the bearing from the own ship's
      // drawn marker to the pointer while it is on the open map and off the ship (else the last bearing stands).
      if (onMap && crewHelmMap && running && !overlay.layerPaused && (options.leftHeld?.() ?? false)) {
        const b = interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT);
        const h = helmSteer({ pointer: options.pointer?.() ?? null, ship: worldToScreen(cam!, viewport, b.x, b.y), zoom: cam!.zoom, contactShown: shown });
        if (h !== null) options.requests?.steer(h);
      }
```

(f) Replace `        seat = sitSeat; sitAt = t; sitThrottle = source.throttle(); acted = false;` with `        seat = sitSeat; sitAt = t; sitThrottle = shownThrottle(); acted = false;`, and replace `aimed !== null || source.throttle() !== sitThrottle)) acted = true;` with `aimed !== null || shownThrottle() !== sitThrottle)) acted = true;`. Immediately after `      const d = source.duel, view = source.view(), alpha = source.alpha(), contact = options.contact;` insert:

```ts
      /** Playtest2feedback §3: the crew Helm's lever is thrMille; the Valkyrn's is its level (Feel-i's sit card reads either). */
      const shownThrottle = (): number => (classOf(d.tactical, CREW_SLOT).newtonianHelm ? source.thrMille?.() ?? d.thrMille : source.throttle());
```

(g) Replace `overlay: overlayView, throttle: source.throttle(), hover,` with `overlay: overlayView, throttle: source.throttle(), thrMille: source.thrMille?.() ?? d.thrMille, hover,`.

In `src/renderer/src/app/duel/duelMode.ts`:

(a) Replace `    takeAim: () => pointer.takeAim(), requests, takePingAt });` with `    takeAim: () => pointer.takeAim(), requests, takePingAt, leftHeld: () => pointer.leftHeld() });   // playtest2feedback §4a`.

(b) Replace `gunHeld: () => pointer.leftHeld(),   // Valkyrn spec §5.1, §8` with `gunHeld: () => pointer.leftHeld(), steerHeld: () => pointer.leftHeld(),   // Valkyrn spec §5.1, §8; playtest2feedback §4a`.

- [ ] **Step 8: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/crewHelmClient.test.ts tests/duelRuntime.test.ts tests/duelInputMerge.test.ts tests/feelIiInput.test.ts tests/feelHeading.test.ts tests/feelIiModels.test.ts tests/flightConsole.test.tsx tests/valkyrnRuntime.test.ts tests/duelConsoleModel.test.ts tests/uiActions.test.ts tests/flightRuntime.test.ts`
Expected: PASS. A test there that holds A/D at the Cutter's Helm through the runtime and expects a turn gets Task 7 Step 7's edit (the Valkyrn class through `createDuelRuntime`'s `cls: ShipClass.Valkyrn`), because its subject is the Valkyrn's A/D.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/app/duel/input.ts src/renderer/src/app/duel/flightPointer.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/scene.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/render/duel/situationModel.ts src/renderer/src/render/duel/consoleModel.ts tests/crewHelmClient.test.ts
git add <each test file Step 8 edited>
git commit -m "feat(playtest2feedback): Single player's crew Helm: held W/S and thruster keys, left-button steering on the Helm map, 1/2 helmPower, NO PRESSURE, and the predicted axes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Online: the held fields, steering and `helmPower` from the session; `thrMille`, the axes and the vent predicted locally

**Files:**
- Modify: `src/renderer/src/app/duel/onlineDuel.ts`, `src/renderer/src/app/duel/onlineSource.ts`
- Create: `tests/crewHelmOnline.test.ts`

**Interfaces:**
- Consumes: Task 3 (`rampTicks`, `engineBars`, `throttleCap`, `throttleFloor`, `heldAxis`, `noVent`), Task 7 (`crewAxes`, `ventOf`), Task 9 (`crewHelmHeld`, `KeySample` fields, `DuelSceneOptions.leftHeld`).
- Produces:
  ```ts
  // app/duel/onlineDuel.ts
  export function sessionHeld(k: KeySample, d: DuelState, me: number, steer: number): HeldInput;
  export const UNACKED_MAX = 30;
  // app/duel/onlineSource.ts: the source gains thrMille(): number, helmVent(): HelmVent, unacked(n: number): void;
  //   sent(held: HeldInput) keeps every field
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/crewHelmOnline.test.ts`:

```ts
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §3, §4, §6, Decisions 11 and 14): the online seat's held
// frame at the crew Helm, and the source's local prediction of thrMille over the unacknowledged held frames, its axes and
// its vent; away from the Helm the replica's own values.
import { describe, expect, it } from 'vitest';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { sessionHeld } from '../src/renderer/src/app/duel/onlineDuel';
import { createOnlineDuelSource } from '../src/renderer/src/app/duel/onlineSource';
import { crewAxes } from '../src/renderer/src/sim/duel/step';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const NONE = { moveX: 0, moveY: 0, interactHeld: false };
const keys = (over: Partial<KeySample>): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses(), ...over });
const source = (d: DuelState, seat: number) => createOnlineDuelSource({ client: { state: () => d, publication: () => ({ publicationSequence: 1, tick: d.interior.tick, phase: 'running' }) }, seat, now: () => 0, viewport: { w: 1280, h: 720 } });

describe('the online held frame (spec §3, §4, §4a)', () => {
  it('at the crew Helm: moveX 0, the three fields and the steer; elsewhere and on the Valkyrn: today\'s frame', () => {
    const d = createSeatedDuel(CUTTER, 5), v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      const k = keys({ moveX: 1, moveY: -1, throttleHeld: 1, rcsX: 1, rcsY: -1, fireHeld: true });
      expect(sessionHeld(k, d, 0, 64)).toEqual({ moveX: 0, moveY: -1, interactHeld: false, face: true, throttleHeld: 1, rcsX: 1, rcsY: -1, aim: 64 });
      expect(sessionHeld(k, d, 0, -1)).not.toHaveProperty('aim');
      expect(sessionHeld(k, d, 1, 64)).toEqual({ moveX: 1, moveY: -1, interactHeld: false });   // Weapons
      expect(sessionHeld(k, v, 0, 64)).toEqual({ moveX: 1, moveY: -1, interactHeld: false, face: true });   // the Valkyrn's Helm
    } finally { disposeDuel(d); disposeDuel(v); }
  });
});

describe('the online source\'s prediction (spec §3, §6)', () => {
  it('shows thrMille plus the local ramp over the unacknowledged frames, capped by the ENGINE share; its axes and vent follow', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.thrMille = 100;
      const s = source(d, 0);
      s.observe();
      s.sent({ ...NONE, throttleHeld: 1 }); s.unacked(5);
      expect(s.thrMille()).toBe(135);
      s.unacked(200);
      expect(s.thrMille()).toBe(750);   // the cap at 3 + 1
      s.unacked(5);
      expect(s.axes()).toEqual(crewAxes(d, { ...NONE, throttleHeld: 1 }, 135));
      s.sent({ ...NONE, rcsX: 1 }); s.unacked(0);
      expect([s.thrMille(), s.helmVent()]).toEqual([100, { x: 1, y: 0, boosted: false }]);
      d.rcsGas = 7;
      expect(s.helmVent()).toEqual({ x: 0, y: 0, boosted: false });
    } finally { disposeDuel(d); }
  });
  it('away from the Helm it shows the replica\'s thrMille and no vent', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.thrMille = 300;
      const s = source(d, 1);
      s.observe(); s.sent({ ...NONE, throttleHeld: 1, rcsX: 1 }); s.unacked(10);
      expect([s.thrMille(), s.helmVent()]).toEqual([300, { x: 0, y: 0, boosted: false }]);
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/crewHelmOnline.test.ts`
Expected: FAIL (`sessionHeld` is not exported; the source has no `thrMille`).

- [ ] **Step 3: The source**

In `src/renderer/src/app/duel/onlineSource.ts`:

(a) After `import { throttleThrust } from '../../sim/duel/throttle';` add:

```ts
import { engineBars, heldAxis, noVent, rampTicks, throttleCap, throttleFloor, ventOf, type HelmVent } from '../../sim/duel/helmFlight';
import { crewAxes } from '../../sim/duel/step';
import { classOf } from '../../sim/tactical/state';
```

(b) Replace `  let uiHeld: HeldFlags = NO_HELD_FLAGS, shownThrottle: number | null = null, refusals: Refusal[] = [];` with:

```ts
  let uiHeld: HeldFlags = NO_HELD_FLAGS, shownThrottle: number | null = null, refusals: Refusal[] = [];
  let unackedFrames = 0;   // playtest2feedback Decision 14: this seat's held frames the replica has not taken yet
  /** Playtest2feedback §3: this seat flies the crew Helm (a newtonianHelm class) in a running round. */
  const crewHelm = (d: DuelState): boolean => seatOf(d, seat) === 'helm' && classOf(d.tactical, 0).newtonianHelm && d.tactical.outcome === Outcome.Running;
```

(c) In the `source` object's type, replace `    observe(): boolean; frame(dt: number, keys: KeySample | null, pointer: PointerSample | null): void; sent(held: { moveX: number; moveY: number; face?: boolean }): void; heldFlags(flags: HeldFlags): void;` with:

```ts
    observe(): boolean; frame(dt: number, keys: KeySample | null, pointer: PointerSample | null): void; sent(held: HeldInput): void; heldFlags(flags: HeldFlags): void;
    thrMille(): number; helmVent(): HelmVent; unacked(n: number): void;
```

(d) Replace

```ts
      return seatOf(d, seat) === 'helm' && d.tactical.outcome === Outcome.Running ? { turn: heldTurn(d, sentHeld), thrust: throttleThrust(d.throttle) } : NO_AXES;
    },
```

with

```ts
      if (crewHelm(d)) return crewAxes(d, sentHeld, source.thrMille());   // playtest2feedback §3, §6: the local prediction
      return seatOf(d, seat) === 'helm' && d.tactical.outcome === Outcome.Running ? { turn: heldTurn(d, sentHeld), thrust: throttleThrust(d.throttle) } : NO_AXES;
    },
    /** Playtest2feedback §3: the crew Helm's thrMille: the replica's plus the ramp this seat's held W/S adds over its
     *  unacknowledged frames (the sim's rule); away from the Helm, the replica's. */
    thrMille: (): number => {
      const d = duel();
      if (!crewHelm(d)) return d.thrMille;
      const e = engineBars(d);
      return rampTicks(d.thrMille, heldAxis(sentHeld.throttleHeld), throttleFloor(e), throttleCap(e), unackedFrames);
    },
    /** Playtest2feedback Decision 11: the puffs and the hiss online: this seat's own predicted vent at the crew Helm, else none. */
    helmVent: (): HelmVent => { const d = duel(); return crewHelm(d) ? ventOf(crewAxes(d, sentHeld)) : noVent(); },
    unacked(n) { unackedFrames = Math.max(0, n); },
```

(e) Replace `    sent(held) { sentHeld = { moveX: held.moveX, moveY: held.moveY, interactHeld: false, ...(held.face ? { face: true } : {}) }; },` with:

```ts
    sent(held) { sentHeld = { ...held, interactHeld: false }; },   // playtest2feedback: the crew Helm's fields and aim too
```

- [ ] **Step 4: The session**

In `src/renderer/src/app/duel/onlineDuel.ts`:

(a) Replace `import { CONTACT_MAX_LEVEL, missileOf } from '../../sim/tactical/state';` with `import { classOf, CONTACT_MAX_LEVEL, missileOf } from '../../sim/tactical/state';`. In the `./input` import list, add `crewHelmHeld,`.

(b) After the `keysOnly` constant, insert:

```ts
/** Playtest2feedback Decision 14: the most unacknowledged held frames the local throttle prediction counts. */
export const UNACKED_MAX = 30;
/** Playtest2feedback §3, §4, §4a: this seat's held frame. At the crew Helm (a newtonianHelm class): moveX 0, the held
 *  throttle and thrusters and the left button's steer (crewHelmHeld). Elsewhere, and on any other class: quantised to −1,
 *  0 and 1 (H-2 spec §3), with Space at the Helm as auto-face (Feel-i). */
export function sessionHeld(k: KeySample, d: DuelState, me: number, steer: number): HeldInput {
  const seat = seatOf(d, me), crewHelm = seat === 'helm' && classOf(d.tactical, 0).newtonianHelm;
  return { moveX: crewHelm ? 0 : Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld,
    ...(k.fireHeld && seat === 'helm' ? { face: true } : {}), ...(crewHelm ? crewHelmHeld(k, steer) : {}) };
}
const heldChanged = (a: HeldInput, b: HeldInput): boolean => a.moveX !== b.moveX || a.moveY !== b.moveY || a.interactHeld !== b.interactHeld || a.face !== b.face
  || a.aim !== b.aim || a.throttleHeld !== b.throttleHeld || a.rcsX !== b.rcsX || a.rcsY !== b.rcsY;
```

(c) Replace `  let lastHeld: HeldInput = { moveX: 0, moveY: 0, interactHeld: false }, lastFlags: HeldFlags = NO_HELD_FLAGS;` with:

```ts
  let lastHeld: HeldInput = { moveX: 0, moveY: 0, interactHeld: false }, lastFlags: HeldFlags = NO_HELD_FLAGS;
  // Playtest2feedback §4, §4a: the crew Helm's held steer, its left button and thrusters on the last pump, and the last held sequence sent.
  let steer = -1, steerPrev = false, rcsPrev = { x: 0, y: 0 }, lastHeldSequence = 0;
```

(d) In `play`, replace

```ts
    if (seat === 'helm') {
      if (p.camera > 0 && source) snapBack(source.cameras.helm);
      const level = throttleRequest(throttleSent ? throttleSent.level : d.throttle, p, k.throttleTo);   // Artemis spec §5.4
```

with

```ts
    if (seat === 'helm' && classOf(d.tactical, 0).newtonianHelm) {   // playtest2feedback §3-§5: the held frame carries the rest
      if (p.camera > 0 && source) snapBack(source.cameras.helm);
      if (k.fireHeld) headingSent = { heading: -1, sequence: null, round: d.round };   // only auto-face clears the hold here
      if (heading !== null && Number.isInteger(heading) && heading >= -1 && heading < 256 && heading !== (headingSent ? headingSent.heading : d.holdHeading)) {
        const id = send({ kind: 'heading', heading }); if (id) headingSent = { heading, sequence: id.sequence, round: d.round };
      }
      const power = k.power ?? 0;
      for (let n = 0; n < Math.abs(power); n++) send({ kind: 'helmPower', delta: power > 0 ? 1 : -1 });
      const off = refusal(d, 'turn'), held = k.held ?? NO_HELD_FLAGS, steering = pointer.leftHeld();
      if (off) {
        if (steering && !steerPrev) source?.refuse('turn', off);
        if (held.fire && !prevHeld.fire) source?.refuse('auto-face', off);
        if ((held.up && !prevHeld.up) || (held.down && !prevHeld.down)) source?.refuse('throttle', off);
        if (heading !== null && heading >= 0) source?.refuse('heading', off);
      }
      const rx = k.rcsX ?? 0, ry = k.rcsY ?? 0, gas = refusal(d, 'thrusters');
      if (gas && ((rx !== 0 && rcsPrev.x === 0) || (ry !== 0 && rcsPrev.y === 0))) source?.refuse('thrusters', gas);
      steerPrev = steering; rcsPrev = { x: rx, y: ry };
      return;
    }
    if (seat === 'helm') {
      if (p.camera > 0 && source) snapBack(source.cameras.helm);
      const level = throttleRequest(throttleSent ? throttleSent.level : d.throttle, p, k.throttleTo);   // Artemis spec §5.4
```

(e) In `pump`, replace

```ts
    const held: HeldInput = { moveX: Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld, ...(k.fireHeld && seatOf(d, me) === 'helm' ? { face: true } : {}) };
    const sequence = client.held(me, decided ? { moveX: 0, moveY: 0, interactHeld: false } : held);
    if (sequence !== null && !decided && (held.moveX !== lastHeld.moveX || held.moveY !== lastHeld.moveY || held.interactHeld !== lastHeld.interactHeld || held.face !== lastHeld.face)) {
```

with

```ts
    // Playtest2feedback §4a: the crew Helm steers by the map's bearing only while the left button is held (Decision 9's rule
    // for the player: let go, no aim goes out and the sim holds the last one).
    const steerNow = requests.takeSteer(), crewHelmSeat = seatOf(d, me) === 'helm' && classOf(d.tactical, 0).newtonianHelm;
    steer = crewHelmSeat && pointer.leftHeld() ? steerNow ?? steer : -1;
    const held: HeldInput = sessionHeld(k, d, me, steer);
    const sequence = client.held(me, decided ? { moveX: 0, moveY: 0, interactHeld: false } : held);
    if (sequence !== null) lastHeldSequence = sequence;
    source?.unacked(Math.min(UNACKED_MAX, Math.max(0, lastHeldSequence - (p.heldHighWater[me] ?? 0))));   // Decision 14
    if (sequence !== null && !decided && heldChanged(held, lastHeld)) {
```

(f) In `attach`, in the `createDuelScene(…)` options, replace `        takeAim: () => { const aim = pointer.takeAim(); return focused && !blocked ? aim : null; }, requests,` with:

```ts
        takeAim: () => { const aim = pointer.takeAim(); return focused && !blocked ? aim : null; }, requests,
        leftHeld: () => focused && !blocked && pointer.leftHeld(),   // playtest2feedback §4a: the crew Helm's steer
```

and in the same function's reset line, replace `throttleSent = null; headingSent = null; attaches++;` with `throttleSent = null; headingSent = null; steer = -1; steerPrev = false; rcsPrev = { x: 0, y: 0 }; lastHeldSequence = 0; attaches++;`.

- [ ] **Step 5: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/crewHelmOnline.test.ts tests/onlineDuelSession.test.ts tests/duelOnlineView.test.ts tests/onlineLifecycle.test.ts tests/onlineInput.test.ts tests/onlineRenderer.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/onlineSource.ts tests/crewHelmOnline.test.ts
git commit -m "feat(playtest2feedback): online crew Helm: held throttle, thrusters and steer on the held frame, helmPower, and thrMille, axes and vent predicted over the unacknowledged frames" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The crew HelmStation (throttle bar, PRESSURE gauge, HELM POWER strip, PORT/STBD), the console model, the controls list, the key hints and the UI probe

**Files:**
- Modify: `src/renderer/src/render/duel/consoleModel.ts`, `src/renderer/src/ui/duel/HelmStation.tsx`, `src/renderer/src/ui/actions.ts`, `src/renderer/src/app/controlsList.ts`, `src/renderer/src/app/uiProbe.ts:21`, `src/renderer/src/render/duel/readoutModel.ts` (`readoutHelp`), `src/renderer/src/render/duel/sitModel.ts:16`, `src/renderer/src/app/duel/scene.ts` (the `readoutHelp` call)
- Create: `tests/crewHelmUi.test.tsx`
- Modify (tests): `tests/settingsAndControls.test.ts`, `tests/feelPresentation.test.ts:201`, `tests/feelUi.test.tsx:68`, `tests/duelConsoleModel.test.ts` (Step 7)

**Interfaces:**
- Consumes: Task 3 (`engineBars`, `throttleCap`, `throttleFloor`, `COMPRESSOR_RATE`, `RCS_TANK`), Task 9 (`ConsoleInput.helmPower`, `ConsoleModelInput.thrMille`, `'thrusters'`).
- Produces:
  ```ts
  // render/duel/consoleModel.ts
  export interface CrewHelmPanel { thrMille: number; cap: number; floor: number; gas: number; compressor: number; bars: number; rate: number }
  export function crewPanel(d: DuelState, thrMille: number): CrewHelmPanel;
  // HelmPanel gains crew?: CrewHelmPanel (only at the crew Helm)
  // render/duel/readoutModel.ts: readoutHelp(mode, crewHelm = false)
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/crewHelmUi.test.tsx`:

```tsx
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §5, §6): the crew Helm's console: the model's readings, the
// throttle bar −25..100 with its ENGINE cap and locked part, the PRESSURE gauge and COMPRESSOR rate, the HELM POWER cells
// (a click switches that bar's side), PORT and STBD holding A and D, NO PRESSURE on the block; the Valkyrn keeps its notches.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { consoleModel, type ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const btn = (name: string) => document.querySelector(`[data-testid="console-${name}"]`) as HTMLElement | null;
const attr = (name: string) => (document.querySelector(`[${name}]`) as HTMLElement | null)?.getAttribute(name) ?? null;
const crew = { thrMille: 300, cap: 750, floor: -250, gas: 80, compressor: 1, bars: 4, rate: 5 };
const helmView = (over: Partial<NonNullable<ConsoleView['helm']>> = {}): ConsoleView => ({
  station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 0, crew, ...over }, weapons: null, science: null, side: { zoom: '0.90', free: true, snapLabel: 'SNAP' } });
const view = (console: ConsoleView): DuelUiView => ({ readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn(), helmPower: vi.fn() };
  ui.actions.setConsole(input);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { duel, input };
}

describe('the console model (spec §5, §6)', () => {
  it('gives the crew Helm its readings: the shown thrMille, the cap and floor from ENGINE, the tank %, the split and the rate', () => {
    const d = createSeatedDuel(CUTTER, 5), v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      d.rcsGas = 437;
      const m = consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, thrMille: 120 });
      expect(m?.helm?.crew).toEqual({ thrMille: 120, cap: 750, floor: -250, gas: 44, compressor: 1, bars: 4, rate: 5 });
      d.compressor = 3;
      expect(consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })?.helm?.crew).toMatchObject({ thrMille: 0, cap: 250, compressor: 3, rate: 15 });
      expect(consoleModel({ duel: v, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })?.helm?.crew).toBeUndefined();
    } finally { disposeDuel(d); disposeDuel(v); }
  });
});

describe('the crew HelmStation (spec §6)', () => {
  it('draws the throttle bar to the shown value with the cap line, the PRESSURE gauge and the HELM POWER strip; no notches', () => {
    const { duel } = mount();
    act(() => duel.frame(view(helmView())));
    expect([attr('data-ui-thr-bar'), attr('data-ui-thr-cap'), attr('data-ui-pressure')]).toEqual(['300', '750', '80']);
    expect(document.querySelector('[data-ui-thr-locked="cap"]')).not.toBeNull();
    for (const t of ['THROTTLE', 'REV', '0', '100', 'PRESSURE', '80%', '+5%/S', 'HELM POWER', 'ENGINE 3  COMPRESS 1']) expect(texts(), t).toContain(t);
    expect(btn('throttle-100')).toBeNull();
    expect(btn('turn-left')).toBeNull();
  });
  it('a HELM POWER cell click switches that bar to the other side; 1 and 2 are the keys (Decision 10)', () => {
    const { duel, input } = mount();
    act(() => duel.frame(view(helmView())));
    fireEvent.pointerDown(btn('power-0')!, { button: 0 });   // an ENGINE cell: to COMPRESSOR
    fireEvent.pointerDown(btn('power-3')!, { button: 0 });   // the COMPRESS cell: to ENGINE
    expect(input.helmPower.mock.calls).toEqual([[-1], [1]]);
  });
  it('PORT and STBD hold A and D; NO PRESSURE shows on the block and flashes them', () => {
    const { duel, input } = mount();
    act(() => duel.frame(view(helmView())));
    fireEvent.pointerDown(btn('rcs-port')!, { button: 0 }); fireEvent.pointerUp(btn('rcs-port')!);
    fireEvent.pointerDown(btn('rcs-stbd')!, { button: 0 });
    expect(input.hold.mock.calls).toEqual([['KeyA', true], ['KeyA', false], ['KeyD', true]]);
    act(() => duel.frame(view(helmView({ refused: { control: 'thrusters', reason: 'NO PRESSURE', flash: true } }))));
    expect(texts()).toContain('NO PRESSURE');
    expect([btn('rcs-port')!.getAttribute('data-ui-refused'), btn('rcs-stbd')!.getAttribute('data-ui-refused')]).toEqual(['1', '1']);
  });
  it('a Helm panel without `crew` (the Valkyrn\'s Flight seat) keeps the notches', () => {
    const { duel } = mount();
    act(() => duel.frame(view(helmView({ crew: undefined, throttle: 2 }))));
    expect(btn('throttle-100')).not.toBeNull();
    expect(attr('data-ui-thr-bar')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/crewHelmUi.test.tsx`
Expected: FAIL (`crew` is not on the panel; no `data-ui-thr-bar`).

- [ ] **Step 3: The console model**

In `src/renderer/src/render/duel/consoleModel.ts`:

(a) After `import { laserOffline } from '../../sim/tactical/weapons';` add:

```ts
import { engineBars, throttleCap, throttleFloor } from '../../sim/duel/helmFlight';
import { COMPRESSOR_RATE, RCS_TANK } from '../../sim/duel/tuning';
```

(b) Replace

```ts
export interface HelmPanel {
  heading: number; speed: number; held: HeldFlags; throttle: number; refused?: RefusedView | null; holdHeading?: number;
```

with

```ts
/** Playtest2feedback §5, §6: the crew Helm's readings: the shown thrMille, the throttle's cap and floor from the ENGINE
 *  share, the tank in percent, the COMPRESSOR share, the bar budget, and the compressor's rate in tank percent a second. */
export interface CrewHelmPanel { thrMille: number; cap: number; floor: number; gas: number; compressor: number; bars: number; rate: number }
export function crewPanel(d: DuelState, thrMille: number): CrewHelmPanel {
  const engine = engineBars(d);
  return { thrMille, cap: throttleCap(engine), floor: throttleFloor(engine), gas: Math.round((d.rcsGas * 100) / RCS_TANK), compressor: d.compressor, bars: d.helmBars, rate: COMPRESSOR_RATE[d.compressor]! / 10 };
}
export interface HelmPanel {
  heading: number; speed: number; held: HeldFlags; throttle: number; refused?: RefusedView | null; holdHeading?: number;
  /** Playtest2feedback §6: the crew Helm's block (a newtonianHelm class at the Helm); absent: the notched throttle. */
  crew?: CrewHelmPanel;
```

(c) Replace

```ts
        refused: i.refused && HELM_CONTROLS.includes(i.refused.control) ? i.refused : null, holdHeading: d.holdHeading, ...(station === 'flight' ? { flight: true } : {}) }
```

with

```ts
        refused: i.refused && HELM_CONTROLS.includes(i.refused.control) ? i.refused : null, holdHeading: d.holdHeading, ...(station === 'flight' ? { flight: true } : {}),
        ...(station === 'helm' && classOf(t, 0).newtonianHelm ? { crew: crewPanel(d, i.thrMille ?? d.thrMille) } : {}) }   // playtest2feedback §6
```

- [ ] **Step 4: The HelmStation block**

In `src/renderer/src/ui/duel/HelmStation.tsx`:

(a) In the header comment, append the line `// Playtest2feedback §6: on a newtonianHelm class (helm.crew) the block is CrewHelmStation: the held throttle bar, PRESSURE, HELM POWER and the PORT / STBD thrusters.`

(b) Replace `import type { HelmPanel } from '../../render/duel/consoleModel';` with:

```ts
import type { CrewHelmPanel, HelmPanel } from '../../render/duel/consoleModel';
import { THR_MAX, THR_MIN } from '../../sim/duel/tuning';
```

(c) Replace `export const HelmStation = memo(function HelmStation({ helm }: { helm: HelmPanel }) {` with `const NotchHelmStation = memo(function NotchHelmStation({ helm }: { helm: HelmPanel }) {   // the Valkyrn's Flight seat (Artemis-ii, unchanged)`.

(d) Append to the end of the file:

```tsx

/** Playtest2feedback §6: the held throttle bar's labels and their per mille, top to bottom. */
const THR_LABELS: readonly [string, number][] = [['100', 1000], ['75', 750], ['50', 500], ['25', 250], ['0', 0], ['REV', -250]];
const BAR_H = 150, BAR_W = 18, GAUGE_W = 14;

/** Playtest2feedback §5, §6: the crew Helm's block. On the left, the throttle bar from REV (−25) to 100, filled from 0 to the
 *  shown thrMille. A line marks the ENGINE cap, and the parts past the cap and the floor are drawn locked (dark). Beside it
 *  is the PRESSURE gauge, with the tank percentage and the COMPRESSOR rate. On the right are the heading and speed, and the
 *  HELM POWER strip: ENGINE cells left, COMPRESS cells right, and a click switches that bar's side. Below them are PORT and
 *  STBD (they hold A and D, the side thrusters), AUTO-FACE, and the key hints. */
const CrewHelmStation = memo(function CrewHelmStation({ helm, crew }: { helm: HelmPanel; crew: CrewHelmPanel }) {
  const actions = useActions(), { crt } = useCrt();
  const top = stationTop('helm'), x0 = STATION.x + 8, y0 = top + 6, rx = STATION.x + 140, h = helm.held;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, hot = crt ? CRT.hot : AMBER, faint = crt ? CRT.faint : BAR_OFF;
  const r = helm.refused ?? null, flash = (c: string): boolean => r?.control === c && r.flash;
  const hint = (controls: readonly string[], text: string, y: number) => r && controls.includes(r.control)
    ? <PixelText text={r.reason} x={rx} y={y} size={FONT_NATIVE} tint={hot} />
    : <PixelText text={text} x={rx} y={y} size={FONT_NATIVE} tint={dim} />;
  const barX = x0 + 34, barTop = y0 + 18, yAt = (m: number): number => barTop + Math.round(((THR_MAX - m) / (THR_MAX - THR_MIN)) * BAR_H);
  const zeroY = yAt(0), valueY = yAt(crew.thrMille), capY = yAt(crew.cap), floorY = yAt(crew.floor), engine = crew.bars - crew.compressor;
  const gx = x0 + 84, gasY = barTop + Math.round(((100 - crew.gas) / 100) * BAR_H);
  const hold = helm.holdHeading ?? -1, holdDeg = hold >= 0 ? ((Math.round((hold / 256) * 360) % 360) + 360) % 360 : -1;
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.helm} />
      <PixelText text="THROTTLE" x={x0} y={y0} size={FONT_NATIVE} tint={flash('throttle') ? hot : dim} />
      {THR_LABELS.map(([label, m]) => <PixelText key={label} text={label} x={x0} y={yAt(m) - 4} size={FONT_NATIVE} tint={dim} />)}
      <Box x={barX} y={barTop} w={BAR_W} h={BAR_H} attrs={{ 'data-ui-thr-bar': String(crew.thrMille) }} style={{ border: `1px solid ${hex(dim)}` }} />
      {capY > barTop && <Box x={barX} y={barTop} w={BAR_W} h={capY - barTop} attrs={{ 'data-ui-thr-locked': 'cap' }} style={{ background: hex(faint) }} />}
      {floorY < barTop + BAR_H && <Box x={barX} y={floorY} w={BAR_W} h={barTop + BAR_H - floorY} attrs={{ 'data-ui-thr-locked': 'floor' }} style={{ background: hex(faint) }} />}
      {valueY !== zeroY && <Box x={barX + 2} y={Math.min(zeroY, valueY)} w={BAR_W - 4} h={Math.abs(zeroY - valueY)} attrs={{ 'data-ui-thr-fill': '1' }} style={{ background: hex(hot) }} />}
      <Box x={barX - 2} y={zeroY} w={BAR_W + 4} h={1} style={{ background: hex(dim) }} />
      <Box x={barX - 4} y={capY} w={BAR_W + 8} h={1} attrs={{ 'data-ui-thr-cap': String(crew.cap) }} style={{ background: hex(main) }} />
      <PixelText text="PRESSURE" x={x0 + 62} y={y0} size={FONT_NATIVE} tint={flash('thrusters') ? hot : dim} />
      <Box x={gx} y={barTop} w={GAUGE_W} h={BAR_H} attrs={{ 'data-ui-pressure': String(crew.gas) }} style={{ border: `1px solid ${hex(dim)}` }} />
      {crew.gas > 0 && <Box x={gx + 2} y={gasY} w={GAUGE_W - 4} h={barTop + BAR_H - gasY} style={{ background: hex(crew.gas >= 1 ? main : faint) }} />}
      <PixelText text={`${crew.gas}%`} x={gx - 6} y={barTop + BAR_H + 4} size={FONT_NATIVE} tint={main} />
      <PixelText text={`+${crew.rate}%/S`} x={gx - 6} y={barTop + BAR_H + 16} size={FONT_NATIVE} tint={dim} />
      <Box x={STATION.x + 130} y={y0} w={1} h={186} style={{ background: hex(crt ? CRT.dim : BAR_OFF) }} />
      <PixelText text={`HDG ${String(helm.heading).padStart(3, '0')}${holdDeg >= 0 ? ` TO ${String(holdDeg).padStart(3, '0')}` : ''}`} x={rx} y={y0} size={FONT_NATIVE} tint={holdDeg >= 0 ? main : dim} />
      <PixelText text={`SPD ${helm.speed}`} x={rx} y={y0 + 18} size={FONT_SIZE} tint={main} />
      <PixelText text="HELM POWER" x={rx} y={y0 + 40} size={FONT_NATIVE} tint={dim} />
      {Array.from({ length: crew.bars }, (_, k) => {
        const isEngine = k < engine;   // ENGINE cells left, COMPRESS cells right; a click switches that bar (Decision 10)
        return <Button key={k} name={`power-${k}`} label={isEngine ? 'E' : 'C'} x={rx + k * 22} y={y0 + 54} w={18} h={16} lit={isEngine} onPress={() => actions.console.helmPower?.(isEngine ? -1 : 1)} />;
      })}
      <PixelText text={`ENGINE ${engine}  COMPRESS ${crew.compressor}`} x={rx} y={y0 + 74} size={FONT_NATIVE} tint={dim} />
      <Button name="rcs-port" label="PORT" hint="A" x={rx} y={y0 + 90} w={70} h={24} lit={h.left} flash={flash('thrusters')} onHold={(on) => actions.console.hold('KeyA', on)} />
      <Button name="rcs-stbd" label="STBD" hint="D" x={rx + 78} y={y0 + 90} w={70} h={24} lit={h.right} flash={flash('thrusters')} onHold={(on) => actions.console.hold('KeyD', on)} />
      <Button name="auto-face" label="AUTO-FACE" hint="SPC" x={rx} y={y0 + 120} w={148} h={24} lit={h.fire} flash={flash('auto-face')} onHold={(on) => actions.console.hold('Space', on)} />
      {hint(['thrusters'], 'A/D Q/E ARROWS: GAS', y0 + 150)}
      {hint(['turn', 'heading'], 'LMB STEER  RMB HEADING', y0 + 166)}
      {hint(['throttle', 'auto-face'], 'W/S THROTTLE  1/2 POWER', y0 + 182)}
    </>
  );
});

/** The Helm station block: the crew Helm's (playtest2feedback §6) or the notched throttle (Artemis-ii). */
export const HelmStation = memo(function HelmStation({ helm }: { helm: HelmPanel }) {
  return helm.crew ? <CrewHelmStation helm={helm} crew={helm.crew} /> : <NotchHelmStation helm={helm} />;
});
```

In `src/renderer/src/ui/actions.ts`, replace `    frequency: (freq) => consoleInput?.frequency(freq)` with:

```ts
    frequency: (freq) => consoleInput?.frequency(freq),
    helmPower: (delta) => consoleInput?.helmPower?.(delta)   // playtest2feedback §5: a HELM POWER cell
```

- [ ] **Step 5: The controls list, the key hints and the UI probe**

In `src/renderer/src/app/controlsList.ts`:

(a) Replace `  const duel: ControlRow[] = [{ keys: move, action: 'Walk; at the Helm, A/D turn' }];` with `  const duel: ControlRow[] = [{ keys: move, action: 'Walk; at the Helm, W/S hold the throttle and A/D fire the side thrusters' }];   // playtest2feedback §6`.

(b) Replace

```ts
  for (const action of Object.keys(DUEL_ACTION) as (keyof typeof DUEL_ACTION)[]) {
    const keys = codesFor(action).map(keyLabel).join(' / ');
```

with

```ts
  for (const action of Object.keys(DUEL_ACTION) as (keyof typeof DUEL_ACTION)[]) {
    if (action === 'throttleUp' || action === 'throttleDown') continue;   // playtest2feedback §6: the Valkyrn's notches (its own section); the crew Helm holds W/S
    const keys = codesFor(action).map(keyLabel).join(' / ');
```

(c) Replace

```ts
  duel.push({ keys: `Shift+${keyLabel(MOVE_CODES.up)}`, action: 'At the Helm, full throttle' }, { keys: `${keyLabel(PING_CODE)} / Middle click`, action: 'Ping the map point (or the enemy) for the crew' });
  duel.push({ keys: 'Mouse wheel', action: 'Zoom (the maps and the ship); over the Helm throttle, step it' },
```

with

```ts
  duel.push({ keys: `${keyLabel(PING_CODE)} / Middle click`, action: 'Ping the map point (or the enemy) for the crew' });
  // Playtest2feedback §6: the crew Helm: W/S throttle · hold LMB steer · RMB set heading · A/D Q/E ←→↑↓ thrusters · 1/2 power.
  const power = Object.keys(POWER_CODES).map(keyLabel).join(' / ');
  duel.push({ keys: `Hold ${keyLabel(MOVE_CODES.up)} / ${keyLabel(MOVE_CODES.down)}`, action: 'At the Helm, push the throttle up or down; let go and it returns to 0' },
    { keys: 'Hold left mouse', action: 'At the Helm, steer: the nose turns toward the pointer' },
    { keys: `${RCS_CODES.port.slice(0, 2).map(keyLabel).join(' ')} / ${RCS_CODES.starboard.slice(0, 2).map(keyLabel).join(' ')} / ← →`, action: 'At the Helm, cold gas thrusters to port and to starboard' },
    { keys: '↑ ↓', action: 'At the Helm, cold gas thrusters fore and aft' },
    { keys: power, action: 'At the Helm, move a power bar to ENGINE or to COMPRESSOR' });
  duel.push({ keys: 'Mouse wheel', action: 'Zoom (the maps and the ship)' },
```

(d) Replace `import { FIRE_HELD, FREQ_CODES, INTERACT_HELD, MOVE_CODES, PING_CODE, PRESS_CODES, WEAPON_CODES, type KeyAction } from './duel/input';` with `import { FIRE_HELD, FREQ_CODES, INTERACT_HELD, MOVE_CODES, PING_CODE, POWER_CODES, PRESS_CODES, RCS_CODES, WEAPON_CODES, type KeyAction } from './duel/input';`.

The port and starboard row reads `A Q / D E / ← →`.

In `src/renderer/src/render/duel/readoutModel.ts`, replace

```ts
export function readoutHelp(mode: ReadoutMode): string[] {
  if (mode === 'helm') return ['W/S THROTTLE   A/D TURN', 'X STAND   TAB SWITCH', 'WHEEL - =  ZOOM   C SNAP', 'ESC PAUSE'];
```

with

```ts
export function readoutHelp(mode: ReadoutMode, crewHelm = false): string[] {
  if (mode === 'helm' && crewHelm) return ['W/S THROTTLE   LMB STEER', 'A/D Q/E ARROWS GAS   1/2 POWER', 'X STAND   TAB SWITCH', 'WHEEL - =  ZOOM   C SNAP', 'ESC PAUSE'];   // playtest2feedback §6
  if (mode === 'helm') return ['W/S THROTTLE   A/D TURN', 'X STAND   TAB SWITCH', 'WHEEL - =  ZOOM   C SNAP', 'ESC PAUSE'];
```

and in `src/renderer/src/app/duel/scene.ts` replace `help: onConsole ? [] : readoutHelp(view === 'flight' ? 'helm' : view) },` with `help: onConsole ? [] : readoutHelp(view === 'flight' ? 'helm' : view, view === 'helm' && classOf(d.tactical, CREW_SLOT).newtonianHelm) },`.

In `src/renderer/src/render/duel/sitModel.ts`, replace `  helm: { title: 'HELM: POINT AT THE ENEMY', keys: ['A/D  TURN', 'W/S  THROTTLE', 'HOLD SPACE  AUTO-FACE'] },` with `  helm: { title: 'HELM: POINT AT THE ENEMY', keys: ['HOLD LMB  STEER', 'W/S  THROTTLE', 'A/D  THRUSTERS'] },   // playtest2feedback §6: the crew Helm`.

In `src/renderer/src/app/uiProbe.ts`, replace `    weapons: null, helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 2 }, side:` with `    weapons: null, helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 0, crew: { thrMille: 500, cap: 750, floor: -250, gas: 80, compressor: 1, bars: 4, rate: 5 } }, side:   // playtest2feedback §6: the crew Helm`.

- [ ] **Step 6: Run the new test**

Run: `npx tsc -b`, then `npx vitest run tests/crewHelmUi.test.tsx`
Expected: no type errors; PASS.

- [ ] **Step 7: The tests the new console touches**

1. In `tests/settingsAndControls.test.ts`, replace `    expect([action('Shift+W'), action('G / Middle click')]).toEqual(['At the Helm, full throttle', 'Ping the map point (or the enemy) for the crew']);` with:

   ```ts
       expect(action('G / Middle click')).toBe('Ping the map point (or the enemy) for the crew');
       expect(sections[0]!.rows.some((r) => r.keys === 'Shift+W' || /notch/.test(r.action))).toBe(false);   // playtest2feedback §6: the crew Helm has no notches
       expect([action('Hold W / S'), action('Hold left mouse'), action('A Q / D E / ← →'), action('↑ ↓'), action('1 / 2')].every((t) => t.startsWith('At the Helm'))).toBe(true);
   ```

2. In `tests/feelPresentation.test.ts:201` and `tests/feelUi.test.tsx:68`, replace the Helm card's keys `'A/D  TURN', 'W/S  THROTTLE', 'HOLD SPACE  AUTO-FACE'` with `'HOLD LMB  STEER', 'W/S  THROTTLE', 'A/D  THRUSTERS'`.

3. Run: `npx vitest run tests/settingsAndControls.test.ts tests/feelPresentation.test.ts tests/feelUi.test.tsx tests/duelConsoleModel.test.ts tests/uiConsole.test.tsx tests/feelIiUi.test.tsx tests/flightConsole.test.tsx tests/uiProbe.test.ts tests/uiActions.test.ts`. In `tests/duelConsoleModel.test.ts`, a `toEqual` of a Cutter Helm panel now needs `crew: crewPanel(d, d.thrMille)`. Add that key to the expected literal (import `crewPanel` from the model). Nothing else changes.
   Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/render/duel/consoleModel.ts src/renderer/src/ui/duel/HelmStation.tsx src/renderer/src/ui/actions.ts src/renderer/src/app/controlsList.ts src/renderer/src/app/uiProbe.ts src/renderer/src/render/duel/readoutModel.ts src/renderer/src/render/duel/sitModel.ts src/renderer/src/app/duel/scene.ts tests/crewHelmUi.test.tsx tests/settingsAndControls.test.ts tests/feelPresentation.test.ts tests/feelUi.test.tsx tests/duelConsoleModel.test.ts
git commit -m "feat(playtest2feedback): the crew HelmStation (held throttle bar with the ENGINE cap, PRESSURE gauge, HELM POWER strip, PORT/STBD thrusters), the controls list, key hints and the UI probe" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Thruster puffs, the steering marker, and the `sfx.rcs` hiss

**Files:**
- Modify: `src/renderer/src/render/tactical/tacticalModel.ts`, `src/renderer/src/render/tactical/tacticalLayer.ts`, `src/renderer/src/audio/soundBank.ts`, `src/renderer/src/audio/duelSounds.ts`, `src/renderer/src/app/duel/duelAudio.ts`, `src/renderer/src/app/duel/scene.ts`
- Regenerated: `public/assets/manifest.json` (by `npx tsx scripts/audio-manifest.ts`); `public/THIRD_PARTY_NOTICES.txt` and `src/renderer/src/render/credits.generated.ts` if `npm run credits` changes them
- Create: `tests/crewHelmFx.test.ts`

**Interfaces:**
- Consumes: Task 3 (`HelmVent`), Task 9 (the scene's crew steer block), Task 10 (`source.helmVent()`).
- Produces:
  ```ts
  // render/tactical/tacticalModel.ts
  export interface PuffDraw { x: number; y: number; dx: number; dy: number }
  // TacticalModelInput gains vent?: HelmVent | null, steerTo?: Point | null; TacticalDraw gains puffs?: PuffDraw[]; HelmDraw gains steer?: { from: Point; to: Point } | null
  // audio/soundBank.ts: SFX.rcs = { pack: 'sci', stem: 'thrusterFire', numbers: [2] }; SFX.thruster.numbers = [0, 1]
  // audio/duelSounds.ts
  export const RCS_HISS: SoundRequest; export const RCS_HISS_GAP_S = 0.12;
  export function rcsHiss(next: number | null, venting: boolean, now: number): { next: number | null; play: boolean };
  // app/duel/duelAudio.ts: DuelAudioFrame.vent?: { x: number; y: number; boosted: boolean }
  // app/duel/scene.ts: DuelViewSource.helmVent?(): HelmVent
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/crewHelmFx.test.ts`:

```ts
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §6): the cold gas puffs at the hull edge opposite each push
// (a boosted turn at the bow and stern on opposite sides), the dashed steering marker from the ship to the cursor, and the
// sfx.rcs hiss retriggered while venting.
import { describe, expect, it } from 'vitest';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { RCS_HISS, RCS_HISS_GAP_S, rcsHiss } from '../src/renderer/src/audio/duelSounds';
import { SFX, sfxFiles } from '../src/renderer/src/audio/soundBank';

const vp = { w: 1280, h: 720 };
function model(over: Partial<TacticalModelInput>) {
  const st = createTacticalState(5), s = st.ships[0];
  Object.assign(s, { heading: 0, headingAcc: 0 });
  const cam = createCamera(s.x, s.y, 1);
  return tacticalModel({ state: st, prev: st.ships.map((b) => ({ x: b.x, y: b.y, h: b.heading + b.headingAcc })), alpha: 1, camera: cam, viewport: vp, console: 'helm', axes: { turn: 0, thrust: 0 }, ships: [0], paused: false, reserveRight: 0, ...over });
}

describe('the puffs (spec §6)', () => {
  it('none without venting; a forward push puffs at the stern, a starboard push at the port side', () => {
    expect(model({}).puffs ?? []).toEqual([]);
    expect(model({ vent: { x: 0, y: 0, boosted: false } }).puffs ?? []).toEqual([]);
    const ship = model({}).ships[0]!;
    const [aft] = model({ vent: { x: 0, y: 1, boosted: false } }).puffs!;
    expect(aft!.y).toBeGreaterThan(ship.y); expect(aft!.dx).toBeCloseTo(0, 9); expect(aft!.dy).toBeCloseTo(1, 9);   // nose north: the stern is down the screen
    const [port] = model({ vent: { x: 1, y: 0, boosted: false } }).puffs!;
    expect(port!.x).toBeLessThan(ship.x); expect(port!.dx).toBeCloseTo(-1, 9);
  });
  it('a boosted clockwise turn puffs at the bow to port and at the stern to starboard', () => {
    const ship = model({}).ships[0]!, p = model({ vent: { x: 0, y: 0, boosted: true }, axes: { turn: 1, thrust: 0 } }).puffs!;
    expect(p).toHaveLength(2);
    expect([p[0]!.y < ship.y, p[0]!.dx < 0, p[1]!.y > ship.y, p[1]!.dx > 0]).toEqual([true, true, true, true]);
  });
});

describe('the steering marker (spec §6)', () => {
  it('runs from the ship to the cursor while it is given', () => {
    const m = model({ steerTo: { x: 900, y: 200 } });
    expect(m.helm?.steer).toEqual({ from: { x: m.helm!.origin.x, y: m.helm!.origin.y }, to: { x: 900, y: 200 } });
    expect(model({}).helm?.steer ?? null).toBeNull();
  });
});

describe('the hiss (spec §6, Decision 12)', () => {
  it('sfx.rcs is thrusterFire_002; the thruster keeps 000 and 001', () => {
    expect(SFX.rcs).toEqual({ pack: 'sci', stem: 'thrusterFire', numbers: [2] });
    expect(SFX.thruster.numbers).toEqual([0, 1]);
    expect(sfxFiles().filter((f) => f.key === 'rcs').map((f) => f.name)).toEqual(['sfx.rcs.0']);
    expect(RCS_HISS.key).toBe('rcs');
  });
  it('plays at once when venting starts, then every RCS_HISS_GAP_S, and stops with the venting', () => {
    let s = rcsHiss(null, true, 0);
    expect(s).toEqual({ next: RCS_HISS_GAP_S, play: true });
    s = rcsHiss(s.next, true, 0.05); expect(s.play).toBe(false);
    s = rcsHiss(s.next, true, RCS_HISS_GAP_S); expect(s.play).toBe(true);
    expect(rcsHiss(s.next, false, 1)).toEqual({ next: null, play: false });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/crewHelmFx.test.ts`
Expected: FAIL (`rcsHiss` is not exported; there are no `puffs`).

- [ ] **Step 3: The model**

In `src/renderer/src/render/tactical/tacticalModel.ts`:

(a) After `import { hullFor, type HullId } from './hullModel';` add `import type { HelmVent } from '../../sim/duel/helmFlight';`.

(b) Replace

```ts
export interface HelmDraw { path: Point[]; origin: Point; velocity: Point; headingFrom: Point; headingTo: Point; thrust: number; turn: number; ring: RingDraw | null;
  collision?: CollisionDraw | null; hold?: HoldDraw | null; slingshot?: Label | null }
```

with

```ts
export interface HelmDraw { path: Point[]; origin: Point; velocity: Point; headingFrom: Point; headingTo: Point; thrust: number; turn: number; ring: RingDraw | null;
  collision?: CollisionDraw | null; hold?: HoldDraw | null; slingshot?: Label | null;
  /** Playtest2feedback §6: the steering marker while the left button steers: from the ship to the cursor. */
  steer?: { from: Point; to: Point } | null }
/** Playtest2feedback §6: one cold gas puff, at a screen point on the crew ship's hull edge, venting along (dx, dy) (unit). */
export interface PuffDraw { x: number; y: number; dx: number; dy: number }
```

(c) In `TacticalDraw`, after the `rockMarks?: RockMarkDraw[];` member, add:

```ts
  /** Playtest2feedback §6: the crew ship's cold gas puffs this frame. */
  puffs?: PuffDraw[];
```


(d) In `TacticalModelInput`, after the `crewHull?: HullId;` member, add:

```ts
  /** Playtest2feedback §6: the crew ship's vented thruster axes and boost this tick (the puffs), and the cursor the held left
   *  button steers to (the steering marker), in screen px; absent: none. */
  vent?: HelmVent | null; steerTo?: Point | null;
```

(e) After `  const own = interpolatedShip(state, prev, alpha, 0), ownS = toS(own.x, own.y);`, insert:

```ts
  // Playtest2feedback §6: the puffs, at the hull edge opposite each vented push. A boosted turn puffs at the bow on the side
  // away from the turn and at the stern on the side toward it.
  const puffs: PuffDraw[] = [], v = input.vent ?? null;
  if (v && input.ships.includes(0) && (v.x !== 0 || v.y !== 0 || v.boosted)) {
    const a = headingAngle(own.h), fx = Math.sin(a), fy = -Math.cos(a), rx = -fy, ry = fx, rr = SHIP_RADIUS * 1.3 * drawnScale(z);
    const puff = (ox: number, oy: number, dx: number, dy: number): void => { puffs.push({ x: ownS.x + ox * rr, y: ownS.y + oy * rr, dx, dy }); };
    if (v.y !== 0) puff(-fx * v.y, -fy * v.y, -fx * v.y, -fy * v.y);
    if (v.x !== 0) puff(-rx * v.x, -ry * v.x, -rx * v.x, -ry * v.x);
    if (v.boosted) { const s = Math.sign(input.axes.turn) || 1; puff(fx - rx * s, fy - ry * s, -rx * s, -ry * s); puff(-fx + rx * s, -fy + ry * s, rx * s, ry * s); }
  }
```

(f) Replace `      ring: z >= BEARING_RING_ZOOM ? ringDraw(ownS.x, ownS.y) : null` with:

```ts
      ring: z >= BEARING_RING_ZOOM ? ringDraw(ownS.x, ownS.y) : null,
      steer: input.steerTo ? { from: { x: ownS.x, y: ownS.y }, to: { x: input.steerTo.x, y: input.steerTo.y } } : null   // playtest2feedback §6
```

(g) In the return, replace `    ...(rockMarks ? { rockMarks } : {}),` with:

```ts
    ...(rockMarks ? { rockMarks } : {}),
    ...(puffs.length > 0 ? { puffs } : {}),
```


- [ ] **Step 4: The layer**

In `src/renderer/src/render/tactical/tacticalLayer.ts`:

(a) Replace `      for (const s of d.ships) drawShip(ships, s, t);` with:

```ts
      for (const s of d.ships) drawShip(ships, s, t);
      for (const p of d.puffs ?? []) {   // playtest2feedback §6: short amber gas puffs
        ships.circle(p.x + p.dx * 4, p.y + p.dy * 4, 3).fill({ color: CRT.hot, alpha: 0.8 });
        ships.circle(p.x + p.dx * 9, p.y + p.dy * 9, 2).fill({ color: CRT.main, alpha: 0.5 });
      }
```

(b) Replace

```ts
          segments(helm, dashLine(line, DASH, GAP, seg), 1, CRT.mid, ho.preview ? 0.6 : 0.9);
          helm.poly([...ho.chevron], false).stroke({ width: 2, color: CRT.mid, alpha: ho.preview ? 0.6 : 1 });
        }
```

with

```ts
          segments(helm, dashLine(line, DASH, GAP, seg), 1, CRT.mid, ho.preview ? 0.6 : 0.9);
          helm.poly([...ho.chevron], false).stroke({ width: 2, color: CRT.mid, alpha: ho.preview ? 0.6 : 1 });
        }
        const st = hd.steer ?? null;   // playtest2feedback §6: the steering marker, dashed amber from the ship to the cursor
        if (st) { line.length = 0; line.push(st.from.x, st.from.y, st.to.x, st.to.y); segments(helm, dashLine(line, DASH, GAP, seg), 1, CRT.hot, 0.9); }
```

- [ ] **Step 5: The sound**

In `src/renderer/src/audio/soundBank.ts`, replace

```ts
  thruster: { pack: 'sci', stem: 'thrusterFire', numbers: [0, 1, 2] },
```

with

```ts
  thruster: { pack: 'sci', stem: 'thrusterFire', numbers: [0, 1] },
  /** Playtest2feedback §6 (Decision 13): the cold gas hiss, the thruster file the launch whoosh no longer uses. */
  rcs: { pack: 'sci', stem: 'thrusterFire', numbers: [2] },
```

In `src/renderer/src/audio/duelSounds.ts`, after the `HEARTBEAT` constant, insert:

```ts
/** Playtest2feedback §6 (Decision 12): the cold gas hiss, a short, quiet, band-passed sfx.rcs, retriggered every
 *  RCS_HISS_GAP_S while the crew ship vents. */
export const RCS_HISS: SoundRequest = { key: 'rcs', gain: 0.25, dur: 0.16, rate: 1.4, filter: { type: 'bandpass', from: 3000, q: 0.7 } };
export const RCS_HISS_GAP_S = 0.12;
/** The hiss's clock: at once when venting starts, then every RCS_HISS_GAP_S; nothing (and no clock) while it does not vent. */
export function rcsHiss(next: number | null, venting: boolean, now: number): { next: number | null; play: boolean } {
  if (!venting) return { next: null, play: false };
  if (next === null || now >= next) return { next: now + RCS_HISS_GAP_S, play: true };
  return { next, play: false };
}
```

In `src/renderer/src/app/duel/duelAudio.ts`:

(a) Replace `  CREW, FIRE_ALARM, HEARTBEAT, OUTCOME_RUNNING, PING_TONE, crewLifeSounds, duelEventSounds, duelStateSounds, fireAlarm, heartbeat, heartbeatOn, lockTone,` with `  CREW, FIRE_ALARM, HEARTBEAT, OUTCOME_RUNNING, PING_TONE, RCS_HISS, crewLifeSounds, duelEventSounds, duelStateSounds, fireAlarm, heartbeat, heartbeatOn, lockTone, rcsHiss,`.

(b) In `DuelAudioFrame`, after `  torpedo?: TorpedoTone; pings?: number;` add:

```ts
  /** Playtest2feedback §6: the crew ship's vent this frame (the hiss); absent: none. */
  vent?: { x: number; y: number; boosted: boolean };
```


(c) Replace `  let rockWatch: RockSoundWatch | null = null;` with `  let rockWatch: RockSoundWatch | null = null, nextHiss: number | null = null;`.

(d) Replace

```ts
      const rocks = rockSounds(rockWatch, f.events, f.pan, clock); rockWatch = rocks.watch;   // spike ii §7 item 8
      const list = [...ev.sounds, ...st.sounds, ...ins.sounds, ...(alarm.play ? FIRE_ALARM : []), ...(beat.beat ? [HEARTBEAT] : []), ...tone.sounds, ...((f.pings ?? 0) > 0 ? [PING_TONE] : []), ...rocks.sounds];
```

with

```ts
      const rocks = rockSounds(rockWatch, f.events, f.pan, clock); rockWatch = rocks.watch;   // spike ii §7 item 8
      const v = f.vent, hiss = rcsHiss(nextHiss, f.live !== false && !f.paused && !!v && (v.x !== 0 || v.y !== 0 || v.boosted), clock);   // playtest2feedback §6
      nextHiss = hiss.next;
      const list = [...ev.sounds, ...st.sounds, ...ins.sounds, ...(alarm.play ? FIRE_ALARM : []), ...(beat.beat ? [HEARTBEAT] : []), ...tone.sounds, ...((f.pings ?? 0) > 0 ? [PING_TONE] : []), ...rocks.sounds, ...(hiss.play ? [RCS_HISS] : [])];
```

(e) In `reset()`, replace `crewFlying = false; rockWatch = null; }` with `crewFlying = false; rockWatch = null; nextHiss = null; }`.

Run: `npx tsx scripts/audio-manifest.ts`
Expected: `wrote 50 effect and 2 music entries to public/assets/manifest.json`.

Run: `npm run credits`
Expected: success. Note whether `git status --short public src/renderer/src/render/credits.generated.ts` lists the notices or the credits file.

- [ ] **Step 6: The scene feeds the vent and the marker**

In `src/renderer/src/app/duel/scene.ts`:

(a) After `import type { DuelState } from '../../sim/duel/state';` add `import type { HelmVent } from '../../sim/duel/helmFlight';`, and in `DuelViewSource` after the `thrMille?(): number;` member (Task 9) add:

```ts
  /** Playtest2feedback §6, Decision 11: the crew ship's vent this frame (online: this seat's own prediction). Absent: the duel's helmVent. */
  helmVent?(): HelmVent;
```


(b) Replace Task 9's crew steer block

```ts
      if (onMap && crewHelmMap && running && !overlay.layerPaused && (options.leftHeld?.() ?? false)) {
        const b = interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT);
        const h = helmSteer({ pointer: options.pointer?.() ?? null, ship: worldToScreen(cam!, viewport, b.x, b.y), zoom: cam!.zoom, contactShown: shown });
        if (h !== null) options.requests?.steer(h);
      }
```

with

```ts
      let steerTo: { x: number; y: number } | null = null;   // §6: the steering marker's end while the left button steers
      if (onMap && crewHelmMap && running && !overlay.layerPaused && (options.leftHeld?.() ?? false)) {
        const b = interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT), p = options.pointer?.() ?? null;
        const h = helmSteer({ pointer: p, ship: worldToScreen(cam!, viewport, b.x, b.y), zoom: cam!.zoom, contactShown: shown });
        if (h !== null) options.requests?.steer(h);
        steerTo = p;
      }
      const vent = source.helmVent?.() ?? d.helmVent;   // §6: the puffs and the hiss
```

(c) In the sound frame call, replace `          torpedo: torpedoTone(d), pings: pinged,   // Feel-ii §2.5, §2.7` with `          torpedo: torpedoTone(d), pings: pinged, vent,   // Feel-ii §2.5, §2.7; playtest2feedback §6`.

(d) In the tactical model's `input` literal, replace `          rockHover: hoverRock !== null && aimed !== null ? { rock: hoverRock, weapon: aimed } : null` with:

```ts
          rockHover: hoverRock !== null && aimed !== null ? { rock: hoverRock, weapon: aimed } : null,
          vent, steerTo   // playtest2feedback §6: the puffs and the steering marker
```

In `src/renderer/src/app/duel/onlineSource.ts`, the source's `helmVent` (Task 10) already matches `DuelViewSource.helmVent`.

- [ ] **Step 7: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/crewHelmFx.test.ts tests/tacticalModel.test.ts tests/tacticalLayer.test.ts tests/audioManifest.test.ts tests/audioDuel.test.ts tests/duelAudio.test.ts tests/audioRecipes.test.ts tests/audioEngine.test.ts tests/audioInterior.test.ts tests/crewHelmOnline.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/audio/soundBank.ts src/renderer/src/audio/duelSounds.ts src/renderer/src/app/duel/duelAudio.ts src/renderer/src/app/duel/scene.ts public/assets/manifest.json tests/crewHelmFx.test.ts
git add <public/THIRD_PARTY_NOTICES.txt and src/renderer/src/render/credits.generated.ts if Step 5 changed them>
git commit -m "feat(playtest2feedback): cold gas puffs on the crew ship, the dashed steering marker, and the sfx.rcs hiss (thrusterFire_002) while venting" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The gameplay bless at `N + 1` and the full verification

**Files:**
- Regenerated by `npm run bless` (same version): `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/golden/basic.json` (its embedded content digest only)

**Interfaces:**
- Consumes: Tasks 1 to 12.
- Produces: the branch, ready for the owner's playtest (spec §1: nothing merges before it).

- [ ] **Step 1: The same-version bless**

Run: `npm run bless`
Expected, exit 0: four `blessed …` lines.
- `basic.json`'s counts equal Task 1's (`120 checkpoints`).
- The duel lines carry new tick counts and outcomes, because the crew flies Newtonian now.
- The determinism fixture's line reads `sim version <N + 1>, <n> samples and <m> boundaries re-executed`, with Task 1's `<n>` and `<m>`.

Write the four lines into the commit message.

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

Run: `git status --short tests/golden tests/fixtures`
Expected: `M tests/golden/basic.json`, `M tests/golden/duel-1.json`, `M tests/golden/duel-rematch.json`, and nothing else.

- [ ] **Step 2: Typecheck, build, the full suite**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx electron-vite build`
Expected: the build succeeds.

Run: `npx vitest run --maxWorkers=4`
Expected: every test file PASS. A timeout in a load-sensitive file (Global Constraints) is re-run alone with `npx vitest run <that file>` before it counts.

- [ ] **Step 3: The sector determinism check**

Run: `npm run test:determinism`
Expected: PASS on every runtime it reports (Node, Electron, Firefox).

This replays the sector fixture only (variants hound-2 and hound-3), so it says nothing about the duel. The duel's cross-runtime determinism rests on the guard rules (`tests/determinismGuard.test.ts`: only + − × ÷ and sqrt, the heading tables, randomness from the seeded rng only) and on the Node duel goldens. The final report lists "duel crew-flight determinism across runtimes: not verified (guard rules and Node goldens only)".

Run: `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability`
Then: `git status --short .superpowers/sdd`
Expected: no output.

- [ ] **Step 4: The build and the spec's checks once more**

Run: `npm run build`
Expected: success.

Run: `git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`
Expected: `src/renderer/src/sim/tuning.ts:7:export const SIM_VERSION = <N + 1>;`

Run: `git grep -n "Math.hypot\|Math.PI\|Math.sin\|Math.cos\|\*\*" -- src/renderer/src/sim/duel/helmFlight.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/tactical/physics.ts`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json
git commit -m "test(playtest2feedback): same-version bless at SIM_VERSION <N + 1> for the crew Helm's Newtonian flight (duel goldens re-recorded once)" -m "<the four blessed lines from Step 1>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand to the owner (spec §1, §8 Manual)**

Do not merge. Report to the owner that the branch is ready to play. Name the five manual checks from spec §8:
- the throttle feels like a held lever;
- coasting feels right;
- mouse steering and the boost feel good;
- the thrusters give useful dodges;
- the power split is a real choice.

Take screenshots by the visual check method (playwright-core outside the repo, Electron `_electron.launch` on `out/`):
- the crew HelmStation block mid-throttle with a cap below 100;
- the Helm map with a steering marker and a puff;
- the PRESSURE gauge refilling.

Name the merge notes too:
- spec §5's merge note (a), the Engineering start split;
- (b), the engine factor;
- (c), SIM_VERSION order against pew pew W-1;
- Decisions 4 and 13, the shared `shipClass` and `soundBank` rows.

---

## Self-review

**1. Spec coverage:**
- **§1:**
  - The branch and worktree, cut from master (Task 1 Step 1).
  - Nothing merges before the owner plays it (Global Constraints; Task 13 Step 6).
  - The duel only (Decision 3: the dev flight view follows `flightFor`; the sector Helm is untouched).
  - `newtonianHelm` on the Cutter only (Task 2, tested).
  - The Valkyrn is unchanged:
    - `DEFAULT_FLIGHT` through `flightFor` (Task 2);
    - the `throttle` command (Task 5, tested), W/S notches, A/D turning and the held aim to held heading (Task 7, tested);
    - `helmHoldsUnattended` (the non-newtonian branch of the step is kept as is, Task 5);
    - `scriptedPilot.ts` untouched;
    - no thrusters, boost or `helmPower` (Tasks 5 and 7, tested);
    - bit-identical flight (Task 2, against today's `flyShip` copied into the test);
    - the Valkyrn gate and tests pass at every task (Global Constraints).
- **§2:**
  - `CREW_FLIGHT` and `flightFor` (Task 2).
  - `stepDuel`'s `tuning` as the override (Task 2).
  - The prediction defaults (Task 2), so `scripted.ts`, `situationModel` and `tacticalModel` follow with no change of their own.
  - `MAX_SPEED`'s cap on the drag-0 path in the spec's four steps (Task 2, tested: thrust-only ticks, the perpendicular push, gravity past 400).
  - Drag ships run today's path (Task 2, tested).
  - The Engines failed: drift and working thrusters (Tasks 2 and 6, tested).
- **§3:**
  - `thrMille` and its bounds (Task 3).
  - `throttleHeld` (Task 4).
  - The ramp, the return and the clamp (Tasks 3 and 5, tested with the spec's numbers).
  - `crewThrust` (Task 3).
  - Unquantised thrust and proportional reverse (Task 2, tested).
  - The engine factor still applies (Task 2).
  - `throttle` refused `unavailable` for the crew (Task 5, tested).
  - The removed crew controls (Tasks 9 and 11: no notches, no wheel, no W/S notch stepping or Shift+W at the crew Helm; the throttle keys' crew rows are gone).
  - Client prediction: Single player shows the sim's value (Task 9); online uses `thrMille()` over the unacknowledged frames (Task 10); `throttleBase`, `throttleSent` and `shownThrottle` are unused at the crew Helm (Tasks 9 and 10).
  - `sentAxes` and `onlineSource.axes()` read `crewThrust` through `crewAxes` (Tasks 9 and 10).
  - `scene.ts`'s `sitThrottle` reads `thrMille` (Task 9). Telemetry (Task 8).
  - The held heading is kept (Tasks 5 and 7).
  - The unattended rule in the step, mirrored in `stateAxes` and `sentAxes` (Tasks 5 and 9, tested).
- **§4:**
  - The keys and their ship-relative push (Tasks 2, 6 and 9, tested at two headings).
  - `rcsX` and `rcsY` (Task 4).
  - The tank and `rcsAcc` (Task 3).
  - The tick order: boost, then fore/aft, then side, then the compressor (Tasks 6 and 7).
  - The refill times (Tasks 3 and 6, tested exactly).
  - Not scaled by the Engines (Task 2).
  - NO PRESSURE (Tasks 9 and 11).
  - `helmVent` (Tasks 3 and 6).
- **§4a:**
  - Steering by `HeldInput.aim` (Task 7), sent from the Helm map while the left button is held (Tasks 9 and 10); the runtime's `steer` extended (Task 9).
  - The aim becomes the held heading; release settles on it (Task 7, tested).
  - The turn order, and `moveX` ignored as an authority rule (Task 7, tested).
  - The scripted crew turns by `aim` or `face` (Task 7, tested).
  - The boost: its four conditions, the far bands, 4 gas and 2× (Task 7, tested), and settling without chatter on an aim, a held heading and auto-face (Task 7, tested).
  - `helmBoost` is pure and shared (Tasks 7, 9 and 10).
  - `Axes.turnBoost` and `flyShip`'s turn (Task 2).
  - The `defs.ts` assertion (Task 2).
  - A left click only steers on the crew Helm (Task 9).
  - PORT and STBD (Task 11).
  - The "turn" refusal on a steer (Tasks 9 and 10, tested).
- **§5:**
  - `HELM_BARS` and the `createDuel` `opts.helmBars`; `startRound` passes it on; a restore takes the default (Task 3, tested).
  - The split and the round start, 3 + 1 (Tasks 3 and 5).
  - The ENGINE cap and floor (Tasks 3 and 5).
  - `helmPower` and its admission order (Task 5, tested; Decision 7).
  - Keys 1 and 2, and the cells (Tasks 9 and 11; Decision 10).
  - The same-tick clamp (Task 5, tested).
  - The losing-bars rule (Task 3, tested as a pure rule; nothing loses bars until Engineering).
  - The merge notes (Task 13 Step 6).
- **§6:**
  - The throttle bar, cap line and locked part; the PRESSURE gauge and rate; the power strip; PORT/STBD (Task 11, tested).
  - The puffs (Task 12, tested; Decision 11 for online).
  - The `sfx.rcs` hiss (Task 12; Decisions 12 and 13), added through the audio manifest script.
  - The hum follows `|crewThrust|` through the axes (Tasks 9 and 10).
  - The steering marker (Task 12).
  - The predicted path flies `crewAxes`: the held thrust, thrusters and boost (Tasks 9 and 10).
  - The controls list and key hints (Task 11, with the sit card and the readout help).
  - `uiProbe.ts` (Task 11).
- **§7:**
  - The held schemas in the codec and both checkpoints (Task 4, tested).
  - The authority's expiry and pause (Task 4, tested, including the lost release frame's bound).
  - Local input (Task 9) and online input (Task 10).
  - `helmPower` in `DuelCommand`, `duelWire`, `DUEL_KINDS`, the module's commands and reasons, and `isConsoleCommand` (Tasks 5 and 9). `duelRules.ts` needs no edit: the codec and the step carry it, and `create` passes no `opts`.
  - The helm module's fields, their hash and snapshot bounds; `DUEL_NOT_SNAPSHOTTED`; the pinned lists in `tests/duelModules.test.ts` (Tasks 3 and 5).
  - The step order (Tasks 5 to 7, `crewHelm`'s doc).
  - The flight step (Task 2).
  - The scripted crew (Tasks 5 and 7).
  - Determinism: integer state, SIM_VERSION once, the goldens re-recorded once, the trajectory pins moved, the Valkyrn's not, and `npm run test:determinism` (Tasks 1, 8 and 13).
- **§8:**
  - Every listed test is in Tasks 2, 3, 4, 5, 6, 7 and 9 to 12.
  - The gates are tuned within named bounds (Task 8).
  - The manual checks (Task 13 Step 6).

**2. Placeholder scan:** every code step carries complete code. Five kinds of value cannot be known before running, and each is produced by an explicit procedure with exact commands and an exact edit rule:
- `N` (Task 1 Step 1);
- the known-red list `K` (Tasks 2, 5 and 7, with a strict admission rule);
- the gate knobs (Task 8 Step 4, in order and bounded);
- the `K` re-pins (Task 8 Step 5, with a probe given for the common pin and the rule for the others);
- the migrated Valkyrn-behaviour tests (Task 5 Step 8 and Task 7 Step 7: a found-by-grep list with one mechanical edit).

**3. Type consistency:**
- **The state and its tuning:**
  - `newtonianHelm` (`ShipClassDef`) is read in Tasks 2, 5, 7, 8, 9, 10 and 11.
  - `flightFor` and `CREW_FLIGHT` (Task 2).
  - `Axes.turnBoost`, `rcsX` and `rcsY` (Task 2) are written by `crewHelm` (Tasks 6 and 7) and `crewAxes` (Task 7), and read by `ventOf` (Task 7) and the puffs (Task 12).
  - `DuelState.thrMille`, `rcsGas`, `rcsAcc`, `compressor`, `helmBars` and `helmVent` (Task 3).
  - The tuning names come from `sim/duel/tuning.ts` (Task 3) and from `sim/tactical/tuning.ts` (`MAX_SPEED`, `RCS_THRUST`, `RCS_TURN_BOOST`, `BOOST_FAR`, Task 2).
- **The pure helpers and the step:**
  - The `helmFlight.ts` exports `crewThrust`, `heldAxis`, `engineBars`, `throttleCap`, `throttleFloor`, `compressorMax`, `rampThrottle`, `rampTicks`, `compress`, `vents`, `compressorAfterLoss` and `noVent` (Task 3), and `ventOf` (Task 7).
  - The step exports `headingDelta`, `helmBoost` and `crewAxes` (Task 7); `autoFacePoint` lives in `hunter.ts` (Task 7).
  - `helmPower { delta: 1 | -1 }` (Task 5) is used in Tasks 9 and 10.
- **The client:**
  - The `HeldInput` fields (Task 4).
  - `KeySample.throttleHeld`, `rcsX`, `rcsY` and `power`, `ConsoleInput.helmPower`, `crewHelmHeld`, `RCS_CODES` and `POWER_CODES` (Task 9) are used in Tasks 10 and 11.
  - `helmSteer` and `onHelmMap` (Task 9).
  - `DuelRuntimeDeps.steerHeld`, `DuelRuntime.thrMille`, `DuelSceneOptions.leftHeld`, `DuelViewSource.thrMille` (Task 9) and `DuelViewSource.helmVent` (Task 12) are implemented by the online source in Task 10.
  - `sessionHeld` and `UNACKED_MAX` (Task 10).
- **The console, the render and the audio:**
  - `ConsoleModelInput.thrMille` (Task 9).
  - `CrewHelmPanel` and `crewPanel` (Task 11).
  - `RefusedControl 'thrusters'` (Task 9) is read by `HELM_CONTROLS` and HelmStation (Task 11).
  - `PuffDraw`, `TacticalModelInput.vent` and `steerTo`, `HelmDraw.steer` (Task 12).
  - `RCS_HISS`, `RCS_HISS_GAP_S`, `rcsHiss`, `DuelAudioFrame.vent` and `SFX.rcs` (Task 12).
