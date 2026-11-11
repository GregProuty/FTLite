# Events and Shops (Run-ii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nodes gain types; an Event node poses a two-choice text event and a Shop node sells hull, torpedoes and a permanent base bar for scrap, all resolved from the Navigation console's list, per `docs/superpowers/specs/2026-11-11-events-shops-design.md`.

**Architecture:** node types are drawn from `rng.map` after the Run-i edge draws (`assignNodeTypes` in `sim/run.ts`); `run` gains `nodeType`, `scrap`, `event`, `eventChoice`, `upgrades` and telemetry four scalars (SIM_VERSION 14); `sim/events.ts` holds the six events and `resolveEvent`, `sim/shop.ts` the eight items and `buy`; `run.ts` builds `navRows`, clamps the cursor and dispatches Confirm to resolve, buy or `jumpShip(state, destination)`; `power.ts` gains `baseMax` and `maxLevel(state, kind)`; the HUD Navigation panel draws `rows` with a window, threats gain event and shop rows, the record and table gain scrap.

**Tech Stack:** TypeScript ~5.8, vitest 3 (node), Pixi 8.19 (hud.ts only). No new dependencies.

## Spec amendments made by this plan (recorded in Task 3)

- `clampNavCursor` is exported from `run.ts`; `navigationInput` calls it first, then applies the stick edge, then Confirm.
- Shop item constants and labels live in `sim/shop.ts`; `SHOP_ITEM_COUNT = 2 + 6`.
- The `NavigationPanel.rows[].status` for a disabled row is produced in `hud.ts` (`'-'`), not in the model.

## Global Constraints

- `tests/boundary.test.ts` stays green (no banned imports in `sim/`; ASCII comments). Every test runs under node; `hudModel.ts` stays pixi-free.
- Streams: node types draw from `rng.map` **only after** every Run-i edge draw (`generateMap` calls `assignNodeTypes(rng, colNodes, nodeType)` last); `colNodes` and `edgeMask` for a seed are unchanged from Run-i. Events draw from `rng.loot` only: one `nextInt(rng.loot, EVENT_COUNT)` on arrival at an Event node, and inside `resolveEvent` exactly the draws §7 lists (Derelict choice 0: one `nextInt(rooms)`; Field choice 0: one `nextInt(freeSites.length)` only when non-empty; Cache choice 1: one `nextInt(stations.level.length)`); nothing else draws. The shop draws nothing. Director/hazards/combat draw counts inside `jumpShip` are unchanged from Run-i.
- Order inside `jumpShip(state, destination)` (exact): return at once if `destination` is not in `reachable(state)`; Run-i step 1 (`node = destination`, `column += 1`, `nodesReached += 1`, `jumpCharge = 0`, Navigation cursor 0, `telemetry.jumps += 1`); **step 1b** `arrive(state)`: `event = −1`, `eventChoice = −1`, `addScrap(SCRAP_PER_JUMP)`, then if `nodeType[column × 3 + node] === NodeType.Event` → `event = nextInt(rng.loot, EVENT_COUNT)`; then Run-i steps 2–6 unchanged.
- `navigationInput(state, i, dir, confirm)` (exact): `clampNavCursor(state)`; `rows = navRows(state)`; if no selectable row return; Up → previous selectable with wrap, Down → next selectable with wrap, Left/Right ignored; then on a Confirm edge: row `choice` and `enabled` → `resolveEvent(state, row.index)` then `clampNavCursor`; row `buy` and `enabled` → `buy(state, row.index)` then `clampNavCursor`; row `jump` and `jumpCharge >= 1` → `jumpShip(state, row.index)`; otherwise nothing. `clampNavCursor`: keep the cursor if `rows[cursor]` exists and `select !== 'none'`, else the first selectable index (0 if none).
- `navRows` (exact, §6): pending event → `[title (none), text (none), choice 0, choice 1]`; else Shop node → `[\`Shop   scrap ${scrap}\` (none), 8 buy rows in §8 order, destination rows]`; else destination rows `{ text: nodeLabel(column + 1, d), select: 'jump', index: d, enabled: true }`.
- Scrap: `addScrap` adds to `run.scrap` and `telemetry.scrapEarned`; `spendScrap` subtracts and adds to `scrapSpent`; sources only: arrival (`SCRAP_PER_JUMP 15`), `leave(state, true)` (`SCRAP_ENEMY 30`), boarder kill (`SCRAP_BOARDER 10`), events.
- Events and shop effects exactly as spec §7 and §8 (labels verbatim; `(owned)` label once bought; disabled rows listed; Confirm on a disabled row does nothing). `baseMax(state, kind)` and `maxLevel(state, kind)` take a **kind**; `isOverdriven(state, i)` keeps its **index** and compares to `baseMax`; `stationOutput`'s denominator stays `STATION_MAX[kind]`.
- State and flatten (exact): `run` section after `edgeMask`: `nodeType[3 × RUN_COLUMNS]`, `scrap, event, eventChoice`, `upgrades[STATION_COUNT]` → `RUN_FIELDS = 4 + 7 × RUN_COLUMNS + 3 + STATION_COUNT`; telemetry scalars after `jumps`: `scrapEarned, scrapSpent, eventsResolved, purchases` → `TELEMETRY_SCALARS = 20`. `SIM_VERSION = 14`; version-13 rejected.
- Tuning (exact): `SHOP_CHANCE 0.25`, `EVENT_CHANCE 0.35`, `SCRAP_PER_JUMP 15`, `SCRAP_ENEMY 30`, `SCRAP_BOARDER 10`, `EVENT_COUNT 6`, `SHOP_HULL 25`, `SHOP_HULL_COST 30`, `SHOP_TORPEDOES 2`, `SHOP_TORPEDOES_COST 20`, `SHOP_UPGRADE_COST 50`.
- HUD strings (exact): footer `` `Evade ${round(evade × 100)}%   Jump ${final ? '-' : ready ? 'READY' : `${floor(charge × 100)}%`}   Scrap ${scrap}` ``; threats order: event row `Event: ${title}`, shop row `Shop here`, then today's list; the record's `run` gains `scrap: { earned, spent }`, `events`, `purchases`, `upgrades: string[]`; the table's last column `scrap` = `${earned}/${spent}`.
- Gates: `gate-survival` and `gate-boarding` figures identical to Run-i's (no lever expected; the Run-i lever list is re-authorised in the same order only for a genuinely failing seed); `gate-jump` adds `allHazard(s)` after `makeState` and asserts the end tick 25200; golden re-blessed **once**, in Task 1, after the gates.
- Commit messages: imperative, prefixed `feat:`/`test:`/`docs:`, ending `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. `npm run typecheck`, `npm test`, `npm run build` pass at the end of every task.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/run.ts` | `NodeType`, `assignNodeTypes`, `generateMap` (extended), `addScrap`, `spendScrap`, `arrive`, `navRows`, `clampNavCursor`, `navigationInput`, `jumpShip(state, destination)`. |
| `src/renderer/src/sim/events.ts` (new) | `EVENTS`, `choiceEnabled`, `resolveEvent`. |
| `src/renderer/src/sim/shop.ts` (new) | `SHOP_ITEMS`, `itemLabel`, `itemEnabled`, `buy`, `UPGRADE_KINDS`. |
| `src/renderer/src/sim/{state,flatten,tuning,power,heat,enemy,boarders}.ts` | as Task 1 says. |
| `src/renderer/src/render/{hudModel,hud}.ts`, `src/renderer/src/sim/{telemetry,acceptance}.ts` | Task 2. |
| `tests/events.test.ts` (new), `tests/gate-run.test.ts` (new), `tests/{run,gate-jump,snapshot,heat,power,console,hud,telemetry,acceptance}.test.ts`, `tests/helpers/sim.ts` | as the tasks say. |
| `docs/gates.md`, both specs, `docs/roadmap.md` | Task 3. |

---

### Task 1: Node types, scrap, events, shops, the upgrade model and the Navigation list

**Files:**
- Create: `src/renderer/src/sim/events.ts`, `src/renderer/src/sim/shop.ts`, `tests/events.test.ts`, `tests/gate-run.test.ts`
- Modify: `src/renderer/src/sim/run.ts`, `state.ts`, `flatten.ts`, `tuning.ts`, `power.ts`, `heat.ts`, `enemy.ts`, `boarders.ts`, `tests/helpers/sim.ts`, `tests/run.test.ts`, `tests/gate-jump.test.ts`, `tests/snapshot.test.ts`, `tests/heat.test.ts`, `tests/power.test.ts`, `tests/console.test.ts`, `tests/golden/basic.json` (re-bless)

**Interfaces:**
- Produces: `NodeType`, `assignNodeTypes(rng, colNodes, nodeType, draw?)`, `addScrap`, `spendScrap`, `navRows(state): NavRow[]`, `NavRow`, `clampNavCursor`, `jumpShip(state, destination)`; `EVENTS`, `choiceEnabled(state, id, k)`, `resolveEvent(state, k)`; `SHOP_ITEMS`, `UPGRADE_KINDS`, `itemLabel(state, i)`, `itemEnabled(state, i)`, `buy(state, i)`; `baseMax(state, kind)`, `maxLevel(state, kind)`; helpers `setNodeTypes`, `allHazard`, `grantScrap`, `setEvent`, `mapM(state)`.

- [ ] **Step 0: Baseline**

`npx vitest run tests/gate-survival.test.ts tests/gate-boarding.test.ts tests/gate-jump.test.ts` with a temporary `console.log` of the figures (and the jump gate's `s.tick`), then `git checkout` the test files. Record the lines: they must be identical after the change.

- [ ] **Step 1: Write the failing tests**

`tests/helpers/sim.ts` additions (imports: `NodeType` from run; `STATION_COUNT` from stationKinds; `RUN_COLUMNS` from tuning):

```ts
export function setNodeTypes(state: SimState, types: Record<string, number>): void {
  state.run.nodeType.fill(NodeType.Hazard);
  for (const [key, t] of Object.entries(types)) { const [c, n] = key.split(':').map(Number); state.run.nodeType[c! * 3 + n!] = t; }
}
export function allHazard(state: SimState): void { setNodeTypes(state, {}); }
export function grantScrap(state: SimState, n: number): void { state.run.scrap = n; }
export function setEvent(state: SimState, id: number): void { state.run.event = id; state.run.eventChoice = -1; }
/** The spec's fixture map M: three nodes in column 1, reachable [0, 2] from the start, every other mask 1; all nodes Hazard. */
export function mapM(state: SimState): void {
  setMap(state, [1, 3, 2, 2, 2, 2, 2, 1], { '0:0': 0b101, '1:0': 1, '1:1': 1, '1:2': 1, '2:0': 1, '2:1': 1, '3:0': 1, '3:1': 1, '4:0': 1, '4:1': 1, '5:0': 1, '5:1': 1, '6:0': 1, '6:1': 1 });
  allHazard(state);
}
```

Also change `overdrive` to call `maxLevel(state, kind)`.

`tests/run.test.ts` changes: every `jumpShip(x)` becomes `jumpShip(x, reachable(x)[0]!)` (the "cursor 1 -> destination 2" case goes through `step`, unchanged). The `replayMap` helper gains, after its edge loops, the §3 loop:

```ts
  const nodeType = new Uint8Array(columns * 3);
  for (let c = 1; c < columns - 1; c++) for (let n = 0; n < colNodes[c]!; n++) { const u = nextFloat(rng); nodeType[c * 3 + n] = u < SHOP_CHANCE ? 2 : u < SHOP_CHANCE + EVENT_CHANCE ? 1 : 0; }
  let shop = false; for (let c = 1; c < columns - 1; c++) for (let n = 0; n < colNodes[c]!; n++) if (nodeType[c * 3 + n] === 2) shop = true;
  if (!shop) nodeType[Math.floor(columns / 2) * 3] = 2;
  return { colNodes, edgeMask, nodeType };
```

and the map test adds `expect(Array.from(s.run.nodeType)).toEqual(Array.from(expected.nodeType))` for seeds 7, 1 and 23 (`makeState(2, seed)` against `replayMap(deriveStreams(seed).map, RUN_COLUMNS)`), plus the Run-i-equality check: `const old = oldReplay(createRng(seed), RUN_COLUMNS)` where `oldReplay` is the Run-i replay without the type loop; `generateMap(createRng(seed), RUN_COLUMNS)` has equal `colNodes`/`edgeMask` for seeds 1–50. Well-formedness per spec §11 for seeds 1–50 (ends `Hazard`, middle in `{0,1,2}`, at least one middle `Shop`, entries past `colNodes[c]` are 0). Fallback: `const t = new Uint8Array(24); assignNodeTypes(createRng(1), makeState(2, 1).run.colNodes, t, () => 0.99)` → every middle node `Hazard` except `t[4 * 3] === NodeType.Shop`; with `() => 0.1` every middle node is `Shop`. The charge/input tests are unchanged except that the "cursor 1 -> destination 2" assertion still holds (the list is destinations only on a Hazard node).

Create `tests/events.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NodeType, navRows, clampNavCursor, jumpShip, reachable, addScrap, spendScrap } from '../src/renderer/src/sim/run';
import { EVENTS, choiceEnabled, resolveEvent } from '../src/renderer/src/sim/events';
import { SHOP_ITEMS, UPGRADE_KINDS, itemLabel, itemEnabled, buy } from '../src/renderer/src/sim/shop';
import { baseMax, maxLevel, shiftBar, failStation } from '../src/renderer/src/sim/power';
import { isOverdriven, heatStep } from '../src/renderer/src/sim/heat';
import { leave } from '../src/renderer/src/sim/enemy';
import { damageBoarder } from '../src/renderer/src/sim/boarders';
import { downCrew } from '../src/renderer/src/sim/crew';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { StationKind, STATION_NAMES } from '../src/renderer/src/sim/stationKinds';
import { freeSites } from '../src/renderer/src/sim/hazards/breach';
import { createRng, nextInt } from '../src/shared/rng';
import { HULL_MAX, HEALTH_MAX, TORP_CAP, TORP_START, STATION_MAX, STATION_OVERDRIVE, SCRAP_PER_JUMP, SCRAP_ENEMY, SCRAP_BOARDER, EVENT_COUNT, SHOP_HULL_COST, SHOP_TORPEDOES_COST, SHOP_UPGRADE_COST, HAZARD_EVERY } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, intents, teleport, placeEnemy, placeBoarder, chargeJump, seatNavigator, mapM, setNodeTypes, grantScrap, setEvent, room } from './helpers/sim';

const calm = (seed = 1) => { const s = makeState(2, seed); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; mapM(s); return s; };
const lootCopy = (s: ReturnType<typeof makeState>) => createRng(0) && { s: s.rng.loot.s };   // a detached copy of the loot stream
const at = (s: ReturnType<typeof makeState>, column: number, node: number) => { s.run.column = column; s.run.node = node; s.run.nodesReached = column; s.telemetry.jumps = column; };

describe('arrival', () => {
  it('a Hazard arrival awards SCRAP_PER_JUMP and never touches the loot stream; an Event arrival draws the id with exactly one loot draw', () => {
    const s = calm(); const before = { s: s.rng.loot.s };
    jumpShip(s, 0);
    expect([s.run.scrap, s.telemetry.scrapEarned, s.run.event, s.run.eventChoice]).toEqual([SCRAP_PER_JUMP, SCRAP_PER_JUMP, -1, -1]);
    expect(s.rng.loot.s).toBe(before.s); expect(nextInt(s.rng.loot, 1000)).toBe(nextInt(before, 1000));
    const e = calm(); setNodeTypes(e, { '1:2': NodeType.Event }); const ref = { s: e.rng.loot.s }; const id = nextInt(ref, EVENT_COUNT);
    jumpShip(e, 2);
    expect(e.run.event).toBe(id); expect(e.rng.loot.s).toBe(ref.s); expect(e.run.scrap).toBe(SCRAP_PER_JUMP);
    const v = calm(); at(v, 6, 0); jumpShip(v, 0); expect(v.ended).toBe(1); expect(v.run.event).toBe(-1);   // the last column is Hazard
    const bad = calm(); const h = JSON.stringify([bad.run.column, bad.run.scrap, bad.rng.loot.s, bad.rng.director.s]); jumpShip(bad, 1); expect(JSON.stringify([bad.run.column, bad.run.scrap, bad.rng.loot.s, bad.rng.director.s])).toBe(h);   // node 1 is not reachable from the start: no-op
  });
  it('a pending event lists four rows, blocks the jump, resolves on Confirm, and the next Confirm jumps from the re-clamped cursor', () => {
    const s = calm(); at(s, 1, 2); setEvent(s, 4); chargeJump(s); const n = seatNavigator(s, 0); run(s, 1);
    const rows = navRows(s);
    expect(rows.map((r) => [r.text, r.select, r.index, r.enabled])).toEqual([[EVENTS[4]!.title, 'none', 0, false], [EVENTS[4]!.text, 'none', 0, false], [EVENTS[4]!.choices[0], 'choice', 0, true], [EVENTS[4]!.choices[1], 'choice', 1, true]]);
    expect(s.stations.cursor[n]).toBe(0); clampNavCursor(s); expect(s.stations.cursor[n]).toBe(2);
    run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect([s.run.column, s.telemetry.jumps, s.run.jumpCharge, s.run.eventChoice, s.run.scrap, s.telemetry.eventsResolved]).toEqual([1, 1, 1, 0, 40, 1]);
    expect(navRows(s).map((r) => r.select)).toEqual(['jump', 'jump']); expect(s.stations.cursor[n]).toBe(0);   // cursor 2 does not exist in the new list: first selectable
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ confirmPressed: true }, {}));
    expect([s.run.column, s.run.node]).toEqual([2, 0]);
  });
});

describe('events: every choice', () => {
  const setup = (id: number, scrap = 100) => { const s = calm(); at(s, 1, 2); setEvent(s, id); grantScrap(s, scrap); return s; };
  const lootDraws = (s: ReturnType<typeof makeState>, n: number) => { const r = { s: s.rng.loot.s }; for (let k = 0; k < n; k++) nextInt(r, 7); return r.s; };
  it('0 Derelict hulk: salvage adds 25 and ignites the drawn room (one draw); leave does nothing', () => {
    const s = setup(0); const ref = { s: s.rng.loot.s }; const roomIdx = nextInt(ref, s.layout.rooms.length);
    resolveEvent(s, 0); expect(s.run.scrap).toBe(125); expect(s.rooms.fire[roomIdx]).toBeGreaterThan(0); expect(s.rng.loot.s).toBe(ref.s); expect(s.run.eventChoice).toBe(0); expect(s.telemetry.eventsResolved).toBe(1);
    const t = setup(0); const l = t.rng.loot.s; resolveEvent(t, 1); expect(t.run.scrap).toBe(100); expect(Array.from(t.rooms.fire).every((f) => f === 0)).toBe(true); expect(t.rng.loot.s).toBe(l);
  });
  it('1 Distress call: help costs 10 hull for 30 scrap and is disabled at hull 10; ignore does nothing', () => {
    const s = setup(1); s.hull = 61; expect(choiceEnabled(s, 1, 0)).toBe(true); resolveEvent(s, 0); expect([s.hull, s.run.scrap]).toEqual([51, 130]);
    const d = setup(1); d.hull = 10; expect(choiceEnabled(d, 1, 0)).toBe(false); d.hull = 11; expect(choiceEnabled(d, 1, 0)).toBe(true);
    const t = setup(1); resolveEvent(t, 1); expect([t.hull, t.run.scrap, t.run.eventChoice]).toEqual([HULL_MAX, 100, 1]);
  });
  it('2 Smugglers: 20 scrap for 2 torpedoes capped at TORP_CAP, disabled at 19 scrap or full stock; refuse does nothing', () => {
    const s = setup(2); resolveEvent(s, 0); expect([s.weapons.torpedoStock, s.run.scrap, s.telemetry.scrapSpent]).toEqual([TORP_START + 2, 80, 20]);
    const c = setup(2); c.weapons.torpedoStock = TORP_CAP - 1; resolveEvent(c, 0); expect(c.weapons.torpedoStock).toBe(TORP_CAP);
    const p = setup(2, 19); expect(choiceEnabled(p, 2, 0)).toBe(false); const f = setup(2); f.weapons.torpedoStock = TORP_CAP; expect(choiceEnabled(f, 2, 0)).toBe(false);
    const t = setup(2); resolveEvent(t, 1); expect([t.weapons.torpedoStock, t.run.scrap]).toEqual([TORP_START, 100]);
  });
  it('3 Micrometeoroid field: push through adds 20 and breaches the drawn free site (one draw), no draw with no free site; go around resets the charge', () => {
    const s = setup(3); const ref = { s: s.rng.loot.s }; const sites = freeSites(s); const site = sites[nextInt(ref, sites.length)]!;
    resolveEvent(s, 0); expect(s.run.scrap).toBe(120); expect(s.breaches.active[site]).toBe(1); expect(s.rng.loot.s).toBe(ref.s);
    const n = setup(3); n.breaches.active.fill(1); const l = n.rng.loot.s; resolveEvent(n, 0); expect(n.run.scrap).toBe(120); expect(n.rng.loot.s).toBe(l);
    const t = setup(3); t.run.jumpCharge = 0.8; resolveEvent(t, 1); expect([t.run.jumpCharge, t.run.scrap]).toEqual([0, 100]);
  });
  it('4 Supply cache: take adds 40; strip adds 60 and fails the drawn station (one draw), skipping an already failed one', () => {
    const s = setup(4); resolveEvent(s, 0); expect(s.run.scrap).toBe(140); expect(Array.from(s.stations.failed).every((f) => f === 0)).toBe(true);
    const t = setup(4); const ref = { s: t.rng.loot.s }; const i = nextInt(ref, t.stations.level.length);
    resolveEvent(t, 1); expect(t.run.scrap).toBe(160); expect(t.stations.failed[i]).toBe(1); expect(t.rng.loot.s).toBe(ref.s);
    const f = setup(4); const ref2 = { s: f.rng.loot.s }; const j = nextInt(ref2, f.stations.level.length); failStation(f, j); const snapF = JSON.stringify([Array.from(f.stations.failed), Array.from(f.stations.level), Array.from(f.stations.repair)]);
    resolveEvent(f, 1); expect(JSON.stringify([Array.from(f.stations.failed), Array.from(f.stations.level), Array.from(f.stations.repair)])).toBe(snapF); expect(f.rng.loot.s).toBe(ref2.s); expect(f.run.scrap).toBe(160);
  });
  it('5 Medical freighter: 15 scrap heals Conscious crew to full and leaves a Downed member; disabled at 14; decline does nothing', () => {
    const s = setup(5); Health.cur[s.crew[0]!] = 20; downCrew(s, 1); const h1 = Health.cur[s.crew[1]!];
    resolveEvent(s, 0); expect([Health.cur[s.crew[0]!], Health.cur[s.crew[1]!], Life.state[s.crew[1]!], s.run.scrap, s.telemetry.scrapSpent]).toEqual([HEALTH_MAX, h1, LifeState.Downed, 85, 15]);
    const p = setup(5, 14); expect(choiceEnabled(p, 5, 0)).toBe(false); expect(choiceEnabled(p, 5, 1)).toBe(true);
    const t = setup(5); Health.cur[t.crew[0]!] = 20; resolveEvent(t, 1); expect([Health.cur[t.crew[0]!], t.run.scrap]).toEqual([20, 100]);
  });
  it('a disabled choice under Confirm changes nothing; resolveEvent on a resolved or absent event is a no-op', () => {
    const s = setup(5, 14); const n = seatNavigator(s, 0); run(s, 1); chargeJump(s); clampNavCursor(s); expect(s.stations.cursor[n]).toBe(2);
    const h = JSON.stringify([s.run.scrap, s.run.eventChoice, s.telemetry.eventsResolved, Array.from(Health.cur.subarray(0, 4))]);
    run(s, 1, () => intents({ confirmPressed: true }, {})); expect(JSON.stringify([s.run.scrap, s.run.eventChoice, s.telemetry.eventsResolved, Array.from(Health.cur.subarray(0, 4))])).toBe(h); expect(s.run.column).toBe(1);
    const r = setup(4); resolveEvent(r, 0); resolveEvent(r, 1); expect([r.run.scrap, r.telemetry.eventsResolved]).toEqual([140, 1]);
    const a = calm(); resolveEvent(a, 0); expect([a.run.scrap, a.telemetry.eventsResolved]).toEqual([0, 0]);
    void lootDraws;
  });
});

describe('shops', () => {
  const shop = (scrap = 100) => { const s = calm(); at(s, 1, 0); setNodeTypes(s, { '1:0': NodeType.Shop }); grantScrap(s, scrap); return s; };
  it('lists the header, eight items in order and the destinations; enabled per item', () => {
    const s = shop(); const rows = navRows(s);
    expect(rows).toHaveLength(10); expect(rows[0]).toEqual({ text: 'Shop   scrap 100', select: 'none', index: 0, enabled: false });   // mask 1:0 = 1: one destination (Node 3a)
    expect(rows.slice(1, 9).map((r) => r.text)).toEqual(['Hull +25 (30 scrap)', 'Torpedoes +2 (20 scrap)', ...UPGRADE_KINDS.map((k) => `${STATION_NAMES[k]} +1 bar (50 scrap)`)]);
    expect(UPGRADE_KINDS).toEqual([StationKind.Navigation, StationKind.Weapons, StationKind.Science, StationKind.LifeSupport, StationKind.Medbay, StationKind.Doors]);
    expect(rows.slice(9).map((r) => [r.text, r.select, r.index])).toEqual([['Node 3a', 'jump', 0]]);
    expect(rows[1]!.enabled).toBe(false); s.hull = 90; expect(navRows(s)[1]!.enabled).toBe(true);
    expect(rows[2]!.enabled).toBe(true); s.weapons.torpedoStock = TORP_CAP; expect(navRows(s)[2]!.enabled).toBe(false);
    expect(rows.slice(3, 9).every((r) => r.enabled)).toBe(true);
    const poor = shop(29); expect(navRows(poor).slice(1, 9).map((r) => r.enabled)).toEqual([false, true, false, false, false, false, false, false]);
    const h = calm(); at(h, 1, 0); expect(navRows(h).map((r) => r.select)).toEqual(['jump', 'jump']);
  });
  it('buys: hull capped, torpedoes capped, the upgrade raises baseMax and maxLevel for its kind only and shows (owned)', () => {
    const s = shop(); s.hull = 90; buy(s, 0); expect([s.hull, s.run.scrap, s.telemetry.scrapSpent, s.telemetry.purchases]).toEqual([HULL_MAX, 70, 30, 1]);
    s.weapons.torpedoStock = TORP_CAP - 1; buy(s, 1); expect([s.weapons.torpedoStock, s.run.scrap]).toEqual([TORP_CAP, 50]);
    const w = 2 + UPGRADE_KINDS.indexOf(StationKind.Weapons);   // item index 3 (navRows row 4)
    buy(s, w); expect(s.run.upgrades[StationKind.Weapons]).toBe(1); expect(s.run.scrap).toBe(0); expect(s.telemetry.purchases).toBe(3);
    expect(baseMax(s, StationKind.Weapons)).toBe(STATION_MAX[StationKind.Weapons]! + 1); expect(maxLevel(s, StationKind.Weapons)).toBe(STATION_MAX[StationKind.Weapons]! + 1 + STATION_OVERDRIVE);
    for (const k of [StationKind.Navigation, StationKind.Science, StationKind.Engineering, StationKind.LifeSupport, StationKind.Medbay, StationKind.Doors]) expect(maxLevel(s, k)).toBe(STATION_MAX[k]! + (k === StationKind.Engineering ? 0 : STATION_OVERDRIVE));
    expect(itemLabel(s, w)).toBe('Weapons +1 bar (owned)'); expect(itemEnabled(s, w)).toBe(false); grantScrap(s, 100); expect(itemEnabled(s, w)).toBe(false);
    const before = [s.run.scrap, s.telemetry.purchases]; buy(s, w); expect([s.run.scrap, s.telemetry.purchases]).toEqual(before);
    const wpn = s.derived.stationOfKind[StationKind.Weapons]!; s.stations.level.fill(0); s.stations.level[s.derived.stationOfKind[StationKind.Engineering]!] = 1;
    while (shiftBar(s, wpn, 1)) { /* fill */ } expect(s.stations.level[wpn]).toBe(STATION_MAX[StationKind.Weapons]! + 1 + STATION_OVERDRIVE);
    s.stations.level[wpn] = STATION_MAX[StationKind.Weapons]! + 1; expect(isOverdriven(s, wpn)).toBe(false); for (let k = 0; k < 5; k++) heatStep(s); expect(s.stations.heat[wpn]).toBe(0);
    s.stations.level[wpn] = STATION_MAX[StationKind.Weapons]! + 2; expect(isOverdriven(s, wpn)).toBe(true);
    void HAZARD_EVERY;
  });
  it('cursor rules: a buy keeps the cursor on its (now disabled) row, the header is skipped, wrap crosses the ends, a shrink moves to the first selectable row', () => {
    const s = shop(); s.hull = 90; const n = seatNavigator(s, 0); run(s, 1);
    run(s, 1, () => intents({}, {})); expect(s.stations.cursor[n]).toBe(1);                                   // header skipped
    run(s, 1, () => intents({ moveY: -1 }, {})); expect(s.stations.cursor[n]).toBe(9);                       // Up from row 1 wraps to the last row (the single destination)
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ moveY: 1 }, {})); expect(s.stations.cursor[n]).toBe(1);   // Down from the last wraps to row 1
    run(s, 1, () => intents({ confirmPressed: true }, {})); expect(s.hull).toBe(HULL_MAX); expect(s.stations.cursor[n]).toBe(1); expect(navRows(s)[1]!.enabled).toBe(false);
    run(s, 1, () => intents({}, {})); run(s, 1, () => intents({ confirmPressed: true }, {})); expect(s.run.scrap).toBe(70);   // disabled: nothing
    const e = shop(); setEvent(e, 4); const m = seatNavigator(e, 0); run(e, 1); e.stations.cursor[m] = 3; run(e, 1, () => intents({ confirmPressed: true }, {}));
    expect(e.run.eventChoice).toBe(1); expect(e.stations.cursor[m]).toBe(3);                                  // row 3 exists in the shop list (an item): kept
    expect(navRows(e)).toHaveLength(10);
  });
});

describe('scrap sources', () => {
  it('a destroyed enemy pays SCRAP_ENEMY, a withdrawal pays nothing, a boarder kill pays SCRAP_BOARDER, and the counters reconcile', () => {
    const s = calm(); placeEnemy(s); leave(s, true); expect([s.run.scrap, s.telemetry.scrapEarned]).toEqual([SCRAP_ENEMY, SCRAP_ENEMY]);
    placeEnemy(s); leave(s, false); expect(s.run.scrap).toBe(SCRAP_ENEMY);
    const b = placeBoarder(s, room(s, 'G'), 5); damageBoarder(s, b, 5, 0); expect(s.run.scrap).toBe(SCRAP_ENEMY + SCRAP_BOARDER);
    spendScrap(s, 10); addScrap(s, 3); expect(s.run.scrap).toBe(s.telemetry.scrapEarned - s.telemetry.scrapSpent);
  });
});
```

(Remove `SHOP_ITEMS` from the shop import (there is no such export; the tests use `UPGRADE_KINDS`). Delete the unused `lootCopy`/`lootDraws` helpers and the `void` lines rather than keeping them.)

Create `tests/gate-run.test.ts` (the Run-i gate script with the event and shop rules; same imports plus `NodeType`, `navRows`, `mapM`, `setNodeTypes`, `HULL_MAX`, `SCRAP_PER_JUMP`):

```ts
describe('run gate: a scripted navigator resolves an event, buys a hull repair and wins', () => {
  it('seed 1, two Recruits: victory with 145 earned, 30 spent, hull full', () => {
    const s = makeState(2, 1, RECRUITS); quiet(s); const silence = () => { s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; }; silence();
    mapM(s); setNodeTypes(s, { '1:0': NodeType.Event, '2:0': NodeType.Shop }); s.hull = 90;
    const nav = s.derived.stationOfKind[StationKind.Navigation]!, A = room(s, 'A'), eid = s.crew[0]!;
    let lastJumps = 0, bought = false, holdOff = false;
    const move = (dy: number) => { holdOff = !holdOff; return holdOff ? { ...NEUTRAL_INTENT, moveY: dy } : { ...NEUTRAL_INTENT }; };   // one stick edge per two ticks: a release between presses
    for (let t = 0; t < 8 * (JUMP_CHARGE_TIME + 10) * TICK_HZ && !s.ended; t++) {
      let p0 = { ...NEUTRAL_INTENT };
      if (Seated.station[eid] === nav) {
        const rows = navRows(s), cur = s.stations.cursor[nav]!, row = rows[cur];
        if (s.run.event >= 0 && s.run.eventChoice < 0) p0 = row?.select === 'choice' && row.index === 0 ? { ...NEUTRAL_INTENT, confirmPressed: true } : move(-1);
        else if (s.run.column === 2 && !bought) { if (row?.select === 'buy' && row.index === 0) { p0 = { ...NEUTRAL_INTENT, confirmPressed: true }; bought = true; } else p0 = move(cur > 1 ? -1 : 1); }
        else if (row?.select === 'jump' && row.index === 0) p0 = { ...NEUTRAL_INTENT, confirmPressed: true };
        else p0 = move(1);
      } else { const c = confirmTarget(s, 0); const atConsole = roomAt(s, Position.x[eid]!, Position.y[eid]!) === A && c.kind === ConfirmKind.Console && c.index === nav; p0 = atConsole ? { ...NEUTRAL_INTENT, confirmPressed: true } : { ...NEUTRAL_INTENT, moveY: -1 }; }
      step(s, [p0, botIntent(s, 1)]);
      if (s.telemetry.jumps !== lastJumps) { lastJumps = s.telemetry.jumps; silence(); if (s.run.column === 1) s.run.event = 4; }   // the arrival drew an id; pin the Supply cache
    }
    expect([s.endReason, s.telemetry.jumps, s.run.column]).toEqual([EndReason.Victory, RUN_COLUMNS - 1, RUN_COLUMNS - 1]);
    expect([s.telemetry.scrapEarned, s.telemetry.scrapSpent, s.run.scrap, s.telemetry.eventsResolved, s.telemetry.purchases, s.hull]).toEqual([7 * SCRAP_PER_JUMP + 40, 30, 7 * SCRAP_PER_JUMP + 40 - 30, 1, 1, HULL_MAX]);
    expect(s.crew.filter((e) => Life.state[e] === LifeState.Conscious).length).toBe(2);
  });
});
```

(The `move` helper alternates a press and a release so each press is one stick edge; a held stick would repeat only every `STICK_REPEAT_TICKS`. Confirm is an edge too, but the Confirm branches re-evaluate the row each tick and the sim only acts on `confirmPressed`, which the gate sets freshly every tick as the jump gate does. The jump to column 1 lands at node 0 because the cursor starts on `Node 2a`; the hull repair at column 2 is bought once (`bought`), then the script moves down to the destination row.)

`tests/gate-jump.test.ts`: add `allHazard(s)` after `quiet(s)`, and `expect(s.tick).toBe(25200)` beside the budget assertion.

`tests/snapshot.test.ts`: version test 12 → 13; the round-trip test sets `s.run.nodeType[4] = s.run.nodeType[4] === 2 ? 1 : 2` (a value that differs from the generated one, asserted with `expect(before).not.toBe(after)`), `s.run.scrap = 45; s.run.event = 3; s.run.eventChoice = 1; s.run.upgrades[1] = 1; s.telemetry.scrapEarned = 60; s.telemetry.scrapSpent = 15; s.telemetry.eventsResolved = 2; s.telemetry.purchases = 1;` and asserts each back; the hash loop adds each of those fields alone. Add: "a run saved with a pending event resumes with the same rows and cursor": `mapM`, `at(1, 2)`, `setEvent(4)`, seat, `run 1`, cursor 3 → save/load → `navRows` deep-equal and cursor 3.

`tests/heat.test.ts:20` and `tests/power.test.ts:44,46` and `tests/console.test.ts:158`, `tests/power.test.ts:164`: `maxLevel(k)` → `maxLevel(s, k)`.

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/events.test.ts tests/gate-run.test.ts tests/run.test.ts tests/snapshot.test.ts tests/heat.test.ts tests/power.test.ts` → import errors (`events.ts`, `shop.ts` missing; `NodeType`, `navRows` undefined; `maxLevel` arity).

- [ ] **Step 3: tuning, state, flatten, power, heat, enemy, boarders**

`tuning.ts`: `SIM_VERSION = 14`; append:

```ts
// Events and shops (Run-ii)
export const SHOP_CHANCE = 0.25, EVENT_CHANCE = 0.35;                               // node type draw thresholds (map stream, after the edges)
export const SCRAP_PER_JUMP = 15, SCRAP_ENEMY = 30, SCRAP_BOARDER = 10;
export const EVENT_COUNT = 6;
export const SHOP_HULL = 25, SHOP_HULL_COST = 30, SHOP_TORPEDOES = 2, SHOP_TORPEDOES_COST = 20, SHOP_UPGRADE_COST = 50;
```

`state.ts`: `run` gains `nodeType: Uint8Array; scrap: number; event: number; eventChoice: number; upgrades: Uint8Array`; telemetry gains `scrapEarned: number; scrapSpent: number; eventsResolved: number; purchases: number` (init 0); the literal: `run: { column: 0, node: 0, nodesReached: 0, jumpCharge: 0, scrap: 0, event: -1, eventChoice: -1, upgrades: new Uint8Array(STATION_COUNT), ...generateMap(rng.map, RUN_COLUMNS) }` (`generateMap` now returns `nodeType` too).

`flatten.ts`: `RUN_FIELDS = 4 + 7 * RUN_COLUMNS + 3 + STATION_COUNT`; `TELEMETRY_SCALARS = 20`; after `put(tm.jumps)`: `put(tm.scrapEarned); put(tm.scrapSpent); put(tm.eventsResolved); put(tm.purchases);` and the key list gains the four names; after the `edgeMask` puts: `for (const v of rn.nodeType) put(v); put(rn.scrap); put(rn.event); put(rn.eventChoice); for (const v of rn.upgrades) put(v);` with the mirror in `unflatten` (`for k < RUN_COLUMNS * 3` nodeType; three scalars; `for k < STATION_COUNT` upgrades).

`power.ts`:

```ts
/** Base bars a station kind may hold: STATION_MAX plus a bought upgrade bar (spec Run-ii section 8). */
export function baseMax(state: SimState, kind: number): number { return STATION_MAX[kind]! + state.run.upgrades[kind]!; }
/** Highest level a station may hold: the base plus the overdrive bar for every kind except Engineering (spec 2b-i section 4). */
export function maxLevel(state: SimState, kind: number): number { return baseMax(state, kind) + (kind === StationKind.Engineering ? 0 : STATION_OVERDRIVE); }
```

and `shiftBar` calls `maxLevel(state, kind)`. `heat.ts` `isOverdriven`: `stationOnline(state, i) && state.stations.level[i]! > baseMax(state, state.derived.stationKind[i]!)` (import `baseMax` from `./power`; check `power.ts` does not import `heat.ts`: it imports `stations.ts` only). `enemy.ts` `leave`: `if (destroyed) { state.telemetry.enemiesDestroyed++; addScrap(state, SCRAP_ENEMY); }` (import `addScrap` from `./run`: `run.ts` imports `enemy.ts` for `leave`, so put `addScrap`/`spendScrap` in a new tiny `sim/scrap.ts` to avoid the cycle: `export function addScrap(state, n) { state.run.scrap += n; state.telemetry.scrapEarned += n; }` and `spendScrap`; `run.ts`, `events.ts`, `shop.ts`, `enemy.ts`, `boarders.ts` import from `./scrap`). `boarders.ts` `damageBoarder`: after `boardersKilled++`: `addScrap(state, SCRAP_BOARDER);`.

- [ ] **Step 4: run.ts, events.ts, shop.ts**

`run.ts` additions and changes:

```ts
export const NodeType = { Hazard: 0, Event: 1, Shop: 2 } as const;
export interface NavRow { text: string; select: 'none' | 'choice' | 'buy' | 'jump'; index: number; enabled: boolean }

/** Node types (spec Run-ii section 3): one draw per middle node after every edge draw; a shop is guaranteed without a draw. */
export function assignNodeTypes(rng: RngState, colNodes: Uint8Array, nodeType: Uint8Array, draw: (rng: RngState) => number = nextFloat): void {
  const columns = colNodes.length; nodeType.fill(NodeType.Hazard);
  for (let c = 1; c < columns - 1; c++) for (let n = 0; n < colNodes[c]!; n++) { const u = draw(rng); nodeType[c * 3 + n] = u < SHOP_CHANCE ? NodeType.Shop : u < SHOP_CHANCE + EVENT_CHANCE ? NodeType.Event : NodeType.Hazard; }
  for (let c = 1; c < columns - 1; c++) for (let n = 0; n < colNodes[c]!; n++) if (nodeType[c * 3 + n] === NodeType.Shop) return;
  nodeType[Math.floor(columns / 2) * 3] = NodeType.Shop;
}
// generateMap: allocate `const nodeType = new Uint8Array(columns * 3)`, call assignNodeTypes(rng, colNodes, nodeType) after the edge loops, return { colNodes, edgeMask, nodeType }.

/** Step 1b of the jump (spec Run-ii section 6): the arrival award and, at an Event node, the event id (one loot draw). */
function arrive(state: SimState): void {
  const r = state.run; r.event = -1; r.eventChoice = -1; addScrap(state, SCRAP_PER_JUMP);
  if (r.nodeType[r.column * 3 + r.node] === NodeType.Event) r.event = nextInt(state.rng.loot, EVENT_COUNT);
}

export function navRows(state: SimState): NavRow[] {
  const r = state.run, rows: NavRow[] = [];
  if (r.event >= 0 && r.eventChoice < 0) {
    const ev = EVENTS[r.event]!;
    rows.push({ text: ev.title, select: 'none', index: 0, enabled: false }, { text: ev.text, select: 'none', index: 0, enabled: false });
    for (let k = 0; k < 2; k++) rows.push({ text: ev.choices[k]!, select: 'choice', index: k, enabled: choiceEnabled(state, r.event, k) });
    return rows;
  }
  if (r.nodeType[r.column * 3 + r.node] === NodeType.Shop) {
    rows.push({ text: `Shop   scrap ${r.scrap}`, select: 'none', index: 0, enabled: false });
    for (let i = 0; i < SHOP_ITEM_COUNT; i++) rows.push({ text: itemLabel(state, i), select: 'buy', index: i, enabled: itemEnabled(state, i) });
  }
  for (const d of reachable(state)) rows.push({ text: nodeLabel(r.column + 1, d), select: 'jump', index: d, enabled: true });
  return rows;
}

/** Keep the cursor on an existing selectable row, else the first selectable row (0 if none) (spec Run-ii section 6). */
export function clampNavCursor(state: SimState): void {
  const nav = state.derived.stationOfKind[StationKind.Navigation]!; if (nav < 0) return;
  const rows = navRows(state), c = state.stations.cursor[nav]!;
  if (rows[c] && rows[c]!.select !== 'none') return;
  const first = rows.findIndex((row) => row.select !== 'none'); state.stations.cursor[nav] = first < 0 ? 0 : first;
}

export function navigationInput(state: SimState, i: number, dir: number, confirm: boolean): void {
  clampNavCursor(state);
  const rows = navRows(state), c = state.stations.cursor, n = rows.length;
  if (!rows.some((row) => row.select !== 'none')) return;
  const stepTo = (delta: number) => { let k = c[i]!; do k = (k + delta + n) % n; while (rows[k]!.select === 'none'); c[i] = k; };
  if (dir === Dir.Up) stepTo(-1); else if (dir === Dir.Down) stepTo(1);
  if (!confirm) return;
  const row = rows[c[i]!]!;
  if (row.select === 'choice' && row.enabled) { resolveEvent(state, row.index); clampNavCursor(state); }
  else if (row.select === 'buy' && row.enabled) { buy(state, row.index); clampNavCursor(state); }
  else if (row.select === 'jump' && state.run.jumpCharge >= 1) jumpShip(state, row.index);
}

export function jumpShip(state: SimState, destination: number): void {
  const r = state.run, list = reachable(state), nav = state.derived.stationOfKind[StationKind.Navigation]!;
  if (!list.includes(destination)) return;
  r.node = destination; r.column += 1; r.nodesReached += 1; r.jumpCharge = 0;
  if (nav >= 0) state.stations.cursor[nav] = 0;
  state.telemetry.jumps++;
  arrive(state);
  // ... Run-i steps 2-6 unchanged
}
```

Imports: `EVENTS, choiceEnabled, resolveEvent` from `./events`; `SHOP_ITEM_COUNT, itemLabel, itemEnabled, buy` from `./shop`; `addScrap` from `./scrap`; `SHOP_CHANCE, EVENT_CHANCE, SCRAP_PER_JUMP, EVENT_COUNT` from tuning. Cycle check: `events.ts` and `shop.ts` import `scrap.ts`, `power.ts`, `hazards/*`, components, tuning, stationKinds; neither imports `run.ts`.

Create `events.ts`:

```ts
import type { SimState } from './state';
import { nextInt } from '../../../shared/rng';
import { Health, Life, LifeState } from './components';
import { igniteRoom } from './hazards/fire';
import { activateBreach, freeSites } from './hazards/breach';
import { failStation } from './power';
import { addScrap, spendScrap } from './scrap';
import { HEALTH_MAX, TORP_CAP } from './tuning';

/** The six events (spec Run-ii section 7). Text is data; the effects live in resolveEvent. */
export const EVENTS: readonly { title: string; text: string; choices: readonly [string, string] }[] = [
  { title: 'Derelict hulk', text: 'A drifting hulk, still warm inside.', choices: ['Salvage it (+25 scrap, fire risk)', 'Leave it'] },
  { title: 'Distress call', text: 'A venting freighter offers a reward for help.', choices: ['Help them (hull -10, +30 scrap)', 'Ignore it'] },
  { title: 'Smugglers', text: 'Smugglers offer torpedoes, no questions asked.', choices: ['Buy 2 torpedoes (20 scrap)', 'Refuse'] },
  { title: 'Micrometeoroid field', text: 'A debris field lies across the lane.', choices: ['Push through (+20 scrap, breach risk)', 'Go around (drive recharges)'] },
  { title: 'Supply cache', text: 'An unmarked cache, hard-wired to something.', choices: ['Take the scrap (+40)', 'Strip it bare (+60 scrap, a station fails)'] },
  { title: 'Medical freighter', text: 'A hospital ship offers treatment.', choices: ['Treat the crew (15 scrap)', 'Decline'] },
];

export function choiceEnabled(state: SimState, id: number, k: number): boolean {
  if (k !== 0) return true;
  if (id === 1) return state.hull > 10;
  if (id === 2) return state.run.scrap >= 20 && state.weapons.torpedoStock < TORP_CAP;
  if (id === 5) return state.run.scrap >= 15;
  return true;
}

/** Apply choice k of the pending event; a no-op without a pending event or with a disabled choice (spec Run-ii section 7). Loot draws only where listed. */
export function resolveEvent(state: SimState, k: number): void {
  const r = state.run, id = r.event;
  if (id < 0 || r.eventChoice >= 0 || !choiceEnabled(state, id, k)) return;
  r.eventChoice = k; state.telemetry.eventsResolved++;
  if (k === 1 && id !== 3 && id !== 4) return;
  switch (id) {
    case 0: { addScrap(state, 25); igniteRoom(state, nextInt(state.rng.loot, state.layout.rooms.length)); break; }
    case 1: { state.hull -= 10; addScrap(state, 30); break; }
    case 2: { spendScrap(state, 20); state.weapons.torpedoStock = Math.min(TORP_CAP, state.weapons.torpedoStock + 2); break; }
    case 3: { if (k === 1) { r.jumpCharge = 0; break; } addScrap(state, 20); const sites = freeSites(state); if (sites.length) activateBreach(state, sites[nextInt(state.rng.loot, sites.length)]!); break; }
    case 4: { if (k === 0) { addScrap(state, 40); break; } addScrap(state, 60); const i = nextInt(state.rng.loot, state.stations.level.length); if (!state.stations.failed[i]) failStation(state, i); break; }
    case 5: { spendScrap(state, 15); for (const eid of state.crew) if (Life.state[eid] === LifeState.Conscious) Health.cur[eid] = HEALTH_MAX; break; }
  }
}
```

Create `shop.ts`:

```ts
import type { SimState } from './state';
import { StationKind, STATION_NAMES } from './stationKinds';
import { addScrap, spendScrap } from './scrap';
import { HULL_MAX, TORP_CAP, SHOP_HULL, SHOP_HULL_COST, SHOP_TORPEDOES, SHOP_TORPEDOES_COST, SHOP_UPGRADE_COST } from './tuning';

/** Upgradeable kinds in StationKind order, Engineering excluded (spec Run-ii section 8). */
export const UPGRADE_KINDS = [StationKind.Navigation, StationKind.Weapons, StationKind.Science, StationKind.LifeSupport, StationKind.Medbay, StationKind.Doors] as const;
export const SHOP_ITEM_COUNT = 2 + UPGRADE_KINDS.length;
const upgradeKind = (i: number): number => UPGRADE_KINDS[i - 2]!;

export function itemLabel(state: SimState, i: number): string {
  if (i === 0) return `Hull +${SHOP_HULL} (${SHOP_HULL_COST} scrap)`;
  if (i === 1) return `Torpedoes +${SHOP_TORPEDOES} (${SHOP_TORPEDOES_COST} scrap)`;
  const k = upgradeKind(i); return `${STATION_NAMES[k]} +1 bar (${state.run.upgrades[k] ? 'owned' : `${SHOP_UPGRADE_COST} scrap`})`;
}
export function itemEnabled(state: SimState, i: number): boolean {
  const scrap = state.run.scrap;
  if (i === 0) return scrap >= SHOP_HULL_COST && state.hull < HULL_MAX;
  if (i === 1) return scrap >= SHOP_TORPEDOES_COST && state.weapons.torpedoStock < TORP_CAP;
  const k = upgradeKind(i); return scrap >= SHOP_UPGRADE_COST && state.run.upgrades[k] === 0 && state.derived.stationOfKind[k]! >= 0;
}
/** Buy item i if enabled (spec Run-ii section 8). No draws. */
export function buy(state: SimState, i: number): void {
  if (!itemEnabled(state, i)) return;
  if (i === 0) { spendScrap(state, SHOP_HULL_COST); state.hull = Math.min(HULL_MAX, state.hull + SHOP_HULL); }
  else if (i === 1) { spendScrap(state, SHOP_TORPEDOES_COST); state.weapons.torpedoStock = Math.min(TORP_CAP, state.weapons.torpedoStock + SHOP_TORPEDOES); }
  else { spendScrap(state, SHOP_UPGRADE_COST); state.run.upgrades[upgradeKind(i)] = 1; }
  state.telemetry.purchases++;
}
```

(`addScrap` is imported for symmetry only if used; drop it if unused. `SHOP_ITEMS` as a name is not needed: the tests import `UPGRADE_KINDS`; remove `SHOP_ITEMS` from the test import.)

- [ ] **Step 5: Run, gates, re-bless, full suite**

`npx vitest run tests/events.test.ts tests/run.test.ts tests/snapshot.test.ts tests/heat.test.ts tests/power.test.ts tests/console.test.ts tests/boundary.test.ts` → PASS (fixture arithmetic fixed only where you can state why the plan was wrong; record it). Gates before the re-bless: `npx vitest run tests/gate-survival.test.ts tests/gate-boarding.test.ts tests/gate-jump.test.ts tests/gate-run.test.ts` with the temporary logs; the survival/boarding/jump figures must equal Step 0's. If `gate-run`'s script never buys or never resolves, print the rows and cursor per second and fix the script (not the sim). Then `npm run bless` (cause: SIM_VERSION 14, new hashed fields), `npm test`, `npm run typecheck`, `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/run.ts src/renderer/src/sim/events.ts src/renderer/src/sim/shop.ts src/renderer/src/sim/scrap.ts src/renderer/src/sim/state.ts src/renderer/src/sim/flatten.ts src/renderer/src/sim/tuning.ts src/renderer/src/sim/power.ts src/renderer/src/sim/heat.ts src/renderer/src/sim/enemy.ts src/renderer/src/sim/boarders.ts tests/events.test.ts tests/gate-run.test.ts tests/run.test.ts tests/gate-jump.test.ts tests/snapshot.test.ts tests/heat.test.ts tests/power.test.ts tests/console.test.ts tests/helpers/sim.ts tests/golden/basic.json
git commit -m "feat: node types from the map stream, scrap, six events and eight shop items resolved from the Navigation list, a permanent base bar per kind; jumpShip takes its destination; SIM_VERSION 14 (golden re-blessed: new run and telemetry fields are hashed)"
```

---

### Task 2: HUD rows and threats, record and table

**Files:**
- Modify: `src/renderer/src/render/hudModel.ts`, `src/renderer/src/render/hud.ts`, `src/renderer/src/sim/telemetry.ts`, `src/renderer/src/sim/acceptance.ts`, `tests/hud.test.ts`, `tests/telemetry.test.ts`, `tests/acceptance.test.ts`

**Interfaces:**
- Consumes: `navRows`, `NodeType`, `EVENTS`, `baseMax`, `UPGRADE_KINDS` from Task 1.
- Produces: `NavigationPanel.rows`/`scrap` (replacing `destinations`/`cursor`), `navigationFooter` with the scrap suffix, event/shop threat rows, `HudStation.max`/`EngineeringPanel.rows[].max` = `baseMax`, record `run.scrap/events/purchases/upgrades`, table column `scrap`.

- [ ] **Step 1: Write the failing tests**

`tests/hud.test.ts`: the Run-i Navigation test (lines ~340–352) replaces every `destinations`/`cursor` read: `p.rows.map((r) => [r.text, r.selectable, r.enabled, r.cursor])` → `[['Node 2a', true, true, false], ['Node 2b', true, true, true]]` (cursor 1), `p.scrap` → 0, and the final-column panel `f.destinations` → `expect(f.rows).toEqual([])`; the three footer expectations gain `   Scrap 0`. There is no HUD render test today (none of `hud.ts` is covered by a test); the Navigation window, dim/disabled/cursor styling and the `MAX_CELLS` growth stay covered by the model tests and the manual gate, as in Run-i (note this in the report). Add:

```ts
  it('event and shop rows: four event rows with the cursor on the first choice, the shop list, the footer scrap, the threat rows first, and baseMax on the power rows', () => {
    const s = makeState(2); quiet(s); mapM(s); s.run.column = 1; s.run.node = 2; setEvent(s, 4); grantScrap(s, 45); const n = seatNavigator(s, 0); run(s, 1); clampNavCursor(s);
    const m = buildHudModel(s, slots(2), 'running', ''); const p = m.players[0]!.console as NavigationPanel;
    expect(p.rows.map((r) => [r.text, r.selectable, r.enabled, r.cursor])).toEqual([['Supply cache', false, false, false], ['An unmarked cache, hard-wired to something.', false, false, false], ['Take the scrap (+40)', true, true, true], ['Strip it bare (+60 scrap, a station fails)', true, true, false]]);
    expect(p.scrap).toBe(45); s.run.jumpCharge = 0.64; expect(navigationFooter(buildHudModel(s, slots(2), 'running', '').players[0]!.console as NavigationPanel)).toMatch(/^Evade \d+%   Jump 64%   Scrap 45$/);
    expect(m.threats[0]).toEqual({ icon: 'icon.sensors', text: 'Event: Supply cache' });
    igniteRoom(s, room(s, 'A')); placeEnemy(s); const t = buildHudModel(s, slots(2), 'running', '').threats; expect(t[0]!.text).toBe('Event: Supply cache'); expect(t[1]!.icon).toBe('icon.weapons'); expect(t[2]!.text).toBe('Fire: Bridge');
    setNodeTypes(s, { '1:2': NodeType.Shop }); const sh = buildHudModel(s, slots(2), 'running', '').threats; expect(sh.slice(0, 2).map((x) => x.text)).toEqual(['Event: Supply cache', 'Shop here']);
    resolveEvent(s, 0); const q = buildHudModel(s, slots(2), 'running', '').players[0]!.console as NavigationPanel;
    expect(q.rows).toHaveLength(10); expect(q.rows[0]!.text).toBe('Shop   scrap 85'); expect(q.rows[1]!.text).toBe('Hull +25 (30 scrap)'); expect(q.rows[1]!.enabled).toBe(false); expect(q.rows[9]!.text).toBe('Node 3a');   // mask 1:2 = 1: one destination
    expect(buildHudModel(s, slots(2), 'running', '').threats[0]!.text).toBe('Shop here');
    s.run.upgrades[StationKind.Weapons] = 1; const eng = s.derived.stationOfKind[StationKind.Engineering]!; sitDown(s, 1, eng);
    const m2 = buildHudModel(s, slots(2), 'running', ''); expect(m2.stations.find((x) => x.kind === StationKind.Weapons)!.max).toBe(STATION_MAX[StationKind.Weapons]! + 1);
    expect((m2.players[1]!.console as EngineeringPanel).rows[StationKind.Weapons]!.max).toBe(STATION_MAX[StationKind.Weapons]! + 1); expect((m2.players[1]!.console as EngineeringPanel).rows[StationKind.Science]!.max).toBe(STATION_MAX[StationKind.Science]!);
    void n;
  });
```

(imports: `mapM, setEvent, setNodeTypes, grantScrap, seatNavigator, run, room, placeEnemy` from helpers; `clampNavCursor, NodeType` from run; `resolveEvent` from events; `igniteRoom`; `EngineeringPanel` type.) `tests/telemetry.test.ts`: the exact-record fixture sets `t.scrapEarned = 60; t.scrapSpent = 15; t.eventsResolved = 2; t.purchases = 1; s.run.upgrades[StationKind.Weapons] = 1;` and expects `run: { nodesReached: 3, jumps: 3, columns: 8, scrap: { earned: 60, spent: 15 }, events: 2, purchases: 1, upgrades: ['Weapons'] }`. `tests/acceptance.test.ts`: `rec()`'s `run` gains `scrap: { earned: 0, spent: 0 }, events: 0, purchases: 0, upgrades: []`; the header regex ends `nodes\s+scrap$`; the row tails `0\/8$` → `0\/8\s+0\/0$`, and the victory row gets `run: { ..., scrap: { earned: 145, spent: 30 }, events: 1, purchases: 1, upgrades: ['Weapons'] }` with tail `3\/8\s+145\/30$`.

- [ ] **Step 2: Run to verify failure**

`npx vitest run tests/hud.test.ts tests/telemetry.test.ts tests/acceptance.test.ts` → missing `rows`/`scrap`, old footer, old threat order, missing record fields.

- [ ] **Step 3: hudModel.ts, hud.ts, telemetry.ts, acceptance.ts**

`hudModel.ts`: `NavigationPanel = { kind: 'navigation'; evadeChance; jump; here; final; rows: { text: string; selectable: boolean; enabled: boolean; cursor: boolean }[]; scrap: number }`; the Navigation branch: `const rows = navRows(state), c = state.stations.cursor[i]!; return { kind: 'navigation', evadeChance: …, jump: …, here: nodeLabel(r.column, r.node), final: r.column === RUN_COLUMNS - 1, rows: rows.map((row, k) => ({ text: row.text, selectable: row.select !== 'none', enabled: row.enabled, cursor: k === c })), scrap: r.scrap };` `navigationFooter` appends `` `   Scrap ${p.scrap}` ``. Threats: before the enemy push: `if (state.run.event >= 0 && state.run.eventChoice < 0) threats.push({ icon: 'icon.sensors', text: \`Event: ${EVENTS[state.run.event]!.title}\` }); if (state.run.nodeType[state.run.column * 3 + state.run.node] === NodeType.Shop) threats.push({ icon: 'icon.sensors', text: 'Shop here' });`. `max: STATION_MAX[k]!` → `max: baseMax(state, k)` in both places (import `baseMax`; drop `STATION_MAX` if unused).

`hud.ts`: `MAX_CELLS = Math.max(...STATION_MAX) + 2`; the Navigation branch: `const c = p.console, first = targetWindow(c.rows.findIndex((r) => r.cursor), c.rows.length, 7); ui.consoleRows.forEach((r, k) => { const row = c.rows[first + k]; r.root.visible = !!row; if (row) r.set({ name: row.text, level: 0, max: 0, status: row.selectable && !row.enabled ? '-' : '', cursor: row.cursor, tint: row.cursor ? TEXT : DIM }); });` (import `targetWindow`).

`telemetry.ts`: `run: { nodesReached: number; jumps: number; columns: number; scrap: { earned: number; spent: number }; events: number; purchases: number; upgrades: string[] }`; builder: `run: { nodesReached: state.run.nodesReached, jumps: t.jumps, columns: RUN_COLUMNS, scrap: { earned: t.scrapEarned, spent: t.scrapSpent }, events: t.eventsResolved, purchases: t.purchases, upgrades: STATION_NAMES.filter((_, k) => state.run.upgrades[k] === 1) }`. `acceptance.ts`: `COLUMNS` gains `'scrap'`; `row` pushes `` `${r.run.scrap.earned}/${r.run.scrap.spent}` ``.

- [ ] **Step 4: Run and full suite**

`npx vitest run tests/hud.test.ts tests/telemetry.test.ts tests/acceptance.test.ts tests/render.test.ts tests/renderPure.test.ts tests/session.test.ts` → PASS; `npm test`, `npm run typecheck`, `npm run build`; golden unchanged; `npm run acceptance 1 1` → three rows ending `0/8   0/0`-style.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/render/hudModel.ts src/renderer/src/render/hud.ts src/renderer/src/sim/telemetry.ts src/renderer/src/sim/acceptance.ts tests/hud.test.ts tests/telemetry.test.ts tests/acceptance.test.ts
git commit -m "feat: the Navigation panel lists event choices, shop items and destinations with a window and the scrap footer; event and shop threat rows; power rows show the upgraded base; the record and table carry scrap"
```

---

### Task 3: Gate, spec amendments, roadmap

**Files:**
- Modify: `docs/gates.md`, `docs/superpowers/specs/2026-11-11-events-shops-design.md`, `docs/superpowers/specs/2026-11-11-sector-map-design.md`, `docs/roadmap.md`

- [ ] **Step 1:** `npm run acceptance 5 1`; append the spec's §12 section to `docs/gates.md` with every automated entry checked **now**, recording the survival/boarding/jump figures (identical), the `gate-run` totals, the golden hash and the dated rows; manual row unchecked.
- [ ] **Step 2:** Append `## 14. Amendments from the plan` to the Run-ii spec (the items at the top of this plan plus `sim/scrap.ts`, any fixture arithmetic corrected) and a line to the Run-i spec's §12: `jumpShip(state, destination)` and the mixed Navigation list (Run-ii). `docs/roadmap.md`: item 9 → `in review`, item 10 → `next`.
- [ ] **Step 3:** `npm run typecheck && npm test && npm run build`; commit:

```bash
git add docs/gates.md docs/superpowers/specs/2026-11-11-events-shops-design.md docs/superpowers/specs/2026-11-11-sector-map-design.md docs/roadmap.md
git commit -m "docs: Run-ii gate with the identical survival, boarding and jump figures, the run gate totals and the acceptance rows, spec amendments, roadmap status"
```
