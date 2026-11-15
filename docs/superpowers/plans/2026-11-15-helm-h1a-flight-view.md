# Helm Demo H-1a: The Dev Flight View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can fly the Helm demo's ship for the first time. `npm run dev:flight` (or a production build launched with `FTLITE_MODE=flight`) opens a dev flight view: one ship around the planet, flown with W/A/S/D. A follow camera zooms, pans and snaps back. The Helm map view draws the lettered grid, the gravity contours, the map edge, the planet, the belt and its gaps, the ship, the predicted path, the velocity and heading lines and the bearing ring, with off-screen arrows. A feel panel shows the numbers that parent §6's feel targets talk about.

**Architecture:** One sim change: `stepSoloFlight` in `sim/tactical/physics.ts` flies ship 0 and resolves only its static contacts, using `contacts.ts`'s per-ship static pass (`hitStatics`, now exported). Everything else is renderer code outside the determinism-guarded roots:
- the pure camera (`render/tactical/camera.ts`);
- the pure map-view model (`render/tactical/tacticalModel.ts`) and feel model (`feelModel.ts`);
- thin Pixi layers that only draw those models (`tacticalLayer.ts`, `feelPanel.ts`);
- the keyboard and pointer input (`app/duel/input.ts`);
- a headless-testable local runtime on today's `createTickDriver` (`app/duel/runtime.ts`);
- the mode boot (`app/duel/flightMode.ts`, `app/duel/mode.ts`).

`main.ts` moves today's body into `startSector()` unchanged and adds the `?mode=flight` branch. `src/main/index.ts` appends `?mode=` from `FTLITE_MODE`. **Nothing touches `net/contracts.ts`, `authority/` or `sim/duel/`.**

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Pixi.js 8.19, electron-vite 5, Vitest 3.2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-helm-h1-views-design.md` (H-1 views), H-1a row of §11: §3 entry and modes, §4 the runtime (clock, interpolation, pause), §5 input, §6 camera, §7 items 1 to 7 (Helm layer) and 9 (overlay), §9 the flight view, §10 architecture and the allocation test, §12 H-1a acceptance. Parent: `docs/superpowers/specs/2026-11-14-helm-demo-design.md` §6 (flight and feel targets), §10 (console map views), §12 (look).

## Scope

- **Task 1:** `stepSoloFlight` and the exported static-contact pass (the only sim change).
- **Task 2:** the camera and the keyboard and pointer input (pure, tested headless).
- **Task 3:** the tactical map-view model and the feel model (pure, tested headless).
- **Task 4:** the Pixi tactical layer and the feel panel, with the allocation test.
- **Task 5:** the flight runtime, the mode flag and boot, `main.ts`, `src/main/index.ts`, `dev:flight`, and the screenshot check.
- **Not here (H-1b):** `dev:duel` and `?mode=duel` (until then `?mode=duel` starts the sector game, as "anything else" does); the runtime on `stepDuelTick`; duel commands and Tab presence; the Weapons layer and the missile-path predictor; ship 1, missiles and trails, the lock marker and the combat readout; the interior view; event effects, contact sparks and shake; the end screen and restart.

No sector code changes behaviour and no `SIM_VERSION` bump is needed: `stepSoloFlight` is new, and `hitStatics` only gains `export`. `stepFlight` and `stepDuel` are byte-for-byte unchanged, so every golden stays as it is.

## Global Constraints

- Determinism guard (`tests/boundary.test.ts`, `tests/helpers/determinismGuard.ts`) scans every file under `src/renderer/src/sim/**`, including the changed `physics.ts` and `contacts.ts`. Allowed `Math` methods there: `abs`, `ceil`, `floor`, `round`, `min`, `max`, `sign`, `imul`, `sqrt`. No `sin`, `cos`, `atan2`, `hypot`, `pow`, `random`, no `**`, no `Date` or `performance`. Render and app code (`render/tactical/`, `app/duel/`) is not guarded and may use any `Math` (the model uses `Math.sin`, `Math.atan2`, `Math.log`, `Math.exp` and `**`). Tests may use `Math.hypot`.
- Files under `sim/` may not import from `authority`, `clientControl`, `headless`, `render` or `app`. The new renderer code imports from `sim/` freely; nothing under `sim/` imports it.
- **No change to `net/contracts.ts`, `authority/`, `sim/duel/` or any sector behaviour.** `main.ts`'s sector path is today's body moved verbatim into `startSector()`.
- Tick rate 60, `DT` 1/60. Ship 0 is the crew's ship. The flight view never steps, collides with or draws ship 1.
- Every new display object is created when its layer is created. A frame only clears and redraws `Graphics`, sets `BitmapText` text, position and visibility. Task 4's test enforces this.
- Commit with explicit paths only (`git add <paths>`), never `git add -A` or `git add .`: the owner keeps unrelated uncommitted files in this checkout. End every commit message with the Co-Authored-By trailer your own session instructs.
- Run single test files with `npx vitest run <file>`. The full suite is `npm test` (1,872 tests and 1 skipped after this plan; 1,817 before it). Typecheck is `npm run typecheck` (`tsc -b`, both the web and the node projects).
- Known flakes: `tests/authorityBoundary.test.ts` and `tests/run.test.ts` can time out under full-suite load. If one fails in `npm test`, rerun it alone; it is unrelated to this plan.
- Line endings: write files with LF. The repository normalises on commit (`core.autocrlf`).

## Decisions the plan makes inside the spec

Each is marked **(rec.)** in the spec's sense: the recommendation, taken under the standing order, which the owner can overturn.

1. **The single-ship step** **(rec.)** is `stepSoloFlight(state, axes, tuning = DEFAULT_FLIGHT)`: `flyShip` on ship 0, `hitStatics` on ship 0, `tick++`. It does not touch `events` or `outcome`, which the flight view never reads. §11's table says "the local runtime with `stepFlight`"; §9 (the single-ship step) is the specific rule and wins, because `stepFlight` would fly and collide ship 1.
2. **Input sampling** **(rec.)**: the runtime samples the keyboard and pointer once per render frame (`frame(dt)`). Each sim tick uses the latest held axes, at most one frame old, and records them as the "current axes" the model draws with (spec §7). Press edges (Escape, C, `−`/`=`) and pointer input act in the frame, so the camera can still zoom and pan while paused. Within a frame the drag is applied before the wheel, because a pan clears the zoom anchor: a frame with both still zooms about the cursor (Codex plan review).
3. **Wheel zoom while following** **(rec.)**: the wheel zooms about the cursor only when the camera is free (panned). While it follows the ship, every zoom is about the screen centre, so zooming never breaks follow and the ship never drifts off-centre. Keys always zoom about the centre (spec §6). The zoom eases in log space with a smoothstep over 0.15 s; the snap-back eases over 0.2 s.
4. **The grid's extent and names** **(rec.)**: the grid square is ±3000 units (the smallest multiple of 500 that encloses the map's 2800 circle), so there are 12 × 12 squares of 500 (columns A to L from the west, rows 1 to 12 from the north). Past zoom 0.6 the 250-unit lines are drawn as fainter minor lines, but **the labels always name the 500-unit squares**. Read literally, spec §7 would rename every square when the spacing halves (D4 at one zoom, H7 at another), which breaks parent §10a's callouts between two players at different zooms. Labels sit in the middle of each square's visible part (at least 24 px of it), along the top and left screen edges, or just inside the grid when its edge is on screen.
5. **Contours and culling**: contour radii come from bisection on the falling side of `gravityAccel` at module load (40 u/s² at about 250, 10 at about 500, 3 at about 910). A contour or the map edge is drawn only when the ring crosses the screen: not wholly off it, and not enclosing it. Asteroids are culled to the view; below 2 px radius they are 2-px dots, and below 0.5 px they are skipped. Each asteroid is a 9-vertex outline with radius multipliers 0.72 to 1.08, from a hash of its index (render-only).
6. **Ships** **(rec.)**: crew cyan `0x4fd6e8`; enemy red `0xe8564f` (used from H-1b). The wedge runs from the nose at 1.3 to the tail at −0.9 ship radii, 0.85 wide at the tail. Its segments split at 0.3 and −0.5: Weapons (nose), Shields (middle), Engines (stern). They are tinted ship colour, amber or red by damage level. Shield rings sit at 1.6 and 1.85 ship radii. Below 10 px across (zoom < 0.25) the ship is a 14-px chevron. Render positions and headings interpolate between the previous and current tick, the heading the short way round, using `heading + headingAcc` as a continuous heading.
7. **The Helm layer** **(rec.)**:
   - The predicted path starts at the ship's interpolated position and runs through `predictPath`'s points.
   - The velocity line shows 1 s of travel. The heading line runs 40 px out from 4 px past the nose.
   - Thrust is a flame behind the stern (forward) or ahead of the nose (reverse). A turn is a pip beside the heading line on the side it turns to.
   - The bearing ring has a fixed 120-px radius: ticks of 5 px (10 px every 30°), and labels 22 px out.
8. **The overlay** **(rec.)**:
   - Off-screen arrows point at the own ship (distance from the camera centre) and the planet (distance from the own ship). They are placed where the ray from the view's centre leaves a rectangle inset 28 px, keeping 266 px clear on the right for the feel panel, with the label inward of the glyph.
   - The scale bar is the largest of 50, 100, 200, 250, 500, 1000 and 2000 units that fits in 160 px.
   - "C: SNAP BACK" shows while the camera is free, and "PAUSED   ESC: RESUME" while the `user` pause is set.
   - The star field is 220 stars from an xorshift seeded by the run seed, with parallax (parent §10b layer 1, Codex plan review). The stars move against the camera at a fixed `STAR_PARALLAX` = 0.02 screen px per world unit the camera centre moves, at every zoom, so a ship at 800 u/s drifts them 16 px/s and zooming never moves them. One screen of stars is drawn once into its own `Graphics` as a 2 × 2 tile; each frame only sets its position to the offset wrapped into one screen (`starOffset`) minus one tile, so the field always covers the screen with no gap.
9. **The feel panel** **(rec.)**:
   - Distances are from the planet's centre, as parent §6's "r ≈ 150" is.
   - Skid is `|v · right|`, where `right` is the heading turned 90° clockwise.
   - Turn rate comes from the change in `heading + headingAcc` over the last tick (a full turn reads exactly 150°/s).
   - The 10-s minimum is a 600-sample ring buffer.
   - The panel is 250 px wide, top-right, with a six-line key help under the numbers.
10. **The runtime** lives in `app/duel/runtime.ts` as `createFlightRuntime`; H-1b adds the duel runtime beside it. Before the first tick `alpha()` is 1. It keeps a set of pause reasons (`user`, `blur`, `hidden`, `suspend`). Escape toggles `user`, focus removes only `blur`, and `visibilitychange` and the preload's suspend and resume hooks add and remove theirs. The flight view has no restart: the spec defines none, and a window reload (Ctrl+R in dev) starts again.
11. **Mode and seed**: `readMode` returns `'flight'` only for exactly `?mode=flight`, otherwise `'sector'`. `readSeed` accepts a whole number from 0 to 2^31 − 1, otherwise 2026. The flight boot reuses `createRenderer` (font, letterbox) and hides every existing stage child before adding its scene. Pointer positions map to internal pixels with `computeLetterbox` over the canvas's client rectangle, the same rule `renderer.resize` uses.
12. **`dev:flight`** runs `tsx scripts/dev-mode.ts flight`, a 7-line script that spawns `electron-vite dev` with `FTLITE_MODE` set. An npm script cannot set an environment variable on both Windows and POSIX without a new dependency (`cross-env`). `dev:duel` comes with H-1b, which builds the duel mode it would open.
13. **Input details**:
    - `−`/`=` and the numpad `−`/`+` zoom.
    - A wheel notch is 100 px of `deltaY` (line mode: 3 lines), at least one notch per sampled scroll.
    - Right (button 2) or middle (button 1) drag pans; the drag stops when neither button is held.
    - The keyboard prevents the default on Tab, Space, the arrows and Backspace, on keydown and keyup. The pointer prevents the context menu, and the wheel's default (it listens non-passive).
    - All of §5's press actions are mapped now, so H-1b adds no key plumbing.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/sim/tactical/contacts.ts` | **Replace:** `hitStatics` exported (only change) |
| `src/renderer/src/sim/tactical/physics.ts` | **Replace:** adds `stepSoloFlight` |
| `src/renderer/src/render/tactical/camera.ts` | **Create:** the console camera: zoom, follow, pan, snap, transforms |
| `src/renderer/src/app/duel/input.ts` | **Create:** the duel keyboard, the pointer source, `helmAxes`, `wheelNotches` |
| `src/renderer/src/render/tactical/tacticalModel.ts` | **Create:** the map-view draw lists; contours, interpolation, shapes |
| `src/renderer/src/render/tactical/feelModel.ts` | **Create:** the feel tracker and readout |
| `src/renderer/src/render/tactical/tacticalLayer.ts` | **Create:** the Pixi map-view layer |
| `src/renderer/src/render/tactical/feelPanel.ts` | **Create:** the Pixi feel panel |
| `src/renderer/src/app/duel/runtime.ts` | **Create:** `createFlightRuntime` |
| `src/renderer/src/app/duel/mode.ts` | **Create:** `readMode`, `readSeed` |
| `src/renderer/src/app/duel/flightMode.ts` | **Create:** `startFlightMode`, the browser wiring |
| `src/renderer/src/main.ts` | **Replace:** `startSector` (today's body), `startFlight`, the mode switch |
| `src/main/index.ts` | **Replace:** `FTLITE_MODE` becomes `?mode=` |
| `scripts/dev-mode.ts` | **Create:** runs `electron-vite dev` with `FTLITE_MODE` |
| `package.json` | **Replace:** adds `dev:flight` |
| `tests/tacticalSoloFlight.test.ts`, `tests/tacticalCamera.test.ts`, `tests/duelInput.test.ts`, `tests/tacticalModel.test.ts`, `tests/tacticalLayer.test.ts`, `tests/flightRuntime.test.ts` | **Create:** the tests |

---

### Task 1: The single-ship flight step

**Files:**
- Replace: `src/renderer/src/sim/tactical/contacts.ts`, `src/renderer/src/sim/tactical/physics.ts`
- Create: `tests/tacticalSoloFlight.test.ts`

**Interfaces:**
- Consumes: `flyShip`, `resolveContacts`, `TacticalState`, `Axes`, `DEFAULT_FLIGHT` as merged (H-0c-i).
- Produces:
  - `export function hitStatics(state: TacticalState, s: Ship): void` (in `contacts.ts`; previously module-private, otherwise unchanged).
  - `export function stepSoloFlight(state: TacticalState, axes: Axes, tuning: FlightTuning = DEFAULT_FLIGHT): void` (in `physics.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/tacticalSoloFlight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hitStatics } from '../src/renderer/src/sim/tactical/contacts';
import { stepFlight, stepSoloFlight } from '../src/renderer/src/sim/tactical/physics';
import { cloneShip, createTacticalState, type Ship } from '../src/renderer/src/sim/tactical/state';
import { PLANET_CONTACT_HULL, PLANET_RADIUS, SHIP_HULL, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';

const plain = (s: Ship) => ({ ...s, graceUntil: [...s.graceUntil] });

describe('stepSoloFlight (H-1 spec §9)', () => {
  it('flies ship 0 and advances the tick; ship 1 never moves', () => {
    const st = createTacticalState(7), before = plain(cloneShip(st.ships[1]));
    const x0 = st.ships[0].x, y0 = st.ships[0].y;
    for (let t = 0; t < 120; t++) stepSoloFlight(st, { turn: 0, thrust: 1 });
    expect(st.tick).toBe(120);
    expect(Math.hypot(st.ships[0].x - x0, st.ships[0].y - y0)).toBeGreaterThan(100);
    expect(plain(st.ships[1])).toEqual(before);
  });

  it('never resolves ship-to-ship contact: ship 0 flies straight through ship 1', () => {
    const st = createTacticalState(7);
    Object.assign(st.ships[0], { x: -600, y: -300, vx: 200, vy: 0, heading: 64 });
    Object.assign(st.ships[1], { x: -560, y: -300, vx: 0, vy: 0, heading: 192 });
    const before = plain(cloneShip(st.ships[1]));
    for (let t = 0; t < 60; t++) stepSoloFlight(st, { turn: 0, thrust: 0 });
    expect(st.ships[0].shipHits).toBe(0);
    expect(st.ships[0].hull).toBe(SHIP_HULL);
    expect(st.ships[0].x).toBeGreaterThan(-500);
    expect(plain(st.ships[1])).toEqual(before);
  });

  it('matches stepFlight for ship 0 when the ships are far apart', () => {
    const a = createTacticalState(11), b = createTacticalState(11);
    for (let t = 0; t < 300; t++) {
      const axes = { turn: t < 100 ? 1 : 0, thrust: t % 3 === 0 ? 0 : 1 };
      stepSoloFlight(a, axes); stepFlight(b, [axes, { turn: 0, thrust: 0 }]);
    }
    expect(plain(a.ships[0])).toEqual(plain(b.ships[0]));
  });

  it('ship 0 hits the planet: pushed out, bounced, hull cost, one hit counted', () => {
    const st = createTacticalState(3);
    Object.assign(st.ships[0], { x: 0, y: -(PLANET_RADIUS + SHIP_RADIUS + 5), vx: 0, vy: 300, heading: 128 });
    for (let t = 0; t < 10; t++) stepSoloFlight(st, { turn: 0, thrust: 0 });
    const s = st.ships[0];
    expect(s.planetHits).toBe(1);
    expect(s.hull).toBe(SHIP_HULL - PLANET_CONTACT_HULL);
    expect(Math.hypot(s.x, s.y)).toBeGreaterThanOrEqual(PLANET_RADIUS + SHIP_RADIUS - 1e-9);
  });

  it('exports the per-ship static pass: hitStatics leaves the other ship alone', () => {
    const st = createTacticalState(3);
    Object.assign(st.ships[0], { x: 0, y: -80, vx: 0, vy: 0 });
    Object.assign(st.ships[1], { x: 0, y: 80, vx: 0, vy: 0 });
    hitStatics(st, st.ships[0]);
    expect(st.ships[0].planetHits).toBe(1);
    expect(st.ships[1].planetHits).toBe(0);
    expect(st.ships[1].y).toBe(80);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tacticalSoloFlight.test.ts`
Expected: FAIL, all 5 tests: four with "TypeError: (0 , stepSoloFlight) is not a function" and one with "TypeError: (0 , hitStatics) is not a function", because neither is exported yet.

- [ ] **Step 3: Export the static pass and add the step**

Replace the whole of `src/renderer/src/sim/tactical/contacts.ts` with:

```ts
// Contacts (spec §4 collision matrix, ship rows; missiles join in H-0b). Each ship meets the planet, then asteroids in
// ascending index, in ship order; then the two ships meet. Push out, bounce keeping RESTITUTION of the normal speed,
// and cost hull only once per CONTACT_GRACE_TICKS per pair.
import { queryGrid } from './grid';
import { otherShipBody, type Ship, type TacticalState } from './state';
import { ASTEROID_CONTACT_HULL, CONTACT_GRACE_TICKS, PLANET_CONTACT_HULL, RESTITUTION, SHIP_CONTACT_HULL, SHIP_RADIUS } from './tuning';

/** True when this contact cost hull (outside the pair's grace window). */
function hitStatic(state: TacticalState, s: Ship, cx: number, cy: number, cr: number, body: number, hull: number): boolean {
  const dx = s.x - cx, dy = s.y - cy, rr = SHIP_RADIUS + cr, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2), nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : -1;
  s.x = cx + nx * rr; s.y = cy + ny * rr;
  const vn = s.vx * nx + s.vy * ny;
  if (vn < 0) { s.vx -= (1 + RESTITUTION) * vn * nx; s.vy -= (1 + RESTITUTION) * vn * ny; }
  if (state.tick < s.graceUntil[body]!) return false;
  s.hull = Math.max(0, s.hull - hull);
  s.graceUntil[body] = state.tick + CONTACT_GRACE_TICKS;
  return true;
}

function shipShip(state: TacticalState): void {
  const [a, b] = state.ships, body = otherShipBody(state.map);
  const dx = b.x - a.x, dy = b.y - a.y, rr = 2 * SHIP_RADIUS, d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  const d = Math.sqrt(d2), nx = d > 0 ? dx / d : 1, ny = d > 0 ? dy / d : 0, half = (rr - d) / 2;
  a.x -= nx * half; a.y -= ny * half; b.x += nx * half; b.y += ny * half;
  const an = a.vx * nx + a.vy * ny, bn = b.vx * nx + b.vy * ny;
  if (an - bn > 0) {   // closing: exchange the normal components, then keep RESTITUTION of each
    const an2 = RESTITUTION * bn, bn2 = RESTITUTION * an;
    a.vx += (an2 - an) * nx; a.vy += (an2 - an) * ny;
    b.vx += (bn2 - bn) * nx; b.vy += (bn2 - bn) * ny;
  }
  if (state.tick < a.graceUntil[body]!) return;
  for (const s of [a, b]) { s.hull = Math.max(0, s.hull - SHIP_CONTACT_HULL); s.graceUntil[body] = state.tick + CONTACT_GRACE_TICKS; s.shipHits++; }
}

/** One ship's static contacts (spec §4 order): the planet, then asteroids in ascending index. Exported for the
 *  single-ship flight step (H-1 spec §9). */
export function hitStatics(state: TacticalState, s: Ship): void {
  const { map, grid } = state;
  if (hitStatic(state, s, map.planet.x, map.planet.y, map.planet.r, 0, PLANET_CONTACT_HULL)) s.planetHits++;
  for (const k of queryGrid(grid, s.x, s.y, SHIP_RADIUS)) {
    const a = map.asteroids[k]!;
    if (hitStatic(state, s, a.x, a.y, a.r, k + 1, ASTEROID_CONTACT_HULL)) s.asteroidHits++;
  }
}

/** Spec §4 order, per body in ship order: its static contacts, then its moving contacts. Ship 0 meets the planet and
 *  asteroids, then ship 1 (the pair is resolved once, here); then ship 1 meets the planet and asteroids. */
export function resolveContacts(state: TacticalState): void {
  hitStatics(state, state.ships[0]);
  shipShip(state);
  hitStatics(state, state.ships[1]);
}
```

Replace the whole of `src/renderer/src/sim/tactical/physics.ts` with:

```ts
// Flight physics (spec §3, §4, §6): softened gravity, the edge spring, turn, thrust, stabilise, drag,
// semi-implicit Euler. Float64 with + − × ÷ and sqrt only; no trigonometry (the determinism guard enforces it).
import { hx, hy, wrapHeading } from './direction';
import { hitStatics, resolveContacts } from './contacts';
import { Room, type Axes, type Ship, type TacticalState } from './state';
import { DEFAULT_FLIGHT, DT, ENGINE_FACTOR, GM, GRAVITY_EPS, K_EDGE, R_MAP, REVERSE_FRACTION, THRUST, TURN_STEPS_PER_TICK, type FlightTuning } from './tuning';

/** Acceleration toward the planet at the origin: a = −GM · d / (|d|² + ε²)^{3/2}. */
export function gravityAccel(x: number, y: number): [number, number] {
  const q = x * x + y * y + GRAVITY_EPS * GRAVITY_EPS;
  const k = -GM / (q * Math.sqrt(q));
  return [k * x, k * y];
}

/** Inward acceleration past the map edge: a = −K_EDGE · (|d| − R_MAP) · d/|d|; zero inside. */
export function edgeAccel(x: number, y: number): [number, number] {
  const d = Math.sqrt(x * x + y * y);
  if (d <= R_MAP) return [0, 0];
  const k = (-K_EDGE * (d - R_MAP)) / d;
  return [k * x, k * y];
}

export function engineFactor(s: Ship): number { return ENGINE_FACTOR[s.rooms[Room.Engines]]!; }

/** One tick of one ship's flight, without contacts. Shared by the step and by predictPath, so the prediction is exact. */
export function flyShip(s: Ship, axes: Axes, tuning: FlightTuning): void {
  // Quantise the held axes by sign (spec: each is -1, 0 or 1); `|| 0` maps NaN and -0 to 0.
  const turn = Math.sign(axes.turn) || 0, thrust = Math.sign(axes.thrust) || 0;
  const f = engineFactor(s);
  s.headingAcc += turn * TURN_STEPS_PER_TICK * f;
  while (s.headingAcc >= 1) { s.heading = wrapHeading(s.heading + 1); s.headingAcc -= 1; }
  while (s.headingAcc <= -1) { s.heading = wrapHeading(s.heading - 1); s.headingAcc += 1; }
  const h0 = hx(s.heading), h1 = hy(s.heading);
  // Stabilise (spec §6): on the tick both axes go to zero, capture the sideways speed (along px, py, 90° clockwise of the
  // nose) as the skid to remove; then remove up to STABILISE · dt of it per tick until it is gone. Gravity's later
  // sideways pull is never captured, so a released ship still falls and orbits. Runs before this tick's forces.
  const idle = turn === 0 && thrust === 0, px = -h1, py = h0;
  if (idle && !s.released) { const side = s.vx * px + s.vy * py; s.skidBudget = Math.abs(side); s.skidSign = Math.sign(side); }
  if (!idle) { s.skidBudget = 0; s.skidSign = 0; }
  s.released = idle;
  if (idle && s.skidBudget > 0 && tuning.stabilise > 0) {
    const cut = Math.min(s.skidBudget, tuning.stabilise * DT);
    s.vx -= s.skidSign * cut * px; s.vy -= s.skidSign * cut * py; s.skidBudget -= cut;
  }
  let ax = 0, ay = 0;
  if (tuning.gravity) { const [gx, gy] = gravityAccel(s.x, s.y); ax += gx; ay += gy; }
  if (tuning.edge) { const [ex, ey] = edgeAccel(s.x, s.y); ax += ex; ay += ey; }
  if (thrust > 0) { ax += h0 * THRUST * f; ay += h1 * THRUST * f; }
  else if (thrust < 0) { ax -= h0 * THRUST * REVERSE_FRACTION * f; ay -= h1 * THRUST * REVERSE_FRACTION * f; }
  s.vx += ax * DT; s.vy += ay * DT;
  const keep = 1 - tuning.drag * DT;
  s.vx *= keep; s.vy *= keep;
  s.skidBudget *= keep;   // drag shrinks the remaining skid too, so the assist never pushes past zero
  s.x += s.vx * DT; s.y += s.vy * DT;
}

/** One duel tick of flight: ships fly in fixed order, then contacts resolve, then the tick advances. */
export function stepFlight(state: TacticalState, axes: readonly Axes[], tuning: FlightTuning = DEFAULT_FLIGHT): void {
  state.ships.forEach((s, i) => flyShip(s, axes[i] ?? { turn: 0, thrust: 0 }, tuning));
  resolveContacts(state);
  state.tick++;
}

/** The dev flight view's single-ship step (H-1 spec §9): ship 0 flies, meets the planet and asteroids, then the tick
 *  advances. Ship 1 is never stepped and never collides, so it stays exactly as created. */
export function stepSoloFlight(state: TacticalState, axes: Axes, tuning: FlightTuning = DEFAULT_FLIGHT): void {
  flyShip(state.ships[0], axes, tuning);
  hitStatics(state, state.ships[0]);
  state.tick++;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/tacticalSoloFlight.test.ts tests/tactical*.test.ts tests/boundary.test.ts`
Expected: PASS (5 new tests; every existing tactical test and the boundary test unchanged).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/sim/tactical/contacts.ts src/renderer/src/sim/tactical/physics.ts tests/tacticalSoloFlight.test.ts
git commit -m "feat(tactical): stepSoloFlight, the dev flight view's single-ship step (Helm H-1a)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 2: The camera and the input

**Files:**
- Create: `src/renderer/src/render/tactical/camera.ts`, `src/renderer/src/app/duel/input.ts`
- Create: `tests/tacticalCamera.test.ts`, `tests/duelInput.test.ts`

**Interfaces:**
- Consumes: `Axes` (`sim/tactical/state.ts`).
- Produces (`render/tactical/camera.ts`):
  - `ZOOM_MIN = 0.12`, `ZOOM_MAX = 1.2`, `ZOOM_DEFAULT = 0.5`, `ZOOM_STEP = 1.25`, `ZOOM_EASE_S = 0.15`, `SNAP_EASE_S = 0.2`.
  - `type Follow = 'ship' | 'missile' | 'free'`; `interface Viewport { w; h }`; `interface Point { x; y }`.
  - `interface Camera { centreX; centreY; zoom; targetZoom; follow; zoomFrom; zoomT; anchor; snap }`.
  - `createCamera(x = 0, y = 0, zoom = ZOOM_DEFAULT): Camera`; `clampZoom(z): number`.
  - `worldToScreen(cam, vp, x, y): Point`; `screenToWorld(cam, vp, sx, sy): Point`; `visibleWorld(cam, vp): { x0; y0; x1; y1 }`.
  - `zoomBy(cam, vp, notches, at: Point | null = null): void`; `pan(cam, dx, dy): void`; `snapBack(cam, to: Follow = 'ship'): void`; `followBody(cam, to): void`.
  - `updateCamera(cam, vp, dt, followed: Point | null): void`.
- Produces (`app/duel/input.ts`):
  - `type KeyAction = 'interact' | 'prevLock' | 'fireDown' | 'fireUp' | 'launch' | 'stand' | 'switch' | 'pause' | 'camera' | 'zoomIn' | 'zoomOut' | 'confirm'`.
  - `interface KeySample { moveX; moveY; interactHeld; fireHeld; presses: Record<KeyAction, number> }`; `emptyPresses()`.
  - `helmAxes(k: Pick<KeySample, 'moveX' | 'moveY'>): Axes`: turn = sign(moveX), thrust = −sign(moveY).
  - `interface EventSource { addEventListener; removeEventListener }` (structural, for fakes).
  - `createDuelKeyboard(target: EventSource): { sample(): KeySample; clear(): void; destroy(): void }`.
  - `interface PointerSample { x: number | null; y: number | null; wheel; dragX; dragY }`.
  - `createPointerSource(target, toInternal: (clientX, clientY) => { x; y }): { sample(): PointerSample; clear(): void; destroy(): void }`.
  - `wheelNotches(deltaY: number): number`.

- [ ] **Step 1: Write the failing tests**

Create `tests/tacticalCamera.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createCamera, followBody, pan, screenToWorld, snapBack, updateCamera, visibleWorld, worldToScreen, zoomBy,
  SNAP_EASE_S, ZOOM_DEFAULT, ZOOM_EASE_S, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP
} from '../src/renderer/src/render/tactical/camera';

const vp = { w: 1280, h: 720 };
/** Run the camera for `s` seconds of 60 fps frames. */
function run(cam: ReturnType<typeof createCamera>, s: number, followed: { x: number; y: number } | null = { x: 0, y: 0 }): void {
  for (let t = 0; t < Math.round(s * 60); t++) updateCamera(cam, vp, 1 / 60, followed);
}

describe('camera transforms (H-1 spec §6)', () => {
  it('maps the centre to the screen centre, north up, at the zoom scale', () => {
    const cam = createCamera(100, -200);
    expect(cam.zoom).toBe(ZOOM_DEFAULT);
    expect(worldToScreen(cam, vp, 100, -200)).toEqual({ x: 640, y: 360 });
    expect(worldToScreen(cam, vp, 100, -400)).toEqual({ x: 640, y: 260 });   // north (−y) is up the screen
    expect(worldToScreen(cam, vp, 300, -200)).toEqual({ x: 740, y: 360 });
  });
  it('screenToWorld inverts worldToScreen', () => {
    const cam = createCamera(-1234.5, 987.25, 0.37);
    for (const [x, y] of [[0, 0], [-2800, 2800], [55.5, -1.25]] as const) {
      const s = worldToScreen(cam, vp, x, y), w = screenToWorld(cam, vp, s.x, s.y);
      expect(w.x).toBeCloseTo(x, 9); expect(w.y).toBeCloseTo(y, 9);
    }
  });
  it('visibleWorld is the viewport in world units', () => {
    const cam = createCamera(0, 0, 0.5);
    expect(visibleWorld(cam, vp)).toEqual({ x0: -1280, y0: -720, x1: 1280, y1: 720 });
  });
});

describe('camera zoom', () => {
  it('steps the target by ×1.25 a notch and eases the zoom there in 0.15 s', () => {
    const cam = createCamera();
    zoomBy(cam, vp, 1);
    expect(cam.targetZoom).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP, 12);
    expect(cam.zoom).toBe(ZOOM_DEFAULT);
    updateCamera(cam, vp, ZOOM_EASE_S / 2, { x: 0, y: 0 });
    expect(cam.zoom).toBeGreaterThan(ZOOM_DEFAULT); expect(cam.zoom).toBeLessThan(cam.targetZoom);
    updateCamera(cam, vp, ZOOM_EASE_S, { x: 0, y: 0 });
    expect(cam.zoom).toBe(cam.targetZoom);
  });
  it('clamps between 0.12 and 1.2', () => {
    const cam = createCamera();
    zoomBy(cam, vp, 40); run(cam, 0.5); expect(cam.zoom).toBe(ZOOM_MAX);
    zoomBy(cam, vp, -40); run(cam, 0.5); expect(cam.zoom).toBe(ZOOM_MIN);
  });
  it('a free camera zooms about the cursor: the world point under it stays put', () => {
    const cam = createCamera(); pan(cam, 1, 0);
    const at = { x: 1000, y: 100 }, before = screenToWorld(cam, vp, at.x, at.y);
    zoomBy(cam, vp, 2, at);
    updateCamera(cam, vp, 0.05, null);
    const mid = screenToWorld(cam, vp, at.x, at.y);
    expect(mid.x).toBeCloseTo(before.x, 6); expect(mid.y).toBeCloseTo(before.y, 6);
    run(cam, 0.3, null);
    const after = screenToWorld(cam, vp, at.x, at.y);
    expect(after.x).toBeCloseTo(before.x, 6); expect(after.y).toBeCloseTo(before.y, 6);
    expect(cam.anchor).toBeNull();
  });
  it('a following camera zooms about the followed body (the screen centre)', () => {
    const cam = createCamera(50, 50);
    zoomBy(cam, vp, 1, { x: 1000, y: 100 });
    expect(cam.anchor).toBeNull();
    run(cam, 0.3, { x: 50, y: 50 });
    expect(worldToScreen(cam, vp, 50, 50)).toEqual({ x: 640, y: 360 });
  });
});

describe('camera follow, pan and snap back', () => {
  it('follows the body each frame', () => {
    const cam = createCamera();
    updateCamera(cam, vp, 1 / 60, { x: 300, y: -40 });
    expect([cam.centreX, cam.centreY]).toEqual([300, -40]);
  });
  it('a drag frees the camera and moves the world with the pointer', () => {
    const cam = createCamera(0, 0, 0.5);
    pan(cam, 100, -50);
    expect(cam.follow).toBe('free');
    expect([cam.centreX, cam.centreY]).toEqual([-200, 100]);
    updateCamera(cam, vp, 1 / 60, { x: 999, y: 999 });
    expect([cam.centreX, cam.centreY]).toEqual([-200, 100]);
  });
  it('C eases back to the ship over 0.2 s and then follows it', () => {
    const cam = createCamera(); pan(cam, 400, 0);
    const ship = { x: 10, y: 10 };
    snapBack(cam);
    expect(cam.follow).toBe('ship');
    updateCamera(cam, vp, SNAP_EASE_S / 2, ship);
    expect(cam.centreX).toBeGreaterThan(-800); expect(cam.centreX).toBeLessThan(10);
    updateCamera(cam, vp, SNAP_EASE_S, ship);
    expect([cam.centreX, cam.centreY]).toEqual([10, 10]);
    expect(cam.snap).toBeNull();
    updateCamera(cam, vp, 1 / 60, { x: 20, y: 30 });
    expect([cam.centreX, cam.centreY]).toEqual([20, 30]);
  });
  it('followBody eases to a new body only when it changes', () => {
    const cam = createCamera();
    followBody(cam, 'ship'); expect(cam.snap).toBeNull();
    followBody(cam, 'missile'); expect(cam.follow).toBe('missile'); expect(cam.snap).not.toBeNull();
  });
});
```

Create `tests/duelInput.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createDuelKeyboard, createPointerSource, helmAxes, wheelNotches, type EventSource } from '../src/renderer/src/app/duel/input';

/** A fake event target: records listeners and dispatches plain objects to them. */
function fakeTarget() {
  const listeners = new Map<string, ((e: never) => void)[]>();
  const target: EventSource & { fire(type: string, e: object): void; count(): number } = {
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)); },
    fire(type, e) { for (const fn of listeners.get(type) ?? []) fn(e as never); },
    count() { return [...listeners.values()].reduce((n, l) => n + l.length, 0); }
  };
  return target;
}
const key = (code: string, repeat = false) => ({ code, repeat, preventDefault: vi.fn() });

describe('duel keyboard (H-1 spec §5)', () => {
  it('maps WASD to the move vector and the Helm axes', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t);
    t.fire('keydown', key('KeyW'));
    let s = kb.sample();
    expect([s.moveX, s.moveY]).toEqual([0, -1]);
    expect(helmAxes(s)).toEqual({ turn: 0, thrust: 1 });
    t.fire('keydown', key('KeyD'));
    s = kb.sample();
    expect(s.moveX).toBeCloseTo(Math.SQRT1_2, 12); expect(s.moveY).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(helmAxes(s)).toEqual({ turn: 1, thrust: 1 });
    t.fire('keyup', key('KeyW')); t.fire('keyup', key('KeyD')); t.fire('keydown', key('KeyS')); t.fire('keydown', key('KeyA'));
    expect(helmAxes(kb.sample())).toEqual({ turn: -1, thrust: -1 });
    t.fire('keyup', key('KeyS')); t.fire('keyup', key('KeyA'));
    const idle = helmAxes(kb.sample());
    expect(Object.is(idle.turn, 0) && Object.is(idle.thrust, 0)).toBe(true);
  });
  it('counts press edges once per sample, ignoring auto-repeat', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t);
    t.fire('keydown', key('Escape')); t.fire('keydown', key('KeyC')); t.fire('keydown', key('KeyC', true));
    t.fire('keydown', key('Equal')); t.fire('keydown', key('Minus')); t.fire('keydown', key('NumpadSubtract'));
    const s = kb.sample();
    expect(s.presses.pause).toBe(1); expect(s.presses.camera).toBe(1); expect(s.presses.zoomIn).toBe(1); expect(s.presses.zoomOut).toBe(2);
    expect(kb.sample().presses.camera).toBe(0);
  });
  it('Space down and up are two edges and fireHeld follows the key', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t);
    t.fire('keydown', key('Space'));
    let s = kb.sample(); expect(s.presses.fireDown).toBe(1); expect(s.fireHeld).toBe(true);
    t.fire('keyup', key('Space'));
    s = kb.sample(); expect(s.presses.fireUp).toBe(1); expect(s.fireHeld).toBe(false);
  });
  it('prevents the browser default on Tab, Space, the arrows and Backspace only, on press and release', () => {
    const t = fakeTarget(); createDuelKeyboard(t);
    for (const code of ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']) {
      const down = key(code); t.fire('keydown', down); expect(down.preventDefault, `${code} down`).toHaveBeenCalled();
      const up = key(code); t.fire('keyup', up); expect(up.preventDefault, `${code} up`).toHaveBeenCalled();
    }
    for (const code of ['KeyW', 'Escape', 'F11', 'Equal']) {
      const down = key(code); t.fire('keydown', down); expect(down.preventDefault, `${code} down`).not.toHaveBeenCalled();
      const up = key(code); t.fire('keyup', up); expect(up.preventDefault, `${code} up`).not.toHaveBeenCalled();
    }
  });
  it('blur and clear drop held keys and pending presses; destroy removes every listener', () => {
    const t = fakeTarget(), kb = createDuelKeyboard(t);
    t.fire('keydown', key('KeyW')); t.fire('keydown', key('KeyC')); t.fire('blur', {});
    let s = kb.sample(); expect(s.moveY).toBe(0); expect(s.presses.camera).toBe(0);
    t.fire('keydown', key('KeyE')); kb.clear();
    s = kb.sample(); expect(s.interactHeld).toBe(false); expect(s.presses.interact).toBe(0);
    kb.destroy(); expect(t.count()).toBe(0);
  });
});

describe('pointer source (H-1 spec §5)', () => {
  const half = (x: number, y: number) => ({ x: x / 2, y: y / 2 });   // a 2× letterbox
  const ptr = (clientX: number, clientY: number, button: number, buttons: number) => ({ clientX, clientY, button, buttons, preventDefault: vi.fn() });
  it('tracks the position in internal pixels and sums the wheel', () => {
    const t = fakeTarget(), p = createPointerSource(t, half);
    t.fire('pointermove', ptr(200, 100, -1, 0));
    const w = { clientX: 400, clientY: 300, deltaY: 100, deltaMode: 0, preventDefault: vi.fn() };
    t.fire('wheel', w); t.fire('wheel', { ...w, deltaY: 100 });
    const s = p.sample();
    expect([s.x, s.y, s.wheel]).toEqual([200, 150, 200]);
    expect(w.preventDefault).toHaveBeenCalled();
    expect(p.sample().wheel).toBe(0);
  });
  it('drags with the right or middle button only, and suppresses the context menu', () => {
    const t = fakeTarget(), p = createPointerSource(t, half);
    t.fire('pointerdown', ptr(100, 100, 2, 2));
    t.fire('pointermove', ptr(140, 80, -1, 2));
    expect(p.sample()).toMatchObject({ dragX: 20, dragY: -10 });
    t.fire('pointerup', ptr(140, 80, 2, 0));
    t.fire('pointermove', ptr(200, 80, -1, 0));
    expect(p.sample()).toMatchObject({ dragX: 0, dragY: 0 });
    t.fire('pointerdown', ptr(200, 80, 0, 1)); t.fire('pointermove', ptr(260, 80, -1, 1));   // left button: no pan
    expect(p.sample().dragX).toBe(0);
    t.fire('pointerdown', ptr(260, 80, 1, 4)); t.fire('pointermove', ptr(270, 80, -1, 4));   // middle button pans
    expect(p.sample().dragX).toBe(5);
    const menu = { preventDefault: vi.fn() }; t.fire('contextmenu', menu); expect(menu.preventDefault).toHaveBeenCalled();
  });
  it('wheel notches: one per 100 px, at least one, scrolling up zooms in', () => {
    expect(wheelNotches(0)).toBe(0);
    expect(wheelNotches(-100)).toBe(1); expect(wheelNotches(300)).toBe(-3); expect(wheelNotches(4)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/tacticalCamera.test.ts tests/duelInput.test.ts`
Expected: FAIL, both suites: "Error: Cannot find module '../src/renderer/src/render/tactical/camera'" and "Error: Cannot find module '../src/renderer/src/app/duel/input'".

- [ ] **Step 3: Write the camera**

Create `src/renderer/src/render/tactical/camera.ts`:

```ts
// The console camera (H-1 spec §6, parent §10a). Pure: no Pixi, no DOM. North is up and the world's y grows down the
// screen, as the sim's headings do (index 0 = (0, −1)), so a world point maps to the screen by a scale and a shift.
// The camera is client-only view state: never sent to the sim, never hashed.

export const ZOOM_MIN = 0.12, ZOOM_MAX = 1.2, ZOOM_DEFAULT = 0.5;
/** One wheel notch or one `−`/`=` press multiplies or divides the target zoom by this. */
export const ZOOM_STEP = 1.25;
export const ZOOM_EASE_S = 0.15, SNAP_EASE_S = 0.2;

export type Follow = 'ship' | 'missile' | 'free';
export interface Viewport { w: number; h: number }
export interface Point { x: number; y: number }

export interface Camera {
  centreX: number; centreY: number;
  zoom: number; targetZoom: number;
  follow: Follow;
  /** The zoom ease: the zoom it started from and the seconds since (≥ ZOOM_EASE_S when settled). */
  zoomFrom: number; zoomT: number;
  /** A wheel zoom in free mode keeps this world point under this screen point; null zooms about the screen centre. */
  anchor: { wx: number; wy: number; sx: number; sy: number } | null;
  /** The snap-back ease: where the centre was when C was pressed and the seconds since; null when not snapping. */
  snap: { fromX: number; fromY: number; t: number } | null;
}

export function createCamera(x = 0, y = 0, zoom = ZOOM_DEFAULT): Camera {
  const z = clampZoom(zoom);
  return { centreX: x, centreY: y, zoom: z, targetZoom: z, follow: 'ship', zoomFrom: z, zoomT: ZOOM_EASE_S, anchor: null, snap: null };
}

export function clampZoom(z: number): number { return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)); }

export function worldToScreen(cam: Camera, vp: Viewport, x: number, y: number): Point {
  return { x: vp.w / 2 + (x - cam.centreX) * cam.zoom, y: vp.h / 2 + (y - cam.centreY) * cam.zoom };
}

export function screenToWorld(cam: Camera, vp: Viewport, sx: number, sy: number): Point {
  return { x: cam.centreX + (sx - vp.w / 2) / cam.zoom, y: cam.centreY + (sy - vp.h / 2) / cam.zoom };
}

/** The world rectangle the viewport shows. */
export function visibleWorld(cam: Camera, vp: Viewport): { x0: number; y0: number; x1: number; y1: number } {
  const hw = vp.w / 2 / cam.zoom, hh = vp.h / 2 / cam.zoom;
  return { x0: cam.centreX - hw, y0: cam.centreY - hh, x1: cam.centreX + hw, y1: cam.centreY + hh };
}

/**
 * Step the target zoom by `notches` (positive zooms in) and start the 0.15 s ease. `at` is the cursor for a wheel zoom;
 * it anchors only in free mode, because a following camera stays centred on what it follows (plan decision 3).
 */
export function zoomBy(cam: Camera, vp: Viewport, notches: number, at: Point | null = null): void {
  if (notches === 0) return;
  const target = clampZoom(cam.targetZoom * Math.pow(ZOOM_STEP, notches));
  if (target === cam.targetZoom) return;
  cam.zoomFrom = cam.zoom; cam.zoomT = 0; cam.targetZoom = target;
  if (at && cam.follow === 'free') { const w = screenToWorld(cam, vp, at.x, at.y); cam.anchor = { wx: w.x, wy: w.y, sx: at.x, sy: at.y }; }
  else cam.anchor = null;
}

/** Drag by a screen-pixel delta: the world moves with the pointer, and the camera stops following. */
export function pan(cam: Camera, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  cam.follow = 'free'; cam.snap = null; cam.anchor = null;
  cam.centreX -= dx / cam.zoom; cam.centreY -= dy / cam.zoom;
}

/** C: ease back to `to` ('ship' by default) over 0.2 s and follow it again. */
export function snapBack(cam: Camera, to: Follow = 'ship'): void {
  cam.follow = to; cam.anchor = null;
  cam.snap = { fromX: cam.centreX, fromY: cam.centreY, t: 0 };
}

/** Switch what is followed without a pan (a followed missile ended): the same ease as a snap. */
export function followBody(cam: Camera, to: Follow): void {
  if (cam.follow !== to) snapBack(cam, to);
}

const smooth = (k: number): number => k * k * (3 - 2 * k);

/** One frame: ease the zoom (in log space) and the snap, then follow `followed` (the interpolated body) unless free. */
export function updateCamera(cam: Camera, vp: Viewport, dt: number, followed: Point | null): void {
  if (cam.zoom !== cam.targetZoom) {
    cam.zoomT += dt;
    const k = cam.zoomT >= ZOOM_EASE_S ? 1 : smooth(cam.zoomT / ZOOM_EASE_S);
    cam.zoom = k >= 1 ? cam.targetZoom : Math.exp(Math.log(cam.zoomFrom) + (Math.log(cam.targetZoom) - Math.log(cam.zoomFrom)) * k);
    if (cam.anchor) {
      const a = cam.anchor;
      cam.centreX = a.wx - (a.sx - vp.w / 2) / cam.zoom; cam.centreY = a.wy - (a.sy - vp.h / 2) / cam.zoom;
      if (k >= 1) cam.anchor = null;
    }
  }
  if (cam.follow === 'free' || !followed) return;
  if (cam.snap) {
    cam.snap.t += dt;
    const k = cam.snap.t >= SNAP_EASE_S ? 1 : smooth(cam.snap.t / SNAP_EASE_S);
    cam.centreX = cam.snap.fromX + (followed.x - cam.snap.fromX) * k;
    cam.centreY = cam.snap.fromY + (followed.y - cam.snap.fromY) * k;
    if (k >= 1) cam.snap = null;
    return;
  }
  cam.centreX = followed.x; cam.centreY = followed.y;
}
```

- [ ] **Step 4: Write the input**

Create `src/renderer/src/app/duel/input.ts`:

```ts
// Keyboard and mouse for the Helm demo views (H-1 spec §5). One keyboard drives the active character, or the one ship in
// the flight view. Pointer input feeds only the camera and never becomes a command (parent §10).
import type { Axes } from '../../sim/tactical/state';

/** Press-edge actions (spec §5 table). H-1a uses pause, camera and the zoom keys; H-1b adds the duel ones. */
export type KeyAction = 'interact' | 'prevLock' | 'fireDown' | 'fireUp' | 'launch' | 'stand' | 'switch' | 'pause' | 'camera' | 'zoomIn' | 'zoomOut' | 'confirm';

const PRESS_CODES: Readonly<Record<string, KeyAction>> = {
  KeyE: 'interact', KeyQ: 'prevLock', Space: 'fireDown', KeyF: 'launch', KeyX: 'stand', Tab: 'switch', Escape: 'pause', KeyC: 'camera',
  Equal: 'zoomIn', NumpadAdd: 'zoomIn', Minus: 'zoomOut', NumpadSubtract: 'zoomOut', Enter: 'confirm', NumpadEnter: 'confirm'
};
/** Keys whose browser default (focus moves, page scrolls, history back) must never happen in the duel views. */
const PREVENT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']);

export interface KeySample {
  /** WASD as the sector source gives it: x right, y down, normalised to length 1 on diagonals. */
  moveX: number; moveY: number;
  interactHeld: boolean; fireHeld: boolean;
  /** Press edges per action since the previous sample (auto-repeat does not count). */
  presses: Record<KeyAction, number>;
}

export function emptyPresses(): Record<KeyAction, number> {
  return { interact: 0, prevLock: 0, fireDown: 0, fireUp: 0, launch: 0, stand: 0, switch: 0, pause: 0, camera: 0, zoomIn: 0, zoomOut: 0, confirm: 0 };
}

/** The Helm's held axes from a key sample: A/D turn (D clockwise), W thrusts forward, S reverses (W gives moveY −1). */
export function helmAxes(k: Pick<KeySample, 'moveX' | 'moveY'>): Axes {
  return { turn: Math.sign(k.moveX) || 0, thrust: -Math.sign(k.moveY) || 0 };
}

/** The structural subset of a DOM event target the input needs, so tests can drive it with a fake. */
export interface EventSource {
  addEventListener(type: string, fn: (e: never) => void, opts?: unknown): void;
  removeEventListener(type: string, fn: (e: never) => void, opts?: unknown): void;
}
interface KeyEventLike { code: string; repeat: boolean; preventDefault(): void }

export interface DuelKeyboard { sample(): KeySample; clear(): void; destroy(): void }

/** Held keys are cleared on blur so nothing sticks after alt-tab; `clear` does the same for Tab and restart (spec §4, §5). */
export function createDuelKeyboard(target: EventSource): DuelKeyboard {
  const held = new Set<string>();
  let presses = emptyPresses();
  const down = (e: KeyEventLike): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    held.add(e.code);
    const action = PRESS_CODES[e.code];
    if (action && !e.repeat) presses[action]++;
  };
  const up = (e: KeyEventLike): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.code === 'Space' && held.has('Space')) presses.fireUp++;
    held.delete(e.code);
  };
  const clear = (): void => { held.clear(); presses = emptyPresses(); };
  target.addEventListener('keydown', down as (e: never) => void);
  target.addEventListener('keyup', up as (e: never) => void);
  target.addEventListener('blur', clear as (e: never) => void);
  return {
    sample(): KeySample {
      const x = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0), y = (held.has('KeyS') ? 1 : 0) - (held.has('KeyW') ? 1 : 0);
      const len = Math.sqrt(x * x + y * y) || 1;
      const out: KeySample = { moveX: x / len, moveY: y / len, interactHeld: held.has('KeyE'), fireHeld: held.has('Space'), presses };
      presses = emptyPresses();
      return out;
    },
    clear,
    destroy(): void {
      target.removeEventListener('keydown', down as (e: never) => void);
      target.removeEventListener('keyup', up as (e: never) => void);
      target.removeEventListener('blur', clear as (e: never) => void);
    }
  };
}

export interface PointerSample {
  /** Last pointer position in internal pixels (the 1280×720 canvas), or null before the pointer has moved over it. */
  x: number | null; y: number | null;
  /** Wheel deltaY summed since the previous sample (positive scrolls down, which zooms out). */
  wheel: number;
  /** Right- or middle-button drag in internal pixels since the previous sample. */
  dragX: number; dragY: number;
}
interface PointerEventLike { clientX: number; clientY: number; button: number; buttons: number; pointerId?: number; preventDefault(): void }
interface WheelEventLike { clientX: number; clientY: number; deltaY: number; deltaMode: number; preventDefault(): void }

export interface PointerSource { sample(): PointerSample; clear(): void; destroy(): void }

/** Wheel notches from a summed deltaY: one notch per 100 px (a mouse wheel click), at least one for any scroll. */
export function wheelNotches(deltaY: number): number {
  if (deltaY === 0) return 0;
  return -Math.sign(deltaY) * Math.max(1, Math.round(Math.abs(deltaY) / 100));
}

/** `toInternal` maps a client position to internal pixels (the letterbox inverse). Buttons 2 (right) and 1 (middle) drag. */
export function createPointerSource(target: EventSource, toInternal: (clientX: number, clientY: number) => { x: number; y: number }): PointerSource {
  let x: number | null = null, y: number | null = null, wheel = 0, dragX = 0, dragY = 0, dragging = false;
  const DRAG_BUTTONS = 2 | 4;   // `buttons` bits: 2 right, 4 middle
  const move = (e: PointerEventLike): void => {
    const p = toInternal(e.clientX, e.clientY);
    if (dragging && (e.buttons & DRAG_BUTTONS) !== 0 && x !== null && y !== null) { dragX += p.x - x; dragY += p.y - y; }
    else if ((e.buttons & DRAG_BUTTONS) === 0) dragging = false;
    x = p.x; y = p.y;
  };
  const downFn = (e: PointerEventLike): void => {
    const p = toInternal(e.clientX, e.clientY); x = p.x; y = p.y;
    if (e.button === 1 || e.button === 2) { dragging = true; e.preventDefault(); }
  };
  const upFn = (e: PointerEventLike): void => { if ((e.buttons & DRAG_BUTTONS) === 0) dragging = false; };
  const wheelFn = (e: WheelEventLike): void => {
    const p = toInternal(e.clientX, e.clientY); x = p.x; y = p.y;
    wheel += e.deltaMode === 1 ? e.deltaY * 100 / 3 : e.deltaY;   // line mode: three lines a notch
    e.preventDefault();
  };
  const menu = (e: { preventDefault(): void }): void => { e.preventDefault(); };
  const clear = (): void => { wheel = 0; dragX = 0; dragY = 0; dragging = false; };
  const on: [string, (e: never) => void][] = [
    ['pointermove', move as (e: never) => void], ['pointerdown', downFn as (e: never) => void], ['pointerup', upFn as (e: never) => void],
    ['wheel', wheelFn as (e: never) => void], ['contextmenu', menu as (e: never) => void]
  ];
  for (const [type, fn] of on) target.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);
  return {
    sample(): PointerSample {
      const out = { x, y, wheel, dragX, dragY };
      wheel = 0; dragX = 0; dragY = 0;
      return out;
    },
    clear,
    destroy(): void { for (const [type, fn] of on) target.removeEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined); }
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/tacticalCamera.test.ts tests/duelInput.test.ts`
Expected: PASS (11 camera tests, 8 input tests).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/tactical/camera.ts src/renderer/src/app/duel/input.ts tests/tacticalCamera.test.ts tests/duelInput.test.ts
git commit -m "feat(helm): the console camera and the duel keyboard and pointer input (Helm H-1a)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 3: The map-view model and the feel model

**Files:**
- Create: `src/renderer/src/render/tactical/tacticalModel.ts`, `src/renderer/src/render/tactical/feelModel.ts`
- Create: `tests/tacticalModel.test.ts`

**Interfaces:**
- Consumes: Task 1's `stepSoloFlight` (in the test); Task 2's camera (`worldToScreen`, `visibleWorld`, `Camera`, `Follow`, `Point`, `Viewport`); `gravityAccel`, `predictPath`, `hx`, `hy`, `TacticalState`, `Ship`, `Circle`.
- Produces (`render/tactical/tacticalModel.ts`):
  - Constants: `GRID_EXTENT` (3000), `GRID_MAJOR`, `GRID_MINOR`, `GRID_MINOR_ZOOM`, `CONTOUR_ACCELS`, `ASTEROID_DOT_PX`, `DOT_MIN_PX`, `SHIP_CHEVRON_PX`, `CHEVRON_SIZE`, `PATH_*`, `BEARING_RING_ZOOM`, `BEARING_RING_PX`, `ARROW_MARGIN`, `SCALE_BAR_MAX_PX`, `STAR_PARALLAX` (0.02).
  - `interface PrevBody { x; y; h }`, where `h` is `heading + headingAcc`.
  - `interface TacticalModelInput { state; prev; alpha; camera; viewport; console: 'helm' | 'weapons'; axes; ships: readonly number[]; paused; reserveRight }`.
  - `interface TacticalDraw { grid; contours; edge; planet; asteroids; ships; helm; arrows; overlay; stars: Point }`, and the item types `GridDraw`, `CircleDraw`, `AsteroidDraw`, `ShipDraw`, `RingDraw`, `HelmDraw`, `ArrowDraw`, `ArrowTarget`, `OverlayDraw`, `Line`, `Label`.
  - `tacticalModel(input: TacticalModelInput): TacticalDraw`.
  - `contourRadius(accel): number`; `headingAngle(h): number`; `interpolatedShip(state, prev, alpha, i): PrevBody`.
  - `followTarget(state, prev, alpha, follow, own = 0): Point | null`.
  - `starOffset(centreX, centreY, vp): Point`: −centre × `STAR_PARALLAX`, wrapped into 0..w × 0..h.
  - `columnName(k): string`; `pathSeconds(zoom): number`; `ringCrossesRect(x, y, r, w, h): boolean`.
  - `wedgeSegments(): { room; poly: number[] }[]`; `asteroidShape(index): number[]`.
- Produces (`render/tactical/feelModel.ts`):
  - `FEEL_WINDOW_TICKS` (600).
  - `interface FeelTracker`; `interface FeelReadout { speed; skid; turnRate; gravity; planet; minPlanet }`.
  - `createFeelTracker()`; `resetFeel(t)`; `recordFeel(t, ship, planet)`; `feelReadout(t, ship, planet): FeelReadout`; `feelRows(r): [string, string][]`.

- [ ] **Step 1: Write the failing test**

Create `tests/tacticalModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCamera, pan, type Camera } from '../src/renderer/src/render/tactical/camera';
import { createFeelTracker, feelReadout, feelRows, FEEL_WINDOW_TICKS, recordFeel } from '../src/renderer/src/render/tactical/feelModel';
import {
  asteroidShape, BEARING_RING_PX, STAR_PARALLAX, starOffset, columnName, contourRadius, GRID_EXTENT, interpolatedShip, pathSeconds, ringCrossesRect,
  tacticalModel, wedgeSegments, type PrevBody, type TacticalModelInput
} from '../src/renderer/src/render/tactical/tacticalModel';
import { gravityAccel, stepSoloFlight } from '../src/renderer/src/sim/tactical/physics';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';

const vp = { w: 1280, h: 720 };
const prevOf = (st: TacticalState): PrevBody[] => st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
function input(st: TacticalState, cam: Camera, over: Partial<TacticalModelInput> = {}): TacticalModelInput {
  return { state: st, prev: prevOf(st), alpha: 1, camera: cam, viewport: vp, console: 'helm', axes: { turn: 0, thrust: 0 }, ships: [0], paused: false, reserveRight: 0, ...over };
}
const pull = (r: number) => Math.hypot(...gravityAccel(r, 0));

describe('gravity contours (H-1 spec §7 item 3)', () => {
  it('inverts gravityAccel: the pull at each radius is the contour value', () => {
    for (const a of [40, 10, 3]) expect(pull(contourRadius(a))).toBeCloseTo(a, 6);
    expect(contourRadius(40)).toBeLessThan(contourRadius(10));
  });
  it('a ring is drawn only when it crosses the screen', () => {
    expect(ringCrossesRect(640, 360, 100, 1280, 720)).toBe(true);
    expect(ringCrossesRect(640, 360, 2000, 1280, 720)).toBe(false);    // encloses the screen
    expect(ringCrossesRect(-500, 360, 100, 1280, 720)).toBe(false);    // wholly off to the left
    const st = createTacticalState(4), cam = createCamera(0, 0, 0.12);
    expect(tacticalModel(input(st, cam)).contours.map((c) => c.accel)).toEqual([40, 10, 3]);
    const far = createCamera(2400, 0, 1.2);
    expect(tacticalModel(input(st, far)).contours).toEqual([]);
  });
});

describe('the lettered grid (H-1 spec §7 item 2)', () => {
  it('names columns A.. from the west and rows 1.. from the north, 500-unit squares', () => {
    expect(columnName(0)).toBe('A'); expect(columnName(11)).toBe('L'); expect(columnName(26)).toBe('AA');
    const st = createTacticalState(4), cam = createCamera(0, 0, 0.12);
    const g = tacticalModel(input(st, cam)).grid;
    expect(g.spacing).toBe(500);
    expect(g.columns.map((c) => c.text)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
    expect(g.rows.map((r) => r.text)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
    expect(g.lines.length).toBe(2 * (2 * GRID_EXTENT / 500 + 1));
  });
  it('labels sit on the visible top and left edges and name the square under them', () => {
    const st = createTacticalState(4), cam = createCamera(-2750, -2750, 1.0);   // the north-west corner: square A1
    const g = tacticalModel(input(st, cam)).grid;
    expect(g.columns[0]!.text).toBe('A'); expect(g.rows[0]!.text).toBe('1');
    for (const c of g.columns) { expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThanOrEqual(1280); }
    expect(g.columns[0]!.y).toBeGreaterThan(4);   // the grid's top edge is on screen, so the labels sit just under it
  });
  it('switches to 250-unit lines past zoom 0.6 and culls lines off screen', () => {
    const st = createTacticalState(4), cam = createCamera(0, 0, 1.2);
    const g = tacticalModel(input(st, cam)).grid;
    expect(g.spacing).toBe(250);
    expect(g.lines.every((l) => l.x1 >= 0 && l.x1 <= 1280 && l.y1 >= 0 && l.y1 <= 720 || l.y1 === l.y2 && l.y1 >= 0 && l.y1 <= 720)).toBe(true);
    expect(g.lines.some((l) => !l.major)).toBe(true);
    expect(g.columns.map((c) => c.text)).toEqual(['E', 'F', 'G', 'H']);   // ±533 units: F and G whole, 33-unit slivers of E and H (40 px)
  });
});

describe('bodies and ships (H-1 spec §7 items 4 to 6)', () => {
  it('culls asteroids off screen, dots below 2 px, skips none above 0.5 px', () => {
    const st = createTacticalState(4);
    const wide = tacticalModel(input(st, createCamera(0, 0, 0.12)));
    expect(wide.asteroids.length).toBe(st.map.asteroids.length);   // every radius ≥ 15 is ≥ 1.8 px at 0.12
    expect(wide.asteroids.filter((a) => a.dot).every((a) => a.r < 2)).toBe(true);
    expect(wide.asteroids.some((a) => a.dot)).toBe(true);
    const close = tacticalModel(input(st, createCamera(0, 0, 1.2)));
    expect(close.asteroids.length).toBe(0);   // the belt is 1100+ out; the screen shows ±533
    expect(close.planet).toEqual({ x: 640, y: 360, r: 70 * 1.2 });
    expect(wide.edge!.r).toBeCloseTo(2800 * 0.12, 9);
  });
  it('a ship is a silhouette at 10 px across and up, a chevron below', () => {
    const st = createTacticalState(4), s = st.ships[0];
    const at = (z: number) => tacticalModel(input(st, createCamera(s.x, s.y, z))).ships[0]!;
    expect(at(0.25).chevron).toBe(false);   // 40 units × 0.25 = 10 px
    expect(at(0.24).chevron).toBe(true);
    expect(at(0.5)).toMatchObject({ index: 0, x: 640, y: 360, crew: true, scale: 0.5, shields: 2 });
  });
  it('the flight view draws only ship 0', () => {
    const st = createTacticalState(4), cam = createCamera(0, 0, 0.12);
    expect(tacticalModel(input(st, cam)).ships.map((s) => s.index)).toEqual([0]);
    expect(tacticalModel(input(st, cam, { ships: [0, 1] })).ships.map((s) => s.index)).toEqual([0, 1]);
  });
  it('interpolates position by alpha and heading the short way round', () => {
    const st = createTacticalState(4), s = st.ships[0];
    Object.assign(s, { x: 100, y: 0, heading: 1, headingAcc: 0 });
    const prev = [{ x: 0, y: 0, h: 255 }, { x: 0, y: 0, h: 0 }];
    const b = interpolatedShip(st, prev, 0.5, 0);
    expect(b.x).toBe(50); expect(b.h).toBe(256);
  });
});

describe('the Helm layer (H-1 spec §7 item 7)', () => {
  it('predicts 2 s at zoom 0.6 and up, rising to 8 s at 0.12, a point every 4 ticks', () => {
    expect(pathSeconds(1.2)).toBe(2); expect(pathSeconds(0.6)).toBe(2); expect(pathSeconds(0.12)).toBe(8);
    expect(pathSeconds(0.36)).toBeCloseTo(5, 12);
    const st = createTacticalState(4), s = st.ships[0];
    const near = tacticalModel(input(st, createCamera(s.x, s.y, 1.0))).helm!;
    const far = tacticalModel(input(st, createCamera(s.x, s.y, 0.12))).helm!;
    expect(near.path.length).toBe(30);    // 120 ticks / 4
    expect(far.path.length).toBe(120);    // 480 ticks / 4
  });
  it('the path follows the current axes and ends at a solid contact', () => {
    const st = createTacticalState(4), s = st.ships[0];
    Object.assign(s, { x: 0, y: -400, vx: 0, vy: 0, heading: 128 });   // nose south, at the planet
    const cam = createCamera(0, -400, 0.12);
    const coast = tacticalModel(input(st, cam)).helm!.path, burn = tacticalModel(input(st, cam, { axes: { turn: 0, thrust: 1 } })).helm!;
    expect(burn.path.length).toBeLessThan(coast.length);
    expect(burn.thrust).toBe(1); expect(burn.turn).toBe(0);
  });
  it('draws the bearing ring at zoom 0.3 and up: 36 ticks, labels every 30 degrees, north up', () => {
    const st = createTacticalState(4), s = st.ships[0];
    const ring = tacticalModel(input(st, createCamera(s.x, s.y, 0.3))).helm!.ring!;
    expect(ring.ticks.length).toBe(36);
    expect(ring.labels.map((l) => l.text)).toEqual(['0', '30', '60', '90', '120', '150', '180', '210', '240', '270', '300', '330']);
    expect(ring.labels[0]!.x).toBeCloseTo(640, 9); expect(ring.labels[0]!.y).toBeLessThan(360 - BEARING_RING_PX);
    expect(ring.labels[3]!.x).toBeGreaterThan(640 + BEARING_RING_PX);   // 90 is east
    expect(tacticalModel(input(st, createCamera(s.x, s.y, 0.29))).helm!.ring).toBeNull();
  });
  it('the weapons console has no Helm layer', () => {
    const st = createTacticalState(4);
    expect(tacticalModel(input(st, createCamera(0, 0), { console: 'weapons' })).helm).toBeNull();
  });
});

describe('the overlay (H-1 spec §7 item 9)', () => {
  it('points off-screen arrows at the own ship and the planet, with distances, clear of the readout', () => {
    const st = createTacticalState(4), s = st.ships[0];
    Object.assign(s, { x: 1500, y: 0 });
    const cam = createCamera(0, 0, 1.0); pan(cam, 0, 1);   // free, about at the planet
    const view = tacticalModel(input(st, cam, { reserveRight: 230 }));
    const ship = view.arrows.find((a) => a.target === 'ship')!;
    expect(ship.x).toBeCloseTo(1280 - 230 - 28, 9); expect(ship.angle).toBeCloseTo(Math.PI / 2, 2);
    expect(ship.label).toMatch(/^SHIP 150\d$/);
    expect(view.arrows.find((a) => a.target === 'planet')).toBeUndefined();   // on screen
    expect(view.overlay.snapHint).toBe(true);
    const followed = tacticalModel(input(st, createCamera(1500, 0, 1.0)));
    expect(followed.arrows.map((a) => [a.target, a.distance])).toEqual([['planet', 1500]]);
    expect(followed.overlay.snapHint).toBe(false);
  });
  it('shows the zoom and a scale bar no wider than 160 px', () => {
    const st = createTacticalState(4);
    const o = tacticalModel(input(st, createCamera(0, 0, 0.5))).overlay;
    expect(o.zoomText).toBe('ZOOM 0.50');
    expect(o.scaleBar).toEqual({ px: 125, units: 250 });
    expect(tacticalModel(input(st, createCamera(0, 0, 0.12))).overlay.scaleBar.units).toBe(1000);
  });
});

describe('the parallax star field (parent §10b layer 1)', () => {
  it('moves the stars against the camera at STAR_PARALLAX px per unit, at any zoom, wrapped into one tile', () => {
    expect(STAR_PARALLAX).toBe(0.02);
    expect(starOffset(0, 0, vp)).toEqual({ x: 0, y: 0 });
    expect(starOffset(1000, 0, vp)).toEqual({ x: 1280 - 20, y: 0 });       // the camera moves east 1000: the stars 20 px west
    expect(starOffset(0, -2000, vp)).toEqual({ x: 0, y: 40 });             // north 2000: 40 px down
    expect(starOffset(-64000 - 500, 0, vp).x).toBeCloseTo(10, 9);          // 1290 px wraps to 10
    const st = createTacticalState(4), cam = createCamera(0, 0, 0.5);
    const a = tacticalModel(input(st, cam)).stars;
    pan(cam, -100, 0);                                                     // drag 100 px left: the centre moves 200 units east
    const b = tacticalModel(input(st, cam)).stars;
    expect(a).toEqual({ x: 0, y: 0 }); expect(b.x).toBeCloseTo(1280 - 4, 9); expect(b.y).toBe(0);
    const zoomed = tacticalModel(input(st, createCamera(200, 0, 1.2))).stars;
    expect(zoomed.x).toBeCloseTo(b.x, 9);                                  // independent of zoom
  });
});

describe('shapes', () => {
  it('the wedge has three room segments and asteroids have stable outlines', () => {
    expect(wedgeSegments().map((w) => w.room)).toEqual([0, 1, 2]);
    expect(asteroidShape(5)).toBe(asteroidShape(5));
    expect(asteroidShape(5)).not.toEqual(asteroidShape(6));
    expect(asteroidShape(9).every((k) => k >= 0.72 && k <= 1.08)).toBe(true);
  });
});

describe('the feel panel (H-1 spec §9)', () => {
  it('reads speed, skid, turn rate, gravity and the planet distance', () => {
    const st = createTacticalState(4), s = st.ships[0], t = createFeelTracker();
    Object.assign(s, { x: 0, y: -1000, vx: 30, vy: -40, heading: 0, headingAcc: 0 });   // nose north: 30 u/s to the right is skid
    recordFeel(t, s, st.map.planet);
    const r = feelReadout(t, s, st.map.planet);
    expect(r.speed).toBeCloseTo(50, 9); expect(r.skid).toBeCloseTo(30, 9);
    expect(r.gravity).toBeCloseTo(pull(1000), 9); expect(r.planet).toBeCloseTo(1000, 9);
    expect(feelRows(r).map(([k]) => k)).toEqual(['SPEED', 'SKID', 'TURN', 'GRAVITY', 'PLANET r', 'MIN r 10s']);
  });
  it('a full turn reads 150 deg/s', () => {
    const st = createTacticalState(4), t = createFeelTracker();
    for (let k = 0; k < 30; k++) { stepSoloFlight(st, { turn: 1, thrust: 0 }); recordFeel(t, st.ships[0], st.map.planet); }
    expect(feelReadout(t, st.ships[0], st.map.planet).turnRate).toBeCloseTo(150, 6);
  });
  it('keeps the least planet distance over the last 10 s only', () => {
    const st = createTacticalState(4), s = st.ships[0], t = createFeelTracker();
    s.x = 0; s.y = -200; recordFeel(t, s, st.map.planet);
    s.y = -900;
    for (let k = 1; k < FEEL_WINDOW_TICKS; k++) recordFeel(t, s, st.map.planet);
    expect(feelReadout(t, s, st.map.planet).minPlanet).toBeCloseTo(200, 9);
    recordFeel(t, s, st.map.planet);   // the 200 sample falls out of the window
    expect(feelReadout(t, s, st.map.planet).minPlanet).toBeCloseTo(900, 9);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tacticalModel.test.ts`
Expected: FAIL, "Error: Cannot find module '../src/renderer/src/render/tactical/feelModel'" (the first import not yet written).

- [ ] **Step 3: Write the map-view model**

Create `src/renderer/src/render/tactical/tacticalModel.ts`:

```ts
// The console map view model (H-1 spec §7, parent §10b). Pure: turns the tactical state, the previous tick's positions,
// the interpolation alpha, the console's camera and the current Helm axes into screen-space draw lists. The Pixi layer
// (tacticalLayer.ts) only draws what this returns. Render code, so it may use any Math (not under the determinism guard).
import { gravityAccel } from '../../sim/tactical/physics';
import { predictPath } from '../../sim/tactical/predict';
import type { Axes, TacticalState } from '../../sim/tactical/state';
import { HEADING_COUNT, R_MAP, SHIP_RADIUS } from '../../sim/tactical/tuning';
import { visibleWorld, worldToScreen, type Camera, type Follow, type Point, type Viewport } from './camera';

/** The grid square's half-size: the smallest multiple of 500 that encloses the map circle (plan decision 4). */
export const GRID_EXTENT = Math.ceil(R_MAP / 500) * 500;
export const GRID_MAJOR = 500, GRID_MINOR = 250, GRID_MINOR_ZOOM = 0.6;
/** Gravity contours (u/s²), strongest first. */
export const CONTOUR_ACCELS: readonly number[] = [40, 10, 3];
/** Below this on-screen radius an asteroid is a dot; below DOT_MIN_PX it is skipped. */
export const ASTEROID_DOT_PX = 2, DOT_MIN_PX = 0.5;
/** Below this many pixels across, a ship is a fixed-size chevron. */
export const SHIP_CHEVRON_PX = 10, CHEVRON_SIZE = 14;
/** The Helm's predicted path: 2 s at zoom ≥ 0.6, rising linearly to 8 s at zoom 0.12, a point every 4 ticks. */
export const PATH_NEAR_S = 2, PATH_FAR_S = 8, PATH_NEAR_ZOOM = 0.6, PATH_FAR_ZOOM = 0.12, PATH_STRIDE = 4;
export const BEARING_RING_ZOOM = 0.3, BEARING_RING_PX = 120;
export const ARROW_MARGIN = 28;
const SCALE_STEPS: readonly number[] = [50, 100, 200, 250, 500, 1000, 2000];
export const SCALE_BAR_MAX_PX = 160;
/** The star field's parallax (parent §10b layer 1): screen pixels the stars move per world unit the camera centre moves,
 *  at every zoom (plan decision 8). The ship at 800 u/s drifts the stars by 16 px/s. */
export const STAR_PARALLAX = 0.02;

export interface PrevBody { x: number; y: number; h: number }
export interface Line { x1: number; y1: number; x2: number; y2: number }
export interface Label { text: string; x: number; y: number }
export interface GridDraw { spacing: number; lines: (Line & { major: boolean })[]; columns: Label[]; rows: Label[] }
export interface CircleDraw { x: number; y: number; r: number }
export interface AsteroidDraw extends CircleDraw { index: number; dot: boolean }
export interface ShipDraw {
  index: number; x: number; y: number;
  /** Radians clockwise from north (the screen's up). */
  angle: number;
  /** Screen pixels per world unit (the zoom) for the silhouette. */
  scale: number;
  chevron: boolean; crew: boolean;
  rooms: readonly number[]; shields: number;
}
export interface RingDraw { x: number; y: number; r: number; ticks: (Line & { major: boolean })[]; labels: Label[] }
export interface HelmDraw { path: Point[]; origin: Point; velocity: Point; headingFrom: Point; headingTo: Point; thrust: number; turn: number; ring: RingDraw | null }
export type ArrowTarget = 'ship' | 'enemy' | 'planet' | 'missile';
export interface ArrowDraw { target: ArrowTarget; x: number; y: number; angle: number; distance: number; label: string }
export interface OverlayDraw { zoomText: string; scaleBar: { px: number; units: number }; snapHint: boolean; paused: boolean }
export interface TacticalDraw {
  grid: GridDraw;
  contours: (CircleDraw & { accel: number })[];
  edge: CircleDraw | null;
  planet: CircleDraw | null;
  asteroids: AsteroidDraw[];
  ships: ShipDraw[];
  helm: HelmDraw | null;
  arrows: ArrowDraw[];
  overlay: OverlayDraw;
  /** The star field's offset within one screen-sized tile, 0..w × 0..h (see starOffset). */
  stars: Point;
}

export interface TacticalModelInput {
  state: TacticalState;
  /** Each ship's position and continuous heading (heading + headingAcc) at the previous tick. */
  prev: readonly PrevBody[];
  alpha: number;
  camera: Camera;
  viewport: Viewport;
  console: 'helm' | 'weapons';
  /** The Helm's effective axes the runtime last sent to the sim. */
  axes: Axes;
  /** Ships to draw (the flight view draws only ship 0). The crew ship is index 0. */
  ships: readonly number[];
  paused: boolean;
  /** Screen pixels on the right kept clear of off-screen arrows (the readout panel). */
  reserveRight: number;
}

/** Radius at which the planet's pull is `accel`, by bisection on the falling side of gravityAccel (startup only). */
export function contourRadius(accel: number): number {
  const pull = (r: number): number => { const [gx, gy] = gravityAccel(r, 0); return Math.sqrt(gx * gx + gy * gy); };
  let lo = 20, hi = R_MAP;   // the pull peaks near ε/√2 ≈ 14 and falls from there
  if (pull(hi) >= accel) return hi;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (pull(mid) > accel) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
const CONTOUR_RADII = CONTOUR_ACCELS.map(contourRadius);

/** The star tile's offset for a camera centre: −centre × STAR_PARALLAX, wrapped into 0..w × 0..h. */
export function starOffset(centreX: number, centreY: number, vp: Viewport): Point {
  const wrap = (v: number, n: number): number => ((v % n) + n) % n;
  return { x: wrap(-centreX * STAR_PARALLAX, vp.w), y: wrap(-centreY * STAR_PARALLAX, vp.h) };
}

/** A heading in steps (any real) to radians clockwise from north. */
export function headingAngle(h: number): number { return (h / HEADING_COUNT) * Math.PI * 2; }

/** Ship i at render time: the previous tick's position and heading toward the current one by alpha (heading the short way). */
export function interpolatedShip(state: TacticalState, prev: readonly PrevBody[], alpha: number, i: number): PrevBody {
  const s = state.ships[i]!, p = prev[i], a = Math.min(1, Math.max(0, alpha)), h1 = s.heading + s.headingAcc;
  if (!p) return { x: s.x, y: s.y, h: h1 };
  let dh = h1 - p.h;
  dh -= Math.round(dh / HEADING_COUNT) * HEADING_COUNT;
  return { x: p.x + (s.x - p.x) * a, y: p.y + (s.y - p.y) * a, h: p.h + dh * a };
}

/** The followed body's interpolated world position, or null when there is none (the camera then holds still). */
export function followTarget(state: TacticalState, prev: readonly PrevBody[], alpha: number, follow: Follow, own = 0): Point | null {
  if (follow === 'free') return null;
  if (follow === 'missile') { const m = state.missiles[own]; return m ? { x: m.x, y: m.y } : null; }
  const s = interpolatedShip(state, prev, alpha, own);
  return { x: s.x, y: s.y };
}

/** A column letter for a 0-based column (A..Z, then AA...). */
export function columnName(k: number): string {
  let n = k, out = '';
  do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return out;
}

/** Seconds of predicted path at this zoom. */
export function pathSeconds(zoom: number): number {
  if (zoom >= PATH_NEAR_ZOOM) return PATH_NEAR_S;
  const k = (PATH_NEAR_ZOOM - Math.max(PATH_FAR_ZOOM, zoom)) / (PATH_NEAR_ZOOM - PATH_FAR_ZOOM);
  return PATH_NEAR_S + (PATH_FAR_S - PATH_NEAR_S) * k;
}

/** True when a ring of radius r about (x, y) crosses the rectangle 0..w × 0..h (not wholly outside, not enclosing it). */
export function ringCrossesRect(x: number, y: number, r: number, w: number, h: number): boolean {
  const nx = Math.min(w, Math.max(0, x)), ny = Math.min(h, Math.max(0, y));
  if ((nx - x) ** 2 + (ny - y) ** 2 > r * r) return false;
  const fx = Math.max(Math.abs(x), Math.abs(w - x)), fy = Math.max(Math.abs(y), Math.abs(h - y));
  return fx * fx + fy * fy >= r * r;
}

function gridDraw(cam: Camera, vp: Viewport): GridDraw {
  const spacing = cam.zoom > GRID_MINOR_ZOOM ? GRID_MINOR : GRID_MAJOR;
  const v = visibleWorld(cam, vp), E = GRID_EXTENT;
  const x0 = Math.max(-E, v.x0), x1 = Math.min(E, v.x1), y0 = Math.max(-E, v.y0), y1 = Math.min(E, v.y1);
  const lines: GridDraw['lines'] = [], columns: Label[] = [], rows: Label[] = [];
  if (x0 > x1 || y0 > y1) return { spacing, lines, columns, rows };
  const sy0 = worldToScreen(cam, vp, 0, y0).y, sy1 = worldToScreen(cam, vp, 0, y1).y;
  const sx0 = worldToScreen(cam, vp, x0, 0).x, sx1 = worldToScreen(cam, vp, x1, 0).x;
  for (let k = Math.ceil((x0 + E) / spacing); -E + k * spacing <= x1; k++) {
    const wx = -E + k * spacing, sx = worldToScreen(cam, vp, wx, 0).x;
    lines.push({ x1: sx, y1: sy0, x2: sx, y2: sy1, major: (wx + E) % GRID_MAJOR === 0 });
  }
  for (let k = Math.ceil((y0 + E) / spacing); -E + k * spacing <= y1; k++) {
    const wy = -E + k * spacing, sy = worldToScreen(cam, vp, 0, wy).y;
    lines.push({ x1: sx0, y1: sy, x2: sx1, y2: sy, major: (wy + E) % GRID_MAJOR === 0 });
  }
  // Labels name the 500-unit squares at every zoom, so a square keeps its name (plan decision 4); each sits in the middle
  // of the square's visible part, along the top and left edges of the screen (or of the grid, when that edge is on screen).
  const n = (2 * E) / GRID_MAJOR, top = Math.max(4, sy0 + 4), left = Math.max(4, sx0 + 4);
  for (let k = 0; k < n; k++) {
    const a = Math.max(x0, -E + k * GRID_MAJOR), b = Math.min(x1, -E + (k + 1) * GRID_MAJOR);
    if (b <= a || (b - a) * cam.zoom < 24) continue;
    columns.push({ text: columnName(k), x: worldToScreen(cam, vp, (a + b) / 2, 0).x, y: top });
  }
  for (let k = 0; k < n; k++) {
    const a = Math.max(y0, -E + k * GRID_MAJOR), b = Math.min(y1, -E + (k + 1) * GRID_MAJOR);
    if (b <= a || (b - a) * cam.zoom < 24) continue;
    rows.push({ text: String(k + 1), x: left, y: worldToScreen(cam, vp, 0, (a + b) / 2).y });
  }
  return { spacing, lines, columns, rows };
}

function ringDraw(x: number, y: number): RingDraw {
  const r = BEARING_RING_PX, ticks: RingDraw['ticks'] = [], labels: Label[] = [];
  for (let deg = 0; deg < 360; deg += 10) {
    const a = (deg * Math.PI) / 180, sx = Math.sin(a), sy = -Math.cos(a), major = deg % 30 === 0, len = major ? 10 : 5;
    ticks.push({ x1: x + sx * r, y1: y + sy * r, x2: x + sx * (r + len), y2: y + sy * (r + len), major });
    if (major) labels.push({ text: String(deg), x: x + sx * (r + 22), y: y + sy * (r + 22) });
  }
  return { x, y, r, ticks, labels };
}

/** Where the ray from the screen centre toward (x, y) leaves the inset rectangle, or null when (x, y) is inside it. */
function edgePoint(vp: Viewport, reserveRight: number, x: number, y: number): { x: number; y: number; angle: number } | null {
  const m = ARROW_MARGIN, l = m, t = m, r = vp.w - reserveRight - m, b = vp.h - m;
  if (x >= l && x <= r && y >= t && y <= b) return null;
  const cx = (l + r) / 2, cy = (t + b) / 2, dx = x - cx, dy = y - cy;
  const k = Math.min(dx > 0 ? (r - cx) / dx : dx < 0 ? (l - cx) / dx : Infinity, dy > 0 ? (b - cy) / dy : dy < 0 ? (t - cy) / dy : Infinity);
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dx, -dy) };
}

const ARROW_NAMES: Readonly<Record<ArrowTarget, string>> = { ship: 'SHIP', enemy: 'ENEMY', planet: 'PLANET', missile: 'MISSILE' };

export function tacticalModel(input: TacticalModelInput): TacticalDraw {
  const { state, prev, alpha, camera: cam, viewport: vp } = input;
  const v = visibleWorld(cam, vp), z = cam.zoom, map = state.map;
  const toS = (x: number, y: number): Point => worldToScreen(cam, vp, x, y);
  const onScreen = (x: number, y: number, r: number): boolean => x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1;

  const contours: TacticalDraw['contours'] = [];
  const pc = toS(map.planet.x, map.planet.y);
  CONTOUR_ACCELS.forEach((accel, k) => {
    const r = CONTOUR_RADII[k]! * z;
    if (ringCrossesRect(pc.x, pc.y, r, vp.w, vp.h)) contours.push({ accel, x: pc.x, y: pc.y, r });
  });
  const edge = ringCrossesRect(pc.x, pc.y, map.rMap * z, vp.w, vp.h) ? { x: pc.x, y: pc.y, r: map.rMap * z } : null;
  const planet = onScreen(map.planet.x, map.planet.y, map.planet.r) ? { x: pc.x, y: pc.y, r: map.planet.r * z } : null;

  const asteroids: AsteroidDraw[] = [];
  map.asteroids.forEach((a, index) => {
    const r = a.r * z;
    if (r < DOT_MIN_PX || !onScreen(a.x, a.y, a.r)) return;
    const p = toS(a.x, a.y);
    asteroids.push({ index, x: p.x, y: p.y, r, dot: r < ASTEROID_DOT_PX });
  });

  const ships: ShipDraw[] = [];
  for (const i of input.ships) {
    const b = interpolatedShip(state, prev, alpha, i), s = state.ships[i]!;
    if (!onScreen(b.x, b.y, SHIP_RADIUS * 2)) continue;
    const p = toS(b.x, b.y);
    ships.push({ index: i, x: p.x, y: p.y, angle: headingAngle(b.h), scale: z, chevron: 2 * SHIP_RADIUS * z < SHIP_CHEVRON_PX, crew: i === 0, rooms: s.rooms, shields: s.shields });
  }

  const own = interpolatedShip(state, prev, alpha, 0), ownS = toS(own.x, own.y);
  let helm: HelmDraw | null = null;
  if (input.console === 'helm' && input.ships.includes(0)) {
    const s = state.ships[0];
    const path = predictPath(state, 0, input.axes, Math.round(pathSeconds(z) * 60), PATH_STRIDE).map((q) => toS(q.x, q.y));
    const a = headingAngle(own.h), hxs = Math.sin(a), hys = -Math.cos(a), nose = SHIP_RADIUS * 1.3 * z + 4;
    helm = {
      path, origin: ownS,
      velocity: { x: ownS.x + s.vx * z, y: ownS.y + s.vy * z },   // where the ship would be in 1 s at this speed
      headingFrom: { x: ownS.x + hxs * nose, y: ownS.y + hys * nose }, headingTo: { x: ownS.x + hxs * (nose + 40), y: ownS.y + hys * (nose + 40) },
      thrust: Math.sign(input.axes.thrust) || 0, turn: Math.sign(input.axes.turn) || 0,
      ring: z >= BEARING_RING_ZOOM ? ringDraw(ownS.x, ownS.y) : null
    };
  }

  // Off-screen arrows: the own ship (distance from the camera centre), and the others (distance from the own ship).
  const arrows: ArrowDraw[] = [];
  const arrow = (target: ArrowTarget, wx: number, wy: number, fromX: number, fromY: number): void => {
    const p = toS(wx, wy), e = edgePoint(vp, input.reserveRight, p.x, p.y);
    if (!e) return;
    const distance = Math.round(Math.sqrt((wx - fromX) ** 2 + (wy - fromY) ** 2));
    arrows.push({ target, x: e.x, y: e.y, angle: e.angle, distance, label: `${ARROW_NAMES[target]} ${distance}` });
  };
  if (input.ships.includes(0)) arrow('ship', own.x, own.y, cam.centreX, cam.centreY);
  if (input.ships.includes(1)) { const en = interpolatedShip(state, prev, alpha, 1); arrow('enemy', en.x, en.y, own.x, own.y); }
  arrow('planet', map.planet.x, map.planet.y, own.x, own.y);
  const m = state.missiles[0];
  if (m) arrow('missile', m.x, m.y, own.x, own.y);

  const units = [...SCALE_STEPS].reverse().find((u) => u * z <= SCALE_BAR_MAX_PX) ?? SCALE_STEPS[0]!;
  return {
    grid: gridDraw(cam, vp), contours, edge, planet, asteroids, ships, helm, arrows,
    overlay: { zoomText: `ZOOM ${z.toFixed(2)}`, scaleBar: { px: units * z, units }, snapHint: cam.follow === 'free', paused: input.paused },
    stars: starOffset(cam.centreX, cam.centreY, vp)
  };
}

/** The wedge silhouette in ship units (forward f, right s; the nose at +f), split into the three room segments of
 *  parent §5: Weapons (nose), Shields (flanks), Engines (stern). Each is a flat [f, s, f, s, ...] polygon. */
export const WEDGE_NOSE = 1.3, WEDGE_TAIL = -0.9, WEDGE_HALF = 0.85;
function halfWidth(f: number): number { return (WEDGE_HALF * (WEDGE_NOSE - f)) / (WEDGE_NOSE - WEDGE_TAIL); }
export function wedgeSegments(): { room: number; poly: number[] }[] {
  const a = 0.3, b = -0.5, wa = halfWidth(a), wb = halfWidth(b);
  return [
    { room: 0, poly: [WEDGE_NOSE, 0, a, wa, a, -wa] },
    { room: 1, poly: [a, -wa, a, wa, b, wb, b, -wb] },
    { room: 2, poly: [b, -wb, b, wb, WEDGE_TAIL, WEDGE_HALF, WEDGE_TAIL, -WEDGE_HALF] }
  ];
}

const shapeCache = new Map<number, number[]>();
/** A rough asteroid outline as radius multipliers (9 vertices, 0.72..1.08), seeded by the asteroid's index. Render-only randomness. */
export function asteroidShape(index: number): number[] {
  let out = shapeCache.get(index);
  if (out) return out;
  let h = (index + 1) * 2654435761 >>> 0;
  out = [];
  for (let k = 0; k < 9; k++) { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; out.push(0.72 + ((h % 1000) / 1000) * 0.36); }
  shapeCache.set(index, out);
  return out;
}
```

- [ ] **Step 4: Write the feel model**

Create `src/renderer/src/render/tactical/feelModel.ts`:

```ts
// The dev flight view's feel panel (H-1 spec §9): the numbers parent §6's feel targets talk about. Pure. The runtime
// records one sample per sim tick; the panel reads the readout every frame.
import { hx, hy } from '../../sim/tactical/direction';
import type { Circle } from '../../sim/tactical/map';
import { gravityAccel } from '../../sim/tactical/physics';
import type { Ship } from '../../sim/tactical/state';
import { HEADING_COUNT } from '../../sim/tactical/tuning';
import { TICK_HZ } from '../../sim/tuning';

/** The minimum planet distance is kept over this many ticks (10 s). */
export const FEEL_WINDOW_TICKS = 10 * TICK_HZ;

export interface FeelTracker {
  /** Ring buffer of the planet distance at each of the last FEEL_WINDOW_TICKS ticks. */
  dist: Float64Array; head: number; count: number;
  /** The continuous heading (heading + headingAcc) at the last sample, and the turn rate it gave, in degrees per second. */
  lastH: number | null; turnRate: number;
}

export interface FeelReadout {
  /** u/s. */
  speed: number;
  /** Sideways speed (perpendicular to the heading), u/s, unsigned. */
  skid: number;
  /** Degrees per second, + clockwise. */
  turnRate: number;
  /** Pull at the ship, u/s². */
  gravity: number;
  /** From the planet's centre (parent §6 speaks of r ≈ 150), units. */
  planet: number;
  /** The least `planet` over the last 10 s. */
  minPlanet: number;
}

export function createFeelTracker(): FeelTracker {
  return { dist: new Float64Array(FEEL_WINDOW_TICKS), head: 0, count: 0, lastH: null, turnRate: 0 };
}

export function resetFeel(t: FeelTracker): void { t.head = 0; t.count = 0; t.lastH = null; t.turnRate = 0; }

function planetDistance(s: Ship, planet: Circle): number { return Math.sqrt((s.x - planet.x) ** 2 + (s.y - planet.y) ** 2); }

/** Call once after every sim tick. */
export function recordFeel(t: FeelTracker, s: Ship, planet: Circle): void {
  const h = s.heading + s.headingAcc;
  if (t.lastH !== null) {
    let dh = h - t.lastH;
    dh -= Math.round(dh / HEADING_COUNT) * HEADING_COUNT;
    t.turnRate = (dh * 360 / HEADING_COUNT) * TICK_HZ;
  }
  t.lastH = h;
  t.dist[t.head] = planetDistance(s, planet);
  t.head = (t.head + 1) % FEEL_WINDOW_TICKS;
  t.count = Math.min(FEEL_WINDOW_TICKS, t.count + 1);
}

export function feelReadout(t: FeelTracker, s: Ship, planet: Circle): FeelReadout {
  const px = -hy(s.heading), py = hx(s.heading);
  const [gx, gy] = gravityAccel(s.x - planet.x, s.y - planet.y);
  const here = planetDistance(s, planet);
  let min = here;
  for (let k = 0; k < t.count; k++) min = Math.min(min, t.dist[k]!);
  return {
    speed: Math.sqrt(s.vx * s.vx + s.vy * s.vy), skid: Math.abs(s.vx * px + s.vy * py), turnRate: t.turnRate,
    gravity: Math.sqrt(gx * gx + gy * gy), planet: here, minPlanet: min
  };
}

/** The panel's rows as label and value pairs. */
export function feelRows(r: FeelReadout): [string, string][] {
  return [
    ['SPEED', `${Math.round(r.speed)} u/s`],
    ['SKID', `${Math.round(r.skid)} u/s`],
    ['TURN', `${Math.round(r.turnRate)} deg/s`],
    ['GRAVITY', `${r.gravity.toFixed(1)} u/s2`],
    ['PLANET r', `${Math.round(r.planet)}`],
    ['MIN r 10s', `${Math.round(r.minPlanet)}`]
  ];
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/tacticalModel.test.ts tests/boundary.test.ts`
Expected: PASS (20 model tests; the boundary test is unchanged, since nothing under a guarded root imports the new files).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/tactical/feelModel.ts tests/tacticalModel.test.ts
git commit -m "feat(helm): the Helm map-view model and the flight feel readout (Helm H-1a)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 4: The map-view layer and the feel panel

**Files:**
- Create: `src/renderer/src/render/tactical/tacticalLayer.ts`, `src/renderer/src/render/tactical/feelPanel.ts`
- Create: `tests/tacticalLayer.test.ts`

**Interfaces:**
- Consumes: Task 3's `TacticalDraw`, `Label`, `ShipDraw`, `ArrowTarget`, `wedgeSegments`, `asteroidShape`, `CHEVRON_SIZE`, `feelRows`; Task 2's `Viewport`; `drawPanel` (`render/panel.ts`); theme colours, `FONT_NATIVE`, `FONT_SIZE`, `LINE`, `PAD`, `textPx`.
- Produces:
  - `render/tactical/tacticalLayer.ts`: `SPACE`, `CREW_SHIP`, `ENEMY_SHIP`, `SHIELD_RING`; `interface TacticalLayer { container: Container; stars: Container; draw(d: TacticalDraw): void; reset(): void }` (`stars` is the parallax star tile, exposed for its test); `createTacticalLayer(opts: { fontFamily: string; viewport: Viewport; seed?: number }): TacticalLayer`.
  - `render/tactical/feelPanel.ts`: `FEEL_PANEL_W` (250), `FEEL_PANEL_MARGIN` (8), `FEEL_PANEL_H`; `interface FeelPanel { container; draw(rows) }`; `createFeelPanel(opts: { fontFamily: string; x: number; y: number }): FeelPanel`.

- [ ] **Step 1: Write the failing test**

Create `tests/tacticalLayer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import { createCamera, pan, updateCamera, zoomBy } from '../src/renderer/src/render/tactical/camera';
import { createFeelPanel } from '../src/renderer/src/render/tactical/feelPanel';
import { createFeelTracker, feelReadout, feelRows, recordFeel } from '../src/renderer/src/render/tactical/feelModel';
import { createTacticalLayer } from '../src/renderer/src/render/tactical/tacticalLayer';
import { followTarget, tacticalModel, type PrevBody } from '../src/renderer/src/render/tactical/tacticalModel';
import { stepSoloFlight } from '../src/renderer/src/sim/tactical/physics';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';

const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
const vp = { w: 1280, h: 720 };

describe('tactical layer allocation (H-1 spec §10)', () => {
  it('a warm-up of 2 frames, then 60 frames of flying, zooming, panning and pausing add no display objects', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    const panel = createFeelPanel({ fontFamily: 'm5x7', x: 1020, y: 8 });
    const st = createTacticalState(9), cam = createCamera(st.ships[0].x, st.ships[0].y), feel = createFeelTracker();
    let prev: PrevBody[] = st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
    const frame = (k: number): void => {
      prev = st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
      const axes = { turn: k % 20 < 10 ? 1 : -1, thrust: k % 3 === 0 ? 0 : 1 };
      stepSoloFlight(st, axes); recordFeel(feel, st.ships[0], st.map.planet);
      if (k === 10) zoomBy(cam, vp, -12);       // out to the widest: every grid label, every asteroid
      if (k === 25) zoomBy(cam, vp, 12);        // in to the closest: 250-unit lines, the bearing ring
      if (k === 40) pan(cam, 3000, 0);           // free: the ship and planet arrows, the snap hint
      updateCamera(cam, vp, 1 / 60, followTarget(st, prev, 0.5, cam.follow));
      layer.draw(tacticalModel({ state: st, prev, alpha: 0.5, camera: cam, viewport: vp, console: 'helm', axes, ships: [0], paused: k > 50, reserveRight: 266 }));
      panel.draw(feelRows(feelReadout(feel, st.ships[0], st.map.planet)));
    };
    frame(0); frame(1);
    const n0 = count(layer.container), p0 = count(panel.container);
    for (let k = 2; k < 62; k++) frame(k);
    expect(count(layer.container)).toBe(n0);
    expect(count(panel.container)).toBe(p0);
  });
  it('the star tile follows the parallax offset: shifted by one tile so the 2 x 2 field always covers the screen', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    const st = createTacticalState(9), cam = createCamera(0, 0);
    const draw = (): void => layer.draw(tacticalModel({ state: st, prev: [], alpha: 1, camera: cam, viewport: vp, console: 'helm', axes: { turn: 0, thrust: 0 }, ships: [0], paused: false, reserveRight: 0 }));
    draw();
    expect([layer.stars.x, layer.stars.y]).toEqual([-1280, -720]);
    pan(cam, -100, 50); draw();                     // centre +200, −100 units at zoom 0.5: stars −4 px (wrapped) and +2 px
    expect(layer.stars.x).toBeCloseTo(-4, 9); expect(layer.stars.y).toBeCloseTo(2 - 720, 9);
    expect(layer.stars.x).toBeLessThanOrEqual(0); expect(layer.stars.x + 2 * 1280).toBeGreaterThanOrEqual(1280);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tacticalLayer.test.ts`
Expected: FAIL, "Error: Cannot find module '../src/renderer/src/render/tactical/feelPanel'" (the first import not yet written).

- [ ] **Step 3: Write the map-view layer**

Create `src/renderer/src/render/tactical/tacticalLayer.ts`:

```ts
// The console map view layer (H-1 spec §7): draws a TacticalDraw with Graphics and pooled BitmapText. Every display
// object is made at creation; a frame only clears and redraws Graphics and sets text, so nothing is allocated per frame.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { AMBER, DIM, FONT_NATIVE, FONT_SIZE, GOOD, TEXT, textPx, WARN } from '../theme';
import { SHIP_RADIUS } from '../../sim/tactical/tuning';
import { asteroidShape, CHEVRON_SIZE, wedgeSegments, type ArrowTarget, type Label, type ShipDraw, type TacticalDraw } from './tacticalModel';
import type { Viewport } from './camera';

export const SPACE = 0x05060a;
export const CREW_SHIP = 0x4fd6e8, ENEMY_SHIP = 0xe8564f, SHIELD_RING = 0x6fc3ff;
const GRID = 0x34445c, CONTOUR = 0x4a6a9a, EDGE = 0xa05050, PLANET = 0x2d4a6b, PLANET_LIT = 0x5b86b0, PLANET_RIM = 0x8fb4d8;
const ROCK = 0x5e554b, ROCK_EDGE = 0x8a7f70, PATH = GOOD, VELOCITY = AMBER, FLAME = 0xff8c1a;
const ARROW_COLOUR: Readonly<Record<ArrowTarget, number>> = { ship: CREW_SHIP, enemy: ENEMY_SHIP, planet: PLANET_RIM, missile: AMBER };
/** Room segment tint by damage level 0 / 1 / 2: the ship's own colour, amber, red. */
const DAMAGE: readonly (number | null)[] = [null, AMBER, WARN];
const STAR_COUNT = 220;
/** Pool sizes: the labels name 500-unit squares (12 per axis at most), the ring has 12 labels, at most 4 arrows. */
const GRID_LABELS = 12, RING_LABELS = 12, ARROWS = 4;

/** `stars` is exposed for the parallax test. */
export interface TacticalLayer { container: Container; stars: Container; draw(d: TacticalDraw): void; reset(): void }
export interface TacticalLayerOptions { fontFamily: string; viewport: Viewport; seed?: number }

export function createTacticalLayer(opts: TacticalLayerOptions): TacticalLayer {
  const { w, h } = opts.viewport;
  const container = new Container();
  const bg = new Graphics(), stars = new Graphics(), grid = new Graphics(), contours = new Graphics(), bodies = new Graphics(), ships = new Graphics(), helm = new Graphics(), overlay = new Graphics();
  container.addChild(bg, stars, grid, contours, bodies, ships, helm, overlay);
  const mk = (size: number, tint: number, anchorX = 0, anchorY = 0): BitmapText => {
    const t = new BitmapText({ text: '', style: { fontFamily: opts.fontFamily, fontSize: size } });
    t.tint = tint; t.roundPixels = true; t.anchor.set(anchorX, anchorY); t.visible = false; container.addChild(t); return t;
  };
  const cols = Array.from({ length: GRID_LABELS }, () => mk(FONT_NATIVE, DIM, 0.5, 0));
  const rows = Array.from({ length: GRID_LABELS }, () => mk(FONT_NATIVE, DIM, 0, 0.5));
  const ring = Array.from({ length: RING_LABELS }, () => mk(FONT_NATIVE, DIM, 0.5, 0.5));
  const arrowText = Array.from({ length: ARROWS }, () => mk(FONT_NATIVE, TEXT, 0.5, 0.5));
  const zoomText = mk(FONT_SIZE, DIM), scaleText = mk(FONT_NATIVE, DIM), hint = mk(FONT_SIZE, AMBER, 0.5, 1), banner = mk(FONT_SIZE * 1.5, TEXT, 0.5, 0.5);
  zoomText.position.set(16, h - 64); scaleText.position.set(16, h - 22); hint.position.set(w / 2, h - 12); banner.position.set(w / 2, h / 2 - 80);
  banner.text = 'PAUSED   ESC: RESUME';

  // The star field: render-only randomness, seeded (H-1 spec §7 item 1). One screen of stars is drawn as a 2 × 2 tile, so
  // shifting it by the parallax offset (0..w, 0..h, minus one tile) always covers the screen with no gap.
  bg.rect(0, 0, w, h).fill(SPACE);
  let r = (opts.seed ?? 2026) >>> 0 || 1;
  const rnd = (): number => { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; };
  for (let k = 0; k < STAR_COUNT; k++) {
    const x = rnd() * w, y = rnd() * h, b = rnd();
    for (const [tx, ty] of [[0, 0], [w, 0], [0, h], [w, h]] as const)
      stars.rect(Math.floor(x) + tx, Math.floor(y) + ty, b > 0.92 ? 2 : 1, b > 0.92 ? 2 : 1).fill({ color: 0xffffff, alpha: 0.25 + 0.55 * b });
  }

  const setText = (t: BitmapText, s: string): void => { if (t.text !== s) t.text = s; };
  function fill(pool: BitmapText[], labels: readonly Label[]): void {
    pool.forEach((t, k) => {
      const l = labels[k];
      t.visible = l !== undefined;
      if (l) { setText(t, l.text); t.position.set(Math.round(l.x), Math.round(l.y)); }
    });
  }

  function drawShip(g: Graphics, s: ShipDraw): void {
    const colour = s.crew ? CREW_SHIP : ENEMY_SHIP, fx = Math.sin(s.angle), fy = -Math.cos(s.angle), rx = -fy, ry = fx;
    if (s.chevron) {
      const k = CHEVRON_SIZE / 2, pt = (f: number, side: number): number[] => [s.x + (fx * f + rx * side) * k, s.y + (fy * f + ry * side) * k];
      g.poly([...pt(1.1, 0), ...pt(-0.9, 0.85), ...pt(-0.45, 0), ...pt(-0.9, -0.85)]).fill(colour).stroke({ width: 1, color: 0x000000, alpha: 0.6 });
      return;
    }
    const k = SHIP_RADIUS * s.scale;
    for (const seg of wedgeSegments()) {
      const pts: number[] = [];
      for (let i = 0; i < seg.poly.length; i += 2) { const f = seg.poly[i]!, side = seg.poly[i + 1]!; pts.push(s.x + (fx * f + rx * side) * k, s.y + (fy * f + ry * side) * k); }
      g.poly(pts).fill(DAMAGE[s.rooms[seg.room] ?? 0] ?? colour).stroke({ width: 1, color: 0x0b1018 });
    }
    for (let l = 0; l < s.shields; l++) g.circle(s.x, s.y, k * (1.6 + 0.25 * l)).stroke({ width: 1, color: SHIELD_RING, alpha: 0.65 - 0.2 * l });
  }

  function arrowGlyph(g: Graphics, x: number, y: number, angle: number, colour: number): void {
    const fx = Math.sin(angle), fy = -Math.cos(angle), rx = -fy, ry = fx, s = 10;
    g.poly([x + fx * s, y + fy * s, x - fx * s * 0.6 + rx * s * 0.7, y - fy * s * 0.6 + ry * s * 0.7, x - fx * s * 0.6 - rx * s * 0.7, y - fy * s * 0.6 - ry * s * 0.7]).fill(colour);
  }

  return {
    container, stars,
    draw(d) {
      stars.position.set(d.stars.x - w, d.stars.y - h);
      grid.clear(); contours.clear(); bodies.clear(); ships.clear(); helm.clear(); overlay.clear();
      for (const l of d.grid.lines) grid.moveTo(l.x1, l.y1).lineTo(l.x2, l.y2).stroke({ width: 1, color: GRID, alpha: l.major ? 0.7 : 0.3 });
      fill(cols, d.grid.columns); fill(rows, d.grid.rows);

      for (const c of d.contours) contours.circle(c.x, c.y, c.r).stroke({ width: 1, color: CONTOUR, alpha: 0.45 });
      if (d.edge) contours.circle(d.edge.x, d.edge.y, d.edge.r).stroke({ width: 2, color: EDGE, alpha: 0.7 });

      if (d.planet) {
        const p = d.planet;
        bodies.circle(p.x, p.y, Math.max(1, p.r)).fill(PLANET);
        bodies.circle(p.x - p.r * 0.22, p.y - p.r * 0.22, p.r * 0.72).fill({ color: PLANET_LIT, alpha: 0.55 });
        bodies.circle(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.35).fill({ color: PLANET_RIM, alpha: 0.35 });
        bodies.circle(p.x, p.y, Math.max(1, p.r)).stroke({ width: 1, color: PLANET_RIM, alpha: 0.6 });
      }
      for (const a of d.asteroids) {
        if (a.dot) { bodies.rect(Math.round(a.x) - 1, Math.round(a.y) - 1, 2, 2).fill(ROCK_EDGE); continue; }
        const shape = asteroidShape(a.index), pts: number[] = [];
        shape.forEach((m, k) => { const t = (k / shape.length) * Math.PI * 2; pts.push(a.x + Math.cos(t) * a.r * m, a.y + Math.sin(t) * a.r * m); });
        bodies.poly(pts).fill(ROCK).stroke({ width: 1, color: ROCK_EDGE });
      }

      for (const s of d.ships) drawShip(ships, s);

      let ringLabels: readonly Label[] = [];
      if (d.helm) {
        const hd = d.helm;
        if (hd.path.length > 0) {
          helm.moveTo(hd.origin.x, hd.origin.y);
          for (const p of hd.path) helm.lineTo(p.x, p.y);
          helm.stroke({ width: 2, color: PATH, alpha: 0.7 });
          const end = hd.path[hd.path.length - 1]!;
          helm.circle(end.x, end.y, 3).fill({ color: PATH, alpha: 0.9 });
        }
        helm.moveTo(hd.origin.x, hd.origin.y).lineTo(hd.velocity.x, hd.velocity.y).stroke({ width: 2, color: VELOCITY, alpha: 0.8 });
        helm.moveTo(hd.headingFrom.x, hd.headingFrom.y).lineTo(hd.headingTo.x, hd.headingTo.y).stroke({ width: 1, color: TEXT, alpha: 0.7 });
        // Thrust: a flame behind the stern (forward) or ahead of the nose (reverse). Turn: a pip on the side it turns to.
        const fx = (hd.headingTo.x - hd.headingFrom.x) / 40, fy = (hd.headingTo.y - hd.headingFrom.y) / 40, rx = -fy, ry = fx;
        const back = Math.hypot(hd.headingFrom.x - hd.origin.x, hd.headingFrom.y - hd.origin.y);
        if (hd.thrust !== 0) {
          const dir = hd.thrust > 0 ? -1 : 1, bx = hd.origin.x + fx * dir * back, by = hd.origin.y + fy * dir * back, len = hd.thrust > 0 ? 14 : 8;
          helm.poly([bx + rx * 5, by + ry * 5, bx - rx * 5, by - ry * 5, bx + fx * dir * len, by + fy * dir * len]).fill({ color: FLAME, alpha: 0.9 });
        }
        if (hd.turn !== 0) helm.circle(hd.headingTo.x + rx * hd.turn * 8, hd.headingTo.y + ry * hd.turn * 8, 3).fill({ color: AMBER, alpha: 0.9 });
        if (hd.ring) {
          helm.circle(hd.ring.x, hd.ring.y, hd.ring.r).stroke({ width: 1, color: DIM, alpha: 0.25 });
          for (const t of hd.ring.ticks) helm.moveTo(t.x1, t.y1).lineTo(t.x2, t.y2).stroke({ width: 1, color: DIM, alpha: t.major ? 0.7 : 0.35 });
          ringLabels = hd.ring.labels;
        }
      }
      fill(ring, ringLabels);

      d.arrows.forEach((a) => arrowGlyph(overlay, a.x, a.y, a.angle, ARROW_COLOUR[a.target]));
      // Each label sits inward of its arrow, far enough along the arrow's axis to clear the glyph (half its width, plus 14 px).
      fill(arrowText, d.arrows.map((a) => ({ text: a.label, x: a.x - Math.sin(a.angle) * (textPx(a.label, 1) / 2 + 14), y: a.y + Math.cos(a.angle) * 18 })));
      const o = d.overlay, bx = 16, by = h - 28;
      overlay.moveTo(bx, by).lineTo(bx + o.scaleBar.px, by).stroke({ width: 2, color: DIM });
      overlay.moveTo(bx, by - 5).lineTo(bx, by + 5).stroke({ width: 2, color: DIM }).moveTo(bx + o.scaleBar.px, by - 5).lineTo(bx + o.scaleBar.px, by + 5).stroke({ width: 2, color: DIM });
      setText(zoomText, o.zoomText); zoomText.visible = true;
      setText(scaleText, `${o.scaleBar.units} u`); scaleText.visible = true; scaleText.position.set(bx + o.scaleBar.px + 8, by - 8);
      setText(hint, 'C: SNAP BACK'); hint.visible = o.snapHint;
      banner.visible = o.paused;
    },
    reset() { for (const t of [...cols, ...rows, ...ring, ...arrowText]) t.visible = false; }
  };
}
```

- [ ] **Step 4: Write the feel panel**

Create `src/renderer/src/render/tactical/feelPanel.ts`:

```ts
// The flight view's feel panel (H-1 spec §9), in the readout's place on the right. Made once; a frame only sets text.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { drawPanel } from '../panel';
import { AMBER, DIM, FONT_NATIVE, FONT_SIZE, LINE, PAD, TEXT } from '../theme';

export const FEEL_PANEL_W = 250, FEEL_PANEL_MARGIN = 8;
const ROWS = 6;
const HELP: readonly string[] = ['W/S  THRUST / REVERSE', 'A/D  TURN', 'WHEEL  - =  ZOOM', 'RIGHT DRAG  PAN', 'C  SNAP BACK', 'ESC  PAUSE'];
const HELP_LINE = 14;
export const FEEL_PANEL_H = PAD + LINE * (ROWS + 1) + PAD + HELP.length * HELP_LINE + PAD;

export interface FeelPanel { container: Container; draw(rows: readonly (readonly [string, string])[]): void }

export function createFeelPanel(opts: { fontFamily: string; x: number; y: number }): FeelPanel {
  const container = new Container();
  container.position.set(opts.x, opts.y);
  container.addChild(drawPanel(new Graphics(), 0, 0, FEEL_PANEL_W, FEEL_PANEL_H));
  const mk = (text: string, size: number, tint: number, x: number, y: number, anchorX = 0): BitmapText => {
    const t = new BitmapText({ text, style: { fontFamily: opts.fontFamily, fontSize: size } });
    t.tint = tint; t.roundPixels = true; t.anchor.set(anchorX, 0); t.position.set(x, y); container.addChild(t); return t;
  };
  mk('FLIGHT FEEL', FONT_SIZE, AMBER, PAD, PAD - 6);
  const labels: BitmapText[] = [], values: BitmapText[] = [];
  for (let k = 0; k < ROWS; k++) {
    const y = PAD - 6 + LINE * (k + 1);
    labels.push(mk('', FONT_SIZE, DIM, PAD, y));
    values.push(mk('', FONT_SIZE, TEXT, FEEL_PANEL_W - PAD, y, 1));
  }
  HELP.forEach((line, k) => mk(line, FONT_NATIVE, DIM, PAD, PAD + LINE * (ROWS + 1) + PAD + k * HELP_LINE));
  return {
    container,
    draw(rows) {
      for (let k = 0; k < ROWS; k++) {
        const [l, v] = rows[k] ?? ['', ''];
        if (labels[k]!.text !== l) labels[k]!.text = l;
        if (values[k]!.text !== v) values[k]!.text = v;
      }
    }
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/tacticalLayer.test.ts tests/render.test.ts`
Expected: PASS (2 new tests: the allocation test and the star parallax test; `render.test.ts` unchanged). Pixi `Graphics` and `BitmapText` are built in Vitest's node environment without a renderer, as `render.test.ts` already does for the enemy window.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/render/tactical/feelPanel.ts tests/tacticalLayer.test.ts
git commit -m "feat(helm): the Pixi Helm map-view layer and the feel panel (Helm H-1a)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 5: The runtime, the flight mode and `dev:flight`

**Files:**
- Create: `src/renderer/src/app/duel/runtime.ts`, `src/renderer/src/app/duel/mode.ts`, `src/renderer/src/app/duel/flightMode.ts`, `scripts/dev-mode.ts`
- Replace: `src/renderer/src/main.ts`, `src/main/index.ts`, `package.json`
- Create: `tests/flightRuntime.test.ts`

**Interfaces:**
- Consumes:
  - `createTickDriver(clock, scheduler, onTick)` (`authority/tickDriver.ts`) and `Scheduler` (`net/contracts.ts`), both unchanged;
  - Task 1's `stepSoloFlight`;
  - Task 2's camera functions, `createDuelKeyboard`, `createPointerSource`, `helmAxes`, `wheelNotches`, `KeySample`, `PointerSample`, `EventSource`;
  - Task 3's `tacticalModel`, `followTarget`, `PrevBody`, the feel model;
  - Task 4's layers;
  - `Renderer` (`render/renderer.ts`) and `computeLetterbox` (`render/letterbox.ts`).
- Produces:
  - `app/duel/runtime.ts`:
    - `type PauseReason = 'user' | 'blur' | 'hidden' | 'suspend'`;
    - `interface FlightRuntimeDeps { now(); scheduler; sampleKeys(): KeySample; samplePointer(): PointerSample; seed; viewport }`;
    - `interface FlightRuntime { state; prev; axes(); camera; feel; alpha(); frame(dt); pause(r); resume(r); paused(); reasons(); dispose() }`;
    - `createFlightRuntime(deps): FlightRuntime`.
  - `app/duel/mode.ts`: `type AppMode = 'sector' | 'flight'`; `DEFAULT_SEED` (2026); `readMode(search): AppMode`; `readSeed(search, fallback = DEFAULT_SEED): number`.
  - `app/duel/flightMode.ts`: `FLIGHT_RESERVE_RIGHT` (266); `startFlightMode(deps: { renderer; seed; lifecycle? }): () => void` (returns its dispose).
  - `main.ts`: `startSector()` (today's body, unchanged), `startFlight(seed)`, `start()` choosing by `readMode(location.search)`.
  - `src/main/index.ts`: `FTLITE_MODE` becomes `?mode=<value>`, through `url.searchParams` in dev and `loadFile`'s `query` when packaged.
  - `package.json`: `"dev:flight": "tsx scripts/dev-mode.ts flight"`.

- [ ] **Step 1: Write the failing test**

Create `tests/flightRuntime.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyPresses, type KeyAction, type KeySample, type PointerSample } from '../src/renderer/src/app/duel/input';
import { DEFAULT_SEED, readMode, readSeed } from '../src/renderer/src/app/duel/mode';
import { createFlightRuntime } from '../src/renderer/src/app/duel/runtime';
import { ZOOM_DEFAULT, ZOOM_STEP } from '../src/renderer/src/render/tactical/camera';

/** A fake wall clock and setTimeout scheduler: advance(ms) runs every callback that falls due, in time order. */
function fakeTime() {
  let now = 0, seq = 0;
  const tasks: { at: number; seq: number; cb: () => void }[] = [];
  return {
    now: () => now,
    scheduler: { schedule(delay: number, cb: () => void) { const t = { at: now + delay, seq: seq++, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        tasks.sort((a, b) => a.at - b.at || a.seq - b.seq);
        const t = tasks[0];
        if (!t || t.at > end) break;
        tasks.shift(); now = Math.max(now, t.at); t.cb();
      }
      now = end;
    }
  };
}
/** Scripted input: the test sets `keys` and `pointer` before each frame. */
function rig(seed = 5) {
  const time = fakeTime();
  const input = {
    keys: { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() } as KeySample,
    pointer: { x: null, y: null, wheel: 0, dragX: 0, dragY: 0 } as PointerSample
  };
  const rt = createFlightRuntime({
    now: time.now, scheduler: time.scheduler, seed, viewport: { w: 1280, h: 720 },
    sampleKeys: () => { const k = input.keys; input.keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => { const p = input.pointer; input.pointer = { ...p, wheel: 0, dragX: 0, dragY: 0 }; return p; }
  });
  const press = (action: KeyAction): void => { input.keys = { ...input.keys, presses: { ...input.keys.presses, [action]: input.keys.presses[action] + 1 } }; };
  return { time, input, rt, press };
}

describe('the flight runtime (H-1 spec §4, §9)', () => {
  it('steps the single-ship flight at 60 Hz from the wall clock; ship 1 never moves', () => {
    const { time, rt } = rig();
    const s1 = { ...rt.state.ships[1] };
    time.advance(1010);   // the driver polls every 1000/120 ms, so the tick due at 1000 ms runs on the next poll
    expect(rt.state.tick).toBe(60);
    expect(rt.state.ships[1].x).toBe(s1.x); expect(rt.state.ships[1].y).toBe(s1.y);
    rt.dispose();
  });
  it('W held thrusts forward; the axes the last tick sent are exposed', () => {
    const { time, input, rt } = rig();
    expect(rt.axes()).toEqual({ turn: 0, thrust: 0 });
    input.keys = { ...input.keys, moveY: -1 };
    rt.frame(1 / 60);
    const v0 = Math.hypot(rt.state.ships[0].vx, rt.state.ships[0].vy);
    time.advance(500);
    expect(rt.axes()).toEqual({ turn: 0, thrust: 1 });
    expect(Math.hypot(rt.state.ships[0].vx, rt.state.ships[0].vy)).toBeGreaterThan(v0 + 30);
    rt.dispose();
  });
  it('records the previous tick positions and interpolates by wall time', () => {
    const { time, rt } = rig();
    expect(rt.alpha()).toBe(1);
    time.advance(1000 / 60 + 0.01);
    expect(rt.state.tick).toBe(1);
    const s = rt.state.ships[0];
    expect(rt.prev[0]!.x).not.toBe(s.x);   // the spawn orbits, so the ship moved on tick 0
    time.advance(1000 / 60 / 2);
    expect(rt.alpha()).toBeGreaterThan(0.45); expect(rt.alpha()).toBeLessThanOrEqual(0.55);
    rt.pause('user');
    time.advance(1000);
    expect(rt.alpha()).toBe(1);
    rt.dispose();
  });
  it('keeps a set of pause reasons: focus never undoes an Escape pause', () => {
    const { time, rt, press } = rig();
    time.advance(100); const t0 = rt.state.tick;
    press('pause'); rt.frame(1 / 60);
    expect([...rt.reasons()]).toEqual(['user']);
    rt.pause('blur'); rt.resume('blur');
    time.advance(500);
    expect(rt.state.tick).toBe(t0);
    expect(rt.paused()).toBe(true);
    press('pause'); rt.frame(1 / 60);
    expect(rt.paused()).toBe(false);
    rt.pause('hidden'); rt.pause('suspend'); time.advance(500); expect(rt.state.tick).toBe(t0);
    rt.resume('hidden'); time.advance(500); expect(rt.state.tick).toBe(t0);
    rt.resume('suspend'); time.advance(500); expect(rt.state.tick).toBe(t0 + 30);
    rt.dispose();
  });
  it('drives the camera: follows the ship, zoom keys and wheel, drag pans, C snaps back', () => {
    const { time, input, rt, press } = rig();
    time.advance(200); rt.frame(1 / 60);
    const ship = rt.state.ships[0];
    expect(Math.hypot(rt.camera.centreX - ship.x, rt.camera.centreY - ship.y)).toBeLessThan(20);
    press('zoomIn'); press('zoomIn'); press('zoomOut'); rt.frame(1 / 60);
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP, 12);
    input.pointer = { ...input.pointer, x: 900, y: 200, wheel: 100 }; rt.frame(1 / 60);
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT, 12);
    input.pointer = { ...input.pointer, dragX: 300, dragY: 0 }; rt.frame(1 / 60);
    expect(rt.camera.follow).toBe('free');
    press('camera'); rt.frame(1 / 60);
    expect(rt.camera.follow).toBe('ship');
    for (let k = 0; k < 20; k++) rt.frame(1 / 60);
    time.advance(0);
    expect(Math.hypot(rt.camera.centreX - ship.x, rt.camera.centreY - ship.y)).toBeLessThan(20);
    rt.dispose();
  });
  it('a drag and a wheel in the same frame: the camera goes free and zooms about the cursor', () => {
    const { input, rt } = rig();
    rt.frame(1 / 60);
    input.pointer = { x: 900, y: 200, wheel: -100, dragX: 50, dragY: 0 };
    rt.frame(0);
    expect(rt.camera.follow).toBe('free');
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP, 12);
    expect(rt.camera.anchor).toMatchObject({ sx: 900, sy: 200 });
    rt.dispose();
  });
  it('stops stepping once disposed', () => {
    const { time, rt } = rig();
    time.advance(100); const t0 = rt.state.tick; rt.dispose(); time.advance(1000);
    expect(rt.state.tick).toBe(t0);
  });
});

describe('the launch mode (H-1 spec §3)', () => {
  it('flight only for ?mode=flight; anything else is the sector game', () => {
    expect(readMode('?mode=flight')).toBe('flight');
    expect(readMode('')).toBe('sector'); expect(readMode('?mode=duel')).toBe('sector'); expect(readMode('?mode=FLIGHT')).toBe('sector');
  });
  it('?seed overrides the default with a whole number', () => {
    expect(readSeed('')).toBe(DEFAULT_SEED); expect(readSeed('?mode=flight&seed=42')).toBe(42);
    expect(readSeed('?seed=-3')).toBe(DEFAULT_SEED); expect(readSeed('?seed=1.5')).toBe(DEFAULT_SEED); expect(readSeed('?seed=99999999999')).toBe(DEFAULT_SEED);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/flightRuntime.test.ts`
Expected: FAIL, "Error: Cannot find module '../src/renderer/src/app/duel/mode'" (the first import not yet written).

- [ ] **Step 3: Write the runtime and the mode reader**

Create `src/renderer/src/app/duel/runtime.ts`:

```ts
// The local runtime for the dev flight view (H-1 spec §4, §9): the renderer steps the tactical sim itself on a 60 Hz
// wall-clock driver until H-0c-ii puts the duel behind the authority. H-1b adds the duel runtime beside it.
import { createTickDriver } from '../../authority/tickDriver';
import type { Scheduler } from '../../net/contracts';
import { stepSoloFlight } from '../../sim/tactical/physics';
import { createTacticalState, NO_AXES, type Axes, type TacticalState } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
import { createCamera, pan, snapBack, updateCamera, zoomBy, type Camera, type Viewport } from '../../render/tactical/camera';
import { createFeelTracker, recordFeel, type FeelTracker } from '../../render/tactical/feelModel';
import { followTarget, type PrevBody } from '../../render/tactical/tacticalModel';
import { helmAxes, wheelNotches, type KeySample, type PointerSample } from './input';

export type PauseReason = 'user' | 'blur' | 'hidden' | 'suspend';

export interface FlightRuntimeDeps {
  now(): number;
  scheduler: Scheduler;
  /** Called once per frame: held keys and the press edges since the last call. */
  sampleKeys(): KeySample;
  /** Called once per frame: the pointer position, wheel and drag since the last call. */
  samplePointer(): PointerSample;
  seed: number;
  viewport: Viewport;
}

export interface FlightRuntime {
  readonly state: TacticalState;
  /** Each ship's position and continuous heading before the last tick (for interpolation). */
  readonly prev: readonly PrevBody[];
  /** The Helm axes the last tick sent to the sim (zero before the first tick). */
  axes(): Axes;
  readonly camera: Camera;
  readonly feel: FeelTracker;
  /** Render interpolation: (now − last tick time) · 60 / 1000, clamped to 0..1; 1 before the first tick. */
  alpha(): number;
  /** One render frame: input, pause toggles and the camera. `dt` in seconds. */
  frame(dt: number): void;
  pause(reason: PauseReason): void;
  resume(reason: PauseReason): void;
  paused(): boolean;
  /** The pause reasons now set; the user banner shows while 'user' is among them. */
  reasons(): ReadonlySet<PauseReason>;
  dispose(): void;
}

export function createFlightRuntime(deps: FlightRuntimeDeps): FlightRuntime {
  const state = createTacticalState(deps.seed);
  const prev: PrevBody[] = state.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
  const camera = createCamera(state.ships[0].x, state.ships[0].y);
  const feel = createFeelTracker();
  const reasons = new Set<PauseReason>();
  let held: Axes = NO_AXES, sent: Axes = NO_AXES, lastTickTime: number | null = null;
  const driver = createTickDriver({ nowMs: deps.now }, deps.scheduler, (_tick, tickTimeMs) => {
    state.ships.forEach((s, i) => { const p = prev[i]!; p.x = s.x; p.y = s.y; p.h = s.heading + s.headingAcc; });
    sent = held;
    stepSoloFlight(state, sent);
    recordFeel(feel, state.ships[0], state.map.planet);
    lastTickTime = tickTimeMs;
  });
  const sync = (): void => driver.setPaused(reasons.size > 0);
  const alpha = (): number => lastTickTime === null ? 1 : Math.max(0, Math.min(1, (deps.now() - lastTickTime) * TICK_HZ / 1000));
  return {
    state, prev, camera, feel, alpha,
    axes: () => sent,
    frame(dt) {
      const k = deps.sampleKeys(), p = deps.samplePointer(), vp = deps.viewport;
      held = helmAxes(k);
      for (let n = 0; n < k.presses.pause; n++) { if (reasons.has('user')) reasons.delete('user'); else reasons.add('user'); }
      sync();
      if (k.presses.camera > 0) snapBack(camera);
      zoomBy(camera, vp, k.presses.zoomIn - k.presses.zoomOut);
      pan(camera, p.dragX, p.dragY);   // before the wheel: pan clears the zoom anchor, so a drag and a wheel in one frame still zoom about the cursor
      zoomBy(camera, vp, wheelNotches(p.wheel), p.x !== null && p.y !== null ? { x: p.x, y: p.y } : null);
      updateCamera(camera, vp, dt, followTarget(state, prev, alpha(), camera.follow));
    },
    pause(reason) { reasons.add(reason); sync(); },
    resume(reason) { reasons.delete(reason); sync(); },
    paused: () => reasons.size > 0,
    reasons: () => reasons,
    dispose() { driver.dispose(); }
  };
}
```

Create `src/renderer/src/app/duel/mode.ts`:

```ts
// The launch mode (H-1 spec §3): `?mode=flight` starts the dev flight view; anything else, or none, starts today's
// sector game unchanged. H-1b adds `duel`. `?seed=<n>` overrides the default seed.
export type AppMode = 'sector' | 'flight';
export const DEFAULT_SEED = 2026;

export function readMode(search: string): AppMode {
  return new URLSearchParams(search).get('mode') === 'flight' ? 'flight' : 'sector';
}

/** A whole number from 0 to 2^31 − 1, or the default. */
export function readSeed(search: string, fallback = DEFAULT_SEED): number {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  return n <= 0x7fffffff ? n : fallback;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/flightRuntime.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Write the boot, `main.ts`, the Electron main and the script**

Create `src/renderer/src/app/duel/flightMode.ts`:

```ts
// The dev flight view's boot (H-1 spec §3, §9): reuses the renderer's Pixi application, stage and letterbox, hides the
// sector children, and adds the Helm map view with the feel panel. The sector session is never created in this mode.
import { Container } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { Renderer } from '../../render/renderer';
import { computeLetterbox } from '../../render/letterbox';
import { createFeelPanel, FEEL_PANEL_MARGIN, FEEL_PANEL_W } from '../../render/tactical/feelPanel';
import { feelReadout, feelRows } from '../../render/tactical/feelModel';
import { createTacticalLayer } from '../../render/tactical/tacticalLayer';
import { tacticalModel } from '../../render/tactical/tacticalModel';
import { createDuelKeyboard, createPointerSource, type EventSource } from './input';
import { createFlightRuntime } from './runtime';

export interface FlightModeDeps {
  renderer: Renderer;
  seed: number;
  /** The preload bridge's suspend and resume hooks, when present. */
  lifecycle?: { onSuspend(cb: () => void): void; onResume(cb: () => void): void };
}

/** Screen pixels on the right that the off-screen arrows keep clear of: the feel panel and its margins. */
export const FLIGHT_RESERVE_RIGHT = FEEL_PANEL_W + 2 * FEEL_PANEL_MARGIN;

export function startFlightMode(deps: FlightModeDeps): () => void {
  const { renderer } = deps, viewport = { w: INTERNAL_W, h: INTERNAL_H };
  for (const child of renderer.app.stage.children) child.visible = false;   // world, enemy window, projectiles, callouts, HUD
  const scene = new Container();
  const layer = createTacticalLayer({ fontFamily: renderer.assets.fontFamily, viewport, seed: deps.seed });
  const panel = createFeelPanel({ fontFamily: renderer.assets.fontFamily, x: INTERNAL_W - FEEL_PANEL_W - FEEL_PANEL_MARGIN, y: FEEL_PANEL_MARGIN });
  scene.addChild(layer.container, panel.container);
  renderer.app.stage.addChild(scene);

  const canvas = renderer.app.canvas;
  const keyboard = createDuelKeyboard(window as unknown as EventSource);
  const pointer = createPointerSource(canvas as unknown as EventSource, (cx, cy) => {
    const rect = canvas.getBoundingClientRect(), lb = computeLetterbox(rect.width, rect.height, INTERNAL_W, INTERNAL_H);
    return { x: (cx - rect.left - lb.offsetX) / lb.scale, y: (cy - rect.top - lb.offsetY) / lb.scale };
  });
  const runtime = createFlightRuntime({
    now: () => performance.now(),
    scheduler: { schedule(delay, cb) { const timer = window.setTimeout(cb, delay); return () => window.clearTimeout(timer); } },
    sampleKeys: () => keyboard.sample(), samplePointer: () => pointer.sample(),
    seed: deps.seed, viewport
  });

  const onBlur = (): void => runtime.pause('blur');
  const onFocus = (): void => runtime.resume('blur');
  const onVisibility = (): void => { if (document.hidden) runtime.pause('hidden'); else runtime.resume('hidden'); };
  window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  deps.lifecycle?.onSuspend(() => runtime.pause('suspend'));
  deps.lifecycle?.onResume(() => runtime.resume('suspend'));

  const frame = (ticker: { deltaMS: number }): void => {
    runtime.frame(Math.min(0.1, ticker.deltaMS / 1000));
    const ship = runtime.state.ships[0];
    layer.draw(tacticalModel({
      state: runtime.state, prev: runtime.prev, alpha: runtime.alpha(), camera: runtime.camera, viewport, console: 'helm',
      axes: runtime.axes(), ships: [0], paused: runtime.reasons().has('user'), reserveRight: FLIGHT_RESERVE_RIGHT
    }));
    panel.draw(feelRows(feelReadout(runtime.feel, ship, runtime.state.map.planet)));
  };
  renderer.app.ticker.add(frame);

  const dispose = (): void => {
    renderer.app.ticker.remove(frame);
    window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
    keyboard.destroy(); pointer.destroy(); runtime.dispose();
  };
  window.addEventListener('beforeunload', dispose, { once: true });
  return dispose;
}
```

Replace the whole of `src/renderer/src/main.ts` with (the body of `startSector` is today's `start`, unchanged):

```ts
import cutter from './sim/ship/cutter.json';
import skiff from './sim/ship/skiff.json';
import { shipForCrew } from './sim/ship/fleet';
import { parseShip } from './sim/ship/schema';
import { loadAssets } from './render/assets';
import { createRenderer } from './render/renderer';
import { createHud } from './render/hud';
import { createKeyboardSources, sampleGamepads } from './input/sources';
import { createSession } from './app/session';
import { appendTelemetry } from './app/telemetryStore';
import { loadProgress, saveProgress } from './app/progressStore';
import { createAudio } from './app/audio';
import { EMPTY_PROGRESS } from './sim/progress';
import { CREDITS } from './render/credits.generated';
import { readMode, readSeed } from './app/duel/mode';
import { startFlightMode } from './app/duel/flightMode';

declare global { interface Window { ftlite?: { onSuspend(cb: () => void): void; onResume(cb: () => void): void } } }

/** Startup failures (invalid ship, invalid manifest, missing required asset) stop here with the message on screen (spec §7, parent §9). */
function showFatal(err: unknown): void {
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f88;background:#000;margin:0;padding:16px;font:14px monospace;white-space:pre-wrap';
  pre.textContent = `FTLite cannot start.

${err instanceof Error ? err.message : String(err)}`;
  document.body.replaceChildren(pre);
}

/** Today's sector game (unchanged; H-1 spec §3: the default mode). */
async function startSector(): Promise<void> {
  const ships = { cutter: parseShip(cutter), skiff: parseShip(skiff) };   // throws with a clear message on invalid ship data (spec §9)
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  const hud = createHud(renderer.hud, assets);
  const keyboard = createKeyboardSources(window);
  const audio = createAudio();
  const session = createSession({
    layout: (players) => ships[shipForCrew(players)],   // the Skiff for one or two, the cutter for three or four (spec Demo-x-a section 3)
    sampleDevices: () => [...keyboard.sample(), ...sampleGamepads()],
    renderer, hud,
    now: () => performance.now(),
    scheduler: { schedule(delay, cb) { const timer = window.setTimeout(cb, delay); return () => window.clearTimeout(timer); } },
    canResume: () => !document.hidden && document.hasFocus(),
    credits: CREDITS,
    playCue: audio.play,
    saveCrash: (payload) => { try { localStorage.setItem('ftlite-crash', JSON.stringify(payload)); } catch { /* storage unavailable */ } },
    saveTelemetry: (record) => { try { appendTelemetry(localStorage, record); } catch { /* storage denied: evaluating localStorage itself can throw, and the callback runs inside the session's sim-fault try */ } },
    loadProgress: () => { try { return loadProgress(localStorage); } catch { return EMPTY_PROGRESS; } },
    saveProgress: (p) => { try { saveProgress(localStorage, p); } catch { /* storage denied */ } }
  });
  const resize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize); resize();
  const unlockOnce = (): void => audio.unlock();   // first gesture (and every focus) resumes a suspended AudioContext; guarded inside
  window.addEventListener('keydown', unlockOnce, { once: true }); window.addEventListener('pointerdown', unlockOnce, { once: true }); window.addEventListener('focus', unlockOnce);
  window.addEventListener('blur', () => session.pause('blur'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) session.pause('hidden'); else session.resume('visible'); });
  window.addEventListener('focus', () => session.resume('focus'));
  window.ftlite?.onSuspend(() => session.pause('os-suspend'));
  window.ftlite?.onResume(() => session.resume('os-resume'));
  renderer.app.ticker.add(() => session.frame());
  window.addEventListener('beforeunload', () => session.dispose(), { once: true });
}

/** The dev flight view (H-1 spec §9): the renderer and its letterbox, but no sector session. */
async function startFlight(seed: number): Promise<void> {
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  const resize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize); resize();
  startFlightMode({ renderer, seed, lifecycle: window.ftlite });
}

/** One mode per launch (H-1 spec §3): `?mode=flight`, or today's sector game. */
function start(): Promise<void> {
  return readMode(location.search) === 'flight' ? startFlight(readSeed(location.search)) : startSector();
}
start().catch(showFatal);
```

Replace the whole of `src/main/index.ts` with:

```ts
import { app, BrowserWindow, Menu, powerMonitor } from 'electron';
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
      devTools: !packaged,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });
  powerMonitor.on('suspend', () => win.webContents.send('app:suspend'));
  powerMonitor.on('resume', () => win.webContents.send('app:resume'));
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // FTLITE_MODE (H-1 spec §3): `flight` opens the dev flight view; the renderer reads it as `?mode=`.
  const mode = process.env['FTLITE_MODE'];
  if (process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL']);
    if (mode) url.searchParams.set('mode', mode);
    win.loadURL(url.toString());
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), mode ? { query: { mode } } : undefined);
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { app.quit(); });
```

Create `scripts/dev-mode.ts`:

```ts
// `npm run dev:flight` (H-1 spec §3): runs `electron-vite dev` with FTLITE_MODE set, the same on Windows and elsewhere
// (npm scripts cannot set an environment variable portably without a dependency).
import { spawn } from 'node:child_process';

const mode = process.argv[2];
if (!mode) { console.error('usage: tsx scripts/dev-mode.ts <mode>'); process.exit(2); }
const child = spawn('electron-vite', ['dev'], { stdio: 'inherit', shell: true, env: { ...process.env, FTLITE_MODE: mode } });
child.on('exit', (code) => process.exit(code ?? 1));
```

Replace the whole of `package.json` with (only the `dev:flight` line is new):

```json
{
  "name": "ftlite",
  "version": "0.0.1",
  "private": true,
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "dev:flight": "tsx scripts/dev-mode.ts flight",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:determinism": "tsx scripts/determinism/run.ts",
    "typecheck": "tsc -b",
    "bless": "tsx scripts/bless-golden.ts",
    "acceptance": "tsx scripts/acceptance.ts",
    "credits": "tsx scripts/gen-credits.ts",
    "gen:headings": "tsx scripts/gen-headings.ts",
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

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npm run typecheck`
Expected: exit 0 (both projects: `src/main/index.ts` is in the node project).

Run: `npm test`
Expected: every file passes, 1,872 tests and 1 skipped (see the known flakes in Global Constraints).

- [ ] **Step 7: Check that it renders (manual, outside the repo)**

Run: `npm run build`, then launch the built app with `FTLITE_MODE=flight` (PowerShell: `$env:FTLITE_MODE='flight'; npx electron .`; Git Bash: `FTLITE_MODE=flight npx electron .`). Alternatively, use the visual-check method: `playwright-core@1.48.2` installed in a folder outside the repo, `_electron.launch({ executablePath: '<repo>/node_modules/electron/dist/electron.exe', args: ['<repo>'], env: { ...process.env, FTLITE_MODE: 'flight' } })`, then `page.screenshot`.

Expected:
- the page URL ends `index.html?mode=flight`;
- the screen shows the cyan ship inside the bearing ring, the green predicted path and the amber velocity line;
- the lettered grid with column letters along the top and row numbers down the left;
- the blue contour rings, the red map edge, and the belt asteroids with their gaps;
- "ZOOM 0.50" and a "250 u" scale bar bottom-left, and the FLIGHT FEEL panel top-right;
- W and A/D fly the ship, and the stars drift slowly against its motion (parallax); `−` twelve times shows the whole map (letters A to L, rows 1 to 12, the planet, three contours, the belt with three gaps and the three clusters);
- a right-drag shows "C: SNAP BACK", C recentres, and Escape shows "PAUSED   ESC: RESUME".

The 7 `ERR_FILE_NOT_FOUND` console errors (optional art such as `art/tiles/breach.png`) appear in the sector mode too and are not from this plan. Also launch without `FTLITE_MODE` and confirm the sector lobby is unchanged. Delete any scratch files; commit nothing from this step.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/app/duel/runtime.ts src/renderer/src/app/duel/mode.ts src/renderer/src/app/duel/flightMode.ts src/renderer/src/main.ts src/main/index.ts scripts/dev-mode.ts package.json tests/flightRuntime.test.ts
git commit -m "feat(helm): the dev flight view, ?mode=flight and npm run dev:flight (Helm H-1a)"
```

(End the message with your session's Co-Authored-By trailer.)

---

## After H-1a

- **The owner's acceptance (spec §12, H-1a):** `npm run dev:flight`. Turn, thrust and coast; stabilise kills a skid; orbit and slingshot past the planet at r ≈ 150. Check the feel targets of parent §6 against the feel panel: thread a gap within 15 s from a standstill near the belt; a slingshot turns more than 90° and leaves faster; a 60 u/s skid stops within about 1 s. Tune in `sim/tactical/tuning.ts` and restart.
- **H-1b** builds on this plan's pieces unchanged:
  - `createDuelKeyboard` already maps every §5 action;
  - `tacticalModel` takes `console: 'weapons'` and `ships: [0, 1]`;
  - the camera has `follow: 'missile'` and `followBody`;
  - `readMode` gains `'duel'`, and `package.json` gains `dev:duel`.
