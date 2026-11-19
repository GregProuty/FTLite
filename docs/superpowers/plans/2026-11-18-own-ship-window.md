# Own Ship Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small FTL-style OWN SHIP window to every duel console (Helm, Weapons, Science, Flight). It shows the crew's real interior with fire, damage, crew dots, hull and shields, so seated players notice a fire.

**Architecture:** A pure view model (`render/duel/ownShipModel.ts`) turns `DuelState` into plain JSON each frame. A display-only React component (`ui/duel/OwnShipWindow.tsx`) draws it as inline SVG in the amber CRT style. The scene builds it beside the contact window. The map's off-screen arrows, the sit-down framing and the Flight pointer learn to keep clear of the window's rect.

**Tech Stack:** TypeScript, React 18 + zustand UI sink, Pixi (map only, untouched here), Vitest (+ jsdom and @testing-library/react for components).

**Spec:** `docs/superpowers/specs/2026-11-18-own-ship-window-design.md` (refined, converged at `541c49d0`).

## Global Constraints

- No sim change: `SIM_VERSION` and the golden replay stay as they are. Nothing under `src/renderer/src/sim/` is edited.
- Every colour is one of the six `CRT` ramp entries in `render/tactical/crtTheme.ts`.
- Colours and blinks are resolved in the model; React does no blinking.
- `OWN_SHIP = { x: STATUS.x + STATUS.w + EDGE, y: STATUS.y, w: 240, h: 170 }` (x 228 to 468, y 42 to 212).
- `OWN_SHIP_BOX = { x: OWN_SHIP.x + 8, y: OWN_SHIP.y + 40, w: OWN_SHIP.w - 16, h: OWN_SHIP.h - 48 }`.
- The window shows exactly when the scene's `onMap` flag is true (`view !== 'interior'` and the seat is helm, weapons, science or flight), never on the SHIP view.
- The fire-start flash lasts 2 s (`FIRE_FLASH_S = 2`) and blinks at `ALERT_BLINK_HZ`.
- Run tests with `npx vitest run <file>`; never run bare `vitest` (watch mode). The full checks are `npm test` and `npm run typecheck`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src/renderer/src/render/duel/consoleLayout.ts` | modify | `OWN_SHIP`, `OWN_SHIP_BOX`, and the header row constants |
| `src/renderer/src/ui/duel/svgPaths.ts` | create | `polyPoints`, `segPath` (moved from ContactWindow) |
| `src/renderer/src/ui/duel/ContactWindow.tsx` | modify | import the moved helpers |
| `src/renderer/src/render/duel/ownShipModel.ts` | create | the view model, the look table, the fit, edges, the fire watch |
| `src/renderer/src/ui/views.ts` | modify | `DuelUiView.ownShip?` |
| `src/renderer/src/ui/duel/OwnShipWindow.tsx` | create | the display component |
| `src/renderer/src/ui/duel/DuelUi.tsx` | modify | render it in the spec's draw order |
| `src/renderer/src/render/tactical/tacticalModel.ts` | modify | `avoid` input, `ArrowDraw.edge`, `aroundAvoid`, `spreadArrows` bounds |
| `src/renderer/src/render/duel/sitModel.ts` | modify | `frameZoom` optional `avoid` |
| `src/renderer/src/app/duel/flightPointer.ts` | modify | `OWN_SHIP` joins `BLOCKS` |
| `src/renderer/src/app/duel/scene.ts` | modify | build `ownShip`, keep the fire watch, pass `avoid` |
| `tests/ownShipLayout.test.ts` | create | layout checks |
| `tests/ownShipModel.test.ts` | create | model and watch tests |
| `tests/ownShipWindow.test.tsx` | create | component test |
| `tests/tacticalModel.test.ts` | modify | arrow tests |
| `tests/feelPresentation.test.ts` | modify | frameZoom test |
| `tests/flightPointer.test.ts` | modify | pointer test |
| `tests/ownShipScene.test.ts` | create | scene gate test |

---

### Task 1: Layout constants and the shared SVG path helpers

**Files:**
- Modify: `src/renderer/src/render/duel/consoleLayout.ts` (append after `STATUS_RESERVE`, line 41)
- Create: `src/renderer/src/ui/duel/svgPaths.ts`
- Modify: `src/renderer/src/ui/duel/ContactWindow.tsx:24-25` (the two `const` helpers) and its imports
- Test: `tests/ownShipLayout.test.ts`

**Interfaces:**
- Produces: `OWN_SHIP`, `OWN_SHIP_BOX`, `OWN_SHIP_TITLE_Y`, `OWN_SHIP_STATUS_Y`, `OWN_SHIP_X0`, `OWN_SHIP_RIGHT` from `render/duel/consoleLayout`. Also `polyPoints(p: readonly number[]): string` and `segPath(s: readonly number[]): string` from `ui/duel/svgPaths`.

- [ ] **Step 1: Write the failing test**

Create `tests/ownShipLayout.test.ts`:

```ts
// Own ship window spec §3: the window's rect clears every console block and its header sits above its drawing box.
import { describe, expect, it } from 'vitest';
import {
  CONTACT, FLIGHT, OWN_SHIP, OWN_SHIP_BOX, OWN_SHIP_RIGHT, OWN_SHIP_STATUS_Y, OWN_SHIP_TITLE_Y, OWN_SHIP_X0, SIDE, SIDE_H,
  STATION, STATUS, stationTop, TABS
} from '../src/renderer/src/render/duel/consoleLayout';
import { FONT_NATIVE } from '../src/renderer/src/render/theme';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('the own ship window layout (spec §3)', () => {
  it('is x 228 to 468, y 42 to 212, with the box x 236 to 460, y 82 to 204', () => {
    expect(OWN_SHIP).toEqual({ x: 228, y: 42, w: 240, h: 170 });
    expect(OWN_SHIP_BOX).toEqual({ x: 236, y: 82, w: 224, h: 122 });
  });
  it('lies on the stage, right of the status column, clear of the tabs, stations, FLIGHT, SIDE and CONTACT', () => {
    expect(OWN_SHIP.x).toBeGreaterThanOrEqual(0); expect(OWN_SHIP.y).toBeGreaterThanOrEqual(0);
    expect(OWN_SHIP.x + OWN_SHIP.w).toBeLessThanOrEqual(INTERNAL_W); expect(OWN_SHIP.y + OWN_SHIP.h).toBeLessThanOrEqual(INTERNAL_H);
    expect(OWN_SHIP.x).toBeGreaterThanOrEqual(STATUS.x + STATUS.w);
    const blocks: Rect[] = [
      { x: TABS.x, y: TABS.y, w: 4 * TABS.w + 3 * TABS.gap, h: TABS.h },
      ...(['helm', 'weapons', 'science'] as const).map((s) => ({ x: STATION.x, y: stationTop(s), w: STATION.w, h: STATION.h[s] })),
      FLIGHT, { x: SIDE.x, y: SIDE.y, w: SIDE.w, h: SIDE_H }, CONTACT
    ];
    for (const b of blocks) expect(overlaps(OWN_SHIP, b), JSON.stringify(b)).toBe(false);
  });
  it('the box lies inside the window and the two header rows end above it', () => {
    expect(OWN_SHIP_BOX.x).toBeGreaterThanOrEqual(OWN_SHIP.x); expect(OWN_SHIP_BOX.y).toBeGreaterThanOrEqual(OWN_SHIP.y);
    expect(OWN_SHIP_BOX.x + OWN_SHIP_BOX.w).toBeLessThanOrEqual(OWN_SHIP.x + OWN_SHIP.w);
    expect(OWN_SHIP_BOX.y + OWN_SHIP_BOX.h).toBeLessThanOrEqual(OWN_SHIP.y + OWN_SHIP.h);
    expect(OWN_SHIP_TITLE_Y + FONT_NATIVE).toBeLessThanOrEqual(OWN_SHIP_STATUS_Y);
    expect(OWN_SHIP_STATUS_Y + FONT_NATIVE).toBeLessThanOrEqual(OWN_SHIP_BOX.y);
    expect(OWN_SHIP_X0 + 136 + 56).toBeLessThanOrEqual(OWN_SHIP_RIGHT - 24);   // the bar ends left of a 3-digit hull value
    expect(OWN_SHIP_X0 + 36 + 4 * 12 + 8).toBeLessThanOrEqual(OWN_SHIP_X0 + 100);   // 5 shield pips end before HULL
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/ownShipLayout.test.ts`
Expected: FAIL. The import of `OWN_SHIP` and the other new names is undefined, so the `toEqual` checks fail.

- [ ] **Step 3: Add the constants**

Append to `src/renderer/src/render/duel/consoleLayout.ts`:

```ts
/** Own ship window spec §3: top left, right of the status table, mirroring CONTACT across the map (x 228 to 468, y 42 to 212). */
export const OWN_SHIP = { x: STATUS.x + STATUS.w + EDGE, y: STATUS.y, w: 240, h: 170 } as const;
/** Its drawing box under the two header rows (x 236 to 460, y 82 to 204). */
export const OWN_SHIP_BOX = { x: OWN_SHIP.x + 8, y: OWN_SHIP.y + 40, w: OWN_SHIP.w - 16, h: OWN_SHIP.h - 48 } as const;
/** Spec §2: the header's left and right text edges, the title row and the SHLD / HULL row. */
export const OWN_SHIP_X0 = OWN_SHIP.x + 8, OWN_SHIP_RIGHT = OWN_SHIP.x + OWN_SHIP.w - 8;
export const OWN_SHIP_TITLE_Y = OWN_SHIP.y + 4, OWN_SHIP_STATUS_Y = OWN_SHIP.y + 20;
```

- [ ] **Step 4: Move the SVG helpers**

Create `src/renderer/src/ui/duel/svgPaths.ts`:

```ts
// SVG path text from flat coordinate arrays, shared by the contact window and the own ship window (own ship window spec §4).
/** [x0, y0, x1, y1, ...] as an SVG `points` attribute. */
export const polyPoints = (p: readonly number[]): string => { const out: string[] = []; for (let k = 0; k + 1 < p.length; k += 2) out.push(`${p[k]},${p[k + 1]}`); return out.join(' '); };
/** Segments [x1, y1, x2, y2, ...] as one SVG path of move-line pairs. */
export const segPath = (s: readonly number[]): string => { let d = ''; for (let k = 0; k + 3 < s.length; k += 4) d += `M${s[k]} ${s[k + 1]}L${s[k + 2]} ${s[k + 3]}`; return d; };
```

In `src/renderer/src/ui/duel/ContactWindow.tsx`:
- Delete the two lines `const polyPoints = ...` and `const segPath = ...` (currently lines 24 and 25).
- Add `import { polyPoints, segPath } from './svgPaths';` after the `PixelText` import.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/ownShipLayout.test.ts tests/contactWindow.test.tsx`
Expected: PASS (both files).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/duel/consoleLayout.ts src/renderer/src/ui/duel/svgPaths.ts src/renderer/src/ui/duel/ContactWindow.tsx tests/ownShipLayout.test.ts
git commit -m "feat(own-ship-window): the window's layout rects; share the SVG path helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The own ship view model and the fire watch

**Files:**
- Create: `src/renderer/src/render/duel/ownShipModel.ts`
- Test: `tests/ownShipModel.test.ts`

**Interfaces:**
- Consumes: `OWN_SHIP_BOX` (Task 1); from the codebase:
  - `pointBurning(d, p)` and `extinguishProgress(d, p)` from `sim/duel/fire`;
  - `classOf(t, slot)` and `CREW_SLOT` from `sim/tactical/state`;
  - `Position`, `Life`, `LifeState` from `sim/components`;
  - `CRT`, `blink`, `ALERT_BLINK_HZ`, `DAMAGE_BLINK_HZ`, `HATCH_SPACING`, `HATCH_ANGLE`, `roomLevel` from `render/tactical/crtTheme`;
  - `hatchSegments(poly, spacing, angle)` from `render/tactical/dashModel`. It returns a fresh array per call when `out` is omitted;
  - `HIT_FRESH_TICKS` from `render/impactModel`.
- Produces:
  ```ts
  export interface OwnShipView {
    shields: { up: number; of: number };
    hull: { value: number; fill: number; alert: boolean; block: number | null };
    tiles: { x: number; y: number; s: number; fill: number }[];
    edges: { colour: number; segments: number[] }[];
    hatch: number[];
    fires: { x: number; y: number; w: number; progress: number }[];
    crew: { x: number; y: number; downed: boolean }[];
    flash: boolean;
  }
  export interface OwnRoomLook { fill: number; outline: number; hatch: boolean }
  export function ownRoomLook(level: 0 | 1 | 2, burning: boolean, t: number): OwnRoomLook;
  export function ownShipFit(gw: number, gh: number, box: Box): { s: number; ox: number; oy: number };
  export function tileEdges(owner: ArrayLike<number>, gw: number, gh: number, k: number, s: number, ox: number, oy: number, out: number[]): void;
  export function ownShipModel(d: DuelState, box: Box, t: number, flashUntil: number): OwnShipView;
  export const FIRE_FLASH_S = 2;
  export interface FireWatch { tick: number; burning: boolean[] }
  export function fireWatch(w: FireWatch | null, d: DuelState, t: number, flashUntil: number): { watch: FireWatch; flashUntil: number };
  ```
  `Box` is `{ x: number; y: number; w: number; h: number }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ownShipModel.test.ts`:

```ts
// Own ship window spec §2, §4, §6: the view model (fit, looks, edges, fire, hull, crew, flash) and the fire watch.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import hound from '../src/renderer/src/sim/ship/hound.json';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import starter from '../src/renderer/src/sim/ship/starter.json';
import valkyrn from '../src/renderer/src/sim/ship/valkyrn.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { Life, LifeState, Position } from '../src/renderer/src/sim/components';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { extinguishProgress } from '../src/renderer/src/sim/duel/fire';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { classOf, Room } from '../src/renderer/src/sim/tactical/state';
import { OWN_SHIP_BOX } from '../src/renderer/src/render/duel/consoleLayout';
import { CRT } from '../src/renderer/src/render/tactical/crtTheme';
import {
  FIRE_FLASH_S, fireWatch, ownRoomLook, ownShipFit, ownShipModel, tileEdges, type OwnShipView
} from '../src/renderer/src/render/duel/ownShipModel';

const layout = parseShip(cutter);
const box = OWN_SHIP_BOX;
const LIT = 0.25, DARK = 0;   // blink(t, 2): floor(t * 4) % 2 is 1 at 0.25 and 0 at 0
const withDuel = (f: (d: DuelState) => void): void => { const d = createDuel(layout, 5); try { f(d); } finally { disposeDuel(d); } };
const roomOf = (d: DuelState, r: number): number => d.points.find((p) => p.tacticalRoom === r)!.room;
/** The view's tile for interior tile index k. */
const tileOf = (d: DuelState, v: OwnShipView, k: number) => {
  const gw = d.interior.derived.width, f = ownShipFit(gw, d.interior.derived.height, box);
  return v.tiles.find((q) => q.x === f.ox + (k % gw) * f.s && q.y === f.oy + Math.floor(k / gw) * f.s)!;
};

describe('the fit (spec §4)', () => {
  it('keeps every room tile inside the box and centres the grid', () => withDuel((d) => {
    const v = ownShipModel(d, box, 0, 0), gw = d.interior.derived.width, gh = d.interior.derived.height, f = ownShipFit(gw, gh, box);
    expect(v.tiles.length).toBe(d.interior.derived.roomTiles.reduce((n, r) => n + r.length, 0));
    for (const q of v.tiles) {
      expect(q.x).toBeGreaterThanOrEqual(box.x); expect(q.y).toBeGreaterThanOrEqual(box.y);
      expect(q.x + q.s).toBeLessThanOrEqual(box.x + box.w + 1e-9); expect(q.y + q.s).toBeLessThanOrEqual(box.y + box.h + 1e-9);
    }
    expect(Math.abs((f.ox - box.x) - (box.x + box.w - (f.ox + gw * f.s)))).toBeLessThanOrEqual(1);
    expect(Math.abs((f.oy - box.y) - (box.y + box.h - (f.oy + gh * f.s)))).toBeLessThanOrEqual(1);
  }));
  it('floors the tile size at 3 px and above, keeps it fractional below', () => {
    expect(ownShipFit(10, 5, { x: 0, y: 0, w: 75, h: 75 }).s).toBe(7);
    expect(ownShipFit(100, 5, { x: 0, y: 0, w: 250, h: 75 }).s).toBeCloseTo(2.5, 9);
  });
  it('every room of every shipped layout is a rectangle', () => {
    for (const json of [cutter, hound, skiff, starter, valkyrn]) {
      const dv = deriveLayout(parseShip(json));
      dv.roomTiles.forEach((tiles, room) => {
        const xs = tiles.map((k) => k % dv.width), ys = tiles.map((k) => Math.floor(k / dv.width));
        const area = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
        expect(tiles.length, `${(json as { id?: string }).id} room ${room}`).toBe(area);
      });
    }
  });
});

describe('edges (spec §4)', () => {
  it('a single-room 2×2 block yields only its 8 perimeter segments', () => {
    const owner = [0, 0, 0, 0], out: number[] = [];
    for (let k = 0; k < 4; k++) tileEdges(owner, 2, 2, k, 10, 0, 0, out);
    expect(out.length / 4).toBe(8);
    for (let k = 0; k < out.length; k += 4) {   // every segment lies on the block's border
      const onBorder = (v: number) => v === 0 || v === 20;
      expect((out[k] === out[k + 2] && onBorder(out[k]!)) || (out[k + 1] === out[k + 3] && onBorder(out[k + 1]!))).toBe(true);
    }
  });
  it('two rooms side by side outline their shared side twice, once per room', () => {
    const out: number[] = [];
    tileEdges([0, 1], 2, 1, 0, 10, 0, 0, out); tileEdges([0, 1], 2, 1, 1, 10, 0, 0, out);
    expect(out.length / 4).toBe(8);
  });
});

describe('the own-ship look table (spec §2)', () => {
  it('normal, level 1, level 2 (hatch in phase 1 only)', () => {
    expect(ownRoomLook(0, false, LIT)).toEqual({ fill: CRT.glass, outline: CRT.main, hatch: false });
    expect(ownRoomLook(1, false, LIT)).toEqual({ fill: CRT.dim, outline: CRT.main, hatch: false });
    expect(ownRoomLook(2, false, LIT)).toEqual({ fill: CRT.dim, outline: CRT.main, hatch: true });
    expect(ownRoomLook(2, false, DARK)).toEqual({ fill: CRT.dim, outline: CRT.main, hatch: false });
  });
  it('fire overrides damage: hot or mid fill, hot outline, never a hatch', () => {
    for (const level of [0, 1, 2] as const) {
      expect(ownRoomLook(level, true, LIT)).toEqual({ fill: CRT.hot, outline: CRT.hot, hatch: false });
      expect(ownRoomLook(level, true, DARK)).toEqual({ fill: CRT.mid, outline: CRT.hot, hatch: false });
    }
  });
  it('damage never uses CRT.hot', () => {
    for (const level of [0, 1, 2] as const) for (const t of [LIT, DARK]) expect(ownRoomLook(level, false, t).fill).not.toBe(CRT.hot);
  });
});

describe('the model on a duel (spec §2, §4)', () => {
  it('a damaged room takes the table fill; level 2 hatches in phase 1 only', () => withDuel((d) => {
    d.tactical.systems[0].rooms[Room.Weapons] = 1; d.tactical.systems[0].rooms[Room.Engines] = 2;
    const w = d.interior.derived.roomTiles[roomOf(d, Room.Weapons)]![0]!, e = d.interior.derived.roomTiles[roomOf(d, Room.Engines)]![0]!;
    expect(tileOf(d, ownShipModel(d, box, LIT, 0), w).fill).toBe(CRT.dim);
    expect(tileOf(d, ownShipModel(d, box, LIT, 0), e).fill).toBe(CRT.dim);
    expect(ownShipModel(d, box, LIT, 0).hatch.length).toBeGreaterThan(0);
    expect(ownShipModel(d, box, DARK, 0).hatch).toEqual([]);
  }));
  it('a burning room at level 1 and 2: the fire fill in both phases, no hatch, a bar only once the extinguish has begun', () => withDuel((d) => {
    const room = roomOf(d, Room.Engines), k = d.interior.derived.roomTiles[room]![0]!, p = d.points.find((q) => q.room === room)!;
    igniteRoom(d.interior, room);
    for (const level of [1, 2]) {
      d.tactical.systems[0].rooms[Room.Engines] = level;
      expect(tileOf(d, ownShipModel(d, box, LIT, 0), k).fill).toBe(CRT.hot);
      expect(tileOf(d, ownShipModel(d, box, DARK, 0), k).fill).toBe(CRT.mid);
      expect(ownShipModel(d, box, LIT, 0).hatch).toEqual([]);
      expect(ownShipModel(d, box, LIT, 0).edges.find((g) => g.colour === CRT.hot)!.segments.length).toBeGreaterThan(0);
      expect(ownShipModel(d, box, LIT, 0).fires).toEqual([]);
    }
    d.interior.rooms.fireRepair[room] = 0.25;
    const fires = ownShipModel(d, box, LIT, 0).fires;
    expect(fires).toHaveLength(1);
    expect(fires[0]!.progress).toBe(extinguishProgress(d, p));
  }));
  it('the hull alerts at 25 % or below, with the block alternating hot and main', () => withDuel((d) => {
    const max = classOf(d.tactical, 0).hull, sys = d.tactical.systems[0];
    sys.hull = Math.floor(max / 4);
    expect(ownShipModel(d, box, LIT, 0).hull).toEqual({ value: sys.hull, fill: sys.hull / max, alert: true, block: CRT.hot });
    expect(ownShipModel(d, box, DARK, 0).hull.block).toBe(CRT.main);
    sys.hull = Math.floor(max / 4) + 1;
    expect(ownShipModel(d, box, LIT, 0).hull).toMatchObject({ alert: false, block: null });
  }));
  it('the shields match the crew ship', () => withDuel((d) => {
    d.tactical.systems[0].shields = 1;
    expect(ownShipModel(d, box, 0, 0).shields).toEqual({ up: 1, of: Math.max(classOf(d.tactical, 0).shields.layers, 1) });
  }));
  it('crew centres sit at origin + position * s; a downed crew member is marked', () => withDuel((d) => {
    const f = ownShipFit(d.interior.derived.width, d.interior.derived.height, box), eid = d.interior.crew[0]!;
    Life.state[eid] = LifeState.Downed;
    const v = ownShipModel(d, box, 0, 0);
    expect(v.crew[0]).toEqual({ x: f.ox + Position.x[eid]! * f.s, y: f.oy + Position.y[eid]! * f.s, downed: true });
    expect(v.crew).toHaveLength(d.interior.crew.length);
  }));
  it('flash only before flashUntil and in the lit phase', () => withDuel((d) => {
    expect(ownShipModel(d, box, LIT, LIT + 1).flash).toBe(true);
    expect(ownShipModel(d, box, DARK, 1).flash).toBe(false);
    expect(ownShipModel(d, box, LIT, LIT).flash).toBe(false);
  }));
});

describe('the fire watch (spec §4)', () => {
  it('first frame re-baselines; a new fire flashes for FIRE_FLASH_S; an old fire does not', () => withDuel((d) => {
    let r = fireWatch(null, d, 10, 0);
    expect(r.flashUntil).toBe(0);
    igniteRoom(d.interior, roomOf(d, Room.Shields));
    r = fireWatch(r.watch, d, 11, r.flashUntil);
    expect(r.flashUntil).toBe(11 + FIRE_FLASH_S);
    r = fireWatch(r.watch, d, 12, r.flashUntil);
    expect(r.flashUntil).toBe(11 + FIRE_FLASH_S);
  }));
  it('a stale tick (back, or more than HIT_FRESH_TICKS ahead) re-baselines with no flash', () => withDuel((d) => {
    const base = fireWatch(null, d, 0, 0).watch;
    igniteRoom(d.interior, roomOf(d, Room.Shields));
    d.tactical.tick = base.tick + 1000;
    expect(fireWatch(base, d, 1, 0).flashUntil).toBe(0);
    d.tactical.tick = base.tick - 1;
    expect(fireWatch({ ...base, tick: base.tick }, d, 1, 0).flashUntil).toBe(0);
  }));
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/ownShipModel.test.ts`
Expected: FAIL with "Failed to resolve import ... ownShipModel".

- [ ] **Step 3: Write the model**

Create `src/renderer/src/render/duel/ownShipModel.ts`:

```ts
// The own ship window (own ship window spec §2, §4): the crew's real interior shrunk into the window's box, in the amber
// CRT ramp, with fire, damage, crew, hull and shields resolved here (colours and blinks), so React does no blinking.
// Pure: no React, no Pixi. Also the fire watch the scene keeps for the border's fire-start flash.
import { extinguishProgress, pointBurning } from '../../sim/duel/fire';
import type { DuelState } from '../../sim/duel/state';
import { Life, LifeState, Position } from '../../sim/components';
import { classOf, CREW_SLOT } from '../../sim/tactical/state';
import { ALERT_BLINK_HZ, blink, CRT, DAMAGE_BLINK_HZ, HATCH_ANGLE, HATCH_SPACING, roomLevel } from '../tactical/crtTheme';
import { hatchSegments } from '../tactical/dashModel';
import { HIT_FRESH_TICKS } from '../impactModel';

type Box = { x: number; y: number; w: number; h: number };

export interface OwnShipView {
  shields: { up: number; of: number };
  /** `block`: the resolved inverse-block colour while `alert` (hull at or below a quarter), else null. */
  hull: { value: number; fill: number; alert: boolean; block: number | null };
  /** One per room tile, internal px, `s` the tile size. */
  tiles: { x: number; y: number; s: number; fill: number }[];
  /** Outline segments [x1, y1, x2, y2, ...] grouped by colour. */
  edges: { colour: number; segments: number[] }[];
  /** Level-2 hatch segments in their lit phase (drawn CRT.main), else []. */
  hatch: number[];
  /** The 2 px bar under each burning room whose extinguish has begun. */
  fires: { x: number; y: number; w: number; progress: number }[];
  /** Crew centres, internal px. */
  crew: { x: number; y: number; downed: boolean }[];
  /** The border is in the lit phase of its fire-start flash. */
  flash: boolean;
}

export interface OwnRoomLook { fill: number; outline: number; hatch: boolean }

/** Spec §2's look table. Fire overrides damage; damage never uses CRT.hot; fire never hatches. */
export function ownRoomLook(level: 0 | 1 | 2, burning: boolean, t: number): OwnRoomLook {
  if (burning) return { fill: blink(t, ALERT_BLINK_HZ) === 1 ? CRT.hot : CRT.mid, outline: CRT.hot, hatch: false };
  if (level === 0) return { fill: CRT.glass, outline: CRT.main, hatch: false };
  return { fill: CRT.dim, outline: CRT.main, hatch: level === 2 && blink(t, DAMAGE_BLINK_HZ) === 1 };
}

/** Spec §4: the uniform tile size (floored when at least 3 px) and the grid's whole-pixel origin, centred in `box`. */
export function ownShipFit(gw: number, gh: number, box: Box): { s: number; ox: number; oy: number } {
  let s = Math.min(box.w / gw, box.h / gh);
  if (s >= 3) s = Math.floor(s);
  return { s, ox: Math.round(box.x + (box.w - gw * s) / 2), oy: Math.round(box.y + (box.h - gh * s) / 2) };
}

/** Spec §4: tile k's sides whose neighbour is not a tile of the same room (owner[k], -1 none), pushed to `out`. */
export function tileEdges(owner: ArrayLike<number>, gw: number, gh: number, k: number, s: number, ox: number, oy: number, out: number[]): void {
  const cx = k % gw, cy = (k - cx) / gw, room = owner[k]!, x = ox + cx * s, y = oy + cy * s;
  const other = (nx: number, ny: number): boolean => nx < 0 || ny < 0 || nx >= gw || ny >= gh || owner[ny * gw + nx] !== room;
  if (other(cx, cy - 1)) out.push(x, y, x + s, y);
  if (other(cx, cy + 1)) out.push(x, y + s, x + s, y + s);
  if (other(cx - 1, cy)) out.push(x, y, x, y + s);
  if (other(cx + 1, cy)) out.push(x + s, y, x + s, y + s);
}

export function ownShipModel(d: DuelState, box: Box, t: number, flashUntil: number): OwnShipView {
  const st = d.interior, dv = st.derived, gw = dv.width, gh = dv.height, { s, ox, oy } = ownShipFit(gw, gh, box);
  const sys = d.tactical.systems[CREW_SLOT]!, cls = classOf(d.tactical, CREW_SLOT);
  const tiles: OwnShipView['tiles'] = [], byColour = new Map<number, number[]>(), hatch: number[] = [], fires: OwnShipView['fires'] = [];
  dv.roomTiles.forEach((roomTiles, room) => {
    if (roomTiles.length === 0) return;
    const p = d.points.find((q) => q.room === room), burning = !!p && pointBurning(d, p);
    const look = ownRoomLook(p ? roomLevel(sys.rooms[p.tacticalRoom]!) : 0, burning, t);
    const segs = byColour.get(look.outline) ?? []; byColour.set(look.outline, segs);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of roomTiles) {
      const cx = k % gw, cy = (k - cx) / gw, x = ox + cx * s, y = oy + cy * s;
      tiles.push({ x, y, s, fill: look.fill });
      tileEdges(dv.roomOfTile, gw, gh, k, s, ox, oy, segs);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + s); y1 = Math.max(y1, y + s);
    }
    if (look.hatch) hatch.push(...hatchSegments([x0, y0, x1, y0, x1, y1, x0, y1], HATCH_SPACING, HATCH_ANGLE));
    if (burning && p) { const progress = extinguishProgress(d, p); if (progress > 0) fires.push({ x: x0, y: y1 - 2, w: x1 - x0, progress }); }
  });
  const alert = sys.hull <= cls.hull / 4;
  return {
    shields: { up: sys.shields, of: Math.max(cls.shields.layers, sys.shields) },
    hull: { value: sys.hull, fill: Math.max(0, Math.min(1, sys.hull / cls.hull)), alert, block: alert ? (blink(t, ALERT_BLINK_HZ) === 1 ? CRT.hot : CRT.main) : null },
    tiles,
    edges: [...byColour].filter(([, segments]) => segments.length > 0).map(([colour, segments]) => ({ colour, segments })),
    hatch, fires,
    crew: st.crew.map((eid) => ({ x: ox + Position.x[eid]! * s, y: oy + Position.y[eid]! * s, downed: Life.state[eid] === LifeState.Downed })),
    flash: t < flashUntil && blink(t, ALERT_BLINK_HZ) === 1
  };
}

/** Spec §4: the border's fire-start flash, in presentation seconds. */
export const FIRE_FLASH_S = 2;
export interface FireWatch { tick: number; burning: boolean[] }

/** Spec §4: one drawn frame of the fire watch. No watch, a stale tick (back, or more than HIT_FRESH_TICKS on) or a
 *  changed length re-baselines with no flash; otherwise a point room burning now that did not before flashes. The scene
 *  passes null after an epoch reset. */
export function fireWatch(w: FireWatch | null, d: DuelState, t: number, flashUntil: number): { watch: FireWatch; flashUntil: number } {
  const burning = d.points.map((p) => pointBurning(d, p)), tick = d.tactical.tick, watch = { tick, burning };
  const fresh = !!w && tick >= w.tick && tick - w.tick <= HIT_FRESH_TICKS && w.burning.length === burning.length;
  if (!fresh) return { watch, flashUntil };
  return { watch, flashUntil: burning.some((b, k) => b && !w!.burning[k]) ? t + FIRE_FLASH_S : flashUntil };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/ownShipModel.test.ts`
Expected: PASS. If the rectangle test fails for one layout, stop and report it. The spec's §4 rectangle assumption would then be false, and the damage rect needs a polygon instead. If `Life.state[eid] = ...` fails because `Life.state` is a typed array of another name, read `sim/components.ts:5` and use its field name.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/render/duel/ownShipModel.ts tests/ownShipModel.test.ts
git commit -m "feat(own-ship-window): the own ship view model and the fire watch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The OwnShipWindow component and the view field

**Files:**
- Modify: `src/renderer/src/ui/views.ts` (the `DuelUiView` interface, lines 13-24)
- Create: `src/renderer/src/ui/duel/OwnShipWindow.tsx`
- Modify: `src/renderer/src/ui/duel/DuelUi.tsx`
- Test: `tests/ownShipWindow.test.tsx`

**Interfaces:**
- Consumes: `OwnShipView`, `ownShipModel` (Task 2); `OWN_SHIP`, `OWN_SHIP_BOX`, `OWN_SHIP_X0`, `OWN_SHIP_RIGHT`, `OWN_SHIP_TITLE_Y`, `OWN_SHIP_STATUS_Y` (Task 1); `polyPoints`, `segPath` (Task 1).
- Produces: `DuelUiView.ownShip?: OwnShipView | null`. Also `OwnShipWindow({ ownShip })`, which marks its DOM with `data-ui-own-ship` (root), `data-ui-own-ship-box` (svg), `data-ui-own-tile` (each tile rect), `data-ui-own-crew` (each dot) and `data-ui-own-flash` (the flash border).

- [ ] **Step 1: Write the failing test**

Create `tests/ownShipWindow.test.tsx`:

```tsx
// @vitest-environment jsdom
// Own ship window spec §2, §4, §6: the component draws the panel, the header and one tile rect per room tile, takes the
// pointer, and is absent when the frame carries no ownShip.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { ownShipModel, type OwnShipView } from '../src/renderer/src/render/duel/ownShipModel';
import { OWN_SHIP_BOX } from '../src/renderer/src/render/duel/consoleLayout';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const view = (ownShip: OwnShipView | null | undefined): DuelUiView => ({
  readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console: null,
  ...(ownShip === undefined ? {} : { ownShip })
});
function mount(ownShip: OwnShipView | null | undefined): void {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  act(() => duel.frame(view(ownShip)));
}
const texts = () => Array.from(document.querySelectorAll('canvas')).map((e) => (e as HTMLElement).dataset.text);

describe('the own ship window (spec §2)', () => {
  it('draws the title, the header labels, one tile per room tile and a dot per crew member', () => {
    const d = createDuel(parseShip(cutter), 5);
    try {
      const v = ownShipModel(d, OWN_SHIP_BOX, 0, 0);
      mount(v);
      for (const t of ['OWN SHIP', 'SHLD', 'HULL', String(v.hull.value)]) expect(texts(), t).toContain(t);
      expect(document.querySelector('[data-ui-own-ship]')).not.toBeNull();
      expect(document.querySelector('[data-ui-own-ship-box]')).not.toBeNull();
      expect(document.querySelectorAll('[data-ui-own-tile]').length).toBe(v.tiles.length);
      expect(document.querySelectorAll('[data-ui-own-crew]').length).toBe(v.crew.length);
      expect(document.querySelector('[data-ui-own-flash]')).toBeNull();
    } finally { disposeDuel(d); }
  });
  it('draws the flash border while flash is set', () => {
    const d = createDuel(parseShip(cutter), 5);
    try { mount({ ...ownShipModel(d, OWN_SHIP_BOX, 0, 0), flash: true }); expect(document.querySelector('[data-ui-own-flash]')).not.toBeNull(); }
    finally { disposeDuel(d); }
  });
  it('renders nothing when ownShip is null or absent', () => {
    mount(null); expect(document.querySelector('[data-ui-own-ship]')).toBeNull(); cleanup();
    mount(undefined); expect(document.querySelector('[data-ui-own-ship]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/ownShipWindow.test.tsx`
Expected: FAIL. Typecheck may complain that `ownShip` does not exist on `DuelUiView`, and at runtime `[data-ui-own-ship]` is null.

- [ ] **Step 3: Add the view field**

In `src/renderer/src/ui/views.ts`:
- add the import `import type { OwnShipView } from '../render/duel/ownShipModel';` beside the other `import type` lines;
- inside `DuelUiView`, after the `contact?: ContactView | null;` member, add:

```ts
  /** The own ship window (own ship window spec §4): set exactly when the scene's onMap is true; absent or null draws none. */
  ownShip?: OwnShipView | null;
```

- [ ] **Step 4: Write the component**

Create `src/renderer/src/ui/duel/OwnShipWindow.tsx`:

```tsx
// The own ship window (own ship window spec §2, §4): the crew's interior at OWN_SHIP, top left, mirroring the contact
// window. Display only: the root takes the pointer and swallows clicks, the context menu and the wheel so nothing reaches
// the map. The view's colours are resolved; React does no blinking.
import { memo, type SyntheticEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { OwnShipView } from '../../render/duel/ownShipModel';
import { OWN_SHIP, OWN_SHIP_BOX, OWN_SHIP_RIGHT, OWN_SHIP_STATUS_Y, OWN_SHIP_TITLE_Y, OWN_SHIP_X0 } from '../../render/duel/consoleLayout';
import { FONT_NATIVE, textPx } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useUi } from '../context';
import { Bar } from '../stage/Bar';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { boxCss } from '../stage/geometry';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';
import { segPath } from './svgPaths';

const stop = (e: SyntheticEvent): void => e.preventDefault();
const swallow = (e: ReactWheelEvent): void => e.stopPropagation();
const x0 = OWN_SHIP_X0, right = OWN_SHIP_RIGHT, rowY = OWN_SHIP_STATUS_Y;

export const OwnShipWindow = memo(function OwnShipWindow({ ownShip: v }: { ownShip: OwnShipView }) {
  const l = useUi((s) => s.layout), b = OWN_SHIP_BOX;
  const value = String(v.hull.value), valueW = Math.ceil(textPx(value, 1));
  return (
    <>
      <div data-ui-own-ship="" onPointerDown={stop} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop} onWheel={swallow}
        style={{ position: 'absolute', boxSizing: 'border-box', ...boxCss(OWN_SHIP.x, OWN_SHIP.y, OWN_SHIP.w, OWN_SHIP.h, l), pointerEvents: 'auto' }} />
      <Panel x={OWN_SHIP.x} y={OWN_SHIP.y} w={OWN_SHIP.w} h={OWN_SHIP.h} />
      {v.flash && <Box x={OWN_SHIP.x} y={OWN_SHIP.y} w={OWN_SHIP.w} h={OWN_SHIP.h} attrs={{ 'data-ui-own-flash': '' }}
        style={{ boxSizing: 'border-box', border: `2px solid ${hex(CRT.hot)}`, pointerEvents: 'none' }} />}
      <PixelText text="OWN SHIP" x={x0} y={OWN_SHIP_TITLE_Y} size={FONT_NATIVE} tint={CRT.main} />
      <PixelText text="SHLD" x={x0} y={rowY} size={FONT_NATIVE} tint={CRT.mid} />
      {Array.from({ length: v.shields.of }, (_, k) => (
        <Box key={k} x={x0 + 36 + k * 12} y={rowY + 4} w={8} h={8} attrs={{ 'data-ui-own-pip': k < v.shields.up ? 'up' : 'down' }}
          style={k < v.shields.up ? { background: hex(CRT.main) } : { border: `1px solid ${hex(CRT.mid)}` }} />
      ))}
      <PixelText text="HULL" x={x0 + 100} y={rowY} size={FONT_NATIVE} tint={CRT.mid} />
      <Bar x={x0 + 136} y={rowY + 6} w={56} h={6} fill={v.hull.fill} colour={CRT.main} />
      {v.hull.block !== null && <Box x={right - valueW - 2} y={rowY} w={valueW + 4} h={FONT_NATIVE} attrs={{ 'data-ui-own-hull-alert': '' }} style={{ background: hex(v.hull.block) }} />}
      <PixelText text={value} x={right} y={rowY} size={FONT_NATIVE} tint={v.hull.block !== null ? CRT.glass : CRT.main} anchorX={1} />
      <svg data-ui-own-ship-box="" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="none" shapeRendering="crispEdges"
        style={{ position: 'absolute', ...boxCss(b.x, b.y, b.w, b.h, l), overflow: 'hidden', pointerEvents: 'none' }}>
        {v.tiles.map((q, k) => <rect key={k} data-ui-own-tile="" x={q.x} y={q.y} width={q.s} height={q.s} fill={hex(q.fill)} />)}
        {v.edges.map((g) => <path key={g.colour} d={segPath(g.segments)} stroke={hex(g.colour)} strokeWidth={1} fill="none" />)}
        {v.hatch.length > 0 && <path d={segPath(v.hatch)} stroke={hex(CRT.main)} strokeWidth={1} fill="none" />}
        {v.fires.map((f, k) => (
          <g key={k} data-ui-own-fire="">
            <rect x={f.x} y={f.y} width={f.w} height={2} fill={hex(CRT.glass)} />
            <rect x={f.x} y={f.y} width={f.w * f.progress} height={2} fill={hex(CRT.main)} />
          </g>
        ))}
        {v.crew.map((c, k) => c.downed
          ? <rect key={k} data-ui-own-crew="downed" x={c.x - 2} y={c.y - 2} width={5} height={5} fill={hex(CRT.glass)} stroke={hex(CRT.hot)} strokeWidth={1} />
          : <g key={k} data-ui-own-crew="up"><rect x={c.x - 2.5} y={c.y - 2.5} width={5} height={5} fill={hex(CRT.glass)} /><rect x={c.x - 1.5} y={c.y - 1.5} width={3} height={3} fill={hex(CRT.hot)} /></g>)}
      </svg>
    </>
  );
});
```

If `textPx` or `hex` lives elsewhere, use the same import paths `ContactWindow.tsx` uses (it imports `textPx` from `../../render/theme` and `hex` from `../stage/color`).

- [ ] **Step 5: Render it in DuelUi**

In `src/renderer/src/ui/duel/DuelUi.tsx`:
- add `import { OwnShipWindow } from './OwnShipWindow';` after the `ContactWindow` import;
- insert this line directly before `{duel.contact && <ContactWindow contact={duel.contact} />}`:

```tsx
          {duel.ownShip && <OwnShipWindow ownShip={duel.ownShip} />}
```

This puts it after `ReadoutPanel` and the station blocks, and before `ContactWindow`, `TargetingLine`, `SitCard` and `Banners`, which is the spec's §3 draw order.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/ownShipWindow.test.tsx tests/contactWindow.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/ui/views.ts src/renderer/src/ui/duel/OwnShipWindow.tsx src/renderer/src/ui/duel/DuelUi.tsx tests/ownShipWindow.test.tsx
git commit -m "feat(own-ship-window): the OwnShipWindow component on the duel UI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Off-screen arrows go around the window

**Files:**
- Modify: `src/renderer/src/render/tactical/tacticalModel.ts`:
  - the `ArrowDraw` interface (line 72);
  - the `TacticalModelInput` members (lines 108-133);
  - `edgePoint` (line 256), which stays as it is;
  - `spreadArrows` (lines 271-298);
  - the `arrow` closure and the `spreadArrows` call (lines 377-388).
- Test: `tests/tacticalModel.test.ts` (add a `describe` at the end)

**Interfaces:**
- Produces:
  - `TacticalModelInput.avoid?: { x: number; y: number; w: number; h: number }`.
  - `ArrowDraw.edge?: 'avoidRight' | 'avoidBottom'`.
  - `export function aroundAvoid(vp: Viewport, reserveLeft: number, reserveRight: number, reserveTop: number, avoid: Rect, p: { x: number; y: number }, e: { x: number; y: number; angle: number } | null): { x: number; y: number; angle: number; edge?: 'avoidRight' | 'avoidBottom' } | null`.
  - `spreadArrows(arrows, vp, reserveRight, reserveLeft = 0, reserveTop = 0, avoid?: Rect)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/tacticalModel.test.ts`. Add `aroundAvoid`, `spreadArrows` and `type ArrowDraw` to its import from `tacticalModel`, and import `OWN_SHIP` from `../src/renderer/src/render/duel/consoleLayout`.

```ts
describe('arrows around the own ship window (own ship window spec §3)', () => {
  const RL = 228, RR = 156, RT = 44, m = 28, AR = OWN_SHIP.x + OWN_SHIP.w + m, AB = OWN_SHIP.y + OWN_SHIP.h + m;   // A's right 496, bottom 240
  const inWindow = (a: { x: number; y: number }) => a.x > OWN_SHIP.x && a.x < OWN_SHIP.x + OWN_SHIP.w && a.y > OWN_SHIP.y && a.y < OWN_SHIP.y + OWN_SHIP.h;
  const onA = (a: { x: number; y: number }) => (Math.abs(a.x - AR) < 1e-6 && a.y <= AB + 1e-6) || (Math.abs(a.y - AB) < 1e-6 && a.x <= AR + 1e-6);
  it('an object hidden under the window gets an arrow on A, not inside the window', () => {
    const st = createTacticalState(4), cam = createCamera(0, 0, 1.0); pan(cam, 0, 1);
    Object.assign(st.ships[0], { x: 300 - 640, y: 150 - 360 - 1 });   // screen (300, 150): under the window
    expect(tacticalModel(input(st, cam, { reserveLeft: RL, reserveRight: RR, reserveTop: RT })).arrows.find((a) => a.target === 'ship')).toBeUndefined();
    const a = tacticalModel(input(st, cam, { reserveLeft: RL, reserveRight: RR, reserveTop: RT, avoid: OWN_SHIP })).arrows.find((x) => x.target === 'ship')!;
    expect(a.edge).toBeDefined(); expect(onA(a)).toBe(true); expect(inWindow(a)).toBe(false);
  });
  it('an off-screen object up and left, whose edge arrow would sit on the window, moves onto A', () => {
    const st = createTacticalState(4), cam = createCamera(0, 0, 1.0); pan(cam, 0, 1);
    Object.assign(st.ships[0], { x: -1500, y: -1000 });
    const plain = tacticalModel(input(st, cam, { reserveLeft: RL, reserveRight: RR, reserveTop: RT })).arrows.find((x) => x.target === 'ship')!;
    expect(plain.x).toBeCloseTo(RL + m, 6); expect(plain.y).toBeLessThan(AB);   // today: on the left edge, beside the window
    const a = tacticalModel(input(st, cam, { reserveLeft: RL, reserveRight: RR, reserveTop: RT, avoid: OWN_SHIP })).arrows.find((x) => x.target === 'ship')!;
    expect(onA(a)).toBe(true); expect(a.angle).toBeCloseTo(plain.angle, 9);
  });
  it('a ray through A\'s corner lands on the right edge', () => {
    const vp = { w: 1280, h: 720 }, l = RL + m, t = RT + m, r = 1280 - RR - m, b = 720 - m, cx = (l + r) / 2, cy = (t + b) / 2;
    const p = { x: cx + (AR - cx) * 3, y: cy + (AB - cy) * 3 };   // straight through the corner, off screen
    const e = aroundAvoid(vp, RL, RR, RT, OWN_SHIP, p, { x: l, y: cy + (AB - cy) * ((l - cx) / (AR - cx)), angle: 0 });
    expect(e!.edge).toBe('avoidRight'); expect(e!.x).toBeCloseTo(AR, 6); expect(e!.y).toBeCloseTo(AB, 6);
  });
  it('an on-screen object in A\'s margin band, not under the window, gets no arrow', () => {
    const vp = { w: 1280, h: 720 };
    expect(aroundAvoid(vp, RL, RR, RT, OWN_SHIP, { x: OWN_SHIP.x + OWN_SHIP.w + 10, y: 100 }, null)).toBeNull();
  });
  it('two arrows on one avoid edge spread apart; no top-edge arrow is left of A after spreading', () => {
    const vp = { w: 1280, h: 720 }, mk = (x: number, y: number, edge?: ArrowDraw['edge']): ArrowDraw => ({ target: 'planet', x, y, angle: 0, distance: 1, label: '', ...(edge ? { edge } : {}) });
    const two = [mk(400, AB, 'avoidBottom'), mk(401, AB, 'avoidBottom')];
    spreadArrows(two, vp, RR, RL, RT, OWN_SHIP);
    expect(Math.abs(two[0]!.x - two[1]!.x)).toBeGreaterThanOrEqual(110 - 1e-9);   // ARROW_GAP_TOP
    for (const a of two) { expect(a.x).toBeLessThanOrEqual(AR + 1e-9); expect(a.x).toBeGreaterThanOrEqual(RL + m - 1e-9); }
    const top = [mk(AR + 5, RT + m), mk(AR + 6, RT + m), mk(1000, RT + m)];
    spreadArrows(top, vp, RR, RL, RT, OWN_SHIP);
    for (const a of top) expect(a.x).toBeGreaterThanOrEqual(AR - 1e-9);
  });
  it('without avoid nothing changes', () => {
    const st = createTacticalState(4), cam = createCamera(0, 0, 1.0); pan(cam, 0, 1);
    Object.assign(st.ships[0], { x: -1500, y: -1000 });
    const a = tacticalModel(input(st, cam, { reserveLeft: RL, reserveRight: RR, reserveTop: RT })).arrows.find((x) => x.target === 'ship')!;
    expect(a.edge).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/tacticalModel.test.ts`
Expected: FAIL. `aroundAvoid` is not exported, and `avoid` is not on the input type.

- [ ] **Step 3: Implement**

In `src/renderer/src/render/tactical/tacticalModel.ts`:

(a) Replace the `ArrowDraw` interface (line 72) with:

```ts
/** `edge`: own ship window spec §3, set only on an arrow placed on the avoid rect's right or bottom side. */
export interface ArrowDraw { target: ArrowTarget; x: number; y: number; angle: number; distance: number; label: string; edge?: 'avoidRight' | 'avoidBottom' }
```

(b) In `TacticalModelInput`, after `crewHull?: HullId;`, add:

```ts
  /** Own ship window spec §3: a console window the off-screen arrows go around (OWN_SHIP); absent: none. */
  avoid?: { x: number; y: number; w: number; h: number };
```

(c) After `edgePoint`, add:

```ts
type AvoidRect = { x: number; y: number; w: number; h: number };
/**
 * Own ship window spec §3: an arrow around `avoid`. A is avoid grown by ARROW_MARGIN on its right and bottom. When edgePoint's
 * point `e` lies inside A, or the object is on screen (`e` null) under the ungrown avoid, the arrow goes where the ray from
 * the inset rectangle's centre toward `p` enters A: k = max(kx, ky); the right side when kx >= ky (a corner counts as
 * right), else the bottom. Otherwise `e` is returned as it is.
 */
export function aroundAvoid(vp: Viewport, reserveLeft: number, reserveRight: number, reserveTop: number, avoid: AvoidRect, p: { x: number; y: number },
  e: { x: number; y: number; angle: number } | null): { x: number; y: number; angle: number; edge?: 'avoidRight' | 'avoidBottom' } | null {
  const m = ARROW_MARGIN, ar = avoid.x + avoid.w + m, ab = avoid.y + avoid.h + m;
  const hidden = !e && p.x >= avoid.x && p.x <= avoid.x + avoid.w && p.y >= avoid.y && p.y <= avoid.y + avoid.h;
  const onIt = !!e && e.x >= avoid.x && e.x <= ar && e.y >= avoid.y && e.y <= ab;
  if (!hidden && !onIt) return e;
  const l = reserveLeft + m, t = reserveTop + m, r = vp.w - reserveRight - m, b = vp.h - m;
  const cx = (l + r) / 2, cy = (t + b) / 2, dx = p.x - cx, dy = p.y - cy;
  const kx = dx < 0 ? (ar - cx) / dx : -Infinity, ky = dy < 0 ? (ab - cy) / dy : -Infinity;
  if (kx === -Infinity && ky === -Infinity) return e;
  const k = Math.max(kx, ky);
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dx, -dy), edge: kx >= ky ? 'avoidRight' : 'avoidBottom' };
}
```

(d) Replace the body of `spreadArrows` (its signature and the grouping section) with:

```ts
export function spreadArrows(arrows: ArrowDraw[], vp: Viewport, reserveRight: number, reserveLeft = 0, reserveTop = 0, avoid?: AvoidRect): void {
  const m = ARROW_MARGIN, top = reserveTop + m, bottom = vp.h - m, right = vp.w - reserveRight - m, left = reserveLeft + m;
  const ar = avoid ? avoid.x + avoid.w + m : -Infinity, ab = avoid ? avoid.y + avoid.h + m : -Infinity;   // own ship window spec §3
  const groups = new Map<string, { flat: boolean; lo: number; hi: number; list: ArrowDraw[] }>();
  for (const a of arrows) {
    let key: string, flat: boolean, lo: number, hi: number;
    if (a.edge === 'avoidBottom') { key = a.edge; flat = true; lo = left; hi = ar; }
    else if (a.edge === 'avoidRight') { key = a.edge; flat = false; lo = top; hi = ab; }
    else {
      const onTop = Math.abs(a.y - top) < 0.5;
      flat = onTop || Math.abs(a.y - bottom) < 0.5; key = flat ? `y${Math.round(a.y)}` : `x${Math.round(a.x)}`;
      lo = flat ? (onTop ? Math.max(left, ar) : left) : (Math.abs(a.x - left) < 0.5 ? Math.max(top, ab) : top);
      hi = flat ? right : bottom;
    }
    const g = groups.get(key) ?? { flat, lo, hi, list: [] };
    g.list.push(a); groups.set(key, g);
  }
  for (const { flat, lo, hi, list } of groups.values()) {
    if (list.length < 2) continue;
    const gap = flat ? ARROW_GAP_TOP : ARROW_GAP_SIDE, mid = (lo + hi) / 2;
    // ... the rest of the existing loop body, unchanged from `const get = ...` down to the closing braces
  }
}
```

Keep the existing loop body from `const get = (a: ArrowDraw)...` through the "shift back" loop exactly as it is. Only `lo`, `hi` and `mid` now come from the group.

(e) In the `arrow` closure, replace its first two lines with:

```ts
    const p = toS(wx, wy), rl = input.reserveLeft ?? 0, rt = input.reserveTop ?? 0;
    let e: { x: number; y: number; angle: number; edge?: 'avoidRight' | 'avoidBottom' } | null = edgePoint(vp, rl, input.reserveRight, p.x, p.y, rt);
    if (input.avoid) e = aroundAvoid(vp, rl, input.reserveRight, rt, input.avoid, p, e);
    if (!e) return;
```

In the following `arrows.push({...})`, add `...(e.edge ? { edge: e.edge } : {})` as the last property. Change the `spreadArrows` call to pass `input.avoid` as a sixth argument.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/tacticalModel.test.ts`
Expected: PASS, including every existing arrow test, unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/render/tactical/tacticalModel.ts tests/tacticalModel.test.ts
git commit -m "feat(own-ship-window): off-screen arrows go around the window

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sit-down framing and the Flight pointer keep clear of the window

**Files:**
- Modify: `src/renderer/src/render/duel/sitModel.ts:46-52` (`frameZoom`)
- Modify: `src/renderer/src/app/duel/flightPointer.ts:3,11-16` (import and `BLOCKS`)
- Test: `tests/feelPresentation.test.ts` (next to the frameZoom tests at line 220), `tests/flightPointer.test.ts`

**Interfaces:**
- Produces: `frameZoom(dx, dy, vp, reserveLeft, reserveRight, avoid?: { x: number; y: number; w: number; h: number }): number`.

- [ ] **Step 1: Write the failing tests**

In `tests/feelPresentation.test.ts`, add `import { OWN_SHIP } from '../src/renderer/src/render/duel/consoleLayout';` (skip it if already imported), then add this `it` inside the `describe` that holds the `frameZoom(4000, 0, vp, 228, 156)` test:

```ts
  it('own ship window spec §3: an up-left enemy is framed clear of the window on at least one axis; without avoid, unchanged', () => {
    for (const [dx, dy] of [[-300, -250], [-500, -120], [-150, -400]] as const) {
      const z = frameZoom(dx, dy, vp, 228, 156, OWN_SHIP), sx = vp.w / 2 + dx * z, sy = vp.h / 2 + dy * z;
      expect(sx >= OWN_SHIP.x + OWN_SHIP.w || sy >= OWN_SHIP.y + OWN_SHIP.h || z === FRAME_ZOOM_MIN, `${dx},${dy}`).toBe(true);
      expect(z).toBeLessThanOrEqual(frameZoom(dx, dy, vp, 228, 156));
    }
    expect(frameZoom(300, -250, vp, 228, 156, OWN_SHIP)).toBe(frameZoom(300, -250, vp, 228, 156));   // up-right: no cap
    expect(frameZoom(-300, 250, vp, 228, 156, OWN_SHIP)).toBe(frameZoom(-300, 250, vp, 228, 156));   // down-left: no cap
  });
```

In `tests/flightPointer.test.ts`, add `OWN_SHIP` to the `consoleLayout` import and add inside the describe:

```ts
  it('own ship window spec §3: a pointer inside OWN_SHIP sends no steer, shown contact or not', () => {
    const p = mid(OWN_SHIP);
    expect(onFlightMap(p, false)).toBe(false); expect(onFlightMap(p, true)).toBe(false);
    expect(at(p).steer).toBeNull();
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/feelPresentation.test.ts tests/flightPointer.test.ts`
Expected: FAIL. At least one up-left case is not capped, and the OWN_SHIP pointer still steers.

- [ ] **Step 3: Implement**

Replace `frameZoom` in `src/renderer/src/render/duel/sitModel.ts`:

```ts
/** The zoom that fits the enemy at (dx, dy) world units from the own ship on screen, the camera centred on the own ship:
 *  inside the map's usable span (clear of the left and right reserves) with FRAME_MARGIN, clamped to 0.25..1. Own ship
 *  window spec §3: with `avoid`, an up-left enemy is also kept clear of that rect on at least one axis. */
export function frameZoom(dx: number, dy: number, vp: Viewport, reserveLeft: number, reserveRight: number, avoid?: { x: number; y: number; w: number; h: number }): number {
  const left = vp.w / 2 - reserveLeft - FRAME_MARGIN, right = vp.w / 2 - reserveRight - FRAME_MARGIN, up = vp.h / 2 - FRAME_MARGIN;
  const zx = dx === 0 ? Infinity : (dx < 0 ? left : right) / Math.abs(dx), zy = dy === 0 ? Infinity : up / Math.abs(dy);
  const za = avoid && dx < 0 && dy < 0
    ? Math.max((vp.w / 2 - (avoid.x + avoid.w) - FRAME_MARGIN) / Math.abs(dx), (vp.h / 2 - (avoid.y + avoid.h) - FRAME_MARGIN) / Math.abs(dy))
    : Infinity;
  return Math.max(FRAME_ZOOM_MIN, Math.min(FRAME_ZOOM_MAX, zx, zy, za));
}
```

In `src/renderer/src/app/duel/flightPointer.ts`, add `OWN_SHIP` to the `consoleLayout` import. Append `OWN_SHIP` to `BLOCKS` after `FLIGHT`, and update the doc comment to "...the Helm block, the FLIGHT block and the own ship window (own ship window spec §3)".

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/feelPresentation.test.ts tests/flightPointer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/render/duel/sitModel.ts src/renderer/src/app/duel/flightPointer.ts tests/feelPresentation.test.ts tests/flightPointer.test.ts
git commit -m "feat(own-ship-window): sit-down framing and the Flight pointer keep clear of the window

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Scene wiring

**Files:**
- Modify: `src/renderer/src/app/duel/scene.ts`:
  - imports (lines 12-21);
  - the `let` state after `let lastAimed` (line 160);
  - the epoch reset block (lines 166-171);
  - the sit-down `frameZoom` call (line 240);
  - the tactical `input` (line 266);
  - `options.ui.frame({...})` (lines 285-296).
- Test: `tests/ownShipScene.test.ts`

**Interfaces:**
- Consumes:
  - `ownShipModel`, `fireWatch`, `type FireWatch` (Task 2);
  - `OWN_SHIP`, `OWN_SHIP_BOX` (Task 1);
  - `TacticalModelInput.avoid` (Task 4);
  - the `frameZoom` avoid argument (Task 5).

- [ ] **Step 1: Write the failing test**

Create `tests/ownShipScene.test.ts`, modelled on `tests/shipHudScene.test.ts`:

```ts
// Own ship window spec §4, §6: the frame carries ownShip exactly on a console map view (onMap): not standing, not seated
// and Tabbed to SHIP. The real runtime and scene in node, as shipHudScene.test.ts does.
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';
import { seatDuelCrew } from './helpers/duelSeat';

const layout = parseShip(cutter);
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
const LIVE = { banner: null, layerPaused: false, end: null };

describe('the scene and the own ship window (spec §4)', () => {
  it('standing: none; seated at the Helm on the map: set; seated and Tabbed to SHIP: none', () => {
    let now = 0;
    const keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
    const rt = createDuelRuntime({
      now: () => now, seed: 5, viewport: { w: 1280, h: 720 }, layout,
      scheduler: { schedule() { return () => {}; } },
      sampleKeys: () => keys, samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {}
    });
    const stage = new Container(), store = createUiStore({ onlineAvailable: false } as never);
    const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
    const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store) });
    const duel = () => store.getState().duel!;
    try {
      rt.frame(1 / 60); now += 1000 / 60; rt.frame(1 / 60);
      expect(rt.view()).toBe('interior');
      scene.draw(rt, 1 / 60, LIVE);
      expect(duel().ownShip ?? null).toBeNull();
      seatDuelCrew(rt.duel);
      scene.draw(rt, 1 / 60, LIVE);
      expect(duel().console?.station).toBe('helm');
      expect(duel().ownShip).toBeTruthy();
      expect(duel().ownShip!.tiles.length).toBeGreaterThan(0);
      keys.presses = { ...emptyPresses(), switch: 1 };   // Tab: the seated player's SHIP view
      now += 1000 / 60; rt.frame(1 / 60); keys.presses = emptyPresses();
      expect(rt.view()).toBe('interior');
      scene.draw(rt, 1 / 60, LIVE);
      expect(duel().ownShip ?? null).toBeNull();
    } finally { scene.dispose(); rt.dispose(); }
  });
});
```

If `emptyPresses()` has no `switch` field, read `app/duel/input.ts` for the Tab press's name (the runtime reads `k.presses.switch` at `runtime.ts:364`) and use it.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/ownShipScene.test.ts`
Expected: FAIL at `expect(duel().ownShip).toBeTruthy()`.

- [ ] **Step 3: Wire the scene**

In `src/renderer/src/app/duel/scene.ts`:

(a) Imports. Change the consoleLayout import to:

```ts
import { CONSOLE_RESERVE, CONTACT_RESERVE, OWN_SHIP, OWN_SHIP_BOX, SIDE, STATUS_RESERVE, TABS_RIGHT } from '../../render/duel/consoleLayout';
```

and add after the `contactModel` import:

```ts
import { fireWatch, ownShipModel, type FireWatch } from '../../render/duel/ownShipModel';
```

(b) After `let lastAimed: string | null = null; ...` add:

```ts
  // Own ship window spec §4: the fire watch (every drawn frame, whatever the view) and the border flash's end (presentation seconds).
  let fires: FireWatch | null = null, flashUntil = 0;
```

(c) In the epoch-reset block (`if (source.epoch() !== epoch) { ... }`), add `fires = null; flashUntil = 0;` after `refused = null;`.

(d) Directly after the line `const t = performance.now() / 1000; ...`, add:

```ts
      ({ watch: fires, flashUntil } = fireWatch(fires, d, t, flashUntil));   // own ship window spec §4
```

(e) In the sit-down branch, change the `frameZoom` call to pass `OWN_SHIP` as its sixth argument:

```ts
        if (e?.active) zoomTo(source.cameras[viewCamera(sitSeat)], frameZoom(e.x - own.x, e.y - own.y, viewport, CONSOLE_RESERVE.left, CONSOLE_RESERVE.right, OWN_SHIP));
```

(f) In the tactical `input` object, add `...(onMap ? { avoid: OWN_SHIP } : {}),` directly after the `...(onConsole ? { ... } : { reserveRight: READOUT_COLUMN }),` spread. `onMap` is the same flag that gates `ownShip` below, so `avoid` is passed exactly when the window is drawn.

(g) In `options.ui.frame({ ... })`, add after the `...(contact ? { contact: contactView } : {}),` line:

```ts
        ownShip: onMap ? ownShipModel(d, OWN_SHIP_BOX, t, flashUntil) : null,   // own ship window spec §4: the console map views only
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/ownShipScene.test.ts tests/shipHudScene.test.ts tests/contactScene.test.ts tests/sceneUi.test.ts`
Expected: PASS. If an existing scene test deep-compares the whole frame object and now fails only on the new `ownShip` key, add `ownShip: null` (or the matching model) to that test's expected object. Do not change any other expectation.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/app/duel/scene.ts tests/ownShipScene.test.ts
git commit -m "feat(own-ship-window): the scene builds the window on console map views, with the fire flash and arrow avoid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add any existing test file you had to touch in Step 4 to the `git add` line.)

---

### Task 7: Full verification and the look check

**Files:** none new.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: every test passes, with the count higher than before this branch by the tests added in Tasks 1-6.

- [ ] **Step 3: Determinism unchanged**

Run: `git diff --stat master -- src/renderer/src/sim`
Expected: no output (no sim file changed), so `SIM_VERSION` and the golden replay need nothing.

- [ ] **Step 4: Look check**

Build with `npm run build` and launch the app with the playwright-core + Electron method recorded in memory ([[visual-check-method]]: `_electron.launch` on the built `out/`, with playwright-core installed in the scratchpad, not the repo). Start Single player, sit at the Helm, and wait for the enemy to set a room alight; or, in a dev build, use any existing debug key that ignites a room. Take screenshots of:
- Helm with the window visible;
- the window during the 2 s flash;
- Weapons;
- Flight (Valkyrn).

Check:
- the window sits top left, right of the status table;
- the burning room blinks hot, and the crew dots read inside it;
- no off-screen arrow lands inside the window.

Report the screenshot paths. The owner's look gate stays open.

- [ ] **Step 5: Commit any fixes**

If Steps 1-4 needed fixes, commit them with a message naming what was fixed.
