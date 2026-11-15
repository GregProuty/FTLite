# Helm Demo H-0c-i: The Duel Step and the Walkable Interior (headless) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Join the Cutter interior to the tactical duel: a headless duel tick in which two players sit at the Navigation and Weapons consoles, stand up, walk the FTL-style interior, repair damaged rooms at their repair points, go present or away, and fly and fight through the tactical sim. It also lands the H-0b final review's tactical follow-ups and the hunter's new standoff.

**Architecture:** A new `src/renderer/src/sim/duel/` module owns `DuelState = { interior: SimState, tactical: TacticalState, present, repair, points, nav, weapons }`. `stepDuelTick` runs spec §13's phase list without ever calling the sector step: today's `applyInteractionCommands` validates `sit` and today's `applyConsoleCommand` handles `stand`. A duel-only repair phase works on the tactical room levels, then `movementSystem` runs, then the tactical `stepDuel`. Duel commands use a local `DuelEnvelope` for now. **Nothing in this plan touches `net/contracts.ts` or `authority/`**, which Codex's Net-3 branch is changing. H-0c-ii moves the commands into the shared union, adds lifecycle presence and the authority mode, and does the scripted pair, the §16 gates, the golden replay and the `SIM_VERSION` bump, after Net-3 merges.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Vitest 3.2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-helm-demo-design.md` §8 (interior, present or away, repair points, repair), §9 (hunter, including the **Standoff** bullet added in `876de31`), §13 (the duel phase list and command allowlist). H-0a and H-0b are merged (`8159abe`, `75c56c9`).

## Scope

- **Task 1:** the H-0b final review's tactical follow-ups, which H-0c needs:
  - laser and missile events carry what §13's telemetry needs (stripped or room; target and room);
  - `missileHits` no longer counts self-hits;
  - `canCharge`, `canLaunch` and `validLock` admission predicates, so the duel step's reject reasons cannot drift from what the sim accepts;
  - a whole-number lock check;
  - `cloneTactical`;
  - a key guard for `Missile`;
  - the hunter's standoff band (spec §9).
- **Task 2:** the `sim/duel/` module and its tests.
- **Not here (H-0c-ii, after Net-3):** the shared command union and the Net-1 amendment; lifecycle presence controls; the authority mode switch and `sim/duel` wiring into `authority/core.ts`; the scripted crew pair; §13 telemetry and the §16 gates (with tuning); the golden replay; the `SIM_VERSION` bump. Interior deep copy and snapshot encoding also land there, with the authority's snapshot work.

Nothing in the sector run imports `sim/duel/` or changes behaviour, so no `SIM_VERSION` bump is needed yet. The sector code the duel calls (`createSimState`, `applyInteractionCommands`, `applyConsoleCommand`, `sitDown`, `movementSystem`, `roomAt`, `inReachOfTile`) is used unchanged.

## Global Constraints

- Determinism guard (`tests/boundary.test.ts`, `tests/helpers/determinismGuard.ts`) scans every file under `src/renderer/src/sim/**`, including the new `sim/duel/`. Allowed `Math` methods: `abs`, `ceil`, `floor`, `round`, `min`, `max`, `sign`, `imul`, `sqrt`. No `sin`, `cos`, `atan2`, `hypot`, `pow`, `random`, no `**`, no `Date` or `performance`. Tests may use `Math.hypot`.
- Files under `sim/` may not import from `authority`, `clientControl` or `headless`. `sim/duel/` imports types only from `net/contracts.ts` and must not modify it.
- Tick rate 60, `DT` 1/60. The duel's interior tick and tactical tick advance together, once per `stepDuelTick`.
- Ship 0 is the crew's (players 0 and 1 aboard the Cutter), ship 1 the enemy's (the hunter).
- `tests/tacticalDeterminism.test.ts`'s flatten key guard must keep passing; Task 1 extends it to `Missile`.
- Commit with explicit paths only (`git add <paths>`), never `git add -A`: the owner keeps unrelated uncommitted files in this checkout. End every commit message with the Co-Authored-By trailer your own session instructs.
- Run single test files with `npx vitest run <file>`. The full suite is `npm test` (about 1,810 tests after this plan); typecheck is `npm run typecheck`.
- Known flakes: `tests/authorityBoundary.test.ts` and `tests/run.test.ts` can time out under full-suite load. If one fails in `npm test`, rerun it alone; it is unrelated to this plan.

## Decisions the plan makes inside the spec

1. **Duel commands are local for now** (`sim/duel/commands.ts`: `sit`, `stand`, `presence`, `laserLock`, `laserCharge`, `missileLaunch`), with reasons `not-in-duel`, `not-at-weapons` and `missile-in-flight` alongside today's. `sit` and `stand` are re-wrapped as today's `CommandEnvelope` (run id `'duel'`) so today's handlers apply unchanged. This means the stand handler is not extracted from `consoleSystem`, as §13 step 2 suggested: `applyConsoleCommand` is already exported and is exactly that handler.
2. **Seat-phase order:** all sits, as one `applyInteractionCommands` batch, then stands in envelope order, then presence. A sit at any console other than Navigation or Weapons is rejected `not-in-duel` before validation.
3. **Tactical commands** are checked after the seat phase:
   - stale tick → `stale-tick`;
   - not from the present player seated at Weapons → `not-at-weapons`;
   - `laserLock` that is not a whole Room index → `malformed`;
   - `laserCharge` while a missile flies → `missile-in-flight`;
   - `missileLaunch` that `canLaunch` refuses → `unavailable`.

   Several accepted commands of one kind in a tick: the last one wins. **Across kinds, they take effect in a fixed order (lock, then charge, then launch) whatever their envelope order**, because `applyWeaponsInput` applies them in that order; admission is checked in the same order, so every result matches what happens. This is a deliberate exception to "commands apply in envelope order": a launch and a release sent in the same tick both apply, the release firing first.
4. **Held axes:** the Helm's turn is `moveX`, and thrust is `−moveY`, because W gives `moveY −1` (up the screen) and means forward. The gunner's missile steering is `moveX`.
5. **Repair** uses whole units, like the other clocks: 960 units per level. One repairer adds 4 per tick (240 ticks = 4 s); two or more on the same point each add 5, which is today's `TEAM_MULT` 1.25 × 4, so two finish in 96 ticks. A repairer counts only if:
   - present, conscious, standing and holding Interact;
   - inside the repair point's room (`roomAt`);
   - within `REACH` of its tile (`inReachOfTile`).

   The three repair points are in three different rooms, so at most one qualifies per player. Progress persists through hits; a room back at level 0 clears it.
6. **Doors** are set to `HeldOpen` at creation and `doorSystem` is never run. That system's fail-safe would close held doors only if the Doors station went offline, and nothing in the duel takes it offline.
7. **The interior systems that run** are only: the scratch reset (the same fields the sector step resets), sit and stand, presence, repair and `movementSystem`. Fires, oxygen, breaches, boarders, power, medbay, events, the director, XP and `crewSystem` never run. So the interior's own hull and `ended` are never touched, and crew never take damage.
8. **The duel hash** is the tactical flatten plus the interior fields the duel can change: tick, presence, repair progress, crew positions and seats, console occupants, door states. The sector flatten covers far more than the duel touches and is not used.
9. **The hunter's standoff** (spec §9): beyond 320 units it pursues the lead point as before. Within 320 it turns to keep the crew's current position dead ahead, never thrusts forward, and thrusts in reverse when the closing speed along the line exceeds 40 u/s. Lookahead avoidance still overrides. In the prototype, against a crew that never moves (seeds 1 to 10), rams fell from 10 to 20 per duel to 0 to 2. The duel now lasts 71 to 100 s, and the hunter ends on 20 to 28 hull.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/tactical/tuning.ts` | **Replace:** adds `HUNTER_STANDOFF`, `HUNTER_BRAKE_SPEED` |
| `src/renderer/src/sim/tactical/state.ts` | **Replace:** event fields; `cloneTactical` |
| `src/renderer/src/sim/tactical/weapons.ts` | **Replace:** `canCharge`, `canLaunch`, `validLock`; richer laser event |
| `src/renderer/src/sim/tactical/missiles.ts` | **Replace:** missileEnd target and room; no self-hit count |
| `src/renderer/src/sim/tactical/hunter.ts` | **Replace:** standoff |
| `src/renderer/src/sim/duel/tuning.ts` | **Create:** repair units and rates; the Cutter's repair points |
| `src/renderer/src/sim/duel/commands.ts` | **Create:** `DuelCommand`, `DuelEnvelope`, `DuelReason`, `DuelResult` |
| `src/renderer/src/sim/duel/state.ts` | **Create:** `DuelState`, `createDuel` |
| `src/renderer/src/sim/duel/step.ts` | **Create:** `stepDuelTick` |
| `src/renderer/src/sim/duel/hash.ts` | **Create:** `flattenDuel`, `hashDuel` |

---

### Task 1: Tactical follow-ups and the hunter's standoff

**Files:**
- Replace: `src/renderer/src/sim/tactical/tuning.ts`, `state.ts`, `weapons.ts`, `missiles.ts`, `hunter.ts`
- Replace: `tests/tacticalWeapons.test.ts`, `tests/tacticalMissiles.test.ts`, `tests/tacticalHunter.test.ts`, `tests/tacticalDeterminism.test.ts`

**Interfaces:**
- Consumes: H-0a/H-0b tactical modules as merged.
- Produces:
  - `DuelEvent` laser gains `stripped: boolean; room: number`; missileEnd gains `target: number; room: number`.
  - `cloneTactical(s: TacticalState): TacticalState`.
  - `canCharge(state, i): boolean`, `canLaunch(state, i): boolean`, `validLock(room: number): boolean` (in `weapons.ts`).
  - `HUNTER_STANDOFF = 320`, `HUNTER_BRAKE_SPEED = 40`.
  - `missileHits` counts only hits on the other ship.

Each file is given whole below. The source files are the H-0b versions with these changes only: the event fields, the self-hit rule, the three predicates (and `applyWeaponsInput` using them), `cloneTactical`, and the standoff branch in `hunterThink`. The test files are the H-0b versions plus:
- the updated event expectations;
- an admission test;
- self-hit assertions;
- the hunter pursuit tests moved outside the standoff;
- standoff and ram tests;
- a `cloneTactical` test;
- a `Missile` key guard.

- [ ] **Step 1: Replace the four test files (they must fail now)**

Replace the whole of `tests/tacticalWeapons.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { createTacticalState, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { applyWeaponsInput, canCharge, canLaunch, IDLE_INPUT, laserEligible, tickWeapons, validLock, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { inArc, lineOfSight } from '../src/renderer/src/sim/tactical/geometry';
import { LASER_ARC_COS, LASER_CHARGE_UNITS, LASER_HOLD_TICKS, LASER_RANGE, MAGAZINE, MAGAZINE_REGEN_TICKS, SHIELD_RATE, SHIELD_RECHARGE_UNITS, SHIP_HULL } from '../src/renderer/src/sim/tactical/tuning';

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
    expect(st.events).toContainEqual({ kind: 'laser', ship: 0, hit: true, stripped: true, room: -1, x1: -600, y1: -300, x2: -300, y2: -300 });
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
    expect(st.events.at(-1)).toMatchObject({ kind: 'laser', hit: true, stripped: false, room: Room.Engines });
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
  });
  it('a release in range and arc misses when the planet or an asteroid blocks the line of sight', () => {
    const blockers: [string, (st: TacticalState) => [number, number]][] = [
      ['planet', () => [0, 0]],
      ['asteroid', (st) => { const a = st.map.asteroids[0]!; return [a.x, a.y]; }]
    ];
    for (const [name, centre] of blockers) {
      const st = duel(), [a, b] = st.ships, [cx, cy] = centre(st);
      Object.assign(a, { x: cx - 200, y: cy, heading: 64 });           // 400 apart along the x axis, blocker in the middle
      Object.assign(b, { x: cx + 200, y: cy });
      expect(lineOfSight(st, a.x, a.y, b.x, b.y), name).toBe(false);
      expect(inArc(a.heading, b.x - a.x, b.y - a.y, LASER_ARC_COS), name).toBe(true);
      expect(Math.hypot(b.x - a.x, b.y - a.y), name).toBeLessThanOrEqual(LASER_RANGE);
      hold(st, 240);
      tick(st, input({ laserCharge: false }));
      expect([a.shots, a.laserHits], name).toEqual([1, 0]);
      expect([b.shields, b.hull], name).toEqual([2, SHIP_HULL]);
      expect(st.events.at(-1), name).toMatchObject({ kind: 'laser', ship: 0, hit: false });
    }
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

describe('weapon admission (used by the duel step for reject reasons)', () => {
  it('canCharge, canLaunch and validLock agree with what applyWeaponsInput accepts', () => {
    const st = duel(), s = st.ships[0];
    expect([canCharge(st, 0), canLaunch(st, 0)]).toEqual([true, true]);
    s.rooms[Room.Weapons] = 2;
    expect(canLaunch(st, 0)).toBe(false);
    s.rooms[Room.Weapons] = 0; s.magazine = 0;
    expect(canLaunch(st, 0)).toBe(false);
    s.magazine = 1;
    applyWeaponsInput(st, 0, input({ missileLaunch: true }));
    expect([canCharge(st, 0), canLaunch(st, 0)]).toEqual([false, false]);
    expect([validLock(0), validLock(2), validLock(1.5), validLock(-1), validLock(3)]).toEqual([true, true, false, false, false]);
    applyWeaponsInput(st, 0, input({ laserLock: 1.5 }));
    expect(s.lock).toBe(Room.Shields);                                  // a non-integer lock is ignored
  });
});

describe('shields (spec §5)', () => {
  it('recharge one layer per 5 s, and 7.5 s at Shields level 1', () => {
    const st = duel(), b = st.ships[1];
    b.shields = 0;
    for (let t = 0; t < 300; t++) tick(st, input());
    expect(b.shields).toBe(1);
    b.rooms[Room.Shields] = 1;
    for (let t = 0; t < 449; t++) tick(st, input());
    expect(b.shields).toBe(1);
    tick(st, input());
    expect(b.shields).toBe(2);
  });
  it('Shields level 2 holds a part-charged clock exactly, and repair to level 1 resumes it to the exact tick', () => {
    const st = duel(), b = st.ships[1];
    b.shields = 1; b.shieldClock = 0;
    for (let t = 0; t < 150; t++) tick(st, input());
    expect(b.shieldClock).toBe(150 * SHIELD_RATE[0]!);                  // 450 of 900
    b.rooms[Room.Shields] = 2;
    for (let t = 0; t < 600; t++) {
      tick(st, input());
      expect(b.shieldClock).toBe(450);
    }
    expect(b.shields).toBe(1);
    b.rooms[Room.Shields] = 1;                                           // repaired one level: resumes at 2 units per tick
    const ticksLeft = (SHIELD_RECHARGE_UNITS - 450) / SHIELD_RATE[1]!;   // 225
    for (let t = 0; t < ticksLeft - 1; t++) tick(st, input());
    expect([b.shields, b.shieldClock]).toEqual([1, SHIELD_RECHARGE_UNITS - SHIELD_RATE[1]!]);
    tick(st, input());
    expect([b.shields, b.shieldClock]).toEqual([2, 0]);
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

Replace the whole of `tests/tacticalMissiles.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { flyMissile, resolveMissiles } from '../src/renderer/src/sim/tactical/missiles';
import { createTacticalState, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { applyWeaponsInput, IDLE_INPUT, tickWeapons, type ShipInput } from '../src/renderer/src/sim/tactical/weapons';
import { DT, LASER_CHARGE_UNITS, LASER_HOLD_TICKS, MAGAZINE, MISSILE_LIFE_TICKS, MISSILE_THRUST, MISSILE_TURN_STEPS_PER_TICK, R_MAP, SHIP_HULL } from '../src/renderer/src/sim/tactical/tuning';

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
  it('turns at 120°/s under the gunner', () => {
    const st = duel();
    Object.assign(st.ships[0], { x: -600, y: -300, heading: 0 });       // aim north, away from everything
    tick(st, input({ missileLaunch: true }));
    for (let t = 1; t < 60; t++) tick(st, input(), 1);
    expect(st.missiles[0]!.heading).toBe(Math.floor(MISSILE_TURN_STEPS_PER_TICK * 59));
  });
  it('thrusts on its first 360 ticks and coasts after', () => {
    const st = duel();
    applyWeaponsInput(st, 0, input({ missileLaunch: true }));
    const m = st.missiles[0]!;
    Object.assign(m, { x: -600, y: -300, vx: 0, vy: 0, heading: 64, age: 359 });
    flyMissile(st, 0, 0);
    expect(m.age).toBe(360);
    expect(m.vx).toBeGreaterThan(MISSILE_THRUST * DT);                  // thrust east plus a little gravity
    const vx = m.vx;
    flyMissile(st, 0, 0);
    expect(m.vx - vx).toBeLessThan(0.2);                                 // tick 361: gravity only
  });
  it('self-destructs at the end of its 480th tick, after that tick\'s move and contacts, unfreezing the laser that tick', () => {
    const st = duel(), s = st.ships[0];
    tick(st, input({ missileLaunch: true }));
    const m = st.missiles[0]!;
    Object.assign(m, { x: -300, y: 600, vx: 60, vy: 0, age: MISSILE_LIFE_TICKS - 2 });   // open space, coasting east
    s.laserCharge = LASER_CHARGE_UNITS; s.laserHold = 50;                 // a full charge, frozen while the missile flies
    tick(st, input());
    expect(m.age).toBe(MISSILE_LIFE_TICKS - 1);
    expect(st.missiles[0]).not.toBeNull();
    expect(s.laserHold).toBe(50);                                          // tick 479: still frozen
    const x479 = m.x;
    tick(st, input());
    expect(m.age).toBe(MISSILE_LIFE_TICKS);
    expect(st.missiles[0]).toBeNull();
    const ended = st.events.at(-1)!;
    expect(ended).toMatchObject({ kind: 'missileEnd', ship: 0, cause: 'expired' });
    expect(ended.kind === 'missileEnd' && ended.x).toBeGreaterThan(x479 + 0.9);   // tick 480 still moved it (about 1 unit east)
    expect(s.missilesLost).toBe(1);
    expect(s.laserHold).toBe(51);                                          // unfrozen on tick 480 itself
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
    expect(st.events).toContainEqual(expect.objectContaining({ kind: 'missileEnd', ship: 0, cause: 'ship', target: 1, room: Room.Weapons }));
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
    expect(s.missileHits).toBe(0);                                      // a self-hit is not a hit
    expect(st.events.at(-1)).toMatchObject({ kind: 'missileEnd', cause: 'ship', target: 0 });
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
  it('a frozen full charge keeps its hold timer, then vents after the rest of the 3 s with no press, and does not recharge', () => {
    const st = duel(), s = st.ships[0];
    tick(st, input({ laserCharge: true }));
    for (let t = 1; t < 240 + 100; t++) tick(st, input());
    expect([s.laserCharge, s.laserHold]).toEqual([LASER_CHARGE_UNITS, 100]);
    tick(st, input({ missileLaunch: true }));                          // the launch freezes before the clocks run
    for (let t = 0; t < 50; t++) tick(st, input());
    expect([s.laserCharge, s.laserHold, s.fireHeld]).toEqual([LASER_CHARGE_UNITS, 100, false]);
    Object.assign(st.missiles[0]!, { x: 0, y: -60 });                  // into the planet
    tick(st, input());                                                  // ends; the hold timer resumes this tick
    expect(st.missiles[0]).toBeNull();
    expect(s.laserHold).toBe(101);
    for (let t = 0; t < LASER_HOLD_TICKS - 102; t++) tick(st, input());
    expect([s.laserCharge, s.laserHold]).toEqual([LASER_CHARGE_UNITS, LASER_HOLD_TICKS - 1]);
    tick(st, input());
    expect([s.laserCharge, s.laserHold]).toEqual([0, 0]);              // vented
    for (let t = 0; t < 60; t++) tick(st, input());
    expect(s.laserCharge).toBe(0);                                      // Fire is not held: no recharge
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

Replace the whole of `tests/tacticalHunter.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { nextInt } from '../src/shared/rng';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { hashTactical } from '../src/renderer/src/sim/tactical/hash';
import { hunterThink, pursuitTurn } from '../src/renderer/src/sim/tactical/hunter';
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
    st.ships[1].x = -100;                                                // 500 away: outside the standoff, so it pursues
    expect(hunterThink(st).axes).toEqual({ turn: 0, thrust: 1 });      // crew dead ahead
    st.ships[1].heading = 0;                                             // facing north: the crew is anticlockwise (west)
    expect(hunterThink(st).axes).toEqual({ turn: -1, thrust: 0 });
  });
  it('turns clockwise toward a target dead astern instead of not turning, for the ship and for its missile', () => {
    const st = facing();
    Object.assign(st.ships[1], { heading: 192 });
    Object.assign(st.ships[0], { x: 0, y: -300 });                       // dead astern of an enemy facing west, 300 away
    expect(hunterThink(st).axes).toEqual({ turn: 1, thrust: 0 });
    expect(pursuitTurn(0, 0, -10)).toBe(0);                               // dead ahead: no turn
    st.missiles[1] = { x: -300, y: -300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 100 };   // pointing north
    st.hunter.trail.fill(0);
    for (let k = 0; k < st.hunter.trail.length; k += 2) { st.hunter.trail[k] = -300; st.hunter.trail[k + 1] = 0; }   // the crew was due south
    expect(hunterThink(st).steer).toBe(1);
  });
  it('leads a moving crew by 0.5 s: a target straight ahead but moving south pulls the turn anticlockwise', () => {
    const st = facing();
    st.ships[1].x = -100;                                                // outside the standoff
    st.ships[0].vy = 600;                                                // lead point (−600, 0): south-west of the enemy facing west
    expect(hunterThink(st).axes.turn).toBe(-1);
    st.ships[0].vy = -600;                                               // lead point north-west: clockwise
    expect(hunterThink(st).axes.turn).toBe(1);
  });
  it('steers its missile at exactly where the crew was 18 calls ago, across several trail wraps', () => {
    const st = facing();
    st.missiles[1] = { x: -300, y: -300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 100 };   // pointing north
    const steers: number[] = [];
    for (let k = 0; k < 72; k++) {
      st.ships[0].x = Math.floor(k / 18) % 2 === 0 ? -200 : -400;     // 18 calls east of the missile, 18 west, and so on
      steers.push(hunterThink(st).steer);
      st.tick++;
    }
    expect(steers.slice(18, 36)).toEqual(new Array(18).fill(1));       // reads calls 0..17: east
    expect(steers.slice(36, 54)).toEqual(new Array(18).fill(-1));      // reads calls 18..35: west
    expect(steers.slice(54, 72)).toEqual(new Array(18).fill(1));
  });
  it('draws exactly one jitter per scheduled release, none while it waits, and redraws after a cancel', () => {
    const st = facing(), me = st.ships[1];
    me.fireHeld = true; me.laserCharge = LASER_CHARGE_UNITS;
    let seed = 1;
    while (nextInt({ s: seed }, HUNTER_JITTER_TICKS + 1) < 3) seed++;   // a seed whose first jitter is at least 3 ticks
    st.rng.s = seed;
    const expected = { s: seed }, j = nextInt(expected, HUNTER_JITTER_TICKS + 1);
    expect(hunterThink(st).laserCharge).toBe(null);                      // scheduled, not yet released
    expect(st.rng.s).toBe(expected.s);                                    // exactly one draw
    expect(st.hunter.fireAt).toBe(st.tick + j);
    st.tick++;
    expect(hunterThink(st).laserCharge).toBe(null);
    expect(st.rng.s).toBe(expected.s);                                    // waiting draws nothing
    st.ships[0].x = 0;                                                    // the crew leaves the arc (behind the enemy): cancel
    hunterThink(st);
    expect(st.hunter.fireAt).toBe(-1);
    expect(st.rng.s).toBe(expected.s);
    st.ships[0].x = -600;                                                 // back in arc: a fresh draw
    hunterThink(st);
    nextInt(expected, HUNTER_JITTER_TICKS + 1);
    expect(st.rng.s).toBe(expected.s);
    for (let t = 0; t <= HUNTER_JITTER_TICKS && st.hunter.fireAt >= 0; t++) {
      if (st.tick >= st.hunter.fireAt) { expect(hunterThink(st).laserCharge).toBe(false); break; }
      expect(hunterThink(st).laserCharge).toBe(null);
      st.tick++;
    }
    expect(st.rng.s).toBe(expected.s);
  });
  it('inside the standoff: noses on the crew\'s current position, never thrusts forward, and brakes when closing fast', () => {
    const st = facing(), me = st.ships[1];                               // 300 apart, inside 320
    expect(hunterThink(st).axes).toEqual({ turn: 0, thrust: 0 });
    st.ships[0].vy = 600;                                                // a moving crew: no lead inside the standoff
    expect(hunterThink(st).axes.turn).toBe(0);
    me.vx = -50;                                                         // closing at 50 u/s toward the crew (west)
    expect(hunterThink(st).axes).toEqual({ turn: 0, thrust: -1 });
    me.vx = -30;                                                         // closing slower than 40: coast
    expect(hunterThink(st).axes.thrust).toBe(0);
  });
  it('rams far less against a crew that sits still than pure pursuit did', () => {
    let rams = 0;
    for (const seed of [1, 2, 3, 4]) {
      const st = createTacticalState(seed);
      for (let t = 0; t < 60 * 120 && st.outcome === Outcome.Running; t++) stepDuel(st, IDLE_INPUT);
      rams += st.ships[0].shipHits;
    }
    expect(rams).toBeLessThan(8);                                        // pure pursuit: 10 to 20 per duel
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
  it('launches a missile within 400 units, then not again for 30 s after a launch', () => {
    const st = facing();
    stepDuel(st, IDLE_INPUT);
    expect(st.missiles[1]).not.toBeNull();
    expect(st.hunter.lastLaunch).toBe(0);
    st.missiles[1] = null;
    st.tick = HUNTER_MISSILE_COOLDOWN_TICKS - 1;
    expect(hunterThink(st).missileLaunch).toBe(false);
    st.tick = HUNTER_MISSILE_COOLDOWN_TICKS;
    expect(hunterThink(st).missileLaunch).toBe(true);
  });
  it('a launch refused on the tick (the crew knocks its Weapons room to level 2 first) costs no cooldown', () => {
    const st = facing(), [crew, me] = st.ships;
    me.rooms[Room.Weapons] = 1; me.shields = 0;
    crew.lock = Room.Weapons; crew.fireHeld = true; crew.laserCharge = LASER_CHARGE_UNITS;
    const before = st.hunter.lastLaunch;
    stepDuel(st, { ...IDLE_INPUT, laserCharge: false });
    expect(me.rooms[Room.Weapons]).toBe(2);
    expect(st.missiles[1]).toBeNull();
    expect(st.hunter.lastLaunch).toBe(before);
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

Replace the whole of `tests/tacticalDeterminism.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { launchMissile } from '../src/renderer/src/sim/tactical/missiles';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { cloneTactical, createTacticalState, type Axes, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepFlight } from '../src/renderer/src/sim/tactical/physics';
import { flattenTactical, hashTactical, MISSILE_SLOT } from '../src/renderer/src/sim/tactical/hash';
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

describe('predictPath stride (Helm H-0a final review)', () => {
  const axes: Axes = { turn: 0, thrust: 0 };
  it('every: 10 over 100 free ticks gives 10 points matching the real ship', () => {
    const st = createTacticalState(11), path = predictPath(st, 0, axes, 100, 10);
    expect(path.length).toBe(10);
    const real = createTacticalState(11);
    for (let k = 0; k < 10; k++) {
      for (let t = 0; t < 10; t++) stepFlight(real, [axes, axes]);
      expect(path[k]).toEqual({ x: real.ships[0].x, y: real.ships[0].y });
    }
  });
  it('every: 0 behaves like every: 1', () => {
    const st = createTacticalState(11);
    expect(predictPath(st, 0, axes, 30, 0)).toEqual(predictPath(st, 0, axes, 30, 1));
    expect(predictPath(st, 0, axes, 30, 1).length).toBe(30);
  });
});

describe('cloneTactical', () => {
  it('copies everything that moves: equal hash, independent state, and identical futures', () => {
    const st = createTacticalState(13);
    for (let t = 0; t < 900; t++) stepDuel(st, IDLE_INPUT);
    const copy = cloneTactical(st);
    expect(hashTactical(copy)).toBe(hashTactical(st));
    for (let t = 0; t < 900; t++) { stepDuel(st, IDLE_INPUT); stepDuel(copy, IDLE_INPUT); }
    expect(hashTactical(copy)).toBe(hashTactical(st));
    const before = hashTactical(st);
    copy.ships[0].rooms[0] = 2; copy.ships[0].graceUntil[0] = 99; copy.hunter.trail[0] = 1; copy.rng.s = 7;
    expect(hashTactical(st)).toBe(before);
  });
});

describe('flatten key guard', () => {
  // When this fails, add the new field to flattenTactical (hash.ts) and then update the lists below.
  it('Ship and TacticalState fields are exactly those flattenTactical knows', () => {
    const st = createTacticalState(1);
    expect(Object.keys(st.ships[0]).sort()).toEqual(['asteroidHits', 'fireHeld', 'graceUntil', 'heading', 'headingAcc', 'hull', 'laserCharge', 'laserHits', 'laserHold', 'layersStripped', 'lock', 'magazine', 'magazineClock', 'missileHits', 'missilesLaunched', 'missilesLost', 'planetHits', 'released', 'rooms', 'shieldClock', 'shields', 'shipHits', 'shots', 'skidBudget', 'skidSign', 'vx', 'vy', 'x', 'y']);
    expect(Object.keys(st).sort()).toEqual(['events', 'grid', 'hunter', 'map', 'missiles', 'outcome', 'rng', 'seed', 'ships', 'tick']);
    expect(Object.keys(st.hunter).sort()).toEqual(['fireAt', 'lastLaunch', 'mode', 'room', 'timer', 'trail', 'trailHead', 'working']);
    const launched = createTacticalState(1);
    launchMissile(launched, 0);                                          // a missile as the launcher makes it
    expect(Object.keys(launched.missiles[0]!).sort()).toEqual(['age', 'heading', 'headingAcc', 'vx', 'vy', 'x', 'y']);   // MISSILE_SLOT covers these
    // 5 header values; per ship 30 scalars + one per graceUntil slot; 2 missile slots of MISSILE_SLOT; hunter 7 scalars + its trail.
    expect(flattenTactical(st).length).toBe(5 + 2 * (30 + st.map.asteroids.length + 2) + 2 * MISSILE_SLOT + 7 + st.hunter.trail.length);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/tacticalWeapons.test.ts tests/tacticalMissiles.test.ts tests/tacticalHunter.test.ts tests/tacticalDeterminism.test.ts`
Expected: FAIL. `canCharge`, `canLaunch`, `validLock` and `cloneTactical` are not exported, the event objects lack the new fields, and the standoff tests see pursuit.

- [ ] **Step 3: Replace the five source files**

Replace the whole of `src/renderer/src/sim/tactical/tuning.ts` with:

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
export const HUNTER_STANDOFF = 320;           // within this it stops pursuing and holds its nose on the crew
export const HUNTER_BRAKE_SPEED = 40;         // and brakes (reverse thrust) when closing faster than this
```

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
  /** A laser release. `stripped`: it took a shield layer; `room`: the Room it damaged, or −1 (a miss or a stripped layer). */
  | { kind: 'laser'; ship: number; hit: boolean; stripped: boolean; room: number; x1: number; y1: number; x2: number; y2: number }
  /** A missile ended. `target`: the ship it landed on (its own ship for a self-hit), or −1; `room`: the Room it struck, or −1. */
  | { kind: 'missileEnd'; ship: number; cause: 'ship' | 'planet' | 'asteroid' | 'edge' | 'expired' | 'missile'; target: number; room: number; x: number; y: number };

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

/** Deep copy of the whole tactical state for snapshots, rollback and replay checks. The map and broad-phase grid are
 *  immutable after creation and are shared. Any new nested state must be copied here; the clone test guards it. */
export function cloneTactical(s: TacticalState): TacticalState {
  const h = s.hunter;
  return {
    ...s, rng: { s: s.rng.s },
    ships: [cloneShip(s.ships[0]), cloneShip(s.ships[1])],
    missiles: [s.missiles[0] ? { ...s.missiles[0] } : null, s.missiles[1] ? { ...s.missiles[1] } : null],
    hunter: { ...h, trail: new Float64Array(h.trail) },
    events: s.events.map((e) => ({ ...e }))
  };
}

/** Deep copy of a ship. Any new nested Ship state (arrays, typed arrays) must be copied here. */
export function cloneShip(s: Ship): Ship {
  return { ...s, rooms: [...s.rooms], graceUntil: new Int32Array(s.graceUntil) };
}
```

Replace the whole of `src/renderer/src/sim/tactical/weapons.ts` with:

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

/** Admission (spec §7 table; H-0c's duel step uses these to give reject reasons): laserCharge is accepted only with no missile in flight. */
export function canCharge(state: TacticalState, i: number): boolean { return state.missiles[i] === null; }
/** missileLaunch is accepted only with no missile in flight, a missile in the magazine and Weapons below level 2. */
export function canLaunch(state: TacticalState, i: number): boolean {
  const s = state.ships[i]!;
  return state.missiles[i] === null && s.magazine > 0 && s.rooms[Room.Weapons] < 2;
}
/** A lock target must be a Room index. */
export function validLock(room: number): boolean { return Number.isInteger(room) && room >= 0 && room <= 2; }

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
  let stripped = false, room = -1;
  a.shots++;
  if (hit) {
    a.laserHits++;
    if (b.shields > 0) { b.shields--; b.shieldClock = 0; a.layersStripped++; stripped = true; }
    else {
      room = a.lock;
      if (b.rooms[a.lock]! < 2) b.rooms[a.lock as 0 | 1 | 2]++;
      b.hull = Math.max(0, b.hull - LASER_HULL);
    }
  }
  state.events.push({ kind: 'laser', ship: i, hit, stripped, room, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  a.laserCharge = 0; a.laserHold = 0;
}

/** Apply ship i's weapon commands for this tick, before anything moves (spec §7 table). */
export function applyWeaponsInput(state: TacticalState, i: number, input: ShipInput): void {
  const s = state.ships[i]!;
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

Replace the whole of `src/renderer/src/sim/tactical/missiles.ts` with:

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

function end(state: TacticalState, i: number, cause: EndCause, target = -1, room = -1): void {
  const m = state.missiles[i]!;
  state.events.push({ kind: 'missileEnd', ship: i, cause, target, room, x: m.x, y: m.y });
  if (cause !== 'ship') state.ships[i]!.missilesLost++;
  state.missiles[i] = null;
}

/** One tick of missile i's flight. `steer` is the gunner's turn axis (0 when the Weapons console is empty). */
export function flyMissile(state: TacticalState, i: number, steer: number): void {
  const m = state.missiles[i];
  if (!m) return;
  m.age++;
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
  if (k !== i) state.ships[i]!.missileHits++;   // a self-hit is not a hit; the event's target tells them apart
  end(state, i, 'ship', k, room);
}

/** Missile contacts in spec §4 order, per missile in owner order: statics and the edge, then ships by id, then the other
 *  missile. Then a missile that survived its MISSILE_LIFE_TICKS-th tick self-destructs (after that tick's move and contacts). */
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
  for (let i = 0; i < 2; i++) if (state.missiles[i] && state.missiles[i]!.age >= MISSILE_LIFE_TICKS) end(state, i, 'expired');
}
```

Replace the whole of `src/renderer/src/sim/tactical/hunter.ts` with:

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
  HUNTER_AVOID_MARGIN, HUNTER_BRAKE_SPEED, HUNTER_JITTER_TICKS, HUNTER_LEAD_S, HUNTER_LOOKAHEAD_S, HUNTER_MISSILE_COOLDOWN_TICKS, HUNTER_MISSILE_RANGE,
  HUNTER_STANDOFF, HUNTER_THRUST_COS, HUNTER_TRAIL_TICKS, HUNTER_WALK_TICKS, LASER_RANGE, REPAIR_WORK_TICKS
} from './tuning';
import { laserEligible, laserFull, type ShipInput } from './weapons';

/** Repair priority (spec §9): highest level first, ties Engines, then Weapons, then Shields. */
const REPAIR_ORDER = [Room.Engines, Room.Weapons, Room.Shields] as const;

/** Turn toward (dx, dy) for pursuit (spec §9): sideOf, except a target dead astern (zero cross product, behind) gets a fixed
 *  clockwise turn instead of none. Dead ahead stays 0. */
export function pursuitTurn(heading: number, dx: number, dy: number): number {
  const side = sideOf(heading, dx, dy);
  return side !== 0 || hx(heading) * dx + hy(heading) * dy >= 0 ? side : 1;
}

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
      const cx = crew.x - me.x, cy = crew.y - me.y, dist = Math.sqrt(cx * cx + cy * cy);
      if (dist <= HUNTER_STANDOFF) {
        // Standoff (spec §9): nose on the crew's current position, no forward thrust, brake when closing fast.
        const closing = dist > 0 ? ((me.vx - crew.vx) * cx + (me.vy - crew.vy) * cy) / dist : 0;
        input.axes = { turn: pursuitTurn(me.heading, cx, cy), thrust: closing > HUNTER_BRAKE_SPEED ? -1 : 0 };
      } else {
        const dx = cx + crew.vx * HUNTER_LEAD_S, dy = cy + crew.vy * HUNTER_LEAD_S;
        const aligned = hx(me.heading) * dx + hy(me.heading) * dy >= HUNTER_THRUST_COS * Math.sqrt(dx * dx + dy * dy);
        input.axes = { turn: pursuitTurn(me.heading, dx, dy), thrust: aligned ? 1 : 0 };
      }
    }
  }
  if (!weapons) { h.fireAt = -1; return input; }

  input.laserLock = crew.rooms[Room.Shields] < 2 ? Room.Shields : Room.Weapons;
  const missile = state.missiles[1];
  if (missile) input.steer = pursuitTurn(missile.heading, oldX - missile.x, oldY - missile.y);
  else {
    if (!me.fireHeld) { input.laserCharge = true; h.fireAt = -1; }   // press first; a release can only follow a held press
    else if (laserFull(state, 1) && laserEligible(state, 1, 0)) {
      if (h.fireAt < 0) h.fireAt = state.tick + nextInt(state.rng, HUNTER_JITTER_TICKS + 1);
      if (state.tick >= h.fireAt) { input.laserCharge = false; h.fireAt = -1; }
    } else h.fireAt = -1;
    const dx = crew.x - me.x, dy = crew.y - me.y;
    if (me.magazine > 0 && me.rooms[Room.Weapons] < 2 && dx * dx + dy * dy <= HUNTER_MISSILE_RANGE * HUNTER_MISSILE_RANGE
      && state.tick - h.lastLaunch >= HUNTER_MISSILE_COOLDOWN_TICKS) input.missileLaunch = true;   // stepDuel starts the cooldown only if it launches
  }
  return input;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/tactical*.test.ts tests/boundary.test.ts`
Expected: PASS (every tactical file; the ram test runs four 2-minute duels in about 2 s).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/weapons.ts src/renderer/src/sim/tactical/missiles.ts src/renderer/src/sim/tactical/hunter.ts tests/tacticalWeapons.test.ts tests/tacticalMissiles.test.ts tests/tacticalHunter.test.ts tests/tacticalDeterminism.test.ts
git commit -m "feat(tactical): telemetry fields on events, admission predicates, cloneTactical, and the hunter's standoff (Helm H-0c-i)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 2: The duel module

**Files:**
- Create: `src/renderer/src/sim/duel/tuning.ts`, `commands.ts`, `state.ts`, `step.ts`, `hash.ts`
- Test: `tests/duel.test.ts`

**Interfaces:**
- Consumes:
  - Task 1's `canCharge`, `canLaunch`, `validLock`, and `stepDuel`, `Outcome`, `Room`, `flattenTactical`, `createTacticalState`, `validateMap`.
  - Today's `createSimState`, `RECRUIT` (`characters.ts`), `DoorState`, `roomAt` (`grid.ts`), `StationKind`, `sitDown` (`stations.ts`), `applyInteractionCommands`, `applyConsoleCommand` (`commands.ts`), `Position`, `Seated`, `Life`, `LifeState` (`components.ts`), `inReachOfTile` (`interact.ts`), `movementSystem` (`movement.ts`), `NEUTRAL_INTENT`, `Intent` (`src/shared/intent.ts`).
  - The types `CommandEnvelope`, `CommandReason`, `HeldInput` (`net/contracts.ts`).
  - `parseShip` and `cutter.json` (tests).
- Produces:
  - `REPAIR_UNITS`, `REPAIR_RATE_SOLO`, `REPAIR_RATE_TEAM`, `CUTTER_REPAIR_POINTS`.
  - `DuelCommand`, `DuelEnvelope`, `DuelReason`, `DuelResult`.
  - `interface DuelState`, `RepairPoint`, and `createDuel(layout: ShipLayout, seed: number): DuelState`, which throws on an invalid map or a repair point outside its room (and, defensively, on a missing role console, which `parseShip` already rules out by requiring one station per kind). It validates the map before allocating the interior, and disposes the interior (`disposeSimState`) if a later check throws.
  - `interface DuelInput { held: readonly HeldInput[]; commands: readonly DuelEnvelope[] }` and `stepDuelTick(d: DuelState, input: DuelInput): DuelResult[]`.
  - `flattenDuel(d): Float64Array` and `hashDuel(d): string`.

  H-0c-ii's authority mode and H-1's solo playtest drive `stepDuelTick`.

- [ ] **Step 1: Write the failing test**

Create `tests/duel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position, Seated } from '../src/renderer/src/sim/components';
import { DoorState, roomAt } from '../src/renderer/src/sim/grid';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { REPAIR_UNITS } from '../src/renderer/src/sim/duel/tuning';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
function step(d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]) { return stepDuelTick(d, { held, commands }); }
/** Stand player pid up and put them at tile (tx, ty) of the interior, as if they had walked there. */
function standAt(d: DuelState, pid: number, tx: number, ty: number): void {
  step(d, [cmd(d, pid, { kind: 'stand' })]);
  const eid = d.interior.crew[pid]!;
  Position.x[eid] = tx + 0.5; Position.y[eid] = ty + 0.5;
}

describe('createDuel (spec §8)', () => {
  it('seats player 0 at Navigation and player 1 at Weapons, holds every door open, and resolves the repair points', () => {
    const d = createDuel(layout, 5), st = d.interior;
    expect([st.stations.occupant[d.nav], st.stations.occupant[d.weapons]]).toEqual([0, 1]);
    expect([Seated.station[st.crew[0]!], Seated.station[st.crew[1]!]]).toEqual([d.nav, d.weapons]);
    expect([...st.doors.state].every((s) => s === DoorState.HeldOpen)).toBe(true);
    expect(d.points.map((p) => [p.tacticalRoom, p.room])).toEqual([[Room.Weapons, st.derived.roomIndex.get('W')], [Room.Shields, st.derived.roomIndex.get('R')], [Room.Engines, st.derived.roomIndex.get('E')]]);
    expect(d.present).toEqual([true, true]);
  });
});

describe('consoles are roles (spec §8, §13)', () => {
  it('the Helm player’s held axes fly the ship: moveX +1 turns clockwise, W (moveY −1) thrusts along the nose', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0], h0 = s.heading;
    step(d, [], [{ moveX: 1, moveY: 0, interactHeld: false }, NONE]);
    expect(s.heading).toBe((h0 + 1) % 256);                              // 1.78 steps per tick: one whole step on the first tick
    const coast = createDuel(layout, 5), thrust = createDuel(layout, 5);
    step(coast); step(thrust, [], [{ moveX: 0, moveY: -1, interactHeld: false }, NONE]);
    const [a, b] = [coast.tactical.ships[0], thrust.tactical.ships[0]];
    const dx = b.vx - a.vx, dy = b.vy - a.vy;                           // the velocity thrust added this tick
    expect(dx * hx(b.heading) + dy * hy(b.heading)).toBeGreaterThan(0.99 * Math.hypot(dx, dy));
    expect(Math.hypot(dx, dy)).toBeGreaterThan(1.9);                     // about THRUST · dt = 2 u/s
  });
  it('accepts weapon commands only from the present player seated at Weapons', () => {
    const d = createDuel(layout, 5);
    const helmPress = cmd(d, 0, { kind: 'laserCharge', held: true }), gunPress = cmd(d, 1, { kind: 'laserCharge', held: true });
    const results = step(d, [helmPress, gunPress]);
    expect(results.find((r) => r.id === helmPress.id)).toMatchObject({ status: 'rejected', reason: 'not-at-weapons' });
    expect(results.find((r) => r.id === gunPress.id)).toMatchObject({ status: 'applied' });
    expect(d.tactical.ships[0].fireHeld).toBe(true);
    for (let t = 0; t < 239; t++) step(d);
    expect(d.tactical.ships[0].laserCharge).toBe(LASER_CHARGE_UNITS);
    step(d, [cmd(d, 1, { kind: 'laserCharge', held: false })]);
    expect(d.tactical.ships[0].shots).toBe(1);
  });
  it('weapon commands take effect lock, then charge, then launch, whatever their envelope order', () => {
    for (const launchFirst of [true, false]) {
      const d = createDuel(layout, 5), s = d.tactical.ships[0];
      s.fireHeld = true; s.laserCharge = LASER_CHARGE_UNITS;            // a full charge, held
      const launch = cmd(d, 1, { kind: 'missileLaunch' }), release = cmd(d, 1, { kind: 'laserCharge', held: false });
      const results = step(d, launchFirst ? [launch, release] : [release, launch]);
      expect(results.map((r) => r.status), String(launchFirst)).toEqual(['applied', 'applied']);
      expect([s.shots, s.missilesLaunched], String(launchFirst)).toEqual([1, 1]);   // the release fired, then the missile launched
    }
    for (const lockFirst of [true, false]) {
      const d = createDuel(layout, 5), [s, e] = d.tactical.ships;
      Object.assign(e, { x: s.x + hx(s.heading) * 300, y: s.y + hy(s.heading) * 300, shields: 0 });   // dead ahead, shields down
      s.fireHeld = true; s.laserCharge = LASER_CHARGE_UNITS;
      const lock = cmd(d, 1, { kind: 'laserLock', room: Room.Engines }), release = cmd(d, 1, { kind: 'laserCharge', held: false });
      step(d, lockFirst ? [lock, release] : [release, lock]);
      expect(e.rooms, String(lockFirst)).toEqual([0, 0, 1]);           // the new lock applied before the shot
    }
  });
  it('rejects a bad lock, a charge while a missile flies, and a launch it cannot make', () => {
    const d = createDuel(layout, 5);
    const lock = cmd(d, 1, { kind: 'laserLock', room: 1.5 }), launch = cmd(d, 1, { kind: 'missileLaunch' });
    expect(step(d, [lock, launch]).map((r) => r.reason)).toEqual(['malformed', undefined]);
    const charge = cmd(d, 1, { kind: 'laserCharge', held: true }), again = cmd(d, 1, { kind: 'missileLaunch' });
    expect(step(d, [charge, again]).map((r) => r.reason)).toEqual(['missile-in-flight', 'unavailable']);
  });
  it('standing up empties the console: the ship coasts and weapon commands are refused', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0];
    const stand = cmd(d, 0, { kind: 'stand' });
    expect(step(d, [stand])[0]).toMatchObject({ status: 'applied' });
    const h = s.heading;
    step(d, [], [{ moveX: 1, moveY: 0, interactHeld: false }, NONE]);
    expect(s.heading).toBe(h);                                           // nobody at the Helm: axes ignored
    expect(Seated.station[d.interior.crew[0]!]).toBe(-1);
  });
  it('a standing player walks with the held stick and can sit back down at the console', () => {
    const d = createDuel(layout, 5), eid = d.interior.crew[0]!;
    step(d, [cmd(d, 0, { kind: 'stand' })]);
    const x0 = Position.x[eid]!;
    for (let t = 0; t < 15; t++) step(d, [], [{ moveX: -1, moveY: 0, interactHeld: false }, NONE]);
    expect(Position.x[eid]!).toBeLessThan(x0 - 0.5);                   // 4 tiles/s for 0.25 s
    for (let t = 0; t < 15; t++) step(d, [], [{ moveX: 1, moveY: 0, interactHeld: false }, NONE]);
    expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav })])[0]).toMatchObject({ status: 'applied' });
    expect(d.interior.stations.occupant[d.nav]).toBe(0);
  });
  it('rejects sitting at a scenery console, unknown kinds, and stale ticks', () => {
    const d = createDuel(layout, 5);
    step(d, [cmd(d, 0, { kind: 'stand' })]);
    const science = 3, sit = cmd(d, 0, { kind: 'sit', station: science });
    const stale: DuelEnvelope = { ...cmd(d, 1, { kind: 'laserCharge', held: true }), requestedTick: d.interior.tick - 1 };
    expect(step(d, [sit, stale]).map((r) => r.reason)).toEqual(['not-in-duel', 'stale-tick']);
  });
});

describe('present or away (spec §8, §11a)', () => {
  it('an away player\’s console is empty: Fire lets go without firing and their commands are refused', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0];
    step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })]);
    expect(s.fireHeld).toBe(true);
    step(d, [cmd(d, 1, { kind: 'presence', present: false })]);
    expect(d.present).toEqual([true, false]);
    expect(s.fireHeld).toBe(false);
    expect(s.shots).toBe(0);
    expect(step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })])[0]).toMatchObject({ reason: 'not-at-weapons' });
    step(d, [cmd(d, 1, { kind: 'presence', present: true })]);
    expect(step(d, [cmd(d, 1, { kind: 'laserCharge', held: true })])[0]).toMatchObject({ status: 'applied' });
  });
  it('an away player does not walk or repair', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[0].rooms[Room.Engines] = 1;
    standAt(d, 0, 1, 6);                                                 // Engines room, next to its repair point (2, 6)
    step(d, [cmd(d, 0, { kind: 'presence', present: false })]);
    const eid = d.interior.crew[0]!, x = Position.x[eid];
    for (let t = 0; t < 30; t++) step(d, [], [{ moveX: 1, moveY: 0, interactHeld: true }, NONE]);
    expect(Position.x[eid]).toBe(x);
    expect(d.repair[Room.Engines]).toBe(0);
  });
});

describe('repair in the room (spec §8)', () => {
  it('one repairer lowers a room one level in exactly 240 ticks; progress waits when released', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 2;
    standAt(d, 0, 1, 6);
    const hold: HeldInput[] = [{ moveX: 0, moveY: 0, interactHeld: true }, NONE];
    for (let t = 0; t < 100; t++) step(d, [], hold);
    for (let t = 0; t < 50; t++) step(d);                                // let go: progress kept
    expect(d.repair[Room.Engines]).toBe(100 * 4);
    for (let t = 0; t < 139; t++) step(d, [], hold);
    expect(ship.rooms[Room.Engines]).toBe(2);
    step(d, [], hold);
    expect(ship.rooms[Room.Engines]).toBe(1);
    expect(d.repair[Room.Engines]).toBe(0);
  });
  it('two repairers on one point finish in 96 ticks', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, 0, 1, 6); standAt(d, 1, 1, 7);
    const both: HeldInput[] = [{ moveX: 0, moveY: 0, interactHeld: true }, { moveX: 0, moveY: 0, interactHeld: true }];
    for (let t = 0; t < 95; t++) step(d, [], both);
    expect(ship.rooms[Room.Engines]).toBe(1);
    step(d, [], both);
    expect(ship.rooms[Room.Engines]).toBe(0);
    expect(REPAIR_UNITS / 10).toBe(96);
  });
  it('needs the repairer inside the repair room: in reach through a wall does not count', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Engines] = 1;
    standAt(d, 0, 2, 4);                                                 // (2, 4) is the door tile north of Engines, outside the room
    expect(roomAt(d.interior, 2.5, 4.5)).not.toBe(d.points[2]!.room);
    for (let t = 0; t < 300; t++) step(d, [], [{ moveX: 0, moveY: 0, interactHeld: true }, NONE]);
    expect(ship.rooms[Room.Engines]).toBe(1);
  });
  it('the gunner can fix the Weapons room from the console spot, with the console empty meanwhile', () => {
    const d = createDuel(layout, 5), ship = d.tactical.ships[0];
    ship.rooms[Room.Weapons] = 1;
    step(d, [cmd(d, 1, { kind: 'stand' })]);
    for (let t = 0; t < 240; t++) step(d, [], [NONE, { moveX: 0, moveY: 0, interactHeld: true }]);
    expect(ship.rooms[Room.Weapons]).toBe(0);
  });
});

describe('the duel tick', () => {
  it('is deterministic: the same seed and inputs give the same duel hash', () => {
    const run = (): string => {
      const d = createDuel(layout, 9);
      for (let t = 0; t < 900; t++) step(d, t === 10 ? [cmd(d, 0, { kind: 'stand' })] : [], [{ moveX: t % 50 < 25 ? 1 : -1, moveY: 0, interactHeld: false }, NONE]);
      return hashDuel(d);
    };
    expect(run()).toBe(run());
  });
  it('keeps the interior and tactical ticks together, and stops when the duel ends', () => {
    const d = createDuel(layout, 5);
    for (let t = 0; t < 10; t++) step(d);
    expect([d.interior.tick, d.tactical.tick]).toEqual([10, 10]);
    d.tactical.ships[0].hull = 0;
    step(d);
    expect(d.tactical.outcome).toBe(Outcome.EnemyWins);
    expect(step(d)).toEqual([]);
    expect([d.interior.tick, d.tactical.tick]).toEqual([11, 11]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/duel.test.ts`
Expected: FAIL, "Failed to resolve import ../src/renderer/src/sim/duel/commands".

- [ ] **Step 3: Write the tuning and commands**

Create `src/renderer/src/sim/duel/tuning.ts`:

```ts
// The duel's interior numbers (spec §8). Every value is *(start)*.
import { Room } from '../tactical/state';

/** Repair progress toward lowering a tactical room one level, in whole units so durations are exact tick counts:
 *  one repairer adds REPAIR_RATE_SOLO per tick (960 / 4 = 240 ticks = 4 s); with two or more on the same point each
 *  adds REPAIR_RATE_TEAM (1.25 × 4, today's TEAM_MULT), so two finish in 96 ticks. */
export const REPAIR_UNITS = 960;
export const REPAIR_RATE_SOLO = 4;
export const REPAIR_RATE_TEAM = 5;

/** Repair points on the Cutter (spec §8 table): the interior room id and tile of each tactical Room's point. */
export const CUTTER_REPAIR_POINTS: readonly { tacticalRoom: number; room: string; tile: readonly [number, number] }[] = [
  { tacticalRoom: Room.Weapons, room: 'W', tile: [8, 7] },
  { tacticalRoom: Room.Shields, room: 'R', tile: [16, 8] },
  { tacticalRoom: Room.Engines, room: 'E', tile: [2, 6] }
];
```

Create `src/renderer/src/sim/duel/commands.ts`:

```ts
// The duel's commands (spec §13). H-0c-ii moves these into the shared command union in net/contracts.ts as an explicit
// Net-1 amendment; until then the duel step takes them in this local envelope, so nothing here touches the authority.
import type { CommandReason } from '../../net/contracts';

export type DuelCommand =
  | { kind: 'sit'; station: number }
  | { kind: 'stand' }
  | { kind: 'presence'; present: boolean }
  | { kind: 'laserLock'; room: number }
  | { kind: 'laserCharge'; held: boolean }
  | { kind: 'missileLaunch' };

export interface DuelEnvelope { id: { player: number; sequence: number }; requestedTick: number; command: DuelCommand }

/** Today's reasons plus the duel's own (spec §7 table, §13). */
export type DuelReason = CommandReason | 'not-in-duel' | 'not-at-weapons' | 'missile-in-flight';

export interface DuelResult { id: { player: number; sequence: number }; tick: number; status: 'applied' | 'rejected'; reason?: DuelReason }
```

- [ ] **Step 4: Write the state**

Create `src/renderer/src/sim/duel/state.ts`:

```ts
// The duel's state (spec §8, §13): today's SimState for the Cutter interior, the tactical state, who is present, and
// the repair progress of each tactical room. Only the interior systems the duel lists ever run on `interior`.
import { RECRUIT } from '../characters';
import { DoorState, roomAt } from '../grid';
import type { ShipLayout } from '../ship/schema';
import { createSimState, disposeSimState, type SimState } from '../state';
import { StationKind } from '../stationKinds';
import { sitDown } from '../stations';
import { validateMap } from '../tactical/map';
import { createTacticalState, type TacticalState } from '../tactical/state';
import { CUTTER_REPAIR_POINTS } from './tuning';

export interface RepairPoint { tacticalRoom: number; room: number; tile: number }

export interface DuelState {
  interior: SimState;
  tactical: TacticalState;
  /** Whether each player is at the keyboard (spec §8 "present or away"). */
  present: [boolean, boolean];
  /** Repair progress per tactical Room (index = Room), in REPAIR_UNITS. */
  repair: [number, number, number];
  /** Resolved repair points, in tactical Room order. */
  points: RepairPoint[];
  /** Station indices of the two consoles that are roles (spec §8). */
  nav: number; weapons: number;
}

/**
 * A duel on `layout` (the Cutter): two trait-free Recruits (no XP is ever awarded, since xpSystem never runs), every
 * door held open, player 0 seated at Navigation and player 1 at Weapons, and a tactical state from the same seed whose
 * map must validate. Throws if the map or a repair point is invalid, so a bad seed or layout fails loudly.
 */
export function createDuel(layout: ShipLayout, seed: number): DuelState {
  const tactical = createTacticalState(seed);
  const problems = validateMap(tactical.map);
  if (problems.length > 0) throw new Error(`invalid duel map for seed ${seed}: ${problems[0]}`);
  const interior = createSimState(layout, 2, seed, [RECRUIT, RECRUIT]);
  try {
    interior.doors.state.fill(DoorState.HeldOpen);
    const nav = interior.derived.stationOfKind[StationKind.Navigation]!, weapons = interior.derived.stationOfKind[StationKind.Weapons]!;
    if (nav < 0 || weapons < 0) throw new Error('duel layout needs Navigation and Weapons consoles');
    sitDown(interior, 0, nav);
    sitDown(interior, 1, weapons);
    const points = CUTTER_REPAIR_POINTS.map((p) => {
      const room = interior.derived.roomIndex.get(p.room) ?? -1, [tx, ty] = p.tile;
      if (room < 0 || roomAt(interior, tx + 0.5, ty + 0.5) !== room) throw new Error(`repair point ${p.room} ${tx},${ty} is not inside its room`);
      return { tacticalRoom: p.tacticalRoom, room, tile: ty * interior.derived.width + tx };
    });
    return { interior, tactical, present: [true, true], repair: [0, 0, 0], points, nav, weapons };
  } catch (err) {
    disposeSimState(interior);   // release its entities and component storage before rethrowing
    throw err;
  }
}
```

- [ ] **Step 5: Write the duel tick**

Create `src/renderer/src/sim/duel/step.ts`:

```ts
// One duel tick (spec §13 phase list). The sector step (sim/step.ts) is never called on the duel's interior; this runs
// only the interior pieces the duel uses (sit, stand, Interact for repair, movement) and then the tactical stepDuel.
import { NEUTRAL_INTENT, type Intent } from '../../../../shared/intent';
import type { CommandEnvelope, HeldInput } from '../../net/contracts';
import { applyConsoleCommand, applyInteractionCommands } from '../commands';
import { Life, LifeState, Position, Seated } from '../components';
import { roomAt } from '../grid';
import { inReachOfTile } from '../interact';
import { movementSystem } from '../movement';
import { stepDuel } from '../tactical/duel';
import { Outcome } from '../tactical/state';
import { canCharge, canLaunch, validLock, type ShipInput } from '../tactical/weapons';
import type { DuelEnvelope, DuelReason, DuelResult } from './commands';
import type { DuelState } from './state';
import { REPAIR_RATE_SOLO, REPAIR_RATE_TEAM, REPAIR_UNITS } from './tuning';

export interface DuelInput { held: readonly HeldInput[]; commands: readonly DuelEnvelope[] }

const NO_HELD: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
/** The fixed order weapon commands take effect in within one tick. */
const WEAPON_ORDER = ['laserLock', 'laserCharge', 'missileLaunch'] as const;

function resetScratch(d: DuelState): void {
  const sc = d.interior.scratch;
  sc.commandResults.length = 0;
  sc.doorToggles.clear(); sc.doorCycles.clear(); sc.airlockToggles.clear();
  sc.satThisTick.fill(0); sc.stoodThisTick.fill(0); sc.activeThisTick.fill(0);
  sc.voteChoices.fill(-1); sc.jumpConfirm.fill(0); sc.confirmUsed.fill(0);
}

/** A duel sit or stand as today's envelope, so today's validation and handlers apply unchanged. */
function sector(env: DuelEnvelope): CommandEnvelope {
  const c = env.command;
  return { runId: 'duel', id: env.id, requestedTick: env.requestedTick, command: c.kind === 'sit' ? { kind: 'sit', station: c.station } : { kind: 'stand' } };
}

/** The player seated at station i who is present, or −1. */
function attendant(d: DuelState, station: number): number {
  const pid = d.interior.stations.occupant[station]!;
  return pid >= 0 && d.present[pid as 0 | 1] ? pid : -1;
}

function conscious(d: DuelState, pid: number): boolean { return Life.state[d.interior.crew[pid]!] === LifeState.Conscious; }
function seated(d: DuelState, pid: number): boolean { return Seated.station[d.interior.crew[pid]!]! >= 0; }

/** Each standing, present, conscious player holding Interact inside a damaged room's repair room and in reach of its point. */
function repairPhase(d: DuelState, held: readonly HeldInput[]): void {
  const crewShip = d.tactical.ships[0], holders = [0, 0, 0];
  for (let pid = 0; pid < 2; pid++) {
    if (!d.present[pid as 0 | 1] || !conscious(d, pid) || seated(d, pid) || !(held[pid] ?? NO_HELD).interactHeld) continue;
    const eid = d.interior.crew[pid]!, here = roomAt(d.interior, Position.x[eid]!, Position.y[eid]!);
    const point = d.points.find((p) => crewShip.rooms[p.tacticalRoom]! > 0 && p.room === here && inReachOfTile(d.interior, eid, p.tile));
    if (point) holders[point.tacticalRoom]!++;
  }
  for (const p of d.points) {
    const r = p.tacticalRoom as 0 | 1 | 2, n = holders[r]!;
    if (crewShip.rooms[r] === 0) { d.repair[r] = 0; continue; }
    if (n === 0) continue;
    d.repair[r] += n === 1 ? REPAIR_RATE_SOLO : n * REPAIR_RATE_TEAM;
    if (d.repair[r] >= REPAIR_UNITS) { crewShip.rooms[r]--; d.repair[r] = 0; }
  }
}

/**
 * Spec §13, in order: scratch reset; seat phase (sit through today's interaction validation, only at the two role
 * consoles; stand through today's handler; then presence); tactical commands validated against the seats after the
 * seat phase and folded into the crew's ShipInput; repair; movement for standing present players; the tactical
 * stepDuel; the interior tick. Commands apply in the order given (the authority's envelope order). Returns one result
 * per command, sorted by player then sequence. Does nothing once the duel has ended.
 */
export function stepDuelTick(d: DuelState, input: DuelInput): DuelResult[] {
  if (d.tactical.outcome !== Outcome.Running) return [];
  const st = d.interior, tick = st.tick, results: DuelResult[] = [];
  const result = (env: DuelEnvelope, reason?: DuelReason): void => {
    results.push(reason ? { id: env.id, tick, status: 'rejected', reason } : { id: env.id, tick, status: 'applied' });
  };
  resetScratch(d);

  // Seat phase: sits (today's validation), then stands (today's handler), then presence.
  const sits = input.commands.filter((e) => e.command.kind === 'sit');
  const allowedSits = sits.filter((e) => e.command.kind === 'sit' && (e.command.station === d.nav || e.command.station === d.weapons));
  for (const e of sits) if (!allowedSits.includes(e)) result(e, 'not-in-duel');
  applyInteractionCommands(st, allowedSits.map(sector));
  for (const r of st.scratch.commandResults) results.push({ id: r.id, tick, status: r.status === 'applied' ? 'applied' : 'rejected', ...(r.reason ? { reason: r.reason } : {}) });
  for (const e of input.commands) if (e.command.kind === 'stand') {
    const r = applyConsoleCommand(st, sector(e));
    results.push({ id: r.id, tick, status: r.status === 'applied' ? 'applied' : 'rejected', ...(r.reason ? { reason: r.reason } : {}) });
  }
  for (const e of input.commands) if (e.command.kind === 'presence') {
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    d.present[e.id.player as 0 | 1] = e.command.present; result(e);
  }

  // Tactical commands, against the seats as they now stand. Within a tick they take effect in a fixed order, lock, then
  // charge, then launch (the order applyWeaponsInput applies them), whatever their envelope order; admission is checked
  // in that same order so every result matches what happens. Within one kind, envelope order holds and the last wins.
  const helm = attendant(d, d.nav), gunner = attendant(d, d.weapons);
  const crew: ShipInput = { helm: helm >= 0, weapons: gunner >= 0, axes: { turn: 0, thrust: 0 }, steer: 0, laserLock: null, laserCharge: null, missileLaunch: false };
  for (const e of WEAPON_ORDER.flatMap((kind) => input.commands.filter((x) => x.command.kind === kind))) {
    const c = e.command;
    if (c.kind !== 'laserLock' && c.kind !== 'laserCharge' && c.kind !== 'missileLaunch') continue;
    if (e.requestedTick !== tick) { result(e, 'stale-tick'); continue; }
    if (e.id.player !== gunner) { result(e, 'not-at-weapons'); continue; }
    if (c.kind === 'laserLock') { if (!validLock(c.room)) { result(e, 'malformed'); continue; } crew.laserLock = c.room; }
    else if (c.kind === 'laserCharge') { if (!canCharge(d.tactical, 0)) { result(e, 'missile-in-flight'); continue; } crew.laserCharge = c.held; }
    else { if (!canLaunch(d.tactical, 0)) { result(e, 'unavailable'); continue; } crew.missileLaunch = true; }
    result(e);
  }
  for (const e of input.commands) if (!['sit', 'stand', 'presence', 'laserLock', 'laserCharge', 'missileLaunch'].includes(e.command.kind)) result(e, 'not-in-duel');
  if (helm >= 0) { const h = input.held[helm] ?? NO_HELD; crew.axes = { turn: h.moveX, thrust: -h.moveY }; }   // W (moveY −1, up) is thrust forward
  if (gunner >= 0) crew.steer = (input.held[gunner] ?? NO_HELD).moveX;

  repairPhase(d, input.held);
  const intents: Intent[] = [0, 1].map((pid) => {
    const h = input.held[pid] ?? NO_HELD;
    return d.present[pid as 0 | 1] ? { ...NEUTRAL_INTENT, moveX: h.moveX, moveY: h.moveY } : { ...NEUTRAL_INTENT };
  });
  movementSystem(st, intents);   // skips seated and downed crew, and anyone who stood this tick
  stepDuel(d.tactical, crew);
  st.tick++;
  return results.sort((a, b) => a.id.player - b.id.player || a.id.sequence - b.id.sequence);
}
```

- [ ] **Step 6: Write the duel hash**

Create `src/renderer/src/sim/duel/hash.ts`:

```ts
// The duel hash: the whole tactical flatten plus the interior fields the duel can change (spec §4: same seed and
// inputs give the same hash). The sector flatten covers far more than the duel touches, so it is not used here.
import { hashF64 } from '../../../../shared/hash';
import { Position, Seated } from '../components';
import { flattenTactical } from '../tactical/hash';
import type { DuelState } from './state';

export function flattenDuel(d: DuelState): Float64Array {
  const out: number[] = [...flattenTactical(d.tactical), d.interior.tick, d.present[0] ? 1 : 0, d.present[1] ? 1 : 0, ...d.repair];
  for (let pid = 0; pid < 2; pid++) { const eid = d.interior.crew[pid]!; out.push(Position.x[eid]!, Position.y[eid]!, Seated.station[eid]!); }
  for (const v of d.interior.stations.occupant) out.push(v);
  for (const v of d.interior.doors.state) out.push(v);
  return Float64Array.from(out, (v) => (v === 0 ? 0 : v));
}

export function hashDuel(d: DuelState): string { return hashF64(flattenDuel(d)); }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/duel.test.ts tests/boundary.test.ts`
Expected: PASS (16 duel tests; the boundary test now also checks the five `sim/duel/` files).

- [ ] **Step 8: Run the full suite and the typecheck**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm test`
Expected: every file passes, about 1,810 tests (see the known flakes in Global Constraints).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/sim/duel/tuning.ts src/renderer/src/sim/duel/commands.ts src/renderer/src/sim/duel/state.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/hash.ts tests/duel.test.ts
git commit -m "feat(duel): the headless duel tick joining the Cutter interior to the tactical sim (Helm H-0c-i)"
```

(End the message with your session's Co-Authored-By trailer.)

---

## After H-0c-i

- **H-0c-ii (after Net-3 merges):**
  - Move `DuelCommand` into the shared command union (an explicit Net-1 amendment), and add `LifecyclePresence` to the lifecycle controls (spec §8).
  - Add the authority's `duel` mode, driving `stepDuelTick`.
  - Add interior deep copy and snapshot encoding, including the hunter's trail.
  - Build the scripted crew pair, which needs interior path-following to walk to repairs.
  - Add the §13 telemetry built on the new event fields.
  - Gate on §16 and tune.
  - Add the golden replay and do the single `SIM_VERSION` bump.
- **H-1** can start the dev flight view and the solo playtest on `stepDuelTick` now.
