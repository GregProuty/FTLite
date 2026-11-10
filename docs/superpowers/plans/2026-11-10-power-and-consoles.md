# Power and Consoles (Increment 2a-i) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the always-on oxygen injector with a reactor power model, seated console control mode, four working consoles (Engineering, Life Support, Medbay, Doors), three seatable power sinks, and a power-failure hazard, per `docs/superpowers/specs/2026-11-10-power-and-consoles-design.md`.

**Architecture:** Stations are a fixed set of seven indexed in ship-data order and live as typed arrays in `SimState.stations`; a `Seated` component on crew holds the station index. One new sim step, `consoleSystem`, runs between `interactSystem` and `movementSystem`, derives stick edges from `move` inside the sim, and applies a tick-scoped door-toggle set shared with local door Confirms. Forced stands happen at the point of change (`failStation`, Engineering cutting a station to 0, Downed). The HUD model gains seated panels, a power strip and power threats; the Pixi HUD, crew sprites and effects render them.

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), zod 3, bitecs 0.4 (components only), Pixi 8.19 (render tasks only). No new dependencies.

## Spec amendments made by this plan (recorded in Task 7)

- Repair completion for a power failure is applied inside `interactSystem` like fire and breach repairs; there is no separate `powerStep` (spec §2 listed one).
- A seated crew member without the `crew.sit` frame uses the idle frame facing down (the crew is snapped onto the console tile, so there is no direction "toward" it).
- The golden replay is re-blessed in a task's final commit whenever that task changes layout identity, sim version or simulation results (Tasks 1, 2, 3, 4 each may), with the cause in the commit message and the ledger. Spec §11 said "once".

## Global Constraints

- No file under `src/renderer/src/input/` changes. `tests/boundary.test.ts` stays green: `sim/` and `shared/` import nothing from render/, input/, app/, pixi, electron; no `Math.random`, `Date`, `performance.now`, `Math.sin/cos/atan2/pow/hypot`, `window`, `document` in sim/ or shared/, even in comments.
- Every test runs under node; no test imports pixi, and no file a test imports does.
- Determinism: all randomness comes from `state.rng.<stream>`; all new per-run state is in `SimState`, flattened, snapshotted and hashed. `SIM_VERSION` becomes `2`.
- `StationKind`: `Navigation = 0, Weapons = 1, Science = 2, Engineering = 3, LifeSupport = 4, Medbay = 5, Doors = 6`. Station ids in ship data: `navigation, weapons, science, engineering, lifeSupport, medbay, doors`, each exactly once.
- Tuning (first pass): `REACTOR_CAPACITY = 10`; `STATION_MAX = [2, 3, 2, 1, 3, 2, 1]` by kind; starter allocation `[nav 1, wpn 2, sci 1, eng 1, ls 2, med 1, doors 1]` (sum 9); `OUTPUT_SLOW = 0.5`, `OUTPUT_FAST = 1.0`; `INJECT_FRAC = 0.06`; `LS_SEATED_BONUS = 0.5`; `MEDBAY_HEAL = 4`; `MEDBAY_SEATED_BONUS = 0.5`; `REPAIR_TIME_POWER = 6`; `STICK_EDGE_THRESHOLD = 0.5`; `STICK_REPEAT_TICKS = 8`; `SPAWN_WEIGHTS = { fire: 2, breach: 1, power: 1 }`.
- `stationOnline(i) = !failed[i] && level[i] > 0`. `stationOutput(i) = (level/max) × lerp(OUTPUT_SLOW, OUTPUT_FAST, (skill + 10) / 20)` with `skillLevel()` returning 0.
- Sitting: Confirm edge, console within `REACH`, crew centre tile in the same room as the console tile, station online and unoccupied, player Conscious and not seated; lowest `PlayerId` wins a tie; the seating Confirm is consumed (no console action that tick). Standing: `interactPressed` or `cancelPressed` edge; a stand edge wins over Confirm and stick edges that tick. Forced stand on `failStation`, on Engineering cutting a station to level 0, and on Downed. Sit and stand reset the player's `heldDir` and `repeat` to 0.
- Stick edges: dominant axis (ties horizontal) beyond `0.5` fires one edge on crossing or direction change and sets `repeat = 8`; while held, every 8th tick fires again. `moveY > 0` is Down.
- Engineering: `cursor` is a `StationKind`; up/down wrap over the seven kinds; right `+1` bar if pool > 0, level < max and not failed; left `−1` if level > 0 (Engineering never below 1); refused entirely while Engineering is failed. Doors: `cursor` indexes `derived.doorEdges` or is `-1` when the ship has no doors; any direction cycles; Confirm adds the door to the tick's toggle set. Door toggles (local and remote) apply once per door per tick, ascending edge order, at the end of `consoleSystem`.
- Power failure: `failed = 1`, `repair = 0`, level → 0 except Engineering (keeps its level, allocations frozen while failed); occupant stands. Repair at `1 / REPAIR_TIME_POWER` per second per repairer, within `REACH` of the station tile; on completion `failed = 0`, Engineering is back online at its kept level (≥ 1), others at 0.
- Life Support injection per hazard tick per non-breached room: `INJECT_FRAC × volume × HAZARD_DT × stationOutput × (occupied ? 1.5 : 1)`. Medbay per tick: Conscious crew in the Medbay room heal `MEDBAY_HEAL × DT × stationOutput × (occupied ? 1.5 : 1)` up to `HEALTH_MAX`.
- Commit messages: imperative, prefixed `feat:`, `test:`, `chore:`, `spec:` or `docs:`; the agent's attribution line as the session requires.
- `npm run typecheck`, `npm test` and `npm run build` pass at the end of every task.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/stationKinds.ts` (new) | `StationKind`, `STATION_COUNT`, `STATION_IDS`, `STATION_NAMES`, `kindOfStationId`. Pure constants, imported by schema, derived and render. |
| `src/renderer/src/sim/skills.ts` (new) | `skillLevel()` stub returning 0 (Increment 3 replaces it). |
| `src/renderer/src/sim/stations.ts` (new) | `stationOnline`, `stationOutput`, `sitDown`, `standUp`, `failedStationCount`. |
| `src/renderer/src/sim/power.ts` (new) | `powerUsed`, `powerPool`, `failStation`, `repairStation`, `shiftBar`. |
| `src/renderer/src/sim/console.ts` (new) | `Dir`, `stickEdge`, `consoleSystem`. |
| `src/renderer/src/sim/hazards/lifeSupport.ts` (new) | `lifeSupportInjection`. |
| `src/renderer/src/sim/hazards/spawner.ts` (renamed from `stub.ts`) | `activeHazardCount`, `spawner`. |
| `src/renderer/src/sim/medbay.ts` (new) | `medbayStep`. |
| `src/renderer/src/sim/{components,state,flatten,step,interact,movement,crew,tuning}.ts`, `ship/{schema,derived}.ts`, `ship/starter.json` | Modified as the tasks say. |
| `src/renderer/src/render/{hudModel,hud,crewSprites,effects,fallback}.ts` | HUD and ship-view additions. |
| `tests/{power,stick,console,lifeSupport,medbay,spawner}.test.ts` (new), `tests/{ship,snapshot,interact,hud}.test.ts`, `tests/helpers/bot.ts` | Tests and the bot's new goal. |
| `docs/gates.md`, spec amendments | Task 7. |

---

### Task 1: Station kinds, ship validation and layout identity

**Files:**
- Create: `src/renderer/src/sim/stationKinds.ts`
- Modify: `src/renderer/src/sim/tuning.ts`, `src/renderer/src/sim/ship/schema.ts`, `src/renderer/src/sim/ship/derived.ts`, `src/renderer/src/sim/ship/starter.json`
- Test: `tests/ship.test.ts`

**Interfaces:**
- Produces: `StationKind`, `STATION_COUNT = 7`, `STATION_IDS`, `STATION_NAMES`, `kindOfStationId(id): number`; tuning `REACTOR_CAPACITY`, `STATION_MAX`; `Derived.stationKind: Uint8Array`, `stationRoom: Int16Array`, `stationTile: Int32Array`, `stationOfKind: Int8Array` (kind → station index), `doorEdges: number[]`; ship `stations[i].allocation: number`.

- [ ] **Step 1: Write the failing ship tests**

Append inside `describe('ship schema')` in `tests/ship.test.ts`:

```ts
  it('derives station kinds, tiles, kind lookup and door edges', () => {
    const d = deriveLayout(parseShip(starter));
    expect(Array.from(d.stationKind)).toEqual([0, 6, 1, 2, 5, 4, 3]);          // starter order: nav, doors, wpn, sci, med, ls, eng
    expect(Array.from(d.stationOfKind)).toEqual([0, 2, 3, 6, 5, 4, 1]);
    expect(d.stationTile[6]).toBe(9 * 25 + 18);
    expect(d.stationRoom[6]).toBe(d.roomIndex.get('C'));
    expect(d.doorEdges).toHaveLength(8);
    expect(d.doorEdges.every((e) => d.edgeIsDoor[e] === 1)).toBe(true);
  });
  it('rejects an unknown station id, a missing kind, a fractional or over-max allocation, Engineering below 1, and a budget over capacity', () => {
    let s = clone(); (s.stations[0] as { id: string }).id = 'radar';
    expect(() => parseShip(s)).toThrow(/station/);
    s = clone(); s.stations.pop();
    expect(() => parseShip(s)).toThrow(/exactly 7/);
    s = clone(); s.stations[0]!.allocation = 1.5;
    expect(() => parseShip(s)).toThrow(/allocation/);
    s = clone(); s.stations[0]!.allocation = 3;                                    // navigation max is 2
    expect(() => parseShip(s)).toThrow(/exceeds max/);
    s = clone(); s.stations.find((st) => st.id === 'engineering')!.allocation = 0;
    expect(() => parseShip(s)).toThrow(/engineering/);
    s = clone(); s.stations.find((st) => st.id === 'weapons')!.allocation = 3; s.stations.find((st) => st.id === 'lifeSupport')!.allocation = 3;   // 9 + 1 + 1 = 11 > 10
    expect(() => parseShip(s)).toThrow(/capacity/);
  });
  it('layout identity changes when station kinds or allocations change', () => {
    const base = deriveLayout(parseShip(starter)).layoutHash;
    const a = clone(); a.stations.find((st) => st.id === 'navigation')!.allocation = 2;
    expect(deriveLayout(parseShip(a)).layoutHash).not.toBe(base);
    const b = clone(); const nav = b.stations.find((st) => st.id === 'navigation')!, sci = b.stations.find((st) => st.id === 'science')!;
    [nav.room, sci.room] = [sci.room, nav.room]; [nav.tile, sci.tile] = [sci.tile, nav.tile];       // same tiles, swapped kinds, equal allocations
    expect(deriveLayout(parseShip(b)).layoutHash).not.toBe(base);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/ship.test.ts`
Expected: FAIL (`stationKind` undefined; unknown id accepted).

- [ ] **Step 3: Add the kind constants and tuning**

Create `src/renderer/src/sim/stationKinds.ts`:

```ts
/** The seven consoles. The numeric order is the Engineering list order (spec §3). */
export const StationKind = { Navigation: 0, Weapons: 1, Science: 2, Engineering: 3, LifeSupport: 4, Medbay: 5, Doors: 6 } as const;
export const STATION_COUNT = 7;
/** Ship-data ids, indexed by kind. */
export const STATION_IDS = ['navigation', 'weapons', 'science', 'engineering', 'lifeSupport', 'medbay', 'doors'] as const;
export const STATION_NAMES = ['Navigation', 'Weapons', 'Science', 'Engineering', 'Life Support', 'Medbay', 'Doors'] as const;
export function kindOfStationId(id: string): number { return (STATION_IDS as readonly string[]).indexOf(id); }
```

Append to `src/renderer/src/sim/tuning.ts`:

```ts
// Power (increment 2a-i)
export const REACTOR_CAPACITY = 10;                 // bars, including Engineering's reserved one
export const STATION_MAX = [2, 3, 2, 1, 3, 2, 1] as const;   // by StationKind: Nav, Wpn, Sci, Eng, LS, Med, Doors (sum 14 > capacity: choices are forced)
```

- [ ] **Step 4: Validate stations in the schema**

In `src/renderer/src/sim/ship/schema.ts` add imports and replace the `stations` line and the duplicate-id check:

```ts
import { STATION_IDS, StationKind } from '../stationKinds';
import { STATION_MAX, REACTOR_CAPACITY } from '../tuning';
```

```ts
  stations: z.array(z.object({
    id: z.enum(STATION_IDS, { errorMap: () => ({ message: `station id must be one of ${STATION_IDS.join(', ')}` }) }),
    room: z.string().length(1), tile,
    allocation: z.number().int('station allocation must be an integer').min(0, 'station allocation must be >= 0')
  })),
```

Replace `if (new Set(s.stations.map((st) => st.id)).size !== s.stations.length) return fail('stations: duplicate station id');` with:

```ts
  if (new Set(s.stations.map((st) => st.id)).size !== s.stations.length) return fail('stations: duplicate station id');
  if (s.stations.length !== STATION_IDS.length) return fail(`stations: expected exactly ${STATION_IDS.length} stations, one per kind`);
  let budget = 0;
  for (const st of s.stations) {
    const kind = STATION_IDS.indexOf(st.id);
    if (st.allocation > STATION_MAX[kind]!) return fail(`station ${st.id}: allocation ${st.allocation} exceeds max ${STATION_MAX[kind]}`);
    if (kind === StationKind.Engineering && st.allocation < 1) return fail('station engineering: allocation must be at least 1');
    budget += st.allocation;
  }
  if (budget > REACTOR_CAPACITY) return fail(`stations: total allocation ${budget} exceeds reactor capacity ${REACTOR_CAPACITY}`);
```

- [ ] **Step 5: Derive station tables and widen the layout hash**

In `src/renderer/src/sim/ship/derived.ts` add the import and fields:

```ts
import { STATION_COUNT, kindOfStationId } from '../stationKinds';
```

Add to `Derived`:

```ts
  stationKind: Uint8Array; stationRoom: Int16Array; stationTile: Int32Array;
  stationOfKind: Int8Array;   // kind -> station index
  doorEdges: number[];        // edge indices that are doors, ascending
```

After the breach-site block and before the `codes` hash, add:

```ts
  const N = layout.stations.length;
  const stationKind = new Uint8Array(N), stationRoom = new Int16Array(N), stationTile = new Int32Array(N), stationOfKind = new Int8Array(STATION_COUNT).fill(-1);
  layout.stations.forEach((st, i) => {
    const k = kindOfStationId(st.id);
    stationKind[i] = k; stationRoom[i] = roomIndex.get(st.room)!; stationTile[i] = st.tile[1] * width + st.tile[0]; stationOfKind[k] = i;
  });
  const doorEdges: number[] = [];
  for (let i = 0; i < E; i++) if (edgeIsDoor[i]) doorEdges.push(i);
```

Replace the stations hash line with:

```ts
  for (const st of layout.stations) codes.push(roomIndex.get(st.room)!, st.tile[1] * width + st.tile[0], kindOfStationId(st.id), st.allocation);
```

Add `stationKind, stationRoom, stationTile, stationOfKind, doorEdges,` to the returned object.

- [ ] **Step 6: Give the starter ship its allocations**

In `src/renderer/src/sim/ship/starter.json` replace the `stations` array:

```json
  "stations": [
    { "id": "navigation", "room": "A", "tile": [2, 2], "allocation": 1 },
    { "id": "doors", "room": "A", "tile": [3, 1], "allocation": 1 },
    { "id": "weapons", "room": "B", "tile": [7, 2], "allocation": 2 },
    { "id": "science", "room": "D", "tile": [12, 2], "allocation": 1 },
    { "id": "medbay", "room": "F", "tile": [17, 2], "allocation": 1 },
    { "id": "lifeSupport", "room": "E", "tile": [10, 9], "allocation": 2 },
    { "id": "engineering", "room": "C", "tile": [18, 9], "allocation": 1 }
  ],
```

- [ ] **Step 7: Run the suite; re-bless the golden**

Run: `npx vitest run tests/ship.test.ts` → PASS. Run `npm test`: `tests/golden.test.ts` fails on the layout hash (expected: the identity now includes kinds and allocations). Run `npm run bless`, then `npm test && npm run typecheck && npm run build` → all pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/stationKinds.ts src/renderer/src/sim/tuning.ts src/renderer/src/sim/ship tests/ship.test.ts tests/golden/basic.json
git commit -m "feat: station kinds, allocations and validation in ship data; layout identity covers them (golden re-blessed: layout hash)"
```

---

### Task 2: Station state, power helpers, snapshot coverage

**Files:**
- Create: `src/renderer/src/sim/skills.ts`, `src/renderer/src/sim/stations.ts`, `src/renderer/src/sim/power.ts`
- Modify: `src/renderer/src/sim/components.ts`, `state.ts`, `flatten.ts`, `tuning.ts`
- Test: `tests/power.test.ts` (new), `tests/snapshot.test.ts`

**Interfaces:**
- Consumes: Task 1's `Derived` fields and `StationKind`.
- Produces: `Seated.station[eid]`; `SimState.stations { level: Uint8Array; failed: Uint8Array; repair: Float64Array; occupant: Int8Array; cursor: Int16Array }`, `SimState.power { capacity }`, `SimState.stick { heldDir: Int8Array; repeat: Int16Array }`, `SimState.scratch { doorToggles: Set<number>; satThisTick: Uint8Array }`; `skillLevel(state, pid, kind): number`; `stationOnline(state, i)`, `stationOutput(state, i)`, `sitDown(state, pid, i)`, `standUp(state, pid)`, `failedStationCount(state)`; `powerUsed`, `powerPool`, `failStation(state, i)`, `repairStation(state, i)`, `shiftBar(state, i, delta): boolean`; `SIM_VERSION = 2`.

- [ ] **Step 1: Write the failing power tests**

Create `tests/power.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Seated, Position } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { stationOnline, stationOutput, sitDown, standUp } from '../src/renderer/src/sim/stations';
import { powerPool, powerUsed, failStation, repairStation, shiftBar } from '../src/renderer/src/sim/power';
import { REACTOR_CAPACITY, STATION_MAX, OUTPUT_SLOW, OUTPUT_FAST } from '../src/renderer/src/sim/tuning';
import { makeState } from './helpers/sim';

const idx = (s: ReturnType<typeof makeState>, kind: number) => s.derived.stationOfKind[kind]!;

describe('power model', () => {
  it('starts at the ship allocation with one spare bar', () => {
    const s = makeState(2);
    expect(powerUsed(s)).toBe(9); expect(powerPool(s)).toBe(REACTOR_CAPACITY - 9);
    expect(s.stations.level[idx(s, StationKind.LifeSupport)]).toBe(2);
    expect(Array.from(s.stations.occupant)).toEqual([-1, -1, -1, -1, -1, -1, -1]);
    expect(Seated.station[s.crew[0]!]).toBe(-1);
  });
  it('output scales with level over max at the skill-0 midpoint; offline is 0', () => {
    const s = makeState(1), ls = idx(s, StationKind.LifeSupport);
    const mid = (OUTPUT_SLOW + OUTPUT_FAST) / 2;
    expect(stationOutput(s, ls)).toBeCloseTo((2 / STATION_MAX[StationKind.LifeSupport]) * mid);
    s.stations.level[ls] = 0;
    expect(stationOnline(s, ls)).toBe(false); expect(stationOutput(s, ls)).toBe(0);
  });
  it('shiftBar obeys the pool, the max, the Engineering floor and the failed flag', () => {
    const s = makeState(1), nav = idx(s, StationKind.Navigation), eng = idx(s, StationKind.Engineering), wpn = idx(s, StationKind.Weapons);
    expect(shiftBar(s, nav, 1)).toBe(true); expect(powerPool(s)).toBe(0);
    expect(shiftBar(s, nav, 1)).toBe(false);                         // max 2 and pool 0
    expect(shiftBar(s, wpn, -1)).toBe(true); expect(powerPool(s)).toBe(1);
    expect(shiftBar(s, wpn, 1)).toBe(true); expect(shiftBar(s, wpn, 1)).toBe(false);   // back at max 3
    expect(shiftBar(s, eng, -1)).toBe(false);                        // never below 1
    failStation(s, nav);
    expect(shiftBar(s, nav, 1)).toBe(false);                         // failed stations take no bars
    failStation(s, eng);
    expect(shiftBar(s, wpn, -1)).toBe(false);                        // allocations frozen while Engineering is failed
  });
  it('failure returns bars except for Engineering, repair restores Engineering at its level and others at 0', () => {
    const s = makeState(1), ls = idx(s, StationKind.LifeSupport), eng = idx(s, StationKind.Engineering);
    const before = powerPool(s);
    failStation(s, ls);
    expect(s.stations.level[ls]).toBe(0); expect(powerPool(s)).toBe(before + 2); expect(stationOnline(s, ls)).toBe(false);
    repairStation(s, ls);
    expect(s.stations.failed[ls]).toBe(0); expect(s.stations.level[ls]).toBe(0); expect(stationOnline(s, ls)).toBe(false);
    failStation(s, eng);
    expect(s.stations.level[eng]).toBe(1); expect(stationOnline(s, eng)).toBe(false);
    repairStation(s, eng);
    expect(stationOnline(s, eng)).toBe(true); expect(s.stations.level[eng]).toBe(1);
  });
  it('sitDown snaps to the console tile and sets the cursor; standUp and failure clear the seat', () => {
    const s = makeState(2), eng = idx(s, StationKind.Engineering), doors = idx(s, StationKind.Doors);
    sitDown(s, 0, eng);
    expect(Seated.station[s.crew[0]!]).toBe(eng); expect(s.stations.occupant[eng]).toBe(0);
    expect(Position.x[s.crew[0]!]).toBe(18.5); expect(Position.y[s.crew[0]!]).toBe(9.5);
    expect(s.stations.cursor[eng]).toBe(StationKind.Engineering);
    sitDown(s, 1, doors);
    expect(s.stations.cursor[doors]).toBe(0);
    standUp(s, 0);
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[eng]).toBe(-1);
    failStation(s, doors);
    expect(Seated.station[s.crew[1]!]).toBe(-1); expect(s.stations.occupant[doors]).toBe(-1);
  });
  it('Engineering cutting a station to level 0 stands its occupant', () => {
    const s = makeState(2), nav = idx(s, StationKind.Navigation);
    sitDown(s, 1, nav);
    expect(shiftBar(s, nav, -1)).toBe(true);
    expect(s.stations.level[nav]).toBe(0); expect(Seated.station[s.crew[1]!]).toBe(-1); expect(s.stations.occupant[nav]).toBe(-1);
  });
});
```

Append to `tests/snapshot.test.ts` inside `describe('snapshot')`:

```ts
  it('round-trips seating, power and stick state', () => {
    const s = makeState(2, 5);
    const eng = s.derived.stationOfKind[3]!;
    sitDown(s, 0, eng); s.stations.cursor[eng] = 5; s.stations.failed[1] = 1; s.stations.repair[1] = 0.25; s.stations.level[2] = 0; s.stick.heldDir[0] = 2; s.stick.repeat[0] = 3;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(hashState(t)).toBe(hashState(s));
    expect(Seated.station[t.crew[0]!]).toBe(eng); expect(t.stations.occupant[eng]).toBe(0); expect(t.stations.cursor[eng]).toBe(5);
    expect(t.stations.failed[1]).toBe(1); expect(t.stations.repair[1]).toBe(0.25); expect(t.stick.heldDir[0]).toBe(2); expect(t.stick.repeat[0]).toBe(3);
  });
```

with imports `import { Seated } from '../src/renderer/src/sim/components';` and `import { sitDown } from '../src/renderer/src/sim/stations';` (merge `Seated` into the existing components import line).

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/power.test.ts tests/snapshot.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Tuning, component, state**

Append to `src/renderer/src/sim/tuning.ts` and set `SIM_VERSION = 2`:

```ts
export const OUTPUT_SLOW = 0.5, OUTPUT_FAST = 1.0;   // station output multiplier at skill 0..10 via lerp((skill + 10) / 20)
export const REPAIR_TIME_POWER = 6;                 // seconds for one repairer
export const STICK_EDGE_THRESHOLD = 0.5;
export const STICK_REPEAT_TICKS = 8;                // ~130 ms
```

Append to `src/renderer/src/sim/components.ts`:

```ts
export const Seated = { station: [] as number[] };   // station index while seated, else -1
```

In `src/renderer/src/sim/state.ts`: import `Seated` from components, `REACTOR_CAPACITY` from tuning; add to `SimState`:

```ts
  stations: { level: Uint8Array; failed: Uint8Array; repair: Float64Array; occupant: Int8Array; cursor: Int16Array };
  power: { capacity: number };
  stick: { heldDir: Int8Array; repeat: Int16Array };   // per player: 0 none, 1 up, 2 down, 3 left, 4 right; ticks until the next repeat edge
  /** Tick-scoped scratch (not snapshotted): cleared at the start of every step. */
  scratch: { doorToggles: Set<number>; satThisTick: Uint8Array };
```

In `createSimState`, after `const R = ...` add `const N = layout.stations.length;` and to the literal:

```ts
    stations: { level: Uint8Array.from(layout.stations.map((st) => st.allocation)), failed: new Uint8Array(N), repair: new Float64Array(N), occupant: new Int8Array(N).fill(-1), cursor: new Int16Array(N) },
    power: { capacity: REACTOR_CAPACITY },
    stick: { heldDir: new Int8Array(playerCount), repeat: new Int16Array(playerCount) },
    scratch: { doorToggles: new Set<number>(), satThisTick: new Uint8Array(playerCount) },
```

In `spawnCrew` add `addComponent(state.world, eid, Seated); Seated.station[eid] = -1;`.

- [ ] **Step 4: Flatten the new state**

In `src/renderer/src/sim/flatten.ts`: import `Seated`; `FLATTEN_MANIFEST = ['header', 'rng', 'rooms', 'doors', 'breaches', 'o2Counters', 'spawner', 'stations', 'power', 'stick', 'crew']`; `CREW_FIELDS = 9`; add `STATION_FIELDS = 5, POWER_FIELDS = 1, STICK_FIELDS = 2`; in `size` add `+ s.stations.level.length * STATION_FIELDS + POWER_FIELDS + s.playerCount * STICK_FIELDS`. In `flatten`, after `put(s.spawner.nextSpawnTick);`:

```ts
  for (const v of s.stations.level) put(v); for (const v of s.stations.failed) put(v); for (const v of s.stations.repair) put(v);
  for (const v of s.stations.occupant) put(v); for (const v of s.stations.cursor) put(v);
  put(s.power.capacity);
  for (let p = 0; p < s.playerCount; p++) put(s.stick.heldDir[p]!); for (let p = 0; p < s.playerCount; p++) put(s.stick.repeat[p]!);
```

and in the crew loop append `put(Seated.station[eid]!);`. Mirror in `unflatten` after `s.spawner.nextSpawnTick = get();`:

```ts
  for (let i = 0; i < s.stations.level.length; i++) s.stations.level[i] = get();
  for (let i = 0; i < s.stations.failed.length; i++) s.stations.failed[i] = get();
  for (let i = 0; i < s.stations.repair.length; i++) s.stations.repair[i] = get();
  for (let i = 0; i < s.stations.occupant.length; i++) s.stations.occupant[i] = get();
  for (let i = 0; i < s.stations.cursor.length; i++) s.stations.cursor[i] = get();
  s.power.capacity = get();
  for (let p = 0; p < s.playerCount; p++) s.stick.heldDir[p] = get(); for (let p = 0; p < s.playerCount; p++) s.stick.repeat[p] = get();
```

and in the crew loop `Seated.station[eid] = get();`.

- [ ] **Step 5: Skills stub, station helpers, power module**

Create `src/renderer/src/sim/skills.ts`:

```ts
import type { SimState } from './state';

/** Increment 3 replaces this with real levels. Until then every operator is level 0 (spec §1). */
export function skillLevel(_state: SimState, _pid: number, _kind: number): number { return 0; }
```

Create `src/renderer/src/sim/stations.ts`:

```ts
import type { SimState } from './state';
import { Position, Seated } from './components';
import { StationKind } from './stationKinds';
import { STATION_MAX, OUTPUT_SLOW, OUTPUT_FAST } from './tuning';
import { skillLevel } from './skills';

export function stationOnline(state: SimState, i: number): boolean {
  return state.stations.failed[i] === 0 && state.stations.level[i]! > 0;
}

/** Effect multiplier in [0, 1]: level over max, times the skill curve (spec §5). Offline is 0. */
export function stationOutput(state: SimState, i: number): number {
  if (!stationOnline(state, i)) return 0;
  const kind = state.derived.stationKind[i]!, occ = state.stations.occupant[i]!;
  const skill = occ >= 0 ? skillLevel(state, occ, kind) : 0;
  const curve = OUTPUT_SLOW + (OUTPUT_FAST - OUTPUT_SLOW) * ((skill + 10) / 20);
  return (state.stations.level[i]! / STATION_MAX[kind]!) * curve;
}

export function failedStationCount(state: SimState): number {
  let n = 0; for (const f of state.stations.failed) if (f) n++; return n;
}

/** Seat a player: snap to the console tile centre, reset stick state, reset the cursor per kind (spec §4). */
export function sitDown(state: SimState, pid: number, i: number): void {
  const eid = state.crew[pid]!, d = state.derived;
  Seated.station[eid] = i; state.stations.occupant[i] = pid;
  const t = d.stationTile[i]!, tx = t % d.width;
  Position.x[eid] = tx + 0.5; Position.y[eid] = (t - tx) / d.width + 0.5;
  state.stick.heldDir[pid] = 0; state.stick.repeat[pid] = 0;
  const kind = d.stationKind[i]!;
  state.stations.cursor[i] = kind === StationKind.Engineering ? StationKind.Engineering : kind === StationKind.Doors ? (d.doorEdges.length ? 0 : -1) : 0;
}

/** Stand a player up (voluntary or forced). No-op when not seated. */
export function standUp(state: SimState, pid: number): void {
  const eid = state.crew[pid]!, i = Seated.station[eid]!;
  if (i < 0) return;
  Seated.station[eid] = -1; state.stations.occupant[i] = -1;
  state.stick.heldDir[pid] = 0; state.stick.repeat[pid] = 0;
}
```

Create `src/renderer/src/sim/power.ts`:

```ts
import type { SimState } from './state';
import { StationKind } from './stationKinds';
import { STATION_MAX } from './tuning';
import { standUp } from './stations';

export function powerUsed(state: SimState): number { let t = 0; for (const v of state.stations.level) t += v; return t; }
export function powerPool(state: SimState): number { return state.power.capacity - powerUsed(state); }

/** Power failure: offline until repaired. Bars return to the pool except Engineering's, which keeps its level frozen (spec §5). */
export function failStation(state: SimState, i: number): void {
  state.stations.failed[i] = 1; state.stations.repair[i] = 0;
  if (state.derived.stationKind[i] !== StationKind.Engineering) state.stations.level[i] = 0;
  const occ = state.stations.occupant[i]!;
  if (occ >= 0) standUp(state, occ);
}

/** Repair complete: Engineering comes back at its kept level (>= 1); any other station comes back at level 0. */
export function repairStation(state: SimState, i: number): void {
  state.stations.failed[i] = 0; state.stations.repair[i] = 0;
}

/** Engineering operator moves one bar to (+1) or from (-1) station i. Returns whether the allocation changed. */
export function shiftBar(state: SimState, i: number, delta: 1 | -1): boolean {
  const d = state.derived, eng = d.stationOfKind[StationKind.Engineering]!;
  if (state.stations.failed[eng]) return false;                       // allocations frozen while Engineering is failed
  if (state.stations.failed[i]) return false;
  const kind = d.stationKind[i]!, level = state.stations.level[i]!;
  if (delta > 0) {
    if (level >= STATION_MAX[kind]! || powerPool(state) <= 0) return false;
    state.stations.level[i] = level + 1; return true;
  }
  const floor = kind === StationKind.Engineering ? 1 : 0;
  if (level <= floor) return false;
  state.stations.level[i] = level - 1;
  if (level - 1 === 0) { const occ = state.stations.occupant[i]!; if (occ >= 0) standUp(state, occ); }
  return true;
}
```

- [ ] **Step 6: Run the tests, re-bless, full suite**

Run: `npx vitest run tests/power.test.ts tests/snapshot.test.ts` → PASS. `npm test` fails only on the golden (sim version 2); run `npm run bless`; then `npm test && npm run typecheck && npm run build` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim tests/power.test.ts tests/snapshot.test.ts tests/golden/basic.json
git commit -m "feat: station, power and stick state with snapshot coverage; power helpers (golden re-blessed: sim version 2)"
```

---

### Task 3: Control mode: sitting, stick edges, console dispatch, forced stands

**Files:**
- Create: `src/renderer/src/sim/console.ts`
- Modify: `src/renderer/src/sim/interact.ts`, `movement.ts`, `crew.ts`, `step.ts`
- Test: `tests/stick.test.ts` (new), `tests/console.test.ts` (new), `tests/interact.test.ts`

**Interfaces:**
- Consumes: Task 2 helpers and state.
- Produces: `ConfirmKind.Console = 2`; `TargetKind.Power = 4`; `Dir = { None: 0, Up: 1, Down: 2, Left: 3, Right: 4 }`; `stickEdge(state, pid, moveX, moveY): number`; `consoleSystem(state, intents)`; `interactSystem` seats players and collects door toggles into `state.scratch.doorToggles`; `step()` clears scratch and runs `consoleSystem` after `interactSystem`.

- [ ] **Step 1: Write the failing stick-edge tests**

Create `tests/stick.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stickEdge, Dir } from '../src/renderer/src/sim/console';
import { STICK_REPEAT_TICKS } from '../src/renderer/src/sim/tuning';
import { makeState } from './helpers/sim';

describe('stickEdge', () => {
  it('fires once on crossing, then every STICK_REPEAT_TICKS while held', () => {
    const s = makeState(1);
    const fired: number[] = [];
    for (let t = 0; t < 3 * STICK_REPEAT_TICKS + 1; t++) if (stickEdge(s, 0, 0, 1) === Dir.Down) fired.push(t);
    expect(fired).toEqual([0, 8, 16, 24]);
  });
  it('nothing below the threshold, and releasing resets so the next push fires at once', () => {
    const s = makeState(1);
    expect(stickEdge(s, 0, 0.4, 0.3)).toBe(Dir.None);
    expect(stickEdge(s, 0, 1, 0)).toBe(Dir.Right);
    expect(stickEdge(s, 0, 0, 0)).toBe(Dir.None);
    expect(stickEdge(s, 0, 1, 0)).toBe(Dir.Right);
    expect(s.stick.heldDir[0]).toBe(Dir.Right); expect(s.stick.repeat[0]).toBe(STICK_REPEAT_TICKS);
  });
  it('dominant axis wins, ties go horizontal, a direction change fires immediately', () => {
    const s = makeState(1);
    expect(stickEdge(s, 0, -0.9, 0.6)).toBe(Dir.Left);
    expect(stickEdge(s, 0, 0.6, -0.9)).toBe(Dir.Up);       // change: immediate
    expect(stickEdge(s, 0, 0.6, -0.9)).toBe(Dir.None);     // held: waits for the repeat
    expect(stickEdge(s, 0, 0.7, 0.7)).toBe(Dir.Right);     // tie -> horizontal
  });
});
```

- [ ] **Step 2: Write the failing console and interact tests**

Create `tests/console.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Seated, Position, Life, LifeState, Health } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { confirmTarget, ConfirmKind, interactTarget, TargetKind } from '../src/renderer/src/sim/interact';
import { failStation, powerPool } from '../src/renderer/src/sim/power';
import { sitDown } from '../src/renderer/src/sim/stations';
import { DoorState } from '../src/renderer/src/sim/grid';
import { hashState } from '../src/renderer/src/sim/hash';
import { REPAIR_TIME_POWER, STICK_REPEAT_TICKS } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, teleport, seconds } from './helpers/sim';

const idx = (s: ReturnType<typeof makeState>, kind: number) => s.derived.stationOfKind[kind]!;
const at = (s: ReturnType<typeof makeState>, pid: number, i: number) => { const t = s.derived.stationTile[i]!, w = s.derived.width; teleport(s, pid, (t % w) + 0.5, Math.floor(t / w) + 0.5); };
const confirm = { confirmPressed: true }, up = { moveY: -1 }, down = { moveY: 1 }, left = { moveX: -1 }, right = { moveX: 1 };

describe('sitting and standing', () => {
  it('Confirm at a console in the same room sits; the player is locked and cannot repair; Cancel stands', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering);
    teleport(s, 0, 17.5, 9.5);                                         // room C, half a tile from the Engineering console
    expect(confirmTarget(s, 0)).toEqual({ kind: ConfirmKind.Console, index: eng });
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(eng); expect(Position.x[s.crew[0]!]).toBe(18.5);
    run(s, 10, () => intents({ moveX: 1, moveY: 1 }));
    expect(Position.x[s.crew[0]!]).toBe(18.5); expect(Position.y[s.crew[0]!]).toBe(9.5);
    expect(interactTarget(s, 0).kind).toBe(TargetKind.None);
    expect(confirmTarget(s, 0).kind).toBe(ConfirmKind.None);
    run(s, 1, () => intents({ cancelPressed: true }));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[eng]).toBe(-1);
  });
  it('Interact edge also stands; a stand edge beats Confirm and stick edges on the same tick', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering);
    sitDown(s, 0, eng);
    const pool = powerPool(s);
    run(s, 1, () => intents({ interactPressed: true, confirmPressed: true, moveX: 1 }));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(powerPool(s)).toBe(pool);
  });
  it('a console within reach but across a wall is not a target and Confirm does nothing', () => {
    // The starter ship keeps every console away from its walls, so move Life Support to the first E tile right of the G/E wall (x = 7).
    const modified = JSON.parse(JSON.stringify(starter)) as typeof starter;
    modified.stations.find((st) => st.id === 'lifeSupport')!.tile = [8, 9];
    const s = createSimState(parseShip(modified), 1, 1);
    teleport(s, 0, 6.6, 9.5);                                          // in G, 1.4 tiles from the console tile's near edge: within REACH, other room
    expect(confirmTarget(s, 0).kind).toBe(ConfirmKind.None);
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(Position.x[s.crew[0]!]).toBe(6.6);
    teleport(s, 0, 8.5, 10.5);                                         // in E: same room, in reach
    expect(confirmTarget(s, 0)).toEqual({ kind: ConfirmKind.Console, index: idx(s, StationKind.LifeSupport) });
  });
  it('an offline or occupied console refuses; two Confirms seat the lower pid', () => {
    const s = makeState(2), nav = idx(s, StationKind.Navigation);
    at(s, 0, nav); at(s, 1, nav);
    run(s, 1, () => intents(confirm, confirm));
    expect(s.stations.occupant[nav]).toBe(0); expect(Seated.station[s.crew[1]!]).toBe(-1);
    run(s, 1, () => intents({ cancelPressed: true }, {}));
    s.stations.level[nav] = 0;
    run(s, 1, () => intents({}, confirm));
    expect(Seated.station[s.crew[1]!]).toBe(-1);
  });
  it('the seating Confirm is consumed: a Doors sit does not toggle a door that tick', () => {
    const s = makeState(1), doors = idx(s, StationKind.Doors);
    at(s, 0, doors);
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(doors);
    expect(Array.from(s.doors.state).every((v) => v !== DoorState.Sealed)).toBe(true);
  });
  it('a Downed occupant stands in the same tick', () => {
    const s = makeState(2), med = idx(s, StationKind.Medbay);
    sitDown(s, 1, med);
    Health.cur[s.crew[1]!] = 0.01; s.rooms.fire[s.derived.stationRoom[med]!] = 1;          // burning Medbay downs the occupant this tick (fire damage outpaces healing)
    run(s, 1);
    expect(Life.state[s.crew[1]!]).toBe(LifeState.Downed); expect(Seated.station[s.crew[1]!]).toBe(-1); expect(s.stations.occupant[med]).toBe(-1);
  });
});

describe('Engineering console', () => {
  it('up/down move the cursor over kinds with wrap; right/left move bars; refusals leave state unchanged', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering), nav = idx(s, StationKind.Navigation);
    sitDown(s, 0, eng);
    expect(s.stations.cursor[eng]).toBe(StationKind.Engineering);
    run(s, 1, () => intents(down)); run(s, 1, () => intents({}));
    expect(s.stations.cursor[eng]).toBe(StationKind.LifeSupport);
    for (let i = 0; i < 4; i++) { run(s, 1, () => intents(up)); run(s, 1, () => intents({})); }
    expect(s.stations.cursor[eng]).toBe(StationKind.Navigation);
    run(s, 1, () => intents(right));
    expect(s.stations.level[nav]).toBe(2); expect(powerPool(s)).toBe(0);
    run(s, STICK_REPEAT_TICKS * 3, () => intents(right));             // held: repeats are refused at max / empty pool
    expect(s.stations.level[nav]).toBe(2);
    run(s, 1, () => intents(left));
    expect(s.stations.level[nav]).toBe(1); expect(powerPool(s)).toBe(1);
    for (let i = 0; i < 3; i++) { run(s, 1, () => intents(down)); run(s, 1, () => intents({})); }
    expect(s.stations.cursor[eng]).toBe(StationKind.Engineering);
    run(s, 1, () => intents(left));
    expect(s.stations.level[eng]).toBe(1);                              // never below 1
  });
  it('holding right adds one bar per repeat interval while the pool lasts', () => {
    const s = makeState(1), eng = idx(s, StationKind.Engineering), wpn = idx(s, StationKind.Weapons);
    sitDown(s, 0, eng); s.stations.level[wpn] = 0;                       // pool 3, weapons max 3
    s.stations.cursor[eng] = StationKind.Weapons;
    run(s, STICK_REPEAT_TICKS * 2 + 1, () => intents(right));
    expect(s.stations.level[wpn]).toBe(3); expect(powerPool(s)).toBe(0);
  });
});

describe('Doors console', () => {
  it('cycles doors and toggles the selected one remotely; local and remote on one tick toggle once', () => {
    const s = makeState(2), doors = idx(s, StationKind.Doors);
    sitDown(s, 0, doors);
    const first = s.derived.doorEdges[0]!, last = s.derived.doorEdges.at(-1)!;
    run(s, 1, () => intents(up));
    expect(s.derived.doorEdges[s.stations.cursor[doors]!]).toBe(last);
    run(s, 1, () => intents({})); run(s, 1, () => intents(down));
    expect(s.derived.doorEdges[s.stations.cursor[doors]!]).toBe(first);
    run(s, 1, () => intents(confirm));
    expect(s.doors.state[first]).toBe(DoorState.Sealed);
    // Player 1 stands in the corridor below that door (edge 0 is the A/I door at (2,4): no console within reach there, and 1.4 tiles from the
    // door centre keeps it outside DOOR_ZONE so it will not auto-open) and presses Confirm on the same tick as the remote press: one toggle, so
    // the door is unsealed to Closed, not re-sealed.
    const t = s.derived.edgeTile[first]!, w = s.derived.width;
    teleport(s, 1, (t % w) + 0.5, Math.floor(t / w) + 1.9);
    expect(confirmTarget(s, 1)).toEqual({ kind: ConfirmKind.Door, index: first });
    run(s, 1, () => intents(confirm, confirm));
    expect(s.doors.state[first]).toBe(DoorState.Closed);
    run(s, 1, () => intents({}, {}));
    expect(s.doors.state[first]).toBe(DoorState.Closed);
  });
  it('a remote seal on an occupied door is deferred until the tile is clear', () => {
    const s = makeState(2), doors = idx(s, StationKind.Doors);
    sitDown(s, 0, doors);
    const first = s.derived.doorEdges[0]!, t = s.derived.edgeTile[first]!, w = s.derived.width;
    teleport(s, 1, (t % w) + 0.5, Math.floor(t / w) + 0.5);          // player 1 stands on the door tile
    run(s, 1, () => intents(confirm, {}));
    expect(s.doors.state[first]).not.toBe(DoorState.Sealed); expect(s.doors.sealRequested[first]).toBe(1);
    teleport(s, 1, (t % w) + 0.5, Math.floor(t / w) + 2.5);          // step off
    run(s, 1, () => intents({}, {}));
    expect(s.doors.state[first]).toBe(DoorState.Sealed);
  });
});

describe('inert and passive consoles', () => {
  for (const kind of [StationKind.Navigation, StationKind.Weapons, StationKind.Science]) {
    it(`sitting, pushing the stick and Confirm at kind ${kind} change nothing but seating`, () => {
      const s = makeState(2), ctrl = makeState(2), i = idx(s, kind);
      at(s, 0, i); at(ctrl, 0, i);
      run(s, 1, () => intents(confirm));
      expect(Seated.station[s.crew[0]!]).toBe(i);
      run(s, 30, () => intents({ moveY: 1 }));
      run(s, 1, () => intents(confirm));
      run(s, 1, () => intents({ cancelPressed: true }));
      run(ctrl, 33);
      expect(Array.from(s.stations.level)).toEqual(Array.from(ctrl.stations.level));
      expect(Array.from(s.stations.failed)).toEqual(Array.from(ctrl.stations.failed));
      expect(Array.from(s.doors.state)).toEqual(Array.from(ctrl.doors.state));
      expect(Array.from(s.rooms.o2)).toEqual(Array.from(ctrl.rooms.o2));
      expect(s.o2Counters).toEqual(ctrl.o2Counters);
      expect(Position.x[s.crew[1]!]).toBe(Position.x[ctrl.crew[1]!]); expect(Position.y[s.crew[1]!]).toBe(Position.y[ctrl.crew[1]!]);
      expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[i]).toBe(-1);
      expect(s.stick.heldDir[0]).toBe(0); expect(s.stick.repeat[0]).toBe(0);
      const t = s.derived.stationTile[i]!, w = s.derived.width;
      expect(Position.x[s.crew[0]!]).toBe((t % w) + 0.5); expect(Position.y[s.crew[0]!]).toBe(Math.floor(t / w) + 0.5);
    });
  }
  for (const kind of [StationKind.LifeSupport, StationKind.Medbay]) {
    it(`Confirm sits at kind ${kind} and Cancel stands; the stick does nothing while seated`, () => {
      const s = makeState(1), i = idx(s, kind), t = s.derived.stationTile[i]!, w = s.derived.width;
      teleport(s, 0, (t % w) + 0.5, Math.floor(t / w) + 1.5);        // one tile below, same room, in reach
      run(s, 1, () => intents(confirm));
      expect(Seated.station[s.crew[0]!]).toBe(i); expect(s.stations.occupant[i]).toBe(0);
      run(s, 20, () => intents({ moveX: 1, confirmPressed: true }));
      expect(Seated.station[s.crew[0]!]).toBe(i); expect(Position.x[s.crew[0]!]).toBe((t % w) + 0.5);
      run(s, 1, () => intents({ cancelPressed: true }));
      expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[i]).toBe(-1);
    });
  }
});

describe('power repair', () => {
  it('a failed station is an Interact target in reach and repairs after REPAIR_TIME_POWER', () => {
    const s = makeState(1), ls = idx(s, StationKind.LifeSupport);
    failStation(s, ls); at(s, 0, ls);
    expect(interactTarget(s, 0)).toEqual({ kind: TargetKind.Power, index: ls });
    run(s, seconds(REPAIR_TIME_POWER) - 5, () => intents({ interactHeld: true }));
    expect(s.stations.failed[ls]).toBe(1);
    run(s, 10, () => intents({ interactHeld: true }));
    expect(s.stations.failed[ls]).toBe(0);
  });
  it('same seed and intents with console use hash equal', () => {
    const script = (t: number) => (t === 0 ? intents(confirm) : t < 40 ? intents(down) : t === 40 ? intents(right) : t === 50 ? intents({ cancelPressed: true }) : intents({}));
    const a = makeState(1, 9), b = makeState(1, 9), eng = idx(a, StationKind.Engineering);
    at(a, 0, eng); at(b, 0, eng);
    run(a, 60, script); run(b, 60, script);
    expect(hashState(a)).toBe(hashState(b));
  });
});
```

The console test file also needs these imports for the modified-ship case: `import starter from '../src/renderer/src/sim/ship/starter.json'; import { parseShip } from '../src/renderer/src/sim/ship/schema'; import { createSimState } from '../src/renderer/src/sim/state';`.

Append to `tests/interact.test.ts` inside `describe('targets')`:

```ts
  it('revive outranks fire, fire outranks breach, breach outranks power', () => {
    const s = makeState(2);
    const eng = s.derived.stationOfKind[3]!;
    failStation(s, eng);
    teleport(s, 0, 18.5, 9.5);
    expect(interactTarget(s, 0)).toEqual({ kind: TargetKind.Power, index: eng });
    igniteRoom(s, room(s, 'C'));
    expect(interactTarget(s, 0).kind).toBe(TargetKind.Fire);
  });
```

with `import { failStation } from '../src/renderer/src/sim/power';`.

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/stick.test.ts tests/console.test.ts tests/interact.test.ts`
Expected: FAIL (`console` module missing, `ConfirmKind.Console` undefined).

- [ ] **Step 4: Interact: console targets, power targets, sitting, door-toggle collection**

Rewrite the marked parts of `src/renderer/src/sim/interact.ts`:

```ts
import { Position, Life, LifeState, Seated } from './components';
import { roomAt } from './grid';
import { extinguishRoom } from './hazards/fire';
import { repairBreach } from './hazards/breach';
import { reviveCrew } from './crew';
import { intentFor } from './step';
import { stationOnline, sitDown } from './stations';
import { repairStation } from './power';
import { DT, REACH, REPAIR_TIME_FIRE, REPAIR_TIME_BREACH, REPAIR_TIME_POWER, REVIVE_TIME } from './tuning';

export const TargetKind = { None: 0, Revive: 1, Fire: 2, Breach: 3, Power: 4 } as const;
export interface Target { kind: number; index: number }
export const ConfirmKind = { None: 0, Door: 1, Console: 2 } as const;
export interface ConfirmTarget { kind: number; index: number }

const NONE: Target = { kind: TargetKind.None, index: -1 };
const NONE_CONFIRM: ConfirmTarget = { kind: ConfirmKind.None, index: -1 };
```

In `interactTarget`, change the first guard to `if (Life.state[eid] !== LifeState.Conscious || Seated.station[eid]! >= 0) return NONE;` and, after the breach loop and before `return best;`, add:

```ts
  if (best.kind !== TargetKind.None) return best;
  // Power failure: nearest failed station tile in reach; equal distances go to the lower tile index.
  bestDist = Infinity; let bestTile = Infinity;
  for (let i = 0; i < d.stationTile.length; i++) {
    if (!state.stations.failed[i]) continue;
    const tile = d.stationTile[i]!, dist = distToTile(state, x, y, tile);
    if (dist <= REACH && (dist < bestDist || (dist === bestDist && tile < bestTile))) { best = { kind: TargetKind.Power, index: i }; bestDist = dist; bestTile = tile; }
  }
  return best;
```

Replace `confirmTarget`:

```ts
/** Nearest door tile or same-room console tile within REACH; ties by lower tile index. None while seated or not Conscious. */
export function confirmTarget(state: SimState, pid: number): ConfirmTarget {
  const eid = state.crew[pid]!;
  if (Life.state[eid] !== LifeState.Conscious || Seated.station[eid]! >= 0) return NONE_CONFIRM;
  const d = state.derived, x = Position.x[eid]!, y = Position.y[eid]!;
  let best = NONE_CONFIRM, bestDist = Infinity, bestTile = Infinity;
  const consider = (kind: number, index: number, tile: number): void => {
    const dist = distToTile(state, x, y, tile);
    if (dist > REACH) return;
    if (dist < bestDist || (dist === bestDist && tile < bestTile)) { best = { kind, index }; bestDist = dist; bestTile = tile; }
  };
  for (const e of d.doorEdges) consider(ConfirmKind.Door, e, d.edgeTile[e]!);
  const own = roomAt(state, x, y);   // -1 on a door tile: a console is never reachable across a wall or from a doorway
  for (let i = 0; i < d.stationTile.length; i++) if (own >= 0 && d.stationRoom[i] === own) consider(ConfirmKind.Console, i, d.stationTile[i]!);
  return best;
}
```

Replace the Confirm handling and the door loop in `interactSystem` (the `targets` collection stays):

```ts
  const targets: Target[] = [];
  const sitRequests = new Map<number, number[]>();
  for (let pid = 0; pid < state.playerCount; pid++) {
    const it = intentFor(intents, pid);
    if (it.confirmPressed) {
      const c = confirmTarget(state, pid);
      if (c.kind === ConfirmKind.Door) state.scratch.doorToggles.add(c.index);       // applied once per door at the end of consoleSystem
      else if (c.kind === ConfirmKind.Console) sitRequests.set(c.index, [...(sitRequests.get(c.index) ?? []), pid]);
    }
    targets.push(it.interactHeld ? interactTarget(state, pid) : NONE);
  }
  // Seating: online and unoccupied; the lowest pid wins a tie; the seating Confirm is consumed (spec §4).
  for (const i of [...sitRequests.keys()].sort((a, b) => a - b)) {
    if (!stationOnline(state, i) || state.stations.occupant[i]! >= 0) continue;
    const pid = Math.min(...sitRequests.get(i)!);
    sitDown(state, pid, i); state.scratch.satThisTick[pid] = 1;
    targets[pid] = NONE;                                                            // a player who sits this tick repairs or revives nothing this tick
  }
```

(delete the old `const doorEdges = new Set<number>()` and the `for (const e of [...doorEdges]...) toggleSeal(state, e);` lines and the now-unused `toggleSeal` import). In the repair loop add:

```ts
    } else if (t.kind === TargetKind.Power) {
      state.stations.repair[t.index]! += DT / REPAIR_TIME_POWER;
      if (state.stations.repair[t.index]! >= 1) repairStation(state, t.index);
    }
```

- [ ] **Step 5: The console system**

Create `src/renderer/src/sim/console.ts`:

```ts
import type { Intent } from '../../../shared/intent';
import type { SimState } from './state';
import { Seated } from './components';
import { StationKind, STATION_COUNT } from './stationKinds';
import { intentFor } from './step';
import { standUp } from './stations';
import { shiftBar } from './power';
import { toggleSeal } from './doors';
import { STICK_EDGE_THRESHOLD, STICK_REPEAT_TICKS } from './tuning';

export const Dir = { None: 0, Up: 1, Down: 2, Left: 3, Right: 4 } as const;

/** Directional edge derived from the stick (spec §4): one edge on crossing or change, then one every STICK_REPEAT_TICKS while held. Ties go horizontal. */
export function stickEdge(state: SimState, pid: number, moveX: number, moveY: number): number {
  const ax = Math.abs(moveX), ay = Math.abs(moveY);
  const dir = ax < STICK_EDGE_THRESHOLD && ay < STICK_EDGE_THRESHOLD ? Dir.None
    : ax >= ay ? (moveX > 0 ? Dir.Right : Dir.Left) : (moveY > 0 ? Dir.Down : Dir.Up);
  const held = state.stick.heldDir, rep = state.stick.repeat;
  if (dir === Dir.None) { held[pid] = 0; rep[pid] = 0; return Dir.None; }
  if (dir !== held[pid]) { held[pid] = dir; rep[pid] = STICK_REPEAT_TICKS; return dir; }
  const r = rep[pid]! - 1;
  if (r <= 0) { rep[pid] = STICK_REPEAT_TICKS; return dir; }
  rep[pid] = r; return Dir.None;
}

function engineeringInput(state: SimState, i: number, dir: number): void {
  const c = state.stations.cursor;
  if (dir === Dir.Up) c[i] = (c[i]! + STATION_COUNT - 1) % STATION_COUNT;
  else if (dir === Dir.Down) c[i] = (c[i]! + 1) % STATION_COUNT;
  else if (dir === Dir.Right || dir === Dir.Left) {
    const target = state.derived.stationOfKind[c[i]!]!;
    if (target >= 0) shiftBar(state, target, dir === Dir.Right ? 1 : -1);
  }
}

function doorsInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  const edges = state.derived.doorEdges, n = edges.length, c = state.stations.cursor;
  if (c[i]! < 0) return;                                              // a ship without doors
  if (dir === Dir.Up || dir === Dir.Left) c[i] = (c[i]! + n - 1) % n;
  else if (dir === Dir.Down || dir === Dir.Right) c[i] = (c[i]! + 1) % n;
  if (confirm) state.scratch.doorToggles.add(edges[c[i]!]!);
}

/** Step 2: seated players' input, then the tick's door toggles (local and remote) once per door, ascending (spec §4, §6). */
export function consoleSystem(state: SimState, intents: readonly Intent[]): void {
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!, i = Seated.station[eid]!;
    if (i < 0 || state.scratch.satThisTick[pid]) continue;              // players who sat this tick act from the next tick
    const it = intentFor(intents, pid);
    if (it.cancelPressed || it.interactPressed) { standUp(state, pid); continue; }
    const dir = stickEdge(state, pid, it.moveX, it.moveY);
    const kind = state.derived.stationKind[i]!;
    if (kind === StationKind.Engineering) engineeringInput(state, i, dir);
    else if (kind === StationKind.Doors) doorsInput(state, i, dir, it.confirmPressed);
    // Navigation, Weapons, Science, Life Support, Medbay: no seated controls in this increment.
  }
  for (const e of [...state.scratch.doorToggles].sort((a, b) => a - b)) toggleSeal(state, e);
}
```

- [ ] **Step 6: Movement, crew and step wiring**

`src/renderer/src/sim/movement.ts`: import `Seated` and skip seated crew: after the Conscious check add `if (Seated.station[eid]! >= 0) continue;`.

`src/renderer/src/sim/crew.ts`: import `{ standUp } from './stations'`; in the Downed transition block add `standUp(state, pid);` after setting `Life.state[eid] = LifeState.Downed`.

`src/renderer/src/sim/step.ts`:

```ts
import { consoleSystem } from './console';
```

and in `step()` after `if (state.ended) return;`:

```ts
  state.scratch.doorToggles.clear(); state.scratch.satThisTick.fill(0);
```

then the order `interactSystem(state, intents); consoleSystem(state, intents); movementSystem(state, intents); doorSystem(state);` with the comment `// (2) control mode` on the console line. Leave the stub calls in place for now (Task 4 replaces them).

- [ ] **Step 7: Run the tests; re-bless if the golden moved; full suite**

Run: `npx vitest run tests/stick.test.ts tests/console.test.ts tests/interact.test.ts tests/doors.test.ts` → PASS. Run `npm test`; if only `tests/golden.test.ts` fails, run `npm run bless` (the scripted replay's Confirm presses may now seat players) and rerun; `npm run typecheck && npm run build` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim tests/stick.test.ts tests/console.test.ts tests/interact.test.ts tests/golden/basic.json
git commit -m "feat: seated control mode with stick edges, Engineering bar moves, Doors remote toggles, power repair and forced stands"
```

---

### Task 4: Life Support, Medbay, the three-type spawner; stub removal

**Files:**
- Create: `src/renderer/src/sim/hazards/lifeSupport.ts`, `src/renderer/src/sim/medbay.ts`, `src/renderer/src/sim/hazards/spawner.ts`
- Delete: `src/renderer/src/sim/hazards/stub.ts`, `tests/stub.test.ts`
- Modify: `src/renderer/src/sim/step.ts`, `tuning.ts`, `tests/helpers/bot.ts`
- Test: `tests/lifeSupport.test.ts`, `tests/medbay.test.ts`, `tests/spawner.test.ts` (new)

**Interfaces:**
- Produces: `lifeSupportInjection(state)`, `medbayStep(state)`, `spawner(state)`, `activeHazardCount(state)` (fires + breaches + failed stations); tuning `INJECT_FRAC`, `LS_SEATED_BONUS`, `MEDBAY_HEAL`, `MEDBAY_SEATED_BONUS`, `SPAWN_WEIGHTS`.

- [ ] **Step 1: Write the failing tests**

Create `tests/lifeSupport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lifeSupportInjection } from '../src/renderer/src/sim/hazards/lifeSupport';
import { totalO2 } from '../src/renderer/src/sim/hazards/oxygen';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { failStation } from '../src/renderer/src/sim/power';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { INJECT_FRAC, HAZARD_DT, STATION_MAX, OUTPUT_SLOW, OUTPUT_FAST, LS_SEATED_BONUS } from '../src/renderer/src/sim/tuning';
import { makeState, run, seconds, room } from './helpers/sim';

const ls = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.LifeSupport]!;

describe('Life Support injection', () => {
  it('requests level-scaled injection per room, more when seated, none when offline or failed', () => {
    const s = makeState(1), i = ls(s), G = room(s, 'G');
    const mid = (OUTPUT_SLOW + OUTPUT_FAST) / 2, unit = INJECT_FRAC * s.derived.volume[G]! * HAZARD_DT * mid;
    lifeSupportInjection(s);
    expect(s.injectionScratch[G]).toBeCloseTo(unit * (2 / STATION_MAX[StationKind.LifeSupport]));
    sitDown(s, 0, i); lifeSupportInjection(s);
    expect(s.injectionScratch[G]).toBeCloseTo(unit * (2 / STATION_MAX[StationKind.LifeSupport]) * (1 + LS_SEATED_BONUS));
    s.stations.level[i] = 3; lifeSupportInjection(s);
    expect(s.injectionScratch[G]).toBeCloseTo(unit * (1 + LS_SEATED_BONUS));
    s.stations.level[i] = 0; lifeSupportInjection(s);
    expect(s.injectionScratch[G]).toBe(0);
    s.stations.level[i] = 2; failStation(s, i); lifeSupportInjection(s);
    expect(s.injectionScratch[G]).toBe(0);
  });
  it('a quiet ship at the starter allocation stays full; with Life Support failed it drains', () => {
    const full = Array.from(makeState(2).derived.volume).reduce((a, b) => a + b, 0);
    const s = makeState(2); s.spawner.nextSpawnTick = 1e9;
    run(s, seconds(60));
    expect(totalO2(s)).toBeGreaterThan(0.99 * full); expect(s.o2Counters.injected).toBeGreaterThan(0);
    const t = makeState(2); t.spawner.nextSpawnTick = 1e9; failStation(t, ls(t));
    run(t, seconds(60));
    expect(t.o2Counters.injected).toBe(0); expect(totalO2(t)).toBeLessThan(totalO2(s));
  });
  it('a breached room receives nothing until repaired (existing oxygenStep rule still applies)', () => {
    const s = makeState(1); s.spawner.nextSpawnTick = 1e9;
    activateBreach(s, 6);
    s.rooms.o2[room(s, 'G')] = 0;
    run(s, seconds(5));
    expect(s.rooms.o2[room(s, 'G')]).toBeLessThan(0.3 * s.derived.volume[room(s, 'G')]!);
  });
});
```

Create `tests/medbay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { MEDBAY_HEAL, MEDBAY_SEATED_BONUS, OUTPUT_SLOW, OUTPUT_FAST, STATION_MAX, HEALTH_MAX } from '../src/renderer/src/sim/tuning';
import { makeState, run, teleport, seconds } from './helpers/sim';

const med = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Medbay]!;

describe('Medbay', () => {
  it('heals Conscious crew standing in the Medbay at the level-scaled rate, more when seated, nothing elsewhere or offline', () => {
    const s = makeState(2); s.spawner.nextSpawnTick = 1e9;
    const mid = (OUTPUT_SLOW + OUTPUT_FAST) / 2, rate = MEDBAY_HEAL * (1 / STATION_MAX[StationKind.Medbay]) * mid;
    Health.cur[s.crew[0]!] = 50; Health.cur[s.crew[1]!] = 50;
    teleport(s, 0, 17.5, 2.5);                                   // in F, next to the console
    run(s, seconds(2));
    expect(Health.cur[s.crew[0]!]).toBeCloseTo(50 + rate * 2, 1);
    expect(Health.cur[s.crew[1]!]).toBe(50);                     // still in G
    sitDown(s, 1, med(s)); Health.cur[s.crew[1]!] = 50; Health.cur[s.crew[0]!] = 50;
    run(s, seconds(2));
    expect(Health.cur[s.crew[0]!]).toBeCloseTo(50 + rate * (1 + MEDBAY_SEATED_BONUS) * 2, 1);
    expect(Health.cur[s.crew[1]!]).toBeCloseTo(50 + rate * (1 + MEDBAY_SEATED_BONUS) * 2, 1);   // the occupant is in the room too
    failStation(s, med(s)); Health.cur[s.crew[0]!] = 50;
    run(s, seconds(1));
    expect(Health.cur[s.crew[0]!]).toBe(50);
  });
  it('clamps at HEALTH_MAX and ignores Downed crew', () => {
    const s = makeState(2); s.spawner.nextSpawnTick = 1e9;
    teleport(s, 0, 17.5, 2.5); teleport(s, 1, 18.5, 2.5);
    Health.cur[s.crew[0]!] = HEALTH_MAX - 0.5;
    Life.state[s.crew[1]!] = LifeState.Downed; Life.bleed[s.crew[1]!] = 30; Health.cur[s.crew[1]!] = 0;
    run(s, seconds(1));
    expect(Health.cur[s.crew[0]!]).toBe(HEALTH_MAX); expect(Health.cur[s.crew[1]!]).toBe(0);
  });
});
```

Create `tests/spawner.test.ts` (replaces `tests/stub.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { activeHazardCount, spawner } from '../src/renderer/src/sim/hazards/spawner';
import { burningRoomCount, igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activeBreachCount } from '../src/renderer/src/sim/hazards/breach';
import { failedStationCount, sitDown } from '../src/renderer/src/sim/stations';
import { Seated } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { SPAWN_FIRST, SPAWN_INTERVAL, SPAWN_CAP, SPAWN_JITTER } from '../src/renderer/src/sim/tuning';
import { makeState, run, seconds } from './helpers/sim';

describe('timer spawner', () => {
  it('spawns the first hazard after SPAWN_FIRST and counts fires, breaches and failed stations', () => {
    const s = makeState(2);
    run(s, seconds(SPAWN_FIRST) - 1);
    expect(activeHazardCount(s)).toBe(0);
    run(s, 2);
    expect(activeHazardCount(s)).toBe(1);
    expect(burningRoomCount(s) + activeBreachCount(s) + failedStationCount(s)).toBe(1);
  });
  it('skips a spawn while the cap is full and still advances the timer', () => {
    const s = makeState(0);
    for (let r = 0; r < SPAWN_CAP; r++) igniteRoom(s, r);
    s.spawner.nextSpawnTick = s.tick;
    spawner(s);
    expect(activeHazardCount(s)).toBe(SPAWN_CAP);
    expect(s.spawner.nextSpawnTick).toBeGreaterThanOrEqual(s.tick + Math.round(SPAWN_INTERVAL * 60 * (1 - SPAWN_JITTER)));
    expect(s.spawner.nextSpawnTick).toBeLessThanOrEqual(s.tick + Math.round(SPAWN_INTERVAL * 60 * (1 + SPAWN_JITTER)));
  });
  it('produces all three types over many spawns, deterministically per seed', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = makeState(0, seed);                               // no crew: nothing gets repaired, so every spawn stays visible until the cap
      for (let n = 0; n < 3; n++) { s.spawner.nextSpawnTick = s.tick; spawner(s); }
      if (burningRoomCount(s)) kinds.add('fire'); if (activeBreachCount(s)) kinds.add('breach'); if (failedStationCount(s)) kinds.add('power');
    }
    expect(kinds).toEqual(new Set(['fire', 'breach', 'power']));
    const a = makeState(2, 7), b = makeState(2, 7);
    run(a, seconds(120)); run(b, seconds(120));
    expect(Array.from(a.stations.failed)).toEqual(Array.from(b.stations.failed));
    expect(Array.from(a.rooms.fire)).toEqual(Array.from(b.rooms.fire));
  });
  it('a failure spawned inside step() stands the occupant in that same tick', () => {
    const s = makeState(2), nav = s.derived.stationOfKind[StationKind.Navigation]!;
    sitDown(s, 0, nav);
    // Force a spawn every tick, clearing the other hazards so the cap never blocks, until the seeded spawner fails Navigation.
    for (let n = 0; n < 2000 && !s.stations.failed[nav]; n++) {
      s.spawner.nextSpawnTick = s.tick; s.rooms.fire.fill(0); s.breaches.active.fill(0);
      for (let i = 0; i < s.stations.failed.length; i++) if (i !== nav) s.stations.failed[i] = 0;
      run(s, 1);
    }
    expect(s.stations.failed[nav]).toBe(1);
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[nav]).toBe(-1);   // already standing when the tick ended
  });
  it('power failures accumulate on distinct stations up to the cap and never re-fail one', () => {
    const s = makeState(0, 3);
    for (let i = 0; i < 4; i++) s.stations.failed[i] = 1;                       // four failed: only three candidates remain and the cap (3) is already full
    s.spawner.nextSpawnTick = s.tick; spawner(s);
    expect(failedStationCount(s)).toBe(4);                                       // cap full: nothing spawned
    s.stations.failed.fill(0); s.stations.failed[0] = 1; s.stations.failed[1] = 1; s.stations.repair[0] = 0.5;
    for (let n = 0; n < 60 && failedStationCount(s) < SPAWN_CAP; n++) { s.spawner.nextSpawnTick = s.tick; s.rooms.fire.fill(0); s.breaches.active.fill(0); spawner(s); }
    expect(failedStationCount(s)).toBe(SPAWN_CAP);
    expect(s.stations.repair[0]).toBe(0.5);                                      // the already failed station was not failed again (that would reset repair)
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lifeSupport.test.ts tests/medbay.test.ts tests/spawner.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 3: Tuning**

In `src/renderer/src/sim/tuning.ts` delete `STUB_INJECT_FRAC` and `SPAWN_FIRE_WEIGHT`; change the `FIRE_DAMAGE` comment to `// health per second while in a burning room (the Medbay heals, increment 2a-i)`; change the `SPAWN_CAP` comment to `// max simultaneous fires + breaches + failed stations`; append:

```ts
// Life Support and Medbay (increment 2a-i)
export const INJECT_FRAC = 0.06;          // per second of room volume at full output (starter allocation, unmanned: 2/3 × 0.75 × 0.06 = 0.03, the old stub rate)
export const LS_SEATED_BONUS = 0.5;
export const MEDBAY_HEAL = 4;             // health per second at full output
export const MEDBAY_SEATED_BONUS = 0.5;
export const SPAWN_WEIGHTS = { fire: 2, breach: 1, power: 1 } as const;
```

- [ ] **Step 4: Life Support, Medbay, spawner**

Create `src/renderer/src/sim/hazards/lifeSupport.ts`:

```ts
import type { SimState } from '../state';
import { StationKind } from '../stationKinds';
import { stationOutput } from '../stations';
import { HAZARD_DT, INJECT_FRAC, LS_SEATED_BONUS } from '../tuning';

/** Requested injection per room for the next oxygenStep (which clamps to free volume and skips breached rooms). Spec §6. */
export function lifeSupportInjection(state: SimState): void {
  const d = state.derived, V = d.volume, inj = state.injectionScratch;
  const ls = d.stationOfKind[StationKind.LifeSupport]!;
  const out = ls >= 0 ? stationOutput(state, ls) : 0;
  const bonus = ls >= 0 && state.stations.occupant[ls]! >= 0 ? 1 + LS_SEATED_BONUS : 1;
  for (let r = 0; r < V.length; r++) inj[r] = INJECT_FRAC * V[r]! * HAZARD_DT * out * bonus;
}
```

Create `src/renderer/src/sim/medbay.ts`:

```ts
import type { SimState } from './state';
import { Position, Health, Life, LifeState } from './components';
import { roomAt } from './grid';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { DT, HEALTH_MAX, MEDBAY_HEAL, MEDBAY_SEATED_BONUS } from './tuning';

/** Conscious crew standing in the Medbay room heal while it is online; the operator raises the rate (spec §6). */
export function medbayStep(state: SimState): void {
  const d = state.derived, mb = d.stationOfKind[StationKind.Medbay]!;
  if (mb < 0 || !stationOnline(state, mb)) return;
  const rate = MEDBAY_HEAL * stationOutput(state, mb) * (state.stations.occupant[mb]! >= 0 ? 1 + MEDBAY_SEATED_BONUS : 1);
  const room = d.stationRoom[mb]!;
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] !== LifeState.Conscious) continue;
    if (roomAt(state, Position.x[eid]!, Position.y[eid]!) !== room) continue;
    Health.cur[eid] = Math.min(HEALTH_MAX, Health.cur[eid]! + rate * DT);
  }
}
```

Create `src/renderer/src/sim/hazards/spawner.ts` and delete `stub.ts`:

```ts
import type { SimState } from '../state';
import { nextFloat, nextInt } from '../../../../shared/rng';
import { igniteRoom, burningRoomCount } from './fire';
import { activateBreach, activeBreachCount, freeSites } from './breach';
import { failStation } from '../power';
import { failedStationCount } from '../stations';
import { TICK_HZ, SPAWN_INTERVAL, SPAWN_JITTER, SPAWN_CAP, SPAWN_WEIGHTS } from '../tuning';

export function activeHazardCount(state: SimState): number {
  return burningRoomCount(state) + activeBreachCount(state) + failedStationCount(state);
}

/** Stand-in for the director until increment 4: a jittered timer spawning a fire, a breach or a power failure up to SPAWN_CAP (spec §7). */
export function spawner(state: SimState): void {
  if (state.tick < state.spawner.nextSpawnTick) return;
  const jitter = 1 + SPAWN_JITTER * (2 * nextFloat(state.rng.director) - 1);
  state.spawner.nextSpawnTick = state.tick + Math.round(SPAWN_INTERVAL * TICK_HZ * jitter);
  if (activeHazardCount(state) >= SPAWN_CAP) return;
  const total = SPAWN_WEIGHTS.fire + SPAWN_WEIGHTS.breach + SPAWN_WEIGHTS.power;
  const roll = nextFloat(state.rng.director) * total;
  if (roll < SPAWN_WEIGHTS.fire) {
    const candidates: number[] = [];
    for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r] === 0) candidates.push(r);
    if (candidates.length) igniteRoom(state, candidates[nextInt(state.rng.hazards, candidates.length)]!);
  } else if (roll < SPAWN_WEIGHTS.fire + SPAWN_WEIGHTS.breach) {
    const sites = freeSites(state);
    if (sites.length) activateBreach(state, sites[nextInt(state.rng.hazards, sites.length)]!);
  } else {
    const candidates: number[] = [];
    for (let i = 0; i < state.stations.failed.length; i++) if (!state.stations.failed[i]) candidates.push(i);
    if (candidates.length) failStation(state, candidates[nextInt(state.rng.hazards, candidates.length)]!);
  }
}
```

- [ ] **Step 5: Step order**

`src/renderer/src/sim/step.ts` imports and body become:

```ts
import { lifeSupportInjection } from './hazards/lifeSupport';
import { spawner } from './hazards/spawner';
import { medbayStep } from './medbay';
```

```ts
  // (1) input, arbitration
  interactSystem(state, intents);
  // (2) control mode: seated input and the tick's door toggles
  consoleSystem(state, intents);
  // (3) movement, doors
  movementSystem(state, intents);
  doorSystem(state);
  // (4) hazards on the hazard tick
  if (hazardTick) {
    lifeSupportInjection(state);
    oxygenStep(state, state.injectionScratch);
    fireStep(state);
  }
  // (5) debris                                      -> increment 2a-ii
  spawner(state);
  // (6) stations with per-tick effects
  medbayStep(state);
  // (7) crew lifecycle, run end
  crewSystem(state);
  state.tick++;
```

Remove the `stub` import and `tests/stub.test.ts` (`git rm`).

- [ ] **Step 6: Teach the bot to repair power failures**

In `tests/helpers/bot.ts` `goalTiles`, after the breach loop and before `return goals;`:

```ts
  for (let i = 0; i < d.stationTile.length; i++) if (state.stations.failed[i]) goals.add(d.stationTile[i]!);   // stand on the console tile: in reach
```

- [ ] **Step 7: Run everything; the survival gate; re-bless**

Run: `npx vitest run tests/lifeSupport.test.ts tests/medbay.test.ts tests/spawner.test.ts tests/oxygen.test.ts tests/gate-survival.test.ts`. Expected: PASS. If a survival seed fails, report the seed, the end time and reason, and the health trace in your report and stop (BLOCKED): tuning changes are the controller's decision. Then `npm test` (golden fails: injection source changed), `npm run bless`, `npm test && npm run typecheck && npm run build` → PASS.

- [ ] **Step 8: Commit**

```bash
git add -A src/renderer/src/sim tests
git commit -m "feat: Life Support injection, Medbay healing and a three-type timer spawner replace the increment 1 stubs (golden re-blessed: injection source)"
```

---

### Task 5: HUD model: seated panels, power strip, power threats

**Files:**
- Modify: `src/renderer/src/render/hudModel.ts`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Produces:
```ts
export interface EngineeringPanel { rows: { kind: number; name: string; level: number; max: number; failed: boolean }[]; cursor: number; pool: number }
export type DoorsPanel = { doorIndex: number; rooms: [string, string] } | { doorIndex: -1 };
export interface HudStation { kind: number; name: string; level: number; max: number; online: boolean; occupant: number | null }
// HudPlayer gains: seated: number | null (StationKind); console: EngineeringPanel | DoorsPanel | null; cancelPrompt: string
// HudThreat.icon gains 'icon.power'
// HudModel gains: power: { capacity: number; used: number }; stations: HudStation[]
```

- [ ] **Step 1: Write the failing HUD tests**

Append to `tests/hud.test.ts` inside `describe('buildHudModel')`:

```ts
  it('reports power, stations, a failed station as a threat with the repair prompt and progress', () => {
    const s = makeState(1);
    const eng = s.derived.stationOfKind[StationKind.Engineering]!;
    const m0 = buildHudModel(s, slots(1), 'running', '');
    expect(m0.power).toEqual({ capacity: 10, used: 9 });
    expect(m0.stations.map((st) => st.kind)).toEqual([0, 6, 1, 2, 5, 4, 3]);
    expect(m0.stations.find((st) => st.kind === StationKind.LifeSupport)).toEqual({ kind: 4, name: 'Life Support', level: 2, max: 3, online: true, occupant: null });
    failStation(s, eng); teleport(s, 0, 18.5, 9.5); s.stations.repair[eng] = 0.4;
    const m = buildHudModel(s, slots(1), 'running', '');
    expect(m.threats).toEqual([{ icon: 'icon.power', text: 'Power: Engineering' }]);
    expect(m.stations.find((st) => st.kind === StationKind.Engineering)!.online).toBe(false);
    expect(m.players[0]!.interactPrompt).toBe('Repair power'); expect(m.players[0]!.interactIcon).toBe('icon.power'); expect(m.players[0]!.progress).toBe(0.4);
  });
  it('offers Sit at a same-room console, and shows Stand plus the Engineering panel while seated', () => {
    const s = makeState(1);
    const eng = s.derived.stationOfKind[StationKind.Engineering]!;
    teleport(s, 0, 17.5, 9.5);
    expect(buildHudModel(s, slots(1), 'running', '').players[0]!.confirmPrompt).toBe('Sit: Engineering');
    sitDown(s, 0, eng); s.stations.cursor[eng] = StationKind.Weapons;
    const p = buildHudModel(s, slots(1), 'running', '').players[0]!;
    expect(p.seated).toBe(StationKind.Engineering); expect(p.cancelPrompt).toBe('Stand'); expect(p.confirmPrompt).toBe(''); expect(p.interactPrompt).toBe('');
    const panel = p.console as EngineeringPanel;
    expect(panel.cursor).toBe(StationKind.Weapons); expect(panel.pool).toBe(1);
    expect(panel.rows[StationKind.Weapons]).toEqual({ kind: 1, name: 'Weapons', level: 2, max: 3, failed: false });
    expect(panel.rows).toHaveLength(7);
  });
  it('shows the Doors panel with the selected door, or No doors on a doorless ship', () => {
    const s = makeState(1);
    const doors = s.derived.stationOfKind[StationKind.Doors]!;
    sitDown(s, 0, doors);
    const p = buildHudModel(s, slots(1), 'running', '').players[0]!;
    const e = s.derived.doorEdges[0]!;
    expect(p.console).toEqual({ doorIndex: 0, rooms: [s.layout.rooms[s.derived.edgeA[e]!]!.name, s.layout.rooms[s.derived.edgeB[e]!]!.name] });
    const noDoors = JSON.parse(JSON.stringify(starter)) as typeof starter;
    for (const edge of noDoors.edges) (edge as { kind: string }).kind = 'opening';
    const t = createSimState(parseShip(noDoors), 1, 1);
    sitDown(t, 0, t.derived.stationOfKind[StationKind.Doors]!);
    expect(buildHudModel(t, slots(1), 'running', '').players[0]!.console).toEqual({ doorIndex: -1 });
  });
```

Add the imports: `import starter from '../src/renderer/src/sim/ship/starter.json'; import { parseShip } from '../src/renderer/src/sim/ship/schema'; import { createSimState } from '../src/renderer/src/sim/state'; import { StationKind } from '../src/renderer/src/sim/stationKinds'; import { sitDown } from '../src/renderer/src/sim/stations'; import { failStation } from '../src/renderer/src/sim/power'; import type { EngineeringPanel } from '../src/renderer/src/render/hudModel';`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/hud.test.ts` → FAIL (`power` undefined).

- [ ] **Step 3: Extend the model**

In `src/renderer/src/render/hudModel.ts` add imports and types:

```ts
import { Health, Life, LifeState, Position, Seated } from '../sim/components';
import { StationKind, STATION_NAMES } from '../sim/stationKinds';
import { stationOnline } from '../sim/stations';
import { powerUsed } from '../sim/power';
import { STATION_MAX } from '../sim/tuning';
```

```ts
export interface EngineeringPanel { rows: { kind: number; name: string; level: number; max: number; failed: boolean }[]; cursor: number; pool: number }
export type DoorsPanel = { doorIndex: number; rooms: [string, string] } | { doorIndex: -1 };
export interface HudStation { kind: number; name: string; level: number; max: number; online: boolean; occupant: number | null }
```

`HudPlayer` gains `seated: number | null; console: EngineeringPanel | DoorsPanel | null; cancelPrompt: string;`. `HudThreat.icon` becomes `'icon.fire' | 'icon.breach' | 'icon.power'`. `HudModel` gains `power: { capacity: number; used: number }; stations: HudStation[];`. `EMPTY` gains `seated: null, console: null, cancelPrompt: ''`.

In `player()`: the Downed and Dead returns are unchanged (they spread `EMPTY`). Before the walking prompts, handle seated:

```ts
  const seatedAt = Seated.station[eid]!;
  if (seatedAt >= 0) {
    const kind = state.derived.stationKind[seatedAt]!;
    return { ...base, lowOxygen, lifeText: '', interactPrompt: '', interactIcon: null, confirmPrompt: '', confirmIcon: null, cancelPrompt: 'Stand', progress: 0, seated: kind, console: consolePanel(state, seatedAt, kind) };
  }
```

Add the power repair prompt after the breach branch: `else if (t.kind === TargetKind.Power) { interactPrompt = 'Repair power'; interactIcon = 'icon.power'; progress = state.stations.repair[t.index]!; }` and the console Confirm: `else if (c.kind === ConfirmKind.Console) { confirmPrompt = \`Sit: ${STATION_NAMES[state.derived.stationKind[c.index]!]}\`; }`. The walking return gains `cancelPrompt: '', seated: null, console: null`.

Add:

```ts
function consolePanel(state: SimState, i: number, kind: number): EngineeringPanel | DoorsPanel | null {
  const d = state.derived;
  if (kind === StationKind.Engineering) {
    const rows = STATION_NAMES.map((name, k) => { const si = d.stationOfKind[k]!; return { kind: k, name, level: si >= 0 ? state.stations.level[si]! : 0, max: STATION_MAX[k]!, failed: si >= 0 && state.stations.failed[si] === 1 }; });
    return { rows, cursor: state.stations.cursor[i]!, pool: state.power.capacity - powerUsed(state) };
  }
  if (kind === StationKind.Doors) {
    const c = state.stations.cursor[i]!;
    if (c < 0) return { doorIndex: -1 };
    const e = d.doorEdges[c]!;
    return { doorIndex: c, rooms: [state.layout.rooms[d.edgeA[e]!]!.name, state.layout.rooms[d.edgeB[e]!]!.name] };
  }
  return null;
}
```

In `buildHudModel`, after the breach threats: `for (let i = 0; i < state.stations.failed.length; i++) if (state.stations.failed[i]) threats.push({ icon: 'icon.power', text: \`Power: ${STATION_NAMES[state.derived.stationKind[i]!]}\` });` and build:

```ts
  const stations: HudStation[] = state ? Array.from(state.derived.stationKind, (kind, i) => ({ kind, name: STATION_NAMES[kind]!, level: state.stations.level[i]!, max: STATION_MAX[kind]!, online: stationOnline(state, i), occupant: state.stations.occupant[i]! >= 0 ? state.stations.occupant[i]! : null })) : [];
  const power = state ? { capacity: state.power.capacity, used: powerUsed(state) } : { capacity: 0, used: 0 };
```

and return them.

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run tests/hud.test.ts tests/session.test.ts` → PASS; `npm run typecheck` fails until Task 6 only if `hud.ts` destructures removed fields (it does not; new fields are additive) → expect clean. `npm test && npm run build` → PASS.

```bash
git add src/renderer/src/render/hudModel.ts tests/hud.test.ts
git commit -m "feat: HUD model carries power, stations, seated console panels and power-failure threats"
```

---

### Task 6: Pixi HUD panels, seated crew frame, door outline and failed-station overlay

**Files:**
- Modify: `src/renderer/src/render/hud.ts`, `crewSprites.ts`, `effects.ts`, `fallback.ts`

**Interfaces:**
- Consumes: Task 5 model fields; `GameAssets`; `featureReady`.
- Produces: `Feature` gains `'arc'` (`['fx.arc']`); `icons` feature list gains `'icon.power'`.

- [ ] **Step 1: Fallback features**

In `src/renderer/src/render/fallback.ts`: `export type Feature = 'crew' | 'breach' | 'vent' | 'damagedFloor' | 'fire' | 'icons' | 'glyphs' | 'arc' | 'sit';` and add `arc: ['fx.arc'], sit: ['crew.sit']` to `FEATURE_NAMES`, and append `'icon.power'` to `icons`. (Both new files are absent today, so both features fall back; `tests/renderPure.test.ts` has a `featureReady` test: extend it with `expect(featureReady(new Set(['fx.arc']), 'arc')).toBe(false); expect(featureReady(new Set(), 'arc')).toBe(true);`.)

- [ ] **Step 2: HUD rendering**

In `src/renderer/src/render/hud.ts`:

Add a bar-cell row helper next to `bar(...)`: a station name, `max` 8×8 cells (`ui.bar.fill` for an allocated bar, `ui.bar.bg` for an empty one), a cursor marker and a status text.

```ts
  const CELL = 8, MAX_CELLS = 3;
  const cellRow = (): { root: Container; set(o: { name: string; level: number; max: number; status: string; cursor: boolean; tint: number }): void } => {
    const root = new Container();
    const mark = text(16, TEXT); mark.text = '>'; mark.visible = false; root.addChild(mark);
    const name = text(); name.position.set(12, 1); root.addChild(name);
    const cells = Array.from({ length: MAX_CELLS }, (_, c) => { const sp = new Sprite(assets.texture('ui.bar.bg')); sp.width = CELL; sp.height = CELL; sp.position.set(112 + c * (CELL + 2), 4); root.addChild(sp); return sp; });
    const status = text(16, WARN); status.position.set(150, 1); root.addChild(status);
    return {
      root,
      set(o) {
        mark.visible = o.cursor; name.text = o.name; name.tint = o.tint;
        cells.forEach((sp, c) => { sp.visible = c < o.max; sp.texture = assets.texture(c < o.level ? 'ui.bar.fill' : 'ui.bar.bg'); sp.width = CELL; sp.height = CELL; });
        status.text = o.status;
      }
    };
  };
```

Add the ship power strip under the threats panel at the top right (after the `threatRows` line):

```ts
  parent.addChild(panel(INTERNAL_W - 232, 108, 228, 8 * LINE + 12));
  const powerTitle = text(); powerTitle.position.set(INTERNAL_W - 224, 114); parent.addChild(powerTitle);
  const powerRows = Array.from({ length: 7 }, (_, i) => { const r = cellRow(); r.root.position.set(INTERNAL_W - 224, 114 + (i + 1) * LINE); parent.addChild(r.root); return r; });
```

Per player, add a console panel above the player block (inside the `players` map, after `progress`):

```ts
    const consoleRoot = new Container(); consoleRoot.position.set(x, y - (8 * LINE + 16)); consoleRoot.visible = false; parent.addChild(consoleRoot);
    consoleRoot.addChild(panel(0, 0, 234, 8 * LINE + 12));
    const consoleRows = Array.from({ length: 7 }, (_, i) => { const r = cellRow(); r.root.position.set(8, 6 + i * LINE); consoleRoot.addChild(r.root); return r; });
    const consoleFooter = new Container(); consoleFooter.position.set(8, 6 + 7 * LINE); consoleRoot.addChild(consoleFooter);
```

and return `consoleRoot, consoleRows, consoleFooter` with the others. In `updatePlayer`, after the `lifeText` branch, replace the walking `else` with:

```ts
    else if (p.seated !== null) {
      fillRow(ui.line2, [{ text: STATION_NAMES[p.seated]!, tint: DIM }]);
      fillRow(ui.line3, [{ glyph: glyphName('cancel', p.deviceKind), text: p.cancelPrompt }]);
    } else {
      fillRow(ui.line2, [{ glyph: p.interactPrompt ? glyphName('interact', p.deviceKind) : null, icon: p.interactIcon, text: p.interactPrompt }]);
      fillRow(ui.line3, [{ glyph: p.confirmPrompt ? glyphName('confirm', p.deviceKind) : null, icon: p.confirmIcon, text: p.confirmPrompt }]);
    }
    ui.consoleRoot.visible = p.console !== null;
    if (p.console && 'rows' in p.console) {
      const c = p.console;
      c.rows.forEach((r, k) => ui.consoleRows[k]!.set({ name: r.name, level: r.level, max: r.max, status: r.failed ? 'FAIL' : '', cursor: k === c.cursor, tint: k === c.cursor ? TEXT : DIM }));
      ui.consoleRows.forEach((r) => { r.root.visible = true; });
      fillRow(ui.consoleFooter, [{ text: `pool ${c.pool}`, tint: DIM }]);
    } else if (p.console) {
      ui.consoleRows.forEach((r) => { r.root.visible = false; });
      fillRow(ui.consoleFooter, [{ text: 'rooms' in p.console ? `Door ${p.console.rooms[0]} - ${p.console.rooms[1]}` : 'No doors', tint: TEXT }]);
    }
```

with `import { STATION_NAMES } from '../sim/stationKinds';`. In `update(m)` add the strip:

```ts
      powerTitle.text = `POWER ${m.power.used}/${m.power.capacity}`;
      for (let k = 0; k < 7; k++) {
        const st = m.stations.find((s) => s.kind === k);
        if (st) powerRows[k]!.set({ name: st.name, level: st.level, max: st.max, status: st.online ? (st.occupant !== null ? `P${st.occupant + 1}` : '') : 'OFF', cursor: false, tint: st.online ? TEXT : WARN });
        powerRows[k]!.root.visible = !!st;
      }
```

(Empty-slot and reconnect branches also hide the console panel: add `ui.consoleRoot.visible = false;` to both early returns.)

- [ ] **Step 3: Seated crew frame**

In `src/renderer/src/render/crewSprites.ts` import `Seated` and, in the art path after the `life !== Conscious` branch, insert:

```ts
        else if (Seated.station[eid]! >= 0) { const n = useSit ? 'crew.sit' : 'crew.idle.s'; setAnim(cs, n, [assets.texture(n)], 1, false); }
```

with `const useSit = featureReady(new Set(assets.missing), 'sit');` next to `useArt`. (The seated branch must come before the `moving` check: a sit snaps the position, which would otherwise read as one frame of walking.)

- [ ] **Step 4: Door outline and failed-station overlay**

In `src/renderer/src/render/effects.ts`: import `{ StationKind } from '../sim/stationKinds'`; add `const art = { ..., arc: featureReady(missing, 'arc') }`; create `const outline = new Graphics(); above.addChild(outline);` and `const failLayer = new Container(); below.addChild(failLayer); const fails = new Map<number, AnimatedSprite>();`. At the end of `draw(state)`:

```ts
      // Doors console selection: outline the selected door tile while someone is seated there.
      outline.clear();
      const doorsIdx = d.stationOfKind[StationKind.Doors]!;
      if (doorsIdx >= 0 && state.stations.occupant[doorsIdx]! >= 0 && state.stations.cursor[doorsIdx]! >= 0) {
        const [tx, ty] = tileXY(w, d.edgeTile[d.doorEdges[state.stations.cursor[doorsIdx]!]!]!);
        outline.rect(tx * TILE_PX + 1, ty * TILE_PX + 1, TILE_PX - 2, TILE_PX - 2).stroke({ color: 0x4fc3f7, width: 2 });
      }
      // Failed stations: arc animation on the console tile, or a yellow square.
      const failedTiles: number[] = [];
      for (let i = 0; i < d.stationTile.length; i++) if (state.stations.failed[i]) failedTiles.push(d.stationTile[i]!);
      if (art.arc) {
        const a = assets.animation('fx.arc');
        syncCache(fails, failedTiles, (t) => {
          const s = new AnimatedSprite(a.textures); s.scale.set(SCALE); s.animationSpeed = a.fps / 60; s.loop = true; s.play();
          const [tx, ty] = tileXY(w, t); s.position.set(tx * TILE_PX, ty * TILE_PX); failLayer.addChild(s); return s;
        }, (s) => s.destroy());
      } else {
        for (const t of failedTiles) { const [tx, ty] = tileXY(w, t); fallback.rect(tx * TILE_PX + 8, ty * TILE_PX + 8, TILE_PX - 16, TILE_PX - 16).fill({ color: 0xffd23a, alpha: 0.9 }); }
      }
```

(`fallback.clear()` already runs earlier in `draw`; keep the failed squares after the breach block so they are not cleared.)

- [ ] **Step 5: Verify**

`npm run typecheck && npm run build && npm test` → PASS. Dev run: `timeout 40 npx electron-vite dev -- --enable-logging --v=0 > <scratch log> 2>&1`; the `INFO:CONSOLE` lines must show no `TypeError` or uncaught error (the lobby draws the HUD and the power strip at once).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render tests/renderPure.test.ts
git commit -m "feat: HUD power strip and seated console panels, seated crew frame, Doors selection outline, failed-station overlay"
```

---

### Task 7: Gate, spec amendments, ledger notes

**Files:**
- Modify: `docs/gates.md`, `docs/superpowers/specs/2026-11-10-power-and-consoles-design.md`, `docs/spikes.md`

- [ ] **Step 1: Gate section**

Append to `docs/gates.md`:

```markdown
## Increment 2a-i: power and consoles
- [ ] `npm test` passes: console (sit/stand, Engineering, Doors, inert stations, power repair, determinism with console use), power, stick edges, Life Support, Medbay, spawner, snapshot round trip of seating/power/stick, ship validation (unknown id, missing kind, fractional/over-max allocation, Engineering floor, budget), HUD model (power strip, panels, power threat, No doors).
- [ ] `tests/gate-survival.test.ts` still passes on seeds 1-3 with Life Support unmanned at level 2 and power failures in the mix.
- [ ] Manual, two players (`npm run dev`): each of the seven consoles can be sat at (Confirm in its room) and left (Cancel or Interact); a bar is moved in Engineering and the strip reflects it; a power failure appears, is repaired by holding Interact at the console, and Engineering comes back at level 1 (others at 0, reallocated); a door is sealed from the Doors console and the blue outline matches the sealed door; a hurt crew member heals in the Medbay. Date and notes: pending human playtest.
- [ ] Manual, solo: five minutes survived against the spawner with Life Support manned at level 2. Date and notes: pending.
- [ ] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.
```

- [ ] **Step 2: Spec amendments**

In the spec: §2 step list, replace the `powerStep` line with `5. (repairs that complete are applied inside interactSystem, like fire and breach; there is no separate power step)` and drop `sim/power.ts`'s "Power step" wording to "pool accounting, Engineering bar moves, power failure apply and repair helpers"; §10 ship view: "seated crew use `crew.sit` when present, else the idle frame facing down"; §11 golden bullet: "re-recorded in each task whose change alters layout identity, sim version or simulation results (Tasks 1-4 of the plan), each with the cause in the commit message".

- [ ] **Step 3: Spikes note**

Append to `docs/spikes.md`:

```markdown
## Stations as arrays, not entities (increment 2a-i)

Seven fixed consoles live as typed arrays in `SimState.stations`; crew remain the only entities, so the bitECS recycling spike still holds. Stick edges are derived in the sim (`console.ts`), so replays reproduce console use.
```

- [ ] **Step 4: Verify and commit**

`npm test && npm run typecheck && npm run build` → PASS.

```bash
git add docs
git commit -m "docs: increment 2a-i gate, spec amendments from the plan, spikes note"
```
