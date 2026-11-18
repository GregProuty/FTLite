# Valkyrn Part i: the sim (classes, crew of one, mouse aim, the minigun) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the duel sim everything the Valkyrn needs and nothing that changes the Hound: two new ship classes (the gun Valkyrn and its laser fit) with a nullable laser slot, a crew of one with a combined Flight seat, the layout fields that carry the class, crew and unattended-Helm rule, mouse aim on the held wire, the out-of-seat flight rule, and the minigun (firing, heat, rounds, hits, room by closest approach, wear, hostility, events, hash, snapshot and validator), with the online view and telemetry reading the new counters.

**Architecture:** Data, not branches (spec §3): every new behaviour reads a class slot (`slots.gun`, `slots.laser === null`) or a layout field (`crew`, `shipClass`, `helmHoldsUnattended`). SIM_VERSION goes 52 → 53 as a version-only, blessed step first (Task 1). One oracle and trace baseline is then recorded at 53 (Task 2 Step 1) and every later task proves against it: Tasks 2 to 4 add no hashed field and prove `same`; Task 5 adds the hashed gun fields and the round pool, proves with a new same-version oracle mode `added` (every old field identical at every tick, the new fields declared added) and blesses at 53; Tasks 6 and 7 change only Valkyrn behaviour and prove `added`; Task 8 re-proves end to end and runs every gate.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, zod 3 (wire, checkpoint, replay), the deterministic duel sim (`sim/duel/*`, `sim/tactical/*`), the golden scripts under `scripts/golden/`.

**Spec:** `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md` §3.1, §4.4, §5 (the seat rule), §6, §7.1 to §7.3, §8 (the laser-fit class), §10 (sim tests). Shared names: the Valkyrn contract (`valkyrn-contract.md`, handed to every part). Format precedent: `docs/superpowers/plans/2026-11-18-sci-2-crew-of-four.md`. Parts ii (ship, app, views) and iii (scripted pilot gate, tuning) are separate plans executed after this one on the same branch.

**Branch and worktree:** all work happens in the git worktree `.worktrees/valkyrn` on branch `valkyrn`, made from master **after Sci-2 merges**. The controller creates it with its junctions (`node_modules`, `services\signalling\node_modules`, `.art`, `public\assets\paid`); executors do not. Every command runs from the worktree root `C:\Users\djuar\FTLite\.worktrees\valkyrn`. The oracle and trace baselines check their `cwd`, so record them in this worktree.

## Global Constraints

- **Version (contract "Version"):** Part i owns SIM_VERSION **52 → 53**.
  1. Record baselines at 52 (`npx tsx scripts/golden/canonical-trace.ts baseline`, `npx tsx scripts/golden/duel-oracle.ts baseline`).
  2. Bump the version alone and run `npm run bless`.
  3. After the hash-moving sim changes, re-record the baselines at 53 first (Task 2 Step 1, before any of them), then run a same-version `npm run bless` (Task 5).
  4. Prove with the oracle/trace that tick counts and outcomes are unchanged and only hashes moved (`same` / `added` in every task, the golden diff in Tasks 5 and 8).
  - Never pass `--fresh`; never hand-edit goldens. Hound (and Cutter) runs keep the same tick counts, outcomes and duelGates numbers. `tests/duelGates.test.ts` bands are never edited.
  - **Do not re-record the baselines between Task 2 Step 1 and Task 8 Step 4.** Every proof in Tasks 2 to 8 compares against that one recording. If the temp folder was cleared, stop and report: the chain of proofs is broken.
- **Generated files come only from `npm run bless`:** `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`.
- **Exact names and values (contract, binding):**
  - `sim/tactical/tuning.ts`: `GUN_INTERVAL_TICKS = 6`, `GUN_SPEED = 700`, `GUN_LIFE_TICKS = 52`, `GUN_MUZZLE_LATERAL = 12`; `GUN_HEAT_PER_SHOT = 50`, `GUN_COOL = 4`, `GUN_COOL_LOCKED = 8`, `GUN_HEAT_MAX = 1000`; `GUN_POOL = 64`; `GUN_HITS_PER_LAYER = 8`, `GUN_HITS_PER_HULL = 3`, `GUN_HITS_PER_LEVEL = 6`; `VALKYRN_HULL = 30`, `VALKYRN_THRUST = 160`, `VALKYRN_TURN_DEG_PER_S = 200`.
  - `sim/tactical/defs.ts`: `interface GunDef { kind:'gun'; intervalTicks; speed; lifeTicks; muzzleForward /* radius+1 */; muzzleLateral; heatPerShot; cool; coolLocked; heatMax; hitsPerLayer; hitsPerHull; hitsPerLevel }`; `ShipClassDef.slots: { laser: LaserDef | null; gun: GunDef | null; missile: MissileDef }`; `export const GUN: GunDef`; `VALKYRN_CLASS` (id `'valkyrn'`); `VALKYRN_LASER_CLASS` (id `'valkyrnLaser'`); `SHIP_CLASSES = [Cutter, Hunter, Valkyrn, ValkyrnLaser]`; `ShipClass = { Cutter:0, Hunter:1, Valkyrn:2, ValkyrnLaser:3 }`; `classIndexById(id: string): number` (throws on unknown); an assertion at module load that every class has `turnStepsPerTick < 3`.
  - `sim/tactical/state.ts`: `createTacticalState(seed, slots = DUEL_CLASSES.length, crewClass = ShipClass.Cutter)`; `ShipSystems` gains `gunHeat, gunLocked (boolean), gunCooldown, gunMuzzle, gunWear, gunHull, gunRoomWear: [number,number,number], gunShots, gunHits`, all zero in `systemsFor`; `TacticalState.rounds: GunRound[]` (length GUN_POOL), `interface GunRound { x; y; vx; vy; age; owner; active }` (a free entry holds zeros); event kinds `{ kind:'gunFire'; ship; muzzle }` and `{ kind:'gunHit'; ship /*target*/; room /* -1 shield */; x; y }` (plus `stripped`, Decision 2); the hostile cause union gains `'gun'`.
  - `sim/tactical/gun.ts` (new): `tickGun(state, i, input)`, `stepRounds(state)`, `gunRoomOf(state, target, ox, oy, nx, ny): 0|1|2`.
  - `ShipInput` (tactical) gains `gunHeld: boolean`. `net/contracts.ts` `HeldInput` gains `aim?: number` and `gunHeld?: boolean`, carried by the codec, checkpoints and replay schemas like `face`.
  - `sim/duel/step.ts`: `helmTurn` order A/D, face, aim, held heading; `aimTurn(heading, aim)` with the band |d| ≤ 1; after the axes, the clear-then-set rule for `holdHeading`; the unattended rule when `layout.helmHoldsUnattended`.
  - `sim/ship/schema.ts` optional layout fields: `shipClass?: string`, `crew?: 1|2|3|4`, `helmHoldsUnattended?: boolean`, `hull?: 'hound'|'scout'|'valkyrn'`. The combined Navigation+Weapons group is allowed when the crew is 1.
  - `sim/duel/state.ts`: `createDuel(layout, seed, helmPlayer = 0, crew = 2, cls?: number)`, crew 1..4 locally; `LOCAL_CREW_MIN = 1` (online keeps `DUEL_CREW_MIN` 2); `DuelState.crewClass: number`; the layout's `crew` must equal the crew argument when set. `startRound` and `loadDuelSnapshot` pass `crewClass`; the snapshot header gains `crewClass`, its `playerCount` range becomes 1..4; `systems[0].cls === crewClass` is validated.
  - Telemetry counters `gunShots`/`gunHits` (ShipSystems, hashed); the online `gapEvents` derives gun hits from `gunHits`.
- **Hound unchanged:** the Hound (Cutter class, no `shipClass`/`crew`/`helmHoldsUnattended` fields) has no gun and `helmHoldsUnattended` false; its runs move only in hashes (Task 5's new hashed fields).
- **Sim rules:** only + − × ÷ and sqrt in the sim (the determinism guard, `tests/helpers/determinismGuard.ts` allows `Math.abs/ceil/floor/round/min/max/sign/imul/sqrt`). No trig. No `'hound'`, `'cutter'`, `'valkyrn'`, `'valkyrnLaser'`, `'scout'` literal in `src/renderer/src/**/*.{ts,tsx}` outside spec §3.2's allowed files (`sim/tactical/defs.ts`, `sim/ship/fleet.ts`, …): Part ii adds the test that enforces it, so Part i obeys it now.
- **Git:** never `git add -A`, `git add .` or `git stash`; stage by name. Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (passed as a second `-m`). Files are UTF-8.
- **Test commands:** targeted `npx vitest run <files>`; `npx tsc -b`; the full suite `npx vitest run --maxWorkers=4`, always after `npx electron-vite build`; `npm run test:duel-app-runtime` (Task 8). Never run two vitest processes at once. `tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts` and `tests/gate-*.test.ts` can time out under load: rerun a failing one alone before calling it a failure.
- **Comments:** a header comment citing the spec section on each new file; doc comments on exports; cite "Valkyrn spec §x" on changed lines that need a reason.

## Decisions where the spec leaves room, and where the code forces a choice

Line numbers below were verified against branch `sci-2` at `d06b64b1` plus its Task 3 working tree (the post-Sci-2 shape). After Sci-2 merges they may shift by a few lines: **match every edit by the quoted text**, not the number.

1. **The proof chain (contract steps 3 and 4).** The oracle's `same` mode refuses a new field (`scripts/golden/duelOracle.ts:181`, "new field … is neither mapped nor declared added", with no migration at `:345`), and `check` needs the version to be the baseline's plus 1 (`:342`), so neither proves Task 5's added fields at 53. Task 5 adds a third mode, `added`: same version, the old fields mapped to themselves, the new ones matched against `ADDITIONS[53]`, every run identical at every tick (values, results, events, telemetry), and every declared-added field holding its first recorded value at every tick (`frozen`: no oracle run has a gun, so a run that moved a gun field or a round would be a bug the old fields cannot show). It is the stricter `same` plus a declared list, as `MIGRATIONS` is for a bump (`:87-113`). One baseline (Task 2 Step 1) serves Tasks 2 to 8.
2. **The event union is `DuelEvent`** (`sim/tactical/state.ts:101`), not `TacticalEvent` as the contract says; the two kinds join it under that name (no rename). **`gunHit` also carries `stripped: boolean`:** spec §7.2 says a gun strip makes "the same `stripped` event a laser strip makes", but §10 says the gun Valkyrn "never emits a `laser` event"; a flag on `gunHit` is the only way to satisfy both, and the view's shield pop (Part ii) reads it.
3. **A Valkyrn-shaped test layout.** The Valkyrn JSON arrives in Part ii, so Part i's tests use `tests/helpers/valkyrnDuel.ts`: a copy of the Hound with `shipClass:'valkyrn'`, `crew:1`, `helmHoldsUnattended:true`, `hull:'valkyrn'`, and the Weapons station moved onto the Navigation tile (20,7) in a second console group `[navigation, weapons]`. It keeps the id `'hound'` because the repair points are keyed by layout id (`sim/duel/tuning.ts:24`, read at `sim/duel/state.ts:91`); every cache is keyed by the layout object, and its layout hash differs from the Hound's.
4. **`crewClass` is not a second hashed field.** `systems.0.cls` is already hashed and snapshotted (`sim/tactical/hash.ts:20`) and is validated equal to the header's `crewClass`; a new duel-module field would shift every snapshot offset (`sim/duel/snapshot.ts:107`, `:144`). `crewClass` joins `DUEL_NOT_SNAPSHOTTED` (`sim/duel/modules.ts:92-98`) with that reason.
5. **The layout hash** covers `shipClass`, `crew` and `helmHoldsUnattended` only when present (the precedent of airlocks, the magazine and console groups, `sim/ship/derived.ts:76-79`), so the Hound keeps its hash; `hull` is view data and is left out.
6. **`HULL_IDS` lives in `sim/ship/fleet.ts`** (an allowed file of spec §3.2), so `schema.ts` carries no id literal; Part ii's `HullId` can be `(typeof HULL_IDS)[number]`.
7. **Gun cooling at Weapons level 2.** The spec says level 1 halves the coolings and level 2 stops fire, and is silent on level 2's cooling; this plan halves at level ≥ 1, so repairing 2 → 1 never changes the cooling rate. `defs.ts` asserts both coolings are even (integer halves 2 and 4).
8. **Where the gun runs.** `tickGun` runs inside `applyWeaponsInput` right after the burst step and before the unattended early return (`sim/tactical/weapons.ts:128-129`), so heat and cooldown tick every tick and a round fires from the pre-move pose. `stepRounds` runs after `resolveMissiles` (`sim/tactical/duel.ts:234`), before the weapon clocks.
9. **First contact along a segment** is the smallest entry parameter; ties go ship, then asteroids (ascending), then the planet; a segment starting inside a circle hits at t = 0. Rounds have no edge end (their life ends them).
10. **Counters.** `gunHits` (the shooter's) counts every hit, shield or hull. A gun strip does not touch `layersStripped`, a laser counter the online view spends on laser strips (`app/duel/onlineSource.ts:69`).
11. **View readers of `slots.laser`** get type-only guards in Task 2 that keep the Hound's output (the `tsc -b` gate needs them); Part ii does the real Flight treatment: `render/duel/consoleModel.ts:90`, `render/duel/contactModel.ts:180`, `render/duel/situationModel.ts:41`, `render/tactical/hitModel.ts:29`. The sim, hash and telemetry readers (`state.ts:155`, `weapons.ts:35,70,92,100,114,150`, `hunter.ts:71`, `hash.ts:195-196`, `duel/telemetry.ts:105`) are fixed here.
12. **The laser commands' refusal order:** stale-tick, then the Weapons seat, then `unavailable` for a class without a laser (`sim/duel/step.ts:195-196`, `:228-229`), then the existing checks.
13. **The unattended Helm** sets the crew input's `helm` true with the throttle and held-heading axes: `stepDuel` flies a ship's axes only when `helm` (`sim/tactical/duel.ts:231`). `weapons` stays the attendant rule (auto-fire needs the seat, spec §4.4).
14. **Telemetry:** the terminal cause `'gun'` sits after `'laser'` in `TERMINAL_CAUSES` (`sim/duel/summary.ts:9`); the checkpoint, codec and record enums derive from it.
15. **Online `gapEvents`:** a `gunHits` increment draws a `gunHit` at the target with `room −1` and `stripped false` (the snapshot carries neither).
16. **A local crew of 1 on the Hound** is legal for `createDuel` (spec §4.4: 1..4 locally); the Hound stays 2..4 through its callers. The two Sci-2 tests that pin "crew 1 throws" move to 0 (Task 3 Step 2). Online (`duelCheckpoint.ts` `crewList`, the init's `playerCount` union) keeps 2..4. Spec §4.4's single-player `DuelInit.playerCount` 1..4 is moot: no local path builds a `DuelInit` (the local runtime, `app/duel/runtime.ts`, calls `createDuel` directly; `DuelInit` is built and parsed only by the online checkpoint path), so the one `DuelInit` schema stays 2..4 and is not widened.
17. **The aim on the wire** is an integer −1..255 (anything else is refused by the codecs); in the sim (`heldAim`) any other value counts as −1, for in-process callers.
18. **The Flight seat at a crew of one** needs no new seat rule: sitting at a console group seats the character at every member (`sim/stations.ts:31-38`), so `attendant(d, d.nav)` and `attendant(d, d.weapons)` are both the pilot.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/renderer/src/sim/tuning.ts` | modify (T1) | SIM_VERSION 53 |
| `src/renderer/src/sim/tactical/tuning.ts` | modify (T2) | the gun and Valkyrn constants |
| `src/renderer/src/sim/tactical/defs.ts` | modify (T2) | `GunDef`, `GUN`, nullable slots, the two classes, `classIndexById`, the turn and cooling assertions |
| `src/renderer/src/sim/tactical/state.ts` | modify (T2, T5) | `createTacticalState(…, crewClass)`; gun fields, `GunRound`, `rounds`, the events |
| `src/renderer/src/sim/tactical/weapons.ts` | modify (T2, T4, T5, T6) | null-laser guards; `ShipInput.gunHeld`; `tickGun` call; a strip zeroes `gunWear` |
| `src/renderer/src/sim/tactical/hash.ts` | modify (T2, T5) | maxima over non-null slots; gun fields, the round pool, validator, clone |
| `src/renderer/src/sim/tactical/gun.ts` | create (T5), modify (T6) | `tickGun`, `placeRound`; `stepRounds`, `gunRoomOf`, hits |
| `src/renderer/src/sim/tactical/hunter.ts` | modify (T2, T4, T6) | laser range guard; `gunHeld`; repair zeroes wear |
| `src/renderer/src/sim/tactical/duel.ts`, `science.ts` | modify (T6) | `stepRounds` in the step; hostility cause `gun` |
| `src/renderer/src/sim/ship/schema.ts`, `derived.ts`, `fleet.ts` | modify (T3) | the four layout fields, their hash, `HULL_IDS` |
| `src/renderer/src/sim/duel/state.ts`, `snapshot.ts`, `modules.ts` | modify (T3) | crew 1, `cls`, `crewClass`, the combined seat, the header |
| `src/renderer/src/sim/duel/step.ts` | modify (T3, T4, T6) | laser commands `unavailable`; aim, unattended Helm, `gunHeld`; repair zeroes wear |
| `src/renderer/src/sim/duel/telemetry.ts`, `summary.ts` | modify (T2, T7) | null-laser guard; terminal cause `gun` |
| `src/renderer/src/net/contracts.ts`, `net/codec.ts` | modify (T3, T4) | header `crewClass`; `aim`, `gunHeld` |
| `src/renderer/src/authority/checkpoint.ts`, `duelCheckpoint.ts`, `replay.ts`, `core.ts` | modify (T4) | `aim`, `gunHeld` in held schemas; expiry and pause clear them |
| `src/renderer/src/app/duel/onlineSource.ts` | modify (T7) | `gunHits` in the counters, gun hits in `gapEvents` |
| `src/renderer/src/render/duel/consoleModel.ts`, `contactModel.ts`, `situationModel.ts`, `render/tactical/hitModel.ts` | modify (T2) | type-only null-laser guards (Decision 11) |
| `scripts/golden/duelOracle.ts`, `duel-oracle.ts` | modify (T5) | `ADDITIONS`, the `added` mode |
| `tests/helpers/valkyrnDuel.ts` | create (T3) | the Valkyrn-shaped layout and duel helpers |
| `tests/valkyrnClasses.test.ts` (T2), `valkyrnCrew.test.ts` (T3), `valkyrnFlight.test.ts` (T4), `valkyrnGun.test.ts` (T5), `valkyrnRounds.test.ts` (T6), `valkyrnOnline.test.ts` (T7) | create | the new behaviour, one file per task |
| `tests/tacticalSlots.test.ts`, `weaponsUpdate.test.ts`, `contactModel.test.ts`, `duelHitFeedback.test.ts` (T2); `duelSnapshot.test.ts`, `crewOfFour.test.ts`, `crewOfFourWire.test.ts` (T3); `duelModules.test.ts`, `tacticalDeterminism.test.ts`, `duelOracle.test.ts` (T5) | modify | the existing tests the new shapes touch |

---

### Task 1: Pre-flight, then SIM_VERSION 52 → 53 alone, blessed

**Files:**
- Modify: `src/renderer/src/sim/tuning.ts:7`
- Regenerated by `npm run bless`: `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, `tests/fixtures/determinism-v2.json`

**Interfaces:**
- Consumes: Sci-2 on master.
- Produces: `SIM_VERSION === 53` for every later task.

- [ ] **Step 1: Pre-flight: Sci-2 is on master in the shape this plan is written against**

Run each; every one must print the line shown (a `git grep` hit), else **stop and report** (Sci-2 has not merged, or changed shape):

```bash
git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts
# src/renderer/src/sim/tuning.ts:7:export const SIM_VERSION = 52;
git grep -n "export const DUEL_CREW_MIN = 2, DUEL_CREW_MAX = 4;" -- src/renderer/src/sim/duel/state.ts
git grep -n "export type DuelCrew = 2 | 3 | 4;" -- src/renderer/src/sim/duel/state.ts
git grep -n "export function createDuel(layout: ShipLayout, seed: number, helmPlayer = 0, crew: number = DUEL_CREW_MIN): DuelState {" -- src/renderer/src/sim/duel/state.ts
git grep -n "present: boolean\[\];" -- src/renderer/src/sim/duel/state.ts
git grep -n "playerCount: d.interior.playerCount," -- src/renderer/src/sim/duel/snapshot.ts
git grep -n "const crewList = " -- src/renderer/src/authority/duelCheckpoint.ts
git ls-files tests/crewOfFour.test.ts tests/crewOfFourWire.test.ts
# both paths listed
git grep -n "DUEL_PLAYERS" -- src tests scripts
# prints nothing
```

- [ ] **Step 2: Record both baselines at SIM_VERSION 52**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 52: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to <temp>\trace.json`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version 52: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0. Note `<R>`, `<T>`, `<F>`.

- [ ] **Step 3: The version**

`src/renderer/src/sim/tuning.ts` line 7 becomes:

```ts
export const SIM_VERSION = 53;
```

Nothing else in `src/` changes in this task; `MIGRATIONS` in `scripts/golden/duelOracle.ts` is not touched.

- [ ] **Step 4: Both proofs before the bless**

Run: `npx tsx scripts/golden/canonical-trace.ts check`
Expected: `per-tick canonical trace identical, sim version 52 → 53: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <sha>)`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts check`
Expected: `duel oracle: <R> runs, <T> ticks, <F> named fields, results, events and telemetry identical at every tick field for field, sim version 52 → 53 (baseline HEAD <sha>)`, exit 0, with Step 2's numbers.

- [ ] **Step 5: Bless, then check the sector golden**

Run: `npm run bless`
Expected, exit 0 (new hashes; the counts, ticks and outcomes are master's):
```
blessed tests/golden/basic.json: 120 checkpoints, final <hex>
blessed tests/golden/duel-1.json: 30 checkpoints, 18155 ticks, outcome 1, final <hex>
blessed tests/fixtures/determinism-v2.json: sim version 52 → 53, <n> samples and <m> boundaries unchanged apart from the version and hashes
blessed tests/golden/duel-rematch.json: 55 checkpoints, rematch on tick 18155, rounds 18155 ticks outcome 1 then 15320 ticks outcome 1, final <hex>
```
Write these four lines down: Tasks 5 and 8 compare against them.

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

- [ ] **Step 6: The duel suites, then the full suite at 53**

Run: `npx vitest run tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/duelGates.test.ts tests/duelOracle.test.ts tests/golden.test.ts tests/duelCheckpoint.test.ts tests/duelSnapshot.test.ts`
Expected: PASS.

Run: `npx tsc -b`, then `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: no type errors; the build succeeds; every test file PASS.

- [ ] **Step 7: Commit**

`git status --short` lists exactly the five files below as modified.

```bash
git add src/renderer/src/sim/tuning.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json
git commit -m "chore(valkyrn): SIM_VERSION 52 -> 53 alone, blessed (canonical trace and duel oracle prove every run unchanged per tick)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The two Valkyrn classes, the gun's definition, the nullable laser slot and the crew slot's class

**Files:**
- Modify: `src/renderer/src/sim/tactical/tuning.ts` (append), `src/renderer/src/sim/tactical/defs.ts` (whole file below), `src/renderer/src/sim/tactical/state.ts` (`systemsFor`, `createTacticalState`, imports), `src/renderer/src/sim/tactical/weapons.ts` (`laserFull`, `laserEligible`, `shoot`, `fireLaser`, `stepBurst`, `applyWeaponsInput`, `tickWeapons`), `src/renderer/src/sim/tactical/hunter.ts:71`, `src/renderer/src/sim/tactical/hash.ts:186,195-196` (and an import), `src/renderer/src/sim/duel/telemetry.ts:105`
- Modify (type-only guards, Decision 11): `src/renderer/src/render/duel/consoleModel.ts:90`, `src/renderer/src/render/duel/contactModel.ts:180`, `src/renderer/src/render/duel/situationModel.ts:41`, `src/renderer/src/render/tactical/hitModel.ts:29`
- Modify (tests the new shapes touch): `tests/tacticalSlots.test.ts:5,36-38`, `tests/weaponsUpdate.test.ts:45,46,100`, `tests/contactModel.test.ts:74`, `tests/duelHitFeedback.test.ts:24`
- Create: `tests/valkyrnClasses.test.ts`

**Interfaces:**
- Consumes: Task 1's SIM_VERSION 53.
- Produces:
  ```ts
  // sim/tactical/tuning.ts: the GUN_* and VALKYRN_* constants (Global Constraints) and VALKYRN_TURN_STEPS_PER_TICK
  // sim/tactical/defs.ts
  export interface GunDef { kind: 'gun'; intervalTicks; speed; lifeTicks; muzzleForward; muzzleLateral; heatPerShot; cool; coolLocked; heatMax; hitsPerLayer; hitsPerHull; hitsPerLevel }
  export const GUN: GunDef; export const VALKYRN_CLASS: ShipClassDef; export const VALKYRN_LASER_CLASS: ShipClassDef;
  export const ShipClass = { Cutter: 0, Hunter: 1, Valkyrn: 2, ValkyrnLaser: 3 } as const;
  export function classIndexById(id: string): number;
  // ShipClassDef.slots: { laser: LaserDef | null; gun: GunDef | null; missile: MissileDef }
  // sim/tactical/state.ts
  export function createTacticalState(seed: number, slots?: number, crewClass?: number): TacticalState;   // throws 'invalid crew ship class'
  ```

- [ ] **Step 1: Baselines at 53 (the one recording every later proof uses)**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline` — Expected: `baseline at sim version 53: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to <temp>\trace.json`, exit 0.
Run: `npx tsx scripts/golden/duel-oracle.ts baseline` — Expected: `duel oracle baseline at sim version 53: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0.

- [ ] **Step 2: Write the failing test**

Create `tests/valkyrnClasses.test.ts`:

```ts
// Valkyrn-i (spec 2026-11-18-valkyrn-solo-ship-design §6.1, §7.1, §10 Class and Null laser): the Valkyrn's two ship
// classes appended to SHIP_CLASSES (the gun Valkyrn and its laser fit), the gun's definition, the crew slot's class in
// createTacticalState, and a null laser slot: no charge, no target, no laser event, and the hash validator's laser
// maxima taken over the classes that have one, so a Hound snapshot and checkpoint still validate.
import { describe, expect, it } from 'vitest';
import { validateDuelCheckpoint, type DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { classIndexById, CUTTER_CLASS, GUN, HUNTER_CLASS, LASER, MISSILE, SHIP_CLASSES, ShipClass, VALKYRN_CLASS, VALKYRN_LASER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { buildGrid } from '../src/renderer/src/sim/tactical/grid';
import { flattenTactical, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { createTacticalState, Outcome, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { DT, GUN_POOL, HEADING_COUNT, SHIP_RADIUS, VALKYRN_HULL, VALKYRN_THRUST, VALKYRN_TURN_DEG_PER_S } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT, laserEligible, laserFull } from '../src/renderer/src/sim/tactical/weapons';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { makeHostile } from './helpers/hostile';
import { liveDuel } from './helpers/liveDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
/** The crew ship of class `cls` at (−600, −300) facing east at the enemy 300 units away (facing west at it), hostile,
 *  no asteroids: inside the Cutter laser's arc and range. */
function facing(cls: number): TacticalState {
  const st = makeHostile(createTacticalState(5, 2, cls));
  st.map = { ...st.map, asteroids: [] }; st.grid = buildGrid([], st.map.rMap);
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  return st;
}

describe('the Valkyrn classes (spec §6.1)', () => {
  it('appends the gun Valkyrn and its laser fit, so the Cutter and Hunter indices do not move', () => {
    expect(SHIP_CLASSES).toEqual([CUTTER_CLASS, HUNTER_CLASS, VALKYRN_CLASS, VALKYRN_LASER_CLASS]);
    expect(ShipClass).toEqual({ Cutter: 0, Hunter: 1, Valkyrn: 2, ValkyrnLaser: 3 });
    expect(SHIP_CLASSES.map((c) => c.id)).toEqual(['cutter', 'hunter', 'valkyrn', 'valkyrnLaser']);
    expect(['cutter', 'hunter', 'valkyrn', 'valkyrnLaser'].map(classIndexById)).toEqual([0, 1, 2, 3]);
    expect(() => classIndexById('skiff')).toThrow(/unknown ship class skiff/);
  });
  it('the Valkyrn: hull 30, thrust 160, 200°/s, the gun and the torpedo, no laser; the laser fit has the Cutter\'s laser and no gun', () => {
    expect([VALKYRN_HULL, VALKYRN_THRUST, VALKYRN_TURN_DEG_PER_S]).toEqual([30, 160, 200]);
    expect(VALKYRN_CLASS).toMatchObject({ id: 'valkyrn', ai: 'crew', hull: 30, thrust: 160, radius: SHIP_RADIUS, turnStepsPerTick: (VALKYRN_TURN_DEG_PER_S / 360) * HEADING_COUNT * DT });
    expect(VALKYRN_CLASS.slots).toEqual({ laser: null, gun: GUN, missile: MISSILE });
    expect(VALKYRN_LASER_CLASS).toMatchObject({ id: 'valkyrnLaser', ai: 'crew', hull: 30, thrust: 160, turnStepsPerTick: VALKYRN_CLASS.turnStepsPerTick });
    expect(VALKYRN_LASER_CLASS.slots).toEqual({ laser: LASER, gun: null, missile: MISSILE });
    expect([CUTTER_CLASS.slots.gun, HUNTER_CLASS.slots.gun]).toEqual([null, null]);
    expect(VALKYRN_CLASS.shields).toEqual(CUTTER_CLASS.shields);
    for (const c of SHIP_CLASSES) expect(c.turnStepsPerTick, c.id).toBeLessThan(3);   // spec §6.2: the aim band is three indices
  });
  it('the gun\'s numbers are the tuning constants', () => {
    expect(GUN).toEqual({ kind: 'gun', intervalTicks: 6, speed: 700, lifeTicks: 52, muzzleForward: SHIP_RADIUS + 1, muzzleLateral: 12,
      heatPerShot: 50, cool: 4, coolLocked: 8, heatMax: 1000, hitsPerLayer: 8, hitsPerHull: 3, hitsPerLevel: 6 });
    expect(GUN_POOL).toBe(64);
  });
});

describe('the crew slot\'s class (spec §6.1)', () => {
  it('createTacticalState takes it (default the Cutter); the Hunter\'s slot is unchanged; it must be a crew class', () => {
    const cutter = createTacticalState(5), valkyrn = createTacticalState(5, 2, ShipClass.Valkyrn), fit = createTacticalState(5, 2, ShipClass.ValkyrnLaser);
    expect([cutter.systems[0].cls, valkyrn.systems[0].cls, fit.systems[0].cls]).toEqual([0, 2, 3]);
    expect([valkyrn.systems[1].cls, valkyrn.systems[1].hull]).toEqual([ShipClass.Hunter, HUNTER_CLASS.hull]);
    expect(valkyrn.systems[0]).toMatchObject({ hull: VALKYRN_HULL, laserCharge: 0, laserTargeted: false, shields: 2, magazine: MISSILE.magazine });
    expect(fit.systems[0]).toMatchObject({ hull: VALKYRN_HULL, laserCharge: LASER.chargeUnits, laserTargeted: true });   // Feel-i: the crew laser starts full and targeted
    expect(Array.from(flattenTactical(valkyrn))).not.toEqual(Array.from(flattenTactical(cutter)));
    for (const bad of [ShipClass.Hunter, 4, -1, 1.5]) expect(() => createTacticalState(5, 2, bad), `class ${bad}`).toThrow(/invalid crew ship class/);
  });
});

describe('a null laser (spec §6.1)', () => {
  it('never charges, targets or fires: no crew laser event from the gun Valkyrn in arc and range; the laser fit fires at once', () => {
    const st = facing(ShipClass.Valkyrn), fit = facing(ShipClass.ValkyrnLaser);
    expect([laserFull(st, 0), laserEligible(st, 0, 1), laserEligible(fit, 0, 1)]).toEqual([false, false, true]);
    let crewLasers = 0;
    for (let k = 0; k < 600 && st.outcome === Outcome.Running; k++) { stepDuel(st, IDLE_INPUT); crewLasers += st.events.filter((e) => e.kind === 'laser' && e.ship === 0).length; }
    expect(crewLasers).toBe(0);
    expect([st.systems[0].laserCharge, st.systems[0].laserTargeted, st.systems[0].shots, st.systems[0].laserBurst]).toEqual([0, false, 0, 0]);
    stepDuel(fit, IDLE_INPUT);
    expect(fit.events.some((e) => e.kind === 'laser' && e.ship === 0)).toBe(true);
  });
  it('the validator takes the laser maxima over the classes that have one: a Valkyrn state, a Hound snapshot and a Hound checkpoint validate', () => {
    const v = flattenTactical(createTacticalState(5, 2, ShipClass.Valkyrn));
    expect(validateTacticalValues(createTacticalState(5), v)).toBe(v.length);
    const d = createDuel(DUEL_LAYOUT, 5);
    try {
      const r = loadDuelSnapshot(DUEL_LAYOUT, JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST))), DIGEST);
      try { expect(hashDuel(r)).toBe(hashDuel(d)); } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
    const live = liveDuel(duelInit(5, 'null-laser', 0, DUEL_LAYOUT));
    live.tick(30);
    const cp = JSON.parse(JSON.stringify(live.core.captureCheckpoint())) as DuelCheckpoint;
    expect(() => validateDuelCheckpoint(cp, DIGEST, resolveCutter)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/valkyrnClasses.test.ts`
Expected: FAIL: `VALKYRN_CLASS`, `GUN`, `classIndexById` are not exported from `sim/tactical/defs`, and `GUN_POOL` and the `VALKYRN_*` constants are not exported from `sim/tactical/tuning`.

- [ ] **Step 4: The constants**

Append to `src/renderer/src/sim/tactical/tuning.ts`:

```ts

// The Valkyrn (Valkyrn spec 2026-11-18-valkyrn-solo-ship-design §6.1, §7): the solo fighter's class and its minigun.
// Start values; Part iii's gate tunes them (spec §10).
export const VALKYRN_HULL = 30;
export const VALKYRN_THRUST = 160;                 // u/s²
export const VALKYRN_TURN_DEG_PER_S = 200;
export const VALKYRN_TURN_STEPS_PER_TICK = (VALKYRN_TURN_DEG_PER_S / 360) * HEADING_COUNT * DT;   // about 2.37
/** The gun (spec §7.1): a round every GUN_INTERVAL_TICKS (10 a second) at GUN_SPEED along the nose plus the ship's
 *  velocity, for GUN_LIFE_TICKS (about 607 u of reach at rest), from two muzzles GUN_MUZZLE_LATERAL either side of the
 *  nose line, at the ship's radius + 1 ahead. */
export const GUN_INTERVAL_TICKS = 6;
export const GUN_SPEED = 700;                      // u/s
export const GUN_LIFE_TICKS = 52;
export const GUN_MUZZLE_LATERAL = 12;
/** Heat (spec §7.1): a round adds GUN_HEAT_PER_SHOT and it cools GUN_COOL a tick; reaching GUN_HEAT_MAX locks the gun,
 *  which then cools GUN_COOL_LOCKED a tick and unlocks at 0. Weapons damaged halves both (integer halves). */
export const GUN_HEAT_PER_SHOT = 50;
export const GUN_COOL = 4;
export const GUN_COOL_LOCKED = 8;
export const GUN_HEAT_MAX = 1000;
/** The round pool's fixed size (spec §7.2). */
export const GUN_POOL = 64;
/** Hits (spec §7.2): rounds per shield layer stripped, per hull point, and per Room level. */
export const GUN_HITS_PER_LAYER = 8;
export const GUN_HITS_PER_HULL = 3;
export const GUN_HITS_PER_LEVEL = 6;
```

- [ ] **Step 5: The definitions**

Replace the whole of `src/renderer/src/sim/tactical/defs.ts` with:

```ts
// Ship classes and weapons as definitions, not one-off constants (engine refactor spec §5, R-2). Today's numbers are
// the `cutter` (the crew's ship) and `hunter` (the enemy's) entries and the `laser` and `missile` weapons, so the change
// is golden-neutral: tuning.ts keeps the numbers as these records' inputs (and for the views), and the sim reads them
// through the records. A ship slot names its class by index into SHIP_CLASSES. Valkyrn-i (Valkyrn spec
// 2026-11-18-valkyrn-solo-ship-design §6.1, §7.1): the `gun` weapon and the two Valkyrn classes, appended so no existing
// class index moves; a class's laser or gun slot may be null.
import {
  CUTTER_LASER_SHOTS, ENGINE_FACTOR, GUN_COOL, GUN_COOL_LOCKED, GUN_HEAT_MAX, GUN_HEAT_PER_SHOT, GUN_HITS_PER_HULL, GUN_HITS_PER_LAYER, GUN_HITS_PER_LEVEL, GUN_INTERVAL_TICKS, GUN_LIFE_TICKS,
  GUN_MUZZLE_LATERAL, GUN_SPEED, HUNTER_HULL, HUNTER_LASER_SHOTS, LASER_ARC_COS, LASER_CHARGE_RATE, LASER_CHARGE_UNITS, LASER_HOLD_TICKS, LASER_BURST_GAP_TICKS, LASER_HULL, LASER_RANGE, MAGAZINE, MAGAZINE_REGEN_TICKS,
  MISSILE_ARM_TICKS, MISSILE_FUEL_TICKS, MISSILE_HULL, MISSILE_BOOST_TICKS, MISSILE_LAUNCH_SPEED, MISSILE_LIFE_TICKS, MISSILE_RADIUS, MISSILE_RANGE, MISSILE_SPAWN_OFFSET, MISSILE_THRUST,
  MISSILE_TURN_STEPS_PER_TICK, REVERSE_FRACTION, SHIELD_LAYERS, SHIELD_RATE, SHIELD_RECHARGE_UNITS, SHIP_HULL, SHIP_RADIUS, THRUST, TURN_STEPS_PER_TICK, VALKYRN_HULL, VALKYRN_THRUST,
  VALKYRN_TURN_STEPS_PER_TICK
} from './tuning';

/** The laser (spec §7a): range and arc, charge in whole units per Weapons damage level, the hold before it vents, hull per
 *  hit, and the shots a full charge fires (weapons update spec §1), each after the burst gap. */
export interface LaserDef {
  readonly kind: 'laser';
  readonly range: number; readonly arcCos: number;
  readonly chargeUnits: number; readonly chargeRate: readonly number[]; readonly holdTicks: number;
  readonly hull: number;
  readonly shots: number; readonly burstGapTicks: number;
}
/** The minigun (Valkyrn spec §7.1, §7.2): a round every intervalTicks at `speed` (u/s) along the nose plus the ship's
 *  velocity, for lifeTicks, from two muzzles `muzzleForward` ahead of the centre (radius + 1) and `muzzleLateral` either
 *  side; heat per round, the cooling per tick (coolLocked while locked) up to heatMax, where it locks; and the hits its
 *  target takes per shield layer, per hull point and per Room level. */
export interface GunDef {
  readonly kind: 'gun';
  readonly intervalTicks: number; readonly speed: number; readonly lifeTicks: number;
  readonly muzzleForward: number; readonly muzzleLateral: number;
  readonly heatPerShot: number; readonly cool: number; readonly coolLocked: number; readonly heatMax: number;
  readonly hitsPerLayer: number; readonly hitsPerHull: number; readonly hitsPerLevel: number;
}
/** The cruise missile (spec §7b): the magazine and its regain time, the body, its flight and its hull per hit. */
export interface MissileDef {
  readonly kind: 'missile';
  /** Weapons update spec §2: the launch range to the target's centre, and the unguided ticks after launch. */
  readonly range: number; readonly boostTicks: number;
  readonly magazine: number; readonly regenTicks: number;
  readonly radius: number; readonly spawnOffset: number; readonly launchSpeed: number;
  readonly thrust: number; readonly turnStepsPerTick: number; readonly fuelTicks: number; readonly lifeTicks: number; readonly armTicks: number;
  readonly hull: number;
}
export type WeaponDef = LaserDef | GunDef | MissileDef;

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
  /** A laser slot and a gun slot, either of which may be null (Valkyrn spec §6.1), and the missile slot. */
  readonly slots: { readonly laser: LaserDef | null; readonly gun: GunDef | null; readonly missile: MissileDef };
  /** Who flies it when no player does: nobody ('crew') or the hunter's state machine (sim/tactical/hunter.ts). */
  readonly ai: 'crew' | 'hunter';
}

function laser(shots: number): LaserDef {
  return Object.freeze({
    kind: 'laser', range: LASER_RANGE, arcCos: LASER_ARC_COS, chargeUnits: LASER_CHARGE_UNITS, chargeRate: LASER_CHARGE_RATE, holdTicks: LASER_HOLD_TICKS, hull: LASER_HULL,
    shots, burstGapTicks: LASER_BURST_GAP_TICKS
  });
}
/** The crew's double laser and the Hunter's single one (weapons update spec §1). */
export const LASER: LaserDef = laser(CUTTER_LASER_SHOTS);
export const HUNTER_LASER: LaserDef = laser(HUNTER_LASER_SHOTS);
export const MISSILE: MissileDef = Object.freeze({
  kind: 'missile', range: MISSILE_RANGE, boostTicks: MISSILE_BOOST_TICKS, magazine: MAGAZINE, regenTicks: MAGAZINE_REGEN_TICKS, radius: MISSILE_RADIUS, spawnOffset: MISSILE_SPAWN_OFFSET, launchSpeed: MISSILE_LAUNCH_SPEED,
  thrust: MISSILE_THRUST, turnStepsPerTick: MISSILE_TURN_STEPS_PER_TICK, fuelTicks: MISSILE_FUEL_TICKS, lifeTicks: MISSILE_LIFE_TICKS, armTicks: MISSILE_ARM_TICKS, hull: MISSILE_HULL
});
/** The Valkyrn's minigun (Valkyrn spec §7.1). */
export const GUN: GunDef = Object.freeze({
  kind: 'gun', intervalTicks: GUN_INTERVAL_TICKS, speed: GUN_SPEED, lifeTicks: GUN_LIFE_TICKS, muzzleForward: SHIP_RADIUS + 1, muzzleLateral: GUN_MUZZLE_LATERAL,
  heatPerShot: GUN_HEAT_PER_SHOT, cool: GUN_COOL, coolLocked: GUN_COOL_LOCKED, heatMax: GUN_HEAT_MAX,
  hitsPerLayer: GUN_HITS_PER_LAYER, hitsPerHull: GUN_HITS_PER_HULL, hitsPerLevel: GUN_HITS_PER_LEVEL
});

/** A class's flight numbers that differ between classes: forward thrust and turn steps per tick. */
interface Flight { readonly thrust: number; readonly turnStepsPerTick: number }
const STANDARD: Flight = { thrust: THRUST, turnStepsPerTick: TURN_STEPS_PER_TICK };
const FIGHTER: Flight = { thrust: VALKYRN_THRUST, turnStepsPerTick: VALKYRN_TURN_STEPS_PER_TICK };   // Valkyrn spec §6.1

function shipClass(id: string, ai: ShipClassDef['ai'], hull: number, laser: LaserDef | null, gun: GunDef | null = null, flight: Flight = STANDARD): ShipClassDef {
  return Object.freeze({
    id, hull, radius: SHIP_RADIUS, thrust: flight.thrust, reverseFraction: REVERSE_FRACTION, turnStepsPerTick: flight.turnStepsPerTick, engineFactor: ENGINE_FACTOR,
    shields: Object.freeze({ layers: SHIELD_LAYERS, rechargeUnits: SHIELD_RECHARGE_UNITS, rate: SHIELD_RATE }), power: null,
    slots: Object.freeze({ laser, gun, missile: MISSILE }), ai
  });
}
/** The crew's ship and the enemy's: the same numbers but the hull and the laser's shots, told apart by their AI profile. */
export const CUTTER_CLASS = shipClass('cutter', 'crew', SHIP_HULL, LASER);
export const HUNTER_CLASS = shipClass('hunter', 'hunter', HUNTER_HULL, HUNTER_LASER);
/** Valkyrn spec §6.1, §8: the solo fighter (the gun and the torpedo, no laser) and its developer laser fit (the Cutter's
 *  double laser and torpedo on the Valkyrn's hull and flight). */
export const VALKYRN_CLASS = shipClass('valkyrn', 'crew', VALKYRN_HULL, null, GUN, FIGHTER);
export const VALKYRN_LASER_CLASS = shipClass('valkyrnLaser', 'crew', VALKYRN_HULL, LASER, null, FIGHTER);
/** Every ship class by index (a ship slot's class index). */
export const SHIP_CLASSES: readonly ShipClassDef[] = Object.freeze([CUTTER_CLASS, HUNTER_CLASS, VALKYRN_CLASS, VALKYRN_LASER_CLASS]);
export const ShipClass = { Cutter: 0, Hunter: 1, Valkyrn: 2, ValkyrnLaser: 3 } as const;
/** The duel's slots: the crew's Cutter in slot 0, the hunter in slot 1 (the crew slot's class can differ: createTacticalState). */
export const DUEL_CLASSES: readonly number[] = Object.freeze([ShipClass.Cutter, ShipClass.Hunter]);

/** A class's index by its id (a layout's `shipClass`, Valkyrn spec §3.1). Throws on an unknown id. */
export function classIndexById(id: string): number {
  const k = SHIP_CLASSES.findIndex((c) => c.id === id);
  if (k < 0) throw new Error(`unknown ship class ${id}`);
  return k;
}

// Valkyrn spec §6.2: the aim's dead band is three heading indices wide, so a class that turns 3 or more steps a tick
// could step across it and chatter. Valkyrn spec §7.1: Weapons damage halves the gun's coolings in whole units.
for (const c of SHIP_CLASSES) if (!(c.turnStepsPerTick < 3)) throw new Error(`ship class ${c.id} turns ${c.turnStepsPerTick} heading steps a tick; the aim band needs fewer than 3`);
if (!Number.isInteger(GUN.cool / 2) || !Number.isInteger(GUN.coolLocked / 2)) throw new Error('the gun\'s coolings must be even, so Weapons damage halves them exactly');
```

- [ ] **Step 6: The crew slot's class in the tactical state**

`src/renderer/src/sim/tactical/state.ts`:

Replace `import { DUEL_CLASSES, SHIP_CLASSES, type ShipClassDef } from './defs';` with `import { DUEL_CLASSES, SHIP_CLASSES, ShipClass, type ShipClassDef } from './defs';`.

Replace `systemsFor`'s doc comment's first line and its first two body lines (L149-L155: from `/** A slot's systems at the round's start;` through the line ending `fireHeld: false, lock: Room.Shields,`) so the function begins:

```ts
/** A slot's systems at the round's start; the crew's laser starts full (FTL targeting spec §2: the first shot is ready)
 *  and targeted at the enemy's Shields (Feel-i, console feel spec §3: the FTL opener, so the first firing solution fires
 *  with no setup); a class without a laser (Valkyrn spec §6.1) starts empty and untargeted. Every round, the rematch's
 *  included, is built here. */
function systemsFor(cls: number, target: number, crew = false): ShipSystems {
  const c = SHIP_CLASSES[cls]!, laser = c.slots.laser;
  return {
    cls, target, hull: c.hull, rooms: [0, 0, 0], shields: c.shields.layers, shieldClock: 0, laserCharge: crew && laser ? laser.chargeUnits : 0, laserHold: 0, fireHeld: false, lock: Room.Shields,
    laserTargeted: crew && laser !== null, torpLock: -1, torpRoom: -1, laserBurst: 0, laserBurstClock: 0, freq: 0,
```

(the next line, `magazine: c.slots.missile.magazine, …`, and the closing lines stay).

Replace `createTacticalState`'s doc comment, signature and first line (L190-L194) with:

```ts
/** A fill of `slots` ship slots (at least 2): the duel's two at the map's spawns, the crew's ship (class `crewClass`,
 *  Valkyrn spec §6.1; the Cutter by default) in slot 0 locked on the hunter in slot 1 and back; any further slot is
 *  inactive (R-5's encounters fill them). The round starts holding (hostileAt −1, full shields) with the science draws
 *  (Sci-1 spec §4.1, §4.5; owner decision 2026-11-17). Throws for a slot count under 2 or a class that is not a crew class. */
export function createTacticalState(seed: number, slots = DUEL_CLASSES.length, crewClass: number = ShipClass.Cutter): TacticalState {
  if (!Number.isInteger(slots) || slots < 2) throw new Error(`a tactical state needs at least 2 ship slots, not ${slots}`);
  if (!Number.isInteger(crewClass) || SHIP_CLASSES[crewClass]?.ai !== 'crew') throw new Error(`invalid crew ship class ${String(crewClass)}`);   // never the Hunter's
```

and in its return replace `systems: [systemsFor(DUEL_CLASSES[0]!, 1, true), systemsFor(DUEL_CLASSES[1]!, 0), ...extra.map(emptySystems)],` with `systems: [systemsFor(crewClass, 1, true), systemsFor(DUEL_CLASSES[1]!, 0), ...extra.map(emptySystems)],`.

- [ ] **Step 7: The null-laser guards in the weapons**

`src/renderer/src/sim/tactical/weapons.ts`:

Replace `laserFull` (L35) with:

```ts
/** Whether ship i's laser is fully charged; never for a class without a laser (Valkyrn spec §6.1). */
export function laserFull(state: TacticalState, i: number): boolean {
  const laser = classOf(state, i).slots.laser;
  return laser !== null && state.systems[i]!.laserCharge >= laser.chargeUnits;
}
```

In `laserEligible` replace `if (!b || !b.active || j === i) return false;` with `if (!laser || !b || !b.active || j === i) return false;   // Valkyrn spec §6.1: no laser, no shot`.

In `shoot` (L79), insert as its first line `const laser = classOf(state, i).slots.laser;` and right after it `if (!laser) return;`, and replace `bs.hull = Math.max(0, bs.hull - classOf(state, i).slots.laser.hull);` with `bs.hull = Math.max(0, bs.hull - laser.hull);`.

Replace `fireLaser` (L99-L104) with:

```ts
/** A full charge's release: the first shot now, the rest of the class's burst queued a burst gap apart. */
function fireLaser(state: TacticalState, i: number): void {
  const as = state.systems[i]!, laser = classOf(state, i).slots.laser;
  if (!laser) return;
  shoot(state, i);
  as.laserCharge = 0; as.laserHold = 0;
  as.laserBurst = laser.shots - 1; as.laserBurstClock = as.laserBurst > 0 ? laser.burstGapTicks : 0;
}
```

In `stepBurst` replace `s.laserBurst--; s.laserBurstClock = s.laserBurst > 0 ? classOf(state, i).slots.laser.burstGapTicks : 0;` with `s.laserBurst--; s.laserBurstClock = s.laserBurst > 0 ? classOf(state, i).slots.laser?.burstGapTicks ?? 0 : 0;` (a class without a laser never has a burst pending).

In `applyWeaponsInput` (L121-L146):
- replace its first line `const s = state.systems[i]!, crew = i === CREW_SLOT;` with `const s = state.systems[i]!, crew = i === CREW_SLOT, armed = classOf(state, i).slots.laser !== null;   // Valkyrn spec §6.1: a null laser skips lock, charge and auto-fire`;
- replace `if (input.weapons && input.laserLock !== null) {` with `if (armed && input.weapons && input.laserLock !== null) {`;
- replace `if (input.laserCharge !== null && canCharge(state, i)) {` with `if (armed && input.laserCharge !== null && canCharge(state, i)) {`;
- replace `if (crew && s.laserTargeted && s.laserBurst === 0 && laserFull(state, i)` with `if (armed && crew && s.laserTargeted && s.laserBurst === 0 && laserFull(state, i)` (the rest of that line unchanged).

In `tickWeapons` (L149-L162) replace `else if (s.laserBurst === 0 && !laserFrozen(state, i, input)) {   // no charging while a burst shot is pending` with `else if (laser !== null && s.laserBurst === 0 && !laserFrozen(state, i, input)) {   // no charging while a burst shot is pending, nor without a laser`.

- [ ] **Step 8: The Hunter, the validator and telemetry**

`src/renderer/src/sim/tactical/hunter.ts` L71: replace `const range = classOf(state, i).slots.laser.range, dx = crew.x - self.x,` with `const laser = classOf(state, i).slots.laser, range = laser ? laser.range : 0, dx = crew.x - self.x,` (the rest of the line unchanged).

`src/renderer/src/sim/tactical/hash.ts`:
- Replace `import { SHIP_CLASSES } from './defs';` with `import { SHIP_CLASSES, type ShipClassDef } from './defs';`.
- Replace the `most` line (L186) with:

```ts
/** The largest value of `f` over the classes that have it (Valkyrn spec §6.1: a laser or gun slot may be null), 0 when none does. */
const most = (f: (c: ShipClassDef) => number | null | undefined): number => Math.max(0, ...SHIP_CLASSES.map(f).filter((v): v is number => typeof v === 'number'));
```

- In `systemsRules` replace `laserCharge: within(0, most((c) => c.slots.laser.chargeUnits))` with `laserCharge: within(0, most((c) => c.slots.laser?.chargeUnits))`, `laserBurst: within(0, most((c) => c.slots.laser.shots) - 1)` with `laserBurst: within(0, most((c) => c.slots.laser?.shots) - 1)`, and `laserBurstClock: within(0, most((c) => c.slots.laser.burstGapTicks))` with `laserBurstClock: within(0, most((c) => c.slots.laser?.burstGapTicks))`.

`src/renderer/src/sim/duel/telemetry.ts` L105: replace

```ts
      if (tac.systems[e.ship]!.laserBurst > 0 || classOf(tac, e.ship).slots.laser.shots === 1) s.laserReleases++;   // a burst's first shot (its rest still pending) is the release
```

with

```ts
      if (tac.systems[e.ship]!.laserBurst > 0 || classOf(tac, e.ship).slots.laser?.shots === 1) s.laserReleases++;   // a burst's first shot (its rest still pending) is the release; only a laser class emits one
```

- [ ] **Step 9: The four view readers (type-only, Decision 11)**

- `src/renderer/src/render/duel/consoleModel.ts` L90: replace `burst: classOf(t, 0).slots.laser.shots,` with `burst: classOf(t, 0).slots.laser?.shots ?? 0,   // Valkyrn-i: Part ii gives the gun its own card`.
- `src/renderer/src/render/duel/contactModel.ts` L180: replace `lines.push(line('ENEMY LASER', CRT.main, Math.min(1, sys.laserCharge / cls.slots.laser.chargeUnits)));` with `lines.push(line('ENEMY LASER', CRT.main, cls.slots.laser ? Math.min(1, sys.laserCharge / cls.slots.laser.chargeUnits) : 0));`.
- `src/renderer/src/render/duel/situationModel.ts`: after the line `const laser = classOf(t, CREW_SLOT).slots.laser, dx = e.x - me.x, dy = e.y - me.y, range = Math.round(Math.sqrt(dx * dx + dy * dy));` insert `if (!laser) return { kind: 'none' };   // Valkyrn-i: Part ii adds the gun's reasons (spec §6.1)`.
- `src/renderer/src/render/tactical/hitModel.ts` L29-L30: replace `const units = classOf(state, ship).slots.laser.chargeUnits;` with `const laser = classOf(state, ship).slots.laser;` + newline + `if (!laser) return null;` and in the next line replace `s.laserCharge / units` with `s.laserCharge / laser.chargeUnits`.

- [ ] **Step 10: The existing tests the new shapes touch**

- `tests/tacticalSlots.test.ts`: in the L5 import add `VALKYRN_CLASS, VALKYRN_LASER_CLASS`; replace `expect(SHIP_CLASSES).toEqual([CUTTER_CLASS, HUNTER_CLASS]);` with `expect(SHIP_CLASSES).toEqual([CUTTER_CLASS, HUNTER_CLASS, VALKYRN_CLASS, VALKYRN_LASER_CLASS]);   // Valkyrn-i appends its two`, and `for (const c of SHIP_CLASSES) {` (L38) with `for (const c of [CUTTER_CLASS, HUNTER_CLASS]) {   // the duel's two; the Valkyrn's flight differs (tests/valkyrnClasses.test.ts)`.
- `tests/weaponsUpdate.test.ts`: L45 `CUTTER_CLASS.slots.laser.shots, HUNTER_CLASS.slots.laser.shots` → `CUTTER_CLASS.slots.laser!.shots, HUNTER_CLASS.slots.laser!.shots`; L46 `CUTTER_CLASS.slots.laser.burstGapTicks` → `CUTTER_CLASS.slots.laser!.burstGapTicks`; L100 `CUTTER_CLASS.slots.laser.chargeRate[0]` → `CUTTER_CLASS.slots.laser!.chargeRate[0]`.
- `tests/contactModel.test.ts` L74: `classOf(st, 1).slots.laser.chargeUnits` → `classOf(st, 1).slots.laser!.chargeUnits`.
- `tests/duelHitFeedback.test.ts` L24: `classOf(st, 1).slots.laser.chargeUnits` → `classOf(st, 1).slots.laser!.chargeUnits`.

- [ ] **Step 11: Run the tests and the typecheck**

Run: `npx vitest run tests/valkyrnClasses.test.ts tests/tacticalSlots.test.ts tests/weaponsUpdate.test.ts tests/contactModel.test.ts tests/duelHitFeedback.test.ts tests/tacticalDeterminism.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts tests/determinismGuard.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors. If another `slots.laser.` read fails to typecheck, guard it the same way (`?.` with the Cutter's behaviour kept) and list it in the commit message. `git grep -n "slots\.laser\." -- src` prints only guarded reads.

- [ ] **Step 12: Prove every run unchanged at 53**

Run: `npx tsx scripts/golden/duel-oracle.ts same`
Expected: `duel oracle: <R> runs, <T> ticks, <F> named fields, results, events and telemetry identical at every tick field for field, sim version 53 → 53 (baseline HEAD <sha>)`, exit 0.

Run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: `per-tick canonical trace unchanged at sim version 53: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <sha>)`, exit 0.

If either fails, a Hound or Cutter run changed: find it and fix it; never bless past it.

- [ ] **Step 13: The full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS.

- [ ] **Step 14: Commit**

```bash
git add src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/defs.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/duel/telemetry.ts src/renderer/src/render/duel/consoleModel.ts src/renderer/src/render/duel/contactModel.ts src/renderer/src/render/duel/situationModel.ts src/renderer/src/render/tactical/hitModel.ts tests/tacticalSlots.test.ts tests/weaponsUpdate.test.ts tests/contactModel.test.ts tests/duelHitFeedback.test.ts tests/valkyrnClasses.test.ts
git commit -m "feat(valkyrn): the Valkyrn and laser-fit classes, the gun's definition, a nullable laser slot and the crew slot's class (the oracle proves every run unchanged at 53)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The layout fields, a crew of one, the class through the duel and its snapshot, the combined Flight seat

**Files:**
- Modify: `src/renderer/src/sim/ship/fleet.ts` (append), `src/renderer/src/sim/ship/schema.ts:27` (four fields), `src/renderer/src/sim/ship/derived.ts:79` (hash codes), `src/renderer/src/sim/duel/state.ts` (`LOCAL_CREW_MIN`, `DuelState.crewClass`, `createDuel`), `src/renderer/src/sim/duel/step.ts` (imports, `startRound`, the weapon and `laserFrequency` admission), `src/renderer/src/sim/duel/snapshot.ts` (header, validation, load, restore), `src/renderer/src/sim/duel/modules.ts:92-98`, `src/renderer/src/net/codec.ts:130-134`
- Modify (tests): `tests/duelSnapshot.test.ts:28`, `tests/crewOfFour.test.ts`, `tests/crewOfFourWire.test.ts`
- Create: `tests/helpers/valkyrnDuel.ts`, `tests/valkyrnCrew.test.ts`

**Interfaces:**
- Consumes: Task 2's `classIndexById`, `ShipClass`, `createTacticalState(seed, slots, crewClass)`, `SHIP_CLASSES`.
- Produces:
  ```ts
  // sim/ship/fleet.ts
  export const HULL_IDS: readonly ['hound', 'scout', 'valkyrn'];   // schema.ts imports it: any later rewrite of fleet.ts (Part ii Task 3 Step 5) must keep it
  // sim/ship/schema.ts: ShipLayout gains shipClass?: string; crew?: 1|2|3|4; helmHoldsUnattended?: boolean; hull?: 'hound'|'scout'|'valkyrn'
  // sim/duel/state.ts
  export const LOCAL_CREW_MIN = 1;
  // DuelState.crewClass: number
  export function createDuel(layout: ShipLayout, seed: number, helmPlayer?: number, crew?: number, cls?: number): DuelState;
  // sim/duel/snapshot.ts: DuelSnapshotHeader.crewClass: number (after playerCount); playerCount 1..4
  // tests/helpers/valkyrnDuel.ts
  export function valkyrnTestLayout(over?: Record<string, unknown>): ShipLayout;
  export const VALKYRN_TEST: ShipLayout;
  export function createValkyrnDuel(seed: number, cls?: number, layout?: ShipLayout): DuelState;
  export function seatPilot(d: DuelState): void;
  export function createSeatedValkyrn(seed: number, cls?: number): DuelState;
  ```

- [ ] **Step 1: The test helper**

Create `tests/helpers/valkyrnDuel.ts`:

```ts
// Valkyrn-i test helpers (Valkyrn spec 2026-11-18-valkyrn-solo-ship-design §3.1, §5; plan Decision 3). The Valkyrn's
// layout JSON arrives in Part ii, so the sim's tests fly a Valkyrn-shaped copy of the Hound: the four layout fields set
// (class valkyrn, crew 1, the Helm holds unattended, hull valkyrn) and Navigation and Weapons on one tile in one console
// group, the Flight seat. It keeps the id 'hound' because the duel's repair points are keyed by layout id.
import hound from '../../src/renderer/src/sim/ship/hound.json';
import { createDuel, type DuelState } from '../../src/renderer/src/sim/duel/state';
import { parseShip, type ShipLayout } from '../../src/renderer/src/sim/ship/schema';
import { sitDown } from '../../src/renderer/src/sim/stations';

/** The Valkyrn-shaped Hound, with `over` applied last (e.g. `{ crew: 2 }` or `{ shipClass: 'skiff' }`). */
export function valkyrnTestLayout(over: Record<string, unknown> = {}): ShipLayout {
  const nav = hound.stations.find((s) => s.id === 'navigation')!.tile;
  return parseShip({
    ...hound,
    stations: hound.stations.map((s) => (s.id === 'weapons' ? { ...s, room: 'B', tile: nav } : s)),
    consoleGroups: [...hound.consoleGroups, { tile: nav, kinds: ['navigation', 'weapons'] }],
    shipClass: 'valkyrn', crew: 1, helmHoldsUnattended: true, hull: 'valkyrn',
    ...over
  });
}
export const VALKYRN_TEST = valkyrnTestLayout();

/** A crew-of-one duel on the Valkyrn-shaped layout, its class from the layout unless `cls` overrides it. */
export function createValkyrnDuel(seed: number, cls?: number, layout: ShipLayout = VALKYRN_TEST): DuelState {
  return createDuel(layout, seed, 0, 1, cls);
}
/** Seat the pilot at the Flight seat (Navigation's console group): it then attends Navigation and Weapons both. */
export function seatPilot(d: DuelState): void { sitDown(d.interior, 0, d.nav); }
/** createValkyrnDuel, then seatPilot. */
export function createSeatedValkyrn(seed: number, cls?: number): DuelState {
  const d = createValkyrnDuel(seed, cls);
  seatPilot(d);
  return d;
}
```

- [ ] **Step 2: Write the failing test, and move the two Sci-2 "crew 1 throws" assertions to 0**

Run: `git grep -n "\[1, 5, 2.5\]" -- tests`
Expected: two hits, `tests/crewOfFour.test.ts` (a `createDuel(HOUND, 5, 0, crew)` assertion) and `tests/crewOfFourWire.test.ts` (a `validateDuelSnapshot(DUEL_LAYOUT, withCount(n), DIGEST)` assertion). In each replace `[1, 5, 2.5]` with `[0, 5, 2.5]` and append the trailing comment `   // Valkyrn-i: a local crew of 1 is legal`. Any other hit that tests an **online** bound (the init, the checkpoint, the producers) stays as it is (Decision 16); list it in the commit message.

`tests/duelSnapshot.test.ts` L28: replace `'playerCount', 'layoutId'` with `'playerCount', 'crewClass', 'layoutId'`.

Create `tests/valkyrnCrew.test.ts`:

```ts
// Valkyrn-i (spec 2026-11-18-valkyrn-solo-ship-design §3.1, §4.4, §5, §6.1, §10 Crew of one and Class): the four
// optional layout fields and their hash; createDuel at a crew of one, its throw when the crew argument disagrees with
// the layout; the combined Flight seat, allowed only for a crew of one; the crew slot's class from the layout or the cls
// argument, kept by a rematch and a snapshot round trip, systems[0].cls validated against the header; the gun class
// answering the laser commands unavailable; the downed pilot losing the round.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { Health, Seated } from '../src/renderer/src/sim/components';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { loadDuelSnapshot, restoreDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot, type DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, DUEL_CREW_MIN, LOCAL_CREW_MIN, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { LASER, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { TACTICAL_MODULES } from '../src/renderer/src/sim/tactical/hash';
import { createTacticalState, Outcome } from '../src/renderer/src/sim/tactical/state';
import { VALKYRN_HULL } from '../src/renderer/src/sim/tactical/tuning';
import { hashF64 } from '../src/shared/hash';
import { standAtStation } from './helpers/duelSeat';
import { createSeatedValkyrn, createValkyrnDuel, VALKYRN_TEST, valkyrnTestLayout } from './helpers/valkyrnDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, { held: Array.from({ length: d.interior.playerCount }, () => NONE), commands });
const rehash = (s: DuelSnapshot): DuelSnapshot => { s.header.hash = hashF64(Float64Array.from(s.values)); return s; };
/** The offset of a tactical field in a duel snapshot's values (after the leading SIM_VERSION). */
function tacticalOffset(seed: number, name: string): number {
  const shape = createTacticalState(seed);
  let at = 1;
  for (const m of TACTICAL_MODULES) for (const f of m.fields(shape)) { if (f.name === name) return at; at += f.count; }
  throw new Error(`no tactical field ${name}`);
}

describe('the layout fields (spec §3.1)', () => {
  it('are optional and absent on the Hound; the test Valkyrn carries all four; bad values are refused', () => {
    expect([DUEL_LAYOUT.shipClass, DUEL_LAYOUT.crew, DUEL_LAYOUT.helmHoldsUnattended, DUEL_LAYOUT.hull]).toEqual([undefined, undefined, undefined, undefined]);
    expect([VALKYRN_TEST.shipClass, VALKYRN_TEST.crew, VALKYRN_TEST.helmHoldsUnattended, VALKYRN_TEST.hull]).toEqual(['valkyrn', 1, true, 'valkyrn']);
    for (const bad of [{ crew: 0 }, { crew: 5 }, { crew: 1.5 }, { shipClass: '' }, { hull: 'cutter' }, { helmHoldsUnattended: 'yes' }])
      expect(() => parseShip({ ...hound, ...bad }), JSON.stringify(bad)).toThrow();
  });
  it('the class, the crew and the unattended rule join the layout hash only when present; the hull is view data', () => {
    const plain = deriveLayout(parseShip(hound)).layoutHash;
    expect(deriveLayout(DUEL_LAYOUT).layoutHash).toBe(plain);
    expect(deriveLayout(parseShip({ ...hound, hull: 'hound' })).layoutHash).toBe(plain);
    const withField = [{ crew: 2 }, { shipClass: 'cutter' }, { helmHoldsUnattended: false }].map((f) => deriveLayout(parseShip({ ...hound, ...f })).layoutHash);
    expect(withField.every((h) => h !== plain)).toBe(true);
    expect(new Set(withField).size).toBe(3);
  });
});

describe('a crew of one (spec §4.4)', () => {
  it('createDuel builds one character on a layout whose crew is 1; the local minimum is 1, online keeps 2', () => {
    expect([LOCAL_CREW_MIN, DUEL_CREW_MIN]).toEqual([1, 2]);
    const d = createValkyrnDuel(5);
    try {
      expect([d.interior.playerCount, d.interior.crew.length, d.present, d.helmPlayer]).toEqual([1, 1, [true], 0]);
      expect([d.crewClass, d.tactical.systems[0].cls, d.tactical.systems[0].hull]).toEqual([ShipClass.Valkyrn, ShipClass.Valkyrn, VALKYRN_HULL]);
    } finally { disposeDuel(d); }
    const solo = createDuel(DUEL_LAYOUT, 5, 0, 1);   // the Hound has no fixed crew: 1 is a legal local crew (Decision 16)
    try { expect([solo.interior.playerCount, solo.crewClass]).toEqual([1, ShipClass.Cutter]); } finally { disposeDuel(solo); }
  });
  it('throws when the crew argument disagrees with the layout\'s crew, or is outside 1..4', () => {
    expect(() => createDuel(VALKYRN_TEST, 5)).toThrow(/crewed by 1, not 2/);
    expect(() => createDuel(VALKYRN_TEST, 5, 0, 2)).toThrow(/crewed by 1, not 2/);
    for (const crew of [0, 5, 0.5]) expect(() => createDuel(DUEL_LAYOUT, 5, 0, crew), `crew ${crew}`).toThrow(/invalid duel crew/);
  });
  it('the Flight seat (spec §5): Navigation and Weapons in one group only for a crew of one; sitting there seats the pilot at both', () => {
    expect(() => createDuel(valkyrnTestLayout({ crew: 2 }), 5, 0, 2)).toThrow(/one console group/);
    const d = createValkyrnDuel(5);
    try {
      standAtStation(d, 0, d.nav);
      expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav })])[0]).toMatchObject({ status: 'applied' });
      expect([d.interior.stations.occupant[d.nav], d.interior.stations.occupant[d.weapons]]).toEqual([0, 0]);
      expect(Seated.station[d.interior.crew[0]!]).toBe(d.nav);
    } finally { disposeDuel(d); }
  });
  it('the downed pilot loses the round', () => {
    const d = createValkyrnDuel(5);
    try {
      Health.cur[d.interior.crew[0]!] = 0;
      step(d);
      expect(d.events.flatMap((e) => (e.kind === 'downed' ? [e.player] : []))).toEqual([0]);
      expect(d.tactical.outcome).toBe(Outcome.EnemyWins);
    } finally { disposeDuel(d); }
  });
});

describe('the crew class (spec §6.1)', () => {
  it('comes from the cls argument, else the layout\'s shipClass, else the Cutter', () => {
    const fromLayout = createValkyrnDuel(5), fit = createValkyrnDuel(5, ShipClass.ValkyrnLaser), plain = createDuel(DUEL_LAYOUT, 5);
    try {
      expect([fromLayout.crewClass, fit.crewClass, plain.crewClass]).toEqual([ShipClass.Valkyrn, ShipClass.ValkyrnLaser, ShipClass.Cutter]);
      expect(fit.tactical.systems[0]).toMatchObject({ cls: ShipClass.ValkyrnLaser, hull: VALKYRN_HULL, laserCharge: LASER.chargeUnits, laserTargeted: true });
    } finally { disposeDuel(fromLayout); disposeDuel(fit); disposeDuel(plain); }
    expect(() => createValkyrnDuel(5, ShipClass.Hunter)).toThrow(/invalid crew ship class/);
    expect(() => createDuel(valkyrnTestLayout({ shipClass: 'skiff' }), 5, 0, 1)).toThrow(/unknown ship class skiff/);
  });
  it('a rematch keeps the class and the crew of one', () => {
    const d = createValkyrnDuel(5, ShipClass.ValkyrnLaser);
    try {
      d.tactical.systems[1].hull = 0;
      step(d);
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      expect(step(d, [cmd(d, 0, { kind: 'rematch' })])[0]).toMatchObject({ status: 'applied' });
      expect([d.round, d.interior.playerCount, d.crewClass, d.tactical.systems[0].cls]).toEqual([1, 1, ShipClass.ValkyrnLaser, ShipClass.ValkyrnLaser]);
    } finally { disposeDuel(d); }
  });
  it('the gun Valkyrn answers laserLock, laserCharge and laserFrequency unavailable; the laser fit applies them', () => {
    for (const [cls, want] of [[ShipClass.Valkyrn, 'unavailable'], [ShipClass.ValkyrnLaser, 'applied']] as const) {
      const d = createSeatedValkyrn(5, cls);
      try {
        const r = step(d, [cmd(d, 0, { kind: 'laserLock', room: 0 }), cmd(d, 0, { kind: 'laserCharge', held: true }), cmd(d, 0, { kind: 'laserFrequency', freq: 1 }), cmd(d, 0, { kind: 'torpLock', room: 2 })]);
        expect(r.map((x) => x.reason ?? x.status), `class ${cls}`).toEqual([want, want, want, 'applied']);
      } finally { disposeDuel(d); }
    }
  });
});

describe('the snapshot at a crew of one (spec §6.1, §7.3)', () => {
  for (const cls of [ShipClass.Valkyrn, ShipClass.ValkyrnLaser]) it(`class ${cls}: the header carries the crew and the class; it validates, loads and restores to the same hash`, () => {
    const d = createSeatedValkyrn(5, cls);
    try {
      for (let k = 0; k < 5; k++) step(d);
      const snap = saveDuelSnapshot(d, DIGEST);
      expect([snap.header.playerCount, snap.header.crewClass]).toEqual([1, cls]);
      const r = loadDuelSnapshot(VALKYRN_TEST, JSON.parse(JSON.stringify(snap)), DIGEST);
      try {
        expect([r.interior.playerCount, r.crewClass, hashDuel(r)]).toEqual([1, cls, hashDuel(d)]);
        step(d);
        restoreDuelSnapshot(r, validateDuelSnapshot(VALKYRN_TEST, saveDuelSnapshot(d, DIGEST), DIGEST), DIGEST);
        expect(hashDuel(r)).toBe(hashDuel(d));
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
  it('validates systems[0].cls against the header, the header\'s class as a crew class, and refuses a restore of another class', () => {
    const d = createValkyrnDuel(5), fit = createValkyrnDuel(5, ShipClass.ValkyrnLaser);
    try {
      const snap = saveDuelSnapshot(d, DIGEST), withClass = (c: number) => { const s = structuredClone(snap); s.header.crewClass = c; return s; };
      expect(() => validateDuelSnapshot(VALKYRN_TEST, withClass(ShipClass.ValkyrnLaser), DIGEST)).toThrow(/slot identity/);
      for (const c of [ShipClass.Hunter, 4, -1, 1.5]) expect(() => validateDuelSnapshot(VALKYRN_TEST, withClass(c), DIGEST), `class ${c}`).toThrow(/crew class is invalid/);
      const cls = structuredClone(snap);
      cls.values[tacticalOffset(5, 'systems.0.cls')] = ShipClass.Cutter;
      expect(() => validateDuelSnapshot(VALKYRN_TEST, rehash(cls), DIGEST)).toThrow(/slot identity/);
      expect(() => restoreDuelSnapshot(fit, validateDuelSnapshot(VALKYRN_TEST, snap, DIGEST), DIGEST)).toThrow(/load it instead/);
    } finally { disposeDuel(d); disposeDuel(fit); }
  });
  it('the header\'s crew is 1..4 locally', () => {
    const d = createValkyrnDuel(5);
    try {
      const snap = saveDuelSnapshot(d, DIGEST);
      for (const n of [0, 5]) { const s = structuredClone(snap); s.header.playerCount = n; expect(() => validateDuelSnapshot(VALKYRN_TEST, s, DIGEST), `crew ${n}`).toThrow(/player count is invalid/); }
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/valkyrnCrew.test.ts`
Expected: FAIL: `LOCAL_CREW_MIN` is not exported from `sim/duel/state`, and `parseShip` strips the four new fields (the helper's layout has no `shipClass`).

- [ ] **Step 4: The layout fields and their hash**

Append to `src/renderer/src/sim/ship/fleet.ts`:

```ts
/** The console-map silhouettes a layout's `hull` field may name (Valkyrn spec §3.1, §4.5); render/tactical/hullModel.ts
 *  draws one per id. Kept here, a file allowed ship id literals (spec §3.2), so the schema carries none. */
export const HULL_IDS = ['hound', 'scout', 'valkyrn'] as const;
```

`schema.ts` imports this name at load (`z.enum(HULL_IDS)`), so a later whole-file replacement of `fleet.ts` that drops it breaks `tsc -b` and every ship parse. Part ii's fleet.ts block must carry this export unchanged (Task 8 Step 5 hands it over).

`src/renderer/src/sim/ship/schema.ts`: add `import { HULL_IDS } from './fleet';` after the `reachableTiles` import, and replace the `consoleGroups:` line (L27) with:

```ts
  consoleGroups: z.array(z.object({ tile, kinds: z.array(z.string()) })).default([]),   // combined consoles: every listed kind's station on one tile, one seat, tabs (spec Demo-x-a section 1)
  // Valkyrn spec §3.1, each optional and absent on the Hound: the crew slot's class id (a SHIP_CLASSES id, resolved by
  // createDuel; absent = the Cutter), a fixed crew size (absent = any the caller asks for), whether the crew ship flies
  // its throttle and held heading with the Helm empty (absent = false), and the console-map silhouette (absent = the Hound's).
  shipClass: z.string().min(1).optional(),
  crew: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  helmHoldsUnattended: z.boolean().optional(),
  hull: z.enum(HULL_IDS).optional()
```

`src/renderer/src/sim/ship/derived.ts`: after the `if (groupStations.length) { … }` line (L79) insert:

```ts
  // Valkyrn spec §3.1: the crew class, the fixed crew and the unattended Helm change the duel, so they join the identity,
  // only when any is present, so a layout without them keeps its hash; `hull` is view data and stays out.
  if (layout.shipClass !== undefined || layout.crew !== undefined || layout.helmHoldsUnattended !== undefined) {
    codes.push(-2, layout.crew ?? 0, layout.helmHoldsUnattended === undefined ? -1 : layout.helmHoldsUnattended ? 1 : 0, layout.shipClass?.length ?? -1);
    if (layout.shipClass !== undefined) for (let i = 0; i < layout.shipClass.length; i++) codes.push(layout.shipClass.charCodeAt(i));
  }
```

- [ ] **Step 5: createDuel, the crew class and the Flight seat**

`src/renderer/src/sim/duel/state.ts`:

Replace `import { createTacticalState, type TacticalState } from '../tactical/state';` with:

```ts
import { classIndexById, DUEL_CLASSES, ShipClass } from '../tactical/defs';
import { createTacticalState, type TacticalState } from '../tactical/state';
```

After the `export type DuelCrew = 2 | 3 | 4;` line add:

```ts
/** Valkyrn spec §4.4: a local duel (single player) may have a crew of one; online keeps DUEL_CREW_MIN. */
export const LOCAL_CREW_MIN = 1;
```

In `interface DuelState`, after `holdHeading: number;` add:

```ts
  /** Valkyrn spec §6.1: the crew slot's class index (SHIP_CLASSES): createDuel's `cls`, else the layout's `shipClass`,
   *  else the Cutter. Hashed and snapshotted as the tactical `systems.0.cls`, which always equals it, and carried in the
   *  snapshot header; a rematch keeps it. */
  crewClass: number;
```

Replace `createDuel`'s doc comment and its lines up to and including `const interior = createSimState(layout, crew, seed, Array<number>(crew).fill(RECRUIT));` with:

```ts
/**
 * A duel on `layout` (the Hound in the app; the Cutter in older tests): `crew` trait-free Recruits (1..4 locally,
 * Valkyrn spec §4.4; online callers keep 2..4; equal to the layout's `crew` when it sets one; no XP is ever awarded,
 * since xpSystem never runs), every door held open, every player standing at the layout's spawns in player order with
 * every console free (start-aboard spec §1; `helmPlayer` is kept for the round module and the wire but seats no one),
 * and a tactical state from the same seed, its crew slot of class `cls` (else the layout's `shipClass`, else the Cutter;
 * Valkyrn spec §6.1), whose map must validate. Round 0, beginning on tick 0, the throttle at STOP. Throws if the crew,
 * the Helm player, the class, the map or a repair point is invalid, so a bad seed or layout fails loudly; the crew and
 * class checks run before anything is allocated.
 */
export function createDuel(layout: ShipLayout, seed: number, helmPlayer = 0, crew: number = DUEL_CREW_MIN, cls?: number): DuelState {
  if (!Number.isInteger(crew) || crew < LOCAL_CREW_MIN || crew > DUEL_CREW_MAX) throw new Error(`invalid duel crew ${String(crew)}`);
  if (layout.crew !== undefined && layout.crew !== crew) throw new Error(`duel layout ${layout.id} is crewed by ${layout.crew}, not ${crew}`);   // Valkyrn spec §4.4: one source
  if (crew > layout.spawns.length) throw new Error(`duel layout ${layout.id} has ${layout.spawns.length} spawns, too few for a crew of ${crew}`);
  if (!Number.isInteger(helmPlayer) || helmPlayer < 0 || helmPlayer >= crew) throw new Error(`invalid duel helm player ${String(helmPlayer)}`);
  const crewClass = cls ?? (layout.shipClass !== undefined ? classIndexById(layout.shipClass) : ShipClass.Cutter);
  const tactical = createTacticalState(seed, DUEL_CLASSES.length, crewClass);   // throws for a class that is not a crew class
  const problems = validateMap(tactical.map);
  if (problems.length > 0) throw new Error(`invalid duel map for seed ${seed}: ${problems[0]}`);
  const interior = createSimState(layout, crew, seed, Array<number>(crew).fill(RECRUIT));
```

Replace the two console-group lines

```ts
    const gn = interior.derived.stationGroup[nav]!;
    if (gn >= 0 && gn === interior.derived.stationGroup[weapons]) throw new Error(`duel layout ${layout.id} puts Navigation and Weapons in one console group; the two players need separate seats`);
```

with

```ts
    // Valkyrn spec §5: Navigation and Weapons share one console group (the Flight seat) only for a crew of one.
    const gn = interior.derived.stationGroup[nav]!;
    if (gn >= 0 && gn === interior.derived.stationGroup[weapons] && crew !== 1) throw new Error(`duel layout ${layout.id} puts Navigation and Weapons in one console group; only a crew of one may share them`);
```

and in the return object replace `throttle: 0, holdHeading: -1 };` with `throttle: 0, holdHeading: -1, crewClass };`.

`src/renderer/src/sim/duel/modules.ts`: in `DUEL_NOT_SNAPSHOTTED` after `science: 'the Science station index, from the layout',` add:

```ts
  crewClass: 'the crew slot\'s class: hashed and snapshotted as the ship module\'s systems.0.cls, and in the snapshot header (Valkyrn spec §6.1)',
```

- [ ] **Step 6: The step: the next round keeps the class; a gun class refuses the laser commands**

`src/renderer/src/sim/duel/step.ts`:

- Replace `import { CONTACT_MAX_LEVEL, Outcome } from '../tactical/state';` with `import { classOf, CONTACT_MAX_LEVEL, Outcome } from '../tactical/state';`.
- In `startRound` replace `const next = createDuel(d.interior.layout, followingSeed(d.tactical.seed), d.helmPlayer, d.interior.playerCount);` with `const next = createDuel(d.interior.layout, followingSeed(d.tactical.seed), d.helmPlayer, d.interior.playerCount, d.crewClass);   // Valkyrn spec §6.1: the class carries over`.
- In the weapon-command loop, after the line `if (gunner < 0 || e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }   // −1 is the empty-seat value, never a player` insert:

```ts
    if ((c.kind === 'laserLock' || c.kind === 'laserCharge') && classOf(d.tactical, 0).slots.laser === null) { result(e, 'unavailable'); continue; }   // Valkyrn spec §6.1: no laser
```

- In the `laserFrequency` loop, after `if (gunner < 0 || e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }` insert:

```ts
    if (classOf(t, 0).slots.laser === null) { result(e, 'unavailable'); continue; }   // Valkyrn spec §6.1: no laser to tune
```

- [ ] **Step 7: The snapshot header carries the class; the crew is 1..4**

`src/renderer/src/sim/duel/snapshot.ts`:

- Replace `import { DUEL_CLASSES } from '../tactical/defs';` with `import { DUEL_CLASSES, SHIP_CLASSES, ShipClass } from '../tactical/defs';`, and `import { createDuel, disposeDuel, DUEL_CREW_MAX, DUEL_CREW_MIN, type DuelState } from './state';` with `import { createDuel, disposeDuel, DUEL_CREW_MAX, LOCAL_CREW_MIN, type DuelState } from './state';`.
- In `DuelSnapshotHeader` replace the comment and line `tick: number; playerCount: number;` with:

```ts
  /** The encounter tick (the interior and the tactical tick, which are always equal), the player count (the crew size n,
   *  1..4 locally: Sci-2 spec §4.2, Valkyrn spec §4.4) and the crew slot's class (Valkyrn spec §6.1; systems.0.cls equals it). */
  tick: number; playerCount: number; crewClass: number;
```

- `HEADER_KEYS`: replace `'playerCount', 'layoutId'` with `'playerCount', 'crewClass', 'layoutId'`.
- In `saveDuelSnapshot` replace `playerCount: d.interior.playerCount,` with `playerCount: d.interior.playerCount, crewClass: d.crewClass,`.
- In `validateDuelSnapshot` replace

```ts
  // Sci-2 spec §4.2: the crew size, an integer in 2..4 and no more than the layout's spawns; everything after derives from it.
  const n = h.playerCount;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < DUEL_CREW_MIN || n > DUEL_CREW_MAX || n > layout.spawns.length) throw new Error('duel snapshot player count is invalid');
```

with

```ts
  // Sci-2 spec §4.2: the crew size, an integer in 1..4 (Valkyrn spec §4.4: local; online refuses 1 in its init and
  // checkpoint) and no more than the layout's spawns; everything after derives from it.
  const n = h.playerCount;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < LOCAL_CREW_MIN || n > DUEL_CREW_MAX || n > layout.spawns.length) throw new Error('duel snapshot player count is invalid');
  // Valkyrn spec §6.1: the crew slot's class, a crew class of SHIP_CLASSES; systems.0.cls must equal it (the slot identity below).
  const crewClass = h.crewClass;
  if (typeof crewClass !== 'number' || !Number.isInteger(crewClass) || SHIP_CLASSES[crewClass]?.ai !== 'crew') throw new Error('duel snapshot crew class is invalid');
```

- Replace the slot-identity block

```ts
  if (slotValue('ships.length') !== DUEL_CLASSES.length
    || DUEL_CLASSES.some((cls, i) => slotValue(`ships.${i}.active`) !== 1 || slotValue(`systems.${i}.cls`) !== cls || slotValue(`systems.${i}.target`) !== 1 - i))
    throw new Error('duel snapshot duel slot identity does not match: two active slots, the Cutter and the hunter, each locked on the other');
```

with

```ts
  if (slotValue('ships.length') !== DUEL_CLASSES.length
    || [crewClass, ShipClass.Hunter].some((cls, i) => slotValue(`ships.${i}.active`) !== 1 || slotValue(`systems.${i}.cls`) !== cls || slotValue(`systems.${i}.target`) !== 1 - i))
    throw new Error('duel snapshot duel slot identity does not match: two active slots, the header\'s crew class and the hunter, each locked on the other');
```

- In the returned header replace `playerCount: n,` with `playerCount: n, crewClass,`.
- In `loadDuelSnapshot` replace `const d = createDuel(layout, snap.header.seed, 0, snap.header.playerCount);` with `const d = createDuel(layout, snap.header.seed, 0, snap.header.playerCount, snap.header.crewClass);`.
- In `restoreDuelSnapshot` replace the condition and message

```ts
  if (h.layoutId !== d.interior.layout.id || h.layoutHash !== d.interior.derived.layoutHash || h.seed !== d.tactical.seed || h.playerCount !== d.interior.playerCount)
    throw new Error('duel snapshot is for another layout, seed or crew: load it instead');
```

with

```ts
  if (h.layoutId !== d.interior.layout.id || h.layoutHash !== d.interior.derived.layoutHash || h.seed !== d.tactical.seed || h.playerCount !== d.interior.playerCount || h.crewClass !== d.crewClass)
    throw new Error('duel snapshot is for another layout, seed, crew or class: load it instead');
```

`src/renderer/src/net/codec.ts`, in `duelWire.snapshotHeader`: replace `snapshotFormat: z.literal(1), simVersion: positive, contentDigest: z.string().regex(/^[0-9a-f]{64}$/), tick: uint, playerCount,` with `snapshotFormat: z.literal(1), simVersion: positive, contentDigest: z.string().regex(/^[0-9a-f]{64}$/), tick: uint, playerCount, crewClass: z.number().int().min(0).max(MAX_INDEX),   // Valkyrn spec §6.1`.

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npx vitest run tests/valkyrnCrew.test.ts tests/valkyrnClasses.test.ts tests/crewOfFour.test.ts tests/crewOfFourWire.test.ts tests/duelSnapshot.test.ts tests/duelCheckpoint.test.ts tests/duelModules.test.ts tests/duelRounds.test.ts tests/duelCache.test.ts tests/codecModeWire.test.ts tests/duelMode.test.ts tests/duelOnline.test.ts tests/onlineDuel.test.ts tests/shipSchema.test.ts`
Expected: PASS (drop any listed file that does not exist; `ls tests/shipSchema.test.ts` first).

Run: `npx tsc -b`
Expected: no errors. `git grep -nE "'(hound|cutter|valkyrn|valkyrnLaser|scout)'" -- src/renderer/src/sim/ship/schema.ts src/renderer/src/sim/duel` prints only `sim/duel/tuning.ts` lines.

- [ ] **Step 9: Prove every run unchanged at 53**

Run: `npx tsx scripts/golden/duel-oracle.ts same` and `npx tsx scripts/golden/canonical-trace.ts same` (expected output as in Task 2 Step 12, against Task 2's baseline).

- [ ] **Step 10: The full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/sim/ship/fleet.ts src/renderer/src/sim/ship/schema.ts src/renderer/src/sim/ship/derived.ts src/renderer/src/sim/duel/state.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/snapshot.ts src/renderer/src/sim/duel/modules.ts src/renderer/src/net/codec.ts tests/helpers/valkyrnDuel.ts tests/valkyrnCrew.test.ts tests/duelSnapshot.test.ts tests/crewOfFour.test.ts tests/crewOfFourWire.test.ts
git commit -m "feat(valkyrn): layout fields, a crew of one, the crew class through createDuel, rematch and snapshot, the Flight seat, laser commands unavailable without a laser (the oracle proves every run unchanged at 53)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mouse aim and the gun trigger on the held wire, aimTurn, the held heading, the empty Helm

**Files:**
- Modify: `src/renderer/src/net/contracts.ts:32-34` (`HeldInput`), `src/renderer/src/net/codec.ts:151`, `src/renderer/src/authority/checkpoint.ts:40`, `src/renderer/src/authority/duelCheckpoint.ts:72`, `src/renderer/src/authority/replay.ts:17`, `src/renderer/src/authority/core.ts:329,435`, `src/renderer/src/sim/tactical/weapons.ts` (`ShipInput`, `IDLE_INPUT`, `UNCREWED_INPUT`), `src/renderer/src/sim/tactical/hunter.ts:90`, `src/renderer/src/sim/duel/step.ts` (`heldAim`, `aimTurn`, `helmTurn`, the crew input, the Helm axes)
- Create: `tests/valkyrnFlight.test.ts`

**Interfaces:**
- Consumes: Task 3's `createDuel(…, crew, cls)`, `VALKYRN_TEST`, `createSeatedValkyrn`, `layout.helmHoldsUnattended`.
- Produces:
  ```ts
  // net/contracts.ts: HeldInput { moveX; moveY; interactHeld; face?: boolean; aim?: number; gunHeld?: boolean }
  // sim/tactical/weapons.ts: ShipInput.gunHeld: boolean (false in IDLE_INPUT and UNCREWED_INPUT and the Hunter's)
  // sim/duel/step.ts
  export function heldAim(h: HeldInput): number;               // 0..255, else −1
  export function aimTurn(heading: number, aim: number): number;   // −1, 0 or 1
  export function helmTurn(d: DuelState, h: HeldInput): number;    // A/D, face, aim, held heading
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/valkyrnFlight.test.ts`:

```ts
// Valkyrn-i (spec 2026-11-18-valkyrn-solo-ship-design §4.4, §6.2, §10 Aim and Crew of one): mouse aim. A held `aim`
// (a heading index, −1 or absent for none, anything else none) turns the Helm by aimTurn's three-index band, after A/D
// and auto-face; a valid aim sets the held heading, so the Valkyrn's empty Helm flies its throttle and that bearing
// (helmHoldsUnattended) while the Hound's empty Helm flies zero axes; aim and gunHeld ride the codec, the checkpoint and
// the replay, and the aim the hash and snapshot through the held heading.
import { describe, expect, it } from 'vitest';
import { validateDuelCheckpoint, type DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { parseEncounterReplay } from '../src/renderer/src/authority/replay';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { disposeDuel, DUEL_CREW_MAX, type DuelState } from '../src/renderer/src/sim/duel/state';
import { aimTurn, heldAim, helmTurn, stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { autoFaceTurn, headingTurn } from '../src/renderer/src/sim/tactical/hunter';
import { cloneTactical, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { createSeatedDuel } from './helpers/duelSeat';
import { liveDuel } from './helpers/liveDuel';
import { createSeatedValkyrn, VALKYRN_TEST } from './helpers/valkyrnDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
/** One step; player 0 holds `held`, everyone else nothing. */
const step = (d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput = NONE) =>
  stepDuelTick(d, { held: Array.from({ length: d.interior.playerCount }, (_, p) => (p === 0 ? held : NONE)), commands });
/** The unsigned angle (heading steps, 0..128) between two heading indices. */
const apart = (a: number, b: number): number => { const k = (((a - b) % 256) + 256) % 256; return Math.min(k, 256 - k); };
const body = (t: TacticalState) => { const s = t.ships[0]; return [s.x, s.y, s.vx, s.vy, s.heading, s.headingAcc]; };
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe('aimTurn and the held aim (spec §6.2)', () => {
  it('turns by the sign of the index difference, none within one index; dead astern turns anticlockwise', () => {
    expect([aimTurn(0, 0), aimTurn(0, 1), aimTurn(0, 255), aimTurn(255, 0), aimTurn(10, 9)]).toEqual([0, 0, 0, 0, 0]);
    expect([aimTurn(0, 2), aimTurn(0, 127), aimTurn(250, 4)]).toEqual([1, 1, 1]);
    expect([aimTurn(0, 254), aimTurn(0, 129), aimTurn(4, 250), aimTurn(0, 128)]).toEqual([-1, -1, -1, -1]);
  });
  it('a held aim is a heading index 0..255; anything else counts as none (−1)', () => {
    expect([0, 77, 255].map((aim) => heldAim({ ...NONE, aim }))).toEqual([0, 77, 255]);
    expect([undefined, -1, -2, 256, 2.5, Number.NaN, Infinity].map((aim) => heldAim({ ...NONE, aim }))).toEqual([-1, -1, -1, -1, -1, -1, -1]);
  });
  it('the Valkyrn\'s nose settles on a fixed aim within one index in under 60 ticks, never turning back', () => {
    const d = createSeatedValkyrn(5);
    try {
      const aim = (d.tactical.ships[0].heading + 100) % 256, held = { ...NONE, aim }, turns: number[] = [];
      for (let k = 0; k < 60; k++) { turns.push(helmTurn(d, held)); step(d, [], held); }
      expect(turns.every((t) => t === 0 || t === 1)).toBe(true);   // no sign flip
      expect(turns.slice(turns.indexOf(0)).every((t) => t === 0)).toBe(true);   // settled, it stays
      expect(apart(d.tactical.ships[0].heading, aim)).toBeLessThanOrEqual(1);
      expect(d.holdHeading).toBe(aim);
    } finally { disposeDuel(d); }
  });
  it('A/D and auto-face win over the aim; an invalid aim is none', () => {
    const d = createSeatedValkyrn(5);
    try {
      const aim = (d.tactical.ships[0].heading + 40) % 256;
      expect(helmTurn(d, { ...NONE, aim, moveX: -1 })).toBe(-1);
      expect(helmTurn(d, { ...NONE, aim, face: true })).toBe(autoFaceTurn(d.tactical, 0));
      expect(helmTurn(d, { ...NONE, aim })).toBe(1);
      for (const bad of [300, 2.5, Number.NaN]) expect(helmTurn(d, { ...NONE, aim: bad }), `aim ${bad}`).toBe(0);   // and no held heading
    } finally { disposeDuel(d); }
  });
  it('a valid aim sets the held heading; A/D or auto-face held clears it; an invalid aim leaves it', () => {
    const d = createSeatedValkyrn(5);
    try {
      step(d, [], { ...NONE, aim: 77 }); expect(d.holdHeading).toBe(77);
      step(d, [], { ...NONE, aim: 300 }); expect(d.holdHeading).toBe(77);
      step(d, [], { ...NONE, aim: 90, moveX: 1 }); expect(d.holdHeading).toBe(-1);
      step(d, [], { ...NONE, aim: 90 }); expect(d.holdHeading).toBe(90);
      step(d, [], { ...NONE, aim: 91, face: true }); expect(d.holdHeading).toBe(-1);
    } finally { disposeDuel(d); }
  });
  it('rides the hash and the snapshot through the held heading', () => {
    const a = createSeatedValkyrn(5), b = createSeatedValkyrn(5);
    try {
      step(a, [], { ...NONE, aim: 77 }); step(b, [], { ...NONE, aim: 78 });
      expect(hashDuel(a)).not.toBe(hashDuel(b));
      const r = loadDuelSnapshot(VALKYRN_TEST, JSON.parse(JSON.stringify(saveDuelSnapshot(a, DIGEST))), DIGEST);
      try { expect([r.holdHeading, hashDuel(r)]).toEqual([77, hashDuel(a)]); } finally { disposeDuel(r); }
    } finally { disposeDuel(a); disposeDuel(b); }
  });
});

describe('the empty Helm (spec §4.4)', () => {
  it('the Valkyrn flies its throttle and held heading with the pilot standing, exactly as a ship flown by those axes', () => {
    const d = createSeatedValkyrn(5);
    try {
      const aim = (d.tactical.ships[0].heading + 64) % 256;
      step(d, [cmd(d, 0, { kind: 'throttle', level: 4 })], { ...NONE, aim });
      step(d, [cmd(d, 0, { kind: 'stand' })]);
      expect([d.interior.stations.occupant[d.nav], d.throttle, d.holdHeading]).toEqual([-1, 4, aim]);
      const ref = cloneTactical(d.tactical);
      for (let k = 0; k < 60; k++) {
        step(d);
        stepDuel(ref, { ...UNCREWED_INPUT, helm: true, axes: { turn: headingTurn(ref, 0, aim), thrust: 1 } });
      }
      expect(body(d.tactical)).toEqual(body(ref));
      expect(apart(d.tactical.ships[0].heading, aim)).toBeLessThanOrEqual(2);
    } finally { disposeDuel(d); }
  });
  it('the Hound flies zero axes with the Helm empty, whatever its throttle and held heading', () => {
    const d = createSeatedDuel(DUEL_LAYOUT, 5);
    try {
      const h = (d.tactical.ships[0].heading + 64) % 256;
      step(d, [cmd(d, 0, { kind: 'throttle', level: 4 }), cmd(d, 0, { kind: 'heading', heading: h })]);
      step(d, [cmd(d, 0, { kind: 'stand' })]);
      expect([d.interior.stations.occupant[d.nav], d.throttle, d.holdHeading]).toEqual([-1, 4, h]);
      const ref = cloneTactical(d.tactical);
      for (let k = 0; k < 60; k++) { step(d); stepDuel(ref, { ...UNCREWED_INPUT, weapons: true }); }   // player 1 still sits at Weapons
      expect(body(d.tactical)).toEqual(body(ref));
    } finally { disposeDuel(d); }
  });
});

describe('aim and gunHeld on the held wire (spec §6.2, §7.1)', () => {
  const frame = (held: Record<string, unknown>) => ({ kind: 'held', frame: { runId: 'r', player: 0, tick: 0, sequence: 1, held: { moveX: 0, moveY: 0, interactHeld: false, ...held } } });
  it('the codec carries them and refuses anything but an integer index −1..255 and a boolean', () => {
    const codec = duelCodec(DUEL_CREW_MAX), ok = frame({ aim: 40, gunHeld: true });
    expect(codec.decodeMessage(raw(ok))).toEqual(ok);
    expect(codec.decodeMessage(raw(frame({ aim: -1 })))).toEqual(frame({ aim: -1 }));
    for (const bad of [{ aim: 256 }, { aim: -2 }, { aim: 2.5 }, { gunHeld: 1 }]) expect(() => codec.decodeMessage(raw(frame(bad))), JSON.stringify(bad)).toThrow();
  });
  it('they ride the authority\'s held frames into the checkpoint and the replay', () => {
    const live = liveDuel(duelInit(5, 'aim-wire'));
    live.held(0, { ...NONE, aim: 40, gunHeld: true });
    live.tick(2);
    const cp = JSON.parse(JSON.stringify(live.core.captureCheckpoint())) as DuelCheckpoint;
    expect(cp.held[0]).toEqual({ ...NONE, aim: 40, gunHeld: true });
    expect(() => validateDuelCheckpoint(cp, DIGEST, resolveCutter)).not.toThrow();
    expect(() => validateDuelCheckpoint({ ...cp, held: [{ ...NONE, aim: 256 }, cp.held[1]!] }, DIGEST, resolveCutter)).toThrow();
    const replay = JSON.parse(JSON.stringify(live.core.replay())) as unknown;
    expect(() => parseEncounterReplay(duelRules, replay, DIGEST, resolveCutter)).not.toThrow();
    expect(JSON.stringify(replay)).toContain('"aim":40');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/valkyrnFlight.test.ts`
Expected: FAIL: `aimTurn` and `heldAim` are not exported from `sim/duel/step`, and the codec refuses the `aim` key (strict).

- [ ] **Step 3: The held input and its wire**

`src/renderer/src/net/contracts.ts`: replace the `HeldInput` doc comment and line with:

```ts
/** `face` (Feel-i, console feel spec §2): the Helm's auto-face, Space held at the Helm; absent means false. `aim`
 *  (Valkyrn spec §6.2): the Flight seat's mouse aim, a heading index 0..255, −1 or absent for none (the sim counts any
 *  other value as none). `gunHeld` (Valkyrn spec §7.1): the gun's trigger; absent means false. Only the duel reads them:
 *  `face` and `aim` from the Helm's attendant (A/D, moveX, overrides both), `gunHeld` from Weapons'. */
export interface HeldInput { moveX: number; moveY: number; interactHeld: boolean; face?: boolean; aim?: number; gunHeld?: boolean }
```

In each of the four held schemas add `aim: z.number().int().min(-1).max(255).optional(), gunHeld: z.boolean().optional()` after `face: z.boolean().optional()`:

- `src/renderer/src/net/codec.ts` L151: the line becomes
  ```ts
  const held = z.object({ moveX: axis, moveY: axis, interactHeld: z.boolean(), face: z.boolean().optional(), aim: z.number().int().min(-1).max(255).optional(), gunHeld: z.boolean().optional() }).strict();   // face: Feel-i's auto-face; aim, gunHeld: Valkyrn spec §6.2, §7.1
  ```
- `src/renderer/src/authority/checkpoint.ts` L40: inside `held: z.array(z.object({ … }).strict())…` replace `interactHeld: z.boolean(), face: z.boolean().optional() })` with `interactHeld: z.boolean(), face: z.boolean().optional(), aim: z.number().int().min(-1).max(255).optional(), gunHeld: z.boolean().optional() })`.
- `src/renderer/src/authority/duelCheckpoint.ts` L72 and `src/renderer/src/authority/replay.ts` L17: the same replacement in their `const held = z.object({ … }).strict();` lines.

`src/renderer/src/authority/core.ts`:
- L329: replace `|| held[p]!.face === true) expired.push(p);` with `|| held[p]!.face === true || held[p]!.gunHeld === true || held[p]!.aim !== undefined) expired.push(p);   // Valkyrn spec §6.2: an expired aim clears`.
- L435: replace `delete h.face; });` with `delete h.face; delete h.aim; delete h.gunHeld; });   // Valkyrn spec §6.2: a pause clears the aim and the trigger`.

- [ ] **Step 4: The tactical input's trigger**

`src/renderer/src/sim/tactical/weapons.ts`: in `interface ShipInput`, after `missileLaunch: boolean;` add:

```ts
  /** Valkyrn spec §7.1: the gun's trigger, held at the Weapons station by its attendant (the duel step computes it from
   *  the held input; every other input sets false). Read only by a class with a gun. */
  gunHeld: boolean;
```

and replace the two constants with:

```ts
/** A crew that sits at both consoles and does nothing. */
export const IDLE_INPUT: ShipInput = { helm: true, weapons: true, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, laserCharge: null, missileLaunch: false, gunHeld: false, scanner: true };
/** Nobody at either console: a ship nobody flies. */
export const UNCREWED_INPUT: ShipInput = { helm: false, weapons: false, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, laserCharge: null, missileLaunch: false, gunHeld: false, scanner: true };
```

`src/renderer/src/sim/tactical/hunter.ts` L90: replace `missileLaunch: false, scanner: true };` with `missileLaunch: false, gunHeld: false, scanner: true };`.

- [ ] **Step 5: The step: aim, the held heading, the trigger, the empty Helm**

`src/renderer/src/sim/duel/step.ts`:

- Replace `import { SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from '../tactical/tuning';` with `import { HEADING_COUNT, SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from '../tactical/tuning';`.
- Replace `helmTurn`'s doc comment and body (L91-L99) with:

```ts
/** Valkyrn spec §6.2: a held aim, a heading index 0..255; absent, −1, NaN, a non-integer or out of range is −1 (none). */
export function heldAim(h: HeldInput): number {
  const a = h.aim;
  return typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < HEADING_COUNT ? a : -1;
}

/** Valkyrn spec §6.2: the turn from `heading` toward the aim index `aim`. The signed index difference is
 *  d = ((aim − heading + 384) mod 256) − 128: none when |d| ≤ 1, else its sign. The band of three indices is wider than
 *  one tick's integer step (defs.ts asserts every class turns fewer than 3 steps a tick), so the nose never steps across
 *  it. Pure; only + − and the integer modulo. */
export function aimTurn(heading: number, aim: number): number {
  const d = ((aim - heading + HEADING_COUNT + HEADING_COUNT / 2) % HEADING_COUNT) - HEADING_COUNT / 2;
  return d >= -1 && d <= 1 ? 0 : Math.sign(d);
}

/** The turn the Helm attendant's held input flies this tick (Artemis spec §5.3, Feel-i, Feel-ii spec §1.1, Valkyrn spec
 *  §6.2): A/D, else auto-face's turn, else the aim's, else the held heading's, else none. Pure; reads the state before
 *  the step (the app's predicted path calls it too). */
export function helmTurn(d: DuelState, h: HeldInput): number {
  if ((Math.sign(h.moveX) || 0) !== 0) return h.moveX;
  if (d.tactical.outcome !== Outcome.Running) return 0;
  if (h.face === true) return autoFaceTurn(d.tactical, 0);
  const aim = heldAim(h);
  if (aim >= 0) return aimTurn(d.tactical.ships[0].heading, aim);
  return d.holdHeading >= 0 ? headingTurn(d.tactical, 0, d.holdHeading) : 0;
}
```

- Replace the crew input line (L191)

```ts
  const crew: ShipInput = { helm: helm >= 0, weapons: gunner >= 0, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, laserCharge: null, missileLaunch: false, scanner: true };
```

with

```ts
  const crew: ShipInput = { helm: helm >= 0, weapons: gunner >= 0, axes: { turn: 0, thrust: 0 }, laserLock: null, torpLock: null, laserCharge: null, missileLaunch: false,
    gunHeld: gunner >= 0 && (input.held[gunner] ?? NO_HELD).gunHeld === true, scanner: true };   // Valkyrn spec §7.1: the trigger of Weapons' attendant
```

- Replace the Helm-axes block (L253-L260, from the comment `// Artemis spec §5.3: held moveX turns` through the closing `}` of `if (helm >= 0) { … }`) with:

```ts
  // Artemis spec §5.3: held moveX turns, the throttle thrusts; held moveY no longer does. Feel-i (console feel spec §2):
  // the Helm's held `face` turns the nose onto the enemy's lead point instead, unless A/D turns. Feel-ii (spec §1.1): A/D
  // or auto-face held at the Helm clears a held heading; otherwise a held heading turns the nose onto its bearing.
  // Valkyrn spec §6.2: a held aim turns before the held heading, and when neither A/D nor auto-face is held a valid aim
  // becomes the held heading. Valkyrn spec §4.4: with the Helm empty, a layout whose Helm holds unattended flies its
  // throttle and held heading; any other (the Hound's) flies zero axes as before.
  if (helm >= 0) {
    const h = input.held[helm] ?? NO_HELD;
    crew.axes = { turn: helmTurn(d, h), thrust: throttleThrust(d.throttle) };
    if ((Math.sign(h.moveX) || 0) !== 0 || h.face === true) d.holdHeading = -1;
    else if (heldAim(h) >= 0) d.holdHeading = heldAim(h);
  } else if (st.layout.helmHoldsUnattended === true) {
    crew.helm = true;   // stepDuel flies a ship's axes only while its Helm flies (Decision 13); Weapons stays the seat rule
    crew.axes = { turn: d.tactical.outcome === Outcome.Running && d.holdHeading >= 0 ? headingTurn(d.tactical, 0, d.holdHeading) : 0, thrust: throttleThrust(d.throttle) };
  }
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run tests/valkyrnFlight.test.ts tests/valkyrnCrew.test.ts tests/feelHeading.test.ts tests/feelAutoFace.test.ts tests/duelRuntime.test.ts tests/onlineDuelSession.test.ts tests/duelCheckpoint.test.ts tests/codecModeWire.test.ts tests/encounterAuthority.test.ts tests/authorityDisconnect.test.ts tests/weaponsUpdate.test.ts tests/tacticalSlots.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors. A `ShipInput` literal elsewhere that now lacks `gunHeld` gets `gunHeld: false` (list it in the commit message); `git grep -n "scanner: true" -- src` lists only `weapons.ts`, `hunter.ts` and `step.ts`.

- [ ] **Step 7: Prove every run unchanged at 53**

Run: `npx tsx scripts/golden/duel-oracle.ts same` and `npx tsx scripts/golden/canonical-trace.ts same` (expected output as in Task 2 Step 12).

- [ ] **Step 8: The full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/net/contracts.ts src/renderer/src/net/codec.ts src/renderer/src/authority/checkpoint.ts src/renderer/src/authority/duelCheckpoint.ts src/renderer/src/authority/replay.ts src/renderer/src/authority/core.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/duel/step.ts tests/valkyrnFlight.test.ts
git commit -m "feat(valkyrn): mouse aim and the gun trigger on the held wire, aimTurn and the aim's held heading, the unattended Helm (the oracle proves every run unchanged at 53)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The gun fires: heat, the lockout, the round pool, the gun state in the hash, snapshot and validator (same-version bless)

**Files:**
- Modify: `src/renderer/src/sim/tactical/state.ts` (`ShipSystems`, `GunRound`, `emptyRound`, `TacticalState.rounds`, `DuelEvent`, `systemsFor`, `emptySystems`, `createTacticalState`), `src/renderer/src/sim/tactical/hash.ts` (round fields, gun fields, `FLAGS`, validator, clone), `src/renderer/src/sim/tactical/weapons.ts` (the `tickGun` call)
- Create: `src/renderer/src/sim/tactical/gun.ts`
- Modify (proof tooling, Decision 1): `scripts/golden/duelOracle.ts` (`ADDITIONS`, `Migration.frozen` and its check in `recordRun`, the `added` mode, `verifyDuelAdditive`), `scripts/golden/duel-oracle.ts`
- Modify (tests): `tests/duelModules.test.ts`, `tests/tacticalDeterminism.test.ts:115-123`, `tests/duelOracle.test.ts`
- Create: `tests/valkyrnGun.test.ts`
- Regenerated by `npm run bless` (same version): `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`, and `tests/golden/basic.json` in its embedded content digest only (the digest hashes every `.ts`/`.json` under `src/renderer/src/sim` and `authority`, `build/contentDigest.ts:12-16`, so any sim edit moves it; its canonical hashes do not move)

**Interfaces:**
- Consumes: Task 2's `GUN`, `GUN_POOL`, `classOf`; Task 4's `ShipInput.gunHeld` and the crew input's trigger.
- Produces:
  ```ts
  // sim/tactical/state.ts
  export interface GunRound { x: number; y: number; vx: number; vy: number; age: number; owner: number; active: boolean }
  export function emptyRound(): GunRound;
  // ShipSystems: gunHeat, gunLocked, gunCooldown, gunMuzzle, gunWear, gunHull, gunRoomWear: [number, number, number], gunShots, gunHits
  // TacticalState.rounds: GunRound[] (GUN_POOL long)
  // DuelEvent gains { kind: 'gunFire'; ship; muzzle } and { kind: 'gunHit'; ship; room; stripped; x; y }; hostile cause gains 'gun'
  // sim/tactical/gun.ts
  export function placeRound(state: TacticalState, r: Omit<GunRound, 'active'>): GunRound;
  export function tickGun(state: TacticalState, i: number, input: ShipInput): void;
  // sim/tactical/hash.ts
  export const ROUND_SLOT = 7; export const ROUND_KEYS: readonly ['x', 'y', 'vx', 'vy', 'age'];
  // scripts/golden/duelOracle.ts
  export const ADDITIONS: Readonly<Record<number, Migration>>;
  export function verifyDuelAdditive(): VersionOnlyResult;   // CLI: npx tsx scripts/golden/duel-oracle.ts added
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/valkyrnGun.test.ts`:

```ts
// Valkyrn-i (spec 2026-11-18-valkyrn-solo-ship-design §7.1, §7.3, §10 Gun): the minigun fires a round every 6 ticks
// while its trigger is held at an attended Weapons station, starboard muzzle first, at 700 u/s along the nose plus the
// ship's velocity; 50 heat a round, 4 a tick of cooling, a lockout at 1000 that cools 8 a tick and unlocks at 0;
// Weapons damage halves the coolings and level 2 stops fire; a new round takes the lowest free pool entry, else
// replaces the oldest; the gun state and the pool are hashed, snapshotted and bounded by the validator.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { GUN, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { placeRound } from '../src/renderer/src/sim/tactical/gun';
import { buildGrid } from '../src/renderer/src/sim/tactical/grid';
import { flattenTactical, TACTICAL_MODULES, validateTacticalValues } from '../src/renderer/src/sim/tactical/hash';
import { createTacticalState, Room, type DuelEvent, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { GUN_COOL, GUN_COOL_LOCKED, GUN_POOL } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT, tickWeapons, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { makeHostile } from './helpers/hostile';
import { createSeatedValkyrn, VALKYRN_TEST } from './helpers/valkyrnDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const TRIGGER: ShipInput = { ...IDLE_INPUT, gunHeld: true };
const HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false, gunHeld: true };
type GunFire = Extract<DuelEvent, { kind: 'gunFire' }>;
/** The crew ship of class `cls` at (−600, −300) facing east at rest, the enemy parked far off, no asteroids. */
function gunState(cls: number = ShipClass.Valkyrn): TacticalState {
  const st = makeHostile(createTacticalState(5, 2, cls));
  st.map = { ...st.map, asteroids: [] }; st.grid = buildGrid([], st.map.rMap);
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: 2600, y: 2600, vx: 0, vy: 0 });
  return st;
}
/** One weapons tick of the crew (commands, then the clocks); returns its gunFire events. */
function tick(st: TacticalState, input: ShipInput = TRIGGER): GunFire[] {
  st.events = [];
  applyWeaponsInput(st, 0, input); tickWeapons(st, 0, input);
  st.tick++;
  return st.events.filter((e): e is GunFire => e.kind === 'gunFire');
}
/** The ticks (from 0) on which the crew fired over n ticks. */
function fireTicks(st: TacticalState, n: number, input: ShipInput = TRIGGER): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) if (tick(st, input).length > 0) out.push(k);
  return out;
}

describe('firing (spec §7.1)', () => {
  it('a round every 6 ticks while held, starboard muzzle first, at 700 u/s along the nose plus the ship\'s velocity', () => {
    const st = gunState();
    st.ships[0].vx = 30;
    const events: GunFire[] = [];
    for (let k = 0; k < 30; k++) events.push(...tick(st));
    expect(events.map((e) => [e.ship, e.muzzle])).toEqual([[0, 0], [0, 1], [0, 0], [0, 1], [0, 0]]);
    expect(st.systems[0]).toMatchObject({ gunShots: 5, gunMuzzle: 1, gunCooldown: 1 });
    expect(st.rounds[0]).toMatchObject({ active: true, owner: 0, age: 0, x: -579, y: -288, vx: 730, vy: 0 });   // starboard: south of an east-facing nose
    expect(st.rounds[1]).toMatchObject({ active: true, owner: 0, x: -579, y: -312, vx: 730 });
    expect(st.rounds.filter((r) => r.active)).toHaveLength(5);
    expect(st.events.some((e) => e.kind === 'laser')).toBe(false);
  });
  it('needs the trigger held at an attended Weapons station, a gun, and Weapons below level 2', () => {
    expect(fireTicks(gunState(), 12, IDLE_INPUT)).toEqual([]);
    expect(fireTicks(gunState(), 12, { ...TRIGGER, weapons: false })).toEqual([]);
    expect(fireTicks(gunState(ShipClass.ValkyrnLaser), 12)).toEqual([]);
    const off = gunState(); off.systems[0].rooms[Room.Weapons] = 2;
    expect(fireTicks(off, 12)).toEqual([]);
    const one = gunState(); one.systems[0].rooms[Room.Weapons] = 1;
    expect(fireTicks(one, 12)).toEqual([0, 6]);
  });
  it('the heat: 50 a round, 4 a tick of cooling, so 26 net a round while firing', () => {
    const st = gunState();
    tick(st); expect(st.systems[0].gunHeat).toBe(50);
    for (let k = 0; k < 5; k++) tick(st, IDLE_INPUT);
    expect(st.systems[0].gunHeat).toBe(30);
    tick(st); expect(st.systems[0].gunHeat).toBe(76);
  });
  it('locks at 1000 on the 38th round from cold (tick 222), cools 8 a tick and fires again 125 ticks later', () => {
    const st = gunState(), fired: number[] = [];
    let locked = 0;
    for (let k = 0; k < 360; k++) { if (tick(st).length > 0) fired.push(k); if (st.systems[0].gunLocked) locked++; }
    expect(fired.slice(0, 3)).toEqual([0, 6, 12]);
    expect(fired.filter((k) => k <= 222)).toHaveLength(38);
    expect([fired[37], fired[38]]).toEqual([222, 347]);
    expect(locked).toBe(125);
  });
  it('Weapons damage halves both coolings (integer halves 2 and 4); at level 2 it does not fire', () => {
    expect([GUN_COOL / 2, GUN_COOL_LOCKED / 2]).toEqual([2, 4]);
    const st = gunState(); st.systems[0].rooms[Room.Weapons] = 1;
    tick(st); for (let k = 0; k < 5; k++) tick(st, IDLE_INPUT);
    expect(st.systems[0].gunHeat).toBe(40);
    Object.assign(st.systems[0], { gunHeat: GUN.heatMax, gunLocked: true });
    for (let k = 0; k < 10; k++) tick(st, IDLE_INPUT);
    expect([st.systems[0].gunHeat, st.systems[0].gunLocked]).toEqual([960, true]);
    const two = gunState(); two.systems[0].gunHeat = 100; two.systems[0].rooms[Room.Weapons] = 2;
    expect(fireTicks(two, 10)).toEqual([]);
    expect(two.systems[0].gunHeat).toBe(80);   // Decision 7: level 2 cools at the halved rate too
  });
  it('a new round takes the lowest free entry; with none free it replaces the oldest, the lowest index on a tie', () => {
    const st = createTacticalState(5, 2, ShipClass.Valkyrn), r = { x: 1, y: 2, vx: 3, vy: 4, age: 0, owner: 0 };
    expect(st.rounds).toHaveLength(GUN_POOL);
    Object.assign(st.rounds[0]!, { ...r, age: 5, active: true });
    expect(placeRound(st, r)).toBe(st.rounds[1]);
    st.rounds.forEach((e, k) => Object.assign(e, { ...r, active: true, age: [3, 9, 1, 9][k % 4]! }));
    expect(placeRound(st, { ...r, x: 99 })).toBe(st.rounds[1]);
    expect(st.rounds[1]).toMatchObject({ x: 99, age: 0, active: true });
  });
  it('through the duel step: the seated pilot\'s held trigger fires; standing, it does not', () => {
    const d = createSeatedValkyrn(5);
    try {
      stepDuelTick(d, { held: [HELD], commands: [] });
      expect(d.tactical.events.filter((e) => e.kind === 'gunFire')).toEqual([{ kind: 'gunFire', ship: 0, muzzle: 0 }]);
      stepDuelTick(d, { held: [HELD], commands: [{ runId: 'duel', id: { player: 0, sequence: 1 }, requestedTick: d.interior.tick, command: { kind: 'stand' } }] });
      for (let k = 0; k < 12; k++) stepDuelTick(d, { held: [HELD], commands: [] });
      expect(d.tactical.systems[0].gunShots).toBe(1);
    } finally { disposeDuel(d); }
  });
});

describe('the gun state in the hash, the snapshot and the validator (spec §7.3)', () => {
  /** The offset of a tactical field in flattenTactical's values. */
  const offsetOf = (s: TacticalState, name: string): number => {
    let at = 0;
    for (const m of TACTICAL_MODULES) for (const f of m.fields(s)) { if (f.name === name) return at; at += f.count; }
    throw new Error(`no tactical field ${name}`);
  };
  it('every ship starts with the gun state at zero and a free round pool', () => {
    for (const cls of [ShipClass.Cutter, ShipClass.Valkyrn]) {
      const st = createTacticalState(5, 2, cls);
      for (const s of st.systems) expect(s).toMatchObject({ gunHeat: 0, gunLocked: false, gunCooldown: 0, gunMuzzle: 0, gunWear: 0, gunHull: 0, gunRoomWear: [0, 0, 0], gunShots: 0, gunHits: 0 });
      expect(st.rounds.every((r) => !r.active && r.x === 0 && r.y === 0 && r.vx === 0 && r.vy === 0 && r.age === 0 && r.owner === 0)).toBe(true);
    }
  });
  it('the validator bounds the gun fields and the round pool', () => {
    const st = createTacticalState(5, 2, ShipClass.Valkyrn), shape = createTacticalState(5);
    placeRound(st, { x: 10, y: 20, vx: 700, vy: 0, age: 12, owner: 0 });
    Object.assign(st.systems[0], { gunHeat: 1000, gunLocked: true, gunCooldown: 6, gunMuzzle: 1, gunShots: 40, gunHits: 9 });
    Object.assign(st.systems[1], { gunWear: 7, gunHull: 2, gunRoomWear: [5, 5, 5] });
    const values = Array.from(flattenTactical(st));
    expect(validateTacticalValues(shape, values)).toBe(values.length);
    const bad = (name: string, k: number, v: number, why: RegExp): void => {
      const x = [...values]; x[offsetOf(st, name) + k] = v;
      expect(() => validateTacticalValues(shape, x), `${name}[${k}] = ${v}`).toThrow(why);
    };
    bad('systems.0.gunHeat', 0, 1001, /out of range/);
    bad('systems.0.gunLocked', 0, 2, /out of range/);
    bad('systems.0.gunCooldown', 0, 7, /out of range/);
    bad('systems.0.gunMuzzle', 0, 2, /out of range/);
    bad('systems.1.gunWear', 0, 8, /out of range/);
    bad('systems.1.gunHull', 0, 3, /out of range/);
    bad('systems.1.gunRoomWear', 2, 6, /out of range/);
    bad('systems.0.gunShots', 0, -1, /out of range/);
    bad('rounds.0.flight', 4, 53, /age out of range/);
    bad('rounds.0.owner', 0, 2, /owner is not an active ship slot/);
    bad('rounds.1.flight', 0, 5, /a free entry holds values/);
    bad('rounds.0.active', 0, 2, /not 0 or 1/);
  });
  it('a Valkyrn duel with a hot gun and rounds in flight saves, loads and hashes the same; the gun fields move the hash', () => {
    const d = createSeatedValkyrn(5);
    try {
      for (let k = 0; k < 13; k++) stepDuelTick(d, { held: [HELD], commands: [] });
      expect(d.tactical.systems[0].gunShots).toBe(3);
      expect(d.tactical.rounds.some((r) => r.active)).toBe(true);
      const r = loadDuelSnapshot(VALKYRN_TEST, JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST))), DIGEST);
      try {
        expect(hashDuel(r)).toBe(hashDuel(d));
        expect(r.tactical.systems[0]).toMatchObject({ gunHeat: d.tactical.systems[0].gunHeat, gunShots: 3, gunMuzzle: 1 });
        r.tactical.systems[1].gunRoomWear[2] = 1;
        expect(hashDuel(r)).not.toBe(hashDuel(d));
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/valkyrnGun.test.ts`
Expected: FAIL: `sim/tactical/gun` does not exist (`placeRound` cannot be imported).

- [ ] **Step 3: The state**

`src/renderer/src/sim/tactical/state.ts`:

- Replace the tuning import line with `import { DERELICT_FAR_MIN, DERELICT_NEAR_MIN, DERELICT_PHASE_DRAWS, DERELICT_SPAWN_CLEAR, GUN_POOL, HEADING_COUNT, HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_TRAIL_TICKS } from './tuning';`.
- In `interface ShipSystems`, after `missilesLaunched: number; missileHits: number; missilesLost: number;` (the telemetry counters line) add:

```ts
  /** Valkyrn spec §7.1, §7.2 (the gun; all zero on a class without one and on a ship nobody fires at): its heat
   *  0..heatMax, whether the lockout holds, the ticks until it may fire again, the next muzzle (0 starboard, 1 port); as a
   *  target, the round hits toward a shield layer, toward a hull point and toward each Room's next level; and the
   *  telemetry counters (rounds fired, rounds that hit). */
  gunHeat: number; gunLocked: boolean; gunCooldown: number; gunMuzzle: number;
  gunWear: number; gunHull: number; gunRoomWear: [number, number, number];
  gunShots: number; gunHits: number;
```

- After the `Missile` interface add:

```ts
/** Valkyrn spec §7.2: a gun round in the pool: its position, velocity (u/s) and ticks flown, the ship slot that fired
 *  it, and whether it flies. A free entry holds zeros. */
export interface GunRound { x: number; y: number; vx: number; vy: number; age: number; owner: number; active: boolean }
/** A free round pool entry. */
export function emptyRound(): GunRound { return { x: 0, y: 0, vx: 0, vy: 0, age: 0, owner: 0, active: false }; }
```

- In `DuelEvent`, replace the hostile member

```ts
  /** Sci-1 spec §4.6: the enemy turned hostile this tick, and why (laser before missile before clock). */
  | { kind: 'hostile'; cause: 'clock' | 'laser' | 'missile' }
```

with

```ts
  /** Sci-1 spec §4.6: the enemy turned hostile this tick, and why (laser before gun before missile before clock; Valkyrn spec §7.2). */
  | { kind: 'hostile'; cause: 'clock' | 'laser' | 'gun' | 'missile' }
  /** Valkyrn spec §7.1: ship `ship` fired a gun round from muzzle `muzzle` (0 starboard, 1 port). */
  | { kind: 'gunFire'; ship: number; muzzle: number }
  /** Valkyrn spec §7.2: a round hit ship `ship` (the target) at the closest-approach point (x, y): `room` the Room it
   *  struck, or −1 on a shield hit; `stripped` when that hit took a layer. */
  | { kind: 'gunHit'; ship: number; room: number; stripped: boolean; x: number; y: number }
```

- In `TacticalState`, after `missiles: Slots<Missile>;` add:

```ts
  /** Valkyrn spec §7.2: the gun round pool, GUN_POOL entries. */
  rounds: GunRound[];
```

- In `systemsFor`'s return replace `magazine: c.slots.missile.magazine, magazineClock: 0, shots: 0, laserHits: 0, layersStripped: 0, missilesLaunched: 0, missileHits: 0, missilesLost: 0` with `magazine: c.slots.missile.magazine, magazineClock: 0, shots: 0, laserHits: 0, layersStripped: 0, missilesLaunched: 0, missileHits: 0, missilesLost: 0,` + newline + `    gunHeat: 0, gunLocked: false, gunCooldown: 0, gunMuzzle: 0, gunWear: 0, gunHull: 0, gunRoomWear: [0, 0, 0], gunShots: 0, gunHits: 0`.
- In `emptySystems` replace `missileHits: 0, missilesLost: 0 };` with `missileHits: 0, missilesLost: 0,` + newline + `    gunHeat: 0, gunLocked: false, gunCooldown: 0, gunMuzzle: 0, gunWear: 0, gunHull: 0, gunRoomWear: [0, 0, 0], gunShots: 0, gunHits: 0 };`.
- In `createTacticalState`'s return, after `missiles: [emptyMissile(), emptyMissile(), ...extra.map(emptyMissile)],` add `rounds: Array.from({ length: GUN_POOL }, emptyRound),`.

- [ ] **Step 4: The gun**

Create `src/renderer/src/sim/tactical/gun.ts`:

```ts
// The gun (Valkyrn spec 2026-11-18-valkyrn-solo-ship-design §7.1, §7.2): a fixed minigun on a class whose gun slot is
// not null. tickGun runs from applyWeaponsInput every tick, before anything moves (where the laser fires): it cools the
// heat and counts the cooldown down, then fires a round from the pre-move pose while the trigger is held at an attended
// Weapons station. Rounds live in the fixed pool tactical.rounds. Only + − × ÷ and sqrt (the determinism guard).
import type { GunDef } from './defs';
import { hx, hy } from './direction';
import { classOf, Room, type GunRound, type TacticalState } from './state';
import type { ShipInput } from './weapons';

/** Put a round in the pool (spec §7.2): the lowest free entry, else the active round with the highest age, the lowest
 *  index on a tie. Returns its entry. */
export function placeRound(state: TacticalState, r: Omit<GunRound, 'active'>): GunRound {
  let k = state.rounds.findIndex((e) => !e.active);
  if (k < 0) { k = 0; for (let j = 1; j < state.rounds.length; j++) if (state.rounds[j]!.age > state.rounds[k]!.age) k = j; }
  const e = state.rounds[k]!;
  Object.assign(e, { x: r.x, y: r.y, vx: r.vx, vy: r.vy, age: r.age, owner: r.owner, active: true });
  return e;
}

/** One round from ship i's next muzzle: `muzzleForward` ahead of the centre and `muzzleLateral` to starboard (90°
 *  clockwise of the nose, (−hy, hx)) or port, at `speed` along the nose plus the ship's velocity; the muzzles alternate,
 *  the cooldown restarts, and the heat rises, locking the gun when it reaches heatMax. */
function fireRound(state: TacticalState, i: number, g: GunDef): void {
  const ship = state.ships[i]!, s = state.systems[i]!, h0 = hx(ship.heading), h1 = hy(ship.heading), side = s.gunMuzzle === 0 ? 1 : -1;
  placeRound(state, {
    x: ship.x + h0 * g.muzzleForward - h1 * g.muzzleLateral * side, y: ship.y + h1 * g.muzzleForward + h0 * g.muzzleLateral * side,
    vx: ship.vx + h0 * g.speed, vy: ship.vy + h1 * g.speed, age: 0, owner: i
  });
  state.events.push({ kind: 'gunFire', ship: i, muzzle: s.gunMuzzle });
  s.gunMuzzle = 1 - s.gunMuzzle; s.gunCooldown = g.intervalTicks; s.gunShots++;
  s.gunHeat = Math.min(g.heatMax, s.gunHeat + g.heatPerShot);
  if (s.gunHeat >= g.heatMax) s.gunLocked = true;
}

/**
 * One tick of ship i's gun (spec §7.1), every tick whether or not anyone is at Weapons: the heat cools by `cool` (by
 * `coolLocked` while locked; both halved while Weapons is damaged, Decision 7) and a locked gun unlocks at 0; the
 * cooldown counts down; then a round fires when the trigger is held at an attended Weapons station, the gun is not
 * locked, Weapons is below level 2 and the cooldown is 0. A class without a gun does nothing.
 */
export function tickGun(state: TacticalState, i: number, input: ShipInput): void {
  const g = classOf(state, i).slots.gun;
  if (g === null) return;
  const s = state.systems[i]!, cool = s.gunLocked ? g.coolLocked : g.cool;
  s.gunHeat = Math.max(0, s.gunHeat - (s.rooms[Room.Weapons] >= 1 ? cool / 2 : cool));
  if (s.gunLocked && s.gunHeat === 0) s.gunLocked = false;
  if (s.gunCooldown > 0) s.gunCooldown--;
  if (!input.weapons || !input.gunHeld || s.gunLocked || s.rooms[Room.Weapons] >= 2 || s.gunCooldown > 0) return;
  fireRound(state, i, g);
}
```

`src/renderer/src/sim/tactical/weapons.ts`: add `import { tickGun } from './gun';` after `import { launchMissile } from './missiles';`, and in `applyWeaponsInput` replace

```ts
  stepBurst(state, i);
  if (!input.weapons) { s.fireHeld = false; return; }   // unattended: Fire lets go without firing or discarding
```

with

```ts
  stepBurst(state, i);
  tickGun(state, i, input);   // Valkyrn spec §7.1: before anything moves; its clocks run attended or not (Decision 8)
  if (!input.weapons) { s.fireHeld = false; return; }   // unattended: Fire lets go without firing or discarding
```

- [ ] **Step 5: The hash, the validator and the clone**

`src/renderer/src/sim/tactical/hash.ts`:

- Replace the tuning import with `import { DERELICT_FAR_MAX, DERELICT_FAR_MIN, DERELICT_NEAR_MAX, DERELICT_NEAR_MIN, GUN_POOL, HEADING_COUNT, HUNTER_TRAIL_TICKS, SCAN_RATE_OTHER, SCAN_RATE_SCIENCE } from './tuning';` and the state import with `import { emptyMissile, emptyRound, HunterMode, Outcome, type GunRound, type Missile, type MissileFlight, type Ship, type ShipSystems, type TacticalState } from './state';`.
- Replace `SYSTEMS_TAIL` and `FLAGS` (L21-L23) with:

```ts
const SYSTEMS_TAIL = ['shields', 'shieldClock', 'laserCharge', 'laserHold', 'fireHeld', 'lock', 'freq', 'laserTargeted', 'torpLock', 'torpRoom', 'laserBurst', 'laserBurstClock', 'magazine', 'magazineClock',
  'shots', 'laserHits', 'layersStripped', 'missilesLaunched', 'missileHits', 'missilesLost',
  'gunHeat', 'gunLocked', 'gunCooldown', 'gunMuzzle', 'gunWear', 'gunHull', 'gunShots', 'gunHits'] as const satisfies readonly (keyof ShipSystems)[];   // the gun's, Valkyrn spec §7.3; gunRoomWear closes the record
const FLAGS = new Set<string>(['released', 'fireHeld', 'laserTargeted', 'gunLocked']);
```

- After the `missileKeysComplete` lines (L25-L28) add:

```ts
/** Values per round pool entry: active, owner, then x, y, vx, vy, age (zeros when free); Valkyrn spec §7.3. */
export const ROUND_SLOT = 7;
export const ROUND_KEYS = ['x', 'y', 'vx', 'vy', 'age'] as const satisfies readonly (keyof GunRound)[];
/** Compile-time completeness: a `GunRound` member missing from these keys makes this `never` assignment fail typecheck. */
type MissingRoundKeys = Exclude<keyof GunRound, (typeof ROUND_KEYS)[number] | 'active' | 'owner'>;
const roundKeysComplete: MissingRoundKeys extends never ? true : never = true;
void roundKeysComplete;
```

- After `missileFields` add:

```ts
/** Round pool entry k (Valkyrn spec §7.3): active, owner, then its flight; a free entry holds only zeros. */
function roundFields(k: number): ModuleField<TacticalState>[] {
  return [
    bit(`rounds.${k}.active`, (s) => s.rounds[k]!.active, (s, v) => { s.rounds[k]!.active = v; }),
    scalar(`rounds.${k}.owner`, (s) => s.rounds[k]!.owner, (s, v) => { s.rounds[k]!.owner = v; }),
    {
      name: `rounds.${k}.flight`, count: ROUND_KEYS.length,
      read(s, out) { const r = s.rounds[k]!; for (const key of ROUND_KEYS) out.push(r[key]); },
      write(s, values, offset) {
        const r = s.rounds[k]!;
        if (!r.active && (r.owner !== 0 || ROUND_KEYS.some((_, j) => values[offset + j] !== 0))) throw new Error(`rounds.${k}: a free entry holds values`);
        ROUND_KEYS.forEach((key, j) => { r[key] = values[offset + j]!; });
      }
    }
  ];
}
```

- In `spaceFields` after `for (let k = 0; k < slots; k++) fields.push(...missileFields(k));` add `for (let k = 0; k < GUN_POOL; k++) fields.push(...roundFields(k));   // Valkyrn spec §7.3: the round pool, after the missiles`.
- In `shipFields`, after `for (const key of SYSTEMS_TAIL) fields.push(systemsField(i, key));` add `fields.push(vector(\`systems.${i}.gunRoomWear\`, 3, (s) => s.systems[i]!.gunRoomWear));   // Valkyrn spec §7.3`.
- In `cloneTacticalFromModule` replace `systems: s.systems.map((y) => ({ ...y, rooms: [0, 0, 0] })) as TacticalState['systems'],` with `systems: s.systems.map((y) => ({ ...y, rooms: [0, 0, 0], gunRoomWear: [0, 0, 0] })) as TacticalState['systems'],` and after `missiles: s.missiles.map(emptyMissile) as TacticalState['missiles'],` add `rounds: s.rounds.map(emptyRound),`.
- In `systemsRules`, replace `shots: count, laserHits: count, layersStripped: count, missilesLaunched: count, missileHits: count, missilesLost: count` with:

```ts
  shots: count, laserHits: count, layersStripped: count, missilesLaunched: count, missileHits: count, missilesLost: count,
  // Valkyrn spec §7.3: heat 0..heatMax, cooldown 0..interval, muzzle 0..1, wear below each threshold, counts ≥ 0.
  gunHeat: within(0, most((c) => c.slots.gun?.heatMax)), gunLocked: flagBit, gunCooldown: within(0, most((c) => c.slots.gun?.intervalTicks)), gunMuzzle: within(0, 1),
  gunWear: within(0, most((c) => c.slots.gun?.hitsPerLayer) - 1), gunHull: within(0, most((c) => c.slots.gun?.hitsPerHull) - 1),
  gunRoomWear: within(0, most((c) => c.slots.gun?.hitsPerLevel) - 1), gunShots: count, gunHits: count
```

- In `validateTacticalValues`: replace `const ship = /^(ships|systems)\.(\d+)\.(.+)$/.exec(f.name), missile = /^missiles\.(\d+)\.(.+)$/.exec(f.name);` with `const ship = /^(ships|systems)\.(\d+)\.(.+)$/.exec(f.name), missile = /^missiles\.(\d+)\.(.+)$/.exec(f.name), round = /^rounds\.(\d+)\.(.+)$/.exec(f.name);`, and after the missile branch's closing `}` (the line ending `bad('heading, headingAcc or age out of range'); }` followed by `    } else if (f.name === 'known')`) change `} else if (f.name === 'known')` to:

```ts
    } else if (round) {   // Valkyrn spec §7.3: a round's entry as a missile's, its age within the longest gun life
      const key = round[2]!, active = values[at - (key === 'active' ? 0 : key === 'owner' ? 1 : 2)]!;
      if (key === 'active' && !flagBit(slice[0]!)) bad('active is not 0 or 1');
      if (active === 0 && slice.some((v) => v !== 0)) bad('a free entry holds values');
      if (active === 1 && key === 'owner' && (!within(0, slots - 1)(slice[0]!) || inactive.has(slice[0]!))) bad('its owner is not an active ship slot');
      if (active === 1 && key === 'flight' && !within(0, most((c) => c.slots.gun?.lifeTicks))(slice[4]!)) bad('age out of range');
    } else if (f.name === 'known')
```

(and update the function's doc comment: after `its heading index and age.` add ` Each round pool entry likewise: active 0 or 1, a free entry holds only zeros, an owner that is an active slot, an age within the longest gun life.`).

- [ ] **Step 6: The existing tests the new fields touch**

`tests/tacticalDeterminism.test.ts` (the flatten key guard, L115-L123):
- the `st.systems[0]` keys list becomes `['cls', 'fireHeld', 'freq', 'gunCooldown', 'gunHeat', 'gunHits', 'gunHull', 'gunLocked', 'gunMuzzle', 'gunRoomWear', 'gunShots', 'gunWear', 'hull', 'laserBurst', 'laserBurstClock', 'laserCharge', 'laserHits', 'laserHold', 'laserTargeted', 'layersStripped', 'lock', 'magazine', 'magazineClock', 'missileHits', 'missilesLaunched', 'missilesLost', 'rooms', 'shieldClock', 'shields', 'shots', 'target', 'torpLock', 'torpRoom']`;
- the `st` keys list gains `'rounds'` between `'rng'` and `'scan'`;
- add `ROUND_SLOT` to its `sim/tactical/hash` import and `GUN_POOL` to a `sim/tactical/tuning` import, and the length line becomes
  ```ts
    expect(flattenTactical(st).length).toBe(6 + 2 * (13 + st.map.asteroids.length + 2) + 2 * MISSILE_SLOT + GUN_POOL * ROUND_SLOT + 7 + st.hunter.trail.length + 2 * 37 + 17);
  ```
  and its comment gains `; the round pool GUN_POOL × ROUND_SLOT (Valkyrn spec §7.3); per slot 8 more scalars and the 3 gunRoomWear`.

`tests/duelModules.test.ts`:
- add `ROUND_KEYS` to the `sim/tactical/hash` import;
- `tacticalNames` becomes
  ```ts
  const tacticalNames = (s: TacticalState) => new Set([...TACTICAL_MODULES.flatMap((m) => [...names(m, s)]),
    ...s.missiles.flatMap((_, k) => MISSILE_KEYS.map((key) => `missiles.${k}.${key}`)),
    ...s.rounds.flatMap((_, k) => ROUND_KEYS.map((key) => `rounds.${k}.${key}`))]);   // Valkyrn-i: a round pool entry as a missile's
  ```
- after `bothFlying` add
  ```ts
  /** Every round pool entry in flight (Valkyrn-i), so every round field holds values a writer accepts when changed. */
  function allRoundsFlying(s: TacticalState): void {
    s.rounds.forEach((r, k) => Object.assign(r, { active: true, owner: k % 2, x: 10 + k, y: -20, vx: 700, vy: 0, age: 1 + (k % 50) }));
  }
  ```
  and in the test `every space, ship, science, presence and repair field changes the duel hash` call `allRoundsFlying(d.tactical);` right after `bothFlying(d.tactical);`;
- `changedFirst`'s flag regex `/\.(active|released|fireHeld|laserTargeted)$/` becomes `/\.(active|released|fireHeld|laserTargeted|gunLocked)$/`.

- [ ] **Step 7: The same-version oracle mode `added` (Decision 1)**

`scripts/golden/duelOracle.ts`:
- After the closing `};` of `MIGRATIONS` add:

```ts
/** Same-version additions, keyed by the current SIM_VERSION (Valkyrn-i plan Decision 1): new fields with no old
 *  counterpart that a change adds without a bump. `duel-oracle.ts added` maps every baseline field to itself, requires
 *  every new field to match one of these, and every run identical at every tick (values, results, events, telemetry). */
export const ADDITIONS: Readonly<Record<number, Migration>> = {
  /** Valkyrn-i (53): the gun's state on every systems record and the round pool; no oracle run has a gun, so they stay
   *  at their first recorded value (0), which `frozen` makes recordRun check at every tick. */
  53: { change: 'Valkyrn-i: the gun state and the round pool', rename: () => undefined, derived: [], frozen: true,
    added: [/^space\.rounds\.\d+\.(active|owner|flight)$/, /^ship\.systems\.\d+\.gun(Heat|Locked|Cooldown|Muzzle|Wear|Hull|RoomWear|Shots|Hits)$/] }
};
```

- In `interface Migration`, after `readonly added: readonly RegExp[];` add:

```ts
  /** ADDITIONS only (Valkyrn-i): every current field matching `added` must hold its first recorded value at every
   *  recorded tick, so an additive change that moves a new field in a run that never uses it fails the oracle. */
  readonly frozen?: boolean;
```

- In `recordRun`, after the line `const plan = aliasPlan(target.names, target.counts, now.names, now.counts, schema?.migration);` add:

```ts
    // Frozen additions (Migration.frozen): the offsets, in the current flattened values, of every field declared added.
    const frozen: { name: string; offset: number; count: number }[] = [], moved = new Set<string>(), added = schema?.migration;
    let firstValues: Float64Array | undefined;
    if (added?.frozen) { let o = 0; now.names.forEach((n, k) => { if (added.added.some((p) => p.test(n))) frozen.push({ name: n, offset: o, count: now.counts[k]! }); o += now.counts[k]!; }); }
```

  in `record`, after `const values = plan.build(all.subarray(1));` add:

```ts
      if (frozen.length > 0) {
        const flat = all.subarray(1);
        firstValues ??= Float64Array.from(flat);
        for (const f of frozen) for (let j = 0; j < f.count; j++) if (flat[f.offset + j] !== firstValues[f.offset + j]) { moved.add(f.name); break; }
      }
```

  and replace `return { problems: plan.problems, hashes, rematch, run };` with:

```ts
    const frozenProblems = [...moved].map((n) => `added field ${n} changed during the run (declared added at the same version, it must hold its first recorded value)`);
    return { problems: [...plan.problems, ...frozenProblems], hashes, rematch, run };
```

  (`judgeDuelOracle` already prefixes a run's problems with its id and fails on any.)

- Replace `judgeDuelOracle`'s doc comment and signature with:

```ts
/** Compare a baseline with the current code (pure apart from `rerun`). `mode` 'bump' requires SIM_VERSION to be the
 *  baseline's plus 1 and applies MIGRATIONS[baseline]; 'same' requires the same version and no migration; 'added'
 *  (Valkyrn-i) requires the same version and applies ADDITIONS[version], which only declares new fields. */
export function judgeDuelOracle(was: OracleTrace | undefined, rerun: (spec: OracleRunSpec, schema: { names: readonly string[]; counts: readonly number[]; migration?: Migration }) => { run: OracleRun; problems: string[] },
  root: string, mode: 'bump' | 'same' | 'added', version = SIM_VERSION, migrations: Readonly<Record<number, Migration>> = MIGRATIONS, stored?: DuelGoldenCheckpoints, storedRematch?: RematchGoldenCheckpoints,
  additions: Readonly<Record<number, Migration>> = ADDITIONS): VersionOnlyResult {
```

- In its body replace `if (mode === 'same' && version !== was.simVersion) return` with `if (mode !== 'bump' && version !== was.simVersion) return` (the message is unchanged), add after that line:

```ts
  if (mode === 'added' && !additions[version]) return { ok: false, message: `no same-version additions are declared at sim version ${version} (ADDITIONS in scripts/golden/duelOracle.ts)` };
```

  replace `const migration = mode === 'bump' ? migrations[was.simVersion] : undefined, problems: string[] = [];` with `const migration = mode === 'bump' ? migrations[was.simVersion] : mode === 'added' ? additions[version] : undefined, problems: string[] = [];`, and replace `const how = migration ? \`through the ${was.simVersion} → ${version} alias table (${migration.change})\` : 'field for field';` with:

```ts
  const how = !migration ? 'field for field' : mode === 'added' ? `with the fields declared added at ${version} (${migration.change})` : `through the ${was.simVersion} → ${version} alias table (${migration.change})`;
```

- After `verifyDuelUnchanged` add:

```ts
/** The same-version proof for an additive change (Valkyrn-i): every old field unchanged per tick, the new ones declared in ADDITIONS. */
export function verifyDuelAdditive(): VersionOnlyResult { return judgeDuelOracle(readBaseline(), recordRun, repoRoot(), 'added'); }
```

`scripts/golden/duel-oracle.ts`: add to the usage comment the line `//   npx tsx scripts/golden/duel-oracle.ts added      after an additive change that keeps SIM_VERSION: exits 1 unless every run matches with only ADDITIONS' fields new`; replace the import with `import { oracleCounts, oracleTrace, ORACLE_FILE, verifyDuelAdditive, verifyDuelOracle, verifyDuelUnchanged } from './duelOracle';`; replace

```ts
} else if (mode === 'check' || mode === 'same') {
  const r = mode === 'check' ? verifyDuelOracle() : verifyDuelUnchanged();
```

with

```ts
} else if (mode === 'check' || mode === 'same' || mode === 'added') {
  const r = mode === 'check' ? verifyDuelOracle() : mode === 'same' ? verifyDuelUnchanged() : verifyDuelAdditive();
```

and the usage error `'usage: npx tsx scripts/golden/duel-oracle.ts baseline|check|same'` with `'usage: npx tsx scripts/golden/duel-oracle.ts baseline|check|same|added'`.

`tests/duelOracle.test.ts`: at the end of `describe('the judge', …)` (after its last `it`) add:

```ts
  it('the added mode (Valkyrn-i): the same version, through the declared additions only', () => {
    const runs = ORACLE_RUNS.map((s) => okRun(s.id)), seen: (string | undefined)[] = [], additions = { 37: { ...none, change: 'R-added' } };
    const r = judgeDuelOracle(trace({ runs }), (spec, schema) => { seen.push(schema.migration?.change); return { problems: [], run: runs.find((x) => x.id === spec.id)! }; },
      '/repo', 'added', 37, { 37: { ...none, change: 'R-test' } }, undefined, undefined, additions);
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/with the fields declared added at 37 \(R-added\), sim version 37 → 37/);
    expect(seen).toEqual(ORACLE_RUNS.map(() => 'R-added'));
    expect(judgeDuelOracle(trace({ runs }), rerun, '/repo', 'added', 38, {}, undefined, undefined, additions).message).toMatch(/use `check` for a bump/);
    expect(judgeDuelOracle(trace({ runs }), rerun, '/repo', 'added', 37, {}, undefined, undefined, {}).message).toMatch(/no same-version additions are declared at sim version 37/);
  });
```

and at the end of `describe('the per-tick record', …)` add:

```ts
  it('frozen additions (Valkyrn-i): a declared-added field that moves during the run is a problem', () => {
    const was = recordRun(SHORT).run;
    const freeze = (re: RegExp): Migration => ({ ...none, added: [re], frozen: true });
    // space.ships.0.x first moves on tick 265 (the test above), inside SHORT's 300 ticks.
    expect(recordRun(SHORT, { names: was.names, counts: was.counts, migration: freeze(/^space\.ships\.0\.x$/) }).problems)
      .toEqual(['added field space.ships.0.x changed during the run (declared added at the same version, it must hold its first recorded value)']);
    expect(recordRun(SHORT, { names: was.names, counts: was.counts, migration: { ...freeze(/^space\.ships\.0\.x$/), frozen: false } }).problems).toEqual([]);
  }, 30_000);
```

(`none`, `okRun`, `trace` and `rerun` are the file's existing helpers; if `okRun` is declared after the tests that use it, keep the new test after that declaration.)

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npx vitest run tests/valkyrnGun.test.ts tests/valkyrnClasses.test.ts tests/valkyrnCrew.test.ts tests/valkyrnFlight.test.ts tests/duelModules.test.ts tests/tacticalDeterminism.test.ts tests/duelOracle.test.ts tests/tacticalSlots.test.ts tests/weaponsUpdate.test.ts tests/duelSnapshot.test.ts tests/duelCheckpoint.test.ts tests/determinismGuard.test.ts`
Expected: PASS, except that `tests/duelOracle.test.ts` and anything comparing against the stored duel goldens may now fail on hashes only; the goldens are re-blessed in Step 10.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 9: Prove every run unchanged apart from the added fields**

Run: `npx tsx scripts/golden/duel-oracle.ts added`
Expected: `duel oracle: <R> runs, <T> ticks, <F> named fields, results, events and telemetry identical at every tick with the fields declared added at 53 (Valkyrn-i: the gun state and the round pool), sim version 53 → 53 (baseline HEAD <sha>)`, exit 0.

Run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: `per-tick canonical trace unchanged at sim version 53: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD <sha>)`, exit 0.

If either fails, a run changed: find it and fix it; never bless past it.

- [ ] **Step 10: The same-version bless, and the proof that only hashes moved**

Run: `npm run bless`
Expected, exit 0: four `blessed …` lines whose counts, ticks, outcomes, rematch tick and rounds equal Task 1 Step 5's (`30 checkpoints, 18155 ticks, outcome 1` and `55 checkpoints, rematch on tick 18155, rounds 18155 ticks outcome 1 then 15320 ticks outcome 1`); only the hex hashes differ.

Run: `git status --short tests/golden tests/fixtures`
Expected: exactly `M tests/golden/basic.json`, `M tests/golden/duel-1.json` and `M tests/golden/duel-rematch.json` (the determinism fixture does not move: its bless restages only `fixture.expected`; `basic.json` moves because it embeds the content digest, which Tasks 2 to 5's source edits change).

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0 (compared with the copy Task 2 Step 1 recorded: only the `contentDigest` strings moved).

Run: `git diff -U0 -- tests/golden/duel-1.json tests/golden/duel-rematch.json | grep -E '^[-+] ' | grep -vE '^[-+] +"[0-9a-f]{8}",?$|"finalHash"'`
Expected: no output (every changed line is a checkpoint hash or a final hash).

- [ ] **Step 11: The full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS (`tests/duelGates.test.ts` with its numbers unchanged).

- [ ] **Step 12: Commit**

```bash
git add src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/hash.ts scripts/golden/duelOracle.ts scripts/golden/duel-oracle.ts tests/valkyrnGun.test.ts tests/duelModules.test.ts tests/tacticalDeterminism.test.ts tests/duelOracle.test.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json
git commit -m "feat(valkyrn): the minigun fires (interval, alternate muzzles, heat and lockout, the round pool); gun state hashed, snapshotted and bounded; same-version bless after the oracle's new added mode proves every run unchanged" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Rounds fly and hit: the sweep, shield wear, hull and Room wear by closest approach, repair, hostility

**Files:**
- Modify: `src/renderer/src/sim/tactical/gun.ts` (imports, `segmentEntry`, `closest`, `gunRoomOf`, the hit, `stepRounds`), `src/renderer/src/sim/tactical/duel.ts` (import, the step, its doc comment), `src/renderer/src/sim/tactical/science.ts:34-40` (`hostilityStep`), `src/renderer/src/sim/tactical/weapons.ts` (`shoot`'s strip), `src/renderer/src/sim/tactical/hunter.ts:67` (`updateRepair`), `src/renderer/src/sim/duel/step.ts:87` (`repairPhase`)
- Create: `tests/valkyrnRounds.test.ts`

**Interfaces:**
- Consumes: Task 5's pool, `placeRound`, gun fields and events.
- Produces:
  ```ts
  // sim/tactical/gun.ts
  export function stepRounds(state: TacticalState): void;
  export function gunRoomOf(state: TacticalState, target: number, ox: number, oy: number, nx: number, ny: number): 0 | 1 | 2;
  // stepDuel: … resolveContacts, resolveMissiles, stepRounds, weapon clocks …; hostile cause 'gun'
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/valkyrnRounds.test.ts`:

```ts
// Valkyrn-i (spec 2026-11-18-valkyrn-solo-ship-design §7.2, §10 Gun): rounds move on their spawn tick and are swept as
// segments against the other ships' post-move circles, the asteroids and the planet; the first contact ends them, so
// does their life; never their own ship. A shielded enemy wears a layer away in 8 hits (any strip zeroes the wear); an
// unshielded one loses a hull point every 3 hits and a Room level every 6, the Room by the closest approach of the
// round's line to the post-move centre on the post-move nose axis; repair zeroes a Room's wear; the first round turns
// the enemy hostile with cause gun.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { Position } from '../src/renderer/src/sim/components';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { gunRoomOf, placeRound, stepRounds } from '../src/renderer/src/sim/tactical/gun';
import { buildGrid } from '../src/renderer/src/sim/tactical/grid';
import { hunterThink } from '../src/renderer/src/sim/tactical/hunter';
import { flySlot } from '../src/renderer/src/sim/tactical/physics';
import { createTacticalState, Outcome, Room, type DuelEvent, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { DEFAULT_FLIGHT, GUN_LIFE_TICKS, LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT, tickWeapons } from '../src/renderer/src/sim/tactical/weapons';
import { holding, makeHostile } from './helpers/hostile';
import { createValkyrnDuel } from './helpers/valkyrnDuel';

type GunHit = Extract<DuelEvent, { kind: 'gunHit' }>;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The Hunter's centre in `range()`. */
const H = { x: -300, y: -300 };
/** The gun Valkyrn at (−600, −300) facing east and the Hunter at H nose north (heading 0), both at rest, hostile, no
 *  asteroids; the Hunter's shields set to `shields`. */
function range(shields = 2): TacticalState {
  const st = makeHostile(createTacticalState(5, 2, ShipClass.Valkyrn));
  st.map = { ...st.map, asteroids: [] }; st.grid = buildGrid([], st.map.rMap);
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: H.x, y: H.y, vx: 0, vy: 0, heading: 0 });
  st.systems[1].shields = shields;
  return st;
}
const hitsOf = (st: TacticalState): GunHit[] => st.events.filter((e): e is GunHit => e.kind === 'gunHit');
/** One crew round from (x, y) at (vx, vy), stepped (rounds only) until it ends; returns its gunHit events. */
function shoot(st: TacticalState, x: number, y: number, vx: number, vy: number): GunHit[] {
  const r = placeRound(st, { x, y, vx, vy, age: 0, owner: 0 }), out: GunHit[] = [];
  for (let k = 0; k < GUN_LIFE_TICKS && r.active; k++) { st.events = []; stepRounds(st); out.push(...hitsOf(st)); }
  return out;
}
/** A round flying east past the Hunter's centre, `dy` across its nose axis (negative: fore, as the nose points north). */
const across = (st: TacticalState, dy: number): GunHit[] => shoot(st, H.x - 30, H.y + dy, 700, 0);

describe('rounds (spec §7.2)', () => {
  it('a round moves on its spawn tick and ends at its life, leaving a free entry of zeros', () => {
    const st = range(); Object.assign(st.ships[1], { x: 2600, y: 2600 });
    st.events = []; applyWeaponsInput(st, 0, { ...IDLE_INPUT, gunHeld: true }); tickWeapons(st, 0, IDLE_INPUT); stepRounds(st);
    const r = st.rounds[0]!;
    expect([r.active, r.age, r.y]).toEqual([true, 1, -288]);
    expect(r.x).toBeCloseTo(-579 + 700 / 60, 9);
    for (let k = 1; k < GUN_LIFE_TICKS - 1; k++) stepRounds(st);
    expect([r.active, r.age]).toEqual([true, GUN_LIFE_TICKS - 1]);
    stepRounds(st);
    expect(r).toEqual({ x: 0, y: 0, vx: 0, vy: 0, age: 0, owner: 0, active: false });
  });
  it('a round ends on the enemy, an asteroid or the planet; it never hits its own ship', () => {
    const st = range();
    expect(across(st, 12)).toHaveLength(1);
    expect(st.rounds.every((r) => !r.active)).toBe(true);
    const rock = createTacticalState(5, 2, ShipClass.Valkyrn), a = rock.map.asteroids[0]!;
    Object.assign(rock.ships[1], { x: 0, y: 500 });   // far from the rock
    const onRock = placeRound(rock, { x: a.x - a.r - 30, y: a.y, vx: 700, vy: 0, age: 0, owner: 0 });
    for (let k = 0; k < 4; k++) { rock.events = []; stepRounds(rock); expect(hitsOf(rock)).toEqual([]); }
    expect(onRock.active).toBe(false);
    const planet = createTacticalState(5, 2, ShipClass.Valkyrn);
    Object.assign(planet.ships[1], { x: 0, y: 900 });
    const onPlanet = placeRound(planet, { x: 300, y: 0, vx: -700, vy: 0, age: 0, owner: 0 });
    let ticks = 0;
    while (onPlanet.active && ticks < 30) { planet.events = []; stepRounds(planet); ticks++; expect(hitsOf(planet)).toEqual([]); }
    expect(ticks).toBe(20);   // (300 − 70) / (700 / 60) = 19.7: the 20th step crosses the surface
    const own = range(); Object.assign(own.ships[1], { x: 2600, y: 2600 });
    const inside = placeRound(own, { x: -600, y: -300, vx: 700, vy: 0, age: 0, owner: 0 });   // spawned inside its own ship
    own.events = []; stepRounds(own);
    expect([inside.active, hitsOf(own)]).toEqual([true, []]);
  });
  it('the first contact along a tick\'s segment ends it: the ship before the planet', () => {
    const st = createTacticalState(5, 2, ShipClass.Valkyrn);
    Object.assign(st.ships[1], { x: 120, y: 0, heading: 0 }); st.systems[1].shields = 1;
    const r = placeRound(st, { x: 150, y: 0, vx: -6000, vy: 0, age: 0, owner: 0 });   // 100 u this tick: enters the ship at t 0.1, the planet at 0.8
    stepRounds(st);
    expect([r.active, hitsOf(st).length]).toEqual([false, 1]);
  });
});

describe('hits (spec §7.2)', () => {
  it('a shielded enemy: 8 hits strip a layer, flagged stripped, the wear back to 0', () => {
    const st = range(2);
    for (let k = 0; k < 7; k++) across(st, 0);
    expect([st.systems[1].shields, st.systems[1].gunWear, st.systems[0].gunHits]).toEqual([2, 7, 7]);
    const eighth = across(st, 0);
    expect(eighth).toHaveLength(1);
    expect(eighth[0]).toMatchObject({ kind: 'gunHit', ship: 1, room: -1, stripped: true });
    expect(eighth[0]!.x).toBeCloseTo(H.x, 6);
    expect(eighth[0]!.y).toBeCloseTo(H.y, 6);
    expect([st.systems[1].shields, st.systems[1].shieldClock, st.systems[1].gunWear, st.systems[1].hull, st.systems[0].layersStripped]).toEqual([1, 0, 0, 70, 0]);
  });
  it('any strip zeroes the wear: a laser strip of the crew ship', () => {
    const st = range(2);
    st.systems[0].gunWear = 5;
    Object.assign(st.ships[1], { heading: 192 });   // the Hunter faces the crew 300 units west: in arc and range
    st.systems[1].laserCharge = LASER_CHARGE_UNITS; st.systems[1].fireHeld = true;
    st.events = []; applyWeaponsInput(st, 1, { ...IDLE_INPUT, laserCharge: false });
    expect(st.events.some((e) => e.kind === 'laser' && e.stripped)).toBe(true);
    expect([st.systems[0].shields, st.systems[0].gunWear]).toEqual([1, 0]);
  });
  it('an unshielded enemy: the Room by the closest approach on its nose axis; side-on fore Weapons, aft Engines; along the axis Shields', () => {
    const st = range(0);
    expect(across(st, -10)[0]).toMatchObject({ ship: 1, room: Room.Weapons, stripped: false });
    expect(across(st, 10)[0]).toMatchObject({ room: Room.Engines });
    expect(across(st, 0)[0]).toMatchObject({ room: Room.Shields });
    expect(shoot(st, H.x + 15, H.y - 30, 0, 700)[0]).toMatchObject({ room: Room.Shields });    // from ahead, at the nose
    expect(shoot(st, H.x - 15, H.y + 30, 0, -700)[0]).toMatchObject({ room: Room.Shields });   // from astern
  });
  it('gunRoomOf: exactly ±r/3 is Shields; the line counts, not where it crossed the edge', () => {
    const st = createTacticalState(5, 2, ShipClass.Valkyrn);
    Object.assign(st.ships[1], { x: 0, y: 0, heading: 0 });
    expect(gunRoomOf(st, 1, -30, -20 / 3, -20, -20 / 3)).toBe(Room.Shields);
    expect(gunRoomOf(st, 1, -30, 20 / 3, -20, 20 / 3)).toBe(Room.Shields);
    expect(gunRoomOf(st, 1, -30, -7, -20, -7)).toBe(Room.Weapons);
    expect(gunRoomOf(st, 1, -30, 7, -20, 7)).toBe(Room.Engines);
    Object.assign(st.ships[1], { heading: 64 });   // nose east: a shot from the west runs along the axis
    expect(gunRoomOf(st, 1, -30, -7, -20, -7)).toBe(Room.Shields);
  });
  it('uses the post-move centre and heading: the Hunter at full thrust, nose north at 600 u/s, turning', () => {
    const st = range(0);
    Object.assign(st.ships[1], { vy: -600 });
    const r = placeRound(st, { x: H.x - 25, y: H.y - 8, vx: 700, vy: 0, age: 0, owner: 0 });
    expect(gunRoomOf(st, 1, r.x, r.y, r.x + 700 / 60, r.y)).toBe(Room.Weapons);   // before the move: 8 fore of the centre
    flySlot(st, 1, { turn: 1, thrust: 1 }, DEFAULT_FLIGHT);                     // about 10 north, heading 0 → 1
    expect(st.ships[1].heading).toBe(1);
    st.events = []; stepRounds(st);
    expect(hitsOf(st)).toMatchObject([{ ship: 1, room: Room.Shields }]);       // after it: about 2 aft
  });
  it('every 3 hits cost a hull point; every 6 hits on a Room raise it a level; at level 2 only the hull counts', () => {
    const st = range(0);
    for (let k = 0; k < 2; k++) across(st, -10);
    expect([st.systems[1].hull, st.systems[1].gunHull, st.systems[1].gunRoomWear[Room.Weapons]]).toEqual([70, 2, 2]);
    across(st, -10);
    expect([st.systems[1].hull, st.systems[1].gunHull]).toEqual([69, 0]);
    for (let k = 0; k < 3; k++) across(st, -10);
    expect([st.systems[1].rooms[Room.Weapons], st.systems[1].gunRoomWear[Room.Weapons], st.systems[1].hull]).toEqual([1, 0, 68]);
    st.systems[1].rooms[Room.Engines] = 2;
    for (let k = 0; k < 3; k++) across(st, 10);
    expect([st.systems[1].rooms[Room.Engines], st.systems[1].gunRoomWear[Room.Engines], st.systems[1].hull]).toEqual([2, 0, 67]);
  });
  it('a Room repaired a level zeroes its wear: the Hunter\'s repair and the crew\'s', () => {
    const st = range(0);
    Object.assign(st.ships[0], { x: -2600, y: 0 });   // out of the Hunter's laser range, so it repairs a level-1 Room
    st.systems[1].rooms[Room.Engines] = 1; st.systems[1].gunRoomWear[Room.Engines] = 4;
    for (let k = 0; k < 700 && st.systems[1].rooms[Room.Engines] > 0; k++) hunterThink(st, 1);
    expect([st.systems[1].rooms[Room.Engines], st.systems[1].gunRoomWear[Room.Engines]]).toEqual([0, 0]);
    const d = createValkyrnDuel(5);
    try {
      const crew = d.tactical.systems[0], p = d.points.find((q) => q.tacticalRoom === Room.Weapons)!, eid = d.interior.crew[0]!, w = d.interior.derived.width;
      crew.rooms[Room.Weapons] = 1; crew.gunRoomWear[Room.Weapons] = 3;
      Position.x[eid] = (p.tile % w) + 0.5; Position.y[eid] = Math.floor(p.tile / w) + 0.5;
      for (let k = 0; k < 240; k++) stepDuelTick(d, { held: [{ ...NONE, interactHeld: true }], commands: [] });
      expect([crew.rooms[Room.Weapons], crew.gunRoomWear[Room.Weapons]]).toEqual([0, 0]);
    } finally { disposeDuel(d); }
  });
});

describe('hostility and the end (spec §7.2)', () => {
  it('the crew\'s first gun round turns the enemy hostile, cause gun', () => {
    const st = holding(range(2));
    Object.assign(st.ships[1], { x: 2600, y: 2600 });
    stepDuel(st, IDLE_INPUT);
    expect(st.events.some((e) => e.kind === 'hostile')).toBe(false);
    stepDuel(st, { ...IDLE_INPUT, gunHeld: true });
    expect(st.events.filter((e) => e.kind === 'hostile')).toEqual([{ kind: 'hostile', cause: 'gun' }]);
    expect(st.hostileAt).toBe(1);
  });
  it('a round that takes the last hull point wins the round', () => {
    const st = range(0);
    st.systems[1].hull = 1; st.systems[1].gunHull = 2;
    placeRound(st, { x: H.x - 30, y: H.y, vx: 700, vy: 0, age: 0, owner: 0 });
    stepDuel(st, IDLE_INPUT);
    expect([st.systems[1].hull, st.outcome]).toEqual([0, Outcome.CrewWins]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/valkyrnRounds.test.ts`
Expected: FAIL: `stepRounds` and `gunRoomOf` are not exported from `sim/tactical/gun`.

- [ ] **Step 3: The sweep, the Room and the hit**

`src/renderer/src/sim/tactical/gun.ts`:
- Header: append ` stepRounds moves the rounds after the ships fly and contacts resolve and sweeps each as a segment (spec §7.2).` to the header's last sentence before `Only`.
- Replace the imports with:

```ts
import type { GunDef } from './defs';
import { hx, hy } from './direction';
import { queryGrid } from './grid';
import { classOf, emptyRound, Room, type GunRound, type TacticalState } from './state';
import { DT } from './tuning';
import type { ShipInput } from './weapons';
```

- Append:

```ts
/** The entry parameter t in [0, 1] of the segment (ox, oy) → (nx, ny) into the circle at (cx, cy) of radius r: 0 when
 *  it starts inside, −1 when it misses. */
function segmentEntry(ox: number, oy: number, nx: number, ny: number, cx: number, cy: number, r: number): number {
  const fx = ox - cx, fy = oy - cy, c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const ex = nx - ox, ey = ny - oy, a = ex * ex + ey * ey;
  if (a === 0) return -1;
  const b = fx * ex + fy * ey, disc = b * b - a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : -1;
}

/** The point of the infinite line through (ox, oy) and (nx, ny) closest to (cx, cy). */
function closest(ox: number, oy: number, nx: number, ny: number, cx: number, cy: number): [number, number] {
  const ex = nx - ox, ey = ny - oy, len2 = ex * ex + ey * ey, t = len2 > 0 ? ((cx - ox) * ex + (cy - oy) * ey) / len2 : 0;
  return [ox + ex * t, oy + ey * t];
}

/**
 * The Room a round on the line (ox, oy) → (nx, ny) strikes on ship `target` (spec §7.2): the closest approach of that
 * infinite line to the target's centre (the middle of the chord it cuts, so aim decides it, not where it crossed the
 * edge), projected on the target's nose axis, p. p > r/3 Weapons, p < −r/3 Engines, else Shields (exactly ±r/3 is
 * Shields). Reads the target as it stands: stepRounds calls it after the tick's flight, so the post-move centre and
 * heading count.
 */
export function gunRoomOf(state: TacticalState, target: number, ox: number, oy: number, nx: number, ny: number): 0 | 1 | 2 {
  const s = state.ships[target]!, [px, py] = closest(ox, oy, nx, ny, s.x, s.y), third = classOf(state, target).radius / 3;
  const p = (px - s.x) * hx(s.heading) + (py - s.y) * hy(s.heading);
  return p > third ? Room.Weapons : p < -third ? Room.Engines : Room.Shields;
}

/** Owner's round on (ox, oy) → (nx, ny) hit ship k (spec §7.2). Shielded: one wear toward a layer; at hitsPerLayer the
 *  layer goes (shieldClock 0) and the wear is 0. Unshielded: one hull wear (every hitsPerHull, hull −1) and one wear on
 *  the struck Room (every hitsPerLevel, its level +1 to 2; at level 2 its wear stays 0). The owner counts the hit; a
 *  gunHit event marks the closest-approach point. */
function gunHit(state: TacticalState, owner: number, k: number, ox: number, oy: number, nx: number, ny: number): void {
  const g = classOf(state, owner).slots.gun, t = state.systems[k]!, b = state.ships[k]!;
  if (!g) return;
  const [x, y] = closest(ox, oy, nx, ny, b.x, b.y);
  state.systems[owner]!.gunHits++;
  if (t.shields > 0) {
    const stripped = ++t.gunWear >= g.hitsPerLayer;
    if (stripped) { t.shields--; t.shieldClock = 0; t.gunWear = 0; }
    state.events.push({ kind: 'gunHit', ship: k, room: -1, stripped, x, y });
    return;
  }
  const room = gunRoomOf(state, k, ox, oy, nx, ny);
  if (++t.gunHull >= g.hitsPerHull) { t.hull = Math.max(0, t.hull - 1); t.gunHull = 0; }
  if (t.rooms[room] < 2) { if (++t.gunRoomWear[room] >= g.hitsPerLevel) { t.rooms[room]++; t.gunRoomWear[room] = 0; } }
  else t.gunRoomWear[room] = 0;
  state.events.push({ kind: 'gunHit', ship: k, room, stripped: false, x, y });
}

/**
 * Every round in flight, in pool order (spec §7.2): it flies straight one tick (no gravity, no drag; it also moves on
 * its spawn tick) and ages; its segment from the old to the new position is swept against every other active ship's
 * circle (as it stands after this tick's flight), the asteroids and the planet; the first contact along the segment ends
 * it (ties: ship, then asteroids ascending, then the planet; a ship contact is a hit). A round reaching its gun's life
 * ends. An ended round's entry holds zeros. Never its own ship.
 */
export function stepRounds(state: TacticalState): void {
  for (const r of state.rounds) {
    if (!r.active) continue;
    const ox = r.x, oy = r.y, life = classOf(state, r.owner).slots.gun?.lifeTicks ?? 0;
    r.x += r.vx * DT; r.y += r.vy * DT; r.age++;
    let best = 2, ship = -1;   // entry parameters are at most 1
    state.ships.forEach((s, k) => {
      if (!s.active || k === r.owner) return;
      const t = segmentEntry(ox, oy, r.x, r.y, s.x, s.y, classOf(state, k).radius);
      if (t >= 0 && t < best) { best = t; ship = k; }
    });
    const half = Math.max(Math.abs(r.x - ox), Math.abs(r.y - oy)) / 2;
    for (const k of queryGrid(state.grid, (ox + r.x) / 2, (oy + r.y) / 2, half)) {
      const a = state.map.asteroids[k]!, t = segmentEntry(ox, oy, r.x, r.y, a.x, a.y, a.r);
      if (t >= 0 && t < best) { best = t; ship = -1; }
    }
    const p = state.map.planet, tp = segmentEntry(ox, oy, r.x, r.y, p.x, p.y, p.r);
    if (tp >= 0 && tp < best) { best = tp; ship = -1; }
    if (ship >= 0) gunHit(state, r.owner, ship, ox, oy, r.x, r.y);
    if (best <= 1 || r.age >= life) Object.assign(r, emptyRound());
  }
}
```

- [ ] **Step 4: The step, hostility, strips and repairs**

`src/renderer/src/sim/tactical/duel.ts`:
- Add `import { stepRounds } from './gun';` after the `flyMissile` import.
- In the doc comment of `stepDuel` replace `ship contacts, missile contacts, weapon clocks,` with `ship contacts, missile contacts, gun rounds (Valkyrn spec §7.2), weapon clocks,`.
- After `resolveMissiles(state);` add `stepRounds(state);   // Valkyrn spec §7.2: after the ships fly and contacts resolve, so a round also moves on its spawn tick`.

`src/renderer/src/sim/tactical/science.ts` `hostilityStep`: replace the doc comment's `a laser release, hit or miss, or a missile launch: the round's own counters) turns it hostile for the round (hostileAt = rt) and pushes a hostile event, cause laser, then missile, then clock.` with `a laser release, hit or miss, a gun round (Valkyrn spec §7.2), or a missile launch: the round's own counters) turns it hostile for the round (hostileAt = rt) and pushes a hostile event, cause laser, then gun, then missile, then clock.`, and replace the last two body lines

```ts
  if (crew.shots === 0 && crew.missilesLaunched === 0 && rt < HOSTILE_AFTER_TICKS - 1) return;
  t.hostileAt = rt;
  t.events.push({ kind: 'hostile', cause: crew.shots > 0 ? 'laser' : crew.missilesLaunched > 0 ? 'missile' : 'clock' });
```

with

```ts
  if (crew.shots + crew.gunShots === 0 && crew.missilesLaunched === 0 && rt < HOSTILE_AFTER_TICKS - 1) return;
  t.hostileAt = rt;
  t.events.push({ kind: 'hostile', cause: crew.shots > 0 ? 'laser' : crew.gunShots > 0 ? 'gun' : crew.missilesLaunched > 0 ? 'missile' : 'clock' });
```

`src/renderer/src/sim/tactical/weapons.ts` `shoot`: replace `bs.shields -= n; bs.shieldClock = 0; as.layersStripped += n; stripped = true;` with `bs.shields -= n; bs.shieldClock = 0; bs.gunWear = 0; as.layersStripped += n; stripped = true;   // Valkyrn spec §7.2: any strip zeroes the gun wear`.

`src/renderer/src/sim/tactical/hunter.ts` `updateRepair`: replace `me.rooms[h.room as 0 | 1 | 2] = Math.max(0, me.rooms[h.room]! - 1);` with `me.rooms[h.room as 0 | 1 | 2] = Math.max(0, me.rooms[h.room]! - 1); me.gunRoomWear[h.room as 0 | 1 | 2] = 0;   // Valkyrn spec §7.2: a repaired Room's wear goes`.

`src/renderer/src/sim/duel/step.ts` `repairPhase`: replace `if (d.repair[r] >= REPAIR_UNITS) { crewShip.rooms[r]--; d.repair[r] = 0;` with `if (d.repair[r] >= REPAIR_UNITS) { crewShip.rooms[r]--; crewShip.gunRoomWear[r] = 0; d.repair[r] = 0;   /* Valkyrn spec §7.2 */` (the rest of the line unchanged).

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run tests/valkyrnRounds.test.ts tests/valkyrnGun.test.ts tests/valkyrnFlight.test.ts tests/valkyrnCrew.test.ts tests/weaponsUpdate.test.ts tests/tacticalSlots.test.ts tests/duelModules.test.ts tests/scienceScans.test.ts tests/hunterGrace.test.ts tests/determinismGuard.test.ts`
Expected: PASS (drop a listed file that does not exist; `git ls-files tests | grep -i -E "science|hostil|grace"` names the Sci-1 hostility tests to include).

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Prove every run unchanged apart from the added fields**

Run: `npx tsx scripts/golden/duel-oracle.ts added` and `npx tsx scripts/golden/canonical-trace.ts same` (expected output as in Task 5 Step 9).

Run: `npx vitest run tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/duelGates.test.ts tests/duelOracle.test.ts`
Expected: PASS with no bless (no oracle run fires the gun).

- [ ] **Step 7: The full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/tactical/gun.ts src/renderer/src/sim/tactical/duel.ts src/renderer/src/sim/tactical/science.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/duel/step.ts tests/valkyrnRounds.test.ts
git commit -m "feat(valkyrn): rounds fly and hit (segment sweep, shield wear, hull and Room wear by closest approach on the post-move nose axis, repair zeroes wear, hostility cause gun; the oracle proves every run unchanged)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The online view and telemetry read the gun

**Files:**
- Modify: `src/renderer/src/app/duel/onlineSource.ts:32-38` (`Counters`, `duelCounters`) and `gapEvents`, `src/renderer/src/sim/duel/telemetry.ts` (`TerminalCause`, the event loop, the terminal causes), `src/renderer/src/sim/duel/summary.ts:9`
- Create: `tests/valkyrnOnline.test.ts`

**Interfaces:**
- Consumes: Task 5's `gunHits` and `gunHit` events; Task 6's hits.
- Produces: `duelCounters(t, i).gunHits`; `gapEvents` pushes `{ kind: 'gunHit', ship: target, room: -1, stripped: false, x, y }` per `gunHits` increment; `TerminalCause` and `TERMINAL_CAUSES` gain `'gun'` after `'laser'`.

- [ ] **Step 1: Write the failing test**

Create `tests/valkyrnOnline.test.ts`:

```ts
// Valkyrn-i (spec 2026-11-18-valkyrn-solo-ship-design §7.3, §10 Null laser): the online view derives a gun hit from each
// gunHits increment (the Valkyrn is not online; this is for completeness), the telemetry builds for the gun Valkyrn
// with no laser counts, and a gun kill's terminal cause is `gun`, after `laser` in TERMINAL_CAUSES.
import { describe, expect, it } from 'vitest';
import { duelCounters, gapEvents } from '../src/renderer/src/app/duel/onlineSource';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { duelEndSummary, TERMINAL_CAUSES } from '../src/renderer/src/sim/duel/summary';
import { createTelemetry, recordTick } from '../src/renderer/src/sim/duel/telemetry';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { placeRound } from '../src/renderer/src/sim/tactical/gun';
import { createTacticalState, Outcome } from '../src/renderer/src/sim/tactical/state';
import { createSeatedValkyrn, createValkyrnDuel } from './helpers/valkyrnDuel';

const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };

describe('the online view (spec §7.3)', () => {
  it('each gunHits increment is a gunHit on the target at its position, Room and strip unknown', () => {
    const st = createTacticalState(5, 2, ShipClass.Valkyrn), before = [duelCounters(st, 0), duelCounters(st, 1)];
    expect(before[0]!.gunHits).toBe(0);
    st.systems[0].gunHits += 3;
    const hits = gapEvents(before, [null, null], st).filter((e) => e.kind === 'gunHit');
    expect(hits).toEqual(Array.from({ length: 3 }, () => ({ kind: 'gunHit', ship: 1, room: -1, stripped: false, x: st.ships[1].x, y: st.ships[1].y })));
    expect(gapEvents([duelCounters(createTacticalState(5), 0), duelCounters(createTacticalState(5), 1)], [null, null], createTacticalState(5)).some((e) => e.kind === 'gunHit')).toBe(false);
  });
});

describe('telemetry (spec §7.3)', () => {
  it('builds for the gun Valkyrn firing for 120 ticks, with no laser counts', () => {
    const d = createSeatedValkyrn(5), t = createTelemetry(d);
    try {
      for (let k = 0; k < 120 && d.tactical.outcome === Outcome.Running; k++) { const input = { held: [{ ...NONE, gunHeld: true }], commands: [] }; stepDuelTick(d, input); recordTick(t, d, input); }
      expect(d.tactical.systems[0].gunShots).toBeGreaterThan(0);
      expect([t.ships[0].laserReleases, t.ships[0].laserHits, t.ships[0].laserMisses, t.weaponsIdleTicks]).toEqual([0, 0, 0, 0]);
    } finally { disposeDuel(d); }
  });
  it('a gun kill is the terminal cause gun, after laser in TERMINAL_CAUSES', () => {
    expect(TERMINAL_CAUSES).toEqual(['planet', 'asteroid', 'ship', 'laser', 'gun', 'missile', 'downed']);
    const d = createValkyrnDuel(5), t = createTelemetry(d);
    try {
      const h = d.tactical.ships[1], hs = d.tactical.systems[1];
      hs.shields = 0; hs.hull = 1; hs.gunHull = 2;
      placeRound(d.tactical, { x: h.x - 30, y: h.y, vx: 700 + h.vx, vy: h.vy, age: 0, owner: 0 });
      const input = { held: [NONE], commands: [] };
      stepDuelTick(d, input); recordTick(t, d, input);
      expect([d.tactical.outcome, t.terminal[1]]).toEqual([Outcome.CrewWins, ['gun']]);
      expect(duelEndSummary(t).terminal[1]).toEqual(['gun']);
    } finally { disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/valkyrnOnline.test.ts`
Expected: FAIL: `duelCounters(…).gunHits` is undefined, and `TERMINAL_CAUSES` has no `'gun'`.

- [ ] **Step 3: The online counters and gap events**

`src/renderer/src/app/duel/onlineSource.ts`:
- `Counters` (L32): replace `missileHits: number; contacts:` with `missileHits: number; gunHits: number; contacts:`.
- `duelCounters` (L37): replace `missileHits: s.missileHits, contacts:` with `missileHits: s.missileHits, gunHits: s.gunHits, contacts:`.
- In `gapEvents`, after the missile loop's closing `}` and before `(['planet', 'asteroid', 'ship'] as const).forEach(` add:

```ts
    // Valkyrn spec §7.3: each gunHits increment is a round that hit the target; the snapshot carries neither the Room nor
    // a strip, so the event names none (−1, not stripped), at the target's position.
    if (tgt) for (let k = 0; k < now.gunHits - was.gunHits; k++) out.push({ kind: 'gunHit', ship: target, room: -1, stripped: false, x: tgt.x, y: tgt.y } satisfies DuelEvent);
```

and add to `gapEvents`' doc comment, before `An ending and a relaunch`: `each gunHits increment is a gun hit at the target (Valkyrn spec §7.3);`.

- [ ] **Step 4: The terminal cause**

`src/renderer/src/sim/duel/summary.ts` L9: `export const TERMINAL_CAUSES = ['planet', 'asteroid', 'ship', 'laser', 'gun', 'missile', 'downed'] as const satisfies readonly TerminalCause[];   // 'gun': Valkyrn spec §7.3`.

`src/renderer/src/sim/duel/telemetry.ts`:
- `TerminalCause`: `export type TerminalCause = 'planet' | 'asteroid' | 'ship' | 'laser' | 'gun' | 'missile' | 'downed';` (its doc comment gains `\`gun\`: a round's hull hit (Valkyrn spec §7.3).`).
- In `recordTick` replace

```ts
  const laserOn = [false, false], missileOn = [false, false];
  for (const e of tac.events) {
    if (e.kind !== 'laser' && e.kind !== 'missileEnd') continue;   // Sci-1's events are not weapons
```

with

```ts
  const laserOn = [false, false], missileOn = [false, false], gunOn = [false, false];
  for (const e of tac.events) {
    if (e.kind === 'gunHit') { if (e.room >= 0) gunOn[e.ship] = true; continue; }   // Valkyrn spec §7.3: a round's hull hit
    if (e.kind !== 'laser' && e.kind !== 'missileEnd') continue;   // Sci-1's and the gun's other events are not these weapons
```

- In the terminal-cause loop replace `if (laserOn[i]) c.push('laser');` with `if (laserOn[i]) c.push('laser');` + newline + `    if (gunOn[i]) c.push('gun');`.

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run tests/valkyrnOnline.test.ts tests/duelOnlineView.test.ts tests/weaponsUpdate.test.ts tests/duelTelemetry.test.ts tests/duelHealth.test.ts tests/duelCheckpoint.test.ts tests/onlineDuel.test.ts tests/codecModeWire.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Prove every run unchanged apart from the added fields**

Run: `npx tsx scripts/golden/duel-oracle.ts added` and `npx tsx scripts/golden/canonical-trace.ts same` (expected output as in Task 5 Step 9).

- [ ] **Step 7: The full suite**

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/app/duel/onlineSource.ts src/renderer/src/sim/duel/telemetry.ts src/renderer/src/sim/duel/summary.ts tests/valkyrnOnline.test.ts
git commit -m "feat(valkyrn): online gap events from gunHits, the terminal cause gun, telemetry for the gun Valkyrn (the oracle proves every run unchanged)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end proof, the handover baseline, every gate

**Files:** `tests/golden/basic.json` only, re-blessed in its embedded content digest (Step 2); nothing else changes (a failing gate is fixed in the task that caused it, by a new commit naming it).

**Interfaces:**
- Consumes: Tasks 1 to 7.
- Produces: Part i complete at SIM 53, the duel goldens Task 5 blessed (basic.json re-blessed in its digest), a fresh baseline at 53 for Part ii's first proof.

- [ ] **Step 1: The end-to-end proofs against Task 2's baseline**

Run: `npx tsx scripts/golden/duel-oracle.ts added`
Expected: as in Task 5 Step 9, exit 0.

Run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: as in Task 2 Step 12, exit 0.

- [ ] **Step 2: A same-version bless moves no canonical value: the duel goldens differ from Task 1's only in hashes, basic.json only in its digest**

Run: `npm run bless`
Expected: exit 0; the four `blessed …` lines carry Task 1 Step 5's counts, ticks, outcomes, rematch tick and rounds.

Run: `git status --short tests/golden tests/fixtures`
Expected: exactly `M tests/golden/basic.json` (Tasks 6 and 7 edited sim sources, so its embedded content digest moved again); the duel goldens and the determinism fixture do not move (the code reproduces exactly what Task 5 blessed).

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0 (against Task 2 Step 1's copy: only the digest strings moved).

Run (the Task 1 commit): `git log -1 --format=%h --grep="SIM_VERSION 52 -> 53 alone"` and note `<t1>`.
Run: `git diff -U0 <t1> -- tests/golden/duel-1.json tests/golden/duel-rematch.json | grep -E '^[-+] ' | grep -vE '^[-+] +"[0-9a-f]{8}",?$|"finalHash"'`
Expected: no output: since the version bump, the duel goldens moved only in hashes; tick counts and outcomes are unchanged.

Run: `git diff --stat <t1> -- tests/fixtures/determinism-v2.json`
Expected: no output. (`basic.json` is proved by `canonical-trace.ts golden` above instead: its digest strings differ from Task 1's by design.)

Commit the digest-only re-bless:
```bash
git add tests/golden/basic.json
git commit -m "chore(valkyrn): re-bless basic.json (content digest only; canonical-trace golden proves 0 leaves outside version, digest and hashes)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Every gate**

Run: `npx tsc -b`
Expected: no errors.

Run: `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: every test file PASS; `tests/duelGates.test.ts` passes with its bands and numbers unchanged.

Run: `npm run test:duel-app-runtime`
Expected: exit 0.

Run: `git grep -nE "['\"](hound|cutter|valkyrn|valkyrnLaser|scout)['\"]" -- "src/renderer/src/*.ts" "src/renderer/src/*.tsx" ":!src/renderer/src/sim/ship/*.json"`
Expected: hits only in spec §3.2's allowed files (`sim/tactical/defs.ts`, `sim/duel/tuning.ts`, `sim/ship/fleet.ts`, `render/battlemapModel.ts`, `render/tactical/hullModel.ts`, `render/assetNames.ts`, `render/credits.generated.ts`) plus pre-existing sites Part ii fixes (`render/hudModel.ts` and any other the grep shows that `git blame` dates before Task 1). A hit on a line this branch added is fixed here in a new commit; the pre-existing ones are listed in the report for Part ii.

- [ ] **Step 4: The handover baseline for Part ii**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline` and `npx tsx scripts/golden/duel-oracle.ts baseline` (Expected: `baseline at sim version 53: …` and `duel oracle baseline at sim version 53: …`, exit 0).
Run: `npx tsx scripts/golden/duel-oracle.ts same` and `npx tsx scripts/golden/canonical-trace.ts same`
Expected: both pass at 53 → 53. Part ii's tasks prove `same` against this recording (its changes are Valkyrn-only data).

- [ ] **Step 5: Report**

Nothing more to commit (`git status --short` lists none of this branch's files). Report to the controller: the commits of Tasks 1 to 7 and Task 8 Step 2's digest-only re-bless, the four bless lines, the oracle `added` line, and for Part ii: the four view readers with type-only guards (Decision 11), `HULL_IDS` for `HullId` (and that Part ii's whole-file `fleet.ts` replacement in its Task 3 Step 5 must keep the `HULL_IDS` export, which `schema.ts` imports), `heldTurn` (`app/duel/runtime.ts`) already calls `helmTurn` so the aim needs only the runtime to send `aim`/`gunHeld`, and `gunHit.stripped` for the shield pop.

---

## Self-review

- **Spec coverage (§10 sim parts):** crew of one (T3: n = 1, the layout-crew throw, snapshot round trip, the downed pilot; T4: the out-of-seat rule for the Valkyrn and the Hound); class (T3: from the layout, from `cls`, rematch, snapshot, `systems[0].cls` validated, `unavailable`; T2: no `laser` event); null laser (T2: a Hound snapshot and checkpoint validate with four classes; T7: telemetry builds); aim (T4: settle within one index with no flip in 60 ticks at 2.37 steps a tick, A/D and face win, invalid aim −1, aim sets `holdHeading`, codec, checkpoint, replay, hash, snapshot); gun (T5: interval, muzzles starboard first, heat 50/4, lock at tick 222 and 125 locked ticks, level 1 halves to 2 and 4, level 2 stops, pool overflow; T6: ship, asteroid and planet ends, life, own ship, first contact, shield wear 8 and any strip zeroes it, the Room by closest approach side-on fore/aft and along the axis, the Hunter at full thrust and turning, hull every 3, level every 6 and level 2 hull only, repair zeroes wear for the Hunter and the crew, hostility `gun`); online `gapEvents` (T7). The lead pip, views, parity, no-id-literal test and the gate are Parts ii and iii.
- **Placeholders:** none; every code step has the code, every run its expected output. `<R>`, `<T>`, `<F>`, `<sha>`, `<hex>`, `<t1>` are values the commands print.
- **Type consistency:** `createDuel(layout, seed, helmPlayer, crew, cls)` (T3) is what T4 to T7's helpers call through `createValkyrnDuel`; `ShipInput.gunHeld` (T4) is read by `tickGun` (T5); `GunRound`/`placeRound` (T5) feed `stepRounds` (T6) and T7's test; `gunHit.stripped` is in the union (T5) before T6 emits it and T7's `gapEvents` builds it; `heldAim`/`aimTurn`/`helmTurn` share `HEADING_COUNT`; `ADDITIONS[53]` patterns match `duelSchema`'s `<module>.<field>` names (`space.rounds.k.*`, `ship.systems.i.gun*`).
- **Order:** nothing consumes a later task's product: the helper (T3) precedes every Valkyrn-duel test; the hashed fields (T5) precede the hits (T6) that write them; the `added` mode lands with the first added field (T5).
