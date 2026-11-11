# Sector Map and Jumps (Run-i) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A run becomes a journey across a seeded node map: the drive charges from arrival, the Navigation operator picks a destination and jumps, the encounter is cleared while the ship's troubles persist, and the last column is a victory, per `docs/superpowers/specs/2026-11-11-sector-map-design.md`.

**Architecture:** a sixth RNG stream `map` and a `run` block in `SimState` (SIM_VERSION 13); `sim/run.ts` owns map generation, the charge, the Navigation input and `jumpShip`; `console.ts` dispatches Navigation; `crew.ts` gains `Victory` and victory precedence; `jumpStep` is the first system of the tick; HUD gains a clock suffix, Navigation rows and footer, and the headline's node count; record and table gain `run`/`nodes`.

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), Pixi 8.19 (hud.ts only). No new dependencies.

## Spec amendments made by this plan (recorded in Task 3)

- `nodeLabel` lives in `sim/run.ts` (pure, used by the HUD model); `clockLine` and `navigationFooter` live in `render/hudModel.ts`.
- `jumpShip` reads the destination from the Navigation console's cursor (`stations.cursor[navIndex]`, clamped to the reachable list; 0 when the console is absent) and resets it to 0; tests that call `jumpShip` directly set that cursor.
- `clearObjects(state)` in `debris.ts` also sets `science.scanning = 0` (the spec lists it as part of that step).

## Global Constraints

- `tests/boundary.test.ts` stays green (no banned imports or calls in `sim/`; ASCII comments). Every test runs under node; `hudModel.ts` stays pixi-free.
- Streams: `STREAM_NAMES = ['hazards', 'director', 'combat', 'loot', 'cosmetic', 'map']` (appended last, so the five existing streams keep their seeds: `deriveStreams(seed)` draws them from the master in order). The map is generated at `createSimState` from `rng.map` only, by the §5 procedure of the spec, in that exact draw order.
- Draw order (exact): `jumpStep` and `navigationInput` draw nothing; inside a `jumpShip` call exactly one director draw when the enemy is absent (`enterPhase`) and two when present (`leave`, then `enterPhase`); nothing from hazards, combat or map. The rest of the tick runs as usual afterwards.
- Tick order: `jumpStep` is the **first** system after the scratch clear, before `interactSystem`. Victory precedence: `crewSystem` only sets `ended`/`endReason` when `ended` is still 0.
- Jump (exact, spec §6): `node = reachable[cursor]`, `column += 1`, `nodesReached += 1`, `jumpCharge = 0`, Navigation cursor 0, `telemetry.jumps += 1`; `clearObjects` (every slot through `removeDebris`, then `science.scanning = 0`); enemy present → `leave(state, false)`; always `enemy.nextArrivalTick = tick + ENCOUNTER_AFTER_JUMP × TICK_HZ`; no boarder aboard → `boarders.nextArrivalTick = tick + BOARDING_AFTER_JUMP × TICK_HZ`; `enterPhase(state, Phase.BuildUp)`; `column === RUN_COLUMNS − 1` → `ended 1`, `endReason Victory`. Everything else untouched. Invariant: `nodesReached === column === telemetry.jumps`.
- Navigation input: stick edge first (Up/Down cycle the cursor over `reachable` with wrap; Left/Right ignored), then a Confirm **edge** with `jumpCharge >= 1` and a non-empty list jumps; the seating Confirm never acts (players who sat this tick act from the next tick, as today).
- State and flatten (exact): `run` manifest section after `boarders`: `column, node, nodesReached, jumpCharge`, then `colNodes[RUN_COLUMNS]`, then `edgeMask[RUN_COLUMNS × 3]` (`RUN_FIELDS = 4 + 4 × RUN_COLUMNS`); `telemetry.jumps` after `boardersKilled` (`TELEMETRY_SCALARS = 16`); the rng section and the snapshot header grow by the `map` stream automatically through `STREAM_NAMES`. `SIM_VERSION = 13`; version-12 snapshots rejected.
- Tuning (exact): `RUN_COLUMNS 8`, `EDGE_CHANCE 0.5`, `JUMP_CHARGE_TIME 60`, `ENCOUNTER_AFTER_JUMP 60`, `BOARDING_AFTER_JUMP 120`. `EndReason.Victory = 3`.
- HUD strings (exact): `clockLine` = `` `HULL ${round(hull)}   TIME ${simSeconds}s   node ${column + 1}/${columns}` ``; `nodeLabel(c, n)` = `` `Node ${c + 1}${String.fromCharCode(97 + n)}` ``; `navigationFooter` = `` `Evade ${round(evadeChance × 100)}%   Jump ${final ? '-' : ready ? 'READY' : `${floor(charge × 100)}%`}` ``; headline `` `Survived ${mm:ss}  ${HULL LOST | CREW LOST | VICTORY}  Reached node ${column + 1} of ${RUN_COLUMNS}` ``; session banner `VICTORY after Ns. Confirm: same seed. Cancel: new seed.`.
- Survival levers (re-authorised for this feature, in order, only on a failing seed, before the single golden re-bless): (1) `DEBRIS_CREW_DAMAGE` 20 → 15; (2) `ENEMY_SHOT_CREW_DAMAGE = 12` for shot impacts; (3) `BOARDER_DPS` 6 → 4; (4) `BOARDER_HEALTH` 60 → 45; (5) `BOARDING_FIRST` 240 → 330 with `gate-boarding` still green. The figures should be identical to Boarders-i's since the five streams keep their seeds.
- Golden replay: re-blessed **once**, in Task 1, after the gates pass; Task 2 leaves `tests/golden/basic.json` untouched (no sim change).
- Commit messages: imperative, prefixed `feat:`, `test:`, `chore:` or `docs:`, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. `npm run typecheck`, `npm test` and `npm run build` pass at the end of every task.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/run.ts` (new) | `generateMap`, `reachable`, `jumpStep`, `navigationInput`, `jumpShip`, `nodeLabel`. |
| `src/renderer/src/sim/{state,flatten,tuning,step,console,crew,debris}.ts` | as the tasks say. |
| `src/renderer/src/sim/{telemetry,acceptance}.ts`, `app/session.ts`, `render/{hudModel,hud}.ts` | Task 2. |
| `tests/run.test.ts` (new), `tests/gate-jump.test.ts` (new), `tests/{snapshot,gate-survival,hud,session,telemetry,acceptance}.test.ts`, `tests/helpers/sim.ts` | as the tasks say. |
| `docs/gates.md`, the spec, `docs/roadmap.md` | Task 3. |

---

### Task 1: The map stream, the run block, the charge, Navigation input, the jump and victory

**Files:**
- Create: `src/renderer/src/sim/run.ts`, `tests/run.test.ts`, `tests/gate-jump.test.ts`
- Modify: `src/renderer/src/sim/state.ts`, `flatten.ts`, `tuning.ts`, `step.ts`, `console.ts`, `crew.ts`, `debris.ts`, `tests/helpers/sim.ts`, `tests/snapshot.test.ts`, `tests/gate-survival.test.ts` (figures only), `tests/golden/basic.json` (re-bless)

**Interfaces:**
- Produces: `RngStreams.map`, `SimState.run`, `telemetry.jumps`, `EndReason.Victory`; from `run.ts`: `generateMap(rng, columns)`, `reachable(state): number[]`, `jumpStep(state)`, `navigationInput(state, i, dir, confirm)`, `jumpShip(state)`, `nodeLabel(column, node)`; from `debris.ts`: `clearObjects(state)`; helpers `chargeJump(state)`, `seatNavigator(state, pid)`, `setMap(state, colNodes: number[], masks: Record<string, number>)` in `tests/helpers/sim.ts`.

- [ ] **Step 0: Baseline and stream pins**

Before any code: `npx vitest run tests/gate-survival.test.ts tests/gate-boarding.test.ts` with a temporary `console.log(figures)` in each (then removed), record the per-seed lines. Also record, in a scratch script run with `npx tsx`, the values of `deriveStreams(1).hazards.s`, `.director.s`, `.combat.s` (import `deriveStreams` from `src/renderer/src/sim/state.ts`); these three numbers go into the map test as the "unchanged seeds" pins.

- [ ] **Step 1: Write the failing tests**

`tests/helpers/sim.ts` (imports: `RUN_COLUMNS` from tuning; `sitDown` from stations; `StationKind` from stationKinds):

```ts
export function chargeJump(state: SimState): void { state.run.jumpCharge = 1; }
export function seatNavigator(state: SimState, pid: number): number { const i = state.derived.stationOfKind[StationKind.Navigation]!; sitDown(state, pid, i); return i; }
/** Overwrite the generated map: nodes per column and `"c:n"` -> mask entries (unlisted masks become 0). */
export function setMap(state: SimState, colNodes: number[], masks: Record<string, number>): void {
  state.run.colNodes.set(colNodes); state.run.edgeMask.fill(0);
  for (const [key, mask] of Object.entries(masks)) { const [c, n] = key.split(':').map(Number); state.run.edgeMask[c! * 3 + n!] = mask; }
}
```

Create `tests/run.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateMap, reachable, jumpStep, jumpShip, nodeLabel } from '../src/renderer/src/sim/run';
import { deriveStreams } from '../src/renderer/src/sim/state';
import { step } from '../src/renderer/src/sim/step';
import { Phase } from '../src/renderer/src/sim/director';
import { EndReason, downCrew } from '../src/renderer/src/sim/crew';
import { Health, Life, LifeState, Seated } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { failStation } from '../src/renderer/src/sim/power';
import { sitDown } from '../src/renderer/src/sim/stations';
import { createRng, nextFloat, nextInt } from '../src/shared/rng';
import { TICK_HZ, DT, RUN_COLUMNS, EDGE_CHANCE, JUMP_CHARGE_TIME, ENCOUNTER_AFTER_JUMP, BOARDING_AFTER_JUMP, DEBRIS_SLOTS, HULL_MAX } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, intents, teleport, placeDebris, placeShot, placeEnemy, placeBoarder, chargeJump, seatNavigator, setMap, room, setSkill } from './helpers/sim';
import { Skill } from '../src/renderer/src/sim/skills';

const T = TICK_HZ;
const calm = (players = 2, seed = 1) => { const s = makeState(players, seed); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; return s; };

/** The spec section 5 procedure, replayed on a reference stream. */
function replayMap(rng: { s: number }, columns: number) {
  const colNodes = new Uint8Array(columns), edgeMask = new Uint8Array(columns * 3);
  colNodes[0] = 1; colNodes[columns - 1] = 1;
  for (let c = 1; c < columns - 1; c++) colNodes[c] = 2 + nextInt(rng, 2);
  for (let c = 0; c < columns - 1; c++) {
    const next = colNodes[c + 1]!;
    for (let n = 0; n < colNodes[c]!; n++) { let mask = 0; for (let d = 0; d < next; d++) if (nextFloat(rng) < EDGE_CHANCE) mask |= 1 << d; if (mask === 0) mask = 1 << nextInt(rng, next); edgeMask[c * 3 + n] = mask; }
    for (let d = 0; d < next; d++) { let incoming = false; for (let n = 0; n < colNodes[c]!; n++) if (edgeMask[c * 3 + n]! & (1 << d)) incoming = true; if (!incoming) { const n = nextInt(rng, colNodes[c]!); edgeMask[c * 3 + n] = edgeMask[c * 3 + n]! | (1 << d); } }
  }
  return { colNodes, edgeMask };
}

describe('run: map generation', () => {
  it('is well-formed for seeds 1..50: one node at each end, 2 or 3 in the middle, every node has a way out and a way in, no bit past the next column, last masks 0', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { colNodes, edgeMask } = generateMap(createRng(seed), RUN_COLUMNS);
      expect(colNodes[0]).toBe(1); expect(colNodes[RUN_COLUMNS - 1]).toBe(1);
      for (let c = 1; c < RUN_COLUMNS - 1; c++) expect([2, 3]).toContain(colNodes[c]);
      for (let c = 0; c < RUN_COLUMNS - 1; c++) {
        const next = colNodes[c + 1]!;
        for (let n = 0; n < colNodes[c]!; n++) { const m = edgeMask[c * 3 + n]!; expect(m).toBeGreaterThan(0); expect(m >> next).toBe(0); }
        for (let d = 0; d < next; d++) { let incoming = 0; for (let n = 0; n < colNodes[c]!; n++) if (edgeMask[c * 3 + n]! & (1 << d)) incoming++; expect(incoming).toBeGreaterThan(0); }
      }
      for (let n = 0; n < 3; n++) expect(edgeMask[(RUN_COLUMNS - 1) * 3 + n]).toBe(0);
    }
  });
  it('createSimState draws the map from the map stream exactly as the section 5 replay does, leaves the other streams as before, and is seed-deterministic', () => {
    const ref = deriveStreams(7).map; const expected = replayMap(ref, RUN_COLUMNS);
    const s = makeState(2, 7);
    expect(Array.from(s.run.colNodes)).toEqual(Array.from(expected.colNodes)); expect(Array.from(s.run.edgeMask)).toEqual(Array.from(expected.edgeMask)); expect(s.rng.map.s).toBe(ref.s);
    expect([s.run.column, s.run.node, s.run.nodesReached, s.run.jumpCharge]).toEqual([0, 0, 0, 0]);
    const one = deriveStreams(1);
    expect([one.hazards.s, one.director.s, one.combat.s]).toEqual([/* the three pre-feature values recorded in Step 0 */ 0, 0, 0]);
    expect(Array.from(makeState(2, 1).run.edgeMask)).toEqual(Array.from(makeState(3, 1).run.edgeMask));
    expect(Array.from(makeState(2, 1).run.edgeMask)).not.toEqual(Array.from(makeState(2, 2).run.edgeMask));
    expect(nodeLabel(0, 0)).toBe('Node 1a'); expect(nodeLabel(3, 2)).toBe('Node 4c');
  });
});

describe('run: charge and Navigation input', () => {
  it('the charge grows DT/60 per tick to 1 and stays, seated or not; a Confirm edge on the ready tick jumps; after a jump the end-of-tick charge is 0', () => {
    const s = calm(); run(s, 1); expect(s.run.jumpCharge).toBeCloseTo(DT / JUMP_CHARGE_TIME, 12);
    run(s, JUMP_CHARGE_TIME * T - 2); expect(s.run.jumpCharge).toBeLessThan(1);
    const n = seatNavigator(s, 0); run(s, 1);                                            // the seating tick (sat this tick: no action)
    expect(s.run.jumpCharge).toBeCloseTo(1, 12); run(s, 5); expect(s.run.jumpCharge).toBe(1);
    const r = calm(); seatNavigator(r, 0); run(r, 1); run(r, JUMP_CHARGE_TIME * T - 1, () => intents({}, {}));   // 3599 ticks so far: charge just under 1
    expect(r.run.jumpCharge).toBeLessThan(1);
    run(r, 1, () => intents({ confirmPressed: true }, {}));                              // tick 3600 reaches 1 (jumpStep runs first) and the edge jumps
    expect(r.run.nodesReached).toBe(1); expect(r.run.jumpCharge).toBe(0);
    run(r, 1); expect(r.run.jumpCharge).toBeCloseTo(DT / JUMP_CHARGE_TIME, 12);
    void n;
  });
  it('reachable, cycling with wrap, Left/Right ignored, Confirm before ready does nothing, a held Confirm does not jump at readiness, stick edge before Confirm, the seating Confirm never jumps', () => {
    const s = calm(); setMap(s, [1, 3, 2, 2, 2, 2, 2, 1], { '0:0': 0b101, '1:0': 1, '1:1': 1, '1:2': 1, '2:0': 1, '2:1': 1, '3:0': 1, '3:1': 1, '4:0': 1, '4:1': 1, '5:0': 1, '5:1': 1, '6:0': 1, '6:1': 1 });
    expect(reachable(s)).toEqual([0, 2]);
    const n = seatNavigator(s, 0); run(s, 1);
    const d0 = s.rng.director.s;
    run(s, 1, () => intents({ moveY: 1 }, {})); expect(s.stations.cursor[n]).toBe(1);
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ moveY: 1 }, {})); expect(s.stations.cursor[n]).toBe(0);           // wraps
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ moveY: -1 }, {})); expect(s.stations.cursor[n]).toBe(1);          // Up wraps the other way
    run(s, 1, () => intents({ moveX: 1 }, {})); run(s, 1, () => intents({ moveX: -1 }, {})); expect(s.stations.cursor[n]).toBe(1);
    run(s, 1, () => intents({ confirmPressed: true }, {})); expect(s.run.nodesReached).toBe(0); expect(s.rng.director.s).toBe(d0);   // not ready
    chargeJump(s); run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect(s.run.nodesReached).toBe(1); expect(s.run.column).toBe(1); expect(s.run.node).toBe(2); expect(s.stations.cursor[n]).toBe(0);   // cursor 1 -> destination 2
    const h = calm(); setMap(h, [1, 3, 2, 2, 2, 2, 2, 1], { '0:0': 0b101, '1:0': 1, '1:1': 1, '1:2': 1, '2:0': 1, '2:1': 1, '3:0': 1, '3:1': 1, '4:0': 1, '4:1': 1, '5:0': 1, '5:1': 1, '6:0': 1, '6:1': 1 });
    seatNavigator(h, 0); run(h, 1); h.run.jumpCharge = 1 - 1.5 * DT / JUMP_CHARGE_TIME;
    run(h, 3, () => intents({ confirmHeld: true } as never, {}));                          // no confirmPressed edge: the dispatch only sends edges
    expect(h.run.nodesReached).toBe(0); expect(h.run.jumpCharge).toBe(1);
    run(h, 1, () => intents({ confirmPressed: true }, {})); expect(h.run.nodesReached).toBe(1);
    const e = calm(); setMap(e, [1, 3, 2, 2, 2, 2, 2, 1], { '0:0': 0b101, '1:0': 1, '1:1': 1, '1:2': 1, '2:0': 1, '2:1': 1, '3:0': 1, '3:1': 1, '4:0': 1, '4:1': 1, '5:0': 1, '5:1': 1, '6:0': 1, '6:1': 1 });
    const ne = seatNavigator(e, 0); run(e, 1); chargeJump(e);
    run(e, 1, () => intents({ moveY: 1, confirmPressed: true }, {})); expect(e.run.node).toBe(2);   // Down applied first, then Confirm: destination 2
    void ne;
    const seat = calm(); teleport(seat, 0, 2.5, 2.5); chargeJump(seat);
    run(seat, 1, () => intents({ confirmPressed: true }, {}));                           // the seating Confirm
    expect(Seated.station[seat.crew[0]!]).toBeGreaterThanOrEqual(0); expect(seat.run.nodesReached).toBe(0);
    const w = calm(); sitDown(w, 0, w.derived.stationOfKind[StationKind.Weapons]!); chargeJump(w); run(w, 2, () => intents({ confirmPressed: true }, {})); expect(w.run.nodesReached).toBe(0);
    const u = calm(); chargeJump(u); teleport(u, 0, 2.5, 9.5); run(u, 2, () => intents({ confirmPressed: true }, {})); expect(u.run.nodesReached).toBe(0);
  });
});

describe('run: the jump', () => {
  const loaded = () => {
    const s = calm(2); const A = room(s, 'A'), G = room(s, 'G');
    placeEnemy(s); placeShot(s, A, 600, 1); placeDebris(s, A, 600, 1); placeDebris(s, G, 900, 1); placeBoarder(s, G, 33);
    igniteRoom(s, A); activateBreach(s, 6); failStation(s, s.derived.stationOfKind[StationKind.Doors]!);
    s.hull = 61; Health.cur[s.crew[1]!] = 40; setSkill(s, 0, Skill.Repair, 2); s.weapons.charge = 0.7; s.weapons.torpedoLoaded = 1; s.weapons.selector = 2;
    const sci = s.derived.stationOfKind[StationKind.Science]!; sitDown(s, 1, sci); s.stations.cursor[sci] = 1; s.science.scanning = 1;
    const nav = seatNavigator(s, 0); s.run.jumpCharge = 1; s.director.stress = 0.42;
    return { s, nav, sci, A, G };
  };
  it('clears the encounter and keeps the ship: objects gone, cursors -1, scanning 0, enemy withdrawn (not destroyed) and re-armed, boarder kept, director in Build Up with stress kept, everything else untouched; two director draws with the enemy present, one without', () => {
    const { s, nav, sci, A, G } = loaded();
    const tick = s.tick, before = { stress: s.director.stress, boarderRoom: s.boarders.room[0], boarderHealth: s.boarders.health[0], boarderMove: s.boarders.nextMoveTick[0], boardArrival: s.boarders.nextArrivalTick, xp: s.skills.xp[Skill.Repair], hull: s.hull, h1: Health.cur[s.crew[1]!], charge: s.weapons.charge, loaded: s.weapons.torpedoLoaded, selector: s.weapons.selector, fire: s.rooms.fire[A], breach: s.breaches.active[6], failed: s.stations.failed[s.derived.stationOfKind[StationKind.Doors]!] };
    const dr = createRng(s.rng.director.s); nextFloat(dr); nextFloat(dr); const h0 = s.rng.hazards.s, c0 = s.rng.combat.s, m0 = s.rng.map.s;
    jumpShip(s);
    expect([s.run.column, s.run.nodesReached, s.run.jumpCharge, s.telemetry.jumps]).toEqual([1, 1, 0, 1]); expect(s.run.node).toBe(reachable({ ...s, run: { ...s.run, column: 0, node: 0 } } as typeof s)[0]); expect(s.stations.cursor[nav]).toBe(0);
    expect(Array.from(s.debris.active)).toEqual(new Array(DEBRIS_SLOTS).fill(0)); expect(s.stations.cursor[s.derived.stationOfKind[StationKind.Weapons]!]).toBe(-1); expect(s.stations.cursor[sci]).toBe(-1); expect(s.science.scanning).toBe(0);
    expect([s.enemy.present, s.telemetry.enemiesDestroyed, s.enemy.nextArrivalTick]).toEqual([0, 0, tick + ENCOUNTER_AFTER_JUMP * T]);
    expect([s.boarders.active[0], s.boarders.room[0], s.boarders.health[0], s.boarders.nextMoveTick[0], s.boarders.nextArrivalTick]).toEqual([1, before.boarderRoom, before.boarderHealth, before.boarderMove, before.boardArrival]);
    expect([s.director.phase, s.director.phaseTick, s.director.stress]).toEqual([Phase.BuildUp, tick, before.stress]);
    expect([s.hull, Health.cur[s.crew[1]!], s.skills.xp[Skill.Repair], s.weapons.charge, s.weapons.torpedoLoaded, s.weapons.selector, s.rooms.fire[A], s.breaches.active[6], s.stations.failed[s.derived.stationOfKind[StationKind.Doors]!]]).toEqual([before.hull, before.h1, before.xp, before.charge, before.loaded, before.selector, before.fire, before.breach, before.failed]);
    expect(Seated.station[s.crew[0]!]).toBe(nav); expect(Seated.station[s.crew[1]!]).toBe(sci);
    expect(s.rng.director.s).toBe(dr.s); expect([s.rng.hazards.s, s.rng.combat.s, s.rng.map.s]).toEqual([h0, c0, m0]);
    void G;
    const q = calm(2); const d1 = createRng(q.rng.director.s); nextFloat(d1); q.run.jumpCharge = 1; const t1 = q.tick;
    jumpShip(q); expect(q.rng.director.s).toBe(d1.s); expect(q.boarders.nextArrivalTick).toBe(t1 + BOARDING_AFTER_JUMP * T);
    const sc = calm(2); const k = placeDebris(sc, room(sc, 'A'), 600, 1); const c2 = sc.derived.stationOfKind[StationKind.Science]!; sitDown(sc, 1, c2); sc.stations.cursor[c2] = k; sc.science.scanning = 1; sc.run.jumpCharge = 1;
    jumpShip(sc); expect(sc.science.scanning).toBe(0);                                  // no enemy: scanning still cleared
  });
  it('persistence of the finer state: life, bleed and revive, stamps, oxygen and repair progress, doors, heat and coolant, torpedo loading and regeneration, boarder clocks', () => {
    const s = calm(2); const A = room(s, 'A'); downCrew(s, 1); Life.bleed[s.crew[1]!] = 12.5; Life.reviveProgress[s.crew[1]!] = 0.3; Life.reviverPid[s.crew[1]!] = 0;
    s.skills.lastEngChangeTick = 11; s.skills.lastDoorToggleTick = 22; s.skills.lsDeliveredTick = 33; s.skills.lastShotTick = 44;
    s.rooms.o2[A] = s.derived.volume[A]! * 0.4; s.rooms.fire[A] = 0.6; s.rooms.fireRepair[A] = 0.2; activateBreach(s, 6); s.breaches.repair[6] = 0.5;
    const doors = s.derived.stationOfKind[StationKind.Doors]!, wpn = s.derived.stationOfKind[StationKind.Weapons]!; failStation(s, doors); s.stations.repair[doors] = 0.7; s.stations.heat[wpn] = 120; s.stations.coolant[wpn] = 2;
    s.doors.state[0] = 2; s.doors.closeTimer[0] = 0.5; s.doors.sealRequested[0] = 1;
    s.weapons.torpedoStock = 4; s.weapons.torpedoLoad = 0.3; s.weapons.torpedoRegen = 0.4;
    const b = placeBoarder(s, room(s, 'G'), 33); s.boarders.nextMoveTick[b] = 777; s.boarders.aloneSince[b] = -2;
    const snap = () => JSON.stringify([Life.state[s.crew[1]!], Life.bleed[s.crew[1]!], Life.reviveProgress[s.crew[1]!], Life.reviverPid[s.crew[1]!], s.skills.lastEngChangeTick, s.skills.lastDoorToggleTick, s.skills.lsDeliveredTick, s.skills.lastShotTick, s.rooms.o2[A], s.rooms.fire[A], s.rooms.fireRepair[A], s.breaches.repair[6], s.stations.repair[doors], s.stations.heat[wpn], s.stations.coolant[wpn], s.doors.state[0], s.doors.closeTimer[0], s.doors.sealRequested[0], s.weapons.torpedoStock, s.weapons.torpedoLoad, s.weapons.torpedoRegen, s.boarders.nextMoveTick[b], s.boarders.aloneSince[b]]);
    const before = snap(); s.run.jumpCharge = 1; jumpShip(s); expect(snap()).toBe(before);
  });
  it('victory: from column 6 (nodesReached 6, jumps 6) a jump gives column 7, both counters 7, ended, Victory; crewSystem does not overwrite it; the next step is a no-op', () => {
    const s = calm(2); s.run.column = 6; s.run.node = 0; s.run.nodesReached = 6; s.telemetry.jumps = 6; s.run.jumpCharge = 1;
    jumpShip(s);
    expect([s.run.column, s.run.nodesReached, s.telemetry.jumps, s.ended, s.endReason]).toEqual([7, 7, 7, 1, EndReason.Victory]);
    const p = calm(2); p.run.column = 6; p.run.node = 0; p.run.nodesReached = 6; p.telemetry.jumps = 6; chargeJump(p);
    const nav = seatNavigator(p, 0); run(p, 1); teleport(p, 1, 2.5, 2.5); Health.cur[p.crew[0]!] = 0.05; placeBoarder(p, room(p, 'A'));   // a boarder in A will down the navigator later this tick
    run(p, 1, () => intents({ confirmPressed: true }, {}));
    expect(p.endReason).toBe(EndReason.Victory); expect(p.ended).toBe(1); expect(Life.state[p.crew[0]!]).toBe(LifeState.Downed); expect(p.telemetry.firstDownTick).toBe(p.tick - 1);
    const h = calm(2); h.run.column = 6; h.run.nodesReached = 6; h.telemetry.jumps = 6; chargeJump(h); seatNavigator(h, 0); run(h, 1); h.hull = 0;   // hull already 0 when the jump tick runs
    run(h, 1, () => intents({ confirmPressed: true }, {})); expect(h.endReason).toBe(EndReason.Victory);
    const t = h.tick; run(h, 3); expect(h.tick).toBe(t);
    void nav; void HULL_MAX;
  });
});
```

(The `confirmHeld` cast in the held-Confirm case: if `Intent` has no held-confirm field, drop that line and send three ticks of neutral intents instead; the point is that no Confirm **edge** is sent while the charge becomes ready. The `reachable({...})` expression for the destination is awkward: replace it with `expect(s.run.node).toBe(reachableBefore[0])` where `reachableBefore = reachable(s)` is captured before the call.)

Create `tests/gate-jump.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { step } from '../src/renderer/src/sim/step';
import { botIntent } from '../src/renderer/src/sim/bot';
import { confirmTarget, ConfirmKind } from '../src/renderer/src/sim/interact';
import { roomAt } from '../src/renderer/src/sim/grid';
import { EndReason } from '../src/renderer/src/sim/crew';
import { Position, Life, LifeState, Seated } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { TICK_HZ, RUN_COLUMNS, JUMP_CHARGE_TIME } from '../src/renderer/src/sim/tuning';
import { makeState, quiet, room, RECRUITS } from './helpers/sim';

describe('jump gate: a scripted navigator jumps the quiet ship through every column', () => {
  it('seed 1, two Recruits: seven jumps, victory, both alive, within 8 x (charge + 10) seconds', () => {
    const s = makeState(2, 1, RECRUITS); quiet(s); const silence = () => { s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; }; silence();
    const nav = s.derived.stationOfKind[StationKind.Navigation]!, A = room(s, 'A'), eid = s.crew[0]!;
    let seatedOnce = false, lastJumps = 0;
    for (let t = 0; t < 8 * (JUMP_CHARGE_TIME + 10) * TICK_HZ && !s.ended; t++) {
      let p0 = { ...NEUTRAL_INTENT };
      if (Seated.station[eid] === nav) { seatedOnce = true; p0 = { ...NEUTRAL_INTENT, confirmPressed: true }; }
      else { const c = confirmTarget(s, 0); const atConsole = roomAt(s, Position.x[eid]!, Position.y[eid]!) === A && c.kind === ConfirmKind.Console && c.index === nav; p0 = atConsole ? { ...NEUTRAL_INTENT, confirmPressed: true } : { ...NEUTRAL_INTENT, moveY: -1 }; }
      step(s, [p0, botIntent(s, 1)]);
      if (s.telemetry.jumps !== lastJumps) { lastJumps = s.telemetry.jumps; silence(); }
    }
    expect(seatedOnce).toBe(true);
    expect([s.telemetry.jumps, s.run.column, s.endReason]).toEqual([RUN_COLUMNS - 1, RUN_COLUMNS - 1, EndReason.Victory]);
    expect(s.crew.filter((e) => Life.state[e] === LifeState.Conscious).length).toBe(2);
    expect(s.tick).toBeLessThan(8 * (JUMP_CHARGE_TIME + 10) * TICK_HZ);
  });
});
```

`tests/snapshot.test.ts`: the version test moves from 11 to 12 (title, header, flattened). Add:

```ts
  it('round-trips the run block, the map stream and telemetry.jumps; each alone changes the hash', () => {
    const s = makeState(2, 5); s.run.column = 3; s.run.node = 2; s.run.nodesReached = 3; s.run.jumpCharge = 0.42; s.run.colNodes.set([1, 3, 2, 3, 2, 2, 3, 1]); s.run.edgeMask[4] = 5; s.telemetry.jumps = 3; s.rng.map.s = 123456;
    const t = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s))));
    expect([t.run.column, t.run.node, t.run.nodesReached, t.run.jumpCharge, t.telemetry.jumps, t.rng.map.s]).toEqual([3, 2, 3, 0.42, 3, 123456]);
    expect(Array.from(t.run.colNodes)).toEqual(Array.from(s.run.colNodes)); expect(Array.from(t.run.edgeMask)).toEqual(Array.from(s.run.edgeMask));
    expect(saveSnapshot(s).header.rngStates['map']).toBe(123456);
    const base = hashState(makeState(2, 5));
    const mutate = (f: (u: ReturnType<typeof makeState>) => void) => { const u = makeState(2, 5); f(u); return hashState(u); };
    for (const k of ['column', 'node', 'nodesReached', 'jumpCharge'] as const) expect(mutate((u) => { u.run[k] = 0.5; })).not.toBe(base);
    expect(mutate((u) => { u.run.colNodes[1] = 1; })).not.toBe(base); expect(mutate((u) => { u.run.edgeMask[0] ^= 1; })).not.toBe(base);
    expect(mutate((u) => { u.telemetry.jumps = 1; })).not.toBe(base); expect(mutate((u) => { u.rng.map.s = 1; })).not.toBe(base);
  });
  it('a run saved mid-charge with the cursor on the second destination continues to the same jump as the uninterrupted run', () => {
    const setup = (s: ReturnType<typeof makeState>) => { s.director.nextSpawnTick = 1e9; s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; setMap(s, [1, 2, 2, 2, 2, 2, 2, 1], { '0:0': 0b11, '1:0': 1, '1:1': 1, '2:0': 1, '2:1': 1, '3:0': 1, '3:1': 1, '4:0': 1, '4:1': 1, '5:0': 1, '5:1': 1, '6:0': 1, '6:1': 1 }); const n = seatNavigator(s, 0); run(s, 1); s.stations.cursor[n] = 1; s.run.jumpCharge = 0.9; return n; };
    const whole = makeState(2, 31), part = makeState(2, 31); const n = setup(whole); setup(part);
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(part))));
    expect(resumed.stations.cursor[n]).toBe(1); expect(resumed.run.jumpCharge).toBe(0.9);
    const drive = (s: ReturnType<typeof makeState>) => run(s, 0.1 * JUMP_CHARGE_TIME * TICK_HZ + 600, () => intents({ confirmPressed: true }, {}));
    drive(whole); drive(resumed);
    expect([resumed.run.column, resumed.run.node, resumed.run.nodesReached]).toEqual([1, 1, 1]);
    expect(hashState(resumed)).toBe(hashState(whole));
  });
```

(imports: `setMap, seatNavigator` from helpers, `JUMP_CHARGE_TIME` from tuning.)

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/run.test.ts tests/gate-jump.test.ts tests/snapshot.test.ts` → import errors (`run.ts` missing, `s.run` undefined, `rng.map` undefined).

- [ ] **Step 3: Tuning, state, flatten, crew**

`tuning.ts`: `SIM_VERSION = 13`; append:

```ts
// Sector map and jumps (Run-i)
export const RUN_COLUMNS = 8, EDGE_CHANCE = 0.5;                                   // node columns; chance of each candidate edge
export const JUMP_CHARGE_TIME = 60;                                                 // seconds from arrival to a ready drive
export const ENCOUNTER_AFTER_JUMP = 60, BOARDING_AFTER_JUMP = 120;                  // seconds after a jump before the enemy / a party can arrive (no draw)
```

`state.ts`: `RngStreams` gains `map: RngState`; `STREAM_NAMES = ['hazards', 'director', 'combat', 'loot', 'cosmetic', 'map'] as const`; the interface gains after `boarders`:

```ts
  /** The run (spec Run-i section 4): position on the node map, the score, the drive charge, and the map itself. */
  run: { column: number; node: number; nodesReached: number; jumpCharge: number; colNodes: Uint8Array; edgeMask: Uint8Array };
```

and `telemetry` gains `jumps: number`. In `createSimState`: `const rng = deriveStreams(seed);` before the literal, `rng,` in it, `jumps: 0` in telemetry, and after `boarders`: `run: { column: 0, node: 0, nodesReached: 0, jumpCharge: 0, ...generateMap(rng.map, RUN_COLUMNS) },` (import `generateMap` from `./run` and `RUN_COLUMNS`; `run.ts` must not import `state.ts` values, only its type, to avoid a cycle: it imports `type SimState` and the tuning constants).

`flatten.ts`: manifest `[..., 'boarders', 'run', 'science', ...]`; `TELEMETRY_SCALARS = 16`; `const RUN_FIELDS = 4 + 4 * RUN_COLUMNS;` in `size`; after the telemetry scalars `put(tm.jumps);`; after the boarders puts `const rn = s.run; put(rn.column); put(rn.node); put(rn.nodesReached); put(rn.jumpCharge); for (const v of rn.colNodes) put(v); for (const v of rn.edgeMask) put(v);`; `unflatten`: the telemetry key list gains `'jumps'`; after the boarders reads `s.run.column = get(); s.run.node = get(); s.run.nodesReached = get(); s.run.jumpCharge = get(); for (let k = 0; k < RUN_COLUMNS; k++) s.run.colNodes[k] = get(); for (let k = 0; k < RUN_COLUMNS * 3; k++) s.run.edgeMask[k] = get();` (import `RUN_COLUMNS`).

`crew.ts`: `EndReason = { None: 0, Hull: 1, Crew: 2, Victory: 3 }`; the two end lines become `if (!state.ended) { if (state.hull <= 0) { state.hull = 0; state.ended = 1; state.endReason = EndReason.Hull; } else if (state.playerCount > 0 && consciousCount(state) === 0) { state.ended = 1; state.endReason = EndReason.Crew; } }   // a victory set earlier this tick stands (spec Run-i section 6)` (keep `state.hull = 0` clamping outside if a 0 hull must still clamp with ended set: `if (state.hull <= 0) state.hull = 0;` first, then the guarded block).

- [ ] **Step 4: run.ts, debris.ts, console.ts, step.ts**

Create `src/renderer/src/sim/run.ts`:

```ts
import type { SimState } from './state';
import { nextFloat, nextInt, type RngState } from '../../../shared/rng';
import { StationKind } from './stationKinds';
import { Dir } from './dir';
import { clearObjects } from './debris';
import { leave } from './enemy';
import { activeBoarderCount } from './boarders';
import { enterPhase, Phase } from './director';
import { EndReason } from './crew';
import { TICK_HZ, DT, RUN_COLUMNS, EDGE_CHANCE, JUMP_CHARGE_TIME, ENCOUNTER_AFTER_JUMP, BOARDING_AFTER_JUMP } from './tuning';

/** The node map (spec Run-i section 5): nodes per column and, per node, a bitmask of the next column's reachable nodes. Draws only from the given stream, in a fixed order. */
export function generateMap(rng: RngState, columns: number): { colNodes: Uint8Array; edgeMask: Uint8Array } {
  const colNodes = new Uint8Array(columns), edgeMask = new Uint8Array(columns * 3);
  colNodes[0] = 1; colNodes[columns - 1] = 1;
  for (let c = 1; c < columns - 1; c++) colNodes[c] = 2 + nextInt(rng, 2);
  for (let c = 0; c < columns - 1; c++) {
    const next = colNodes[c + 1]!;
    for (let n = 0; n < colNodes[c]!; n++) {
      let mask = 0;
      for (let d = 0; d < next; d++) if (nextFloat(rng) < EDGE_CHANCE) mask |= 1 << d;
      if (mask === 0) mask = 1 << nextInt(rng, next);
      edgeMask[c * 3 + n] = mask;
    }
    for (let d = 0; d < next; d++) {
      let incoming = false;
      for (let n = 0; n < colNodes[c]!; n++) if (edgeMask[c * 3 + n]! & (1 << d)) incoming = true;
      if (!incoming) { const n = nextInt(rng, colNodes[c]!); edgeMask[c * 3 + n] = edgeMask[c * 3 + n]! | (1 << d); }
    }
  }
  return { colNodes, edgeMask };
}

export function nodeLabel(column: number, node: number): string { return `Node ${column + 1}${String.fromCharCode(97 + node)}`; }

/** Destination node indices in the next column, ascending; empty in the last column. */
export function reachable(state: SimState): number[] {
  const r = state.run, out: number[] = [];
  if (r.column >= RUN_COLUMNS - 1) return out;
  const mask = r.edgeMask[r.column * 3 + r.node]!, next = r.colNodes[r.column + 1]!;
  for (let d = 0; d < next; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

/** First system of the tick: the drive charges from arrival, whatever else happens (spec section 6). */
export function jumpStep(state: SimState): void { state.run.jumpCharge = Math.min(1, state.run.jumpCharge + DT / JUMP_CHARGE_TIME); }

/** Seated Navigation input: Up/Down cycle the destinations, a Confirm edge with a ready drive jumps (spec section 6). */
export function navigationInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  const list = reachable(state), c = state.stations.cursor, n = list.length;
  if (!n) { c[i] = 0; return; }
  if (c[i]! >= n) c[i] = 0;
  if (dir === Dir.Up) c[i] = (c[i]! + n - 1) % n; else if (dir === Dir.Down) c[i] = (c[i]! + 1) % n;
  if (confirm && state.run.jumpCharge >= 1) jumpShip(state);
}

/** The jump (spec section 6): leave the encounter, keep the ship, re-arm the clocks, maybe win. */
export function jumpShip(state: SimState): void {
  const r = state.run, list = reachable(state), nav = state.derived.stationOfKind[StationKind.Navigation]!;
  if (!list.length) return;
  const cursor = nav >= 0 ? Math.min(state.stations.cursor[nav]!, list.length - 1) : 0;
  r.node = list[Math.max(0, cursor)]!; r.column += 1; r.nodesReached += 1; r.jumpCharge = 0;
  if (nav >= 0) state.stations.cursor[nav] = 0;
  state.telemetry.jumps++;
  clearObjects(state);
  if (state.enemy.present) leave(state, false);
  state.enemy.nextArrivalTick = state.tick + ENCOUNTER_AFTER_JUMP * TICK_HZ;
  if (activeBoarderCount(state) === 0) state.boarders.nextArrivalTick = state.tick + BOARDING_AFTER_JUMP * TICK_HZ;
  enterPhase(state, Phase.BuildUp);
  if (r.column === RUN_COLUMNS - 1) { state.ended = 1; state.endReason = EndReason.Victory; }
}
```

(Check for cycles: `run.ts` imports `debris`, `enemy`, `boarders`, `director`, `crew`; `state.ts` imports `run.ts` for `generateMap` and already imports `director.ts`; none of those import `run.ts`. `console.ts` imports `run.ts`; `run.ts` does not import `console.ts` or `step.ts`.)

`debris.ts`: `export function clearObjects(state: SimState): void { for (let k = 0; k < state.debris.active.length; k++) if (state.debris.active[k]) removeDebris(state, k); state.science.scanning = 0; }   // the jump leaves every object behind (spec Run-i section 6)`.

`console.ts`: import `navigationInput` from `./run`; add `else if (kind === StationKind.Navigation) navigationInput(state, i, dir, it.confirmPressed);` and update the trailing comment to "Life Support, Medbay: no seated controls."

`step.ts`: import `jumpStep` from `./run`; after the scratch clear line add `jumpStep(state);   // (0) the jump drive charges first, so a Confirm on the ready tick jumps (spec Run-i section 6)`.

- [ ] **Step 5: Run, gates, re-bless, full suite**

Fill the three stream pins in `run.test.ts` from Step 0. `npx vitest run tests/run.test.ts tests/snapshot.test.ts tests/console.test.ts tests/crew.test.ts tests/boundary.test.ts` → PASS (fix fixture arithmetic only where you can state why the plan was wrong; record it). Then the gates before the re-bless: `npx vitest run tests/gate-jump.test.ts tests/gate-survival.test.ts tests/gate-boarding.test.ts` with the temporary `console.log(figures)`; the survival and boarding lines must equal Step 0's (if not, a stream shifted: investigate before anything else; the levers are for a genuinely failing seed only). If the jump gate fails because the walking script never reaches the console, print the navigator's position per second and adjust the script (not the sim) and say so. Then `npm run bless` (cause: SIM_VERSION 13, the map stream and the run block are hashed; the scripted replay never sits at Navigation), `npm test`, `npm run typecheck`, `npm run build` → pass. (`tests/hud.test.ts`, `tests/session.test.ts`, telemetry and acceptance tests are untouched here and must still pass: the HUD and record changes are Task 2.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/run.ts src/renderer/src/sim/state.ts src/renderer/src/sim/flatten.ts src/renderer/src/sim/tuning.ts src/renderer/src/sim/step.ts src/renderer/src/sim/console.ts src/renderer/src/sim/crew.ts src/renderer/src/sim/debris.ts tests/run.test.ts tests/gate-jump.test.ts tests/snapshot.test.ts tests/helpers/sim.ts tests/golden/basic.json
git commit -m "feat: a seeded sector map and the run block; the drive charges from arrival; the Navigation operator picks a destination and jumps, leaving the encounter and keeping the ship; the last column is a victory; SIM_VERSION 13 (golden re-blessed: the map stream and run block are hashed)"
```

---

### Task 2: HUD, session banner, record and table

**Files:**
- Modify: `src/renderer/src/render/hudModel.ts`, `src/renderer/src/render/hud.ts`, `src/renderer/src/app/session.ts`, `src/renderer/src/sim/telemetry.ts`, `src/renderer/src/sim/acceptance.ts`, `tests/hud.test.ts`, `tests/session.test.ts`, `tests/telemetry.test.ts`, `tests/acceptance.test.ts`

**Interfaces:**
- Produces: `HudModel.run`, `clockLine(m)`, `navigationFooter(p)`, the extended `NavigationPanel`, the headline node count; the session's `VICTORY` banner; `TelemetryRecord.endReason` incl. `'victory'` and `run: { nodesReached, jumps, columns }`; the `nodes` column.

- [ ] **Step 1: Write the failing tests**

`tests/hud.test.ts`: the three **existing** exact headline expectations (the `Survived 7:32  HULL LOST` and `CREW LOST` strings and the four-player `Survived 0:00  HULL LOST`) gain the suffix `  Reached node 1 of 8`, or the suite fails. Then append (imports: `clockLine, navigationFooter` from hudModel; `setMap, seatNavigator, chargeJump` from helpers; `RUN_COLUMNS, EVADE_BASE, EVADE_SCALE` from tuning; `stationOutput` from stations; `EndReason` already imported):

```ts
  it('the clock line carries the node ordinal; the Navigation panel lists destinations, cursor, jump state and final; the footer formats', () => {
    const s = makeState(2); quiet(s);
    expect(clockLine(buildHudModel(s, slots(2), 'running', ''))).toBe('HULL 100   TIME 0s   node 1/8'); expect(clockLine(buildHudModel(null, slots(1), 'lobby', ''))).toMatch(/node 1\/8$/);
    s.run.column = 3; expect(clockLine(buildHudModel(s, slots(2), 'running', ''))).toMatch(/node 4\/8$/);
    s.run.column = 0; setMap(s, [1, 2, 2, 2, 2, 2, 2, 1], { '0:0': 0b11, '1:0': 1, '1:1': 1, '2:0': 1, '2:1': 1, '3:0': 1, '3:1': 1, '4:0': 1, '4:1': 1, '5:0': 1, '5:1': 1, '6:0': 1, '6:1': 1 });
    const n = seatNavigator(s, 0); s.stations.cursor[n] = 1; s.run.jumpCharge = 0.64;
    const p = buildHudModel(s, slots(2), 'running', '').players[0]!.console as NavigationPanel;
    const evade = `Evade ${Math.round((EVADE_BASE + EVADE_SCALE * stationOutput(s, n)) * 100)}%`;
    expect(p.here).toBe('Node 1a'); expect(p.destinations).toEqual(['Node 2a', 'Node 2b']); expect(p.cursor).toBe(1); expect(p.jump).toEqual({ charge: 0.64, ready: false }); expect(p.final).toBe(false);
    expect(navigationFooter(p)).toBe(`${evade}   Jump 64%`);
    chargeJump(s); expect(navigationFooter(buildHudModel(s, slots(2), 'running', '').players[0]!.console as NavigationPanel)).toBe(`${evade}   Jump READY`);
    s.run.column = RUN_COLUMNS - 1; const f = buildHudModel(s, slots(2), 'running', '').players[0]!.console as NavigationPanel;
    expect(f.final).toBe(true); expect(f.destinations).toEqual([]); expect(navigationFooter(f)).toBe(`${evade}   Jump -`);
  });
  it('the game-over headline counts the node and names a victory', () => {
    const s = makeState(2, 1, DEFAULT_CHARACTERS); s.tick = 452 * 60; s.ended = 1; s.endReason = EndReason.Hull;
    expect(buildHudModel(s, slots(2), 'gameover', '').summary![0]).toBe('Survived 7:32  HULL LOST  Reached node 1 of 8');
    s.endReason = EndReason.Victory; s.run.column = 7; s.run.nodesReached = 7;
    expect(buildHudModel(s, slots(2), 'gameover', '').summary![0]).toBe('Survived 7:32  VICTORY  Reached node 8 of 8');
  });
```

`tests/session.test.ts`: add (imports: `seatNavigator, chargeJump` from helpers; `EndReason` from crew):

```ts
  it('a victory ends the run with the VICTORY banner and one record with endReason victory', () => {
    const h = harness();
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release();
    const st = h.session.state!; st.run.column = 6; st.run.node = 0; st.run.nodesReached = 6; st.telemetry.jumps = 6; seatNavigator(st, 0); h.frames(2); chargeJump(st);
    h.press('a', { confirm: true }); h.frames(2); h.release(); h.frames(2);
    expect(h.session.phase).toBe('gameover'); expect(st.endReason).toBe(EndReason.Victory);
    expect(h.last().message).toMatch(/^VICTORY after \d+s\./);
    expect(h.records).toHaveLength(1); expect(h.records[0]).toMatchObject({ endReason: 'victory', run: { nodesReached: 7, jumps: 7, columns: 8 } });
  });
```

`tests/telemetry.test.ts`: the exact-record fixture sets `s.run.nodesReached = 3; t.jumps = 3;` and expects `run: { nodesReached: 3, jumps: 3, columns: 8 }` after `boarders`; add `s.ended = 1; s.endReason = EndReason.Victory; expect(telemetryRecord(s, 9).endReason).toBe('victory');` beside the existing hull/crew/running cases (import `EndReason`). `tests/acceptance.test.ts`: `rec()` gains `run: { nodesReached: 0, jumps: 0, columns: 8 }`; the header regex ends `boarders\s+nodes$`; the first row's tail `0\/0$` → `0\/0\s+0\/8$`, the second `1\/2$` → `1\/2\s+0\/8$`; add a third record `rec(2, 7, { endReason: 'victory', durationSeconds: 480, run: { nodesReached: 3, jumps: 3, columns: 8 } })` and assert its line matches `/^2\s+7\s+8:00\s+victory\s+/` and `/3\/8$/` (the table now has four lines).

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/hud.test.ts tests/session.test.ts tests/telemetry.test.ts tests/acceptance.test.ts` → missing `clockLine`/`navigationFooter`, missing panel fields, old banner, missing `run` on the record.

- [ ] **Step 3: hudModel.ts, hud.ts, session.ts, telemetry.ts, acceptance.ts**

`hudModel.ts` (imports: `reachable, nodeLabel` from `../sim/run`; `RUN_COLUMNS` from tuning):

```ts
export interface NavigationPanel { kind: 'navigation'; evadeChance: number; jump: { charge: number; ready: boolean }; here: string; destinations: string[]; cursor: number; final: boolean }
// HudModel gains: run: { column: number; columns: number };
export function clockLine(m: HudModel): string { return `HULL ${Math.round(m.hull)}   TIME ${m.simSeconds}s   node ${m.run.column + 1}/${m.run.columns}`; }
export function navigationFooter(p: NavigationPanel): string { return `Evade ${Math.round(p.evadeChance * 100)}%   Jump ${p.final ? '-' : p.jump.ready ? 'READY' : `${Math.floor(p.jump.charge * 100)}%`}`; }
```

`consolePanel` Navigation branch: `const r = state.run, list = reachable(state); return { kind: 'navigation', evadeChance: EVADE_BASE + EVADE_SCALE * stationOutput(state, i), jump: { charge: r.jumpCharge, ready: r.jumpCharge >= 1 }, here: nodeLabel(r.column, r.node), destinations: list.map((d) => nodeLabel(r.column + 1, d)), cursor: Math.min(state.stations.cursor[i]!, Math.max(0, list.length - 1)), final: r.column === RUN_COLUMNS - 1 };`. The returned model gains `run: state ? { column: state.run.column, columns: RUN_COLUMNS } : { column: 0, columns: RUN_COLUMNS }`. `headlineSummary`'s first line: `` `Survived ${clock(state.tick / TICK_HZ)}  ${state.endReason === EndReason.Hull ? 'HULL LOST' : state.endReason === EndReason.Victory ? 'VICTORY' : 'CREW LOST'}  Reached node ${state.run.nodesReached + 1} of ${RUN_COLUMNS}` `` (the spec's data source; equal to `column + 1` by the invariant).

`hud.ts`: `top.text = clockLine(m)` (import `clockLine, navigationFooter`); the Navigation branch: `const c = p.console; ui.consoleRows.forEach((r, k) => { const d = c.destinations[k]; r.root.visible = !!d; if (d) r.set({ name: d, level: 0, max: 0, status: '', cursor: k === c.cursor, tint: k === c.cursor ? TEXT : DIM }); }); fillRow(ui.consoleFooter, [{ text: navigationFooter(c), tint: TEXT }]);` (this branch must test `p.console.kind === 'navigation'` explicitly; today it is the `'kind' in p.console` fallthrough).

`session.ts`: the message's end word: `state.endReason === EndReason.Hull ? 'HULL LOST' : state.endReason === EndReason.Victory ? 'VICTORY' : 'CREW LOST'`.

`telemetry.ts` (add `RUN_COLUMNS` to its tuning import): `endReason: 'hull' | 'crew' | 'victory' | 'running'`; the mapping `state.ended ? (state.endReason === EndReason.Hull ? 'hull' : state.endReason === EndReason.Victory ? 'victory' : 'crew') : 'running'`; `TelemetryRecord` gains `run: { nodesReached: number; jumps: number; columns: number }` after `boarders`; the builder adds `run: { nodesReached: state.run.nodesReached, jumps: t.jumps, columns: RUN_COLUMNS }`. `acceptance.ts`: `COLUMNS` gains `'nodes'` last; `row` pushes `` `${r.run.nodesReached}/${r.run.columns}` ``.

- [ ] **Step 4: Run and full suite**

`npx vitest run tests/hud.test.ts tests/session.test.ts tests/telemetry.test.ts tests/acceptance.test.ts tests/render.test.ts tests/renderPure.test.ts` → PASS (the render tests do not construct the HUD; `hud.ts`'s destination rows, cursor highlight, row hiding, last-column rendering and `top.text` wiring are covered by the formatters' unit tests and the manual gate, as every earlier HUD change has been; note this in the report). `npm test`, `npm run typecheck`, `npm run build` → pass; golden unchanged; `npm run acceptance 1 1` → three rows ending `0/8`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/render/hudModel.ts src/renderer/src/render/hud.ts src/renderer/src/app/session.ts src/renderer/src/sim/telemetry.ts src/renderer/src/sim/acceptance.ts tests/hud.test.ts tests/session.test.ts tests/telemetry.test.ts tests/acceptance.test.ts
git commit -m "feat: the clock shows the node, the Navigation panel lists destinations with the jump charge, the headline and banner name a victory; the record and the acceptance table carry nodes reached"
```

---

### Task 3: Gate, spec amendments, roadmap

**Files:**
- Modify: `docs/gates.md`, `docs/superpowers/specs/2026-11-11-sector-map-design.md`, `docs/roadmap.md`

- [ ] **Step 1: Gate section**

Run `npm run acceptance 5 1` and keep its three rows. Append to `docs/gates.md` the spec's §10 section with every automated entry **checked only now**, recording: the survival and boarding baseline and after-figures (identical, or the levers), the jump gate's sim time, the golden hash, and the dated acceptance rows in a code block; the manual row unchecked.

- [ ] **Step 2: Spec amendments and roadmap**

Append `## 12. Amendments from the plan` to the spec with: `nodeLabel` in `run.ts`, the formatters in `hudModel.ts`; `jumpShip` reading the Navigation cursor; `clearObjects` clearing `scanning`; the three pre-feature stream pins; any fixture arithmetic corrected. `docs/roadmap.md`: item 8 → `in review`, item 9 → `next`.

- [ ] **Step 3: Verify and commit**

`npm run typecheck`, `npm test`, `npm run build` → pass.

```bash
git add docs/gates.md docs/superpowers/specs/2026-11-11-sector-map-design.md docs/roadmap.md
git commit -m "docs: Run-i gate with the survival and boarding figures, the jump gate and the five-minute acceptance rows, spec amendments, roadmap status"
```
