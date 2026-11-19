# Engineering spike Part ii: the ship-view HUD, the clicks, the smoke and the report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Part i's reactor, coolant, doors and airlocks in the players' hands from the ship view. The work has these parts:
- an amber CRT engineering panel: power columns where a left click adds a bar and a right click removes one, the overdrive slot, crossed lost slots, a heat bar, coolant pips that cycle on click, and the reactor's spare bars;
- interior overlays: a per-room air tint, fire and breach markers in every room, and a hover highlight on a clickable door or airlock;
- door and airlock clicks on the interior, which anyone sends from anywhere;
- the same command path for Single player and online;
- a Single-player app smoke that clicks and asserts, the screenshots, and the spike report.

**Architecture:** The view code changes; the sim does not. Every click becomes one of Part i's four commands (`power`, `coolant`, `door`, `airlock`), and they all take one path:
1. The click lands in the duel keyboard's console slot: `ConsoleInput.ship`, which fills `KeySample.ship`.
2. Each mode's `play` hands them to the sim: the local runtime `queue`s them and the online session `send`s them.

So both modes behave the same. HUD clicks come from React (`actions.ship.*`). Interior clicks come from the scene, which hit-tests the canvas click against the interior's last placement (`shipControlAt`). The HUD keeps today's rule: the scene sends it whenever the view is the interior. The panel wraps itself in a CRT context so it draws in the console ramp over a non-CRT interior.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), React 19 + zustand 5 (the UI overlay), PixiJS 8 (the interior), Vitest 3.2 (+ jsdom and @testing-library/react for `.tsx`), Electron + electron-vite, and playwright-core (in a scratch folder only, for the smoke and the screenshots).

**Spec:** `docs/superpowers/specs/2026-11-18-engineering-spike-design.md`. This part covers §1 (the deliverables), §5 (the door UI), §6 (the HUD), §8 (the app smoke and the screenshots) and §9.3 with §10 (Amendments 1 and 2, commits e2845987 and 4f675e69; §10 overrides §2 and §9 where they differ) in Tasks 7 to 9; the sim tests in §8 and the sims of §9 and §10 are Part i's. The shared names contract for both parts is `C:\Users\djuar\AppData\Local\Temp\claude\86da55dbee83ee65\d8a25b83-5518-4ff7-8d18-092dee3dc32c\scratchpad\eng-contract.md`. Precedent for the format, the gates and the screenshot method: `docs/superpowers/plans/2026-11-18-valkyrn-ii-ship-and-views.md`, Task 9.

**Branch and worktree:** all work happens in `C:\Users\djuar\FTLite\.worktrees\engineering` on branch `spike/engineering`, **after Part i is complete** on the same branch. The controller made the worktree and its junctions; executors do not. Every command runs from the worktree root.

## Global Constraints

- **No sim change.** Part ii edits nothing under `src/renderer/src/sim/**` or `src/renderer/src/net/**`. SIM_VERSION stays **54** (Part i's bump, on this branch only). Task 1 records both baselines at 54, and Task 10 proves them `same`. Never run `npm run bless` in Part ii, never pass `--fresh`, never hand-edit goldens.
- **Part i names consumed (contract, binding):**
  - from `sim/duel/power.ts`: `DuelSystem`, `DUEL_SYSTEM_COUNT` (5), `OVERDRIVE_SYSTEMS` (4), `SYSTEM_MAX` `[4,9,4,3,2]`, `SYSTEM_SLOTS` `[5,10,5,4,2]`, `START_BARS` `[2,2,3,1,1]`, `REACTOR_BARS` (10), `COOLANT_POOL_DUEL` (8), `capacityOf(d, k)`, `sparesOf(d)`, `coolantFree(d)`, `isOverdriven(d, k)`;
  - `DuelState.power: PowerState` (`{ heat: number[]; coolant: number[]; failed: number[] }`, `failed` 0 or 1) and `ShipSystems.bars: number[]` (length 5, in system order Shields, Weapons, Engines, Sensors, Oxygen);
  - from `sim/tactical/bars.ts`: `effectiveBars(sys, k)` and `SHIELD_LAYERS_BY_BARS`;
  - from `sim/duel/hazards.ts`: `fireTileOf(d, room): number`;
  - from `sim/duel/tuning.ts`: `LOW_AIR_FRAC` (0.25);
  - from `sim/tuning.ts`: `HEAT_MAX` (240, already there);
  - the `DuelCommand` members `{ kind: 'shipPower'; system; delta }`, `{ kind: 'shipCoolant'; system }`, `{ kind: 'shipDoor'; edge }`, `{ kind: 'shipAirlock'; index }` (Part i Decision 1: the sector owns `power` and `coolant`);
  - `PowerState.failed: number[]` (0 or 1) and `DuelState.systemRooms` (there is no `SYSTEM_ROOM` table).
- **Part ii names (produced here):**
  - `render/duel/shipControls.ts`: `ShipCommand`, `ShipControl`, `shipControlAt(d, placement, x, y)`, `shipCommandOf(c)`;
  - `ConsoleInput.ship?(command)` and `KeySample.ship?: ShipCommand[]`;
  - `actions.ship.{power, coolant, door, airlock}`;
  - `ShipHudView.power: PowerView` and `ShipHudView.shields.cap`;
  - `airTint`, `airTints` and `hazardMarkers` in `interiorModel.ts`;
  - `InteriorView.placement()`;
  - the scene option `shipCommand` and the scene method `interiorPlacement()`;
  - the staging hook `window.__ftliteScene`.
- **Amendments 1 and 2 (spec §9, §10):** only Tasks 7 to 9 consume `throttleCap`, `sensorRange`, `pointSeen`, `contactSeen`, `ShipSystems.weaponPower` (bars per weapon), `trimmedWeaponPower`, `weaponBarsUsable`, `barrelShots`, the pew pew state (`pewCharge`, `pewLock`, `pewTargeted`), and the `weaponPower` and `laserLock { weapon }` commands. Only those tasks produce the console strips, the locked notches, the three-weapon Weapons block and the fog. Keep every such edit inside them.
- **Test ids (the smoke depends on them):** `hud-power-<system>` (0..4), `hud-coolant-<system>` (0..3), `console-card-pew` and `console-weapon-pips-<slot>` (0..2).
- **No layout literal** (`'hound'`, `'cutter'`, `'valkyrn'`) in `src/renderer/src/**`. Tests may import `hound.json`.
- **Git:** never `git add -A`, `git add .` or `git stash`; stage files by name. Every commit message ends with a blank line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, passed as a second `-m`. Files are UTF-8.
- **Test commands:**
  - targeted: `npx vitest run <files>`;
  - types: `npx tsc -b`;
  - the full suite: `npx vitest run --maxWorkers=4`, always after `npx electron-vite build`;
  - in Task 10: `npm run test:duel-app-runtime`.
  - Never run two vitest processes at once. `tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts` and `tests/gate-*.test.ts` can time out under load: rerun a failing one alone before calling it a failure.
- **Comments:** each new file gets a header comment citing "Engineering spike §x". Exports get doc comments. Changed lines that need a reason cite the spec section.

## Decisions where the spec leaves room, and where the code forces a choice

1. **One command path for both modes.** HUD and interior clicks go to `ConsoleInput.ship`, which the duel keyboard queues into `KeySample.ship`, up to `SHIP_QUEUE_MAX` = 16, oldest dropped first. The local runtime's `play` queues them first thing, before the Tab, stand and seat branches, so a click counts on foot and on every seat. The online `play` `send`s them first thing. Both run only while the duel is live: the local `play` doesn't run while paused, and the online one doesn't run off `running`, so a click while paused is dropped, as every other press is. The one keyboard `clear()` (Tab, blur, a new round) drops pending clicks, and `clearUi()` (a console change) keeps them.
2. **`ConsoleInput.ship` is optional** (`ship?`). Six UI tests build `ConsoleInput` literals without it (`tests/feelUi.test.tsx:31`, `tests/feelIiUi.test.tsx:35`, …), so callers use `?.`.
3. **`ShipCommand` lives in `render/duel/shipControls.ts`** as `Extract<DuelCommand, …>`, beside the interior hit-test, and `app/duel/input.ts` imports the type. That keeps the scene, the interior and the input on one name without touching `net/`.
4. **The HUD's system columns become the power columns** (Shields, Weapons, Engines, Sensors, O2), followed by the reactor. Today's four capacity columns (HELM, WEAP, SHLD, MED) go: capacity is now the empty slots plus the crossed lost slots, and the Medbay column has no power. `shipHudModel.test.ts` and `uiShipHud.test.tsx` are rewritten for the new view.
5. **Lost slots are derived, not stored.** A column carries `bars`, `capacity`, `slots` and `max`. Slot k is `on` below `bars`, `empty` below `capacity`, and `lost` otherwise. The overdrive slot is k = max when slots > max. The contract's `lost` field is dropped.
6. **Doors, airlocks, fire and breaches already draw on the interior.**
   - The tile layer draws every door and airlock each frame, including the held look's ticks (`render/tiles.ts:84-98`, `doorModel` `heldTick`).
   - Fire draws in every room (`painted/fireLayer.ts:44`, `interiorFeel.ts:236`).
   - Breach decals and vent specks draw for every site (`effects.ts:59-80`).
   So the HUD view carries no rooms, doors or airlocks (the contract's `rooms`, `doors` and `airlocks` are dropped). The interior adds what is missing: the air tint, a marker with a progress pie and "HOLD E" for fires outside the three repair rooms and for breaches, and the hover highlight.
7. **The air tint** has no tint at 50 % air or more:
   - from 50 % down to 25 % it is an amber wash, alpha 0 → 0.3;
   - below 25 % (`LOW_AIR_FRAC`, where air starts to hurt) it is red, alpha 0.3 → 0.55 at 0 %.
   It is drawn under the damage tint. `airTint` is pure and unit-tested.
8. **The amber CRT panel** wraps the whole ship HUD (hull, shields and power) in its own `<CrtProvider crt>` and `<CrtGlow>`, inside the duel's non-CRT provider. The interior itself stays un-CRT (`crtActive('interior')` is false, `render/crt.ts`), and the panel sits on a CRT-glass backing for legibility over the painting. No CRT scanline screen is added: `CrtScreen` covers the whole stage and would cover the interior.
9. **The SHIP tab.** The spec says the HUD shows "on foot, or seated with the SHIP tab open". In today's code the SHIP tab stands the character up (`tabActions.ship: 'stand'`), and the view is the interior exactly when standing, or on the Valkyrn's Tab ship view (`runtime.ts:282`). The existing rule `hud: view === 'interior'` (`scene.ts:291`) therefore already matches, and is kept.
10. **The app smoke is a Single-player Electron script**, run by the controller (Task 11). It clicks a power column (right and left), a coolant counter and a door, asserts on the staged runtime's state, then takes the screenshots. The online `duel-app-smoke` driver clicks only DOM test ids and has no canvas click, so extending it is out of scope. The online path shares every line but `send`, and `npm run test:duel-app-runtime` stays green (Task 10).
11. **The HUD panel may overlap the Hound's lower-left rooms** at the zoom-0 fit (the panel covers x 6–334, y 546–712; room R's lowest row sits near y 557). A click on the panel never reaches the canvas, because only `pointerEvents: 'auto'` elements take clicks. Zoom or pan the interior to reach a covered door. The report notes it for the owner's look check.
12. **Shields pips** show three states:
    - `up`, a raised layer;
    - `down`, powered but not up;
    - `unpowered`, beyond the bars' layer cap `SHIELD_LAYERS_BY_BARS[effectiveBars(sys, Shields)]`.
    So a 1-layer round start reads as one powered pip and one unpowered one.
13. **Amendments 1 and 2 are isolated in Tasks 7 to 9.** Tasks 1 to 6 and 10 to 11 don't depend on them. Spec §10 overrides §9 where they differ: 1 Engines bar is 25 % throttle (`THROTTLE_CAP_BY_BARS [0,1,2,3,4,4]`), and the Weapons officer spreads the station's bars over pew pew, beam and torpedo (0–3 each, the overdrive bar as one weapon's 4th). The console strip sits beside the station block (`POWER_STRIP`); the Valkyrn's Flight seat gets none (§9.3 names Helm, Weapons and Science). A `weaponPower` click rides Task 2's ship queue, and the sim refuses it off the Weapons seat. The app's throttle requests stop at `throttleCap`, and REV needs an Engines bar.
14. **Pew pew in the targeting flow.** It's a third card (`console-card-pew`). Pick it up, click a room, and it sends `laserLock { weapon: 'pew' }`. 'laser' stays the beam's name in the view code, so the Valkyrn's Flight cards and `WEAPON_CODES` keep theirs. Pew pew has no number key in the spike (1 is the beam, 2 the torpedo, 3/4/5 the frequency). Its target shows on its card; the contact window marks only the beam's and the torpedo's rooms, as today.
15. **The fog is per screen.** `stepFog` runs in the scene each frame from the sim state:
    - the enemy is left out of the map's `ships` while unseen, which hides its silhouette, arcs, charge ring, bracket and pings, and the lock mark and Weapons info line are gated the same way;
    - the derelict's mark and the enemy torpedo (and its path) are gated by `seen`;
    - the crew's own torpedo is always drawn: the crew knows where it sent it;
    - the contact window on an unseen contact reads CONTACT LOST with nothing to pick;
    - ghosts fade on the presentation clock, so a pause doesn't freeze them.
16. **Free coolant and heat** (spec §6). The free coolant reads `COOLANT n/8` in the panel's header line, directly over the reactor column, because the column's own pip row is too short for text. A heat bar turns hot above 75 % of HEAT_MAX, as well as while overdriven. A breach marker that shares its tile with a fire marker (a room without a repair point, whose fire is fought at its breach tile) sits half a tile lower so the two labels don't overlap.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/renderer/src/render/duel/shipHudModel.ts` | modify (T1) | `PowerView`, `PowerColumn`, `powerView`, `slotState`, `overdriveSlot`, the power layout, `shields.cap` |
| `src/renderer/src/render/duel/shipControls.ts` | create (T2) | `ShipCommand`, `ShipControl`, `shipControlAt`, `shipCommandOf` |
| `src/renderer/src/app/duel/input.ts` | modify (T2) | `ConsoleInput.ship?`, `KeySample.ship`, the keyboard's queue |
| `src/renderer/src/ui/actions.ts` | modify (T2) | `actions.ship.*` |
| `src/renderer/src/app/duel/runtime.ts`, `app/duel/onlineDuel.ts` | modify (T3, T6) | queue or send `k.ship`; online: the scene's `shipCommand` |
| `src/renderer/src/ui/duel/ShipHud.tsx` | rewrite (T4) | the amber CRT panel and its clicks |
| `src/renderer/src/render/duel/interiorModel.ts`, `render/duel/interiorView.ts` | modify (T5) | air tints, hazard markers, hover, `placement()` |
| `src/renderer/src/app/duel/scene.ts`, `app/duel/duelMode.ts` | modify (T6) | interior clicks and hover; `interiorPlacement`; the staging hook |
| `src/renderer/src/render/duel/consoleModel.ts`, `consoleLayout.ts`, `ui/duel/HelmStation.tsx`, `ui/duel/PowerStrip.tsx` (create), `ui/duel/DuelUi.tsx` | modify (T7) | the console power strips, the throttle cap, the Science range |
| `src/renderer/src/ui/duel/WeaponsStation.tsx` (rewrite), `app/duel/contactController.ts`, `render/duel/contactModel.ts` | modify (T8) | pew pew, beam and torpedo with bar pips; pew pew in the targeting flow |
| `src/renderer/src/render/tactical/fogModel.ts` (create), `tacticalModel.ts`, `weaponsModel.ts`, `tacticalLayer.ts` | modify (T9) | the fog of war, the range ring, the ghosts |
| `docs/superpowers/research/2026-11-18-engineering-spike.md` | modify (T11) | Part ii's sections of Part i's report |
| `tests/shipHudModel.test.ts`, `tests/uiShipHud.test.tsx` | rewrite (T1, T4) | the new HUD view |
| `tests/engineeringInput.test.ts`, `tests/engineeringRuntime.test.ts`, `tests/engineeringInterior.test.ts`, `tests/engineeringScene.test.ts`, `tests/engineeringConsoleModel.test.ts`, `tests/engineeringConsoleUi.test.tsx`, `tests/engineeringWeapons.test.ts`, `tests/engineeringWeaponsUi.test.tsx`, `tests/engineeringFog.test.ts` | create | one or two files per task (Tasks 7 to 9 at the end) |

---

### Task 1: Pre-flight, baselines, and the HUD's power view

**Files:**
- Modify: `src/renderer/src/render/duel/shipHudModel.ts`
- Rewrite: `tests/shipHudModel.test.ts`

**Interfaces:**
- Consumes: Part i's names (Step 1).
- Produces: `POWER_NAMES`, `PowerColumn`, `PowerView`, `ShipHudView` (`hull`, `shields: { layers; up; cap }`, `power`), `powerView(d)`, `shipHud(d)`, `SlotState`, `slotState(c, k)`, `overdriveSlot(c, k)`, `HUD.power`, `powerColumnX(n)`, `powerNameY()`, `coolantY()`, `heatY()`, `powerBarY(k)`, `powerPanel()`, `hullSegX(k)`, `hullTone(hull, max)`, `HULL_PER_SEGMENT`.

- [ ] **Step 1: Pre-flight: Part i's names exist**

Run each one. If any prints nothing, stop and report:
```bash
git grep -n "SIM_VERSION = 54" -- src/renderer/src/sim/tuning.ts
git grep -n "export function capacityOf" -- src/renderer/src/sim/duel/power.ts
git grep -n "export function sparesOf" -- src/renderer/src/sim/duel/power.ts
git grep -n "export function coolantFree" -- src/renderer/src/sim/duel/power.ts
git grep -n "export function isOverdriven" -- src/renderer/src/sim/duel/power.ts
git grep -n "COOLANT_POOL_DUEL" -- src/renderer/src/sim/duel/power.ts
git grep -n "export function effectiveBars" -- src/renderer/src/sim/tactical/bars.ts
git grep -n "SHIELD_LAYERS_BY_BARS" -- src/renderer/src/sim/tactical/bars.ts
git grep -n "export function fireTileOf" -- src/renderer/src/sim/duel/hazards.ts
git grep -n "LOW_AIR_FRAC" -- src/renderer/src/sim/duel/tuning.ts
git grep -n "kind: 'shipAirlock'" -- src/renderer/src/net/contracts.ts
git grep -n "power:" -- src/renderer/src/sim/duel/state.ts
```
Then check that every duel has power state, whatever its layout, since `shipHud` runs for any duel (the Cutter in `tests/shipHudScene.test.ts`, the Valkyrn in Single player):
```bash
npx tsx -e "import c from './src/renderer/src/sim/ship/cutter.json'; import { parseShip } from './src/renderer/src/sim/ship/schema'; import { createDuel } from './src/renderer/src/sim/duel/state'; import { capacityOf } from './src/renderer/src/sim/duel/power'; const d = createDuel(parseShip(c), 5); console.log(d.tactical.systems[0].bars, d.power.heat.length, [0,1,2,3,4].map((k) => capacityOf(d, k)));"
```
Expected: `[ 2, 2, 3, 1, 1 ] 5 [ 5, 10, 5, 4, 2 ]`. If it throws, stop and report: Part i must give every layout its power state (contract change 1).

- [ ] **Step 2: Record both baselines at SIM_VERSION 54, before anything changes**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 54: …`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version 54: <R> runs, <T> ticks, <F> named fields per tick; …`, exit 0. Note `<R>`, `<T>` and `<F>`.

- [ ] **Step 3: Write the failing test** (replace `tests/shipHudModel.test.ts` whole)

```ts
// Duel polish i spec §E, Engineering spike §6: the ship HUD's pure model: the hull, the shields with the bars' layer cap,
// and the power view (one column per system, the reactor's spare bars, the coolant), with the panel's layout.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { capacityOf, DUEL_SYSTEM_COUNT, REACTOR_BARS, SYSTEM_MAX, SYSTEM_SLOTS } from '../src/renderer/src/sim/duel/power';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { SHIP_HULL } from '../src/renderer/src/sim/tactical/tuning';
import { HEAT_MAX } from '../src/renderer/src/sim/tuning';
import { coolantY, heatY, HUD, hullSegX, hullTone, overdriveSlot, POWER_NAMES, powerBarY, powerColumnX, powerNameY, powerPanel, shipHud, slotState, type PowerColumn } from '../src/renderer/src/render/duel/shipHudModel';
import { INTERIOR_BAND } from '../src/renderer/src/render/duel/interiorModel';
import { TABS } from '../src/renderer/src/render/duel/consoleLayout';

const HOUND = parseShip(hound);

describe('shipHud (spec §E; Engineering spike §6)', () => {
  it('a fresh Hound: 20 lit segments, the bars 2/2/3/1/1 of 5/10/5/4/2 slots, one spare bar, all eight coolant free', () => {
    const d = createDuel(HOUND, 5);
    try {
      const h = shipHud(d);
      expect(h.hull).toEqual({ segments: SHIP_HULL / 2, lit: SHIP_HULL / 2, tone: 'good' });
      expect(h.shields.cap).toBe(1);   // 2 Shields bars hold one layer (spec §2)
      expect(h.power.systems.map((c) => [c.system, c.name, c.bars, c.capacity, c.slots, c.max])).toEqual([
        [0, 'SHLD', 2, 5, 5, 4], [1, 'WEAP', 2, 10, 10, 9], [2, 'ENG', 3, 5, 5, 4], [3, 'SENS', 1, 4, 4, 3], [4, 'O2', 1, 2, 2, 2]
      ]);
      expect(h.power.systems.map((c) => c.cools)).toEqual([true, true, true, true, false]);
      expect(h.power.systems.every((c) => c.heat === 0 && c.heatMax === HEAT_MAX && c.coolant === 0 && !c.failed && !c.overdriven)).toBe(true);
      expect(h.power).toMatchObject({ spare: 1, reactor: REACTOR_BARS, coolantFree: 8, coolantPool: 8 });
      expect(POWER_NAMES).toHaveLength(DUEL_SYSTEM_COUNT);
      expect(JSON.parse(JSON.stringify(h))).toEqual(h);   // JSON-plain, so the sink's replaceEqualDeep can share it
    } finally { disposeDuel(d); }
  });
  it('reads the state: damage lowers capacity, bars, heat, coolant and the failed and overdriven flags show', () => {
    const d = createDuel(HOUND, 5), sys = d.tactical.systems[0];
    try {
      sys.rooms[Room.Weapons] = 1; sys.bars[1] = 2; sys.bars[3] = 0; sys.bars[2] = 3;
      d.power.heat[2] = 100; d.power.coolant[2] = 2; d.power.failed[3] = 1; d.power.heat[3] = HEAT_MAX;
      const h = shipHud(d), col = (k: number) => h.power.systems[k]!;
      expect(col(1).capacity).toBe(capacityOf(d, 1));
      expect(col(1).capacity).toBe(5);   // Weapons 10 slots, damage 1 knocks out 5 (spec §10.1)
      expect(col(2)).toMatchObject({ bars: 3, heat: 100, coolant: 2 });
      expect(col(3)).toMatchObject({ bars: 0, capacity: 0, failed: true, heat: HEAT_MAX });
      expect(h.power.spare).toBe(REACTOR_BARS - (2 + 2 + 3 + 0 + 1));
      expect(h.power.coolantFree).toBe(6);
      sys.bars[2] = SYSTEM_MAX[2]! + 1;
      expect(shipHud(d).power.systems[2]!.overdriven).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('slotState: on below the bars, empty below the capacity, lost above it; the overdrive slot is the one past max', () => {
    const c: PowerColumn = { system: 2, name: 'ENG', bars: 1, capacity: 2, slots: 4, max: 3, heat: 0, heatMax: HEAT_MAX, coolant: 0, cools: true, failed: false, overdriven: false };
    expect([0, 1, 2, 3].map((k) => slotState(c, k))).toEqual(['on', 'empty', 'lost', 'lost']);
    expect([0, 1, 2, 3].map((k) => overdriveSlot(c, k))).toEqual([false, false, false, true]);
    const o2: PowerColumn = { ...c, system: 4, name: 'O2', slots: 2, max: 2, cools: false };
    expect([0, 1].map((k) => overdriveSlot(o2, k))).toEqual([false, false]);
    expect(SYSTEM_SLOTS).toEqual([5, 10, 5, 4, 2]);
  });
  it('lays out inside the interior band: the hull below the tab strip, the power panel above the band bottom, left of the readout', () => {
    expect(HUD.hull.labelY).toBeGreaterThanOrEqual(TABS.y + TABS.h);
    expect(hullSegX(19) + HUD.hull.segW).toBeLessThan(INTERIOR_BAND.x + INTERIOR_BAND.w);
    expect(powerBarY(1) + HUD.power.barH + HUD.power.gap).toBe(powerBarY(0));   // stacked bottom up
    expect(powerBarY(0) + HUD.power.barH).toBeLessThanOrEqual(heatY());
    expect(heatY() + HUD.power.heatH).toBeLessThanOrEqual(coolantY());
    expect(coolantY() + HUD.power.pipH).toBeLessThanOrEqual(powerNameY());
    expect(powerColumnX(5) - powerColumnX(4)).toBe(HUD.power.pitch + HUD.power.reactorGap);   // the reactor stands apart
    const p = powerPanel();
    expect(p.x + p.w).toBeLessThan(INTERIOR_BAND.w);
    expect(p.y).toBeGreaterThan(HUD.shields.y + HUD.shields.pip + 40);
    expect(p.y + p.h).toBeLessThanOrEqual(INTERIOR_BAND.y + INTERIOR_BAND.h);
    expect(2 * HUD.power.pipW + HUD.power.pipGap).toBeLessThanOrEqual(HUD.power.barW);
    expect([hullTone(30, 40), hullTone(15, 40), hullTone(5, 40)]).toEqual(['good', 'warn', 'alert']);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run tests/shipHudModel.test.ts`
Expected: FAIL (`powerView`, `slotState` and the power layout are not exported; `shields.cap` is undefined).

- [ ] **Step 5: Implement** in `src/renderer/src/render/duel/shipHudModel.ts`

Replace the header comment and the imports (from line 1 to `import { classOf, CREW_SLOT, Room } from '../../sim/tactical/state';`) with:
```ts
// The ship HUD's view model and layout (duel polish i spec §E; Engineering spike §6). Pure: the crew ship's hull, its
// shields with the bars' layer cap, and the power view (one column per duel system and the reactor's spare bars, with
// heat and coolant) as JSON-plain data, built each frame by the scene on the ship view, so the sink's equality sharing
// keeps React still while nothing changes. FTL's layout idea (a segmented hull bar top left, power bars bottom left),
// original art, in the console's amber CRT ramp.
import type { DuelState } from '../../sim/duel/state';
import { capacityOf, coolantFree, COOLANT_POOL_DUEL, DUEL_SYSTEM_COUNT, isOverdriven, OVERDRIVE_SYSTEMS, REACTOR_BARS, sparesOf, SYSTEM_MAX, SYSTEM_SLOTS } from '../../sim/duel/power';
import { effectiveBars, SHIELD_LAYERS_BY_BARS } from '../../sim/tactical/bars';
import { classOf, CREW_SLOT } from '../../sim/tactical/state';
import { HEAT_MAX } from '../../sim/tuning';
```
Delete the `ROOM_LEVELS` export and its comment (no other file uses it: `git grep -n ROOM_LEVELS -- src tests` shows only this file and the old test).

Replace the whole `HUD` constant with:
```ts
/** The layout in internal px (§E, Engineering spike §6): inside the interior band, left of the readout column, below the
 *  tab strip. The power panel's columns rest on `power.bottom`: the name, then the coolant pips, the heat bar, and the
 *  slots stacked bottom up; the reactor column stands `reactorGap` to the right of the five systems. */
export const HUD = {
  x: 12,
  hull: { labelY: 46, barY: 72, segW: 14, segH: 18, gap: 2 },
  shields: { y: 100, pip: 14, gap: 4 },
  power: { bottom: 708, pitch: 52, colW: 44, barW: 34, barH: 8, gap: 2, nameH: 24, heatH: 4, pipW: 14, pipH: 8, pipGap: 4, reactorGap: 12, pad: 6 }
} as const;
```
Replace from `export type HullTone` to the end of the file with:
```ts
export type HullTone = 'good' | 'warn' | 'alert';
/** The column names in DuelSystem order (Engineering spike §2). */
export const POWER_NAMES: readonly string[] = ['SHLD', 'WEAP', 'ENG', 'SENS', 'O2'];
/** One system's power column (spec §6): powered `bars` of `capacity` usable of `slots` (max + the overdrive slot), heat
 *  0..heatMax, coolant 0..2; `cools`: it holds coolant and heat (not Oxygen). */
export interface PowerColumn { system: number; name: string; bars: number; capacity: number; slots: number; max: number; heat: number; heatMax: number; coolant: number; cools: boolean; failed: boolean; overdriven: boolean }
/** The power panel: the five columns, the reactor's spare bars of `reactor`, and the free coolant of `coolantPool`. */
export interface PowerView { systems: PowerColumn[]; spare: number; reactor: number; coolantFree: number; coolantPool: number }
/** `shields.cap`: the layers the Shields bars hold now (Engineering spike §2), never above `layers`. */
export interface ShipHudView {
  hull: { segments: number; lit: number; tone: HullTone };
  shields: { layers: number; up: number; cap: number };
  power: PowerView;
}

/** The hull colour (§E): good above half, warn from a quarter to half, alert below a quarter. */
export function hullTone(hull: number, max: number): HullTone {
  const f = max > 0 ? hull / max : 0;
  return f > 0.5 ? 'good' : f >= 0.25 ? 'warn' : 'alert';
}

/** The power panel (Engineering spike §6) from Part i's power state and the crew ship's bars. */
export function powerView(d: DuelState): PowerView {
  const bars = d.tactical.systems[CREW_SLOT]!.bars;
  const systems = Array.from({ length: DUEL_SYSTEM_COUNT }, (_, k): PowerColumn => ({
    system: k, name: POWER_NAMES[k]!, bars: bars[k]!, capacity: capacityOf(d, k), slots: SYSTEM_SLOTS[k]!, max: SYSTEM_MAX[k]!,
    heat: d.power.heat[k]!, heatMax: HEAT_MAX, coolant: d.power.coolant[k]!, cools: k < OVERDRIVE_SYSTEMS, failed: d.power.failed[k] === 1, overdriven: isOverdriven(d, k)
  }));
  return { systems, spare: sparesOf(d), reactor: REACTOR_BARS, coolantFree: coolantFree(d), coolantPool: COOLANT_POOL_DUEL };
}

/** The crew ship's HUD (§E; Engineering spike §6): hull segments `ceil(hull / 2)` of `ceil(max / 2)`, the shield layers
 *  up and the bars' layer cap, and the power panel. */
export function shipHud(d: DuelState): ShipHudView {
  const t = d.tactical, sys = t.systems[CREW_SLOT]!, cls = classOf(t, CREW_SLOT), hull = Math.max(0, Math.min(cls.hull, sys.hull));
  const layers = cls.shields.layers;
  return {
    hull: { segments: Math.ceil(cls.hull / HULL_PER_SEGMENT), lit: Math.ceil(hull / HULL_PER_SEGMENT), tone: hullTone(hull, cls.hull) },
    shields: { layers, up: Math.max(0, Math.min(layers, sys.shields)), cap: Math.min(layers, SHIELD_LAYERS_BY_BARS[effectiveBars(sys, 0)] ?? 0) },
    power: powerView(d)
  };
}

/** A slot's look (spec §6): powered, usable but empty, or lost to damage or a failure (crossed). */
export type SlotState = 'on' | 'empty' | 'lost';
export function slotState(c: PowerColumn, k: number): SlotState { return k < c.bars ? 'on' : k < c.capacity ? 'empty' : 'lost'; }
/** Slot k is the overdrive slot: the one above max, on a system that has one. */
export function overdriveSlot(c: PowerColumn, k: number): boolean { return c.slots > c.max && k === c.max; }

/** Column n's left edge: the five systems at `pitch`, the reactor (n = 5) `reactorGap` further right. */
export function powerColumnX(n: number): number { const P = HUD.power; return HUD.x + n * P.pitch + (n >= DUEL_SYSTEM_COUNT ? P.reactorGap : 0); }
export function powerNameY(): number { return HUD.power.bottom - HUD.power.nameH; }
export function coolantY(): number { return powerNameY() - 4 - HUD.power.pipH; }
export function heatY(): number { return coolantY() - 3 - HUD.power.heatH; }
/** The top of slot k (0 the bottom one). */
export function powerBarY(k: number): number { const P = HUD.power; return heatY() - 4 - (k + 1) * P.barH - k * P.gap; }
/** The panel's backing: around every column, from the tallest (the reactor's 10 bars and the Weapons column's 10 slots,
 *  8 px slots with 2 px gaps so they fit, spec §10.1) to the bottom. */
export function powerPanel(): { x: number; y: number; w: number; h: number } {
  const P = HUD.power, x = HUD.x - P.pad, y = powerBarY(Math.max(REACTOR_BARS, ...SYSTEM_SLOTS) - 1) - P.pad;
  return { x, y, w: powerColumnX(DUEL_SYSTEM_COUNT) + P.colW + P.pad - x, h: P.bottom + 4 - y };
}
/** The left edge of hull segment `k`. */
export function hullSegX(k: number): number { const h = HUD.hull; return HUD.x + k * (h.segW + h.gap); }
```
Keep `HULL_PER_SEGMENT` as it is.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/shipHudModel.test.ts`
Expected: PASS.

`npx tsc -b` now fails in `ui/duel/ShipHud.tsx` (the old `HudSystem` imports) and in `tests/uiShipHud.test.tsx`. Task 4 rewrites both. To keep this commit compiling, make the old `ShipHud.tsx` a stub that Task 4 replaces:
```tsx
// The ship HUD (duel polish i spec §E; Engineering spike §6). Placeholder between Engineering spike Part ii Tasks 1 and 4:
// Task 4 replaces it with the amber CRT panel.
import { memo } from 'react';
import type { ShipHudView } from '../../render/duel/shipHudModel';
export const ShipHud = memo(function ShipHud(_props: { hud: ShipHudView }) { return null; });
```
and in `tests/uiShipHud.test.tsx` replace the whole `describe` with `describe.skip('the ship HUD (rewritten in Engineering spike Part ii Task 4)', () => { it('pending Task 4', () => {}); });`, keeping the file's imports out. Replace the file with:
```tsx
// @vitest-environment jsdom
// Rewritten in Engineering spike Part ii Task 4.
import { describe, it } from 'vitest';
describe.skip('the ship HUD (rewritten in Engineering spike Part ii Task 4)', () => { it('pending Task 4', () => {}); });
```
Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/render/duel/shipHudModel.ts src/renderer/src/ui/duel/ShipHud.tsx tests/shipHudModel.test.ts tests/uiShipHud.test.tsx
git commit -m "feat(engineering-spike): the ship HUD's power view (columns, slots, reactor, coolant, the shields' layer cap)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Ship commands: the hit-test, the keyboard queue and the actions

**Files:**
- Create: `src/renderer/src/render/duel/shipControls.ts`
- Modify: `src/renderer/src/app/duel/input.ts`, `src/renderer/src/ui/actions.ts`
- Test: `tests/engineeringInput.test.ts`

**Interfaces:**
- Consumes: `DuelCommand` (net/contracts.ts, with Part i's four kinds); `Placement` (`render/duel/interiorCamera.ts`); `INTERIOR_BAND` (`render/duel/interiorModel.ts`); `Derived.doorTileToEdge`, `Derived.airlockOfTile` (`sim/ship/derived.ts:11,17`).
- Produces:
  - `type ShipCommand = Extract<DuelCommand, { kind: 'shipPower' | 'shipCoolant' | 'shipDoor' | 'shipAirlock' }>` (Task 8 adds `weaponPower`);
  - `type ShipControl = { kind: 'door'; edge: number; tile: number } | { kind: 'airlock'; index: number; tile: number }`;
  - `shipControlAt(d: DuelState, p: Placement, x: number, y: number): ShipControl | null`;
  - `shipCommandOf(c: ShipControl): ShipCommand`;
  - `ConsoleInput.ship?(command: ShipCommand): void`; `KeySample.ship?: ShipCommand[]`; `SHIP_QUEUE_MAX = 16`;
  - `actions.ship.power(system, delta)`, `.coolant(system)`, `.door(edge)`, `.airlock(index)`.

- [ ] **Step 1: Write the failing test** `tests/engineeringInput.test.ts`

```ts
// Engineering spike §5-§7: a ship-view click becomes one of the four ship commands. The interior hit-test maps a screen
// point to a door or an airlock through the interior's placement; the duel keyboard queues the commands for the next
// sample; the UI's actions hand them to the keyboard's console slot.
import { describe, expect, it, vi } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { TILE_PX } from '../src/shared/resolution';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { shipCommandOf, shipControlAt, type ShipCommand } from '../src/renderer/src/render/duel/shipControls';
import { createDuelKeyboard, SHIP_QUEUE_MAX, type ConsoleInput, type EventSource } from '../src/renderer/src/app/duel/input';
import { makeUi } from './helpers/uiStore';

const HOUND = parseShip(hound);
const quiet: EventSource = { addEventListener() {}, removeEventListener() {} };

describe('shipControlAt (spec §5)', () => {
  it('a point on a door tile is that door, on an airlock tile that airlock, elsewhere nothing', () => {
    const d = createDuel(HOUND, 5), der = d.interior.derived, p = { scale: 0.5, x: 100, y: 60 };
    try {
      const at = (tx: number, ty: number) => shipControlAt(d, p, p.x + (tx + 0.5) * TILE_PX * p.scale, p.y + (ty + 0.5) * TILE_PX * p.scale);
      const door = der.doorTileToEdge[7 * der.width + 12]!;   // the Ops–Quarters door at (12,7)
      expect(door).toBeGreaterThanOrEqual(0);
      expect(at(12, 7)).toEqual({ kind: 'door', edge: door, tile: 7 * der.width + 12 });
      const lock = der.airlockOfTile[7 * der.width + 0]!;   // the Hold's airlock at (0,7)
      expect(at(0, 7)).toEqual({ kind: 'airlock', index: lock, tile: 7 * der.width });
      expect(at(14, 7)).toBeNull();   // Quarters floor
      expect(at(-1, 7)).toBeNull(); expect(at(der.width, 7)).toBeNull();
      expect(shipControlAt(d, { scale: 0, x: 0, y: 0 }, 10, 10)).toBeNull();
      expect(shipCommandOf({ kind: 'door', edge: door, tile: 0 })).toEqual({ kind: 'shipDoor', edge: door });
      expect(shipCommandOf({ kind: 'airlock', index: lock, tile: 0 })).toEqual({ kind: 'shipAirlock', index: lock });
    } finally { disposeDuel(d); }
  });
  it('a point outside the interior band is nothing, even over the ship', () => {
    const d = createDuel(HOUND, 5), der = d.interior.derived;
    try { expect(shipControlAt(d, { scale: 1, x: 0, y: 0 }, 12 * TILE_PX + 4, 7 * TILE_PX + 4)).toEqual({ kind: 'door', edge: der.doorTileToEdge[7 * der.width + 12], tile: 7 * der.width + 12 });
      expect(shipControlAt(d, { scale: 1, x: 0, y: -200 }, 12 * TILE_PX + 4, 30)).toBeNull();   // y 30 is above the band (42)
    } finally { disposeDuel(d); }
  });
});

describe('the duel keyboard queues ship commands (spec §7)', () => {
  it('every click since the last sample, in order, once; clear drops them; at most SHIP_QUEUE_MAX, oldest first out', () => {
    const kb = createDuelKeyboard(quiet);
    const a: ShipCommand = { kind: 'shipPower', system: 1, delta: 1 }, b: ShipCommand = { kind: 'shipDoor', edge: 3 };
    kb.ui.ship?.(a); kb.ui.ship?.(b);
    expect(kb.sample().ship).toEqual([a, b]);
    expect(kb.sample().ship ?? []).toEqual([]);
    kb.ui.ship?.(a); kb.clear(); expect(kb.sample().ship ?? []).toEqual([]);
    kb.ui.ship?.(a); kb.clearUi(); expect(kb.sample().ship).toEqual([a]);   // a console change keeps them (Decision 1)
    for (let n = 0; n < SHIP_QUEUE_MAX + 3; n++) kb.ui.ship?.({ kind: 'shipCoolant', system: n % 4 });
    const s = kb.sample().ship!;
    expect(s).toHaveLength(SHIP_QUEUE_MAX);
    expect(s[0]).toEqual({ kind: 'shipCoolant', system: 3 % 4 });   // the first three went
    kb.destroy();
  });
});

describe('actions.ship (spec §6)', () => {
  it('each action hands its command to the console slot; nothing happens without one', () => {
    const { actions } = makeUi(), ship = vi.fn();
    actions.ship.power(0, 1);   // no console set: a no-op
    const input: ConsoleInput = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn(), ship };
    actions.setConsole(input);
    actions.ship.power(3, -1); actions.ship.coolant(2); actions.ship.door(7); actions.ship.airlock(1);
    expect(ship.mock.calls.map((c) => c[0])).toEqual([
      { kind: 'shipPower', system: 3, delta: -1 }, { kind: 'shipCoolant', system: 2 }, { kind: 'shipDoor', edge: 7 }, { kind: 'shipAirlock', index: 1 }
    ]);
    actions.setConsole({ ...input, ship: undefined }); actions.ship.door(1);   // a slot without ship: still a no-op
    expect(ship).toHaveBeenCalledTimes(4);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engineeringInput.test.ts`
Expected: FAIL (`shipControls.ts` does not exist; `SHIP_QUEUE_MAX` and `actions.ship` are undefined).

- [ ] **Step 3: Create** `src/renderer/src/render/duel/shipControls.ts`

```ts
// Engineering spike §5-§7: the ship view's four commands and the interior hit-test. A left click on a door or an
// airlock in the interior toggles it (anyone, from anywhere); the HUD's columns and pips send power and coolant. Pure:
// no Pixi, no DOM. The hit-test works on the interior's placement (the world's scale and where ship-local (0,0) lands,
// before the shake), as InteriorView.placement() reports it.
import type { DuelCommand } from '../../net/contracts';
import type { DuelState } from '../../sim/duel/state';
import { TILE_PX } from '../../../../shared/resolution';
import type { Placement } from './interiorCamera';
import { INTERIOR_BAND } from './interiorModel';

/** The ship view's commands (Part i's shipPower, shipCoolant, shipDoor and shipAirlock; Task 8 adds weaponPower). */
export type ShipCommand = Extract<DuelCommand, { kind: 'shipPower' | 'shipCoolant' | 'shipDoor' | 'shipAirlock' }>;
/** A clickable thing on the interior, with its tile index (for the hover highlight). */
export type ShipControl = { kind: 'door'; edge: number; tile: number } | { kind: 'airlock'; index: number; tile: number };

/** The door or airlock under internal point (x, y), or null: off the band, off the ship or on any other tile. */
export function shipControlAt(d: DuelState, p: Placement, x: number, y: number): ShipControl | null {
  const der = d.interior.derived, size = p.scale * TILE_PX;
  if (!(size > 0)) return null;
  if (x < INTERIOR_BAND.x || x >= INTERIOR_BAND.x + INTERIOR_BAND.w || y < INTERIOR_BAND.y || y >= INTERIOR_BAND.y + INTERIOR_BAND.h) return null;
  const tx = Math.floor((x - p.x) / size), ty = Math.floor((y - p.y) / size);
  if (tx < 0 || ty < 0 || tx >= der.width || ty >= der.height) return null;
  const tile = ty * der.width + tx, edge = der.doorTileToEdge[tile]!, lock = der.airlockOfTile[tile]!;
  if (edge >= 0) return { kind: 'door', edge, tile };
  if (lock >= 0) return { kind: 'airlock', index: lock, tile };
  return null;
}

/** The command a click on `c` sends. */
export function shipCommandOf(c: ShipControl): ShipCommand {
  return c.kind === 'door' ? { kind: 'shipDoor', edge: c.edge } : { kind: 'shipAirlock', index: c.index };
}
```
Check the import path of `TILE_PX`: `interiorModel.ts` imports it as `'../../../../shared/resolution'`. Use the same.

- [ ] **Step 4: The keyboard queue** in `src/renderer/src/app/duel/input.ts`

After `import { clampThrottle, THROTTLE_MAX } from '../../sim/duel/throttle';` add:
```ts
import type { ShipCommand } from '../../render/duel/shipControls';
```
Replace
```ts
export interface ConsoleInput { press(action: KeyAction): void; hold(code: HoldCode, on: boolean): void; lock(room: number): void; torpLock(room: number): void; throttle(level: number): void; frequency(freq: number): void }
```
with
```ts
export interface ConsoleInput { press(action: KeyAction): void; hold(code: HoldCode, on: boolean): void; lock(room: number): void; torpLock(room: number): void; throttle(level: number): void; frequency(freq: number): void;
  /** Engineering spike §6, §7: a ship-view click (a power column, a coolant counter, a door or an airlock). Optional, so
   *  the tests' console literals stay valid; callers use `?.`. */
  ship?(command: ShipCommand): void }
/** Engineering spike §7: the most ship commands held between two samples; a further one drops the oldest. */
export const SHIP_QUEUE_MAX = 16;
```
In `KeySample`, after the `freqTo` member add:
```ts
  /** Engineering spike §7: the ship-view commands clicked since the previous sample, oldest first; absent or empty for none. */
  ship?: ShipCommand[];
```
In `createDuelKeyboard`, replace
```ts
  let presses = emptyPresses(), lockTo: number | null = null, torpTo: number | null = null, throttleTo: number | null = null, freqTo: number | null = null;
```
with
```ts
  let presses = emptyPresses(), lockTo: number | null = null, torpTo: number | null = null, throttleTo: number | null = null, freqTo: number | null = null;
  let ship: ShipCommand[] = [];   // Engineering spike §7: kept by clearUi, dropped by clear
```
Replace
```ts
  const clear = (): void => { keys.clear(); taken.clear(); ui.clear(); presses = emptyPresses(); lockTo = null; torpTo = null; throttleTo = null; freqTo = null; };
```
with
```ts
  const clear = (): void => { keys.clear(); taken.clear(); ui.clear(); presses = emptyPresses(); lockTo = null; torpTo = null; throttleTo = null; freqTo = null; ship = []; };
```
In `consoleInput`, replace `    frequency(freq) { freqTo = freq; }` with:
```ts
    frequency(freq) { freqTo = freq; },
    ship(command) { ship.push(command); if (ship.length > SHIP_QUEUE_MAX) ship.shift(); }
```
In `sample()`, replace
```ts
      const out: KeySample = { moveX: x / len, moveY: y / len, interactHeld: has(INTERACT_HELD), fireHeld: held.fire, presses, held, lockTo, torpTo, throttleTo, freqTo };
      presses = emptyPresses(); lockTo = null; torpTo = null; throttleTo = null; freqTo = null;
```
with
```ts
      const out: KeySample = { moveX: x / len, moveY: y / len, interactHeld: has(INTERACT_HELD), fireHeld: held.fire, presses, held, lockTo, torpTo, throttleTo, freqTo, ...(ship.length > 0 ? { ship } : {}) };
      presses = emptyPresses(); lockTo = null; torpTo = null; throttleTo = null; freqTo = null; ship = [];
```

- [ ] **Step 5: The actions** in `src/renderer/src/ui/actions.ts`

After `import type { ContactActions } from '../app/duel/contactController';` add:
```ts
import type { ShipCommand } from '../render/duel/shipControls';
```
Replace
```ts
    frequency: (freq) => consoleInput?.frequency(freq)
  };
```
with
```ts
    frequency: (freq) => consoleInput?.frequency(freq),
    ship: (command) => consoleInput?.ship?.(command)
  };
  // Engineering spike §6: the ship view's HUD clicks, through the same console slot (the duel keyboard queues them).
  const send = (command: ShipCommand): void => consoleInput?.ship?.(command);
  const shipActions = {
    power: (system: number, delta: 1 | -1): void => send({ kind: 'shipPower', system, delta }),
    coolant: (system: number): void => send({ kind: 'shipCoolant', system }),
    door: (edge: number): void => send({ kind: 'shipDoor', edge }),
    airlock: (index: number): void => send({ kind: 'shipAirlock', index })
  };
```
In the returned object, after `    contact: contactActions,` add `    ship: shipActions,`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/engineeringInput.test.ts tests/duelInput.test.ts tests/uiActions.test.ts`
Expected: PASS.
Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/render/duel/shipControls.ts src/renderer/src/app/duel/input.ts src/renderer/src/ui/actions.ts tests/engineeringInput.test.ts
git commit -m "feat(engineering-spike): ship commands from the ship view: the interior hit-test, the keyboard queue, actions.ship" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The runtime queues and the online session sends the ship commands

**Files:**
- Modify: `src/renderer/src/app/duel/runtime.ts` (`play`), `src/renderer/src/app/duel/onlineDuel.ts` (`play`)
- Test: `tests/engineeringRuntime.test.ts`

**Interfaces:**
- Consumes: `KeySample.ship` (Task 2); Part i's sim applying `shipPower`, `shipCoolant`, `shipDoor` and `shipAirlock` for a present, conscious player.
- Produces: nothing new. Both modes forward `k.ship` in order before any seat branch.

- [ ] **Step 1: Write the failing test** `tests/engineeringRuntime.test.ts`

```ts
// Engineering spike §7: in Single player a ship-view click reaches the sim on the next tick from any character, on foot
// or seated: bars move between systems, coolant cycles, a door is held open and an airlock opens. Paused, it is dropped.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { DoorState } from '../src/renderer/src/sim/grid';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import type { ShipCommand } from '../src/renderer/src/render/duel/shipControls';
import { seatDuelCrew } from './helpers/duelSeat';

const HOUND = parseShip(hound), TICK_MS = 1000 / 60;
const idle = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });

function rig() {
  let now = 0, keys = idle();
  const tasks: { at: number; cb: () => void }[] = [];
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: { w: 1280, h: 720 }, layout: HOUND,
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = idle(); return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => { keys = idle(); }
  });
  const advance = (ms: number): void => {
    const end = now + ms;
    for (;;) { tasks.sort((a, b) => a.at - b.at); const t = tasks[0]; if (!t || t.at > end) break; tasks.shift(); now = Math.max(now, t.at); t.cb(); }
    now = end;
  };
  /** One frame carrying `ship`, a tick of wall time, and a frame after it. */
  const click = (...ship: ShipCommand[]): void => { keys = { ...idle(), ship }; rt.frame(1 / 60); advance(TICK_MS); rt.frame(1 / 60); };
  return { rt, click, advance, press: (p: Partial<Record<'pause', number>>) => { keys = { ...idle(), presses: { ...emptyPresses(), ...p } }; rt.frame(1 / 60); } };
}

describe('ship commands in Single player (spec §7)', () => {
  it('on foot: a Sensors bar out, then a Weapons bar in; coolant on Weapons; a door held; an airlock open', () => {
    const { rt, click } = rig(), d = rt.duel, der = d.interior.derived, bars = () => [...d.tactical.systems[0].bars];
    try {
      expect(rt.view()).toBe('interior');
      expect(bars()).toEqual([2, 2, 3, 1, 1]);
      click({ kind: 'shipPower', system: 3, delta: -1 });
      expect(bars()).toEqual([2, 2, 3, 0, 1]);
      click({ kind: 'shipPower', system: 1, delta: 1 });
      expect(bars()).toEqual([2, 3, 3, 0, 1]);
      click({ kind: 'shipCoolant', system: 1 });
      expect(d.power.coolant[1]).toBe(1);
      const edge = der.doorTileToEdge[7 * der.width + 12]!;
      click({ kind: 'shipDoor', edge });
      expect(d.interior.doors.state[edge]).toBe(DoorState.HeldOpen);
      const lock = der.airlockOfTile[7 * der.width]!;
      click({ kind: 'shipAirlock', index: lock });
      expect(d.interior.airlocks.open[lock]).toBe(1);
    } finally { rt.dispose(); }
  });
  it('seated at a console: the same click still applies (anyone in the ship view, spec §5)', () => {
    const { rt, click } = rig(), d = rt.duel;
    try {
      seatDuelCrew(d);
      click({ kind: 'shipPower', system: 4, delta: -1 });
      expect(d.tactical.systems[0].bars[4]).toBe(0);
    } finally { rt.dispose(); }
  });
  it('paused: a click is dropped, not held for later', () => {
    const { rt, click, press } = rig(), d = rt.duel;
    try {
      press({ pause: 1 });
      expect(rt.paused()).toBe(true);
      click({ kind: 'shipPower', system: 3, delta: -1 });
      press({ pause: 1 });
      click();
      expect(d.tactical.systems[0].bars[3]).toBe(1);
    } finally { rt.dispose(); }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engineeringRuntime.test.ts`
Expected: FAIL in the first two tests (the bars stay `[2, 2, 3, 1, 1]`: nothing forwards `k.ship`). The paused test passes already.

- [ ] **Step 3: Forward the commands in Single player** (`src/renderer/src/app/duel/runtime.ts`)

In `play`, replace
```ts
  function play(k: KeySample, requests: ContactRequests, heading: number | null, launches: number): KeySample {
    if (k.presses.switch > 0 && crew === 1) {
```
with
```ts
  function play(k: KeySample, requests: ContactRequests, heading: number | null, launches: number): KeySample {
    for (const c of k.ship ?? []) queue(c);   // Engineering spike §7: the ship view's clicks, on foot or seated, before a Tab
    if (k.presses.switch > 0 && crew === 1) {
```

- [ ] **Step 4: Forward the commands online** (`src/renderer/src/app/duel/onlineDuel.ts`)

In `play`, replace
```ts
  function play(k: KeySample, d: DuelState, me: number, requests: ContactRequests, heading: number | null, prevHeld: HeldFlags): void {
    const seat = seatOf(d, me), p = k.presses;
```
with
```ts
  function play(k: KeySample, d: DuelState, me: number, requests: ContactRequests, heading: number | null, prevHeld: HeldFlags): void {
    for (const c of k.ship ?? []) send(c);   // Engineering spike §7: the ship view's clicks, as Single player queues them
    const seat = seatOf(d, me), p = k.presses;
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/engineeringRuntime.test.ts tests/duelRuntime.test.ts tests/onlineDuel.test.ts tests/onlineDuelSession.test.ts`
Expected: PASS.
Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineDuel.ts tests/engineeringRuntime.test.ts
git commit -m "feat(engineering-spike): Single player queues and the online duel sends the ship view's commands" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The amber CRT engineering panel

**Files:**
- Rewrite: `src/renderer/src/ui/duel/ShipHud.tsx`, `tests/uiShipHud.test.tsx`

**Interfaces:**
- Consumes: Task 1's `ShipHudView`, the layout functions, `slotState` and `overdriveSlot`; Task 2's `actions.ship`; `CRT`, `blink` and `ALERT_BLINK_HZ` (`render/tactical/crtTheme.ts`); `CrtProvider`, `CrtGlow` and `useCrt` (`ui/stage/CrtContext.tsx`); `useActions` and `useUi` (`ui/context.tsx`); `boxCss` (`ui/stage/geometry.ts`).
- Produces: `ShipHud({ hud })`. Its DOM attributes and test ids:
  - `data-ui-hud-crt`, the panel backing;
  - `data-ui-hud-seg`, `data-ui-hud-tone` and `data-ui-hud-shield` (`up` | `down` | `unpowered`);
  - `data-ui-hud-slot` (`on` | `empty` | `lost`) with `data-ui-hud-sys` and `data-ui-hud-od`;
  - `data-ui-hud-heat` with `data-ui-hud-hot` (`idle` | `overdriven` | `failed`);
  - `data-ui-hud-pip` (`<system>:<k>:on|off`) and `data-ui-hud-reactor` (`spare` | `used`);
  - test ids `hud-power-<system>` and `hud-coolant-<system>`.

- [ ] **Step 1: Write the failing test** (replace `tests/uiShipHud.test.tsx` whole)

```tsx
// @vitest-environment jsdom
// Duel polish i spec §E, Engineering spike §6: the ship HUD in the amber CRT ramp. The hull and the shields with their
// layer cap, the five power columns (slots on, empty or lost, the overdrive slot marked), the heat bars and coolant
// pips, the reactor's spare bars; a left click on a column adds a bar, a right click removes one, a pip click cycles
// the coolant, all through actions.ship to the console slot.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { HUD, type PowerColumn, type ShipHudView } from '../src/renderer/src/render/duel/shipHudModel';
import { TEXT } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => ({ text: c.dataset.text!, x: Number(c.dataset.x), y: Number(c.dataset.y) }));
const all = (attr: string, v?: string) => Array.from(document.querySelectorAll<HTMLElement>(v === undefined ? `[${attr}]` : `[${attr}="${v}"]`));
const shipConsole: ConsoleView = { station: 'ship', tabs: { helm: 'open', weapons: 'locked', science: 'locked', ship: 'current' }, tabActions: { helm: 'interact', weapons: null, science: null, ship: null }, helm: null, weapons: null, science: null, side: null };
const col = (system: number, name: string, bars: number, capacity: number, slots: number, max: number, extra: Partial<PowerColumn> = {}): PowerColumn =>
  ({ system, name, bars, capacity, slots, max, heat: 0, heatMax: 240, coolant: 0, cools: system < 4, failed: false, overdriven: false, ...extra });
const hud: ShipHudView = {
  hull: { segments: 20, lit: 7, tone: 'warn' },
  shields: { layers: 2, up: 1, cap: 1 },
  power: {
    systems: [col(0, 'SHLD', 2, 5, 5, 4), col(1, 'WEAP', 2, 5, 10, 9), col(2, 'ENG', 5, 5, 5, 4, { overdriven: true, heat: 120, coolant: 1 }),
      col(3, 'SENS', 0, 0, 4, 3, { failed: true, heat: 240 }), col(4, 'O2', 1, 2, 2, 2)],
    spare: 0, reactor: 10, coolantFree: 7, coolantPool: 8
  }
};
const view = (h: ShipHudView | null = hud): DuelUiView => ({
  readout: { rows: [{ label: 'CREW', value: '2', labelTint: TEXT, valueTint: TEXT }], help: [] }, end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: false, console: shipConsole, hud: h });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store), ship = vi.fn();
  ui.actions.setConsole({ press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn(), ship });
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { ...ui, duel, ship };
}

describe('the engineering panel (spec §6)', () => {
  it('draws the hull, the shields by the cap, and each column\'s slots, overdrive slot, heat and pips, in a CRT panel', () => {
    const { duel } = mount(); act(() => duel.frame(view()));
    expect(all('data-ui-hud-crt')).toHaveLength(1);
    expect(all('data-ui-hud-seg')).toHaveLength(20);
    expect(all('data-ui-hud-seg', 'lit')).toHaveLength(7);
    expect(all('data-ui-hud-shield').map((e) => e.getAttribute('data-ui-hud-shield'))).toEqual(['up', 'unpowered']);
    const slots = (s: number) => all('data-ui-hud-slot').filter((e) => e.getAttribute('data-ui-hud-sys') === String(s));
    expect(slots(0).map((e) => e.getAttribute('data-ui-hud-slot'))).toEqual(['on', 'on', 'empty', 'empty', 'empty']);
    expect(slots(1).map((e) => e.getAttribute('data-ui-hud-slot'))).toEqual(['on', 'on', 'empty', 'empty', 'empty', 'lost', 'lost', 'lost', 'lost', 'lost']);   // 10 slots, damage 1
    expect(slots(2).map((e) => e.getAttribute('data-ui-hud-slot'))).toEqual(['on', 'on', 'on', 'on', 'on']);
    expect(slots(3).map((e) => e.getAttribute('data-ui-hud-slot'))).toEqual(['lost', 'lost', 'lost', 'lost']);
    expect(slots(4).map((e) => e.getAttribute('data-ui-hud-slot'))).toEqual(['on', 'empty']);
    expect([0, 1, 2, 3, 4].map((s) => slots(s).findIndex((e) => e.hasAttribute('data-ui-hud-od')))).toEqual([4, 9, 4, 3, -1]);
    expect(all('data-ui-hud-heat').map((e) => [e.getAttribute('data-ui-hud-heat'), e.getAttribute('data-ui-hud-hot')]))
      .toEqual([['0', 'idle'], ['0', 'idle'], ['120', 'overdriven'], ['240', 'failed']]);   // no heat bar on O2
    expect(all('data-ui-hud-pip').map((e) => e.getAttribute('data-ui-hud-pip'))).toEqual([
      '0:0:off', '0:1:off', '1:0:off', '1:1:off', '2:0:on', '2:1:off', '3:0:off', '3:1:off'
    ]);
    expect(all('data-ui-hud-reactor')).toHaveLength(10);
    expect(all('data-ui-hud-reactor', 'spare')).toHaveLength(0);
    expect(texts().filter((c) => c.y === HUD.power.bottom - HUD.power.nameH).map((c) => c.text)).toEqual(['SHLD', 'WEAP', 'ENG', 'SENS', 'O2', 'PWR']);
    expect(texts().some((c) => c.text === 'REACTOR 0/10   COOLANT 7/8')).toBe(true);
  });
  it('a left click adds a bar, a right click removes one, a pip click cycles coolant; O2 has no coolant control', () => {
    const { duel, ship } = mount(); act(() => duel.frame(view()));
    fireEvent.pointerDown(screen.getByTestId('hud-power-1'), { button: 0 });
    fireEvent.pointerDown(screen.getByTestId('hud-power-3'), { button: 2 });
    fireEvent.pointerDown(screen.getByTestId('hud-coolant-2'), { button: 0 });
    fireEvent.pointerDown(screen.getByTestId('hud-power-4'), { button: 1 });   // the middle button does nothing
    expect(ship.mock.calls.map((c) => c[0])).toEqual([{ kind: 'shipPower', system: 1, delta: 1 }, { kind: 'shipPower', system: 3, delta: -1 }, { kind: 'shipCoolant', system: 2 }]);
    expect(screen.queryByTestId('hud-coolant-4')).toBeNull();
    expect([0, 1, 2, 3, 4].every((s) => screen.getByTestId(`hud-power-${s}`).style.pointerEvents === 'auto')).toBe(true);
  });
  it('drawn whenever the frame carries a HUD, never without one; an equal HUD keeps the stored view', () => {
    const { duel, store } = mount();
    act(() => duel.frame(view(null))); expect(all('data-ui-hud-crt')).toHaveLength(0);
    act(() => duel.frame(view())); expect(all('data-ui-hud-crt')).toHaveLength(1);
    const before = store.getState().duel!.hud;
    act(() => duel.frame(view(JSON.parse(JSON.stringify(hud)) as ShipHudView)));
    expect(store.getState().duel!.hud).toBe(before);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/uiShipHud.test.tsx`
Expected: FAIL (the Task 1 stub renders nothing).

- [ ] **Step 3: Write** `src/renderer/src/ui/duel/ShipHud.tsx` (replace the whole file)

```tsx
// The ship HUD on the ship view (duel polish i spec §E; Engineering spike §6), in the consoles' amber CRT ramp (Decision 8:
// its own CRT context and glow, over the non-CRT interior). Top left: the segmented hull bar and the shield layers
// (raised, powered or beyond the bars' cap). Bottom left, on a glass backing: one power column per system (slots on,
// empty or lost and crossed, the overdrive slot dashed), its heat bar and two coolant pips, and the reactor's bars. A left
// click on a column adds a bar, a right click removes one, a click on the pips cycles the coolant (actions.ship).
import { memo, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import { coolantY, heatY, HUD, hullSegX, overdriveSlot, powerBarY, powerColumnX, powerNameY, powerPanel, slotState, type HullTone, type PowerColumn, type ShipHudView } from '../../render/duel/shipHudModel';
import { ALERT_BLINK_HZ, blink, CRT } from '../../render/tactical/crtTheme';
import { FONT_SIZE, textPx } from '../../render/theme';
import { useActions, useUi } from '../context';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { CrtGlow, CrtProvider, useCrt } from '../stage/CrtContext';
import { boxCss } from '../stage/geometry';
import { PixelText } from '../stage/PixelText';

const TONE: Record<HullTone, number> = { good: CRT.main, warn: CRT.mid, alert: CRT.hot };
const P = HUD.power;

/** A click target (spec §6): the left button and the right button, never focus, never the browser menu. */
function Hit(p: { name: string; x: number; y: number; w: number; h: number; onLeft(): void; onRight?(): void }) {
  const l = useUi((s) => s.layout);
  const stop = (e: SyntheticEvent): void => e.preventDefault();
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => { e.preventDefault(); if (e.button === 0) p.onLeft(); else if (e.button === 2) p.onRight?.(); };
  return <div data-testid={p.name} role="button" onPointerDown={down} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop}
    style={{ position: 'absolute', boxSizing: 'border-box', ...boxCss(p.x, p.y, p.w, p.h, l), pointerEvents: 'auto', cursor: 'pointer' }} />;
}

function PowerCol({ c, n, now }: { c: PowerColumn; n: number; now: number }) {
  const actions = useActions(), x = powerColumnX(n), bx = x + (P.colW - P.barW) / 2;
  const hot = c.failed ? (blink(now, ALERT_BLINK_HZ) ? CRT.hot : CRT.dim) : c.overdriven || c.heat > 0.75 * c.heatMax ? CRT.hot : CRT.main;   // spec §6: hot near HEAT_MAX
  const top = powerBarY(c.slots - 1);
  return (
    <>
      {Array.from({ length: c.slots }, (_, k) => {
        const s = slotState(c, k), od = overdriveSlot(c, k);
        return (
          <Box key={k} x={bx} y={powerBarY(k)} w={P.barW} h={P.barH} attrs={{ 'data-ui-hud-slot': s, 'data-ui-hud-sys': String(c.system), ...(od ? { 'data-ui-hud-od': '' } : {}) }}
            style={{ background: s === 'on' ? hex(od ? CRT.hot : CRT.main) : hex(CRT.glass), border: `1px ${od ? 'dashed' : 'solid'} ${hex(s === 'lost' ? CRT.faint : od ? CRT.hot : CRT.dim)}` }}>
            {s === 'lost' && <svg width="100%" height="100%" viewBox={`0 0 ${P.barW} ${P.barH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
              <path d={`M0 0L${P.barW} ${P.barH}M${P.barW} 0L0 ${P.barH}`} stroke={hex(CRT.dim)} strokeWidth={1} /></svg>}
          </Box>
        );
      })}
      {c.cools && (
        <Box x={bx} y={heatY()} w={P.barW} h={P.heatH} attrs={{ 'data-ui-hud-heat': String(c.heat), 'data-ui-hud-hot': c.failed ? 'failed' : c.overdriven ? 'overdriven' : 'idle' }} style={{ background: hex(CRT.faint) }}>
          <div style={{ width: `${Math.round((100 * Math.max(0, Math.min(c.heat, c.heatMax))) / c.heatMax)}%`, height: '100%', background: hex(hot) }} />
        </Box>
      )}
      {c.cools && Array.from({ length: 2 }, (_, k) => (
        <Box key={`pip${k}`} x={bx + k * (P.pipW + P.pipGap)} y={coolantY()} w={P.pipW} h={P.pipH} attrs={{ 'data-ui-hud-pip': `${c.system}:${k}:${k < c.coolant ? 'on' : 'off'}` }}
          style={{ background: k < c.coolant ? hex(CRT.main) : 'transparent', border: `1px solid ${hex(CRT.mid)}` }} />
      ))}
      <Hit name={`hud-power-${c.system}`} x={x} y={top} w={P.colW} h={heatY() + P.heatH - top} onLeft={() => actions.ship.power(c.system, 1)} onRight={() => actions.ship.power(c.system, -1)} />
      {c.cools && <Hit name={`hud-coolant-${c.system}`} x={bx} y={coolantY()} w={2 * P.pipW + P.pipGap} h={P.pipH} onLeft={() => actions.ship.coolant(c.system)} />}
      <PixelText text={c.name} x={x + P.colW / 2} y={powerNameY()} size={FONT_SIZE} tint={c.failed ? hot : CRT.mid} anchorX={0.5} />
    </>
  );
}

function Reactor({ hud }: { hud: ShipHudView }) {
  const n = hud.power.systems.length, x = powerColumnX(n), bx = x + (P.colW - P.barW) / 2;
  return (
    <>
      {Array.from({ length: hud.power.reactor }, (_, k) => {
        const spare = k < hud.power.spare;
        return <Box key={k} x={bx} y={powerBarY(k)} w={P.barW} h={P.barH} attrs={{ 'data-ui-hud-reactor': spare ? 'spare' : 'used' }}
          style={{ background: spare ? hex(CRT.main) : hex(CRT.glass), border: `1px solid ${hex(spare ? CRT.main : CRT.faint)}` }} />;
      })}
      <PixelText text="PWR" x={x + P.colW / 2} y={powerNameY()} size={FONT_SIZE} tint={CRT.mid} anchorX={0.5} />
    </>
  );
}

function HudBody({ hud }: { hud: ShipHudView }) {
  const { now } = useCrt(), H = HUD.hull, SH = HUD.shields, panel = powerPanel();
  const tone = hud.hull.tone === 'alert' && blink(now, ALERT_BLINK_HZ) === 0 ? CRT.dim : TONE[hud.hull.tone], pipX = HUD.x + textPx('SHIELDS', 2) + 8;
  return (
    <>
      <PixelText text="HULL" x={HUD.x} y={H.labelY} size={FONT_SIZE} tint={CRT.mid} />
      {Array.from({ length: hud.hull.segments }, (_, k) => {
        const lit = k < hud.hull.lit;
        return <Box key={k} x={hullSegX(k)} y={H.barY} w={H.segW} h={H.segH} attrs={{ 'data-ui-hud-seg': lit ? 'lit' : 'off', 'data-ui-hud-tone': hud.hull.tone }}
          style={lit ? { background: hex(tone), border: `1px solid ${hex(tone)}` } : { background: hex(CRT.glass, 0.8), border: `1px solid ${hex(CRT.faint)}` }} />;
      })}
      <PixelText text="SHIELDS" x={HUD.x} y={SH.y - 2} size={FONT_SIZE} tint={CRT.mid} />
      {Array.from({ length: hud.shields.layers }, (_, k) => {
        const state = k < hud.shields.up ? 'up' : k < hud.shields.cap ? 'down' : 'unpowered';
        return <Box key={k} x={pipX + k * (SH.pip + SH.gap)} y={SH.y} w={SH.pip} h={SH.pip} attrs={{ 'data-ui-hud-shield': state }}
          style={{ background: state === 'up' ? hex(CRT.main) : 'transparent', border: `1px ${state === 'unpowered' ? 'dashed' : 'solid'} ${hex(state === 'unpowered' ? CRT.faint : CRT.mid)}` }} />;
      })}
      <Box x={panel.x} y={panel.y} w={panel.w} h={panel.h} attrs={{ 'data-ui-hud-crt': '' }} style={{ background: hex(CRT.glass, 0.85), border: `1px solid ${hex(CRT.dim)}` }} />
      <PixelText text={`REACTOR ${hud.power.spare}/${hud.power.reactor}   COOLANT ${hud.power.coolantFree}/${hud.power.coolantPool}`} x={panel.x + P.pad} y={panel.y - 28} size={FONT_SIZE} tint={CRT.main} />
      {hud.power.systems.map((c, n) => <PowerCol key={c.system} c={c} n={n} now={now} />)}
      <Reactor hud={hud} />
    </>
  );
}

export const ShipHud = memo(function ShipHud({ hud }: { hud: ShipHudView }) {
  return <CrtProvider crt><CrtGlow><HudBody hud={hud} /></CrtGlow></CrtProvider>;
});
```
Check the two names against the source before running:
- `git grep -n "export function useUi" -- src/renderer/src/ui/context.tsx` must print a line. If `useUi` lives elsewhere, import it from where `ui/stage/Button.tsx` does.
- `git grep -n "ALERT_BLINK_HZ" -- src/renderer/src/render/tactical/crtTheme.ts` must print a line.

`CrtGlow` renders an `inset: 0` div with no pointer events set. The Stage makes non-button content pass pointer events through (Button's header: "only buttons take pointer events on the stage"), and each `Hit` sets `pointerEvents: 'auto'`, so canvas clicks outside the targets still reach the interior. Step 4's test checks the targets.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/uiShipHud.test.tsx tests/uiHudSink.test.ts tests/shipHudScene.test.ts`
Expected: PASS.

If `shipHudScene.test.ts` fails on the Cutter, the cause is Part i's per-layout power state (Task 1 Step 1). Stop and report.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ui/duel/ShipHud.tsx tests/uiShipHud.test.tsx
git commit -m "feat(engineering-spike): the amber CRT engineering panel (power columns, overdrive slot, lost slots, heat, coolant, reactor) with clicks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The interior: air tint, fire and breach markers, hover, placement

**Files:**
- Modify: `src/renderer/src/render/duel/interiorModel.ts`, `src/renderer/src/render/duel/interiorView.ts`
- Test: `tests/engineeringInterior.test.ts`

**Interfaces:**
- Consumes: Part i's `fireTileOf(d, room)` and `LOW_AIR_FRAC`; `Derived.siteTile`, `Derived.siteRoom`, `breaches.active` and `breaches.repair` (a 0..1 fraction, spec §4); `rooms.fire`, `rooms.fireRepair` and `rooms.o2`; `Derived.volume`; Task 2's `shipControlAt`; `Placement` (`interiorCamera.ts`).
- Produces:
  - `airTint(air: number): { color: number; alpha: number } | null`;
  - `interface AirTint { room: number; color: number; alpha: number; tiles: { x: number; y: number }[] }` and `airTints(d): AirTint[]`;
  - `interface HazardMarker { kind: 'fire' | 'breach'; room: number; x: number; y: number; progress: number; label: string }` and `hazardMarkers(d): HazardMarker[]`;
  - `InteriorView.placement(): Placement | null`;
  - `InteriorView.draw(…, zoom?, hover?)`, where hover is `{ x: number; y: number } | null`;
  - `HAZARD_LABELS = 16`.

- [ ] **Step 1: Write the failing test** `tests/engineeringInterior.test.ts`

```ts
// Engineering spike §6: the interior shows the air (no tint at half or more, an amber wash to a quarter, red below), a
// marker for a fire outside the three repair rooms and for every breach (HOLD E, with the progress), a hover outline on a
// door or airlock, and reports the placement the click hit-test uses.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { TILE_PX } from '../src/shared/resolution';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { fireTileOf } from '../src/renderer/src/sim/duel/hazards';
import { LOW_AIR_FRAC } from '../src/renderer/src/sim/duel/tuning';
import { AMBER, WARN } from '../src/renderer/src/render/theme';
import { airTint, airTints, hazardMarkers } from '../src/renderer/src/render/duel/interiorModel';
import { createInteriorView } from '../src/renderer/src/render/duel/interiorView';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';

const HOUND = parseShip(hound);
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};

describe('airTint (spec §6, Decision 7)', () => {
  it('none at half air or more; amber from half to a quarter; red below a quarter, deepest at none', () => {
    expect(airTint(1)).toBeNull(); expect(airTint(0.5)).toBeNull();
    expect(airTint(0.375)).toEqual({ color: AMBER, alpha: 0.15 });
    expect(airTint(LOW_AIR_FRAC)).toEqual({ color: AMBER, alpha: 0.3 });
    const below = airTint(LOW_AIR_FRAC - 1e-6)!;
    expect(below.color).toBe(WARN); expect(below.alpha).toBeCloseTo(0.3, 5);
    expect(airTint(0)).toEqual({ color: WARN, alpha: 0.55 });
    expect(airTint(-0.1)).toEqual({ color: WARN, alpha: 0.55 });
  });
  it('airTints: one entry per room below half air, over its tiles, in room order', () => {
    const d = createDuel(HOUND, 5), st = d.interior, h = st.derived.roomIndex.get('H')!, l = st.derived.roomIndex.get('L')!;
    try {
      expect(airTints(d)).toEqual([]);
      st.rooms.o2[l] = 0.1 * st.derived.volume[l]!; st.rooms.o2[h] = 0.4 * st.derived.volume[h]!;
      const t = airTints(d);
      expect(t.map((x) => [x.room, x.color])).toEqual([[h, AMBER], [l, WARN]].sort((a, b) => a[0]! - b[0]!));
      expect(t.find((x) => x.room === l)!.tiles).toHaveLength(st.derived.roomTiles[l]!.length);
    } finally { disposeDuel(d); }
  });
});

describe('hazardMarkers (spec §4, §6)', () => {
  it('a fire outside the repair rooms gets a marker at its fire tile; a breach at its site; the repair rooms keep theirs', () => {
    const d = createDuel(HOUND, 5), st = d.interior, der = st.derived, q = der.roomIndex.get('Q')!, o = der.roomIndex.get('O')!;
    try {
      expect(hazardMarkers(d)).toEqual([]);
      st.rooms.fire[q] = 2; st.rooms.fireRepair[q] = 0.5;
      st.rooms.fire[o] = 2;   // O is a repair room: its marker is interiorOverlay's
      const site = Array.from(der.siteRoom).indexOf(q);
      st.breaches.active[site] = 1; st.breaches.repair[site] = 0.25;
      const tile = fireTileOf(d, q), w = der.width, at = (t: number) => ({ x: ((t % w) + 0.5) * TILE_PX, y: (Math.floor(t / w) + 0.5) * TILE_PX });
      expect(hazardMarkers(d)).toEqual([
        { kind: 'fire', room: q, ...at(tile), progress: 0.5, label: 'FIRE - HOLD E' },
        { kind: 'breach', room: q, x: at(der.siteTile[site]!).x, y: at(der.siteTile[site]!).y + TILE_PX / 2, progress: 0.25, label: 'BREACH - HOLD E' }   // Q's fire is fought at its breach tile: the label sits half a tile lower
      ]);
    } finally { disposeDuel(d); }
  });
});

describe('the interior view (spec §6)', () => {
  it('reports its placement after a draw (null before), and draws with a hover point', () => {
    const view = createInteriorView(assets), d = createDuel(HOUND, 5);
    try {
      expect(view.placement()).toBeNull();
      view.draw(d, [], 1, 1 / 60, [], 1 / 60, undefined, { x: 400, y: 300 });
      const p = view.placement()!;
      expect(p.scale).toBeGreaterThan(0);
      expect(view.world.scale.x).toBe(p.scale);
    } finally { view.destroy(); disposeDuel(d); }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engineeringInterior.test.ts`
Expected: FAIL (`airTint`, `airTints`, `hazardMarkers` and `placement` do not exist).

- [ ] **Step 3: The pure model** (`src/renderer/src/render/duel/interiorModel.ts`)

After `import type { TileRect } from '../battlemapModel';` add:
```ts
import { fireTileOf } from '../../sim/duel/hazards';
import { LOW_AIR_FRAC } from '../../sim/duel/tuning';
import { AMBER, WARN } from '../theme';
```
Append at the end of the file:
```ts
/** Engineering spike §6, Decision 7: the air fraction where the amber wash starts. */
export const AIR_TINT_FROM = 0.5;
/** A room's air tint: none at AIR_TINT_FROM or more; amber from there down to LOW_AIR_FRAC (alpha 0 → 0.3); red below
 *  it, where the air hurts (alpha 0.3 → 0.55 at none). */
export function airTint(air: number): { color: number; alpha: number } | null {
  if (!(air < AIR_TINT_FROM)) return null;
  if (air >= LOW_AIR_FRAC) return { color: AMBER, alpha: (0.3 * (AIR_TINT_FROM - air)) / (AIR_TINT_FROM - LOW_AIR_FRAC) };
  return { color: WARN, alpha: 0.3 + (0.25 * (LOW_AIR_FRAC - Math.max(0, air))) / LOW_AIR_FRAC };
}
export interface AirTint { room: number; color: number; alpha: number; tiles: { x: number; y: number }[] }
/** Every room below AIR_TINT_FROM air, in room order, with its tiles in ship-local pixels. */
export function airTints(d: DuelState): AirTint[] {
  const st = d.interior, der = st.derived, w = der.width, out: AirTint[] = [];
  for (let r = 0; r < der.volume.length; r++) {
    const t = airTint(st.rooms.o2[r]! / der.volume[r]!);
    if (t) out.push({ room: r, ...t, tiles: der.roomTiles[r]!.map((k) => ({ x: (k % w) * TILE_PX, y: Math.floor(k / w) * TILE_PX })) });
  }
  return out;
}
/** A fire outside the repair rooms or a breach (Engineering spike §4): where to work (the tile centre), the progress
 *  0..1 and the label. The repair rooms' fires keep interiorOverlay's markers. */
export interface HazardMarker { kind: 'fire' | 'breach'; room: number; x: number; y: number; progress: number; label: string }
export function hazardMarkers(d: DuelState): HazardMarker[] {
  const st = d.interior, der = st.derived, w = der.width, out: HazardMarker[] = [];
  const centre = (t: number): { x: number; y: number } => ({ x: ((t % w) + 0.5) * TILE_PX, y: (Math.floor(t / w) + 0.5) * TILE_PX });
  for (let r = 0; r < der.volume.length; r++) {
    if (!(st.rooms.fire[r]! > 0) || d.points.some((p) => p.room === r)) continue;
    out.push({ kind: 'fire', room: r, ...centre(fireTileOf(d, r)), progress: st.rooms.fireRepair[r]!, label: 'FIRE - HOLD E' });
  }
  for (let s = 0; s < der.siteRoom.length; s++) {
    if (!st.breaches.active[s]) continue;
    const c = centre(der.siteTile[s]!), shared = out.some((m) => m.kind === 'fire' && m.x === c.x && m.y === c.y);   // a fire fought at the same tile
    out.push({ kind: 'breach', room: der.siteRoom[s]!, x: c.x, y: shared ? c.y + TILE_PX / 2 : c.y, progress: st.breaches.repair[s]!, label: 'BREACH - HOLD E' });
  }
  return out;
}
```
The test's expected order is fires first, then breaches, which matches.

- [ ] **Step 4: The view** (`src/renderer/src/render/duel/interiorView.ts`)

Replace
```ts
import { duelFit, interiorOverlay, INTERIOR_BAND, stationBadges, type StationBadge } from './interiorModel';
import { placeInterior, type InteriorCamera } from './interiorCamera';
```
with
```ts
import { airTints, duelFit, hazardMarkers, interiorOverlay, INTERIOR_BAND, stationBadges, type StationBadge } from './interiorModel';
import { placeInterior, type InteriorCamera, type Placement } from './interiorCamera';
import { shipControlAt } from './shipControls';
```
In `interface InteriorView`, replace
```ts
  draw(d: DuelState, crewPrev: readonly { x: number; y: number }[], alpha: number, dt: number, events?: readonly ViewEvent[], presentDt?: number, zoom?: { camera: InteriorCamera; active: number }): void;
```
with
```ts
  draw(d: DuelState, crewPrev: readonly { x: number; y: number }[], alpha: number, dt: number, events?: readonly ViewEvent[], presentDt?: number, zoom?: { camera: InteriorCamera; active: number }, hover?: { x: number; y: number } | null): void;
  /** Engineering spike §5: the last draw's placement (the world's scale and offset before the shake), or null before the
   *  first; the scene's click hit-test reads it. */
  placement(): Placement | null;
```
After `const TINT: readonly number[] = [0, AMBER, WARN], MARK: readonly number[] = [0, 0x8a5a00, 0xa8281c];` add:
```ts
/** Engineering spike §6: the most fire and breach markers drawn at once (8 rooms and 8 sites on the Hound). */
export const HAZARD_LABELS = 16;
```
Replace `  const damage = new Graphics(), marks = new Graphics();` with:
```ts
  const air = new Graphics(), damage = new Graphics(), marks = new Graphics();   // Engineering spike §6: the air tint under the damage tint
  let last: Placement | null = null;
  const hazardLabels = Array.from({ length: HAZARD_LABELS }, () => {
    const t = new BitmapText({ text: '', style: { fontFamily: assets.fontFamily, fontSize: FONT_NATIVE } });
    t.anchor.set(0.5, 0); t.roundPixels = true; t.visible = false; return t;
  });
```
Replace
```ts
  world.addChild(battlemap.container, tiles.container, props.container, fx.grade, effects.below, icons.container, desks.container, badges, damage, crew.container, boarders.container, effects.above, fx.lights, marks, ...labels, ...crewLabels, healMarks, ...revivedLabels);
```
with
```ts
  world.addChild(battlemap.container, tiles.container, props.container, fx.grade, effects.below, icons.container, desks.container, badges, air, damage, crew.container, boarders.container, effects.above, fx.lights, marks, ...labels, ...hazardLabels, ...crewLabels, healMarks, ...revivedLabels);
```
Replace `    draw(d, crewPrev, alpha, dt, events = [], presentDt = dt, zoom) {` with `    draw(d, crewPrev, alpha, dt, events = [], presentDt = dt, zoom, hover = null) {`.
Replace `      world.scale.set(fit.scale);` with:
```ts
      world.scale.set(fit.scale);
      last = { scale: fit.scale, x: fit.x, y: fit.y };   // before the shake: the click hit-test's placement
```
Replace
```ts
      damage.clear(); marks.clear();
```
with
```ts
      damage.clear(); marks.clear(); air.clear();
      for (const t of airTints(d)) for (const p of t.tiles) air.rect(p.x, p.y, TILE_PX, TILE_PX).fill({ color: t.color, alpha: t.alpha });
```
After the closing `});` of the `labels.forEach((t, k) => { … });` block, the one that ends with `t.tint = colour; t.position.set(Math.round(m.x), Math.round(m.y + TILE_PX * 0.5));`, add:
```ts
      // Engineering spike §4, §6: fires outside the repair rooms and breaches, worked by holding E at the marker.
      const hz = hazardMarkers(d);
      hazardLabels.forEach((t, k) => {
        const m = hz[k];
        t.visible = m !== undefined;
        if (!m) return;
        const colour = MARK[2]!, r = TILE_PX * 0.42;
        marks.poly([m.x, m.y - r, m.x + r, m.y, m.x, m.y + r, m.x - r, m.y]).stroke({ width: 2, color: colour });
        if (m.progress > 0) marks.moveTo(m.x, m.y).arc(m.x, m.y, r * 0.7, -Math.PI / 2, -Math.PI / 2 + m.progress * Math.PI * 2).closePath().fill({ color: TEXT, alpha: 0.8 });
        if (t.text !== m.label) t.text = m.label;
        t.tint = colour; t.position.set(Math.round(m.x), Math.round(m.y + TILE_PX * 0.5));
      });
      // Spec §5, §6: the door or airlock under the pointer, outlined (anyone can click it).
      const over = hover ? shipControlAt(d, last, hover.x, hover.y) : null;
      if (over) { const w = st.derived.width, tx = over.tile % w, ty = Math.floor(over.tile / w); marks.rect(tx * TILE_PX + 1, ty * TILE_PX + 1, TILE_PX - 2, TILE_PX - 2).stroke({ width: 2, color: AMBER, alpha: 0.95 }); }
```
In the returned object, after `container, world, memory,` add `placement: () => last,`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/engineeringInterior.test.ts tests/duelInterior.test.ts tests/duelFireView.test.ts tests/interiorZoomScene.test.ts tests/interiorFeel.test.ts`
Expected: PASS.
Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/duel/interiorModel.ts src/renderer/src/render/duel/interiorView.ts tests/engineeringInterior.test.ts
git commit -m "feat(engineering-spike): the interior's air tint, fire and breach markers, door hover and placement" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The scene: interior clicks and hover, both modes wired, the staging hook

**Files:**
- Modify: `src/renderer/src/app/duel/scene.ts`, `src/renderer/src/app/duel/duelMode.ts`, `src/renderer/src/app/duel/onlineDuel.ts`
- Test: `tests/engineeringScene.test.ts`

**Interfaces:**
- Consumes: Task 2's `shipControlAt`, `shipCommandOf`, `ShipCommand` and `ConsoleInput.ship`; Task 5's `InteriorView.placement()` and the hover parameter.
- Produces: `DuelSceneOptions.shipCommand?: (command: ShipCommand) => void`; `DuelScene.interiorPlacement(): Placement | null`; `window.__ftliteScene` (set beside `__ftliteDuel` under `__FTLITE_STAGE__`).

- [ ] **Step 1: Write the failing test** `tests/engineeringScene.test.ts`

```ts
// Engineering spike §5: on the ship view a left click on a door or an airlock sends its command through the scene's
// shipCommand; a click elsewhere, or on a console map, sends nothing. The real runtime and scene in node, as
// shipHudScene.test.ts does.
import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { TILE_PX } from '../src/shared/resolution';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { seatDuelCrew } from './helpers/duelSeat';

const HOUND = parseShip(hound);
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
const LIVE = { banner: null, layerPaused: false, end: null };

describe('interior clicks (spec §5)', () => {
  it('a click on the Ops–Quarters door sends door, on the Hold airlock sends airlock, on the floor nothing; on the Helm map nothing', () => {
    const now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
    const rt = createDuelRuntime({ now: () => now, seed: 5, viewport: { w: 1280, h: 720 }, layout: HOUND, scheduler: { schedule() { return () => {}; } },
      sampleKeys: () => keys, samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {} });
    const stage = new Container(), store = createUiStore({ onlineAvailable: false } as never);
    const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
    let click: { x: number; y: number } | null = null;
    const shipCommand = vi.fn();
    const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store), takeClick: () => { const c = click; click = null; return c; }, shipCommand });
    try {
      rt.frame(1 / 60);
      expect(rt.view()).toBe('interior');
      expect(scene.interiorPlacement()).toBeNull();
      scene.draw(rt, 1 / 60, LIVE);
      const p = scene.interiorPlacement()!, der = rt.duel.interior.derived;
      const at = (tx: number, ty: number) => ({ x: p.x + (tx + 0.5) * TILE_PX * p.scale, y: p.y + (ty + 0.5) * TILE_PX * p.scale });
      click = at(12, 7); scene.draw(rt, 1 / 60, LIVE);
      click = at(0, 7); scene.draw(rt, 1 / 60, LIVE);
      click = at(14, 7); scene.draw(rt, 1 / 60, LIVE);
      expect(shipCommand.mock.calls.map((c) => c[0])).toEqual([
        { kind: 'shipDoor', edge: der.doorTileToEdge[7 * der.width + 12] }, { kind: 'shipAirlock', index: der.airlockOfTile[7 * der.width] }
      ]);
      seatDuelCrew(rt.duel); rt.frame(1 / 60);
      expect(rt.view()).not.toBe('interior');
      click = at(12, 7); scene.draw(rt, 1 / 60, LIVE);
      expect(shipCommand).toHaveBeenCalledTimes(2);
    } finally { scene.dispose(); rt.dispose(); }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engineeringScene.test.ts`
Expected: FAIL (`interiorPlacement` is not a function; `shipCommand` is never called).

- [ ] **Step 3: The scene** (`src/renderer/src/app/duel/scene.ts`)

After `import { createInteriorView, type InteriorView } from '../../render/duel/interiorView';` add:
```ts
import { shipCommandOf, shipControlAt, type ShipCommand } from '../../render/duel/shipControls';
import type { Placement } from '../../render/duel/interiorCamera';
```
In `DuelSceneOptions`, after the `takePings?` member, add:
```ts
  /** Engineering spike §5: where a ship-view click on a door or an airlock goes (the duel keyboard's console slot, so
   *  Single player queues it and the online duel sends it). Absent: interior clicks do nothing. */
  shipCommand?: (command: ShipCommand) => void;
```
Replace
```ts
      const click = options.takeClick?.() ?? null;   // drained every frame, so a click never waits for a later frame
```
with
```ts
      const click = options.takeClick?.() ?? null;   // drained every frame, so a click never waits for a later frame
      // Engineering spike §5: on the ship view a left click on a door or an airlock toggles it, for anyone, from anywhere.
      if (click && view === 'interior' && options.shipCommand) {
        const at = interior.placement(), c = at ? shipControlAt(d, at, click.x, click.y) : null;
        if (c) options.shipCommand(shipCommandOf(c));
      }
```
Replace
```ts
      if (view === 'interior') interior.draw(d, source.crewPrev, alpha, dt, events, frozen ? 0 : dt, { camera: source.interiorCamera, active: source.active() });   // Art-i spec section 7: the light and feel hold while paused
```
with
```ts
      if (view === 'interior') interior.draw(d, source.crewPrev, alpha, dt, events, frozen ? 0 : dt, { camera: source.interiorCamera, active: source.active() }, options.pointer?.() ?? null);   // Art-i spec section 7: the light and feel hold while paused; Engineering spike §6: the hover outline
```
In the returned object, before `    dispose(): void {`, add:
```ts
    /** Engineering spike §5: the interior's last placement (null before its first draw), for the staging hook and tests. */
    interiorPlacement(): Placement | null { return interior.placement(); },
```

- [ ] **Step 4: Single player's wiring** (`src/renderer/src/app/duel/duelMode.ts`)

Replace
```ts
    takeAim: () => pointer.takeAim(), requests, takePingAt });
```
with
```ts
    takeAim: () => pointer.takeAim(), requests, takePingAt, shipCommand: (c) => keyboard.ui.ship?.(c) });   // Engineering spike §5
```
(`keyboard` is declared below this line. The closure first runs on a later frame, as `pointer` already does in the lines above.)

Replace
```ts
  const stage = window as unknown as { __FTLITE_STAGE__?: boolean; __ftliteDuel?: unknown };
  if (stage.__FTLITE_STAGE__ === true) stage.__ftliteDuel = runtime;
```
with
```ts
  const stage = window as unknown as { __FTLITE_STAGE__?: boolean; __ftliteDuel?: unknown; __ftliteScene?: unknown };
  if (stage.__FTLITE_STAGE__ === true) { stage.__ftliteDuel = runtime; stage.__ftliteScene = scene; }   // Engineering spike §8: the smoke reads the interior placement
```
Replace
```ts
    if (stage.__ftliteDuel === runtime) delete stage.__ftliteDuel;
```
with
```ts
    if (stage.__ftliteDuel === runtime) delete stage.__ftliteDuel;
    if (stage.__ftliteScene === scene) delete stage.__ftliteScene;
```

- [ ] **Step 5: The online wiring** (`src/renderer/src/app/duel/onlineDuel.ts`)

Replace
```ts
        takePings: () => pingsIn.splice(0) });
```
with
```ts
        takePings: () => pingsIn.splice(0),
        shipCommand: (c) => { if (focused && !blocked) keyboard.ui.ship?.(c); } });   // Engineering spike §5: as the map click, only while focused
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/engineeringScene.test.ts tests/shipHudScene.test.ts tests/contactScene.test.ts tests/interiorZoomScene.test.ts tests/sceneUi.test.ts`
Expected: PASS.
Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/app/duel/scene.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/onlineDuel.ts tests/engineeringScene.test.ts
git commit -m "feat(engineering-spike): interior door and airlock clicks and hover in both modes; the staging hook exposes the scene" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The console power strips, the Helm's throttle cap, the Science range (spec §9.3, §10.2, §10.4)

> **Isolated, with Tasks 8 and 9.** Only Tasks 7 to 9 touch the consoles, the throttle cap, the weapons and the fog. They follow spec §10 (commit 4f675e69), which overrides §2 and §9 where they differ, and they don't anticipate anything beyond it.

**Files:**
- Modify: `src/renderer/src/render/duel/shipHudModel.ts` (the strip model), `src/renderer/src/render/duel/consoleModel.ts`, `src/renderer/src/render/duel/consoleLayout.ts`, `src/renderer/src/app/duel/input.ts` (`throttleRequest`'s cap), `src/renderer/src/app/duel/runtime.ts`, `src/renderer/src/app/duel/onlineDuel.ts`, `src/renderer/src/ui/duel/HelmStation.tsx`, `src/renderer/src/ui/duel/DuelUi.tsx`
- Create: `src/renderer/src/ui/duel/PowerStrip.tsx`
- Test: `tests/engineeringConsoleModel.test.ts`, `tests/engineeringConsoleUi.test.tsx`

**Interfaces:**
- Consumes (Part i, spec §10):
  - `throttleCap(sys: ShipSystems): number`, from `THROTTLE_CAP_BY_BARS = [0, 1, 2, 3, 4, 4]` (`sim/tactical/bars.ts`);
  - `sensorRange(sys: Pick<ShipSystems, 'rooms' | 'bars'>): number` (`sim/tactical/science.ts`, from `SENSOR_RANGE_BY_BARS = [300, 900, 1400, 2000, 2800]`);
  - `DuelSystem` (`sim/duel/power.ts`).
  - From Part ii: Task 1's `powerView`, `slotState` and `overdriveSlot`.
- Produces:
  - `ConsolePowerStrip { system; name; bars; capacity; slots; max; lost; heat; heatMax; failed; overdriven; spare; range? }` and `powerStrip(d, system)`;
  - `ConsoleView.power?: ConsolePowerStrip | null`, `HelmPanel.cap?: number`;
  - `POWER_STRIP`, `stripTop()`;
  - `throttleRequest(base, presses, to, cap = THROTTLE_MAX)`;
  - `PowerStrip({ strip })`, with attributes `data-ui-strip`, `data-ui-strip-slot`, `data-ui-strip-od`, `data-ui-strip-heat` and `data-ui-strip-range`.

- [ ] **Step 1: Pre-flight: Part i's §10 names exist**

Run each one. If any prints nothing, stop and report:
```bash
git grep -n "export function throttleCap" -- src/renderer/src/sim/tactical/bars.ts
git grep -n "THROTTLE_CAP_BY_BARS = \[0, 1, 2, 3, 4, 4\]" -- src/renderer/src/sim/tactical/bars.ts
git grep -n "export function sensorRange(sys" -- src/renderer/src/sim/tactical/science.ts
git grep -n "export function contactSeen" -- src/renderer/src/sim/tactical/science.ts
git grep -n "export function pointSeen" -- src/renderer/src/sim/tactical/science.ts
```

- [ ] **Step 2: Write the failing model test** `tests/engineeringConsoleModel.test.ts`

```ts
// Engineering spike §9.3, §10.2, §10.4: each console shows its own system's power strip (Helm → Engines, Weapons →
// Weapons, Science → Sensors with the range); the Helm carries the throttle cap (1 bar = 25 %); the app's throttle
// requests stop at the cap, and never reverse at 0 Engines bars.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { consoleModel } from '../src/renderer/src/render/duel/consoleModel';
import { powerStrip } from '../src/renderer/src/render/duel/shipHudModel';
import { NO_HELD_FLAGS, throttleRequest } from '../src/renderer/src/app/duel/input';
import { seatDuelCrew } from './helpers/duelSeat';

const HOUND = parseShip(hound);
const OVERLAY = { zoomText: 'ZOOM 1.00', scaleBar: { px: 90, units: 100 }, snapHint: false };
const steps = (up: number, down: number) => ({ throttleUp: up, throttleDown: down });

describe('powerStrip (spec §9.3, §10)', () => {
  it('Engines at round start (3 of 5, one spare); Sensors with its 900 range; damage shows as lost', () => {
    const d = createDuel(HOUND, 5), sys = d.tactical.systems[0];
    try {
      expect(powerStrip(d, 2)).toEqual({ system: 2, name: 'ENG', bars: 3, capacity: 5, slots: 5, max: 4, lost: 0, heat: 0, heatMax: 240, failed: false, overdriven: false, spare: 1 });
      expect(powerStrip(d, 3)).toMatchObject({ system: 3, name: 'SENS', bars: 1, range: 900 });
      expect(powerStrip(d, 1)).toMatchObject({ system: 1, name: 'WEAP', bars: 2, capacity: 10, slots: 10 });
      sys.rooms[Room.Engines] = 1;
      expect(powerStrip(d, 2)).toMatchObject({ capacity: 2, lost: 3 });   // knock ceil(5 / 2) = 3
    } finally { disposeDuel(d); }
  });
  it('consoleModel: the Helm shows the Engines strip and the cap 3 (75 %); Weapons its strip; standing shows none', () => {
    const d = createDuel(HOUND, 5);
    try {
      const at = (me: number) => consoleModel({ duel: d, me, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: OVERLAY })!;
      expect(at(0).power ?? null).toBeNull();   // both standing at the start: the ship view's HUD has the power
      seatDuelCrew(d);
      expect(at(0).station).toBe('helm'); expect(at(0).power?.system).toBe(2); expect(at(0).helm?.cap).toBe(3);
      expect(at(1).station).toBe('weapons'); expect(at(1).power?.system).toBe(1);
    } finally { disposeDuel(d); }
  });
});

describe('throttleRequest with a cap (spec §10.2)', () => {
  it('W and the notch clicks stop at the cap; without bars there is no reverse; the default cap is today\'s', () => {
    expect(throttleRequest(3, steps(1, 0), null, 3)).toBeNull();     // already at the cap
    expect(throttleRequest(2, steps(2, 0), null, 3)).toBe(3);
    expect(throttleRequest(0, steps(0, 0), 4, 3)).toBe(3);           // a 100 click at a cap of 3
    expect(throttleRequest(0, steps(0, 1), null, 0)).toBeNull();     // 0 Engines bars: no reverse
    expect(throttleRequest(1, steps(0, 3), null, 1)).toBe(-1);
    expect(throttleRequest(3, steps(1, 0), null)).toBe(4);           // no cap given: up to 4 as before
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/engineeringConsoleModel.test.ts`
Expected: FAIL (`powerStrip` is not exported; `cap` and `power` are undefined; the cap argument is ignored).

- [ ] **Step 4: The strip model** (append to `src/renderer/src/render/duel/shipHudModel.ts`)

First widen Task 1's two helpers so a strip passes too. Replace
```ts
export function slotState(c: PowerColumn, k: number): SlotState { return k < c.bars ? 'on' : k < c.capacity ? 'empty' : 'lost'; }
```
with
```ts
export function slotState(c: Pick<PowerColumn, 'bars' | 'capacity'>, k: number): SlotState { return k < c.bars ? 'on' : k < c.capacity ? 'empty' : 'lost'; }
```
and
```ts
export function overdriveSlot(c: PowerColumn, k: number): boolean { return c.slots > c.max && k === c.max; }
```
with
```ts
export function overdriveSlot(c: Pick<PowerColumn, 'slots' | 'max'>, k: number): boolean { return c.slots > c.max && k === c.max; }
```
Add `DuelSystem` to the `../../sim/duel/power` import, and add `import { sensorRange } from '../../sim/tactical/science';`. Then append:
```ts
/** Engineering spike §9.3: one console's own system power, read-only; the Sensors strip adds the sensor range (§10.4). */
export interface ConsolePowerStrip { system: number; name: string; bars: number; capacity: number; slots: number; max: number; lost: number; heat: number; heatMax: number; failed: boolean; overdriven: boolean; spare: number; range?: number }
/** The strip for `system`: its column's numbers, the slots lost (slots − capacity) and the reactor's spare bars. */
export function powerStrip(d: DuelState, system: number): ConsolePowerStrip {
  const v = powerView(d), c = v.systems[system]!;
  const strip: ConsolePowerStrip = { system, name: c.name, bars: c.bars, capacity: c.capacity, slots: c.slots, max: c.max, lost: c.slots - c.capacity, heat: c.heat, heatMax: c.heatMax, failed: c.failed, overdriven: c.overdriven, spare: v.spare };
  return system === DuelSystem.Sensors ? { ...strip, range: sensorRange(d.tactical.systems[CREW_SLOT]!) } : strip;
}
```

- [ ] **Step 5: The console model** (`src/renderer/src/render/duel/consoleModel.ts`)

After `import { laserOffline } from '../../sim/tactical/weapons';` add:
```ts
import { DuelSystem } from '../../sim/duel/power';
import { throttleCap } from '../../sim/tactical/bars';
import { powerStrip, type ConsolePowerStrip } from './shipHudModel';
```
In `HelmPanel`, after `flight?: boolean;` add:
```ts
  /** Engineering spike §10.2: the highest forward throttle level the Engines bars allow; notches above it draw locked. */
  cap?: number;
```
In `ConsoleView`, after `flight?: FlightPanel | null;` add:
```ts
  /** Engineering spike §9.3: this console's own system power (Helm → Engines, Weapons → Weapons, Science → Sensors);
   *  absent on the ship view and the Flight seat. */
  power?: ConsolePowerStrip | null;
```
In the `helm` object, replace `holdHeading: d.holdHeading, ...(station === 'flight' ? { flight: true } : {}) }` with
`holdHeading: d.holdHeading, cap: throttleCap(t.systems[0]!), ...(station === 'flight' ? { flight: true } : {}) }`.
Replace
```ts
  return { station, tabs, tabActions, helm, weapons, science, side, ...(flight ? { flight } : {}) };
```
with
```ts
  const own = station === 'helm' ? DuelSystem.Engines : station === 'weapons' ? DuelSystem.Weapons : station === 'science' ? DuelSystem.Sensors : -1;   // Engineering spike §9.3
  return { station, tabs, tabActions, helm, weapons, science, side, ...(flight ? { flight } : {}), ...(own >= 0 ? { power: powerStrip(d, own) } : {}) };
```

- [ ] **Step 6: The throttle cap in the app** (`src/renderer/src/app/duel/input.ts`, `runtime.ts`, `onlineDuel.ts`)

In `input.ts`, replace the whole `throttleRequest` function and its doc comment (from `/** The level a frame's throttle input asks for` to the function's closing `}`) with:
```ts
/** The level a frame's throttle input asks for (Artemis spec §5.4), or null for none. Each W press moves it one notch up
 *  and each S press one down from `base`; then a console notch click (`to`) wins. Every step is clamped to −1..`cap`
 *  (Engineering spike §10.2: the Engines bars' cap, default THROTTLE_MAX), and to 0..0 at a cap of 0 (no reverse without
 *  Engines). A request equal to `base` is null, since the sim would answer noop. */
export function throttleRequest(base: number, presses: Pick<Record<KeyAction, number>, 'throttleUp' | 'throttleDown'>, to: number | null | undefined, cap: number = THROTTLE_MAX): number | null {
  const steps = presses.throttleUp - presses.throttleDown, top = Math.min(THROTTLE_MAX, cap), floor = cap <= 0 ? 0 : -1;
  const fit = (v: number): number => Math.max(floor, Math.min(top, clampThrottle(v)));
  let level = base;
  for (let n = 0; n < Math.abs(steps); n++) level = fit(level + Math.sign(steps));
  if (to !== undefined && to !== null) level = fit(to);
  return level === base ? null : level;
}
```
In `src/renderer/src/app/duel/runtime.ts`, add `import { throttleCap } from '../../sim/tactical/bars';` after the runtime's other `../../sim/tactical/` imports. Then replace **both** occurrences of
```ts
throttleRequest(throttleBase(), p, k.throttleTo)
```
(the Flight branch and the Helm branch) with
```ts
throttleRequest(throttleBase(), p, k.throttleTo, throttleCap(d.tactical.systems[0]!))
```
In `src/renderer/src/app/duel/onlineDuel.ts`, add the same import, and replace
```ts
throttleRequest(throttleSent ? throttleSent.level : d.throttle, p, k.throttleTo)
```
with
```ts
throttleRequest(throttleSent ? throttleSent.level : d.throttle, p, k.throttleTo, throttleCap(d.tactical.systems[0]!))
```
Check: `git grep -n "throttleRequest(" -- src` must show no call without the cap besides the definition.

- [ ] **Step 7: Run the model test**

Run: `npx vitest run tests/engineeringConsoleModel.test.ts tests/duelConsoleModel.test.ts tests/scienceConsole.test.ts tests/crewSeats.test.ts tests/duelInput.test.ts`
Expected: PASS. A pre-existing test that compares a whole Helm, Weapons or Science `ConsoleView` with `toEqual` now also sees `power` and `helm.cap`. Add the new keys to its expected value, quoting `powerStrip(d, k)` and `throttleCap(...)`, and say so in the report. Do not weaken it to `toMatchObject`.

- [ ] **Step 8: Write the failing UI test** `tests/engineeringConsoleUi.test.tsx`

```tsx
// @vitest-environment jsdom
// Engineering spike §9.3, §10.2, §10.4: the console power strip in the CRT ramp, the Helm's notches above the cap
// locked, and the Science strip's sensor range.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import type { ConsolePowerStrip } from '../src/renderer/src/render/duel/shipHudModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { TEXT } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const all = (attr: string, v?: string) => Array.from(document.querySelectorAll<HTMLElement>(v === undefined ? `[${attr}]` : `[${attr}="${v}"]`));
const strip = (over: Partial<ConsolePowerStrip> = {}): ConsolePowerStrip => ({ system: 2, name: 'ENG', bars: 2, capacity: 2, slots: 5, max: 4, lost: 3, heat: 60, heatMax: 240, failed: false, overdriven: false, spare: 1, ...over });
const helm: ConsoleView = { station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  helm: { heading: 0, speed: 0, held: NO_HELD_FLAGS, throttle: 2, cap: 2 }, weapons: null, science: null, side: null, power: strip() };
const view = (console: ConsoleView): DuelUiView => ({ readout: { rows: [{ label: 'CREW', value: '2', labelTint: TEXT, valueTint: TEXT }], help: [] }, end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store), throttle = vi.fn();
  ui.actions.setConsole({ press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle, frequency: vi.fn() });
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { duel, throttle };
}

describe('the console power strip (spec §9.3)', () => {
  it('the Helm: ENG slots on and lost, the dashed overdrive slot, the heat, the spare; notches above the cap locked', () => {
    const { duel, throttle } = mount(); act(() => duel.frame(view(helm)));
    expect(all('data-ui-strip')).toHaveLength(1);
    expect(all('data-ui-strip-slot').map((e) => e.getAttribute('data-ui-strip-slot'))).toEqual(['on', 'on', 'lost', 'lost', 'lost']);
    expect(all('data-ui-strip-slot').findIndex((e) => e.hasAttribute('data-ui-strip-od'))).toBe(4);
    expect(all('data-ui-strip-heat')[0]!.getAttribute('data-ui-strip-heat')).toBe('60');
    expect(texts()).toContain('SPARE 1');
    expect(screen.getByTestId('console-throttle-100').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('console-throttle-75').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('console-throttle-50').getAttribute('aria-disabled')).toBeNull();
    fireEvent.pointerDown(screen.getByTestId('console-throttle-100'), { button: 0 });
    fireEvent.pointerDown(screen.getByTestId('console-throttle-25'), { button: 0 });
    expect(throttle.mock.calls).toEqual([[1]]);
  });
  it('at a cap of 0 even REV is locked', () => {
    const { duel } = mount(); act(() => duel.frame(view({ ...helm, helm: { ...helm.helm!, throttle: 0, cap: 0 } })));
    expect(screen.getByTestId('console-throttle-rev').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('console-throttle-stop').getAttribute('aria-disabled')).toBeNull();
  });
  it('the Science strip names the sensor range; the Weapons strip draws all ten slots', () => {
    const { duel } = mount();
    act(() => duel.frame(view({ ...helm, station: 'science', helm: null, science: { hover: null }, power: strip({ system: 3, name: 'SENS', bars: 1, capacity: 4, slots: 4, max: 3, lost: 0, range: 900 }) })));
    expect(all('data-ui-strip-range', '900')).toHaveLength(1);
    expect(texts()).toContain('RANGE 900');
    act(() => duel.frame(view({ ...helm, station: 'weapons', helm: null, power: strip({ system: 1, name: 'WEAP', bars: 2, capacity: 10, slots: 10, max: 9, lost: 0 }) })));
    expect(all('data-ui-strip-slot')).toHaveLength(10);
  });
});
```
The Science and Weapons frames carry no station block, so only the strip renders. That's enough for these assertions.

- [ ] **Step 9: Run it to verify it fails**

Run: `npx vitest run tests/engineeringConsoleUi.test.tsx`
Expected: FAIL (there is no strip, and the notches are not locked).

- [ ] **Step 10: The layout** (append to `src/renderer/src/render/duel/consoleLayout.ts`)

```ts
/** Engineering spike §9.3: the console's power strip, to the right of the station block at the bottom: a title line,
 *  the slots in a row (10 fit: the Weapons system's, spec §10.1) and the heat bar. */
export const POWER_STRIP = { x: STATION.x + STATION.w + EDGE, w: 236, h: 54, slotW: 18, slotH: 14, slotGap: 2 } as const;
export function stripTop(): number { return INTERNAL_H - EDGE - POWER_STRIP.h; }
```

- [ ] **Step 11: Write** `src/renderer/src/ui/duel/PowerStrip.tsx`

```tsx
// Engineering spike §9.3, §10.4: a console's own system power in the CRT ramp, beside its station block: the slots (on,
// empty, lost and crossed, the overdrive slot dashed), the heat bar, the reactor's spare bars, and on Science the sensor
// range. Read-only: power moves on the ship view, weapon bars on the Weapons block.
import { memo } from 'react';
import { POWER_STRIP, stripTop } from '../../render/duel/consoleLayout';
import { overdriveSlot, slotState, type ConsolePowerStrip } from '../../render/duel/shipHudModel';
import { ALERT_BLINK_HZ, blink, CRT } from '../../render/tactical/crtTheme';
import { FONT_NATIVE } from '../../render/theme';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

export const PowerStrip = memo(function PowerStrip({ strip }: { strip: ConsolePowerStrip }) {
  const { now } = useCrt(), S = POWER_STRIP, top = stripTop(), x0 = S.x + 8, heatW = strip.slots * (S.slotW + S.slotGap) - S.slotGap;
  const hot = strip.failed ? (blink(now, ALERT_BLINK_HZ) ? CRT.hot : CRT.dim) : strip.overdriven ? CRT.hot : CRT.main;
  return (
    <>
      <Panel x={S.x} y={top} w={S.w} h={S.h} />
      <Box x={S.x} y={top} w={S.w} h={1} attrs={{ 'data-ui-strip': String(strip.system), ...(strip.range !== undefined ? { 'data-ui-strip-range': String(strip.range) } : {}) }} style={{ pointerEvents: 'none' }} />
      <PixelText text={`${strip.name} POWER`} x={x0} y={top + 4} size={FONT_NATIVE} tint={strip.failed ? hot : CRT.mid} />
      <PixelText text={`SPARE ${strip.spare}`} x={S.x + S.w - 8} y={top + 4} size={FONT_NATIVE} tint={CRT.main} anchorX={1} />
      {Array.from({ length: strip.slots }, (_, k) => {
        const s = slotState(strip, k), od = overdriveSlot(strip, k);
        return (
          <Box key={k} x={x0 + k * (S.slotW + S.slotGap)} y={top + 22} w={S.slotW} h={S.slotH} attrs={{ 'data-ui-strip-slot': s, ...(od ? { 'data-ui-strip-od': '' } : {}) }}
            style={{ background: s === 'on' ? hex(od ? CRT.hot : CRT.main) : hex(CRT.glass), border: `1px ${od ? 'dashed' : 'solid'} ${hex(s === 'lost' ? CRT.faint : od ? CRT.hot : CRT.dim)}` }}>
            {s === 'lost' && <svg width="100%" height="100%" viewBox={`0 0 ${S.slotW} ${S.slotH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
              <path d={`M0 0L${S.slotW} ${S.slotH}M${S.slotW} 0L0 ${S.slotH}`} stroke={hex(CRT.dim)} strokeWidth={1} /></svg>}
          </Box>
        );
      })}
      <Box x={x0} y={top + 40} w={heatW} h={4} attrs={{ 'data-ui-strip-heat': String(strip.heat) }} style={{ background: hex(CRT.faint) }}>
        <div style={{ width: `${Math.round((100 * Math.max(0, Math.min(strip.heat, strip.heatMax))) / strip.heatMax)}%`, height: '100%', background: hex(hot) }} />
      </Box>
      {strip.range !== undefined && <PixelText text={`RANGE ${strip.range}`} x={S.x + S.w - 8} y={top + 22} size={FONT_NATIVE} tint={CRT.main} anchorX={1} />}
    </>
  );
});
```
The Sensors strip has 4 slots (80 px), so `RANGE …` at the right end clears them. The Weapons strip has 10 slots (198 px), and the Weapons strip never carries a range.

- [ ] **Step 12: Lock the notches and draw the strip** (`HelmStation.tsx`, `DuelUi.tsx`)

In `src/renderer/src/ui/duel/HelmStation.tsx`, replace
```ts
  const hold = helm.holdHeading ?? -1, holdDeg = hold >= 0 ? ((Math.round((hold / 256) * 360) % 360) + 360) % 360 : -1;
```
with
```ts
  const hold = helm.holdHeading ?? -1, holdDeg = hold >= 0 ? ((Math.round((hold / 256) * 360) % 360) + 360) % 360 : -1;
  // Engineering spike §10.2: notches above the Engines bars' cap are locked, and so is REV with no Engines bar.
  const cap = helm.cap ?? 4, locked = (level: number): boolean => level > cap || (level < 0 && cap <= 0);
```
Replace
```ts
        if (n !== 0) { wheel.current -= n * THROTTLE_WHEEL_PX; actions.console.throttle(Math.max(-1, Math.min(4, set - n))); }
```
with
```ts
        if (n !== 0) { wheel.current -= n * THROTTLE_WHEEL_PX; actions.console.throttle(Math.max(cap <= 0 ? 0 : -1, Math.min(cap, set - n))); }
```
Replace
```tsx
            <Button name={`throttle-${n.name}`} label={n.label} x={x0} y={y} w={52} h={22} lit={n.level === set} flash={n.level === set && flash('throttle')} onPress={() => actions.console.throttle(n.level)} />
```
with
```tsx
            <Button name={`throttle-${n.name}`} label={n.label} x={x0} y={y} w={52} h={22} lit={n.level === set} disabled={locked(n.level)} flash={n.level === set && flash('throttle')} onPress={() => actions.console.throttle(n.level)} />
```
In `src/renderer/src/ui/duel/DuelUi.tsx`, add `import { PowerStrip } from './PowerStrip';` after `import { SitCard } from './SitCard';`, and replace
```tsx
          {duel.console?.science && <ScienceStation science={duel.console.science} />}
```
with
```tsx
          {duel.console?.science && <ScienceStation science={duel.console.science} />}
          {duel.console?.power && <PowerStrip strip={duel.console.power} />}   {/* Engineering spike §9.3 */}
```

- [ ] **Step 13: Run the tests**

Run: `npx vitest run tests/engineeringConsoleUi.test.tsx tests/engineeringConsoleModel.test.ts tests/uiConsole.test.tsx tests/feelUi.test.tsx tests/feelIiUi.test.tsx tests/scienceUi.test.tsx`
Expected: PASS.
Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 14: Commit**

```bash
git add src/renderer/src/render/duel/shipHudModel.ts src/renderer/src/render/duel/consoleModel.ts src/renderer/src/render/duel/consoleLayout.ts src/renderer/src/app/duel/input.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/ui/duel/HelmStation.tsx src/renderer/src/ui/duel/DuelUi.tsx src/renderer/src/ui/duel/PowerStrip.tsx tests/engineeringConsoleModel.test.ts tests/engineeringConsoleUi.test.tsx
git commit -m "feat(engineering-spike): each console's power strip, the Helm's throttle cap (1 bar = 25 %), the Science range" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Stage by name any pre-existing test you had to update in Step 7 too.)

---

### Task 8: The Weapons console: pew pew, beam and torpedo, their bars, and pew pew in the targeting flow (spec §10.3)

**Files:**
- Modify: `src/renderer/src/render/duel/consoleModel.ts` (`WeaponsPanel`, the card reason), `src/renderer/src/render/duel/situationModel.ts` (offline only when no weapon can fire), `src/renderer/src/ui/duel/DuelUi.tsx` (FlightStation's aim narrowed), `src/renderer/src/render/duel/consoleLayout.ts` (`weaponCard`), `src/renderer/src/render/duel/contactModel.ts` (the weapon type), `src/renderer/src/render/duel/shipControls.ts` (`ShipCommand` gains `weaponPower`), `src/renderer/src/app/duel/input.ts` (`pewLock`, `weaponPower`), `src/renderer/src/app/duel/contactController.ts` (`Weapon` gains `'pew'`), `src/renderer/src/ui/actions.ts`, `src/renderer/src/app/duel/runtime.ts`, `src/renderer/src/app/duel/onlineDuel.ts`, `src/renderer/src/ui/duel/TargetingLine.tsx`
- Rewrite: `src/renderer/src/ui/duel/WeaponsStation.tsx`
- Test: `tests/engineeringWeapons.test.ts`, `tests/engineeringWeaponsUi.test.tsx`

**Interfaces:**
- Consumes (Part i, spec §10.3; contract needs 3 and 4):
  - `ShipSystems.weaponPower: number[]`, three long in `WeaponSlot` order (`{ Pew: 0, Beam: 1, Torpedo: 2 }`), each 0..4 bars (4 = the overdrive bar on that weapon), starting `[1, 0, 1]`;
  - `trimmedWeaponPower(sys): number[]` and `weaponBarsUsable(sys): number` (`sim/tactical/bars.ts`): the bars each weapon stands on now, and the Weapons bars the officer can spend;
  - `ShipSystems.pewCharge`, `pewLock` and `pewTargeted` (pew pew's state, Part i Task 9b);
  - `barrelShots(state, i, barrel: 'beam' | 'pew')` (`sim/tactical/weapons.ts`): pew pew 0/2/3/3/3, the beam 0/1/2/2/2 by its bars;
  - the commands `{ kind: 'weaponPower'; slot: number; delta: number }` and `laserLock`/`laserCharge` with `weapon?: 'beam' | 'pew'`.
  - From Part ii: Task 2's keyboard queue.
- Produces:
  - `CardWeapon = 'pew' | 'laser' | 'torpedo'` (`'laser'` stays the beam's name in the view code, so the Valkyrn's Flight cards keep theirs) and `CARD_ORDER`;
  - `weaponCard(weapon: CardWeapon)` with `pipsY`;
  - `WeaponsPanel.pew?: { fill: number; ready: boolean; target: number; shots: number }`, `WeaponsPanel.weaponBars?: number[]` and `WeaponsPanel.weaponFree?: number`;
  - `ConsoleInput.pewLock?(room)`, `ConsoleInput.weaponPower?(slot, delta)` and `KeySample.pewTo`;
  - `actions.console.pewLock(room)` and `actions.console.weaponPower(slot, delta)`;
  - the test ids `console-card-pew`, `console-weapon-pips-<slot>` and the attribute `data-ui-weapon-pip`.

- [ ] **Step 1: Pre-flight: Part i's §10.3 names exist**

Run each one. If any prints nothing, stop and report:
```bash
git grep -n "pewCharge" -- src/renderer/src/sim/tactical/state.ts
git grep -n "pewTargeted" -- src/renderer/src/sim/tactical/state.ts
git grep -n "export function barrelShots" -- src/renderer/src/sim/tactical/weapons.ts
git grep -n "export function trimmedWeaponPower" -- src/renderer/src/sim/tactical/bars.ts
git grep -n "export function weaponBarsUsable" -- src/renderer/src/sim/tactical/bars.ts
git grep -n "kind: 'weaponPower'; slot: number; delta: number" -- src/renderer/src/net/contracts.ts
git grep -n "weapon?: 'beam' | 'pew'" -- src/renderer/src/net/contracts.ts
```

- [ ] **Step 2: Write the failing model test** `tests/engineeringWeapons.test.ts`

```ts
// Engineering spike §10.3: the Weapons panel carries the three weapons' bars and the free Weapons bars, pew pew's charge,
// target and volley, the beam's shots by its bars; the keyboard queues weaponPower and pew pew's lock; the contact
// controller picks pew pew up and drops it on a room as a pew lock.
import { describe, expect, it, vi } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { consoleModel } from '../src/renderer/src/render/duel/consoleModel';
import { CARD_ORDER, STATION, weaponCard } from '../src/renderer/src/render/duel/consoleLayout';
import { createDuelKeyboard, NO_HELD_FLAGS, type EventSource } from '../src/renderer/src/app/duel/input';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { seatDuelCrew } from './helpers/duelSeat';

const HOUND = parseShip(hound);
const OVERLAY = { zoomText: 'ZOOM 1.00', scaleBar: { px: 90, units: 100 }, snapHint: false };
const quiet: EventSource = { addEventListener() {}, removeEventListener() {} };

describe('the Weapons panel (spec §10.3)', () => {
  it('round start: pew pew 1, beam 0, torpedo 1, no free bar; the beam fires 0 shots, pew pew a 2-shot volley', () => {
    const d = createDuel(HOUND, 5);
    try {
      seatDuelCrew(d);
      const w = consoleModel({ duel: d, me: 1, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: OVERLAY })!.weapons!;
      expect(w.weaponBars).toEqual([1, 0, 1]);
      expect(w.weaponFree).toBe(0);
      expect(w.burst).toBe(0);
      expect(w.pew).toMatchObject({ shots: 2, target: Room.Shields, ready: true });   // Part i Decision 17: pew pew starts full, targeted on Shields
      const sys = d.tactical.systems[0];
      sys.bars[1] = 4; sys.weaponPower[1] = 2;   // two more Weapons bars, both on the beam
      const w2 = consoleModel({ duel: d, me: 1, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: OVERLAY })!.weapons!;
      expect(w2.weaponBars).toEqual([1, 2, 1]); expect(w2.weaponFree).toBe(0); expect(w2.burst).toBe(2);
    } finally { disposeDuel(d); }
  });
  it('three cards side by side in slot order, inside the block', () => {
    expect(CARD_ORDER).toEqual(['pew', 'laser', 'torpedo']);
    const [p, l, t] = CARD_ORDER.map((c) => weaponCard(c));
    expect(l!.x).toBeGreaterThan(p!.x + p!.w); expect(t!.x).toBeGreaterThan(l!.x + l!.w);
    expect(t!.x + t!.w).toBeLessThanOrEqual(STATION.x + STATION.w - 8);
    expect(p!.pipsY).toBe(p!.y + p!.hitH + 2);
  });
});

describe('the weapon inputs (spec §10.3)', () => {
  it('weaponPower and the pew lock ride the keyboard: weaponPower in the ship queue, pewTo as a lock request', () => {
    const kb = createDuelKeyboard(quiet);
    kb.ui.weaponPower?.(1, 1); kb.ui.weaponPower?.(2, -1); kb.ui.pewLock?.(2);
    const s = kb.sample();
    expect(s.ship).toEqual([{ kind: 'weaponPower', slot: 1, delta: 1 }, { kind: 'weaponPower', slot: 2, delta: -1 }]);
    expect(s.pewTo).toBe(2);
    expect(kb.sample().pewTo ?? null).toBeNull();
    kb.destroy();
  });
  it('the contact controller picks pew pew up and drops it on a room as pew\'s lock', () => {
    const c = createContactController(), lock = vi.fn();
    c.sync({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, enemyKnown: 2 });
    c.pickUp('pew');
    expect(c.aimWeapon()).toBe('pew');
    c.pick(2, lock);
    expect(lock).toHaveBeenCalledWith(2, 'pew');
    expect(c.aimWeapon()).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/engineeringWeapons.test.ts`
Expected: FAIL (`CARD_ORDER` is not exported; `weaponBars`, `pew`, `weaponPower` and `pewLock` are undefined; `pickUp('pew')` is a type error under vitest's esbuild, so it runs but `aimWeapon` is still asserted).

- [ ] **Step 4: The panel and the cards** (`consoleModel.ts`, `consoleLayout.ts`)

In `src/renderer/src/render/duel/consoleModel.ts`, extend the `WeaponsPanel` interface. Replace
```ts
  laserTarget: number; torpTarget: number; burst: number; laserReason?: string | null; goal?: boolean; refused?: RefusedView | null }
```
with
```ts
  laserTarget: number; torpTarget: number; burst: number; laserReason?: string | null; goal?: boolean; refused?: RefusedView | null;
  /** Engineering spike §10.3: pew pew's charge 0..1, full, target room (−1 none) and volley (0, 2 or 3); the bars on each
   *  weapon (pew pew, beam, torpedo; 0..4) and the Weapons bars not yet spent. Optional, so a hand-built panel may leave
   *  them out (the probe's fixture). */
  pew?: { fill: number; ready: boolean; target: number; shots: number }; weaponBars?: number[]; weaponFree?: number }
```
Replace `import { laserOffline } from '../../sim/tactical/weapons';` with `import { barrelShots, laserOffline } from '../../sim/tactical/weapons';`, and change Task 7's `import { throttleCap } from '../../sim/tactical/bars';` to `import { throttleCap, trimmedWeaponPower, weaponBarsUsable } from '../../sim/tactical/bars';`. In `weaponsPanel`, replace
```ts
      laserTarget: sys.laserTargeted ? sys.lock : -1, torpTarget: sys.torpLock, burst: classOf(t, 0).slots.laser?.shots ?? 0,   // Valkyrn-i: Part ii gives the gun its own card
```
with
```ts
      laserTarget: sys.laserTargeted ? sys.lock : -1, torpTarget: sys.torpLock, burst: barrelShots(t, 0, 'beam'),   // Engineering spike §10.3: the beam's shots by its bars
      pew: (() => { const units = classOf(t, 0).slots.laser?.chargeUnits ?? 0; return { fill: units > 0 ? Math.min(1, sys.pewCharge / units) : 0, ready: units > 0 && sys.pewCharge >= units, target: sys.pewTargeted ? sys.pewLock : -1, shots: barrelShots(t, 0, 'pew') }; })(),
      ...(() => { const w = trimmedWeaponPower(sys); return { weaponBars: w, weaponFree: weaponBarsUsable(sys) - (w[0]! + w[1]! + w[2]!) }; })(),   // the bars each weapon stands on now
```
In `src/renderer/src/render/duel/consoleLayout.ts`, replace the whole `weaponCard` function and its doc comment with:
```ts
/** FTL targeting spec §1, Engineering spike §10.3: the Weapons block's three weapon cards, PEW PEW, BEAM ('laser') and
 *  TORPEDO, side by side at its top. `hit` is the card's clickable part (the pick-up); `pipsY` the bar pips under it (left
 *  click adds a bar, right click removes one); the FIRE / LAUNCH button sits below them; the targeting line starts at
 *  `anchor` (the card's right edge mid-height of `hit`). */
export type CardWeapon = 'pew' | 'laser' | 'torpedo';
export const CARD_ORDER: readonly CardWeapon[] = ['pew', 'laser', 'torpedo'];
export function weaponCard(weapon: CardWeapon): { x: number; y: number; w: number; h: number; hitH: number; pipsY: number; anchor: { x: number; y: number } } {
  const x0 = STATION.x + 8, y = stationTop('weapons') + 6, w = 90, h = 104, hitH = 60, x = x0 + CARD_ORDER.indexOf(weapon) * (w + 6);
  return { x, y, w, h, hitH, pipsY: y + hitH + 2, anchor: { x: x + w, y: y + hitH / 2 } };
}
```

- [ ] **Step 5: The inputs** (`shipControls.ts`, `input.ts`, `contactController.ts`, `actions.ts`, `runtime.ts`, `onlineDuel.ts`)

In `src/renderer/src/render/duel/shipControls.ts`, replace
```ts
/** The ship view's commands (Part i's shipPower, shipCoolant, shipDoor and shipAirlock; Task 8 adds weaponPower). */
export type ShipCommand = Extract<DuelCommand, { kind: 'shipPower' | 'shipCoolant' | 'shipDoor' | 'shipAirlock' }>;
```
with
```ts
/** The ship view's commands (Part i's shipPower, shipCoolant, shipDoor and shipAirlock) and the Weapons block's
 *  weaponPower (spec §10.3), which ride the same keyboard queue; the sim refuses weaponPower off the Weapons seat. */
export type ShipCommand = Extract<DuelCommand, { kind: 'shipPower' | 'shipCoolant' | 'shipDoor' | 'shipAirlock' | 'weaponPower' }>;
```
In `src/renderer/src/app/duel/input.ts`:
- In `ConsoleInput`, after the `ship?(command: ShipCommand): void` member, add:
```ts
  /** Engineering spike §10.3: pew pew's target room (−1 clears it), and a bar on or off a weapon slot. Optional, as ship. */
  pewLock?(room: number): void;
  weaponPower?(slot: number, delta: 1 | -1): void;
```
- In `KeySample`, after the `ship?` member, add:
```ts
  /** Engineering spike §10.3: the last pew pew lock request since the previous sample (a room, −1 to clear), or null. */
  pewTo?: number | null;
```
- In `createDuelKeyboard`, replace `  let ship: ShipCommand[] = [];   // Engineering spike §7: kept by clearUi, dropped by clear` with:
```ts
  let ship: ShipCommand[] = [];   // Engineering spike §7: kept by clearUi, dropped by clear
  let pewTo: number | null = null;   // §10.3
```
- Append `pewTo = null;` inside both `clearUi`'s and `clear`'s bodies, right after `freqTo = null;`.
- In `consoleInput`, replace `    ship(command) { ship.push(command); if (ship.length > SHIP_QUEUE_MAX) ship.shift(); }` with:
```ts
    ship(command) { ship.push(command); if (ship.length > SHIP_QUEUE_MAX) ship.shift(); },
    pewLock(room) { pewTo = room; },
    weaponPower(slot, delta) { ship.push({ kind: 'weaponPower', slot, delta }); if (ship.length > SHIP_QUEUE_MAX) ship.shift(); }
```
- In `sample()`, replace `throttleTo, freqTo, ...(ship.length > 0 ? { ship } : {}) };` with `throttleTo, freqTo, pewTo, ...(ship.length > 0 ? { ship } : {}) };`, and replace `freqTo = null; ship = [];` with `freqTo = null; pewTo = null; ship = [];`.

In `src/renderer/src/app/duel/contactController.ts`, replace
```ts
/** The weapon a Weapons card picks up (FTL targeting spec §1). */
export type Weapon = 'laser' | 'torpedo';
```
with
```ts
/** The weapon a Weapons card picks up (FTL targeting spec §1; Engineering spike §10.3 adds pew pew; 'laser' is the beam). */
export type Weapon = 'pew' | 'laser' | 'torpedo';
```
(`pickUp`, `pick` and `aimWeapon` already carry the weapon through. The E/Q branch treats any non-torpedo pick-up as the beam's, which drops pew pew's pick-up too. `WEAPON_CODES` keeps 1 for the beam and 2 for the torpedo: pew pew has no key in the spike, Decision 14.)

In `src/renderer/src/ui/actions.ts`:
- After `    ship: (command) => consoleInput?.ship?.(command)` add (with a comma after it):
```ts
    pewLock: (room) => consoleInput?.pewLock?.(room),
    weaponPower: (slot, delta) => consoleInput?.weaponPower?.(slot, delta)
```
- Replace
```ts
    pick: (room: number): void => contactInput?.pick(room, (r, weapon) => (weapon === 'torpedo' ? consoleActions.torpLock(r) : consoleActions.lock(r))),
```
with
```ts
    pick: (room: number): void => contactInput?.pick(room, (r, weapon) => (weapon === 'torpedo' ? consoleActions.torpLock(r) : weapon === 'pew' ? consoleActions.pewLock?.(r) : consoleActions.lock(r))),
```
- Replace `    pickUp: (weapon: 'laser' | 'torpedo'): void => contactInput?.pickUp(weapon)` with `    pickUp: (weapon: 'pew' | 'laser' | 'torpedo'): void => contactInput?.pickUp(weapon)`.

In `src/renderer/src/app/duel/runtime.ts`, replace
```ts
    if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= -1 && k.lockTo <= 2) queue({ kind: 'laserLock', room: k.lockTo });   // a room click or a card's clear
```
with
```ts
    if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= -1 && k.lockTo <= 2) queue({ kind: 'laserLock', room: k.lockTo });   // a room click or a card's clear
    if (k.pewTo !== undefined && k.pewTo !== null && k.pewTo >= -1 && k.pewTo <= 2) queue({ kind: 'laserLock', room: k.pewTo, weapon: 'pew' });   // Engineering spike §10.3
```
In `src/renderer/src/app/duel/onlineDuel.ts`, replace
```ts
    if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= -1 && k.lockTo <= 2) send({ kind: 'laserLock', room: k.lockTo });   // a room click or a card's clear
```
with
```ts
    if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= -1 && k.lockTo <= 2) send({ kind: 'laserLock', room: k.lockTo });   // a room click or a card's clear
    if (k.pewTo !== undefined && k.pewTo !== null && k.pewTo >= -1 && k.pewTo <= 2) send({ kind: 'laserLock', room: k.pewTo, weapon: 'pew' });   // Engineering spike §10.3
```
Pew pew's lock joins the Weapons seat's other console commands: in `runtime.ts`, `isWeaponsCommand` already lists `laserLock`, so a Tab or a stand drops a pending pew lock as it drops the beam's.

Widen the weapon types the targeting view reads:
- In `src/renderer/src/render/duel/contactModel.ts`, replace `  aimWeapon: 'laser' | 'torpedo' | null;` with `  aimWeapon: 'pew' | 'laser' | 'torpedo' | null;`, and `  weapon?: 'laser' | 'torpedo';` with `  weapon?: 'pew' | 'laser' | 'torpedo';`.
- In `src/renderer/src/ui/duel/TargetingLine.tsx`, nothing changes. It calls `weaponCard(weapon)`, which now takes all three.

- [ ] **Step 5b: WEAPONS OFFLINE only when no weapon can fire** (`src/renderer/src/render/duel/situationModel.ts`, `consoleModel.ts`)

The beam starts dark (spec §10.3), and today's `laserSituation` (`situationModel.ts:46`) and `refusal` (`:187`) read the beam alone, so the console would say WEAPONS OFFLINE all round.

`laserOffline` and `laserFull` are already imported (Part i gave them a `barrel` argument). Add `import { trimmedWeaponPower, WeaponSlot } from '../../sim/tactical/bars';`, then add above `laserSituation`:
```ts
/** Engineering spike §10.3: every crew weapon is dark (the beam, pew pew and the torpedo). Bars only, one source of truth:
 *  a level-2 Weapons Room zeroes every weapon's trimmed bars (Part i's trimmedWeaponPower reads effectiveBars). */
export function weaponsOffline(t: TacticalState): boolean {
  const sys = t.systems[CREW_SLOT];
  return laserOffline(t, CREW_SLOT, 'beam') && laserOffline(t, CREW_SLOT, 'pew') && trimmedWeaponPower(sys)[WeaponSlot.Torpedo] === 0;
}
```
In `laserSituation`, replace
```ts
  if (laserOffline(t, CREW_SLOT)) return { kind: 'offline' };
  const targeted = sys.laserTargeted;
  if (sys.laserBurst > 0 || sinceShot < SOLUTION_HOLD_S) return { kind: 'solution', targeted };   // the burst fires attended or not
```
with
```ts
  // Engineering spike §10.3: the words follow the beam, or pew pew while the beam is dark; with both lasers dark, the
  // torpedo alone says nothing here (its own card speaks), and only with every weapon dark is it OFFLINE.
  if (laserOffline(t, CREW_SLOT, 'beam') && laserOffline(t, CREW_SLOT, 'pew')) return weaponsOffline(t) ? { kind: 'offline' } : { kind: 'none' };
  const barrel = laserOffline(t, CREW_SLOT, 'beam') ? 'pew' as const : 'beam' as const;
  const targeted = barrel === 'pew' ? sys.pewTargeted : sys.laserTargeted;
  if ((barrel === 'pew' ? sys.pewBurst : sys.laserBurst) > 0 || sinceShot < SOLUTION_HOLD_S) return { kind: 'solution', targeted };   // the burst fires attended or not
```
and in the same function replace
```ts
  if (laserFull(t, CREW_SLOT) && laserEligible(t, CREW_SLOT, target)) return { kind: 'solution', targeted };
```
with
```ts
  if (laserFull(t, CREW_SLOT, barrel) && laserEligible(t, CREW_SLOT, target)) return { kind: 'solution', targeted };
```
In `refusal`, replace
```ts
    if (control === 'fire') return laserOffline(t, CREW_SLOT) ? 'WEAPONS OFFLINE' : null;
    if (sys.magazine <= 0) return 'NO TORPEDOES';
    if (sys.rooms[Room.Weapons] >= 2) return 'WEAPONS OFFLINE';
```
with
```ts
    if (control === 'fire') return !laserOffline(t, CREW_SLOT, 'beam') ? null : weaponsOffline(t) ? 'WEAPONS OFFLINE' : 'BEAM UNPOWERED';   // Space fires the beam (spec §10.3)
    if (sys.magazine <= 0) return 'NO TORPEDOES';
    if (trimmedWeaponPower(sys)[WeaponSlot.Torpedo] === 0) return weaponsOffline(t) ? 'WEAPONS OFFLINE' : 'TORPEDO UNPOWERED';   // a level-2 Weapons Room lands here too
```
The LAUNCH checks are now flying, the magazine, the torpedo's trimmed bars, then range. Check that Part i's `canLaunch` reads exactly these (`git grep -n "export function canLaunch" -A4 -- src/renderer/src/sim/tactical/weapons.ts`), so `refusal(d, 'launch') === null` exactly when `canLaunch` is true. If it reads anything else, stop and report.

Update `tests/feelIiModels.test.ts` (it pins the old reasons on the Cutter, whose crew starts pew pew 1, beam 0, torpedo 1):
- Line 213: the round-start FIRE refusal is now BEAM UNPOWERED. Replace
```ts
      expect([refusal(d, 'fire'), refusal(d, 'launch')]).toEqual([null, 'OUT OF RANGE']);
```
with
```ts
      expect([refusal(d, 'fire'), refusal(d, 'launch')]).toEqual(['BEAM UNPOWERED', 'OUT OF RANGE']);   // Engineering spike §10.3: the beam starts dark
```
- Line 218: the offline case by bars. FIRE is `weaponsOffline` (every weapon dark) → WEAPONS OFFLINE, and LAUNCH passes the magazine (2) and reaches the torpedo's 0 bars → WEAPONS OFFLINE. Replace
```ts
      sys.rooms[Room.Weapons] = 2; expect([refusal(d, 'fire'), refusal(d, 'launch')]).toEqual(['WEAPONS OFFLINE', 'WEAPONS OFFLINE']); sys.rooms[Room.Weapons] = 0;
```
with
```ts
      sys.weaponPower.fill(0); expect([refusal(d, 'fire'), refusal(d, 'launch')]).toEqual(['WEAPONS OFFLINE', 'WEAPONS OFFLINE']); sys.weaponPower.splice(0, 3, 1, 0, 1);   // Engineering spike §10.3: every weapon dark
```
- Lines 233-237 (LAUNCH refused exactly when canLaunch says no) stay as they are. The loop's `sys.rooms[Room.Weapons] = (k >> 2) % 3` still covers level 2: it zeroes the torpedo's trimmed bars, which both `canLaunch` and `refusal` read. The FIRE line holds because the round-start FIRE reason is BEAM UNPOWERED, never TORPEDO FLYING, when no torpedo flies.

In `consoleModel.ts`'s `weaponsPanel`, replace `laserCardReason(laserSituation(t, i.sinceShot ?? Infinity, gunnerPresent(d)), laserOffline(t, 0))` with `laserCardReason(laserSituation(t, i.sinceShot ?? Infinity, gunnerPresent(d)), weaponsOffline(t))`, and add `weaponsOffline` to its `./situationModel` import.

Append to `tests/engineeringWeapons.test.ts`:
```ts
import { laserSituation, refusal, weaponsOffline } from '../src/renderer/src/render/duel/situationModel';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { lineOfSight } from '../src/renderer/src/sim/tactical/geometry';
import { buildGrid } from '../src/renderer/src/sim/tactical/grid';

describe('WEAPONS OFFLINE only when no weapon can fire (spec §10.3)', () => {
  it('round start (pew pew 1, beam 0, torpedo 1): not offline; FIRE says BEAM UNPOWERED; every weapon dark: WEAPONS OFFLINE', () => {
    const d = createDuel(HOUND, 5), t = d.tactical, sys = t.systems[0], me = t.ships[0]!, e = t.ships[1]!;
    try {
      seatDuelCrew(d);
      t.map = { ...t.map, asteroids: [] }; t.grid = buildGrid([], t.map.rMap);   // no rocks: the line is clear by construction (nothing steps)
      e.x = me.x + hx(me.heading) * 200; e.y = me.y + hy(me.heading) * 200; e.active = true;   // dead ahead, in range and arc
      expect(lineOfSight(t, me.x, me.y, e.x, e.y)).toBe(true);   // the precondition
      expect(weaponsOffline(t)).toBe(false);
      expect(laserSituation(t).kind).not.toBe('offline');
      expect(refusal(d, 'fire')).toBe('BEAM UNPOWERED');
      sys.weaponPower[0] = 0;
      expect(laserSituation(t).kind).toBe('none');   // both lasers dark, the torpedo still powered
      expect(refusal(d, 'fire')).toBe('BEAM UNPOWERED');
      sys.weaponPower[2] = 0;
      expect(weaponsOffline(t)).toBe(true);
      expect(laserSituation(t).kind).toBe('offline');
      expect(refusal(d, 'fire')).toBe('WEAPONS OFFLINE');
      expect(refusal(d, 'launch')).toBe('WEAPONS OFFLINE');
    } finally { disposeDuel(d); }
  });
});
```
- [ ] **Step 6: Run the model test**

Run: `npx vitest run tests/engineeringWeapons.test.ts tests/engineeringInput.test.ts tests/duelConsoleModel.test.ts tests/contactController.test.ts tests/duelRuntime.test.ts tests/feelPresentation.test.ts tests/feelIiModels.test.ts`
Expected: PASS. A pre-existing test that pins the old two cards' x positions or the 138 px width (`git grep -n "weaponCard(" -- tests`) is updated to the three-card layout from `weaponCard`, not to literals. Say which tests in the report.

- [ ] **Step 7: Write the failing UI test** `tests/engineeringWeaponsUi.test.tsx`

```tsx
// @vitest-environment jsdom
// Engineering spike §10.3: the Weapons block's three cards, PEW PEW (its own charge bar, no FIRE: it fires itself on a
// target), BEAM and TORPEDO; each with four bar pips (the fourth the overdrive's, dashed), a left click adding a bar and
// a right click removing one (weaponPower); a click on PEW PEW picks it up for the targeting flow.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView, WeaponsPanel } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { TEXT } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const all = (attr: string) => Array.from(document.querySelectorAll<HTMLElement>(`[${attr}]`)).map((e) => e.getAttribute(attr));
const panel: WeaponsPanel = { lock: 1, charge: { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: TEXT } }, magazine: '4/4', canLaunch: true, torpedoInRange: true, missileFlying: false,
  fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null, laserTarget: -1, torpTarget: -1, burst: 0,
  pew: { fill: 0.5, ready: false, target: 2, shots: 2 }, weaponBars: [1, 0, 4], weaponFree: 1 };
const weapons: ConsoleView = { station: 'weapons', tabs: { helm: 'locked', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  helm: null, weapons: panel, science: null, side: null };
const view = (): DuelUiView => ({ readout: { rows: [{ label: 'CREW', value: '2', labelTint: TEXT, valueTint: TEXT }], help: [] }, end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console: weapons });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store), weaponPower = vi.fn(), pickUp = vi.fn();
  ui.actions.setConsole({ press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn(), weaponPower });
  ui.actions.setContact({ close: vi.fn(), arm: vi.fn(), cancelAim: vi.fn(), pick: vi.fn(), scan: vi.fn(), pickUp });
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { duel, weaponPower, pickUp };
}

describe('the three weapons (spec §10.3)', () => {
  it('PEW PEW, BEAM and TORPEDO with their words, pew pew\'s volley and target, and the pips by bars', () => {
    const { duel } = mount(); act(() => duel.frame(view()));
    for (const w of ['PEW PEW', 'BEAM', 'TORPEDO', 'x2', 'x0', 'TGT ENG', 'MAG 4/4', '50%']) expect(texts()).toContain(w);
    expect(screen.queryByTestId('console-fire')).not.toBeNull();   // the beam's FIRE
    expect(screen.getByTestId('console-card-pew')).not.toBeNull();
    expect(all('data-ui-weapon-pip')).toEqual([
      '0:0:on', '0:1:off', '0:2:off', '0:3:off', '1:0:off', '1:1:off', '1:2:off', '1:3:off', '2:0:on', '2:1:on', '2:2:on', '2:3:on'
    ]);
  });
  it('a left click on a weapon\'s pips adds a bar, a right click removes one; a click on PEW PEW picks it up', () => {
    const { duel, weaponPower, pickUp } = mount(); act(() => duel.frame(view()));
    fireEvent.pointerDown(screen.getByTestId('console-weapon-pips-1'), { button: 0 });
    fireEvent.pointerDown(screen.getByTestId('console-weapon-pips-2'), { button: 2 });
    expect(weaponPower.mock.calls).toEqual([[1, 1], [2, -1]]);
    fireEvent.pointerDown(screen.getByTestId('console-card-pew'), { button: 0 });
    expect(pickUp).toHaveBeenCalledWith('pew');
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npx vitest run tests/engineeringWeaponsUi.test.tsx`
Expected: FAIL (there is no PEW PEW card and no pips).

- [ ] **Step 9: Write** `src/renderer/src/ui/duel/WeaponsStation.tsx` (replace the whole file)

```tsx
// The Weapons station block (spec 2026-11-17-artemis-consoles §4.1; FTL targeting spec §1; Engineering spike §10.3): one
// card per weapon, FTL-style, in slot order. PEW PEW (the burst laser): its own charge bar and value, the volley mark,
// its target room; it fires by itself on a target, so it has no FIRE. BEAM (today's laser): its charge, the burst mark,
// its target and FIRE (Space). TORPEDO: the magazine, IN RANGE / OUT OF RANGE or FLYING, its target and LAUNCH (F). A
// click on a card picks that weapon up (the contact window opens and a targeting line runs to the pointer); the same card
// again cancels; a right-click clears its target. Under each card four pips show the bars on that weapon (the fourth is
// the overdrive's, dashed): a left click adds a bar, a right click removes one. 1 and 2 pick the beam and the torpedo up.
// Sci-1 spec §7.4: the frequency row, A B C (keys 3/4/5), shared by the beam and pew pew. Feel-i: the BEAM card flashes
// FIRING and glows as the goal; the row under the cards says why the beam can't fire.
import { memo, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import type { WeaponsPanel } from '../../render/duel/consoleModel';
import { STATION, stationTop, weaponCard, type CardWeapon } from '../../render/duel/consoleLayout';
import { FREQ_NAMES } from '../../render/duel/scienceModel';
import { AMBER, BAR_OFF, DIM, FONT_NATIVE, TEXT } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useActions } from '../context';
import { Bar } from '../stage/Bar';
import { Box } from '../stage/Box';
import { Button } from '../stage/Button';
import { hex } from '../stage/color';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';
import { crtRowLook } from './ReadoutPanel';

/** The room words, rooms[0] Weapons, rooms[1] Shields, rooms[2] Engines (as the contact window's labels). */
const ROOM_LABELS = ['WEAP', 'SHLD', 'ENG'] as const;
/** A target room's words on a card: `TGT SHLD`, or `TGT --` with none. */
export const targetText = (room: number): string => `TGT ${room >= 0 ? ROOM_LABELS[room] ?? '--' : '--'}`;
const stop = (e: SyntheticEvent): void => e.preventDefault();
/** Feel-i: the FIRING flash's and the goal glow's rates (Hz) on the CRT clock. */
export const FIRING_FLASH_HZ = 4, GOAL_GLOW_HZ = 1.2;
/** Engineering spike §10.3: a weapon's pips (3 bars and the overdrive's 4th) and their size. */
export const WEAPON_PIPS = 4, PIP_W = 16, PIP_H = 10, PIP_GAP = 4;
const SLOT: Record<CardWeapon, number> = { pew: 0, laser: 1, torpedo: 2 };

/** One weapon card's frame and its clickable part (FTL targeting spec §1): lit while picked up. Feel-i: `flash` (FIRING)
 *  blinks the frame hot, `glow` (the goal) pulses it hot and mid. */
function Card({ weapon, lit, crt, flash = false, glow = false, now = 0 }: { weapon: CardWeapon; lit: boolean; crt: boolean; flash?: boolean; glow?: boolean; now?: number }) {
  const actions = useActions(), c = weaponCard(weapon);
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (e.button === 2) { if (weapon === 'torpedo') actions.console.torpLock(-1); else if (weapon === 'pew') actions.console.pewLock?.(-1); else actions.console.lock(-1); return; }   // clear its target
    if (e.button === 0) actions.contact.pickUp(weapon);
  };
  const on = (hz: number): boolean => Math.floor(now * 2 * hz) % 2 === 0;
  const edge = lit || (flash && on(FIRING_FLASH_HZ)) || (glow && on(GOAL_GLOW_HZ)) ? (crt ? CRT.hot : AMBER) : crt ? CRT.mid : DIM;
  const thick = flash || glow ? 2 : 1;
  return (
    <>
      <Box x={c.x} y={c.y} w={c.w} h={c.h} attrs={{ 'data-ui-card-frame': weapon, ...(glow ? { 'data-ui-card-goal': '1' } : {}), ...(flash ? { 'data-ui-card-firing': '1' } : {}) }}
        style={{ border: `${thick}px solid ${hex(edge)}`, pointerEvents: 'none' }} />
      <div data-testid={`console-card-${weapon}`} data-ui-card={lit ? 'lit' : 'idle'} role="button" onPointerDown={down} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop}>
        <Box x={c.x} y={c.y} w={c.w} h={c.hitH} style={{ pointerEvents: 'auto', cursor: 'pointer', background: lit ? hex(crt ? CRT.glass : BAR_OFF) : 'transparent' }} />
      </div>
    </>
  );
}

/** Engineering spike §10.3: a weapon's bar pips under its card; a left click adds a bar, a right click removes one. */
function Pips({ weapon, bars, crt }: { weapon: CardWeapon; bars: number; crt: boolean }) {
  const actions = useActions(), c = weaponCard(weapon), slot = SLOT[weapon], x0 = c.x + 6;
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => { e.preventDefault(); if (e.button === 0) actions.console.weaponPower?.(slot, 1); else if (e.button === 2) actions.console.weaponPower?.(slot, -1); };
  return (
    <>
      {Array.from({ length: WEAPON_PIPS }, (_, k) => {
        const lit = k < bars, od = k === WEAPON_PIPS - 1;
        return <Box key={k} x={x0 + k * (PIP_W + PIP_GAP)} y={c.pipsY} w={PIP_W} h={PIP_H} attrs={{ 'data-ui-weapon-pip': `${slot}:${k}:${lit ? 'on' : 'off'}` }}
          style={{ background: lit ? hex(od ? (crt ? CRT.hot : AMBER) : (crt ? CRT.main : AMBER)) : 'transparent', border: `1px ${od ? 'dashed' : 'solid'} ${hex(crt ? CRT.mid : DIM)}` }} />;
      })}
      <div data-testid={`console-weapon-pips-${slot}`} role="button" onPointerDown={down} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop}>
        <Box x={x0} y={c.pipsY} w={WEAPON_PIPS * (PIP_W + PIP_GAP) - PIP_GAP} h={PIP_H} style={{ pointerEvents: 'auto', cursor: 'pointer' }} />
      </div>
    </>
  );
}

export const WeaponsStation = memo(function WeaponsStation({ weapons, aim = null }: { weapons: WeaponsPanel; aim?: CardWeapon | null }) {
  const actions = useActions(), { crt, now } = useCrt();
  const top = stationTop('weapons'), x0 = STATION.x + 8, y0 = top + 6, right = STATION.x + STATION.w - 8;
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, hot = crt ? CRT.hot : AMBER, c = weapons.charge;
  const barColour = crt ? crtRowLook(c, now).bar : c.bar?.colour ?? TEXT;
  const P = weaponCard('pew'), L = weaponCard('laser'), T = weaponCard('torpedo'), px = P.x + 6, lx = L.x + 6, tx = T.x + 6;
  const reason = weapons.laserReason ?? null, firing = reason === 'FIRING', pew = weapons.pew ?? null, bars = weapons.weaponBars ?? null;
  // Feel-ii §2.8: a refused FIRE or LAUNCH flashes, and the row under the cards names why for REFUSAL_SHOW_S.
  const refused = weapons.refused ?? null, flash = (k: string): boolean => refused?.control === k && refused.flash;
  return (
    <>
      <Panel x={STATION.x} y={top} w={STATION.w} h={STATION.h.weapons} />
      <Card weapon="pew" lit={aim === 'pew'} crt={crt} />
      <PixelText text="PEW PEW" x={px} y={P.y + 4} size={FONT_NATIVE} tint={aim === 'pew' ? hot : dim} />
      <PixelText text={`x${pew?.shots ?? 0}`} x={P.x + P.w - 6} y={P.y + 4} size={FONT_NATIVE} tint={main} anchorX={1} />
      <PixelText text={pew ? (pew.ready ? 'READY' : `${Math.round(pew.fill * 100)}%`) : '--'} x={px} y={P.y + 20} size={FONT_NATIVE} tint={pew?.ready ? hot : main} />
      <Bar x={px} y={P.y + 36} w={P.w - 12} h={6} fill={pew?.fill ?? 0} colour={crt ? CRT.main : AMBER} />
      <PixelText text={targetText(pew?.target ?? -1)} x={px} y={P.y + 44} size={FONT_NATIVE} tint={(pew?.target ?? -1) >= 0 ? hot : dim} />
      <PixelText text="AUTO" x={px} y={P.pipsY + 16} size={FONT_NATIVE} tint={dim} />
      <Card weapon="laser" lit={aim === 'laser'} crt={crt} flash={firing} glow={weapons.goal === true && aim !== 'laser'} now={now} />
      <PixelText text="BEAM" x={lx} y={L.y + 4} size={FONT_NATIVE} tint={aim === 'laser' ? hot : dim} />
      <PixelText text={`x${weapons.burst}`} x={L.x + L.w - 6} y={L.y + 4} size={FONT_NATIVE} tint={main} anchorX={1} />
      <PixelText text={firing ? 'FIRING' : c.value} x={lx} y={L.y + 20} size={FONT_NATIVE} tint={firing ? hot : main} />
      <Bar x={lx} y={L.y + 36} w={L.w - 12} h={6} fill={c.bar?.fill ?? 0} colour={barColour} />
      <PixelText text={targetText(weapons.laserTarget)} x={lx} y={L.y + 44} size={FONT_NATIVE} tint={weapons.laserTarget >= 0 ? hot : dim} />
      <Button name="fire" label="FIRE" hint="SPC" x={lx} y={L.pipsY + 14} w={L.w - 12} h={24} flash={flash('fire')} onPress={() => actions.console.press('fireDown')} />
      <Card weapon="torpedo" lit={aim === 'torpedo'} crt={crt} />
      <PixelText text="TORPEDO" x={tx} y={T.y + 4} size={FONT_NATIVE} tint={aim === 'torpedo' ? hot : dim} />
      <PixelText text={`MAG ${weapons.magazine}`} x={tx} y={T.y + 20} size={FONT_NATIVE} tint={main} />
      {weapons.missileFlying
        ? <PixelText text="FLYING" x={tx} y={T.y + 32} size={FONT_NATIVE} tint={hot} />
        : <PixelText text={weapons.torpedoInRange ? 'IN RANGE' : 'OUT OF RANGE'} x={tx} y={T.y + 32} size={FONT_NATIVE} tint={weapons.torpedoInRange ? main : dim} />}
      <PixelText text={targetText(weapons.torpTarget)} x={tx} y={T.y + 44} size={FONT_NATIVE} tint={weapons.torpTarget >= 0 ? hot : dim} />
      <Button name="launch" label="LAUNCH" hint="F" x={tx} y={T.pipsY + 14} w={T.w - 12} h={24} dim={!weapons.canLaunch} flash={flash('launch')} onPress={() => actions.console.press('launch')} />
      {bars && (['pew', 'laser', 'torpedo'] as const).map((w) => <Pips key={w} weapon={w} bars={bars[SLOT[w]] ?? 0} crt={crt} />)}
      {bars && <PixelText text={`FREE ${weapons.weaponFree ?? 0}`} x={right} y={y0 + 116} size={FONT_NATIVE} tint={(weapons.weaponFree ?? 0) > 0 ? hot : dim} anchorX={1} />}
      {refused !== null
        ? <PixelText text={`${refused.control === 'launch' ? 'LAUNCH' : 'FIRE'}: ${refused.reason}`} x={refused.control === 'launch' ? tx : x0} y={y0 + 116} size={FONT_NATIVE} tint={hot} />
        : reason !== null && !firing
        ? <PixelText text={`BEAM: ${reason}`} x={x0} y={y0 + 116} size={FONT_NATIVE} tint={hot} />
        : <PixelText text={firing ? 'BEAM: FIRING' : 'CLICK A WEAPON, THEN A ROOM'} x={x0} y={y0 + 116} size={FONT_NATIVE} tint={firing ? hot : dim} />}
      <PixelText text={reason !== null && !firing ? 'CLICK A WEAPON, THEN A ROOM' : 'PIPS: L ADD  R REMOVE'} x={x0} y={y0 + 134} size={FONT_NATIVE} tint={dim} />
      <Box x={x0} y={y0 + 156} w={right - x0} h={1} style={{ background: hex(crt ? CRT.dim : BAR_OFF) }} />
      <PixelText text="FREQ" x={x0} y={y0 + 174} size={FONT_NATIVE} tint={main} />
      {FREQ_NAMES.map((label, f) => <Button key={f} name={`freq-${f}`} label={label} x={x0 + 52 + f * 56} y={y0 + 170} w={52} h={24}
        lit={weapons.freq === f} onPress={() => actions.console.frequency(f)} />)}
      {weapons.weakFreq !== null && <Box x={x0 + 52 + weapons.weakFreq * 56 + 41} y={y0 + 164} w={7} h={7} attrs={{ 'data-ui-weak-freq': FREQ_NAMES[weapons.weakFreq] ?? '' }}
        style={{ background: hex(crt ? CRT.hot : AMBER), transform: 'rotate(45deg)' }} />}
      <PixelText text="3/4/5" x={right} y={y0 + 174} size={FONT_NATIVE} tint={dim} anchorX={1} />
    </>
  );
});
```
The card heights add up: the pips start at `y + 62` and are 10 px tall, and the buttons sit at `pipsY + 14` (y + 76), 24 px tall, ending at y + 100, inside the 104 px card. The FREE count shares the y0 + 116 row with the reason text, right-aligned; a refused LAUNCH reason starts at `tx` (x 220), which stays clear of FREE at the right end.

`actions.console` is typed `ConsoleInput` (`ui/actions.ts:49`), whose `pewLock` and `weaponPower` are optional, so the block calls them with `?.(…)`.

`DuelUi.tsx` passes `aim={duel.contact?.aimWeapon ?? null}` to `WeaponsStation`. The widened `aimWeapon` type flows through unchanged.

`FlightStation` (`ui/duel/FlightStation.tsx:22`, `type Weapon = 'laser' | 'torpedo'`) can't take `'pew'`, and the Flight seat never picks pew pew up. In `src/renderer/src/ui/duel/DuelUi.tsx`, narrow it at the call site. Replace
```tsx
          {duel.console?.flight && <FlightStation flight={duel.console.flight} aim={duel.contact?.aimWeapon ?? null} />}
```
with
```tsx
          {duel.console?.flight && <FlightStation flight={duel.console.flight} aim={duel.contact?.aimWeapon === 'pew' ? null : duel.contact?.aimWeapon ?? null} />}   {/* Engineering spike §10.3: no pew pew on Flight */}
```

- [ ] **Step 10: Run the tests**

Run: `npx vitest run tests/engineeringWeaponsUi.test.tsx tests/engineeringWeapons.test.ts tests/targetingUi.test.tsx tests/uiConsole.test.tsx tests/contactWindow.test.tsx tests/flightConsole.test.tsx tests/feelUi.test.tsx tests/feelIiUi.test.tsx`
Expected: PASS.

A pre-existing UI test that asserts the old block's words is updated to the new ones, and the report lists each test so changed: `LASER` becomes `BEAM`, the FONT_SIZE charge value becomes FONT_NATIVE, the second hint row reads `PIPS: L ADD  R REMOVE` where it read `RIGHT-CLICK A WEAPON: CLEAR`, and the card x positions follow `weaponCard`.

Run: `npx tsc -b`
Expected: no errors (`app/uiProbe.ts`'s fixture compiles, since the new `WeaponsPanel` fields are optional).

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/render/duel/consoleModel.ts src/renderer/src/render/duel/situationModel.ts src/renderer/src/ui/duel/DuelUi.tsx src/renderer/src/render/duel/consoleLayout.ts src/renderer/src/render/duel/contactModel.ts src/renderer/src/render/duel/shipControls.ts src/renderer/src/app/duel/input.ts src/renderer/src/app/duel/contactController.ts src/renderer/src/ui/actions.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/ui/duel/WeaponsStation.tsx tests/engineeringWeapons.test.ts tests/engineeringWeaponsUi.test.tsx tests/feelIiModels.test.ts
git commit -m "feat(engineering-spike): the Weapons console's pew pew, beam and torpedo with bar pips, and pew pew in the targeting flow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Stage by name any pre-existing test you updated in Steps 6 and 10.)

---

### Task 9: The fog of war on the crew's maps and the contact window (spec §10.4)

**Files:**
- Create: `src/renderer/src/render/tactical/fogModel.ts`
- Modify: `src/renderer/src/render/tactical/tacticalModel.ts`, `src/renderer/src/render/tactical/weaponsModel.ts`, `src/renderer/src/render/tactical/tacticalLayer.ts`, `src/renderer/src/render/duel/contactModel.ts`, `src/renderer/src/app/duel/scene.ts`
- Test: `tests/engineeringFog.test.ts`

**Interfaces:**
- Consumes (Part i Task 10): `sensorRange(sys)`, `pointSeen(t, x, y)` and `contactSeen(t, contact)`, with `derelictPos`, all in `sim/tactical/science.ts`; `missileOf`, `targetOf`, `Contact`, `CREW_SLOT` (`sim/tactical/state.ts`).
- Produces:
  - `GHOST_SECONDS = 10`, `GhostKind`, `Ghost`, `FogView { range; seen: Record<GhostKind, boolean>; ghosts }`;
  - `createFog()`, `stepFog(fog, t, now, epoch)`;
  - `TacticalModelInput.fog?`;
  - `TacticalDraw.sensor?: CircleDraw | null` and `TacticalDraw.ghosts?: GhostDraw[]`;
  - `ContactModelInput.seen?: boolean`.

- [ ] **Step 1: Write the failing test** `tests/engineeringFog.test.ts`

```ts
// Engineering spike §10.4: the fog of war is view state. A contact (the enemy, the derelict, the enemy's torpedo) is seen
// inside the sensor range; once unseen it leaves a ghost at its last seen place and heading, fading over 10 s, then gone.
// The map hides an unseen derelict's mark, draws the range ring and the ghosts; the contact window says CONTACT LOST.
import { describe, expect, it } from 'vitest';
import { createTacticalState, Contact, placeMissile } from '../src/renderer/src/sim/tactical/state';
import { derelictPos, sensorRange } from '../src/renderer/src/sim/tactical/science';
import { createFog, GHOST_SECONDS, stepFog } from '../src/renderer/src/render/tactical/fogModel';
import { tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { contactModel } from '../src/renderer/src/render/duel/contactModel';

const vp = { w: 1280, h: 720 };

describe('stepFog (spec §10.4)', () => {
  it('the enemy inside the range is seen; moved out it is a ghost at its last place, fading over 10 s, then gone', () => {
    const t = createTacticalState(5), f = createFog(), own = t.ships[0]!, e = t.ships[1]!, r = sensorRange(t.systems[0]!);
    e.x = own.x + r / 2; e.y = own.y; e.active = true;
    let v = stepFog(f, t, 100, 0);
    expect(v.range).toBe(r); expect(v.seen.enemy).toBe(true); expect(v.ghosts.filter((g) => g.kind === 'enemy')).toEqual([]);
    const at = { x: e.x, y: e.y, h: e.heading + e.headingAcc };
    e.x = own.x + r * 2;
    v = stepFog(f, t, 101, 0);
    expect(v.seen.enemy).toBe(false);
    expect(v.ghosts.find((g) => g.kind === 'enemy')).toEqual({ kind: 'enemy', ...at, alpha: 1 - 1 / GHOST_SECONDS });
    expect(stepFog(f, t, 100 + GHOST_SECONDS, 0).ghosts.find((g) => g.kind === 'enemy')).toBeUndefined();
  });
  it('a destroyed enemy leaves no ghost; a new round clears every ghost; never seen, never a ghost', () => {
    const t = createTacticalState(5), f = createFog(), own = t.ships[0]!, e = t.ships[1]!, r = sensorRange(t.systems[0]!);
    e.x = own.x + r * 3; e.active = true;
    expect(stepFog(f, t, 0, 0).ghosts).toEqual(expect.not.arrayContaining([expect.objectContaining({ kind: 'enemy' })]));   // never seen
    e.x = own.x + r / 2; stepFog(f, t, 1, 0);
    e.x = own.x + r * 3; expect(stepFog(f, t, 2, 0).ghosts.some((g) => g.kind === 'enemy')).toBe(true);
    expect(stepFog(f, t, 2.5, 1).ghosts.some((g) => g.kind === 'enemy')).toBe(false);   // a new round
    e.x = own.x + r / 2; stepFog(f, t, 3, 1); e.active = false;
    expect(stepFog(f, t, 4, 1).ghosts.some((g) => g.kind === 'enemy')).toBe(false);   // destroyed: no ghost
  });
  it('the enemy torpedo is seen by distance; gone while seen, it leaves no ghost', () => {
    const t = createTacticalState(5), f = createFog(), own = t.ships[0]!, r = sensorRange(t.systems[0]!);
    const m = placeMissile(t, 1, { x: own.x + r / 2, y: own.y, vx: 0, vy: 0, heading: 64, headingAcc: 0, age: 0 });
    expect(stepFog(f, t, 0, 0).seen.missile).toBe(true);
    m.x = own.x + r * 2;   // the entry placeMissile filled (the first free one, state.ts placeMissile)
    const v = stepFog(f, t, 1, 0);
    expect(v.seen.missile).toBe(false);
    expect(v.ghosts.find((g) => g.kind === 'missile')).toMatchObject({ x: own.x + r / 2, h: 64 });
  });
});

describe('the fog on the map and the window (spec §10.4)', () => {
  const input = (t: ReturnType<typeof createTacticalState>, over: Partial<TacticalModelInput>): TacticalModelInput => ({
    state: t, prev: [], alpha: 1, camera: createCamera(t.ships[0].x, t.ships[0].y, 0.5), viewport: vp, console: 'weapons', axes: { turn: 0, thrust: 0 },
    ships: [0], paused: false, reserveRight: 0, contacts: true, ...over });
  it('the range ring about the crew ship, the ghosts on screen, and no derelict mark while it is unseen', () => {
    const t = createTacticalState(5), w = derelictPos(t);
    const cam = createCamera(w.x, w.y, 0.5);
    const seen = tacticalModel(input(t, { camera: cam, fog: { range: 900, seen: { enemy: false, derelict: true, missile: false }, ghosts: [] } }));
    expect(seen.marks!.some((m) => m.contact === Contact.Derelict)).toBe(true);
    const fogged = tacticalModel(input(t, { camera: cam, fog: { range: 900, seen: { enemy: false, derelict: false, missile: false }, ghosts: [{ kind: 'enemy', x: w.x, y: w.y, h: 0, alpha: 0.5 }] } }));
    expect(fogged.marks!.some((m) => m.contact === Contact.Derelict)).toBe(false);
    expect(fogged.ghosts).toEqual([{ kind: 'enemy', x: vp.w / 2, y: vp.h / 2, angle: 0, alpha: 0.5 }]);
    const own = tacticalModel(input(t, { fog: { range: 900, seen: { enemy: false, derelict: false, missile: false }, ghosts: [] } }));
    expect(own.sensor).toEqual({ x: vp.w / 2, y: vp.h / 2, r: 900 * 0.5 });
    expect(tacticalModel(input(t, {})).sensor).toBeUndefined();   // no fog given (the flight view): no ring
  });
  it('the contact window on an unseen contact: CONTACT LOST, no drawing, no weapons', () => {
    const t = createTacticalState(5);
    const v = contactModel({ state: t, contact: 0, aim: true, station: 'weapons', t: 0, weapons: null, seen: false })!;
    expect(v).toMatchObject({ title: 'CONTACT LOST', outline: [], rooms: [], weapons: null, aim: false });
    expect(v.lines.map((l) => l.text)).toEqual(['OUT OF SENSOR RANGE']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/engineeringFog.test.ts`
Expected: FAIL (`fogModel.ts` doesn't exist; `fog`, `sensor`, `ghosts` and `seen` are ignored).

- [ ] **Step 3: Write** `src/renderer/src/render/tactical/fogModel.ts`

```ts
// Engineering spike §10.4: the fog of war on the crew's maps. View state only, computed by each client from the sim state
// (no sim field): a contact (the enemy, the derelict, the enemy's torpedo) is seen while it is inside the sensor range of
// the crew ship's centre (the sim's contactSeen for the enemy and the derelict, its pointSeen for the torpedo, which has
// no sim gate). An unseen contact the screen saw before leaves a ghost at its last seen position and heading,
// fading over GHOST_SECONDS on the presentation clock, then gone. A contact that ends (destroyed, its torpedo ended)
// leaves no ghost, and a new round clears them all. Planets and asteroids are never fogged. The crew's own torpedo is
// always shown (Decision 15).
import { contactSeen, derelictPos, pointSeen, sensorRange } from '../../sim/tactical/science';
import { Contact, CREW_SLOT, missileOf, targetOf, type TacticalState } from '../../sim/tactical/state';

export const GHOST_SECONDS = 10;
export type GhostKind = 'enemy' | 'derelict' | 'missile';
/** A ghost in world units: its last seen place and continuous heading (heading + headingAcc), and its alpha 0..1. */
export interface Ghost { kind: GhostKind; x: number; y: number; h: number; alpha: number }
export interface FogView { range: number; seen: Record<GhostKind, boolean>; ghosts: Ghost[] }
interface Track { x: number; y: number; h: number; seenAt: number }
export interface FogTracker { tracks: Map<GhostKind, Track>; epoch: number | null }
const KINDS: readonly GhostKind[] = ['enemy', 'derelict', 'missile'];

export function createFog(): FogTracker { return { tracks: new Map(), epoch: null }; }

/** One frame of the fog at presentation time `now` (seconds) in round `epoch`. */
export function stepFog(f: FogTracker, t: TacticalState, now: number, epoch: number): FogView {
  if (f.epoch !== epoch) { f.tracks.clear(); f.epoch = epoch; }
  const range = sensorRange(t.systems[CREW_SLOT]!), slot = targetOf(t, CREW_SLOT), e = t.ships[slot], m = missileOf(t, slot), w = derelictPos(t);
  const facts: Record<GhostKind, { present: boolean; seen: boolean; x: number; y: number; h: number }> = {
    enemy: { present: e?.active === true, seen: e?.active === true && contactSeen(t, Contact.Enemy), x: e?.x ?? 0, y: e?.y ?? 0, h: e ? e.heading + e.headingAcc : 0 },
    derelict: { present: true, seen: contactSeen(t, Contact.Derelict), x: w.x, y: w.y, h: 0 },
    missile: { present: m !== null, seen: m !== null && pointSeen(t, m.x, m.y), x: m?.x ?? 0, y: m?.y ?? 0, h: m ? m.heading + m.headingAcc : 0 }
  };
  const seen = { enemy: false, derelict: false, missile: false }, ghosts: Ghost[] = [];
  for (const kind of KINDS) {
    const k = facts[kind];
    seen[kind] = k.seen;
    if (!k.present) { f.tracks.delete(kind); continue; }
    if (k.seen) { f.tracks.set(kind, { x: k.x, y: k.y, h: k.h, seenAt: now }); continue; }
    const tr = f.tracks.get(kind);
    if (!tr) continue;
    const alpha = 1 - (now - tr.seenAt) / GHOST_SECONDS;
    if (alpha <= 0) { f.tracks.delete(kind); continue; }
    ghosts.push({ kind, x: tr.x, y: tr.y, h: tr.h, alpha });
  }
  return { range, seen, ghosts };
}
```

- [ ] **Step 4: The map model** (`src/renderer/src/render/tactical/tacticalModel.ts`)

After the existing imports, add `import type { FogView, GhostKind } from './fogModel';`.
After `export interface LockRingDraw { x: number; y: number; r: number }` add:
```ts
/** Engineering spike §10.4: a ghost in screen space (its heading as radians clockwise from north) at its fade. */
export interface GhostDraw { kind: GhostKind; x: number; y: number; angle: number; alpha: number }
```
In `TacticalDraw`, after `gravity?: GravityDraw[];` add:
```ts
  /** Engineering spike §10.4 (only with `fog`): the sensor range ring about the crew ship, and the ghosts. */
  sensor?: CircleDraw | null; ghosts?: GhostDraw[];
```
In `TacticalModelInput`, after `crewHull?: HullId;` add:
```ts
  /** Engineering spike §10.4: the fog this frame (the scene's stepFog). The scene leaves the enemy out of `ships` while it
   *  is unseen; the derelict's mark needs `seen.derelict`. Absent (the flight view): no fog. */
  fog?: FogView | null;
```
Replace
```ts
    if (onScreen(w.x, w.y, 40)) {
      const p = toS(w.x, w.y);
```
with
```ts
    if (onScreen(w.x, w.y, 40) && (input.fog?.seen.derelict ?? true)) {   // Engineering spike §10.4: an unseen derelict is a ghost
      const p = toS(w.x, w.y);
```
Replace
```ts
  const units = [...SCALE_STEPS].reverse().find((u) => u * z <= SCALE_BAR_MAX_PX) ?? SCALE_STEPS[0]!;
```
with
```ts
  // Engineering spike §10.4: the sensor range ring and the ghosts of contacts last seen.
  let sensor: CircleDraw | null = null, ghosts: GhostDraw[] = [];
  if (input.fog) {
    const r = input.fog.range * z;
    if (input.ships.includes(CREW_SLOT) && ringCrossesRect(ownS.x, ownS.y, r, vp.w, vp.h)) sensor = { x: ownS.x, y: ownS.y, r };
    ghosts = input.fog.ghosts.flatMap((g) => { if (!onScreen(g.x, g.y, 40)) return []; const p = toS(g.x, g.y); return [{ kind: g.kind, x: p.x, y: p.y, angle: headingAngle(g.h), alpha: g.alpha }]; });
  }
  const units = [...SCALE_STEPS].reverse().find((u) => u * z <= SCALE_BAR_MAX_PX) ?? SCALE_STEPS[0]!;
```
and in the returned object, after `...(gravity ? { gravity } : {}),` add `...(input.fog ? { sensor, ghosts } : {}),`.

- [ ] **Step 5: The combat model** (`src/renderer/src/render/tactical/weaponsModel.ts`)

`CombatModelInput` extends `TacticalModelInput`, so it has `fog` too.
- Replace
```ts
    const m = interpolatedMissile(state, input.missilePrev, alpha, i);
    if (!m) continue;
```
with
```ts
    const m = interpolatedMissile(state, input.missilePrev, alpha, i);
    if (!m || (i !== 0 && input.fog && !input.fog.seen.missile)) continue;   // Engineering spike §10.4: the enemy torpedo is fogged
```
- Replace
```ts
  if (!(input.contacts && state.known[Contact.Enemy] === 0) && onScreen(enemyS, SHIP_RADIUS * 2 * z + 40)) {   // Sci-1: no lock mark on an unknown contact
```
with
```ts
  if (input.ships.includes(target) && !(input.contacts && state.known[Contact.Enemy] === 0) && onScreen(enemyS, SHIP_RADIUS * 2 * z + 40)) {   // Sci-1: no lock mark on an unknown contact; Engineering spike §10.4: nor an unseen one
```
- Replace
```ts
      info: bandLabel(weaponsInfoText(bearingDeg(dx, dy), range, inRange), centre, input.infoBand, input.infoBand ? INFO_Y : 12, input.infoBand ? 1 : FONT_SIZE / FONT_NATIVE),
```
with
```ts
      info: bandLabel(input.ships.includes(target) ? weaponsInfoText(bearingDeg(dx, dy), range, inRange) : 'NO CONTACT IN SENSOR RANGE', centre, input.infoBand, input.infoBand ? INFO_Y : 12, input.infoBand ? 1 : FONT_SIZE / FONT_NATIVE),
```
- Replace
```ts
  const torpedoPath = state.outcome === Outcome.Running ? predictMissile(state, target, TORPEDO_PATH_TICKS, TORPEDO_PATH_STRIDE).map((q) => toS(q.x, q.y)) : [];
```
with
```ts
  const torpedoPath = state.outcome === Outcome.Running && !(input.fog && !input.fog.seen.missile) ? predictMissile(state, target, TORPEDO_PATH_TICKS, TORPEDO_PATH_STRIDE).map((q) => toS(q.x, q.y)) : [];
```
The enemy arc, the charge ring, the solution bracket and the pings already test `input.ships.includes(target)`, so the scene's `ships` hides them.

- [ ] **Step 6: The layer** (`src/renderer/src/render/tactical/tacticalLayer.ts`)

Replace
```ts
      if (d.edge) segments(contours, dashCircle(d.edge.x, d.edge.y, d.edge.r, DASH, GAP, seg), 2, CRT.main, 0.7);
```
with
```ts
      if (d.edge) segments(contours, dashCircle(d.edge.x, d.edge.y, d.edge.r, DASH, GAP, seg), 2, CRT.main, 0.7);
      // Engineering spike §10.4: the sensor range, dotted, and the ghosts: a hollow chevron (a small one for a torpedo),
      // fading with its alpha.
      if (d.sensor) segments(contours, dashCircle(d.sensor.x, d.sensor.y, Math.max(1, d.sensor.r), 2, 6, seg), 1, CRT.mid, 0.6);
      for (const g of d.ghosts ?? []) {
        const fx = Math.sin(g.angle), fy = -Math.cos(g.angle), rx = -fy, ry = fx, n = g.kind === 'missile' ? 4 : 10;
        contours.poly([g.x + fx * n, g.y + fy * n, g.x - fx * n * 0.8 + rx * n * 0.7, g.y - fy * n * 0.8 + ry * n * 0.7, g.x - fx * n * 0.4, g.y - fy * n * 0.4,
          g.x - fx * n * 0.8 - rx * n * 0.7, g.y - fy * n * 0.8 - ry * n * 0.7]).stroke({ width: 1, color: CRT.mid, alpha: g.alpha });
      }
```

- [ ] **Step 7: The contact window** (`src/renderer/src/render/duel/contactModel.ts`)

In `ContactModelInput`, after `flashes?: readonly { room: number; alpha: number }[];` add:
```ts
  /** Engineering spike §10.4: whether the shown contact is inside the sensor range (the scene's fog); default true. */
  seen?: boolean;
```
Replace
```ts
  if (i.contact === null) return i.station === 'science' ? bare(null, 'NO CONTACT SELECTED') : null;
```
with
```ts
  if (i.contact === null) return i.station === 'science' ? bare(null, 'NO CONTACT SELECTED') : null;
  if (i.seen === false) return bare(i.contact, 'CONTACT LOST', [line('OUT OF SENSOR RANGE', CRT.mid)]);   // Engineering spike §10.4: no drawing, no picks
```

- [ ] **Step 8: The scene** (`src/renderer/src/app/duel/scene.ts`)

After `import { viewCamera, type DuelView } from './runtime';` add:
```ts
import { createFog, stepFog } from '../../render/tactical/fogModel';
```
After `  let lastAimed: string | null = null;   // the weapon picked up on the last drawn frame (Valkyrn spec §5.1: right button)` add:
```ts
  const fog = createFog();   // Engineering spike §10.4: this screen's ghosts
```
Replace
```ts
      const d = source.duel, view = source.view(), alpha = source.alpha(), contact = options.contact;
```
with
```ts
      const d = source.duel, view = source.view(), alpha = source.alpha(), contact = options.contact;
      const fogView = stepFog(fog, d.tactical, performance.now() / 1000, source.epoch());   // Engineering spike §10.4
```
In the map `input` object, replace `ships: fx.kill ? [0] : [0, 1],` with `ships: fx.kill || !fogView.seen.enemy ? [0] : [0, 1], fog: fogView,`.
In the `contactModel({ … })` call, replace
```ts
weapons: consoleView?.weapons ?? consoleView?.flight?.weapons ?? null,
```
with
```ts
weapons: consoleView?.weapons ?? consoleView?.flight?.weapons ?? null, seen: open?.contact === 0 ? fogView.seen.enemy : open?.contact === 1 ? fogView.seen.derelict : true,
```
The fog is per screen and per epoch, so a Tab keeps the same screen's ghosts and a new round clears them in `stepFog`. The pick-up of an unseen enemy opens CONTACT LOST, which has no rooms, so nothing locks. The sim refuses a lock on an unseen contact anyway.

- [ ] **Step 9: Run the tests**

Run: `npx vitest run tests/engineeringFog.test.ts tests/duelWeaponsView.test.ts tests/duelHitFeedback.test.ts tests/crtBezel.test.ts tests/contactScene.test.ts tests/contactWindow.test.tsx tests/shipHudScene.test.ts tests/engineeringScene.test.ts`
Expected: PASS.

At round start the Hunter spawns about 2000 or more units away, and the start range is 900, so it is unseen. Every scene or UI test that needs the enemy drawn, marked, arced or clickable at round start now fails. Find them:
```bash
git grep -ln "pickContact\|contactModel(\|marks\b\|enemyArc\|createDuelScene\|ships: \[0, 1\]" -- tests
```
`tests/contactScene.test.ts:53` and `:59-68` are among them. Fix each one the same way, before its first draw: move the Hunter within 900 of the crew ship. Leave the fog alone, and leave the Sensors bars alone too:
```ts
const sh = rt.duel.tactical.ships; sh[1]!.x = sh[0]!.x + 600; sh[1]!.y = sh[0]!.y;   // Engineering spike §10.4: inside the 900 start range
```
For a test that builds a `TacticalState` with no runtime, use `t.ships` in place of `rt.duel.tactical.ships`. List each test so changed in the report.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/render/tactical/fogModel.ts src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/tactical/weaponsModel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/render/duel/contactModel.ts src/renderer/src/app/duel/scene.ts tests/engineeringFog.test.ts
git commit -m "feat(engineering-spike): the fog of war on the crew maps: the sensor range ring, ghosts fading over 10 s, CONTACT LOST" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Stage by name any pre-existing test you updated in Step 9.)

---

### Task 10: The gates

**Files:** none (the measurements are Part i's: `scripts/engineering-spike-measure.ts`, run in its Tasks 1 and 12).

- [ ] **Step 1: The gates**

Run: `npx tsx scripts/golden/duel-oracle.ts same` then `npx tsx scripts/golden/canonical-trace.ts same`
Expected: both exit 0, with Task 1's `<R>`, `<T>` and `<F>`. Part ii changed no sim.

Run: `npx tsc -b`, then `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: no type errors; the build succeeds; every test file PASS (rerun a timed-out sim file alone, per Global Constraints).

Run: `npm run test:duel-app-runtime`
Expected: exit 0. The online duel still runs through the real app, and the ship-command path compiles into it.

A full-suite failure from a test that needs the enemy drawn, marked or clickable at round start gets Task 9 Step 9's recipe: move the Hunter within 900 of the crew ship before the first draw. Commit any such fix by name with `git commit -m "test(engineering-spike): enemy inside the start sensor range where a test needs it drawn" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 11 (controller, not a subagent): the app smoke, the screenshots and the report

**Files:**
- Modify: `docs/superpowers/research/2026-11-18-engineering-spike.md` (Part i's report: Part i Task 1 creates it, its Task 12 fills the measurements, the gate table and determinism)
- The smoke script lives outside the repo.

- [ ] **Step 1: Install playwright-core outside the repo, once**

```bash
mkdir -p /c/Users/djuar/AppData/Local/Temp/engineering-shots && cd /c/Users/djuar/AppData/Local/Temp/engineering-shots && npm init -y >/dev/null && npm i playwright-core@1.48.2 >/dev/null
```

- [ ] **Step 2: Write** `C:\Users\djuar\AppData\Local\Temp\engineering-shots\smoke.mjs`

```js
// Engineering spike §8, §10: the app smoke and the screenshots, Single player on the Hound. On the ship view it right-
// clicks Sensors and Oxygen (three spare bars with the round's one), left-clicks Engines twice (overdrive), cycles Engines'
// coolant, clicks the Ops-Quarters door (held open) and the Hold airlock (venting), asserting on the staged runtime after
// each. Then it walks to Weapons and sits (the three weapons), and stages a contact seen then lost (a fading ghost). Five
// screenshots. Uses the staging hook (window.__FTLITE_STAGE__ before the duel starts → __ftliteDuel and __ftliteScene).
import { _electron as electron } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const ROOT = 'C:/Users/djuar/FTLite/.worktrees/engineering', OUT = 'C:/Users/djuar/FTLite-shots/engineering';
mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: `${ROOT}/node_modules/electron/dist/electron.exe`, args: [ROOT] });
const page = await app.firstWindow();
const wait = (ms) => page.waitForTimeout(ms), shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const rt = (fn, arg) => page.evaluate(fn, arg);
const check = (ok, what) => { if (!ok) throw new Error(`smoke: ${what}`); console.log(`ok  ${what}`); };
const toClient = (ix, iy) => rt(([x, y]) => { const c = document.querySelector('canvas'), r = c.getBoundingClientRect(), s = Math.min(r.width / 1280, r.height / 720);
  return { x: r.left + (r.width - 1280 * s) / 2 + x * s, y: r.top + (r.height - 720 * s) / 2 + y * s }; }, [ix, iy]);
const tileClient = async (tx, ty) => { const p = await rt(() => window.__ftliteScene.interiorPlacement()); return toClient(p.x + (tx + 0.5) * 32 * p.scale, p.y + (ty + 0.5) * 32 * p.scale); };
const bars = () => rt(() => [...window.__ftliteDuel.duel.tactical.systems[0].bars]);
await page.waitForSelector('[data-testid="single-player"]');
await rt(() => { window.__FTLITE_STAGE__ = true; });
await page.click('[data-testid="single-player"]'); await wait(300);
await page.click('[data-testid="ship-hound"]'); await wait(1500);
check((await rt(() => window.__ftliteDuel.view())) === 'interior', 'the round starts on the ship view');
check(JSON.stringify(await bars()) === '[2,2,3,1,1]', 'round-start bars 2/2/3/1/1 (spec §10.1)');
await shot('1-hud-round-start');
await page.click('[data-testid="hud-power-3"]', { button: 'right' }); await wait(150);
await page.click('[data-testid="hud-power-4"]', { button: 'right' }); await wait(150);
check(JSON.stringify(await bars()) === '[2,2,3,0,0]', 'right clicks took Sensors and Oxygen to 0');
await page.click('[data-testid="hud-power-2"]'); await wait(150);
await page.click('[data-testid="hud-power-2"]'); await wait(150);
check((await bars())[2] === 5, 'two left clicks overdrive Engines to 5');
await page.click('[data-testid="hud-coolant-2"]'); await wait(150);
check((await rt(() => window.__ftliteDuel.duel.power.coolant[2])) === 1, 'a pip click gives Engines one coolant');
const door = await rt(() => { const der = window.__ftliteDuel.duel.interior.derived; return der.doorTileToEdge[7 * der.width + 12]; });
const dp = await tileClient(12, 7); await page.mouse.click(dp.x, dp.y); await wait(150);
check((await rt((e) => window.__ftliteDuel.duel.interior.doors.state[e], door)) === 3, 'a door click holds the Ops-Quarters door open');
await wait(3000); await shot('2-overdriven-heating');   // Engines overdriven with one coolant: the heat bar climbs
const lock = await rt(() => { const der = window.__ftliteDuel.duel.interior.derived; return der.airlockOfTile[7 * der.width]; });
const lp = await tileClient(0, 7); await page.mouse.click(lp.x, lp.y); await wait(150);
check((await rt((k) => window.__ftliteDuel.duel.interior.airlocks.open[k], lock)) === 1, 'an airlock click opens the Hold to space');
await wait(1800); await shot('3-hold-venting');
check((await rt(() => { const st = window.__ftliteDuel.duel.interior, h = st.derived.roomIndex.get('H'); return st.rooms.o2[h] / st.derived.volume[h]; })) < 0.25, 'the Hold is below a quarter air');
await page.mouse.click(lp.x, lp.y); await wait(150);   // close the Hold again
// Walk from the Quarters spawn (13,7) east through the door (18,7) into the Bridge and up beside Weapons (19,5); sit (E).
// A sit at the Helm (20,7) is retried after a stand (X) and a nudge up. The memory note: a move must line up with one-tile doors.
for (let k = 0; k < 8 && (await rt(() => window.__ftliteDuel.view())) !== 'weapons'; k++) {
  if ((await rt(() => window.__ftliteDuel.view())) !== 'interior') { await page.keyboard.press('KeyX'); await wait(200); }
  if (k === 0) { await page.keyboard.down('KeyD'); await wait(1800); await page.keyboard.up('KeyD'); }
  await page.keyboard.down('KeyW'); await wait(k === 0 ? 450 : 150); await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyE'); await wait(300);
}
check((await rt(() => window.__ftliteDuel.view())) === 'weapons', 'seated at Weapons');
await wait(500); await shot('4-weapons-three-weapons');   // PEW PEW 1 bar, BEAM 0, TORPEDO 1; the WEAP strip beside the block
// Spec §10.4: stage a contact seen, then lost. Sensors to 3 (range 2000) with the Hunter 1200 ahead; then Sensors to 0
// (range 300): it becomes a ghost at its last seen place, fading over 10 s. (A staged edit of the state, as the
// Valkyrn shots do; the reactor's spares are not kept consistent for the picture.)
await rt(() => { const t = window.__ftliteDuel.duel.tactical, s = t.ships[0], e = t.ships[1]; Object.assign(e, { x: s.x + 1200, y: s.y, vx: 0, vy: 0, active: true }); t.systems[0].bars[3] = 3; });
await wait(800);
await rt(() => { window.__ftliteDuel.duel.tactical.systems[0].bars[3] = 0; });
await wait(3000); await shot('5-fog-ghost-fading');   // the ring at 300, the Hunter's ghost about 70 % faded in, CONTACT LOST if the window is open
await app.close();
console.log('smoke passed');
```

- [ ] **Step 3: Run it**

The worktree must be built first: run `npx electron-vite build` in the worktree.
Run: `cd /c/Users/djuar/AppData/Local/Temp/engineering-shots && node smoke.mjs`
Expected: nine `ok` lines, then `smoke passed`, and five PNGs in `C:\Users\djuar\FTLite-shots\engineering\`.

If a click misses because the HUD covers the door (Decision 11) or the fit differs, fix the smoke, not the game: zoom the interior with `page.mouse.wheel` before the door click, and record what was needed. A failing assertion on a click that landed goes back to the task that owns it as a fix.

Open each PNG and check:
1. `1-hud-round-start`: the amber CRT panel bottom left.
   - SHLD shows 2 of 5 slots lit, the fifth dashed;
   - WEAP 2 of 10 (the slots stack to the panel top);
   - ENG 3 of 5; SENS 1 of 4; O2 1 of 2;
   - PWR 1 of 10, and the header reads `REACTOR 1/10   COOLANT 8/8`;
   - the hull and the shields top left, with one powered and one unpowered pip.
2. `2-overdriven-heating`: ENG 5 of 5 with its top slot hot and dashed, its heat bar partly filled, one pip lit; the Ops–Quarters door drawn held open.
3. `3-hold-venting`: the Hold's airlock open with specks streaming out, and the Hold tinted red.
4. `4-weapons-three-weapons`:
   - the Weapons block's three cards, PEW PEW (x2, its own charge bar, AUTO), BEAM (x0, FIRE) and TORPEDO (MAG, LAUNCH);
   - pips 1, 0 and 1 lit;
   - FREE 0;
   - the WEAP power strip beside the block.
5. `5-fog-ghost-fading`: the dotted sensor ring close about the crew ship, the Hunter's hollow chevron ghost fading where it was last seen, and the info line `NO CONTACT IN SENSOR RANGE`.

- [ ] **Step 4: Append Part ii's sections to the report** `docs/superpowers/research/2026-11-18-engineering-spike.md`

Read the file first. Part i's three sections (Sim measurements, Gates and bands, Determinism) stay as they are; the numbers in the summary below are quoted from them. Append these sections at the end, filling each `<…>`: the full-suite count and the oracle and trace lines from Task 10 Step 1, the smoke's lines from Step 3, and the tests changed under Tasks 7 to 9 from those tasks' reports. Everything else is literal:
```markdown
## What was built (Parts i and ii)

- FTL reactor bars (10) over five systems (Shields 4, Weapons 9, Engines 4, Sensors 3, Oxygen 2), each with an overdrive
  slot except Oxygen, heat and 8 shared coolant; damage knocks out slots; an overheated system fails until it cools.
- Each station spends its own bars (spec §10): 1 Engines bar is 25 % throttle; the Weapons officer spreads the Weapons bars
  over pew pew (a burst laser), the beam and the torpedo; Sensors sets the sensor range, and every crew map has a fog of
  war with fading ghosts.
- Oxygen per room, breaches from hits, airlocks that vent, fire that needs air and spreads through open doors, low air hurts.
- The ship view is the Engineering station: an amber CRT panel (left click adds a bar, right click removes one, a pip
  click cycles coolant) and door and airlock clicks on the interior, for anyone, from anywhere.

## Summary numbers

From Part i's sections above: the Hound duel's flattened values <before> → <after>, ms per tick <before> → <after>.
After Part ii: `duel-oracle same` and `canonical-trace same`: <R> runs, <T> ticks, <F> fields (Part ii changed no sim);
`npm run test:duel-app-runtime` exit 0; full suite <count> tests passing.

## App smoke and screenshots (Part ii)

`node smoke.mjs`: <the nine ok lines, or what failed and the fix>.
- `C:\Users\djuar\FTLite-shots\engineering\1-hud-round-start.png`: the panel at round start.
- `C:\Users\djuar\FTLite-shots\engineering\2-overdriven-heating.png`: Engines overdriven and heating, a door held open.
- `C:\Users\djuar\FTLite-shots\engineering\3-hold-venting.png`: the Hold venting through its airlock.
- `C:\Users\djuar\FTLite-shots\engineering\4-weapons-three-weapons.png`: the Weapons console's pew pew, beam and torpedo.
- `C:\Users\djuar\FTLite-shots\engineering\5-fog-ghost-fading.png`: the fog: the sensor ring and a ghost fading.

## Tests Part ii updated (Tasks 7 to 9)

<one line per pre-existing test changed in Task 7 Step 7, Task 8 Steps 6 and 10, Task 9 Step 9 and Task 10 Step 1:
the file, the test, and why (a new ConsoleView key, the three-card layout, the enemy moved inside the start range)>

## Feel (owner to fill after playing)

- Does Engineering feel like a full-time job for the 4th seat or whoever is on foot?
- Does it change how Helm and Weapons fight (shields at 1 layer, 75 % throttle and the beam dark until Engineering moves bars)?
- Is spreading the Weapons bars over pew pew, beam and torpedo a real choice? Is the fog's 900 start range right?
- Can you read power, heat, air, fire and breaches at a glance?
- Is the 1-layer shield start right? The 25 % air line? The 20 s cool-down after an overheat?

## Known limits and candidates

- The panel may cover the Hound's lower-left rooms at the zoom-0 fit; zoom or pan to reach a covered door.
- The Helm's locked notches and the Science strip's range are covered by jsdom tests, not screenshots; the owner sees them on a console.
- Pew pew has no number key, and its target shows on its card only (the contact window marks the beam's and the torpedo's).
- Sensors and Oxygen take no weapon damage (no tactical Room).
- Fire spread, overheat ignitions and breaches push no events: no sound cue or callout yet.
- Candidates: Artemis presets (SHIFT+number), sealed doors, a refusal flash on a full reactor, keys for the panel.

## Recommendation

<one of: ship as is / ship a simpler version / drop it, with one paragraph why: the controller's provisional call from
the numbers and the screenshots, to be confirmed by the owner's play>
```

- [ ] **Step 5: Commit the report**

```bash
git add docs/superpowers/research/2026-11-18-engineering-spike.md
git commit -m "docs(engineering-spike): Part ii's report sections (what was built, smoke, screenshots, tests updated, owner's feel questions)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The final report to the owner lists:
- each task's commit;
- the oracle and trace `same` lines;
- the full-suite count;
- the smoke's lines;
- the five screenshot paths;
- the open owner gates: playing the spike, the look check, and the feel questions in the report.

---

## Self-review

- **Spec coverage.**
  - §1 deliverables (the prototype, the report, the screenshots of the HUD, a vented room, an overheating system, the Weapons console and a fading ghost): Tasks 10 and 11. The measurements are Part i's (its Tasks 1 and 12); Task 11 appends to its report.
  - §5 (door clicks on the interior, auto ↔ held, airlock clicks, anyone, remote): Tasks 2, 3 and 6. The toggling itself is Part i's.
  - §6, item by item:
    - the UI rule: Decision 9, `scene.ts:291` kept;
    - the CRT look: Task 4, Decision 8;
    - the power columns, clicks, slots, lost slots and overdrive slot: Tasks 1 and 4;
    - the reactor and free coolant: Tasks 1 and 4;
    - the heat bar and coolant pips: Tasks 1 and 4;
    - the air tint, breach and fire icons: Task 5, Decision 6;
    - the door and airlock glyphs: already drawn, Decision 6;
    - the hover highlight: Task 5;
    - presets: out, noted in the report.
  - §7 (the commands reach the sim for any present, conscious player): Task 3, through the keyboard queue in both modes.
  - §8 (the app smoke: a power column, a coolant counter and a door, with state asserted; the screenshots): Task 11, Decision 10. The sim tests are Part i's.
  - §9.3 (each console's strip) with §10.2's locked notches and capped requests and §10.4's Science range: Task 7.
  - §10.3 (three weapons at 0–3 bars, pew pew's charge bar, pew pew in the targeting flow): Task 8, Decision 14.
  - §10.4 (the fog on every crew map and the contact window, ghosts over 10 s, the range ring, planets and asteroids always): Task 9, Decision 15.
- **No sim change.** Part ii touches no file under `sim/` or `net/`, and Task 10 proves `same` against Task 1's 54 baselines.
- **Types.** The names match across tasks:
  - `ShipCommand` (Task 2) is used by input.ts, actions.ts, scene.ts and the tests.
  - `ShipControl.tile` (Task 2) is used by the hover (Task 5).
  - `Placement` (interiorCamera.ts) is used by `shipControlAt`, `InteriorView.placement` and `DuelScene.interiorPlacement`.
  - `PowerColumn` and `ShipHudView.power` (Task 1) are used by Task 4.
  - `hud-power-<n>` and `hud-coolant-<n>` (Task 4) are used by the smoke (Task 11).
  - `Weapon`, `CardWeapon` (`'pew' | 'laser' | 'torpedo'`, Task 8) are used by the controller, the layout, the block and the targeting line.
  - `FogView` (Task 9) is used by the map models and the scene.
- **Placeholders.** Only the report's `<…>` measured values are left open, and they are filled from named runs.
