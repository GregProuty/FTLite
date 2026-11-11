# Enemy Ship (Combat-i) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An abstract enemy ship arrives on a schedule, fires kind-tagged shots through the debris pipeline, can be shot by beams and torpedoes as a pseudo-slot target, and leaves when destroyed or timed out, per `docs/superpowers/specs/2026-11-11-enemy-ship-design.md`.

**Architecture:** `state.enemy` plus a `kind` byte per debris slot; `sim/enemy.ts` owns arrival, withdrawal, fire cadence and damage; `debrisTargets.ts` folds the enemy into the shared target list as `ENEMY_SLOT = DEBRIS_SLOTS` with `targetStableId`/`isTarget`; `weapons.ts`, `science.ts`, `productive.ts` and `hudModel.ts` branch on the pseudo-slot before any debris read; `enemySystem` runs between the director and the debris step; HUD threat rows and target rows gain the enemy and the shots with a cursor-following window.

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), Pixi 8.19 (hud.ts only). No new dependencies.

## Spec amendments made by this plan (recorded in Task 4)

- `spawnDebris` and `spawnShot` share one private `spawnObject(state, kind, flight, jitter)` so the three `rng.hazards` draws stay in one place (room, flight, frequency, in that order).
- The cooldown re-arm in `leave` uses the same `ENEMY_FIRE_JITTER` (± 20 %) as the shot re-arm; the spec said "the same jitter formula" without naming the constant.
- `DebrisTarget` always carries `kind` and `hull` (`hull: null` for objects), so existing HUD fixtures gain `kind: 'debris', hull: null`.

## Global Constraints

- `tests/boundary.test.ts` stays green: `sim/` imports nothing from render/, input/, app/, pixi, electron; no `Math.random`, `Date`, `performance.now`, `Math.pow`, `window`, `document` in sim files; ASCII only in sim comments.
- Every test runs under node; `hudModel.ts` stays pixi-free.
- Determinism and draw order (exact): arrival draws nothing; a due shot draws one `rng.director` float (re-arm, always, first) then, only if a shot is actually spawned, three `rng.hazards` draws in `spawnObject` order (room `nextInt(volume.length)`, flight `nextFloat`, frequency `nextInt(FREQ_COUNT)`); withdrawal and a kill each draw one `rng.director` float (the cooldown); shooting the enemy draws one `rng.combat` float like any shot. No other draws are added.
- Per-tick order inside `enemySystem`: arrival (return) → withdrawal (return) → fire. `enemySystem` runs after `directorSystem` and before `debrisSystem` in `step()`.
- `ENEMY_SLOT = DEBRIS_SLOTS` (8) is never used to index a debris array. Every reader of a cursor or of `warnedTargets` (`weapons.ts`, `science.ts`, `productive.ts`, `debrisTargets.ts`, `hudModel.ts`) branches on it first or uses `isTarget` / `targetStableId`.
- State and flatten (exact): `enemy` block `present, hull, stableId, nextArrivalTick, nextShotTick, departTick` (6 scalars) in a new `enemy` manifest section right after `weapons`; `debris.kind` appended to the debris section after `scan` (`DEBRIS_FIELDS = 9`); `telemetry.encounters` and `telemetry.enemiesDestroyed` after `maxStress` (`TELEMETRY_SCALARS = 12`). `SIM_VERSION = 10`; version-9 snapshots rejected. Initial: `present 0, hull 0, stableId 0, nextArrivalTick ENCOUNTER_FIRST × TICK_HZ, nextShotTick −1, departTick −1`, `kind` all 0, counters 0.
- Tuning (exact): `ENCOUNTER_FIRST 180`, `ENCOUNTER_MAX 120`, `ENCOUNTER_COOLDOWN 150`, `ENEMY_HULL 100`, `ENEMY_FIRST_SHOT 5`, `ENEMY_FIRE_INTERVAL 15`, `ENEMY_FIRE_MIN 6`, `ENEMY_FIRE_JITTER 0.2`, `ENEMY_SHOTS_MAX 2`, `ENEMY_SHOT_FLIGHT 10`, `ENEMY_SHOT_JITTER 2`, `ENEMY_SHOT_HULL_DAMAGE 6`, `ENEMY_BEAM_BASE 0.55`, `ENEMY_BEAM_SCALE 0.30`, `ENEMY_BEAM_DAMAGE 15`, `ENEMY_TORP_DAMAGE 35`, `STRESS_WEIGHTS.enemy 0.30`. `fireInterval(m, p) = max(6, 15 / (1 + ESCALATION_RATE × m)) × (p === 1 ? SOLO_INTERVAL_MULT : 1)`; jitter `1 + 0.2 × (2u − 1)`.
- Rules (exact, spec §5–6): the enemy's `StableId` is allocated from `nextStableId` on arrival; the first-warning auto-select applies to the enemy (a seated Weapons or Science console with cursor −1 gets `ENEMY_SLOT`); `leave` retargets a cursor on `ENEMY_SLOT` with `nextTarget(state, stableId, ENEMY_SLOT)` **before** zeroing `stableId`; `damageEnemy` leaves at hull 0 immediately (inside the Weapons step); a shot impact deals `ENEMY_SHOT_HULL_DAMAGE` and is otherwise identical to a debris impact; `rawStress += 0.30 × present`; the enemy alone makes neither Science nor Navigation productive.
- HUD strings (exact): threat `Enemy ship: hull 64%` with `icon.weapons`; threat `Shot: <room> 7s` (+ ` F2` when scanned) with `icon.sensors`; target row `Shot <room> 7s F?` (Science adds ` 40%` while an unscanned object's scan > 0); enemy target row `Enemy 64% 87s` (percent `round(hull × 100)`, seconds `ceil` to withdrawal), no frequency, no scan text. `targetWindow(cursor, length, rows) = clamp(max(cursor, 0) − rows + 1, 0, max(0, length − rows))`; Weapons shows 6 rows, Science 7.
- Golden replay: re-blessed **once**, in Task 1 (`npm run bless`), cause recorded in the commit message; Tasks 2 and 3 leave `tests/golden/basic.json` untouched (the replay is two minutes long and the first encounter comes at 3:00, so no later task changes replay behaviour).
- Commit messages: imperative, prefixed `feat:`, `test:`, `chore:` or `docs:`, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. `npm run typecheck`, `npm test` and `npm run build` pass at the end of every task.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/enemy.ts` (new) | `fireInterval`, `enemyBeamHits`, `arrive`, `leave`, `damageEnemy`, `enemySystem`. |
| `src/renderer/src/sim/debris.ts` | `ObjectKind`, `spawnObject` (private), `spawnDebris`, `spawnShot`, `shotsInFlight`, kind-aware `resolveImpact`. |
| `src/renderer/src/sim/debrisTargets.ts` | `ENEMY_SLOT`, `targetStableId`, `isTarget`, enemy-aware `warnedTargets`/`nextTarget`. |
| `src/renderer/src/sim/{weapons,science,productive,director,step,state,flatten,tuning}.ts` | as the tasks say. |
| `src/renderer/src/sim/telemetry.ts`, `acceptance.ts` | record `enemy` block; table column. |
| `src/renderer/src/render/{hudModel,hud}.ts` | threat rows, target rows, `targetWindow`, `first`. |
| `tests/enemy.test.ts` (new); `tests/{debris,snapshot,hud,telemetry,acceptance,productive,director,gate-survival}.test.ts`; `tests/helpers/sim.ts` | as the tasks say. |
| `docs/gates.md`, the spec, `docs/roadmap.md` | Task 4. |

---

### Task 1: Enemy state, shots as kind-tagged objects, the target list, the encounter schedule

**Files:**
- Create: `src/renderer/src/sim/enemy.ts`, `tests/enemy.test.ts`
- Modify: `src/renderer/src/sim/state.ts`, `flatten.ts`, `tuning.ts`, `debris.ts`, `debrisTargets.ts`, `step.ts`, `tests/helpers/sim.ts`, `tests/snapshot.test.ts`, `tests/debris.test.ts`, `tests/golden/basic.json` (re-bless)

**Interfaces:**
- Produces: `SimState.enemy`, `SimState.debris.kind`, `telemetry.encounters`/`enemiesDestroyed`; from `debris.ts`: `ObjectKind`, `spawnShot(state): number`, `shotsInFlight(state): number`; from `debrisTargets.ts`: `ENEMY_SLOT`, `targetStableId(state, slot)`, `isTarget(state, slot)`; from `enemy.ts`: `fireInterval(minutes, players)`, `enemyBeamHits(u, output)`, `arrive(state)`, `leave(state, destroyed)`, `damageEnemy(state, amount)`, `enemySystem(state)`; helpers `placeEnemy(state, hull?)`, `placeShot(state, room, ticksOut, warned?, stableId?, frequency?)` in `tests/helpers/sim.ts`, and `placeDebris` now writes `kind 0`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/helpers/sim.ts` (imports: `ObjectKind` from `../../src/renderer/src/sim/debris`; `ENEMY_HULL, ENCOUNTER_MAX, ENEMY_FIRST_SHOT` from tuning):

```ts
/** Place an enemy as arrive() would, with a fresh StableId and no draw. */
export function placeEnemy(state: SimState, hull = ENEMY_HULL): void {
  const e = state.enemy;
  e.present = 1; e.hull = hull; e.stableId = state.nextStableId++;
  e.departTick = state.tick + ENCOUNTER_MAX * TICK_HZ; e.nextShotTick = state.tick + ENEMY_FIRST_SHOT * TICK_HZ;
}

/** Place an enemy shot directly: placeDebris with kind Shot. */
export function placeShot(state: SimState, room: number, ticksOut: number, warned = 0, stableId?: number, frequency = 1): number {
  const slot = placeDebris(state, room, ticksOut, warned, stableId, frequency);
  state.debris.kind[slot] = ObjectKind.Shot;
  return slot;
}
```

and in `placeDebris` add `db.kind[slot] = ObjectKind.Debris;` beside the other field writes (a freed shot slot keeps its byte).

Create `tests/enemy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { enemySystem, fireInterval, arrive, leave, enemyBeamHits } from '../src/renderer/src/sim/enemy';
import { ObjectKind, shotsInFlight, debrisSystem, spawnDebris } from '../src/renderer/src/sim/debris';
import { ENEMY_SLOT, targetStableId, isTarget, warnedTargets, nextTarget, cycleTarget } from '../src/renderer/src/sim/debrisTargets';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Dir } from '../src/renderer/src/sim/dir';
import { minutesOf } from '../src/renderer/src/sim/director';
import { createRng, nextFloat, nextInt } from '../src/shared/rng';
import { TICK_HZ, ENCOUNTER_FIRST, ENCOUNTER_MAX, ENCOUNTER_COOLDOWN, ENEMY_HULL, ENEMY_FIRST_SHOT, ENEMY_FIRE_JITTER, ENEMY_SHOTS_MAX, ENEMY_SHOT_FLIGHT, ENEMY_SHOT_JITTER, FREQ_COUNT, SOLO_INTERVAL_MULT, DEBRIS_SLOTS } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, armSpawn, placeEnemy, placeShot, placeDebris, room, intents } from './helpers/sim';
import { NEUTRAL_INTENT } from '../src/shared/intent';

const T = TICK_HZ;
const wpn = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Weapons]!;
const sci = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Science]!;
const jitter = (u: number) => 1 + ENEMY_FIRE_JITTER * (2 * u - 1);

describe('enemy: initial values and fireInterval', () => {
  it('a fresh state has no enemy, the first arrival armed, kind bytes zero and zero counters', () => {
    const s = makeState(2), e = s.enemy;
    expect([e.present, e.hull, e.stableId, e.nextArrivalTick, e.nextShotTick, e.departTick]).toEqual([0, 0, 0, ENCOUNTER_FIRST * T, -1, -1]);
    expect(Array.from(s.debris.kind)).toEqual(new Array(DEBRIS_SLOTS).fill(0));
    expect([s.telemetry.encounters, s.telemetry.enemiesDestroyed]).toEqual([0, 0]);
  });
  it('fireInterval escalates to the floor and solo is 1.5x', () => {
    expect(fireInterval(0, 2)).toBe(15); expect(fireInterval(3, 2)).toBeCloseTo(150 / 13, 12); expect(fireInterval(10, 2)).toBe(7.5); expect(fireInterval(15, 2)).toBe(6); expect(fireInterval(0, 1)).toBe(15 * SOLO_INTERVAL_MULT);
  });
});

describe('enemy: schedule (enemySystem called directly)', () => {
  it('arrives exactly at ENCOUNTER_FIRST with no draw, allocating a StableId and arming the shot and departure clocks', () => {
    const s = makeState(2); const d0 = s.rng.director.s, h0 = s.rng.hazards.s, id = s.nextStableId;
    s.tick = ENCOUNTER_FIRST * T - 1; enemySystem(s);
    expect(s.enemy.present).toBe(0);
    s.tick = ENCOUNTER_FIRST * T; enemySystem(s);
    const e = s.enemy;
    expect([e.present, e.hull, e.stableId, e.departTick, e.nextShotTick]).toEqual([1, ENEMY_HULL, id, s.tick + ENCOUNTER_MAX * T, s.tick + ENEMY_FIRST_SHOT * T]);
    expect(s.nextStableId).toBe(id + 1); expect(s.telemetry.encounters).toBe(1);
    expect(s.rng.director.s).toBe(d0); expect(s.rng.hazards.s).toBe(h0);
  });
  it('arrival auto-selects the enemy only for a seated targeting console with no selection', () => {
    const s = makeState(2), w = wpn(s), c = sci(s), A = room(s, 'A');
    sitDown(s, 0, w); placeDebris(s, A, 600, 1); sitDown(s, 1, c);   // Science sat after the warning: cursor on slot 0; Weapons sat before: cursor -1 until... (sitDown selects warnedTargets()[0], so both are on slot 0)
    s.stations.cursor[w] = -1;                                      // force Weapons to "nothing selected"
    s.tick = ENCOUNTER_FIRST * T; enemySystem(s);
    expect(s.stations.cursor[w]).toBe(ENEMY_SLOT); expect(s.stations.cursor[c]).toBe(0);
  });
  it('a due shot re-arms with one director draw, then spawns a Shot with the three hazards draws, in spawnObject order', () => {
    const s = makeState(2); quiet(s); placeEnemy(s);
    s.tick = s.enemy.nextShotTick - 1; enemySystem(s);
    expect(shotsInFlight(s)).toBe(0);
    s.tick = s.enemy.nextShotTick; s.rng.director.s = 7; s.rng.hazards.s = 7;
    const dr = createRng(7), u = nextFloat(dr);
    const hz = createRng(7), rm = nextInt(hz, s.derived.volume.length), flight = ENEMY_SHOT_FLIGHT + (2 * nextFloat(hz) - 1) * ENEMY_SHOT_JITTER, freq = 1 + nextInt(hz, FREQ_COUNT);
    const tick = s.tick; enemySystem(s);
    expect(s.enemy.nextShotTick).toBe(tick + Math.round(fireInterval(minutesOf(s), 2) * T * jitter(u)));
    expect(s.rng.director.s).toBe(dr.s); expect(s.rng.hazards.s).toBe(hz.s);
    expect(shotsInFlight(s)).toBe(1);
    const k = Array.from(s.debris.active).indexOf(1);
    expect([s.debris.kind[k], s.debris.room[k], s.debris.impactTick[k], s.debris.frequency[k], s.debris.warned[k]]).toEqual([ObjectKind.Shot, rm, tick + Math.round(flight * T), freq, 0]);
  });
  it('with the shot cap reached, or the table full of debris, a due shot re-arms (one director draw) and draws nothing from hazards', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); const A = room(s, 'A');
    for (let n = 0; n < ENEMY_SHOTS_MAX; n++) placeShot(s, A, 600);
    s.tick = s.enemy.nextShotTick; const d1 = createRng(s.rng.director.s); const u1 = nextFloat(d1); const h1 = s.rng.hazards.s;
    enemySystem(s);
    expect(s.rng.director.s).toBe(d1.s); expect(s.rng.hazards.s).toBe(h1); expect(shotsInFlight(s)).toBe(ENEMY_SHOTS_MAX);
    expect(s.enemy.nextShotTick).toBe(s.tick + Math.round(fireInterval(minutesOf(s), 2) * T * jitter(u1)));
    const f = makeState(2); quiet(f); placeEnemy(f);
    for (let n = 0; n < DEBRIS_SLOTS; n++) placeDebris(f, A, 600);   // full of debris: the cap is not the reason
    f.tick = f.enemy.nextShotTick; const d2 = createRng(f.rng.director.s); const u2 = nextFloat(d2); const h2 = f.rng.hazards.s;
    enemySystem(f);
    expect(f.rng.director.s).toBe(d2.s); expect(f.rng.hazards.s).toBe(h2); expect(shotsInFlight(f)).toBe(0);
    expect(f.enemy.nextShotTick).toBe(f.tick + Math.round(fireInterval(minutesOf(f), 2) * T * jitter(u2)));
  });
  it('withdraws exactly at departTick with one director draw, leaving shots in flight and arming the cooldown; a tick with both clocks due fires nothing', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); const A = room(s, 'A'); placeShot(s, A, 600);
    s.tick = s.enemy.departTick - 1; s.enemy.nextShotTick = 1e9; enemySystem(s);
    expect(s.enemy.present).toBe(1);
    s.tick = s.enemy.departTick; s.rng.director.s = 7; const dr = createRng(7), u = nextFloat(dr); const h = s.rng.hazards.s;
    enemySystem(s);
    const e = s.enemy;
    expect([e.present, e.hull, e.stableId, e.nextShotTick, e.departTick]).toEqual([0, 0, 0, -1, -1]);
    expect(e.nextArrivalTick).toBe(s.tick + Math.round(ENCOUNTER_COOLDOWN * T * jitter(u)));
    expect(s.rng.director.s).toBe(dr.s); expect(s.rng.hazards.s).toBe(h); expect(s.telemetry.enemiesDestroyed).toBe(0);
    expect(s.debris.active[0]).toBe(1); expect(s.debris.kind[0]).toBe(ObjectKind.Shot);
    const both = makeState(2); quiet(both); placeEnemy(both);
    both.tick = both.enemy.departTick; both.enemy.nextShotTick = both.tick;
    const d3 = createRng(both.rng.director.s); nextFloat(d3); const h3 = both.rng.hazards.s;
    enemySystem(both);
    expect(both.enemy.present).toBe(0); expect(shotsInFlight(both)).toBe(0); expect(both.rng.director.s).toBe(d3.s); expect(both.rng.hazards.s).toBe(h3);
  });
  it('a second encounter arrives after the cooldown with a new StableId and encounters 2', () => {
    const s = makeState(2); quiet(s);
    s.tick = s.enemy.nextArrivalTick; enemySystem(s); const first = s.enemy.stableId;
    expect(s.telemetry.encounters).toBe(1);
    s.tick = s.enemy.departTick; enemySystem(s);
    s.tick = s.enemy.nextArrivalTick; enemySystem(s);
    expect(s.enemy.present).toBe(1); expect(s.enemy.stableId).toBeGreaterThan(first); expect(s.telemetry.encounters).toBe(2);
  });
  it('through step(): arrival at ENCOUNTER_FIRST, a shot warned on its spawn tick when Science is seated', () => {
    const s = makeState(2); quiet(s);
    run(s, ENCOUNTER_FIRST * T + 1);
    expect(s.enemy.present).toBe(1); expect(s.telemetry.encounters).toBe(1);
    sitDown(s, 1, sci(s));
    run(s, s.enemy.nextShotTick - s.tick + 1);
    expect(shotsInFlight(s)).toBe(1);
    const k = Array.from(s.debris.active).indexOf(1);
    expect(s.debris.warned[k]).toBe(1);                              // seated lead (18 s+) exceeds the shot's flight: warned the tick it spawned
  });
  it('through step(): the director spawns before the enemy fires on a tick where both are due (StableId order and independent RNG outcomes)', () => {
    const s = makeState(2); armSpawn(s); placeEnemy(s); s.enemy.nextShotTick = s.tick;
    s.rng.director.s = 7; s.rng.hazards.s = 7;
    // The director attempt: jitter draw, type roll, then a target draw from hazards; the type is whatever seed 7 picks. Force a debris spawn so both
    // systems allocate a StableId this tick: give every other type no target (all rooms burning, all sites breached, all stations failed is heavy),
    // so instead assert the order generically: the enemy's shot has the LARGER StableId of the two objects/hazards allocated this tick when a debris
    // object was spawned, and the director stream advanced by exactly 2 + 1 draws (jitter, type, enemy re-arm) in total.
    const idBefore = s.nextStableId; const dr = createRng(7); nextFloat(dr); nextFloat(dr); nextFloat(dr);
    run(s, 1, () => [NEUTRAL_INTENT, NEUTRAL_INTENT]);
    expect(s.rng.director.s).toBe(dr.s);                             // director: jitter + type; enemy: one re-arm draw; nothing else draws from the director stream
    const shot = Array.from(s.debris.active).map((a, k) => (a && s.debris.kind[k] === ObjectKind.Shot ? k : -1)).find((k) => k >= 0)!;
    expect(shot).toBeGreaterThanOrEqual(0);
    expect(s.debris.stableId[shot]).toBe(s.nextStableId - 1);        // the shot took the last StableId of the tick: it was allocated after the director's spawn (if any)
    expect(s.nextStableId - idBefore).toBeGreaterThanOrEqual(1);
  });
});

describe('enemy: targets', () => {
  it('warnedTargets includes the enemy only while present, sorted by StableId among warned objects; isTarget; cycling with wrap', () => {
    const s = makeState(1), A = room(s, 'A');
    const a = placeDebris(s, A, 600, 1);                              // id n
    expect(warnedTargets(s)).toEqual([a]);
    placeEnemy(s);                                                    // id n+1
    const b = placeDebris(s, A, 600, 1);                              // id n+2
    const u = placeDebris(s, A, 600, 0);                              // unwarned
    expect(warnedTargets(s)).toEqual([a, ENEMY_SLOT, b]);
    expect(targetStableId(s, ENEMY_SLOT)).toBe(s.enemy.stableId);
    expect([isTarget(s, ENEMY_SLOT), isTarget(s, a), isTarget(s, u), isTarget(s, 7)]).toEqual([true, true, false, false]);
    const w = wpn(s); sitDown(s, 0, w); expect(s.stations.cursor[w]).toBe(a);
    cycleTarget(s, w, Dir.Down); expect(s.stations.cursor[w]).toBe(ENEMY_SLOT);
    cycleTarget(s, w, Dir.Down); expect(s.stations.cursor[w]).toBe(b);
    cycleTarget(s, w, Dir.Down); expect(s.stations.cursor[w]).toBe(a);
    cycleTarget(s, w, Dir.Up); expect(s.stations.cursor[w]).toBe(b);
    s.enemy.present = 0; expect(warnedTargets(s)).toEqual([a, b]); expect(isTarget(s, ENEMY_SLOT)).toBe(false);
  });
  it('nextTarget compares targetStableId: after the object before the enemy it returns the enemy, after the enemy the next object, and wraps', () => {
    const s = makeState(1), A = room(s, 'A');
    const a = placeDebris(s, A, 600, 1, 5); placeEnemy(s); s.enemy.stableId = 6; s.nextStableId = 7; const b = placeDebris(s, A, 600, 1, 7);
    expect(nextTarget(s, 5)).toBe(ENEMY_SLOT); expect(nextTarget(s, 6)).toBe(b); expect(nextTarget(s, 7)).toBe(a);
  });
  it('leave retargets cursors on the enemy to the next StableId or -1; removeDebris can land a cursor on the enemy', () => {
    const s = makeState(2), A = room(s, 'A'), w = wpn(s), c = sci(s);
    const a = placeDebris(s, A, 600, 1); placeEnemy(s); const b = placeDebris(s, A, 600, 1);
    sitDown(s, 0, w); sitDown(s, 1, c); s.stations.cursor[w] = ENEMY_SLOT; s.stations.cursor[c] = ENEMY_SLOT;
    leave(s, false);
    expect(s.stations.cursor[w]).toBe(b); expect(s.stations.cursor[c]).toBe(b);
    const t = makeState(1), w2 = wpn(t); const a2 = placeDebris(t, A, 600, 1); placeEnemy(t);
    sitDown(t, 0, w2); expect(t.stations.cursor[w2]).toBe(a2);
    t.debris.impactTick[a2] = t.tick; t.director.nextSpawnTick = 1e9; debrisSystem(t);   // impact removes a2
    expect(t.stations.cursor[w2]).toBe(ENEMY_SLOT);
    const alone = makeState(1), w3 = wpn(alone); placeEnemy(alone); sitDown(alone, 0, w3); expect(alone.stations.cursor[w3]).toBe(ENEMY_SLOT);
    leave(alone, false); expect(alone.stations.cursor[w3]).toBe(-1);
    void a; void arrive; void enemyBeamHits;
  });
  it('placeDebris into a slot freed by a shot writes kind 0 (a later debris impact deals 8, not 6)', () => {
    const s = makeState(1), A = room(s, 'A'); quiet(s);
    const k = placeShot(s, A, 600); s.debris.impactTick[k] = s.tick; debrisSystem(s);
    expect(s.hull).toBe(94); expect(s.debris.active[k]).toBe(0);
    const k2 = placeDebris(s, A, 600); expect(k2).toBe(k); expect(s.debris.kind[k2]).toBe(ObjectKind.Debris);
    s.debris.impactTick[k2] = s.tick; debrisSystem(s);
    expect(s.hull).toBe(94 - 8);
    const p = makeState(1); quiet(p);                                 // production path: spawnDebris into a slot freed by a shot
    const ks = placeShot(p, A, 600); p.debris.impactTick[ks] = p.tick; debrisSystem(p); expect(p.hull).toBe(94);
    const kd = spawnDebris(p); expect(kd).toBe(ks); expect(p.debris.kind[kd]).toBe(ObjectKind.Debris);
    p.debris.impactTick[kd] = p.tick; debrisSystem(p); expect(p.hull).toBe(94 - 8);
  });
});
```

(The shooting, impact and guard tests come in Task 2; `arrive` and `enemyBeamHits` are imported here so the module surface is pinned.)

Append to `tests/snapshot.test.ts` (imports: `placeEnemy, placeShot` from helpers; `ObjectKind` from debris; `ENCOUNTER_FIRST` from tuning):

```ts
  it('round-trips the enemy block, debris kinds and the encounter counters; each alone changes the hash; a fresh state has the initial values', () => {
    const f = makeState(2).enemy;
    expect([f.present, f.hull, f.stableId, f.nextArrivalTick, f.nextShotTick, f.departTick]).toEqual([0, 0, 0, ENCOUNTER_FIRST * TICK_HZ, -1, -1]);
    const s = makeState(2, 5); s.enemy.present = 1; s.enemy.hull = 37; s.enemy.stableId = 41; s.enemy.nextArrivalTick = 9000; s.enemy.nextShotTick = 1234; s.enemy.departTick = 5678;
    s.debris.kind[2] = 1; s.debris.kind[5] = 1; s.telemetry.encounters = 3; s.telemetry.enemiesDestroyed = 2;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect([t.enemy.present, t.enemy.hull, t.enemy.stableId, t.enemy.nextArrivalTick, t.enemy.nextShotTick, t.enemy.departTick]).toEqual([1, 37, 41, 9000, 1234, 5678]);
    expect(Array.from(t.debris.kind)).toEqual(Array.from(s.debris.kind)); expect([t.telemetry.encounters, t.telemetry.enemiesDestroyed]).toEqual([3, 2]);
    const base = hashState(makeState(2, 5));
    const mutate = (fn: (u: ReturnType<typeof makeState>) => void) => { const u = makeState(2, 5); fn(u); return hashState(u); };
    expect(mutate((u) => { u.enemy.present = 1; })).not.toBe(base); expect(mutate((u) => { u.enemy.hull = 1; })).not.toBe(base); expect(mutate((u) => { u.enemy.stableId = 1; })).not.toBe(base);
    expect(mutate((u) => { u.enemy.nextArrivalTick = 1; })).not.toBe(base); expect(mutate((u) => { u.enemy.nextShotTick = 1; })).not.toBe(base); expect(mutate((u) => { u.enemy.departTick = 1; })).not.toBe(base);
    for (let k = 0; k < DEBRIS_SLOTS; k++) expect(mutate((u) => { u.debris.kind[k] = 1; })).not.toBe(base);
    expect(mutate((u) => { u.telemetry.encounters = 1; })).not.toBe(base); expect(mutate((u) => { u.telemetry.enemiesDestroyed = 1; })).not.toBe(base);
  });
  it('a run saved mid-encounter with a shot due in 10 ticks and the withdrawal in 20 continues like the uninterrupted run through both', () => {
    const whole = makeState(2, 31); whole.director.nextSpawnTick = 1e9;
    const part = makeState(2, 31); part.director.nextSpawnTick = 1e9;
    for (const s of [whole, part]) { run(s, 100); placeEnemy(s); s.enemy.departTick = s.tick + 20; s.enemy.nextShotTick = 1e9; placeShot(s, room(s, 'A'), 10); }
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(part))));
    run(whole, 30); run(resumed, 30);
    expect(resumed.telemetry.impacts).toBe(1); expect(resumed.rooms.impactTick[room(resumed, 'A')]).toBe(110);
    expect(resumed.enemy.present).toBe(0); expect(resumed.enemy.nextArrivalTick).toBeGreaterThan(resumed.tick);
    expect([resumed.enemy.present, resumed.enemy.hull, resumed.enemy.stableId, resumed.enemy.nextArrivalTick, resumed.enemy.nextShotTick, resumed.enemy.departTick]).toEqual([whole.enemy.present, whole.enemy.hull, whole.enemy.stableId, whole.enemy.nextArrivalTick, whole.enemy.nextShotTick, whole.enemy.departTick]);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
```

Change the existing version test from 8 to 9 (`'rejects a version-9 snapshot, by header and by the flattened SIM_VERSION'`, `simVersion: 9`, `values[0] = 9`). Add `DEBRIS_SLOTS` to the tuning import if missing.

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/enemy.test.ts tests/snapshot.test.ts` → the enemy file fails to import (`enemy.ts` missing); the snapshot additions fail on `s.enemy` undefined.

- [ ] **Step 3: Tuning, state, flatten**

`tuning.ts`: `SIM_VERSION = 10`; `STRESS_WEIGHTS = { fire: 0.25, breach: 0.30, power: 0.20, debris: 0.20, downed: 0.40, enemy: 0.30 } as const;`; append:

```ts
// Enemy ship (Combat-i)
export const ENCOUNTER_FIRST = 180, ENCOUNTER_MAX = 120, ENCOUNTER_COOLDOWN = 150;   // seconds: first arrival, stay, gap (x jitter)
export const ENEMY_HULL = 100, ENEMY_FIRST_SHOT = 5;
export const ENEMY_FIRE_INTERVAL = 15, ENEMY_FIRE_MIN = 6, ENEMY_FIRE_JITTER = 0.2;   // escalation shares ESCALATION_RATE and SOLO_INTERVAL_MULT
export const ENEMY_SHOTS_MAX = 2;                      // shots in flight at once
export const ENEMY_SHOT_FLIGHT = 10, ENEMY_SHOT_JITTER = 2;   // seconds (debris is 30 +/- 6)
export const ENEMY_SHOT_HULL_DAMAGE = 6;               // debris is 8; crew damage shared
export const ENEMY_BEAM_BASE = 0.55, ENEMY_BEAM_SCALE = 0.30;   // beam hit chance against the ship (0.70 at output 0.5)
export const ENEMY_BEAM_DAMAGE = 15, ENEMY_TORP_DAMAGE = 35;
```

`state.ts`: interface adds `kind: Uint8Array` to `debris` (after `scan`), `encounters: number; enemiesDestroyed: number` to `telemetry` (after `phaseEntries`), and after `weapons`:

```ts
  /** The enemy ship (spec Combat-i section 4): one at a time; ticks are -1 while absent. */
  enemy: { present: number; hull: number; stableId: number; nextArrivalTick: number; nextShotTick: number; departTick: number };
```

Init: `kind: new Uint8Array(DEBRIS_SLOTS)` in `debris`; `encounters: 0, enemiesDestroyed: 0` in `telemetry`; after the `weapons` line `enemy: { present: 0, hull: 0, stableId: 0, nextArrivalTick: ENCOUNTER_FIRST * TICK_HZ, nextShotTick: -1, departTick: -1 },` (import `ENCOUNTER_FIRST`).

`flatten.ts`: manifest `[..., 'debris', 'weapons', 'enemy', 'science', ...]`; `DEBRIS_FIELDS = 9`, `TELEMETRY_SCALARS = 12`, `const ENEMY_FIELDS = 6;` and `+ ENEMY_FIELDS` in `size`. In `flatten`: after `put(tm.maxStress)` add `put(tm.encounters); put(tm.enemiesDestroyed);`; after `for (const v of dbf.scan) put(v);` add `for (const v of dbf.kind) put(v);`; after the weapons puts and before `put(s.science.scanning)` add `const en = s.enemy; put(en.present); put(en.hull); put(en.stableId); put(en.nextArrivalTick); put(en.nextShotTick); put(en.departTick);`. In `unflatten`: the telemetry key list gains `'encounters', 'enemiesDestroyed'` after `'maxStress'`; after the `db.scan` loop add `for (let k = 0; k < DEBRIS_SLOTS; k++) db.kind[k] = get();`; after `s.weapons.torpedoRegen = get();` add `for (const k of ['present', 'hull', 'stableId', 'nextArrivalTick', 'nextShotTick', 'departTick'] as const) s.enemy[k] = get();`.

- [ ] **Step 4: debris.ts and debrisTargets.ts**

`debris.ts`: import `ENEMY_SHOT_FLIGHT, ENEMY_SHOT_JITTER, ENEMY_SHOT_HULL_DAMAGE` from tuning; replace `spawnDebris` with:

```ts
/** Object kinds in the debris table (spec Combat-i section 4). */
export const ObjectKind = { Debris: 0, Shot: 1 } as const;

/** Spawn one hidden object: uniform target room, jittered flight and a frequency, three rng.hazards draws in that order (spec 2a-ii section 4). Returns the slot, or -1 if the table is full. */
function spawnObject(state: SimState, kind: number, flightBase: number, flightJitter: number): number {
  const db = state.debris;
  let slot = -1;
  for (let k = 0; k < db.active.length; k++) if (!db.active[k]) { slot = k; break; }
  if (slot < 0) return -1;
  const room = nextInt(state.rng.hazards, state.derived.volume.length);
  const flight = flightBase + (2 * nextFloat(state.rng.hazards) - 1) * flightJitter;
  const frequency = 1 + nextInt(state.rng.hazards, FREQ_COUNT);
  db.frequency[slot] = frequency; db.scanned[slot] = 0; db.scan[slot] = 0; db.kind[slot] = kind;
  db.active[slot] = 1; db.stableId[slot] = state.nextStableId++; db.room[slot] = room;
  db.impactTick[slot] = state.tick + Math.round(flight * TICK_HZ); db.warned[slot] = 0;
  return slot;
}
export function spawnDebris(state: SimState): number { return spawnObject(state, ObjectKind.Debris, DEBRIS_FLIGHT, DEBRIS_FLIGHT_JITTER); }
/** An enemy shot: a short-flight object the enemy fires at us (spec Combat-i section 5). */
export function spawnShot(state: SimState): number { return spawnObject(state, ObjectKind.Shot, ENEMY_SHOT_FLIGHT, ENEMY_SHOT_JITTER); }
export function shotsInFlight(state: SimState): number {
  let n = 0; const db = state.debris; for (let k = 0; k < db.active.length; k++) if (db.active[k] && db.kind[k] === ObjectKind.Shot) n++; return n;
}
```

In `resolveImpact` the hull line becomes `state.hull = Math.max(0, state.hull - (db.kind[slot] === ObjectKind.Shot ? ENEMY_SHOT_HULL_DAMAGE : DEBRIS_HULL_DAMAGE));`. `removeDebris` is unchanged (kind is rewritten on spawn).

`debrisTargets.ts`: import `DEBRIS_SLOTS` from tuning; add before `warnedTargets`:

```ts
/** The enemy ship's pseudo-slot in the target list (spec Combat-i section 6). Never an index into the debris arrays. */
export const ENEMY_SLOT = DEBRIS_SLOTS;
export function targetStableId(state: SimState, slot: number): number { return slot === ENEMY_SLOT ? state.enemy.stableId : state.debris.stableId[slot]!; }
/** A slot the consoles may act on: a warned active object, or the present enemy. */
export function isTarget(state: SimState, slot: number): boolean {
  if (slot === ENEMY_SLOT) return state.enemy.present === 1;
  return state.debris.active[slot] === 1 && state.debris.warned[slot] === 1;
}
```

`warnedTargets`: after the loop `if (state.enemy.present) out.push(ENEMY_SLOT);` and sort by `targetStableId(state, a) - targetStableId(state, b)`. `nextTarget`: `for (const k of list) if (targetStableId(state, k) > afterStableId) return k;`.

- [ ] **Step 5: enemy.ts, step.ts, director.ts**

Create `src/renderer/src/sim/enemy.ts`:

```ts
import type { SimState } from './state';
import { nextFloat } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { spawnShot, shotsInFlight } from './debris';
import { nextTarget, ENEMY_SLOT } from './debrisTargets';
import { minutesOf } from './director';
import { TICK_HZ, ENCOUNTER_MAX, ENCOUNTER_COOLDOWN, ENEMY_HULL, ENEMY_FIRST_SHOT, ENEMY_FIRE_INTERVAL, ENEMY_FIRE_MIN, ENEMY_FIRE_JITTER, ENEMY_SHOTS_MAX, ENEMY_BEAM_BASE, ENEMY_BEAM_SCALE, ESCALATION_RATE, SOLO_INTERVAL_MULT } from './tuning';

const TARGETING_KINDS = [StationKind.Weapons, StationKind.Science] as const;

/** Seconds between enemy shots: the foundation's escalation shape with the solo multiplier (spec Combat-i section 5). */
export function fireInterval(minutes: number, players: number): number {
  return Math.max(ENEMY_FIRE_MIN, ENEMY_FIRE_INTERVAL / (1 + ESCALATION_RATE * minutes)) * (players === 1 ? SOLO_INTERVAL_MULT : 1);
}

/** Pure beam threshold against the ship: frequency plays no part until Combat-ii. */
export function enemyBeamHits(u: number, output: number): boolean { return u < ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE * output; }

/** One rng.director draw: seconds x TICK_HZ x (1 +/- ENEMY_FIRE_JITTER), rounded. */
function jitteredTicks(state: SimState, seconds: number): number {
  const u = nextFloat(state.rng.director);
  return Math.round(seconds * TICK_HZ * (1 + ENEMY_FIRE_JITTER * (2 * u - 1)));
}

/** Arrival: no draw; the enemy takes a StableId and the first-warning auto-select applies to it. */
export function arrive(state: SimState): void {
  const e = state.enemy;
  e.present = 1; e.hull = ENEMY_HULL; e.stableId = state.nextStableId++;
  e.departTick = state.tick + ENCOUNTER_MAX * TICK_HZ; e.nextShotTick = state.tick + ENEMY_FIRST_SHOT * TICK_HZ;
  state.telemetry.encounters++;
  for (const kind of TARGETING_KINDS) {
    const i = state.derived.stationOfKind[kind]!;
    if (i >= 0 && state.stations.occupant[i]! >= 0 && state.stations.cursor[i]! < 0) state.stations.cursor[i] = ENEMY_SLOT;
  }
}

/** Departure (destroyed or withdrawn): retarget cursors by StableId before clearing it, then one director draw arms the cooldown. */
export function leave(state: SimState, destroyed: boolean): void {
  const e = state.enemy;
  for (const kind of TARGETING_KINDS) {
    const i = state.derived.stationOfKind[kind]!;
    if (i >= 0 && state.stations.cursor[i] === ENEMY_SLOT) state.stations.cursor[i] = nextTarget(state, e.stableId, ENEMY_SLOT);
  }
  e.present = 0; e.hull = 0; e.stableId = 0; e.nextShotTick = -1; e.departTick = -1;
  if (destroyed) state.telemetry.enemiesDestroyed++;
  e.nextArrivalTick = state.tick + jitteredTicks(state, ENCOUNTER_COOLDOWN);
}

export function damageEnemy(state: SimState, amount: number): void {
  const e = state.enemy;
  e.hull = Math.max(0, e.hull - amount);
  if (e.hull === 0) leave(state, true);
}

/** Per tick, after the director and before the debris step: arrival, else withdrawal, else a due shot (re-arm first, then the cap). */
export function enemySystem(state: SimState): void {
  const e = state.enemy;
  if (!e.present) { if (state.tick >= e.nextArrivalTick) arrive(state); return; }
  if (state.tick >= e.departTick) { leave(state, false); return; }
  if (state.tick < e.nextShotTick) return;
  e.nextShotTick = state.tick + jitteredTicks(state, fireInterval(minutesOf(state), state.playerCount));
  if (shotsInFlight(state) < ENEMY_SHOTS_MAX) spawnShot(state);   // -1 when the table is full: the shot is skipped
}
```

Note `nextTarget(state, e.stableId, ENEMY_SLOT)` runs while `present` is still 1, and `warnedTargets` filters `excludeSlot`, so the enemy itself is excluded.

`step.ts`: import `enemySystem` from `./enemy`; between `directorSystem(state);` and `debrisSystem(state);` insert `enemySystem(state);   // (5b) the enemy: arrival, withdrawal, a due shot (spec Combat-i section 5)`.

`director.ts` `rawStress`: `+ w.enemy * state.enemy.present` inside the sum.

- [ ] **Step 6: Run, re-bless, full suite**

`npx vitest run tests/enemy.test.ts tests/snapshot.test.ts tests/debris.test.ts tests/director.test.ts tests/boundary.test.ts` → PASS (the enemy module chain `enemy → director → debris` is one-way; if vitest reports an import cycle involving `enemy.ts`, report it rather than restructuring).

**Survival gate before the re-bless** (`ENCOUNTER_FIRST` initialises the hashed `nextArrivalTick`, so tuning must be final before the single golden re-bless): `npx vitest run tests/gate-survival.test.ts`. If a seed fails because of the encounter at 3:00, apply the spec's fallbacks **in order, one at a time**, re-running the gate after each: (1) `ENEMY_SHOT_HULL_DAMAGE` 6 → 4; (2) `ENCOUNTER_FIRST` 180 → 210; (3) `ENEMY_SHOTS_MAX` 2 → 1; (4) `ENEMY_FIRE_INTERVAL` 15 → 20. Record every change and the gate's output in the report (Task 4 copies them into `docs/gates.md` and the spec's §13). The planned tests read these constants by name, so no test expectation changes.

Then `npm run bless` (cause: SIM_VERSION 10, the enemy block, `kind` and the two counters are hashed; no enemy appears in the two-minute replay), `npm test`, `npm run typecheck`, `npm run build` → pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/enemy.ts src/renderer/src/sim/debris.ts src/renderer/src/sim/debrisTargets.ts src/renderer/src/sim/state.ts src/renderer/src/sim/flatten.ts src/renderer/src/sim/tuning.ts src/renderer/src/sim/step.ts src/renderer/src/sim/director.ts tests/enemy.test.ts tests/snapshot.test.ts tests/helpers/sim.ts tests/golden/basic.json
git commit -m "feat: the enemy ship arrives, fires kind-tagged shots through the debris table and withdraws; the enemy is a pseudo-slot in the shared target list; SIM_VERSION 10 (golden re-blessed: enemy block, kind bytes and encounter counters are hashed)"
```

---

### Task 2: Shooting the enemy, pseudo-slot guards, gates

**Files:**
- Modify: `src/renderer/src/sim/weapons.ts`, `science.ts`, `productive.ts`, `tests/enemy.test.ts`, `tests/productive.test.ts`, `tests/gate-survival.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces: `fireWeapon` against `ENEMY_SLOT`; the guards.

- [ ] **Step 1: Write the failing tests**

Append to `tests/enemy.test.ts` (imports to add: `fireWeapon, Weapon` from weapons; `scienceInput, scanStep` from science; `isProductive` from productive; `failStation` from power; `igniteRoom` from `../src/renderer/src/sim/hazards/fire`; `rawStress, anyUnattended, activeHazardCount` from director; `Health, Life, LifeState` from components; `teleport, seconds, run` from helpers; `ENEMY_BEAM_DAMAGE, ENEMY_TORP_DAMAGE, ENEMY_SHOT_HULL_DAMAGE, DEBRIS_CREW_DAMAGE, STRESS_WEIGHTS` from tuning):

```ts
/** Replace every debris array with a Proxy that throws on a read at ENEMY_SLOT, so a test proves the pseudo-slot never indexes the table. */
function guardDebris(s: ReturnType<typeof makeState>): void {
  const trap = <A extends object>(arr: A): A => new Proxy(arr, { get(t, p) { if (p === String(ENEMY_SLOT)) throw new Error(`debris array read at ENEMY_SLOT`); const v = Reflect.get(t, p); return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v; } });
  const db = s.debris as unknown as Record<string, object>;
  for (const key of Object.keys(db)) db[key] = trap(db[key]!);
}

describe('enemy: shooting the ship (combat 7 -> 0.012 hits, combat 4 -> 0.924 misses at output 0.5)', () => {
  const armed = (hull = ENEMY_HULL) => { const s = makeState(1); quiet(s); placeEnemy(s, hull); const w = wpn(s); sitDown(s, 0, w); s.stations.cursor[w] = ENEMY_SLOT; s.weapons.charge = 1; return { s, w }; };
  it('enemyBeamHits thresholds', () => {
    expect(enemyBeamHits(0.69, 0.5)).toBe(true); expect(enemyBeamHits(0.71, 0.5)).toBe(false); expect(enemyBeamHits(0.84, 1)).toBe(true); expect(enemyBeamHits(0.86, 1)).toBe(false);
  });
  it('a beam hit takes 15 hull, counts the shot and hit, resets the charge, stamps the shot and draws once; a miss takes nothing', () => {
    const { s } = armed(); s.rng.combat.s = 7; const one = createRng(7); nextFloat(one);
    expect(fireWeapon(s)).toBe(true);
    expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_BEAM_DAMAGE); expect([s.telemetry.shots, s.telemetry.hits]).toEqual([1, 1]); expect(s.weapons.charge).toBe(0); expect(s.skills.lastShotTick).toBe(s.tick); expect(s.rng.combat.s).toBe(one.s);
    const m = armed(); m.s.rng.combat.s = 4;
    expect(fireWeapon(m.s)).toBe(false); expect(m.s.enemy.hull).toBe(ENEMY_HULL); expect([m.s.telemetry.shots, m.s.telemetry.hits]).toEqual([1, 0]); expect(m.s.weapons.charge).toBe(0);
    const f3 = armed(); f3.s.weapons.selector = Weapon.BeamF3; f3.s.rng.combat.s = 7;
    expect(fireWeapon(f3.s)).toBe(true); expect(f3.s.enemy.hull).toBe(ENEMY_HULL - ENEMY_BEAM_DAMAGE);   // frequency ignored
  });
  it('a torpedo hit takes 35 and unloads the tube; a miss takes nothing', () => {
    const { s } = armed(); s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoaded = 1; s.rng.combat.s = 7;
    expect(fireWeapon(s)).toBe(true); expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_TORP_DAMAGE); expect(s.weapons.torpedoLoaded).toBe(0);
    const m = armed(); m.s.weapons.selector = Weapon.Torpedo; m.s.weapons.torpedoLoaded = 1; m.s.rng.combat.s = 4;
    expect(fireWeapon(m.s)).toBe(false); expect(m.s.enemy.hull).toBe(ENEMY_HULL);
  });
  it('the kill: hull 15 and a beam hit destroys the enemy, retargets, draws the cooldown once, and leaves a shot in flight', () => {
    const { s, w } = armed(15); const A = room(s, 'A'); const k = placeShot(s, A, 600, 1); const b = placeDebris(s, A, 600, 1);
    s.stations.cursor[w] = ENEMY_SLOT; s.rng.combat.s = 7; s.rng.director.s = 7; const dr = createRng(7), u = nextFloat(dr);
    expect(fireWeapon(s)).toBe(true);
    expect([s.enemy.present, s.enemy.hull, s.telemetry.enemiesDestroyed, s.telemetry.shots, s.telemetry.hits]).toEqual([0, 0, 1, 1, 1]);
    expect(s.stations.cursor[w]).toBe(k === 0 ? (s.debris.stableId[k]! > s.debris.stableId[b]! ? b : k) : k);   // the next StableId after the enemy's: the shot (placed after placeEnemy) sorts first
    expect(s.rng.director.s).toBe(dr.s); expect(s.enemy.nextArrivalTick).toBe(s.tick + Math.round(ENCOUNTER_COOLDOWN * T * jitter(u)));
    expect(s.debris.active[k]).toBe(1); expect(s.debris.kind[k]).toBe(ObjectKind.Shot);
  });
  it('readiness rejections against the enemy: absent, offline, unoccupied, uncharged, unloaded (no draw, no shot)', () => {
    const check = (s: ReturnType<typeof makeState>) => { const c0 = s.rng.combat.s; expect(fireWeapon(s)).toBe(false); expect(s.rng.combat.s).toBe(c0); expect(s.telemetry.shots).toBe(0); expect(s.enemy.hull).toBe(s.enemy.present ? ENEMY_HULL : 0); };
    const absent = armed(); absent.s.enemy.present = 0; absent.s.enemy.hull = 0; check(absent.s);
    const off = armed(); failStation(off.s, off.w); check(off.s);                                   // failStation also stands the operator
    const failedSeated = armed(); failedSeated.s.stations.failed[failedSeated.w] = 1; check(failedSeated.s);      // failed byte alone, operator still seated: the online guard
    const unpowered = armed(); unpowered.s.stations.level[unpowered.w] = 0; check(unpowered.s);                   // allocation 0, operator still seated
    const empty = armed(); empty.s.stations.occupant[empty.w] = -1; check(empty.s);
    const low = armed(); low.s.weapons.charge = 0.5; check(low.s);
    const noTorp = armed(); noTorp.s.weapons.selector = Weapon.Torpedo; noTorp.s.weapons.torpedoLoaded = 0; check(noTorp.s);
  });
  it('a kill on a due-shot tick fires nothing: destroyed in the Weapons step, enemySystem finds it absent', () => {
    const s = makeState(2); quiet(s); placeEnemy(s, 15); const w = wpn(s); sitDown(s, 0, w); s.stations.cursor[w] = ENEMY_SLOT; s.weapons.charge = 1;
    s.enemy.nextShotTick = s.tick; s.rng.combat.s = 7; const d1 = createRng(s.rng.director.s); nextFloat(d1); const h = s.rng.hazards.s;
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect(s.enemy.present).toBe(0); expect(s.telemetry.enemiesDestroyed).toBe(1); expect(shotsInFlight(s)).toBe(0); expect(s.rng.director.s).toBe(d1.s); expect(s.rng.hazards.s).toBe(h);
  });
});

describe('enemy: shot impacts and guards', () => {
  it('an unevaded shot takes 6 hull, 20 crew health, leaves one hazard, stamps impactTick and counts; an evaded shot counts a roll and an evasion only', () => {
    const s = makeState(1), A = room(s, 'A'); quiet(s); teleport(s, 0, 2.5, 2.5); s.rng.hazards.s = 7;   // 0.012 < 0.5: breach first
    placeShot(s, A, 0); debrisSystem(s);
    expect(s.hull).toBe(100 - ENEMY_SHOT_HULL_DAMAGE); expect(Health.cur[s.crew[0]!]).toBe(100 - DEBRIS_CREW_DAMAGE);
    const breaches = Array.from(s.breaches.active).filter((b, i) => b && s.derived.siteRoom[i] === A).length, fire = s.rooms.fire[A]! > 0 ? 1 : 0;
    expect(breaches + fire).toBe(1); expect(s.rooms.impactTick[A]).toBe(s.tick); expect(s.telemetry.impacts).toBe(1); expect(s.debris.active[0]).toBe(0);
    const e = makeState(1); quiet(e); sitDown(e, 0, e.derived.stationOfKind[StationKind.Navigation]!); e.rng.combat.s = 7; placeShot(e, A, 0); debrisSystem(e);
    expect([e.telemetry.evadeRolls, e.telemetry.evasions, e.telemetry.impacts, e.hull]).toEqual([1, 1, 0, 100]);
  });
  it('a shot can be scanned and shot down exactly like debris', () => {
    const s = makeState(1), B = room(s, 'B'); quiet(s); const c = sci(s); sitDown(s, 0, c); const k = placeShot(s, B, 6000, 1, undefined, 2);
    s.stations.cursor[c] = k; scienceInput(s, c, -1, true); expect(s.science.scanning).toBe(1);
    run(s, seconds(20)); expect(s.debris.scanned[k]).toBe(1); expect(s.debris.frequency[k]).toBe(2);
    run(s, 1, () => intents({ cancelPressed: true }));
    const w = wpn(s); sitDown(s, 0, w); s.stations.cursor[w] = k; s.weapons.selector = Weapon.BeamF2; s.weapons.charge = 1; s.rng.combat.s = 7;
    expect(fireWeapon(s)).toBe(true); expect(s.debris.active[k]).toBe(0); expect([s.telemetry.shots, s.telemetry.hits]).toEqual([1, 1]);
  });
  it('Science guards: Confirm on the enemy starts no scan; scanStep with the cursor on the enemy touches nothing; neither reads a debris array at ENEMY_SLOT', () => {
    const s = makeState(1), A = room(s, 'A'); placeEnemy(s); const c = sci(s); sitDown(s, 0, c); const k = placeDebris(s, A, 600, 1); s.debris.scan[k] = 0.4;
    s.stations.cursor[c] = ENEMY_SLOT; guardDebris(s);
    scienceInput(s, c, -1, true); expect(s.science.scanning).toBe(0);
    s.science.scanning = 1; scanStep(s); expect(s.science.scanning).toBe(1); expect(s.debris.scan[k]).toBe(0.4);
  });
  it('productive: the enemy alone makes neither Science nor Navigation productive; one shot in flight does', () => {
    const s = makeState(2); quiet(s); placeEnemy(s); s.enemy.nextShotTick = 1e9;   // no enemy fire either: the enemy alone
    const c = sci(s), n = s.derived.stationOfKind[StationKind.Navigation]!; sitDown(s, 0, c); sitDown(s, 1, n);
    expect(isProductive(s, c)).toBe(false); expect(isProductive(s, n)).toBe(false);
    const before = [s.director.sinceProductive[StationKind.Science], s.director.sinceProductive[StationKind.Navigation]];
    run(s, seconds(10));
    expect(s.director.sinceProductive[StationKind.Science]).toBe(before[0]! + seconds(10)); expect(s.director.sinceProductive[StationKind.Navigation]).toBe(before[1]! + seconds(10));
    expect(s.skills.xp[0 * 6 + 3]).toBe(0); expect(s.skills.xp[1 * 6 + 0]).toBe(0);                  // no Science or Navigation XP
    placeShot(s, room(s, 'A'), 6000, 1);
    expect(isProductive(s, c)).toBe(true); expect(isProductive(s, n)).toBe(true);
    s.science.scanning = 1; s.stations.cursor[c] = ENEMY_SLOT; guardDebris(s); expect(isProductive(s, c)).toBe(true);   // through anyWarned, not the scan branch; the guard proves no debris array is read at ENEMY_SLOT
  });
  it('director: rawStress with the enemy alone is 0.30, with one shot 0.50; the enemy is never unattended; a shot counts toward the hazard cap', () => {
    const s = makeState(2); placeEnemy(s);
    expect(rawStress(s)).toBeCloseTo(STRESS_WEIGHTS.enemy, 12); expect(anyUnattended(s)).toBe(false); expect(activeHazardCount(s)).toBe(0);
    placeShot(s, room(s, 'A'), 600);
    expect(rawStress(s)).toBeCloseTo(STRESS_WEIGHTS.enemy + STRESS_WEIGHTS.debris, 12); expect(activeHazardCount(s)).toBe(1);
  });
});

describe('combat gate: a level-2 Weapons operator destroys the enemy with seven beams inside the window', () => {
  it('seven shots, seven hits, destroyed before departTick', () => {
    const s = makeState(2, 1); quiet(s); const w = wpn(s); sitDown(s, 0, w); placeEnemy(s); s.enemy.nextShotTick = 1e9; s.stations.cursor[w] = ENEMY_SLOT; s.weapons.charge = 0;
    const depart = s.enemy.departTick; let shots = 0;
    while (s.enemy.present && s.tick < depart) {
      const fire = s.weapons.charge >= 1; if (fire) { s.rng.combat.s = 7; shots++; }
      run(s, 1, () => intents(fire ? { confirmPressed: true } : {}, {}));
    }
    expect(shots).toBe(7); expect([s.telemetry.shots, s.telemetry.hits, s.telemetry.enemiesDestroyed]).toEqual([7, 7, 1]); expect(s.enemy.present).toBe(0); expect(s.tick).toBeLessThan(depart);
  });
});
```

(If the kill fixture's cursor assertion is awkward, simplify it: place only the shot `k` after `placeEnemy` and assert `cursor === k`; the point is "retargeted to the next StableId".)

`tests/gate-survival.test.ts`: extend the per-seed test. Add tracking of the encounter and crew health:

```ts
      let minHealth = HEALTH_MAX, encounterImpacts = 0;
      ...inside the loop after step():
        if (s.enemy.present) { /* impacts during the encounter */ }
        for (const eid of s.crew) if (Life.state[eid] === LifeState.Conscious) minHealth = Math.min(minHealth, Health.cur[eid]!);
```

Concretely: declare `let minHealth = HEALTH_MAX, encounterImpacts = 0, lastTelemetryImpacts = 0;` before the loop; after `step(s, intents)` add `for (const eid of s.crew) if (Life.state[eid] === LifeState.Conscious) minHealth = Math.min(minHealth, Health.cur[eid]!);` and `if (s.enemy.present) encounterImpacts += s.telemetry.impacts - lastTelemetryImpacts; lastTelemetryImpacts = s.telemetry.impacts;` (telemetry counts every impact, including two in one tick, which the existing timestamp-based `impacts` counter does not). After the loop add `expect(s.telemetry.encounters, 'the first encounter must fall inside the gate').toBeGreaterThanOrEqual(1);` and change the hull message to include the new figures: `expect(impacts, \`min hull ${minHull}, encounter impacts ${encounterImpacts}, min health ${minHealth.toFixed(1)}\`).toBeGreaterThan(0);`. Import `Health` from components and `HEALTH_MAX` from tuning. Run `npx vitest run tests/gate-survival.test.ts` and copy the three message strings (vitest prints them only on failure, so add a temporary `console.log` of the same string, run, record the three lines in the report, then remove the log).

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/enemy.test.ts tests/productive.test.ts tests/gate-survival.test.ts` → the shooting tests fail (`fireWeapon` rejects `ENEMY_SLOT`: `db.active[8]` is undefined); the guard tests fail; the gate's encounter assertion passes already (Task 1 made the enemy arrive) unless a seed dies.

- [ ] **Step 3: weapons.ts, science.ts, productive.ts**

`weapons.ts`: import `isTarget, ENEMY_SLOT` from `./debrisTargets`, `enemyBeamHits, damageEnemy` from `./enemy`, `ENEMY_BEAM_DAMAGE, ENEMY_TORP_DAMAGE` from tuning. In `fireWeapon`:

```ts
  const c = state.stations.cursor[wpn]!;
  if (c < 0 || !isTarget(state, c)) return false;
  const enemy = c === ENEMY_SLOT, output = stationOutput(state, wpn);
  let hit: boolean;
  if (w.selector === Weapon.Torpedo) {
    if (!w.torpedoLoaded) return false;
    hit = torpedoHits(nextFloat(state.rng.combat), output);
    w.torpedoLoaded = 0;
  } else {
    if (w.charge < 1) return false;
    const u = nextFloat(state.rng.combat);
    hit = enemy ? enemyBeamHits(u, output) : beamHits(u, output, w.selector + 1 === db.frequency[c]);   // against the ship the frequency plays no part until Combat-ii
    w.charge = 0;
  }
  state.skills.lastShotTick = state.tick; state.telemetry.shots++; addXp(state, state.stations.occupant[wpn]!, Skill.Weapons, XP_PER_SHOT);
  if (hit) {
    state.telemetry.hits++;
    if (enemy) damageEnemy(state, w.selector === Weapon.Torpedo ? ENEMY_TORP_DAMAGE : ENEMY_BEAM_DAMAGE); else removeDebris(state, c);
  }
  return hit;
```

`science.ts`: import `ENEMY_SLOT`; `scienceInput`: `if (c >= 0 && c !== ENEMY_SLOT && db.active[c] && db.warned[c] && !db.scanned[c]) state.science.scanning = 1;`; `scanStep`: `if (c < 0 || c === ENEMY_SLOT || !db.active[c] || !db.warned[c] || db.scanned[c]) return;`.

`productive.ts`: import `ENEMY_SLOT`; `function anyWarned(state: SimState): boolean { return warnedTargets(state).some((k) => k !== ENEMY_SLOT); }   // objects only: the enemy's presence alone is not incoming work (spec Combat-i section 3)`; `scanningValid` gains `c !== ENEMY_SLOT &&` right after `c >= 0 &&`.

- [ ] **Step 4: Run, the gate, full suite**

`npx vitest run tests/enemy.test.ts tests/weapons.test.ts tests/science.test.ts tests/productive.test.ts tests/director.test.ts tests/gate-survival.test.ts` → PASS. Task 1 already settled the survival tuning before the re-bless, so the gate must pass here with no tuning change; if it does not (the new assertions only add the encounter count and the figures), STOP and report. Record the three figure lines in the report. Then `npm test`, `npm run typecheck`, `npm run build` → pass; `tests/golden/basic.json` unchanged (this task changes no constant and no draw).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/weapons.ts src/renderer/src/sim/science.ts src/renderer/src/sim/productive.ts tests/enemy.test.ts tests/gate-survival.test.ts
git commit -m "feat: beams and torpedoes damage the enemy ship; Science and the productive predicates ignore the enemy pseudo-slot; survival gate records encounter impacts and crew health; combat gate"
```

---

### Task 3: HUD rows and window, the record's enemy block, the acceptance column

**Files:**
- Modify: `src/renderer/src/render/hudModel.ts`, `src/renderer/src/render/hud.ts`, `src/renderer/src/sim/telemetry.ts`, `src/renderer/src/sim/acceptance.ts`, `tests/hud.test.ts`, `tests/telemetry.test.ts`, `tests/acceptance.test.ts`

**Interfaces:**
- Consumes: `ENEMY_SLOT`, `ObjectKind`, `state.enemy`, `telemetry.encounters/enemiesDestroyed`.
- Produces: `DebrisTarget.kind`, `DebrisTarget.hull`, `WeaponsPanel.first`, `SciencePanel.first`, `targetWindow(cursor, length, rows)`, `targetRowText(t, scan?)`, `WEAPONS_ROWS`, `SCIENCE_ROWS` exported from `hudModel.ts`; `TelemetryRecord.enemy`; the `enemy` table column.

- [ ] **Step 1: Write the failing tests**

`tests/hud.test.ts`: in the existing Weapons panel test **and** the existing Science panel test (`tests/hud.test.ts` around line 172), every expected target object gains `kind: 'debris', hull: null`, and a panel gains `first: 0` wherever whole-panel equality is asserted. Append (imports: `targetWindow, targetRowText` from hudModel; `placeEnemy, placeShot, quiet` from helpers (`quiet` is not imported today); `ENEMY_SLOT` from debrisTargets; `ENCOUNTER_MAX` from tuning):

```ts
  it('threat rows: the enemy first with its hull percent, shots with and without a scanned frequency; none when absent', () => {
    const s = makeState(1), A = room(s, 'A'); quiet(s);
    expect(buildHudModel(s, slots(1), 'running', '').threats.some((t) => t.text.startsWith('Enemy'))).toBe(false);
    placeEnemy(s); s.enemy.hull = 64;
    const k = placeShot(s, A, 7 * 60, 1); const k2 = placeShot(s, A, 7 * 60, 1, undefined, 2); s.debris.scanned[k2] = 1;
    const th = buildHudModel(s, slots(1), 'running', '').threats;
    expect(th[0]).toEqual({ icon: 'icon.weapons', text: 'Enemy ship: hull 64%' });
    const shotRows = th.filter((t) => t.text.startsWith('Shot'));
    expect(shotRows).toEqual([{ icon: 'icon.sensors', text: `Shot: ${s.layout.rooms[A]!.name} 7s` }, { icon: 'icon.sensors', text: `Shot: ${s.layout.rooms[A]!.name} 7s F2` }]);
    void k;
  });
  it('target rows: the enemy row on Weapons and Science, nothing throws with the cursor on the enemy or with it unselected', () => {
    const s = makeState(2), A = room(s, 'A'); quiet(s); const w = s.derived.stationOfKind[StationKind.Weapons]!, c = s.derived.stationOfKind[StationKind.Science]!;
    const k = placeDebris(s, A, 600, 1); placeEnemy(s); s.enemy.hull = 64; sitDown(s, 0, w); sitDown(s, 1, c);
    s.stations.cursor[w] = ENEMY_SLOT;                                   // Science stays on the object
    const m = buildHudModel(s, slots(2), 'running', '');
    const wp = m.players[0]!.console as WeaponsPanel, sp = m.players[1]!.console as SciencePanel;
    expect(wp.targets[1]).toEqual({ stableId: s.enemy.stableId, kind: 'enemy', room: 'Enemy ship', eta: ENCOUNTER_MAX, frequency: null, hull: 0.64 });
    expect(wp.cursor).toBe(1); expect(wp.first).toBe(0);
    expect(sp.targets[1]).toEqual({ stableId: s.enemy.stableId, kind: 'enemy', room: 'Enemy ship', eta: ENCOUNTER_MAX, frequency: null, hull: 0.64, scan: 0 });
    expect(sp.targets[0]!.kind).toBe('debris'); expect(sp.cursor).toBe(0);
    void k;
  });
  it('targetWindow follows the cursor; a nine-entry list with the cursor last gives first 3 on Weapons', () => {
    expect([targetWindow(-1, 3, 6), targetWindow(5, 9, 6), targetWindow(6, 9, 6), targetWindow(8, 9, 6), targetWindow(8, 9, 7), targetWindow(2, 2, 6)]).toEqual([0, 0, 1, 3, 2, 0]);
    const s = makeState(1), A = room(s, 'A'); quiet(s); const w = s.derived.stationOfKind[StationKind.Weapons]!;
    for (let n = 0; n < 8; n++) placeDebris(s, A, 600, 1); placeEnemy(s);
    sitDown(s, 0, w); s.stations.cursor[w] = ENEMY_SLOT;
    const wp = buildHudModel(s, slots(1), 'running', '').players[0]!.console as WeaponsPanel;
    expect(wp.targets).toHaveLength(9); expect(wp.cursor).toBe(8); expect(wp.first).toBe(3);
    run(s, 1, () => intents({ cancelPressed: true })); const c = s.derived.stationOfKind[StationKind.Science]!; sitDown(s, 0, c); s.stations.cursor[c] = ENEMY_SLOT;
    const sp = buildHudModel(s, slots(1), 'running', '').players[0]!.console as SciencePanel;
    expect(sp.targets).toHaveLength(9); expect(sp.cursor).toBe(8); expect(sp.first).toBe(2);        // seven Science rows
  });
  it('targetRowText renders the exact row strings for debris, shots and the enemy on both panels', () => {
    const debris = { stableId: 1, kind: 'debris' as const, room: 'Engine', eta: 7, frequency: null, hull: null };
    expect(targetRowText(debris)).toBe('Engine 7s F?'); expect(targetRowText({ ...debris, frequency: 2 })).toBe('Engine 7s F2'); expect(targetRowText(debris, 0.4)).toBe('Engine 7s F? 40%');
    const shot = { ...debris, kind: 'shot' as const };
    expect(targetRowText(shot)).toBe('Shot Engine 7s F?'); expect(targetRowText({ ...shot, frequency: 2 })).toBe('Shot Engine 7s F2'); expect(targetRowText(shot, 0.4)).toBe('Shot Engine 7s F? 40%'); expect(targetRowText({ ...shot, frequency: 2 }, 0.4)).toBe('Shot Engine 7s F2');
    const enemy = { stableId: 9, kind: 'enemy' as const, room: 'Enemy ship', eta: 87, frequency: null, hull: 0.64 };
    expect(targetRowText(enemy)).toBe('Enemy 64% 87s'); expect(targetRowText(enemy, 0.4)).toBe('Enemy 64% 87s');   // no frequency, no scan text
  });
```

`tests/telemetry.test.ts`: in the exact-record fixture set `t.encounters = 2; t.enemiesDestroyed = 1;` and add `enemy: { met: 2, destroyed: 1 }` after `phaseEntries` in the expected object; in the purity/present test (or a new one-liner) assert a fresh state's record has `enemy: { met: 0, destroyed: 0 }`.

`tests/acceptance.test.ts`: the `rec()` fixture gains `enemy: { met: 0, destroyed: 0 }`; the header regex gains `\s+enemy$` after `hits\/shots`; row 1's regex ends `1\/3\s+0\/0$`; row 2 (with `over` including `enemy: { met: 2, destroyed: 1 }`) ends `0\/0\s+2\/1$`.

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/hud.test.ts tests/telemetry.test.ts tests/acceptance.test.ts` → `kind`/`hull` missing on targets, `threats` without the enemy row (or a throw on `rooms[undefined]`), `targetWindow` missing, `enemy` missing on the record, the table lacks the column.

- [ ] **Step 3: hudModel.ts and hud.ts**

`hudModel.ts`: imports gain `ENEMY_SLOT` from `../sim/debrisTargets`, `ObjectKind` from `../sim/debris`, `ENEMY_HULL` from `../sim/tuning`. Types:

```ts
export type TargetKindName = 'debris' | 'shot' | 'enemy';
export interface DebrisTarget { stableId: number; kind: TargetKindName; room: string; eta: number; frequency: number | null; hull: number | null }
export interface WeaponsPanel { kind: 'weapons'; charge: number; selector: number; torpedo: {...unchanged}; targets: DebrisTarget[]; cursor: number; first: number }
export interface SciencePanel { kind: 'science'; leadSeconds: number; targets: (DebrisTarget & { scan: number })[]; cursor: number; first: number; scanning: boolean }
export interface HudThreat { icon: 'icon.fire' | 'icon.breach' | 'icon.power' | 'icon.sensors' | 'icon.weapons'; text: string }
```

Helpers:

```ts
export const WEAPONS_ROWS = 6, SCIENCE_ROWS = 7;
/** First visible row: the window starts at 0 until the cursor passes the last row, then scrolls so the cursor is the last visible row (spec Combat-i section 7). */
export function targetWindow(cursor: number, length: number, rows: number): number {
  return Math.max(0, Math.min(Math.max(cursor, 0) - rows + 1, Math.max(0, length - rows)));
}
function target(state: SimState, k: number): DebrisTarget {
  if (k === ENEMY_SLOT) return { stableId: state.enemy.stableId, kind: 'enemy', room: 'Enemy ship', eta: Math.ceil((state.enemy.departTick - state.tick) * DT), frequency: null, hull: state.enemy.hull / ENEMY_HULL };
  const db = state.debris;
  return { stableId: db.stableId[k]!, kind: db.kind[k] === ObjectKind.Shot ? 'shot' : 'debris', room: state.layout.rooms[db.room[k]!]!.name, eta: etaSeconds(state, k), frequency: db.scanned[k] ? db.frequency[k]! : null, hull: null };
}
```

Weapons panel: `const slots = warnedTargets(state), c = state.stations.cursor[i]!, cursor = slots.indexOf(c); return { ..., targets: slots.map((k) => target(state, k)), cursor, first: targetWindow(cursor, slots.length, WEAPONS_ROWS) };`. Science panel: `targets: slots.map((k) => ({ ...target(state, k), scan: k === ENEMY_SLOT ? 0 : state.debris.scan[k]! }))`, `cursor`, `first: targetWindow(cursor, slots.length, SCIENCE_ROWS)`. Threats: before the fire loop, `if (state.enemy.present) threats.push({ icon: 'icon.weapons', text: \`Enemy ship: hull ${Math.round(state.enemy.hull / ENEMY_HULL * 100)}%\` });`; the debris loop becomes `for (const k of warnedTargets(state)) { if (k === ENEMY_SLOT) continue; const label = state.debris.kind[k] === ObjectKind.Shot ? 'Shot' : 'Debris'; threats.push({ icon: 'icon.sensors', text: \`${label}: ${state.layout.rooms[state.debris.room[k]!]!.name} ${etaSeconds(state, k)}s${state.debris.scanned[k] ? \` F${state.debris.frequency[k]}\` : ''}\` }); }`.

The row text lives in `hudModel.ts` (pixi-free, so it is unit-tested) and `hud.ts` only places it:

```ts
/** Exact target-row strings for the Weapons and Science panels (spec Combat-i section 7). */
export function targetRowText(t: DebrisTarget, scan = 0): string {
  if (t.kind === 'enemy') return `Enemy ${Math.round((t.hull ?? 0) * 100)}% ${t.eta}s`;
  return `${t.kind === 'shot' ? 'Shot ' : ''}${t.room} ${t.eta}s F${t.frequency ?? '?'}${t.frequency === null && scan > 0 ? ` ${Math.floor(scan * 100)}%` : ''}`;
}
```

`hud.ts` (import `targetRowText, WEAPONS_ROWS, SCIENCE_ROWS` from hudModel). Weapons rows: `const vis = c.targets.slice(c.first, c.first + WEAPONS_ROWS); ui.consoleRows.forEach((r, k) => { const t = k >= 1 ? vis[k - 1] : undefined; r.root.visible = !!t; if (t) r.set({ name: targetRowText(t), level: 0, max: 0, status: '', cursor: k - 1 === c.cursor - c.first, tint: k - 1 === c.cursor - c.first ? TEXT : DIM }); });`. Science rows: `const vis = c.targets.slice(c.first, c.first + SCIENCE_ROWS); ... const t = vis[k]; ... name: targetRowText(t, t.scan), cursor: k === c.cursor - c.first ...`. The slicing and highlight offset stay in `hud.ts` and are covered by the manual gate's scrolling check.

- [ ] **Step 4: telemetry.ts and acceptance.ts**

`telemetry.ts`: `TelemetryRecord` gains `enemy: { met: number; destroyed: number };` after `phaseEntries`; `telemetryRecord` adds `enemy: { met: t.encounters, destroyed: t.enemiesDestroyed },` after the `phaseEntries` entry. `acceptance.ts`: `COLUMNS` gains `'enemy'` last; `row` pushes `` `${r.enemy.met}/${r.enemy.destroyed}` `` last.

- [ ] **Step 5: Run and full suite**

`npx vitest run tests/hud.test.ts tests/telemetry.test.ts tests/acceptance.test.ts tests/render.test.ts tests/renderPure.test.ts tests/session.test.ts` → PASS. `npm test`, `npm run typecheck`, `npm run build` → pass; golden unchanged. `npm run acceptance 1 1` → three rows ending in `0/0` (no encounter in one minute).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/hudModel.ts src/renderer/src/render/hud.ts src/renderer/src/sim/telemetry.ts src/renderer/src/sim/acceptance.ts tests/hud.test.ts tests/telemetry.test.ts tests/acceptance.test.ts
git commit -m "feat: HUD shows the enemy ship and its shots in the threats and target lists with a cursor-following window; the record and the acceptance table carry encounters met and destroyed"
```

---

### Task 4: Gate, spec amendments, roadmap

**Files:**
- Modify: `docs/gates.md`, `docs/superpowers/specs/2026-11-11-enemy-ship-design.md`, `docs/roadmap.md`

- [ ] **Step 1: Gate section**

Run `npm run acceptance 5 1` (five minutes, seed 1: one encounter from `ENCOUNTER_FIRST`) and keep its three rows. Append to `docs/gates.md`, filling the survival figures from the Task 2 report and **replacing every tuning number in the narrative (3:00, 10 to 15 s, 118s) with the final values from `tuning.ts`** if Task 1 took a fallback:

```markdown
## Combat-i: enemy ship
- [x] `npm test` passes: enemy (initial values, fireInterval, arrival with no draw and the auto-select, due shots with the exact director and hazards draws in spawnObject order, the shot cap and the full table, withdrawal with the cooldown draw and surviving shots, the both-clocks tick, the second encounter, step() ordering; targets incl. targetStableId, cycling, leave and removeDebris retargeting, kind reset; shooting with pinned combat rolls for beam hit/miss, torpedo hit/miss, the kill, readiness rejections, the kill on a due-shot tick; shot impacts and evasion, scanning and shooting down a shot; Science and productive guards; director stress and attendance), snapshot (enemy block, kinds and counters round trip and hash, version-9 rejection, mid-encounter continuation through an impact and the withdrawal), HUD (threat rows, target rows, targetWindow), telemetry record and acceptance column, and the golden replay re-blessed once (version 10).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with the default crew and the first encounter at 3:00 (Weapons unmanned): <seed 1 figures>; <seed 2>; <seed 3> (min hull, encounter impacts, min crew health). Tuning fallbacks taken: <none | list>.
- [x] Combat gate: a level-2 Weapons operator with all-hit rolls destroys the enemy in seven beams inside the window.
- [x] `npm run acceptance 5 1`, 2026-11-11, `enemy` column `1/0` on all three rows:

```
<paste the three rows>
```

- [ ] Manual, two players (`npm run dev`): at 3:00 `Enemy ship: hull 100%` appears in the threats and `Shot: <room> Ns` rows follow every 10 to 15 s; from Weapons (B(7,2)) the target list shows `Enemy 100% 118s` among the `Shot ...` rows, Confirm with a charged beam lowers the percentage more often than not, and a torpedo takes a visible chunk; with more than six targets the list scrolls to keep the selection visible; the row and the threat vanish when the hull reaches 0 or after two minutes. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.
```

- [ ] **Step 2: Spec amendments and roadmap**

Append to the spec:

```markdown
## 13. Amendments from the plan
- `spawnDebris` and `spawnShot` share a private `spawnObject(state, kind, flight, jitter)`, so the three `rng.hazards` draws (room, flight, frequency) live in one place.
- The cooldown re-arm in `leave` uses `ENEMY_FIRE_JITTER` (+/- 20 %), the same constant as the shot re-arm.
- `DebrisTarget` always carries `kind` and `hull` (`hull: null` for objects).
- Survival gate tuning fallbacks taken (Task 1, before the single golden re-bless): <none | list with values>; sections 8 and 10 read with the final values.
- `targetRowText` lives in `hudModel.ts` (pixi-free) so the exact row strings are unit-tested; `hud.ts` only slices the window and places the text.
```

`docs/roadmap.md`: item 5 → `in review` (the merge commit flips it to `merged 2026-11-11`), item 6 → `next`.

- [ ] **Step 3: Verify and commit**

`npm run typecheck`, `npm test`, `npm run build` → pass.

```bash
git add docs/gates.md docs/superpowers/specs/2026-11-11-enemy-ship-design.md docs/roadmap.md
git commit -m "docs: Combat-i gate with survival figures and the five-minute acceptance rows, spec amendments, roadmap status"
```
