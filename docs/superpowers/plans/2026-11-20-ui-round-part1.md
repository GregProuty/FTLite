# UI Round Part 1 (Quick Fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the owner's quick fixes from the 2026-11-19 playtest list: a weaker Hunter, a faster Valkyrn, the grid off by default, no torpedo range ring, no rock picking, a pause that keeps the UI, F11 fullscreen in the browser, and an FPS counter.

**Architecture:** Two sim constants change (Hunter hull, Valkyrn thrust), proved with the repo's bless pattern (a same-version bless, then SIM_VERSION +1 alone). Everything else is app, render and React UI: the map grid gains an `'off'` style and the settings record goes to version 3. The torpedo range ring and the rock pick path come out. `consoleHidden` stops treating a pause as a reason to hide. The pause banners become one top-centre line. The page catches F11. A new FPS meter feeds a new `FpsCounter` component.

**Tech Stack:** TypeScript, Pixi (canvas map), React + zustand (UI), Vitest, Electron + Vite web build.

**Spec:** `docs/superpowers/specs/2026-11-20-ui-round-design.md` §0, §1, §4 (Part 1 only).

## Global Constraints

- Hunter hull **95** (`HUNTER_HULL`, was 123). Valkyrn thrust **200** u/s² (`VALKYRN_THRUST`, was 160). Turn rates, `MAX_SPEED` (400) and `ROCK_MAX_SPEED` are unchanged.
- `DEFAULT_MAP_GRID = 'off'`. Settings shows Off / Gravity well / Square. Settings record **version 3**. A version 2 record keeps every field except its grid, which reads `'off'`.
- Pause hides nothing. Its line sits at top centre, native font size (`FONT_NATIVE`), on a panel from y **66** to y **90**. Local text: `PAUSED   ESC: RESUME   F11: FULLSCREEN   M: MAIN MENU` (no `   M: MAIN MENU` when there is no exit).
- FPS counter: `NN FPS`, right edge at x `INTERNAL_W - 8`, top at y **702**, `FONT_NATIVE`, tint `DIM`. On by default. Settings has the "FPS counter" checkbox.
- Rocks: no rock is picked by a click and none wears a hover mark. The hints read `… A ROOM`. The `ROCKS n` tally goes. The sim's `rockLock` command and every rock rule stay as they are.
- **Never hand-edit goldens.** Generated files come only from `npm run bless`. Never pass `--fresh`.
- **Copy:** UI strings are upper case on the console (CRT) and sentence case in Settings, as today.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Working rules (read once)

- **Branch and worktree:** `ui-round-1` in `C:\Users\djuar\FTLite\.worktrees\ui-round-1`, from master. Every command runs from the worktree root in Git Bash. Other sessions work in the main checkout and other worktrees: never touch them.
- **Junctions** (a fresh worktree has no `node_modules`; see the memory note "worktree signalling junction"), in PowerShell:
  ```powershell
  New-Item -ItemType Junction -Path C:\Users\djuar\FTLite\.worktrees\ui-round-1\node_modules -Target C:\Users\djuar\FTLite\node_modules
  New-Item -ItemType Junction -Path C:\Users\djuar\FTLite\.worktrees\ui-round-1\services\signalling\node_modules -Target C:\Users\djuar\FTLite\services\signalling\node_modules
  ```
- **Test commands:** targeted `npx vitest run <files>`; types `npm run typecheck`; the full suite `npx vitest run --maxWorkers=4`, always after `npx electron-vite build` (one test reads `out/`). Never run two vitest processes at once. Re-run a load-sensitive timeout alone (`tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts`, `tests/gate-*.test.ts`, `tests/duelGates.test.ts`) before you count it as a failure.
- **Determinism logs:** `npm run test:determinism` rewrites tracked logs under `.superpowers/sdd/2026-11-14-net-1b-durability/`. After every run: `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability`.
- **The report:** `docs/superpowers/research/2026-11-20-ui-round-1-report.md`. Each task that measures something appends its own section.
- **Version at base.** This plan assumes master is at `SIM_VERSION = 64` (`src/renderer/src/sim/tuning.ts:7`). Another branch (`asteroids-iv`) also bumps it. If Task 1 finds a different value N, read every "64" below as N and every "65" as N+1.

## File map

| File | Change |
|---|---|
| `src/renderer/src/sim/tactical/tuning.ts` | `HUNTER_HULL` 95, `VALKYRN_THRUST` 200 |
| `src/renderer/src/sim/tuning.ts` | `SIM_VERSION` 64 → 65 (Task 9 only) |
| `src/renderer/src/render/tactical/mapGrid.ts` | `'off'` style, default, label |
| `src/renderer/src/render/tactical/tacticalModel.ts` | `gridDraw` draws no lines for `'off'` |
| `src/renderer/src/app/settingsStore.ts` | record v3, grid migration, `fpsCounter` |
| `src/renderer/src/render/tactical/weaponsModel.ts`, `tacticalLayer.ts` | the torpedo range ring removed |
| `src/renderer/src/app/duel/scene.ts` | no rock pick or hover; `consoleHidden` ignores pause |
| `src/renderer/src/ui/duel/WeaponsStation.tsx`, `src/renderer/src/render/duel/sitModel.ts` | `… A ROOM` hints, no `ROCKS` tally |
| `src/renderer/src/ui/duel/Banners.tsx` | one top-centre pause line on a panel |
| `src/renderer/src/app/duel/duelMode.ts` | the pause text gains `F11: FULLSCREEN` |
| `src/renderer/src/app/web/browserFullscreen.ts`, `src/renderer/src/main.ts` | F11 toggles the page's fullscreen |
| `src/renderer/src/ui/menuState.ts`, `ui/menu/Settings.tsx` | the browser F11 note, the FPS checkbox |
| Create `src/renderer/src/app/fpsMeter.ts`, `src/renderer/src/ui/FpsCounter.tsx` | the meter and the readout |
| `src/renderer/src/ui/store.ts`, `ui/actions.ts`, `ui/UiRoot.tsx` | `fps` slice, `fpsCounter` setting, mount |

---

### Task 1: Worktree, base and baselines

**Files:**
- Create: `docs/superpowers/research/2026-11-20-ui-round-1-report.md`

**Interfaces:**
- Produces: `UR1_BASE` (the base commit), the gate numbers before any change.

- [ ] **Step 1: Create the worktree**

```bash
cd /c/Users/djuar/FTLite && git worktree add .worktrees/ui-round-1 -b ui-round-1 master
```
Then the two junctions (Working rules), in PowerShell.

- [ ] **Step 2: Record the base**

Run: `git rev-parse --short=8 HEAD; git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts; git grep -n "HUNTER_HULL = \|VALKYRN_THRUST = " -- src/renderer/src/sim/tactical/tuning.ts`
Expected: a hash (`UR1_BASE`); `SIM_VERSION = 64;`; `HUNTER_HULL = 123;` and `VALKYRN_THRUST = 160;`.

- [ ] **Step 3: The suite at the base**

Run, one at a time: `npm run typecheck`; `npx electron-vite build`; `npx vitest run --maxWorkers=4`.
Expected: clean, success, every file PASS. Note the file and test counts.

- [ ] **Step 4: The gate numbers before**

Run: `npx tsx scripts/duel-telemetry.ts` and `npx tsx scripts/valkyrn-telemetry.ts`
Expected: each prints its summary (median round length, wins by side). Copy both outputs verbatim into the report.

- [ ] **Step 5: The canonical baseline for the sector game**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 64: …written to <temp>\trace.json`, exit 0.

- [ ] **Step 6: Write the report and commit**

The report starts:
```markdown
# UI round Part 1: report

Spec: docs/superpowers/specs/2026-11-20-ui-round-design.md §1. Plan: docs/superpowers/plans/2026-11-20-ui-round-part1.md.

## Task 1: base
- UR1_BASE = <hash>, SIM_VERSION 64, branch ui-round-1.
- Suite: <files> files, <tests> tests, all PASS.
- Gates before (duel-telemetry): <verbatim>
- Gates before (valkyrn-telemetry): <verbatim>
```

```bash
git add docs/superpowers/research/2026-11-20-ui-round-1-report.md
git commit -m "docs(ui-round-1): base report: UR1_BASE, the suite and the gate numbers at SIM_VERSION 64" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: A weaker Hunter and a faster Valkyrn

**Files:**
- Modify: `src/renderer/src/sim/tactical/tuning.ts:59` (`HUNTER_HULL`), `:175` (`VALKYRN_THRUST`)
- Modify: `tests/valkyrnClasses.test.ts:42-45`, `tests/duelReadout.test.ts:26` (comment)
- Create: `tests/uiRoundBalance.test.ts`

**Interfaces:**
- Produces: `HUNTER_HULL === 95`, `VALKYRN_THRUST === 200`. No new names.

- [ ] **Step 1: Write the failing test**

`tests/uiRoundBalance.test.ts`:
```ts
// UI round spec §1.1, §1.2: the Hunter's hull and the Valkyrn's thrust. Every game ship flies with drag, so its top
// speed is the fixed point of v' = (v + a·dt)(1 − drag·dt): v* = a(1 − drag·dt)/drag. MAX_SPEED only caps drag 0.
import { describe, expect, it } from 'vitest';
import { CUTTER_CLASS, HUNTER_CLASS, VALKYRN_CLASS, VALKYRN_LASER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { flyShip } from '../src/renderer/src/sim/tactical/physics';
import { createTacticalState, type Ship } from '../src/renderer/src/sim/tactical/state';
import { DRAG, DT, HUNTER_HULL, MAX_SPEED, THRUST, VALKYRN_THRUST, type FlightTuning } from '../src/renderer/src/sim/tactical/tuning';

const FLAT: FlightTuning = { gravity: false, edge: false, drag: DRAG, stabilise: 0 };
const ship = (): Ship => ({ ...createTacticalState(1).ships[0], x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
function topSpeed(cls: typeof VALKYRN_CLASS): number {
  const s = ship();
  for (let k = 0; k < 20000; k++) flyShip(s, { turn: 0, thrust: 1 }, FLAT, 0, cls);
  return Math.hypot(s.vx, s.vy);
}

describe('UI round balance (spec §1.1, §1.2)', () => {
  it('the Hunter has 95 hull; the crew ships keep theirs', () => {
    expect(HUNTER_HULL).toBe(95);
    expect(HUNTER_CLASS.hull).toBe(95);
    expect(CUTTER_CLASS.hull).toBe(70);
  });
  it('the Valkyrn thrusts 200 (both fits); the Hound and the Hunter keep 120; MAX_SPEED stays 400', () => {
    expect(VALKYRN_THRUST).toBe(200);
    expect([VALKYRN_CLASS.thrust, VALKYRN_LASER_CLASS.thrust, CUTTER_CLASS.thrust, HUNTER_CLASS.thrust]).toEqual([200, 200, THRUST, THRUST]);
    expect(MAX_SPEED).toBe(400);
  });
  it('top speed is thrust over drag: the Valkyrn about 1330 u/s, a standard ship about 798 u/s', () => {
    const fixed = (a: number): number => (a * (1 - DRAG * DT)) / DRAG;
    expect(topSpeed(VALKYRN_CLASS)).toBeCloseTo(fixed(200), 3);
    expect(topSpeed(HUNTER_CLASS)).toBeCloseTo(fixed(120), 3);
    expect(topSpeed(VALKYRN_CLASS) / topSpeed(HUNTER_CLASS)).toBeCloseTo(200 / 120, 6);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/uiRoundBalance.test.ts`
Expected: FAIL. `HUNTER_HULL` is 123 and `VALKYRN_THRUST` is 160. The third case passes already, since it reads the class.

- [ ] **Step 3: Change the two constants**

In `src/renderer/src/sim/tactical/tuning.ts`:
```ts
export const HUNTER_HULL = 95;   // UI round spec §1.1 (owner 2026-11-19 "Hunter should have less health"): was 123
```
```ts
export const VALKYRN_THRUST = 200;                 // u/s²; UI round spec §1.2 (owner: "Valkyrn needs to be faster"): was 160, +25% acceleration and top speed
```
Keep any doc comment above each line. Append to it: `UI round (SIM 64 → 65): <old> → <new>.`

- [ ] **Step 4: Update the pins**

`tests/valkyrnClasses.test.ts`:
- line 41's title: `thrust 160` → `thrust 200`
- line 42: `.toEqual([53, 160, 200])` → `.toEqual([53, 200, 200])`, with the comment `// UI round §1.2: thrust 160 -> 200. W-1: duel hull ×1.75 …` (keep the old comment's rest)
- lines 43 and 45: `thrust: 160` → `thrust: 200`

`tests/duelReadout.test.ts:26`: in the comment, `HUNTER_HULL 123` → `HUNTER_HULL 95, UI round; 123 before`.

Run: `git grep -n "123" -- tests | grep -i "hunter\|hull"` and fix any other literal `123` that means the Hunter's hull the same way. Read every hit; a seed or a tick that happens to be 123 is not one.

- [ ] **Step 5: Run the targeted tests**

Run: `npx vitest run tests/uiRoundBalance.test.ts tests/valkyrnClasses.test.ts tests/tacticalSlots.test.ts tests/tacticalContacts.test.ts tests/duelReadout.test.ts tests/crewFlight.test.ts`
Expected: all PASS. If `tacticalSlots.test.ts:88` (a played run's hulls, `[52, HUNTER_HULL - 1]`) fails on its crew value, it is a whole-run pin: leave it for Task 8's re-picks and list it in the report under "Task 8 re-picks".

Run: `npm run typecheck` (clean).

- [ ] **Step 6: The gate numbers after**

Run: `npx tsx scripts/duel-telemetry.ts` and `npx tsx scripts/valkyrn-telemetry.ts`
Copy both outputs verbatim into the report under `## Task 2: balance`, beside Task 1's. The balance gates in `tests/duelGates.test.ts` (the 180 to 300 s median) are `it.skip` today. A shorter median is the expected result of this change and does not block. Note the change in one line (for example "duel median 231.4 s → 188.0 s").

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/tactical/tuning.ts tests/uiRoundBalance.test.ts tests/valkyrnClasses.test.ts tests/duelReadout.test.ts docs/superpowers/research/2026-11-20-ui-round-1-report.md
git commit -m "feat(ui-round-1): Hunter hull 123 -> 95, Valkyrn thrust 160 -> 200 (top speed +25%)" -m "Spec §1.1, §1.2. Gameplay change at SIM_VERSION 64; blessed in Task 8, bumped in Task 9." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The grid is off by default

**Files:**
- Modify: `src/renderer/src/render/tactical/mapGrid.ts:1-8`
- Modify: `src/renderer/src/render/tactical/tacticalModel.ts:283-301` (`gridDraw`), `:668` (its call)
- Modify: `src/renderer/src/app/settingsStore.ts`
- Modify: `tests/settingsAndControls.test.ts:13-34`, `tests/uiMenuState.test.ts:110,114`, `tests/shipPicker.test.tsx:71`
- Test: `tests/mapGridOff.test.ts` (create)

**Interfaces:**
- Produces: `MAP_GRID_SETTINGS = ['off', 'gravity', 'square']`, `DEFAULT_MAP_GRID = 'off'`, `Settings.version: 3`. Task 7 adds `fpsCounter` to the same record.

- [ ] **Step 1: Write the failing test**

`tests/mapGridOff.test.ts`:
```ts
// UI round spec §1.3: the 'off' grid draws no lines but keeps the square names; it is the default; a version 2 settings
// record (the old default 'gravity' was saved on every first save) reads 'off'.
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_GRID, MAP_GRID_LABELS, MAP_GRID_SETTINGS, validMapGrid } from '../src/renderer/src/render/tactical/mapGrid';
import { DEFAULT_SETTINGS, loadSettings, SETTINGS_KEY } from '../src/renderer/src/app/settingsStore';
import { createCamera } from '../src/renderer/src/render/tactical/camera';
import { tacticalModel } from '../src/renderer/src/render/tactical/tacticalModel';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';

const mem = (raw: string) => { const m = new Map([[SETTINGS_KEY, raw]]); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const model = (mapGrid: 'off' | 'gravity' | 'square') => {
  const st = createTacticalState(1);
  return tacticalModel({ state: st, prev: null, alpha: 1, camera: createCamera(0, 0, 0.5), viewport: { w: 1280, h: 720 }, console: 'helm', axes: { turn: 0, thrust: 0 }, ships: [0], paused: false, reserveRight: 0, mapGrid });
};

describe('the off grid (spec §1.3)', () => {
  it('is a setting, the default, and labelled Off', () => {
    expect(MAP_GRID_SETTINGS).toEqual(['off', 'gravity', 'square']);
    expect(DEFAULT_MAP_GRID).toBe('off');
    expect(MAP_GRID_LABELS.off).toBe('Off');
    expect(validMapGrid('off')).toBe(true);
  });
  it('draws no lines or curves, but keeps the column and row names', () => {
    const g = model('off').grid;
    expect(g.lines).toEqual([]);
    expect(g.curves).toBeUndefined();
    expect(g.columns.length).toBeGreaterThan(0);
    expect(g.rows.length).toBeGreaterThan(0);
    expect(model('square').grid.lines.length).toBeGreaterThan(0);
    expect(model('gravity').grid.curves!.length).toBeGreaterThan(0);
  });
  it('settings: version 3; a version 2 record keeps its fields but reads the grid off; a version 3 record keeps its grid', () => {
    expect(DEFAULT_SETTINGS.version).toBe(3);
    expect(DEFAULT_SETTINGS.mapGrid).toBe('off');
    const v2 = loadSettings(mem('{"version":2,"master":0.25,"music":1,"effects":0.5,"shake":"low","mapGrid":"gravity","throttleTapMs":250}'));
    expect(v2).toMatchObject({ version: 3, master: 0.25, music: 1, effects: 0.5, shake: 'low', mapGrid: 'off', throttleTapMs: 250 });
    expect(loadSettings(mem('{"version":3,"master":1,"music":1,"effects":1,"mapGrid":"square"}')).mapGrid).toBe('square');
    expect(loadSettings(mem('{"version":3,"master":1,"music":1,"effects":1,"mapGrid":"round"}')).mapGrid).toBe('off');
  });
});
```
If `createCamera` lives elsewhere, find it with `git grep -n "export function createCamera" -- src` and fix the import. If `TacticalModelInput` needs more fields, copy the minimum from `tests/tacticalModel.test.ts`'s `input` helper (it uses the same call).

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/mapGridOff.test.ts`
Expected: FAIL (`'off'` is not a setting yet).

- [ ] **Step 3: The grid setting**

`src/renderer/src/render/tactical/mapGrid.ts` lines 1-8 become:
```ts
// The console map's grid (owner 2026-11-19): 'gravity' bends the grid toward the planet, like a rubber sheet seen from
// above; 'square' is the plain lettered grid; 'off' (UI round spec §1.3, the default) draws no lines, only the squares'
// names. Saved with the volumes (app/settingsStore.ts) and read by the duel scene each frame through the renderer.
// Drawing only: ships, rocks, contours and the squares' names keep their true places.
export const MAP_GRID_SETTINGS = ['off', 'gravity', 'square'] as const;
export type MapGridSetting = (typeof MAP_GRID_SETTINGS)[number];
export const DEFAULT_MAP_GRID: MapGridSetting = 'off';
export const MAP_GRID_LABELS: Readonly<Record<MapGridSetting, string>> = { off: 'Off', gravity: 'Gravity well', square: 'Square' };
export function validMapGrid(v: unknown): v is MapGridSetting { return typeof v === 'string' && (MAP_GRID_SETTINGS as readonly string[]).includes(v); }
```

- [ ] **Step 4: gridDraw draws no lines for 'off'**

In `tacticalModel.ts`, give `gridDraw` a fifth parameter and guard the straight lines:
```ts
function gridDraw(cam: Camera, vp: Viewport, well: Point | null, dents: readonly Dent[] = [], drawLines = true): GridDraw {
```
```ts
  const curves = well ? wellCurves(cam, vp, well, spacing / WELL_DENSITY, dents) : undefined;
  if (!well && drawLines) {
```
(the two `for` loops inside stay as they are). At the call (line 668):
```ts
    grid: gridDraw(cam, vp, input.mapGrid === 'gravity' ? map.planet : null, dents, input.mapGrid !== 'off'), contours, edge, planet, asteroids, ships, helm, arrows,
```
Update the `mapGrid?` doc comment at line 196: `/** The grid's style (Settings, mapGrid.ts); absent: the square grid; 'off': no lines, the names only. */`

- [ ] **Step 5: Settings record version 3**

In `src/renderer/src/app/settingsStore.ts`:
- The doc comment above `Settings`: change `a record without it reads the gravity grid` to `a version 2 record (written with the old default, 'gravity') or a record without it reads DEFAULT_MAP_GRID ('off'); UI round spec §1.3 made the record version 3 for this`.
- `export interface Settings extends Volumes { version: 3; … }`
- `DEFAULT_SETTINGS = { version: 3, … }` (everything else unchanged; `mapGrid: DEFAULT_MAP_GRID` is now `'off'`).
- `loadSettings`:
```ts
    if (r.version === 1) return { ...DEFAULT_SETTINGS, master: step(r.volume, DEFAULT_SETTINGS.master) };
    if (r.version !== 2 && r.version !== 3) return { ...DEFAULT_SETTINGS };
    return { version: 3, master: step(r.master, DEFAULT_SETTINGS.master), music: step(r.music, DEFAULT_SETTINGS.music), effects: step(r.effects, DEFAULT_SETTINGS.effects),
      shake: validShake(r.shake) ? r.shake : DEFAULT_SETTINGS.shake,
      soloShip: isSoloShipId(r.soloShip) ? r.soloShip : DEFAULT_SETTINGS.soloShip, valkyrnLaserFit: r.valkyrnLaserFit === true,
      mapGrid: r.version === 3 && validMapGrid(r.mapGrid) ? r.mapGrid : DEFAULT_SETTINGS.mapGrid,   // UI round §1.3: a v2 record's grid was the old default
      throttleTapMs: typeof r.throttleTapMs === 'number' && THROTTLE_TAP_STEPS.includes(r.throttleTapMs) ? r.throttleTapMs : DEFAULT_THROTTLE_TAP_MS };   // helm round 2 §6.3
```

- [ ] **Step 6: Update the existing pins**

`tests/settingsAndControls.test.ts`:
- line 14: `{ version: 3, master: 1, music: 0.5, effects: 1, shake: 'full', soloShip: 'hound', valkyrnLaserFit: false, mapGrid: 'off', throttleTapMs: 200 }`
- line 15: save and expect `version: 3` (keep `mapGrid: 'gravity'`: a v3 record keeps it)
- line 16: replace the `'{"version":3,"master":0}'` entry with `'{"version":4,"master":0}'` (v3 is now valid)
- line 18: expect `version: 3` and `mapGrid: 'off'` (it reads a v2 record)
- lines 21 and 22: write `"version":3` in both records; line 21 expects `'off'`, with the comment `// the off grid is the default (UI round §1.3)`. Add after line 22:
  `map.set(SETTINGS_KEY, '{"version":2,"master":1,"music":1,"effects":1,"mapGrid":"square"}'); expect(loadSettings(storage).mapGrid).toBe('off');   // UI round §1.3: a v2 record's grid resets`
- line 32: expect `version: 3` and `mapGrid: 'off'`

`tests/uiMenuState.test.ts:110,114`: `mapGrid: 'gravity'` → `mapGrid: 'off'`.
`tests/shipPicker.test.tsx:71`: `version: 2` → `version: 3`.

Run: `git grep -n "mapGrid: 'gravity'\|version: 2, master" -- tests` and update any other full `Settings` or settings-slice literal that means the default.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/mapGridOff.test.ts tests/settingsAndControls.test.ts tests/uiMenuState.test.ts tests/shipPicker.test.tsx tests/tacticalModel.test.ts`
Expected: all PASS. Then `npm run typecheck`: clean. The Settings select lists Off first by itself, since it maps `MAP_GRID_SETTINGS`.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/render/tactical/mapGrid.ts src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/app/settingsStore.ts tests/mapGridOff.test.ts tests/settingsAndControls.test.ts tests/uiMenuState.test.ts tests/shipPicker.test.tsx
git commit -m "feat(ui-round-1): the map grid's Off style, the default; settings record v3 resets a v2 record's grid" -m "Spec §1.3." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: No torpedo range ring, no rock picking

**Files:**
- Modify: `src/renderer/src/render/tactical/weaponsModel.ts:75-79` (the field), `:190-192` (its build), `:329` (its return)
- Modify: `src/renderer/src/render/tactical/tacticalLayer.ts:295-297`
- Modify: `src/renderer/src/app/duel/scene.ts:172-176` (`rockHoverAt`), `:294-297`, `:431-433`, `:443`
- Modify: `src/renderer/src/ui/duel/WeaponsStation.tsx:146`, `:211`, `:263`; `src/renderer/src/render/duel/sitModel.ts:19`
- Modify tests: `tests/duelWeaponsView.test.ts:65-71`, `tests/crtColours.test.ts:42`, `tests/valkyrnViews.test.ts:93`, `tests/engineeringFog.test.ts:34,213-214`, `tests/rockTargetUi.test.tsx:55-62`, `tests/feelPresentation.test.ts:206`, `tests/feelUi.test.tsx:49`, `tests/w4Ui.test.tsx:95,228-229`
- Test: `tests/noRockPick.test.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `CombatDraw` has no `torpedoRange`. `WEAPONS_HINT === 'CLICK A WEAPON, THEN A ROOM'`. `rockHoverAt` is deleted. `pickRock` (tacticalModel) and the contact controller's `pickRock` stay exported and unused by the app; `rockTargetModel.test.ts` still covers them.

- [ ] **Step 1: Write the failing test**

`tests/noRockPick.test.ts`:
```ts
// UI round spec §1.4: no torpedo range ring, no rock picked or hovered from the map, hints that name rooms only.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIT_CARDS } from '../src/renderer/src/render/duel/sitModel';
import { WEAPONS_HINT } from '../src/renderer/src/ui/duel/WeaponsStation';

describe('no rock picking (spec §1.4)', () => {
  it('the hints name rooms only', () => {
    expect(WEAPONS_HINT).toBe('CLICK A WEAPON, THEN A ROOM');
    expect(SIT_CARDS.weapons.title).toBe('WEAPONS: CLICK A WEAPON, THEN A ROOM');
  });
  it('the scene neither picks nor hovers a rock, and the layer draws no torpedo range ring', () => {
    const scene = readFileSync('src/renderer/src/app/duel/scene.ts', 'utf8');
    expect(scene).not.toMatch(/pickRock\(/);
    expect(scene).not.toMatch(/rockHover/);
    const layer = readFileSync('src/renderer/src/render/tactical/tacticalLayer.ts', 'utf8');
    expect(layer).not.toMatch(/torpedoRange/);
    expect(readFileSync('src/renderer/src/render/tactical/weaponsModel.ts', 'utf8')).not.toMatch(/torpedoRange/);
  });
});
```
(The source checks are a fence. The behaviour checks are the updated `duelWeaponsView` and `crtColours` cases in Step 5.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/noRockPick.test.ts`
Expected: FAIL on the hint text and the scene's `pickRock(`.

- [ ] **Step 3: Remove the torpedo range ring**

`weaponsModel.ts`:
- In the `CombatDraw` interface (lines 75-79), delete the `torpedoRange?: RangeDraw | null;` line and drop `and \`torpedoRange\` (weapons update spec §2)` from its doc comment. If `RangeDraw` is then unused, delete its type too (`git grep -n "RangeDraw" -- src tests`).
- Delete lines 191-192 (the `const torpedoRange …` statement). Keep `const inRange = torpedoInRange(state, 0);` on line 190 only if something else below reads `inRange` (it does: `weaponsInfoText(…, inRange)` at line 207). Keep it.
- Line 329: remove `torpedoRange, ` from the returned object.
- If `MISSILE_RANGE` is now unused in this file, remove it from the imports.

`tacticalLayer.ts`: delete lines 295-297 (the comment and the two `tr` lines).

- [ ] **Step 4: Remove rock picking and the rock hint**

`scene.ts`:
- Delete `rockHoverAt` and its doc comment (lines 172-176).
- Lines 294-297 become:
```ts
        // UI round spec §1.4: a ship contact under the pointer, or none; rocks are not picked from the map.
        const at = { state: d.tactical, prev: source.prev, alpha, camera: cam!, viewport, fog: fogView };
        contact.click(pickContact(at, click));
```
- Delete lines 431-433 (the hover comment, `point`, `pickAt` and `hoverRock`), and line 443 (`rockHover: …`).
- Remove `pickRock` from the `tacticalModel` import on line 34 if nothing else uses it.

`WeaponsStation.tsx`:
- line 146: `export const WEAPONS_HINT = 'CLICK A WEAPON, THEN A ROOM';`
- delete lines 211 and 263 (the two `ROCKS` tallies). Update the file's header comment line 16 to: `// Spike ii: TGT ROCK on a card with a rock target. UI round §1.4: no rock in the hint, no ROCKS tally.`
- Run `git grep -n "rocks" -- src/renderer/src/ui/duel/WeaponsStation.tsx src/renderer/src/render/duel/consoleModel.ts`. If `weapons.rocks` is now read nowhere, delete the field from the view model and its producer.

`sitModel.ts:19`: `title: 'WEAPONS: CLICK A WEAPON, THEN A ROOM'`.

- [ ] **Step 5: Update the tests that pinned these**

- `tests/duelWeaponsView.test.ts:65,69,71`: each `expect(x.torpedoRange).toEqual({…})` becomes `expect('torpedoRange' in x).toBe(false)`. Retitle the case `the torpedo range ring is gone (UI round §1.4)`.
- `tests/crtColours.test.ts:42`: delete the `torpedoRange` field from the fixture.
- `tests/valkyrnViews.test.ts:93`: `[c.helmArc, c.torpedoRange?.lit, c.gunSight === null]` → `[c.helmArc, c.gunSight === null]`, expecting `[null, false]`.
- `tests/engineeringFog.test.ts`: drop `rockHoverAt` from the import (line 34), and delete the two lines 213-214 and the `it` they sit in if it tests nothing else.
- `tests/rockTargetUi.test.tsx:55-62`: delete the `ROCKS 3` expectation. The hint expects `'CLICK A WEAPON, THEN A ROOM'`. The width check becomes `expect(x0 + textPx(WEAPONS_HINT, 1)).toBeLessThanOrEqual(right)`.
- `tests/feelPresentation.test.ts:206`, `tests/feelUi.test.tsx:49`: the new title and hint text.
- `tests/w4Ui.test.tsx:95,228`: `right - textPx('ROCKS 99', 1)` → `right`. Line 229's comment: `229 px` → the room left of the panel's right edge. Keep its asserted widths `[173, 218]`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/noRockPick.test.ts tests/duelWeaponsView.test.ts tests/crtColours.test.ts tests/valkyrnViews.test.ts tests/engineeringFog.test.ts tests/rockTargetUi.test.tsx tests/rockTargetModel.test.ts tests/feelPresentation.test.ts tests/feelUi.test.tsx tests/w4Ui.test.tsx`
Expected: all PASS. Then `git grep -l "torpedoRange\|rockHoverAt" -- src tests`: only `tests/noRockPick.test.ts`. `npm run typecheck`: clean.

- [ ] **Step 7: Commit**

```bash
git add -A src tests
git commit -m "feat(ui-round-1): no torpedo range ring; rocks are not picked or hovered from the map; hints name rooms only" -m "Spec §1.4. The sim's rockLock and rock rules are unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pause keeps the UI, one pause line

**Files:**
- Modify: `src/renderer/src/app/duel/scene.ts:112-128` (`consoleHidden`, `sceneUi`'s doc), `:260-262` (comment)
- Modify: `src/renderer/src/app/duel/contactController.ts:123` (comment only)
- Modify: `src/renderer/src/ui/duel/Banners.tsx`
- Modify: `src/renderer/src/app/duel/duelMode.ts:50`, `src/renderer/src/app/duel/flightMode.ts` (its `PAUSE_TEXT`)
- Modify: `tests/consoleHidden.test.ts`
- Test: `tests/pauseLine.test.tsx` (create)

**Interfaces:**
- Produces: `consoleHidden(d, overlay, running)` is true only on a decided round. `Banners` exports `PAUSE_Y = 66`, `PAUSE_H = 24`, `pauseLineBox(text): { x; y; w; h }`.

- [ ] **Step 1: Write the failing tests**

Replace the body of `tests/consoleHidden.test.ts`'s `it` with:
```ts
it('UI round §1.5: only a decided round hides the console; a pause, a banner or a stopped duel does not', () => {
  const d = createDuel(parseShip(cutter), 5);
  expect(consoleHidden(d, ov(), true)).toBe(false);
  expect(consoleHidden(d, ov({ banner: 'PAUSED' }), true)).toBe(false);
  expect(consoleHidden(d, ov({ layerPaused: true }), true)).toBe(false);
  expect(consoleHidden(d, ov(), false)).toBe(false);
  d.tactical.outcome = Outcome.CrewWins;
  expect(consoleHidden(d, ov(), true)).toBe(true);
  disposeDuel(d);
});
```
Update the file's first comment line to `// Artemis spec §6.1, UI round §1.5: no console on the end card; a pause keeps it.`

`tests/pauseLine.test.tsx`:
```ts
// UI round spec §1.5: the pause line sits at top centre on its panel, clear of the tab strip, the ship view's hull bar,
// the status table, the own ship window and the enemy window, for the longest local text.
import { describe, expect, it } from 'vitest';
import { INTERNAL_W } from '../src/shared/resolution';
import { PAUSE_H, PAUSE_Y, pauseLineBox } from '../src/renderer/src/ui/duel/Banners';
import { CONTACT, OWN_SHIP, STATUS, TABS, TABS_RIGHT } from '../src/renderer/src/render/duel/consoleLayout';
import { STATUS_Y, INFO_Y } from '../src/renderer/src/render/tactical/weaponsModel';

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const LONGEST = 'PAUSED   ESC: RESUME   F11: FULLSCREEN   M: MAIN MENU';

describe('the pause line (spec §1.5)', () => {
  it('is centred at y 66..90, below the map headline and info line', () => {
    const b = pauseLineBox(LONGEST);
    expect([b.y, b.h, PAUSE_Y, PAUSE_H]).toEqual([66, 24, 66, 24]);
    expect(b.x + b.w / 2).toBeCloseTo(INTERNAL_W / 2, 6);
    expect(b.y).toBeGreaterThan(INFO_Y + 16);
    expect(STATUS_Y).toBeLessThan(INFO_Y);
  });
  it('overlaps no panel', () => {
    const b = pauseLineBox(LONGEST);
    const tabs = { x: TABS.x, y: TABS.y, w: TABS_RIGHT - TABS.x, h: TABS.h };
    const hullBar = { x: 12, y: 48, w: 320, h: 70 };   // the ship view's hull bar and shield row (ShipHud's HUD block)
    for (const p of [tabs, hullBar, { ...STATUS, h: 400 }, OWN_SHIP, CONTACT]) expect(overlaps(b, p), JSON.stringify(p)).toBe(false);
  });
});
```
Before you run it, read `ShipHud.tsx` and `shipHudModel.ts` (`HUD`) for the hull bar's real box. Replace the literal `hullBar` with values computed from `HUD`, and keep the comment.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/consoleHidden.test.ts tests/pauseLine.test.tsx`
Expected: FAIL (`consoleHidden` still hides on a pause; `pauseLineBox` does not exist).

- [ ] **Step 3: consoleHidden**

`scene.ts` lines 112-116:
```ts
/** No console on the end card (Artemis spec §6.1). UI round spec §1.5: a pause (local or online, any reason) or a banner
 *  hides nothing, so the crew can pause and read the screen; gameplay input is still dropped while paused (the runtime
 *  drops presses and drains the contact requests; the online duel sends nothing unless its phase is running). */
export function consoleHidden(d: DuelState, _overlay: SceneOverlay, _running: boolean): boolean {
  return d.tactical.outcome !== Outcome.Running;
}
```
Keep the signature, so no caller changes. Update the comment at lines 260-261: `// Everything the console changes follows whether it is drawn (Artemis spec §6.1): a decided round falls back to the right-hand readout. UI round §1.5: a pause does not.`

`contactController.ts:123`: change the comment's `hidden, SHIP, paused, decided` to `hidden, SHIP, decided`. No code change: `shown` now stays true through a pause, so the window stays open.

Check the click paths in `scene.ts` that a pause now reaches. Each gameplay path that used to depend on `station` being null while paused must still be safe:
- `pewClick`, `triggerAt`, `reticlePointer`, the flight steer, the crew Helm steer and the torpedo steer all test `!overlay.layerPaused` (the local pause). Online, the requests they make are drained and dropped by `onlineDuel.ts:480` while the phase is not running.
- The map click into `contact.click(...)` opens or closes the window (UI state only). Allowed while paused.
- The right-click heading `aim` and the ping: add `&& source.running()` to their `if` conditions (lines 319 and 329), so a paused Helm neither previews a heading nor pings:
```ts
      if (aim && onMap && station === 'helm' && view === 'helm' && running && source.running() && !crewSeat) {
```
```ts
      if (pingAt && onMap && running && source.running()) {
```

- [ ] **Step 4: The pause line**

`Banners.tsx` becomes:
```tsx
// The pause line and the online notice. UI round spec §1.5: one pause line (the local pause, the online pause reasons,
// the flight view's pause) at top centre, native size, on a panel from y 66 to 90: under the map's headline (y 12) and
// info line (y 44), clear of the tab strip, the hull bar and the side panels. The notice keeps its place.
import { memo } from 'react';
import { INTERNAL_W } from '../../../../shared/resolution';
import { READOUT_COLUMN } from '../../render/duel/interiorModel';
import { FONT_NATIVE, FONT_SIZE, TEXT, textPx } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';
import type { Banners as BannerLines } from '../views';

const SIZE = FONT_SIZE * 1.5, PLAY_CX = (INTERNAL_W - READOUT_COLUMN) / 2;
export const PAUSE_Y = 66, PAUSE_H = 24, PAUSE_PAD = 12;
/** The pause line's panel for `text`, centred on the screen. */
export function pauseLineBox(text: string): { x: number; y: number; w: number; h: number } {
  const w = textPx(text, 1) + 2 * PAUSE_PAD;
  return { x: Math.round(INTERNAL_W / 2 - w / 2), y: PAUSE_Y, w, h: PAUSE_H };
}

/** On a CRT screen the text is `hot`. */
export const Banners = memo(function Banners({ banners, cx = PLAY_CX }: { banners: BannerLines; cx?: number }) {
  const TEXT_TINT = useCrt().crt ? CRT.hot : TEXT;
  const pause = banners.tactical ?? banners.interior, box = pause !== null ? pauseLineBox(pause) : null;
  return (
    <>
      {pause !== null && box && <>
        <Panel x={box.x} y={box.y} w={box.w} h={box.h} />
        <PixelText text={pause} x={INTERNAL_W / 2} y={box.y + box.h / 2} size={FONT_NATIVE} tint={TEXT_TINT} anchorX={0.5} anchorY={0.5} />
      </>}
      {banners.notice !== null && <PixelText text={banners.notice} x={cx} y={130} size={SIZE} tint={TEXT_TINT} anchorX={0.5} anchorY={0.5} />}
    </>
  );
});
```
`sceneUi` is unchanged: it still fills `interior` or `tactical`, and both draw at the one place. Update its doc comment (line 118) to `… (UI round §1.5: Banners draws either at the one pause line)`.

- [ ] **Step 5: The pause text names F11**

`duelMode.ts:50`:
```ts
  const exitHint = deps.onExit ? '   M: MAIN MENU' : '', pauseText = `PAUSED   ESC: RESUME   F11: FULLSCREEN${exitHint}`;   // UI round §1.5, §1.6
```
`flightMode.ts`: run `git grep -n "PAUSE_TEXT" -- src` and give it the same `F11: FULLSCREEN` (keep its other words). Run `git grep -n "PAUSED   ESC: RESUME" -- tests` and update each expected string.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/consoleHidden.test.ts tests/pauseLine.test.tsx tests/sceneUi.test.ts`, plus every file that `git grep -l "Banners\|consoleHidden\|PAUSED" -- tests` lists.
Expected: all PASS. A test that expected the console, the window or the HUD to be absent while paused now fails. That is the spec's change: rewrite it to expect them present, with the comment `// UI round §1.5: a pause keeps the UI`, and list it in the report under `## Task 5`.
Run: `npm run typecheck`: clean.

- [ ] **Step 7: Commit**

```bash
git add -A src tests docs/superpowers/research/2026-11-20-ui-round-1-report.md
git commit -m "feat(ui-round-1): a pause keeps the whole UI; one pause line at top centre names F11" -m "Spec §1.5." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: F11 toggles the browser's fullscreen

**Files:**
- Modify: `src/renderer/src/app/web/browserFullscreen.ts` (a `toggle()` and an F11 handler)
- Modify: `src/renderer/src/main.ts:120-126`
- Modify: `src/renderer/src/ui/menuState.ts:43-44`
- Test: `tests/browserFullscreen.test.ts` (extend: `git grep -l "createBrowserFullscreen" -- tests` finds it; create `tests/browserFullscreenF11.test.ts` if there is none)

**Interfaces:**
- Produces: `BrowserFullscreen.toggle(): Promise<boolean>`. `BrowserFullscreenDeps.window` gains an optional `preventF11?: boolean`. When it is true, `createBrowserFullscreen` handles F11 keydown by calling `e.preventDefault()` and `toggle()`.

- [ ] **Step 1: Write the failing test**

```ts
// UI round spec §1.6: in the browser F11 is the page's: preventDefault, then the Fullscreen API toggle.
import { describe, expect, it, vi } from 'vitest';
import { createBrowserFullscreen, type FullscreenDocument } from '../src/renderer/src/app/web/browserFullscreen';

function fakes() {
  let element: unknown = null; const listeners: ((e: { code: string; preventDefault?: () => void }) => void)[] = [];
  const doc: FullscreenDocument = {
    fullscreenEnabled: true, get fullscreenElement() { return element; },
    documentElement: { requestFullscreen: async () => { element = {}; } }, exitFullscreen: async () => { element = null; },
    addEventListener() {}, removeEventListener() {}
  };
  const win = { addEventListener: (_t: 'keydown', fn: (e: { code: string }) => void) => { listeners.push(fn); }, removeEventListener() {}, dispatchEscape() {}, preventF11: true };
  return { doc, win, press: (code: string) => { const e = { code, preventDefault: vi.fn() }; for (const l of listeners) l(e); return e; }, on: () => element !== null };
}

describe('F11 in the browser (spec §1.6)', () => {
  it('toggles fullscreen on and off and prevents the browser default', async () => {
    const f = fakes(), fs = createBrowserFullscreen({ document: f.doc, keyboard: undefined, window: f.win, matchRunning: () => false, now: () => 0 });
    const e = f.press('F11'); await Promise.resolve(); await Promise.resolve();
    expect(e.preventDefault).toHaveBeenCalled(); expect(f.on()).toBe(true);
    f.press('F11'); await Promise.resolve(); await Promise.resolve();
    expect(f.on()).toBe(false);
    expect(await fs.toggle()).toBe(true);
  });
  it('leaves F11 alone without preventF11, and other keys always', async () => {
    const f = fakes(); f.win.preventF11 = false;
    createBrowserFullscreen({ document: f.doc, keyboard: undefined, window: f.win, matchRunning: () => false, now: () => 0 });
    const e = f.press('F11'); await Promise.resolve();
    expect(e.preventDefault).not.toHaveBeenCalled(); expect(f.on()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/browserFullscreenF11.test.ts`
Expected: FAIL (`toggle` is not a function; F11 does nothing).

- [ ] **Step 3: Implement**

In `browserFullscreen.ts`:
- Widen the keydown event type in `FullscreenWindow` to `{ code: string; preventDefault?(): void }`, for both `addEventListener` and `removeEventListener`. Add `/** UI round §1.6: the page takes F11 (the web build). */ readonly preventF11?: boolean;` to `FullscreenWindow`.
- `BrowserFullscreen` gains `toggle(): Promise<boolean>`.
- In `createBrowserFullscreen`, the `keydown` handler becomes:
```ts
  let api: BrowserFullscreen;
  const keydown = (e: { code: string; preventDefault?(): void }): void => {
    if (e.code === 'Escape') lastEscapeAt = deps.now();
    if (e.code === 'F11' && deps.window.preventF11) { e.preventDefault?.(); void api.toggle().catch(() => {}); }   // UI round §1.6
  };
```
  Assign the returned object to `api` before you return it, and add `toggle() { return this.set(!isOn()); }` to it (or `toggle: () => api.set(!isOn())`).
- Update the file's header comment: append `UI round §1.6: with preventF11 the page takes F11 and toggles this path, so the Settings switch follows it.`

In `main.ts`'s `createBrowserFullscreen` call, add `preventF11: true` to the `window:` object literal (line 123).

`menuState.ts:43-44`:
```ts
/** Settings' fullscreen note in a browser: UI round §1.6 made F11 the page's, so the switch follows it. */
export const BROWSER_F11_TEXT = 'F11 also toggles fullscreen.';
```
Run `git grep -n "BROWSER_F11_TEXT\|own fullscreen" -- tests` and update the expected text.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/browserFullscreenF11.test.ts`, plus each file `git grep -l "createBrowserFullscreen\|BROWSER_F11_TEXT" -- tests` lists.
Expected: all PASS. `npm run typecheck`: clean.

- [ ] **Step 5: Commit**

```bash
git add -A src tests
git commit -m "feat(ui-round-1): F11 in the browser toggles the page's fullscreen (the Settings switch follows it)" -m "Spec §1.6. Electron's F11 is unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The FPS counter

**Files:**
- Create: `src/renderer/src/app/fpsMeter.ts`, `src/renderer/src/ui/FpsCounter.tsx`
- Modify: `src/renderer/src/app/settingsStore.ts` (`fpsCounter`), `src/renderer/src/ui/menuState.ts` (`SettingsSlice.fpsCounter`, `UiState.fps`), `src/renderer/src/ui/store.ts`, `src/renderer/src/ui/actions.ts`, `src/renderer/src/ui/UiRoot.tsx`, `src/renderer/src/ui/menu/Settings.tsx`, `src/renderer/src/main.ts`
- Modify tests: `tests/settingsAndControls.test.ts`, `tests/uiMenuState.test.ts` (the settings literals gain `fpsCounter: true`)
- Test: `tests/fpsCounter.test.tsx` (create)

**Interfaces:**
- Consumes: Task 3's `Settings` v3.
- Produces: `createFpsMeter(windowMs = 500): { frame(nowMs: number): number | null }`, which returns the whole fps on the first frame after each full window and null otherwise. `FPS_X = INTERNAL_W - 8`, `FPS_Y = 702`. `Settings.fpsCounter: boolean`, default true; a record without it reads true. `UiState.fps: number | null`. Action `setFpsCounter(on: boolean)`.

- [ ] **Step 1: Write the failing test**

`tests/fpsCounter.test.tsx`:
```tsx
// UI round spec §1.7: the FPS meter (whole frames per second over each half second), the setting, the readout's place.
import { describe, expect, it } from 'vitest';
import { createFpsMeter } from '../src/renderer/src/app/fpsMeter';
import { DEFAULT_SETTINGS, loadSettings, SETTINGS_KEY } from '../src/renderer/src/app/settingsStore';
import { FPS_X, FPS_Y } from '../src/renderer/src/ui/FpsCounter';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';
import { BY } from '../src/renderer/src/ui/duel/MapOverlay';

const mem = (raw: string) => { const m = new Map([[SETTINGS_KEY, raw]]); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe('the FPS counter (spec §1.7)', () => {
  it('counts frames per half second', () => {
    const m = createFpsMeter(500);
    expect(m.frame(0)).toBeNull();
    let out: number | null = null;
    for (let k = 1; k <= 30; k++) out = m.frame(k * (1000 / 60)) ?? out;   // 60 Hz for half a second
    expect(out).toBe(60);
    for (let k = 1; k <= 15; k++) out = m.frame(500 + k * (1000 / 30)) ?? out;   // then 30 Hz
    expect(out).toBe(30);
  });
  it('is on by default and saved', () => {
    expect(DEFAULT_SETTINGS.fpsCounter).toBe(true);
    expect(loadSettings(mem('{"version":3,"master":1,"music":1,"effects":1}')).fpsCounter).toBe(true);
    expect(loadSettings(mem('{"version":3,"master":1,"music":1,"effects":1,"fpsCounter":false}')).fpsCounter).toBe(false);
  });
  it('sits in the bottom-right corner, under the console scale bar label', () => {
    expect(FPS_X).toBe(INTERNAL_W - 8);
    expect(FPS_Y).toBe(702);
    expect(FPS_Y).toBeGreaterThan(BY + 8);   // the scale bar's label draws from BY - 8 for 16 px
    expect(FPS_Y + 16).toBeLessThanOrEqual(INTERNAL_H);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/fpsCounter.test.tsx`
Expected: FAIL (missing modules).

- [ ] **Step 3: The meter**

`src/renderer/src/app/fpsMeter.ts`:
```ts
// UI round spec §1.7: frames per second over each window (default half a second), whole numbers. frame() is called once
// per drawn frame with performance.now(); it returns the new reading when a window closes, else null.
export interface FpsMeter { frame(nowMs: number): number | null }
export function createFpsMeter(windowMs = 500): FpsMeter {
  let start: number | null = null, frames = 0;
  return {
    frame(now) {
      if (start === null) { start = now; frames = 0; return null; }
      frames++;
      const span = now - start;
      if (span < windowMs - 1e-6) return null;
      const fps = Math.round((frames * 1000) / span);
      start = now; frames = 0;
      return fps;
    }
  };
}
```

- [ ] **Step 4: The setting**

`settingsStore.ts`:
- `Settings` gains `fpsCounter: boolean`, and `DEFAULT_SETTINGS` gains `fpsCounter: true`. Add to the doc comment: `\`fpsCounter\` (UI round §1.7): the FPS readout; a record without it reads on.`
- In `loadSettings`'s v2/v3 return, add `fpsCounter: r.fpsCounter !== false,`.

`menuState.ts`: `SettingsSlice` gains `fpsCounter: boolean;`, and `UiState` gains:
```ts
  /** UI round §1.7: the last FPS reading (main.ts's meter, at most twice a second); null before the first. */
  fps: number | null;
```
`store.ts`: `UiStoreInit.settings` gains `fpsCounter?: boolean`. Both settings defaults (lines 21-22) gain `fpsCounter: true`. The initial state (line 25) gains `fps: null`.
`actions.ts`: the deps interface gains `/** UI round §1.7: the FPS counter setting changed (main saves it). */ setFpsCounter?(on: boolean): void;`, and the actions gain:
```ts
    setFpsCounter(on: boolean): void { store.setState((s) => ({ settings: { ...s.settings, fpsCounter: on } })); deps.setFpsCounter?.(on); },
```
`Settings.tsx`, after the Valkyrn checkbox label:
```tsx
      <label>
        <input type="checkbox" data-testid="fps-counter" aria-label="FPS counter" checked={settings.fpsCounter} disabled={!settings.available}
          onChange={(e) => actions.setFpsCounter(e.target.checked)} />
        FPS counter
      </label>
```

- [ ] **Step 5: The readout**

`src/renderer/src/ui/FpsCounter.tsx`:
```tsx
// UI round spec §1.7: the FPS readout, bottom right, native size, dim, in every view and over the menu (its own layer at
// z 30, the stage's offsets). Hidden by the Settings switch, and until the first reading.
import { memo } from 'react';
import { INTERNAL_W } from '../../../shared/resolution';
import { DIM, FONT_NATIVE } from '../render/theme';
import { useUi } from './context';
import { PixelText } from './stage/PixelText';

export const FPS_X = INTERNAL_W - 8, FPS_Y = 702;

export const FpsCounter = memo(function FpsCounter() {
  const on = useUi((s) => s.settings.fpsCounter), fps = useUi((s) => s.fps);
  const top = useUi((s) => s.layout.stripHeight), dpr = useUi((s) => s.layout.dpr);
  if (!on || fps === null) return null;
  return (
    <div data-ui-fps="" style={{ position: 'fixed', left: 0, right: 0, top: Math.round(top * dpr) / dpr, bottom: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 30 }}>
      <PixelText text={`${fps} FPS`} x={FPS_X} y={FPS_Y} size={FONT_NATIVE} tint={DIM} anchorX={1} />
    </div>
  );
});
```
`UiRoot.tsx`: import it and render `<FpsCounter />` as the last child of the fragment.

`main.ts`:
- Import `createFpsMeter` from `./app/fpsMeter`.
- In `createUiStore`'s settings (line 127), add `fpsCounter: settings.fpsCounter`.
- In `createUiActions`' deps, add `setFpsCounter(fpsCounter) { settings = { ...settings, fpsCounter }; try { saveSettings(localStorage, settings); } catch { /* storage denied */ } },`.
- After the two `renderer.app.ticker.add` lines (210-211):
```ts
  const fpsMeter = createFpsMeter();   // UI round §1.7
  renderer.app.ticker.add(() => { const v = fpsMeter.frame(performance.now()); if (v !== null && store.getState().fps !== v) store.setState({ fps: v }); });
```

- [ ] **Step 6: Update the settings literals**

`tests/settingsAndControls.test.ts` and `tests/uiMenuState.test.ts`: add `fpsCounter: true` to every full settings object literal that Task 3 left (lines 14, 15, 18, 32 and the two at 110 and 114). Run `git grep -n "throttleTapMs: 200 }" -- tests` to find any left over.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/fpsCounter.test.tsx tests/settingsAndControls.test.ts tests/uiMenuState.test.ts tests/shipPicker.test.tsx tests/mapGridOff.test.ts`
Expected: all PASS. `npm run typecheck`: clean.

- [ ] **Step 8: Commit**

```bash
git add -A src tests
git commit -m "feat(ui-round-1): an FPS counter in the bottom-right corner, on by default, with its Settings switch" -m "Spec §1.7." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Same-version bless at 64, the re-picks and the full verification

**Files:**
- Regenerated by `npm run bless` (same version 64): `tests/golden/basic.json` (its content digest only), `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`. `tests/fixtures/determinism-v2.json` must come out unchanged.
- Modify: each whole-run pin now red (the report's "Task 8 re-picks")
- Modify (only if Step 6 needs it): `scripts/network/duel-app-smoke.ts`, `scripts/network/internet-app-smoke.ts`
- Modify: the report

**Interfaces:**
- Consumes: Tasks 2-7; Task 1's canonical baseline.
- Produces: `UR1_BLESS`, the commit Task 9 records its baselines at.

- [ ] **Step 1: Pre-flight**

Run: `git status --short -- src tests scripts; git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`
Expected: no status output; `SIM_VERSION = 64;`.

- [ ] **Step 2: The sector game is unchanged per tick**

Run: `npx tsx scripts/golden/canonical-trace.ts same`
Expected: identical at every tick to Task 1's baseline, exit 0. This branch changes no sector code. If it fails with a value difference, stop and find the task that touched a sector path. Never re-record the baseline. If the baseline is missing (a reboot cleared the temp folder), write "Task 8 canonical proof: not run (baseline lost)" in the report, skip Step 3's `golden` check, and rely on the `basic.json` diff.

- [ ] **Step 3: The same-version bless**

Run: `npm run bless`
Expected: exit 0, four `blessed …` lines. On `basic.json` only the content digest moves. `duel-1.json` and `duel-rematch.json` get new numbers (a weaker Hunter dies sooner). `determinism-v2.json` reads `sim version 64, … re-executed (unchanged)`. A refusal means an artifact is missing or at another version: stop and report.

Run: `git status --short tests/golden tests/fixtures`
Expected: `M` on `basic.json`, `duel-1.json` and `duel-rematch.json` only.

Run: `npx tsx scripts/golden/canonical-trace.ts golden`
Expected: `tests/golden/basic.json: <k> leaves differ, 0 outside version, digest and hashes`, exit 0.

Run: `npx vitest run tests/blessGuard.test.ts tests/golden.test.ts tests/duelGolden.test.ts tests/duelRematchGolden.test.ts`
Expected: all PASS.

- [ ] **Step 4: The re-picks**

Run: `npx vitest run tests/duelCheckpoint.test.ts tests/duelSnapshot.test.ts tests/duelModules.test.ts tests/tacticalSlots.test.ts tests/duelScripted.test.ts tests/duelOracle.test.ts tests/duelGates.test.ts tests/valkyrnIdentity.test.ts tests/w4HunterIdentity.test.ts tests/valkyrnRoundsRocks.test.ts tests/pewHunter.test.ts tests/torpedoGuidance.test.ts`
For each red pin whose subject is a whole played run, take the new value from the failure and set it with `// UI round (SIM 64), Hunter 95 / Valkyrn thrust 200: was <old>`. A seed or tick that its own comment says was chosen for a property is re-searched by that property, as the comment describes. A red test that is **not** a whole-run pin (it checks a rule, not a run's numbers) is a real failure: stop and find the cause. List every re-pick in the report.

Run the same command again. Expected: all PASS.

- [ ] **Step 5: The full verification**

Run, one at a time:
- `npm run typecheck`: no errors.
- `npx electron-vite build`: succeeds.
- `npx vitest run --maxWorkers=4`: every file PASS (re-run a load-sensitive timeout alone).
- `npm run test:determinism`: PASS on Node, Electron and Firefox. Then `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability` and check that `git status --short .superpowers/sdd` prints nothing.

- [ ] **Step 6: The duel app smoke**

Run: `npm run test:duel-app-runtime`
Expected: it passes and prints the `ACTUAL DUEL APP` line. If its forced round end times out because `DUEL_TEST_SEED`'s round is no longer decided in its window, re-pick the seed with the search in `docs/superpowers/plans/2026-11-20-helm-round2.md` Task 14 Step 7 (copy its script, run it, delete it). Set the constant in both smoke scripts with a `UI round (SIM 64): <old> -> <seed>, decided on tick <t>` note, and re-run.

- [ ] **Step 7: The report and commit**

Add `## Task 8` to the report: the Step 2 line, the four bless lines, every re-pick with its file and old value, the test count, the determinism line, and whether `DUEL_TEST_SEED` moved.

```bash
git add tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json docs/superpowers/research/2026-11-20-ui-round-1-report.md <each re-picked test> <the smoke scripts if the seed moved>
git commit -m "test(ui-round-1): same-version bless at SIM_VERSION 64 (duel goldens re-recorded; basic.json content digest only); the re-picks" -m "<the four bless lines>; <the re-picks, one per line>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Run: `git rev-parse --short=8 HEAD`. This is `UR1_BLESS`.

---

### Task 9: SIM_VERSION 64 → 65 alone, proved and blessed

**Files:**
- Modify: `src/renderer/src/sim/tuning.ts:7`
- Regenerated by `npm run bless`: the four golden and fixture files

**Interfaces:**
- Consumes: `UR1_BLESS`.
- Produces: the branch at SIM_VERSION 65.

- [ ] **Step 1: Pre-flight**

Run: `git rev-parse --short=8 HEAD; git status --short -- src tests scripts`
Expected: `UR1_BLESS`; no status output.

- [ ] **Step 2: Both baselines at `UR1_BLESS`**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 64: …`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version 64: <R> runs, <T> ticks, <F> named fields per tick; …`, exit 0. Note R, T and F. This branch adds no sim fields, so the bump needs no `ADDITIONS` or `MIGRATIONS` entry.

- [ ] **Step 3: The version**

`src/renderer/src/sim/tuning.ts` line 7 becomes `export const SIM_VERSION = 65;`. Nothing else changes in this task.

- [ ] **Step 4: Both proofs before the bless**

Run: `npx tsx scripts/golden/canonical-trace.ts check`
Expected: `per-tick canonical trace identical, sim version 64 → 65: … (baseline HEAD <UR1_BLESS>)`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts check`
Expected: `duel oracle: <R> runs, <T> ticks, <F> named fields, … identical at every tick field for field, sim version 64 → 65 (baseline HEAD <UR1_BLESS>)`, exit 0.

If a check refuses because its baseline is stale, set line 7 back to 64, re-run both Step 2 commands, set it to 65 again, and re-run both checks. Any other failure: stop and report.

- [ ] **Step 5: Bless and commit**

Run: `npm run bless`
Expected: exit 0, four `blessed …` lines with Task 8's counts and new hashes. The determinism line reads `sim version 64 → 65, … unchanged apart from the version and hashes`.

Run: `npx tsx scripts/golden/canonical-trace.ts golden` (`0 outside version, digest and hashes`) and `npx vitest run tests/blessGuard.test.ts tests/golden.test.ts tests/duelGolden.test.ts tests/duelRematchGolden.test.ts tests/duelSnapshot.test.ts tests/duelCheckpoint.test.ts` (all PASS).

Run: `git status --short -- src tests`
Expected: exactly five files: `tuning.ts` and the four generated ones.

```bash
git add src/renderer/src/sim/tuning.ts tests/golden/basic.json tests/golden/duel-1.json tests/golden/duel-rematch.json tests/fixtures/determinism-v2.json
git commit -m "chore(ui-round-1): SIM_VERSION 64 -> 65 alone, blessed (canonical trace and duel oracle prove every run unchanged per tick)" -m "<the four blessed lines>. Baselines recorded at <UR1_BLESS>: canonical trace …; duel oracle <R> runs, <T> ticks, <F> named fields per tick." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Screenshots, the gate entry and the close

**Files:**
- Create: `scripts/ui-round-1-shots.cjs`
- Modify: `docs/gates.md`, the report

**Interfaces:**
- Consumes: the built app (`npx electron-vite build`).
- Produces: PNGs in `C:\Users\djuar\FTLite-shots\ui-round-1\`.

- [ ] **Step 1: The shots script**

Follow the memory note "visual check method": `playwright-core` installed outside the repo, `_electron.launch` on `out/`. Copy the launch, the Single player start and the key helpers from the newest existing shots script (`ls -t scripts/*shots*.cjs | head -1`; for example `scripts/spike-asteroids-iii-shots.cjs`). The script saves these, each at a 1280×720 window:
1. `1-helm-grid-off.png`: sit at the Helm (the map with no grid lines, the square names kept, no torpedo ring).
2. `2-weapons-no-ring.png`: sit at Weapons; the hint reads `CLICK A WEAPON, THEN A ROOM`; no `ROCKS` tally; no dashed ring round the ship.
3. `3-weapons-paused.png`: Esc at Weapons. The console, the enemy window (open it with T first) and the status table stay, and the pause line sits at top centre.
4. `4-ship-paused.png`: Esc in the ship view. The hull bar and the pause line don't overlap.
5. `5-fps.png`: any view, cropped to the bottom-right 200×60. `NN FPS` sits below the scale bar.
6. `6-settings.png`: Settings, showing Map grid = Off and the FPS counter checkbox.

Run: `npx electron-vite build && node scripts/ui-round-1-shots.cjs`
Expected: six PNGs. Open each with the Read tool and check it against its line above. Fix and re-run until all six are right. Record each one's check in the report.

- [ ] **Step 2: The gate entry**

Append to `docs/gates.md`, in the format of the entries above it:
```markdown
## UI round Part 1 (quick fixes), SIM_VERSION 65

Spec: docs/superpowers/specs/2026-11-20-ui-round-design.md §1. Report: docs/superpowers/research/2026-11-20-ui-round-1-report.md.

- [x] Automated: suite, typecheck, determinism (Node, Electron, Firefox), canonical trace and duel oracle across 64 -> 65, duel app smoke.
- [x] Claude's screenshots (FTLite-shots/ui-round-1): grid off, no torpedo ring, rooms-only hint, pause keeps the UI, pause line clear of the hull bar, FPS corner, Settings.
- [ ] Owner playtest: the Hunter at 95 hull feels right; the Valkyrn feels fast enough; the pause line and the FPS counter read well; F11 in the browser.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/ui-round-1-shots.cjs docs/gates.md docs/superpowers/research/2026-11-20-ui-round-1-report.md
git commit -m "docs(ui-round-1): screenshots script and checks, the gate entry" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Hand off for review**

Run `git log --oneline UR1_BASE..HEAD` and `git diff --stat UR1_BASE..HEAD`. The branch is ready for the final review and the merge (superpowers:finishing-a-development-branch).
