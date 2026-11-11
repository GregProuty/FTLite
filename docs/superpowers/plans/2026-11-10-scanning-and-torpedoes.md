# Scanning, Frequencies and Torpedoes (Increment 2b-ii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give debris a hidden frequency that Science scans and Weapons must match, add the four-slot weapon selector (three tuned beams and a torpedo) and a torpedo tube with a regenerating stock, per `docs/superpowers/specs/2026-11-10-scanning-and-torpedoes-design.md`.

**Architecture:** Debris gains `frequency`, `scanned`, `scan` slot arrays; `weapons` gains the selector and torpedo fields; a one-field `science` block holds the scanning flag. New `sim/science.ts` (seated input, per-tick scan progress) and `sim/torpedoes.ts` (per-tick loading and regeneration); `weapons.ts` gains the selector and dispatches `fireWeapon` to a tuned beam or the torpedo through pure thresholds. The Science cursor becomes a debris slot index like Weapons, so `removeDebris` retargets both. The HUD model exposes frequencies, the selector, torpedo state and a Science target list.

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), fast-check, Pixi 8.19 (render task only). No new dependencies.

## Spec amendments made by this plan (recorded in Task 6)

- `cycleTarget(state, i, dir)` (Up/Down over `warnedTargets` with wrap, cursor −1 when empty) lives in `sim/debrisTargets.ts` and is shared by Weapons and Science (the spec says "shared helper" without a home).
- `Weapon` selector constants (`BeamF1 0, BeamF2 1, BeamF3 2, Torpedo 3`) are exported from `weapons.ts`.

## Global Constraints

- `tests/boundary.test.ts` stays green: `sim/` and `shared/` import nothing from render/, input/, app/, pixi, electron; no `Math.random`, `Date`, `performance.now` in sim/ or shared/, even in comments. ASCII only in comments.
- Every test runs under node; no test imports pixi, and no file a test imports does.
- Determinism: frequency from `rng.hazards` at spawn (third draw, after room and flight); every shot is exactly one `rng.combat` draw; scanning, loading and regeneration draw nothing. All new per-run state (`debris.frequency/scanned/scan`, `weapons.selector/torpedoStock/torpedoLoaded/torpedoLoad/torpedoRegen`, `science.scanning`) is in `SimState`, flattened, snapshotted and hashed. `SIM_VERSION` becomes `5`; version-4 snapshots are rejected.
- Tuning (exact): `FREQ_COUNT = 3`; `SCAN_TIME = 6`; `BEAM_MATCH_BASE = 0.65`, `BEAM_MATCH_SCALE = 0.30`; `BEAM_MISS_BASE = 0.15`, `BEAM_MISS_SCALE = 0.10`; `TORP_HIT_BASE = 0.85`, `TORP_HIT_SCALE = 0.10`; `TORP_START = 3`, `TORP_CAP = 6`; `TORP_LOAD_TIME = 10`; `TORP_REGEN_TIME = 90`. `BEAM_HIT_BASE` and `BEAM_HIT_SCALE` are deleted.
- Outputs at skill 0: Weapons level 1 → 0.5, level 2 → 0.75, level 4 (overdrive) → 1.0; Science level 1 → 0.375, level 2 → 0.75, level 3 → 1.125. Thresholds: match 0.80 / 0.875 / 0.95, mismatch 0.20 / 0.225 / 0.25, torpedo 0.90 / 0.925 / 0.95 at Weapons outputs 0.5 / 0.75 / 1.0. Scan 16 s / 8 s / 5.33 s at Science levels 1 / 2 / 3. Load 20 s / 13.33 s / 10 s at Weapons levels 1 / 2 / 4.
- `consoleSystem` per-tick order before the player loop: `chargeBeam`, `regenTorpedo`, `loadTorpedo`, `scanStep`. Step order otherwise unchanged.
- Selector: Left `(sel + 3) % 4`, Right `(sel + 1) % 4`; starts at 0; persists across sits. Firing: beam needs `charge >= 1`, torpedo needs `torpedoLoaded`; one draw; reset charge or loaded either way; hit removes the object. Unready or no valid target: no draw.
- Scanning: Confirm on an active, warned, unscanned cursor target sets `science.scanning = 1`; `scanStep` progresses only while `scanning`, Science online and occupied, and the cursor active, warned, unscanned; at 1 → `scanned = 1`, `scanning = 0`. `standUp` from Science clears `scanning`.
- Torpedoes: loading while Weapons online and occupied, tube empty, stock > 0; at 1 → `loaded = 1`, `stock -= 1`, `load = 0`. Regeneration while Weapons online and stock < cap; at 1 → `stock += 1`, `regen = 0`.
- RNG pins (set `s.rng.<stream>.s = N`; the first `nextFloat` is): combat `7 → 0.012` (hit for every weapon), `36 → 0.956` (miss for every weapon), `1 → 0.627` (matched beam hits and mismatched beam misses at every level; torpedo hits). Hazards: a `spawnDebris` with `s.rng.hazards.s = 2` gives frequency 1 (room 6), `= 1` frequency 2 (room 5), `= 7` frequency 3 (room 0).
- Commit messages: imperative, prefixed `feat:`, `test:`, `chore:` or `docs:`; the agent's attribution line as the session requires. `npm run typecheck`, `npm test` and `npm run build` pass at the end of every task.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/science.ts` (new) | `scienceInput`, `scanStep`. |
| `src/renderer/src/sim/torpedoes.ts` (new) | `regenTorpedo`, `loadTorpedo`. |
| `src/renderer/src/sim/debrisTargets.ts` | adds `cycleTarget`. |
| `src/renderer/src/sim/{debris,weapons,console,stations,state,flatten,tuning}.ts` | as the tasks say. |
| `src/renderer/src/render/{hudModel,hud}.ts` | frequencies, selector, torpedo readout, Science target list. |
| `tests/{science,torpedoes}.test.ts` (new), `tests/{debris,weapons,console,snapshot,hud}.test.ts`, `tests/helpers/sim.ts` | tests. |
| `docs/gates.md`, spec amendments | Task 6. |

---

### Task 1: State, frequency at spawn, shared cursors, snapshot coverage

**Files:**
- Modify: `src/renderer/src/sim/tuning.ts`, `state.ts`, `flatten.ts`, `debris.ts`, `debrisTargets.ts`, `stations.ts`, `tests/helpers/sim.ts`
- Test: `tests/debris.test.ts`, `tests/snapshot.test.ts`, `tests/golden/basic.json` (re-bless)

**Interfaces:**
- Produces: `SimState.debris.{frequency: Uint8Array, scanned: Uint8Array, scan: Float64Array}`, `SimState.weapons.{selector, torpedoStock, torpedoLoaded, torpedoLoad, torpedoRegen}: number`, `SimState.science: { scanning: number }`; `cycleTarget(state, i, dir)` in `debrisTargets.ts`; `placeDebris(state, room, ticksOut, warned = 0, stableId?, frequency = 1)`; Science cursor semantics (sit, auto-select, retarget) identical to Weapons; `standUp` clears `science.scanning` for a Science seat.

- [ ] **Step 1: Write the failing tests**

Replace `placeDebris` in `tests/helpers/sim.ts`:

```ts
/** Place a debris object directly (no RNG draw): target room, ticks until impact, warned flag, optional explicit StableId and frequency (default 1). */
export function placeDebris(state: SimState, room: number, ticksOut: number, warned = 0, stableId?: number, frequency = 1): number {
  const db = state.debris;
  let slot = -1;
  for (let i = 0; i < db.active.length; i++) if (!db.active[i]) { slot = i; break; }
  if (slot < 0) throw new Error('no free debris slot');
  db.active[slot] = 1; db.room[slot] = room; db.impactTick[slot] = state.tick + ticksOut; db.warned[slot] = warned;
  db.frequency[slot] = frequency; db.scanned[slot] = 0; db.scan[slot] = 0;
  db.stableId[slot] = stableId ?? state.nextStableId++;
  if (stableId !== undefined && stableId >= state.nextStableId) state.nextStableId = stableId + 1;
  return slot;
}
```

Append to `tests/debris.test.ts` (imports to add: `spawnDebris, removeDebris` from `../src/renderer/src/sim/debris` if missing, `sitDown, standUp` from stations, `cycleTarget` from debrisTargets, `Dir` from `../src/renderer/src/sim/dir`, `FREQ_COUNT` from tuning, `createRng, nextFloat` from `../src/shared/rng`, `run` from the helpers; `StationKind`, `makeState`, `placeDebris`, `room` are present):

```ts
describe('frequency and shared cursors (2b-ii)', () => {
  it('spawn draws a frequency in 1..FREQ_COUNT as the third hazards draw; pinned seeds give each value', () => {
    for (const [seed, freq, rm] of [[2, 1, 6], [1, 2, 5], [7, 3, 0]] as const) {
      const s = makeState(1); s.rng.hazards.s = seed;
      const three = createRng(seed); nextFloat(three); nextFloat(three); nextFloat(three);
      const slot = spawnDebris(s);
      expect(s.debris.frequency[slot]).toBe(freq); expect(s.debris.room[slot]).toBe(rm);
      expect(s.debris.scanned[slot]).toBe(0); expect(s.debris.scan[slot]).toBe(0);
      expect(s.rng.hazards.s).toBe(three.s);                                 // room, flight, frequency: exactly three draws
    }
    expect(FREQ_COUNT).toBe(3);
  });
  it('removeDebris clears frequency, scanned and scan, and retargets the Science cursor like the Weapons cursor', () => {
    const s = makeState(2), A = room(s, 'A'), wpn = s.derived.stationOfKind[StationKind.Weapons]!, sci = s.derived.stationOfKind[StationKind.Science]!;
    placeDebris(s, A, 600, 1, 10, 2); placeDebris(s, A, 600, 1, 20, 3); placeDebris(s, A, 600, 1, 30, 1);   // slots 0, 1, 2
    s.debris.scanned[1] = 1; s.debris.scan[1] = 1;
    sitDown(s, 0, wpn); sitDown(s, 1, sci);
    expect(s.stations.cursor[wpn]).toBe(0); expect(s.stations.cursor[sci]).toBe(0);         // smallest StableId on sit, both consoles
    s.stations.cursor[wpn] = 1; s.stations.cursor[sci] = 1;
    removeDebris(s, 1);
    expect(s.stations.cursor[wpn]).toBe(2); expect(s.stations.cursor[sci]).toBe(2);         // next StableId (30) for both
    expect(s.debris.frequency[1]).toBe(0); expect(s.debris.scanned[1]).toBe(0); expect(s.debris.scan[1]).toBe(0);
  });
  it('the first warning auto-selects for a seated Science operator at -1; cycleTarget cycles and wraps for either console', () => {
    const s = makeState(1), A = room(s, 'A'), sci = s.derived.stationOfKind[StationKind.Science]!;
    s.spawner.nextSpawnTick = 1e9;
    sitDown(s, 0, sci);
    expect(s.stations.cursor[sci]).toBe(-1);
    placeDebris(s, A, 60, 0);                                                                // inside the seated lead: warned next tick
    run(s, 1);
    expect(s.debris.warned[0]).toBe(1); expect(s.stations.cursor[sci]).toBe(0);
    placeDebris(s, A, 600, 1, 50); placeDebris(s, A, 600, 1, 40);                           // slots 1 (id 50), 2 (id 40)
    cycleTarget(s, sci, Dir.Down); expect(s.stations.cursor[sci]).toBe(2);
    cycleTarget(s, sci, Dir.Down); expect(s.stations.cursor[sci]).toBe(1);
    cycleTarget(s, sci, Dir.Down); expect(s.stations.cursor[sci]).toBe(0);                  // wraps
    cycleTarget(s, sci, Dir.Up); expect(s.stations.cursor[sci]).toBe(1);                    // wraps backwards
    cycleTarget(s, sci, Dir.Left); expect(s.stations.cursor[sci]).toBe(1);                  // left/right do not move the target
  });
  it('standUp from Science clears scanning; from any other seat it does not', () => {
    const s = makeState(2), sci = s.derived.stationOfKind[StationKind.Science]!, nav = s.derived.stationOfKind[StationKind.Navigation]!;
    sitDown(s, 0, sci); sitDown(s, 1, nav); s.science.scanning = 1;
    standUp(s, 1);
    expect(s.science.scanning).toBe(1);
    standUp(s, 0);
    expect(s.science.scanning).toBe(0);
  });
});
```

In `tests/snapshot.test.ts` change the version test to 4 (`simVersion: 4`, `values[0] = 4`, name "rejects a version-4 snapshot ...") and add:

```ts
  it('round-trips frequency, scan state, the weapon selector, torpedo state and scanning; each new field alone changes the hash', () => {
    const s = makeState(2, 5);
    placeDebris(s, 3, 900, 1, undefined, 3); s.debris.scanned[0] = 1; s.debris.scan[0] = 1; placeDebris(s, 4, 1200, 1, undefined, 2); s.debris.scan[1] = 0.4;
    s.weapons.selector = 3; s.weapons.torpedoStock = 5; s.weapons.torpedoLoaded = 1; s.weapons.torpedoLoad = 0.25; s.weapons.torpedoRegen = 0.5; s.science.scanning = 1;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect(hashState(t)).toBe(hashState(s));
    expect(Array.from(t.debris.frequency)).toEqual(Array.from(s.debris.frequency));
    expect(Array.from(t.debris.scanned)).toEqual(Array.from(s.debris.scanned));
    expect(Array.from(t.debris.scan)).toEqual(Array.from(s.debris.scan));
    expect(t.weapons).toEqual(s.weapons); expect(t.science).toEqual(s.science);
    const base = hashState(makeState(2, 5));
    const mutate = (f: (u: ReturnType<typeof makeState>) => void) => { const u = makeState(2, 5); f(u); return hashState(u); };
    expect(mutate((u) => { u.debris.frequency[2] = 1; })).not.toBe(base);
    expect(mutate((u) => { u.debris.scanned[2] = 1; })).not.toBe(base);
    expect(mutate((u) => { u.debris.scan[2] = 0.5; })).not.toBe(base);
    expect(mutate((u) => { u.weapons.selector = 1; })).not.toBe(base);
    expect(mutate((u) => { u.weapons.torpedoStock = 2; })).not.toBe(base);
    expect(mutate((u) => { u.weapons.torpedoLoaded = 1; })).not.toBe(base);
    expect(mutate((u) => { u.weapons.torpedoLoad = 0.5; })).not.toBe(base);
    expect(mutate((u) => { u.weapons.torpedoRegen = 0.5; })).not.toBe(base);
    expect(mutate((u) => { u.science.scanning = 1; })).not.toBe(base);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/debris.test.ts tests/snapshot.test.ts`
Expected: FAIL (`frequency` undefined, `cycleTarget` missing, `science` undefined, version-4 accepted).

- [ ] **Step 3: Tuning, state, flatten**

`tuning.ts`: `SIM_VERSION = 5`; delete `BEAM_HIT_BASE` and `BEAM_HIT_SCALE`; append

```ts
// Scanning, frequencies and torpedoes (increment 2b-ii)
export const FREQ_COUNT = 3;
export const SCAN_TIME = 6;                           // seconds at output 1 (16 / 8 / 5.3 s at Science levels 1 / 2 / 3)
export const BEAM_MATCH_BASE = 0.65, BEAM_MATCH_SCALE = 0.30;   // beam tuned to the object's frequency
export const BEAM_MISS_BASE = 0.15, BEAM_MISS_SCALE = 0.10;     // beam on any other frequency
export const TORP_HIT_BASE = 0.85, TORP_HIT_SCALE = 0.10;       // homing: frequency does not matter
export const TORP_START = 3, TORP_CAP = 6;
export const TORP_LOAD_TIME = 10;                     // seconds at output 1 to move one from stock into the tube
export const TORP_REGEN_TIME = 90;                    // seconds per stock unit while Weapons is online
```

(`weapons.ts` still imports the deleted names until Task 3; to keep the build green in this task, change its import to `BEAM_MATCH_BASE, BEAM_MATCH_SCALE` and use them in `beamHits` for now, with the comment `// matched-beam threshold; Task 3 adds the mismatch branch`. Existing weapons tests that pin 0.625 / 0.70 / 0.775 will fail: update those three literals in `tests/weapons.test.ts` to the matched thresholds 0.80 / 0.875 / 0.95 with probes `0.78/0.82`, `0.86/0.89`, `0.94/0.96`, and change the hit/miss pins in the firing test to combat seeds `7` (hit) and `36` (miss). Task 3 rewrites these tests fully.)

`state.ts`:

```ts
  debris: { active: Uint8Array; stableId: Int32Array; room: Int16Array; impactTick: Int32Array; warned: Uint8Array; frequency: Uint8Array; scanned: Uint8Array; scan: Float64Array };
  weapons: { charge: number; selector: number; torpedoStock: number; torpedoLoaded: number; torpedoLoad: number; torpedoRegen: number };   // selector 0..2 beam F1..F3, 3 torpedo
  science: { scanning: number };                        // 1 while a scan is running (spec 2b-ii section 4)
```

initialiser: `debris: { ...as today, frequency: new Uint8Array(DEBRIS_SLOTS), scanned: new Uint8Array(DEBRIS_SLOTS), scan: new Float64Array(DEBRIS_SLOTS) }`, `weapons: { charge: 0, selector: 0, torpedoStock: TORP_START, torpedoLoaded: 0, torpedoLoad: 0, torpedoRegen: 0 }`, `science: { scanning: 0 }` (import `TORP_START`).

`flatten.ts`: manifest `[..., 'debris', 'weapons', 'science', 'crew']`; `DEBRIS_FIELDS = 8, WEAPONS_FIELDS = 6, SCIENCE_FIELDS = 1`; add `SCIENCE_FIELDS` to `size()`. In `flatten`, after the `warned` loop: `for (const v of dbf.frequency) put(v); for (const v of dbf.scanned) put(v); for (const v of dbf.scan) put(v);`; replace `put(s.weapons.charge);` with `const w = s.weapons; put(w.charge); put(w.selector); put(w.torpedoStock); put(w.torpedoLoaded); put(w.torpedoLoad); put(w.torpedoRegen); put(s.science.scanning);`. Mirror in `unflatten` (three `DEBRIS_SLOTS` loops for frequency, scanned, scan; then `s.weapons.charge = get(); s.weapons.selector = get(); ...; s.science.scanning = get();`).

- [ ] **Step 4: Debris, targets, stations**

`debrisTargets.ts` add (import `Dir` from `./dir`):

```ts
/** Up/Down cycle the warned targets by StableId with wrap; with none the cursor is -1. Shared by Weapons and Science (spec 2b-ii section 4). */
export function cycleTarget(state: SimState, i: number, dir: number): void {
  const list = warnedTargets(state), c = state.stations.cursor;
  if (!list.length) { c[i] = -1; return; }
  if (dir !== Dir.Up && dir !== Dir.Down) return;
  const k = list.indexOf(c[i]!), n = list.length;
  c[i] = list[k < 0 ? 0 : dir === Dir.Up ? (k + n - 1) % n : (k + 1) % n]!;
}
```

`debris.ts`: in `spawnDebris`, after the flight draw: `const frequency = 1 + nextInt(state.rng.hazards, FREQ_COUNT);` and set `db.frequency[slot] = frequency; db.scanned[slot] = 0; db.scan[slot] = 0;`. Replace `removeDebris`:

```ts
const TARGETING_KINDS = [StationKind.Weapons, StationKind.Science] as const;

/** Free a slot. Every targeting console's cursor is retargeted by StableId before the identity is cleared, so the target order survives removal. */
export function removeDebris(state: SimState, slot: number): void {
  const db = state.debris;
  for (const kind of TARGETING_KINDS) {
    const i = state.derived.stationOfKind[kind]!;
    if (i >= 0 && state.stations.cursor[i] === slot) state.stations.cursor[i] = nextTarget(state, db.stableId[slot]!, slot);
  }
  db.active[slot] = 0; db.warned[slot] = 0; db.stableId[slot] = 0; db.frequency[slot] = 0; db.scanned[slot] = 0; db.scan[slot] = 0;
}
```

In `debrisSystem`, replace the Weapons-only auto-select with a loop over `TARGETING_KINDS`: `for (const kind of TARGETING_KINDS) { const i = state.derived.stationOfKind[kind]!; if (i >= 0 && state.stations.occupant[i]! >= 0 && state.stations.cursor[i]! < 0) state.stations.cursor[i] = k; }` (drop the `wpn` local).

`stations.ts`: `sitDown` cursor case `kind === StationKind.Weapons || kind === StationKind.Science ? (warnedTargets(state)[0] ?? -1)`; `standUp` after clearing the seat: `if (state.derived.stationKind[i] === StationKind.Science) state.science.scanning = 0;   // spec 2b-ii section 4: any stand pauses the scan`.

- [ ] **Step 5: Run the tests, typecheck, re-bless the golden**

`npx vitest run tests/debris.test.ts tests/snapshot.test.ts tests/weapons.test.ts` → PASS. `npm run typecheck` → clean. `npm test` → `tests/golden.test.ts` fails (version 5, new hashed fields, one extra hazards draw per debris spawn); `tests/gate-survival.test.ts` may change its hull figures (the hazards stream shifts after the first debris spawn); if a seed fails, report BLOCKED with the figures. `npm run bless`; `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/tuning.ts src/renderer/src/sim/state.ts src/renderer/src/sim/flatten.ts src/renderer/src/sim/debris.ts src/renderer/src/sim/debrisTargets.ts src/renderer/src/sim/stations.ts src/renderer/src/sim/weapons.ts tests/helpers/sim.ts tests/debris.test.ts tests/snapshot.test.ts tests/weapons.test.ts tests/golden/basic.json
git commit -m "feat: debris frequency, scan state, weapon selector and torpedo state; Science cursor shares the target model; SIM_VERSION 5

Golden re-blessed: SIM_VERSION 5, new hashed fields, and one extra rng.hazards draw per debris spawn (the frequency)."
```

---

### Task 2: Science scanning

**Files:**
- Create: `src/renderer/src/sim/science.ts`
- Modify: `src/renderer/src/sim/console.ts`
- Test: `tests/science.test.ts` (new)

**Interfaces:**
- Consumes: `cycleTarget`, `science.scanning`, `debris.scanned/scan`, `stationOutput`, `SCAN_TIME`.
- Produces: `scienceInput(state, i, dir, confirm)`, `scanStep(state)`; `consoleSystem` calls `scanStep` after `chargeBeam` and dispatches Science to `scienceInput`.

- [ ] **Step 1: Write the failing tests**

Create `tests/science.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { scanStep } from '../src/renderer/src/sim/science';
import { Seated } from '../src/renderer/src/sim/components';
import { DT, SCAN_TIME } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, placeDebris, room, seconds, overdrive } from './helpers/sim';

const sci = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Science]!;
const confirm = { confirmPressed: true }, down = { moveY: 1 }, cancel = { cancelPressed: true };

describe('scanning', () => {
  it('Confirm starts a scan of an unscanned target; progress is DT x output / SCAN_TIME per tick; completion marks scanned and stops', () => {
    const s = makeState(1), i = sci(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
    placeDebris(s, A, 1e6, 1, undefined, 2);
    sitDown(s, 0, i);                                                           // starter Science level 1: output 0.375
    run(s, 5);
    expect(s.debris.scan[0]).toBe(0); expect(s.science.scanning).toBe(0);     // seated but no Confirm: nothing
    run(s, 1, () => intents(confirm));
    expect(s.science.scanning).toBe(1); expect(s.debris.scan[0]).toBe(0);     // starts this tick, progresses from the next
    run(s, 1);
    expect(s.debris.scan[0]).toBeCloseTo(DT * 0.375 / SCAN_TIME);
    run(s, seconds(16) + 1);
    expect(s.debris.scanned[0]).toBe(1); expect(s.debris.scan[0]).toBe(1); expect(s.science.scanning).toBe(0);
    run(s, 1, () => intents(confirm));
    expect(s.science.scanning).toBe(0);                                        // Confirm on a scanned object does nothing
  });
  it('level 2 scans within 8 s; overdriven within 5.4 s; unmanned or offline never progresses', () => {
    const a = makeState(1), ia = sci(a), A = room(a, 'A');
    a.spawner.nextSpawnTick = 1e9; a.stations.level[ia] = 2; placeDebris(a, A, 1e6, 1); sitDown(a, 0, ia);
    run(a, 1, () => intents(confirm)); run(a, seconds(8) + 2);
    expect(a.debris.scanned[0]).toBe(1);
    const b = makeState(1), ib = overdrive(b, StationKind.Science);
    b.spawner.nextSpawnTick = 1e9; placeDebris(b, A, 1e6, 1); sitDown(b, 0, ib);
    run(b, 1, () => intents(confirm)); run(b, Math.ceil(seconds(6 / 1.125)) + 2);
    expect(b.debris.scanned[0]).toBe(1);
    const c = makeState(1), ic = sci(c);
    c.spawner.nextSpawnTick = 1e9; placeDebris(c, A, 1e6, 1); c.science.scanning = 1; c.stations.cursor[ic] = 0;
    run(c, seconds(5));
    expect(c.debris.scan[0]).toBe(0);                                           // nobody seated
    sitDown(c, 0, ic); failStation(c, ic);
    c.science.scanning = 1; run(c, seconds(5));
    expect(c.debris.scan[0]).toBe(0);                                           // offline (and the failure stood the operator)
  });
  it('switching targets pauses the first object and resumes the second from its own progress; Cancel clears scanning and a re-seat resumes', () => {
    const s = makeState(1), i = sci(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
    placeDebris(s, A, 1e6, 1, 10); placeDebris(s, A, 1e6, 1, 20);
    sitDown(s, 0, i);
    run(s, 1, () => intents(confirm)); run(s, seconds(4));
    const first = s.debris.scan[0]!; expect(first).toBeGreaterThan(0); expect(first).toBeLessThan(1);
    run(s, 1, () => intents(down)); run(s, seconds(2));                          // cursor to slot 1: scanning continues there
    expect(s.stations.cursor[i]).toBe(1); expect(s.science.scanning).toBe(1);
    expect(s.debris.scan[0]).toBe(first); expect(s.debris.scan[1]).toBeGreaterThan(0);
    const second = s.debris.scan[1]!;
    run(s, 1, () => intents(cancel));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(s.science.scanning).toBe(0);
    run(s, seconds(2));
    expect(s.debris.scan[1]).toBe(second);                                       // paused, not lost
    sitDown(s, 0, i); s.stations.cursor[i] = 1;
    run(s, 1, () => intents(confirm)); run(s, 1);
    expect(s.debris.scan[1]).toBeGreaterThan(second);                            // resumed from the kept progress
  });
  it('impact or destruction of the object being scanned discards its progress and retargets', () => {
    const s = makeState(1), i = sci(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9;
    placeDebris(s, A, seconds(3), 1, 10); placeDebris(s, A, 1e6, 1, 20);
    sitDown(s, 0, i);
    run(s, 1, () => intents(confirm)); run(s, seconds(1));
    expect(s.debris.scan[0]).toBeGreaterThan(0);
    run(s, seconds(2) + 1);                                                      // slot 0 impacts
    expect(s.debris.active[0]).toBe(0); expect(s.debris.scan[0]).toBe(0); expect(s.stations.cursor[i]).toBe(1);
    expect(s.science.scanning).toBe(1);                                          // still scanning: now the retargeted object
    scanStep(s);
    expect(s.debris.scan[1]).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/science.test.ts` → FAIL (`science.ts` missing).

- [ ] **Step 3: Implement**

Create `src/renderer/src/sim/science.ts`:

```ts
import type { SimState } from './state';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { cycleTarget } from './debrisTargets';
import { DT, SCAN_TIME } from './tuning';

/** Seated Science input: Up/Down cycle warned targets; Confirm starts a scan of the selected unscanned object (spec 2b-ii section 4). */
export function scienceInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  cycleTarget(state, i, dir);
  if (!confirm) return;
  const c = state.stations.cursor[i]!, db = state.debris;
  if (c >= 0 && db.active[c] && db.warned[c] && !db.scanned[c]) state.science.scanning = 1;
}

/** Once per tick: the running scan progresses while Science is online and occupied and its cursor is a warned, unscanned object. */
export function scanStep(state: SimState): void {
  if (!state.science.scanning) return;
  const sci = state.derived.stationOfKind[StationKind.Science]!;
  if (sci < 0 || !stationOnline(state, sci) || state.stations.occupant[sci]! < 0) return;
  const c = state.stations.cursor[sci]!, db = state.debris;
  if (c < 0 || !db.active[c] || !db.warned[c] || db.scanned[c]) return;
  db.scan[c] = Math.min(1, db.scan[c]! + DT * stationOutput(state, sci) / SCAN_TIME);
  if (db.scan[c]! >= 1) { db.scanned[c] = 1; state.science.scanning = 0; }
}
```

`console.ts`: import `scienceInput, scanStep` from `./science`; call `scanStep(state);` right after `chargeBeam(state);`; add `else if (kind === StationKind.Science) scienceInput(state, i, dir, it.confirmPressed);` and update the trailing comment to "Navigation, Life Support, Medbay: no seated controls."

- [ ] **Step 4: Run, typecheck, full suite**

`npx vitest run tests/science.test.ts tests/console.test.ts` → PASS. `npm run typecheck`, `npm test`, `npm run build` → clean (golden unchanged: the replay has no Science Confirm).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/science.ts src/renderer/src/sim/console.ts tests/science.test.ts
git commit -m "feat: Science scans the selected warned object, revealing its frequency; progress pauses on stand or retarget"
```

---

### Task 3: Weapon selector, tuned beams, torpedoes

**Files:**
- Create: `src/renderer/src/sim/torpedoes.ts`
- Modify: `src/renderer/src/sim/weapons.ts`, `src/renderer/src/sim/console.ts`
- Test: `tests/weapons.test.ts` (rewrite the targeting/firing tests), `tests/torpedoes.test.ts` (new)

**Interfaces:**
- Produces: `Weapon = { BeamF1: 0, BeamF2: 1, BeamF3: 2, Torpedo: 3 }`, `beamHits(u, output, match)`, `torpedoHits(u, output)`, `fireWeapon(state): boolean`, `weaponsInput` with Left/Right; `regenTorpedo(state)`, `loadTorpedo(state)`; `consoleSystem` order `chargeBeam, regenTorpedo, loadTorpedo, scanStep`.

- [ ] **Step 1: Write the failing tests**

In `tests/weapons.test.ts`: change the import to `beamHits, torpedoHits, chargeBeam, fireWeapon, Weapon`; add `left = { moveX: -1 }, right = { moveX: 1 }`; keep the `beam charge` describe; keep the `targeting` describe's Up/Down test but add at its end `run(s, 1, () => intents(right)); expect(s.stations.cursor[i]).toBe(1);   // left/right leave the target alone`. Replace the whole `firing` describe with:

```ts
describe('selector', () => {
  it('Left/Right cycle F1, F2, F3, Torpedo with wrap and survive standing; Up/Down still cycle targets', () => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; placeDebris(s, A, 600, 1); sitDown(s, 0, i);
    expect(s.weapons.selector).toBe(Weapon.BeamF1);
    const edge = (p: { moveX?: number; moveY?: number }) => { run(s, 1, () => intents(p)); run(s, 1, () => intents({})); };
    edge(right); expect(s.weapons.selector).toBe(Weapon.BeamF2);
    edge(right); edge(right); expect(s.weapons.selector).toBe(Weapon.Torpedo);
    edge(right); expect(s.weapons.selector).toBe(Weapon.BeamF1);                 // wraps
    edge(left); expect(s.weapons.selector).toBe(Weapon.Torpedo);                 // wraps backwards
    edge(down); expect(s.weapons.selector).toBe(Weapon.Torpedo); expect(s.stations.cursor[i]).toBe(0);
    run(s, 1, () => intents({ cancelPressed: true })); sitDown(s, 0, i);
    expect(s.weapons.selector).toBe(Weapon.Torpedo);                             // persists across sits
  });
});

describe('firing', () => {
  const armed = (selector: number, frequency: number, combatSeed: number) => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; placeDebris(s, A, 600, 1, undefined, frequency); sitDown(s, 0, i);
    s.weapons.charge = 1; s.weapons.torpedoLoaded = 1; s.weapons.selector = selector; s.rng.combat.s = combatSeed;
    const one = createRng(combatSeed); nextFloat(one);
    return { s, i, one };
  };
  it('a matched beam hits on 0.627 and a mismatched one misses on the same draw; charge resets and the torpedo is untouched either way', () => {
    const hit = armed(Weapon.BeamF2, 2, 1);                                      // level 2: match threshold 0.875
    expect(fireWeapon(hit.s)).toBe(true);
    expect(hit.s.debris.active[0]).toBe(0); expect(hit.s.weapons.charge).toBe(0); expect(hit.s.weapons.torpedoLoaded).toBe(1); expect(hit.s.rng.combat.s).toBe(hit.one.s);
    const miss = armed(Weapon.BeamF1, 2, 1);                                     // mismatch threshold 0.225
    expect(fireWeapon(miss.s)).toBe(false);
    expect(miss.s.debris.active[0]).toBe(1); expect(miss.s.weapons.charge).toBe(0); expect(miss.s.weapons.torpedoLoaded).toBe(1); expect(miss.s.rng.combat.s).toBe(miss.one.s);
    const unscanned = armed(Weapon.BeamF3, 3, 1);                                // the true frequency decides, scanned or not
    expect(unscanned.s.debris.scanned[0]).toBe(0); expect(fireWeapon(unscanned.s)).toBe(true);
  });
  it('a torpedo hits on 0.627 regardless of frequency, misses on 0.956, clears loaded either way and leaves the beam charge', () => {
    const hit = armed(Weapon.Torpedo, 1, 1);
    expect(fireWeapon(hit.s)).toBe(true);
    expect(hit.s.debris.active[0]).toBe(0); expect(hit.s.weapons.torpedoLoaded).toBe(0); expect(hit.s.weapons.charge).toBe(1); expect(hit.s.weapons.torpedoStock).toBe(3); expect(hit.s.rng.combat.s).toBe(hit.one.s);
    const miss = armed(Weapon.Torpedo, 1, 36);
    expect(fireWeapon(miss.s)).toBe(false);
    expect(miss.s.debris.active[0]).toBe(1); expect(miss.s.weapons.torpedoLoaded).toBe(0); expect(miss.s.weapons.charge).toBe(1); expect(miss.s.rng.combat.s).toBe(miss.one.s);
  });
  it('an unready weapon or a missing target draws nothing: torpedo slot with nothing loaded despite a full charge, beam slot with no charge despite a loaded torpedo', () => {
    const s = makeState(1), i = wpn(s), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, i); s.weapons.charge = 1; s.weapons.torpedoLoaded = 1;
    const c0 = s.rng.combat.s;
    run(s, 1, () => intents(confirm));
    expect(s.weapons.charge).toBe(1); expect(s.weapons.torpedoLoaded).toBe(1); expect(s.rng.combat.s).toBe(c0);   // no target
    placeDebris(s, A, 600, 1); s.stations.cursor[i] = 0;
    s.weapons.selector = Weapon.Torpedo; s.weapons.torpedoLoaded = 0; s.weapons.torpedoStock = 0;
    run(s, 1, () => intents(confirm));
    expect(s.debris.active[0]).toBe(1); expect(s.weapons.charge).toBe(1); expect(s.rng.combat.s).toBe(c0);
    s.weapons.selector = Weapon.BeamF1; s.weapons.charge = 0.5; s.weapons.torpedoLoaded = 1;
    run(s, 1, () => intents(confirm));
    expect(s.debris.active[0]).toBe(1); expect(s.weapons.torpedoLoaded).toBe(1); expect(s.rng.combat.s).toBe(c0);
  });
  it('beamHits and torpedoHits thresholds at outputs 0.5, 0.75, 1.0, probed clear of float boundaries; a match never loses to a mismatch', () => {
    expect(beamHits(0.78, 0.5, true)).toBe(true); expect(beamHits(0.82, 0.5, true)).toBe(false);       // 0.80
    expect(beamHits(0.86, 0.75, true)).toBe(true); expect(beamHits(0.89, 0.75, true)).toBe(false);     // 0.875
    expect(beamHits(0.94, 1.0, true)).toBe(true); expect(beamHits(0.96, 1.0, true)).toBe(false);       // 0.95
    expect(beamHits(0.19, 0.5, false)).toBe(true); expect(beamHits(0.21, 0.5, false)).toBe(false);     // 0.20
    expect(beamHits(0.21, 0.75, false)).toBe(true); expect(beamHits(0.24, 0.75, false)).toBe(false);   // 0.225
    expect(beamHits(0.24, 1.0, false)).toBe(true); expect(beamHits(0.26, 1.0, false)).toBe(false);     // 0.25
    expect(torpedoHits(0.89, 0.5)).toBe(true); expect(torpedoHits(0.91, 0.5)).toBe(false);             // 0.90
    expect(torpedoHits(0.91, 0.75)).toBe(true); expect(torpedoHits(0.94, 0.75)).toBe(false);           // 0.925
    expect(torpedoHits(0.94, 1.0)).toBe(true); expect(torpedoHits(0.96, 1.0)).toBe(false);             // 0.95
    for (const o of [0.25, 0.5, 0.75, 1.0, 1.125]) for (let u = 0.005; u < 1; u += 0.01) expect(Number(beamHits(u, o, true))).toBeGreaterThanOrEqual(Number(beamHits(u, o, false)));
  });
});
```

Create `tests/torpedoes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation, repairStation, shiftBar } from '../src/renderer/src/sim/power';
import { Seated } from '../src/renderer/src/sim/components';
import { DT, TORP_LOAD_TIME, TORP_REGEN_TIME, TORP_START, TORP_CAP } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, seconds, overdrive } from './helpers/sim';

const wpn = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Weapons]!;

describe('torpedo loading', () => {
  it('loads only while seated and online with stock and an empty tube; completion moves one from stock to the tube', () => {
    const s = makeState(1), i = wpn(s);
    s.spawner.nextSpawnTick = 1e9;
    expect(s.weapons.torpedoStock).toBe(TORP_START);
    run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(0);                                      // nobody seated
    sitDown(s, 0, i);                                                           // level 2: output 0.75
    run(s, 1);
    expect(s.weapons.torpedoLoad).toBeCloseTo(DT * 0.75 / TORP_LOAD_TIME);
    run(s, Math.ceil(seconds(TORP_LOAD_TIME / 0.75)) + 2);
    expect(s.weapons.torpedoLoaded).toBe(1); expect(s.weapons.torpedoStock).toBe(TORP_START - 1); expect(s.weapons.torpedoLoad).toBe(0);
    run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(0);                                      // tube full: no second load
    s.weapons.torpedoLoaded = 0; s.weapons.torpedoStock = 0;
    run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(0);                                      // no stock
  });
  it('standing or failing mid-load keeps progress and stock; a loaded torpedo survives both; level 1 and overdrive load in 20 s and 10 s', () => {
    const s = makeState(2), i = wpn(s);
    s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, i);
    run(s, seconds(5));
    const partial = s.weapons.torpedoLoad; expect(partial).toBeGreaterThan(0);
    run(s, 1, () => intents({ cancelPressed: true }, {})); run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(partial); expect(s.weapons.torpedoStock).toBe(TORP_START);
    sitDown(s, 0, i); failStation(s, i); run(s, 60);
    expect(s.weapons.torpedoLoad).toBe(partial); expect(Seated.station[s.crew[0]!]).toBe(-1);
    repairStation(s, i); shiftBar(s, i, 1); shiftBar(s, i, 1);                 // back online at level 2 (the pool had 1 + 2 returned bars)
    s.weapons.torpedoLoaded = 1; sitDown(s, 0, i);
    run(s, 1, () => intents({ cancelPressed: true }, {})); failStation(s, i);
    expect(s.weapons.torpedoLoaded).toBe(1);
    const a = makeState(1), ia = wpn(a); a.spawner.nextSpawnTick = 1e9; a.stations.level[ia] = 1; sitDown(a, 0, ia);
    run(a, seconds(20) + 2); expect(a.weapons.torpedoLoaded).toBe(1);
    const b = makeState(1), ib = overdrive(b, StationKind.Weapons); b.spawner.nextSpawnTick = 1e9; sitDown(b, 0, ib);
    run(b, seconds(10) + 2); expect(b.weapons.torpedoLoaded).toBe(1);
    run(a, seconds(19)); expect(a.weapons.torpedoLoaded).toBe(1); expect(a.weapons.torpedoLoad).toBe(0);   // tube full: nothing loads until it is fired
  });
});

describe('torpedo regeneration', () => {
  it('adds one unit every TORP_REGEN_TIME s while Weapons is online, seated or not; holds at the cap; pauses offline', () => {
    const s = makeState(1), i = wpn(s);
    s.spawner.nextSpawnTick = 1e9;
    run(s, 1);
    expect(s.weapons.torpedoRegen).toBeCloseTo(DT / TORP_REGEN_TIME);
    run(s, seconds(TORP_REGEN_TIME) + 1);
    expect(s.weapons.torpedoStock).toBe(TORP_START + 1); expect(s.weapons.torpedoRegen).toBeLessThan(0.01);
    s.weapons.torpedoStock = TORP_CAP; s.weapons.torpedoRegen = 0.5;
    run(s, 60);
    expect(s.weapons.torpedoStock).toBe(TORP_CAP); expect(s.weapons.torpedoRegen).toBe(0.5);   // holds at the cap
    s.weapons.torpedoStock = 2; failStation(s, i);
    run(s, 60);
    expect(s.weapons.torpedoRegen).toBe(0.5);                                   // offline: paused
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/weapons.test.ts tests/torpedoes.test.ts` → FAIL (`Weapon`, `fireWeapon`, `torpedoHits` missing; `torpedoes.ts` missing).

- [ ] **Step 3: Implement**

Rewrite `src/renderer/src/sim/weapons.ts`:

```ts
import type { SimState } from './state';
import { nextFloat } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { removeDebris } from './debris';
import { cycleTarget } from './debrisTargets';
import { Dir } from './dir';
import { DT, BEAM_CHARGE_TIME, BEAM_MATCH_BASE, BEAM_MATCH_SCALE, BEAM_MISS_BASE, BEAM_MISS_SCALE, TORP_HIT_BASE, TORP_HIT_SCALE } from './tuning';

/** The four-slot weapon selector (spec 2b-ii section 5): beams tuned to frequency selector + 1, then the torpedo. */
export const Weapon = { BeamF1: 0, BeamF2: 1, BeamF3: 2, Torpedo: 3 } as const;
const WEAPON_COUNT = 4;

/** Pure beam threshold: matched to the object's frequency or not. */
export function beamHits(u: number, output: number, match: boolean): boolean {
  return u < (match ? BEAM_MATCH_BASE + BEAM_MATCH_SCALE * output : BEAM_MISS_BASE + BEAM_MISS_SCALE * output);
}

/** Pure torpedo threshold: homing, so frequency plays no part. */
export function torpedoHits(u: number, output: number): boolean {
  return u < TORP_HIT_BASE + TORP_HIT_SCALE * output;
}

/** Once per tick: the beam charges while Weapons is online and occupied; the charge is kept otherwise (spec 2a-ii section 5). */
export function chargeBeam(state: SimState): void {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!;
  if (wpn < 0 || !stationOnline(state, wpn) || state.stations.occupant[wpn]! < 0) return;
  state.weapons.charge = Math.min(1, state.weapons.charge + DT * stationOutput(state, wpn) / BEAM_CHARGE_TIME);
}

/** Fire the selected weapon at the cursor's object. Beam needs a full charge, torpedo a loaded tube; one rng.combat draw; the readiness resets either way. */
export function fireWeapon(state: SimState): boolean {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!, db = state.debris, w = state.weapons;
  if (wpn < 0 || !stationOnline(state, wpn) || state.stations.occupant[wpn]! < 0) return false;
  const c = state.stations.cursor[wpn]!;
  if (c < 0 || !db.active[c] || !db.warned[c]) return false;
  const output = stationOutput(state, wpn);
  let hit: boolean;
  if (w.selector === Weapon.Torpedo) {
    if (!w.torpedoLoaded) return false;
    hit = torpedoHits(nextFloat(state.rng.combat), output);
    w.torpedoLoaded = 0;                                                       // the stock was spent when the tube loaded
  } else {
    if (w.charge < 1) return false;
    hit = beamHits(nextFloat(state.rng.combat), output, w.selector + 1 === db.frequency[c]);   // the true frequency decides, scanned or not
    w.charge = 0;
  }
  if (hit) removeDebris(state, c);
  return hit;
}

/** Seated Weapons input: Up/Down cycle warned targets, Left/Right cycle the selector with wrap, Confirm fires. */
export function weaponsInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  cycleTarget(state, i, dir);
  if (dir === Dir.Left) state.weapons.selector = (state.weapons.selector + WEAPON_COUNT - 1) % WEAPON_COUNT;
  else if (dir === Dir.Right) state.weapons.selector = (state.weapons.selector + 1) % WEAPON_COUNT;
  if (confirm) fireWeapon(state);
}
```

Create `src/renderer/src/sim/torpedoes.ts`:

```ts
import type { SimState } from './state';
import { StationKind } from './stationKinds';
import { stationOnline, stationOutput } from './stations';
import { DT, TORP_LOAD_TIME, TORP_REGEN_TIME, TORP_CAP } from './tuning';

/** Once per tick: one stock unit regenerates every TORP_REGEN_TIME s while Weapons is online, seated or not; holds at the cap (spec 2b-ii section 5). */
export function regenTorpedo(state: SimState): void {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!, w = state.weapons;
  if (wpn < 0 || !stationOnline(state, wpn) || w.torpedoStock >= TORP_CAP) return;
  w.torpedoRegen = Math.min(1, w.torpedoRegen + DT / TORP_REGEN_TIME);
  if (w.torpedoRegen >= 1) { w.torpedoStock += 1; w.torpedoRegen = 0; }
}

/** Once per tick: the tube loads while Weapons is online and occupied, empty, with stock; completion moves one unit from stock into the tube. */
export function loadTorpedo(state: SimState): void {
  const wpn = state.derived.stationOfKind[StationKind.Weapons]!, w = state.weapons;
  if (wpn < 0 || !stationOnline(state, wpn) || state.stations.occupant[wpn]! < 0) return;
  if (w.torpedoLoaded || w.torpedoStock <= 0) return;
  w.torpedoLoad = Math.min(1, w.torpedoLoad + DT * stationOutput(state, wpn) / TORP_LOAD_TIME);
  if (w.torpedoLoad >= 1) { w.torpedoLoaded = 1; w.torpedoStock -= 1; w.torpedoLoad = 0; }
}
```

`console.ts`: import `regenTorpedo, loadTorpedo` from `./torpedoes`; the per-tick prologue becomes `chargeBeam(state); regenTorpedo(state); loadTorpedo(state); scanStep(state);`.

- [ ] **Step 4: Run, typecheck, full suite**

`npx vitest run tests/weapons.test.ts tests/torpedoes.test.ts tests/console.test.ts tests/debris.test.ts` → PASS. `npm run typecheck`, `npm test`, `npm run build` → clean. The golden replay must be unchanged: the recorded replay seats nobody at Weapons, and regeneration only moves `torpedoRegen` (hashed) — if the golden test fails because regen progress now advances in the replay, that is expected; re-bless with the cause "torpedo regeneration advances while Weapons is online" stated in the commit message and report it.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/weapons.ts src/renderer/src/sim/torpedoes.ts src/renderer/src/sim/console.ts tests/weapons.test.ts tests/torpedoes.test.ts tests/golden/basic.json
git commit -m "feat: four-slot weapon selector, frequency-matched beams, torpedo tube with regenerating stock"
```

(Include `tests/golden/basic.json` only if it was re-blessed.)

---

### Task 4: Scripted-intent gate, properties, snapshot continuation

**Files:**
- Test: `tests/console.test.ts`, `tests/weapons.test.ts`, `tests/snapshot.test.ts`

- [ ] **Step 1: Write the tests**

In `tests/console.test.ts`, replace the body of the test `Weapons: sit, charge to full, Confirm fires one shot (destroyed or missed, charge 0, one combat draw), Cancel stands` with the handoff gate (rename it `Science scans, Weapons retunes and fires a matched beam, then a torpedo`; imports to add: `Weapon` from weapons, `TORP_START` from tuning):

```ts
    const s = makeState(2), sci = idx(s, StationKind.Science), wpn = idx(s, StationKind.Weapons), A = room(s, 'A');
    s.spawner.nextSpawnTick = 1e9; s.stations.level[sci] = 2;                   // Science level 2: 8 s scan (the starter has 1)
    s.stations.level[idx(s, StationKind.LifeSupport)] = 1;                      // pay for it from Life Support (pool stays >= 0)
    placeDebris(s, A, seconds(30), 1, undefined, 3);
    at(s, 0, sci); at(s, 1, wpn);
    run(s, 1, () => intents(confirm, confirm));                                 // both sit
    expect(Seated.station[s.crew[0]!]).toBe(sci); expect(Seated.station[s.crew[1]!]).toBe(wpn);
    run(s, 1, () => intents(confirm, {}));                                      // Science starts the scan
    expect(s.science.scanning).toBe(1);
    run(s, seconds(8) + 2);
    expect(s.debris.scanned[0]).toBe(1);
    expect(buildHudModel(s, [{ status: 'active', key: 'kb:0' }, { status: 'active', key: 'kb:1' }], 'running', '').threats[0]!.text).toMatch(/F3$/);
    run(s, 1, () => intents({}, right)); run(s, 1, () => intents({}, {})); run(s, 1, () => intents({}, right)); run(s, 1, () => intents({}, {}));
    expect(s.weapons.selector).toBe(Weapon.BeamF3);
    run(s, seconds(12) + 2 - (seconds(8) + 6));                                 // the beam has been charging since the sit: top it up to 12 s + 2 ticks
    expect(s.weapons.charge).toBe(1);
    s.rng.combat.s = 7; const one = createRng(7); nextFloat(one);
    run(s, 1, () => intents({}, confirm));
    expect(s.debris.active[0]).toBe(0); expect(s.rng.combat.s).toBe(one.s); expect(s.weapons.charge).toBe(0);
    placeDebris(s, A, seconds(30), 1, undefined, 1);
    run(s, 1, () => intents({}, right)); run(s, 1, () => intents({}, {}));
    expect(s.weapons.selector).toBe(Weapon.Torpedo);
    run(s, seconds(14));                                                         // the tube has loaded since the sit (13.3 s at level 2); about 12 s have passed, so wait out the rest
    expect(s.weapons.torpedoLoaded).toBe(1);
    s.rng.combat.s = 7;
    run(s, 1, () => intents({}, confirm));
    expect(s.debris.active[1]).toBe(0); expect(s.weapons.torpedoLoaded).toBe(0); expect(s.weapons.torpedoStock).toBe(TORP_START - 1);
    run(s, 1, () => intents({ cancelPressed: true }, { cancelPressed: true }));
    expect(Seated.station[s.crew[0]!]).toBe(-1); expect(Seated.station[s.crew[1]!]).toBe(-1);
```

(`buildHudModel` from `../src/renderer/src/render/hudModel`; `tests/console.test.ts` may import it since it is pixi-free. If `slots` typing needs `SlotInfo`, cast the array `as any`-free by importing `type SlotInfo` from `../src/renderer/src/input/deviceManager` and typing the literal.)

Append to `tests/weapons.test.ts` (import `fc from 'fast-check'`, `TORP_CAP` from tuning):

```ts
describe('properties', () => {
  it('stock stays in 0..TORP_CAP, loaded is 0 or 1, stock only falls by one at a load completion, and draws equal shots', () => {
    const arbDir = fc.constantFrom({}, up, down);                                // no selector edges: the shot prediction below reads the selector before the tick
    const arbScript = fc.array(fc.record({ dir: arbDir, confirm: fc.boolean() }), { minLength: 1, maxLength: 240 });
    fc.assert(fc.property(fc.integer({ min: 1, max: 1e6 }), fc.constantFrom(0, 1, 2, 3), arbScript, (seed, selector, script) => {
      const s = makeState(1, seed), i = wpn(s), A = room(s, 'A');
      s.spawner.nextSpawnTick = 1e9; sitDown(s, 0, i); s.weapons.selector = selector;
      for (let k = 0; k < 3; k++) placeDebris(s, A, 1e6, 1, undefined, 1 + (k % 3));
      s.weapons.torpedoLoad = 0.99;                                               // the first load completes almost at once
      let draws = 0, shots = 0, prevStock = s.weapons.torpedoStock, prevLoaded = s.weapons.torpedoLoaded;
      for (const e of script) {
        for (let t = 0; t < 5; t++) {
          const before = s.rng.combat.s, w = s.weapons, c = s.stations.cursor[i]!;
          const ready = w.selector === Weapon.Torpedo ? w.torpedoLoaded === 1 : w.charge >= 1;
          const target = c >= 0 && s.debris.active[c] === 1 && s.debris.warned[c] === 1;
          const willShoot = e.confirm && ready && target && s.stations.occupant[i] === 0;
          run(s, 1, () => intents({ ...e.dir, confirmPressed: e.confirm }));
          if (s.rng.combat.s !== before) draws++; if (willShoot) shots++;
          if (w.torpedoStock < 0 || w.torpedoStock > TORP_CAP || (w.torpedoLoaded !== 0 && w.torpedoLoaded !== 1)) return false;
          if (w.torpedoStock < prevStock && !(w.torpedoStock === prevStock - 1 && w.torpedoLoaded === 1 && prevLoaded === 0)) return false;   // stock falls only by one, into the tube
          prevStock = w.torpedoStock; prevLoaded = w.torpedoLoaded;
          if (s.debris.active.every((a) => !a)) for (let k = 0; k < 3; k++) placeDebris(s, A, 1e6, 1, undefined, 1 + (k % 3));
        }
      }
      return draws === shots;
    }), { numRuns: 25 });
  });
});
```

(The `willShoot` prediction mirrors `fireWeapon`'s guards as they stand before the tick. Up/Down can retarget on the same tick, but every placed object is warned and active, so `target` stays true whenever the cursor is valid; the selector is fixed per run so `ready` is exact.)

Append to `tests/snapshot.test.ts`:

```ts
  it('a scan in progress saved mid-scan and continued hashes equal to the uninterrupted run', () => {
    const mk = () => { const s = makeState(1, 9); s.spawner.nextSpawnTick = 1e9; const sci = s.derived.stationOfKind[StationKind.Science]!; placeDebris(s, room(s, 'A'), 1e6, 1, undefined, 2); sitDown(s, 0, sci); s.science.scanning = 1; return s; };
    const whole = mk(); run(whole, 1200);
    expect(whole.debris.scanned[0]).toBe(1);                                     // 16 s scan at level 1 is done by 20 s
    const first = mk(); run(first, 500);
    expect(first.debris.scan[0]).toBeGreaterThan(0); expect(first.debris.scan[0]).toBeLessThan(1);
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(first))));
    run(resumed, 700);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
```

- [ ] **Step 2: Run**

`npx vitest run tests/console.test.ts tests/weapons.test.ts tests/snapshot.test.ts` → PASS (these are tests of behaviour already implemented; if one fails, the failure is a real defect or a fixture arithmetic error: report it with the output rather than loosening the assertion). `npm run typecheck`, `npm test`, `npm run build` → clean.

- [ ] **Step 3: Commit**

```bash
git add tests/console.test.ts tests/weapons.test.ts tests/snapshot.test.ts
git commit -m "test: Science-to-Weapons handoff gate, torpedo and draw-count properties, mid-scan save/load continuation"
```

---

### Task 5: HUD model and Pixi HUD

**Files:**
- Modify: `src/renderer/src/render/hudModel.ts`, `src/renderer/src/render/hud.ts`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Produces: `WeaponsPanel { kind: 'weapons'; charge; selector: number; torpedo: { stock: number; cap: number; loaded: boolean; load: number }; targets: { stableId; room; eta; frequency: number | null }[]; cursor }`; `SciencePanel { kind: 'science'; leadSeconds: number; targets: { stableId; room; eta; frequency: number | null; scan: number }[]; cursor: number; scanning: boolean }`; `HudModel.weapons { charge; ready; torpedoLoaded: boolean; torpedoStock: number }`; threat text suffix ` F<k>` when scanned.

- [ ] **Step 1: Write the failing tests**

In `tests/hud.test.ts` (import `TORP_START, TORP_CAP` from tuning): change the `m.weapons` expectation to `toEqual({ charge: 1, ready: true, torpedoLoaded: false, torpedoStock: TORP_START })`; in the Weapons panel test change the targets expectation to include `frequency: null` on each and add `expect(panel.selector).toBe(0); expect(panel.torpedo).toEqual({ stock: TORP_START, cap: TORP_CAP, loaded: false, load: 0 });`; replace the Science panel assertions (`leadSeconds`, `warnedCount`) with `expect(sciPanel.leadSeconds).toBeCloseTo(18); expect(sciPanel.targets).toHaveLength(1); expect(sciPanel.cursor).toBe(0); expect(sciPanel.scanning).toBe(false);` (the fixture seats Science with one warned object, so the sit selects it). Add:

```ts
  it('shows a scanned frequency in the threat text and on both panels, with scan progress and the selector and torpedo state', () => {
    const s = makeState(2), A = room(s, 'A'), B = room(s, 'B');
    const wpn = s.derived.stationOfKind[StationKind.Weapons]!, sci = s.derived.stationOfKind[StationKind.Science]!;
    placeDebris(s, A, 300, 1, 10, 2); placeDebris(s, B, 600, 1, 20, 3);
    s.debris.scanned[0] = 1; s.debris.scan[0] = 1; s.debris.scan[1] = 0.4;
    sitDown(s, 0, wpn); sitDown(s, 1, sci); s.science.scanning = 1; s.stations.cursor[sci] = 1;
    s.weapons.selector = 3; s.weapons.torpedoLoaded = 1; s.weapons.torpedoStock = 2; s.weapons.torpedoLoad = 0;
    const m = buildHudModel(s, slots(2), 'running', '');
    expect(m.threats.map((t) => t.text)).toEqual(['Debris: Bridge 5s F2', 'Debris: Weapons Bay 10s']);
    expect(m.weapons).toEqual({ charge: 0, ready: false, torpedoLoaded: true, torpedoStock: 2 });
    const w = m.players[0]!.console as WeaponsPanel;
    expect(w.selector).toBe(3); expect(w.torpedo).toEqual({ stock: 2, cap: TORP_CAP, loaded: true, load: 0 });
    expect(w.targets.map((t) => t.frequency)).toEqual([2, null]);
    const p = m.players[1]!.console as SciencePanel;
    expect(p.targets).toEqual([{ stableId: 10, room: 'Bridge', eta: 5, frequency: 2, scan: 1 }, { stableId: 20, room: 'Weapons Bay', eta: 10, frequency: null, scan: 0.4 }]);
    expect(p.cursor).toBe(1); expect(p.scanning).toBe(true);
  });
```

(Room names: check the fixture's existing expectations in this file for which room id maps to `Bridge` and `Weapons Bay`; adjust the two `room(s, ...)` ids so the names match, keeping A as the scanned one.)

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/hud.test.ts` → FAIL.

- [ ] **Step 3: HUD model**

`hudModel.ts`: import `TORP_CAP` from tuning. Types:

```ts
export interface DebrisTarget { stableId: number; room: string; eta: number; frequency: number | null }
export interface WeaponsPanel { kind: 'weapons'; charge: number; selector: number; torpedo: { stock: number; cap: number; loaded: boolean; load: number }; targets: DebrisTarget[]; cursor: number }
export interface SciencePanel { kind: 'science'; leadSeconds: number; targets: (DebrisTarget & { scan: number })[]; cursor: number; scanning: boolean }
```

`HudModel.weapons: { charge: number; ready: boolean; torpedoLoaded: boolean; torpedoStock: number }`. Helpers:

```ts
function target(state: SimState, k: number): DebrisTarget {
  return { stableId: state.debris.stableId[k]!, room: state.layout.rooms[state.debris.room[k]!]!.name, eta: etaSeconds(state, k), frequency: state.debris.scanned[k] ? state.debris.frequency[k]! : null };
}
```

Weapons panel: `const slots = warnedTargets(state), c = state.stations.cursor[i]!, w = state.weapons; return { kind: 'weapons', charge: w.charge, selector: w.selector, torpedo: { stock: w.torpedoStock, cap: TORP_CAP, loaded: w.torpedoLoaded === 1, load: w.torpedoLoad }, targets: slots.map((k) => target(state, k)), cursor: slots.indexOf(c) };`. Science panel: `const slots = warnedTargets(state), c = state.stations.cursor[i]!; return { kind: 'science', leadSeconds: scienceLead(state), targets: slots.map((k) => ({ ...target(state, k), scan: state.debris.scan[k]! })), cursor: slots.indexOf(c), scanning: state.science.scanning === 1 };`. Threat text: `` `Debris: ${room} ${eta}s${state.debris.scanned[k] ? ` F${state.debris.frequency[k]}` : ''}` ``. `weapons:` in the model: `state ? { charge, ready: charge >= 1, torpedoLoaded: state.weapons.torpedoLoaded === 1, torpedoStock: state.weapons.torpedoStock } : { charge: 0, ready: false, torpedoLoaded: false, torpedoStock: 0 }`.

- [ ] **Step 4: Pixi HUD**

`hud.ts` Weapons branch: row 0 is the selector line via `fillRow` on `ui.consoleRows[0]!.root`? No: keep `cellRow` rows for targets and add a dedicated selector `Container` per player (`consoleSelector`, positioned at `(8, 6)`, created next to `consoleRows`), shifting the Weapons target rows to start at row index 1 (`c.targets[k - 1]`). Selector text parts: `['Beam F1', 'F2', 'F3', 'Torp'].map((label, n) => ({ text: label, tint: n === c.selector ? TEXT : DIM }))` through `fillRow`. Target row name: `` `${t.room} ${t.eta}s F${t.frequency ?? '?'}` ``. Footer: beam text as today, then `c.torpedo.loaded ? 'Torp LOADED' : c.torpedo.stock > 0 ? \`Torp ${Math.floor(c.torpedo.load * 100)}%\` : 'Torp EMPTY'`, then `` `Stock ${c.torpedo.stock}/${c.torpedo.cap}` `` as three `fillRow` parts (first `TEXT` when ready/loaded, else `DIM`). Hide the selector container in every other branch.

Science branch (new, before the generic `'kind' in p.console` branch): rows `k` show `c.targets[k]` as `` `${t.room} ${t.eta}s F${t.frequency ?? '?'}` `` with cursor and tint like Weapons; for an unscanned target with `scan > 0` append ` ${Math.floor(t.scan * 100)}%` to the name (no extra bar: the 60 px bar of spec section 8 is replaced by a percentage so the row stays one `cellRow`; record this in Task 6's amendments). Footer: `` `Lead ${Math.round(c.leadSeconds)}s${c.scanning ? '   Scanning' : ''}` ``. The Navigation branch keeps the `Evade` footer; drop the `warnedCount` text.

- [ ] **Step 5: Run, typecheck, build**

`npx vitest run tests/hud.test.ts tests/render.test.ts tests/renderPure.test.ts` → PASS; `npm run typecheck`, `npm run build`, `npm test` → clean (no sim change; golden unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/hudModel.ts src/renderer/src/render/hud.ts tests/hud.test.ts
git commit -m "feat: HUD shows revealed frequencies, the weapon selector, torpedo tube and stock, and Science scan progress"
```

---

### Task 6: Gate, spec amendments

**Files:**
- Modify: `docs/gates.md`, `docs/superpowers/specs/2026-11-10-scanning-and-torpedoes-design.md`

- [ ] **Step 1: Gate section**

Append to `docs/gates.md`:

```markdown
## Increment 2b-ii: scanning, frequencies and torpedoes (closes the foundation's Increment 2b)
- [x] `npm test` passes: debris (frequency draw, slot clearing, shared cursor retarget), science (start, rate, completion, pause on retarget and stand, offline, discard on impact), weapons (selector, matched/mismatched/torpedo shots, one draw per shot, thresholds), torpedoes (loading, stand/failure persistence, regeneration, cap), scripted handoff gate, properties (stock, draws), snapshot round trip and mid-scan continuation, HUD model (frequencies, selector, torpedo, Science targets).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 unmanned (figures recorded in the ledger if they moved with the extra hazards draw).
- [ ] Manual, two players (`npm run dev`): Science (D(12,2)) selects a `Debris` threat and Confirm shows a rising percentage, after which the threat row and both panels show `F<k>`; Weapons (B(7,2)) uses Left/Right to pick `F<k>` and Confirm removes the object more often than not over a few tries; `Torp` shows `Stock 3/6`, loads in about 13 s, Confirm removes the object and the stock reads 2/6; after about 90 s powered it reads 3/6. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.
```

- [ ] **Step 2: Spec amendments**

Append to the spec:

```markdown
## 12. Amendments from the plan
- `cycleTarget(state, i, dir)` lives in `sim/debrisTargets.ts` and is shared by Weapons and Science; `Weapon` selector constants are exported from `weapons.ts`.
- The Science panel shows scan progress as a percentage in the target row rather than a 60 px bar (section 8), so each target stays one row.
- The Weapons panel's selector is its own text line above the target rows (section 8 described it as row 0).
```

- [ ] **Step 3: Verify and commit**

`npm run typecheck`, `npm test`, `npm run build` → pass.

```bash
git add docs/gates.md docs/superpowers/specs/2026-11-10-scanning-and-torpedoes-design.md
git commit -m "docs: increment 2b-ii gate and spec amendments"
```
