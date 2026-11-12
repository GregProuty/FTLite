# Progression and Permadeath (Run-iii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A run ends with a score, progress persists in localStorage as three start-bonus unlocks, every run's ship has a quirk drawn from a seventh stream, and the lobby and game-over screens show progress, per `docs/superpowers/specs/2026-11-11-progression-design.md`.

**Architecture:** `sim/score.ts` (pure score over the record), `sim/progress.ts` (`UNLOCKS`, `applyRun`, `applyStartBonuses`, pure), `sim/quirks.ts` (`QUIRKS`, six hooks), a `quirk` stream and `run.quirk/startBonus` (SIM_VERSION 15), `SimOptions` on `createSimState`, six one-expression hook sites; `app/progressStore.ts` over the existing `RecordStorage`; the session loads, applies and saves progress and passes a `HudProgress` to `buildHudModel`; the HUD gains the quirk on the clock, the score, the ship line and the progress lines; record and table gain `quirk`, `unlocks`, `score`.

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), Pixi 8.19 (hud.ts only). No new dependencies.

## Spec amendments made by this plan (recorded in Task 3)

- `applyStartBonuses(state, unlocked)` and `veteranRepairXp(level)` live in `sim/progress.ts`; `state.ts` imports them (progress.ts imports only types from state).
- The score shown in the headline is `telemetryRecord(state, 0).score` (the seed does not affect the score).
- The quirk draw happens right after the state literal, before `spawnCrew`; head starts and bonuses follow (same stream result as the spec's order: nothing in between draws).

## Global Constraints

- `tests/boundary.test.ts` stays green; sim files ASCII; `hudModel.ts` pixi-free; every test under node.
- Streams (exact): `STREAM_NAMES = ['hazards', 'director', 'combat', 'loot', 'cosmetic', 'map', 'quirk']`; the six existing streams keep their seeds (the Run-i pins and `deriveStreams(1).map.s` are asserted unchanged). Exactly one `nextInt(rng.quirk, QUIRK_COUNT)` in `createSimState`, before any override; no other code touches `rng.quirk`. No hook draws.
- `createSimState(layout, playerCount, seed, characters = DEFAULT_CHARACTERS, options: SimOptions = {})`, `SimOptions = { unlocked?: readonly string[]; quirk?: number }`. Order: literal (map from `rng.map`) → `run.quirk = nextInt(rng.quirk, QUIRK_COUNT)` → override → `spawnCrew` loop → `applyHeadStarts` → `applyStartBonuses` in `UNLOCKS` order. Unknown ids ignored. No options → initial state unchanged except `quirk`.
- Hooks (exact single expressions): `passageFor` closed branch `PASSAGE_CLOSED * quirkPassageMult(state)`; `heatStep` `HEAT_RISE + quirkHeatRise(state)`; `doorSystem` `closeTimer[e] = DOOR_CLOSE_DELAY * quirkDoorDelayMult(state)`; `resolveImpact` debris branch `DEBRIS_HULL_DAMAGE + quirkDebrisHullOffset(state)` (shot branch untouched); `scienceLead` `+ quirkLeadOffset(state)` on both branches; `jumpStep` `DT / (JUMP_CHARGE_TIME * quirkChargeMult(state))`. Each hook returns its value only when `run.quirk === idx`, else `1`/`0`.
- Score (exact): `SCORE_NODE 100`, `SCORE_VICTORY 500`, `SCORE_ENEMY 20`, `SCORE_BOARDER 5`; `runScore(r) = 100 × nodesReached + (victory ? 500 : 0) + scrap.earned + 20 × enemy.destroyed + 5 × boarders.killed`; `telemetryRecord` returns `{ ...record, score: runScore(record) }`.
- Unlocks (exact): ids `scrap-reserve` (`runs >= 1`, start scrap 30 via `addScrap`), `torpedo-rack` (`bestNodes >= 4`, `torpedoStock = min(TORP_CAP, stock + 2)`), `veteran-crew` (`victories >= 1`, Repair XP `XP_THRESHOLDS[min(headStartRepair + 1, SKILL_MAX)]` assigned directly). `applyRun` returns a new object; conditions evaluated on the updated counters; `unlocked` in `UNLOCKS` order, no duplicates.
- Store (exact): key `ftlite-progress`; sanitization as spec §4; failures swallowed.
- Flatten: `run` gains `quirk, startBonus` after `upgrades` (`RUN_FIELDS = 4 + 7 × RUN_COLUMNS + 3 + STATION_COUNT + 2`); `SIM_VERSION = 15`; version-14 rejected; rng section and header grow via `STREAM_NAMES`.
- HUD strings (exact): clock `` `HULL ${hull}   TIME ${s}s   node ${c}/${columns}   ${quirk}` `` (suffix omitted when `quirk === ''`); headline line 1 `` `Survived ${clock}  ${END}  Reached node ${n} of 8  Score ${score}` ``; line 5 `` `Ship: ${quirkName}` ``; line 6 `` `Best ${bestScore}   Runs ${runs}   Victories ${victories}` `` (progress given); line 7 `` `Unlocked: ${names}` `` (non-empty only); then gains. Lobby `` `${LOBBY_MSG}   Runs ${runs}  Best ${bestScore}${unlocked.length ? `  Unlocked: ${names}` : ''}` ``. Eleven summary rows.
- Gates: survival and boarding with the natural quirk, figures recorded with deltas against Run-ii (drift expected; levers only for a failing assertion, in the Run-i order); `gate-jump` and `gate-run` with `{ quirk: 3 }` and the same end tick 25200; golden re-blessed once in Task 1 after the gates.
- Commits: imperative, `feat:`/`test:`/`docs:`, ending `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. `npm run typecheck`, `npm test`, `npm run build` at the end of every task.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/score.ts` (new) | `runScore`. |
| `src/renderer/src/sim/progress.ts` (new) | `Progress`, `EMPTY_PROGRESS`, `UNLOCKS`, `unlockNames`, `applyRun`, `veteranRepairXp`, `applyStartBonuses`. |
| `src/renderer/src/sim/quirks.ts` (new) | `QUIRKS`, `QUIRK_NAMES`, the six hooks. |
| `src/renderer/src/sim/{state,flatten,tuning,telemetry,acceptance,run,heat,doors,debris}.ts`, `hazards/oxygen.ts` | Task 1. |
| `src/renderer/src/app/progressStore.ts` (new), `app/session.ts`, `main.ts`, `render/{hudModel,hud}.ts` | Task 2. |
| `tests/progression.test.ts` (new), `tests/{run,snapshot,telemetry,acceptance,gate-survival,gate-boarding,gate-jump,gate-run,session,hud}.test.ts`, `tests/helpers/sim.ts` | as the tasks say. |
| `docs/gates.md`, the spec, `docs/roadmap.md` | Task 3. |

---

### Task 1: Score, progress logic, quirks, start bonuses, state and record

**Files:**
- Create: `src/renderer/src/sim/score.ts`, `progress.ts`, `quirks.ts`, `tests/progression.test.ts`
- Modify: `src/renderer/src/sim/state.ts`, `flatten.ts`, `tuning.ts`, `telemetry.ts`, `acceptance.ts`, `run.ts`, `heat.ts`, `doors.ts`, `debris.ts`, `hazards/oxygen.ts`, `tests/helpers/sim.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts`, `tests/telemetry.test.ts`, `tests/acceptance.test.ts`, `tests/gate-survival.test.ts`, `tests/gate-boarding.test.ts`, `tests/gate-jump.test.ts`, `tests/gate-run.test.ts`, `tests/golden/basic.json` (re-bless)

**Interfaces:**
- Produces: `runScore`, `Progress`, `EMPTY_PROGRESS`, `UNLOCKS`, `unlockNames`, `applyRun`, `applyStartBonuses`, `veteranRepairXp`, `QUIRKS`, `QUIRK_NAMES`, `QUIRK_COUNT`, the six hooks, `SimOptions`, `run.quirk`, `run.startBonus`, `rng.quirk`, `TelemetryRecord.score`, `run.quirk`/`run.unlocks` on the record, the `score` column; helpers `makeState(players, seed, characters, options)`, `quirkState(k, seed)`.

- [ ] **Step 0: Baseline**

`npx vitest run tests/gate-survival.test.ts tests/gate-boarding.test.ts tests/gate-jump.test.ts tests/gate-run.test.ts` with temporary `console.log`s of the figures (and `s.tick` for the jump and run gates), then `git checkout` the test files. Record the lines: survival and boarding will drift (the quirk); jump and run must stay 25200.

- [ ] **Step 1: Write the failing tests**

`tests/helpers/sim.ts`: `makeState(players = 2, seed = 1, characters: readonly number[] = RECRUITS, options: SimOptions = {})` forwarding `options`; `export function quirkState(k: number, seed = 1): SimState { return makeState(2, seed, RECRUITS, { quirk: k }); }` (import `SimOptions` type from state).

Create `tests/progression.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runScore } from '../src/renderer/src/sim/score';
import { EMPTY_PROGRESS, UNLOCKS, applyRun, veteranRepairXp, type Progress } from '../src/renderer/src/sim/progress';
import { QUIRKS, QUIRK_NAMES, quirkPassageMult, quirkHeatRise, quirkDoorDelayMult, quirkDebrisHullOffset, quirkLeadOffset, quirkChargeMult } from '../src/renderer/src/sim/quirks';
import { deriveStreams } from '../src/renderer/src/sim/state';
import { telemetryRecord, type TelemetryRecord } from '../src/renderer/src/sim/telemetry';
import { saveSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { oxygenStep, passageFor } from '../src/renderer/src/sim/hazards/oxygen';
import { heatStep } from '../src/renderer/src/sim/heat';
import { scienceLead } from '../src/renderer/src/sim/debris';
import { DoorState } from '../src/renderer/src/sim/grid';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { Skill } from '../src/renderer/src/sim/skillIds';
import { skillLevelOf } from '../src/renderer/src/sim/skills';
import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';
import { createRng, nextInt } from '../src/shared/rng';
import { TICK_HZ, DT, HULL_MAX, HEAT_RISE, DOOR_CLOSE_DELAY, PASSAGE_CLOSED, DEBRIS_HULL_DAMAGE, ENEMY_SHOT_HULL_DAMAGE, SCIENCE_LEAD_UNMANNED, JUMP_CHARGE_TIME, QUIRK_COUNT, TORP_START, TORP_CAP, SKILL_MAX, XP_THRESHOLDS, UNLOCK_SCRAP } from '../src/renderer/src/sim/tuning';
import { makeState, quirkState, run, quiet, intents, teleport, placeDebris, placeShot, room, overdrive, seatNavigator, chargeJump } from './helpers/sim';
import { sitDown } from '../src/renderer/src/sim/stations';
import { RECRUITS } from './helpers/sim';

const rec = (over: Partial<TelemetryRecord> = {}): Omit<TelemetryRecord, 'score'> => ({
  version: 1, simVersion: 15, seed: 1, playerCount: 2, characters: ['Recruit', 'Recruit'], endReason: 'running', durationSeconds: 0,
  firstDown: null, firstDeath: null, stationsNeverManned: [], mannedSeconds: {}, longestIdleSeconds: [0, 0],
  spawns: { fire: 0, breach: 0, power: 0, debris: 0 }, impacts: 0, evadeRolls: 0, evasions: 0, shots: 0, hits: 0,
  repairs: { fire: 0, breach: 0, power: 0 }, maxStress: 0, phaseEntries: { buildUp: 0, sustainPeak: 0, peakFade: 0, relax: 0 }, enemy: { met: 0, destroyed: 0, disables: 0 }, boarders: { parties: 0, killed: 0 },
  run: { nodesReached: 0, jumps: 0, columns: 8, scrap: { earned: 0, spent: 0 }, events: 0, purchases: 0, upgrades: [], quirk: 'Leaky Seals', unlocks: [] }, skills: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]], ...over
});
const runOver = (o: Partial<TelemetryRecord['run']>) => ({ ...rec().run, ...o });

describe('score', () => {
  it('weights nodes, victory, scrap and kills; zero for a fresh record; the record carries it', () => {
    expect(runScore(rec({ endReason: 'victory', run: runOver({ nodesReached: 7, scrap: { earned: 145, spent: 30 } }) }))).toBe(1345);
    expect(runScore(rec({ endReason: 'hull', run: runOver({ nodesReached: 3, scrap: { earned: 45, spent: 0 } }), boarders: { parties: 1, killed: 2 } }))).toBe(355);
    expect(runScore(rec())).toBe(0);
    const s = makeState(2); s.run.nodesReached = 2; s.telemetry.scrapEarned = 30; s.telemetry.boardersKilled = 1;
    const r = telemetryRecord(s, 1); expect(r.score).toBe(235); expect(r.score).toBe(runScore(r));
  });
});

describe('progress', () => {
  const clone = (p: Progress) => JSON.parse(JSON.stringify(p)) as Progress;
  it('counts runs, victories and bests and unlocks in UNLOCKS order without mutating its input', () => {
    const p0 = EMPTY_PROGRESS; const copy = clone(p0);
    const p1 = applyRun(p0, { ...rec({ endReason: 'hull', run: runOver({ nodesReached: 2, scrap: { earned: 30, spent: 0 } }) }), score: 230 });
    expect(p1).toEqual({ version: 1, runs: 1, victories: 0, bestScore: 230, bestNodes: 2, unlocked: ['scrap-reserve'] }); expect(p0).toEqual(copy);
    const p2 = applyRun(p1, { ...rec({ endReason: 'crew', run: runOver({ nodesReached: 5 }) }), score: 500 });
    expect([p2.runs, p2.bestNodes, p2.unlocked]).toEqual([2, 5, ['scrap-reserve', 'torpedo-rack']]);
    const p3 = applyRun(p2, { ...rec({ endReason: 'victory', run: runOver({ nodesReached: 7 }) }), score: 1200 });
    expect([p3.victories, p3.bestScore, p3.unlocked]).toEqual([1, 1200, ['scrap-reserve', 'torpedo-rack', 'veteran-crew']]);
    const direct = applyRun(EMPTY_PROGRESS, { ...rec({ endReason: 'victory', run: runOver({ nodesReached: 7 }) }), score: 1200 });
    expect(direct.unlocked).toEqual(['scrap-reserve', 'torpedo-rack', 'veteran-crew']);
    const p4 = applyRun(p3, { ...rec({ endReason: 'hull', run: runOver({ nodesReached: 1 }) }), score: 100 });
    expect([p4.bestScore, p4.bestNodes, p4.unlocked.length, p4.runs]).toEqual([1200, 7, 3, 4]);
    expect(UNLOCKS.map((u) => u.id)).toEqual(['scrap-reserve', 'torpedo-rack', 'veteran-crew']);
  });
  it('veteranRepairXp caps at SKILL_MAX', () => { expect(veteranRepairXp(0)).toBe(XP_THRESHOLDS[1]); expect(veteranRepairXp(3)).toBe(XP_THRESHOLDS[4]); expect(veteranRepairXp(SKILL_MAX)).toBe(XP_THRESHOLDS[SKILL_MAX]); });
});

describe('start bonuses', () => {
  it('apply all three, ignore unknown ids, cap torpedoes', () => {
    const s = makeState(2, 1, DEFAULT_CHARACTERS, { unlocked: ['scrap-reserve', 'torpedo-rack', 'veteran-crew'] });
    expect([s.run.scrap, s.telemetry.scrapEarned, s.weapons.torpedoStock, s.run.startBonus]).toEqual([UNLOCK_SCRAP, UNLOCK_SCRAP, TORP_START + 2, 0b111]);
    expect(skillLevelOf(s, 0, Skill.Repair)).toBe(4); expect(skillLevelOf(s, 1, Skill.Repair)).toBe(1);   // Okoro 3 -> 4, Lindqvist 0 -> 1
    const plain = makeState(2, 1, DEFAULT_CHARACTERS), bogus = makeState(2, 1, DEFAULT_CHARACTERS, { unlocked: ['bogus'] });
    expect(bogus.run.startBonus).toBe(0); expect(hashState(bogus)).toBe(hashState(plain));
    const t = makeState(2, 1, RECRUITS, { unlocked: ['torpedo-rack'] }); expect(t.weapons.torpedoStock).toBe(Math.min(TORP_CAP, TORP_START + 2)); expect(t.run.startBonus).toBe(0b010);
    expect(telemetryRecord(s, 1).run.unlocks).toEqual(['scrap-reserve', 'torpedo-rack', 'veteran-crew']); expect(telemetryRecord(t, 1).run.unlocks).toEqual(['torpedo-rack']);
  });
});

describe('quirk', () => {
  it('one draw from the seventh stream, the other streams unchanged, the override keeps the draw, names line up', () => {
    const ref = deriveStreams(7); const expected = nextInt(ref.quirk, QUIRK_COUNT);
    const s = makeState(2, 7); expect(s.run.quirk).toBe(expected); expect(s.rng.quirk.s).toBe(ref.quirk.s);
    const one = deriveStreams(1); expect([one.hazards.s, one.director.s, one.combat.s]).toEqual([2693262067, 11749833, 2265367787]);
    expect(makeState(2, 1).rng.map.s).toBe(/* the pre-feature value of makeState(2, 1).rng.map.s recorded in Step 0 */ 0);
    const o = makeState(2, 7, RECRUITS, { quirk: 5 }); expect(o.run.quirk).toBe(5); expect(o.rng.quirk.s).toBe(ref.quirk.s);
    expect(QUIRKS).toHaveLength(QUIRK_COUNT); expect(QUIRK_NAMES).toEqual(['Leaky Seals', 'Hot Reactor', 'Sticky Doors', 'Lucky Hull', 'Twitchy Sensors', 'Old Drive']);
    expect(telemetryRecord(o, 1).run.quirk).toBe('Old Drive');
    const hooks = [quirkPassageMult, quirkHeatRise, quirkDoorDelayMult, quirkDebrisHullOffset, quirkLeadOffset, quirkChargeMult], values = [2, 1, 2, -2, 4, 1.25], neutral = [1, 0, 1, 0, 0, 1];
    for (let k = 0; k < QUIRK_COUNT; k++) for (let h = 0; h < 6; h++) expect(hooks[h]!(quirkState(k))).toBe(h === k ? values[h] : neutral[h]);
  });
  it('0 Leaky Seals: a closed door passes twice the oxygen', () => {
    const flow = (k: number) => { const s = quirkState(k); const A = room(s, 'A'), I = room(s, 'I'); s.rooms.o2.fill(0); s.rooms.o2[A] = s.derived.volume[A]!; s.doors.state[0] = DoorState.Closed; expect(passageFor(s, 0)).toBe(k === 0 ? PASSAGE_CLOSED * 2 : PASSAGE_CLOSED); oxygenStep(s, new Float64Array(s.rooms.o2.length)); return s.rooms.o2[I]!; };
    const quirky = flow(0), control = flow(5); expect(control).toBeGreaterThan(0); expect(quirky).toBeCloseTo(2 * control, 9);
  });
  it('1 Hot Reactor: one more heat per hazard tick while overdriven', () => {
    const heat = (k: number) => { const s = quirkState(k); const i = overdrive(s, StationKind.Weapons); heatStep(s); return s.stations.heat[i]!; };
    expect(heat(1)).toBe(HEAT_RISE + 1); expect(heat(0)).toBe(HEAT_RISE);
  });
  it('2 Sticky Doors: a door stays open twice as long after the zone clears', () => {
    const closeTicks = (k: number) => { const s = quirkState(k); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; const t = s.derived.edgeTile[0]!, w = s.derived.width, tx = t % w, ty = (t - tx) / w; teleport(s, 0, tx + 0.5, ty + 0.5); run(s, 1); expect(s.doors.state[0]).toBe(DoorState.Open); teleport(s, 0, 2.5, 9.5); teleport(s, 1, 3.5, 9.5); let n = 0; while (s.doors.state[0] !== DoorState.Closed && n < 1000) { run(s, 1); n++; } return n; };
    const quirky = closeTicks(2), control = closeTicks(0); expect(control).toBe(Math.round(DOOR_CLOSE_DELAY * TICK_HZ)); expect(quirky).toBe(Math.round(2 * DOOR_CLOSE_DELAY * TICK_HZ));
  });
  it('3 Lucky Hull: debris costs 6 hull, shots are unchanged', () => {
    const hit = (k: number, shot: boolean) => { const s = quirkState(k); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; const A = room(s, 'A'); if (shot) placeShot(s, A, 1); else placeDebris(s, A, 1); run(s, 1); return HULL_MAX - s.hull; };
    expect(hit(3, false)).toBe(DEBRIS_HULL_DAMAGE - 2); expect(hit(5, false)).toBe(DEBRIS_HULL_DAMAGE); expect(hit(3, true)).toBe(ENEMY_SHOT_HULL_DAMAGE); expect(hit(5, true)).toBe(ENEMY_SHOT_HULL_DAMAGE);
  });
  it('4 Twitchy Sensors: the lead is 4 s longer manned or not', () => {
    const lead = (k: number, seated: boolean) => { const s = quirkState(k); if (seated) sitDown(s, 0, s.derived.stationOfKind[StationKind.Science]!); return scienceLead(s); };
    expect(lead(4, false)).toBe(SCIENCE_LEAD_UNMANNED + 4); expect(lead(0, false)).toBe(SCIENCE_LEAD_UNMANNED); expect(lead(4, true)).toBeCloseTo(22); expect(lead(0, true)).toBeCloseTo(18);
  });
  it('5 Old Drive: the charge takes 75 s; the ready tick is 4500', () => {
    const q = quirkState(5); quiet(q); q.enemy.nextArrivalTick = 1e9; q.boarders.nextArrivalTick = 1e9; run(q, 1); expect(q.run.jumpCharge).toBeCloseTo(DT / (JUMP_CHARGE_TIME * 1.25), 12);
    const c = quirkState(0); quiet(c); c.enemy.nextArrivalTick = 1e9; c.boarders.nextArrivalTick = 1e9; run(c, 1); expect(c.run.jumpCharge).toBeCloseTo(DT / JUMP_CHARGE_TIME, 12);
    const ready = (k: number) => { const s = quirkState(k); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; seatNavigator(s, 0); run(s, 1); let n = 1; while (s.telemetry.jumps === 0 && n < 6000) { run(s, 1, () => intents({ confirmPressed: true }, {})); n++; } return s.tick; };
    expect(ready(5)).toBe(4500); expect(ready(0)).toBe(3600);
    void chargeJump;
  });
  it('snapshot: quirk and startBonus round trip and hash; the header carries the quirk stream', () => {
    const s = makeState(2, 5, DEFAULT_CHARACTERS, { unlocked: ['scrap-reserve'] }); s.run.quirk = 4;
    const snap = saveSnapshot(s); expect(snap.header.rngStates['quirk']).toBe(s.rng.quirk.s);
    const base = hashState(makeState(2, 5)); const m1 = makeState(2, 5); m1.run.quirk = (m1.run.quirk + 1) % QUIRK_COUNT; const m2 = makeState(2, 5); m2.run.startBonus = 1;
    expect(hashState(m1)).not.toBe(base); expect(hashState(m2)).not.toBe(base);
  });
});
```

(The snapshot round trip itself goes in `tests/snapshot.test.ts`: the version test moves to 14; the round-trip test sets `s.run.quirk = 4; s.run.startBonus = 5;` and asserts both back and `t.rng.quirk.s`.) `tests/run.test.ts`: the map test's unchanged-seed pins gain `expect(makeState(2, 1).rng.map.s).toBe(<Step 0 value>)` (move the pin here or in progression; one place is enough: put it in progression.test.ts only). `tests/telemetry.test.ts`: the exact-record fixture gains `quirk: QUIRK_NAMES[s.run.quirk]`, `unlocks: []` in `run` and `score: 300 + 60 + 20 + 10 = 390` (nodesReached 3, scrapEarned 60, enemiesDestroyed 1, boardersKilled 2) at the top level; add `expect(telemetryRecord(s, 9).score).toBe(runScore(telemetryRecord(s, 9)))`. `tests/acceptance.test.ts`: `rec()` gains `score: 0` and `run` gains `quirk: 'Leaky Seals', unlocks: []`; the header regex ends `scrap\s+score$`; row tails `0\/0$` → `0\/0\s+0$`; the victory row passes `score: 1345` and asserts `/145\/30\s+1345$/`. Gates: `tests/gate-jump.test.ts` and `tests/gate-run.test.ts`: `makeState(2, 1, RECRUITS, { quirk: 3 })` with the comment `// Lucky Hull: no debris flies in this gate, so the quirk is inert and the end tick stays 25200 (spec Run-iii section 8)`; `tests/gate-survival.test.ts` and `tests/gate-boarding.test.ts` are unchanged in code (natural quirk).

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/progression.test.ts tests/snapshot.test.ts tests/telemetry.test.ts tests/acceptance.test.ts` → module-not-found for score/progress/quirks; `makeState` arity; missing fields.

- [ ] **Step 3: tuning, quirks, score, progress, state, flatten, hooks, record, table**

`tuning.ts`: `SIM_VERSION = 15`; append:

```ts
// Progression and permadeath (Run-iii)
export const SCORE_NODE = 100, SCORE_VICTORY = 500, SCORE_ENEMY = 20, SCORE_BOARDER = 5;
export const UNLOCK_SCRAP = 30, UNLOCK_TORPEDOES = 2;
export const QUIRK_COUNT = 6;
export const QUIRK_PASSAGE_MULT = 2, QUIRK_HEAT_RISE = 1, QUIRK_DOOR_DELAY_MULT = 2, QUIRK_DEBRIS_OFFSET = -2, QUIRK_LEAD_OFFSET = 4, QUIRK_CHARGE_MULT = 1.25;
```

Create `quirks.ts`:

```ts
import type { SimState } from './state';
import { QUIRK_PASSAGE_MULT, QUIRK_HEAT_RISE, QUIRK_DOOR_DELAY_MULT, QUIRK_DEBRIS_OFFSET, QUIRK_LEAD_OFFSET, QUIRK_CHARGE_MULT } from './tuning';

/** The ship's quirk for this run (spec Run-iii section 5): one rule changed, drawn once at creation. Each hook is neutral for every other quirk. */
export const QUIRKS: readonly { id: string; name: string; text: string }[] = [
  { id: 'leaky-seals', name: 'Leaky Seals', text: 'Closed doors leak twice the air.' },
  { id: 'hot-reactor', name: 'Hot Reactor', text: 'Overdrive heats one unit faster.' },
  { id: 'sticky-doors', name: 'Sticky Doors', text: 'Doors close twice as slowly.' },
  { id: 'lucky-hull', name: 'Lucky Hull', text: 'Debris does two less hull damage.' },
  { id: 'twitchy-sensors', name: 'Twitchy Sensors', text: 'Four more seconds of warning.' },
  { id: 'old-drive', name: 'Old Drive', text: 'The jump drive takes 75 seconds.' }
];
export const QUIRK_NAMES: readonly string[] = QUIRKS.map((q) => q.name);
const is = (state: SimState, k: number): boolean => state.run.quirk === k;
export function quirkPassageMult(state: SimState): number { return is(state, 0) ? QUIRK_PASSAGE_MULT : 1; }
export function quirkHeatRise(state: SimState): number { return is(state, 1) ? QUIRK_HEAT_RISE : 0; }
export function quirkDoorDelayMult(state: SimState): number { return is(state, 2) ? QUIRK_DOOR_DELAY_MULT : 1; }
export function quirkDebrisHullOffset(state: SimState): number { return is(state, 3) ? QUIRK_DEBRIS_OFFSET : 0; }
export function quirkLeadOffset(state: SimState): number { return is(state, 4) ? QUIRK_LEAD_OFFSET : 0; }
export function quirkChargeMult(state: SimState): number { return is(state, 5) ? QUIRK_CHARGE_MULT : 1; }
```

Create `score.ts`:

```ts
import type { TelemetryRecord } from './telemetry';
import { SCORE_NODE, SCORE_VICTORY, SCORE_ENEMY, SCORE_BOARDER } from './tuning';
/** The run's score from its record (spec Run-iii section 3). Reads only existing fields. */
export function runScore(r: Omit<TelemetryRecord, 'score'>): number {
  return SCORE_NODE * r.run.nodesReached + (r.endReason === 'victory' ? SCORE_VICTORY : 0) + r.run.scrap.earned + SCORE_ENEMY * r.enemy.destroyed + SCORE_BOARDER * r.boarders.killed;
}
```

Create `progress.ts`:

```ts
import type { SimState } from './state';
import type { TelemetryRecord } from './telemetry';
import { Skill, xpIndex } from './skillIds';
import { characterOf } from './characters';
import { addScrap } from './scrap';
import { XP_THRESHOLDS, SKILL_MAX, TORP_CAP, UNLOCK_SCRAP, UNLOCK_TORPEDOES } from './tuning';

export interface Progress { version: 1; runs: number; victories: number; bestScore: number; bestNodes: number; unlocked: string[] }
export const EMPTY_PROGRESS: Progress = { version: 1, runs: 0, victories: 0, bestScore: 0, bestNodes: 0, unlocked: [] };
/** Unlocks in display and application order (spec Run-iii section 4). */
export const UNLOCKS: readonly { id: string; name: string; earned: (p: Progress) => boolean }[] = [
  { id: 'scrap-reserve', name: 'Scrap reserve', earned: (p) => p.runs >= 1 },
  { id: 'torpedo-rack', name: 'Torpedo rack', earned: (p) => p.bestNodes >= 4 },
  { id: 'veteran-crew', name: 'Veteran crew', earned: (p) => p.victories >= 1 }
];
export function unlockNames(ids: readonly string[]): string[] { return UNLOCKS.filter((u) => ids.includes(u.id)).map((u) => u.name); }
/** Count a finished run and append the newly earned unlocks, in UNLOCKS order. Pure. */
export function applyRun(p: Progress, r: TelemetryRecord): Progress {
  const next: Progress = { version: 1, runs: p.runs + 1, victories: p.victories + (r.endReason === 'victory' ? 1 : 0), bestScore: Math.max(p.bestScore, r.score), bestNodes: Math.max(p.bestNodes, r.run.nodesReached), unlocked: [...p.unlocked] };
  next.unlocked = UNLOCKS.filter((u) => next.unlocked.includes(u.id) || u.earned(next)).map((u) => u.id);
  return next;
}
export function veteranRepairXp(headStartLevel: number): number { return XP_THRESHOLDS[Math.min(headStartLevel + 1, SKILL_MAX)]!; }
/** Start bonuses at creation (spec Run-iii section 5), after the head starts; sets run.startBonus. */
export function applyStartBonuses(state: SimState, unlocked: readonly string[]): void {
  let mask = 0;
  UNLOCKS.forEach((u, i) => { if (unlocked.includes(u.id)) mask |= 1 << i; });
  state.run.startBonus = mask;
  if (mask & 1) addScrap(state, UNLOCK_SCRAP);
  if (mask & 2) state.weapons.torpedoStock = Math.min(TORP_CAP, state.weapons.torpedoStock + UNLOCK_TORPEDOES);
  if (mask & 4) for (let pid = 0; pid < state.playerCount; pid++) { const level = characterOf(state, pid).headStart.find((h) => h.skill === Skill.Repair)?.level ?? 0; state.skills.xp[xpIndex(pid, Skill.Repair)] = veteranRepairXp(level); }
}
```

(Cycle check: `progress.ts` imports `characters.ts`, `scrap.ts`, `skillIds.ts`, tuning, and types only from `state.ts`/`telemetry.ts`; `state.ts` imports `progress.ts` for `applyStartBonuses` and already imports `characters.ts`; `characters.ts` imports type `SimState` only. `telemetry.ts` imports `score.ts`; `score.ts` imports only the type from `telemetry.ts`.)

`state.ts`: `RngStreams` gains `quirk`; `STREAM_NAMES` appends `'quirk'`; `export interface SimOptions { unlocked?: readonly string[]; quirk?: number }`; the signature gains `options: SimOptions = {}`; `run` gains `quirk: number; startBonus: number` (literal `quirk: 0, startBonus: 0`); after the literal: `state.run.quirk = nextInt(rng.quirk, QUIRK_COUNT); if (options.quirk !== undefined) state.run.quirk = options.quirk;` then the `spawnCrew` loop, `applyHeadStarts(state)`, `applyStartBonuses(state, options.unlocked ?? [])`. `flatten.ts`: `RUN_FIELDS = 4 + 7 * RUN_COLUMNS + 3 + STATION_COUNT + 2`; after the `upgrades` puts `put(rn.quirk); put(rn.startBonus);` and the mirror gets.

Hooks: `hazards/oxygen.ts:13` → `if (st !== DoorState.Sealed) return PASSAGE_CLOSED * quirkPassageMult(state);`; `heat.ts:46` → `st.heat[i]! + HEAT_RISE + quirkHeatRise(state) - st.coolant[i]! * cool`; `doors.ts:51` → `state.doors.closeTimer[e] = DOOR_CLOSE_DELAY * quirkDoorDelayMult(state);`; `debris.ts:79` → `(db.kind[slot] === ObjectKind.Shot ? ENEMY_SHOT_HULL_DAMAGE : DEBRIS_HULL_DAMAGE + quirkDebrisHullOffset(state))`; `scienceLead` → `const q = quirkLeadOffset(state); if (...) return SCIENCE_LEAD_UNMANNED + q; return SCIENCE_LEAD_BASE + SCIENCE_LEAD_SCALE * stationOutput(state, sci) + q;`; `run.ts` `jumpStep` → `DT / (JUMP_CHARGE_TIME * quirkChargeMult(state))`. Each file imports its hook from `./quirks` (or `../quirks`).

`telemetry.ts`: `TelemetryRecord.run` gains `quirk: string; unlocks: string[]`; the record gains `score: number`; the builder: `const record = { ..., run: { ..., quirk: QUIRK_NAMES[state.run.quirk]!, unlocks: UNLOCKS.filter((_, i) => state.run.startBonus & (1 << i)).map((u) => u.id) }, skills }; return { ...record, score: runScore(record) };` (imports `QUIRK_NAMES`, `UNLOCKS`, `runScore`). `acceptance.ts`: `COLUMNS` gains `'score'`; `row` pushes `String(r.score)`.

- [ ] **Step 4: Run, gates, re-bless, full suite**

`npx vitest run tests/progression.test.ts tests/snapshot.test.ts tests/telemetry.test.ts tests/acceptance.test.ts tests/run.test.ts tests/boundary.test.ts` → PASS (fill the `rng.map.s` pin from Step 0; fixture arithmetic fixed only with a stated cause). Gates with temporary logs: `gate-jump` and `gate-run` end at 25200 with the same totals; `gate-survival` and `gate-boarding` record each seed's quirk name (`QUIRK_NAMES[s.run.quirk]`) and figures; compare to Step 0 and note the deltas; if an assertion fails, apply the Run-i levers in order and record. Then `npm run bless` (cause: SIM_VERSION 15, the quirk stream and two fields hashed; record the golden's quirk name), `npm test`, `npm run typecheck`, `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/score.ts src/renderer/src/sim/progress.ts src/renderer/src/sim/quirks.ts src/renderer/src/sim/state.ts src/renderer/src/sim/flatten.ts src/renderer/src/sim/tuning.ts src/renderer/src/sim/telemetry.ts src/renderer/src/sim/acceptance.ts src/renderer/src/sim/run.ts src/renderer/src/sim/heat.ts src/renderer/src/sim/doors.ts src/renderer/src/sim/debris.ts src/renderer/src/sim/hazards/oxygen.ts tests/progression.test.ts tests/helpers/sim.ts tests/run.test.ts tests/snapshot.test.ts tests/telemetry.test.ts tests/acceptance.test.ts tests/gate-jump.test.ts tests/gate-run.test.ts tests/golden/basic.json
git commit -m "feat: a run score, progress logic with three start-bonus unlocks, a ship quirk per run from a seventh stream with six one-expression hooks, SimOptions, the record's quirk, unlocks and score; SIM_VERSION 15 (golden re-blessed: the quirk stream and fields are hashed)"
```

---

### Task 2: Progress store, session flow, HUD

**Files:**
- Create: `src/renderer/src/app/progressStore.ts`
- Modify: `src/renderer/src/app/session.ts`, `src/renderer/src/main.ts`, `src/renderer/src/render/hudModel.ts`, `src/renderer/src/render/hud.ts`, `tests/session.test.ts`, `tests/hud.test.ts`, `tests/progression.test.ts` (store tests)

**Interfaces:**
- Consumes: `Progress`, `EMPTY_PROGRESS`, `UNLOCKS`, `unlockNames`, `applyRun`, `QUIRK_NAMES`, `runScore`/`TelemetryRecord.score` from Task 1.
- Produces: `PROGRESS_KEY`, `loadProgress(storage)`, `saveProgress(storage, p)`; `SessionDeps.loadProgress/saveProgress`; `HudProgress`, `buildHudModel(..., progress = null)`, `HudModel.run.quirk`, `clockLine` with the quirk, the summary lines.

- [ ] **Step 1: Write the failing tests**

Append to `tests/progression.test.ts` (imports `loadProgress, saveProgress, PROGRESS_KEY` from `../src/renderer/src/app/progressStore`):

```ts
describe('progress store', () => {
  const mem = (init: Record<string, string> = {}, throwOn: 'get' | 'set' | null = null) => { const m = new Map(Object.entries(init)); return { getItem: (k: string) => { if (throwOn === 'get') throw new Error('denied'); return m.get(k) ?? null; }, setItem: (k: string, v: string) => { if (throwOn === 'set') throw new Error('full'); m.set(k, v); }, map: m }; };
  it('round-trips, defaults and sanitizes', () => {
    const p: Progress = { version: 1, runs: 4, victories: 1, bestScore: 900, bestNodes: 6, unlocked: ['scrap-reserve', 'torpedo-rack', 'veteran-crew'] };
    const st = mem(); saveProgress(st, p); expect(JSON.parse(st.map.get(PROGRESS_KEY)!)).toEqual(p); expect(loadProgress(st)).toEqual(p);
    expect(loadProgress(mem())).toEqual(EMPTY_PROGRESS);
    for (const raw of ['{', '[]', JSON.stringify({ version: 2, runs: 3 })]) expect(loadProgress(mem({ [PROGRESS_KEY]: raw }))).toEqual(EMPTY_PROGRESS);
    expect(loadProgress(mem({ [PROGRESS_KEY]: JSON.stringify({ version: 1, runs: '3', victories: -1, bestScore: 12.5, bestNodes: NaN, unlocked: ['torpedo-rack', 'bogus', 'scrap-reserve', 'torpedo-rack'] }) }))).toEqual({ version: 1, runs: 0, victories: 0, bestScore: 12.5, bestNodes: 0, unlocked: ['scrap-reserve', 'torpedo-rack'] });
    expect(loadProgress(mem({ [PROGRESS_KEY]: JSON.stringify({ version: 1, unlocked: 'x' }) })).unlocked).toEqual([]);
    expect(loadProgress(mem({}, 'get'))).toEqual(EMPTY_PROGRESS);
    expect(() => saveProgress(mem({}, 'set'), p)).not.toThrow();
  });
});
```

`tests/session.test.ts`: the harness gains `storage = mem()` (same in-memory shape, or a shared tiny helper) and passes `loadProgress: () => loadProgress(storage), saveProgress: (p) => saveProgress(storage, p)`, with an optional `initialProgress` argument that pre-seeds `storage` through `saveProgress`. Existing message expectations that compare the whole lobby text (grep `Press Interact to join`) gain the suffix `   Runs 0  Best 0`. Add:

```ts
  it('progress: the lobby shows runs and best; a lost run saves progress and unlocks the scrap reserve; the next run starts with it', () => {
    const h = harness(); h.frames(1);
    expect(h.last().message).toBe('Press Interact to join. Confirm: start. Cancel: credits   Runs 0  Best 0');
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1); h.press('a', { confirm: true }); h.frames(1); h.release(); h.frames(1);
    const st = h.session.state!; const quirk = st.run.quirk; downCrew(st, 0); h.frames(2);
    expect(h.session.phase).toBe('gameover'); expect(h.records).toHaveLength(1);
    const saved = loadProgress(h.storage); expect(saved).toMatchObject({ runs: 1, victories: 0, bestNodes: 0, unlocked: ['scrap-reserve'] }); expect(saved.bestScore).toBe(h.records[0]!.score);
    const sum = h.last().summary!; expect(sum[0]).toMatch(/^Survived 0:0\d  CREW LOST  Reached node 1 of 8  Score \d+$/); expect(sum[4]).toBe(`Ship: ${QUIRK_NAMES[quirk]}`); expect(sum[5]).toBe(`Best ${saved.bestScore}   Runs 1   Victories 0`); expect(sum[6]).toBe('Unlocked: Scrap reserve'); expect(sum[7]).toMatch(/^Okoro: /);
    h.press('a', { cancel: true }); h.frames(1); h.release(); h.frames(1);
    expect(h.last().message).toBe('New seed. Press Interact to join. Confirm: start. Cancel: credits   Runs 1  Best ' + saved.bestScore + '  Unlocked: Scrap reserve');
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1); h.press('a', { confirm: true }); h.frames(1); h.release(); h.frames(1);
    expect([h.session.state!.run.scrap, h.session.state!.run.startBonus]).toEqual([30, 1]);
  });
  it('progress: a saved progress shows in the lobby and all three bonuses apply', () => {
    const h = harness(undefined, undefined, true, { version: 1, runs: 4, victories: 1, bestScore: 900, bestNodes: 6, unlocked: ['scrap-reserve', 'torpedo-rack', 'veteran-crew'] }); h.frames(1);
    expect(h.last().message).toMatch(/Runs 4  Best 900  Unlocked: Scrap reserve, Torpedo rack, Veteran crew$/);
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1); h.press('a', { confirm: true }); h.frames(1); h.release(); h.frames(1);
    expect(h.session.state!.run.startBonus).toBe(0b111); expect(h.session.state!.run.scrap).toBe(30);
  });
```

`tests/hud.test.ts`: every exact `clockLine` expectation gains `   ${QUIRK_NAMES[s.run.quirk]}` (the no-state case stays `HULL 0   TIME 0s   node 1/8` with no trailing spaces); the headline expectations gain `  Score 0` (unjumped, no scrap, no kills) and the summary index of the gains lines shifts by one (the `Ship:` line); add: `buildHudModel(s, slots(2), 'gameover', '').summary` has `Ship: <name>` at index 4 and the first gains line at index 5 (no progress); with `progress = { bestScore: 10, runs: 2, victories: 0, newUnlocks: [] }` index 5 is `Best 10   Runs 2   Victories 0` and index 6 is the first gains line; with `newUnlocks: ['Scrap reserve']` index 6 is `Unlocked: Scrap reserve`; a victory state at node 8 with `scrapEarned 145` shows `Score 1345`.

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/progression.test.ts tests/session.test.ts tests/hud.test.ts` → missing store module, deps, fields.

- [ ] **Step 3: progressStore.ts, session.ts, main.ts, hudModel.ts, hud.ts**

Create `progressStore.ts`:

```ts
import { EMPTY_PROGRESS, UNLOCKS, type Progress } from '../sim/progress';
import type { RecordStorage } from './telemetryStore';
export const PROGRESS_KEY = 'ftlite-progress';
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
/** Read progress, field by field; anything malformed falls back per field, a bad root to EMPTY_PROGRESS (spec Run-iii section 4). */
export function loadProgress(storage: RecordStorage): Progress {
  try {
    const raw = JSON.parse(storage.getItem(PROGRESS_KEY) ?? 'null') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (raw as { version?: unknown }).version !== 1) return { ...EMPTY_PROGRESS, unlocked: [] };
    const o = raw as Record<string, unknown>, ids = Array.isArray(o['unlocked']) ? (o['unlocked'] as unknown[]) : [];
    return { version: 1, runs: num(o['runs']), victories: num(o['victories']), bestScore: num(o['bestScore']), bestNodes: num(o['bestNodes']), unlocked: UNLOCKS.filter((u) => ids.includes(u.id)).map((u) => u.id) };
  } catch { return { ...EMPTY_PROGRESS, unlocked: [] }; }
}
export function saveProgress(storage: RecordStorage, p: Progress): void { try { storage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* storage unavailable or full */ } }
```

`session.ts`: deps `loadProgress?: () => Progress; saveProgress?: (p: Progress) => void;`; `let progress: Progress = deps.loadProgress?.() ?? EMPTY_PROGRESS; let newUnlocks: string[] = [];`; `const lobbyMessage = () => \`${LOBBY_MSG}   Runs ${progress.runs}  Best ${progress.bestScore}${progress.unlocked.length ? \`  Unlocked: ${unlockNames(progress.unlocked).join(', ')}\` : ''}\`;`; `let message = lobbyMessage();`; `start()`: `state = createSimState(deps.layout, playerCount, seed, DEFAULT_CHARACTERS, { unlocked: progress.unlocked }); newUnlocks = [];`; ending tick: `const record = telemetryRecord(state, seed); deps.saveTelemetry?.(record); const next = applyRun(progress, record); newUnlocks = next.unlocked.filter((id) => !progress.unlocked.includes(id)); progress = next; deps.saveProgress?.(progress);` then the phase and banner as today; the two lobby returns use `` `New seed. ${lobbyMessage()}` `` / `` `Same seed. ${lobbyMessage()}` ``; the `buildHudModel` call gains `, phase === 'gameover' ? { bestScore: progress.bestScore, runs: progress.runs, victories: progress.victories, newUnlocks: unlockNames(newUnlocks) } : null`. `main.ts`: `loadProgress: () => { try { return loadProgress(localStorage); } catch { return EMPTY_PROGRESS; } }, saveProgress: (p) => { try { saveProgress(localStorage, p); } catch { /* storage denied */ } }`.

`hudModel.ts`: `export interface HudProgress { bestScore: number; runs: number; victories: number; newUnlocks: string[] }`; `buildHudModel(..., credits = null, progress: HudProgress | null = null)`; `HudModel.run` gains `quirk: string` (`state ? QUIRK_NAMES[state.run.quirk]! : ''`); `clockLine`: `` const base = `HULL ${Math.round(m.hull)}   TIME ${m.simSeconds}s   node ${m.run.column + 1}/${m.run.columns}`; return m.run.quirk ? `${base}   ${m.run.quirk}` : base; ``; `headlineSummary(state)` line 1 gains `` `  Score ${telemetryRecord(state, 0).score}` `` and a fifth line `` `Ship: ${QUIRK_NAMES[state.run.quirk]}` ``; `summary: state && phase === 'gameover' ? [...headlineSummary(state), ...progressSummary(progress), ...gainsSummary(state)] : null` with `function progressSummary(p: HudProgress | null): string[] { if (!p) return []; const lines = [\`Best ${p.bestScore}   Runs ${p.runs}   Victories ${p.victories}\`]; if (p.newUnlocks.length) lines.push(\`Unlocked: ${p.newUnlocks.join(', ')}\`); return lines; }`. `hud.ts`: eleven summary rows.

- [ ] **Step 4: Run and full suite**

`npx vitest run tests/progression.test.ts tests/session.test.ts tests/hud.test.ts tests/render.test.ts tests/renderPure.test.ts` → PASS; `npm test`, `npm run typecheck`, `npm run build`; golden unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/app/progressStore.ts src/renderer/src/app/session.ts src/renderer/src/main.ts src/renderer/src/render/hudModel.ts src/renderer/src/render/hud.ts tests/progression.test.ts tests/session.test.ts tests/hud.test.ts
git commit -m "feat: progress in localStorage; the session loads it, applies the run, saves it and starts with the earned bonuses; the lobby shows runs, best and unlocks; the clock shows the quirk; the summary shows the score, the ship and the progress lines"
```

---

### Task 3: Gate, spec amendments, roadmap

**Files:**
- Modify: `docs/gates.md`, `docs/superpowers/specs/2026-11-11-progression-design.md`, `docs/roadmap.md`

- [ ] **Step 1:** `npm run acceptance 5 1`; append the spec's §9 section to `docs/gates.md` with every automated entry checked **now**, recording per seed the quirk name, the survival and boarding figures and their deltas against Run-ii, any lever, the jump and run gate ticks, the golden hash and quirk, and the dated rows; manual row unchecked.
- [ ] **Step 2:** Append `## 11. Amendments from the plan` to the spec (the items at the top of this plan plus any fixture arithmetic corrected and the gate drift observed). `docs/roadmap.md`: item 10 → `in review`.
- [ ] **Step 3:** `npm run typecheck && npm test && npm run build`; commit:

```bash
git add docs/gates.md docs/superpowers/specs/2026-11-11-progression-design.md docs/roadmap.md
git commit -m "docs: Run-iii gate with per-seed quirks and figure deltas, the jump and run gate ticks, the acceptance rows, spec amendments, roadmap status"
```
