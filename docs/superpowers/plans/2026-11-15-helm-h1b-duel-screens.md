# Helm Demo H-1b: The Solo Duel Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can play the Helm demo's duel for the first time, alone, on one computer. `npm run dev:duel` (or a production build launched with `FTLITE_MODE=duel`) opens the duel at the Helm. Tab switches to the gunner: Space charges and fires the laser, E and Q cycle the lock, F launches a missile and A/D steer it. X stands up into the FTL-style interior of the Cutter, where a damaged room is tinted and marked and holding E repairs it; E at a free role console sits again. A readout column shows both hulls, the shields, the room damage and repair, the Weapons extras and the other character. Laser beams, missile bursts and contact sparks play on the map views, and a hit on the crew ship shakes the screen. The duel ends in victory, defeat or both ships lost, and Enter starts the next duel with seed + 1.

**Architecture:** No sim change. Everything is renderer code outside the determinism-guarded roots, on top of H-1a:
- the interior view (`render/duel/interiorView.ts`), composed from today's interior layers, and its pure overlay and fit (`interiorModel.ts`);
- the pure missile-path predictor (`render/tactical/missilePath.ts`), view effects (`fxModel.ts`) and combat draw lists (`weaponsModel.ts`), drawn by H-1a's tactical layer, which gains a second `draw` argument;
- the pure duel controls (`app/duel/controls.ts`): what the active character can do where it stands, mirroring the sim's own rules;
- the readout column and the end screen (`render/duel/readoutModel.ts`, `readoutPanel.ts`, `endScreen.ts`);
- the duel runtime (`createDuelRuntime` in `app/duel/runtime.ts`), headless-testable, beside the flight runtime, sharing its pacer and camera input;
- the duel boot (`app/duel/duelMode.ts`), `?mode=duel` and `npm run dev:duel`.

**Nothing touches `net/contracts.ts`, `authority/`, `sim/duel/` or `sim/tactical/`.** The predictor runs the sim's own `flyMissile` on a copy; the controls read the duel state with the sim's own helpers (`roomAt`, `inReachOfTile`).

**Tech Stack:** TypeScript 5.8 (strict, `noUncheckedIndexedAccess`), Pixi.js 8.19, electron-vite 5, Vitest 3.2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-14-helm-h1-views-design.md` (H-1 views), H-1b row of §11: §3 the `duel` mode, §4 the runtime (solo start rule, tick numbers, interpolation, pause reasons, end, restart, events), §5 duel commands and Tab presence, §7 items 6 to 9 (missiles and trails, the Weapons layer, the lock marker on both consoles, the missile-path predictor, effects and contact sparks, the readout with both hulls), §8 the interior view, readouts and shake, §10 the allocation test, §12 H-1b acceptance, §13 risk 1. Parent: `docs/superpowers/specs/2026-11-14-helm-demo-design.md` §7 (weapons and the state-transition table), §8 (interior and repair), §10 (console map views), §11a (solo playtesting), §12 (look).

## Scope

- **Task 1:** the interior view, rendered from a duel through today's interior layers (spec §13 risk 1 first), with the damage overlay and the duel's fit.
- **Task 2:** the missile-path predictor, the view effects and trails, the combat draw lists (Weapons layer, lock marker, missiles), and the tactical layer drawing them; `reset()` now hides every text; `reseed()` redraws the stars for a restart; crowded off-screen arrows spread apart in the duel views (opt-in, so the flight view is unchanged).
- **Task 3:** the duel controls (seat, repair in reach, console in reach, lock cycle) and two tightened H-1a tests.
- **Task 4:** the readout column (both hulls, shields, rooms and repair, Weapons extras, the other character, the outside strip) and the end screen.
- **Task 5:** the duel runtime: the solo start rule, Tab presence, every §5 command, the blur release, contact sparks, pause reasons, end and restart.
- **Task 6:** the duel boot, `?mode=duel`, `main.ts`, `dev:duel`, and the screenshot check.
- **Not here:** the authority (H-0c-ii: the runtime's stepping moves to the loopback authority, everything above it stays); gamepads and the networked demo (H-2); solo telemetry (parent §11a); sound.

No sector code changes behaviour and no `SIM_VERSION` bump is needed: nothing under `sim/` changes, so every golden stays as it is.

## Global Constraints

- Determinism guard (`tests/boundary.test.ts`, `tests/helpers/determinismGuard.ts`) scans `src/renderer/src/sim/**`, `authority`, `net`, `clientControl`, `headless`, `events` and `src/shared`. **This plan changes none of them.** Render and app code (`render/tactical/`, `render/duel/`, `app/duel/`) is not guarded and may use any `Math` (`Math.sin`, `Math.atan2`, `Math.acos`, `**`).
- Files under `sim/` may not import from `render` or `app`. The new code imports from `sim/` freely; nothing under `sim/` imports it. Render code does not import from `app/` (the runtime imports the readout's `OtherStatus` type from `render/duel/readoutModel.ts`, not the other way round).
- **No change to `net/contracts.ts`, `authority/`, `sim/duel/`, `sim/tactical/` or any sector behaviour.** `main.ts`'s sector and flight paths are unchanged; the flight runtime's behaviour is unchanged (its tests pass unedited, apart from the one `readMode` expectation Task 6 updates for `?mode=duel`).
- Tick rate 60, `DT` 1/60. Ship 0 is the crew's ship, ship 1 the hunter's. Player 0 starts at Navigation (the Helm), player 1 at Weapons. Cutter stations: `d.nav`, `d.weapons`; repair points in `sim/duel/tuning.ts` (Weapons 8,7 in W; Shields 16,8 in R; Engines 2,6 in E).
- Commands carry `requestedTick = d.interior.tick` (the duel's own tick, which `stepDuelTick` checks), stamped when the tick runs, with a per-player sequence from 0 that a restart resets.
- Every new display object is created when its layer is created, or on the reused interior layers' first draw (warm-up). A frame only clears and redraws `Graphics` and sets `BitmapText` text, position, tint and visibility. Each task with a layer tests this: 2 warm-up frames, then 60 steady frames, and the display-object count does not change.
- Commit with explicit paths only (`git add <paths>`), never `git add -A` or `git add .`: the owner keeps unrelated uncommitted files in this checkout. End every commit message with the Co-Authored-By trailer your own session instructs.
- Run single test files with `npx vitest run <file>`. The full suite is `npm test` (1,925 tests and 1 skipped after this plan; 1,876 and 1 skipped before it). Typecheck is `npm run typecheck` (`tsc -b`, both the web and the node projects).
- Known flakes: `tests/authorityBoundary.test.ts` and `tests/run.test.ts` can time out under full-suite load. If one fails in `npm test`, rerun it alone; it is unrelated to this plan.
- Line endings: write files with LF. The repository normalises on commit (`core.autocrlf`).

## Decisions the plan makes inside the spec

Each is marked **(rec.)** in the spec's sense: the recommendation, taken under the standing order, which the owner can overturn.

1. **Task order** **(rec.)**: the interior view comes first, rendered from a real duel through today's layers in a layer test (spec §13 risk 1). The prototype found no blocker: the layers draw a duel's `SimState` as they draw a sector one, with every optional feature falling back to `Graphics` in node.
2. **The interior view** **(rec.)**:
   - Composed in renderer order (tiles, effects below, room icons, desks, the duel's damage tint, crew, boarders, effects above, then the markers and labels). The magazine layer, enemy window, projectiles, callouts and HUD are left out.
   - The fit band is the screen left of the 220-px readout column (1060 × 720): the 29 × 13 Cutter (928 × 416 px) sits at 1× at (66, 152).
   - A damaged tactical room tints its repair room's tiles (amber at level 1, red at level 2, alpha 0.28), with a diamond on the repair tile, a progress pie that fills while progress is above 0 (it is kept when the repairer lets go), and a label such as `SHIELDS 1`.
   - The two role consoles are outlined: amber when free, dim when occupied.
   - The view owns its `RenderMemory`. The runtime keeps each character's position before the last tick (`crewPrev`), and the view copies it into `memory.prev` before drawing, so the crew interpolate as in the sector game. A restart destroys the view and builds a new one (spec §4).
3. **Missiles and trails** **(rec.)**: missiles are 6-px triangles, cyan for the crew's and red for the hunter's, drawn at the position interpolated from the previous tick. A trail is the last 30 drawn positions (one per frame while the missile moves), fading toward the tail, and clears when the missile ends.
4. **The Weapons layer** **(rec.)**:
   - The bearing ring as at the Helm (zoom ≥ 0.3).
   - The own laser arc (±60°, radius 450 × zoom) filled faintly, brighter while the laser would hit now, and the enemy's arc dimmer. Arcs use the interpolated continuous heading. They show only at Weapons.
   - A line at the top centre: `ENEMY BRG 266  RNG 3240  NO SHOT`, or `IN ARC` (green) when `laserEligible` holds (arc, range and line of sight). The spec asks for the bearing and range; the shot state is added so the release can be timed.
   - In missile mode, the missile's predicted path (amber, a point every 4 ticks) from its drawn position.
5. **The lock marker** **(rec.)**: four corner brackets on the centre of the enemy's locked room segment (on the chevron when the ship is drawn as one), and `LOCK SHIELDS` beside the enemy, on both consoles (parent §7a).
6. **The missile-path predictor** follows spec §7's contract by running the sim's own `flyMissile` on a shallow copy of the state with a copy of the missile, so it is exact by construction. It stops at the first planet or asteroid contact (`touchesSolid` with the missile radius), at the map edge or at expiry, keeping the final point; the last tick of the horizon is always included.
7. **Effects** **(rec.)**: a laser shot draws a 3-px beam for 0.15 s (white on a hit, grey on a miss); a missile ending draws a growing ring for 0.3 s; a contact draws a four-line spark for 0.3 s (orange planet, grey asteroid, white ship) at the ship's position after the tick. The runtime detects contacts by comparing each ship's `planetHits`, `asteroidHits` and `shipHits` with the previous tick's.
8. **Shake** **(rec.)**: a hit on the crew ship (an enemy laser hit, including one that only strips a shield layer, or any missile landing on ship 0) starts a 6-px decaying wobble for 0.2 s. It moves the whole scene (map view or interior, and the readout) but not the pause banner or the end card.
9. **The readout column** **(rec.)**: one panel, 204 px wide with 8-px margins (the 220-px column), on both consoles and in the interior; the consoles keep 220 px clear for the off-screen arrows. Rows: the screen's name; CUTTER hull, shield pips, the three rooms (`OK`, `DMG 1`, `DMG 2`, with a repair-progress bar); HUNTER hull, shield pips, `ROOMS W0 S2 E1`; at Weapons, `LOCK`, `CHARGE` with a bar (`52%`, `HOLD 2.4` at full, `FROZEN` while a missile flies) and `MAG 3/4 FLYING`; the other character. Key help sits under the rows.
10. **The other character's status** **(rec.)**: two rows, `OTHER PRESENT` or `AWAY`, then where it is (`AT HELM`, `AT WEAPONS`, `WALKING`, `REPAIRING`). In solo the other character is always away (spec §4), so `AWAY` alone would say nothing; where it is matters.
11. **The outside strip, shortened to fit** **(rec.)**: spec §8's texts do not fit a 220-px column at the HUD's text scale (2× m5x7). The strip reads `HELM CREWED` or `HELM EMPTY` with `COASTING` under it, `WEAPONS CREWED` or `EMPTY`, `ENEMY <distance>`, `BEARING <nnn>`, and `MISSILE INBOUND` (red) while the hunter's missile is within 600. "Crewed" means a present character is seated there, which in solo is never the other character; a test checks that every row fits.
12. **Commands** (spec §5) **(rec.)**:
    - The runtime samples the keyboard once per frame and queues commands; each tick takes the queue, stamped with the duel's tick and per-player sequences. Tick 0 of every duel puts player 1's `presence {present: false}` first (sequence 0).
    - Standing, an E press sits at the free role console in reach (`consoleInReach`, today's sit rule) only when no repair is in reach (`repairInReach`, the sim's own rule, first damaged room in Room order).
    - E and Q at Weapons build on the last lock queued this frame, or the ship's lock, and queue one `laserLock` with the net result.
    - Space down and up in one frame are ordered by the final held state (a tap queues down, then up: a discard).
    - A frame with Tab ignores that frame's other press edges. Tab queues `presence false` for the character left, then `presence true` for the one taken, clears the keyboard (and the pointer's pending wheel and drag), and the old character's held input is neutral from that tick.
    - **Seat changes wait for the Tab's presence tick** (Codex plan review): `stepDuelTick` checks sits and stands against presence before it applies that tick's presence commands, so an X or E press queued after a Tab but before the next tick would be rejected (the newly taken character is still away). The runtime holds such `sit` and `stand` commands back until the tick that sends the Tab's presence has run, then sends them on the following tick. Weapon commands need no hold: the sim checks them against the seats after the presence phase.
    - While paused, press edges other than Escape are dropped (the camera still zooms and pans). Enter on the end screen restarts even while paused.
13. **The blur release** (the H-1a final review's carry-over) **(rec.)**: the runtime remembers that it sent `laserCharge {held: true}`. On the first unpaused frame at Weapons where Space is not held and no release edge came (a blur cleared the keyboard), it sends `laserCharge {held: false}`, which fires a full charge or discards a partial one, as releasing Space would. Tab and X send nothing: the sim lets go of Fire without firing when the console becomes unattended (parent §7 table).
14. **Cameras** **(rec.)**: one camera per console, both followed every frame (so a console left behind still follows the ship), but only the active console's camera takes zoom and pan. At the Helm C snaps back. At Weapons C toggles between ship and missile while one flies (otherwise it snaps back to the ship); when the followed missile ends the camera eases back to the ship.
15. **End and restart** **(rec.)**: when the outcome is decided the runtime stops its driver. The map view stays drawn under an end card: `VICTORY`, `DEFEAT` or `BOTH SHIPS LOST`, `DUEL LENGTH m:ss` (from tactical ticks) and `ENTER: NEW DUEL (SEED n+1)`. Enter disposes the duel, creates the next with seed + 1 and a fresh driver (a fresh tick epoch: no catch-up for the time spent on the end card), resets the cameras, sequences, queued and held-back commands and events, and clears the keyboard. The runtime exposes `epoch()`; the boot sees it change and resets the effects, the tactical layer (`reset()`), its star field (`reseed(runtime.seed)`, so the next duel's stars come from its own seed; Codex plan review) and the interior view. Pause reasons survive a restart.
16. **Shared runtime pieces**: `runtime.ts` extracts the pause-reason pacer (a pause discards the driver, resume creates a fresh one) and the per-frame camera input (zoom keys, drag before wheel, the wheel accumulator) from H-1a's flight runtime and uses them for both runtimes. The flight runtime behaves exactly as before.
17. **`dev:duel`** runs `tsx scripts/dev-mode.ts duel` (H-1a's script). `readMode` returns `'duel'` only for exactly `?mode=duel`.
18. **Crowded off-screen arrows** (found by the prototype's screenshots): with the enemy's arrow added, the enemy and the planet often lie the same way from the ship, and their labels overlapped on the screen edge. `spreadArrows` moves an arrow that crowds an earlier one on the same edge along it, toward the edge's middle: 20 px apart on the left and right edges (labels sit beside the arrows), 110 px on the top and bottom (labels sit under or over them). It runs only when the model input sets `spreadArrows: true`, which only the duel boot does: the flight view keeps H-1a's arrow positions exactly (Codex plan review; a test checks it).
19. **The damage marker's colours** **(rec.)**: the room tint is amber or red, and the diamond, pie edge and label use darker shades of both (`0x8a5a00`, `0xa8281c`), because amber text on the light floor and the amber tint did not read in the prototype's screenshots.

## File structure

| File | Responsibility |
|---|---|
| `src/renderer/src/render/duel/interiorModel.ts` | **Create:** `duelFit`, `interiorOverlay`, `ROOM_NAMES`, `READOUT_COLUMN` |
| `src/renderer/src/render/duel/interiorView.ts` | **Create:** the interior view from today's layers |
| `src/renderer/src/render/tactical/missilePath.ts` | **Create:** `predictMissilePath` |
| `src/renderer/src/render/tactical/fxModel.ts` | **Create:** view events, effects, shake, trails |
| `src/renderer/src/render/tactical/weaponsModel.ts` | **Create:** `combatModel` (Weapons layer, lock, missiles, effects) |
| `src/renderer/src/render/tactical/tacticalModel.ts` | **Replace:** `ringDraw` exported; crowded off-screen arrows spread apart (`spreadArrows`) when the input asks for it (the duel views only) |
| `src/renderer/src/render/tactical/tacticalLayer.ts` | **Replace:** draws a `CombatDraw`; `reset()` hides every text and clears every drawing; `reseed(seed)` redraws the star field for a restart |
| `src/renderer/src/app/duel/controls.ts` | **Create:** `seatOf`, `repairInReach`, `consoleInReach`, `cycleLock` |
| `src/renderer/src/render/duel/readoutModel.ts` | **Create:** `readoutRows`, `readoutHelp` |
| `src/renderer/src/render/duel/readoutPanel.ts` | **Create:** the readout panel |
| `src/renderer/src/render/duel/endScreen.ts` | **Create:** `endModel` and the end card |
| `src/renderer/src/app/duel/runtime.ts` | **Replace:** the shared pacer and camera input; `createDuelRuntime` |
| `src/renderer/src/app/duel/duelMode.ts` | **Create:** `startDuelMode`, the browser wiring |
| `src/renderer/src/app/duel/mode.ts` | **Replace:** `readMode` gains `'duel'` |
| `src/renderer/src/main.ts` | **Replace:** `startDuel`, the three-way mode switch |
| `src/main/index.ts` | **Replace:** the `FTLITE_MODE` comment names `duel` (only change) |
| `package.json` | **Replace:** adds `dev:duel` |
| `tests/duelInterior.test.ts`, `tests/duelWeaponsView.test.ts`, `tests/duelControls.test.ts`, `tests/duelReadout.test.ts`, `tests/duelRuntime.test.ts` | **Create:** the tests |
| `tests/tacticalCamera.test.ts`, `tests/duelInput.test.ts`, `tests/flightRuntime.test.ts` | **Replace:** two tightened H-1a tests; the `readMode` expectation for `?mode=duel` |

---

### Task 1: The interior view

**Files:**
- Create: `src/renderer/src/render/duel/interiorModel.ts`, `src/renderer/src/render/duel/interiorView.ts`
- Create: `tests/duelInterior.test.ts`

**Interfaces:**
- Consumes: `createDuel`, `disposeDuel`, `DuelState` (`sim/duel/state.ts`), `stepDuelTick`, `REPAIR_UNITS`; today's `createTileLayer`, `createEffectsLayer`, `createIconLayer`, `createConsoleLayer`, `createCrewLayer`, `createBoarderLayer`, `createRenderMemory`, `GameAssets`, all unchanged.
- Produces:
  - `interiorModel.ts`: `READOUT_COLUMN` (220); `INTERIOR_BAND` (`{ x: 0, y: 0, w: 1060, h: 720 }`); `duelFit(widthTiles: number, heightTiles: number): { scale: number; x: number; y: number }`; `ROOM_NAMES: readonly string[]` (`['WEAPONS', 'SHIELDS', 'ENGINES']`); `interface RoomTint`, `RepairMarker`, `ConsoleOutline`, `InteriorOverlay`; `interiorOverlay(d: DuelState): InteriorOverlay`.
  - `interiorView.ts`: `interface InteriorView { container: Container; world: Container; memory: RenderMemory; draw(d: DuelState, crewPrev: readonly { x: number; y: number }[], alpha: number, dt: number): void; destroy(): void }`; `createInteriorView(assets: GameAssets): InteriorView`.

- [ ] **Step 1: Write the failing test**

Create `tests/duelInterior.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position, Stable } from '../src/renderer/src/sim/components';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { REPAIR_UNITS } from '../src/renderer/src/sim/duel/tuning';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { duelFit, interiorOverlay, INTERIOR_BAND, READOUT_COLUMN } from '../src/renderer/src/render/duel/interiorModel';
import { createInteriorView } from '../src/renderer/src/render/duel/interiorView';
import { TILE_PX } from '../src/shared/resolution';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
/** Assets with every optional feature missing, so each layer draws its Graphics fallback (no textures in node). */
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
let seq = 0;
const step = (d: DuelState, commands: { player: number; command: Parameters<typeof stepDuelTick>[1]['commands'][number]['command'] }[] = [], held: HeldInput[] = [NONE, NONE]) =>
  stepDuelTick(d, { held, commands: commands.map((c) => ({ id: { player: c.player, sequence: ++seq }, requestedTick: d.interior.tick, command: c.command })) });
const crewAt = (d: DuelState) => d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));

describe('the duel interior through the reused interior layers (H-1 spec §8, §13 risk 1)', () => {
  it('draws a duel interior: tiles, desks, both crew and the damage overlay, fitted left of the readout column', () => {
    const d = createDuel(layout, 5), view = createInteriorView(assets);
    d.tactical.ships[0].rooms[Room.Shields] = 2;
    view.draw(d, crewAt(d), 1, 1 / 60);
    const fit = duelFit(d.interior.derived.width, d.interior.derived.height);
    expect(fit).toEqual({ scale: 1, x: 66, y: 152 });   // the 29 × 13 Cutter is 928 × 416 px: centred in 1060 × 720, never upscaled
    expect([view.world.x, view.world.y, view.world.scale.x]).toEqual([66, 152, 1]);
    expect(fit.x + 29 * TILE_PX).toBeLessThanOrEqual(INTERIOR_BAND.w);
    expect(INTERIOR_BAND.w).toBe(1280 - READOUT_COLUMN);
    expect(count(view.container)).toBeGreaterThan(10);
    for (const eid of d.interior.crew) expect(view.memory.lastDrawn.get(Stable.id[eid]!)).toEqual({ x: Position.x[eid]!, y: Position.y[eid]! });
    view.destroy(); disposeDuel(d);
  });
  it('a warm-up of 2 frames, then 60 frames of walking, damage, repair and reseating add no display objects', () => {
    const d = createDuel(layout, 5), view = createInteriorView(assets);
    let prev = crewAt(d);
    const frame = (k: number): void => {
      prev = crewAt(d);
      if (k === 1) step(d, [{ player: 0, command: { kind: 'stand' } }]);
      else if (k === 20) { d.tactical.ships[0].rooms[Room.Engines] = 1; d.tactical.ships[0].rooms[Room.Weapons] = 2; step(d); }
      else if (k === 40) { d.repair[Room.Engines] = REPAIR_UNITS / 2; step(d, [{ player: 1, command: { kind: 'stand' } }]); }
      else if (k === 55) { d.tactical.ships[0].rooms[Room.Engines] = 0; d.tactical.ships[0].rooms[Room.Weapons] = 0; step(d); }
      else step(d, [], [{ moveX: -1, moveY: 0, interactHeld: false }, NONE]);
      view.draw(d, prev, 0.5, 1 / 60);
    };
    frame(0); frame(1);
    const n0 = count(view.container);
    for (let k = 2; k < 62; k++) frame(k);
    expect(count(view.container)).toBe(n0);
    view.destroy(); disposeDuel(d);
  });
  it('the overlay: damaged rooms tinted by level with a marker and progress; role consoles free or occupied', () => {
    const d = createDuel(layout, 5);
    expect(interiorOverlay(d).tints).toEqual([]);
    expect(interiorOverlay(d).consoles.map((c) => c.free)).toEqual([false, false]);   // player 0 at Navigation, player 1 at Weapons
    d.tactical.ships[0].rooms[Room.Shields] = 1; d.repair[Room.Shields] = REPAIR_UNITS / 4;
    step(d, [{ player: 1, command: { kind: 'stand' } }]);
    const o = interiorOverlay(d);
    expect(o.tints.map((t) => [t.tacticalRoom, t.level])).toEqual([[Room.Shields, 1]]);
    expect(o.tints[0]!.tiles.length).toBe(d.interior.derived.roomTiles[d.interior.derived.roomIndex.get('R')!]!.length);
    expect(o.markers).toEqual([{ tacticalRoom: Room.Shields, level: 1, x: 16.5 * TILE_PX, y: 8.5 * TILE_PX, progress: 0.25, label: 'SHIELDS 1' }]);
    expect(o.consoles.map((c) => [c.station, c.free])).toEqual([[d.nav, false], [d.weapons, true]]);
    disposeDuel(d);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/duelInterior.test.ts`
Expected: FAIL, "Error: Cannot find module '../src/renderer/src/render/duel/interiorModel' imported from '<repo>/tests/duelInterior.test.ts'" (the first import not yet written).

- [ ] **Step 3: Write the overlay model and the view**

Create `src/renderer/src/render/duel/interiorModel.ts`:

```ts
// The duel interior's overlay and fit (H-1 spec §8). Pure: no Pixi. Positions are ship-local pixels (TILE_PX per tile),
// drawn inside the interior's world container, which the fit scales and places.
import { INTERNAL_H, INTERNAL_W, TILE_PX } from '../../../../shared/resolution';
import type { DuelState } from '../../sim/duel/state';
import { REPAIR_UNITS } from '../../sim/duel/tuning';

/** The readout column on the right that the interior leaves clear (spec §8). */
export const READOUT_COLUMN = 220;
/** The band the ship is fitted into: the whole screen left of the readout column. */
export const INTERIOR_BAND = { x: 0, y: 0, w: INTERNAL_W - READOUT_COLUMN, h: INTERNAL_H } as const;

/** Today's worldFit rules on the duel's band: centred, whole pixels, never upscaled above 1×. */
export function duelFit(widthTiles: number, heightTiles: number): { scale: number; x: number; y: number } {
  const w = widthTiles * TILE_PX, h = heightTiles * TILE_PX, B = INTERIOR_BAND;
  const scale = Math.min(1, B.w / w, B.h / h);
  return { scale, x: Math.round(B.x + (B.w - w * scale) / 2), y: Math.round(B.y + (B.h - h * scale) / 2) };
}

/** The tactical rooms' names, in Room order (Weapons, Shields, Engines). */
export const ROOM_NAMES: readonly string[] = ['WEAPONS', 'SHIELDS', 'ENGINES'];

export interface RoomTint { tacticalRoom: number; level: number; tiles: { x: number; y: number }[] }
export interface RepairMarker { tacticalRoom: number; level: number; x: number; y: number; progress: number; label: string }
export interface ConsoleOutline { station: number; x: number; y: number; free: boolean }
export interface InteriorOverlay { tints: RoomTint[]; markers: RepairMarker[]; consoles: ConsoleOutline[] }

/**
 * Each damaged tactical room tints its repair room's tiles by level, with a marker on the repair tile and the progress
 * (0..1) toward lowering it one level; the two role consoles are outlined, free (highlighted) or occupied (dimmed).
 */
export function interiorOverlay(d: DuelState): InteriorOverlay {
  const st = d.interior, w = st.derived.width, ship = d.tactical.ships[0];
  const px = (t: number): { x: number; y: number } => { const tx = t % w; return { x: tx * TILE_PX, y: ((t - tx) / w) * TILE_PX }; };
  const tints: RoomTint[] = [], markers: RepairMarker[] = [];
  for (const p of d.points) {
    const level = ship.rooms[p.tacticalRoom]!;
    if (level === 0) continue;
    tints.push({ tacticalRoom: p.tacticalRoom, level, tiles: st.derived.roomTiles[p.room]!.map(px) });
    const at = px(p.tile);
    markers.push({ tacticalRoom: p.tacticalRoom, level, x: at.x + TILE_PX / 2, y: at.y + TILE_PX / 2, progress: d.repair[p.tacticalRoom]! / REPAIR_UNITS, label: `${ROOM_NAMES[p.tacticalRoom]} ${level}` });
  }
  const consoles = [d.nav, d.weapons].map((station) => {
    const at = px(st.derived.stationTile[station]!);
    return { station, x: at.x, y: at.y, free: st.stations.occupant[station]! < 0 };
  });
  return { tints, markers, consoles };
}
```

Create `src/renderer/src/render/duel/interiorView.ts`:

```ts
// The duel's interior view (H-1 spec §8): the Cutter drawn by today's interior layers (tiles, effects, room icons,
// consoles, crew, boarders), composed as render/renderer.ts composes them, without the sector enemy window, projectiles,
// callouts or HUD, plus the duel's damage overlay. It owns its RenderMemory; a restart destroys it and builds a new one.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { TILE_PX } from '../../../../shared/resolution';
import { Stable } from '../../sim/components';
import type { DuelState } from '../../sim/duel/state';
import type { GameAssets } from '../assets';
import { createBoarderLayer } from '../boarderLayer';
import { createConsoleLayer } from '../consoleLayer';
import { createCrewLayer } from '../crewSprites';
import { createEffectsLayer } from '../effects';
import { createRenderMemory, type RenderMemory } from '../memory';
import { createIconLayer } from '../roomIcons';
import { AMBER, DIM, FONT_NATIVE, TEXT, WARN } from '../theme';
import { createTileLayer } from '../tiles';
import { duelFit, interiorOverlay } from './interiorModel';

export interface InteriorView {
  container: Container;
  /** The ship's world container (scaled and placed by the fit), exposed for tests. */
  world: Container;
  memory: RenderMemory;
  /** `crewPrev`: each player's character position at the previous tick, in tiles, for interpolation. */
  draw(d: DuelState, crewPrev: readonly { x: number; y: number }[], alpha: number, dt: number): void;
  destroy(): void;
}

/** The room tint by damage level (amber, red), and darker shades of both for the marker and its label on the light floor. */
const TINT: readonly number[] = [0, AMBER, WARN], MARK: readonly number[] = [0, 0x8a5a00, 0xa8281c];

export function createInteriorView(assets: GameAssets): InteriorView {
  const container = new Container(), world = new Container();
  container.addChild(world);
  const memory = createRenderMemory();
  const tiles = createTileLayer(assets, memory), effects = createEffectsLayer(assets, memory), icons = createIconLayer();
  const desks = createConsoleLayer(), crew = createCrewLayer(assets, memory), boarders = createBoarderLayer(assets);
  const damage = new Graphics(), marks = new Graphics();
  const labels = Array.from({ length: 3 }, () => {
    const t = new BitmapText({ text: '', style: { fontFamily: assets.fontFamily, fontSize: FONT_NATIVE } });
    t.anchor.set(0.5, 0); t.roundPixels = true; t.visible = false; return t;
  });
  // Back to front as renderer.ts: tiles, effects below, room icons, desks, then the duel's damage tint under the crew,
  // crew, boarders (always empty in the duel), effects above, and the markers and labels on top.
  world.addChild(tiles.container, effects.below, icons.container, desks.container, damage, crew.container, boarders.container, effects.above, marks, ...labels);
  return {
    container, world, memory,
    draw(d, crewPrev, alpha, dt) {
      const st = d.interior, fit = duelFit(st.derived.width, st.derived.height);
      world.scale.set(fit.scale); world.position.set(fit.x, fit.y);
      st.crew.forEach((eid, pid) => { const p = crewPrev[pid]; if (p) memory.prev.set(Stable.id[eid]!, p); });
      tiles.update(st, dt); icons.update(st); desks.draw(st); effects.draw(st);
      const o = interiorOverlay(d);
      damage.clear(); marks.clear();
      for (const t of o.tints) for (const p of t.tiles) damage.rect(p.x, p.y, TILE_PX, TILE_PX).fill({ color: TINT[t.level]!, alpha: 0.28 });
      for (const c of o.consoles) marks.rect(c.x + 1, c.y + 1, TILE_PX - 2, TILE_PX - 2).stroke({ width: 2, color: c.free ? AMBER : DIM, alpha: c.free ? 0.95 : 0.4 });
      labels.forEach((t, k) => {
        const m = o.markers[k];
        t.visible = m !== undefined;
        if (!m) return;
        const colour = MARK[m.level]!, r = TILE_PX * 0.42;
        marks.poly([m.x, m.y - r, m.x + r, m.y, m.x, m.y + r, m.x - r, m.y]).stroke({ width: 2, color: colour });
        if (m.progress > 0) marks.moveTo(m.x, m.y).arc(m.x, m.y, r * 0.7, -Math.PI / 2, -Math.PI / 2 + m.progress * Math.PI * 2).closePath().fill({ color: TEXT, alpha: 0.8 });
        if (t.text !== m.label) t.text = m.label;
        t.tint = colour; t.position.set(Math.round(m.x), Math.round(m.y + TILE_PX * 0.5));
      });
      crew.draw(st, alpha);
      boarders.draw(st, dt);
    },
    destroy() { memory.reset(); container.destroy({ children: true }); }
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/duelInterior.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/duel/interiorModel.ts src/renderer/src/render/duel/interiorView.ts tests/duelInterior.test.ts
git commit -m "feat(helm): the duel interior view from today's interior layers, with the damage overlay (Helm H-1b)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 2: The missile-path predictor, the effects and the combat layer

**Files:**
- Create: `src/renderer/src/render/tactical/missilePath.ts`, `src/renderer/src/render/tactical/fxModel.ts`, `src/renderer/src/render/tactical/weaponsModel.ts`
- Replace: `src/renderer/src/render/tactical/tacticalModel.ts`, `src/renderer/src/render/tactical/tacticalLayer.ts`
- Create: `tests/duelWeaponsView.test.ts`

**Interfaces:**
- Consumes: `flyMissile`, `launchMissile` (`sim/tactical/missiles.ts`), `touchesSolid`, `PathPoint` (`sim/tactical/predict.ts`), `laserEligible`, `stepDuel`, `DuelEvent`, `Missile`, `TacticalState`, all unchanged; H-1a's camera, `tacticalModel`, `interpolatedShip`, `wedgeSegments`, `headingAngle`; Task 1's `ROOM_NAMES`.
- Produces:
  - `missilePath.ts`: `MISSILE_PATH_MAX_TICKS` (240), `MISSILE_PATH_STRIDE` (4); `predictMissilePath(state: TacticalState, missile: Missile, steer: number, stride?: number): PathPoint[]`.
  - `fxModel.ts`: `interface ContactEvent { kind: 'contact'; ship: number; body: 'planet' | 'asteroid' | 'ship'; x: number; y: number }`; `type ViewEvent = DuelEvent | ContactEvent`; `interface FxItem`, `FxState { items; shake; shakeT; trails: [Point[], Point[]] }`; `createFx()`, `resetFx(fx)`, `hitsCrew(e)`, `pushEvents(fx, events)`, `stepFx(fx, dt)`, `shakeOffset(fx): Point`, `interpolatedMissile(state, missilePrev, alpha, i): PrevBody | null`, `recordTrails(fx, state, missilePrev, alpha)`; constants `BEAM_S`, `BURST_S`, `SPARK_S`, `SHAKE_S`, `SHAKE_PX`, `TRAIL_POINTS`, `BEAM_HIT`, `BEAM_MISS`, `BURST`, `SPARK`.
  - `weaponsModel.ts`: `ARC_HALF`; `interface ArcDraw`, `WeaponsDraw`, `LockDraw`, `MissileDraw`, `EffectDraw`, `CombatDraw { weapons; lock; missiles; effects }`; `interface CombatModelInput extends TacticalModelInput { missilePrev; steer; fx }`; `bearingDeg(dx, dy): number`; `segmentCentre(room): { f: number; s: number }`; `combatModel(input: CombatModelInput): CombatDraw`.
  - `tacticalModel.ts`: `ringDraw(x: number, y: number): RingDraw` is exported (previously private); `ARROW_GAP_SIDE` (20), `ARROW_GAP_TOP` (110); `spreadArrows(arrows: ArrowDraw[], vp: Viewport, reserveRight: number): void`; `TacticalModelInput` gains `spreadArrows?: boolean` (default off: the flight view's arrows stay exactly as in H-1a; the duel boot sets it).
  - `tacticalLayer.ts`: `TacticalLayer.draw(d: TacticalDraw, c?: CombatDraw | null): void`; `reset()` hides every text (the zoom, scale, hint and banner included) and clears every drawing; `reseed(seed: number): void` redraws the star field once in the same `Graphics` (nothing when the seed is unchanged); `starSeed(): number`; `starField(seed: number, w: number, h: number): { x; y; b }[]` (the pure star list, the same xorshift as H-1a).

- [ ] **Step 1: Write the failing test**

Create `tests/duelWeaponsView.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import { flyMissile, launchMissile } from '../src/renderer/src/sim/tactical/missiles';
import { createTacticalState, type DuelEvent, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { LASER_RANGE, MISSILE_LIFE_TICKS, MISSILE_RADIUS, PLANET_RADIUS, SHIP_RADIUS } from '../src/renderer/src/sim/tactical/tuning';
import { createCamera, type Camera } from '../src/renderer/src/render/tactical/camera';
import { BEAM_HIT, BEAM_MISS, createFx, hitsCrew, pushEvents, recordTrails, resetFx, shakeOffset, SHAKE_S, stepFx, TRAIL_POINTS, type ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { MISSILE_PATH_MAX_TICKS, predictMissilePath } from '../src/renderer/src/render/tactical/missilePath';
import { createTacticalLayer, starField } from '../src/renderer/src/render/tactical/tacticalLayer';
import { ARROW_GAP_SIDE, tacticalModel, type PrevBody } from '../src/renderer/src/render/tactical/tacticalModel';
import { ARC_HALF, bearingDeg, combatModel, segmentCentre, type CombatModelInput } from '../src/renderer/src/render/tactical/weaponsModel';

const vp = { w: 1280, h: 720 };
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
const prevOf = (st: TacticalState): PrevBody[] => st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
function input(st: TacticalState, cam: Camera, console: 'helm' | 'weapons', fx = createFx()): CombatModelInput {
  return { state: st, prev: prevOf(st), alpha: 1, camera: cam, viewport: vp, console, axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: 236, missilePrev: [null, null], steer: 0, fx };
}

describe('the missile-path predictor (H-1 spec §7)', () => {
  for (const steer of [0, 1, -1]) {
    it(`matches flyMissile tick for tick over 120 ticks of free flight (steer ${steer})`, () => {
      const st = createTacticalState(11);
      launchMissile(st, 0);
      const m0 = { ...st.missiles[0]! };
      const path = predictMissilePath(st, st.missiles[0]!, steer, 1);
      expect(st.missiles[0]).toEqual(m0);   // the state's missile is never touched
      expect(path.length).toBeGreaterThanOrEqual(120);
      for (let t = 0; t < 120; t++) {
        flyMissile(st, 0, steer);
        expect(path[t]).toEqual({ x: st.missiles[0]!.x, y: st.missiles[0]!.y });
      }
    });
  }
  it('ends at the planet when aimed at it, keeping the contact point', () => {
    const st = createTacticalState(11);
    const m = { x: 0, y: -500, vx: 0, vy: 120, heading: 128, headingAcc: 0, age: 0 };   // heading 128 is south: straight down the well
    const path = predictMissilePath(st, m, 0);
    const end = path[path.length - 1]!;
    expect(Math.hypot(end.x, end.y)).toBeLessThan(PLANET_RADIUS + MISSILE_RADIUS);
    expect(path.length).toBeLessThan(MISSILE_PATH_MAX_TICKS / 4);
    for (const p of path.slice(0, -1)) expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(PLANET_RADIUS + MISSILE_RADIUS);
  });
  it('the horizon is the remaining life, capped at 240 ticks, a point every 4 ticks', () => {
    const st = createTacticalState(11);
    launchMissile(st, 0);
    expect(predictMissilePath(st, st.missiles[0]!, 0)).toHaveLength(MISSILE_PATH_MAX_TICKS / 4);
    const old = { ...st.missiles[0]!, age: MISSILE_LIFE_TICKS - 30 };
    const short = predictMissilePath(st, old, 0, 1);
    expect(short).toHaveLength(30);
  });
});

describe('the combat model (H-1 spec §7)', () => {
  it('Weapons: both laser arcs (±60°, range 450), the bearing ring, the enemy bearing and range', () => {
    const st = createTacticalState(11), cam = createCamera(st.ships[0].x, st.ships[0].y);
    const c = combatModel(input(st, cam, 'weapons'));
    const w = c.weapons!;
    expect(w.ownArc).toMatchObject({ x: 640, y: 360, r: LASER_RANGE * 0.5 });
    expect(w.ownArc.half).toBeCloseTo(Math.PI / 3, 12); expect(ARC_HALF).toBeCloseTo(Math.PI / 3, 12);
    expect(w.enemyArc!.r).toBe(LASER_RANGE * 0.5);
    expect(w.ring).not.toBeNull();
    const [a, b] = st.ships, range = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    expect(w.info.text).toBe(`ENEMY BRG ${String(bearingDeg(b.x - a.x, b.y - a.y)).padStart(3, '0')}  RNG ${range}  NO SHOT`);
    expect(w.missilePath).toEqual([]);
  });
  it('the duel views spread crowded off-screen arrows apart so their labels never overlap', () => {
    const st = createTacticalState(11), cam = createCamera(2600, 0);
    Object.assign(st.ships[0], { x: 2600, y: 0 }); Object.assign(st.ships[1], { x: 0, y: 40 });   // the enemy just south of the planet, both far west
    const arrows = tacticalModel({ ...input(st, cam, 'helm'), spreadArrows: true }).arrows;
    const enemy = arrows.find((a) => a.target === 'enemy')!, planet = arrows.find((a) => a.target === 'planet')!;
    expect(enemy.x).toBe(planet.x);   // both on the left edge
    expect(Math.abs(enemy.y - planet.y)).toBeGreaterThanOrEqual(ARROW_GAP_SIDE);
  });
  it('without the option (the flight view) every arrow keeps its H-1a position exactly', () => {
    const st = createTacticalState(11), cam = createCamera(2600, 0);
    Object.assign(st.ships[0], { x: 2600, y: 0 }); Object.assign(st.ships[1], { x: 0, y: 40 });
    const plain = tacticalModel(input(st, cam, 'helm')).arrows, spread = tacticalModel({ ...input(st, cam, 'helm'), spreadArrows: true }).arrows;
    const enemy = plain.find((a) => a.target === 'enemy')!, planet = plain.find((a) => a.target === 'planet')!;
    expect(Math.abs(enemy.y - planet.y)).toBeLessThan(ARROW_GAP_SIDE);   // crowded, and left where the ray meets the edge
    expect(planet).not.toEqual(spread.find((a) => a.target === 'planet'));
    const flight = tacticalModel({ ...input(st, cam, 'helm'), ships: [0] }).arrows;   // the flight view's input: ship 0 only, no option
    expect(flight.find((a) => a.target === 'planet')).toEqual(planet);
  });
  it('bearings are clockwise from north', () => {
    expect([bearingDeg(0, -1), bearingDeg(1, 0), bearingDeg(0, 1), bearingDeg(-1, 0), bearingDeg(-1, -1)]).toEqual([0, 90, 180, 270, 315]);
  });
  it('the lock marker sits on the enemy locked room on both consoles; the Helm has no Weapons layer', () => {
    const st = createTacticalState(11), e = st.ships[1], cam = createCamera(e.x, e.y, 1);
    Object.assign(e, { heading: 64, headingAcc: 0 });   // nose east
    for (const console of ['helm', 'weapons'] as const) {
      st.ships[0].lock = 0;
      let c = combatModel(input(st, cam, console));
      const nose = segmentCentre(0);
      expect(c.lock!.x).toBeCloseTo(640 + nose.f * SHIP_RADIUS, 9); expect(c.lock!.y).toBeCloseTo(360, 9);
      expect(c.lock!.label.text).toBe('LOCK WEAPONS');
      st.ships[0].lock = 2;
      c = combatModel(input(st, cam, console));
      expect(c.lock!.x).toBeLessThan(640); expect(c.lock!.label.text).toBe('LOCK ENGINES');
      expect(c.weapons === null).toBe(console === 'helm');
    }
  });
  it('missile mode: the missile, its trail and its predicted path from its drawn position', () => {
    const st = createTacticalState(11), cam = createCamera(st.ships[0].x, st.ships[0].y), fx = createFx();
    launchMissile(st, 0);
    for (let k = 0; k < 40; k++) { const p = { ...st.missiles[0]! }; flyMissile(st, 0, 1); recordTrails(fx, st, [{ x: p.x, y: p.y, h: p.heading + p.headingAcc }, null], 1); }
    const c = combatModel({ ...input(st, cam, 'weapons', fx), steer: 1 });
    expect(c.missiles).toHaveLength(1);
    expect(c.missiles[0]!.trail).toHaveLength(TRAIL_POINTS);
    expect(c.weapons!.missilePath.length).toBeGreaterThan(10);
    expect(c.weapons!.missileOrigin).toEqual({ x: c.missiles[0]!.x, y: c.missiles[0]!.y });
  });
});

describe('the view effects (H-1 spec §7 item 8, §8 shake)', () => {
  const laser = (ship: number, hit: boolean): DuelEvent => ({ kind: 'laser', ship, hit, stripped: hit, room: -1, x1: 0, y1: 0, x2: 100, y2: 0 });
  it('a beam per laser shot (white hit, grey miss), a burst per missile end, a spark per contact', () => {
    const fx = createFx();
    const events: ViewEvent[] = [laser(0, true), laser(0, false), { kind: 'missileEnd', ship: 1, cause: 'planet', target: -1, room: -1, x: 5, y: 5 }, { kind: 'contact', ship: 0, body: 'planet', x: 1, y: 2 }];
    pushEvents(fx, events);
    expect(fx.items.map((i) => [i.kind, i.life])).toEqual([['beam', 0.15], ['beam', 0.15], ['burst', 0.3], ['spark', 0.3]]);
    expect([fx.items[0]!.colour, fx.items[1]!.colour]).toEqual([BEAM_HIT, BEAM_MISS]);
    expect(fx.shake).toBe(0);
    stepFx(fx, 0.2);
    expect(fx.items.map((i) => i.kind)).toEqual(['burst', 'spark']);
    stepFx(fx, 0.2);
    expect(fx.items).toEqual([]);
  });
  it('a hit on the crew ship shakes for 0.2 s; the crew hitting the enemy does not', () => {
    expect(hitsCrew(laser(1, true))).toBe(true); expect(hitsCrew(laser(1, false))).toBe(false); expect(hitsCrew(laser(0, true))).toBe(false);
    expect(hitsCrew({ kind: 'missileEnd', ship: 1, cause: 'ship', target: 0, room: 1, x: 0, y: 0 })).toBe(true);
    expect(hitsCrew({ kind: 'missileEnd', ship: 0, cause: 'ship', target: 1, room: 1, x: 0, y: 0 })).toBe(false);
    const fx = createFx();
    pushEvents(fx, [laser(1, true)]);
    expect(fx.shake).toBe(SHAKE_S);
    stepFx(fx, 0.05);
    expect(Math.hypot(shakeOffset(fx).x, shakeOffset(fx).y)).toBeGreaterThan(0);
    stepFx(fx, 0.2);
    expect(shakeOffset(fx)).toEqual({ x: 0, y: 0 });
    pushEvents(fx, [laser(1, true)]); resetFx(fx);
    expect([fx.items.length, fx.shake]).toEqual([0, 0]);
  });
  it('trails keep the last 30 drawn positions and clear when the missile ends', () => {
    const st = createTacticalState(11), fx = createFx();
    launchMissile(st, 0);
    for (let k = 0; k < 45; k++) { flyMissile(st, 0, 0); recordTrails(fx, st, [null, null], 1); }
    expect(fx.trails[0]).toHaveLength(TRAIL_POINTS);
    expect(fx.trails[0][TRAIL_POINTS - 1]).toEqual({ x: st.missiles[0]!.x, y: st.missiles[0]!.y });
    recordTrails(fx, st, [null, null], 1);
    expect(fx.trails[0]).toHaveLength(TRAIL_POINTS);   // no move, no new point
    st.missiles[0] = null; recordTrails(fx, st, [null, null], 1);
    expect(fx.trails[0]).toEqual([]);
  });
});

describe('the tactical layer with the combat lists (H-1 spec §10)', () => {
  it('a warm-up of 2 frames, then 60 duel frames at both consoles with missiles, beams and bursts add no display objects', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    const st = createTacticalState(11), cam = createCamera(st.ships[0].x, st.ships[0].y), fx = createFx();
    const frame = (k: number): void => {
      const prev = prevOf(st);
      if (k === 5) { launchMissile(st, 0); launchMissile(st, 1); }
      stepDuel(st, { ...IDLE_INPUT, laserCharge: k % 30 === 0 ? false : k % 30 === 1 ? true : null, steer: 1 });
      pushEvents(fx, st.events);
      if (k % 17 === 0) pushEvents(fx, [{ kind: 'laser', ship: 1, hit: true, stripped: true, room: -1, x1: st.ships[1].x, y1: st.ships[1].y, x2: st.ships[0].x, y2: st.ships[0].y }, { kind: 'contact', ship: 0, body: 'asteroid', x: st.ships[0].x, y: st.ships[0].y }]);
      stepFx(fx, 1 / 60); recordTrails(fx, st, [null, null], 1);
      const console = k % 2 === 0 ? 'weapons' : 'helm', base = { ...input(st, cam, console, fx), prev };
      layer.draw(tacticalModel(base), combatModel(base));
    };
    frame(0); frame(1);
    const n0 = count(layer.container);
    for (let k = 2; k < 62; k++) frame(k);
    expect(count(layer.container)).toBe(n0);
  });
  it('reseed redraws the star field once for the next duel seed, adding no display objects', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp, seed: 7 });
    expect(layer.starSeed()).toBe(7);
    const n0 = count(layer.container), stars = layer.stars as unknown as { context: { instructions: unknown[] } }, k0 = stars.context.instructions.length;
    layer.reseed(8);
    expect(layer.starSeed()).toBe(8);
    expect(count(layer.container)).toBe(n0);
    expect(stars.context.instructions.length).toBe(k0);   // the same number of stars, redrawn in the same Graphics
    expect(starField(8, 1280, 720)).not.toEqual(starField(7, 1280, 720));
    expect(starField(7, 1280, 720)).toEqual(starField(7, 1280, 720));
  });
  it('reset hides every text, the zoom, scale, hint and banner included, until the next draw', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: vp });
    const st = createTacticalState(11), cam = createCamera(st.ships[0].x, st.ships[0].y), base = { ...input(st, cam, 'weapons'), paused: true };
    layer.draw(tacticalModel(base), combatModel(base));
    const visibleTexts = (): number => layer.container.children.filter((k) => k.constructor.name === 'BitmapText' && k.visible).length;
    expect(visibleTexts()).toBeGreaterThan(4);
    layer.reset();
    expect(visibleTexts()).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/duelWeaponsView.test.ts`
Expected: FAIL, "Error: Cannot find module '../src/renderer/src/render/tactical/fxModel' imported from '<repo>/tests/duelWeaponsView.test.ts'" (the first import not yet written).

- [ ] **Step 3: Write the predictor, the effects and the combat model**

Create `src/renderer/src/render/tactical/missilePath.ts`:

```ts
// The missile-path predictor (H-1 spec §7): the Weapons view's predicted path for the missile in flight. Pure: it flies a
// copy through the sim's own flyMissile, so the rules (turn by the sign of the steering, thrust while age ≤ the fuel time,
// gravity, no drag) are exactly the sim's, and it never touches the state it is given.
import { flyMissile } from '../../sim/tactical/missiles';
import { touchesSolid, type PathPoint } from '../../sim/tactical/predict';
import type { Missile, TacticalState } from '../../sim/tactical/state';
import { MISSILE_LIFE_TICKS, MISSILE_RADIUS, R_MAP } from '../../sim/tactical/tuning';

/** The horizon cap in ticks and the default point stride (spec §7). */
export const MISSILE_PATH_MAX_TICKS = 240, MISSILE_PATH_STRIDE = 4;

/**
 * Points every `stride` ticks over the missile's remaining life (capped at 240 ticks), with `steer` held constant. It
 * stops, keeping the final point, at the first planet or asteroid contact, at the map edge, or at expiry; ships are ignored.
 */
export function predictMissilePath(state: TacticalState, missile: Missile, steer: number, stride: number = MISSILE_PATH_STRIDE): PathPoint[] {
  const m: Missile = { ...missile }, every = Math.max(1, Math.floor(stride));
  const scratch: TacticalState = { ...state, missiles: [m, null] };   // flyMissile reads only missiles[i]
  const horizon = Math.min(MISSILE_PATH_MAX_TICKS, MISSILE_LIFE_TICKS - missile.age), out: PathPoint[] = [];
  for (let t = 1; t <= horizon; t++) {
    flyMissile(scratch, 0, steer);
    const ended = touchesSolid(state, m.x, m.y, MISSILE_RADIUS) || m.x * m.x + m.y * m.y > R_MAP * R_MAP || m.age >= MISSILE_LIFE_TICKS;
    if (ended || t % every === 0 || t === horizon) out.push({ x: m.x, y: m.y });
    if (ended) break;
  }
  return out;
}
```

Create `src/renderer/src/render/tactical/fxModel.ts`:

```ts
// The duel's view effects (H-1 spec §7 item 8, §8 shake): laser beams, missile bursts and contact sparks from each tick's
// events, the shake when the crew ship is hit, and the missile trails. Pure and view-owned: never sent to the sim, never
// hashed; a restart resets it. Times are render seconds.
import type { DuelEvent, TacticalState } from '../../sim/tactical/state';
import { HEADING_COUNT } from '../../sim/tactical/tuning';
import type { Point } from './camera';
import type { PrevBody } from './tacticalModel';

/** A contact the runtime detects from a ship's hit counters (the sim emits no contact events). */
export interface ContactEvent { kind: 'contact'; ship: number; body: 'planet' | 'asteroid' | 'ship'; x: number; y: number }
/** What the runtime queues for the views each tick: the sim's events plus the detected contacts. */
export type ViewEvent = DuelEvent | ContactEvent;

export const BEAM_S = 0.15, BURST_S = 0.3, SPARK_S = 0.3, SHAKE_S = 0.2, SHAKE_PX = 6;
/** Trail length in drawn positions (spec §7 item 6). */
export const TRAIL_POINTS = 30;
export const BEAM_HIT = 0xffffff, BEAM_MISS = 0x8a8f99, BURST = 0xff8c1a;
export const SPARK: Readonly<Record<ContactEvent['body'], number>> = { planet: 0xff8c1a, asteroid: 0xa0a0a0, ship: 0xffffff };

export interface FxItem { kind: 'beam' | 'burst' | 'spark'; age: number; life: number; x1: number; y1: number; x2: number; y2: number; colour: number }
export interface FxState {
  items: FxItem[];
  /** Seconds of shake left, and the seconds since it started (drives the wobble). */
  shake: number; shakeT: number;
  /** Per ship's missile: its last TRAIL_POINTS drawn world positions, oldest first; empty while none flies. */
  trails: [Point[], Point[]];
}

export function createFx(): FxState { return { items: [], shake: 0, shakeT: 0, trails: [[], []] }; }
export function resetFx(fx: FxState): void { fx.items.length = 0; fx.shake = 0; fx.shakeT = 0; fx.trails[0].length = 0; fx.trails[1].length = 0; }

/** Whether an event is a hit on the crew ship (ship 0): an enemy laser hit, or any missile landing on it. */
export function hitsCrew(e: ViewEvent): boolean {
  return (e.kind === 'laser' && e.ship === 1 && e.hit) || (e.kind === 'missileEnd' && e.cause === 'ship' && e.target === 0);
}

/** Queue one tick's events as effects; a hit on the crew ship (re)starts the shake. */
export function pushEvents(fx: FxState, events: readonly ViewEvent[]): void {
  for (const e of events) {
    if (e.kind === 'laser') fx.items.push({ kind: 'beam', age: 0, life: BEAM_S, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, colour: e.hit ? BEAM_HIT : BEAM_MISS });
    else if (e.kind === 'missileEnd') fx.items.push({ kind: 'burst', age: 0, life: BURST_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: BURST });
    else fx.items.push({ kind: 'spark', age: 0, life: SPARK_S, x1: e.x, y1: e.y, x2: e.x, y2: e.y, colour: SPARK[e.body] });
    if (hitsCrew(e)) { fx.shake = SHAKE_S; fx.shakeT = 0; }
  }
}

/** Age every effect by dt and drop the finished ones; run the shake down. */
export function stepFx(fx: FxState, dt: number): void {
  for (const it of fx.items) it.age += dt;
  for (let k = fx.items.length - 1; k >= 0; k--) if (fx.items[k]!.age >= fx.items[k]!.life) fx.items.splice(k, 1);
  if (fx.shake > 0) { fx.shake = Math.max(0, fx.shake - dt); fx.shakeT += dt; }
}

/** The screen offset of the shake now: a decaying wobble, zero when none runs. */
export function shakeOffset(fx: FxState): Point {
  if (fx.shake <= 0) return { x: 0, y: 0 };
  const k = SHAKE_PX * (fx.shake / SHAKE_S);
  return { x: Math.round(Math.sin(fx.shakeT * 95) * k), y: Math.round(Math.cos(fx.shakeT * 71) * k) };
}

/** A missile's interpolated position, or null when none flies. */
export function interpolatedMissile(state: TacticalState, missilePrev: readonly (PrevBody | null)[], alpha: number, i: number): PrevBody | null {
  const m = state.missiles[i];
  if (!m) return null;
  const p = missilePrev[i], h1 = m.heading + m.headingAcc, a = Math.min(1, Math.max(0, alpha));
  if (!p) return { x: m.x, y: m.y, h: h1 };
  let dh = h1 - p.h;
  dh -= Math.round(dh / HEADING_COUNT) * HEADING_COUNT;
  return { x: p.x + (m.x - p.x) * a, y: p.y + (m.y - p.y) * a, h: p.h + dh * a };
}

/** Once per frame: append each flying missile's drawn position to its trail (when it moved), and clear ended ones. */
export function recordTrails(fx: FxState, state: TacticalState, missilePrev: readonly (PrevBody | null)[], alpha: number): void {
  for (let i = 0; i < 2; i++) {
    const trail = fx.trails[i as 0 | 1], m = interpolatedMissile(state, missilePrev, alpha, i);
    if (!m) { trail.length = 0; continue; }
    const last = trail[trail.length - 1];
    if (last && last.x === m.x && last.y === m.y) continue;
    trail.push({ x: m.x, y: m.y });
    if (trail.length > TRAIL_POINTS) trail.shift();
  }
}
```

Create `src/renderer/src/render/tactical/weaponsModel.ts`:

```ts
// The duel's combat draw lists for both console map views (H-1 spec §7 items 6 to 8): missiles with trails, the lock
// marker on the enemy's locked room (both consoles, parent §7a), the Weapons layer (bearing ring, both laser arcs, the
// enemy's bearing and range, the missile's predicted path) and the event effects. Pure, like tacticalModel, which it
// sits beside: the layer draws TacticalDraw and CombatDraw together.
import { laserEligible } from '../../sim/tactical/weapons';
import { LASER_ARC_COS, LASER_RANGE, SHIP_RADIUS } from '../../sim/tactical/tuning';
import { ROOM_NAMES } from '../duel/interiorModel';
import { worldToScreen, type Point } from './camera';
import { interpolatedMissile, type FxState } from './fxModel';
import { predictMissilePath } from './missilePath';
import {
  BEARING_RING_ZOOM, headingAngle, interpolatedShip, ringDraw, SHIP_CHEVRON_PX, wedgeSegments, type Label, type PrevBody, type RingDraw,
  type TacticalModelInput
} from './tacticalModel';

/** The laser arc's half-angle in radians: ±60° (cos 0.5). */
export const ARC_HALF = Math.acos(LASER_ARC_COS);

export interface ArcDraw { x: number; y: number; r: number; /** Radians clockwise from north. */ angle: number; half: number }
export interface WeaponsDraw {
  ownArc: ArcDraw; enemyArc: ArcDraw | null; ring: RingDraw | null;
  /** The enemy's bearing and range from the own ship, and whether the laser would hit now (top centre of the view). */
  info: Label; inArc: boolean;
  /** In missile mode: the missile's predicted path from its drawn position. */
  missilePath: Point[]; missileOrigin: Point | null;
}
export interface LockDraw { x: number; y: number; r: number; room: number; label: Label }
export interface MissileDraw { x: number; y: number; angle: number; crew: boolean; trail: Point[] }
export interface EffectDraw { kind: 'beam' | 'burst' | 'spark'; x1: number; y1: number; x2: number; y2: number; r: number; colour: number; alpha: number }
export interface CombatDraw { weapons: WeaponsDraw | null; lock: LockDraw | null; missiles: MissileDraw[]; effects: EffectDraw[] }

export interface CombatModelInput extends TacticalModelInput {
  /** Each ship's missile at the previous tick (null when none flew). */
  missilePrev: readonly (PrevBody | null)[];
  /** The gunner's effective missile steering the runtime last sent (0 when Weapons is empty). */
  steer: number;
  fx: FxState;
}

/** Bearing in whole degrees, 0 to 359, north 0, clockwise. */
export function bearingDeg(dx: number, dy: number): number {
  const deg = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}

/** A room segment's centre in ship units (forward f, right s): the mean of its polygon's vertices. */
export function segmentCentre(room: number): { f: number; s: number } {
  const poly = wedgeSegments()[room]!.poly;
  let f = 0, s = 0;
  for (let i = 0; i < poly.length; i += 2) { f += poly[i]!; s += poly[i + 1]!; }
  return { f: f / (poly.length / 2), s: s / (poly.length / 2) };
}

export function combatModel(input: CombatModelInput): CombatDraw {
  const { state, prev, alpha, camera: cam, viewport: vp } = input, z = cam.zoom;
  const toS = (x: number, y: number): Point => worldToScreen(cam, vp, x, y);
  const own = interpolatedShip(state, prev, alpha, 0), ownS = toS(own.x, own.y);
  const enemy = interpolatedShip(state, prev, alpha, 1), enemyS = toS(enemy.x, enemy.y);
  const onScreen = (p: Point, r: number): boolean => p.x + r >= 0 && p.x - r <= vp.w && p.y + r >= 0 && p.y - r <= vp.h;

  const missiles: MissileDraw[] = [];
  for (let i = 0; i < 2; i++) {
    const m = interpolatedMissile(state, input.missilePrev, alpha, i);
    if (!m) continue;
    const p = toS(m.x, m.y);
    missiles.push({ x: p.x, y: p.y, angle: headingAngle(m.h), crew: i === 0, trail: input.fx.trails[i as 0 | 1].map((q) => toS(q.x, q.y)) });
  }

  // The lock marker sits on the enemy's locked room segment, or on the chevron when the ship is drawn as one.
  let lock: LockDraw | null = null;
  const room = state.ships[0].lock;
  if (onScreen(enemyS, SHIP_RADIUS * 2 * z + 40)) {
    const chevron = 2 * SHIP_RADIUS * z < SHIP_CHEVRON_PX, a = headingAngle(enemy.h), fx = Math.sin(a), fy = -Math.cos(a), rx = -fy, ry = fx;
    const c = chevron ? { f: 0, s: 0 } : segmentCentre(room), k = SHIP_RADIUS * z;
    const x = enemyS.x + (fx * c.f + rx * c.s) * k, y = enemyS.y + (fy * c.f + ry * c.s) * k, r = Math.max(7, k * 0.45);
    lock = { x, y, r, room, label: { text: `LOCK ${ROOM_NAMES[room]}`, x: enemyS.x + Math.max(14, k * 1.6) + 6, y: enemyS.y - 8 } };
  }

  let weapons: WeaponsDraw | null = null;
  if (input.console === 'weapons') {
    const dx = enemy.x - own.x, dy = enemy.y - own.y, range = Math.round(Math.sqrt(dx * dx + dy * dy)), inArc = laserEligible(state, 0, 1);
    const flying = state.missiles[0], drawn = interpolatedMissile(state, input.missilePrev, alpha, 0);
    weapons = {
      ownArc: { x: ownS.x, y: ownS.y, r: LASER_RANGE * z, angle: headingAngle(own.h), half: ARC_HALF },
      enemyArc: input.ships.includes(1) ? { x: enemyS.x, y: enemyS.y, r: LASER_RANGE * z, angle: headingAngle(enemy.h), half: ARC_HALF } : null,
      ring: z >= BEARING_RING_ZOOM ? ringDraw(ownS.x, ownS.y) : null,
      info: { text: `ENEMY BRG ${String(bearingDeg(dx, dy)).padStart(3, '0')}  RNG ${range}  ${inArc ? 'IN ARC' : 'NO SHOT'}`, x: (vp.w - input.reserveRight) / 2, y: 12 },
      inArc,
      missilePath: flying ? predictMissilePath(state, flying, input.steer).map((q) => toS(q.x, q.y)) : [],
      missileOrigin: drawn ? toS(drawn.x, drawn.y) : null
    };
  }

  const effects: EffectDraw[] = input.fx.items.map((it) => {
    const k = Math.min(1, it.age / it.life), a = toS(it.x1, it.y1), b = toS(it.x2, it.y2);
    const r = it.kind === 'burst' ? 6 + 30 * k : it.kind === 'spark' ? 4 + 12 * k : 0;
    return { kind: it.kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y, r, colour: it.colour, alpha: 1 - k };
  });
  return { weapons, lock, missiles, effects };
}
```

- [ ] **Step 4: Export `ringDraw`, spread crowded arrows, and draw the combat lists in the layer**

Replace the whole of `src/renderer/src/render/tactical/tacticalModel.ts` with:

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
/** Off-screen arrows on one edge closer than this are spread apart along it so their labels never overlap: labels sit
 *  beside arrows on the left and right edges (one text line apart) and under or over them on the top and bottom. */
export const ARROW_GAP_SIDE = 20, ARROW_GAP_TOP = 110;
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
  /** Spread crowded off-screen arrows apart (the duel views set it; the flight view keeps H-1a's exact positions). */
  spreadArrows?: boolean;
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

/** The bearing ring about a screen point: ticks every 10°, labels every 30° (north 0). */
export function ringDraw(x: number, y: number): RingDraw {
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

/** Move each arrow that crowds an earlier one on the same edge along that edge, toward the edge's middle. */
export function spreadArrows(arrows: ArrowDraw[], vp: Viewport, reserveRight: number): void {
  const m = ARROW_MARGIN, top = m, bottom = vp.h - m, midX = (vp.w - reserveRight) / 2, midY = vp.h / 2;
  arrows.forEach((a, k) => {
    const flat = Math.abs(a.y - top) < 0.5 || Math.abs(a.y - bottom) < 0.5, gap = flat ? ARROW_GAP_TOP : ARROW_GAP_SIDE;
    for (let n = 0; n < k; n++) {
      const clash = arrows.slice(0, k).find((o) => flat ? Math.abs(o.y - a.y) < 0.5 && Math.abs(o.x - a.x) < gap : Math.abs(o.x - a.x) < 0.5 && Math.abs(o.y - a.y) < gap);
      if (!clash) break;
      if (flat) a.x = clash.x + (clash.x > midX ? -gap : gap);
      else a.y = clash.y + (clash.y > midY ? -gap : gap);
    }
  });
}

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
  if (input.spreadArrows) spreadArrows(arrows, vp, input.reserveRight);

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

Replace the whole of `src/renderer/src/render/tactical/tacticalLayer.ts` with:

```ts
// The console map view layer (H-1 spec §7): draws a TacticalDraw, and in the duel a CombatDraw, with Graphics and pooled
// BitmapText. Every display object is made at creation; a frame only clears and redraws Graphics and sets text, so
// nothing is allocated per frame.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { AMBER, DIM, FONT_NATIVE, FONT_SIZE, GOOD, TEXT, textPx, WARN } from '../theme';
import { SHIP_RADIUS } from '../../sim/tactical/tuning';
import { asteroidShape, CHEVRON_SIZE, wedgeSegments, type ArrowTarget, type Label, type ShipDraw, type TacticalDraw } from './tacticalModel';
import type { ArcDraw, CombatDraw } from './weaponsModel';
import type { Viewport } from './camera';

export const SPACE = 0x05060a;
export const CREW_SHIP = 0x4fd6e8, ENEMY_SHIP = 0xe8564f, SHIELD_RING = 0x6fc3ff;
const GRID = 0x34445c, CONTOUR = 0x4a6a9a, EDGE = 0xa05050, PLANET = 0x2d4a6b, PLANET_LIT = 0x5b86b0, PLANET_RIM = 0x8fb4d8;
const ROCK = 0x5e554b, ROCK_EDGE = 0x8a7f70, PATH = GOOD, VELOCITY = AMBER, FLAME = 0xff8c1a, MISSILE_PATH = AMBER, LOCK = AMBER;
const ARROW_COLOUR: Readonly<Record<ArrowTarget, number>> = { ship: CREW_SHIP, enemy: ENEMY_SHIP, planet: PLANET_RIM, missile: AMBER };
/** Room segment tint by damage level 0 / 1 / 2: the ship's own colour, amber, red. */
const DAMAGE: readonly (number | null)[] = [null, AMBER, WARN];
const STAR_COUNT = 220;
/** Pool sizes: the labels name 500-unit squares (12 per axis at most), the ring has 12 labels, at most 4 arrows. */
const GRID_LABELS = 12, RING_LABELS = 12, ARROWS = 4;

/** `stars` is exposed for the parallax test. `draw` takes the duel's combat lists as a second argument (none in the
 *  flight view). `reset` hides every text and clears every drawing until the next draw (a restart). `reseed` redraws the
 *  star field once for a new run seed (a restart), in the same Graphics; `starSeed` is the seed it shows. */
export interface TacticalLayer {
  container: Container; stars: Container;
  draw(d: TacticalDraw, c?: CombatDraw | null): void;
  reset(): void;
  reseed(seed: number): void;
  starSeed(): number;
}

/** The star field for a run seed: STAR_COUNT stars in one w × h screen, from an xorshift (render-only randomness). */
export function starField(seed: number, w: number, h: number): { x: number; y: number; b: number }[] {
  let r = seed >>> 0 || 1;
  const rnd = (): number => { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; };
  return Array.from({ length: STAR_COUNT }, () => { const x = rnd() * w, y = rnd() * h, b = rnd(); return { x, y, b }; });
}
export interface TacticalLayerOptions { fontFamily: string; viewport: Viewport; seed?: number }

export function createTacticalLayer(opts: TacticalLayerOptions): TacticalLayer {
  const { w, h } = opts.viewport;
  const container = new Container();
  const bg = new Graphics(), stars = new Graphics(), grid = new Graphics(), contours = new Graphics(), bodies = new Graphics(), arcs = new Graphics(), ships = new Graphics(), helm = new Graphics(), combat = new Graphics(), overlay = new Graphics();
  container.addChild(bg, stars, grid, contours, bodies, arcs, ships, helm, combat, overlay);
  const drawn = [grid, contours, bodies, arcs, ships, helm, combat, overlay];
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
  const lockText = mk(FONT_NATIVE, LOCK, 0, 0), info = mk(FONT_SIZE, TEXT, 0.5, 0);
  const texts = [...cols, ...rows, ...ring, ...arrowText, zoomText, scaleText, hint, banner, lockText, info];

  // The star field: render-only randomness, seeded (H-1 spec §7 item 1). One screen of stars is drawn as a 2 × 2 tile, so
  // shifting it by the parallax offset (0..w, 0..h, minus one tile) always covers the screen with no gap.
  bg.rect(0, 0, w, h).fill(SPACE);
  let shownSeed = opts.seed ?? 2026;
  const drawStars = (seed: number): void => {
    stars.clear(); shownSeed = seed;
    for (const { x, y, b } of starField(seed, w, h))
      for (const [tx, ty] of [[0, 0], [w, 0], [0, h], [w, h]] as const)
        stars.rect(Math.floor(x) + tx, Math.floor(y) + ty, b > 0.92 ? 2 : 1, b > 0.92 ? 2 : 1).fill({ color: 0xffffff, alpha: 0.25 + 0.55 * b });
  };
  drawStars(shownSeed);

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

  /** A laser arc: a filled sector of radius r about (x, y), ±half about `angle` (radians clockwise from north). */
  function arc(g: Graphics, a: ArcDraw, colour: number, fillAlpha: number, lineAlpha: number): void {
    const from = a.angle - a.half - Math.PI / 2, to = a.angle + a.half - Math.PI / 2;   // Pixi measures from +x, clockwise on screen
    g.moveTo(a.x, a.y).arc(a.x, a.y, Math.max(1, a.r), from, to).closePath().fill({ color: colour, alpha: fillAlpha }).stroke({ width: 1, color: colour, alpha: lineAlpha });
  }

  function missileGlyph(g: Graphics, x: number, y: number, angle: number, colour: number): void {
    const fx = Math.sin(angle), fy = -Math.cos(angle), rx = -fy, ry = fx, s = 6;
    g.poly([x + fx * s, y + fy * s, x - fx * s + rx * s * 0.55, y - fy * s + ry * s * 0.55, x - fx * s - rx * s * 0.55, y - fy * s - ry * s * 0.55]).fill(colour);
  }

  function arrowGlyph(g: Graphics, x: number, y: number, angle: number, colour: number): void {
    const fx = Math.sin(angle), fy = -Math.cos(angle), rx = -fy, ry = fx, s = 10;
    g.poly([x + fx * s, y + fy * s, x - fx * s * 0.6 + rx * s * 0.7, y - fy * s * 0.6 + ry * s * 0.7, x - fx * s * 0.6 - rx * s * 0.7, y - fy * s * 0.6 - ry * s * 0.7]).fill(colour);
  }

  return {
    container, stars,
    draw(d, c = null) {
      stars.position.set(d.stars.x - w, d.stars.y - h);
      for (const g of drawn) g.clear();
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

      const wd = c?.weapons ?? null;
      if (wd) {
        if (wd.enemyArc) arc(arcs, wd.enemyArc, ENEMY_SHIP, 0.05, 0.25);
        arc(arcs, wd.ownArc, CREW_SHIP, wd.inArc ? 0.14 : 0.08, 0.5);
      }

      for (const s of d.ships) drawShip(ships, s);

      let ringLabels: readonly Label[] = wd?.ring?.labels ?? [];
      if (wd?.ring) {
        const r = wd.ring;
        helm.circle(r.x, r.y, r.r).stroke({ width: 1, color: DIM, alpha: 0.25 });
        for (const t of r.ticks) helm.moveTo(t.x1, t.y1).lineTo(t.x2, t.y2).stroke({ width: 1, color: DIM, alpha: t.major ? 0.7 : 0.35 });
      }
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

      // Combat: missile trails and glyphs, the predicted missile path, the lock marker, then the event effects on top.
      for (const m of c?.missiles ?? []) {
        const colour = m.crew ? CREW_SHIP : ENEMY_SHIP;
        m.trail.forEach((p, k) => { if (k > 0) { const q = m.trail[k - 1]!; combat.moveTo(q.x, q.y).lineTo(p.x, p.y).stroke({ width: 2, color: colour, alpha: 0.6 * (k / m.trail.length) }); } });
        missileGlyph(combat, m.x, m.y, m.angle, colour);
      }
      if (wd && wd.missileOrigin && wd.missilePath.length > 0) {
        combat.moveTo(wd.missileOrigin.x, wd.missileOrigin.y);
        for (const p of wd.missilePath) combat.lineTo(p.x, p.y);
        combat.stroke({ width: 1, color: MISSILE_PATH, alpha: 0.7 });
        const end = wd.missilePath[wd.missilePath.length - 1]!;
        combat.circle(end.x, end.y, 3).stroke({ width: 1, color: MISSILE_PATH });
      }
      const lk = c?.lock ?? null;
      if (lk) {
        const r = lk.r, k = r * 0.45;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
          combat.moveTo(lk.x + sx * r, lk.y + sy * (r - k)).lineTo(lk.x + sx * r, lk.y + sy * r).lineTo(lk.x + sx * (r - k), lk.y + sy * r).stroke({ width: 2, color: LOCK });
      }
      lockText.visible = lk !== null;
      if (lk) { setText(lockText, lk.label.text); lockText.position.set(Math.round(lk.label.x), Math.round(lk.label.y)); }
      info.visible = wd !== null;
      if (wd) { setText(info, wd.info.text); info.tint = wd.inArc ? GOOD : TEXT; info.position.set(Math.round(wd.info.x), Math.round(wd.info.y)); }
      for (const e of c?.effects ?? []) {
        if (e.kind === 'beam') combat.moveTo(e.x1, e.y1).lineTo(e.x2, e.y2).stroke({ width: 3, color: e.colour, alpha: e.alpha });
        else if (e.kind === 'burst') combat.circle(e.x1, e.y1, e.r).stroke({ width: 3, color: e.colour, alpha: e.alpha }).circle(e.x1, e.y1, e.r * 0.4).fill({ color: e.colour, alpha: e.alpha * 0.6 });
        else for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + Math.PI / 4; combat.moveTo(e.x1, e.y1).lineTo(e.x1 + Math.cos(a) * e.r, e.y1 + Math.sin(a) * e.r).stroke({ width: 2, color: e.colour, alpha: e.alpha }); }
      }

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
    reset() { for (const t of texts) t.visible = false; for (const g of drawn) g.clear(); },
    reseed(seed) { if (seed !== shownSeed) drawStars(seed); },
    starSeed: () => shownSeed
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/duelWeaponsView.test.ts tests/tacticalModel.test.ts tests/tacticalLayer.test.ts`
Expected: PASS, 39 tests in 3 files (17 new).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/render/tactical/missilePath.ts src/renderer/src/render/tactical/fxModel.ts src/renderer/src/render/tactical/weaponsModel.ts src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/tactical/tacticalLayer.ts tests/duelWeaponsView.test.ts
git commit -m "feat(helm): the missile-path predictor, effects and the Weapons and lock layers (Helm H-1b)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 3: The duel controls and two tightened H-1a tests

**Files:**
- Create: `src/renderer/src/app/duel/controls.ts`, `tests/duelControls.test.ts`
- Replace: `tests/tacticalCamera.test.ts`, `tests/duelInput.test.ts`

**Interfaces:**
- Consumes: `Position`, `Seated` (`sim/components.ts`), `roomAt` (`sim/grid.ts`), `inReachOfTile` (`sim/interact.ts`), `DuelState`, all unchanged.
- Produces (`app/duel/controls.ts`):
  - `type Seat = 'helm' | 'weapons' | 'standing'`;
  - `seatOf(d: DuelState, pid: number): Seat`;
  - `repairInReach(d: DuelState, pid: number): number` (the tactical Room, or −1);
  - `consoleInReach(d: DuelState, pid: number): number` (`d.nav`, `d.weapons`, or −1);
  - `cycleLock(room: number, dir: 1 | -1): number`.
- The H-1a final review flagged two weak tests; this task tightens them without changing the code they test:
  - the pointer test now samples after the move alone, so the wheel event no longer masks the move's position;
  - the following-camera zoom test now checks mid-ease, with the cursor's world point moving and the camera still following a moving body (it was trivially true before).

- [ ] **Step 1: Write the failing test and the tightened tests**

Create `tests/duelControls.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position } from '../src/renderer/src/sim/components';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { REPAIR_RATE_SOLO } from '../src/renderer/src/sim/duel/tuning';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { consoleInReach, cycleLock, repairInReach, seatOf } from '../src/renderer/src/app/duel/controls';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const step = (d: DuelState, player: number, command: DuelCommand | null, held: HeldInput[] = [NONE, NONE]) =>
  stepDuelTick(d, { held, commands: command ? [{ id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command }] : [] });
const put = (d: DuelState, pid: number, tx: number, ty: number): void => { const eid = d.interior.crew[pid]!; Position.x[eid] = tx + 0.5; Position.y[eid] = ty + 0.5; };

describe('duel controls (H-1 spec §5)', () => {
  it('seatOf: player 0 at the Helm, player 1 at Weapons, standing after a stand', () => {
    const d = createDuel(layout, 5);
    expect([seatOf(d, 0), seatOf(d, 1)]).toEqual(['helm', 'weapons']);
    step(d, 1, { kind: 'stand' });
    expect(seatOf(d, 1)).toBe('standing');
    disposeDuel(d);
  });
  it('repairInReach mirrors the sim: a damaged room, from inside its repair room, in reach of its tile', () => {
    const d = createDuel(layout, 5);
    step(d, 0, { kind: 'stand' }); put(d, 0, 1, 6);            // Engines room, next to its repair point (2, 6)
    expect(repairInReach(d, 0)).toBe(-1);                         // nothing damaged
    d.tactical.ships[0].rooms[Room.Engines] = 1;
    expect(repairInReach(d, 0)).toBe(Room.Engines);
    step(d, 0, null, [{ moveX: 0, moveY: 0, interactHeld: true }, NONE]);
    expect(d.repair[Room.Engines]).toBe(REPAIR_RATE_SOLO);        // the sim agrees: holding E there repairs
    put(d, 0, 5, 6);                                              // the Aft Passage: outside the repair room
    expect(repairInReach(d, 0)).toBe(-1);
    expect(repairInReach(d, 1)).toBe(-1);                         // seated characters repair nothing
    disposeDuel(d);
  });
  it('consoleInReach: a free role console from inside its room and in reach; never a scenery console', () => {
    const d = createDuel(layout, 5);
    expect(consoleInReach(d, 0)).toBe(-1);                        // seated
    step(d, 0, { kind: 'stand' });
    expect(consoleInReach(d, 0)).toBe(d.nav);                     // standing at the Navigation console
    put(d, 0, 22, 6);                                             // the next room forward
    expect(consoleInReach(d, 0)).toBe(-1);
    step(d, 1, { kind: 'stand' });
    put(d, 0, 9, 6);                                              // beside the Weapons console, now free
    expect(consoleInReach(d, 0)).toBe(d.weapons);
    step(d, 0, { kind: 'sit', station: d.weapons });
    expect(seatOf(d, 0)).toBe('weapons');
    put(d, 1, 9, 5);
    expect(consoleInReach(d, 1)).toBe(-1);                        // occupied
    disposeDuel(d);
  });
  it('the lock cycles Weapons, Shields, Engines and back, both ways', () => {
    expect([cycleLock(0, 1), cycleLock(1, 1), cycleLock(2, 1)]).toEqual([1, 2, 0]);
    expect([cycleLock(0, -1), cycleLock(1, -1), cycleLock(2, -1)]).toEqual([2, 0, 1]);
  });
});
```

Replace the whole of `tests/tacticalCamera.test.ts` with:

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
  it('a following camera zooms about the followed body, not the cursor, and keeps following', () => {
    const cam = createCamera(50, 50), at = { x: 1000, y: 100 }, before = screenToWorld(cam, vp, at.x, at.y);
    zoomBy(cam, vp, 1, at);
    expect(cam.anchor).toBeNull(); expect(cam.follow).toBe('ship');
    updateCamera(cam, vp, 0.05, { x: 50, y: 50 });
    expect(cam.zoom).toBeGreaterThan(ZOOM_DEFAULT); expect(cam.zoom).toBeLessThan(cam.targetZoom);   // mid-ease
    expect(worldToScreen(cam, vp, 50, 50)).toEqual({ x: 640, y: 360 });
    const mid = screenToWorld(cam, vp, at.x, at.y);
    expect(Math.hypot(mid.x - before.x, mid.y - before.y)).toBeGreaterThan(20);   // the point under the cursor moved: no cursor anchor
    run(cam, 0.3, { x: 80, y: 20 });   // the body moves on: the camera still follows it
    expect(worldToScreen(cam, vp, 80, 20)).toEqual({ x: 640, y: 360 });
    expect(cam.zoom).toBe(cam.targetZoom);
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

Replace the whole of `tests/duelInput.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createDuelKeyboard, createPointerSource, helmAxes, accumulateWheel, type EventSource } from '../src/renderer/src/app/duel/input';

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
    expect(p.sample()).toEqual({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 });
    t.fire('pointermove', ptr(200, 100, -1, 0));
    expect(p.sample()).toEqual({ x: 100, y: 50, wheel: 0, dragX: 0, dragY: 0 });   // a move alone: the letterbox inverse
    expect(p.sample()).toMatchObject({ x: 100, y: 50 });                           // the position persists across samples
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
  it('wheel accumulator: small deltas sum to whole notches, remainder carries, scrolling up zooms in', () => {
    expect(accumulateWheel(0, 0)).toEqual({ notches: 0, acc: 0 });
    expect(accumulateWheel(0, -100).notches).toBe(1); expect(accumulateWheel(0, 300).notches).toBe(-3);
    expect(accumulateWheel(0, 4)).toEqual({ notches: 0, acc: 4 });
    let acc = 0, total = 0;
    for (let i = 0; i < 30; i++) { const r = accumulateWheel(acc, 4); acc = r.acc; total += r.notches; }
    expect(total).toBe(-1); expect(acc).toBe(20);
    const r = accumulateWheel(60, 150); expect(r.notches).toBe(-2); expect(r.acc).toBe(10);
  });
});
```

- [ ] **Step 2: Run them to verify the new one fails**

Run: `npx vitest run tests/duelControls.test.ts tests/tacticalCamera.test.ts tests/duelInput.test.ts`
Expected: FAIL in `tests/duelControls.test.ts` only, "Error: Cannot find module '../src/renderer/src/app/duel/controls' imported from '<repo>/tests/duelControls.test.ts'" (the first import not yet written). The tightened camera and input tests pass against H-1a's code.

- [ ] **Step 3: Write the controls**

Create `src/renderer/src/app/duel/controls.ts`:

```ts
// What a duel character can do from where it stands (H-1 spec §5). Pure reads of the duel state, mirroring the sim's own
// rules (sim/duel/step.ts repairPhase, today's sit validation), so the client only sends commands the sim would admit.
import { Position, Seated } from '../../sim/components';
import { roomAt } from '../../sim/grid';
import { inReachOfTile } from '../../sim/interact';
import type { DuelState } from '../../sim/duel/state';

export type Seat = 'helm' | 'weapons' | 'standing';

/** Where player pid's character is: seated at Navigation (the Helm), at Weapons, or standing. */
export function seatOf(d: DuelState, pid: number): Seat {
  const station = Seated.station[d.interior.crew[pid]!]!;
  return station === d.nav ? 'helm' : station === d.weapons ? 'weapons' : 'standing';
}

/** The tactical Room player pid would repair by holding E now, or −1: the first damaged room (in Room order, as the sim
 *  picks) whose repair room the character stands in, in reach of its repair tile. Seated characters repair nothing. */
export function repairInReach(d: DuelState, pid: number): number {
  const eid = d.interior.crew[pid]!;
  if (Seated.station[eid]! >= 0) return -1;
  const here = roomAt(d.interior, Position.x[eid]!, Position.y[eid]!), ship = d.tactical.ships[0];
  const p = d.points.find((q) => ship.rooms[q.tacticalRoom]! > 0 && q.room === here && inReachOfTile(d.interior, eid, q.tile));
  return p ? p.tacticalRoom : -1;
}

/** The free role console (Navigation or Weapons) player pid can sit at now, or −1: today's sit rule, from inside the
 *  console's room and in reach of its tile. */
export function consoleInReach(d: DuelState, pid: number): number {
  const st = d.interior, eid = st.crew[pid]!;
  if (Seated.station[eid]! >= 0) return -1;
  const here = roomAt(st, Position.x[eid]!, Position.y[eid]!);
  for (const i of [d.nav, d.weapons]) {
    if (st.stations.occupant[i]! >= 0 || st.derived.stationRoom[i] !== here) continue;
    if (inReachOfTile(st, eid, st.derived.stationTile[i]!)) return i;
  }
  return -1;
}

/** The lock cycle Weapons → Shields → Engines → Weapons (Room order); `dir` +1 next (E), −1 previous (Q). */
export function cycleLock(room: number, dir: 1 | -1): number { return (((room + dir) % 3) + 3) % 3; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/duelControls.test.ts tests/tacticalCamera.test.ts tests/duelInput.test.ts`
Expected: PASS, 23 tests in 3 files (4 new).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/app/duel/controls.ts tests/duelControls.test.ts tests/tacticalCamera.test.ts tests/duelInput.test.ts
git commit -m "feat(helm): the duel controls (seat, repair and console in reach, lock cycle); tighten two H-1a tests (Helm H-1b)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 4: The readout column and the end screen

**Files:**
- Create: `src/renderer/src/render/duel/readoutModel.ts`, `src/renderer/src/render/duel/readoutPanel.ts`, `src/renderer/src/render/duel/endScreen.ts`
- Create: `tests/duelReadout.test.ts`

**Interfaces:**
- Consumes: `DuelState`, `REPAIR_UNITS`, the tactical tuning, `Outcome`, `TICK_HZ`, `drawPanel`, the theme, all unchanged; Task 1's `READOUT_COLUMN`, `ROOM_NAMES`; Task 2's `CREW_SHIP`, `ENEMY_SHIP` (`tacticalLayer.ts`) and `bearingDeg`.
- Produces:
  - `readoutModel.ts`: `type ReadoutMode = 'helm' | 'weapons' | 'interior'`; `type OtherStatus = 'AT HELM' | 'AT WEAPONS' | 'WALKING' | 'REPAIRING'`; `INCOMING_RANGE` (600); `READOUT_MARGIN` (8), `READOUT_W` (204); `interface ReadoutRow { label; value; labelTint; valueTint; pips?; bar? }`; `interface ReadoutInput { duel; mode; active: 0 | 1; other: OtherStatus }`; `readoutRows(input: ReadoutInput): ReadoutRow[]`; `readoutHelp(mode: ReadoutMode): string[]`; `READOUT_ROWS` (22).
  - `readoutPanel.ts`: `interface ReadoutPanel { container: Container; draw(rows, help): void }`; `createReadoutPanel(opts: { fontFamily: string }): ReadoutPanel`.
  - `endScreen.ts`: `interface EndView { title; tint; length; prompt }`; `endModel(outcome: number, ticks: number, seed: number): EndView | null`; `interface EndScreen { container; draw(view: EndView | null): void }`; `createEndScreen(opts: { fontFamily: string }): EndScreen`.

- [ ] **Step 1: Write the failing test**

Create `tests/duelReadout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { REPAIR_UNITS } from '../src/renderer/src/sim/duel/tuning';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { createEndScreen, endModel } from '../src/renderer/src/render/duel/endScreen';
import { createReadoutPanel } from '../src/renderer/src/render/duel/readoutPanel';
import { readoutHelp, readoutRows, READOUT_ROWS, READOUT_W, type ReadoutInput, type ReadoutMode } from '../src/renderer/src/render/duel/readoutModel';
import { PAD, textPx } from '../src/renderer/src/render/theme';

const layout = parseShip(cutter);
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
const pairs = (input: ReadoutInput) => readoutRows(input).map((r) => [r.label, r.value]);

describe('the duel readout (H-1 spec §7 item 9, §8)', () => {
  it('both hulls, both shields, the crew rooms and the enemy rooms; the other character status', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[1].hull = 21; d.tactical.ships[1].rooms = [0, 2, 1]; d.tactical.ships[0].rooms[Room.Engines] = 1; d.tactical.ships[0].shields = 1;
    const rows = readoutRows({ duel: d, mode: 'helm', active: 0, other: 'AT WEAPONS' });
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['HELM', ''], ['CUTTER', ''], ['HULL', '30/30'], ['SHIELD', ''], ['WEAPONS', 'OK'], ['SHIELDS', 'OK'], ['ENGINES', 'DMG 1'],
      ['HUNTER', ''], ['HULL', '21/30'], ['SHIELD', ''], ['ROOMS', 'W0 S2 E1'], ['OTHER', 'PRESENT'], ['', 'AT WEAPONS']
    ]);
    expect(rows[3]!.pips).toMatchObject({ n: 1, max: 2 }); expect(rows[9]!.pips).toMatchObject({ n: 2, max: 2 });
    disposeDuel(d);
  });
  it('repair progress is a bar on the damaged room row', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[0].rooms[Room.Shields] = 2; d.repair[Room.Shields] = REPAIR_UNITS / 4;
    const row = readoutRows({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' }).find((r) => r.label === 'SHIELDS')!;
    expect([row.value, row.bar?.fill]).toEqual(['DMG 2', 0.25]);
    disposeDuel(d);
  });
  it('Weapons adds the lock, the charge bar and hold timer, and the magazine', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0];
    s.laserCharge = LASER_CHARGE_UNITS / 2;
    let w = pairs({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' });
    expect(w.slice(11, 15)).toEqual([['LASER', ''], ['LOCK', 'SHIELDS'], ['CHARGE', '50%'], ['MAG', '4/4']]);
    s.laserCharge = LASER_CHARGE_UNITS; s.laserHold = 60;
    w = pairs({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' });
    expect(w[13]).toEqual(['CHARGE', 'HOLD 2.0']);
    disposeDuel(d);
  });
  it('standing, the strip tells about the ship outside: empty consoles, the enemy, an inbound missile', () => {
    const d = createDuel(layout, 5);
    stepDuelTick(d, { held: [], commands: [{ id: { player: 1, sequence: 0 }, requestedTick: 0, command: { kind: 'presence', present: false } }, { id: { player: 0, sequence: 0 }, requestedTick: 0, command: { kind: 'stand' } }] });
    const [crew, enemy] = d.tactical.ships;
    let out = pairs({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' });
    expect(out.slice(11)).toEqual([
      ['OTHER', 'AWAY'], ['', 'AT WEAPONS'], ['OUTSIDE', ''], ['HELM', 'EMPTY'], ['', 'COASTING'], ['WEAPONS', 'EMPTY'],
      ['ENEMY', String(Math.round(Math.hypot(enemy.x - crew.x, enemy.y - crew.y)))], ['BEARING', expect.stringMatching(/^\d{3}$/)]
    ]);
    d.tactical.missiles[1] = { x: crew.x + 500, y: crew.y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 };
    out = pairs({ duel: d, mode: 'interior', active: 0, other: 'AT WEAPONS' });
    expect(out.at(-1)).toEqual(['MISSILE INBOUND', '']);
    disposeDuel(d);
  });
  it('every row and help line fits the 220-px column', () => {
    const d = createDuel(layout, 5);
    d.tactical.ships[0].rooms = [2, 2, 2]; d.tactical.ships[0].laserCharge = LASER_CHARGE_UNITS; d.tactical.missiles[0] = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 };
    d.tactical.missiles[1] = { ...d.tactical.ships[0], heading: 0, headingAcc: 0, age: 0 };
    for (const mode of ['helm', 'weapons', 'interior'] as ReadoutMode[]) for (const other of ['AT HELM', 'AT WEAPONS', 'WALKING', 'REPAIRING'] as const) {
      const rows = readoutRows({ duel: d, mode, active: 0, other });
      expect(rows.length).toBeLessThanOrEqual(READOUT_ROWS);
      for (const r of rows) expect(textPx(r.label) + 6 + (r.pips ? 32 : textPx(r.value)), `${mode} ${r.label} ${r.value}`).toBeLessThanOrEqual(READOUT_W - 2 * PAD);
      for (const line of readoutHelp(mode)) expect(textPx(line, 1), line).toBeLessThanOrEqual(READOUT_W - 2 * PAD);
    }
    disposeDuel(d);
  });
  it('the panel: a warm-up of 2 frames, then 60 frames across all three screens add no display objects', () => {
    const d = createDuel(layout, 5), panel = createReadoutPanel({ fontFamily: 'm5x7' });
    const modes: ReadoutMode[] = ['helm', 'weapons', 'interior'];
    const frame = (k: number): void => {
      const mode = modes[Math.floor(k / 7) % 3]!;
      d.tactical.ships[0].rooms[Room.Engines] = k % 3; d.repair[Room.Engines] = (k * 40) % REPAIR_UNITS;
      panel.draw(readoutRows({ duel: d, mode, active: 0, other: 'WALKING' }), readoutHelp(mode));
    };
    frame(0); frame(1);
    const n0 = count(panel.container);
    for (let k = 2; k < 62; k++) frame(k);
    expect(count(panel.container)).toBe(n0);
    disposeDuel(d);
  });
});

describe('the end screen (H-1 spec §4 End)', () => {
  it('names the outcome, the duel length and the next seed', () => {
    expect(endModel(Outcome.Running, 100, 5)).toBeNull();
    expect(endModel(Outcome.CrewWins, 83 * 60 + 30, 2026)).toMatchObject({ title: 'VICTORY', length: 'DUEL LENGTH 1:23', prompt: 'ENTER: NEW DUEL (SEED 2027)' });
    expect(endModel(Outcome.EnemyWins, 60, 7)!.title).toBe('DEFEAT');
    expect(endModel(Outcome.Draw, 60, 7)!.title).toBe('BOTH SHIPS LOST');
  });
  it('shows only while the duel is decided, and allocates nothing after creation', () => {
    const end = createEndScreen({ fontFamily: 'm5x7' }), n0 = count(end.container);
    end.draw(null); expect(end.container.visible).toBe(false);
    end.draw(endModel(Outcome.CrewWins, 600, 5)); expect(end.container.visible).toBe(true);
    end.draw(endModel(Outcome.EnemyWins, 1200, 6));
    expect(count(end.container)).toBe(n0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/duelReadout.test.ts`
Expected: FAIL, "Error: Cannot find module '../src/renderer/src/render/duel/endScreen' imported from '<repo>/tests/duelReadout.test.ts'" (the first import not yet written).

- [ ] **Step 3: Write the readout and the end screen**

Create `src/renderer/src/render/duel/readoutModel.ts`:

```ts
// The duel's side readout (H-1 spec §7 item 9, §8): both hulls, the shield pips, the room levels and repair, the
// Weapons extras (lock, charge, hold timer, magazine), the other character's status and, standing, the strip about the
// ship outside. Pure (it draws nothing): rows of label and value that the panel draws; every row fits the 220-px column
// (tested). The ship colours come from the map-view layer so both screens agree.
import type { DuelState } from '../../sim/duel/state';
import { REPAIR_UNITS } from '../../sim/duel/tuning';
import { LASER_CHARGE_UNITS, LASER_HOLD_TICKS, MAGAZINE, SHIELD_LAYERS, SHIP_HULL } from '../../sim/tactical/tuning';
import { TICK_HZ } from '../../sim/tuning';
import { AMBER, DIM, TEXT, WARN, GOOD } from '../theme';
import { CREW_SHIP, ENEMY_SHIP } from '../tactical/tacticalLayer';
import { bearingDeg } from '../tactical/weaponsModel';
import { READOUT_COLUMN, ROOM_NAMES } from './interiorModel';

export type ReadoutMode = 'helm' | 'weapons' | 'interior';
export type OtherStatus = 'AT HELM' | 'AT WEAPONS' | 'WALKING' | 'REPAIRING';

/** The incoming-missile warning range (spec §8). */
export const INCOMING_RANGE = 600;
export const READOUT_MARGIN = 8, READOUT_W = READOUT_COLUMN - 2 * READOUT_MARGIN;

export interface ReadoutRow {
  label: string; value: string;
  labelTint: number; valueTint: number;
  /** Shield pips drawn after the label: `n` lit of `max`. */
  pips?: { n: number; max: number; colour: number };
  /** A thin bar along the bottom of the row: 0..1 filled (the laser charge, a room's repair progress). */
  bar?: { fill: number; colour: number };
}

const row = (label: string, value = '', labelTint = DIM, valueTint = TEXT): ReadoutRow => ({ label, value, labelTint, valueTint });
const heading = (label: string, tint: number): ReadoutRow => row(label, '', tint, tint);
const level = (n: number): string => (n === 0 ? 'OK' : `DMG ${n}`);
const levelTint = (n: number): number => (n === 0 ? GOOD : n === 1 ? AMBER : WARN);

export interface ReadoutInput {
  duel: DuelState;
  mode: ReadoutMode;
  /** The player the keyboard drives; the other's status is shown. */
  active: 0 | 1;
  other: OtherStatus;
}

export function readoutRows(input: ReadoutInput): ReadoutRow[] {
  const d = input.duel, [crew, enemy] = d.tactical.ships, other = input.active === 0 ? 1 : 0;
  const rows: ReadoutRow[] = [
    heading(input.mode === 'helm' ? 'HELM' : input.mode === 'weapons' ? 'WEAPONS' : 'ON FOOT', AMBER),
    heading('CUTTER', CREW_SHIP),
    row('HULL', `${crew.hull}/${SHIP_HULL}`, DIM, crew.hull <= SHIP_HULL / 4 ? WARN : TEXT),
    { ...row('SHIELD'), pips: { n: crew.shields, max: SHIELD_LAYERS, colour: CREW_SHIP } }
  ];
  for (let r = 0; r < 3; r++) {
    const n = crew.rooms[r]!, progress = d.repair[r]! / REPAIR_UNITS, out = row(ROOM_NAMES[r]!, level(n), DIM, levelTint(n));
    rows.push(n > 0 && progress > 0 ? { ...out, bar: { fill: progress, colour: GOOD } } : out);
  }
  rows.push(heading('HUNTER', ENEMY_SHIP));
  rows.push(row('HULL', `${enemy.hull}/${SHIP_HULL}`, DIM, enemy.hull <= SHIP_HULL / 4 ? GOOD : TEXT));
  rows.push({ ...row('SHIELD'), pips: { n: enemy.shields, max: SHIELD_LAYERS, colour: ENEMY_SHIP } });
  rows.push(row('ROOMS', enemy.rooms.map((n, r) => `${ROOM_NAMES[r]!.charAt(0)}${n}`).join(' ')));
  if (input.mode === 'weapons') {
    const flying = d.tactical.missiles[0] !== null, full = crew.laserCharge >= LASER_CHARGE_UNITS;
    rows.push(heading('LASER', AMBER));
    rows.push(row('LOCK', ROOM_NAMES[crew.lock]!));
    const value = flying ? 'FROZEN' : full ? `HOLD ${((LASER_HOLD_TICKS - crew.laserHold) / TICK_HZ).toFixed(1)}` : `${Math.floor((crew.laserCharge / LASER_CHARGE_UNITS) * 100)}%`;
    rows.push({ ...row('CHARGE', value, DIM, full && !flying ? GOOD : TEXT), bar: { fill: crew.laserCharge / LASER_CHARGE_UNITS, colour: full ? GOOD : AMBER } });
    rows.push(row('MAG', `${crew.magazine}/${MAGAZINE}${flying ? ' FLYING' : ''}`));
  }
  rows.push(row('OTHER', d.present[other] ? 'PRESENT' : 'AWAY', DIM, d.present[other] ? TEXT : DIM));
  rows.push(row('', input.other));
  if (input.mode === 'interior') {
    const helm = d.interior.stations.occupant[d.nav]!, gun = d.interior.stations.occupant[d.weapons]!;
    const crewed = (pid: number): boolean => pid >= 0 && d.present[pid as 0 | 1];
    rows.push(heading('OUTSIDE', AMBER));
    rows.push(row('HELM', crewed(helm) ? 'CREWED' : 'EMPTY', DIM, crewed(helm) ? TEXT : WARN));
    if (!crewed(helm)) rows.push(row('', 'COASTING', DIM, WARN));
    rows.push(row('WEAPONS', crewed(gun) ? 'CREWED' : 'EMPTY', DIM, crewed(gun) ? TEXT : WARN));
    const dx = enemy.x - crew.x, dy = enemy.y - crew.y;
    rows.push(row('ENEMY', `${Math.round(Math.sqrt(dx * dx + dy * dy))}`));
    rows.push(row('BEARING', String(bearingDeg(dx, dy)).padStart(3, '0')));
    const m = d.tactical.missiles[1];
    if (m && (m.x - crew.x) ** 2 + (m.y - crew.y) ** 2 <= INCOMING_RANGE * INCOMING_RANGE) rows.push(heading('MISSILE INBOUND', WARN));
  }
  return rows;
}

/** Key help under the rows, per screen (spec §5 table). */
export function readoutHelp(mode: ReadoutMode): string[] {
  if (mode === 'helm') return ['W/S THRUST   A/D TURN', 'X STAND   TAB SWITCH', 'WHEEL - =  ZOOM   C SNAP', 'ESC PAUSE'];
  if (mode === 'weapons') return ['SPACE HOLD: CHARGE, FIRE', 'F MISSILE   A/D STEER', 'E/Q LOCK   C CAMERA', 'X STAND   TAB SWITCH', 'ESC PAUSE'];
  return ['WASD WALK', 'E SIT   HOLD E REPAIR', 'TAB SWITCH   ESC PAUSE'];
}

/** Rows the readout pool holds: the longest list (standing, Helm empty, a missile inbound) is 21. */
export const READOUT_ROWS = 22;
```

Create `src/renderer/src/render/duel/readoutPanel.ts`:

```ts
// The duel's side readout panel (H-1 spec §7 item 9, §8): draws readoutRows in the 220-px column on the right. Every
// display object is made at creation; a frame redraws the Graphics and sets text, so nothing is allocated per frame.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { INTERNAL_W } from '../../../../shared/resolution';
import { drawPanel } from '../panel';
import { BAR_OFF, DIM, FONT_NATIVE, FONT_SIZE, LINE, PAD } from '../theme';
import { READOUT_MARGIN, READOUT_ROWS, READOUT_W, type ReadoutRow } from './readoutModel';

const HELP_LINES = 5, HELP_LINE = 14, PIP = 12, PIP_GAP = 4;

export interface ReadoutPanel { container: Container; draw(rows: readonly ReadoutRow[], help: readonly string[]): void }

export function createReadoutPanel(opts: { fontFamily: string }): ReadoutPanel {
  const container = new Container();
  container.position.set(INTERNAL_W - READOUT_W - READOUT_MARGIN, READOUT_MARGIN);
  const bg = new Graphics(), marks = new Graphics();
  container.addChild(bg, marks);
  const mk = (size: number, anchorX: number): BitmapText => {
    const t = new BitmapText({ text: '', style: { fontFamily: opts.fontFamily, fontSize: size } });
    t.roundPixels = true; t.anchor.set(anchorX, 0); container.addChild(t); return t;
  };
  const labels: BitmapText[] = [], values: BitmapText[] = [], help: BitmapText[] = [];
  for (let k = 0; k < READOUT_ROWS; k++) { labels.push(mk(FONT_SIZE, 0)); values.push(mk(FONT_SIZE, 1)); }
  for (let k = 0; k < HELP_LINES; k++) { const t = mk(FONT_NATIVE, 0); t.tint = DIM; help.push(t); }
  const setText = (t: BitmapText, s: string): void => { if (t.text !== s) t.text = s; };
  let shownRows = -1, shownHelp = -1;
  return {
    container,
    draw(rows, lines) {
      const n = Math.min(rows.length, READOUT_ROWS), h = Math.min(lines.length, HELP_LINES);
      const helpY = PAD + LINE * n + PAD, height = helpY + h * HELP_LINE + PAD;
      if (n !== shownRows || h !== shownHelp) { bg.clear(); drawPanel(bg, 0, 0, READOUT_W, height); shownRows = n; shownHelp = h; }
      marks.clear();
      for (let k = 0; k < READOUT_ROWS; k++) {
        const r = rows[k], l = labels[k]!, v = values[k]!, y = PAD - 6 + LINE * k;
        l.visible = v.visible = k < n && r !== undefined;
        if (!r || k >= n) continue;
        setText(l, r.label); setText(v, r.value); l.tint = r.labelTint; v.tint = r.valueTint;
        l.position.set(PAD, y); v.position.set(READOUT_W - PAD, y);
        if (r.pips) for (let p = 0; p < r.pips.max; p++) {
          const x = READOUT_W - PAD - (r.pips.max - p) * (PIP + PIP_GAP) + PIP_GAP, lit = p < r.pips.n;
          marks.rect(x, y + 9, PIP, PIP).fill(lit ? r.pips.colour : BAR_OFF).stroke({ width: 1, color: r.pips.colour, alpha: lit ? 1 : 0.5 });
        }
        if (r.bar) {
          const w = READOUT_W - 2 * PAD;
          marks.rect(PAD, y + LINE + 1, w, 3).fill(BAR_OFF).rect(PAD, y + LINE + 1, Math.round(w * Math.max(0, Math.min(1, r.bar.fill))), 3).fill(r.bar.colour);
        }
      }
      help.forEach((t, k) => { t.visible = k < h; if (k < h) { setText(t, lines[k]!); t.position.set(PAD, helpY + k * HELP_LINE); } });
    }
  };
}
```

Create `src/renderer/src/render/duel/endScreen.ts`:

```ts
// The duel's end screen (H-1 spec §4 End): the outcome, the duel's length and how to start the next one. The model is
// pure; the layer is made once and only sets text and visibility.
import { BitmapText, Container, Graphics } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { Outcome } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
import { drawPanel } from '../panel';
import { AMBER, BACKDROP, BACKDROP_ALPHA, DIM, FONT_SIZE, GOOD, TEXT, TITLE_SIZE, WARN } from '../theme';

export interface EndView { title: string; tint: number; length: string; prompt: string }

/** The end card for a decided duel, or null while it runs. `ticks` is the duel's length in tactical ticks. */
export function endModel(outcome: number, ticks: number, seed: number): EndView | null {
  if (outcome === Outcome.Running) return null;
  const title = outcome === Outcome.CrewWins ? 'VICTORY' : outcome === Outcome.EnemyWins ? 'DEFEAT' : 'BOTH SHIPS LOST';
  const tint = outcome === Outcome.CrewWins ? GOOD : outcome === Outcome.EnemyWins ? WARN : AMBER;
  const s = Math.floor(ticks / TICK_HZ);
  return { title, tint, length: `DUEL LENGTH ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, prompt: `ENTER: NEW DUEL (SEED ${seed + 1})` };
}

export interface EndScreen { container: Container; draw(view: EndView | null): void }

const CARD_W = 560, CARD_H = 200;

export function createEndScreen(opts: { fontFamily: string }): EndScreen {
  const container = new Container();
  container.visible = false;
  const backdrop = new Graphics().rect(0, 0, INTERNAL_W, INTERNAL_H).fill({ color: BACKDROP, alpha: BACKDROP_ALPHA * 0.6 });
  const card = drawPanel(new Graphics(), (INTERNAL_W - CARD_W) / 2, (INTERNAL_H - CARD_H) / 2, CARD_W, CARD_H);
  container.addChild(backdrop, card);
  const mk = (size: number, tint: number, y: number): BitmapText => {
    const t = new BitmapText({ text: '', style: { fontFamily: opts.fontFamily, fontSize: size } });
    t.tint = tint; t.roundPixels = true; t.anchor.set(0.5, 0); t.position.set(INTERNAL_W / 2, y); container.addChild(t); return t;
  };
  const top = (INTERNAL_H - CARD_H) / 2;
  const title = mk(TITLE_SIZE, TEXT, top + 24), length = mk(FONT_SIZE, DIM, top + 96), prompt = mk(FONT_SIZE, AMBER, top + 140);
  return {
    container,
    draw(view) {
      container.visible = view !== null;
      if (!view) return;
      if (title.text !== view.title) title.text = view.title;
      title.tint = view.tint;
      if (length.text !== view.length) length.text = view.length;
      if (prompt.text !== view.prompt) prompt.text = view.prompt;
    }
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/duelReadout.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/render/duel/readoutModel.ts src/renderer/src/render/duel/readoutPanel.ts src/renderer/src/render/duel/endScreen.ts tests/duelReadout.test.ts
git commit -m "feat(helm): the duel readout column with both hulls, and the end screen (Helm H-1b)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 5: The duel runtime

**Files:**
- Replace: `src/renderer/src/app/duel/runtime.ts`
- Create: `tests/duelRuntime.test.ts`

**Interfaces:**
- Consumes: `createTickDriver` (`authority/tickDriver.ts`) and `HeldInput`, `Scheduler` (`net/contracts.ts`), unchanged; `createDuel`, `disposeDuel`, `stepDuelTick`, `DuelCommand`, `DuelEnvelope`, `DuelResult`, `ShipLayout`, unchanged; H-1a's camera, `followTarget`, `PrevBody`, `helmAxes`, `accumulateWheel`, `emptyPresses`, `KeySample`, `PointerSample`; Task 2's `ViewEvent`; Task 3's controls; Task 4's `OtherStatus`.
- Produces (`app/duel/runtime.ts`, beside H-1a's unchanged `PauseReason`, `FlightRuntimeDeps`, `FlightRuntime`, `createFlightRuntime`):
  - `type DuelView = 'helm' | 'weapons' | 'interior'`;
  - `interface DuelRuntimeDeps extends FlightRuntimeDeps { layout: ShipLayout; clearKeys?(): void }`;
  - `interface DuelRuntime { readonly duel; readonly seed; epoch(); active(): 0 | 1; view(): DuelView; otherStatus(): OtherStatus; readonly prev; readonly missilePrev; readonly crewPrev; readonly cameras: { helm; weapons }; axes(); steer(); held(); alpha(); frame(dt); pause(r); resume(r); paused(); reasons(); drainEvents(): ViewEvent[]; lastResults(): readonly DuelResult[]; ended(); dispose() }`;
  - `createDuelRuntime(deps: DuelRuntimeDeps): DuelRuntime`.

- [ ] **Step 1: Write the failing test**

Create `tests/duelRuntime.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position } from '../src/renderer/src/sim/components';
import { Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { REPAIR_RATE_SOLO } from '../src/renderer/src/sim/duel/tuning';
import { emptyPresses, type KeyAction, type KeySample, type PointerSample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { ZOOM_DEFAULT, ZOOM_STEP } from '../src/renderer/src/render/tactical/camera';

const layout = parseShip(cutter);
const TICK_MS = 1000 / 60;

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
const idle = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });
/** Scripted keys: the test sets held keys and presses, `frame()` samples them once and runs due ticks. */
function rig(seed = 5) {
  const time = fakeTime();
  let keys = idle(), cleared = 0;
  const pointer: PointerSample = { x: null, y: null, wheel: 0, dragX: 0, dragY: 0 };
  const rt = createDuelRuntime({
    now: time.now, scheduler: time.scheduler, seed, viewport: { w: 1280, h: 720 }, layout,
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ ...pointer }),
    clearKeys: () => { keys = idle(); cleared++; }
  });
  const hold = (h: Partial<Omit<KeySample, 'presses'>>): void => { keys = { ...keys, ...h }; };
  const press = (...actions: KeyAction[]): void => { const p = { ...keys.presses }; for (const a of actions) p[a]++; keys = { ...keys, presses: p }; };
  /** One frame, then one tick's worth of wall time with a frame after it (so the press is sent on exactly one tick). */
  const tick = (): void => { rt.frame(1 / 60); time.advance(TICK_MS); rt.frame(1 / 60); };
  const ticks = (n: number): void => { for (let k = 0; k < n; k++) tick(); };
  return { time, rt, hold, press, tick, ticks, cleared: () => cleared };
}
const put = (rt: ReturnType<typeof rig>['rt'], pid: number, tx: number, ty: number): void => {
  const eid = rt.duel.interior.crew[pid]!; Position.x[eid] = tx + 0.5; Position.y[eid] = ty + 0.5;
};

describe('the duel runtime (H-1 spec §4, §5)', () => {
  it('solo start: player 0 at the Helm; player 1 goes away on tick 0, ahead of any other command', () => {
    const { rt, press, tick } = rig();
    expect([rt.active(), rt.view()]).toEqual([0, 'helm']);
    press('stand'); tick();
    expect(rt.duel.interior.tick).toBe(1);
    expect(rt.lastResults().map((r) => [r.id.player, r.id.sequence, r.tick, r.status])).toEqual([[0, 0, 0, 'applied'], [1, 0, 0, 'applied']]);
    expect(rt.duel.present).toEqual([true, false]);
    rt.dispose();
  });
  it('steps at 60 Hz from the wall clock; commands carry the duel tick', () => {
    const { time, rt } = rig();
    time.advance(1010);
    expect(rt.duel.interior.tick).toBe(60);
    expect(rt.duel.tactical.tick).toBe(60);
    rt.dispose();
  });
  it('Tab switches presence on one tick, clears the keyboard and leaves the old character neutral', () => {
    const { rt, hold, press, tick, cleared } = rig();
    hold({ moveY: -1 }); tick();
    expect(rt.held()[0]).toEqual({ moveX: 0, moveY: -1, interactHeld: false });
    expect(rt.axes()).toEqual({ turn: 0, thrust: 1 });
    press('switch'); tick();
    const presence = rt.lastResults().filter((r) => r.status === 'applied').map((r) => [r.id.player, r.tick]);
    expect(presence).toEqual([[0, 1], [1, 1]]);   // the character left, then the one taken, on the same tick
    expect(rt.duel.present).toEqual([false, true]);
    expect([rt.active(), rt.view(), rt.otherStatus()]).toEqual([1, 'weapons', 'AT HELM']);
    expect(cleared()).toBe(1);
    expect(rt.held()).toEqual([{ moveX: 0, moveY: 0, interactHeld: false }, { moveX: 0, moveY: 0, interactHeld: false }]);
    expect(rt.axes()).toEqual({ turn: 0, thrust: 0 });   // the Helm is empty: the ship coasts
    press('switch'); tick();
    expect([rt.active(), rt.duel.present]).toEqual([0, [true, false]]);
    rt.dispose();
  });
  it('X stands into the interior; E sits again at the role console in reach', () => {
    const { rt, press, tick } = rig();
    press('stand'); tick();
    expect(rt.view()).toBe('interior');
    press('interact'); tick();
    expect(rt.view()).toBe('helm');
    rt.dispose();
  });
  it('walking by scripted keys from the Weapons console to the Engines repair point and holding E repairs it', () => {
    const { rt, hold, press, tick, ticks } = rig();
    press('switch'); tick(); press('stand'); tick();   // the gunner stands up at the Weapons console (8, 6)
    rt.duel.tactical.ships[0].rooms[Room.Engines] = 1;
    const eid = rt.duel.interior.crew[1]!;
    expect([Position.x[eid], Position.y[eid]]).toEqual([8.5, 6.5]);
    hold({ moveX: -1 }); ticks(100);                   // west along row 6: the door at 6, the Aft Passage, the door at 4, into Engines
    hold({ moveX: 0 }); tick();
    expect(Position.y[eid]).toBe(6.5);
    expect(Position.x[eid]!).toBeLessThan(4); expect(Position.x[eid]!).toBeGreaterThan(1);
    expect(rt.duel.repair[Room.Engines]).toBe(0);
    hold({ interactHeld: true }); ticks(10);
    expect(rt.duel.repair[Room.Engines]).toBe(10 * REPAIR_RATE_SOLO);
    expect(rt.view()).toBe('interior');
    rt.dispose();
  });
  it('Tab then X sampled in separate frames before one tick: the stand still applies, on the following tick', () => {
    const { rt, press, tick } = rig();
    tick();
    press('switch'); rt.frame(1 / 60); press('stand'); tick();   // both edges before the Tab's presence tick runs
    expect([rt.active(), rt.duel.present]).toEqual([1, [false, true]]);
    tick();
    expect(rt.lastResults().map((r) => [r.id.player, r.status])).toEqual([[1, 'applied']]);
    expect(rt.view()).toBe('interior');
    rt.dispose();
  });
  it('Tab then E at a free console sampled in separate frames before one tick: the sit still applies', () => {
    const { rt, press, tick } = rig();
    press('stand'); tick();                                       // player 0 stands at the Navigation console
    press('switch'); tick();
    press('switch'); rt.frame(1 / 60); press('interact'); tick(); // back to player 0, then E before the presence tick
    tick();
    expect([rt.active(), rt.view()]).toEqual([0, 'helm']);
    rt.dispose();
  });
  it('holding E at a damaged room repairs it; the press does not sit while a repair is in reach', () => {
    const { rt, hold, press, tick, ticks } = rig();
    press('switch'); tick(); press('stand'); tick();   // the gunner stands up at Weapons
    expect(rt.view()).toBe('interior');
    rt.duel.tactical.ships[0].rooms[Room.Weapons] = 1;
    put(rt, 1, 8, 6);                                  // beside the Weapons console and in reach of the Weapons repair point (8, 7)
    hold({ interactHeld: true }); press('interact'); tick();
    expect(rt.view()).toBe('interior');                // no sit: holding E repairs
    expect(rt.duel.repair[Room.Weapons]).toBe(REPAIR_RATE_SOLO);
    expect(rt.otherStatus()).toBe('AT HELM');
    ticks(9);
    expect(rt.duel.repair[Room.Weapons]).toBe(10 * REPAIR_RATE_SOLO);
    hold({ interactHeld: false }); rt.duel.tactical.ships[0].rooms[Room.Weapons] = 0;
    press('interact'); tick();
    expect(rt.view()).toBe('weapons');                 // nothing to repair now: the same press sits
    rt.dispose();
  });
  it('W/A/S/D walk while standing; the inactive character never moves', () => {
    const { rt, hold, press, tick, ticks } = rig();
    press('stand'); tick();
    const eid = rt.duel.interior.crew[0]!, x0 = Position.x[eid]!, other = rt.duel.interior.crew[1]!, o = [Position.x[other], Position.y[other]];
    hold({ moveX: -1 }); ticks(20);
    expect(Position.x[eid]!).toBeLessThan(x0 - 0.5);
    expect([Position.x[other], Position.y[other]]).toEqual(o);
    rt.dispose();
  });
  it('Space charges and its release fires at full charge; E and Q cycle the lock', () => {
    const { rt, hold, press, tick, ticks } = rig();
    press('switch'); tick();
    const ship = rt.duel.tactical.ships[0];
    expect(ship.lock).toBe(Room.Shields);
    press('interact'); tick(); expect(ship.lock).toBe(Room.Engines);
    press('interact'); tick(); expect(ship.lock).toBe(Room.Weapons);
    press('prevLock', 'prevLock'); tick(); expect(ship.lock).toBe(Room.Shields);
    hold({ fireHeld: true }); press('fireDown'); tick();
    expect(ship.fireHeld).toBe(true); expect(ship.laserCharge).toBeGreaterThan(0);
    ticks(240);
    expect(ship.laserCharge).toBe(LASER_CHARGE_UNITS);
    rt.drainEvents();
    hold({ fireHeld: false }); press('fireUp'); tick();
    expect(ship.shots).toBe(1);
    expect(rt.drainEvents().some((e) => e.kind === 'laser' && e.ship === 0)).toBe(true);
    rt.dispose();
  });
  it('a partial charge released early is discarded', () => {
    const { rt, hold, press, tick, ticks } = rig();
    press('switch'); tick();
    hold({ fireHeld: true }); press('fireDown'); ticks(30);
    hold({ fireHeld: false }); press('fireUp'); tick();
    expect([rt.duel.tactical.ships[0].shots, rt.duel.tactical.ships[0].laserCharge]).toEqual([0, 0]);
    rt.dispose();
  });
  it('a blur that swallows the Space release still lets go of the charge (H-1a review carry-over)', () => {
    const { rt, hold, press, tick } = rig();
    press('switch'); tick();
    hold({ fireHeld: true }); press('fireDown'); tick();
    expect(rt.duel.tactical.ships[0].fireHeld).toBe(true);
    rt.pause('blur'); hold({ fireHeld: false }); tick();   // the keyboard was cleared: no keyup, no fireUp edge
    expect(rt.duel.tactical.ships[0].fireHeld).toBe(true);   // paused: nothing sent yet
    rt.resume('blur'); tick();
    expect(rt.lastResults().map((r) => r.status)).toEqual(['applied']);
    expect(rt.duel.tactical.ships[0].fireHeld).toBe(false);
    rt.dispose();
  });
  it('F launches a missile, A/D steer it, C toggles the Weapons camera to the missile and back', () => {
    const { rt, hold, press, tick, ticks } = rig();
    press('switch'); tick();
    press('launch'); tick();
    expect(rt.duel.tactical.missiles[0]).not.toBeNull();
    const h0 = rt.duel.tactical.missiles[0]!.heading;
    hold({ moveX: 1 }); ticks(10);
    expect(rt.steer()).toBe(1);
    expect(rt.duel.tactical.missiles[0]!.heading).not.toBe(h0);
    press('camera'); tick();
    expect(rt.cameras.weapons.follow).toBe('missile');
    expect(rt.cameras.helm.follow).toBe('ship');   // each console keeps its own camera
    press('camera'); tick();
    expect(rt.cameras.weapons.follow).toBe('ship');
    press('camera'); tick();
    rt.duel.tactical.missiles[0] = null; tick();      // the followed missile ended: back to the ship
    expect(rt.cameras.weapons.follow).toBe('ship');
    rt.dispose();
  });
  it('X stands from Weapons too; the zoom keys move only the active console camera', () => {
    const { rt, press, tick } = rig();
    press('zoomIn'); tick();
    expect(rt.cameras.helm.targetZoom).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP, 12);
    press('switch'); tick(); press('zoomOut'); tick();
    expect(rt.cameras.weapons.targetZoom).toBeCloseTo(ZOOM_DEFAULT / ZOOM_STEP, 12);
    expect(rt.cameras.helm.targetZoom).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP, 12);
    press('stand'); tick();
    expect(rt.view()).toBe('interior');
    rt.dispose();
  });
  it('contact sparks come from hit-counter increases', () => {
    const { rt, tick } = rig();
    tick(); rt.drainEvents();
    rt.duel.tactical.ships[0].planetHits++; rt.duel.tactical.ships[1].asteroidHits++;
    tick();
    const contacts = rt.drainEvents().filter((e) => e.kind === 'contact');
    expect(contacts.map((e) => e.kind === 'contact' && [e.ship, e.body])).toEqual([[0, 'planet'], [1, 'asteroid']]);
    tick();
    expect(rt.drainEvents().filter((e) => e.kind === 'contact')).toEqual([]);
    rt.dispose();
  });
  it('keeps the pause reasons: focus never undoes Escape; gameplay presses are dropped while paused', () => {
    const { time, rt, press, tick } = rig();
    tick(); const t0 = rt.duel.interior.tick;
    press('pause'); rt.frame(1 / 60);
    expect([...rt.reasons()]).toEqual(['user']);
    rt.pause('blur'); rt.resume('blur');
    press('stand'); tick(); time.advance(500); rt.frame(1 / 60);
    expect(rt.duel.interior.tick).toBe(t0);
    press('pause'); rt.frame(1 / 60);
    rt.pause('hidden'); rt.pause('suspend'); time.advance(500); expect(rt.duel.interior.tick).toBe(t0);
    rt.resume('hidden'); rt.resume('suspend'); time.advance(500);
    expect(rt.duel.interior.tick).toBe(t0 + 30);
    expect(rt.view()).toBe('helm');   // the X pressed while paused was dropped
    rt.dispose();
  });
  it('the duel ends, stepping stops, and Enter restarts with seed + 1, a fresh tick epoch and the solo start again', () => {
    const { time, rt, press, tick, cleared } = rig(7);
    press('switch'); tick(); press('zoomIn'); tick();
    rt.duel.tactical.ships[1].hull = 0; tick();
    expect(rt.duel.tactical.outcome).toBe(Outcome.CrewWins);
    expect(rt.ended()).toBe(true);
    const stopped = rt.duel.interior.tick;
    time.advance(1000); rt.frame(1 / 60);
    expect(rt.duel.interior.tick).toBe(stopped);
    const old = rt.duel, before = cleared();
    press('confirm'); rt.frame(1 / 60);
    expect(rt.duel).not.toBe(old);
    expect([rt.seed, rt.epoch(), rt.active(), rt.view(), rt.ended()]).toEqual([8, 1, 0, 'helm', false]);
    expect(rt.duel.interior.tick).toBe(0);
    expect(cleared()).toBe(before + 1);
    expect([rt.cameras.helm.targetZoom, rt.cameras.weapons.targetZoom]).toEqual([ZOOM_DEFAULT, ZOOM_DEFAULT]);
    expect(rt.drainEvents()).toEqual([]);
    time.advance(TICK_MS + 0.01); rt.frame(1 / 60);
    expect(rt.duel.interior.tick).toBe(1);   // a fresh epoch: no burst for the time spent on the end screen
    expect(rt.lastResults().map((r) => [r.id.player, r.id.sequence, r.tick])).toEqual([[1, 0, 0]]);
    expect(rt.duel.present).toEqual([true, false]);
    rt.dispose();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/duelRuntime.test.ts`
Expected: FAIL, all 17 tests fail with "TypeError: (0 , createDuelRuntime) is not a function" (H-1a's `runtime.ts` has no duel runtime yet).

- [ ] **Step 3: Write the duel runtime beside the flight runtime**

Replace the whole of `src/renderer/src/app/duel/runtime.ts` with:

```ts
// The local runtimes for the Helm demo views (H-1 spec §4, §9): the renderer steps the sim itself on a 60 Hz wall-clock
// driver until H-0c-ii puts the duel behind the authority. The flight runtime steps the single-ship flight; the duel
// runtime steps stepDuelTick with the solo player's commands (spec §5) and owns both console cameras.
import { createTickDriver } from '../../authority/tickDriver';
import type { HeldInput, Scheduler } from '../../net/contracts';
import { Position } from '../../sim/components';
import type { DuelCommand, DuelEnvelope, DuelResult } from '../../sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../../sim/duel/state';
import { stepDuelTick } from '../../sim/duel/step';
import type { ShipLayout } from '../../sim/ship/schema';
import { stepSoloFlight } from '../../sim/tactical/physics';
import { createTacticalState, NO_AXES, Outcome, type Axes, type TacticalState } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
import { createCamera, followBody, pan, snapBack, updateCamera, zoomBy, type Camera, type Viewport } from '../../render/tactical/camera';
import { createFeelTracker, recordFeel, type FeelTracker } from '../../render/tactical/feelModel';
import type { OtherStatus } from '../../render/duel/readoutModel';
import type { ViewEvent } from '../../render/tactical/fxModel';
import { followTarget, type PrevBody } from '../../render/tactical/tacticalModel';
import { consoleInReach, cycleLock, repairInReach, seatOf } from './controls';
import { accumulateWheel, emptyPresses, helmAxes, WHEEL_IDLE_MS, type KeySample, type PointerSample } from './input';

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
  /** Render interpolation, fixed once per frame(): (now − last tick time) · 60 / 1000, clamped to 0..1; 1 before the first tick. */
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

/**
 * The pause-reason set and the tick driver it gates. A pause discards the driver, and with it any ticks already due:
 * resuming (or `restart`) starts a fresh driver at the current wall time, so a delayed frame that pauses (or a long blur)
 * never catches up in a burst afterwards. `halted` stops the driver for good until the next restart (a duel's end).
 */
function createPacer(now: () => number, scheduler: Scheduler, onTick: (tick: number, tickTimeMs: number) => void, halted: () => boolean = () => false) {
  const reasons = new Set<PauseReason>();
  let driver: ReturnType<typeof createTickDriver> | null = null, disposed = false;
  const sync = (): void => {
    if (disposed) return;
    const run = reasons.size === 0 && !halted();
    if (!run && driver) { driver.dispose(); driver = null; }
    else if (run && !driver) driver = createTickDriver({ nowMs: now }, scheduler, onTick);
  };
  sync();
  return {
    reasons, sync,
    pump(): void { driver?.pump(); },
    toggleUser(n: number): void { for (let k = 0; k < n; k++) { if (reasons.has('user')) reasons.delete('user'); else reasons.add('user'); } },
    /** Drop the driver now and start a fresh one (if running is allowed) at the current wall time. */
    restart(): void { driver?.dispose(); driver = null; sync(); },
    dispose(): void { disposed = true; driver?.dispose(); driver = null; }
  };
}

/** The per-frame camera input shared by both runtimes: zoom keys, drag before wheel (a pan clears the zoom anchor, so a
 *  drag and a wheel in one frame still zoom about the cursor), and the wheel's notch accumulator with its idle reset. */
function createCameraInput(now: () => number, vp: Viewport) {
  let wheelAcc = 0, lastWheelAt = -Infinity;
  return {
    apply(camera: Camera, k: KeySample, p: PointerSample): void {
      zoomBy(camera, vp, k.presses.zoomIn - k.presses.zoomOut);
      pan(camera, p.dragX, p.dragY);
      const t = now();
      if (t - lastWheelAt > WHEEL_IDLE_MS) wheelAcc = 0;   // check the idle gap before recording this frame's wheel
      if (p.wheel !== 0) lastWheelAt = t;
      const w = accumulateWheel(wheelAcc, p.wheel); wheelAcc = w.acc;
      zoomBy(camera, vp, w.notches, p.x !== null && p.y !== null ? { x: p.x, y: p.y } : null);
    },
    reset(): void { wheelAcc = 0; lastWheelAt = -Infinity; }
  };
}

const alphaAt = (now: number, lastTickTime: number | null): number => lastTickTime === null ? 1 : Math.max(0, Math.min(1, (now - lastTickTime) * TICK_HZ / 1000));

export function createFlightRuntime(deps: FlightRuntimeDeps): FlightRuntime {
  const state = createTacticalState(deps.seed);
  const prev: PrevBody[] = state.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
  const camera = createCamera(state.ships[0].x, state.ships[0].y);
  const feel = createFeelTracker();
  let held: Axes = NO_AXES, sent: Axes = NO_AXES, lastTickTime: number | null = null;
  const onTick = (_tick: number, tickTimeMs: number): void => {
    state.ships.forEach((s, i) => { const p = prev[i]!; p.x = s.x; p.y = s.y; p.h = s.heading + s.headingAcc; });
    sent = held;
    stepSoloFlight(state, sent);
    recordFeel(feel, state.ships[0], state.map.planet);
    lastTickTime = tickTimeMs;
  };
  const pacer = createPacer(deps.now, deps.scheduler, onTick), cameraInput = createCameraInput(deps.now, deps.viewport);
  let frameAlpha = 1;
  const alpha = (): number => frameAlpha;
  return {
    state, prev, camera, feel, alpha,
    axes: () => sent,
    frame(dt) {
      const k = deps.sampleKeys(), p = deps.samplePointer();
      held = helmAxes(k);
      pacer.toggleUser(k.presses.pause);
      pacer.sync();     // an Escape this frame pauses before any due tick runs
      pacer.pump();     // run any due ticks with this frame's held axes before drawing (no driver while paused)
      frameAlpha = alphaAt(deps.now(), lastTickTime);
      if (k.presses.camera > 0) snapBack(camera);
      cameraInput.apply(camera, k, p);
      updateCamera(camera, deps.viewport, dt, followTarget(state, prev, frameAlpha, camera.follow));
    },
    pause(reason) { pacer.reasons.add(reason); pacer.sync(); },
    resume(reason) { pacer.reasons.delete(reason); pacer.sync(); },
    paused: () => pacer.reasons.size > 0,
    reasons: () => pacer.reasons,
    dispose() { pacer.dispose(); }
  };
}

/** What the active character's screen is (spec §1): its console's map view when seated, the interior when standing. */
export type DuelView = 'helm' | 'weapons' | 'interior';

export interface DuelRuntimeDeps extends FlightRuntimeDeps {
  /** The Cutter (spec parent §8). */
  layout: ShipLayout;
  /** Drop the keyboard's held keys and press edges (Tab and restart, spec §4, §5). */
  clearKeys?(): void;
}

export interface DuelRuntime {
  /** The duel now running; a restart replaces it. */
  readonly duel: DuelState;
  readonly seed: number;
  /** How many restarts so far: a view that sees it change rebuilds its caches (spec §4 restart). */
  epoch(): number;
  /** The player the keyboard drives (spec §5): 0 at the start of every duel. */
  active(): 0 | 1;
  view(): DuelView;
  /** The other character's status for the readouts (spec §7 item 9). */
  otherStatus(): OtherStatus;
  /** Before the last tick: each ship's position and heading, each ship's missile (or null), each character's position. */
  readonly prev: readonly PrevBody[];
  readonly missilePrev: readonly (PrevBody | null)[];
  readonly crewPrev: readonly { x: number; y: number }[];
  /** Each console's own camera, kept for whoever sits there next (spec §6). */
  readonly cameras: { readonly helm: Camera; readonly weapons: Camera };
  /** The Helm's axes and the gunner's steering the last tick sent (zero while that console is empty, spec §7). */
  axes(): Axes;
  steer(): number;
  /** The held input the last tick sent, per player. */
  held(): readonly HeldInput[];
  alpha(): number;
  frame(dt: number): void;
  pause(reason: PauseReason): void;
  resume(reason: PauseReason): void;
  paused(): boolean;
  reasons(): ReadonlySet<PauseReason>;
  /** The view events queued since the last call: the sim's events and the detected contacts (spec §7 item 8). */
  drainEvents(): ViewEvent[];
  /** The results of the last tick's commands (for tests and the console log). */
  lastResults(): readonly DuelResult[];
  /** True once the duel's outcome is decided: stepping has stopped and Enter restarts (spec §4). */
  ended(): boolean;
  dispose(): void;
}

const NEUTRAL: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const IDLE_KEYS = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });
const shipBody = (s: TacticalState['ships'][number]): PrevBody => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc });
const missileBody = (m: TacticalState['missiles'][number]): PrevBody | null => (m ? { x: m.x, y: m.y, h: m.heading + m.headingAcc } : null);
const hitCounts = (d: DuelState): number[][] => d.tactical.ships.map((s) => [s.planetHits, s.asteroidHits, s.shipHits]);

export function createDuelRuntime(deps: DuelRuntimeDeps): DuelRuntime {
  let seed = deps.seed, d = createDuel(deps.layout, seed), epoch = 0;
  let active: 0 | 1 = 0, firstTick = true, seq = [0, 0], pending: { player: number; command: DuelCommand }[] = [];
  // The sim checks sits and stands against presence before it applies that tick's presence commands, so a seat change
  // queued after a Tab waits here until the Tab's presence tick has run, then goes out on the following tick.
  let switching = false, deferred: { player: number; command: DuelCommand }[] = [];
  let activeHeld: HeldInput = NEUTRAL, sentHeld: readonly HeldInput[] = [NEUTRAL, NEUTRAL], sentAxes: Axes = NO_AXES, sentSteer = 0;
  let chargeSent = false, events: ViewEvent[] = [], results: DuelResult[] = [], counts = hitCounts(d), lastTickTime: number | null = null, frameAlpha = 1;
  let prev: PrevBody[] = [], missilePrev: (PrevBody | null)[] = [], crewPrev: { x: number; y: number }[] = [], cameras = { helm: createCamera(), weapons: createCamera() };
  const capture = (): void => {
    prev = d.tactical.ships.map(shipBody);
    missilePrev = d.tactical.missiles.map(missileBody);
    crewPrev = d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));
  };
  const freshCameras = (): void => { const s = d.tactical.ships[0]; cameras = { helm: createCamera(s.x, s.y), weapons: createCamera(s.x, s.y) }; };
  capture(); freshCameras();
  const ended = (): boolean => d.tactical.outcome !== Outcome.Running;
  /** The player seated at station i who is present, or −1 (the sim's attendant rule). */
  const attendant = (station: number): number => { const pid = d.interior.stations.occupant[station]!; return pid >= 0 && d.present[pid as 0 | 1] ? pid : -1; };

  const onTick = (_tick: number, tickTimeMs: number): void => {
    if (ended()) return;
    capture();
    const commands: DuelEnvelope[] = [];
    const envelope = (player: number, command: DuelCommand): DuelEnvelope => ({ id: { player, sequence: seq[player]!++ }, requestedTick: d.interior.tick, command });
    if (firstTick) { commands.push(envelope(1, { kind: 'presence', present: false })); firstTick = false; }   // the solo start rule (spec §4)
    for (const c of pending) commands.push(envelope(c.player, c.command));
    const sentSwitch = switching;
    pending = [];
    const held: HeldInput[] = [NEUTRAL, NEUTRAL];
    held[active] = activeHeld;
    results = stepDuelTick(d, { held, commands });
    sentHeld = held;
    const helm = attendant(d.nav), gunner = attendant(d.weapons);
    sentAxes = helm >= 0 ? helmAxes(held[helm]!) : NO_AXES;
    sentSteer = gunner >= 0 ? Math.sign(held[gunner]!.moveX) || 0 : 0;
    for (const e of d.tactical.events) events.push(e);
    // Contact sparks (spec §7 item 8): the sim emits no contact events, so an increase in a hit counter is one.
    const now = hitCounts(d);
    d.tactical.ships.forEach((s, i) => (['planet', 'asteroid', 'ship'] as const).forEach((body, k) => {
      if (now[i]![k]! > counts[i]![k]!) events.push({ kind: 'contact', ship: i, body, x: s.x, y: s.y });
    }));
    counts = now;
    if (sentSwitch) { switching = false; pending = deferred; deferred = []; }   // presence applied: the held seat changes go next tick
    lastTickTime = tickTimeMs;
    if (ended()) pacer.sync();   // the duel is decided: stop stepping (spec §4 End)
  };
  const pacer = createPacer(deps.now, deps.scheduler, onTick, ended), cameraInput = createCameraInput(deps.now, deps.viewport);
  const queue = (command: DuelCommand): void => {
    const seat = command.kind === 'sit' || command.kind === 'stand';
    (seat && switching ? deferred : pending).push({ player: active, command });
  };

  function restart(): void {
    disposeDuel(d);
    seed += 1; d = createDuel(deps.layout, seed); epoch++;
    active = 0; firstTick = true; seq = [0, 0]; pending = []; switching = false; deferred = [];
    activeHeld = NEUTRAL; sentHeld = [NEUTRAL, NEUTRAL]; sentAxes = NO_AXES; sentSteer = 0;
    chargeSent = false; events = []; results = []; counts = hitCounts(d); lastTickTime = null; frameAlpha = 1;
    capture(); freshCameras(); cameraInput.reset();
    deps.clearKeys?.();
    pacer.restart();   // a fresh driver: the new duel's ticks start from now
  }

  /** One frame's press edges for the active character, by where it is (spec §5 table). */
  function play(k: KeySample): KeySample {
    if (k.presses.switch > 0) {   // Tab: presence false for the character left, true for the one taken, same tick; nothing carries over
      for (let n = 0; n < k.presses.switch; n++) {
        queue({ kind: 'presence', present: false });
        active = active === 0 ? 1 : 0;
        queue({ kind: 'presence', present: true });
      }
      switching = true;
      chargeSent = false;   // the console left is empty from this tick: the sim lets go of Fire without firing
      deps.clearKeys?.();
      return IDLE_KEYS();
    }
    const seat = seatOf(d, active), p = k.presses;
    if (seat === 'standing') {
      if (p.interact > 0 && repairInReach(d, active) < 0) { const c = consoleInReach(d, active); if (c >= 0) queue({ kind: 'sit', station: c }); }
      return k;
    }
    if (p.stand > 0) { queue({ kind: 'stand' }); chargeSent = false; return k; }
    if (seat === 'helm') { if (p.camera > 0) snapBack(cameras.helm); return k; }
    const steps = p.interact - p.prevLock;
    if (p.interact + p.prevLock > 0) {
      const last = [...pending].reverse().find((c) => c.player === active && c.command.kind === 'laserLock')?.command;
      let room = last && last.kind === 'laserLock' ? last.room : d.tactical.ships[0].lock;
      for (let n = 0; n < Math.abs(steps); n++) room = cycleLock(room, steps > 0 ? 1 : -1);
      queue({ kind: 'laserLock', room });
    }
    const down = (): void => { queue({ kind: 'laserCharge', held: true }); chargeSent = true; };
    const up = (): void => { queue({ kind: 'laserCharge', held: false }); chargeSent = false; };
    if (p.fireDown > 0 && p.fireUp > 0) { if (k.fireHeld) { up(); down(); } else { down(); up(); } }
    else if (p.fireDown > 0) down();
    else if (p.fireUp > 0) up();
    else if (chargeSent && !k.fireHeld) up();   // a release the keyboard never saw (a blur cleared it): let go now
    if (p.launch > 0) queue({ kind: 'missileLaunch' });
    if (p.camera > 0) {
      const cam = cameras.weapons;
      snapBack(cam, d.tactical.missiles[0] && cam.follow !== 'missile' ? 'missile' : 'ship');
    }
    return k;
  }

  return {
    get duel() { return d; },
    get seed() { return seed; },
    get prev() { return prev; },
    get missilePrev() { return missilePrev; },
    get crewPrev() { return crewPrev; },
    get cameras() { return cameras; },
    epoch: () => epoch,
    active: () => active,
    view: () => { const s = seatOf(d, active); return s === 'standing' ? 'interior' : s; },
    otherStatus() {
      const other = active === 0 ? 1 : 0, s = seatOf(d, other);
      if (s !== 'standing') return s === 'helm' ? 'AT HELM' : 'AT WEAPONS';
      return d.present[other] && sentHeld[other]!.interactHeld && repairInReach(d, other) >= 0 ? 'REPAIRING' : 'WALKING';
    },
    axes: () => sentAxes,
    steer: () => sentSteer,
    held: () => sentHeld,
    alpha: () => frameAlpha,
    frame(dt) {
      let k = deps.sampleKeys();
      const p = deps.samplePointer();
      pacer.toggleUser(k.presses.pause);
      if (ended()) { if (k.presses.confirm > 0) { restart(); k = IDLE_KEYS(); } }
      else if (pacer.reasons.size === 0) k = play(k);   // while paused, gameplay presses are dropped; the camera still moves
      activeHeld = { moveX: k.moveX, moveY: k.moveY, interactHeld: k.interactHeld };
      pacer.sync();   // an Escape this frame pauses before any due tick runs
      pacer.pump();
      frameAlpha = alphaAt(deps.now(), lastTickTime);
      const view = seatOf(d, active), cam = view === 'helm' ? cameras.helm : view === 'weapons' ? cameras.weapons : null;
      if (cam) cameraInput.apply(cam, k, p);
      for (const c of [cameras.helm, cameras.weapons]) {
        if (c.follow === 'missile' && !d.tactical.missiles[0]) followBody(c, 'ship');   // the followed missile ended
        updateCamera(c, deps.viewport, dt, followTarget(d.tactical, prev, frameAlpha, c.follow));
      }
    },
    pause(reason) { pacer.reasons.add(reason); pacer.sync(); },
    resume(reason) { pacer.reasons.delete(reason); pacer.sync(); },
    paused: () => pacer.reasons.size > 0,
    reasons: () => pacer.reasons,
    drainEvents() { const out = events; events = []; return out; },
    lastResults: () => results,
    ended,
    dispose() { pacer.dispose(); disposeDuel(d); }
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/duelRuntime.test.ts tests/flightRuntime.test.ts`
Expected: PASS, 30 tests in 2 files (17 new) (the flight runtime's tests pass unchanged on the shared pacer and camera input).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/app/duel/runtime.ts tests/duelRuntime.test.ts
git commit -m "feat(helm): the solo duel runtime on stepDuelTick: Tab presence, commands, end and restart (Helm H-1b)"
```

(End the message with your session's Co-Authored-By trailer.)

---

### Task 6: The duel mode and `dev:duel`

**Files:**
- Create: `src/renderer/src/app/duel/duelMode.ts`
- Replace: `src/renderer/src/app/duel/mode.ts`, `src/renderer/src/main.ts`, `src/main/index.ts`, `package.json`, `tests/flightRuntime.test.ts`

**Interfaces:**
- Consumes: every earlier task; `Renderer` (`render/renderer.ts`), `computeLetterbox`, `createDuelKeyboard`, `createPointerSource`, `EventSource`, all unchanged.
- Produces:
  - `app/duel/duelMode.ts`: `interface DuelModeDeps { renderer; seed; layout; lifecycle? }`; `startDuelMode(deps: DuelModeDeps): () => void` (returns its dispose).
  - `app/duel/mode.ts`: `type AppMode = 'sector' | 'flight' | 'duel'`; `readMode` returns `'duel'` for exactly `?mode=duel`.
  - `main.ts`: `startDuel(seed)` beside today's `startSector()` and `startFlight(seed)`, both unchanged; `start()` chooses among the three.
  - `package.json`: `"dev:duel": "tsx scripts/dev-mode.ts duel"`.

- [ ] **Step 1: Update the mode test**

Replace the whole of `tests/flightRuntime.test.ts` with:

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
    time.advance(1000 / 60 / 2); rt.frame(1 / 60);
    expect(rt.alpha()).toBeGreaterThan(0.45); expect(rt.alpha()).toBeLessThanOrEqual(0.55);
    rt.pause('user');
    time.advance(1000); rt.frame(1 / 60);
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
  it('flight for ?mode=flight, the duel for ?mode=duel; anything else is the sector game', () => {
    expect(readMode('?mode=flight')).toBe('flight'); expect(readMode('?mode=duel&seed=3')).toBe('duel');
    expect(readMode('')).toBe('sector'); expect(readMode('?mode=DUEL')).toBe('sector'); expect(readMode('?mode=FLIGHT')).toBe('sector'); expect(readMode('?mode=solo')).toBe('sector');
  });
  it('?seed overrides the default with a whole number', () => {
    expect(readSeed('')).toBe(DEFAULT_SEED); expect(readSeed('?mode=flight&seed=42')).toBe(42);
    expect(readSeed('?seed=-3')).toBe(DEFAULT_SEED); expect(readSeed('?seed=1.5')).toBe(DEFAULT_SEED); expect(readSeed('?seed=99999999999')).toBe(DEFAULT_SEED);
  });
  it('wheel: small trackpad deltas accumulate to one notch; the remainder resets after 200 ms idle', () => {
    const { time, input, rt } = rig();
    time.advance(50);
    for (let i = 0; i < 30; i++) { input.pointer = { ...input.pointer, x: 100, y: 100, wheel: -4 }; rt.frame(1 / 60); time.advance(16); }
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT * ZOOM_STEP, 12);   // 120 px: exactly one notch in
    input.pointer = { ...input.pointer, wheel: 120 }; rt.frame(1 / 60);   // acc -20 -> 100 -> one notch out
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT, 12);
    input.pointer = { ...input.pointer, wheel: 60 }; rt.frame(1 / 60);
    time.advance(300); rt.frame(1 / 60);   // idle: acc dropped
    input.pointer = { ...input.pointer, wheel: 60 }; rt.frame(1 / 60);
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT, 12);   // 60 + 60 would have been a notch
    rt.dispose();
  });
  it('an Escape in a late frame pauses before the due ticks run', () => {
    const now = { t: 0 };
    let presses = emptyPresses();
    const rt = createFlightRuntime({
      now: () => now.t, scheduler: { schedule: () => () => {} }, seed: 5, viewport: { w: 1280, h: 720 },
      sampleKeys: () => { const k = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses }; presses = emptyPresses(); return k; },
      samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 })
    });
    now.t = 500;   // 30 ticks due; the scheduler never fires
    presses = { ...emptyPresses(), pause: 1 };
    rt.frame(1 / 60);
    expect(rt.paused()).toBe(true);
    expect(rt.state.tick).toBe(0);
    now.t = 2000;   // a long pause
    presses = { ...emptyPresses(), pause: 1 };
    rt.frame(1 / 60);   // resume: the 30 ticks due before the pause are discarded, not run in a burst
    expect(rt.paused()).toBe(false);
    expect(rt.state.tick).toBe(0);
    now.t = 2000 + 1000 / 60 + 1;
    rt.frame(1 / 60);
    expect(rt.state.tick).toBe(1);   // stepping resumes from the resume time
    rt.dispose();
  });
  it('wheel: a remainder older than 200 ms is dropped even when the next frame carries wheel input', () => {
    const { time, input, rt } = rig();
    time.advance(50);
    input.pointer = { ...input.pointer, x: 100, y: 100, wheel: 60 }; rt.frame(1 / 60);
    time.advance(300);   // no frames in between
    input.pointer = { ...input.pointer, wheel: 60 }; rt.frame(1 / 60);
    expect(rt.camera.targetZoom).toBeCloseTo(ZOOM_DEFAULT, 12);   // 60 + 60 would have been a notch out
    rt.dispose();
  });
  it('frame() pumps due ticks before drawing; one alpha per frame feeds the camera and the draw', () => {
    const calls: number[] = [];
    const now = { t: 0 };
    const rt = createFlightRuntime({
      now: () => now.t, scheduler: { schedule: () => () => {} }, seed: 5, viewport: { w: 1280, h: 720 },
      sampleKeys: () => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }),
      samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 })
    });
    void calls;
    now.t = 1000 / 60 + 5;   // past the first deadline; the scheduler never fires
    expect(rt.state.tick).toBe(0);
    rt.frame(1 / 60);
    expect(rt.state.tick).toBeGreaterThan(0);
    expect(rt.alpha()).toBeLessThan(1);
    const a = rt.alpha(); now.t += 1; expect(rt.alpha()).toBe(a);   // fixed for the frame
    const s = rt.state.ships[0], p = rt.prev[0]!;
    const ix = p.x + (s.x - p.x) * a, iy = p.y + (s.y - p.y) * a;
    expect(Math.hypot(rt.camera.centreX - ix, rt.camera.centreY - iy)).toBeLessThan(25);
    rt.dispose();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/flightRuntime.test.ts`
Expected: FAIL, 1 failed and 12 passed: the launch-mode test fails with "AssertionError: expected 'sector' to be 'duel' // Object.is equality".

- [ ] **Step 3: Write the duel boot and the mode switch**

Create `src/renderer/src/app/duel/duelMode.ts`:

```ts
// The solo duel's boot (H-1 spec §3, §4, §11a): reuses the renderer's Pixi application, stage and letterbox, hides the
// sector children, and adds the duel's scene: the console map view (Helm or Weapons) or the interior for the active
// character, the readout column, the effects and shake, and the end screen. The sector session is never created.
import { BitmapText, Container } from 'pixi.js';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { ShipLayout } from '../../sim/ship/schema';
import type { Renderer } from '../../render/renderer';
import { computeLetterbox } from '../../render/letterbox';
import { createEndScreen, endModel } from '../../render/duel/endScreen';
import { READOUT_COLUMN } from '../../render/duel/interiorModel';
import { createInteriorView, type InteriorView } from '../../render/duel/interiorView';
import { createReadoutPanel } from '../../render/duel/readoutPanel';
import { readoutHelp, readoutRows } from '../../render/duel/readoutModel';
import { createFx, pushEvents, recordTrails, resetFx, shakeOffset, stepFx } from '../../render/tactical/fxModel';
import { createTacticalLayer } from '../../render/tactical/tacticalLayer';
import { tacticalModel } from '../../render/tactical/tacticalModel';
import { combatModel } from '../../render/tactical/weaponsModel';
import { FONT_SIZE, TEXT } from '../../render/theme';
import { createDuelKeyboard, createPointerSource, type EventSource } from './input';
import { createDuelRuntime } from './runtime';

export interface DuelModeDeps {
  renderer: Renderer;
  seed: number;
  /** The Cutter. */
  layout: ShipLayout;
  /** The preload bridge's suspend and resume hooks, when present. */
  lifecycle?: { onSuspend(cb: () => void): void; onResume(cb: () => void): void };
}

export function startDuelMode(deps: DuelModeDeps): () => void {
  const { renderer } = deps, viewport = { w: INTERNAL_W, h: INTERNAL_H }, font = renderer.assets.fontFamily;
  for (const child of renderer.app.stage.children) child.visible = false;   // world, enemy window, projectiles, callouts, HUD
  const root = new Container(), scene = new Container();
  const layer = createTacticalLayer({ fontFamily: font, viewport, seed: deps.seed });
  let interior: InteriorView = createInteriorView(renderer.assets);
  const panel = createReadoutPanel({ fontFamily: font }), end = createEndScreen({ fontFamily: font });
  const paused = new BitmapText({ text: 'PAUSED   ESC: RESUME', style: { fontFamily: font, fontSize: FONT_SIZE * 1.5 } });
  paused.tint = TEXT; paused.anchor.set(0.5, 0.5); paused.position.set((INTERNAL_W - READOUT_COLUMN) / 2, 80); paused.visible = false;
  scene.addChild(layer.container, interior.container, panel.container);
  root.addChild(scene, paused, end.container);   // the shake moves the scene; the banner and the end card stay still
  renderer.app.stage.addChild(root);

  const canvas = renderer.app.canvas;
  const keyboard = createDuelKeyboard(window as unknown as EventSource);
  const pointer = createPointerSource(canvas as unknown as EventSource, (cx, cy) => {
    const rect = canvas.getBoundingClientRect(), lb = computeLetterbox(rect.width, rect.height, INTERNAL_W, INTERNAL_H);
    return { x: (cx - rect.left - lb.offsetX) / lb.scale, y: (cy - rect.top - lb.offsetY) / lb.scale };
  });
  const runtime = createDuelRuntime({
    now: () => performance.now(),
    scheduler: { schedule(delay, cb) { const timer = window.setTimeout(cb, delay); return () => window.clearTimeout(timer); } },
    sampleKeys: () => keyboard.sample(), samplePointer: () => pointer.sample(),
    clearKeys: () => { keyboard.clear(); pointer.clear(); },
    seed: deps.seed, viewport, layout: deps.layout
  });
  const fx = createFx();
  let epoch = runtime.epoch();

  const onBlur = (): void => runtime.pause('blur');
  const onFocus = (): void => runtime.resume('blur');
  const onVisibility = (): void => { if (document.hidden) runtime.pause('hidden'); else runtime.resume('hidden'); };
  window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  deps.lifecycle?.onSuspend(() => runtime.pause('suspend'));
  deps.lifecycle?.onResume(() => runtime.resume('suspend'));

  const frame = (ticker: { deltaMS: number }): void => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    runtime.frame(dt);
    if (runtime.epoch() !== epoch) {   // a restart (spec §4): every view-owned cache starts again
      epoch = runtime.epoch();
      resetFx(fx); layer.reset(); layer.reseed(runtime.seed);   // the next duel's star field
      interior.destroy(); interior = createInteriorView(renderer.assets); scene.addChildAt(interior.container, 1);
    }
    const d = runtime.duel, view = runtime.view(), alpha = runtime.alpha(), userPaused = runtime.reasons().has('user');
    pushEvents(fx, runtime.drainEvents());
    stepFx(fx, runtime.paused() ? 0 : dt);
    recordTrails(fx, d.tactical, runtime.missilePrev, alpha);
    layer.container.visible = view !== 'interior'; interior.container.visible = view === 'interior';
    if (view === 'interior') interior.draw(d, runtime.crewPrev, alpha, dt);
    else {
      const input = {
        state: d.tactical, prev: runtime.prev, alpha, camera: runtime.cameras[view], viewport, console: view, axes: runtime.axes(),
        ships: [0, 1], paused: userPaused, reserveRight: READOUT_COLUMN, spreadArrows: true, missilePrev: runtime.missilePrev, steer: runtime.steer(), fx
      } as const;
      layer.draw(tacticalModel(input), combatModel(input));
    }
    paused.visible = userPaused && view === 'interior';
    panel.draw(readoutRows({ duel: d, mode: view, active: runtime.active(), other: runtime.otherStatus() }), readoutHelp(view));
    const shake = shakeOffset(fx);
    scene.position.set(shake.x, shake.y);
    end.draw(endModel(d.tactical.outcome, d.tactical.tick, runtime.seed));
  };
  renderer.app.ticker.add(frame);

  const dispose = (): void => {
    renderer.app.ticker.remove(frame);
    window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
    keyboard.destroy(); pointer.destroy(); runtime.dispose(); interior.destroy();
  };
  window.addEventListener('beforeunload', dispose, { once: true });
  return dispose;
}
```

Replace the whole of `src/renderer/src/app/duel/mode.ts` with:

```ts
// The launch mode (H-1 spec §3): `?mode=flight` starts the dev flight view and `?mode=duel` the solo duel; anything
// else, or none, starts today's sector game unchanged. `?seed=<n>` overrides the default seed.
export type AppMode = 'sector' | 'flight' | 'duel';
export const DEFAULT_SEED = 2026;

export function readMode(search: string): AppMode {
  const mode = new URLSearchParams(search).get('mode');
  return mode === 'flight' || mode === 'duel' ? mode : 'sector';
}

/** A whole number from 0 to 2^31 − 1, or the default. */
export function readSeed(search: string, fallback = DEFAULT_SEED): number {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  return n <= 0x7fffffff ? n : fallback;
}
```

Replace the whole of `src/renderer/src/main.ts` with:

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
import { startDuelMode } from './app/duel/duelMode';

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

/** The solo duel (H-1 spec §4, §11a): the renderer and its letterbox, the Cutter, but no sector session. */
async function startDuel(seed: number): Promise<void> {
  const layout = parseShip(cutter);   // throws with a clear message on invalid ship data (spec §9)
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  const resize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize); resize();
  startDuelMode({ renderer, seed, layout, lifecycle: window.ftlite });
}

/** One mode per launch (H-1 spec §3): `?mode=flight`, `?mode=duel`, or today's sector game. */
function start(): Promise<void> {
  const mode = readMode(location.search);
  return mode === 'flight' ? startFlight(readSeed(location.search)) : mode === 'duel' ? startDuel(readSeed(location.search)) : startSector();
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
  // FTLITE_MODE (H-1 spec §3): `flight` opens the dev flight view and `duel` the solo duel; the renderer reads it as `?mode=`.
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

Replace the whole of `package.json` with:

```json
{
  "name": "ftlite",
  "version": "0.0.1",
  "private": true,
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "dev:flight": "tsx scripts/dev-mode.ts flight",
    "dev:duel": "tsx scripts/dev-mode.ts duel",
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/flightRuntime.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npm run typecheck`
Expected: exit 0 (both projects: `src/main/index.ts` is in the node project).

Run: `npm test`
Expected: every file passes, 1,925 tests and 1 skipped (see the known flakes in Global Constraints).

- [ ] **Step 6: Check that it renders (manual, outside the repo)**

Run: `npm run build`, then launch the built app with `FTLITE_MODE=duel` (PowerShell: `$env:FTLITE_MODE='duel'; npx electron .`; Git Bash: `FTLITE_MODE=duel npx electron .`). Alternatively, use the visual-check method: `playwright-core@1.48.2` installed in a folder outside the repo, `_electron.launch({ executablePath: '<repo>/node_modules/electron/dist/electron.exe', args: ['<repo>'], env: { ...process.env, FTLITE_MODE: 'duel' } })`, then `page.keyboard` and `page.screenshot`.

Expected (the prototype's screenshots showed each of these):
- the page URL ends `index.html?mode=duel`; the Helm view with the readout column on the right (`HELM`, CUTTER and HUNTER hulls `30/30`, shield pips, `OTHER AWAY` / `AT WEAPONS`) and the Helm key help;
- Tab: the Weapons view: the faint cyan laser arc, the dimmer red enemy arc when the enemy is in view, the top line `ENEMY BRG nnn  RNG nnnn  NO SHOT`, and `LASER`, `LOCK SHIELDS`, `CHARGE` rising with its bar while Space is held; releasing at full draws a beam (grey on a miss) and resets the charge;
- F, then D held: the missile with its trail and the amber predicted path, `CHARGE FROZEN`, `MAG 3/4 FLYING`; C follows the missile, C again the ship;
- X: the Cutter interior at 1× left of the readout column, `ON FOOT`, the strip `HELM EMPTY` / `COASTING` / `WEAPONS EMPTY` / `ENEMY` / `BEARING`; the free Weapons console outlined amber, the Navigation console dim; WASD walks; Escape shows `PAUSED   ESC: RESUME`;
- after about a minute at the Helm the hunter has hit the Cutter: the interior tints the damaged rooms (`WEAPONS 2`, `SHIELDS 2`) with markers, and holding E beside the Weapons repair point fills its pie and the readout's repair bar;
- when the duel ends: the end card (`VICTORY`, `DEFEAT` or `BOTH SHIPS LOST`, `DUEL LENGTH m:ss`, `ENTER: NEW DUEL (SEED 2027)`); Enter starts the next duel at the Helm.

The 7 `ERR_FILE_NOT_FOUND` console errors (optional art such as `art/tiles/breach.png`) appear in the sector mode too and are not from this plan. Also launch without `FTLITE_MODE` (the sector lobby is unchanged) and with `FTLITE_MODE=flight` (the flight view is unchanged). Delete any scratch files; commit nothing from this step.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/mode.ts src/renderer/src/main.ts src/main/index.ts package.json tests/flightRuntime.test.ts
git commit -m "feat(helm): the solo duel screens, ?mode=duel and npm run dev:duel (Helm H-1b)"
```

(End the message with your session's Co-Authored-By trailer.)

---

## After H-1b

- **Headless coverage of the acceptance walk:** Task 5's runtime test stands the gunner up with X, walks it by scripted A (west along row 6, through the one-tile doors at columns 6 and 4, so no vertical step ends inside a door) into Engines, and holds E: the repair progress rises with no teleport.
- **The owner's acceptance (spec §12, H-1b):** `npm run dev:duel`. Fly at the Helm; Tab to the gunner; charge and release on the enemy in the arc (the top line turns green `IN ARC`); launch and steer a missile round the planet; X up, walk to a damaged room and hold E; sit again with E; finish a duel and press Enter. Solo duels run longer and harder than two-player ones (parent §11a).
- **H-0c-ii** replaces the runtime's direct `stepDuelTick` with the loopback authority. Everything above it stays: the runtime's queued commands become the client's envelopes, and `presence` stays an ordinary command.
- **H-2** adds gamepads and the networked demo on top of these screens.
