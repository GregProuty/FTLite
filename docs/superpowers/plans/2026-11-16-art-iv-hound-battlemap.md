# Art-iv Hound Battlemap Ship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The duel ship (single player and the online duel) becomes the 2-Minute Tabletop Hound-class Transport Ship. It is drawn as the painted battlemap, flipped so the dome cockpit faces right, with crew drawn as round VTT tokens.

**Architecture:** A new `hound.json` layout traced against the painting at two game tiles per map square (painted wall lines on tile centres), so the sim and schema do not change. The painted PNG is imported raw (no palette remap) and mirrored. A pure `battlemapModel` says which layouts have a painting and where it sits in world space. The tile, console and crew layers ask it whether to skip procedural floors and walls, draw console markers, and draw tokens. Fits fold the painted bounds into `fit.x/fit.y`, so tile (0,0) stays at the world origin.

**Tech Stack:** TypeScript, Pixi.js 8.19, vitest 3.2, zod, pngjs (scripts only), Electron.

**Spec:** `docs/superpowers/specs/2026-11-16-hound-battlemap-ship-design.md`

## Global Constraints

- One map square = 2 game tiles. Mirrored-image source x = 420 + 70·tx at the centre of tile tx, and y = 280 + 70·ty at the centre of tile ty. The image's top-left corner sits at tile-edge coordinates (-5.5, -3.5); the world-unit scale is `TILE_PX / 70` per source pixel.
- Painted bounds (alpha > 16), in tile-edge coordinates: x -4.871 .. 23.186, y -2.486 .. 17.314, i.e. `{ x: -4.871, y: -2.486, w: 28.057, h: 19.8 }`.
- No sim, schema or tuning change. `SIM_VERSION` stays as it is. The sector fleet (`shipForCrew`) stays Skiff/Cutter. The Hound enters the sector in Art-iv-b, not here.
- The bought PNG never enters git. It is imported to `public/assets/paid/2mt/hound.png` from `%FTLITE_ASSETS%\2mt-hound\hound.png`, which is already staged at `C:\Users\djuar\FTLite-assets\2mt-hound\hound.png`.
- The licence is CC BY-NC 4.0 and this is a non-commercial demo. The manifest licence field is `paid` (the manifest's paid rules), and the credit line names CC BY-NC 4.0.
- No `0x` literal in `tiles.ts`, `doorModel.ts`, `wallModel.ts` or `effects.ts` (`tests/artGuards.test.ts`).
- A fresh clone without paid files must still run: a missing `ship.hound.map` falls back to today's procedural drawing.
- Work in the worktree `.worktrees/art-iv` on branch `art-iv`. Before running tests there, create the `services/signalling/node_modules` junction (memory: worktree signalling junction) the same way the other worktrees have it.

## File Structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/ship/hound.json` (new) | The traced Hound layout |
| `src/renderer/src/sim/ship/fleet.ts` | `ShipId` gains `'hound'`, plus its LINES entry |
| `src/renderer/src/sim/duel/tuning.ts`, `sim/duel/state.ts` | Repair points per layout id |
| `src/renderer/src/sim/duel/layout.ts` (new) | `DUEL_LAYOUT` (the Hound), one place for every duel caller |
| `src/renderer/src/main.ts`, `src/network/modes/duel.ts`, `src/main/network/onlineDuel.ts`, `src/network/modes/sector.ts` | Use the Hound for the duel; sector can resolve it |
| `scripts/art/importCore.ts`, `art/import.json` | `remap` / `flipX` options; the Hound output |
| `public/assets/manifest.json`, `render/assetNames.ts`, `render/fallback.ts`, `render/credits.generated.ts` | The `ship.hound.map` asset, feature `battlemap` |
| `src/renderer/src/render/battlemapModel.ts` (new) | Pure: which layout has a painting, its origin, scale and bounds |
| `src/renderer/src/render/worldFit.ts`, `render/duel/interiorModel.ts` | `fitRectInBand`; fits take an optional painted rect |
| `src/renderer/src/render/battlemapLayer.ts` (new) | The painted sprite, linear plus mipmaps |
| `render/tiles.ts`, `render/consoleLayer.ts`, `render/consoleModel.ts` | Skip floors and walls; console markers |
| `src/renderer/src/render/tokenModel.ts` (new), `render/crewSprites.ts` | VTT tokens |
| `render/renderer.ts`, `render/duel/interiorView.ts` | Wiring |
| `docs/gates.md`, `docs/art/bible.md` | Licence gate; painted-art exemption |

---

### Task 1: The Hound layout, and the duel flies it

**Files:**
- Create: `src/renderer/src/sim/ship/hound.json`, `src/renderer/src/sim/duel/layout.ts`, `tests/hound.test.ts`
- Modify: `src/renderer/src/sim/ship/fleet.ts`, `src/renderer/src/sim/duel/tuning.ts`, `src/renderer/src/sim/duel/state.ts`, `src/renderer/src/main.ts:48,63`, `src/network/modes/duel.ts:9-16`, `src/main/network/onlineDuel.ts:11-47`, `src/network/modes/sector.ts:8-15`

**Interfaces:**
- Produces: `hound.json` (id `'hound'`); `DUEL_LAYOUT: ShipLayout` from `sim/duel/layout.ts`; `DUEL_REPAIR_POINTS: Readonly<Record<string, readonly RepairPointDef[]>>` from `sim/duel/tuning.ts`; `ShipId = 'skiff' | 'cutter' | 'hound'`.

- [ ] **Step 1: Write the failing test** `tests/hound.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { shipForCrew } from '../src/renderer/src/sim/ship/fleet';

/** The Hound (Art-iv spec sections 1-3): traced against the mirrored 2-Minute Tabletop painting at two tiles per square. */
const TRACE = [
  '      ######           ',
  '  #####MMMM#           ',
  '  #EEE#MMMM#           ',
  '  #EEE#MMMM#           ',
  '#####+#+###############',
  '#HHHHH+OOOOO#######BBB#',
  '#HHHHH#OOOOO#QQQQQ#BBB#',
  '#HHHHH#OOOOO+QQQQQ+BBB#',
  '#HHHHH#OOOOO#QQQQQ#BBB#',
  '#HHHHH+OOOOO#######BBB#',
  '#####+#+###############',
  '  #RRR#LLLL#           ',
  '  #RRR#LLLL#           ',
  '  #####LLLL#           ',
  '      ######           '
];

describe('the Hound layout', () => {
  const ship = parseShip(hound);
  it('is 23 x 15 with the traced rows, the dome (Bridge) to the right', () => {
    expect([ship.width, ship.height]).toEqual([23, 15]);
    expect(ship.rows).toEqual(TRACE);
    expect(ship.stations.find((s) => s.id === 'navigation')!.tile).toEqual([20, 7]);
  });
  it('has the eight rooms and systems of the spec table', () => {
    expect(ship.rooms.map((r) => [r.id, r.system])).toEqual([
      ['B', 'navigation'], ['Q', null], ['O', 'science'], ['M', 'medbay'], ['L', 'lifeSupport'], ['E', 'engineering'], ['R', 'reactor'], ['H', null]
    ]);
  });
  it('spawns in the bunk passage and has the hold ramp airlock', () => {
    for (const [x, y] of ship.spawns) expect(ship.rows[y]![x]).toBe('Q');
    expect(ship.airlocks).toContainEqual({ room: 'H', tile: [0, 7] });
  });
  it('is the duel ship, and the sector fleet is unchanged (Art-iv-b moves it)', () => {
    expect(DUEL_LAYOUT.id).toBe('hound');
    expect([1, 2, 3, 4].map(shipForCrew)).toEqual(['skiff', 'skiff', 'cutter', 'cutter']);
  });
  it('a duel on the Hound seats both players and resolves its repair points', () => {
    const d = createDuel(DUEL_LAYOUT, 7);
    try { expect(d.points.map((p) => p.tacticalRoom).length).toBe(3); } finally { disposeDuel(d); }
  });
});
```

Check the dispose export name in `sim/duel/state.ts` (the function after `createDuel`, documented "Release the duel's interior entities") and use that name.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/hound.test.ts`
Expected: FAIL (cannot resolve `hound.json` / `duel/layout`).

- [ ] **Step 3: Create `hound.json`**

Copy `C:\Users\djuar\AppData\Local\Temp\claude\86da55dbee83ee65\a9e3addb-787d-4a97-aafb-e4cb407b5c4e\scratchpad\hound.json` verbatim (already verified with `parseShip`, 23x15). If the scratchpad has been cleared, write it with exactly these values:
- the rows: `TRACE` above;
- rooms in this order: B Bridge navigation, Q Quarters null, O Ops science, M Medbay medbay, L Life Support lifeSupport, E Engines engineering, R Reactor reactor, H Hold null;
- door edges (width 1): E-H [5,4], R-H [5,10], H-O [6,5], H-O [6,9], M-O [7,4], L-O [7,10], O-Q [12,7], Q-B [18,7];
- breachSites (width 1): B [22,7], Q [15,5], O [10,4], M [8,0], L [9,14], E [4,1], R [4,13], H [0,5];
- stations: navigation B [20,7] 1, weapons B [20,7] 2, science O [9,5] 1, engineering O [9,5] 1, doors O [9,5] 1, lifeSupport L [9,12] 1, medbay M [8,1] 1;
- consoleGroups: [20,7] navigation+weapons, [9,5] science+engineering+doors;
- spawns [[13,7],[14,7],[15,7],[16,7]];
- airlocks H [0,7], L [8,14];
- `"id": "hound", "version": 1`.

- [ ] **Step 4: Fleet, duel layout and repair points**

`fleet.ts`:
```ts
export type ShipId = 'skiff' | 'cutter' | 'hound';
const LINES: Record<ShipId, string> = { skiff: 'Ship: Skiff (2 crew)', cutter: 'Ship: Cutter (4 crew)', hound: 'Ship: Hound (4 crew)' };
```
(`shipForCrew` is unchanged.)

`sim/duel/tuning.ts`: keep `CUTTER_REPAIR_POINTS` and add:
```ts
/** Art-iv spec section 3: the Hound's repair points, one per tactical room. */
export const HOUND_REPAIR_POINTS: readonly { tacticalRoom: number; room: string; tile: readonly [number, number] }[] = [
  { tacticalRoom: Room.Weapons, room: 'O', tile: [10, 8] },
  { tacticalRoom: Room.Shields, room: 'R', tile: [4, 11] },
  { tacticalRoom: Room.Engines, room: 'E', tile: [4, 2] }
];
/** Repair points by layout id; a duel on any other layout throws. */
export const DUEL_REPAIR_POINTS: Readonly<Record<string, typeof CUTTER_REPAIR_POINTS>> = { cutter: CUTTER_REPAIR_POINTS, hound: HOUND_REPAIR_POINTS };
```

`sim/duel/state.ts` in `createDuel`: replace `CUTTER_REPAIR_POINTS.map(` with
```ts
    const defs = DUEL_REPAIR_POINTS[layout.id];
    if (!defs) throw new Error(`no duel repair points for layout ${layout.id}`);
    const points = defs.map((p) => {
```
and import `DUEL_REPAIR_POINTS` in place of `CUTTER_REPAIR_POINTS`. Update the doc comment "A duel on `layout` (the Cutter)" to "(the Hound in the app; the Cutter in older tests)".

`sim/duel/layout.ts` (new):
```ts
import hound from '../ship/hound.json';
import { parseShip } from '../ship/schema';
/** The duel ship (Art-iv spec section 3): the Hound, for single player and the online duel alike. */
export const DUEL_LAYOUT = parseShip(hound);
```

- [ ] **Step 5: Point the callers at `DUEL_LAYOUT`**

- `src/renderer/src/main.ts`: add `import hound from './sim/ship/hound.json';` and `hound: parseShip(hound)` to `ships`. In `single`, use `layout: ships.hound`. Read line 134 (`const layout = parseShip(cutter)`) and its use. If it is the duel or the single-player path, switch it to the Hound. If it is the sector, leave it.
- `src/network/modes/duel.ts` and `src/main/network/onlineDuel.ts`: replace the local `const CUTTER = parseShip(cutter)` with `import { DUEL_LAYOUT } from '…/sim/duel/layout'`, and rename every `CUTTER` use to `DUEL_LAYOUT`. Drop the now-unused `cutter` import.
- `src/network/modes/sector.ts`: add `hound` to the `[starter, skiff, cutter]` list, so a peer can resolve it.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/hound.test.ts` → PASS.
Run: `npm test` → all pass. Duel tests that build a duel from `cutter.json` directly still pass because the Cutter's points are kept. If a test asserts the app's duel layout id or hash (for example in `tests/onlineDuel.test.ts`), update it to `DUEL_LAYOUT`, never to a hard-coded cutter. If `tests/fixtures/net1a-*.json` pins a duel layout hash, stop and report: those fixtures are never re-blessed automatically.
Run: `npm run typecheck` → clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim/ship/hound.json src/renderer/src/sim/duel src/renderer/src/sim/ship/fleet.ts src/renderer/src/main.ts src/network/modes src/main/network/onlineDuel.ts tests
git commit -m "feat(art-iv): the Hound layout traced from the battlemap; the duel flies it"
```

---

### Task 2: Import the painting raw and mirrored, and register the asset

**Files:**
- Modify: `scripts/art/importCore.ts`, `art/import.json`, `public/assets/manifest.json`, `src/renderer/src/render/assetNames.ts`, `src/renderer/src/render/fallback.ts`, `tests/artImport.test.ts`
- Regenerate: `src/renderer/src/render/credits.generated.ts` (via `scripts/gen-credits.ts`, if `tests/credits.test.ts` requires it)

**Interfaces:**
- Produces: asset name `ship.hound.map` (optional); feature `'battlemap'` in `FEATURE_NAMES` = `['ship.hound.map']`; import output fields `remap?: boolean` (default true) and `flipX?: boolean` (default false).

- [ ] **Step 1: Failing tests** in `tests/artImport.test.ts` (reuse the file's `pack`, `output`, `root/repo/source` fixtures):

```ts
describe('raw outputs (Art-iv: a painted battlemap)', () => {
  it('remap false keeps every pixel and alpha exactly; flipX mirrors left-right; raw outputs stay off the contact sheet', () => {
    const r = runImport({ repoRoot: repo, sourceRoot: source, config: { outputs: [output({ frames: [{ x: 0, y: 0, w: 32, h: 16 }], columns: 1, remap: false, flipX: true })] } });
    expect(r.problems).toEqual([]);
    const out = readPng(join(repo, 'public/assets/paid/pack/sheet.png'));
    expect([out.width, out.height]).toEqual([32, 16]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const s = (y * 32 + (31 - x)) * 4, d = (y * 32 + x) * 4;
      const a = pack.data[s + 3]!;
      expect(out.data[d + 3]).toBe(a);
      if (a > 0) expect([...out.data.subarray(d, d + 3)]).toEqual([...pack.data.subarray(s, s + 3)]);
    }
    expect(existsSync(join(repo, '.art', 'contact.png'))).toBe(false);
  });
  it('the defaults still remap and do not flip', () => {
    expect(importConfig.parse({ outputs: [output()] }).outputs[0]).toMatchObject({ remap: true, flipX: false });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/artImport.test.ts`. Expected: FAIL (`remap`/`flipX` are stripped by zod, and pixels are remapped).

- [ ] **Step 3: Implement in `importCore.ts`**

In the `output` schema add:
```ts
  /** Remap to the house palette (default). false keeps the pixels and alpha as bought: a painted battlemap (Art-iv). */
  remap: z.boolean().default(true),
  /** Mirror the packed sheet left-right (Art-iv: the Hound's dome faces right). */
  flipX: z.boolean().default(false)
```
`packSheet` copies only pixels with `alpha !== 0` (`blit` skips alpha 0), which keeps soft alpha as-is. Add:
```ts
/** Mirror an image left-right in place. */
export function flipImageX(img: Image): void {
  const row = img.width * 4;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width >> 1; x++) {
    const a = y * row + x * 4, b = y * row + (img.width - 1 - x) * 4;
    for (let k = 0; k < 4; k++) { const t = img.data[a + k]!; img.data[a + k] = img.data[b + k]!; img.data[b + k] = t; }
  }
}
```
In the write loop:
```ts
  parsed.data.outputs.forEach((o, i) => {
    const sheet = packSheet(sources[i]!, o);
    if (o.flipX) flipImageX(sheet);
    if (o.remap) { remapPixels(sheet.data, remap); sheets.push(sheet); }   // raw outputs stay off the contact sheet (a 2100 px painting would swamp it)
    const path = resolve(run.repoRoot, o.output); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, encodePng(sheet)); written.push(path);
  });
```

- [ ] **Step 4: Register the Hound**

`art/import.json`: append to `outputs`:
```json
    {
      "pack": "2mt-hound/hound.png",
      "frames": [{ "x": 0, "y": 0, "w": 2100, "h": 1540 }],
      "output": "public/assets/paid/2mt/hound.png",
      "columns": 1,
      "remap": false,
      "flipX": true
    }
```
Also extend the `$comment` with "Art-iv: the 2-Minute Tabletop Hound battlemap, raw and mirrored."

`public/assets/manifest.json`: append an entry shaped like the Maru entries, with `name` instead of `sheet`:
```json
  {
    "title": "Hound-class Transport Ship",
    "author": "2-Minute Tabletop",
    "source": "https://www.patreon.com/2minutetabletop",
    "license": "paid",
    "retrieved": "2026-11-16",
    "modifications": "mirrored horizontally by npm run art:import",
    "editedBy": "FTLite art import",
    "credit": "Hound-class Transport Ship by 2-Minute Tabletop (2minutetabletop.com), CC BY-NC 4.0, non-commercial demo",
    "required": false,
    "file": "paid/2mt/hound.png",
    "name": "ship.hound.map"
  }
```
Match the field set of the neighbouring paid entries exactly. If they carry another field (for example `archived`), add it with the same convention.

`assetNames.ts`: `add('optional', 'ship.hound.map');` next to the other paid optional names.
`fallback.ts`: add `'battlemap'` to `Feature`, and `battlemap: ['ship.hound.map'],   // Art-iv spec section 4: the Hound painting` to `FEATURE_NAMES`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/artImport.test.ts tests/manifest.test.ts tests/paidManifest.test.ts tests/credits.test.ts`. If credits fail because `credits.generated.ts` is stale, run `npx tsx scripts/gen-credits.ts` and rerun. Expected: PASS.

- [ ] **Step 6: Run the real import** (the owner's machine has the source)

Run: `npm run art:import`
Expected: it writes `public/assets/paid/2mt/hound.png` (2100x1540) among the other outputs. Check `git status` shows no PNG staged (paid/ is gitignored). Open the PNG and confirm the dome is on the right.

Also run the import from the main checkout (`C:\Users\djuar\FTLite`) after merge. The app serves the main checkout's `public/assets/paid`.

- [ ] **Step 7: Commit**

```bash
git add scripts/art/importCore.ts art/import.json public/assets/manifest.json src/renderer/src/render/assetNames.ts src/renderer/src/render/fallback.ts src/renderer/src/render/credits.generated.ts tests/artImport.test.ts
git commit -m "feat(art-iv): raw mirrored import of the Hound battlemap, asset ship.hound.map"
```

---

### Task 3: The battlemap model and fitting the painted bounds

**Files:**
- Create: `src/renderer/src/render/battlemapModel.ts`, `tests/battlemapModel.test.ts`
- Modify: `src/renderer/src/render/worldFit.ts`, `src/renderer/src/render/duel/interiorModel.ts`, `tests/worldFit.test.ts`

**Interfaces:**
- Consumes: feature `'battlemap'` (Task 2).
- Produces:
```ts
export interface TileRect { x: number; y: number; w: number; h: number }   // in tiles; tile-edge coordinates
export interface BattlemapDef { name: string; pxPerTile: number; origin: { x: number; y: number }; bounds: TileRect }
export const BATTLEMAPS: Readonly<Record<string, BattlemapDef>>;
export function battlemapFor(layoutId: string, missing: ReadonlySet<string>): BattlemapDef | null;
export function fitRect(layoutId: string, widthTiles: number, heightTiles: number, missing: ReadonlySet<string>): TileRect;
// worldFit.ts
export function fitRectInBand(band: Band, rect: TileRect, stage: number): Fit;
export function worldFit(widthTiles: number, heightTiles: number, stage: number, rect?: TileRect): Fit;
// duel/interiorModel.ts
export function duelFit(widthTiles: number, heightTiles: number, stage: number, rect?: TileRect): Fit;
```

- [ ] **Step 1: Failing tests** `tests/battlemapModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BATTLEMAPS, battlemapFor, fitRect } from '../src/renderer/src/render/battlemapModel';
import { fitInBand, fitRectInBand } from '../src/renderer/src/render/worldFit';
import { TILE_PX } from '../src/shared/resolution';

describe('battlemap model (Art-iv spec sections 1 and 4)', () => {
  it('the Hound: 70 source px a tile, image corner at (-5.5, -3.5), so tile centres sit on square boundaries', () => {
    const h = BATTLEMAPS.hound!;
    expect(h.pxPerTile).toBe(70);
    const centreX = (tx: number) => (tx + 0.5 - h.origin.x) * h.pxPerTile, centreY = (ty: number) => (ty + 0.5 - h.origin.y) * h.pxPerTile;
    expect(centreX(0)).toBe(420); expect(centreX(6)).toBe(840); expect(centreY(4)).toBe(560);   // 140 px squares: boundaries 3, 6, 4
    expect(h.bounds.x + h.bounds.w).toBeCloseTo(23.186, 3); expect(h.bounds.y + h.bounds.h).toBeCloseTo(17.314, 3);
  });
  it('only a known layout with its asset loaded has a painting; otherwise the fit is the tile bounds', () => {
    expect(battlemapFor('hound', new Set())).toBe(BATTLEMAPS.hound);
    expect(battlemapFor('hound', new Set(['ship.hound.map']))).toBeNull();
    expect(battlemapFor('cutter', new Set())).toBeNull();
    expect(fitRect('cutter', 29, 13, new Set())).toEqual({ x: 0, y: 0, w: 29, h: 13 });
    expect(fitRect('hound', 23, 15, new Set())).toEqual(BATTLEMAPS.hound!.bounds);
  });
});

describe('fitRectInBand', () => {
  const band = { x: 0, y: 0, w: 1000, h: 500 };
  it('equals fitInBand for a rect at the origin', () => {
    for (const stage of [1, 1.5, 2]) expect(fitRectInBand(band, { x: 0, y: 0, w: 20, h: 10 }, stage)).toEqual(fitInBand(band, 20, 10, stage));
  });
  it('a rect starting at negative tiles is centred in the band and keeps tile (0,0) at fit.x/fit.y', () => {
    const r = { x: -4, y: -2, w: 30, h: 20 }, f = fitRectInBand(band, r, 1);
    const left = f.x + r.x * TILE_PX * f.scale, right = left + r.w * TILE_PX * f.scale;
    expect(Math.abs((left - band.x) - (band.x + band.w - right))).toBeLessThanOrEqual(1);
    expect(f.x).toBeGreaterThan(left);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/battlemapModel.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`render/battlemapModel.ts`:
```ts
import { featureReady } from './fallback';

/** A rectangle in tiles, tile-edge coordinates (tile (0,0) spans 0..1). */
export interface TileRect { x: number; y: number; w: number; h: number }
/** A painted battlemap under a layout (Art-iv spec section 4): the asset name, source pixels per tile, the image's
 *  top-left corner in tiles, and the painted (alpha) bounds in tiles that the camera fits. */
export interface BattlemapDef { name: string; pxPerTile: number; origin: { x: number; y: number }; bounds: TileRect }

/** Hound: 140 px squares at two tiles a square; mirrored, so source x = 420 + 70 tx at a tile centre (spec section 1). */
export const BATTLEMAPS: Readonly<Record<string, BattlemapDef>> = {
  hound: { name: 'ship.hound.map', pxPerTile: 70, origin: { x: -5.5, y: -3.5 }, bounds: { x: -4.871, y: -2.486, w: 28.057, h: 19.8 } }
};

/** The painting for `layoutId`, or null when the layout has none or its asset is missing (the procedural fallback draws). */
export function battlemapFor(layoutId: string, missing: ReadonlySet<string>): BattlemapDef | null {
  const def = BATTLEMAPS[layoutId];
  return def && featureReady(missing, 'battlemap') && !missing.has(def.name) ? def : null;
}

/** What the camera fits: the painted bounds when a painting draws, else the tile bounds. */
export function fitRect(layoutId: string, widthTiles: number, heightTiles: number, missing: ReadonlySet<string>): TileRect {
  return battlemapFor(layoutId, missing)?.bounds ?? { x: 0, y: 0, w: widthTiles, h: heightTiles };
}
```

`worldFit.ts`: add the import `import type { TileRect } from './battlemapModel';` and replace `fitInBand` and `worldFit` with:
```ts
/** Fit a rectangle of tiles into a band (never above 1x), snap the scale, and centre the rectangle; x and y are where tile (0,0) lands, on whole screen pixels. */
export function fitRectInBand(band: Band, rect: TileRect, stage: number): Fit {
  const w = rect.w * TILE_PX, h = rect.h * TILE_PX;
  const scale = snapWorldScale(Math.min(1, band.w / w, band.h / h), stage);
  const onScreen = (v: number): number => Math.round(v * stage) / stage;
  return { scale, x: onScreen(band.x + (band.w - w * scale) / 2 - rect.x * TILE_PX * scale), y: onScreen(band.y + (band.h - h * scale) / 2 - rect.y * TILE_PX * scale) };
}

/** Fit a ship of the given tile size into a band (never above 1x), snap the scale for the stage scale, and centre it with x and y on whole screen pixels (x * stage and y * stage whole). */
export function fitInBand(band: Band, widthTiles: number, heightTiles: number, stage: number): Fit {
  return fitRectInBand(band, { x: 0, y: 0, w: widthTiles, h: heightTiles }, stage);
}

/** The sector ship in the world band (spec Demo-iv section 3), snapped for the stage scale (Art-i spec section 4); `rect` (Art-iv): the painted bounds to fit instead of the tiles. */
export function worldFit(widthTiles: number, heightTiles: number, stage: number, rect?: TileRect): Fit {
  return rect ? fitRectInBand(WORLD_BAND, rect, stage) : fitInBand(WORLD_BAND, widthTiles, heightTiles, stage);
}
```
`duel/interiorModel.ts`: same optional `rect` on `duelFit`, calling `fitRectInBand(INTERIOR_BAND, rect, stage)` when it is given.

`battlemapModel.ts` imports `fallback.ts`, and `worldFit.ts` imports only the type from `battlemapModel`, so there is no cycle.

- [ ] **Step 4: Run** `npx vitest run tests/battlemapModel.test.ts tests/worldFit.test.ts` → PASS (the existing worldFit cases are unchanged: `fitRectInBand` with a zero origin reproduces the old arithmetic exactly).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/render/battlemapModel.ts src/renderer/src/render/worldFit.ts src/renderer/src/render/duel/interiorModel.ts tests/battlemapModel.test.ts
git commit -m "feat(art-iv): battlemap model and fitting the painted bounds"
```

---

### Task 4: Draw the painting; skip procedural floors, walls and consoles

**Files:**
- Create: `src/renderer/src/render/battlemapLayer.ts`
- Modify: `src/renderer/src/render/tiles.ts`, `src/renderer/src/render/consoleLayer.ts`, `src/renderer/src/render/consoleModel.ts`, `src/renderer/src/render/renderer.ts`, `src/renderer/src/render/duel/interiorView.ts`, `tests/battlemapModel.test.ts`

**Interfaces:**
- Consumes: `battlemapFor`, `fitRect` (Task 3).
- Produces: `createBattlemapLayer(assets: GameAssets): { container: Container; draw(state: SimState): void }`; `MARKER_TINT: Readonly<Record<ConsoleLook, number>>` and `markerRect(): DoorRect`-like `{ x, y, w, h, r }` from `consoleModel.ts`.

- [ ] **Step 1: Failing test** (append to `tests/battlemapModel.test.ts`):

```ts
import { MARKER_TINT, markerRect } from '../src/renderer/src/render/consoleModel';
describe('console markers on a painted ship', () => {
  it('one rounded square inside the tile, distinct tints per look', () => {
    const r = markerRect();
    expect(r.x).toBeGreaterThan(0); expect(r.x + r.w).toBeLessThan(TILE_PX); expect(r.w).toBe(r.h);
    expect(new Set(Object.values(MARKER_TINT)).size).toBe(3);
  });
});
```

- [ ] **Step 2: Run** it. Expected: FAIL (no export).

- [ ] **Step 3: consoleModel.ts**: add

```ts
/** Art-iv spec section 4: on a painted ship the painting shows the console; a VTT-style marker on its tile carries its state. */
export const MARKER_TINT: Readonly<Record<ConsoleLook, number>> = { free: 0xffc857, occupied: 0x8a93a6, down: 0xe5533d };
export function markerRect(): { x: number; y: number; w: number; h: number; r: number } { return { x: 3, y: 3, w: TILE_PX - 6, h: TILE_PX - 6, r: 6 }; }
```
(Import `TILE_PX` if consoleModel does not already have it.)

- [ ] **Step 4: battlemapLayer.ts**

```ts
import { Container, Sprite } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import type { GameAssets } from './assets';
import { battlemapFor } from './battlemapModel';

/** The painted battlemap under the interior (Art-iv spec section 4): one sprite, smoothly filtered (painted art is exempt
 *  from the whole-pixel rule), placed so the painted walls line up with the layout's wall tiles. Hidden for other layouts. */
export function createBattlemapLayer(assets: GameAssets): { container: Container; draw(state: SimState): void } {
  const container = new Container(), missing = new Set(assets.missing);
  let drawnFor: string | null = null;
  return {
    container,
    draw(state) {
      if (drawnFor === state.layout.id) return;
      drawnFor = state.layout.id;
      for (const c of container.removeChildren()) c.destroy();
      const def = battlemapFor(state.layout.id, missing);
      if (!def) return;
      const tex = assets.texture(def.name), src = tex.source;
      src.scaleMode = 'linear';
      src.autoGenerateMipmaps = true;
      src.updateMipmaps();
      const s = new Sprite(tex);
      s.scale.set(TILE_PX / def.pxPerTile);
      s.position.set(def.origin.x * TILE_PX, def.origin.y * TILE_PX);
      container.addChild(s);
    }
  };
}
```
Verify the mipmap calls against `node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/TextureSource.d.ts` (8.19). If `autoGenerateMipmaps` only takes effect at construction (no mip levels are allocated afterwards), set `src.mipLevelCount` the same way the constructor does, or build a new `TextureSource` from `src.resource` with `{ autoGenerateMipmaps: true, scaleMode: 'linear' }` and a `new Texture({ source })`. Record which one was used in a comment. On-screen it is shown at about a third of its source size; without mipmaps it shimmers.

- [ ] **Step 5: tiles.ts**: skip floors and walls under a painting

In `createTileLayer` add `const missing = new Set(assets.missing);` and `let painted = false;`, plus the import `import { battlemapFor } from './battlemapModel';`. At the top of `build`, after clearing `base` and `floorArt`:
```ts
    painted = battlemapFor(state.layout.id, missing) !== null;
    if (painted) { builtFor = d.layoutHash; doorProgress.clear(); lockProgress.clear(); return; }   // Art-iv: the painting is the floor and walls
```
In `draw`: `if (p.floor && !art && !painted) at(x, y, p.floor).fill(ROLE.floor);`. Doors and airlocks draw as before.

- [ ] **Step 6: consoleLayer.ts**: markers

Add `const missing = new Set(assets.missing);`, the import of `battlemapFor`, and `MARKER_TINT, markerRect` from `./consoleModel`. In `draw`, after the `key` check and `g.clear()`:
```ts
      if (battlemapFor(state.layout.id, missing)) {
        for (const s of art.removeChildren()) s.destroy();
        const m = markerRect();
        for (const c of list) g.roundRect(c.x + m.x, c.y + m.y, m.w, m.h, m.r).stroke({ width: 2, color: MARKER_TINT[c.look], alpha: 0.9 });
        return;
      }
```
Check in `consoles()` that `c.x, c.y` are the tile's top-left in world units (the desk path draws `c.x + p.desk.x`). If they are the tile centre, offset by `-TILE_PX / 2`.

- [ ] **Step 7: Wire into the sector renderer and the duel interior**

`renderer.ts`: `const battlemap = createBattlemapLayer(assets);` then `world.addChild(battlemap.container, tiles.container, …)` (the painting is first, under the tiles). In `draw`:
```ts
      const fit = worldFit(d.width, d.height, stage, fitRect(state.layout.id, d.width, d.height, missing)); world.scale.set(fit.scale);
      …
      battlemap.draw(state);
      tiles.update(state, dt);
```
(`missing` already exists in `createRenderer`.)

`duel/interiorView.ts`: likewise `const battlemap = createBattlemapLayer(assets);`, added first in `world.addChild(...)`. In `draw`: `fit = duelFit(st.derived.width, st.derived.height, stageScale(), fitRect(st.layout.id, st.derived.width, st.derived.height, missing))` and `battlemap.draw(st)` before `tiles.update`.

- [ ] **Step 8: Run** `npm test` and `npm run typecheck` → pass (artGuards: no `0x` added to tiles.ts).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/render tests/battlemapModel.test.ts
git commit -m "feat(art-iv): draw the Hound painting under the interior; console markers; no procedural floor or walls on it"
```

---

### Task 5: Crew as VTT tokens on a painted ship

**Files:**
- Create: `src/renderer/src/render/tokenModel.ts`, `tests/tokenModel.test.ts`
- Modify: `src/renderer/src/render/crewSprites.ts`

**Interfaces:**
- Consumes: `battlemapFor`; `CREW_COLORS` (crewSprites.ts); `Facing8`.
- Produces:
```ts
export interface TokenLook { radius: number; fill: number; fillAlpha: number; rim: number; ring: number | null; cross: boolean; tick: { x: number; y: number } | null }
export function tokenLook(pid: number, life: 'conscious' | 'downed' | 'dead', seated: boolean, facing: Facing8): TokenLook;
```

- [ ] **Step 1: Failing test** `tests/tokenModel.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { tokenLook, TOKEN_RADIUS } from '../src/renderer/src/render/tokenModel';
import { CREW_COLORS } from '../src/renderer/src/render/crewSprites';
import { TILE_PX } from '../src/shared/resolution';

describe('VTT tokens (Art-iv spec section 5)', () => {
  it('a conscious player: their colour, a rim, a facing tick on the rim, no ring or cross', () => {
    const t = tokenLook(1, 'conscious', false, 'e');
    expect(t.fill).toBe(CREW_COLORS[1]); expect(t.ring).toBeNull(); expect(t.cross).toBe(false);
    expect(t.tick!.x).toBeCloseTo(TOKEN_RADIUS, 6); expect(t.tick!.y).toBeCloseTo(0, 6);
  });
  it('about half a square (one tile) across', () => {
    expect(2 * TOKEN_RADIUS).toBeGreaterThan(0.8 * TILE_PX); expect(2 * TOKEN_RADIUS).toBeLessThanOrEqual(TILE_PX);
  });
  it('seated gets a bright ring; downed goes grey with a red cross and no tick; dead is grey', () => {
    expect(tokenLook(0, 'conscious', true, 's').ring).not.toBeNull();
    const d = tokenLook(0, 'downed', false, 's');
    expect(d.cross).toBe(true); expect(d.tick).toBeNull(); expect(d.fill).not.toBe(CREW_COLORS[0]);
    expect(tokenLook(0, 'dead', false, 's').fill).toBe(d.fill);
  });
  it('diagonal facings put the tick on the rim', () => {
    const t = tokenLook(2, 'conscious', false, 'nw').tick!;
    expect(Math.hypot(t.x, t.y)).toBeCloseTo(TOKEN_RADIUS, 6); expect(t.x).toBeLessThan(0); expect(t.y).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run** → FAIL (module missing).

- [ ] **Step 3: tokenModel.ts**

```ts
import { TILE_PX } from '../../../shared/resolution';
import type { Facing8 } from './assetNames';

/** The player colours (moved here from crewSprites.ts, which re-exports them). */
export const CREW_COLORS = [0x4fc3f7, 0x81c784, 0xffb74d, 0xe57373];

/** Art-iv spec section 5: a crew member on a painted ship is a round VTT token, about half a map square (one tile) across. */
export const TOKEN_RADIUS = 0.45 * TILE_PX;
const RIM = 0x14161c, GREY = 0x777777, RING = 0xffe08a;
const ANGLE: Readonly<Record<Facing8, number>> = { e: 0, se: Math.PI / 4, s: Math.PI / 2, sw: 3 * Math.PI / 4, w: Math.PI, nw: -3 * Math.PI / 4, n: -Math.PI / 2, ne: -Math.PI / 4 };

export interface TokenLook { radius: number; fill: number; fillAlpha: number; rim: number; ring: number | null; cross: boolean; tick: { x: number; y: number } | null }

/** Pure: the token for a player by life state, seat and facing. */
export function tokenLook(pid: number, life: 'conscious' | 'downed' | 'dead', seated: boolean, facing: Facing8): TokenLook {
  const up = life === 'conscious', a = ANGLE[facing];
  return {
    radius: TOKEN_RADIUS, fill: up ? CREW_COLORS[pid % 4]! : GREY, fillAlpha: life === 'dead' ? 0.6 : 1, rim: RIM,
    ring: up && seated ? RING : null, cross: life === 'downed',
    tick: up ? { x: Math.cos(a) * TOKEN_RADIUS, y: Math.sin(a) * TOKEN_RADIUS } : null
  };
}
```
In `crewSprites.ts`, delete its own `CREW_COLORS` constant and add `import { CREW_COLORS, tokenLook } from './tokenModel'; export { CREW_COLORS };`. This avoids an import cycle, and `callouts.ts` keeps importing `CREW_COLORS` from `crewSprites`.

- [ ] **Step 4: crewSprites.ts**: the token path

Add the imports (`battlemapFor`, `tokenLook`), plus `const missing = new Set(assets.missing);` and `const tokens = new Map<number, Graphics>();`. At the start of `draw`, after the `carried`/`torps` setup:
```ts
      if (battlemapFor(state.layout.id, missing)) {   // Art-iv spec section 5: VTT tokens on a painted ship
        syncCache(sprites, [], () => { throw new Error('unreachable'); }, (cs) => cs.sprite.destroy());
        syncCache(circles, [], () => { throw new Error('unreachable'); }, (g) => g.destroy());
        syncCache(tokens, liveIds, () => { const g = new Graphics(); container.addChild(g); return g; }, (g, id) => { g.destroy(); memory.prev.delete(id); memory.lastDrawn.delete(id); memory.facing.delete(id); });
        for (const eid of state.crew) {
          const id = Stable.id[eid]!, g = tokens.get(id)!, { x, y, dx, dy } = interpolated(eid, alpha, pointFor(eid));
          const facing: Facing8 = facingFromDelta(dx, dy, memory.facing.get(id) ?? 's'); memory.facing.set(id, facing);
          const l = Life.state[eid], t = tokenLook(Owner.pid[eid]!, l === LifeState.Conscious ? 'conscious' : l === LifeState.Downed ? 'downed' : 'dead', Seated.station[eid]! >= 0, facing);
          g.clear();
          if (t.ring !== null) g.circle(0, 0, t.radius + 3).stroke({ width: 2, color: t.ring });
          g.circle(0, 0, t.radius).fill({ color: t.fill, alpha: t.fillAlpha }).stroke({ width: 3, color: t.rim });
          g.circle(0, 0, t.radius * 0.35).fill({ color: t.rim, alpha: 0.35 });   // the figure's head, seen from above
          if (t.tick) g.moveTo(t.tick.x * 0.55, t.tick.y * 0.55).lineTo(t.tick.x, t.tick.y).stroke({ width: 3, color: t.rim });
          if (t.cross) { const k = t.radius * 0.6; g.moveTo(-k, -k).lineTo(k, k).moveTo(k, -k).lineTo(-k, k).stroke({ width: 3, color: 0xe5533d }); }
          g.position.set(x * TILE_PX, y * TILE_PX + (bob[Owner.pid[eid]!] ?? 0));
          drawCarried(state, eid, Owner.pid[eid]!, x, y);
        }
        return;
      }
      syncCache(tokens, [], () => { throw new Error('unreachable'); }, (g) => g.destroy());
```
Place the final `syncCache(tokens, [] …)` line just before the existing `if (!useArt)` branch, so leaving a painted ship clears its tokens.

- [ ] **Step 5: Run** `npx vitest run tests/tokenModel.test.ts` → PASS; then `npm test` and `npm run typecheck` → pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/tokenModel.ts src/renderer/src/render/crewSprites.ts tests/tokenModel.test.ts
git commit -m "feat(art-iv): crew as VTT tokens on a painted ship"
```

---

### Task 6: Docs, gate, and the look in the running app

**Files:**
- Modify: `docs/gates.md`, `docs/art/bible.md`, `docs/roadmap.md` (an Art-iv line, plus Art-iv-b under next)

- [ ] **Step 1: gates.md**: add under the licence gates (next to the Maru/Pimen licence check):

```markdown
- [ ] **2-Minute Tabletop Hound art (CC BY-NC 4.0)**: the duel ship's painting is non-commercial. Before any sale, get a commercial licence from 2-Minute Tabletop or replace the art. (Art-iv, 2026-11-16)
```

- [ ] **Step 2: bible.md**: add a section "Painted battlemaps (Art-iv)" with the following points.
  - A painted ship is the one exception to the 16 px, palette and whole-number rules. It is smoothly filtered with mipmaps and keeps its own colours.
  - Two game tiles per map square, with painted wall lines on tile centres.
  - Doors, hazards, lights and particles draw over it unchanged.
  - Crew are tokens on it.
  - The fit uses the painted bounds.

- [ ] **Step 3: Full verification**

Run, in order, and paste the summaries into the task report:
- `npm run typecheck`
- `npm test`
- `npm run test:determinism`. The sector fleet is unchanged, so this must still pass. If it fails, stop and report: do not touch `tests/fixtures/determinism-v2.json`.
- The smokes the repo runs (see `package.json` scripts named `smoke*`).

- [ ] **Step 4: Screenshots** (follow the visual-check method: playwright-core outside the repo, Electron `_electron.launch` on `out/` after `npm run build`)

Take these and save them to `C:\Users\djuar\FTLite-shots\art-iv\`:
1. Single player, duel interior, at start.
2. A crew member walking through the O-Q door (12,7).
3. A hit with fire and a breach.
4. The alert grade.
5. The same build with `public/assets/paid/2mt/hound.png` renamed away, showing the procedural fallback. Restore the file afterwards.

Check each image by eye:
- the painted walls line up with doors;
- tokens stay on painted floor;
- the dome is on the right;
- the engine pods are not cropped.

- [ ] **Step 5: Commit**

```bash
git add docs/gates.md docs/art/bible.md docs/roadmap.md
git commit -m "docs(art-iv): CC BY-NC gate for the Hound art; painted battlemap rules in the bible"
```
