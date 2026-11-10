# Debris Loop (Increment 2a-ii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the debris hazard (spawn, warning, interception with a plain beam, evasion, impact) so Science, Weapons and Navigation have an effect, per `docs/superpowers/specs/2026-11-10-debris-loop-design.md`.

**Architecture:** Debris objects live in fixed typed-array slots in `SimState.debris` with a `StableId` each; crew stay the only entities. `debrisSystem` (detection, then impacts) runs after the spawner. Weapons charge and shots resolve inside `consoleSystem`. `removeDebris` retargets the Weapons cursor before clearing identity. A `downCrew` helper shared with `crewSystem` applies lethal impact damage immediately. The HUD model gains debris threats and three panels; the Pixi HUD and effects render them.

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), bitecs 0.4 (components only), Pixi 8.19 (render task only). No new dependencies.

## Spec amendments made by this plan (recorded in Task 5)

- `warnedTargets` and `nextTarget` live in `sim/debrisTargets.ts` (pure over `state.debris`) so `stations.ts` can import them without a cycle; `evades` lives in `sim/debris.ts` next to the evasion roll, `beamHits` in `sim/weapons.ts` (spec §2 put both in `weapons.ts`).
- The Weapons panel's charge is a continuous `ui.bar` (the existing `bar()` helper) with a `READY` label, not ten cells (spec §8).
- The impact flash reads `state.rooms.impactTick` and `state.tick` directly in `effects.ts`, like the other ship-view effects; `HudModel.tick` and `impactTick` are still exposed for tests and future use (spec §8).
- The golden replay is re-blessed in Task 1 (`SIM_VERSION`) and again in Task 2 (spawner weights and debris), each with the cause in the commit message and the ledger (spec §9 said once).

## Global Constraints

- `tests/boundary.test.ts` stays green: `sim/` and `shared/` import nothing from render/, input/, app/, pixi, electron; no `Math.random`, `Date`, `performance.now`, `Math.sin/cos/atan2/pow/hypot`, `window`, `document` in sim/ or shared/, even in comments. ASCII only in comments.
- Every test runs under node; no test imports pixi, and no file a test imports does.
- Determinism: all randomness from `state.rng.<stream>`: spawn room and flight jitter and the impact room-effect roll from `rng.hazards`, spawn type from `rng.director`, beam hit and evasion from `rng.combat`. All new per-run state (`debris.*`, `weapons.charge`, `rooms.impactTick`) is in `SimState`, flattened, snapshotted and hashed. `SIM_VERSION` becomes `3`.
- Tuning: `DEBRIS_SLOTS = 8`; `DEBRIS_FLIGHT = 30`, `DEBRIS_FLIGHT_JITTER = 6` (s); `SCIENCE_LEAD_UNMANNED = 4`, `SCIENCE_LEAD_BASE = 12`, `SCIENCE_LEAD_SCALE = 16` (s); `BEAM_CHARGE_TIME = 6` (s at output 1); `BEAM_HIT_BASE = 0.55`, `BEAM_HIT_SCALE = 0.30`; `EVADE_BASE = 0.20`, `EVADE_SCALE = 0.40`; `DEBRIS_HULL_DAMAGE = 8`; `DEBRIS_CREW_DAMAGE = 20`; `SPAWN_WEIGHTS = { fire: 2, breach: 1, power: 1, debris: 2 }` (intervals in that order over 6); `SPAWN_CAP` stays 3.
- `stationOutput` at skill 0 is `level / max × 0.75`: Science level 1 → 0.375 (lead 18 s), level 2 → 0.75 (lead 24 s); Weapons level 1 → 0.25 (charge 24 s), level 2 → 0.5 (12 s), level 3 → 0.75 (8 s); `beamHits` thresholds 0.625 / 0.70 / 0.775; Navigation level 1 → 0.375 (`evades` threshold 0.35), level 2 → 0.75 (0.50).
- Step order: interact → console (charge, Weapons input, shots) → movement → doors → hazard tick → spawner → **debrisSystem** (detection for all active objects, then impacts for `impactTick ≤ tick` in ascending slot order) → medbay → crew.
- Detection: `remaining = (impactTick − tick) × DT ≤ lead` warns; lead is `SCIENCE_LEAD_UNMANNED` unless Science is online and occupied, then `BASE + SCALE × stationOutput`. Warned is permanent. A warning auto-selects for a seated Weapons operator whose cursor is -1.
- Impact: Navigation (online, occupied) rolls `evades` first; else hull −8 (floor 0), one room effect (`rng.hazards` `u < 0.5` → breach first else fire first; the other on failure; none if both impossible; the roll is always drawn), Conscious crew in the room by `roomAt` lose 20 health with `downCrew` at 0, `rooms.impactTick[room] = tick`, `removeDebris`.
- `removeDebris(slot)`: if the Weapons station cursor equals `slot`, set it to `nextTarget(state, stableId[slot], slot)` **before** clearing `active`, `warned`, `stableId`.
- Weapons: `chargeBeam` once per tick at the start of `consoleSystem` (online and occupied: `charge = min(1, charge + DT × output / BEAM_CHARGE_TIME)`); Up/Down cycle `warnedTargets` by `stableId` with wrap; Confirm with `charge ≥ 1` and a valid cursor draws one `rng.combat` roll, destroys on hit, `charge = 0` either way; no charge or no target draws nothing. `sitDown` at Weapons sets the cursor to `warnedTargets(state)[0] ?? -1`.
- Commit messages: imperative, prefixed `feat:`, `test:`, `chore:`, `spec:` or `docs:`; the agent's attribution line as the session requires. `npm run typecheck`, `npm test` and `npm run build` pass at the end of every task.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/debrisTargets.ts` (new) | `warnedTargets`, `nextTarget`: pure target ordering over `state.debris`. |
| `src/renderer/src/sim/debris.ts` (new) | `activeDebrisCount`, `spawnDebris`, `removeDebris`, `scienceLead`, `evades`, `debrisSystem`. |
| `src/renderer/src/sim/weapons.ts` (new) | `beamHits`, `chargeBeam`, `fireBeam`, `weaponsInput`. |
| `src/renderer/src/sim/{state,flatten,tuning,crew,stations,console,step}.ts`, `hazards/spawner.ts` | Modified as the tasks say. |
| `src/renderer/src/render/{hudModel,hud,effects,fallback}.ts` | Debris threats, panels, flash, icons. |
| `tests/{debris,weapons}.test.ts` (new), `tests/{spawner,console,snapshot,hud}.test.ts`, `tests/helpers/sim.ts` | Tests and the `placeDebris` helper. |
| `docs/gates.md`, spec amendments, memory | Task 5. |

---

### Task 1: Debris state, snapshot coverage, target ordering, `downCrew`

**Files:**
- Create: `src/renderer/src/sim/debrisTargets.ts`
- Modify: `src/renderer/src/sim/tuning.ts`, `src/renderer/src/sim/state.ts`, `src/renderer/src/sim/flatten.ts`, `src/renderer/src/sim/crew.ts`, `tests/helpers/sim.ts`
- Test: `tests/debris.test.ts` (new), `tests/snapshot.test.ts`, `tests/crew.test.ts`

**Interfaces:**
- Produces: `SimState.debris: { active: Uint8Array; stableId: Int32Array; room: Int16Array; impactTick: Int32Array; warned: Uint8Array }` (length `DEBRIS_SLOTS`), `SimState.weapons: { charge: number }`, `SimState.rooms.impactTick: Int32Array` (−1 when none); `warnedTargets(state): number[]`, `nextTarget(state, afterStableId, excludeSlot = -1): number`; `downCrew(state, pid)`; test helper `placeDebris(state, room, ticksOut, warned = 0, stableId?)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/debris.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { warnedTargets, nextTarget } from '../src/renderer/src/sim/debrisTargets';
import { DEBRIS_SLOTS } from '../src/renderer/src/sim/tuning';
import { makeState, placeDebris, room } from './helpers/sim';

describe('debris slots and target order', () => {
  it('a fresh state has empty slots, no impacts and no charge', () => {
    const s = makeState(1);
    expect(s.debris.active).toHaveLength(DEBRIS_SLOTS);
    expect(Array.from(s.debris.active).every((a) => a === 0)).toBe(true);
    expect(Array.from(s.rooms.impactTick).every((t) => t === -1)).toBe(true);
    expect(s.weapons.charge).toBe(0);
  });
  it('warnedTargets lists warned active slots in ascending stableId, not slot order', () => {
    const s = makeState(1), A = room(s, 'A');
    placeDebris(s, A, 600, 1, 30);          // slot 0, id 30
    placeDebris(s, A, 600, 1, 10);          // slot 1, id 10
    placeDebris(s, A, 600, 0, 20);          // slot 2, id 20, unwarned
    expect(warnedTargets(s)).toEqual([1, 0]);
  });
  it('nextTarget picks the smallest stableId above the given one, wraps, excludes a slot and returns -1 when empty', () => {
    const s = makeState(1), A = room(s, 'A');
    placeDebris(s, A, 600, 1, 10); placeDebris(s, A, 600, 1, 20); placeDebris(s, A, 600, 1, 30);
    expect(nextTarget(s, 20)).toBe(2);
    expect(nextTarget(s, 30)).toBe(0);
    expect(nextTarget(s, 20, 2)).toBe(0);                 // 30 excluded: wraps to 10
    s.debris.warned.fill(0);
    expect(nextTarget(s, 10)).toBe(-1);
  });
});
```

Append to `tests/helpers/sim.ts`:

```ts
/** Place a debris object directly (no RNG draw): target room, ticks until impact, warned flag and an optional explicit StableId. */
export function placeDebris(state: SimState, room: number, ticksOut: number, warned = 0, stableId?: number): number {
  const db = state.debris;
  let slot = -1;
  for (let i = 0; i < db.active.length; i++) if (!db.active[i]) { slot = i; break; }
  if (slot < 0) throw new Error('no free debris slot');
  db.active[slot] = 1; db.room[slot] = room; db.impactTick[slot] = state.tick + ticksOut; db.warned[slot] = warned;
  db.stableId[slot] = stableId ?? state.nextStableId++;
  if (stableId !== undefined && stableId >= state.nextStableId) state.nextStableId = stableId + 1;
  return slot;
}
```

Append to `describe('snapshot')` in `tests/snapshot.test.ts`:

```ts
  it('round-trips debris, weapons charge and room impact ticks', () => {
    const s = makeState(2, 5);
    placeDebris(s, 3, 900, 1); placeDebris(s, 4, 1200, 0);
    s.weapons.charge = 0.4; s.rooms.impactTick[3] = 77;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(hashState(t)).toBe(hashState(s));
    expect(Array.from(t.debris.active)).toEqual(Array.from(s.debris.active));
    expect(Array.from(t.debris.stableId)).toEqual(Array.from(s.debris.stableId));
    expect(Array.from(t.debris.impactTick)).toEqual(Array.from(s.debris.impactTick));
    expect(Array.from(t.debris.warned)).toEqual(Array.from(s.debris.warned));
    expect(t.weapons.charge).toBe(0.4); expect(t.rooms.impactTick[3]).toBe(77);
  });
```

and add `placeDebris` to the `./helpers/sim` import in that file.

Append to the top-level `describe` in `tests/crew.test.ts` (open the file first and match its imports; it already imports `Life`, `LifeState` and the sim helpers):

```ts
  it('downCrew downs a crew member immediately, stands them up and starts the bleed timer', () => {
    const s = makeState(1);
    const eng = s.derived.stationOfKind[StationKind.Engineering]!;
    sitDown(s, 0, eng);
    downCrew(s, 0);
    const eid = s.crew[0]!;
    expect(Life.state[eid]).toBe(LifeState.Downed); expect(Life.bleed[eid]).toBe(BLEEDOUT_TIME);
    expect(Seated.station[eid]).toBe(-1); expect(s.stations.occupant[eng]).toBe(-1);
    expect(Life.reviveProgress[eid]).toBe(0); expect(Life.reviverPid[eid]).toBe(-1);
  });
```

with imports `downCrew` from `../src/renderer/src/sim/crew`, `sitDown` from `../src/renderer/src/sim/stations`, `StationKind` from `../src/renderer/src/sim/stationKinds`, `Seated` from components and `BLEEDOUT_TIME` from tuning.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/debris.test.ts tests/snapshot.test.ts tests/crew.test.ts`
Expected: FAIL (`debrisTargets` module missing; `s.debris` undefined; `downCrew` not exported).

- [ ] **Step 3: Tuning and state**

In `src/renderer/src/sim/tuning.ts` change `SIM_VERSION` to `3` and append:

```ts
// Debris (increment 2a-ii)
export const DEBRIS_SLOTS = 8;                        // never reached: SPAWN_CAP counts in-flight debris
export const DEBRIS_FLIGHT = 30, DEBRIS_FLIGHT_JITTER = 6;             // seconds from spawn to impact, +/- jitter
export const SCIENCE_LEAD_UNMANNED = 4;               // seconds of warning with Science unoccupied or offline
export const SCIENCE_LEAD_BASE = 12, SCIENCE_LEAD_SCALE = 16;          // seated lead = base + scale x output (18 s at level 1, 24 s at level 2, skill 0)
export const BEAM_CHARGE_TIME = 6;                    // seconds at output 1 (24 / 12 / 8 s at levels 1 / 2 / 3, skill 0)
export const BEAM_HIT_BASE = 0.55, BEAM_HIT_SCALE = 0.30;              // hit chance = base + scale x output
export const EVADE_BASE = 0.20, EVADE_SCALE = 0.40;                    // evasion chance = base + scale x output
export const DEBRIS_HULL_DAMAGE = 8;                  // of HULL_MAX per impact
export const DEBRIS_CREW_DAMAGE = 20;                 // of HEALTH_MAX per Conscious crew member in the hit room
```

and replace the `SPAWN_WEIGHTS` line with:

```ts
export const SPAWN_WEIGHTS = { fire: 2, breach: 1, power: 1, debris: 2 } as const;   // intervals in this order (total 6)
```

(The spawner only maps the fourth interval in Task 2; until then a `debris` roll falls through to the power branch of the existing `pickSpawnType`, which is why Task 1 re-blesses the golden for the version bump and Task 2 for the behaviour.)

In `src/renderer/src/sim/state.ts`:

```ts
import { HULL_MAX, HEALTH_MAX, SPAWN_FIRST, TICK_HZ, REACTOR_CAPACITY, DEBRIS_SLOTS } from './tuning';
```

```ts
  rooms: { o2: Float64Array; fire: Float64Array; fireRepair: Float64Array; impactTick: Int32Array };   // impactTick: tick of the last debris impact per room, -1 until one
  ...
  stick: { heldDir: Int8Array; repeat: Int16Array };
  /** Debris objects in fixed slots (spec 2a-ii section 3). stableId is 0 while a slot is inactive. */
  debris: { active: Uint8Array; stableId: Int32Array; room: Int16Array; impactTick: Int32Array; warned: Uint8Array };
  weapons: { charge: number };                          // beam charge 0..1; survives standing and power failure
```

and in `createSimState`:

```ts
    rooms: { o2: Float64Array.from(derived.volume), fire: new Float64Array(R), fireRepair: new Float64Array(R), impactTick: new Int32Array(R).fill(-1) },
    ...
    stick: { heldDir: new Int8Array(playerCount), repeat: new Int16Array(playerCount) },
    debris: { active: new Uint8Array(DEBRIS_SLOTS), stableId: new Int32Array(DEBRIS_SLOTS), room: new Int16Array(DEBRIS_SLOTS), impactTick: new Int32Array(DEBRIS_SLOTS), warned: new Uint8Array(DEBRIS_SLOTS) },
    weapons: { charge: 0 },
```

- [ ] **Step 4: Flatten**

In `src/renderer/src/sim/flatten.ts`:

```ts
import { SIM_VERSION, DEBRIS_SLOTS } from './tuning';

export const FLATTEN_MANIFEST = ['header', 'rng', 'rooms', 'doors', 'breaches', 'o2Counters', 'spawner', 'stations', 'power', 'stick', 'debris', 'weapons', 'crew'];
const HEADER_FIELDS = 10, COUNTER_FIELDS = 5, SPAWNER_FIELDS = 1, CREW_FIELDS = 9, STATION_FIELDS = 5, POWER_FIELDS = 1, STICK_FIELDS = 2, ROOM_FIELDS = 4, DEBRIS_FIELDS = 5, WEAPONS_FIELDS = 1;
```

`size`:

```ts
  return HEADER_FIELDS + STREAM_NAMES.length + s.rooms.o2.length * ROOM_FIELDS + s.doors.state.length * 3
    + s.breaches.active.length * 2 + COUNTER_FIELDS + SPAWNER_FIELDS
    + s.stations.level.length * STATION_FIELDS + POWER_FIELDS + s.playerCount * STICK_FIELDS
    + DEBRIS_SLOTS * DEBRIS_FIELDS + WEAPONS_FIELDS + s.crew.length * CREW_FIELDS;
```

In `flatten`, after the `fireRepair` loop add `for (const v of s.rooms.impactTick) put(v);`, and after the stick loops, before crew:

```ts
  const db = s.debris;
  for (const v of db.active) put(v); for (const v of db.stableId) put(v); for (const v of db.room) put(v); for (const v of db.impactTick) put(v); for (const v of db.warned) put(v);
  put(s.weapons.charge);
```

In `unflatten`, after the `fireRepair` loop add `for (let r = 0; r < s.rooms.impactTick.length; r++) s.rooms.impactTick[r] = get();`, and after the stick loops:

```ts
  const db = s.debris;
  for (let k = 0; k < DEBRIS_SLOTS; k++) db.active[k] = get(); for (let k = 0; k < DEBRIS_SLOTS; k++) db.stableId[k] = get();
  for (let k = 0; k < DEBRIS_SLOTS; k++) db.room[k] = get(); for (let k = 0; k < DEBRIS_SLOTS; k++) db.impactTick[k] = get();
  for (let k = 0; k < DEBRIS_SLOTS; k++) db.warned[k] = get();
  s.weapons.charge = get();
```

- [ ] **Step 5: Target ordering and `downCrew`**

Create `src/renderer/src/sim/debrisTargets.ts`:

```ts
import type { SimState } from './state';

/** Warned, active debris slots in ascending StableId: the Weapons target order (spec 2a-ii section 5). Pure over state.debris. */
export function warnedTargets(state: SimState): number[] {
  const db = state.debris, out: number[] = [];
  for (let k = 0; k < db.active.length; k++) if (db.active[k] && db.warned[k]) out.push(k);
  return out.sort((a, b) => db.stableId[a]! - db.stableId[b]!);
}

/** The warned slot with the smallest StableId above `afterStableId`, else the smallest overall, else -1. `excludeSlot` is ignored (used while removing it). */
export function nextTarget(state: SimState, afterStableId: number, excludeSlot = -1): number {
  const db = state.debris, list = warnedTargets(state).filter((k) => k !== excludeSlot);
  if (!list.length) return -1;
  for (const k of list) if (db.stableId[k]! > afterStableId) return k;
  return list[0]!;
}
```

In `src/renderer/src/sim/crew.ts` add the helper and use it:

```ts
/** Downed transition, shared by environmental damage and debris impacts: stands the player and starts the bleed-out. */
export function downCrew(state: SimState, pid: number): void {
  const eid = state.crew[pid]!;
  Life.state[eid] = LifeState.Downed; standUp(state, pid); Life.bleed[eid] = BLEEDOUT_TIME;
  Life.reviveProgress[eid] = 0; Life.reviverPid[eid] = -1;
}
```

and in `crewSystem` replace the two lines inside `if (Health.cur[eid] === 0) { ... }` with `if (Health.cur[eid] === 0) downCrew(state, pid);`.

- [ ] **Step 6: Run the tests, re-bless the golden, run everything**

Run: `npx vitest run tests/debris.test.ts tests/snapshot.test.ts tests/crew.test.ts` → PASS.
Run: `npm run bless` (cause: `SIM_VERSION` 2 → 3; the flattened vector also gains the debris, weapons and impactTick fields).
Run: `npm test && npm run typecheck && npm run build` → all pass (37 + 1 files).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/debrisTargets.ts src/renderer/src/sim/tuning.ts src/renderer/src/sim/state.ts src/renderer/src/sim/flatten.ts src/renderer/src/sim/crew.ts tests/helpers/sim.ts tests/debris.test.ts tests/snapshot.test.ts tests/crew.test.ts tests/golden/basic.json
git commit -m "feat: debris slots, weapons charge and room impact ticks in state and snapshots; downCrew helper (golden re-blessed: sim version 3)"
```

---

### Task 2: Spawner fourth type, detection, evasion and impact

**Files:**
- Create: `src/renderer/src/sim/debris.ts`
- Modify: `src/renderer/src/sim/hazards/spawner.ts`, `src/renderer/src/sim/step.ts`
- Test: `tests/debris.test.ts`, `tests/spawner.test.ts`

**Interfaces:**
- Consumes: Task 1 state, `warnedTargets`/`nextTarget`, `downCrew`; existing `stationOnline`, `stationOutput`, `igniteRoom`, `activateBreach`, `roomAt`.
- Produces: `activeDebrisCount(state)`, `spawnDebris(state): number` (slot or -1), `removeDebris(state, slot)`, `scienceLead(state): number` (seconds), `evades(u, output): boolean`, `debrisSystem(state)`; `pickSpawnType(roll): 'fire' | 'breach' | 'power' | 'debris'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/debris.test.ts` (extend the imports: `spawnDebris, removeDebris, scienceLead, evades, debrisSystem, activeDebrisCount` from `../src/renderer/src/sim/debris`; `sitDown` from `../src/renderer/src/sim/stations`; `StationKind` from `../src/renderer/src/sim/stationKinds`; `failStation` from `../src/renderer/src/sim/power`; `igniteRoom` from `../src/renderer/src/sim/hazards/fire`; `Health, Life, LifeState, Seated` from `../src/renderer/src/sim/components`; `EndReason` from `../src/renderer/src/sim/crew`; `DEBRIS_FLIGHT, DEBRIS_FLIGHT_JITTER, SCIENCE_LEAD_UNMANNED, DEBRIS_HULL_DAMAGE, DEBRIS_CREW_DAMAGE, TICK_HZ` from tuning; `run, teleport, seconds` from the helpers):

```ts
const sci = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Science]!;
const nav = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Navigation]!;
/** The starter ship has one breach site per room; this is the site in `r`. */
const siteOf = (s: ReturnType<typeof makeState>, r: number) => Array.from(s.derived.siteRoom).indexOf(r);

describe('spawn and removal', () => {
  it('spawnDebris fills the lowest free slot with a fresh StableId, a flight inside the jitter and no warning', () => {
    const s = makeState(1), id0 = s.nextStableId;
    const a = spawnDebris(s);
    expect(a).toBe(0); expect(s.debris.active[0]).toBe(1); expect(s.debris.stableId[0]).toBe(id0); expect(s.debris.warned[0]).toBe(0);
    const flight = (s.debris.impactTick[0]! - s.tick) / TICK_HZ;
    expect(flight).toBeGreaterThanOrEqual(DEBRIS_FLIGHT - DEBRIS_FLIGHT_JITTER - 1 / TICK_HZ); expect(flight).toBeLessThanOrEqual(DEBRIS_FLIGHT + DEBRIS_FLIGHT_JITTER + 1 / TICK_HZ);
    expect(s.debris.room[0]).toBeGreaterThanOrEqual(0); expect(s.debris.room[0]).toBeLessThan(s.derived.volume.length);
    expect(spawnDebris(s)).toBe(1);
    removeDebris(s, 0);
    expect(s.debris.active[0]).toBe(0); expect(s.debris.stableId[0]).toBe(0);
    const c = spawnDebris(s);
    expect(c).toBe(0); expect(s.debris.stableId[0]).toBeGreaterThan(s.debris.stableId[1]!);   // reused slot, newer id
    expect(activeDebrisCount(s)).toBe(2);
  });
  it('a full table skips the spawn and returns -1', () => {
    const s = makeState(1);
    for (let k = 0; k < s.debris.active.length; k++) placeDebris(s, 0, 600);
    expect(spawnDebris(s)).toBe(-1);
  });
  it('removeDebris retargets the Weapons cursor by StableId before clearing the slot', () => {
    const s = makeState(1), wpn = s.derived.stationOfKind[StationKind.Weapons]!, A = room(s, 'A');
    placeDebris(s, A, 600, 1, 10); placeDebris(s, A, 600, 1, 20); placeDebris(s, A, 600, 1, 30);   // slots 0, 1, 2
    s.stations.cursor[wpn] = 1;
    removeDebris(s, 1);
    expect(s.stations.cursor[wpn]).toBe(2);                 // 20 -> 30
    removeDebris(s, 2);
    expect(s.stations.cursor[wpn]).toBe(0);                 // 30 -> wraps to 10
    removeDebris(s, 0);
    expect(s.stations.cursor[wpn]).toBe(-1);                // nothing left
    placeDebris(s, A, 600, 1);
    s.stations.cursor[wpn] = -1;
    removeDebris(s, 0);
    expect(s.stations.cursor[wpn]).toBe(-1);                // a cursor not on the removed slot is left alone
  });
});

describe('detection', () => {
  it('lead is 4 s unmanned or offline and base + scale x output when seated', () => {
    const s = makeState(1), i = sci(s);
    expect(scienceLead(s)).toBe(SCIENCE_LEAD_UNMANNED);
    sitDown(s, 0, i);
    expect(scienceLead(s)).toBeCloseTo(18);                 // level 1 of 2, skill 0
    s.stations.level[i] = 2;
    expect(scienceLead(s)).toBeCloseTo(24);
    failStation(s, i);                                      // stands the occupant
    expect(scienceLead(s)).toBe(SCIENCE_LEAD_UNMANNED);
  });
  it('unmanned, an object is warned at 4 s remaining and not before; warned is permanent', () => {
    const s = makeState(1), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
    placeDebris(s, A, seconds(5));
    run(s, seconds(1));                                      // ticks 0..59: remaining is still above 4 s at tick 59 (241 ticks)
    expect(s.debris.warned[0]).toBe(0);
    run(s, 1);                                               // tick 60: remaining is exactly 4 s
    expect(s.debris.warned[0]).toBe(1);
  });
  it('a seated operator warns at the seated lead; standing or a failure never un-warns', () => {
    const s = makeState(1), i = sci(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
    sitDown(s, 0, i);
    placeDebris(s, A, seconds(18) + 2);
    run(s, 1);
    expect(s.debris.warned[0]).toBe(0);
    run(s, 2);
    expect(s.debris.warned[0]).toBe(1);
    run(s, 1, () => intents({ cancelPressed: true }));
    failStation(s, i); run(s, 1);
    expect(s.debris.warned[0]).toBe(1);
  });
  it('flight shorter than or equal to the lead is warned on its spawn tick; longer is not', () => {
    for (const [flightTicks, expected] of [[seconds(23), 1], [seconds(24), 1], [seconds(25), 0]] as const) {
      const s = makeState(1), i = sci(s), A = room(s, 'A');
      s.spawner.nextSpawnTick = 1e9; s.stations.level[i] = 2; sitDown(s, 0, i);   // lead 24 s
      placeDebris(s, A, flightTicks);
      debrisSystem(s);
      expect(s.debris.warned[0]).toBe(expected);
    }
  });
});

describe('impact', () => {
  it('lowers hull by DEBRIS_HULL_DAMAGE, applies one room effect, records the impact tick and frees the slot', () => {
    const s = makeState(0), A = room(s, 'A');
    s.rng.hazards.s = 7;                                    // first draw 0.012 < 0.5: breach first
    placeDebris(s, A, 0);
    debrisSystem(s);
    expect(s.hull).toBe(100 - DEBRIS_HULL_DAMAGE);
    expect(s.breaches.active[siteOf(s, A)]).toBe(1); expect(s.rooms.fire[A]).toBe(0);
    expect(s.rooms.impactTick[A]).toBe(s.tick); expect(s.debris.active[0]).toBe(0);
    const t = makeState(0); t.rng.hazards.s = 1;            // first draw 0.627: fire first
    placeDebris(t, A, 0); debrisSystem(t);
    expect(t.rooms.fire[A]).toBeGreaterThan(0); expect(t.breaches.active[siteOf(t, A)]).toBe(0);
  });
  it('falls back to the other effect when the drawn one is impossible, and to none when both are; the roll is drawn either way', () => {
    const s = makeState(0), A = room(s, 'A');
    s.rng.hazards.s = 7;                                    // breach first, but the site is taken
    s.breaches.active[siteOf(s, A)] = 1;
    placeDebris(s, A, 0); debrisSystem(s);
    expect(s.rooms.fire[A]).toBeGreaterThan(0);
    const t = makeState(0); t.rng.hazards.s = 7;
    t.breaches.active[siteOf(t, A)] = 1; igniteRoom(t, A); const fire = t.rooms.fire[A]!;
    const before = t.rng.hazards.s;
    placeDebris(t, A, 0); debrisSystem(t);
    expect(t.rooms.fire[A]).toBe(fire); expect(t.hull).toBe(100 - DEBRIS_HULL_DAMAGE);
    expect(t.rng.hazards.s).not.toBe(before);
  });
  it('damages Conscious crew in the room by roomAt, downs a lethal hit at once, and a second impact that tick does not hit them again', () => {
    const s = makeState(3), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
    teleport(s, 0, 2.5, 2.5);                                // in A
    teleport(s, 1, 2.5, 4.5);                                // A/I door tile: roomAt is -1, not hit
    Health.cur[s.crew[2]!] = DEBRIS_CREW_DAMAGE;             // in G (spawn room), not in A
    s.rng.hazards.s = 1;
    placeDebris(s, A, 0); placeDebris(s, A, 0);              // two impacts on A this tick
    Health.cur[s.crew[0]!] = DEBRIS_CREW_DAMAGE + 5;         // the first impact leaves 5, the second downs
    debrisSystem(s);
    expect(Health.cur[s.crew[0]!]).toBe(0); expect(Life.state[s.crew[0]!]).toBe(LifeState.Downed);
    expect(Health.cur[s.crew[1]!]).toBe(100); expect(Health.cur[s.crew[2]!]).toBe(DEBRIS_CREW_DAMAGE);
    expect(s.hull).toBe(100 - 2 * DEBRIS_HULL_DAMAGE);
    const t = makeState(1), B = room(t, 'B');
    teleport(t, 0, 7.5, 2.5); Health.cur[t.crew[0]!] = DEBRIS_CREW_DAMAGE;
    placeDebris(t, B, 0); placeDebris(t, B, 0);
    debrisSystem(t);
    expect(Health.cur[t.crew[0]!]).toBe(0); expect(Life.state[t.crew[0]!]).toBe(LifeState.Downed);   // downed by the first, untouched by the second
  });
  it('two impacts in one tick on different rooms stamp both rooms', () => {
    const s = makeState(0), A = room(s, 'A'), B = room(s, 'B');
    placeDebris(s, A, 0); placeDebris(s, B, 0);
    debrisSystem(s);
    expect(s.rooms.impactTick[A]).toBe(s.tick); expect(s.rooms.impactTick[B]).toBe(s.tick);
  });
  it('hull reaching 0 ends the run with EndReason.Hull through step()', () => {
    const s = makeState(1), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; s.hull = DEBRIS_HULL_DAMAGE;
    placeDebris(s, A, 1);
    run(s, 2);
    expect(s.hull).toBe(0); expect(s.ended).toBe(1); expect(s.endReason).toBe(EndReason.Hull);
  });
});

describe('evasion', () => {
  it('evades thresholds at Navigation levels 1 and 2', () => {
    expect(evades(0.349, 0.375)).toBe(true); expect(evades(0.35, 0.375)).toBe(false);
    expect(evades(0.499, 0.75)).toBe(true); expect(evades(0.5, 0.75)).toBe(false);
  });
  it('rolls only when Navigation is seated and online; success removes the object with no hull change', () => {
    const s = makeState(1), A = room(s, 'A');
    const combat = s.rng.combat.s;
    placeDebris(s, A, 0); debrisSystem(s);
    expect(s.rng.combat.s).toBe(combat); expect(s.hull).toBe(100 - DEBRIS_HULL_DAMAGE);    // unmanned: no roll
    const t = makeState(1), n = nav(t);
    sitDown(t, 0, n); t.rng.combat.s = 7;                   // first draw 0.012 < 0.35: evaded
    placeDebris(t, A, 0); debrisSystem(t);
    expect(t.hull).toBe(100); expect(t.debris.active[0]).toBe(0); expect(t.rooms.impactTick[A]).toBe(-1); expect(t.rng.combat.s).not.toBe(7);
    const u = makeState(1); sitDown(u, 0, nav(u)); u.rng.combat.s = 4;                      // first draw 0.924: not evaded
    placeDebris(u, A, 0); debrisSystem(u);
    expect(u.hull).toBe(100 - DEBRIS_HULL_DAMAGE);
    const v = makeState(1); sitDown(v, 0, nav(v)); failStation(v, nav(v)); const c2 = v.rng.combat.s;   // offline: stood, no roll
    placeDebris(v, A, 0); debrisSystem(v);
    expect(v.rng.combat.s).toBe(c2);
  });
});
```

In `tests/spawner.test.ts` replace the three tests `'the 2:1:1 roll maps each weight interval to its type'`, `'explicit director states select fire, breach and power through the spawner'` and `'a selected type with no valid target ...'` with:

```ts
  it('the 2:1:1:2 roll maps each weight interval to its type', () => {
    for (const r of [0, 0.5, 1.999]) expect(pickSpawnType(r)).toBe('fire');
    for (const r of [2, 2.5, 2.999]) expect(pickSpawnType(r)).toBe('breach');
    for (const r of [3, 3.5, 3.999]) expect(pickSpawnType(r)).toBe('power');
    for (const r of [4, 5, 5.999]) expect(pickSpawnType(r)).toBe('debris');
  });
  it('explicit director states select fire, breach, power and debris through the spawner', () => {
    // Director states chosen so that the second draw (the roll) lands in each interval of 6: 1.95, 2.55, 3.75 and 4.64.
    const spawn = (directorState: number) => {
      const s = makeState(0); s.rng.director.s = directorState;
      s.spawner.nextSpawnTick = s.tick; spawner(s); return s;
    };
    const f = spawn(2), b = spawn(14), p = spawn(8), d = spawn(5);
    const counts = (s: ReturnType<typeof makeState>) => [burningRoomCount(s), activeBreachCount(s), failedStationCount(s), activeDebrisCount(s)];
    expect(counts(f)).toEqual([1, 0, 0, 0]);
    expect(counts(b)).toEqual([0, 1, 0, 0]);
    expect(counts(p)).toEqual([0, 0, 1, 0]);
    expect(counts(d)).toEqual([0, 0, 0, 1]);
    expect(d.debris.warned[0]).toBe(0); expect(d.debris.stableId[0]).toBeGreaterThan(0);
  });
  it('a selected type with no valid target skips spawning but still advances the director stream and the timer', () => {
    const noSites = JSON.parse(JSON.stringify(starter)) as typeof starter;
    noSites.breachSites = [];
    const s = createSimState(parseShip(noSites), 0, 1);
    s.rng.director.s = 14;                                                     // rolls a breach (2.55 of 6)
    const expected = createRng(14); nextFloat(expected); nextFloat(expected);  // jitter draw, then roll draw
    const hazardsBefore = s.rng.hazards.s;
    s.spawner.nextSpawnTick = s.tick; spawner(s);
    expect(activeHazardCount(s)).toBe(0);
    expect(s.rng.director.s).toBe(expected.s); expect(s.rng.director.s).not.toBe(14);
    expect(s.rng.hazards.s).toBe(hazardsBefore);                               // no target to pick, so no target draw
    expect(s.spawner.nextSpawnTick).toBeGreaterThan(s.tick);
  });
  it('in-flight debris counts toward the cap', () => {
    const s = makeState(0);
    for (let k = 0; k < SPAWN_CAP; k++) placeDebris(s, 0, 600);
    s.spawner.nextSpawnTick = s.tick; spawner(s);
    expect(activeHazardCount(s)).toBe(SPAWN_CAP); expect(burningRoomCount(s) + activeBreachCount(s) + failedStationCount(s)).toBe(0);
  });
```

and update the first test's title and assertion to `'spawns the first hazard after SPAWN_FIRST and counts fires, breaches, failed stations and debris'` with `expect(burningRoomCount(s) + activeBreachCount(s) + failedStationCount(s) + activeDebrisCount(s)).toBe(1);`. Also change the `'produces all three types ...'` test to add `'debris'` when `activeDebrisCount(s) > 0` and expect the set of all four; if 12 seeds do not produce all four, raise the seed range (up to 40) until they do and keep the range fixed in the test (it is deterministic). Add imports `activeDebrisCount` from `../src/renderer/src/sim/debris` and `placeDebris` from the helpers.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/debris.test.ts tests/spawner.test.ts`
Expected: FAIL (`debris` module missing; `pickSpawnType(5)` returns `'power'`).

- [ ] **Step 3: `debris.ts`**

Create `src/renderer/src/sim/debris.ts`:

```ts
import type { SimState } from './state';
import { Position, Health, Life, LifeState } from './components';
import { nextFloat, nextInt } from '../../../shared/rng';
import { roomAt } from './grid';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { igniteRoom } from './hazards/fire';
import { activateBreach } from './hazards/breach';
import { downCrew } from './crew';
import { nextTarget } from './debrisTargets';
import { DT, TICK_HZ, DEBRIS_FLIGHT, DEBRIS_FLIGHT_JITTER, SCIENCE_LEAD_UNMANNED, SCIENCE_LEAD_BASE, SCIENCE_LEAD_SCALE, EVADE_BASE, EVADE_SCALE, DEBRIS_HULL_DAMAGE, DEBRIS_CREW_DAMAGE } from './tuning';

export function activeDebrisCount(state: SimState): number {
  let n = 0; for (const a of state.debris.active) if (a) n++; return n;
}

/** Spawn one hidden object: uniform target room and a jittered flight from rng.hazards (spec 2a-ii section 4). Returns the slot, or -1 if the table is full. */
export function spawnDebris(state: SimState): number {
  const db = state.debris;
  let slot = -1;
  for (let k = 0; k < db.active.length; k++) if (!db.active[k]) { slot = k; break; }
  if (slot < 0) return -1;
  const room = nextInt(state.rng.hazards, state.derived.volume.length);
  const flight = DEBRIS_FLIGHT + (2 * nextFloat(state.rng.hazards) - 1) * DEBRIS_FLIGHT_JITTER;
  db.active[slot] = 1; db.stableId[slot] = state.nextStableId++; db.room[slot] = room;
  db.impactTick[slot] = state.tick + Math.round(flight * TICK_HZ); db.warned[slot] = 0;
  return slot;
}

/** Free a slot. The Weapons cursor is retargeted by StableId before the identity is cleared, so the target order survives removal. */
export function removeDebris(state: SimState, slot: number): void {
  const db = state.debris, wpn = state.derived.stationOfKind[StationKind.Weapons]!;
  if (wpn >= 0 && state.stations.cursor[wpn] === slot) state.stations.cursor[wpn] = nextTarget(state, db.stableId[slot]!, slot);
  db.active[slot] = 0; db.warned[slot] = 0; db.stableId[slot] = 0;
}

/** Detection lead in seconds: the unmanned value unless Science is online and occupied. */
export function scienceLead(state: SimState): number {
  const sci = state.derived.stationOfKind[StationKind.Science]!;
  if (sci < 0 || !stationOnline(state, sci) || state.stations.occupant[sci]! < 0) return SCIENCE_LEAD_UNMANNED;
  return SCIENCE_LEAD_BASE + SCIENCE_LEAD_SCALE * stationOutput(state, sci);
}

/** Pure evasion threshold: a roll u in [0, 1) evades when below base + scale x Navigation output. */
export function evades(u: number, output: number): boolean {
  return u < EVADE_BASE + EVADE_SCALE * output;
}

function resolveImpact(state: SimState, slot: number): void {
  const d = state.derived, db = state.debris, room = db.room[slot]!;
  const nav = d.stationOfKind[StationKind.Navigation]!;
  if (nav >= 0 && stationOnline(state, nav) && state.stations.occupant[nav]! >= 0 && evades(nextFloat(state.rng.combat), stationOutput(state, nav))) {
    removeDebris(state, slot);
    return;
  }
  state.hull = Math.max(0, state.hull - DEBRIS_HULL_DAMAGE);
  const breachFirst = nextFloat(state.rng.hazards) < 0.5;
  const tryBreach = (): boolean => {
    for (let s = 0; s < d.siteRoom.length; s++) if (d.siteRoom[s] === room && !state.breaches.active[s]) return activateBreach(state, s);
    return false;
  };
  const tryFire = (): boolean => igniteRoom(state, room);
  if (breachFirst) { if (!tryBreach()) tryFire(); } else if (!tryFire()) tryBreach();
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] !== LifeState.Conscious) continue;
    if (roomAt(state, Position.x[eid]!, Position.y[eid]!) !== room) continue;
    Health.cur[eid] = Math.max(0, Health.cur[eid]! - DEBRIS_CREW_DAMAGE);
    if (Health.cur[eid] === 0) downCrew(state, pid);
  }
  state.rooms.impactTick[room] = state.tick;
  removeDebris(state, slot);
}

/** Step: detection for every active object, then impacts for every object due this tick, ascending slot (spec 2a-ii section 4). */
export function debrisSystem(state: SimState): void {
  const db = state.debris, lead = scienceLead(state), wpn = state.derived.stationOfKind[StationKind.Weapons]!;
  for (let k = 0; k < db.active.length; k++) {
    if (!db.active[k] || db.warned[k]) continue;
    if ((db.impactTick[k]! - state.tick) * DT <= lead) {
      db.warned[k] = 1;
      if (wpn >= 0 && state.stations.occupant[wpn]! >= 0 && state.stations.cursor[wpn]! < 0) state.stations.cursor[wpn] = k;   // first warning auto-selects
    }
  }
  for (let k = 0; k < db.active.length; k++) if (db.active[k] && db.impactTick[k]! <= state.tick) resolveImpact(state, k);
}
```

- [ ] **Step 4: Spawner and step**

In `src/renderer/src/sim/hazards/spawner.ts`:

```ts
import { activeDebrisCount, spawnDebris } from '../debris';

export function activeHazardCount(state: SimState): number {
  return burningRoomCount(state) + activeBreachCount(state) + failedStationCount(state) + activeDebrisCount(state);
}

/** Maps a roll in [0, total weight) onto a hazard type by the SPAWN_WEIGHTS intervals (fire, breach, power, debris). */
export function pickSpawnType(roll: number): 'fire' | 'breach' | 'power' | 'debris' {
  const w = SPAWN_WEIGHTS;
  if (roll < w.fire) return 'fire';
  if (roll < w.fire + w.breach) return 'breach';
  return roll < w.fire + w.breach + w.power ? 'power' : 'debris';
}
```

In `spawner`: `const total = SPAWN_WEIGHTS.fire + SPAWN_WEIGHTS.breach + SPAWN_WEIGHTS.power + SPAWN_WEIGHTS.debris;`, change the final `else {` (power) to `} else if (type === 'power') {` and append `else spawnDebris(state);`. Update the doc comment to name the four types.

In `src/renderer/src/sim/step.ts` add `import { debrisSystem } from './debris';` and replace the `// (5) debris` block:

```ts
  // (5) spawner, then debris detection and impacts
  spawner(state);
  debrisSystem(state);
```

- [ ] **Step 5: Run, re-bless, run everything**

Run: `npx vitest run tests/debris.test.ts tests/spawner.test.ts` → PASS.
Run: `npm run bless` (cause: the spawner's weight total is now 6 and debris spawns, so every seeded run diverges).
Run: `npm test && npm run typecheck && npm run build` → all pass. `tests/gate-survival.test.ts` must still pass on seeds 1 to 3 with nobody at Science, Weapons or Navigation; if a seed fails, report it with the hull and health figures instead of changing tuning (the controller decides).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/debris.ts src/renderer/src/sim/hazards/spawner.ts src/renderer/src/sim/step.ts tests/debris.test.ts tests/spawner.test.ts tests/golden/basic.json
git commit -m "feat: debris spawns as a fourth hazard, Science detection lead, Navigation evasion and impact resolution (golden re-blessed: spawner weights and debris)"
```

---

### Task 3: Weapons beam and the three scripted-intent gate tests

**Files:**
- Create: `src/renderer/src/sim/weapons.ts`
- Modify: `src/renderer/src/sim/stations.ts`, `src/renderer/src/sim/console.ts`
- Test: `tests/weapons.test.ts` (new), `tests/console.test.ts`

**Interfaces:**
- Consumes: Task 1 and 2 (`removeDebris`, `warnedTargets`, `state.weapons.charge`, `Dir`, `stickEdge`).
- Produces: `beamHits(u, output): boolean`, `chargeBeam(state)`, `fireBeam(state): boolean`, `weaponsInput(state, i, dir, confirm)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/weapons.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { beamHits, chargeBeam, fireBeam } from '../src/renderer/src/sim/weapons';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Seated } from '../src/renderer/src/sim/components';
import { BEAM_CHARGE_TIME, DT } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, placeDebris, room, seconds } from './helpers/sim';

const wpn = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Weapons]!;
const up = { moveY: -1 }, down = { moveY: 1 }, confirm = { confirmPressed: true };

describe('beam charge', () => {
  it('progresses only while seated and online, scales with level, is kept on stand and on failure', () => {
    const s = makeState(1), i = wpn(s);
    s.spawner.nextSpawnTick = 1e9;
    run(s, 10);
    expect(s.weapons.charge).toBe(0);                                              // nobody seated
    sitDown(s, 0, i);                                                              // starter level 2: output 0.5
    run(s, 1);
    expect(s.weapons.charge).toBeCloseTo(DT * 0.5 / BEAM_CHARGE_TIME);
    run(s, seconds(12) + 1);
    expect(s.weapons.charge).toBe(1);
    run(s, 1, () => intents({ cancelPressed: true }));
    run(s, 30);
    expect(s.weapons.charge).toBe(1);                                              // kept while standing
    s.weapons.charge = 0.3; sitDown(s, 0, i); failStation(s, i); run(s, 30);
    expect(s.weapons.charge).toBe(0.3); expect(Seated.station[s.crew[0]!]).toBe(-1);   // failure stood the operator and froze the charge
    const t = makeState(1), j = wpn(t); t.stations.level[j] = 3; sitDown(t, 0, j);
    chargeBeam(t);
    expect(t.weapons.charge).toBeCloseTo(DT * 0.75 / BEAM_CHARGE_TIME);
  });
});

describe('targeting', () => {
  it('sitting selects the smallest warned StableId or -1; the first warning auto-selects; up/down cycle and wrap', () => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
    sitDown(s, 0, i);
    expect(s.stations.cursor[i]).toBe(-1);
    run(s, 10, () => intents(down));
    expect(s.stations.cursor[i]).toBe(-1);                                         // stick does nothing with no targets
    placeDebris(s, A, seconds(3));                                                 // inside the unmanned lead: warned next tick
    run(s, 1);
    expect(s.debris.warned[0]).toBe(1); expect(s.stations.cursor[i]).toBe(0);      // auto-selected
    placeDebris(s, A, 600, 1, 50); placeDebris(s, A, 600, 1, 40);                   // slots 1 (id 50) and 2 (id 40); slot 0 has the smallest id
    run(s, 1, () => intents(down)); run(s, 1, () => intents({}));
    expect(s.stations.cursor[i]).toBe(2);                                          // next by id: 40
    run(s, 1, () => intents(down)); run(s, 1, () => intents({}));
    expect(s.stations.cursor[i]).toBe(1);                                          // 50
    run(s, 1, () => intents(down)); run(s, 1, () => intents({}));
    expect(s.stations.cursor[i]).toBe(0);                                          // wraps
    run(s, 1, () => intents(up)); run(s, 1, () => intents({}));
    expect(s.stations.cursor[i]).toBe(1);                                          // wraps backwards to the largest id
    run(s, 1, () => intents({ cancelPressed: true }));
    const t = makeState(1), j = wpn(t); placeDebris(t, A, 600, 1, 9); placeDebris(t, A, 600, 1, 8);
    sitDown(t, 0, j);
    expect(t.stations.cursor[j]).toBe(1);                                          // smallest id on sit
  });
});

describe('firing', () => {
  it('a hit destroys the target and resets charge; a miss keeps it and resets charge; one combat draw per shot', () => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A');
    sitDown(s, 0, i); placeDebris(s, A, 600, 1); s.weapons.charge = 1; s.rng.combat.s = 7;        // first draw 0.012 < 0.70: hit
    const before = s.rng.combat.s;
    expect(fireBeam(s)).toBe(true);
    expect(s.debris.active[0]).toBe(0); expect(s.weapons.charge).toBe(0); expect(s.stations.cursor[i]).toBe(-1); expect(s.rng.combat.s).not.toBe(before);
    const t = makeState(1), j = wpn(t);
    sitDown(t, 0, j); placeDebris(t, A, 600, 1); t.weapons.charge = 1; t.rng.combat.s = 4;        // first draw 0.924 >= 0.70: miss
    expect(fireBeam(t)).toBe(false);
    expect(t.debris.active[0]).toBe(1); expect(t.weapons.charge).toBe(0); expect(t.stations.cursor[j]).toBe(0);
  });
  it('Confirm with no charge or no target does nothing and draws nothing', () => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
    sitDown(s, 0, i); s.weapons.charge = 1;
    const c0 = s.rng.combat.s;
    run(s, 1, () => intents(confirm));
    expect(s.weapons.charge).toBe(1); expect(s.rng.combat.s).toBe(c0);              // no target
    placeDebris(s, A, 600, 1); s.stations.cursor[i] = 0; s.weapons.charge = 0.5;
    run(s, 1, () => intents(confirm));
    expect(s.debris.active[0]).toBe(1); expect(s.rng.combat.s).toBe(c0);           // no charge: the shot is refused, nothing consumed
    expect(s.weapons.charge).toBeGreaterThan(0.5);                                 // charging continued that tick
  });
  it('beamHits thresholds at Weapons levels 1, 2 and 3 and is monotonic in output', () => {
    // Values sit clear of the float boundary (0.55 + 0.30 x 0.25 is not exactly 0.625 in floats).
    expect(beamHits(0.61, 0.25)).toBe(true); expect(beamHits(0.64, 0.25)).toBe(false);     // level 1 threshold 0.625
    expect(beamHits(0.69, 0.5)).toBe(true); expect(beamHits(0.71, 0.5)).toBe(false);       // level 2 threshold 0.70
    expect(beamHits(0.76, 0.75)).toBe(true); expect(beamHits(0.79, 0.75)).toBe(false);     // level 3 threshold 0.775
    for (const u of [0.1, 0.6, 0.7, 0.9]) expect(Number(beamHits(u, 0.75))).toBeGreaterThanOrEqual(Number(beamHits(u, 0.25)));
  });
});
```

In `tests/console.test.ts` replace the whole `describe('inert and passive consoles', ...)` block with:

```ts
describe('scripted-intent gate: Science, Weapons, Navigation', () => {
  it('Science: a 16 s object is unwarned unmanned, warned at the end of the seating tick, and stays warned after Cancel', () => {
    const s = makeState(1), i = idx(s, StationKind.Science), A = s.derived.roomIndex.get('A')!;
    s.spawner.nextSpawnTick = 1e9;
    at(s, 0, i);
    placeDebris(s, A, seconds(16));
    run(s, 1);
    expect(s.debris.warned[0]).toBe(0);                                            // unmanned lead is 4 s
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(i); expect(s.debris.warned[0]).toBe(1);   // sitting precedes detection in the tick
    run(s, 1, () => intents({ cancelPressed: true }));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.debris.warned[0]).toBe(1);
  });
  it('Weapons: sit, charge to full, Confirm fires one shot (destroyed or missed, charge 0, one combat draw), Cancel stands', () => {
    const s = makeState(1), i = idx(s, StationKind.Weapons), A = s.derived.roomIndex.get('A')!;
    s.spawner.nextSpawnTick = 1e9;
    at(s, 0, i); placeDebris(s, A, 1e6, 1);
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(i); expect(s.stations.cursor[i]).toBe(0);
    let n = 0; while (s.weapons.charge < 1 && n++ < seconds(12) + 2) run(s, 1);
    expect(s.weapons.charge).toBe(1);
    const c0 = s.rng.combat.s;
    run(s, 1, () => intents(confirm));
    expect(s.weapons.charge).toBe(0); expect(s.rng.combat.s).not.toBe(c0);
    const destroyed = s.debris.active[0] === 0;
    expect(destroyed ? s.stations.cursor[i] : s.debris.warned[0]).toBe(destroyed ? -1 : 1);
    run(s, 1, () => intents({ cancelPressed: true }));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.stations.occupant[i]).toBe(-1);
  });
  it('Navigation: seated, an impact draws exactly one combat roll; a low roll evades with hull unchanged', () => {
    const s = makeState(1), i = idx(s, StationKind.Navigation), A = s.derived.roomIndex.get('A')!;
    s.spawner.nextSpawnTick = 1e9;
    at(s, 0, i);
    run(s, 1, () => intents(confirm));
    expect(Seated.station[s.crew[0]!]).toBe(i);
    s.rng.combat.s = 7;                                                            // first draw 0.012 < 0.35
    const expected = createRng(7); nextFloat(expected);
    placeDebris(s, A, 1);
    run(s, 2);
    expect(s.rng.combat.s).toBe(expected.s);
    expect(s.debris.active[0]).toBe(0); expect(s.hull).toBe(100); expect(s.rooms.impactTick[A]).toBe(-1);
    run(s, 1, () => intents({ cancelPressed: true }));
    expect(Seated.station[s.crew[0]!]).toBe(-1);
  });
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
```

Add to the imports of `tests/console.test.ts`: `placeDebris` from `./helpers/sim` and `createRng, nextFloat` from `../src/shared/rng`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/weapons.test.ts tests/console.test.ts`
Expected: FAIL (`weapons` module missing; Weapons cursor is 0 on sit; Confirm does not fire).

- [ ] **Step 3: `weapons.ts`**

Create `src/renderer/src/sim/weapons.ts`:

```ts
import type { SimState } from './state';
import { nextFloat } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { removeDebris } from './debris';
import { warnedTargets } from './debrisTargets';
import { Dir } from './console';
import { DT, BEAM_CHARGE_TIME, BEAM_HIT_BASE, BEAM_HIT_SCALE } from './tuning';

/** Pure hit threshold: a roll u in [0, 1) hits when below base + scale x Weapons output. */
export function beamHits(u: number, output: number): boolean {
  return u < BEAM_HIT_BASE + BEAM_HIT_SCALE * output;
}

/** Once per tick: the beam charges while Weapons is online and occupied; the charge is kept otherwise (spec 2a-ii section 5). */
export function chargeBeam(state: SimState): void {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!;
  if (wpn < 0 || !stationOnline(state, wpn) || state.stations.occupant[wpn]! < 0) return;
  state.weapons.charge = Math.min(1, state.weapons.charge + DT * stationOutput(state, wpn) / BEAM_CHARGE_TIME);
}

/** Fire at the cursor's object if the beam is charged and the target is warned and live. One rng.combat draw; charge resets either way. */
export function fireBeam(state: SimState): boolean {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!, db = state.debris;
  if (wpn < 0 || !stationOnline(state, wpn) || state.stations.occupant[wpn]! < 0) return false;   // defensive: a seated operator is always online today, but never fire from a dead console
  const c = state.stations.cursor[wpn]!;
  if (state.weapons.charge < 1 || c < 0 || !db.active[c] || !db.warned[c]) return false;
  const hit = beamHits(nextFloat(state.rng.combat), stationOutput(state, wpn));
  state.weapons.charge = 0;
  if (hit) removeDebris(state, c);
  return hit;
}

/** Seated Weapons input: up/down cycle warned targets in StableId order with wrap; Confirm fires. Left/right are reserved for 2b. */
export function weaponsInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  const list = warnedTargets(state), c = state.stations.cursor;
  if (!list.length) c[i] = -1;
  else if (dir === Dir.Up || dir === Dir.Down) {
    const k = list.indexOf(c[i]!), n = list.length;
    c[i] = list[k < 0 ? 0 : dir === Dir.Up ? (k + n - 1) % n : (k + 1) % n]!;
  }
  if (confirm) fireBeam(state);
}
```

`console.ts` imports `weapons.ts` and `weapons.ts` imports `Dir` from `console.ts`: that is a cycle of function and constant declarations only. Avoid it: move `Dir` into its own tiny module. Create `src/renderer/src/sim/dir.ts` with `export const Dir = { None: 0, Up: 1, Down: 2, Left: 3, Right: 4 } as const;`, change `console.ts` to `import { Dir } from './dir'; export { Dir };` (so existing importers of `Dir` from `console.ts`, including `tests/stick.test.ts`, keep working), and import `Dir` from `./dir` in `weapons.ts`.

- [ ] **Step 4: `sitDown` and `consoleSystem`**

In `src/renderer/src/sim/stations.ts` add `import { warnedTargets } from './debrisTargets';` and replace the cursor line in `sitDown`:

```ts
  state.stations.cursor[i] = kind === StationKind.Engineering ? StationKind.Engineering
    : kind === StationKind.Doors ? (d.doorEdges.length ? 0 : -1)
    : kind === StationKind.Weapons ? (warnedTargets(state)[0] ?? -1)
    : 0;
```

In `src/renderer/src/sim/console.ts` add `import { chargeBeam, weaponsInput } from './weapons';`, call `chargeBeam(state);` as the first line of `consoleSystem`, and in the kind dispatch add `else if (kind === StationKind.Weapons) weaponsInput(state, i, dir, it.confirmPressed);`. Update the trailing comment to `// Navigation, Science, Life Support, Medbay: no seated controls.`

- [ ] **Step 5: Run everything**

Run: `npx vitest run tests/weapons.test.ts tests/console.test.ts tests/stick.test.ts` → PASS.
Run: `npm test && npm run typecheck && npm run build` → all pass. The golden must be unchanged (no replay intent sits at Weapons); if it changed, stop and report.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/weapons.ts src/renderer/src/sim/dir.ts src/renderer/src/sim/console.ts src/renderer/src/sim/stations.ts tests/weapons.test.ts tests/console.test.ts
git commit -m "feat: Weapons beam charge, targeting by StableId and firing; scripted-intent gate tests for Science, Weapons and Navigation"
```

---

### Task 4: HUD model: debris threats, Weapons/Science/Navigation panels, tick and impact ticks

**Files:**
- Modify: `src/renderer/src/render/hudModel.ts`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Consumes: `scienceLead`, `warnedTargets`, `state.weapons.charge`, `EVADE_BASE/SCALE`, `stationOutput`.
- Produces: `HudThreat.icon` includes `'icon.sensors'`; `HudModel.tick: number`, `weapons: { charge: number; ready: boolean }`, `impactTick: number[]`; `WeaponsPanel { kind: 'weapons'; charge; targets: { stableId; room; eta }[]; cursor }`, `SciencePanel { kind: 'science'; leadSeconds; warnedCount }`, `NavigationPanel { kind: 'navigation'; evadeChance }`; `HudPlayer.console` union widened.

- [ ] **Step 1: Write the failing tests**

Append to `describe('buildHudModel')` in `tests/hud.test.ts` (add imports: `placeDebris, seconds` from the helpers; `WeaponsPanel, SciencePanel, NavigationPanel` types from hudModel):

```ts
  it('lists warned debris as threats in StableId order with the ETA, hides unwarned ones, and exposes tick, charge and impact ticks', () => {
    const s = makeState(1), A = room(s, 'A'), B = room(s, 'B');
    s.spawner.nextSpawnTick = 1e9;
    placeDebris(s, A, seconds(10) + 1, 1, 30); placeDebris(s, B, seconds(3), 1, 10); placeDebris(s, A, seconds(20), 0, 20);
    s.weapons.charge = 1; s.rooms.impactTick[B] = 5;
    const m = buildHudModel(s, slots(1), 'running', '');
    expect(m.threats).toEqual([{ icon: 'icon.sensors', text: 'Debris: Weapons Bay 3s' }, { icon: 'icon.sensors', text: 'Debris: Bridge 11s' }]);
    expect(m.tick).toBe(0); expect(m.weapons).toEqual({ charge: 1, ready: true }); expect(m.impactTick[B]).toBe(5); expect(m.impactTick[A]).toBe(-1);
  });
  it('shows the Weapons panel with charge, targets by StableId and the cursor index', () => {
    const s = makeState(1), A = room(s, 'A'), B = room(s, 'B');
    const wpn = s.derived.stationOfKind[StationKind.Weapons]!;
    placeDebris(s, A, seconds(10), 1, 30); placeDebris(s, B, seconds(5), 1, 10);
    sitDown(s, 0, wpn); s.weapons.charge = 0.25;
    const p = buildHudModel(s, slots(1), 'running', '').players[0]!;
    expect(p.seated).toBe(StationKind.Weapons);
    const panel = p.console as WeaponsPanel;
    expect(panel.kind).toBe('weapons'); expect(panel.charge).toBe(0.25);
    expect(panel.targets).toEqual([{ stableId: 10, room: 'Weapons Bay', eta: 5 }, { stableId: 30, room: 'Bridge', eta: 10 }]);
    expect(panel.cursor).toBe(0);                                                  // sitDown selected id 10 (slot 1), which is targets[0]
    s.stations.cursor[wpn] = 0;                                                    // slot 0 is id 30: targets[1]
    expect((buildHudModel(s, slots(1), 'running', '').players[0]!.console as WeaponsPanel).cursor).toBe(1);
    s.debris.warned.fill(0); s.stations.cursor[wpn] = -1;
    const empty = buildHudModel(s, slots(1), 'running', '').players[0]!.console as WeaponsPanel;
    expect(empty.targets).toEqual([]); expect(empty.cursor).toBe(-1);
  });
  it('shows the Science and Navigation panels', () => {
    const s = makeState(2), A = room(s, 'A');
    sitDown(s, 0, s.derived.stationOfKind[StationKind.Science]!); sitDown(s, 1, s.derived.stationOfKind[StationKind.Navigation]!);
    placeDebris(s, A, seconds(10), 1);
    const m = buildHudModel(s, slots(2), 'running', '');
    const sciPanel = m.players[0]!.console as SciencePanel, navPanel = m.players[1]!.console as NavigationPanel;
    expect(sciPanel.kind).toBe('science'); expect(sciPanel.leadSeconds).toBeCloseTo(18); expect(sciPanel.warnedCount).toBe(1);
    expect(navPanel.kind).toBe('navigation'); expect(navPanel.evadeChance).toBeCloseTo(0.35);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/hud.test.ts`
Expected: FAIL (no `icon.sensors` threats; `console` null for Weapons).

- [ ] **Step 3: Model**

In `src/renderer/src/render/hudModel.ts`:

```ts
import { TICK_HZ, STATION_MAX, DT, EVADE_BASE, EVADE_SCALE } from '../sim/tuning';
import { stationOnline, stationOutput } from '../sim/stations';
import { scienceLead } from '../sim/debris';
import { warnedTargets } from '../sim/debrisTargets';
```

```ts
export interface WeaponsPanel { kind: 'weapons'; charge: number; targets: { stableId: number; room: string; eta: number }[]; cursor: number }
export interface SciencePanel { kind: 'science'; leadSeconds: number; warnedCount: number }
export interface NavigationPanel { kind: 'navigation'; evadeChance: number }
export type ConsolePanel = EngineeringPanel | DoorsPanel | WeaponsPanel | SciencePanel | NavigationPanel;
export interface HudThreat { icon: 'icon.fire' | 'icon.breach' | 'icon.power' | 'icon.sensors'; text: string }
export interface HudModel {
  phase: 'lobby' | 'running' | 'paused' | 'gameover' | 'error'; message: string; hull: number; simSeconds: number; tick: number;
  threats: HudThreat[]; power: { capacity: number; used: number }; stations: HudStation[]; weapons: { charge: number; ready: boolean }; impactTick: number[];
  players: HudPlayer[]; credits: string[] | null; creditsScroll: number;
}
```

Change `HudPlayer.console` to `console: ConsolePanel | null` and `consolePanel`'s return type to `ConsolePanel | null`, then add before its final `return null;`:

```ts
  if (kind === StationKind.Weapons) {
    const slots = warnedTargets(state), c = state.stations.cursor[i]!;
    const targets = slots.map((k) => ({ stableId: state.debris.stableId[k]!, room: state.layout.rooms[state.debris.room[k]!]!.name, eta: etaSeconds(state, k) }));
    return { kind: 'weapons', charge: state.weapons.charge, targets, cursor: slots.indexOf(c) };
  }
  if (kind === StationKind.Science) return { kind: 'science', leadSeconds: scienceLead(state), warnedCount: warnedTargets(state).length };
  if (kind === StationKind.Navigation) return { kind: 'navigation', evadeChance: EVADE_BASE + EVADE_SCALE * stationOutput(state, i) };
```

with the helper (module level):

```ts
function etaSeconds(state: SimState, slot: number): number { return Math.ceil((state.debris.impactTick[slot]! - state.tick) * DT); }
```

In `buildHudModel` after the power threats:

```ts
    for (const k of warnedTargets(state)) threats.push({ icon: 'icon.sensors', text: `Debris: ${state.layout.rooms[state.debris.room[k]!]!.name} ${etaSeconds(state, k)}s` });
```

and in the returned object add `tick: state?.tick ?? 0`, `weapons: state ? { charge: state.weapons.charge, ready: state.weapons.charge >= 1 } : { charge: 0, ready: false }`, `impactTick: state ? Array.from(state.rooms.impactTick) : []`.

- [ ] **Step 4: Run everything**

Run: `npx vitest run tests/hud.test.ts tests/renderPure.test.ts` → PASS. Then `npm test && npm run typecheck && npm run build` (the build will fail until `hud.ts` handles the new union only if it narrows unsafely; `'rows' in` and `'rooms' in` checks still compile. If `tsc` reports an error in `hud.ts`, fix the narrowing there minimally with `'kind' in p.console` guards; Task 5 replaces that code anyway).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/render/hudModel.ts tests/hud.test.ts
git commit -m "feat: HUD model lists warned debris with ETAs and carries Weapons, Science and Navigation panels, beam charge and room impact ticks"
```

---

### Task 5: Pixi HUD panels, impact flash, fallback icons, gate and spec amendments

**Files:**
- Modify: `src/renderer/src/render/hud.ts`, `src/renderer/src/render/effects.ts`, `src/renderer/src/render/fallback.ts`, `docs/gates.md`, `docs/superpowers/specs/2026-11-10-debris-loop-design.md`, `docs/superpowers/specs/2026-11-10-power-and-consoles-design.md`
- Test: `tests/renderPure.test.ts` (only if it covers `FEATURE_NAMES`; otherwise none: Pixi code stays untested)

**Interfaces:**
- Consumes: Task 4 model.

- [ ] **Step 1: Fallback icons**

In `src/renderer/src/render/fallback.ts` extend `icons` to `['icon.fire', 'icon.oxygen', 'icon.breach', 'icon.door', 'icon.repair', 'icon.power', 'icon.sensors', 'icon.weapons', 'icon.navigation']`. Run `npx vitest run tests/manifest.test.ts tests/assets.test.ts tests/renderPure.test.ts` to confirm the manifest already carries the three names (it does: `public/assets/manifest.json` lists them).

- [ ] **Step 2: HUD panels**

In `src/renderer/src/render/hud.ts`, inside the per-player block after `consoleFooter`, add a charge bar:

```ts
    const consoleBar = bar(100); consoleBar.root.position.set(120, 6 + 7 * LINE + 4); consoleBar.root.visible = false; consoleRoot.addChild(consoleBar.root);
    return { name, hp, oxygen, line2, line3, progress, consoleRoot, consoleRows, consoleFooter, consoleBar };
```

Replace the `if (p.console && 'rows' in p.console) { ... } else if (p.console) { ... }` block in `updatePlayer` with:

```ts
    ui.consoleBar.root.visible = false;
    if (p.console && 'rows' in p.console) {
      const c = p.console;
      c.rows.forEach((r, k) => ui.consoleRows[k]!.set({ name: r.name, level: r.level, max: r.max, status: r.failed ? 'FAIL' : '', failed: r.failed, cursor: k === c.cursor, tint: k === c.cursor ? TEXT : DIM }));
      ui.consoleRows.forEach((r) => { r.root.visible = true; });
      fillRow(ui.consoleFooter, [{ text: `pool ${c.pool}`, tint: DIM }]);
    } else if (p.console && 'kind' in p.console && p.console.kind === 'weapons') {
      const c = p.console;
      ui.consoleRows.forEach((r, k) => {
        const t = c.targets[k];
        r.root.visible = !!t;
        if (t) r.set({ name: `${t.room} ${t.eta}s`, level: 0, max: 0, status: '', cursor: k === c.cursor, tint: k === c.cursor ? TEXT : DIM });
      });
      fillRow(ui.consoleFooter, [{ text: c.charge >= 1 ? 'Beam READY' : `Beam ${Math.floor(c.charge * 100)}%`, tint: c.charge >= 1 ? TEXT : DIM }]);
      ui.consoleBar.root.visible = true; ui.consoleBar.set(c.charge);
    } else if (p.console && 'kind' in p.console) {
      ui.consoleRows.forEach((r) => { r.root.visible = false; });
      const text = p.console.kind === 'science' ? `Lead ${Math.round(p.console.leadSeconds)}s   Warned ${p.console.warnedCount}` : `Evade ${Math.round(p.console.evadeChance * 100)}%`;
      fillRow(ui.consoleFooter, [{ text, tint: TEXT }]);
    } else if (p.console) {
      ui.consoleRows.forEach((r) => { r.root.visible = false; });
      fillRow(ui.consoleFooter, [{ text: 'rooms' in p.console ? `Door ${p.console.rooms[0]} - ${p.console.rooms[1]}` : 'No doors', tint: TEXT }]);
    }
```

`cellRow.set` with `max: 0` hides every cell (the existing `sp.visible = c < o.max`), so a target row reads `> Bridge 10s`.

- [ ] **Step 3: Impact flash**

In `src/renderer/src/render/effects.ts` add `const IMPACT_FLASH_TICKS = 18, IMPACT_COLOR = 0xff6b5a, IMPACT_MAX_ALPHA = 0.7;` near the other constants, create `const impactLayer = new Graphics(); above.addChild(impactLayer);` next to `outline`, and in `draw` after the low-oxygen tint:

```ts
      // Debris impact flash: the hit room's floor, fading over IMPACT_FLASH_TICKS (several rooms can flash at once).
      impactLayer.clear();
      for (let r = 0; r < d.volume.length; r++) {
        const age = state.tick - state.rooms.impactTick[r]!;
        if (state.rooms.impactTick[r]! < 0 || age < 0 || age >= IMPACT_FLASH_TICKS) continue;
        const alpha = IMPACT_MAX_ALPHA * (1 - age / IMPACT_FLASH_TICKS);
        for (const t of d.roomTiles[r]!) { const [tx, ty] = tileXY(w, t); impactLayer.rect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX).fill({ color: IMPACT_COLOR, alpha }); }
      }
```

- [ ] **Step 4: Docs**

In `docs/gates.md` append after the 2a-i section:

```markdown
## Increment 2a-ii: debris loop (closes the foundation's Increment 2a)
- [x] `npm test` passes: debris (slots, target order, detection leads, warned-on-spawn boundary, impact effects and fallbacks, crew damage and immediate down, evasion), weapons (charge, targeting, firing, thresholds), spawner (fourth interval, debris in the cap), scripted-intent gate tests for Science, Weapons and Navigation, snapshot round trip of debris/weapons/impact ticks, HUD model (debris threats, three panels).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 with Science, Weapons and Navigation unmanned (date and min hull: fill in).
- [ ] Manual, two players (`npm run dev`): a `Debris` threat appears only after Science is seated (D(12,2)) or in the last 4 s unmanned; from Weapons (B(7,2)) the panel lists targets, the beam bar fills in about 12 s, Confirm removes a target or resets the bar on a miss; an unstopped impact flashes the hit room, lowers `HULL` by 8 and leaves a breach or fire; the Navigation panel (A(2,2)) shows `Evade 35%` while seated. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.
```

Fill in the survival figures from the Task 2 run (ask the controller if the report did not record them; otherwise run `npx vitest run tests/gate-survival.test.ts` and note that it passed).

In `docs/superpowers/specs/2026-11-10-debris-loop-design.md` add a `## 12. Amendments from the plan` section with the four bullets from this plan's "Spec amendments" list. In `docs/superpowers/specs/2026-11-10-power-and-consoles-design.md` §1, replace "three that are seatable power sinks until the debris half (Navigation, Weapons, Science)" with "three that gained their effect in 2a-ii (Navigation, Weapons, Science; see `2026-11-10-debris-loop-design.md`)".

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run build` → all pass. Then a 40 s dev run: `timeout 40 npx electron-vite dev -- --enable-logging --v=0 > /tmp/dev.log 2>&1; grep -c "INFO:CONSOLE" /tmp/dev.log; grep -i "error" /tmp/dev.log | head` (Git Bash). Expected: no renderer errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/hud.ts src/renderer/src/render/effects.ts src/renderer/src/render/fallback.ts docs/gates.md docs/superpowers/specs/2026-11-10-debris-loop-design.md docs/superpowers/specs/2026-11-10-power-and-consoles-design.md
git commit -m "feat: Weapons, Science and Navigation HUD panels, debris threat icons, impact room flash; increment 2a-ii gate and spec amendments"
```

---

## Self-review notes

- Spec coverage: §3 state (Task 1), §4 lifecycle and §6 spawner (Task 2), §5 stations (Tasks 2 and 3), §7 tuning (Task 1), §8 HUD (Tasks 4 and 5), §9 tests (Tasks 1 to 4), §10 gate (Task 5). The "same-seed property with a sit-fire-stand script" is covered by the existing fast-check property in `snapshot.test.ts`, whose fuzzed intents include Confirm presses at consoles after the bot has walked crew around; no separate test is added.
- Type consistency: `nextTarget(state, afterStableId, excludeSlot)` (Task 1) is called with three arguments in `removeDebris` (Task 2); `warnedTargets` is imported by `stations.ts`, `weapons.ts`, `hudModel.ts`; `Dir` moves to `dir.ts` and is re-exported from `console.ts`; `ConsolePanel` is the union `hud.ts` narrows with `'rows' in`, `'kind' in`, `'rooms' in`.
- Known deliberate asymmetry: a forced stand (failure, Downed, Engineering cut) does not set `stoodThisTick`, matching 2a-i behaviour.
