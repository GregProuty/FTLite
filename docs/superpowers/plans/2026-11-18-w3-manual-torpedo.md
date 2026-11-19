# W-3 Manual Torpedo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the crew torpedo an AUTO / MANUAL mode. AUTO is today's torpedo, unchanged. In MANUAL, F launches it with no lock and no range limit, and it never auto-launches. It then flies like the Helm with the throttle fixed: full thrust while its fuel lasts, then a coast; A/D turn it; a right click or drag on the Weapons map gives it a heading to hold. On a ship it strikes the room under its impact point for 3 hull. The mode is copied onto the torpedo at launch. V and an AUTO / MAN tag on the TORPEDO card toggle it, and the Weapons camera follows a MANUAL torpedo while it flies.

**Architecture:** There are two new hashed sim fields: `ShipSystems.torpManual` (the mode) and `Missile.manual` (copied at launch). They go through `sim/tactical/hash.ts`, so the duel snapshot follows with no snapshot code change. `canLaunch` learns the mode: MANUAL drops the range test. `applyWeaponsInput` skips the auto-launch in MANUAL, and `launchMissile` copies the mode and leaves the locks alone. `land` strikes `roomAtImpact` for a MANUAL torpedo. `flyMissile` takes a `steer` argument (−1, 0 or 1) that a MANUAL torpedo turns by instead of `homingTurn`. `stepDuel` computes `steer` with `manualTorpTurn`: A/D first, else the Helm's hold law (`holdTurn`, factored out of `headingTurn`) toward a held heading. The steering arrives as two new optional `HeldInput` fields, `torpTurn` and `torpHeading`, read from the Weapons attendant into two new `ShipInput` fields. The held heading lives on the client, not in the sim: the client re-sends it every frame until A/D or the flight's end clears it. One new command, `torpMode {manual}`, is set in the step's admission (as W-2's `laserMode` is), and it comes before `missileLaunch` in `WEAPON_ORDER`. On the app side: the scene turns the right button into `MapRequests.torpHeading` while a MANUAL torpedo flies; the Single player runtime and the online seat send V, F and the held steering; a small `trackManualTorpedo` helper makes the Weapons camera follow and return; and the TORPEDO card gets its tag.

**Tech Stack:** TypeScript, Vitest (+ jsdom for UI tests), Pixi.js (tactical layer), React + zustand (console), zod (codec), Electron/electron-vite.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md`, sections 3 to 7 (W-3 only). W-1 (pew pew) and W-2 (manual laser) are merged; their behaviour does not change.
- **Exact names and values (binding):**
  - **Command:** `torpMode { manual: boolean }`.
  - **Sim state:** `ShipSystems.torpManual: boolean` (false AUTO, true MANUAL; the crew only) and `Missile.manual: boolean` (copied from `torpManual` at launch; false in a free entry).
  - **Held input:** `HeldInput.torpTurn?: number` (−1, 0 or 1; absent means 0) and `HeldInput.torpHeading?: number` (a heading index 0..255; −1 or absent means none).
  - **Ship input:** `ShipInput.torpTurn: number` and `ShipInput.torpHeading: number` (0 and −1 in `IDLE_INPUT`, `UNCREWED_INPUT`, the Hunter's input and an unattended Weapons).
  - **Key:** V (`PRESS_CODES.KeyV: 'torpMode'`, `KeyAction 'torpMode'`). The spec says X, but X is Stand (`PRESS_CODES.KeyX: 'stand'`) and C is the camera (`KeyC: 'camera'`). V is the nearest unbound letter (Decision 1).
  - **Tag:** reads `AUTO` / `MAN`, `<Button name="torp-mode">` (data-testid `console-torp-mode`).
  - **Sim functions:**
    - `sim/tactical/manualTorpedo.ts`: `manualTorpTurn(m, turn, heading)` and `manualTorpedoFlying(state, i?)`.
    - `sim/tactical/hunter.ts`: `holdTurn(heading, h)`.
    - `sim/duel/step.ts`: `heldTorpSteer(h)`.
    - `sim/tactical/weapons.ts`: `canLaunch(state, i, torpRock?, manual?)`.
    - `sim/tactical/missiles.ts`: `flyMissile(state, i, steer = 0)`.
    - `sim/tactical/state.ts`: `placeMissile(state, i, f, manual = false)`.
  - **App:**
    - `MapRequests.torpHeading(h)` and `takeTorpHeading()`.
    - `DuelRuntimeDeps.takeTorpHeading?()`.
    - `app/duel/torpedoCamera.ts`: `TorpedoFollow`, `createTorpedoFollow()` and `trackManualTorpedo(cam, memo, flying)`.
    - `WeaponsPanel.torpManual?` and `torpFlyingManual?`.
    - `refusal(d, control, manual?)`.
- **No new tuning knob:** a MANUAL torpedo uses the missile def's own `thrust` (`MISSILE_THRUST` 160), `turnStepsPerTick`, `boostTicks`, `fuelTicks`, `lifeTicks`, `armTicks`, `radius` and `hull` (`MISSILE_HULL` 3).
- **Sim rules:**
  - Only + − × ÷ and sqrt in `src/renderer/src/sim/**`. `tests/helpers/determinismGuard.ts` allows `Math.abs/ceil/floor/round/min/max/sign/imul/sqrt` only: no `Math.PI`, no trig, no `**`, no `Math.hypot`.
  - Turning uses the heading tables (`hx`, `hy`). There is no randomness in W-3.
  - No sim file imports from `app/`, `render/`, `input/` or `tests/`.
- **Version (binding):**
  - SIM_VERSION goes 56 → 57 once (`src/renderer/src/sim/tuning.ts:7`).
  - The bless guard (`scripts/golden/blessGuard.ts`) lets a bump through only when the canonical trace and the duel oracle prove every run unchanged per tick. New hashed fields cannot pass that, so Task 1 bumps the version alone and blesses, and Task 8 does the one re-record as a same-version `npm run bless`.
  - Never pass `--fresh`. Never hand-edit `tests/golden/*.json` or `tests/fixtures/determinism-v2.json`.
  - The proof baselines are `npx tsx scripts/golden/canonical-trace.ts baseline` and `npx tsx scripts/golden/duel-oracle.ts baseline`. If a check refuses because a baseline is stale or from another checkout, re-record it as Task 1 Step 4 says.
- **No tuning (binding):** W-3 moves no tuning knob. MANUAL is off by default, and neither the scripted gunner nor the Hunter ever sends `torpMode`, so every AUTO duel must be unchanged tick for tick.
  - Task 8 proves this with the duel oracle's additive mode (`ADDITIONS[57]`, `frozen`).
  - Task 8 also checks that `tests/duelGates.test.ts`, `scripts/duel-telemetry.ts` and `scripts/valkyrn-telemetry.ts` print exactly Task 1's numbers. `tests/duelGates.test.ts` is never edited.
  - If any gate number or golden tick count moves, stop. It is a defect in the AUTO path (the oracle names the first differing field and tick), never a reason to tune.
- **Known-red window:** from Task 2 (new hashed fields) until Task 8's bless, these fail by design:
  - `tests/duelGolden.test.ts`
  - `tests/duelRematchGolden.test.ts`
  - `tests/golden.test.ts` (its `basic.json` embeds the content digest of every sim file)

  Every other test must pass at the end of each task. Each task runs its own targeted tests; the full suite runs in Tasks 1 and 8.
- **Re-pin rule:** a trajectory-pinned test is re-pinned only after a deliberate gameplay change. These are the pinned tests: `tests/duelCheckpoint.test.ts`, `tests/duelSnapshot.test.ts` (seed/tick), `tests/duelModules.test.ts` (`played(6, …)`), `tests/tacticalSlots.test.ts`, `tests/duelScripted.test.ts` and `tests/duelGates.test.ts`. W-3 changes no AUTO trajectory, so a failing pin is a bug to fix, never a re-pin.
- **Pointer rules (W-1, W-2):** these stay unchanged:
  - The left click on the Weapons map is the pew's.
  - The pointer's bearing on the open map is the MANUAL laser's aim.
  - The right button on the Weapons map pans the camera, except while the crew's MANUAL torpedo flies. Then it is the torpedo's held heading (`onWeaponsMap(p, contactShown, statusRows)` gates it) and the camera does not pan with it.
- **Generated files come only from their scripts:** `tests/golden/*.json` and `tests/fixtures/determinism-v2.json` from `npm run bless`. W-3 adds no asset, sound or credit.
- **Test commands:** targeted `npx vitest run <files>`; `npx tsc -b`; and the full suite `npx vitest run --maxWorkers=4`, always after `npx electron-vite build`.
  - Never run two vitest processes at once.
  - A full-suite timeout under load is re-run alone with `npx vitest run <that file>` before it counts as a failure. The load-sensitive files are `tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts`, `tests/gate-*.test.ts` and `tests/duelGates.test.ts`.
- **Line endings:** the working copies are CRLF (`core.autocrlf=true`; the index is LF). Change existing files with the Edit tool, which keeps their endings; never hand-convert endings. New files may be written with LF; git normalises them on commit.
- **Worktrees:** never delete a `node_modules` junction in a worktree (including `services/signalling/node_modules`). A missing one is recreated, never "cleaned".
- **Determinism logs:** `npm run test:determinism` rewrites tracked logs under `.superpowers/sdd/2026-11-14-net-1b-durability/`. After every run, restore them with `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability` before staging anything.
- **Git:**
  - Never `git add -A`, `git add .` or `git stash`; stage by name.
  - Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (passed as the last `-m`).
  - Files are UTF-8.
  - Line numbers below were read on master at `92733195`: **match every edit by the quoted text**, not the number.
- **Comments:** a header comment citing the spec section on each new file; doc comments on exports; cite "W-3 (pew pew spec §x)" on changed lines that need a reason.

## Decisions where the spec leaves room, and where the code forces a choice

1. **The key is V.** The spec's X is Stand, and C (the controller's first choice) is the camera's snap-back and follow toggle at Weapons. V sits next to both and is bound nowhere: the duel's `PRESS_CODES` bind E, Q, F, Z, X, C, M, W, S, the moves are WASD, G pings, T is the contact window's, and R is only the sector's callout. The Settings list names Z and V (spec §5's "Z and X").
2. **The held heading lives on the client.** The sim keeps no per-torpedo hold, so `Missile` gains only `manual`. This keeps a free pool entry all zeros and every AUTO run's new fields frozen for the oracle.
   - **Client:** keeps the heading (`torpHold`) and sends it as `torpHeading` in every held frame while the crew's MANUAL torpedo flies. It clears the heading when A/D is held, when the flight ends, on a new round and on a seat change.
   - **Sim:** in `manualTorpTurn`, A/D (`torpTurn`) always wins; otherwise a valid `torpHeading` turns the nose by `holdTurn`, the Helm's own hold law (`headingTurn` now calls it, unchanged).
   - Held input is re-sent every pump, so this is the same pattern as the Valkyrn's `aim`.
3. **Flight is AUTO's flight with a different turn source.** The thrust, fuel, boost and coast stay as they are; only the turn changes.
   - `flyMissile` turns a MANUAL torpedo by `steer`, and never calls `homingTurn`, only while it is fuelled and past its boost (`boostTicks`, 20).
   - So it "launches forward as today", and once its fuel is spent it coasts unsteered, as an AUTO torpedo does.
   - It thrusts at full `def.thrust` every fuelled tick, with no drag.
4. **A MANUAL launch ignores the locks and leaves them alone.**
   - `launchMissile` copies `torpManual` onto the torpedo. In MANUAL it sets `torpRoom = -1` and `torpRockFlying = -1` (it homes on nothing and strikes the impact room), and it does not consume `torpLock` or `torpRock`.
   - `canLaunch` in MANUAL drops `torpedoInRange` (no target, no range), and `applyWeaponsInput` never auto-launches in MANUAL.
   - A lock set before a toggle back to AUTO therefore still auto-launches, as today.
5. **A MANUAL hit** strikes `roomAtImpact(target, m.x, m.y)` (as a self-hit does today) and costs the def's `hull` (3). It ignores `torpRoom` and `lock`. Shields stay bypassed (spec §7b, unchanged). Every collision rule is unchanged: planet, rocks with their blast, the map edge, the arming time, ships, the other torpedo, pew rounds (`shootDown`) and expiry.
6. **Who steers.**
   - `stepDuel` passes `steer` only for a MANUAL torpedo and only while that ship's input has `weapons`. The duel step fills `torpTurn` and `torpHeading` from the Weapons attendant's held input (`heldTorpSteer`), and 0 and −1 otherwise, so only that ship's Weapons seat flies it.
   - The Hunter's input is always 0 and −1, and the validator refuses `torpManual` on any slot but the crew's and `manual` on any torpedo but the crew's.
   - Every round starts AUTO (`systemsFor`).
7. **The mode is set during admission.** `torpMode` is set in `sim/duel/step.ts`, as `laserMode` is, so a same-tick `missileLaunch` is judged in the new mode. `WEAPON_ORDER` becomes `laserMode, torpMode, laserLock, torpLock, rockLock, laserCharge, laserFire, missileLaunch, pewFire`, and `shipModule.commands` matches it. A same-value `torpMode` is `noop`. Every class has a torpedo, so there is no `unavailable` for the class.
8. **The right button on the Weapons map.** While the crew's MANUAL torpedo flies, the right button sets its heading:
   - A press, every held frame of a drag, and a release on the open map each ask for the bearing from the torpedo's drawn marker to the pointer. On the torpedo itself, inside `pickRadius`, the request is −1, which clears the hold.
   - Nothing is asked while a weapon card is picked up, over a console block, or with the contact window under the pointer.
   - While it flies, the Weapons camera's right drag does not pan (`createCameraInput.apply`'s `aims`).
9. **The camera** is handled by `trackManualTorpedo`, which runs on the Weapons camera every frame before the existing follow update.
   - **At launch:** when a MANUAL torpedo's flight starts, it remembers the camera's follow mode and centre, then follows the missile (`followBody`).
   - **When the flight ends:** if the camera still follows the missile, it goes back to what it was. That is the ship (eased), or, from a free view, that view's centre.
   - **If the player moved it:** a camera the player changed during the flight (C, a pan) is left alone.
   - **Rounds:** each new round starts a fresh memo with the fresh cameras.
10. **Online:**
    - **`torpMode`** follows W-2's `laserMode` pattern (`torpModeSent`, a round and attach reset).
    - **A MANUAL `missileLaunch`** follows the always-send rule.
      - NO GUNNER, TORPEDO FLYING and WEAPONS OFFLINE refuse locally.
      - A press on a replica with an empty magazine is sent anyway, because the magazine may have refilled on the authority.
      - An `unavailable` answer to a launch this seat sent in MANUAL shows the replica's current launch refusal, else NO TORPEDOES. OUT OF RANGE never applies in MANUAL.
    - **An AUTO launch** keeps today's local `canLaunch` gate and words.
    - **Held input** reaches the authority through the duel codec's `held` schema, and from there the authority's held array and `stepDuelTick`. But four strict schemas and the core's held handling list the held fields by hand, and all of them gain `torpTurn` and `torpHeading`. Without that, a checkpoint or replay holding one would fail validation, and a pause or an expired frame would not clear it:
      - `net/codec.ts`
      - `authority/duelCheckpoint.ts`
      - `authority/replay.ts`
      - `authority/checkpoint.ts`
      - `authority/core.ts`'s expiry and pause clearing
11. **What the card says:**
    - **The tag:** the TORPEDO card's `AUTO` / `MAN` tag sits where the LASER card's does (card x 72..108), is lit in MANUAL, and presses `torpMode` as V does.
    - **Not flying:** in MANUAL the card says `MANUAL` instead of IN RANGE / OUT OF RANGE.
    - **Flying:** a MANUAL torpedo in flight says `STEER A/D` instead of FLYING.
    - **The lock tone** (`torpedoTone`) is off in MANUAL, because a lock never launches there.
    - **The map's torpedo path prediction** (`predictMissile`) is unchanged, so a MANUAL torpedo's path shows its unsteered flight.
12. **Out of scope, by spec §6:**
    - **Mid-flight changes:** changing the mode during a flight does not change the flying torpedo, because the mode is copied at launch.
    - **The Valkyrn:** its Flight seat sends no `torpMode`, and its `canLaunch` reads its AUTO mode.
    - **The sector mode.**

---

### Task 1: SIM_VERSION 56 → 57 alone, proved and blessed; the gate numbers and the additive-proof baseline recorded

**Files:**
- Modify: `src/renderer/src/sim/tuning.ts:7`
- Regenerated by `npm run bless`: `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`

**Interfaces:**
- Consumes: master at SIM_VERSION 56 (`92733195`).
- Produces:
  - `SIM_VERSION === 57` for every later task.
  - The gate numbers at 57 in this commit's message (Task 8 compares them).
  - A duel-oracle baseline at 57 in the temp folder (Task 8's additive proof).

- [ ] **Step 1: Pre-flight**

Run: `git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`
Expected: `src/renderer/src/sim/tuning.ts:7:export const SIM_VERSION = 56;`

Run: `git status --short -- src tests scripts`
Expected: only the untracked `scripts/playtest-audit.ts`. If any tracked file under `src`, `tests` or `scripts` is modified, stop and report.

- [ ] **Step 2: Record both baselines at SIM_VERSION 56**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 56: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to <temp>\trace.json`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version 56: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0. Note `<R>`, `<T>` and `<F>`. W-2 recorded 21 runs, 229672 ticks and 630 fields at 56.

- [ ] **Step 3: The version**

`src/renderer/src/sim/tuning.ts` line 7 becomes:

```ts
export const SIM_VERSION = 57;
```

Nothing else in `src/` changes in this task; `MIGRATIONS` and `ADDITIONS` in `scripts/golden/duelOracle.ts` are not touched.

- [ ] **Step 4: Both proofs before the bless**

Run: `npx tsx scripts/golden/canonical-trace.ts check`
Expected: `per-tick canonical trace identical, sim version 56 -> 57: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <sha>)`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts check`
Expected: `duel oracle: <R> runs, <T> ticks, <F> named fields, results, events and telemetry identical at every tick field for field, sim version 56 -> 57 (baseline HEAD <sha>)`, exit 0, with Step 2's numbers.

A check may refuse because its baseline is stale: another sim version, another checkout's cwd, or a HEAD other than `92733195`. If so:
1. Set line 7 back to `export const SIM_VERSION = 56;` with Edit.
2. Re-run both Step 2 commands.
3. Set line 7 to 57 again.
4. Re-run both checks.

Any other failure: stop and report.

- [ ] **Step 5: Bless**

Run: `npm run bless`
Expected, exit 0 (new hashes; counts, ticks and outcomes are master's):
```
blessed tests/golden/basic.json: 120 checkpoints, final <hex>
blessed tests/golden/duel-1.json: 24 checkpoints, 14687 ticks, outcome 1, final <hex>
blessed tests/fixtures/determinism-v2.json: sim version 56 -> 57, 1800 samples and 330 boundaries unchanged apart from the version and hashes
blessed tests/golden/duel-rematch.json: 39 checkpoints, rematch on tick 14687, rounds 14687 ticks outcome 1 then 8785 ticks outcome 2, final <hex>
```

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

- [ ] **Step 6: The full suite at 57, and the gate numbers**

Run, in order: `npx tsc -b`, then `npx electron-vite build`, then `npx vitest run --maxWorkers=4`.
Expected: no type errors; the build succeeds; every test file PASS (re-run a load timeout alone first).

Run: `npx tsx scripts/duel-telemetry.ts`
Expected: ten duel lines, then the gate summary. Copy the summary block and the `passive median` line for the commit message. The summary block is the `median length`, `crew wins`, `crew losses`, `at the cap` and `planet-contact ends under 30 s` lines. W-2 printed these at 56:
- median length 208.8 s
- crew wins 6, crew losses 4, draws 0, at the cap 0
- planet-contact ends under 30 s: 0
- passive median 139.3 s, shortest 108.5 s

Run: `npx tsx scripts/valkyrn-telemetry.ts`
Expected: the Valkyrn gate summary. Copy its summary lines for the commit message.

- [ ] **Step 7: Commit**

`git status --short -- src tests` lists exactly the five files below.

```bash
git add src/renderer/src/sim/tuning.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json
git commit -m "chore(w3): SIM_VERSION 56 -> 57 alone, blessed (canonical trace and duel oracle prove every run unchanged per tick)" -m "<the four blessed lines from Step 5>" -m "Gates at 57 (Task 8 must print these exactly): <the duel-telemetry summary lines and passive median from Step 6>; Valkyrn: <the valkyrn-telemetry summary lines>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: The additive-proof baseline at 57**

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version 57: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0, with Step 2's `<R>`, `<T>` and `<F>`. Task 8 Step 1 checks the W-3 runs against this file. Do not record a duel-oracle baseline again before Task 8.

---

### Task 2: The torpedo mode and the per-torpedo flag as state; the MANUAL launch rules; hashed, cloned and bounded

**Files:**
- Modify:
  - `src/renderer/src/sim/tactical/state.ts`
  - `src/renderer/src/sim/tactical/missiles.ts` (`launchMissile`)
  - `src/renderer/src/sim/tactical/weapons.ts`
  - `src/renderer/src/sim/tactical/hunter.ts:129`
  - `src/renderer/src/sim/tactical/hash.ts`
  - `src/renderer/src/sim/duel/step.ts:210-211`
- Create: `tests/manualTorpedoMode.test.ts`
- Modify (tests the new shapes touch):
  - `tests/tacticalDeterminism.test.ts:115,121,122-128`
  - `tests/duelSnapshot.test.ts` (the `cases` list)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  // sim/tactical/state.ts
  // ShipSystems.torpManual: boolean   (false AUTO, every round's start; true MANUAL, the crew only)
  // Missile.manual: boolean           (copied from torpManual at launch; false in a free entry)
  export function placeMissile(state: TacticalState, i: number, f: MissileFlight, manual?: boolean): Missile;   // manual defaults to false
  // sim/tactical/weapons.ts
  // ShipInput.torpTurn: number (−1, 0, 1); ShipInput.torpHeading: number (0..255, −1 none); 0 and −1 in every literal
  export function canLaunch(state: TacticalState, i: number, torpRock?: number, manual?: boolean): boolean;   // manual defaults to systems[i].torpManual; in MANUAL no range test
  // sim/tactical/hash.ts: MISSILE_SLOT = 10 (the manual flag closes each entry)
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/manualTorpedoMode.test.ts`:

```ts
// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3, §4, §5): the torpedo's mode and the per-torpedo flag.
// Every round starts AUTO, and the Hunter always. In MANUAL a launch needs no lock and no range, a torpedo lock never
// auto-launches, and the launch copies the mode onto the torpedo, leaving the locks alone. The mode and the flag are
// hashed, cloned and bounded: only the crew is ever MANUAL, and only the crew flies a MANUAL torpedo.
import { describe, expect, it } from 'vitest';
import { flattenTactical, hashTactical, TACTICAL_MODULES, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { launchMissile } from '../src/renderer/src/sim/tactical/missiles';
import { beginRockTick } from '../src/renderer/src/sim/tactical/rocks';
import { cloneTactical, createTacticalState, missileOf, placeMissile, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { applyWeaponsInput, canLaunch, IDLE_INPUT, tickWeapons, UNCREWED_INPUT, torpedoInRange } from '../src/renderer/src/sim/tactical/weapons';

/** The crew at (0, 1500) nose north and still, no rocks, the Hunter at `enemyAt` (default far off, out of torpedo range),
 *  still, a fresh tick's rock masks, no events. */
function open(enemyAt = { x: 2000, y: 2000 }): TacticalState {
  const st = createTacticalState(5);
  st.rocks.fill(0);   // every seeded rock gone (the seeded grid ignores empty slots)
  beginRockTick(st);
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: enemyAt.x, y: enemyAt.y, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.events = [];
  return st;
}
/** One weapons tick of the crew: its commands, then its clocks (stepDuel's two weapon calls, nothing else). */
function weaponsTick(st: TacticalState, input = IDLE_INPUT): void { applyWeaponsInput(st, 0, input); tickWeapons(st, 0, input); }
/** The offset of a tactical field in flattenTactical's values. */
const offsetOf = (s: TacticalState, name: string): number => {
  let at = 0;
  for (const m of TACTICAL_MODULES) for (const f of m.fields(s)) { if (f.name === name) return at; at += f.count; }
  throw new Error(`no tactical field ${name}`);
};
const flight = { x: 500, y: 500, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 };

describe('the torpedo mode (spec §3)', () => {
  it('every slot starts AUTO; a free pool entry is not manual; the ship inputs steer nothing', () => {
    const st = createTacticalState(5);
    expect([st.systems[0].torpManual, st.systems[1].torpManual, st.missiles[0].manual, st.missiles[1].manual]).toEqual([false, false, false, false]);
    for (const input of [IDLE_INPUT, UNCREWED_INPUT]) expect([input.torpTurn, input.torpHeading]).toEqual([0, -1]);
    expect(placeMissile(st, 0, flight).manual).toBe(false);   // the default: an AUTO torpedo
  });
  it('the launch copies the mode onto the torpedo; a later toggle does not change it', () => {
    const st = open();
    st.systems[0].torpManual = true;
    launchMissile(st, 0);
    const m = missileOf(st, 0)!;
    expect(m.manual).toBe(true);
    st.systems[0].torpManual = false;
    expect(missileOf(st, 0)!.manual).toBe(true);
    const auto = open({ x: 0, y: 1300 });
    launchMissile(auto, 0);
    auto.systems[0].torpManual = true;
    expect(missileOf(auto, 0)!.manual).toBe(false);
  });
});

describe('the MANUAL launch (spec §3, §5)', () => {
  it('needs no target and no range; still none in flight, a torpedo in the magazine and Weapons below level 2', () => {
    const st = open();
    expect(torpedoInRange(st, 0)).toBe(false);
    expect(canLaunch(st, 0)).toBe(false);   // AUTO: out of range
    st.systems[0].torpManual = true;
    expect(canLaunch(st, 0)).toBe(true);
    expect(canLaunch(st, 0, -1, false)).toBe(false);   // the mode can be given (the runtime judges a queued toggle)
    st.systems[0].magazine = 0;
    expect(canLaunch(st, 0)).toBe(false);
    st.systems[0].magazine = 2; st.systems[0].rooms[Room.Weapons] = 2;
    expect(canLaunch(st, 0)).toBe(false);
    st.systems[0].rooms[Room.Weapons] = 1;
    placeMissile(st, 0, flight, true);
    expect(canLaunch(st, 0)).toBe(false);
  });
  it('a missileLaunch launches it out of range; the locks stay, the impact room is the target room', () => {
    const st = open();
    Object.assign(st.systems[0], { torpManual: true, torpLock: Room.Engines });
    const magazine = st.systems[0].magazine;
    weaponsTick(st, { ...IDLE_INPUT, missileLaunch: true });
    expect(missileOf(st, 0)?.manual).toBe(true);
    expect([st.systems[0].magazine, st.systems[0].missilesLaunched, st.systems[0].torpLock, st.systems[0].torpRoom, st.systems[0].torpRockFlying]).toEqual([magazine - 1, 1, Room.Engines, -1, -1]);
  });
  it('a torpedo lock never auto-launches in MANUAL; in AUTO it does, as today', () => {
    const manual = open({ x: 0, y: 1300 });
    Object.assign(manual.systems[0], { torpManual: true, torpLock: Room.Shields });
    for (let k = 0; k < 10; k++) weaponsTick(manual);
    expect(missileOf(manual, 0)).toBeNull();
    const auto = open({ x: 0, y: 1300 });
    auto.systems[0].torpLock = Room.Shields;
    weaponsTick(auto);
    expect(missileOf(auto, 0)?.manual).toBe(false);
    expect([auto.systems[0].torpLock, auto.systems[0].torpRoom]).toEqual([-1, Room.Shields]);   // the AUTO launch consumes the lock
  });
});

describe('the mode and the flag in the modules (spec §4)', () => {
  it('move the hash, are copied by the clone, and are bounded by the validator', () => {
    const st = createTacticalState(5), shape = createTacticalState(5), base = hashTactical(st);
    st.systems[0].torpManual = true;
    expect(hashTactical(st)).not.toBe(base);
    st.systems[0].torpManual = false;
    expect(hashTactical(st)).toBe(base);
    placeMissile(st, 0, flight, true);
    const withAuto = cloneTactical(st); withAuto.missiles[0].manual = false;
    expect(hashTactical(st)).not.toBe(hashTactical(withAuto));
    const copy = cloneTactical(st);
    expect(copy.missiles[0].manual).toBe(true);
    expect(flattenTactical(copy)).toEqual(flattenTactical(st));
    const values = Array.from(flattenTactical(st));
    expect(validateTacticalValues(shape, values)).toBe(values.length);
    const bad = (name: string, v: number, why: RegExp): void => {
      const x = [...values]; x[offsetOf(st, name)] = v;
      expect(() => validateTacticalValues(shape, x), `${name} = ${v}`).toThrow(why);
    };
    bad('systems.0.torpManual', 2, /out of range/);
    bad('systems.1.torpManual', 1, /only the crew torpedo has a manual mode/);   // the Hunter is always AUTO
    bad('missiles.0.manual', 2, /manual is not 0 or 1/);
    bad('missiles.1.manual', 1, /a free entry holds values/);
    const hunter = createTacticalState(5);
    placeMissile(hunter, 1, flight, true);   // the Hunter never flies a MANUAL torpedo
    expect(() => validateTacticalValues(shape, Array.from(flattenTactical(hunter)))).toThrow(/only the crew flies a manual torpedo/);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/manualTorpedoMode.test.ts`
Expected: FAIL (`torpManual` and `manual` are undefined; `canLaunch` ignores the mode).

- [ ] **Step 3: The state**

In `src/renderer/src/sim/tactical/state.ts`:

(a) In `ShipSystems`, after the line `  laserManual: boolean; laserAim: number;`, insert:

```ts
  /** W-3 (pew pew spec §3, §4): the torpedo's mode, false AUTO (launched on a lock in range, homing, as before) or true
   *  MANUAL (launched by missileLaunch alone, with no lock or range, and flown by the Weapons seat); only the crew's is
   *  ever MANUAL (torpMode), and every round starts AUTO. A launch copies it onto the torpedo (Missile.manual). */
  torpManual: boolean;
```

(b) Replace the two lines

```ts
/** A missile pool entry: in flight or free, and the ship slot that launched it. At most one in flight per ship; a free
 *  entry holds zeros. */
export interface Missile extends MissileFlight { active: boolean; owner: number }
```

with:

```ts
/** A missile pool entry: in flight or free, and the ship slot that launched it. At most one in flight per ship; a free
 *  entry holds zeros. W-3 (pew pew spec §3): `manual`, the launcher's torpedo mode at launch (a MANUAL torpedo flies its
 *  ship's Weapons input and strikes the room under its impact point); a toggle during the flight never changes it. */
export interface Missile extends MissileFlight { active: boolean; owner: number; manual: boolean }
```

(c) In `systemsFor`, the line `    laserManual: false, laserAim: -1   // W-2: every round starts AUTO, with no MANUAL burst pending` becomes:

```ts
    laserManual: false, laserAim: -1,   // W-2: every round starts AUTO, with no MANUAL burst pending
    torpManual: false   // W-3: and the torpedo too
```

(d) In `emptySystems`, the end `pewCharge: 0, pewShots: 0, pewHits: 0, laserManual: false, laserAim: 0 };` becomes:

```ts
pewCharge: 0, pewShots: 0, pewHits: 0, laserManual: false, laserAim: 0, torpManual: false };
```

(e) `emptyMissile` becomes:

```ts
export function emptyMissile(): Missile { return { active: false, owner: 0, x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0, manual: false }; }
```

(f) Replace `placeMissile` (its doc comment and body) with:

```ts
/** Put a missile in flight for ship i with these flight values: in the entry it already flies in, or the first free one
 *  (the launch, and tests). W-3: `manual` its mode (default AUTO). Returns it. */
export function placeMissile(state: TacticalState, i: number, f: MissileFlight, manual = false): Missile {
  const m = missileOf(state, i) ?? state.missiles.find((e) => !e.active);
  if (!m) throw new Error(`no free missile pool entry for ship ${i}`);
  Object.assign(m, { active: true, owner: i, x: f.x, y: f.y, vx: f.vx, vy: f.vy, heading: f.heading, headingAcc: f.headingAcc, age: f.age, manual });
  return m;
}
```

- [ ] **Step 4: The launch copies the mode**

In `src/renderer/src/sim/tactical/missiles.ts`, replace the whole `launchMissile` function with:

```ts
/** Ship i launches its torpedo from its nose (spec §7b). W-3 (pew pew spec §3): it carries the ship's torpedo mode; a
 *  MANUAL torpedo homes on nothing and strikes the room under its impact point, so it takes no target room and no rock,
 *  and it leaves the torpedo's room and rock targets for a later AUTO launch. */
export function launchMissile(state: TacticalState, i: number): void {
  const s = state.ships[i]!, sys = state.systems[i]!, def = classOf(state, i).slots.missile, h0 = hx(s.heading), h1 = hy(s.heading);
  placeMissile(state, i, {
    x: s.x + h0 * def.spawnOffset, y: s.y + h1 * def.spawnOffset,
    vx: s.vx + h0 * def.launchSpeed, vy: s.vy + h1 * def.launchSpeed,
    heading: s.heading, headingAcc: 0, age: 0
  }, sys.torpManual);
  sys.magazine--; sys.missilesLaunched++;
  if (sys.torpManual) { sys.torpRoom = -1; sys.torpRockFlying = -1; return; }   // W-3: no lock is read or consumed
  // FTL targeting spec §2: the torpedo strikes the room its target names at launch (−1: the lock room as it lands), and
  // a torpedo's target is a single shot, so it clears.
  sys.torpRoom = sys.torpLock; sys.torpLock = -1;
  // Spike ii §6.4: the rock target too is a single shot: the flying torpedo homes on it.
  sys.torpRockFlying = sys.torpRock; sys.torpRock = -1;
}
```

- [ ] **Step 5: The ship input fields and the MANUAL launch rules**

In `src/renderer/src/sim/tactical/weapons.ts`:

(a) In `ShipInput`, after the `laserFire: number;` member, insert:

```ts
  /** W-3 (pew pew spec §3): the Weapons attendant's steering of a MANUAL torpedo in flight this tick: `torpTurn` A/D (−1,
   *  0 or 1) and `torpHeading` the heading it holds (a heading index 0..255, −1 none). The duel step reads them from the
   *  held input; every other input sets 0 and −1. Read only while the ship's torpedo in flight is MANUAL (duel.ts). */
  torpTurn: number; torpHeading: number;
```

(b) `IDLE_INPUT` and `UNCREWED_INPUT` become:

```ts
export const IDLE_INPUT: ShipInput = { helm: true, weapons: true, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false, gunHeld: false, pewAim: -1, laserFire: -1, torpTurn: 0, torpHeading: -1, scanner: true };
```
```ts
export const UNCREWED_INPUT: ShipInput = { helm: false, weapons: false, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false, gunHeld: false, pewAim: -1, laserFire: -1, torpTurn: 0, torpHeading: -1, scanner: true };
```

(c) Replace `canLaunch` (its doc comment and body) with:

```ts
/** missileLaunch is accepted only with no missile in flight, a missile in the magazine, Weapons below level 2 and the
 *  target (spike ii: the rock target, `torpRock`) within torpedo range (weapons update spec §2). W-3 (pew pew spec §3): in
 *  MANUAL (`manual`, default the ship's torpedo mode) there is no target and no range test. */
export function canLaunch(state: TacticalState, i: number, torpRock = state.systems[i]!.torpRock, manual = state.systems[i]!.torpManual): boolean {
  const s = state.systems[i]!;
  return missileOf(state, i) === null && s.magazine > 0 && s.rooms[Room.Weapons] < 2 && (manual || torpedoInRange(state, i, torpRock));
}
```

(d) In `applyWeaponsInput`, the line

```ts
    if (crew && (s.torpLock >= 0 || s.torpRock >= 0) && canLaunch(state, i)) launchMissile(state, i);   // auto-launch, once (spike ii: or on a rock target)
```

becomes:

```ts
    if (crew && !s.torpManual && (s.torpLock >= 0 || s.torpRock >= 0) && canLaunch(state, i)) launchMissile(state, i);   // auto-launch, once (spike ii: or on a rock target); W-3: never in MANUAL
```

and `applyWeaponsInput`'s doc comment gains, before its closing `*/`: ` W-3 (pew pew spec §3): in MANUAL a torpedo lock never auto-launches, and missileLaunch needs no range.`

(e) In `src/renderer/src/sim/tactical/hunter.ts`, the `input` literal in `hunterThink` becomes:

```ts
  const input: ShipInput = { helm, weapons, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false, gunHeld: false, pewAim: -1, laserFire: -1, torpTurn: 0, torpHeading: -1, scanner: true };   // W-2, W-3: the Hunter is always AUTO
```

(f) In `src/renderer/src/sim/duel/step.ts`, the two lines of the `crew` literal become (Task 4 fills the torpedo fields from the held input):

```ts
  const crew: ShipInput = { helm: helm >= 0, weapons: gunner >= 0, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false,
    gunHeld: gunner >= 0 && (input.held[gunner] ?? NO_HELD).gunHeld === true, pewAim: -1, laserFire: -1, torpTurn: 0, torpHeading: -1, scanner: true };   // Valkyrn spec §7.1: the trigger of Weapons' attendant; W-1: pewFire sets pewAim; W-2: laserFire sets laserFire
```

- [ ] **Step 6: Hash, clone and bounds**

In `src/renderer/src/sim/tactical/hash.ts`:

(a) The two lines

```ts
/** Values per missile pool entry: active, owner, then the flight x, y, vx, vy, heading, headingAcc, age (zeros when free). */
export const MISSILE_SLOT = 9;
```

become:

```ts
/** Values per missile pool entry: active, owner, then the flight x, y, vx, vy, heading, headingAcc, age, then (W-3) the
 *  manual flag (zeros when free). */
export const MISSILE_SLOT = 10;
```

(b) `SYSTEMS_TAIL`'s last line becomes:

```ts
  'gunHeat', 'gunLocked', 'gunCooldown', 'gunMuzzle', 'gunWear', 'gunHull', 'gunShots', 'gunHits', 'pewCharge', 'pewShots', 'pewHits', 'laserManual', 'laserAim', 'torpManual'] as const satisfies readonly (keyof ShipSystems)[];   // the gun's, Valkyrn spec §7.3; the pew's, W-1; the laser mode and burst aim, W-2; the torpedo mode, W-3; gunRoomWear closes the record
```

(c) `FLAGS` becomes:

```ts
const FLAGS = new Set<string>(['released', 'fireHeld', 'laserTargeted', 'gunLocked', 'laserManual', 'torpManual']);
```

(d) The line `type MissingMissileKeys = Exclude<keyof Missile, (typeof MISSILE_KEYS)[number] | 'active' | 'owner'>;` becomes:

```ts
type MissingMissileKeys = Exclude<keyof Missile, (typeof MISSILE_KEYS)[number] | 'active' | 'owner' | 'manual'>;   // W-3: manual is its own bit
```

(e) In `missileFields`, the end of the `flight` object and the array (match these four lines; `roundFields` has a similar ending with `ROUND_KEYS`, which stays as it is)

```ts
        MISSILE_KEYS.forEach((key, j) => { m[key] = values[offset + j]!; });
      }
    }
  ];
```

become:

```ts
        MISSILE_KEYS.forEach((key, j) => { m[key] = values[offset + j]!; });
      }
    },
    bit(`missiles.${k}.manual`, (s) => s.missiles[k]!.manual, (s, v) => { s.missiles[k]!.manual = v; })   // W-3 (pew pew spec §4): the mode copied at launch
  ];
```

(f) In `systemsRules`, the line `  laserManual: flagBit, laserAim: within(-1, AIM_STEPS - 1)` becomes:

```ts
  laserManual: flagBit, laserAim: within(-1, AIM_STEPS - 1),
  // W-3 (pew pew spec §4): the torpedo mode a bit (validateTacticalValues adds the crew-only check).
  torpManual: flagBit
```

(g) In `validateTacticalValues`, after the line `        if (ship[1] === 'systems' && key === 'laserAim' && slice[0] !== -1 && (burstOf.get(i) ?? 0) === 0) bad('a manual aim with no burst pending');   // W-2: it waits only for a burst's next shot` insert:

```ts
        if (ship[1] === 'systems' && key === 'torpManual' && i !== CREW_SLOT && slice[0] !== 0) bad('only the crew torpedo has a manual mode');   // W-3: the Hunter is always AUTO
```

(h) In the same function, the missile branch's first line

```ts
      const key = missile[2]!, active = values[at - (key === 'active' ? 0 : key === 'owner' ? 1 : 2)]!;
```

becomes:

```ts
      // W-3: the manual bit closes the entry, after the flight's MISSILE_KEYS.length values.
      const key = missile[2]!, active = values[at - (key === 'active' ? 0 : key === 'owner' ? 1 : key === 'flight' ? 2 : 2 + MISSILE_KEYS.length)]!;
```

and after the line starting `      if (active === 1 && key === 'flight') {` insert:

```ts
      if (active === 1 && key === 'manual') {   // W-3 (pew pew spec §3, §4): a bit, and only the crew flies a MANUAL torpedo
        if (!flagBit(slice[0]!)) bad('manual is not 0 or 1');
        if (slice[0] === 1 && values[at - 1 - MISSILE_KEYS.length] !== CREW_SLOT) bad('only the crew flies a manual torpedo');   // the entry's owner
      }
```

(i) In `validateTacticalValues`'s doc comment, after `and a slot's laserAim is −1 unless a burst shot is pending.` add ` W-3: only the crew slot's torpedo mode is MANUAL, and only the crew's torpedo is manual.`

- [ ] **Step 7: The tests the new shapes touch**

(a) In `tests/tacticalDeterminism.test.ts`:

The line starting `    expect(Object.keys(st.systems[0]).sort()).toEqual(['cls', 'fireHeld',` (line 115) becomes:

```ts
    expect(Object.keys(st.systems[0]).sort()).toEqual(['cls', 'fireHeld', 'freq', 'gunCooldown', 'gunHeat', 'gunHits', 'gunHull', 'gunLocked', 'gunMuzzle', 'gunRoomWear', 'gunShots', 'gunWear', 'hull', 'laserAim', 'laserBurst', 'laserBurstClock', 'laserCharge', 'laserHits', 'laserHold', 'laserManual', 'laserRock', 'laserTargeted', 'layersStripped', 'lock', 'magazine', 'magazineClock', 'missileHits', 'missilesLaunched', 'missilesLost', 'pewCharge', 'pewHits', 'pewShots', 'rocksBroken', 'rooms', 'shieldClock', 'shields', 'shots', 'target', 'torpLock', 'torpManual', 'torpRock', 'torpRockFlying', 'torpRoom']);
```

The line starting `    expect(Object.keys(missileOf(launched, 0)!).sort()).toEqual(` (line 121) becomes:

```ts
    expect(Object.keys(missileOf(launched, 0)!).sort()).toEqual(['active', 'age', 'heading', 'headingAcc', 'manual', 'owner', 'vx', 'vy', 'x', 'y']);   // MISSILE_SLOT covers these (W-3: the manual bit)
```

and the two lines

```ts
    // and 3 pew scalars per slot. W-2: the laser mode and the burst aim, 2 more per slot. So a systems record is 40 scalars and 6 vector values.
    expect(flattenTactical(st).length).toBe(6 + 2 * (13 + st.map.asteroids.length + ROCK_RESERVE + 2) + 2 * MISSILE_SLOT + GUN_POOL * ROUND_SLOT + PEW_POOL * ROUND_SLOT + 9 + st.hunter.trail.length + (st.map.asteroids.length + ROCK_RESERVE) * ROCK_STRIDE + 6 + 2 * 46 + 17);
```

become:

```ts
    // and 3 pew scalars per slot. W-2: the laser mode and the burst aim, 2 more per slot. W-3: the torpedo mode, 1 more per slot,
    // and the manual bit in each missile entry (MISSILE_SLOT). So a systems record is 41 scalars and 6 vector values.
    expect(flattenTactical(st).length).toBe(6 + 2 * (13 + st.map.asteroids.length + ROCK_RESERVE + 2) + 2 * MISSILE_SLOT + GUN_POOL * ROUND_SLOT + PEW_POOL * ROUND_SLOT + 9 + st.hunter.trail.length + (st.map.asteroids.length + ROCK_RESERVE) * ROCK_STRIDE + 6 + 2 * 47 + 17);
```

(b) In `tests/duelSnapshot.test.ts`, in the `cases` list, after the line starting `        ['systems.0.laserAim', 0, 65536,`, insert:

```ts
        ['systems.1.torpManual', 0, 1, /systems\.1\.torpManual: only the crew torpedo has a manual mode/],   // W-3: the Hunter is always AUTO
        [`${slot}.manual`, 0, 2, /manual is not 0 or 1/], [`${free}.manual`, 0, 1, /a free entry holds values/],   // W-3: the per-torpedo mode
```

- [ ] **Step 8: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/manualTorpedoMode.test.ts tests/tacticalDeterminism.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts tests/tacticalSlots.test.ts tests/tacticalMissiles.test.ts tests/torpedoes.test.ts tests/torpedoGuidance.test.ts tests/weaponsUpdate.test.ts tests/ftlTargeting.test.ts tests/rockLock.test.ts tests/rockBlast.test.ts tests/tacticalHunter.test.ts tests/pewHunter.test.ts tests/manualLaserMode.test.ts tests/determinismGuard.test.ts`
Expected: PASS. No AUTO behaviour moved, because MANUAL is never set outside the new test.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/missiles.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/duel/step.ts tests/manualTorpedoMode.test.ts tests/tacticalDeterminism.test.ts tests/duelSnapshot.test.ts
git commit -m "feat(w3): the torpedo's AUTO / MANUAL mode and the per-torpedo flag as state (hashed, cloned, bounded: crew only); a MANUAL launch needs no lock or range and never auto-launches" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The MANUAL flight and hit: A/D and the held heading turn it, thrust stays full until the fuel is spent, and it strikes the room under its impact point

**Files:**
- Modify:
  - `src/renderer/src/sim/tactical/hunter.ts` (`headingTurn`)
  - `src/renderer/src/sim/tactical/missiles.ts` (header, `flyMissile`, `land`)
  - `src/renderer/src/sim/tactical/duel.ts`
- Create:
  - `src/renderer/src/sim/tactical/manualTorpedo.ts`
  - `tests/manualTorpedoFlight.test.ts`

**Interfaces:**
- Consumes: Task 2's `Missile.manual`, `ShipInput.torpTurn`, `torpHeading`, `placeMissile(…, manual)`.
- Produces:
  ```ts
  // sim/tactical/hunter.ts
  export function holdTurn(heading: number, h: number): number;   // auto-face's law toward the bearing of heading index h; headingTurn calls it
  // sim/tactical/manualTorpedo.ts
  export function manualTorpTurn(m: Missile, turn: number, heading: number): number;   // A/D by sign, else holdTurn toward a valid heading, else 0
  export function manualTorpedoFlying(state: TacticalState, i?: number): boolean;     // ship i's (default the crew's) torpedo in flight is MANUAL
  // sim/tactical/missiles.ts
  export function flyMissile(state: TacticalState, i: number, steer?: number): void;   // steer (default 0) turns a MANUAL torpedo instead of homingTurn
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/manualTorpedoFlight.test.ts`:

```ts
// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3, §5): the MANUAL flight and hit. It leaves the tube as
// today (straight for its boost). It thrusts at full thrust every tick while its fuel lasts, then coasts. It never
// homes. A and D turn it at the torpedo's turn rate, and a held heading turns it by the Helm's hold law until the nose is
// on it. It flies only with its ship's Weapons input. On a ship it strikes the room under its impact point for its hull,
// whatever the lock. Every collision rule is unchanged. The mode is the one it launched with.
import { describe, expect, it } from 'vitest';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { headingTurn, holdTurn } from '../src/renderer/src/sim/tactical/hunter';
import { manualTorpedoFlying, manualTorpTurn } from '../src/renderer/src/sim/tactical/manualTorpedo';
import { flyMissile, launchMissile, resolveMissiles, shootDown } from '../src/renderer/src/sim/tactical/missiles';
import { gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { beginRockTick } from '../src/renderer/src/sim/tactical/rocks';
import { classOf, cloneTactical, createTacticalState, missileOf, placeMissile, Room, type DuelEvent, type Missile, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { DT } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';

/** The crew at (0, 1500) nose north and still, no rocks, the Hunter far off and still, a fresh tick's rock masks, no events. */
function open(): TacticalState {
  const st = createTacticalState(5);
  st.rocks.fill(0);   // every seeded rock gone (the seeded grid ignores empty slots)
  beginRockTick(st);
  Object.assign(st.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: 2000, y: 2000, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.events = [];
  return st;
}
/** The crew's torpedo at (0, 1000), still, nose `heading`, `age` ticks old (past the boost by default), MANUAL by default. */
const flying = (st: TacticalState, heading = 0, age = 30, manual = true): Missile => placeMissile(st, 0, { x: 0, y: 1000, vx: 0, vy: 0, heading, headingAcc: 0, age }, manual);
/** The unsigned angle (heading steps, 0..128) between two heading indices. */
const apart = (a: number, b: number): number => { const k = (((a - b) % 256) + 256) % 256; return Math.min(k, 256 - k); };
type EndEvent = Extract<DuelEvent, { kind: 'missileEnd' }>;
const ends = (st: TacticalState): EndEvent[] => st.events.filter((e): e is EndEvent => e.kind === 'missileEnd');

describe('A and D (spec §3)', () => {
  it('turn it at the torpedo\'s turn rate after the boost, either way; it flies straight out of the tube first', () => {
    const st = open(), def = classOf(st, 0).slots.missile, m = flying(st, 0, 0);
    for (let k = 0; k < def.boostTicks; k++) flyMissile(st, 0, 1);
    expect(m.heading).toBe(0);
    for (let k = 0; k < 10; k++) flyMissile(st, 0, 1);
    expect(m.heading).toBe(Math.floor(10 * def.turnStepsPerTick));
    const left = open(), l = flying(left, 0, 30);
    for (let k = 0; k < 10; k++) flyMissile(left, 0, -1);
    expect(l.heading).toBe(256 - Math.floor(10 * def.turnStepsPerTick));
  });
  it('it never homes: with no steer a MANUAL torpedo keeps its nose; an AUTO one turns onto its target', () => {
    const manual = open(), m = flying(manual, 0, 30, true);
    const auto = open(), a = flying(auto, 0, 30, false);
    for (let k = 0; k < 60; k++) { flyMissile(manual, 0, 0); flyMissile(auto, 0, 1); }   // an AUTO torpedo ignores steer
    expect(m.heading).toBe(0);
    expect(a.heading).not.toBe(0);
  });
});

describe('thrust (spec §3, §5)', () => {
  it('is full along the nose every fuelled tick, then it coasts unsteered on gravity alone', () => {
    const st = open(), def = classOf(st, 0).slots.missile, m = flying(st, 64, 30);
    const [gx, gy] = gravityAccel(m.x, m.y), vx = m.vx + (gx + hx(64) * def.thrust) * DT, vy = m.vy + (gy + hy(64) * def.thrust) * DT;
    flyMissile(st, 0, 0);
    expect(m.vx).toBeCloseTo(vx, 9); expect(m.vy).toBeCloseTo(vy, 9);
    m.age = def.fuelTicks;   // its last fuelled tick is behind it
    const [cx, cy] = gravityAccel(m.x, m.y), cvx = m.vx + cx * DT, cvy = m.vy + cy * DT;
    flyMissile(st, 0, 1);
    expect(m.vx).toBeCloseTo(cvx, 9); expect(m.vy).toBeCloseTo(cvy, 9);
    expect([m.heading, m.headingAcc]).toEqual([64, 0]);   // coasting: A/D no longer turns it
  });
});

describe('the held heading (spec §3, §5)', () => {
  it('converges on the heading and holds it, by the Helm\'s hold law', () => {
    const st = open(), m = flying(st, 0, 30);
    for (let k = 0; k < 120; k++) flyMissile(st, 0, manualTorpTurn(m, 0, 64));
    expect(apart(m.heading, 64)).toBeLessThanOrEqual(2);
    for (let k = 0; k < 30; k++) { flyMissile(st, 0, manualTorpTurn(m, 0, 64)); expect(apart(m.heading, 64)).toBeLessThanOrEqual(2); }
  });
  it('manualTorpTurn: A/D wins over the held heading; a bad heading is none; holdTurn is the Helm\'s law', () => {
    const st = open(), m = flying(st, 0, 30);
    expect([manualTorpTurn(m, -1, 64), manualTorpTurn(m, 1, 192), manualTorpTurn(m, 0.4, 192)]).toEqual([-1, 1, 1]);
    expect([manualTorpTurn(m, 0, 64), manualTorpTurn(m, 0, 192), manualTorpTurn(m, 0, 0)]).toEqual([1, -1, 0]);
    expect([manualTorpTurn(m, 0, -1), manualTorpTurn(m, 0, 256), manualTorpTurn(m, 0, 1.5), manualTorpTurn(m, Number.NaN, -1)]).toEqual([0, 0, 0, 0]);
    for (const [heading, h] of [[0, 64], [10, 200], [128, 130], [250, 3]] as const) {
      st.ships[0].heading = heading;
      expect(holdTurn(heading, h), `${heading} → ${h}`).toBe(headingTurn(st, 0, h));
    }
  });
});

describe('the duel tick (spec §3)', () => {
  it('flies a MANUAL torpedo by its ship\'s Weapons input only', () => {
    const st = open(), m = flying(st, 0, 30);
    for (let k = 0; k < 10; k++) stepDuel(st, { ...IDLE_INPUT, torpTurn: 1 });
    expect(m.heading).toBe(Math.floor(10 * classOf(st, 0).slots.missile.turnStepsPerTick));
    const away = open(), a = flying(away, 0, 30);
    for (let k = 0; k < 10; k++) stepDuel(away, { ...IDLE_INPUT, weapons: false, torpTurn: 1, torpHeading: 64 });
    expect(a.heading).toBe(0);
    expect(manualTorpedoFlying(st)).toBe(true);
    expect(manualTorpedoFlying(st, 1)).toBe(false);
  });
  it('keeps the mode it launched with: a toggle mid-flight changes neither a MANUAL nor an AUTO torpedo', () => {
    const st = open();
    st.systems[0].torpManual = true;
    launchMissile(st, 0);
    st.systems[0].torpManual = false;   // V during the flight
    const m = missileOf(st, 0)!, def = classOf(st, 0).slots.missile;
    for (let k = 0; k < def.boostTicks + 10; k++) stepDuel(st, { ...IDLE_INPUT, torpTurn: 1 });
    expect(missileOf(st, 0)).toBe(m);
    expect([m.manual, m.heading]).toEqual([true, Math.floor(10 * def.turnStepsPerTick)]);
    const auto = open();
    Object.assign(auto.ships[1], { x: 300, y: 1200 });   // a target in range for the homing
    launchMissile(auto, 0);
    const twin = cloneTactical(auto);
    auto.systems[0].torpManual = true;   // V during the flight
    for (let k = 0; k < 40; k++) { stepDuel(auto, { ...IDLE_INPUT, torpTurn: 1 }); stepDuel(twin, IDLE_INPUT); }
    expect(missileOf(auto, 0)?.manual).toBe(false);
    expect(missileOf(auto, 0)?.heading).toBe(missileOf(twin, 0)?.heading);   // it homed exactly as the untoggled twin
  });
});

describe('the hit (spec §3, §5)', () => {
  it('a MANUAL torpedo strikes the room under its impact point for its hull, whatever the lock; an AUTO one its target room', () => {
    for (const manual of [true, false]) {
      const st = open(), def = classOf(st, 0).slots.missile;
      Object.assign(st.ships[1], { x: 0, y: 1300, heading: 0 });   // nose north: its stern faces the crew
      Object.assign(st.systems[0], { torpRoom: Room.Weapons, lock: Room.Shields });
      placeMissile(st, 0, { x: 0, y: 1300 + classOf(st, 1).radius + def.radius - 1, vx: 0, vy: -100, heading: 0, headingAcc: 0, age: 100 }, manual);
      const hull = st.systems[1].hull, room = manual ? Room.Engines : Room.Weapons;
      resolveMissiles(st);
      expect(st.systems[1].rooms[room], `manual ${manual}`).toBe(1);
      expect(st.systems[1].rooms.reduce((a, b) => a + b, 0)).toBe(1);
      expect(st.systems[1].hull).toBe(hull - def.hull);
      expect(ends(st)).toEqual([expect.objectContaining({ ship: 0, cause: 'ship', target: 1, room })]);
      expect(st.systems[0].missileHits).toBe(1);
    }
  });
  it('every collision rule stands: the planet ends it, and a pew round shoots it down', () => {
    const st = open();
    placeMissile(st, 0, { x: 0, y: st.map.planet.r + 1, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, true);
    resolveMissiles(st);
    expect(ends(st)).toEqual([expect.objectContaining({ cause: 'planet' })]);
    expect(missileOf(st, 0)).toBeNull();
    const shot = open();
    flying(shot);
    shootDown(shot, 0);
    expect(ends(shot)).toEqual([expect.objectContaining({ cause: 'shot' })]);
    expect(shot.missiles.every((e) => !e.active && !e.manual)).toBe(true);   // the freed entry holds zeros
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/manualTorpedoFlight.test.ts`
Expected: FAIL (no `manualTorpedo` module; `holdTurn` is not exported).

- [ ] **Step 3: The hold law, shared**

In `src/renderer/src/sim/tactical/hunter.ts`, replace the `headingTurn` function (its doc comment and body) with:

```ts
/** Feel-ii's click-to-heading (Feel-ii spec §1.1): auto-face's turn law aimed at the fixed bearing of heading index `h`
 *  instead of the lead point. Pure. */
export function headingTurn(state: TacticalState, i: number, h: number): number {
  return holdTurn(state.ships[i]!.heading, h);
}

/** W-3 (pew pew spec §3): headingTurn's law for any nose: the turn (−1, 0 or 1) from a nose at heading index `heading`
 *  toward the bearing of heading index `h`, none once it is within AUTO_FACE_SIN of the nose. A MANUAL torpedo holds its
 *  heading by it, as the Helm does. Pure. */
export function holdTurn(heading: number, h: number): number {
  return faceTurn(heading, hx(h), hy(h));
}
```

- [ ] **Step 4: The MANUAL turn**

Create `src/renderer/src/sim/tactical/manualTorpedo.ts`:

```ts
// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3): the turn a MANUAL torpedo flies this tick, from its
// ship's Weapons input (A/D first, else the held heading by the Helm's hold law), and whether a ship's torpedo in flight
// is a MANUAL one. Pure; only the tables and sqrt (through holdTurn).
import { holdTurn } from './hunter';
import { CREW_SLOT, missileOf, type Missile, type TacticalState } from './state';
import { HEADING_COUNT } from './tuning';

/** The turn (−1, 0 or 1) MANUAL torpedo m flies this tick: A/D (`turn`, by its sign; NaN is none) first, else toward the
 *  held heading `heading` (a heading index 0..255; −1, a non-integer or out of range is none) by holdTurn, else none. */
export function manualTorpTurn(m: Missile, turn: number, heading: number): number {
  const t = Math.sign(turn) || 0;
  if (t !== 0) return t;
  return Number.isInteger(heading) && heading >= 0 && heading < HEADING_COUNT ? holdTurn(m.heading, heading) : 0;
}

/** Whether ship i's (default the crew's) torpedo in flight is a MANUAL one. */
export function manualTorpedoFlying(state: TacticalState, i = CREW_SLOT): boolean {
  return missileOf(state, i)?.manual === true;
}
```

- [ ] **Step 5: The flight and the hit**

In `src/renderer/src/sim/tactical/missiles.ts`:

(a) The header comment (lines 1-5) becomes:

```ts
// Cruise missiles, drawn and named on screen as torpedoes (spec §7b and the missile rows of the §4 collision matrix;
// homing torpedo spec), in the missile pool: at most one in flight per ship, found by its owner (missileOf). A missile
// homes by itself on its owner's locked target ship while it thrusts, for its fuel time, then coasts unsteered until it
// expires; it has no drag. Gravity bends it. Missiles are flown and resolved in owner order (ship slot order), as before
// the pool, whatever pool entry they sit in. W-3 (pew pew spec §3): a MANUAL missile turns by its ship's Weapons input
// instead of homing, and strikes the room under its impact point.
```

(b) Replace the whole `flyMissile` function (its doc comment and body) with:

```ts
/** One tick of ship i's missile's flight: while it has fuel it thrusts along its nose, and after its boost (weapons update
 *  spec §2: the first boostTicks it flies straight out of the nose, unguided) it turns by homingTurn; then it coasts,
 *  unsteered. W-3 (pew pew spec §3): a MANUAL missile turns by `steer` (−1, 0 or 1: its ship's Weapons input, from
 *  manualTorpTurn) instead, and never homes; its thrust, fuel, boost and coast are an AUTO missile's. */
export function flyMissile(state: TacticalState, i: number, steer = 0): void {
  const m = missileOf(state, i);
  if (!m) return;
  const def = classOf(state, i).slots.missile;
  m.age++;
  const fuelled = m.age <= def.fuelTicks;
  if (fuelled && m.age > def.boostTicks) m.headingAcc += (m.manual ? steer : homingTurn(state, i, m)) * def.turnStepsPerTick;
  while (m.headingAcc >= 1) { m.heading = wrapHeading(m.heading + 1); m.headingAcc -= 1; }
  while (m.headingAcc <= -1) { m.heading = wrapHeading(m.heading - 1); m.headingAcc += 1; }
  let [ax, ay] = gravityAccel(m.x, m.y);
  if (fuelled) { ax += hx(m.heading) * def.thrust; ay += hy(m.heading) * def.thrust; }
  m.vx += ax * DT; m.vy += ay * DT;
  m.x += m.vx * DT; m.y += m.vy * DT;
}
```

(c) Replace `land`'s doc comment and its `room` line:

```ts
/** Land missile m on ship k: it strikes its owner's torpedo target room (FTL targeting spec §2), else its lock room
 *  (homing torpedo spec §2), but a self-hit strikes the room under the impact point, since a lock names a room on the
 *  target. Shields are bypassed (spec §7b, Q20). */
function land(state: TacticalState, m: Missile, k: number): void {
  const target = state.ships[k]!, sys = state.systems[k]!;
  const owner = state.systems[m.owner]!;   // the lock names a room on the owner's target; any other ship takes the impact room
  const room = (k === owner.target && k !== m.owner ? (owner.torpRoom >= 0 ? owner.torpRoom : owner.lock) : roomAtImpact(target, m.x, m.y)) as 0 | 1 | 2;
```

with:

```ts
/** Land missile m on ship k: it strikes its owner's torpedo target room (FTL targeting spec §2), else its lock room
 *  (homing torpedo spec §2), but a self-hit strikes the room under the impact point, since a lock names a room on the
 *  target. W-3 (pew pew spec §3): a MANUAL missile always strikes the room under its impact point, whatever the lock.
 *  Shields are bypassed (spec §7b, Q20). */
function land(state: TacticalState, m: Missile, k: number): void {
  const target = state.ships[k]!, sys = state.systems[k]!;
  const owner = state.systems[m.owner]!;   // the lock names a room on the owner's target; any other ship takes the impact room
  const room = (!m.manual && k === owner.target && k !== m.owner ? (owner.torpRoom >= 0 ? owner.torpRoom : owner.lock) : roomAtImpact(target, m.x, m.y)) as 0 | 1 | 2;
```

- [ ] **Step 6: The duel tick hands the steering over**

In `src/renderer/src/sim/tactical/duel.ts`:

(a) After the line `import { hunterThink } from './hunter';` insert:

```ts
import { manualTorpTurn } from './manualTorpedo';
```

and the state import becomes:

```ts
import { classOf, CREW_SLOT, missileOf, NO_AXES, Outcome, type TacticalState } from './state';
```

(b) The line

```ts
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) flyMissile(state, i);   // homing torpedo spec: it steers itself, attended or not
```

becomes:

```ts
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) {   // homing torpedo spec: an AUTO one steers itself, attended or not
    // W-3 (pew pew spec §3): a MANUAL one turns by its ship's Weapons input, and only while that console is attended.
    const m = missileOf(state, i), input = inputs[i]!;
    flyMissile(state, i, m && m.manual && input.weapons ? manualTorpTurn(m, input.torpTurn, input.torpHeading) : 0);
  }
```

(c) In `stepDuel`'s doc comment, after `ships fly, missiles fly,` add ` (W-3: a MANUAL one by its Weapons input),`.

- [ ] **Step 7: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/manualTorpedoFlight.test.ts tests/manualTorpedoMode.test.ts tests/torpedoGuidance.test.ts tests/torpedoes.test.ts tests/tacticalMissiles.test.ts tests/rockBlast.test.ts tests/pewRounds.test.ts tests/pewHunter.test.ts tests/tacticalHunter.test.ts tests/feelHeading.test.ts tests/valkyrnFlight.test.ts tests/weaponsUpdate.test.ts tests/determinismGuard.test.ts tests/duelScripted.test.ts tests/duelCheckpoint.test.ts`
Expected: PASS. `tests/torpedoGuidance.test.ts` is unchanged (spec §5: AUTO behaviour is unchanged), and `headingTurn` is unchanged (Feel-ii and Valkyrn).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/tactical/manualTorpedo.ts src/renderer/src/sim/tactical/missiles.ts src/renderer/src/sim/tactical/duel.ts tests/manualTorpedoFlight.test.ts
git commit -m "feat(w3): the MANUAL torpedo flies its Weapons input (A/D, else the held heading by the Helm's hold law; full thrust, then a coast; no homing) and strikes the room under its impact point" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `torpMode` and the held steering: contract, wire, the authority's held schemas, and admission

**Files:**
- Modify:
  - `src/renderer/src/net/contracts.ts` (`HeldInput`, `DuelCommand`)
  - `src/renderer/src/net/codec.ts` (`duelWire`, `held`)
  - `src/renderer/src/authority/duelCheckpoint.ts:73`
  - `src/renderer/src/authority/replay.ts:17`
  - `src/renderer/src/authority/checkpoint.ts:40`
  - `src/renderer/src/authority/core.ts:329,435`
  - `src/renderer/src/sim/duel/step.ts` (`NO_HELD`, `WEAPON_ORDER`, `DUEL_KINDS`, `heldTorpSteer`, the seats line, the weapon admission loop)
  - `src/renderer/src/sim/tactical/hash.ts` (`shipModule.commands`)
- Create: `tests/manualTorpedoCommands.test.ts`
- Modify (tests): `tests/duelModules.test.ts:152`, `tests/duelCheckpoint.test.ts:149`, `tests/ftlTargeting.test.ts:169`, `tests/rockLock.test.ts:90`

**Interfaces:**
- Consumes: Task 2's `torpManual`, `canLaunch`; Task 3's flight.
- Produces:
  ```ts
  // net/contracts.ts
  // HeldInput gains torpTurn?: number; torpHeading?: number
  // DuelCommand gains | { kind: 'torpMode'; manual: boolean }
  // sim/duel/step.ts
  export function heldTorpSteer(h: HeldInput): { turn: number; heading: number };   // torpTurn's sign (else 0), torpHeading 0..255 (else −1)
  // WEAPON_ORDER = ['laserMode', 'torpMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire']
  // torpMode: stale-tick, not-at-weapons, malformed, noop (unchanged), else sets systems[0].torpManual
  // hash.ts shipModule.commands = WEAPON_ORDER
  ```
  `authority/duelRules.ts` needs no edit: it decodes through `duelCodec` and steps through `stepDuelTick`.

- [ ] **Step 1: Write the failing test**

Create `tests/manualTorpedoCommands.test.ts`:

```ts
// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3, §4, §5): torpMode and the held steering on the wire and
// through the duel step and the authority.
// - The codec round-trips torpMode and the held torpTurn and torpHeading, and refuses anything else.
// - The step admits torpMode from the Weapons attendant only and sets the mode before a same-tick missileLaunch, which
//   in MANUAL needs no range.
// - The Weapons attendant's held torpTurn and torpHeading fly a MANUAL torpedo; anyone else's do not.
// - The authority carries them into its checkpoint and replay, and a pause or an expired frame clears them.
import { describe, expect, it } from 'vitest';
import { validateDuelCheckpoint, type DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { parseEncounterReplay } from '../src/renderer/src/authority/replay';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import { REMOTE_HELD_TIMEOUT_MS } from '../src/renderer/src/net/receivePolicy';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { heldTorpSteer, stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { classOf, missileOf, placeMissile, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { torpedoInRange } from '../src/renderer/src/sim/tactical/weapons';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { liveDuel } from './helpers/liveDuel';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
/** One step: player 1 holds `held1`, player 0 `held0`. */
const step = (d: DuelState, commands: DuelEnvelope[] = [], held1: HeldInput = NONE, held0: HeldInput = NONE) => stepDuelTick(d, { held: [held0, held1], commands });
const why = (r: ReturnType<typeof step>) => r.map((x) => x.reason ?? x.status);
/** A Cutter duel with player 0 standing and player 1 at Weapons. */
function gunnerAtWeapons(): DuelState { const d = createDuel(CUTTER, 5); sitDown(d.interior, 1, d.weapons); return d; }
const mode = (manual: boolean): DuelCommand => ({ kind: 'torpMode', manual });
/** The crew at (0, 1500) nose north and still, the enemy far beyond torpedo range at (0, −1500). */
function apart(t: TacticalState): void {
  Object.assign(t.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(t.ships[1], { x: 0, y: -1500, vx: 0, vy: 0 });
}
/** The crew's MANUAL torpedo 200 north of the crew, still, nose north, past its boost. */
const flying = (t: TacticalState) => placeMissile(t, 0, { x: 0, y: 1300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, true);
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe('torpMode and the held steering on the wire (spec §4)', () => {
  it('torpMode round-trips through the duel codec; a wrong type, a missing or an extra field does not pass', () => {
    const codec = duelCodec(2), env = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 1, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const good of [env({ kind: 'torpMode', manual: true }), env({ kind: 'torpMode', manual: false })]) expect(codec.decodeMessage(codec.encodeMessage(good))).toEqual(good);
    for (const bad of [{ kind: 'torpMode', manual: 1 }, { kind: 'torpMode' }, { kind: 'torpMode', manual: true, extra: 1 }]) expect(() => codec.encodeMessage(env(bad))).toThrow();
  });
  it('the held frame carries torpTurn −1..1 and torpHeading −1..255, integers only', () => {
    const codec = duelCodec(2), frame = (held: Record<string, unknown>) => ({ kind: 'held', frame: { runId: 'r', player: 1, tick: 0, sequence: 1, held: { ...NONE, ...held } } });
    for (const good of [{ torpTurn: 1, torpHeading: 40 }, { torpTurn: -1 }, { torpHeading: -1 }, { torpHeading: 255 }]) expect(codec.decodeMessage(raw(frame(good)))).toEqual(frame(good));
    for (const bad of [{ torpTurn: 2 }, { torpTurn: -2 }, { torpTurn: 0.5 }, { torpHeading: 256 }, { torpHeading: -2 }, { torpHeading: 2.5 }, { torpTurn: true }])
      expect(() => codec.decodeMessage(raw(frame(bad))), JSON.stringify(bad)).toThrow();
  });
});

describe('torpMode through the duel step (spec §3)', () => {
  it('the gunner sets it; the same value again is noop', () => {
    const d = gunnerAtWeapons();
    try {
      expect(why(step(d, [cmd(d, 1, mode(true))]))).toEqual(['applied']);
      expect(d.tactical.systems[0].torpManual).toBe(true);
      expect(why(step(d, [cmd(d, 1, mode(true))]))).toEqual(['noop']);
      expect(why(step(d, [cmd(d, 1, mode(false))]))).toEqual(['applied']);
      expect(d.tactical.systems[0].torpManual).toBe(false);
    } finally { disposeDuel(d); }
  });
  it('rejects a stale tick, a sender away from Weapons and a malformed value', () => {
    const d = gunnerAtWeapons();
    try {
      const r = step(d, [cmd(d, 1, mode(true), d.interior.tick + 1), cmd(d, 0, mode(true)), cmd(d, 1, { kind: 'torpMode', manual: 1 } as unknown as DuelCommand)]);
      expect(why(r)).toEqual(['not-at-weapons', 'stale-tick', 'malformed']);   // sorted by player, then sequence
      expect(d.tactical.systems[0].torpManual).toBe(false);
    } finally { disposeDuel(d); }
  });
  it('in MANUAL missileLaunch needs no range; in AUTO it is unavailable out of range', () => {
    const d = gunnerAtWeapons();
    try {
      apart(d.tactical);
      expect(torpedoInRange(d.tactical, 0)).toBe(false);
      expect(why(step(d, [cmd(d, 1, { kind: 'missileLaunch' })]))).toEqual(['unavailable']);
      d.tactical.systems[0].torpManual = true;
      expect(why(step(d, [cmd(d, 1, { kind: 'missileLaunch' })]))).toEqual(['applied']);
      expect(missileOf(d.tactical, 0)?.manual).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('torpMode takes effect before a missileLaunch in the same tick, whatever their envelope order', () => {
    const d = gunnerAtWeapons();
    try {
      apart(d.tactical);
      expect(why(step(d, [cmd(d, 1, { kind: 'missileLaunch' }), cmd(d, 1, mode(true))]))).toEqual(['applied', 'applied']);
      expect(missileOf(d.tactical, 0)?.manual).toBe(true);
    } finally { disposeDuel(d); }
  });
});

describe('the held steering through the duel step (spec §3)', () => {
  it('heldTorpSteer: the sign of torpTurn, a whole heading index or none', () => {
    expect(heldTorpSteer(NONE)).toEqual({ turn: 0, heading: -1 });
    expect(heldTorpSteer({ ...NONE, torpTurn: 1, torpHeading: 40 })).toEqual({ turn: 1, heading: 40 });
    expect(heldTorpSteer({ ...NONE, torpTurn: -1, torpHeading: 0 })).toEqual({ turn: -1, heading: 0 });
    for (const bad of [{ torpTurn: Number.NaN, torpHeading: 256 }, { torpTurn: 0, torpHeading: -1 }, { torpHeading: 1.5 }]) expect(heldTorpSteer({ ...NONE, ...bad })).toEqual({ turn: 0, heading: -1 });
  });
  it('the gunner\'s torpTurn turns the MANUAL torpedo; the standing player\'s does not', () => {
    const d = gunnerAtWeapons(), turn = classOf(d.tactical, 0).slots.missile.turnStepsPerTick;
    try {
      apart(d.tactical);
      const m = flying(d.tactical);
      for (let k = 0; k < 10; k++) step(d, [], NONE, { ...NONE, torpTurn: 1 });   // player 0 stands: not Weapons
      expect(m.heading).toBe(0);
      for (let k = 0; k < 10; k++) step(d, [], { ...NONE, torpTurn: 1 });
      expect(m.heading).toBe(Math.floor(10 * turn));
    } finally { disposeDuel(d); }
  });
});

describe('the authority carries the held steering (spec §4)', () => {
  /** An authority duel with player 1 at Weapons and the crew's MANUAL torpedo flying. */
  const torpDuel = (runId: string) => liveDuel(duelInit(5, runId), (s) => {
    sitDown(s.duel.interior, 1, s.duel.weapons);
    apart(s.duel.tactical);
    s.duel.tactical.systems[0].torpManual = true;
    flying(s.duel.tactical);
  });
  const heldOf = (l: ReturnType<typeof torpDuel>) => (JSON.parse(JSON.stringify(l.core.captureCheckpoint())) as DuelCheckpoint).held[1]!;
  it('a held torpTurn from the gunner flies the torpedo, and rides into the checkpoint and the replay', () => {
    const l = torpDuel('torp-wire');
    for (let k = 0; k < 6; k++) { l.held(1, { ...NONE, torpTurn: 1, torpHeading: 40 }); l.tick(); }
    expect(missileOf(l.state.duel.tactical, 0)!.heading).toBeGreaterThan(0);
    const cp = JSON.parse(JSON.stringify(l.core.captureCheckpoint())) as DuelCheckpoint;
    expect(cp.held[1]).toEqual({ ...NONE, torpTurn: 1, torpHeading: 40 });
    expect(() => validateDuelCheckpoint(cp, DIGEST, resolveCutter)).not.toThrow();
    expect(() => validateDuelCheckpoint({ ...cp, held: [cp.held[0]!, { ...NONE, torpTurn: 2 }] }, DIGEST, resolveCutter)).toThrow();
    const replay = JSON.parse(JSON.stringify(l.core.replay())) as unknown;
    expect(() => parseEncounterReplay(duelRules, replay, DIGEST, resolveCutter)).not.toThrow();
    expect(JSON.stringify(replay)).toContain('"torpHeading":40');
  });
  it('a pause deletes them, and an expired held frame is neutralised', () => {
    const l = torpDuel('torp-pause');
    l.held(1, { ...NONE, torpTurn: 1, torpHeading: 40 }); l.tick();
    expect(heldOf(l)).toMatchObject({ torpTurn: 1, torpHeading: 40 });
    l.command(0, { kind: 'setPaused', paused: true }); l.tick();
    expect(['torpTurn' in heldOf(l), 'torpHeading' in heldOf(l)]).toEqual([false, false]);
    const e = torpDuel('torp-expire');
    e.held(1, { ...NONE, torpHeading: 40 }); e.tick();
    expect(heldOf(e)).toMatchObject({ torpHeading: 40 });
    e.tick(Math.ceil(REMOTE_HELD_TIMEOUT_MS / (1000 / 60)) + 2);
    expect([heldOf(e).torpTurn, heldOf(e).torpHeading]).toEqual([undefined, undefined]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/manualTorpedoCommands.test.ts`
Expected: FAIL. The codec refuses `torpMode` and the held fields; `heldTorpSteer` is not exported; the step answers `not-in-duel`.

- [ ] **Step 3: The contract and the wire**

(a) In `src/renderer/src/net/contracts.ts`, replace the `HeldInput` doc comment and line

```ts
/** `face` (Feel-i, console feel spec §2): the Helm's auto-face, Space held at the Helm; absent means false. `aim`
 *  (Valkyrn spec §6.2): the Flight seat's mouse aim, a heading index 0..255, −1 or absent for none (the sim counts any
 *  other value as none). `gunHeld` (Valkyrn spec §7.1): the gun's trigger; absent means false. Only the duel reads them:
 *  `face` and `aim` from the Helm's attendant (A/D, moveX, overrides both), `gunHeld` from Weapons'. */
export interface HeldInput { moveX: number; moveY: number; interactHeld: boolean; face?: boolean; aim?: number; gunHeld?: boolean }
```

with:

```ts
/** `face` (Feel-i, console feel spec §2): the Helm's auto-face, Space held at the Helm; absent means false. `aim`
 *  (Valkyrn spec §6.2): the Flight seat's mouse aim, a heading index 0..255, −1 or absent for none (the sim counts any
 *  other value as none). `gunHeld` (Valkyrn spec §7.1): the gun's trigger; absent means false. W-3 (pew pew spec §3):
 *  `torpTurn` the MANUAL torpedo's A/D (−1, 0 or 1; absent 0) and `torpHeading` the heading it holds (0..255; −1 or
 *  absent none). Only the duel reads them: `face` and `aim` from the Helm's attendant (A/D, moveX, overrides both),
 *  `gunHeld`, `torpTurn` and `torpHeading` from Weapons'. */
export interface HeldInput { moveX: number; moveY: number; interactHeld: boolean; face?: boolean; aim?: number; gunHeld?: boolean; torpTurn?: number; torpHeading?: number }
```

(b) In `DuelCommand`, after the `| { kind: 'laserFire'; aim: number; aimAcc: number }` member insert:

```ts
  /** W-3 (pew pew spec §3): Weapons sets the crew torpedo's mode: true MANUAL (launched by missileLaunch alone, no lock or
   *  range, and flown by the Weapons seat's held torpTurn and torpHeading), false AUTO (as before). A torpedo in flight
   *  keeps the mode it launched with. */
  | { kind: 'torpMode'; manual: boolean }
```

(c) In `src/renderer/src/net/codec.ts`, in `duelWire.commands`, after the `laserFire` line insert:

```ts
      z.object({ kind: z.literal('torpMode'), manual: z.boolean() }).strict(),   // W-3: the torpedo's AUTO / MANUAL mode
```

The end of the `duelWire` doc comment, `W-2 adds \`laserMode\` and \`laserFire\`. */`, becomes `W-2 adds \`laserMode\` and \`laserFire\`; W-3 adds \`torpMode\`. */`.

The `held` line becomes:

```ts
const held = z.object({ moveX: axis, moveY: axis, interactHeld: z.boolean(), face: z.boolean().optional(), aim: z.number().int().min(-1).max(255).optional(), gunHeld: z.boolean().optional(),
  torpTurn: z.number().int().min(-1).max(1).optional(), torpHeading: z.number().int().min(-1).max(255).optional() }).strict();   // face: Feel-i's auto-face; aim, gunHeld: Valkyrn spec §6.2, §7.1; torpTurn, torpHeading: W-3
```

(d) The authority's three strict held schemas take the same two fields. In each of the three lines below, the text `gunHeld: z.boolean().optional() }).strict()` becomes `gunHeld: z.boolean().optional(), torpTurn: z.number().int().min(-1).max(1).optional(), torpHeading: z.number().int().min(-1).max(255).optional() }).strict()`. The lines are:
- `src/renderer/src/authority/duelCheckpoint.ts` line 73 (`const held = z.object({ moveX: …`)
- `src/renderer/src/authority/replay.ts` line 17 (`const held = z.object({ moveX: …`)
- `src/renderer/src/authority/checkpoint.ts` line 40 (`  held: z.array(z.object({ moveX: …`)

(e) In `src/renderer/src/authority/core.ts`, the expiry line

```ts
      if (held[p]!.moveX !== 0 || held[p]!.moveY !== 0 || held[p]!.interactHeld || held[p]!.face === true || held[p]!.gunHeld === true || held[p]!.aim !== undefined) expired.push(p);   // Valkyrn spec §6.2: an expired aim clears
```

becomes:

```ts
      if (held[p]!.moveX !== 0 || held[p]!.moveY !== 0 || held[p]!.interactHeld || held[p]!.face === true || held[p]!.gunHeld === true || held[p]!.aim !== undefined || held[p]!.torpTurn !== undefined || held[p]!.torpHeading !== undefined) expired.push(p);   // Valkyrn spec §6.2: an expired aim clears; W-3: and a torpedo's steering
```

and the pause line

```ts
    if (paused) held.forEach((h) => { h.moveX = 0; h.moveY = 0; h.interactHeld = false; delete h.face; delete h.aim; delete h.gunHeld; });   // Valkyrn spec §6.2: a pause clears the aim and the trigger
```

becomes:

```ts
    if (paused) held.forEach((h) => { h.moveX = 0; h.moveY = 0; h.interactHeld = false; delete h.face; delete h.aim; delete h.gunHeld; delete h.torpTurn; delete h.torpHeading; });   // Valkyrn spec §6.2: a pause clears the aim and the trigger; W-3: and the torpedo's steering
```

(f) In `src/renderer/src/sim/tactical/hash.ts`, `shipModule.commands` becomes:

```ts
  commands: ['laserMode', 'torpMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire'],
```

- [ ] **Step 4: Admission and the held steering in the duel step**

In `src/renderer/src/sim/duel/step.ts`:

(a) The `NO_HELD` line and the two declarations after it become:

```ts
const NO_HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The fixed order weapon commands take effect in within one tick (W-1: the pew last, as applyWeaponsInput fires it; W-2:
 *  the laser mode first, so the tick's commands are judged in it; W-3: the torpedo mode next, before the launch). */
const WEAPON_ORDER = ['laserMode', 'torpMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire'] as const;
/** Every duel command kind the step handles; any other kind is rejected not-in-duel. */
const DUEL_KINDS = ['sit', 'stand', 'presence', 'laserMode', 'torpMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire', 'rematch', 'throttle', 'heading', 'contactScan', 'designate', 'laserFrequency'];
```

(b) After the `heldAim` function insert:

```ts
/** W-3 (pew pew spec §3): the MANUAL torpedo's steering in a held input: `turn` the sign of torpTurn (absent or NaN: 0) and
 *  `heading` torpHeading, a heading index 0..255 (absent, −1, a non-integer or out of range: −1, none). */
export function heldTorpSteer(h: HeldInput): { turn: number; heading: number } {
  const t = h.torpTurn, a = h.torpHeading;
  return { turn: typeof t === 'number' ? Math.sign(t) || 0 : 0, heading: typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < HEADING_COUNT ? a : -1 };
}
```

(c) The comment line above the weapon loop that ends `laserFire after laserCharge, the first in a tick fires.` gains at its end: ` W-3: torpMode second, set at once, so a same-tick missileLaunch is judged in the new mode.`

(d) The seats line and the `crew` literal (two lines after it, as Task 2 left them) become:

```ts
  const helm = attendant(d, d.nav), gunner = attendant(d, d.weapons);
  const steer = gunner >= 0 ? heldTorpSteer(input.held[gunner] ?? NO_HELD) : { turn: 0, heading: -1 };   // W-3: only Weapons' attendant flies the MANUAL torpedo
  const crew: ShipInput = { helm: helm >= 0, weapons: gunner >= 0, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false,
    gunHeld: gunner >= 0 && (input.held[gunner] ?? NO_HELD).gunHeld === true, pewAim: -1, laserFire: -1, torpTurn: steer.turn, torpHeading: steer.heading, scanner: true };   // Valkyrn spec §7.1: the trigger of Weapons' attendant; W-1: pewFire sets pewAim; W-2: laserFire sets laserFire; W-3: the held steering
```

(e) In the weapon admission loop, the kind filter line

```ts
    if (c.kind !== 'laserMode' && c.kind !== 'laserLock' && c.kind !== 'torpLock' && c.kind !== 'rockLock' && c.kind !== 'laserCharge' && c.kind !== 'laserFire' && c.kind !== 'missileLaunch' && c.kind !== 'pewFire') continue;
```

becomes:

```ts
    if (c.kind !== 'laserMode' && c.kind !== 'torpMode' && c.kind !== 'laserLock' && c.kind !== 'torpLock' && c.kind !== 'rockLock' && c.kind !== 'laserCharge' && c.kind !== 'laserFire' && c.kind !== 'missileLaunch' && c.kind !== 'pewFire') continue;
```

and after the `laserMode` branch's closing (the line `      sys0.laserManual = c.manual;` and its `    }`) insert, as the next `else if`:

```ts
    else if (c.kind === 'torpMode') {   // W-3 (pew pew spec §3): the torpedo's mode, set now (a flying torpedo keeps the mode it launched with)
      if (typeof c.manual !== 'boolean') { result(e, 'malformed'); continue; }
      if (c.manual === sys0.torpManual) { result(e, undefined, 'noop'); continue; }
      sys0.torpManual = c.manual;
    }
```

The `missileLaunch` branch is unchanged: `canLaunch` reads the mode just set.

- [ ] **Step 5: The tests that list the kinds**

(a) `tests/duelModules.test.ts` line 152 becomes:

```ts
    expect(kinds).toEqual(['contactScan', 'designate', 'heading', 'laserCharge', 'laserFire', 'laserFrequency', 'laserLock', 'laserMode', 'missileLaunch', 'pewFire', 'presence', 'rematch', 'rockLock', 'sit', 'stand', 'throttle', 'torpLock', 'torpMode']);
```

(b) `tests/duelCheckpoint.test.ts` line 149: inside the `examples` braces, after `laserFire: { kind: 'laserFire', aim: 56, aimAcc: 78 }`, add `, torpMode: { kind: 'torpMode', manual: true }`.

(c) `tests/ftlTargeting.test.ts` line 169 becomes:

```ts
    expect(shipModule.commands).toEqual(['laserMode', 'torpMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire']);   // W-1: the pew last; W-2: the laser mode first, its MANUAL shot after the charge; W-3: the torpedo mode second
```

(d) `tests/rockLock.test.ts` line 90 becomes:

```ts
    expect(shipModule.commands).toEqual(['laserMode', 'torpMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire']);   // W-1 merge: the pew last; W-2: the laser mode first; W-3: the torpedo mode second
```

- [ ] **Step 6: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/manualTorpedoCommands.test.ts tests/manualLaserCommands.test.ts tests/pewCommands.test.ts tests/ftlTargeting.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts tests/netCodec.test.ts tests/codecModeWire.test.ts tests/commandUnion.test.ts tests/valkyrnFlight.test.ts tests/valkyrnOnline.test.ts tests/authority.test.ts tests/authorityIngress.test.ts tests/authorityDisconnect.test.ts tests/duelThrottle.test.ts tests/feelHeading.test.ts tests/rockLock.test.ts tests/duelScripted.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/authority/duelCheckpoint.ts src/renderer/src/authority/replay.ts src/renderer/src/authority/checkpoint.ts src/renderer/src/authority/core.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/tactical/hash.ts tests/manualTorpedoCommands.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts tests/ftlTargeting.test.ts tests/rockLock.test.ts
git commit -m "feat(w3): torpMode {manual} on the wire and through the duel step (before missileLaunch); the held torpTurn and torpHeading from Weapons' attendant, in every held schema, cleared by a pause or an expiry" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Weapons map: the right button's held heading, and the camera that follows a MANUAL torpedo and comes back

**Files:**
- Create:
  - `src/renderer/src/app/duel/torpedoCamera.ts`
  - `tests/torpedoCamera.test.ts`
  - `tests/manualTorpedoScene.test.ts`
- Modify:
  - `src/renderer/src/app/duel/mapRequests.ts`
  - `src/renderer/src/app/duel/scene.ts` (imports, after the Helm's aim block)
  - `src/renderer/src/app/duel/runtime.ts` (imports, the cameras `let`, `freshCameras`, the camera loop, `cameraInput.apply`)
  - `src/renderer/src/app/duel/onlineSource.ts` (imports, the cameras `let`, the new-round reset, `frame`)

**Interfaces:**
- Consumes: Task 3's `manualTorpedoFlying`.
- Produces:
  ```ts
  // app/duel/mapRequests.ts, MapRequests gains
  torpHeading(h: number): void;        // the right button's bearing from the MANUAL torpedo's marker (a heading index, −1 clear)
  takeTorpHeading(): number | null;    // drained; null with none since the last take
  // app/duel/torpedoCamera.ts
  export interface TorpedoFollow { flying: boolean; before: { follow: Follow; x: number; y: number } | null }
  export function createTorpedoFollow(): TorpedoFollow;
  export function trackManualTorpedo(cam: Camera, memo: TorpedoFollow, flying: boolean): void;
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/torpedoCamera.test.ts`:

```ts
// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3): the Weapons camera follows a MANUAL torpedo while it
// flies (the camera's existing missile follow) and goes back to its view when the flight ends: the ship, or a free view's
// centre. A camera the player moved during the flight is left where it is.
import { describe, expect, it } from 'vitest';
import { createCamera, pan, snapBack } from '../src/renderer/src/render/tactical/camera';
import { createTorpedoFollow, trackManualTorpedo } from '../src/renderer/src/app/duel/torpedoCamera';

describe('trackManualTorpedo (spec §3)', () => {
  it('follows the torpedo from its launch and goes back to the ship when it ends', () => {
    const cam = createCamera(10, 20), memo = createTorpedoFollow();
    trackManualTorpedo(cam, memo, false);
    expect(cam.follow).toBe('ship');
    trackManualTorpedo(cam, memo, true);
    expect(cam.follow).toBe('missile');
    trackManualTorpedo(cam, memo, true);   // still flying: nothing changes
    expect(cam.follow).toBe('missile');
    trackManualTorpedo(cam, memo, false);
    expect([cam.follow, memo.before]).toEqual(['ship', null]);
  });
  it('from a free view, goes back to that view\'s centre', () => {
    const cam = createCamera(0, 0, 1), memo = createTorpedoFollow();
    pan(cam, -100, 50);   // free, centred on (100, −50)
    expect([cam.follow, cam.centreX, cam.centreY]).toEqual(['free', 100, -50]);
    trackManualTorpedo(cam, memo, true);
    expect(cam.follow).toBe('missile');
    cam.centreX = 900; cam.centreY = 900;   // the follow moved it along the flight
    trackManualTorpedo(cam, memo, false);
    expect([cam.follow, cam.centreX, cam.centreY, cam.snap]).toEqual(['free', 100, -50, null]);
  });
  it('a camera the player moved during the flight is left alone', () => {
    const cam = createCamera(), memo = createTorpedoFollow();
    trackManualTorpedo(cam, memo, true);
    snapBack(cam, 'ship');   // C at Weapons: back to the ship
    trackManualTorpedo(cam, memo, false);
    expect(cam.follow).toBe('ship');
    const panned = createCamera(), m2 = createTorpedoFollow();
    trackManualTorpedo(panned, m2, true);
    pan(panned, 30, 0);
    const x = panned.centreX;
    trackManualTorpedo(panned, m2, false);
    expect([panned.follow, panned.centreX]).toEqual(['free', x]);
  });
});
```

Create `tests/manualTorpedoScene.test.ts`:

```ts
// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3, §5): the scene turns the Weapons seat's right button into
// the MANUAL torpedo's held heading. A press or a drag on the open map, while the crew's MANUAL torpedo flies, asks for the
// bearing from the torpedo's drawn marker to the pointer (on the torpedo itself: −1, clear). Over a console block, with an
// AUTO torpedo or none, it asks nothing. In Single player the Weapons camera follows the MANUAL torpedo.
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { emptyPresses, type AimSample, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { seatDuelCrew } from './helpers/duelSeat';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { createMapRequests } from '../src/renderer/src/app/duel/mapRequests';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { STATION, stationTop } from '../src/renderer/src/render/duel/consoleLayout';
import { missileOf, placeMissile, removeMissile } from '../src/renderer/src/sim/tactical/state';

const layout = parseShip(cutter);
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
const vp = { w: 1280, h: 720 };
const LIVE = { banner: null, layerPaused: false, end: null };

/** The real runtime, scene and tactical layer in node (as manualLaserScene.test.ts), with a right button the test drives. */
function rig() {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }, aimNow: AimSample | null = null;
  const tasks: { at: number; cb: () => void }[] = [];
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout,
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    clearKeys: () => { keys = { ...keys, presses: emptyPresses() }; }
  });
  const press = (a: KeyAction): void => { keys = { ...keys, presses: { ...keys.presses, [a]: 1 } }; };
  const tick = (): void => { rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
  const stage = new Container();
  const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
  const store = createUiStore({ onlineAvailable: false } as never), contact = createContactController(), requests = createMapRequests();
  const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store), contact, requests, takeClick: () => null, pointer: () => null,
    takeAim: () => { const a = aimNow; aimNow = null; return a; } });
  seatDuelCrew(rt.duel);   // player 0 at the Helm, player 1 at Weapons; Tab takes the gunner
  press('switch'); tick(); tick();
  /** One drawn frame with the right button held at p (a press), or none. */
  const aim = (p: { x: number; y: number } | null): void => { aimNow = p ? { x: p.x, y: p.y, press: true, release: false, held: true } : null; scene.draw(rt, 1 / 60, LIVE); };
  /** The crew's torpedo 40 north of the ship, MANUAL by default, past its boost; its drawn marker on the Weapons map. */
  const launch = (manual = true) => {
    const s = rt.duel.tactical.ships[0];
    placeMissile(rt.duel.tactical, 0, { x: s.x, y: s.y - 40, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, manual);
  };
  const marker = () => { const m = missileOf(rt.duel.tactical, 0)!; return worldToScreen(rt.cameras.weapons, vp, m.x, m.y); };
  return { rt, scene, requests, aim, launch, marker, tick };
}

describe('the right button while a MANUAL torpedo flies (spec §3)', () => {
  it('asks for the bearing from the torpedo\'s marker; on the torpedo, a clear; over a console block, nothing', () => {
    const r = rig();
    try {
      expect(r.rt.view()).toBe('weapons');
      r.aim(null);   // a first frame: the sit framing settles
      r.launch();
      const m = r.marker();
      r.aim({ x: m.x + 100, y: m.y });
      expect(r.requests.takeTorpHeading()).toBe(64);   // east of the torpedo
      expect(r.requests.takeTorpHeading()).toBeNull();   // drained
      r.aim({ x: m.x, y: m.y - 100 });
      expect(r.requests.takeTorpHeading()).toBe(0);
      r.aim({ x: m.x, y: m.y });
      expect(r.requests.takeTorpHeading()).toBe(-1);   // on the torpedo: clear the hold
      r.aim({ x: STATION.x + 20, y: stationTop('weapons') + 10 });   // over the Weapons block: not the map
      expect(r.requests.takeTorpHeading()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('asks nothing with an AUTO torpedo or none flying', () => {
    const r = rig();
    try {
      r.aim(null);
      const s = worldToScreen(r.rt.cameras.weapons, vp, r.rt.duel.tactical.ships[0].x, r.rt.duel.tactical.ships[0].y);
      r.aim({ x: s.x + 100, y: s.y });
      expect(r.requests.takeTorpHeading()).toBeNull();
      r.launch(false);
      r.aim({ x: s.x + 100, y: s.y });
      expect(r.requests.takeTorpHeading()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
});

describe('the Weapons camera in Single player (spec §3)', () => {
  it('follows a MANUAL torpedo while it flies and goes back to the ship when it ends; not an AUTO one', () => {
    const r = rig();
    try {
      expect(r.rt.cameras.weapons.follow).toBe('ship');
      r.launch(false);
      r.tick();
      expect(r.rt.cameras.weapons.follow).toBe('ship');
      removeMissile(r.rt.duel.tactical, 0);
      r.launch(true);
      r.tick();
      expect(r.rt.cameras.weapons.follow).toBe('missile');
      removeMissile(r.rt.duel.tactical, 0);
      r.tick();
      expect(r.rt.cameras.weapons.follow).toBe('ship');
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
});

describe('the map requests (spec §3)', () => {
  it('keep the latest torpedo heading until taken', () => {
    const q = createMapRequests();
    expect(q.takeTorpHeading()).toBeNull();
    q.torpHeading(10); q.torpHeading(-1);
    expect([q.takeTorpHeading(), q.takeTorpHeading()]).toEqual([-1, null]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run tests/torpedoCamera.test.ts tests/manualTorpedoScene.test.ts`
Expected: FAIL (no `torpedoCamera` module; `r.requests.takeTorpHeading is not a function`).

- [ ] **Step 3: The camera helper**

Create `src/renderer/src/app/duel/torpedoCamera.ts`:

```ts
// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3): the Weapons map follows a MANUAL torpedo while it flies
// (the camera's existing missile follow) and goes back to the view it had when the flight ends. Pure camera state, local
// to one screen; the Single player runtime and the online source call it on the Weapons camera every frame.
import { followBody, type Camera, type Follow } from '../../render/tactical/camera';

/** Whether a MANUAL torpedo flew last frame, and the camera's follow and centre from before its flight (null: none). */
export interface TorpedoFollow { flying: boolean; before: { follow: Follow; x: number; y: number } | null }

/** A fresh memo: no flight seen (each new round's cameras start one). */
export function createTorpedoFollow(): TorpedoFollow { return { flying: false, before: null }; }

/** One frame, before the camera's follow update, with whether the crew's MANUAL torpedo flies now. At a flight's start it
 *  remembers the camera's follow and centre and follows the missile (eased, as C's snap). At its end, if the camera still
 *  follows the missile, it goes back: to the ship (eased), or from a free view to that view's centre. A camera the player
 *  changed during the flight (C, a pan) is left as it is. */
export function trackManualTorpedo(cam: Camera, memo: TorpedoFollow, flying: boolean): void {
  if (flying && !memo.flying) {
    memo.before = { follow: cam.follow, x: cam.centreX, y: cam.centreY };
    followBody(cam, 'missile');
  } else if (!flying && memo.flying) {
    const b = memo.before;
    if (b && cam.follow === 'missile') {
      if (b.follow === 'free') { cam.follow = 'free'; cam.snap = null; cam.anchor = null; cam.centreX = b.x; cam.centreY = b.y; }
      else followBody(cam, b.follow);
    }
    memo.before = null;
  }
  memo.flying = flying;
}
```

- [ ] **Step 4: The map requests**

In `src/renderer/src/app/duel/mapRequests.ts` (Edit; the file is CRLF):

(a) The header comment's last line, starting `// Weapons map, kept (peeked, not drained) until a new round.`, becomes:

```ts
// Weapons map, kept (peeked, not drained) until a new round. W-3 (pew pew spec §3): the MANUAL torpedo's held heading from
// the Weapons map's right button (the latest, drained). The scene turns the pointer into requests each frame; the runtime (Single player) or the online session drains them. Local to one screen.
```

(b) In `MapRequests`, after `  resetLaserAim(): void;` insert:

```ts
  /** W-3: the right button on the Weapons map while the crew's MANUAL torpedo flies: the bearing (a heading index) from its
   *  drawn marker to the pointer, or −1 on the torpedo itself (clear the hold). */
  torpHeading(h: number): void;
  /** W-3: the latest of those since the last take, or null. */
  takeTorpHeading(): number | null;
```

(c) In `createMapRequests`, the `let` line becomes:

```ts
  let heading: number | null = null, steer: number | null = null, launches = 0, pew: number | null = null, laserAim: number | null = null, torp: number | null = null;
```

and the line `    resetLaserAim() { laserAim = null; }` becomes:

```ts
    resetLaserAim() { laserAim = null; },
    torpHeading(h) { torp = h; },
    takeTorpHeading() { const out = torp; torp = null; return out; }
```

- [ ] **Step 5: The scene asks for the held heading**

In `src/renderer/src/app/duel/scene.ts`:

(a) The fxModel import line becomes:

```ts
import { createFx, fxDt, interpolatedMissile, pushEvents, pushGunHits, pushKill, pushPewHits, recordTrails, resetFx, shakeOffset, stepFx, trackSolution, type ViewEvent } from '../../render/tactical/fxModel';
```

and after the line `import { enemyHostile } from '../../sim/tactical/science';` insert:

```ts
import { manualTorpedoFlying } from '../../sim/tactical/manualTorpedo';
```

(b) After the Helm's aim block (the `if (aim && onMap && station === 'helm' && view === 'helm' && running) { … }` statement, ending with the line `        if (aim.press || aim.release) options.requests?.heading(h);` and its closing `      }`), insert:

```ts
      // W-3 (pew pew spec §3): at Weapons, while the crew's MANUAL torpedo flies, the right button steers it: a press, every
      // frame of a drag and a release on the open map ask for the bearing from the torpedo's drawn marker to the pointer as
      // the heading it holds (on the torpedo itself: clear). Not while a weapon is picked up (its right button cancels that).
      if (aim && onMap && station === 'weapons' && view === 'weapons' && running && !overlay.layerPaused && manualTorpedoFlying(d.tactical) && (contact?.aimWeapon() ?? null) === null
        && onWeaponsMap(aim, contact?.state() != null, readoutRows({ duel: d, mode: 'weapons', active: source.active(), console: onConsole }).length)) {
        const m = interpolatedMissile(d.tactical, source.missilePrev, alpha, CREW_SLOT);
        if (m) {
          const s = worldToScreen(cam!, viewport, m.x, m.y), dx = aim.x - s.x, dy = aim.y - s.y;
          options.requests?.torpHeading(Math.hypot(dx, dy) <= pickRadius(cam!.zoom) ? -1 : headingOf(dx, dy));
        }
      }
```

- [ ] **Step 6: The cameras follow and stop panning on the right button**

(a) In `src/renderer/src/app/duel/runtime.ts`:
- After the line `import { followTarget, type PrevBody } from '../../render/tactical/tacticalModel';` insert:

```ts
import { manualTorpedoFlying } from '../../sim/tactical/manualTorpedo';
import { createTorpedoFollow, trackManualTorpedo } from './torpedoCamera';
```

- The line `  let prev: PrevBody[] = [], missilePrev: (PrevBody | null)[] = [], crewPrev: { x: number; y: number }[] = [], cameras = { helm: createCamera(), weapons: createCamera(), science: createCamera() };` becomes:

```ts
  let prev: PrevBody[] = [], missilePrev: (PrevBody | null)[] = [], crewPrev: { x: number; y: number }[] = [], cameras = { helm: createCamera(), weapons: createCamera(), science: createCamera() }, torpFollow = createTorpedoFollow();
```

- The `freshCameras` line becomes:

```ts
  const freshCameras = (): void => { const s = d.tactical.ships[0]; cameras = { helm: createCamera(s.x, s.y), weapons: createCamera(s.x, s.y), science: createCamera(s.x, s.y) }; torpFollow = createTorpedoFollow(); };   // W-3: a new round's Weapons camera follows no torpedo yet
```

- The line `      if (cam) cameraInput.apply(cam, k, pointer, shown === 'helm' || shown === 'flight');   // the Flight seat's right button is the torpedo, not a pan` becomes:

```ts
      if (cam) cameraInput.apply(cam, k, pointer, shown === 'helm' || shown === 'flight' || (shown === 'weapons' && manualTorpedoFlying(d.tactical)));   // the Flight seat's right button is the torpedo, not a pan; W-3: at Weapons, a MANUAL torpedo's held heading
```

- Before the line `      for (const c of [cameras.helm, cameras.weapons, cameras.science]) {` (the camera loop at the end of `frame`), insert:

```ts
      trackManualTorpedo(cameras.weapons, torpFollow, manualTorpedoFlying(d.tactical));   // W-3 (pew pew spec §3): follow a MANUAL torpedo, then go back
```

(b) In `src/renderer/src/app/duel/onlineSource.ts`:
- After the line `import { seatOf } from './controls';` insert:

```ts
import { manualTorpedoFlying } from '../../sim/tactical/manualTorpedo';
import { createTorpedoFollow, trackManualTorpedo } from './torpedoCamera';
```

- The line `  let cameras = { helm: createCamera(), weapons: createCamera(), science: createCamera() };` becomes:

```ts
  let cameras = { helm: createCamera(), weapons: createCamera(), science: createCamera() }, torpFollow = createTorpedoFollow();
```

- In `observe`, the new-round line `      const s = t.ships[0]; cameras = { helm: createCamera(s.x, s.y), weapons: createCamera(s.x, s.y), science: createCamera(s.x, s.y) }; cameraInput.reset(); resetInteriorCamera(interiorCamera);` becomes:

```ts
      const s = t.ships[0]; cameras = { helm: createCamera(s.x, s.y), weapons: createCamera(s.x, s.y), science: createCamera(s.x, s.y) }; torpFollow = createTorpedoFollow(); cameraInput.reset(); resetInteriorCamera(interiorCamera);
```

- In `frame`, the line `      if (keys && pointer) { if (cam) cameraInput.apply(cam, keys, pointer, view === 'helm'); else cameraInput.applyInterior(interiorCamera, keys, pointer); }` becomes:

```ts
      if (keys && pointer) { if (cam) cameraInput.apply(cam, keys, pointer, view === 'helm' || (view === 'weapons' && manualTorpedoFlying(d.tactical))); else cameraInput.applyInterior(interiorCamera, keys, pointer); }   // W-3: at Weapons the right button steers a MANUAL torpedo
      trackManualTorpedo(cameras.weapons, torpFollow, manualTorpedoFlying(d.tactical));   // W-3 (pew pew spec §3): follow a MANUAL torpedo, then go back
```

- [ ] **Step 7: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/torpedoCamera.test.ts tests/manualTorpedoScene.test.ts tests/manualLaserScene.test.ts tests/contactScene.test.ts tests/pewInput.test.ts tests/duelRuntime.test.ts tests/onlineDuel.test.ts tests/onlineDuelSession.test.ts tests/feelIiInput.test.ts tests/flightPointer.test.ts tests/interiorZoomScene.test.ts tests/tacticalLayer.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/app/duel/torpedoCamera.ts src/renderer/src/app/duel/mapRequests.ts src/renderer/src/app/duel/scene.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineSource.ts tests/torpedoCamera.test.ts tests/manualTorpedoScene.test.ts
git commit -m "feat(w3): the Weapons map's right button gives a MANUAL torpedo its held heading (no pan while it flies); the Weapons camera follows it and goes back when it ends" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: V, F and the steering: the key, the launch refusal, the Single player runtime, the online seat and the controls list

**Files:**
- Modify:
  - `src/renderer/src/app/duel/input.ts` (`KeyAction`, `PRESS_CODES`, `emptyPresses`)
  - `src/renderer/src/render/duel/situationModel.ts` (`refusal`)
  - `src/renderer/src/app/duel/runtime.ts`
  - `src/renderer/src/app/duel/duelMode.ts:69`
  - `src/renderer/src/app/duel/onlineDuel.ts`
  - `src/renderer/src/app/controlsList.ts`
- Create: `tests/manualTorpedoInput.test.ts`
- Modify (tests):
  - `tests/settingsAndControls.test.ts:46`
  - `tests/onlineDuelSession.test.ts` (the `requests` annotations, and a new describe after "the online manual laser (W-2)")

**Interfaces:**
- Consumes: Task 2's `torpManual`, `canLaunch(…, manual)`; Task 3's `manualTorpedoFlying`; Task 4's `torpMode` and held fields; Task 5's `MapRequests.takeTorpHeading`.
- Produces:
  ```ts
  // app/duel/input.ts: KeyAction gains 'torpMode'; PRESS_CODES.KeyV = 'torpMode'; emptyPresses().torpMode = 0
  // render/duel/situationModel.ts
  export function refusal(d: DuelState, control: RefusedControl, manual?: boolean): string | null;   // manual: the control's weapon mode (launch: torpManual, else laserManual); a MANUAL launch never says OUT OF RANGE
  // app/duel/runtime.ts: DuelRuntimeDeps.takeTorpHeading?(): number | null
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/manualTorpedoInput.test.ts`:

```ts
// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3, §4, §5) in Single player:
// - V (and the TORPEDO card's tag, a torpMode press) toggles the torpedo mode from the latest queued one.
// - In MANUAL, F launches with no lock and out of range, and NO TORPEDOES is the only magazine refusal.
// - While the crew's MANUAL torpedo flies, the Weapons seat's A/D are its torpTurn, and the map's held heading is its
//   torpHeading until A or D clears it.
// - The Settings list names V.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { controlSections } from '../src/renderer/src/app/controlsList';
import { emptyPresses, PRESS_CODES, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { refusal } from '../src/renderer/src/render/duel/situationModel';
import { missileOf, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { torpedoInRange } from '../src/renderer/src/sim/tactical/weapons';
import { seatDuelCrew } from './helpers/duelSeat';

const layout = parseShip(cutter), vp = { w: 1280, h: 720 };
function rig(torp: { at: number | null } = { at: null }) {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
  const tasks: { at: number; cb: () => void }[] = [];
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout,
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    clearKeys: () => { keys = { ...keys, presses: emptyPresses() }; },
    takeTorpHeading: () => { const h = torp.at; torp.at = null; return h; }
  });
  const press = (a: KeyAction): void => { keys = { ...keys, presses: { ...keys.presses, [a]: 1 } }; };
  const hold = (moveX: number): void => { keys = { ...keys, moveX }; };
  const tick = (): void => { rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
  seatDuelCrew(rt.duel);
  press('switch'); tick(); tick();   // Tab takes the gunner (player 1, at Weapons)
  return { rt, tick, press, hold, gunner: () => rt.held()[1]! };
}
/** The crew at (0, 1500) nose east and still, the enemy far beyond torpedo range at (0, −1500). */
function apart(t: TacticalState): void {
  Object.assign(t.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 64, headingAcc: 0 });
  Object.assign(t.ships[1], { x: 0, y: -1500, vx: 0, vy: 0 });
}

describe('V (spec §3)', () => {
  it('is bound, and toggles the torpedo mode from the latest queued one', () => {
    expect(PRESS_CODES.KeyV).toBe('torpMode');
    expect(PRESS_CODES.KeyX).toBe('stand');   // X stays Stand
    const { rt, tick, press } = rig();
    try {
      expect(rt.view()).toBe('weapons');
      press('torpMode'); tick();
      expect(rt.duel.tactical.systems[0].torpManual).toBe(true);
      press('torpMode'); tick();
      expect(rt.duel.tactical.systems[0].torpManual).toBe(false);
    } finally { rt.dispose(); }
  });
});

describe('F in MANUAL (spec §3, §5)', () => {
  it('launches with no lock and out of range; in AUTO the same press says OUT OF RANGE', () => {
    const { rt, tick, press } = rig();
    try {
      apart(rt.duel.tactical);
      expect(torpedoInRange(rt.duel.tactical, 0)).toBe(false);
      rt.takeRefusals();
      press('launch'); tick();
      expect(missileOf(rt.duel.tactical, 0)).toBeNull();
      expect(rt.takeRefusals()).toEqual([{ control: 'launch', reason: 'OUT OF RANGE' }]);
      const magazine = rt.duel.tactical.systems[0].magazine;
      press('torpMode'); press('launch'); tick();   // V and F in one frame: the launch is judged in the new mode
      expect(missileOf(rt.duel.tactical, 0)?.manual).toBe(true);
      expect(rt.duel.tactical.systems[0].magazine).toBe(magazine - 1);
      expect(rt.takeRefusals()).toEqual([]);
    } finally { rt.dispose(); }
  });
  it('with an empty magazine says NO TORPEDOES; a MANUAL launch never says OUT OF RANGE', () => {
    const { rt, tick, press } = rig();
    try {
      apart(rt.duel.tactical);
      rt.duel.tactical.systems[0].torpManual = true;
      expect([refusal(rt.duel, 'launch'), refusal(rt.duel, 'launch', false)]).toEqual([null, 'OUT OF RANGE']);
      rt.duel.tactical.systems[0].magazine = 0;
      rt.takeRefusals();
      press('launch'); tick();
      expect(rt.takeRefusals()).toEqual([{ control: 'launch', reason: 'NO TORPEDOES' }]);
      expect(missileOf(rt.duel.tactical, 0)).toBeNull();
    } finally { rt.dispose(); }
  });
});

describe('the steering at Weapons (spec §3)', () => {
  it('A/D are the flying MANUAL torpedo\'s torpTurn and turn it; with none flying they send nothing', () => {
    const { rt, tick, press, hold, gunner } = rig();
    try {
      apart(rt.duel.tactical);
      hold(1); tick();
      expect('torpTurn' in gunner()).toBe(false);
      hold(0);
      rt.duel.tactical.systems[0].torpManual = true;
      press('launch'); tick();
      const m = missileOf(rt.duel.tactical, 0)!;
      hold(1);
      for (let k = 0; k < 30; k++) tick();
      expect(gunner()).toMatchObject({ torpTurn: 1 });
      expect(m.heading).not.toBe(64);
    } finally { rt.dispose(); }
  });
  it('the map\'s held heading is torpHeading until A or D clears it, or the flight ends', () => {
    const torp = { at: null as number | null }, { rt, tick, press, hold, gunner } = rig(torp);
    try {
      apart(rt.duel.tactical);
      rt.duel.tactical.systems[0].torpManual = true;
      press('launch'); tick();
      torp.at = 100; tick();
      expect(gunner()).toMatchObject({ torpHeading: 100 });
      expect('torpTurn' in gunner()).toBe(false);
      tick();
      expect(gunner()).toMatchObject({ torpHeading: 100 });   // held: the client re-sends it
      hold(-1); tick();
      expect(gunner()).toMatchObject({ torpTurn: -1 });
      expect('torpHeading' in gunner()).toBe(false);
      hold(0); tick();
      expect(['torpTurn' in gunner(), 'torpHeading' in gunner()]).toEqual([false, false]);
      torp.at = 30; tick();
      expect(gunner()).toMatchObject({ torpHeading: 30 });
      torp.at = -1; tick();   // a right click on the torpedo clears it
      expect('torpHeading' in gunner()).toBe(false);
    } finally { rt.dispose(); }
  });
});

describe('the Settings controls list (spec §5)', () => {
  it('names V at Weapons, and the torpedo\'s A/D and right button', () => {
    const rows = controlSections()[0]!.rows;
    expect(rows.find((r) => r.keys === 'V')?.action).toMatch(/Weapons.*torpedo.*AUTO.*MANUAL/);
    expect(rows.find((r) => r.keys === 'W A S D')?.action).toMatch(/MANUAL torpedo/);
    expect(rows.find((r) => r.keys === 'Right click or drag')?.action).toMatch(/MANUAL torpedo/);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/manualTorpedoInput.test.ts`
Expected: FAIL. `PRESS_CODES.KeyV` is undefined, no torpMode is queued, the refusal says OUT OF RANGE, there are no torpedo held fields, and there is no `V` row.

- [ ] **Step 3: The key**

In `src/renderer/src/app/duel/input.ts`:

(a) The `KeyAction` doc and type become:

```ts
/** Press-edge actions (spec §5 table). H-1a uses pause, camera and the zoom keys; H-1b adds the duel ones; Artemis-ii
 *  adds the Helm's throttle notches on W and S (spec 2026-11-17-artemis-consoles §5.4); W-2 adds Z, the laser's AUTO / MANUAL toggle at Weapons (pew pew spec §2);
 *  W-3 adds V, the torpedo's (pew pew spec §3: the spec's X is Stand and C the camera, so V). */
export type KeyAction = 'interact' | 'prevLock' | 'fireDown' | 'fireUp' | 'launch' | 'laserMode' | 'torpMode' | 'stand' | 'switch' | 'pause' | 'camera' | 'zoomIn' | 'zoomOut' | 'confirm' | 'menu' | 'throttleUp' | 'throttleDown';
```

(b) The first line of `PRESS_CODES` becomes:

```ts
  KeyE: 'interact', KeyQ: 'prevLock', Space: 'fireDown', KeyF: 'launch', KeyZ: 'laserMode', KeyV: 'torpMode', KeyX: 'stand', Tab: 'switch', Escape: 'pause', KeyC: 'camera',
```

(c) `emptyPresses`'s return becomes:

```ts
  return { interact: 0, prevLock: 0, fireDown: 0, fireUp: 0, launch: 0, laserMode: 0, torpMode: 0, stand: 0, switch: 0, pause: 0, camera: 0, zoomIn: 0, zoomOut: 0, confirm: 0, menu: 0, throttleUp: 0, throttleDown: 0 };
```

- [ ] **Step 4: The refusal**

In `src/renderer/src/render/duel/situationModel.ts`:

(a) The `refusal` signature and first line

```ts
export function refusal(d: DuelState, control: RefusedControl, manual = d.tactical.systems[CREW_SLOT].laserManual): string | null {
  const t = d.tactical, sys = t.systems[CREW_SLOT];
```

become:

```ts
export function refusal(d: DuelState, control: RefusedControl, manual?: boolean): string | null {
  const t = d.tactical, sys = t.systems[CREW_SLOT], m = manual ?? (control === 'launch' ? sys.torpManual : sys.laserManual);   // W-3: the control's own weapon's mode
```

(b) Inside it, the line `    if (control === 'fire') return laserOffline(t, CREW_SLOT) ? 'WEAPONS OFFLINE' : manual && !manualLaserReady(t, CREW_SLOT) ? 'NO CHARGE' : null;   // W-2: a MANUAL press needs a full charge` becomes:

```ts
    if (control === 'fire') return laserOffline(t, CREW_SLOT) ? 'WEAPONS OFFLINE' : m && !manualLaserReady(t, CREW_SLOT) ? 'NO CHARGE' : null;   // W-2: a MANUAL press needs a full charge
```

and the line `    return torpedoInRange(t, CREW_SLOT) ? null : 'OUT OF RANGE';` becomes:

```ts
    return m || torpedoInRange(t, CREW_SLOT) ? null : 'OUT OF RANGE';   // W-3: a MANUAL launch has no range
```

(c) Its doc comment's last sentence `W-2 (pew pew spec §2): FIRE in MANUAL (\`manual\`, default the sim's mode) is laserFire: after the same checks, NO CHARGE without manualLaserReady. */` becomes:

```ts
W-2 (pew pew spec §2): FIRE in MANUAL (`manual`, default the laser's mode) is laserFire: after the same checks, NO CHARGE without
 *  manualLaserReady. W-3 (pew pew spec §3): LAUNCH in MANUAL (`manual`, default the torpedo's mode) has no range: never OUT OF RANGE. */
```

- [ ] **Step 5: The Single player runtime**

In `src/renderer/src/app/duel/runtime.ts`:

(a) In `DuelRuntimeDeps`, after the `laserAim?(): number | null;` member insert:

```ts
  /** W-3 (pew pew spec §3): the Weapons map's right button since the last frame while the crew's MANUAL torpedo flies
   *  (mapRequests.ts takeTorpHeading, drained): a heading index to hold, −1 to clear, or null. */
  takeTorpHeading?(): number | null;
```

(b) `isWeaponsCommand` becomes:

```ts
const isWeaponsCommand = (c: DuelCommand): boolean => c.kind === 'laserMode' || c.kind === 'torpMode' || c.kind === 'laserLock' || c.kind === 'torpLock' || c.kind === 'rockLock' || c.kind === 'laserCharge' || c.kind === 'laserFire' || c.kind === 'missileLaunch' || c.kind === 'pewFire';
```

(c) The line `  let shipView = false, steer = -1, gunPrev = false;` becomes:

```ts
  let shipView = false, steer = -1, gunPrev = false, torpHold = -1;   // W-3: the MANUAL torpedo's held heading (−1 none), re-sent every frame
```

and in `newRound` the line `    shipView = false; steer = -1; gunPrev = false;` becomes:

```ts
    shipView = false; steer = -1; gunPrev = false; torpHold = -1;
```

(d) In `onTick`, the line `    const torpRockNow = torpRockNext ?? (torpLocked ? -1 : d.tactical.systems[0].torpRock);` becomes:

```ts
    const torpRockNow = torpRockNext ?? (torpLocked ? -1 : d.tactical.systems[0].torpRock);
    // W-3 (pew pew spec §3): a launch is judged in this tick's torpedo mode (the sim sets a queued torpMode first).
    const queuedMode = [...pending].reverse().find((c) => c.command.kind === 'torpMode')?.command;
    const torpManualNow = queuedMode && queuedMode.kind === 'torpMode' ? queuedMode.manual : d.tactical.systems[0].torpManual;
```

and the line `        if (launched || !canLaunch(d.tactical, 0, torpRockNow)) continue;` becomes:

```ts
        if (launched || !canLaunch(d.tactical, 0, torpRockNow, torpManualNow)) continue;
```

(e) After the `laserModeBase` line insert:

```ts
  /** W-3 (pew pew spec §3): the active player's latest queued torpedo mode, else the sim's (as laserModeBase). */
  const torpModeBase = (): boolean => { const c = [...pending].reverse().find((x) => x.player === active && x.command.kind === 'torpMode')?.command; return c && c.kind === 'torpMode' ? c.manual : d.tactical.systems[0].torpManual; };
```

(f) In `play`'s Weapons part, the lines

```ts
    } else if (p.fireDown > 0) queue({ kind: 'laserCharge', held: true });   // FTL targeting spec §2: one press fires a full laser
    if (p.launch > 0) queue({ kind: 'missileLaunch' });
    // Feel-ii §2.8: FIRE and LAUNCH say why when the sim would refuse them (the tick drops them by the same checks).
    const fireWhy = p.fireDown > 0 && !manual ? refusal(d, 'fire', false) : null, launchWhy = p.launch > 0 ? refusal(d, 'launch') : null;
```

become:

```ts
    } else if (p.fireDown > 0) queue({ kind: 'laserCharge', held: true });   // FTL targeting spec §2: one press fires a full laser
    // W-3 (pew pew spec §3): V or the TORPEDO card's AUTO / MAN tag toggles the torpedo's mode, from the latest queued one (an
    // odd number of presses this frame toggles it); F is judged in that mode (in MANUAL: no lock, no range).
    let torpManual = torpModeBase();
    if (p.torpMode % 2 === 1) { torpManual = !torpManual; queue({ kind: 'torpMode', manual: torpManual }); }
    if (p.launch > 0) queue({ kind: 'missileLaunch' });
    // Feel-ii §2.8: FIRE and LAUNCH say why when the sim would refuse them (the tick drops them by the same checks).
    const fireWhy = p.fireDown > 0 && !manual ? refusal(d, 'fire', false) : null, launchWhy = p.launch > 0 ? refusal(d, 'launch', torpManual) : null;
```

(g) In `frame`, the line `      const steerNow = deps.takeSteer?.() ?? null, launchesNow = deps.takeLaunches?.() ?? 0, pewNow = deps.takePew?.() ?? null;   // Valkyrn spec §5.1: drained every frame` becomes:

```ts
      const steerNow = deps.takeSteer?.() ?? null, launchesNow = deps.takeLaunches?.() ?? 0, pewNow = deps.takePew?.() ?? null;   // Valkyrn spec §5.1: drained every frame
      const torpNow = deps.takeTorpHeading?.() ?? null;   // W-3: drained every frame
```

and the `activeHeld` statement (three lines, from `      activeHeld = ended() ? NEUTRAL : { moveX: look ? 0 :` through `...(steer >= 0 ? { aim: steer } : {}), ...(gunNow ? { gunHeld: true } : {}) };   // Valkyrn spec §5.1`) becomes:

```ts
      // W-3 (pew pew spec §3): at Weapons, while the crew's MANUAL torpedo flies, A/D turn it (torpTurn) and the map's right
      // button gives it a heading to hold (torpHold, re-sent every frame) until A or D, a right click on it or the flight's end clears it.
      const steering = seatNow === 'weapons' && !ended() && manualTorpedoFlying(d.tactical), torpTurn = steering ? Math.sign(k.moveX) || 0 : 0;
      if (!steering || torpTurn !== 0) torpHold = -1; else if (torpNow !== null) torpHold = torpNow;
      activeHeld = ended() ? NEUTRAL : { moveX: look ? 0 : Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld,
        ...(k.fireHeld && !look && (seatNow === 'helm' || seatNow === 'flight') ? { face: true } : {}),
        ...(steer >= 0 ? { aim: steer } : {}), ...(gunNow ? { gunHeld: true } : {}),   // Valkyrn spec §5.1
        ...(torpTurn !== 0 ? { torpTurn } : {}), ...(torpHold >= 0 ? { torpHeading: torpHold } : {}) };   // W-3
```

(h) In `src/renderer/src/app/duel/duelMode.ts`, the line starting `    takeContactRequests: () => contact.takeRequests(), takeHeading: () => requests.takeHeading(),` becomes:

```ts
    takeContactRequests: () => contact.takeRequests(), takeHeading: () => requests.takeHeading(), takePew: () => requests.takePew(), laserAim: () => requests.laserAim(), takeTorpHeading: () => requests.takeTorpHeading(),   // W-2, W-3
```

- [ ] **Step 6: The online seat**

In `src/renderer/src/app/duel/onlineDuel.ts`:

(a) After the line `import { canCharge, canLaunch } from '../../sim/tactical/weapons';` insert:

```ts
import { manualTorpedoFlying } from '../../sim/tactical/manualTorpedo';
```

(b) After the line `  const laserSent = new Set<number>();` insert:

```ts
  // W-3 (pew pew spec §3): the torpedo mode this seat last asked for, until its result comes back (as laserModeSent); the
  // MANUAL launches it sent, whose 'unavailable' answer names the reason (the always-send rule); and the MANUAL torpedo's
  // held heading, re-sent in every held frame while it flies (−1 none).
  let torpModeSent: { manual: boolean; sequence: number; round: number } | null = null, torpHold = -1;
  const torpSent = new Set<number>();
```

(c) In `observe`, after the line starting `      if (result.id.player === descriptor.seatId && laserSent.delete(result.id.sequence)` insert:

```ts
      if (torpModeSent && result.id.player === descriptor.seatId && result.id.sequence === torpModeSent.sequence) torpModeSent = null;   // W-3: the replica is the base again
      if (result.id.player === descriptor.seatId && torpSent.delete(result.id.sequence) && result.status === 'rejected' && result.reason === 'unavailable') source.refuse('launch', refusal(d, 'launch', true) ?? 'NO TORPEDOES');   // W-3
```

(d) In `play`, the two seat-change lines become:

```ts
      if (p.interact > 0 && repairInReach(d, me) < 0) { const c = consoleInReach(d, me); if (c >= 0) { throttleSent = null; headingSent = null; laserModeSent = null; torpModeSent = null; torpHold = -1; send({ kind: 'sit', station: c }); } }
```
```ts
    if (p.stand > 0) { throttleSent = null; headingSent = null; laserModeSent = null; torpModeSent = null; torpHold = -1; send({ kind: 'stand' }); return; }
```

(e) In `play`'s Weapons part, the lines

```ts
    if (p.launch > 0 && canLaunch(d.tactical, 0)) send({ kind: 'missileLaunch' });
    // Feel-ii §2.8: FIRE and LAUNCH say why when the sim would refuse them (the same checks that hold them back above).
    const fireWhy = p.fireDown > 0 && !manual ? refusal(d, 'fire', false) : null, launchWhy = p.launch > 0 ? refusal(d, 'launch') : null;
```

become:

```ts
    // W-3 (pew pew spec §3): V or the TORPEDO card's AUTO / MAN tag toggles the torpedo's mode, from the mode in flight, else
    // the replica's (an odd number of presses this pump toggles it).
    let torpManual = torpModeSent ? torpModeSent.manual : sys.torpManual;
    if (p.torpMode % 2 === 1) {
      torpManual = !torpManual;
      const id = send({ kind: 'torpMode', manual: torpManual }); if (id) torpModeSent = { manual: torpManual, sequence: id.sequence, round: d.round };
    }
    if (p.launch > 0 && torpManual) {
      // W-3: in MANUAL F needs no target and no range. The replica lags the authority, so its magazine is no gate (W-1 review
      // F2's rule): NO GUNNER, TORPEDO FLYING and WEAPONS OFFLINE refuse locally, a press on a seemingly empty magazine is
      // sent anyway, and the authority's 'unavailable' answer (observe) names the reason.
      const why = refusal(d, 'launch', true);
      if (why && why !== 'NO TORPEDOES') source?.refuse('launch', why);
      else { const id = send({ kind: 'missileLaunch' }); if (id) torpSent.add(id.sequence); }
    } else if (p.launch > 0 && canLaunch(d.tactical, 0, sys.torpRock, false)) send({ kind: 'missileLaunch' });
    // Feel-ii §2.8: FIRE and LAUNCH say why when the sim would refuse them (the same checks that hold them back above).
    const fireWhy = p.fireDown > 0 && !manual ? refusal(d, 'fire', false) : null, launchWhy = p.launch > 0 && !torpManual ? refusal(d, 'launch', false) : null;
```

(f) After the line `  const laserAimNow = (): number | null => requests.laserAim();   // W-2: the MANUAL laser's aim (kept, not drained)` insert (at this scope `requests` is the session's map requests; inside `pump` the name is shadowed by the contact controller's requests, so the drain goes through this helper):

```ts
  const torpRequest = (): number | null => requests.takeTorpHeading();   // W-3: the MANUAL torpedo's held heading from the right button, drained every pump
```

In `pump`, the line `    const k = keyboard.sample(), requests = contact.takeRequests(), heading = requests0(), pew = pewRequest();` becomes:

```ts
    const k = keyboard.sample(), requests = contact.takeRequests(), heading = requests0(), pew = pewRequest(), torpNow = torpRequest();
```

After the line starting `    if (laserModeSent && d && d.round !== laserModeSent.round) laserModeSent = null;` insert:

```ts
    if (torpModeSent && d && d.round !== torpModeSent.round) { torpModeSent = null; torpHold = -1; }   // W-3: every round starts AUTO
```

(g) In `pump`, the held line and the stamp condition

```ts
    const held: HeldInput = { moveX: Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld, ...(k.fireHeld && seatOf(d, me) === 'helm' ? { face: true } : {}) };
    const sequence = client.held(me, decided ? { moveX: 0, moveY: 0, interactHeld: false } : held);
    if (sequence !== null && !decided && (held.moveX !== lastHeld.moveX || held.moveY !== lastHeld.moveY || held.interactHeld !== lastHeld.interactHeld || held.face !== lastHeld.face)) {
```

become:

```ts
    // W-3 (pew pew spec §3): at Weapons, while the replica shows the crew's MANUAL torpedo flying, A/D turn it (torpTurn) and the
    // map's right button gives it a heading to hold (torpHold, re-sent every pump) until A or D, a click on it or the flight's end clears it.
    const steering = !decided && seatOf(d, me) === 'weapons' && manualTorpedoFlying(d.tactical), torpTurn = steering ? Math.sign(k.moveX) || 0 : 0;
    if (!steering || torpTurn !== 0) torpHold = -1; else if (torpNow !== null) torpHold = torpNow;
    const held: HeldInput = { moveX: Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld, ...(k.fireHeld && seatOf(d, me) === 'helm' ? { face: true } : {}),
      ...(torpTurn !== 0 ? { torpTurn } : {}), ...(torpHold >= 0 ? { torpHeading: torpHold } : {}) };
    const sequence = client.held(me, decided ? { moveX: 0, moveY: 0, interactHeld: false } : held);
    if (sequence !== null && !decided && (held.moveX !== lastHeld.moveX || held.moveY !== lastHeld.moveY || held.interactHeld !== lastHeld.interactHeld || held.face !== lastHeld.face || held.torpTurn !== lastHeld.torpTurn || held.torpHeading !== lastHeld.torpHeading)) {
```

(h) In `attach`, the line containing `throttleSent = null; headingSent = null; laserModeSent = null; attaches++;` gets `torpModeSent = null; torpHold = -1; ` inserted before `attaches++;`, and the line `      heldStamps.length = 0; commandStamps.clear(); pewSent.clear(); laserSent.clear();   // the new client restarts its sequences: an old stamp would match a new frame` becomes:

```ts
      heldStamps.length = 0; commandStamps.clear(); pewSent.clear(); laserSent.clear(); torpSent.clear();   // the new client restarts its sequences: an old stamp would match a new frame
```

- [ ] **Step 7: The Settings controls list and its tests**

(a) In `src/renderer/src/app/controlsList.ts`:

In `DUEL_ACTION`, after the `laserMode` entry insert:

```ts
  torpMode: 'At Weapons, switch the torpedo between AUTO (it homes on its target) and MANUAL (F launches it with no target; A/D and the right mouse fly it)',
```

The first duel row `  const duel: ControlRow[] = [{ keys: move, action: 'Walk; at the Helm, A/D turn' }];` becomes:

```ts
  const duel: ControlRow[] = [{ keys: move, action: 'Walk; at the Helm, A/D turn; at Weapons, A/D steer a MANUAL torpedo in flight' }];
```

And the row `    { keys: 'Right click or drag', action: 'At the Helm, set a heading to hold (on your ship: clear); elsewhere pan' },` becomes:

```ts
    { keys: 'Right click or drag', action: 'At the Helm, set a heading to hold (on your ship: clear); at Weapons, the heading a MANUAL torpedo in flight holds (on it: clear); elsewhere pan' },
```

(b) In `tests/settingsAndControls.test.ts`, after the line `    expect(action('Z')).toMatch(/Weapons.*AUTO.*MANUAL/);   // W-2: the laser's mode` add:

```ts
    expect(action('V')).toMatch(/Weapons.*torpedo.*AUTO.*MANUAL/);   // W-3: the torpedo's mode
```

(c) In `tests/onlineDuelSession.test.ts`:

First, add the import line after `import { Outcome } from '../src/renderer/src/sim/tactical/state';`:

```ts
import { placeMissile } from '../src/renderer/src/sim/tactical/state';
```

Then widen both `requests` annotations: the hoisted `sceneOpts` array type near line 53, and the scene mock's `opts` parameter type near line 66. Each `requests?: { pew(aim: number): void; aimLaser(aim: number): void }` becomes `requests?: { pew(aim: number): void; aimLaser(aim: number): void; torpHeading(h: number): void }`.

Then, after the closing `});` of `describe('the online manual laser (W-2)', …)`, insert:

```ts
describe('the online manual torpedo (W-3)', () => {
  const sent = (c: Stub, kind: string) => c.commands().filter((x) => x.kind === kind);
  const launchRefusals = () => h.sources.at(-1)!.takeRefusals().filter((x) => x.control === 'launch');
  /** The crew far from the enemy (out of torpedo range). */
  const apart = (d: DuelState): void => { Object.assign(d.tactical.ships[0], { x: 0, y: 1500, vx: 0, vy: 0 }); Object.assign(d.tactical.ships[1], { x: 0, y: -1500, vx: 0, vy: 0 }); };
  it('V sends torpMode from the mode in flight, else the replica\'s', () => {
    const r = rig(1), c = r.attach();
    r.session.frame();
    r.key('keydown', 'KeyV'); r.key('keyup', 'KeyV'); r.pump();
    r.key('keydown', 'KeyV'); r.key('keyup', 'KeyV'); r.pump();
    expect(sent(c, 'torpMode')).toEqual([{ kind: 'torpMode', manual: true }, { kind: 'torpMode', manual: false }]);
    r.dispose();
  });
  it('in MANUAL F is sent out of range and on an empty replica magazine; an unavailable answer names NO TORPEDOES', () => {
    const r = rig(1);
    apart(r.d);
    r.d.tactical.systems[0]!.torpManual = true;
    r.d.tactical.systems[0]!.magazine = 0;   // the lagging replica: empty
    const c = r.attach();
    r.session.frame();
    r.key('keydown', 'KeyF'); r.key('keyup', 'KeyF'); r.pump();
    expect(sent(c, 'missileLaunch')).toEqual([{ kind: 'missileLaunch' }]);
    r.session.frame(); expect(launchRefusals()).toEqual([]);   // nothing is shown before the authority answers
    const id = c.ids[c.commands().map((x) => x.kind).lastIndexOf('missileLaunch')]!;
    c.results.push({ id, tick: 3, status: 'rejected', reason: 'unavailable' }); r.pump();
    r.session.frame();
    expect(launchRefusals()).toEqual([{ control: 'launch', reason: 'NO TORPEDOES' }]);
    r.dispose();
  });
  it('in AUTO F out of range is not sent and says OUT OF RANGE', () => {
    const r = rig(1);
    apart(r.d);
    const c = r.attach();
    r.session.frame();
    r.key('keydown', 'KeyF'); r.key('keyup', 'KeyF'); r.pump();
    expect(sent(c, 'missileLaunch')).toEqual([]);
    r.session.frame();
    expect(launchRefusals()).toEqual([{ control: 'launch', reason: 'OUT OF RANGE' }]);
    r.dispose();
  });
  it('while the replica shows the MANUAL torpedo flying, A/D are torpTurn and the right button\'s heading is torpHeading', () => {
    const r = rig(1);
    apart(r.d);
    r.d.tactical.systems[0]!.torpManual = true;
    placeMissile(r.d.tactical, 0, { x: 0, y: 1300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, true);
    const c = r.attach();
    r.session.frame();
    r.key('keydown', 'KeyD'); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ torpTurn: 1 });
    r.key('keyup', 'KeyD');
    h.sceneOpts[0]!.requests!.torpHeading(40); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ torpHeading: 40 });
    expect('torpTurn' in c.helds().at(-1)!).toBe(false);
    r.pump();
    expect(c.helds().at(-1)).toMatchObject({ torpHeading: 40 });   // re-sent while it holds
    r.key('keydown', 'KeyA'); r.pump();
    expect(c.helds().at(-1)).toMatchObject({ torpTurn: -1 });
    expect('torpHeading' in c.helds().at(-1)!).toBe(false);
    r.dispose();
  });
});
```

- [ ] **Step 8: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/manualTorpedoInput.test.ts tests/manualLaserInput.test.ts tests/settingsAndControls.test.ts tests/onlineDuelSession.test.ts tests/pewInput.test.ts tests/contactScene.test.ts tests/duelRuntime.test.ts tests/duelInput.test.ts tests/duelInputMerge.test.ts tests/feelIiInput.test.ts tests/feelIiModels.test.ts tests/feelUi.test.tsx tests/crewSeats.test.ts tests/flightPointer.test.ts tests/flightRuntime.test.ts tests/valkyrnRuntime.test.ts tests/valkyrnOnline.test.ts tests/webPageGuards.test.ts tests/duelRemoteClient.test.ts tests/manualTorpedoScene.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/app/duel/input.ts src/renderer/src/render/duel/situationModel.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/controlsList.ts tests/manualTorpedoInput.test.ts tests/settingsAndControls.test.ts tests/onlineDuelSession.test.ts
git commit -m "feat(w3): V toggles the torpedo mode; in MANUAL F launches with no lock or range (online: always sent, the answer names the reason); A/D and the held heading steer it at Weapons; Settings rows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The TORPEDO card's AUTO / MAN tag, its MANUAL words, and the lock tone off in MANUAL

**Files:**
- Modify:
  - `src/renderer/src/render/duel/consoleModel.ts` (`WeaponsPanel`, the imports, `weaponsPanel`)
  - `src/renderer/src/ui/duel/WeaponsStation.tsx`
  - `src/renderer/src/app/duel/scene.ts` (`torpedoTone`)
- Create: `tests/manualTorpedoUi.test.tsx`

**Interfaces:**
- Consumes: Task 2's `torpManual`, `canLaunch`; Task 3's `manualTorpedoFlying`; Task 6's `KeyAction 'torpMode'`.
- Produces:
  ```ts
  // render/duel/consoleModel.ts: WeaponsPanel.torpManual?: boolean; WeaponsPanel.torpFlyingManual?: boolean
  // ui/duel/WeaponsStation.tsx: <Button name="torp-mode"> (data-testid console-torp-mode), label AUTO / MAN, lit in MANUAL
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/manualTorpedoUi.test.tsx`:

```tsx
// @vitest-environment jsdom
// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3, §5): the TORPEDO card.
// - Its AUTO / MAN tag shows the mode (MAN lit), and a click presses torpMode, as V does.
// - In MANUAL the card says MANUAL instead of the range words, and a flying MANUAL torpedo says STEER A/D.
// - The Weapons panel carries the mode and the flying torpedo's, and LAUNCH is live out of range in MANUAL.
// - The lock tone is off in MANUAL.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { consoleModel, type ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS, type ConsoleInput } from '../src/renderer/src/app/duel/input';
import { torpedoTone } from '../src/renderer/src/app/duel/scene';
import { TEXT } from '../src/renderer/src/render/theme';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { placeMissile, Room } from '../src/renderer/src/sim/tactical/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const tag = () => document.querySelector('[data-testid="console-torp-mode"]') as HTMLElement | null;
const charge = { label: 'CHARGE', value: 'READY', labelTint: TEXT, valueTint: TEXT, bar: { fill: 1, colour: TEXT } };
const weapons = (over: Partial<NonNullable<ConsoleView['weapons']>>): ConsoleView => ({
  station: 'weapons', tabs: { helm: 'open', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, science: null, ship: 'stand' },
  helm: null, science: null, side: { zoom: '0.90', free: false, snapLabel: 'CAMERA' },
  weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, torpedoInRange: false, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null, laserTarget: 1, torpTarget: -1, burst: 2, ...over }
});
const view = (console: ConsoleView): DuelUiView => ({ readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { ui, duel };
}

describe('the TORPEDO card\'s AUTO / MAN tag (spec §3, §5)', () => {
  it('reads AUTO unlit in AUTO and MAN lit in MANUAL; absent without the mode', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ torpManual: false }))));
    expect(tag()!.dataset.uiButton).not.toBe('lit');
    expect(texts()).toContain('OUT OF RANGE');
    act(() => duel.frame(view(weapons({ torpManual: true }))));
    expect(tag()!.dataset.uiButton).toBe('lit');
    expect(texts()).toContain('MAN');
    expect(texts()).toContain('MANUAL');
    expect(texts()).not.toContain('OUT OF RANGE');
    act(() => duel.frame(view(weapons({}))));
    expect(tag()).toBeNull();
  });
  it('a click presses torpMode, as V does', () => {
    const { ui, duel } = mount(), press = vi.fn();
    const input: ConsoleInput = { press, hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
    ui.actions.setConsole(input);
    act(() => duel.frame(view(weapons({ torpManual: false }))));
    fireEvent.pointerDown(tag()!, { button: 0 });
    expect(press).toHaveBeenCalledWith('torpMode');
  });
  it('a flying MANUAL torpedo says STEER A/D; an AUTO one FLYING', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ torpManual: false, missileFlying: true, torpFlyingManual: true }))));
    expect(texts()).toContain('STEER A/D');
    act(() => duel.frame(view(weapons({ torpManual: true, missileFlying: true, torpFlyingManual: false }))));
    expect(texts()).toContain('FLYING');
    expect(texts()).not.toContain('STEER A/D');
  });
});

describe('the Weapons panel and the tone in MANUAL (spec §3)', () => {
  it('carries the mode and the flying torpedo\'s; LAUNCH is live out of range; the lock tone is off', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      Object.assign(d.tactical.ships[0], { x: 0, y: 1500, vx: 0, vy: 0 });
      Object.assign(d.tactical.ships[1], { x: 0, y: -1500, vx: 0, vy: 0 });
      d.tactical.systems[0].torpLock = Room.Shields;
      const panel = () => consoleModel({ duel: d, me: 1, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })!.weapons!;
      expect([panel().torpManual, panel().canLaunch, panel().torpFlyingManual, torpedoTone(d).locked]).toEqual([false, false, false, true]);
      d.tactical.systems[0].torpManual = true;
      expect([panel().torpManual, panel().canLaunch, torpedoTone(d).locked]).toEqual([true, true, false]);
      placeMissile(d.tactical, 0, { x: 0, y: 1300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, true);
      expect([panel().missileFlying, panel().torpFlyingManual]).toEqual([true, true]);
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/manualTorpedoUi.test.tsx`
Expected: FAIL (no `console-torp-mode`; `torpManual` is absent from the panel; the tone is locked in MANUAL).

- [ ] **Step 3: The panel**

In `src/renderer/src/render/duel/consoleModel.ts`:

(a) After the line `import { laserOffline } from '../../sim/tactical/weapons';` insert:

```ts
import { manualTorpedoFlying } from '../../sim/tactical/manualTorpedo';
```

(b) In `WeaponsPanel`, after the `laserManual?: boolean;` member (and its doc line) insert:

```ts
  /** W-3 (pew pew spec §3): the torpedo's mode for the TORPEDO card's AUTO / MAN tag (true MANUAL; absent draws no tag), and
   *  whether the torpedo in flight is a MANUAL one (the card says STEER A/D). */
  torpManual?: boolean; torpFlyingManual?: boolean;
```

(c) In `weaponsPanel`, the line starting `      laserReason: sys.laserManual ? manualCardReason(reason) : reason,` becomes:

```ts
      laserReason: sys.laserManual ? manualCardReason(reason) : reason, goal: (i.goal ?? false) && !sys.laserTargeted && !sys.laserManual, laserManual: sys.laserManual,
      torpManual: sys.torpManual, torpFlyingManual: manualTorpedoFlying(t),   // W-3 (pew pew spec §3): canLaunch above reads the mode (no range in MANUAL)
```

- [ ] **Step 4: The tag and the words on the TORPEDO card**

In `src/renderer/src/ui/duel/WeaponsStation.tsx` (Edit; the file is CRLF):

(a) After the header comment line starting `// W-2 (pew pew spec §2): the LASER card's AUTO / MAN tag` insert:

```ts
// W-3 (pew pew spec §3): the TORPEDO card's AUTO / MAN tag likewise (V); in MANUAL the card says MANUAL, and a MANUAL torpedo in flight STEER A/D.
```

(b) After the line `      <PixelText text="2" x={T.x + T.w - 6} y={T.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />` insert:

```tsx
      {weapons.torpManual !== undefined
        ? <Button name="torp-mode" label={weapons.torpManual ? 'MAN' : 'AUTO'} x={tx + 66} y={T.y + 2} w={36} h={18} lit={weapons.torpManual} onPress={() => actions.console.press('torpMode')} />
        : null}
```

The tag sits after the card's hit box in the DOM, as the LASER tag does, so it is on top of it: a click on the tag never picks the torpedo up. It spans the card's x 72..108, clear of `TORPEDO` (to 48) and the `2` key hint (from 126).

(c) The lines

```tsx
      {weapons.missileFlying
        ? <PixelText text="FLYING" x={tx} y={T.y + 42} size={FONT_NATIVE} tint={hot} />
        : <PixelText text={weapons.torpedoInRange ? 'IN RANGE' : 'OUT OF RANGE'} x={tx} y={T.y + 42} size={FONT_NATIVE} tint={weapons.torpedoInRange ? main : dim} />}
```

become:

```tsx
      {weapons.missileFlying
        ? <PixelText text={weapons.torpFlyingManual === true ? 'STEER A/D' : 'FLYING'} x={tx} y={T.y + 42} size={FONT_NATIVE} tint={hot} />
        : weapons.torpManual === true
        ? <PixelText text="MANUAL" x={tx} y={T.y + 42} size={FONT_NATIVE} tint={main} />
        : <PixelText text={weapons.torpedoInRange ? 'IN RANGE' : 'OUT OF RANGE'} x={tx} y={T.y + 42} size={FONT_NATIVE} tint={weapons.torpedoInRange ? main : dim} />}
```

- [ ] **Step 5: The lock tone**

In `src/renderer/src/app/duel/scene.ts`, in `torpedoTone`, the line

```ts
  const locked = t.outcome === Outcome.Running && sys.torpLock >= 0 && !missileOf(t, CREW_SLOT) && sys.magazine > 0 && sys.rooms[Room.Weapons] < 2 && e?.active === true;
```

becomes:

```ts
  const locked = t.outcome === Outcome.Running && !sys.torpManual && sys.torpLock >= 0 && !missileOf(t, CREW_SLOT) && sys.magazine > 0 && sys.rooms[Room.Weapons] < 2 && e?.active === true;   // W-3: a lock never launches in MANUAL
```

and its doc comment gains, before the closing `*/`: ` W-3: none in MANUAL.`

- [ ] **Step 6: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/manualTorpedoUi.test.tsx tests/manualLaserUi.test.tsx tests/pewUi.test.tsx tests/targetingUi.test.tsx tests/feelUi.test.tsx tests/feelIiUi.test.tsx tests/feelIiInput.test.ts tests/uiConsole.test.tsx tests/uiDuel.test.tsx tests/rockTargetUi.test.tsx tests/scienceUi.test.tsx tests/duelConsoleModel.test.ts tests/feelPresentation.test.ts tests/crewSeats.test.ts tests/uiButton.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/render/duel/consoleModel.ts src/renderer/src/ui/duel/WeaponsStation.tsx src/renderer/src/app/duel/scene.ts tests/manualTorpedoUi.test.tsx
git commit -m "feat(w3): the TORPEDO card's AUTO / MAN tag (lit in MANUAL, a click toggles as V does), MANUAL and STEER A/D on the card, no lock tone in MANUAL" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The additive proof, the gameplay bless at 57, the gates unchanged, the full verification and the owner's gate

**Files:**
- Modify: `scripts/golden/duelOracle.ts` (`ADDITIONS`), `docs/gates.md` (append)
- Regenerated by `npm run bless` (same version): `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/golden/basic.json` (its embedded content digest only)

**Interfaces:**
- Consumes: Tasks 1 to 7, Task 1's commit message (the gate numbers) and Task 1's duel-oracle baseline at 57.
- Produces: the merge-ready branch.

- [ ] **Step 1: Every AUTO run is unchanged per tick (the additive oracle)**

In `scripts/golden/duelOracle.ts`, in `ADDITIONS`, the `56` entry's last line

```ts
    added: [/^ship\.systems\.\d+\.(laserManual|laserAim)$/] }
```

becomes (a comma after its brace, then the new entry, before the table's closing `};`):

```ts
    added: [/^ship\.systems\.\d+\.(laserManual|laserAim)$/] },
  /** W-3 (57): the torpedo mode on every systems record and the manual bit on every missile pool entry; no oracle run sends
   *  torpMode, so they stay at their first recorded value (false), which `frozen` makes recordRun check at every tick. */
  57: { change: 'W-3: the torpedo mode and the per-torpedo manual flag', rename: () => undefined, derived: [], frozen: true,
    added: [/^ship\.systems\.\d+\.torpManual$/, /^space\.missiles\.\d+\.manual$/] }
```

Run: `npx tsx scripts/golden/duel-oracle.ts added`
Expected: `duel oracle: <R> runs, <T> ticks, <F'> named fields, results, events and telemetry identical at every tick with the fields declared added at 57 (W-3: the torpedo mode and the per-torpedo manual flag), sim version 57 -> 57 (baseline HEAD <Task 1 sha>)`, exit 0. `<R>` and `<T>` are Task 1's, and `<F'>` is Task 1's `<F>` + 4: two `torpManual` and two `missiles.<k>.manual`.

If it fails with a value, event or telemetry difference, stop. The AUTO path changed; the message names the run, the tick and the field. Fix the code in the task that introduced it and re-run; never tune.

If it fails because the baseline is missing or from another checkout (for example, a reboot cleared the temp folder), record "additive oracle proof: not run (baseline lost)" in the final report and rely on Steps 2 and 3 alone.

Run: `npx vitest run tests/duelOracle.test.ts tests/blessGuard.test.ts`
Expected: PASS.

- [ ] **Step 2: The same-version bless**

Run: `npm run bless`
Expected, exit 0: four `blessed …` lines.
- `basic.json` still reads `120 checkpoints`.
- The determinism fixture line reads `sim version 57, 1800 samples and 330 boundaries re-executed`.
- The two duel lines carry **the same checkpoint counts, tick counts and outcomes as Task 1's blessed lines** (`24 checkpoints, 14687 ticks, outcome 1`; `39 checkpoints, rematch on tick 14687, rounds 14687 ticks outcome 1 then 8785 ticks outcome 2`), with new hashes. Read Task 1's lines with `git log --grep="chore(w3): SIM_VERSION 56 -> 57" --format=%B -n 1`.

Any other tick count or outcome: stop, as in Step 1.

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

Run: `git status --short tests/golden tests/fixtures`
Expected: `M tests/golden/basic.json`, `M tests/golden/duel-1.json`, `M tests/golden/duel-rematch.json`, and nothing else.

- [ ] **Step 3: The duel gates did not move**

Run: `npx tsx scripts/duel-telemetry.ts`
Run: `npx tsx scripts/valkyrn-telemetry.ts`
Expected: the gate summary lines, the passive median and the Valkyrn summary are character for character the ones in Task 1's commit message. If any line differs, stop, as in Step 1.

Run: `git diff --stat master -- tests/duelGates.test.ts`
Expected: no output (the gates test is unchanged).

Run: `npx vitest run tests/duelGates.test.ts`
Expected: PASS.

- [ ] **Step 4: Typecheck, build, the full suite**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx electron-vite build`
Expected: the build succeeds.

Run: `npx vitest run --maxWorkers=4`
Expected: every test file PASS. A timeout in a load-sensitive file (Global Constraints) is re-run alone with `npx vitest run <that file>` before it counts.

- [ ] **Step 5: The sector determinism check (it does not cover the duel)**

Run: `npm run test:determinism`
Expected: PASS on every runtime it reports (Node, Electron, Firefox). It replays the sector fixture only, so it says nothing about the manual torpedo. The final report lists "duel/manual torpedo determinism across runtimes: not verified (guard rules, the additive oracle and Node goldens only)".

Run: `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability`
Then: `git status --short .superpowers/sdd`
Expected: no output.

- [ ] **Step 6: The build and the version check**

Run: `npm run build`
Expected: success.

Run: `git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`
Expected: `src/renderer/src/sim/tuning.ts:7:export const SIM_VERSION = 57;`

Run: `git grep -n "KeyX: 'stand'" -- src/renderer/src/app/duel/input.ts`
Expected: one line (X is still Stand).

- [ ] **Step 7: The gates entry**

Append to `docs/gates.md` with Edit; the file is CRLF. Add the text after its last line (the W-2 entry's `- [ ] Manual (owner): …` line), with no merge markers, and put Steps 1 to 4's real numbers in place of the angle-bracket fields:

```markdown

## W-3: the manual torpedo (2026-11-18)

Spec `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md` §3; plan `docs/superpowers/plans/2026-11-18-w3-manual-torpedo.md`.

- [x] Automated (W-3): `npx vitest run` passes (<files> files). This includes the mode (every round AUTO, the Hunter always; V, since X is Stand and C the camera; the mode fixed at launch), the MANUAL launch (no lock, no range, no auto-launch), the flight (A/D at the torpedo's turn rate, the held heading by the Helm's hold law, full thrust then a coast, no homing, only its Weapons seat flies it), the hit (the room under the impact point, 3 hull), the commands' admission and the codec, the held torpTurn and torpHeading in every held schema (a pause and an expiry clear them), the snapshot bounds, V, F and the steering in Single player and online (the always-send launch), the right button's heading, the camera follow and the TORPEDO card's AUTO / MAN tag (`tests/manualTorpedo*.test.ts`, `tests/torpedoCamera.test.ts`, `tests/manualTorpedoUi.test.tsx`). `npx tsc -b` is clean; SIM_VERSION 57, goldens blessed. The additive duel oracle proves every AUTO run unchanged per tick (<R> runs, <T> ticks); `tests/torpedoGuidance.test.ts` still passes; the duel gates are unchanged (Hound median <s> s, <w> wins, <l> losses; Valkyrn median <s> s, <h> Hunter wins).
- [ ] Manual (owner): play a Single player duel at Weapons.
  1. The TORPEDO card shows an AUTO tag beside the LASER card's. Press V (or click the tag) and it reads MAN, lit, and the card says MANUAL.
  2. With the enemy far out of range, press F: the torpedo leaves the nose, and the Weapons map follows it. Hold A or D and it turns. Right click or drag on the map and it swings onto the bearing from the torpedo to the mouse and holds it, until A or D takes over again. The card says STEER A/D.
  3. Fly it into the enemy: the struck room is the one under the impact. When the flight ends, the map goes back to your ship.
  4. Press V again for AUTO: a locked torpedo launches and homes by itself, as before.

  Screenshots for the look gate:
  1. The TORPEDO card with the AUTO tag, and with the MAN tag lit (MANUAL).
  2. A MANUAL torpedo in flight with the Weapons camera following it (STEER A/D on the card).
  3. The torpedo swinging onto a right-drag heading.

  Do the tags read on the amber CRT, is the followed torpedo easy to fly, and does the right-drag heading feel like the Helm's?
```

- [ ] **Step 8: Commit**

```bash
git add scripts/golden/duelOracle.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json docs/gates.md
git commit -m "test(w3): same-version bless at SIM_VERSION 57 for the manual torpedo (additive oracle: every AUTO run unchanged per tick; duel gates unchanged)" -m "<the four blessed lines from Step 2>" -m "<the duel oracle line from Step 1>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: The owner's look gate (not blocking the merge)**

Report to the owner that the manual look check is open (the `docs/gates.md` entry), with the screenshots it names:
1. The TORPEDO card with the AUTO tag, and with the MAN tag lit.
2. A MANUAL torpedo in flight with the Weapons camera following it.
3. The torpedo turning onto a right-drag heading.

Take them by the visual check method: playwright-core outside the repo, and Electron `_electron.launch` on `out/`. Walking must line up with the one-tile doors.

---

## Self-review

**1. Spec coverage (sections 3 to 7 for W-3):**
- **§3 The toggle:**
  - Per-slot sim state, AUTO at the start, the Hunter always AUTO (Task 2; the validator's crew-only rules; Decision 6).
  - V instead of X (Decision 1; Task 6) and the tag on the TORPEDO card (Task 7).
  - `torpMode {manual}` sets it (Task 4).
  - The mode is copied at launch, and a mid-flight toggle changes nothing (Tasks 2, 3).
- **§3 AUTO unchanged:**
  - The AUTO paths are gated only on the mode (Tasks 2, 3).
  - `headingTurn` is refactored through `holdTurn` with an identical result (Task 3).
  - Proved by the additive oracle and the unchanged gates (Task 8) and `tests/torpedoGuidance.test.ts` (Task 3).
- **§3 MANUAL:**
  - **Launch:** F with none in flight, a torpedo in the magazine and Weapons below 2, with no lock and no range; a `torpLock` never auto-launches (Tasks 2, 4, 6).
  - **Flight:**
    - It leaves the tube as today, then full thrust while fuelled, then a coast, with no homing (Task 3; Decision 3).
    - A/D at the turn rate, and the held heading by the Helm's hold law, cancelled by A/D (Tasks 3, 5, 6; Decision 2).
    - The steering is the Weapons seat's `HeldInput` `torpTurn` / `torpHeading` (Task 4).
    - Every collision rule stays unchanged (Task 3).
  - **Hit:** the room under the impact point, 3 hull, any lock ignored (Task 3; Decision 5).
  - **Weapons map:** it follows the flight and goes back (Task 5; Decision 9).
  - **Keys:** A/D steer instead of walking (the officer is seated; Task 6).
- **§4:**
  - `torpMode` is in `DuelCommand`, `duelWire`, the authority (through the codec and step; no rules edit), `DUEL_KINDS`, an explicit `WEAPON_ORDER` place, `shipModule.commands` and the four pinned lists (Task 4).
  - The held fields are in the held-input schema and in the authority's three other strict held schemas and its clearing (Task 4; Decision 10).
  - Local input comes from `runtime.ts`, online input from `onlineDuel.ts` (Task 6).
  - The torpedo mode per slot and the manual flag per torpedo are hashed, snapshotted (through the tactical modules) and validated (Task 2).
  - Arithmetic uses the tables and sqrt only (Task 3); SIM_VERSION goes 56 → 57 once and the goldens are re-recorded (Tasks 1, 8).
  - Determinism: `npm run test:determinism` replays the sector only (Task 8 Step 5).
- **§5 manual torpedo checks:**
  - Launches with no lock and out of range (Tasks 2, 4, 6).
  - A and D turn it, the held heading converges, and thrust is full until the fuel runs out (Task 3).
  - The room under the impact point (Task 3).
  - The mode is fixed at launch, including a mid-flight toggle either way (Tasks 2, 3).
  - AUTO is unchanged (Tasks 3, 8).
- **§5 Network:** the codec round-trips `torpMode` and the held fields; malformed values and wrong-seat senders are rejected (Task 4).
- **§5 UI:** the tags toggle and show the state (Task 7); Z and V are in the Settings list (Task 6). Final checks (Task 8). Screenshots of a manual torpedo in flight (Task 8 Steps 7, 9).
- **§6:** the mode never changes mid-flight; the Valkyrn and the sector mode are out of scope (Decision 12).
- **§7:** W-3 only, with the owner's look check (Task 8 Step 9).

**2. Placeholder scan:** every code step carries complete code. The values that cannot be known before running come from explicit commands with an exact rule:
- the bless and oracle lines, and the gate numbers, which are recorded in Task 1's commit message and compared character for character in Task 8;
- the gates entry's numbers, from Steps 1 to 4's output.

No knob is tuned, and no pin is re-pinned.

**3. Type consistency:**
- **Sim state:** `ShipSystems.torpManual` and `Missile.manual` (Task 2) are read in Tasks 3 to 7. `placeMissile(…, manual)` (Task 2) is used in the tests of Tasks 2 to 7.
- **Ship input:** `ShipInput.torpTurn` / `torpHeading` (Task 2) are filled by the step's `heldTorpSteer` (Task 4) and read by `stepDuel` (Task 3).
- **Sim functions:**
  - `canLaunch(state, i, torpRock?, manual?)` (Task 2) is used in Tasks 2, 6 and 7.
  - `holdTurn`, `manualTorpTurn` and `manualTorpedoFlying` (Task 3) are used in Tasks 3, 5, 6 and 7.
  - `flyMissile(state, i, steer)` (Task 3) is called by `duel.ts` (Task 3).
- **Command and held input:** `torpMode {manual}` and `HeldInput.torpTurn` / `torpHeading` (Task 4) are sent in Task 6.
- **App:**
  - `MapRequests.torpHeading` / `takeTorpHeading` (Task 5) are used in Tasks 5 and 6.
  - `createTorpedoFollow` / `trackManualTorpedo` (Task 5) are wired in `runtime.ts` and `onlineSource.ts` (Task 5).
  - `KeyAction 'torpMode'` (Task 6) is pressed by the tag (Task 7).
  - `refusal(d, control, manual?)` (Task 6) is used in `runtime.ts` and `onlineDuel.ts` (Task 6).
  - `DuelRuntimeDeps.takeTorpHeading` (Task 6) is wired in `duelMode.ts` (Task 6).
  - `WeaponsPanel.torpManual` / `torpFlyingManual` (Task 7) are drawn by `WeaponsStation.tsx` (Task 7).
