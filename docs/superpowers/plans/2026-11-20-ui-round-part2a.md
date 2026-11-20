# UI Round Part 2a (One Screen per Job) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the info box and the zoom box, show the ship HUD (hull, shields, power, room state, health) on every view, and give each view only the rows that matter to it, at the fixed 1280×720 stage.

**Architecture:** The readout panel (`ReadoutPanel` and its model's row list) and the side column (`SideColumn`) are deleted. The duel view's `hud` slice is filled on every view and `ShipHud` mounts on every view. The console power strip goes, because the HUD's power panel replaces it. `consoleLayout.ts` gets the new rects (station blocks right of the power panel, the own ship window under the HUD, the enemy window in the top-right corner). Its rows' new homes are small additions to existing models: power column room state and a health row (`shipHudModel`), the Helm info line (`weaponsModel`), an `AWAY` label and empty-console blink (`interiorModel`/`interiorView`), and a ship-view torpedo banner (`Banners`).

**Tech Stack:** TypeScript, React + zustand (internal-pixel UI), Pixi, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-ui-round-design.md` §0, §2.2, §2.3, §2.4, §2.4a, §2.5. Part 2b (§2.1, filling the window) is a separate plan.

## Global Constraints

- **Rule:** each view shows only what matters to that view or mini-game. Two things are constant in every view: the hull/shield HUD (top left) and the power panel (bottom left).
- **No sim change.** SIM_VERSION stays **65**. No golden or fixture may change. `npm run bless` must not be run.
- Stage stays 1280×720 (`INTERNAL_W`, `INTERNAL_H`). Margins: `EDGE = 12`.
- Layout (spec §2.4a): HUD hull/shields x 12-330 y 46-114; health row y 124-150; power panel x 6-334 y 529-712; `STATION.x = 346`; `FLIGHT.x = 658`; `OWN_SHIP = { x: 12, y: 160, w: 240, h: 170 }`; `CONTACT = { x: 968, y: 42, w: 300, h: 420 }`; map top band 408-968; `CONSOLE_RESERVE = { left: 264, right: 12 }`; `CONTACT_RESERVE = 324`.
- The sit card always draws at the top: y 100 (y 156 when the online notice shows), centred on the map's top band (x 688).
- Kept: the mouse wheel and −/= zoom the map; C snaps back; the ship interior keeps its wheel zoom and drag pan.
- Copy: console strings upper case, as today.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (a subagent uses its own model's name).

## Working rules (read once)

- **Branch and worktree:** `ui-round-2a` in `C:\Users\djuar\FTLite\.worktrees\ui-round-2a`, from master. Every command runs from the worktree root in Git Bash. Other sessions use the main checkout and other worktrees: never touch them. Never use bare `git stash`.
- **Junctions** (PowerShell, once):
  ```powershell
  New-Item -ItemType Junction -Path C:\Users\djuar\FTLite\.worktrees\ui-round-2a\node_modules -Target C:\Users\djuar\FTLite\node_modules
  New-Item -ItemType Junction -Path C:\Users\djuar\FTLite\.worktrees\ui-round-2a\services\signalling\node_modules -Target C:\Users\djuar\FTLite\services\signalling\node_modules
  ```
- **Tests:** targeted `npx vitest run <files>`; `npm run typecheck`; the full suite `npx vitest run --maxWorkers=4` after `npx electron-vite build`. Never run two vitest processes at once. Load-sensitive files (`tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts`, `tests/gate-*.test.ts`, `tests/duelGates.test.ts`, `tests/power.test.ts`) are re-run alone before they count as failures.
- **Test churn rule.** Deleting the readout and the side column breaks many fixture-only tests. A fixture that only *supplies* `readout:` or `side:` loses the field. A test whose *subject* was the deleted thing (the readout's rows, the panel's positions, the zoom buttons) is deleted, or rewritten to pin the replacement named in its task. Never weaken a test that checks something still present. List every deleted or rewritten test in the report under its task.
- **Report:** `docs/superpowers/research/2026-11-20-ui-round-2a-report.md`.

## File map

| File | Change |
|---|---|
| Delete `src/renderer/src/ui/duel/ReadoutPanel.tsx`, `ui/duel/SideColumn.tsx`, `ui/duel/PowerStrip.tsx` | removed panels |
| Create `src/renderer/src/ui/duel/crtRowLook.ts` | `crtRowLook`, `CrtRowLook`, `INVERSE_*` (moved; WeaponsStation still uses them) |
| `src/renderer/src/render/duel/readoutModel.ts` | keeps `ReadoutRow`, `chargeRow`, `healthRow`, `crewStatus`, `level`, `HEALTH_LOW`; loses the row list, help, panel sizes |
| `src/renderer/src/render/duel/consoleLayout.ts` | the new rects; no `STATUS`, `SIDE`, `SIDE_H`, `POWER_STRIP` |
| `src/renderer/src/app/duel/flightPointer.ts` | blocks from the new rects; no status-row count |
| `src/renderer/src/app/duel/scene.ts` | no readout; `hud` every view; info band; reserves |
| `src/renderer/src/render/duel/consoleModel.ts` | no `side`, no `power`; Science `range` |
| `src/renderer/src/render/duel/shipHudModel.ts`, `ui/duel/ShipHud.tsx` | room state per column, health row |
| `src/renderer/src/ui/duel/DuelUi.tsx`, `ui/views.ts`, `ui/duel/MapOverlay.tsx`, `ui/duel/SitCard.tsx`, `ui/duel/Banners.tsx` | mounts, view type, snap hint, sit card place, torpedo banner |
| `src/renderer/src/render/tactical/weaponsModel.ts` | Helm info line |
| `src/renderer/src/render/duel/interiorModel.ts`, `interiorView.ts` | AWAY label, empty console blink, full-width band |

---

### Task 1: Worktree and base

**Files:** Create `docs/superpowers/research/2026-11-20-ui-round-2a-report.md`

- [ ] **Step 1:** `cd /c/Users/djuar/FTLite && git worktree add .worktrees/ui-round-2a -b ui-round-2a master`, then the junctions.
- [ ] **Step 2:** `git rev-parse --short=8 HEAD; git grep -n "export const SIM_VERSION = " -- src/renderer/src/sim/tuning.ts`. Expected: a hash (`U2A_BASE`) and `SIM_VERSION = 65;`.
- [ ] **Step 3:** One at a time: `npm run typecheck`, `npx electron-vite build`, `npx vitest run --maxWorkers=4`. Note the counts and any failure (re-run load-sensitive files alone).
- [ ] **Step 4:** Write the report (`# UI round Part 2a: report`, `## Task 1: base` with U2A_BASE, the SIM version and the suite counts) and commit: `git add docs/superpowers/research/2026-11-20-ui-round-2a-report.md && git commit -m "docs(ui-round-2a): base report" -m "Co-Authored-By: …"`.

---

### Task 2: The info box goes

**Files:**
- Delete: `src/renderer/src/ui/duel/ReadoutPanel.tsx`
- Create: `src/renderer/src/ui/duel/crtRowLook.ts`
- Modify: `ui/duel/WeaponsStation.tsx` (import), `ui/duel/DuelUi.tsx`, `ui/views.ts`, `app/duel/scene.ts`, `app/uiProbe.ts`, `render/duel/readoutModel.ts`, `render/duel/consoleLayout.ts:4,9`, `app/duel/flightPointer.ts`, `render/duel/interiorModel.ts:19-21`, `ui/duel/Banners.tsx:6,14`
- Tests: per the churn rule. Create `tests/noReadout.test.ts`.

**Interfaces:**
- Produces: `DuelUiView` has no `readout`. `onWeaponsMap(p, contactShown)` and `torpedoSteer({ pointer, torpedo, zoom, contactShown })` lose the status-row argument. `readoutModel.ts` exports only `ReadoutRow`, `chargeRow`, `healthRow`, `crewStatus`, `HEALTH_LOW` and `level` (as used today). `INTERIOR_BAND = { x: 0, y: 42, w: INTERNAL_W, h: INTERNAL_H - 42 }`. `READOUT_COLUMN`, `READOUT_W`, `READOUT_MARGIN`, `READOUT_ROWS`, `readoutRows`, `readoutHelp`, `readoutPanelHeight` and `statusPanelHeight` no longer exist. `STATUS` stays in consoleLayout for now as the literal `{ x: 12, y: 42, w: 204 }` (Task 3 removes it).

- [ ] **Step 1: The failing fence**

`tests/noReadout.test.ts`:
```ts
// UI round spec §2.2: the info box (readout panel) is gone from every view; its model keeps only the helpers other views use.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as readout from '../src/renderer/src/render/duel/readoutModel';
import { INTERIOR_BAND } from '../src/renderer/src/render/duel/interiorModel';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';

describe('no info box (spec §2.2)', () => {
  it('the panel and its row list are gone', () => {
    expect(existsSync('src/renderer/src/ui/duel/ReadoutPanel.tsx')).toBe(false);
    expect(Object.keys(readout).sort()).toEqual(['HEALTH_LOW', 'chargeRow', 'crewStatus', 'healthRow', 'level'].sort());
    expect(readFileSync('src/renderer/src/ui/views.ts', 'utf8')).not.toMatch(/readout:/);
    expect(readFileSync('src/renderer/src/app/duel/scene.ts', 'utf8')).not.toMatch(/readoutRows|readoutHelp|READOUT_COLUMN/);
  });
  it('the ship fills the whole width under the tab strip', () => {
    expect(INTERIOR_BAND).toEqual({ x: 0, y: 42, w: INTERNAL_W, h: INTERNAL_H - 42 });
  });
});
```
If `level` is not exported today, export it (it is the `OK` / `DMG n` / `OFFLINE` helper at readoutModel.ts:52; Task 4 uses it). If `healthRow` or `crewStatus` end up with no caller after this task, keep them anyway: Task 4 uses `healthRow`'s rule and Task 5 uses `crewStatus`.

- [ ] **Step 2:** `npx vitest run tests/noReadout.test.ts`. Expected: FAIL.

- [ ] **Step 3: Move crtRowLook out**

Create `src/renderer/src/ui/duel/crtRowLook.ts` holding `INVERSE_TOP`, `INVERSE_H`, `INVERSE_PAD`, `CrtRowLook` and `crtRowLook` exactly as they are in `ReadoutPanel.tsx` (lines 21-39, with their comments and imports: `ReadoutRow` from readoutModel, `ALERT_BLINK_HZ, blink, CRT` from crtTheme). Point `WeaponsStation.tsx`'s import at `./crtRowLook`. Then delete `ReadoutPanel.tsx`.

- [ ] **Step 4: Remove the readout from the view and the scene**

- `ui/views.ts`: delete `readout: { rows; help }` from `DuelUiView` and the `ReadoutRow` import if unused.
- `ui/duel/DuelUi.tsx`: delete the `ReadoutPanel` import and its line (42). Update the header comment: the readout sentence goes, and add `UI round §2.2: no info box.`
- `app/duel/scene.ts`: delete the `readout:` entry of `options.ui.frame({...})` (line ~461) and the `readoutRows`/`readoutHelp` imports. Replace each `readoutRows({...}).length` argument (lines ~283, 304, 310, 378) by removing the argument: `onWeaponsMap(click, contact?.state() != null)`, and `torpedoSteer({ pointer, torpedo, zoom, contactShown: shown })`. In the non-console map's reserves (line ~435), `{ reserveRight: READOUT_COLUMN }` becomes `{ reserveRight: EDGE }`, importing `EDGE` from consoleLayout. Remove the `READOUT_COLUMN` import.
- `app/duel/flightPointer.ts`: `onWeaponsMap(p, contactShown)` drops `statusRows` and the `status` rect. The status table is gone, so nothing replaces it here (Task 3 adds the HUD rects). `torpedoSteer`'s input type drops `statusRows`. Remove the `STATUS` and `statusPanelHeight` imports. Update both doc comments.
- `app/uiProbe.ts`: drop the `readout:` fixtures (lines ~25, 41).
- `render/duel/interiorModel.ts`: delete `READOUT_COLUMN` and make `INTERIOR_BAND`'s `w` be `INTERNAL_W`. Its comment becomes `/** The band the ship is fitted into: the whole screen below the console tab strip (UI round §2.2: no readout column). */`.
- `ui/duel/Banners.tsx`: `PLAY_CX = INTERNAL_W / 2` and drop the `READOUT_COLUMN` import.
- `render/duel/consoleLayout.ts`: drop the `READOUT_W` import; `STATUS = { x: 12, y: 42, w: 204 } as const` with the comment `// Task 3 of UI round 2a removes it`.
- `render/duel/readoutModel.ts`: delete `READOUT_MARGIN`, `READOUT_W`, `readoutRows`, `readoutHelp`, `READOUT_ROWS`, `readoutPanelHeight`, `statusPanelHeight`, `crewRows`, `INCOMING_RANGE` (Task 5 recreates its rule in situationModel), the row helpers only they used (`row`, `heading`, `em`, and so on, as typecheck shows), and the `READOUT_COLUMN` import. Keep `ReadoutRow`, `chargeRow`, `healthRow`, `crewStatus`, `level` and `HEALTH_LOW`, with the imports they need. Update the header comment: `UI round §2.2: the readout panel is gone; this keeps the row helpers the Weapons cards (chargeRow), the HUD (healthRow's rule, level) and the ship view (crewStatus) use.`

- [ ] **Step 5: Typecheck and the test churn**

Run `npm run typecheck` and fix every error by the churn rule. Then run the test files the survey lists (`git grep -l "readoutRows\|readoutHelp\|READOUT_\|ReadoutPanel\|crtRowLook\|statusPanelHeight\|readout:\|INTERIOR_BAND\|statusRows" -- tests`) and fix them:
- **Delete** the tests whose subject was the readout's rows or the panel: `tests/duelReadout.test.ts`, `tests/crtReadout.test.ts` (move its `crtRowLook` cases into a new `tests/crtRowLook.test.ts` importing from `ui/duel/crtRowLook`), the readout cases in `uiDuel.test.tsx`, `uiConsole.test.tsx` (`find('HULL')` at STATUS), `uiCrt.test.tsx` (the HUNTER inverse case), `duelHealthView.test.ts`, `duelFireView.test.ts`, `crewList.test.ts`, `scienceConsole.test.ts` (the status-table cases), `scienceSeat.test.ts` (`readoutHelp`), `engineeringFog.test.ts` and `sensorsBlipReadout.test.ts` (the ENEMY / BLIP rows), `duelConsoleModel.test.ts` (the `readoutRows` and `readoutHelp` cases; keep its `chargeRow` case), and `crtBezel.test.ts`'s readout rect. Delete only the cases, not whole files, where the file tests other things too. A case whose rule moves to a later task (health, AWAY, torpedo inbound, range/bearing) is deleted here, and the later task adds its own test.
- **Fixture-only** `readout:` fields: remove them (the list in the survey: `contactWindow`, `crewHelmUi`, `duelModeDispose`, `engineeringConsoleUi`, `engineeringWeaponsUi`, `feelIiUi`, `feelUi`, `manualLaserUi`, `manualTorpedoUi`, `onlineDuelSession`, `ownShipWindow`, `pewUi`, `rockTargetUi`, `scienceUi`, `targetingUi`, `uiShipHud`, `w4Ui`, `uiSinks`).
- **`onWeaponsMap` / `torpedoSteer` callers:** drop the row argument (`pewInput.test.ts`, `flightPointer.test.ts`). `pewInput.test.ts:60-62`'s status-table edge case is deleted.
- **INTERIOR_BAND width:** `duelInterior.test.ts:45` expects `INTERNAL_W`. Interior fit tests (`interiorCamera`, `interiorZoomScene`, `worldFit`, `lightsModel`, `shipHudModel`, `duelHealthView`) whose numbers move because the band is wider: recompute the expected values from the formula the test already uses, with a `// UI round §2.2: the band is the full width` note. Don't change what they assert.
- `audioDuel.test.ts` still pins `HEALTH_LOW` against readoutModel: it stays green.

- [ ] **Step 6:** Run `npx vitest run tests/noReadout.test.ts tests/crtRowLook.test.ts` plus every file you touched; all PASS; `npm run typecheck` clean. List the deleted and rewritten cases in the report under `## Task 2`.

- [ ] **Step 7: Commit**

`git add -A src tests docs/superpowers/research/2026-11-20-ui-round-2a-report.md && git commit -m "feat(ui-round-2a): the info box goes (readout panel and its row list); the ship fills the full width" -m "Spec §2.2. Rows get their new homes in Tasks 3-6." -m "Co-Authored-By: …"`

---

### Task 3: No zoom box, the HUD on every view, the new terminal layout

**Files:**
- Delete: `src/renderer/src/ui/duel/SideColumn.tsx`, `src/renderer/src/ui/duel/PowerStrip.tsx`
- Modify: `render/duel/consoleLayout.ts`, `app/duel/flightPointer.ts`, `render/duel/consoleModel.ts`, `render/duel/shipHudModel.ts` (delete `ConsolePowerStrip`, `powerStrip`), `ui/duel/DuelUi.tsx`, `ui/views.ts` (the `hud` doc), `app/duel/scene.ts`, `ui/duel/MapOverlay.tsx`, `ui/duel/SitCard.tsx`, `ui/duel/ScienceStation.tsx`, `app/uiProbe.ts`
- Tests: per the churn rule. Create `tests/terminalLayout.test.ts`.

**Interfaces:**
- Consumes: Task 2's `onWeaponsMap(p, contactShown)`.
- Produces (consoleLayout.ts): `EDGE`, `TABS`, `TABS_RIGHT`, `STATION` (x 346), `stationTop`, `PEW_ROW_H`, `CARD_PIPS_H`, `weaponCard`, `weaponPips`, `FLIGHT` (x 658), `flightCard`, `OWN_SHIP` (12, 160, 240, 170) with `OWN_SHIP_BOX`, `OWN_SHIP_X0`, `OWN_SHIP_RIGHT`, `OWN_SHIP_TITLE_Y`, `OWN_SHIP_STATUS_Y` derived as today, `CONTACT` (968, 42, 300, 420), `CONTACT_BOX`, `CONTACT_RESERVE` (324), `CONSOLE_RESERVE` ({ left: 264, right: 12 }), `INFO_BAND` ({ left: 408, right: 968 }), `STATUS_RESERVE` (44), `HUD_TOP` and `HUD_POWER` (the HUD's two clickable or occupied rects). No `STATUS`, `SIDE`, `SIDE_H`, `POWER_STRIP`, `stripTop`.
- `ConsoleView` has no `side` and no `power`. `ScienceView` (consoleModel's science panel) gains `range: number`. `DuelUiView.hud` is a `ShipHudView` on every view.

- [ ] **Step 1: The failing layout test**

`tests/terminalLayout.test.ts`:
```ts
// UI round spec §2.4a: the terminal layout at 1280x720: the HUD top left and bottom left, the station blocks right of the
// power panel, the own ship window under the HUD, the enemy window top right; nothing overlaps; the zoom box is gone.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';
import * as L from '../src/renderer/src/render/duel/consoleLayout';
import { HUD, hullSegX, powerPanel } from '../src/renderer/src/render/duel/shipHudModel';
import { pauseLineBox } from '../src/renderer/src/ui/duel/Banners';

type R = { x: number; y: number; w: number; h: number };
const overlaps = (a: R, b: R): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inStage = (r: R): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= INTERNAL_W && r.y + r.h <= INTERNAL_H;

describe('the terminal layout (spec §2.4a)', () => {
  it('has the agreed numbers', () => {
    const p = powerPanel();
    expect(p.x + p.w).toBe(334);
    expect(L.STATION.x).toBe(346);
    expect(L.FLIGHT.x).toBe(658);
    expect(L.OWN_SHIP).toEqual({ x: 12, y: 160, w: 240, h: 170 });
    expect(L.CONTACT).toEqual({ x: 968, y: 42, w: 300, h: 420 });
    expect(L.CONSOLE_RESERVE).toEqual({ left: 264, right: 12 });
    expect(L.CONTACT_RESERVE).toBe(324);
    expect(L.INFO_BAND).toEqual({ left: L.TABS_RIGHT, right: L.CONTACT.x });
    expect(hullSegX(19) + HUD.hull.segW).toBe(330);
    expect('SIDE' in L || 'STATUS' in L || 'POWER_STRIP' in L).toBe(false);
    expect(existsSync('src/renderer/src/ui/duel/SideColumn.tsx') || existsSync('src/renderer/src/ui/duel/PowerStrip.tsx')).toBe(false);
  });
  it('no two blocks overlap, and all sit on the stage, for every station', () => {
    const tabs = { x: L.TABS.x, y: L.TABS.y, w: L.TABS_RIGHT - L.TABS.x, h: L.TABS.h };
    const block = (s: 'helm' | 'weapons' | 'science'): R => ({ x: L.STATION.x, y: L.stationTop(s), w: L.STATION.w, h: L.STATION.h[s] });
    const pause = pauseLineBox('PAUSED   ESC: RESUME   F11: FULLSCREEN   M: MAIN MENU');
    for (const s of ['helm', 'weapons', 'science'] as const) {
      const rects: [string, R][] = [['tabs', tabs], ['hudTop', L.HUD_TOP], ['hudPower', L.HUD_POWER], ['block', block(s)], ['own', L.OWN_SHIP], ['contact', L.CONTACT], ['pause', pause],
        ...(s === 'helm' ? [['flight', L.FLIGHT] as [string, R]] : [])];
      for (const [n, r] of rects) expect(inStage(r), `${s} ${n}`).toBe(true);
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++)
        expect(overlaps(rects[i]![1], rects[j]![1]), `${s}: ${rects[i]![0]} x ${rects[j]![0]}`).toBe(false);
    }
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/terminalLayout.test.ts`. Expected: FAIL.

- [ ] **Step 3: consoleLayout.ts**

Rewrite the layout part of the file (keep `weaponCard`, `weaponPips`, `flightCard` and `stationTop` bodies as they are, since they derive from `STATION` and `FLIGHT`):
```ts
// The console layout at the fixed 1280×720 stage (spec 2026-11-17-artemis-consoles §2; UI round spec §2.4a: no status
// table and no side column; the ship HUD top left and bottom left on every view; the station blocks right of the HUD's
// power panel; the own ship window under the HUD; the enemy window in the top-right corner). Pure: shared by the
// components, the scene's map reserves, the pointer hit tests and the tests.
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { HUD, hullSegX, powerPanel } from './shipHudModel';

export const EDGE = 12;
export const TABS = { x: 12, y: 8, w: 96, gap: 4, h: 26 } as const;
export const TABS_RIGHT = TABS.x + 4 * TABS.w + 3 * TABS.gap;   // HELM, WEAPONS, SCIENCE, SHIP (Sci-1)
const PANEL = powerPanel();
/** UI round §2.4a: the HUD's top block (the hull bar, the shields row and the health row under them) and its power panel
 *  with the REACTOR line above it: never the map, and the console blocks keep clear of both. */
export const HUD_TOP = { x: HUD.x - 6, y: HUD.hull.labelY - 6, w: hullSegX(19) + HUD.hull.segW + 6 - (HUD.x - 6), h: 150 - (HUD.hull.labelY - 6) } as const;
export const HUD_POWER = { x: PANEL.x, y: PANEL.y - 30, w: PANEL.w, h: PANEL.h + 30 } as const;
export const STATION = { x: PANEL.x + PANEL.w + EDGE, w: 300, h: { helm: 200, weapons: 268, science: 96 } } as const;   // UI round §2.4a: right of the power panel (x 346)
```
Keep `stationTop`, `PEW_ROW_H`, `CARD_PIPS_H`, `weaponCard` and `weaponPips` as they are. Then:
```ts
export const FLIGHT = { x: STATION.x + STATION.w + EDGE, y: INTERNAL_H - EDGE - 166, w: 300, h: 166 } as const;
```
(`flightCard` unchanged.) Then:
```ts
/** UI round §2.4a: the own ship window under the HUD's top block (x 12 to 252, y 160 to 330). */
export const OWN_SHIP = { x: EDGE, y: 160, w: 240, h: 170 } as const;
export const OWN_SHIP_BOX = { x: OWN_SHIP.x + 8, y: OWN_SHIP.y + 40, w: OWN_SHIP.w - 16, h: OWN_SHIP.h - 48 } as const;
export const OWN_SHIP_X0 = OWN_SHIP.x + 8, OWN_SHIP_RIGHT = OWN_SHIP.x + OWN_SHIP.w - 8;
export const OWN_SHIP_TITLE_Y = OWN_SHIP.y + 4, OWN_SHIP_STATUS_Y = OWN_SHIP.y + 20;
/** The contact window (enemy ship window spec §4.1): UI round §2.4a: in the top-right corner, where the side column was. */
export const CONTACT = { x: INTERNAL_W - EDGE - 300, y: 42, w: 300, h: 420 } as const;
export const CONTACT_BOX = { x: CONTACT.x + 12, y: CONTACT.y + 60, w: 276, h: 200 } as const;
export const CONTACT_RESERVE = INTERNAL_W - CONTACT.x + EDGE;
/** The map's off-screen arrows and centre keep clear of the own ship window on the left and the stage edge on the right
 *  (CONTACT_RESERVE while the contact window shows). */
export const CONSOLE_RESERVE = { left: OWN_SHIP.x + OWN_SHIP.w + EDGE, right: EDGE } as const;
/** The map's top band (the status sentence and the info line): from the tab strip to the contact window's left edge. */
export const INFO_BAND = { left: TABS_RIGHT, right: CONTACT.x } as const;
export const STATUS_RESERVE = 44;
```
Delete `STATUS`, `SIDE`, `SIDE_H`, `POWER_STRIP` and `stripTop` and their comments. If importing `shipHudModel` here makes an import cycle that typecheck or a test reports, compute the panel's right edge from `HUD` alone (`powerColumnX(5) + colW + pad`), with the same values.

- [ ] **Step 4: The hit tests**

`app/duel/flightPointer.ts`: import `HUD_TOP`, `HUD_POWER` (not `SIDE`, `SIDE_H`). `BLOCKS` = `[TAB_STRIP, HUD_TOP, HUD_POWER, HELM_BLOCK, FLIGHT, OWN_SHIP]`. `WEAPONS_BLOCKS` = tab strip, `HUD_TOP`, `HUD_POWER`, the Weapons block, `OWN_SHIP`. `HELM_BLOCKS` = `[TAB_STRIP, HUD_TOP, HUD_POWER, HELM_BLOCK, OWN_SHIP]`. Update the three doc comments (the side column becomes "the HUD's two blocks").

- [ ] **Step 5: The models**

`render/duel/consoleModel.ts`:
- Delete `side` from `ConsoleView` (line ~96) and its build (lines ~191-193).
- Delete `power?` (line ~101) and the `own`/`powerStrip` lines (~195-196).
- The science panel (find the `science` field's type) gains `range: number` = `sensorRange(d.tactical.systems[CREW_SLOT]!)` (import from `sim/tactical/science`).

`render/duel/shipHudModel.ts`: delete `ConsolePowerStrip` and `powerStrip`. Update the header comment: `built each frame by the scene on every view (UI round §2.4)`. The `HUD` comment's "left of the readout column" becomes "under the tab strip".

`ui/duel/ScienceStation.tsx`: draw `SENSOR RANGE ${science.range}` at native size, right-aligned on the block's top row, in the block's existing text tint. Read the component first and put it where the old strip's `RANGE n` read clearly. The Science block is 96 tall.

- [ ] **Step 6: The scene and the mounts**

`app/duel/scene.ts`:
- `hud: view === 'interior' ? shipHud(d) : null` becomes `hud: shipHud(d)`, with the comment `// UI round §2.4: the HUD on every view`.
- The console map input's `infoBand: { left: TABS_RIGHT, right: SIDE.x }` becomes `infoBand: INFO_BAND`.
- `reserveRight: shown ? CONTACT_RESERVE : CONSOLE_RESERVE.right` stays (the values changed in consoleLayout).
- Remove the `SIDE` import.

`ui/views.ts`: `hud?: ShipHudView | null` doc becomes "every view (UI round §2.4)".

`ui/duel/DuelUi.tsx`:
- Delete the `SideColumn` and `PowerStrip` imports and lines.
- `{duel.hud && <ShipHud hud={duel.hud} />}` moves up to right after the `MapOverlay` line, so the console blocks and windows draw over the map and the HUD under the banners. Keep it inside the outer `CrtGlow`. ShipHud forces its own CRT context.
- Header comment: `UI round §2.3, §2.4: no side column, no power strip; the ship HUD on every view.`

`ui/duel/MapOverlay.tsx`: in the `'console'` placement, return the scale bar and, while `overlay.snapHint`, `C: SNAP BACK` at `FONT_NATIVE`, tint `accent`, right-aligned (`anchorX={1}`) at x = the bar's left edge − 12, y = `BY - 8`. In the `'column'` placement, delete the `zoomText` line. Keep the snap hint there as it is. Update the header comment: `UI round §2.3: no zoom text; the snap hint on the consoles too.`

`ui/duel/SitCard.tsx`: the card always draws at the top: `y0 = card.under ? 156 : 100`, centred at `(INFO_BAND.left + INFO_BAND.right) / 2`, ignoring `card.top` and the passed centre. Keep the model's `top` field so nothing else breaks. Export `SIT_CARD_TOP_Y = 100, SIT_CARD_UNDER_Y = 156` and delete `SIT_CARD_Y`. Comment: `UI round §2.4a: always at the top, under the pause line, in the map's top band, clear of the station blocks at the bottom.`

`app/uiProbe.ts`: drop the `side:` fixtures and any `power:`.

- [ ] **Step 7: Typecheck and the churn**

`npm run typecheck`, fix. Then fix the tests by the churn rule:
- **Delete** the zoom box cases: `uiConsole.test.tsx` (the `side` fixture, the `zoom-in`/`zoom-out`/`snap` buttons, `'0.90'`/`'CAMERA'`, the lit snap and the two presses). In their place, add one case: the console's `C: SNAP BACK` shows only while `overlay.snapHint`. Also delete `duelConsoleModel.test.ts:133-135`.
- **Delete** the power strip's cases (`engineeringConsoleUi.test.tsx`'s `data-ui-strip` cases). Replace them with one case: on a console view the HUD's power columns render (`[data-ui-hud-slot]` present) with `station: 'weapons'`.
- **Layout pins** move to the new numbers (`duelConsoleModel.test.ts:32-61`, `flightPointer.test.ts`, `pewInput.test.ts`, `ownShipLayout.test.ts`, `pauseLine.test.tsx` (its avoided-rects list: `HUD_TOP` in place of `{ ...STATUS, h: 400 }` and the hull bar), `duelWeaponsView.test.ts:83-96` (`[TABS_RIGHT, CONTACT.x]`), `valkyrnViews.test.ts:23,31` (`infoBand: INFO_BAND`, `reserveLeft: 264`, `reserveRight: 12`), `crewSeats.test.ts:62`). Each assertion keeps its meaning with the new rects.
- `uiShipHud.test.tsx`: add a case that a weapons-station view with `hud` renders the HUD.
- The sit card tests (`git grep -l "SIT_CARD" -- tests`): the top place.
- A test that checked the HUD is absent off the ship view now expects it present.
- Science: `scienceUi.test.tsx` checks `SENSOR RANGE`.

- [ ] **Step 8:** Run `tests/terminalLayout.test.ts` plus every touched file; PASS; typecheck clean. Then `npx electron-vite build && npx vitest run --maxWorkers=4` once. List any red file in the report with its cause, and fix any that belongs to this task.

- [ ] **Step 9: Commit**

`git add -A src tests docs/superpowers/research/2026-11-20-ui-round-2a-report.md && git commit -m "feat(ui-round-2a): no zoom box or power strip; the ship HUD on every view; station blocks right of the power panel, own ship window under the HUD, enemy window top right" -m "Spec §2.3, §2.4, §2.4a." -m "Co-Authored-By: …"`

---

### Task 4: Room state and health in the HUD

**Files:**
- Modify: `render/duel/shipHudModel.ts`, `ui/duel/ShipHud.tsx`
- Test: `tests/hudRoomsHealth.test.tsx` (create)

**Interfaces:**
- Produces: `PowerColumn.room: RoomMark | null` (null on SENS, O2 and the reactor) with `export interface RoomMark { state: 'ok' | 'damaged' | 'offline' | 'fire'; progress: number }`. `ShipHudView.health: { fill: number; downed: boolean } | null` (null at full health and not downed). `export const HEALTH_ROW = { y: 124, barX: <the shield pips' x>, barY: 132, barW: 120, barH: 10 }`. Columns map rooms this way: `DuelSystem.Weapons` → `Room.Weapons`, `DuelSystem.Shields` → `Room.Shields`, `DuelSystem.Engines` → `Room.Engines`.

- [ ] **Step 1: The failing test**

`tests/hudRoomsHealth.test.tsx`:
```tsx
// UI round spec §2.2, §2.4a: the old readout's room rows live on the HUD's power columns (damaged, offline, FIRE, the
// repair or extinguish bar), and the active player's health shows under the shields only when hurt or downed.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { DuelSystem } from '../src/renderer/src/sim/duel/power';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { REPAIR_UNITS } from '../src/renderer/src/sim/duel/repair';
import { HEALTH_ROW, shipHud } from '../src/renderer/src/render/duel/shipHudModel';

describe('room state on the power columns (spec §2.4a)', () => {
  it('ok, damaged with repair progress, offline, and no room on SENS and O2', () => {
    const d = createDuel(parseShip(cutter), 5), rooms = d.tactical.systems[0].rooms;
    rooms[Room.Shields] = 1; d.repair[Room.Shields] = REPAIR_UNITS / 2; rooms[Room.Engines] = 2;
    const cols = shipHud(d, 0).power.systems;
    expect(cols[DuelSystem.Weapons]!.room).toEqual({ state: 'ok', progress: 0 });
    expect(cols[DuelSystem.Shields]!.room).toEqual({ state: 'damaged', progress: 0.5 });
    expect(cols[DuelSystem.Engines]!.room).toEqual({ state: 'offline', progress: 0 });
    expect([cols[DuelSystem.Sensors]!.room, cols[DuelSystem.Oxygen]!.room]).toEqual([null, null]);
    disposeDuel(d);
  });
  it('health: null at full, the fill when hurt, downed', () => {
    const d = createDuel(parseShip(cutter), 5);
    expect(shipHud(d, 0).health).toBeNull();
    expect(HEALTH_ROW.y).toBe(124);
    disposeDuel(d);
  });
});
```
Adapt the imports to the real names: find `REPAIR_UNITS`, `DuelSystem.Oxygen`'s name and the Health/Life components with `git grep -n "export const REPAIR_UNITS\|Oxygen\b" -- src/renderer/src/sim`. Add a burning-room case: set a fire on the Weapons room's point the way `tests/duelFireView.test.ts` did before Task 2 deleted it (read it from `git show U2A_BASE:tests/duelFireView.test.ts`). It expects `{ state: 'fire', progress: <extinguishProgress> }`. Add a hurt case and a downed case: set `Health.cur` / `Life.state` for the player's entity the way `git show U2A_BASE:tests/duelHealthView.test.ts` did. Expect `{ fill: hp / HEALTH_MAX, downed: false }` and `{ fill: 0, downed: true }`.

- [ ] **Step 2:** `npx vitest run tests/hudRoomsHealth.test.tsx`. Expected: FAIL (`shipHud` takes one argument; no `room`, no `health`).

- [ ] **Step 3: The model**

`shipHudModel.ts`:
- `shipHud(d: DuelState, active: number): ShipHudView`. The scene passes `source.active()`. Update the scene call and the other callers (`git grep -n "shipHud(" -- src tests`).
- Add `RoomMark` and `PowerColumn.room`. In `powerView`, `room: roomMark(d, k)` where:
```ts
/** UI round §2.4a: the tactical room behind a power column (WEAP, SHLD, ENG), or null (SENS, O2). */
const ROOM_OF: Readonly<Partial<Record<number, number>>> = { [DuelSystem.Weapons]: Room.Weapons, [DuelSystem.Shields]: Room.Shields, [DuelSystem.Engines]: Room.Engines };
export function roomMark(d: DuelState, system: number): RoomMark | null {
  const r = ROOM_OF[system];
  if (r === undefined) return null;
  const point = d.points.find((p) => p.tacticalRoom === r);
  if (point && pointBurning(d, point)) return { state: 'fire', progress: extinguishProgress(d, point) };
  const n = d.tactical.systems[CREW_SLOT]!.rooms[r]!;
  return { state: n === 0 ? 'ok' : n >= 2 ? 'offline' : 'damaged', progress: n > 0 ? d.repair[r]! / REPAIR_UNITS : 0 };
}
```
  Import `pointBurning` and `extinguishProgress` from wherever readoutModel imported them before Task 2 (`git show U2A_BASE:src/renderer/src/render/duel/readoutModel.ts | head -30`). Import `REPAIR_UNITS` and `Room` the same way.
- `ShipHudView.health` and `HEALTH_ROW`:
```ts
/** UI round §2.2, §2.4a: the health row under the shields, only when the active player is hurt or downed. */
export const HEALTH_ROW = { y: 124, barX: HUD.x + textPxShields, barY: 132, barW: 120, barH: 10 } as const;
```
  `textPxShields` is the shield pips' x offset that ShipHud computes as `textPx('SHIELDS', 2) + 8`: import `textPx` from `render/theme` and write `barX: HUD.x + textPx('SHIELDS', 2) + 8`. In `shipHud`, read the player's entity as healthRow does (`d.interior.crew[active]`, `Health.cur`, `HEALTH_MAX`, `Life.state`). Set `health: downed ? { fill: 0, downed: true } : Math.ceil(hp) < HEALTH_MAX ? { fill: hp / HEALTH_MAX, downed: false } : null`.

- [ ] **Step 4: The drawing**

`ShipHud.tsx`:
- In `PowerCol`, give the name label a look from `c.room`:
  - `fire`: an inverse block behind the name (a `Box` at the name's box, `background: hex(blink(now, ALERT_BLINK_HZ) ? CRT.hot : CRT.main)`) and the text in `CRT.glass`.
  - `offline`: a steady `CRT.main` inverse block, text `CRT.glass`.
  - `damaged`: text `CRT.hot`.
  - `ok` or null: as today (`CRT.mid`, or `hot` when failed).
  - A `progress > 0` draws a 2 px bar under the name: `Box` at `x + 4`, `y = powerNameY() + 22`, `w = (P.colW - 8) * progress`, `h = 2`, `background: hex(CRT.hot)`.
  - Add `data-ui-hud-room={c.room?.state ?? 'none'}` on the name's wrapper or the block for tests.
- In `HudBody`, after the shields, when `hud.health`:
  - `downed`: `PixelText "DOWNED"` at (HUD.x, HEALTH_ROW.y), blinking `CRT.hot`/`CRT.dim`.
  - Otherwise: `PixelText "HEALTH"` at (HUD.x, HEALTH_ROW.y - 2) in `CRT.mid`, and a `Box` bar at (barX, barY, barW, barH) with a `CRT.faint` back and a `CRT.main` fill of `fill × barW` (`CRT.hot` below 0.3). Add `data-ui-hud-health={downed ? 'downed' : String(Math.round(fill * 100))}`.
- Update the header comment with the two additions.

Extend `tests/hudRoomsHealth.test.tsx` with a render case that follows `tests/uiShipHud.test.tsx`'s harness: a view with a burning WEAP column and a hurt player renders `[data-ui-hud-room="fire"]` and `[data-ui-hud-health="40"]`.

- [ ] **Step 5:** Run the new test, `tests/uiShipHud.test.tsx`, `tests/shipHudModel.test.ts` and `tests/terminalLayout.test.ts`; PASS; typecheck clean.

- [ ] **Step 6:** Commit: `feat(ui-round-2a): room state on the HUD's power columns and a health row when hurt or downed` with `Spec §2.2, §2.4a.`

---

### Task 5: The ship view's own rows

**Files:**
- Modify: `render/duel/situationModel.ts` (`torpedoInbound`), `ui/views.ts` (`Banners.alert`), `app/duel/scene.ts` (`sceneUi`), `ui/duel/Banners.tsx`, `render/duel/interiorModel.ts`, `render/duel/interiorView.ts`
- Test: `tests/shipViewRows.test.ts` (create), `tests/sceneUi.test.ts`

**Interfaces:**
- Produces: `torpedoInbound(t: TacticalState): boolean` (the enemy's missile within `INCOMING_RANGE = 600` of the crew ship). `Banners` gains `alert: string | null` ('TORPEDO INBOUND' on the ship view, else null). `CrewHealthMark.label` is `'AWAY'` for an away player. `StationBadge` gains `empty: boolean` (Helm and Weapons only: the console has no present occupant; false for the others).

- [ ] **Step 1: The failing test**

`tests/shipViewRows.test.ts`:
```ts
// UI round spec §2.2, §2.4a: on the ship view only: TORPEDO INBOUND as a banner, AWAY under an away player, an empty Helm
// or Weapons badge marked for its blink.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { INCOMING_RANGE, torpedoInbound } from '../src/renderer/src/render/duel/situationModel';
import { crewHealthMarks, stationBadges } from '../src/renderer/src/render/duel/interiorModel';
import { sceneUi, type SceneOverlay } from '../src/renderer/src/app/duel/scene';

const ov = (p: Partial<SceneOverlay> = {}): SceneOverlay => ({ banner: null, layerPaused: false, end: null, ...p });

describe('ship view rows (spec §2.4a)', () => {
  it('no torpedo: no alert; the rule is 600 u', () => {
    const d = createDuel(parseShip(cutter), 5);
    expect(INCOMING_RANGE).toBe(600);
    expect(torpedoInbound(d.tactical)).toBe(false);
    disposeDuel(d);
  });
  it('the banner shows only on the ship view', () => {
    expect(sceneUi('interior', ov(), 'P', null, true).banners.alert).toBe('TORPEDO INBOUND');
    expect(sceneUi('helm', ov(), 'P', null, true).banners.alert).toBeNull();
    expect(sceneUi('interior', ov(), 'P', null, false).banners.alert).toBeNull();
  });
  it('empty consoles and away players', () => {
    const d = createDuel(parseShip(cutter), 5);
    const b = stationBadges(d);
    expect(b.find((x) => x.label === 'HELM')!.empty).toBe(true);   // nobody seated at the start
    expect(b.find((x) => x.label === 'SCIENCE')?.empty ?? false).toBe(false);
    d.present[1] = 0;
    expect(crewHealthMarks(d)[1]!.label).toBe('AWAY');
    disposeDuel(d);
  });
});
```
Add a case with an enemy missile in range: place one the way `git show U2A_BASE:tests/duelReadout.test.ts` set up its TORPEDO INBOUND case (search it for `INBOUND`), and expect `torpedoInbound` true. If `d.present` is not how AWAY is expressed, read `crewStatus` in readoutModel and use its rule for the setup.

- [ ] **Step 2:** Run it. Expected: FAIL.

- [ ] **Step 3: Implement**

`situationModel.ts`:
```ts
/** UI round §2.4a (the old readout's rule): the enemy torpedo is within INCOMING_RANGE of the crew ship. */
export const INCOMING_RANGE = 600;
export function torpedoInbound(t: TacticalState): boolean {
  const m = missileOf(t, targetOf(t, CREW_SLOT)), me = t.ships[CREW_SLOT]!;
  return m !== null && (m.x - me.x) ** 2 + (m.y - me.y) ** 2 <= INCOMING_RANGE * INCOMING_RANGE;
}
```

`ui/views.ts`: `Banners` gains `alert: string | null`.

`scene.ts`:
- `sceneUi(view, overlay, pauseText, overlayView, inbound = false)` adds `alert: view === 'interior' && inbound ? 'TORPEDO INBOUND' : null` to `banners`.
- The frame call passes `torpedoInbound(d.tactical)`.
- Update `tests/sceneUi.test.ts`'s `toEqual` objects with `alert: null`. Run `git grep -n "notice: null }" -- tests src` for other `Banners` literals.

`Banners.tsx`: when `banners.alert`, draw it at (INTERNAL_W / 2, 100), `FONT_SIZE`, centred (`anchorX` 0.5), blinking with the HUD's clock: `useCrt().now` with `blink(now, ALERT_BLINK_HZ) ? CRT.hot : CRT.main`, and outside CRT `WARN` / `TEXT`. Add `data-ui-alert` via a wrapper `Box` if PixelText takes no attrs. Header comment: `UI round §2.4a: the ship view's TORPEDO INBOUND.`

`interiorModel.ts`:
- `crewHealthMarks`: `label: downed ? (...) : away ? 'AWAY' : ''`, where `away` is `crewStatus(d, pid) === 'AWAY'` (import from readoutModel).
- `StationBadge` gains `empty: boolean`. In `stationBadges`, Helm and Weapons get `empty: !crewed(occupant)`, using `d.interior.stations.occupant[d.nav]` / `[d.weapons]` and `crewed = (pid) => pid >= 0 && !!d.present[pid]`. Science and Medbay get `empty: false`.
- The doc comments say so.

`interiorView.ts`:
- Keep a presentation clock: `let clock = 0;` in the factory, then `clock += presentDt;` at the top of `draw`.
- The badge tint line (150) becomes `const c = b.empty && blink(clock, ALERT_BLINK_HZ) ? WARN : BADGE_TINT[b.tint];` (import `blink`, `ALERT_BLINK_HZ` from `render/tactical/crtTheme`).
- The crew label code (192-197) already draws `c.label`. Give `'AWAY'` the `DIM` tint (the downed labels keep `WARN`).

- [ ] **Step 4:** Run `tests/shipViewRows.test.ts`, `tests/sceneUi.test.ts`, `tests/duelInterior.test.ts` and every file that `git grep -l "stationBadges\|crewHealthMarks\|Banners" -- tests` lists; PASS; typecheck clean.

- [ ] **Step 5:** Commit: `feat(ui-round-2a): the ship view's own rows: TORPEDO INBOUND banner, AWAY labels, empty consoles blink`.

---

### Task 6: The Helm's range and bearing

**Files:**
- Modify: `render/tactical/weaponsModel.ts`, `render/tactical/tacticalLayer.ts` (the `info` text draw)
- Test: `tests/helmInfoLine.test.ts` (create)

**Interfaces:**
- Produces: `CombatDraw.helmInfo: Label | null`, the Helm map's info line in the top band at `INFO_Y`: `BRG nnn  RNG n` (no TORP) or `NO CONTACT IN SENSOR RANGE`. `export function helmInfoText(bearing: number, range: number): string`.

- [ ] **Step 1: The failing test**

Follow `tests/duelWeaponsView.test.ts`'s `input(st, cam, console)` helper (copy it). Then:
```ts
import { helmInfoText } from '../src/renderer/src/render/tactical/weaponsModel';
it('the Helm map carries BRG and RNG in the top band; Weapons keeps its own line; Science neither', () => {
  expect(helmInfoText(74, 728)).toBe('BRG 074  RNG 728');
  const helm = combatModel(input(st, cam, 'helm'));
  expect(helm.helmInfo!.text).toMatch(/^BRG \d{3}  RNG \d+$/);
  expect(helm.helmInfo!.y).toBe(INFO_Y);
  expect(combatModel(input(st, cam, 'weapons')).helmInfo).toBeNull();
  expect(combatModel(input(st, cam, 'science')).helmInfo).toBeNull();
});
```
Add a case with the enemy not drawn (`ships: [0]`): `NO CONTACT IN SENSOR RANGE`.

- [ ] **Step 2:** Run it. Expected: FAIL.

- [ ] **Step 3: Implement**

`weaponsModel.ts`, next to `weaponsInfoText`:
```ts
/** UI round §2.4a: the Helm map's info line: bearing and range to the enemy, no torpedo word (Weapons' line has it). */
export function helmInfoText(bearing: number, range: number): string { return `BRG ${String(bearing).padStart(3, '0')}  RNG ${range}`; }
```
In `combatModel`, after `weapons`:
```ts
  let helmInfo: Label | null = null;
  if (input.console === 'helm' && input.infoBand) {
    const dx = enemy.x - own.x, dy = enemy.y - own.y;
    helmInfo = bandLabel(input.ships.includes(target) || input.fx.kill !== null ? helmInfoText(bearingDeg(dx, dy), Math.round(Math.sqrt(dx * dx + dy * dy))) : 'NO CONTACT IN SENSOR RANGE', centre, input.infoBand, INFO_Y, 1);
  }
```
Add `helmInfo` to the `CombatDraw` type (with a doc line) and to the returned object. In `tacticalLayer.ts` (line ~428), draw it with the same `info` text object: `const line = wd?.info ?? c?.helmInfo ?? null;` sets visibility, text and position (tint `CRT.mid` for the Helm line). Fix any `CombatDraw` literal in tests (for example `tests/crtColours.test.ts`) by adding `helmInfo: null` where it needs a full object.

- [ ] **Step 4:** Run the new test plus `tests/duelWeaponsView.test.ts`, `tests/crtColours.test.ts`, `tests/valkyrnViews.test.ts`; PASS; typecheck clean.

- [ ] **Step 5:** Commit: `feat(ui-round-2a): the Helm map's range and bearing line`.

---

### Task 7: Verification, screenshots and the gate

**Files:**
- Create: `scripts/ui-round-2a-shots.cjs`
- Modify: `docs/gates.md`, the report

- [ ] **Step 1: The full verification.** One at a time: `npm run typecheck`, `npx electron-vite build`, `npx vitest run --maxWorkers=4` (re-run load-sensitive files alone), `npm run test:determinism` (then `git checkout -- .superpowers/sdd/2026-11-14-net-1b-durability`), `npm run test:duel-app-runtime`. Check `git diff --stat U2A_BASE -- tests/golden tests/fixtures src/renderer/src/sim` prints nothing (no sim change).
- [ ] **Step 2: The screenshots.** Copy `scripts/ui-round-1-shots.cjs` (playwright-core outside the repo; Electron on `out/`; the helpers that seat the crew). Save to `C:\Users\djuar\FTLite-shots\ui-round-2a\` at 1280×720:
  1. `1-helm.png`: the Helm (the HUD top left and bottom left, the Helm block at x 346, the own ship window under the HUD, `BRG … RNG …` in the top band, no info box, no zoom box).
  2. `2-weapons-window.png`: Weapons with the enemy window open (top right) and the sit card at the top.
  3. `3-science.png`: Science with `SENSOR RANGE n`.
  4. `4-ship.png`: the ship view (no right column; the ship fills the width; an empty console badge).
  5. `5-damage.png`: a damaged and a burning room on the power columns and the health row (set the state through the script's duel hooks, as ui-round-1's script seats crew).
  6. `6-flight.png`: the Valkyrn's Flight seat (the Helm block and the Flight block side by side, clear of the HUD).
  Look at each with the Read tool and check it against its line. Fix the script, not the product, for script mistakes. Report a real product overlap or missing element as a concern.
- [ ] **Step 3: The gate entry.** Append to `docs/gates.md`: `## UI round Part 2a (one screen per job), SIM_VERSION 65 unchanged`, with the automated checks ticked, the screenshot check ticked, and an open owner look check: "the terminal layout reads well; the HUD on every console; nothing you miss from the info box".
- [ ] **Step 4: Commit** the script, `docs/gates.md` and the report: `docs(ui-round-2a): verification, screenshots, the gate entry`.
