# Skills and XP (Increment 3-i) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real skills: six XP totals per crew member mapped to levels by a threshold table, XP from productive station work and repairs, skill effects on station output, repair speed, cooling per coolant unit and sealed-door leakage, Engineering bonus bars with power shedding, and six levels on the HUD, per `docs/superpowers/specs/2026-11-10-skills-and-xp-design.md`.

**Architecture:** `state.skills` holds `xp` (playerCount × 6) and four tick stamps; `sim/skills.ts` owns the table, the curve and `addXp`; `sim/productive.ts` owns `isProductive`; `sim/xp.ts` owns the per-tick `xpSystem` placed right after `consoleSystem`; lump and event XP are granted where the event happens (shot, evasion roll, injection, repair). `power.ts` gains `bonusBars`, `powerCapacity` and `shedPower`; every system that stands a player calls `shedPower` after `standUp`.

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), fast-check, Pixi 8.19 (render task only). No new dependencies.

## Spec amendments made by this plan (recorded in Task 5)

- `shedPower` is called by the three systems that stand a player (the voluntary stand in `consoleSystem`, `failStation`, `downCrew`) immediately after `standUp`, instead of inside `standUp` (spec §7): `power.ts` imports `standUp` from `stations.ts`, so `stations.ts` importing `shedPower` would be a module cycle. `shedPower` is a no-op unless usage exceeds capacity, so calling it after every stand is safe.
- `repairMult` lives in `skills.ts` next to `skillCurve`.

## Global Constraints

- `tests/boundary.test.ts` stays green: `sim/` and `shared/` import nothing from render/, input/, app/, pixi, electron; no `Math.random`, `Date`, `performance.now`, `Math.pow` or other transcendental maths in sim/ or shared/, even in comments. ASCII only in comments.
- Every test runs under node; no test imports pixi, and no file a test imports does.
- Determinism: this increment adds no randomness. New per-run state (`skills.xp`, `lastEngChangeTick`, `lastDoorToggleTick`, `lsDeliveredTick`, `lastShotTick`) is in `SimState`, flattened in a new `skills` manifest section after `science` (the xp array, then the four stamps in that order), snapshotted and hashed. `SIM_VERSION` becomes `6`; version-5 snapshots are rejected.
- Tuning (exact): `SKILL_COUNT = 6`, `SKILL_MAX = 10`, `XP_THRESHOLDS = [0, 240, 600, 1080, 1680, 2400, 3240, 4200, 5280, 6480, 7800]`, `XP_RATE = 1`, `XP_PER_SHOT = 10`, `XP_PER_EVADE_ROLL = 5`, `PRODUCTIVE_WINDOW_TICKS = 300`, `REPAIR_SKILL_GAIN = 0.06`, `HEAT_COOL_SKILL = 0.2`, `SEAL_SKILL = 0.05`, `BONUS_BAR_LEVELS = 4`, `SHED_ORDER = [Doors, Medbay, Science, Weapons, Navigation, LifeSupport, Engineering]`.
- `Skill = { Navigation: 0, Engineering: 1, Weapons: 2, Science: 3, Combat: 4, Repair: 5 }`; `STATION_SKILL = [Navigation, Weapons, Science, Engineering, Engineering, Science, Engineering]` by `StationKind` (Nav, Wpn, Sci, Eng, LS, Med, Doors).
- `levelFor(xp)` = largest L ≤ 10 with `XP_THRESHOLDS[L] <= xp`. `skillCurve(level) = OUTPUT_SLOW + (OUTPUT_FAST − OUTPUT_SLOW) × (level + 10) / 20` (0.75 at 0, 1.0 at 10). `repairMult(level) = 1 + REPAIR_SKILL_GAIN × level`. `addXp` caps at `XP_THRESHOLDS[10]`.
- Stamps: `recent(stamp, tick, window) = stamp >= 0 && tick − stamp >= 0 && tick − stamp < window`. Stamps are set only by: a successful `shiftBar` or `cycleCoolant` from Engineering input (`lastEngChangeTick`), a remote door toggle Confirm with a valid cursor (`lastDoorToggleTick`), a hazard tick whose applied injection sums > 0 (`lsDeliveredTick`), a shot taken (`lastShotTick`).
- Step order: `interactSystem → consoleSystem → xpSystem → movementSystem → doorSystem → hazard tick → spawner → debrisSystem → medbayStep → crewSystem`.
- XP: `xpSystem` grants `XP_RATE × DT` to a Conscious seated operator of an online station other than Weapons and Life Support when `isProductive`. Weapons: `XP_PER_SHOT` per shot taken. Navigation: `XP_PER_EVADE_ROLL` per evasion roll. Life Support: `XP_RATE × HAZARD_DT` to its Conscious seated operator on each hazard tick whose injection delivered > 0. Repair: `XP_RATE × DT` per tick in which the repairer's target progressed. Revive: none.
- Outputs at skill 0 are unchanged from 2b (Weapons level 2 → 0.5, Science level 1 → 0.375); at level 10 the curve is 1.0.
- Bonus bars `floor(level / 4)` while a Conscious operator sits at an online Engineering; `powerCapacity = power.capacity + bonusBars`; `powerPool = powerCapacity − powerUsed`. `shedPower`: while `powerUsed > powerCapacity`, lower the first station in `SHED_ORDER` above its floor (Engineering 1, others 0) by one, writing `stations.level` directly, standing an occupant cut to 0.
- Commit messages: imperative, prefixed `feat:`, `test:`, `chore:` or `docs:`; the agent's attribution line as the session requires. `npm run typecheck`, `npm test` and `npm run build` pass at the end of every task.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/skills.ts` (rewritten) | `Skill`, `SKILL_NAMES`, `STATION_SKILL`, `levelFor`, `skillCurve`, `repairMult`, `xpIndex`, `skillLevelOf`, `skillLevel`, `addXp`. |
| `src/renderer/src/sim/productive.ts` (new) | `recent`, `isProductive`. |
| `src/renderer/src/sim/xp.ts` (new) | `xpSystem`. |
| `src/renderer/src/sim/{state,flatten,tuning,stations,power,heat,console,interact,weapons,debris,crew,step}.ts`, `hazards/oxygen.ts` | as the tasks say. |
| `src/renderer/src/render/{hudModel,hud}.ts` | skills line. |
| `tests/{skills,productive,xp}.test.ts` (new), `tests/{snapshot,power,heat,oxygen,interact,weapons,debris,console,hud}.test.ts`, `tests/helpers/sim.ts` | tests and the `setSkill` helper. |
| `docs/gates.md`, `docs/roadmap.md`, spec amendments | Task 5. |

---

### Task 1: Skills core, state, snapshot

**Files:**
- Modify: `src/renderer/src/sim/skills.ts`, `tuning.ts`, `state.ts`, `flatten.ts`, `stations.ts`, `tests/helpers/sim.ts`
- Test: `tests/skills.test.ts` (new), `tests/snapshot.test.ts`, `tests/golden/basic.json` (re-bless)

**Interfaces:**
- Produces: everything exported from `skills.ts` (above); `SimState.skills = { xp: Float64Array; lastEngChangeTick: number; lastDoorToggleTick: number; lsDeliveredTick: number; lastShotTick: number }` (stamps start at −1); test helper `setSkill(state, pid, skill, level)` setting `xp` to `XP_THRESHOLDS[level]`; `stationOutput` uses `skillCurve`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/helpers/sim.ts` (import `SKILL_COUNT, XP_THRESHOLDS` from tuning):

```ts
/** Set a crew member's skill to exactly the XP threshold of a level. */
export function setSkill(state: SimState, pid: number, skill: number, level: number): void {
  state.skills.xp[pid * SKILL_COUNT + skill] = XP_THRESHOLDS[level]!;
}
```

Create `tests/skills.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Skill, STATION_SKILL, levelFor, skillCurve, repairMult, skillLevel, skillLevelOf, addXp } from '../src/renderer/src/sim/skills';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { stationOutput } from '../src/renderer/src/sim/stations';
import { XP_THRESHOLDS, SKILL_MAX, OUTPUT_SLOW, OUTPUT_FAST, REPAIR_SKILL_GAIN, STATION_MAX } from '../src/renderer/src/sim/tuning';
import { makeState, setSkill } from './helpers/sim';

describe('levels', () => {
  it('levelFor steps at every threshold and caps at SKILL_MAX', () => {
    for (let L = 0; L <= SKILL_MAX; L++) {
      expect(levelFor(XP_THRESHOLDS[L]!)).toBe(L);
      if (L > 0) expect(levelFor(XP_THRESHOLDS[L]! - 1)).toBe(L - 1);
    }
    expect(levelFor(XP_THRESHOLDS[SKILL_MAX]! + 1e6)).toBe(SKILL_MAX);
    expect(levelFor(0)).toBe(0);
  });
  it('addXp accumulates, never decreases and caps at the top threshold', () => {
    const s = makeState(2);
    addXp(s, 1, Skill.Repair, 100); addXp(s, 1, Skill.Repair, 150);
    expect(skillLevelOf(s, 1, Skill.Repair)).toBe(1); expect(skillLevelOf(s, 0, Skill.Repair)).toBe(0);
    addXp(s, 1, Skill.Repair, -50); addXp(s, 1, Skill.Repair, 0);
    expect(s.skills.xp[1 * 6 + Skill.Repair]).toBe(250);                             // never decreases
    addXp(s, 1, Skill.Repair, 1e9);
    expect(s.skills.xp[1 * 6 + Skill.Repair]).toBe(XP_THRESHOLDS[SKILL_MAX]); expect(skillLevelOf(s, 1, Skill.Repair)).toBe(SKILL_MAX);
  });
  it('station kinds map to skills: Life Support and Doors train Engineering, the Medbay trains Science', () => {
    expect(STATION_SKILL[StationKind.LifeSupport]).toBe(Skill.Engineering); expect(STATION_SKILL[StationKind.Doors]).toBe(Skill.Engineering);
    expect(STATION_SKILL[StationKind.Medbay]).toBe(Skill.Science); expect(STATION_SKILL[StationKind.Navigation]).toBe(Skill.Navigation);
    const s = makeState(1);
    setSkill(s, 0, Skill.Engineering, 7);
    expect(skillLevel(s, 0, StationKind.LifeSupport)).toBe(7); expect(skillLevel(s, 0, StationKind.Doors)).toBe(7); expect(skillLevel(s, 0, StationKind.Weapons)).toBe(0);
  });
  it('skillCurve and repairMult at the ends; stationOutput at level 10 reaches level / max x 1.0', () => {
    expect(skillCurve(0)).toBeCloseTo((OUTPUT_SLOW + OUTPUT_FAST) / 2); expect(skillCurve(10)).toBeCloseTo(OUTPUT_FAST);
    expect(repairMult(0)).toBe(1); expect(repairMult(10)).toBeCloseTo(1 + 10 * REPAIR_SKILL_GAIN);
    const s = makeState(1), wpn = s.derived.stationOfKind[StationKind.Weapons]!;
    s.stations.occupant[wpn] = 0;                                                 // seated for the output formula
    expect(stationOutput(s, wpn)).toBeCloseTo((2 / STATION_MAX[StationKind.Weapons]!) * 0.75);
    setSkill(s, 0, Skill.Weapons, 10);
    expect(stationOutput(s, wpn)).toBeCloseTo(2 / STATION_MAX[StationKind.Weapons]!);
  });
});
```

In `tests/snapshot.test.ts`: change the version test to version 5 (`simVersion: 5`, `values[0] = 5`, title "rejects a version-5 snapshot ..."); add (import `setSkill` from the helpers and `Skill` from skills):

```ts
  it('round-trips skills and stamps; xp and each stamp alone change the hash', () => {
    const s = makeState(2, 5);
    setSkill(s, 0, Skill.Science, 3); setSkill(s, 1, Skill.Repair, 7); s.skills.xp[Skill.Combat] = 12.5;
    s.skills.lastEngChangeTick = 40; s.skills.lastDoorToggleTick = 41; s.skills.lsDeliveredTick = 45; s.skills.lastShotTick = 46;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(hashState(t)).toBe(hashState(s));
    expect(Array.from(t.skills.xp)).toEqual(Array.from(s.skills.xp));
    expect([t.skills.lastEngChangeTick, t.skills.lastDoorToggleTick, t.skills.lsDeliveredTick, t.skills.lastShotTick]).toEqual([40, 41, 45, 46]);
    const base = hashState(makeState(2, 5));
    const mutate = (f: (u: ReturnType<typeof makeState>) => void) => { const u = makeState(2, 5); f(u); return hashState(u); };
    expect(mutate((u) => { u.skills.xp[3] = 1; })).not.toBe(base);
    expect(mutate((u) => { u.skills.lastEngChangeTick = 1; })).not.toBe(base);
    expect(mutate((u) => { u.skills.lastDoorToggleTick = 1; })).not.toBe(base);
    expect(mutate((u) => { u.skills.lsDeliveredTick = 1; })).not.toBe(base);
    expect(mutate((u) => { u.skills.lastShotTick = 1; })).not.toBe(base);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

`npx vitest run tests/skills.test.ts tests/snapshot.test.ts` → FAIL (`Skill` not exported, `state.skills` undefined, version-5 accepted).

- [ ] **Step 3: Tuning, skills module, state, flatten, stations**

`tuning.ts`: `SIM_VERSION = 6`; append

```ts
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
```

Rewrite `skills.ts`:

```ts
import type { SimState } from './state';
import { SKILL_COUNT, SKILL_MAX, XP_THRESHOLDS, OUTPUT_SLOW, OUTPUT_FAST, REPAIR_SKILL_GAIN } from './tuning';

export const Skill = { Navigation: 0, Engineering: 1, Weapons: 2, Science: 3, Combat: 4, Repair: 5 } as const;
export const SKILL_NAMES = ['Navigation', 'Engineering', 'Weapons', 'Science', 'Combat', 'Repair'] as const;
/** Skill trained and used by each StationKind (foundation section 5): Nav, Wpn, Sci, Eng; Life Support and Doors use Engineering; the Medbay uses Science. */
export const STATION_SKILL = [Skill.Navigation, Skill.Weapons, Skill.Science, Skill.Engineering, Skill.Engineering, Skill.Science, Skill.Engineering] as const;

/** Largest level whose threshold the XP total has reached; table-driven, no transcendental maths. */
export function levelFor(xp: number): number {
  let level = 0;
  while (level < SKILL_MAX && xp >= XP_THRESHOLDS[level + 1]!) level++;
  return level;
}

/** Output multiplier for a skill level: half way between slow and fast at level 0, fast at level 10 (foundation section 5). */
export function skillCurve(level: number): number {
  return OUTPUT_SLOW + (OUTPUT_FAST - OUTPUT_SLOW) * (level + 10) / 20;
}

/** Repair speed multiplier: 1 at level 0, 1.6 at level 10. */
export function repairMult(level: number): number { return 1 + REPAIR_SKILL_GAIN * level; }

export function xpIndex(pid: number, skill: number): number { return pid * SKILL_COUNT + skill; }

export function skillLevelOf(state: SimState, pid: number, skill: number): number {
  return levelFor(state.skills.xp[xpIndex(pid, skill)]!);
}

/** The level of the skill a station kind trains and uses. */
export function skillLevel(state: SimState, pid: number, kind: number): number {
  return skillLevelOf(state, pid, STATION_SKILL[kind]!);
}

/** XP only ever rises (a non-positive amount is ignored), capped at the top threshold. */
export function addXp(state: SimState, pid: number, skill: number, amount: number): void {
  if (amount <= 0) return;
  const k = xpIndex(pid, skill);
  state.skills.xp[k] = Math.min(XP_THRESHOLDS[SKILL_MAX]!, state.skills.xp[k]! + amount);
}
```

`state.ts`: add to `SimState`

```ts
  /** Per-crew skill XP (pid x SKILL_COUNT + skill) and the productivity stamps (spec 3-i section 4); stamps are -1 until set. */
  skills: { xp: Float64Array; lastEngChangeTick: number; lastDoorToggleTick: number; lsDeliveredTick: number; lastShotTick: number };
```

and to the initialiser `skills: { xp: new Float64Array(playerCount * SKILL_COUNT), lastEngChangeTick: -1, lastDoorToggleTick: -1, lsDeliveredTick: -1, lastShotTick: -1 }` (import `SKILL_COUNT`).

`flatten.ts`: manifest `[..., 'science', 'skills', 'crew']`; `SKILL_STAMP_FIELDS = 4`; `size()` adds `s.playerCount * SKILL_COUNT + SKILL_STAMP_FIELDS` (import `SKILL_COUNT`). In `flatten` after `put(s.science.scanning);`: `for (const v of s.skills.xp) put(v); put(s.skills.lastEngChangeTick); put(s.skills.lastDoorToggleTick); put(s.skills.lsDeliveredTick); put(s.skills.lastShotTick);`. Mirror in `unflatten` after `s.science.scanning = get();`: `for (let k = 0; k < s.skills.xp.length; k++) s.skills.xp[k] = get(); s.skills.lastEngChangeTick = get(); s.skills.lastDoorToggleTick = get(); s.skills.lsDeliveredTick = get(); s.skills.lastShotTick = get();`.

`stations.ts`: `stationOutput` becomes

```ts
export function stationOutput(state: SimState, i: number): number {
  if (!stationOnline(state, i)) return 0;
  const kind = state.derived.stationKind[i]!, occ = state.stations.occupant[i]!;
  return (state.stations.level[i]! / STATION_MAX[kind]!) * skillCurve(occ >= 0 ? skillLevel(state, occ, kind) : 0);
}
```

(import `skillCurve` alongside `skillLevel`; drop the now-unused `OUTPUT_SLOW, OUTPUT_FAST` import from stations.ts.)

- [ ] **Step 4: Run, typecheck, re-bless the golden**

`npx vitest run tests/skills.test.ts tests/snapshot.test.ts` → PASS. `npm run typecheck` → clean. `npm test` → `tests/golden.test.ts` fails (version 6, new hashed fields; no behaviour change yet since nothing grants XP). `npm run bless`, `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/skills.ts src/renderer/src/sim/tuning.ts src/renderer/src/sim/state.ts src/renderer/src/sim/flatten.ts src/renderer/src/sim/stations.ts tests/helpers/sim.ts tests/skills.test.ts tests/snapshot.test.ts tests/golden/basic.json
git commit -m "feat: six skills with XP totals and a level table; skills state hashed; SIM_VERSION 6

Golden re-blessed: SIM_VERSION 6 and the new skills block enter the hash; no XP source exists yet, so the replay's behaviour is unchanged."
```

---

### Task 2: Productive predicates, stamps and XP flow

**Files:**
- Create: `src/renderer/src/sim/productive.ts`, `src/renderer/src/sim/xp.ts`
- Modify: `src/renderer/src/sim/{step,console,weapons,debris,interact,power}.ts`, `hazards/oxygen.ts`
- Test: `tests/productive.test.ts` (new), `tests/xp.test.ts` (new), `tests/golden/basic.json` (re-bless: XP now accrues)

**Interfaces:**
- Consumes: Task 1. Produces: `recent(stamp, tick, window)`, `isProductive(state, i)`, `xpSystem(state)`; `bonusBars(state)` in `power.ts` (used by the Engineering predicate; returns 0 until Task 3 adds the capacity change, but is defined here in full).

- [ ] **Step 1: Write the failing tests**

Create `tests/productive.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { recent, isProductive } from '../src/renderer/src/sim/productive';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { Health } from '../src/renderer/src/sim/components';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { Skill } from '../src/renderer/src/sim/skills';
import { PRODUCTIVE_WINDOW_TICKS, HAZARD_EVERY, HEALTH_MAX } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, placeDebris, room, overdrive, setSkill, teleport } from './helpers/sim';

const idx = (s: ReturnType<typeof makeState>, kind: number) => s.derived.stationOfKind[kind]!;
const confirm = { confirmPressed: true }, right = { moveX: 1 }, down = { moveY: 1 };

describe('recent', () => {
  it('an unset stamp is never recent, a set one is recent until the window elapses', () => {
    expect(recent(-1, 0, 300)).toBe(false); expect(recent(-1, 1000, 300)).toBe(false);
    expect(recent(100, 100, 300)).toBe(true); expect(recent(100, 399, 300)).toBe(true); expect(recent(100, 400, 300)).toBe(false);
    expect(recent(100, 99, 300)).toBe(false);                                   // a stamp from the future is not recent
  });
});

describe('isProductive', () => {
  it('Navigation and Science: a warned object; Science scanning alone with nothing warned is not enough', () => {
    const s = makeState(2), nav = idx(s, StationKind.Navigation), sci = idx(s, StationKind.Science), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, nav); sitDown(s, 1, sci);
    expect(isProductive(s, nav)).toBe(false); expect(isProductive(s, sci)).toBe(false);
    s.science.scanning = 1; s.stations.cursor[sci] = 0;                          // no valid target: the scan branch needs one
    expect(isProductive(s, sci)).toBe(false);
    placeDebris(s, A, 600, 1);
    expect(isProductive(s, nav)).toBe(true); expect(isProductive(s, sci)).toBe(true);
    s.science.scanning = 0;
    expect(isProductive(s, sci)).toBe(true);                                      // warned alone suffices
  });
  it('Engineering: overdrive, a shortfall covered by bonus bars, or a recent change', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering);
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, eng);
    expect(isProductive(s, eng)).toBe(false);                                     // stamps unset at tick 0
    s.stations.cursor[eng] = StationKind.Doors; run(s, 1, () => intents(right)); // Doors 1 -> 2 (the spare bar): a change, and an overdrive
    expect(s.skills.lastEngChangeTick).toBe(0); expect(isProductive(s, eng)).toBe(true);
    run(s, 1, () => intents({ moveX: -1 }));                                      // back to 1: no overdrive, but the change is recent
    expect(isProductive(s, eng)).toBe(true);
    run(s, PRODUCTIVE_WINDOW_TICKS);
    expect(s.tick - s.skills.lastEngChangeTick).toBeGreaterThanOrEqual(PRODUCTIVE_WINDOW_TICKS); expect(isProductive(s, eng)).toBe(false);
    run(s, 1, () => intents(right)); run(s, 1, () => intents(right));            // refused second move (pool empty) does not re-stamp
    const stamp = s.skills.lastEngChangeTick; run(s, 1, () => intents(right));
    expect(s.skills.lastEngChangeTick).toBe(stamp);
    run(s, PRODUCTIVE_WINDOW_TICKS + 1); expect(isProductive(s, eng)).toBe(false);
    s.stations.cursor[eng] = StationKind.Weapons; run(s, 1, () => intents(confirm));   // coolant 0 -> 1 on Weapons: a change
    expect(s.stations.coolant[idx(s, StationKind.Weapons)]).toBe(1); expect(s.skills.lastEngChangeTick).toBe(s.tick - 1); expect(isProductive(s, eng)).toBe(true);
    run(s, PRODUCTIVE_WINDOW_TICKS + 1);
    s.stations.cursor[eng] = StationKind.Engineering; run(s, 1, () => intents(confirm));   // refused: the Engineering row holds no coolant
    expect(isProductive(s, eng)).toBe(false);
    const t = makeState(1), engT = idx(t, StationKind.Engineering), doors = idx(t, StationKind.Doors);
    t.spawner.nextSpawnTick = 1e9; setSkill(t, 0, Skill.Engineering, 8); sitDown(t, 0, engT);
    const navT = idx(t, StationKind.Navigation), sciT = idx(t, StationKind.Science), medT = idx(t, StationKind.Medbay);
    t.stations.level[navT] = 2; t.stations.level[sciT] = 2; t.stations.level[medT] = 2;   // usage 12 against base 10, nothing overdriven (all three have max 2): covered by the two bonus bars
    expect(t.stations.level[doors]).toBe(1); expect(isProductive(t, engT)).toBe(true);
    t.stations.level[navT] = 1; t.stations.level[sciT] = 1; t.stations.level[medT] = 1;   // back under base capacity
    expect(isProductive(t, engT)).toBe(false);
  });
  it('Life Support: recent delivery only; Medbay: a hurt Conscious patient in the room', () => {
    const s = makeState(1), ls = idx(s, StationKind.LifeSupport), med = idx(s, StationKind.Medbay);
    s.spawner.nextSpawnTick = 1e9;
    expect(isProductive(s, ls)).toBe(false);
    const drained = room(s, 'A'); s.rooms.o2[drained] = 0; activateBreach(s, 0);   // site 0 is in room A: the only drained room is breached, so no delivery
    for (let r = 0; r < s.rooms.o2.length; r++) if (r !== drained) s.rooms.o2[r] = s.derived.volume[r]!;
    for (let pid = 0; pid < s.playerCount; pid++) teleport(s, pid, 2.5, 2.5);                                 // crew in the breached room: breathing makes no room elsewhere
    run(s, 1); expect(s.skills.lsDeliveredTick).toBe(-1); expect(isProductive(s, ls)).toBe(false);
    s.skills.lsDeliveredTick = 10; s.tick = 15; expect(isProductive(s, ls)).toBe(true);
    s.tick = 16; expect(isProductive(s, ls)).toBe(false); expect(HAZARD_EVERY + 1).toBe(6);
    s.tick = 0; sitDown(s, 0, med);
    expect(isProductive(s, med)).toBe(false);                                     // the operator sits in the Medbay but is at full health
    Health.cur[s.crew[0]!] = HEALTH_MAX - 1;
    expect(isProductive(s, med)).toBe(true);
  });
  it('Doors: a fire or breach anywhere, or a recent remote toggle; local toggles do not count', () => {
    const s = makeState(2), doors = idx(s, StationKind.Doors);
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, doors);
    expect(isProductive(s, doors)).toBe(false);
    igniteRoom(s, room(s, 'G'));
    expect(isProductive(s, doors)).toBe(true);
    s.rooms.fire[room(s, 'G')] = 0;
    teleport(s, 1, 2.5, 8.5); run(s, 1, () => intents({}, confirm));            // player 1 toggles a door locally
    expect(s.skills.lastDoorToggleTick).toBe(-1); expect(isProductive(s, doors)).toBe(false);
    run(s, 1, () => intents(confirm, {}));                                       // the seated operator toggles remotely
    expect(s.skills.lastDoorToggleTick).toBe(s.tick - 1); expect(isProductive(s, doors)).toBe(true);
    run(s, PRODUCTIVE_WINDOW_TICKS - 2); expect(s.tick - s.skills.lastDoorToggleTick).toBe(PRODUCTIVE_WINDOW_TICKS - 1); expect(isProductive(s, doors)).toBe(true);
    run(s, 1); expect(isProductive(s, doors)).toBe(false);                      // exactly PRODUCTIVE_WINDOW_TICKS old: expired
    run(s, 1, () => intents(down, {}));                                          // moving the cursor is not a toggle
    expect(isProductive(s, doors)).toBe(false);
  });
  it('Weapons (director predicate only): a recent shot', () => {
    const s = makeState(1), wpn = idx(s, StationKind.Weapons);
    expect(isProductive(s, wpn)).toBe(false);
    s.skills.lastShotTick = 0; s.tick = PRODUCTIVE_WINDOW_TICKS - 1; expect(isProductive(s, wpn)).toBe(true);
    s.tick = PRODUCTIVE_WINDOW_TICKS; expect(isProductive(s, wpn)).toBe(false);
  });
  it('a Doors overdrive is not Engineering productivity for a station that is not Engineering', () => {
    const s = makeState(1), doors = overdrive(s, StationKind.Doors);
    sitDown(s, 0, doors);
    expect(isProductive(s, doors)).toBe(false);
  });
});
```

Create `tests/xp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { Skill, xpIndex } from '../src/renderer/src/sim/skills';
import { Weapon } from '../src/renderer/src/sim/weapons';
import { DT, HAZARD_DT, HAZARD_EVERY, XP_RATE, XP_PER_SHOT, XP_PER_EVADE_ROLL, HEALTH_MAX, REPAIR_TIME_FIRE } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, placeDebris, room, seconds, teleport } from './helpers/sim';

const idx = (s: ReturnType<typeof makeState>, kind: number) => s.derived.stationOfKind[kind]!;
const xp = (s: ReturnType<typeof makeState>, pid: number, skill: number) => s.skills.xp[xpIndex(pid, skill)]!;
const confirm = { confirmPressed: true };

describe('continuous XP', () => {
  it('a seated Navigation operator gains XP_RATE x DT per tick while an object is warned, nothing otherwise, nothing offline or unseated', () => {
    const s = makeState(1), nav = idx(s, StationKind.Navigation), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, nav);
    run(s, 10); expect(xp(s, 0, Skill.Navigation)).toBe(0);
    placeDebris(s, A, 1e6, 1);
    run(s, 1); expect(xp(s, 0, Skill.Navigation)).toBeCloseTo(XP_RATE * DT);
    run(s, 59); expect(xp(s, 0, Skill.Navigation)).toBeCloseTo(XP_RATE * 1);
    failStation(s, nav); run(s, 60);
    expect(xp(s, 0, Skill.Navigation)).toBeCloseTo(XP_RATE * 1);                  // offline (and stood): nothing
  });
  it('the observation point precedes impacts and healing: a Navigator downed by an impact keeps that tick; the Medbay operator earns the last healing tick', () => {
    const s = makeState(2), nav = idx(s, StationKind.Navigation), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 1, nav);
    Health.cur[s.crew[1]!] = 1; s.rng.combat.s = 36;                                // 0.956: no evasion
    placeDebris(s, A, 0, 1);                                                          // impacts this tick in room A (the Navigation room)
    run(s, 1);
    expect(Life.state[s.crew[1]!]).toBe(LifeState.Downed);
    expect(xp(s, 1, Skill.Navigation)).toBeCloseTo(XP_RATE * DT + XP_PER_EVADE_ROLL);   // the tick's continuous XP plus the roll
    run(s, 60); expect(xp(s, 1, Skill.Navigation)).toBeCloseTo(XP_RATE * DT + XP_PER_EVADE_ROLL);
    const t = makeState(1), med = idx(t, StationKind.Medbay);
    t.spawner.nextSpawnTick = 1e9; sitDown(t, 0, med); Health.cur[t.crew[0]!] = HEALTH_MAX - 0.01;   // heals to full on the first tick
    run(t, 1);
    expect(Health.cur[t.crew[0]!]).toBe(HEALTH_MAX); expect(xp(t, 0, Skill.Science)).toBeCloseTo(XP_RATE * DT);
    run(t, 10); expect(xp(t, 0, Skill.Science)).toBeCloseTo(XP_RATE * DT);         // nobody hurt: nothing more
  });
});

describe('event XP', () => {
  it('a shot adds XP_PER_SHOT hit or miss and stamps lastShotTick; a refused shot adds nothing', () => {
    const s = makeState(1), wpn = idx(s, StationKind.Weapons), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; placeDebris(s, A, 1e6, 1, undefined, 2); sitDown(s, 0, wpn);
    s.weapons.charge = 1; s.weapons.selector = Weapon.BeamF1; s.rng.combat.s = 1;   // mismatch: miss
    run(s, 1, () => intents(confirm));
    expect(xp(s, 0, Skill.Weapons)).toBe(XP_PER_SHOT); expect(s.skills.lastShotTick).toBe(0); expect(s.debris.active[0]).toBe(1);
    run(s, 1, () => intents(confirm));                                              // no charge: refused
    expect(xp(s, 0, Skill.Weapons)).toBe(XP_PER_SHOT);
    s.weapons.charge = 1; s.weapons.selector = Weapon.BeamF2; s.rng.combat.s = 1;   // match: hit
    run(s, 1, () => intents(confirm));
    expect(xp(s, 0, Skill.Weapons)).toBe(2 * XP_PER_SHOT); expect(s.debris.active[0]).toBe(0);
  });
  it('Life Support XP goes to the operator seated when a hazard tick delivers; none unmanned or when nothing is delivered', () => {
    const s = makeState(1), ls = idx(s, StationKind.LifeSupport), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; s.rooms.o2[A] = 0;                               // a drained room to fill
    run(s, HAZARD_EVERY);                                                            // unmanned delivery on tick 0
    expect(s.skills.lsDeliveredTick).toBe(0); expect(xp(s, 0, Skill.Engineering)).toBe(0);
    sitDown(s, 0, ls);
    run(s, HAZARD_EVERY);                                                            // hazard tick 5 delivers with the operator seated
    expect(xp(s, 0, Skill.Engineering)).toBeCloseTo(XP_RATE * HAZARD_DT);
    const t = makeState(1), lsT = idx(t, StationKind.LifeSupport);
    t.spawner.nextSpawnTick = 1e9; sitDown(t, 0, lsT);
    for (let r = 0; r < t.rooms.o2.length; r++) t.rooms.o2[r] = t.derived.volume[r]!;
    activateBreach(t, 7);                                                           // site 7 is in room E, the Life Support room: the operator breathes there, but a breached room takes no injection, and every other room is full
    run(t, 1);
    expect(t.skills.lsDeliveredTick).toBe(-1); expect(xp(t, 0, Skill.Engineering)).toBe(0);   // a Conscious seated operator earns nothing without delivery
  });
  it('repairers earn Repair XP per tick of progress; a hazard already repaired this tick earns nothing; revive earns nothing', () => {
    const s = makeState(2), G = room(s, 'G');
    s.spawner.nextSpawnTick = 1e9; igniteRoom(s, G);
    teleport(s, 0, 2.5, 9.5); teleport(s, 1, 3.5, 9.5);
    run(s, 1, () => intents({ interactHeld: true }, {}));
    expect(xp(s, 0, Skill.Repair)).toBeCloseTo(XP_RATE * DT); expect(xp(s, 1, Skill.Repair)).toBe(0);
    s.rooms.fireRepair[G] = 1 - 0.5 * DT / REPAIR_TIME_FIRE;                       // both finish on the next tick; the first holder completes it
    run(s, 1, () => intents({ interactHeld: true }, { interactHeld: true }));
    expect(s.rooms.fire[G]).toBe(0);
    expect(xp(s, 0, Skill.Repair)).toBeCloseTo(2 * XP_RATE * DT); expect(xp(s, 1, Skill.Repair)).toBe(0);   // player 1 found nothing left to repair
    Life.state[s.crew[1]!] = LifeState.Downed; Life.bleed[s.crew[1]!] = 30;
    run(s, seconds(1), () => intents({ interactHeld: true }, {}));
    expect(xp(s, 0, Skill.Repair)).toBeCloseTo(2 * XP_RATE * DT);                   // reviving is not repairing
  });
});
```

Append to `tests/snapshot.test.ts` (imports `sitDown`, `StationKind`, `intents`, `run` are present):

```ts
  it('a run saved inside an active Engineering productivity window continues like an uninterrupted run through the window expiry', () => {
    const mk = () => { const s = makeState(1, 9); s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, s.derived.stationOfKind[StationKind.Engineering]!); return s; };
    const script = (t: number) => t === 50 ? intents({ moveY: 1 }) : t === 52 ? intents({ moveX: 1 }) : intents();   // cursor to Life Support, then a bar move at tick 52
    const whole = mk(); for (let t = 0; t < 600; t++) step(whole, script(t));
    expect(whole.skills.lastEngChangeTick).toBe(52); expect(whole.skills.xp[1]).toBeGreaterThan(0);                 // Engineering XP accrued inside the window
    const first = mk(); for (let t = 0; t < 200; t++) step(first, script(t));
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(first))));
    for (let t = 200; t < 600; t++) step(resumed, script(t));
    expect(hashState(resumed)).toBe(hashState(whole));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

`npx vitest run tests/productive.test.ts tests/xp.test.ts tests/snapshot.test.ts` → FAIL (modules missing; no XP accrues; no stamp).

- [ ] **Step 3: Implement**

`power.ts`: add (imports: `Life, LifeState` from components, `stationOnline` from stations, `Skill, skillLevelOf` from skills, `BONUS_BAR_LEVELS` from tuning)

```ts
/** Bonus bars from a Conscious operator seated at an online Engineering: one per BONUS_BAR_LEVELS Engineering levels (spec 3-i section 7). */
export function bonusBars(state: SimState): number {
  const eng = state.derived.stationOfKind[StationKind.Engineering]!;
  if (eng < 0 || !stationOnline(state, eng)) return 0;
  const occ = state.stations.occupant[eng]!;
  if (occ < 0 || Life.state[state.crew[occ]!] !== LifeState.Conscious) return 0;
  return Math.floor(skillLevelOf(state, occ, Skill.Engineering) / BONUS_BAR_LEVELS);
}
```

(Task 3 makes capacity use it; here it only feeds the predicate.)

Create `productive.ts`:

```ts
import type { SimState } from './state';
import { Position, Health, Life, LifeState } from './components';
import { roomAt } from './grid';
import { StationKind } from './stationKinds';
import { warnedTargets } from './debrisTargets';
import { isOverdriven } from './heat';
import { bonusBars, powerUsed } from './power';
import { PRODUCTIVE_WINDOW_TICKS, HAZARD_EVERY, HEALTH_MAX } from './tuning';

/** A stamp is recent while it is set and fewer than window ticks old. An unset stamp (-1) is never recent. */
export function recent(stamp: number, tick: number, window: number): boolean {
  return stamp >= 0 && tick - stamp >= 0 && tick - stamp < window;
}

function anyWarned(state: SimState): boolean { return warnedTargets(state).length > 0; }

/**
 * Productive predicate per station index (foundation section 5, spec 3-i section 6). The caller checks that the station
 * is online with a seated Conscious operator; this only asks whether the station is doing useful work right now.
 */
export function isProductive(state: SimState, i: number): boolean {
  const kind = state.derived.stationKind[i]!, sk = state.skills, tick = state.tick;
  switch (kind) {
    case StationKind.Navigation: return anyWarned(state);
    case StationKind.Weapons: return recent(sk.lastShotTick, tick, PRODUCTIVE_WINDOW_TICKS);
    case StationKind.Science: {
      const c = state.stations.cursor[i]!, db = state.debris;
      const scanningValid = state.science.scanning === 1 && c >= 0 && db.active[c] === 1 && db.warned[c] === 1 && db.scanned[c] === 0;
      return scanningValid || anyWarned(state);
    }
    case StationKind.Engineering: {
      for (let j = 0; j < state.stations.level.length; j++) if (isOverdriven(state, j)) return true;
      if (bonusBars(state) > 0 && powerUsed(state) > state.power.capacity) return true;
      return recent(sk.lastEngChangeTick, tick, PRODUCTIVE_WINDOW_TICKS);
    }
    case StationKind.LifeSupport: return recent(sk.lsDeliveredTick, tick, HAZARD_EVERY + 1);
    case StationKind.Medbay: {
      const r = state.derived.stationRoom[i]!;
      for (let pid = 0; pid < state.playerCount; pid++) {
        const eid = state.crew[pid]!;
        if (Life.state[eid] === LifeState.Conscious && Health.cur[eid]! < HEALTH_MAX && roomAt(state, Position.x[eid]!, Position.y[eid]!) === r) return true;
      }
      return false;
    }
    case StationKind.Doors: {
      for (const f of state.rooms.fire) if (f > 0) return true;
      for (const b of state.breaches.active) if (b) return true;
      return recent(sk.lastDoorToggleTick, tick, PRODUCTIVE_WINDOW_TICKS);
    }
    default: return false;
  }
}
```

Create `xp.ts`:

```ts
import type { SimState } from './state';
import { Life, LifeState } from './components';
import { StationKind } from './stationKinds';
import { stationOnline } from './stations';
import { isProductive } from './productive';
import { STATION_SKILL, addXp } from './skills';
import { DT, XP_RATE } from './tuning';

/** Step 2b: continuous XP for every online station with a Conscious seated operator that is productive right now. Weapons and Life Support earn at their events instead (spec 3-i section 5). */
export function xpSystem(state: SimState): void {
  const d = state.derived;
  for (let i = 0; i < state.stations.level.length; i++) {
    const kind = d.stationKind[i]!;
    if (kind === StationKind.Weapons || kind === StationKind.LifeSupport) continue;
    const pid = state.stations.occupant[i]!;
    if (pid < 0 || !stationOnline(state, i) || Life.state[state.crew[pid]!] !== LifeState.Conscious) continue;
    if (isProductive(state, i)) addXp(state, pid, STATION_SKILL[kind]!, XP_RATE * DT);
  }
}
```

`step.ts`: import `xpSystem` and call `xpSystem(state);` immediately after `consoleSystem(state, intents);` with the comment `// (2b) XP at the observation point: operators are seated and this tick's conditions still stand`.

`console.ts`: in `engineeringInput`, `if (target >= 0 && shiftBar(state, target, dir === Dir.Right ? 1 : -1)) state.skills.lastEngChangeTick = state.tick;` and `if (confirm && cycleCoolant(state, state.derived.stationOfKind[c[i]!]!)) state.skills.lastEngChangeTick = state.tick;`. In `doorsInput`, the Confirm branch becomes `if (confirm) { state.scratch.doorToggles.add(edges[c[i]!]!); state.skills.lastDoorToggleTick = state.tick; }` (the `c[i] < 0` guard above it already excludes a doorless ship).

`weapons.ts` `fireWeapon`: after the hit/miss branch (both paths), before `if (hit) removeDebris(...)`: `state.skills.lastShotTick = state.tick; addXp(state, state.stations.occupant[wpn]!, Skill.Weapons, XP_PER_SHOT);` (imports `Skill, addXp` from skills, `XP_PER_SHOT` from tuning).

`debris.ts` `resolveImpact`: restructure the evasion check so the roll is explicit:

```ts
  const nav = d.stationOfKind[StationKind.Navigation]!;
  if (nav >= 0 && stationOnline(state, nav) && state.stations.occupant[nav]! >= 0) {
    addXp(state, state.stations.occupant[nav]!, Skill.Navigation, XP_PER_EVADE_ROLL);   // the roll itself is the productive act
    if (evades(nextFloat(state.rng.combat), stationOutput(state, nav))) { removeDebris(state, slot); return; }
  }
```

(imports `Skill, addXp`, `XP_PER_EVADE_ROLL`.)

`hazards/oxygen.ts`: in the injection loop accumulate `let delivered = 0;` (`delivered += inj` where `inj > 0`); after the loop:

```ts
  if (delivered > 0) {
    state.skills.lsDeliveredTick = state.tick;
    const ls = d.stationOfKind[StationKind.LifeSupport]!, occ = ls >= 0 ? state.stations.occupant[ls]! : -1;
    if (occ >= 0 && Life.state[state.crew[occ]!] === LifeState.Conscious) addXp(state, occ, Skill.Engineering, XP_RATE * HAZARD_DT);   // spec 3-i section 5: XP at the delivery event
  }
```

(imports `StationKind`, `Skill, addXp`, `XP_RATE`.)

`interact.ts` repair loop: each of the three branches becomes progress `+= DT * repairMult(level) / REPAIR_TIME_X` followed by `addXp(state, pid, Skill.Repair, XP_RATE * DT)`, where `const level = skillLevelOf(state, pid, Skill.Repair);` is computed once per repairer before the branch (imports `Skill, skillLevelOf, repairMult, addXp`, `XP_RATE`). The `continue` guards (already repaired by an earlier holder) stay before the progress lines, so they grant nothing.

- [ ] **Step 4: Run, typecheck, re-bless the golden**

`npx vitest run tests/productive.test.ts tests/xp.test.ts tests/interact.test.ts tests/weapons.test.ts tests/debris.test.ts tests/console.test.ts tests/oxygen.test.ts` → PASS. `npm run typecheck` → clean. `npm test` → the golden fails (the replay's seated players now accrue XP; stamps change); `npm run bless`; `npm test` → PASS. `npm run build` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/productive.ts src/renderer/src/sim/xp.ts src/renderer/src/sim/step.ts src/renderer/src/sim/console.ts src/renderer/src/sim/weapons.ts src/renderer/src/sim/debris.ts src/renderer/src/sim/interact.ts src/renderer/src/sim/power.ts src/renderer/src/sim/hazards/oxygen.ts tests/productive.test.ts tests/xp.test.ts tests/snapshot.test.ts tests/golden/basic.json
git commit -m "feat: productive predicates and XP flow: continuous station XP at the observation point, shot and evasion lumps, Life Support XP at delivery, Repair XP

Golden re-blessed: the replay's seated operators now accrue XP and the productivity stamps are hashed."
```

---

### Task 3: Skill effects: repair speed, cooling, sealed doors, bonus bars and shedding

**Files:**
- Modify: `src/renderer/src/sim/{interact,heat,power,console,crew}.ts`, `hazards/oxygen.ts`
- Test: `tests/interact.test.ts`, `tests/heat.test.ts`, `tests/oxygen.test.ts`, `tests/power.test.ts`

**Interfaces:**
- Produces: `powerCapacity(state)`, `SHED_ORDER`, `shedPower(state)` in `power.ts`; `powerPool` uses `powerCapacity`; `coolingPerUnit` and `passageFor` take the operator's level; `shedPower` called after `standUp` in `consoleSystem`'s stand branch, in `failStation`, and in `downCrew`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/interact.test.ts` (imports: `Skill` from skills, `REPAIR_TIME_POWER, REPAIR_SKILL_GAIN` from tuning, `setSkill` from helpers, `failStation` is present):

```ts
describe('repair skill', () => {
  it('level 10 repairs a fire and a power failure in 6 / 1.6 s and a breach in 8 / 1.6 s; two holders leave no residue; revive is unchanged', () => {
    const mult = 1 + 10 * REPAIR_SKILL_GAIN;
    const fire = makeState(1), G = room(fire, 'G'); fire.spawner.nextSpawnTick = 1e9; setSkill(fire, 0, Skill.Repair, 10); igniteRoom(fire, G); teleport(fire, 0, 2.5, 9.5);
    run(fire, Math.floor(seconds(REPAIR_TIME_FIRE / mult)) - 2, () => intents({ interactHeld: true })); expect(fire.rooms.fire[G]).toBeGreaterThan(0);
    run(fire, 4, () => intents({ interactHeld: true })); expect(fire.rooms.fire[G]).toBe(0);
    const br = makeState(1); br.spawner.nextSpawnTick = 1e9; setSkill(br, 0, Skill.Repair, 10); activateBreach(br, 6); teleport(br, 0, 2.5, 10.5);
    run(br, Math.floor(seconds(REPAIR_TIME_BREACH / mult)) - 2, () => intents({ interactHeld: true })); expect(br.breaches.active[6]).toBe(1);
    run(br, 4, () => intents({ interactHeld: true })); expect(br.breaches.active[6]).toBe(0);
    const pw = makeState(1), eng = pw.derived.stationOfKind[3]!; pw.spawner.nextSpawnTick = 1e9; setSkill(pw, 0, Skill.Repair, 10); failStation(pw, eng); teleport(pw, 0, 18.5, 9.5);
    run(pw, Math.floor(seconds(REPAIR_TIME_POWER / mult)) - 2, () => intents({ interactHeld: true })); expect(pw.stations.failed[eng]).toBe(1);
    run(pw, 4, () => intents({ interactHeld: true })); expect(pw.stations.failed[eng]).toBe(0);
    const two = makeState(2), G2 = room(two, 'G'); two.spawner.nextSpawnTick = 1e9; setSkill(two, 0, Skill.Repair, 10); setSkill(two, 1, Skill.Repair, 10); igniteRoom(two, G2);
    teleport(two, 0, 2.5, 9.5); teleport(two, 1, 3.5, 9.5);
    run(two, Math.ceil(seconds(REPAIR_TIME_FIRE / mult / 2)) + 2, () => intents({ interactHeld: true }, { interactHeld: true }));
    expect(two.rooms.fire[G2]).toBe(0); expect(two.rooms.fireRepair[G2]).toBe(0);
    const rv = makeState(2); rv.spawner.nextSpawnTick = 1e9; setSkill(rv, 0, Skill.Repair, 10);
    Life.state[rv.crew[1]!] = LifeState.Downed; Life.bleed[rv.crew[1]!] = 30; teleport(rv, 0, 2.5, 9.5); teleport(rv, 1, 3.0, 9.5);
    run(rv, seconds(REVIVE_TIME) - 2, () => intents({ interactHeld: true }, {})); expect(Life.state[rv.crew[1]!]).toBe(LifeState.Downed);
    run(rv, 3, () => intents({ interactHeld: true }, {})); expect(Life.state[rv.crew[1]!]).toBe(LifeState.Conscious);
  });
});
```

Append to `tests/heat.test.ts` (imports: `Skill` from skills, `HEAT_COOL_SKILL` from tuning, `setSkill` from helpers):

```ts
describe('cooling skill', () => {
  it('a level-5 engineer adds one cooling per unit while seated; level 4 and unseated are baseline; heat holds flat with one unit and rises when they stand', () => {
    const s = makeState(2), eng = idx(s, StationKind.Engineering), nav = overdrive(s, StationKind.Navigation);
    s.spawner.nextSpawnTick = 1e9;
    expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT);
    setSkill(s, 0, Skill.Engineering, 4); sitDown(s, 0, eng); expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT);
    setSkill(s, 0, Skill.Engineering, 5); expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT + 1); expect(Math.floor(HEAT_COOL_SKILL * 5)).toBe(1);
    s.stations.coolant[nav] = 1; s.stations.heat[nav] = 100;
    run(s, HAZARD_EVERY * 12);
    expect(s.stations.heat[nav]).toBe(100);                                        // 2 - 1 x 2 = 0 per hazard tick
    run(s, 1, () => intents({ cancelPressed: true }, {}));                           // the engineer stands: baseline cooling
    const after = s.stations.heat[nav]!;
    run(s, HAZARD_EVERY * 10);
    expect(s.stations.heat[nav]).toBe(after + 10);                                   // +1 per hazard tick with one baseline unit
  });
});
```

Append to `tests/oxygen.test.ts` (imports: `passageFor` from `../src/renderer/src/sim/hazards/oxygen`, `DoorState` from grid, `StationKind`, `sitDown` from stations, `Skill` from skills, `PASSAGE_SEALED, PASSAGE_CLOSED, PASSAGE_OPEN, SEAL_SKILL` from tuning, `setSkill` from helpers, `makeState`):

```ts
describe('sealed doors and the Doors operator', () => {
  it('a level-10 Doors operator halves the sealed leak; Open and Closed are unchanged; unmanned is baseline', () => {
    const s = makeState(1), doors = s.derived.stationOfKind[StationKind.Doors]!, e = s.derived.doorEdges[0]!;
    s.doors.state[e] = DoorState.Sealed;
    expect(passageFor(s, e)).toBeCloseTo(PASSAGE_SEALED);
    setSkill(s, 0, Skill.Engineering, 10); sitDown(s, 0, doors);
    expect(passageFor(s, e)).toBeCloseTo(PASSAGE_SEALED * (1 - 10 * SEAL_SKILL)); expect(1 - 10 * SEAL_SKILL).toBeCloseTo(0.5);
    s.doors.state[e] = DoorState.Closed; expect(passageFor(s, e)).toBe(PASSAGE_CLOSED);
    s.doors.state[e] = DoorState.Open; expect(passageFor(s, e)).toBe(PASSAGE_OPEN);
  });
});
```

Append to `tests/power.test.ts` (imports: `bonusBars, powerCapacity, shedPower, SHED_ORDER, maxLevel` from power, `Skill` from skills, `Health, Life, LifeState` from components, `reviveCrew` from `../src/renderer/src/sim/crew`, `setSkill, run, intents` from helpers, `fc from 'fast-check'`, `COOLANT_POOL` from tuning):

```ts
describe('bonus bars and shedding', () => {
  it('a level-8 engineer adds two bars while seated; level 3 adds none; standing sheds in SHED_ORDER down to the base capacity', () => {
    const s = makeState(2), eng = idx(s, StationKind.Engineering), doors = idx(s, StationKind.Doors), med = idx(s, StationKind.Medbay), sci = idx(s, StationKind.Science);
    s.spawner.nextSpawnTick = 1e9;
    setSkill(s, 0, Skill.Engineering, 3); sitDown(s, 0, eng);
    expect(bonusBars(s)).toBe(0); expect(powerCapacity(s)).toBe(REACTOR_CAPACITY); expect(powerPool(s)).toBe(1);
    setSkill(s, 0, Skill.Engineering, 8);
    expect(bonusBars(s)).toBe(2); expect(powerCapacity(s)).toBe(REACTOR_CAPACITY + 2); expect(powerPool(s)).toBe(3);
    expect(shiftBar(s, sci, 1)).toBe(true);                                        // the original spare: Science 1 -> 2
    expect(shiftBar(s, med, 1)).toBe(true); expect(shiftBar(s, med, 1)).toBe(true);   // both bonus bars: Medbay 1 -> 3 (overdrive)
    expect(powerUsed(s)).toBe(12); expect(powerPool(s)).toBe(0); expect(s.stations.level[doors]).toBe(1);
    sitDown(s, 1, doors);
    run(s, 1, () => intents({ cancelPressed: true }, {}));                           // the engineer stands: capacity back to 10, usage 12
    expect(powerUsed(s)).toBe(REACTOR_CAPACITY);
    expect(s.stations.level[doors]).toBe(0); expect(s.stations.level[med]).toBe(2);   // Doors first (1 -> 0, standing player 1), then Medbay (3 -> 2)
    expect(Seated.station[s.crew[1]!]).toBe(-1); expect(s.stations.level[sci]).toBe(2);
    sitDown(s, 0, eng);
    expect(powerPool(s)).toBe(2); expect(s.stations.level[doors]).toBe(0);         // restored capacity does not restore shed bars
  });
  it('failing Engineering with bonus bars allocated sheds despite the allocation freeze; a Downed engineer sheds through crewSystem', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering), sci = idx(s, StationKind.Science), med = idx(s, StationKind.Medbay);
    s.spawner.nextSpawnTick = 1e9; setSkill(s, 0, Skill.Engineering, 8); sitDown(s, 0, eng);
    shiftBar(s, sci, 1); shiftBar(s, med, 1); shiftBar(s, med, 1);
    expect(powerUsed(s)).toBe(12);
    failStation(s, eng);
    expect(powerUsed(s)).toBe(REACTOR_CAPACITY); expect(s.stations.level[eng]).toBe(1); expect(shiftBar(s, sci, -1)).toBe(false);   // shed happened; the freeze still holds for input
    const t = makeState(1), engT = idx(t, StationKind.Engineering), sciT = idx(t, StationKind.Science), medT = idx(t, StationKind.Medbay);
    t.spawner.nextSpawnTick = 1e9; setSkill(t, 0, Skill.Engineering, 8); sitDown(t, 0, engT);
    shiftBar(t, sciT, 1); shiftBar(t, medT, 1); shiftBar(t, medT, 1);
    Health.cur[t.crew[0]!] = 0.01; t.rooms.fire[t.derived.stationRoom[engT]!] = 1;   // burning Engineering room downs the operator this tick
    run(t, 1);
    expect(Seated.station[t.crew[0]!]).toBe(-1); expect(powerUsed(t)).toBe(REACTOR_CAPACITY);
  });
  it('shedding keeps the Engineering floor when everything else is empty', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering);
    for (let i = 0; i < s.stations.level.length; i++) s.stations.level[i] = 0;
    s.stations.level[eng] = 1; s.power.capacity = 0;                                 // an impossible deficit: nothing to shed below the floor
    shedPower(s);
    expect(s.stations.level[eng]).toBe(1); expect(powerUsed(s)).toBe(1);
    expect(SHED_ORDER[0]).toBe(StationKind.Doors); expect(SHED_ORDER[SHED_ORDER.length - 1]).toBe(StationKind.Engineering);
  });
  it('shedding one bar at a time follows SHED_ORDER through every station down to the Engineering floor', () => {
    const s = makeState(1);
    for (let i = 0; i < s.stations.level.length; i++) s.stations.level[i] = 1;      // one bar everywhere: usage 7
    s.power.capacity = 7;
    const removed: number[] = [];
    for (let cap = 6; cap >= 0; cap--) {
      s.power.capacity = cap; shedPower(s);
      for (let i = 0; i < s.stations.level.length; i++) if (s.stations.level[i] === 0 && !removed.includes(s.derived.stationKind[i]!)) removed.push(s.derived.stationKind[i]!);
    }
    expect(removed).toEqual([StationKind.Doors, StationKind.Medbay, StationKind.Science, StationKind.Weapons, StationKind.Navigation, StationKind.LifeSupport]);   // Engineering keeps its bar
    expect(s.stations.level[idx(s, StationKind.Engineering)]).toBe(1); expect(powerUsed(s)).toBe(1);
  });
  it('property: with an engineer of level 3, 4, 7 or 8, random inputs, sits, stands and downings keep usage within capacity, coolant within the pool and levels within maxLevel', () => {
    const arbDir = fc.constantFrom({}, { moveY: -1 }, { moveY: 1 }, { moveX: -1 }, { moveX: 1 });
    const arbScript = fc.array(fc.record({ dir: arbDir, confirm: fc.boolean(), stand: fc.boolean(), down: fc.boolean() }), { minLength: 20, maxLength: 200 });
    fc.assert(fc.property(fc.integer({ min: 1, max: 1e6 }), fc.constantFrom(3, 4, 7, 8), arbScript, (seed, level, script) => {
      const s = makeState(1, seed), eng = idx(s, StationKind.Engineering), eid = s.crew[0]!;
      s.spawner.nextSpawnTick = 1e9; setSkill(s, 0, Skill.Engineering, level); sitDown(s, 0, eng);
      for (const e of script) {
        for (let t = 0; t < 5; t++) {
          if (Life.state[eid] === LifeState.Downed) reviveCrew(s, eid);                      // bring them back so the run keeps using the seat
          if (Seated.station[eid]! < 0 && !e.stand) sitDown(s, 0, eng);
          if (e.down && t === 2 && Seated.station[eid]! >= 0) Health.cur[eid] = 0;          // crewSystem downs them this tick: a forced stand through downCrew
          run(s, 1, () => intents({ ...e.dir, confirmPressed: e.confirm, cancelPressed: e.stand && t === 0 }));
          if (powerUsed(s) > powerCapacity(s)) return false;
          let coolant = 0;
          for (let i = 0; i < s.stations.level.length; i++) { coolant += s.stations.coolant[i]!; if (s.stations.level[i]! > maxLevel(s.derived.stationKind[i]!)) return false; }
          if (coolant > COOLANT_POOL) return false;
        }
      }
      return true;
    }), { numRuns: 25 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

`npx vitest run tests/interact.test.ts tests/heat.test.ts tests/oxygen.test.ts tests/power.test.ts` → FAIL (`powerCapacity` missing; level-10 repair still takes 6 s; cooling and passage ignore skill).

- [ ] **Step 3: Implement**

`power.ts`:

```ts
export function powerCapacity(state: SimState): number { return state.power.capacity + bonusBars(state); }
export function powerPool(state: SimState): number { return powerCapacity(state) - powerUsed(state); }

/** Shedding order when capacity falls below allocation: shed first to last; Engineering never below 1 (spec 3-i section 7). */
export const SHED_ORDER = [StationKind.Doors, StationKind.Medbay, StationKind.Science, StationKind.Weapons, StationKind.Navigation, StationKind.LifeSupport, StationKind.Engineering] as const;

/** Bring usage back under capacity one bar at a time in SHED_ORDER. Writes levels directly: the one exception to the frozen-while-failed rule. No-op when usage already fits. */
export function shedPower(state: SimState): void {
  const d = state.derived;
  while (powerUsed(state) > powerCapacity(state)) {
    let shed = false;
    for (const kind of SHED_ORDER) {
      const i = d.stationOfKind[kind]!;
      if (i < 0) continue;
      const floor = kind === StationKind.Engineering ? 1 : 0, level = state.stations.level[i]!;
      if (level <= floor) continue;
      state.stations.level[i] = level - 1;
      if (level - 1 === 0) { const occ = state.stations.occupant[i]!; if (occ >= 0) standUp(state, occ); }
      shed = true; break;
    }
    if (!shed) return;                                                              // nothing above its floor: the reserved Engineering bar stays
  }
}
```

`failStation`: after `if (occ >= 0) standUp(state, occ);` add `shedPower(state);` (an Engineering failure drops bonus bars; for any other station the call is a no-op).

`console.ts` stand branch: `{ standUp(state, pid); shedPower(state); state.scratch.stoodThisTick[pid] = 1; continue; }` (import `shedPower` from power).

`crew.ts` `downCrew`: `Life.state[eid] = LifeState.Downed; standUp(state, pid); shedPower(state); Life.bleed[eid] = BLEEDOUT_TIME;` (import `shedPower` from `./power`).

`heat.ts` `coolingPerUnit`:

```ts
/** Heat removed per coolant unit per hazard tick: the baseline plus a floor-rounded term from the seated Engineering operator's Engineering level (spec 3-i section 7). */
export function coolingPerUnit(state: SimState): number {
  const eng = state.derived.stationOfKind[StationKind.Engineering]!;
  const occ = eng >= 0 && stationOnline(state, eng) ? state.stations.occupant[eng]! : -1;
  const level = occ >= 0 ? skillLevelOf(state, occ, Skill.Engineering) : 0;
  return HEAT_COOL_UNIT + Math.floor(HEAT_COOL_SKILL * level);
}
```

(`heat.ts` imports to add: `Skill, skillLevelOf` from `./skills`; `HEAT_COOL_SKILL` in the tuning import.)

`hazards/oxygen.ts` `passageFor`:

```ts
export function passageFor(state: SimState, edge: number): number {
  if (!state.derived.edgeIsDoor[edge]) return PASSAGE_OPEN;
  const st = state.doors.state[edge];
  if (st === DoorState.Open) return PASSAGE_OPEN;
  if (st !== DoorState.Sealed) return PASSAGE_CLOSED;
  const doors = state.derived.stationOfKind[StationKind.Doors]!;
  const occ = doors >= 0 && stationOnline(state, doors) ? state.stations.occupant[doors]! : -1;
  const level = occ >= 0 ? skillLevelOf(state, occ, Skill.Engineering) : 0;
  return PASSAGE_SEALED * (1 - SEAL_SKILL * level);                                 // a sealed door leaks less under a skilled Doors operator
}
```

(imports `stationOnline` from `../stations`, `Skill, skillLevelOf` from `../skills`, `SEAL_SKILL`.)

`interact.ts`: already multiplies by `repairMult` from Task 2.

- [ ] **Step 4: Run, typecheck, full suite**

Named files → PASS. `npm run typecheck`, `npm test`, `npm run build` → clean. The golden is unchanged: everyone in the replay is level 0 and `shedPower` is a no-op without bonus bars. If the golden fails, report BLOCKED with the output.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/power.ts src/renderer/src/sim/console.ts src/renderer/src/sim/crew.ts src/renderer/src/sim/heat.ts src/renderer/src/sim/hazards/oxygen.ts tests/interact.test.ts tests/heat.test.ts tests/oxygen.test.ts tests/power.test.ts
git commit -m "feat: skill effects: repair speed, cooling per unit, sealed-door leakage, Engineering bonus bars with power shedding"
```

---

### Task 4: HUD skills line

**Files:**
- Modify: `src/renderer/src/render/hudModel.ts`, `src/renderer/src/render/hud.ts`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Produces: `HudPlayer.skills: number[]` (six levels in `Skill` order; zeros when no state or an unjoined slot).

- [ ] **Step 1: Write the failing test**

Append to `tests/hud.test.ts` (imports: `Skill` from skills, `setSkill` from helpers):

```ts
  it('reports the six skill levels per player and zeros for empty slots or no state', () => {
    const s = makeState(2);
    setSkill(s, 0, Skill.Navigation, 1); setSkill(s, 0, Skill.Repair, 3); setSkill(s, 1, Skill.Weapons, 10);
    const m = buildHudModel(s, slots(2), 'running', '');
    expect(m.players[0]!.skills).toEqual([1, 0, 0, 0, 0, 3]); expect(m.players[1]!.skills).toEqual([0, 0, 10, 0, 0, 0]);
    expect(buildHudModel(s, slots(3), 'running', '').players[2]!.skills).toEqual([0, 0, 0, 0, 0, 0]);
    expect(buildHudModel(null, slots(1), 'lobby', '').players[0]!.skills).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it('the Engineering footer pool and the strip capacity include bonus bars while a skilled engineer sits, and drop after standing', () => {
    const s = makeState(1), eng = s.derived.stationOfKind[StationKind.Engineering]!;
    s.spawner.nextSpawnTick = 1e9; setSkill(s, 0, Skill.Engineering, 8); sitDown(s, 0, eng);
    const m1 = buildHudModel(s, slots(1), 'running', '');
    expect((m1.players[0]!.console as EngineeringPanel).pool).toBe(3); expect(m1.power).toEqual({ capacity: 12, used: 9 });
    shiftBar(s, s.derived.stationOfKind[StationKind.Science]!, 1); shiftBar(s, s.derived.stationOfKind[StationKind.Medbay]!, 1); shiftBar(s, s.derived.stationOfKind[StationKind.Medbay]!, 1);
    const m2 = buildHudModel(s, slots(1), 'running', '');
    expect((m2.players[0]!.console as EngineeringPanel).pool).toBe(0); expect(m2.power).toEqual({ capacity: 12, used: 12 });
    run(s, 1, () => intents({ cancelPressed: true }));
    expect(buildHudModel(s, slots(1), 'running', '').power).toEqual({ capacity: 10, used: 10 });
  });
```

(imports `intents` from the helpers and `EngineeringPanel` is already imported.)

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/hud.test.ts` → FAIL (`skills` undefined).

- [ ] **Step 3: HUD model and Pixi HUD**

`hudModel.ts`: `HudPlayer` gains `skills: number[];`. `EMPTY` is currently `{...} as const`, which would make the added array a readonly tuple incompatible with `number[]`: retype it as `const EMPTY: Omit<HudPlayer, 'pid' | 'status' | 'deviceKind'> = { ...existing fields, skills: [0, 0, 0, 0, 0, 0] };` and drop `as const`. In `player()` compute `const skills = Array.from({ length: SKILL_COUNT }, (_, k) => skillLevelOf(state, pid, k));` and include `skills` in every returned object (the Downed, Dead, seated and walking branches), placed after any `...EMPTY` spread so the computed value wins (imports `skillLevelOf` from `../sim/skills`, `SKILL_COUNT` from tuning). Also make the power readouts see bonus bars: the Engineering panel's `pool` becomes `powerPool(state)` and `HudModel.power.capacity` becomes `powerCapacity(state)` (import both from `../sim/power` in place of the hand-computed difference), so a seated skilled engineer sees the larger pool and the strip's `POWER n/m` denominator.

`hud.ts`: in the `players` map: `const x = 4 + i * 238, y = INTERNAL_H - 94; parent.addChild(panel(x, y, 234, 90));`; add `const line4 = new Container(); line4.position.set(0, LINE * 3);` and `progress.root.position.set(0, LINE * 4 - 6);`; `root.addChild(name, hp.root, line2, line3, line4, progress.root);` and return `line4` too. In `updatePlayer`: the `empty` and `reconnect` branches also `fillRow(ui.line4, [])`; after the line2/line3 logic for an active player: `fillRow(ui.line4, [{ text: ['N', 'E', 'W', 'S', 'C', 'R'].map((l, k) => `${l}${p.skills[k]}`).join(' '), tint: DIM }]);`.

- [ ] **Step 4: Run, typecheck, build**

`npx vitest run tests/hud.test.ts tests/render.test.ts tests/renderPure.test.ts` → PASS; `npm run typecheck`, `npm run build`, `npm test` → clean (no sim change; golden unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/render/hudModel.ts src/renderer/src/render/hud.ts tests/hud.test.ts
git commit -m "feat: HUD player panel shows the six skill levels on a fourth line"
```

---

### Task 5: Gate, spec amendments, roadmap

**Files:**
- Modify: `docs/gates.md`, `docs/superpowers/specs/2026-11-10-skills-and-xp-design.md`, `docs/roadmap.md`

- [ ] **Step 1: Gate section**

Append to `docs/gates.md`:

```markdown
## Increment 3-i: skills and XP
- [x] `npm test` passes: skills (table, cap, mapping, curve), productive predicates (every station, stamp production and expiry, unset stamps), XP flow (continuous at the observation point, shot and evasion lumps, Life Support at delivery, Repair, revive excluded), effects (repair speed at level 10 for fire, breach and power, cooling at level 5 integrated, sealed leak at level 10, output at level 10), bonus bars and shedding (order, freeze exception, downing, floor, property), snapshot round trip with stamps and version-5 rejection, HUD skills.
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with every station unmanned; the bot crew repairs fires and breaches, so Repair XP accrues during the gate (the only skill effect in play, since repair speed only rises from level 1 at 240 s of repairing).
- [ ] Manual, two players (`npm run dev`): the player panel shows `N0 E0 W0 S0 C0 R0`; sitting at Science (D(12,2)) while a `Debris` warning is in flight and repairing fires raise `S` and `R` (level 1 after about four minutes of productive time); with Engineering at level 4 (reach it, or set `XP_THRESHOLDS[4]` on a crew member in a debug build) the Engineering footer shows one more pool bar while seated; allocate the spare and the bonus bar, stand, and the strip drops one bar from Doors. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.
```

- [ ] **Step 2: Spec amendments**

Append to the spec:

```markdown
## 13. Amendments from the plan
- `shedPower` is called by the three systems that stand a player (the voluntary stand in `consoleSystem`, `failStation`, `downCrew`) right after `standUp`, not inside `standUp` (section 7): `power.ts` imports `standUp` from `stations.ts`, so the reverse would be a module cycle. It is a no-op unless usage exceeds capacity.
- `repairMult` lives in `skills.ts` next to `skillCurve`.
- `bonusBars` requires the seated operator to be Conscious and Engineering to be online; `coolingPerUnit` and `passageFor` likewise read the operator only while their station is online.
- The golden replay was re-blessed twice, not once (section 10): in Task 1 for `SIM_VERSION` 6 and the new hashed block, and in Task 2 when XP and the stamps first accrue in the replay.
- The survival gate is not XP-free (section 10): its bot crew repairs hazards and earns Repair XP; no station is manned, so no other formula moves.
- The HUD's Engineering pool and strip capacity read `powerPool` and `powerCapacity`, so bonus bars are visible (section 9 did not say so).
```

`docs/roadmap.md`: set item 1's status to `merged` and item 2's to `next`.

- [ ] **Step 3: Verify and commit**

`npm run typecheck`, `npm test`, `npm run build` → pass.

```bash
git add docs/gates.md docs/superpowers/specs/2026-11-10-skills-and-xp-design.md docs/roadmap.md
git commit -m "docs: increment 3-i gate, spec amendments, roadmap status"
```
