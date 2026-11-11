# Telemetry and Acceptance (Increment 4-ii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every run measurable: authoritative telemetry counters in `SimState`, a pure `telemetryRecord`, a capped `localStorage` history, four headline lines on the game-over screen, and a headless `npm run acceptance` soak, per `docs/superpowers/specs/2026-11-10-telemetry-design.md`.

**Architecture:** `state.telemetry` is filled by the systems that own each event (director, debris, weapons, interact) and by `telemetrySystem`, the last system in `step()`; `sim/telemetry.ts` owns the system, the record type and `telemetryRecord`; `sim/acceptance.ts` owns the headless runner, the text table and the CLI orchestration (all injectable, all pure); `app/telemetryStore.ts` owns the `localStorage` append with recovery; `app/session.ts` calls `deps.saveTelemetry` once on the ending tick; `render/hudModel.ts` prepends four headline lines to the game-over summary and `render/hud.ts` allocates eight summary rows.

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), tsx for the script, Pixi 8.19 (render task only). No new dependencies.

## Spec amendments made by this plan (recorded in Task 4)

- The telemetry block has **ten** scalars, not nine (the spec miscounted): `firstDownTick, firstDownPid, firstDeathTick, firstDeathPid, impacts, evadeRolls, evasions, shots, hits, maxStress`, in that order, then the arrays `mannedTicks[7], idleRun[players], longestIdle[players], prevLife[players], spawns[4], repairs[3], phaseEntries[4]`.
- The "layout missing a station kind" fixture sets `state.derived.stationOfKind[kind] = -1` on a starter state, because `parseShip` requires exactly one station per kind.
- `Array.from(typedArray, fn)` returns a plain array, so the record's `longestIdleSeconds` is built that way (the spec did not say how).

## Global Constraints

- `tests/boundary.test.ts` stays green: `sim/` imports nothing from render/, input/, app/, pixi, electron; no `Math.random`, `Date`, `performance.now`, `Math.pow`, `window`, `document` in sim files. `sim/bot.ts` and `sim/acceptance.ts` are inside `sim/` and must obey this (they import only sim and shared modules).
- Every test runs under node; no test imports pixi; `hudModel.ts` stays pixi-free.
- Determinism: telemetry adds **no RNG draws** anywhere. The counters are flattened in a `telemetry` manifest section right after `director`, snapshotted and hashed. `SIM_VERSION = 9`; version-8 snapshots rejected.
- `telemetrySystem` runs after `crewSystem` and before `state.tick++`; it runs on the ending tick; `step()` still returns at once when `state.ended`.
- Counting rules (exact, spec §5): `mannedTicks[kind] += 1` for every station with `occupant >= 0 && stationOnline`; a player is active when `(Seated.station >= 0 && stationOnline(that station)) || scratch.activeThisTick[pid]`; active → `idleRun = 0`, else `idleRun += 1` and `longestIdle = max`; life edges in pid order set `firstDownTick/Pid` and `firstDeathTick/Pid` once (lower pid wins a same-tick tie); `prevLife = life` afterwards. `scratch.activeThisTick` is set for any repair-progress holder and for the arbitrated reviver (including the completion tick), and cleared at the top of `step()`.
- Event increments: `spawns[type]` on a successful `attemptSpawn`; `phaseEntries[phase]` in `enterPhase`; `maxStress` in `updateStress`; `evadeRolls` on a Navigation roll, `evasions` on an evaded roll, `impacts` when the hull takes damage; `shots` once beside `lastShotTick` (after a readiness check passed), `hits` inside the hit branch before `removeDebris`; `repairs[0|1|2]` (fire, breach, power) at the completing call.
- Seconds: `durationSeconds(ticks) = round1(ticks / TICK_HZ)`; `eventSeconds(tick) = round1((tick + 1) / TICK_HZ)`; `round1(x) = Math.round(x * 10) / 10`.
- Tuning (exact): `SIM_VERSION = 9`, `TELEMETRY_KEEP = 50`, `ACCEPTANCE_MINUTES = 20`.
- Storage key `'ftlite-telemetry'`; a missing key, unparsable JSON or a non-array root counts as an empty history; keep the newest `keep` records; `getItem`/`setItem` throwing is swallowed.
- Commit messages: imperative, prefixed `feat:`, `test:`, `chore:` or `docs:`, ending with the attribution line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. `npm run typecheck`, `npm test` and `npm run build` pass at the end of every task.
- Golden replay: re-blessed **once**, in Task 1 (`npm run bless`), with the cause recorded in the commit message. Tasks 2 and 3 change no sim behaviour and must leave `tests/golden/basic.json` untouched.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/telemetry.ts` (new) | `telemetrySystem`, `TelemetryRecord`, `telemetryRecord`, `durationSeconds`, `eventSeconds`, `REPAIR_FIRE/BREACH/POWER` indices. |
| `src/renderer/src/sim/{state,flatten,tuning,step}.ts` | the `telemetry` block, manifest section, `SIM_VERSION 9`, the system call and the scratch clear. |
| `src/renderer/src/sim/{interact,director,debris,weapons}.ts` | event increments. |
| `src/renderer/src/sim/bot.ts` (moved from `tests/helpers/bot.ts`) | the acceptance crew; `tests/helpers/bot.ts` re-exports it. |
| `src/renderer/src/sim/acceptance.ts` (new), `scripts/acceptance.ts` (new) | `runAcceptance`, `acceptanceTable`, `runAcceptanceCli`; the CLI entry. |
| `src/renderer/src/app/telemetryStore.ts` (new), `app/session.ts`, `main.ts` | `appendTelemetry`; `saveTelemetry` dependency and wiring. |
| `src/renderer/src/render/{hudModel,hud}.ts` | headline lines; eight summary rows. |
| `tests/telemetry.test.ts`, `tests/acceptance.test.ts`, `tests/telemetryStore.test.ts` (new); `tests/{snapshot,session,hud}.test.ts` | as the tasks say. |
| `docs/gates.md`, the spec, `docs/roadmap.md` | Task 4. |

---

### Task 1: Telemetry state, the per-tick system, event counters, snapshot coverage

**Files:**
- Create: `src/renderer/src/sim/telemetry.ts`, `tests/telemetry.test.ts`
- Modify: `src/renderer/src/sim/state.ts`, `src/renderer/src/sim/flatten.ts`, `src/renderer/src/sim/tuning.ts`, `src/renderer/src/sim/step.ts`, `src/renderer/src/sim/interact.ts`, `src/renderer/src/sim/director.ts`, `src/renderer/src/sim/debris.ts`, `src/renderer/src/sim/weapons.ts`, `tests/snapshot.test.ts`, `tests/golden/basic.json` (re-bless)

**Interfaces:**
- Produces: `SimState.telemetry` (the block below), `SimState.scratch.activeThisTick: Uint8Array`, `telemetrySystem(state)`, `REPAIR_FIRE = 0, REPAIR_BREACH = 1, REPAIR_POWER = 2` exported from `telemetry.ts`. `telemetryRecord` comes in Task 2.

- [ ] **Step 1: Write the failing tests**

Create `tests/telemetry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { telemetrySystem } from '../src/renderer/src/sim/telemetry';
import { step } from '../src/renderer/src/sim/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { failStation } from '../src/renderer/src/sim/power';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { downCrew } from '../src/renderer/src/sim/crew';
import { debrisSystem } from '../src/renderer/src/sim/debris';
import { fireWeapon, beamHits, Weapon } from '../src/renderer/src/sim/weapons';
import { stationOutput } from '../src/renderer/src/sim/stations';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Phase, HazardType, enterPhase, updateStress, directorSystem } from '../src/renderer/src/sim/director';
import { DEBRIS_CREW_DAMAGE, REPAIR_TIME_FIRE, REPAIR_TIME_BREACH, REPAIR_TIME_POWER, REVIVE_TIME, DT } from '../src/renderer/src/sim/tuning';
import { makeState, run, intents, teleport, placeDebris, room, seconds, quiet, armSpawn } from './helpers/sim';
import { createRng, nextFloat } from '../src/shared/rng';
import { NEUTRAL_INTENT } from '../src/shared/intent';

const nav = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Navigation]!;
const wpn = (s: ReturnType<typeof makeState>) => s.derived.stationOfKind[StationKind.Weapons]!;
const hold = { interactHeld: true };

describe('telemetry: initial values', () => {
  it('a fresh state has -1 ticks and pids, zero counters, Conscious prevLife and one Build Up entry', () => {
    const t = makeState(2).telemetry;
    expect([t.firstDownTick, t.firstDownPid, t.firstDeathTick, t.firstDeathPid]).toEqual([-1, -1, -1, -1]);
    expect([t.impacts, t.evadeRolls, t.evasions, t.shots, t.hits, t.maxStress]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(Array.from(t.mannedTicks)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(t.idleRun)).toEqual([0, 0]); expect(Array.from(t.longestIdle)).toEqual([0, 0]);
    expect(Array.from(t.prevLife)).toEqual([LifeState.Conscious, LifeState.Conscious]);
    expect(Array.from(t.spawns)).toEqual([0, 0, 0, 0]); expect(Array.from(t.repairs)).toEqual([0, 0, 0]);
    expect(Array.from(t.phaseEntries)).toEqual([1, 0, 0, 0]);
  });
});

describe('telemetry: manned ticks and idle streaks', () => {
  it('mannedTicks counts only an occupant at an online station; a failed station with a stale occupant byte does not count', () => {
    const s = makeState(1); quiet(s); const n = nav(s);
    run(s, 5);
    expect(s.telemetry.mannedTicks[StationKind.Navigation]).toBe(0);
    sitDown(s, 0, n); run(s, 10);
    expect(s.telemetry.mannedTicks[StationKind.Navigation]).toBe(10);
    s.stations.failed[n] = 1; s.stations.occupant[n] = 0;      // stale occupant byte on a failed station
    telemetrySystem(s);
    expect(s.telemetry.mannedTicks[StationKind.Navigation]).toBe(10);
  });
  it('idleRun counts walking and standing, resets on a seated tick, and longestIdle keeps the maximum streak', () => {
    const s = makeState(1); quiet(s); const n = nav(s);
    run(s, 30, () => intents({ moveX: 1 }));                      // walking is idle
    expect(s.telemetry.idleRun[0]).toBe(30); expect(s.telemetry.longestIdle[0]).toBe(30);
    sitDown(s, 0, n); run(s, 1);
    expect(s.telemetry.idleRun[0]).toBe(0); expect(s.telemetry.longestIdle[0]).toBe(30);
    run(s, 1, () => intents({ cancelPressed: true })); run(s, 49);  // stood: 50 idle ticks
    expect(s.telemetry.idleRun[0]).toBe(50); expect(s.telemetry.longestIdle[0]).toBe(50);
    sitDown(s, 0, n); run(s, 1); run(s, 1, () => intents({ cancelPressed: true })); run(s, 9);
    expect(s.telemetry.longestIdle[0]).toBe(50);                   // a shorter streak does not lower it
  });
  it('a repair tick is active; a revive tick is active for the reviver only; Downed and Dead ticks are idle', () => {
    const s = makeState(2); quiet(s); const G = room(s, 'G');
    igniteRoom(s, G); teleport(s, 0, 2.5, 9.5); teleport(s, 1, 3.5, 9.5);
    run(s, 10, () => intents(hold, {}));
    expect(s.telemetry.idleRun[0]).toBe(0); expect(s.telemetry.idleRun[1]).toBe(10);
    const r = makeState(2); quiet(r);
    downCrew(r, 1); teleport(r, 0, 2.5, 9.5); teleport(r, 1, 2.5, 9.5);
    run(r, 5, () => intents(hold, {}));
    expect(r.telemetry.idleRun[0]).toBe(0); expect(r.telemetry.idleRun[1]).toBe(5);   // Downed is idle even while being revived
    const third = makeState(3); quiet(third);
    downCrew(third, 2); teleport(third, 0, 2.5, 9.5); teleport(third, 1, 2.5, 9.5); teleport(third, 2, 2.5, 9.5);
    run(third, 5, () => intents(hold, hold, {}));
    expect(third.telemetry.idleRun[0]).toBe(0); expect(third.telemetry.idleRun[1]).toBe(5);   // pid 1 also holds Interact but is not the arbitrated reviver
    const d = makeState(1); quiet(d); downCrew(d, 0); Life.bleed[d.crew[0]!] = 100; d.playerCount = 1;
    telemetrySystem(d); telemetrySystem(d);
    expect(d.telemetry.idleRun[0]).toBe(2);
  });
  it('the revive completion tick counts as active for the reviver', () => {
    const s = makeState(2); quiet(s);
    downCrew(s, 1); teleport(s, 0, 2.5, 9.5); teleport(s, 1, 2.5, 9.5);
    Life.reviveProgress[s.crew[1]!] = 1 - DT / REVIVE_TIME / 2;     // completes on the next progress tick
    run(s, 1, () => intents(hold, {}));
    expect(Life.state[s.crew[1]!]).toBe(LifeState.Conscious); expect(s.telemetry.idleRun[0]).toBe(0);
  });
  it('mixed case: a crew member who adds repair progress and is downed by debris in the same tick is active that tick and idle the next', () => {
    const s = makeState(1); quiet(s); const G = room(s, 'G');
    igniteRoom(s, G); teleport(s, 0, 2.5, 9.5); Health.cur[s.crew[0]!] = DEBRIS_CREW_DAMAGE;
    placeDebris(s, G, 0);                                            // impacts this tick; nobody at Navigation so no roll
    run(s, 1, () => intents(hold));
    expect(Life.state[s.crew[0]!]).toBe(LifeState.Downed);
    expect(s.telemetry.idleRun[0]).toBe(0); expect(s.telemetry.firstDownTick).toBe(0); expect(s.telemetry.firstDownPid).toBe(0);
    expect(s.ended).toBe(1);                                         // solo: the run ended on that tick
    run(s, 1);                                                       // step returns early: nothing changes
    expect(s.telemetry.idleRun[0]).toBe(0);
    const two = makeState(2); quiet(two); const G2 = room(two, 'G');
    igniteRoom(two, G2); teleport(two, 0, 2.5, 9.5); Health.cur[two.crew[0]!] = DEBRIS_CREW_DAMAGE; placeDebris(two, G2, 0);
    run(two, 1, () => intents(hold, {})); run(two, 1);
    expect(two.telemetry.idleRun[0]).toBe(1);                        // the tick after the downing is idle
  });
});

describe('telemetry: first down and first death', () => {
  it('records the transition tick and pid once; a later crew member does not overwrite it; the lower pid wins a same-tick tie', () => {
    const s = makeState(3); quiet(s);
    run(s, 10);
    downCrew(s, 2); run(s, 1);
    expect([s.telemetry.firstDownTick, s.telemetry.firstDownPid]).toEqual([10, 2]);
    downCrew(s, 0); run(s, 1);
    expect([s.telemetry.firstDownTick, s.telemetry.firstDownPid]).toEqual([10, 2]);
    Life.bleed[s.crew[2]!] = DT / 2; run(s, 1);                       // pid 2 bleeds out this tick
    expect([s.telemetry.firstDeathTick, s.telemetry.firstDeathPid]).toEqual([12, 2]);
    Life.bleed[s.crew[0]!] = DT / 2; run(s, 1);
    expect([s.telemetry.firstDeathTick, s.telemetry.firstDeathPid]).toEqual([12, 2]);
    const tie = makeState(3); quiet(tie); run(tie, 4);
    downCrew(tie, 2); downCrew(tie, 1); run(tie, 1);
    expect([tie.telemetry.firstDownTick, tie.telemetry.firstDownPid]).toEqual([4, 1]);
  });
  it('ending-tick capture through step(): a solo downing ends the run on that tick and later steps leave every field unchanged', () => {
    const s = makeState(1); quiet(s); run(s, 7);
    downCrew(s, 0); run(s, 1);
    expect(s.ended).toBe(1); expect([s.telemetry.firstDownTick, s.telemetry.firstDownPid]).toEqual([7, 0]); expect(s.telemetry.idleRun[0]).toBe(8);
    const before = JSON.stringify(s.telemetry, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Int32Array) : v));
    run(s, 3);
    expect(JSON.stringify(s.telemetry, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Int32Array) : v))).toBe(before);
  });
  it('a seated operator downed on the ending tick is not manning that tick (final-state sample) while the roll it made is counted', () => {
    const s = makeState(1); quiet(s); const n = nav(s), A = room(s, 'A');
    sitDown(s, 0, n); run(s, 3);
    expect(s.telemetry.mannedTicks[StationKind.Navigation]).toBe(3);
    Health.cur[s.crew[0]!] = DEBRIS_CREW_DAMAGE; s.rng.combat.s = 4;   // first draw 0.924: not evaded
    placeDebris(s, A, 0); run(s, 1);
    expect(s.ended).toBe(1); expect(Life.state[s.crew[0]!]).toBe(LifeState.Downed);
    expect(s.telemetry.mannedTicks[StationKind.Navigation]).toBe(3); expect(s.telemetry.idleRun[0]).toBe(1);
    expect([s.telemetry.evadeRolls, s.telemetry.evasions, s.telemetry.impacts]).toEqual([1, 0, 1]);
    expect([s.telemetry.firstDownTick, s.telemetry.firstDownPid]).toEqual([3, 0]);
  });
  it('scratch.activeThisTick is cleared every step', () => {
    const s = makeState(1); quiet(s); const G = room(s, 'G');
    igniteRoom(s, G); teleport(s, 0, 2.5, 9.5);
    run(s, 1, () => intents(hold)); expect(s.scratch.activeThisTick[0]).toBe(1);
    run(s, 1); expect(s.scratch.activeThisTick[0]).toBe(0);
  });
});

describe('telemetry: event counters', () => {
  it('spawns per type through a pinned director roll; phaseEntries counts each enterPhase; maxStress follows the highest smoothed value', () => {
    const s = makeState(2); armSpawn(s);
    const before = Array.from(s.telemetry.spawns);
    directorSystem(s);
    const after = Array.from(s.telemetry.spawns);
    expect(after.reduce((a, b) => a + b, 0) - before.reduce((a, b) => a + b, 0)).toBe(1);   // exactly one type incremented
    expect(after[s.director.lastType]).toBe(before[s.director.lastType]! + 1);
    enterPhase(s, Phase.SustainPeak); enterPhase(s, Phase.PeakFade); enterPhase(s, Phase.Relax); enterPhase(s, Phase.BuildUp);
    expect(Array.from(s.telemetry.phaseEntries)).toEqual([2, 1, 1, 1]);
    const t = makeState(2); quiet(t);
    igniteRoom(t, 0); igniteRoom(t, 1); igniteRoom(t, 2); updateStress(t);
    const peak = t.director.stress; expect(peak).toBeGreaterThan(0); expect(t.telemetry.maxStress).toBe(peak);
    t.rooms.fire.fill(0); updateStress(t); updateStress(t);
    expect(t.director.stress).toBeLessThan(peak); expect(t.telemetry.maxStress).toBe(peak);
  });
  it('impacts, evadeRolls and evasions through pinned combat rolls', () => {
    const A = room(makeState(1), 'A');
    const un = makeState(1); placeDebris(un, A, 0); debrisSystem(un);
    expect([un.telemetry.evadeRolls, un.telemetry.evasions, un.telemetry.impacts]).toEqual([0, 0, 1]);     // unmanned: no roll
    const ev = makeState(1); sitDown(ev, 0, nav(ev)); ev.rng.combat.s = 7; placeDebris(ev, A, 0); debrisSystem(ev);   // 0.012: evaded
    expect([ev.telemetry.evadeRolls, ev.telemetry.evasions, ev.telemetry.impacts]).toEqual([1, 1, 0]);
    const no = makeState(1); sitDown(no, 0, nav(no)); no.rng.combat.s = 4; placeDebris(no, A, 0); debrisSystem(no);   // 0.924: not evaded
    expect([no.telemetry.evadeRolls, no.telemetry.evasions, no.telemetry.impacts]).toEqual([1, 0, 1]);
  });
  it('shots and hits: a beam hit, a beam miss, a torpedo hit, and a rejected attempt with no charge', () => {
    const B = room(makeState(1), 'B');
    const hit = makeState(1), w1 = wpn(hit); sitDown(hit, 0, w1); placeDebris(hit, B, 600, 1); hit.stations.cursor[w1] = 0; hit.weapons.charge = 1; hit.rng.combat.s = 7;   // 0.012: hits at any threshold
    expect(fireWeapon(hit)).toBe(true); expect([hit.telemetry.shots, hit.telemetry.hits]).toEqual([1, 1]);
    const miss = makeState(1), w2 = wpn(miss); sitDown(miss, 0, w2); placeDebris(miss, B, 600, 1, undefined, 3); miss.stations.cursor[w2] = 0; miss.weapons.charge = 1; miss.weapons.selector = 0; miss.rng.combat.s = 4;
    expect(beamHits(nextFloat(createRng(4)), stationOutput(miss, w2), false)).toBe(false);   // guard: 0.924 misses an unmatched frequency at the starter output
    expect(fireWeapon(miss)).toBe(false); expect([miss.telemetry.shots, miss.telemetry.hits]).toEqual([1, 0]);
    const torp = makeState(1), w3 = wpn(torp); sitDown(torp, 0, w3); placeDebris(torp, B, 600, 1); torp.stations.cursor[w3] = 0; torp.weapons.selector = Weapon.Torpedo; torp.weapons.torpedoLoaded = 1; torp.rng.combat.s = 7;
    expect(fireWeapon(torp)).toBe(true); expect([torp.telemetry.shots, torp.telemetry.hits]).toEqual([1, 1]);
    const none = makeState(1), w4 = wpn(none); sitDown(none, 0, w4); placeDebris(none, B, 600, 1); none.stations.cursor[w4] = 0; none.weapons.charge = 0.5;
    expect(fireWeapon(none)).toBe(false); expect([none.telemetry.shots, none.telemetry.hits]).toEqual([0, 0]);
  });
  it('repairs count each kind once on completion, even with two holders', () => {
    const f = makeState(1), G = room(f, 'G'); quiet(f); igniteRoom(f, G); teleport(f, 0, 2.5, 9.5);
    run(f, seconds(REPAIR_TIME_FIRE) + 5, () => intents(hold));
    expect(Array.from(f.telemetry.repairs)).toEqual([1, 0, 0]);
    const b = makeState(1); quiet(b); activateBreach(b, 6); teleport(b, 0, 2.5, 10.5);
    run(b, seconds(REPAIR_TIME_BREACH) + 5, () => intents(hold));
    expect(Array.from(b.telemetry.repairs)).toEqual([0, 1, 0]);
    const p = makeState(1), eng = p.derived.stationOfKind[StationKind.Engineering]!; quiet(p); failStation(p, eng); teleport(p, 0, 18.5, 9.5);
    run(p, seconds(REPAIR_TIME_POWER) + 5, () => intents(hold));
    expect(Array.from(p.telemetry.repairs)).toEqual([0, 0, 1]);
    const two = makeState(2), G2 = room(two, 'G'); quiet(two); igniteRoom(two, G2); teleport(two, 0, 2.5, 9.5); teleport(two, 1, 3.5, 9.5); two.rooms.fireRepair[G2] = 0.999;
    run(two, 1, () => intents(hold, hold));
    expect(two.rooms.fire[G2]).toBe(0); expect(Array.from(two.telemetry.repairs)).toEqual([1, 0, 0]);
  });
});
```

Append to `tests/snapshot.test.ts` (imports to add: `downCrew` from `../src/renderer/src/sim/crew`, `Life` is already imported? If not, add `Life` to the components import; `LifeState` likewise):

```ts
  it('a fresh telemetry block has the initial values; every telemetry field round-trips and each alone changes the hash', () => {
    const s = makeState(2, 5), t = s.telemetry;
    t.firstDownTick = 11; t.firstDownPid = 1; t.firstDeathTick = 22; t.firstDeathPid = 0; t.impacts = 3; t.evadeRolls = 4; t.evasions = 2; t.shots = 9; t.hits = 5; t.maxStress = 0.61;
    for (let k = 0; k < STATION_COUNT; k++) t.mannedTicks[k] = 100 + k;
    t.idleRun[0] = 7; t.idleRun[1] = 8; t.longestIdle[0] = 70; t.longestIdle[1] = 80; t.prevLife[0] = 1; t.prevLife[1] = 2;
    t.spawns.set([1, 2, 3, 4]); t.repairs.set([5, 6, 7]); t.phaseEntries.set([3, 2, 2, 1]);
    const u = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(s)))).telemetry;
    expect([u.firstDownTick, u.firstDownPid, u.firstDeathTick, u.firstDeathPid, u.impacts, u.evadeRolls, u.evasions, u.shots, u.hits, u.maxStress]).toEqual([11, 1, 22, 0, 3, 4, 2, 9, 5, 0.61]);
    for (const k of ['mannedTicks', 'idleRun', 'longestIdle', 'prevLife', 'spawns', 'repairs', 'phaseEntries'] as const) expect(Array.from(u[k])).toEqual(Array.from(t[k]));
    const base = hashState(makeState(2, 5));
    const mutate = (f: (x: ReturnType<typeof makeState>['telemetry']) => void) => { const x = makeState(2, 5); f(x.telemetry); return hashState(x); };
    expect(mutate((x) => { x.firstDownTick = 1; })).not.toBe(base); expect(mutate((x) => { x.firstDownPid = 1; })).not.toBe(base);
    expect(mutate((x) => { x.firstDeathTick = 1; })).not.toBe(base); expect(mutate((x) => { x.firstDeathPid = 1; })).not.toBe(base);
    expect(mutate((x) => { x.impacts = 1; })).not.toBe(base); expect(mutate((x) => { x.evadeRolls = 1; })).not.toBe(base);
    expect(mutate((x) => { x.evasions = 1; })).not.toBe(base); expect(mutate((x) => { x.shots = 1; })).not.toBe(base);
    expect(mutate((x) => { x.hits = 1; })).not.toBe(base); expect(mutate((x) => { x.maxStress = 0.5; })).not.toBe(base);
    for (let k = 0; k < STATION_COUNT; k++) expect(mutate((x) => { x.mannedTicks[k] = 1; })).not.toBe(base);
    for (let p = 0; p < 2; p++) { expect(mutate((x) => { x.idleRun[p] = 1; })).not.toBe(base); expect(mutate((x) => { x.longestIdle[p] = 1; })).not.toBe(base); expect(mutate((x) => { x.prevLife[p] = 1; })).not.toBe(base); }
    for (let k = 0; k < 4; k++) expect(mutate((x) => { x.spawns[k] = 1; })).not.toBe(base);
    for (let k = 0; k < 3; k++) expect(mutate((x) => { x.repairs[k] = 1; })).not.toBe(base);
    for (let k = 0; k < 4; k++) expect(mutate((x) => { x.phaseEntries[k] = 7; })).not.toBe(base);
  });
  it('a run saved with an idle streak in progress and a Downed crew member continues through a new longest streak and the bleed-out like an uninterrupted run', () => {
    const script = (s: ReturnType<typeof makeState>, ticks: number) => { for (let i = 0; i < ticks; i++) step(s, [NEUTRAL_INTENT, NEUTRAL_INTENT]); };
    const whole = makeState(2, 31); whole.director.nextSpawnTick = 1e9;
    const part = makeState(2, 31); part.director.nextSpawnTick = 1e9;
    for (const s of [whole, part]) { script(s, 100); downCrew(s, 1); script(s, 50); }
    expect(part.telemetry.idleRun[0]).toBeGreaterThan(0); expect(Life.state[part.crew[1]!]).toBe(LifeState.Downed); expect(part.telemetry.firstDeathTick).toBe(-1);
    const savedLongest = part.telemetry.longestIdle[0]!;
    const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(part))));
    script(whole, 2400); script(resumed, 2400);                      // 40 s: past the 30 s bleed-out
    expect(resumed.telemetry.longestIdle[0]).toBeGreaterThan(savedLongest); expect(resumed.telemetry.firstDeathTick).toBeGreaterThan(150); expect(resumed.telemetry.firstDeathPid).toBe(1);
    const fields = (s: ReturnType<typeof makeState>) => JSON.stringify(s.telemetry, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Int32Array) : v));
    expect(fields(resumed)).toBe(fields(whole));
    expect(hashState(resumed)).toBe(hashState(whole));
  });
```

Change the existing version test title and body from 7 to 8: `it('rejects a version-8 snapshot, by header and by the flattened SIM_VERSION', ...)` with `simVersion: 8` in the header fixture and `8` written into the flattened values (read the test body and change every `7` that means the sim version to `8`; the format version stays).

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/telemetry.test.ts tests/snapshot.test.ts` → the telemetry file fails to import (`telemetry.ts` missing); the snapshot tests fail on `s.telemetry` undefined.

- [ ] **Step 3: State, tuning, flatten**

`tuning.ts`: `export const SIM_VERSION = 9;` and, next to it, `export const TELEMETRY_KEEP = 50;   // game-over records kept in localStorage (spec 4-ii section 7)` and `export const ACCEPTANCE_MINUTES = 20;   // default soak length for npm run acceptance`.

`state.ts`: add to the interface after `director`:

```ts
  /** Run telemetry (spec 4-ii section 4): first down/death with the player, manned ticks per kind, idle streaks per player, event counts. Ticks and pids are -1 until set. */
  telemetry: { firstDownTick: number; firstDownPid: number; firstDeathTick: number; firstDeathPid: number; mannedTicks: Int32Array; idleRun: Int32Array; longestIdle: Int32Array; prevLife: Uint8Array; spawns: Int32Array; impacts: number; evadeRolls: number; evasions: number; shots: number; hits: number; repairs: Int32Array; maxStress: number; phaseEntries: Int32Array };
```

and `scratch: { doorToggles: Set<number>; satThisTick: Uint8Array; stoodThisTick: Uint8Array; activeThisTick: Uint8Array };`. In `createSimState` after the `director` line:

```ts
    telemetry: { firstDownTick: -1, firstDownPid: -1, firstDeathTick: -1, firstDeathPid: -1, mannedTicks: new Int32Array(STATION_COUNT), idleRun: new Int32Array(playerCount), longestIdle: new Int32Array(playerCount), prevLife: new Uint8Array(playerCount).fill(LifeState.Conscious), spawns: new Int32Array(4), impacts: 0, evadeRolls: 0, evasions: 0, shots: 0, hits: 0, repairs: new Int32Array(3), maxStress: 0, phaseEntries: Int32Array.of(1, 0, 0, 0) },
```

and `scratch: { doorToggles: new Set<number>(), satThisTick: new Uint8Array(playerCount), stoodThisTick: new Uint8Array(playerCount), activeThisTick: new Uint8Array(playerCount) }`.

`flatten.ts`: manifest `[..., 'director', 'telemetry', 'stations', ...]`; `const TELEMETRY_SCALARS = 10, TELEMETRY_FIXED = STATION_COUNT + 4 + 3 + 4;` and in `size` add `+ TELEMETRY_SCALARS + TELEMETRY_FIXED + 3 * s.playerCount`. In `flatten` after the director line:

```ts
  const tm = s.telemetry; put(tm.firstDownTick); put(tm.firstDownPid); put(tm.firstDeathTick); put(tm.firstDeathPid); put(tm.impacts); put(tm.evadeRolls); put(tm.evasions); put(tm.shots); put(tm.hits); put(tm.maxStress);
  for (const v of tm.mannedTicks) put(v); for (const v of tm.idleRun) put(v); for (const v of tm.longestIdle) put(v); for (const v of tm.prevLife) put(v);
  for (const v of tm.spawns) put(v); for (const v of tm.repairs) put(v); for (const v of tm.phaseEntries) put(v);
```

In `unflatten` after the `sinceProductive` loop:

```ts
  const tm = s.telemetry;
  for (const k of ['firstDownTick', 'firstDownPid', 'firstDeathTick', 'firstDeathPid', 'impacts', 'evadeRolls', 'evasions', 'shots', 'hits', 'maxStress'] as const) tm[k] = get();
  for (const arr of [tm.mannedTicks, tm.idleRun, tm.longestIdle, tm.prevLife, tm.spawns, tm.repairs, tm.phaseEntries]) for (let k = 0; k < arr.length; k++) arr[k] = get();
```

- [ ] **Step 4: telemetry.ts and step.ts**

Create `src/renderer/src/sim/telemetry.ts`:

```ts
import type { SimState } from './state';
import { Life, LifeState, Seated } from './components';
import { stationOnline } from './stations';

/** Indices into telemetry.repairs (spec 4-ii section 5). */
export const REPAIR_FIRE = 0, REPAIR_BREACH = 1, REPAIR_POWER = 2;

/** Last system in step(), after crewSystem and before tick++: final-state samples of manning and activity, and the life-state edges (spec 4-ii section 5). */
export function telemetrySystem(state: SimState): void {
  const t = state.telemetry, st = state.stations, d = state.derived;
  for (let i = 0; i < st.occupant.length; i++) if (st.occupant[i]! >= 0 && stationOnline(state, i)) t.mannedTicks[d.stationKind[i]!]!++;
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!, seat = Seated.station[eid]!;
    const active = (seat >= 0 && stationOnline(state, seat)) || state.scratch.activeThisTick[pid] === 1;
    if (active) t.idleRun[pid] = 0;
    else { t.idleRun[pid]!++; if (t.idleRun[pid]! > t.longestIdle[pid]!) t.longestIdle[pid] = t.idleRun[pid]!; }
    const life = Life.state[eid]!, prev = t.prevLife[pid]!;
    if (prev !== LifeState.Downed && life === LifeState.Downed && t.firstDownTick < 0) { t.firstDownTick = state.tick; t.firstDownPid = pid; }
    if (prev !== LifeState.Dead && life === LifeState.Dead && t.firstDeathTick < 0) { t.firstDeathTick = state.tick; t.firstDeathPid = pid; }
    t.prevLife[pid] = life;
  }
}
```

`step.ts`: import `telemetrySystem`; the scratch line becomes `state.scratch.doorToggles.clear(); state.scratch.satThisTick.fill(0); state.scratch.stoodThisTick.fill(0); state.scratch.activeThisTick.fill(0);`; after `crewSystem(state);` add `telemetrySystem(state);   // (8) telemetry: final-state samples and life edges, on the ending tick too` before `state.tick++`.

- [ ] **Step 5: Event increments**

`interact.ts`: import `REPAIR_FIRE, REPAIR_BREACH, REPAIR_POWER` from `./telemetry`. In the revive loop, inside `if (reviver >= 0) {` add as the first line `state.scratch.activeThisTick[reviver] = 1;` (before the progress line, so the completion tick counts). In the repair loop, each branch gets `state.scratch.activeThisTick[pid] = 1;` right after its progress line, and the completion calls become `if (state.rooms.fireRepair[t.index]! >= 1) { extinguishRoom(state, t.index); state.telemetry.repairs[REPAIR_FIRE]!++; }`, `if (state.breaches.repair[t.index]! >= 1) { repairBreach(state, t.index); state.telemetry.repairs[REPAIR_BREACH]!++; }`, `if (state.stations.repair[t.index]! >= 1) { repairStation(state, t.index); state.telemetry.repairs[REPAIR_POWER]!++; }`.

`director.ts`: in `attemptSpawn` the success line becomes `d.lastSpawnTick = state.tick; d.lastType = type; d.budgetLeft -= 1; state.telemetry.spawns[type]!++;`; in `enterPhase` add `state.telemetry.phaseEntries[phase]!++;` after `d.phase = phase; d.phaseTick = state.tick;`; in `updateStress` after the clamp line add `if (d.stress > state.telemetry.maxStress) state.telemetry.maxStress = d.stress;`.

`debris.ts` `resolveImpact`: after `const evaded = evades(...)` add `state.telemetry.evadeRolls++;`; the evaded branch becomes `if (evaded) { state.telemetry.evasions++; removeDebris(state, slot); return; }`; after `state.hull = Math.max(0, state.hull - DEBRIS_HULL_DAMAGE);` add `state.telemetry.impacts++;`.

`weapons.ts` `fireWeapon`: the stamp line becomes `state.skills.lastShotTick = state.tick; state.telemetry.shots++; addXp(...)`; `if (hit) { state.telemetry.hits++; removeDebris(state, c); }`.

- [ ] **Step 6: Run, re-bless, full suite**

`npx vitest run tests/telemetry.test.ts tests/snapshot.test.ts` → PASS. If the beam-miss guard assertion fails (seed 4 hits at the starter output), pick another combat seed whose first float is above `BEAM_MISS_BASE + BEAM_MISS_SCALE × output` (print `nextFloat(createRng(seed))` for seeds 1..20) and record the seed in the test comment. Then `npm run bless` (cause: SIM_VERSION 9 and the telemetry block; counters are hashed, so the hashes change from the first checkpoint) and `npm test`, `npm run typecheck`, `npm run build` → all pass. Run `npx vitest run tests/gate-survival.test.ts` and confirm seeds 1-3 still pass (no behaviour change, so they must).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/telemetry.ts src/renderer/src/sim/state.ts src/renderer/src/sim/flatten.ts src/renderer/src/sim/tuning.ts src/renderer/src/sim/step.ts src/renderer/src/sim/interact.ts src/renderer/src/sim/director.ts src/renderer/src/sim/debris.ts src/renderer/src/sim/weapons.ts tests/telemetry.test.ts tests/snapshot.test.ts tests/golden/basic.json
git commit -m "feat: telemetry counters as authoritative state: manned ticks, idle streaks, first down/death with pid, event counts in director, debris, weapons and interact; SIM_VERSION 9 (golden re-blessed: the telemetry block is hashed)"
```

---

### Task 2: The record, the bot move, the acceptance runner and CLI

**Files:**
- Create: `src/renderer/src/sim/bot.ts` (moved from `tests/helpers/bot.ts`), `src/renderer/src/sim/acceptance.ts`, `scripts/acceptance.ts`, `tests/acceptance.test.ts`
- Modify: `src/renderer/src/sim/telemetry.ts`, `tests/helpers/bot.ts`, `tests/telemetry.test.ts`, `package.json`

**Interfaces:**
- Consumes: `SimState.telemetry` from Task 1.
- Produces: `TelemetryRecord`, `telemetryRecord(state, seed)`, `durationSeconds(ticks)`, `eventSeconds(tick)` from `sim/telemetry.ts`; `botIntent(state, pid)` from `sim/bot.ts`; `runAcceptance({ players, seed, minutes, characters? })`, `acceptanceTable(records)`, `runAcceptanceCli(argv, run?, print?)` from `sim/acceptance.ts`.

- [ ] **Step 1: Move the bot**

`git mv tests/helpers/bot.ts src/renderer/src/sim/bot.ts`, then fix its imports to sim-relative paths: `../../../shared/intent` (twice), `./state`, `./components`, `./interact`, `./grid`. Create `tests/helpers/bot.ts` containing one line: `export { botIntent } from '../../src/renderer/src/sim/bot';`. Run `npx vitest run tests/boundary.test.ts tests/director.test.ts tests/gate-survival.test.ts tests/snapshot.test.ts` → PASS (the boundary test now walks `sim/bot.ts`; it must pass unchanged).

- [ ] **Step 2: Write the failing tests**

Append to `tests/telemetry.test.ts` (imports to add: `telemetryRecord, eventSeconds, durationSeconds` from telemetry; `hashState` from `../src/renderer/src/sim/hash`; `DEFAULT_CHARACTERS` from characters; `setSkill` from helpers; `Skill` from skills; `SIM_VERSION, TICK_HZ` from tuning):

```ts
describe('telemetryRecord', () => {
  it('rounds seconds: eventSeconds(0) is 0.0, durationSeconds(90) is 1.5', () => {
    expect(eventSeconds(0)).toBe(0); expect(eventSeconds(59)).toBe(1); expect(durationSeconds(90)).toBe(1.5); expect(durationSeconds(0)).toBe(0);
  });
  it('maps a crafted state to the exact record', () => {
    const s = makeState(2, 9, DEFAULT_CHARACTERS); quiet(s); const t = s.telemetry;
    s.tick = 1200; s.ended = 1; s.endReason = 1;                      // 20 s, hull loss
    t.firstDownTick = 599; t.firstDownPid = 1; t.firstDeathTick = -1; t.firstDeathPid = -1;
    t.mannedTicks[StationKind.Navigation] = 600; t.mannedTicks[StationKind.Doors] = 30;
    t.longestIdle[0] = 300; t.longestIdle[1] = 1200;
    t.spawns.set([2, 1, 0, 3]); t.impacts = 2; t.evadeRolls = 3; t.evasions = 1; t.shots = 4; t.hits = 2; t.repairs.set([1, 0, 0]); t.maxStress = 0.55; t.phaseEntries.set([2, 1, 1, 1]);
    setSkill(s, 0, Skill.Repair, 4);
    const r = telemetryRecord(s, 9);
    expect(r).toEqual({
      version: 1, simVersion: SIM_VERSION, seed: 9, playerCount: 2, characters: ['Okoro', 'Lindqvist'],
      endReason: 'hull', durationSeconds: 20,
      firstDown: { who: 'Lindqvist', seconds: 10 }, firstDeath: null,
      stationsNeverManned: ['Weapons', 'Science', 'Engineering', 'Life Support', 'Medbay'],
      mannedSeconds: { Navigation: 10, Weapons: 0, Science: 0, Engineering: 0, 'Life Support': 0, Medbay: 0, Doors: 0.5 },
      longestIdleSeconds: [5, 20],
      spawns: { fire: 2, breach: 1, power: 0, debris: 3 }, impacts: 2, evadeRolls: 3, evasions: 1, shots: 4, hits: 2,
      repairs: { fire: 1, breach: 0, power: 0 }, maxStress: 0.55, phaseEntries: { buildUp: 2, sustainPeak: 1, peakFade: 1, relax: 1 },
      skills: [[0, 0, 0, 0, 0, 4], [0, 3, 0, 0, 0, 0]]
    });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    s.ended = 1; s.endReason = 2; expect(telemetryRecord(s, 9).endReason).toBe('crew');
    s.ended = 0; expect(telemetryRecord(s, 9).endReason).toBe('running');
  });
  it('lists only station kinds present on the ship, is pure, and returns fresh arrays', () => {
    const s = makeState(1); quiet(s); s.derived.stationOfKind[StationKind.Medbay] = -1;   // a layout without a Medbay console
    const before = hashState(s);
    const r = telemetryRecord(s, 1);
    expect(r.stationsNeverManned).not.toContain('Medbay'); expect(r.stationsNeverManned).toContain('Weapons'); expect(Object.keys(r.mannedSeconds)).not.toContain('Medbay');
    expect(hashState(s)).toBe(before);
    r.longestIdleSeconds[0] = 999; r.skills[0]![0] = 9; r.stationsNeverManned.length = 0; r.characters[0] = 'x';
    expect(telemetryRecord(s, 1).longestIdleSeconds[0]).toBe(0); expect(telemetryRecord(s, 1).skills[0]![0]).toBe(0); expect(telemetryRecord(s, 1).stationsNeverManned.length).toBeGreaterThan(0);
    expect(hashState(s)).toBe(before);
  });
});
```

Check the skills row for Okoro and Lindqvist against `CHARACTERS` in `characters.ts` before running: Lindqvist's head start is Weapons 3 (`[0, 3, 0, 0, 0, 0]`, the HUD test uses it); Okoro's is Repair 3, raised to 4 by `setSkill`. If Okoro's head start includes another skill, put its level into the expected row.

Create `tests/acceptance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runAcceptance, acceptanceTable, runAcceptanceCli } from '../src/renderer/src/sim/acceptance';
import { telemetryRecord, type TelemetryRecord } from '../src/renderer/src/sim/telemetry';
import { createSimState } from '../src/renderer/src/sim/state';
import { step } from '../src/renderer/src/sim/step';
import { botIntent } from '../src/renderer/src/sim/bot';
import { DEFAULT_CHARACTERS, RECRUIT } from '../src/renderer/src/sim/characters';
import { ACCEPTANCE_MINUTES, TICK_HZ } from '../src/renderer/src/sim/tuning';
import { LAYOUT } from './helpers/sim';

describe('runAcceptance', () => {
  it('equals an independent bot loop for 2 players, seed 1, half a minute, and is repeatable', () => {
    const s = createSimState(LAYOUT, 2, 1, DEFAULT_CHARACTERS);
    const budget = Math.round(0.5 * 60 * TICK_HZ);
    while (s.tick < budget && !s.ended) step(s, [botIntent(s, 0), botIntent(s, 1)]);
    const oracle = telemetryRecord(s, 1);
    const r = runAcceptance({ players: 2, seed: 1, minutes: 0.5 });
    expect(r).toEqual(oracle);
    expect(runAcceptance({ players: 2, seed: 1, minutes: 0.5 })).toEqual(r);
    expect(r.playerCount).toBe(2); expect(r.characters).toEqual(['Okoro', 'Lindqvist']);
    expect(r.endReason).toBe('running'); expect(r.durationSeconds).toBe(30);
  });
  it('crew lists for 1 and 4 players, and custom characters', () => {
    expect(runAcceptance({ players: 1, seed: 2, minutes: 0.05 }).characters).toEqual(['Okoro']);
    expect(runAcceptance({ players: 4, seed: 2, minutes: 0.05 }).characters).toEqual(['Okoro', 'Lindqvist', 'Reyes', 'Dubois']);
    expect(runAcceptance({ players: 2, seed: 2, minutes: 0.05, characters: [RECRUIT, RECRUIT] }).characters).toEqual(['Recruit', 'Recruit']);
  });
  it('a run that ends early reports its real reason and a shorter duration', { timeout: 60_000 }, () => {
    // One bot with the default spawner pressure eventually goes down or loses the hull; record the pair that ends here if a new seed is chosen.
    const r = runAcceptance({ players: 1, seed: 1, minutes: 20 });
    expect(r.endReason).not.toBe('running'); expect(r.durationSeconds).toBeLessThan(20 * 60);
  });
});

describe('acceptanceTable and runAcceptanceCli', () => {
  const rec = (players: number, seed: number, over: Partial<TelemetryRecord> = {}): TelemetryRecord => ({
    version: 1, simVersion: 9, seed, playerCount: players, characters: ['Okoro'], endReason: 'running', durationSeconds: 60,
    firstDown: null, firstDeath: null, stationsNeverManned: ['Doors'], mannedSeconds: {}, longestIdleSeconds: [12.5],
    spawns: { fire: 1, breach: 0, power: 0, debris: 2 }, impacts: 1, evadeRolls: 0, evasions: 0, shots: 3, hits: 1,
    repairs: { fire: 1, breach: 0, power: 0 }, maxStress: 0.4, phaseEntries: { buildUp: 1, sustainPeak: 0, peakFade: 0, relax: 0 }, skills: [[0, 0, 0, 0, 0, 0]], ...over
  });
  it('renders a header and one row per record with the record values', () => {
    const lines = acceptanceTable([rec(1, 1), rec(4, 3, { endReason: 'hull', durationSeconds: 42.5, firstDown: { who: 'Reyes', seconds: 10 }, hits: 0, shots: 0 })]).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^players\s+seed\s+ended-at\s+reason\s+first-down\s+first-death\s+never-manned\s+longest-idle\s+spawns\s+impacts\s+hits\/shots$/);
    expect(lines[1]).toMatch(/^1\s+1\s+1:00\s+running\s+-\s+-\s+Doors\s+12\.5\s+1\/0\/0\/2\s+1\s+1\/3$/);
    expect(lines[2]).toMatch(/^4\s+3\s+0:42\.5\s+hull\s+Reyes 0:10\s+-\s+Doors\s+12\.5\s+1\/0\/0\/2\s+1\s+0\/0$/);
  });
  it('no arguments: nine runs in players-major order at the default minutes; "1 1": three runs; --json prints records; bad input prints usage and runs nothing', () => {
    const calls: { players: number; seed: number; minutes: number }[] = []; const out: string[] = [];
    const run = (o: { players: number; seed: number; minutes: number }) => { calls.push(o); return rec(o.players, o.seed); };
    runAcceptanceCli([], run, (s) => out.push(s));
    expect(calls).toEqual([1, 2, 4].flatMap((players) => [1, 2, 3].map((seed) => ({ players, seed, minutes: ACCEPTANCE_MINUTES }))));
    expect(out).toHaveLength(1); expect(out[0]!.split('\n')).toHaveLength(10);
    calls.length = 0; out.length = 0;
    runAcceptanceCli(['1', '1'], run, (s) => out.push(s));
    expect(calls).toEqual([{ players: 1, seed: 1, minutes: 1 }, { players: 2, seed: 1, minutes: 1 }, { players: 4, seed: 1, minutes: 1 }]);
    expect(out[0]!.split('\n')[1]).toMatch(/^1\s+1\s+/);
    calls.length = 0; out.length = 0;
    runAcceptanceCli(['1', '5', '--json'], run, (s) => out.push(s));
    expect(calls.map((c) => c.seed)).toEqual([5, 5, 5]); expect(out).toHaveLength(4); expect(JSON.parse(out[1]!).seed).toBe(5);
    calls.length = 0; out.length = 0;
    runAcceptanceCli(['abc'], run, (s) => out.push(s));
    expect(calls).toEqual([]); expect(out).toHaveLength(1); expect(out[0]).toMatch(/^usage:/);
    runAcceptanceCli(['0'], run, (s) => out.push(s)); runAcceptanceCli(['1', 'x'], run, (s) => out.push(s));
    expect(calls).toEqual([]); expect(out).toHaveLength(3);
  });
});
```

- [ ] **Step 3: Run to verify failure**

`npx vitest run tests/telemetry.test.ts tests/acceptance.test.ts` → `telemetryRecord` and `acceptance.ts` missing.

- [ ] **Step 4: telemetryRecord**

Append to `src/renderer/src/sim/telemetry.ts` (imports to add: `TICK_HZ, SIM_VERSION, SKILL_COUNT` from `./tuning`; `STATION_NAMES` from `./stationKinds`; `EndReason` from `./crew`; `characterOf` from `./characters`; `skillLevelOf` from `./skills`; `HazardType, Phase` from `./director`):

```ts
export interface TelemetryRecord {
  version: 1; simVersion: number; seed: number; playerCount: number; characters: string[];
  endReason: 'hull' | 'crew' | 'running';
  durationSeconds: number;
  firstDown: { who: string; seconds: number } | null; firstDeath: { who: string; seconds: number } | null;
  stationsNeverManned: string[]; mannedSeconds: Record<string, number>; longestIdleSeconds: number[];
  spawns: { fire: number; breach: number; power: number; debris: number };
  impacts: number; evadeRolls: number; evasions: number; shots: number; hits: number;
  repairs: { fire: number; breach: number; power: number };
  maxStress: number; phaseEntries: { buildUp: number; sustainPeak: number; peakFade: number; relax: number };
  skills: number[][];
}

const round1 = (x: number): number => Math.round(x * 10) / 10;
/** Completed ticks as seconds, one decimal. */
export function durationSeconds(ticks: number): number { return round1(ticks / TICK_HZ); }
/** An event stored at tick t happened during that tick; report the duration completed at its end (spec 4-ii section 2). */
export function eventSeconds(tick: number): number { return round1((tick + 1) / TICK_HZ); }

/** Pure: reads the state, allocates every array and object afresh (spec 4-ii section 6). */
export function telemetryRecord(state: SimState, seed: number): TelemetryRecord {
  const t = state.telemetry, d = state.derived;
  const characters = state.crew.map((_, pid) => characterOf(state, pid).name);
  const present: number[] = []; for (let k = 0; k < STATION_NAMES.length; k++) if (d.stationOfKind[k]! >= 0) present.push(k);
  const mannedSeconds: Record<string, number> = {};
  for (const k of present) mannedSeconds[STATION_NAMES[k]!] = durationSeconds(t.mannedTicks[k]!);
  const event = (tick: number, pid: number) => (tick < 0 ? null : { who: characters[pid]!, seconds: eventSeconds(tick) });
  return {
    version: 1, simVersion: SIM_VERSION, seed, playerCount: state.playerCount, characters,
    endReason: state.ended ? (state.endReason === EndReason.Hull ? 'hull' : 'crew') : 'running',
    durationSeconds: durationSeconds(state.tick),
    firstDown: event(t.firstDownTick, t.firstDownPid), firstDeath: event(t.firstDeathTick, t.firstDeathPid),
    stationsNeverManned: present.filter((k) => t.mannedTicks[k] === 0).map((k) => STATION_NAMES[k]!),
    mannedSeconds,
    longestIdleSeconds: Array.from(t.longestIdle, (v) => durationSeconds(v)),
    spawns: { fire: t.spawns[HazardType.Fire]!, breach: t.spawns[HazardType.Breach]!, power: t.spawns[HazardType.Power]!, debris: t.spawns[HazardType.Debris]! },
    impacts: t.impacts, evadeRolls: t.evadeRolls, evasions: t.evasions, shots: t.shots, hits: t.hits,
    repairs: { fire: t.repairs[REPAIR_FIRE]!, breach: t.repairs[REPAIR_BREACH]!, power: t.repairs[REPAIR_POWER]! },
    maxStress: t.maxStress,
    phaseEntries: { buildUp: t.phaseEntries[Phase.BuildUp]!, sustainPeak: t.phaseEntries[Phase.SustainPeak]!, peakFade: t.phaseEntries[Phase.PeakFade]!, relax: t.phaseEntries[Phase.Relax]! },
    skills: state.crew.map((_, pid) => Array.from({ length: SKILL_COUNT }, (_, k) => skillLevelOf(state, pid, k)))
  };
}
```

(`telemetry.ts` importing `director.ts` is fine: `director.ts` does not import `telemetry.ts`, and `step.ts` imports both.)

- [ ] **Step 5: acceptance.ts and the script**

Create `src/renderer/src/sim/acceptance.ts`:

```ts
import starter from './ship/starter.json';
import { parseShip } from './ship/schema';
import { createSimState } from './state';
import { step } from './step';
import { botIntent } from './bot';
import { DEFAULT_CHARACTERS } from './characters';
import { telemetryRecord, type TelemetryRecord } from './telemetry';
import { TICK_HZ, ACCEPTANCE_MINUTES } from './tuning';

export interface AcceptanceArgs { players: number; seed: number; minutes: number; characters?: readonly number[] }

/** Headless soak: the bot crew on the starter ship until the tick budget or the run end, with no survival cheat (spec 4-ii section 8). */
export function runAcceptance({ players, seed, minutes, characters = DEFAULT_CHARACTERS }: AcceptanceArgs): TelemetryRecord {
  const state = createSimState(parseShip(starter), players, seed, characters);
  const budget = Math.round(minutes * 60 * TICK_HZ);
  while (state.tick < budget && !state.ended) step(state, state.crew.map((_, pid) => botIntent(state, pid)));
  return telemetryRecord(state, seed);
}

const COLUMNS = ['players', 'seed', 'ended-at', 'reason', 'first-down', 'first-death', 'never-manned', 'longest-idle', 'spawns', 'impacts', 'hits/shots'];

function clock(seconds: number): string {
  const whole = Math.floor(seconds), m = Math.floor(whole / 60), s = whole % 60, frac = Math.round((seconds - whole) * 10);
  return `${m}:${String(s).padStart(2, '0')}${frac ? `.${frac}` : ''}`;
}
const who = (e: { who: string; seconds: number } | null): string => (e ? `${e.who} ${clock(e.seconds)}` : '-');

function row(r: TelemetryRecord): string[] {
  return [String(r.playerCount), String(r.seed), clock(r.durationSeconds), r.endReason, who(r.firstDown), who(r.firstDeath),
    r.stationsNeverManned.length ? r.stationsNeverManned.join(',') : 'none', r.longestIdleSeconds.join('/'),
    `${r.spawns.fire}/${r.spawns.breach}/${r.spawns.power}/${r.spawns.debris}`, String(r.impacts), `${r.hits}/${r.shots}`];
}

/** One header line and one line per record, columns padded to the widest cell (spec 4-ii section 8). */
export function acceptanceTable(records: readonly TelemetryRecord[]): string {
  const rows = [COLUMNS, ...records.map(row)];
  const widths = COLUMNS.map((_, c) => Math.max(...rows.map((r) => r[c]!.length)));
  return rows.map((r) => r.map((cell, c) => (c === r.length - 1 ? cell : cell.padEnd(widths[c]! + 2))).join('').trimEnd()).join('\n');
}

const PLAYER_COUNTS = [1, 2, 4] as const;
const DEFAULT_SEEDS = [1, 2, 3] as const;
const USAGE = 'usage: npm run acceptance [minutes] [seeds...] [--json]   (defaults: 20 minutes, seeds 1 2 3; players 1, 2 and 4)';

/** Argument parsing and orchestration with injected runner and printer so a test can drive it (spec 4-ii section 8). */
export function runAcceptanceCli(argv: readonly string[], run: (a: AcceptanceArgs) => TelemetryRecord = runAcceptance, print: (line: string) => void = console.log): void {
  const json = argv.includes('--json'), nums = argv.filter((a) => a !== '--json');
  const minutes = nums.length ? Number(nums[0]) : ACCEPTANCE_MINUTES;
  const seeds = nums.length > 1 ? nums.slice(1).map(Number) : [...DEFAULT_SEEDS];
  if (!Number.isFinite(minutes) || minutes <= 0 || seeds.some((s) => !Number.isInteger(s))) { print(USAGE); return; }
  const records: TelemetryRecord[] = [];
  for (const players of PLAYER_COUNTS) for (const seed of seeds) records.push(run({ players, seed, minutes }));
  print(acceptanceTable(records));
  if (json) for (const r of records) print(JSON.stringify(r));
}
```

(`console.log` as a default parameter is allowed by the boundary test; `Math.floor`/`Math.round`/`Math.max` are not banned. The JSON import matches `state.ts`'s `starter.json` use elsewhere, and `tsconfig.web.json` has `resolveJsonModule`.)

Create `scripts/acceptance.ts`:

```ts
import { runAcceptanceCli } from '../src/renderer/src/sim/acceptance';

runAcceptanceCli(process.argv.slice(2));
```

`package.json` scripts: add `"acceptance": "tsx scripts/acceptance.ts",` after `"bless"`.

- [ ] **Step 6: Run, the real CLI, full suite**

`npx vitest run tests/telemetry.test.ts tests/acceptance.test.ts tests/boundary.test.ts` → PASS. If the early-ending acceptance fixture stays `'running'` for 20 minutes at 1 player, seed 1, try seeds 2 to 5 and record the first that ends in the test comment; if none ends, report it (the one-player bot surviving 20 minutes unmanned would be a pacing finding, not a test to loosen). `npm run acceptance 1 1` → a header and three rows, players 1, 2, 4, exits 0; paste the output in the task report. `npm test`, `npm run typecheck`, `npm run build` → pass; `git status` shows `tests/golden/basic.json` unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/bot.ts tests/helpers/bot.ts src/renderer/src/sim/telemetry.ts src/renderer/src/sim/acceptance.ts scripts/acceptance.ts package.json tests/telemetry.test.ts tests/acceptance.test.ts
git commit -m "feat: telemetryRecord; the bot moves into sim/; runAcceptance, the text table and the CLI with injected runner; npm run acceptance"
```

---

### Task 3: Storage, session hook, HUD headline lines

**Files:**
- Create: `src/renderer/src/app/telemetryStore.ts`, `tests/telemetryStore.test.ts`
- Modify: `src/renderer/src/app/session.ts`, `src/renderer/src/main.ts`, `src/renderer/src/render/hudModel.ts`, `src/renderer/src/render/hud.ts`, `tests/session.test.ts`, `tests/hud.test.ts`

**Interfaces:**
- Consumes: `telemetryRecord`, `TelemetryRecord`, `durationSeconds` from Task 2.
- Produces: `appendTelemetry(storage, record, keep?)` and `TELEMETRY_KEY = 'ftlite-telemetry'` from `app/telemetryStore.ts`; `SessionDeps.saveTelemetry?`.

- [ ] **Step 1: Write the failing tests**

Create `tests/telemetryStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { appendTelemetry, TELEMETRY_KEY } from '../src/renderer/src/app/telemetryStore';
import { TELEMETRY_KEEP } from '../src/renderer/src/sim/tuning';

const rec = (seed: number) => ({ seed, version: 1 }) as unknown as import('../src/renderer/src/sim/telemetry').TelemetryRecord;
function memory(initial?: string) {
  const map = new Map<string, string>(); if (initial !== undefined) map.set(TELEMETRY_KEY, initial);
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, read: () => JSON.parse(map.get(TELEMETRY_KEY) ?? 'null') as { seed: number }[] | null };
}

describe('appendTelemetry', () => {
  it('a missing key becomes a one-element array; an existing array is appended in order', () => {
    const m = memory(); appendTelemetry(m, rec(1));
    expect(m.read()!.map((r) => r.seed)).toEqual([1]);
    const n = memory(JSON.stringify([rec(1), rec(2)])); appendTelemetry(n, rec(3));
    expect(n.read()!.map((r) => r.seed)).toEqual([1, 2, 3]);
  });
  it('keeps the newest TELEMETRY_KEEP: fifty plus one drops the oldest and the new record is last', () => {
    const m = memory(JSON.stringify(Array.from({ length: TELEMETRY_KEEP }, (_, i) => rec(i + 1)))); appendTelemetry(m, rec(99));
    const seeds = m.read()!.map((r) => r.seed);
    expect(seeds).toHaveLength(TELEMETRY_KEEP); expect(seeds[0]).toBe(2); expect(seeds[seeds.length - 1]).toBe(99);
    const k = memory(JSON.stringify([rec(1), rec(2), rec(3)])); appendTelemetry(k, rec(4), 2);
    expect(k.read()!.map((r) => r.seed)).toEqual([3, 4]);
  });
  it('malformed JSON and a non-array root are replaced by a one-element array', () => {
    for (const bad of ['{not json', '{}', '42', '"x"', 'null']) { const m = memory(bad); appendTelemetry(m, rec(7)); expect(m.read()!.map((r) => r.seed)).toEqual([7]); }
  });
  it('a throwing getItem or setItem is swallowed', () => {
    let writes = 0;
    expect(() => appendTelemetry({ getItem: () => { throw new Error('denied'); }, setItem: () => { writes++; } }, rec(1))).not.toThrow();
    expect(() => appendTelemetry({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, rec(1))).not.toThrow();
    expect(writes).toBe(0);
  });
});
```

`tests/session.test.ts`: the harness collects records. Change the harness signature and body:

```ts
function harness(canResume?: () => boolean, credits: string[] = ['FTLite', '', 'Line A', 'Line B', 'Line C'], withTelemetry = true) {
  ...
  const records: TelemetryRecord[] = [];
  const session = createSession({
    layout: LAYOUT, sampleDevices: () => samples, renderer: null, hud: { update(m) { last = m; } },
    now: () => t, canResume, saveCrash: (p) => { crashes.push(p); }, credits,
    ...(withTelemetry ? { saveTelemetry: (r: TelemetryRecord) => { records.push(r); } } : {})
  });
  ...
  return { session, press, pressMany, sample, frames, crashes, records, release: () => press('a', {}), last: () => last! };
}
```

with `import type { TelemetryRecord } from '../src/renderer/src/sim/telemetry';` and `import { DEFAULT_SEED } from '../src/renderer/src/app/session';` (extend the existing session import). Rename the existing test to `'ends on hull loss and restarts with the same or next seed'` and add after it:

```ts
  it('hull loss saves exactly one telemetry record with endReason hull, and no more on the game-over frames', () => {
    const h = harness();
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release();
    h.session.state!.hull = 0; h.frames(2);
    expect(h.session.phase).toBe('gameover'); expect(h.records).toHaveLength(1);
    expect(h.records[0]).toMatchObject({ endReason: 'hull', playerCount: 1, seed: DEFAULT_SEED, characters: ['Okoro'] });
    h.frames(10); expect(h.records).toHaveLength(1);
  });
  it('crew loss (the solo player downed) saves exactly one record with endReason crew', () => {
    const h = harness();
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release();
    downCrew(h.session.state!, 0); h.frames(2);
    expect(h.session.phase).toBe('gameover'); expect(h.records).toHaveLength(1);
    expect(h.records[0]).toMatchObject({ endReason: 'crew', playerCount: 1, seed: DEFAULT_SEED });
    expect(h.records[0]!.firstDown).toEqual({ who: 'Okoro', seconds: h.records[0]!.durationSeconds });   // downed on the ending tick
    h.frames(10); expect(h.records).toHaveLength(1);
  });
  it('a sim fault saves a crash but no telemetry record; a session without saveTelemetry still ends normally', () => {
    const h = harness();
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release();
    (h.session.state as unknown as { rooms: null }).rooms = null; h.frames(2);
    expect(h.crashes).toHaveLength(1); expect(h.records).toHaveLength(0);
    const g = harness(undefined, undefined, false);
    g.press('a', { interact: true }); g.frames(1); g.release(); g.frames(1);
    g.press('a', { confirm: true }); g.frames(1); g.release();
    g.session.state!.hull = 0; g.frames(2);
    expect(g.session.phase).toBe('gameover'); expect(g.records).toHaveLength(0);
  });
```

(`downCrew` from `../src/renderer/src/sim/crew`.)

`tests/hud.test.ts`: replace the game-over summary test with:

```ts
  it('the game-over summary has four headline lines then one skill line per crew member, and is null in every other phase', () => {
    const s = makeState(3, 1, DEFAULT_CHARACTERS); const t = s.telemetry;
    s.tick = 452 * 60; s.ended = 1; s.endReason = 1;
    t.firstDownTick = 190 * 60 - 1; t.firstDownPid = 0;                       // Okoro at 3:10
    t.mannedTicks.fill(1); t.mannedTicks[StationKind.Doors] = 0; t.mannedTicks[StationKind.Medbay] = 0;
    t.longestIdle.set([95 * 60, 40 * 60, 7 * 60]);
    setSkill(s, 2, Skill.Science, 3); setSkill(s, 0, Skill.Repair, 4); setSkill(s, 0, Skill.Navigation, 1);
    const over = buildHudModel(s, slots(3), 'gameover', 'HULL LOST');
    expect(over.summary).toEqual([
      'Survived 7:32  HULL LOST', 'First down: Okoro 3:10   First death: none', 'Never manned: Doors, Medbay', 'Longest idle: Okoro 95 s, Lindqvist 40 s, Reyes 7 s',
      'Okoro: Navigation 0 -> 1, Repair 3 -> 4', 'Lindqvist: no skill gains', 'Reyes: Science 2 -> 3']);
    for (const phase of ['lobby', 'paused', 'running'] as const) expect(buildHudModel(s, slots(3), phase, '').summary).toBeNull();
    expect(buildHudModel(null, slots(1), 'gameover', '').summary).toBeNull();
    s.endReason = 2; t.mannedTicks.fill(1); t.firstDeathTick = 452 * 60 - 1; t.firstDeathPid = 2;
    const crew = buildHudModel(s, slots(3), 'gameover', 'CREW LOST').summary!;
    expect(crew[0]).toBe('Survived 7:32  CREW LOST'); expect(crew[1]).toBe('First down: Okoro 3:10   First death: Reyes 7:32'); expect(crew[2]).toBe('Every station manned');
    const four = makeState(4, 1, DEFAULT_CHARACTERS); four.ended = 1; four.endReason = 1;
    expect(buildHudModel(four, slots(4), 'gameover', '').summary).toHaveLength(8);
  });
```

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/telemetryStore.test.ts tests/session.test.ts tests/hud.test.ts` → store module missing; `saveTelemetry` never called (records empty); summary lacks the headline lines.

- [ ] **Step 3: telemetryStore.ts, session, main**

Create `src/renderer/src/app/telemetryStore.ts`:

```ts
import type { TelemetryRecord } from '../sim/telemetry';
import { TELEMETRY_KEEP } from '../sim/tuning';

export const TELEMETRY_KEY = 'ftlite-telemetry';
export interface RecordStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** Append one record to the capped history. A missing key, unparsable JSON or a non-array root counts as an empty history; storage failures are swallowed (spec 4-ii section 7). */
export function appendTelemetry(storage: RecordStorage, record: TelemetryRecord, keep = TELEMETRY_KEEP): void {
  try {
    let history: unknown = null;
    try { history = JSON.parse(storage.getItem(TELEMETRY_KEY) ?? 'null'); } catch { history = null; }
    const list = Array.isArray(history) ? history : [];
    list.push(record);
    storage.setItem(TELEMETRY_KEY, JSON.stringify(list.slice(-keep)));
  } catch { /* storage unavailable or full */ }
}
```

`session.ts`: import `telemetryRecord, type TelemetryRecord` from `../sim/telemetry`; add to `SessionDeps`: `/** Called once with the run's record on the tick it ends (spec 4-ii section 7). */ saveTelemetry?: (record: TelemetryRecord) => void;`; in `frame()` the `if (state.ended) {` block becomes:

```ts
            if (state.ended) {
              deps.saveTelemetry?.(telemetryRecord(state, seed));
              phase = 'gameover';
              message = `${state.endReason === EndReason.Hull ? 'HULL LOST' : 'CREW LOST'} after ${Math.floor(state.tick / TICK_HZ)}s. Confirm: same seed. Cancel: new seed.`;
              break;
            }
```

`main.ts`: import `appendTelemetry` from `./app/telemetryStore`; add to the `createSession` deps after `saveCrash`: `saveTelemetry: (record) => appendTelemetry(localStorage, record)`.

- [ ] **Step 4: HUD model and rows**

`hudModel.ts`: import `durationSeconds, eventSeconds` from `../sim/telemetry` and `EndReason` from `../sim/crew`. Add:

```ts
function clock(seconds: number): string { const whole = Math.floor(seconds); return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`; }

/** The four headline lines of the game-over summary (spec 4-ii section 7). */
function headlineSummary(state: SimState): string[] {
  const t = state.telemetry, names = state.crew.map((_, pid) => characterOf(state, pid).name);
  const event = (tick: number, pid: number) => (tick < 0 ? 'none' : `${names[pid]} ${clock(eventSeconds(tick))}`);
  const never: string[] = [];
  for (let k = 0; k < STATION_NAMES.length; k++) if (state.derived.stationOfKind[k]! >= 0 && t.mannedTicks[k] === 0) never.push(STATION_NAMES[k]!);
  return [
    `Survived ${clock(durationSeconds(state.tick))}  ${state.endReason === EndReason.Hull ? 'HULL LOST' : 'CREW LOST'}`,
    `First down: ${event(t.firstDownTick, t.firstDownPid)}   First death: ${event(t.firstDeathTick, t.firstDeathPid)}`,
    never.length ? `Never manned: ${never.join(', ')}` : 'Every station manned',
    `Longest idle: ${names.map((n, pid) => `${n} ${Math.round(durationSeconds(t.longestIdle[pid]!))} s`).join(', ')}`
  ];
}
```

and in `buildHudModel` the summary becomes `summary: state && phase === 'gameover' ? [...headlineSummary(state), ...gainsSummary(state)] : null`.

`hud.ts`: `summaryRows` length `4` → `8` (same `88 + k * LINE` spacing).

- [ ] **Step 5: Run and full suite**

`npx vitest run tests/telemetryStore.test.ts tests/session.test.ts tests/hud.test.ts tests/render.test.ts tests/renderPure.test.ts` → PASS. `npm test`, `npm run typecheck`, `npm run build` → pass; golden unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/app/telemetryStore.ts src/renderer/src/app/session.ts src/renderer/src/main.ts src/renderer/src/render/hudModel.ts src/renderer/src/render/hud.ts tests/telemetryStore.test.ts tests/session.test.ts tests/hud.test.ts
git commit -m "feat: capped telemetry history in localStorage with recovery; the session saves a record on the ending tick; four game-over headline lines and eight summary rows"
```

---

### Task 4: Gate, acceptance table, spec amendments, roadmap

**Files:**
- Modify: `docs/gates.md`, `docs/superpowers/specs/2026-11-10-telemetry-design.md`, `docs/roadmap.md`

- [ ] **Step 1: Run the acceptance soak and paste the table**

`npm run acceptance` (20 minutes × 9 runs; expect roughly a minute). Append to `docs/gates.md`:

```markdown
## Increment 4-ii: telemetry and acceptance (closes the foundation's Increment 4 and the Foundation sub-project)
- [x] `npm test` passes: telemetry (initial values, manned ticks and the stale-occupant guard, idle streaks incl. the revive arbitration and the mixed repair-then-downed case, first down/death with pid and same-tick tie, ending-tick capture through step(), final-state sample of a downed operator, scratch clearing, spawns/phase entries/maxStress, pinned evasion and impact rolls, shots and hits for hit/miss/torpedo/rejected, repairs per kind), record (exact mapping, rounding, present-on-the-ship filter, purity, JSON round trip), snapshot (all 17 fields round-trip and hash, version-8 rejection, continuation through a new longest idle and a bleed-out), store (missing key, append order, 50-to-51 boundary, malformed roots, throwing storage), session (hull loss and crew loss records, fault without a record, no dependency), HUD (headline lines, CREW LOST, every station manned, eight lines at four players), acceptance (oracle equality, repeatability, crew lists, early end, table and CLI orchestration).
- [x] `npm run acceptance 1 1` prints a header and three rows (1, 2 and 4 players) and exits 0.
- [x] Automated soak observables (unmanned-console bot crew; the station-choice and task-clarity questions of foundation section 10 remain for the human playtest), `npm run acceptance`, 2026-11-11:

<paste the table here verbatim>

- [ ] Manual, four players (`npm run dev`): a game over shows exactly eight summary lines in order (run length and reason, first down/first death, never manned, longest idle, then four skill lines), all visible and evenly spaced; `localStorage['ftlite-telemetry']` holds the run's record afterwards (DevTools console). Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.
```

- [ ] **Step 2: Spec amendments and roadmap**

Append to the spec:

```markdown
## 13. Amendments from the plan
- The telemetry block has ten scalars (`firstDownTick, firstDownPid, firstDeathTick, firstDeathPid, impacts, evadeRolls, evasions, shots, hits, maxStress`), then `mannedTicks, idleRun, longestIdle, prevLife, spawns, repairs, phaseEntries`; section 4 said nine.
- The "layout missing a station kind" fixture sets `derived.stationOfKind[kind] = -1` on a starter state, since `parseShip` requires one station per kind.
- The acceptance table renders `ended-at` as `m:ss` with a tenth when the duration is fractional, `never-manned` as a comma list or `none`, `longest-idle` as per-player seconds joined by `/`, `spawns` as `fire/breach/power/debris`.
```

`docs/roadmap.md`: item 4 → `merged 2026-11-11` (set after the merge, as the previous items were), item 5 → `next`.

- [ ] **Step 3: Verify and commit**

`npm run typecheck`, `npm test`, `npm run build` → pass.

```bash
git add docs/gates.md docs/superpowers/specs/2026-11-10-telemetry-design.md docs/roadmap.md
git commit -m "docs: increment 4-ii gate with the acceptance soak table, spec amendments, roadmap status"
```
