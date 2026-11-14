# Helm Demo H-0a: Duel Flight Sim (headless) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, headless flight half of the Helm demo duel: the seeded map, gravity, the heading table, held-axis flight with stabilise and drag, ship contacts, the predicted path and the state hash.

**Architecture:** A new pure subtree `src/renderer/src/sim/tactical/` that imports nothing from the sector-run sim except `sim/tuning.ts`'s `DT`, plus the shared RNG and hash (spec §13). State is a plain `TacticalState`; one function, `stepFlight(state, axes, tuning)`, advances a tick. Nothing here is wired into the authority, the renderer or the sector run yet; that is H-0b (combat, hunter, interior link, authority mode) and H-1 (views).

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2, tsx for the generator script. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-helm-demo-design.md` (refined at `06f472c`). Section numbers below refer to it.

## Scope

H-0 in spec §15 is "first the map, physics, headings and held-input flight (with the orbit, energy, hash and 200-seed map tests); then both consoles' rules, shields, rooms, the hunter, commands; then the interior link; telemetry, the scripted pair and the golden replay". That is two plans:

- **H-0a (this plan):** §3 map, §4 physics and determinism, §5 ship body and Engines factor, §6 flight, the ship rows of the §4 collision matrix, §10b's `predictPath`. Deliverable: a headless flight sim with every §4 test passing, which H-1's dev flight view can drive.
- **H-0b (next plan):** §5 rooms and shields, §7 weapons and missiles (and the missile rows of the collision matrix), §8 interior link, §9 hunter, §13 duel step and authority mode, telemetry, the scripted pair, the golden replay and the `SIM_VERSION` bump.

H-0a changes no existing gameplay and needs no `SIM_VERSION` bump: nothing in the sector run imports the new files.

## Global Constraints

- Determinism guard (`tests/boundary.test.ts`, `tests/helpers/determinismGuard.ts`) scans every file under `src/renderer/src/sim/**` automatically. Allowed `Math` methods: `abs`, `ceil`, `floor`, `round`, `min`, `max`, `sign`, `imul`, `sqrt`. No `sin`, `cos`, `atan2`, `hypot`, `pow`, `random`, no `**`, no `Date` or `performance`.
- Arithmetic is Float64 `+ − × ÷` and `Math.sqrt` only (spec §4). `(|d|² + ε²)^{3/2}` is `q · sqrt(q)`.
- Files under `sim/` may not import from `authority`, `clientControl` or `headless` (boundary test).
- Tick rate is the existing `TICK_HZ` = 60, `DT` = 1/60 from `src/renderer/src/sim/tuning.ts`.
- Headings: 256 unit vectors, index 0 = north = (0, −1), clockwise, **y down** (screen coordinates). East is index 64 = (1, 0).
- The planet is at the origin. Ship 0 is the crew's ship, ship 1 the enemy's; they always update in that order.
- Every tuning number lives in `src/renderer/src/sim/tactical/tuning.ts` with the spec's *(start)* values.
- Tests live in `tests/` (flat, `tests/tactical*.test.ts`) and import from `../src/...`, as existing tests do.
- Commit with explicit paths only (`git add <paths>`), never `git add -A`: the owner keeps unrelated uncommitted files in this checkout. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run single test files with `npx vitest run <file>`. The full suite is `npm test`; typecheck is `npm run typecheck`.
- Known flake: `tests/authorityBoundary.test.ts` can time out (about 5.5 s) under full-suite load. If it fails in `npm test`, rerun it alone with `npx vitest run tests/authorityBoundary.test.ts`; it is unrelated to this plan.

## Decisions the plan makes inside the spec

1. **Contact order within a body:** the spec says static bodies are met "in broad-phase cell order". The plan uses **ascending asteroid index** from a de-duplicated grid query: equally fixed, and the same order whatever cells a body spans.
2. **`predictPath` holds the current axes** for the whole prediction (the path shows where the ship goes if the pilot keeps doing what they are doing) and stops at the first planet or asteroid contact without resolving it. It ignores the other ship.
3. **Hit counters** (`planetHits`, `asteroidHits`, `shipHits`) count contacts that cost hull, one per grace window. H-0b's telemetry reads them.
4. **The map is not flattened** into the hash beyond its asteroid count: it is a pure function of the seed, which is flattened.
5. **Spawn heading** is prograde (the clockwise orbit direction), so a ship starts nose-forward in its orbit.
6. **Stabilise removes only the skid captured at release** (spec §6, as amended with this plan): on the tick both axes go to zero, the sideways speed relative to the nose is recorded, and the assist removes up to 80 u/s² of it until it is gone. Cancelling *all* sideways velocity every tick would erase gravity's pull whenever it is sideways to the nose, so a released ship flying nose-forward in orbit would stop orbiting, against the spec's "still coasts, falls and orbits".
7. **Contact order** follows spec §4 per body: ship 0's static contacts, then the ship pair, then ship 1's static contacts.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/tactical/tuning.ts` | Every H-0a number, and `FlightTuning` (switches for the §4 test configurations) |
| `scripts/gen-headings.ts` | Generates the heading table outside the sim (may use `Math.sin`/`cos`) |
| `src/renderer/src/sim/tactical/headings.ts` | **Generated** table, `HEADING_X` and `HEADING_Y` |
| `src/renderer/src/sim/tactical/direction.ts` | `wrapHeading`, `hx`, `hy`, `dirBetween` |
| `src/renderer/src/sim/tactical/map.ts` | `MapDef`, `generateMap`, `validateMap`, `circularSpeed`, `inCorridor` |
| `src/renderer/src/sim/tactical/grid.ts` | Broad phase: `buildGrid`, `queryGrid` |
| `src/renderer/src/sim/tactical/state.ts` | `TacticalState`, `Ship`, `Axes`, `Room`, `createTacticalState` |
| `src/renderer/src/sim/tactical/physics.ts` | `gravityAccel`, `edgeAccel`, `engineFactor`, `flyShip`, `stepFlight` |
| `src/renderer/src/sim/tactical/contacts.ts` | Ship–planet, ship–asteroid and ship–ship contacts, grace, hull |
| `src/renderer/src/sim/tactical/predict.ts` | `predictPath`, `touchesSolid` |
| `src/renderer/src/sim/tactical/hash.ts` | `flattenTactical`, `hashTactical` |
| `package.json` | Adds the `gen:headings` script |

---

### Task 1: Tuning, the heading table and direction helpers

**Files:**
- Create: `src/renderer/src/sim/tactical/tuning.ts`
- Create: `scripts/gen-headings.ts`
- Create (generated): `src/renderer/src/sim/tactical/headings.ts`
- Create: `src/renderer/src/sim/tactical/direction.ts`
- Modify: `package.json` (the `scripts` block)
- Test: `tests/tacticalHeadings.test.ts`

**Interfaces:**
- Consumes: `DT` from `src/renderer/src/sim/tuning.ts`.
- Produces: every constant in `tuning.ts` (names as written below), `interface FlightTuning { gravity: boolean; edge: boolean; drag: number; stabilise: number }`, `DEFAULT_FLIGHT`; `HEADING_X`, `HEADING_Y: readonly number[]` (length 256); `wrapHeading(i: number): number`, `hx(i: number): number`, `hy(i: number): number`, `dirBetween(i: number, f: number): [number, number]`.

- [ ] **Step 1: Write the failing test**

Create `tests/tacticalHeadings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HEADING_X, HEADING_Y } from '../src/renderer/src/sim/tactical/headings';
import { dirBetween, hx, hy, wrapHeading } from '../src/renderer/src/sim/tactical/direction';
import { HEADING_COUNT, TURN_STEPS_PER_TICK } from '../src/renderer/src/sim/tactical/tuning';

describe('heading table (spec §4)', () => {
  it('has 256 entries of unit length', () => {
    expect(HEADING_X).toHaveLength(HEADING_COUNT);
    expect(HEADING_Y).toHaveLength(HEADING_COUNT);
    for (let i = 0; i < HEADING_COUNT; i++) expect(Math.abs(Math.sqrt(hx(i) * hx(i) + hy(i) * hy(i)) - 1)).toBeLessThan(1e-15);
  });
  it('points north at 0 and turns clockwise in y-down coordinates', () => {
    expect([hx(0), hy(0)]).toEqual([0, -1]);
    expect([hx(64), hy(64)]).toEqual([1, 0]);
    expect([hx(128), hy(128)]).toEqual([0, 1]);
    expect([hx(192), hy(192)]).toEqual([-1, 0]);
  });
  it('is exactly symmetric: opposite headings are exact negatives, quarter turns exact rotations', () => {
    for (let i = 0; i < HEADING_COUNT; i++) {
      expect(hx(i + 128)).toBe(-hx(i) || 0);
      expect(hy(i + 128)).toBe(-hy(i) || 0);
      expect(hx(i + 64)).toBe(-hy(i) || 0);
      expect(hy(i + 64)).toBe(hx(i));
    }
  });
  it('wraps any integer index', () => {
    expect(wrapHeading(-1)).toBe(255);
    expect(wrapHeading(256)).toBe(0);
    expect(wrapHeading(-257)).toBe(255);
  });
  it('dirBetween returns unit vectors between neighbours', () => {
    for (const [i, f] of [[0, 0], [10, 0.5], [255, 0.999]] as const) {
      const [x, y] = dirBetween(i, f);
      expect(Math.abs(Math.sqrt(x * x + y * y) - 1)).toBeLessThan(1e-15);
    }
    expect(dirBetween(64, 0)).toEqual([1, 0]);
  });
  it('turns at 150°/s: about 1.78 heading steps per tick', () => {
    expect(TURN_STEPS_PER_TICK).toBeCloseTo(1.7778, 4);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tacticalHeadings.test.ts`
Expected: FAIL, "Failed to resolve import ../src/renderer/src/sim/tactical/headings".

- [ ] **Step 3: Write the tuning file**

Create `src/renderer/src/sim/tactical/tuning.ts`:

```ts
// Helm demo duel tuning (spec docs/superpowers/specs/2026-11-14-helm-demo-design.md, sections 3 to 6).
// Every number here is a *(start)* value for tuning, not a decision.
import { DT } from '../tuning';

export { DT };

/** Headings: a fixed table of unit vectors, index 0 = north, clockwise (spec §4). */
export const HEADING_COUNT = 256;

// Map (§3)
export const R_MAP = 2800;
export const K_EDGE = 2;                       // /s², inward acceleration per unit past the edge
export const PLANET_RADIUS = 70;
export const GM = 2.5e6;
export const GRAVITY_EPS = 20;
export const BELT_INNER = 1100;
export const BELT_OUTER = 1300;
export const BELT_COUNT = 70;
export const BELT_R_MIN = 15;
export const BELT_R_MAX = 45;
export const GAP_COUNT = 3;
export const GAP_WIDTH = 160;
export const GAP_MIN_SEPARATION = 40;          // heading steps between any two gap bearings
export const CLUSTER_COUNT = 3;
export const CLUSTER_RADIUS = 150;             // asteroid centres lie within this of the cluster centre
export const CLUSTER_MIN = 4;
export const CLUSTER_MAX = 7;
export const CLUSTER_R_MIN = 20;
export const CLUSTER_R_MAX = 55;
export const CLUSTER_CENTRE_MIN = 1550;        // clear of the belt: 1300 + 150 + 55 + margin
export const CLUSTER_CENTRE_MAX = 2550;        // clear of the edge: 2800 - 150 - 55 - margin
export const EDGE_MARGIN = 100;                // no asteroid surface within this of the edge
export const ASTEROID_GAP = 10;                // minimum clear space between asteroid surfaces
export const SPAWN_RADIUS = 2000;
export const SPAWN_CLEARANCE = 300;            // no asteroid surface within this of a spawn point

// Ships (§5)
export const SHIP_RADIUS = 20;
export const SHIP_HULL = 30;
/** Engines damage level 0 / 1 / 2 scales thrust and turn rate (§5). */
export const ENGINE_FACTOR: readonly number[] = [1, 0.6, 0.25];

// Contacts (§3, §4)
export const RESTITUTION = 0.5;                // share of the normal speed kept after a bounce
export const CONTACT_GRACE_TICKS = 60;         // 1 s before the same pair can cost hull again
export const PLANET_CONTACT_HULL = 4;
export const ASTEROID_CONTACT_HULL = 1;
export const SHIP_CONTACT_HULL = 1;

// Flight (§6)
export const TURN_DEG_PER_S = 150;
export const TURN_STEPS_PER_TICK = (TURN_DEG_PER_S / 360) * HEADING_COUNT * DT;   // about 1.78
export const THRUST = 120;                     // u/s²
export const REVERSE_FRACTION = 0.4;
export const DRAG = 0.15;                      // velocity × (1 − DRAG · dt) per tick
export const STABILISE = 80;                   // u/s² of sideways velocity removed while both axes are zero

// Broad phase (§4)
export const BROAD_CELL = 200;

/** Switches for the §4 test configurations; the game always uses DEFAULT_FLIGHT. */
export interface FlightTuning { gravity: boolean; edge: boolean; drag: number; stabilise: number }
export const DEFAULT_FLIGHT: FlightTuning = { gravity: true, edge: true, drag: DRAG, stabilise: STABILISE };
```

- [ ] **Step 4: Write the generator and add its npm script**

Create `scripts/gen-headings.ts`:

```ts
// Writes src/renderer/src/sim/tactical/headings.ts: 256 unit vectors as numeric literals (spec §4).
// The sim may not call Math.sin or Math.cos (determinism guard), so the table is generated here, outside the sim.
// Only the first quadrant uses trigonometry; the rest are exact 90° rotations, so opposite headings are exact negatives.
import { writeFileSync } from 'node:fs';

const N = 256, Q = N / 4;
const x: number[] = new Array<number>(N).fill(0), y: number[] = new Array<number>(N).fill(0);
for (let i = 0; i < Q; i++) { const t = (2 * Math.PI * i) / N; x[i] = Math.sin(t); y[i] = -Math.cos(t); }
for (let i = Q; i < N; i++) { x[i] = -y[i - Q]!; y[i] = x[i - Q]!; }   // rotate 90° clockwise in y-down coordinates

const lit = (v: number): string => (Object.is(v, -0) ? 0 : v).toString();
const rows = (a: number[]): string => a.map(lit).join(',\n  ');
const out = `// GENERATED by scripts/gen-headings.ts; do not edit. Run \`npm run gen:headings\` to rebuild.
// 256 unit headings: index 0 = north (0, -1), clockwise, y down (spec §4).
export const HEADING_X: readonly number[] = [
  ${rows(x)}
];
export const HEADING_Y: readonly number[] = [
  ${rows(y)}
];
`;
writeFileSync('src/renderer/src/sim/tactical/headings.ts', out);
console.log('wrote src/renderer/src/sim/tactical/headings.ts');
```

In `package.json`, add one line to `"scripts"` after `"credits"`:

```json
    "gen:headings": "tsx scripts/gen-headings.ts",
```

- [ ] **Step 5: Generate the table**

Run: `npm run gen:headings`
Expected: prints `wrote src/renderer/src/sim/tactical/headings.ts`. The file starts:

```ts
// GENERATED by scripts/gen-headings.ts; do not edit. Run `npm run gen:headings` to rebuild.
// 256 unit headings: index 0 = north (0, -1), clockwise, y down (spec §4).
export const HEADING_X: readonly number[] = [
  0,
  0.024541228522912288,
```

- [ ] **Step 6: Write the direction helpers**

Create `src/renderer/src/sim/tactical/direction.ts`:

```ts
import { HEADING_X, HEADING_Y } from './headings';
import { HEADING_COUNT } from './tuning';

/** Any integer heading index to 0..255. */
export function wrapHeading(i: number): number { return ((i % HEADING_COUNT) + HEADING_COUNT) % HEADING_COUNT; }
export function hx(i: number): number { return HEADING_X[wrapHeading(i)]!; }
export function hy(i: number): number { return HEADING_Y[wrapHeading(i)]!; }

/** Unit direction between heading i and i + 1 at fraction f in [0, 1). Used where 256 directions are too coarse (map layout). */
export function dirBetween(i: number, f: number): [number, number] {
  const ax = hx(i), ay = hy(i), bx = hx(i + 1), by = hy(i + 1);
  const x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
  const l = Math.sqrt(x * x + y * y);
  return [x / l, y / l];
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/tacticalHeadings.test.ts tests/boundary.test.ts`
Expected: PASS (6 heading tests; the boundary test now also checks the new sim files).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/tactical/tuning.ts scripts/gen-headings.ts src/renderer/src/sim/tactical/headings.ts src/renderer/src/sim/tactical/direction.ts package.json tests/tacticalHeadings.test.ts
git commit -m "feat(tactical): duel tuning, generated 256-heading table and direction helpers (Helm H-0a)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The seeded map and the broad phase

**Files:**
- Create: `src/renderer/src/sim/tactical/map.ts`
- Create: `src/renderer/src/sim/tactical/grid.ts`
- Test: `tests/tacticalMap.test.ts`

**Interfaces:**
- Consumes: `hx`, `hy`, `dirBetween` (Task 1); tuning constants (Task 1); `nextFloat`, `nextInt`, `createRng`, `RngState` from `src/shared/rng.ts`.
- Produces: `interface Circle { x; y; r }`, `interface Spawn { x; y; vx; vy; heading }`, `interface MapDef { rMap; planet: Circle; asteroids: Circle[]; beltCount; clusterSizes: number[]; gaps: number[]; spawns: [Spawn, Spawn] }`; `generateMap(rng: RngState): MapDef`; `validateMap(m: MapDef): string[]`; `circularSpeed(r: number): number`; `inCorridor(c: Circle, gap: number): boolean`; `interface BroadPhase { origin; cols; cells: number[][] }`; `buildGrid(asteroids: readonly Circle[], rMap: number): BroadPhase`; `queryGrid(g: BroadPhase, x: number, y: number, r: number): number[]` (ascending, no repeats).

- [ ] **Step 1: Write the failing test**

Create `tests/tacticalMap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/shared/rng';
import { circularSpeed, generateMap, validateMap } from '../src/renderer/src/sim/tactical/map';
import { buildGrid, queryGrid } from '../src/renderer/src/sim/tactical/grid';
import { SPAWN_RADIUS } from '../src/renderer/src/sim/tactical/tuning';

describe('duel map (spec §3)', () => {
  it('every seed from 1 to 200 gives a valid map', () => {
    for (let seed = 1; seed <= 200; seed++) expect(validateMap(generateMap(createRng(seed))), `seed ${seed}`).toEqual([]);
  });
  it('is a pure function of the seed', () => {
    expect(generateMap(createRng(42))).toEqual(generateMap(createRng(42)));
    expect(generateMap(createRng(42))).not.toEqual(generateMap(createRng(43)));
  });
  it('places the spawns on opposite sides in the same clockwise circular orbit', () => {
    const [a, b] = generateMap(createRng(7)).spawns;
    expect(Math.sqrt(a.x * a.x + a.y * a.y)).toBeCloseTo(SPAWN_RADIUS, 6);
    expect(a.x + b.x).toBeCloseTo(0, 6);
    expect(a.y + b.y).toBeCloseTo(0, 6);
    for (const s of [a, b]) {
      expect(Math.sqrt(s.vx * s.vx + s.vy * s.vy)).toBeCloseTo(circularSpeed(SPAWN_RADIUS), 6);
      expect(s.x * s.vy - s.y * s.vx).toBeGreaterThan(0);   // clockwise on screen (y down)
    }
  });
  it('matches the stated gravity: about 100 u/s for a circular orbit at r = 250', () => {
    expect(circularSpeed(250)).toBeCloseTo(99.52, 1);
  });
});

describe('broad phase (spec §4)', () => {
  it('finds every asteroid a brute-force search finds, in ascending order', () => {
    const m = generateMap(createRng(3)), g = buildGrid(m.asteroids, m.rMap);
    for (const [x, y] of [[0, -1200], [1250, 40], [-900, 900], [2500, 0], [3000, 3000]] as const) {
      const r = 20 + 55;
      const brute = m.asteroids.flatMap((a, i) => (Math.abs(a.x - x) <= r + a.r && Math.abs(a.y - y) <= r + a.r ? [i] : []));
      const got = queryGrid(g, x, y, r);
      for (const i of brute) expect(got).toContain(i);
      expect(got).toEqual([...got].sort((a, b) => a - b));
      expect(new Set(got).size).toBe(got.length);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tacticalMap.test.ts`
Expected: FAIL, "Failed to resolve import ../src/renderer/src/sim/tactical/map".

- [ ] **Step 3: Write the map generator**

Create `src/renderer/src/sim/tactical/map.ts`. Generation order is fixed and is part of determinism: gaps, then the spawn bearing, then belt asteroids (up to 20,000 tries), then each cluster's centre and asteroids.

```ts
// The duel map (spec §3): one planet at the origin, a belt ring with three gaps, three loose clusters, two spawns.
// Everything seeded comes from the duel's rng.tactical stream, so both screens and every replay build the same map.
import { nextFloat, nextInt, type RngState } from '../../../../shared/rng';
import { dirBetween, hx, hy } from './direction';
import {
  ASTEROID_GAP, BELT_COUNT, BELT_INNER, BELT_OUTER, BELT_R_MAX, BELT_R_MIN, CLUSTER_CENTRE_MAX, CLUSTER_CENTRE_MIN, CLUSTER_COUNT,
  CLUSTER_MAX, CLUSTER_MIN, CLUSTER_R_MAX, CLUSTER_R_MIN, CLUSTER_RADIUS, EDGE_MARGIN, GAP_COUNT, GAP_MIN_SEPARATION, GAP_WIDTH,
  GM, GRAVITY_EPS, HEADING_COUNT, PLANET_RADIUS, R_MAP, SPAWN_CLEARANCE, SPAWN_RADIUS
} from './tuning';

export interface Circle { x: number; y: number; r: number }
export interface Spawn { x: number; y: number; vx: number; vy: number; heading: number }
export interface MapDef {
  rMap: number;
  planet: Circle;
  /** Belt asteroids first (indices 0 .. beltCount − 1), then each cluster's asteroids in cluster order. */
  asteroids: Circle[];
  beltCount: number;
  clusterSizes: number[];
  /** Gap bearings as heading indices, ascending. */
  gaps: number[];
  spawns: [Spawn, Spawn];
}

/** Speed of a circular orbit at radius r under the softened gravity of spec §3. */
export function circularSpeed(r: number): number {
  const q = r * r + GRAVITY_EPS * GRAVITY_EPS;
  return Math.sqrt((GM * r * r) / (q * Math.sqrt(q)));
}

/** True when circle c intrudes on the gap corridor along heading `gap` (a ray from the planet, GAP_WIDTH wide). */
export function inCorridor(c: Circle, gap: number): boolean {
  const gx = hx(gap), gy = hy(gap);
  if (c.x * gx + c.y * gy <= 0) return false;
  return Math.abs(c.x * gy - c.y * gx) < GAP_WIDTH / 2 + c.r;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function circularGap(a: number, b: number): number {
  const d = Math.abs(a - b) % HEADING_COUNT;
  return Math.min(d, HEADING_COUNT - d);
}

function pickGaps(rng: RngState): number[] {
  const gaps: number[] = [];
  while (gaps.length < GAP_COUNT) {
    const g = nextInt(rng, HEADING_COUNT);
    if (gaps.every((o) => circularGap(o, g) >= GAP_MIN_SEPARATION)) gaps.push(g);
  }
  return gaps.sort((a, b) => a - b);
}

function spawnAt(heading: number): Spawn {
  const v = circularSpeed(SPAWN_RADIUS), prograde = heading + HEADING_COUNT / 4;   // clockwise orbit
  return { x: hx(heading) * SPAWN_RADIUS, y: hy(heading) * SPAWN_RADIUS, vx: hx(prograde) * v, vy: hy(prograde) * v, heading: prograde % HEADING_COUNT };
}

function fits(c: Circle, placed: readonly Circle[], gaps: readonly number[], spawns: readonly Spawn[], belt: boolean): boolean {
  if (Math.sqrt(c.x * c.x + c.y * c.y) + c.r > R_MAP - EDGE_MARGIN) return false;
  for (const o of placed) if (dist(c.x, c.y, o.x, o.y) < c.r + o.r + ASTEROID_GAP) return false;
  for (const s of spawns) if (dist(c.x, c.y, s.x, s.y) < c.r + SPAWN_CLEARANCE) return false;
  if (belt) for (const g of gaps) if (inCorridor(c, g)) return false;
  return true;
}

export function generateMap(rng: RngState): MapDef {
  const gaps = pickGaps(rng);
  const first = nextInt(rng, HEADING_COUNT);
  const spawns: [Spawn, Spawn] = [spawnAt(first), spawnAt(first + HEADING_COUNT / 2)];
  const asteroids: Circle[] = [];
  for (let tries = 0; asteroids.length < BELT_COUNT && tries < 20000; tries++) {
    const r = BELT_R_MIN + nextFloat(rng) * (BELT_R_MAX - BELT_R_MIN);
    const rad = BELT_INNER + r + nextFloat(rng) * (BELT_OUTER - BELT_INNER - 2 * r);
    const [dx, dy] = dirBetween(nextInt(rng, HEADING_COUNT), nextFloat(rng));
    const c = { x: dx * rad, y: dy * rad, r };
    if (fits(c, asteroids, gaps, spawns, true)) asteroids.push(c);
  }
  const beltCount = asteroids.length;
  const clusterSizes: number[] = [];
  for (let k = 0; k < CLUSTER_COUNT; k++) {
    let cx = 0, cy = 0, found = false;
    for (let t = 0; t < 500 && !found; t++) {
      const rad = CLUSTER_CENTRE_MIN + nextFloat(rng) * (CLUSTER_CENTRE_MAX - CLUSTER_CENTRE_MIN);
      const [dx, dy] = dirBetween(nextInt(rng, HEADING_COUNT), nextFloat(rng));
      cx = dx * rad; cy = dy * rad;
      found = spawns.every((s) => dist(cx, cy, s.x, s.y) >= CLUSTER_RADIUS + CLUSTER_R_MAX + SPAWN_CLEARANCE)
        && asteroids.slice(beltCount).every((o) => dist(cx, cy, o.x, o.y) >= 2 * CLUSTER_RADIUS + CLUSTER_R_MAX);
    }
    const want = CLUSTER_MIN + nextInt(rng, CLUSTER_MAX - CLUSTER_MIN + 1);
    let placed = 0;
    for (let t = 0; t < 500 && placed < want && found; t++) {
      const r = CLUSTER_R_MIN + nextFloat(rng) * (CLUSTER_R_MAX - CLUSTER_R_MIN);
      const [dx, dy] = dirBetween(nextInt(rng, HEADING_COUNT), nextFloat(rng));
      const off = Math.sqrt(nextFloat(rng)) * CLUSTER_RADIUS;
      const c = { x: cx + dx * off, y: cy + dy * off, r };
      if (fits(c, asteroids, gaps, spawns, false)) { asteroids.push(c); placed++; }
    }
    clusterSizes.push(placed);
  }
  return { rMap: R_MAP, planet: { x: 0, y: 0, r: PLANET_RADIUS }, asteroids, beltCount, clusterSizes, gaps, spawns };
}

/** Every rule of spec §3's seeded layout; an empty list means the map is fair. */
export function validateMap(m: MapDef): string[] {
  const out: string[] = [];
  if (m.beltCount !== BELT_COUNT) out.push(`belt has ${m.beltCount} asteroids, expected ${BELT_COUNT}`);
  if (m.clusterSizes.length !== CLUSTER_COUNT) out.push(`${m.clusterSizes.length} clusters, expected ${CLUSTER_COUNT}`);
  m.clusterSizes.forEach((n, k) => { if (n < CLUSTER_MIN || n > CLUSTER_MAX) out.push(`cluster ${k} has ${n} asteroids`); });
  if (m.asteroids.length !== m.beltCount + m.clusterSizes.reduce((a, b) => a + b, 0)) out.push('asteroid count does not match belt + clusters');
  if (m.gaps.length !== GAP_COUNT) out.push(`${m.gaps.length} gaps, expected ${GAP_COUNT}`);
  for (let i = 0; i < m.gaps.length; i++) for (let j = i + 1; j < m.gaps.length; j++)
    if (circularGap(m.gaps[i]!, m.gaps[j]!) < GAP_MIN_SEPARATION) out.push(`gaps ${i} and ${j} are too close`);
  m.asteroids.forEach((a, i) => {
    const r = Math.sqrt(a.x * a.x + a.y * a.y);
    if (r + a.r > m.rMap - EDGE_MARGIN) out.push(`asteroid ${i} is too near the edge`);
    if (r - a.r < m.planet.r) out.push(`asteroid ${i} overlaps the planet`);
    for (const s of m.spawns) if (dist(a.x, a.y, s.x, s.y) < a.r + SPAWN_CLEARANCE) out.push(`asteroid ${i} crowds a spawn`);
    if (i < m.beltCount) {
      if (r - a.r < BELT_INNER || r + a.r > BELT_OUTER) out.push(`belt asteroid ${i} is outside the belt`);
      for (const g of m.gaps) if (inCorridor(a, g)) out.push(`belt asteroid ${i} blocks gap ${g}`);
    }
    for (let j = i + 1; j < m.asteroids.length; j++) {
      const b = m.asteroids[j]!;
      if (dist(a.x, a.y, b.x, b.y) < a.r + b.r + ASTEROID_GAP) out.push(`asteroids ${i} and ${j} overlap`);
    }
  });
  return out;
}
```

- [ ] **Step 4: Write the broad phase**

Create `src/renderer/src/sim/tactical/grid.ts`:

```ts
// Broad phase (spec §4): a fixed uniform grid over the static asteroids, built once per map.
// A query returns asteroid indices in ascending order, so every caller visits contacts in one fixed order.
import type { Circle } from './map';
import { BROAD_CELL } from './tuning';

export interface BroadPhase { origin: number; cols: number; cells: number[][] }

function cellOf(g: BroadPhase, v: number): number {
  return Math.min(g.cols - 1, Math.max(0, Math.floor((v - g.origin) / BROAD_CELL)));
}

export function buildGrid(asteroids: readonly Circle[], rMap: number): BroadPhase {
  const origin = -(rMap + BROAD_CELL);
  const cols = Math.ceil((2 * (rMap + BROAD_CELL)) / BROAD_CELL);
  const g: BroadPhase = { origin, cols, cells: Array.from({ length: cols * cols }, () => [] as number[]) };
  asteroids.forEach((a, i) => {
    for (let cy = cellOf(g, a.y - a.r); cy <= cellOf(g, a.y + a.r); cy++)
      for (let cx = cellOf(g, a.x - a.r); cx <= cellOf(g, a.x + a.r); cx++) g.cells[cy * cols + cx]!.push(i);
  });
  return g;
}

/** Indices of every asteroid whose cells overlap the square around (x, y) of half-size r, ascending, no repeats. */
export function queryGrid(g: BroadPhase, x: number, y: number, r: number): number[] {
  const found: number[] = [];
  for (let cy = cellOf(g, y - r); cy <= cellOf(g, y + r); cy++)
    for (let cx = cellOf(g, x - r); cx <= cellOf(g, x + r); cx++) for (const i of g.cells[cy * g.cols + cx]!) found.push(i);
  found.sort((a, b) => a - b);
  return found.filter((v, k) => k === 0 || v !== found[k - 1]);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/tacticalMap.test.ts tests/boundary.test.ts`
Expected: PASS (5 map tests, including all 200 seeds; about 60 ms).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/tactical/map.ts src/renderer/src/sim/tactical/grid.ts tests/tacticalMap.test.ts
git commit -m "feat(tactical): seeded duel map (belt, gaps, clusters, spawns) with validation and broad-phase grid (Helm H-0a)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ship state and flight physics

**Files:**
- Create: `src/renderer/src/sim/tactical/state.ts`
- Create: `src/renderer/src/sim/tactical/physics.ts`
- Test: `tests/tacticalFlight.test.ts`

**Interfaces:**
- Consumes: `generateMap`, `MapDef`, `Spawn`, `circularSpeed` (Task 2); `buildGrid`, `BroadPhase` (Task 2); `hx`, `hy`, `wrapHeading` (Task 1); tuning (Task 1); `createRng`, `RngState`.
- Produces: `Room = { Weapons: 0, Shields: 1, Engines: 2 }`; `interface Ship { x; y; vx; vy; heading; headingAcc; hull; rooms: [number, number, number]; graceUntil: Int32Array; planetHits; asteroidHits; shipHits }`; `interface TacticalState { tick; seed; rng: RngState; map: MapDef; grid: BroadPhase; ships: [Ship, Ship] }`; `interface Axes { turn: number; thrust: number }`; `NO_AXES`; `otherShipBody(map: MapDef): number`; `createTacticalState(seed: number): TacticalState`; `gravityAccel(x, y): [number, number]`; `edgeAccel(x, y): [number, number]`; `engineFactor(s: Ship): number`; `flyShip(s: Ship, axes: Axes, tuning: FlightTuning): void`; `stepFlight(state: TacticalState, axes: readonly Axes[], tuning?: FlightTuning): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/tacticalFlight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTacticalState, Room, type Ship } from '../src/renderer/src/sim/tactical/state';
import { edgeAccel, flyShip, gravityAccel } from '../src/renderer/src/sim/tactical/physics';
import { circularSpeed } from '../src/renderer/src/sim/tactical/map';
import { DEFAULT_FLIGHT, DT, GM, GRAVITY_EPS, R_MAP, THRUST, TURN_STEPS_PER_TICK, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';

const GRAVITY_ONLY: FlightTuning = { gravity: true, edge: false, drag: 0, stabilise: 0 };
const FLIGHT_NO_FIELD: FlightTuning = { gravity: false, edge: false, drag: DEFAULT_FLIGHT.drag, stabilise: DEFAULT_FLIGHT.stabilise };

function ship(over: Partial<Ship>): Ship {
  return { ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, rooms: [0, 0, 0], ...over };
}
const energy = (s: Ship): number => (s.vx * s.vx + s.vy * s.vy) / 2 - GM / Math.sqrt(s.x * s.x + s.y * s.y + GRAVITY_EPS * GRAVITY_EPS);

describe('gravity-only configuration (spec §4 tests)', () => {
  it('holds a circular orbit at r = 250 within 2% for 60 s', () => {
    const s = ship({ x: 250, y: 0, vx: 0, vy: circularSpeed(250) });
    for (let t = 0; t < 3600; t++) {
      flyShip(s, { turn: 0, thrust: 0 }, GRAVITY_ONLY);
      const r = Math.sqrt(s.x * s.x + s.y * s.y);
      expect(Math.abs(r - 250) / 250).toBeLessThan(0.02);
    }
  });
  it('keeps total energy within 1% over a 5-minute coast', () => {
    const s = ship({ x: 250, y: 0, vx: 0, vy: circularSpeed(250) }), e0 = energy(s);
    for (let t = 0; t < 18000; t++) {
      flyShip(s, { turn: 0, thrust: 0 }, GRAVITY_ONLY);
      expect(Math.abs((energy(s) - e0) / e0)).toBeLessThan(0.01);
    }
  });
  it('pulls about 2 u/s² at the belt and 0.3 u/s² at the edge', () => {
    const mag = (r: number): number => { const [x, y] = gravityAccel(r, 0); return Math.sqrt(x * x + y * y); };
    expect(mag(1200)).toBeCloseTo(1.74, 2);
    expect(mag(2800)).toBeCloseTo(0.32, 2);
  });
});

describe('flight configuration (spec §4 tests, §6)', () => {
  it('reaches within 5% of 800 u/s after 30 s of full thrust from rest', () => {
    const s = ship({});
    for (let t = 0; t < 1800; t++) flyShip(s, { turn: 0, thrust: 1 }, FLIGHT_NO_FIELD);
    const v = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    expect(Math.abs(v - 800) / 800).toBeLessThan(0.05);
    expect(s.vy).toBeLessThan(0);   // heading 0 is north, y up the screen is negative
  });
  it('stabilise removes a 60 u/s skid within 60 ticks and keeps forward speed', () => {
    const s = ship({ vx: 60, vy: -300 });
    for (let t = 0; t < 60; t++) flyShip(s, { turn: 0, thrust: 0 }, FLIGHT_NO_FIELD);
    expect(Math.abs(s.vx)).toBeLessThan(5);
    expect(s.vy).toBeLessThan(-250);   // drag alone takes 300 to about 258 in 1 s; stabilise must not touch forward speed
  });
  it('does not stabilise while an axis is held', () => {
    const s = ship({ vx: 60, vy: -300 });
    for (let t = 0; t < 60; t++) flyShip(s, { turn: 0, thrust: 1 }, FLIGHT_NO_FIELD);
    expect(s.vx).toBeGreaterThan(45);   // drag alone leaves about 51.6; stabilise would take it to 0
  });
  it('turns 150°/s: 106 whole heading steps in 60 ticks (1.78 × 60), clockwise for +turn', () => {
    const s = ship({});
    for (let t = 0; t < 60; t++) flyShip(s, { turn: 1, thrust: 0 }, FLIGHT_NO_FIELD);
    expect(s.heading).toBe(106);
    const l = ship({});
    for (let t = 0; t < 60; t++) flyShip(l, { turn: -1, thrust: 0 }, FLIGHT_NO_FIELD);
    expect(l.heading).toBe(256 - 106);
  });
  it('reverse thrust is 40% of forward', () => {
    const f = ship({}), r = ship({});
    flyShip(f, { turn: 0, thrust: 1 }, { ...FLIGHT_NO_FIELD, drag: 0 });
    flyShip(r, { turn: 0, thrust: -1 }, { ...FLIGHT_NO_FIELD, drag: 0 });
    expect(f.vy).toBeCloseTo(-THRUST * DT, 12);
    expect(r.vy).toBeCloseTo(0.4 * THRUST * DT, 12);
  });
  it('scales thrust and turn by the Engines factor 1 / 0.6 / 0.25', () => {
    for (const [level, factor] of [[0, 1], [1, 0.6], [2, 0.25]] as const) {
      const s = ship({ rooms: [0, 0, level] });
      expect(s.rooms[Room.Engines]).toBe(level);
      flyShip(s, { turn: 1, thrust: 1 }, { ...FLIGHT_NO_FIELD, drag: 0 });
      expect(Math.sqrt(s.vx * s.vx + s.vy * s.vy)).toBeCloseTo(THRUST * factor * DT, 12);
      for (let t = 1; t < 60; t++) flyShip(s, { turn: 1, thrust: 0 }, FLIGHT_NO_FIELD);
      expect(s.heading + s.headingAcc).toBeCloseTo(TURN_STEPS_PER_TICK * 60 * factor, 9);
    }
  });
});

describe('stabilise never cancels gravity (spec §6)', () => {
  it('a released ship at rest still starts to fall on its first tick', () => {
    const s = ship({ x: 1200, y: 0, heading: 0 });
    flyShip(s, { turn: 0, thrust: 0 }, DEFAULT_FLIGHT);
    expect(s.vx).toBeLessThan(0);
    expect(s.x).toBeLessThan(1200);
  });
  it('a released ship flying nose-forward in a circular orbit keeps orbiting', () => {
    const s = ship({ x: 250, y: 0, vx: 0, vy: circularSpeed(250), heading: 128 });   // heading 128 = south = prograde here
    for (let t = 0; t < 3600; t++) {
      flyShip(s, { turn: 0, thrust: 0 }, { ...GRAVITY_ONLY, stabilise: DEFAULT_FLIGHT.stabilise });
      expect(Math.abs(Math.sqrt(s.x * s.x + s.y * s.y) - 250) / 250).toBeLessThan(0.02);
    }
  });
  it('a large skid shrinks to zero under stabilise and drag without ever reversing', () => {
    const s = ship({ vx: 300, vy: 0, heading: 0 });
    for (let t = 0; t < 400; t++) {
      flyShip(s, { turn: 0, thrust: 0 }, FLIGHT_NO_FIELD);
      expect(s.vx).toBeGreaterThanOrEqual(0);
    }
    expect(s.vx).toBe(0);
    expect(s.skidBudget).toBe(0);
  });
  it('removes only the skid captured at release, then stops', () => {
    const s = ship({ vx: 10, vy: -300 });
    flyShip(s, { turn: 0, thrust: 0 }, FLIGHT_NO_FIELD);
    expect(s.skidBudget).toBeCloseTo((10 - DEFAULT_FLIGHT.stabilise * DT) * (1 - DEFAULT_FLIGHT.drag * DT), 12);
    for (let t = 0; t < 30; t++) flyShip(s, { turn: 0, thrust: 0 }, FLIGHT_NO_FIELD);
    expect(s.skidBudget).toBe(0);
    s.vx = 5;                                                   // a later push sideways is not a new skid
    flyShip(s, { turn: 0, thrust: 0 }, FLIGHT_NO_FIELD);
    expect(s.vx).toBeGreaterThan(4.9);
  });
});

describe('map edge (spec §3)', () => {
  it('is zero inside and pulls back with K_EDGE per unit outside', () => {
    expect(edgeAccel(R_MAP - 1, 0)).toEqual([0, 0]);
    const [x, y] = edgeAccel(R_MAP + 200, 0);
    expect(x).toBeCloseTo(-400, 9);
    expect(y + 0).toBe(0);
  });
  it('turns a ship around that coasts out past the edge', () => {
    const s = ship({ x: R_MAP - 10, y: 0, vx: 100, vy: 0, heading: 64 });
    let maxX = s.x;
    for (let t = 0; t < 600; t++) { flyShip(s, { turn: 0, thrust: 0 }, { ...DEFAULT_FLIGHT, gravity: false }); maxX = Math.max(maxX, s.x); }
    expect(maxX).toBeLessThan(R_MAP + 100);
    expect(s.vx).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tacticalFlight.test.ts`
Expected: FAIL, "Failed to resolve import ../src/renderer/src/sim/tactical/state".

- [ ] **Step 3: Write the state**

Create `src/renderer/src/sim/tactical/state.ts`:

```ts
// Tactical state for the duel (spec §3 to §6). H-0a holds the map and two flying ships; weapons, shields, missiles and the
// hunter join in H-0b. Ship 0 is the crew's, ship 1 the enemy's; they always update in that order.
import { createRng, type RngState } from '../../../../shared/rng';
import { buildGrid, type BroadPhase } from './grid';
import { generateMap, type MapDef, type Spawn } from './map';
import { SHIP_HULL } from './tuning';

/** Tactical rooms (spec §5); the index into Ship.rooms. */
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
}

export interface TacticalState { tick: number; seed: number; rng: RngState; map: MapDef; grid: BroadPhase; ships: [Ship, Ship] }

/** Held axes for one ship, each −1, 0 or 1: turn (+ clockwise) and thrust (+ forward). */
export interface Axes { turn: number; thrust: number }
export const NO_AXES: Axes = { turn: 0, thrust: 0 };

/** Body id of the other ship in Ship.graceUntil. */
export function otherShipBody(map: MapDef): number { return map.asteroids.length + 1; }

function shipAt(s: Spawn, bodies: number): Ship {
  return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, heading: s.heading, headingAcc: 0, hull: SHIP_HULL, rooms: [0, 0, 0], graceUntil: new Int32Array(bodies), planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0 };
}

export function createTacticalState(seed: number): TacticalState {
  const rng = createRng(seed);
  const map = generateMap(rng);
  const bodies = map.asteroids.length + 2;
  return { tick: 0, seed, rng, map, grid: buildGrid(map.asteroids, map.rMap), ships: [shipAt(map.spawns[0], bodies), shipAt(map.spawns[1], bodies)] };
}
```

- [ ] **Step 4: Write the physics (no contacts yet)**

Create `src/renderer/src/sim/tactical/physics.ts`. Order within `flyShip` is fixed (spec §4, §6): turn, stabilise (it removes only the skid captured at the moment of release, so it never cancels gravity), then sum the accelerations (gravity, edge, thrust), update velocity, drag, then position. Task 4 adds contacts to `stepFlight`.

```ts
// Flight physics (spec §3, §4, §6): softened gravity, the edge spring, turn, thrust, stabilise, drag,
// semi-implicit Euler. Float64 with + − × ÷ and sqrt only; no trigonometry (the determinism guard enforces it).
import { hx, hy, wrapHeading } from './direction';
import { Room, type Axes, type Ship, type TacticalState } from './state';
import { DEFAULT_FLIGHT, DT, ENGINE_FACTOR, GM, GRAVITY_EPS, K_EDGE, R_MAP, REVERSE_FRACTION, THRUST, TURN_STEPS_PER_TICK, type FlightTuning } from './tuning';

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

export function engineFactor(s: Ship): number { return ENGINE_FACTOR[s.rooms[Room.Engines]]!; }

/** One tick of one ship's flight, without contacts. Shared by the step and by predictPath, so the prediction is exact. */
export function flyShip(s: Ship, axes: Axes, tuning: FlightTuning): void {
  const f = engineFactor(s);
  s.headingAcc += axes.turn * TURN_STEPS_PER_TICK * f;
  while (s.headingAcc >= 1) { s.heading = wrapHeading(s.heading + 1); s.headingAcc -= 1; }
  while (s.headingAcc <= -1) { s.heading = wrapHeading(s.heading - 1); s.headingAcc += 1; }
  const h0 = hx(s.heading), h1 = hy(s.heading);
  // Stabilise (spec §6): on the tick both axes go to zero, capture the sideways speed (along px, py, 90° clockwise of the
  // nose) as the skid to remove; then remove up to STABILISE · dt of it per tick until it is gone. Gravity's later
  // sideways pull is never captured, so a released ship still falls and orbits. Runs before this tick's forces.
  const idle = axes.turn === 0 && axes.thrust === 0, px = -h1, py = h0;
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
  if (axes.thrust > 0) { ax += h0 * THRUST * f; ay += h1 * THRUST * f; }
  else if (axes.thrust < 0) { ax -= h0 * THRUST * REVERSE_FRACTION * f; ay -= h1 * THRUST * REVERSE_FRACTION * f; }
  s.vx += ax * DT; s.vy += ay * DT;
  const keep = 1 - tuning.drag * DT;
  s.vx *= keep; s.vy *= keep;
  s.skidBudget *= keep;   // drag shrinks the remaining skid too, so the assist never pushes past zero
  s.x += s.vx * DT; s.y += s.vy * DT;
}

/** One duel tick of flight: ships fly in fixed order, then the tick advances. Task 4 adds contacts. */
export function stepFlight(state: TacticalState, axes: readonly Axes[], tuning: FlightTuning = DEFAULT_FLIGHT): void {
  state.ships.forEach((s, i) => flyShip(s, axes[i] ?? { turn: 0, thrust: 0 }, tuning));
  state.tick++;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/tacticalFlight.test.ts tests/boundary.test.ts`
Expected: PASS (15 flight tests). The orbit stays between about 249.18 and 250.83; energy drifts about 4e-5 over 5 minutes; 30 s of thrust reaches about 789 u/s.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/physics.ts tests/tacticalFlight.test.ts
git commit -m "feat(tactical): ship state and held-axis flight (gravity, edge spring, turn, thrust, stabilise, drag) (Helm H-0a)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ship contacts

**Files:**
- Create: `src/renderer/src/sim/tactical/contacts.ts`
- Modify: `src/renderer/src/sim/tactical/physics.ts` (`stepFlight` and one import)
- Test: `tests/tacticalContacts.test.ts`

**Interfaces:**
- Consumes: `queryGrid` (Task 2); `Ship`, `TacticalState`, `otherShipBody` (Task 3); tuning (Task 1).
- Produces: `resolveContacts(state: TacticalState): void`; `stepFlight` now resolves contacts after every ship has flown and before the tick advances.

- [ ] **Step 1: Write the failing test**

Create `tests/tacticalContacts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepFlight } from '../src/renderer/src/sim/tactical/physics';
import { CONTACT_GRACE_TICKS, PLANET_RADIUS, SHIP_HULL, SHIP_RADIUS, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';

const STILL: FlightTuning = { gravity: false, edge: false, drag: 0, stabilise: 0 };
const IDLE = [{ turn: 0, thrust: 0 }, { turn: 0, thrust: 0 }];

/** A duel with the enemy parked far away, so only the contact under test happens. */
function duel(): TacticalState {
  const st = createTacticalState(5);
  Object.assign(st.ships[1], { x: 2600, y: 2600, vx: 0, vy: 0 });
  return st;
}

describe('ship contacts (spec §4 collision matrix)', () => {
  it('ship–planet: pushed out, bounces keeping 50% of the normal speed, costs 4 hull, then 1 s of grace', () => {
    const st = duel(), s = st.ships[0];
    Object.assign(s, { x: 0, y: -(PLANET_RADIUS + SHIP_RADIUS + 1), vx: 0, vy: 120 });
    stepFlight(st, IDLE, STILL);
    expect(Math.sqrt(s.x * s.x + s.y * s.y)).toBeCloseTo(PLANET_RADIUS + SHIP_RADIUS, 9);
    expect(s.vy).toBeCloseTo(-60, 9);
    expect(s.hull).toBe(SHIP_HULL - 4);
    expect(s.planetHits).toBe(1);
    Object.assign(s, { vy: 120 });                         // hit again inside the grace window
    stepFlight(st, IDLE, STILL);
    expect(s.hull).toBe(SHIP_HULL - 4);
    expect(s.vy).toBeCloseTo(-60, 9);                      // still bounces
    st.tick += CONTACT_GRACE_TICKS;
    Object.assign(s, { vy: 120 });
    stepFlight(st, IDLE, STILL);
    expect(s.hull).toBe(SHIP_HULL - 8);
    expect(s.planetHits).toBe(2);
  });
  it('ship–asteroid: costs 1 hull and bounces', () => {
    const st = duel(), s = st.ships[0], a = st.map.asteroids[0]!;
    Object.assign(s, { x: a.x, y: a.y - (a.r + SHIP_RADIUS + 1), vx: 0, vy: 120 });
    stepFlight(st, IDLE, STILL);
    expect(s.hull).toBe(SHIP_HULL - 1);
    expect(s.asteroidHits).toBe(1);
    expect(s.vy).toBeCloseTo(-60, 9);
  });
  it('ship–ship: pushed apart, normal speeds exchanged then halved, 1 hull each', () => {
    const st = duel(), [a, b] = st.ships;
    Object.assign(a, { x: 500, y: -1800, vx: 100, vy: 0 });
    Object.assign(b, { x: 535, y: -1800, vx: -100, vy: 0 });
    stepFlight(st, IDLE, STILL);
    expect(b.x - a.x).toBeCloseTo(2 * SHIP_RADIUS, 9);
    expect(a.vx).toBeCloseTo(-50, 9);
    expect(b.vx).toBeCloseTo(50, 9);
    expect([a.hull, b.hull]).toEqual([SHIP_HULL - 1, SHIP_HULL - 1]);
    expect([a.shipHits, b.shipHits]).toEqual([1, 1]);
  });
  it('hull never goes below zero', () => {
    const st = duel(), s = st.ships[0];
    s.hull = 2;
    Object.assign(s, { x: 0, y: -(PLANET_RADIUS + SHIP_RADIUS + 1), vx: 0, vy: 120 });
    stepFlight(st, IDLE, STILL);
    expect(s.hull).toBe(0);
  });
  it('resolves in spec order: ship 0 statics, the pair, then ship 1 statics, so a pushed ship cannot end inside the planet', () => {
    const st = duel(), [a, b] = st.ships, rim = PLANET_RADIUS + SHIP_RADIUS;
    Object.assign(b, { x: 0, y: -(rim + 1), vx: 0, vy: 0 });              // just clear of the planet
    Object.assign(a, { x: 0, y: -(rim + 1 + 2 * SHIP_RADIUS - 5), vx: 0, vy: 0 });   // overlapping ship 1 by 5
    stepFlight(st, IDLE, STILL);
    expect(Math.sqrt(b.x * b.x + b.y * b.y)).toBeGreaterThanOrEqual(rim - 1e-9);   // the pair push moved ship 1 in; its planet contact pushed it out
    expect(b.planetHits).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tacticalContacts.test.ts`
Expected: FAIL. The ship passes into the planet: "expected 89.9… to be close to 90" or the hull stays 30.

- [ ] **Step 3: Write the contacts**

Create `src/renderer/src/sim/tactical/contacts.ts`:

```ts
// Contacts (spec §4 collision matrix, ship rows; missiles join in H-0b). Each ship meets the planet, then asteroids in
// ascending index, in ship order; then the two ships meet. Push out, bounce keeping RESTITUTION of the normal speed,
// and cost hull only once per CONTACT_GRACE_TICKS per pair.
import { queryGrid } from './grid';
import { otherShipBody, type Ship, type TacticalState } from './state';
import { ASTEROID_CONTACT_HULL, CONTACT_GRACE_TICKS, PLANET_CONTACT_HULL, RESTITUTION, SHIP_CONTACT_HULL, SHIP_RADIUS } from './tuning';

/** True when this contact cost hull (outside the pair's grace window). */
function hitStatic(state: TacticalState, s: Ship, cx: number, cy: number, cr: number, body: number, hull: number): boolean {
  const dx = s.x - cx, dy = s.y - cy, rr = SHIP_RADIUS + cr, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2), nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1;
  s.x = cx + nx * rr; s.y = cy + ny * rr;
  const vn = s.vx * nx + s.vy * ny;
  if (vn < 0) { s.vx -= (1 + RESTITUTION) * vn * nx; s.vy -= (1 + RESTITUTION) * vn * ny; }
  if (state.tick < s.graceUntil[body]!) return false;
  s.hull = Math.max(0, s.hull - hull);
  s.graceUntil[body] = state.tick + CONTACT_GRACE_TICKS;
  return true;
}

function shipShip(state: TacticalState): void {
  const [a, b] = state.ships, body = otherShipBody(state.map);
  const dx = b.x - a.x, dy = b.y - a.y, rr = 2 * SHIP_RADIUS, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  const d = Math.sqrt(d2), nx = d > 0 ? dx / d : 1, ny = d > 0 ? dy / d : 0, half = (rr - d) / 2;
  a.x -= nx * half; a.y -= ny * half; b.x += nx * half; b.y += ny * half;
  const an = a.vx * nx + a.vy * ny, bn = b.vx * nx + b.vy * ny;
  if (an - bn > 0) {   // closing: exchange the normal components, then keep RESTITUTION of each
    const an2 = RESTITUTION * bn, bn2 = RESTITUTION * an;
    a.vx += (an2 - an) * nx; a.vy += (an2 - an) * ny;
    b.vx += (bn2 - bn) * nx; b.vy += (bn2 - bn) * ny;
  }
  if (state.tick < a.graceUntil[body]!) return;
  for (const s of [a, b]) { s.hull = Math.max(0, s.hull - SHIP_CONTACT_HULL); s.graceUntil[body] = state.tick + CONTACT_GRACE_TICKS; s.shipHits++; }
}

function hitStatics(state: TacticalState, s: Ship): void {
  const { map, grid } = state;
  if (hitStatic(state, s, map.planet.x, map.planet.y, map.planet.r, 0, PLANET_CONTACT_HULL)) s.planetHits++;
  for (const k of queryGrid(grid, s.x, s.y, SHIP_RADIUS)) {
    const a = map.asteroids[k]!;
    if (hitStatic(state, s, a.x, a.y, a.r, k + 1, ASTEROID_CONTACT_HULL)) s.asteroidHits++;
  }
}

/** Spec §4 order, per body in ship order: its static contacts, then its moving contacts. Ship 0 meets the planet and
 *  asteroids, then ship 1 (the pair is resolved once, here); then ship 1 meets the planet and asteroids. */
export function resolveContacts(state: TacticalState): void {
  hitStatics(state, state.ships[0]);
  shipShip(state);
  hitStatics(state, state.ships[1]);
}
```

- [ ] **Step 4: Call it from `stepFlight`**

In `src/renderer/src/sim/tactical/physics.ts`, add the import after the `direction` import:

```ts
import { resolveContacts } from './contacts';
```

and replace `stepFlight` with:

```ts
/** One duel tick of flight: ships fly in fixed order, then contacts resolve, then the tick advances. */
export function stepFlight(state: TacticalState, axes: readonly Axes[], tuning: FlightTuning = DEFAULT_FLIGHT): void {
  state.ships.forEach((s, i) => flyShip(s, axes[i] ?? { turn: 0, thrust: 0 }, tuning));
  resolveContacts(state);
  state.tick++;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/tacticalContacts.test.ts tests/tacticalFlight.test.ts tests/boundary.test.ts`
Expected: PASS (5 contact tests, 15 flight tests).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/tactical/contacts.ts src/renderer/src/sim/tactical/physics.ts tests/tacticalContacts.test.ts
git commit -m "feat(tactical): ship contacts with planet, asteroids and the other ship, with restitution and hull grace (Helm H-0a)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: State hash, determinism and the predicted path

**Files:**
- Create: `src/renderer/src/sim/tactical/hash.ts`
- Create: `src/renderer/src/sim/tactical/predict.ts`
- Test: `tests/tacticalDeterminism.test.ts`

**Interfaces:**
- Consumes: `TacticalState`, `Ship`, `Axes`, `createTacticalState` (Task 3); `flyShip`, `stepFlight` (Tasks 3, 4); `queryGrid` (Task 2); `hashF64` from `src/shared/hash.ts`.
- Produces: `flattenTactical(s: TacticalState): Float64Array`; `hashTactical(s: TacticalState): string`; `interface PathPoint { x; y }`; `touchesSolid(state, x, y, r): boolean`; `predictPath(state: TacticalState, shipIndex: number, axes: Axes, ticks: number, every: number, tuning?: FlightTuning): PathPoint[]`. H-1's Helm layer calls `predictPath` with `every` set to its sample spacing.

- [ ] **Step 1: Write the failing test**

Create `tests/tacticalDeterminism.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTacticalState, type Axes, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepFlight } from '../src/renderer/src/sim/tactical/physics';
import { hashTactical } from '../src/renderer/src/sim/tactical/hash';
import { predictPath } from '../src/renderer/src/sim/tactical/predict';
import { PLANET_RADIUS, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';

/** A fixed input script: both ships turn, thrust, coast and reverse on different beats. */
function script(t: number): Axes[] {
  return [
    { turn: t % 240 < 60 ? 1 : t % 240 < 90 ? -1 : 0, thrust: t % 300 < 150 ? 1 : t % 300 < 180 ? -1 : 0 },
    { turn: t % 200 < 40 ? -1 : 0, thrust: t % 180 < 120 ? 1 : 0 }
  ];
}
function run(seed: number, ticks: number): TacticalState {
  const st = createTacticalState(seed);
  for (let t = 0; t < ticks; t++) stepFlight(st, script(t));
  return st;
}

describe('tactical determinism (spec §4)', () => {
  it('the same seed and inputs give the same hash', () => {
    expect(hashTactical(run(11, 1800))).toBe(hashTactical(run(11, 1800)));
  });
  it('a different seed gives a different hash', () => {
    expect(hashTactical(run(11, 600))).not.toBe(hashTactical(run(12, 600)));
  });
  it('a different input gives a different hash', () => {
    const a = createTacticalState(11), b = createTacticalState(11);
    stepFlight(a, [{ turn: 1, thrust: 0 }, { turn: 0, thrust: 0 }]);
    stepFlight(b, [{ turn: 0, thrust: 0 }, { turn: 0, thrust: 0 }]);
    expect(hashTactical(a)).not.toBe(hashTactical(b));
  });
});

describe('predictPath (spec §10b)', () => {
  it('matches the real flight tick for tick while nothing is hit, and leaves the state untouched', () => {
    const st = createTacticalState(11), before = hashTactical(st), axes = { turn: 1, thrust: 1 };
    const path = predictPath(st, 0, axes, 120, 1);
    expect(hashTactical(st)).toBe(before);
    for (let t = 0; t < 120; t++) {
      stepFlight(st, [axes, { turn: 0, thrust: 0 }]);
      expect(path[t]!.x).toBe(st.ships[0].x);
      expect(path[t]!.y).toBe(st.ships[0].y);
    }
  });
  it('samples every n ticks and stops at the planet', () => {
    const st = createTacticalState(11);
    Object.assign(st.ships[0], { x: 0, y: -400, vx: 0, vy: 200, heading: 128, headingAcc: 0 });
    const path = predictPath(st, 0, { turn: 0, thrust: 1 }, 600, 10);
    const last = path[path.length - 1]!;
    expect(path.length).toBeLessThan(60);
    expect(Math.sqrt(last.x * last.x + last.y * last.y)).toBeLessThan(PLANET_RADIUS + SHIP_RADIUS);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tacticalDeterminism.test.ts`
Expected: FAIL, "Failed to resolve import ../src/renderer/src/sim/tactical/hash".

- [ ] **Step 3: Write the hash**

Create `src/renderer/src/sim/tactical/hash.ts`:

```ts
// Canonical flatten and hash of the tactical state (spec §4: same seed and inputs give the same hash).
// The map is a pure function of the seed, so only its asteroid count is flattened. −0 is written as 0.
import { hashF64 } from '../../../../shared/hash';
import type { TacticalState } from './state';

export function flattenTactical(s: TacticalState): Float64Array {
  const out: number[] = [s.tick, s.seed, s.rng.s, s.map.asteroids.length];
  for (const sh of s.ships) {
    out.push(sh.x, sh.y, sh.vx, sh.vy, sh.heading, sh.headingAcc, sh.hull, sh.rooms[0], sh.rooms[1], sh.rooms[2], sh.planetHits, sh.asteroidHits, sh.shipHits,
      sh.released ? 1 : 0, sh.skidBudget, sh.skidSign);
    for (const g of sh.graceUntil) out.push(g);
  }
  return Float64Array.from(out, (v) => (v === 0 ? 0 : v));
}

export function hashTactical(s: TacticalState): string { return hashF64(flattenTactical(s)); }
```

- [ ] **Step 4: Write the predicted path**

Create `src/renderer/src/sim/tactical/predict.ts`:

```ts
// The Helm's predicted path (spec §10b layer 7): the same flyShip the sim runs, on a copy, with the current axes held.
// Pure: never touches the state. It stops at the first planet or asteroid contact, which it does not resolve.
import { queryGrid } from './grid';
import { flyShip } from './physics';
import type { Axes, Ship, TacticalState } from './state';
import { DEFAULT_FLIGHT, SHIP_RADIUS, type FlightTuning } from './tuning';

export interface PathPoint { x: number; y: number }

export function touchesSolid(state: TacticalState, x: number, y: number, r: number): boolean {
  const p = state.map.planet;
  const pd = r + p.r;
  if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < pd * pd) return true;
  for (const k of queryGrid(state.grid, x, y, r)) {
    const a = state.map.asteroids[k]!, d = r + a.r;
    if ((x - a.x) * (x - a.x) + (y - a.y) * (y - a.y) < d * d) return true;
  }
  return false;
}

/** Positions after every `every` ticks for `ticks` ticks, ending early (with that point) at the first solid contact. */
export function predictPath(state: TacticalState, shipIndex: number, axes: Axes, ticks: number, every: number, tuning: FlightTuning = DEFAULT_FLIGHT): PathPoint[] {
  const src = state.ships[shipIndex]!;
  const s: Ship = { ...src, rooms: [...src.rooms], graceUntil: src.graceUntil };   // flyShip never touches graceUntil
  const out: PathPoint[] = [];
  for (let t = 1; t <= ticks; t++) {
    flyShip(s, axes, tuning);
    if (touchesSolid(state, s.x, s.y, SHIP_RADIUS)) { out.push({ x: s.x, y: s.y }); break; }
    if (t % every === 0) out.push({ x: s.x, y: s.y });
  }
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/tacticalDeterminism.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Run the full suite and the typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

Run: `npm test`
Expected: every test file passes, about 1,570 tests (see the known flake in Global Constraints).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/predict.ts tests/tacticalDeterminism.test.ts
git commit -m "feat(tactical): state hash, determinism tests and the exact predicted path (Helm H-0a)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After H-0a

- **H-0b plan** (next): §5 rooms and shields, §7 weapons and missiles (missile rows of the collision matrix), §8 interior link on the Cutter, §9 hunter, §13 duel step and authority mode, telemetry, the scripted pair, the golden replay and the single `SIM_VERSION` bump with version-only sector re-bless.
- **H-1** can start its dev flight view on H-0a alone: it needs `createTacticalState`, `stepFlight`, `predictPath` and the map.
