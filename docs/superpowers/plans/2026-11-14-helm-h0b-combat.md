# Helm Demo H-0b: Duel Combat and the Hunter (headless) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the duel's combat to the headless tactical sim: shields and rooms, the laser with arcs, room lock and charge-and-release, hand-steered cruise missiles, and the hunter that flies the enemy ship, all driven by one per-ship input struct and one `stepDuel` tick.

**Architecture:** Extends `src/renderer/src/sim/tactical/` (H-0a, merged at `8159abe`). All new ship state is flat scalars on `Ship`, so `cloneShip` and `flattenTactical` stay simple. Each ship gets a `ShipInput` per tick (`helm` and `weapons` attended flags, held axes, missile steering, and the three weapon commands as nullable events). The crew's input comes from the caller; the enemy's comes from `hunterThink`. Nothing is wired into the authority, the Cutter interior or the renderer: that is H-0c (interior link, presence, duel step with commands, authority mode, scripted pair, golden, `SIM_VERSION`) and H-1 (views).

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-helm-demo-design.md` §5 (ships, shields, damage), §7 (laser, missiles, the weapons state transitions table), §9 (hunter), §4 (missile rows of the collision matrix). The H-0a plan is `docs/superpowers/plans/2026-11-14-helm-h0a-flight-sim.md`.

## Scope

H-0 in spec §15 is split three ways:

- **H-0a (merged):** map, physics, headings, flight, ship contacts, predicted path, hash.
- **H-0b (this plan):** §5 rooms and shields, §7 weapons and missiles (and the missile rows of the §4 collision matrix), §9 hunter, and a headless `stepDuel` tick that runs both ships.
- **H-0c (next plan):** §8 interior link on the Cutter, presence, the §13 duel step with authority commands and `sim/duel/step.ts`, the authority mode switch, telemetry gates with the scripted pair, the golden replay and the single `SIM_VERSION` bump. It also takes the H-0a final review's notes: `validateMap` at duel creation, clamped room levels, explicit snapshot encoding of `graceUntil`, the `moveY` sign mapping, and the stale spec §4/§13 lines.

H-0b changes no existing gameplay and needs no `SIM_VERSION` bump: nothing in the sector run imports the tactical files.

## Global Constraints

- Determinism guard (`tests/boundary.test.ts`, `tests/helpers/determinismGuard.ts`) scans every file under `src/renderer/src/sim/**`. Allowed `Math` methods: `abs`, `ceil`, `floor`, `round`, `min`, `max`, `sign`, `imul`, `sqrt`. No `sin`, `cos`, `atan2`, `hypot`, `pow`, `random`, no `**`, no `Date` or `performance`. Tests may use `Math.hypot`.
- Arithmetic in the sim is Float64 `+ − × ÷` and `Math.sqrt` only (spec §4). Arcs use `dot(h, d) ≥ cos θ · |d|` with `cos θ` a literal; sides use the 2-D cross product.
- Files under `sim/` may not import from `authority`, `clientControl` or `headless`.
- Tick rate `TICK_HZ` = 60, `DT` = 1/60. Headings: 256, index 0 = north = (0, −1), clockwise, y down.
- Ship 0 is the crew's, ship 1 the enemy's; everything per ship runs in that order. Missiles are stored at their owner's index (at most one each).
- The only randomness is `state.rng` (`rng.tactical`), drawn only by the hunter's release jitter.
- `tests/tacticalDeterminism.test.ts`'s flatten key guard must keep passing: every new field on `Ship`, `TacticalState` or `Hunter` goes into `flattenTactical`, and the guard's lists and length formula are updated in the same task.
- Commit with explicit paths only (`git add <paths>`), never `git add -A`: the owner keeps unrelated uncommitted files in this checkout. End every commit message with the Co-Authored-By trailer your own session instructs.
- Run single test files with `npx vitest run <file>`. The full suite is `npm test`; typecheck is `npm run typecheck`.
- Known flakes: `tests/authorityBoundary.test.ts` and `tests/run.test.ts` can time out (about 5.5 s) under full-suite load. If one fails in `npm test`, rerun it alone; it is unrelated to this plan.

## Decisions the plan makes inside the spec

1. **Whole-number clocks.** The laser charge and the shield recharge clock count integer units, so durations are exact tick counts and floating-point accumulation can never add a tick: the laser is full at 9,600 units, charging 40 / 25 / 16 per tick at Weapons level 0 / 1 / 2 (240 / 384 / 600 ticks, which is 4 s × 1 / 1.6 / 2.5); a shield layer comes at 900 units, adding 3 / 2 / 0 per tick at Shields level 0 / 1 / 2 (300 / 450 ticks, which is 5 s × 1 / 1.5, or stopped).
2. **`ShipInput`** is the per-tick contract H-0c fills from admitted commands and seats: `helm` and `weapons` say whether a present player sits at that console (spec §8 "attended"); `laserLock`, `laserCharge` and `missileLaunch` are this tick's commands (`null` / `false` for none).
3. **Weapon commands apply at the start of the tick**, before anything moves, so a release fires along the line between the ships as they stand. Range and arc are measured centre to centre; line of sight is the centre-to-centre segment against the planet and the asteroids.
4. **The hold timer** runs whenever the charge is full and the laser is not frozen, with or without Fire held, so a full charge left over after a missile still vents after 3 s (the §7 table's "resumes its hold timer").
5. **Missiles have no drag** (the spec gives them thrust and gravity only) and thrust along their own heading.
6. **The hunter presses Fire first and releases only a held press**, so a full charge left over after a missile is never wasted by a same-tick press and release. When avoiding, it turns away from the first threat found (the planet, then asteroids in ascending index), and turns clockwise if the threat is dead ahead.
7. **The hunter's repair** lowers its own room level directly when the work time ends (it has no interior). Its missile launch rule ignores the arc, as the spec says (within 400, magazine, Weapons below 2, 30 s cooldown).
8. **Per-tick events** (`state.events`: laser shots with hit or miss, and missile endings with their cause) are outputs for the views, reset every tick, and not hashed.
9. **Missile against missile** destroys both and counts as a lost missile for each owner.

**Observed baseline (prototype, seeds 1 to 10):** the hunter destroys a crew that never moves in 54 to 73 s, ending on 4 to 16 hull itself (it rams and scrapes asteroids). Tuning toward the spec's 3 to 5 minute duels needs H-0c's scripted crew pair and is not a gate here.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/tactical/tuning.ts` | **Modify:** append the weapons, shields, missiles and hunter constants |
| `src/renderer/src/sim/tactical/state.ts` | **Replace:** combat fields on `Ship`; `Missile`, `Hunter`, `HunterMode`, `Outcome`, `DuelEvent`; `TacticalState` gains `missiles`, `hunter`, `outcome`, `events` |
| `src/renderer/src/sim/tactical/hash.ts` | **Replace:** flatten the new fields; `MISSILE_SLOT` |
| `src/renderer/src/sim/tactical/geometry.ts` | **Create:** `inArc`, `segmentNear`, `lineOfSight`, `roomAtImpact`, `sideOf` |
| `src/renderer/src/sim/tactical/weapons.ts` | **Create:** `ShipInput`, `IDLE_INPUT`, laser, shields, magazine |
| `src/renderer/src/sim/tactical/missiles.ts` | **Create:** launch, flight, missile contacts |
| `src/renderer/src/sim/tactical/hunter.ts` | **Create:** `hunterThink` |
| `src/renderer/src/sim/tactical/duel.ts` | **Create:** `stepDuel` |

---

### Task 1: Combat state, tuning, hash and geometry

**Files:**
- Modify: `src/renderer/src/sim/tactical/tuning.ts` (append)
- Replace: `src/renderer/src/sim/tactical/state.ts`
- Replace: `src/renderer/src/sim/tactical/hash.ts`
- Create: `src/renderer/src/sim/tactical/geometry.ts`
- Modify: `tests/tacticalDeterminism.test.ts` (one import line, the flatten key guard)
- Test: `tests/tacticalGeometry.test.ts`

**Interfaces:**
- Consumes (H-0a): `hx`, `hy` (`direction.ts`); `queryGrid` (`grid.ts`); `generateMap`, `MapDef`, `Spawn` (`map.ts`); `buildGrid`, `BroadPhase`; `createRng`, `RngState` (`src/shared/rng.ts`); `hashF64` (`src/shared/hash.ts`).
- Produces: the constants below; `Ship` with the new fields `shields`, `shieldClock`, `laserCharge`, `laserHold`, `fireHeld`, `lock`, `magazine`, `magazineClock`, `shots`, `laserHits`, `layersStripped`, `missilesLaunched`, `missileHits`, `missilesLost`; `interface Missile { x; y; vx; vy; heading; headingAcc; age }`; `HunterMode = { Hunt: 0, Repair: 1 }`; `interface Hunter { mode; room; timer; working: boolean; fireAt; lastLaunch; trail: Float64Array; trailHead }`; `Outcome = { Running: 0, CrewWins: 1, EnemyWins: 2, Draw: 3 }`; `type DuelEvent`; `TacticalState` gains `missiles: [Missile | null, Missile | null]`, `hunter: Hunter`, `outcome: number`, `events: DuelEvent[]`; `MISSILE_SLOT` (8); `inArc(heading, dx, dy, arcCos): boolean`; `segmentNear(ax, ay, bx, by, cx, cy, r): boolean`; `lineOfSight(state, ax, ay, bx, by): boolean`; `roomAtImpact(s: Ship, px, py): number`; `sideOf(heading, dx, dy): number` (+1 clockwise, −1 anticlockwise, 0 on the line).

- [ ] **Step 1: Write the failing geometry test**

Create `tests/tacticalGeometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { inArc, lineOfSight, roomAtImpact, segmentNear, sideOf } from '../src/renderer/src/sim/tactical/geometry';
import { createTacticalState, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_ARC_COS } from '../src/renderer/src/sim/tactical/tuning';

describe('arcs without angles (spec §4)', () => {
  it('is inside ±60° of the nose and outside beyond it', () => {
    expect(inArc(0, 0, -10, LASER_ARC_COS)).toBe(true);     // dead ahead (north)
    expect(inArc(0, 10, -10, LASER_ARC_COS)).toBe(true);    // 45°
    expect(inArc(0, 10, -5, LASER_ARC_COS)).toBe(false);    // about 63°
    expect(inArc(0, 0, 10, LASER_ARC_COS)).toBe(false);     // behind
    expect(inArc(64, 10, 0, LASER_ARC_COS)).toBe(true);     // heading east, target east
  });
  it('counts a zero vector as inside', () => {
    expect(inArc(0, 0, 0, LASER_ARC_COS)).toBe(true);
  });
  it('sideOf: +1 clockwise of the nose, −1 anticlockwise, 0 on the line (y down)', () => {
    expect(sideOf(0, 1, 0)).toBe(1);
    expect(sideOf(0, -1, 0)).toBe(-1);
    expect(sideOf(0, 0, -5)).toBe(0);
  });
});

describe('line of sight (spec §7a)', () => {
  it('segmentNear measures to the closest point of the segment, clamped to its ends', () => {
    expect(segmentNear(0, 0, 10, 0, 5, 1, 2)).toBe(true);
    expect(segmentNear(0, 0, 10, 0, 5, 3, 2)).toBe(false);
    expect(segmentNear(0, 0, 10, 0, 13, 0, 2)).toBe(false);
    expect(segmentNear(0, 0, 0, 0, 1, 0, 2)).toBe(true);   // zero-length segment is a point
  });
  it('is blocked by the planet and by an asteroid, and clear in empty space', () => {
    const st = createTacticalState(5), a = st.map.asteroids[0]!;
    expect(lineOfSight(st, -300, 0, 300, 0)).toBe(false);
    expect(lineOfSight(st, -600, -300, -300, -300)).toBe(true);
    expect(lineOfSight(st, a.x - 200, a.y, a.x + 200, a.y)).toBe(false);
  });
});

describe('room by impact point (spec §5)', () => {
  it('nose is Weapons, stern is Engines, flanks are Shields', () => {
    const s = createTacticalState(5).ships[0];
    Object.assign(s, { x: 0, y: 0, heading: 0 });
    expect(roomAtImpact(s, 0, -10)).toBe(Room.Weapons);
    expect(roomAtImpact(s, 0, 10)).toBe(Room.Engines);
    expect(roomAtImpact(s, 10, 0)).toBe(Room.Shields);
    expect(roomAtImpact(s, -10, -1)).toBe(Room.Shields);
    expect(roomAtImpact(s, 5, -5)).toBe(Room.Weapons);    // exactly on the diagonal counts as nose
  });
});
```

- [ ] **Step 2: Update the flatten key guard (it must fail now)**

In `tests/tacticalDeterminism.test.ts`, replace line 4 (the `hash` import) with:

```ts
import { flattenTactical, hashTactical, MISSILE_SLOT } from '../src/renderer/src/sim/tactical/hash';
```

and replace the whole `describe('flatten key guard', ...)` block with:

```ts
describe('flatten key guard', () => {
  // When this fails, add the new field to flattenTactical (hash.ts) and then update the lists below.
  it('Ship and TacticalState fields are exactly those flattenTactical knows', () => {
    const st = createTacticalState(1);
    expect(Object.keys(st.ships[0]).sort()).toEqual(['asteroidHits', 'fireHeld', 'graceUntil', 'heading', 'headingAcc', 'hull', 'laserCharge', 'laserHits', 'laserHold', 'layersStripped', 'lock', 'magazine', 'magazineClock', 'missileHits', 'missilesLaunched', 'missilesLost', 'planetHits', 'released', 'rooms', 'shieldClock', 'shields', 'shipHits', 'shots', 'skidBudget', 'skidSign', 'vx', 'vy', 'x', 'y']);
    expect(Object.keys(st).sort()).toEqual(['events', 'grid', 'hunter', 'map', 'missiles', 'outcome', 'rng', 'seed', 'ships', 'tick']);
    expect(Object.keys(st.hunter).sort()).toEqual(['fireAt', 'lastLaunch', 'mode', 'room', 'timer', 'trail', 'trailHead', 'working']);
    // 5 header values; per ship 30 scalars + one per graceUntil slot; 2 missile slots of MISSILE_SLOT; hunter 7 scalars + its trail.
    expect(flattenTactical(st).length).toBe(5 + 2 * (30 + st.map.asteroids.length + 2) + 2 * MISSILE_SLOT + 7 + st.hunter.trail.length);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/tacticalGeometry.test.ts tests/tacticalDeterminism.test.ts`
Expected: FAIL. The geometry file cannot resolve `../src/renderer/src/sim/tactical/geometry`, and the determinism file fails to import `MISSILE_SLOT`.

- [ ] **Step 4: Append the combat tuning**

Append to the end of `src/renderer/src/sim/tactical/tuning.ts` (after `DEFAULT_FLIGHT`):

```ts
// Weapons and shields (§5, §7a)
export const LASER_RANGE = 450;
export const LASER_ARC_COS = 0.5;             // ±60° arc: inside when dot(h, d) ≥ cos 60° · |d|
/** Laser charge in whole units, so tick counts are exact: full at LASER_CHARGE_UNITS. Weapons damage level 0 / 1 / 2
 *  charges at these units per tick, which is 4 s × 1 / 1.6 / 2.5 (§5): full in 240 / 384 / 600 ticks. */
export const LASER_CHARGE_UNITS = 9600;
export const LASER_CHARGE_RATE: readonly number[] = [40, 25, 16];
export const LASER_HOLD_TICKS = 180;          // a full charge can be held 3 s, then it vents
export const LASER_HULL = 2;
export const SHIELD_LAYERS = 2;
/** Shield recharge clock in whole units: a layer at SHIELD_RECHARGE_UNITS. Shields damage level 0 / 1 / 2 adds these units
 *  per tick, which is 5 s × 1 / 1.5 / stopped (§5): a layer in 300 / 450 ticks, or never. */
export const SHIELD_RECHARGE_UNITS = 900;
export const SHIELD_RATE: readonly number[] = [3, 2, 0];

// Missiles (§7b, §4 collision matrix)
export const MAGAZINE = 4;
export const MAGAZINE_REGEN_TICKS = 2700;     // 45 s per missile regained
export const MISSILE_RADIUS = 4;
export const MISSILE_SPAWN_OFFSET = 25;       // ship radius 20 + missile radius 4 + 1 clear
export const MISSILE_LAUNCH_SPEED = 60;
export const MISSILE_THRUST = 160;
export const MISSILE_TURN_STEPS_PER_TICK = (120 / 360) * HEADING_COUNT * DT;   // 120°/s, about 1.42
export const MISSILE_FUEL_TICKS = 360;        // 6 s of thrust
export const MISSILE_LIFE_TICKS = 480;        // then 2 s of coasting, then it self-destructs
export const MISSILE_ARM_TICKS = 60;          // its own ship is ignored for the first 1 s
export const MISSILE_HULL = 3;

// The hunter (§9)
export const HUNTER_LEAD_S = 0.5;
export const HUNTER_THRUST_COS = 0.8660254037844386;   // thrust when the heading error is under 30°
export const HUNTER_LOOKAHEAD_S = 0.75;
export const HUNTER_AVOID_MARGIN = 30;
export const HUNTER_JITTER_TICKS = 12;        // release jitter drawn uniformly from 0..12 ticks
export const HUNTER_MISSILE_RANGE = 400;
export const HUNTER_MISSILE_COOLDOWN_TICKS = 1800;
export const HUNTER_TRAIL_TICKS = 18;         // missile pursuit aims where the crew was 0.3 s ago
export const HUNTER_WALK_TICKS = 360;         // 6 s stand-in for crossing its ship
export const REPAIR_WORK_TICKS = 240;         // 4 s per damage level
```

- [ ] **Step 5: Replace the state**

Replace the whole of `src/renderer/src/sim/tactical/state.ts` with:

```ts
// Tactical state for the duel (spec §3 to §9). Ship 0 is the crew's, ship 1 the enemy's; they always update in that
// order. All Ship fields are flat scalars or arrays copied by cloneShip, so the flatten and the clone stay simple.
import { createRng, type RngState } from '../../../../shared/rng';
import { buildGrid, type BroadPhase } from './grid';
import { generateMap, type MapDef, type Spawn } from './map';
import { HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_TRAIL_TICKS, MAGAZINE, SHIELD_LAYERS, SHIP_HULL } from './tuning';

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
  /** Shield layers 0..2 and the recharge clock in SHIELD_RECHARGE_UNITS (spec §5). */
  shields: number; shieldClock: number;
  /** Laser (spec §7a): charge 0..LASER_CHARGE_UNITS (full), ticks a full charge has been held, whether Fire is held, the locked enemy Room. */
  laserCharge: number; laserHold: number; fireHeld: boolean; lock: number;
  /** Missiles in the magazine and the regain clock in ticks (spec §7b). */
  magazine: number; magazineClock: number;
  /** Telemetry counters (spec §13). */
  shots: number; laserHits: number; layersStripped: number; missilesLaunched: number; missileHits: number; missilesLost: number;
}

/** A cruise missile in flight (spec §7b). At most one per ship, stored at its owner's index. */
export interface Missile { x: number; y: number; vx: number; vy: number; heading: number; headingAcc: number; age: number }

export const HunterMode = { Hunt: 0, Repair: 1 } as const;
/** The enemy's brain (spec §9). */
export interface Hunter {
  mode: number;
  /** Repair: the Room being repaired, ticks left in this phase, and whether the walk is over. */
  room: number; timer: number; working: boolean;
  /** Tick on which the jittered release is due, or −1 when none is scheduled. */
  fireAt: number;
  lastLaunch: number;
  /** Ring buffer of the crew ship's last HUNTER_TRAIL_TICKS positions (x, y pairs); trailHead is the oldest entry. */
  trail: Float64Array; trailHead: number;
}

export const Outcome = { Running: 0, CrewWins: 1, EnemyWins: 2, Draw: 3 } as const;

/** Per-tick events for the views (shots and missile endings). Reset every tick and not hashed. */
export type DuelEvent =
  | { kind: 'laser'; ship: number; hit: boolean; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'missileEnd'; ship: number; cause: 'ship' | 'planet' | 'asteroid' | 'edge' | 'expired' | 'missile'; x: number; y: number };

export interface TacticalState {
  tick: number; seed: number; rng: RngState; map: MapDef; grid: BroadPhase;
  ships: [Ship, Ship];
  missiles: [Missile | null, Missile | null];
  hunter: Hunter;
  outcome: number;
  events: DuelEvent[];
}

/** Held axes for one ship: turn (+ clockwise) and thrust (+ forward). Nominally −1, 0 or 1; flyShip quantises them by sign (NaN counts as 0). */
export interface Axes { turn: number; thrust: number }
export const NO_AXES: Axes = { turn: 0, thrust: 0 };

/** Body id of the other ship in Ship.graceUntil. */
export function otherShipBody(map: MapDef): number { return map.asteroids.length + 1; }

function shipAt(s: Spawn, bodies: number): Ship {
  return {
    x: s.x, y: s.y, vx: s.vx, vy: s.vy, heading: s.heading, headingAcc: 0, hull: SHIP_HULL, rooms: [0, 0, 0], graceUntil: new Int32Array(bodies),
    planetHits: 0, asteroidHits: 0, shipHits: 0, released: false, skidBudget: 0, skidSign: 0,
    shields: SHIELD_LAYERS, shieldClock: 0, laserCharge: 0, laserHold: 0, fireHeld: false, lock: Room.Shields, magazine: MAGAZINE, magazineClock: 0,
    shots: 0, laserHits: 0, layersStripped: 0, missilesLaunched: 0, missileHits: 0, missilesLost: 0
  };
}

function hunterFor(crew: Spawn): Hunter {
  const trail = new Float64Array(2 * HUNTER_TRAIL_TICKS);
  for (let k = 0; k < HUNTER_TRAIL_TICKS; k++) { trail[2 * k] = crew.x; trail[2 * k + 1] = crew.y; }
  return { mode: HunterMode.Hunt, room: 0, timer: 0, working: false, fireAt: -1, lastLaunch: -HUNTER_MISSILE_COOLDOWN_TICKS, trail, trailHead: 0 };
}

export function createTacticalState(seed: number): TacticalState {
  const rng = createRng(seed);
  const map = generateMap(rng);
  const bodies = map.asteroids.length + 2;
  return {
    tick: 0, seed, rng, map, grid: buildGrid(map.asteroids, map.rMap),
    ships: [shipAt(map.spawns[0], bodies), shipAt(map.spawns[1], bodies)],
    missiles: [null, null], hunter: hunterFor(map.spawns[0]), outcome: Outcome.Running, events: []
  };
}

/** Deep copy of a ship. Any new nested Ship state (arrays, typed arrays) must be copied here. */
export function cloneShip(s: Ship): Ship {
  return { ...s, rooms: [...s.rooms], graceUntil: new Int32Array(s.graceUntil) };
}
```

- [ ] **Step 6: Replace the hash**

Replace the whole of `src/renderer/src/sim/tactical/hash.ts` with:

```ts
// Canonical flatten and hash of the tactical state (spec §4: same seed and inputs give the same hash).
// The map is a pure function of the seed, so only its asteroid count is flattened. Per-tick events are outputs, reset
// every tick, and not hashed. −0 is written as 0. tests/tacticalDeterminism.test.ts guards the field lists.
import { hashF64 } from '../../../../shared/hash';
import type { Missile, TacticalState } from './state';

/** Values per missile slot: a presence flag, then x, y, vx, vy, heading, headingAcc, age (zeros when empty). */
export const MISSILE_SLOT = 8;

function missile(out: number[], m: Missile | null): void {
  if (!m) { for (let k = 0; k < MISSILE_SLOT; k++) out.push(0); return; }
  out.push(1, m.x, m.y, m.vx, m.vy, m.heading, m.headingAcc, m.age);
}

export function flattenTactical(s: TacticalState): Float64Array {
  const out: number[] = [s.tick, s.seed, s.rng.s, s.map.asteroids.length, s.outcome];
  for (const sh of s.ships) {
    out.push(sh.x, sh.y, sh.vx, sh.vy, sh.heading, sh.headingAcc, sh.hull, sh.rooms[0], sh.rooms[1], sh.rooms[2], sh.planetHits, sh.asteroidHits, sh.shipHits,
      sh.released ? 1 : 0, sh.skidBudget, sh.skidSign,
      sh.shields, sh.shieldClock, sh.laserCharge, sh.laserHold, sh.fireHeld ? 1 : 0, sh.lock, sh.magazine, sh.magazineClock,
      sh.shots, sh.laserHits, sh.layersStripped, sh.missilesLaunched, sh.missileHits, sh.missilesLost);
    for (const g of sh.graceUntil) out.push(g);
  }
  missile(out, s.missiles[0]); missile(out, s.missiles[1]);
  const h = s.hunter;
  out.push(h.mode, h.room, h.timer, h.working ? 1 : 0, h.fireAt, h.lastLaunch, h.trailHead);
  for (const v of h.trail) out.push(v);
  return Float64Array.from(out, (v) => (v === 0 ? 0 : v));
}

export function hashTactical(s: TacticalState): string { return hashF64(flattenTactical(s)); }
```

- [ ] **Step 7: Write the geometry**

Create `src/renderer/src/sim/tactical/geometry.ts`:

```ts
// Combat geometry without angles (spec §4): arcs by dot product, sides by cross product, line of sight by segment
// against circle, and the room a missile strikes by its impact point (spec §5).
import { hx, hy } from './direction';
import { queryGrid } from './grid';
import { Room, type Ship, type TacticalState } from './state';

/** Whether direction (dx, dy) lies inside the ±arc around heading h, given cos(arc) as a literal. A zero vector counts as inside. */
export function inArc(heading: number, dx: number, dy: number, arcCos: number): boolean {
  const d = Math.sqrt(dx * dx + dy * dy);
  return hx(heading) * dx + hy(heading) * dy >= arcCos * d;
}

/** Whether the segment (ax, ay) → (bx, by) passes closer than r to the point (cx, cy). */
export function segmentNear(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): boolean {
  const ex = bx - ax, ey = by - ay, len2 = ex * ex + ey * ey;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((cx - ax) * ex + (cy - ay) * ey) / len2)) : 0;
  const px = ax + ex * t - cx, py = ay + ey * t - cy;
  return px * px + py * py < r * r;
}

/** True when nothing solid (the planet or any asteroid) lies across the segment (spec §7a line of sight). */
export function lineOfSight(state: TacticalState, ax: number, ay: number, bx: number, by: number): boolean {
  const p = state.map.planet;
  if (segmentNear(ax, ay, bx, by, p.x, p.y, p.r)) return false;
  const half = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / 2;
  for (const k of queryGrid(state.grid, (ax + bx) / 2, (ay + by) / 2, half)) {
    const a = state.map.asteroids[k]!;
    if (segmentNear(ax, ay, bx, by, a.x, a.y, a.r)) return false;
  }
  return true;
}

/** The room a hit at (px, py) strikes on ship s (spec §5): nose = Weapons, stern = Engines, flanks = Shields. */
export function roomAtImpact(s: Ship, px: number, py: number): number {
  const dx = px - s.x, dy = py - s.y, h0 = hx(s.heading), h1 = hy(s.heading);
  const f = dx * h0 + dy * h1, side = Math.abs(h0 * dy - h1 * dx);
  if (f >= side) return Room.Weapons;
  if (-f >= side) return Room.Engines;
  return Room.Shields;
}

/** 2-D cross product sign of heading h against (dx, dy): +1 when (dx, dy) is clockwise of h (y down), −1 anticlockwise, 0 on the line. */
export function sideOf(heading: number, dx: number, dy: number): number {
  return Math.sign(hx(heading) * dy - hy(heading) * dx) || 0;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/tacticalGeometry.test.ts tests/tacticalDeterminism.test.ts tests/tacticalFlight.test.ts tests/tacticalContacts.test.ts tests/tacticalMap.test.ts tests/tacticalHeadings.test.ts tests/boundary.test.ts`
Expected: PASS (6 geometry tests, 8 determinism tests, and every H-0a test unchanged).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/geometry.ts tests/tacticalGeometry.test.ts tests/tacticalDeterminism.test.ts
git commit -m "feat(tactical): combat state (shields, laser, magazine, missiles, hunter, outcome), tuning, hash and arc/LOS/impact geometry (Helm H-0b)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 2: Laser, shields, magazine and missiles

**Files:**
- Create: `src/renderer/src/sim/tactical/missiles.ts`
- Create: `src/renderer/src/sim/tactical/weapons.ts`
- Test: `tests/tacticalWeapons.test.ts`, `tests/tacticalMissiles.test.ts`

**Interfaces:**
- Consumes: Task 1's state, tuning and geometry; `gravityAccel` (`physics.ts`, H-0a); `hx`, `hy`, `wrapHeading`; `queryGrid`.
- Produces: `interface ShipInput { helm: boolean; weapons: boolean; axes: Axes; steer: number; laserLock: number | null; laserCharge: boolean | null; missileLaunch: boolean }`; `IDLE_INPUT` (both consoles attended, no commands); `laserFull(state, i): boolean`; `laserFrozen(state, i, input): boolean`; `laserEligible(state, i, j): boolean`; `applyWeaponsInput(state, i, input): void` (commands, before movement); `tickWeapons(state, i, input): void` (laser charge and hold, shields, magazine, after contacts); `launchMissile(state, i): void`; `flyMissile(state, i, steer): void`; `resolveMissiles(state): void`.

The two modules import each other's exports one way only: `weapons.ts` imports `launchMissile` from `missiles.ts`; `missiles.ts` does not import `weapons.ts`.

- [ ] **Step 1: Write the failing tests**

Create `tests/tacticalWeapons.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTacticalState, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { applyWeaponsInput, IDLE_INPUT, laserEligible, tickWeapons, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { LASER_CHARGE_UNITS, LASER_HOLD_TICKS, MAGAZINE, MAGAZINE_REGEN_TICKS, SHIELD_RATE, SHIP_HULL } from '../src/renderer/src/sim/tactical/tuning';

/** Crew at (−600, −300) heading east, enemy 300 units east of it: inside the belt, clear of the planet, in arc and range. */
function duel(): TacticalState {
  const st = createTacticalState(5);
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  return st;
}
const input = (over: Partial<ShipInput> = {}): ShipInput => ({ ...IDLE_INPUT, ...over });
/** One weapons tick for both ships (no flight): commands, then clocks. */
function tick(st: TacticalState, crew: ShipInput, enemy: ShipInput = IDLE_INPUT): void {
  applyWeaponsInput(st, 0, crew); applyWeaponsInput(st, 1, enemy);
  tickWeapons(st, 0, crew); tickWeapons(st, 1, enemy);
  st.tick++;
}
function hold(st: TacticalState, ticks: number, over: Partial<ShipInput> = {}): void {
  tick(st, input({ laserCharge: true, ...over }));
  for (let t = 1; t < ticks; t++) tick(st, input(over));
}

describe('laser charge and release (spec §7a, §7 table)', () => {
  it('charges to full in exactly 240 ticks (4 s) while Fire is held', () => {
    const st = duel(), s = st.ships[0];
    hold(st, 239);
    expect(s.laserCharge).toBeLessThan(LASER_CHARGE_UNITS);
    tick(st, input());
    expect(s.laserCharge).toBe(LASER_CHARGE_UNITS);
  });
  it('a full release in arc strips a shield layer', () => {
    const st = duel(), [a, b] = st.ships;
    hold(st, 240);
    tick(st, input({ laserCharge: false }));
    expect([a.shots, a.laserHits, a.layersStripped]).toEqual([1, 1, 1]);
    expect(b.shields).toBe(1);
    expect(b.hull).toBe(SHIP_HULL);
    expect(a.laserCharge).toBe(0);
    expect(st.events).toContainEqual({ kind: 'laser', ship: 0, hit: true, x1: -600, y1: -300, x2: -300, y2: -300 });
  });
  it('an early release discards the charge without a shot', () => {
    const st = duel(), a = st.ships[0];
    hold(st, 100);
    tick(st, input({ laserCharge: false }));
    expect(a.laserCharge).toBe(0);
    expect(a.shots).toBe(0);
  });
  it('with shields down, damages the locked room and costs 2 hull; a room at level 2 takes no more room damage', () => {
    const st = duel(), b = st.ships[1];
    b.shields = 0;
    tick(st, input({ laserLock: Room.Engines }));
    for (let shot = 0; shot < 3; shot++) {
      b.shields = 0; b.shieldClock = 0;
      hold(st, 240);
      tick(st, input({ laserCharge: false }));
    }
    expect(b.rooms[Room.Engines]).toBe(2);
    expect(b.hull).toBe(SHIP_HULL - 6);
  });
  it('misses outside the arc, out of range or without line of sight', () => {
    const st = duel(), a = st.ships[0];
    st.ships[1].x = -900;                                   // behind the crew
    expect(laserEligible(st, 0, 1)).toBe(false);
    hold(st, 240);
    tick(st, input({ laserCharge: false }));
    expect([a.shots, a.laserHits]).toEqual([1, 0]);
    expect(st.ships[1].shields).toBe(2);
    Object.assign(st.ships[1], { x: -600 + 460, y: -300 });  // in arc, out of range
    expect(laserEligible(st, 0, 1)).toBe(false);
    Object.assign(st.ships[0], { x: -300, y: 0 }); Object.assign(st.ships[1], { x: 300, y: 0 });   // planet between
    expect(laserEligible(st, 0, 1)).toBe(false);
  });
  it('a full charge held 3 s vents and starts charging again', () => {
    const st = duel(), a = st.ships[0];
    hold(st, 240 + LASER_HOLD_TICKS - 1);
    expect(a.laserCharge).toBe(LASER_CHARGE_UNITS);
    tick(st, input());
    expect(a.laserCharge).toBe(0);
    tick(st, input());
    expect(a.laserCharge).toBeGreaterThan(0);
  });
  it('Weapons damage stretches the charge time: 10 s at level 2', () => {
    const st = duel(), a = st.ships[0];
    a.rooms[Room.Weapons] = 2;
    hold(st, 599);
    expect(a.laserCharge).toBeLessThan(LASER_CHARGE_UNITS);
    tick(st, input());
    expect(a.laserCharge).toBe(LASER_CHARGE_UNITS);
  });
  it('an empty Weapons console lets go of Fire without firing or discarding, and freezes the charge', () => {
    const st = duel(), a = st.ships[0];
    hold(st, 120);
    const charge = a.laserCharge;
    tick(st, input({ weapons: false, laserCharge: false }));
    expect(a.fireHeld).toBe(false);
    expect(a.shots).toBe(0);
    for (let t = 0; t < 60; t++) tick(st, input({ weapons: false }));
    expect(a.laserCharge).toBe(charge);
    tick(st, input());                                      // attended again: nothing until a fresh press
    expect(a.laserCharge).toBe(charge);
    hold(st, 10);
    expect(a.laserCharge).toBeGreaterThan(charge);
  });
});

describe('shields (spec §5)', () => {
  it('recharge one layer per 5 s, 7.5 s at Shields level 1, and stop at level 2 with the clock held', () => {
    const st = duel(), b = st.ships[1];
    b.shields = 0;
    for (let t = 0; t < 300; t++) tick(st, input());
    expect(b.shields).toBe(1);
    b.rooms[Room.Shields] = 1;
    for (let t = 0; t < 449; t++) tick(st, input());
    expect(b.shields).toBe(1);
    tick(st, input());
    expect(b.shields).toBe(2);
    b.shields = 1; b.rooms[Room.Shields] = 2;
    for (let t = 0; t < 120; t++) tick(st, input());
    const held = b.shieldClock;
    for (let t = 0; t < 600; t++) tick(st, input());
    expect(b.shields).toBe(1);
    expect(b.shieldClock).toBe(held);
  });
  it('a stripping hit resets the recharge clock', () => {
    const st = duel(), b = st.ships[1];
    b.shields = 1; b.shieldClock = 0;
    hold(st, 240);
    expect(b.shieldClock).toBe(240 * SHIELD_RATE[0]!);
    tick(st, input({ laserCharge: false }));
    expect(b.shields).toBe(0);
    expect(b.shieldClock).toBe(SHIELD_RATE[0]);           // reset by the hit, then one tick of recharge
  });
});

describe('magazine (spec §7b)', () => {
  it('regains one missile every 45 s up to the full magazine', () => {
    const st = duel(), a = st.ships[0];
    a.magazine = MAGAZINE - 2;
    for (let t = 0; t < MAGAZINE_REGEN_TICKS; t++) tick(st, input());
    expect(a.magazine).toBe(MAGAZINE - 1);
    for (let t = 0; t < 2 * MAGAZINE_REGEN_TICKS; t++) tick(st, input());
    expect(a.magazine).toBe(MAGAZINE);
    expect(a.magazineClock).toBe(0);
  });
});
```

Create `tests/tacticalMissiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { flyMissile, resolveMissiles } from '../src/renderer/src/sim/tactical/missiles';
import { createTacticalState, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { applyWeaponsInput, IDLE_INPUT, tickWeapons, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { MAGAZINE, MISSILE_LIFE_TICKS, MISSILE_TURN_STEPS_PER_TICK, R_MAP, SHIP_HULL } from '../src/renderer/src/sim/tactical/tuning';

/** Crew at (−600, −300) heading east, enemy far off at (−600, 600): inside the belt and clear of the planet. */
function duel(): TacticalState {
  const st = createTacticalState(5);
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -600, y: 600, vx: 0, vy: 0, heading: 0 });
  return st;
}
const input = (over: Partial<ShipInput> = {}): ShipInput => ({ ...IDLE_INPUT, ...over });
/** One tick of commands, missile flight, missile contacts and weapon clocks; ships do not move. */
function tick(st: TacticalState, crew: ShipInput, steer = 0): void {
  applyWeaponsInput(st, 0, crew); applyWeaponsInput(st, 1, IDLE_INPUT);
  flyMissile(st, 0, crew.weapons ? steer : 0); flyMissile(st, 1, 0);
  resolveMissiles(st);
  tickWeapons(st, 0, crew); tickWeapons(st, 1, IDLE_INPUT);
  st.tick++;
}

describe('launch (spec §7b)', () => {
  it('spawns 25 units ahead with the ship velocity plus 60 u/s, and takes one from the magazine', () => {
    const st = duel(), s = st.ships[0];
    s.vx = 10;
    applyWeaponsInput(st, 0, input({ missileLaunch: true }));
    const m = st.missiles[0]!;
    expect([m.x, m.y, m.vx, m.vy, m.heading, m.age]).toEqual([-575, -300, 70, 0, 64, 0]);
    expect([s.magazine, s.missilesLaunched]).toEqual([MAGAZINE - 1, 1]);
  });
  it('is refused with an empty magazine, Weapons at level 2, a missile already flying, or nobody at Weapons', () => {
    for (const setup of [
      (st: TacticalState) => { st.ships[0].magazine = 0; },
      (st: TacticalState) => { st.ships[0].rooms[Room.Weapons] = 2; },
      (st: TacticalState) => { applyWeaponsInput(st, 0, input({ missileLaunch: true })); }
    ]) {
      const st = duel();
      setup(st);
      const before = st.ships[0].missilesLaunched;
      applyWeaponsInput(st, 0, input({ missileLaunch: true }));
      expect(st.ships[0].missilesLaunched).toBe(Math.min(before, 1));
    }
    const st = duel();
    applyWeaponsInput(st, 0, input({ weapons: false, missileLaunch: true }));
    expect(st.missiles[0]).toBeNull();
  });
  it('freezes the laser while it flies and ignores laserCharge commands', () => {
    const st = duel(), s = st.ships[0];
    tick(st, input({ laserCharge: true }));
    for (let t = 0; t < 59; t++) tick(st, input());
    const charge = s.laserCharge;
    tick(st, input({ missileLaunch: true }));
    expect(s.fireHeld).toBe(false);
    for (let t = 0; t < 60; t++) tick(st, input({ laserCharge: true }));
    expect(s.laserCharge).toBe(charge);
    expect(s.fireHeld).toBe(false);
  });
});

describe('flight (spec §7b)', () => {
  it('turns at 120°/s under the gunner and expires after 8 s with a missileEnd event', () => {
    const st = duel();
    Object.assign(st.ships[0], { x: -600, y: -300, heading: 0 });       // aim north, away from everything
    tick(st, input({ missileLaunch: true }));
    for (let t = 1; t < 60; t++) tick(st, input(), 1);
    expect(st.missiles[0]!.heading).toBe(Math.floor(MISSILE_TURN_STEPS_PER_TICK * 59));
    let ended = false;
    for (let t = 60; t <= MISSILE_LIFE_TICKS + 1 && !ended; t++) { tick(st, input()); ended = st.missiles[0] === null; }
    expect(ended).toBe(true);
    expect(st.ships[0].missilesLost).toBe(1);
  });
  it('flies on unsteered when nobody is at Weapons, and keeps its thrust', () => {
    const st = duel();
    tick(st, input({ missileLaunch: true }));
    const v0 = st.missiles[0]!.vx;
    for (let t = 0; t < 30; t++) tick(st, input({ weapons: false }), 1);
    expect(st.missiles[0]!.heading).toBe(64);
    expect(st.missiles[0]!.vx).toBeGreaterThan(v0 + 70);
  });
});

describe('missile contacts (spec §4 collision matrix)', () => {
  it('bypasses shields: lands on the room at the impact point, +1 damage and 3 hull', () => {
    const st = duel(), b = st.ships[1];
    Object.assign(b, { x: -400, y: -300, heading: 192 });             // facing the crew: its nose faces the missile
    tick(st, input({ missileLaunch: true }));
    for (let t = 0; t < 120 && st.missiles[0]; t++) tick(st, input());
    expect(st.missiles[0]).toBeNull();
    expect(b.shields).toBe(2);
    expect(b.rooms).toEqual([1, 0, 0]);
    expect(b.hull).toBe(SHIP_HULL - 3);
    expect(st.ships[0].missileHits).toBe(1);
    expect(st.events.some((e) => e.kind === 'missileEnd' && e.cause === 'ship')).toBe(true);
  });
  it('ignores its own ship for the first second, then can hit it', () => {
    const st = duel(), s = st.ships[0];
    tick(st, input({ missileLaunch: true }));
    const m = st.missiles[0]!;
    Object.assign(m, { x: s.x, y: s.y, vx: 0, vy: 0 });                 // sitting on its own ship at age 1
    resolveMissiles(st);
    expect(st.missiles[0]).not.toBeNull();
    m.age = 61;
    resolveMissiles(st);
    expect(st.missiles[0]).toBeNull();
    expect(s.hull).toBe(SHIP_HULL - 3);
  });
  it('is destroyed by the planet, an asteroid or the map edge, and two missiles destroy each other', () => {
    const cases: [string, (st: TacticalState) => void][] = [
      ['planet', (st) => Object.assign(st.missiles[0]!, { x: 0, y: -60 })],
      ['asteroid', (st) => { const a = st.map.asteroids[0]!; Object.assign(st.missiles[0]!, { x: a.x, y: a.y }); }],
      ['edge', (st) => Object.assign(st.missiles[0]!, { x: R_MAP + 1, y: 0 })]
    ];
    for (const [cause, place] of cases) {
      const st = duel();
      applyWeaponsInput(st, 0, input({ missileLaunch: true }));
      place(st);
      resolveMissiles(st);
      expect(st.missiles[0], cause).toBeNull();
      expect(st.events.at(-1), cause).toMatchObject({ kind: 'missileEnd', cause });
    }
    const st = duel();
    applyWeaponsInput(st, 0, input({ missileLaunch: true }));
    applyWeaponsInput(st, 1, input({ missileLaunch: true }));
    Object.assign(st.missiles[1]!, { x: st.missiles[0]!.x + 5, y: st.missiles[0]!.y });
    resolveMissiles(st);
    expect(st.missiles).toEqual([null, null]);
    expect(st.ships[1].hull).toBe(SHIP_HULL);
  });
  it('unfreezes the laser when the missile ends; a held full charge needs a fresh press and release', () => {
    const st = duel(), s = st.ships[0];
    tick(st, input({ laserCharge: true }));
    for (let t = 1; t < 240; t++) tick(st, input());
    tick(st, input({ missileLaunch: true }));
    Object.assign(st.missiles[0]!, { x: 0, y: -60 });                  // into the planet
    tick(st, input());
    expect(st.missiles[0]).toBeNull();
    tick(st, input({ laserCharge: false }));                            // a release without a press: nothing
    expect(s.shots).toBe(0);
    tick(st, input({ laserCharge: true }));
    tick(st, input({ laserCharge: false }));
    expect(s.shots).toBe(1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/tacticalWeapons.test.ts tests/tacticalMissiles.test.ts`
Expected: FAIL, "Failed to resolve import ../src/renderer/src/sim/tactical/weapons".

- [ ] **Step 3: Write the missiles**

Create `src/renderer/src/sim/tactical/missiles.ts`:

```ts
// Cruise missiles (spec §7b and the missile rows of the §4 collision matrix). At most one per ship, at its owner's index.
// A missile thrusts for its fuel time and coasts until it expires, attended or not; it has no drag. Gravity bends it.
import { hx, hy, wrapHeading } from './direction';
import { roomAtImpact } from './geometry';
import { queryGrid } from './grid';
import { gravityAccel } from './physics';
import type { DuelEvent, Missile, TacticalState } from './state';
import {
  DT, MISSILE_ARM_TICKS, MISSILE_FUEL_TICKS, MISSILE_HULL, MISSILE_LAUNCH_SPEED, MISSILE_LIFE_TICKS, MISSILE_RADIUS, MISSILE_SPAWN_OFFSET,
  MISSILE_THRUST, MISSILE_TURN_STEPS_PER_TICK, R_MAP, SHIP_RADIUS
} from './tuning';

type EndCause = Extract<DuelEvent, { kind: 'missileEnd' }>['cause'];

export function launchMissile(state: TacticalState, i: number): void {
  const s = state.ships[i]!, h0 = hx(s.heading), h1 = hy(s.heading);
  state.missiles[i] = {
    x: s.x + h0 * MISSILE_SPAWN_OFFSET, y: s.y + h1 * MISSILE_SPAWN_OFFSET,
    vx: s.vx + h0 * MISSILE_LAUNCH_SPEED, vy: s.vy + h1 * MISSILE_LAUNCH_SPEED,
    heading: s.heading, headingAcc: 0, age: 0
  };
  s.magazine--; s.missilesLaunched++;
}

function end(state: TacticalState, i: number, cause: EndCause): void {
  const m = state.missiles[i]!;
  state.events.push({ kind: 'missileEnd', ship: i, cause, x: m.x, y: m.y });
  if (cause !== 'ship') state.ships[i]!.missilesLost++;
  state.missiles[i] = null;
}

/** One tick of missile i's flight. `steer` is the gunner's turn axis (0 when the Weapons console is empty). */
export function flyMissile(state: TacticalState, i: number, steer: number): void {
  const m = state.missiles[i];
  if (!m) return;
  m.age++;
  if (m.age > MISSILE_LIFE_TICKS) { end(state, i, 'expired'); return; }
  m.headingAcc += (Math.sign(steer) || 0) * MISSILE_TURN_STEPS_PER_TICK;
  while (m.headingAcc >= 1) { m.heading = wrapHeading(m.heading + 1); m.headingAcc -= 1; }
  while (m.headingAcc <= -1) { m.heading = wrapHeading(m.heading - 1); m.headingAcc += 1; }
  let [ax, ay] = gravityAccel(m.x, m.y);
  if (m.age <= MISSILE_FUEL_TICKS) { ax += hx(m.heading) * MISSILE_THRUST; ay += hy(m.heading) * MISSILE_THRUST; }
  m.vx += ax * DT; m.vy += ay * DT;
  m.x += m.vx * DT; m.y += m.vy * DT;
}

function touches(m: Missile, x: number, y: number, r: number): boolean {
  const dx = m.x - x, dy = m.y - y, rr = MISSILE_RADIUS + r;
  return dx * dx + dy * dy < rr * rr;
}

/** Land missile i on ship k at its impact point: shields are bypassed (spec §7b, Q20). */
function land(state: TacticalState, i: number, k: number): void {
  const m = state.missiles[i]!, target = state.ships[k]!, room = roomAtImpact(target, m.x, m.y) as 0 | 1 | 2;
  if (target.rooms[room] < 2) target.rooms[room]++;
  target.hull = Math.max(0, target.hull - MISSILE_HULL);
  state.ships[i]!.missileHits++;
  end(state, i, 'ship');
}

/** Missile contacts in spec §4 order, per missile in owner order: statics and the edge, then ships by id, then the other missile. */
export function resolveMissiles(state: TacticalState): void {
  for (let i = 0; i < 2; i++) {
    const m = state.missiles[i];
    if (!m) continue;
    const p = state.map.planet;
    if (touches(m, p.x, p.y, p.r)) { end(state, i, 'planet'); continue; }
    if (queryGrid(state.grid, m.x, m.y, MISSILE_RADIUS).some((k) => { const a = state.map.asteroids[k]!; return touches(m, a.x, a.y, a.r); })) { end(state, i, 'asteroid'); continue; }
    if (m.x * m.x + m.y * m.y > R_MAP * R_MAP) { end(state, i, 'edge'); continue; }
    let landed = false;
    for (let k = 0; k < 2 && !landed; k++) {
      if (k === i && m.age <= MISSILE_ARM_TICKS) continue;
      const s = state.ships[k]!;
      if (touches(m, s.x, s.y, SHIP_RADIUS)) { land(state, i, k); landed = true; }
    }
    if (landed) continue;
    const o = state.missiles[1 - i];
    if (o && touches(m, o.x, o.y, MISSILE_RADIUS)) { end(state, i, 'missile'); end(state, 1 - i, 'missile'); }
  }
}
```

- [ ] **Step 4: Write the weapons**

Create `src/renderer/src/sim/tactical/weapons.ts`:

```ts
// Laser, shields and the magazine (spec §5, §7a, the §7 weapons state transitions table).
// Commands arrive as one ShipInput per ship per tick; H-0c builds these from the authority's admitted commands.
import { inArc, lineOfSight } from './geometry';
import { launchMissile } from './missiles';
import { Room, type Axes, type TacticalState } from './state';
import {
  LASER_ARC_COS, LASER_CHARGE_RATE, LASER_CHARGE_UNITS, LASER_HOLD_TICKS, LASER_HULL, LASER_RANGE, MAGAZINE, MAGAZINE_REGEN_TICKS, SHIELD_LAYERS,
  SHIELD_RATE, SHIELD_RECHARGE_UNITS
} from './tuning';

/** One ship's inputs for one tick. `helm` / `weapons`: a present player is seated at that console ("attended", spec §8). */
export interface ShipInput {
  helm: boolean;
  weapons: boolean;
  /** Turn and thrust, read only while `helm`. */
  axes: Axes;
  /** Missile steering turn axis, read only while `weapons` and a missile flies. */
  steer: number;
  /** `laserLock {room}`: the enemy Room to lock, or null for no command this tick. */
  laserLock: number | null;
  /** `laserCharge {held}`: true = press, false = release, null = no command this tick. */
  laserCharge: boolean | null;
  /** `missileLaunch`. */
  missileLaunch: boolean;
}

/** A crew that sits at both consoles and does nothing. */
export const IDLE_INPUT: ShipInput = { helm: true, weapons: true, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false };

/** Whether ship i's laser is fully charged. */
export function laserFull(state: TacticalState, i: number): boolean { return state.ships[i]!.laserCharge >= LASER_CHARGE_UNITS; }

/** The laser cannot charge, hold or fire while its ship's missile flies or its Weapons console is empty (spec §7 table). */
export function laserFrozen(state: TacticalState, i: number, input: ShipInput): boolean {
  return state.missiles[i] !== null || !input.weapons;
}

/** Whether ship i's laser would hit ship j now: inside the ±60° arc and range, with line of sight (spec §7a). */
export function laserEligible(state: TacticalState, i: number, j: number): boolean {
  const a = state.ships[i]!, b = state.ships[j]!, dx = b.x - a.x, dy = b.y - a.y;
  if (dx * dx + dy * dy > LASER_RANGE * LASER_RANGE) return false;
  return inArc(a.heading, dx, dy, LASER_ARC_COS) && lineOfSight(state, a.x, a.y, b.x, b.y);
}

function fireLaser(state: TacticalState, i: number): void {
  const a = state.ships[i]!, j = 1 - i, b = state.ships[j]!, hit = laserEligible(state, i, j);
  a.shots++;
  if (hit) {
    a.laserHits++;
    if (b.shields > 0) { b.shields--; b.shieldClock = 0; a.layersStripped++; }
    else {
      if (b.rooms[a.lock]! < 2) b.rooms[a.lock as 0 | 1 | 2]++;
      b.hull = Math.max(0, b.hull - LASER_HULL);
    }
  }
  state.events.push({ kind: 'laser', ship: i, hit, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  a.laserCharge = 0; a.laserHold = 0;
}

/** Apply ship i's weapon commands for this tick, before anything moves (spec §7 table). */
export function applyWeaponsInput(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.ships[i]!;
  if (!input.weapons) { s.fireHeld = false; return; }   // unattended: Fire lets go without firing or discarding
  if (input.laserLock !== null && input.laserLock >= 0 && input.laserLock <= 2) s.lock = input.laserLock;
  if (input.laserCharge !== null && state.missiles[i] === null) {
    if (input.laserCharge) s.fireHeld = true;
    else if (s.fireHeld) {
      s.fireHeld = false;
      if (laserFull(state, i)) fireLaser(state, i);
      else { s.laserCharge = 0; s.laserHold = 0; }
    }
  }
  if (input.missileLaunch && state.missiles[i] === null && s.magazine > 0 && s.rooms[Room.Weapons] < 2) {
    launchMissile(state, i);
    s.fireHeld = false;
  }
}

/** Advance ship i's laser charge and hold timer, shields and magazine by one tick (spec §5, §7). */
export function tickWeapons(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.ships[i]!;
  if (!laserFrozen(state, i, input)) {
    if (s.fireHeld && !laserFull(state, i)) s.laserCharge = Math.min(LASER_CHARGE_UNITS, s.laserCharge + LASER_CHARGE_RATE[s.rooms[Room.Weapons]]!);
    else if (laserFull(state, i) && ++s.laserHold >= LASER_HOLD_TICKS) { s.laserCharge = 0; s.laserHold = 0; }   // vents; recharges if still held
  }
  if (s.shields >= SHIELD_LAYERS) s.shieldClock = 0;
  else if ((s.shieldClock += SHIELD_RATE[s.rooms[Room.Shields]]!) >= SHIELD_RECHARGE_UNITS) { s.shields++; s.shieldClock = 0; }   // rate 0: held
  if (s.magazine >= MAGAZINE) s.magazineClock = 0;
  else if (++s.magazineClock >= MAGAZINE_REGEN_TICKS) { s.magazine++; s.magazineClock = 0; }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/tacticalWeapons.test.ts tests/tacticalMissiles.test.ts tests/boundary.test.ts`
Expected: PASS (11 weapons tests, 9 missile tests).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/tactical/missiles.ts src/renderer/src/sim/tactical/weapons.ts tests/tacticalWeapons.test.ts tests/tacticalMissiles.test.ts
git commit -m "feat(tactical): laser charge/release with arcs and room lock, shields, magazine and steerable cruise missiles (Helm H-0b)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 3: The hunter and the duel step

**Files:**
- Create: `src/renderer/src/sim/tactical/hunter.ts`
- Create: `src/renderer/src/sim/tactical/duel.ts`
- Test: `tests/tacticalHunter.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2; `flyShip` (`physics.ts`), `resolveContacts` (`contacts.ts`), `hashTactical`; `nextInt` (`src/shared/rng.ts`).
- Produces: `hunterThink(state): ShipInput` (updates `state.hunter`; the only `rng` draw is the release jitter); `stepDuel(state, crew: ShipInput, tuning?: FlightTuning): void`. Fixed order inside `stepDuel`: return at once if the duel has ended; reset `events`; the hunter thinks; weapon commands for ship 0 then 1; ships fly (axes only while `helm`); missiles fly (steering only while `weapons`); ship contacts; missile contacts; weapon clocks for ship 0 then 1; outcome from the hulls; advance the tick. H-0c's duel step and H-1's dev view call `stepDuel`.

- [ ] **Step 1: Write the failing test**

Create `tests/tacticalHunter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { hashTactical } from '../src/renderer/src/sim/tactical/hash';
import { hunterThink } from '../src/renderer/src/sim/tactical/hunter';
import { createTacticalState, HunterMode, Outcome, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { HUNTER_JITTER_TICKS, HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_WALK_TICKS, LASER_CHARGE_UNITS, REPAIR_WORK_TICKS, SHIP_HULL } from '../src/renderer/src/sim/tactical/tuning';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';

/** Enemy at (−300, −300) facing west at the crew 300 units away: in arc, in range, clear of the planet. */
function facing(): TacticalState {
  const st = createTacticalState(5);
  Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  return st;
}

describe('hunter: flying (spec §9 Hunt)', () => {
  it('steers toward the lead point and thrusts only when roughly aligned', () => {
    const st = facing();
    expect(hunterThink(st).axes).toEqual({ turn: 0, thrust: 1 });      // crew dead ahead
    st.ships[1].heading = 0;                                             // facing north: the crew is anticlockwise (west)
    expect(hunterThink(st).axes).toEqual({ turn: -1, thrust: 0 });
  });
  it('turns away and thrusts when its straight path will pass near the planet', () => {
    const st = facing();
    Object.assign(st.ships[1], { x: 0, y: -300, vx: 0, vy: 300, heading: 128 });   // diving at the planet
    const { axes } = hunterThink(st);
    expect(axes.thrust).toBe(1);
    expect(axes.turn).not.toBe(0);
  });
  it('closes on a crew that sits still', () => {
    const st = createTacticalState(5), d0 = Math.hypot(st.ships[1].x - st.ships[0].x, st.ships[1].y - st.ships[0].y);
    for (let t = 0; t < 1800; t++) stepDuel(st, IDLE_INPUT);
    expect(Math.hypot(st.ships[1].x - st.ships[0].x, st.ships[1].y - st.ships[0].y)).toBeLessThan(d0);
  });
});

describe('hunter: firing (spec §9 Firing)', () => {
  it('presses Fire first, then releases within 0 to 12 ticks of being full and in arc, drawing one jitter', () => {
    const st = facing(), me = st.ships[1];
    expect(hunterThink(st).laserCharge).toBe(true);
    me.fireHeld = true; me.laserCharge = LASER_CHARGE_UNITS;
    const rng = st.rng.s;
    let ticks = 0;
    for (; ticks <= HUNTER_JITTER_TICKS; ticks++) {
      if (hunterThink(st).laserCharge === false) break;
      st.tick++;
    }
    expect(ticks).toBeLessThanOrEqual(HUNTER_JITTER_TICKS);
    expect(st.rng.s).not.toBe(rng);
  });
  it('locks Shields until the crew Shields room is at level 2, then Weapons', () => {
    const st = facing();
    expect(hunterThink(st).laserLock).toBe(Room.Shields);
    st.ships[0].rooms[Room.Shields] = 2;
    expect(hunterThink(st).laserLock).toBe(Room.Weapons);
  });
  it('launches a missile within 400 units, then not again for 30 s', () => {
    const st = facing();
    expect(hunterThink(st).missileLaunch).toBe(true);
    st.tick += HUNTER_MISSILE_COOLDOWN_TICKS - 1;
    expect(hunterThink(st).missileLaunch).toBe(false);
    st.tick += 1;
    expect(hunterThink(st).missileLaunch).toBe(true);
  });
  it('steers its missile toward where the crew was 18 ticks ago', () => {
    const st = facing();
    st.missiles[1] = { x: -300, y: -300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 100 };   // pointing north
    st.hunter.trail.fill(-600);                                          // the crew was at (−600, −600): north-west
    expect(hunterThink(st).steer).toBe(-1);
  });
});

describe('hunter: repair (spec §9 Repair)', () => {
  it('walks 6 s and works 4 s on a level-2 room with that console empty, then lowers it one level', () => {
    const st = facing(), me = st.ships[1];
    me.rooms[Room.Engines] = 2;
    let input = hunterThink(st);
    expect(st.hunter.mode).toBe(HunterMode.Repair);
    expect([input.helm, input.weapons]).toEqual([false, true]);
    for (let t = 1; t < HUNTER_WALK_TICKS + REPAIR_WORK_TICKS; t++) { input = hunterThink(st); st.tick++; }
    expect(me.rooms[Room.Engines]).toBe(2);
    input = hunterThink(st);
    expect(me.rooms[Room.Engines]).toBe(1);
    expect(st.hunter.mode).toBe(HunterMode.Hunt);
  });
  it('repairs a level-1 room only while the crew is out of laser range; Weapons repair empties the Weapons console', () => {
    const st = facing(), me = st.ships[1];
    me.rooms[Room.Weapons] = 1;
    hunterThink(st);
    expect(st.hunter.mode).toBe(HunterMode.Hunt);
    st.ships[0].x = -900;
    const input = hunterThink(st);
    expect(st.hunter.mode).toBe(HunterMode.Repair);
    expect([input.helm, input.weapons, input.laserCharge, input.missileLaunch]).toEqual([true, false, null, false]);
  });
  it('picks the highest level first, ties Engines, then Weapons, then Shields', () => {
    const st = facing(), me = st.ships[1];
    st.ships[0].x = -900;
    me.rooms = [1, 1, 1];
    hunterThink(st);
    expect(st.hunter.room).toBe(Room.Engines);
    const st2 = facing();
    st2.ships[1].rooms = [1, 2, 1];
    hunterThink(st2);
    expect(st2.hunter.room).toBe(Room.Shields);
  });
});

describe('duel step (spec §4 to §9)', () => {
  it('is deterministic: the same seed and crew inputs give the same hash', () => {
    const run = (): string => { const st = createTacticalState(9); for (let t = 0; t < 3600; t++) stepDuel(st, IDLE_INPUT); return hashTactical(st); };
    expect(run()).toBe(run());
  });
  it('the hunter wears down a crew that only sits there, and the duel ends', () => {
    const st = createTacticalState(9);
    for (let t = 0; t < 60 * 600 && st.outcome === Outcome.Running; t++) stepDuel(st, IDLE_INPUT);
    expect(st.ships[0].hull).toBeLessThan(SHIP_HULL);
    expect(st.ships[1].shots + st.ships[1].missilesLaunched).toBeGreaterThan(0);
  });
  it('stops advancing once the duel has ended', () => {
    const st = facing();
    st.ships[0].hull = 0;
    stepDuel(st, IDLE_INPUT);
    expect(st.outcome).toBe(Outcome.EnemyWins);
    const tick = st.tick;
    stepDuel(st, IDLE_INPUT);
    expect(st.tick).toBe(tick);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tacticalHunter.test.ts`
Expected: FAIL, "Failed to resolve import ../src/renderer/src/sim/tactical/duel".

- [ ] **Step 3: Write the hunter**

Create `src/renderer/src/sim/tactical/hunter.ts`:

```ts
// The hunter (spec §9): a blunt, deterministic state machine that flies the enemy ship (ship 1) through the same
// ShipInput the crew uses. It reads the state as it stands at the start of the tick. Its only randomness is the
// release jitter, drawn from rng.tactical.
import { nextInt } from '../../../../shared/rng';
import { hx, hy } from './direction';
import { segmentNear, sideOf } from './geometry';
import { queryGrid } from './grid';
import { HunterMode, Room, type TacticalState } from './state';
import {
  HUNTER_AVOID_MARGIN, HUNTER_JITTER_TICKS, HUNTER_LEAD_S, HUNTER_LOOKAHEAD_S, HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_MISSILE_RANGE,
  HUNTER_THRUST_COS, HUNTER_TRAIL_TICKS, HUNTER_WALK_TICKS, LASER_RANGE, REPAIR_WORK_TICKS
} from './tuning';
import { laserEligible, laserFull, type ShipInput } from './weapons';

/** Repair priority (spec §9): highest level first, ties Engines, then Weapons, then Shields. */
const REPAIR_ORDER = [Room.Engines, Room.Weapons, Room.Shields] as const;

/** The first solid body the enemy's straight-line path over the lookahead comes within its radius + margin of, or null. */
function threatAhead(state: TacticalState): { x: number; y: number } | null {
  const s = state.ships[1], ex = s.x + s.vx * HUNTER_LOOKAHEAD_S, ey = s.y + s.vy * HUNTER_LOOKAHEAD_S, p = state.map.planet;
  if (segmentNear(s.x, s.y, ex, ey, p.x, p.y, p.r + HUNTER_AVOID_MARGIN)) return p;
  const half = Math.max(Math.abs(ex - s.x), Math.abs(ey - s.y)) / 2 + HUNTER_AVOID_MARGIN;
  for (const k of queryGrid(state.grid, (s.x + ex) / 2, (s.y + ey) / 2, half)) {
    const a = state.map.asteroids[k]!;
    if (segmentNear(s.x, s.y, ex, ey, a.x, a.y, a.r + HUNTER_AVOID_MARGIN)) return a;
  }
  return null;
}

function updateRepair(state: TacticalState): void {
  const h = state.hunter, me = state.ships[1], crew = state.ships[0];
  if (h.mode === HunterMode.Repair) {
    if (--h.timer > 0) return;
    if (!h.working) { h.working = true; h.timer = REPAIR_WORK_TICKS; return; }
    me.rooms[h.room as 0 | 1 | 2] = Math.max(0, me.rooms[h.room]! - 1);
    h.mode = HunterMode.Hunt;
    return;
  }
  const dx = crew.x - me.x, dy = crew.y - me.y, outOfRange = dx * dx + dy * dy > LASER_RANGE * LASER_RANGE;
  let best = -1;
  for (const room of REPAIR_ORDER) {
    const level = me.rooms[room];
    if ((level >= 2 || (level === 1 && outOfRange)) && (best < 0 || level > me.rooms[best]!)) best = room;
  }
  if (best >= 0) { h.mode = HunterMode.Repair; h.room = best; h.working = false; h.timer = HUNTER_WALK_TICKS; }
}

/** The enemy's input for this tick. Updates the hunter's own state (trail, repair timers, scheduled release). */
export function hunterThink(state: TacticalState): ShipInput {
  const h = state.hunter, me = state.ships[1], crew = state.ships[0];
  const oldX = h.trail[2 * h.trailHead]!, oldY = h.trail[2 * h.trailHead + 1]!;   // where the crew was HUNTER_TRAIL_TICKS ago
  h.trail[2 * h.trailHead] = crew.x; h.trail[2 * h.trailHead + 1] = crew.y; h.trailHead = (h.trailHead + 1) % HUNTER_TRAIL_TICKS;
  updateRepair(state);
  const repairing = h.mode === HunterMode.Repair;
  const helm = !(repairing && h.room === Room.Engines), weapons = !(repairing && h.room !== Room.Engines);
  const input: ShipInput = { helm, weapons, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false };

  if (helm) {
    const threat = threatAhead(state);
    if (threat) input.axes = { turn: -sideOf(me.heading, threat.x - me.x, threat.y - me.y) || 1, thrust: 1 };
    else {
      const dx = crew.x + crew.vx * HUNTER_LEAD_S - me.x, dy = crew.y + crew.vy * HUNTER_LEAD_S - me.y;
      const aligned = hx(me.heading) * dx + hy(me.heading) * dy >= HUNTER_THRUST_COS * Math.sqrt(dx * dx + dy * dy);
      input.axes = { turn: sideOf(me.heading, dx, dy), thrust: aligned ? 1 : 0 };
    }
  }
  if (!weapons) { h.fireAt = -1; return input; }

  input.laserLock = crew.rooms[Room.Shields] < 2 ? Room.Shields : Room.Weapons;
  const missile = state.missiles[1];
  if (missile) input.steer = sideOf(missile.heading, oldX - missile.x, oldY - missile.y);
  else {
    if (!me.fireHeld) { input.laserCharge = true; h.fireAt = -1; }   // press first; a release can only follow a held press
    else if (laserFull(state, 1) && laserEligible(state, 1, 0)) {
      if (h.fireAt < 0) h.fireAt = state.tick + nextInt(state.rng, HUNTER_JITTER_TICKS + 1);
      if (state.tick >= h.fireAt) { input.laserCharge = false; h.fireAt = -1; }
    } else h.fireAt = -1;
    const dx = crew.x - me.x, dy = crew.y - me.y;
    if (me.magazine > 0 && me.rooms[Room.Weapons] < 2 && dx * dx + dy * dy <= HUNTER_MISSILE_RANGE * HUNTER_MISSILE_RANGE
      && state.tick - h.lastLaunch >= HUNTER_MISSILE_COOLDOWN_TICKS) { input.missileLaunch = true; h.lastLaunch = state.tick; }
  }
  return input;
}
```

- [ ] **Step 4: Write the duel step**

Create `src/renderer/src/sim/tactical/duel.ts`:

```ts
// One headless duel tick (spec §4 to §9). H-0c wraps this in the duel step that also runs the Cutter interior and the
// authority's commands; here the crew's inputs arrive ready-made and the enemy's come from the hunter.
import { hunterThink } from './hunter';
import { flyMissile, resolveMissiles } from './missiles';
import { flyShip } from './physics';
import { resolveContacts } from './contacts';
import { NO_AXES, Outcome, type TacticalState } from './state';
import { DEFAULT_FLIGHT, type FlightTuning } from './tuning';
import { applyWeaponsInput, tickWeapons, type ShipInput } from './weapons';

/**
 * Order, fixed: think (the hunter reads the state as it stands), weapon commands (both ships, in order), ships fly,
 * missiles fly, ship contacts, missile contacts, weapon clocks, outcome, tick. Does nothing once the duel has ended.
 */
export function stepDuel(state: TacticalState, crew: ShipInput, tuning: FlightTuning = DEFAULT_FLIGHT): void {
  if (state.outcome !== Outcome.Running) return;
  state.events = [];
  const inputs: [ShipInput, ShipInput] = [crew, hunterThink(state)];
  for (let i = 0; i < 2; i++) applyWeaponsInput(state, i, inputs[i]!);
  state.ships.forEach((s, i) => flyShip(s, inputs[i]!.helm ? inputs[i]!.axes : NO_AXES, tuning));
  for (let i = 0; i < 2; i++) flyMissile(state, i, inputs[i]!.weapons ? inputs[i]!.steer : 0);
  resolveContacts(state);
  resolveMissiles(state);
  for (let i = 0; i < 2; i++) tickWeapons(state, i, inputs[i]!);
  const crewDown = state.ships[0].hull <= 0, enemyDown = state.ships[1].hull <= 0;
  state.outcome = crewDown && enemyDown ? Outcome.Draw : crewDown ? Outcome.EnemyWins : enemyDown ? Outcome.CrewWins : Outcome.Running;
  state.tick++;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/tacticalHunter.test.ts tests/boundary.test.ts`
Expected: PASS (13 hunter and duel tests; the 10-minute passive-crew test takes about 1 s).

- [ ] **Step 6: Run the full suite and the typecheck**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm test`
Expected: every file passes, about 1,625 tests (see the known flakes in Global Constraints).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/tactical/duel.ts tests/tacticalHunter.test.ts
git commit -m "feat(tactical): the hunter state machine and the headless duel step (Helm H-0b)"
```

(End the message with your session's Co-Authored-By trailer.)

---

## After H-0b

- **H-0c plan:** the Cutter interior link (§8), presence and lifecycle controls, `sim/duel/step.ts` with the §13 phase list and command allowlist mapping commands to `ShipInput`, the authority mode switch, telemetry with the scripted crew pair against the §16 gates (and the tuning they will need: the baseline above ends duels in about a minute against a passive crew), the golden replay, the `SIM_VERSION` bump and version-only sector re-bless, plus the H-0a final-review notes listed in Scope.
- **H-1** can show combat as soon as this merges: `stepDuel` with keyboard-built `ShipInput`s and the per-tick `events`.
