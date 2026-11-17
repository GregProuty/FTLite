# Hull Silhouettes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the console maps, draw the crew's ship as the Hound's traced outline and the enemy as an original drone scout, each with three rooms that carry damage and the lock, replacing the three-segment wedge.

**Architecture:** A new pure module `render/tactical/hullModel.ts` holds both hulls as frozen polygon data in ship units (nose +f, starboard +s), with `hullFor`, `roomCentre` and `ENEMY_RING`. `ShipDraw` gains a required `hull`. The layer's `drawShip` fills the outline and draws each room by the spec's damage table. `weaponsModel` puts the lock on `roomCentre(hullFor(false), room)`. The wedge and `segmentCentre` are deleted, and their tests move.

**Tech Stack:** TypeScript, PixiJS 8.19 (Graphics), vitest; Electron + playwright-core for the screenshots (outside the repo, as in the CRT map).

**Spec:** `docs/superpowers/specs/2026-11-17-hull-silhouettes-design.md` (refined to convergence at b664edb; refine run `docs/superpowers/reviews/2026-11-17-hull-silhouettes-spec/exchange.md`).

## Global Constraints

- Presentation only: no file under `src/renderer/src/sim`, `src/renderer/src/authority`, `src/network`, `src/shared` or `src/main` changes; SIM_VERSION and the goldens do not move; `SHIP_RADIUS` is unchanged.
- The hull coordinates are exactly the spec's (section 1), copied verbatim; only coordinates enter git, never the painting (`public/assets/paid/` is gitignored).
- Ship units: nose +f, starboard +s; one unit is `SHIP_RADIUS * zoom` px; rooms[0] Weapons, rooms[1] Shields, rooms[2] Engines.
- Colours are CRT ramp colours only (`CRT.glass`, `faint`, `dim`, `mid`, `main`, `hot`); all strokes and hatch lines are 1 px; the hatch is `HATCH_SPACING` 4 px at `HATCH_ANGLE` 45°.
- The damage table (spec section 2) verbatim:

  | Ship | Level | Room fill | Room stroke | Hatch |
  |---|---|---|---|---|
  | crew | 0 | none | `glass` | none |
  | crew | 1 | `mid` | `glass` | `glass` |
  | crew | 2, phase 0 | `glass` | `hot` | none |
  | crew | 2, phase 1 | `hot` | `glass` | none |
  | enemy | 0 | none | `mid` | none |
  | enemy | 1 | `dim` | `main` | `main` |
  | enemy | 2, phase 0 | `hot` | `glass` | none |
  | enemy | 2, phase 1 | `glass` | `main` | `main` |

  Phase is `blink(t, DAMAGE_BLINK_HZ)`. The outline: crew fill `hot`, stroke `glass`; enemy fill `glass`, stroke `main`.
- No display objects are created per frame; each `Graphics.poly` call gets a fresh array.
- Below `SHIP_CHEVRON_PX` the chevron is drawn exactly as today.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; stage files by name; never `git stash`.

## File structure

- Create `src/renderer/src/render/tactical/hullModel.ts`: the hull data, `hullFor`, `roomCentre`, `ENEMY_RING`, and the pure geometry checks used by the tests (`pointInPolygon`, `segmentsCross`, `polygonArea`).
- Create `tests/hullModel.test.ts`: the constraints, `hullFor` and `roomCentre`.
- Modify `src/renderer/src/render/tactical/tacticalModel.ts`: `ShipDraw.hull`; set it in the ships loop; delete the wedge.
- Modify `src/renderer/src/render/tactical/tacticalLayer.ts`: `drawShip` by hull; re-export `ENEMY_RING`.
- Modify `src/renderer/src/render/tactical/weaponsModel.ts`: the lock on `roomCentre`; delete `segmentCentre`.
- Modify `tests/tacticalModel.test.ts`, `tests/dashModel.test.ts`, `tests/duelWeaponsView.test.ts`, `tests/crtColours.test.ts`.
- Modify `docs/gates.md`: the gate section.

---

### Step 0: Baseline

- [ ] **0.1** In the worktree `C:/Users/djuar/FTLite/.worktrees/hull-silhouettes` (branch `hull-silhouettes`), run `npm run build` and `npx vitest run`. Write down the totals (files and tests); later counts are deltas from these. The sim test files (`tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts`, `tests/gate-*.test.ts`) time out under machine load: rerun a failing one alone before calling it a failure. Any other failure: stop and report.

### Task 1: The hull model

**Files:**
- Create: `src/renderer/src/render/tactical/hullModel.ts`
- Test: `tests/hullModel.test.ts`

**Interfaces:**
- Consumes: `isConvex(poly: readonly number[]): boolean` from `./dashModel` (test only).
- Produces: `type HullId = 'hound' | 'scout'`; `interface Hull { outline: readonly number[]; rooms: readonly (readonly number[])[] }`; `HULLS: Readonly<Record<HullId, Hull>>`; `hullFor(crew: boolean): HullId`; `roomCentre(hull: HullId, room: number): { f: number; s: number }`; `ENEMY_RING = 1.35`; `pointInPolygon(x, y, poly): boolean`; `segmentsCross(ax, ay, bx, by, cx, cy, dx, dy): boolean`; `polygonArea(poly): number`.

- [ ] **Step 1: Write the failing test** `tests/hullModel.test.ts`:

```ts
// Hull silhouettes spec section 1: the Hound (traced from the bought painting) and an original drone scout, in ship
// units (nose +f, starboard +s). Each constraint the spec lists, for both hulls.
import { describe, expect, it } from 'vitest';
import { isConvex } from '../src/renderer/src/render/tactical/dashModel';
import { ENEMY_RING, HULLS, hullFor, pointInPolygon, polygonArea, roomCentre, segmentsCross, type HullId } from '../src/renderer/src/render/tactical/hullModel';

const ids: HullId[] = ['hound', 'scout'];
const edges = (p: readonly number[]): [number, number, number, number][] => {
  const out: [number, number, number, number][] = [], n = p.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; out.push([p[2 * i]!, p[2 * i + 1]!, p[2 * j]!, p[2 * j + 1]!]); }
  return out;
};
const maxRadius = (p: readonly number[]): number => { let r = 0; for (let i = 0; i < p.length; i += 2) r = Math.max(r, Math.hypot(p[i]!, p[i + 1]!)); return r; };

describe('the hulls (hull silhouettes spec section 1)', () => {
  it('have the spec vertex counts and three rooms each', () => {
    expect(HULLS.hound.outline.length / 2).toBe(43);
    expect(HULLS.scout.outline.length / 2).toBe(25);
    for (const id of ids) expect(HULLS[id].rooms.length).toBe(3);
    expect(Object.isFrozen(HULLS)).toBe(true);
  });
  for (const id of ids) {
    it(`${id}: every room is convex, inside the outline (vertices strictly inside, no edge crossing) and at least 0.2 square units`, () => {
      const o = HULLS[id].outline;
      HULLS[id].rooms.forEach((room, k) => {
        expect(isConvex(room), `room ${k} convex`).toBe(true);
        for (let i = 0; i < room.length; i += 2) expect(pointInPolygon(room[i]!, room[i + 1]!, o), `room ${k} vertex ${i / 2}`).toBe(true);
        for (const [ax, ay, bx, by] of edges(room)) for (const [cx, cy, dx, dy] of edges(o)) expect(segmentsCross(ax, ay, bx, by, cx, cy, dx, dy), `room ${k} edge crosses`).toBe(false);
        expect(polygonArea(room), `room ${k} area`).toBeGreaterThanOrEqual(0.2);
      });
    });
    it(`${id}: the outline is a simple polygon`, () => {
      const e = edges(HULLS[id].outline), n = e.length;
      for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        expect(segmentsCross(...e[i]!, ...e[j]!), `edges ${i} and ${j}`).toBe(false);
      }
    });
  }
  it('stay inside their rings: the scout within ENEMY_RING - 0.1, the Hound within 1.55 (shield rings start at 1.6)', () => {
    expect(ENEMY_RING).toBe(1.35);
    expect(maxRadius(HULLS.scout.outline)).toBeLessThanOrEqual(ENEMY_RING - 0.1);
    expect(maxRadius(HULLS.hound.outline)).toBeLessThanOrEqual(1.55);
  });
  it('the crew flies the Hound and the enemy the scout', () => {
    expect(hullFor(true)).toBe('hound');
    expect(hullFor(false)).toBe('scout');
  });
  it('roomCentre is the mean of the room vertices', () => {
    expect(roomCentre('scout', 0).f).toBeCloseTo((0.88 + 0.88 + 0.46 + 0.46) / 4, 9);
    expect(roomCentre('scout', 0).s).toBeCloseTo(0, 9);
    expect(roomCentre('hound', 2).f).toBeCloseTo(-0.48, 9);
    expect(roomCentre('hound', 0).f).toBeGreaterThan(roomCentre('hound', 1).f);
    expect(roomCentre('hound', 1).f).toBeGreaterThan(roomCentre('hound', 2).f);
  });
  it('the geometry helpers', () => {
    const sq = [0, 0, 2, 0, 2, 2, 0, 2];
    expect(pointInPolygon(1, 1, sq)).toBe(true);
    expect(pointInPolygon(3, 1, sq)).toBe(false);
    expect(segmentsCross(0, 0, 2, 2, 0, 2, 2, 0)).toBe(true);
    expect(segmentsCross(0, 0, 1, 0, 1, 0, 2, 0)).toBe(false);   // touching at an end is not a proper crossing
    expect(polygonArea(sq)).toBeCloseTo(4, 9);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/hullModel.test.ts`
Expected: FAIL, `Failed to load url ../src/renderer/src/render/tactical/hullModel` (no tests run).

- [ ] **Step 3: Write `src/renderer/src/render/tactical/hullModel.ts`:**

```ts
// Hull silhouettes spec section 1: the ships' outlines and rooms on the console maps, in ship units (nose +f,
// starboard +s; one unit is SHIP_RADIUS * zoom px). The Hound is traced from the bought 2-Minute Tabletop painting
// (only these coordinates are in git; the 2MT licence caveat applies); the scout is an original design. Pure: no Pixi.

export type HullId = 'hound' | 'scout';
/** Flat [f, s, f, s, ...] polygons. rooms[0] Weapons, rooms[1] Shields, rooms[2] Engines (ROOM_NAMES order). */
export interface Hull { outline: readonly number[]; rooms: readonly (readonly number[])[] }

/** The enemy's blinking marker ring, as a multiple of the ship's radius (the shield rings start at 1.6). */
export const ENEMY_RING = 1.35;

const HOUND: Hull = {
  outline: [
    -0.565, -0.847, -0.03, -0.817, 0.101, -0.676, 0.282, -0.565, 0.424, -0.333, 0.474, -0.434, 0.524, -0.454, 0.776, -0.434,
    0.827, -0.363, 0.706, -0.353, 0.706, -0.313, 1.018, -0.282, 1.18, -0.121, 1.15, 0.151, 0.998, 0.282, 0.676, 0.292, 0.696, 0.353,
    0.837, 0.353, 0.756, 0.434, 0.484, 0.444, 0.413, 0.343, 0.272, 0.565, 0.171, 0.605, -0.061, 0.807, -0.585, 0.827, -0.605, 0.766,
    -0.766, 0.766, -1.029, 0.676, -1.2, 0.474, -1.16, 0.424, -1.099, 0.424, -1.089, 0.333, -0.827, 0.292, -0.847, -0.141, -0.817, -0.323,
    -1.089, -0.343, -1.099, -0.434, -1.16, -0.434, -1.19, -0.504, -1.139, -0.615, -0.998, -0.726, -0.877, -0.766, -0.615, -0.766
  ],
  rooms: [
    [1.1, -0.12, 1.1, 0.14, 0.96, 0.26, 0.5, 0.26, 0.5, -0.26, 0.96, -0.26],
    [0.4, -0.32, 0.4, 0.32, -0.06, 0.4, -0.06, -0.4],
    [-0.16, -0.28, -0.16, 0.28, -0.8, 0.28, -0.8, -0.28]
  ]
};

const SCOUT: Hull = {
  outline: [
    0.92, 0, 1.19, 0.09, 1.23, 0.17, 0.86, 0.24, 0.62, 0.46, 0.3, 0.58, -0.02, 0.46, -0.24, 0.22, -0.62, 0.2, -0.98, 0.52,
    -1.12, 0.5, -0.98, 0.2, -1.08, 0.12, -1.08, -0.12, -0.98, -0.2, -1.12, -0.5, -0.98, -0.52, -0.62, -0.2, -0.24, -0.22,
    -0.02, -0.46, 0.3, -0.58, 0.62, -0.46, 0.86, -0.24, 1.23, -0.17, 1.19, -0.09
  ],
  rooms: [
    [0.88, -0.2, 0.88, 0.2, 0.46, 0.36, 0.46, -0.36],
    [0.36, -0.42, 0.36, 0.42, -0.06, 0.4, -0.06, -0.4],
    [-0.18, -0.18, -0.18, 0.18, -0.94, 0.18, -0.94, -0.18]
  ]
};

const freeze = (h: Hull): Hull => Object.freeze({ outline: Object.freeze([...h.outline]), rooms: Object.freeze(h.rooms.map((r) => Object.freeze([...r]))) });
export const HULLS: Readonly<Record<HullId, Hull>> = Object.freeze({ hound: freeze(HOUND), scout: freeze(SCOUT) });

/** The crew's ship is the Hound; the enemy is the scout. */
export function hullFor(crew: boolean): HullId { return crew ? 'hound' : 'scout'; }

/** A room's centre in ship units: the mean of its polygon's vertices. */
export function roomCentre(hull: HullId, room: number): { f: number; s: number } {
  const poly = HULLS[hull].rooms[room]!;
  let f = 0, s = 0;
  for (let i = 0; i < poly.length; i += 2) { f += poly[i]!; s += poly[i + 1]!; }
  return { f: f / (poly.length / 2), s: s / (poly.length / 2) };
}

/** Even-odd point in polygon (flat [x, y, ...]). */
export function pointInPolygon(x: number, y: number, poly: readonly number[]): boolean {
  let inside = false;
  for (let i = 0, n = poly.length / 2, j = n - 1; i < n; j = i++) {
    const xi = poly[2 * i]!, yi = poly[2 * i + 1]!, xj = poly[2 * j]!, yj = poly[2 * j + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when segment AB properly crosses segment CD (each strictly separates the other's ends; touching is not a crossing). */
export function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  return o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 && o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0;
}

/** The unsigned area of a polygon (shoelace). */
export function polygonArea(poly: readonly number[]): number {
  let a = 0;
  for (let i = 0, n = poly.length / 2, j = n - 1; i < n; j = i++) a += poly[2 * j]! * poly[2 * i + 1]! - poly[2 * i]! * poly[2 * j + 1]!;
  return Math.abs(a) / 2;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/hullModel.test.ts`
Expected: PASS, `Tests 9 passed (9)`.

- [ ] **Step 5: Types and commit**

Run: `npx tsc -b` (exit 0). Then:
```bash
git add src/renderer/src/render/tactical/hullModel.ts tests/hullModel.test.ts
git commit -m "feat(hull-silhouettes): the hull model: the Hound traced outline and an original drone scout, three rooms each" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Draw the hulls, the lock on the hull's rooms, and retire the wedge

**Files:**
- Modify: `src/renderer/src/render/tactical/tacticalModel.ts` (L38-L45 `ShipDraw`; L260 the ships push; L302-L313 the wedge)
- Modify: `src/renderer/src/render/tactical/tacticalLayer.ts` (L12-L14 imports; L24-L25 `ENEMY_RING`; L108-L137 `drawShip`)
- Modify: `src/renderer/src/render/tactical/weaponsModel.ts` (L12-L15 imports; L47-L53 `segmentCentre`; L70-L78 the lock)
- Modify: `tests/tacticalModel.test.ts` (L4-L7 import; L169-L170), `tests/dashModel.test.ts` (L3; L40-L43), `tests/duelWeaponsView.test.ts` (L13; L108), `tests/crtColours.test.ts` (L14; L23)

**Interfaces:**
- Consumes (Task 1): `HULLS`, `hullFor`, `roomCentre`, `ENEMY_RING`, `type HullId` from `./hullModel`.
- Produces: `ShipDraw.hull: HullId` (required). `tacticalLayer` still exports `ENEMY_RING` (re-exported). `wedgeSegments`, `WEDGE_NOSE`, `WEDGE_TAIL`, `WEDGE_HALF` and `segmentCentre` no longer exist.

- [ ] **Step 1: Update the tests first (RED)**

In `tests/tacticalModel.test.ts`:
- In the import at L4-L7, remove `wedgeSegments, ` (keep every other name).
- Add `import { HULLS } from '../src/renderer/src/render/tactical/hullModel';` after that import.
- Replace L169-L170:
```ts
  it('the wedge has three room segments and asteroids have stable outlines', () => {
    expect(wedgeSegments().map((w) => w.room)).toEqual([0, 1, 2]);
```
with:
```ts
  it('both hulls have three rooms and asteroids have stable outlines', () => {
    expect([HULLS.hound.rooms.length, HULLS.scout.rooms.length]).toEqual([3, 3]);
```
- In the test at L73 (`'a ship is a silhouette at 10 px across and up, a chevron below'`), after its last `expect`, add:
```ts
    expect(at(0.25).hull).toBe('hound');
```
  (`at` returns `ships[0]`, the crew's ship, since `input` defaults to `ships: [0]`). Then add a new test in the same `describe` as L73:
```ts
  it('every ship carries its hull: the crew the Hound, the enemy the scout (hull silhouettes spec section 2)', () => {
    const st = createTacticalState(11), cam = createCamera(st.ships[0].x, st.ships[0].y, 0.5);
    st.ships[1].x = st.ships[0].x + 100; st.ships[1].y = st.ships[0].y;
    const d = tacticalModel(input(st, cam, { ships: [0, 1] }));
    expect(d.ships.map((s) => [s.index, s.hull])).toEqual([[0, 'hound'], [1, 'scout']]);
  });
```
  (`input` is the file's helper at L12-L14; `createCamera` and `createTacticalState` are already imported.)

In `tests/dashModel.test.ts`:
- Delete L3 (`import { wedgeSegments } ...`).
- Replace L40-L43:
```ts
describe('isConvex and the wedge segments', () => {
  it('every wedgeSegments polygon is convex, so the hatch clips by line-polygon intersection without a split', () => {
    for (const s of wedgeSegments()) expect(isConvex(s.poly), `room ${s.room}`).toBe(true);
  });
```
with:
```ts
describe('isConvex', () => {
```
  (the hull rooms' convexity is tested in `tests/hullModel.test.ts`; the `'tells convex from concave'` test stays).

In `tests/duelWeaponsView.test.ts`:
- L13: replace `segmentCentre, ` with nothing, and add `import { roomCentre } from '../src/renderer/src/render/tactical/hullModel';` after that line.
- L108: replace `const nose = segmentCentre(0);` with `const nose = roomCentre('scout', 0);`.

In `tests/crtColours.test.ts`:
- L14: in the `ship` default add `hull: 'hound', ` after `crew: true, `.
- L23: the enemy fixtures get the scout: `ship({ index: 1, x: 760, y: 260, crew: false, hull: 'scout', rooms: [2, 1, 0], shields: 1 })` and `ship({ index: 3, x: 220, y: 240, chevron: true, crew: false, hull: 'scout' })`.
- Add two ships so every damage level shows on both hulls in both phases: after the four ships in L23 add `ship({ index: 4, x: 420, y: 520, rooms: [0, 1, 2] }), ship({ index: 5, x: 640, y: 560, crew: false, hull: 'scout', rooms: [0, 1, 2], shields: 0 })`. (The `t` values 0, 0.3, 0.6, 0.9 already give both 2 Hz phases.)

Run: `npx vitest run tests/tacticalModel.test.ts tests/dashModel.test.ts tests/duelWeaponsView.test.ts tests/crtColours.test.ts tests/hullModel.test.ts`
Expected: FAIL. vitest fails the new tacticalModel assertions (no `hull` yet) and the duelWeaponsView lock test (the lock still sits on the wedge's nose centre, f 0.633; `roomCentre('scout', 0).f` is 0.67). Also run `npx tsc -b`: expected errors that `'hull'` does not exist in type `ShipDraw` (or `Partial<ShipDraw>`) in `tests/crtColours.test.ts`. Capture both outputs.

- [ ] **Step 2: `tacticalModel.ts`**

- Add `import { hullFor, type HullId } from './hullModel';` after the `./camera` import (L9).
- In `ShipDraw` (L38-L45), after `chevron: boolean; crew: boolean;` add:
```ts
  /** The silhouette (hull silhouettes spec section 2): the shape comes from HULLS[hull], the colours from `crew`. */
  hull: HullId;
```
- In the ships push (L260), after `crew: i === 0, ` add `hull: hullFor(i === 0), `.
- Delete L302-L313 (the comment, `WEDGE_NOSE`/`WEDGE_TAIL`/`WEDGE_HALF`, `halfWidth` and `wedgeSegments`).

- [ ] **Step 3: `weaponsModel.ts`**

- In the import at L12-L15 remove `wedgeSegments, `. Add `import { hullFor, roomCentre } from './hullModel';` after it.
- Delete `segmentCentre` and its doc comment (L47-L53).
- In the lock (L74-L75), replace `segmentCentre(room)` with `roomCentre(hullFor(false), room)`. Update the comment at L70 to: `// The lock marker sits on the locked room of the enemy's hull (the scout), or on the chevron when the ship is drawn as one.`

- [ ] **Step 4: `tacticalLayer.ts`**

- L14: replace `wedgeSegments, ` with nothing. Add `import { ENEMY_RING, HULLS } from './hullModel';` after L14.
- Replace L24-L25 (the `ENEMY_RING` doc comment and constant) with:
```ts
/** The enemy's blinking marker ring (moved to hullModel.ts so the pure model and its test need no Pixi). */
export { ENEMY_RING };
```
- Replace the non-chevron part of `drawShip` — from `const k = SHIP_RADIUS * s.scale, phase = blink(t, DAMAGE_BLINK_HZ);` through the closing `}` of the `for (const sg of wedgeSegments())` loop — with:
```ts
    const k = SHIP_RADIUS * s.scale, phase = blink(t, DAMAGE_BLINK_HZ), hull = HULLS[s.hull];
    const place = (poly: readonly number[]): number[] => {
      const out: number[] = [];   // a fresh array per poly: Graphics.poly keeps the reference
      for (let i = 0; i < poly.length; i += 2) { const f = poly[i]!, side = poly[i + 1]!; out.push(s.x + (fx * f + rx * side) * k, s.y + (fy * f + ry * side) * k); }
      return out;
    };
    // The outline: the crew solid hot, the enemy hollow (glass inside, a main edge).
    if (s.crew) g.poly(place(hull.outline)).fill(CRT.hot).stroke({ width: 1, color: CRT.glass });
    else g.poly(place(hull.outline)).fill(CRT.glass).stroke({ width: 1, color: CRT.main });
    // The rooms, by the damage table (hull silhouettes spec section 2; level 2 is the CRT map's rule, level 1 adds a tone).
    hull.rooms.forEach((room, r) => {
      const pts = place(room), level = s.rooms[r] ?? 0;
      let fill: number | null, stroke: number, hatch: number | null;
      if (s.crew) {
        if (level === 0) { fill = null; stroke = CRT.glass; hatch = null; }
        else if (level === 1) { fill = CRT.mid; stroke = CRT.glass; hatch = CRT.glass; }
        else if (phase === 0) { fill = CRT.glass; stroke = CRT.hot; hatch = null; }
        else { fill = CRT.hot; stroke = CRT.glass; hatch = null; }
      } else {
        if (level === 0) { fill = null; stroke = CRT.mid; hatch = null; }
        else if (level === 1) { fill = CRT.dim; stroke = CRT.main; hatch = CRT.main; }
        else if (phase === 0) { fill = CRT.hot; stroke = CRT.glass; hatch = null; }
        else { fill = CRT.glass; stroke = CRT.main; hatch = CRT.main; }
      }
      if (fill === null) g.poly(pts).stroke({ width: 1, color: stroke });
      else g.poly(pts).fill(fill).stroke({ width: 1, color: stroke });
      if (hatch !== null) segments(g, hatchSegments(pts, HATCH_SPACING, HATCH_ANGLE, seg), 1, hatch);
    });
```
  The two lines after the old loop (the enemy's dashed ring at `k * ENEMY_RING` and the shield rings) stay exactly as they are. The chevron branch above stays exactly as it is.
- Update the file's header comment line about the ship if it mentions the wedge (search `wedge` in the file; there must be no match left).

- [ ] **Step 5: Run the tests**

Run: `npx tsc -b` (exit 0), then `npx vitest run tests/tacticalModel.test.ts tests/dashModel.test.ts tests/duelWeaponsView.test.ts tests/crtColours.test.ts tests/hullModel.test.ts tests/tacticalLayer.test.ts tests/crtFilter.test.ts`
Expected: PASS. Then `grep -rn "wedgeSegments\|WEDGE_\|segmentCentre" src tests` prints nothing.

- [ ] **Step 6: Full suite and commit**

Run: `npm run build` then `npx vitest run`. Expected: the Step 0 baseline plus 1 file (`hullModel.test.ts`) and +9 tests (Task 1's 9, plus the new tacticalModel test, minus the deleted dashModel wedge test), so baseline + 9 tests in baseline + 1 files, 0 failed. Rerun a timed-out sim file alone. Then:
```bash
git add src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/render/tactical/weaponsModel.ts tests/tacticalModel.test.ts tests/dashModel.test.ts tests/duelWeaponsView.test.ts tests/crtColours.test.ts
git commit -m "feat(hull-silhouettes): draw the Hound and the scout with per-room damage; the lock on the scout's rooms; retire the wedge" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Screenshots, the boundary check and the gate

**Files:**
- Create (gitignored, never committed): `.art/shots/` harness files.
- Modify: `docs/gates.md`.

- [ ] **Step 1: The boundary check**

Run: `git diff master --stat -- src/renderer/src/sim src/renderer/src/authority src/network src/shared src/main` (prints nothing); `grep -n "SIM_VERSION =" src/renderer/src/sim/tuning.ts` (unchanged from master); `npx vitest run tests/golden.test.ts tests/duelGolden.test.ts` (pass).

- [ ] **Step 2: The harness**

Copy the CRT map's harness from `docs/superpowers/plans/2026-11-17-crt-map.md`, Task 7 Step 3 (the code blocks between `**Step 3: Write the screenshot harness**` and `**Step 4: Take the screenshots**`), into `.art/shots/` exactly as written there, with these changes:
1. In `main.ts`, read `zoom` from the query (`const zoom = Number(q.get('zoom') ?? '0.9')`, beside `view` and `crt`) and use it as the third argument of both `createCamera` calls (helm and weapons) in place of `0.9`.
2. In `main.ts`, add `import { createInteriorCamera } from '../../src/renderer/src/render/duel/interiorCamera';` beside the other imports, and the field `interiorCamera: createInteriorCamera(),` in the `source` object right after `cameras: { ... },` (`DuelViewSource.interiorCamera` is required, scene.ts L35; the runtime builds it the same way, runtime.ts L227).
3. In the runner, replace the shot list with:
```ts
[['view=weapons&crt=subtle&zoom=0.5&phase=a', 1920, 1080, 'weapons-0.5-a.png', 0],
 ['view=weapons&crt=subtle&zoom=0.5&phase=b', 1920, 1080, 'weapons-0.5-b.png', 0],
 ['view=helm&crt=subtle&zoom=0.5', 1920, 1080, 'helm-0.5.png', 0],
 ['view=flight&crt=subtle', 1920, 1080, 'flight.png', 0],
 ['view=weapons&crt=subtle&zoom=1.2&phase=a', 1920, 1080, 'weapons-1.2-a.png', 0],
 ['view=weapons&crt=subtle&zoom=1.2&phase=b', 1920, 1080, 'weapons-1.2-b.png', 0],
 ['view=weapons&crt=full&zoom=1.2', 1920, 1080, 'weapons-1.2-full.png', 0]]
```
   (the last number is the extra delay in ms before the shot; the phase comes from `&phase=`). The output folder is not in the runner: it is the second argument of `all.mjs` (Step 3).
4. The harness stages own rooms `[1, 2, 0]` and enemy rooms `[2, 1, 0]` with the lock on Shields; keep that.
5. Pin the blink phase in the page, so the two phase shots differ whatever the load time: in `main.ts`, right after the line that defines `q` and `view` and before `createRenderer`, add:
```ts
  const ph = q.get('phase');
  if (ph) { const real = performance.now.bind(performance); performance.now = () => { const r = real(); return r - (r % 500) + (ph === 'b' ? 260 : 10); }; }
```
   The 2 Hz damage blink then holds phase 0 for `a` and phase 1 for `b`; the 1 Hz enemy ring changes only between the two shots.

- [ ] **Step 3: Take the screenshots**

Run `npm run build`. Check the port is free: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | Measure-Object | % Count"` prints `0`. Start the harness server in the background and keep it running: `npx vite --config .art/shots/vite.config.mjs`; wait for `Local: http://localhost:5299/`. Then (Electron needs a desktop session; if the tool sandbox blocks GUI processes, run without the sandbox):

```bash
E=node_modules/electron/dist/electron.exe; [ -f "$E" ] || E=/c/Users/djuar/FTLite/node_modules/electron/dist/electron.exe
mkdir -p /c/Users/djuar/FTLite-shots/hull-silhouettes
rm -f .art/shots/shot.log; node .art/shots/all.mjs "$E" "C:/Users/djuar/FTLite-shots/hull-silhouettes"; grep -v wrote .art/shots/shot.log
```

Expected: seven `ok   <name>.png (1920x1080) exit 0` lines (the shot list's names) and no `page:`, `failed` or `uncaught` lines. Nothing is written to the CRT map's shot folder.

Stop the harness: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id $_.OwningProcess -Force }; Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | ? { $_.CommandLine -like '*hull-silhouettes*shot.cjs*' } | % { Stop-Process -Id $_.ProcessId -Force }"`, then the port count command above prints `0`. Never stop a process you did not start.

- [ ] **Step 4: Look at the screenshots** (Read each PNG) and check, writing pass/fail per item in the report:
- The crew's ship reads as the Hound (twin aft nacelles, the body, the cockpit nose, nose along its heading, not mirrored: compare with `C:\Users\djuar\FTLite-shots\hull-silhouettes\prototype-2.png`); the enemy reads as the drone scout (forked nose, disc, spine, swept fins).
- In `weapons-0.5-a.png` and `weapons-0.5-b.png` (the two blink phases), the spec's check holds: level 1 differs from level 0 in each phase; level 2 differs from level 0 in at least one phase and from level 1 in each phase (crew level 2 in one phase matches the hull, by design).
- The lock brackets sit on the scout's Shields room; the LOCK label clears the hull.
- The enemy's dashed ring clears the scout; the shield rings clear both hulls.
- At zoom 1.2 the room outlines and hatching are crisp; at `full` they still read.
- Only amber.
Do not change product code in this task; report any failure as DONE_WITH_CONCERNS with the file name and what you see.

- [ ] **Step 5: The gate and commit**

In `docs/gates.md`, insert before the line `## Helm demo (Helm spec §16; H-2 spec §8 to §11)`:

```markdown
## Hull silhouettes: the Hound and an original drone scout on the console maps (2026-11-17)

Spec `docs/superpowers/specs/2026-11-17-hull-silhouettes-design.md`; plan `docs/superpowers/plans/2026-11-17-hull-silhouettes.md`.

- [x] Automated (hull silhouettes): `npm test` passes, including both hulls' constraints (rooms convex, inside the outline with no edge crossing, at least 0.2 square units; outlines simple; the scout within ENEMY_RING − 0.1 and the Hound within 1.55), `hullFor`, `roomCentre`, every ship carrying its hull, the lock on the scout's room, and the full-frame CRT colour test with both hulls at every damage level in both phases; `npx tsc -b` clean; sim, SIM_VERSION and goldens unchanged. Measured: TOTALS.
- [ ] Manual (owner): look at `C:\Users\djuar\FTLite-shots\hull-silhouettes\`. Does the crew's ship read as the Hound and the enemy as a distinct drone at a glance, and are damage and the lock still clear? Does the level-1 tone fill read well, or should level 1 be hatch only (spec section 2's fallback)?
```
Replace `TOTALS` with the Step 0-relative totals from Task 2 Step 6 (for example `N tests in M files, tsc clean, build ok`). Then:
```bash
git add docs/gates.md
git commit -m "docs(hull-silhouettes): the gate" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Report** the screenshot list with the Step 4 pass/fail per item, the totals and the boundary check.

## Self-review against the spec

- Section 1 (hull model, constraints, coordinates, ENEMY_RING move, consumers): Task 1 (module, tests), Task 2 (consumers, re-export).
- Section 2 (ShipDraw.hull required, shape from HULLS and colours from crew, the table, rings unchanged, chevron unchanged, no per-frame allocation, fresh poly arrays, lock label clearance): Task 2 Steps 2-4; crtColours covers the table's colours and the allocation; Task 3 Step 4 checks the look and the label.
- Section 3 (tests, unchanged sim, screenshots with the per-phase check, zoom 1.2, owner gate with the level-1 question): Tasks 1-3.
