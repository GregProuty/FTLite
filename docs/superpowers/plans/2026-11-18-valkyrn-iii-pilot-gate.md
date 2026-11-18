# Valkyrn Part iii: the scripted pilot, the round-length gate and tuning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic scripted Valkyrn pilot (one character: sits at the Flight seat, aims at the lead pip, fires the minigun in bursts under the heat limit, launches torpedoes, stands up to repair a level-2 Room and comes back) and a duelGates block that holds the Valkyrn to the Hound's standard: over seeds 1 to 10 the median round lasts 3 to 5 minutes and the Hunter wins at least one. The gun counters and the Valkyrn hull are tuned until the gate passes, and the numbers are recorded. The Hound's goldens and gate numbers do not move.

**Architecture:** A sim-side pure lead helper, `sim/tactical/lead.ts`, provides `interceptTime`, `leadOffset` and `nearestHeading`, all trig-free. A test pins it equal to Part ii's view `render/duel/leadModel.ts` `leadPip`. The pilot is a new file, `sim/duel/scriptedPilot.ts`, inside the determinism guard. It reuses the scripted pair's walking, sitting, repair-reach and hazard helpers from `sim/duel/scripted.ts`: they are exported, and the pair's orbit block is extracted into `orbitSteer`, a pure refactor proved by `duel-oracle same`. A test helper, `tests/helpers/valkyrnGate.ts`, runs a crew-of-one duel and prints a Valkyrn telemetry line, because `telemetryLine` reads `players[1]`. The tuning tool `scripts/valkyrn-telemetry.ts` runs the gate and sweeps the counters in process. The gate is a new `describe` block in `tests/duelGates.test.ts`. The tuning edits only Valkyrn data: the gun counters, which only gun rounds read, and `VALKYRN_HULL`. So the Hound's oracle and canonical trace stay `same` at SIM_VERSION 53, and there is no version bump.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, tsx for scripts, the deterministic duel sim (`sim/duel/*`, `sim/tactical/*`).

**Spec:** `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md`: §6.1 (the class numbers), §6.2 (aim), §7.1–7.2 (the gun and its counters), §4.4 (the out-of-seat rule) and §10 Gate. The shared contract is `valkyrn-contract.md`, the "Part iii produces" list. Precedents:
- the scripted pair and its gate: `sim/duel/scripted.ts`, `tests/duelGates.test.ts`;
- recorded tuning: `docs/superpowers/specs/2026-11-17-weapons-update-design.md` header (HUNTER_HULL 70, "at 70 it is 217 s, 8 wins, 2 losses") and `docs/superpowers/specs/2026-11-17-ftl-targeting-design.md` §4 "As built" (`MISSILE_GAP` 900 → 1500);
- the format: `docs/superpowers/plans/2026-11-18-sci-2-crew-of-four.md`.

**Branch and worktree:** branch `valkyrn`, worktree `.worktrees/valkyrn`, after Parts i and ii are committed on it. The controller made the worktree and its junctions (`node_modules`, `services\signalling\node_modules`, `.art`, `public\assets\paid`); executors do not. Every command runs from `C:\Users\djuar\FTLite\.worktrees\valkyrn`. The golden baselines check their `cwd`, so record them there.

## Global Constraints

- **No SIM_VERSION change.** Part i set it to 53. Before Task 1, run `git grep -n "SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`. It must read `export const SIM_VERSION = 53;`. If it does not, stop and report.
- **The Hound does not move.** Task 1 Step 1 records both baselines at 53. Tasks 1, 2 and 4 each end with these two commands passing:
  - `npx tsx scripts/golden/duel-oracle.ts same`;
  - `npx tsx scripts/golden/canonical-trace.ts same`.

  The oracle runs every tick of the ten gate seeds, scripted and passive, plus the rematch run, all on the Hound (Cutter class; `scripts/golden/duelOracle.ts:48-54`). So `same` passing proves that the Hound's duelGates numbers are unchanged too. The existing three tests in `tests/duelGates.test.ts` are never edited.
- **Generated files come only from `npm run bless`:** `tests/golden/basic.json`, `duel-1.json`, `duel-rematch.json`, `tests/fixtures/determinism-v2.json`. Never edit them by hand. Never pass `--fresh`. No bless is planned. If a `same` fails, a Hound run changed, which is a bug in this part: find it and fix it. Do not bless past it. The only exception is the case in Task 4 Step 9.
- **The gate bands are fixed:** median 180–300 s, and the Hunter wins at least 1 of 10. Tuning changes only these:
  - `GUN_HITS_PER_LAYER`, `GUN_HITS_PER_HULL`, `GUN_HITS_PER_LEVEL` and `VALKYRN_HULL` (in `sim/tactical/tuning.ts`);
  - the pilot's own `PILOT_*` numbers, as `MISSILE_GAP` was tuned for the pair.

  If nothing passes, stop and report the sweep lines.
- **The sim's rules:**
  - only + − × ÷, `Math.sqrt`, `abs`, `min`, `max`, `floor`, `sign` and `round` in `src/renderer/src/sim/**` (`tests/helpers/determinismGuard.ts`); no trig;
  - no randomness at all in the pilot (it has no rng stream; the duel's own seeded rng is untouched);
  - no ship-id literals in `src/` (`tests/noShipIdLiterals.test.ts`).
- **Git:**
  - never `git add -A`, `git add .` or `git stash`; stage by name;
  - each commit message ends with a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, passed below as a second `-m`;
  - files are UTF-8.
- **Test commands:**
  - targeted runs use `npx vitest run <files>`;
  - `npx tsc -b`;
  - the full suite is `npx vitest run --maxWorkers=4`, always run after `npx electron-vite build`;
  - `npm run test:duel-app-runtime`;
  - never run two vitest processes at once;
  - the slow gate files can time out under load, so rerun a failing one alone before calling it a failure.
- **Comment style:** a header comment citing the spec section on each new file, a doc comment on each export, and "Valkyrn spec §x" on changed lines that need a reason.

## Decisions where the spec leaves room, and where the code forces a choice

Line numbers are taken at master `ed2650b8`, before Sci-2 and Parts i and ii. Re-find them by the quoted text if they have moved.

1. **The lead maths lives in the sim, in `sim/tactical/lead.ts`, and the view is not changed.**
   - The pilot may not import `render/duel/leadModel.ts`: the determinism guard forbids `render/` imports in `sim/**`. The view may import the sim (`render/duel/consoleModel.ts:6-12` already does), but Part ii is done, so `leadModel.ts` is left as it is.
   - `tests/valkyrnLead.test.ts` pins `leadOffset` equal to `leadPip` (to 1e-6) over a fixed table of cases.
   - The formula is the constant-velocity intercept in the shooter's frame: rounds inherit the ship's velocity (spec §7.1), so the round speed relative to the shooter is the gun's speed. It solves `|r + v·t| = speed·t` for the smallest positive `t`.
   - If the agreement test fails, read both. Fix whichever one breaks spec §7.4 ("from the relative position and velocity and the round's speed"). A view fix goes in Task 1's commit and is named in the report.
2. **The nose bearing is chosen without trig:** `nearestHeading(dx, dy)` is the index `h` in 0..255 that maximises `hx(h)·dx + hy(h)·dy`, with the strictly greater value winning, so the lowest index wins a tie. A zero vector gives −1. That is 256 dot products a tick, the same cost as one `queryGrid`. `hunter.ts:31` `autoFaceTurn` is not reused: it aims at a fixed `HUNTER_LEAD_S` lead, not at an intercept.
3. **The pilot is a sibling file, not more branches in `scriptedInput`.** `scripted.ts:226,278-321` is the pair's two-player loop, which Sci-2 left at two (Sci-2 plan Decision 15). The pilot is `sim/duel/scriptedPilot.ts`.
   - It imports the pair's helpers, which become exports with unchanged bodies: `hazardAway` (`scripted.ts:85`), `walkTo` (`:191`), `canSit` (`:208`), `inRepairReach` (`:217`) and `roomTiles` (`:252`).
   - The orbit block of `helmAxes` (`scripted.ts:120-134`) moves verbatim into `export function orbitSteer(d, orbitR)`, which returns `{ turn, thrust, dx, dy }`. `helmAxes` calls it. The arithmetic and its order are unchanged, so `same` proves it.
4. **The pilot steers only by `aim`** (spec §5.1: the Flight seat sends no A/D, no `face` and no `heading`). Its order of rules follows the pair's Helm (`scripted.ts:103`):
   1. avoid a hazard on the predicted path: aim away, full throttle;
   2. dodge an inbound torpedo inside `EVADE_RANGE`: aim square across its line of approach, full throttle;
   3. when the Hunter is farther than `PILOT_ENGAGE_RANGE`, orbit at the fixed radius `PILOT_ORBIT_R` using `orbitSteer`;
   4. otherwise attack: aim at the lead offset, and throttle with a closing-speed controller toward `PILOT_STAND_RANGE`.

   The hazard prediction flies the last tick's aim turn (`aimTurn(heading, lastAim)`, from Part i's `sim/duel/step.ts`) at the throttle's thrust, as the pair predicts with its last turn (`scripted.ts:105`). The orbit radius is a fixed 1850, the middle of `ORBIT_MIN..ORBIT_MAX`, not a draw, so the pilot has no rng.
5. **Bursts** use hysteresis on `systems[0].gunHeat`:
   - `cooling` is set when the heat reaches `PILOT_HEAT_RELEASE = 0.8 × GUN_HEAT_MAX` or `gunLocked` is true;
   - it clears when the heat is exactly 0.

   `gunHeld` is held while `!cooling` and the shot is on: a lead exists, the lead offset is within `PILOT_FIRE_RANGE` (560, inside the about 607 u reach), it is ahead of the nose, and its perpendicular distance from the nose line is no more than `SHIP_RADIUS`. The gun never reaches its lockout under this rule. A lockout can still come from Weapons level 1 halving the cooling, and the `gunLocked` term covers that case.
6. **Torpedoes** use the manual `missileLaunch` command (spec §5.1 right mouse), sent only when `canLaunch(t, 0)` and `PILOT_MISSILE_GAP` ticks (start 1500, as `MISSILE_GAP`) have passed since the last launch. The pilot never sends `torpLock`, and its torpedo homes by itself (homing torpedo spec).
7. **Repair:** while seated, the pilot leaves only for a Room at level 2, choosing in Room order (Weapons, Shields, Engines), which also ends gun fire at Weapons level 2. Once standing, it works that Room down to 0, as the pair does (`scripted.ts:225`), then sits again.
   - On the tick it stands it sends `throttle` to `PILOT_AWAY_THROTTLE` (0) if the throttle differs, then `stand`, in that order. Away from the seat, `helmHoldsUnattended` coasts the ship on its last aim, which `holdHeading` keeps (spec §4.4).
   - The pair's heal rule is copied: below `HURT_HEALTH`, with nothing to repair, it goes to the Medbay and stays until full. At n = 1 a downed pilot loses the round (spec §4.4).
8. **The gate helper is a new file, `tests/helpers/valkyrnGate.ts`.** `telemetryLine` (`tests/helpers/scriptedDuel.ts:75-84`) reads `t.players[1]!`, which is undefined at n = 1. `requireApplied` (`scriptedDuel.ts:39`) becomes an export, so every pilot command must be applied, as the pair's are. The gun counts come from `systems[0].gunShots` / `gunHits`, read before `disposeDuel`; `ShipTelemetry` has no gun fields and this part adds none.
9. **The per-seed checks** mirror the Hound's (`tests/duelGates.test.ts:12-20`):
   - the round ends before the cap;
   - the pilot fires the gun at least once and launches at least one torpedo;
   - no planet-contact end under 30 s.

   The aggregate: median 180–300 s, the Hunter wins ≥ 1, no run at the cap. "Crew both wins and loses" becomes "the Hunter wins at least one" (spec §10). A crew win is reported but not gated.
10. **The sweep mutates the Valkyrn's defs in process.** `GunDef` and `ShipClassDef` are `readonly` in type only; Task 1 Step 3 checks that they are not frozen. The sim reads the counters from the class's `GunDef` (contract: `GunDef` carries `hitsPerLayer`/`hitsPerHull`/`hitsPerLevel`) and the hull from the class at `systemsFor`. So overwriting `GUN` and `SHIP_CLASSES[ShipClass.Valkyrn]` before `createDuel` moves only Valkyrn duels. Nothing is written to disk. The chosen values are then written into `tuning.ts` by hand.
11. **There is no version bump for the tuning.** The changed constants are read only by gun rounds, and the Valkyrn class and the Hound never fire them; the oracle `same` is the proof. One cost is accepted: a Valkyrn solo recording made at 53 between Part i and this commit would not replay the same. No such recording is released, and spec §2.6 keeps the Valkyrn single player.
12. **The validator's gun bounds must follow the counters.** Spec §7.3 gives "wear 0..7, hull 0..2, room wear 0..5", which are `hitsPer* − 1` at the start values. Task 1 Step 3 greps `hash.ts`/`snapshot.ts`. If Part i wrote literals, they are replaced by maxima over the non-null gun slots (as the laser maxima are), with no change to any hash. Without that, a tuned `GUN_HITS_PER_LAYER` of 10 would reject a valid Valkyrn snapshot.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/renderer/src/sim/tactical/lead.ts` | create (T1) | `interceptTime`, `leadOffset`, `nearestHeading`: the pure lead maths |
| `src/renderer/src/sim/duel/scripted.ts` | modify (T1) | export `hazardAway`, `walkTo`, `canSit`, `inRepairReach`, `roomTiles`; extract `orbitSteer` |
| `src/renderer/src/sim/duel/scriptedPilot.ts` | create (T2) | the scripted Valkyrn pilot |
| `tests/valkyrnLead.test.ts` | create (T1) | the intercept, `nearestHeading`, agreement with `leadPip` |
| `tests/scriptedPilot.test.ts` | create (T2) | sit, aim, bursts, launch, repair and return, determinism |
| `tests/helpers/scriptedDuel.ts` | modify (T3) | export `requireApplied` |
| `tests/helpers/valkyrnGate.ts` | create (T3) | `runValkyrnDuel`, `valkyrnLine`, `valkyrnGate` |
| `scripts/valkyrn-telemetry.ts` | create (T3) | the tuning tool: gate run and in-process sweep |
| `tests/duelGates.test.ts` | modify (T4) | a new `describe` block, the Valkyrn gate |
| `src/renderer/src/sim/tactical/tuning.ts` | modify (T4) | the chosen `GUN_HITS_*` and `VALKYRN_HULL` with their gate comments |
| `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md` | modify (T4) | new §12 "As built" |

---

### Task 1: Pre-flight, baselines, the sim lead helper and the pair's helpers

**Files:**
- Create: `src/renderer/src/sim/tactical/lead.ts`, `tests/valkyrnLead.test.ts`
- Modify: `src/renderer/src/sim/duel/scripted.ts`

**Interfaces:**
- Consumes: Part i's `GunDef.speed`, `classOf`, `ShipClass.Valkyrn`, `createTacticalState(seed, slots, crewClass)`, `aimTurn`. Part ii's `leadPip`.
- Produces:
  - `interceptTime(rx, ry, vx, vy, speed): number` (s, or −1);
  - `leadOffset(state, i): { x: number; y: number } | null` (relative to ship i);
  - `nearestHeading(dx, dy): number` (0..255, or −1);
  - exported `hazardAway`, `walkTo`, `canSit`, `inRepairReach`, `roomTiles`, `orbitSteer(d, orbitR): Axes & { dx: number; dy: number }`.

- [ ] **Step 1: Record the Hound baselines at 53.**

```
npx tsx scripts/golden/canonical-trace.ts baseline
npx tsx scripts/golden/duel-oracle.ts baseline
```
Expected: `baseline at sim version 53: …` and `duel oracle baseline at sim version 53: 21 runs, …`. Every later `same` in Tasks 1, 2 and 4 compares against these. Do not re-record them later.

- [ ] **Step 2: Pre-flight names.** Run:

```
git grep -n "LOCAL_CREW_MIN\|crewClass: number" -- src/renderer/src/sim/duel/state.ts
git grep -n "aim?: number\|gunHeld?: boolean" -- src/renderer/src/net/contracts.ts
git grep -n "function aimTurn" -- src/renderer/src/sim/duel/step.ts
git grep -n "GUN_HITS_PER_LAYER\|GUN_HITS_PER_HULL\|GUN_HITS_PER_LEVEL\|VALKYRN_HULL\|GUN_HEAT_MAX" -- src/renderer/src/sim
git grep -n "export function leadPip" -- src/renderer/src/render/duel/leadModel.ts
git grep -n "helmHoldsUnattended" -- src/renderer/src/sim/ship/valkyrn.json
```
Expected:
- each name is found;
- the `GUN_HITS_*` and `VALKYRN_HULL` names are found only in `sim/tactical/tuning.ts` and `sim/tactical/defs.ts`.

If `GUN_HITS_*` is also read in `sim/tactical/gun.ts`, change those reads to the class's def (`classOf(state, i).slots.gun!.hitsPerLayer` and so on), which gives the same values and the same hashes, so that Decision 10's sweep can move them.

If `aimTurn` is found but not exported, add `export`. If any other name is missing, stop and report: Parts i and ii are not on the branch.

- [ ] **Step 3: Pre-flight the defs and the validator bounds.**

```
npx tsx --eval "import('./src/renderer/src/sim/tactical/defs.ts').then((m) => console.log('frozen', Object.isFrozen(m.GUN), Object.isFrozen(m.SHIP_CLASSES[m.ShipClass.Valkyrn]), 'same gun', m.SHIP_CLASSES[m.ShipClass.Valkyrn].slots.gun === m.GUN))"
git grep -n "gunWear\|gunHull\|gunRoomWear" -- src/renderer/src/sim/duel/hash.ts src/renderer/src/sim/duel/snapshot.ts
```
Expected: `frozen false false` (`same gun` may be either; the sweep sets both).
- If either def is frozen, the sweep in Task 3 cannot run in process. Use Task 4's manual loop instead: edit `tuning.ts`, run the gate tool, and revert.
- If the bounds are number literals (7, 2, 5), replace each with the def maximum less one, taken over the classes whose `slots.gun` is not null, written like the laser maxima beside them. Then run `npx vitest run tests/snapshot.test.ts tests/duelSnapshot.test.ts` (whichever exist: `git ls-files tests | grep -i snapshot`). The result: pass.

- [ ] **Step 4: Write the failing lead tests.** Create `tests/valkyrnLead.test.ts`:

```ts
// Valkyrn spec §7.4 and §10 (Lead pip): the sim's lead maths (sim/tactical/lead.ts), which the scripted pilot aims with,
// agrees with the view's lead pip (render/duel/leadModel.ts), which the player aims with.
import { describe, expect, it } from 'vitest';
import { leadPip } from '../src/renderer/src/render/duel/leadModel';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { interceptTime, leadOffset, nearestHeading } from '../src/renderer/src/sim/tactical/lead';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { GUN_SPEED, HEADING_COUNT } from '../src/renderer/src/sim/tactical/tuning';

/** A two-ship state, the gun Valkyrn in slot 0, with the given relative pose. */
function pose(rx: number, ry: number, svx: number, svy: number, tvx: number, tvy: number): TacticalState {
  const st = createTacticalState(7, 2, ShipClass.Valkyrn), [s, t] = st.ships;
  s!.x = 100; s!.y = -40; s!.vx = svx; s!.vy = svy;
  t!.x = 100 + rx; t!.y = -40 + ry; t!.vx = tvx; t!.vy = tvy;
  return st;
}

/** The view's pip as an offset from ship 0, or null. Part ii's signature: read render/duel/leadModel.ts and keep this
 *  adapter the only place that knows it. If leadPip takes (state, i) and returns a world point, this is right as is. */
function viewOffset(st: TacticalState): { x: number; y: number } | null {
  const p = leadPip(st, 0) as { x: number; y: number } | null;
  return p ? { x: p.x - st.ships[0]!.x, y: p.y - st.ships[0]!.y } : null;
}

const CASES: [number, number, number, number, number, number][] = [];
for (let k = 0; k < 40; k++) {   // a fixed spread: ranges 60..600, crossing, closing and opening targets, a moving shooter
  const r = 60 + 13.5 * k, h = (k * 37) % HEADING_COUNT, g = (k * 91 + 11) % HEADING_COUNT;
  CASES.push([r * hx(h), r * hy(h), (k % 5) * 12 - 24, (k % 3) * -15, 180 * hx(g), 180 * hy(g)]);
}

describe('the sim lead helper', () => {
  it('interceptTime: a target at rest straight ahead is met at range / speed', () => {
    expect(interceptTime(350, 0, 0, 0, 700)).toBeCloseTo(0.5, 12);
  });
  it('interceptTime: the met point is on the round circle (|r + v t| = speed t)', () => {
    for (const [rx, ry, , , vx, vy] of CASES) {
      const t = interceptTime(rx, ry, vx, vy, GUN_SPEED);
      expect(t).toBeGreaterThan(0);
      const x = rx + vx * t, y = ry + vy * t;
      expect(Math.sqrt(x * x + y * y)).toBeCloseTo(GUN_SPEED * t, 6);
    }
  });
  it('interceptTime: a target running away faster than the round gives −1', () => {
    expect(interceptTime(300, 0, 900, 0, 700)).toBe(-1);
  });
  it('nearestHeading returns every heading index from its own direction, and −1 for no direction', () => {
    for (let h = 0; h < HEADING_COUNT; h++) expect(nearestHeading(5 * hx(h), 5 * hy(h))).toBe(h);
    expect(nearestHeading(0, 0)).toBe(-1);
  });
  it('leadOffset is relative to the shooter and uses the relative velocity (rounds inherit the ship velocity)', () => {
    const st = pose(400, 0, 50, 0, 50, 120), o = leadOffset(st, 0)!, t = interceptTime(400, 0, 0, 120, GUN_SPEED);
    expect(o.x).toBeCloseTo(400, 9); expect(o.y).toBeCloseTo(120 * t, 9);
  });
  it('agrees with the view lead pip (render/duel/leadModel.ts) over the fixed table', () => {
    for (const c of CASES) {
      const st = pose(...c), sim = leadOffset(st, 0), view = viewOffset(st);
      expect(view === null, JSON.stringify(c)).toBe(sim === null);
      if (sim && view) { expect(view.x, JSON.stringify(c)).toBeCloseTo(sim.x, 6); expect(view.y, JSON.stringify(c)).toBeCloseTo(sim.y, 6); }
    }
  });
});
```
Run `npx vitest run tests/valkyrnLead.test.ts`. Expected: FAIL (`lead.ts` is missing).

- [ ] **Step 5: Write `src/renderer/src/sim/tactical/lead.ts`.**

```ts
// The minigun's lead (Valkyrn spec §7.4): where to point the nose so a round fired now meets the target, for a target
// holding its velocity. Pure and trig-free (+ − × ÷ and sqrt only), so the scripted pilot (sim/duel/scriptedPilot.ts)
// can aim with it; tests/valkyrnLead.test.ts pins it equal to the view's pip (render/duel/leadModel.ts).
import { hx, hy } from './direction';
import { classOf, type TacticalState } from './state';
import { HEADING_COUNT } from './tuning';

/** The time (s) at which a round fired now at `speed` (u/s, relative to the shooter) meets a target at relative position
 *  (rx, ry) moving at relative velocity (vx, vy): the smallest positive root of |r + v·t| = speed·t, or −1 for none. */
export function interceptTime(rx: number, ry: number, vx: number, vy: number, speed: number): number {
  const a = vx * vx + vy * vy - speed * speed, b = 2 * (rx * vx + ry * vy), c = rx * rx + ry * ry;
  if (Math.abs(a) < 1e-9) {   // the target's relative speed equals the round's: the equation is linear
    if (b >= 0) return -1;
    const t = -c / b;
    return t > 0 ? t : -1;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc), t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
  const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
  return lo > 0 ? lo : hi > 0 ? hi : -1;
}

/** Ship i's lead on its locked target, as an offset from ship i (the direction to point the nose), or null: no gun,
 *  no active target, or no intercept. Rounds inherit the ship's velocity (spec §7.1), so the relative velocity is used. */
export function leadOffset(state: TacticalState, i: number): { x: number; y: number } | null {
  const gun = classOf(state, i).slots.gun, j = state.systems[i]!.target, me = state.ships[i]!, t = state.ships[j];
  if (!gun || !t || !t.active || j === i) return null;
  const rx = t.x - me.x, ry = t.y - me.y, vx = t.vx - me.vx, vy = t.vy - me.vy, tl = interceptTime(rx, ry, vx, vy, gun.speed);
  return tl < 0 ? null : { x: rx + vx * tl, y: ry + vy * tl };
}

/** The heading index nearest the direction (dx, dy): the largest dot product with the heading table, the lowest index
 *  on a tie; −1 for the zero vector. */
export function nearestHeading(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return -1;
  let best = 0, bestDot = hx(0) * dx + hy(0) * dy;
  for (let h = 1; h < HEADING_COUNT; h++) {
    const dot = hx(h) * dx + hy(h) * dy;
    if (dot > bestDot) { best = h; bestDot = dot; }
  }
  return best;
}
```
Run `npx vitest run tests/valkyrnLead.test.ts tests/determinismGuard.test.ts`.
- Expected: PASS.
- If only the agreement test fails, apply Decision 1. If `leadPip`'s signature differs, fix the adapter `viewOffset` alone. The adapter must reach the same quantity, the pip as an offset from ship 0.

- [ ] **Step 6: Export the pair's helpers and extract `orbitSteer`.** In `src/renderer/src/sim/duel/scripted.ts`:
  - Add `export` to `function hazardAway`, `function walkTo`, `function canSit`, `function inRepairReach` and `function roomTiles`. Bodies unchanged.
  - Replace the orbit block at the end of `helmAxes`, from the comment `// Orbit: t is the prograde tangent` through `return { turn, thrust };`, with:

```ts
  const o = orbitSteer(d, pair.orbitR);
  return { turn: o.turn, thrust: o.thrust };
}

/** The Helm's orbit (spec §3), shared with the Valkyrn pilot (sim/duel/scriptedPilot.ts): the desired direction (dx, dy),
 *  unit, and the turn and thrust that fly it. t is the prograde tangent (the way the ship already circles, clockwise at
 *  rest); tilt it toward the planet when outside `orbitR` and away when inside, by at most 30°. */
export function orbitSteer(d: DuelState, orbitR: number): Axes & { dx: number; dy: number } {
  const s = d.tactical.ships[0];
  const r = len(s.x, s.y), ux = r > 0 ? s.x / r : 0, uy = r > 0 ? s.y / r : -1;
  const cw = s.x * s.vy - s.y * s.vx >= 0, tx = cw ? -uy : uy, ty = cw ? ux : -ux;
  const tilt = Math.max(-TAN_30, Math.min(TAN_30, ORBIT_GAIN * (r - orbitR)));
  let dx = tx - ux * tilt, dy = ty - uy * tilt;
  const dl = len(dx, dy); dx /= dl; dy /= dl;
  const nose = hx(s.heading) * dx + hy(s.heading) * dy;
  const turn = nose >= COS_STEP ? 0 : turnToward(s.heading, dx, dy);
  const speed = len(s.vx, s.vy), vc = circularSpeed(r);
  let thrust = 0;
  if (nose < COS_45) thrust = 0;
  else if (speed > vc + SPEED_SLACK) thrust = -1;
  else if (speed < vc - SPEED_SLACK || s.vx * dx + s.vy * dy < COS_10 * speed) thrust = 1;
  return { turn, thrust, dx, dy };
}
```
(If tsc reports `d.tactical.ships[0]` as possibly undefined, write it as `helmAxes` does, `const t = d.tactical, s = t.ships[0]`, because the original compiled.) Then run:

```
npx tsc -b
npx vitest run tests/valkyrnLead.test.ts tests/determinismGuard.test.ts tests/duelTelemetry.test.ts
npx tsx scripts/golden/duel-oracle.ts same
npx tsx scripts/golden/canonical-trace.ts same
```
Expected:
- no tsc errors;
- the tests pass;
- `duel oracle: 21 runs, … identical at every tick …`, and the trace `same` passes.

- [ ] **Step 7: Commit.**

```
git add src/renderer/src/sim/tactical/lead.ts src/renderer/src/sim/duel/scripted.ts tests/valkyrnLead.test.ts
git commit -m "feat(sim): lead helper for the minigun and shared scripted helpers (Valkyrn iii)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Add `src/renderer/src/sim/tactical/gun.ts`, `hash.ts`/`snapshot.ts`, `step.ts` or `render/duel/leadModel.ts` by name only if Steps 2, 3 or 5 changed them.)

---

### Task 2: The scripted Valkyrn pilot

**Files:**
- Create: `src/renderer/src/sim/duel/scriptedPilot.ts`, `tests/scriptedPilot.test.ts`

**Interfaces:**
- Consumes: Task 1's helpers; `createDuel(layout, seed, 0, 1)`; `HeldInput.aim` / `gunHeld`; `systems[0].gunHeat` / `gunLocked`; `d.holdHeading`; `canLaunch`.
- Produces: `ScriptedPilot`, `createScriptedPilot()`, `scriptedPilotInput(p, d): DuelInput`, and the `PILOT_*` constants (Task 4 may retune them).

- [ ] **Step 1: Write the failing tests.** Create `tests/scriptedPilot.test.ts`:

```ts
// The scripted Valkyrn pilot (Valkyrn spec §10 Gate): sits at the Flight seat, aims at the lead, fires in bursts under
// the heat limit, launches torpedoes, stands to repair a level-2 Room and comes back, deterministically.
import { describe, expect, it } from 'vitest';
import valkyrn from '../src/renderer/src/sim/ship/valkyrn.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Seated } from '../src/renderer/src/sim/components';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createScriptedPilot, PILOT_HEAT_RELEASE, scriptedPilotInput, type ScriptedPilot } from '../src/renderer/src/sim/duel/scriptedPilot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createTelemetry } from '../src/renderer/src/sim/duel/telemetry';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { leadOffset, nearestHeading } from '../src/renderer/src/sim/tactical/lead';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { GUN_HEAT_MAX } from '../src/renderer/src/sim/tactical/tuning';

const VALKYRN = parseShip(valkyrn);
const seated = (d: DuelState): boolean => Seated.station[d.interior.crew[0]!]! >= 0;

/** Step the pilot until `done` or `max` ticks; every command must be applied. Returns the ticks taken. */
function fly(d: DuelState, p: ScriptedPilot, done: () => boolean, max: number): number {
  for (let k = 0; k < max; k++) {
    if (done()) return k;
    const input = scriptedPilotInput(p, d);
    for (const r of stepDuelTick(d, input)) expect(r.status, JSON.stringify(r)).toBe('applied');
  }
  throw Error(`not done in ${max} ticks`);
}

/** The Hunter placed `range` u dead ahead of the crew ship, at the crew ship's velocity. */
function hunterAhead(d: DuelState, range: number): void {
  const s = d.tactical.ships[0]!, e = d.tactical.ships[1]!;
  e.x = s.x + hx(s.heading) * range; e.y = s.y + hy(s.heading) * range; e.vx = s.vx; e.vy = s.vy;
}

describe('the scripted Valkyrn pilot', () => {
  it('runs a crew of one: one held input, one telemetry player', () => {
    const d = createDuel(VALKYRN, 1, 0, 1);
    try {
      expect(scriptedPilotInput(createScriptedPilot(), d).held).toHaveLength(1);
      expect(createTelemetry(d).players).toHaveLength(1);
    } finally { disposeDuel(d); }
  });
  it('walks from the Ops spawn to the Flight seat and sits within 20 s, then sends an aim every tick', () => {
    const d = createDuel(VALKYRN, 1, 0, 1), p = createScriptedPilot();
    try {
      fly(d, p, () => seated(d), 1200);
      const aim = scriptedPilotInput(p, d).held[0]!.aim!;
      expect(Number.isInteger(aim) && aim >= 0 && aim < 256).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('aims at the lead pip when the Hunter is within the engage range', () => {
    const d = createDuel(VALKYRN, 2, 0, 1), p = createScriptedPilot();
    try {
      fly(d, p, () => seated(d), 1200);
      const s = d.tactical.ships[0]!, e = d.tactical.ships[1]!;
      e.x = s.x + 400; e.y = s.y; e.vx = s.vx; e.vy = s.vy + 60;
      const o = leadOffset(d.tactical, 0)!;
      expect(scriptedPilotInput(p, d).held[0]!.aim).toBe(nearestHeading(o.x, o.y));
    } finally { disposeDuel(d); }
  });
  it('fires in bursts: releases at 80% heat, holds off while cooling, resumes at 0', () => {
    const d = createDuel(VALKYRN, 3, 0, 1), p = createScriptedPilot();
    try {
      fly(d, p, () => seated(d), 1200);
      hunterAhead(d, 300);
      const sys = d.tactical.systems[0];
      expect(PILOT_HEAT_RELEASE).toBe(0.8 * GUN_HEAT_MAX);
      sys.gunHeat = 0; expect(scriptedPilotInput(p, d).held[0]!.gunHeld).toBe(true);
      sys.gunHeat = PILOT_HEAT_RELEASE; expect(scriptedPilotInput(p, d).held[0]!.gunHeld).toBe(false);
      sys.gunHeat = 400; expect(scriptedPilotInput(p, d).held[0]!.gunHeld).toBe(false);
      sys.gunHeat = 0; expect(scriptedPilotInput(p, d).held[0]!.gunHeld).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('launches a torpedo when it can, then waits the gap', () => {
    const d = createDuel(VALKYRN, 4, 0, 1), p = createScriptedPilot();
    try {
      fly(d, p, () => seated(d), 1200);
      hunterAhead(d, 300);
      const launches = (): number => scriptedPilotInput(p, d).commands.filter((e) => e.command.kind === 'missileLaunch').length;
      expect(launches()).toBe(1);
      expect(launches()).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('stands to repair a level-2 Room, keeps the ship on its last aim, repairs it to 0 and sits again', () => {
    const d = createDuel(VALKYRN, 5, 0, 1), p = createScriptedPilot();
    try {
      fly(d, p, () => seated(d), 1200);
      fly(d, p, () => p.aim >= 0, 5);
      d.tactical.systems[0].rooms[Room.Weapons] = 2;
      const first = scriptedPilotInput(p, d);
      expect(first.commands.map((e) => e.command.kind).at(-1)).toBe('stand');
      for (const r of stepDuelTick(d, first)) expect(r.status).toBe('applied');
      expect(seated(d)).toBe(false);
      expect(d.holdHeading).toBe(p.aim);
      fly(d, p, () => d.tactical.systems[0].rooms[Room.Weapons] === 0, 3600);
      fly(d, p, () => seated(d), 1200);
      expect(d.tactical.outcome).toBe(Outcome.Running);
    } finally { disposeDuel(d); }
  });
  it('is deterministic: two runs of 3000 ticks hash the same', () => {
    const run = (): string => {
      const d = createDuel(VALKYRN, 6, 0, 1), p = createScriptedPilot();
      try { fly(d, p, () => d.tactical.outcome !== Outcome.Running || d.interior.tick >= 3000, 3001); return hashDuel(d); } finally { disposeDuel(d); }
    };
    expect(run()).toBe(run());
  });
});
```
Run `npx vitest run tests/scriptedPilot.test.ts`. Expected: FAIL (the module is missing).

(Notes for the executor:
- If Part i typed `createDuel`'s crew as a union without 1, the literal `1` still type-checks against `1 | 2 | 3 | 4`.
- If the snapshot types make `systems[0]` a tuple element, `d.tactical.systems[0].rooms` compiles as in `scripted.ts:225`.)

- [ ] **Step 2: Write `src/renderer/src/sim/duel/scriptedPilot.ts`.**

```ts
// The scripted Valkyrn pilot (Valkyrn spec §10 Gate): a deterministic headless crew of one, for tests and telemetry only,
// never offered as a seat. Each tick it reads the duel and returns that tick's held input and commands. Seated at the
// Flight seat (Navigation + Weapons, spec §5) it steers by `aim` only (spec §5.1): avoid, dodge, orbit until the Hunter is
// near, then attack the lead pip (sim/tactical/lead.ts) with the minigun in bursts under the heat limit and the torpedo
// when it can. It stands to repair a level-2 Room; the layout's helmHoldsUnattended flies the ship meanwhile (spec §4.4).
// It lives under sim/ so the determinism guard covers it, and it draws no random numbers at all.
import type { HeldInput } from '../../net/contracts';
import { Health, Life, LifeState, Position, Seated } from '../components';
import { roomAt } from '../grid';
import { hx, hy } from '../tactical/direction';
import { leadOffset, nearestHeading } from '../tactical/lead';
import { missileOf, Room, targetOf } from '../tactical/state';
import { GUN_HEAT_MAX, SHIP_RADIUS } from '../tactical/tuning';
import { canLaunch } from '../tactical/weapons';
import { HEALTH_MAX } from '../tuning';
import { medbayOnline, medbayRoom } from './health';
import { LOCAL_DUEL_RUN, type DuelCommand, type DuelEnvelope } from './commands';
import { canSit, EVADE_RANGE, goalTiles, hazardAway, HURT_HEALTH, inRepairReach, orbitSteer, roomTiles, SPEED_SLACK, walkTo } from './scripted';
import type { DuelState } from './state';
import { aimTurn, type DuelInput } from './step';
import { THROTTLE_MAX, THROTTLE_MIN, throttleThrust } from './throttle';

// The pilot's own numbers (tuned with the Valkyrn gate, spec §12), separate from the game tuning.
/** The orbit radius it holds while the Hunter is far: the middle of the pair's ORBIT_MIN..ORBIT_MAX, fixed (no rng). */
export const PILOT_ORBIT_R = 1850;
/** Within this range of the Hunter it stops orbiting and attacks (u). */
export const PILOT_ENGAGE_RANGE = 900;
/** The range the attack's throttle closes to and holds (u): inside the torpedo's 360. */
export const PILOT_STAND_RANGE = 300;
/** The attack's wanted closing speed per unit of range error (1/s), clamped to ±PILOT_MAX_CLOSE (u/s). */
export const PILOT_CLOSE_GAIN = 0.5;
export const PILOT_MAX_CLOSE = 120;
/** The gun is held only while the lead is within this range (u), inside the round's about 607 u reach (spec §7.1). */
export const PILOT_FIRE_RANGE = 560;
/** A burst ends at this heat and the next starts when the gun is cold again (0). */
export const PILOT_HEAT_RELEASE = 0.8 * GUN_HEAT_MAX;
/** Ticks between two torpedo launches (start: the pair's MISSILE_GAP). */
export const PILOT_MISSILE_GAP = 1500;
/** The throttle it leaves the ship at when it stands up. */
export const PILOT_AWAY_THROTTLE = 0;

const COS_45 = 0.7071067811865476;
const NO_HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The Rooms the pilot will stand up for, in order (Valkyrn iii plan Decision 7). */
const REPAIR_ORDER = [Room.Weapons, Room.Shields, Room.Engines] as const;

export interface ScriptedPilot {
  /** Next command sequence (player 0). */
  seq: number;
  /** The aim sent on the last seated tick, or −1; the hazard prediction flies its turn. */
  aim: number;
  /** True from PILOT_HEAT_RELEASE (or a lockout) until the gun is cold. */
  cooling: boolean;
  /** Tick of the last torpedo launch sent. */
  lastLaunch: number;
  /** The Room being repaired, or −1. */
  task: number;
  /** On its way to (or in) the Medbay to heal to full. */
  heal: boolean;
}

export function createScriptedPilot(): ScriptedPilot {
  return { seq: 0, aim: -1, cooling: false, lastLaunch: -PILOT_MISSILE_GAP, task: -1, heal: false };
}

function len(x: number, y: number): number { return Math.sqrt(x * x + y * y); }
const levelOf = (thrust: number): number => thrust > 0 ? THROTTLE_MAX : thrust < 0 ? THROTTLE_MIN : 0;

/** The seated pilot's flight this tick (plan Decision 4): the aim to send, the throttle level, and whether the shot is on. */
function flight(p: ScriptedPilot, d: DuelState): { aim: number; level: number; on: boolean } {
  const t = d.tactical, s = t.ships[0], target = targetOf(t, 0), e = t.ships[target]!;
  const keep = (h: number): number => h >= 0 ? h : p.aim;
  const away = hazardAway(d, { turn: p.aim >= 0 ? aimTurn(s.heading, p.aim) : 0, thrust: throttleThrust(d.throttle) });
  if (away) return { aim: keep(nearestHeading(away.x, away.y)), level: THROTTLE_MAX, on: false };
  const inbound = missileOf(t, target);
  if (inbound) {
    const mx = inbound.x - s.x, my = inbound.y - s.y;
    if (mx * mx + my * my <= EVADE_RANGE * EVADE_RANGE) {
      const side = s.vx * -my + s.vy * mx >= 0 ? 1 : -1;
      return { aim: keep(nearestHeading(-my * side, mx * side)), level: THROTTLE_MAX, on: false };
    }
  }
  const rx = e.x - s.x, ry = e.y - s.y, dist = len(rx, ry);
  if (dist > PILOT_ENGAGE_RANGE) {
    const o = orbitSteer(d, PILOT_ORBIT_R);
    return { aim: keep(nearestHeading(o.dx, o.dy)), level: levelOf(o.thrust), on: false };
  }
  const lead = leadOffset(t, 0), lx = lead ? lead.x : rx, ly = lead ? lead.y : ry;
  const vx = e.vx - s.vx, vy = e.vy - s.vy, closing = dist > 0 ? -(rx * vx + ry * vy) / dist : 0;
  const want = Math.max(-PILOT_MAX_CLOSE, Math.min(PILOT_MAX_CLOSE, (dist - PILOT_STAND_RANGE) * PILOT_CLOSE_GAIN));
  const nx = hx(s.heading), ny = hy(s.heading), facing = nx * rx + ny * ry >= COS_45 * dist;
  const level = !facing ? 0 : closing < want - SPEED_SLACK ? THROTTLE_MAX : closing > want + SPEED_SLACK ? THROTTLE_MIN : 0;
  const along = nx * lx + ny * ly, across = Math.abs(nx * ly - ny * lx);
  const on = lead !== null && along > 0 && len(lx, ly) <= PILOT_FIRE_RANGE && across <= SHIP_RADIUS;
  return { aim: keep(nearestHeading(lx, ly)), level, on };
}

/** This tick's input for a crew-of-one duel: player 0's held input and commands, stamped with the duel's tick. */
export function scriptedPilotInput(p: ScriptedPilot, d: DuelState): DuelInput {
  const st = d.interior, eid = st.crew[0]!, seat = Seated.station[eid]!, cmds: DuelCommand[] = [], sys = d.tactical.systems[0];
  let held: HeldInput = NO_HELD;
  if (Life.state[eid] === LifeState.Conscious) {
    if (p.task >= 0 && sys.rooms[p.task] === 0) p.task = -1;
    if (p.task < 0) { const r = REPAIR_ORDER.find((k) => sys.rooms[k] >= 2); if (r !== undefined) p.task = r; }
    if (Health.cur[eid]! < HURT_HEALTH) p.heal = true;
    if (Health.cur[eid]! >= HEALTH_MAX) p.heal = false;
    const mb = medbayRoom(d), healing = p.task < 0 && p.heal && mb >= 0 && medbayOnline(d);
    if (p.task >= 0 || healing) {
      if (seat >= 0) {   // stand up; the ship flies the last aim and this throttle (spec §4.4)
        if (d.throttle !== PILOT_AWAY_THROTTLE) cmds.push({ kind: 'throttle', level: PILOT_AWAY_THROTTLE });
        cmds.push({ kind: 'stand' });
      } else if (p.task >= 0) {
        if (inRepairReach(d, 0, p.task)) held = { moveX: 0, moveY: 0, interactHeld: true };
        else { const pt = d.points.find((q) => q.tacticalRoom === p.task)!; held = walkTo(d, 0, goalTiles(d, pt.room, pt.tile)); }
      } else if (roomAt(st, Position.x[eid]!, Position.y[eid]!) !== mb) held = walkTo(d, 0, roomTiles(d, mb));
    } else if (seat < 0) {   // back to the Flight seat (one console group: Navigation + Weapons)
      if (canSit(d, 0, d.nav)) cmds.push({ kind: 'sit', station: d.nav });
      else held = walkTo(d, 0, goalTiles(d, st.derived.stationRoom[d.nav]!, st.derived.stationTile[d.nav]!));
    } else {
      const f = flight(p, d);
      if (sys.gunHeat >= PILOT_HEAT_RELEASE || sys.gunLocked) p.cooling = true;
      else if (sys.gunHeat === 0) p.cooling = false;
      p.aim = f.aim;
      if (f.level !== d.throttle) cmds.push({ kind: 'throttle', level: f.level });
      held = { moveX: 0, moveY: 0, interactHeld: false, aim: f.aim, gunHeld: f.on && !p.cooling };
      if (canLaunch(d.tactical, 0) && d.tactical.tick - p.lastLaunch >= PILOT_MISSILE_GAP) { cmds.push({ kind: 'missileLaunch' }); p.lastLaunch = d.tactical.tick; }
    }
  }
  const commands: DuelEnvelope[] = cmds.map((command) => ({ runId: LOCAL_DUEL_RUN, id: { player: 0, sequence: p.seq++ }, requestedTick: st.tick, command }));
  return { held: [held], commands };
}
```
Run `npx vitest run tests/scriptedPilot.test.ts tests/determinismGuard.test.ts tests/noShipIdLiterals.test.ts`.
- Expected: PASS.
- If the repair test fails because `stand` is rejected after a `throttle` in the same tick, swap the two commands' order (the throttle goes first so it is still accepted at the seat). Report the change.
- If the sit test times out, check `canSit` against the Flight group's tile in `valkyrn.json` before changing anything else.

- [ ] **Step 3: Prove the Hound unchanged, then commit.**

```
npx tsc -b
npx tsx scripts/golden/duel-oracle.ts same
npx tsx scripts/golden/canonical-trace.ts same
git add src/renderer/src/sim/duel/scriptedPilot.ts tests/scriptedPilot.test.ts
git commit -m "feat(sim): scripted Valkyrn pilot (Valkyrn spec §10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: no tsc errors, and both `same` checks pass.

---

### Task 3: The Valkyrn duel helper and the tuning tool

**Files:**
- Modify: `tests/helpers/scriptedDuel.ts` (export `requireApplied`)
- Create: `tests/helpers/valkyrnGate.ts`, `scripts/valkyrn-telemetry.ts`

**Interfaces:**
- Produces:
  - `VALKYRN`;
  - `ValkyrnRun { seed; telemetry; finalHash; gunShots; gunHits; hull: [number, number]; hullMax: [number, number] }`;
  - `runValkyrnDuel(seed, cap = CAP_TICKS)`;
  - `valkyrnLine(r)`;
  - `valkyrnGate(runs): { pass: boolean; reasons: string[]; summary: string; medianS: number; crewWins: number; hunterWins: number }`.

- [ ] **Step 1: Export `requireApplied`.** In `tests/helpers/scriptedDuel.ts`, change `function requireApplied(` to `export function requireApplied(`. Nothing else changes.

- [ ] **Step 2: Create `tests/helpers/valkyrnGate.ts`.**

```ts
// Headless Valkyrn duels for the Valkyrn gate (Valkyrn spec §10, tests/duelGates.test.ts) and its tuning tool
// (scripts/valkyrn-telemetry.ts): the scripted pilot (crew of one) against the hunter, with telemetry, up to the cap.
import valkyrn from '../../src/renderer/src/sim/ship/valkyrn.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { hashDuel } from '../../src/renderer/src/sim/duel/hash';
import { createScriptedPilot, scriptedPilotInput } from '../../src/renderer/src/sim/duel/scriptedPilot';
import { createDuel, disposeDuel } from '../../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../../src/renderer/src/sim/duel/step';
import { createTelemetry, endedFromPlanet, recordTick, type DuelTelemetry } from '../../src/renderer/src/sim/duel/telemetry';
import { classOf, Outcome } from '../../src/renderer/src/sim/tactical/state';
import { TICK_HZ } from '../../src/renderer/src/sim/tuning';
import { CAP_TICKS, median, OUTCOME_NAMES, PLANET_END_MIN_TICKS, requireApplied } from './scriptedDuel';

export const VALKYRN = parseShip(valkyrn);
/** The gate (spec §10): the median round in seconds, and the Hunter's minimum wins over the ten seeds. */
export const VALKYRN_MEDIAN_MIN_S = 180;
export const VALKYRN_MEDIAN_MAX_S = 300;
export const VALKYRN_HUNTER_WINS_MIN = 1;

export interface ValkyrnRun {
  seed: number; telemetry: DuelTelemetry; finalHash: string;
  /** The crew ship's gun counters (ShipSystems, spec §7.3) at the end. */
  gunShots: number; gunHits: number;
  /** Hull left and the class's hull: crew, enemy. */
  hull: [number, number]; hullMax: [number, number];
}

/** One crew-of-one duel to its end or the cap; every pilot command must be applied. */
export function runValkyrnDuel(seed: number, cap = CAP_TICKS): ValkyrnRun {
  const d = createDuel(VALKYRN, seed, 0, 1), pilot = createScriptedPilot(), t = createTelemetry(d);
  try {
    while (d.tactical.outcome === Outcome.Running && d.interior.tick < cap) {
      const input = scriptedPilotInput(pilot, d);
      requireApplied(seed, d, input, stepDuelTick(d, input));
      recordTick(t, d, input);
    }
    const sys = d.tactical.systems;
    return {
      seed, telemetry: t, finalHash: hashDuel(d), gunShots: sys[0]!.gunShots, gunHits: sys[0]!.gunHits,
      hull: [sys[0]!.hull, sys[1]!.hull], hullMax: [classOf(d.tactical, 0).hull, classOf(d.tactical, 1).hull]
    };
  } finally { disposeDuel(d); }
}

/** One line per Valkyrn duel (two lines of text). */
export function valkyrnLine(r: ValkyrnRun): string {
  const t = r.telemetry, [c, e] = t.ships, p = t.players[0]!, f = (n: number): string => (n / TICK_HZ).toFixed(1);
  const rate = r.gunShots > 0 ? ((100 * r.gunHits) / r.gunShots).toFixed(1) : '0.0';
  return [
    `seed ${r.seed}: ${f(t.ticks)} s, ${OUTCOME_NAMES[t.outcome]}, hull crew ${r.hull[0]}/${r.hullMax[0]} enemy ${r.hull[1]}/${r.hullMax[1]}, terminal crew [${t.terminal[0].join(' ')}] enemy [${t.terminal[1].join(' ')}]${endedFromPlanet(t) ? ', PLANET END' : ''}`,
    `  gun ${r.gunShots} shots, ${r.gunHits} hits (${rate}%); missiles ${c.missilesLaunched} launched, hits W/S/E ${c.missileHitsByRoom.join('/')}; enemy laser ${e.laserReleases} released, ${e.laserHits} hit, missiles ${e.missilesLaunched}; repairs ${p.repairsStarted}/${p.repairsFinished}, away walking/repairing ${f(p.walkingTicks)}/${f(p.repairingTicks)} s; contacts planet ${c.planetContacts}, asteroid ${c.asteroidContacts}`
  ].join('\n');
}

/** The Valkyrn gate over a set of runs (spec §10), with the reasons it fails, if any. */
export function valkyrnGate(runs: readonly ValkyrnRun[]): { pass: boolean; reasons: string[]; summary: string; medianS: number; crewWins: number; hunterWins: number } {
  const ts = runs.map((r) => r.telemetry), medianS = median(ts.map((t) => t.ticks)) / TICK_HZ;
  const crewWins = ts.filter((t) => t.outcome === Outcome.CrewWins).length, hunterWins = ts.filter((t) => t.outcome === Outcome.EnemyWins).length;
  const draws = ts.filter((t) => t.outcome === Outcome.Draw).length, atCap = ts.filter((t) => t.outcome === Outcome.Running).length;
  const shots = runs.reduce((n, r) => n + r.gunShots, 0), hits = runs.reduce((n, r) => n + r.gunHits, 0);
  const reasons: string[] = [];
  if (medianS < VALKYRN_MEDIAN_MIN_S) reasons.push(`median ${medianS.toFixed(1)} s < ${VALKYRN_MEDIAN_MIN_S}`);
  if (medianS > VALKYRN_MEDIAN_MAX_S) reasons.push(`median ${medianS.toFixed(1)} s > ${VALKYRN_MEDIAN_MAX_S}`);
  if (hunterWins < VALKYRN_HUNTER_WINS_MIN) reasons.push(`hunter wins ${hunterWins} < ${VALKYRN_HUNTER_WINS_MIN}`);
  if (atCap > 0) reasons.push(`${atCap} at the cap`);
  for (const r of runs) {
    if (r.gunShots < 1) reasons.push(`seed ${r.seed} no gun`);
    if (r.telemetry.ships[0].missilesLaunched < 1) reasons.push(`seed ${r.seed} no torpedo`);
    if (endedFromPlanet(r.telemetry) && r.telemetry.ticks < PLANET_END_MIN_TICKS) reasons.push(`seed ${r.seed} planet end < 30 s`);
  }
  const summary = [
    `valkyrn median length ${medianS.toFixed(1)} s (gate ${VALKYRN_MEDIAN_MIN_S} to ${VALKYRN_MEDIAN_MAX_S})`,
    `crew wins ${crewWins}, hunter wins ${hunterWins} (gate ≥ ${VALKYRN_HUNTER_WINS_MIN}), draws ${draws}, at the cap ${atCap} (gate 0)`,
    `gun ${shots} shots, ${hits} hits (${shots > 0 ? ((100 * hits) / shots).toFixed(1) : '0.0'}%) over ${runs.length} duels; cap ${(CAP_TICKS / TICK_HZ).toFixed(0)} s`
  ].join('\n');
  return { pass: reasons.length === 0, reasons, summary, medianS, crewWins, hunterWins };
}
```

- [ ] **Step 3: Create `scripts/valkyrn-telemetry.ts`.**

```ts
// The Valkyrn tuning tool (Valkyrn spec §10 Gate, §12): the scripted pilot against the hunter over the gate seeds.
// Usage:
//   npx tsx scripts/valkyrn-telemetry.ts [seed ...]
//       each duel's lines, then the gate summary, at the current tuning
//   npx tsx scripts/valkyrn-telemetry.ts sweep [--layer a,b] [--hull a,b] [--level a,b] [--vhull a,b]
//       one line per combination over seeds 1 to 10. The run overwrites the Valkyrn's gun counters (GUN_HITS_PER_LAYER,
//       _HULL, _LEVEL) and its hull (VALKYRN_HULL) in process only; nothing is written. A list left out keeps the
//       current value. Line format:
//       layer=8 hull=3 level=6 vhull=30  median 231.4 s  crew 7 hunter 3 draw 0 cap 0  gun hit 17.9%  PASS
//       (or FAIL: <reasons>)
import { GUN, SHIP_CLASSES, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { GATE_SEEDS } from '../tests/helpers/scriptedDuel';
import { runValkyrnDuel, valkyrnGate, valkyrnLine } from '../tests/helpers/valkyrnGate';

interface Knobs { layer: number; hull: number; level: number; vhull: number }
type Mutable = { hitsPerLayer: number; hitsPerHull: number; hitsPerLevel: number };
const cls = SHIP_CLASSES[ShipClass.Valkyrn]! as unknown as { hull: number; slots: { gun: Mutable | null } };
const gun = GUN as unknown as Mutable;

function setKnobs(k: Knobs): void {
  for (const g of new Set([gun, cls.slots.gun!])) { g.hitsPerLayer = k.layer; g.hitsPerHull = k.hull; g.hitsPerLevel = k.level; }
  cls.hull = k.vhull;
}

const argv = process.argv.slice(2);
if (argv[0] === 'sweep') {
  const list = (flag: string, now: number): number[] => {
    const i = argv.indexOf(flag);
    if (i < 0) return [now];
    const v = argv[i + 1]!.split(',').map(Number);
    if (v.some((n) => !Number.isInteger(n) || n < 1)) throw Error(`${flag}: positive integers, comma separated`);
    return v;
  };
  const layers = list('--layer', gun.hitsPerLayer), hulls = list('--hull', gun.hitsPerHull), levels = list('--level', gun.hitsPerLevel), vhulls = list('--vhull', cls.hull);
  for (const vhull of vhulls) for (const hull of hulls) for (const layer of layers) for (const level of levels) {
    setKnobs({ layer, hull, level, vhull });
    const runs = GATE_SEEDS.map((seed) => runValkyrnDuel(seed)), g = valkyrnGate(runs);
    const shots = runs.reduce((n, r) => n + r.gunShots, 0), hits = runs.reduce((n, r) => n + r.gunHits, 0);
    const draws = runs.filter((r) => r.telemetry.outcome === 3).length, cap = runs.filter((r) => r.telemetry.outcome === 0).length;
    console.log(`layer=${layer} hull=${hull} level=${level} vhull=${vhull}  median ${g.medianS.toFixed(1)} s  crew ${g.crewWins} hunter ${g.hunterWins} draw ${draws} cap ${cap}  gun hit ${shots > 0 ? ((100 * hits) / shots).toFixed(1) : '0.0'}%  ${g.pass ? 'PASS' : `FAIL: ${g.reasons.join('; ')}`}`);
  }
} else {
  const seeds = argv.length > 0 ? argv.map(Number) : GATE_SEEDS;
  if (seeds.some((n) => !Number.isInteger(n))) throw Error('usage: npx tsx scripts/valkyrn-telemetry.ts [seed ...] | sweep [--layer a,b] [--hull a,b] [--level a,b] [--vhull a,b]');
  const runs = seeds.map((seed) => runValkyrnDuel(seed));
  for (const r of runs) console.log(valkyrnLine(r));
  const g = valkyrnGate(runs);
  console.log(`\n${g.summary}\n${g.pass ? 'PASS' : `FAIL: ${g.reasons.join('; ')}`}`);
}
```
(The outcome literals 3 and 0 are `Outcome.Draw` and `Outcome.Running`, as in `OUTCOME_NAMES` (`scriptedDuel.ts:62`). Import `Outcome` instead if tsc or a reviewer prefers it.)

- [ ] **Step 4: Check and run once at the start values.**

```
npx tsc -b
npx tsx scripts/valkyrn-telemetry.ts 1
```
Expected: no tsc errors, then two lines for seed 1 and the summary, with no throw. A throw from `requireApplied` names the rejected command: fix the pilot (Task 2's code) and rerun the Task 2 tests.

- [ ] **Step 5: Commit.**

```
git add tests/helpers/scriptedDuel.ts tests/helpers/valkyrnGate.ts scripts/valkyrn-telemetry.ts
git commit -m "test(duel): Valkyrn duel helper and tuning tool (Valkyrn spec §10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Valkyrn gate and the tuning

**Files:**
- Modify: `tests/duelGates.test.ts` (new `describe` block; the three Hound tests are untouched), `src/renderer/src/sim/tactical/tuning.ts`, `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md` (§12)
- Maybe modify: `src/renderer/src/sim/duel/scriptedPilot.ts` (`PILOT_*` only), and any Part i test that hard-codes 8/3/6/30 (Step 6)

- [ ] **Step 1: Write the gate block.** Append to `tests/duelGates.test.ts`. Add the imports at the top, beside the existing ones, and change nothing else in the file:

```ts
import { runValkyrnDuel, valkyrnGate, valkyrnLine, type ValkyrnRun } from './helpers/valkyrnGate';
```
```ts
// The Valkyrn gate (Valkyrn spec §10): the scripted pilot (sim/duel/scriptedPilot.ts), a crew of one, against the same
// hunter over the same seeds and cap. Tuning tool: `npx tsx scripts/valkyrn-telemetry.ts` (and its `sweep`); the
// numbers are in the spec's §12.
const valkyrnRuns = new Map<number, ValkyrnRun>();

describe('the Valkyrn gate: the scripted pilot against the hunter, seeds 1 to 10', () => {
  for (const seed of GATE_SEEDS) it(`seed ${seed}: ends before the cap, the pilot fires the gun and a torpedo, no planet-contact end under 30 s`, () => {
    const r = runValkyrnDuel(seed), t = r.telemetry;
    valkyrnRuns.set(seed, r);
    expect(t.outcome, valkyrnLine(r)).not.toBe(Outcome.Running);
    expect(t.ticks).toBeLessThan(CAP_TICKS);
    expect(r.gunShots, valkyrnLine(r)).toBeGreaterThanOrEqual(1);
    expect(t.ships[0].missilesLaunched, valkyrnLine(r)).toBeGreaterThanOrEqual(1);
    expect(endedFromPlanet(t) && t.ticks < PLANET_END_MIN_TICKS, valkyrnLine(r)).toBe(false);
  }, 60_000);
  it('the median Valkyrn round lasts 3 to 5 minutes, and the Hunter wins at least one of ten', () => {
    expect([...valkyrnRuns.keys()].sort((a, b) => a - b), 'all ten per-seed tests must have run before the aggregate gate').toEqual([...GATE_SEEDS]);
    const all = GATE_SEEDS.map((seed) => valkyrnRuns.get(seed)!), g = valkyrnGate(all);
    console.log(`${all.map(valkyrnLine).join('\n')}\n${g.summary}`);
    expect(g.medianS, g.summary).toBeGreaterThanOrEqual(180);
    expect(g.medianS, g.summary).toBeLessThanOrEqual(300);
    expect(g.hunterWins, g.summary).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
```

- [ ] **Step 2: Run it at the start values.** `npx vitest run tests/duelGates.test.ts`.
- Expected: the three Hound tests pass with their numbers unchanged (compare the logged summary with the one before Part iii). The Valkyrn block passes or fails.
- If it passes, skip to Step 5 and record the start values as chosen.

- [ ] **Step 3: Sweep (only if Step 2 failed).** Run each command with the Bash tool's `run_in_background: true`. A combination is ten duels of up to 15 simulated minutes each, roughly 30–90 s of wall time. Wait for the completion notice; do not poll. Keep every output line for §12.

Stage A (the hull ratio and the Valkyrn's hull, 16 combinations):
```
npx tsx scripts/valkyrn-telemetry.ts sweep --hull 2,3,4,5 --vhull 24,30,36,40
```
Stage B (the shield and room counters, around the best Stage A pair `H`, `V`, 12 combinations):
```
npx tsx scripts/valkyrn-telemetry.ts sweep --hull H --vhull V --layer 6,8,10,12 --level 4,6,8
```
How to read the lines:
- median too short with the crew winning nearly all: the gun is too strong, so raise `--hull` and then `--layer`;
- median too long, or runs at the cap: lower them;
- `hunter 0`: lower `--vhull`;
- `no torpedo` / `no gun` on a seed: a pilot problem, not tuning; go to Step 4.

- [ ] **Step 4: Choose the values.**
  1. Among the PASS lines, take the one closest to the start values (8/3/6/30), by the smallest sum of `|value − start| / start`.
  2. On a tie, take the median closest to 240 s.
  3. Then take the earlier line.

  If there is no PASS line:
  - adjust the pilot's own numbers, one at a time, rerunning `npx tsx scripts/valkyrn-telemetry.ts` (not sweep): `PILOT_MISSILE_GAP` (1500 → 900 or 2100), `PILOT_STAND_RANGE` (300 → 250 or 340), `PILOT_ENGAGE_RANGE` (900 → 700 or 1200);
  - then repeat Stage A once;
  - if still nothing passes, stop and report every sweep line to the controller. Never edit the gate bands.

  `PILOT_HEAT_RELEASE` stays at 80% (the brief).

- [ ] **Step 5: Write the chosen values.** In `src/renderer/src/sim/tactical/tuning.ts`, set the four constants. Each gets a gate comment in the `HUNTER_HULL` style (`tuning.ts:40-42`), with `<…>` filled from the measured run, for example:

```ts
/** Valkyrn spec §7.2, §12: gun hits on an unshielded enemy per hull point. <H> (start 3) from the Valkyrn gate
 *  (tests/duelGates.test.ts): median <M> s, <w> crew wins, <h> Hunter wins over seeds 1 to 10. */
export const GUN_HITS_PER_HULL = <H>;
```
Write the same for `GUN_HITS_PER_LAYER` (start 8), `GUN_HITS_PER_LEVEL` (start 6) and `VALKYRN_HULL` (spec §6.1, start 30). For a value left at its start, write "kept at the start value" in place of "(start n)". If a `PILOT_*` number changed, give it the same comment in `scriptedPilot.ts`.

- [ ] **Step 6: Tests that pin the start values.** Run:

```
git grep -ln "GUN_HITS_PER\|hitsPerLayer\|hitsPerHull\|hitsPerLevel\|VALKYRN_HULL" -- tests
```
Run every listed file with `npx vitest run <files>`. A Part i test that writes the literal start value, such as `8` hits to strip, instead of the constant is changed to read the constant (spec §6.1: "Start values, tuned in §10"). Rerun: PASS.

- [ ] **Step 7: Write spec §12.** Append to `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md`, after §11, filling every `<…>` from the runs:

```md
## 12. As built (Part iii, 2026-11-18)

- **Scripted pilot:** `sim/duel/scriptedPilot.ts`. It sits at the Flight seat and steers by `aim` only: avoid, dodge, orbit
  at 1850 u until the Hunter is within <ENGAGE> u, then attacks the lead (`sim/tactical/lead.ts`, pinned equal to the
  view's pip). It holds the gun in bursts (release at 80% heat, resume when cold), launches a torpedo when it can at most
  every <GAP> ticks, and stands for a level-2 Room (Weapons, Shields, Engines), repairs it to 0 and sits again.
- **Chosen numbers:** `GUN_HITS_PER_LAYER` <L> (start 8), `GUN_HITS_PER_HULL` <H> (start 3), `GUN_HITS_PER_LEVEL` <V>
  (start 6), `VALKYRN_HULL` <VH> (start 30). The pilot's numbers: <the PILOT_* values, or "as started">.
- **Measured** (the Valkyrn gate, `tests/duelGates.test.ts`, seeds 1 to 10, cap 15 min): median <M> s, crew wins <w>,
  Hunter wins <h>, draws <d>, none at the cap; gun hit rate <r>%.
- **Sweep** (`npx tsx scripts/valkyrn-telemetry.ts sweep …`):
  <the sweep lines, verbatim, or "not needed: the start values passed">.
- **Hound unchanged:** `duel-oracle.ts same` and `canonical-trace.ts same` pass at SIM_VERSION 53. The tuning moves only gun
  rounds and the Valkyrn class, so there is no version bump (Valkyrn iii plan Decision 11).
```

- [ ] **Step 8: Gate and prove.**

```
npx tsc -b
npx vitest run tests/duelGates.test.ts tests/scriptedPilot.test.ts tests/valkyrnLead.test.ts
npx tsx scripts/golden/duel-oracle.ts same
npx tsx scripts/golden/canonical-trace.ts same
```
Expected:
- no tsc errors;
- every test passes, and the Valkyrn summary prints the §12 numbers;
- both `same` checks pass.

- [ ] **Step 9: The only bless case.** A `same` failure here means a Hound run changed. None of this task's edits reach the Hound, so first look for an accidental edit (`git diff HEAD~3 -- src/renderer/src/sim`) and revert it. The only approved fallback is for a constant that turns out to be shared with a Hound path, because Part i wired a `GUN_*` value into code the Cutter runs. In that case:
  1. Run `npm run bless` with no flags (a same-version bless; `scripts/bless-golden.ts` calls it "a deliberate gameplay change").
  2. Run `npx vitest run tests/duelGolden.test.ts tests/duelGates.test.ts` and confirm that the Hound's gate numbers in the log still pass.
  3. State in the commit message and in §12 which Hound path read the constant and why the change is intended.

  Do not bless for any other cause.

- [ ] **Step 10: Commit.**

```
git add tests/duelGates.test.ts src/renderer/src/sim/tactical/tuning.ts docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md
git commit -m "test(duel): Valkyrn gate and gun tuning (median <M> s, Hunter wins <h>/10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Add `src/renderer/src/sim/duel/scriptedPilot.ts` and any Step 6 test file by name if they changed.)

---

### Task 5: Full gates and merge readiness

**Files:** none new.

- [ ] **Step 1: The full gates, in order, one at a time.**

```
npx tsc -b
npx electron-vite build
npx vitest run --maxWorkers=4
npm run test:duel-app-runtime
```
Expected:
- no tsc errors;
- the build succeeds;
- the whole suite passes, which includes the Hound and Valkyrn gate blocks, the goldens, the determinism guard and the no-id-literal test. Rerun a timed-out slow file alone before calling it a failure;
- the duel app smoke passes.

- [ ] **Step 2: The Hound proof, once more on the final tree.**

```
npx tsx scripts/golden/duel-oracle.ts same
npx tsx scripts/golden/canonical-trace.ts same
git diff --stat <Part-iii-start>..HEAD -- tests/golden tests/fixtures
```
Expected: both pass, and the diff is empty, unless Task 4 Step 9 was taken and explained. `<Part-iii-start>` is the commit before Task 1's: `git log --oneline -6`.

- [ ] **Step 3: The merge-readiness checklist** (report each line as done or not, with evidence):
  - [ ] SIM_VERSION still 53; no `MIGRATIONS` entry added; no generated file edited by hand; no `--fresh`.
  - [ ] Both `same` checks pass on the final tree (Step 2 output quoted).
  - [ ] The Hound gate block is unchanged in `tests/duelGates.test.ts` (`git diff <Part-iii-start>..HEAD -- tests/duelGates.test.ts` shows only additions), and its logged summary matches the one before Part iii.
  - [ ] The Valkyrn gate passes: the median and the Hunter's wins quoted from the log equal spec §12.
  - [ ] `tuning.ts` comments and spec §12 carry the same numbers.
  - [ ] `scriptedPilot.ts` and `lead.ts` pass the determinism guard; neither imports `render/`, `app/` or an rng.
  - [ ] No ship-id literal was added under `src/` (`tests/noShipIdLiterals.test.ts` passes).
  - [ ] The agreement test between `sim/tactical/lead.ts` and `render/duel/leadModel.ts` passes. Any view fix (Decision 1) is named.
  - [ ] All four full gates pass (Step 1 output quoted).
  - [ ] Every commit is staged by name and has the Co-Authored-By footer (`git log --format=%B <Part-iii-start>..HEAD | grep -c "Co-Authored-By: Claude Opus 5.5"` equals the commit count).
  - [ ] The spec §10 screenshots (Part ii) and the owner's look and feel check remain the owner's manual gate, which is not part of this plan.

---

## Self-review

**Spec coverage:**
- §10 Gate: the scripted pilot aims at the pip (Task 2 aim test), fires in bursts under the heat limit (burst test), launches torpedoes in range (launch test; `canLaunch` includes the 360 range), and stands to repair a level-2 Room and returns (repair test).
- The seeds and the bands: Task 4's block over `GATE_SEEDS`, with median 180–300 and the Hunter's wins ≥ 1.
- "Tune the gun counters (§7.2) and the class (§6.1) to pass; report the numbers": Task 4 Steps 3–7 and §12.
- "Hound unchanged": the `same` proofs in Tasks 1, 2, 4 and 5, and an untouched Hound block.
- §4.4 out of seat: the repair test asserts `holdHeading` holds the last aim when the pilot stands, and the round goes on.
- §6.2: the pilot sends only `aim`, never `heading`, `face` or A/D.

**Contract:** no contract names changed. Part iii adds these names:
- `sim/tactical/lead.ts`: `interceptTime`, `leadOffset`, `nearestHeading`;
- `sim/duel/scriptedPilot.ts`: `createScriptedPilot`, `scriptedPilotInput`, `PILOT_*`;
- `orbitSteer` and the newly exported pair helpers;
- `tests/helpers/valkyrnGate.ts` and `scripts/valkyrn-telemetry.ts`.

It relies on Part i's `aimTurn` being exported (Task 1 Step 2 adds the `export` if it is missing, with no behaviour change). It relies on the gun counters being read from `GunDef` rather than the constants, and on derived validator bounds: Task 1 Steps 2–3 check both and fix them without moving a hash.

**Placeholder scan:** the `<…>` marks appear only in Task 4 Steps 5, 7 and 10, and they are measured numbers that cannot be known before the run. Every code step is complete. `viewOffset` is the one adapter to Part ii's exact `leadPip` signature, and the plan says how to fit it.

**Type consistency:**
- `ScriptedPilot.aim` is a heading index or −1, as `HeldInput.aim` is.
- `flight().level` is in `THROTTLE_MIN..THROTTLE_MAX`, through `levelOf`.
- `ValkyrnRun.hull` and `hullMax` are pairs.
- `valkyrnGate` returns `medianS`, which the gate block and the script both use.
- `PILOT_HEAT_RELEASE` is `0.8 × GUN_HEAT_MAX` (800), and the burst test compares against it rather than a literal.

**Risk noted:** the start pilot may not reach the bands at any counter value. Task 4 Step 4 bounds the search: pilot numbers next, then stop and report, and never edit the bands.
