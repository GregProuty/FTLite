# Characters (Increment 3-ii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four pre-made characters (Okoro, Lindqvist, Reyes, Dubois) plus a neutral Recruit, each with an Asset, a Complication and a skill head start, assigned per crew member at state creation, with their traits applied as multipliers in the existing formulas and shown in the lobby, the player panel and a game-over skill summary, per `docs/superpowers/specs/2026-11-10-characters-design.md`.

**Architecture:** `state.crewCharacter` (one `CHARACTERS` index per crew member, flattened and hashed) is filled by `createSimState(layout, playerCount, seed, characters = DEFAULT_CHARACTERS)`. `sim/characters.ts` holds the data and pure trait readers `(state, pid) → multiplier`; the readers are called from `addXp`, the repair loop, `movementSystem`, `crewSystem`/`downCrew` and `coolingPerUnit`. Skill ids move to a leaf module `sim/skillIds.ts` so `characters.ts` and `skills.ts` do not import each other. The test helper `makeState` assigns Recruit to everyone unless told otherwise, so existing suites are untouched.

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), Pixi 8.19 (render task only). No new dependencies.

## Spec amendments made by this plan (recorded in Task 4)

- `Skill`, `SKILL_NAMES`, `SKILL_COUNT` use and `xpIndex` live in `sim/skillIds.ts` and are re-exported from `skills.ts` (which now imports `xpMult` from `characters.ts`; `characters.ts` imports only `skillIds.ts`, `tuning.ts` and the `SimState` type).
- Lobby display: the joined slot's name row reads `P1  Okoro` and line 2 reads `Quick Hands / Heavy Boots` (spec section 7 put the name on line 2 and the traits on line 3); lines 3 and 4 stay empty in the lobby.

## Global Constraints

- `tests/boundary.test.ts` stays green: `sim/` imports nothing from render/, input/, app/, pixi, electron; no `Math.random`, `Date`, `performance.now`, `Math.pow`; ASCII only in comments; the identifier `window` is banned in sim files.
- Every test runs under node; no test imports pixi, and no file a test imports does. `hudModel.ts` stays pixi-free.
- Determinism: no randomness added. New per-run state: `crewCharacter: Uint8Array` (per crew), flattened in a new `characters` manifest section after `skills`, snapshotted and hashed. `SIM_VERSION` becomes `7`; version-6 snapshots are rejected.
- Characters (exact): index 0 Okoro (Quick Hands, Heavy Boots, Repair 3); 1 Lindqvist (Cool Head, Flammable, Engineering 3); 2 Reyes (Iron Lungs, Slow Learner, Science 2 + Navigation 1); 3 Dubois (Sprinter, Frail, Weapons 3); 4 Recruit (none). `DEFAULT_CHARACTERS = [0, 1, 2, 3]`; a slot beyond the list gets `RECRUIT = 4`.
- Tuning (exact): `TRAIT_REPAIR_MULT = 1.25`, `TRAIT_SLOW_SPEED = 0.85`, `TRAIT_FAST_SPEED = 1.2`, `TRAIT_COOLING_BONUS = 1`, `TRAIT_FIRE_DAMAGE = 1.5`, `TRAIT_O2_DAMAGE = 0.5`, `TRAIT_XP_MULT = 0.75`, `TRAIT_BLEEDOUT = 0.6`.
- Where each multiplier applies: repair progress `DT × repairMult(level) × repairTraitMult / REPAIR_TIME_X` (fire, breach, power; not revive); movement `CREW_SPEED × speedMult`; environmental damage `FIRE_DAMAGE × fireDamageMult`, `O2_DAMAGE × o2DamageMult` (debris impact damage unchanged); `addXp` amount `× xpMult` (head starts are written directly, unscaled); `coolingPerUnit + (occ >= 0 ? coolingTraitBonus(occ) : 0)`; `downCrew` bleed `BLEEDOUT_TIME × bleedoutMult`.
- Head starts: `applyHeadStarts` writes `xp[xpIndex(pid, skill)] = XP_THRESHOLDS[level]` once at creation; Recruit writes nothing.
- The app (`session.ts`), the replay runner and the snapshot loader keep the default list (the loader's `crewCharacter` is then overwritten by `unflatten`). `tests/helpers/sim.ts`'s `makeState(players, seed, characters = RECRUITS)` with `RECRUITS = [4, 4, 4, 4]`; `tests/gate-survival.test.ts` passes `DEFAULT_CHARACTERS`.
- Commit messages: imperative, prefixed `feat:`, `test:`, `chore:` or `docs:`; the agent's attribution line as the session requires. `npm run typecheck`, `npm test` and `npm run build` pass at the end of every task.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/skillIds.ts` (new) | `Skill`, `SKILL_NAMES`, `xpIndex`. |
| `src/renderer/src/sim/characters.ts` (new) | `Asset`, `Complication`, `ASSET_NAMES`, `COMPLICATION_NAMES`, `Character`, `CHARACTERS`, `RECRUIT`, `DEFAULT_CHARACTERS`, `characterOf`, the seven trait readers, `applyHeadStarts`. |
| `src/renderer/src/sim/{skills,state,flatten,tuning,interact,movement,crew,heat}.ts` | as the tasks say. |
| `src/renderer/src/render/{hudModel,hud}.ts` | character fields, lobby lines, skills line with the name, game-over summary. |
| `tests/characters.test.ts` (new), `tests/{snapshot,hud,gate-survival}.test.ts`, `tests/helpers/sim.ts` | tests and the helper default. |
| `docs/gates.md`, spec amendments, `docs/roadmap.md` | Task 4. |

---

### Task 1: Character data, assignment state, head starts

**Files:**
- Create: `src/renderer/src/sim/skillIds.ts`, `src/renderer/src/sim/characters.ts`
- Modify: `src/renderer/src/sim/skills.ts`, `state.ts`, `flatten.ts`, `tuning.ts`, `tests/helpers/sim.ts`, `tests/gate-survival.test.ts`
- Test: `tests/characters.test.ts` (new), `tests/snapshot.test.ts`, `tests/golden/basic.json` (re-bless)

**Interfaces:**
- Produces: everything in `characters.ts` and `skillIds.ts` (above); `SimState.crewCharacter: Uint8Array`; `createSimState(layout, playerCount, seed, characters: readonly number[] = DEFAULT_CHARACTERS)`; `makeState(players = 2, seed = 1, characters: readonly number[] = RECRUITS)` and `RECRUITS` exported from the helpers.

- [ ] **Step 1: Write the failing tests**

Create `tests/characters.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CHARACTERS, RECRUIT, DEFAULT_CHARACTERS, Asset, Complication, characterOf, repairTraitMult, speedMult, fireDamageMult, o2DamageMult, xpMult, coolingTraitBonus, bleedoutMult } from '../src/renderer/src/sim/characters';
import { Skill, xpIndex, skillCurve } from '../src/renderer/src/sim/skills';
import { createSimState } from '../src/renderer/src/sim/state';
import { saveSnapshot, loadSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown, stationOutput } from '../src/renderer/src/sim/stations';
import { SKILL_COUNT, XP_THRESHOLDS, STATION_MAX } from '../src/renderer/src/sim/tuning';
import { LAYOUT, makeState, RECRUITS } from './helpers/sim';

describe('character data', () => {
  it('four playable characters with distinct names and traits on different mechanics; Recruit is neutral', () => {
    const playable = CHARACTERS.slice(0, 4);
    expect(new Set(playable.map((c) => c.name)).size).toBe(4);
    for (const c of playable) { expect(c.asset).not.toBe(Asset.None); expect(c.complication).not.toBe(Complication.None); expect(c.headStart.length).toBeGreaterThan(0); }
    expect(new Set(playable.map((c) => c.asset)).size).toBe(4); expect(new Set(playable.map((c) => c.complication)).size).toBe(4);
    const r = CHARACTERS[RECRUIT]!;
    expect(r.name).toBe('Recruit'); expect(r.asset).toBe(Asset.None); expect(r.complication).toBe(Complication.None); expect(r.headStart).toEqual([]);
    expect(DEFAULT_CHARACTERS).toEqual([0, 1, 2, 3]);
  });
  it('trait readers return the neutral value for Recruit and the tuned value for the owner', () => {
    const s = makeState(4, 1, DEFAULT_CHARACTERS), n = makeState(1);
    expect(repairTraitMult(s, 0)).toBe(1.25); expect(repairTraitMult(s, 1)).toBe(1); expect(repairTraitMult(n, 0)).toBe(1);
    expect(speedMult(s, 0)).toBe(0.85); expect(speedMult(s, 3)).toBe(1.2); expect(speedMult(s, 1)).toBe(1); expect(speedMult(n, 0)).toBe(1);
    expect(fireDamageMult(s, 1)).toBe(1.5); expect(fireDamageMult(s, 0)).toBe(1);
    expect(o2DamageMult(s, 2)).toBe(0.5); expect(o2DamageMult(s, 0)).toBe(1);
    expect(xpMult(s, 2)).toBe(0.75); expect(xpMult(s, 0)).toBe(1);
    expect(coolingTraitBonus(s, 1)).toBe(1); expect(coolingTraitBonus(s, 0)).toBe(0);
    expect(bleedoutMult(s, 3)).toBe(0.6); expect(bleedoutMult(s, 0)).toBe(1);
    expect(characterOf(n, 0).name).toBe('Recruit');
  });
});

describe('assignment and head starts', () => {
  it('createSimState assigns the default list, falls back to Recruit beyond it, and writes the exact head-start XP matrix', () => {
    const s = createSimState(LAYOUT, 4, 1);
    expect(Array.from(s.crewCharacter)).toEqual([0, 1, 2, 3]);
    const expected = new Float64Array(4 * SKILL_COUNT);
    expected[xpIndex(0, Skill.Repair)] = XP_THRESHOLDS[3]!; expected[xpIndex(1, Skill.Engineering)] = XP_THRESHOLDS[3]!;
    expected[xpIndex(2, Skill.Science)] = XP_THRESHOLDS[2]!; expected[xpIndex(2, Skill.Navigation)] = XP_THRESHOLDS[1]!;     // Reyes: unscaled by Slow Learner
    expected[xpIndex(3, Skill.Weapons)] = XP_THRESHOLDS[3]!;
    expect(Array.from(s.skills.xp)).toEqual(Array.from(expected));
    const short = createSimState(LAYOUT, 3, 1, [2]);
    expect(Array.from(short.crewCharacter)).toEqual([2, RECRUIT, RECRUIT]);
    const neutral = makeState(2);
    expect(Array.from(neutral.crewCharacter)).toEqual([RECRUIT, RECRUIT]); expect(Array.from(neutral.skills.xp).every((v) => v === 0)).toBe(true);
    expect(RECRUITS).toEqual([4, 4, 4, 4]);
  });
  it('crewCharacter round-trips through a snapshot (a non-default assignment, which the loader cannot recreate) and alone changes the hash', () => {
    const s = makeState(2, 5, [3, 2]);
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(Array.from(t.crewCharacter)).toEqual([3, 2]); expect(hashState(t)).toBe(hashState(s));
    const u = makeState(2, 5, [3, 2]); u.crewCharacter[1] = RECRUIT;                                      // only the assignment byte differs: XP was written at creation for [3, 2]
    expect(Array.from(u.skills.xp)).toEqual(Array.from(s.skills.xp)); expect(hashState(u)).not.toBe(hashState(s));
  });
  it('Dubois seated at Weapons runs it at level 3 output', () => {
    const s = createSimState(LAYOUT, 4, 1), wpn = s.derived.stationOfKind[StationKind.Weapons]!;
    sitDown(s, 3, wpn);
    expect(stationOutput(s, wpn)).toBeCloseTo((2 / STATION_MAX[StationKind.Weapons]!) * skillCurve(3));
  });
});
```

In `tests/snapshot.test.ts` change the version test to 6 → 7 (title "rejects a version-6 snapshot ...", `simVersion: 6`, `values[0] = 6`).

In `tests/helpers/sim.ts`: `import { RECRUIT } from '../../src/renderer/src/sim/characters';`, `export const RECRUITS: readonly number[] = [RECRUIT, RECRUIT, RECRUIT, RECRUIT];`, and

```ts
export function makeState(players = 2, seed = 1, characters: readonly number[] = RECRUITS): SimState {
  return createSimState(LAYOUT, players, seed, characters);
}
```

In `tests/gate-survival.test.ts`: `import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';` and `const s = makeState(2, seed, DEFAULT_CHARACTERS);` (the bot crew is Okoro and Lindqvist).

- [ ] **Step 2: Run the tests to verify they fail**

`npx vitest run tests/characters.test.ts tests/snapshot.test.ts` → FAIL (modules missing; `crewCharacter` undefined; version-6 accepted).

- [ ] **Step 3: Implement**

`tuning.ts`: `SIM_VERSION = 7`; append

```ts
// Characters (increment 3-ii): Assets and Complications as multipliers on existing formulas
export const TRAIT_REPAIR_MULT = 1.25;        // Quick Hands
export const TRAIT_SLOW_SPEED = 0.85;         // Heavy Boots
export const TRAIT_FAST_SPEED = 1.2;          // Sprinter
export const TRAIT_COOLING_BONUS = 1;         // Cool Head, per coolant unit while seated at Engineering
export const TRAIT_FIRE_DAMAGE = 1.5;         // Flammable
export const TRAIT_O2_DAMAGE = 0.5;           // Iron Lungs
export const TRAIT_XP_MULT = 0.75;            // Slow Learner
export const TRAIT_BLEEDOUT = 0.6;            // Frail
```

Create `skillIds.ts` (moved out of `skills.ts` verbatim):

```ts
import { SKILL_COUNT } from './tuning';

export const Skill = { Navigation: 0, Engineering: 1, Weapons: 2, Science: 3, Combat: 4, Repair: 5 } as const;
export const SKILL_NAMES = ['Navigation', 'Engineering', 'Weapons', 'Science', 'Combat', 'Repair'] as const;
export function xpIndex(pid: number, skill: number): number { return pid * SKILL_COUNT + skill; }
```

`skills.ts`: delete those three definitions, add `import { Skill, SKILL_NAMES, xpIndex } from './skillIds'; export { Skill, SKILL_NAMES, xpIndex };` (keep `STATION_SKILL` here, it uses `Skill`), and change `addXp`:

```ts
/** XP only ever rises (a non-positive amount is ignored), scaled by the crew member's learning trait, capped at the top threshold. */
export function addXp(state: SimState, pid: number, skill: number, amount: number): void {
  if (amount <= 0) return;
  const k = xpIndex(pid, skill);
  state.skills.xp[k] = Math.min(XP_THRESHOLDS[SKILL_MAX]!, state.skills.xp[k]! + amount * xpMult(state, pid));
}
```

(import `xpMult` from `./characters`.)

Create `characters.ts`:

```ts
import type { SimState } from './state';
import { Skill, xpIndex } from './skillIds';
import { XP_THRESHOLDS, TRAIT_REPAIR_MULT, TRAIT_SLOW_SPEED, TRAIT_FAST_SPEED, TRAIT_COOLING_BONUS, TRAIT_FIRE_DAMAGE, TRAIT_O2_DAMAGE, TRAIT_XP_MULT, TRAIT_BLEEDOUT } from './tuning';

export const Asset = { None: 0, QuickHands: 1, CoolHead: 2, IronLungs: 3, Sprinter: 4 } as const;
export const Complication = { None: 0, HeavyBoots: 1, Flammable: 2, SlowLearner: 3, Frail: 4 } as const;
export const ASSET_NAMES = ['', 'Quick Hands', 'Cool Head', 'Iron Lungs', 'Sprinter'] as const;
export const COMPLICATION_NAMES = ['', 'Heavy Boots', 'Flammable', 'Slow Learner', 'Frail'] as const;

export interface Character { name: string; asset: number; complication: number; headStart: readonly { skill: number; level: number }[] }

/** The pre-made crew (spec 3-ii section 3). Index 4, Recruit, is the trait-free baseline used by tests and by any slot beyond the default list. */
export const CHARACTERS: readonly Character[] = [
  { name: 'Okoro', asset: Asset.QuickHands, complication: Complication.HeavyBoots, headStart: [{ skill: Skill.Repair, level: 3 }] },
  { name: 'Lindqvist', asset: Asset.CoolHead, complication: Complication.Flammable, headStart: [{ skill: Skill.Engineering, level: 3 }] },
  { name: 'Reyes', asset: Asset.IronLungs, complication: Complication.SlowLearner, headStart: [{ skill: Skill.Science, level: 2 }, { skill: Skill.Navigation, level: 1 }] },
  { name: 'Dubois', asset: Asset.Sprinter, complication: Complication.Frail, headStart: [{ skill: Skill.Weapons, level: 3 }] },
  { name: 'Recruit', asset: Asset.None, complication: Complication.None, headStart: [] }
];
export const RECRUIT = 4;
export const DEFAULT_CHARACTERS: readonly number[] = [0, 1, 2, 3];

export function characterOf(state: SimState, pid: number): Character {
  return CHARACTERS[state.crewCharacter[pid]!] ?? CHARACTERS[RECRUIT]!;
}

export function repairTraitMult(state: SimState, pid: number): number { return characterOf(state, pid).asset === Asset.QuickHands ? TRAIT_REPAIR_MULT : 1; }
export function speedMult(state: SimState, pid: number): number {
  const c = characterOf(state, pid);
  return c.asset === Asset.Sprinter ? TRAIT_FAST_SPEED : c.complication === Complication.HeavyBoots ? TRAIT_SLOW_SPEED : 1;
}
export function fireDamageMult(state: SimState, pid: number): number { return characterOf(state, pid).complication === Complication.Flammable ? TRAIT_FIRE_DAMAGE : 1; }
export function o2DamageMult(state: SimState, pid: number): number { return characterOf(state, pid).asset === Asset.IronLungs ? TRAIT_O2_DAMAGE : 1; }
export function xpMult(state: SimState, pid: number): number { return characterOf(state, pid).complication === Complication.SlowLearner ? TRAIT_XP_MULT : 1; }
export function coolingTraitBonus(state: SimState, pid: number): number { return characterOf(state, pid).asset === Asset.CoolHead ? TRAIT_COOLING_BONUS : 0; }
export function bleedoutMult(state: SimState, pid: number): number { return characterOf(state, pid).complication === Complication.Frail ? TRAIT_BLEEDOUT : 1; }

/** Write each crew member's head-start levels as XP, once, at creation. Not scaled by Slow Learner. */
export function applyHeadStarts(state: SimState): void {
  for (let pid = 0; pid < state.playerCount; pid++) for (const h of characterOf(state, pid).headStart) state.skills.xp[xpIndex(pid, h.skill)] = XP_THRESHOLDS[h.level]!;
}
```

`state.ts`: add `crewCharacter: Uint8Array;   // CHARACTERS index per crew member (spec 3-ii section 4)` to `SimState`; signature `createSimState(layout: ShipLayout, playerCount: number, seed: number, characters: readonly number[] = DEFAULT_CHARACTERS)`; initialiser `crewCharacter: Uint8Array.from({ length: playerCount }, (_, pid) => characters[pid] ?? RECRUIT)`; after the crew spawn loop `applyHeadStarts(state);` (import `DEFAULT_CHARACTERS, RECRUIT, applyHeadStarts` from `./characters`).

`flatten.ts`: manifest `[..., 'skills', 'characters', 'crew']`; `size()` adds `s.crew.length` (one character byte per crew); in `flatten` after the four stamps: `for (const v of s.crewCharacter) put(v);`; in `unflatten`: `for (let p = 0; p < s.crewCharacter.length; p++) s.crewCharacter[p] = get();` in the same place.

- [ ] **Step 4: Run, typecheck, re-bless**

`npx vitest run tests/characters.test.ts tests/snapshot.test.ts tests/skills.test.ts tests/state.test.ts tests/gate-survival.test.ts` → PASS. `npm run typecheck` → clean. `npm test` → the golden fails (version 7, the new field, head starts for the default crew); `npm run bless`; `npm test` → PASS (if the survival gate fails with the default crew, report BLOCKED with the output). `npm run build` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/skillIds.ts src/renderer/src/sim/characters.ts src/renderer/src/sim/skills.ts src/renderer/src/sim/state.ts src/renderer/src/sim/flatten.ts src/renderer/src/sim/tuning.ts tests/helpers/sim.ts tests/gate-survival.test.ts tests/characters.test.ts tests/snapshot.test.ts tests/golden/basic.json
git commit -m "feat: four pre-made characters with Assets, Complications and head starts; per-crew character assignment hashed; SIM_VERSION 7

Golden re-blessed: SIM_VERSION 7, the crewCharacter field, and head-start XP for the default crew (Okoro, Lindqvist). Traits have no effect yet; the next task applies them."
```

---

### Task 2: Trait effects in the sim

**Files:**
- Modify: `src/renderer/src/sim/{interact,movement,crew,heat}.ts`
- Test: `tests/characters.test.ts`, `tests/golden/basic.json` (re-bless: Okoro and Lindqvist's traits now act in the replay)

**Interfaces:**
- Consumes: Task 1's readers. Produces: the multipliers applied where the Global Constraints say.

- [ ] **Step 1: Write the failing tests**

Append to `tests/characters.test.ts` (imports to add: `Health, Life, LifeState, Position` from components; `coolingPerUnit` from heat; `debrisSystem` from debris; `igniteRoom` from hazards/fire; `activateBreach` from hazards/breach; `failStation` from power; `downCrew, reviveCrew` from crew; `Weapon` from weapons; `repairMult, addXp` from skills; `DT, HAZARD_DT, HAZARD_EVERY, CREW_SPEED, FIRE_DAMAGE, O2_DAMAGE, BLEEDOUT_TIME, HEALTH_MAX, HEAT_COOL_UNIT, HEAT_COOL_SKILL, REPAIR_TIME_FIRE, REPAIR_TIME_BREACH, REPAIR_TIME_POWER, REVIVE_TIME, XP_RATE, XP_PER_SHOT, XP_PER_EVADE_ROLL, DEBRIS_CREW_DAMAGE, TRAIT_REPAIR_MULT, TRAIT_SLOW_SPEED, TRAIT_FAST_SPEED, TRAIT_FIRE_DAMAGE, TRAIT_O2_DAMAGE, TRAIT_XP_MULT, TRAIT_BLEEDOUT` from tuning; `intents, run, teleport, room, seconds, placeDebris` from the helpers; `StationKind`):

```ts
const idx = (s: ReturnType<typeof makeState>, kind: number) => s.derived.stationOfKind[kind]!;
const xp = (s: ReturnType<typeof makeState>, pid: number, skill: number) => s.skills.xp[xpIndex(pid, skill)]!;
/** Ticks until a repair of time T completes at combined multiplier m, exactly: the first tick whose accumulated progress reaches 1. */
const ticksFor = (T: number, m: number) => Math.ceil(T / (m * DT) - 1e-9);

describe('trait effects', () => {
  it('Quick Hands with Repair 3 repairs a fire and a power failure in 6 / 1.475 s and a breach in 8 / 1.475 s; a Recruit partner adds only their own rate; revive is unchanged', () => {
    const m = TRAIT_REPAIR_MULT * repairMult(3);
    expect(m).toBeCloseTo(1.475);
    const fire = makeState(1, 1, DEFAULT_CHARACTERS), G = room(fire, 'G'); fire.spawner.nextSpawnTick = 1e9; igniteRoom(fire, G); teleport(fire, 0, 2.5, 9.5);
    const nF = ticksFor(REPAIR_TIME_FIRE, m);
    run(fire, nF - 2, () => intents({ interactHeld: true })); expect(fire.rooms.fire[G]).toBeGreaterThan(0);
    run(fire, 4, () => intents({ interactHeld: true })); expect(fire.rooms.fire[G]).toBe(0);
    const br = makeState(1, 1, DEFAULT_CHARACTERS); br.spawner.nextSpawnTick = 1e9; activateBreach(br, 6); teleport(br, 0, 2.5, 10.5);
    const nB = ticksFor(REPAIR_TIME_BREACH, m);
    run(br, nB - 2, () => intents({ interactHeld: true })); expect(br.breaches.active[6]).toBe(1);
    run(br, 4, () => intents({ interactHeld: true })); expect(br.breaches.active[6]).toBe(0);
    const pw = makeState(1, 1, DEFAULT_CHARACTERS), eng = idx(pw, StationKind.Engineering); pw.spawner.nextSpawnTick = 1e9; failStation(pw, eng); teleport(pw, 0, 18.5, 9.5);
    const nP = ticksFor(REPAIR_TIME_POWER, m);
    run(pw, nP - 2, () => intents({ interactHeld: true })); expect(pw.stations.failed[eng]).toBe(1);
    run(pw, 4, () => intents({ interactHeld: true })); expect(pw.stations.failed[eng]).toBe(0);
    const two = makeState(2, 1, DEFAULT_CHARACTERS), G2 = room(two, 'G'); two.spawner.nextSpawnTick = 1e9; igniteRoom(two, G2); teleport(two, 0, 2.5, 9.5); teleport(two, 1, 3.5, 9.5);
    run(two, 1, () => intents({ interactHeld: true }, { interactHeld: true }));
    expect(two.rooms.fireRepair[G2]).toBeCloseTo(DT * (m + 1) / REPAIR_TIME_FIRE, 12);                   // Okoro's 1.475 plus Lindqvist's 1 (Repair 0, no repair trait)
    const rv = makeState(2, 1, DEFAULT_CHARACTERS); rv.spawner.nextSpawnTick = 1e9;
    Life.state[rv.crew[1]!] = LifeState.Downed; Life.bleed[rv.crew[1]!] = 30; teleport(rv, 0, 2.5, 9.5); teleport(rv, 1, 3.0, 9.5);
    run(rv, seconds(REVIVE_TIME) - 2, () => intents({ interactHeld: true }, {})); expect(Life.state[rv.crew[1]!]).toBe(LifeState.Downed);
    run(rv, 3, () => intents({ interactHeld: true }, {})); expect(Life.state[rv.crew[1]!]).toBe(LifeState.Conscious);
  });
  it('Heavy Boots walks at 0.85 x and Sprinter at 1.2 x CREW_SPEED; a Recruit at 1 x', () => {
    const s = makeState(4, 1, DEFAULT_CHARACTERS);
    for (const pid of [0, 3]) teleport(s, pid, 10, 5.5);                                                   // open corridor floor
    run(s, 60, () => intents({ moveX: 1 }, {}, {}, { moveX: 1 }));
    expect(Position.x[s.crew[0]!]).toBeCloseTo(10 + CREW_SPEED * TRAIT_SLOW_SPEED, 3);
    expect(Position.x[s.crew[3]!]).toBeCloseTo(10 + CREW_SPEED * TRAIT_FAST_SPEED, 3);
    const n = makeState(1); teleport(n, 0, 10, 5.5); run(n, 60, () => intents({ moveX: 1 }));
    expect(Position.x[n.crew[0]!]).toBeCloseTo(10 + CREW_SPEED, 3);
  });
  it('Cool Head adds one cooling per unit on top of the skill term while seated; Okoro adds none', () => {
    const s = makeState(2, 1, DEFAULT_CHARACTERS), eng = idx(s, StationKind.Engineering);
    s.spawner.nextSpawnTick = 1e9;
    expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT);
    sitDown(s, 1, eng);                                                                                   // Lindqvist: Engineering 3
    expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT + 1 + Math.floor(HEAT_COOL_SKILL * 3));
    run(s, 1, () => intents({}, { cancelPressed: true })); sitDown(s, 0, eng);                             // Okoro: Engineering 0, no trait
    expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT);
  });
  it('Flammable takes 1.5 x fire damage, Iron Lungs 0.5 x suffocation damage; a debris impact ignores both', () => {
    const s = makeState(3, 1, DEFAULT_CHARACTERS), G = room(s, 'G');
    s.spawner.nextSpawnTick = 1e9;
    for (const pid of [0, 1, 2]) teleport(s, pid, 2.5, 9.5);
    igniteRoom(s, G);
    run(s, 1);
    expect(HEALTH_MAX - Health.cur[s.crew[0]!]!).toBeCloseTo(FIRE_DAMAGE * DT, 9);
    expect(HEALTH_MAX - Health.cur[s.crew[1]!]!).toBeCloseTo(FIRE_DAMAGE * TRAIT_FIRE_DAMAGE * DT, 9);
    const t = makeState(3, 1, DEFAULT_CHARACTERS), G2 = room(t, 'G');
    t.spawner.nextSpawnTick = 1e9; for (const pid of [0, 1, 2]) teleport(t, pid, 2.5, 9.5);
    t.rooms.o2[G2] = 0; t.doors.state.fill(2);
    run(t, 1);
    expect(HEALTH_MAX - Health.cur[t.crew[0]!]!).toBeCloseTo(O2_DAMAGE * DT, 9);
    expect(HEALTH_MAX - Health.cur[t.crew[2]!]!).toBeCloseTo(O2_DAMAGE * TRAIT_O2_DAMAGE * DT, 9);
    const d = makeState(2, 1, DEFAULT_CHARACTERS), A = room(d, 'A');
    d.spawner.nextSpawnTick = 1e9; teleport(d, 1, 2.5, 2.5); d.rng.combat.s = 36;
    placeDebris(d, A, 0, 1); debrisSystem(d);                                                             // the impact alone: through step() the fire it may start would add environmental damage this tick
    expect(HEALTH_MAX - Health.cur[d.crew[1]!]!).toBeCloseTo(DEBRIS_CREW_DAMAGE, 9);                      // Lindqvist in the hit room: no fire multiplier on impacts
  });
  it('Slow Learner scales every XP path by 0.75 while Okoro earns the full amounts', () => {
    const s = makeState(3, 1, DEFAULT_CHARACTERS);
    addXp(s, 0, Skill.Combat, 100); addXp(s, 2, Skill.Combat, 100);
    expect(xp(s, 0, Skill.Combat)).toBe(100); expect(xp(s, 2, Skill.Combat)).toBe(75);
    const nav = makeState(3, 1, DEFAULT_CHARACTERS), navI = idx(nav, StationKind.Navigation), A = room(nav, 'A');
    nav.spawner.nextSpawnTick = 1e9; sitDown(nav, 2, navI); placeDebris(nav, A, 1e6, 1);
    const before = xp(nav, 2, Skill.Navigation); run(nav, 1);
    expect(xp(nav, 2, Skill.Navigation) - before).toBeCloseTo(TRAIT_XP_MULT * XP_RATE * DT, 12);
    nav.rng.combat.s = 36; placeDebris(nav, A, 0, 1); const b2 = xp(nav, 2, Skill.Navigation); run(nav, 1);
    expect(xp(nav, 2, Skill.Navigation) - b2).toBeCloseTo(TRAIT_XP_MULT * (XP_RATE * DT + XP_PER_EVADE_ROLL), 9);
    const w = makeState(3, 1, DEFAULT_CHARACTERS), wpn = idx(w, StationKind.Weapons);
    w.spawner.nextSpawnTick = 1e9; placeDebris(w, A, 1e6, 1); sitDown(w, 2, wpn); w.weapons.charge = 1; w.weapons.selector = Weapon.BeamF1; w.rng.combat.s = 36;
    run(w, 1, () => intents({}, {}, { confirmPressed: true }));
    expect(xp(w, 2, Skill.Weapons)).toBeCloseTo(TRAIT_XP_MULT * XP_PER_SHOT, 9);
    const ls = makeState(3, 1, DEFAULT_CHARACTERS), lsI = idx(ls, StationKind.LifeSupport);
    ls.spawner.nextSpawnTick = 1e9; ls.rooms.o2[A] = 0; sitDown(ls, 2, lsI);
    run(ls, 1);                                                                                           // hazard tick 0 delivers with Reyes seated
    expect(xp(ls, 2, Skill.Engineering)).toBeCloseTo(TRAIT_XP_MULT * XP_RATE * HAZARD_DT, 9);
    const rp = makeState(3, 1, DEFAULT_CHARACTERS), G = room(rp, 'G');
    rp.spawner.nextSpawnTick = 1e9; igniteRoom(rp, G); teleport(rp, 2, 2.5, 9.5);
    run(rp, 1, () => intents({}, {}, { interactHeld: true }));
    expect(xp(rp, 2, Skill.Repair)).toBeCloseTo(TRAIT_XP_MULT * XP_RATE * DT, 12);
  });
  it('Frail bleeds out from 18 s and dies in 18 s on clean floor or 9 s in fire or low oxygen; Okoro starts at 30 s', () => {
    const mk = () => { const s = makeState(4, 1, DEFAULT_CHARACTERS); s.spawner.nextSpawnTick = 1e9; teleport(s, 0, 20.5, 5.5); teleport(s, 1, 20.5, 5.5); teleport(s, 2, 20.5, 5.5); teleport(s, 3, 2.5, 9.5); return s; };
    const a = mk(); downCrew(a, 3); downCrew(a, 0);
    expect(Life.bleed[a.crew[3]!]).toBeCloseTo(BLEEDOUT_TIME * TRAIT_BLEEDOUT); expect(Life.bleed[a.crew[0]!]).toBe(BLEEDOUT_TIME);
    reviveCrew(a, a.crew[0]!);
    run(a, seconds(BLEEDOUT_TIME * TRAIT_BLEEDOUT) - 1); expect(Life.state[a.crew[3]!]).toBe(LifeState.Downed);
    run(a, 2); expect(Life.state[a.crew[3]!]).toBe(LifeState.Dead); expect(a.ended).toBe(0);
    const b = mk(); downCrew(b, 3); igniteRoom(b, room(b, 'G'));
    run(b, seconds(BLEEDOUT_TIME * TRAIT_BLEEDOUT / 2) - 1); expect(Life.state[b.crew[3]!]).toBe(LifeState.Downed);
    run(b, 2); expect(Life.state[b.crew[3]!]).toBe(LifeState.Dead);
    const c = mk(); downCrew(c, 3); c.rooms.o2[room(c, 'G')] = 0; c.doors.state.fill(2); c.stations.level[idx(c, StationKind.LifeSupport)] = 0;   // Life Support off, or injection refills G within nine seconds
    run(c, seconds(BLEEDOUT_TIME * TRAIT_BLEEDOUT / 2) - 1); expect(Life.state[c.crew[3]!]).toBe(LifeState.Downed);
    run(c, 2); expect(Life.state[c.crew[3]!]).toBe(LifeState.Dead);
  });
});
```

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/characters.test.ts` → the five new tests FAIL (traits not applied).

- [ ] **Step 3: Implement**

`interact.ts`: the three progress lines multiply by `repairTraitMult(state, pid)` as well: `state.rooms.fireRepair[t.index]! += DT * repairMult(level) * repairTraitMult(state, pid) / REPAIR_TIME_FIRE;` (and the breach and power lines alike; compute `const trait = repairTraitMult(state, pid);` once per repairer next to `level`). Import `repairTraitMult` from `./characters`.

`movement.ts`: `const p = moveAABB(solid, Position.x[eid]!, Position.y[eid]!, it.moveX * CREW_SPEED * speedMult(state, pid) * DT, it.moveY * CREW_SPEED * speedMult(state, pid) * DT, CREW_HALF);` (import `speedMult`).

`crew.ts`: `const dmg = (inFire ? FIRE_DAMAGE * fireDamageMult(state, pid) : 0) + (lowO2 ? O2_DAMAGE * o2DamageMult(state, pid) : 0);` and in `downCrew`: `Life.bleed[eid] = BLEEDOUT_TIME * bleedoutMult(state, pid);` (import the three readers).

`heat.ts` `coolingPerUnit`: `return HEAT_COOL_UNIT + Math.floor(HEAT_COOL_SKILL * level) + (occ >= 0 ? coolingTraitBonus(state, occ) : 0);` (import `coolingTraitBonus`).

- [ ] **Step 4: Run, typecheck, re-bless**

`npx vitest run tests/characters.test.ts tests/interact.test.ts tests/movement.test.ts tests/crew.test.ts tests/heat.test.ts tests/xp.test.ts` → PASS (existing suites use Recruits and are unaffected). `npm run typecheck` → clean. `npm test` → the golden fails (Okoro's repair speed and walking speed and Lindqvist's traits now act in the replay); `npm run bless`; `npm test` → PASS. If the survival gate fails, report BLOCKED with the output. `npm run build` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/interact.ts src/renderer/src/sim/movement.ts src/renderer/src/sim/crew.ts src/renderer/src/sim/heat.ts tests/characters.test.ts tests/golden/basic.json
git commit -m "feat: Assets and Complications act: repair, speed, fire and suffocation damage, XP rate, cooling and bleed-out multipliers

Golden re-blessed: the default crew's traits now change the replay (Okoro repairs faster and walks slower; Lindqvist takes more fire damage)."
```

---

### Task 3: HUD: character identity, lobby lines, game-over summary

**Files:**
- Modify: `src/renderer/src/render/hudModel.ts`, `src/renderer/src/render/hud.ts`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Produces: `HudPlayer.character: { name: string; asset: string; complication: string }`; `HudModel.summary: string[] | null`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hud.test.ts` (imports to add: `DEFAULT_CHARACTERS` from characters, `Skill` is present, `setSkill`, `makeState`):

```ts
  it('reports each slot\'s character with trait names, from the state when there is one and from the default list otherwise', () => {
    const s = makeState(2, 1, DEFAULT_CHARACTERS);
    const m = buildHudModel(s, slots(3), 'running', '');
    expect(m.players[0]!.character).toEqual({ name: 'Okoro', asset: 'Quick Hands', complication: 'Heavy Boots' });
    expect(m.players[1]!.character).toEqual({ name: 'Lindqvist', asset: 'Cool Head', complication: 'Flammable' });
    expect(m.players[2]!.character).toEqual({ name: 'Reyes', asset: 'Iron Lungs', complication: 'Slow Learner' });   // slot beyond the crew: the default list
    const lobby = buildHudModel(null, slots(4), 'lobby', '');
    expect(lobby.players[3]!.character).toEqual({ name: 'Dubois', asset: 'Sprinter', complication: 'Frail' });
    expect(buildHudModel(makeState(1), slots(1), 'running', '').players[0]!.character).toEqual({ name: 'Recruit', asset: '', complication: '' });
    expect(m.players[1]!.skills).toEqual([0, 3, 0, 0, 0, 0]);                                              // Lindqvist's head start shows as a level
  });
  it('the game-over summary lists each crew member\'s skill gains above the head start, and is null in every other phase', () => {
    const s = makeState(3, 1, DEFAULT_CHARACTERS);
    setSkill(s, 2, Skill.Science, 3); setSkill(s, 0, Skill.Repair, 4); setSkill(s, 0, Skill.Navigation, 1);
    const over = buildHudModel(s, slots(3), 'gameover', 'HULL LOST');
    expect(over.summary).toEqual(['Okoro: Navigation 0 -> 1, Repair 3 -> 4', 'Lindqvist: no skill gains', 'Reyes: Science 2 -> 3']);
    for (const phase of ['lobby', 'paused', 'running'] as const) expect(buildHudModel(s, slots(3), phase, '').summary).toBeNull();
    expect(buildHudModel(null, slots(1), 'gameover', '').summary).toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/hud.test.ts` → FAIL.

- [ ] **Step 3: HUD model**

`hudModel.ts`: import `CHARACTERS, DEFAULT_CHARACTERS, RECRUIT, characterOf, ASSET_NAMES, COMPLICATION_NAMES, type Character` from `../sim/characters`, `levelFor` and `SKILL_NAMES` from `../sim/skills`. Types: `export interface HudCharacter { name: string; asset: string; complication: string }`, `HudPlayer.character: HudCharacter`, `HudModel.summary: string[] | null`. Helper `const describe = (c: Character): HudCharacter => ({ name: c.name, asset: ASSET_NAMES[c.asset]!, complication: COMPLICATION_NAMES[c.complication]! });`. In `player()`: `character: describe(characterOf(state, pid))` added to `base`. `EMPTY` gets `character: describe(CHARACTERS[RECRUIT]!)`; the missing-player branch in `buildHudModel` overrides it: `{ ...head, ...EMPTY, skills: [0, 0, 0, 0, 0, 0], character: describe(CHARACTERS[DEFAULT_CHARACTERS[pid] ?? RECRUIT]!) }`. Summary:

```ts
function gainsSummary(state: SimState): string[] {
  return state.crew.map((_, pid) => {
    const c = characterOf(state, pid), parts: string[] = [];
    for (let k = 0; k < SKILL_COUNT; k++) {
      const base = c.headStart.find((h) => h.skill === k)?.level ?? 0, now = skillLevelOf(state, pid, k);
      if (now > base) parts.push(`${SKILL_NAMES[k]} ${base} -> ${now}`);
    }
    return `${c.name}: ${parts.length ? parts.join(', ') : 'no skill gains'}`;
  });
}
```

and in the returned model `summary: state && phase === 'gameover' ? gainsSummary(state) : null`.

- [ ] **Step 4: Pixi HUD**

`hud.ts`: `updatePlayer(ui, p, i, phase)` gains the phase. For an active player in the `lobby` phase: `ui.name.text = \`P${i + 1}  ${p.character.name}\`; ui.hp.root.visible = false; fillRow(ui.line2, [{ text: p.character.asset && p.character.complication ? \`${p.character.asset} / ${p.character.complication}\` : '', tint: DIM }]); fillRow(ui.line3, []); fillRow(ui.line4, []); ui.progress.root.visible = false; ui.consoleRoot.visible = false; if (ui.oxygen) ui.oxygen.visible = false; return;` placed after the `reconnect` branch. In every other phase the skills line becomes `fillRow(ui.line4, [{ text: \`${p.character.name}  ${SKILL_NAMES.map(...).join(' ')}\`, tint: DIM }])`. Add four summary texts: `const summaryRows = Array.from({ length: 4 }, (_, k) => { const t = text(16, DIM); t.anchor.set(0.5, 0); t.position.set(INTERNAL_W / 2, 88 + k * LINE); t.visible = false; parent.addChild(t); return t; });` created after `bannerGlyphs`; in `update`: `summaryRows.forEach((t, k) => { const line = m.summary?.[k]; t.visible = !!line; t.text = line ?? ''; });` and call `updatePlayer(players[i]!, p, i, m.phase)`.

- [ ] **Step 5: Run, typecheck, build**

`npx vitest run tests/hud.test.ts tests/render.test.ts tests/renderPure.test.ts` → PASS; `npm run typecheck`, `npm run build`, `npm test` → clean (no sim change; golden unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/hudModel.ts src/renderer/src/render/hud.ts tests/hud.test.ts
git commit -m "feat: HUD shows each slot's character and traits in the lobby, the name on the skills line, and skill gains at game over"
```

---

### Task 4: Gate, spec amendments, roadmap

**Files:**
- Modify: `docs/gates.md`, `docs/superpowers/specs/2026-11-10-characters-design.md`, `docs/roadmap.md`

- [ ] **Step 1: Gate section**

Append to `docs/gates.md`:

```markdown
## Increment 3-ii: characters (closes the foundation's Increment 3)
- [x] `npm test` passes: characters (data, readers, default and fallback assignment, exact head-start matrix, snapshot of the assignment, every trait effect incl. the combined Okoro repair time, Slow Learner on all five XP paths, Frail under hazards), snapshot version-6 rejection, HUD character fields and game-over summary gating.
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with the default crew (Okoro and Lindqvist).
- [ ] Manual, two players (`npm run dev`): the lobby shows `P1  Okoro` / `Quick Hands / Heavy Boots` and `P2  Lindqvist` / `Cool Head / Flammable` once joined; in the run Okoro's panel reads `Okoro  N0 E0 W0 S0 C0 R3` and Okoro visibly walks slower than Lindqvist; a game over lists each crew member's skill gains under the banner. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.
```

- [ ] **Step 2: Spec amendments and roadmap**

Append to the spec:

```markdown
## 11. Amendments from the plan
- `Skill`, `SKILL_NAMES` and `xpIndex` live in `sim/skillIds.ts` (re-exported by `skills.ts`) so `characters.ts` and `skills.ts` do not import each other; `addXp` reads `xpMult` from `characters.ts`.
- Lobby display: the joined slot's name row reads `P1  Okoro` and line 2 reads `Quick Hands / Heavy Boots` (section 7 put the name on line 2 and the traits on line 3).
- The golden replay was re-blessed twice: in Task 1 (version 7, the assignment field, head starts) and in Task 2 (the traits acting in the replay).
```

`docs/roadmap.md`: set item 2's status to `final review passed; merging` is premature; set it to `in review` and item 3 to `next`.

- [ ] **Step 3: Verify and commit**

`npm run typecheck`, `npm test`, `npm run build` → pass.

```bash
git add docs/gates.md docs/superpowers/specs/2026-11-10-characters-design.md docs/roadmap.md
git commit -m "docs: increment 3-ii gate, spec amendments, roadmap status"
```
