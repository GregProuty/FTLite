# Overdrive, Heat and Coolant (Increment 2b-i) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Engineering push any station one bar above its maximum, with heat that climbs while overdriven, a shared pool of four coolant units assigned per station with Confirm, and an overheat that fails the station and may start a fire, per `docs/superpowers/specs/2026-11-10-overdrive-heat-coolant-design.md`.

**Architecture:** `stations.heat` and `stations.coolant` typed arrays join the station state; a new `sim/heat.ts` owns the hazard-tick `heatStep` (heat update, then overheats via the existing `failStation` and `igniteRoom`) and the coolant cycle; `power.ts` owns the overdrive ceiling `maxLevel(kind)`; Engineering Confirm dispatches to `cycleCoolant`. The HUD model exposes heat, coolant and overdrive per row and station; the Pixi HUD draws the overdrive cell, a heat bar and a coolant label.

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), fast-check, Pixi 8.19 (render task only). No new dependencies.

## Spec amendments made by this plan (recorded in Task 5)

- `maxLevel(kind)` lives in `sim/power.ts` next to `shiftBar` (spec §2 put it in `heat.ts`); `heat.ts` imports `failStation` from `power.ts`, so placing `maxLevel` in `heat.ts` would make an import cycle.
- `coolingPerUnit(state)` returns `HEAT_COOL_UNIT` and takes `state` only so increment 3 can add the seated operator's skill term without changing callers (spec §5 describes the future formula).

## Global Constraints

- `tests/boundary.test.ts` stays green: `sim/` and `shared/` import nothing from render/, input/, app/, pixi, electron; no `Math.random`, `Date`, `performance.now`, `Math.sin/cos/atan2/pow/hypot`, `window`, `document` in sim/ or shared/, even in comments. ASCII only in comments.
- Every test runs under node; no test imports pixi, and no file a test imports does.
- Determinism: the only new randomness is the overheat fire roll, one `rng.hazards` draw per overheat, always consumed. All new per-run state (`stations.heat`, `stations.coolant`) is in `SimState`, flattened after `cursor`, snapshotted and hashed. `SIM_VERSION` becomes `4`; version-3 snapshots are rejected.
- Tuning (exact values): `STATION_OVERDRIVE = 1`; `HEAT_MAX = 240`; `HEAT_RISE = 2`; `HEAT_COOL_UNIT = 1`; `HEAT_COOL_IDLE = 4`; `COOLANT_POOL = 4`; `COOLANT_MAX_PER_STATION = 2`; `OVERHEAT_FIRE_CHANCE = 0.5`. Heat is integer arithmetic on the hazard tick (`tick % HAZARD_EVERY === 0`, 12 Hz): unassisted overdrive overheats after 120 hazard ticks (600 ticks, 10 s); one unit after 240 hazard ticks (20 s); two units hold; idle cooling clears `HEAT_MAX` in 60 hazard ticks (5 s).
- `maxLevel(kind) = STATION_MAX[kind] + (kind === Engineering ? 0 : STATION_OVERDRIVE)`. `isOverdriven(state, i) = stationOnline(state, i) && level[i] > STATION_MAX[kind]`. `stationOutput` is unchanged (`level / STATION_MAX × curve`, so overdriven output exceeds 1: Navigation level 3 at skill 0 is `1.125`, Weapons level 4 is `1.0`).
- Overheat (`heat ≥ HEAT_MAX` after the update): `failStation(state, i)`, then `heat[i] = 0`, then one `rng.hazards` draw `u`; `igniteRoom(state, stationRoom[i])` when `u < OVERHEAT_FIRE_CHANCE`. Stations resolve in ascending index. A spawner `failStation` does not touch heat.
- Coolant cycle (Engineering Confirm on the cursor's station `i`): nothing when `i < 0` or `i` is the Engineering station; else `next = coolant[i] + 1`, and if `next > COOLANT_MAX_PER_STATION` or `COOLANT_POOL − coolantUsed(state) < 1` then `next = 0`. Σ `coolant ≤ COOLANT_POOL` always.
- Step order: interact → console → movement → doors → hazard tick (`lifeSupportInjection` → `oxygenStep` → `fireStep` → **`heatStep`**) → spawner → debrisSystem → medbay → crew.
- RNG pins available for `rng.hazards` (set `s.rng.hazards.s = N` then the first `nextFloat` is): `7 → 0.012`, `1 → 0.627`.
- Commit messages: imperative, prefixed `feat:`, `test:`, `chore:`, `spec:` or `docs:`; the agent's attribution line as the session requires. `npm run typecheck`, `npm test` and `npm run build` pass at the end of every task.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/heat.ts` (new) | `isOverdriven`, `coolingPerUnit`, `coolantUsed`, `cycleCoolant`, `heatStep`. |
| `src/renderer/src/sim/power.ts` | `maxLevel(kind)`; `shiftBar(+1)` ceiling. |
| `src/renderer/src/sim/{state,flatten,tuning,console,step}.ts` | New arrays and constants, `SIM_VERSION 4`, Confirm dispatch, step order. |
| `src/renderer/src/render/{hudModel,hud}.ts` | Heat, coolant and overdrive in the Engineering panel and station strip. |
| `tests/heat.test.ts` (new), `tests/{power,console,snapshot,hud}.test.ts` | Tests. |
| `docs/gates.md`, spec amendments, memory | Task 5. |

---

### Task 1: Heat and coolant state, overdrive ceiling, coolant cycle, snapshot coverage

**Files:**
- Create: `src/renderer/src/sim/heat.ts`
- Modify: `src/renderer/src/sim/tuning.ts`, `src/renderer/src/sim/state.ts`, `src/renderer/src/sim/flatten.ts`, `src/renderer/src/sim/power.ts`, `tests/helpers/sim.ts`
- Test: `tests/heat.test.ts` (new), `tests/power.test.ts`, `tests/snapshot.test.ts`, `tests/golden/basic.json` (re-bless)

**Interfaces:**
- Produces: `SimState.stations.heat: Int16Array`, `SimState.stations.coolant: Uint8Array` (both length = station count, zero-initialised); `maxLevel(kind: number): number` in `power.ts`; in `heat.ts`: `isOverdriven(state, i): boolean`, `coolingPerUnit(state): number`, `coolantUsed(state): number`, `cycleCoolant(state, i): boolean` (returns whether the value changed); test helper `overdrive(state, kind): number` in `tests/helpers/sim.ts`. Tuning constants listed in Global Constraints.

- [ ] **Step 1: Write the failing tests**

Append to `tests/helpers/sim.ts` (import `shiftBar, maxLevel` from `../../src/renderer/src/sim/power`):

```ts
/** Push a station to max + 1 with a widened reactor so the pool never refuses (heat tests are about heat, not bars). Returns the station index. */
export function overdrive(state: SimState, kind: number): number {
  const i = state.derived.stationOfKind[kind]!;
  state.power.capacity = 20;
  while (state.stations.level[i]! < maxLevel(kind)) if (!shiftBar(state, i, 1)) throw new Error('shiftBar refused');
  return i;
}
```

Create `tests/heat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { stationOutput } from '../src/renderer/src/sim/stations';
import { shiftBar, maxLevel, failStation } from '../src/renderer/src/sim/power';
import { isOverdriven, coolingPerUnit, coolantUsed, cycleCoolant } from '../src/renderer/src/sim/heat';
import { STATION_MAX, STATION_OVERDRIVE, HEAT_COOL_UNIT, COOLANT_POOL, COOLANT_MAX_PER_STATION } from '../src/renderer/src/sim/tuning';
import { makeState, overdrive } from './helpers/sim';

const idx = (s: ReturnType<typeof makeState>, kind: number) => s.derived.stationOfKind[kind]!;

describe('overdrive ceiling', () => {
  it('every kind but Engineering may hold one bar above STATION_MAX', () => {
    for (let k = 0; k < STATION_MAX.length; k++) expect(maxLevel(k)).toBe(STATION_MAX[k]! + (k === StationKind.Engineering ? 0 : STATION_OVERDRIVE));
    const s = makeState(1), nav = idx(s, StationKind.Navigation), eng = idx(s, StationKind.Engineering);
    s.power.capacity = 20;
    expect(shiftBar(s, nav, 1)).toBe(true); expect(shiftBar(s, nav, 1)).toBe(true);   // 1 -> 2 -> 3
    expect(s.stations.level[nav]).toBe(3); expect(isOverdriven(s, nav)).toBe(true);
    expect(shiftBar(s, nav, 1)).toBe(false);                                             // never above max + 1
    expect(shiftBar(s, eng, 1)).toBe(false); expect(isOverdriven(s, eng)).toBe(false);  // Engineering stays at 1
    expect(shiftBar(s, nav, -1)).toBe(true); expect(isOverdriven(s, nav)).toBe(false);  // back to max is an ordinary move
  });
  it('isOverdriven is false for a failed station; output scales past 1 while overdriven', () => {
    const s = makeState(1), nav = overdrive(s, StationKind.Navigation), wpn = overdrive(s, StationKind.Weapons);
    expect(stationOutput(s, nav)).toBeCloseTo(1.125); expect(stationOutput(s, wpn)).toBeCloseTo(1.0);
    failStation(s, nav);
    expect(isOverdriven(s, nav)).toBe(false); expect(s.stations.level[nav]).toBe(0);
  });
});

describe('coolant', () => {
  it('cycles 0, 1, 2, 0 on a station; the pool caps the total; Engineering holds none', () => {
    const s = makeState(1), wpn = idx(s, StationKind.Weapons), sci = idx(s, StationKind.Science), eng = idx(s, StationKind.Engineering);
    expect(coolingPerUnit(s)).toBe(HEAT_COOL_UNIT);
    expect(cycleCoolant(s, wpn)).toBe(true); expect(s.stations.coolant[wpn]).toBe(1);
    expect(cycleCoolant(s, wpn)).toBe(true); expect(s.stations.coolant[wpn]).toBe(2);
    expect(cycleCoolant(s, wpn)).toBe(true); expect(s.stations.coolant[wpn]).toBe(0);     // wraps past the per-station cap
    cycleCoolant(s, wpn); cycleCoolant(s, wpn); cycleCoolant(s, sci);                       // 2 + 1 = 3 used
    expect(coolantUsed(s)).toBe(3);
    expect(cycleCoolant(s, sci)).toBe(true); expect(s.stations.coolant[sci]).toBe(2); expect(coolantUsed(s)).toBe(COOLANT_POOL);
    const nav = idx(s, StationKind.Navigation);
    expect(cycleCoolant(s, nav)).toBe(false); expect(s.stations.coolant[nav]).toBe(0);     // pool exhausted: the step wraps to 0, nothing changes
    expect(cycleCoolant(s, eng)).toBe(false); expect(s.stations.coolant[eng]).toBe(0);
    expect(cycleCoolant(s, -1)).toBe(false);
    expect(COOLANT_MAX_PER_STATION).toBe(2);
  });
});
```

Append to `tests/power.test.ts` inside `describe('power model')`:

```ts
  it('shiftBar reaches max + 1 and no further; -1 from the overdrive bar returns it to the pool', () => {
    const s = makeState(1), doors = idx(s, StationKind.Doors);
    expect(powerPool(s)).toBe(1);
    expect(shiftBar(s, doors, 1)).toBe(true); expect(s.stations.level[doors]).toBe(STATION_MAX[StationKind.Doors]! + 1); expect(powerPool(s)).toBe(0);
    s.power.capacity += 1;
    expect(shiftBar(s, doors, 1)).toBe(false);
    expect(shiftBar(s, doors, -1)).toBe(true); expect(powerPool(s)).toBe(2);
  });
```

In `tests/snapshot.test.ts` change the version test to version 3:

```ts
  it('rejects a version-3 snapshot, by header and by the flattened SIM_VERSION', () => {
    const snap = saveSnapshot(makeState(2));
    expect(() => loadSnapshot(LAYOUT, { ...snap, header: { ...snap.header, simVersion: 3 } })).toThrow(/sim version/);
    const values = [...snap.values]; values[0] = 3;
    expect(() => loadSnapshot(LAYOUT, { ...snap, values })).toThrow(/sim version/);
  });
```

and add after the debris round-trip test:

```ts
  it('round-trips station heat and coolant', () => {
    const s = makeState(2, 5);
    s.stations.heat[1] = 137; s.stations.coolant[1] = 2; s.stations.coolant[4] = 1;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(hashState(t)).toBe(hashState(s));
    expect(Array.from(t.stations.heat)).toEqual(Array.from(s.stations.heat));
    expect(Array.from(t.stations.coolant)).toEqual(Array.from(s.stations.coolant));
    const base = hashState(makeState(2, 5));
    const h = makeState(2, 5); h.stations.heat[2] = 1; expect(hashState(h)).not.toBe(base);          // heat alone changes the hash
    const c = makeState(2, 5); c.stations.coolant[2] = 1; expect(hashState(c)).not.toBe(base);       // coolant alone changes the hash
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/heat.test.ts tests/power.test.ts tests/snapshot.test.ts`
Expected: FAIL (`heat.ts` missing, `maxLevel` not exported, `stations.heat` undefined, version-3 snapshot accepted).

- [ ] **Step 3: Tuning, state and flatten**

Append to `src/renderer/src/sim/tuning.ts` and set `SIM_VERSION = 4`:

```ts
// Overdrive, heat and coolant (increment 2b-i)
export const STATION_OVERDRIVE = 1;                   // extra level above STATION_MAX for every kind except Engineering
export const HEAT_MAX = 240;                          // integer heat units
export const HEAT_RISE = 2;                           // per hazard tick while overdriven (10 s to max unassisted)
export const HEAT_COOL_UNIT = 1;                      // per coolant unit per hazard tick (1 unit: 20 s; 2 units: hold)
export const HEAT_COOL_IDLE = 4;                      // per hazard tick while not overdriven (5 s from max to 0)
export const COOLANT_POOL = 4;                        // shared units, never consumed
export const COOLANT_MAX_PER_STATION = 2;
export const OVERHEAT_FIRE_CHANCE = 0.5;              // rng.hazards, one draw per overheat
```

In `src/renderer/src/sim/state.ts` extend the `stations` type and initialiser:

```ts
  stations: { level: Uint8Array; failed: Uint8Array; repair: Float64Array; occupant: Int8Array; cursor: Int16Array; heat: Int16Array; coolant: Uint8Array };   // heat 0..HEAT_MAX and coolant units per station (spec 2b-i section 3)
```

```ts
    stations: { level: Uint8Array.from(layout.stations.map((st) => st.allocation)), failed: new Uint8Array(N), repair: new Float64Array(N), occupant: new Int8Array(N).fill(-1), cursor: new Int16Array(N), heat: new Int16Array(N), coolant: new Uint8Array(N) },
```

In `src/renderer/src/sim/flatten.ts`: `STATION_FIELDS = 7`; in `flatten` after the `cursor` loop add

```ts
  for (const v of s.stations.heat) put(v); for (const v of s.stations.coolant) put(v);
```

and in `unflatten` after the `cursor` loop add

```ts
  for (let i = 0; i < s.stations.heat.length; i++) s.stations.heat[i] = get();
  for (let i = 0; i < s.stations.coolant.length; i++) s.stations.coolant[i] = get();
```

- [ ] **Step 4: Overdrive ceiling in `power.ts`**

Add `STATION_OVERDRIVE` to the tuning import and:

```ts
/** Highest level a station may hold: STATION_MAX plus the overdrive bar for every kind except Engineering (spec 2b-i section 4). */
export function maxLevel(kind: number): number {
  return STATION_MAX[kind]! + (kind === StationKind.Engineering ? 0 : STATION_OVERDRIVE);
}
```

In `shiftBar` replace `if (level >= STATION_MAX[kind]! || powerPool(state) <= 0) return false;` with `if (level >= maxLevel(kind) || powerPool(state) <= 0) return false;`.

- [ ] **Step 5: Create `heat.ts` (static part)**

```ts
import type { SimState } from './state';
import { StationKind } from './stationKinds';
import { stationOnline } from './stations';
import { STATION_MAX, HEAT_COOL_UNIT, COOLANT_POOL, COOLANT_MAX_PER_STATION } from './tuning';

/** A station is overdriven while online above its STATION_MAX. A failed station has level 0 and is never overdriven. */
export function isOverdriven(state: SimState, i: number): boolean {
  return stationOnline(state, i) && state.stations.level[i]! > STATION_MAX[state.derived.stationKind[i]!]!;
}

/** Heat removed per coolant unit per hazard tick. Increment 3 adds a floor-rounded term from the seated Engineering operator's skill here. */
export function coolingPerUnit(_state: SimState): number {
  return HEAT_COOL_UNIT;
}

export function coolantUsed(state: SimState): number { let t = 0; for (const v of state.stations.coolant) t += v; return t; }

/** Engineering Confirm: cycle station i's coolant 0, 1, 2, 0; a step the pool cannot supply wraps to 0. Engineering itself holds none. Returns whether the value changed. */
export function cycleCoolant(state: SimState, i: number): boolean {
  if (i < 0 || state.derived.stationKind[i] === StationKind.Engineering) return false;
  const c = state.stations.coolant[i]!;
  let next = c + 1;
  if (next > COOLANT_MAX_PER_STATION || COOLANT_POOL - coolantUsed(state) < 1) next = 0;
  state.stations.coolant[i] = next;
  return next !== c;
}
```

- [ ] **Step 6: Run the tests, typecheck, re-bless the golden**

Run: `npx vitest run tests/heat.test.ts tests/power.test.ts tests/snapshot.test.ts` → PASS. `npm run typecheck` → clean. `npm test` → `tests/golden.test.ts` fails (hash changed: `SIM_VERSION` 4 and two new hashed arrays). Run `npm run bless`, then `npm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/heat.ts src/renderer/src/sim/tuning.ts src/renderer/src/sim/state.ts src/renderer/src/sim/flatten.ts src/renderer/src/sim/power.ts tests/helpers/sim.ts tests/heat.test.ts tests/power.test.ts tests/snapshot.test.ts tests/golden/basic.json
git commit -m "feat: station heat and coolant state, overdrive ceiling, coolant cycle; SIM_VERSION 4

Golden re-blessed: SIM_VERSION 4 and the new stations.heat / stations.coolant arrays enter the hash. No behaviour change in the replay."
```

---

### Task 2: `heatStep` and overheat

**Files:**
- Modify: `src/renderer/src/sim/heat.ts`, `src/renderer/src/sim/step.ts`
- Test: `tests/heat.test.ts`, `tests/snapshot.test.ts`

**Interfaces:**
- Consumes: Task 1's `isOverdriven`, `coolingPerUnit`, `overdrive` test helper; `failStation` (`power.ts`), `igniteRoom` (`hazards/fire.ts`).
- Produces: `heatStep(state): void`, called on the hazard tick after `fireStep`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/heat.test.ts` (add `heatStep` to the heat import; `repairStation` to the power import; `HEAT_MAX, HEAT_RISE, HEAT_COOL_IDLE, HAZARD_EVERY, FIRE_START, HULL_MAX, HEALTH_MAX, DEBRIS_HULL_DAMAGE, SPAWN_CAP` to the tuning import; `sitDown` from stations; `Seated, Health` from components; `igniteRoom` from `../src/renderer/src/sim/hazards/fire`; `activateBreach` from `../src/renderer/src/sim/hazards/breach`; `activeHazardCount` from `../src/renderer/src/sim/hazards/spawner`; `createRng, nextFloat` from `../src/shared/rng`; and `run, room, seconds, teleport, placeDebris` from the helpers). Every fixture sets `s.spawner.nextSpawnTick = 1e9` unless it is testing the spawner, and nobody sits at Engineering, so these are the unattended overdrives of spec section 4:

```ts
const atStation = (s: ReturnType<typeof makeState>, pid: number, i: number) => { const t = s.derived.stationTile[i]!, w = s.derived.width; teleport(s, pid, (t % w) + 0.5, Math.floor(t / w) + 0.5); };

describe('heat', () => {
  it('rises HEAT_RISE per hazard tick while overdriven with no coolant, never on other ticks, and caps at an overheat', () => {
    const s = makeState(1), nav = overdrive(s, StationKind.Navigation);
    s.spawner.nextSpawnTick = 1e9;
    expect(s.stations.occupant[idx(s, StationKind.Engineering)]).toBe(-1);    // unattended: nobody at Engineering
    run(s, 1);                                                                 // tick 0 is a hazard tick
    expect(s.stations.heat[nav]).toBe(HEAT_RISE);
    run(s, HAZARD_EVERY - 1);
    expect(s.stations.heat[nav]).toBe(HEAT_RISE);                              // ticks 1..4 do nothing
    run(s, HAZARD_EVERY);
    expect(s.stations.heat[nav]).toBe(2 * HEAT_RISE);
    run(s, seconds(10) - 2 * HAZARD_EVERY - HAZARD_EVERY);                     // up to and including the 119th hazard tick
    expect(s.stations.heat[nav]).toBe(HEAT_MAX - HEAT_RISE); expect(s.stations.failed[nav]).toBe(0);
    run(s, HAZARD_EVERY);                                                      // 120th hazard tick: overheat
    expect(s.stations.failed[nav]).toBe(1); expect(s.stations.level[nav]).toBe(0); expect(s.stations.heat[nav]).toBe(0);
  });
  it('one unit halves the climb (20 s), two units hold it indefinitely', () => {
    const a = makeState(1), nav = overdrive(a, StationKind.Navigation);
    a.spawner.nextSpawnTick = 1e9; a.stations.coolant[nav] = 1;
    run(a, seconds(20) - HAZARD_EVERY);
    expect(a.stations.heat[nav]).toBe(HEAT_MAX - 1); expect(a.stations.failed[nav]).toBe(0);
    run(a, HAZARD_EVERY);
    expect(a.stations.failed[nav]).toBe(1);
    const b = makeState(1), nav2 = overdrive(b, StationKind.Navigation);
    b.spawner.nextSpawnTick = 1e9; b.stations.coolant[nav2] = 2;
    run(b, seconds(30));
    expect(b.stations.heat[nav2]).toBe(0); expect(b.stations.failed[nav2]).toBe(0); expect(b.stations.level[nav2]).toBe(3);
  });
  it('a station at or below its max cools HEAT_COOL_IDLE per hazard tick to a floor of 0; a spawner-style failure leaves heat to decay', () => {
    const s = makeState(1), nav = idx(s, StationKind.Navigation), wpn = idx(s, StationKind.Weapons);
    s.spawner.nextSpawnTick = 1e9;
    s.stations.heat[nav] = HEAT_MAX - 1; s.stations.heat[wpn] = 10;
    run(s, 1);
    expect(s.stations.heat[nav]).toBe(HEAT_MAX - 1 - HEAT_COOL_IDLE); expect(s.stations.heat[wpn]).toBe(10 - HEAT_COOL_IDLE);
    run(s, HAZARD_EVERY * 2);
    expect(s.stations.heat[wpn]).toBe(0);                                      // 10 - 12 floors at 0
    run(s, seconds(5));
    expect(s.stations.heat[nav]).toBe(0);
    const t = makeState(1), sci = overdrive(t, StationKind.Science);
    t.spawner.nextSpawnTick = 1e9;
    run(t, seconds(5));
    const hot = t.stations.heat[sci]!; expect(hot).toBeGreaterThan(0);
    failStation(t, sci);
    expect(t.stations.heat[sci]).toBe(hot);                                    // a power failure does not reset heat
    run(t, HAZARD_EVERY);
    expect(t.stations.heat[sci]).toBe(hot - HEAT_COOL_IDLE);
  });
  it('overheat fails the station, stands its occupant, zeroes heat and draws exactly one hazards roll that may ignite the room', () => {
    const mk = (seed: number) => {
      const s = makeState(2), doors = overdrive(s, StationKind.Doors);
      s.spawner.nextSpawnTick = 1e9; sitDown(s, 1, doors);
      s.stations.heat[doors] = HEAT_MAX - HEAT_RISE; s.rng.hazards.s = seed;
      s.stick.heldDir[1] = 2; s.stick.repeat[1] = 3;                           // stick state the forced stand must clear
      atStation(s, 0, idx(s, StationKind.Navigation));                         // player 0 stands in the Doors room (A) for the fire-damage check
      return { s, doors, r: s.derived.stationRoom[doors]! };
    };
    const one = createRng(7); nextFloat(one);
    const a = mk(7);                                                           // first draw 0.012 < 0.5: fire
    run(a.s, 1);
    expect(a.s.stations.failed[a.doors]).toBe(1); expect(a.s.stations.heat[a.doors]).toBe(0);
    expect(Seated.station[a.s.crew[1]!]).toBe(-1); expect(a.s.stations.occupant[a.doors]).toBe(-1);
    expect(a.s.stick.heldDir[1]).toBe(0); expect(a.s.stick.repeat[1]).toBe(0);
    expect(a.s.rooms.fire[a.r]).toBe(FIRE_START); expect(a.s.rng.hazards.s).toBe(one.s);
    expect(Health.cur[a.s.crew[0]!]).toBeLessThan(HEALTH_MAX);                 // crewSystem applies fire damage on the overheat tick itself
    const b = mk(1);                                                           // first draw 0.627 >= 0.5: no fire
    const oneB = createRng(1); nextFloat(oneB);
    run(b.s, 1);
    expect(b.s.stations.failed[b.doors]).toBe(1); expect(b.s.rooms.fire[b.r]).toBe(0); expect(b.s.rng.hazards.s).toBe(oneB.s);
    const c = mk(7);                                                           // already burning: intensity kept, the draw still consumed
    c.s.rooms.fire[c.r] = 3;
    run(c.s, 1);
    expect(c.s.rooms.fire[c.r]).toBeCloseTo(3, 0); expect(c.s.rng.hazards.s).toBe(one.s);
  });
  it('two stations overheating on one hazard tick resolve in ascending index with one draw each', () => {
    const s = makeState(1), wpn = overdrive(s, StationKind.Weapons), sci = overdrive(s, StationKind.Science);
    s.spawner.nextSpawnTick = 1e9;
    expect(wpn).toBeLessThan(sci);                                             // starter layout: Weapons precedes Science in station order
    expect(s.derived.stationRoom[wpn]).not.toBe(s.derived.stationRoom[sci]);
    s.stations.heat[wpn] = HEAT_MAX - HEAT_RISE; s.stations.heat[sci] = HEAT_MAX - HEAT_RISE; s.rng.hazards.s = 8;   // draws 0.156 (fire), 0.625 (none)
    const two = createRng(8); nextFloat(two); nextFloat(two);
    run(s, 1);
    expect(s.stations.failed[wpn]).toBe(1); expect(s.stations.failed[sci]).toBe(1);
    expect(s.rooms.fire[s.derived.stationRoom[wpn]!]).toBe(FIRE_START); expect(s.rooms.fire[s.derived.stationRoom[sci]!]).toBe(0);
    expect(s.rng.hazards.s).toBe(two.s);
  });
  it('the spawner on the overheat tick counts the new failure: at the cap it skips its spawn', () => {
    const s = makeState(1), nav = overdrive(s, StationKind.Navigation);
    expect(activateBreach(s, 0)).toBe(true); expect(activateBreach(s, 1)).toBe(true);   // two hazards that draw no RNG
    s.stations.heat[nav] = HEAT_MAX - HEAT_RISE; s.rng.hazards.s = 1;          // overheat draw 0.627: no fire
    s.spawner.nextSpawnTick = s.tick;                                          // the spawner runs this tick, after heatStep
    const jitterOnly = createRng(s.rng.director.s); nextFloat(jitterOnly);
    run(s, 1);
    expect(s.stations.failed[nav]).toBe(1);
    expect(activeHazardCount(s)).toBe(SPAWN_CAP);                              // 2 breaches + the overheat failure: nothing spawned
    expect(s.rng.director.s).toBe(jitterOnly.s);                               // only the interval jitter was drawn, no type roll
  });
  it('failed Engineering freezes nothing thermal; coolant and residual heat survive failures and repairs', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering), nav = overdrive(s, StationKind.Navigation);
    s.spawner.nextSpawnTick = 1e9; s.stations.coolant[nav] = 1;
    failStation(s, eng);
    run(s, seconds(5));                                                        // 60 hazard ticks at net +1
    expect(s.stations.heat[nav]).toBe(60 * (HEAT_RISE - HEAT_COOL_UNIT)); expect(s.stations.coolant[nav]).toBe(1);
    repairStation(s, eng);
    expect(s.stations.coolant[nav]).toBe(1); expect(s.stations.heat[nav]).toBe(60);
    failStation(s, nav); repairStation(s, nav);
    expect(s.stations.coolant[nav]).toBe(1); expect(s.stations.heat[nav]).toBe(60);   // repair touches neither
  });
  it('same tick: a Navigation overheat removes that tick\'s evasion roll and the hull takes the impact', () => {
    const s = makeState(2), nav = overdrive(s, StationKind.Navigation);
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 1, nav);
    s.stations.heat[nav] = HEAT_MAX - HEAT_RISE; s.rng.hazards.s = 1;          // no fire
    placeDebris(s, room(s, 'D'), 0, 1);                                        // impacts this tick, in debrisSystem after heatStep
    const combat = s.rng.combat.s;
    run(s, 1);
    expect(s.stations.failed[nav]).toBe(1); expect(s.rng.combat.s).toBe(combat); expect(s.hull).toBe(HULL_MAX - DEBRIS_HULL_DAMAGE);
  });
  it('same tick: Life Support still injects on its overheat tick; the Medbay does not heal on its', () => {
    const a = makeState(1), ls = overdrive(a, StationKind.LifeSupport);
    a.spawner.nextSpawnTick = 1e9; a.stations.heat[ls] = HEAT_MAX - HEAT_RISE; a.rng.hazards.s = 1;
    a.rooms.o2[room(a, 'A')] = 0;
    run(a, 1);
    expect(a.stations.failed[ls]).toBe(1); expect(a.o2Counters.injected).toBeGreaterThan(0);
    const b = makeState(1), med = overdrive(b, StationKind.Medbay);
    b.spawner.nextSpawnTick = 1e9; b.stations.heat[med] = HEAT_MAX - HEAT_RISE; b.rng.hazards.s = 1;
    atStation(b, 0, med); Health.cur[b.crew[0]!] = 50;
    run(b, 1);
    expect(b.stations.failed[med]).toBe(1); expect(Health.cur[b.crew[0]!]).toBe(50);
  });
});
```

Append to `tests/snapshot.test.ts` (import `overdrive` from the helpers):

```ts
  it('an overdrive saved ten ticks before its overheat continues through the failure and fire roll like an uninterrupted run', () => {
    const mk = () => { const s = makeState(1, 9); s.spawner.nextSpawnTick = 1e9; overdrive(s, StationKind.Doors); s.stations.coolant[s.derived.stationOfKind[StationKind.Science]!] = 1; return s; };
    const whole = mk(); run(whole, 660);
    expect(whole.stations.failed[whole.derived.stationOfKind[StationKind.Doors]!]).toBe(1);      // the overheat lands on tick 595
    const first = mk(); run(first, 590);
    expect(first.stations.heat[first.derived.stationOfKind[StationKind.Doors]!]).toBeGreaterThan(0);
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(first))));
    run(resumed, 70);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/heat.test.ts tests/snapshot.test.ts`
Expected: FAIL (heat never changes; `heatStep` not exported; the continuation test finds no failure).

- [ ] **Step 3: Implement `heatStep`**

Extend the imports in `heat.ts` (`nextFloat` from `../../../shared/rng`, `failStation` from `./power`, `igniteRoom` from `./hazards/fire`, and `HEAT_MAX, HEAT_RISE, HEAT_COOL_IDLE, OVERHEAT_FIRE_CHANCE` from tuning) and append:

```ts
function overheat(state: SimState, i: number): void {
  failStation(state, i);                                        // the existing power failure: bars return, the occupant stands, repair is the usual loop
  state.stations.heat[i] = 0;
  if (nextFloat(state.rng.hazards) < OVERHEAT_FIRE_CHANCE) igniteRoom(state, state.derived.stationRoom[i]!);   // draw always consumed; no-op if already burning
}

/** Hazard tick: heat rises while overdriven and falls per coolant unit, otherwise decays at the idle rate; HEAT_MAX overheats. Ascending station index (spec 2b-i section 5). */
export function heatStep(state: SimState): void {
  const st = state.stations, cool = coolingPerUnit(state);
  for (let i = 0; i < st.level.length; i++) {
    if (isOverdriven(state, i)) st.heat[i] = Math.max(0, Math.min(HEAT_MAX, st.heat[i]! + HEAT_RISE - st.coolant[i]! * cool));
    else st.heat[i] = Math.max(0, st.heat[i]! - HEAT_COOL_IDLE);
    if (st.heat[i]! >= HEAT_MAX) overheat(state, i);
  }
}
```

In `step.ts` import `heatStep` from `./heat` and add `heatStep(state);` after `fireStep(state);` inside the `if (hazardTick)` block; update the step-4 comment to "hazards and heat on the hazard tick".

- [ ] **Step 4: Run the tests, typecheck, full suite**

Run: `npx vitest run tests/heat.test.ts tests/snapshot.test.ts` → PASS. `npm run typecheck` → clean. `npm test` → PASS (the golden replay has no overdrive, so it is unchanged; the survival gate has no Engineering input).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/heat.ts src/renderer/src/sim/step.ts tests/heat.test.ts tests/snapshot.test.ts
git commit -m "feat: heat rises while overdriven, coolant and idle cooling, overheat fails the station with a fire chance"
```

---

### Task 3: Engineering Confirm cycles coolant; gate and property tests

**Files:**
- Modify: `src/renderer/src/sim/console.ts`
- Test: `tests/console.test.ts`

**Interfaces:**
- Consumes: `cycleCoolant(state, i)` from `heat.ts`; `maxLevel` from `power.ts`; `coolantUsed` from `heat.ts`.
- Produces: `engineeringInput(state, i, dir, confirm)` (private) calling `cycleCoolant(state, stationOfKind[cursor])` on Confirm.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('Engineering console')` in `tests/console.test.ts` (add `cycleCoolant, coolantUsed` from `../src/renderer/src/sim/heat`, `maxLevel` from power, `HEAT_MAX, HEAT_RISE, HEAT_COOL_IDLE, COOLANT_POOL, HAZARD_EVERY` from tuning, `overdrive, room` from the helpers, and `fc from 'fast-check'`; `createRng, nextFloat, placeDebris, Seated` are already imported):

```ts
  it('Confirm cycles the selected station\'s coolant 0, 1, 2, 0; wraps to 0 when the pool is exhausted; does nothing on the Engineering row', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering), wpn = idx(s, StationKind.Weapons), nav = idx(s, StationKind.Navigation);
    sitDown(s, 0, eng);
    run(s, 1, () => intents(confirm));
    expect(coolantUsed(s)).toBe(0);                                      // Engineering row: nothing
    s.stations.cursor[eng] = StationKind.Weapons;
    run(s, 1, () => intents(confirm)); expect(s.stations.coolant[wpn]).toBe(1);
    run(s, 1, () => intents(confirm)); expect(s.stations.coolant[wpn]).toBe(2);
    run(s, 1, () => intents(confirm)); expect(s.stations.coolant[wpn]).toBe(0);
    run(s, 1, () => intents(confirm)); run(s, 1, () => intents(confirm));   // back to 2
    s.stations.coolant[idx(s, StationKind.Science)] = 1;                  // 3 of 4 used
    s.stations.cursor[eng] = StationKind.Navigation;
    run(s, 1, () => intents(confirm)); expect(s.stations.coolant[nav]).toBe(1); expect(coolantUsed(s)).toBe(COOLANT_POOL);
    run(s, 1, () => intents(confirm)); expect(s.stations.coolant[nav]).toBe(0);   // the step to 2 cannot be supplied: wrap
    expect(coolantUsed(s)).toBe(3);
  });
  it('the seating Confirm at Engineering assigns no coolant', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering);
    at(s, 0, eng); s.stations.cursor[eng] = StationKind.Weapons;
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(eng); expect(coolantUsed(s)).toBe(0);
  });
  it('same tick: a Left out of overdrive, or a Confirm to two units, on the would-be overheat tick prevents it', () => {
    const a = makeState(1), engA = idx(a, StationKind.Engineering), wpnA = overdrive(a, StationKind.Weapons);
    a.spawner.nextSpawnTick = 1e9; sitDown(a, 0, engA); a.stations.cursor[engA] = StationKind.Weapons;
    a.stations.heat[wpnA] = HEAT_MAX - HEAT_RISE;
    run(a, 1, () => intents(left));                                            // consoleSystem (level 4 -> 3) precedes heatStep
    expect(a.stations.level[wpnA]).toBe(3); expect(a.stations.failed[wpnA]).toBe(0);
    expect(a.stations.heat[wpnA]).toBe(HEAT_MAX - HEAT_RISE - HEAT_COOL_IDLE);   // idle cooling instead of an overheat
    const b = makeState(1), engB = idx(b, StationKind.Engineering), wpnB = overdrive(b, StationKind.Weapons);
    b.spawner.nextSpawnTick = 1e9; sitDown(b, 0, engB); b.stations.cursor[engB] = StationKind.Weapons;
    b.stations.heat[wpnB] = HEAT_MAX - HEAT_RISE; b.stations.coolant[wpnB] = 1;
    run(b, 1, () => intents(confirm));                                         // 1 -> 2 units before heatStep: net 0
    expect(b.stations.coolant[wpnB]).toBe(2); expect(b.stations.failed[wpnB]).toBe(0); expect(b.stations.heat[wpnB]).toBe(HEAT_MAX - HEAT_RISE);
  });
  it('same tick: a Weapons shot on the Weapons overheat tick resolves before the failure stands the operator', () => {
    const s = makeState(2), wpn = overdrive(s, StationKind.Weapons);
    s.spawner.nextSpawnTick = 1e9;
    placeDebris(s, room(s, 'A'), 600, 1); sitDown(s, 1, wpn); s.weapons.charge = 1;
    s.stations.heat[wpn] = HEAT_MAX - HEAT_RISE; s.rng.hazards.s = 1;         // no fire
    const oneDraw = createRng(s.rng.combat.s); nextFloat(oneDraw);
    run(s, 1, () => intents({}, confirm));
    expect(s.rng.combat.s).toBe(oneDraw.s); expect(s.weapons.charge).toBe(0);  // the shot was taken
    expect(s.stations.failed[wpn]).toBe(1); expect(Seated.station[s.crew[1]!]).toBe(-1);
  });
  it('property: random Engineering inputs keep coolant within the pool, heat within range, levels within maxLevel and the capacity', () => {
    const arbDir = fc.constantFrom({}, up, down, left, right);
    const arbScript = fc.array(fc.record({ dir: arbDir, confirm: fc.boolean() }), { minLength: 1, maxLength: 240 });
    fc.assert(fc.property(fc.integer({ min: 1, max: 1e6 }), arbScript, (seed, script) => {
      const s = makeState(1, seed), eng = idx(s, StationKind.Engineering);
      sitDown(s, 0, eng);
      for (const e of script) run(s, HAZARD_EVERY, () => intents({ ...e.dir, confirmPressed: e.confirm }));   // one edge per 5 ticks (held direction repeats are fine too)
      let used = 0, levels = 0;
      for (let i = 0; i < s.stations.level.length; i++) {
        used += s.stations.coolant[i]!; levels += s.stations.level[i]!;
        expect(s.stations.coolant[i]).toBeLessThanOrEqual(2);
        expect(s.stations.heat[i]).toBeGreaterThanOrEqual(0); expect(s.stations.heat[i]).toBeLessThanOrEqual(HEAT_MAX);
        expect(s.stations.level[i]).toBeLessThanOrEqual(maxLevel(s.derived.stationKind[i]!));
      }
      expect(used).toBeLessThanOrEqual(COOLANT_POOL); expect(levels).toBeLessThanOrEqual(s.power.capacity);
    }), { numRuns: 30 });
  });
```

Add a new describe after the Science/Weapons/Navigation gate block:

```ts
describe('scripted-intent gate: Engineering overdrive', () => {
  it('overdriven Weapons with two units holds 30 s; at zero units it overheats within 10 s and stands the Weapons operator', () => {
    const s = makeState(2), eng = idx(s, StationKind.Engineering), wpn = idx(s, StationKind.Weapons), ls = idx(s, StationKind.LifeSupport);
    s.spawner.nextSpawnTick = 1e9;
    sitDown(s, 0, eng); sitDown(s, 1, wpn);
    const edge = (p: Partial<Intent>) => { run(s, 1, () => intents(p, {})); run(s, 1, () => intents({}, {})); };
    edge(down);                                                               // cursor Engineering -> Life Support
    edge(left); expect(s.stations.level[ls]).toBe(1); expect(powerPool(s)).toBe(2);
    edge(up); edge(up); edge(up);                                             // Life Support -> Engineering -> Science -> Weapons
    expect(s.stations.cursor[eng]).toBe(StationKind.Weapons);
    edge(right); edge(right);
    expect(s.stations.level[wpn]).toBe(4); expect(powerPool(s)).toBe(0);
    edge(confirm); edge(confirm);
    expect(s.stations.coolant[wpn]).toBe(2);
    run(s, seconds(30));
    expect(s.stations.level[wpn]).toBe(4); expect(s.stations.failed[wpn]).toBe(0); expect(s.stations.heat[wpn]).toBeLessThan(HEAT_MAX);
    expect(s.stations.occupant[wpn]).toBe(1);
    edge(confirm);
    expect(s.stations.coolant[wpn]).toBe(0);
    let failedAt = -1;
    for (let t = 0; t < seconds(10) + 2 * HAZARD_EVERY && failedAt < 0; t++) { run(s, 1); if (s.stations.failed[wpn]) failedAt = t; }
    expect(failedAt).toBeGreaterThanOrEqual(0);
    expect(s.stations.level[wpn]).toBe(0); expect(s.stations.heat[wpn]).toBe(0);
    expect(Seated.station[s.crew[1]!]).toBe(-1); expect(s.stations.occupant[wpn]).toBe(-1);
    expect(Seated.station[s.crew[0]!]).toBe(eng);                             // the Engineering operator is unaffected
  });
});
```

(`Intent` is imported from `../src/shared/intent` as a type if not already.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/console.test.ts`
Expected: FAIL (Confirm at Engineering does nothing; coolant stays 0).

- [ ] **Step 3: Dispatch Confirm**

In `console.ts` import `cycleCoolant` from `./heat` and change `engineeringInput`:

```ts
function engineeringInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  const c = state.stations.cursor;
  if (dir === Dir.Up) c[i] = (c[i]! + STATION_COUNT - 1) % STATION_COUNT;
  else if (dir === Dir.Down) c[i] = (c[i]! + 1) % STATION_COUNT;
  else if (dir === Dir.Right || dir === Dir.Left) {
    const target = state.derived.stationOfKind[c[i]!]!;
    if (target >= 0) shiftBar(state, target, dir === Dir.Right ? 1 : -1);
  }
  if (confirm) cycleCoolant(state, state.derived.stationOfKind[c[i]!]!);   // spec 2b-i section 5: the cursor's station after this tick's stick edge
}
```

and the dispatch line to `if (kind === StationKind.Engineering) engineeringInput(state, i, dir, it.confirmPressed);`.

- [ ] **Step 4: Run the tests, typecheck, full suite**

Run: `npx vitest run tests/console.test.ts` → PASS. `npm run typecheck` → clean. `npm test` → PASS (golden unchanged: no Engineering Confirm in the replay).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/console.ts tests/console.test.ts
git commit -m "feat: Engineering Confirm cycles the selected station's coolant; overdrive gate and property tests"
```

---

### Task 4: HUD model and Pixi HUD

**Files:**
- Modify: `src/renderer/src/render/hudModel.ts`, `src/renderer/src/render/hud.ts`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Consumes: `isOverdriven`, `coolantUsed` from `heat.ts`; `HEAT_MAX`, `COOLANT_POOL` from tuning.
- Produces: `EngineeringPanel.rows[k]` gains `heat: number` (0..1), `coolant: number`, `overdriven: boolean`; `EngineeringPanel.coolantFree: number`; `HudStation` gains `heat`, `coolant`, `overdriven`.

- [ ] **Step 1: Write the failing tests**

In `tests/hud.test.ts` update the two `toEqual` expectations and add a test (import `overdrive` from `./heat.test` is not allowed across test files; instead set `s.power.capacity = 20` and call `shiftBar` directly, importing `shiftBar` from power and `HEAT_MAX, COOLANT_POOL` from tuning):

Line 82 becomes:

```ts
    expect(m0.stations.find((st) => st.kind === StationKind.LifeSupport)).toEqual({ kind: 4, name: 'Life Support', level: 2, max: 3, online: true, occupant: null, heat: 0, coolant: 0, overdriven: false });
```

Line 99 becomes:

```ts
    expect(panel.rows[StationKind.Weapons]).toEqual({ kind: 1, name: 'Weapons', level: 2, max: 3, failed: false, heat: 0, coolant: 0, overdriven: false });
    expect(panel.coolantFree).toBe(COOLANT_POOL);
```

New test:

```ts
  it('reports heat fraction, coolant and overdrive per Engineering row and per station, and the free coolant', () => {
    const s = makeState(1);
    const eng = s.derived.stationOfKind[StationKind.Engineering]!, nav = s.derived.stationOfKind[StationKind.Navigation]!;
    s.power.capacity = 20; shiftBar(s, nav, 1); shiftBar(s, nav, 1);
    s.stations.heat[nav] = HEAT_MAX / 2; s.stations.coolant[nav] = 2; s.stations.coolant[s.derived.stationOfKind[StationKind.Science]!] = 1;
    sitDown(s, 0, eng);
    const m = buildHudModel(s, slots(1), 'running', '');
    const panel = m.players[0]!.console as EngineeringPanel;
    expect(panel.rows[StationKind.Navigation]).toEqual({ kind: 0, name: 'Navigation', level: 3, max: 2, failed: false, heat: 0.5, coolant: 2, overdriven: true });
    expect(panel.coolantFree).toBe(COOLANT_POOL - 3);
    const st = m.stations.find((x) => x.kind === StationKind.Navigation)!;
    expect(st.level).toBe(3); expect(st.max).toBe(2); expect(st.heat).toBe(0.5); expect(st.coolant).toBe(2); expect(st.overdriven).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/hud.test.ts`
Expected: FAIL (missing fields).

- [ ] **Step 3: HUD model**

In `hudModel.ts` import `isOverdriven, coolantUsed` from `../sim/heat` and `HEAT_MAX, COOLANT_POOL` from tuning; change the types:

```ts
export interface EngineeringPanel { rows: { kind: number; name: string; level: number; max: number; failed: boolean; heat: number; coolant: number; overdriven: boolean }[]; cursor: number; pool: number; coolantFree: number }
export interface HudStation { kind: number; name: string; level: number; max: number; online: boolean; occupant: number | null; heat: number; coolant: number; overdriven: boolean }
```

Add a helper and use it in both places:

```ts
function thermal(state: SimState, i: number): { heat: number; coolant: number; overdriven: boolean } {
  return i < 0 ? { heat: 0, coolant: 0, overdriven: false } : { heat: state.stations.heat[i]! / HEAT_MAX, coolant: state.stations.coolant[i]!, overdriven: isOverdriven(state, i) };
}
```

Engineering panel:

```ts
    const rows = STATION_NAMES.map((name, k) => { const si = d.stationOfKind[k]!; return { kind: k, name, level: si >= 0 ? state.stations.level[si]! : 0, max: STATION_MAX[k]!, failed: si >= 0 && state.stations.failed[si] === 1, ...thermal(state, si) }; });
    return { rows, cursor: state.stations.cursor[i]!, pool: state.power.capacity - powerUsed(state), coolantFree: COOLANT_POOL - coolantUsed(state) };
```

Station strip: `({ kind, name: STATION_NAMES[kind]!, level: state.stations.level[i]!, max: STATION_MAX[kind]!, online: stationOnline(state, i), occupant: ..., ...thermal(state, i) })`.

- [ ] **Step 4: Pixi HUD**

In `hud.ts` import `COOLANT_POOL` from tuning as well and change `cellRow`:

```ts
  const CELL = 8, MAX_CELLS = Math.max(...STATION_MAX) + 1;   // cells per row: the largest station maximum plus the overdrive cell
  const cellRow = (): { root: Container; set(o: { name: string; level: number; max: number; status: string; cursor: boolean; tint: number; failed?: boolean; heat?: number; coolant?: number }): void } => {
    const root = new Container();
    const mark = text(16, TEXT); mark.text = '>'; mark.visible = false; root.addChild(mark);
    const name = text(); name.position.set(12, 1); root.addChild(name);
    const cells = Array.from({ length: MAX_CELLS }, (_, c) => { const sp = new Sprite(assets.texture('ui.bar.bg')); sp.width = CELL; sp.height = CELL; sp.position.set(112 + c * (CELL + 2), 4); root.addChild(sp); return sp; });
    const heatBg = new Sprite(assets.texture('ui.bar.bg')); heatBg.position.set(112, 14); heatBg.width = MAX_CELLS * (CELL + 2) - 2; heatBg.height = 2; heatBg.visible = false; root.addChild(heatBg);
    const heatFill = new Sprite(assets.texture('ui.bar.fill')); heatFill.position.set(112, 14); heatFill.height = 2; heatFill.tint = WARN; heatFill.visible = false; root.addChild(heatFill);
    const status = text(16, WARN); status.position.set(150, 1); root.addChild(status);
    const coolant = text(16, DIM); coolant.position.set(196, 1); root.addChild(coolant);
    return {
      root,
      set(o) {
        mark.visible = o.cursor; name.text = o.name; name.tint = o.tint;
        const shown = Math.max(o.max, o.level);
        cells.forEach((sp, c) => { sp.visible = c < shown; sp.texture = assets.texture(c < o.level ? 'ui.bar.fill' : 'ui.bar.bg'); sp.width = CELL; sp.height = CELL; sp.tint = o.failed || c >= o.max ? WARN : 0xffffff; });   // failed stations and the overdrive cell tint their cells
        const heat = o.heat ?? 0;
        heatBg.visible = heat > 0; heatFill.visible = heat > 0; heatFill.width = Math.max(0, Math.min(1, heat)) * heatBg.width;
        status.text = o.status; status.tint = o.status === 'OFF' || o.status === 'FAIL' ? WARN : DIM;
        coolant.text = o.coolant ? `C${o.coolant}` : '';
      }
    };
  };
```

Pass the new fields where rows are set:

```ts
      c.rows.forEach((r, k) => ui.consoleRows[k]!.set({ name: r.name, level: r.level, max: r.max, status: r.failed ? 'FAIL' : '', failed: r.failed, cursor: k === c.cursor, tint: k === c.cursor ? TEXT : DIM, heat: r.heat, coolant: r.coolant }));
      ui.consoleRows.forEach((r) => { r.root.visible = true; });
      fillRow(ui.consoleFooter, [{ text: `pool ${c.pool}   coolant ${c.coolantFree}/${COOLANT_POOL}`, tint: DIM }]);
```

```ts
        if (st) powerRows[k]!.set({ name: st.name, level: st.level, max: st.max, status: st.online ? (st.occupant !== null ? `P${st.occupant + 1}` : '') : 'OFF', cursor: false, tint: st.online ? TEXT : WARN, heat: st.heat, coolant: st.coolant });
```

- [ ] **Step 5: Run the tests, typecheck, build, smoke**

Run: `npx vitest run tests/hud.test.ts tests/render.test.ts tests/renderPure.test.ts` → PASS. `npm run typecheck` → clean. `npm run build` → clean. `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/hudModel.ts src/renderer/src/render/hud.ts tests/hud.test.ts
git commit -m "feat: HUD shows overdrive cells, heat bars, coolant units and the free coolant pool"
```

---

### Task 5: Gate, spec amendments, ledger

**Files:**
- Modify: `docs/gates.md`, `docs/superpowers/specs/2026-11-10-overdrive-heat-coolant-design.md`

- [ ] **Step 1: Gate section**

Append to `docs/gates.md`:

```markdown
## Increment 2b-i: overdrive, heat and coolant
- [x] `npm test` passes: heat (overdrive ceiling, output past 1, rise/cool rates, hold with two units, idle decay, overheat with one hazards draw and the fire chance), power (max + 1), console (coolant cycle, pool wrap, Engineering row, seating Confirm, fast-check invariants, scripted overdrive gate), snapshot round trip of heat and coolant with version-3 rejection, HUD model (row and strip thermal fields, free coolant).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 unchanged (no spawner or tuning change outside the new constants).
- [ ] Manual, two players (`npm run dev`): from Engineering (C(18,9)) take a bar from Life Support (Left) and push Weapons (B(7,2)) to a fourth cell drawn in the warning tint; its heat bar climbs; two Confirms show `C2` and the bar stops; Confirm again to `C0` and within about 10 s `Power: Weapons` appears in the threats with the Weapons operator stood up; at least one overheat starts a fire in the console's room over two attempts (50% each). Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.
```

- [ ] **Step 2: Spec amendments**

Append to the spec:

```markdown
## 11. Amendments from the plan
- `maxLevel(kind)` lives in `sim/power.ts` next to `shiftBar` (section 2 put it in `heat.ts`); `heat.ts` imports `failStation` from `power.ts`, so the reverse placement would make an import cycle.
- `coolingPerUnit(state)` returns `HEAT_COOL_UNIT` with the skill term deferred to increment 3 (section 5 describes the future formula).
- The Pixi heat bar is a 2 px strip under the cells rather than reusing `bar()` (section 7), so it fits inside the 18 px row.
- The `overdrive(state, kind)` test helper lives in `tests/helpers/sim.ts` and widens `power.capacity` to 20 so heat fixtures never fight the pool; the spawner-cap fixture uses two breaches rather than fires because `fireStep` draws spread rolls from `rng.hazards` and would move the pinned overheat draw.
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck`, `npm test`, `npm run build` → all pass.

```bash
git add docs/gates.md docs/superpowers/specs/2026-11-10-overdrive-heat-coolant-design.md
git commit -m "docs: increment 2b-i gate and spec amendments"
```
