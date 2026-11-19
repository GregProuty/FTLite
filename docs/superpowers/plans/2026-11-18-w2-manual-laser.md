# W-2 Manual Laser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the crew laser an AUTO / MANUAL mode: AUTO is today's laser, unchanged; in MANUAL it charges as today but never fires by itself, and Space fires its shot or burst along the Weapons map aim (the pew's aim format and ±60° clamp) as an instant 450-unit beam that rocks and the planet stop, torpedoes do not, and that strikes the room under its hit point; Z and an AUTO / MAN tag on the LASER card toggle it, and the Weapons map shows a dashed aim line while it is charged.

**Architecture:** Two new fields on each `ShipSystems` record, `laserManual` (the mode) and `laserAim` (the fine aim a pending MANUAL burst shot fires along, −1 none), hashed, cloned and bounded through `sim/tactical/hash.ts`, so the duel snapshot follows with no snapshot code change. The sim (`sim/tactical/weapons.ts`) gates today's auto-fire and AUTO press on the mode, and adds `shootAlong` (the beam: `firstBlocker` for the rock or planet, `segmentEntry` for the ships, `roomAtImpact` for the room, today's strike refactored into a shared `laserStrike`), fed by a new `ShipInput.laserFire`. Two new duel commands, `laserMode {manual}` (set in the step's admission, as `laserFrequency` sets the frequency) and `laserFire {aim, aimAcc}` (folded into `ShipInput.laserFire`), go through the contract, the zod wire, `DUEL_KINDS`, `WEAPON_ORDER` and `shipModule.commands`. The views read the state; the scene tracks the pointer's bearing on the open Weapons map into `MapRequests` as the laser's aim; the Single player runtime and the online seat send the commands.

**Tech Stack:** TypeScript, Vitest (+ jsdom for UI tests), Pixi.js (tactical layer), React + zustand (console), zod (codec), Electron/electron-vite.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md`, sections 2, 4, 5, 6 and 7 (W-2 only). Section 3 (the manual torpedo, W-3) is out of scope: no `torpMode`, `torpTurn`, `torpHeading`, no per-torpedo manual flag, and X stays Stand (`PRESS_CODES.KeyX`).
- **Exact names and values (binding):** commands `laserMode { manual: boolean }` and `laserFire { aim: number; aimAcc: number }`; `ShipSystems.laserManual: boolean` (false AUTO, true MANUAL) and `ShipSystems.laserAim: number` (−1 none); `ShipInput.laserFire: number` (a fine aim, −1 none); `LASER_ARC_STEPS = 10922` (±60° in fine heading units, the laser's existing arc, `LASER_ARC_COS` 0.5); the beam's reach is the laser def's `range` (`LASER_RANGE` 450); the key is Z (`PRESS_CODES.KeyZ: 'laserMode'`); the tag reads `AUTO` / `MAN`; `manualLaserReady(state, i)` in `sim/tactical/weapons.ts`; `MapRequests.aimLaser(aim)`, `laserAim()`, `resetLaserAim()`.
- **Aim (spec §4):** `aim` is a heading index 0..255 and `aimAcc` an integer 0..255; in the sim they combine into one fine aim `aim × 256 + aimAcc` in `0..AIM_STEPS − 1` (`AIM_STEPS = 65536`), clamped with `clampAim(heading, aim, LASER_ARC_STEPS)` from `sim/tactical/pew.ts` about the ship's integer heading. Never a float angle in the sim. Validated with `validAim` (pew.ts), as `pewFire` is.
- **Sim rules:** only + − × ÷ and sqrt in `src/renderer/src/sim/**` (`tests/helpers/determinismGuard.ts` allows `Math.abs/ceil/floor/round/min/max/sign/imul/sqrt` only: no `Math.PI`, no trig, no `**`, no `Math.hypot`); heading tables (`aimDir`, `hx`, `hy`); no randomness in W-2. No sim file imports from `app/`, `render/`, `input/` or `tests/`.
- **Version (binding):** SIM_VERSION goes 55 → 56 once (`src/renderer/src/sim/tuning.ts:7`). The bless guard (`scripts/golden/blessGuard.ts`) lets a bump through only when the canonical trace and the duel oracle prove every run unchanged per tick, which new hashed fields cannot pass. So Task 1 bumps the version alone and blesses, and Task 8 does the one re-record as a same-version `npm run bless` (allowed without proofs). Never pass `--fresh`; never hand-edit `tests/golden/*.json` or `tests/fixtures/determinism-v2.json`. The proof baselines are `npx tsx scripts/golden/canonical-trace.ts baseline` and `npx tsx scripts/golden/duel-oracle.ts baseline`; if a check refuses because a baseline is stale or from another checkout, re-record it as Task 1 Step 4 says.
- **No tuning (binding):** W-2 moves no tuning knob. MANUAL is off by default and neither the scripted gunner nor the Hunter ever sends `laserMode`, so every AUTO duel must be unchanged tick for tick. Task 8 proves it with the duel oracle's additive mode and checks that the duel gates (`tests/duelGates.test.ts`, `scripts/duel-telemetry.ts`, `scripts/valkyrn-telemetry.ts`) print exactly Task 1's numbers. If any gate number or golden tick count moves, stop: it is a defect in the AUTO path (the oracle names the first differing field and tick), never a reason to tune.
- **Known-red window:** from Task 2 (new hashed fields) until Task 8's bless, `tests/duelGolden.test.ts`, `tests/duelRematchGolden.test.ts` and `tests/golden.test.ts` (its `basic.json` embeds the content digest of every sim file) fail by design. Every other test must pass at the end of each task. Each task runs its own targeted tests; the full suite runs in Tasks 1 and 8.
- **Re-pin rule (W-1):** a trajectory-pinned test (`tests/duelCheckpoint.test.ts`, `tests/duelSnapshot.test.ts` seed/tick, `tests/duelModules.test.ts` `played(6, …)`, `tests/tacticalSlots.test.ts`, `tests/duelScripted.test.ts`, `tests/duelGates.test.ts`) is re-pinned only after a deliberate gameplay change. W-2 changes no AUTO trajectory, so a failing pin is a bug to fix, never a re-pin.
- **Left click and onWeaponsMap gating (W-1):** the left click on the Weapons map stays the pew's (`scene.ts` `pewClick`); W-2 never takes it. The laser's aim follows the pointer only while `onWeaponsMap(p, contactShown, statusRows)` says it is on the open map; anywhere else (a console block, the open contact window, off the canvas, no pointer) the last aim stands. Space (or the FIRE button) fires the MANUAL laser.
- **Generated files come only from their scripts:** `tests/golden/*.json` and `tests/fixtures/determinism-v2.json` from `npm run bless`. W-2 adds no asset, sound or credit.
- **Test commands:** targeted `npx vitest run <files>`; `npx tsc -b`; the full suite `npx vitest run --maxWorkers=4`, always after `npx electron-vite build`. Never run two vitest processes at once. A full-suite timeout under load (`tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts`, `tests/gate-*.test.ts`, `tests/duelGates.test.ts`) is re-run alone with `npx vitest run <that file>` before it counts as a failure.
- **Line endings:** the working copies are CRLF (`core.autocrlf=true`; the index is LF). Change existing files with the Edit tool (it keeps their endings); never hand-convert endings. New files may be written with LF; git normalises them on commit.
- **Worktrees:** never delete a `node_modules` junction in a worktree (including `services/signalling/node_modules`); a missing one is recreated, never "cleaned".
- **Determinism logs:** `npm run test:determinism` rewrites tracked logs under `.superpowers/sdd/2026-11-14-net-1b-durability/`; after every run, restore them with `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability` before staging anything.
- **Git:** never `git add -A`, `git add .` or `git stash`; stage by name. Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (passed as the last `-m`). Files are UTF-8. Line numbers below were read on master at `f998f353`: **match every edit by the quoted text**, not the number.
- **Comments:** a header comment citing the spec section on each new file; doc comments on exports; cite "W-2 (pew pew spec §x)" on changed lines that need a reason.

## Decisions where the spec leaves room, and where the code forces a choice

1. **Version bump first, the re-record last, and an additive proof in between** (Global Constraints, Version). Task 1 also records a duel-oracle baseline at 56, so Task 8 can run `duel-oracle.ts added` with the two new fields declared in `ADDITIONS[56]` (`frozen`: they must hold their first value, false and −1, at every tick of every oracle run). That proves every AUTO run unchanged per tick.
2. **A MANUAL beam on a rock does what master's laser does to a rock today** (`rockWeapons.ts` `laserStrikesRock`: a push of `LASER_ROCK_PUSH` along the beam, then `LASER_ROCK_DAMAGE`, which may break it). The spec's "with no effect" predates asteroids-ii; the controller resolved it this way. The planet stops the beam with no effect.
3. **The beam** starts at the ship's centre (as today's laser and its range check do) and runs `laser.range` (450) along the aim, clamped about the heading at its own tick. The first solid body comes from `rocks.ts` `firstBlocker` (the planet wins a tie with a rock; a piece born this tick is not in the way). Any other active ship whose circle the beam enters strictly before that body is hit (a tie goes to the rock or planet). Torpedoes are never tested (spec §6 decision 3).
4. **The hit on a ship** strikes the room under the beam's entry point by `geometry.ts` `roomAtImpact`, the function `missiles.ts` `land` uses for a self-hit. Shields, the weak frequency, the room level and the hull use today's code, moved unchanged into a shared `laserStrike` that the AUTO `shoot` also calls (its events are byte-identical, so the oracle sees no change).
5. **Bursts:** a MANUAL trigger stores its clamped fine aim in `laserAim` while the Cutter's second shot is pending. That shot fires from the ship's position at its own tick, along the stored world aim re-clamped about the heading at that tick, and is re-checked for what it hits then. `laserAim ≥ 0` marks a MANUAL burst: a mode change mid-burst does not change it (a burst fired MANUAL finishes MANUAL, an AUTO one finishes AUTO). `laserAim` clears with the burst's last shot, and when Weapons goes offline.
6. **The mode is sim state set during admission** in `sim/duel/step.ts`, as `laserFrequency` sets `freq`, so a same-tick `laserCharge` or `laserFire` is judged in the new mode. `WEAPON_ORDER` becomes `laserMode, laserLock, torpLock, rockLock, laserCharge, laserFire, missileLaunch, pewFire`, `applyWeaponsInput`'s order (the manual shot fires after the AUTO press and auto-fire, before the torpedo launch).
7. **Mode mismatches are refused:** `laserFire` in AUTO and `laserCharge` in MANUAL answer `unavailable` (and the sim also ignores them). `laserMode`/`laserFire` on a class without a laser answer `unavailable`. A same-value `laserMode` is `noop`. A second `laserFire` in a tick is `noop`. With a torpedo in flight `laserFire` answers `missile-in-flight` (laserFrozen, as `laserCharge` does). Without a full charge, with a burst pending or with Weapons at level 2 it answers `unavailable` (NO CHARGE). Online, any `unavailable` answer to a `laserFire` this seat sent shows NO CHARGE (W-1's rule); a rare mode race (Z pressed just before Space) can mislabel one refusal, accepted.
8. **Every round starts AUTO** (`state.ts` `systemsFor`), the rematch included, as every systems field is rebuilt per round. The Hunter is always AUTO: only the step's crew admission ever writes `laserManual`, and the validator refuses `laserManual` on any slot but the crew's.
9. **NO CHARGE in MANUAL** is `refusal(d, 'fire', manual)`: after NO GUNNER, TORPEDO FLYING and WEAPONS OFFLINE, a MANUAL press without `manualLaserReady` (a full charge, no burst pending, Weapons below 2) says NO CHARGE. In AUTO the press keeps today's words (none for an uncharged laser: today's press is admitted and does nothing). The spec's "as the existing Space press is" therefore applies to MANUAL only.
10. **The aim's source:** the scene writes the pointer's fine bearing from the own ship's drawn marker into `MapRequests.aimLaser` every frame the pointer is on the open Weapons map (`onWeaponsMap`), whatever the mode, so the aim is ready when the mode changes. `laserAim()` peeks (it is not drained). Off the map the last aim stands; with none yet the runtime and the line use the ship's heading (`heading × 256`). A new round clears it.
11. **The dashed aim line** shows on the Weapons console only, in MANUAL, while Space would fire: `manualLaserReady` and no own torpedo in flight. It is drawn from the own ship's drawn marker along the clamped aim to `LASER_RANGE`, dashed in `CRT.main`, beside the pew's solid `mid` aim line.
12. **The LASER card:** an `AUTO` / `MAN` tag button (`console-laser-mode`) in the card's header row, lit in MANUAL, pressing `laserMode` as Z does. In MANUAL the card never says FIRING (its reason `FIRING` / `PICK A ROOM TO FIRE` reads `MANUAL: SPACE FIRES`) and has no goal glow. The map's status sentence and FIRING SOLUTION bracket are unchanged: they say the enemy is in arc, range and sight, which in MANUAL means "aim and fire".
13. **Online gap events:** a MANUAL hit names the first enemy room whose level rose in the gap (the snapshot does not carry the hit point), instead of the lock room. A miss beam is still drawn along the heading.
14. **Out of scope, by spec §6:** the Valkyrn. `laserMode` is admitted for any class with a laser (the developer laser fit included), but the Flight seat sends no `laserMode` or `laserFire`.

---

### Task 1: SIM_VERSION 55 → 56 alone, proved and blessed; the gate numbers and the additive-proof baseline recorded

**Files:**
- Modify: `src/renderer/src/sim/tuning.ts:7`
- Regenerated by `npm run bless`: `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`

**Interfaces:**
- Consumes: master at SIM_VERSION 55 (`f998f353`).
- Produces: `SIM_VERSION === 56` for every later task; the gate numbers at 56 in this commit's message (Task 8 compares them); a duel-oracle baseline at 56 in the temp folder (Task 8's additive proof).

- [ ] **Step 1: Pre-flight**

Run: `git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`
Expected: `src/renderer/src/sim/tuning.ts:7:export const SIM_VERSION = 55;`

Run: `git status --short -- src tests scripts`
Expected: only the untracked `scripts/playtest-audit.ts`. If any tracked file under `src`, `tests` or `scripts` is modified, stop and report.

- [ ] **Step 2: Record both baselines at SIM_VERSION 55**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 55: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to <temp>\trace.json`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version 55: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0. Note `<R>`, `<T>`, `<F>`.

- [ ] **Step 3: The version**

`src/renderer/src/sim/tuning.ts` line 7 becomes:

```ts
export const SIM_VERSION = 56;
```

Nothing else in `src/` changes in this task; `MIGRATIONS` and `ADDITIONS` in `scripts/golden/duelOracle.ts` are not touched.

- [ ] **Step 4: Both proofs before the bless**

Run: `npx tsx scripts/golden/canonical-trace.ts check`
Expected: `per-tick canonical trace identical, sim version 55 → 56: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <sha>)`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts check`
Expected: `duel oracle: <R> runs, <T> ticks, <F> named fields, results, events and telemetry identical at every tick field for field, sim version 55 → 56 (baseline HEAD <sha>)`, exit 0, with Step 2's numbers.

If either check refuses because its baseline is stale (another sim version, another checkout's cwd, or a HEAD other than `f998f353`): set line 7 back to `export const SIM_VERSION = 55;` with Edit, re-run both Step 2 commands, set it to 56 again, and re-run both checks. Any other failure: stop and report.

- [ ] **Step 5: Bless**

Run: `npm run bless`
Expected, exit 0 (new hashes; counts, ticks and outcomes are master's):
```
blessed tests/golden/basic.json: 120 checkpoints, final <hex>
blessed tests/golden/duel-1.json: 30 checkpoints, <ticks> ticks, outcome <o>, final <hex>
blessed tests/fixtures/determinism-v2.json: sim version 55 → 56, <n> samples and <m> boundaries unchanged apart from the version and hashes
blessed tests/golden/duel-rematch.json: <c> checkpoints, rematch on tick <t>, rounds <t1> ticks outcome <o1> then <t2> ticks outcome <o2>, final <hex>
```

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

- [ ] **Step 6: The full suite at 56, and the gate numbers**

Run: `npx tsc -b`, then `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: no type errors; the build succeeds; every test file PASS (a load timeout re-run alone first).

Run: `npx tsx scripts/duel-telemetry.ts`
Expected: ten duel lines, then the gate summary. Copy the summary block (the `median length`, `crew wins`, `crew losses`, `at the cap` and `planet-contact ends under 30 s` lines) and the `passive median` line for the commit message.

Run: `npx tsx scripts/valkyrn-telemetry.ts`
Expected: the Valkyrn gate summary. Copy its summary lines for the commit message.

- [ ] **Step 7: Commit**

`git status --short -- src tests` lists exactly the five files below.

```bash
git add src/renderer/src/sim/tuning.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json
git commit -m "chore(w2): SIM_VERSION 55 -> 56 alone, blessed (canonical trace and duel oracle prove every run unchanged per tick)" -m "<the four blessed lines from Step 5>" -m "Gates at 56 (Task 8 must print these exactly): <the duel-telemetry summary lines and passive median from Step 6>; Valkyrn: <the valkyrn-telemetry summary lines>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: The additive-proof baseline at 56**

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version 56: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0, with Step 2's `<R>`, `<T>`, `<F>`. Task 8 Step 1 checks the W-2 runs against this file. Do not record a duel-oracle baseline again before Task 8.

---

### Task 2: The laser mode and the burst aim as state; MANUAL never fires by itself; hashed, cloned and bounded

**Files:**
- Modify: `src/renderer/src/sim/tactical/tuning.ts` (append), `src/renderer/src/sim/tactical/state.ts`, `src/renderer/src/sim/tactical/weapons.ts`, `src/renderer/src/sim/tactical/hunter.ts:129`, `src/renderer/src/sim/tactical/hash.ts`, `src/renderer/src/sim/duel/step.ts:210-211`
- Create: `tests/manualLaserMode.test.ts`
- Modify (tests the new shapes touch): `tests/tacticalDeterminism.test.ts:116,122-128`, `tests/duelSnapshot.test.ts` (the `cases` list)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  ```ts
  // sim/tactical/tuning.ts
  export const LASER_ARC_STEPS: number;   // 10922: ±60° in fine heading units
  // sim/tactical/state.ts, ShipSystems
  laserManual: boolean;   // false AUTO (every round's start), true MANUAL (the crew only)
  laserAim: number;       // the fine aim a pending MANUAL burst shot fires along, −1 none (0 in an inactive slot)
  // sim/tactical/weapons.ts
  // ShipInput.laserFire: number   (a fine aim 0..65535, −1 none; −1 in IDLE_INPUT, UNCREWED_INPUT, the Hunter's and the step's)
  export function manualLaserReady(state: TacticalState, i: number): boolean;   // full, no burst pending, Weapons below 2
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/manualLaserMode.test.ts`:

```ts
// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §4, §5): the crew laser's mode. Every round starts AUTO, the
// Hunter always; in MANUAL the laser charges as today but never fires by itself (neither the auto-fire on its target nor
// the AUTO press). The mode and a MANUAL burst's aim are hashed, cloned and bounded: only the crew is ever MANUAL, and an
// aim waits only while a burst is pending.
import { describe, expect, it } from 'vitest';
import { flattenTactical, hashTactical, TACTICAL_MODULES, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { beginRockTick } from '../src/renderer/src/sim/tactical/rocks';
import { cloneTactical, createTacticalState, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { AIM_STEPS, LASER_ARC_STEPS, LASER_CHARGE_UNITS, PEW_ARC_STEPS } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT, manualLaserReady, tickWeapons } from '../src/renderer/src/sim/tactical/weapons';

/** The crew at (0, 1500) nose north and still, no rocks, the Hunter at `enemyAt` (default far off, out of laser range),
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

describe('the laser mode (spec §2)', () => {
  it('every slot starts AUTO with no burst aim; the arc in fine units is the pew cone\'s 60°', () => {
    const st = createTacticalState(5);
    expect([st.systems[0].laserManual, st.systems[1].laserManual, st.systems[0].laserAim, st.systems[1].laserAim]).toEqual([false, false, -1, -1]);
    expect(LASER_ARC_STEPS).toBe(10922);
    expect(LASER_ARC_STEPS).toBe(PEW_ARC_STEPS);   // the laser's existing ±60° (LASER_ARC_COS 0.5)
  });
  it('AUTO fires at its target when full and eligible, as today; MANUAL holds the same full charge and never fires', () => {
    const auto = open({ x: 0, y: 1300 });
    weaponsTick(auto);
    expect(auto.systems[0].shots).toBe(1);
    const manual = open({ x: 0, y: 1300 });
    manual.systems[0].laserManual = true;
    for (let k = 0; k < 120; k++) weaponsTick(manual);
    expect(manual.systems[0].shots).toBe(0);
    expect(manual.systems[0].laserCharge).toBe(LASER_CHARGE_UNITS);
  });
  it('in MANUAL the AUTO press (laserCharge) fires nothing', () => {
    const st = open({ x: 0, y: 1300 });
    st.systems[0].laserManual = true;
    weaponsTick(st, { ...IDLE_INPUT, laserCharge: true });
    expect(st.systems[0].shots).toBe(0);
  });
  it('MANUAL charges as today: from empty, the same charge tick for tick as AUTO', () => {
    const a = open(), m = open();
    m.systems[0].laserManual = true;
    a.systems[0].laserCharge = 0; m.systems[0].laserCharge = 0;
    for (let k = 0; k < 60; k++) { weaponsTick(a); weaponsTick(m); expect(m.systems[0].laserCharge).toBe(a.systems[0].laserCharge); }
    expect(m.systems[0].laserCharge).toBeGreaterThan(0);
  });
  it('manualLaserReady: a full charge, no burst pending, Weapons below level 2', () => {
    const st = open();
    expect(manualLaserReady(st, 0)).toBe(true);
    st.systems[0].laserCharge = LASER_CHARGE_UNITS - 1;
    expect(manualLaserReady(st, 0)).toBe(false);
    st.systems[0].laserCharge = LASER_CHARGE_UNITS; st.systems[0].laserBurst = 1;
    expect(manualLaserReady(st, 0)).toBe(false);
    st.systems[0].laserBurst = 0; st.systems[0].rooms[Room.Weapons] = 2;
    expect(manualLaserReady(st, 0)).toBe(false);
  });
});

describe('the mode in the modules (spec §4)', () => {
  it('moves the hash, is copied by the clone, and is bounded by the validator', () => {
    const st = createTacticalState(5), shape = createTacticalState(5), base = hashTactical(st);
    st.systems[0].laserManual = true;
    expect(hashTactical(st)).not.toBe(base);
    const copy = cloneTactical(st);
    expect(copy.systems[0].laserManual).toBe(true);
    expect(flattenTactical(copy)).toEqual(flattenTactical(st));
    st.systems[0].laserManual = false;
    expect(hashTactical(st)).toBe(base);
    Object.assign(st.systems[0], { laserManual: true, laserBurst: 1, laserBurstClock: 5, laserAim: 300 });
    expect(hashTactical(st)).not.toBe(base);
    const values = Array.from(flattenTactical(st));
    expect(validateTacticalValues(shape, values)).toBe(values.length);
    const bad = (name: string, v: number, why: RegExp): void => {
      const x = [...values]; x[offsetOf(st, name)] = v;
      expect(() => validateTacticalValues(shape, x), `${name} = ${v}`).toThrow(why);
    };
    bad('systems.0.laserManual', 2, /out of range/);
    bad('systems.1.laserManual', 1, /only the crew laser has a manual mode/);   // the Hunter is always AUTO
    bad('systems.0.laserAim', AIM_STEPS, /out of range/);
    bad('systems.0.laserAim', -2, /out of range/);
    bad('systems.0.laserAim', 0.5, /out of range/);
    bad('systems.1.laserAim', 7, /a manual aim with no burst pending/);   // the Hunter's laserBurst is 0
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/manualLaserMode.test.ts`
Expected: FAIL (`LASER_ARC_STEPS` and `manualLaserReady` are not exported; `laserManual` is undefined).

- [ ] **Step 3: The arc in fine units**

Append to `src/renderer/src/sim/tactical/tuning.ts`:

```ts

// Manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §4; W-2). No new tuning knob: the beam is today's laser.
/** W-2: the laser's ±60° arc (LASER_ARC_COS 0.5) in fine heading units, rounded down as PEW_ARC_STEPS is: the MANUAL aim's clamp. */
export const LASER_ARC_STEPS = Math.floor((60 / 360) * AIM_STEPS);   // 10922
```

- [ ] **Step 4: The state**

In `src/renderer/src/sim/tactical/state.ts`:

(a) In `ShipSystems`, after the line `  pewCharge: number; pewShots: number; pewHits: number;`, insert:

```ts
  /** W-2 (pew pew spec §2, §4): the laser's mode, false AUTO (it fires at its target by itself, as before) or true MANUAL
   *  (it charges as before but fires only on laserFire, along an aim); only the crew's is ever MANUAL (laserMode), and every
   *  round starts AUTO. `laserAim`: the fine aim (0..AIM_STEPS − 1) a MANUAL burst's pending shots fire along, −1 while no
   *  MANUAL burst is pending. An inactive slot holds zeros. */
  laserManual: boolean; laserAim: number;
```

(b) In `systemsFor`, the line `    pewCharge: pew ? pew.shots * pew.rechargeTicks : 0, pewShots: 0, pewHits: 0   // W-1: a pew starts the round full` becomes:

```ts
    pewCharge: pew ? pew.shots * pew.rechargeTicks : 0, pewShots: 0, pewHits: 0,   // W-1: a pew starts the round full
    laserManual: false, laserAim: -1   // W-2: every round starts AUTO, with no MANUAL burst pending
```

(c) In `emptySystems`, the end `gunShots: 0, gunHits: 0, pewCharge: 0, pewShots: 0, pewHits: 0 };` becomes:

```ts
gunShots: 0, gunHits: 0, pewCharge: 0, pewShots: 0, pewHits: 0, laserManual: false, laserAim: 0 };
```

- [ ] **Step 5: The input field, the readiness test and the MANUAL gates**

In `src/renderer/src/sim/tactical/weapons.ts`:

(a) In `ShipInput`, after the `pewAim: number;` member, insert:

```ts
  /** W-2 (pew pew spec §2, §4): the MANUAL laser's fine aim this tick (pewAim's format, 0..65535), or −1 for no shot. Read
   *  only by the crew's laser in MANUAL; the duel step admits the first laserFire, the Hunter never sends one. */
  laserFire: number;
```

(b) `IDLE_INPUT` and `UNCREWED_INPUT` become:

```ts
export const IDLE_INPUT: ShipInput = { helm: true, weapons: true, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false, gunHeld: false, pewAim: -1, laserFire: -1, scanner: true };
```
```ts
export const UNCREWED_INPUT: ShipInput = { helm: false, weapons: false, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false, gunHeld: false, pewAim: -1, laserFire: -1, scanner: true };
```

(c) After the `laserOffline` function, insert:

```ts
/** W-2 (pew pew spec §2): whether ship i's MANUAL laser would fire on a laserFire now, a torpedo in flight aside
 *  (laserFrozen): a full charge, no burst shot pending, Weapons below level 2. */
export function manualLaserReady(state: TacticalState, i: number): boolean {
  return laserFull(state, i) && state.systems[i]!.laserBurst === 0 && !laserOffline(state, i);
}
```

(d) In `applyWeaponsInput`, the line

```ts
    if (crew) { if (input.laserCharge && s.laserBurst === 0 && laserFull(state, i)) fireLaser(state, i); }   // a single press
```

becomes:

```ts
    if (crew) { if (input.laserCharge && !s.laserManual && s.laserBurst === 0 && laserFull(state, i)) fireLaser(state, i); }   // a single press; W-2: never in MANUAL
```

and the auto-fire comment and line

```ts
  // Auto-fire: on the enemy when eligible; spike ii §6.2: on a rock target when it is on target (AUTO_DIG is false).
  if (armed && crew && s.laserTargeted && s.laserBurst === 0
```

become (the rest of that line unchanged):

```ts
  // Auto-fire: on the enemy when eligible; spike ii §6.2: on a rock target when it is on target (AUTO_DIG is false). W-2: AUTO only.
  if (armed && crew && !s.laserManual && s.laserTargeted && s.laserBurst === 0
```

(e) `applyWeaponsInput`'s doc comment gains, before its closing `*/`: ` W-2 (pew pew spec §2): in MANUAL the laser fires neither on a charge press nor by itself.`

(f) In `src/renderer/src/sim/tactical/hunter.ts`, the `input` literal in `hunterThink` becomes:

```ts
  const input: ShipInput = { helm, weapons, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false, gunHeld: false, pewAim: -1, laserFire: -1, scanner: true };   // W-2: the Hunter is always AUTO
```

(g) In `src/renderer/src/sim/duel/step.ts`, the two lines of the `crew` literal become:

```ts
  const crew: ShipInput = { helm: helm >= 0, weapons: gunner >= 0, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, rockLock: { laser: null, torpedo: null }, laserCharge: null, missileLaunch: false,
    gunHeld: gunner >= 0 && (input.held[gunner] ?? NO_HELD).gunHeld === true, pewAim: -1, laserFire: -1, scanner: true };   // Valkyrn spec §7.1: the trigger of Weapons' attendant; W-1: pewFire sets pewAim; W-2: laserFire sets laserFire (Task 4)
```

- [ ] **Step 6: Hash, clone and bounds**

In `src/renderer/src/sim/tactical/hash.ts`:

(a) The tuning import becomes:

```ts
import { AIM_STEPS, DERELICT_FAR_MAX, DERELICT_FAR_MIN, DERELICT_NEAR_MAX, DERELICT_NEAR_MIN, GUN_POOL, HEADING_COUNT, HUNTER_PEW_GAP, HUNTER_TRAIL_TICKS, PEW_POOL, SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from './tuning';
```

and the state import becomes:

```ts
import { CREW_SLOT, emptyMissile, emptyRound, HunterMode, Outcome, type GunRound, type Missile, type MissileFlight, type Ship, type ShipSystems, type TacticalState } from './state';
```

(b) `SYSTEMS_TAIL`'s last line becomes:

```ts
  'gunHeat', 'gunLocked', 'gunCooldown', 'gunMuzzle', 'gunWear', 'gunHull', 'gunShots', 'gunHits', 'pewCharge', 'pewShots', 'pewHits', 'laserManual', 'laserAim'] as const satisfies readonly (keyof ShipSystems)[];   // the gun's, Valkyrn spec §7.3; the pew's, W-1; the laser mode and burst aim, W-2; gunRoomWear closes the record
```

(c) `FLAGS` becomes:

```ts
const FLAGS = new Set<string>(['released', 'fireHeld', 'laserTargeted', 'gunLocked', 'laserManual']);
```

(d) In `systemsRules`, the two lines

```ts
  // W-1 (pew pew spec §4): the counters ≥ 0; the charge is checked against the slot's own class (pewChargeRule).
  pewShots: count, pewHits: count
```

become:

```ts
  // W-1 (pew pew spec §4): the counters ≥ 0; the charge is checked against the slot's own class (pewChargeRule).
  pewShots: count, pewHits: count,
  // W-2 (pew pew spec §4): the mode a bit, the burst aim a fine aim or −1 (validateTacticalValues adds the crew-only and burst checks).
  laserManual: flagBit, laserAim: within(-1, AIM_STEPS - 1)
```

(e) In `validateTacticalValues`, the line

```ts
  const top = topRules(), slots = shape.ships.length, sys = systemsRules(slots, rockCapacity(shape.map)), inactive = new Set<number>(), owners = new Set<number>(), clsOf = new Map<number, number>();
```

becomes:

```ts
  const top = topRules(), slots = shape.ships.length, sys = systemsRules(slots, rockCapacity(shape.map)), inactive = new Set<number>(), owners = new Set<number>(), clsOf = new Map<number, number>(), burstOf = new Map<number, number>();
```

and after the line `        if (ship[1] === 'systems' && key === 'cls') clsOf.set(i, slice[0]!);   // validated above; read by pewCharge later in the record` insert:

```ts
        if (ship[1] === 'systems' && key === 'laserBurst') burstOf.set(i, slice[0]!);   // W-2: read by laserAim later in the record
        if (ship[1] === 'systems' && key === 'laserManual' && i !== CREW_SLOT && slice[0] !== 0) bad('only the crew laser has a manual mode');   // W-2: the Hunter is always AUTO
        if (ship[1] === 'systems' && key === 'laserAim' && slice[0] !== -1 && (burstOf.get(i) ?? 0) === 0) bad('a manual aim with no burst pending');   // W-2: it waits only for a burst's next shot
```

(f) In `validateTacticalValues`'s doc comment, after `the gun's round pool and the pew's alike, W-1).` add ` W-2: only the crew slot's laser is MANUAL, and a slot's laserAim is −1 unless a burst shot is pending.`

- [ ] **Step 7: The tests the new shapes touch**

(a) In `tests/tacticalDeterminism.test.ts`, the line starting `    expect(Object.keys(st.systems[0]).sort()).toEqual(['cls', 'fireHeld',` (line 116) becomes:

```ts
    expect(Object.keys(st.systems[0]).sort()).toEqual(['cls', 'fireHeld', 'freq', 'gunCooldown', 'gunHeat', 'gunHits', 'gunHull', 'gunLocked', 'gunMuzzle', 'gunRoomWear', 'gunShots', 'gunWear', 'hull', 'laserAim', 'laserBurst', 'laserBurstClock', 'laserCharge', 'laserHits', 'laserHold', 'laserManual', 'laserRock', 'laserTargeted', 'layersStripped', 'lock', 'magazine', 'magazineClock', 'missileHits', 'missilesLaunched', 'missilesLost', 'pewCharge', 'pewHits', 'pewShots', 'rocksBroken', 'rooms', 'shieldClock', 'shields', 'shots', 'target', 'torpLock', 'torpRock', 'torpRockFlying', 'torpRoom']);
```

and the two lines

```ts
    // and 3 pew scalars per slot. So a systems record is 38 scalars and 6 vector values.
    expect(flattenTactical(st).length).toBe(6 + 2 * (13 + st.map.asteroids.length + ROCK_RESERVE + 2) + 2 * MISSILE_SLOT + GUN_POOL * ROUND_SLOT + PEW_POOL * ROUND_SLOT + 9 + st.hunter.trail.length + (st.map.asteroids.length + ROCK_RESERVE) * ROCK_STRIDE + 6 + 2 * 44 + 17);
```

become:

```ts
    // and 3 pew scalars per slot. W-2: the laser mode and the burst aim, 2 more per slot. So a systems record is 40 scalars and 6 vector values.
    expect(flattenTactical(st).length).toBe(6 + 2 * (13 + st.map.asteroids.length + ROCK_RESERVE + 2) + 2 * MISSILE_SLOT + GUN_POOL * ROUND_SLOT + PEW_POOL * ROUND_SLOT + 9 + st.hunter.trail.length + (st.map.asteroids.length + ROCK_RESERVE) * ROCK_STRIDE + 6 + 2 * 46 + 17);
```

(b) `tests/duelSnapshot.test.ts`: in the `cases` list, after the line `        ['systems.1.cls', 0, 0, /systems\.1\.pewCharge: out of range/],   // Task 6 review: ...` (match by its start), insert:

```ts
        ['systems.1.laserManual', 0, 1, /systems\.1\.laserManual: only the crew laser has a manual mode/],   // W-2: the Hunter is always AUTO
        ['systems.0.laserAim', 0, 65536, /systems\.0\.laserAim: out of range/],   // W-2: a fine aim 0..65535, or −1
```

- [ ] **Step 8: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/manualLaserMode.test.ts tests/tacticalDeterminism.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts tests/ftlTargeting.test.ts tests/tacticalWeapons.test.ts tests/weapons.test.ts tests/weaponsUpdate.test.ts tests/roomTargeting.test.ts tests/rockLaser.test.ts tests/rockLock.test.ts tests/semanticWeapons.test.ts tests/pewCharge.test.ts tests/determinismGuard.test.ts tests/tacticalHunter.test.ts`
Expected: PASS (no AUTO behaviour moved: MANUAL is never set outside the new test).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/duel/step.ts tests/manualLaserMode.test.ts tests/tacticalDeterminism.test.ts tests/duelSnapshot.test.ts
git commit -m "feat(w2): the laser's AUTO / MANUAL mode and the MANUAL burst aim as state (hashed, cloned, bounded: crew only); MANUAL never fires by itself" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The MANUAL beam: fired along the aim, stopped by rocks and the planet, through torpedoes, striking the room under its hit point; bursts keep their aim

**Files:**
- Modify: `src/renderer/src/sim/tactical/weapons.ts`
- Create: `tests/manualLaserBeam.test.ts`

**Interfaces:**
- Consumes: Task 2's `ShipSystems.laserManual`, `laserAim`, `ShipInput.laserFire`, `manualLaserReady`, `LASER_ARC_STEPS`; `pew.ts` `aimDir`, `clampAim`; `rocks.ts` `firstBlocker`, `segmentEntry`; `geometry.ts` `roomAtImpact`; `rockWeapons.ts` `laserStrikesRock`.
- Produces: in `applyWeaponsInput`, a crew `laserFire ≥ 0` in MANUAL with `manualLaserReady` and no own torpedo flying fires the class's shot or burst along the aim (`laser` events as today's: `hit`, `stripped`, `room`, `x1, y1` the ship's centre, `x2, y2` the beam's end or hit point, `rock` on a rock). No new export.

- [ ] **Step 1: Write the failing test**

Create `tests/manualLaserBeam.test.ts`:

```ts
// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §5): the MANUAL beam. A laserFire input fires the shot or
// burst along the aim, clamped into the laser's ±60° about the heading: an instant beam from the ship's centre to 450.
// The first rock stops it and takes what the AUTO laser does to a rock (a push, then its damage); the planet stops it;
// a torpedo in its path is not hit. On a ship it strips a layer, or strikes the room under its hit point (+1 level, 2
// hull). A burst's second shot keeps the aim the burst was fired with and is re-checked at its own tick. No shot while
// the own torpedo flies, without a full charge, with a burst pending, offline, or in AUTO.
import { describe, expect, it } from 'vitest';
import { aimDir, clampAim } from '../src/renderer/src/sim/tactical/pew';
import { beginRockTick, rockAt, rockHp } from '../src/renderer/src/sim/tactical/rocks';
import { laserStrikesRock } from '../src/renderer/src/sim/tactical/rockWeapons';
import { LASER_ROCK_DAMAGE } from '../src/renderer/src/sim/tactical/rockTuning';
import { cloneTactical, createTacticalState, missileOf, placeMissile, Room, type DuelEvent, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { AIM_STEPS, HEADING_COUNT, LASER_ARC_STEPS, LASER_BURST_GAP_TICKS, LASER_CHARGE_UNITS, LASER_HULL, LASER_RANGE, PLANET_RADIUS, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { mover } from './helpers/rockArena';

/** The first pool slot past the seeded asteroids, where open() writes its rocks. */
const ROCK0 = 100;
type LaserEvent = Extract<DuelEvent, { kind: 'laser' }>;
/** A MANUAL crew at (0, crewY) nose north and still, full; no rocks but the ones given (resting moving rocks from slot
 *  ROCK0 on); the Hunter far off and still; a fresh tick's rock masks; no events. */
function open(rocks: { x: number; y: number; r: number }[] = [], crewY = 1500): TacticalState {
  const st = createTacticalState(5);
  st.rocks.fill(0);   // every seeded rock gone (the seeded grid ignores empty slots)
  rocks.forEach((a, k) => mover(st, ROCK0 + k, a.x, a.y, 0, 0, a.r));
  beginRockTick(st);
  Object.assign(st.ships[0], { x: 0, y: crewY, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(st.ships[1], { x: 2000, y: 2000, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  st.systems[0].laserManual = true;
  st.systems[0].freq = (st.weakFreq + 1) % 3;   // off the weak frequency: one layer a hit (as tests/helpers/hostile.ts does)
  st.events = [];
  return st;
}
const fire = (aim: number) => ({ ...IDLE_INPUT, laserFire: aim });
const beams = (st: TacticalState): LaserEvent[] => st.events.filter((e): e is LaserEvent => e.kind === 'laser');
const NORTH = 0;

describe('a MANUAL shot (spec §2)', () => {
  it('fires along the aim clamped into ±60°, to the laser range; spends the charge; queues the burst with its aim', () => {
    const st = open();
    applyWeaponsInput(st, 0, fire(64 * HEADING_COUNT));   // 90° right of the nose: the cone's clockwise edge
    const [ux, uy] = aimDir(LASER_ARC_STEPS), b = beams(st);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ ship: 0, hit: false, stripped: false, room: -1, x1: 0, y1: 1500 });
    expect(b[0]!.x2).toBeCloseTo(ux * LASER_RANGE, 6); expect(b[0]!.y2).toBeCloseTo(1500 + uy * LASER_RANGE, 6);
    expect([st.systems[0].shots, st.systems[0].laserCharge, st.systems[0].laserBurst, st.systems[0].laserAim]).toEqual([1, 0, 1, LASER_ARC_STEPS]);
  });
  it('strikes the room under its hit point: the stern Engines, the nose Weapons, a flank Shields', () => {
    for (const [heading, room] of [[0, Room.Engines], [128, Room.Weapons], [64, Room.Shields]] as const) {
      const st = open();
      Object.assign(st.ships[1], { x: 0, y: 1300, heading });
      st.systems[1].shields = 0;
      const hull = st.systems[1].hull;
      applyWeaponsInput(st, 0, fire(NORTH));
      expect(st.systems[1].rooms[room], `heading ${heading}`).toBe(1);
      expect(st.systems[1].hull).toBe(hull - LASER_HULL);
      expect(beams(st)[0]).toMatchObject({ hit: true, stripped: false, room, x2: expect.closeTo(0, 6), y2: expect.closeTo(1300 + SHIP_RADIUS, 6) });
      expect(st.systems[0].laserHits).toBe(1);
    }
  });
  it('a shield layer up takes the hit (two on the weak frequency), with no room or hull', () => {
    for (const weak of [false, true]) {
      const st = open();
      Object.assign(st.ships[1], { x: 0, y: 1300 });
      if (weak) st.systems[0].freq = st.weakFreq;
      const hull = st.systems[1].hull;
      applyWeaponsInput(st, 0, fire(NORTH));
      expect([st.systems[1].shields, st.systems[1].hull, st.systems[1].rooms, st.systems[0].layersStripped]).toEqual([weak ? 0 : 1, hull, [0, 0, 0], weak ? 2 : 1]);
      expect(beams(st)[0]).toMatchObject({ hit: true, stripped: true, room: -1 });
    }
  });
});

describe('what stops the beam (spec §2, §5)', () => {
  it('the first rock stops it before the ship behind, and takes exactly what the AUTO laser does to a rock', () => {
    const st = open([{ x: 0, y: 1400, r: 40 }]);
    Object.assign(st.ships[1], { x: 0, y: 1300 });
    const twin = cloneTactical(st), shields = st.systems[1].shields, hull = st.systems[1].hull;
    applyWeaponsInput(st, 0, fire(NORTH));
    const b = beams(st)[0]!;
    expect(b).toMatchObject({ hit: false, stripped: false, room: -1, rock: ROCK0, x2: expect.closeTo(0, 6), y2: expect.closeTo(1440, 6) });
    expect([st.systems[1].shields, st.systems[1].hull]).toEqual([shields, hull]);
    laserStrikesRock(twin, 0, ROCK0, b.x2, b.y2);   // master's laser on this rock at this point
    expect(Array.from(st.rocks)).toEqual(Array.from(twin.rocks));
    expect(st.rockHits).toBe(twin.rockHits);
    expect(st.events.filter((e) => e.kind === 'rock')).toEqual(twin.events.filter((e) => e.kind === 'rock'));
    expect(rockAt(st, ROCK0).hp).toBe(rockHp(40) - LASER_ROCK_DAMAGE);
    expect(rockAt(st, ROCK0).vy).toBeLessThan(0);   // pushed along the beam
  });
  it('the planet stops it with no effect', () => {
    const st = open([], 300);
    Object.assign(st.ships[1], { x: 0, y: -100 });   // beyond the planet, within the beam's reach
    const shields = st.systems[1].shields, hull = st.systems[1].hull;
    applyWeaponsInput(st, 0, fire(NORTH));
    expect(beams(st)[0]).toMatchObject({ hit: false, stripped: false, room: -1, x2: expect.closeTo(0, 6), y2: expect.closeTo(PLANET_RADIUS, 6) });
    expect(beams(st)[0]!.rock).toBeUndefined();
    expect([st.systems[1].shields, st.systems[1].hull, st.rockHits]).toEqual([shields, hull, 0]);
  });
  it('a torpedo in its path is not hit: the beam passes through to the ship', () => {
    const st = open();
    Object.assign(st.ships[1], { x: 0, y: 1300 });
    placeMissile(st, 1, { x: 0, y: 1400, vx: 0, vy: 0, heading: 128, headingAcc: 0, age: 30 });
    const shields = st.systems[1].shields;
    applyWeaponsInput(st, 0, fire(NORTH));
    expect(missileOf(st, 1)).not.toBeNull();
    expect(st.events.some((e) => e.kind === 'missileEnd')).toBe(false);
    expect(st.systems[1].shields).toBe(shields - 1);
  });
});

describe('the double laser\'s burst (spec §2)', () => {
  it('the second shot keeps the burst\'s aim, re-clamped about the heading and re-checked at its own tick', () => {
    const st = open();
    Object.assign(st.ships[1], { x: 0, y: 1300 });
    applyWeaponsInput(st, 0, fire(NORTH));
    expect([st.systems[0].shots, st.systems[1].shields, st.systems[0].laserAim]).toEqual([1, 1, NORTH]);
    Object.assign(st.ships[1], { x: 300 });   // the enemy leaves the line before the second shot
    st.ships[0].heading = 64;                 // and the crew turns east: north is now outside its cone
    for (let k = 1; k < LASER_BURST_GAP_TICKS; k++) applyWeaponsInput(st, 0, IDLE_INPUT);
    expect(st.systems[0].shots).toBe(1);
    applyWeaponsInput(st, 0, IDLE_INPUT);
    expect([st.systems[0].shots, st.systems[0].laserBurst, st.systems[0].laserAim, st.systems[1].shields]).toEqual([2, 0, -1, 1]);
    const last = beams(st).at(-1)!, [ux, uy] = aimDir(clampAim(64, NORTH, LASER_ARC_STEPS));
    expect(last).toMatchObject({ hit: false, x1: 0, y1: 1500 });
    expect(last.x2).toBeCloseTo(ux * LASER_RANGE, 6); expect(last.y2).toBeCloseTo(1500 + uy * LASER_RANGE, 6);
  });
});

describe('when it does not fire (spec §2)', () => {
  it('not while its own torpedo flies, nor without a full charge, with a burst pending, offline, or with a bad aim', () => {
    const flying = open();
    placeMissile(flying, 0, { x: 500, y: 500, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 });
    applyWeaponsInput(flying, 0, fire(NORTH));
    expect([flying.systems[0].shots, flying.systems[0].laserCharge]).toEqual([0, LASER_CHARGE_UNITS]);
    const empty = open(); empty.systems[0].laserCharge = 0;
    applyWeaponsInput(empty, 0, fire(NORTH));
    expect(empty.systems[0].shots).toBe(0);
    const pending = open();
    Object.assign(pending.systems[0], { laserBurst: 1, laserBurstClock: 5, laserAim: NORTH });
    applyWeaponsInput(pending, 0, fire(NORTH));
    expect([pending.systems[0].shots, pending.systems[0].laserBurstClock]).toEqual([0, 4]);
    const offline = open(); offline.systems[0].rooms[Room.Weapons] = 2;
    applyWeaponsInput(offline, 0, fire(NORTH));
    expect([offline.systems[0].shots, offline.systems[0].laserCharge]).toEqual([0, 0]);
    for (const aim of [AIM_STEPS, 0.5]) { const st = open(); applyWeaponsInput(st, 0, fire(aim)); expect(st.systems[0].shots, `aim ${aim}`).toBe(0); }
  });
  it('in AUTO a laserFire input does nothing', () => {
    const st = open();
    st.systems[0].laserManual = false;   // the enemy is far off: no auto-fire either
    applyWeaponsInput(st, 0, fire(NORTH));
    expect(st.systems[0].shots).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/manualLaserBeam.test.ts`
Expected: FAIL (no laser event: `applyWeaponsInput` ignores `laserFire`).

- [ ] **Step 3: The imports and the header**

In `src/renderer/src/sim/tactical/weapons.ts`:

(a) Lines 1-2 (the header comment) become:

```ts
// Laser, shields and the magazine (spec §5, §7a, the §7 weapons state transitions table), on each ship's systems record
// and its class's weapon definitions. A ship's laser fires at its locked target (engine refactor spec §5). W-2 (pew pew spec
// §2): the crew's laser in MANUAL fires only on laserFire, as an instant beam along its aim (shootAlong).
```

(b) The imports become (the `AUTO_DIG`, `rockWeapons`, `direction`, `gun` and `state` lines are unchanged and stay where they are):

```ts
import { inArc, lineOfSight, roomAtImpact } from './geometry';
import { launchMissile } from './missiles';
import { firstBlocker, rockAlive, rockAt, rockSlots, segmentEntry } from './rocks';
```

```ts
import { aimDir, clampAim, firePew, tickPew } from './pew';
```

and after the `state` import add:

```ts
import { AIM_STEPS, LASER_ARC_STEPS } from './tuning';
```

- [ ] **Step 4: The shared strike, and the AUTO shot calling it unchanged**

Replace the whole `shoot` function with:

```ts
/** One laser shot of ship i landing on ship j (spec §7a), the hit counted: with a shield layer up it strips one (the crew
 *  laser on the weak frequency two, Sci-1 spec §4.4), else it raises Room `room` one level (capped at 2) and costs the
 *  laser's hull. W-2 (pew pew spec §2): shared by the AUTO shot (its lock room) and the MANUAL beam (the room under its hit
 *  point); returns whether it stripped and the Room struck (−1 on a strip). */
function laserStrike(state: TacticalState, i: number, j: number, room: number): { stripped: boolean; room: number } {
  const as = state.systems[i]!, bs = state.systems[j]!, laser = classOf(state, i).slots.laser!;
  as.laserHits++;
  if (bs.shields > 0) {   // Sci-1 spec §4.4: the crew laser tuned to the weak frequency strips 2 layers (as many as are up)
    const n = i === CREW_SLOT && as.freq === state.weakFreq ? Math.min(2, bs.shields) : 1;
    bs.shields -= n; bs.shieldClock = 0; bs.gunWear = 0; as.layersStripped += n;   // Valkyrn spec §7.2: any strip zeroes the gun wear
    return { stripped: true, room: -1 };
  }
  if (bs.rooms[room]! < 2) bs.rooms[room as 0 | 1 | 2]++;
  bs.hull = Math.max(0, bs.hull - laser.hull);
  return { stripped: false, room };
}

/** One laser shot of ship i at its target and lock room as they stand now (spec §7a; weapons update spec §1: every shot of a
 *  burst re-checks eligibility, strips shields or strikes the room, counts and pushes its own `laser` event). */
function shoot(state: TacticalState, i: number): void {
  const laser = classOf(state, i).slots.laser;
  if (!laser) return;
  if (state.systems[i]!.laserRock >= 0) { shootRock(state, i); return; }   // spike ii §6.2: a rock target
  const a = state.ships[i]!, as = state.systems[i]!, j = as.target, b = state.ships[j] ?? a, bs = state.systems[j], hit = laserEligible(state, i, j);
  let stripped = false, room = -1;
  as.shots++;
  if (hit && bs) ({ stripped, room } = laserStrike(state, i, j, as.lock));   // W-2: the strike the MANUAL beam shares, unchanged
  if (!hit) {   // spike i, kept (spec §6.3): a blocked or aimless shot strikes the first rock on its line instead
    const r = laserRockTarget(state, i);
    if (r) {
      state.events.push({ kind: 'laser', ship: i, hit: false, stripped: false, room: -1, x1: a.x, y1: a.y, x2: r.x, y2: r.y, rock: r.rock });
      laserStrikesRock(state, i, r.rock, r.x, r.y);
      return;
    }
  }
  state.events.push({ kind: 'laser', ship: i, hit, stripped, room, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
}

/** W-2 (pew pew spec §2): one MANUAL laser shot of ship i along fine aim `aim`, clamped into the laser's ±60° about its
 *  heading now: an instant beam from its centre to the laser's range. The first solid body (firstBlocker: the planet, or a
 *  rock; a piece born this tick is not in the way) stops it, unless another active ship's circle is entered strictly
 *  before it; a torpedo is never in the way. On ship j it strikes the room under the entry point (roomAtImpact, as a
 *  torpedo's self-hit) through laserStrike; on a rock it does what the AUTO laser does (laserStrikesRock: a push, then the
 *  damage); on the planet, or with nothing met, it only ends. Counts a shot and pushes its `laser` event (x2, y2 where it
 *  ended). */
function shootAlong(state: TacticalState, i: number, aim: number): void {
  const laser = classOf(state, i).slots.laser;
  if (!laser) return;
  const a = state.ships[i]!, as = state.systems[i]!, [ux, uy] = aimDir(clampAim(a.heading, aim, LASER_ARC_STEPS));
  const ex = a.x + ux * laser.range, ey = a.y + uy * laser.range, f = firstBlocker(state, a.x, a.y, ex, ey);
  let best = f ? f.t : 2, j = -1;   // entry parameters are at most 1
  for (let k = 0; k < state.ships.length; k++) {
    const b = state.ships[k]!;
    if (!b.active || k === i) continue;
    const t = segmentEntry(a.x, a.y, ex, ey, b.x, b.y, classOf(state, k).radius);
    if (t >= 0 && t < best) { best = t; j = k; }
  }
  as.shots++;
  const t = best <= 1 ? best : 1, x = a.x + (ex - a.x) * t, y = a.y + (ey - a.y) * t;
  if (j >= 0) {
    const { stripped, room } = laserStrike(state, i, j, roomAtImpact(state.ships[j]!, x, y));
    state.events.push({ kind: 'laser', ship: i, hit: true, stripped, room, x1: a.x, y1: a.y, x2: x, y2: y });
    return;
  }
  if (f && f.rock >= 0) {
    state.events.push({ kind: 'laser', ship: i, hit: false, stripped: false, room: -1, x1: a.x, y1: a.y, x2: x, y2: y, rock: f.rock });
    laserStrikesRock(state, i, f.rock, x, y);
    return;
  }
  state.events.push({ kind: 'laser', ship: i, hit: false, stripped: false, room: -1, x1: a.x, y1: a.y, x2: x, y2: y });
}
```

- [ ] **Step 5: The MANUAL release, the burst and the offline clear**

(a) After the `fireLaser` function, insert:

```ts
/** W-2 (pew pew spec §2): a full charge's MANUAL release along fine aim `aim` (an integer 0..AIM_STEPS − 1, else nothing):
 *  the first shot now along the aim clamped about the heading, the rest of the class's burst queued a burst gap apart,
 *  each to fire along that same clamped aim (laserAim). */
function fireLaserAlong(state: TacticalState, i: number, aim: number): void {
  const as = state.systems[i]!, laser = classOf(state, i).slots.laser;
  if (!laser || !Number.isInteger(aim) || aim < 0 || aim >= AIM_STEPS) return;
  const clamped = clampAim(state.ships[i]!.heading, aim, LASER_ARC_STEPS);
  shootAlong(state, i, clamped);
  as.laserCharge = 0; as.laserHold = 0;
  as.laserBurst = laser.shots - 1; as.laserBurstClock = as.laserBurst > 0 ? laser.burstGapTicks : 0;
  as.laserAim = as.laserBurst > 0 ? clamped : -1;
}
```

(b) Replace the whole `stepBurst` function with:

```ts
/** Weapons update spec §1: a pending burst shot fires a burst gap after the one before, attended or not, whatever flies;
 *  only Weapons at damage level 2 drops it. W-2 (pew pew spec §2): a MANUAL burst's shots (laserAim ≥ 0) fire along the
 *  aim the burst was fired with, from where the ship is and re-clamped about its heading at their own tick, whatever the
 *  mode is now; the aim clears with the burst's last shot. */
function stepBurst(state: TacticalState, i: number): void {
  const s = state.systems[i]!;
  if (s.laserBurst === 0) return;
  if (laserOffline(state, i)) { s.laserBurst = 0; s.laserBurstClock = 0; s.laserAim = -1; return; }
  if (--s.laserBurstClock > 0) return;
  if (s.laserAim >= 0) shootAlong(state, i, s.laserAim); else shoot(state, i);
  s.laserBurst--; s.laserBurstClock = s.laserBurst > 0 ? classOf(state, i).slots.laser?.burstGapTicks ?? 0 : 0;
  if (s.laserBurst === 0) s.laserAim = -1;
}
```

(c) In `applyWeaponsInput`, after the auto-fire line (the one starting `  if (armed && crew && !s.laserManual && s.laserTargeted`), insert:

```ts
  // W-2 (pew pew spec §2): the MANUAL laser fires only on laserFire, along its aim, with a full charge, no burst pending,
  // Weapons online and no torpedo of its own in flight (laserFrozen).
  if (armed && crew && s.laserManual && input.laserFire >= 0 && manualLaserReady(state, i) && !laserFrozen(state, i, input)) fireLaserAlong(state, i, input.laserFire);
```

(d) In `tickWeapons`, the line

```ts
  if (laserOffline(state, i)) { s.laserCharge = 0; s.laserHold = 0; s.laserBurst = 0; s.laserBurstClock = 0; }   // off: every tick, frozen or not
```

becomes:

```ts
  if (laserOffline(state, i)) { s.laserCharge = 0; s.laserHold = 0; s.laserBurst = 0; s.laserBurstClock = 0; s.laserAim = -1; }   // off: every tick, frozen or not (W-2: a MANUAL burst's aim with it)
```

- [ ] **Step 6: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/manualLaserBeam.test.ts tests/manualLaserMode.test.ts tests/ftlTargeting.test.ts tests/tacticalWeapons.test.ts tests/weapons.test.ts tests/weaponsUpdate.test.ts tests/roomTargeting.test.ts tests/rockLaser.test.ts tests/rockLock.test.ts tests/semanticWeapons.test.ts tests/duelWeaponsView.test.ts tests/feelPresentation.test.ts tests/determinismGuard.test.ts tests/duelScripted.test.ts tests/duelCheckpoint.test.ts`
Expected: PASS (the AUTO laser tests unchanged: spec §5 "AUTO behaviour is unchanged, checked by the existing laser tests").

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/weapons.ts tests/manualLaserBeam.test.ts
git commit -m "feat(w2): the MANUAL laser beam along the aim (rocks struck as the AUTO laser strikes them, the planet stops it, torpedoes pass, the room under the hit point); bursts keep their aim" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The `laserMode` and `laserFire` commands: contract, wire, authority and admission

**Files:**
- Modify: `src/renderer/src/net/contracts.ts` (`DuelCommand`), `src/renderer/src/net/codec.ts` (`duelWire`), `src/renderer/src/sim/duel/step.ts` (imports, `WEAPON_ORDER`, `DUEL_KINDS`, the weapon admission loop), `src/renderer/src/sim/tactical/hash.ts` (`shipModule.commands`)
- Create: `tests/manualLaserCommands.test.ts`
- Modify (tests): `tests/duelModules.test.ts:152`, `tests/duelCheckpoint.test.ts:149`, `tests/ftlTargeting.test.ts:169`

**Interfaces:**
- Consumes: Task 2's `laserManual`, `ShipInput.laserFire`, `manualLaserReady`; `pew.ts` `validAim`.
- Produces:
  ```ts
  // net/contracts.ts DuelCommand gains
  | { kind: 'laserMode'; manual: boolean }
  | { kind: 'laserFire'; aim: number; aimAcc: number }
  // sim/duel/step.ts
  // WEAPON_ORDER = ['laserMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire']
  // laserMode: stale-tick, not-at-weapons, unavailable (no laser), malformed, noop (unchanged), else sets systems[0].laserManual
  // laserFire: stale-tick, not-at-weapons, unavailable (no laser), malformed (aim), unavailable (AUTO), noop (a second this
  //            tick), missile-in-flight, unavailable (not manualLaserReady: NO CHARGE)
  // laserCharge in MANUAL: unavailable
  // hash.ts shipModule.commands = ['laserMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire']
  ```
  `authority/duelRules.ts` needs no edit: it decodes through `duelCodec` and steps through `stepDuelTick`.

- [ ] **Step 1: Write the failing test**

Create `tests/manualLaserCommands.test.ts`:

```ts
// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §4, §5): laserMode and laserFire on the wire and through the
// duel step. The codec round-trips both; the step admits them from the Weapons attendant only. laserMode sets the crew
// laser's mode (noop when unchanged). laserFire fires in MANUAL with a valid aim and a full charge (else unavailable: NO
// CHARGE), at most once a tick, never with the own torpedo flying. In AUTO laserFire is unavailable, and in MANUAL
// laserCharge is. laserMode takes effect before a same-tick laserFire.
import { describe, expect, it } from 'vitest';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { placeMissile } from '../src/renderer/src/sim/tactical/state';
import { CUTTER } from './helpers/scriptedDuel';
import { createSeatedValkyrn } from './helpers/valkyrnDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, { held: Array.from({ length: d.interior.playerCount }, () => NONE), commands });
const why = (r: ReturnType<typeof step>) => r.map((x) => x.reason ?? x.status);
/** A Cutter duel with player 0 standing and player 1 at Weapons. */
function gunnerAtWeapons(): DuelState { const d = createDuel(CUTTER, 5); sitDown(d.interior, 1, d.weapons); return d; }
const mode = (manual: boolean): DuelCommand => ({ kind: 'laserMode', manual });
const fire = (aim: number, aimAcc = 0): DuelCommand => ({ kind: 'laserFire', aim, aimAcc });

describe('laserMode and laserFire on the wire (spec §4)', () => {
  it('round-trip through the duel codec; a wrong type, a missing or an extra field does not pass', () => {
    const codec = duelCodec(2), env = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 1, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const good of [env({ kind: 'laserMode', manual: true }), env({ kind: 'laserMode', manual: false }), env({ kind: 'laserFire', aim: 12, aimAcc: 200 })]) expect(codec.decodeMessage(codec.encodeMessage(good))).toEqual(good);
    for (const bad of [{ kind: 'laserMode', manual: 1 }, { kind: 'laserMode' }, { kind: 'laserMode', manual: true, extra: 1 }, { kind: 'laserFire', aim: 1.5, aimAcc: 0 }, { kind: 'laserFire', aim: 3 }, { kind: 'laserFire', aim: 3, aimAcc: 0, extra: 1 }])
      expect(() => codec.encodeMessage(env(bad))).toThrow();
  });
});

describe('laserMode through the duel step (spec §2)', () => {
  it('the gunner sets it; the same value again is noop', () => {
    const d = gunnerAtWeapons();
    try {
      expect(d.tactical.systems[0].laserManual).toBe(false);
      expect(why(step(d, [cmd(d, 1, mode(true))]))).toEqual(['applied']);
      expect(d.tactical.systems[0].laserManual).toBe(true);
      expect(why(step(d, [cmd(d, 1, mode(true))]))).toEqual(['noop']);
      expect(why(step(d, [cmd(d, 1, mode(false))]))).toEqual(['applied']);
      expect(d.tactical.systems[0].laserManual).toBe(false);
    } finally { disposeDuel(d); }
  });
  it('rejects a stale tick, a sender away from Weapons and a malformed value; a class without a laser answers unavailable', () => {
    const d = gunnerAtWeapons();
    try {
      const r = step(d, [cmd(d, 1, mode(true), d.interior.tick + 1), cmd(d, 0, mode(true)), cmd(d, 1, { kind: 'laserMode', manual: 1 } as unknown as DuelCommand)]);
      expect(why(r)).toEqual(['not-at-weapons', 'stale-tick', 'malformed']);   // sorted by player, then sequence
      expect(d.tactical.systems[0].laserManual).toBe(false);
    } finally { disposeDuel(d); }
    const v = createSeatedValkyrn(5);
    try {
      expect(why(step(v, [cmd(v, 0, mode(true)), cmd(v, 0, fire(0))]))).toEqual(['unavailable', 'unavailable']);
      expect(v.tactical.systems[0].laserManual).toBe(false);
    } finally { disposeDuel(v); }
  });
});

describe('laserFire through the duel step (spec §2, §4)', () => {
  it('in MANUAL the gunner\'s shot is applied and fires; a second in the tick is noop', () => {
    const d = gunnerAtWeapons();
    try {
      d.tactical.systems[0].laserManual = true;
      expect(why(step(d, [cmd(d, 1, fire(d.tactical.ships[0].heading)), cmd(d, 1, fire(3, 9))]))).toEqual(['applied', 'noop']);
      expect([d.tactical.systems[0].shots, d.tactical.systems[0].laserCharge]).toEqual([1, 0]);
    } finally { disposeDuel(d); }
  });
  it('rejects a stale tick, a sender away from Weapons and a malformed aim', () => {
    const d = gunnerAtWeapons();
    try {
      d.tactical.systems[0].laserManual = true;
      const r = step(d, [cmd(d, 1, fire(0), d.interior.tick + 1), cmd(d, 0, fire(0)), cmd(d, 1, fire(256)), cmd(d, 1, fire(-1)), cmd(d, 1, fire(0, 256)), cmd(d, 1, fire(0, -1))]);
      expect(why(r)).toEqual(['not-at-weapons', 'stale-tick', 'malformed', 'malformed', 'malformed', 'malformed']);
      expect(d.tactical.systems[0].shots).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('in AUTO it is unavailable and fires nothing; in MANUAL laserCharge is unavailable and fires nothing', () => {
    const d = gunnerAtWeapons();
    try {
      expect(why(step(d, [cmd(d, 1, fire(0))]))).toEqual(['unavailable']);
      d.tactical.systems[0].laserManual = true;
      expect(why(step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })]))).toEqual(['unavailable']);
      expect(d.tactical.systems[0].shots).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('with its torpedo flying it is missile-in-flight; without a full charge it is unavailable (NO CHARGE)', () => {
    const d = gunnerAtWeapons();
    try {
      d.tactical.systems[0].laserManual = true;
      d.tactical.systems[0].laserCharge = 0;
      expect(why(step(d, [cmd(d, 1, fire(0))]))).toEqual(['unavailable']);
      const s = d.tactical.ships[0];
      placeMissile(d.tactical, 0, { x: s.x + 600, y: s.y, vx: 0, vy: 0, heading: 64, headingAcc: 0, age: 30 });
      expect(why(step(d, [cmd(d, 1, fire(0))]))).toEqual(['missile-in-flight']);
      expect(d.tactical.systems[0].shots).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('laserMode takes effect before a laserFire in the same tick, whatever their envelope order', () => {
    const d = gunnerAtWeapons();
    try {
      expect(why(step(d, [cmd(d, 1, fire(d.tactical.ships[0].heading)), cmd(d, 1, mode(true))]))).toEqual(['applied', 'applied']);
      expect([d.tactical.systems[0].laserManual, d.tactical.systems[0].shots]).toEqual([true, 1]);
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/manualLaserCommands.test.ts`
Expected: FAIL (the codec refuses the unknown kinds; the step answers `not-in-duel`).

- [ ] **Step 3: The contract and the wire**

(a) `src/renderer/src/net/contracts.ts`, in `DuelCommand`, after the `| { kind: 'pewFire'; aim: number; aimAcc: number }` member insert:

```ts
  /** W-2 (pew pew spec §2, §4): Weapons sets the crew laser's mode: true MANUAL (it fires only on laserFire, along an aim),
   *  false AUTO (it fires at its target by itself, as before). */
  | { kind: 'laserMode'; manual: boolean }
  /** W-2: Weapons fires the MANUAL laser along heading index `aim` 0..255 plus `aimAcc` 0..255 256ths of a step (pewFire's
   *  aim), clamped into the laser's ±60° by the sim. Any integers pass the codec; the sim answers an out-of-range one malformed. */
  | { kind: 'laserFire'; aim: number; aimAcc: number }
```

(b) `src/renderer/src/net/codec.ts`, in `duelWire.commands`, after the `pewFire` line insert:

```ts
      z.object({ kind: z.literal('laserMode'), manual: z.boolean() }).strict(),   // W-2: the laser's AUTO / MANUAL mode
      z.object({ kind: z.literal('laserFire'), aim: z.number().int(), aimAcc: z.number().int() }).strict(),   // W-2: the MANUAL laser's aim
```

and the end of the `duelWire` doc comment `W-1 adds \`pewFire\`. */` becomes `W-1 adds \`pewFire\`; W-2 adds \`laserMode\` and \`laserFire\`. */`.

(c) `src/renderer/src/sim/tactical/hash.ts`, `shipModule.commands` becomes:

```ts
  commands: ['laserMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire'],
```

- [ ] **Step 4: Admission in the duel step**

In `src/renderer/src/sim/duel/step.ts`:

(a) The weapons import becomes:

```ts
import { canCharge, canLaunch, manualLaserReady, validRockLock, validTarget, type ShipInput } from '../tactical/weapons';
```

(b) The two declarations become:

```ts
/** The fixed order weapon commands take effect in within one tick (W-1: the pew last, as applyWeaponsInput fires it; W-2:
 *  the laser mode first, so the tick's commands are judged in it, and the MANUAL shot after the AUTO press). */
const WEAPON_ORDER = ['laserMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire'] as const;
/** Every duel command kind the step handles; any other kind is rejected not-in-duel. */
const DUEL_KINDS = ['sit', 'stand', 'presence', 'laserMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire', 'rematch', 'throttle', 'heading', 'contactScan', 'designate', 'laserFrequency'];
```

(c) The comment line above the loop that ends `W-1: pewFire last; only the first in a tick fires (the rest noop).` gains at its end: ` W-2: laserMode first, set at once (as laserFrequency is), so a same-tick laserCharge or laserFire is judged in the new mode; laserFire after laserCharge, the first in a tick fires.`

(d) Replace the weapon admission loop (from `  for (const e of WEAPON_ORDER.flatMap(` through its closing `  }` after `    result(e);`) with:

```ts
  for (const e of WEAPON_ORDER.flatMap((kind) => input.commands.filter((x) => x.command.kind === kind))) {
    const c = e.command, sys0 = d.tactical.systems[0];
    if (c.kind !== 'laserMode' && c.kind !== 'laserLock' && c.kind !== 'torpLock' && c.kind !== 'rockLock' && c.kind !== 'laserCharge' && c.kind !== 'laserFire' && c.kind !== 'missileLaunch' && c.kind !== 'pewFire') continue;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (gunner < 0 || e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }   // −1 is the empty-seat value, never a player
    if ((c.kind === 'laserMode' || c.kind === 'laserLock' || c.kind === 'laserCharge' || c.kind === 'laserFire' || (c.kind === 'rockLock' && c.weapon === 'laser')) && classOf(d.tactical, 0).slots.laser === null) { result(e, 'unavailable'); continue; }   // Valkyrn spec §6.1: no laser; W-2: nor its mode or MANUAL shot
    if (c.kind === 'pewFire' && classOf(d.tactical, 0).slots.pew === null) { result(e, 'unavailable'); continue; }   // W-1: no pew (the Valkyrn)
    if (c.kind === 'laserMode') {   // W-2 (pew pew spec §2): the mode, set now
      if (typeof c.manual !== 'boolean') { result(e, 'malformed'); continue; }
      if (c.manual === sys0.laserManual) { result(e, undefined, 'noop'); continue; }
      sys0.laserManual = c.manual;
    }
    else if (c.kind === 'laserLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } crew.laserLock = c.room; }   // −1 clears the target
    else if (c.kind === 'torpLock') { if (!validTarget(c.room)) { result(e, 'malformed'); continue; } crew.torpLock = c.room; torpLocked = true; }
    else if (c.kind === 'rockLock') {
      if (!validRockLock(d.tactical, c.weapon, c.rock)) { result(e, 'malformed'); continue; }
      if (c.rock >= 0 && !rockAlive(d.tactical, c.rock)) { result(e, undefined, 'noop'); continue; }
      if (c.weapon === 'laser') crew.rockLock.laser = c.rock; else { crew.rockLock.torpedo = c.rock; torpRockNext = c.rock; }
    }
    else if (c.kind === 'laserCharge') {
      if (sys0.laserManual) { result(e, 'unavailable'); continue; }   // W-2: in MANUAL Space is laserFire
      if (!canCharge(d.tactical, 0)) { result(e, 'missile-in-flight'); continue; }
      crew.laserCharge = c.held;
    }
    else if (c.kind === 'laserFire') {   // W-2 (pew pew spec §2, §4): the aim, the mode, one shot a tick, no torpedo flying, then a full charge (NO CHARGE)
      if (!validAim(c.aim, c.aimAcc)) { result(e, 'malformed'); continue; }
      if (!sys0.laserManual) { result(e, 'unavailable'); continue; }
      if (crew.laserFire >= 0) { result(e, undefined, 'noop'); continue; }
      if (!canCharge(d.tactical, 0)) { result(e, 'missile-in-flight'); continue; }
      if (!manualLaserReady(d.tactical, 0)) { result(e, 'unavailable'); continue; }
      crew.laserFire = c.aim * HEADING_COUNT + c.aimAcc;
    }
    else if (c.kind === 'missileLaunch') {
      const torpRock = torpRockNext ?? (torpLocked ? -1 : d.tactical.systems[0].torpRock);
      if (!canLaunch(d.tactical, 0, torpRock)) { result(e, 'unavailable'); continue; }
      crew.missileLaunch = true;
    }
    else {   // W-1 (pew pew spec §1, §4): the aim, then one round a tick (the first wins), then a third stored (NO CHARGE)
      if (!validAim(c.aim, c.aimAcc)) { result(e, 'malformed'); continue; }
      if (crew.pewAim >= 0) { result(e, undefined, 'noop'); continue; }
      if (!pewReady(d.tactical, 0)) { result(e, 'unavailable'); continue; }
      crew.pewAim = c.aim * HEADING_COUNT + c.aimAcc;
    }
    result(e);
  }
```

- [ ] **Step 5: The tests that list the kinds**

(a) `tests/duelModules.test.ts` line 152 becomes:

```ts
    expect(kinds).toEqual(['contactScan', 'designate', 'heading', 'laserCharge', 'laserFire', 'laserFrequency', 'laserLock', 'laserMode', 'missileLaunch', 'pewFire', 'presence', 'rematch', 'rockLock', 'sit', 'stand', 'throttle', 'torpLock']);
```

(b) `tests/duelCheckpoint.test.ts` line 149: inside the `examples` braces, after `pewFire: { kind: 'pewFire', aim: 12, aimAcc: 34 }` add `, laserMode: { kind: 'laserMode', manual: true }, laserFire: { kind: 'laserFire', aim: 56, aimAcc: 78 }`.

(c) `tests/ftlTargeting.test.ts` line 169 becomes:

```ts
    expect(shipModule.commands).toEqual(['laserMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire']);   // W-1: the pew last; W-2: the laser mode first, its MANUAL shot after the charge
```

(d) `tests/rockLock.test.ts` line 90 (the line `    expect(shipModule.commands).toEqual(['laserLock', 'torpLock', 'rockLock', 'laserCharge', 'missileLaunch', 'pewFire']);`) becomes:

```ts
    expect(shipModule.commands).toEqual(['laserMode', 'laserLock', 'torpLock', 'rockLock', 'laserCharge', 'laserFire', 'missileLaunch', 'pewFire']);   // W-1 merge: the pew last; W-2: the laser mode first
```

- [ ] **Step 6: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/manualLaserCommands.test.ts tests/pewCommands.test.ts tests/ftlTargeting.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts tests/netCodec.test.ts tests/codecModeWire.test.ts tests/commandUnion.test.ts tests/scienceCommands.test.ts tests/valkyrnCrew.test.ts tests/duelThrottle.test.ts tests/feelHeading.test.ts tests/rockLock.test.ts tests/duelScripted.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/tactical/hash.ts tests/manualLaserCommands.test.ts tests/duelModules.test.ts tests/duelCheckpoint.test.ts tests/ftlTargeting.test.ts tests/rockLock.test.ts
git commit -m "feat(w2): laserMode {manual} and laserFire {aim, aimAcc} on the wire and through the duel step (mode first in WEAPON_ORDER, one MANUAL shot a tick, NO CHARGE unavailable)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The aim on the map: the scene tracks the laser's aim, the dashed MANUAL aim line, the online gap room

**Files:**
- Modify: `src/renderer/src/app/duel/mapRequests.ts`, `src/renderer/src/app/duel/scene.ts` (the epoch reset, after the click block, the model input), `src/renderer/src/render/tactical/weaponsModel.ts` (imports, `CombatDraw`, `CombatModelInput`, after the pew block, the return), `src/renderer/src/render/tactical/tacticalLayer.ts` (after the pew aim line), `src/renderer/src/app/duel/onlineSource.ts` (`gapEvents`)
- Create: `tests/manualLaserViews.test.ts`, `tests/manualLaserScene.test.ts`

**Interfaces:**
- Consumes: Task 2's `laserManual`, `manualLaserReady`, `LASER_ARC_STEPS`; `pew.ts` `clampAim`; W-1's `onWeaponsMap`, `fineHeadingOf`.
- Produces:
  ```ts
  // app/duel/mapRequests.ts, MapRequests gains
  aimLaser(aim: number): void;     // the latest fine aim from the open Weapons map
  laserAim(): number | null;       // peek, not drained; null before any
  resetLaserAim(): void;           // a new round
  // render/tactical/weaponsModel.ts
  // CombatModelInput.laserAim?: number | null    (a fine heading; null or absent: along the nose)
  // CombatDraw.laserAim?: Segment | null         (MANUAL, charged, Space would fire: drawn dashed CRT.main)
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/manualLaserViews.test.ts`:

```ts
// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §5): the views. The Weapons map shows the MANUAL laser's aim
// line while Space would fire, from the own ship along the aim clamped into ±60° to the laser's reach (along the nose
// with no aim yet); none in AUTO, on the Helm, uncharged or with the own torpedo flying. Online, a MANUAL hit's gap event
// names the enemy room whose level rose.
import { describe, expect, it } from 'vitest';
import { duelCounters, gapEvents } from '../src/renderer/src/app/duel/onlineSource';
import { createCamera, worldToScreen, type Camera } from '../src/renderer/src/render/tactical/camera';
import { createFx } from '../src/renderer/src/render/tactical/fxModel';
import type { PrevBody } from '../src/renderer/src/render/tactical/tacticalModel';
import { combatModel, type CombatModelInput } from '../src/renderer/src/render/tactical/weaponsModel';
import { createTacticalState, placeMissile, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { AIM_STEPS, HEADING_COUNT, LASER_ARC_STEPS, LASER_CHARGE_UNITS, LASER_RANGE } from '../src/renderer/src/sim/tactical/tuning';

const vp = { w: 1280, h: 720 };
const prevOf = (st: TacticalState): PrevBody[] => st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
function input(st: TacticalState, cam: Camera, console: 'helm' | 'weapons', laserAim: number | null): CombatModelInput {
  return { state: st, prev: prevOf(st), alpha: 1, camera: cam, viewport: vp, console, axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: 236, missilePrev: [null, null], fx: createFx(), laserAim };
}
function northFacing(): TacticalState {
  const st = createTacticalState(5);
  Object.assign(st.ships[0], { heading: 0, headingAcc: 0, vx: 0, vy: 0 });
  return st;
}

describe('the MANUAL laser\'s aim line (spec §2)', () => {
  it('runs from the own marker along the aim clamped into ±60°, to the laser reach; along the nose with no aim', () => {
    const st = northFacing(), cam = createCamera(st.ships[0].x, st.ships[0].y, 0.5), own = worldToScreen(cam, vp, st.ships[0].x, st.ships[0].y);
    expect(combatModel(input(st, cam, 'weapons', 64 * HEADING_COUNT)).laserAim ?? null).toBeNull();   // AUTO: none
    st.systems[0].laserManual = true;
    const east = combatModel(input(st, cam, 'weapons', 64 * HEADING_COUNT)).laserAim!, a = (LASER_ARC_STEPS / AIM_STEPS) * 2 * Math.PI;
    expect([east.x1, east.y1]).toEqual([own.x, own.y]);
    expect(east.x2).toBeCloseTo(own.x + Math.sin(a) * LASER_RANGE * 0.5, 6); expect(east.y2).toBeCloseTo(own.y - Math.cos(a) * LASER_RANGE * 0.5, 6);
    const nose = combatModel(input(st, cam, 'weapons', null)).laserAim!;
    expect(nose.x2).toBeCloseTo(own.x, 6); expect(nose.y2).toBeCloseTo(own.y - LASER_RANGE * 0.5, 6);
  });
  it('shows only at Weapons while Space would fire: not on the Helm, uncharged, with a burst pending or the own torpedo flying', () => {
    const st = northFacing(), cam = createCamera(st.ships[0].x, st.ships[0].y, 1);
    st.systems[0].laserManual = true;
    expect(combatModel(input(st, cam, 'helm', 0)).laserAim ?? null).toBeNull();
    st.systems[0].laserCharge = LASER_CHARGE_UNITS - 1;
    expect(combatModel(input(st, cam, 'weapons', 0)).laserAim ?? null).toBeNull();
    st.systems[0].laserCharge = LASER_CHARGE_UNITS; st.systems[0].laserBurst = 1;
    expect(combatModel(input(st, cam, 'weapons', 0)).laserAim ?? null).toBeNull();
    st.systems[0].laserBurst = 0;
    placeMissile(st, 0, { x: st.ships[0].x + 500, y: st.ships[0].y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 });
    expect(combatModel(input(st, cam, 'weapons', 0)).laserAim ?? null).toBeNull();
  });
});

describe('the online view (spec §2)', () => {
  it('a MANUAL hit\'s gap event names the room whose level rose; an AUTO hit keeps the lock room', () => {
    for (const manual of [false, true]) {
      const st = createTacticalState(5);
      st.systems[0].laserManual = manual;
      st.systems[1].shields = 0;
      const before = [duelCounters(st, 0), duelCounters(st, 1)];
      st.systems[0].shots++; st.systems[0].laserHits++; st.systems[1].rooms[Room.Engines]++;
      const rooms = gapEvents(before, [null, null], st).flatMap((e) => (e.kind === 'laser' && e.ship === 0 ? [e.room] : []));
      expect(rooms, `manual ${manual}`).toEqual([manual ? Room.Engines : st.systems[0].lock]);
    }
  });
});
```

Create `tests/manualLaserScene.test.ts`:

```ts
// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §5): the scene keeps the laser's aim. While the pointer is
// on the open Weapons map, the aim is its fine bearing from the own ship's drawn marker; over a console block or with no
// pointer the last aim stands. The map requests keep the latest aim (peeked, not drained) until a new round.
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { interpolatedShip } from '../src/renderer/src/render/tactical/tacticalModel';
import { emptyPresses, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { seatDuelCrew } from './helpers/duelSeat';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { createMapRequests } from '../src/renderer/src/app/duel/mapRequests';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { STATION, stationTop } from '../src/renderer/src/render/duel/consoleLayout';

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

/** The real runtime, scene and tactical layer in node (as contactScene.test.ts), with a pointer the test moves. */
function rig() {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }, pointerAt: { x: number; y: number } | null = null;
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
  const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store), contact, requests, takeClick: () => null, pointer: () => pointerAt });
  seatDuelCrew(rt.duel);   // player 0 at the Helm, player 1 at Weapons; Tab takes the gunner
  press('switch'); tick(); tick();
  const point = (p: { x: number; y: number } | null): void => { pointerAt = p; scene.draw(rt, 1 / 60, LIVE); };
  const marker = () => { const b = interpolatedShip(rt.duel.tactical, rt.prev, rt.alpha(), 0); return worldToScreen(rt.cameras.weapons, vp, b.x, b.y); };
  return { rt, scene, requests, point, marker };
}

describe('the map requests (spec §2)', () => {
  it('keep the latest laser aim, peeked and not drained, until reset', () => {
    const r = createMapRequests();
    expect(r.laserAim()).toBeNull();
    r.aimLaser(100); r.aimLaser(200);
    expect([r.laserAim(), r.laserAim()]).toEqual([200, 200]);
    r.resetLaserAim();
    expect(r.laserAim()).toBeNull();
  });
});

describe('the scene keeps the laser\'s aim (spec §2)', () => {
  it('follows the pointer on the open Weapons map as a fine bearing from the own marker; off the map the last aim stands', () => {
    const r = rig();
    try {
      expect(r.rt.view()).toBe('weapons');
      r.point(null);   // a first frame: the sit framing settles
      expect(r.requests.laserAim()).toBeNull();
      const m = r.marker();
      r.point({ x: m.x + 100, y: m.y });
      expect(r.requests.laserAim()).toBe(16384);   // east: a quarter turn of 65536
      r.point({ x: STATION.x + 20, y: stationTop('weapons') + 10 });   // over the Weapons block: not the map
      expect(r.requests.laserAim()).toBe(16384);
      r.point(null);
      expect(r.requests.laserAim()).toBe(16384);
      r.point({ x: m.x, y: m.y - 100 });
      expect(r.requests.laserAim()).toBe(0);   // north
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run tests/manualLaserViews.test.ts tests/manualLaserScene.test.ts`
Expected: FAIL (`laserAim` is absent from the combat draw; `r.aimLaser is not a function`; the gap room is the lock room).

- [ ] **Step 3: The map requests**

In `src/renderer/src/app/duel/mapRequests.ts` (Edit; the file is CRLF):

(a) The header comment's last line `// the pew's fine aim (the latest). The scene turns the pointer into requests each frame; the runtime (Single player) or the online session drains them. Local to one screen.` becomes:

```ts
// the pew's fine aim (the latest). W-2 (pew pew spec §2): the laser's aim, the pointer's latest fine bearing on the open
// Weapons map, kept (peeked, not drained) until a new round. The scene turns the pointer into requests each frame; the runtime (Single player) or the online session drains them. Local to one screen.
```

(b) In `MapRequests`, after `  takePew(): number | null;` insert:

```ts
  /** W-2: the pointer's fine bearing (0..65535) from the own ship's drawn marker while it is on the open Weapons map. */
  aimLaser(aim: number): void;
  /** W-2: the latest of those, kept until resetLaserAim (the MANUAL laser fires along it), or null before any. */
  laserAim(): number | null;
  /** W-2: a new round starts with no aim (the laser then aims along the nose). */
  resetLaserAim(): void;
```

(c) In `createMapRequests`, the `let` line becomes:

```ts
  let heading: number | null = null, steer: number | null = null, launches = 0, pew: number | null = null, laserAim: number | null = null;
```

and the line `    takePew() { const out = pew; pew = null; return out; }` becomes:

```ts
    takePew() { const out = pew; pew = null; return out; },
    aimLaser(aim) { laserAim = aim; },
    laserAim: () => laserAim,
    resetLaserAim() { laserAim = null; }
```

- [ ] **Step 4: The scene keeps the aim and hands it to the map**

In `src/renderer/src/app/duel/scene.ts`:

(a) In the new-round block, after the line `        fires = null; flashUntil = 0;` insert:

```ts
        options.requests?.resetLaserAim();   // W-2: a new round's MANUAL laser aims along the nose until the pointer gives an aim
```

(b) After the click block (the `if (pewClick && click) { … } else if (contact && click && onMap && station !== 'flight' … ) { … }` statement, ending with the line `        if (rock !== null) contact.pickRock(rock); else contact.click(ship);` and its closing `      }`), insert:

```ts
      // W-2 (pew pew spec §2): the MANUAL laser's aim follows the pointer while it is on the open Weapons map (its fine bearing
      // from the own ship's drawn marker, in either mode, so it is ready when the mode changes); over a console block or the
      // open window, off the canvas or with no pointer, the last aim stands. The left click stays the pew's.
      const laserPointer = station === 'weapons' && view === 'weapons' && d.tactical.outcome === Outcome.Running && !overlay.layerPaused && classOf(d.tactical, CREW_SLOT).slots.laser !== null
        ? options.pointer?.() ?? null : null;
      if (laserPointer && onWeaponsMap(laserPointer, contact?.state() != null, readoutRows({ duel: d, mode: view, active: source.active(), console: onConsole }).length)) {
        const b = interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT), w = screenToWorld(cam!, viewport, laserPointer.x, laserPointer.y);
        if (w.x !== b.x || w.y !== b.y) options.requests?.aimLaser(fineHeadingOf(w.x - b.x, w.y - b.y));
      }
```

(c) In the model `input` literal, after the line `          pewPointer: station === 'weapons' && view === 'weapons' ? options.pointer?.() ?? null : null,   // W-1: the pew's aim line follows the pointer on the Weapons map` insert:

```ts
          laserAim: station === 'weapons' && view === 'weapons' ? options.requests?.laserAim() ?? null : null,   // W-2: the MANUAL laser's aim (the model aims along the nose without one)
```

- [ ] **Step 5: The dashed aim line**

In `src/renderer/src/render/tactical/weaponsModel.ts`:

(a) The imports become (the first four lines):

```ts
import { classOf, Contact, missileOf, Outcome, targetOf } from '../../sim/tactical/state';
import { predictMissile } from '../../sim/tactical/predict';
import { laserEligible, manualLaserReady, torpedoInRange } from '../../sim/tactical/weapons';
import { clampAim } from '../../sim/tactical/pew';
import { AIM_STEPS, HEADING_COUNT, LASER_ARC_COS, LASER_ARC_STEPS, LASER_RANGE, MISSILE_RADIUS, MISSILE_RANGE, PEW_ARC, PEW_RANGE, SHIP_RADIUS } from '../../sim/tactical/tuning';
```

(b) In `CombatDraw`, after the line `  pewCone?: ArcDraw | null; pewAim?: Segment | null; pewRounds?: Segment[];` insert:

```ts
  /** W-2 (pew pew spec §2): on the Weapons map in MANUAL, while Space would fire, the laser's aim line (drawn dashed main). */
  laserAim?: Segment | null;
```

(c) In `CombatModelInput`, after the `pewPointer?: Point | null;` member insert:

```ts
  /** W-2: the MANUAL laser's aim on the Weapons map (a fine heading, MapRequests.laserAim); null or absent aims along the nose. */
  laserAim?: number | null;
```

(d) After the pew block (after the closing `  }` of `if (input.console === 'weapons' && pewDef && input.ships.includes(0)) { … }`), insert:

```ts
  // W-2 (pew pew spec §2): in MANUAL, while Space would fire (charged, no burst pending, Weapons online, no own torpedo in
  // flight), the laser's aim line: from the own ship's drawn marker along the aim clamped as the sim clamps it, to its reach.
  let laserAim: Segment | null = null;
  if (input.console === 'weapons' && cls.slots.laser && input.ships.includes(0) && state.systems[0]!.laserManual && manualLaserReady(state, 0) && missileOf(state, 0) === null) {
    const heading = state.ships[0].heading, r = LASER_RANGE * z, aim = input.laserAim ?? heading * HEADING_COUNT;
    const a = (clampAim(heading, aim, LASER_ARC_STEPS) / AIM_STEPS) * 2 * Math.PI;
    laserAim = { x1: ownS.x, y1: ownS.y, x2: ownS.x + Math.sin(a) * r, y2: ownS.y - Math.cos(a) * r };
  }
```

(e) The function's `return` line becomes:

```ts
  return { weapons, lock, missiles, effects, charge, callouts, torpedoRange, status, helmArc, solution, goal, floats, torpedoPath, evade, pings, pewCone, pewAim, pewRounds, laserAim, ...gun };
```

(f) In `src/renderer/src/render/tactical/tacticalLayer.ts`, after the line `      if (pa) combat.moveTo(pa.x1, pa.y1).lineTo(pa.x2, pa.y2).stroke({ width: 1, color: CRT.mid });` insert:

```ts
      // W-2 (pew pew spec §2): the MANUAL laser's aim line, dashed main, while it is charged.
      const la = c?.laserAim ?? null;
      if (la) { line.length = 0; line.push(la.x1, la.y1, la.x2, la.y2); segments(combat, dashLine(line, DASH, GAP, seg), 1, CRT.main); }
```

- [ ] **Step 6: The online gap room**

In `src/renderer/src/app/duel/onlineSource.ts`, in `gapEvents`:

(a) The line `    const target = t.systems[i]!.target, tgt = t.ships[target], lock = t.systems[i]!.lock;` becomes:

```ts
    const target = t.systems[i]!.target, tgt = t.ships[target], lock = t.systems[i]!.lock, manual = t.systems[i]!.laserManual;
```

(b) The line `      const hit = k < hits && !!tgt, stripped = hit && layers > 0, room = hit && !stripped ? lock : -1;` becomes:

```ts
      // W-2 (pew pew spec §2): a MANUAL hit struck the room under its hit point, which the snapshot does not carry: the first
      // room whose level rose in the gap, else none.
      const hit = k < hits && !!tgt, stripped = hit && layers > 0, room = hit && !stripped ? (manual ? rose.findIndex((r) => r > 0) : lock) : -1;
```

- [ ] **Step 7: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/manualLaserViews.test.ts tests/manualLaserScene.test.ts tests/pewViews.test.ts tests/contactScene.test.ts tests/tacticalLayer.test.ts tests/tacticalModel.test.ts tests/duelWeaponsView.test.ts tests/feelPresentation.test.ts tests/feelIiModels.test.ts tests/pewInput.test.ts tests/onlineDuel.test.ts tests/rockTargetModel.test.ts tests/interiorZoomScene.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/app/duel/mapRequests.ts src/renderer/src/app/duel/scene.ts src/renderer/src/render/tactical/weaponsModel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/app/duel/onlineSource.ts tests/manualLaserViews.test.ts tests/manualLaserScene.test.ts
git commit -m "feat(w2): the laser's aim from the pointer on the open Weapons map, the dashed MANUAL aim line while charged, the online gap room of a MANUAL hit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Z and Space: the key, the NO CHARGE refusal, the Single player runtime, the online seat, the controls list

**Files:**
- Modify: `src/renderer/src/app/duel/input.ts` (`KeyAction`, `PRESS_CODES`, `emptyPresses`), `src/renderer/src/render/duel/situationModel.ts` (`refusal`), `src/renderer/src/app/duel/runtime.ts`, `src/renderer/src/app/duel/duelMode.ts:69`, `src/renderer/src/app/duel/onlineDuel.ts`, `src/renderer/src/app/controlsList.ts` (`DUEL_ACTION`)
- Create: `tests/manualLaserInput.test.ts`
- Modify (tests): `tests/settingsAndControls.test.ts:45`, `tests/onlineDuelSession.test.ts` (a new describe after "the online pew")

**Interfaces:**
- Consumes: Task 2's `manualLaserReady`, `laserManual`; Task 4's commands; Task 5's `MapRequests.laserAim`.
- Produces:
  ```ts
  // app/duel/input.ts: KeyAction gains 'laserMode'; PRESS_CODES.KeyZ = 'laserMode'; emptyPresses().laserMode = 0
  // render/duel/situationModel.ts
  export function refusal(d: DuelState, control: RefusedControl, manual?: boolean): string | null;   // manual defaults to the sim's mode; 'fire' in MANUAL adds NO CHARGE
  // app/duel/runtime.ts: DuelRuntimeDeps.laserAim?(): number | null
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/manualLaserInput.test.ts`:

```ts
// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §4, §5): Z (and the card's tag, a laserMode press) toggles
// the laser mode from the latest queued one. In MANUAL, Space sends laserFire along the Weapons map's aim (the nose with
// none yet), or says NO CHARGE without a full charge and queues nothing. In AUTO, Space keeps today's meaning. The
// Settings list names Z.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { controlSections } from '../src/renderer/src/app/controlsList';
import { emptyPresses, PRESS_CODES, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { refusal } from '../src/renderer/src/render/duel/situationModel';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { aimDir, clampAim } from '../src/renderer/src/sim/tactical/pew';
import { HEADING_COUNT, LASER_ARC_STEPS } from '../src/renderer/src/sim/tactical/tuning';
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { seatDuelCrew } from './helpers/duelSeat';

const layout = parseShip(cutter), vp = { w: 1280, h: 720 };
function rig(aim: { at: number | null }) {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
  const tasks: { at: number; cb: () => void }[] = [];
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout,
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    clearKeys: () => { keys = { ...keys, presses: emptyPresses() }; },
    laserAim: () => aim.at
  });
  const press = (a: KeyAction): void => { keys = { ...keys, presses: { ...keys.presses, [a]: 1 } }; };
  const tick = (): void => { rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
  seatDuelCrew(rt.duel);
  press('switch'); tick(); tick();   // Tab takes the gunner (player 1, at Weapons)
  return { rt, tick, press };
}
/** The crew laser event among a tick's view events, as a unit direction. */
function crewBeam(events: ViewEvent[]): [number, number] {
  const e = events.find((x) => x.kind === 'laser' && x.ship === 0);
  if (!e || e.kind !== 'laser') throw new Error('no crew laser event');
  const dx = e.x2 - e.x1, dy = e.y2 - e.y1, n = Math.hypot(dx, dy);
  return [dx / n, dy / n];
}

describe('Z (spec §2)', () => {
  it('is bound, and toggles the laser mode from the latest queued one', () => {
    expect(PRESS_CODES.KeyZ).toBe('laserMode');
    const { rt, tick, press } = rig({ at: null });
    try {
      expect(rt.view()).toBe('weapons');
      press('laserMode'); tick();
      expect(rt.duel.tactical.systems[0].laserManual).toBe(true);
      press('laserMode'); tick();
      expect(rt.duel.tactical.systems[0].laserManual).toBe(false);
    } finally { rt.dispose(); }
  });
});

describe('Space in MANUAL (spec §2, §4)', () => {
  it('sends laserFire along the map aim, and the beam leaves along it', () => {
    const aim = { at: null as number | null }, { rt, tick, press } = rig(aim);
    try {
      rt.duel.tactical.systems[0].laserManual = true;
      const h = rt.duel.tactical.ships[0].heading, before = rt.duel.tactical.systems[0].shots;
      aim.at = ((h + 20) % 256) * HEADING_COUNT + 100;
      rt.drainEvents();
      press('fireDown'); tick();
      expect(rt.duel.tactical.systems[0].shots).toBe(before + 1);
      const [ux, uy] = aimDir(clampAim(h, aim.at, LASER_ARC_STEPS)), [bx, by] = crewBeam(rt.drainEvents());
      expect(bx).toBeCloseTo(ux, 6); expect(by).toBeCloseTo(uy, 6);
    } finally { rt.dispose(); }
  });
  it('with no aim yet it fires along the nose', () => {
    const { rt, tick, press } = rig({ at: null });
    try {
      rt.duel.tactical.systems[0].laserManual = true;
      const h = rt.duel.tactical.ships[0].heading;
      rt.drainEvents();
      press('fireDown'); tick();
      const [bx, by] = crewBeam(rt.drainEvents());
      expect(bx).toBeCloseTo(hx(h), 6); expect(by).toBeCloseTo(hy(h), 6);
    } finally { rt.dispose(); }
  });
  it('without a full charge says NO CHARGE and queues nothing', () => {
    const { rt, tick, press } = rig({ at: 0 });
    try {
      rt.duel.tactical.systems[0].laserManual = true;
      rt.duel.tactical.systems[0].laserCharge = 0;
      expect(refusal(rt.duel, 'fire')).toBe('NO CHARGE');
      expect(refusal(rt.duel, 'fire', false)).toBeNull();   // in AUTO an uncharged press says nothing, as today
      rt.takeRefusals();
      press('fireDown'); tick();
      expect(rt.takeRefusals()).toEqual([{ control: 'fire', reason: 'NO CHARGE' }]);
      expect(rt.duel.tactical.systems[0].shots).toBe(0);
    } finally { rt.dispose(); }
  });
});

describe('Space in AUTO (spec §2)', () => {
  it('keeps today\'s meaning: one press fires the full laser', () => {
    const { rt, tick, press } = rig({ at: 0 });
    try {
      const before = rt.duel.tactical.systems[0].shots;
      press('fireDown'); tick();
      expect(rt.duel.tactical.systems[0].shots).toBe(before + 1);
      expect(rt.duel.tactical.systems[0].laserManual).toBe(false);
    } finally { rt.dispose(); }
  });
});

describe('the Settings controls list (spec §5)', () => {
  it('names Z at Weapons', () => {
    const rows = controlSections()[0]!.rows;
    expect(rows.find((r) => r.keys === 'Z')?.action).toMatch(/Weapons.*AUTO.*MANUAL/);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/manualLaserInput.test.ts`
Expected: FAIL (`PRESS_CODES.KeyZ` is undefined; no laserMode is queued; `refusal` gives no NO CHARGE; no `Z` row).

- [ ] **Step 3: The key**

In `src/renderer/src/app/duel/input.ts`:

(a) The `KeyAction` doc and type become:

```ts
/** Press-edge actions (spec §5 table). H-1a uses pause, camera and the zoom keys; H-1b adds the duel ones; Artemis-ii
 *  adds the Helm's throttle notches on W and S (spec 2026-11-17-artemis-consoles §5.4); W-2 adds Z, the laser's AUTO /
 *  MANUAL toggle at Weapons (pew pew spec §2). */
export type KeyAction = 'interact' | 'prevLock' | 'fireDown' | 'fireUp' | 'launch' | 'laserMode' | 'stand' | 'switch' | 'pause' | 'camera' | 'zoomIn' | 'zoomOut' | 'confirm' | 'menu' | 'throttleUp' | 'throttleDown';
```

(b) The first line of `PRESS_CODES` becomes:

```ts
  KeyE: 'interact', KeyQ: 'prevLock', Space: 'fireDown', KeyF: 'launch', KeyZ: 'laserMode', KeyX: 'stand', Tab: 'switch', Escape: 'pause', KeyC: 'camera',
```

(c) `emptyPresses`'s return becomes:

```ts
  return { interact: 0, prevLock: 0, fireDown: 0, fireUp: 0, launch: 0, laserMode: 0, stand: 0, switch: 0, pause: 0, camera: 0, zoomIn: 0, zoomOut: 0, confirm: 0, menu: 0, throttleUp: 0, throttleDown: 0 };
```

- [ ] **Step 4: The refusal**

In `src/renderer/src/render/duel/situationModel.ts`:

(a) The weapons import becomes:

```ts
import { laserEligible, laserFull, laserOffline, manualLaserReady, torpedoInRange } from '../../sim/tactical/weapons';
```

(b) The `refusal` signature line `export function refusal(d: DuelState, control: RefusedControl): string | null {` becomes:

```ts
export function refusal(d: DuelState, control: RefusedControl, manual = d.tactical.systems[CREW_SLOT].laserManual): string | null {
```

and inside it the line `    if (control === 'fire') return laserOffline(t, CREW_SLOT) ? 'WEAPONS OFFLINE' : null;` becomes:

```ts
    if (control === 'fire') return laserOffline(t, CREW_SLOT) ? 'WEAPONS OFFLINE' : manual && !manualLaserReady(t, CREW_SLOT) ? 'NO CHARGE' : null;   // W-2: a MANUAL press needs a full charge
```

(c) Its doc comment gains, before the closing `*/`: ` W-2 (pew pew spec §2): FIRE in MANUAL (\`manual\`, default the sim's mode) is laserFire: after the same checks, NO CHARGE without manualLaserReady.`

- [ ] **Step 5: The Single player runtime**

In `src/renderer/src/app/duel/runtime.ts`:

(a) In `DuelRuntimeDeps`, after `  takePew?(): number | null;` insert:

```ts
  /** W-2 (pew pew spec §2): the MANUAL laser's aim (mapRequests.ts laserAim, kept, not drained): the latest fine heading the
   *  pointer gave on the open Weapons map, or null before any (the laser then fires along the nose). */
  laserAim?(): number | null;
```

(b) `isWeaponsCommand` becomes:

```ts
const isWeaponsCommand = (c: DuelCommand): boolean => c.kind === 'laserMode' || c.kind === 'laserLock' || c.kind === 'torpLock' || c.kind === 'rockLock' || c.kind === 'laserCharge' || c.kind === 'laserFire' || c.kind === 'missileLaunch' || c.kind === 'pewFire';
```

(c) After the `freqBase` line insert:

```ts
  /** W-2 (pew pew spec §2): the active player's latest queued laser mode, else the sim's (as freqBase). */
  const laserModeBase = (): boolean => { const c = [...pending].reverse().find((x) => x.player === active && x.command.kind === 'laserMode')?.command; return c && c.kind === 'laserMode' ? c.manual : d.tactical.systems[0].laserManual; };
```

(d) In `play`'s Weapons part, replace the lines from `    if (p.fireDown > 0) queue({ kind: 'laserCharge', held: true });   // FTL targeting spec §2: one press fires a full laser` through `    if (launchWhy) refuse('launch', launchWhy);` with:

```ts
    // W-2 (pew pew spec §2): Z or the LASER card's AUTO / MAN tag toggles the laser's mode, from the latest queued one (an odd
    // number of presses this frame toggles it).
    let manual = laserModeBase();
    if (p.laserMode % 2 === 1 && hasLaser()) { manual = !manual; queue({ kind: 'laserMode', manual }); }
    if (manual) {
      // W-2: in MANUAL Space fires the laser along the Weapons map's aim (else the nose), or says why not (NO CHARGE without a
      // full charge) and queues nothing.
      if (p.fireDown > 0) {
        const why = refusal(d, 'fire', true);
        if (why) refuse('fire', why);
        else { const aim = deps.laserAim?.() ?? d.tactical.ships[0].heading * HEADING_COUNT; queue({ kind: 'laserFire', aim: Math.floor(aim / HEADING_COUNT), aimAcc: aim % HEADING_COUNT }); }
      }
    } else if (p.fireDown > 0) queue({ kind: 'laserCharge', held: true });   // FTL targeting spec §2: one press fires a full laser
    if (p.launch > 0) queue({ kind: 'missileLaunch' });
    // Feel-ii §2.8: FIRE and LAUNCH say why when the sim would refuse them (the tick drops them by the same checks).
    const fireWhy = p.fireDown > 0 && !manual ? refusal(d, 'fire', false) : null, launchWhy = p.launch > 0 ? refusal(d, 'launch') : null;
    if (fireWhy) refuse('fire', fireWhy);
    if (launchWhy) refuse('launch', launchWhy);
```

(e) In `src/renderer/src/app/duel/duelMode.ts`, the line starting `    takeContactRequests: () => contact.takeRequests(), takeHeading: () => requests.takeHeading(), takePew: () => requests.takePew(),` becomes:

```ts
    takeContactRequests: () => contact.takeRequests(), takeHeading: () => requests.takeHeading(), takePew: () => requests.takePew(), laserAim: () => requests.laserAim(),   // W-2
```

- [ ] **Step 6: The online seat**

In `src/renderer/src/app/duel/onlineDuel.ts`:

(a) The line `import { CONTACT_MAX_LEVEL, missileOf } from '../../sim/tactical/state';` (the second state import; the `{ Outcome }` one stays) becomes:

```ts
import { classOf, CONTACT_MAX_LEVEL, missileOf } from '../../sim/tactical/state';
```

(b) After the line `  const pewRequest = (): number | null => requests.takePew();   // W-1: the Weapons map's pew aim, drained every pump` insert:

```ts
  const laserAimNow = (): number | null => requests.laserAim();   // W-2: the MANUAL laser's aim (kept, not drained)
```

(c) After the `let headingSent: { heading: number; sequence: number | null; round: number } | null = null;` line insert:

```ts
  // W-2 (pew pew spec §2): the laser mode this seat last asked for, until its result comes back (as throttleSent); and the
  // laserFire commands it sent, whose 'unavailable' answer shows NO CHARGE (W-1 review F2's rule).
  let laserModeSent: { manual: boolean; sequence: number; round: number } | null = null;
  const laserSent = new Set<number>();
```

(d) In `observe`, after the line starting `      if (result.id.player === descriptor.seatId && pewSent.delete(result.id.sequence)` insert:

```ts
      if (laserModeSent && result.id.player === descriptor.seatId && result.id.sequence === laserModeSent.sequence) laserModeSent = null;   // W-2: the replica is the base again
      if (result.id.player === descriptor.seatId && laserSent.delete(result.id.sequence) && result.status === 'rejected' && result.reason === 'unavailable') source.refuse('fire', 'NO CHARGE');   // W-2
```

(e) In `play`, the two seat-change lines become:

```ts
      if (p.interact > 0 && repairInReach(d, me) < 0) { const c = consoleInReach(d, me); if (c >= 0) { throttleSent = null; headingSent = null; laserModeSent = null; send({ kind: 'sit', station: c }); } }
```
```ts
    if (p.stand > 0) { throttleSent = null; headingSent = null; laserModeSent = null; send({ kind: 'stand' }); return; }
```

(f) In `play`'s Weapons part, replace the lines from `    // FTL targeting spec §2: Space is a single press that fires a full laser; there is no release to send.` through `    if (launchWhy) source?.refuse('launch', launchWhy);` with:

```ts
    // W-2 (pew pew spec §2): Z or the LASER card's AUTO / MAN tag toggles the laser's mode, from the mode in flight, else the
    // replica's (an odd number of presses this pump toggles it).
    let manual = laserModeSent ? laserModeSent.manual : sys.laserManual;
    if (p.laserMode % 2 === 1 && classOf(d.tactical, 0).slots.laser !== null) {
      manual = !manual;
      const id = send({ kind: 'laserMode', manual }); if (id) laserModeSent = { manual, sequence: id.sequence, round: d.round };
    }
    if (manual) {
      // W-2: in MANUAL Space fires the laser along the Weapons map's aim (else the nose). The replica lags the authority, so its
      // charge is no gate (W-1 review F2's rule): NO GUNNER, TORPEDO FLYING and WEAPONS OFFLINE refuse locally, a press on a
      // seemingly uncharged replica is sent anyway, and the authority's 'unavailable' answer (observe) shows NO CHARGE.
      if (p.fireDown > 0) {
        const why = refusal(d, 'fire', true);
        if (why && why !== 'NO CHARGE') source?.refuse('fire', why);
        else {
          const aim = laserAimNow() ?? d.tactical.ships[0].heading * HEADING_COUNT, id = send({ kind: 'laserFire', aim: Math.floor(aim / HEADING_COUNT), aimAcc: aim % HEADING_COUNT });
          if (id) laserSent.add(id.sequence);
        }
      }
    } else if (p.fireDown > 0 && canCharge(d.tactical, 0)) send({ kind: 'laserCharge', held: true });   // FTL targeting spec §2: Space is a single press that fires a full laser; there is no release to send
    if (p.launch > 0 && canLaunch(d.tactical, 0)) send({ kind: 'missileLaunch' });
    // Feel-ii §2.8: FIRE and LAUNCH say why when the sim would refuse them (the same checks that hold them back above).
    const fireWhy = p.fireDown > 0 && !manual ? refusal(d, 'fire', false) : null, launchWhy = p.launch > 0 ? refusal(d, 'launch') : null;
    if (fireWhy) source?.refuse('fire', fireWhy);
    if (launchWhy) source?.refuse('launch', launchWhy);
```

(g) In `pump`, after the line starting `    if (headingSent && d && (d.round !== headingSent.round` insert:

```ts
    if (laserModeSent && d && d.round !== laserModeSent.round) laserModeSent = null;   // W-2: every round starts AUTO
```

(h) In `attach`, the line containing `throttleSent = null; headingSent = null; attaches++;` gets `laserModeSent = null; ` inserted before `attaches++;`, and the line `      heldStamps.length = 0; commandStamps.clear(); pewSent.clear();   // the new client restarts its sequences: an old stamp would match a new frame` becomes:

```ts
      heldStamps.length = 0; commandStamps.clear(); pewSent.clear(); laserSent.clear();   // the new client restarts its sequences: an old stamp would match a new frame
```

- [ ] **Step 7: The Settings controls list and its tests**

(a) In `src/renderer/src/app/controlsList.ts`, in `DUEL_ACTION`, the `fireDown` and `launch` entries become:

```ts
  fireDown: 'At Weapons, fire a full laser (in MANUAL, along the map aim); at the Helm, hold to turn the nose onto the enemy (auto-face)',
  launch: 'At Weapons, launch a torpedo',
  laserMode: 'At Weapons, switch the laser between AUTO (it fires at its target by itself) and MANUAL (Space fires it along the map aim)',
```

(b) In `tests/settingsAndControls.test.ts`, after line 45 (`    expect(action('Left click')).toMatch(/Weapons.*pew/);   // W-1: the pew's left click`) add:

```ts
    expect(action('Z')).toMatch(/Weapons.*AUTO.*MANUAL/);   // W-2: the laser's mode
```

(c) In `tests/onlineDuelSession.test.ts`, first widen both `requests` annotations (the hoisted `sceneOpts` array type near line 53 and the scene mock's `opts` parameter type near line 66): each `requests?: { pew(aim: number): void }` becomes `requests?: { pew(aim: number): void; aimLaser(aim: number): void }`. Then, after the closing `});` of `describe('the online pew (W-1 review F2)', …)` insert:

```ts
describe('the online manual laser (W-2)', () => {
  const sent = (c: Stub, kind: string) => c.commands().filter((x) => x.kind === kind);
  const fireRefusals = () => h.sources.at(-1)!.takeRefusals().filter((x) => x.control === 'fire');
  it('Z sends laserMode from the mode in flight, else the replica\'s', () => {
    const r = rig(1), c = r.attach();
    r.session.frame();
    r.key('keydown', 'KeyZ'); r.key('keyup', 'KeyZ'); r.pump();
    r.key('keydown', 'KeyZ'); r.key('keyup', 'KeyZ'); r.pump();
    expect(sent(c, 'laserMode')).toEqual([{ kind: 'laserMode', manual: true }, { kind: 'laserMode', manual: false }]);
    r.dispose();
  });
  it('in MANUAL Space sends laserFire along the map aim even on an uncharged replica; an unavailable answer shows NO CHARGE', () => {
    const r = rig(1);
    r.d.tactical.systems[0]!.laserManual = true;
    r.d.tactical.systems[0]!.laserCharge = 0;   // the lagging replica: empty
    const c = r.attach();
    r.session.frame();
    h.sceneOpts[0]!.requests!.aimLaser(1234);
    r.key('keydown', 'Space'); r.key('keyup', 'Space'); r.pump();
    expect(sent(c, 'laserFire')).toEqual([{ kind: 'laserFire', aim: 4, aimAcc: 210 }]);
    expect(sent(c, 'laserCharge')).toEqual([]);
    r.session.frame(); expect(fireRefusals()).toEqual([]);   // nothing is shown before the authority answers
    const id = c.ids[c.commands().map((x) => x.kind).lastIndexOf('laserFire')]!;
    c.results.push({ id, tick: 3, status: 'rejected', reason: 'unavailable' }); r.pump();
    r.session.frame();
    expect(fireRefusals()).toEqual([{ control: 'fire', reason: 'NO CHARGE' }]);
    r.dispose();
  });
});
```

- [ ] **Step 8: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/manualLaserInput.test.ts tests/settingsAndControls.test.ts tests/onlineDuelSession.test.ts tests/pewInput.test.ts tests/contactScene.test.ts tests/duelRuntime.test.ts tests/duelInput.test.ts tests/duelInputMerge.test.ts tests/feelIiInput.test.ts tests/feelIiModels.test.ts tests/feelUi.test.tsx tests/crewSeats.test.ts tests/flightPointer.test.ts tests/flightRuntime.test.ts tests/valkyrnRuntime.test.ts tests/webPageGuards.test.ts tests/duelRemoteClient.test.ts tests/manualLaserScene.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/app/duel/input.ts src/renderer/src/render/duel/situationModel.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/controlsList.ts tests/manualLaserInput.test.ts tests/settingsAndControls.test.ts tests/onlineDuelSession.test.ts
git commit -m "feat(w2): Z toggles the laser mode; in MANUAL Space sends laserFire along the map aim (Single player, and online with the always-send rule and NO CHARGE from 'unavailable'); Settings row" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The LASER card's AUTO / MAN tag, and the card's words in MANUAL

**Files:**
- Modify: `src/renderer/src/render/duel/situationModel.ts` (after `laserCardReason`), `src/renderer/src/render/duel/consoleModel.ts` (`WeaponsPanel`, the import, `weaponsPanel`), `src/renderer/src/ui/duel/WeaponsStation.tsx`
- Create: `tests/manualLaserUi.test.tsx`

**Interfaces:**
- Consumes: Task 2's `laserManual`; Task 6's `KeyAction 'laserMode'`.
- Produces:
  ```ts
  // render/duel/situationModel.ts
  export function manualCardReason(reason: string | null): string | null;   // FIRING / PICK A ROOM TO FIRE → 'MANUAL: SPACE FIRES'
  // render/duel/consoleModel.ts: WeaponsPanel.laserManual?: boolean
  // ui/duel/WeaponsStation.tsx: <Button name="laser-mode"> (data-testid console-laser-mode), label AUTO / MAN, lit in MANUAL
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/manualLaserUi.test.tsx`:

```tsx
// @vitest-environment jsdom
// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §5): the LASER card's AUTO / MAN tag shows the mode (MAN lit)
// and a click on it presses laserMode, as Z does; the Weapons panel carries the mode; in MANUAL the card never says
// FIRING and has no goal glow.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { consoleModel, type ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { manualCardReason } from '../src/renderer/src/render/duel/situationModel';
import { NO_HELD_FLAGS, type ConsoleInput } from '../src/renderer/src/app/duel/input';
import { TEXT } from '../src/renderer/src/render/theme';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import type { TacticalState } from '../src/renderer/src/sim/tactical/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const tag = () => document.querySelector('[data-testid="console-laser-mode"]') as HTMLElement | null;
const charge = { label: 'CHARGE', value: 'READY', labelTint: TEXT, valueTint: TEXT, bar: { fill: 1, colour: TEXT } };
const weapons = (over: Partial<NonNullable<ConsoleView['weapons']>>): ConsoleView => ({
  station: 'weapons', tabs: { helm: 'open', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, science: null, ship: 'stand' },
  helm: null, science: null, side: { zoom: '0.90', free: false, snapLabel: 'CAMERA' },
  weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, torpedoInRange: true, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null, laserTarget: 1, torpTarget: -1, burst: 2, ...over }
});
const view = (console: ConsoleView): DuelUiView => ({ readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { ui, duel };
}
/** The enemy `dist` ahead of the crew at (3000, 0), nose north, `deg` off the nose (feelPresentation.test.ts's place). */
function place(st: TacticalState, dist: number, deg = 0): void {
  const me = st.ships[0], e = st.ships[1], r = (deg * Math.PI) / 180;
  Object.assign(me, { x: 3000, y: 0, vx: 0, vy: 0, heading: 0 });
  st.map.asteroids.length = 0;
  const fx0 = hx(0), fy0 = hy(0), c = Math.cos(r), s = Math.sin(r);
  Object.assign(e, { x: me.x + dist * (fx0 * c - fy0 * s), y: me.y + dist * (fy0 * c + fx0 * s), vx: 0, vy: 0 });
}

describe('the AUTO / MAN tag (spec §2, §5)', () => {
  it('reads AUTO unlit in AUTO and MAN lit in MANUAL; absent without the mode', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ laserManual: false }))));
    expect(texts()).toContain('AUTO');
    expect(tag()!.dataset.uiButton).not.toBe('lit');
    act(() => duel.frame(view(weapons({ laserManual: true }))));
    expect(texts()).toContain('MAN');
    expect(tag()!.dataset.uiButton).toBe('lit');
    act(() => duel.frame(view(weapons({}))));
    expect(tag()).toBeNull();
  });
  it('a click presses laserMode, as Z does', () => {
    const { ui, duel } = mount(), press = vi.fn();
    const input: ConsoleInput = { press, hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
    ui.actions.setConsole(input);
    act(() => duel.frame(view(weapons({ laserManual: false }))));
    fireEvent.pointerDown(tag()!, { button: 0 });
    expect(press).toHaveBeenCalledWith('laserMode');
  });
});

describe('the Weapons panel in MANUAL (spec §2)', () => {
  it('maps the firing words to MANUAL: SPACE FIRES and keeps the others', () => {
    expect([manualCardReason('FIRING'), manualCardReason('PICK A ROOM TO FIRE'), manualCardReason('OUT OF ARC: HELM TURN RIGHT'), manualCardReason(null)])
      .toEqual(['MANUAL: SPACE FIRES', 'MANUAL: SPACE FIRES', 'OUT OF ARC: HELM TURN RIGHT', null]);
  });
  it('carries the mode; a lined-up MANUAL laser never says FIRING and has no goal glow', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      place(d.tactical, 300, 10);   // lined up, full and targeted: AUTO says FIRING
      const panel = () => consoleModel({ duel: d, me: 1, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, goal: true })!.weapons!;
      expect([panel().laserManual, panel().laserReason]).toEqual([false, 'FIRING']);
      d.tactical.systems[0].laserManual = true;
      d.tactical.systems[0].laserTargeted = false;   // untargeted: AUTO would glow
      expect([panel().laserManual, panel().laserReason, panel().goal]).toEqual([true, 'MANUAL: SPACE FIRES', false]);
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/manualLaserUi.test.tsx`
Expected: FAIL (`manualCardReason` is not exported; no `console-laser-mode`; `laserManual` is absent from the panel).

- [ ] **Step 3: The card's words in MANUAL**

In `src/renderer/src/render/duel/situationModel.ts`, after the `laserCardReason` function insert:

```ts
/** W-2 (pew pew spec §2): the LASER card's why-not in MANUAL. It never fires by itself, so a firing solution (FIRING, or
 *  PICK A ROOM TO FIRE) reads MANUAL: SPACE FIRES; every other reason stands. */
export function manualCardReason(reason: string | null): string | null {
  return reason === 'FIRING' || reason === 'PICK A ROOM TO FIRE' ? 'MANUAL: SPACE FIRES' : reason;
}
```

- [ ] **Step 4: The panel**

In `src/renderer/src/render/duel/consoleModel.ts`:

(a) The situationModel import becomes:

```ts
import { gunnerPresent, laserCardReason, laserSituation, manualCardReason, type RefusedControl } from './situationModel';
```

(b) In `WeaponsPanel`, the line `  laserRock?: boolean; torpRock?: boolean; torpRockFlying?: boolean;` becomes:

```ts
  laserRock?: boolean; torpRock?: boolean; torpRockFlying?: boolean;
  /** W-2 (pew pew spec §2): the laser's mode for the LASER card's AUTO / MAN tag (true MANUAL); absent draws no tag. */
  laserManual?: boolean;
```

(c) Replace the `weaponsPanel` arrow (from `  const weaponsPanel = (): WeaponsPanel => ({` through its closing `pew: pewPips(t) });`) with:

```ts
  const weaponsPanel = (): WeaponsPanel => {
    const reason = laserCardReason(laserSituation(t, i.sinceShot ?? Infinity, gunnerPresent(d)), laserOffline(t, 0));
    return { lock: sys.lock, charge: chargeRow(d), magazine: `${sys.magazine}/${MAGAZINE}`, canLaunch: canLaunch(t, 0), torpedoInRange: torpedoInRange(t, 0), missileFlying: flying, fireHeld: held.fire, held, freq: sys.freq, weakFreq: t.known[Contact.Enemy] >= 2 ? t.weakFreq : null,
      laserTarget: sys.laserTargeted ? sys.lock : -1, torpTarget: sys.torpLock, burst: classOf(t, 0).slots.laser?.shots ?? 0,   // Valkyrn-i: Part ii gives the gun its own card
      laserRock: sys.laserRock >= 0, torpRock: sys.torpRock >= 0, torpRockFlying: sys.torpRockFlying >= 0, rocks: sys.rocksBroken,   // spike ii §6.5, §7 item 9
      // W-2 (pew pew spec §2): the mode for the tag; in MANUAL the laser never fires by itself, so no FIRING and no goal glow.
      laserReason: sys.laserManual ? manualCardReason(reason) : reason, goal: (i.goal ?? false) && !sys.laserTargeted && !sys.laserManual, laserManual: sys.laserManual,
      refused: i.refused && !HELM_CONTROLS.includes(i.refused.control) ? i.refused : null, pew: pewPips(t) };
  };
```

- [ ] **Step 5: The tag on the LASER card**

In `src/renderer/src/ui/duel/WeaponsStation.tsx` (Edit; the file is CRLF):

(a) After the header comment line starting `// W-1 (pew pew spec 1): the PEW row first,` insert:

```ts
// W-2 (pew pew spec §2): the LASER card's AUTO / MAN tag in its header row, lit in MANUAL; a click toggles the mode, as Z does.
```

(b) After the line `      <PixelText text="1" x={L.x + L.w - 6} y={L.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />` insert:

```tsx
      {weapons.laserManual !== undefined
        ? <Button name="laser-mode" label={weapons.laserManual ? 'MAN' : 'AUTO'} x={lx + 66} y={L.y + 2} w={36} h={18} lit={weapons.laserManual} onPress={() => actions.console.press('laserMode')} />
        : null}
```

(The tag sits after the card's hit box in the DOM, so it is on top of it: a click on the tag never picks the laser up. `AUTO` is 24 px wide at the native font, inside the 36 px tag; the tag spans the card's x 72..108, clear of `x2` (to 66) and the `1` key hint (from 126).)

- [ ] **Step 6: Run the tests**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx vitest run tests/manualLaserUi.test.tsx tests/pewUi.test.tsx tests/targetingUi.test.tsx tests/feelUi.test.tsx tests/feelIiUi.test.tsx tests/uiConsole.test.tsx tests/uiDuel.test.tsx tests/rockTargetUi.test.tsx tests/scienceUi.test.tsx tests/duelConsoleModel.test.ts tests/feelPresentation.test.ts tests/crewSeats.test.ts tests/uiButton.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/render/duel/situationModel.ts src/renderer/src/render/duel/consoleModel.ts src/renderer/src/ui/duel/WeaponsStation.tsx tests/manualLaserUi.test.tsx
git commit -m "feat(w2): the LASER card's AUTO / MAN tag (lit in MANUAL, a click toggles as Z does); in MANUAL the card says MANUAL: SPACE FIRES and has no goal glow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The additive proof, the gameplay bless at 56, the gates unchanged, the full verification and the owner's gate

**Files:**
- Modify: `scripts/golden/duelOracle.ts` (`ADDITIONS`), `docs/gates.md` (append)
- Regenerated by `npm run bless` (same version): `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/golden/basic.json` (its embedded content digest only)

**Interfaces:**
- Consumes: Tasks 1 to 7; Task 1's commit message (the gate numbers) and its duel-oracle baseline at 56.
- Produces: the merge-ready branch.

- [ ] **Step 1: Every AUTO run is unchanged per tick (the additive oracle)**

In `scripts/golden/duelOracle.ts`, in `ADDITIONS`, the `53` entry's last line

```ts
    added: [/^space\.rounds\.\d+\.(active|owner|flight)$/, /^ship\.systems\.\d+\.gun(Heat|Locked|Cooldown|Muzzle|Wear|Hull|RoomWear|Shots|Hits)$/] }
```

becomes (a comma after its brace, then the new entry, before the table's closing `};`):

```ts
    added: [/^space\.rounds\.\d+\.(active|owner|flight)$/, /^ship\.systems\.\d+\.gun(Heat|Locked|Cooldown|Muzzle|Wear|Hull|RoomWear|Shots|Hits)$/] },
  /** W-2 (56): the laser mode and the MANUAL burst aim on every systems record; no oracle run sends laserMode, so they stay
   *  at their first recorded values (false and −1), which `frozen` makes recordRun check at every tick. */
  56: { change: 'W-2: the laser mode and the MANUAL burst aim', rename: () => undefined, derived: [], frozen: true,
    added: [/^ship\.systems\.\d+\.(laserManual|laserAim)$/] }
```

Run: `npx tsx scripts/golden/duel-oracle.ts added`
Expected: `duel oracle: <R> runs, <T> ticks, <F'> named fields, results, events and telemetry identical at every tick with the fields declared added at 56 (W-2: the laser mode and the MANUAL burst aim), sim version 56 → 56 (baseline HEAD <Task 1 sha>)`, exit 0, with Task 1's `<R>` and `<T>`.

If it fails with a value, event or telemetry difference: stop. The AUTO path changed (the message names the run, the tick and the field); fix the code in the task that introduced it and re-run, never tune. If it fails because the baseline is missing or from another checkout (a reboot cleared the temp folder): record that in the final report as "additive oracle proof: not run (baseline lost)", and rely on Steps 2 and 3 alone.

Run: `npx vitest run tests/duelOracle.test.ts tests/blessGuard.test.ts`
Expected: PASS.

- [ ] **Step 2: The same-version bless**

Run: `npm run bless`
Expected, exit 0: four `blessed …` lines. `basic.json` still `120 checkpoints`; the determinism fixture line reads `sim version 56, <n> samples and <m> boundaries re-executed` with Task 1's `<n>` and `<m>`; the two duel lines carry **the same checkpoint counts, tick counts and outcomes as Task 1's blessed lines** (read them with `git log --grep="chore(w2): SIM_VERSION 55 -> 56" --format=%B -n 1`), with new hashes. Any other tick count or outcome: stop (as Step 1).

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

Run: `git status --short tests/golden tests/fixtures`
Expected: `M tests/golden/basic.json`, `M tests/golden/duel-1.json`, `M tests/golden/duel-rematch.json`, and nothing else.

- [ ] **Step 3: The duel gates did not move**

Run: `npx tsx scripts/duel-telemetry.ts`
Run: `npx tsx scripts/valkyrn-telemetry.ts`
Expected: the gate summary lines, the passive median and the Valkyrn summary are character for character the ones in Task 1's commit message. If any line differs: stop, as Step 1.

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
Expected: PASS on every runtime it reports (Node, Electron, Firefox). It replays the sector fixture only, so it says nothing about the manual laser: the final report lists "duel/manual laser determinism across runtimes: not verified (guard rules, the additive oracle and Node goldens only)".

Run: `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability`
Then: `git status --short .superpowers/sdd`
Expected: no output.

- [ ] **Step 6: The build and the scope checks**

Run: `npm run build`
Expected: success.

Run: `git grep -n "torpMode\|torpTurn\|torpHeading" -- src`
Expected: no output (W-3 stays out of scope).

Run: `git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`
Expected: `src/renderer/src/sim/tuning.ts:7:export const SIM_VERSION = 56;`

- [ ] **Step 7: The gates entry**

Append to `docs/gates.md` (Edit; the file is CRLF), with Steps 1 to 4's real numbers in place of the angle-bracket fields:

```markdown

## W-2: the manual laser (2026-11-18)

Spec `docs/superpowers/specs/2026-11-18-pew-pew-weapons-design.md` §2; plan `docs/superpowers/plans/2026-11-18-w2-manual-laser.md`.

- [x] Automated (W-2): `npx vitest run` passes (<files> files), including the mode (every round AUTO, the Hunter always; MANUAL charges but never fires by itself), the beam (along the aim clamped to ±60°, the room under the hit point, rocks struck as the AUTO laser strikes them, the planet stops it, torpedoes pass, bursts keep their aim), the commands' admission and the codec, the snapshot bounds, Z and Space in Single player and online (NO CHARGE from the authority's 'unavailable'), the aim line, the AUTO / MAN tag (`tests/manualLaser*.test.ts`, `tests/manualLaserUi.test.tsx`); `npx tsc -b` clean; SIM_VERSION 56, goldens blessed; the additive duel oracle proves every AUTO run unchanged per tick (<R> runs, <T> ticks); the duel gates unchanged (Hound median <s> s, <w> wins, <l> losses; Valkyrn median <s> s, <h> Hunter wins).
- [ ] Manual (owner): play a Single player duel at Weapons. The LASER card shows an AUTO tag; press Z (or click the tag) and it reads MAN, lit. With the laser charged, a dashed line runs from your ship along the mouse's bearing, stopping at the ±60° arc; Space fires the beam along it (the left click is still the pew). A rock in the way takes the hit; the enemy's struck room is the one under the beam. Press Z again for AUTO: it fires at its target room by itself as before. Screenshots for the look gate: (1) the LASER card with the AUTO tag and with the MAN tag; (2) the Weapons map in MANUAL with the laser charged, showing the dashed aim line beside the pew's cone and solid aim line. Do the tag and the dashed line read on the amber CRT, and is the dashed laser line easy to tell from the pew's?
```

- [ ] **Step 8: Commit**

```bash
git add scripts/golden/duelOracle.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json docs/gates.md
git commit -m "test(w2): same-version bless at SIM_VERSION 56 for the manual laser (additive oracle: every AUTO run unchanged per tick; duel gates unchanged)" -m "<the four blessed lines from Step 2>" -m "<the duel oracle line from Step 1>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: The owner's look gate (not blocking the merge)**

Report to the owner that the manual look check is open (the `docs/gates.md` entry), with the screenshots it names, taken by the visual check method (playwright-core outside the repo, Electron `_electron.launch` on `out/`; walking must line up with the one-tile doors): the LASER card with the AUTO tag and with the MAN tag lit; the Weapons map in MANUAL with the laser charged, the dashed aim line beside the pew's cone and aim line.

---

## Self-review

**1. Spec coverage (sections 2, 4, 5, 6, 7 for W-2):**
- §2 The toggle: per-slot sim state, AUTO at the start, the Hunter always AUTO (Task 2, the validator's crew-only rule, Decision 8); Z (Task 6) and the AUTO / MAN tag (Task 7); `laserMode {manual}` sets it (Task 4).
- §2 AUTO unchanged: the AUTO paths gated only on the mode, `shoot` refactored with byte-identical events (Tasks 2, 3), proved by the additive oracle and the unchanged gates (Task 8), and the existing laser tests run in Tasks 2, 3.
- §2 MANUAL: no auto-fire, charges as today (Task 2); Space sends `laserFire {aim, aimAcc}` with the pew's aim format and the laser's ±60° clamp (Tasks 3, 4, 6); the aim from the Weapons map pointer, else the last aim, else the heading (Tasks 5, 6, Decision 10); full charge fires the shot or burst, otherwise NO CHARGE, online always-send plus 'unavailable' → NO CHARGE (Tasks 4, 6); instant beam to 450, first rock or planet stops it, the rock struck as master's laser strikes it (Decision 2, Task 3), torpedoes pass (Task 3), the ship's room under the hit point via `roomAtImpact` with today's effects (Task 3); each burst shot uses its fired aim and is re-checked at its own tick (Task 3, Decision 5); `laserFrozen` still applies (Tasks 3, 4); the dashed `main` aim line while charged (Task 5, Decision 11).
- §4: `laserMode` and `laserFire` in `DuelCommand`, `duelWire`, the authority (through the codec and step; no rules edit), `DUEL_KINDS`, explicit `WEAPON_ORDER` places, `shipModule.commands` and `tests/ftlTargeting.test.ts`'s pin (Task 4); local input from `runtime.ts`, online from `onlineDuel.ts` (Task 6); the laser mode per slot hashed, snapshotted (through the tactical modules) and validated (Task 2); arithmetic and the heading-index clamp (Tasks 2, 3); SIM_VERSION 55 → 56 once, goldens re-recorded (Tasks 1, 8). Determinism: `npm run test:determinism` replays the sector only; the duel rests on the guard rules, the additive oracle and the Node goldens (Task 8 Step 5). W-3's torpedo mode, held fields and per-torpedo flag are out of scope (Task 8 Step 6).
- §5 manual laser checks: never auto-fires in MANUAL (Task 2), Space fires along the aim (Tasks 3, 6), the room under the hit point (Task 3), rocks block it and torpedoes don't (Task 3), AUTO unchanged (Tasks 2, 3, 8). Network: codec round-trips and malformed / wrong-seat rejections (Task 4). UI: the tags toggle and show the state (Task 7), Z in the Settings list (Task 6). Final checks (Task 8). Screenshots: the tag and the aim line (Task 8 Steps 7, 9).
- §6: the laser never hits torpedoes (Task 3); Valkyrn and the sector out of scope (Decision 14); no mode change affects a burst already fired (Decision 5).
- §7: W-2 only, with the owner's look check (Task 8 Step 9).

**2. Placeholder scan:** every code step carries complete code. The values that cannot be known before running come from explicit commands with an exact rule: the bless and oracle lines, the gate numbers (recorded in Task 1's commit message and compared character for character in Task 8), and the gates entry's numbers (Steps 1 to 4's output). No knob is tuned, and no pin is re-pinned.

**3. Type consistency:** `ShipSystems.laserManual: boolean` and `laserAim: number` (Task 2) are read in Tasks 3 to 7; `ShipInput.laserFire: number` (Task 2) is set by the step (Task 4) and read by `applyWeaponsInput` (Task 3); `manualLaserReady(state, i)` (Task 2) is used in Tasks 3, 4, 5 and 6; `LASER_ARC_STEPS` (Task 2) in Tasks 3 and 5; `laserStrike`, `shootAlong` and `fireLaserAlong` are private to `weapons.ts` (Task 3); the commands `laserMode {manual}` and `laserFire {aim, aimAcc}` (Task 4) are sent in Task 6; `MapRequests.aimLaser`, `laserAim` and `resetLaserAim` (Task 5) are used in Tasks 5 and 6; `CombatModelInput.laserAim` and `CombatDraw.laserAim` (Task 5); `KeyAction 'laserMode'` (Task 6) is pressed by the tag (Task 7); `refusal(d, control, manual?)` (Task 6); `manualCardReason` and `WeaponsPanel.laserManual` (Task 7); `DuelRuntimeDeps.laserAim` (Task 6), wired in `duelMode.ts` (Task 6).
