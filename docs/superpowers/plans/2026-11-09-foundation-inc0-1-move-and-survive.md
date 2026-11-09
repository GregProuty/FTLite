# FTLite Foundation, Increments 0 and 1 ("Move and survive") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic, headless-testable ship simulation (seeded RNG, state hash, snapshots, golden replays) plus the first playable slice: 1-4 crew walk a fixed ship, doors open and seal, oxygen and fire run on the room graph, breaches vent rooms, crew get downed and revived, hazards are repaired, and a timer spawner plus an always-on oxygen injector stub make a run survivable.

**Architecture:** Authoritative fixed-step (60 Hz) simulation in `src/renderer/src/sim/` driven by per-player `Intent`s, with no dependency on Pixi, DOM or Electron. Crew are bitECS 0.4.0 entities with SoA components; room, door and breach data are flat typed arrays in `SimState` (graph data, not entities). One canonical `flatten(state)` feeds both `hashState` and snapshots. `app/` runs the accumulator loop and turns `InputFrame`s into `Intent`s; `render/` (PixiJS 8) reads state and never mutates it.

**Tech Stack:** TypeScript 5.8, electron-vite 5, Electron 37, Vite 7, vitest 3, bitecs 0.4.0, pixi.js 8.19, zod 3, fast-check 3.

**Spec:** `docs/superpowers/specs/2026-11-09-foundation-design.md`. Later increments (2a power/consoles, 2b overdrive/weapons, 3 skills, 4 director) are separate plans.

## Global Constraints

- `src/renderer/src/sim/` and `src/shared/` import nothing from `render/`, `input/`, `app/`, `pixi.js`, `electron` or the DOM. Enforced by `tests/boundary.test.ts`.
- No `Math.random`, `Date`, `performance.now`, `Math.sin`, `Math.cos`, `Math.atan2`, `Math.pow`, `Math.hypot` in `sim/` or `shared/`. Enforced by `tests/boundary.test.ts` (source scan). Use `Math.sqrt(x*x + y*y)` for lengths.
- Named RNG streams: `hazards` (hazard targets, fire spread), `director` (spawn timing, hazard type), `combat`, `loot`, `cosmetic`. Every stream state lives in `SimState.rng`.
- Wherever iteration order affects RNG draws or damage, iterate crew by `PlayerId`, rooms/edges/sites by array index.
- Fixed system order per tick: (1) input, arbitration, movement, doors; (2) power (none yet); (3) stations (none yet); (4) hazards on every 5th tick (oxygen, fire, breach venting); (5) debris (none yet); (6) director (stub spawner); (7) crew lifecycle (damage, downed, bleed-out, run end).
- Every entity carries a `StableId` (monotonic counter in state). Renderer caches are keyed by `StableId`.
- All tuning numbers live in `src/renderer/src/sim/tuning.ts`. Treat them as hypotheses.
- Positions are in **tiles** (floats). Oxygen mass is in tile-units: a full room holds `volume` units.
- Licence rule: no code copied from GPL projects (XFTL, Tachyon, FTL-Hyperspace, EmptyEpsilon) or Barotrauma. Original formulas and constants.
- Per-task commits. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Windows desktop target. Commands below are for Git Bash / PowerShell on Windows; `npm` is the package manager.

---

## File structure

electron-vite layout (same as the owner's previous project): `src/main` (Electron main), `src/preload`, `src/renderer` (the game), `src/shared` (no runtime deps).

| Path | Responsibility |
|---|---|
| `package.json`, `electron.vite.config.ts`, `tsconfig*.json`, `vitest.config.ts`, `electron-builder.yml` | Tooling. |
| `src/shared/resolution.ts` | `INTERNAL_W`, `INTERNAL_H`, `TILE_PX`. |
| `src/shared/rng.ts` | mulberry32: `createRng`, `nextU32`, `nextFloat`, `nextInt`. |
| `src/shared/hash.ts` | FNV-1a 32-bit over `Float64Array` bytes. |
| `src/shared/intent.ts` | `PlayerId`, `Intent`, `NEUTRAL_INTENT`, `clampIntent`. |
| `src/renderer/src/sim/tuning.ts` | All constants. |
| `src/renderer/src/sim/ship/schema.ts` | zod schema + `superRefine` validation for ship JSON, `ShipLayout` type. |
| `src/renderer/src/sim/ship/derived.ts` | `Derived` tables rebuilt from a layout: `roomOfTile`, `solidBase`, room volumes, edge/site lookups, oxygen `kEff`. |
| `src/renderer/src/sim/ship/reachability.ts` | Crew-sized BFS used by validation. |
| `src/renderer/src/sim/ship/starter.json` | The starter ship fixture. |
| `src/renderer/src/sim/components.ts` | bitECS SoA components for crew. |
| `src/renderer/src/sim/state.ts` | `SimState`, `createSimState(layout, playerCount, seed)`, `deriveStreams`. |
| `src/renderer/src/sim/grid.ts` | `solidAt(state, tx, ty)`, `roomAt(state, x, y)`. |
| `src/renderer/src/sim/movement.ts` | Per-axis movement with wall sliding. |
| `src/renderer/src/sim/doors.ts` | Door zones, auto open/close, seal with deferral, `DoorState` enum. |
| `src/renderer/src/sim/interact.ts` | Reach, Interact/Confirm targets, arbitration, repair and revive progress. |
| `src/renderer/src/sim/hazards/oxygen.ts` | Room-graph oxygen step with proportional outflow scaling, sinks, injection clamp, counters. |
| `src/renderer/src/sim/hazards/fire.ts` | Fire growth/shrink, consumption, spread. |
| `src/renderer/src/sim/hazards/breach.ts` | Breach activation and repair. |
| `src/renderer/src/sim/hazards/stub.ts` | Always-on injector stub and timer spawner (replaced in 2a / 4). |
| `src/renderer/src/sim/crew.ts` | Damage, Downed, bleed-out, Dead, run-end check. |
| `src/renderer/src/sim/step.ts` | `step(state, intents)` in the fixed system order. |
| `src/renderer/src/sim/flatten.ts` | Canonical `flatten(state): Float64Array` and `unflatten`. |
| `src/renderer/src/sim/hash.ts` | `hashState(state): string`. |
| `src/renderer/src/sim/snapshot.ts` | `saveSnapshot`, `loadSnapshot` with versioned header. |
| `src/renderer/src/sim/replay.ts` | `Replay` type, `runReplay`. |
| `src/renderer/src/app/loop.ts` | `stepAccumulator`. |
| `src/renderer/src/app/intents.ts` | `InputFrame` → per-tick `Intent` with edge queue. |
| `src/renderer/src/app/session.ts` | Lobby → run → game over state machine, pause, error boundary. |
| `src/renderer/src/input/deviceManager.ts` | Pure device-to-player mapping over `SourceSample`s. |
| `src/renderer/src/input/sources.ts` | Keyboard clusters and gamepad polling adapters. |
| `src/renderer/src/render/letterbox.ts` | Integer letterbox maths. |
| `src/renderer/src/render/cache.ts` | `StableId`-keyed sprite cache sync (pure). |
| `src/renderer/src/render/renderer.ts` | Pixi init, tile layer, crew, overlays. |
| `src/renderer/src/render/hud.ts` | HUD text. |
| `src/renderer/src/main.ts` | Renderer entry: wires input, session, render. |
| `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html` | Electron shell. |
| `scripts/bless-golden.ts` | Regenerates golden replay hashes deliberately. |
| `tests/**` | vitest tests, `tests/helpers/bot.ts` scripted repair bot, `tests/golden/*.json`. |
| `docs/spikes.md` | Recorded spike results (bitECS snapshot behaviour, gamepad matrix). |

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `vitest.config.ts`, `electron-builder.yml`, `.gitignore`
- Create: `src/shared/resolution.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.ts`, `src/renderer/src/vite-env.d.ts`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: `INTERNAL_W = 960`, `INTERNAL_H = 540`, `TILE_PX = 32` from `src/shared/resolution.ts`.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "ftlite",
  "version": "0.0.1",
  "private": true,
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b",
    "bless": "vitest run tests/golden.test.ts --update-golden",
    "dist": "electron-vite build && electron-builder --win"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "electron": "37.10.3",
    "electron-builder": "^26.0.0",
    "electron-vite": "5.0.0",
    "fast-check": "^3.22.0",
    "tsx": "^4.19.0",
    "typescript": "~5.8.0",
    "vite": "^7.0.0",
    "vitest": "3.2.7"
  },
  "dependencies": {
    "bitecs": "0.4.0",
    "pixi.js": "8.19.0",
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: Write the configs**

`electron.vite.config.ts`:
```ts
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {},
  preload: {},
  renderer: {}
});
```

`tsconfig.json`:
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "composite": true, "skipLibCheck": true, "noUncheckedIndexedAccess": true,
    "outDir": "./.tsout/node", "emitDeclarationOnly": true,
    "types": ["node"]
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "electron.vite.config.ts"]
}
```

`tsconfig.web.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "composite": true, "skipLibCheck": true, "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "./.tsout/web", "emitDeclarationOnly": true,
    "lib": ["ES2023", "DOM"]
  },
  "include": ["src/renderer/src/**/*", "src/renderer/src/**/*.json", "src/shared/**/*", "tests/**/*", "scripts/**/*"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' }
});
```

`electron-builder.yml`:
```yaml
appId: com.ftlite.foundation
productName: FTLite
directories:
  output: dist
files:
  - out/**/*
win:
  target: nsis
nsis:
  oneClick: true
  artifactName: ftlite-setup-${version}.exe
```

`.gitignore`:
```
node_modules
out
dist
.tsout
*.log
```

- [ ] **Step 3: Write the shared resolution constants and Electron shell**

`src/shared/resolution.ts`:
```ts
// Single source of truth for the fixed internal render resolution (16:9) and tile size,
// shared by the main process (minimum content size) and the renderer (letterbox).
// Note: shared/ is scanned by tests/boundary.test.ts; do not mention DOM globals even in comments.
export const INTERNAL_W = 960;
export const INTERNAL_H = 540;
export const TILE_PX = 32;
```

`src/main/index.ts`:
```ts
import { app, BrowserWindow, Menu } from 'electron';
import { join } from 'node:path';
import { INTERNAL_W, INTERNAL_H } from '../shared/resolution';

function createWindow(): void {
  const packaged = app.isPackaged;
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    minWidth: INTERNAL_W,
    minHeight: INTERNAL_H,
    fullscreen: packaged,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      devTools: !packaged
    }
  });
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { app.quit(); });
```

`src/preload/index.ts`:
```ts
// Nothing is exposed to the renderer yet. The sim loop runs in the renderer process (spec §8).
export {};
```

`src/renderer/index.html`:
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>FTLite</title>
    <style>html,body{margin:0;padding:0;background:#000;overflow:hidden}</style>
  </head>
  <body>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
```

`src/renderer/src/main.ts` (placeholder until Task 20):
```ts
document.body.textContent = 'FTLite';
```

`src/renderer/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

- [ ] **Step 4: Write a smoke test**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { INTERNAL_W, INTERNAL_H, TILE_PX } from '../src/shared/resolution';

describe('scaffold', () => {
  it('exposes the internal resolution and tile size', () => {
    expect(INTERNAL_W).toBe(960);
    expect(INTERNAL_H).toBe(540);
    expect(TILE_PX).toBe(32);
  });
});
```

- [ ] **Step 5: Install and run**

Run: `npm install && npm test && npm run typecheck`
Expected: install succeeds, `1 passed`, typecheck exits 0. Check `node_modules/bitecs/package.json` says `0.4.0` and `node_modules/pixi.js/package.json` says `8.19.0`.

- [ ] **Step 6: Licence check (spec §11 spike)**

Run: `node -e "for (const p of ['bitecs','pixi.js','zod','fast-check','electron','electron-vite','vitest']) console.log(p, require(p+'/package.json').license)"`
Expected: MPL-2.0 (bitecs), MIT for the rest. Record the output in `docs/spikes.md` under a heading `## Licence check (Task 1)`. If any library is not MIT/MPL/BSD/Apache, stop and report.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite project with vitest and shared resolution

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Seeded RNG (mulberry32)

**Files:**
- Create: `src/shared/rng.ts`
- Test: `tests/rng.test.ts`

**Interfaces:**
- Produces: `interface RngState { s: number }`, `createRng(seed: number): RngState`, `nextU32(r: RngState): number`, `nextFloat(r: RngState): number` (in [0,1)), `nextInt(r: RngState, n: number): number` (in [0,n)), `chance(r: RngState, p: number): boolean`.

- [ ] **Step 1: Write the failing test**

`tests/rng.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createRng, nextU32, nextFloat, nextInt, chance } from '../src/shared/rng';

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(12345), b = createRng(12345);
    for (let i = 0; i < 100; i++) expect(nextU32(a)).toBe(nextU32(b));
  });
  it('differs between seeds', () => {
    expect(nextU32(createRng(1))).not.toBe(nextU32(createRng(2)));
  });
  it('matches a known first value for seed 0', () => {
    // Reference value computed once from the mulberry32 algorithm; locks the implementation.
    expect(nextU32(createRng(0))).toBe(1144304738);
  });
  it('nextFloat is in [0,1) and nextInt in [0,n)', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const f = nextFloat(r); expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(1);
      const k = nextInt(r, 9); expect(k).toBeGreaterThanOrEqual(0); expect(k).toBeLessThan(9);
    }
  });
  it('chance(p) is true about p of the time', () => {
    const r = createRng(3); let hits = 0;
    for (let i = 0; i < 10000; i++) if (chance(r, 0.25)) hits++;
    expect(hits).toBeGreaterThan(2300); expect(hits).toBeLessThan(2700);
  });
  it('state is a plain serializable object', () => {
    const r = createRng(9); nextU32(r);
    const copy = JSON.parse(JSON.stringify(r));
    expect(nextU32(copy)).toBe(nextU32(r));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/rng.test.ts`
Expected: FAIL, cannot find module `../src/shared/rng`.

- [ ] **Step 3: Implement**

`src/shared/rng.ts`:
```ts
// mulberry32: tiny 32-bit PRNG with a one-number state, so every stream is trivially serializable.
export interface RngState { s: number }

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

export function nextU32(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

export function nextFloat(r: RngState): number {
  return nextU32(r) / 4294967296;
}

export function nextInt(r: RngState, n: number): number {
  return Math.floor(nextFloat(r) * n);
}

export function chance(r: RngState, p: number): boolean {
  return nextFloat(r) < p;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/rng.test.ts`
Expected: 6 passed. (1144304738 is the standard mulberry32 output for seed 0; if it differs, the implementation above was mistyped.)

- [ ] **Step 5: Commit**

```bash
git add src/shared/rng.ts tests/rng.test.ts
git commit -m "feat(shared): mulberry32 seeded RNG with serializable state

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: State hash and intent types

**Files:**
- Create: `src/shared/hash.ts`, `src/shared/intent.ts`
- Test: `tests/hash.test.ts`, `tests/intent.test.ts`

**Interfaces:**
- Produces: `hashF64(values: Float64Array): string` (8 hex chars, FNV-1a 32 over the little-endian bytes).
- Produces: `type PlayerId = number` (0-3), `MAX_PLAYERS = 4`, `interface Intent { moveX: number; moveY: number; interactHeld: boolean; interactPressed: boolean; confirmPressed: boolean; cancelPressed: boolean }`, `NEUTRAL_INTENT`, `clampIntent(i: Intent): Intent` (NaN → 0, |move| ≤ 1, booleans coerced).

- [ ] **Step 1: Write the failing tests**

`tests/hash.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hashF64 } from '../src/shared/hash';

describe('hashF64', () => {
  it('is stable and 8 hex chars', () => {
    const h = hashF64(new Float64Array([1, 2.5, -3]));
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    expect(hashF64(new Float64Array([1, 2.5, -3]))).toBe(h);
  });
  it('changes when any value changes', () => {
    const a = hashF64(new Float64Array([1, 2, 3]));
    expect(hashF64(new Float64Array([1, 2, 3.0000001]))).not.toBe(a);
    expect(hashF64(new Float64Array([1, 2]))).not.toBe(a);
  });
  it('distinguishes 0 and -0 (canonical state must never contain -0)', () => {
    expect(hashF64(new Float64Array([0]))).not.toBe(hashF64(new Float64Array([-0])));
  });
});
```

`tests/intent.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { clampIntent, NEUTRAL_INTENT } from '../src/shared/intent';

describe('clampIntent', () => {
  it('passes a neutral intent through unchanged', () => {
    expect(clampIntent({ ...NEUTRAL_INTENT })).toEqual(NEUTRAL_INTENT);
  });
  it('zeroes NaN and clamps the move vector to unit length', () => {
    const c = clampIntent({ ...NEUTRAL_INTENT, moveX: NaN, moveY: 5 });
    expect(c.moveX).toBe(0); expect(c.moveY).toBe(1);
    const d = clampIntent({ ...NEUTRAL_INTENT, moveX: 3, moveY: 4 });
    expect(Math.abs(Math.sqrt(d.moveX * d.moveX + d.moveY * d.moveY) - 1)).toBeLessThan(1e-9);
  });
  it('coerces non-boolean flags', () => {
    const c = clampIntent({ ...NEUTRAL_INTENT, interactHeld: 1 as unknown as boolean });
    expect(c.interactHeld).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/hash.test.ts tests/intent.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/shared/hash.ts`:
```ts
// FNV-1a 32-bit over the raw bytes of a Float64Array. All supported platforms are little-endian;
// the byte view is explicit so a big-endian host would be caught by the golden replays, not silently differ.
export function hashF64(values: Float64Array): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
```

`src/shared/intent.ts`:
```ts
export type PlayerId = number; // 0..MAX_PLAYERS-1
export const MAX_PLAYERS = 4;

export interface Intent {
  moveX: number;
  moveY: number;
  interactHeld: boolean;
  interactPressed: boolean;
  confirmPressed: boolean;
  cancelPressed: boolean;
}

export const NEUTRAL_INTENT: Readonly<Intent> = Object.freeze({
  moveX: 0, moveY: 0, interactHeld: false, interactPressed: false, confirmPressed: false, cancelPressed: false
});

function finite(n: number): number { return Number.isFinite(n) ? n : 0; }

/** Malformed input is clamped, never trusted (spec §9). Output never contains NaN or -0. */
export function clampIntent(i: Intent): Intent {
  let x = finite(i.moveX), y = finite(i.moveY);
  const len = Math.sqrt(x * x + y * y);
  if (len > 1) { x /= len; y /= len; }
  if (x === 0) x = 0; if (y === 0) y = 0; // normalise -0 to 0
  return {
    moveX: x, moveY: y,
    interactHeld: !!i.interactHeld, interactPressed: !!i.interactPressed,
    confirmPressed: !!i.confirmPressed, cancelPressed: !!i.cancelPressed
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/hash.test.ts tests/intent.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/shared/hash.ts src/shared/intent.ts tests/hash.test.ts tests/intent.test.ts
git commit -m "feat(shared): FNV-1a state hash and clamped Intent type

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Ship schema, starter fixture, derived tables and reachability

**Files:**
- Create: `src/renderer/src/sim/ship/schema.ts`, `src/renderer/src/sim/ship/reachability.ts`, `src/renderer/src/sim/ship/derived.ts`, `src/renderer/src/sim/ship/starter.json`, `src/renderer/src/sim/tuning.ts`
- Test: `tests/ship.test.ts`

**Interfaces:**
- Produces (schema.ts): `ShipLayout` type (validated), `parseShip(json: unknown): ShipLayout` (throws `Error('Invalid ship: ...')` naming the failing rule).
  ```ts
  interface ShipLayout {
    id: string; version: number; width: number; height: number;
    rows: string[];                       // height strings of width chars: '#' wall, '+' door tile, ' ' void, 'A'..'Z' floor of that room
    rooms: { id: string; name: string; system: string | null }[];   // id is the single char used in rows
    edges: { a: string; b: string; kind: 'door' | 'opening'; tile: [number, number]; width: number }[];
    breachSites: { room: string; tile: [number, number]; width: number }[];
    stations: { id: string; room: string; tile: [number, number] }[];
    spawns: [number, number][];           // crew spawn tiles, at least 4
  }
  ```
- Produces (derived.ts): `Derived`, `deriveLayout(layout: ShipLayout): Derived` with `width`, `height`, `roomIndex: Map<string,number>`, `roomOfTile: Int16Array` (room index or -1), `wallTile: Uint8Array` (1 = '#' or ' '), `doorTileToEdge: Int16Array` (edge index or -1), `volume: Float64Array`, `roomTiles: number[][]` (tile indices per room), `edgeA: Int16Array`, `edgeB: Int16Array` (room index), `edgeWidth: Float64Array`, `edgeIsDoor: Uint8Array`, `edgeTile: Int32Array` (tile index), `siteRoom: Int16Array`, `siteWidth: Float64Array`, `siteTile: Int32Array`, `kEff: number` (set to `O2_K` here, clamped in Task 8), `layoutHash: string`.
- Produces (reachability.ts): `reachableTiles(width, height, from: [number, number], passable: (tx, ty) => boolean): Set<number>`.
- Produces (tuning.ts): `TICK_HZ = 60`, `DT`, `HAZARD_EVERY = 5`, `HAZARD_DT`, `O2_K = 6`, `SIM_VERSION = 1`.

- [ ] **Step 1: Write the starter fixture**

`src/renderer/src/sim/ship/starter.json`:
```json
{
  "id": "starter",
  "version": 1,
  "width": 25,
  "height": 12,
  "rows": [
    "#########################",
    "#AAAA#BBBB#DDDD#FFFF#HHH#",
    "#AAAA#BBBB#DDDD#FFFF#HHH#",
    "#AAAA#BBBB#DDDD#FFFF#HHH#",
    "##+####+####+####+####+##",
    "#IIIIIIIIIIIIIIIIIIIIIII#",
    "#IIIIIIIIIIIIIIIIIIIIIII#",
    "##+######+######+########",
    "#GGGGGG#EEEEEE#CCCCCCCCC#",
    "#GGGGGG#EEEEEE#CCCCCCCCC#",
    "#GGGGGG#EEEEEE#CCCCCCCCC#",
    "#########################"
  ],
  "rooms": [
    { "id": "A", "name": "Bridge", "system": "navigation" },
    { "id": "B", "name": "Weapons Bay", "system": "weapons" },
    { "id": "D", "name": "Science Lab", "system": "science" },
    { "id": "F", "name": "Medbay", "system": "medbay" },
    { "id": "H", "name": "Reactor", "system": "reactor" },
    { "id": "I", "name": "Corridor", "system": null },
    { "id": "G", "name": "Crew Quarters", "system": null },
    { "id": "E", "name": "Life Support", "system": "lifeSupport" },
    { "id": "C", "name": "Engine Room", "system": "engineering" }
  ],
  "edges": [
    { "a": "A", "b": "I", "kind": "door", "tile": [2, 4], "width": 1 },
    { "a": "B", "b": "I", "kind": "door", "tile": [7, 4], "width": 1 },
    { "a": "D", "b": "I", "kind": "door", "tile": [12, 4], "width": 1 },
    { "a": "F", "b": "I", "kind": "door", "tile": [17, 4], "width": 1 },
    { "a": "H", "b": "I", "kind": "door", "tile": [22, 4], "width": 1 },
    { "a": "G", "b": "I", "kind": "door", "tile": [2, 7], "width": 1 },
    { "a": "E", "b": "I", "kind": "door", "tile": [9, 7], "width": 1 },
    { "a": "C", "b": "I", "kind": "door", "tile": [16, 7], "width": 1 }
  ],
  "breachSites": [
    { "room": "A", "tile": [2, 0], "width": 1 },
    { "room": "B", "tile": [7, 0], "width": 1 },
    { "room": "D", "tile": [12, 0], "width": 1 },
    { "room": "F", "tile": [17, 0], "width": 1 },
    { "room": "H", "tile": [22, 0], "width": 1 },
    { "room": "I", "tile": [0, 5], "width": 1 },
    { "room": "G", "tile": [2, 11], "width": 1 },
    { "room": "E", "tile": [10, 11], "width": 1 },
    { "room": "C", "tile": [18, 11], "width": 1 }
  ],
  "stations": [
    { "id": "navigation", "room": "A", "tile": [2, 2] },
    { "id": "doors", "room": "A", "tile": [3, 1] },
    { "id": "weapons", "room": "B", "tile": [7, 2] },
    { "id": "science", "room": "D", "tile": [12, 2] },
    { "id": "medbay", "room": "F", "tile": [17, 2] },
    { "id": "lifeSupport", "room": "E", "tile": [10, 9] },
    { "id": "engineering", "room": "C", "tile": [18, 9] }
  ],
  "spawns": [[2, 9], [3, 9], [4, 9], [5, 9]]
}
```

- [ ] **Step 2: Write the failing tests**

`tests/ship.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';

function clone(): typeof starter { return JSON.parse(JSON.stringify(starter)); }

describe('ship schema', () => {
  it('accepts the starter ship', () => {
    const ship = parseShip(starter);
    expect(ship.rooms).toHaveLength(9);
    expect(ship.edges).toHaveLength(8);
  });
  it('rejects a row of the wrong width', () => {
    const s = clone(); s.rows[1] = '#AAAA#';
    expect(() => parseShip(s)).toThrow(/width/);
  });
  it('rejects an unknown room char in rows', () => {
    const s = clone(); s.rows[1] = '#AAAA#BBBB#DDDD#FFFF#ZZZ#';
    expect(() => parseShip(s)).toThrow(/room/);
  });
  it('rejects a room listed but never drawn (stray room)', () => {
    const s = clone(); s.rooms.push({ id: 'Z', name: 'Ghost', system: null });
    expect(() => parseShip(s)).toThrow(/Z/);
  });
  it('rejects a door tile that does not touch both rooms', () => {
    const s = clone(); s.edges[0]!.tile = [12, 4];
    expect(() => parseShip(s)).toThrow(/edge/);
  });
  it('rejects a disconnected room graph', () => {
    const s = clone(); s.edges = s.edges.filter((e) => e.a !== 'H');
    s.rows[4] = '##+####+####+####+#######';
    expect(() => parseShip(s)).toThrow(/connected/);
  });
  it('rejects duplicate stations and duplicate edge tiles', () => {
    const s = clone(); s.stations.push({ ...s.stations[0]! });
    expect(() => parseShip(s)).toThrow(/duplicate station/);
    const t = clone(); t.edges.push({ ...t.edges[0]! });
    expect(() => parseShip(t)).toThrow(/two edges/);
  });
  it('rejects a breach site that is not a wall adjacent to its room', () => {
    const s = clone(); s.breachSites[0]!.tile = [2, 2];
    expect(() => parseShip(s)).toThrow(/breach/);
  });
  it('rejects unreachable stations (crew-sized BFS)', () => {
    const s = clone(); s.rows[7] = '#########+######+########';
    s.edges = s.edges.filter((e) => e.a !== 'G');
    expect(() => parseShip(s)).toThrow(/reach|connected/);
  });
});

describe('derived tables', () => {
  it('maps tiles to rooms and computes volumes', () => {
    const d = deriveLayout(parseShip(starter));
    const idx = (c: string) => d.roomIndex.get(c)!;
    expect(d.volume[idx('A')]).toBe(12);
    expect(d.volume[idx('I')]).toBe(46);
    expect(d.volume[idx('C')]).toBe(27);
    expect(d.roomOfTile[5 * 25 + 1]).toBe(idx('I'));
    expect(d.roomOfTile[0]).toBe(-1);
    expect(d.wallTile[0]).toBe(1);
    expect(d.doorTileToEdge[4 * 25 + 2]).toBe(0);
    expect(d.edgeA[0]).toBe(idx('A')); expect(d.edgeB[0]).toBe(idx('I'));
    expect(d.siteRoom[5]).toBe(idx('I'));
    expect(d.siteTile[5]).toBe(5 * 25 + 0);
    expect(d.layoutHash).toMatch(/^[0-9a-f]{8}$/);
  });
  it('layout hash changes when rooms are reordered; id hash changes with the id', () => {
    const a = deriveLayout(parseShip(starter));
    const s = JSON.parse(JSON.stringify(starter)) as typeof starter;
    s.rooms.reverse();
    const b = deriveLayout(parseShip(s));
    expect(b.layoutHash).not.toBe(a.layoutHash);
    const t = clone(); t.id = 'other';
    expect(deriveLayout(parseShip(t)).idHash).not.toBe(a.idHash);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run tests/ship.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement tuning and reachability**

`src/renderer/src/sim/tuning.ts` (first version; later tasks append to it):
```ts
// Every gameplay constant. All are hypotheses until playtested (spec §13).
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
export const HAZARD_EVERY = 5;                 // hazards run every 5th tick (12 Hz)
export const HAZARD_DT = DT * HAZARD_EVERY;
export const O2_K = 6;                         // oxygen diffusion rate (per second, per unit conductance)
export const SIM_VERSION = 1;
```

`src/renderer/src/sim/ship/reachability.ts`:
```ts
/** 4-neighbour BFS over tiles where `passable` is true, starting at `from`. Returns tile indices (ty*width+tx). */
export function reachableTiles(
  width: number, height: number, from: [number, number], passable: (tx: number, ty: number) => boolean
): Set<number> {
  const seen = new Set<number>();
  const queue: number[] = [];
  const push = (tx: number, ty: number): void => {
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return;
    const i = ty * width + tx;
    if (seen.has(i) || !passable(tx, ty)) return;
    seen.add(i); queue.push(i);
  };
  push(from[0], from[1]);
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!, tx = i % width, ty = (i - tx) / width;
    push(tx + 1, ty); push(tx - 1, ty); push(tx, ty + 1); push(tx, ty - 1);
  }
  return seen;
}
```

- [ ] **Step 5: Implement the schema**

`src/renderer/src/sim/ship/schema.ts`:
```ts
import { z } from 'zod';
import { reachableTiles } from './reachability';

const tile = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

const shipSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
  width: z.number().int().min(3),
  height: z.number().int().min(3),
  rows: z.array(z.string()),
  rooms: z.array(z.object({ id: z.string().length(1), name: z.string().min(1), system: z.string().nullable() })),
  edges: z.array(z.object({
    a: z.string().length(1), b: z.string().length(1), kind: z.enum(['door', 'opening']), tile, width: z.number().positive()
  })),
  breachSites: z.array(z.object({ room: z.string().length(1), tile, width: z.number().positive() })),
  stations: z.array(z.object({ id: z.string().min(1), room: z.string().length(1), tile })),
  spawns: z.array(tile).min(4)
}).superRefine((s, ctx) => {
  const fail = (message: string): void => { ctx.addIssue({ code: z.ZodIssueCode.custom, message }); };
  if (s.rows.length !== s.height) return fail(`rows: expected ${s.height} rows (height)`);
  for (let y = 0; y < s.height; y++) if (s.rows[y]!.length !== s.width) return fail(`rows[${y}]: expected width ${s.width}`);
  const roomIds = new Set(s.rooms.map((r) => r.id));
  if (roomIds.size !== s.rooms.length) return fail('rooms: duplicate room id');
  if (new Set(s.stations.map((st) => st.id)).size !== s.stations.length) return fail('stations: duplicate station id');
  if (new Set(s.stations.map((st) => `${st.tile[0]},${st.tile[1]}`)).size !== s.stations.length) return fail('stations: two stations on one tile');
  if (new Set(s.edges.map((e) => `${e.tile[0]},${e.tile[1]}`)).size !== s.edges.length) return fail('edge: two edges on one tile');
  if (new Set(s.breachSites.map((b) => `${b.tile[0]},${b.tile[1]}`)).size !== s.breachSites.length) return fail('breach site: two sites on one tile');
  const at = (tx: number, ty: number): string => (tx < 0 || ty < 0 || tx >= s.width || ty >= s.height) ? '#' : s.rows[ty]!.charAt(tx);
  const drawn = new Set<string>();
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
    const c = at(x, y);
    if (c === '#' || c === '+' || c === ' ') continue;
    if (!roomIds.has(c)) return fail(`rows: unknown room char '${c}' at ${x},${y}`);
    drawn.add(c);
  }
  for (const id of roomIds) if (!drawn.has(id)) return fail(`rooms: room ${id} is never drawn in rows (stray room)`);
  const neighbours = (tx: number, ty: number): string[] => [at(tx + 1, ty), at(tx - 1, ty), at(tx, ty + 1), at(tx, ty - 1)];
  const adjacency = new Map<string, Set<string>>();
  for (const id of roomIds) adjacency.set(id, new Set());
  for (let i = 0; i < s.edges.length; i++) {
    const e = s.edges[i]!;
    if (!roomIds.has(e.a) || !roomIds.has(e.b)) return fail(`edge ${i}: unknown room`);
    const [tx, ty] = e.tile;
    if (e.kind === 'door' && at(tx, ty) !== '+') return fail(`edge ${i}: door tile must be '+'`);
    const n = neighbours(tx, ty);
    if (!n.includes(e.a) || !n.includes(e.b)) return fail(`edge ${i}: tile does not touch both rooms ${e.a} and ${e.b}`);
    adjacency.get(e.a)!.add(e.b); adjacency.get(e.b)!.add(e.a);
  }
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
    if (at(x, y) === '+' && !s.edges.some((e) => e.tile[0] === x && e.tile[1] === y)) return fail(`edge: '+' at ${x},${y} has no edge entry`);
  }
  const first = s.rooms[0]!.id, seen = new Set([first]), stack = [first];
  while (stack.length) for (const nb of adjacency.get(stack.pop()!)!) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
  if (seen.size !== roomIds.size) return fail('rooms: room graph is not connected');
  for (let i = 0; i < s.breachSites.length; i++) {
    const b = s.breachSites[i]!;
    if (!roomIds.has(b.room)) return fail(`breach site ${i}: unknown room`);
    if (at(b.tile[0], b.tile[1]) !== '#' || !neighbours(b.tile[0], b.tile[1]).includes(b.room)) return fail(`breach site ${i}: must be a wall tile adjacent to room ${b.room}`);
  }
  for (let i = 0; i < s.stations.length; i++) {
    const st = s.stations[i]!;
    if (at(st.tile[0], st.tile[1]) !== st.room) return fail(`station ${i}: tile is not in room ${st.room}`);
  }
  // Crew-sized reachability: CREW_HALF (0.3 tiles, Task 6) is under half a tile, so 4-neighbour BFS over floor and door tiles is exact.
  const passable = (tx: number, ty: number): boolean => { const c = at(tx, ty); return c !== '#' && c !== ' '; };
  for (const sp of s.spawns) {
    if (!passable(sp[0], sp[1])) return fail(`spawn ${sp} is not a floor tile`);
    const reach = reachableTiles(s.width, s.height, sp, passable);
    for (const st of s.stations) if (!reach.has(st.tile[1] * s.width + st.tile[0])) return fail(`station ${st.id} is not reachable from spawn ${sp}`);
    for (const e of s.edges) if (!reach.has(e.tile[1] * s.width + e.tile[0])) return fail(`edge at ${e.tile} is not reachable from spawn ${sp}`);
  }
});

export type ShipLayout = z.infer<typeof shipSchema>;

export function parseShip(json: unknown): ShipLayout {
  const r = shipSchema.safeParse(json);
  if (!r.success) throw new Error('Invalid ship: ' + r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}
```

- [ ] **Step 6: Implement derived tables**

`src/renderer/src/sim/ship/derived.ts`:
```ts
import type { ShipLayout } from './schema';
import { hashF64 } from '../../../../shared/hash';
import { O2_K } from '../tuning';

export interface Derived {
  width: number; height: number;
  roomIndex: Map<string, number>;
  roomOfTile: Int16Array;
  wallTile: Uint8Array;
  doorTileToEdge: Int16Array;
  volume: Float64Array;
  roomTiles: number[][];
  edgeA: Int16Array; edgeB: Int16Array; edgeWidth: Float64Array; edgeIsDoor: Uint8Array; edgeTile: Int32Array;
  siteRoom: Int16Array; siteWidth: Float64Array; siteTile: Int32Array;
  kEff: number;
  layoutHash: string;   // content hash: rows, room order, edges, sites, stations, spawns
  idHash: string;       // hash of layout.id
}

export function deriveLayout(layout: ShipLayout): Derived {
  const { width, height } = layout;
  const roomIndex = new Map<string, number>();
  layout.rooms.forEach((r, i) => roomIndex.set(r.id, i));
  const n = width * height;
  const roomOfTile = new Int16Array(n).fill(-1);
  const wallTile = new Uint8Array(n);
  const doorTileToEdge = new Int16Array(n).fill(-1);
  const volume = new Float64Array(layout.rooms.length);
  const roomTiles: number[][] = layout.rooms.map(() => []);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const c = layout.rows[y]!.charAt(x), i = y * width + x;
    if (c === '#' || c === ' ') { wallTile[i] = 1; continue; }
    if (c === '+') continue;
    const r = roomIndex.get(c)!;
    roomOfTile[i] = r; volume[r]! += 1; roomTiles[r]!.push(i);
  }
  const E = layout.edges.length;
  const edgeA = new Int16Array(E), edgeB = new Int16Array(E), edgeWidth = new Float64Array(E), edgeIsDoor = new Uint8Array(E), edgeTile = new Int32Array(E);
  layout.edges.forEach((e, i) => {
    edgeA[i] = roomIndex.get(e.a)!; edgeB[i] = roomIndex.get(e.b)!;
    edgeWidth[i] = e.width; edgeIsDoor[i] = e.kind === 'door' ? 1 : 0;
    edgeTile[i] = e.tile[1] * width + e.tile[0];
    if (e.kind === 'door') doorTileToEdge[edgeTile[i]!] = i;
  });
  const S = layout.breachSites.length;
  const siteRoom = new Int16Array(S), siteWidth = new Float64Array(S), siteTile = new Int32Array(S);
  layout.breachSites.forEach((b, i) => { siteRoom[i] = roomIndex.get(b.room)!; siteWidth[i] = b.width; siteTile[i] = b.tile[1] * width + b.tile[0]; });
  // Layout identity covers everything the derived tables depend on: row text, room order, edge endpoints,
  // site rooms, stations and spawns. Reordering rooms must change the hash (snapshots index rooms by position).
  const codes: number[] = [width, height, layout.rooms.length, E, S, layout.stations.length, layout.spawns.length];
  for (const row of layout.rows) for (let i = 0; i < row.length; i++) codes.push(row.charCodeAt(i));
  for (const r of layout.rooms) codes.push(r.id.charCodeAt(0));
  for (let i = 0; i < E; i++) codes.push(edgeA[i]!, edgeB[i]!, edgeTile[i]!, edgeWidth[i]!, edgeIsDoor[i]!);
  for (let i = 0; i < S; i++) codes.push(siteRoom[i]!, siteTile[i]!, siteWidth[i]!);
  for (const st of layout.stations) codes.push(roomIndex.get(st.room)!, st.tile[1] * width + st.tile[0]);
  for (const sp of layout.spawns) codes.push(sp[1] * width + sp[0]);
  const idCodes: number[] = []; for (let i = 0; i < layout.id.length; i++) idCodes.push(layout.id.charCodeAt(i));
  return {
    width, height, roomIndex, roomOfTile, wallTile, doorTileToEdge, volume, roomTiles,
    edgeA, edgeB, edgeWidth, edgeIsDoor, edgeTile, siteRoom, siteWidth, siteTile,
    kEff: O2_K,
    layoutHash: hashF64(Float64Array.from(codes)),
    idHash: hashF64(Float64Array.from(idCodes))
  };
}
```

Format note (spec §5 says `defaultOpen` and `"space"` edges): this plan drops both. Every door starts Closed (it opens on approach), and the only edges to space are breaches, which use `breachSites`. Record this in `docs/spikes.md` under "Ship format decisions" when the file is created in Task 1.

- [ ] **Step 7: Run to verify they pass**

Run: `npx vitest run tests/ship.test.ts`
Expected: 11 passed.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/sim tests/ship.test.ts
git commit -m "feat(sim): ship schema with graph/reachability validation, starter ship, derived tables

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: SimState, components, step skeleton, hashState and the boundary test

**Files:**
- Create: `src/renderer/src/sim/components.ts`, `src/renderer/src/sim/state.ts`, `src/renderer/src/sim/step.ts`, `src/renderer/src/sim/flatten.ts`, `src/renderer/src/sim/hash.ts`
- Modify: `src/renderer/src/sim/tuning.ts`
- Test: `tests/state.test.ts`, `tests/boundary.test.ts`

**Interfaces:**
- Produces (components.ts): SoA components `Position {x,y}`, `Health {cur}`, `Life {state, bleed, reviveProgress, reviverPid}`, `Stable {id}`, `Owner {pid}`; `LifeState = { Conscious: 0, Downed: 1, Dead: 2 }`.
- Produces (state.ts):
  ```ts
  interface RngStreams { hazards: RngState; director: RngState; combat: RngState; loot: RngState; cosmetic: RngState }
  const STREAM_NAMES = ['hazards','director','combat','loot','cosmetic'] as const;
  interface SimState {
    tick: number; rng: RngStreams; nextStableId: number;
    layout: ShipLayout; derived: Derived;                  // immutable, rebuilt on load, never snapshotted
    playerCount: number; world: World; crew: number[];     // crew[pid] = entity id
    hull: number; ended: number; endReason: number;        // endReason 0 none, 1 hull, 2 crew
    rooms: { o2: Float64Array; fire: Float64Array; fireRepair: Float64Array };
    doors: { state: Uint8Array; closeTimer: Float64Array; sealRequested: Uint8Array };   // per edge
    breaches: { active: Uint8Array; repair: Float64Array };                              // per breach site
    o2Counters: { injected: number; breathed: number; burned: number; vented: number; residual: number };
    spawner: { nextSpawnTick: number };
  }
  createSimState(layout: ShipLayout, playerCount: number, seed: number): SimState
  deriveStreams(seed: number): RngStreams
  ```
- Produces (step.ts): `step(state: SimState, intents: readonly Intent[]): void` (indexed by `PlayerId`; missing entries neutral), `intentFor(intents, pid): Intent`.
- Produces (flatten.ts): `flatten(state): Float64Array`, `unflatten(state, values: Float64Array): void`, `FLATTEN_MANIFEST: string[]`.
- Produces (hash.ts): `hashState(state): string`.
- Produces (tuning.ts): `HULL_MAX = 100`, `HEALTH_MAX = 100`.

- [ ] **Step 1: Write the failing tests**

`tests/state.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState } from '../src/renderer/src/sim/state';
import { step } from '../src/renderer/src/sim/step';
import { hashState } from '../src/renderer/src/sim/hash';
import { flatten, unflatten } from '../src/renderer/src/sim/flatten';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { Position, Stable } from '../src/renderer/src/sim/components';

const layout = parseShip(starter);

describe('SimState', () => {
  it('spawns one crew per player at the spawn tiles with StableIds 1..n', () => {
    const s = createSimState(layout, 3, 1);
    expect(s.crew).toHaveLength(3);
    expect(Position.x[s.crew[0]!]).toBe(2.5); expect(Position.y[s.crew[0]!]).toBe(9.5);
    expect(Stable.id[s.crew[0]!]).toBe(1); expect(Stable.id[s.crew[2]!]).toBe(3);
    expect(s.nextStableId).toBe(4);
  });
  it('starts rooms full of oxygen, no fire, doors closed, no breaches', () => {
    const s = createSimState(layout, 2, 1);
    for (let r = 0; r < s.rooms.o2.length; r++) expect(s.rooms.o2[r]).toBe(s.derived.volume[r]);
    expect(Array.from(s.rooms.fire).every((f) => f === 0)).toBe(true);
    expect(Array.from(s.breaches.active).every((b) => b === 0)).toBe(true);
  });
  it('step advances the tick and is deterministic', () => {
    const a = createSimState(layout, 2, 42), b = createSimState(layout, 2, 42);
    for (let i = 0; i < 100; i++) { step(a, [NEUTRAL_INTENT, NEUTRAL_INTENT]); step(b, [NEUTRAL_INTENT, NEUTRAL_INTENT]); }
    expect(a.tick).toBe(100);
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(a)).not.toBe(hashState(createSimState(layout, 2, 42)));
  });
  it('different seeds give different rng streams and hashes', () => {
    const a = createSimState(layout, 2, 1), b = createSimState(layout, 2, 2);
    expect(a.rng.hazards.s).not.toBe(b.rng.hazards.s);
    expect(a.rng.hazards.s).not.toBe(a.rng.director.s);
    expect(hashState(a)).not.toBe(hashState(b));
  });
  it('two live states are independent (component storage is not shared between worlds)', () => {
    const a = createSimState(layout, 2, 1), b = createSimState(layout, 2, 1);
    const ax = Position.x[a.crew[0]!]!;
    step(b, [{ ...NEUTRAL_INTENT, moveX: 1 }, NEUTRAL_INTENT]);
    expect(Position.x[a.crew[0]!]).toBe(ax);
    expect(a.crew[0]).not.toBe(b.crew[0]);
  });
  it('flatten/unflatten round-trips', () => {
    const a = createSimState(layout, 4, 5);
    for (let i = 0; i < 30; i++) step(a, [{ ...NEUTRAL_INTENT, moveX: 1 }, NEUTRAL_INTENT, NEUTRAL_INTENT, NEUTRAL_INTENT]);
    const b = createSimState(layout, 4, 999);
    unflatten(b, flatten(a));
    expect(hashState(b)).toBe(hashState(a));
    expect(b.tick).toBe(a.tick);
  });
});
```

`tests/boundary.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const pureDirs = ['src/renderer/src/sim', 'src/shared'];
const bannedImports = [/from\s+['"]pixi\.js/, /from\s+['"]electron/, /from\s+['"][^'"]*\/render\//, /from\s+['"][^'"]*\/input\//, /from\s+['"][^'"]*\/app\//];
const bannedCalls = [/Math\.random/, /\bDate\b/, /performance\.now/, /Math\.(sin|cos|atan2|pow|hypot)\b/, /\bdocument\b/, /\bwindow\b/];

describe('sim/ and shared/ are pure', () => {
  for (const dir of pureDirs) for (const file of walk(dir)) {
    it(`${file} has no banned imports or calls`, () => {
      const src = readFileSync(file, 'utf8');
      for (const re of bannedImports) expect(src).not.toMatch(re);
      for (const re of bannedCalls) expect(src).not.toMatch(re);
    });
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/state.test.ts tests/boundary.test.ts`
Expected: state tests FAIL (modules not found); boundary tests PASS for the files that exist.

- [ ] **Step 3: Implement components and tuning additions**

`src/renderer/src/sim/components.ts`:
```ts
// bitECS 0.4 SoA components. Arrays are indexed by entity id; the sim owns them and flatten.ts serializes them.
export const Position = { x: [] as number[], y: [] as number[] };
export const Health = { cur: [] as number[] };
export const LifeState = { Conscious: 0, Downed: 1, Dead: 2 } as const;
export const Life = {
  state: [] as number[],          // LifeState
  bleed: [] as number[],          // seconds left while Downed
  reviveProgress: [] as number[], // 0..1
  reviverPid: [] as number[]      // PlayerId currently reviving this crew, or -1
};
export const Stable = { id: [] as number[] };
export const Owner = { pid: [] as number[] };
```

Append to `src/renderer/src/sim/tuning.ts`:
```ts
export const HULL_MAX = 100;
export const HEALTH_MAX = 100;
```

- [ ] **Step 4: Implement state**

`src/renderer/src/sim/state.ts`:
```ts
import { createWorld, createEntityIndex, addEntity, addComponent } from 'bitecs';
import type { World } from 'bitecs';
import { createRng, nextU32, type RngState } from '../../../shared/rng';
import type { ShipLayout } from './ship/schema';
import { deriveLayout, type Derived } from './ship/derived';
import { Position, Health, Life, LifeState, Stable, Owner } from './components';
import { HULL_MAX, HEALTH_MAX } from './tuning';

export interface RngStreams { hazards: RngState; director: RngState; combat: RngState; loot: RngState; cosmetic: RngState }
export const STREAM_NAMES = ['hazards', 'director', 'combat', 'loot', 'cosmetic'] as const;

export interface SimState {
  tick: number;
  rng: RngStreams;
  nextStableId: number;
  layout: ShipLayout;
  derived: Derived;
  playerCount: number;
  world: World;
  crew: number[];
  hull: number;
  ended: number;
  endReason: number;
  rooms: { o2: Float64Array; fire: Float64Array; fireRepair: Float64Array };
  doors: { state: Uint8Array; closeTimer: Float64Array; sealRequested: Uint8Array };
  breaches: { active: Uint8Array; repair: Float64Array };
  o2Counters: { injected: number; breathed: number; burned: number; vented: number; residual: number };
  spawner: { nextSpawnTick: number };
}

export function deriveStreams(seed: number): RngStreams {
  const master = createRng(seed);
  const out = {} as RngStreams;
  for (const name of STREAM_NAMES) out[name] = createRng(nextU32(master));
  return out;
}

// One entity index shared by every world this process creates. Components are module-level SoA arrays
// indexed by entity id, so two live states (tests compare runs; snapshot load creates a second state) must
// never share an id. A shared index hands out disjoint ids across worlds. Non-versioned: bitECS 0.4.0's
// withVersioning() misbehaves under recycling (docs/spikes.md).
const SHARED_ENTITY_INDEX = createEntityIndex();

export function createSimState(layout: ShipLayout, playerCount: number, seed: number): SimState {
  const derived = deriveLayout(layout);
  const world = createWorld(SHARED_ENTITY_INDEX);
  const R = derived.volume.length, E = layout.edges.length, S = layout.breachSites.length;
  const state: SimState = {
    tick: 0, rng: deriveStreams(seed), nextStableId: 1, layout, derived, playerCount, world, crew: [],
    hull: HULL_MAX, ended: 0, endReason: 0,
    rooms: { o2: Float64Array.from(derived.volume), fire: new Float64Array(R), fireRepair: new Float64Array(R) },
    doors: { state: new Uint8Array(E), closeTimer: new Float64Array(E), sealRequested: new Uint8Array(E) },
    breaches: { active: new Uint8Array(S), repair: new Float64Array(S) },
    o2Counters: { injected: 0, breathed: 0, burned: 0, vented: 0, residual: 0 },
    spawner: { nextSpawnTick: 0 }
  };
  for (let pid = 0; pid < playerCount; pid++) state.crew.push(spawnCrew(state, pid));
  return state;
}

function spawnCrew(state: SimState, pid: number): number {
  const eid = addEntity(state.world);
  const sp = state.layout.spawns[pid]!;
  addComponent(state.world, eid, Position); Position.x[eid] = sp[0] + 0.5; Position.y[eid] = sp[1] + 0.5;
  addComponent(state.world, eid, Health); Health.cur[eid] = HEALTH_MAX;
  addComponent(state.world, eid, Life); Life.state[eid] = LifeState.Conscious; Life.bleed[eid] = 0; Life.reviveProgress[eid] = 0; Life.reviverPid[eid] = -1;
  addComponent(state.world, eid, Stable); Stable.id[eid] = state.nextStableId++;
  addComponent(state.world, eid, Owner); Owner.pid[eid] = pid;
  return eid;
}
```

- [ ] **Step 5: Implement flatten, hash and the step skeleton**

`src/renderer/src/sim/flatten.ts`:
```ts
import type { SimState } from './state';
import { STREAM_NAMES } from './state';
import { Position, Health, Life, Stable } from './components';
import { SIM_VERSION } from './tuning';

export const FLATTEN_MANIFEST = ['header', 'rng', 'rooms', 'doors', 'breaches', 'o2Counters', 'spawner', 'crew'];
const HEADER_FIELDS = 10, COUNTER_FIELDS = 5, SPAWNER_FIELDS = 1, CREW_FIELDS = 8;

/** Ship identity (id hash + content hash) and sim version as numbers, so they are part of the canonical state (spec §4). */
export function layoutHashNumber(s: SimState): number { return parseInt(s.derived.layoutHash, 16); }
export function layoutIdNumber(s: SimState): number { return parseInt(s.derived.idHash, 16); }

function size(s: SimState): number {
  return HEADER_FIELDS + STREAM_NAMES.length + s.rooms.o2.length * 3 + s.doors.state.length * 3
    + s.breaches.active.length * 2 + COUNTER_FIELDS + SPAWNER_FIELDS + s.crew.length * CREW_FIELDS;
}

/** Canonical order. Crew by PlayerId (their StableIds were allocated in that order). -0 is written as 0. */
export function flatten(s: SimState): Float64Array {
  const out = new Float64Array(size(s));
  let i = 0;
  const put = (v: number): void => { out[i++] = v === 0 ? 0 : v; };
  put(SIM_VERSION); put(layoutIdNumber(s)); put(layoutHashNumber(s)); put(s.tick); put(s.nextStableId); put(s.playerCount); put(s.hull); put(s.ended); put(s.endReason); put(s.crew.length);
  for (const n of STREAM_NAMES) put(s.rng[n].s);
  for (const v of s.rooms.o2) put(v); for (const v of s.rooms.fire) put(v); for (const v of s.rooms.fireRepair) put(v);
  for (const v of s.doors.state) put(v); for (const v of s.doors.closeTimer) put(v); for (const v of s.doors.sealRequested) put(v);
  for (const v of s.breaches.active) put(v); for (const v of s.breaches.repair) put(v);
  const c = s.o2Counters; put(c.injected); put(c.breathed); put(c.burned); put(c.vented); put(c.residual);
  put(s.spawner.nextSpawnTick);
  for (const eid of s.crew) {
    put(Stable.id[eid]!); put(Position.x[eid]!); put(Position.y[eid]!); put(Health.cur[eid]!);
    put(Life.state[eid]!); put(Life.bleed[eid]!); put(Life.reviveProgress[eid]!); put(Life.reviverPid[eid]!);
  }
  if (i !== out.length) throw new Error(`flatten size mismatch ${i} vs ${out.length}`);
  return out;
}

/** Inverse of flatten into a state created for the same layout and playerCount. */
export function unflatten(s: SimState, v: Float64Array): void {
  let i = 0;
  const get = (): number => v[i++]!;
  const ver = get(), idh = get(), lh = get();
  if (ver !== SIM_VERSION) throw new Error(`snapshot sim version ${ver} does not match ${SIM_VERSION}`);
  if (idh !== layoutIdNumber(s) || lh !== layoutHashNumber(s)) throw new Error('snapshot layout does not match the loaded layout');
  s.tick = get(); s.nextStableId = get(); s.playerCount = get(); s.hull = get(); s.ended = get(); s.endReason = get();
  const crewCount = get();
  if (crewCount !== s.crew.length) throw new Error(`snapshot crew count ${crewCount} does not match state ${s.crew.length}`);
  for (const n of STREAM_NAMES) s.rng[n].s = get();
  for (let r = 0; r < s.rooms.o2.length; r++) s.rooms.o2[r] = get();
  for (let r = 0; r < s.rooms.fire.length; r++) s.rooms.fire[r] = get();
  for (let r = 0; r < s.rooms.fireRepair.length; r++) s.rooms.fireRepair[r] = get();
  for (let d = 0; d < s.doors.state.length; d++) s.doors.state[d] = get();
  for (let d = 0; d < s.doors.closeTimer.length; d++) s.doors.closeTimer[d] = get();
  for (let d = 0; d < s.doors.sealRequested.length; d++) s.doors.sealRequested[d] = get();
  for (let b = 0; b < s.breaches.active.length; b++) s.breaches.active[b] = get();
  for (let b = 0; b < s.breaches.repair.length; b++) s.breaches.repair[b] = get();
  s.o2Counters.injected = get(); s.o2Counters.breathed = get(); s.o2Counters.burned = get(); s.o2Counters.vented = get(); s.o2Counters.residual = get();
  s.spawner.nextSpawnTick = get();
  for (const eid of s.crew) {
    Stable.id[eid] = get(); Position.x[eid] = get(); Position.y[eid] = get(); Health.cur[eid] = get();
    Life.state[eid] = get(); Life.bleed[eid] = get(); Life.reviveProgress[eid] = get(); Life.reviverPid[eid] = get();
  }
  if (i !== v.length) throw new Error(`snapshot length ${v.length} does not match expected ${i}`);
}
```

`src/renderer/src/sim/hash.ts`:
```ts
import { hashF64 } from '../../../shared/hash';
import { flatten } from './flatten';
import type { SimState } from './state';

export function hashState(s: SimState): string {
  return hashF64(flatten(s));
}
```

`src/renderer/src/sim/step.ts` (skeleton; later tasks fill the systems in this exact order):
```ts
import type { Intent } from '../../../shared/intent';
import { NEUTRAL_INTENT, clampIntent } from '../../../shared/intent';
import type { SimState } from './state';
import { HAZARD_EVERY } from './tuning';

export function intentFor(intents: readonly Intent[], pid: number): Intent {
  return clampIntent(intents[pid] ?? NEUTRAL_INTENT);
}

/** One fixed 60 Hz tick in the spec's system order (§4 rule 4a). */
export function step(state: SimState, intents: readonly Intent[]): void {
  if (state.ended) return;
  const hazardTick = state.tick % HAZARD_EVERY === 0;
  // (1) input, arbitration, movement, doors        -> Tasks 6, 7, 12
  // (2) power                                       -> increment 2a
  // (3) stations                                    -> increment 2a
  // (4) hazards on the hazard tick                  -> Tasks 8, 9, 10
  void hazardTick;
  // (5) debris                                      -> increment 2a
  // (6) director (stub spawner)                     -> Task 13
  // (7) crew lifecycle, run end                     -> Task 11
  void intentFor;
  state.tick++;
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run tests/state.test.ts tests/boundary.test.ts`
Expected: all pass (the flatten round-trip test passes even though movement is not implemented yet).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/sim tests/state.test.ts tests/boundary.test.ts
git commit -m "feat(sim): SimState with bitECS crew, canonical flatten/hash, step skeleton, purity boundary test

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Grid queries and per-axis crew movement

**Files:**
- Create: `src/renderer/src/sim/grid.ts`, `src/renderer/src/sim/movement.ts`, `tests/helpers/sim.ts`
- Modify: `src/renderer/src/sim/tuning.ts`, `src/renderer/src/sim/step.ts`
- Test: `tests/movement.test.ts`

**Interfaces:**
- Produces (grid.ts): `DoorState = { Closed: 0, Open: 1, Sealed: 2 }`, `solidAt(state, tx, ty): boolean` (out of bounds and walls solid; a door tile is solid unless `Open`), `roomAt(state, x, y): number` (room index or -1 for walls/doors/outside), `tileIndex(state, x, y): number`.
- Produces (movement.ts): `moveAABB(solid: (tx, ty) => boolean, x, y, dx, dy, half): { x: number; y: number }` (pure, per-axis, wall sliding), `movementSystem(state, intents): void`.
- Produces (tuning.ts): `CREW_SPEED = 4` (tiles/s), `CREW_HALF = 0.3` (tiles), `MOVE_EPS = 1e-6`.
- Produces (tests/helpers/sim.ts): `makeState(players = 2, seed = 1): SimState`, `intents(...per: Partial<Intent>[]): Intent[]`, `run(state, ticks, perTick: (tick) => Intent[]): void`, `teleport(state, pid, x, y): void`, `seconds(n): number` (ticks).

- [ ] **Step 1: Write the test helper**

`tests/helpers/sim.ts`:
```ts
import starter from '../../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { createSimState, type SimState } from '../../src/renderer/src/sim/state';
import { step } from '../../src/renderer/src/sim/step';
import { Position } from '../../src/renderer/src/sim/components';
import { NEUTRAL_INTENT, type Intent } from '../../src/shared/intent';
import { TICK_HZ } from '../../src/renderer/src/sim/tuning';

export const LAYOUT = parseShip(starter);

export function makeState(players = 2, seed = 1): SimState {
  return createSimState(LAYOUT, players, seed);
}

export function intents(...per: Partial<Intent>[]): Intent[] {
  return per.map((p) => ({ ...NEUTRAL_INTENT, ...p }));
}

export function run(state: SimState, ticks: number, perTick: (tick: number) => Intent[] = () => []): void {
  for (let i = 0; i < ticks; i++) step(state, perTick(state.tick));
}

export function teleport(state: SimState, pid: number, x: number, y: number): void {
  const eid = state.crew[pid]!;
  Position.x[eid] = x; Position.y[eid] = y;
}

export function seconds(n: number): number { return Math.round(n * TICK_HZ); }

export function room(state: SimState, id: string): number { return state.derived.roomIndex.get(id)!; }
```

- [ ] **Step 2: Write the failing tests**

`tests/movement.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { moveAABB } from '../src/renderer/src/sim/movement';
import { solidAt, roomAt } from '../src/renderer/src/sim/grid';
import { Position, Life, LifeState } from '../src/renderer/src/sim/components';
import { CREW_SPEED, DT, CREW_HALF } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, teleport, room } from './helpers/sim';

const wallsOutside = (tx: number, ty: number): boolean => tx < 0 || ty < 0 || tx >= 10 || ty >= 10;

describe('moveAABB', () => {
  it('moves freely in open space', () => {
    const p = moveAABB(wallsOutside, 5, 5, 0.1, -0.2, 0.3);
    expect(p.x).toBeCloseTo(5.1); expect(p.y).toBeCloseTo(4.8);
  });
  it('stops at a wall and snaps flush to it', () => {
    const p = moveAABB(wallsOutside, 9.5, 5, 0.5, 0, 0.3);
    expect(p.x).toBeLessThanOrEqual(9.7); expect(p.x).toBeGreaterThan(9.69);
  });
  it('slides along a wall when moving diagonally into it', () => {
    const p = moveAABB(wallsOutside, 9.69, 5, 0.5, 0.3, 0.3);
    expect(p.x).toBeCloseTo(9.7, 5); expect(p.y).toBeCloseTo(5.3);
  });
  it('is deterministic (same inputs, same bits)', () => {
    const a = moveAABB(wallsOutside, 1.234, 5.678, 0.0333, -0.0111, 0.3);
    const b = moveAABB(wallsOutside, 1.234, 5.678, 0.0333, -0.0111, 0.3);
    expect(a).toEqual(b);
  });
});

describe('grid', () => {
  it('walls and outside are solid, floors are not, closed doors are solid', () => {
    const s = makeState();
    expect(solidAt(s, 0, 0)).toBe(true);
    expect(solidAt(s, -1, 5)).toBe(true);
    expect(solidAt(s, 1, 5)).toBe(false);
    expect(solidAt(s, 2, 4)).toBe(true); // door, closed
    expect(roomAt(s, 2.5, 9.5)).toBe(room(s, 'G'));
    expect(roomAt(s, 2.5, 4.5)).toBe(-1);
  });
});

describe('movementSystem', () => {
  it('moves a conscious crew member at CREW_SPEED', () => {
    const s = makeState(1);
    run(s, 60, () => intents({ moveX: 1 }));
    expect(Position.x[s.crew[0]!]).toBeCloseTo(2.5 + CREW_SPEED, 3);
  });
  it('diagonal movement is not faster than straight', () => {
    const s = makeState(1);
    teleport(s, 0, 10, 5.5);
    run(s, 10, () => intents({ moveX: 1, moveY: 1 }));
    const dx = Position.x[s.crew[0]!]! - 10, dy = Position.y[s.crew[0]!]! - 5.5;
    expect(Math.sqrt(dx * dx + dy * dy)).toBeCloseTo(CREW_SPEED * DT * 10, 3);
  });
  it('stops at the room wall', () => {
    const s = makeState(1);
    run(s, 300, () => intents({ moveX: -1 }));
    expect(Position.x[s.crew[0]!]).toBeCloseTo(1 + CREW_HALF, 3);
  });
  it('downed crew do not move', () => {
    const s = makeState(1);
    Life.state[s.crew[0]!] = LifeState.Downed;
    run(s, 30, () => intents({ moveX: 1 }));
    expect(Position.x[s.crew[0]!]).toBe(2.5);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run tests/movement.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement**

Append to `src/renderer/src/sim/tuning.ts`:
```ts
export const CREW_SPEED = 4;      // tiles per second
export const CREW_HALF = 0.3;     // AABB half-extent in tiles (must stay < 0.5, see ship schema reachability)
export const MOVE_EPS = 1e-6;
```

`src/renderer/src/sim/grid.ts`:
```ts
import type { SimState } from './state';

export const DoorState = { Closed: 0, Open: 1, Sealed: 2 } as const;

export function tileIndex(state: SimState, x: number, y: number): number {
  return Math.floor(y) * state.derived.width + Math.floor(x);
}

/** Single solidity query used by movement and reach (spec §5 Crew). */
export function solidAt(state: SimState, tx: number, ty: number): boolean {
  const d = state.derived;
  if (tx < 0 || ty < 0 || tx >= d.width || ty >= d.height) return true;
  const i = ty * d.width + tx;
  if (d.wallTile[i]) return true;
  const edge = d.doorTileToEdge[i]!;
  if (edge >= 0) return state.doors.state[edge] !== DoorState.Open;
  return false;
}

export function roomAt(state: SimState, x: number, y: number): number {
  const d = state.derived;
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= d.width || ty >= d.height) return -1;
  return d.roomOfTile[ty * d.width + tx]!;
}
```

`src/renderer/src/sim/movement.ts`:
```ts
import type { Intent } from '../../../shared/intent';
import type { SimState } from './state';
import { Position, Life, LifeState } from './components';
import { solidAt } from './grid';
import { intentFor } from './step';
import { CREW_SPEED, CREW_HALF, DT, MOVE_EPS } from './tuning';

type Solid = (tx: number, ty: number) => boolean;

function overlaps(solid: Solid, x: number, y: number, half: number): boolean {
  const x0 = Math.floor(x - half), x1 = Math.floor(x + half - MOVE_EPS);
  const y0 = Math.floor(y - half), y1 = Math.floor(y + half - MOVE_EPS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty)) return true;
  return false;
}

/** Per-axis AABB move against solid tiles: X first, then Y, snapping flush to the blocking tile. */
export function moveAABB(solid: Solid, x: number, y: number, dx: number, dy: number, half: number): { x: number; y: number } {
  if (dx !== 0) {
    const nx = x + dx;
    if (!overlaps(solid, nx, y, half)) x = nx;
    else x = dx > 0 ? Math.floor(nx + half) - half - MOVE_EPS : Math.floor(nx - half) + 1 + half + MOVE_EPS;
  }
  if (dy !== 0) {
    const ny = y + dy;
    if (!overlaps(solid, x, ny, half)) y = ny;
    else y = dy > 0 ? Math.floor(ny + half) - half - MOVE_EPS : Math.floor(ny - half) + 1 + half + MOVE_EPS;
  }
  return { x, y };
}

export function movementSystem(state: SimState, intents: readonly Intent[]): void {
  const solid: Solid = (tx, ty) => solidAt(state, tx, ty);
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] !== LifeState.Conscious) continue;
    const it = intentFor(intents, pid);
    if (it.moveX === 0 && it.moveY === 0) continue;
    const p = moveAABB(solid, Position.x[eid]!, Position.y[eid]!, it.moveX * CREW_SPEED * DT, it.moveY * CREW_SPEED * DT, CREW_HALF);
    Position.x[eid] = p.x; Position.y[eid] = p.y;
  }
}
```

In `src/renderer/src/sim/step.ts`, import `movementSystem` and replace the `(1)` comment block with:
```ts
  // (1) input, arbitration, movement, doors
  movementSystem(state, intents);
```
Remove the `void intentFor;` line.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run tests/movement.test.ts tests/state.test.ts`
Expected: all pass. (Note: `intentFor` lives in `step.ts` and `movement.ts` imports it; `step.ts` imports `movementSystem`. This circular import is fine for functions, but if vitest reports `undefined` at module evaluation, move `intentFor` into `src/shared/intent.ts` and update both imports.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim tests/helpers tests/movement.test.ts
git commit -m "feat(sim): grid solidity queries and per-axis crew movement with wall sliding

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Doors (zones, auto open/close, seal with deferral)

**Files:**
- Create: `src/renderer/src/sim/doors.ts`
- Modify: `src/renderer/src/sim/tuning.ts`, `src/renderer/src/sim/step.ts`
- Test: `tests/doors.test.ts`

**Interfaces:**
- Produces (doors.ts): `doorSystem(state): void` (runs after movement each tick), `toggleSeal(state, edge: number): void` (used by Task 12's Confirm and later by the Doors console), `crewInZone(state, edge): boolean`, `crewOnTile(state, tileIdx): boolean`.
- Produces (tuning.ts): `DOOR_ZONE = 1.0` (Chebyshev distance from door-tile centre), `DOOR_CLOSE_DELAY = 1.0` (s).

- [ ] **Step 1: Write the failing tests**

`tests/doors.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { DoorState, solidAt } from '../src/renderer/src/sim/grid';
import { toggleSeal } from '../src/renderer/src/sim/doors';
import { Position, Life, LifeState } from '../src/renderer/src/sim/components';
import { DOOR_CLOSE_DELAY } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, teleport, seconds } from './helpers/sim';

const G_DOOR = 5; // edge index of the G<->I door at tile (2,7)

describe('doors', () => {
  it('opens when a conscious crew member comes within the zone and closes after the delay', () => {
    const s = makeState(1);
    teleport(s, 0, 2.5, 9.2);              // 1.7 tiles below the door centre (2.5, 7.5)
    run(s, 1);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Closed);
    run(s, 20, () => intents({ moveY: -1 }));   // walks up into the zone
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Open);
    expect(solidAt(s, 2, 7)).toBe(false);
    run(s, 40, () => intents({ moveY: 1 }));    // walks away
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Open);  // still within the close delay
    run(s, seconds(DOOR_CLOSE_DELAY) + 2);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Closed);
  });
  it('lets crew walk through into the corridor', () => {
    const s = makeState(1);
    teleport(s, 0, 2.5, 8.5);
    run(s, seconds(1.5), () => intents({ moveY: -1 }));
    expect(Position.y[s.crew[0]!]).toBeLessThan(7);
  });
  it('a downed crew member in the zone does not hold it open', () => {
    const s = makeState(2);                // a second, conscious player keeps the run alive
    teleport(s, 1, 20.5, 5.5);             // far away in the corridor, outside every door zone
    teleport(s, 0, 2.5, 8.4);              // inside the 1-tile zone (0.9 from the door centre) but not overlapping the door tile (needs < 0.8)
    run(s, 1);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Open);
    Life.state[s.crew[0]!] = LifeState.Downed; Life.bleed[s.crew[0]!] = 30;
    run(s, seconds(DOOR_CLOSE_DELAY) + 2);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Closed);
  });
  it('a sealed door never auto-opens and blocks movement; toggling unseals', () => {
    const s = makeState(1);
    toggleSeal(s, G_DOOR);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Sealed);
    teleport(s, 0, 2.5, 8.5);
    run(s, seconds(1), () => intents({ moveY: -1 }));
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Sealed);
    expect(Position.y[s.crew[0]!]).toBeGreaterThan(8);
    toggleSeal(s, G_DOOR);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Closed);
  });
  it('sealing with a crew member on the door tile is deferred until clear', () => {
    const s = makeState(1);
    teleport(s, 0, 2.5, 7.5);   // standing in the doorway
    run(s, 1);
    toggleSeal(s, G_DOOR);
    run(s, 1);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Open);
    expect(s.doors.sealRequested[G_DOOR]).toBe(1);
    run(s, seconds(1), () => intents({ moveY: 1 }));   // steps off the tile
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Sealed);
    expect(s.doors.sealRequested[G_DOOR]).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/doors.test.ts`
Expected: FAIL, `toggleSeal` not found and doors never open.

- [ ] **Step 3: Implement**

Append to `src/renderer/src/sim/tuning.ts`:
```ts
export const DOOR_ZONE = 1.0;          // Chebyshev distance (tiles) from a door tile's centre that holds it open
export const DOOR_CLOSE_DELAY = 1.0;   // seconds after the zone is clear
```

`src/renderer/src/sim/doors.ts`:
```ts
import type { SimState } from './state';
import { Position, Life, LifeState } from './components';
import { DoorState } from './grid';
import { CREW_HALF, DOOR_ZONE, DOOR_CLOSE_DELAY, DT } from './tuning';

function tileCentre(state: SimState, tileIdx: number): [number, number] {
  const w = state.derived.width, tx = tileIdx % w;
  return [tx + 0.5, (tileIdx - tx) / w + 0.5];
}

/** True if any Conscious crew member's centre is within DOOR_ZONE of the door tile centre. */
export function crewInZone(state: SimState, edge: number): boolean {
  const [cx, cy] = tileCentre(state, state.derived.edgeTile[edge]!);
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] !== LifeState.Conscious) continue;
    if (Math.abs(Position.x[eid]! - cx) <= DOOR_ZONE && Math.abs(Position.y[eid]! - cy) <= DOOR_ZONE) return true;
  }
  return false;
}

/** True if any crew member's AABB (any life state) overlaps the tile. */
export function crewOnTile(state: SimState, tileIdx: number): boolean {
  const [cx, cy] = tileCentre(state, tileIdx);
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Math.abs(Position.x[eid]! - cx) < 0.5 + CREW_HALF && Math.abs(Position.y[eid]! - cy) < 0.5 + CREW_HALF) return true;
  }
  return false;
}

/** Local or remote seal toggle. Sealing a door with someone in it is deferred until the tile is clear. */
export function toggleSeal(state: SimState, edge: number): void {
  if (!state.derived.edgeIsDoor[edge]) return;
  if (state.doors.state[edge] === DoorState.Sealed) { state.doors.state[edge] = DoorState.Closed; state.doors.closeTimer[edge] = 0; return; }
  if (state.doors.sealRequested[edge]) { state.doors.sealRequested[edge] = 0; return; }
  if (crewOnTile(state, state.derived.edgeTile[edge]!)) { state.doors.sealRequested[edge] = 1; return; }
  state.doors.state[edge] = DoorState.Sealed; state.doors.closeTimer[edge] = 0;
}

export function doorSystem(state: SimState): void {
  const d = state.derived;
  for (let e = 0; e < d.edgeIsDoor.length; e++) {
    if (!d.edgeIsDoor[e]) continue;
    if (state.doors.state[e] === DoorState.Sealed) continue;
    if (state.doors.sealRequested[e] && !crewOnTile(state, d.edgeTile[e]!)) {
      state.doors.state[e] = DoorState.Sealed; state.doors.sealRequested[e] = 0; state.doors.closeTimer[e] = 0;
      continue;
    }
    if (crewInZone(state, e)) {
      state.doors.state[e] = DoorState.Open; state.doors.closeTimer[e] = DOOR_CLOSE_DELAY;
    } else if (state.doors.state[e] === DoorState.Open) {
      state.doors.closeTimer[e] = Math.max(0, state.doors.closeTimer[e]! - DT);
      if (state.doors.closeTimer[e] === 0 && !crewOnTile(state, d.edgeTile[e]!)) state.doors.state[e] = DoorState.Closed;
    }
  }
}
```

In `step.ts`, after `movementSystem(state, intents);` add `doorSystem(state);` (import it).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/doors.test.ts tests/movement.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim tests/doors.test.ts
git commit -m "feat(sim): doors with approach zones, close delay and deferred sealing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Oxygen on the room graph (stable, conservative, with sinks and injection)

**Files:**
- Create: `src/renderer/src/sim/hazards/oxygen.ts`
- Modify: `src/renderer/src/sim/tuning.ts`, `src/renderer/src/sim/ship/derived.ts`, `src/renderer/src/sim/step.ts`, `src/renderer/src/sim/state.ts` (adds the `injectionScratch` buffer, see Step 4)
- Test: `tests/oxygen.test.ts`

**Interfaces:**
- Produces (oxygen.ts): `passageFor(state, edge): number`, `roomBreached(state, room): boolean`, `oxygenStep(state, injection: Float64Array): void` (one hazard step of `HAZARD_DT`; `injection[r]` is the requested units for room r, clamped inside), `totalO2(state): number`.
- Produces (tuning.ts): `PASSAGE_OPEN = 1`, `PASSAGE_CLOSED = 0.05`, `PASSAGE_SEALED = 0.01`, `PASSAGE_BREACH = 0.1` (a breach is a hole, not an open door: a 12-tile room then has a half-life of about 14 s), `BREATH_RATE = 0.01` (units/s per living crew), `FIRE_O2_RATE = 0.02` (units/s per fire intensity), `O2_SNAP_EPS = 1e-9`.
- Modifies (derived.ts): `kEff = min(O2_K, 0.5 · min_r(volume_r / maxConductance_r) / HAZARD_DT)` where `maxConductance_r = Σ incident edge widths · PASSAGE_OPEN + Σ site widths · PASSAGE_BREACH`.
- Modifies (step.ts): on the hazard tick, `(4)` calls `oxygenStep(state, zeroInjection)` for now (Task 13 supplies the stub injection).

- [ ] **Step 1: Write the failing tests**

`tests/oxygen.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { oxygenStep, totalO2, roomBreached } from '../src/renderer/src/sim/hazards/oxygen';
import { DoorState } from '../src/renderer/src/sim/grid';
import { O2_K, O2_SNAP_EPS } from '../src/renderer/src/sim/tuning';
import { makeState, room, teleport } from './helpers/sim';

function balance(before: number, s: ReturnType<typeof makeState>, c0: typeof s.o2Counters): void {
  const c = s.o2Counters;
  const expected = before + (c.injected - c0.injected) - (c.breathed - c0.breathed) - (c.burned - c0.burned) - (c.vented - c0.vented) - (c.residual - c0.residual);
  expect(Math.abs(totalO2(s) - expected)).toBeLessThan(1e-7);
  for (let r = 0; r < s.rooms.o2.length; r++) {
    expect(s.rooms.o2[r]).toBeGreaterThanOrEqual(0);
    expect(s.rooms.o2[r]).toBeLessThanOrEqual(s.derived.volume[r]! + 1e-9);
  }
}

describe('oxygen', () => {
  it('starter layout keeps the full diffusion rate (stability bound not binding)', () => {
    expect(makeState().derived.kEff).toBe(O2_K);
  });
  it('a full room next to an empty one equalises and conserves mass', () => {
    const s = makeState(0);
    const I = room(s, 'I'), A = room(s, 'A');
    s.doors.state.fill(DoorState.Open);
    s.rooms.o2[A] = 0;
    const before = totalO2(s), c0 = { ...s.o2Counters };
    const zero = new Float64Array(s.rooms.o2.length);
    for (let i = 0; i < 600; i++) oxygenStep(s, zero);
    balance(before, s, c0);
    expect(s.rooms.o2[A]! / s.derived.volume[A]!).toBeCloseTo(s.rooms.o2[I]! / s.derived.volume[I]!, 3);
  });
  it('branching graph: one full room, every neighbour empty, never goes negative', () => {
    const s = makeState(0);
    const I = room(s, 'I');
    s.doors.state.fill(DoorState.Open);
    for (let r = 0; r < s.rooms.o2.length; r++) if (r !== I) s.rooms.o2[r] = 0;
    s.rooms.o2[I] = 0.001; // nearly empty source so outflow demand exceeds mass
    const before = totalO2(s), c0 = { ...s.o2Counters };
    oxygenStep(s, new Float64Array(s.rooms.o2.length));
    expect(s.rooms.o2[I]).toBeGreaterThanOrEqual(0);
    balance(before, s, c0);
  });
  it('crew breathe and fire burns oxygen, and sinks are scaled when a room is nearly empty', () => {
    const s = makeState(2);
    const G = room(s, 'G');
    teleport(s, 0, 2.5, 9.5); teleport(s, 1, 3.5, 9.5);
    s.rooms.fire[G] = 4;
    s.rooms.o2[G] = 1e-6;
    const before = totalO2(s), c0 = { ...s.o2Counters };
    oxygenStep(s, new Float64Array(s.rooms.o2.length));
    expect(s.o2Counters.breathed).toBeGreaterThan(0);
    expect(s.o2Counters.burned).toBeGreaterThan(0);
    balance(before, s, c0);
  });
  it('injection is clamped to the room volume and skipped in breached rooms', () => {
    const s = makeState(0);
    const A = room(s, 'A'), B = room(s, 'B');
    const inj = new Float64Array(s.rooms.o2.length);
    inj[A] = 100; inj[B] = 100;
    s.rooms.o2[A] = 5;
    s.breaches.active[1] = 1; // site 1 is in B
    expect(roomBreached(s, B)).toBe(true);
    const c0 = { ...s.o2Counters }, before = totalO2(s);
    oxygenStep(s, inj);
    expect(s.rooms.o2[A]).toBeCloseTo(s.derived.volume[A]!, 9);
    expect(s.o2Counters.injected - c0.injected).toBeLessThanOrEqual(s.derived.volume[A]! - 5 + 1e-9);
    balance(before, s, c0);
  });
  it('tiny residues snap to zero and are tracked', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    s.rooms.o2.fill(0);                    // nothing can leak back in through the doors
    s.rooms.o2[A] = O2_SNAP_EPS / 2;
    oxygenStep(s, new Float64Array(s.rooms.o2.length));
    expect(s.rooms.o2[A]).toBe(0);
    expect(s.o2Counters.residual).toBeGreaterThan(0);
  });
  it('property: mass balance and bounds hold for random states (incl. simultaneous venting)', () => {
    fc.assert(fc.property(
      fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 9, maxLength: 9 }),
      fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 8, maxLength: 8 }),
      fc.array(fc.boolean(), { minLength: 9, maxLength: 9 }),
      fc.array(fc.double({ min: 0, max: 16, noNaN: true }), { minLength: 9, maxLength: 9 }),
      fc.array(fc.double({ min: 0, max: 50, noNaN: true }), { minLength: 9, maxLength: 9 }),
      (fracs, doors, breaches, fires, inj) => {
        const s = makeState(4);
        for (let r = 0; r < 9; r++) { s.rooms.o2[r] = fracs[r]! * s.derived.volume[r]!; s.rooms.fire[r] = fires[r]!; }
        for (let e = 0; e < 8; e++) s.doors.state[e] = doors[e]!;
        for (let b = 0; b < 9; b++) s.breaches.active[b] = breaches[b]! ? 1 : 0;
        const injection = Float64Array.from(inj);
        for (let i = 0; i < 20; i++) {
          const before = totalO2(s), c0 = { ...s.o2Counters };
          oxygenStep(s, injection);
          balance(before, s, c0);
        }
      }
    ), { numRuns: 200 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/oxygen.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement tuning and kEff**

Append to `src/renderer/src/sim/tuning.ts`:
```ts
export const PASSAGE_OPEN = 1;
export const PASSAGE_CLOSED = 0.05;
export const PASSAGE_SEALED = 0.01;       // lowered further by Doors skill in increment 3
export const PASSAGE_BREACH = 0.1;        // a breach is a hole, not an open door (12-tile room half-life ~14 s)
export const BREATH_RATE = 0.01;          // oxygen units per second per living crew member
export const FIRE_O2_RATE = 0.02;         // oxygen units per second per unit of fire intensity
export const O2_SNAP_EPS = 1e-9;
```

In `src/renderer/src/sim/ship/derived.ts`, change the import to `import { O2_K, HAZARD_DT, PASSAGE_OPEN, PASSAGE_BREACH } from '../tuning';` and replace `kEff: O2_K,` with a computed value. Insert before the `return`:
```ts
  // Stability bound (spec §5): k·dt·Σ incident conductance / V ≤ 1/2 for every room, at maximum passage.
  const maxCond = new Float64Array(layout.rooms.length);
  for (let e = 0; e < E; e++) { maxCond[edgeA[e]!]! += edgeWidth[e]! * PASSAGE_OPEN; maxCond[edgeB[e]!]! += edgeWidth[e]! * PASSAGE_OPEN; }
  for (let s = 0; s < S; s++) maxCond[siteRoom[s]!]! += siteWidth[s]! * PASSAGE_BREACH;
  let kEff = O2_K;
  for (let r = 0; r < maxCond.length; r++) if (maxCond[r]! > 0) kEff = Math.min(kEff, 0.5 * volume[r]! / maxCond[r]! / HAZARD_DT);
```
and use `kEff,` in the returned object.

- [ ] **Step 4: Implement oxygen**

`src/renderer/src/sim/hazards/oxygen.ts`:
```ts
import type { SimState } from '../state';
import { Life, LifeState, Position } from '../components';
import { DoorState, roomAt } from '../grid';
import { HAZARD_DT, PASSAGE_OPEN, PASSAGE_CLOSED, PASSAGE_SEALED, PASSAGE_BREACH, BREATH_RATE, FIRE_O2_RATE, O2_SNAP_EPS } from '../tuning';

export function passageFor(state: SimState, edge: number): number {
  if (!state.derived.edgeIsDoor[edge]) return PASSAGE_OPEN;
  const st = state.doors.state[edge];
  return st === DoorState.Open ? PASSAGE_OPEN : st === DoorState.Sealed ? PASSAGE_SEALED : PASSAGE_CLOSED;
}

export function roomBreached(state: SimState, room: number): boolean {
  const d = state.derived;
  for (let s = 0; s < d.siteRoom.length; s++) if (state.breaches.active[s] && d.siteRoom[s] === room) return true;
  return false;
}

export function totalO2(state: SimState): number {
  let t = 0; for (const v of state.rooms.o2) t += v; return t;
}

/**
 * One hazard step. Flows are computed from a start-of-step snapshot and applied symmetrically.
 * A room whose total demand (outflows + venting + breathing + fire) exceeds its mass has all of them
 * scaled down proportionally, which keeps conservation and non-negativity on branching graphs (spec §5).
 */
export function oxygenStep(state: SimState, injection: Float64Array): void {
  const d = state.derived, o2 = state.rooms.o2, V = d.volume, k = d.kEff, dt = HAZARD_DT;
  const R = o2.length, E = d.edgeA.length, S = d.siteRoom.length;
  const frac = new Float64Array(R);
  for (let r = 0; r < R; r++) frac[r] = o2[r]! / V[r]!;
  const demand = new Float64Array(R);
  // Edge flows (positive = a -> b).
  const flow = new Float64Array(E);
  for (let e = 0; e < E; e++) {
    const a = d.edgeA[e]!, b = d.edgeB[e]!;
    const f = k * d.edgeWidth[e]! * passageFor(state, e) * (frac[a]! - frac[b]!) * dt;
    flow[e] = f;
    if (f > 0) demand[a]! += f; else demand[b]! -= f;
  }
  // Venting through active breaches (space is a fixed-zero node).
  const vent = new Float64Array(S);
  for (let s = 0; s < S; s++) {
    if (!state.breaches.active[s]) continue;
    const r = d.siteRoom[s]!;
    vent[s] = k * d.siteWidth[s]! * PASSAGE_BREACH * frac[r]! * dt;
    demand[r]! += vent[s]!;
  }
  // Sinks.
  const breath = new Float64Array(R), burn = new Float64Array(R);
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] === LifeState.Dead) continue;
    const r = roomAt(state, Position.x[eid]!, Position.y[eid]!);
    if (r >= 0) breath[r]! += BREATH_RATE * dt;
  }
  for (let r = 0; r < R; r++) { burn[r] = FIRE_O2_RATE * state.rooms.fire[r]! * dt; demand[r]! += breath[r]! + burn[r]!; }
  // Proportional scaling per source room.
  const scale = new Float64Array(R);
  for (let r = 0; r < R; r++) scale[r] = demand[r]! > o2[r]! && demand[r]! > 0 ? o2[r]! / demand[r]! : 1;
  // Apply.
  for (let e = 0; e < E; e++) {
    const f = flow[e]!;
    if (f === 0) continue;
    const src = f > 0 ? d.edgeA[e]! : d.edgeB[e]!, dst = f > 0 ? d.edgeB[e]! : d.edgeA[e]!;
    const amt = Math.abs(f) * scale[src]!;
    o2[src]! -= amt; o2[dst]! += amt;
  }
  const c = state.o2Counters;
  for (let s = 0; s < S; s++) {
    if (vent[s] === 0) continue;
    const r = d.siteRoom[s]!, amt = vent[s]! * scale[r]!;
    o2[r]! -= amt; c.vented += amt;
  }
  for (let r = 0; r < R; r++) {
    const b = breath[r]! * scale[r]!, f = burn[r]! * scale[r]!;
    o2[r]! -= b + f; c.breathed += b; c.burned += f;
  }
  // Injection, clamped to the free volume, none into breached rooms.
  for (let r = 0; r < R; r++) {
    const want = injection[r] ?? 0;
    if (want <= 0 || roomBreached(state, r)) continue;
    const inj = Math.min(want, Math.max(0, V[r]! - o2[r]!));
    if (inj > 0) { o2[r]! += inj; c.injected += inj; }
  }
  // Snap tiny values; the discarded mass is tracked so the balance test can account for it.
  for (let r = 0; r < R; r++) {
    if (o2[r]! < O2_SNAP_EPS) { c.residual += o2[r]!; o2[r] = 0; }
  }
}
```

In `step.ts`, replace the `(4)` block with:
```ts
  // (4) hazards on the hazard tick
  if (hazardTick) {
    oxygenStep(state, state.injectionScratch);
  }
```
and add to `SimState` (state.ts) a non-snapshotted scratch buffer `injectionScratch: Float64Array` created as `new Float64Array(R)` in `createSimState` (it is overwritten every hazard tick by Task 13 and is derived data, so it is not in `flatten`).

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run tests/oxygen.test.ts tests/state.test.ts`
Expected: all pass. If the property test finds a counterexample, print it with `fc.assert(..., { verbose: true })`; the usual cause is a missing `scale[]` on one of the demand terms.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim tests/oxygen.test.ts
git commit -m "feat(sim): room-graph oxygen with stability bound, proportional scaling, sinks and clamped injection

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Breaches

**Files:**
- Create: `src/renderer/src/sim/hazards/breach.ts`
- Test: `tests/breach.test.ts`

**Interfaces:**
- Produces: `activateBreach(state, site): boolean` (false if already active), `repairBreach(state, site): void`, `activeBreachCount(state): number`, `freeSites(state): number[]` (inactive site indices, ascending).

- [ ] **Step 1: Write the failing tests**

`tests/breach.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { activateBreach, repairBreach, activeBreachCount, freeSites } from '../src/renderer/src/sim/hazards/breach';
import { roomBreached, totalO2, oxygenStep } from '../src/renderer/src/sim/hazards/oxygen';
import { DoorState } from '../src/renderer/src/sim/grid';
import { makeState, room } from './helpers/sim';

// Pure physics tests: step the oxygen model directly with no injection, so the later injector stub
// and spawner (Task 13) cannot mask venting.
function ventFor(s: ReturnType<typeof makeState>, secondsOfHazard: number): void {
  const zero = new Float64Array(s.rooms.o2.length);
  for (let i = 0; i < secondsOfHazard * 12; i++) oxygenStep(s, zero);
}

describe('breaches', () => {
  it('activating a site vents its room and marks it breached', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    expect(activateBreach(s, 0)).toBe(true);
    expect(activateBreach(s, 0)).toBe(false);
    expect(roomBreached(s, A)).toBe(true);
    expect(activeBreachCount(s)).toBe(1);
    expect(freeSites(s)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const before = totalO2(s);
    ventFor(s, 30);
    expect(s.rooms.o2[A]).toBeLessThan(s.derived.volume[A]! * 0.5);
    expect(s.o2Counters.vented).toBeGreaterThan(0);
    expect(Math.abs(before - totalO2(s) - s.o2Counters.vented - s.o2Counters.residual)).toBeLessThan(1e-6);
  });
  it('a sealed door loses less oxygen to a breached neighbour than a closed one', () => {
    const closed = makeState(0), sealed = makeState(0);
    const I = room(closed, 'I');
    activateBreach(closed, 0); activateBreach(sealed, 0);
    sealed.doors.state[0] = DoorState.Sealed;
    ventFor(closed, 60); ventFor(sealed, 60);
    expect(sealed.rooms.o2[I]).toBeGreaterThan(closed.rooms.o2[I]!);
  });
  it('repair closes the breach and the room can refill', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    activateBreach(s, 0);
    ventFor(s, 60);
    repairBreach(s, 0);
    expect(roomBreached(s, A)).toBe(false);
    expect(s.breaches.repair[0]).toBe(0);
    const low = s.rooms.o2[A]!;
    s.doors.state[0] = DoorState.Open;
    ventFor(s, 30);
    expect(s.rooms.o2[A]).toBeGreaterThan(low);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/breach.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/renderer/src/sim/hazards/breach.ts`:
```ts
import type { SimState } from '../state';

/** A breach activates one of the layout's immutable breach sites (spec §5). Venting itself is in oxygen.ts. */
export function activateBreach(state: SimState, site: number): boolean {
  if (state.breaches.active[site]) return false;
  state.breaches.active[site] = 1;
  state.breaches.repair[site] = 0;
  return true;
}

export function repairBreach(state: SimState, site: number): void {
  state.breaches.active[site] = 0;
  state.breaches.repair[site] = 0;
}

export function activeBreachCount(state: SimState): number {
  let n = 0; for (const a of state.breaches.active) if (a) n++; return n;
}

export function freeSites(state: SimState): number[] {
  const out: number[] = [];
  for (let s = 0; s < state.breaches.active.length; s++) if (!state.breaches.active[s]) out.push(s);
  return out;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/breach.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/hazards/breach.ts tests/breach.test.ts
git commit -m "feat(sim): breach activation and repair on layout breach sites

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Fire

**Files:**
- Create: `src/renderer/src/sim/hazards/fire.ts`
- Modify: `src/renderer/src/sim/tuning.ts`, `src/renderer/src/sim/step.ts`
- Test: `tests/fire.test.ts`

**Interfaces:**
- Produces (fire.ts): `fireStep(state): void` (one hazard step: growth/shrink then spread rolls on the `hazards` stream), `igniteRoom(state, room): boolean` (false if already burning), `extinguishRoom(state, room): void`, `burningRoomCount(state): number`.
- Produces (tuning.ts): `FIRE_GROW_FRAC = 0.2`, `FIRE_SHRINK_FRAC = 0.1`, `FIRE_GROW_RATE = 0.5` (/s), `FIRE_SHRINK_RATE = 1.0` (/s), `FIRE_CAP = 16`, `FIRE_START = 1`, `FIRE_SPREAD_P = 0.0027` (per hazard tick per burning edge at passage 1; about 15% per 5 s).

- [ ] **Step 1: Write the failing tests**

`tests/fire.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fireStep, igniteRoom, extinguishRoom, burningRoomCount } from '../src/renderer/src/sim/hazards/fire';
import { DoorState } from '../src/renderer/src/sim/grid';
import { FIRE_CAP, FIRE_START, FIRE_GROW_FRAC, FIRE_SHRINK_FRAC } from '../src/renderer/src/sim/tuning';
import { makeState, room, run, seconds } from './helpers/sim';

describe('fire', () => {
  it('ignites at FIRE_START and grows to the cap in a full room', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    expect(igniteRoom(s, A)).toBe(true);
    expect(igniteRoom(s, A)).toBe(false);
    expect(s.rooms.fire[A]).toBe(FIRE_START);
    for (let i = 0; i < 2000; i++) fireStep(s);
    expect(s.rooms.fire[A]).toBe(FIRE_CAP);
    expect(burningRoomCount(s)).toBeGreaterThanOrEqual(1);   // spread through the closed door is possible and seeded, so do not assert exactly 1
  });
  it('shrinks below the shrink threshold and holds between the two thresholds', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    igniteRoom(s, A); s.rooms.fire[A] = 8;
    s.rooms.o2[A] = s.derived.volume[A]! * (FIRE_GROW_FRAC + FIRE_SHRINK_FRAC) / 2;
    fireStep(s);
    expect(s.rooms.fire[A]).toBe(8);
    s.rooms.o2[A] = s.derived.volume[A]! * FIRE_SHRINK_FRAC * 0.5;
    for (let i = 0; i < 2000; i++) fireStep(s);
    expect(s.rooms.fire[A]).toBe(0);
    expect(s.rooms.fireRepair[A]).toBe(0);
  });
  it('spreads through open doors far more often than sealed ones', () => {
    let openSpread = 0, sealedSpread = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const o = makeState(0, seed), se = makeState(0, seed);
      const A = room(o, 'A'), I = room(o, 'I');
      igniteRoom(o, A); igniteRoom(se, A);
      o.doors.state[0] = DoorState.Open; se.doors.state[0] = DoorState.Sealed;
      for (let i = 0; i < 1200; i++) { fireStep(o); fireStep(se); } // 100 s
      if (o.rooms.fire[I]! > 0) openSpread++;
      if (se.rooms.fire[I]! > 0) sealedSpread++;
    }
    expect(openSpread).toBeGreaterThan(sealedSpread);
    expect(openSpread).toBeGreaterThanOrEqual(15);
  });
  it('consumes oxygen through the oxygen step and the step loop runs it', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    igniteRoom(s, A);
    run(s, seconds(10));
    expect(s.o2Counters.burned).toBeGreaterThan(0);
    expect(s.rooms.fire[A]).toBeGreaterThan(FIRE_START);
  });
  it('extinguish resets fire and repair progress', () => {
    const s = makeState(0);
    const A = room(s, 'A');
    igniteRoom(s, A); s.rooms.fireRepair[A] = 0.5;
    extinguishRoom(s, A);
    expect(s.rooms.fire[A]).toBe(0); expect(s.rooms.fireRepair[A]).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/fire.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Append to `src/renderer/src/sim/tuning.ts`:
```ts
export const FIRE_GROW_FRAC = 0.2;     // fire grows while room oxygen fraction is above this
export const FIRE_SHRINK_FRAC = 0.1;   // fire shrinks while below this (B < A: no flicker)
export const FIRE_GROW_RATE = 0.5;     // intensity per second
export const FIRE_SHRINK_RATE = 1.0;   // intensity per second
export const FIRE_CAP = 16;
export const FIRE_START = 1;
export const FIRE_SPREAD_P = 0.0027;   // per hazard tick per burning edge at passage 1 (~15% per 5 s)
```

`src/renderer/src/sim/hazards/fire.ts`:
```ts
import type { SimState } from '../state';
import { chance } from '../../../../shared/rng';
import { passageFor } from './oxygen';
import { HAZARD_DT, FIRE_GROW_FRAC, FIRE_SHRINK_FRAC, FIRE_GROW_RATE, FIRE_SHRINK_RATE, FIRE_CAP, FIRE_START, FIRE_SPREAD_P } from '../tuning';

export function igniteRoom(state: SimState, room: number): boolean {
  if (state.rooms.fire[room]! > 0) return false;
  state.rooms.fire[room] = FIRE_START;
  state.rooms.fireRepair[room] = 0;
  return true;
}

export function extinguishRoom(state: SimState, room: number): void {
  state.rooms.fire[room] = 0;
  state.rooms.fireRepair[room] = 0;
}

export function burningRoomCount(state: SimState): number {
  let n = 0; for (const f of state.rooms.fire) if (f > 0) n++; return n;
}

/** Growth/shrink by room oxygen, then one spread roll per burning edge side, in edge order (spec §5 Fire). */
export function fireStep(state: SimState): void {
  const d = state.derived, fire = state.rooms.fire, dt = HAZARD_DT;
  for (let r = 0; r < fire.length; r++) {
    if (fire[r]! <= 0) continue;
    const frac = state.rooms.o2[r]! / d.volume[r]!;
    if (frac > FIRE_GROW_FRAC) fire[r] = Math.min(FIRE_CAP, fire[r]! + FIRE_GROW_RATE * dt);
    else if (frac < FIRE_SHRINK_FRAC) fire[r] = Math.max(0, fire[r]! - FIRE_SHRINK_RATE * dt);
    if (fire[r] === 0) state.rooms.fireRepair[r] = 0;
  }
  for (let e = 0; e < d.edgeA.length; e++) {
    const a = d.edgeA[e]!, b = d.edgeB[e]!;
    const p = FIRE_SPREAD_P * passageFor(state, e);
    if (fire[a]! > 0 && fire[b] === 0 && chance(state.rng.hazards, p)) igniteRoom(state, b);
    if (fire[b]! > 0 && fire[a] === 0 && chance(state.rng.hazards, p)) igniteRoom(state, a);
  }
}
```

In `step.ts`, inside the `if (hazardTick)` block after `oxygenStep(...)`, add `fireStep(state);`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/fire.test.ts tests/oxygen.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim tests/fire.test.ts
git commit -m "feat(sim): fire growth, shrink thresholds and seeded spread across edges

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Crew damage, Downed, bleed-out, Dead and run end

**Files:**
- Create: `src/renderer/src/sim/crew.ts`
- Modify: `src/renderer/src/sim/tuning.ts`, `src/renderer/src/sim/step.ts`
- Test: `tests/crew.test.ts`

**Interfaces:**
- Produces (crew.ts): `crewSystem(state): void` (step 7: damage, state transitions, run end), `reviveCrew(state, eid): void` (Downed → Conscious at `HEALTH_MAX · REVIVE_HEALTH_FRAC`), `consciousCount(state): number`, `EndReason = { None: 0, Hull: 1, Crew: 2 }`.
- Produces (tuning.ts): `FIRE_DAMAGE = 4` (health/s in a burning room), `O2_DAMAGE = 6` (health/s below the suffocation fraction), `SUFFOCATE_FRAC = 0.1`, `BLEEDOUT_TIME = 30` (s), `BLEED_HAZARD_MULT = 2`, `REVIVE_HEALTH_FRAC = 0.3`. There is no healing in increment 1 (Medbay arrives in 2a), so damage rates are deliberately low.
- Run-end rule: `consciousCount === 0` ends the run only when `playerCount > 0`, so zero-player states used by hazard tests keep stepping.

- [ ] **Step 1: Write the failing tests**

`tests/crew.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { reviveCrew, consciousCount, EndReason } from '../src/renderer/src/sim/crew';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { HEALTH_MAX, FIRE_DAMAGE, BLEEDOUT_TIME, REVIVE_HEALTH_FRAC } from '../src/renderer/src/sim/tuning';
import { makeState, run, room, seconds, teleport } from './helpers/sim';

describe('crew lifecycle', () => {
  it('takes fire damage in a burning room', () => {
    const s = makeState(1);
    igniteRoom(s, room(s, 'G'));
    run(s, seconds(1));
    expect(Health.cur[s.crew[0]!]).toBeCloseTo(HEALTH_MAX - FIRE_DAMAGE, 0);
  });
  it('takes damage in a low-oxygen room', () => {
    const s = makeState(1);
    s.rooms.o2[room(s, 'G')] = 0;
    s.doors.state.fill(2); // sealed, so it stays empty
    run(s, seconds(1));
    expect(Health.cur[s.crew[0]!]).toBeLessThan(HEALTH_MAX);
  });
  it('goes Downed at 0 health, bleeds out, then Dead; solo run ends on Downed', () => {
    const s = makeState(1);
    const eid = s.crew[0]!;
    Health.cur[eid] = 0.05;                 // two ticks of FIRE_DAMAGE/60 finish it
    igniteRoom(s, room(s, 'G'));
    run(s, 2);
    expect(Life.state[eid]).toBe(LifeState.Downed);
    expect(Life.bleed[eid]).toBeCloseTo(BLEEDOUT_TIME, 1);
    expect(s.ended).toBe(1); expect(s.endReason).toBe(EndReason.Crew);
  });
  it('bleeds out faster in fire and becomes Dead; two-player run continues', () => {
    const s = makeState(2);
    const eid = s.crew[0]!;
    teleport(s, 1, 20.5, 5.5);                              // teammate safe in the corridor
    Life.state[eid] = LifeState.Downed; Life.bleed[eid] = BLEEDOUT_TIME;
    s.doors.state.fill(2);
    run(s, seconds(BLEEDOUT_TIME / 2 + 1));
    expect(Life.state[eid]).toBe(LifeState.Downed);        // normal rate: half gone
    const t = makeState(2);
    const e2 = t.crew[0]!;
    teleport(t, 1, 20.5, 5.5);
    Life.state[e2] = LifeState.Downed; Life.bleed[e2] = BLEEDOUT_TIME;
    igniteRoom(t, room(t, 'G'));
    run(t, seconds(BLEEDOUT_TIME / 2 + 1));
    expect(Life.state[e2]).toBe(LifeState.Dead);           // doubled rate in fire
    expect(t.ended).toBe(0);
    expect(consciousCount(t)).toBe(1);
  });
  it('reviveCrew returns a Downed crew member at partial health', () => {
    const s = makeState(2);
    const eid = s.crew[0]!;
    Life.state[eid] = LifeState.Downed; Life.bleed[eid] = 5; Health.cur[eid] = 0;
    reviveCrew(s, eid);
    expect(Life.state[eid]).toBe(LifeState.Conscious);
    expect(Health.cur[eid]).toBe(HEALTH_MAX * REVIVE_HEALTH_FRAC);
    expect(Life.bleed[eid]).toBe(0);
  });
  it('run ends when hull reaches 0', () => {
    const s = makeState(2);
    s.hull = 0;
    run(s, 1);
    expect(s.ended).toBe(1); expect(s.endReason).toBe(EndReason.Hull);
  });
  it('an ended run does not advance', () => {
    const s = makeState(2);
    s.hull = 0; run(s, 5);
    expect(s.tick).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/crew.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Append to `src/renderer/src/sim/tuning.ts`:
```ts
export const FIRE_DAMAGE = 4;           // health per second while in a burning room (no healing exists in increment 1)
export const O2_DAMAGE = 6;             // health per second below SUFFOCATE_FRAC
export const SUFFOCATE_FRAC = 0.1;
export const BLEEDOUT_TIME = 30;        // seconds Downed before Dead
export const BLEED_HAZARD_MULT = 2;     // bleed-out speed in fire or low oxygen
export const REVIVE_HEALTH_FRAC = 0.3;
```

`src/renderer/src/sim/crew.ts`:
```ts
import type { SimState } from './state';
import { Position, Health, Life, LifeState } from './components';
import { roomAt } from './grid';
import { DT, FIRE_DAMAGE, O2_DAMAGE, SUFFOCATE_FRAC, BLEEDOUT_TIME, BLEED_HAZARD_MULT, HEALTH_MAX, REVIVE_HEALTH_FRAC } from './tuning';

export const EndReason = { None: 0, Hull: 1, Crew: 2 } as const;

export function reviveCrew(state: SimState, eid: number): void {
  void state;
  Life.state[eid] = LifeState.Conscious;
  Health.cur[eid] = HEALTH_MAX * REVIVE_HEALTH_FRAC;
  Life.bleed[eid] = 0; Life.reviveProgress[eid] = 0; Life.reviverPid[eid] = -1;
}

export function consciousCount(state: SimState): number {
  let n = 0;
  for (let pid = 0; pid < state.playerCount; pid++) if (Life.state[state.crew[pid]!] === LifeState.Conscious) n++;
  return n;
}

/** Step 7: environmental damage, Downed/Dead transitions and the run-end check (spec §5 Crew lifecycle). */
export function crewSystem(state: SimState): void {
  for (let pid = 0; pid < state.playerCount; pid++) {
    const eid = state.crew[pid]!;
    if (Life.state[eid] === LifeState.Dead) continue;
    const r = roomAt(state, Position.x[eid]!, Position.y[eid]!);
    const inFire = r >= 0 && state.rooms.fire[r]! > 0;
    const lowO2 = r >= 0 && state.rooms.o2[r]! / state.derived.volume[r]! < SUFFOCATE_FRAC;
    if (Life.state[eid] === LifeState.Conscious) {
      const dmg = (inFire ? FIRE_DAMAGE : 0) + (lowO2 ? O2_DAMAGE : 0);
      if (dmg > 0) Health.cur[eid] = Math.max(0, Health.cur[eid]! - dmg * DT);
      if (Health.cur[eid] === 0) {
        Life.state[eid] = LifeState.Downed; Life.bleed[eid] = BLEEDOUT_TIME;
        Life.reviveProgress[eid] = 0; Life.reviverPid[eid] = -1;
      }
    } else {
      Life.bleed[eid] = Math.max(0, Life.bleed[eid]! - DT * (inFire || lowO2 ? BLEED_HAZARD_MULT : 1));
      if (Life.bleed[eid] === 0) { Life.state[eid] = LifeState.Dead; Life.reviveProgress[eid] = 0; Life.reviverPid[eid] = -1; }
    }
  }
  if (state.hull <= 0) { state.hull = 0; state.ended = 1; state.endReason = EndReason.Hull; }
  else if (state.playerCount > 0 && consciousCount(state) === 0) { state.ended = 1; state.endReason = EndReason.Crew; }
}
```

In `step.ts`, replace the `(7)` comment with `crewSystem(state);` (import it). Keep `state.tick++` after it so an ending tick still counts.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/crew.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim tests/crew.test.ts
git commit -m "feat(sim): crew damage, downed/bleed-out/dead lifecycle and run end

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Reach, Interact and Confirm targets, repair and revive

**Files:**
- Create: `src/renderer/src/sim/interact.ts`
- Modify: `src/renderer/src/sim/tuning.ts`, `src/renderer/src/sim/step.ts`
- Test: `tests/interact.test.ts`

**Interfaces:**
- Produces (interact.ts):
  ```ts
  const TargetKind = { None: 0, Revive: 1, Fire: 2, Breach: 3 } as const;
  interface Target { kind: number; index: number }           // index: crew pid for Revive, room for Fire, site for Breach
  const ConfirmKind = { None: 0, Door: 1 } as const;        // Console added in increment 2a
  interface ConfirmTarget { kind: number; index: number }   // index: edge
  interactTarget(state, pid): Target        // highest priority in reach: Revive > Fire > Breach; nearest, then lowest index
  confirmTarget(state, pid): ConfirmTarget  // nearest door tile in reach
  inReachOfTile(state, eid, tileIdx): boolean
  interactSystem(state, intents): void      // step 1: arbitration, repair/revive progress, Confirm actions
  ```
- Produces (tuning.ts): `REACH = 1.5` (tiles, crew centre to nearest point of the target tile), `REPAIR_TIME_FIRE = 6` (s for one repairer), `REPAIR_TIME_BREACH = 8`, `REVIVE_TIME = 4`.

Rules (spec §5 Walking mode, Arbitration): Interact held progresses the target; the fire target is the crew member's **own room** when it is burning (a fire fills its room, so "any tile of its room" means standing inside it; reaching through a wall from the corridor is not allowed, or the gate would be passed from outside the fire); several repairers add progress; one reviver per downed crew (the current reviver keeps it while still holding and in reach, otherwise the lowest `PlayerId` candidate); losers of revive arbitration do nothing that tick. Revive progress decays at the same rate when nobody is reviving. Downed crew cannot act.

- [ ] **Step 1: Write the failing tests**

`tests/interact.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { interactTarget, confirmTarget, TargetKind, ConfirmKind } from '../src/renderer/src/sim/interact';
import { Life, LifeState, Health } from '../src/renderer/src/sim/components';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { DoorState } from '../src/renderer/src/sim/grid';
import { REPAIR_TIME_FIRE, REPAIR_TIME_BREACH, REVIVE_TIME, HEALTH_MAX, REVIVE_HEALTH_FRAC } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, teleport, room, seconds } from './helpers/sim';

describe('targets', () => {
  it('fire in own room is a target anywhere in the room; none when nothing is near', () => {
    const s = makeState(1);
    expect(interactTarget(s, 0)).toEqual({ kind: TargetKind.None, index: -1 });
    igniteRoom(s, room(s, 'G'));
    expect(interactTarget(s, 0)).toEqual({ kind: TargetKind.Fire, index: room(s, 'G') });
  });
  it('a breach site is a target when its wall tile is in reach', () => {
    const s = makeState(1);
    activateBreach(s, 6); // G bottom wall at (2,11)
    teleport(s, 0, 2.5, 10.5);
    expect(interactTarget(s, 0)).toEqual({ kind: TargetKind.Breach, index: 6 });
    teleport(s, 0, 5.5, 8.5);
    expect(interactTarget(s, 0).kind).toBe(TargetKind.None);
  });
  it('revive outranks repair', () => {
    const s = makeState(2);
    igniteRoom(s, room(s, 'G'));
    Life.state[s.crew[1]!] = LifeState.Downed; Life.bleed[s.crew[1]!] = 30;
    expect(interactTarget(s, 0)).toEqual({ kind: TargetKind.Revive, index: 1 });
  });
  it('confirm target is the nearest door in reach', () => {
    const s = makeState(1);
    teleport(s, 0, 5.5, 9.5);              // the spawn tile itself is exactly REACH from the G door
    expect(confirmTarget(s, 0).kind).toBe(ConfirmKind.None);
    teleport(s, 0, 2.5, 8.5);
    expect(confirmTarget(s, 0)).toEqual({ kind: ConfirmKind.Door, index: 5 });
  });
});

describe('interactSystem', () => {
  it('holding Interact in a burning room extinguishes it after REPAIR_TIME_FIRE', () => {
    const s = makeState(1);
    const G = room(s, 'G');
    igniteRoom(s, G);
    run(s, seconds(REPAIR_TIME_FIRE) - 5, () => intents({ interactHeld: true }));
    expect(s.rooms.fire[G]).toBeGreaterThan(0);
    run(s, 10, () => intents({ interactHeld: true }));
    expect(s.rooms.fire[G]).toBe(0);
  });
  it('two repairers add their progress', () => {
    const s = makeState(2);
    const G = room(s, 'G');
    igniteRoom(s, G);
    run(s, seconds(REPAIR_TIME_FIRE / 2) + 5, () => intents({ interactHeld: true }, { interactHeld: true }));
    expect(s.rooms.fire[G]).toBe(0);
  });
  it('repairs a breach', () => {
    const s = makeState(1);
    activateBreach(s, 6);
    teleport(s, 0, 2.5, 10.5);
    run(s, seconds(REPAIR_TIME_BREACH) + 5, () => intents({ interactHeld: true }));
    expect(s.breaches.active[6]).toBe(0);
  });
  it('revives a downed teammate after REVIVE_TIME, interrupted progress decays', () => {
    const s = makeState(2);
    const downed = s.crew[1]!;
    Life.state[downed] = LifeState.Downed; Life.bleed[downed] = 30; Health.cur[downed] = 0;
    run(s, seconds(REVIVE_TIME / 2), () => intents({ interactHeld: true }));
    expect(Life.reviveProgress[downed]).toBeCloseTo(0.5, 1);
    expect(Life.reviverPid[downed]).toBe(0);
    run(s, seconds(REVIVE_TIME / 4), () => intents({ interactHeld: false }));
    expect(Life.reviveProgress[downed]).toBeCloseTo(0.25, 1);
    expect(Life.reviverPid[downed]).toBe(-1);
    run(s, seconds(REVIVE_TIME) , () => intents({ interactHeld: true }));
    expect(Life.state[downed]).toBe(LifeState.Conscious);
    expect(Health.cur[downed]).toBe(HEALTH_MAX * REVIVE_HEALTH_FRAC);
  });
  it('only the lowest PlayerId revives when two players try at once', () => {
    const s = makeState(3);
    const downed = s.crew[2]!;              // spawns at (4.5, 9.5)
    teleport(s, 0, 3.5, 10.5);             // both P1 and P2 within REACH of the casualty
    teleport(s, 1, 3.5, 9.5);
    Life.state[downed] = LifeState.Downed; Life.bleed[downed] = 30;
    run(s, 10, () => intents({ interactHeld: true }, { interactHeld: true }));
    expect(Life.reviverPid[downed]).toBe(0);
    expect(Life.reviveProgress[downed]).toBeCloseTo(10 / 60 / REVIVE_TIME, 5); // not doubled
  });
  it('Confirm at a door toggles its seal', () => {
    const s = makeState(1);
    teleport(s, 0, 2.5, 8.6);
    run(s, 1, () => intents({ confirmPressed: true }));
    expect(s.doors.state[5]).toBe(DoorState.Sealed);
    run(s, 1, () => intents({ confirmPressed: true }));
    expect(s.doors.state[5]).toBe(DoorState.Closed);
  });
  it('downed crew cannot repair or confirm', () => {
    const s = makeState(1);
    const G = room(s, 'G');
    igniteRoom(s, G);
    Life.state[s.crew[0]!] = LifeState.Downed; Life.bleed[s.crew[0]!] = 30;
    run(s, 10, () => intents({ interactHeld: true, confirmPressed: true }));
    expect(s.rooms.fireRepair[G]).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/interact.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Append to `src/renderer/src/sim/tuning.ts`:
```ts
export const REACH = 1.5;               // tiles from crew centre to the nearest point of the target tile
export const REPAIR_TIME_FIRE = 6;      // seconds for one repairer
export const REPAIR_TIME_BREACH = 8;
export const REVIVE_TIME = 4;
```

`src/renderer/src/sim/interact.ts`:
```ts
import type { Intent } from '../../../shared/intent';
import type { SimState } from './state';
import { Position, Life, LifeState } from './components';
import { roomAt } from './grid';
import { toggleSeal } from './doors';
import { extinguishRoom } from './hazards/fire';
import { repairBreach } from './hazards/breach';
import { reviveCrew } from './crew';
import { intentFor } from './step';
import { DT, REACH, REPAIR_TIME_FIRE, REPAIR_TIME_BREACH, REVIVE_TIME } from './tuning';

export const TargetKind = { None: 0, Revive: 1, Fire: 2, Breach: 3 } as const;
export interface Target { kind: number; index: number }
export const ConfirmKind = { None: 0, Door: 1 } as const;
export interface ConfirmTarget { kind: number; index: number }

const NONE: Target = { kind: TargetKind.None, index: -1 };

/** Distance from a point to the nearest point of a tile's unit square. */
function distToTile(state: SimState, x: number, y: number, tileIdx: number): number {
  const w = state.derived.width, tx = tileIdx % w, ty = (tileIdx - tx) / w;
  const dx = Math.max(tx - x, 0, x - (tx + 1)), dy = Math.max(ty - y, 0, y - (ty + 1));
  return Math.sqrt(dx * dx + dy * dy);
}

export function inReachOfTile(state: SimState, eid: number, tileIdx: number): boolean {
  return distToTile(state, Position.x[eid]!, Position.y[eid]!, tileIdx) <= REACH;
}

export function interactTarget(state: SimState, pid: number): Target {
  const eid = state.crew[pid]!;
  if (Life.state[eid] !== LifeState.Conscious) return NONE;
  const x = Position.x[eid]!, y = Position.y[eid]!;
  // Revive: nearest Downed teammate within REACH (centre to centre), ties by lower pid.
  let best: Target = NONE, bestDist = Infinity;
  for (let other = 0; other < state.playerCount; other++) {
    if (other === pid) continue;
    const o = state.crew[other]!;
    if (Life.state[o] !== LifeState.Downed) continue;
    const dx = Position.x[o]! - x, dy = Position.y[o]! - y, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= REACH && dist < bestDist) { best = { kind: TargetKind.Revive, index: other }; bestDist = dist; }
  }
  if (best.kind !== TargetKind.None) return best;
  // Fire: only the crew member's own room (a fire is repaired from inside it, never through a wall).
  const own = roomAt(state, x, y);
  if (own >= 0 && state.rooms.fire[own]! > 0) return { kind: TargetKind.Fire, index: own };
  // Breach: nearest active site tile in reach.
  bestDist = Infinity;
  const d = state.derived;
  for (let s = 0; s < d.siteTile.length; s++) {
    if (!state.breaches.active[s]) continue;
    const dist = distToTile(state, x, y, d.siteTile[s]!);
    if (dist <= REACH && dist < bestDist) { best = { kind: TargetKind.Breach, index: s }; bestDist = dist; }
  }
  return best;
}

export function confirmTarget(state: SimState, pid: number): ConfirmTarget {
  const eid = state.crew[pid]!;
  if (Life.state[eid] !== LifeState.Conscious) return { kind: ConfirmKind.None, index: -1 };
  const d = state.derived;
  let best = -1, bestDist = Infinity;
  for (let e = 0; e < d.edgeIsDoor.length; e++) {
    if (!d.edgeIsDoor[e]) continue;
    const dist = distToTile(state, Position.x[eid]!, Position.y[eid]!, d.edgeTile[e]!);
    if (dist <= REACH && dist < bestDist) { best = e; bestDist = dist; }
  }
  return best < 0 ? { kind: ConfirmKind.None, index: -1 } : { kind: ConfirmKind.Door, index: best };
}

/** Step 1 (before movement): Confirm actions, revive arbitration, repair and revive progress. */
export function interactSystem(state: SimState, intents: readonly Intent[]): void {
  const targets: Target[] = [];
  for (let pid = 0; pid < state.playerCount; pid++) {
    const it = intentFor(intents, pid);
    if (it.confirmPressed) {
      const c = confirmTarget(state, pid);
      if (c.kind === ConfirmKind.Door) toggleSeal(state, c.index);
    }
    targets.push(it.interactHeld ? interactTarget(state, pid) : NONE);
  }
  // Revive arbitration: keep the current reviver if still trying, else the lowest pid trying.
  for (let other = 0; other < state.playerCount; other++) {
    const o = state.crew[other]!;
    if (Life.state[o] !== LifeState.Downed) continue;
    const trying: number[] = [];
    for (let pid = 0; pid < state.playerCount; pid++) if (targets[pid]!.kind === TargetKind.Revive && targets[pid]!.index === other) trying.push(pid);
    const current = Life.reviverPid[o]!;
    const reviver = trying.includes(current) ? current : (trying[0] ?? -1);
    Life.reviverPid[o] = reviver;
    if (reviver >= 0) {
      Life.reviveProgress[o] = Math.min(1, Life.reviveProgress[o]! + DT / REVIVE_TIME);
      if (Life.reviveProgress[o] >= 1) reviveCrew(state, o);
    } else {
      Life.reviveProgress[o] = Math.max(0, Life.reviveProgress[o]! - DT / REVIVE_TIME);
    }
  }
  // Repair: every holder adds progress.
  for (let pid = 0; pid < state.playerCount; pid++) {
    const t = targets[pid]!;
    if (t.kind === TargetKind.Fire) {
      state.rooms.fireRepair[t.index]! += DT / REPAIR_TIME_FIRE;
      if (state.rooms.fireRepair[t.index]! >= 1) extinguishRoom(state, t.index);
    } else if (t.kind === TargetKind.Breach) {
      state.breaches.repair[t.index]! += DT / REPAIR_TIME_BREACH;
      if (state.breaches.repair[t.index]! >= 1) repairBreach(state, t.index);
    }
  }
}
```

In `step.ts`, the `(1)` block becomes:
```ts
  // (1) input, arbitration, movement, doors
  interactSystem(state, intents);
  movementSystem(state, intents);
  doorSystem(state);
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/interact.test.ts tests/doors.test.ts tests/crew.test.ts`
Expected: all pass. In the "two repairers" test both crew spawn in G, so both target the fire.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim tests/interact.test.ts
git commit -m "feat(sim): reach, interact/confirm targets, revive arbitration, repair and revive progress

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Oxygen injector stub and timer spawner

**Files:**
- Create: `src/renderer/src/sim/hazards/stub.ts`
- Modify: `src/renderer/src/sim/tuning.ts`, `src/renderer/src/sim/state.ts`, `src/renderer/src/sim/step.ts`
- Test: `tests/stub.test.ts`

**Interfaces:**
- Produces (stub.ts): `stubInjection(state): void` (fills `state.injectionScratch` with `STUB_INJECT_FRAC · volume · HAZARD_DT` per room), `stubSpawner(state): void` (step 6), `activeHazardCount(state): number` (burning rooms + active breaches).
- Produces (tuning.ts): `STUB_INJECT_FRAC = 0.03` (fraction of volume per second), `SPAWN_FIRST = 15` (s), `SPAWN_INTERVAL = 30` (s), `SPAWN_JITTER = 0.2`, `SPAWN_CAP = 3`, `SPAWN_FIRE_WEIGHT = 0.6`.
- Modifies (state.ts): `spawner.nextSpawnTick` starts at `SPAWN_FIRST · TICK_HZ`.

RNG assignment (spec §4 rule 2): `director` for timing jitter and hazard type; `hazards` for the target room or site.

- [ ] **Step 1: Write the failing tests**

`tests/stub.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { activeHazardCount, stubSpawner } from '../src/renderer/src/sim/hazards/stub';
import { burningRoomCount, igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activeBreachCount } from '../src/renderer/src/sim/hazards/breach';
import { totalO2 } from '../src/renderer/src/sim/hazards/oxygen';
import { SPAWN_FIRST, SPAWN_INTERVAL, SPAWN_CAP, SPAWN_JITTER } from '../src/renderer/src/sim/tuning';
import { makeState, run, seconds } from './helpers/sim';

describe('stub injector and spawner', () => {
  it('keeps a quiet ship full of oxygen', () => {
    const s = makeState(2);
    s.spawner.nextSpawnTick = 1e9;
    run(s, seconds(60));
    expect(totalO2(s)).toBeGreaterThan(0.99 * Array.from(s.derived.volume).reduce((a, b) => a + b, 0));
    expect(s.o2Counters.injected).toBeGreaterThan(0);
  });
  it('spawns the first hazard after SPAWN_FIRST', () => {
    const s = makeState(2);
    run(s, seconds(SPAWN_FIRST) - 1);
    expect(activeHazardCount(s)).toBe(0);
    run(s, 2);
    expect(activeHazardCount(s)).toBe(1);
    expect(burningRoomCount(s) + activeBreachCount(s)).toBe(activeHazardCount(s));
  });
  it('the spawner skips a spawn while the cap is full (fire spread is not capped)', () => {
    const s = makeState(0);
    for (let r = 0; r < SPAWN_CAP; r++) igniteRoom(s, r);
    s.spawner.nextSpawnTick = s.tick;
    stubSpawner(s);
    expect(activeHazardCount(s)).toBe(SPAWN_CAP);
    expect(s.spawner.nextSpawnTick).toBeGreaterThan(s.tick);   // the timer still advances
    expect(s.spawner.nextSpawnTick).toBeGreaterThanOrEqual(s.tick + Math.round(SPAWN_INTERVAL * 60 * (1 - SPAWN_JITTER)));
    expect(s.spawner.nextSpawnTick).toBeLessThanOrEqual(s.tick + Math.round(SPAWN_INTERVAL * 60 * (1 + SPAWN_JITTER)));
  });
  it('spawn sequence is deterministic per seed and differs between seeds', () => {
    const a = makeState(2, 7), b = makeState(2, 7), c = makeState(2, 8);
    run(a, seconds(120)); run(b, seconds(120)); run(c, seconds(120));
    expect(Array.from(a.rooms.fire)).toEqual(Array.from(b.rooms.fire));
    expect(Array.from(a.breaches.active)).toEqual(Array.from(b.breaches.active));
    const same = Array.from(a.rooms.fire).every((f, i) => (f > 0) === (c.rooms.fire[i]! > 0))
      && Array.from(a.breaches.active).every((v, i) => v === c.breaches.active[i]);
    expect(same).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/stub.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Append to `src/renderer/src/sim/tuning.ts`:
```ts
export const STUB_INJECT_FRAC = 0.03;   // increment 1 only: always-on injector, fraction of room volume per second
export const SPAWN_FIRST = 15;          // seconds until the first stub hazard
export const SPAWN_INTERVAL = 30;       // seconds between stub hazards
export const SPAWN_JITTER = 0.2;        // ±fraction of the interval
export const SPAWN_CAP = 3;             // max simultaneous fires + breaches
export const SPAWN_FIRE_WEIGHT = 0.6;   // probability a spawn is a fire rather than a breach
```

`src/renderer/src/sim/hazards/stub.ts`:
```ts
import type { SimState } from '../state';
import { chance, nextFloat, nextInt } from '../../../../shared/rng';
import { igniteRoom, burningRoomCount } from './fire';
import { activateBreach, activeBreachCount, freeSites } from './breach';
import { HAZARD_DT, TICK_HZ, STUB_INJECT_FRAC, SPAWN_INTERVAL, SPAWN_JITTER, SPAWN_CAP, SPAWN_FIRE_WEIGHT } from '../tuning';

/** Increment 1 stand-in for Life Support: every room is injected at a flat rate (oxygen.ts skips breached rooms). */
export function stubInjection(state: SimState): void {
  const V = state.derived.volume;
  for (let r = 0; r < V.length; r++) state.injectionScratch[r] = STUB_INJECT_FRAC * V[r]! * HAZARD_DT;
}

export function activeHazardCount(state: SimState): number {
  return burningRoomCount(state) + activeBreachCount(state);
}

/** Increment 1 stand-in for the director: a jittered timer that spawns a fire or a breach up to SPAWN_CAP. */
export function stubSpawner(state: SimState): void {
  if (state.tick < state.spawner.nextSpawnTick) return;
  const jitter = 1 + SPAWN_JITTER * (2 * nextFloat(state.rng.director) - 1);
  state.spawner.nextSpawnTick = state.tick + Math.round(SPAWN_INTERVAL * TICK_HZ * jitter);
  if (activeHazardCount(state) >= SPAWN_CAP) return;
  if (chance(state.rng.director, SPAWN_FIRE_WEIGHT)) {
    const candidates: number[] = [];
    for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r] === 0) candidates.push(r);
    if (candidates.length) igniteRoom(state, candidates[nextInt(state.rng.hazards, candidates.length)]!);
  } else {
    const sites = freeSites(state);
    if (sites.length) activateBreach(state, sites[nextInt(state.rng.hazards, sites.length)]!);
  }
}
```

In `state.ts`: import `SPAWN_FIRST, TICK_HZ` from `./tuning` and set `spawner: { nextSpawnTick: SPAWN_FIRST * TICK_HZ }`.

In `step.ts`: before `oxygenStep(...)` inside the hazard block call `stubInjection(state);`, and replace the `(6)` comment with `stubSpawner(state);`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: all pass. The `state.test.ts` determinism tests still hold because the spawner draws only from seeded streams.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim tests/stub.test.ts
git commit -m "feat(sim): always-on oxygen injector stub and seeded timer spawner

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Snapshots with a versioned header, and the determinism properties

**Files:**
- Create: `src/renderer/src/sim/snapshot.ts`
- Test: `tests/snapshot.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface SnapshotHeader { formatVersion: number; simVersion: number; tick: number; rngStates: Record<string, number>; layoutId: string; layoutHash: string; playerCount: number; manifest: string[] }
  interface Snapshot { header: SnapshotHeader; values: number[] }
  SNAPSHOT_FORMAT = 1
  saveSnapshot(state): Snapshot                              // JSON-safe
  loadSnapshot(layout: ShipLayout, snap: Snapshot): SimState // throws on format/sim version or layout mismatch
  ```

- [ ] **Step 1: Write the failing tests**

`tests/snapshot.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { saveSnapshot, loadSnapshot } from '../src/renderer/src/sim/snapshot';
import { hashState } from '../src/renderer/src/sim/hash';
import { flatten } from '../src/renderer/src/sim/flatten';
import { step } from '../src/renderer/src/sim/step';
import { Position } from '../src/renderer/src/sim/components';
import { NEUTRAL_INTENT, type Intent } from '../src/shared/intent';
import { LAYOUT, makeState, intents, run } from './helpers/sim';

const arbIntent = fc.record<Intent>({
  moveX: fc.double({ min: -2, max: 2, noNaN: false }), moveY: fc.double({ min: -2, max: 2, noNaN: false }),
  interactHeld: fc.boolean(), interactPressed: fc.boolean(), confirmPressed: fc.boolean(), cancelPressed: fc.boolean()
});
const arbScript = (players: number) => fc.array(fc.array(arbIntent, { minLength: players, maxLength: players }), { minLength: 1, maxLength: 400 });

describe('snapshot', () => {
  it('round-trip is identity', () => {
    const s = makeState(3, 11);
    run(s, 200, () => intents({ moveX: 1 }, { moveY: -1 }, { interactHeld: true }));
    const snap = JSON.parse(JSON.stringify(saveSnapshot(s)));
    const t = loadSnapshot(LAYOUT, snap);
    expect(hashState(t)).toBe(hashState(s));
    expect(saveSnapshot(t)).toEqual(snap);
  });
  it('rejects a mismatched layout or format', () => {
    const snap = saveSnapshot(makeState(2));
    expect(() => loadSnapshot(LAYOUT, { ...snap, header: { ...snap.header, layoutHash: 'deadbeef' } })).toThrow(/layout/);
    expect(() => loadSnapshot(LAYOUT, { ...snap, header: { ...snap.header, formatVersion: 99 } })).toThrow(/format/);
  });
  it('property: same seed and intents give the same hash', () => {
    fc.assert(fc.property(fc.integer(), arbScript(2), (seed, script) => {
      const a = makeState(2, seed), b = makeState(2, seed);
      for (const tick of script) { step(a, tick); step(b, tick); }
      expect(hashState(a)).toBe(hashState(b));
    }), { numRuns: 50 });
  });
  it('property: save at tick N, load, continue equals an uninterrupted run', () => {
    fc.assert(fc.property(fc.integer(), arbScript(2), fc.nat(), (seed, script, nRaw) => {
      const n = nRaw % script.length;
      const whole = makeState(2, seed);
      for (const tick of script) step(whole, tick);
      const first = makeState(2, seed);
      for (let i = 0; i < n; i++) step(first, script[i]!);
      const resumed = loadSnapshot(LAYOUT, JSON.parse(JSON.stringify(saveSnapshot(first))));
      for (let i = n; i < script.length; i++) step(resumed, script[i]!);
      expect(hashState(resumed)).toBe(hashState(whole));
    }), { numRuns: 50 });
  });
  it('property: fuzzed intents never produce NaN or out-of-range values', () => {
    fc.assert(fc.property(fc.integer(), arbScript(4), (seed, script) => {
      const s = makeState(4, seed);
      for (const tick of script) step(s, tick);
      for (const v of flatten(s)) expect(Number.isFinite(v)).toBe(true);
      for (let r = 0; r < s.rooms.o2.length; r++) { expect(s.rooms.o2[r]).toBeGreaterThanOrEqual(0); expect(s.rooms.o2[r]).toBeLessThanOrEqual(s.derived.volume[r]! + 1e-9); }
      for (const eid of s.crew) {
        expect(Position.x[eid]).toBeGreaterThan(0); expect(Position.x[eid]).toBeLessThan(s.derived.width);
        expect(Position.y[eid]).toBeGreaterThan(0); expect(Position.y[eid]).toBeLessThan(s.derived.height);
      }
    }), { numRuns: 50 });
  });
  it('neutral intents are accepted when the array is short', () => {
    const s = makeState(4);
    step(s, [NEUTRAL_INTENT]);
    expect(s.tick).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/snapshot.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/renderer/src/sim/snapshot.ts`:
```ts
import type { ShipLayout } from './ship/schema';
import { createSimState, STREAM_NAMES, type SimState } from './state';
import { flatten, unflatten, FLATTEN_MANIFEST } from './flatten';
import { SIM_VERSION } from './tuning';

export const SNAPSHOT_FORMAT = 1;

export interface SnapshotHeader {
  formatVersion: number; simVersion: number; tick: number;
  rngStates: Record<string, number>;
  layoutId: string; layoutHash: string; playerCount: number; manifest: string[];
}
export interface Snapshot { header: SnapshotHeader; values: number[] }

export function saveSnapshot(state: SimState): Snapshot {
  const rngStates: Record<string, number> = {};
  for (const n of STREAM_NAMES) rngStates[n] = state.rng[n].s;
  return {
    header: {
      formatVersion: SNAPSHOT_FORMAT, simVersion: SIM_VERSION, tick: state.tick, rngStates,
      layoutId: state.layout.id, layoutHash: state.derived.layoutHash, playerCount: state.playerCount, manifest: [...FLATTEN_MANIFEST]
    },
    values: Array.from(flatten(state))
  };
}

/** Derived tables are rebuilt from `layout`; the header's layout hash guarantees both sides rebuilt the same data (spec §4). */
export function loadSnapshot(layout: ShipLayout, snap: Snapshot): SimState {
  const h = snap.header;
  if (h.formatVersion !== SNAPSHOT_FORMAT) throw new Error(`snapshot format ${h.formatVersion} not supported (expected ${SNAPSHOT_FORMAT})`);
  if (h.simVersion !== SIM_VERSION) throw new Error(`snapshot sim version ${h.simVersion} does not match ${SIM_VERSION}`);
  const state = createSimState(layout, h.playerCount, 0);
  if (h.layoutId !== layout.id || h.layoutHash !== state.derived.layoutHash) throw new Error('snapshot layout does not match the loaded ship layout');
  unflatten(state, Float64Array.from(snap.values));
  return state;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/snapshot.test.ts`
Expected: 6 passed. If the fuzz test fails on `Position` bounds, the cause is movement with `clampIntent` not applied somewhere; `intentFor` must be used for every read of an intent.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/snapshot.ts tests/snapshot.test.ts
git commit -m "feat(sim): versioned snapshots and fast-check determinism properties

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Replays, golden replay test, bless script, bitECS spike record

**Files:**
- Create: `src/renderer/src/sim/replay.ts`, `tests/helpers/script.ts`, `tests/golden.test.ts`, `tests/golden/basic.json`, `scripts/bless-golden.ts`, `tests/spike-bitecs.test.ts`, `docs/spikes.md`
- Modify: `package.json` (`bless` script)

**Interfaces:**
- Produces (replay.ts):
  ```ts
  type CompactIntent = [number, number, number];   // moveX, moveY, flags (1 held, 2 interactPressed, 4 confirmPressed, 8 cancelPressed)
  interface Replay { version: number; seed: number; playerCount: number; layoutId: string; intents: CompactIntent[][] }  // intents[tick][pid]
  encodeIntent(i: Intent): CompactIntent; decodeIntent(c: CompactIntent): Intent
  runReplay(layout, replay, every = 60): { hashes: string[]; finalHash: string }  // hashes at ticks 60, 120, ...
  ```
- Produces (tests/helpers/script.ts): `scriptedReplay(seed, playerCount, ticks): Replay` (a deterministic walking/repairing pattern, no RNG).

- [ ] **Step 1: Write the failing test and the script helper**

`tests/helpers/script.ts`:
```ts
import type { Replay, CompactIntent } from '../../src/renderer/src/sim/replay';

/** Deterministic exercise pattern: each player walks a square and holds Interact every other 5 s window. */
export function scriptedReplay(seed: number, playerCount: number, ticks: number): Replay {
  const intents: CompactIntent[][] = [];
  for (let t = 0; t < ticks; t++) {
    const row: CompactIntent[] = [];
    for (let p = 0; p < playerCount; p++) {
      const phase = Math.floor((t + p * 45) / 90) % 4;
      const dir: [number, number] = phase === 0 ? [1, 0] : phase === 1 ? [0, -1] : phase === 2 ? [-1, 0] : [0, 1];
      const hold = Math.floor(t / 300) % 2 === 0 ? 1 : 0;
      const confirm = t % 600 === p * 7 ? 4 : 0;
      row.push([dir[0], dir[1], hold | confirm]);
    }
    intents.push(row);
  }
  return { version: 1, seed, playerCount, layoutId: 'starter', intents };
}
```

`tests/golden.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { runReplay, encodeIntent, decodeIntent } from '../src/renderer/src/sim/replay';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { LAYOUT } from './helpers/sim';
import { scriptedReplay } from './helpers/script';

const GOLDEN = 'tests/golden/basic.json';

describe('replay', () => {
  it('encode/decode round-trips an intent', () => {
    const i = { ...NEUTRAL_INTENT, moveX: 0.5, interactPressed: true, cancelPressed: true };
    expect(decodeIntent(encodeIntent(i))).toEqual(i);
  });
  it('matches the golden hashes (run `npm run bless` to update deliberately)', () => {
    expect(existsSync(GOLDEN)).toBe(true);
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { replay: ReturnType<typeof scriptedReplay>; hashes: string[]; finalHash: string };
    const result = runReplay(LAYOUT, golden.replay);
    const firstDiff = result.hashes.findIndex((h, i) => h !== golden.hashes[i]);
    expect(firstDiff, `first divergence at tick ${(firstDiff + 1) * 60}`).toBe(-1);
    expect(result.finalHash).toBe(golden.finalHash);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/golden.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement replay and the bless script**

`src/renderer/src/sim/replay.ts`:
```ts
import type { Intent } from '../../../shared/intent';
import type { ShipLayout } from './ship/schema';
import { createSimState } from './state';
import { step } from './step';
import { hashState } from './hash';

export type CompactIntent = [number, number, number];
export interface Replay { version: number; seed: number; playerCount: number; layoutId: string; intents: CompactIntent[][] }

export function encodeIntent(i: Intent): CompactIntent {
  return [i.moveX, i.moveY, (i.interactHeld ? 1 : 0) | (i.interactPressed ? 2 : 0) | (i.confirmPressed ? 4 : 0) | (i.cancelPressed ? 8 : 0)];
}
export function decodeIntent(c: CompactIntent): Intent {
  return { moveX: c[0], moveY: c[1], interactHeld: !!(c[2] & 1), interactPressed: !!(c[2] & 2), confirmPressed: !!(c[2] & 4), cancelPressed: !!(c[2] & 8) };
}

/** Headless replay. Hashes every `every` ticks localize a divergence; the final hash is the verdict (spec §10). */
export function runReplay(layout: ShipLayout, replay: Replay, every = 60): { hashes: string[]; finalHash: string } {
  if (replay.layoutId !== layout.id) throw new Error(`replay is for layout ${replay.layoutId}, loaded ${layout.id}`);
  const state = createSimState(layout, replay.playerCount, replay.seed);
  const hashes: string[] = [];
  for (let t = 0; t < replay.intents.length; t++) {
    step(state, replay.intents[t]!.map(decodeIntent));
    if ((t + 1) % every === 0) hashes.push(hashState(state));
  }
  return { hashes, finalHash: hashState(state) };
}
```

`scripts/bless-golden.ts`:
```ts
import { writeFileSync, mkdirSync } from 'node:fs';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { runReplay } from '../src/renderer/src/sim/replay';
import { scriptedReplay } from '../tests/helpers/script';

const layout = parseShip(starter);
const replay = scriptedReplay(2026, 4, 60 * 120);   // 2 minutes, 4 players
const { hashes, finalHash } = runReplay(layout, replay);
mkdirSync('tests/golden', { recursive: true });
writeFileSync('tests/golden/basic.json', JSON.stringify({ replay, hashes, finalHash }));
console.log(`blessed tests/golden/basic.json: ${hashes.length} checkpoints, final ${finalHash}`);
```

In `package.json` set `"bless": "tsx scripts/bless-golden.ts"`.

- [ ] **Step 4: Bless and run**

Run: `npm run bless && npx vitest run tests/golden.test.ts`
Expected: `blessed tests/golden/basic.json: 120 checkpoints, final ...`, then 2 passed. Run `npm run bless` again and `git status` must show `tests/golden/basic.json` unchanged (blessing is itself deterministic).

- [ ] **Step 5: bitECS spike record**

`tests/spike-bitecs.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createWorld, createEntityIndex, addEntity, removeEntity, entityExists, addComponent, query } from 'bitecs';

// Spec §11 spike: record how bitECS 0.4.0 recycles ids. Our sim never relies on raw ids across removal
// (StableId is ours), so this test documents behaviour rather than gating on it.
describe('bitecs 0.4.0 behaviour (spike)', () => {
  it('recycles removed entity ids and reports them non-existent until re-added', () => {
    const world = createWorld(createEntityIndex());
    const C = { v: [] as number[] };
    const ids = [addEntity(world), addEntity(world), addEntity(world)];
    for (const id of ids) { addComponent(world, id, C); C.v[id] = id * 10; }
    removeEntity(world, ids[1]!);
    expect(entityExists(world, ids[1]!)).toBe(false);
    const again = addEntity(world);
    // Record the result in docs/spikes.md: is `again` === ids[1] (immediate recycling)?
    console.log(`bitecs recycled id: ${again === ids[1]}`);
    expect(query(world, [C]).length).toBe(2);
  });
  it('measures snapshot size and hash time for the record (spec §11 spike criterion)', () => {
    const s = makeState(4, 1);
    const bytes = flatten(s).byteLength;
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) hashState(s);
    const perHashMs = (performance.now() - t0) / 1000;
    console.log(`snapshot ${bytes} bytes, hashState ${perHashMs.toFixed(4)} ms`);
    expect(bytes).toBeLessThan(4096);
    expect(perHashMs).toBeLessThan(1);   // well under a 16 ms frame
  });
});
```
Add `import { makeState } from './helpers/sim'; import { flatten } from '../src/renderer/src/sim/flatten'; import { hashState } from '../src/renderer/src/sim/hash';` at the top. (Tests may use `performance.now`; only `sim/` and `shared/` are banned from it.)

Run: `npx vitest run tests/spike-bitecs.test.ts` and write `docs/spikes.md` (append to the licence section from Task 1):
```markdown
## bitECS 0.4.0 entity recycling (Task 15)

- `createEntityIndex()` without versioning; `withVersioning()` was found unreliable under churn in the previous project.
- Removed ids are recycled: <immediately | later> (from the spike test console output).
- Decision: crew are the only entities in increments 0-1 and are never removed. `StableId` (sim-owned, monotonic) is the only id the renderer or snapshots use. Snapshots use our own `flatten()`; `bitecs/serialization` was not adopted because it has no header versioning (spec §4 rule 6).
- Measured (from the spike test's console output): snapshot size <N> bytes for 4 players on the starter ship; `hashState` <N> ms per call.

## Ship format decisions (Task 4)

- The spec's `defaultOpen` and `"space"` edges are not in the format: every door starts Closed and opens on approach, and the only edges to space are active breaches on `breachSites`.
- Debris (increment 2a) will be the first churned entities; re-run this spike then.

## bitECS query ordering (Task 15)

- Not relied on: every system iterates `state.crew` by PlayerId or arrays by index (spec §4 rule 4).
```
Fill in the `<immediately | later>` from the console output.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/sim/replay.ts tests scripts docs/spikes.md package.json
git commit -m "feat(sim): replays with golden hashes, bless script, bitECS spike record

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Accumulator loop and InputFrame → Intent with an edge queue

**Files:**
- Create: `src/renderer/src/app/loop.ts`, `src/renderer/src/app/intents.ts`
- Test: `tests/loop.test.ts`, `tests/intents.test.ts`

**Interfaces:**
- Produces (loop.ts): `MAX_TICKS_PER_FRAME = 5`, `stepAccumulator(accumulator: number, frameDelta: number): { ticks: number; accumulator: number }` (clamps to `MAX_TICKS_PER_FRAME` and discards the remainder when clamped: slow motion, never catch-up).
- Produces (intents.ts):
  ```ts
  interface InputFrame { moveX: number; moveY: number; interactHeld: boolean; interactPresses: number; confirmPresses: number; cancelPresses: number }  // presses = edges since last poll
  const NEUTRAL_FRAME: InputFrame
  createIntentFeed(playerCount: number): { beginFrame(frames: readonly InputFrame[]): void; tick(): Intent[] }
  ```
  `beginFrame` stores held values and ORs press edges into a pending set. `tick()` returns intents with held values and the pending edges, then clears the pending set, so each edge is delivered on exactly one tick: the first tick after it arrived, even if that tick is in a later frame.

- [ ] **Step 1: Write the failing tests**

`tests/loop.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { stepAccumulator, MAX_TICKS_PER_FRAME } from '../src/renderer/src/app/loop';
import { DT } from '../src/renderer/src/sim/tuning';
import { hashState } from '../src/renderer/src/sim/hash';
import { step } from '../src/renderer/src/sim/step';
import { makeState, intents } from './helpers/sim';

describe('stepAccumulator', () => {
  it('yields one tick per DT and keeps the remainder', () => {
    const r = stepAccumulator(0, DT * 2.5);
    expect(r.ticks).toBe(2); expect(r.accumulator).toBeCloseTo(DT * 0.5, 9);
  });
  it('clamps a long frame and discards the backlog', () => {
    const r = stepAccumulator(0, 1.0);
    expect(r.ticks).toBe(MAX_TICKS_PER_FRAME); expect(r.accumulator).toBe(0);
  });
  it('property: batching ticks into different frame sizes gives identical sim results', () => {
    const script = Array.from({ length: 300 }, (_, t) => intents({ moveX: t % 2 ? 1 : 0, interactHeld: t % 7 === 0 }, { moveY: -1 }));
    const direct = makeState(2, 5);
    for (const i of script) step(direct, i);
    for (const frame of [DT, DT * 2, DT * 3.3, DT * 4.9]) {
      const s = makeState(2, 5);
      let acc = 0, t = 0;
      while (t < script.length) {
        const r = stepAccumulator(acc, frame); acc = r.accumulator;
        for (let k = 0; k < r.ticks && t < script.length; k++) step(s, script[t++]!);
      }
      expect(hashState(s)).toBe(hashState(direct));
    }
  });
});
```

`tests/intents.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createIntentFeed, NEUTRAL_FRAME } from '../src/renderer/src/app/intents';

describe('intent feed', () => {
  it('copies held values into every tick of a batch and delivers an edge once', () => {
    const feed = createIntentFeed(1);
    feed.beginFrame([{ ...NEUTRAL_FRAME, moveX: 1, interactHeld: true, interactPresses: 1 }]);
    const t1 = feed.tick(), t2 = feed.tick(), t3 = feed.tick();
    expect(t1[0]!.interactPressed).toBe(true); expect(t2[0]!.interactPressed).toBe(false); expect(t3[0]!.interactPressed).toBe(false);
    expect(t1[0]!.moveX).toBe(1); expect(t3[0]!.moveX).toBe(1); expect(t3[0]!.interactHeld).toBe(true);
  });
  it('queues an edge from a frame that produced no tick until the next tick', () => {
    const feed = createIntentFeed(1);
    feed.beginFrame([{ ...NEUTRAL_FRAME, confirmPresses: 1 }]);   // no tick() this frame
    feed.beginFrame([{ ...NEUTRAL_FRAME }]);
    const t = feed.tick();
    expect(t[0]!.confirmPressed).toBe(true);
    expect(feed.tick()[0]!.confirmPressed).toBe(false);
  });
  it('a tap (press and release inside one frame) still delivers the pressed edge', () => {
    const feed = createIntentFeed(1);
    feed.beginFrame([{ ...NEUTRAL_FRAME, interactHeld: false, interactPresses: 1 }]);
    const t = feed.tick();
    expect(t[0]!.interactPressed).toBe(true); expect(t[0]!.interactHeld).toBe(false);
  });
  it('missing players are neutral', () => {
    const feed = createIntentFeed(2);
    feed.beginFrame([{ ...NEUTRAL_FRAME, moveY: 1 }]);
    const t = feed.tick();
    expect(t).toHaveLength(2); expect(t[1]!.moveY).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/loop.test.ts tests/intents.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/renderer/src/app/loop.ts`:
```ts
import { DT } from '../sim/tuning';

export const MAX_TICKS_PER_FRAME = 5;

/** Fixed-timestep accumulator. On a long frame the backlog is discarded: slow motion, not catch-up (spec §8). */
export function stepAccumulator(accumulator: number, frameDelta: number): { ticks: number; accumulator: number } {
  let acc = accumulator + frameDelta, ticks = 0;
  while (acc >= DT && ticks < MAX_TICKS_PER_FRAME) { acc -= DT; ticks++; }
  if (ticks === MAX_TICKS_PER_FRAME) acc = 0;
  return { ticks, accumulator: acc };
}
```

`src/renderer/src/app/intents.ts`:
```ts
import { NEUTRAL_INTENT, type Intent } from '../../../shared/intent';

export interface InputFrame {
  moveX: number; moveY: number; interactHeld: boolean;
  interactPresses: number; confirmPresses: number; cancelPresses: number;
}
export const NEUTRAL_FRAME: Readonly<InputFrame> = Object.freeze({ moveX: 0, moveY: 0, interactHeld: false, interactPresses: 0, confirmPresses: 0, cancelPresses: 0 });

/** Turns per-frame device snapshots into per-tick intents. Each press edge is delivered on exactly one tick (spec §6). */
export function createIntentFeed(playerCount: number) {
  const held: InputFrame[] = Array.from({ length: playerCount }, () => ({ ...NEUTRAL_FRAME }));
  const pending = Array.from({ length: playerCount }, () => ({ interact: false, confirm: false, cancel: false }));
  return {
    beginFrame(frames: readonly InputFrame[]): void {
      for (let p = 0; p < playerCount; p++) {
        const f = frames[p] ?? NEUTRAL_FRAME;
        held[p] = { ...f };
        if (f.interactPresses > 0) pending[p]!.interact = true;
        if (f.confirmPresses > 0) pending[p]!.confirm = true;
        if (f.cancelPresses > 0) pending[p]!.cancel = true;
      }
    },
    tick(): Intent[] {
      const out: Intent[] = [];
      for (let p = 0; p < playerCount; p++) {
        const h = held[p]!, e = pending[p]!;
        out.push({ ...NEUTRAL_INTENT, moveX: h.moveX, moveY: h.moveY, interactHeld: h.interactHeld, interactPressed: e.interact, confirmPressed: e.confirm, cancelPressed: e.cancel });
        e.interact = e.confirm = e.cancel = false;
      }
      return out;
    }
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/loop.test.ts tests/intents.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/app tests/loop.test.ts tests/intents.test.ts
git commit -m "feat(app): fixed-step accumulator with backlog discard and edge-queued intent feed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: DeviceManager (press-to-join, disconnect, reclaim) and device sources

**Files:**
- Create: `src/renderer/src/input/deviceManager.ts`, `src/renderer/src/input/sources.ts`
- Test: `tests/deviceManager.test.ts`

**Interfaces:**
- Produces (deviceManager.ts):
  ```ts
  interface SourceSample {
    key: string; moveX: number; moveY: number;
    interact: boolean; confirm: boolean; cancel: boolean;                 // currently held (truthful, never faked)
    presses?: { interact: number; confirm: number; cancel: number };      // press edges since the last sample, when the device can count them
  }
  type SlotStatus = 'empty' | 'active' | 'reconnect';
  interface SlotInfo { status: SlotStatus; key: string | null }
  createDeviceManager(maxPlayers = MAX_PLAYERS): {
    update(samples: readonly SourceSample[], allowJoin: boolean): { frames: InputFrame[]; slots: SlotInfo[]; joinedCount: number };
    reset(): void;
  }
  ```
  Rules (spec §6): a press of `interact` on an unassigned device joins the lowest `reconnect` slot if any, else (only when `allowJoin`) the lowest `empty` slot. A slot whose device key is absent from `samples` becomes `reconnect` and its frame is neutral. Presses come from `sample.presses` when the device counts its own edges (keyboard: `keydown` events since the last poll, so a tap or a release-and-repress between polls is never lost); otherwise they are derived as rising edges against the previous sample of that key (gamepads). A key that disappears forgets its edge history.
- Produces (sources.ts, browser only, not unit-tested): `radialDeadzone(x, y, dz): { x, y }`, `createKeyboardSources(target: Window): { sample(): SourceSample[]; destroy(): void }` (two clusters, keys `kb:0` and `kb:1`, cleared on `blur`), `sampleGamepads(): SourceSample[]` (keys `gp:<index>`), `DEADZONE = 0.2`.

Default bindings: cluster 0 = WASD, `KeyE` interact, `KeyF` confirm, `KeyQ` cancel; cluster 1 = arrows, `Enter` interact, `ShiftRight` confirm, `Backspace` cancel. Gamepad: left stick or d-pad (12-15) move, button 0 interact, button 2 confirm, button 1 cancel.

- [ ] **Step 1: Write the failing tests**

`tests/deviceManager.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createDeviceManager, type SourceSample } from '../src/renderer/src/input/deviceManager';

const s = (key: string, o: Partial<SourceSample> = {}): SourceSample => ({ key, moveX: 0, moveY: 0, interact: false, confirm: false, cancel: false, ...o });

describe('DeviceManager', () => {
  it('joins on an interact press in the lobby, in order', () => {
    const dm = createDeviceManager(4);
    let r = dm.update([s('kb:0'), s('gp:0')], true);
    expect(r.joinedCount).toBe(0);
    r = dm.update([s('kb:0'), s('gp:0', { interact: true })], true);
    expect(r.slots[0]).toEqual({ status: 'active', key: 'gp:0' });
    expect(r.frames[0]!.interactPresses).toBe(1);   // the joining press is also delivered
    r = dm.update([s('kb:0', { interact: true }), s('gp:0', { interact: true })], true);
    expect(r.slots[1]).toEqual({ status: 'active', key: 'kb:0' });
    expect(r.frames[0]!.interactPresses).toBe(0);   // held, not a new edge
    expect(r.joinedCount).toBe(2);
  });
  it('does not join during a run', () => {
    const dm = createDeviceManager(4);
    const r = dm.update([s('gp:0', { interact: true })], false);
    expect(r.joinedCount).toBe(0);
  });
  it('routes held values and press edges to the right player', () => {
    const dm = createDeviceManager(2);
    dm.update([s('a', { interact: true })], true);
    dm.update([s('a'), s('b', { interact: true })], true);
    const r = dm.update([s('a', { moveX: 0.5 }), s('b', { confirm: true, cancel: true })], false);
    expect(r.frames[0]!.moveX).toBe(0.5);
    expect(r.frames[1]!.confirmPresses).toBe(1); expect(r.frames[1]!.cancelPresses).toBe(1);
  });
  it('a disconnected device leaves its slot in reconnect with a neutral frame, and any press on a free device reclaims it', () => {
    const dm = createDeviceManager(2);
    dm.update([s('a', { interact: true })], true);
    dm.update([s('a'), s('b', { interact: true })], true);
    let r = dm.update([s('b', { moveX: 1 })], false);         // 'a' vanished
    expect(r.slots[0]).toEqual({ status: 'reconnect', key: null });
    expect(r.frames[0]!.moveX).toBe(0);
    r = dm.update([s('b'), s('c', { confirm: true })], false); // new pad reclaims slot 0 even mid-run
    expect(r.slots[0]).toEqual({ status: 'active', key: 'c' });
    expect(r.frames[0]!.confirmPresses).toBe(1);
  });
  it('a device that reconnects while holding a button emits a fresh edge', () => {
    const dm = createDeviceManager(1);
    dm.update([s('a', { interact: true })], true);
    dm.update([], false);
    const r = dm.update([s('a', { interact: true })], false);
    expect(r.slots[0]!.status).toBe('active');
    expect(r.frames[0]!.interactPresses).toBe(1);
  });
  it('uses counted presses from a device that reports them, without faking held state', () => {
    const dm = createDeviceManager(1);
    dm.update([s('kb:0', { presses: { interact: 1, confirm: 0, cancel: 0 } })], true);   // tap between polls joins
    let r = dm.update([s('kb:0', { interact: true, presses: { interact: 2, confirm: 0, cancel: 0 } })], false);
    expect(r.frames[0]!.interactPresses).toBe(2);   // release-and-repress between polls is not lost
    expect(r.frames[0]!.interactHeld).toBe(true);
    r = dm.update([s('kb:0', { presses: { interact: 1, confirm: 0, cancel: 0 } })], false);
    expect(r.frames[0]!.interactPresses).toBe(1); expect(r.frames[0]!.interactHeld).toBe(false);   // a tap: pressed, not held
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/deviceManager.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/renderer/src/input/deviceManager.ts`:
```ts
import { MAX_PLAYERS } from '../../../shared/intent';
import { NEUTRAL_FRAME, type InputFrame } from '../app/intents';

export interface SourceSample {
  key: string; moveX: number; moveY: number;
  interact: boolean; confirm: boolean; cancel: boolean;
  presses?: { interact: number; confirm: number; cancel: number };
}
export type SlotStatus = 'empty' | 'active' | 'reconnect';
export interface SlotInfo { status: SlotStatus; key: string | null }

/** Device-to-player mapping (spec §6). Pure: feed it samples, get frames. Device polling lives in sources.ts. */
export function createDeviceManager(maxPlayers = MAX_PLAYERS) {
  let slots: SlotInfo[] = [];
  let prev = new Map<string, SourceSample>();
  const reset = (): void => { slots = Array.from({ length: maxPlayers }, () => ({ status: 'empty', key: null })); prev = new Map(); };
  reset();

  const edges = (cur: SourceSample): { interact: number; confirm: number; cancel: number } => {
    if (cur.presses) return cur.presses;   // the device counted its own edges (keyboard)
    const p = prev.get(cur.key);
    return {
      interact: cur.interact && !(p?.interact ?? false) ? 1 : 0,
      confirm: cur.confirm && !(p?.confirm ?? false) ? 1 : 0,
      cancel: cur.cancel && !(p?.cancel ?? false) ? 1 : 0
    };
  };

  return {
    reset,
    update(samples: readonly SourceSample[], allowJoin: boolean) {
      const present = new Map(samples.map((x) => [x.key, x] as const));
      // Disconnects.
      for (const slot of slots) if (slot.status === 'active' && !present.has(slot.key!)) { slot.status = 'reconnect'; slot.key = null; }
      const assigned = new Set(slots.map((x) => x.key).filter((k): k is string => k !== null));
      // Joins and reclaims, in sample order.
      for (const smp of samples) {
        if (assigned.has(smp.key)) continue;
        const e = edges(smp);
        if (!(e.interact || e.confirm || e.cancel)) continue;
        let target = slots.findIndex((x) => x.status === 'reconnect');
        if (target < 0 && allowJoin && e.interact) target = slots.findIndex((x) => x.status === 'empty');
        if (target < 0) continue;
        slots[target] = { status: 'active', key: smp.key }; assigned.add(smp.key);
      }
      // Frames.
      const frames: InputFrame[] = slots.map((slot) => {
        if (slot.status !== 'active') return { ...NEUTRAL_FRAME };
        const smp = present.get(slot.key!)!, e = edges(smp);
        return { moveX: smp.moveX, moveY: smp.moveY, interactHeld: smp.interact, interactPresses: e.interact, confirmPresses: e.confirm, cancelPresses: e.cancel };
      });
      prev = present; // keys that vanished forget their history, so a reconnect emits a fresh edge
      return { frames, slots: slots.map((x) => ({ ...x })), joinedCount: slots.filter((x) => x.status !== 'empty').length };
    }
  };
}
```

`src/renderer/src/input/sources.ts`:
```ts
import type { SourceSample } from './deviceManager';

export const DEADZONE = 0.2;

export function radialDeadzone(x: number, y: number, dz: number): { x: number; y: number } {
  const len = Math.sqrt(x * x + y * y);
  if (len < dz) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - dz) / (1 - dz)) / len;
  return { x: x * scaled, y: y * scaled };
}

const CLUSTERS = [
  { key: 'kb:0', up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', interact: 'KeyE', confirm: 'KeyF', cancel: 'KeyQ' },
  { key: 'kb:1', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', interact: 'Enter', confirm: 'ShiftRight', cancel: 'Backspace' }
];

/** Two keyboard clusters as virtual devices. Held keys are cleared on blur so nothing sticks after alt-tab (spec §8). */
export function createKeyboardSources(target: Window) {
  const held = new Set<string>();
  const presses = new Map<string, number>();   // keydown events (not auto-repeat) per code since the last sample
  const down = (e: KeyboardEvent): void => {
    if (!e.repeat) presses.set(e.code, (presses.get(e.code) ?? 0) + 1);
    held.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Backspace') e.preventDefault();
  };
  const up = (e: KeyboardEvent): void => { held.delete(e.code); };
  const blur = (): void => { held.clear(); presses.clear(); };
  target.addEventListener('keydown', down); target.addEventListener('keyup', up); target.addEventListener('blur', blur);
  return {
    sample(): SourceSample[] {
      const count = (code: string): number => presses.get(code) ?? 0;
      const out: SourceSample[] = CLUSTERS.map((c) => {
        const x = (held.has(c.right) ? 1 : 0) - (held.has(c.left) ? 1 : 0), y = (held.has(c.down) ? 1 : 0) - (held.has(c.up) ? 1 : 0);
        const len = Math.sqrt(x * x + y * y) || 1;
        return {
          key: c.key, moveX: x / len, moveY: y / len,
          interact: held.has(c.interact), confirm: held.has(c.confirm), cancel: held.has(c.cancel),
          presses: { interact: count(c.interact), confirm: count(c.confirm), cancel: count(c.cancel) }
        };
      });
      presses.clear();
      return out;
    },
    destroy(): void { target.removeEventListener('keydown', down); target.removeEventListener('keyup', up); target.removeEventListener('blur', blur); }
  };
}

/** Poll once per frame. `index` is ephemeral and the id string is never parsed (spec §6). */
export function sampleGamepads(): SourceSample[] {
  const out: SourceSample[] = [];
  for (const p of navigator.getGamepads()) {
    if (!p) continue;
    const b = (i: number): boolean => p.buttons[i]?.pressed ?? false;
    let { x, y } = radialDeadzone(p.axes[0] ?? 0, p.axes[1] ?? 0, DEADZONE);
    if (b(12)) y = -1; if (b(13)) y = 1; if (b(14)) x = -1; if (b(15)) x = 1;
    out.push({ key: `gp:${p.index}`, moveX: x, moveY: y, interact: b(0), confirm: b(2), cancel: b(1) });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/deviceManager.test.ts && npm run typecheck`
Expected: 6 passed; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/input tests/deviceManager.test.ts
git commit -m "feat(input): device manager with press-to-join, reconnect and reclaim; keyboard and gamepad sources

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: Renderer (letterbox, StableId cache, tiles, crew, overlays)

**Files:**
- Create: `src/renderer/src/render/letterbox.ts`, `src/renderer/src/render/cache.ts`, `src/renderer/src/render/renderer.ts`
- Test: `tests/render.test.ts`

**Interfaces:**
- Produces (letterbox.ts): `computeLetterbox(winW, winH, internalW, internalH): { scale: number; offsetX: number; offsetY: number }` (integer scale ≥ 1, centred).
- Produces (cache.ts): `syncCache<T>(cache: Map<number, T>, liveIds: readonly number[], create: (id: number) => T, destroy: (item: T, id: number) => void): void` (creates missing, destroys stale; keyed by `StableId`; `destroy` receives the id so callers can drop their own per-id data).
- Produces (renderer.ts): `createRenderer(): Promise<Renderer>` where
  ```ts
  interface Renderer {
    app: Application; world: Container; hud: Container;
    resize(winW: number, winH: number): void;
    recordPrev(state: SimState): void;              // call before every sim tick (interpolation spans one tick)
    draw(state: SimState, alpha: number): void;     // interpolates crew between prev and current
  }
  ```
  Pixi 8 specifics: `const app = new Application(); await app.init({ width: INTERNAL_W, height: INTERNAL_H, background: 0x05060a, antialias: false, roundPixels: true })`, `document.body.appendChild(app.canvas)`. Two render groups: `world` (ship, centred: offset `((INTERNAL_W - width·TILE_PX)/2, (INTERNAL_H - height·TILE_PX)/2)`) and `hud`. Tile layer is one `Graphics` rebuilt only when any door state changes (compare against a cached copy). Room overlays: one `Graphics` per room, redrawn each frame with oxygen tint (red, alpha `0.6·(1 − frac)`) and fire tint (orange, alpha `0.7·fire/FIRE_CAP`). Breaches: red squares on active site tiles. Crew: one `Graphics` circle per `StableId` (radius `CREW_HALF·TILE_PX`, colour per pid: `0x4fc3f7, 0x81c784, 0xffb74d, 0xe57373`; Downed drawn at 50% alpha, Dead grey). Only `letterbox.ts` and `cache.ts` are unit-tested; Pixi does not run under node.

- [ ] **Step 1: Write the failing tests**

`tests/render.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeLetterbox } from '../src/renderer/src/render/letterbox';
import { syncCache } from '../src/renderer/src/render/cache';

describe('letterbox', () => {
  it('picks the largest integer scale that fits and centres', () => {
    expect(computeLetterbox(1920, 1080, 960, 540)).toEqual({ scale: 2, offsetX: 0, offsetY: 0 });
    expect(computeLetterbox(2000, 1200, 960, 540)).toEqual({ scale: 2, offsetX: 40, offsetY: 60 });
    expect(computeLetterbox(900, 500, 960, 540)).toEqual({ scale: 1, offsetX: -30, offsetY: -20 });
  });
});

describe('syncCache', () => {
  it('creates entries for new ids and destroys stale ones (recycled slot between frames)', () => {
    const cache = new Map<number, { id: number; dead: boolean }>();
    const destroyed: number[] = [];
    const create = (id: number) => ({ id, dead: false });
    const destroy = (o: { id: number; dead: boolean }) => { o.dead = true; destroyed.push(o.id); };
    syncCache(cache, [1, 2, 3], create, destroy);
    expect([...cache.keys()]).toEqual([1, 2, 3]);
    syncCache(cache, [1, 3, 4], create, destroy);   // 2 removed, 4 reuses a slot but has a new StableId
    expect(destroyed).toEqual([2]);
    expect(cache.has(2)).toBe(false); expect(cache.get(4)!.dead).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/render.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the pure helpers**

`src/renderer/src/render/letterbox.ts`:
```ts
export function computeLetterbox(winW: number, winH: number, internalW: number, internalH: number): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.max(1, Math.floor(Math.min(winW / internalW, winH / internalH)));
  return { scale, offsetX: Math.floor((winW - internalW * scale) / 2), offsetY: Math.floor((winH - internalH * scale) / 2) };
}
```

`src/renderer/src/render/cache.ts`:
```ts
/** Keep a display-object cache in step with the live StableIds (spec §7): never keyed by raw entity id. */
export function syncCache<T>(cache: Map<number, T>, liveIds: readonly number[], create: (id: number) => T, destroy: (item: T, id: number) => void): void {
  const live = new Set(liveIds);
  for (const [id, item] of cache) if (!live.has(id)) { destroy(item, id); cache.delete(id); }
  for (const id of liveIds) if (!cache.has(id)) cache.set(id, create(id));
}
```

- [ ] **Step 4: Implement the Pixi renderer**

`src/renderer/src/render/renderer.ts`:
```ts
import { Application, Container, Graphics } from 'pixi.js';
import { INTERNAL_W, INTERNAL_H, TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { Position, Stable, Life, LifeState, Owner } from '../sim/components';
import { DoorState } from '../sim/grid';
import { CREW_HALF, FIRE_CAP } from '../sim/tuning';
import { computeLetterbox } from './letterbox';
import { syncCache } from './cache';

const CREW_COLORS = [0x4fc3f7, 0x81c784, 0xffb74d, 0xe57373];

export interface Renderer {
  app: Application; world: Container; hud: Container;
  resize(winW: number, winH: number): void;
  recordPrev(state: SimState): void;
  draw(state: SimState, alpha: number): void;
}

export async function createRenderer(): Promise<Renderer> {
  const app = new Application();
  await app.init({ width: INTERNAL_W, height: INTERNAL_H, background: 0x05060a, antialias: false, roundPixels: true });
  document.body.appendChild(app.canvas);
  const world = new Container(); world.isRenderGroup = true;
  const hud = new Container(); hud.isRenderGroup = true;
  app.stage.addChild(world, hud);
  const tiles = new Graphics(), overlays = new Container(), breachLayer = new Graphics(), crewLayer = new Container();
  world.addChild(tiles, overlays, breachLayer, crewLayer);
  let doorCache: Uint8Array | null = null;
  const roomGfx: Graphics[] = [];
  const crewGfx = new Map<number, Graphics>();
  const prev = new Map<number, { x: number; y: number }>();

  function rebuildTiles(state: SimState): void {
    const d = state.derived;
    tiles.clear();
    for (let ty = 0; ty < d.height; ty++) for (let tx = 0; tx < d.width; tx++) {
      const i = ty * d.width + tx;
      const edge = d.doorTileToEdge[i]!;
      let color: number;
      if (edge >= 0) { const st = state.doors.state[edge]; color = st === DoorState.Open ? 0x3a4a3a : st === DoorState.Sealed ? 0x8a2a2a : 0x6a6a3a; }
      else if (d.wallTile[i]) color = state.layout.rows[ty]!.charAt(tx) === ' ' ? 0x05060a : 0x3b3f4a;
      else color = (tx + ty) % 2 ? 0x1b1e26 : 0x1f232c;
      tiles.rect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX).fill(color);
    }
    doorCache = Uint8Array.from(state.doors.state);
  }

  return {
    app, world, hud,
    resize(winW, winH) {
      const lb = computeLetterbox(winW, winH, INTERNAL_W, INTERNAL_H);
      app.renderer.resize(winW, winH);
      app.stage.scale.set(lb.scale); app.stage.position.set(lb.offsetX, lb.offsetY);
    },
    recordPrev(state) {
      for (const eid of state.crew) prev.set(Stable.id[eid]!, { x: Position.x[eid]!, y: Position.y[eid]! });
    },
    draw(state, alpha) {
      const d = state.derived;
      world.position.set(Math.floor((INTERNAL_W - d.width * TILE_PX) / 2), Math.floor((INTERNAL_H - d.height * TILE_PX) / 2));
      if (!doorCache || doorCache.some((v, i) => v !== state.doors.state[i])) rebuildTiles(state);
      while (roomGfx.length < d.volume.length) { const g = new Graphics(); roomGfx.push(g); overlays.addChild(g); }
      for (let r = 0; r < d.volume.length; r++) {
        const g = roomGfx[r]!; g.clear();
        const frac = state.rooms.o2[r]! / d.volume[r]!, fire = state.rooms.fire[r]!;
        for (const t of d.roomTiles[r]!) {
          const tx = t % d.width, ty = (t - tx) / d.width;
          if (frac < 1) g.rect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX).fill({ color: 0xff2040, alpha: 0.6 * (1 - frac) });
          if (fire > 0) g.rect(tx * TILE_PX + 4, ty * TILE_PX + 4, TILE_PX - 8, TILE_PX - 8).fill({ color: 0xff8c1a, alpha: 0.3 + 0.7 * fire / FIRE_CAP });
        }
      }
      breachLayer.clear();
      for (let s = 0; s < d.siteTile.length; s++) if (state.breaches.active[s]) {
        const t = d.siteTile[s]!, tx = t % d.width, ty = (t - tx) / d.width;
        breachLayer.rect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX).fill(0xff3030);
      }
      const liveIds = state.crew.map((eid) => Stable.id[eid]!);
      syncCache(crewGfx, liveIds, () => { const g = new Graphics(); crewLayer.addChild(g); return g; }, (g, id) => { g.destroy(); prev.delete(id); });
      for (const eid of state.crew) {
        const id = Stable.id[eid]!, g = crewGfx.get(id)!, p = prev.get(id) ?? { x: Position.x[eid]!, y: Position.y[eid]! };
        const x = p.x + (Position.x[eid]! - p.x) * alpha, y = p.y + (Position.y[eid]! - p.y) * alpha;
        const life = Life.state[eid];
        g.clear().circle(0, 0, CREW_HALF * TILE_PX).fill({ color: life === LifeState.Dead ? 0x777777 : CREW_COLORS[Owner.pid[eid]! % 4]!, alpha: life === LifeState.Downed ? 0.5 : 1 });
        g.position.set(x * TILE_PX, y * TILE_PX);
      }
    }
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/render.test.ts && npm run typecheck`
Expected: 2 passed; typecheck exits 0 (Pixi 8 types: `Graphics.rect(...).fill(...)` chain and `app.canvas` exist in 8.x).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render tests/render.test.ts
git commit -m "feat(render): Pixi renderer with integer letterbox, StableId-keyed crew cache, tile and hazard overlays

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 19: HUD, session flow (lobby, run, pause, game over), Electron wiring and error boundary

**Files:**
- Create: `src/renderer/src/render/hud.ts`, `src/renderer/src/app/session.ts`
- Modify: `src/renderer/src/main.ts`, `src/main/index.ts`, `src/preload/index.ts`
- Test: `tests/hud.test.ts`, `tests/session.test.ts`

**Interfaces:**
- Produces (hud.ts):
  ```ts
  interface HudPlayer { pid: number; status: SlotStatus; health: number; life: number; bleed: number; prompt: string; progress: number }
  interface HudModel { phase: 'lobby' | 'running' | 'paused' | 'gameover' | 'error'; message: string; hull: number; simSeconds: number; threats: string[]; players: HudPlayer[] }
  buildHudModel(state: SimState | null, slots: SlotInfo[], phase: HudModel['phase'], message: string): HudModel   // pure
  createHud(parent: Container): { update(model: HudModel): void }                                              // Pixi Text
  ```
  Prompts (spec §7): Interact target → `Revive P2` / `Repair fire` / `Repair breach`; Confirm target → `Seal door` or `Unseal door`; Downed → `DOWNED 12s`. Threats list: `Fire: <room name>`, `Breach: <room name>`. Skill levels are shown from increment 3 (not in this model yet).
- Produces (session.ts):
  ```ts
  interface SessionDeps {
    layout: ShipLayout;
    sampleDevices(): SourceSample[];
    renderer: { recordPrev(s: SimState): void; draw(s: SimState, alpha: number): void } | null;
    hud: { update(m: HudModel): void } | null;
    now(): number;                         // ms, wall clock, app-side only
    saveCrash(payload: unknown): void;     // localStorage in the app, no-op in tests
  }
  createSession(deps: SessionDeps): { frame(): void; pause(): void; resume(): void; readonly phase: HudModel['phase']; readonly state: SimState | null; readonly seed: number }
  ```
  Flow (spec §7 Session flow): `lobby` (joins allowed) → any joined player presses Confirm → `running` with `DEFAULT_SEED = 2026` → sim ends → `gameover` (survival time = `tick / TICK_HZ`); Confirm restarts with the same seed, Cancel restarts with `seed + 1`; both return to `lobby` with the same players kept. `pause()` sets `paused` and resets the accumulator so no backlog forms; `resume()` returns to `running`. A thrown error in `step` is caught: the session saves `{ snapshot, recentIntents }` (last 300 ticks of intents) via `saveCrash` and enters `error` (spec §9).
- Modifies (main.ts): wires sources, renderer, HUD and session; `requestAnimationFrame`-driven via `app.ticker`; `blur` and `visibilitychange(hidden)` → `pause()`, `focus` → `resume()`; `window.ftlite?.onSuspend(pause)`.
- Modifies (Electron main/preload): `powerMonitor.on('suspend')` → `webContents.send('app:suspend')`; preload exposes `window.ftlite = { onSuspend(cb) }` via `contextBridge`.

- [ ] **Step 1: Write the failing tests**

`tests/hud.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildHudModel } from '../src/renderer/src/render/hud';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { Life, LifeState } from '../src/renderer/src/sim/components';
import { makeState, room, run, teleport } from './helpers/sim';

const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'active' as const, key: `k${i}` }));

describe('buildHudModel', () => {
  it('lists threats by room name and shows the sim clock', () => {
    const s = makeState(2);
    igniteRoom(s, room(s, 'A')); activateBreach(s, 6);
    run(s, 120);
    const m = buildHudModel(s, slots(2), 'running', '');
    expect(m.simSeconds).toBe(2);
    expect(m.threats).toEqual(['Fire: Bridge', 'Breach: Crew Quarters']);
    expect(m.hull).toBe(100);
  });
  it('prompts for the current Interact and Confirm targets', () => {
    const s = makeState(2);
    igniteRoom(s, room(s, 'G'));
    teleport(s, 0, 2.5, 8.6);
    const m = buildHudModel(s, slots(2), 'running', '');
    expect(m.players[0]!.prompt).toBe('Repair fire | Seal door');
    Life.state[s.crew[1]!] = LifeState.Downed; Life.bleed[s.crew[1]!] = 12.4;
    const m2 = buildHudModel(s, slots(2), 'running', '');
    expect(m2.players[0]!.prompt).toBe('Revive P2 | Seal door');
    expect(m2.players[1]!.prompt).toBe('DOWNED 13s');   // Math.ceil: never shows 0s while still alive
  });
  it('lobby model without state shows slot status', () => {
    const m = buildHudModel(null, [{ status: 'active', key: 'a' }, { status: 'empty', key: null }], 'lobby', 'Press Interact to join');
    expect(m.players).toHaveLength(2);
    expect(m.players[1]!.status).toBe('empty');
  });
});
```

`tests/session.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createSession } from '../src/renderer/src/app/session';
import type { SourceSample } from '../src/renderer/src/input/deviceManager';
import { LAYOUT } from './helpers/sim';

function harness() {
  let samples: SourceSample[] = [];
  let t = 0;
  const crashes: unknown[] = [];
  const session = createSession({
    layout: LAYOUT, sampleDevices: () => samples, renderer: null, hud: null,
    now: () => t, saveCrash: (p) => { crashes.push(p); }
  });
  const press = (key: string, o: Partial<SourceSample>) => { samples = [{ key, moveX: 0, moveY: 0, interact: false, confirm: false, cancel: false, ...o }]; };
  const frames = (n: number, ms = 1000 / 60) => { for (let i = 0; i < n; i++) { t += ms; session.frame(); } };
  return { session, press, frames, crashes, release: () => press('a', {}) };
}

describe('session', () => {
  it('joins in the lobby and starts on Confirm', () => {
    const h = harness();
    h.frames(1);
    expect(h.session.phase).toBe('lobby');
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release();
    expect(h.session.phase).toBe('running');
    expect(h.session.state!.playerCount).toBe(1);
    h.frames(60);
    expect(h.session.state!.tick).toBeGreaterThanOrEqual(58);
  });
  it('pause stops ticking and resume continues without a backlog', () => {
    const h = harness();
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release(); h.frames(10);
    const tick = h.session.state!.tick;
    h.session.pause(); h.frames(100);
    expect(h.session.state!.tick).toBe(tick);
    h.session.resume(); h.frames(1);
    expect(h.session.state!.tick).toBeLessThanOrEqual(tick + 1);
  });
  it('ends when the solo player dies and restarts with the same or next seed', () => {
    const h = harness();
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release();
    const seed = h.session.seed;
    h.session.state!.hull = 0; h.frames(2);
    expect(h.session.phase).toBe('gameover');
    h.press('a', { cancel: true }); h.frames(1); h.release();
    expect(h.session.phase).toBe('lobby');
    expect(h.session.seed).toBe(seed + 1);
  });
  it('a sim fault saves a crash payload and enters the error phase', () => {
    const h = harness();
    h.press('a', { interact: true }); h.frames(1); h.release(); h.frames(1);
    h.press('a', { confirm: true }); h.frames(1); h.release();
    (h.session.state as unknown as { rooms: null }).rooms = null;   // corrupt the state to force a throw
    h.frames(2);
    expect(h.session.phase).toBe('error');
    expect(h.crashes).toHaveLength(1);
  });
  it('after a fault, frames keep running without touching the corrupt state', () => {
    let hudModels = 0, faulted = false, t = 0;
    let samples: SourceSample[] = [];
    const session = createSession({
      layout: LAYOUT, sampleDevices: () => samples,
      renderer: { recordPrev() {}, draw() { if (faulted) throw new Error('draw must not run in error phase'); } },
      hud: { update(m) { hudModels++; if (m.phase === 'error') expect(m.players.every((p) => p.prompt === '')).toBe(true); } },
      now: () => (t += 1000 / 60),   // time must advance or no tick runs and the fault never fires
      saveCrash: () => {}
    });
    samples = [{ key: 'a', moveX: 0, moveY: 0, interact: true, confirm: false, cancel: false }]; session.frame();
    samples = [{ key: 'a', moveX: 0, moveY: 0, interact: false, confirm: true, cancel: false }]; session.frame();
    (session.state as unknown as { rooms: null }).rooms = null;
    faulted = true;
    samples = [];
    expect(() => { for (let i = 0; i < 3; i++) session.frame(); }).not.toThrow();
    expect(session.phase).toBe('error');
    expect(hudModels).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/hud.test.ts tests/session.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the HUD**

`src/renderer/src/render/hud.ts`:
```ts
import { Container, Text } from 'pixi.js';
import type { SimState } from '../sim/state';
import { Health, Life, LifeState } from '../sim/components';
import { interactTarget, confirmTarget, TargetKind, ConfirmKind } from '../sim/interact';
import { DoorState } from '../sim/grid';
import { TICK_HZ } from '../sim/tuning';
import type { SlotInfo, SlotStatus } from '../input/deviceManager';
import { INTERNAL_W } from '../../../shared/resolution';

export interface HudPlayer { pid: number; status: SlotStatus; health: number; life: number; bleed: number; prompt: string; progress: number }
export interface HudModel { phase: 'lobby' | 'running' | 'paused' | 'gameover' | 'error'; message: string; hull: number; simSeconds: number; threats: string[]; players: HudPlayer[] }

function prompt(state: SimState, pid: number): { text: string; progress: number } {
  const eid = state.crew[pid]!;
  if (Life.state[eid] === LifeState.Downed) return { text: `DOWNED ${Math.ceil(Life.bleed[eid]!)}s`, progress: Life.reviveProgress[eid]! };
  if (Life.state[eid] === LifeState.Dead) return { text: 'DEAD', progress: 0 };
  const parts: string[] = [];
  let progress = 0;
  const t = interactTarget(state, pid);
  if (t.kind === TargetKind.Revive) { parts.push(`Revive P${t.index + 1}`); progress = Life.reviveProgress[state.crew[t.index]!]!; }
  else if (t.kind === TargetKind.Fire) { parts.push('Repair fire'); progress = state.rooms.fireRepair[t.index]!; }
  else if (t.kind === TargetKind.Breach) { parts.push('Repair breach'); progress = state.breaches.repair[t.index]!; }
  const c = confirmTarget(state, pid);
  if (c.kind === ConfirmKind.Door) parts.push(state.doors.state[c.index] === DoorState.Sealed ? 'Unseal door' : 'Seal door');
  return { text: parts.join(' | '), progress };
}

export function buildHudModel(state: SimState | null, slots: SlotInfo[], phase: HudModel['phase'], message: string): HudModel {
  const players: HudPlayer[] = slots.map((slot, pid) => {
    if (!state || pid >= state.playerCount) return { pid, status: slot.status, health: 0, life: 0, bleed: 0, prompt: '', progress: 0 };
    const eid = state.crew[pid]!, p = prompt(state, pid);
    return { pid, status: slot.status, health: Health.cur[eid]!, life: Life.state[eid]!, bleed: Life.bleed[eid]!, prompt: p.text, progress: p.progress };
  });
  const threats: string[] = [];
  if (state) {
    for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r]! > 0) threats.push(`Fire: ${state.layout.rooms[r]!.name}`);
    for (let s = 0; s < state.breaches.active.length; s++) if (state.breaches.active[s]) threats.push(`Breach: ${state.layout.rooms[state.derived.siteRoom[s]!]!.name}`);
  }
  return { phase, message, hull: state?.hull ?? 0, simSeconds: state ? Math.floor(state.tick / TICK_HZ) : 0, threats, players };
}

export function createHud(parent: Container) {
  const style = { fill: 0xe8e8e8, fontFamily: 'monospace', fontSize: 14 };
  const top = new Text({ text: '', style }); top.position.set(8, 6);
  const threats = new Text({ text: '', style }); threats.position.set(INTERNAL_W - 220, 6);
  const banner = new Text({ text: '', style: { ...style, fontSize: 22 } }); banner.anchor.set(0.5); banner.position.set(INTERNAL_W / 2, 40);
  const players = [0, 1, 2, 3].map((i) => { const t = new Text({ text: '', style }); t.position.set(8 + i * 236, 500); return t; });
  parent.addChild(top, threats, banner, ...players);
  return {
    update(m: HudModel): void {
      top.text = `HULL ${Math.round(m.hull)}   TIME ${m.simSeconds}s`;
      threats.text = m.threats.join('\n');
      banner.text = m.message;
      m.players.forEach((p, i) => {
        const t = players[i]!;
        if (p.status === 'empty') { t.text = `P${i + 1}: press Interact to join`; return; }
        if (p.status === 'reconnect') { t.text = `P${i + 1}: RECONNECT`; return; }
        const bar = p.progress > 0 ? ` [${'#'.repeat(Math.round(p.progress * 10)).padEnd(10, '.')}]` : '';
        t.text = `P${i + 1} HP ${Math.ceil(p.health)}\n${p.prompt}${bar}`;
      });
    }
  };
}
```

- [ ] **Step 4: Implement the session**

`src/renderer/src/app/session.ts`:
```ts
import type { ShipLayout } from '../sim/ship/schema';
import { createSimState, type SimState } from '../sim/state';
import { step } from '../sim/step';
import { saveSnapshot } from '../sim/snapshot';
import { encodeIntent, type CompactIntent } from '../sim/replay';
import { TICK_HZ, DT } from '../sim/tuning';
import { createDeviceManager, type SourceSample, type SlotInfo } from '../input/deviceManager';
import { createIntentFeed } from './intents';
import { stepAccumulator } from './loop';
import { buildHudModel, type HudModel } from '../render/hud';
import { EndReason } from '../sim/crew';

export const DEFAULT_SEED = 2026;
const CRASH_HISTORY = 300;

export interface SessionDeps {
  layout: ShipLayout;
  sampleDevices(): SourceSample[];
  renderer: { recordPrev(s: SimState): void; draw(s: SimState, alpha: number): void } | null;
  hud: { update(m: HudModel): void } | null;
  now(): number;
  saveCrash(payload: unknown): void;
}

export function createSession(deps: SessionDeps) {
  const dm = createDeviceManager();
  let phase: HudModel['phase'] = 'lobby';
  let message = 'Press Interact to join, Confirm to start';
  let seed = DEFAULT_SEED;
  let state: SimState | null = null;
  let feed: ReturnType<typeof createIntentFeed> | null = null;
  let slots: SlotInfo[] = [];
  let accumulator = 0, lastNow: number | null = null;
  const history: CompactIntent[][] = [];

  function start(): void {
    const playerCount = slots.filter((s) => s.status !== 'empty').length;
    state = createSimState(deps.layout, playerCount, seed);
    feed = createIntentFeed(playerCount);
    accumulator = 0; history.length = 0;
    phase = 'running'; message = '';
  }

  function anyPress(frames: { confirmPresses: number; cancelPresses: number }[], key: 'confirmPresses' | 'cancelPresses'): boolean {
    return frames.some((f) => f[key] > 0);
  }

  return {
    get phase() { return phase; }, get state() { return state; }, get seed() { return seed; },
    pause() { if (phase === 'running') { phase = 'paused'; message = 'PAUSED'; accumulator = 0; } },
    resume() { if (phase === 'paused') { phase = 'running'; message = ''; lastNow = null; } },
    frame() {
      const now = deps.now();
      const delta = lastNow === null ? 0 : Math.min(0.25, (now - lastNow) / 1000);
      lastNow = now;
      const { frames, slots: s, joinedCount } = dm.update(deps.sampleDevices(), phase === 'lobby');
      slots = s;
      if (phase === 'lobby') {
        if (joinedCount > 0 && anyPress(frames, 'confirmPresses')) start();
      } else if (phase === 'running' && state && feed) {
        feed.beginFrame(frames);
        const r = stepAccumulator(accumulator, delta); accumulator = r.accumulator;
        try {
          for (let i = 0; i < r.ticks; i++) {
            deps.renderer?.recordPrev(state);   // before every tick, so interpolation spans only the last tick
            const intents = feed.tick();
            history.push(intents.map(encodeIntent)); if (history.length > CRASH_HISTORY) history.shift();
            step(state, intents);
            if (state.ended) {
              phase = 'gameover';
              message = `${state.endReason === EndReason.Hull ? 'HULL LOST' : 'CREW LOST'} after ${Math.floor(state.tick / TICK_HZ)}s. Confirm: same seed. Cancel: new seed.`;
              break;
            }
          }
        } catch (err) {
          phase = 'error';
          message = `Sim fault: ${(err as Error).message}. Crash data saved.`;
          let snapshot: unknown = null;
          try { snapshot = saveSnapshot(state); } catch { snapshot = null; }
          deps.saveCrash({ tick: state.tick, seed, error: String(err), snapshot, recentIntents: history.slice() });
        }
      } else if (phase === 'gameover') {
        if (anyPress(frames, 'cancelPresses')) { seed += 1; phase = 'lobby'; message = 'New seed. Confirm to start'; }
        else if (anyPress(frames, 'confirmPresses')) { phase = 'lobby'; message = 'Same seed. Confirm to start'; }
      }
      // In the error phase the state may be corrupt: never read it again (the draw and HUD are outside the try).
      if (state && deps.renderer && phase !== 'error') deps.renderer.draw(state, phase === 'running' ? accumulator / DT : 1);
      deps.hud?.update(buildHudModel(phase === 'error' ? null : state, slots, phase, message));
    }
  };
}
```

Note on the restart flow: after game over, Confirm or Cancel returns to the lobby with the chosen seed; the next Confirm starts the run. This keeps "restart with the same or a new seed" to two button presses and reuses one code path.

- [ ] **Step 5: Wire the app and Electron**

`src/renderer/src/main.ts`:
```ts
import starter from './sim/ship/starter.json';
import { parseShip } from './sim/ship/schema';
import { createRenderer } from './render/renderer';
import { createHud } from './render/hud';
import { createKeyboardSources, sampleGamepads } from './input/sources';
import { createSession } from './app/session';

declare global { interface Window { ftlite?: { onSuspend(cb: () => void): void } } }

async function start(): Promise<void> {
  const layout = parseShip(starter);          // throws with a clear message on invalid ship data (spec §9)
  const renderer = await createRenderer();
  const hud = createHud(renderer.hud);
  const keyboard = createKeyboardSources(window);
  const session = createSession({
    layout,
    sampleDevices: () => [...keyboard.sample(), ...sampleGamepads()],
    renderer, hud,
    now: () => performance.now(),
    saveCrash: (payload) => { try { localStorage.setItem('ftlite-crash', JSON.stringify(payload)); } catch { /* storage unavailable */ } }
  });
  const resize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize); resize();
  window.addEventListener('blur', () => session.pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) session.pause(); });
  window.addEventListener('focus', () => session.resume());
  window.ftlite?.onSuspend(() => session.pause());
  renderer.app.ticker.add(() => session.frame());
}
void start();
```

`src/preload/index.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ftlite', {
  onSuspend(cb: () => void): void { ipcRenderer.on('app:suspend', () => cb()); }
});
```

In `src/main/index.ts`, import `powerMonitor` from `electron` and, inside `createWindow` after the window is created, add:
```ts
  powerMonitor.on('suspend', () => win.webContents.send('app:suspend'));
```

- [ ] **Step 6: Run tests, typecheck, and the app**

Run: `npx vitest run tests/hud.test.ts tests/session.test.ts && npm run typecheck && npm test`
Expected: all pass.

Run: `npm run dev`
Expected: a window with the ship centred. Press `E` (cluster 0) to join P1 and `Enter` (cluster 1) to join P2, press `F` to start. Both crew appear in Crew Quarters and move with WASD / arrows. Doors open on approach. After about 15 s the first fire or breach appears in the threat list and as an overlay; walking into the burning room and holding `E` shows a progress bar and extinguishes it. Alt-tab shows `PAUSED`; returning resumes. If anything differs, fix before committing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(app): HUD, lobby/run/pause/game-over session, Electron suspend pause and crash capture

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 20: Increment 1 gate: headless two-bot survival, gamepad spike checklist, manual playtest record

**Files:**
- Create: `tests/helpers/bot.ts`, `tests/gate-survival.test.ts`, `docs/gates.md`
- Modify: `docs/spikes.md`, `src/renderer/src/sim/tuning.ts` (only if the gate needs tuning)

**Interfaces:**
- Produces (tests/helpers/bot.ts): `botIntent(state, pid): Intent`. A scripted crew member: if a teammate is Downed, path to them and hold Interact; else path to the nearest hazard (burning room tile, or a floor tile next to an active breach site) and hold Interact when a target is in reach; else idle. Pathing is a BFS over non-solid tiles (doors count as passable because they open on approach); the bot steers to the centre of the next tile.

Gate (spec §11, increment 1): mass-balance and branching tests pass (Tasks 8-9), and **two bots survive at least 5 minutes against the timer spawner** in a headless run on seeds 1, 2 and 3. Then a manual playtest confirms the same with two keyboard players.

- [ ] **Step 1: Write the bot and the gate test**

`tests/helpers/bot.ts`:
```ts
import type { Intent } from '../../src/shared/intent';
import { NEUTRAL_INTENT } from '../../src/shared/intent';
import type { SimState } from '../../src/renderer/src/sim/state';
import { Position, Life, LifeState } from '../../src/renderer/src/sim/components';
import { interactTarget, TargetKind } from '../../src/renderer/src/sim/interact';
import { DoorState } from '../../src/renderer/src/sim/grid';

/** Passable for pathing: not a wall, and not a sealed door (closed doors open on approach). */
function passable(state: SimState, tx: number, ty: number): boolean {
  const d = state.derived;
  if (tx < 0 || ty < 0 || tx >= d.width || ty >= d.height) return false;
  const i = ty * d.width + tx;
  if (d.wallTile[i]) return false;
  const e = d.doorTileToEdge[i]!;
  return e < 0 || state.doors.state[e] !== DoorState.Sealed;
}

/** BFS from the crew tile to the nearest goal tile; returns the first step's tile index, or -1. */
function firstStep(state: SimState, fromIdx: number, goals: Set<number>): number {
  if (goals.has(fromIdx)) return fromIdx;
  const w = state.derived.width;
  const parent = new Map<number, number>([[fromIdx, -1]]);
  const queue = [fromIdx];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!, tx = i % w, ty = (i - tx) / w;
    for (const [nx, ny] of [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]] as const) {
      if (!passable(state, nx, ny)) continue;
      const n = ny * w + nx;
      if (parent.has(n)) continue;
      parent.set(n, i);
      if (goals.has(n)) {
        let cur = n;
        while (parent.get(cur) !== fromIdx) cur = parent.get(cur)!;
        return cur;
      }
      queue.push(n);
    }
  }
  return -1;
}

function goalTiles(state: SimState, pid: number): Set<number> {
  const d = state.derived, goals = new Set<number>();
  for (let other = 0; other < state.playerCount; other++) {
    if (other === pid || Life.state[state.crew[other]!] !== LifeState.Downed) continue;
    goals.add(Math.floor(Position.y[state.crew[other]!]!) * d.width + Math.floor(Position.x[state.crew[other]!]!));
  }
  if (goals.size) return goals;
  for (let r = 0; r < state.rooms.fire.length; r++) if (state.rooms.fire[r]! > 0) for (const t of d.roomTiles[r]!) goals.add(t);
  for (let s = 0; s < d.siteTile.length; s++) {
    if (!state.breaches.active[s]) continue;
    const t = d.siteTile[s]!, tx = t % d.width, ty = (t - tx) / d.width;
    for (const [nx, ny] of [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]] as const) if (passable(state, nx, ny)) goals.add(ny * d.width + nx);
  }
  return goals;
}

export function botIntent(state: SimState, pid: number): Intent {
  const eid = state.crew[pid]!;
  if (Life.state[eid] !== LifeState.Conscious) return NEUTRAL_INTENT;
  const x = Position.x[eid]!, y = Position.y[eid]!, w = state.derived.width;
  const here = Math.floor(y) * w + Math.floor(x);
  const target = interactTarget(state, pid);
  const goals = goalTiles(state, pid);
  if (target.kind !== TargetKind.None) return { ...NEUTRAL_INTENT, interactHeld: true };
  if (!goals.size) return NEUTRAL_INTENT;
  const next = firstStep(state, here, goals);
  if (next < 0) return NEUTRAL_INTENT;
  const nx = next % w + 0.5, ny = (next - next % w) / w + 0.5;
  const dx = nx - x, dy = ny - y, len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { ...NEUTRAL_INTENT, moveX: dx / len, moveY: dy / len };
}
```

`tests/gate-survival.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { step } from '../src/renderer/src/sim/step';
import { Life, LifeState } from '../src/renderer/src/sim/components';
import { makeState, seconds } from './helpers/sim';
import { botIntent } from './helpers/bot';

const FIVE_MINUTES = seconds(300);

describe('increment 1 gate: two bots survive five minutes', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}`, () => {
      const s = makeState(2, seed);
      let maxHazards = 0, repairsSeen = false;
      for (let t = 0; t < FIVE_MINUTES && !s.ended; t++) {
        step(s, [botIntent(s, 0), botIntent(s, 1)]);
        let active = 0;
        for (const f of s.rooms.fire) if (f > 0) active++;
        for (const b of s.breaches.active) if (b) active++;
        maxHazards = Math.max(maxHazards, active);
        if (Array.from(s.rooms.fireRepair).some((p) => p > 0) || Array.from(s.breaches.repair).some((p) => p > 0)) repairsSeen = true;
      }
      expect(s.ended, `run ended at ${Math.floor(s.tick / 60)}s, reason ${s.endReason}`).toBe(0);
      expect(maxHazards).toBeGreaterThan(0);
      expect(repairsSeen).toBe(true);
      expect(s.crew.filter((eid) => Life.state[eid] === LifeState.Conscious).length).toBe(2);
    });
  }
});
```

- [ ] **Step 2: Run the gate**

Run: `npx vitest run tests/gate-survival.test.ts`
Expected: 3 passed. Also add, inside the loop, a check that every fire-repair tick happens with the repairer inside the burning room (`roomAt(crew) === room` for each crew whose `interactTarget` is a Fire); it must be true by construction after Task 12, and it guards the gate against being passed from the corridor. The defaults were chosen so that a bot pays roughly `FIRE_DAMAGE × REPAIR_TIME_FIRE / 2` health per fire (two bots share) and breached rooms vent slowly enough (`PASSAGE_BREACH = 0.1`) that a bot arrives before the suffocation threshold. There is no healing in increment 1, so attrition is the expected failure mode.

If a seed fails, this is a tuning loop, not a code bug, unless the failure message shows the run ending within the first 30 s (then debug the bot with `console.log(botIntent(s, 0))` at the failing tick). Procedure: (1) add a temporary log in the test of each crew member's health every 30 s and the hazard that was active, to see which hazard type drains health; (2) if fires drain it, lower `FIRE_DAMAGE` by 1 (floor 2) or `REPAIR_TIME_FIRE` by 1 (floor 4); if breaches drain it, lower `PASSAGE_BREACH` to 0.05 or `O2_DAMAGE` by 1 (floor 3); if hazards simply pile up, raise `SPAWN_INTERVAL` by 5 (ceiling 45); (3) re-run all three seeds after each change; (4) when green, run `npm run bless` (tuning changed the golden) and `npm test`. Record the final values and the reason for each change in `docs/gates.md`. Do not change `SPAWN_CAP` below 2 (the game must still produce overlapping tasks), and do not add healing (Medbay is increment 2a).

- [ ] **Step 3: Gamepad spike checklist and manual playtest record**

`docs/gates.md`:
```markdown
# Increment gates

## Increment 0: headless harness
- [ ] `npm test` passes: golden replay, same-seed hash property, snapshot round trip.
- [ ] `npm run bless` twice in a row leaves `tests/golden/basic.json` unchanged.

## Increment 1: move and survive
- [ ] `tests/gate-survival.test.ts` passes on seeds 1-3 (two bots, 5 minutes). Tuning changes made: <none | list>.
- [ ] Mass-balance and branching-graph oxygen tests pass.
- [ ] Manual playtest (`npm run dev`): two keyboard players (WASD+E/F/Q, arrows+Enter/RShift/Backspace) survive 5 minutes; both repaired at least one fire and one breach; one revive happened (let a player stand in a fire until Downed). Date and notes: <fill in>.
- [ ] Pause on alt-tab and on minimise confirmed; sim clock does not advance while paused.
- [ ] Gamepad spike (spec §11): with `npm run dev`, then with `npm run dist` installed build:
  - [ ] Xbox-style pad joins with A, moves, interacts; unplug mid-run shows RECONNECT, replug + any button reclaims.
  - [ ] PlayStation-style pad: same.
  - [ ] A third pad model: same (name it).
  - [ ] Two keyboard clusters plus two pads: four players join.
  - Result and any device restrictions: <fill in>.
- [ ] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.
```

Append to `docs/spikes.md`:
```markdown
## Real gamepads in a built Electron app (Task 20)

See docs/gates.md, increment 1, for the test matrix and results.

## @pixi/tilemap with PixiJS v8

Not spiked in increments 0-1: the ship is one Graphics rebuilt only when a door changes, which is cheap for one small ship (spec §7 fallback). Revisit if tile rendering becomes a cost.
```

Run the manual checklist and fill in the `<fill in>` items with what was observed. A failed gamepad check does not block the increment: record the restriction (spec §11 fallback).

- [ ] **Step 4: Final verification and commit**

Run: `npm run typecheck && npm test && npm run build`
Expected: all exit 0, `out/` is produced.

```bash
git add -A
git commit -m "test: increment 1 gate (two-bot survival), gate and spike records

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review notes (checked against the spec)

- **Spec coverage, increments 0-1:** harness (Tasks 2-5, 14-15), ship data and validation incl. crew-sized reachability (4), movement (6), doors incl. local seal and deferral (7, 12), room-graph oxygen with stability bound, proportional scaling incl. sinks, injection clamp, residual tracking, mass-balance and branching tests (8), breaches on fixed sites (9), fire with two thresholds and seeded spread (10), crew lifecycle and run end (11), reach/Interact/Confirm/arbitration/repair/revive (12), stub injector and timer spawner (13), snapshots and the fast-check properties (14), golden replays and bless (15), accumulator with backlog discard and edge-exactly-once delivery incl. zero-tick frames and taps (16), DeviceManager rules (17), renderer with StableId caches and interpolation (18), HUD prompts, session flow, auto-pause, crash capture (19), the increment-1 gate and the spikes (1, 15, 20).
- **Deliberately deferred to later plans:** power model, consoles and control mode, stick-edge derivation, debris, skills/XP and productive predicates, Asset/Complication, director, Medbay/Life Support consoles (increments 2a-4). The stub injector and spawner are explicitly temporary.
- **Known simplifications to revisit in 2a:** `Confirm` targets only doors; the renderer draws doors by colour only; keyboard bindings are fixed (remapping is a later task); `bitecs/serialization` is not used.
- **Type consistency checks done:** `Intent` fields (`moveX, moveY, interactHeld, interactPressed, confirmPressed, cancelPressed`) are the same in `shared/intent.ts`, `app/intents.ts`, `replay.ts`, `interact.ts`; `SimState` fields used in `flatten.ts` match `state.ts` (incl. `injectionScratch`, which is deliberately not flattened); `Derived` fields `edgeTile`, `siteTile`, `roomTiles`, `kEff` are produced in Task 4 and consumed in Tasks 7, 8, 12, 18, 20; `DoorState` lives in `grid.ts` and is imported from there everywhere; `TargetKind`/`ConfirmKind` from `interact.ts` are used by `hud.ts` and `bot.ts`; `SlotInfo`/`SlotStatus` from `deviceManager.ts` are used by `hud.ts` and `session.ts`.
