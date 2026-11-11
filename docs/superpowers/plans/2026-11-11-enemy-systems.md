# Enemy Systems and Shields (Combat-ii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The enemy gains weapons, engines and shields as three extra target rows with health, repair timers and effects (no fire, no escape and no evasion, frequency-gated beams), a shield frequency Science can scan, per `docs/superpowers/specs/2026-11-11-enemy-systems-design.md`.

**Architecture:** `state.enemy` grows by `sysHp[3]`, `sysRepairTick[3]`, `shieldFreq`, `scanned`, `scan`; `debrisTargets.ts` exposes four enemy pseudo-slots (`ENEMY_SLOTS`, `isEnemySlot`, `enemySystemOf`) and `nextTarget` takes an exclude list; `enemy.ts` owns the shield draw on arrival, repairs, the engines pause, weapons gating, `enemyBeamThreshold`, `beamAbsorbed` and slot-aware `damageEnemy`; `weapons.ts` absorbs mismatched beams before any roll; `science.ts` scans the hull row; `productive.ts` counts objects only; `hudModel.ts` renders the four rows and the `S` marker.

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), Pixi 8.19 (hud.ts untouched except where noted). No new dependencies.

## Spec amendments made by this plan (recorded in Task 4)

- `enemyBeamHits(u, output)` is **replaced** by `enemyBeamThreshold(state, output)` (the threshold depends on the engines); callers compare `u < enemyBeamThreshold(...)`.
- `enemySystemOf(slot)` (`slot − DEBRIS_SLOTS − 1`, so −1 for the hull row) lives in `debrisTargets.ts` beside `isEnemySlot`.
- In `fireWeapon` the beam's charge reset moves before the roll (no read sits between them, so behaviour is unchanged) so the absorbed path and the rolled path share the reset.

## Global Constraints

- `tests/boundary.test.ts` stays green (no banned imports or calls in `sim/`; ASCII comments). Every test runs under node; `hudModel.ts` stays pixi-free.
- Determinism and draw order (exact): arrival draws **one** `rng.hazards` float (`shieldFreq = 1 + nextInt(rng.hazards, FREQ_COUNT)`) and nothing from `rng.director`; an absorbed beam draws **nothing**; a rolled beam or torpedo draws one `rng.combat` float; repairs, the engines pause and `damageEnemy` draw nothing; the shot re-arm draws one director float even while the weapons are down and then spawns nothing; `leave` draws one director float. No other draws are added.
- Per-tick order inside `enemySystem`: absent → arrive if due (return); repairs (in `EnemySystem` order); engines pause (`departTick += 1` while `sysHp[Engines] === 0`); withdrawal (return); fire (re-arm first; spawn only if `sysHp[Weapons] > 0` and the cap allows).
- Pseudo-slots: `ENEMY_SLOT = DEBRIS_SLOTS` (hull), `ENEMY_WEAPONS_SLOT = +1`, `ENEMY_ENGINES_SLOT = +2`, `ENEMY_SHIELDS_SLOT = +3`; `isEnemySlot(k) = k >= DEBRIS_SLOTS`. No enemy slot ever indexes a debris array: every reader of a cursor or of `warnedTargets` branches on `isEnemySlot` first (`weapons.ts`, `science.ts`, `productive.ts`, `debrisTargets.ts`, `hudModel.ts` in `target()`, the Science row builder and the threat loop). `warnedTargets` sorts by `(targetStableId, slot)`.
- State and flatten (exact): the `enemy` section gains, after `departTick`: `sysHp[3]`, `sysRepairTick[3]`, `shieldFreq`, `scanned`, `scan` (`ENEMY_FIELDS = 15`); `telemetry.enemyDisables` after `enemiesDestroyed` (`TELEMETRY_SCALARS = 13`). `SIM_VERSION = 11`; version-10 snapshots rejected. Initial: `sysHp` all 0, `sysRepairTick` all −1, `shieldFreq 0`, `scanned 0`, `scan 0`, `enemyDisables 0`. On arrival `sysHp` all `ENEMY_SYS_HP`, `sysRepairTick` all −1, `scanned 0`, `scan 0`.
- Tuning (exact): `ENEMY_SYS_HP 30`, `ENEMY_SYS_REPAIR 45`, `ENEMY_EVADE 0.15`, `ENEMY_BEAM_BASE 0.70` (was 0.55); everything else unchanged. `enemyBeamThreshold = ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE × output − (sysHp[Engines] > 0 ? ENEMY_EVADE : 0)`, **not clamped**. `beamAbsorbed = sysHp[Shields] > 0 && selector + 1 !== shieldFreq`.
- Rules (exact, spec §5): absorbed beam → `charge = 0`, `lastShotTick`, `shots++`, XP, no draw, no `hits`, returns false; `damageEnemy(state, slot, amount)`: hull always; a subsystem slot whose `sysHp > 0` loses `amount` too, and on reaching 0 arms `sysRepairTick = tick + ENEMY_SYS_REPAIR × TICK_HZ` and counts `enemyDisables`; a down subsystem's timer is never extended; hull 0 → `leave(state, true)`. Repair: `sysHp = ENEMY_SYS_HP`, `sysRepairTick = −1`, and for Weapons `nextShotTick = tick + ENEMY_FIRST_SHOT × TICK_HZ` unconditionally. `leave`: record whether the Science cursor is on an enemy slot, retarget every console whose cursor is an enemy slot with `nextTarget(state, stableId, ENEMY_SLOTS)`, then clear the block (`sysHp` 0, `sysRepairTick` −1, `shieldFreq 0`, `scanned 0`, `scan 0`) and set `science.scanning = 0` if the Science cursor was on the enemy. Enemy scan: Confirm on `ENEMY_SLOT` while present and unscanned starts it; `scanStep` on `ENEMY_SLOT` does `scan = min(1, scan + DT × output / SCAN_TIME)` and at `>= 1` sets `scanned 1`, `scanning 0`; subsystem slots neither start nor progress a scan.
- HUD (exact, spec §7): `DebrisTarget` fields `system: number | null`, `status: { hp: number; repairIn: number | null } | null`, `shieldsUp: boolean | null`; hull row `Enemy ${round(hull × 100)}% ${eta}s ${marker}` with `marker` `S-` (shields down) > `S${frequency}` (scanned) > `S?`, plus ` ${floor(scan × 100)}%` while `frequency === null && scan > 0`; subsystem rows `Enemy ${name} ${round(hp / ENEMY_SYS_HP × 100)}%` or `Enemy ${name} DOWN ${repairIn}s` (`repairIn = ceil((sysRepairTick − tick) / TICK_HZ)`); threat row `Enemy ship: hull N%` + ` ${name} DOWN` per down system in `EnemySystem` order.
- Golden replay: re-blessed **once**, in Task 1, after the survival gate has passed (fallback if it fails: `ENEMY_FIRE_INTERVAL` 15 → 20, applied before the bless); Tasks 2 and 3 leave `tests/golden/basic.json` untouched.
- Commit messages: imperative, prefixed `feat:`, `test:`, `chore:` or `docs:`, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. `npm run typecheck`, `npm test` and `npm run build` pass at the end of every task.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/debrisTargets.ts` | the four slots, `isEnemySlot`, `enemySystemOf`, slot tie-break, `nextTarget` exclude list. |
| `src/renderer/src/sim/enemy.ts` | `EnemySystem`, `ENEMY_SYSTEM_NAMES`, `enemyBeamThreshold`, `beamAbsorbed`, arrival draw and fills, repairs, engines pause, weapons gating, slot-aware `damageEnemy`, `leave` clearing. |
| `src/renderer/src/sim/{weapons,science,productive}.ts` | absorb and threshold; enemy scan; objects-only predicates. |
| `src/renderer/src/sim/{state,flatten,tuning,telemetry,acceptance}.ts` | fields, manifest arithmetic, constants, record and column. |
| `src/renderer/src/render/hudModel.ts` | `DebrisTarget` fields, `target()`, `targetRowText`, Science scan source, threat suffixes. |
| `tests/enemy.test.ts`, `tests/{snapshot,hud,telemetry,acceptance,gate-survival,productive}.test.ts`, `tests/helpers/sim.ts` | as the tasks say. |
| `docs/gates.md`, the spec, `docs/roadmap.md` | Task 4. |

---

### Task 1: Enemy state, the four target rows, arrival, repairs and the engines and weapons effects

**Files:**
- Modify: `src/renderer/src/sim/state.ts`, `flatten.ts`, `tuning.ts`, `debrisTargets.ts`, `enemy.ts`, `tests/helpers/sim.ts`, `tests/enemy.test.ts`, `tests/snapshot.test.ts`, `tests/gate-survival.test.ts` (figures only), `tests/golden/basic.json` (re-bless)

**Interfaces:**
- Produces: the state fields; from `debrisTargets.ts`: `ENEMY_WEAPONS_SLOT`, `ENEMY_ENGINES_SLOT`, `ENEMY_SHIELDS_SLOT`, `ENEMY_SLOTS`, `isEnemySlot(slot)`, `enemySystemOf(slot)`, `nextTarget(state, afterStableId, exclude?: number | readonly number[])`; from `enemy.ts`: `EnemySystem`, `ENEMY_SYSTEM_NAMES`, `enemyBeamThreshold(state, output)`, `beamAbsorbed(state, selector)`, `damageEnemy(state, slot, amount)`; helpers `placeEnemy(state, hull?, shieldFreq = 1)`, `disableSystem(state, system)`. `enemyBeamHits` is removed (Task 2 rewires `weapons.ts`; until then `weapons.ts` keeps compiling by calling `u < enemyBeamThreshold(state, output)` in place of `enemyBeamHits(u, output)`, which this task does as a mechanical rename).

- [ ] **Step 1: Write the failing tests**

`tests/helpers/sim.ts`: `placeEnemy` becomes

```ts
/** Place an enemy as arrive() would (no draw): fresh StableId, full systems, the given shield frequency. */
export function placeEnemy(state: SimState, hull = ENEMY_HULL, shieldFreq = 1): void {
  const e = state.enemy;
  e.present = 1; e.hull = hull; e.stableId = state.nextStableId++;
  e.departTick = state.tick + ENCOUNTER_MAX * TICK_HZ; e.nextShotTick = state.tick + ENEMY_FIRST_SHOT * TICK_HZ;
  e.sysHp.fill(ENEMY_SYS_HP); e.sysRepairTick.fill(-1); e.shieldFreq = shieldFreq; e.scanned = 0; e.scan = 0;
}
/** Knock a subsystem out as damageEnemy would, arming its repair. */
export function disableSystem(state: SimState, system: number): void {
  state.enemy.sysHp[system] = 0; state.enemy.sysRepairTick[system] = state.tick + ENEMY_SYS_REPAIR * TICK_HZ;
}
```

(import `ENEMY_SYS_HP, ENEMY_SYS_REPAIR` from tuning.)

`tests/enemy.test.ts` changes (imports to add: `EnemySystem, enemyBeamThreshold, beamAbsorbed, damageEnemy` from enemy, remove `enemyBeamHits`; `ENEMY_SLOTS, ENEMY_WEAPONS_SLOT, ENEMY_ENGINES_SLOT, ENEMY_SHIELDS_SLOT, isEnemySlot, enemySystemOf` from debrisTargets; `disableSystem` from helpers; `ENEMY_SYS_HP, ENEMY_SYS_REPAIR, ENEMY_EVADE` from tuning):

1. The arrival test: replace the two "unchanged stream" assertions with `expect(s.rng.director.s).toBe(d0);` and, after computing `const hz = createRng(h0); const freq = 1 + nextInt(hz, FREQ_COUNT);` before the call, `expect(s.rng.hazards.s).toBe(hz.s); expect(s.enemy.shieldFreq).toBe(freq);`; also assert `expect(Array.from(s.enemy.sysHp)).toEqual([ENEMY_SYS_HP, ENEMY_SYS_HP, ENEMY_SYS_HP]); expect(Array.from(s.enemy.sysRepairTick)).toEqual([-1, -1, -1]); expect([s.enemy.scanned, s.enemy.scan]).toEqual([0, 0]);`. Add to the initial-values test: `expect(Array.from(e.sysHp)).toEqual([0, 0, 0]); expect(Array.from(e.sysRepairTick)).toEqual([-1, -1, -1]); expect([e.shieldFreq, e.scanned, e.scan]).toEqual([0, 0, 0]); expect(s.telemetry.enemyDisables).toBe(0);`. In the "due shot" test and the "step() arrival" test, if they pin the hazards stream across an arrival, recompute with the extra draw (the step() test asserts only presence and counts, so it is unaffected).
2. The targets test: expected list `[a, ENEMY_SLOT, ENEMY_WEAPONS_SLOT, ENEMY_ENGINES_SLOT, ENEMY_SHIELDS_SLOT, b]`; `isTarget` true for all four, and all four false after `present = 0`; cycling Down from `a`: 8, 9, 10, 11, b, a; add `expect([isEnemySlot(7), isEnemySlot(8), isEnemySlot(11)]).toEqual([false, true, true]); expect([enemySystemOf(ENEMY_SLOT), enemySystemOf(ENEMY_WEAPONS_SLOT), enemySystemOf(ENEMY_SHIELDS_SLOT)]).toEqual([-1, 0, 2]);`.
3. The `nextTarget` fixture: `nextTarget(s, 5) === ENEMY_SLOT`, `nextTarget(s, 6) === b`, `nextTarget(s, 7) === a`, and `nextTarget(s, 6, ENEMY_SLOTS) === b`, `nextTarget(s, 5, ENEMY_SLOTS) === b`.
4. The `leave` retarget test: set the Weapons cursor to `ENEMY_SHIELDS_SLOT` and the Science cursor to `ENEMY_WEAPONS_SLOT`; both retarget to `b`; the enemy-alone case still gives −1; add `s.science.scanning = 1` before `leave` with the Science cursor on `ENEMY_SLOT` and assert `scanning 0` after; assert after `leave`: `sysHp` all 0, `sysRepairTick` all −1, `shieldFreq 0`, `scanned 0`, `scan 0`.
5. Replace every `enemyBeamHits(x, y)` assertion with `x < enemyBeamThreshold(s, y)` on an `armed()` state (engines up): `0.69/0.71 at 0.5 → true/false`, `0.84/0.86 at 1 → true/false`; add `disableSystem(s, EnemySystem.Engines)` then `0.84/0.86 at 0.5 → true/false` and `0.999 < enemyBeamThreshold(s, 1) → true`.

Append to `tests/enemy.test.ts`:

```ts
describe('enemy systems: repairs, engines and weapons effects (enemySystem called directly)', () => {
  it('weapons down: a due shot re-arms with one director draw and spawns nothing; the repair restores 30 and sets nextShotTick to exactly tick + 5 s', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); disableSystem(s, EnemySystem.Weapons);
    s.tick = s.enemy.nextShotTick; const dr = createRng(s.rng.director.s), u = nextFloat(dr); const h = s.rng.hazards.s;
    enemySystem(s);
    expect(s.rng.director.s).toBe(dr.s); expect(s.rng.hazards.s).toBe(h); expect(shotsInFlight(s)).toBe(0);
    expect(s.enemy.nextShotTick).toBe(s.tick + Math.round(fireInterval(minutesOf(s), 2) * T * jitter(u)));
    const early = makeState(2); quiet(early); placeEnemy(early); disableSystem(early, EnemySystem.Weapons); early.enemy.nextShotTick = early.tick + 10;
    early.tick = early.enemy.sysRepairTick[EnemySystem.Weapons]! - 1; enemySystem(early);
    expect(early.enemy.sysHp[EnemySystem.Weapons]).toBe(0);
    early.tick += 1; enemySystem(early);
    expect(early.enemy.sysHp[EnemySystem.Weapons]).toBe(ENEMY_SYS_HP); expect(early.enemy.sysRepairTick[EnemySystem.Weapons]).toBe(-1); expect(early.enemy.nextShotTick).toBe(early.tick + ENEMY_FIRST_SHOT * T);
    const late = makeState(2); quiet(late); placeEnemy(late); disableSystem(late, EnemySystem.Weapons); late.enemy.nextShotTick = 1e9;
    late.tick = late.enemy.sysRepairTick[EnemySystem.Weapons]!; enemySystem(late);
    expect(late.enemy.nextShotTick).toBe(late.tick + ENEMY_FIRST_SHOT * T);                  // unconditional, even when the old value was later
  });
  it('engines down: departTick advances one per tick, the enemy stays past the original departure, the threshold rises to 0.85; repaired engines stop the clock', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); s.enemy.nextShotTick = 1e9; disableSystem(s, EnemySystem.Engines); s.enemy.sysRepairTick[EnemySystem.Engines] = 1e9;
    const depart = s.enemy.departTick;
    for (let n = 0; n < 100; n++) { s.tick++; enemySystem(s); }
    expect(s.enemy.departTick).toBe(depart + 100);
    s.tick = depart; enemySystem(s); expect(s.enemy.present).toBe(1);
    expect(enemyBeamThreshold(s, 0.5)).toBeCloseTo(0.85, 12);
    s.enemy.sysRepairTick[EnemySystem.Engines] = s.tick + 1; s.tick += 1; enemySystem(s);
    expect(s.enemy.sysHp[EnemySystem.Engines]).toBe(ENEMY_SYS_HP); const fixed = s.enemy.departTick;
    s.tick += 1; enemySystem(s); expect(s.enemy.departTick).toBe(fixed);
    expect(enemyBeamThreshold(s, 0.5)).toBeCloseTo(0.70, 12);
  });
  it('a repair due on the departure tick happens first; a repair of an intact system is never armed by extra damage', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); s.enemy.nextShotTick = 1e9; disableSystem(s, EnemySystem.Shields);
    s.enemy.sysRepairTick[EnemySystem.Shields] = s.enemy.departTick; s.tick = s.enemy.departTick;
    enemySystem(s);
    expect(s.enemy.present).toBe(0); expect(Array.from(s.enemy.sysHp)).toEqual([0, 0, 0]); expect(Array.from(s.enemy.sysRepairTick)).toEqual([-1, -1, -1]);   // repaired, then left: leave clears the block
    const d = makeState(1); quiet(d); placeEnemy(d);
    damageEnemy(d, ENEMY_WEAPONS_SLOT, ENEMY_BEAM_DAMAGE); expect(d.enemy.sysHp[EnemySystem.Weapons]).toBe(ENEMY_SYS_HP - ENEMY_BEAM_DAMAGE); expect(d.enemy.sysRepairTick[EnemySystem.Weapons]).toBe(-1); expect(d.enemy.hull).toBe(ENEMY_HULL - ENEMY_BEAM_DAMAGE);
    damageEnemy(d, ENEMY_WEAPONS_SLOT, ENEMY_BEAM_DAMAGE); const armedAt = d.enemy.sysRepairTick[EnemySystem.Weapons]!;
    expect(d.enemy.sysHp[EnemySystem.Weapons]).toBe(0); expect(armedAt).toBe(d.tick + ENEMY_SYS_REPAIR * T); expect(d.telemetry.enemyDisables).toBe(1);
    damageEnemy(d, ENEMY_WEAPONS_SLOT, ENEMY_BEAM_DAMAGE);
    expect(d.enemy.hull).toBe(ENEMY_HULL - 3 * ENEMY_BEAM_DAMAGE); expect(d.enemy.sysRepairTick[EnemySystem.Weapons]).toBe(armedAt); expect(d.telemetry.enemyDisables).toBe(1);
    damageEnemy(d, ENEMY_ENGINES_SLOT, ENEMY_TORP_DAMAGE); expect(d.enemy.sysHp[EnemySystem.Engines]).toBe(0); expect(d.telemetry.enemyDisables).toBe(2);
    damageEnemy(d, ENEMY_SLOT, ENEMY_BEAM_DAMAGE); expect(Array.from(d.enemy.sysHp)).toEqual([0, 0, ENEMY_SYS_HP]);
    const k = makeState(1); quiet(k); placeEnemy(k, 15); damageEnemy(k, ENEMY_SHIELDS_SLOT, ENEMY_BEAM_DAMAGE);
    expect([k.enemy.present, k.telemetry.enemiesDestroyed, k.telemetry.enemyDisables]).toEqual([0, 1, 1]); expect(Array.from(k.enemy.sysHp)).toEqual([0, 0, 0]);
  });
  it('beamAbsorbed: shields up and a mismatched selector; never when shields are down', () => {
    const s = makeState(1); placeEnemy(s, ENEMY_HULL, 2);
    expect([beamAbsorbed(s, Weapon.BeamF1), beamAbsorbed(s, Weapon.BeamF2), beamAbsorbed(s, Weapon.BeamF3)]).toEqual([true, false, true]);
    disableSystem(s, EnemySystem.Shields);
    expect([beamAbsorbed(s, Weapon.BeamF1), beamAbsorbed(s, Weapon.BeamF2), beamAbsorbed(s, Weapon.BeamF3)]).toEqual([false, false, false]);
  });
});
```

`tests/snapshot.test.ts`: the version test moves from 9 to 10 (title, header, flattened value). Extend the enemy round-trip test: set `s.enemy.sysHp.set([30, 0, 12]); s.enemy.sysRepairTick.set([-1, 7777, -1]); s.enemy.shieldFreq = 3; s.enemy.scanned = 1; s.enemy.scan = 0.45; s.telemetry.enemyDisables = 4;`, assert they round-trip, and add mutate checks for each of the ten new fields (`sysHp[k]` and `sysRepairTick[k]` for k 0..2, `shieldFreq`, `scanned`, `scan`, `enemyDisables`). Add:

```ts
  it('a run saved with the enemy weapons down, a repair due in 10 ticks, a shot due in 15 and an enemy scan running continues like the uninterrupted run', () => {
    const setup = (s: ReturnType<typeof makeState>) => { run(s, 100); placeEnemy(s); disableSystem(s, EnemySystem.Weapons); s.enemy.sysRepairTick[EnemySystem.Weapons] = s.tick + 10; s.enemy.nextShotTick = s.tick + 15; const c = s.derived.stationOfKind[StationKind.Science]!; sitDown(s, 1, c); s.stations.cursor[c] = ENEMY_SLOT; s.science.scanning = 1; };
    const whole = makeState(2, 31); whole.director.nextSpawnTick = 1e9; setup(whole);
    const part = makeState(2, 31); part.director.nextSpawnTick = 1e9; setup(part);
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(part))));
    run(whole, 40); run(resumed, 40);
    expect(resumed.enemy.sysHp[EnemySystem.Weapons]).toBe(ENEMY_SYS_HP); expect(shotsInFlight(resumed)).toBe(1); expect(resumed.enemy.scan).toBeGreaterThan(0);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
```

(imports: `disableSystem` from helpers, `EnemySystem` from enemy, `ENEMY_SLOT` from debrisTargets, `shotsInFlight` from debris, `ENEMY_SYS_HP` from tuning; `sitDown`, `StationKind` already imported.)

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/enemy.test.ts tests/snapshot.test.ts` → import errors on the new names.

- [ ] **Step 3: Tuning, state, flatten**

`tuning.ts`: `SIM_VERSION = 11`; `ENEMY_BEAM_BASE = 0.70` with the comment `// engines-up chance 0.70 at output 0.5 after ENEMY_EVADE; was 0.55 before Combat-ii`; append `export const ENEMY_SYS_HP = 30, ENEMY_SYS_REPAIR = 45, ENEMY_EVADE = 0.15;   // subsystem health, seconds to self-repair, beam threshold penalty while the engines are up (spec Combat-ii section 8)`.

`state.ts`: the `enemy` interface gains `sysHp: Int32Array; sysRepairTick: Int32Array; shieldFreq: number; scanned: number; scan: number`; `telemetry` gains `enemyDisables: number`. Init: `sysHp: new Int32Array(3), sysRepairTick: new Int32Array(3).fill(-1), shieldFreq: 0, scanned: 0, scan: 0` and `enemyDisables: 0`.

`flatten.ts`: `ENEMY_FIELDS = 15`, `TELEMETRY_SCALARS = 13`; in `flatten` after `put(en.departTick);` add `for (const v of en.sysHp) put(v); for (const v of en.sysRepairTick) put(v); put(en.shieldFreq); put(en.scanned); put(en.scan);`, and after `put(tm.enemiesDestroyed)` add `put(tm.enemyDisables);`; in `unflatten` the telemetry key list gains `'enemyDisables'`, and after the enemy scalar loop add `for (let k = 0; k < 3; k++) s.enemy.sysHp[k] = get(); for (let k = 0; k < 3; k++) s.enemy.sysRepairTick[k] = get(); s.enemy.shieldFreq = get(); s.enemy.scanned = get(); s.enemy.scan = get();`.

- [ ] **Step 4: debrisTargets.ts**

```ts
export const ENEMY_SLOT = DEBRIS_SLOTS, ENEMY_WEAPONS_SLOT = DEBRIS_SLOTS + 1, ENEMY_ENGINES_SLOT = DEBRIS_SLOTS + 2, ENEMY_SHIELDS_SLOT = DEBRIS_SLOTS + 3;
/** Hull, weapons, engines, shields: four rows of one enemy (spec Combat-ii section 6). Never indices into the debris arrays. */
export const ENEMY_SLOTS: readonly number[] = [ENEMY_SLOT, ENEMY_WEAPONS_SLOT, ENEMY_ENGINES_SLOT, ENEMY_SHIELDS_SLOT];
export function isEnemySlot(slot: number): boolean { return slot >= DEBRIS_SLOTS; }
/** EnemySystem index of a subsystem slot; -1 for the hull row. */
export function enemySystemOf(slot: number): number { return slot - DEBRIS_SLOTS - 1; }
export function targetStableId(state: SimState, slot: number): number { return isEnemySlot(slot) ? state.enemy.stableId : state.debris.stableId[slot]!; }
export function isTarget(state: SimState, slot: number): boolean {
  if (isEnemySlot(slot)) return state.enemy.present === 1;
  return state.debris.active[slot] === 1 && state.debris.warned[slot] === 1;
}
```

`warnedTargets`: `if (state.enemy.present) out.push(...ENEMY_SLOTS);` and `sort((a, b) => targetStableId(state, a) - targetStableId(state, b) || a - b)`. `nextTarget(state, afterStableId, exclude: number | readonly number[] = -1)`: `const ex = typeof exclude === 'number' ? [exclude] : exclude; const list = warnedTargets(state).filter((k) => !ex.includes(k));` then as before.

- [ ] **Step 5: enemy.ts**

Replace `enemyBeamHits` and extend the module:

```ts
export const EnemySystem = { Weapons: 0, Engines: 1, Shields: 2 } as const;
export const ENEMY_SYSTEM_NAMES = ['weapons', 'engines', 'shields'] as const;

/** Beam threshold against the ship: the base and output term minus the evasion the engines provide; not clamped (spec Combat-ii section 5). */
export function enemyBeamThreshold(state: SimState, output: number): number {
  return ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE * output - (state.enemy.sysHp[EnemySystem.Engines]! > 0 ? ENEMY_EVADE : 0);
}
/** Shields up and the selector's frequency is not the shield frequency: the beam is absorbed without a roll. */
export function beamAbsorbed(state: SimState, selector: number): boolean {
  return state.enemy.sysHp[EnemySystem.Shields]! > 0 && selector + 1 !== state.enemy.shieldFreq;
}
```

`arrive`: after the Combat-i fields add `e.sysHp.fill(ENEMY_SYS_HP); e.sysRepairTick.fill(-1); e.shieldFreq = 1 + nextInt(state.rng.hazards, FREQ_COUNT); e.scanned = 0; e.scan = 0;` (import `nextInt`, `FREQ_COUNT`, `ENEMY_SYS_HP`, `ENEMY_SYS_REPAIR`, `ENEMY_EVADE`, and `isEnemySlot, ENEMY_SLOTS` from debrisTargets).

`leave`:

```ts
export function leave(state: SimState, destroyed: boolean): void {
  const e = state.enemy, sci = state.derived.stationOfKind[StationKind.Science]!;
  const scanningEnemy = sci >= 0 && isEnemySlot(state.stations.cursor[sci]!);
  for (const kind of TARGETING_KINDS) {
    const i = state.derived.stationOfKind[kind]!;
    if (i >= 0 && isEnemySlot(state.stations.cursor[i]!)) state.stations.cursor[i] = nextTarget(state, e.stableId, ENEMY_SLOTS);
  }
  e.present = 0; e.hull = 0; e.stableId = 0; e.nextShotTick = -1; e.departTick = -1;
  e.sysHp.fill(0); e.sysRepairTick.fill(-1); e.shieldFreq = 0; e.scanned = 0; e.scan = 0;
  if (scanningEnemy) state.science.scanning = 0;
  if (destroyed) state.telemetry.enemiesDestroyed++;
  e.nextArrivalTick = state.tick + jitteredTicks(state, ENCOUNTER_COOLDOWN);
}

/** Hull damage always; a subsystem row also damages that system, arming its repair when it reaches 0 (spec Combat-ii section 5). */
export function damageEnemy(state: SimState, slot: number, amount: number): void {
  const e = state.enemy, sys = enemySystemOf(slot);
  e.hull = Math.max(0, e.hull - amount);
  if (sys >= 0 && e.sysHp[sys]! > 0) {
    e.sysHp[sys] = Math.max(0, e.sysHp[sys]! - amount);
    if (e.sysHp[sys] === 0) { e.sysRepairTick[sys] = state.tick + ENEMY_SYS_REPAIR * TICK_HZ; state.telemetry.enemyDisables++; }
  }
  if (e.hull === 0) leave(state, true);
}

export function enemySystem(state: SimState): void {
  const e = state.enemy;
  if (!e.present) { if (state.tick >= e.nextArrivalTick) arrive(state); return; }
  for (let sys = 0; sys < 3; sys++) {
    if (e.sysRepairTick[sys]! >= 0 && state.tick >= e.sysRepairTick[sys]!) {
      e.sysHp[sys] = ENEMY_SYS_HP; e.sysRepairTick[sys] = -1;
      if (sys === EnemySystem.Weapons) e.nextShotTick = state.tick + ENEMY_FIRST_SHOT * TICK_HZ;
    }
  }
  if (e.sysHp[EnemySystem.Engines] === 0) e.departTick += 1;                       // the departure clock stands still while the engines are down
  if (state.tick >= e.departTick) { leave(state, false); return; }
  if (state.tick < e.nextShotTick) return;
  e.nextShotTick = state.tick + jitteredTicks(state, fireInterval(minutesOf(state), state.playerCount));
  if (e.sysHp[EnemySystem.Weapons]! > 0 && shotsInFlight(state) < ENEMY_SHOTS_MAX) spawnShot(state);
}
```

`weapons.ts` (mechanical, so the task compiles; Task 2 does the real rewiring): replace `enemyBeamHits(u, output)` with `u < enemyBeamThreshold(state, output)` and `damageEnemy(state, amount)` with `damageEnemy(state, c, amount)`; import the new name.

- [ ] **Step 6: Run, survival gate, re-bless, full suite**

`npx vitest run tests/enemy.test.ts tests/snapshot.test.ts tests/weapons.test.ts tests/boundary.test.ts` → PASS. Then the survival gate **before** the re-bless: `npx vitest run tests/gate-survival.test.ts`; copy the three figure lines (add a temporary `console.log`, then remove it). If a seed fails: `ENEMY_FIRE_INTERVAL` 15 → 20 in `tuning.ts`, re-run, record before/after. Then `npm run bless` (cause: SIM_VERSION 11 and the new enemy and telemetry fields are hashed; no enemy in the two-minute replay), `npm test`, `npm run typecheck`, `npm run build` → pass. (`tests/hud.test.ts` may fail on the nine-entry window counts now being twelve; if so, that failure belongs to Task 3: change only `toHaveLength(9)` → `toHaveLength(12)` and `cursor 8` stays, `first` stays 3 and 2, to keep the suite green here, and say so in the report.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/state.ts src/renderer/src/sim/flatten.ts src/renderer/src/sim/tuning.ts src/renderer/src/sim/debrisTargets.ts src/renderer/src/sim/enemy.ts src/renderer/src/sim/weapons.ts tests/helpers/sim.ts tests/enemy.test.ts tests/snapshot.test.ts tests/hud.test.ts tests/golden/basic.json
git commit -m "feat: enemy subsystems with health and self-repair, a shield frequency drawn on arrival, four enemy target rows; engines pause the departure and raise the beam threshold, downed weapons stop new shots; SIM_VERSION 11 (golden re-blessed: the new enemy and telemetry fields are hashed)"
```

---

### Task 2: Shields in the fire path, the enemy scan, the productive predicates, the combat gate

**Files:**
- Modify: `src/renderer/src/sim/weapons.ts`, `science.ts`, `productive.ts`, `tests/enemy.test.ts`, `tests/productive.test.ts` (if a fixture depends on `anyWarned`)

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces: the absorbed path in `fireWeapon`; the enemy scan; objects-only predicates.

- [ ] **Step 1: Write the failing tests**

In `tests/enemy.test.ts` the `armed()` helper gains `shieldFreq = 1` as a third parameter passed to `placeEnemy`, and the "every beam selector" loop becomes:

```ts
    for (const selector of [Weapon.BeamF1, Weapon.BeamF2, Weapon.BeamF3]) {   // shields up: only the matched selector rolls
      const { s } = armed(ENEMY_HULL, 1); s.weapons.selector = selector; s.rng.combat.s = 6; const c0 = s.rng.combat.s;
      const hit = fireWeapon(s);
      if (selector === Weapon.BeamF1) { expect(hit).toBe(true); expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_BEAM_DAMAGE); expect(s.rng.combat.s).not.toBe(c0); }
      else { expect(hit).toBe(false); expect(s.enemy.hull).toBe(ENEMY_HULL); expect(s.rng.combat.s).toBe(c0); expect([s.telemetry.shots, s.telemetry.hits]).toEqual([1, 0]); expect(s.weapons.charge).toBe(0); }
    }
    for (const selector of [Weapon.BeamF1, Weapon.BeamF2, Weapon.BeamF3]) {   // shields down: every selector rolls and hits at 0.526 < 0.70
      const { s } = armed(ENEMY_HULL, 1); disableSystem(s, EnemySystem.Shields); s.weapons.selector = selector; s.rng.combat.s = 6;
      expect(fireWeapon(s)).toBe(true); expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_BEAM_DAMAGE);
    }
```

Append:

```ts
describe('enemy systems: shields in the fire path, subsystem rows, the scan', () => {
  const armedAt = (slot: number, shieldFreq = 1, hull = ENEMY_HULL) => { const s = makeState(2); quiet(s); placeEnemy(s, hull, shieldFreq); const w = wpn(s); sitDown(s, 0, w); s.stations.cursor[w] = slot; s.weapons.charge = 1; return { s, w }; };
  it('an absorbed beam counts the shot, stamps, awards XP, resets the charge, draws nothing and damages nothing', () => {
    const { s } = armedAt(ENEMY_SLOT, 2); s.weapons.selector = Weapon.BeamF1; const c0 = s.rng.combat.s;
    expect(fireWeapon(s)).toBe(false);
    expect(s.enemy.hull).toBe(ENEMY_HULL); expect(Array.from(s.enemy.sysHp)).toEqual([ENEMY_SYS_HP, ENEMY_SYS_HP, ENEMY_SYS_HP]); expect(s.weapons.charge).toBe(0);
    expect([s.telemetry.shots, s.telemetry.hits]).toEqual([1, 0]); expect(s.skills.xp[xpIndex(0, Skill.Weapons)]).toBe(XP_PER_SHOT); expect(s.skills.lastShotTick).toBe(s.tick); expect(s.rng.combat.s).toBe(c0);
  });
  it('a torpedo ignores the shields and the selector frequency', () => {
    const { s } = armedAt(ENEMY_SLOT, 2); s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoaded = 1; s.rng.combat.s = 7;
    expect(fireWeapon(s)).toBe(true); expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_TORP_DAMAGE);
  });
  it('beams on a subsystem row damage the system and the hull; a down system takes hull only; the kill through a subsystem row leaves', () => {
    const { s, w } = armedAt(ENEMY_WEAPONS_SLOT); const shoot = () => { s.weapons.charge = 1; s.rng.combat.s = 7; expect(fireWeapon(s)).toBe(true); };
    shoot(); expect([s.enemy.hull, s.enemy.sysHp[EnemySystem.Weapons]]).toEqual([85, 15]);
    shoot(); expect([s.enemy.hull, s.enemy.sysHp[EnemySystem.Weapons], s.telemetry.enemyDisables]).toEqual([70, 0, 1]); expect(s.enemy.sysRepairTick[EnemySystem.Weapons]).toBe(s.tick + ENEMY_SYS_REPAIR * T);
    const armedTick = s.enemy.sysRepairTick[EnemySystem.Weapons];
    shoot(); expect([s.enemy.hull, s.enemy.sysHp[EnemySystem.Weapons], s.telemetry.enemyDisables]).toEqual([55, 0, 1]); expect(s.enemy.sysRepairTick[EnemySystem.Weapons]).toBe(armedTick);
    s.stations.cursor[w] = ENEMY_ENGINES_SLOT; s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoaded = 1; s.rng.combat.s = 7;
    expect(fireWeapon(s)).toBe(true); expect([s.enemy.hull, s.enemy.sysHp[EnemySystem.Engines], s.telemetry.enemyDisables]).toEqual([20, 0, 2]);
    const k = armedAt(ENEMY_SHIELDS_SLOT, 1, 15); k.s.rng.combat.s = 7;
    expect(fireWeapon(k.s)).toBe(true); expect([k.s.enemy.present, k.s.telemetry.enemiesDestroyed, k.s.telemetry.enemyDisables]).toEqual([0, 1, 1]);
  });
  it('the enemy scan: Confirm on the hull row starts it, scanStep advances and completes it, subsystem rows neither start nor progress it, leave clears it', () => {
    const s = makeState(1); quiet(s); placeEnemy(s, ENEMY_HULL, 3); const c = sci(s); sitDown(s, 0, c); s.stations.cursor[c] = ENEMY_SLOT;
    scienceInput(s, c, -1, true); expect(s.science.scanning).toBe(1);
    scanStep(s); expect(s.enemy.scan).toBeCloseTo(DT * 0.5 / SCAN_TIME, 12);                 // Recruit at the starter Science allocation: output 0.5
    s.stations.cursor[c] = ENEMY_SHIELDS_SLOT; const paused = s.enemy.scan; scanStep(s); expect(s.enemy.scan).toBe(paused);
    s.stations.cursor[c] = ENEMY_SLOT; const calls = Math.ceil(SCAN_TIME / 0.5 / DT);
    for (let n = 0; n < calls; n++) scanStep(s);
    expect(s.enemy.scan).toBe(1); expect(s.enemy.scanned).toBe(1); expect(s.science.scanning).toBe(0);
    scienceInput(s, c, -1, true); expect(s.science.scanning).toBe(0);                          // scanned: nothing to start
    const t = makeState(1); quiet(t); placeEnemy(t); const c2 = sci(t); sitDown(t, 0, c2); t.stations.cursor[c2] = ENEMY_WEAPONS_SLOT;
    scienceInput(t, c2, -1, true); expect(t.science.scanning).toBe(0);
    t.stations.cursor[c2] = ENEMY_SLOT; scienceInput(t, c2, -1, true); scanStep(t); standUp(t, 0); const kept = t.enemy.scan; scanStep(t); expect(t.enemy.scan).toBe(kept);
    sitDown(t, 0, c2); t.stations.cursor[c2] = ENEMY_SLOT; scienceInput(t, c2, -1, true); scanStep(t); expect(t.enemy.scan).toBeGreaterThan(kept);
    leave(t, false); expect([t.enemy.scan, t.enemy.scanned, t.science.scanning]).toEqual([0, 0, 0]);
    const absent = makeState(1); const c3 = sci(absent); sitDown(absent, 0, c3); absent.stations.cursor[c3] = ENEMY_SLOT; scienceInput(absent, c3, -1, true); expect(absent.science.scanning).toBe(0);
  });
  it('productive: a running enemy scan is productive; the enemy alone (all four rows) is not; the read trap covers slots 8 to 11', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); s.enemy.nextShotTick = 1e9; const c = sci(s), n = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, c); sitDown(s, 1, n);
    for (const slot of ENEMY_SLOTS) { s.stations.cursor[c] = slot; expect(isProductive(s, c)).toBe(false); }
    expect(isProductive(s, n)).toBe(false);
    s.stations.cursor[c] = ENEMY_SLOT; s.science.scanning = 1; expect(isProductive(s, c)).toBe(true);
    s.enemy.scanned = 1; expect(isProductive(s, c)).toBe(false);
    const g = makeState(2); quiet(g); placeEnemy(g); const cg = sci(g), wg = wpn(g); sitDown(g, 0, cg); sitDown(g, 1, wg); g.weapons.charge = 1; guardDebris(g);
    for (const slot of ENEMY_SLOTS) {
      g.stations.cursor[cg] = slot; g.stations.cursor[wg] = slot; g.science.scanning = 1;
      expect(() => { scienceInput(g, cg, -1, true); scanStep(g); isProductive(g, cg); g.rng.combat.s = 7; fireWeapon(g); g.weapons.charge = 1; }).not.toThrow();
    }
  });
});
```

(imports: `standUp` from stations; `DT, SCAN_TIME` from tuning; `guardDebris` must trap `String(k)` for every `k` in `ENEMY_SLOTS`: change its check to `ENEMY_SLOTS.map(String).includes(p as string)`.) The combat gate test becomes: `placeEnemy(s, ENEMY_HULL, 2)`, selector `BeamF1` for the first full charge (no combat reset; assert after it `shots 1, hits 0, hull 100`), then `s.weapons.selector = Weapon.BeamF2` and `rng.combat.s = 7` before every later Confirm; final `shots 8`, `[8, 7, 1]`, `present 0`, `tick < depart`; rename the describe to "… one absorbed beam, then seven hits".

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/enemy.test.ts` → absorbed beams still roll; subsystem rows reject or damage hull only; the enemy scan does not start.

- [ ] **Step 3: weapons.ts, science.ts, productive.ts**

`weapons.ts` `fireWeapon` body after the readiness and target checks:

```ts
  const enemy = isEnemySlot(c), output = stationOutput(state, wpn);
  let hit = false;
  if (w.selector === Weapon.Torpedo) {
    if (!w.torpedoLoaded) return false;
    hit = torpedoHits(nextFloat(state.rng.combat), output);                      // homing: no shield, no evasion
    w.torpedoLoaded = 0;
  } else {
    if (w.charge < 1) return false;
    w.charge = 0;
    if (!(enemy && beamAbsorbed(state, w.selector))) {                             // an absorbed beam is a shot taken with no roll (spec Combat-ii section 5)
      const u = nextFloat(state.rng.combat);
      hit = enemy ? u < enemyBeamThreshold(state, output) : beamHits(u, output, w.selector + 1 === db.frequency[c]);
    }
  }
  state.skills.lastShotTick = state.tick; state.telemetry.shots++; addXp(state, state.stations.occupant[wpn]!, Skill.Weapons, XP_PER_SHOT);
  if (hit) {
    state.telemetry.hits++;
    if (enemy) damageEnemy(state, c, w.selector === Weapon.Torpedo ? ENEMY_TORP_DAMAGE : ENEMY_BEAM_DAMAGE); else removeDebris(state, c);
  }
  return hit;
```

(import `isEnemySlot` instead of `ENEMY_SLOT`, `beamAbsorbed` and `enemyBeamThreshold` from enemy.)

`science.ts`:

```ts
export function scienceInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  cycleTarget(state, i, dir);
  if (!confirm) return;
  const c = state.stations.cursor[i]!, db = state.debris, e = state.enemy;
  if (c < 0) return;
  if (isEnemySlot(c)) { if (c === ENEMY_SLOT && e.present && !e.scanned) state.science.scanning = 1; return; }   // only the hull row scans the ship (spec Combat-ii section 5)
  if (db.active[c] && db.warned[c] && !db.scanned[c]) state.science.scanning = 1;
}
export function scanStep(state: SimState): void {
  if (!state.science.scanning) return;
  const sci = state.derived.stationOfKind[StationKind.Science]!;
  if (sci < 0 || !stationOnline(state, sci) || state.stations.occupant[sci]! < 0) return;
  const c = state.stations.cursor[sci]!, db = state.debris, e = state.enemy;
  if (c < 0) return;
  if (isEnemySlot(c)) {
    if (c !== ENEMY_SLOT || !e.present || e.scanned) return;
    e.scan = Math.min(1, e.scan + DT * stationOutput(state, sci) / SCAN_TIME);
    if (e.scan >= 1) { e.scanned = 1; state.science.scanning = 0; }
    return;
  }
  if (!db.active[c] || !db.warned[c] || db.scanned[c]) return;
  db.scan[c] = Math.min(1, db.scan[c]! + DT * stationOutput(state, sci) / SCAN_TIME);
  if (db.scan[c]! >= 1) { db.scanned[c] = 1; state.science.scanning = 0; }
}
```

`productive.ts`: `function anyWarned(state: SimState): boolean { return warnedTargets(state).some((k) => k < DEBRIS_SLOTS); }   // objects only (spec Combat-ii section 3)`; the Science case: `const e = state.enemy; const scanningValid = state.science.scanning === 1 && c >= 0 && (c === ENEMY_SLOT ? e.present === 1 && e.scanned === 0 : !isEnemySlot(c) && db.active[c] === 1 && db.warned[c] === 1 && db.scanned[c] === 0);` (import `DEBRIS_SLOTS` from tuning and `isEnemySlot` from debrisTargets).

- [ ] **Step 4: Run and full suite**

`npx vitest run tests/enemy.test.ts tests/science.test.ts tests/productive.test.ts tests/weapons.test.ts tests/gate-survival.test.ts` → PASS (the gate figures must match Task 1's report exactly; this task changes no enemy fire). `npm test`, `npm run typecheck`, `npm run build` → pass; golden unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/weapons.ts src/renderer/src/sim/science.ts src/renderer/src/sim/productive.ts tests/enemy.test.ts tests/productive.test.ts
git commit -m "feat: shields absorb mismatched beams without a roll, torpedoes bypass them; subsystem rows take system and hull damage; Science scans the enemy's shield frequency; objects-only productive predicates; combat gate with an absorbed first beam"
```

---

### Task 3: HUD rows and markers, the record and the table

**Files:**
- Modify: `src/renderer/src/render/hudModel.ts`, `src/renderer/src/sim/telemetry.ts`, `src/renderer/src/sim/acceptance.ts`, `tests/hud.test.ts`, `tests/telemetry.test.ts`, `tests/acceptance.test.ts`

**Interfaces:**
- Produces: `DebrisTarget.system/status/shieldsUp`; `targetRowText` for the new rows; `TelemetryRecord.enemy.disables`; the three-part column.

- [ ] **Step 1: Write the failing tests**

`tests/hud.test.ts`: every existing expected target object gains `system: null, status: null` and `shieldsUp: null` (objects) or `shieldsUp: true` (the enemy hull row); the nine-entry window test becomes twelve entries (`toHaveLength(12)`, cursor 8, `first` 3 and 2 unchanged) and adds the cursor on `ENEMY_SHIELDS_SLOT` (index 11): `first` 6 (Weapons) and 5 (Science); the `targetRowText` test's enemy fixture gains `system: null, status: null, shieldsUp: true` and expects `'Enemy 64% 87s S?'` (both with and without scan 0 → with `scan 0.4` expects `'Enemy 64% 87s S? 40%'`). Append:

```ts
  it('targetRowText: the hull row markers and scan suffix, the subsystem rows intact and down', () => {
    const hull = { stableId: 9, kind: 'enemy' as const, room: 'Enemy ship', eta: 87, frequency: null as number | null, hull: 0.64, system: null, status: null, shieldsUp: true as boolean | null };
    expect(targetRowText(hull)).toBe('Enemy 64% 87s S?'); expect(targetRowText({ ...hull, frequency: 2 })).toBe('Enemy 64% 87s S2');
    expect(targetRowText({ ...hull, frequency: 2, shieldsUp: false })).toBe('Enemy 64% 87s S-'); expect(targetRowText({ ...hull, shieldsUp: false }, 0.4)).toBe('Enemy 64% 87s S- 40%');
    expect(targetRowText(hull, 0.4)).toBe('Enemy 64% 87s S? 40%'); expect(targetRowText({ ...hull, frequency: 2 }, 1)).toBe('Enemy 64% 87s S2');
    const sys = (system: number, hp: number, repairIn: number | null) => ({ ...hull, hull: null, system, status: { hp, repairIn } });
    expect(targetRowText(sys(0, 30, null))).toBe('Enemy weapons 100%'); expect(targetRowText(sys(0, 15, null))).toBe('Enemy weapons 50%');
    expect(targetRowText(sys(0, 0, 31))).toBe('Enemy weapons DOWN 31s'); expect(targetRowText(sys(1, 0, 1))).toBe('Enemy engines DOWN 1s'); expect(targetRowText(sys(2, 30, null), 0.4)).toBe('Enemy shields 100%');
  });
  it('the model gives four enemy rows with system and status, the Science scan on the hull row only, and threat suffixes per down system', () => {
    const s = makeState(2), A = room(s, 'A'); quiet(s); const w = s.derived.stationOfKind[StationKind.Weapons]!, c = s.derived.stationOfKind[StationKind.Science]!;
    placeDebris(s, A, 600, 1); placeEnemy(s, 64, 2); sitDown(s, 0, w); sitDown(s, 1, c); s.enemy.scan = 0.4;
    let m = buildHudModel(s, slots(2), 'running', ''); let wp = m.players[0]!.console as WeaponsPanel, sp = m.players[1]!.console as SciencePanel;
    expect(wp.targets.slice(1).map((t) => [t.kind, t.system, t.status, t.shieldsUp, t.frequency, t.hull])).toEqual([
      ['enemy', null, null, true, null, 0.64], ['enemy', 0, { hp: 30, repairIn: null }, true, null, null], ['enemy', 1, { hp: 30, repairIn: null }, true, null, null], ['enemy', 2, { hp: 30, repairIn: null }, true, null, null]]);
    expect(sp.targets.slice(1).map((t) => t.scan)).toEqual([0.4, 0, 0, 0]);
    expect(m.threats[0]).toEqual({ icon: 'icon.weapons', text: 'Enemy ship: hull 64%' });
    disableSystem(s, EnemySystem.Weapons); disableSystem(s, EnemySystem.Shields); s.enemy.scanned = 1;
    m = buildHudModel(s, slots(2), 'running', ''); wp = m.players[0]!.console as WeaponsPanel;
    expect(wp.targets[1]).toMatchObject({ frequency: 2, shieldsUp: false }); expect(wp.targets[2]!.status).toEqual({ hp: 0, repairIn: 45 }); expect(wp.targets[4]!.status).toEqual({ hp: 0, repairIn: 45 });
    expect(m.threats[0]!.text).toBe('Enemy ship: hull 64% weapons DOWN shields DOWN');
    expect(() => { for (const slot of ENEMY_SLOTS) { s.stations.cursor[w] = slot; s.stations.cursor[c] = slot; buildHudModel(s, slots(2), 'running', ''); } }).not.toThrow();
  });
```

(imports: `ENEMY_SLOTS` from debrisTargets, `EnemySystem` from enemy, `disableSystem` from helpers.)

`tests/telemetry.test.ts`: the exact-record fixture sets `t.enemyDisables = 3` and expects `enemy: { met: 2, destroyed: 1, disables: 3 }`; the fresh-state assertion expects `{ met: 0, destroyed: 0, disables: 0 }`. `tests/acceptance.test.ts`: `rec()` gains `disables: 0` in `enemy`; the second row's `over` becomes `enemy: { met: 2, destroyed: 1, disables: 3 }`; row regex tails `1\/3\s+0\/0$` → `1\/3\s+0\/0\/0$` and `0\/0\s+2\/1$` → `0\/0\s+2\/1\/3$`.

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/hud.test.ts tests/telemetry.test.ts tests/acceptance.test.ts` → the new fields and strings are missing.

- [ ] **Step 3: hudModel.ts, telemetry.ts, acceptance.ts**

`hudModel.ts` (imports: `isEnemySlot, enemySystemOf, ENEMY_SLOT` from debrisTargets; `EnemySystem, ENEMY_SYSTEM_NAMES` from enemy; `ENEMY_SYS_HP, TICK_HZ` from tuning):

```ts
export interface DebrisTarget { stableId: number; kind: TargetKindName; room: string; eta: number; frequency: number | null; hull: number | null; system: number | null; status: { hp: number; repairIn: number | null } | null; shieldsUp: boolean | null }

function target(state: SimState, k: number): DebrisTarget {
  if (isEnemySlot(k)) {
    const e = state.enemy, shieldsUp = e.sysHp[EnemySystem.Shields]! > 0;
    const base = { stableId: e.stableId, kind: 'enemy' as const, room: 'Enemy ship', eta: Math.ceil((e.departTick - state.tick) * DT), frequency: null as number | null, hull: null as number | null, system: null as number | null, status: null as DebrisTarget['status'], shieldsUp };
    if (k === ENEMY_SLOT) return { ...base, hull: e.hull / ENEMY_HULL, frequency: e.scanned ? e.shieldFreq : null };
    const sys = enemySystemOf(k), hp = e.sysHp[sys]!;
    return { ...base, system: sys, status: { hp, repairIn: hp > 0 ? null : Math.ceil((e.sysRepairTick[sys]! - state.tick) / TICK_HZ) } };
  }
  const db = state.debris;
  return { stableId: db.stableId[k]!, kind: db.kind[k] === ObjectKind.Shot ? 'shot' : 'debris', room: state.layout.rooms[db.room[k]!]!.name, eta: etaSeconds(state, k), frequency: db.scanned[k] ? db.frequency[k]! : null, hull: null, system: null, status: null, shieldsUp: null };
}

export function targetRowText(t: DebrisTarget, scan = 0): string {
  if (t.kind === 'enemy') {
    if (t.system !== null && t.status) return t.status.hp > 0 ? `Enemy ${ENEMY_SYSTEM_NAMES[t.system]} ${Math.round(t.status.hp / ENEMY_SYS_HP * 100)}%` : `Enemy ${ENEMY_SYSTEM_NAMES[t.system]} DOWN ${t.status.repairIn}s`;
    const marker = t.shieldsUp === false ? 'S-' : t.frequency !== null ? `S${t.frequency}` : 'S?';
    return `Enemy ${Math.round((t.hull ?? 0) * 100)}% ${t.eta}s ${marker}${t.frequency === null && scan > 0 ? ` ${Math.floor(scan * 100)}%` : ''}`;
  }
  return `${t.kind === 'shot' ? 'Shot ' : ''}${t.room} ${t.eta}s F${t.frequency ?? '?'}${t.frequency === null && scan > 0 ? ` ${Math.floor(scan * 100)}%` : ''}`;
}
```

Science panel: `scan: k === ENEMY_SLOT ? state.enemy.scan : isEnemySlot(k) ? 0 : state.debris.scan[k]!`. Threats: the enemy row text becomes `` `Enemy ship: hull ${Math.round(...)}%${ENEMY_SYSTEM_NAMES.map((name, sys) => (state.enemy.sysHp[sys] === 0 ? ` ${name} DOWN` : '')).join('')}` ``; the object loop's guard becomes `if (isEnemySlot(k)) continue;`.

`telemetry.ts`: `enemy: { met: number; destroyed: number; disables: number }` and `enemy: { met: t.encounters, destroyed: t.enemiesDestroyed, disables: t.enemyDisables }`. `acceptance.ts`: the enemy cell becomes `` `${r.enemy.met}/${r.enemy.destroyed}/${r.enemy.disables}` ``.

- [ ] **Step 4: Run and full suite**

`npx vitest run tests/hud.test.ts tests/telemetry.test.ts tests/acceptance.test.ts tests/render.test.ts tests/renderPure.test.ts` → PASS. `npm test`, `npm run typecheck`, `npm run build` → pass; golden unchanged; `npm run acceptance 1 1` → three rows ending `0/0/0`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/render/hudModel.ts src/renderer/src/sim/telemetry.ts src/renderer/src/sim/acceptance.ts tests/hud.test.ts tests/telemetry.test.ts tests/acceptance.test.ts
git commit -m "feat: HUD shows the enemy's four rows with system health, repair countdowns and the shield marker; the record and the acceptance table carry disables"
```

---

### Task 4: Gate, spec amendments, roadmap

**Files:**
- Modify: `docs/gates.md`, `docs/superpowers/specs/2026-11-11-enemy-systems-design.md`, `docs/roadmap.md`

- [ ] **Step 1: Gate section**

Run `npm run acceptance 5 1` and keep its three rows (`enemy` column `1/0/0`). Append to `docs/gates.md` the section from the spec's §10 with the real figures from the Task 1 report (seeds 1 to 3: min hull, encounter impacts, min health; any fallback), the combat gate line, the dated acceptance rows in a code block, the unchecked manual row, and the final-check line.

- [ ] **Step 2: Spec amendments and roadmap**

Append to the spec a section `## 13. Amendments from the plan` with: the `enemyBeamThreshold` replacement of `enemyBeamHits`; `enemySystemOf` in `debrisTargets.ts`; the charge reset before the roll; the survival figures and whether fallback 4 was taken. `docs/roadmap.md`: item 6 → `in review`, item 7 → `next`.

- [ ] **Step 3: Verify and commit**

`npm run typecheck`, `npm test`, `npm run build` → pass.

```bash
git add docs/gates.md docs/superpowers/specs/2026-11-11-enemy-systems-design.md docs/roadmap.md
git commit -m "docs: Combat-ii gate with survival figures and the five-minute acceptance rows, spec amendments, roadmap status"
```
