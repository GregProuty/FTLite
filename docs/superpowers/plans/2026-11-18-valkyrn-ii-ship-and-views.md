# Valkyrn Part ii: the ship, the app and the views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Valkyrn in Single player: the painted 2-Minute Tabletop ship as a walkable 19 × 7 interior, its console-map silhouette, the ship picker and the laser-fit switch, the crew-of-one runtime, the Flight seat's mouse-and-keyboard bindings, and the minigun's crosshair, lead pip, heat bar and GUN card, without moving a single Hound golden or changing a single Hound behaviour.

**Architecture:** Part i (the sim) already gives us the gun, the classes, `crewClass`, crew 1, `aim`/`gunHeld` and the four layout fields. Part ii is data plus presentation. The data is `valkyrn.json`, its repair points, its battlemap entry, its hull outline and the fleet's solo-ship list. The app picks a ship and builds `createDuel(layout, seed, 0, layout.crew, cls)`. A Flight seat (`Seat`/`DuelView`/`ConsoleStation` value `'flight'`, true when Navigation and Weapons share one console group) drives the Helm map with the Helm camera. The pointer's bearing goes in as `aim` every frame, the left button as `gunHeld` and the right button as `missileLaunch`. A pure `leadModel.ts` computes the intercept, and the CRT layer draws it. Nothing in the app or the views branches on a ship or class id: two new tests enforce that, plus Hound/Valkyrn feature parity.

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), PixiJS 8 (map layer), React 19 + zustand 5 (UI overlay and menu), Vitest 3.2 (+ jsdom and @testing-library/react for `.tsx`), zod 3, pngjs (scripts only), Electron + electron-vite; playwright-core (scratch folder only, for the screenshots).

**Spec:** `docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md`, §3.2, §3.3, §4.1–§4.5, §5, §5.1, §7.4, §8, §9, §10 (view tests and screenshots). The shared contract for the three plan parts: `C:\Users\djuar\AppData\Local\Temp\claude\86da55dbee83ee65\f57e5746-04d8-4700-8981-6681ff3f3611\scratchpad\valkyrn-contract.md`. Precedents: `docs/superpowers/plans/2026-11-16-art-iv-hound-battlemap.md` (tracing a painted ship), `docs/superpowers/plans/2026-11-18-sci-2-crew-of-four.md` (format, oracle proofs).

**Branch and worktree:** all work happens in the git worktree `.worktrees/valkyrn` on branch `valkyrn`, **after Part i's last commit on that branch**. The controller creates the worktree and its junctions (`node_modules`, `services\signalling\node_modules`, `.art`, `public\assets\paid`); executors do not. Every command below runs from the worktree root `C:\Users\djuar\FTLite\.worktrees\valkyrn`. Record the baselines (Task 1 Step 2) in that same worktree, because the baselines check their `cwd`.

## Global Constraints

- **The Hound does not move.** Part ii changes no Hound golden and no Hound behaviour. Task 1 records both baselines at Part i's version (53). The last step of Tasks 2, 3, 4, 7 and 9 runs `npx tsx scripts/golden/duel-oracle.ts same` and `npx tsx scripts/golden/canonical-trace.ts same`, and both must pass. Never run `npm run bless`, never pass `--fresh`, never hand-edit `tests/golden/*` or `tests/fixtures/determinism-v2.json`, and never edit `tests/duelGates.test.ts`. If a `same` fails, a Hound run changed: find the cause and fix it.
- **SIM_VERSION stays 53** (Part i owns it). Valkyrn data is not in any golden: the goldens fly the Hound and the Cutter.
- **Paid art stays out of git.** `public/assets/paid/` is gitignored. The PNG is staged at `C:\Users\djuar\FTLite-assets\2mt-valkyrn\valkyrn.png` and imported by `npm run art:import`. Every test runs without it: a missing `ship.valkyrn.map` falls back to the procedural tiles (the Art-iv fallback pattern).
- **No ship or class id literals** (spec §3.2). Under `src/renderer/src/**/*.{ts,tsx}`, the quoted ids `'hound'`, `'cutter'`, `'valkyrn'`, `'valkyrnLaser'` and `'scout'` (single or double quotes) may appear only in `sim/tactical/defs.ts`, `sim/duel/tuning.ts`, `render/battlemapModel.ts`, `render/tactical/hullModel.ts`, `render/assetNames.ts`, `sim/ship/fleet.ts` and `render/credits.generated.ts`. (`sim/ship/*.json` holds ids too, but the test only scans `.ts` and `.tsx`.) Tests and scripts may use the literals.
- **UI imports no runtime values from `sim`, `authority`, `clientControl`, `net` or `src/network`** (`tests/uiBoundary.test.ts`). The ship picker's list reaches React through the settings slice, filled by `main.ts`.
- **Maps use the CRT amber ramp only** (`tests/crtColours.test.ts`). Every new mark (crosshair, pip, brackets, heat bar, tracers, the Valkyrn hull) uses `CRT.*`. Audio and UI never import sim values.
- **Exact names** (contract, Part ii column): art import `rotate: 90`, output `public/assets/paid/2mt/valkyrn.png`; asset `ship.valkyrn.map`; `src/renderer/src/sim/ship/valkyrn.json` (`shipClass: "valkyrn"`, `crew: 1`, `helmHoldsUnattended: true`, `hull: "valkyrn"`); `DUEL_REPAIR_POINTS.valkyrn`; `BATTLEMAPS.valkyrn`; `HullId` gains `'valkyrn'`; `hullFor(crew, layoutHull)`; `tests/shipParity.test.ts`; `tests/noShipIdLiterals.test.ts`; settings fields `soloShip` and `valkyrnLaserFit`; `render/duel/leadModel.ts` `leadPip(...)`.
- **Git:** never `git add -A`, `git add .` or `git stash`; stage files by name. Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The commands below pass that footer as a second `-m`.
- **Test commands:** targeted `npx vitest run <files>`; `npx tsc -b`; the full suite `npx vitest run --maxWorkers=4`, always after `npx electron-vite build`. Never run two vitest processes at once. `tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts` and `tests/gate-*.test.ts` can time out under load: rerun a failing one alone before calling it a failure.
- **Line numbers** below were read on branch `sci-2` at `d06b64b1`, the tip before Sci-2's Task 3 (master `ed2650b8` for files Sci-2 does not touch). Sci-2's later tasks and Part i move them, so find each edit by its quoted text, not its number.
- Comments follow the codebase's style: a header comment citing the spec section on each new file, doc comments on exports, and "Valkyrn spec §x" on changed lines that need a reason.

## Decisions where the spec leaves room, and where the code forces a choice

1. **The trace** (spec §4.2; the Hound spec §1 rule). The painting is rotated 90° clockwise so the nose faces right. Tile `tx` is centred on rotated source x = 560 + 70·tx and tile `ty` on y = 910 + 70·ty, so every 140 px square boundary falls on a tile centre. The pressurised hull spans x 590..1840 and y 945..1275, which gives **19 × 7 tiles** (the spec guessed about 25 × 7 because it took the hull as 12 squares long; the painted interior is 9 squares). The overlay was checked by eye in planning (`overlay.png` in the planning scratchpad). Room by room:
   - **Engines** (the missile bay's ramp half): tx 1–3, ty 1–5. The grated ramp panel is at x 610..760.
   - **Reactor** (the rack half): tx 5–7, ty 1–5. It holds the four rack groups and the centre hatch.
   - **Life Support** (the galley and washroom, port side, which is up after the rotation): tx 9–11, ty 1–3.
   - **Medbay** (the bunk, starboard side): tx 9–11, ty 5.
   - **Ops** (the two chairs facing the consoles): tx 13, ty 2–4.
   - **Cockpit** (the two tandem pilot chairs): tx 15–17, ty 2–4. The front chair is at (17,3).
   - **Walls and doors.** Wall columns tx 4, 8, 12 and 14 sit on the painted bulkheads at x 840, 1105, 1385 and 1570. Wall row ty 4 under the galley follows the bunk's headboard line (y 1190). The doors are: Engines–Reactor (4,3), Reactor–Life Support (8,3), Life Support–Ops (12,3), Ops–Cockpit (14,3) and Life Support–Medbay (10,4).
   - **Known deviations:**
     - Ops is one tile wide. The painted floor is 152 px, about two tiles less a wall's thickness.
     - The bay has no painted wall between its halves, only rack pillars at x 840. The (4,3) door is the narrowest door the Hound spec's rule allows.
     - Medbay is one row, the bed.
     - The painting shows no side hatch, so the second airlock is the galley's top wall (10,0). The Hound also put its second airlock in Life Support.
     - The floor's bottom row (ty 5) reaches 25 px into the painted bottom wall.
2. **The painted bounds** (`BATTLEMAPS.valkyrn`). The alpha > 16 bounding box of the rotated image is (35, 28)–(2174, 2178) px. That gives origin (−7.5, −12.5) and bounds `{ x: −7, y: −12.1, w: 30.557, h: 30.714 }` in tile-edge coordinates. The duel fit includes the wings, as the spec says (§4.2), so the 19-tile interior fills about 60 % of the fit's width. The interior zoom (C, wheel) covers the rest. This is for the owner's look gate.
3. **`battlemapFor` stops reading the `'battlemap'` feature** (`render/battlemapModel.ts:17` on master). `featureReady(missing, 'battlemap')` needs every name in the feature, so a missing Valkyrn painting would hide the Hound's. The function now checks only `!missing.has(def.name)`. For the Hound the two checks are the same test (the feature held only `ship.hound.map`). `FEATURE_NAMES.battlemap` lists both names, so a "missing everything" fixture still covers both.
4. **The hull silhouette** (spec §4.5) follows the hull silhouettes spec's trace exactly: downscale by 8, alpha ≥ 50 %, a 3 px max then min filter, a Moore boundary trace, Douglas–Peucker at 2.5 px, centred on the opaque bounding box (62, 55)–(2173, 2177) and scaled so the length is 2.4 units. The result has 53 vertices and a maximum radius of 1.361 (≤ 1.55). The fuselage is only 0.38 units wide at Ops, so a room the size of the painted Ops would cover 0.044 square units, under the 0.2 floor. The three room polygons are therefore widened over the wing roots and the quarters: Weapons spans f 0.08..0.68 (its centre, f 0.38, sits over Ops), Shields f −0.28..−0.02 (the rack half) and Engines f −0.70..−0.30 (the ramp half). Their areas are 0.216, 0.208 and 0.210. All three are convex, inside the outline, and cross no outline edge (checked with the hull test's own predicates in planning).
5. **`hudModel.ts:345`** (`shipForCrew(...) !== 'cutter'`) reads a layout field instead. The helm line is about a tube that loads itself, so the field is the layout's `magazine` (`cutter.json:581` has one; the Skiff and the Hound do not). `fleet.ts` gains `tubeLoadsItself(id)`. Its output is identical for every crew size.
6. **The hull ids live in `sim/ship/fleet.ts`** (Part i Decision 6). Part i appends `export const HULL_IDS = ['hound', 'scout', 'valkyrn'] as const;` to `fleet.ts`, and `schema.ts` types the layout's `hull` as `z.enum(HULL_IDS).optional()` and `shipClass` as `z.string().min(1).optional()`, so `schema.ts` carries no id literal. Task 3 Step 5 keeps that export when it extends `fleet.ts`, and `hullModel.ts` derives `HullId` from it (`(typeof HULL_IDS)[number]`), so the view's hull list and the schema's cannot drift.
7. **The picker reaches React through the settings slice** (Global Constraints, UI boundary). `SettingsSlice` gains `ships: { id, name, line }[]` (from `SOLO_SHIPS` in `main.ts`), `soloShip` and `valkyrnLaserFit`. The fleet's solo list lives in `sim/ship/fleet.ts`, an allowed id file. `SoloShipId` is derived from it, so `settingsStore.ts` never spells an id.
8. **Home's Single player opens the picker** (page `'ship'`, `actions.openShips`). `actions.single(ship?)` keeps its meaning: it starts Single player on `ship`, or on the remembered choice. So `tests/uiActions.test.ts:112` stands. `tests/menu.test.tsx:51-52,93` and `scripts/network/online-app-smoke.ts:199` click `ship-hound` after `single-player`.
9. **The Flight seat is a fifth seat value, `'flight'`.** `seatOf` returns it when the character occupies both Navigation and Weapons, which only happens when they share a console group (`flightSeat(d)`; `sitDown` seats every member, `sim/stations.ts:31-38`). The view uses the Helm camera (`viewCamera`), and the map model draws it as `console: 'helm'`, so it gets the predicted path, gravity rings, EVADE, the collision words and the torpedo circle, plus `flight: true`. The Flight view passes `holdHeading: -1`, so there is no HDG marker (spec §5.1).
10. **Tabs.** `ConsoleView.tabs` keeps exactly four keys on the Hound: `tests/duelConsoleModel.test.ts:106` uses `toEqual`. The `flight` key is present only on a layout with the Flight seat, and the tab strip then reads FLIGHT, SCIENCE, SHIP. `TABS_RIGHT` (408) is unchanged.
11. **Tab at n = 1** (spec §4.4) toggles a runtime-local `shipView` while seated. `view()` reads `'interior'` while it is set, and the seat stays attended. On foot, Tab does nothing. The ship view is a look, not a seat change: the ship keeps its course. The gun, the pointer bearing, and the turn keys (A/D's `moveX` and Space's `face`, which would turn the ship and clear the held bearing, Part i) are dropped while it is set. Throttle (W/S), launch (F, right button) and the torpedo's room (Q/E) still work, since none of them turns the ship. In ship view the console shows SHIP lit and the seat's tab open with the Tab action (`consoleTabs`' `shipView`).
12. **Input plumbing.** The scene turns the pointer into a bearing from the own ship's drawn marker every frame on the Flight map (`MapRequests.steer`), as the Helm's heading request does (`app/duel/mapRequests.ts`). Over the DOM side tools the canvas gets no pointer moves, so the last bearing stands. The left button is `PointerSource.leftHeld()`: pressed on the canvas, released by a button-0 `pointerup` on the canvas or the window, a canvas move with the button bit clear, or the window's `blur`, so a release over the DOM side tools or an alt-tab stops the gun. A right-button press on the Flight map is `MapRequests.launch()`. The runtime drains both every frame.
13. **No contact-window click on the Flight map.** The left button is the gun, so a map click never routes to `contact.click` on the Flight seat (`scene.ts:178`). The TORPEDO card, 2 and T open the window.
14. **Q/E on the Flight seat always step the torpedo's room** (spec §5.1), with or without the laser fit. While the torpedo is picked up, the contact controller's `torpStep` takes them (the Weapons rule). Otherwise the runtime steps the torpedo from its latest queued or held room.
15. **Rounds are drawn as short tracers** (CRT.main, 1 px, 0.02 s of flight). This is presentation only. Spec §7.4's hit feedback assumes the pilot can see the stream.
16. **The pip is the aim point in the shooter's frame:** `target + (v_target − v_shooter)·t`, with `t` the least positive root of `|r + v·t| = GUN_SPEED·t`. A round fired along it, with the shooter's velocity added (spec §7.1), meets the target's world position `target + v_target·t`. The default-flight test checks that world point (spec §10).
17. **The gun click** (spec §7.4) is at most one sound per frame's events. The one gun fires every 6 ticks, so the "one per 3 ticks" cap holds.
18. **Gun state on the console.** The GUN card's state is OFFLINE (Weapons at 2) before OVERHEAT (`gunLocked`) before READY. The status sentence and the FIRE refusal use the same order (`gunReason`). The readout's CHARGE row becomes a HEAT row on a gun class (`chargeRow`).
19. **The Flight block** sits beside the Helm block at the bottom: `FLIGHT = { x: 324, y: 542, w: 300, h: 166 }`, with two 138 px cards like the Weapons block's (`consoleLayout.ts:15-19`). The targeting line starts at the picked card (`TargetingLine` gains `from`).
20. **Settings stay at version 2.** A record without the new fields reads `soloShip` = the first solo ship (the Hound) and `valkyrnLaserFit` = false. The full-object `toEqual`s in `tests/settingsAndControls.test.ts:14,15,18,27` gain the two fields.
21. **The solo record at n = 1.** Sci-2 bounds the per-player record arrays at `const crew = z.array(uint).min(2).max(4);` (`net/duelRecord.ts`, Sci-2 plan Decision 13), which rejects a one-character record. Task 4 Step 13 widens it to `.min(1)` in that file only. Records are not hashed, and online records (n ≥ 2) stay valid.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `scripts/art/importCore.ts`, `art/import.json` | modify (T1) | `rotate: 0 \| 90`, `rotateImage90`; the Valkyrn output |
| `public/assets/manifest.json`, `src/renderer/src/render/assetNames.ts`, `render/fallback.ts`, `render/credits.generated.ts`, `public/THIRD_PARTY_NOTICES.txt`, `docs/gates.md` | modify (T1) | `ship.valkyrn.map`, the credit, the licence gate |
| `src/renderer/src/sim/ship/valkyrn.json` | create (T2) | the traced layout |
| `src/renderer/src/sim/duel/tuning.ts` | modify (T2) | `VALKYRN_REPAIR_POINTS`, `DUEL_REPAIR_POINTS.valkyrn` |
| `src/renderer/src/render/battlemapModel.ts` | modify (T2) | `BATTLEMAPS.valkyrn`; `battlemapFor` reads only its own asset |
| `src/renderer/src/render/tactical/hullModel.ts`, `tacticalModel.ts` | modify (T3) | the Valkyrn hull, `isHullId`, `hullFor(crew, layoutHull)`, `crewHull` |
| `src/renderer/src/sim/ship/fleet.ts`, `render/hudModel.ts` | modify (T3) | `SOLO_SHIPS`, `SoloShipId`, `tubeLoadsItself`; the lobby line reads `magazine` |
| `tests/noShipIdLiterals.test.ts`, `tests/shipParity.test.ts` | create (T3) | spec §3.2, §3.3 |
| `src/renderer/src/app/duel/controls.ts`, `input.ts`, `mapRequests.ts`, `runtime.ts`, `duelMode.ts`, `contactController.ts`, `scene.ts` | modify (T4, T7, T8) | the Flight seat, n = 1, the bindings |
| `src/renderer/src/render/duel/consoleModel.ts`, `sitModel.ts`, `ui/duel/TabStrip.tsx` | modify (T4, T8) | `'flight'` station, tabs, the sit card |
| `src/renderer/src/app/settingsStore.ts`, `ui/menuState.ts`, `ui/store.ts`, `ui/actions.ts`, `ui/menu/{Home,Menu,Settings}.tsx`, `ui/menu/ShipPicker.tsx` (create), `src/renderer/src/main.ts`, `tests/helpers/uiStore.ts` | modify (T5) | the picker and the laser-fit switch |
| `src/renderer/src/render/duel/leadModel.ts` | create (T6, T7) | `leadPip`, `onTarget`, `gunSightDraw`, `roundDraws` |
| `src/renderer/src/render/tactical/weaponsModel.ts`, `tacticalLayer.ts`, `fxModel.ts`, `render/duel/situationModel.ts`, `readoutModel.ts`, `audio/duelSounds.ts` | modify (T7) | the sight, tracers, gun reasons, the HEAT row, hit feedback (Part i's Task 2 already guards the other laser readers) |
| `src/renderer/src/render/duel/consoleLayout.ts`, `ui/duel/{FlightStation (create),HelmStation,DuelUi,TargetingLine}.tsx`, `app/controlsList.ts` | modify (T8) | the Flight block, the controls list |
| `tests/valkyrnArt.test.ts`, `tests/valkyrn.test.ts`, `tests/valkyrnRuntime.test.ts`, `tests/shipPicker.test.tsx`, `tests/leadModel.test.ts`, `tests/valkyrnViews.test.ts`, `tests/flightConsole.test.tsx` | create | one file per task |

---

### Task 1: Pre-flight, baselines, and the painting imported rotated

**Files:**
- Modify: `scripts/art/importCore.ts` (the `output` schema, `rotateImage90`, the write loop), `art/import.json`, `public/assets/manifest.json`, `src/renderer/src/render/assetNames.ts:34`, `src/renderer/src/render/fallback.ts:21`, `docs/gates.md:747`
- Regenerate: `src/renderer/src/render/credits.generated.ts`, `public/THIRD_PARTY_NOTICES.txt` (`npx tsx scripts/gen-credits.ts`)
- Create: `tests/valkyrnArt.test.ts`

**Interfaces:**
- Consumes: Part i's sim (checked in Step 1).
- Produces: import output field `rotate: 0 | 90` (default 0); `rotateImage90(img: Image): Image`; asset name `ship.valkyrn.map` (optional); `FEATURE_NAMES.battlemap = ['ship.hound.map', 'ship.valkyrn.map']`.

- [ ] **Step 1: Pre-flight: Part i's names exist**

Run each, and stop and report if any prints nothing:
```bash
git grep -n "export function classIndexById" -- src/renderer/src/sim/tactical/defs.ts
git grep -n "VALKYRN_LASER_CLASS" -- src/renderer/src/sim/tactical/defs.ts
git grep -n "GUN_SPEED = 700" -- src/renderer/src/sim/tactical/tuning.ts
git grep -n "export function tickGun" -- src/renderer/src/sim/tactical/gun.ts
git grep -n "crewClass" -- src/renderer/src/sim/duel/state.ts
git grep -n "LOCAL_CREW_MIN" -- src/renderer/src/sim/duel/state.ts
git grep -n "helmHoldsUnattended" -- src/renderer/src/sim/ship/schema.ts
git grep -n "gunHeld" -- src/renderer/src/net/contracts.ts
git grep -n "SIM_VERSION = 53" -- src/renderer/src/sim/tuning.ts
git grep -n "export function crewRows" -- src/renderer/src/render/duel/readoutModel.ts
```

- [ ] **Step 2: Record both baselines at SIM_VERSION 53, before anything changes**

Run: `npx tsx scripts/golden/canonical-trace.ts baseline`
Expected: `baseline at sim version 53: golden 7200 ticks, determinism-v2 <n> ticks in <k> runs; written to <temp>\trace.json`, exit 0.

Run: `npx tsx scripts/golden/duel-oracle.ts baseline`
Expected: `duel oracle baseline at sim version 53: <R> runs, <T> ticks, <F> named fields per tick; written to <temp>\duel-oracle.json`, exit 0. Note `<R>`, `<T>` and `<F>`. Every later `same` must report them unchanged.

- [ ] **Step 3: Stage the source PNG outside the repo**

```bash
mkdir -p /c/Users/djuar/FTLite-assets/2mt-valkyrn
cp "/c/Users/djuar/Downloads/battlemaps/34745/4213598-Valkyrn v1 16x16.png" /c/Users/djuar/FTLite-assets/2mt-valkyrn/valkyrn.png
python -I -c "from PIL import Image; im=Image.open(r'C:\Users\djuar\FTLite-assets\2mt-valkyrn\valkyrn.png'); print(im.size, im.mode)"
```
Expected: `(2240, 2240) RGBA`.

- [ ] **Step 4: Write the failing test** `tests/valkyrnArt.test.ts`

```ts
// Valkyrn spec §4.1: the 2-Minute Tabletop Valkyrn is imported raw and rotated 90° clockwise (its nose, up in the source,
// faces right like the Hound's), as the optional asset ship.valkyrn.map, credited under CC BY-NC 4.0.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importConfig, rotateImage90, type Image } from '../scripts/art/importCore';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { CREDITS } from '../src/renderer/src/render/credits.generated';

const img = (w: number, h: number): Image => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; data[i] = x; data[i + 1] = y; data[i + 2] = 7; data[i + 3] = 200; }
  return { width: w, height: h, data };
};

describe('rotateImage90 (Valkyrn spec §4.1)', () => {
  it('turns a w × h image clockwise: the source pixel (x, y) lands at (h − 1 − y, x)', () => {
    const src = img(3, 2), out = rotateImage90(src);
    expect([out.width, out.height]).toEqual([2, 3]);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
      const d = (x * out.width + (2 - 1 - y)) * 4;
      expect([...out.data.subarray(d, d + 4)]).toEqual([x, y, 7, 200]);
    }
  });
  it('the config defaults to no rotation and takes 90', () => {
    const base = { pack: 'p.png', frames: [{ x: 0, y: 0, w: 1, h: 1 }], output: 'public/assets/paid/x.png', columns: 1 };
    expect(importConfig.parse({ outputs: [base] }).outputs[0]!.rotate).toBe(0);
    expect(importConfig.parse({ outputs: [{ ...base, rotate: 90 }] }).outputs[0]!.rotate).toBe(90);
    expect(importConfig.safeParse({ outputs: [{ ...base, rotate: 45 }] }).success).toBe(false);
  });
});

describe('the Valkyrn asset', () => {
  const config = importConfig.parse(JSON.parse(readFileSync('art/import.json', 'utf8')));
  it('art/import.json imports the whole 2240 × 2240 painting raw and rotated', () => {
    expect(config.outputs.find((o) => o.output === 'public/assets/paid/2mt/valkyrn.png')).toMatchObject({
      pack: '2mt-valkyrn/valkyrn.png', frames: [{ x: 0, y: 0, w: 2240, h: 2240 }], columns: 1, remap: false, flipX: false, rotate: 90
    });
  });
  it('the manifest names it, optional, with the spec credit and modification; the battlemap feature lists it', () => {
    const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as Record<string, unknown>[];
    expect(manifest.find((e) => e.name === 'ship.valkyrn.map')).toMatchObject({
      file: 'paid/2mt/valkyrn.png', required: false, license: 'CC-BY-NC-4.0', author: '2-Minute Tabletop',
      credit: 'Valkyrn by 2-Minute Tabletop (2minutetabletop.com), CC BY-NC 4.0', modifications: 'rotated 90° clockwise by npm run art:import'
    });
    expect(FEATURE_NAMES.battlemap).toEqual(['ship.hound.map', 'ship.valkyrn.map']);
    expect(CREDITS).toContain('Valkyrn by 2-Minute Tabletop (2minutetabletop.com), CC BY-NC 4.0');
  });
  it('docs/gates.md names the Valkyrn in the 2-Minute Tabletop licence gate', () => {
    expect(readFileSync('docs/gates.md', 'utf8')).toMatch(/2-Minute Tabletop Hound and Valkyrn art and Deep Space \(Red\) backdrop \(CC BY-NC 4\.0\)/);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run tests/valkyrnArt.test.ts`
Expected: FAIL (`rotateImage90` is not exported; the import entry, the manifest entry and the gate line are missing).

- [ ] **Step 6: Implement the rotation** in `scripts/art/importCore.ts`

In the `output` schema, after `flipX`:
```ts
  /** Mirror the packed sheet left-right (Art-iv: the Hound's dome faces right). */
  flipX: z.boolean().default(false),
  /** Rotate the packed sheet clockwise by this many degrees before any flip (Valkyrn spec §4.1: its nose, up in the
   *  source, faces right). */
  rotate: z.union([z.literal(0), z.literal(90)]).default(0)
```
After `flipImageX`, add:
```ts
/** Rotate an image 90° clockwise: the source pixel (x, y) lands at (height − 1 − y, x) of a height × width image. */
export function rotateImage90(img: Image): Image {
  const out = blank(img.height, img.width);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const s = (y * img.width + x) * 4, d = (x * out.width + (img.height - 1 - y)) * 4;
    out.data.set(img.data.subarray(s, s + 4), d);
  }
  return out;
}
```
In `runImport`'s write loop, replace
```ts
    const sheet = packSheet(sources[i]!, o);
    if (o.flipX) flipImageX(sheet);
```
with
```ts
    let sheet = packSheet(sources[i]!, o);
    if (o.rotate === 90) sheet = rotateImage90(sheet);   // Valkyrn spec §4.1
    if (o.flipX) flipImageX(sheet);
```

- [ ] **Step 7: Register the Valkyrn**

`art/import.json`: append after the `2mt-hound` output:
```json
    {
      "pack": "2mt-valkyrn/valkyrn.png",
      "frames": [{ "x": 0, "y": 0, "w": 2240, "h": 2240 }],
      "output": "public/assets/paid/2mt/valkyrn.png",
      "columns": 1,
      "remap": false,
      "rotate": 90
    },
```
and extend `$comment` with ` Valkyrn: the 2-Minute Tabletop Valkyrn battlemap, raw and rotated 90 degrees clockwise.`

`public/assets/manifest.json`: insert right after the `ship.hound.map` entry:
```json
  {
    "title": "Valkyrn",
    "author": "2-Minute Tabletop",
    "source": "https://www.patreon.com/2minutetabletop",
    "license": "CC-BY-NC-4.0",
    "retrieved": "2026-11-18",
    "modifications": "rotated 90° clockwise by npm run art:import",
    "editedBy": "FTLite art import",
    "credit": "Valkyrn by 2-Minute Tabletop (2minutetabletop.com), CC BY-NC 4.0",
    "required": false,
    "file": "paid/2mt/valkyrn.png",
    "name": "ship.valkyrn.map"
  },
```
`render/assetNames.ts`, after line 34:
```ts
add('optional', 'ship.valkyrn.map');   // Valkyrn spec §4.1: the 2-Minute Tabletop Valkyrn battlemap, a paid painting
```
`render/fallback.ts` line 21 becomes:
```ts
  battlemap: ['ship.hound.map', 'ship.valkyrn.map'],   // Art-iv spec section 4, Valkyrn spec §4.1: the painted ships
```
`docs/gates.md` line 747: replace the start `- [ ] **2-Minute Tabletop Hound art and Deep Space (Red) backdrop (CC BY-NC 4.0)**: the duel ship's painting` with `- [ ] **2-Minute Tabletop Hound and Valkyrn art and Deep Space (Red) backdrop (CC BY-NC 4.0)**: the duel ships' paintings`, and append ` The Valkyrn (solo test ship, Valkyrn spec §4.1, 2026-11-18) is the same licence and needs the same permission.` to the end of that line.

Run: `npx tsx scripts/gen-credits.ts`
Expected: `wrote public/THIRD_PARTY_NOTICES.txt (<n> chars) and credits.generated.ts (<m> lines)`.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/valkyrnArt.test.ts tests/artImport.test.ts tests/manifest.test.ts tests/paidManifest.test.ts tests/credits.test.ts tests/assetNames.test.ts`
Expected: PASS. (If one of the last four does not exist, drop it from the command.)

- [ ] **Step 9: Run the real import**

Run: `npm run art:import`
Expected: it lists `wrote …\public\assets\paid\2mt\valkyrn.png` among the outputs, exit 0. `python -I -c "from PIL import Image; im=Image.open(r'public\assets\paid\2mt\valkyrn.png'); print(im.size, im.getchannel('A').getbbox())"` prints `(2240, 2240) (21, 16, 2180, 2186)`, which is the rotated bounding box (the nose is on the right). `git status --short public/assets/paid` prints nothing (gitignored).

- [ ] **Step 10: Commit**

```bash
git add scripts/art/importCore.ts art/import.json public/assets/manifest.json public/THIRD_PARTY_NOTICES.txt src/renderer/src/render/assetNames.ts src/renderer/src/render/fallback.ts src/renderer/src/render/credits.generated.ts docs/gates.md tests/valkyrnArt.test.ts
git commit -m "feat(valkyrn): import the Valkyrn painting rotated 90 degrees, asset ship.valkyrn.map, licence gate" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The Valkyrn layout, its repair points and its painting

**Files:**
- Create: `src/renderer/src/sim/ship/valkyrn.json`, `tests/valkyrn.test.ts`
- Modify: `src/renderer/src/sim/duel/tuning.ts:18-24`, `src/renderer/src/render/battlemapModel.ts:9-18`

**Interfaces:**
- Consumes: Part i's schema fields, `createDuel(layout, seed, helmPlayer, crew, cls?)`, `DuelState.crewClass`, `classIndexById`, `VALKYRN_CLASS`, `VALKYRN_LASER_CLASS`.
- Produces: `valkyrn.json` (id `valkyrn`, 19 × 7); `VALKYRN_REPAIR_POINTS`; `DUEL_REPAIR_POINTS.valkyrn`; `BATTLEMAPS.valkyrn = { name: 'ship.valkyrn.map', pxPerTile: 70, origin: { x: -7.5, y: -12.5 }, bounds: { x: -7, y: -12.1, w: 30.557, h: 30.714 } }`.

- [ ] **Step 1: Write the failing test** `tests/valkyrn.test.ts`

```ts
// Valkyrn spec §4.2, §4.3: the Valkyrn traced from the rotated 2-Minute Tabletop painting at two tiles per square
// (tile tx centred on source x = 560 + 70 tx, ty on y = 910 + 70 ty), its repair points, a duel at crew 1, and its
// painting's place (BATTLEMAPS.valkyrn), which falls back to procedural tiles when the asset is missing.
import { describe, expect, it } from 'vitest';
import valkyrnJson from '../src/renderer/src/sim/ship/valkyrn.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { DUEL_REPAIR_POINTS } from '../src/renderer/src/sim/duel/tuning';
import { classIndexById, VALKYRN_CLASS, VALKYRN_LASER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { BATTLEMAPS, battlemapFor, fitRect } from '../src/renderer/src/render/battlemapModel';

const TRACE = [
  '#############      ',
  '#EEE#RRR#LLL#######',
  '#EEE#RRR#LLL#O#BBB#',
  '#EEE+RRR+LLL+O+BBB#',
  '#EEE#RRR##+##O#BBB#',
  '#EEE#RRR#MMM#######',
  '#############      '
];

describe('the Valkyrn layout (Valkyrn spec §4.2, §4.3)', () => {
  const ship = parseShip(valkyrnJson);
  it('is 19 x 7 with the traced rows, the cockpit to the right', () => {
    expect([ship.id, ship.width, ship.height]).toEqual(['valkyrn', 19, 7]);
    expect(ship.rows).toEqual(TRACE);
  });
  it('carries the four layout fields: its class, a crew of one, the Helm holds unattended, its hull', () => {
    expect([ship.shipClass, ship.crew, ship.helmHoldsUnattended, ship.hull]).toEqual(['valkyrn', 1, true, 'valkyrn']);
  });
  it('has the six rooms of §4.3 with their systems, and no system-less rooms', () => {
    expect(ship.rooms.map((r) => [r.id, r.system])).toEqual([
      ['B', 'navigation'], ['O', 'science'], ['M', 'medbay'], ['L', 'lifeSupport'], ['E', 'engineering'], ['R', 'reactor']
    ]);
  });
  it('the doors follow the painted gaps, front to back along row 3, and the bunk off the galley', () => {
    expect(ship.edges.map((e) => [e.a, e.b, e.tile])).toEqual([['E', 'R', [4, 3]], ['R', 'L', [8, 3]], ['L', 'M', [10, 4]], ['L', 'O', [12, 3]], ['O', 'B', [14, 3]]]);
  });
  it('Flight (Navigation + Weapons) at the front pilot chair, Science/Engineering/Doors at Ops, allocations as the Hound', () => {
    expect(ship.consoleGroups).toEqual([{ tile: [17, 3], kinds: ['navigation', 'weapons'] }, { tile: [13, 2], kinds: ['science', 'engineering', 'doors'] }]);
    expect(ship.stations.map((s) => [s.id, s.room, s.tile, s.allocation])).toEqual([
      ['navigation', 'B', [17, 3], 1], ['weapons', 'B', [17, 3], 2], ['science', 'O', [13, 2], 1], ['engineering', 'O', [13, 2], 1],
      ['doors', 'O', [13, 2], 1], ['lifeSupport', 'L', [11, 1], 1], ['medbay', 'M', [9, 5], 1]
    ]);
  });
  it('spawns on the Ops floor; the ramp and the galley are airlocks; every room has a breach site', () => {
    const [sx, sy] = ship.spawns[0]!;
    expect(ship.rows[sy]![sx]).toBe('O');
    expect(ship.airlocks).toEqual([{ room: 'E', tile: [0, 3] }, { room: 'L', tile: [10, 0] }]);
    expect(new Set(ship.breachSites.map((b) => b.room))).toEqual(new Set(ship.rooms.map((r) => r.id)));
  });
  it('the repair points: Weapons in Ops, Shields in the racks, Engines on the ramp, each on an open floor tile', () => {
    const points = DUEL_REPAIR_POINTS[ship.id]!;
    expect(points.map((p) => [p.tacticalRoom, p.room, p.tile])).toEqual([[Room.Weapons, 'O', [13, 4]], [Room.Shields, 'R', [6, 3]], [Room.Engines, 'E', [2, 3]]]);
    for (const p of points) {
      expect(ship.rows[p.tile[1]]![p.tile[0]]).toBe(p.room);
      expect(ship.stations.some((s) => s.tile[0] === p.tile[0] && s.tile[1] === p.tile[1])).toBe(false);
    }
  });
  it('a duel at crew 1: one character, the Valkyrn class from the layout, or the laser fit from the argument', () => {
    const d = createDuel(ship, 7, 0, 1);
    try {
      expect(d.present).toEqual([true]);
      expect(d.interior.crew.length).toBe(1);
      expect(d.crewClass).toBe(classIndexById(VALKYRN_CLASS.id));
      expect(d.tactical.systems[0].cls).toBe(d.crewClass);
      expect(d.points.map((p) => p.tacticalRoom)).toEqual([Room.Weapons, Room.Shields, Room.Engines]);
    } finally { disposeDuel(d); }
    const l = createDuel(ship, 7, 0, 1, classIndexById(VALKYRN_LASER_CLASS.id));
    try { expect(l.tactical.systems[0].cls).toBe(classIndexById(VALKYRN_LASER_CLASS.id)); } finally { disposeDuel(l); }
    expect(() => createDuel(ship, 7, 0, 2)).toThrow();   // the layout fixes the crew at one
  });
});

describe('the Valkyrn painting (Valkyrn spec §4.2)', () => {
  const v = BATTLEMAPS.valkyrn!;
  it('70 source px a tile, image corner at (-7.5, -12.5): tile centres on the rotated painting\'s square boundaries', () => {
    expect([v.name, v.pxPerTile]).toEqual(['ship.valkyrn.map', 70]);
    const cx = (tx: number) => (tx + 0.5 - v.origin.x) * v.pxPerTile, cy = (ty: number) => (ty + 0.5 - v.origin.y) * v.pxPerTile;
    expect([cx(0), cx(4), cx(18), cy(0), cy(3), cy(6)]).toEqual([560, 840, 1820, 910, 1120, 1330]);
    expect(v.bounds).toEqual({ x: -7, y: -12.1, w: 30.557, h: 30.714 });   // the alpha > 16 box, wings and engines
  });
  it('draws only with its own asset, and a missing Valkyrn never hides the Hound', () => {
    expect(battlemapFor('valkyrn', new Set())).toBe(v);
    expect(battlemapFor('valkyrn', new Set(['ship.valkyrn.map']))).toBeNull();
    expect(battlemapFor('hound', new Set(['ship.valkyrn.map']))).toBe(BATTLEMAPS.hound);
    expect(fitRect('valkyrn', 19, 7, new Set(['ship.valkyrn.map']))).toEqual({ x: 0, y: 0, w: 19, h: 7 });
    expect(fitRect('valkyrn', 19, 7, new Set())).toEqual(v.bounds);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/valkyrn.test.ts`
Expected: FAIL (cannot resolve `valkyrn.json`).

- [ ] **Step 3: Create `src/renderer/src/sim/ship/valkyrn.json`** (verified with `parseShip` in planning; the four new fields are Part i's)

```json
{
  "id": "valkyrn",
  "version": 1,
  "shipClass": "valkyrn",
  "crew": 1,
  "helmHoldsUnattended": true,
  "hull": "valkyrn",
  "width": 19,
  "height": 7,
  "rows": [
    "#############      ",
    "#EEE#RRR#LLL#######",
    "#EEE#RRR#LLL#O#BBB#",
    "#EEE+RRR+LLL+O+BBB#",
    "#EEE#RRR##+##O#BBB#",
    "#EEE#RRR#MMM#######",
    "#############      "
  ],
  "rooms": [
    { "id": "B", "name": "Cockpit", "system": "navigation" },
    { "id": "O", "name": "Ops", "system": "science" },
    { "id": "M", "name": "Quarters (bunk)", "system": "medbay" },
    { "id": "L", "name": "Quarters (galley)", "system": "lifeSupport" },
    { "id": "E", "name": "Missile Bay (ramp)", "system": "engineering" },
    { "id": "R", "name": "Missile Bay (racks)", "system": "reactor" }
  ],
  "edges": [
    { "a": "E", "b": "R", "kind": "door", "tile": [4, 3], "width": 1 },
    { "a": "R", "b": "L", "kind": "door", "tile": [8, 3], "width": 1 },
    { "a": "L", "b": "M", "kind": "door", "tile": [10, 4], "width": 1 },
    { "a": "L", "b": "O", "kind": "door", "tile": [12, 3], "width": 1 },
    { "a": "O", "b": "B", "kind": "door", "tile": [14, 3], "width": 1 }
  ],
  "breachSites": [
    { "room": "B", "tile": [18, 3], "width": 1 },
    { "room": "O", "tile": [13, 1], "width": 1 },
    { "room": "M", "tile": [10, 6], "width": 1 },
    { "room": "L", "tile": [11, 0], "width": 1 },
    { "room": "E", "tile": [2, 0], "width": 1 },
    { "room": "R", "tile": [6, 6], "width": 1 }
  ],
  "stations": [
    { "id": "navigation", "room": "B", "tile": [17, 3], "allocation": 1 },
    { "id": "weapons", "room": "B", "tile": [17, 3], "allocation": 2 },
    { "id": "science", "room": "O", "tile": [13, 2], "allocation": 1 },
    { "id": "engineering", "room": "O", "tile": [13, 2], "allocation": 1 },
    { "id": "doors", "room": "O", "tile": [13, 2], "allocation": 1 },
    { "id": "lifeSupport", "room": "L", "tile": [11, 1], "allocation": 1 },
    { "id": "medbay", "room": "M", "tile": [9, 5], "allocation": 1 }
  ],
  "consoleGroups": [
    { "tile": [17, 3], "kinds": ["navigation", "weapons"] },
    { "tile": [13, 2], "kinds": ["science", "engineering", "doors"] }
  ],
  "spawns": [[13, 3], [9, 3], [10, 3], [11, 3]],
  "airlocks": [
    { "room": "E", "tile": [0, 3] },
    { "room": "L", "tile": [10, 0] }
  ]
}
```

- [ ] **Step 4: The repair points** in `src/renderer/src/sim/duel/tuning.ts`

After `HOUND_REPAIR_POINTS`:
```ts
/** Valkyrn spec §4.3: the Valkyrn's repair points, one per tactical Room, each on an open floor tile: Weapons in Ops (as the
 *  Hound's), Shields in the missile bay's rack half, Engines on its ramp half. */
export const VALKYRN_REPAIR_POINTS: readonly { tacticalRoom: number; room: string; tile: readonly [number, number] }[] = [
  { tacticalRoom: Room.Weapons, room: 'O', tile: [13, 4] },
  { tacticalRoom: Room.Shields, room: 'R', tile: [6, 3] },
  { tacticalRoom: Room.Engines, room: 'E', tile: [2, 3] }
];
```
and the record line becomes:
```ts
export const DUEL_REPAIR_POINTS: Readonly<Record<string, typeof CUTTER_REPAIR_POINTS>> = { cutter: CUTTER_REPAIR_POINTS, hound: HOUND_REPAIR_POINTS, valkyrn: VALKYRN_REPAIR_POINTS };
```

- [ ] **Step 5: The painting** in `src/renderer/src/render/battlemapModel.ts`

Replace the `BATTLEMAPS` constant and `battlemapFor` with:
```ts
/** Hound: 140 px squares at two tiles a square; mirrored, so source x = 420 + 70 tx at a tile centre (Art-iv spec section 1).
 *  Valkyrn (Valkyrn spec §4.2): rotated 90° clockwise, source x = 560 + 70 tx and y = 910 + 70 ty at a tile centre; the bounds
 *  are the painting's alpha > 16 box, wings and engines included. */
export const BATTLEMAPS: Readonly<Record<string, BattlemapDef>> = {
  hound: { name: 'ship.hound.map', pxPerTile: 70, origin: { x: -5.5, y: -3.5 }, bounds: { x: -4.871, y: -2.486, w: 28.057, h: 19.8 } },
  valkyrn: { name: 'ship.valkyrn.map', pxPerTile: 70, origin: { x: -7.5, y: -12.5 }, bounds: { x: -7, y: -12.1, w: 30.557, h: 30.714 } }
};

/** The painting for `layoutId`, or null when the layout has none or its own asset is missing (the procedural fallback
 *  draws). Valkyrn spec §4.1: only the layout's own asset counts, so one missing painting never hides another. */
export function battlemapFor(layoutId: string, missing: ReadonlySet<string>): BattlemapDef | null {
  const def = BATTLEMAPS[layoutId];
  return def && !missing.has(def.name) ? def : null;
}
```
Remove the now-unused `featureReady` import from this file.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/valkyrn.test.ts tests/battlemapModel.test.ts tests/hound.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 7: The Hound did not move**

Run: `npx tsx scripts/golden/duel-oracle.ts same` then `npx tsx scripts/golden/canonical-trace.ts same`
Expected: both exit 0, reporting Task 1's `<R>`, `<T>` and `<F>` unchanged at sim version 53.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim/ship/valkyrn.json src/renderer/src/sim/duel/tuning.ts src/renderer/src/render/battlemapModel.ts tests/valkyrn.test.ts
git commit -m "feat(valkyrn): the Valkyrn traced from the painting (19x7), its repair points and battlemap entry" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The silhouette, the fleet's solo list, and the id-literal and parity tests

**Files:**
- Modify: `src/renderer/src/render/tactical/hullModel.ts:5,41,44`, `src/renderer/src/render/tactical/tacticalModel.ts:109-140,328`, `src/renderer/src/app/duel/scene.ts` (the `tacticalModel` input), `src/renderer/src/sim/ship/fleet.ts`, `src/renderer/src/render/hudModel.ts:345`, `tests/hullModel.test.ts`, `tests/crtColours.test.ts`
- Create: `tests/noShipIdLiterals.test.ts`, `tests/shipParity.test.ts`

**Interfaces:**
- Produces: `HullId = 'hound' | 'scout' | 'valkyrn'`; `isHullId(v: unknown): v is HullId`; `hullFor(crew: boolean, layoutHull?: string): HullId`; `TacticalModelInput.crewHull?: HullId`; `SOLO_SHIPS` (readonly `{ id, name, line, layout, laserFit }[]`); `type SoloShipId`; `DEFAULT_SOLO_SHIP`; `isSoloShipId(v)`; `soloShip(id)`; `tubeLoadsItself(id: ShipId)`.

- [ ] **Step 1: Write the failing tests**

`tests/noShipIdLiterals.test.ts`:
```ts
// Valkyrn spec §3.2: no code branches on a ship or class id. The quoted ids appear only in the data files that define them.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(process.cwd(), 'src', 'renderer', 'src');
const ALLOWED = new Set(['sim/tactical/defs.ts', 'sim/duel/tuning.ts', 'render/battlemapModel.ts', 'render/tactical/hullModel.ts', 'render/assetNames.ts', 'sim/ship/fleet.ts', 'render/credits.generated.ts']);
export const SHIP_ID_LITERAL = /(['"])(hound|cutter|valkyrn|valkyrnLaser|scout)\1/;
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []; });

describe('no ship or class id literals outside the data files (Valkyrn spec §3.2)', () => {
  it('the pattern catches both quote styles and leaves the ai profile alone', () => {
    for (const s of [`x === 'cutter'`, `"valkyrnLaser"`, `hull: 'scout'`]) expect(SHIP_ID_LITERAL.test(s), s).toBe(true);
    for (const s of [`ai === 'hunter'`, `'ship.hound.map'`, `'valkyrns'`]) expect(SHIP_ID_LITERAL.test(s), s).toBe(false);
  });
  it('src/renderer/src has none outside the allowed files', () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file).split(sep).join('/');
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, k) => { if (SHIP_ID_LITERAL.test(line)) offenders.push(`${rel}:${k + 1}: ${line.trim()}`); });
    }
    expect(offenders).toEqual([]);
  });
});
```

`tests/shipParity.test.ts`:
```ts
// Valkyrn spec §3.3: every ship in the Single player picker has what the Hound has: every station kind, every room system,
// one repair point per tactical Room, an airlock, and a breach site in each room whose system the Hound has. Allowed
// differences: Navigation and Weapons in one seat; rooms with no system are not compared. A Hound feature that adds a
// station kind or a system fails here until the other ships get it.
import { describe, expect, it } from 'vitest';
import houndJson from '../src/renderer/src/sim/ship/hound.json';
import { parseShip, type ShipLayout } from '../src/renderer/src/sim/ship/schema';
import { SOLO_SHIPS } from '../src/renderer/src/sim/ship/fleet';
import { DUEL_REPAIR_POINTS } from '../src/renderer/src/sim/duel/tuning';

const hound = parseShip(houndJson);
const systems = (s: ShipLayout): Set<string> => new Set(s.rooms.flatMap((r) => (r.system === null ? [] : [r.system])));
const points = (s: ShipLayout): number[] => (DUEL_REPAIR_POINTS[s.id] ?? []).map((p) => p.tacticalRoom).sort();
const groups = (s: ShipLayout): string[] => s.consoleGroups.map((g) => [...g.kinds].sort().join('+')).filter((k) => k !== 'navigation+weapons').sort();

describe('ship parity with the Hound (Valkyrn spec §3.3)', () => {
  it('the picker lists the Hound first, then the Valkyrn', () => { expect(SOLO_SHIPS.map((s) => s.id)).toEqual(['hound', 'valkyrn']); });
  for (const entry of SOLO_SHIPS) it(`${entry.name} has every Hound station, system, repair point, an airlock and a breach site per system room`, () => {
    const ship = parseShip(entry.layout);
    expect(new Set(ship.stations.map((s) => s.id))).toEqual(new Set(hound.stations.map((s) => s.id)));
    for (const sys of systems(hound)) expect(systems(ship).has(sys), `system ${sys}`).toBe(true);
    expect(points(ship)).toEqual(points(hound));
    expect(ship.airlocks.length).toBeGreaterThanOrEqual(1);
    for (const r of ship.rooms) if (r.system !== null && systems(hound).has(r.system)) expect(ship.breachSites.some((b) => b.room === r.id), `breach site in ${r.id}`).toBe(true);
    expect(groups(ship)).toEqual(groups(hound));   // only the combined Flight seat may differ
  });
});
```

`tests/hullModel.test.ts`:
- `const ids: HullId[] = ['hound', 'scout'];` becomes `const ids: HullId[] = ['hound', 'scout', 'valkyrn'];`.
- In "have the spec vertex counts", add `expect(HULLS.valkyrn.outline.length / 2).toBe(53);`.
- In "stay inside their rings", add `expect(maxRadius(HULLS.valkyrn.outline)).toBeLessThanOrEqual(1.55);`.
- Replace "the crew flies the Hound and the enemy the scout" with:
```ts
  it('the crew flies its layout\'s hull (the Hound by default), the enemy the scout (Valkyrn spec §3.2, §4.5)', () => {
    expect(hullFor(true)).toBe('hound');
    expect(hullFor(true, 'valkyrn')).toBe('valkyrn');
    expect(hullFor(true, 'nonsense')).toBe('hound');
    expect(hullFor(false, 'valkyrn')).toBe('scout');
    expect([isHullId('valkyrn'), isHullId('cutter'), isHullId(3)]).toEqual([true, false, false]);
    expect(roomCentre('valkyrn', 0).f).toBeGreaterThan(roomCentre('valkyrn', 1).f);   // Weapons (Ops) fore of Shields (racks) fore of Engines (ramp)
    expect(roomCentre('valkyrn', 1).f).toBeGreaterThan(roomCentre('valkyrn', 2).f);
  });
```
and add `isHullId` to its import.

`tests/crtColours.test.ts`: in `fullFrame`'s ship list, change `ship({ index: 4, x: 420, y: 520, rooms: [0, 1, 2] })` to `ship({ index: 4, x: 420, y: 520, rooms: [0, 1, 2], hull: 'valkyrn' })`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/noShipIdLiterals.test.ts tests/shipParity.test.ts tests/hullModel.test.ts tests/crtColours.test.ts`
Expected: FAIL. The literal test lists `render/hudModel.ts:345`. `SOLO_SHIPS` does not exist yet. `HULLS.valkyrn` is undefined.

- [ ] **Step 3: The hull** in `src/renderer/src/render/tactical/hullModel.ts`

Line 5 becomes `export type HullId = (typeof HULL_IDS)[number];   // Valkyrn spec §4.5: 'hound' | 'scout' | 'valkyrn', Part i's list (Decision 6)`, and add `import type { HULL_IDS } from '../../sim/ship/fleet';` to the imports (a type-only import: `typeof` of a value imported with `import type` is allowed, and nothing reaches the bundle). After `SCOUT` add:
```ts
/** Valkyrn spec §4.5: traced from the bought 2-Minute Tabletop painting, rotated so the nose is +f, by the Hound's steps
 *  (downscale 8, alpha 50 %, 3 px close, Moore trace, Douglas-Peucker 2.5 px, length 2.4 units). The rooms are widened over
 *  the wing roots to the 0.2 floor: Weapons over Ops, Shields the missile bay's rack half, Engines its ramp half. */
const VALKYRN: Hull = {
  outline: [
    -0.611, -1.201, -0.375, -1.191, -0.302, -1.146, -0.393, -1.091, 0.117, -0.264, 0.662, -0.155, 0.717, -0.155, 0.726, -0.227,
    0.762, -0.246, 0.926, -0.1, 1.099, -0.082, 1.199, 0, 1.117, 0.073, 0.944, 0.082, 0.817, 0.227, 0.753, 0.227,
    0.717, 0.146, 0.662, 0.146, 0.126, 0.255, -0.393, 1.101, -0.302, 1.173, -0.393, 1.201, -0.593, 1.201, -0.684, 1.164,
    -0.675, 1.128, -0.566, 1.082, -0.447, 0.573, -0.438, 0.418, -0.493, 0.309, -0.611, 0.209, -0.72, 0.2, -0.929, 0.555,
    -1.002, 0.555, -1.066, 0.491, -1.029, 0.218, -1.175, 0.2, -1.193, 0.155, -1.193, 0.045, -1.111, 0, -1.111, -0.036,
    -1.175, -0.055, -1.193, -0.1, -1.193, -0.209, -1.029, -0.246, -1.048, -0.564, -0.929, -0.555, -0.729, -0.218, -0.611, -0.236,
    -0.447, -0.427, -0.438, -0.582, -0.557, -1.091, -0.684, -1.146, -0.675, -1.182
  ],
  rooms: [
    [0.68, -0.13, 0.68, 0.12, 0.08, 0.23, 0.08, -0.24],
    [-0.02, -0.4, -0.02, 0.4, -0.28, 0.4, -0.28, -0.4],
    [-0.3, -0.42, -0.3, 0.42, -0.48, 0.28, -0.7, 0.1, -0.7, -0.1, -0.48, -0.28]
  ]
};
```
Then replace the `HULLS` and `hullFor` lines with:
```ts
export const HULLS: Readonly<Record<HullId, Hull>> = Object.freeze({ hound: freeze(HOUND), scout: freeze(SCOUT), valkyrn: freeze(VALKYRN) });

/** Whether `v` names a hull: the view's guard on a layout's `hull` (the schema already limits it to HULL_IDS, Decision 6). */
export function isHullId(v: unknown): v is HullId { return typeof v === 'string' && Object.prototype.hasOwnProperty.call(HULLS, v); }
/** Valkyrn spec §3.2, §4.5: the crew's ship flies its layout's hull (the Hound's when the layout has none); the enemy is the scout. */
export function hullFor(crew: boolean, layoutHull?: string): HullId { return !crew ? 'scout' : isHullId(layoutHull) ? layoutHull : 'hound'; }
```

- [ ] **Step 4: The crew hull reaches the map**

`render/tactical/tacticalModel.ts`, in `TacticalModelInput` after `t?: number;`:
```ts
  /** Valkyrn spec §4.5: the crew ship's silhouette (hullFor(true, layout.hull)); absent: the Hound's. */
  crewHull?: HullId;
```
At line 328, replace `hull: hullFor(i === 0)` with `hull: i === 0 ? input.crewHull ?? hullFor(true) : hullFor(false)`.

`app/duel/scene.ts`: in the `input` object built for `tacticalModel` (the line ending `gravity: view === 'helm', alert, pings   // Feel-ii`), add `crewHull: hullFor(true, d.interior.layout.hull),` before `gravity:`, and add `import { hullFor } from '../../render/tactical/hullModel';`.

- [ ] **Step 5: The fleet's solo list and the lobby line**

`src/renderer/src/sim/ship/fleet.ts` becomes the following. Its last line is Part i's `HULL_IDS` export (Part i Task 3 Step 4), kept as it is: `schema.ts` imports it.
```ts
import cutter from './cutter.json';
import hound from './hound.json';
import skiff from './skiff.json';
import valkyrn from './valkyrn.json';

/** Which ship flies (spec Art-iv-b): the Hound at every crew size. App policy; the Skiff, Cutter and starter stay as
 *  layouts for tests, gates and fixed-layout scenarios. */
export type ShipId = 'skiff' | 'cutter' | 'hound';
export function shipForCrew(_players: number): ShipId { return 'hound'; }
const LINES: Record<ShipId, string> = { skiff: 'Ship: Skiff (2 crew)', cutter: 'Ship: Cutter (4 crew)', hound: 'Ship: Hound (4 crew)' };
/** The lobby line under the title, for the players joined so far (none joined reads as one). */
export function shipLine(players: number): string { return LINES[shipForCrew(Math.max(1, players))]; }
/** The fleet's raw layouts, read field by field (Valkyrn spec §3.2: no id compares outside this file). */
const FLEET: Readonly<Record<ShipId, { magazine?: readonly number[] }>> = { skiff, cutter, hound };
/** Whether a fleet ship's torpedo tube loads itself: its layout has no magazine tile (the lobby card's helm line). */
export function tubeLoadsItself(id: ShipId): boolean { return FLEET[id].magazine === undefined; }

/** Valkyrn spec §9: the Single player ship choice, in picker order. `laserFit` is the developer switch's class (§8), null
 *  for a ship with none. Multiplayer stays on shipForCrew. */
export const SOLO_SHIPS = [
  { id: 'hound', name: 'Hound', line: 'crew of two, Tab between them', layout: hound, laserFit: null },
  { id: 'valkyrn', name: 'Valkyrn', line: 'solo fighter: mouse to fly, gun and torpedoes', layout: valkyrn, laserFit: 'valkyrnLaser' }
] as const;
export type SoloShipId = (typeof SOLO_SHIPS)[number]['id'];
export const DEFAULT_SOLO_SHIP: SoloShipId = SOLO_SHIPS[0].id;
export function isSoloShipId(v: unknown): v is SoloShipId { return SOLO_SHIPS.some((s) => s.id === v); }
/** The solo ship `id` (the first when unknown). */
export function soloShip(id: string): (typeof SOLO_SHIPS)[number] { return SOLO_SHIPS.find((s) => s.id === id) ?? SOLO_SHIPS[0]; }

/** The console-map silhouettes a layout's `hull` field may name (Valkyrn spec §3.1, §4.5); render/tactical/hullModel.ts
 *  draws one per id. Kept here, a file allowed ship id literals (spec §3.2), so the schema carries none. */
export const HULL_IDS = ['hound', 'scout', 'valkyrn'] as const;
```
`render/hudModel.ts:345` becomes (import `tubeLoadsItself` beside `shipForCrew`):
```ts
export function lobbyLines(players: number): string[] { return tubeLoadsItself(shipForCrew(Math.max(1, players))) ? LOBBY_LINES.map((l, k) => (k === 8 ? SKIFF_HELM_LINE : l)) : [...LOBBY_LINES]; }
```
Leave `sim/ship/schema.ts` as Part i wrote it (Decision 6). Any other offender the literal test lists under `src/renderer/src` is a site that branches on an id: change it to read a layout or class field instead, and record the site in the commit message.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/noShipIdLiterals.test.ts tests/shipParity.test.ts tests/hullModel.test.ts tests/crtColours.test.ts tests/tacticalModel.test.ts tests/hud.test.ts tests/hudFit.test.ts tests/fleet.test.ts`
Expected: PASS (drop `tests/fleet.test.ts` if it does not exist).

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 7: The Hound did not move**

Run: `npx tsx scripts/golden/duel-oracle.ts same` then `npx tsx scripts/golden/canonical-trace.ts same`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/render/tactical/hullModel.ts src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/app/duel/scene.ts src/renderer/src/sim/ship/fleet.ts src/renderer/src/render/hudModel.ts tests/noShipIdLiterals.test.ts tests/shipParity.test.ts tests/hullModel.test.ts tests/crtColours.test.ts
git commit -m "feat(valkyrn): the Valkyrn silhouette, hullFor from the layout, the solo ship list; no id literals and ship parity tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Flight seat and the runtime at a crew of one

**Files:**
- Modify: `src/renderer/src/app/duel/controls.ts:10-16`, `app/duel/input.ts` (`PointerSource`, `createPointerSource`), `app/duel/mapRequests.ts`, `app/duel/runtime.ts`, `app/duel/duelMode.ts`, `app/duel/contactController.ts`, `app/duel/scene.ts`, `render/duel/consoleModel.ts`, `render/duel/sitModel.ts`, `render/duel/contactModel.ts` and `render/duel/scienceModel.ts` (the station unions), `ui/duel/TabStrip.tsx`, `tests/duelInput.test.ts` (the left button), `src/renderer/src/render/duel/readoutModel.ts` (Sci-2's `crewStatus`, one line), `src/renderer/src/net/duelRecord.ts` (the per-player array bound)
- Create: `tests/valkyrnRuntime.test.ts`

**Interfaces:**
- Consumes: Part i's `HeldInput.aim` / `gunHeld`, the combined Navigation + Weapons group at crew 1, `layout.helmHoldsUnattended`, `classOf(...).slots.gun`.
- Produces:
  - `Seat`, `DuelView` and `ConsoleStation` gain `'flight'`;
  - `flightSeat(d): boolean`; `viewCamera(view): 'helm' | 'weapons' | 'science'`;
  - `PointerSource.leftHeld(): boolean`;
  - `MapRequests.steer(h)` / `takeSteer()` and `launch()` / `takeLaunches()`;
  - `DuelRuntimeDeps.cls?`, `takeSteer?`, `takeLaunches?`, `gunHeld?`;
  - `ConsoleModelInput.shipView?`; `consoleTabs` input `flight?` / `shipView?`;
  - `ConsoleView.tabs` typed `ConsoleTabs` (the `flight` key only on a Flight layout);
  - `HelmPanel.flight?`; `SitSeat` gains `'flight'`; `ContactSync.laser?`.

- [ ] **Step 1: Write the failing test** `tests/valkyrnRuntime.test.ts`

```ts
// Valkyrn spec §4.4, §5, §5.1: the local runtime at a crew of one (one character, no presence for a second, no Tab swap,
// held n long), the Flight seat's bindings (the pointer bearing as aim, the left button as gunHeld, the right button as a
// torpedo, Space auto-face, W/S throttle, Q/E the torpedo's room), Tab between the console and the ship view, the out-of-seat
// rule's axes, and the console's FLIGHT tab and sit card.
import { describe, expect, it } from 'vitest';
import valkyrnJson from '../src/renderer/src/sim/ship/valkyrn.json';
import houndJson from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { emptyPresses, NO_HELD_FLAGS, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { flightSeat, seatOf } from '../src/renderer/src/app/duel/controls';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { sitDown } from '../src/renderer/src/sim/stations';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { throttleThrust } from '../src/renderer/src/sim/duel/throttle';
import { classIndexById, VALKYRN_CLASS, VALKYRN_LASER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { missileOf, Outcome } from '../src/renderer/src/sim/tactical/state';
import { consoleModel, consoleTabs } from '../src/renderer/src/render/duel/consoleModel';
import { SIT_CARDS } from '../src/renderer/src/render/duel/sitModel';
import type { DuelRoundRecord } from '../src/renderer/src/sim/duel/summary';
import { soloDuelRecord, validateDuelRecord } from '../src/renderer/src/net/duelRecord';
import { inTorpedoRange } from './helpers/torpedoRange';

const layout = parseShip(valkyrnJson);
const TICK_MS = 1000 / 60;
function fakeTime() {
  let now = 0, seq = 0;
  const tasks: { at: number; seq: number; cb: () => void }[] = [];
  return {
    now: () => now,
    scheduler: { schedule(delay: number, cb: () => void) { const t = { at: now + delay, seq: seq++, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    advance(ms: number) {
      const end = now + ms;
      for (;;) { tasks.sort((a, b) => a.at - b.at || a.seq - b.seq); const t = tasks[0]; if (!t || t.at > end) break; tasks.shift(); now = Math.max(now, t.at); t.cb(); }
      now = end;
    }
  };
}
const idle = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });
function rig(o: { cls?: number; onRound?: (r: DuelRoundRecord) => void } = {}) {
  const time = fakeTime();
  let keys = idle(), steer: number | null = null, launches = 0, gun = false;
  const rt = createDuelRuntime({
    now: time.now, scheduler: time.scheduler, seed: 5, viewport: { w: 1280, h: 720 }, layout, cls: o.cls, onRound: o.onRound,
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    takeSteer: () => { const s = steer; steer = null; return s; }, takeLaunches: () => { const n = launches; launches = 0; return n; }, gunHeld: () => gun,
    clearKeys: () => { keys = idle(); }
  });
  const press = (...actions: KeyAction[]): void => { const p = { ...keys.presses }; for (const a of actions) p[a]++; keys = { ...keys, presses: p }; };
  const hold = (h: Partial<Omit<KeySample, 'presses'>>): void => { keys = { ...keys, ...h }; };
  const tick = (): void => { rt.frame(1 / 60); time.advance(TICK_MS); rt.frame(1 / 60); };
  const ticks = (n: number): void => { for (let k = 0; k < n; k++) tick(); };
  const sit = (): void => sitDown(rt.duel.interior, 0, rt.duel.nav);
  return { rt, time, press, hold, tick, ticks, sit, steerTo: (h: number) => { steer = h; }, launch: () => { launches++; }, holdGun: (on: boolean) => { gun = on; } };
}

describe('the runtime at a crew of one (Valkyrn spec §4.4)', () => {
  it('one character: no presence for a second, held one long, the Valkyrn class', () => {
    const { rt, tick } = rig();
    tick();
    expect(rt.duel.present).toEqual([true]);
    expect(rt.held().length).toBe(1);
    expect(rt.lastResults().filter((r) => r.id.player !== 0)).toEqual([]);
    expect(rt.duel.tactical.systems[0].cls).toBe(classIndexById(VALKYRN_CLASS.id));
    expect([rt.active(), rt.view()]).toEqual([0, 'interior']);
    rt.dispose();
  });
  it('the laser fit: the cls argument is the crew class, kept in the duel', () => {
    const { rt, tick } = rig({ cls: classIndexById(VALKYRN_LASER_CLASS.id) });
    tick();
    expect([rt.duel.crewClass, rt.duel.tactical.systems[0].cls]).toEqual([classIndexById(VALKYRN_LASER_CLASS.id), classIndexById(VALKYRN_LASER_CLASS.id)]);
    rt.dispose();
  });
  it('Tab: no swap on foot; seated, it toggles the Flight console and the ship view and keeps the seat', () => {
    const { rt, press, tick, sit } = rig();
    press('switch'); tick();
    expect([rt.active(), rt.view()]).toEqual([0, 'interior']);
    sit(); tick();
    expect([seatOf(rt.duel, 0), rt.view()]).toEqual(['flight', 'flight']);
    press('switch'); tick();
    expect([seatOf(rt.duel, 0), rt.view()]).toEqual(['flight', 'interior']);
    press('switch'); tick();
    expect(rt.view()).toBe('flight');
    rt.dispose();
  });
  it('a decided round at crew 1 is a valid solo record', () => {
    const rounds: DuelRoundRecord[] = [], { rt, tick } = rig({ onRound: (r) => rounds.push(r) });
    tick();
    rt.duel.tactical.systems[rt.duel.tactical.systems[0].target]!.hull = 0; tick();
    expect(rt.duel.tactical.outcome).toBe(Outcome.CrewWins);
    expect(rounds).toHaveLength(1);
    expect(validateDuelRecord(soloDuelRecord(rounds[0]!, { seat: 0, helmPlayer: 0, startedAtIso: '2026-11-18T12:00:00.000Z', pauses: 0 }))).toMatchObject({ session: 'solo' });
    rt.dispose();
  });
});

describe('the Flight seat (Valkyrn spec §5, §5.1)', () => {
  it('Navigation and Weapons share one group on the Valkyrn only', () => {
    const v = createDuel(layout, 3, 0, 1), h = createDuel(parseShip(houndJson), 3);
    try { expect([flightSeat(v), flightSeat(h)]).toEqual([true, false]); } finally { disposeDuel(v); disposeDuel(h); }
  });
  it('sends aim from the pointer bearing, gunHeld from the left button, face from Space; the bearing stays after a release', () => {
    const { rt, tick, ticks, sit, steerTo, holdGun, hold, press } = rig();
    sit(); tick();
    steerTo(64); holdGun(true); hold({ fireHeld: true }); tick();
    expect(rt.held()[0]).toMatchObject({ aim: 64, gunHeld: true, face: true });
    holdGun(false); hold({ fireHeld: false }); tick();
    expect(rt.held()[0]!.gunHeld).toBeUndefined();
    expect(rt.held()[0]!.aim).toBe(64);
    press('stand'); ticks(2);
    expect(seatOf(rt.duel, 0)).toBe('standing');
    expect(rt.held()[0]!.aim).toBeUndefined();
    rt.dispose();
  });
  it('the ship view sends no gun, no new bearing and no turn keys (Decision 11)', () => {
    const { rt, tick, sit, steerTo, holdGun, press, hold } = rig();
    sit(); tick(); steerTo(32); tick();
    press('switch'); tick();
    steerTo(96); holdGun(true); hold({ moveX: -1, fireHeld: true }); tick();
    expect(rt.held()[0]).toMatchObject({ aim: 32, moveX: 0 });
    expect(rt.held()[0]!.gunHeld).toBeUndefined();
    expect(rt.held()[0]!.face).toBeUndefined();
    rt.dispose();
  });
  it('the right button launches a torpedo in range', () => {
    const { rt, tick, sit, launch } = rig();
    sit(); tick();
    inTorpedoRange(rt.duel.tactical);
    launch(); tick();
    expect(missileOf(rt.duel.tactical, 0)).not.toBeNull();
    rt.dispose();
  });
  it('W/S throttle; E and Q step the torpedo room from none', () => {
    const { rt, tick, sit, press } = rig();
    sit(); tick();
    press('throttleUp'); tick();
    expect(rt.duel.throttle).toBe(1);
    press('interact'); tick();
    expect(rt.duel.tactical.systems[0].torpLock).toBe(0);
    press('prevLock'); tick();
    expect(rt.duel.tactical.systems[0].torpLock).toBe(2);
    rt.dispose();
  });
  it('out of the seat the Valkyrn flies its throttle and last bearing (helmHoldsUnattended)', () => {
    const { rt, tick, ticks, sit, press, steerTo } = rig();
    sit(); tick(); steerTo(64); press('throttleUp', 'throttleUp'); ticks(3);
    press('stand'); ticks(3);
    expect(seatOf(rt.duel, 0)).toBe('standing');
    expect(rt.duel.holdHeading).toBe(64);
    expect(rt.axes().thrust).toBe(throttleThrust(rt.duel.throttle));
    expect(rt.axes().thrust).not.toBe(0);
    rt.dispose();
  });
});

describe('the Flight console tabs, the sit card and the contact keys (Valkyrn spec §5, §9)', () => {
  it('FLIGHT current while seated; open to sit on foot; in the ship view SHIP current with FLIGHT on Tab; the Hound keeps four tabs', () => {
    expect(consoleTabs({ seat: 'flight', reach: null, repairNear: false, otherSeat: 'standing', mode: 'single', flight: true }))
      .toMatchObject({ tabs: { flight: 'current', ship: 'open', helm: 'locked', weapons: 'locked' }, tabActions: { ship: 'stand' } });
    expect(consoleTabs({ seat: 'standing', reach: 'flight', repairNear: false, otherSeat: 'standing', mode: 'single', flight: true }))
      .toMatchObject({ tabs: { flight: 'open', ship: 'current' }, tabActions: { flight: 'interact' } });
    expect(consoleTabs({ seat: 'flight', reach: null, repairNear: false, otherSeat: 'standing', mode: 'single', flight: true, shipView: true }))
      .toMatchObject({ tabs: { flight: 'open', ship: 'current' }, tabActions: { flight: 'switch' } });
    expect(Object.keys(consoleTabs({ seat: 'helm', reach: null, repairNear: false, otherSeat: 'standing', mode: 'single' }).tabs).sort()).toEqual(['helm', 'science', 'ship', 'weapons']);
  });
  it('the Flight console shows the Helm block with the flight flag', () => {
    const d = createDuel(layout, 3, 0, 1);
    try {
      sitDown(d.interior, 0, d.nav);
      const v = consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })!;
      expect([v.station, v.helm?.flight, v.weapons]).toEqual(['flight', true, null]);
      const ship = consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, shipView: true })!;
      expect([ship.station, ship.helm]).toEqual(['ship', null]);
    } finally { disposeDuel(d); }
  });
  it('the Flight sit card reads the spec line', () => {
    const c = SIT_CARDS.flight;
    expect([c.title, ...c.keys].join(' · ')).toBe('FLIGHT: MOUSE TO STEER · W/S THROTTLE · L-CLICK GUN · R-CLICK TORPEDO');
  });
  it('on the Flight seat 2 picks the torpedo up; 1 only with a laser; T opens the window', () => {
    const sync = (c: ReturnType<typeof createContactController>, laser: boolean) => c.sync({ shown: true, station: 'flight', target: 1, active: () => true, epoch: 0, enemyKnown: 2, laser });
    const gun = createContactController(); sync(gun, false);
    expect(gun.intercept('Digit1')).toBe(false);
    expect(gun.intercept('Digit2')).toBe(true);
    expect(gun.aimWeapon()).toBe('torpedo');
    const fit = createContactController(); sync(fit, true);
    expect(fit.intercept('Digit1')).toBe(true);
    expect(fit.aimWeapon()).toBe('laser');
    const t = createContactController(); sync(t, false);
    expect(t.intercept('KeyT')).toBe(true);
    expect(t.state()).toMatchObject({ contact: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/valkyrnRuntime.test.ts`
Expected: FAIL. `flightSeat` is not exported, the runtime builds a crew of two (it throws: the layout's `crew` is 1), and `SIT_CARDS.flight` is undefined.

- [ ] **Step 3: The seat** in `app/duel/controls.ts`

Replace the `Seat` type and `seatOf` with:
```ts
export type Seat = 'helm' | 'weapons' | 'science' | 'flight' | 'standing';

/** Valkyrn spec §5: Navigation and Weapons share one console group (the Flight seat: Helm and Weapons in one). */
export function flightSeat(d: DuelState): boolean {
  const g = d.interior.derived.stationGroup[d.nav];
  return g !== undefined && g >= 0 && g === d.interior.derived.stationGroup[d.weapons];
}

/** Where player pid's character is: seated at Navigation (the Helm), at Weapons, at both (the Flight seat, Valkyrn spec §5),
 *  at Science (Sci-1 spec §6.1), or standing. A player the duel does not have (n = 1's player 1) is standing. */
export function seatOf(d: DuelState, pid: number): Seat {
  const eid = d.interior.crew[pid];
  if (eid === undefined) return 'standing';
  const station = Seated.station[eid]!;
  if (station >= 0 && (station === d.nav || station === d.weapons) && flightSeat(d)) return 'flight';
  return station === d.nav ? 'helm' : station === d.weapons ? 'weapons' : d.science >= 0 && station === d.science ? 'science' : 'standing';
}
```

- [ ] **Step 4: Pointer and map requests**

`app/duel/input.ts`, `PointerSource`: after `takeMiddleClick(): ...;` add
```ts
  /** Valkyrn spec §5.1: whether the left button is held on the canvas now (the Flight seat's gun). */
  leftHeld(): boolean;
```
`createPointerSource`'s signature gains a third parameter, `release?: EventSource`: the window, whose `pointerup` and `blur` end a left-button hold that left the canvas (Decision 12). In `createPointerSource`:
- add `left = false` to the `let` list;
- in `move`, after `else if ((e.buttons & DRAG_BUTTONS) === 0) dragging = false;` add `if ((e.buttons & 1) === 0) left = false;`;
- in `downFn`, replace `else if (e.button === 0) click = { x: p.x, y: p.y };   // the contact window's map click (spec §6.2)` with `else if (e.button === 0) { click = { x: p.x, y: p.y }; left = true; }   // the contact window's map click (spec §6.2); Valkyrn: the gun`;
- in `upFn` add `if (e.button === 0) left = false;`;
- in `clear` add `left = false;`;
- after the `for (const [type, fn] of on) target.addEventListener(…)` line add:
```ts
  // Valkyrn spec §5.1: a left-button hold ends wherever it is released, or when the window loses focus (Decision 12).
  const releaseUp = (e: PointerEventLike): void => { if (e.button === 0) left = false; }, releaseBlur = (): void => { left = false; };
  release?.addEventListener('pointerup', releaseUp as (e: never) => void);
  release?.addEventListener('blur', releaseBlur as (e: never) => void);
```
- in `destroy`, after the `removeEventListener` loop, add `release?.removeEventListener('pointerup', releaseUp as (e: never) => void); release?.removeEventListener('blur', releaseBlur as (e: never) => void);`;
- in the returned object add `leftHeld: () => left,`.

`app/duel/duelMode.ts`: the `createPointerSource(canvas as unknown as EventSource, (cx, cy) => { … })` call gains `window as unknown as EventSource` as its third argument.

`tests/duelInput.test.ts`, add to the pointer source's `describe` (it has `fakeTarget` and `half`):
```ts
  it('Valkyrn spec §5.1: the left button is held from a canvas press until a release anywhere or a blur', () => {
    const t = fakeTarget(), w = fakeTarget(), p = createPointerSource(t, half, w);
    const ev = (button: number, buttons: number) => ({ clientX: 10, clientY: 10, button, buttons, preventDefault: vi.fn() });
    expect(p.leftHeld()).toBe(false);
    t.fire('pointerdown', ev(0, 1)); expect(p.leftHeld()).toBe(true);
    w.fire('pointerup', ev(0, 0)); expect(p.leftHeld()).toBe(false);          // released over the side tools
    t.fire('pointerdown', ev(0, 1)); w.fire('blur', {}); expect(p.leftHeld()).toBe(false);   // alt-tab
    t.fire('pointerdown', ev(0, 1)); t.fire('pointerup', ev(0, 0)); expect(p.leftHeld()).toBe(false);
    p.destroy(); expect(w.count()).toBe(0);
  });
```

No test builds a `PointerSource` object by hand on sci-2 (the tests that use one call `createPointerSource` on a fake target), so no fake needs `leftHeld`.

`app/duel/mapRequests.ts` becomes:
```ts
// Feel-ii (spec 2026-11-18-feel-ii-design §1.1): what the Helm map's right button asked the duel mode to send since the
// last take: a held heading (a heading index 0..255, or −1 to clear it). Valkyrn spec §5.1: the Flight map's pointer bearing
// (the latest) and its right-button presses (torpedo launches). The scene turns the pointer into requests each frame; the
// runtime (Single player) or the online session drains them. Local to one screen.
export interface MapRequests {
  heading(h: number): void;
  takeHeading(): number | null;
  /** Valkyrn spec §5.1: the pointer's bearing from the own ship's drawn marker on the Flight map (a heading index). */
  steer(h: number): void;
  takeSteer(): number | null;
  /** Valkyrn spec §5.1: a right-button press on the Flight map (a torpedo launch). */
  launch(): void;
  takeLaunches(): number;
}

export function createMapRequests(): MapRequests {
  let heading: number | null = null, steer: number | null = null, launches = 0;
  return {
    heading(h) { heading = h; },
    takeHeading() { const out = heading; heading = null; return out; },
    steer(h) { steer = h; },
    takeSteer() { const out = steer; steer = null; return out; },
    launch() { launches++; },
    takeLaunches() { const out = launches; launches = 0; return out; }
  };
}
```

- [ ] **Step 5: The runtime** (`app/duel/runtime.ts`)

1. Imports: add `classOf` to the `../../sim/tactical/state` import and `DUEL_CREW_MIN` to the `../../sim/duel/state` import.
2. Replace the `DuelView` line with:
```ts
/** What the active character's screen is (spec §1): its console's map view when seated, the interior when standing.
 *  Valkyrn spec §5: `flight` is the Helm map with the Weapons side tools (one seat for both). */
export type DuelView = 'helm' | 'weapons' | 'science' | 'flight' | 'interior';
/** The console camera a map view uses: the Flight seat flies the Helm's (Valkyrn spec §5). */
export function viewCamera(view: Exclude<DuelView, 'interior'>): 'helm' | 'weapons' | 'science' { return view === 'flight' ? 'helm' : view; }
```
3. In `DuelRuntimeDeps`, change the `layout` comment to `/** The duel ship: the Hound, or the Single player picker's ship (Valkyrn spec §9). */` and add:
```ts
  /** Valkyrn spec §8: the crew slot's class index (the laser fit); absent: the layout's shipClass. */
  cls?: number;
  /** Valkyrn spec §5.1: the Flight map's pointer bearing since the last frame (mapRequests.ts), or null. */
  takeSteer?(): number | null;
  /** Valkyrn spec §5.1: right-button presses on the Flight map since the last frame (torpedo launches). */
  takeLaunches?(): number;
  /** Valkyrn spec §5.1: whether the left button is held on the canvas (the Flight seat's gun). */
  gunHeld?(): boolean;
```
4. In `createDuelRuntime`, replace `const d = createDuel(deps.layout, deps.seed);` with:
```ts
  const crew = deps.layout.crew ?? DUEL_CREW_MIN;   // Valkyrn spec §4.4: the layout's fixed crew (1 on the Valkyrn), else Sci-2's two
  const d = createDuel(deps.layout, deps.seed, 0, crew, deps.cls);
  const idleHeld = (): HeldInput[] => Array.from({ length: crew }, () => NEUTRAL);
  // Valkyrn spec §4.4, §5.1: Tab's ship view while seated (n = 1), the Flight seat's held bearing, and the gun's last frame.
  let shipView = false, steer = -1, gunPrev = false;
  const hasGun = (): boolean => classOf(d.tactical, 0).slots.gun !== null;
  const hasLaser = (): boolean => classOf(d.tactical, 0).slots.laser !== null;
  const viewOf = (): DuelView => { const s = seatOf(d, active); return s === 'standing' || shipView ? 'interior' : s; };
```
   Move the `const NEUTRAL` declaration above `createDuelRuntime` if it is not already (it is module-level at line 232 on sci-2).
5. `let activeHeld: HeldInput = NEUTRAL, sentHeld: readonly HeldInput[] = [NEUTRAL, NEUTRAL], …` becomes `… sentHeld: readonly HeldInput[] = idleHeld(), …`. Declare it after `idleHeld`.
6. In `onTick`, replace
```ts
    if (firstTick) { commands.push(envelope(1, { kind: 'presence', present: false })); firstTick = false; }   // the solo start rule (spec §4)
    else if (!switching) {
```
with
```ts
    if (firstTick) { if (crew > 1) commands.push(envelope(1, { kind: 'presence', present: false })); firstTick = false; }   // the solo start rule (spec §4); n = 1 has no second (Valkyrn spec §4.4)
    else if (!switching && crew > 1) {
```
   replace `const held: HeldInput[] = [NEUTRAL, NEUTRAL];` with `const held: HeldInput[] = idleHeld();`, and replace the `sentAxes = …` line with:
```ts
    sentAxes = ended() ? NO_AXES : helm >= 0 ? { turn: heldTurn(d, held[helm]!), thrust: throttleThrust(d.throttle) }   // Artemis spec §5.3; Feel-i's auto-face
      : d.interior.layout.helmHoldsUnattended === true ? { turn: helmTurn(d, NEUTRAL), thrust: throttleThrust(d.throttle) } : NO_AXES;   // Valkyrn spec §4.4: out of the seat it flies on
```
7. In `newRound`, `sentHeld = [NEUTRAL, NEUTRAL]` becomes `sentHeld = idleHeld()`, and add `shipView = false; steer = -1; gunPrev = false;`.
8. `play`'s signature becomes `function play(k: KeySample, requests: ContactRequests, heading: number | null, launches: number): KeySample {`. At its top, before `if (k.presses.switch > 0) {`, insert:
```ts
    if (k.presses.switch > 0 && crew === 1) {   // Valkyrn spec §4.4: no other character; Tab toggles the console and the ship view while seated
      if (seatOf(d, active) !== 'standing' && k.presses.switch % 2 === 1) shipView = !shipView;
      cameraInput.reset(); refollowInteriorCamera(interiorCamera);
      return IDLE_KEYS();
    }
```
   After `const seat = seatOf(d, active), p = k.presses;` add `if (seat !== 'flight') gunPrev = false;`. Before `if (seat === 'helm') {` insert the Flight branch:
```ts
    if (seat === 'flight') {   // Valkyrn spec §5.1: the Flight seat, the Helm and Weapons in one
      if (p.camera > 0) snapBack(cameras.helm);
      const level = throttleRequest(throttleBase(), p, k.throttleTo);
      if (level !== null) queue({ kind: 'throttle', level });
      // Q/E (and E/Q while the torpedo is picked up, the contact controller's torpStep) step the torpedo's room.
      const steps = p.interact - p.prevLock + (requests.torpStep ?? 0);
      if (steps !== 0) {
        const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'torpLock')?.command;
        queue({ kind: 'torpLock', room: stepTorpRoom(last && last.kind === 'torpLock' ? last.room : d.tactical.systems[0].torpLock, steps) });
      }
      if (k.torpTo !== undefined && k.torpTo !== null && k.torpTo >= -1 && k.torpTo <= 2) queue({ kind: 'torpLock', room: k.torpTo });
      if (hasLaser()) {   // §8, the laser fit: the LASER card's room and 3/4/5
        if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= -1 && k.lockTo <= 2) queue({ kind: 'laserLock', room: k.lockTo });
        const freq = frequencyRequest(freqBase(), k.freqTo);
        if (freq !== null) queue({ kind: 'laserFrequency', freq });
      }
      if (p.launch + launches > 0) { queue({ kind: 'missileLaunch' }); const why = refusal(d, 'launch'); if (why) refuse('launch', why); }   // F or the right button
      const gun = !shipView && hasGun() && (deps.gunHeld?.() ?? false);
      if (gun && !gunPrev) { const why = refusal(d, 'fire'); if (why) refuse('fire', why); }   // a dead trigger says why (Feel-ii §2.8)
      gunPrev = gun;
      const off = refusal(d, 'turn'), held = k.held ?? NO_HELD_FLAGS;
      if (off) {
        if (held.fire && !prevHeld.fire) refuse('auto-face', off);
        if (level !== null) refuse('throttle', off);
      }
      return k;
    }
```
9. In `frame`, after `const heading = deps.takeHeading?.() ?? null;` add:
```ts
      const steerNow = deps.takeSteer?.() ?? null, launchesNow = deps.takeLaunches?.() ?? 0;   // Valkyrn spec §5.1: drained every frame
```
   change `k = play(k, requests, heading);` to `k = play(k, requests, heading, launchesNow);`, and replace the `activeHeld = …` statement with:
```ts
      const seatNow = seatOf(d, active);
      if (seatNow === 'standing') shipView = false;
      if (seatNow !== 'flight') steer = -1; else if (steerNow !== null && !shipView) steer = steerNow;   // the last bearing holds over the side tools
      const gunNow = seatNow === 'flight' && !shipView && hasGun() && (deps.gunHeld?.() ?? false);
      const look = seatNow === 'flight' && shipView;   // Decision 11: the ship view keeps the course (no turn keys, no face)
      activeHeld = ended() ? NEUTRAL : { moveX: look ? 0 : Math.sign(k.moveX) || 0, moveY: Math.sign(k.moveY) || 0, interactHeld: k.interactHeld,
        ...(k.fireHeld && !look && (seatNow === 'helm' || seatNow === 'flight') ? { face: true } : {}),
        ...(steer >= 0 ? { aim: steer } : {}), ...(gunNow ? { gunHeld: true } : {}) };   // Valkyrn spec §5.1
```
   Replace the camera lines
```ts
      const view = seatOf(d, active), cam = view === 'helm' ? cameras.helm : view === 'weapons' ? cameras.weapons : view === 'science' ? cameras.science : null;
      if (cam) cameraInput.apply(cam, k, pointer, view === 'helm');
```
   with
```ts
      const shown = viewOf(), cam = shown === 'interior' ? null : cameras[viewCamera(shown)];
      if (cam) cameraInput.apply(cam, k, pointer, shown === 'helm' || shown === 'flight');   // the Flight seat's right button is the torpedo, not a pan
```
10. In the returned object, `view: () => { const s = seatOf(d, active); return s === 'standing' ? 'interior' : s; },` becomes `view: viewOf,`.

- [ ] **Step 6: The duel mode** (`app/duel/duelMode.ts`)

In `DuelModeDeps` after `layout: ShipLayout;` add `/** Valkyrn spec §8: the crew class (the laser fit), or absent for the layout's own. */ cls?: number;`. In `createDuelRuntime({ … })` add `cls: deps.cls, takeSteer: () => requests.takeSteer(), takeLaunches: () => requests.takeLaunches(), gunHeld: () => pointer.leftHeld(),`.

- [ ] **Step 7: The contact controller** (`app/duel/contactController.ts`)

- `ContactSync` gains `/** Valkyrn spec §5.1: the crew class has a laser (absent: true); the Flight seat picks it up only then. */ laser?: boolean;`.
- Add `laserFit = true` to the `let allowed = false, …` list, and in `sync` add `laserFit = s.laser ?? true;` after `enemyKnown = s.enemyKnown ?? 2;`.
- In `intercept`:
  - `KeyT` becomes `if (code === 'KeyT' && (station === 'helm' || station === 'weapons' || station === 'science' || station === 'flight')) { c.toggle(); return true; }`;
  - `if (w && station === 'weapons') { c.pickUp(w); return true; }` becomes `if (w && (station === 'weapons' || (station === 'flight' && (w === 'torpedo' || laserFit)))) { c.pickUp(w); return true; }   // Valkyrn spec §5.1: 1 only with the laser fit`;
  - `if ((code === 'KeyE' || code === 'KeyQ') && st?.aim && station === 'weapons') {` becomes `if ((code === 'KeyE' || code === 'KeyQ') && st?.aim && (station === 'weapons' || station === 'flight')) {`.

- [ ] **Step 8: The console's station and tabs** (`render/duel/consoleModel.ts`)

1. Import `flightSeat` beside `seatOf`.
2. Replace `export type ConsoleStation = 'helm' | 'weapons' | 'science' | 'ship';` with:
```ts
export type ConsoleStation = 'helm' | 'weapons' | 'science' | 'flight' | 'ship';
type TabKey = Exclude<ConsoleStation, 'flight'>;
/** The tab strip's states. Valkyrn spec §5: `flight` is present only on a layout with the Flight seat, so the Hound's tabs
 *  keep their four keys. */
export type ConsoleTabs = Record<TabKey, TabState> & { flight?: TabState };
export type ConsoleTabActions = Record<TabKey, KeyAction | null> & { flight?: KeyAction | null };
```
3. `HelmPanel` gains `/** Valkyrn spec §5: the Helm block on the Flight seat (its hints name the mouse and the torpedo). */ flight?: boolean;`.
4. In `ConsoleView`, `tabs: Record<ConsoleStation, TabState>;` becomes `tabs: ConsoleTabs;`, and `tabActions: Record<ConsoleStation, KeyAction | null>;` becomes `tabActions: ConsoleTabActions;`.
5. In `ConsoleModelInput` add `/** Valkyrn spec §4.4: Tab's ship view while seated (n = 1): the console shows SHIP. */ shipView?: boolean;`.
6. Replace `consoleTabs` with:
```ts
export function consoleTabs(i: { seat: Seat; reach: 'helm' | 'weapons' | 'science' | 'flight' | null; repairNear: boolean; otherSeat: Seat; mode: 'single' | 'online'; flight?: boolean; shipView?: boolean }): Pick<ConsoleView, 'tabs' | 'tabActions'> {
  const tabs: ConsoleTabs = { helm: 'locked', weapons: 'locked', science: 'locked', ship: 'locked', ...(i.flight ? { flight: 'locked' as const } : {}) };
  const tabActions: ConsoleTabActions = { helm: null, weapons: null, science: null, ship: null, ...(i.flight ? { flight: null } : {}) };
  if (i.seat !== 'standing' && i.shipView) { tabs.ship = 'current'; tabs[i.seat] = 'open'; tabActions[i.seat] = 'switch'; }   // Valkyrn spec §4.4: Tab back to the console
  else if (i.seat === 'standing') {
    tabs.ship = 'current';
    if (i.reach && !i.repairNear) { tabs[i.reach] = 'open'; tabActions[i.reach] = 'interact'; }
  } else { tabs[i.seat] = 'current'; tabs.ship = 'open'; tabActions.ship = 'stand'; }
  if (i.mode === 'single' && i.otherSeat !== 'standing' && tabs[i.otherSeat] === 'locked') { tabs[i.otherSeat] = 'open'; tabActions[i.otherSeat] = 'switch'; }
  return { tabs, tabActions };
}
```
7. In `consoleModel`:
   - Replace `const d = i.duel, seat = seatOf(d, i.me), station = consoleStation(d, i.me);` with
```ts
  const d = i.duel, seat = seatOf(d, i.me), shipView = (i.shipView ?? false) && seat !== 'standing', fl = flightSeat(d);
  const station: ConsoleStation = shipView ? 'ship' : consoleStation(d, i.me);
```
   - Replace the `consoleTabs({ … })` call's `reach:` expression with `reach: c < 0 ? null : fl && (c === d.nav || c === d.weapons) ? 'flight' : c === d.nav ? 'helm' : c === d.weapons ? 'weapons' : 'science'`, and add `flight: fl, shipView` to its argument. Keep Sci-2's `otherSeat` expression.
   - Change `const helm: HelmPanel | null = station === 'helm'` to `station === 'helm' || station === 'flight'`, and inside its object add `...(station === 'flight' ? { flight: true } : {})` after `holdHeading: d.holdHeading`.

- [ ] **Step 9: The sit card** (`render/duel/sitModel.ts`)

```ts
export type SitSeat = 'helm' | 'weapons' | 'flight';
```
`SIT_CARDS` gains (Valkyrn spec §9):
```ts
  flight: { title: 'FLIGHT: MOUSE TO STEER', keys: ['W/S THROTTLE', 'L-CLICK GUN', 'R-CLICK TORPEDO'] }
```
`const shown: Record<SitSeat, number> = { helm: 0, weapons: 0, flight: 0 };`, and `resetSits` also sets `shown.flight = 0`.

- [ ] **Step 10: The tab strip** (`ui/duel/TabStrip.tsx`)

```tsx
const ORDER: readonly [ConsoleStation, string][] = [['helm', 'HELM'], ['weapons', 'WEAPONS'], ['science', 'SCIENCE'], ['ship', 'SHIP']];
/** Valkyrn spec §5: a Flight-seat layout's strip: FLIGHT in the Helm's place, then SCIENCE and SHIP. */
const ORDER_FLIGHT: readonly [ConsoleStation, string][] = [['flight', 'FLIGHT'], ['science', 'SCIENCE'], ['ship', 'SHIP']];
export const TabStrip = memo(function TabStrip({ tabs, tabActions }: Pick<ConsoleView, 'tabs' | 'tabActions'>) {
  const actions = useActions(), order = tabs.flight !== undefined ? ORDER_FLIGHT : ORDER;
  return <>{order.map(([k, label], n) => {
    const a = tabActions[k] ?? null, state = tabs[k] ?? 'locked';
    return <Button key={k} name={`tab-${k}`} x={TABS.x + n * (TABS.w + TABS.gap)} y={TABS.y} w={TABS.w} h={TABS.h} label={label}
      lit={state === 'current'} disabled={state === 'locked'} onPress={a && state === 'open' ? () => actions.console.press(a) : undefined} />;
  })}</>;
});
```

- [ ] **Step 11: The scene's seat wiring** (`app/duel/scene.ts`)

1. `import type { DuelView } from './runtime';` becomes `import { viewCamera, type DuelView } from './runtime';`.
2. After `const d = source.duel, view = source.view(), alpha = source.alpha(), contact = options.contact;` add
```ts
      const camKey = view === 'interior' ? null : viewCamera(view), cam = camKey ? source.cameras[camKey] : null;   // Valkyrn spec §5: Flight flies the Helm's camera
```
3. `const onMap = view !== 'interior' && (station === 'helm' || station === 'weapons' || station === 'science');` gains `|| station === 'flight'` inside the parentheses.
4. The click block becomes
```ts
      if (contact && click && onMap && station !== 'flight')   // Valkyrn spec §5.1: on the Flight seat the left button is the gun
        contact.click(pickContact({ state: d.tactical, prev: source.prev, alpha, camera: cam!, viewport }, click));
```
5. After the Helm heading block (the one that ends `if (aim.press || aim.release) options.requests?.heading(h);\n      }`) add:
```ts
      // Valkyrn spec §5.1: on the Flight map the nose follows the pointer (its bearing from the own ship's drawn marker, every
      // frame; on the ship itself the last bearing stands), and the right button launches the torpedo.
      if (onMap && station === 'flight' && view === 'flight' && running && !overlay.layerPaused) {
        const b = interpolatedShip(d.tactical, source.prev, alpha, CREW_SLOT), s = worldToScreen(cam!, viewport, b.x, b.y), p = options.pointer?.() ?? null;
        if (p && Math.hypot(p.x - s.x, p.y - s.y) > pickRadius(cam!.zoom)) options.requests?.steer(headingOf(p.x - s.x, p.y - s.y));
        if (aim?.press) options.requests?.launch();
      }
```
6. In the ping block, replace `const cam = source.cameras[view], picked = pickContact({ state: d.tactical, prev: source.prev, alpha, camera: cam, viewport }, pingAt) === Contact.Enemy;` with `const pc = cam!, picked = pickContact({ state: d.tactical, prev: source.prev, alpha, camera: pc, viewport }, pingAt) === Contact.Enemy;`, and the `screenToWorld(cam, viewport, …)` on the next line with `screenToWorld(pc, viewport, …)`.
7. `const sitOf = (pid: 0 | 1): SitSeat | null => { const s = consoleStation(d, pid); return s === 'helm' || s === 'weapons' ? s : null; };` becomes `… return s === 'helm' || s === 'weapons' || s === 'flight' ? s : null; };`. Use Sci-2's `pid` type if it changed. `zoomTo(source.cameras[sitSeat], …)` becomes `zoomTo(source.cameras[viewCamera(sitSeat)], …)`.
8. In the sound block, `const cam = view === 'interior' ? null : source.cameras[view], crew = d.tactical.ships[CREW_SLOT]!;` becomes `const crew = d.tactical.ships[CREW_SLOT]!;` (the outer `cam` serves).
9. In the map `input`, `camera: source.cameras[view]` becomes `camera: cam!`, `console: view` becomes `console: camKey!`, `gravity: view === 'helm'` becomes `gravity: camKey === 'helm'`, and `holdHeading: preview ?? d.holdHeading` becomes `holdHeading: view === 'flight' ? -1 : preview ?? d.holdHeading` (spec §5.1: no HDG marker on Flight).
10. In `hover`, `source.cameras[view]` becomes `cam!`.
11. In the `consoleModel({ … })` call add `shipView: view === 'interior',`.
12. In `contact.sync({ … })` add `laser: classOf(d.tactical, CREW_SLOT).slots.laser !== null,`.
13. In `readoutRows({ duel: d, mode: view, …` and `readoutHelp(view)`, pass `view === 'flight' ? 'helm' : view` for the mode.

- [ ] **Step 11b: The contact window takes the Flight station**

`render/duel/contactModel.ts`, `ContactModelInput`: `station: 'helm' | 'weapons' | 'science';` becomes `station: 'helm' | 'weapons' | 'science' | 'flight';`. `render/duel/scienceModel.ts:36`: `scanButton`'s `station` parameter gets the same union. Flight scans at the Helm's slow rate (spec §5), so its `(SLOW)` label is right as written.

- [ ] **Step 12: Sci-2's crew status**

In `render/duel/readoutModel.ts`, `crewStatus` maps the seat to a word. Make `'flight'` read `HELM`: wherever `crewStatus` turns `seat === 'helm'` into `'HELM'`, make the test `seat === 'helm' || seat === 'flight'`. (Single player's crew list has no rows at n = 1, so the word shows only if a Flight layout ever goes online.)

- [ ] **Step 13: The solo record at n = 1** (Decision 21)

In `src/renderer/src/net/duelRecord.ts`, replace `const crew = z.array(uint).min(2).max(4);` with `const crew = z.array(uint).min(1).max(4);   // Valkyrn spec §4.4: Single player's crew of one; Sci-2 spec §4.3: one per player, n long`.

Run: `npx vitest run tests/valkyrnRuntime.test.ts -t "valid solo record"`
Expected: PASS.

- [ ] **Step 14: Run the tests**

Run: `npx vitest run tests/valkyrnRuntime.test.ts tests/duelRuntime.test.ts tests/duelConsoleModel.test.ts tests/duelInput.test.ts tests/feelIiInput.test.ts tests/contactController.test.ts tests/duelControls.test.ts tests/sitModel.test.ts tests/scienceSeat.test.ts tests/duelModeDispose.test.ts tests/duelModeAudio.test.ts tests/crewList.test.ts`
Expected: PASS (drop any file that does not exist).

Run: `npx tsc -b`
Expected: clean. A remaining error is an exhaustive use of `Seat`, `DuelView` or `ConsoleStation`. Map `'flight'` the way its neighbours map `'helm'` (camera, readout mode) and keep the Hound's branch unchanged.

- [ ] **Step 15: The Hound did not move**

Run: `npx tsx scripts/golden/duel-oracle.ts same` then `npx tsx scripts/golden/canonical-trace.ts same`
Expected: both exit 0.

- [ ] **Step 16: Commit**

```bash
git add src/renderer/src/app/duel/controls.ts src/renderer/src/app/duel/input.ts src/renderer/src/app/duel/mapRequests.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/contactController.ts src/renderer/src/app/duel/scene.ts src/renderer/src/render/duel/consoleModel.ts src/renderer/src/render/duel/sitModel.ts src/renderer/src/render/duel/readoutModel.ts src/renderer/src/render/duel/contactModel.ts src/renderer/src/render/duel/scienceModel.ts src/renderer/src/ui/duel/TabStrip.tsx src/renderer/src/net/duelRecord.ts tests/valkyrnRuntime.test.ts tests/duelInput.test.ts
git commit -m "feat(valkyrn): the Flight seat and the runtime at a crew of one (aim from the pointer, gun on the left button, torpedo on the right, Tab ship view)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The ship picker and the laser-fit switch

**Files:**
- Modify: `src/renderer/src/app/settingsStore.ts`, `ui/menuState.ts` (`Page`, `SettingsSlice`, `menuMessage`), `ui/store.ts`, `ui/actions.ts`, `ui/menu/Home.tsx`, `ui/menu/Menu.tsx`, `ui/menu/Settings.tsx`, `src/renderer/src/main.ts`, `tests/helpers/uiStore.ts`, `tests/settingsAndControls.test.ts:14,15,18,27`, `tests/menu.test.tsx:51,52,93`, `scripts/network/online-app-smoke.ts:199`
- Create: `src/renderer/src/ui/menu/ShipPicker.tsx`, `tests/shipPicker.test.tsx`

**Interfaces:**
- Consumes: `SOLO_SHIPS`, `soloShip`, `isSoloShipId`, `DEFAULT_SOLO_SHIP` (Task 3); `classIndexById` (Part i); `DuelModeDeps.cls` (Task 4).
- Produces:
  - `Settings.soloShip: SoloShipId` and `Settings.valkyrnLaserFit: boolean`;
  - `ShipChoice { id; name; line }`;
  - `SettingsSlice.ships`, `.soloShip` and `.valkyrnLaserFit`;
  - page `'ship'`;
  - `actions.openShips()`, `actions.single(ship?)` and `actions.setLaserFit(on)`;
  - `UiActionDeps.single(ship?: string)` and `UiActionDeps.setLaserFit?`.

- [ ] **Step 1: Write the failing test** `tests/shipPicker.test.tsx`

```tsx
// @vitest-environment jsdom
// Valkyrn spec §8, §9: Single player opens the ship choice (Hound, Valkyrn, Back); the choice starts the duel and is remembered;
// Settings holds the developer switch "Valkyrn: fit laser instead of gun". Settings records read the new fields field by field.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { buttonIds, renderUi } from './helpers/uiRender';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY } from '../src/renderer/src/app/settingsStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const click = (id: string): void => { fireEvent.click(screen.getByTestId(id)); };

describe('the ship picker (Valkyrn spec §9)', () => {
  it('Single player lists the solo ships and Back; a ship starts the duel on it and is remembered', () => {
    const { deps, store, view } = renderUi();
    click('single-player');
    expect(buttonIds(view.container)).toEqual(['ship-hound', 'ship-valkyrn', 'back']);
    expect(screen.getByTestId('page-title').textContent).toBe('Single player');
    click('ship-valkyrn');
    expect(deps.single).toHaveBeenCalledWith('valkyrn');
    expect(store.getState().settings.soloShip).toBe('valkyrn');
    expect(store.getState().menu.page).toBe('single');
  });
  it('Back returns home without starting anything', () => {
    const { deps, store } = renderUi();
    click('single-player'); click('back');
    expect(store.getState().menu.page).toBe('home');
    expect(deps.single).not.toHaveBeenCalled();
  });
  it('the Settings switch fits the laser', () => {
    const setLaserFit = vi.fn(), { store } = renderUi({ deps: { setLaserFit } });
    click('settings');
    const box = screen.getByTestId('valkyrn-laser-fit') as HTMLInputElement;
    expect(box.checked).toBe(false);
    act(() => { fireEvent.click(box); });
    expect(setLaserFit).toHaveBeenCalledWith(true);
    expect(store.getState().settings.valkyrnLaserFit).toBe(true);
  });
});

describe('the settings record (Valkyrn spec §9)', () => {
  const map = new Map<string, string>(), storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
  it('defaults to the Hound with the gun; round-trips the choice; a bad value falls back field by field', () => {
    expect([DEFAULT_SETTINGS.soloShip, DEFAULT_SETTINGS.valkyrnLaserFit]).toEqual(['hound', false]);
    saveSettings(storage, { ...DEFAULT_SETTINGS, soloShip: 'valkyrn', valkyrnLaserFit: true });
    expect(loadSettings(storage)).toMatchObject({ soloShip: 'valkyrn', valkyrnLaserFit: true });
    map.set(SETTINGS_KEY, '{"version":2,"master":1,"music":1,"effects":1,"shake":"full","soloShip":"cutter","valkyrnLaserFit":"yes"}');
    expect(loadSettings(storage)).toMatchObject({ soloShip: 'hound', valkyrnLaserFit: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/shipPicker.test.tsx`
Expected: FAIL (Single player starts at once; no `ship-hound` button).

- [ ] **Step 3: The settings record** (`app/settingsStore.ts`)

Add `import { DEFAULT_SOLO_SHIP, isSoloShipId, type SoloShipId } from '../sim/ship/fleet';`. Then:
```ts
/** Feel-i: `shake`, the console maps' screen shake (off, low, full); a version 2 record without it reads full. Valkyrn spec
 *  §8, §9: `soloShip`, the Single player ship last picked, and `valkyrnLaserFit`, the developer laser fit; a record without
 *  them reads the first solo ship and the gun. */
export interface Settings extends Volumes { version: 2; shake: ShakeSetting; soloShip: SoloShipId; valkyrnLaserFit: boolean }
export const DEFAULT_SETTINGS: Settings = { version: 2, master: 1, music: 0.5, effects: 1, shake: DEFAULT_SHAKE, soloShip: DEFAULT_SOLO_SHIP, valkyrnLaserFit: false };   // music at half (owner 2026-11-17)
```
In `loadSettings`, the version 2 return gains `soloShip: isSoloShipId(r.soloShip) ? r.soloShip : DEFAULT_SETTINGS.soloShip, valkyrnLaserFit: r.valkyrnLaserFit === true`.

`tests/settingsAndControls.test.ts`: append `, soloShip: 'hound', valkyrnLaserFit: false` inside each object literal on lines 14, 15 (both objects), 18 and 27.

- [ ] **Step 4: The store and the menu state**

`ui/menuState.ts`:
- `Page` gains `| 'ship'`.
- Add `/** Valkyrn spec §9: one Single player ship as the picker shows it (filled by main.ts from the fleet's solo list). */ export interface ShipChoice { id: string; name: string; line: string }`.
- `SettingsSlice` gains `ships: readonly ShipChoice[]; soloShip: string; valkyrnLaserFit: boolean`.
- In `menuMessage`, before `: m.page === 'settings' ? ''`, add `: m.page === 'ship' ? 'Choose your ship.'`.

`ui/store.ts`:
- `UiStoreInit.settings` gains `ships?: readonly ShipChoice[]; soloShip?: string; valkyrnLaserFit?: boolean`, and `ShipChoice` is imported as a type from `./menuState`.
- The init line becomes:
```ts
    settings: init.settings ? { available: true, shake: DEFAULT_SHAKE, ships: [], soloShip: '', valkyrnLaserFit: false, ...init.settings }
      : { available: false, master: 1, music: 1, effects: 1, fullscreenAvailable: false, controls: [], shake: DEFAULT_SHAKE, ships: [], soloShip: '', valkyrnLaserFit: false },
```

`tests/helpers/uiStore.ts`: in `makeUi`'s settings object add `ships: [{ id: 'hound', name: 'Hound', line: 'crew of two' }, { id: 'valkyrn', name: 'Valkyrn', line: 'solo fighter' }], soloShip: 'hound', valkyrnLaserFit: false`.

- [ ] **Step 5: The actions** (`ui/actions.ts`)

- `UiActionDeps`: `single(): void;` becomes `single(ship?: string): void;`, and add `/** Valkyrn spec §8: the laser-fit switch changed (main saves it). */ setLaserFit?(on: boolean): void;`.
- Replace `single(): void { setMenu({ localError: '', page: 'single' }); deps.single(); },` with:
```ts
    /** Valkyrn spec §9: Home's Single player opens the ship choice. */
    openShips(): void { setMenu({ localError: '', page: 'ship' }); },
    /** Start Single player on `ship` (a picker button, remembered), or on the remembered choice. */
    single(ship?: string): void {
      if (ship !== undefined) store.setState((s) => ({ settings: { ...s.settings, soloShip: ship } }));
      setMenu({ localError: '', page: 'single' }); deps.single(ship);
    },
    setLaserFit(on: boolean): void { store.setState((s) => ({ settings: { ...s.settings, valkyrnLaserFit: on } })); deps.setLaserFit?.(on); },
```
- In `back()`, add `else if (page === 'ship') setMenu({ page: 'home' });` after the settings branch.

- [ ] **Step 6: The picker and the switch** (UI)

`ui/menu/ShipPicker.tsx` (create):
```tsx
// Valkyrn spec §9: Single player's ship choice. The ships come through the settings slice (main.ts fills it from the fleet's
// solo list), so the UI imports no sim values; the remembered choice is marked.
import { useActions, useUi } from '../context';
import { MenuButton } from './MenuButton';
import { NAV } from './styles';

export function ShipPicker() {
  const ships = useUi((s) => s.settings.ships), chosen = useUi((s) => s.settings.soloShip), actions = useActions();
  return (
    <nav style={NAV}>
      {ships.map((s) => <MenuButton key={s.id} id={`ship-${s.id}`} text={`${s.name}: ${s.line}${s.id === chosen ? '  (last flown)' : ''}`} onClick={() => actions.single(s.id)} />)}
      <MenuButton id="back" text="Back" onClick={actions.back} />
    </nav>
  );
}
```
`ui/menu/Home.tsx`: `onClick={actions.single}` becomes `onClick={actions.openShips}`.
`ui/menu/Menu.tsx`:
- Import `ShipPicker`.
- The title line becomes `{(page === 'multiplayer' || page === 'settings' || page === 'ship') && <h2 data-testid="page-title">{page === 'multiplayer' ? 'Multiplayer' : page === 'ship' ? 'Single player' : 'Settings'}</h2>}`.
- In the page switch, add `: page === 'ship' ? <ShipPicker />` after `page === 'settings' ? <Settings />`.

`ui/menu/Settings.tsx`: after the Screen shake `</label>` add:
```tsx
      <label>
        <input type="checkbox" data-testid="valkyrn-laser-fit" aria-label="Valkyrn: fit laser instead of gun" checked={settings.valkyrnLaserFit} disabled={!settings.available}
          onChange={(e) => actions.setLaserFit(e.target.checked)} />
        Valkyrn: fit laser instead of gun
      </label>
```

`tests/menu.test.tsx`: on lines 51 and 52, `click('single-player');` becomes `click('single-player'); click('ship-hound');`, and the same on line 93. `scripts/network/online-app-smoke.ts:199`: after `await g.request('click',{id:'single-player'});` add `await g.request('click',{id:'ship-hound'});`.

- [ ] **Step 7: The app** (`src/renderer/src/main.ts`)

Add imports: `import { isSoloShipId, SOLO_SHIPS, soloShip } from './sim/ship/fleet';` and `import { classIndexById } from './sim/tactical/defs';`. In `startApp`:
- After `const ships = …` add `const soloLayouts = new Map(SOLO_SHIPS.map((s) => [s.id as string, parseShip(s.layout)]));   // Valkyrn spec §9: throws on invalid ship data`.
- In `createUiStore({ … settings: { … } })` add `ships: SOLO_SHIPS.map(({ id, name, line }) => ({ id, name, line })), soloShip: settings.soloShip, valkyrnLaserFit: settings.valkyrnLaserFit`.
- In the router's `single` factory, replace `layout: ships.hound,` with `layout, cls,` and put before `const dispose = …`:
```ts
      const pick = soloShip(settings.soloShip), layout = soloLayouts.get(pick.id)!;   // Valkyrn spec §9: the picked ship
      const cls = settings.valkyrnLaserFit && pick.laserFit !== null ? classIndexById(pick.laserFit) : undefined;   // §8: the developer laser fit
```
- In `createUiActions({ … })`, replace `single() { online = null; session.selectSingle(); },` with:
```ts
    single(ship) {
      if (isSoloShipId(ship) && ship !== settings.soloShip) { settings = { ...settings, soloShip: ship }; try { saveSettings(localStorage, settings); } catch { /* storage denied */ } }
      online = null; session.selectSingle();
    },
    setLaserFit(on) { settings = { ...settings, valkyrnLaserFit: on }; try { saveSettings(localStorage, settings); } catch { /* storage denied */ } },
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/shipPicker.test.tsx tests/settingsAndControls.test.ts tests/menu.test.tsx tests/uiActions.test.ts tests/uiMenuState.test.ts tests/uiBoundary.test.ts tests/noShipIdLiterals.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/app/settingsStore.ts src/renderer/src/ui/menuState.ts src/renderer/src/ui/store.ts src/renderer/src/ui/actions.ts src/renderer/src/ui/menu/Home.tsx src/renderer/src/ui/menu/Menu.tsx src/renderer/src/ui/menu/Settings.tsx src/renderer/src/ui/menu/ShipPicker.tsx src/renderer/src/main.ts tests/helpers/uiStore.ts tests/settingsAndControls.test.ts tests/menu.test.tsx tests/shipPicker.test.tsx scripts/network/online-app-smoke.ts
git commit -m "feat(valkyrn): the Single player ship picker (Hound, Valkyrn) and the laser-fit switch, remembered in settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The lead model

**Files:**
- Create: `src/renderer/src/render/duel/leadModel.ts`, `tests/leadModel.test.ts`

**Interfaces:**
- Consumes: Part i's `GUN`, `tickGun`, `GunRound`, `ShipClass.Valkyrn`, `createTacticalState(seed, slots, crewClass)`, `ShipInput.gunHeld`.
- Produces (the signatures are the contract Part iii's `tests/valkyrnLead.test.ts` adapter calls):
  - `interface Lead { x; y; t }`;
  - `leadPip(sx, sy, svx, svy, tx, ty, tvx, tvy, speed): Lead | null`, nine numbers, the pip as a world point;
  - `leadPipFor(state: TacticalState, i: number): Lead | null`, ship `i`'s pip on its target from the sim's bodies (`leadPip(s.x, s.y, s.vx, s.vy, t.x, t.y, t.vx, t.vy, gun.speed)`), null for a class without a gun or with no other active target. Part iii's `viewOffset` calls `leadPipFor(st, 0)` and subtracts ship 0's position;
  - `onTarget(x, y, h, px, py, r): boolean`.

- [ ] **Step 1: Write the failing test** `tests/leadModel.test.ts`

```ts
// Valkyrn spec §7.4, §10: the lead pip is the constant-velocity intercept in the shooter's frame. Checked pure, then against a
// sim fly-out: a round fired by tickGun along the pip's bearing, flying straight as stepRounds flies it, while the Hunter
// flies under the sim's flySlot, with flight forces off, then with the default flight far from the planet.
import { describe, expect, it } from 'vitest';
import { leadPip, leadPipFor, onTarget } from '../src/renderer/src/render/duel/leadModel';
import { createTacticalState, NO_AXES, classOf, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { GUN, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { tickGun } from '../src/renderer/src/sim/tactical/gun';
import { flySlot } from '../src/renderer/src/sim/tactical/physics';
import { UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { DEFAULT_FLIGHT, DT } from '../src/renderer/src/sim/tactical/tuning';
import { headingOf } from '../src/renderer/src/render/tactical/tacticalModel';

const segDist = (ax: number, ay: number, bx: number, by: number, px: number, py: number): number => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, k = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(ax + dx * k - px, ay + dy * k - py);
};

describe('leadPip (pure)', () => {
  it('a target at rest relative to the shooter: the pip is the target, t its range over the speed', () => {
    const l = leadPip(0, 0, 50, 0, 300, 400, 50, 0, 700)!;
    expect(l.x).toBeCloseTo(300, 9); expect(l.y).toBeCloseTo(400, 9); expect(l.t).toBeCloseTo(500 / 700, 9);
  });
  it('the pip is speed·t from the shooter, along the target\'s relative track', () => {
    for (const [tx, ty, vx, vy] of [[300, 0, 0, 100], [-200, 250, 80, -60], [0, -500, -150, 0]] as const) {
      const l = leadPip(10, 20, 30, -5, tx, ty, vx, vy, 700)!;
      expect(Math.hypot(l.x - 10, l.y - 20)).toBeCloseTo(700 * l.t, 6);
      expect(l.x).toBeCloseTo(tx + (vx - 30) * l.t, 6); expect(l.y).toBeCloseTo(ty + (vy + 5) * l.t, 6);
    }
  });
  it('no pip when the target outruns the round or sits on the shooter', () => {
    expect(leadPip(0, 0, 0, 0, 100, 0, 800, 0, 700)).toBeNull();
    expect(leadPip(0, 0, 0, 0, 0, 0, 10, 0, 700)).toBeNull();
  });
  it('leadPipFor reads ship i and its target from the state: the nine-number pip on the gun class, null without a gun', () => {
    const st = createTacticalState(7, 2, ShipClass.Valkyrn), s = st.ships[0]!, t = st.ships[1]!;
    s.x = 100; s.y = -40; s.vx = 20; s.vy = 0; t.x = 400; t.y = 60; t.vx = -30; t.vy = 50;
    expect(leadPipFor(st, 0)).toEqual(leadPip(100, -40, 20, 0, 400, 60, -30, 50, GUN.speed));
    expect(leadPipFor(createTacticalState(7, 2), 0)).toBeNull();   // the Cutter has no gun
  });
  it('onTarget: forward along the heading only, within the radius', () => {
    expect(onTarget(0, 0, 64, 300, 15, 20)).toBe(true);     // heading 64 points +x (east)
    expect(onTarget(0, 0, 64, 300, 25, 20)).toBe(false);
    expect(onTarget(0, 0, 64, -300, 0, 20)).toBe(false);    // behind
  });
});

/** The crew Valkyrn at (1800, 300) and the Hunter at (2050, 150) coasting along its nose: both ≥ 1500 u from the planet. */
function setup(): { t: TacticalState; j: number } {
  const t = createTacticalState(3, undefined, ShipClass.Valkyrn), j = t.systems[0].target;
  t.ships.forEach((s, i) => { if (i !== 0 && i !== j) s.active = false; });
  Object.assign(t.ships[0], { x: 1800, y: 300, vx: 30, vy: -10, headingAcc: 0 });
  Object.assign(t.ships[j]!, { x: 2050, y: 150, vx: 60, vy: 80, heading: headingOf(60, 80), headingAcc: 0, released: false, skidBudget: 0, skidSign: 0 });
  return { t, j };
}
/** Fire one round from heading h with tickGun; its spawn point and velocity (u/s, as ships). */
function fire(t: TacticalState, h: number): { x: number; y: number; vx: number; vy: number } {
  t.ships[0].heading = h;
  const before = t.rounds.map((r) => r.active);
  tickGun(t, 0, { ...UNCREWED_INPUT, weapons: true, gunHeld: true });
  const k = t.rounds.findIndex((r, i) => r.active && !before[i]);
  expect(k).toBeGreaterThanOrEqual(0);
  const r = t.rounds[k]!;
  expect(Math.hypot(r.vx - t.ships[0].vx, r.vy - t.ships[0].vy)).toBeCloseTo(GUN.speed, 2);   // muzzle speed along the nose (the heading table's unit vector), plus the ship's
  return { x: r.x, y: r.y, vx: r.vx, vy: r.vy };
}

describe('the pip against the sim (Valkyrn spec §10)', () => {
  it('flight forces off, the Hunter coasting: a round fired along the pip\'s bearing passes within the Hunter\'s radius', () => {
    const NONE = { gravity: false, edge: false, drag: 0, stabilise: 0 };
    const { t, j } = setup(), s = t.ships[0], e = t.ships[j]!;
    const lead = leadPip(s.x, s.y, s.vx, s.vy, e.x, e.y, e.vx, e.vy, GUN.speed)!;
    const r = fire(t, headingOf(lead.x - s.x, lead.y - s.y));
    let px = r.x, py = r.y, best = Infinity;
    for (let k = 0; k < GUN.lifeTicks; k++) {
      flySlot(t, j, NO_AXES, NONE);
      const nx = px + r.vx * DT, ny = py + r.vy * DT;
      best = Math.min(best, segDist(px, py, nx, ny, e.x, e.y));
      px = nx; py = ny;
    }
    expect(best).toBeLessThanOrEqual(classOf(t, j).radius);
  });
  it('default flight, ≥ 1500 u from the planet: the round passes within 10 u of the predicted point, and the Hunter arrives there', () => {
    const a = setup(), s0 = a.t.ships[0], e0 = a.t.ships[a.j]!;
    const centre = leadPip(s0.x, s0.y, s0.vx, s0.vy, e0.x, e0.y, e0.vx, e0.vy, GUN.speed)!;
    const probe = fire(setup().t, headingOf(centre.x - s0.x, centre.y - s0.y));   // where a round leaves the muzzle at that heading
    const lead = leadPip(probe.x, probe.y, s0.vx, s0.vy, e0.x, e0.y, e0.vx, e0.vy, GUN.speed)!;
    const P = { x: e0.x + e0.vx * lead.t, y: e0.y + e0.vy * lead.t };   // the predicted point: where the Hunter will be
    const { t, j } = setup(), e = t.ships[j]!, r = fire(t, headingOf(lead.x - probe.x, lead.y - probe.y));
    let px = r.x, py = r.y, best = Infinity, hunterAt = Infinity;
    for (let k = 0; k < GUN.lifeTicks; k++) {
      flySlot(t, j, NO_AXES, DEFAULT_FLIGHT);
      const nx = px + r.vx * DT, ny = py + r.vy * DT, dist = segDist(px, py, nx, ny, P.x, P.y);
      if (dist < best) { best = dist; hunterAt = Math.hypot(e.x - P.x, e.y - P.y); }
      px = nx; py = ny;
    }
    expect(best).toBeLessThanOrEqual(10);
    expect(hunterAt).toBeLessThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/leadModel.test.ts`
Expected: FAIL (cannot resolve `render/duel/leadModel`).

- [ ] **Step 3: Implement** `src/renderer/src/render/duel/leadModel.ts`

```ts
// Valkyrn spec §7.4: the minigun's lead pip, Elite Dangerous style. A fixed gun hits a target moving at constant velocity
// when the nose points where the target will be, in the shooter's frame, after the round's flight. Pure: no Pixi; only
// leadPipFor reads a state.
import { HEADING_COUNT } from '../../sim/tactical/tuning';
import { classOf, targetOf, type TacticalState } from '../../sim/tactical/state';

/** The aim point (x, y) in world units and the round's flight time t in seconds. */
export interface Lead { x: number; y: number; t: number }

/**
 * The lead pip for a round of speed `speed` (relative to the shooter, which adds its own velocity, spec §7.1) fired now from
 * (sx, sy) moving (svx, svy) at a target at (tx, ty) moving (tvx, tvy): the target's place in the shooter's frame after the
 * flight, (tx + (tvx − svx)·t, ty + (tvy − svy)·t), with t the least positive root of |r + v·t| = speed·t. A round fired at
 * it meets the target's world position (tx + tvx·t, ty + tvy·t). Null when there is no positive root (the target outruns
 * the round) or the target sits on the shooter.
 */
export function leadPip(sx: number, sy: number, svx: number, svy: number, tx: number, ty: number, tvx: number, tvy: number, speed: number): Lead | null {
  const rx = tx - sx, ry = ty - sy, vx = tvx - svx, vy = tvy - svy;
  const a = vx * vx + vy * vy - speed * speed, b = 2 * (rx * vx + ry * vy), c = rx * rx + ry * ry;
  let t: number;
  if (Math.abs(a) < 1e-9) { if (b >= 0) return null; t = -c / b; }
  else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const q = Math.sqrt(disc), t1 = (-b - q) / (2 * a), t2 = (-b + q) / (2 * a), lo = Math.min(t1, t2), hi = Math.max(t1, t2);
    t = lo > 0 ? lo : hi;
  }
  if (!(t > 0) || !Number.isFinite(t)) return null;
  return { x: tx + vx * t, y: ty + vy * t, t };
}

/** Ship `i`'s lead pip on its target from the state's bodies (no interpolation): the form the scripted pilot's agreement
 *  test reads (Valkyrn Part iii). Null when the class has no gun, or the target is itself or inactive. */
export function leadPipFor(state: TacticalState, i: number): Lead | null {
  const gun = classOf(state, i).slots.gun, j = targetOf(state, i), s = state.ships[i], t = state.ships[j];
  if (!gun || j === i || !s || !t?.active) return null;
  return leadPip(s.x, s.y, s.vx, s.vy, t.x, t.y, t.vx, t.vy, gun.speed);
}

/** Whether the nose line from (x, y) along heading `h` (a heading index, continuous allowed; 0 north, clockwise) passes
 *  within `r` of (px, py), forward only: the pip's "on target" (spec §7.4). */
export function onTarget(x: number, y: number, h: number, px: number, py: number, r: number): boolean {
  const a = (h / HEADING_COUNT) * Math.PI * 2, fx = Math.sin(a), fy = -Math.cos(a), dx = px - x, dy = py - y;
  if (dx * fx + dy * fy <= 0) return false;
  return Math.abs(dx * fy - dy * fx) <= r;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/leadModel.test.ts`
Expected: PASS.

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/render/duel/leadModel.ts tests/leadModel.test.ts
git commit -m "feat(valkyrn): the lead pip, pure, checked against a sim fly-out with and without the flight forces" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The gun on the map: crosshair, pip, heat bar, tracers, the gun's words and readout, hit feedback

**Files:**
- Modify: `src/renderer/src/render/duel/leadModel.ts` (append), `render/tactical/weaponsModel.ts` (`CombatDraw`, `CombatModelInput`, `combatModel`), `render/tactical/tacticalLayer.ts` (`NOTES`, the combat section), `render/duel/situationModel.ts` (`stateAxes`, `refusal`, new `gunReason` and `gunSentence`), `render/duel/readoutModel.ts` (`chargeRow`), `render/tactical/fxModel.ts` (`pushGunHits`), `audio/duelSounds.ts`, `app/duel/scene.ts`, `tests/crtColours.test.ts`
- Create: `tests/valkyrnViews.test.ts`

**Interfaces:**
- Consumes: Part i's `ShipSystems.gunHeat`, `gunLocked` and `gunHull`, `TacticalState.rounds`, the `gunHit` event `{ kind, ship, room, stripped, x, y }` (Part i Decision 2), and `classOf(...).slots.gun: GunDef | null`.
- Produces:
  - `GunSightDraw`; `gunSightDraw(i)`; `roundDraws(state, toS)`;
  - `CROSS_PX`, `PIP_PX`, `OVERHEAT_BLINK_HZ`, `TRACER_S`;
  - `CombatDraw.gunSight?` and `CombatDraw.rounds?`; `CombatModelInput.flight?`;
  - `gunReason(t): string | null`; `gunSentence(alert, reason)`; `pushGunHits(fx, events, state)`.

- [ ] **Step 1: Write the failing test** `tests/valkyrnViews.test.ts`

```ts
// Valkyrn spec §6.1, §7.4, §10: the Flight map's crosshair (on the nose line at the gun's reach), lead pip (hot when the nose
// line passes within the Hunter's radius) and heat bar (OVERHEAT blinking while locked); the gun's sentence and refusals; the
// laser-only marks gone on a gun class; and the Hound's frames unchanged.
import { describe, expect, it } from 'vitest';
import valkyrnJson from '../src/renderer/src/sim/ship/valkyrn.json';
import houndJson from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { sitDown } from '../src/renderer/src/sim/stations';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { GUN } from '../src/renderer/src/sim/tactical/defs';
import { DT } from '../src/renderer/src/sim/tactical/tuning';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { createCamera, worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { createFx, pushGunHits } from '../src/renderer/src/render/tactical/fxModel';
import { combatModel, type CombatModelInput } from '../src/renderer/src/render/tactical/weaponsModel';
import { gunSightDraw } from '../src/renderer/src/render/duel/leadModel';
import { gunReason, laserSituation, refusal } from '../src/renderer/src/render/duel/situationModel';
import { enemyCharge } from '../src/renderer/src/render/tactical/hitModel';
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { chargeRow } from '../src/renderer/src/render/duel/readoutModel';
import { SIDE, TABS_RIGHT } from '../src/renderer/src/render/duel/consoleLayout';

const vp = { w: 1280, h: 720 };
const valkyrn = parseShip(valkyrnJson), hound = parseShip(houndJson);
function flying(): DuelState { const d = createDuel(valkyrn, 7, 0, 1); sitDown(d.interior, 0, d.nav); return d; }
function input(d: DuelState, flight = true): CombatModelInput {
  const st = d.tactical, s = st.ships[0];
  return { state: st, prev: st.ships.map((b) => ({ x: b.x, y: b.y, h: b.heading + b.headingAcc })), alpha: 1, camera: createCamera(s.x, s.y, 0.5), viewport: vp, console: 'helm',
    axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: 156, reserveLeft: 228, infoBand: { left: TABS_RIGHT, right: SIDE.x }, missilePrev: [null, null], fx: createFx(), flight };
}
/** The enemy `dist` ahead of the crew's nose and `side` to starboard, moving with the crew. */
function place(d: DuelState, dist: number, side = 0): void {
  const t = d.tactical, s = t.ships[0], e = t.ships[t.systems[0].target]!, fx = hx(s.heading), fy = hy(s.heading);
  Object.assign(e, { x: s.x + fx * dist - fy * side, y: s.y + fy * dist + fx * side, vx: s.vx, vy: s.vy, active: true });
}

describe('the gun sight (Valkyrn spec §7.4)', () => {
  it('the crosshair sits on the nose line at the gun\'s reach', () => {
    const d = flying();
    try {
      const i = input(d), gs = gunSightDraw(i)!, s = d.tactical.ships[0], reach = GUN.speed * GUN.lifeTicks * DT;
      const want = worldToScreen(i.camera, vp, s.x + hx(s.heading) * reach, s.y + hy(s.heading) * reach);
      expect(gs.cross.x).toBeCloseTo(want.x, 6); expect(gs.cross.y).toBeCloseTo(want.y, 6);
    } finally { disposeDuel(d); }
  });
  it('the pip is on target dead ahead, off when the enemy is abeam; it draws a line to the enemy', () => {
    const d = flying();
    try {
      place(d, 300); const on = gunSightDraw(input(d))!.pip!;
      expect(on.on).toBe(true);
      expect(on.x).toBeCloseTo(on.enemy.x, 6);   // at rest relative to the crew, the pip is the enemy
      place(d, 300, 120); expect(gunSightDraw(input(d))!.pip!.on).toBe(false);
    } finally { disposeDuel(d); }
  });
  it('the heat bar fills with heat and blinks OVERHEAT while locked', () => {
    const d = flying(), sys = d.tactical.systems[0];
    try {
      sys.gunHeat = GUN.heatMax / 2;
      const warm = gunSightDraw(input(d))!.heat;
      expect([warm.fill, warm.locked, warm.label?.text]).toEqual([0.5, false, 'HEAT']);
      sys.gunHeat = GUN.heatMax; sys.gunLocked = true;
      expect(gunSightDraw({ ...input(d), t: 0 })!.heat.label?.text).toBe('OVERHEAT');
      expect(gunSightDraw({ ...input(d), t: 0.13 })!.heat.label).toBeNull();
    } finally { disposeDuel(d); }
  });
  it('the Hound draws no gun sight and its combat frame has no gun keys', () => {
    const d = createDuel(hound, 7);
    try {
      expect(gunSightDraw(input(d))).toBeNull();
      const c = combatModel(input(d, false));
      expect('gunSight' in c || 'rounds' in c).toBe(false);
      expect(c.helmArc).not.toBeNull();
    } finally { disposeDuel(d); }
  });
});

describe('the Flight frame on a gun class (Valkyrn spec §6.1, §8)', () => {
  it('no laser arc; the torpedo circle lit in range; the sentence is the gun\'s', () => {
    const d = flying();
    try {
      place(d, 300);
      const c = combatModel(input(d));
      expect([c.helmArc, c.torpedoRange?.lit, c.gunSight === null]).toEqual([null, true, false]);
      expect(c.status ?? null).toBeNull();   // nothing wrong: no sentence
      d.tactical.systems[0].gunLocked = true;
      expect(combatModel(input(d)).status?.label.text).toBe('GUN OVERHEAT');
      d.tactical.systems[0].rooms[Room.Weapons] = 2;
      expect(combatModel(input(d)).status?.label.text).toBe('WEAPONS OFFLINE');
    } finally { disposeDuel(d); }
  });
  it('the laser situation is none; FIRE refuses with the gun\'s reasons; LAUNCH as on the Hound', () => {
    const d = flying(), sys = d.tactical.systems[0];
    try {
      expect(laserSituation(d.tactical).kind).toBe('none');
      expect([refusal(d, 'fire'), gunReason(d.tactical)]).toEqual([null, null]);
      sys.gunLocked = true; expect(refusal(d, 'fire')).toBe('GUN OVERHEAT');
      sys.rooms[Room.Weapons] = 2; expect(refusal(d, 'fire')).toBe('WEAPONS OFFLINE');
      expect(refusal(d, 'launch')).toBe('WEAPONS OFFLINE');
    } finally { disposeDuel(d); }
  });
  it('no charge ring for a gun class, the readout reads HEAT, and a gun hit sparks, pops a strip and floats -1 on a hull step', () => {
    const d = flying(), sys = d.tactical.systems[0];
    try {
      sys.fireHeld = true;
      expect(enemyCharge(d.tactical, 0)).toBeNull();
      sys.gunHeat = GUN.heatMax / 4;
      expect([chargeRow(d).label, chargeRow(d).value]).toEqual(['HEAT', '25%']);
      const fx = createFx(), e = d.tactical.systems[0].target, es = d.tactical.systems[e]!;
      es.gunHull = 0;
      const hits: ViewEvent[] = [
        { kind: 'gunHit', ship: e, room: -1, stripped: false, x: 8, y: 18 },    // a shield hit that strips nothing: spark only
        { kind: 'gunHit', ship: e, room: -1, stripped: true, x: 10, y: 20 },    // the strip: spark and pop
        { kind: 'gunHit', ship: e, room: 1, stripped: false, x: 12, y: 22 }     // a room hit with the hull count back to 0: spark and -1
      ];
      pushGunHits(fx, hits, d.tactical);
      expect(fx.items.map((it) => it.kind)).toEqual(['spark', 'spark', 'pop', 'spark']);
      expect(fx.floats.map((f) => f.text)).toEqual(['-1']);
    } finally { disposeDuel(d); }
  });
});
```

`tests/crtColours.test.ts`: add to the file:
```ts
import type { GunSightDraw } from '../src/renderer/src/render/duel/leadModel';
describe('the Valkyrn marks draw only the ramp (Valkyrn spec §10)', () => {
  const sight = (on: boolean, locked: boolean): GunSightDraw => ({ cross: { x: 640, y: 200 }, pip: { x: 660, y: 210, on, enemy: { x: 700, y: 230 } },
    heat: { x: 620, y: 214, w: 40, fill: 0.6, locked, label: { text: locked ? 'OVERHEAT' : 'HEAT', x: 640, y: 222 } } });
  for (const [on, locked] of [[true, false], [false, true]] as const) it(`gun sight on ${on}, locked ${locked}, tracers, the Valkyrn hull`, () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp }), { d, c } = fullFrame('helm');
    layer.draw(d, { ...c, gunSight: sight(on, locked), rounds: [{ x1: 600, y1: 300, x2: 610, y2: 295 }] }, 0);
    for (const colour of colours(layer.container)) expect(CRT_RAMP, colour.toString(16)).toContain(colour);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/valkyrnViews.test.ts tests/crtColours.test.ts`
Expected: FAIL (`gunSightDraw`, `gunReason` and `pushGunHits` are not exported).

- [ ] **Step 3: The sight and the tracers** (append to `render/duel/leadModel.ts`)

Add to the imports:
```ts
import { classOf, CREW_SLOT, Outcome, targetOf, type TacticalState } from '../../sim/tactical/state';
import { DT } from '../../sim/tactical/tuning';
import { worldToScreen, type Camera, type Point, type Viewport } from '../tactical/camera';
import { interpolatedShip, type Label, type PrevBody } from '../tactical/tacticalModel';
```
(`HEADING_COUNT` is already imported from `../../sim/tactical/tuning`: merge `DT` into that import.) Append:
```ts
/** The crosshair's arm length and the pip diamond's half-size, in screen px; the OVERHEAT blink; a tracer's length in seconds of flight. */
export const CROSS_PX = 10, PIP_PX = 7, OVERHEAT_BLINK_HZ = 4, TRACER_S = 0.02;

/** Spec §7.4: the crosshair (screen px), the lead pip with the enemy's drawn place (null with no solution or no enemy) and
 *  whether the nose is on it, and the heat bar under the crosshair: its fill 0..1, locked, and its word (HEAT, or OVERHEAT
 *  in the blink's on phase; null in the off phase). */
export interface GunSightDraw {
  cross: Point;
  pip: { x: number; y: number; on: boolean; enemy: Point } | null;
  heat: { x: number; y: number; w: number; fill: number; locked: boolean; label: Label | null };
}

/** The crew ship's gun sight on a map, or null when its class has no gun or the round is decided. */
export function gunSightDraw(i: { state: TacticalState; prev: readonly PrevBody[]; alpha: number; camera: Camera; viewport: Viewport; t?: number }): GunSightDraw | null {
  const st = i.state, gun = classOf(st, CREW_SLOT).slots.gun;
  if (!gun || st.outcome !== Outcome.Running) return null;
  const toS = (x: number, y: number): Point => worldToScreen(i.camera, i.viewport, x, y);
  const own = interpolatedShip(st, i.prev, i.alpha, CREW_SLOT), body = st.ships[CREW_SLOT]!, a = (own.h / HEADING_COUNT) * Math.PI * 2;
  const reach = gun.speed * gun.lifeTicks * DT, cross = toS(own.x + Math.sin(a) * reach, own.y - Math.cos(a) * reach);
  const target = targetOf(st, CREW_SLOT), e = st.ships[target];
  let pip: GunSightDraw['pip'] = null;
  if (e?.active && target !== CREW_SLOT) {
    const eb = interpolatedShip(st, i.prev, i.alpha, target), lead = leadPip(own.x, own.y, body.vx, body.vy, eb.x, eb.y, e.vx, e.vy, gun.speed);
    if (lead) { const p = toS(lead.x, lead.y); pip = { x: p.x, y: p.y, on: onTarget(own.x, own.y, own.h, lead.x, lead.y, classOf(st, target).radius), enemy: toS(eb.x, eb.y) }; }
  }
  const sys = st.systems[CREW_SLOT]!, locked = sys.gunLocked === true, blinkOn = Math.floor((i.t ?? 0) * 2 * OVERHEAT_BLINK_HZ) % 2 === 0;
  const fill = Math.max(0, Math.min(1, sys.gunHeat / gun.heatMax)), w = 40;
  return { cross, pip, heat: { x: cross.x - w / 2, y: cross.y + 14, w, fill, locked, label: locked && !blinkOn ? null : { text: locked ? 'OVERHEAT' : 'HEAT', x: cross.x, y: cross.y + 22 } } };
}

/** The rounds in flight as short tracers (screen px), TRACER_S of flight long, ending at the round. */
export function roundDraws(state: TacticalState, toS: (x: number, y: number) => Point): { x1: number; y1: number; x2: number; y2: number }[] {
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const r of state.rounds) if (r.active) { const a = toS(r.x - r.vx * TRACER_S, r.y - r.vy * TRACER_S), b = toS(r.x, r.y); out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
  return out;
}
```

- [ ] **Step 4: The gun's words** (`render/duel/situationModel.ts`)

- `laserSituation` already returns `{ kind: 'none' }` for a class without a laser (Part i Task 2 Step 9's guard after the `const laser = …, dx = …` line). That is the Flight rule too (spec §6.1: a gun class has no laser sentence, bracket or bright arc), so leave it.
- Add, after `alertSentence`:
```ts
/** Valkyrn spec §6.1: why the crew's gun cannot fire, or null: WEAPONS OFFLINE (Weapons at 2), then GUN OVERHEAT (locked).
 *  Null too for a class without a gun or a decided round. */
export function gunReason(t: TacticalState): string | null {
  const sys = t.systems[CREW_SLOT];
  if (!sys || !classOf(t, CREW_SLOT).slots.gun || t.outcome !== Outcome.Running) return null;
  if (sys.rooms[Room.Weapons] >= 2) return 'WEAPONS OFFLINE';
  return sys.gunLocked === true ? 'GUN OVERHEAT' : null;
}
/** Valkyrn spec §6.1: a gun class's sentence: the flight alerts first (as alertSentence), then the gun's reason, else none. */
export function gunSentence(alert: FlightAlert, reason: string | null): { text: string; tone: 'hot' | 'main' | 'mid' } {
  if (alert) return alertSentence(alert, { kind: 'none' });
  return reason ? { text: reason, tone: 'main' } : { text: '', tone: 'mid' };
}
```
- `stateAxes` becomes (identical for the Hound):
```ts
export function stateAxes(d: DuelState): Axes {
  if (d.tactical.outcome !== Outcome.Running) return NO_AXES;
  const pid = d.interior.stations.occupant[d.nav]!, attended = pid >= 0 && d.present[pid] === true;
  if (!attended && d.interior.layout.helmHoldsUnattended !== true) return NO_AXES;   // Valkyrn spec §4.4: the Valkyrn flies on unattended
  return { turn: helmTurn(d, { moveX: 0, moveY: 0, interactHeld: false }), thrust: throttleThrust(d.throttle) };
}
```
- In `refusal`, after `if (!gunnerPresent(d)) return 'NO GUNNER';` add `if (control === 'fire' && classOf(t, CREW_SLOT).slots.laser === null) return gunReason(t);   // Valkyrn spec §6.1: the gun's reasons`.

- [ ] **Step 5: The other laser readers**

Part i Task 2 Step 9 already gave `hitModel.ts`'s `enemyCharge` its `if (!laser) return null;`, `consoleModel.ts`'s `burst` its `?.shots ?? 0`, and `contactModel.ts:180` its `cls.slots.laser ? … : 0` ternary. They stay as Part i wrote them (the enemy is always the Hunter, which has a laser, so the contact line is unchanged). The one reader left is the readout:

- `render/duel/readoutModel.ts`, `chargeRow`: insert at its top, after the `const t = d.tactical, crewSys = …` line:
```ts
  const gun = classOf(t, 0).slots.gun;
  if (classOf(t, 0).slots.laser === null && gun) {   // Valkyrn spec §7.4: the gun's heat in the laser's place
    if (crewSys.rooms[Room.Weapons] >= 2) return em({ ...row('HEAT', 'OFFLINE', DIM, WARN), bar: { fill: 0, colour: AMBER } }, 'warn');
    const fill = Math.max(0, Math.min(1, crewSys.gunHeat / gun.heatMax));
    return crewSys.gunLocked === true ? em({ ...row('HEAT', 'OVERHEAT', DIM, WARN), bar: { fill, colour: WARN } }, 'warn')
      : em({ ...row('HEAT', `${Math.floor(fill * 100)}%`, DIM, TEXT), bar: { fill, colour: AMBER } }, null);
  }
```
- Run `git grep -n "slots\.laser\." -- src/renderer/src src/network src/main`. Every remaining read must sit behind a null check (Part i's sim and telemetry sites, `weaponsModel` and the ones above). Guard any other.

- [ ] **Step 6: The combat frame** (`render/tactical/weaponsModel.ts`)

- Imports: add `classOf` to the `../../sim/tactical/state` import; add `gunReason, gunSentence` to the `../duel/situationModel` import; add `import { gunSightDraw, roundDraws, type GunSightDraw } from '../duel/leadModel';`.
- `CombatDraw` gains:
```ts
  /** Valkyrn spec §7.4: the gun sight on the Flight map, and the rounds in flight as tracers (a gun class only). */
  gunSight?: GunSightDraw | null; rounds?: { x1: number; y1: number; x2: number; y2: number }[];
```
- `CombatModelInput` gains `/** Valkyrn spec §5: the Flight seat's map (the Helm map with the Weapons side tools): the gun sight, the torpedo circle lit. */ flight?: boolean;`.
- In `combatModel`:
  - after the `const own = …` line add `const cls = classOf(state, 0);`;
  - in `torpedoRange`, `lit: input.console === 'weapons' && inRange` becomes `lit: (input.console === 'weapons' || input.flight === true) && inRange`;
  - `const sentence = alertSentence(input.alert ?? null, situation);` becomes `const sentence = cls.slots.laser ? alertSentence(input.alert ?? null, situation) : gunSentence(input.alert ?? null, gunReason(state));   // Valkyrn spec §6.1`;
  - `const helmArc: ArcDraw | null = input.console === 'helm' && input.ships.includes(0) ? ownArc : null;` gains `&& cls.slots.laser !== null` in the condition;
  - the return line becomes:
```ts
  const gun = cls.slots.gun ? { gunSight: input.flight ? gunSightDraw({ state, prev, alpha, camera: cam, viewport: vp, t: input.t ?? 0 }) : null, rounds: roundDraws(state, toS) } : {};   // Valkyrn spec §7.4
  return { weapons, lock, missiles, effects, charge, callouts, torpedoRange, status, helmArc, solution, goal, floats, torpedoPath, evade, pings, ...gun };
```

- [ ] **Step 7: The layer** (`render/tactical/tacticalLayer.ts`)

`const NOTES = 12;` becomes `const NOTES = 13;   // … and the gun's HEAT word (Valkyrn spec §7.4)` (extend its doc comment). Import `CROSS_PX, PIP_PX` from `../duel/leadModel`. Right after the `for (const pg of c?.pings ?? []) { … }` loop, before `notes.forEach(…)`, add:
```ts
      // Valkyrn spec §7.4: the gun's tracers, the crosshair at its reach, the lead pip (a diamond with a thin line to the enemy;
      // hot with brackets on target) and the heat bar under the crosshair, all on the ramp.
      for (const r of c?.rounds ?? []) combat.moveTo(r.x1, r.y1).lineTo(r.x2, r.y2).stroke({ width: 1, color: CRT.main });
      const gs = c?.gunSight ?? null;
      if (gs) {
        const { x, y } = gs.cross, k = CROSS_PX;
        combat.moveTo(x - k, y).lineTo(x - 3, y).moveTo(x + 3, y).lineTo(x + k, y).moveTo(x, y - k).lineTo(x, y - 3).moveTo(x, y + 3).lineTo(x, y + k).stroke({ width: 1, color: CRT.mid });
        const pp = gs.pip;
        if (pp) {
          combat.moveTo(pp.enemy.x, pp.enemy.y).lineTo(pp.x, pp.y).stroke({ width: 1, color: CRT.mid, alpha: 0.6 });
          combat.poly([pp.x, pp.y - PIP_PX, pp.x + PIP_PX, pp.y, pp.x, pp.y + PIP_PX, pp.x - PIP_PX, pp.y]).stroke({ width: 2, color: pp.on ? CRT.hot : CRT.mid });
          if (pp.on) {
            const r = PIP_PX + 6, q = 4;
            for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
              combat.moveTo(pp.x + sx * r, pp.y + sy * (r - q)).lineTo(pp.x + sx * r, pp.y + sy * r).lineTo(pp.x + sx * (r - q), pp.y + sy * r).stroke({ width: 2, color: CRT.hot });
          }
        }
        const hb = gs.heat;
        combat.rect(hb.x, hb.y, hb.w, 4).stroke({ width: 1, color: CRT.dim });
        if (hb.fill > 0) combat.rect(hb.x, hb.y, hb.w * hb.fill, 4).fill(hb.locked ? CRT.hot : CRT.main);
        if (hb.label) words.push({ text: hb.label.text, x: hb.label.x - textPx(hb.label.text, 1) / 2, y: hb.label.y, tint: hb.locked ? CRT.hot : CRT.mid });
      }
```

- [ ] **Step 8: Hit feedback**

`render/tactical/fxModel.ts`: import `type TacticalState` from `../../sim/tactical/state` if it is not imported yet. After `pushEvents`, add:
```ts
/** Valkyrn spec §7.4: the gun's hits on the enemy: a tick flash at the hit point; the shield pop when the hit stripped a
 *  layer (the event's `stripped`, Part i Decision 2); `-1` when it stepped the hull (a room hit whose target's gun hull
 *  count is back to 0 in the state the events arrived with). The hull test is a frame-end heuristic: the event carries no
 *  hull flag, so when two room hits land in one frame and the first steps the hull, no `-1` floats (the pop, which reads
 *  the event, is exact). Rounds leave 6 ticks apart, so that takes a frame hitch. */
export function pushGunHits(fx: FxState, events: readonly ViewEvent[], state: TacticalState): void {
  for (const e of events) {
    if (e.kind !== 'gunHit') continue;
    fx.items.push({ kind: 'spark', age: 0, life: SPARK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot });
    const s = state.systems[e.ship];
    if (!s) continue;
    if (e.room < 0 && e.stripped) fx.items.push({ kind: 'pop', age: 0, life: POP_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: CRT.hot });
    if (e.room >= 0 && s.gunHull === 0) float(fx, '-1', e.x, e.y);
  }
}
```
`app/duel/scene.ts`: after `pushEvents(fx, events); pushHits(fx, events, d.tactical);` add `pushGunHits(fx, events, d.tactical);   // Valkyrn spec §7.4` and import it. In the map `input` add `flight: view === 'flight',`.

`audio/duelSounds.ts`, `duelEventSounds`: add `let clicked = false;` beside `let duck = false, combat = false;`, and add this branch after the `contact` one:
```ts
    } else if (e.kind === 'gunHit') {   // Valkyrn spec §7.4: a click per hit, at most one per frame (the gun fires every 6 ticks)
      combat = true;
      if (!clicked) { clicked = true; sounds.push({ key: 'impactMetal', gain: 0.35, rate: 1.6, pan: pan(e.x, e.y) }); }
```

- [ ] **Step 9: Run the tests**

Run: `npx vitest run tests/valkyrnViews.test.ts tests/crtColours.test.ts tests/duelWeaponsView.test.ts tests/duelHitFeedback.test.ts tests/crtBezel.test.ts tests/tacticalLayer.test.ts tests/audioDuel.test.ts tests/feelModel.test.ts tests/contactModel.test.ts tests/crtReadout.test.ts`
Expected: PASS (drop any file that does not exist).

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 10: The Hound did not move**

Run: `npx tsx scripts/golden/duel-oracle.ts same` then `npx tsx scripts/golden/canonical-trace.ts same`
Expected: both exit 0.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/render/duel/leadModel.ts src/renderer/src/render/tactical/weaponsModel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/render/duel/situationModel.ts src/renderer/src/render/duel/readoutModel.ts src/renderer/src/render/tactical/fxModel.ts src/renderer/src/audio/duelSounds.ts src/renderer/src/app/duel/scene.ts tests/valkyrnViews.test.ts tests/crtColours.test.ts
git commit -m "feat(valkyrn): crosshair, lead pip, heat bar and tracers on the Flight map; the gun's words and HEAT row; hit feedback" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The Flight console block and the controls list

**Files:**
- Modify: `src/renderer/src/render/duel/consoleModel.ts` (`GunPanel`, `FlightPanel`, the flight panel), `render/duel/consoleLayout.ts`, `render/duel/contactModel.ts` (`weaponRows`), `ui/duel/HelmStation.tsx:71`, `ui/duel/DuelUi.tsx`, `ui/duel/TargetingLine.tsx:35,49`, `app/duel/scene.ts` (`contactModel`'s weapons), `app/controlsList.ts`, `tests/settingsAndControls.test.ts:36,39`
- Create: `src/renderer/src/ui/duel/FlightStation.tsx`, `tests/flightConsole.test.tsx`

**Interfaces:**
- Produces:
  - `GunPanel { state: 'READY' | 'OVERHEAT' | 'OFFLINE'; heat: number; locked: boolean }`;
  - `FlightPanel { gun: GunPanel | null; weapons: WeaponsPanel }`; `ConsoleView.flight?: FlightPanel | null`;
  - `FLIGHT = { x: 324, y: 542, w: 300, h: 166 }`; `flightCard(slot: 0 | 1)`;
  - `FlightStation`; `TargetingLine`'s `from?` prop;
  - the controls section `Single player: Valkyrn`.

- [ ] **Step 1: Write the failing test** `tests/flightConsole.test.tsx`

```tsx
// @vitest-environment jsdom
// Valkyrn spec §5, §8: the Flight seat's block beside the Helm block: GUN (heat, READY / OVERHEAT / OFFLINE) and TORPEDO
// (MAG n/4, range, target room); the laser fit shows LASER instead. A card click picks the weapon up; the contact window's
// weapon rows work on Flight. The controls list names the Flight seat's bindings.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import valkyrnJson from '../src/renderer/src/sim/ship/valkyrn.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { sitDown } from '../src/renderer/src/sim/stations';
import { classIndexById, GUN, VALKYRN_LASER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { consoleModel } from '../src/renderer/src/render/duel/consoleModel';
import { FLIGHT, flightCard, STATION } from '../src/renderer/src/render/duel/consoleLayout';
import { contactModel } from '../src/renderer/src/render/duel/contactModel';
import { FlightStation } from '../src/renderer/src/ui/duel/FlightStation';
import { UiContext } from '../src/renderer/src/ui/context';
import { makeUi } from './helpers/uiStore';
import { controlSections } from '../src/renderer/src/app/controlsList';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const valkyrn = parseShip(valkyrnJson);
const seated = (cls?: number): DuelState => { const d = createDuel(valkyrn, 7, 0, 1, cls); sitDown(d.interior, 0, d.nav); return d; };
const view = (d: DuelState) => consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })!;

describe('the Flight panel (Valkyrn spec §5, §8)', () => {
  it('GUN: READY, OVERHEAT when locked, OFFLINE with Weapons at 2; heat 0..1; the torpedo as on Weapons', () => {
    const d = seated(), sys = d.tactical.systems[0];
    try {
      sys.gunHeat = GUN.heatMax / 2;
      expect(view(d).flight).toMatchObject({ gun: { state: 'READY', heat: 0.5, locked: false }, weapons: { magazine: '4/4', burst: 0 } });
      sys.gunLocked = true; expect(view(d).flight!.gun!.state).toBe('OVERHEAT');
      sys.rooms[Room.Weapons] = 2; expect(view(d).flight!.gun!.state).toBe('OFFLINE');
    } finally { disposeDuel(d); }
  });
  it('the laser fit: no GUN card; the weapons panel carries the laser', () => {
    const d = seated(classIndexById(VALKYRN_LASER_CLASS.id));
    try { expect(view(d).flight!.gun).toBeNull(); expect(view(d).flight!.weapons.burst).toBeGreaterThan(0); } finally { disposeDuel(d); }
  });
  it('the block sits beside the Helm block; the cards are side by side', () => {
    expect(FLIGHT).toEqual({ x: STATION.x + STATION.w + 12, y: 720 - 12 - 166, w: 300, h: 166 });
    expect(flightCard(1).x).toBe(flightCard(0).x + 138 + 8);
  });
  it('renders GUN and TORPEDO; a TORPEDO click picks it up, a right-click clears its room', () => {
    const d = seated(), ui = makeUi(), pickUp = vi.spyOn(ui.actions.contact, 'pickUp'), torpLock = vi.spyOn(ui.actions.console, 'torpLock');
    try {
      render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><FlightStation flight={view(d).flight!} /></UiContext.Provider>);
      expect(document.querySelector('[data-ui-flight-card="gun"]')).not.toBeNull();
      expect(screen.queryByTestId('flight-card-laser')).toBeNull();
      fireEvent.pointerDown(screen.getByTestId('flight-card-torpedo'), { button: 0 });
      expect(pickUp).toHaveBeenCalledWith('torpedo');
      fireEvent.pointerDown(screen.getByTestId('flight-card-torpedo'), { button: 2 });
      expect(torpLock).toHaveBeenCalledWith(-1);
    } finally { disposeDuel(d); }
  });
  it('the contact window\'s weapon rows show on Flight, the laser row disabled on a gun class', () => {
    const d = seated();
    try {
      d.tactical.known[0] = 2;
      const v = view(d), c = contactModel({ state: d.tactical, contact: 0, aim: true, weapon: 'torpedo', station: 'flight', t: 0, weapons: v.flight!.weapons, flashes: [] })!;
      expect(c.weapons).not.toBeNull();
      expect(c.weapons!.laser.enabled).toBe(false);
      expect(c.aimWeapon).toBe('torpedo');
    } finally { disposeDuel(d); }
  });
});

describe('the controls list (Valkyrn spec §9)', () => {
  it('has a Flight seat section with every §5.1 binding', () => {
    const s = controlSections().find((x) => x.title === 'Single player: Valkyrn')!;
    expect(s.rows.map((r) => r.keys)).toEqual(['Mouse', 'Hold left mouse', 'Right mouse', 'Hold Space', 'W / S, Shift+W, wheel over the throttle', 'Q / E', '2', '1 / 3 4 5', 'G / Middle click', 'Middle drag', 'Tab']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/flightConsole.test.tsx`
Expected: FAIL (`FLIGHT` and `FlightStation` do not exist, and `view(d).flight` is undefined).

- [ ] **Step 3: The layout** (`render/duel/consoleLayout.ts`, after `weaponCard`)

```ts
/** Valkyrn spec §5: the Flight seat's weapon block, beside the Helm block at the bottom: two cards (GUN or the laser fit's
 *  LASER, then TORPEDO), the reason line and, with the laser fit, the frequency row. */
export const FLIGHT = { x: STATION.x + STATION.w + EDGE, y: INTERNAL_H - EDGE - 166, w: 300, h: 166 } as const;
/** One Flight card, as weaponCard: `hit` is the clickable part, `anchor` where the targeting line starts. */
export function flightCard(slot: 0 | 1): { x: number; y: number; w: number; h: number; hitH: number; anchor: { x: number; y: number } } {
  const w = 138, x = FLIGHT.x + 8 + slot * (w + 8), y = FLIGHT.y + 6, h = 104, hitH = 72;
  return { x, y, w, h, hitH, anchor: { x: x + w, y: y + hitH / 2 } };
}
```

- [ ] **Step 4: The panel** (`render/duel/consoleModel.ts`)

- Import `Room` from `../../sim/tactical/state`.
- After `WeaponsPanel` add:
```ts
/** Valkyrn spec §8: the GUN card: OFFLINE (Weapons at 2), OVERHEAT (locked) or READY; heat 0..1. */
export interface GunPanel { state: 'READY' | 'OVERHEAT' | 'OFFLINE'; heat: number; locked: boolean }
/** Valkyrn spec §5: the Flight seat's weapons: the GUN card (null with the laser fit) and the Weapons panel its cards and the
 *  contact window read. */
export interface FlightPanel { gun: GunPanel | null; weapons: WeaponsPanel }
```
- `ConsoleView` gains `/** Valkyrn spec §5: the Flight seat's block; present only there. */ flight?: FlightPanel | null;`.
- In `consoleModel`, change `const weapons: WeaponsPanel | null = station === 'weapons'\n    ? { … }\n    : null;` into a builder plus two uses:
```ts
  const weaponsPanel = (): WeaponsPanel => ({ /* the same object literal as before, unchanged */ });
  const weapons: WeaponsPanel | null = station === 'weapons' ? weaponsPanel() : null;
  const gunDef = classOf(t, 0).slots.gun;
  const flight: FlightPanel | null = station === 'flight'
    ? { gun: gunDef ? { state: sys.rooms[Room.Weapons] >= 2 ? 'OFFLINE' : sys.gunLocked === true ? 'OVERHEAT' : 'READY', heat: Math.max(0, Math.min(1, sys.gunHeat / gunDef.heatMax)), locked: sys.gunLocked === true } : null,
        weapons: weaponsPanel() }
    : null;
```
  Move the existing literal into `weaponsPanel` verbatim, keeping Task 7's `burst` guard.
- The return becomes `return { station, tabs, tabActions, helm, weapons, science, side, ...(flight ? { flight } : {}) };`.

- [ ] **Step 5: The contact window's rows** (`render/duel/contactModel.ts`)

In `weaponRows`, `i.station === 'weapons' && i.weapons` becomes `(i.station === 'weapons' || i.station === 'flight') && i.weapons`. The laser row's `enabled: true` becomes `enabled: classOf(state, CREW_SLOT).slots.laser !== null` (add `classOf` to the state import if it is not there).

`app/duel/scene.ts`: in `contactModel({ … })`, `weapons: consoleView?.weapons ?? null` becomes `weapons: consoleView?.weapons ?? consoleView?.flight?.weapons ?? null`.

- [ ] **Step 6: The block** (`ui/duel/FlightStation.tsx`, create)

```tsx
// Valkyrn spec §5, §8: the Flight seat's weapon block, beside the Helm block. GUN: its state (READY, OVERHEAT blinking, OFFLINE)
// and heat bar, fired by the left mouse. TORPEDO: the magazine, its range state or FLYING, its target room; the right mouse
// launches it. With the laser fit, LASER (its charge, target room) takes GUN's place, with the frequency row. A click on a
// card picks the weapon up (the contact window opens and a targeting line runs to the pointer); a right-click clears its
// target. 2 (and 1 with the laser fit) pick them up from the keyboard. Drawn in the CRT ramp on the console.
import { memo, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import type { FlightPanel } from '../../render/duel/consoleModel';
import { FLIGHT, flightCard } from '../../render/duel/consoleLayout';
import { FREQ_NAMES } from '../../render/duel/scienceModel';
import { AMBER, BAR_OFF, DIM, FONT_NATIVE, FONT_SIZE, TEXT } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useActions } from '../context';
import { Bar } from '../stage/Bar';
import { Box } from '../stage/Box';
import { Button } from '../stage/Button';
import { hex } from '../stage/color';
import { useCrt } from '../stage/CrtContext';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';
import { targetText } from './WeaponsStation';

type Weapon = 'laser' | 'torpedo';
/** The GUN card's OVERHEAT blink (Hz, on the CRT clock), as the map's heat word. */
export const OVERHEAT_CARD_HZ = 4;
const stop = (e: SyntheticEvent): void => e.preventDefault();

export const FlightStation = memo(function FlightStation({ flight, aim = null }: { flight: FlightPanel; aim?: Weapon | null }) {
  const actions = useActions(), { crt, now } = useCrt();
  const dim = crt ? CRT.mid : DIM, main = crt ? CRT.main : TEXT, hot = crt ? CRT.hot : AMBER;
  const w = flight.weapons, gun = flight.gun, A = flightCard(0), T = flightCard(1), ax = A.x + 6, tx = T.x + 6, x0 = FLIGHT.x + 8;
  const blinkOn = Math.floor(now * 2 * OVERHEAT_CARD_HZ) % 2 === 0, refused = w.refused ?? null;
  const card = (slot: 0 | 1, weapon: Weapon | null, lit: boolean) => {
    const c = flightCard(slot);
    const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
      e.preventDefault();
      if (!weapon) return;
      if (e.button === 2) { if (weapon === 'torpedo') actions.console.torpLock(-1); else actions.console.lock(-1); return; }
      if (e.button === 0) actions.contact.pickUp(weapon);
    };
    return (
      <>
        <Box x={c.x} y={c.y} w={c.w} h={c.h} attrs={{ 'data-ui-flight-card': weapon ?? 'gun' }} style={{ border: `1px solid ${hex(lit ? hot : dim)}`, pointerEvents: 'none' }} />
        {weapon && <div data-testid={`flight-card-${weapon}`} role="button" onPointerDown={down} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop}>
          <Box x={c.x} y={c.y} w={c.w} h={c.hitH} style={{ pointerEvents: 'auto', cursor: 'pointer', background: lit ? hex(crt ? CRT.glass : BAR_OFF) : 'transparent' }} />
        </div>}
      </>
    );
  };
  const reason = refused !== null ? `${refused.control === 'launch' ? 'TORPEDO' : gun ? 'GUN' : 'LASER'}: ${refused.reason}`
    : !gun && w.laserReason && w.laserReason !== 'FIRING' ? `LASER: ${w.laserReason}` : null;
  return (
    <>
      <Panel x={FLIGHT.x} y={FLIGHT.y} w={FLIGHT.w} h={FLIGHT.h} />
      {gun ? (
        <>
          {card(0, null, false)}
          <PixelText text="GUN" x={ax} y={A.y + 6} size={FONT_NATIVE} tint={dim} />
          <PixelText text="L-CLICK" x={A.x + A.w - 6} y={A.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />
          {(gun.state !== 'OVERHEAT' || blinkOn) && <PixelText text={gun.state} x={ax} y={A.y + 20} size={FONT_SIZE} tint={gun.state === 'READY' ? main : hot} />}
          <PixelText text="HEAT" x={ax} y={A.y + 44} size={FONT_NATIVE} tint={dim} />
          <Bar x={ax + 36} y={A.y + 47} w={A.w - 48} h={6} fill={gun.heat} colour={gun.locked ? hot : main} />
        </>
      ) : (
        <>
          {card(0, 'laser', aim === 'laser')}
          <PixelText text="LASER" x={ax} y={A.y + 6} size={FONT_NATIVE} tint={aim === 'laser' ? hot : dim} />
          <PixelText text="1" x={A.x + A.w - 6} y={A.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />
          <PixelText text={w.laserReason === 'FIRING' ? 'FIRING' : w.charge.value} x={ax} y={A.y + 20} size={FONT_SIZE} tint={w.laserReason === 'FIRING' ? hot : main} />
          <Bar x={ax} y={A.y + 44} w={A.w - 12} h={6} fill={w.charge.bar?.fill ?? 0} colour={main} />
          <PixelText text={targetText(w.laserTarget)} x={ax} y={A.y + 56} size={FONT_NATIVE} tint={w.laserTarget >= 0 ? hot : dim} />
        </>
      )}
      {card(1, 'torpedo', aim === 'torpedo')}
      <PixelText text="TORPEDO" x={tx} y={T.y + 6} size={FONT_NATIVE} tint={aim === 'torpedo' ? hot : dim} />
      <PixelText text="2" x={T.x + T.w - 6} y={T.y + 6} size={FONT_NATIVE} tint={dim} anchorX={1} />
      <PixelText text={`MAG ${w.magazine}`} x={tx} y={T.y + 20} size={FONT_SIZE} tint={main} />
      {w.missileFlying
        ? <PixelText text="FLYING" x={tx} y={T.y + 42} size={FONT_NATIVE} tint={hot} />
        : <PixelText text={w.torpedoInRange ? 'IN RANGE' : 'OUT OF RANGE'} x={tx} y={T.y + 42} size={FONT_NATIVE} tint={w.torpedoInRange ? main : dim} />}
      <PixelText text={targetText(w.torpTarget)} x={tx} y={T.y + 56} size={FONT_NATIVE} tint={w.torpTarget >= 0 ? hot : dim} />
      <PixelText text="R-CLICK: LAUNCH" x={tx} y={T.y + 84} size={FONT_NATIVE} tint={dim} />
      {reason !== null
        ? <PixelText text={reason} x={x0} y={FLIGHT.y + 118} size={FONT_NATIVE} tint={hot} />
        : <PixelText text="Q/E TORPEDO ROOM   T ENEMY" x={x0} y={FLIGHT.y + 118} size={FONT_NATIVE} tint={dim} />}
      {!gun && (
        <>
          <PixelText text="FREQ" x={x0} y={FLIGHT.y + 140} size={FONT_NATIVE} tint={main} />
          {FREQ_NAMES.map((label, f) => <Button key={f} name={`flight-freq-${f}`} label={label} x={x0 + 52 + f * 56} y={FLIGHT.y + 136} w={52} h={24}
            lit={w.freq === f} onPress={() => actions.console.frequency(f)} />)}
        </>
      )}
    </>
  );
});
```

- [ ] **Step 7: The Helm block's hint, the region and the targeting line**

`ui/duel/HelmStation.tsx:71`: `{hint('heading', 'R-CLICK MAP: HEADING', y0 + 170)}` becomes `{hint('heading', helm.flight ? 'MOUSE: STEER' : 'R-CLICK MAP: HEADING', y0 + 170)}   {/* Valkyrn spec §5.1: no click-to-heading on Flight */}`.

`ui/duel/TargetingLine.tsx`: the props become `{ contact, seed = null, from }: { contact: ContactView; seed?: { x: number; y: number } | null; from?: { x: number; y: number } }`, and `const from = weaponCard(weapon).anchor, …` becomes `const start = from ?? weaponCard(weapon).anchor, …`. Rename the later uses of that local `from` to `start`.

`ui/duel/DuelUi.tsx`: import `FlightStation` and `flightCard`. After the `WeaponsStation` line add:
```tsx
          {duel.console?.flight && <FlightStation flight={duel.console.flight} aim={duel.contact?.aimWeapon ?? null} />}
```
and replace the `TargetingLine` line with:
```tsx
          {duel.contact?.aimWeapon && (duel.console?.weapons || duel.console?.flight) && <TargetingLine contact={duel.contact} seed={duel.pointer ?? null}
            from={duel.console?.flight ? flightCard(duel.contact.aimWeapon === 'torpedo' ? 1 : 0).anchor : undefined} />}
```

- [ ] **Step 8: The controls list** (`app/controlsList.ts`)

Import `WEAPON_CODES` and `FREQ_CODES` beside the other input tables. Before the `return`, add:
```ts
  // Valkyrn spec §5.1: the Flight seat (Helm and Weapons in one), written from the same tables where a key is bound there.
  const torpKey = Object.entries(WEAPON_CODES).find(([, w]) => w === 'torpedo')![0], laserKey = Object.entries(WEAPON_CODES).find(([, w]) => w === 'laser')![0];
  const flight: ControlRow[] = [
    { keys: 'Mouse', action: 'At the Flight seat, the nose turns toward the pointer' },
    { keys: 'Hold left mouse', action: 'Fire the minigun (with the laser fit: nothing, the laser fires at its target)' },
    { keys: 'Right mouse', action: 'Launch a torpedo' },
    { keys: `Hold ${keyLabel(FIRE_HELD)}`, action: 'Auto-face: turn the nose onto the enemy' },
    { keys: `${keyLabel(MOVE_CODES.up)} / ${keyLabel(MOVE_CODES.down)}, Shift+${keyLabel(MOVE_CODES.up)}, wheel over the throttle`, action: 'Throttle (it stays set)' },
    { keys: `${codesFor('prevLock').map(keyLabel).join('')} / ${codesFor('interact').map(keyLabel).join('')}`, action: "Step the torpedo's target room" },
    { keys: keyLabel(torpKey), action: 'Pick up the torpedo, then click a room in the enemy window' },
    { keys: `${keyLabel(laserKey)} / ${Object.keys(FREQ_CODES).map(keyLabel).join(' ')}`, action: 'With the laser fit only: pick up the laser; tune its frequency' },
    { keys: `${keyLabel(PING_CODE)} / Middle click`, action: 'Ping the map point (or the enemy)' },
    { keys: 'Middle drag', action: 'Pan the camera' },
    { keys: keyLabel('Tab'), action: 'Switch between the Flight console and the ship view' }
  ];
```
and make the return `[{ title: 'Single player', rows: duel }, { title: 'Single player: Valkyrn', rows: flight }, { title: 'Multiplayer', rows: sector }, { title: 'Anywhere', rows: [...] }]`, keeping the Anywhere rows as they are. In `tests/settingsAndControls.test.ts`, line 36 expects `['Single player', 'Single player: Valkyrn', 'Multiplayer', 'Anywhere']`, and line 39's `const sector = sections[1]!.rows.map(r => r.keys).join(' ');` becomes `const sector = sections.find(s => s.title === 'Multiplayer')!.rows.map(r => r.keys).join(' ');` (the sector keys sit in the Multiplayer section, now third).

- [ ] **Step 9: Run the tests**

Run: `npx vitest run tests/flightConsole.test.tsx tests/valkyrnRuntime.test.ts tests/valkyrnViews.test.ts tests/settingsAndControls.test.ts tests/duelConsoleModel.test.ts tests/uiDuel.test.tsx tests/uiCrt.test.tsx tests/contactModel.test.ts tests/uiBoundary.test.ts tests/noShipIdLiterals.test.ts`
Expected: PASS (drop any file that does not exist).

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/render/duel/consoleModel.ts src/renderer/src/render/duel/consoleLayout.ts src/renderer/src/render/duel/contactModel.ts src/renderer/src/ui/duel/FlightStation.tsx src/renderer/src/ui/duel/HelmStation.tsx src/renderer/src/ui/duel/DuelUi.tsx src/renderer/src/ui/duel/TargetingLine.tsx src/renderer/src/app/duel/scene.ts src/renderer/src/app/controlsList.ts tests/flightConsole.test.tsx tests/settingsAndControls.test.ts
git commit -m "feat(valkyrn): the Flight console block (GUN or LASER, TORPEDO), the contact window on Flight, the controls list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Gates and the look check

**Files:** none in the repo. The screenshot script lives outside it.

- [ ] **Step 1: The Hound did not move, and nothing else broke**

Run: `npx tsx scripts/golden/duel-oracle.ts same` then `npx tsx scripts/golden/canonical-trace.ts same`
Expected: both exit 0, with Task 1's `<R>`, `<T>` and `<F>`.

Run: `npx tsc -b`, then `npx electron-vite build`, then `npx vitest run --maxWorkers=4`
Expected: no type errors; the build succeeds; every test file PASS (rerun a timed-out sim file alone, per Global Constraints). `tests/duelGates.test.ts` passes unedited.

Run: `npm run test:duel-app-runtime`
Expected: exit 0.

- [ ] **Step 2 (controller, not a subagent): the screenshots**

The paid painting must be imported (Task 1 Step 9). Install playwright-core outside the repo, once:
```bash
mkdir -p /c/Users/djuar/AppData/Local/Temp/valkyrn-shots && cd /c/Users/djuar/AppData/Local/Temp/valkyrn-shots && npm init -y >/dev/null && npm i playwright-core@1.48.2 >/dev/null
```
Write `C:\Users\djuar\AppData\Local\Temp\valkyrn-shots\shoot.mjs`:
```js
// Valkyrn Part ii look check (spec §10): picker, interior on foot, Flight mid-fight with the crosshair on the pip, overheat,
// a repair run aft. Uses the Feel-ii staging hook (window.__FTLITE_STAGE__ before the duel starts → window.__ftliteDuel).
import { _electron as electron } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const ROOT = 'C:/Users/djuar/FTLite/.worktrees/valkyrn', OUT = 'C:/Users/djuar/FTLite-shots/valkyrn';
mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: `${ROOT}/node_modules/electron/dist/electron.exe`, args: [ROOT] });
const page = await app.firstWindow();
const wait = (ms) => page.waitForTimeout(ms), shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const rt = (fn, arg) => page.evaluate(fn, arg);
const toClient = (ix, iy) => rt(([x, y]) => { const c = document.querySelector('canvas'), r = c.getBoundingClientRect(), s = Math.min(r.width / 1280, r.height / 720);
  return { x: r.left + (r.width - 1280 * s) / 2 + x * s, y: r.top + (r.height - 720 * s) / 2 + y * s }; }, [ix, iy]);
await page.waitForSelector('[data-testid="single-player"]');
await rt(() => { window.__FTLITE_STAGE__ = true; });
await page.click('[data-testid="single-player"]'); await wait(300); await shot('1-picker');
await page.click('[data-testid="ship-valkyrn"]'); await wait(1500); await shot('2-interior-on-foot');
// Walk east from the Ops spawn (13,3) through the door (14,3) to the front pilot chair (17,3) and sit (E); nudge and retry.
for (let k = 0; k < 8 && (await rt(() => window.__ftliteDuel.view())) !== 'flight'; k++) {
  await page.keyboard.down('KeyD'); await wait(k === 0 ? 1100 : 200); await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyE'); await wait(300);
}
if ((await rt(() => window.__ftliteDuel.view())) !== 'flight') throw new Error('did not reach the Flight seat');
const east = await toClient(900, 360); await page.mouse.move(east.x, east.y); await wait(1500);   // the nose turns east, toward the pointer
await rt(() => { const t = window.__ftliteDuel.duel.tactical, s = t.ships[0], e = t.ships[t.systems[0].target], a = ((s.heading + s.headingAcc) / 256) * 2 * Math.PI;
  Object.assign(e, { x: s.x + Math.sin(a) * 300, y: s.y - Math.cos(a) * 300, vx: s.vx, vy: s.vy, active: true }); });   // the Hunter 300 u dead ahead, matched: the pip on the crosshair line
await page.mouse.down(); await wait(500); await shot('3-flight-crosshair-on-pip'); await page.mouse.up();
await rt(() => { const s = window.__ftliteDuel.duel.tactical.systems[0]; s.gunHeat = 1000; s.gunLocked = true; });
await wait(120); await shot('4-overheat');
await rt(() => { window.__ftliteDuel.duel.tactical.systems[0].rooms[2] = 2; });   // Engines to level 2: the repair point is on the ramp (2,3)
await page.keyboard.press('KeyX'); await wait(300);
await page.keyboard.down('KeyA'); await wait(2400); await shot('5-repair-run-aft'); await wait(2400); await page.keyboard.up('KeyA');
await page.keyboard.down('KeyE'); await wait(1500); await shot('6-repairing-on-the-ramp'); await page.keyboard.up('KeyE');
await app.close();
```
Run: `cd /c/Users/djuar/AppData/Local/Temp/valkyrn-shots && node shoot.mjs`
Expected: six PNGs in `C:\Users\djuar\FTLite-shots\valkyrn\`. Open each and check:
1. The picker lists Hound and Valkyrn, then Back.
2. The painted Valkyrn interior, nose right, with the character token on the Ops floor. Walls run through the painted bulkheads, the doors are in the painted gaps, and FLIGHT, SCIENCE and SHIP show in the tab strip.
3. The Helm map with the Valkyrn silhouette, the crosshair, the pip hot with brackets on the Hunter, tracers, the heat bar, the Helm block with `MOUSE: STEER`, and the GUN and TORPEDO block beside it.
4. OVERHEAT on the card and under the crosshair.
5. The character on foot partway aft along row 3.
6. The repair on the ramp.

If the walk stops short (the memory note: a move must line up with one-tile doors), lengthen the hold. The run must still go through the doors on row 3. Record the results in the final report. A failure goes back to the task that owns it as a fix.

- [ ] **Step 3: Report**

The final report lists:
- each task's commit;
- the oracle and trace `same` lines (R/T/F);
- the full-suite count;
- the screenshot paths with one line each on what they show;
- the open owner gates: the look check (the interior's scale inside the wing-inclusive fit, Decision 2) and the 2MT licence line in `docs/gates.md`.

---

## Self-review

- **Spec coverage.**
  - §3.2 → Task 3 (the test, the hudModel fix, `hullFor`, the schema fallback).
  - §3.3 → Task 3 (parity).
  - §4.1 → Task 1.
  - §4.2, §4.3 → Task 2 (the trace and its deviations in Decision 1).
  - §4.4: the runtime, Tab, `held` length n and the unattended axes → Task 4; the out-of-seat sim rule is Part i's.
  - §4.5 → Task 3.
  - §5, §5.1, binding by binding:
    - pointer aim, LMB gun, RMB torpedo, Space face, W/S, Q/E → Task 4;
    - Shift+W and the wheel over the throttle → the Helm block is reused (Task 4);
    - 2 and 1 → Task 4 (contact controller);
    - 3/4/5 → Task 4 (runtime, laser fit only);
    - G, middle click, middle drag → the unchanged scene ping and pan;
    - Tab → Task 4;
    - no click-to-heading and no HDG marker → Task 4, scene `holdHeading: -1`.
  - §7.4 → Tasks 6 and 7.
  - §8:
    - the cards → Task 8;
    - the laser fit → Tasks 4, 5 and 8.
  - §9 → Task 5 (picker), Task 4 (the sit card), Task 8 (the controls list).
  - §10 views:
    - the lead pip → Task 6;
    - the null-laser model builds → Tasks 7 and 8;
    - the CRT ramp → Tasks 3 and 7;
    - the screenshots → Task 9.
  - §10 sim tests are Part i's; the gate is Part iii's.
- **The Hound.**
  - Every Hound-facing change is the same test or the same output: `battlemapFor`, `lobbyLines`, `stateAxes`, the runtime at crew 2 (`crew > 1` branches), `seatOf` (a Hound never has both Navigation and Weapons in one group), `consoleTabs` (no `flight` key), and the combat frame (no gun keys on a class without a gun).
  - Tasks 2, 3, 4, 7 and 9 prove it with both `same` runs.
- **Types.** The names used across tasks match:
  - Task 4's `Seat`, `DuelView`, `ConsoleStation`, `viewCamera`, `flightSeat` and `MapRequests` are used by Tasks 7 and 8.
  - Task 6's `leadPip` and `onTarget` are used by Task 7's `gunSightDraw`.
  - Task 3's `SOLO_SHIPS` is used by Task 5.
  - `FlightPanel.weapons` (Task 8) feeds `contactModel` and `FlightStation`.
- **Placeholders.** None. Every step names one change; none depends on how a sibling plan turned out (Part i's `HULL_IDS`, its `gunLocked: boolean` and its Task 2 view guards, and Sci-2's record bound are stated as facts).
