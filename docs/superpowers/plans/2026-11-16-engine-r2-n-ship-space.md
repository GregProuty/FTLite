# Engine Refactor R-2: N-Ship Space and the Systems Record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tactical layer stops being a pair. It holds N ship slots (each a body in space with an `active` flag), a missile pool whose entries carry an `owner` and an `active` flag, and a locked target index per ship; each slot has one **systems record** (hull, room damage, shields, the laser, the magazine, the weapon counters), owned by a new `ship` sim module; and ship classes and weapons become definitions (`ShipClassDef`, `WeaponDef`) whose `cutter` and `hunter` entries carry today's numbers. **This changes storage, not rules:** the duel keeps three repair points acting on room damage and an interior whose power is not coupled to the fight. Because slots, `owner` and `active` change the duel's canonical array, R-2 is a **schema migration with a proof**: a pre-R-2 oracle records the duel golden's run and the ten gate seeds per tick, the post-R-2 run is checked through an alias table, and only then is the duel golden re-blessed as `SIM_VERSION` 37 → 38. The bless guard learns to require that proof on every bump, which closes R-0's open item (the guard had no per-tick proof for `duel-1.json`).

**Architecture:**
- `scripts/golden/duelOracle.ts` (new): the duel migration oracle. `recordRun` steps a duel and digests, per tick, every named canonical field (version left out), every command result and event, and the telemetry accumulator; `aliasPlan` maps a baseline's field names onto the current ones through `MIGRATIONS` (keyed by the baseline's `SIM_VERSION`); `judgeDuelOracle` / `verifyDuelOracle` compare. `scripts/golden/duel-oracle.ts` (new) is its CLI (`baseline`, `check`, `same`).
- `scripts/golden/blessGuard.ts`: `blessRefusal` takes a required `duel` proof, run on every bump after the sector one; `scripts/bless-golden.ts` passes `verifyDuelOracle`.
- `sim/tactical/defs.ts` (new): `LaserDef`, `MissileDef`, `WeaponDef`, `ShipClassDef`; `LASER`, `MISSILE`, `CUTTER_CLASS`, `HUNTER_CLASS`, `SHIP_CLASSES`, `ShipClass`, `DUEL_CLASSES`.
- `sim/tactical/state.ts`: `Slots<T>`; `Ship` (the body), `ShipSystems`, `MissileFlight`, `Missile` (a pool entry); `TacticalState.ships`, `.systems`, `.missiles` as slots; `shipBody`, `classOf`, `targetOf`, `missileOf`, `placeMissile`, `removeMissile`, `emptyMissile`.
- `sim/tactical/hash.ts`: the `space` module (slot count, each slot's body, the missile pool, the hunter) and the new `ship` module (each slot's systems record); `TACTICAL_MODULES`; `flattenTactical` is space then ship; `validateTacticalValues` covers both.
- `sim/tactical/physics.ts`, `contacts.ts`, `missiles.ts`, `weapons.ts`, `hunter.ts`, `duel.ts`, `predict.ts`: loops over active slots, the locked target, the pool by owner, the class's definitions.
- `sim/duel/modules.ts`: `DUEL_MODULES` is space, ship, presence, repair, interior.
- Every reader of a ship's systems (the duel step, telemetry, the scripted pair, the H-1 views, the tests) reads `state.systems[i]`, and every reader of a missile uses `missileOf`.

**Not in R-2:** the full interior link (R-2b: interior power drives shields and engines, and repair acts on the shared systems record); a hunter brain per ship and real enemy interiors (R-5); telemetry and notices out of the hash (R-3).

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, tsx, zod 3, Electron 37. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` §5 (one combat model; R-2 changes storage, not rules; the migration proof), §6 (sim modules; R-2 adds the per-ship systems record as part of the ship module), §7 and §9 (the migration-proof pattern), and the R-2 row of §12. Follows `2026-11-16-engine-r1b-duel-mode.md`.

## Scope

- **Prerequisite: R-1b merged** (master 6a8db43 or later: the duel on the module contract). Task 1 Step 0 stops the plan otherwise.
- **Task 1:** the duel migration oracle and its CLI; the bless guard requires it on every bump. Both pre-R-2 baselines are recorded here.
- **Task 2:** the seam, golden-neutral: a `systems` view (the same objects as `ships` for now), `missileOf` / `placeMissile` / `removeMissile` and `targetOf`; the duel step, telemetry, the scripted pair, the views and the tests move onto them. Proof: the duel oracle and the sector trace are unchanged field for field at version 37.
- **Task 3:** the storage change: ship slots, the systems record and the `ship` module, the missile pool, the target index, the definitions; `SIM_VERSION` 38 and the 37 → 38 alias table. Proof: the duel oracle through the alias table and the sector trace version-only.
- **Task 4:** the re-bless through the guard (which re-runs both proofs), the full suite, the gates and the cross-engine determinism check.
- **Not in R-2:** R-2b, the interior link.

## Global Constraints

- **Prerequisite: R-1b is merged** (the sim module contract, `DUEL_MODULES`, the duel snapshot). Do not start this plan on a checkout without it.
- Determinism guard (`tests/boundary.test.ts`): `sim/tactical/defs.ts` and every changed `sim/` file fall under it: only `Math.abs`, `ceil`, `floor`, `round`, `min`, `max`, `sign`, `imul` and `sqrt`; no platform globals; randomness only through `src/shared/rng.ts`. Files under `sim/` import nothing from `authority/`, `clientControl/`, `app/` or `render/`.
- **The duel's rules and the sector must not change.** Tasks 1 and 2 leave every pinned artifact untouched (the duel golden passes unedited). Task 3 changes the duel's canonical array, so the duel golden fails until Task 4 re-blesses it; nothing else may fail. The sector's per-tick canonical trace must be identical apart from the version, and the gate outcomes (`tests/duelGates.test.ts`: ten seeds, 7 crew wins and 3 crew losses, median 251.2 s) identical.
- **Generated files come only from `npm run bless`.** No step edits `tests/golden/*` or `tests/fixtures/*` by hand.
- **Never discard working-tree changes.** No step runs `git checkout`, `git restore`, `git stash` or `git clean`: the owner and other sessions keep uncommitted work in this checkout, and this plan touches none of those files. Every check that writes evidence writes it under the git-ignored `out/`, or in the temp folder the canonical trace already uses.
- **Commands need no shell features.** Every `Run:` line works as written in Windows PowerShell 5.1 and in Git Bash.
- Commit with explicit paths only (`git add <paths>`), never `git add -A` or `git add .`. End every commit message with the Co-Authored-By trailer your own session instructs.
- Run single test files with `npx vitest run <file>`. The full suite is `npm test` (it reads the built `out/`; build first with `npm run build`). Typecheck is `npm run typecheck`.
- Known flakes: `tests/authorityBoundary.test.ts` and `tests/run.test.ts` can time out under full-suite load; rerun one alone. `tests/onlineAppRuntime.test.ts` ("bounds an unresolved actual observer-build") fails in a git worktree outside the main checkout, on pristine master too; it passes in the main checkout.
- Line endings: write files with LF.
- Edits are given as exact replacements: "In `file`, replace: (old) with: (new)". Each old text occurs exactly once in the file at that point; apply them in the order given.

## Decisions the plan makes inside the spec

Each is the recommendation, taken under the standing order; the owner can overturn any of them.

1. **Where the systems record lives** **(rec.)**: in `TacticalState.systems[i]`, beside `ships[i]` (the body), owned by a new `ship` sim module; both modules are declared over the one `TacticalState`, and the completeness test holds it to their fields together. The slot index is the ship index (spec: "the tactical layer keeps only kinematics plus a ship index"). The weapon commands (`laserLock`, `laserCharge`, `missileLaunch`) and their reasons move to the `ship` module. R-4 and R-5 move the record into `ShipState`.
2. **What moves** (spec §5): `hull`, `rooms`, `shields`, `shieldClock`, `laserCharge`, `laserHold`, `fireHeld`, `lock`, `magazine`, `magazineClock` and the weapon counters (`shots`, `laserHits`, `layersStripped`, `missilesLaunched`, `missileHits`, `missilesLost`). The body keeps position, heading, contact grace, the contact counters and the stabilise state. The record adds `cls` (its class) and `target`.
3. **Ship slots** **(rec.)**: `Slots<T> = [T, T, ...T[]]` (an encounter always has the crew's ship and one other, so `ships[0]` and `ships[1]` stay non-optional). The slot count is part of the state's shape, like the asteroid count: `ships.length` is a canonical identity field, and `createTacticalState(seed, slots = 2)` fills the duel's two slots and leaves any further slot inactive, holding zeros (R-5 fills them). Inactive slots are skipped by flight, contacts, weapons, missile landings and the outcome; the validator requires their values to be zeros. The crew wins when every other active ship's hull is gone (for the duel: the hunter's).
4. **Contact grace for N ships** **(rec.)**: `graceUntil` has `asteroids + slots` entries; ship k's body in ship i's array is `asteroids + 1 + (k < i ? k : k − 1)` (`shipBody`), so for the duel's two slots the layout is exactly today's and the telemetry accumulator's copies keep their shape. Contacts run per active slot in slot order: its statics, then every later active ship, which is today's order for two (ship 0's statics, the pair, ship 1's statics).
5. **The missile pool** **(rec.)**: one entry per ship slot, `{ active, owner, x, y, vx, vy, heading, headingAcc, age }` (9 values: fields `missiles.<k>.active`, `.owner`, `.flight`). A launch takes the ship's own entry or the first free one; a missile that ends frees and zeroes its entry. At most one in flight per ship, as today (the validator refuses two for one owner). Missiles are flown and resolved **in owner order** (`missileOf(state, i)` for each slot), not in entry order, so the resolution order (and so who meets whom first) is exactly today's whatever entry a missile sits in. In the gate runs the enemy's missile sits in entry 0 for 7,331 ticks, so the owner mapping is exercised, not just declared.
6. **The target index** (spec §5: "weapons fire at the ship's locked target"): `systems[i].target`; the duel's are 0 → 1 and 1 → 0. The laser, the hunter, the scripted pair, telemetry and the views use it. `laserEligible` is false for a target that is not another active slot.
7. **Definitions** (spec §5): `ShipClassDef` (hull, radius, thrust, reverse share, turn, engine factors, shields, `power`, weapon slots, AI profile) and `WeaponDef` (`LaserDef`, `MissileDef`), frozen, in `sim/tactical/defs.ts`. Today's numbers are the `cutter` and `hunter` entries; `tuning.ts` keeps the numbers as their inputs, so the change is golden-neutral and the views keep reading `tuning.ts` (identical values). `power` is `null` (not coupled until R-2b). A slot names its class by `systems[i].cls`, an index into `SHIP_CLASSES` (hashed). The hunter's own AI tuning (`HUNTER_*`) stays in `tuning.ts`.
8. **One hunter brain** **(rec.)**: `state.hunter` stays one record per encounter; `stepDuel` drives it for the active slot whose class's AI profile is `'hunter'` (`hunterSlot`), against that slot's target. R-5 gives every ship its own.
9. **`flyShip` keeps its signature** **(rec.)**: `flyShip(body, axes, tuning, engines = 0, cls = CUTTER_CLASS)` takes the Engines damage level and the class as arguments (the body no longer holds them), so the flight tests change only where they set an Engines level. `flySlot(state, i, axes, tuning)` is the slot form. `hitStatics(state, i)` takes a slot.
10. **The migration oracle** (spec §5, §7, §9): its runs are the scripted pair at the ten gate seeds (seed 1 is the duel golden's run) and the same seeds with a passive crew: 20 runs, 205,178 ticks at 37. Per tick it records three digests: the 304 named canonical fields (the modules' fields as `<module>.<field>`, the interior expanded into its sector field names, `interior.$simVersion` and the duel hash's leading `SIM_VERSION` left out), the command results with the tactical and repair events, and the telemetry accumulator; and per field a running digest over the run, which names the fields that differ. The baseline lives in the canonical trace's temp folder (keyed by the repo root), so a different checkout cannot reuse it. The alias table is `MIGRATIONS[<baseline version>]`: renames, derived old fields (the old per-ship missile slot is the pool entry that ship owns), and fields declared added; a version with no entry maps every field to itself. The check fails on any old field unmapped, any new field mapped from two old ones or neither mapped nor declared added, any count change, and any per-tick difference. `check` requires the code's version to be exactly the baseline's plus 1; `same` requires the same version.
11. **R-2's alias table** (37 → 38): `space.ships.<i>.<moved field>` → `ship.systems.<i>.<field>`; `space.missiles.<i>` (presence then flight) is derived from the pool entry with `active` 1 and `owner` i (zeros when there is none); declared added: `space.ships.length`, `space.ships.<i>.active`, `space.missiles.<k>.active` and `.owner`, `ship.systems.<i>.cls` and `.target`. Nothing is dropped, so R-2 has no dropped list (R-3, which drops telemetry fields, adds one).
12. **Closing the bless guard** (R-0's deferred item): `blessRefusal` takes a **required** `duel` proof beside the sector `verify`, and on a bump runs both, the duel one only after the sector one passes; a failure of either refuses the whole bless, so `duel-1.json` is never re-blessed on a bump without the oracle. `npm run bless` passes `verifyDuelOracle`, which re-runs all 20 duels against the recorded baseline (nothing from an earlier run is trusted); with no baseline, a baseline from another repo root, or a version that is not the baseline's plus 1, it refuses. A test pins the wiring in `scripts/bless-golden.ts`, and typecheck refuses a call without `duel`. The cost: **every later bump records `duel-oracle.ts baseline` beside `canonical-trace.ts baseline`** (with no `MIGRATIONS` entry it is a version-only duel check). A same-version bless stays R-0's deliberate-gameplay path, unchanged.
13. **The test migration is a codemod** **(rec.)**: Task 2 moves about 120 test accesses of a ship's systems fields onto `state.systems[i]` with a type-aware script run once from `out/` (never committed): for `X.<field>` where `X` is typed `Ship`, it rebinds a variable used only for systems fields (`= st.ships[0]` becomes `= st.systems[0]`) and otherwise reads `<base>.systems[<i>]` in place; then missile slot reads and writes become `missileOf` / `placeMissile` / `removeMissile`. Three edits it cannot make are given by hand. During Task 2, `systems` holds the same objects as `ships`, so the moved tests prove the seam is golden-neutral before any storage changes.
14. **The gate outcomes** are compared as the gate test's printed telemetry: every line for the ten scripted seeds and the ten passive ones is identical before and after (only the test's timing changes).

## File structure

| File | Responsibility |
|---|---|
| `scripts/golden/duelOracle.ts` | **Create:** the duel migration oracle, `MIGRATIONS` |
| `scripts/golden/duel-oracle.ts` | **Create:** its CLI (`baseline`, `check`, `same`) |
| `scripts/golden/blessGuard.ts` | **Replace:** `blessRefusal` requires the duel proof on a bump |
| `scripts/bless-golden.ts` | **Modify:** passes `verifyDuelOracle` |
| `src/renderer/src/sim/tactical/defs.ts` | **Create:** `ShipClassDef`, `WeaponDef` and today's entries |
| `src/renderer/src/sim/tactical/state.ts` | **Modify, then replace:** slots, bodies, systems records, the missile pool, the accessors |
| `src/renderer/src/sim/tactical/hash.ts` | **Modify, then replace:** the `space` and `ship` modules, flatten, clone, validation |
| `src/renderer/src/sim/tactical/physics.ts`, `contacts.ts`, `missiles.ts`, `weapons.ts`, `duel.ts` | **Replace:** active slots, the target, the pool by owner, the definitions |
| `src/renderer/src/sim/tactical/hunter.ts`, `predict.ts` | **Modify:** a slot and its target; the class |
| `src/renderer/src/sim/duel/modules.ts`, `snapshot.ts` | **Modify:** the `ship` module in `DUEL_MODULES`; the snapshot validates it |
| `src/renderer/src/sim/duel/step.ts`, `telemetry.ts`, `scripted.ts` | **Modify:** read the systems record, the target and `missileOf` |
| `src/renderer/src/sim/tuning.ts` | **Modify:** `SIM_VERSION` 38 |
| `src/renderer/src/authority/duelCheckpoint.ts` | **Modify:** the telemetry's body count from the state |
| `src/renderer/src/app/duel/controls.ts`, `runtime.ts`; `src/renderer/src/render/duel/interiorModel.ts`, `readoutModel.ts`; `src/renderer/src/render/tactical/fxModel.ts`, `tacticalModel.ts`, `weaponsModel.ts`, `missilePath.ts` | **Modify:** the H-1 views read the systems record, the target and `missileOf` |
| `tests/duelOracle.test.ts`, `tests/tacticalSlots.test.ts` | **Create:** the oracle's own tests; N-ship space, the pool and the definitions |
| `tests/blessGuard.test.ts`, `tests/duelModules.test.ts` | **Replace:** the guard's duel proof; the modules over slots |
| `tests/helpers/scriptedDuel.ts` and 17 other test files | **Modify:** `passiveInput` exported; the systems record, the pool and the slot API |
| `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/fixtures/determinism-v2.json` | **Regenerated by `npm run bless`** (Task 4) |

---

### Task 1: The duel migration oracle and the bless guard

**Files:**
- Create: `scripts/golden/duelOracle.ts`, `scripts/golden/duel-oracle.ts`, `tests/duelOracle.test.ts`
- Replace: `scripts/golden/blessGuard.ts`, `tests/blessGuard.test.ts`
- Modify: `scripts/bless-golden.ts`, `tests/helpers/scriptedDuel.ts`

**Interfaces:**
- Consumes: `DUEL_MODULES`, `flattenDuel`, `canonicalFields`, `createDuel`, `stepDuelTick`, `createScriptedPair`, `scriptedInput`, `createTelemetry`, `recordTick`; `CUTTER`, `CAP_TICKS`, `GATE_SEEDS` and (newly exported) `passiveInput` from `tests/helpers/scriptedDuel.ts`; `dir`, `repoRoot`, `VersionOnlyResult` from `scripts/golden/versionOnly.ts`.
- Produces:
  - `duelOracle.ts`: `ORACLE_FILE`; `VERSION_FIELDS`; `interface OracleRunSpec { id; seed; crew; cap? }`; `ORACLE_RUNS` (20); `interface OracleRun { id; names; counts; ticks; outcome; perTick; chains }`; `interface OracleTrace { simVersion; cwd; head; runs }`; `interface Migration { change; rename(old); derived; added }`; `MIGRATIONS` (empty until Task 3); `duelSchema(d)`; `aliasPlan(oldNames, oldCounts, newNames, newCounts, migration?)`; `recordRun(spec, schema?)`; `oracleTrace()`; `oracleCounts(t)`; `runDifferences(was, now)`; `judgeDuelOracle(was, rerun, root, mode, version?, migrations?)`; `verifyDuelOracle()`; `verifyDuelUnchanged()`.
  - `blessGuard.ts`: `blessRefusal(opts: { storedVersions; currentVersion; verify; duel })`.

- [ ] **Step 0: Check the prerequisite (R-1b merged)**

Run: `npx vitest run tests/duelModules.test.ts tests/duelGolden.test.ts`
Expected: PASS, 14 tests in 2 files. **If `tests/duelModules.test.ts` does not exist or fails, stop: R-1b is not merged.**

- [ ] **Step 1: Record the sector's pre-R-2 baseline**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 37: golden 7200 ticks, determinism-v2 108000 ticks in 19 runs` and the trace file's path, exit 0.

- [ ] **Step 2: Write the failing tests**

Create `tests/duelOracle.test.ts`:

```ts
// The duel migration oracle (engine refactor spec §5, R-2): the alias table refuses an unmapped old field, a new field
// mapped twice or unaccounted for, and a count change; a re-run in the baseline's schema matches itself; a wrong alias
// is caught at the first tick it shows, naming the fields; and the version rules (a bump is the baseline plus 1, a
// same-version check needs the same version) hold.
import { describe, expect, it } from 'vitest';
import { aliasPlan, duelSchema, judgeDuelOracle, ORACLE_RUNS, recordRun, runDifferences, type Migration, type OracleRunSpec, type OracleTrace } from '../scripts/golden/duelOracle';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { CUTTER } from './helpers/scriptedDuel';

const none: Migration = { change: 'none', rename: () => undefined, derived: [], added: [] };
const SHORT: OracleRunSpec = { id: 'scripted-3', seed: 3, crew: 'scripted', cap: 240 };

describe('the alias table', () => {
  it('maps unchanged names to themselves and leaves the version field out on both sides', () => {
    const plan = aliasPlan(['a', 'interior.$simVersion', 'b'], [1, 1, 2], ['b', 'interior.$simVersion', 'a'], [2, 1, 1]);
    expect(plan.problems).toEqual([]);
    expect(Array.from(plan.build([5, 6, 38, 7]))).toEqual([7, 5, 6]);
  });
  it('refuses an unmapped old field, a new field mapped twice or not at all, and a count change', () => {
    expect(aliasPlan(['a', 'gone'], [1, 1], ['a'], [1]).problems).toEqual(['old field gone is unmapped']);
    const twice: Migration = { ...none, rename: (o) => (o === 'b' ? 'a' : undefined) };
    expect(aliasPlan(['a', 'b'], [1, 1], ['a'], [1], twice).problems).toEqual(['new field a is mapped from two old fields (a and b)']);
    expect(aliasPlan(['a'], [1], ['a', 'fresh'], [1, 1]).problems).toEqual(['new field fresh is neither mapped nor declared added']);
    expect(aliasPlan(['a'], [1], ['a', 'fresh'], [1, 1], { ...none, added: [/^fresh$/] }).problems).toEqual([]);
    expect(aliasPlan(['a'], [2], ['a'], [3]).problems).toEqual(['old field a has 2 values, its new field a 3']);
  });
  it('rebuilds a derived old field from the new fields it reads, which then count as mapped', () => {
    const keyed: Migration = { ...none, derived: [{ old: /^pair$/, reads: /^slot\.\d$/, value: (_o, read, names) => names.flatMap((n) => Array.from(read(n))).reverse() }] };
    const plan = aliasPlan(['pair'], [2], ['slot.0', 'slot.1'], [1, 1], keyed);
    expect(plan.problems).toEqual([]);
    expect(Array.from(plan.build([3, 4]))).toEqual([4, 3]);
  });
  it('names every duel field once: the modules in flattenDuel order with the interior expanded', () => {
    const d = createDuel(CUTTER, 1);
    try {
      const { names, counts } = duelSchema(d);
      expect(new Set(names).size).toBe(names.length);
      expect(names.slice(0, 3)).toEqual(['space.tick', 'space.seed', 'space.rng.s']);
      expect(names).toContain('presence.present.1');
      expect(names).toContain('interior.$simVersion');
      expect(counts.every((c) => Number.isInteger(c) && c >= 0)).toBe(true);   // a layout with no airlocks has empty arrays
    } finally { disposeDuel(d); }
  });
});

describe('the per-tick record', () => {
  it('a re-run in the baseline schema matches it; a wrong alias fails at its first tick, naming the fields', () => {
    const was = recordRun(SHORT).run;
    expect(was.perTick).toHaveLength(240);
    const same = recordRun(SHORT, { names: was.names, counts: was.counts });
    expect(same.problems).toEqual([]);
    expect(runDifferences(was, same.run)).toEqual([]);
    const swap: Migration = { ...none, rename: (o) => (o === 'space.ships.0.x' ? 'space.ships.1.x' : o === 'space.ships.1.x' ? 'space.ships.0.x' : undefined) };
    const wrong = recordRun(SHORT, { names: was.names, counts: was.counts, migration: swap });
    expect(wrong.problems).toEqual([]);
    const diff = runDifferences(was, wrong.run);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatch(/^scripted-3: first difference at tick 1 \(fields\); fields that differ during the run: space\.ships\.0\.x, space\.ships\.1\.x$/);
  }, 30_000);
});

describe('the judge', () => {
  const trace = (over: Partial<OracleTrace> = {}): OracleTrace => ({ simVersion: 37, cwd: '/repo', head: 'abc', runs: [], ...over });
  const rerun = () => { throw new Error('not reached'); };
  it('refuses without a baseline, from another repo root, and on a version that is not the baseline plus 1', () => {
    expect(judgeDuelOracle(undefined, rerun, '/repo', 'bump', 38).message).toMatch(/no duel oracle baseline/);
    expect(judgeDuelOracle(trace({ cwd: '/elsewhere' }), rerun, '/repo', 'bump', 38).message).toMatch(/recorded from \/elsewhere/);
    expect(judgeDuelOracle(trace(), rerun, '/repo', 'bump', 39).message).toMatch(/a bump must be to 38, not 39/);
    expect(judgeDuelOracle(trace(), rerun, '/repo', 'bump', 37).message).toMatch(/a bump must be to 38, not 37/);
    expect(judgeDuelOracle(trace(), rerun, '/repo', 'same', 38).message).toMatch(/use `check` for a bump/);
  });
  it('re-runs every run in the baseline schema, through the migration only for a bump', () => {
    const runs = ORACLE_RUNS.map((s) => ({ id: s.id, names: ['a'], counts: [1], ticks: 2, outcome: 1, perTick: ['x', 'y'], chains: ['c'] }));
    const seen: (string | undefined)[] = [], migration: Migration = { ...none, change: 'R-test' };
    const ok = judgeDuelOracle(trace({ runs }), (spec, schema) => { seen.push(schema.migration?.change); return { problems: [], run: runs.find((r) => r.id === spec.id)! }; }, '/repo', 'bump', 38, { 37: migration });
    expect(ok.ok).toBe(true);
    expect(ok.message).toMatch(/20 runs, 40 ticks, 1 named fields, .* through the 37 → 38 alias table \(R-test\)/);
    expect(seen).toEqual(ORACLE_RUNS.map(() => 'R-test'));
    const bad = judgeDuelOracle(trace({ runs }), (spec) => ({ problems: [], run: { ...runs.find((r) => r.id === spec.id)!, perTick: ['x', 'z'], chains: ['d'] } }), '/repo', 'same', 37);
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/scripted-1: first difference at tick 2 \(fields\); fields that differ during the run: a/);
  });
});
```

Replace the whole of `tests/blessGuard.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { blessRefusal, writeAllOrNothing } from '../scripts/golden/blessGuard';

const ok = { ok: true, message: 'identical' }, bad = { ok: false, message: 'golden replay differs at tick 5' };

describe('the bless guard', () => {
  it('allows a version bump when the re-run comparison is ok', () => {
    expect(blessRefusal({ storedVersions: [35, 35, 35], currentVersion: 36, verify: () => ok, duel: () => ok })).toBeUndefined();
  });
  it('refuses a version bump when the comparison is not ok, quoting why', () => {
    expect(blessRefusal({ storedVersions: [35, 35, 35], currentVersion: 36, verify: () => bad, duel: () => ok })).toMatch(/differs at tick 5/);
  });
  it('refuses a version bump with no baseline (the comparison reports it)', () => {
    expect(blessRefusal({ storedVersions: [35, 35, 35], currentVersion: 36, verify: () => ({ ok: false, message: 'no baseline' }), duel: () => ok })).toMatch(/no baseline/);
  });
  it('allows a same-version bless without running the comparison', () => {
    const verify = vi.fn(() => bad);
    expect(blessRefusal({ storedVersions: [36, 36, 36], currentVersion: 36, verify, duel: verify })).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });
  it('a mixed state, one golden already at the new version and another artifact not, still requires the comparison', () => {
    for (const storedVersions of [[37, 36, 36], [37, 37, 36], [36, 37, 37], [37, undefined, 36]]) {
      const verify = vi.fn(() => bad);
      expect(blessRefusal({ storedVersions, currentVersion: 37, verify, duel: () => ok }), JSON.stringify(storedVersions)).toMatch(/36 → 37/);
      expect(verify).toHaveBeenCalledTimes(1);
    }
    expect(blessRefusal({ storedVersions: [37, 37, undefined], currentVersion: 37, verify: () => bad, duel: () => ok })).toBeUndefined();
  });
  it('a bump also needs the duel migration oracle: a sector proof alone never re-blesses duel-1.json', () => {
    const duelBad = { ok: false, message: 'scripted-4: first difference at tick 812 (fields)' };
    expect(blessRefusal({ storedVersions: [37, 37, 37], currentVersion: 38, verify: () => ok, duel: () => duelBad })).toMatch(/duel migration oracle failed[\s\S]*tick 812/);
    expect(blessRefusal({ storedVersions: [38, 37, 38], currentVersion: 38, verify: () => ok, duel: () => duelBad })).toMatch(/37 → 38/);
    const duel = vi.fn(() => ok);
    expect(blessRefusal({ storedVersions: [37, 37, 37], currentVersion: 38, verify: () => bad, duel })).toMatch(/canonical comparison failed/);
    expect(duel).not.toHaveBeenCalled();
    expect(blessRefusal({ storedVersions: [37, 37, 37], currentVersion: 38, verify: () => ok, duel })).toBeUndefined();
    expect(duel).toHaveBeenCalledTimes(1);
  });
  it('npm run bless passes the real duel oracle, re-run on every bump', () => {
    const source = readFileSync('scripts/bless-golden.ts', 'utf8');
    expect(source).toMatch(/import \{ verifyDuelOracle \} from '\.\/golden\/duelOracle';/);
    expect(source).toMatch(/blessRefusal\(\{ storedVersions: stored, currentVersion: SIM_VERSION, verify: verifyVersionOnly, duel: verifyDuelOracle \}\)/);
  });
});

describe('writing the pinned artifacts', () => {
  it('stages every artifact before writing any, in order', () => {
    const order: string[] = [], write = vi.fn((path: string) => { order.push(`write ${path}`); });
    const stage = (path: string) => ({ path, stage: () => { order.push(`stage ${path}`); return { content: path.toUpperCase(), message: `blessed ${path}` }; } });
    expect(writeAllOrNothing([stage('a'), stage('b'), stage('c')], write)).toEqual(['blessed a', 'blessed b', 'blessed c']);
    expect(order).toEqual(['stage a', 'stage b', 'stage c', 'write a', 'write b', 'write c']);
    expect(write).toHaveBeenCalledWith('b', 'B');
  });
  it('a failure while staging the third artifact writes nothing', () => {
    const write = vi.fn();
    const good = (path: string) => ({ path, stage: () => ({ content: 'x', message: path }) });
    expect(() => writeAllOrNothing([good('basic'), good('duel'), { path: 'fixture', stage: () => { throw new Error('not version-only: sample 3'); } }], write)).toThrow(/not version-only/);
    expect(write).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run tests/duelOracle.test.ts tests/blessGuard.test.ts`
Expected: FAIL: `tests/duelOracle.test.ts` cannot resolve `../scripts/golden/duelOracle`, and the two new bless-guard tests fail (no `duel` proof is run; `scripts/bless-golden.ts` does not import `verifyDuelOracle`).

- [ ] **Step 3: The oracle, its CLI and the guard**

In `tests/helpers/scriptedDuel.ts`, replace:

```ts
function passiveInput(d: DuelState): DuelInput {
```

with:

```ts
export function passiveInput(d: DuelState): DuelInput {
```

Create `scripts/golden/duelOracle.ts`:

```ts
// The duel migration oracle (engine refactor spec §5, R-2; the proof pattern of §7 and §9). A change that alters the
// duel's canonical array (ship slots, the missile pool's owner and active flags) cannot be proved by the duel golden,
// whose hashes change, nor by versionOnly.ts, which replays only the sector. So before the change this records, at
// EVERY tick of the duel golden's scripted pair and the ten gate seeds (seeds 1 to 10; the golden is seed 1), and of
// the same seeds with a passive crew:
//   - every named canonical field of the duel's modules (the interior expanded into its sector field names);
//   - every command result, and every tactical and repair event;
//   - the telemetry accumulator.
// After the change the same runs are checked through an alias table (MIGRATIONS, keyed by the baseline's SIM_VERSION):
// renamed fields, old fields rebuilt from several new ones, and new fields declared added. The check fails on any old
// field that is unmapped, any new field mapped from two old fields or neither mapped nor declared added, and any value,
// result, event or telemetry difference at any tick. R-2 drops no field, so there is no dropped list yet: a milestone
// that drops fields (R-3) adds one, left out of the record when its baseline is taken. The version is excluded from the
// values (the duel hash's leading SIM_VERSION and the interior's $simVersion) and checked on its own: a bump must be
// exactly the baseline's version plus 1. No side effects on import: duel-oracle.ts is the CLI, and bless-golden.ts
// re-runs verifyDuelOracle() on every bump, so nothing from an earlier run is trusted.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalFields } from '../../src/renderer/src/sim/canonicalFields';
import { flattenDuel } from '../../src/renderer/src/sim/duel/hash';
import { DUEL_MODULES } from '../../src/renderer/src/sim/duel/modules';
import { createScriptedPair, scriptedInput } from '../../src/renderer/src/sim/duel/scripted';
import { createDuel, disposeDuel, type DuelState } from '../../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../../src/renderer/src/sim/duel/step';
import { createTelemetry, recordTick } from '../../src/renderer/src/sim/duel/telemetry';
import type { SimModule } from '../../src/renderer/src/sim/module';
import { Outcome } from '../../src/renderer/src/sim/tactical/state';
import { SIM_VERSION } from '../../src/renderer/src/sim/tuning';
import { CAP_TICKS, CUTTER, GATE_SEEDS, passiveInput } from '../../tests/helpers/scriptedDuel';
import { dir, repoRoot, type VersionOnlyResult } from './versionOnly';

export const ORACLE_FILE = join(dir, 'duel-oracle.json');
/** The interior's own version value, excluded like the duel hash's leading SIM_VERSION. */
export const VERSION_FIELDS: readonly string[] = ['interior.$simVersion'];

/** One oracle run; `cap` (tests only) stops it early, the oracle runs use the gate cap. */
export interface OracleRunSpec { id: string; seed: number; crew: 'scripted' | 'passive'; cap?: number }
/** The gate seeds with the scripted pair (seed 1 is the duel golden), then the same seeds with a passive crew. */
export const ORACLE_RUNS: readonly OracleRunSpec[] = [
  ...GATE_SEEDS.map((seed) => ({ id: `scripted-${seed}`, seed, crew: 'scripted' as const })),
  ...GATE_SEEDS.map((seed) => ({ id: `passive-${seed}`, seed, crew: 'passive' as const }))
];

/** One run: its field schema (version fields left out), its length, and per tick three digests (fields, results and
 *  events, telemetry) as 24 hex characters; then one running digest per field over the whole run. */
export interface OracleRun { id: string; names: string[]; counts: number[]; ticks: number; outcome: number; perTick: string[]; chains: string[] }
export interface OracleTrace { simVersion: number; cwd: string; head: string; runs: OracleRun[] }

/** How a schema change maps the baseline's (old) named fields onto the current (new) ones. */
export interface Migration {
  readonly change: string;
  /** The new name of an old field that moved or was renamed (same count), or undefined. */
  rename(old: string): string | undefined;
  /** Old fields rebuilt from several new ones: `old` picks them, `reads` names every new field the rule consumes. */
  readonly derived: readonly { old: RegExp; reads: RegExp; value(old: string, read: (name: string) => ArrayLike<number>, newNames: readonly string[]): number[] }[];
  /** New fields with no old counterpart. */
  readonly added: readonly RegExp[];
}
/** The schema migrations, keyed by the baseline's SIM_VERSION. A version with no entry maps every field to itself. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/** The duel's named canonical fields after SIM_VERSION, in flattenDuel order: `<module id>.<field name>`, with the
 *  interior expanded into `interior.<sector canonical field>`. */
export function duelSchema(d: DuelState): { names: string[]; counts: number[] } {
  const names: string[] = [], counts: number[] = [];
  for (const { module, state } of DUEL_MODULES) {
    const m = module as SimModule<unknown>;
    if (m.id === 'interior') {
      for (const f of canonicalFields(d.interior.layout, d.interior.playerCount)) { names.push(`interior.${f.name}`); counts.push(f.count); }
      continue;
    }
    for (const f of m.fields(state(d))) { names.push(`${m.id}.${f.name}`); counts.push(f.count); }
  }
  return { names, counts };
}

/** How the current values become the baseline's named values: `build` returns them in the baseline's order. */
export interface AliasPlan { problems: string[]; build(values: ArrayLike<number>): Float64Array }

/** The alias table from the baseline's fields to the current ones (spec §9): renames, derived fields, identity for
 *  every name that did not change, version fields left out on both sides. */
export function aliasPlan(oldNames: readonly string[], oldCounts: readonly number[], newNames: readonly string[], newCounts: readonly number[], migration?: Migration): AliasPlan {
  const problems: string[] = [], at = new Map<string, { offset: number; count: number }>();
  let offset = 0;
  newNames.forEach((name, k) => { at.set(name, { offset, count: newCounts[k]! }); offset += newCounts[k]!; });
  const targeted = new Map<string, string>(), consumed = new Set<string>();
  const steps: ((values: ArrayLike<number>, out: number[]) => void)[] = [];
  oldNames.forEach((old, k) => {
    if (VERSION_FIELDS.includes(old)) return;
    const count = oldCounts[k]!;
    const rule = migration?.derived.find((d) => d.old.test(old));
    if (rule) {
      const reads = newNames.filter((n) => rule.reads.test(n));
      for (const n of reads) consumed.add(n);
      steps.push((values, out) => {
        const read = (name: string): ArrayLike<number> => {
          const f = at.get(name);
          if (!f) throw new Error(`derived ${old} reads ${name}, which is not a current field`);
          return Array.prototype.slice.call(values, f.offset, f.offset + f.count) as number[];
        };
        const v = rule.value(old, read, reads);
        if (v.length !== count) throw new Error(`derived ${old}: ${v.length} values, the baseline has ${count}`);
        out.push(...v);
      });
      return;
    }
    const name = migration?.rename(old) ?? old, f = at.get(name);
    if (!f) { problems.push(`old field ${old} is unmapped`); return; }
    const before = targeted.get(name);
    if (before !== undefined) problems.push(`new field ${name} is mapped from two old fields (${before} and ${old})`);
    targeted.set(name, old);
    if (f.count !== count) { problems.push(`old field ${old} has ${count} values, its new field ${name} ${f.count}`); return; }
    steps.push((values, out) => { for (let i = 0; i < f.count; i++) out.push(values[f.offset + i]!); });
  });
  for (const name of newNames) {
    if (VERSION_FIELDS.includes(name) || targeted.has(name) || consumed.has(name)) continue;
    if (!migration?.added.some((p) => p.test(name))) problems.push(`new field ${name} is neither mapped nor declared added`);
  }
  return { problems, build(values) { const out: number[] = []; for (const s of steps) s(values, out); return Float64Array.from(out); } };
}

// A 32-bit FNV-style word mixer: each step is a bijection of the running value, so one differing word always changes it.
const F = new Float64Array(1), W = new Uint32Array(F.buffer), PRIME = 0x01000193, SEED = 0x811c9dc5;
function mixValue(h: number, v: number): number {
  F[0] = v === 0 ? 0 : v;
  h = Math.imul(h ^ W[0]!, PRIME) >>> 0;
  return Math.imul(h ^ W[1]!, PRIME) >>> 0;
}
function mixText(text: string): string {
  let h = SEED;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), PRIME) >>> 0;
  return h.toString(16).padStart(8, '0');
}
const plain = (_key: string, value: unknown): unknown => (ArrayBuffer.isView(value) ? Array.from(value as unknown as ArrayLike<number>) : value);
const hex = (h: number): string => h.toString(16).padStart(8, '0');

/**
 * Run one duel to its end (or the gate cap), recording every tick. `names` / `counts` are the schema the record is
 * kept in (the baseline's, or the current one for a baseline); `plan` turns the current values into it.
 */
export function recordRun(spec: OracleRunSpec, schema?: { names: readonly string[]; counts: readonly number[]; migration?: Migration }): { run: OracleRun; problems: string[] } {
  const d = createDuel(CUTTER, spec.seed), pair = createScriptedPair(spec.seed), t = createTelemetry(d);
  try {
    const now = duelSchema(d), target = schema ?? now;
    const plan = aliasPlan(target.names, target.counts, now.names, now.counts, schema?.migration);
    const kept = target.names.map((n, k) => ({ n, c: target.counts[k]! })).filter((f) => !VERSION_FIELDS.includes(f.n));
    const versionAt = (() => { let o = 0; for (let k = 0; k < now.names.length; k++) { if (now.names[k] === 'interior.$simVersion') return o; o += now.counts[k]!; } return -1; })();
    const chains = kept.map(() => SEED), perTick: string[] = [];
    if (plan.problems.length === 0) while (d.tactical.outcome === Outcome.Running && d.interior.tick < (spec.cap ?? CAP_TICKS)) {
      const input = spec.crew === 'scripted' ? scriptedInput(pair, d) : passiveInput(d);
      const results = stepDuelTick(d, input);
      recordTick(t, d, input);
      const all = flattenDuel(d);
      if (all[0] !== SIM_VERSION || all[1 + versionAt] !== SIM_VERSION) throw new Error(`${spec.id} tick ${d.interior.tick}: a version value is not SIM_VERSION`);
      const values = plan.build(all.subarray(1));
      let h = SEED, i = 0;
      kept.forEach((f, k) => {
        let c = chains[k]!;
        for (let j = 0; j < f.c; j++, i++) { h = mixValue(h, values[i]!); c = mixValue(c, values[i]!); }
        chains[k] = c;
      });
      if (i !== values.length) throw new Error(`${spec.id}: ${values.length} values for a ${i}-value schema`);
      perTick.push(hex(h) + mixText(JSON.stringify([results, d.tactical.events, d.events])) + mixText(JSON.stringify(t, plain)));
    }
    return { problems: plan.problems, run: { id: spec.id, names: kept.map((f) => f.n), counts: kept.map((f) => f.c), ticks: d.interior.tick, outcome: d.tactical.outcome, perTick, chains: chains.map(hex) } };
  } finally { disposeDuel(d); }
}

function gitHead(): string {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

/** The baseline: every run in the current schema. */
export function oracleTrace(): OracleTrace {
  return { simVersion: SIM_VERSION, cwd: repoRoot(), head: gitHead(), runs: ORACLE_RUNS.map((spec) => recordRun(spec).run) };
}

export const oracleCounts = (t: OracleTrace): string => `${t.runs.length} runs, ${t.runs.reduce((n, r) => n + r.ticks, 0)} ticks, ${t.runs[0]?.names.length ?? 0} named fields per tick`;

/** Every difference between a baseline run and the same run re-recorded in the baseline's schema. */
export function runDifferences(was: OracleRun, now: OracleRun): string[] {
  const problems: string[] = [];
  if (was.ticks !== now.ticks || was.outcome !== now.outcome) problems.push(`${was.id}: ended at tick ${now.ticks} with outcome ${now.outcome}, the baseline at tick ${was.ticks} with outcome ${was.outcome}`);
  const first = was.perTick.findIndex((p, k) => p !== now.perTick[k]);
  if (first >= 0) {
    const a = was.perTick[first]!, b = now.perTick[first] ?? '';
    const parts = (['fields', 'results and events', 'telemetry'] as const).filter((_, k) => a.slice(8 * k, 8 * k + 8) !== b.slice(8 * k, 8 * k + 8));
    const fields = was.names.filter((_, k) => was.chains[k] !== now.chains[k]);
    problems.push(`${was.id}: first difference at tick ${first + 1} (${parts.join(', ') || 'missing'})${fields.length > 0 ? `; fields that differ during the run: ${fields.slice(0, 12).join(', ')}${fields.length > 12 ? ', …' : ''}` : ''}`);
  }
  return problems;
}

/** Compare a baseline with the current code (pure apart from `rerun`). `mode` 'bump' requires SIM_VERSION to be the
 *  baseline's plus 1 and applies MIGRATIONS[baseline]; 'same' requires the same version and no migration. */
export function judgeDuelOracle(was: OracleTrace | undefined, rerun: (spec: OracleRunSpec, schema: { names: readonly string[]; counts: readonly number[]; migration?: Migration }) => { run: OracleRun; problems: string[] },
  root: string, mode: 'bump' | 'same', version = SIM_VERSION, migrations: Readonly<Record<number, Migration>> = MIGRATIONS): VersionOnlyResult {
  if (!was) return { ok: false, message: `no duel oracle baseline at ${ORACLE_FILE}: run \`duel-oracle.ts baseline\` before the change` };
  if (was.cwd !== root) return { ok: false, message: `the duel oracle baseline was recorded from ${was.cwd} (HEAD ${was.head}), not from ${root}: record it again here` };
  if (mode === 'bump' && version !== was.simVersion + 1) return { ok: false, message: `the duel oracle baseline is at sim version ${was.simVersion}; a bump must be to ${was.simVersion + 1}, not ${version}` };
  if (mode === 'same' && version !== was.simVersion) return { ok: false, message: `the duel oracle baseline is at sim version ${was.simVersion}, the code at ${version}: use \`check\` for a bump` };
  const migration = mode === 'bump' ? migrations[was.simVersion] : undefined, problems: string[] = [];
  const specs = new Map(ORACLE_RUNS.map((s) => [s.id, s]));
  if (was.runs.map((r) => r.id).join(',') !== ORACLE_RUNS.map((s) => s.id).join(',')) problems.push('the baseline records other runs than ORACLE_RUNS');
  for (const run of was.runs) {
    const spec = specs.get(run.id);
    if (!spec) continue;
    const now = rerun(spec, { names: run.names, counts: run.counts, migration });
    if (now.problems.length > 0) { problems.push(...now.problems.map((p) => `${run.id}: ${p}`)); break; }
    problems.push(...runDifferences(run, now.run));
  }
  const ticks = was.runs.reduce((n, r) => n + r.ticks, 0);
  if (problems.length > 0) return { ok: false, message: `duel migration oracle FAILED (baseline HEAD ${was.head}):\n${problems.join('\n')}` };
  const how = migration ? `through the ${was.simVersion} → ${version} alias table (${migration.change})` : 'field for field';
  return { ok: true, message: `duel oracle: ${was.runs.length} runs, ${ticks} ticks, ${was.runs[0]?.names.length ?? 0} named fields, results, events and telemetry identical at every tick ${how}, sim version ${was.simVersion} → ${version} (baseline HEAD ${was.head})` };
}

const readBaseline = (): OracleTrace | undefined => existsSync(ORACLE_FILE) ? JSON.parse(readFileSync(ORACLE_FILE, 'utf8')) as OracleTrace : undefined;

/** The bump proof `npm run bless` re-runs: the recorded baseline against the current code, through MIGRATIONS. */
export function verifyDuelOracle(): VersionOnlyResult { return judgeDuelOracle(readBaseline(), recordRun, repoRoot(), 'bump'); }
/** The same-version proof for a refactor that must not change the duel at all. */
export function verifyDuelUnchanged(): VersionOnlyResult { return judgeDuelOracle(readBaseline(), recordRun, repoRoot(), 'same'); }
```

Create `scripts/golden/duel-oracle.ts`:

```ts
// CLI for the duel migration oracle (engine refactor spec §5, R-2). The comparison itself is verifyDuelOracle() in
// duelOracle.ts, which `npm run bless` re-runs on every SIM_VERSION bump.
// Usage (no shell features needed; the baseline lives in the same temp folder as the canonical trace):
//   npx tsx scripts/golden/duel-oracle.ts baseline   before the change: records every oracle run per tick
//   npx tsx scripts/golden/duel-oracle.ts check      after a bump, before any bless: exits 1 unless every run matches
//                                                    through MIGRATIONS and SIM_VERSION is the baseline's plus 1
//   npx tsx scripts/golden/duel-oracle.ts same       after a change that keeps SIM_VERSION: exits 1 unless every run
//                                                    matches field for field
import { mkdirSync, writeFileSync } from 'node:fs';
import { oracleCounts, oracleTrace, ORACLE_FILE, verifyDuelOracle, verifyDuelUnchanged } from './duelOracle';
import { dir } from './versionOnly';

const mode = process.argv[2];
if (mode === 'baseline') {
  mkdirSync(dir, { recursive: true });
  const t = oracleTrace();
  writeFileSync(ORACLE_FILE, JSON.stringify(t));
  console.log(`duel oracle baseline at sim version ${t.simVersion}: ${oracleCounts(t)}; written to ${ORACLE_FILE}`);
} else if (mode === 'check' || mode === 'same') {
  const r = mode === 'check' ? verifyDuelOracle() : verifyDuelUnchanged();
  if (!r.ok) { console.error(r.message); process.exit(1); }
  console.log(r.message);
} else throw Error('usage: npx tsx scripts/golden/duel-oracle.ts baseline|check|same');
```

Replace the whole of `scripts/golden/blessGuard.ts` with:

```ts
// The guards that keep `npm run bless` honest. This file is pure; scripts/bless-golden.ts injects the comparison and
// the file system.
// - blessRefusal: a SIM_VERSION change is in progress whenever ANY pinned artifact's stored version differs from the
//   current one (a half-finished earlier bless can leave them mixed). Then the per-tick canonical comparison
//   (versionOnly.ts) is re-run, so nothing from an earlier run is trusted, and the bless is allowed only when it is ok.
//   The sector comparison does not cover the duel, so a bump also re-runs the duel migration oracle (duelOracle.ts,
//   engine refactor R-2): duel-1.json is never re-blessed on a bump unless every duel run matches its pre-bump
//   baseline per tick, through the alias table when the duel's schema changed. Both proofs are required options.
// - writeAllOrNothing: every artifact is staged (computed and validated) in memory before any file is written, so a
//   failure while staging any of them writes none.
import type { VersionOnlyResult } from './versionOnly';

/**
 * Returns undefined to allow the bless, or the refusal message. A bump (any stored version different from the current one) runs `verify` (the sector) and then `duel` (the duel oracle) and is allowed only when both return ok; a same-version bless (every artifact
 * already at the current version: a deliberate gameplay change) never calls it. An absent artifact (undefined) does
 * not count as a bump.
 */
export function blessRefusal(opts: { storedVersions: readonly (number | undefined)[]; currentVersion: number; verify: () => VersionOnlyResult; duel: () => VersionOnlyResult }): string | undefined {
  const { storedVersions, currentVersion, verify, duel } = opts;
  const stale = storedVersions.filter((v): v is number => v !== undefined && v !== currentVersion);
  if (stale.length === 0) return undefined;
  const bump = `refusing to bless a SIM_VERSION bump (${[...new Set(stale)].join(', ') || '?'} → ${currentVersion})`;
  const r = verify();
  if (!r.ok) return `${bump}: the per-tick canonical comparison failed.\n${r.message}`;
  const d = duel();
  if (!d.ok) return `${bump}: the duel migration oracle failed.\n${d.message}`;
  return undefined;
}

export interface StagedArtifact { path: string; stage(): { content: string; message: string } }

/** Stage every artifact first; write them only when all staged. Returns the messages in order. */
export function writeAllOrNothing(artifacts: readonly StagedArtifact[], write: (path: string, content: string) => void): string[] {
  const staged = artifacts.map((a) => ({ path: a.path, ...a.stage() }));
  for (const s of staged) write(s.path, s.content);
  return staged.map((s) => s.message);
}
```

In `scripts/bless-golden.ts`, replace:

```ts
//   version change is in progress, and the bless is refused unless the per-tick canonical comparison
//   (scripts/golden/versionOnly.ts, re-run here) proves it version-only; a same-version bless is a deliberate gameplay
//   change. All three are computed and validated in memory first and written only when every one is staged, so a
//   staging failure writes nothing; a write failure can leave a mixed-version set, which the next run guards again. tests/fixtures/net1a-baseline.json is a retired
//   historical oracle and is never written: `npm run bless -- --baseline` only checks it and writes nothing.
```

with:

```ts
//   version change is in progress, and the bless is refused unless the per-tick canonical comparison
//   (scripts/golden/versionOnly.ts, re-run here) proves the sector version-only AND the duel migration oracle
//   (scripts/golden/duelOracle.ts, re-run here) proves every duel run unchanged per tick, through its alias table when
//   the duel's schema changed; a same-version bless is a deliberate gameplay change. All three are computed and
//   validated in memory first and written only when every one is staged, so a staging failure writes nothing; a write failure can leave a mixed-version set, which the next run guards again. tests/fixtures/net1a-baseline.json is a retired
//   historical oracle and is never written: `npm run bless -- --baseline` only checks it and writes nothing.
```

In `scripts/bless-golden.ts`, replace:

```ts
import { verifyVersionOnly } from './golden/versionOnly';
import { checkNet1aBaseline } from './golden/baselineCheck';
```

with:

```ts
import { verifyVersionOnly } from './golden/versionOnly';
import { verifyDuelOracle } from './golden/duelOracle';
import { checkNet1aBaseline } from './golden/baselineCheck';
```

In `scripts/bless-golden.ts`, replace:

```ts
const stored = [readStoredVersion(BASIC, basicVersionFromText), readStoredVersion(DUEL_GOLDEN, duelVersionFromText), existsSync(DETERMINISM_FIXTURE) ? storedFixtureVersion() : undefined];
const refusal = blessRefusal({ storedVersions: stored, currentVersion: SIM_VERSION, verify: verifyVersionOnly });
if (refusal) { console.error(refusal); process.exit(1); }
```

with:

```ts
const stored = [readStoredVersion(BASIC, basicVersionFromText), readStoredVersion(DUEL_GOLDEN, duelVersionFromText), existsSync(DETERMINISM_FIXTURE) ? storedFixtureVersion() : undefined];
const refusal = blessRefusal({ storedVersions: stored, currentVersion: SIM_VERSION, verify: verifyVersionOnly, duel: verifyDuelOracle });
if (refusal) { console.error(refusal); process.exit(1); }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/duelOracle.test.ts tests/blessGuard.test.ts tests/versionOnly.test.ts tests/duelGates.test.ts`
Expected: PASS, 38 tests in 4 files. The oracle's own tests include a deliberately wrong alias (ship 0's and ship 1's `x` swapped), which it reports at tick 1 naming both fields.

- [ ] **Step 5: Record the duel's pre-R-2 baseline and check it reproduces**

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version 37: 20 runs, 205178 ticks, 304 named fields per tick; written to` and the file's path (beside the canonical trace), exit 0, in about 30 s.

Run: `npx tsx scripts/golden/duel-oracle.ts same`
Expected: `duel oracle: 20 runs, 205178 ticks, 304 named fields, results, events and telemetry identical at every tick field for field, sim version 37 → 37 (baseline HEAD …)`, exit 0.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/golden/duelOracle.ts scripts/golden/duel-oracle.ts scripts/golden/blessGuard.ts scripts/bless-golden.ts tests/duelOracle.test.ts tests/blessGuard.test.ts tests/helpers/scriptedDuel.ts
git commit -q -m "feat(golden): the duel migration oracle; the bless guard requires it on every SIM_VERSION bump (engine refactor R-2)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 2: The seam: the systems view, the missile accessors and the target, golden-neutral

**Files:**
- Modify: `src/renderer/src/sim/tactical/state.ts`, `src/renderer/src/sim/tactical/hash.ts`, `src/renderer/src/sim/duel/scripted.ts`, `src/renderer/src/sim/duel/step.ts`, `src/renderer/src/sim/duel/telemetry.ts`, `src/renderer/src/app/duel/controls.ts`, `src/renderer/src/app/duel/runtime.ts`, `src/renderer/src/render/duel/interiorModel.ts`, `src/renderer/src/render/duel/readoutModel.ts`, `src/renderer/src/render/tactical/fxModel.ts`, `src/renderer/src/render/tactical/tacticalModel.ts`, `src/renderer/src/render/tactical/weaponsModel.ts`
- Modify (by the codemod, then three edits): `tests/duel.test.ts`, `tests/duelCheckpoint.test.ts`, `tests/duelControls.test.ts`, `tests/duelInterior.test.ts`, `tests/duelReadout.test.ts`, `tests/duelRuntime.test.ts`, `tests/duelScripted.test.ts`, `tests/duelSnapshot.test.ts`, `tests/duelTelemetry.test.ts`, `tests/duelWeaponsView.test.ts`, `tests/tacticalContacts.test.ts`, `tests/tacticalDeterminism.test.ts`, `tests/tacticalHunter.test.ts`, `tests/tacticalMissiles.test.ts`, `tests/tacticalSoloFlight.test.ts`, `tests/tacticalWeapons.test.ts`

**Interfaces:**
- Consumes: Task 1's oracle and both baselines.
- Produces (`sim/tactical/state.ts`): `interface ShipSystems` (the moved fields; `Ship extends ShipSystems` until Task 3); `TacticalState.systems: [ShipSystems, ShipSystems]`, the same objects as `ships`; `targetOf(state, i)` (today `1 − i`); `missileOf(state, i)`, `placeMissile(state, i, m)`, `removeMissile(state, i)`. Task 3 keeps every one of these signatures.

- [ ] **Step 1: The seam in the tactical state**

In `src/renderer/src/sim/tactical/state.ts`, replace:

```ts
export const Room = { Weapons: 0, Shields: 1, Engines: 2 } as const;

export interface Ship {
  x: number; y: number; vx: number; vy: number;
  /** Heading index 0..255 and the fractional turn accumulator (spec §4). */
  heading: number; headingAcc: number;
  hull: number;
  /** Damage level 0..2 per Room. */
  rooms: [number, number, number];
  /** Tick from which contact with body id k may cost hull again: 0 planet, 1..n asteroid k−1, n+1 the other ship. */
  graceUntil: Int32Array;
  planetHits: number; asteroidHits: number; shipHits: number;
  /** Stabilise (spec §6): true while both axes were zero last tick; the skid captured at release and still to remove, and its side (±1). */
  released: boolean; skidBudget: number; skidSign: number;
  /** Shield layers 0..2 and the recharge clock in SHIELD_RECHARGE_UNITS (spec §5). */
  shields: number; shieldClock: number;
```

with:

```ts
export const Room = { Weapons: 0, Shields: 1, Engines: 2 } as const;

/** A ship's systems record (engine refactor spec §5, R-2): hull, room damage, shields, the laser, the magazine and the
 *  weapon counters. Read it as `state.systems[i]`. Until R-2's storage change these are still members of Ship and
 *  `systems` holds the same objects as `ships`. */
export interface ShipSystems {
  hull: number;
  /** Damage level 0..2 per Room. */
  rooms: [number, number, number];
  /** Shield layers 0..2 and the recharge clock in SHIELD_RECHARGE_UNITS (spec §5). */
  shields: number; shieldClock: number;
```

In `src/renderer/src/sim/tactical/state.ts`, replace:

```ts
  /** Telemetry counters (spec §13). */
  shots: number; laserHits: number; layersStripped: number; missilesLaunched: number; missileHits: number; missilesLost: number;
}
```

with:

```ts
  /** Telemetry counters (spec §13). */
  shots: number; laserHits: number; layersStripped: number; missilesLaunched: number; missileHits: number; missilesLost: number;
}

export interface Ship extends ShipSystems {
  x: number; y: number; vx: number; vy: number;
  /** Heading index 0..255 and the fractional turn accumulator (spec §4). */
  heading: number; headingAcc: number;
  /** Tick from which contact with body id k may cost hull again: 0 planet, 1..n asteroid k−1, n+1 the other ship. */
  graceUntil: Int32Array;
  planetHits: number; asteroidHits: number; shipHits: number;
  /** Stabilise (spec §6): true while both axes were zero last tick; the skid captured at release and still to remove, and its side (±1). */
  released: boolean; skidBudget: number; skidSign: number;
}
```

In `src/renderer/src/sim/tactical/state.ts`, replace:

```ts
  tick: number; seed: number; rng: RngState; map: MapDef; grid: BroadPhase;
  ships: [Ship, Ship];
  missiles: [Missile | null, Missile | null];
  hunter: Hunter;
```

with:

```ts
  tick: number; seed: number; rng: RngState; map: MapDef; grid: BroadPhase;
  ships: [Ship, Ship];
  /** Each ship's systems record, by ship slot (the same objects as `ships` until R-2's storage change). */
  systems: [ShipSystems, ShipSystems];
  missiles: [Missile | null, Missile | null];
  hunter: Hunter;
```

In `src/renderer/src/sim/tactical/state.ts`, replace:

```ts
  const rng = createRng(seed);
  const map = generateMap(rng);
  const bodies = map.asteroids.length + 2;
  return {
    tick: 0, seed, rng, map, grid: buildGrid(map.asteroids, map.rMap),
    ships: [shipAt(map.spawns[0], bodies), shipAt(map.spawns[1], bodies)],
    missiles: [null, null], hunter: hunterFor(map.spawns[0]), outcome: Outcome.Running, events: []
  };
}

/** Deep copy of the whole tactical state for snapshots, rollback and replay checks, derived from the space module's
```

with:

```ts
  const rng = createRng(seed);
  const map = generateMap(rng);
  const bodies = map.asteroids.length + 2, ships: [Ship, Ship] = [shipAt(map.spawns[0], bodies), shipAt(map.spawns[1], bodies)];
  return {
    tick: 0, seed, rng, map, grid: buildGrid(map.asteroids, map.rMap), ships, systems: ships,
    missiles: [null, null], hunter: hunterFor(map.spawns[0]), outcome: Outcome.Running, events: []
  };
}

/** The ship slot ship i's weapons are locked on (spec §5 "arrays, not pairs"): today the other ship. */
export function targetOf(_state: TacticalState, i: number): number { return 1 - i; }

/** Ship i's missile in flight, or null (at most one per ship). */
export function missileOf(state: TacticalState, i: number): Missile | null { return state.missiles[i] ?? null; }
/** Put a missile in flight for ship i with these flight values (tests and the launch). Returns it. */
export function placeMissile(state: TacticalState, i: number, m: Missile): Missile {
  const missile: Missile = { x: m.x, y: m.y, vx: m.vx, vy: m.vy, heading: m.heading, headingAcc: m.headingAcc, age: m.age };
  state.missiles[i] = missile;
  return missile;
}
/** Take ship i's missile out of flight, with no event (a missile ending goes through the missile step). */
export function removeMissile(state: TacticalState, i: number): void { state.missiles[i] = null; }

/** Deep copy of the whole tactical state for snapshots, rollback and replay checks, derived from the space module's
```

In `src/renderer/src/sim/tactical/hash.ts`, replace:

```ts
    grid: 'the broad-phase grid, rebuilt from the map',
    events: 'per-tick events for the views, cleared every tick'
```

with:

```ts
    grid: 'the broad-phase grid, rebuilt from the map',
    systems: 'the same Ship objects as ships until R-2 moves the systems record out',
    events: 'per-tick events for the views, cleared every tick'
```

In `src/renderer/src/sim/tactical/hash.ts`, replace:

```ts
    hunter: { ...s.hunter, trail: new Float64Array(s.hunter.trail.length) }, events: s.events.map((e) => ({ ...e })) };
  const values: number[] = [];
```

with:

```ts
    hunter: { ...s.hunter, trail: new Float64Array(s.hunter.trail.length) }, events: s.events.map((e) => ({ ...e })) };
  copy.systems = copy.ships;
  const values: number[] = [];
```

- [ ] **Step 2: The duel step, telemetry and the scripted pair read the seam**

In `src/renderer/src/sim/duel/step.ts`, replace:

```ts
function repairPhase(d: DuelState, held: readonly HeldInput[]): void {
  const crewShip = d.tactical.ships[0], workers: number[][] = [[], [], []];
  for (let pid = 0; pid < 2; pid++) {
```

with:

```ts
function repairPhase(d: DuelState, held: readonly HeldInput[]): void {
  const crewShip = d.tactical.systems[0], workers: number[][] = [[], [], []];
  for (let pid = 0; pid < 2; pid++) {
```

In `src/renderer/src/sim/duel/telemetry.ts`, replace:

```ts
import { inArc } from '../tactical/geometry';
import { Outcome } from '../tactical/state';
import { CONTACT_GRACE_TICKS, LASER_ARC_COS, LASER_RANGE } from '../tactical/tuning';
```

with:

```ts
import { inArc } from '../tactical/geometry';
import { missileOf, Outcome, targetOf } from '../tactical/state';
import { CONTACT_GRACE_TICKS, LASER_ARC_COS, LASER_RANGE } from '../tactical/tuning';
```

In `src/renderer/src/sim/duel/telemetry.ts`, replace:

```ts

const counters = (d: DuelState): number[][] => d.tactical.ships.map((s) => [s.planetHits, s.asteroidHits, s.shipHits, s.missilesLaunched]);
const seats = (d: DuelState): [number, number] => [Seated.station[d.interior.crew[0]!]!, Seated.station[d.interior.crew[1]!]!];
```

with:

```ts

const counters = (d: DuelState): number[][] => d.tactical.ships.map((s, i) => [s.planetHits, s.asteroidHits, s.shipHits, d.tactical.systems[i]!.missilesLaunched]);
const seats = (d: DuelState): [number, number] => [Seated.station[d.interior.crew[0]!]!, Seated.station[d.interior.crew[1]!]!];
```

In `src/renderer/src/sim/duel/telemetry.ts`, replace:

```ts
      s.laserReleases++;
      if (e.hit) { s.laserHits++; if (e.stripped) s.layersStripped++; else laserOn[1 - e.ship] = true; } else s.laserMisses++;
    } else if (e.cause === 'ship') {
```

with:

```ts
      s.laserReleases++;
      if (e.hit) { s.laserHits++; if (e.stripped) s.layersStripped++; else laserOn[targetOf(tac, e.ship)] = true; } else s.laserMisses++;
    } else if (e.cause === 'ship') {
```

In `src/renderer/src/sim/duel/telemetry.ts`, replace:

```ts
  }
  const m = t.manoeuvre, ship = tac.map.asteroids.length + 1;
  if (m.tick >= 0 && tick - m.tick <= BAIT_WINDOW_TICKS) for (const k of struck[1]!) {
    if (k === ship) continue;
    const b = k === 0 ? tac.map.planet : tac.map.asteroids[k - 1]!;
```

with:

```ts
  }
  const m = t.manoeuvre, asteroids = tac.map.asteroids.length;
  if (m.tick >= 0 && tick - m.tick <= BAIT_WINDOW_TICKS) for (const k of struck[1]!) {
    if (k > asteroids) continue;   // a ship body: only the planet and asteroids can be baits
    const b = k === 0 ? tac.map.planet : tac.map.asteroids[k - 1]!;
```

In `src/renderer/src/sim/duel/telemetry.ts`, replace:

```ts
  if (arc) t.enemyInArcTicks++;
  if (gunner >= 0 && tac.missiles[0] === null && laserFull(tac, 0) && (!canLaunch(tac, 0) || inRange) && !arc) t.weaponsIdleTicks++;
```

with:

```ts
  if (arc) t.enemyInArcTicks++;
  if (gunner >= 0 && missileOf(tac, 0) === null && laserFull(tac, 0) && (!canLaunch(tac, 0) || inRange) && !arc) t.weaponsIdleTicks++;
```

In `src/renderer/src/sim/duel/telemetry.ts`, replace:

```ts
  if (tac.outcome !== Outcome.Running) for (let i = 0; i < 2; i++) {
    if (tac.ships[i]!.hull > 0) continue;
    const c: TerminalCause[] = [], was = t.prev.counters[i]!, is = now[i]!;
```

with:

```ts
  if (tac.outcome !== Outcome.Running) for (let i = 0; i < 2; i++) {
    if (tac.systems[i]!.hull > 0) continue;
    const c: TerminalCause[] = [], was = t.prev.counters[i]!, is = now[i]!;
```

In `src/renderer/src/sim/duel/scripted.ts`, replace:

```ts
import { predictPath } from '../tactical/predict';
import { Room, type Axes } from '../tactical/state';
import { BELT_OUTER, LASER_ARC_COS, LASER_HOLD_TICKS, LASER_RANGE, R_MAP, SHIP_RADIUS } from '../tactical/tuning';
```

with:

```ts
import { predictPath } from '../tactical/predict';
import { missileOf, Room, targetOf, type Axes } from '../tactical/state';
import { BELT_OUTER, LASER_ARC_COS, LASER_HOLD_TICKS, LASER_RANGE, R_MAP, SHIP_RADIUS } from '../tactical/tuning';
```

In `src/renderer/src/sim/duel/scripted.ts`, replace:

```ts
function helmAxes(pair: ScriptedPair, d: DuelState): Axes {
  const t = d.tactical, s = t.ships[0], e = t.ships[1];
  const away = hazardAway(d, pair.axes);
```

with:

```ts
function helmAxes(pair: ScriptedPair, d: DuelState): Axes {
  const t = d.tactical, s = t.ships[0], e = t.ships[targetOf(t, 0)]!;
  const away = hazardAway(d, pair.axes);
```

In `src/renderer/src/sim/duel/scripted.ts`, replace:

```ts
  const ex = e.x - s.x, ey = e.y - s.y;
  if (laserFull(t, 0) && s.fireHeld && ex * ex + ey * ey <= LASER_RANGE * LASER_RANGE && !inArc(s.heading, ex, ey, LASER_ARC_COS))
    return { turn: turnToward(s.heading, ex, ey), thrust: 0 };
```

with:

```ts
  const ex = e.x - s.x, ey = e.y - s.y;
  if (laserFull(t, 0) && t.systems[0].fireHeld && ex * ex + ey * ey <= LASER_RANGE * LASER_RANGE && !inArc(s.heading, ex, ey, LASER_ARC_COS))
    return { turn: turnToward(s.heading, ex, ey), thrust: 0 };
```

In `src/renderer/src/sim/duel/scripted.ts`, replace:

```ts
function assignRepairs(pair: ScriptedPair, d: DuelState): void {
  const rooms = d.tactical.ships[0].rooms;
  for (let pid = 0; pid < 2; pid++) if (pair.task[pid]! >= 0 && rooms[pair.task[pid]!] === 0) pair.task[pid as 0 | 1] = -1;
```

with:

```ts
function assignRepairs(pair: ScriptedPair, d: DuelState): void {
  const rooms = d.tactical.systems[0].rooms;
  for (let pid = 0; pid < 2; pid++) if (pair.task[pid]! >= 0 && rooms[pair.task[pid]!] === 0) pair.task[pid as 0 | 1] = -1;
```

In `src/renderer/src/sim/duel/scripted.ts`, replace:

```ts
function gunner(pair: ScriptedPair, d: DuelState, out: DuelCommand[]): number {
  const t = d.tactical, s = t.ships[0], e = t.ships[1], ex = e.x - s.x, ey = e.y - s.y;
  const want = e.shields > 0 ? Room.Shields : Room.Weapons;
  if (s.lock !== want) out.push({ kind: 'laserLock', room: want });
  const m = t.missiles[0];
  if (m) return pursuitTurn(m.heading, e.x - m.x, e.y - m.y);
```

with:

```ts
function gunner(pair: ScriptedPair, d: DuelState, out: DuelCommand[]): number {
  const t = d.tactical, target = targetOf(t, 0), s = t.ships[0], e = t.ships[target]!, ex = e.x - s.x, ey = e.y - s.y, sys = t.systems[0];
  const want = t.systems[target]!.shields > 0 ? Room.Shields : Room.Weapons;
  if (sys.lock !== want) out.push({ kind: 'laserLock', room: want });
  const m = missileOf(t, 0);
  if (m) return pursuitTurn(m.heading, e.x - m.x, e.y - m.y);
```

In `src/renderer/src/sim/duel/scripted.ts`, replace:

```ts
  if (!canCharge(t, 0)) return 0;
  if (!s.fireHeld) out.push({ kind: 'laserCharge', held: true });
  else if (laserFull(t, 0) && (laserEligible(t, 0, 1) || s.laserHold >= LASER_HOLD_TICKS - 1)) out.push({ kind: 'laserCharge', held: false });   // release on a shot, or before the vent
  return 0;
```

with:

```ts
  if (!canCharge(t, 0)) return 0;
  if (!sys.fireHeld) out.push({ kind: 'laserCharge', held: true });
  else if (laserFull(t, 0) && (laserEligible(t, 0, target) || sys.laserHold >= LASER_HOLD_TICKS - 1)) out.push({ kind: 'laserCharge', held: false });   // release on a shot, or before the vent
  return 0;
```

- [ ] **Step 3: The H-1 views read the seam**

In `src/renderer/src/app/duel/controls.ts`, replace:

```ts
  if (Seated.station[eid]! >= 0 || Life.state[eid] !== LifeState.Conscious) return -1;
  const here = roomAt(d.interior, Position.x[eid]!, Position.y[eid]!), ship = d.tactical.ships[0];
  const p = d.points.find((q) => ship.rooms[q.tacticalRoom]! > 0 && q.room === here && inReachOfTile(d.interior, eid, q.tile));
```

with:

```ts
  if (Seated.station[eid]! >= 0 || Life.state[eid] !== LifeState.Conscious) return -1;
  const here = roomAt(d.interior, Position.x[eid]!, Position.y[eid]!), ship = d.tactical.systems[0];
  const p = d.points.find((q) => ship.rooms[q.tacticalRoom]! > 0 && q.room === here && inReachOfTile(d.interior, eid, q.tile));
```

In `src/renderer/src/app/duel/runtime.ts`, replace:

```ts
import { stepSoloFlight } from '../../sim/tactical/physics';
import { createTacticalState, NO_AXES, Outcome, type Axes, type TacticalState } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
```

with:

```ts
import { stepSoloFlight } from '../../sim/tactical/physics';
import { createTacticalState, missileOf, NO_AXES, Outcome, type Axes, type Missile, type TacticalState } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
```

In `src/renderer/src/app/duel/runtime.ts`, replace:

```ts
const shipBody = (s: TacticalState['ships'][number]): PrevBody => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc });
const missileBody = (m: TacticalState['missiles'][number]): PrevBody | null => (m ? { x: m.x, y: m.y, h: m.heading + m.headingAcc } : null);
const hitCounts = (d: DuelState): number[][] => d.tactical.ships.map((s) => [s.planetHits, s.asteroidHits, s.shipHits]);
```

with:

```ts
const shipBody = (s: TacticalState['ships'][number]): PrevBody => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc });
const missileBody = (m: Missile | null): PrevBody | null => (m ? { x: m.x, y: m.y, h: m.heading + m.headingAcc } : null);
const hitCounts = (d: DuelState): number[][] => d.tactical.ships.map((s) => [s.planetHits, s.asteroidHits, s.shipHits]);
```

In `src/renderer/src/app/duel/runtime.ts`, replace:

```ts
    prev = d.tactical.ships.map(shipBody);
    missilePrev = d.tactical.missiles.map(missileBody);
    crewPrev = d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));
```

with:

```ts
    prev = d.tactical.ships.map(shipBody);
    missilePrev = d.tactical.ships.map((_, i) => missileBody(missileOf(d.tactical, i)));   // by owner, as interpolatedMissile reads it
    crewPrev = d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));
```

In `src/renderer/src/app/duel/runtime.ts`, replace:

```ts
      const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'laserLock')?.command;
      let room = last && last.kind === 'laserLock' ? last.room : d.tactical.ships[0].lock;
      for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
```

with:

```ts
      const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'laserLock')?.command;
      let room = last && last.kind === 'laserLock' ? last.room : d.tactical.systems[0].lock;
      for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
```

In `src/renderer/src/app/duel/runtime.ts`, replace:

```ts
      const cam = cameras.weapons;
      snapBack(cam, d.tactical.missiles[0] && cam.follow !== 'missile' ? 'missile' : 'ship');
    }
```

with:

```ts
      const cam = cameras.weapons;
      snapBack(cam, missileOf(d.tactical, 0) && cam.follow !== 'missile' ? 'missile' : 'ship');
    }
```

In `src/renderer/src/app/duel/runtime.ts`, replace:

```ts
      for (const c of [cameras.helm, cameras.weapons]) {
        if (c.follow === 'missile' && !d.tactical.missiles[0]) followBody(c, 'ship');   // the followed missile ended
        // A followed missile is tracked at its interpolated (drawn) position, as the ship is (H-1 spec §6).
```

with:

```ts
      for (const c of [cameras.helm, cameras.weapons]) {
        if (c.follow === 'missile' && !missileOf(d.tactical, 0)) followBody(c, 'ship');   // the followed missile ended
        // A followed missile is tracked at its interpolated (drawn) position, as the ship is (H-1 spec §6).
```

In `src/renderer/src/render/duel/interiorModel.ts`, replace:

```ts
export function interiorOverlay(d: DuelState): InteriorOverlay {
  const st = d.interior, w = st.derived.width, ship = d.tactical.ships[0];
  const px = (t: number): { x: number; y: number } => { const tx = t % w; return { x: tx * TILE_PX, y: ((t - tx) / w) * TILE_PX }; };
```

with:

```ts
export function interiorOverlay(d: DuelState): InteriorOverlay {
  const st = d.interior, w = st.derived.width, ship = d.tactical.systems[0];
  const px = (t: number): { x: number; y: number } => { const tx = t % w; return { x: tx * TILE_PX, y: ((t - tx) / w) * TILE_PX }; };
```

In `src/renderer/src/render/duel/readoutModel.ts`, replace:

```ts
import type { DuelState } from '../../sim/duel/state';
import { REPAIR_UNITS } from '../../sim/duel/tuning';
```

with:

```ts
import type { DuelState } from '../../sim/duel/state';
import { missileOf, targetOf } from '../../sim/tactical/state';
import { REPAIR_UNITS } from '../../sim/duel/tuning';
```

In `src/renderer/src/render/duel/readoutModel.ts`, replace:

```ts
export function readoutRows(input: ReadoutInput): ReadoutRow[] {
  const d = input.duel, [crew, enemy] = d.tactical.ships, other = input.active === 0 ? 1 : 0;
  const rows: ReadoutRow[] = [
```

with:

```ts
export function readoutRows(input: ReadoutInput): ReadoutRow[] {
  const d = input.duel, t = d.tactical, target = targetOf(t, 0), other = input.active === 0 ? 1 : 0;
  const crew = t.ships[0], enemy = t.ships[target]!, crewSys = t.systems[0], enemySys = t.systems[target]!;
  const rows: ReadoutRow[] = [
```

In `src/renderer/src/render/duel/readoutModel.ts`, replace:

```ts
    heading('CUTTER', CREW_SHIP),
    row('HULL', `${crew.hull}/${SHIP_HULL}`, DIM, crew.hull <= SHIP_HULL / 4 ? WARN : TEXT),
    { ...row('SHIELD'), pips: { n: crew.shields, max: SHIELD_LAYERS, colour: CREW_SHIP } }
  ];
  for (let r = 0; r < 3; r++) {
    const n = crew.rooms[r]!, progress = d.repair[r]! / REPAIR_UNITS, out = row(ROOM_NAMES[r]!, level(n), DIM, levelTint(n));
    rows.push(n > 0 && progress > 0 ? { ...out, bar: { fill: progress, colour: GOOD } } : out);
```

with:

```ts
    heading('CUTTER', CREW_SHIP),
    row('HULL', `${crewSys.hull}/${SHIP_HULL}`, DIM, crewSys.hull <= SHIP_HULL / 4 ? WARN : TEXT),
    { ...row('SHIELD'), pips: { n: crewSys.shields, max: SHIELD_LAYERS, colour: CREW_SHIP } }
  ];
  for (let r = 0; r < 3; r++) {
    const n = crewSys.rooms[r]!, progress = d.repair[r]! / REPAIR_UNITS, out = row(ROOM_NAMES[r]!, level(n), DIM, levelTint(n));
    rows.push(n > 0 && progress > 0 ? { ...out, bar: { fill: progress, colour: GOOD } } : out);
```

In `src/renderer/src/render/duel/readoutModel.ts`, replace:

```ts
  rows.push(heading('HUNTER', ENEMY_SHIP));
  rows.push(row('HULL', `${enemy.hull}/${SHIP_HULL}`, DIM, enemy.hull <= SHIP_HULL / 4 ? GOOD : TEXT));
  rows.push({ ...row('SHIELD'), pips: { n: enemy.shields, max: SHIELD_LAYERS, colour: ENEMY_SHIP } });
  rows.push(row('ROOMS', enemy.rooms.map((n, r) => `${ROOM_NAMES[r]!.charAt(0)}${n}`).join(' ')));
  if (input.mode === 'weapons') {
    const flying = d.tactical.missiles[0] !== null, full = crew.laserCharge >= LASER_CHARGE_UNITS;
    rows.push(heading('LASER', AMBER));
    rows.push(row('LOCK', ROOM_NAMES[crew.lock]!));
    const value = flying ? 'FROZEN' : full ? `HOLD ${((LASER_HOLD_TICKS - crew.laserHold) / TICK_HZ).toFixed(1)}` : `${Math.floor((crew.laserCharge / LASER_CHARGE_UNITS) * 100)}%`;
    rows.push({ ...row('CHARGE', value, DIM, full && !flying ? GOOD : TEXT), bar: { fill: crew.laserCharge / LASER_CHARGE_UNITS, colour: full ? GOOD : AMBER } });
    rows.push(row('MAG', `${crew.magazine}/${MAGAZINE}${flying ? ' FLYING' : ''}`));
  }
```

with:

```ts
  rows.push(heading('HUNTER', ENEMY_SHIP));
  rows.push(row('HULL', `${enemySys.hull}/${SHIP_HULL}`, DIM, enemySys.hull <= SHIP_HULL / 4 ? GOOD : TEXT));
  rows.push({ ...row('SHIELD'), pips: { n: enemySys.shields, max: SHIELD_LAYERS, colour: ENEMY_SHIP } });
  rows.push(row('ROOMS', enemySys.rooms.map((n, r) => `${ROOM_NAMES[r]!.charAt(0)}${n}`).join(' ')));
  if (input.mode === 'weapons') {
    const flying = missileOf(t, 0) !== null, full = crewSys.laserCharge >= LASER_CHARGE_UNITS;
    rows.push(heading('LASER', AMBER));
    rows.push(row('LOCK', ROOM_NAMES[crewSys.lock]!));
    const value = flying ? 'FROZEN' : full ? `HOLD ${((LASER_HOLD_TICKS - crewSys.laserHold) / TICK_HZ).toFixed(1)}` : `${Math.floor((crewSys.laserCharge / LASER_CHARGE_UNITS) * 100)}%`;
    rows.push({ ...row('CHARGE', value, DIM, full && !flying ? GOOD : TEXT), bar: { fill: crewSys.laserCharge / LASER_CHARGE_UNITS, colour: full ? GOOD : AMBER } });
    rows.push(row('MAG', `${crewSys.magazine}/${MAGAZINE}${flying ? ' FLYING' : ''}`));
  }
```

In `src/renderer/src/render/duel/readoutModel.ts`, replace:

```ts
    rows.push(row('BEARING', String(bearingDeg(dx, dy)).padStart(3, '0')));
    const m = d.tactical.missiles[1];
    if (m && (m.x - crew.x) ** 2 + (m.y - crew.y) ** 2 <= INCOMING_RANGE * INCOMING_RANGE) rows.push(heading('MISSILE INBOUND', WARN));
```

with:

```ts
    rows.push(row('BEARING', String(bearingDeg(dx, dy)).padStart(3, '0')));
    const m = missileOf(t, target);
    if (m && (m.x - crew.x) ** 2 + (m.y - crew.y) ** 2 <= INCOMING_RANGE * INCOMING_RANGE) rows.push(heading('MISSILE INBOUND', WARN));
```

In `src/renderer/src/render/tactical/fxModel.ts`, replace:

```ts
// hashed; a restart resets it. Times are render seconds.
import type { DuelEvent, TacticalState } from '../../sim/tactical/state';
import { HEADING_COUNT } from '../../sim/tactical/tuning';
```

with:

```ts
// hashed; a restart resets it. Times are render seconds.
import { missileOf, type DuelEvent, type TacticalState } from '../../sim/tactical/state';
import { HEADING_COUNT } from '../../sim/tactical/tuning';
```

In `src/renderer/src/render/tactical/fxModel.ts`, replace:

```ts

/** A missile's interpolated position, or null when none flies. */
export function interpolatedMissile(state: TacticalState, missilePrev: readonly (PrevBody | null)[], alpha: number, i: number): PrevBody | null {
  const m = state.missiles[i];
  if (!m) return null;
```

with:

```ts

/** Ship i's missile's interpolated position, or null when none flies. `missilePrev` is by owner (ship slot). */
export function interpolatedMissile(state: TacticalState, missilePrev: readonly (PrevBody | null)[], alpha: number, i: number): PrevBody | null {
  const m = missileOf(state, i);
  if (!m) return null;
```

In `src/renderer/src/render/tactical/tacticalModel.ts`, replace:

```ts
import { predictPath } from '../../sim/tactical/predict';
import type { Axes, TacticalState } from '../../sim/tactical/state';
import { HEADING_COUNT, R_MAP, SHIP_RADIUS } from '../../sim/tactical/tuning';
```

with:

```ts
import { predictPath } from '../../sim/tactical/predict';
import { missileOf, type Axes, type TacticalState } from '../../sim/tactical/state';
import { HEADING_COUNT, R_MAP, SHIP_RADIUS } from '../../sim/tactical/tuning';
```

In `src/renderer/src/render/tactical/tacticalModel.ts`, replace:

```ts
  if (follow === 'free') return null;
  if (follow === 'missile') { const m = state.missiles[own]; return m ? { x: m.x, y: m.y } : null; }
  const s = interpolatedShip(state, prev, alpha, own);
```

with:

```ts
  if (follow === 'free') return null;
  if (follow === 'missile') { const m = missileOf(state, own); return m ? { x: m.x, y: m.y } : null; }
  const s = interpolatedShip(state, prev, alpha, own);
```

In `src/renderer/src/render/tactical/tacticalModel.ts`, replace:

```ts
  for (const i of input.ships) {
    const b = interpolatedShip(state, prev, alpha, i), s = state.ships[i]!;
    if (!onScreen(b.x, b.y, SHIP_RADIUS * 2)) continue;
```

with:

```ts
  for (const i of input.ships) {
    const b = interpolatedShip(state, prev, alpha, i), s = state.systems[i]!;
    if (!onScreen(b.x, b.y, SHIP_RADIUS * 2)) continue;
```

In `src/renderer/src/render/tactical/tacticalModel.ts`, replace:

```ts
  arrow('planet', map.planet.x, map.planet.y, own.x, own.y);
  const m = state.missiles[0];
  if (m) arrow('missile', m.x, m.y, own.x, own.y);
```

with:

```ts
  arrow('planet', map.planet.x, map.planet.y, own.x, own.y);
  const m = missileOf(state, 0);
  if (m) arrow('missile', m.x, m.y, own.x, own.y);
```

In `src/renderer/src/render/tactical/weaponsModel.ts`, replace:

```ts
// sits beside: the layer draws TacticalDraw and CombatDraw together.
import { laserEligible } from '../../sim/tactical/weapons';
```

with:

```ts
// sits beside: the layer draws TacticalDraw and CombatDraw together.
import { missileOf, targetOf } from '../../sim/tactical/state';
import { laserEligible } from '../../sim/tactical/weapons';
```

In `src/renderer/src/render/tactical/weaponsModel.ts`, replace:

```ts
  const own = interpolatedShip(state, prev, alpha, 0), ownS = toS(own.x, own.y);
  const enemy = interpolatedShip(state, prev, alpha, 1), enemyS = toS(enemy.x, enemy.y);
  const onScreen = (p: Point, r: number): boolean => p.x + r >= 0 && p.x - r <= vp.w && p.y + r >= 0 && p.y - r <= vp.h;
```

with:

```ts
  const own = interpolatedShip(state, prev, alpha, 0), ownS = toS(own.x, own.y);
  const target = targetOf(state, 0), enemy = interpolatedShip(state, prev, alpha, target), enemyS = toS(enemy.x, enemy.y);
  const onScreen = (p: Point, r: number): boolean => p.x + r >= 0 && p.x - r <= vp.w && p.y + r >= 0 && p.y - r <= vp.h;
```

In `src/renderer/src/render/tactical/weaponsModel.ts`, replace:

```ts
  let lock: LockDraw | null = null;
  const room = state.ships[0].lock;
  if (onScreen(enemyS, SHIP_RADIUS * 2 * z + 40)) {
```

with:

```ts
  let lock: LockDraw | null = null;
  const room = state.systems[0].lock;
  if (onScreen(enemyS, SHIP_RADIUS * 2 * z + 40)) {
```

In `src/renderer/src/render/tactical/weaponsModel.ts`, replace:

```ts
  if (input.console === 'weapons') {
    const dx = enemy.x - own.x, dy = enemy.y - own.y, range = Math.round(Math.sqrt(dx * dx + dy * dy)), inArc = laserEligible(state, 0, 1);
    const flying = state.missiles[0], drawn = interpolatedMissile(state, input.missilePrev, alpha, 0);
    weapons = {
      ownArc: { x: ownS.x, y: ownS.y, r: LASER_RANGE * z, angle: headingAngle(own.h), half: ARC_HALF },
      enemyArc: input.ships.includes(1) ? { x: enemyS.x, y: enemyS.y, r: LASER_RANGE * z, angle: headingAngle(enemy.h), half: ARC_HALF } : null,
      ring: z >= BEARING_RING_ZOOM ? ringDraw(ownS.x, ownS.y) : null,
```

with:

```ts
  if (input.console === 'weapons') {
    const dx = enemy.x - own.x, dy = enemy.y - own.y, range = Math.round(Math.sqrt(dx * dx + dy * dy)), inArc = laserEligible(state, 0, target);
    const flying = missileOf(state, 0), drawn = interpolatedMissile(state, input.missilePrev, alpha, 0);
    weapons = {
      ownArc: { x: ownS.x, y: ownS.y, r: LASER_RANGE * z, angle: headingAngle(own.h), half: ARC_HALF },
      enemyArc: input.ships.includes(target) ? { x: enemyS.x, y: enemyS.y, r: LASER_RANGE * z, angle: headingAngle(enemy.h), half: ARC_HALF } : null,
      ring: z >= BEARING_RING_ZOOM ? ringDraw(ownS.x, ownS.y) : null,
```

Run: `npm run typecheck`
Expected: exit 0 (`Ship` still extends `ShipSystems`, so the tests compile unchanged).

- [ ] **Step 4: Move the tests onto the seam (the codemod)**

Create `out/r2-codemod.cjs` (in the git-ignored `out/`; it is a one-off tool and is never committed):

```js
// Moves tests onto the systems record: X.<systems field> where X is typed Ship becomes a read of state.systems[i].
// A binding used only for systems fields is rebound (`= st.ships[0]` -> `= st.systems[0]`); a mixed one has its
// systems uses inlined. Then missile slot reads and writes become missileOf / placeMissile / removeMissile.
const ts = require('typescript');
const path = require('path');
const fs = require('fs');
const root = process.cwd();
const F = new Set('hull rooms shields shieldClock laserCharge laserHold fireHeld lock magazine magazineClock shots laserHits layersStripped missilesLaunched missileHits missilesLost'.split(' '));
const cfg = ts.getParsedCommandLineOfConfigFile(path.join(root, 'tsconfig.web.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(String(d.messageText)); } });
const program = ts.createProgram(cfg.fileNames, { ...cfg.options, noEmit: true, composite: false, incremental: false, tsBuildInfoFile: undefined });
const checker = program.getTypeChecker();
const unresolved = [];
const shipsAccess = (e) => ts.isPropertyAccessExpression(e) && e.name.text === 'ships';
for (const sf of program.getSourceFiles()) {
  const file = path.relative(root, sf.fileName).replace(/\\/g, '/');
  if (!file.startsWith('tests/')) continue;
  const isShip = (e) => { const t = checker.getTypeAtLocation(e), s = t.getSymbol() || t.aliasSymbol; return !!s && s.getName() === 'Ship'; };
  // Every identifier reference, by symbol.
  const refs = new Map();
  const collect = (node) => {
    if (ts.isIdentifier(node)) { const s = checker.getSymbolAtLocation(node); if (s) { if (!refs.has(s)) refs.set(s, []); refs.get(s).push(node); } }
    ts.forEachChild(node, collect);
  };
  collect(sf);
  const isSysUse = (id) => ts.isPropertyAccessExpression(id.parent) && id.parent.expression === id && F.has(id.parent.name.text);
  const edits = [], rebound = new Set();
  const bindingOf = (id) => {
    const s = checker.getSymbolAtLocation(id), decl = s && s.valueDeclaration;
    if (!decl) return null;
    if (ts.isVariableDeclaration(decl) && decl.initializer && ts.isElementAccessExpression(decl.initializer) && shipsAccess(decl.initializer.expression))
      return { s, decl, base: decl.initializer.expression.expression.getText(sf), idx: decl.initializer.argumentExpression.getText(sf), init: decl.initializer.expression };
    if (ts.isBindingElement(decl) && ts.isArrayBindingPattern(decl.parent) && ts.isVariableDeclaration(decl.parent.parent)) {
      const vd = decl.parent.parent;
      if (vd.initializer && shipsAccess(vd.initializer)) return { s, decl, pattern: decl.parent, base: vd.initializer.expression.getText(sf), idx: String(decl.parent.elements.indexOf(decl)), init: vd.initializer };
    }
    return null;
  };
  const onlySys = (b) => refs.get(b.s).filter((id) => id !== b.decl.name).every(isSysUse);
  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && F.has(node.name.text) && isShip(node.expression)) {
      const e = node.expression;
      let repl = null;
      if (ts.isElementAccessExpression(e) && shipsAccess(e.expression)) repl = `${e.expression.expression.getText(sf)}.systems[${e.argumentExpression.getText(sf)}]`;
      else if (ts.isNonNullExpression(e) && ts.isElementAccessExpression(e.expression) && shipsAccess(e.expression.expression)) repl = `${e.expression.expression.expression.getText(sf)}.systems[${e.expression.argumentExpression.getText(sf)}]!`;
      else if (ts.isIdentifier(e)) {
        const b = bindingOf(e);
        if (b) {
          const whole = b.pattern ? b.pattern.elements.every((el) => !ts.isOmittedExpression(el) && onlySys(bindingOf(el.name))) : onlySys(b);
          if (whole) { if (!rebound.has(b.init)) { rebound.add(b.init); edits.push({ start: b.init.name.getStart(sf), end: b.init.name.getEnd(), text: 'systems' }); } }
          else repl = `${b.base}.systems[${b.idx}]`;
        }
        else unresolved.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: ${node.getText(sf)}`);
      } else unresolved.push(`${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: ${node.getText(sf)}`);
      if (repl) edits.push({ start: e.getStart(sf), end: e.getEnd(), text: repl });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  let text = sf.getFullText();
  for (const ed of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, ed.start) + ed.text + text.slice(ed.end);
  // Missile slots.
  const before = text, used = new Set();
  text = text.replace(/(\b[A-Za-z_][\w.]*)\.missiles\[([0-9])\]\s*=\s*null;/g, (_m, b, i) => { used.add('removeMissile'); return `removeMissile(${b}, ${i});`; });
  text = text.replace(/(\b[A-Za-z_][\w.]*)\.missiles\[([0-9])\]\s*=\s*(\{[^;\n]*\});/g, (_m, b, i, o) => { used.add('placeMissile'); return `placeMissile(${b}, ${i}, ${o});`; });
  text = text.replace(/(\b[A-Za-z_][\w.]*)\.missiles\[([0-9])\](?!\s*=[^=])/g, (m, b, i) => { if (b === 'c') return m; used.add('missileOf'); return `missileOf(${b}, ${i})`; });   // c: a CombatDraw's list
  if (used.size > 0) {
    const imp = /import \{([^}]*)\} from '\.\.\/src\/renderer\/src\/sim\/tactical\/state';/.exec(text);
    if (imp) {
      const names = imp[1].split(',').map((n) => n.trim()).filter(Boolean);
      for (const n of used) if (!names.includes(n)) names.push(n);
      const sorted = names.sort((a, b) => a.replace(/^type /, '').localeCompare(b.replace(/^type /, '')));
      text = text.replace(imp[0], `import { ${sorted.join(', ')} } from '../src/renderer/src/sim/tactical/state';`);
    } else {
      const lines = text.split('\n'), last = lines.reduce((k, l, i) => (l.startsWith('import ') ? i : k), -1);
      lines.splice(last + 1, 0, `import { ${[...used].sort().join(', ')} } from '../src/renderer/src/sim/tactical/state';`);
      text = lines.join('\n');
    }
  }
  if (text !== sf.getFullText()) { fs.writeFileSync(sf.fileName, text); console.log(`${file}: ${edits.length} systems edits${used.size ? `, missiles (${[...used].join(', ')})` : ''}`); }
}
console.log('unresolved:\n' + unresolved.join('\n'));
```

Run: `node out/r2-codemod.cjs`
Expected: these 16 lines, then `unresolved:` with exactly two lines (the hand edits below and Task 3's flight test):

```
tests/duel.test.ts: 15 systems edits, missiles (missileOf)
tests/duelCheckpoint.test.ts: 1 systems edits
tests/duelControls.test.ts: 2 systems edits
tests/duelInterior.test.ts: 6 systems edits
tests/duelReadout.test.ts: 9 systems edits, missiles (placeMissile)
tests/duelRuntime.test.ts: 17 systems edits, missiles (removeMissile, missileOf)
tests/duelScripted.test.ts: 1 systems edits
tests/duelSnapshot.test.ts: 0 systems edits, missiles (missileOf)
tests/duelTelemetry.test.ts: 10 systems edits, missiles (missileOf)
tests/duelWeaponsView.test.ts: 2 systems edits, missiles (removeMissile, missileOf)
tests/tacticalContacts.test.ts: 8 systems edits
tests/tacticalDeterminism.test.ts: 1 systems edits, missiles (missileOf)
tests/tacticalHunter.test.ts: 12 systems edits, missiles (removeMissile, placeMissile, missileOf)
tests/tacticalMissiles.test.ts: 17 systems edits, missiles (missileOf)
tests/tacticalSoloFlight.test.ts: 2 systems edits
tests/tacticalWeapons.test.ts: 18 systems edits
unresolved:
tests/duelCheckpoint.test.ts:104: ship.rooms
tests/tacticalFlight.test.ts:75: s.rooms
```

- [ ] **Step 5: The three edits the codemod cannot make**

An `Object.assign` that sets a systems field on a body, a loop that writes rooms and missiles together, and the key guard's list of state members:

In `tests/duel.test.ts`, replace:

```ts
      const d = createDuel(layout, 5), [s, e] = d.tactical.ships;
      Object.assign(e, { x: s.x + hx(s.heading) * 300, y: s.y + hy(s.heading) * 300, shields: 0 });   // dead ahead, shields down
      d.tactical.systems[0].fireHeld = true; d.tactical.systems[0].laserCharge = LASER_CHARGE_UNITS;
```

with:

```ts
      const d = createDuel(layout, 5), [s, e] = d.tactical.ships;
      Object.assign(e, { x: s.x + hx(s.heading) * 300, y: s.y + hy(s.heading) * 300 }); d.tactical.systems[1].shields = 0;   // dead ahead, shields down
      d.tactical.systems[0].fireHeld = true; d.tactical.systems[0].laserCharge = LASER_CHARGE_UNITS;
```

In `tests/duelCheckpoint.test.ts`, replace:

```ts
import type { DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { jsonModeCodecs } from '../src/network/modes/encounterMode';
```

with:

```ts
import type { DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { Outcome, placeMissile, removeMissile } from '../src/renderer/src/sim/tactical/state';
import { jsonModeCodecs } from '../src/network/modes/encounterMode';
```

In `tests/duelCheckpoint.test.ts`, replace:

```ts
      const t = h.state.duel.tactical, third = 1 / 3;
      for (const [i, ship] of t.ships.entries()) { ship.rooms = [2, 2, 2]; ship.x += third; ship.y -= third; ship.vx = third * (i + 1); }
      t.missiles = [0, 1].map((i) => ({ x: 1234.567891234567 + i, y: -987.6543210987654, vx: third, vy: -third, heading: 17, headingAcc: third, age: 211 })) as typeof t.missiles;
      h.state.duel.repair = [959, 481, 7];
```

with:

```ts
      const t = h.state.duel.tactical, third = 1 / 3;
      for (const [i, ship] of t.ships.entries()) { t.systems[i]!.rooms = [2, 2, 2]; ship.x += third; ship.y -= third; ship.vx = third * (i + 1); }
      for (const i of [0, 1]) { removeMissile(t, i); placeMissile(t, i, { x: 1234.567891234567 + i, y: -987.6543210987654, vx: third, vy: -third, heading: 17, headingAcc: third, age: 211 }); }
      h.state.duel.repair = [959, 481, 7];
```

In `tests/tacticalDeterminism.test.ts`, replace:

```ts
    expect(Object.keys(st.ships[0]).sort()).toEqual(['asteroidHits', 'fireHeld', 'graceUntil', 'heading', 'headingAcc', 'hull', 'laserCharge', 'laserHits', 'laserHold', 'layersStripped', 'lock', 'magazine', 'magazineClock', 'missileHits', 'missilesLaunched', 'missilesLost', 'planetHits', 'released', 'rooms', 'shieldClock', 'shields', 'shipHits', 'shots', 'skidBudget', 'skidSign', 'vx', 'vy', 'x', 'y']);
    expect(Object.keys(st).sort()).toEqual(['events', 'grid', 'hunter', 'map', 'missiles', 'outcome', 'rng', 'seed', 'ships', 'tick']);
    expect(Object.keys(st.hunter).sort()).toEqual(['fireAt', 'lastLaunch', 'mode', 'room', 'timer', 'trail', 'trailHead', 'working']);
```

with:

```ts
    expect(Object.keys(st.ships[0]).sort()).toEqual(['asteroidHits', 'fireHeld', 'graceUntil', 'heading', 'headingAcc', 'hull', 'laserCharge', 'laserHits', 'laserHold', 'layersStripped', 'lock', 'magazine', 'magazineClock', 'missileHits', 'missilesLaunched', 'missilesLost', 'planetHits', 'released', 'rooms', 'shieldClock', 'shields', 'shipHits', 'shots', 'skidBudget', 'skidSign', 'vx', 'vy', 'x', 'y']);
    expect(Object.keys(st).sort()).toEqual(['events', 'grid', 'hunter', 'map', 'missiles', 'outcome', 'rng', 'seed', 'ships', 'systems', 'tick']);
    expect(Object.keys(st.hunter).sort()).toEqual(['fireAt', 'lastLaunch', 'mode', 'room', 'timer', 'trail', 'trailHead', 'working']);
```

- [ ] **Step 6: Run the tactical and duel tests, and the proofs at the same version**

Run: `npx vitest run tests/tactical tests/duel tests/flightRuntime.test.ts`
Expected: PASS, 305 tests in 31 files. The duel golden passes unedited.

Run: `npx tsx scripts/golden/duel-oracle.ts same`
Expected: `duel oracle: 20 runs, 205178 ticks, 304 named fields, results, events and telemetry identical at every tick field for field, sim version 37 → 37 (baseline HEAD …)`, exit 0.

Run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: `per-tick canonical trace unchanged at sim version 37: golden 7200 ticks, determinism-v2 108000 ticks in 19 runs (baseline HEAD …)`, exit 0.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/duel/scripted.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/telemetry.ts src/renderer/src/app/duel/controls.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/render/duel/interiorModel.ts src/renderer/src/render/duel/readoutModel.ts src/renderer/src/render/tactical/fxModel.ts src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/tactical/weaponsModel.ts tests/duel.test.ts tests/duelCheckpoint.test.ts tests/duelControls.test.ts tests/duelInterior.test.ts tests/duelReadout.test.ts tests/duelRuntime.test.ts tests/duelScripted.test.ts tests/duelSnapshot.test.ts tests/duelTelemetry.test.ts tests/duelWeaponsView.test.ts tests/tacticalContacts.test.ts tests/tacticalDeterminism.test.ts tests/tacticalHunter.test.ts tests/tacticalMissiles.test.ts tests/tacticalSoloFlight.test.ts tests/tacticalWeapons.test.ts
git commit -q -m "refactor(duel): read ship systems, missiles and the target through one seam, golden-neutral (engine refactor R-2)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 3: Ship slots, the systems record, the missile pool and the definitions (SIM_VERSION 38)

**Files:**
- Create: `src/renderer/src/sim/tactical/defs.ts`, `tests/tacticalSlots.test.ts`
- Replace: `src/renderer/src/sim/tactical/state.ts`, `hash.ts`, `physics.ts`, `contacts.ts`, `missiles.ts`, `weapons.ts`, `duel.ts`; `tests/duelModules.test.ts`
- Modify: `src/renderer/src/sim/tactical/hunter.ts`, `predict.ts`; `src/renderer/src/render/tactical/missilePath.ts`; `src/renderer/src/sim/duel/modules.ts`, `snapshot.ts`; `src/renderer/src/authority/duelCheckpoint.ts`; `src/renderer/src/sim/tuning.ts`; `scripts/golden/duelOracle.ts`; `tests/duelOracle.test.ts`, `tests/duelSnapshot.test.ts`, `tests/tacticalDeterminism.test.ts`, `tests/tacticalFlight.test.ts`, `tests/tacticalMissiles.test.ts`, `tests/tacticalSoloFlight.test.ts`

**Interfaces:**
- Consumes: Task 2's seam (`systems`, `missileOf`, `placeMissile`, `removeMissile`, `targetOf`); Task 1's oracle and baselines.
- Produces:
  - `defs.ts`: `LaserDef`, `MissileDef`, `WeaponDef`, `ShipClassDef`; `LASER`, `MISSILE`, `CUTTER_CLASS`, `HUNTER_CLASS`, `SHIP_CLASSES`, `ShipClass`, `DUEL_CLASSES`.
  - `state.ts`: `Slots<T>`; `Ship` (body, with `active`), `ShipSystems` (with `cls`, `target`), `MissileFlight`, `Missile` (with `active`, `owner`); `TacticalState { ships: Slots<Ship>; systems: Slots<ShipSystems>; missiles: Slots<Missile>; … }`; `CREW_SLOT`; `shipBody(map, i, k)`; `emptyMissile()`; `createTacticalState(seed, slots = 2)`; `classOf(state, i)`; `targetOf`, `missileOf`, `placeMissile(state, i, f: MissileFlight)`, `removeMissile`; `cloneTactical`, `cloneShip`.
  - `hash.ts`: `MISSILE_SLOT` (9); `MISSILE_KEYS`; `spaceModule`, `shipModule`, `TACTICAL_MODULES`; `flattenTactical`, `tacticalLength`, `unflattenTactical`, `hashTactical`, `cloneTacticalFromModule`; `validateTacticalValues(shape, values, offset): number`.
  - `physics.ts`: `engineFactor(cls, engines)`; `flyShip(s, axes, tuning, engines = 0, cls = CUTTER_CLASS)`; `flySlot(state, i, axes, tuning)`; `stepFlight`, `stepSoloFlight`. `contacts.ts`: `hitStatics(state, i)`, `resolveContacts`. `weapons.ts`: `UNCREWED_INPUT` beside `IDLE_INPUT`. `duel.ts`: `hunterSlot(state)`, `stepDuel`. `hunter.ts`: `hunterThink(state, i = 1)`.
  - `duelOracle.ts`: `MIGRATIONS[37]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/tacticalSlots.test.ts`:

```ts
// N-ship space (engine refactor spec §5, R-2): ship slots with active flags, the missile pool with owners, weapons that
// fire at the locked target, and ship classes and weapons as definitions. Storage only: an extra inactive slot changes
// nothing about the duel's two, and today's numbers are the cutter's and hunter's entries.
import { describe, expect, it } from 'vitest';
import { CUTTER_CLASS, DUEL_CLASSES, HUNTER_CLASS, LASER, MISSILE, SHIP_CLASSES, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { hunterSlot, stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { launchMissile } from '../src/renderer/src/sim/tactical/missiles';
import { stepFlight } from '../src/renderer/src/sim/tactical/physics';
import { classOf, createTacticalState, emptyMissile, missileOf, placeMissile, removeMissile, shipBody, targetOf, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import {
  ENGINE_FACTOR, LASER_CHARGE_UNITS, LASER_HULL, LASER_RANGE, MAGAZINE, MISSILE_HULL, MISSILE_LIFE_TICKS, SHIELD_LAYERS, SHIP_HULL, SHIP_RADIUS, THRUST, TURN_STEPS_PER_TICK
} from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';

/** The duel's two slots as plain values (the graceUntil bodies a third slot adds are left out). */
function duelPart(s: TacticalState): unknown {
  const bodies = s.map.asteroids.length + 2;
  return {
    tick: s.tick, rng: s.rng.s, outcome: s.outcome, hunter: { ...s.hunter, trail: Array.from(s.hunter.trail) }, events: s.events,
    ships: s.ships.slice(0, 2).map((b) => ({ ...b, graceUntil: Array.from(b.graceUntil.subarray(0, bodies)) })),
    systems: s.systems.slice(0, 2), missiles: [0, 1].map((i) => { const m = missileOf(s, i); return m ? { ...m } : null; })
  };
}
const quiet = (s: TacticalState): void => { Object.assign(s.ships[1], { x: 2600, y: 2600, vx: 0, vy: 0 }); };

describe('ship classes and weapons as definitions (spec §5)', () => {
  it('today\'s numbers are the cutter and hunter entries and the laser and missile weapons', () => {
    expect(SHIP_CLASSES).toEqual([CUTTER_CLASS, HUNTER_CLASS]);
    expect(DUEL_CLASSES).toEqual([ShipClass.Cutter, ShipClass.Hunter]);
    for (const c of SHIP_CLASSES) {
      expect(c).toMatchObject({ hull: SHIP_HULL, radius: SHIP_RADIUS, thrust: THRUST, turnStepsPerTick: TURN_STEPS_PER_TICK, engineFactor: ENGINE_FACTOR, power: null });
      expect(c.shields.layers).toBe(SHIELD_LAYERS);
      expect(c.slots).toEqual({ laser: LASER, missile: MISSILE });
    }
    expect([CUTTER_CLASS.ai, HUNTER_CLASS.ai]).toEqual(['crew', 'hunter']);
    expect(LASER).toMatchObject({ range: LASER_RANGE, chargeUnits: LASER_CHARGE_UNITS, hull: LASER_HULL });
    expect(MISSILE).toMatchObject({ magazine: MAGAZINE, lifeTicks: MISSILE_LIFE_TICKS, hull: MISSILE_HULL });
    expect(Object.isFrozen(CUTTER_CLASS) && Object.isFrozen(LASER) && Object.isFrozen(MISSILE)).toBe(true);
  });
  it('the duel fills slot 0 with the crew\'s Cutter and slot 1 with the hunter, each locked on the other', () => {
    const st = createTacticalState(4);
    expect([classOf(st, 0), classOf(st, 1)]).toEqual([CUTTER_CLASS, HUNTER_CLASS]);
    expect([targetOf(st, 0), targetOf(st, 1)]).toEqual([1, 0]);
    expect(hunterSlot(st)).toBe(1);
    expect(st.systems.map((y) => [y.hull, y.shields, y.magazine])).toEqual([[SHIP_HULL, SHIELD_LAYERS, MAGAZINE], [SHIP_HULL, SHIELD_LAYERS, MAGAZINE]]);
  });
});

describe('ship slots (spec §5 "arrays, not pairs")', () => {
  it('an extra inactive slot holds zeros and changes nothing about the duel\'s two slots, tick for tick', () => {
    for (const seed of [1, 4]) {
      const two = createTacticalState(seed), three = createTacticalState(seed, 3);
      expect(three.ships[2]!.active).toBe(false);
      expect(three.ships[0]!.graceUntil.length).toBe(two.ships[0]!.graceUntil.length + 1);
      for (let t = 0; t < 3600 && two.outcome === 0; t++) {
        stepDuel(two, IDLE_INPUT); stepDuel(three, IDLE_INPUT);
        expect(duelPart(three), `seed ${seed} tick ${t}`).toEqual(duelPart(two));
      }
      expect(three.ships[2]).toMatchObject({ active: false, x: 0, y: 0, vx: 0, vy: 0, planetHits: 0, shipHits: 0 });
      expect(Array.from(three.ships[2]!.graceUntil).every((v) => v === 0)).toBe(true);
      expect(three.systems[2]).toMatchObject({ hull: 0, shots: 0, missilesLaunched: 0, rooms: [0, 0, 0] });
      expect(three.missiles[2]).toEqual(emptyMissile());
      expect([0, 1].map((i) => three.ships[i]!.graceUntil[shipBody(three.map, i, 2)])).toEqual([0, 0]);   // no contact with the empty slot
    }
  }, 60_000);
  it('contacts and the laser work across any pair of active slots, by the locked target', () => {
    const st = createTacticalState(5, 3);
    quiet(st);
    Object.assign(st.ships[2]!, { active: true, x: 500, y: -1800, vx: 0, vy: 0, heading: 192 });   // a third ship, west-facing
    Object.assign(st.systems[2]!, { ...st.systems[1], rooms: [0, 0, 0], target: 0 });
    Object.assign(st.ships[0], { x: 465, y: -1800, vx: 100, vy: 0, heading: 64 });               // overlapping it by 5, closing
    stepFlight(st, [{ turn: 0, thrust: 0 }, { turn: 0, thrust: 0 }, { turn: 0, thrust: 0 }], { gravity: false, edge: false, drag: 0, stabilise: 0 });
    expect([st.ships[0].shipHits, st.ships[2]!.shipHits, st.ships[1].shipHits]).toEqual([1, 1, 0]);
    expect([st.systems[0].hull, st.systems[2]!.hull]).toEqual([SHIP_HULL - 1, SHIP_HULL - 1]);
    expect(st.ships[0].graceUntil[shipBody(st.map, 0, 2)]).toBeGreaterThan(0);
    expect(st.ships[2]!.graceUntil[shipBody(st.map, 2, 0)]).toBeGreaterThan(0);
    const before = { ...st.systems[1] };
    Object.assign(st.ships[2]!, { x: st.ships[0].x + hx(64) * 300, y: st.ships[0].y + hy(64) * 300 });   // 300 dead ahead of the crew
    st.systems[0].target = 2; st.systems[0].fireHeld = true; st.systems[0].laserCharge = LASER_CHARGE_UNITS;
    applyWeaponsInput(st, 0, { ...IDLE_INPUT, laserCharge: false });
    expect(st.systems[2]!.shields).toBe(SHIELD_LAYERS - 1);
    expect(st.systems[1]).toEqual(before);
    expect(st.events.at(-1)).toMatchObject({ kind: 'laser', ship: 0, hit: true, stripped: true, x2: st.ships[2]!.x, y2: st.ships[2]!.y });
  });
});

describe('the missile pool (spec §5: at most one in flight per ship)', () => {
  it('a missile takes the first free entry, is found by its owner, and its entry is zeroed and freed when it goes', () => {
    const st = createTacticalState(5);
    launchMissile(st, 1);
    expect(st.missiles[0]).toMatchObject({ active: true, owner: 1 });   // the enemy launched first: entry 0
    launchMissile(st, 0);
    expect(st.missiles[1]).toMatchObject({ active: true, owner: 0 });
    expect([missileOf(st, 0), missileOf(st, 1)]).toEqual([st.missiles[1], st.missiles[0]]);
    placeMissile(st, 0, { x: 1, y: 2, vx: 0, vy: 0, heading: 3, headingAcc: 0, age: 4 });   // a second placement reuses ship 0's entry
    expect(st.missiles[1]).toMatchObject({ active: true, owner: 0, x: 1, age: 4 });
    removeMissile(st, 1);
    expect(st.missiles[0]).toEqual(emptyMissile());
    expect(missileOf(st, 1)).toBeNull();
    launchMissile(st, 1);
    expect(st.missiles[0]).toMatchObject({ active: true, owner: 1 });
    expect(() => placeMissile(st, 2, { x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 })).toThrow(/no free missile pool entry/);
  });
});
```

Replace the whole of `tests/duelModules.test.ts` with:

```ts
// The duel on the sim module contract (engine refactor spec §6, R-1b and R-2): every member of the duel's state is a
// module's canonical field or on its declared not-snapshotted list; a member added to any module without either fails
// here; every field moves the hash; the modules' commands and reasons are the duel codec's kinds and members of
// COMMAND_REASONS. The space and ship modules share TacticalState, so it is held to their fields together.
import { describe, expect, it } from 'vitest';
import { COMMAND_REASONS } from '../src/renderer/src/net/contracts';
import { flatten } from '../src/renderer/src/sim/flatten';
import { flattenModule, unflattenModule, type SimModule } from '../src/renderer/src/sim/module';
import { DUEL_MODULES, DUEL_NOT_SNAPSHOTTED, interiorModule, presenceModule, repairModule } from '../src/renderer/src/sim/duel/modules';
import { flattenDuel, hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { MISSILE_KEYS, flattenTactical, shipModule, spaceModule, TACTICAL_MODULES, unflattenTactical } from '../src/renderer/src/sim/tactical/hash';
import { cloneTactical, createTacticalState, placeMissile, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { CUTTER } from './helpers/scriptedDuel';

const isGroup = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !ArrayBuffer.isView(v) && (Array.isArray(v) ? v.some((x) => typeof x !== 'number') : Object.getPrototypeOf(v) === Object.prototype);
/** Dotted paths of every member under `root` that is neither a field name nor excluded. A numeric array is one member;
 *  any other array (ship slots, systems records, missile pool entries, presence flags) is walked by index. */
function uncovered(root: object, names: ReadonlySet<string>, excluded: Readonly<Record<string, string>>, skip: ReadonlySet<string> = new Set()): string[] {
  const missing: string[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string): void => {
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key, value = obj[key];
      if (names.has(path) || path in excluded || skip.has(path)) continue;
      if (isGroup(value)) walk(value, path); else missing.push(path);
    }
  };
  walk(root as Record<string, unknown>, '');
  return missing;
}
const names = <S>(m: SimModule<S>, s: S) => new Set(m.fields(s).map((f) => f.name));
/** A missile pool entry is one field per member (active, owner) plus `flight` for its flight values. */
const tacticalNames = (s: TacticalState) => new Set([...TACTICAL_MODULES.flatMap((m) => [...names(m, s)]),
  ...s.missiles.flatMap((_, k) => MISSILE_KEYS.map((key) => `missiles.${k}.${key}`))]);
const tacticalExcluded = { ...spaceModule.notSnapshotted, ...shipModule.notSnapshotted };
const duelNames = (d: DuelState) => new Set([presenceModule, repairModule, interiorModule].flatMap((m) => [...names(m, d)]));
function played(seed: number, ticks: number): DuelState {
  const d = createDuel(CUTTER, seed), pair = createScriptedPair(seed);
  for (let k = 0; k < ticks; k++) stepDuelTick(d, scriptedInput(pair, d));
  return d;
}
/** Both pool entries in flight, so every missile field holds values a writer accepts when changed. */
function bothFlying(s: TacticalState): void {
  placeMissile(s, 0, { x: 100, y: -200, vx: 3, vy: 4, heading: 7, headingAcc: 0.25, age: 30 });
  placeMissile(s, 1, { x: -100, y: 200, vx: -3, vy: -4, heading: 9, headingAcc: -0.25, age: 40 });
}
/** A changed first value: flags and 0/1 members flip, everything else moves by one. */
const changedFirst = (name: string, v: number): number => (/\.(active|released|fireHeld)$/.test(name) || name.startsWith('present.') || name === 'hunter.working' ? 1 - v : v + 1);
const IDENTITY = new Set(['map.asteroids.length', 'ships.length']);

describe('the duel modules (spec §6 module contract)', () => {
  it('every TacticalState member is a space or ship field or declared not snapshotted, for several maps and slot counts', () => {
    for (const [seed, slots] of [[1, 2], [7, 2], [42, 3]] as const) {
      const s = createTacticalState(seed, slots);
      expect(uncovered(s, tacticalNames(s), tacticalExcluded), `seed ${seed}, ${slots} slots`).toEqual([]);
    }
  });
  it('every DuelState member is a presence, repair or interior field, the tactical modules\' state, or declared', () => {
    const d = createDuel(CUTTER, 1);
    try { expect(uncovered(d, duelNames(d), DUEL_NOT_SNAPSHOTTED, new Set(['tactical']))).toEqual([]); } finally { disposeDuel(d); }
  });
  it('catches a member added to a module without a field or an exclusion', () => {
    const d = createDuel(CUTTER, 1);
    try {
      (d.tactical as unknown as Record<string, unknown>).newThing = 1;
      (d.tactical.ships[0] as unknown as Record<string, unknown>).newCounter = 0;
      (d.tactical.systems[1] as unknown as Record<string, unknown>).newGauge = 2;
      (d.tactical.hunter as unknown as Record<string, unknown>).newTimer = 3;
      (d as unknown as Record<string, unknown>).newFlag = true;
      expect(uncovered(d.tactical, tacticalNames(d.tactical), tacticalExcluded)).toEqual(['ships.0.newCounter', 'systems.1.newGauge', 'hunter.newTimer', 'newThing']);
      expect(uncovered(d, duelNames(d), DUEL_NOT_SNAPSHOTTED, new Set(['tactical']))).toEqual(['newFlag']);
    } finally { disposeDuel(d); }
  });
  it('a missile pool entry is walked against its fields, and a member added to it is caught', () => {
    const d = played(7, 5156);
    try {
      expect(d.tactical.missiles.some((m) => m.active), 'seed 7 tick 5156 has a missile in flight').toBe(true);
      expect(uncovered(d.tactical, tacticalNames(d.tactical), tacticalExcluded)).toEqual([]);
      (d.tactical.missiles[1] as unknown as Record<string, unknown>).newMissileThing = 1;
      expect(uncovered(d.tactical, tacticalNames(d.tactical), tacticalExcluded)).toEqual(['missiles.1.newMissileThing']);
    } finally { disposeDuel(d); }
  });
  it('every exclusion names a real member and is not also a field', () => {
    const d = createDuel(CUTTER, 1);
    try {
      for (const [m, s] of [[spaceModule, d.tactical], [shipModule, d.tactical], [presenceModule, d], [repairModule, d], [interiorModule, d]] as const)
        for (const path of Object.keys(m.notSnapshotted)) { expect(s, path).toHaveProperty(path.split('.')); expect(names(m as SimModule<object>, s).has(path)).toBe(false); }
      for (const path of Object.keys(DUEL_NOT_SNAPSHOTTED)) { expect(d, path).toHaveProperty(path.split('.')); expect(duelNames(d).has(path)).toBe(false); }
    } finally { disposeDuel(d); }
  });
  it('every space, ship, presence and repair field changes the duel hash; the interior is covered by its own flatten', () => {
    const d = played(2, 900);
    try {
      bothFlying(d.tactical);
      const base = hashDuel(d);
      for (const { module, state } of DUEL_MODULES.slice(0, 4)) {
        const m = module as SimModule<unknown>, s = state(d);
        for (const f of m.fields(s)) {
          if (IDENTITY.has(f.name)) continue;   // identity checks, never written (next test)
          const values: number[] = []; f.read(s, values);
          const changed = [...values]; changed[0] = changedFirst(f.name, changed[0]!);
          f.write(s, changed, 0);
          expect(hashDuel(d), `${m.id}.${f.name}`).not.toBe(base);
          f.write(s, values, 0);
          expect(hashDuel(d), `${m.id}.${f.name} restored`).toBe(base);
        }
      }
      d.interior.rooms.fire[0] = 0.5; expect(hashDuel(d)).not.toBe(base);
    } finally { disposeDuel(d); }
  });
  it('the asteroid and slot counts are identity checks, and a free missile entry holds only zeros', () => {
    const s = createTacticalState(1), values = Array.from(flattenTactical(s));
    values[3] = values[3]! + 1;
    expect(() => unflattenTactical(createTacticalState(1), values)).toThrow(/asteroid count/);
    const slots = Array.from(flattenTactical(s)); slots[5] = 3;
    expect(() => unflattenTactical(createTacticalState(1), slots)).toThrow(/ship slot count 3/);
    expect(() => unflattenTactical(createTacticalState(1, 3), flattenTactical(s))).toThrow(/ship slot count 2/);
    const flight = spaceModule.fields(s).find((f) => f.name === 'missiles.0.flight')!;
    expect(() => flight.write(s, [1, 0, 0, 0, 0, 0, 0], 0)).toThrow(/a free entry holds values/);
    const active = spaceModule.fields(s).find((f) => f.name === 'missiles.0.active')!;
    expect(() => active.write(s, [2], 0)).toThrow(/not 0 or 1/);
  });
  it('flatten is the modules in canonical order after SIM_VERSION: space, ship, presence, repair, interior', () => {
    const d = played(1, 600);
    try {
      const space: number[] = [], ship: number[] = [];
      flattenModule(spaceModule, d.tactical, space); flattenModule(shipModule, d.tactical, ship);
      expect(Array.from(flattenTactical(d.tactical))).toEqual([...space, ...ship].map((v) => (v === 0 ? 0 : v)));
      expect(Array.from(flattenDuel(d))).toEqual([SIM_VERSION, ...flattenTactical(d.tactical), d.present[0] ? 1 : 0, d.present[1] ? 1 : 0, ...d.repair, ...flatten(d.interior)]);
      const copy = cloneTactical(d.tactical), fresh = createTacticalState(1);
      expect(unflattenTactical(fresh, flattenTactical(copy))).toBe(flattenTactical(copy).length);
      expect(flattenTactical(fresh)).toEqual(flattenTactical(copy));
      const out: number[] = []; flattenModule(presenceModule, d, out);
      expect(unflattenModule(presenceModule, d, out, 0)).toBe(2);
    } finally { disposeDuel(d); }
  });
  it('the modules own the duel\'s command kinds (setPaused is the core\'s), and their reasons are enum members', () => {
    const kinds = DUEL_MODULES.flatMap(({ module }) => [...module.commands]).sort();
    expect(kinds).toEqual(['laserCharge', 'laserLock', 'missileLaunch', 'presence', 'sit', 'stand']);
    for (const { module } of DUEL_MODULES) for (const reason of module.reasons) expect(COMMAND_REASONS, `${module.id}: ${reason}`).toContain(reason);
  });
  it('cloneTactical is derived from the space and ship modules: every field is copied, and changing it on the copy leaves the original', () => {
    const d = played(3, 1200);
    try {
      bothFlying(d.tactical);
      const original = flattenTactical(d.tactical), copy = cloneTactical(d.tactical);
      expect(flattenTactical(copy)).toEqual(original);
      expect(copy.map).toBe(d.tactical.map); expect(copy.grid).toBe(d.tactical.grid);
      for (const m of TACTICAL_MODULES) for (const f of m.fields(copy)) {
        if (IDENTITY.has(f.name) || /^missiles\.\d+\.active$/.test(f.name)) continue;   // a freed entry would refuse its own values
        const values: number[] = []; f.read(copy, values);
        f.write(copy, values.map((v, k) => (k === 0 ? changedFirst(f.name, v) : v)), 0);
      }
      expect(flattenTactical(d.tactical), 'the original is untouched').toEqual(original);
      expect(flattenTactical(copy)).not.toEqual(original);
    } finally { disposeDuel(d); }
  });
});
```

In `tests/duelSnapshot.test.ts`, replace:

```ts
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { missileOf, Outcome } from '../src/renderer/src/sim/tactical/state';
import { spaceModule } from '../src/renderer/src/sim/tactical/hash';
import { CUTTER } from './helpers/scriptedDuel';
```

with:

```ts
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { TACTICAL_MODULES } from '../src/renderer/src/sim/tactical/hash';
import { CUTTER } from './helpers/scriptedDuel';
```

In `tests/duelSnapshot.test.ts`, replace:

```ts
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.values[1] = s.values[1]! + 1; rehash(s); }), DIGEST)).toThrow(/ticks differ/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.values[6] = s.values[6]! + 0.5; }), DIGEST)).toThrow(/hash does not match its values/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { (s.header as unknown as Record<string, unknown>).extra = 1; }), DIGEST)).toThrow(/header fields/);
```

with:

```ts
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.values[1] = s.values[1]! + 1; rehash(s); }), DIGEST)).toThrow(/ticks differ/);
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { s.values[8] = s.values[8]! + 0.5; }), DIGEST)).toThrow(/hash does not match its values/);   // ships.0.x
      expect(() => validateDuelSnapshot(CUTTER, bad((s) => { (s.header as unknown as Record<string, unknown>).extra = 1; }), DIGEST)).toThrow(/header fields/);
```

In `tests/duelSnapshot.test.ts`, replace:

```ts
      let at = 1;
      for (const f of spaceModule.fields(d.tactical)) { names.set(f.name, at); at += f.count; }
      const slot = missileOf(d.tactical, 0) ? 'missiles.0' : 'missiles.1', empty = missileOf(d.tactical, 0) ? 'missiles.1' : 'missiles.0';
      const cases: [string, number, number, RegExp][] = [
        ['ships.0.heading', 0, 256, /ships\.0\.heading: out of range/], ['ships.1.heading', 0, 1.5, /ships\.1\.heading/],
        ['ships.0.rooms', 1, 3, /ships\.0\.rooms/], ['ships.0.shields', 0, 3, /ships\.0\.shields/], ['ships.1.magazine', 0, 5, /ships\.1\.magazine/],
        ['ships.0.shots', 0, 2.5, /ships\.0\.shots/], ['ships.0.laserCharge', 0, -1, /ships\.0\.laserCharge/], ['ships.1.lock', 0, 3, /ships\.1\.lock/],
        ['ships.0.released', 0, 2, /ships\.0\.released/], ['hunter.mode', 0, 2, /hunter\.mode/], ['hunter.trailHead', 0, 18, /hunter\.trailHead/],
        ['outcome', 0, 4, /outcome: out of range/], [slot, 0, 2, /presence is not 0 or 1/], [slot, 5, 300, /heading, headingAcc or age/], [slot, 7, -1, /heading, headingAcc or age/],
        [empty, 3, 0.25, /an empty slot holds values/], ['ships.0.headingAcc', 0, 1e300, /ships\.0\.headingAcc/], ['ships.1.headingAcc', 0, -1, /ships\.1\.headingAcc/],
        [slot, 6, 1e300, /headingAcc/], ['ships.0.hull', 0, -1, /ships\.0\.hull/], ['ships.1.skidBudget', 0, -0.5, /ships\.1\.skidBudget/], ['ships.0.graceUntil', 0, 2147483648, /ships\.0\.graceUntil/]
      ];
```

with:

```ts
      let at = 1;
      for (const m of TACTICAL_MODULES) for (const f of m.fields(d.tactical)) { names.set(f.name, at); at += f.count; }
      const flying = d.tactical.missiles.findIndex((m) => m.active), slot = `missiles.${flying}`, free = `missiles.${1 - flying}`, owner = d.tactical.missiles[flying]!.owner;
      expect(flying, 'one missile in flight at seed 7 tick 5156').toBeGreaterThanOrEqual(0);
      expect(d.tactical.missiles[1 - flying]!.active).toBe(false);
      const cases: [string, number, number, RegExp][] = [
        ['ships.0.heading', 0, 256, /ships\.0\.heading: out of range/], ['ships.1.heading', 0, 1.5, /ships\.1\.heading/],
        ['systems.0.rooms', 1, 3, /systems\.0\.rooms/], ['systems.0.shields', 0, 3, /systems\.0\.shields/], ['systems.1.magazine', 0, 5, /systems\.1\.magazine/],
        ['systems.0.shots', 0, 2.5, /systems\.0\.shots/], ['systems.0.laserCharge', 0, -1, /systems\.0\.laserCharge/], ['systems.1.lock', 0, 3, /systems\.1\.lock/],
        ['systems.0.cls', 0, 2, /systems\.0\.cls/], ['systems.1.target', 0, 2, /systems\.1\.target/], ['systems.0.hull', 0, -1, /systems\.0\.hull/],
        ['ships.0.released', 0, 2, /ships\.0\.released/], ['hunter.mode', 0, 2, /hunter\.mode/], ['hunter.trailHead', 0, 18, /hunter\.trailHead/],
        ['outcome', 0, 4, /outcome: out of range/], ['ships.length', 0, 3, /does not match the slot count/], ['ships.1.active', 0, 2, /ships\.1\.active: out of range/],
        ['ships.1.active', 0, 0, /ships\.1\.x: an inactive slot holds values/],
        [`${slot}.active`, 0, 2, /active is not 0 or 1/], [`${slot}.flight`, 4, 300, /heading, headingAcc or age/], [`${slot}.flight`, 6, -1, /heading, headingAcc or age/],
        [`${slot}.flight`, 5, 1e300, /headingAcc/], [`${slot}.owner`, 0, 5, /owner is not an active ship slot/],
        [`${free}.flight`, 2, 0.25, /a free entry holds values/], [`${free}.owner`, 0, 1, /a free entry holds values/],
        ['ships.0.headingAcc', 0, 1e300, /ships\.0\.headingAcc/], ['ships.1.headingAcc', 0, -1, /ships\.1\.headingAcc/],
        ['ships.1.skidBudget', 0, -0.5, /ships\.1\.skidBudget/], ['ships.0.graceUntil', 0, 2147483648, /ships\.0\.graceUntil/]
      ];
```

In `tests/duelSnapshot.test.ts`, replace:

```ts
      }
      const interiorAt = at + 5, fieldsAt = interiorAt;
```

with:

```ts
      }
      const twice = structuredClone(good);   // the free entry claims the flying missile's owner: two missiles for one ship
      twice.values[names.get(`${free}.active`)!] = 1; twice.values[names.get(`${free}.owner`)!] = owner; twice.header.hash = hashF64(Float64Array.from(twice.values));
      expect(() => validateDuelSnapshot(CUTTER, twice, DIGEST)).toThrow(new RegExp(`ship ${owner} has two missiles in flight`));
      const interiorAt = at + 5, fieldsAt = interiorAt;
```

In `tests/tacticalDeterminism.test.ts`, replace:

```ts
  // When this fails, add the new field to flattenTactical (hash.ts) and then update the lists below.
  it('Ship and TacticalState fields are exactly those flattenTactical knows', () => {
    const st = createTacticalState(1);
    expect(Object.keys(st.ships[0]).sort()).toEqual(['asteroidHits', 'fireHeld', 'graceUntil', 'heading', 'headingAcc', 'hull', 'laserCharge', 'laserHits', 'laserHold', 'layersStripped', 'lock', 'magazine', 'magazineClock', 'missileHits', 'missilesLaunched', 'missilesLost', 'planetHits', 'released', 'rooms', 'shieldClock', 'shields', 'shipHits', 'shots', 'skidBudget', 'skidSign', 'vx', 'vy', 'x', 'y']);
    expect(Object.keys(st).sort()).toEqual(['events', 'grid', 'hunter', 'map', 'missiles', 'outcome', 'rng', 'seed', 'ships', 'systems', 'tick']);
```

with:

```ts
  // When this fails, add the new field to flattenTactical (hash.ts) and then update the lists below.
  it('Ship, ShipSystems and TacticalState fields are exactly those flattenTactical knows', () => {
    const st = createTacticalState(1);
    expect(Object.keys(st.ships[0]).sort()).toEqual(['active', 'asteroidHits', 'graceUntil', 'heading', 'headingAcc', 'planetHits', 'released', 'shipHits', 'skidBudget', 'skidSign', 'vx', 'vy', 'x', 'y']);
    expect(Object.keys(st.systems[0]).sort()).toEqual(['cls', 'fireHeld', 'hull', 'laserCharge', 'laserHits', 'laserHold', 'layersStripped', 'lock', 'magazine', 'magazineClock', 'missileHits', 'missilesLaunched', 'missilesLost', 'rooms', 'shieldClock', 'shields', 'shots', 'target']);
    expect(Object.keys(st).sort()).toEqual(['events', 'grid', 'hunter', 'map', 'missiles', 'outcome', 'rng', 'seed', 'ships', 'systems', 'tick']);
```

In `tests/tacticalDeterminism.test.ts`, replace:

```ts
    launchMissile(launched, 0);                                          // a missile as the launcher makes it
    expect(Object.keys(missileOf(launched, 0)!).sort()).toEqual(['age', 'heading', 'headingAcc', 'vx', 'vy', 'x', 'y']);   // MISSILE_SLOT covers these
    // 5 header values; per ship 30 scalars + one per graceUntil slot; 2 missile slots of MISSILE_SLOT; hunter 7 scalars + its trail.
    expect(flattenTactical(st).length).toBe(5 + 2 * (30 + st.map.asteroids.length + 2) + 2 * MISSILE_SLOT + 7 + st.hunter.trail.length);
  });
```

with:

```ts
    launchMissile(launched, 0);                                          // a missile as the launcher makes it
    expect(Object.keys(missileOf(launched, 0)!).sort()).toEqual(['active', 'age', 'heading', 'headingAcc', 'owner', 'vx', 'vy', 'x', 'y']);   // MISSILE_SLOT covers these
    // Space: 6 header values; per slot active, 12 body scalars and one per graceUntil body; a pool entry of MISSILE_SLOT
    // per slot; hunter 7 scalars + its trail. Ship: per slot 17 scalars and the 3 rooms.
    expect(flattenTactical(st).length).toBe(6 + 2 * (13 + st.map.asteroids.length + 2) + 2 * MISSILE_SLOT + 7 + st.hunter.trail.length + 2 * 20);
  });
```

In `tests/tacticalFlight.test.ts`, replace:

```ts
import { describe, expect, it } from 'vitest';
import { createTacticalState, Room, type Ship } from '../src/renderer/src/sim/tactical/state';
import { edgeAccel, flyShip, gravityAccel } from '../src/renderer/src/sim/tactical/physics';
```

with:

```ts
import { describe, expect, it } from 'vitest';
import { createTacticalState, type Ship } from '../src/renderer/src/sim/tactical/state';
import { edgeAccel, flyShip, gravityAccel } from '../src/renderer/src/sim/tactical/physics';
```

In `tests/tacticalFlight.test.ts`, replace:

```ts
function ship(over: Partial<Ship>): Ship {
  return { ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, rooms: [0, 0, 0], ...over };
}
```

with:

```ts
function ship(over: Partial<Ship>): Ship {
  return { ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, ...over };
}
```

In `tests/tacticalFlight.test.ts`, replace:

```ts
    for (const [level, factor] of [[0, 1], [1, 0.6], [2, 0.25]] as const) {
      const s = ship({ rooms: [0, 0, level] });
      expect(s.rooms[Room.Engines]).toBe(level);
      flyShip(s, { turn: 1, thrust: 1 }, { ...FLIGHT_NO_FIELD, drag: 0 });
      expect(Math.sqrt(s.vx * s.vx + s.vy * s.vy)).toBeCloseTo(THRUST * factor * DT, 12);
      for (let t = 1; t < 60; t++) flyShip(s, { turn: 1, thrust: 0 }, FLIGHT_NO_FIELD);
      expect(s.heading + s.headingAcc).toBeCloseTo(TURN_STEPS_PER_TICK * 60 * factor, 9);
```

with:

```ts
    for (const [level, factor] of [[0, 1], [1, 0.6], [2, 0.25]] as const) {
      const s = ship({});                                                 // the Engines level is the systems record's, passed in
      flyShip(s, { turn: 1, thrust: 1 }, { ...FLIGHT_NO_FIELD, drag: 0 }, level);
      expect(Math.sqrt(s.vx * s.vx + s.vy * s.vy)).toBeCloseTo(THRUST * factor * DT, 12);
      for (let t = 1; t < 60; t++) flyShip(s, { turn: 1, thrust: 0 }, FLIGHT_NO_FIELD, level);
      expect(s.heading + s.headingAcc).toBeCloseTo(TURN_STEPS_PER_TICK * 60 * factor, 9);
```

In `tests/tacticalMissiles.test.ts`, replace:

```ts
    tick(st, input());
    expect(m.age).toBe(MISSILE_LIFE_TICKS);
    expect(missileOf(st, 0)).toBeNull();
    const ended = st.events.at(-1)!;
```

with:

```ts
    tick(st, input());
    expect(missileOf(st, 0)).toBeNull();
    expect(m.active).toBe(false);                                         // its pool entry is free again (and zeroed)
    const ended = st.events.at(-1)!;
```

In `tests/tacticalMissiles.test.ts`, replace:

```ts
    resolveMissiles(st);
    expect(st.missiles).toEqual([null, null]);
    expect(st.systems[1].hull).toBe(SHIP_HULL);
```

with:

```ts
    resolveMissiles(st);
    expect(st.missiles.every((m) => !m.active)).toBe(true);
    expect(st.systems[1].hull).toBe(SHIP_HULL);
```

In `tests/tacticalSoloFlight.test.ts`, replace:

```ts
    Object.assign(st.ships[1], { x: 0, y: 80, vx: 0, vy: 0 });
    hitStatics(st, st.ships[0]);
    expect(st.ships[0].planetHits).toBe(1);
```

with:

```ts
    Object.assign(st.ships[1], { x: 0, y: 80, vx: 0, vy: 0 });
    hitStatics(st, 0);
    expect(st.ships[0].planetHits).toBe(1);
```

In `tests/duelOracle.test.ts`, replace:

```ts
import { describe, expect, it } from 'vitest';
import { aliasPlan, duelSchema, judgeDuelOracle, ORACLE_RUNS, recordRun, runDifferences, type Migration, type OracleRunSpec, type OracleTrace } from '../scripts/golden/duelOracle';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
```

with:

```ts
import { describe, expect, it } from 'vitest';
import { aliasPlan, duelSchema, judgeDuelOracle, MIGRATIONS, ORACLE_RUNS, recordRun, runDifferences, type Migration, type OracleRunSpec, type OracleTrace } from '../scripts/golden/duelOracle';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
```

In `tests/duelOracle.test.ts`, replace:

```ts
    } finally { disposeDuel(d); }
  });
```

with:

```ts
    } finally { disposeDuel(d); }
  });
});

describe('the R-2 alias table (37 → 38)', () => {
  it('moves the systems fields to the ship module and finds each old per-ship missile slot by its owner', () => {
    const m = MIGRATIONS[37]!;
    expect([m.rename('space.ships.1.hull'), m.rename('space.ships.0.rooms'), m.rename('space.ships.0.missilesLost')]).toEqual(['ship.systems.1.hull', 'ship.systems.0.rooms', 'ship.systems.0.missilesLost']);
    expect([m.rename('space.ships.0.x'), m.rename('space.ships.0.graceUntil'), m.rename('space.missiles.0')]).toEqual([undefined, undefined, undefined]);
    const pool = [0, 1].flatMap((k) => [`space.missiles.${k}.active`, `space.missiles.${k}.owner`, `space.missiles.${k}.flight`]);
    const plan = aliasPlan(['space.missiles.0', 'space.missiles.1'], [8, 8], pool, [1, 1, 7, 1, 1, 7], m);
    expect(plan.problems).toEqual([]);
    // Pool entry 0 holds ship 1's missile and entry 1 is free: the old slot 0 is empty, the old slot 1 is that missile.
    expect(Array.from(plan.build([1, 1, 10, 11, 12, 13, 14, 0.5, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 10, 11, 12, 13, 14, 0.5, 15]);
    expect(Array.from(plan.build([1, 1, 10, 11, 12, 13, 14, 0.5, 15, 1, 0, 20, 21, 22, 23, 24, -0.5, 25]))).toEqual([1, 20, 21, 22, 23, 24, -0.5, 25, 1, 10, 11, 12, 13, 14, 0.5, 15]);
    const added = ['space.ships.length', 'space.ships.0.active', 'ship.systems.0.cls', 'ship.systems.0.target'];
    expect(aliasPlan(['space.ships.0.hull'], [1], ['ship.systems.0.hull', ...added], [1, 1, 1, 1, 1], m).problems).toEqual([]);
    expect(aliasPlan(['space.ships.0.hull'], [1], ['ship.systems.0.hull', 'ship.systems.0.newGauge'], [1, 1], m).problems).toEqual(['new field ship.systems.0.newGauge is neither mapped nor declared added']);
  });
```

Run: `npx vitest run tests/tacticalSlots.test.ts tests/duelModules.test.ts tests/duelOracle.test.ts`
Expected: FAIL: `tests/tacticalSlots.test.ts` cannot resolve `../src/renderer/src/sim/tactical/defs`, `tests/duelModules.test.ts` finds no `shipModule` export, and the R-2 alias-table test finds no `MIGRATIONS[37]`.

- [ ] **Step 2: The definitions, the state and the modules**

Create `src/renderer/src/sim/tactical/defs.ts`:

```ts
// Ship classes and weapons as definitions, not one-off constants (engine refactor spec §5, R-2). Today's numbers are
// the `cutter` (the crew's ship) and `hunter` (the enemy's) entries and the `laser` and `missile` weapons, so the change
// is golden-neutral: tuning.ts keeps the numbers as these records' inputs (and for the views), and the sim reads them
// through the records. A ship slot names its class by index into SHIP_CLASSES.
import {
  ENGINE_FACTOR, LASER_ARC_COS, LASER_CHARGE_RATE, LASER_CHARGE_UNITS, LASER_HOLD_TICKS, LASER_HULL, LASER_RANGE, MAGAZINE, MAGAZINE_REGEN_TICKS,
  MISSILE_ARM_TICKS, MISSILE_FUEL_TICKS, MISSILE_HULL, MISSILE_LAUNCH_SPEED, MISSILE_LIFE_TICKS, MISSILE_RADIUS, MISSILE_SPAWN_OFFSET, MISSILE_THRUST,
  MISSILE_TURN_STEPS_PER_TICK, REVERSE_FRACTION, SHIELD_LAYERS, SHIELD_RATE, SHIELD_RECHARGE_UNITS, SHIP_HULL, SHIP_RADIUS, THRUST, TURN_STEPS_PER_TICK
} from './tuning';

/** The laser (spec §7a): range and arc, charge in whole units per Weapons damage level, the hold before it vents, hull per hit. */
export interface LaserDef {
  readonly kind: 'laser';
  readonly range: number; readonly arcCos: number;
  readonly chargeUnits: number; readonly chargeRate: readonly number[]; readonly holdTicks: number;
  readonly hull: number;
}
/** The cruise missile (spec §7b): the magazine and its regain time, the body, its flight and its hull per hit. */
export interface MissileDef {
  readonly kind: 'missile';
  readonly magazine: number; readonly regenTicks: number;
  readonly radius: number; readonly spawnOffset: number; readonly launchSpeed: number;
  readonly thrust: number; readonly turnStepsPerTick: number; readonly fuelTicks: number; readonly lifeTicks: number; readonly armTicks: number;
  readonly hull: number;
}
export type WeaponDef = LaserDef | MissileDef;

/** A ship class (spec §5): hull, flight, radius, shields, power, weapon slots and its AI profile. */
export interface ShipClassDef {
  readonly id: string;
  readonly hull: number; readonly radius: number;
  /** Forward thrust (u/s²), the reverse share of it, turn steps per tick, and the factor per Engines damage level. */
  readonly thrust: number; readonly reverseFraction: number; readonly turnStepsPerTick: number; readonly engineFactor: readonly number[];
  /** Shield layers, the recharge clock's units per layer, and units per tick per Shields damage level. */
  readonly shields: { readonly layers: number; readonly rechargeUnits: number; readonly rate: readonly number[] };
  /** Reactor power for the interior link; null while interior power is not coupled to the fight (R-2b couples it). */
  readonly power: number | null;
  /** One laser and one missile slot, as today. */
  readonly slots: { readonly laser: LaserDef; readonly missile: MissileDef };
  /** Who flies it when no player does: nobody ('crew') or the hunter's state machine (sim/tactical/hunter.ts). */
  readonly ai: 'crew' | 'hunter';
}

export const LASER: LaserDef = Object.freeze({
  kind: 'laser', range: LASER_RANGE, arcCos: LASER_ARC_COS, chargeUnits: LASER_CHARGE_UNITS, chargeRate: LASER_CHARGE_RATE, holdTicks: LASER_HOLD_TICKS, hull: LASER_HULL
});
export const MISSILE: MissileDef = Object.freeze({
  kind: 'missile', magazine: MAGAZINE, regenTicks: MAGAZINE_REGEN_TICKS, radius: MISSILE_RADIUS, spawnOffset: MISSILE_SPAWN_OFFSET, launchSpeed: MISSILE_LAUNCH_SPEED,
  thrust: MISSILE_THRUST, turnStepsPerTick: MISSILE_TURN_STEPS_PER_TICK, fuelTicks: MISSILE_FUEL_TICKS, lifeTicks: MISSILE_LIFE_TICKS, armTicks: MISSILE_ARM_TICKS, hull: MISSILE_HULL
});

function shipClass(id: string, ai: ShipClassDef['ai']): ShipClassDef {
  return Object.freeze({
    id, hull: SHIP_HULL, radius: SHIP_RADIUS, thrust: THRUST, reverseFraction: REVERSE_FRACTION, turnStepsPerTick: TURN_STEPS_PER_TICK, engineFactor: ENGINE_FACTOR,
    shields: Object.freeze({ layers: SHIELD_LAYERS, rechargeUnits: SHIELD_RECHARGE_UNITS, rate: SHIELD_RATE }), power: null,
    slots: Object.freeze({ laser: LASER, missile: MISSILE }), ai
  });
}
/** The crew's ship and the enemy's: the same numbers today, told apart by their AI profile. */
export const CUTTER_CLASS = shipClass('cutter', 'crew');
export const HUNTER_CLASS = shipClass('hunter', 'hunter');
/** Every ship class by index (a ship slot's class index). */
export const SHIP_CLASSES: readonly ShipClassDef[] = Object.freeze([CUTTER_CLASS, HUNTER_CLASS]);
export const ShipClass = { Cutter: 0, Hunter: 1 } as const;
/** The duel's slots: the crew's Cutter in slot 0, the hunter in slot 1. */
export const DUEL_CLASSES: readonly number[] = Object.freeze([ShipClass.Cutter, ShipClass.Hunter]);
```

Replace the whole of `src/renderer/src/sim/tactical/state.ts` with:

```ts
// Tactical state (spec §3 to §9; engine refactor spec §5, R-2): N ship slots, each a body in space (`ships[i]`) and a
// systems record (`systems[i]`), a missile pool, the hunter's brain and the outcome. The duel fills two slots: the
// crew's Cutter in slot 0 and the hunter in slot 1; slots always update in slot order. A slot's weapons fire at its
// locked target (`systems[i].target`). All fields are flat scalars or arrays, so the flatten and the clone stay simple.
import { createRng, type RngState } from '../../../../shared/rng';
import { DUEL_CLASSES, SHIP_CLASSES, type ShipClassDef } from './defs';
import { buildGrid, type BroadPhase } from './grid';
import { generateMap, type MapDef, type Spawn } from './map';
import { cloneTacticalFromModule } from './hash';
import { HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_TRAIL_TICKS } from './tuning';

/** Tactical rooms (spec §5); the index into ShipSystems.rooms. */
export const Room = { Weapons: 0, Shields: 1, Engines: 2 } as const;

/** At least two ship slots: an encounter always has the crew's ship and one other (engine refactor spec §5). */
export type Slots<T> = [T, T, ...T[]];

/** A ship in space: kinematics, contact grace and the contact counters (engine refactor spec §5: the tactical layer keeps
 *  only kinematics plus a ship index, the slot). An inactive slot holds zeros. */
export interface Ship {
  active: boolean;
  x: number; y: number; vx: number; vy: number;
  /** Heading index 0..255 and the fractional turn accumulator (spec §4). */
  heading: number; headingAcc: number;
  /** Tick from which contact with body id k may cost hull again: 0 the planet, 1..n asteroid k − 1, then the other ship
   *  slots in slot order, skipping its own (shipBody). */
  graceUntil: Int32Array;
  planetHits: number; asteroidHits: number; shipHits: number;
  /** Stabilise (spec §6): true while both axes were zero last tick; the skid captured at release and still to remove, and its side (±1). */
  released: boolean; skidBudget: number; skidSign: number;
}

/** A ship's systems record (engine refactor spec §5, R-2): its class, its locked target, hull, room damage, shields, the
 *  laser, the magazine and the weapon counters. The duel's rules are unchanged: repair acts on `rooms`, and interior power
 *  is not coupled (R-2b links them). An inactive slot holds zeros. */
export interface ShipSystems {
  /** Index into SHIP_CLASSES. */
  cls: number;
  /** The ship slot its weapons fire at. */
  target: number;
  hull: number;
  /** Damage level 0..2 per Room. */
  rooms: [number, number, number];
  /** Shield layers and the recharge clock in the class's recharge units (spec §5). */
  shields: number; shieldClock: number;
  /** Laser (spec §7a): charge 0..chargeUnits (full), ticks a full charge has been held, whether Fire is held, the locked target Room. */
  laserCharge: number; laserHold: number; fireHeld: boolean; lock: number;
  /** Missiles in the magazine and the regain clock in ticks (spec §7b). */
  magazine: number; magazineClock: number;
  /** Telemetry counters (spec §13). */
  shots: number; laserHits: number; layersStripped: number; missilesLaunched: number; missileHits: number; missilesLost: number;
}

/** A cruise missile's flight (spec §7b). */
export interface MissileFlight { x: number; y: number; vx: number; vy: number; heading: number; headingAcc: number; age: number }
/** A missile pool entry: in flight or free, and the ship slot that launched it. At most one in flight per ship; a free
 *  entry holds zeros. */
export interface Missile extends MissileFlight { active: boolean; owner: number }

export const HunterMode = { Hunt: 0, Repair: 1 } as const;
/** The enemy's brain (spec §9). */
export interface Hunter {
  mode: number;
  /** Repair: the Room being repaired, ticks left in this phase, and whether the walk is over. */
  room: number; timer: number; working: boolean;
  /** Tick on which the jittered release is due, or −1 when none is scheduled. */
  fireAt: number;
  lastLaunch: number;
  /** Ring buffer of its target's last HUNTER_TRAIL_TICKS positions (x, y pairs); trailHead is the oldest entry. */
  trail: Float64Array; trailHead: number;
}

export const Outcome = { Running: 0, CrewWins: 1, EnemyWins: 2, Draw: 3 } as const;

/** Per-tick events for the views (shots and missile endings). Reset every tick and not hashed. */
export type DuelEvent =
  /** A laser release. `stripped`: it took a shield layer; `room`: the Room it struck (its level may already have been 2), or −1 (a miss or a stripped layer). */
  | { kind: 'laser'; ship: number; hit: boolean; stripped: boolean; room: number; x1: number; y1: number; x2: number; y2: number }
  /** A missile ended. `target`: the ship it landed on (its own ship for a self-hit), or −1; `room`: the Room it struck, or −1. */
  | { kind: 'missileEnd'; ship: number; cause: 'ship' | 'planet' | 'asteroid' | 'edge' | 'expired' | 'missile'; target: number; room: number; x: number; y: number };

export interface TacticalState {
  tick: number; seed: number; rng: RngState; map: MapDef; grid: BroadPhase;
  /** Each slot's body in space. */
  ships: Slots<Ship>;
  /** Each slot's systems record (the ship module's, sim/tactical/hash.ts). */
  systems: Slots<ShipSystems>;
  /** The missile pool: one entry per ship slot. */
  missiles: Slots<Missile>;
  hunter: Hunter;
  outcome: number;
  events: DuelEvent[];
}

/** Held axes for one ship: turn (+ clockwise) and thrust (+ forward). Nominally −1, 0 or 1; flyShip quantises them by sign (NaN counts as 0). */
export interface Axes { turn: number; thrust: number }
export const NO_AXES: Axes = { turn: 0, thrust: 0 };

/** The crew's ship slot. */
export const CREW_SLOT = 0;

/** Body id of ship slot k in ship i's graceUntil: after the planet and the asteroids, the other slots in slot order. */
export function shipBody(map: MapDef, i: number, k: number): number { return map.asteroids.length + 1 + (k < i ? k : k - 1); }

function shipAt(s: Spawn, bodies: number): Ship {
  return { active: true, x: s.x, y: s.y, vx: s.vx, vy: s.vy, heading: s.heading, headingAcc: 0, graceUntil: new Int32Array(bodies),
    planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0 };
}
function emptyShip(bodies: number): Ship {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, graceUntil: new Int32Array(bodies),
    planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0 };
}
function systemsFor(cls: number, target: number): ShipSystems {
  const c = SHIP_CLASSES[cls]!;
  return {
    cls, target, hull: c.hull, rooms: [0, 0, 0], shields: c.shields.layers, shieldClock: 0, laserCharge: 0, laserHold: 0, fireHeld: false, lock: Room.Shields,
    magazine: c.slots.missile.magazine, magazineClock: 0, shots: 0, laserHits: 0, layersStripped: 0, missilesLaunched: 0, missileHits: 0, missilesLost: 0
  };
}
function emptySystems(): ShipSystems {
  return { cls: 0, target: 0, hull: 0, rooms: [0, 0, 0], shields: 0, shieldClock: 0, laserCharge: 0, laserHold: 0, fireHeld: false, lock: 0,
    magazine: 0, magazineClock: 0, shots: 0, laserHits: 0, layersStripped: 0, missilesLaunched: 0, missileHits: 0, missilesLost: 0 };
}
/** A free missile pool entry. */
export function emptyMissile(): Missile { return { active: false, owner: 0, x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 }; }

function hunterFor(crew: Spawn): Hunter {
  const trail = new Float64Array(2 * HUNTER_TRAIL_TICKS);
  for (let k = 0; k < HUNTER_TRAIL_TICKS; k++) { trail[2 * k] = crew.x; trail[2 * k + 1] = crew.y; }
  return { mode: HunterMode.Hunt, room: 0, timer: 0, working: false, fireAt: -1, lastLaunch: -HUNTER_MISSILE_COOLDOWN_TICKS, trail, trailHead: 0 };
}

/** A fill of `slots` ship slots (at least 2): the duel's two at the map's spawns, the crew's Cutter in slot 0 locked on
 *  the hunter in slot 1 and back; any further slot is inactive (R-5's encounters fill them). */
export function createTacticalState(seed: number, slots = DUEL_CLASSES.length): TacticalState {
  if (!Number.isInteger(slots) || slots < 2) throw new Error(`a tactical state needs at least 2 ship slots, not ${slots}`);
  const rng = createRng(seed);
  const map = generateMap(rng);
  const bodies = map.asteroids.length + slots, extra = Array.from({ length: slots - 2 });
  return {
    tick: 0, seed, rng, map, grid: buildGrid(map.asteroids, map.rMap),
    ships: [shipAt(map.spawns[0], bodies), shipAt(map.spawns[1], bodies), ...extra.map(() => emptyShip(bodies))],
    systems: [systemsFor(DUEL_CLASSES[0]!, 1), systemsFor(DUEL_CLASSES[1]!, 0), ...extra.map(emptySystems)],
    missiles: [emptyMissile(), emptyMissile(), ...extra.map(emptyMissile)],
    hunter: hunterFor(map.spawns[0]), outcome: Outcome.Running, events: []
  };
}

/** Ship slot i's class. */
export function classOf(state: TacticalState, i: number): ShipClassDef { return SHIP_CLASSES[state.systems[i]!.cls]!; }
/** The ship slot ship i's weapons are locked on (engine refactor spec §5: weapons fire at the locked target). */
export function targetOf(state: TacticalState, i: number): number { return state.systems[i]!.target; }

/** Ship i's missile in flight, or null (at most one per ship). */
export function missileOf(state: TacticalState, i: number): Missile | null {
  for (const m of state.missiles) if (m.active && m.owner === i) return m;
  return null;
}
/** Put a missile in flight for ship i with these flight values: in the entry it already flies in, or the first free one
 *  (the launch, and tests). Returns it. */
export function placeMissile(state: TacticalState, i: number, f: MissileFlight): Missile {
  const m = missileOf(state, i) ?? state.missiles.find((e) => !e.active);
  if (!m) throw new Error(`no free missile pool entry for ship ${i}`);
  Object.assign(m, { active: true, owner: i, x: f.x, y: f.y, vx: f.vx, vy: f.vy, heading: f.heading, headingAcc: f.headingAcc, age: f.age });
  return m;
}
/** Free ship i's missile entry, with no event (a missile ending goes through the missile step). */
export function removeMissile(state: TacticalState, i: number): void {
  const m = missileOf(state, i);
  if (m) Object.assign(m, emptyMissile());
}

/** Deep copy of the whole tactical state for snapshots, rollback and replay checks, derived from the space and ship
 *  modules' fields (sim/tactical/hash.ts): a field the modules declare is copied without anything listed here. The map
 *  and broad-phase grid are immutable after creation and are shared. */
export function cloneTactical(s: TacticalState): TacticalState { return cloneTacticalFromModule(s); }

/** Deep copy of a ship's body. Any new nested Ship state (arrays, typed arrays) must be copied here. */
export function cloneShip(s: Ship): Ship {
  return { ...s, graceUntil: new Int32Array(s.graceUntil) };
}
```

Replace the whole of `src/renderer/src/sim/tactical/hash.ts` with:

```ts
// Canonical flatten and hash of the tactical state (spec §4: same seed and inputs give the same hash), declared as two
// sim modules over the one TacticalState (engine refactor spec §5 and §6, R-2): `space` (the slots' bodies, the missile
// pool, the hunter, the outcome) and `ship` (each slot's systems record). Flatten, unflatten, clone, validation and the
// completeness test all come from their field lists; flattenTactical is space then ship, the duel's order. The map is a
// pure function of the seed, so only its asteroid count is flattened; the slot count is flattened the same way. Per-tick
// events are outputs, reset every tick, and not hashed. −0 is written as 0.
import { hashF64 } from '../../../../shared/hash';
import { flag, flattenModule, moduleLength, scalar, unflattenModule, vector, type ModuleField, type SimModule } from '../module';
import { SHIP_CLASSES } from './defs';
import { HEADING_COUNT, HUNTER_TRAIL_TICKS } from './tuning';
import { emptyMissile, HunterMode, Outcome, type Missile, type MissileFlight, type Ship, type ShipSystems, type TacticalState } from './state';

/** Values per missile pool entry: active, owner, then the flight x, y, vx, vy, heading, headingAcc, age (zeros when free). */
export const MISSILE_SLOT = 9;

/** A ship body's scalar fields in canonical order after `active`; `graceUntil` closes the body. */
const BODY = ['x', 'y', 'vx', 'vy', 'heading', 'headingAcc', 'planetHits', 'asteroidHits', 'shipHits', 'released', 'skidBudget', 'skidSign'] as const satisfies readonly (keyof Ship)[];
/** A systems record's scalar fields in canonical order; `rooms` comes after `hull`. */
const SYSTEMS_HEAD = ['cls', 'target', 'hull'] as const satisfies readonly (keyof ShipSystems)[];
const SYSTEMS_TAIL = ['shields', 'shieldClock', 'laserCharge', 'laserHold', 'fireHeld', 'lock', 'magazine', 'magazineClock',
  'shots', 'laserHits', 'layersStripped', 'missilesLaunched', 'missileHits', 'missilesLost'] as const satisfies readonly (keyof ShipSystems)[];
const FLAGS = new Set<string>(['released', 'fireHeld']);
export const MISSILE_KEYS = ['x', 'y', 'vx', 'vy', 'heading', 'headingAcc', 'age'] as const satisfies readonly (keyof MissileFlight)[];
/** Compile-time completeness: a `Missile` member missing from these keys makes this `never` assignment fail typecheck. */
type MissingMissileKeys = Exclude<keyof Missile, (typeof MISSILE_KEYS)[number] | 'active' | 'owner'>;
const missileKeysComplete: MissingMissileKeys extends never ? true : never = true;
void missileKeysComplete;
const HUNTER_HEAD = ['mode', 'room', 'timer', 'working', 'fireAt', 'lastLaunch', 'trailHead'] as const;

type Numeric<T> = { [K in keyof T]: T[K] extends number | boolean ? K : never }[keyof T];
function member(name: string, key: string, get: (s: TacticalState) => object): ModuleField<TacticalState> {
  const rec = (s: TacticalState) => get(s) as Record<string, number | boolean>;
  return FLAGS.has(key) ? flag(name, (s) => rec(s)[key] as boolean, (s, v) => { rec(s)[key] = v; })
    : scalar(name, (s) => rec(s)[key] as number, (s, v) => { rec(s)[key] = v; });
}
const bodyField = (i: number, key: Numeric<Ship>): ModuleField<TacticalState> => member(`ships.${i}.${key}`, key, (s) => s.ships[i]!);
const systemsField = (i: number, key: Numeric<ShipSystems>): ModuleField<TacticalState> => member(`systems.${i}.${key}`, key, (s) => s.systems[i]!);
/** A 0/1 field that refuses any other value (an entry's presence, a slot's activity). */
function bit(name: string, get: (s: TacticalState) => boolean, set: (s: TacticalState, v: boolean) => void): ModuleField<TacticalState> {
  return { name, count: 1, read: (s, out) => { out.push(get(s) ? 1 : 0); },
    write: (s, values, offset) => { const v = values[offset]!; if (v !== 0 && v !== 1) throw new Error(`${name}: ${v} is not 0 or 1`); set(s, v === 1); } };
}
function missileFields(k: number): ModuleField<TacticalState>[] {
  return [
    bit(`missiles.${k}.active`, (s) => s.missiles[k]!.active, (s, v) => { s.missiles[k]!.active = v; }),
    scalar(`missiles.${k}.owner`, (s) => s.missiles[k]!.owner, (s, v) => { s.missiles[k]!.owner = v; }),
    {
      name: `missiles.${k}.flight`, count: MISSILE_KEYS.length,
      read(s, out) { const m = s.missiles[k]!; for (const key of MISSILE_KEYS) out.push(m[key]); },
      write(s, values, offset) {
        const m = s.missiles[k]!;
        if (!m.active && (m.owner !== 0 || MISSILE_KEYS.some((_, j) => values[offset + j] !== 0))) throw new Error(`missiles.${k}: a free entry holds values`);
        MISSILE_KEYS.forEach((key, j) => { m[key] = values[offset + j]!; });
      }
    }
  ];
}

const spaceCache = new Map<string, ModuleField<TacticalState>[]>(), shipCache = new Map<number, ModuleField<TacticalState>[]>();
/** The space field list for `slots` ship slots on a map with `asteroids` asteroids (graceUntil holds asteroids + slots bodies). */
function spaceFields(asteroids: number, slots: number): ModuleField<TacticalState>[] {
  const key = `${asteroids}:${slots}`;
  let fields = spaceCache.get(key);
  if (fields) return fields;
  fields = [
    scalar('tick', (s) => s.tick, (s, v) => { s.tick = v; }),
    scalar('seed', (s) => s.seed, (s, v) => { s.seed = v; }),
    scalar('rng.s', (s) => s.rng.s, (s, v) => { s.rng.s = v; }),
    scalar('map.asteroids.length', (s) => s.map.asteroids.length, (s, v) => { if (v !== s.map.asteroids.length) throw new Error(`asteroid count ${v} does not match the map (${s.map.asteroids.length})`); }),
    scalar('outcome', (s) => s.outcome, (s, v) => { s.outcome = v; }),
    scalar('ships.length', (s) => s.ships.length, (s, v) => { if (v !== s.ships.length) throw new Error(`ship slot count ${v} does not match the state (${s.ships.length})`); })
  ];
  for (let i = 0; i < slots; i++) {
    fields.push(bit(`ships.${i}.active`, (s) => s.ships[i]!.active, (s, v) => { s.ships[i]!.active = v; }));
    for (const key of BODY) fields.push(bodyField(i, key));
    fields.push(vector(`ships.${i}.graceUntil`, asteroids + slots, (s) => s.ships[i]!.graceUntil));
  }
  for (let k = 0; k < slots; k++) fields.push(...missileFields(k));
  for (const key of HUNTER_HEAD) fields.push(key === 'working'
    ? flag('hunter.working', (s) => s.hunter.working, (s, v) => { s.hunter.working = v; })
    : scalar(`hunter.${key}`, (s) => s.hunter[key] as number, (s, v) => { (s.hunter as unknown as Record<string, number>)[key] = v; }));
  fields.push(vector('hunter.trail', 2 * HUNTER_TRAIL_TICKS, (s) => s.hunter.trail));
  spaceCache.set(key, fields);
  return fields;
}
/** The ship field list for `slots` systems records. */
function shipFields(slots: number): ModuleField<TacticalState>[] {
  let fields = shipCache.get(slots);
  if (fields) return fields;
  fields = [];
  for (let i = 0; i < slots; i++) {
    for (const key of SYSTEMS_HEAD) fields.push(systemsField(i, key));
    fields.push(vector(`systems.${i}.rooms`, 3, (s) => s.systems[i]!.rooms));
    for (const key of SYSTEMS_TAIL) fields.push(systemsField(i, key));
  }
  shipCache.set(slots, fields);
  return fields;
}

/** The `space` module: the slots' bodies, the missile pool, the hunter and the outcome (engine refactor spec §5). The
 *  space and ship modules share TacticalState: `systems` is the ship module's. */
export const spaceModule: SimModule<TacticalState> = {
  id: 'space',
  fields: (s) => spaceFields(s.map.asteroids.length, s.ships.length),
  notSnapshotted: {
    map: 'regenerated from the seed by generateMap; the duel snapshot checks its mapHash',
    grid: 'the broad-phase grid, rebuilt from the map',
    events: 'per-tick events for the views, cleared every tick'
  },
  commands: [],
  reasons: []
};
/** The `ship` module (engine refactor spec §6, R-2 stage): one systems record per ship slot, holding today's duel rules. */
export const shipModule: SimModule<TacticalState> = {
  id: 'ship',
  fields: (s) => shipFields(s.systems.length),
  notSnapshotted: {},
  commands: ['laserLock', 'laserCharge', 'missileLaunch'],
  reasons: ['not-at-weapons', 'missile-in-flight', 'malformed', 'stale-tick', 'unavailable']
};
/** The tactical state's modules in canonical order. */
export const TACTICAL_MODULES: readonly SimModule<TacticalState>[] = [spaceModule, shipModule];

/** The space then the ship module's values, −0 written as 0. */
export function flattenTactical(s: TacticalState): Float64Array {
  const out: number[] = [];
  for (const m of TACTICAL_MODULES) flattenModule(m, s, out);
  return Float64Array.from(out, (v) => (v === 0 ? 0 : v));
}
/** The number of values flattenTactical writes for this state's map and slots. */
export function tacticalLength(s: TacticalState): number { return moduleLength(spaceModule, s) + moduleLength(shipModule, s); }
/** Write tactical values back into a state made from the same seed and slot count; returns the offset after them. */
export function unflattenTactical(s: TacticalState, values: ArrayLike<number>, offset = 0): number {
  for (const m of TACTICAL_MODULES) offset = unflattenModule(m, s, values, offset);
  return offset;
}

export function hashTactical(s: TacticalState): string { return hashF64(flattenTactical(s)); }

/** Deep copy of a tactical state, derived from the space and ship modules (engine refactor spec §6: clone comes from the
 *  modules' fields): the copy gets fresh containers of the state's shape, then every field's values are written into it.
 *  The map and the broad-phase grid are immutable after creation and are shared; the per-tick events are copied. −0 is kept. */
export function cloneTacticalFromModule(s: TacticalState): TacticalState {
  const copy: TacticalState = { ...s, rng: { s: 0 },
    ships: s.ships.map((b) => ({ ...b, graceUntil: new Int32Array(b.graceUntil.length) })) as TacticalState['ships'],
    systems: s.systems.map((y) => ({ ...y, rooms: [0, 0, 0] })) as TacticalState['systems'],
    missiles: s.missiles.map(emptyMissile) as TacticalState['missiles'],
    hunter: { ...s.hunter, trail: new Float64Array(s.hunter.trail.length) }, events: s.events.map((e) => ({ ...e })) };
  const values: number[] = [];
  for (const m of TACTICAL_MODULES) flattenModule(m, s, values);
  unflattenTactical(copy, values, 0);
  return copy;
}

const int = (v: number): boolean => Number.isInteger(v);
/** graceUntil is an Int32Array: a value outside signed 32 bits would wrap on restore and fail the hash only after allocation. */
const int32 = (v: number): boolean => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
const count = (v: number): boolean => Number.isInteger(v) && v >= 0;
const within = (lo: number, hi: number) => (v: number): boolean => Number.isInteger(v) && v >= lo && v <= hi;
/** headingAcc: physics.ts and missiles.ts drain it with `while (>= 1)` and `while (<= -1)`, so it always rests in (-1, 1). */
const acc = (v: number): boolean => Number.isFinite(v) && v > -1 && v < 1;
const flagBit = within(0, 1), heading = within(0, HEADING_COUNT - 1), room = within(0, 2), any = (): boolean => true;
const most = (f: (c: (typeof SHIP_CLASSES)[number]) => number): number => Math.max(...SHIP_CLASSES.map(f));
/** Each body field's per-value rule; every field must hold finite values (checked first). */
const BODY_RULES: Readonly<Record<string, (v: number) => boolean>> = {
  active: flagBit, heading, headingAcc: acc, skidBudget: (v) => Number.isFinite(v) && v >= 0, planetHits: count, asteroidHits: count, shipHits: count,
  released: flagBit, skidSign: within(-1, 1), graceUntil: int32
};
/** Each systems field's per-value rule, against the largest class (an inactive slot is checked for zeros separately). */
const systemsRules = (slots: number): Readonly<Record<string, (v: number) => boolean>> => ({
  cls: within(0, SHIP_CLASSES.length - 1), target: within(0, slots - 1), hull: (v) => v >= 0 && v <= most((c) => c.hull), rooms: room,
  shields: within(0, most((c) => c.shields.layers)), shieldClock: count, laserCharge: within(0, most((c) => c.slots.laser.chargeUnits)), laserHold: count,
  fireHeld: flagBit, lock: room, magazine: within(0, most((c) => c.slots.missile.magazine)), magazineClock: count,
  shots: count, laserHits: count, layersStripped: count, missilesLaunched: count, missileHits: count, missilesLost: count
});
// Built on first use: state.ts imports this file for cloneTactical, so its enums are read lazily.
const topRules = (): Readonly<Record<string, (v: number) => boolean>> => ({
  tick: count, seed: within(0, 0xffffffff), 'rng.s': within(0, 0xffffffff), outcome: within(Outcome.Running, Outcome.Draw),
  'hunter.mode': within(HunterMode.Hunt, HunterMode.Repair), 'hunter.room': room, 'hunter.timer': int, 'hunter.working': flagBit,
  'hunter.fireAt': (v) => Number.isInteger(v) && v >= -1, 'hunter.lastLaunch': int, 'hunter.trailHead': within(0, HUNTER_TRAIL_TICKS - 1), 'hunter.trail': any
});

/** Check tactical values (the space then the ship module's) against their field bounds and slot invariants without
 *  writing them anywhere: heading indices, integer counters, room levels 0..2, shields, the laser and the magazine
 *  against the largest class, the hunter's and the outcome's enums, the map's asteroid count and the slot count; an
 *  inactive ship slot holds only zeros; each missile pool entry: active 0 or 1, a free entry holds only zeros, a missile's
 *  owner is an active slot with no other missile in flight, its heading index and age. `shape` is any tactical state made
 *  from the same seed and slot count (only its map and slot count are read). Throws naming the first bad field; returns
 *  the offset after the values. */
export function validateTacticalValues(shape: TacticalState, values: ArrayLike<number>, offset = 0): number {
  let at = offset;
  const top = topRules(), slots = shape.ships.length, sys = systemsRules(slots), inactive = new Set<number>(), owners = new Set<number>();
  for (const m of TACTICAL_MODULES) for (const f of m.fields(shape)) {
    const slice = Array.from({ length: f.count }, (_, k) => values[at + k]!);
    const bad = (why: string): never => { throw new Error(`duel snapshot tactical ${f.name}: ${why} (${slice.slice(0, 8).join(', ')})`); };
    if (slice.some((v) => typeof v !== 'number' || !Number.isFinite(v))) bad('not finite');
    const ship = /^(ships|systems)\.(\d+)\.(.+)$/.exec(f.name), missile = /^missiles\.(\d+)\.(.+)$/.exec(f.name);
    if (f.name === 'map.asteroids.length') { if (slice[0] !== shape.map.asteroids.length) bad('does not match the map'); }
    else if (f.name === 'ships.length') { if (slice[0] !== slots) bad('does not match the slot count'); }
    else if (ship) {
      const i = Number(ship[2]), key = ship[3]!;
      if (ship[1] === 'ships' && key === 'active' && slice[0] === 0) inactive.add(i);
      if (inactive.has(i)) { if (slice.some((v) => v !== 0)) bad('an inactive slot holds values'); }
      else { const rule = ship[1] === 'ships' ? BODY_RULES[key] : sys[key]; if (rule && !slice.every(rule)) bad('out of range'); }
    } else if (missile) {
      const key = missile[2]!, active = values[at - (key === 'active' ? 0 : key === 'owner' ? 1 : 2)]!;
      if (key === 'active' && !flagBit(slice[0]!)) bad('active is not 0 or 1');
      if (active === 0 && slice.some((v) => v !== 0)) bad('a free entry holds values');
      if (active === 1 && key === 'owner') {
        const o = slice[0]!;
        if (!within(0, slots - 1)(o) || inactive.has(o)) bad('its owner is not an active ship slot');
        if (owners.has(o)) bad(`ship ${o} has two missiles in flight`);
        owners.add(o);
      }
      if (active === 1 && key === 'flight') { const [, , , , head, headAcc, age] = slice as number[]; if (!heading(head!) || !acc(headAcc!) || !count(age!)) bad('heading, headingAcc or age out of range'); }
    } else { const rule = top[f.name]; if (rule && !slice.every(rule)) bad('out of range'); }
    at += f.count;
  }
  return at;
}
```

- [ ] **Step 3: Flight, contacts, missiles, weapons, the hunter and the duel tick over slots**

Replace the whole of `src/renderer/src/sim/tactical/physics.ts` with:

```ts
// Flight physics (spec §3, §4, §6): softened gravity, the edge spring, turn, thrust, stabilise, drag,
// semi-implicit Euler. Float64 with + − × ÷ and sqrt only; no trigonometry (the determinism guard enforces it).
import { CUTTER_CLASS, type ShipClassDef } from './defs';
import { hx, hy, wrapHeading } from './direction';
import { hitStatics, resolveContacts } from './contacts';
import { classOf, Room, type Axes, type Ship, type TacticalState } from './state';
import { DEFAULT_FLIGHT, DT, GM, GRAVITY_EPS, K_EDGE, R_MAP, type FlightTuning } from './tuning';

/** Acceleration toward the planet at the origin: a = −GM · d / (|d|² + ε²)^{3/2}. */
export function gravityAccel(x: number, y: number): [number, number] {
  const q = x * x + y * y + GRAVITY_EPS * GRAVITY_EPS;
  const k = -GM / (q * Math.sqrt(q));
  return [k * x, k * y];
}

/** Inward acceleration past the map edge: a = −K_EDGE · (|d| − R_MAP) · d/|d|; zero inside. */
export function edgeAccel(x: number, y: number): [number, number] {
  const d = Math.sqrt(x * x + y * y);
  if (d <= R_MAP) return [0, 0];
  const k = (-K_EDGE * (d - R_MAP)) / d;
  return [k * x, k * y];
}

/** The class's thrust and turn factor at an Engines damage level (0..2). */
export function engineFactor(cls: ShipClassDef, engines: number): number { return cls.engineFactor[engines]!; }

/** One tick of one ship's flight, without contacts, at Engines damage level `engines` and with the class's thrust and
 *  turn. Shared by the step and by predictPath, so the prediction is exact. */
export function flyShip(s: Ship, axes: Axes, tuning: FlightTuning, engines = 0, cls: ShipClassDef = CUTTER_CLASS): void {
  // Quantise the held axes by sign (spec: each is -1, 0 or 1); `|| 0` maps NaN and -0 to 0.
  const turn = Math.sign(axes.turn) || 0, thrust = Math.sign(axes.thrust) || 0;
  const f = engineFactor(cls, engines);
  s.headingAcc += turn * cls.turnStepsPerTick * f;
  while (s.headingAcc >= 1) { s.heading = wrapHeading(s.heading + 1); s.headingAcc -= 1; }
  while (s.headingAcc <= -1) { s.heading = wrapHeading(s.heading - 1); s.headingAcc += 1; }
  const h0 = hx(s.heading), h1 = hy(s.heading);
  // Stabilise (spec §6): on the tick both axes go to zero, capture the sideways speed (along px, py, 90° clockwise of the
  // nose) as the skid to remove; then remove up to STABILISE · dt of it per tick until it is gone. Gravity's later
  // sideways pull is never captured, so a released ship still falls and orbits. Runs before this tick's forces.
  const idle = turn === 0 && thrust === 0, px = -h1, py = h0;
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
  if (thrust > 0) { ax += h0 * cls.thrust * f; ay += h1 * cls.thrust * f; }
  else if (thrust < 0) { ax -= h0 * cls.thrust * cls.reverseFraction * f; ay -= h1 * cls.thrust * cls.reverseFraction * f; }
  s.vx += ax * DT; s.vy += ay * DT;
  const keep = 1 - tuning.drag * DT;
  s.vx *= keep; s.vy *= keep;
  s.skidBudget *= keep;   // drag shrinks the remaining skid too, so the assist never pushes past zero
  s.x += s.vx * DT; s.y += s.vy * DT;
}

/** Ship slot i's flight for one tick: its body, its Engines level and its class. */
export function flySlot(state: TacticalState, i: number, axes: Axes, tuning: FlightTuning): void {
  flyShip(state.ships[i]!, axes, tuning, state.systems[i]!.rooms[Room.Engines], classOf(state, i));
}

/** One duel tick of flight: the active ships fly in slot order, then contacts resolve, then the tick advances. */
export function stepFlight(state: TacticalState, axes: readonly Axes[], tuning: FlightTuning = DEFAULT_FLIGHT): void {
  state.ships.forEach((s, i) => { if (s.active) flySlot(state, i, axes[i] ?? { turn: 0, thrust: 0 }, tuning); });
  resolveContacts(state);
  state.tick++;
}

/** The dev flight view's single-ship step (H-1 spec §9): ship 0 flies, meets the planet and asteroids, then the tick
 *  advances. Ship 1 is never stepped and never collides, so it stays exactly as created. */
export function stepSoloFlight(state: TacticalState, axes: Axes, tuning: FlightTuning = DEFAULT_FLIGHT): void {
  flySlot(state, 0, axes, tuning);
  hitStatics(state, 0);
  state.tick++;
}
```

Replace the whole of `src/renderer/src/sim/tactical/contacts.ts` with:

```ts
// Contacts (spec §4 collision matrix, ship rows; missiles are resolved in missiles.ts). Each active ship, in slot order,
// meets the planet, then asteroids in ascending index, then every later active ship. Push out, bounce keeping
// RESTITUTION of the normal speed, and cost hull only once per CONTACT_GRACE_TICKS per pair.
import { queryGrid } from './grid';
import { classOf, shipBody, type TacticalState } from './state';
import { ASTEROID_CONTACT_HULL, CONTACT_GRACE_TICKS, PLANET_CONTACT_HULL, RESTITUTION, SHIP_CONTACT_HULL } from './tuning';

/** True when this contact cost ship i hull (outside the pair's grace window). */
function hitStatic(state: TacticalState, i: number, cx: number, cy: number, cr: number, body: number, hull: number): boolean {
  const s = state.ships[i]!, sys = state.systems[i]!;
  const dx = s.x - cx, dy = s.y - cy, rr = classOf(state, i).radius + cr, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2), nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1;
  s.x = cx + nx * rr; s.y = cy + ny * rr;
  const vn = s.vx * nx + s.vy * ny;
  if (vn < 0) { s.vx -= (1 + RESTITUTION) * vn * nx; s.vy -= (1 + RESTITUTION) * vn * ny; }
  if (state.tick < s.graceUntil[body]!) return false;
  sys.hull = Math.max(0, sys.hull - hull);
  s.graceUntil[body] = state.tick + CONTACT_GRACE_TICKS;
  return true;
}

/** Ships i and j (i < j) meet: pushed apart, normal speeds exchanged and damped, 1 hull each outside the pair's grace. */
function shipShip(state: TacticalState, i: number, j: number): void {
  const a = state.ships[i]!, b = state.ships[j]!, ab = shipBody(state.map, i, j), ba = shipBody(state.map, j, i);
  const dx = b.x - a.x, dy = b.y - a.y, rr = classOf(state, i).radius + classOf(state, j).radius, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  const d = Math.sqrt(d2), nx = d > 0 ? dx / d : 1, ny = d > 0 ? dy / d : 0, half = (rr - d) / 2;
  a.x -= nx * half; a.y -= ny * half; b.x += nx * half; b.y += ny * half;
  const an = a.vx * nx + a.vy * ny, bn = b.vx * nx + b.vy * ny;
  if (an - bn > 0) {   // closing: exchange the normal components, then keep RESTITUTION of each
    const an2 = RESTITUTION * bn, bn2 = RESTITUTION * an;
    a.vx += (an2 - an) * nx; a.vy += (an2 - an) * ny;
    b.vx += (bn2 - bn) * nx; b.vy += (bn2 - bn) * ny;
  }
  if (state.tick < a.graceUntil[ab]!) return;
  for (const [k, body] of [[i, ab], [j, ba]] as const) {
    const s = state.ships[k]!, sys = state.systems[k]!;
    sys.hull = Math.max(0, sys.hull - SHIP_CONTACT_HULL); s.graceUntil[body] = state.tick + CONTACT_GRACE_TICKS; s.shipHits++;
  }
}

/** Ship slot i's static contacts (spec §4 order): the planet, then asteroids in ascending index. Exported for the
 *  single-ship flight step (H-1 spec §9). */
export function hitStatics(state: TacticalState, i: number): void {
  const { map, grid } = state, s = state.ships[i]!;
  if (hitStatic(state, i, map.planet.x, map.planet.y, map.planet.r, 0, PLANET_CONTACT_HULL)) s.planetHits++;
  for (const k of queryGrid(grid, s.x, s.y, classOf(state, i).radius)) {
    const a = map.asteroids[k]!;
    if (hitStatic(state, i, a.x, a.y, a.r, k + 1, ASTEROID_CONTACT_HULL)) s.asteroidHits++;
  }
}

/** Spec §4 order, per active body in slot order: its static contacts, then its contacts with every later active ship.
 *  For the duel's two slots: ship 0 meets the planet and asteroids, then ship 1 (the pair is resolved once, here); then
 *  ship 1 meets the planet and asteroids. */
export function resolveContacts(state: TacticalState): void {
  const n = state.ships.length;
  for (let i = 0; i < n; i++) {
    if (!state.ships[i]!.active) continue;
    hitStatics(state, i);
    for (let j = i + 1; j < n; j++) if (state.ships[j]!.active) shipShip(state, i, j);
  }
}
```

Replace the whole of `src/renderer/src/sim/tactical/missiles.ts` with:

```ts
// Cruise missiles (spec §7b and the missile rows of the §4 collision matrix), in the missile pool: at most one in flight
// per ship, found by its owner (missileOf). A missile thrusts for its fuel time and coasts until it expires, attended or
// not; it has no drag. Gravity bends it. Missiles are flown and resolved in owner order (ship slot order), as before
// the pool, whatever pool entry they sit in.
import { hx, hy, wrapHeading } from './direction';
import { roomAtImpact } from './geometry';
import { queryGrid } from './grid';
import { gravityAccel } from './physics';
import { classOf, emptyMissile, missileOf, placeMissile, type DuelEvent, type Missile, type TacticalState } from './state';
import { DT, R_MAP } from './tuning';

type EndCause = Extract<DuelEvent, { kind: 'missileEnd' }>['cause'];

export function launchMissile(state: TacticalState, i: number): void {
  const s = state.ships[i]!, sys = state.systems[i]!, def = classOf(state, i).slots.missile, h0 = hx(s.heading), h1 = hy(s.heading);
  placeMissile(state, i, {
    x: s.x + h0 * def.spawnOffset, y: s.y + h1 * def.spawnOffset,
    vx: s.vx + h0 * def.launchSpeed, vy: s.vy + h1 * def.launchSpeed,
    heading: s.heading, headingAcc: 0, age: 0
  });
  sys.magazine--; sys.missilesLaunched++;
}

function end(state: TacticalState, m: Missile, cause: EndCause, target = -1, room = -1): void {
  state.events.push({ kind: 'missileEnd', ship: m.owner, cause, target, room, x: m.x, y: m.y });
  if (cause !== 'ship') state.systems[m.owner]!.missilesLost++;
  Object.assign(m, emptyMissile());
}

/** One tick of ship i's missile's flight. `steer` is the gunner's turn axis (0 when the Weapons console is empty). */
export function flyMissile(state: TacticalState, i: number, steer: number): void {
  const m = missileOf(state, i);
  if (!m) return;
  const def = classOf(state, i).slots.missile;
  m.age++;
  m.headingAcc += (Math.sign(steer) || 0) * def.turnStepsPerTick;
  while (m.headingAcc >= 1) { m.heading = wrapHeading(m.heading + 1); m.headingAcc -= 1; }
  while (m.headingAcc <= -1) { m.heading = wrapHeading(m.heading - 1); m.headingAcc += 1; }
  let [ax, ay] = gravityAccel(m.x, m.y);
  if (m.age <= def.fuelTicks) { ax += hx(m.heading) * def.thrust; ay += hy(m.heading) * def.thrust; }
  m.vx += ax * DT; m.vy += ay * DT;
  m.x += m.vx * DT; m.y += m.vy * DT;
}

function touches(m: Missile, radius: number, x: number, y: number, r: number): boolean {
  const dx = m.x - x, dy = m.y - y, rr = radius + r;
  return dx * dx + dy * dy < rr * rr;
}

/** Land missile m on ship k at its impact point: shields are bypassed (spec §7b, Q20). */
function land(state: TacticalState, m: Missile, k: number): void {
  const target = state.ships[k]!, sys = state.systems[k]!, room = roomAtImpact(target, m.x, m.y) as 0 | 1 | 2;
  if (sys.rooms[room] < 2) sys.rooms[room]++;
  sys.hull = Math.max(0, sys.hull - classOf(state, m.owner).slots.missile.hull);
  if (k !== m.owner) state.systems[m.owner]!.missileHits++;   // a self-hit is not a hit; the event's target tells them apart
  end(state, m, 'ship', k, room);
}

/** Missile contacts in spec §4 order, per missile in owner order: statics and the edge, then active ships by slot, then
 *  the other missiles in owner order. Then a missile that survived its life's last tick self-destructs (after that
 *  tick's move and contacts). */
export function resolveMissiles(state: TacticalState): void {
  const n = state.ships.length;
  for (let i = 0; i < n; i++) {
    const m = missileOf(state, i);
    if (!m) continue;
    const def = classOf(state, i).slots.missile, p = state.map.planet;
    if (touches(m, def.radius, p.x, p.y, p.r)) { end(state, m, 'planet'); continue; }
    if (queryGrid(state.grid, m.x, m.y, def.radius).some((k) => { const a = state.map.asteroids[k]!; return touches(m, def.radius, a.x, a.y, a.r); })) { end(state, m, 'asteroid'); continue; }
    if (m.x * m.x + m.y * m.y > R_MAP * R_MAP) { end(state, m, 'edge'); continue; }
    let landed = false;
    for (let k = 0; k < n && !landed; k++) {
      const s = state.ships[k]!;
      if (!s.active || (k === i && m.age <= def.armTicks)) continue;
      if (touches(m, def.radius, s.x, s.y, classOf(state, k).radius)) { land(state, m, k); landed = true; }
    }
    if (landed) continue;
    for (let k = 0; k < n; k++) {
      const o = k === i ? null : missileOf(state, k);
      if (o && touches(m, def.radius, o.x, o.y, classOf(state, k).slots.missile.radius)) { end(state, m, 'missile'); end(state, o, 'missile'); break; }
    }
  }
  for (let i = 0; i < n; i++) { const m = missileOf(state, i); if (m && m.age >= classOf(state, i).slots.missile.lifeTicks) end(state, m, 'expired'); }
}
```

Replace the whole of `src/renderer/src/sim/tactical/weapons.ts` with:

```ts
// Laser, shields and the magazine (spec §5, §7a, the §7 weapons state transitions table), on each ship's systems record
// and its class's weapon definitions. A ship's laser fires at its locked target (engine refactor spec §5).
// Commands arrive as one ShipInput per ship per tick; the duel step builds these from the authority's admitted commands.
import { inArc, lineOfSight } from './geometry';
import { launchMissile } from './missiles';
import { classOf, missileOf, Room, type Axes, type TacticalState } from './state';

/** One ship's inputs for one tick. `helm` / `weapons`: a present player is seated at that console ("attended", spec §8). */
export interface ShipInput {
  helm: boolean;
  weapons: boolean;
  /** Turn and thrust, read only while `helm`. */
  axes: Axes;
  /** Missile steering turn axis, read only while `weapons` and a missile flies. */
  steer: number;
  /** `laserLock {room}`: the target Room to lock, or null for no command this tick. */
  laserLock: number | null;
  /** `laserCharge {held}`: true = press, false = release, null = no command this tick. */
  laserCharge: boolean | null;
  /** `missileLaunch`. */
  missileLaunch: boolean;
}

/** A crew that sits at both consoles and does nothing. */
export const IDLE_INPUT: ShipInput = { helm: true, weapons: true, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false };
/** Nobody at either console: a ship nobody flies. */
export const UNCREWED_INPUT: ShipInput = { helm: false, weapons: false, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false };

/** Whether ship i's laser is fully charged. */
export function laserFull(state: TacticalState, i: number): boolean { return state.systems[i]!.laserCharge >= classOf(state, i).slots.laser.chargeUnits; }

/** Admission (spec §7 table; the duel step uses these to give reject reasons): laserCharge is accepted only with no missile in flight. */
export function canCharge(state: TacticalState, i: number): boolean { return missileOf(state, i) === null; }
/** missileLaunch is accepted only with no missile in flight, a missile in the magazine and Weapons below level 2. */
export function canLaunch(state: TacticalState, i: number): boolean {
  const s = state.systems[i]!;
  return missileOf(state, i) === null && s.magazine > 0 && s.rooms[Room.Weapons] < 2;
}
/** A lock target must be a Room index. */
export function validLock(room: number): boolean { return Number.isInteger(room) && room >= 0 && room <= 2; }

/** The laser cannot charge, hold or fire while its ship's missile flies or its Weapons console is empty (spec §7 table). */
export function laserFrozen(state: TacticalState, i: number, input: ShipInput): boolean {
  return missileOf(state, i) !== null || !input.weapons;
}

/** Whether ship i's laser would hit ship j now: j an active slot inside the ±60° arc and range, with line of sight (spec §7a). */
export function laserEligible(state: TacticalState, i: number, j: number): boolean {
  const a = state.ships[i]!, b = state.ships[j], laser = classOf(state, i).slots.laser;
  if (!b || !b.active || j === i) return false;
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx * dx + dy * dy > laser.range * laser.range) return false;
  return inArc(a.heading, dx, dy, laser.arcCos) && lineOfSight(state, a.x, a.y, b.x, b.y);
}

function fireLaser(state: TacticalState, i: number): void {
  const a = state.ships[i]!, as = state.systems[i]!, j = as.target, b = state.ships[j] ?? a, bs = state.systems[j], hit = laserEligible(state, i, j);
  let stripped = false, room = -1;
  as.shots++;
  if (hit && bs) {
    as.laserHits++;
    if (bs.shields > 0) { bs.shields--; bs.shieldClock = 0; as.layersStripped++; stripped = true; }
    else {
      room = as.lock;
      if (bs.rooms[as.lock]! < 2) bs.rooms[as.lock as 0 | 1 | 2]++;
      bs.hull = Math.max(0, bs.hull - classOf(state, i).slots.laser.hull);
    }
  }
  state.events.push({ kind: 'laser', ship: i, hit, stripped, room, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  as.laserCharge = 0; as.laserHold = 0;
}

/** Apply ship i's weapon commands for this tick, before anything moves (spec §7 table). */
export function applyWeaponsInput(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.systems[i]!;
  if (!input.weapons) { s.fireHeld = false; return; }   // unattended: Fire lets go without firing or discarding
  if (input.laserLock !== null && validLock(input.laserLock)) s.lock = input.laserLock;
  if (input.laserCharge !== null && canCharge(state, i)) {
    if (input.laserCharge) s.fireHeld = true;
    else if (s.fireHeld) {
      s.fireHeld = false;
      if (laserFull(state, i)) fireLaser(state, i);
      else { s.laserCharge = 0; s.laserHold = 0; }
    }
  }
  if (input.missileLaunch && canLaunch(state, i)) {
    launchMissile(state, i);
    s.fireHeld = false;
  }
}

/** Advance ship i's laser charge and hold timer, shields and magazine by one tick (spec §5, §7). */
export function tickWeapons(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.systems[i]!, c = classOf(state, i), laser = c.slots.laser;
  if (!laserFrozen(state, i, input)) {
    if (s.fireHeld && !laserFull(state, i)) s.laserCharge = Math.min(laser.chargeUnits, s.laserCharge + laser.chargeRate[s.rooms[Room.Weapons]]!);
    else if (laserFull(state, i) && ++s.laserHold >= laser.holdTicks) { s.laserCharge = 0; s.laserHold = 0; }   // vents; recharges if still held
  }
  if (s.shields >= c.shields.layers) s.shieldClock = 0;
  else if ((s.shieldClock += c.shields.rate[s.rooms[Room.Shields]]!) >= c.shields.rechargeUnits) { s.shields++; s.shieldClock = 0; }   // rate 0: held
  if (s.magazine >= c.slots.missile.magazine) s.magazineClock = 0;
  else if (++s.magazineClock >= c.slots.missile.regenTicks) { s.magazine++; s.magazineClock = 0; }
}
```

Replace the whole of `src/renderer/src/sim/tactical/duel.ts` with:

```ts
// One headless duel tick (spec §4 to §9). The duel step (sim/duel/step.ts) wraps this with the Cutter interior and the
// authority's commands; here the crew's inputs arrive ready-made for its slot, the hunter-class slot's come from the
// hunter, and any other active slot is uncrewed.
import { hunterThink } from './hunter';
import { flyMissile, resolveMissiles } from './missiles';
import { flySlot } from './physics';
import { resolveContacts } from './contacts';
import { classOf, CREW_SLOT, NO_AXES, Outcome, type TacticalState } from './state';
import { DEFAULT_FLIGHT, type FlightTuning } from './tuning';
import { applyWeaponsInput, tickWeapons, UNCREWED_INPUT, type ShipInput } from './weapons';

/** The active slot the hunter's brain flies (its class's AI profile), or −1. There is one hunter brain per encounter. */
export function hunterSlot(state: TacticalState): number {
  return state.ships.findIndex((s, i) => s.active && i !== CREW_SLOT && classOf(state, i).ai === 'hunter');
}

/**
 * Order, fixed: think (the hunter reads the state as it stands), weapon commands (every active ship, in slot order),
 * ships fly, missiles fly, ship contacts, missile contacts, weapon clocks, outcome, tick. The crew wins when every other
 * active ship's hull is gone. Does nothing once the duel has ended.
 */
export function stepDuel(state: TacticalState, crew: ShipInput, tuning: FlightTuning = DEFAULT_FLIGHT): void {
  if (state.outcome !== Outcome.Running) return;
  state.events = [];
  const hunter = hunterSlot(state), n = state.ships.length;
  const inputs = state.ships.map((s, i) => (!s.active ? UNCREWED_INPUT : i === CREW_SLOT ? crew : i === hunter ? hunterThink(state, i) : UNCREWED_INPUT));
  const hunterLaunches = hunter >= 0 ? state.systems[hunter]!.missilesLaunched : 0;
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) applyWeaponsInput(state, i, inputs[i]!);
  if (hunter >= 0 && state.systems[hunter]!.missilesLaunched > hunterLaunches) state.hunter.lastLaunch = state.tick;   // a refused launch costs no cooldown
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) flySlot(state, i, inputs[i]!.helm ? inputs[i]!.axes : NO_AXES, tuning);
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) flyMissile(state, i, inputs[i]!.weapons ? inputs[i]!.steer : 0);
  resolveContacts(state);
  resolveMissiles(state);
  for (let i = 0; i < n; i++) if (state.ships[i]!.active) tickWeapons(state, i, inputs[i]!);
  const down = (i: number): boolean => state.systems[i]!.hull <= 0;
  const crewDown = down(CREW_SLOT), others = state.ships.map((s, i) => i).filter((i) => i !== CREW_SLOT && state.ships[i]!.active);
  const enemyDown = others.length > 0 && others.every(down);
  state.outcome = crewDown && enemyDown ? Outcome.Draw : crewDown ? Outcome.EnemyWins : enemyDown ? Outcome.CrewWins : Outcome.Running;
  state.tick++;
}
```

In `src/renderer/src/sim/tactical/hunter.ts`, replace:

```ts
// The hunter (spec §9): a blunt, deterministic state machine that flies the enemy ship (ship 1) through the same
// ShipInput the crew uses. It reads the state as it stands at the start of the tick. Its only randomness is the
// release jitter, drawn from rng.tactical.
import { nextInt } from '../../../../shared/rng';
```

with:

```ts
// The hunter (spec §9): a blunt, deterministic state machine that flies a ship slot whose class has the hunter AI
// profile (the duel's slot 1) against that slot's locked target, through the same ShipInput the crew uses. It reads the
// state as it stands at the start of the tick. Its only randomness is the release jitter, drawn from rng.tactical. One
// hunter brain per encounter (state.hunter) until R-5 gives every ship its own.
import { nextInt } from '../../../../shared/rng';
```

In `src/renderer/src/sim/tactical/hunter.ts`, replace:

```ts
import { queryGrid } from './grid';
import { HunterMode, Room, type TacticalState } from './state';
import {
  HUNTER_AVOID_MARGIN, HUNTER_BRAKE_SPEED, HUNTER_JITTER_TICKS, HUNTER_LEAD_S, HUNTER_LOOKAHEAD_S, HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_MISSILE_RANGE,
  HUNTER_STANDOFF, HUNTER_THRUST_COS, HUNTER_TRAIL_TICKS, HUNTER_WALK_TICKS, LASER_RANGE, REPAIR_WORK_TICKS
} from './tuning';
```

with:

```ts
import { queryGrid } from './grid';
import { classOf, HunterMode, missileOf, Room, type TacticalState } from './state';
import {
  HUNTER_AVOID_MARGIN, HUNTER_BRAKE_SPEED, HUNTER_JITTER_TICKS, HUNTER_LEAD_S, HUNTER_LOOKAHEAD_S, HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_MISSILE_RANGE,
  HUNTER_STANDOFF, HUNTER_THRUST_COS, HUNTER_TRAIL_TICKS, HUNTER_WALK_TICKS, REPAIR_WORK_TICKS
} from './tuning';
```

In `src/renderer/src/sim/tactical/hunter.ts`, replace:

```ts

/** The first solid body the enemy's straight-line path over the lookahead comes within its radius + margin of, or null. */
function threatAhead(state: TacticalState): { x: number; y: number } | null {
  const s = state.ships[1], ex = s.x + s.vx * HUNTER_LOOKAHEAD_S, ey = s.y + s.vy * HUNTER_LOOKAHEAD_S, p = state.map.planet;
  if (segmentNear(s.x, s.y, ex, ey, p.x, p.y, p.r + HUNTER_AVOID_MARGIN)) return p;
```

with:

```ts

/** The first solid body ship i's straight-line path over the lookahead comes within its radius + margin of, or null. */
function threatAhead(state: TacticalState, i: number): { x: number; y: number } | null {
  const s = state.ships[i]!, ex = s.x + s.vx * HUNTER_LOOKAHEAD_S, ey = s.y + s.vy * HUNTER_LOOKAHEAD_S, p = state.map.planet;
  if (segmentNear(s.x, s.y, ex, ey, p.x, p.y, p.r + HUNTER_AVOID_MARGIN)) return p;
```

In `src/renderer/src/sim/tactical/hunter.ts`, replace:

```ts

function updateRepair(state: TacticalState): void {
  const h = state.hunter, me = state.ships[1], crew = state.ships[0];
  if (h.mode === HunterMode.Repair) {
```

with:

```ts

function updateRepair(state: TacticalState, i: number): void {
  const h = state.hunter, me = state.systems[i]!, self = state.ships[i]!, crew = state.ships[me.target]!;
  if (h.mode === HunterMode.Repair) {
```

In `src/renderer/src/sim/tactical/hunter.ts`, replace:

```ts
  }
  const dx = crew.x - me.x, dy = crew.y - me.y, outOfRange = dx * dx + dy * dy > LASER_RANGE * LASER_RANGE;
  let best = -1;
```

with:

```ts
  }
  const range = classOf(state, i).slots.laser.range, dx = crew.x - self.x, dy = crew.y - self.y, outOfRange = dx * dx + dy * dy > range * range;
  let best = -1;
```

In `src/renderer/src/sim/tactical/hunter.ts`, replace:

```ts

/** The enemy's input for this tick. Updates the hunter's own state (trail, repair timers, scheduled release). */
export function hunterThink(state: TacticalState): ShipInput {
  const h = state.hunter, me = state.ships[1], crew = state.ships[0];
  const oldX = h.trail[2 * h.trailHead]!, oldY = h.trail[2 * h.trailHead + 1]!;   // where the crew was HUNTER_TRAIL_TICKS ago
  h.trail[2 * h.trailHead] = crew.x; h.trail[2 * h.trailHead + 1] = crew.y; h.trailHead = (h.trailHead + 1) % HUNTER_TRAIL_TICKS;
  updateRepair(state);
  const repairing = h.mode === HunterMode.Repair;
```

with:

```ts

/** Ship i's input for this tick (the duel's hunter is slot 1), against its locked target. Updates the hunter's own state
 *  (trail, repair timers, scheduled release). */
export function hunterThink(state: TacticalState, i = 1): ShipInput {
  const h = state.hunter, me = state.ships[i]!, mine = state.systems[i]!, target = mine.target, crew = state.ships[target]!, crewSys = state.systems[target]!;
  const oldX = h.trail[2 * h.trailHead]!, oldY = h.trail[2 * h.trailHead + 1]!;   // where the crew was HUNTER_TRAIL_TICKS ago
  h.trail[2 * h.trailHead] = crew.x; h.trail[2 * h.trailHead + 1] = crew.y; h.trailHead = (h.trailHead + 1) % HUNTER_TRAIL_TICKS;
  updateRepair(state, i);
  const repairing = h.mode === HunterMode.Repair;
```

In `src/renderer/src/sim/tactical/hunter.ts`, replace:

```ts
  if (helm) {
    const threat = threatAhead(state);
    if (threat) input.axes = { turn: -sideOf(me.heading, threat.x - me.x, threat.y - me.y) || 1, thrust: 1 };
```

with:

```ts
  if (helm) {
    const threat = threatAhead(state, i);
    if (threat) input.axes = { turn: -sideOf(me.heading, threat.x - me.x, threat.y - me.y) || 1, thrust: 1 };
```

In `src/renderer/src/sim/tactical/hunter.ts`, replace:

```ts

  input.laserLock = crew.rooms[Room.Shields] < 2 ? Room.Shields : Room.Weapons;
  const missile = state.missiles[1];
  if (missile) input.steer = pursuitTurn(missile.heading, oldX - missile.x, oldY - missile.y);
  else {
    if (!me.fireHeld) { input.laserCharge = true; h.fireAt = -1; }   // press first; a release can only follow a held press
    else if (laserFull(state, 1) && laserEligible(state, 1, 0)) {
      if (h.fireAt < 0) h.fireAt = state.tick + nextInt(state.rng, HUNTER_JITTER_TICKS + 1);
```

with:

```ts

  input.laserLock = crewSys.rooms[Room.Shields] < 2 ? Room.Shields : Room.Weapons;
  const missile = missileOf(state, i);
  if (missile) input.steer = pursuitTurn(missile.heading, oldX - missile.x, oldY - missile.y);
  else {
    if (!mine.fireHeld) { input.laserCharge = true; h.fireAt = -1; }   // press first; a release can only follow a held press
    else if (laserFull(state, i) && laserEligible(state, i, target)) {
      if (h.fireAt < 0) h.fireAt = state.tick + nextInt(state.rng, HUNTER_JITTER_TICKS + 1);
```

In `src/renderer/src/sim/tactical/hunter.ts`, replace:

```ts
    const dx = crew.x - me.x, dy = crew.y - me.y;
    if (me.magazine > 0 && me.rooms[Room.Weapons] < 2 && dx * dx + dy * dy <= HUNTER_MISSILE_RANGE * HUNTER_MISSILE_RANGE
      && state.tick - h.lastLaunch >= HUNTER_MISSILE_COOLDOWN_TICKS) input.missileLaunch = true;   // stepDuel starts the cooldown only if it launches
```

with:

```ts
    const dx = crew.x - me.x, dy = crew.y - me.y;
    if (mine.magazine > 0 && mine.rooms[Room.Weapons] < 2 && dx * dx + dy * dy <= HUNTER_MISSILE_RANGE * HUNTER_MISSILE_RANGE
      && state.tick - h.lastLaunch >= HUNTER_MISSILE_COOLDOWN_TICKS) input.missileLaunch = true;   // stepDuel starts the cooldown only if it launches
```

In `src/renderer/src/sim/tactical/predict.ts`, replace:

```ts
import { flyShip } from './physics';
import { cloneShip, type Axes, type TacticalState } from './state';
import { DEFAULT_FLIGHT, SHIP_RADIUS, type FlightTuning } from './tuning';
```

with:

```ts
import { flyShip } from './physics';
import { classOf, cloneShip, Room, type Axes, type TacticalState } from './state';
import { DEFAULT_FLIGHT, type FlightTuning } from './tuning';
```

In `src/renderer/src/sim/tactical/predict.ts`, replace:

```ts
export function predictPath(state: TacticalState, shipIndex: number, axes: Axes, ticks: number, every: number, tuning: FlightTuning = DEFAULT_FLIGHT): PathPoint[] {
  const src = state.ships[shipIndex]!;
  const s = cloneShip(src), stride = Math.max(1, Math.floor(every));
  const out: PathPoint[] = [];
  for (let t = 1; t <= ticks; t++) {
    flyShip(s, axes, tuning);
    if (touchesSolid(state, s.x, s.y, SHIP_RADIUS)) { out.push({ x: s.x, y: s.y }); break; }
    if (t % stride === 0) out.push({ x: s.x, y: s.y });
```

with:

```ts
export function predictPath(state: TacticalState, shipIndex: number, axes: Axes, ticks: number, every: number, tuning: FlightTuning = DEFAULT_FLIGHT): PathPoint[] {
  const s = cloneShip(state.ships[shipIndex]!), stride = Math.max(1, Math.floor(every));
  const cls = classOf(state, shipIndex), engines = state.systems[shipIndex]!.rooms[Room.Engines];
  const out: PathPoint[] = [];
  for (let t = 1; t <= ticks; t++) {
    flyShip(s, axes, tuning, engines, cls);
    if (touchesSolid(state, s.x, s.y, cls.radius)) { out.push({ x: s.x, y: s.y }); break; }
    if (t % stride === 0) out.push({ x: s.x, y: s.y });
```

In `src/renderer/src/render/tactical/missilePath.ts`, replace:

```ts
import { touchesSolid, type PathPoint } from '../../sim/tactical/predict';
import type { Missile, TacticalState } from '../../sim/tactical/state';
import { MISSILE_LIFE_TICKS, MISSILE_RADIUS, R_MAP } from '../../sim/tactical/tuning';
```

with:

```ts
import { touchesSolid, type PathPoint } from '../../sim/tactical/predict';
import { emptyMissile, type Missile, type MissileFlight, type TacticalState } from '../../sim/tactical/state';
import { MISSILE_LIFE_TICKS, MISSILE_RADIUS, R_MAP } from '../../sim/tactical/tuning';
```

In `src/renderer/src/render/tactical/missilePath.ts`, replace:

```ts
 */
export function predictMissilePath(state: TacticalState, missile: Missile, steer: number, stride: number = MISSILE_PATH_STRIDE): PathPoint[] {
  const m: Missile = { ...missile }, every = Math.max(1, Math.floor(stride));
  const scratch: TacticalState = { ...state, missiles: [m, null] };   // flyMissile reads only missiles[i]
  const horizon = Math.min(MISSILE_PATH_MAX_TICKS, MISSILE_LIFE_TICKS - missile.age), out: PathPoint[] = [];
  for (let t = 1; t <= horizon; t++) {
    flyMissile(scratch, 0, steer);
    const ended = touchesSolid(state, m.x, m.y, MISSILE_RADIUS) || m.x * m.x + m.y * m.y > R_MAP * R_MAP || m.age >= MISSILE_LIFE_TICKS;
```

with:

```ts
 */
export function predictMissilePath(state: TacticalState, missile: MissileFlight & { owner?: number }, steer: number, stride: number = MISSILE_PATH_STRIDE): PathPoint[] {
  const m: Missile = { ...missile, active: true, owner: missile.owner ?? 0 }, every = Math.max(1, Math.floor(stride));
  const scratch: TacticalState = { ...state, missiles: [m, emptyMissile()] };   // flyMissile reads only its owner's entry
  const horizon = Math.min(MISSILE_PATH_MAX_TICKS, MISSILE_LIFE_TICKS - missile.age), out: PathPoint[] = [];
  for (let t = 1; t <= horizon; t++) {
    flyMissile(scratch, m.owner, steer);
    const ended = touchesSolid(state, m.x, m.y, MISSILE_RADIUS) || m.x * m.x + m.y * m.y > R_MAP * R_MAP || m.age >= MISSILE_LIFE_TICKS;
```

- [ ] **Step 4: The duel's modules, snapshot and checkpoint, the version and the alias table**

In `src/renderer/src/sim/duel/modules.ts`, replace:

```ts
// The duel on the sim module contract (engine refactor spec §6, R-1): space (the tactical state), presence, repair and
// the interior wrapper, in canonical order after SIM_VERSION. flattenDuel, the duel snapshot and its restore all come
// from this list; tests/duelModules.test.ts holds every DuelState and TacticalState member to a field or an exclusion.
```

with:

```ts
// The duel on the sim module contract (engine refactor spec §6, R-1 and R-2): space (the ship slots' bodies, the
// missile pool, the hunter), ship (each slot's systems record), presence, repair and the interior wrapper, in canonical
// order after SIM_VERSION. flattenDuel, the duel snapshot and its restore all come
// from this list; tests/duelModules.test.ts holds every DuelState and TacticalState member to a field or an exclusion.
```

In `src/renderer/src/sim/duel/modules.ts`, replace:

```ts
import { flag, flattenModule, moduleLength, unflattenModule, vector, type ModuleField, type SimModule } from '../module';
import { spaceModule } from '../tactical/hash';
import type { DuelState } from './state';
```

with:

```ts
import { flag, flattenModule, moduleLength, unflattenModule, vector, type ModuleField, type SimModule } from '../module';
import { shipModule, spaceModule } from '../tactical/hash';
import type { DuelState } from './state';
```

In `src/renderer/src/sim/duel/modules.ts`, replace:

```ts
  { module: spaceModule as SimModule<never>, state: (d) => d.tactical, path: 'tactical' },
  { module: presenceModule as SimModule<never>, state: (d) => d, path: '' },
```

with:

```ts
  { module: spaceModule as SimModule<never>, state: (d) => d.tactical, path: 'tactical' },
  { module: shipModule as SimModule<never>, state: (d) => d.tactical, path: 'tactical' },
  { module: presenceModule as SimModule<never>, state: (d) => d, path: '' },
```

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

```ts
// The duel snapshot (engine refactor spec §6, an R-1 deliverable). The values are exactly flattenDuel: SIM_VERSION, the
// tactical state in flattenTactical's order, presence, repair, then the interior through the sector snapshot path.
// Regenerated, not stored: the map (from the seed, checked by mapHash), the broad-phase grid, the repair points and
```

with:

```ts
// The duel snapshot (engine refactor spec §6, an R-1 deliverable). The values are exactly flattenDuel: SIM_VERSION, the
// tactical state in flattenTactical's order (the space then the ship module), presence, repair, then the interior
// through the sector snapshot path.
// Regenerated, not stored: the map (from the seed, checked by mapHash), the broad-phase grid, the repair points and
```

In `src/renderer/src/sim/duel/snapshot.ts`, replace:

```ts
  if (values[2] !== h.seed) throw new Error('duel snapshot seed does not match its values');
  validateTacticalValues(tactical, values, 1);   // bounds and slot invariants, before anything is allocated
  for (let k = 1 + space; k < interiorAt; k++) {
```

with:

```ts
  if (values[2] !== h.seed) throw new Error('duel snapshot seed does not match its values');
  if (validateTacticalValues(tactical, values, 1) !== 1 + space) throw new Error('duel snapshot tactical length does not match');   // bounds and slot invariants, before anything is allocated
  for (let k = 1 + space; k < interiorAt; k++) {
```

In `src/renderer/src/authority/duelCheckpoint.ts`, replace:

```ts
  if (cp.snapshot.header.seed !== cp.init.seed) throw new Error('inconsistent duel checkpoint seed');
  const ended = cp.snapshot.values[1 + 4] !== 0;   // SIM_VERSION, then the space module's tick, seed, rng.s, asteroid count, outcome
  if (ended !== (cp.phase === 'ended')) throw new Error('inconsistent checkpoint terminal phase');
```

with:

```ts
  if (cp.snapshot.header.seed !== cp.init.seed) throw new Error('inconsistent duel checkpoint seed');
  const ended = cp.snapshot.values[1 + 4] !== 0;   // SIM_VERSION, then the space module's tick, seed, rng.s, asteroid count, outcome (then the slot count)
  if (ended !== (cp.phase === 'ended')) throw new Error('inconsistent checkpoint terminal phase');
```

In `src/renderer/src/authority/duelCheckpoint.ts`, replace:

```ts
  for (const { envelope, result } of cp.recentResults) if (envelope.runId !== cp.init.runId || result.tick > cp.snapshot.header.tick) throw new Error('inconsistent checkpoint cache');
  const t = cp.modeMemory.telemetry, bodies = createTacticalState(cp.init.seed).map.asteroids.length + 2;
  if (t.prev.grace.some((g) => g.length !== bodies) || t.ticks !== cp.snapshot.header.tick) throw new Error('inconsistent duel telemetry');
```

with:

```ts
  for (const { envelope, result } of cp.recentResults) if (envelope.runId !== cp.init.runId || result.tick > cp.snapshot.header.tick) throw new Error('inconsistent checkpoint cache');
  const t = cp.modeMemory.telemetry, bodies = createTacticalState(cp.init.seed).ships[0].graceUntil.length;   // the map's bodies plus the other ship slots
  if (t.prev.grace.some((g) => g.length !== bodies) || t.ticks !== cp.snapshot.header.tick) throw new Error('inconsistent duel telemetry');
```

In `src/renderer/src/sim/tuning.ts`, replace:

```ts
export const O2_K = 6;                         // oxygen diffusion rate (per second, per unit conductance)
export const SIM_VERSION = 37;
export const TELEMETRY_KEEP = 50;   // game-over records kept in localStorage (spec 4-ii section 7)
```

with:

```ts
export const O2_K = 6;                         // oxygen diffusion rate (per second, per unit conductance)
export const SIM_VERSION = 38;
export const TELEMETRY_KEEP = 50;   // game-over records kept in localStorage (spec 4-ii section 7)
```

In `scripts/golden/duelOracle.ts`, replace:

```ts
}
/** The schema migrations, keyed by the baseline's SIM_VERSION. A version with no entry maps every field to itself. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};
```

with:

```ts
}
/** R-2 (37 → 38): a ship's systems fields move from its body (`space.ships.<i>.*`) to its systems record. */
const MOVED_TO_SYSTEMS = /^space\.ships\.(\d+)\.(hull|rooms|shields|shieldClock|laserCharge|laserHold|fireHeld|lock|magazine|magazineClock|shots|laserHits|layersStripped|missilesLaunched|missileHits|missilesLost)$/;
/** The schema migrations, keyed by the baseline's SIM_VERSION. A version with no entry maps every field to itself. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  37: {
    change: 'R-2: N-ship space and the per-ship systems record',
    rename(old) { const m = MOVED_TO_SYSTEMS.exec(old); return m ? `ship.systems.${m[1]}.${m[2]}` : undefined; },
    // The old per-ship missile slot (presence, then the flight) is the pool entry that ship owns, wherever it sits.
    derived: [{
      old: /^space\.missiles\.\d+$/, reads: /^space\.missiles\.\d+\.(active|owner|flight)$/,
      value(old, read, names) {
        const owner = Number(old.split('.')[2]);
        for (const name of names) {
          const k = /^space\.missiles\.(\d+)\.active$/.exec(name)?.[1];
          if (k !== undefined && read(name)[0] === 1 && read(`space.missiles.${k}.owner`)[0] === owner) return [1, ...Array.from(read(`space.missiles.${k}.flight`))];
        }
        return [0, 0, 0, 0, 0, 0, 0, 0];
      }
    }],
    added: [/^space\.ships\.length$/, /^space\.ships\.\d+\.active$/, /^space\.missiles\.\d+\.(active|owner)$/, /^ship\.systems\.\d+\.(cls|target)$/]
  }
};
```

- [ ] **Step 5: Typecheck and run the tests**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npx vitest run tests/tactical tests/duel tests/flightRuntime.test.ts tests/utilityHost.test.ts tests/codecModeWire.test.ts tests/boundary.test.ts`
Expected: FAIL, 1 failed and 446 passed (447 tests in 35 files). The one failure is `tests/duelGolden.test.ts` > "replays the scripted pair at its seed to the recorded hashes": the golden is stored at sim version 37 and the duel's canonical array changed; Task 4 re-blesses it. Every other duel test passes, the gates included.

- [ ] **Step 6: The migration proofs**

Run: `npx tsx scripts/golden/duel-oracle.ts check`
Expected: `duel oracle: 20 runs, 205178 ticks, 304 named fields, results, events and telemetry identical at every tick through the 37 → 38 alias table (R-2: N-ship space and the per-ship systems record), sim version 37 → 38 (baseline HEAD …)`, exit 0. (It fails, naming the first tick and the fields, if any value, result, event or telemetry counter differs, or if a field is unmapped or unaccounted for.)

Run: `npx tsx scripts/golden/canonical-trace.ts check`
Expected: `per-tick canonical trace identical, sim version 37 → 38: golden 7200 ticks, determinism-v2 108000 ticks in 19 runs (baseline HEAD …)`, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/defs.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/physics.ts src/renderer/src/sim/tactical/contacts.ts src/renderer/src/sim/tactical/missiles.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/duel.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/tactical/predict.ts src/renderer/src/render/tactical/missilePath.ts src/renderer/src/sim/duel/modules.ts src/renderer/src/sim/duel/snapshot.ts src/renderer/src/authority/duelCheckpoint.ts src/renderer/src/sim/tuning.ts scripts/golden/duelOracle.ts tests/tacticalSlots.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts tests/tacticalDeterminism.test.ts tests/tacticalFlight.test.ts tests/tacticalMissiles.test.ts tests/tacticalSoloFlight.test.ts tests/duelOracle.test.ts
git commit -q -m "feat(sim): N-ship space, the per-ship systems record and ship and weapon definitions; SIM_VERSION 38 (engine refactor R-2)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 4: The re-bless, the gates and the cross-engine check

**Files:**
- Regenerated by `npm run bless`: `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/fixtures/determinism-v2.json`

**Interfaces:**
- Consumes: Task 3's code at `SIM_VERSION` 38; Task 1's two baselines (both recorded at 37 from this checkout).
- Produces: the pinned artifacts at sim version 38.

- [ ] **Step 1: Bless through the guard**

Run: `npm run bless`
Expected: exit 0 in about 40 s, after the guard re-runs both proofs (the sector trace, then all 20 duel oracle runs through the alias table):

```
blessed tests/golden/basic.json: 120 checkpoints, final 4b43f5e2
blessed tests/golden/duel-1.json: 26 checkpoints, 15772 ticks, outcome 1, final 2ac35cfa
blessed tests/fixtures/determinism-v2.json: sim version 37 → 38, 1800 samples and 404 boundaries unchanged apart from the version and hashes
```

The duel golden keeps its seed, its outcome (a crew win) and its length (15,772 ticks); only its version and hashes change. (Had either proof failed, the guard would have refused and written nothing.)

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: 14531 leaves differ, 0 outside version, digest and hashes`, exit 0.

- [ ] **Step 2: The full suite and the gates**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0.

Run: `npm test`
Expected: every file passes, 3,160 tests in 231 files (master 6a8db43 has 3,144 in 229; the two new test files add 16) (see the known flakes in Global Constraints).

Run: `npx vitest run tests/duelGates.test.ts`
Expected: PASS, 12 tests in 1 file. The gate outcomes are identical to master's: its printed telemetry is exactly these lines (recorded at master 6a8db43; the ten scripted duels, the gate summary, then the ten passive crews):

```
seed 1: 262.9 s, crew win, terminal crew [] enemy [laser]
  crew  laser 43 released, 41 hit (25 stripped), 2 missed; missiles 3 launched, hits W/S/E 0/0/0, lost asteroid 3; contacts planet 0, asteroid 1
  enemy laser 23 released, 23 hit (23 stripped), 0 missed; missiles 8 launched, hits W/S/E 0/1/6, lost edge 1; contacts planet 0, asteroid 9; baits 1
  repairs started/finished P0 0/0, P1 7/7; away walking/repairing P0 0.0/0.0 s, P1 15.2/28.0 s
  helm empty 0.0 s, weapons empty 43.2 s, enemy in arc 6.6 s, weapons idle 25.4 s, console swaps 0
seed 2: 287.9 s, crew win, terminal crew [] enemy [laser]
  crew  laser 46 released, 45 hit (28 stripped), 1 missed; missiles 2 launched, hits W/S/E 0/0/0, lost asteroid 1, expired 1; contacts planet 0, asteroid 0
  enemy laser 28 released, 28 hit (27 stripped), 0 missed; missiles 9 launched, hits W/S/E 0/1/7, lost edge 1; contacts planet 1, asteroid 2; baits 2
  repairs started/finished P0 0/0, P1 9/9; away walking/repairing P0 0.0/0.0 s, P1 20.8/36.0 s
  helm empty 0.0 s, weapons empty 56.8 s, enemy in arc 3.1 s, weapons idle 31.8 s, console swaps 0
seed 3: 239.4 s, crew win, terminal crew [] enemy [laser]
  crew  laser 42 released, 41 hit (24 stripped), 1 missed; missiles 2 launched, hits W/S/E 0/1/0, lost asteroid 1; contacts planet 0, asteroid 0
  enemy laser 18 released, 18 hit (18 stripped), 0 missed; missiles 7 launched, hits W/S/E 0/1/5, lost asteroid 1; contacts planet 0, asteroid 3; baits 1
  repairs started/finished P0 0/0, P1 6/6; away walking/repairing P0 0.0/0.0 s, P1 13.3/24.0 s
  helm empty 0.0 s, weapons empty 37.3 s, enemy in arc 13.2 s, weapons idle 23.7 s, console swaps 0
seed 4: 153.1 s, crew loss, terminal crew [laser] enemy []
  crew  laser 8 released, 3 hit (3 stripped), 5 missed; missiles 2 launched, hits W/S/E 0/0/0, lost asteroid 2; contacts planet 0, asteroid 0
  enemy laser 29 released, 29 hit (15 stripped), 0 missed; missiles 5 launched, hits W/S/E 0/1/3, lost expired 1; contacts planet 1, asteroid 4; baits 0
  repairs started/finished P0 3/2, P1 11/14; away walking/repairing P0 15.5/8.4 s, P1 38.4/56.0 s
  helm empty 23.9 s, weapons empty 94.4 s, enemy in arc 16.0 s, weapons idle 7.2 s, console swaps 0
seed 5: 226.6 s, crew win, terminal crew [] enemy [laser]
  crew  laser 41 released, 40 hit (23 stripped), 1 missed; missiles 1 launched, hits W/S/E 0/0/0, lost asteroid 1; contacts planet 0, asteroid 0
  enemy laser 20 released, 20 hit (20 stripped), 0 missed; missiles 7 launched, hits W/S/E 0/0/5, lost asteroid 2; contacts planet 1, asteroid 3; baits 1
  repairs started/finished P0 0/0, P1 5/5; away walking/repairing P0 0.0/0.0 s, P1 9.6/20.0 s
  helm empty 0.0 s, weapons empty 29.6 s, enemy in arc 5.4 s, weapons idle 25.7 s, console swaps 0
seed 6: 289.6 s, crew win, terminal crew [] enemy [laser]
  crew  laser 48 released, 47 hit (28 stripped), 1 missed; missiles 2 launched, hits W/S/E 0/0/0, lost asteroid 2; contacts planet 0, asteroid 0
  enemy laser 25 released, 25 hit (25 stripped), 0 missed; missiles 9 launched, hits W/S/E 0/3/5, lost expired 1; contacts planet 0, asteroid 3; baits 1
  repairs started/finished P0 0/0, P1 8/8; away walking/repairing P0 0.0/0.0 s, P1 20.6/32.0 s
  helm empty 0.0 s, weapons empty 52.6 s, enemy in arc 7.0 s, weapons idle 31.6 s, console swaps 0
seed 7: 147.2 s, crew loss, terminal crew [missile] enemy []
  crew  laser 11 released, 2 hit (2 stripped), 9 missed; missiles 2 launched, hits W/S/E 0/0/0, lost asteroid 2; contacts planet 0, asteroid 0
  enemy laser 28 released, 28 hit (16 stripped), 0 missed; missiles 5 launched, hits W/S/E 0/1/4, lost none; contacts planet 0, asteroid 6; baits 2
  repairs started/finished P0 7/7, P1 9/9; away walking/repairing P0 41.3/28.0 s, P1 31.3/36.0 s
  helm empty 69.3 s, weapons empty 67.3 s, enemy in arc 0.1 s, weapons idle 21.7 s, console swaps 0
seed 8: 306.9 s, crew win, terminal crew [] enemy [laser]
  crew  laser 50 released, 48 hit (30 stripped), 2 missed; missiles 2 launched, hits W/S/E 0/0/0, lost asteroid 2; contacts planet 0, asteroid 1
  enemy laser 31 released, 31 hit (30 stripped), 0 missed; missiles 10 launched, hits W/S/E 0/0/9, lost edge 1; contacts planet 0, asteroid 3; baits 0
  repairs started/finished P0 0/0, P1 10/10; away walking/repairing P0 0.0/0.0 s, P1 20.9/40.0 s
  helm empty 0.0 s, weapons empty 60.9 s, enemy in arc 14.0 s, weapons idle 33.9 s, console swaps 0
seed 9: 279.3 s, crew win, terminal crew [] enemy [laser]
  crew  laser 47 released, 46 hit (28 stripped), 1 missed; missiles 2 launched, hits W/S/E 0/0/0, lost asteroid 1, expired 1; contacts planet 0, asteroid 0
  enemy laser 25 released, 25 hit (25 stripped), 0 missed; missiles 9 launched, hits W/S/E 1/1/6, lost expired 1; contacts planet 0, asteroid 4; baits 2
  repairs started/finished P0 0/0, P1 8/8; away walking/repairing P0 0.0/0.0 s, P1 15.2/32.0 s
  helm empty 0.0 s, weapons empty 47.2 s, enemy in arc 28.6 s, weapons idle 28.2 s, console swaps 0
seed 10: 167.3 s, crew loss, terminal crew [missile] enemy []
  crew  laser 10 released, 2 hit (2 stripped), 8 missed; missiles 4 launched, hits W/S/E 0/0/0, lost asteroid 4; contacts planet 0, asteroid 0
  enemy laser 28 released, 28 hit (15 stripped), 0 missed; missiles 5 launched, hits W/S/E 0/1/4, lost none; contacts planet 0, asteroid 13; baits 1
  repairs started/finished P0 5/5, P1 12/11; away walking/repairing P0 30.1/20.0 s, P1 39.0/46.4 s
  helm empty 50.1 s, weapons empty 85.4 s, enemy in arc 10.1 s, weapons idle 13.3 s, console swaps 0
median length 251.2 s (gate 180 to 300)
crew wins 7, crew losses 3, draws 0, at the cap 0 (gate: a win and a loss, none at the cap)
seed 1: passive crew 88.5 s, lost
seed 2: passive crew 103.1 s, lost
seed 3: passive crew 113.0 s, lost
seed 4: passive crew 108.8 s, lost
seed 5: passive crew 107.0 s, lost
seed 6: passive crew 108.4 s, lost
seed 7: passive crew 106.7 s, lost
seed 8: passive crew 102.8 s, lost
seed 9: passive crew 120.8 s, lost
seed 10: passive crew 100.3 s, lost
```

- [ ] **Step 3: The cross-engine determinism check**

Run: `npm run test:determinism -- --output-dir=out/r2-determinism`
Expected: exit 0, with `1800 canonical samples, 404 result/event boundaries PASS` for Node and `1800 samples PASS` for Electron (and Firefox where it is installed). The output-dir flag sends the evidence logs to the git-ignored out/ folder.

- [ ] **Step 4: Commit**

```bash
git add tests/golden/basic.json tests/golden/duel-1.json tests/fixtures/determinism-v2.json
git commit -q -m "chore(golden): re-bless at SIM_VERSION 38 through the duel migration oracle and the sector version-only check (engine refactor R-2)"
```

(End the message with your session's Co-Authored-By trailer.)

---

## After R-2

- **R-2 is complete:** the tactical layer holds ship slots, a missile pool and a target index; each slot has a systems record in the `ship` module; ship classes and weapons are definitions; the duel's rules and outcomes are unchanged, proved per tick and re-blessed at sim version 38.
- **Every later `SIM_VERSION` bump records two baselines first:** `canonical-trace.ts baseline` and `duel-oracle.ts baseline`. The guard re-runs both proofs; a bump that changes the duel's schema adds its `MIGRATIONS` entry (R-3 adds a dropped list for the fields it removes).
- **R-2b** (the full interior link) changes gameplay: interior power drives shields and engines, and repair acts on the systems record the fight uses. It brings new expected outcomes (gates re-run, the duel golden re-blessed, the owner's playtest), not a migration proof.
- **R-5** fills further slots: a real enemy ShipState, a hunter brain per ship, boarding.
