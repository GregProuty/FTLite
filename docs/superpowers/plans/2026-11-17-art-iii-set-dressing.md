# Art-iii (set dressing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dress the ship interior with bought Maru-98 props (bunks, seats, a couch, lockers, crates) placed by a deterministic rule from each room's name and system, in the renderer only, so a fresh clone without the paid art draws exactly as today.

**Architecture:** A pure model, `render/propModel.ts`, holds every rule and is unit-tested without a renderer: `roomKind` (which rooms), `ROOM_PROPS` (which props, in order), `propCandidates` (the wall tiles a prop may back onto), `propSlots` (the hashed order, the spacing, the fit rule; cached by `propKey`). A Pixi layer, `render/propLayer.ts` (`createPropLayer(assets)`), draws one sprite per slot through Art-ii's `consolePlacement(side, true, w, h)` and sits in its own container directly after `tiles.container` in both views (`renderer.ts`, `duel/interiorView.ts`), so the grade, effects, icons, consoles, magazine, fixtures and crew all draw over it. The art is seven one-frame outputs in `art/import.json` of rectangles Art-ii already counts, bound by name in the manifest and grouped as the optional feature `propArt`.

**Tech Stack:** Electron 37, PixiJS 8.19.0, TypeScript 5.8, vitest 3.2.7, tsx, pngjs and zod (scripts only).

**Spec:** `docs/superpowers/specs/2026-11-17-art-iii-set-dressing-design.md` (refined to convergence at 9b42772; refine run `docs/superpowers/reviews/2026-11-16-art-iii-spec/exchange.md`).

## Global Constraints

- Views and art only: no sim, command, snapshot or authority change; `SIM_VERSION` and every golden stay unchanged; no file under `src/renderer/src/sim`, `src/renderer/src/authority`, `src/network` or `src/shared` changes; no ship layout file changes.
- Assets: only frames the palette already counts. Every prop rectangle is one `art/import.json` already lists (Art-ii's `furniture.png` and `lockers.png` outputs); `npm run art:palette` must leave `src/renderer/src/render/palette.json` unchanged (`git diff --exit-code`), and a test checks `countColours` gives the same counts before and after the new outputs.
- Each prop is its own one-frame output, bound by `name` in the manifest: licence `paid`, `required: false`, `retrieved: 2026-11-16`, source `https://maru-98.itch.io/`, credit `Mars colony pixel art by Maru-98 (maru-98.itch.io)`. After any manifest edit run `npm run credits` (`tests/credits.test.ts` checks the generated files).
- One art pixel is 2 world units (`TILE_PX` 32 shows 16 px art at 2x). Sprites are scaled only by 2, rotated only by quarter turns (`SIDE_ROTATION`), anchor 0.5, top-left on an even world unit. No tint, no state.
- With `propArt` missing the prop layer is empty (today's look). The prop layer does not depend on `consoleArt`.
- The renderer never reads the sim RNG (`tests/artGuards.test.ts` adds two tests per new `.ts` file under `render/`: this plan adds `propModel.ts` and `propLayer.ts`, so +4). pngjs and `scripts/` never reach the renderer.
- The paid PNGs (`public/assets/paid/`) and `.art/` are gitignored and never committed. The packs live outside the repo in `C:\Users\djuar\FTLite-assets` (or `FTLITE_ASSETS`).
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage files by name (`git add -- <paths>`), never `git add -A`.
- The working copies use CRLF line endings (git `core.autocrlf=true`). Use the Edit tool for changes to existing files; create new files with Write and the content given (git normalises the endings). `npm run art:palette` writes LF, so `git status` may list `palette.json` as modified while `git diff` is empty: the check is `git diff --exit-code` (the committed content), and the file is never staged; `git checkout -- src/renderer/src/render/palette.json` restores the CRLF working copy.
- Work happens in the existing worktree `C:\Users\djuar\FTLite\.worktrees\art-iii` on branch `art-iii`. Every command below runs from that worktree's root (Git Bash) unless it says otherwise.

## Prototype verification

The code below was written and run in a scratch worktree outside the repo (`C:\Users\djuar\ftlite-art-iii-proto`, branch `art-iii-proto` from `art-iii` at 9b42772, `npm ci`, the signalling junction, and a copy of the art-iii worktree's `public/assets/paid/`). The tests were then split into the three files below and re-run task by task in a second scratch worktree (`C:\Users\djuar\ftlite-art-iii-verify`, same base), each task's test failing first and passing after its step. Both worktrees were removed. Every new file below is the file that ran.

| Task | Prototype-verified | Evidence |
|---|---|---|
| 1 prop model | yes | `propModel` failed to load first, then `Tests 11 passed (11)`; the slots it pins are listed in Decision 5 |
| 2 prop art | yes | `propArt` `3 failed \| 1 passed` first, then `4 passed`; `art:import` wrote seven `prop-*.png`; `art:palette` left `git diff --exit-code -- palette.json` clean; manifest 45 entries; `credits.generated.ts (13 lines)` |
| 3 prop layer | yes | `propLayer` failed to load first, then 5 passed; with `duelInterior` (updated), `artGuards`, `interiorFeel`, `onlineRenderer`, `consoleArt`: `Tests 233 passed` in 8 files; `npx tsc -b` clean (in the npm ci prototype) |
| 4 docs | no (text only) | — |
| 5 final | yes | full suite in the verify worktree: 3862 tests in 265 files (baseline 3838 in 262, +24 in +3); under load 8 sim and runtime tests timed out (`authorityBoundary`, `console`, `director`, `onlineAppRuntime`, `run`, `snapshot`), and those six files rerun alone passed (178 tests); `npm run build` ok; `npx tsc -b` clean in the npm ci prototype; Cutter and Skiff screenshots taken with the harness below and inspected (Decision 6) |

## Decisions

1. **Task order.** The pure model first (Task 1, with only the `PROP_ART_NAMES` list and `PropName` type added to `assetNames.ts`), then the art (Task 2: registration as optional names, the `propArt` feature, the outputs, the manifest, the palette check), then the layer in both views (Task 3), docs (Task 4), verification and screenshots (Task 5).
2. **Where the names live.** `PROP_ART_NAMES` and `type PropName` are in `assetNames.ts`, beside `CONSOLE_ART_NAMES`, and `propModel.ts` imports the type from there. Defining them in `propModel.ts` would make `assetNames.ts` import `propModel.ts`, which imports `consoleModel.ts`, which imports `assetNames.ts`: a module cycle evaluated at load.
3. **Sprite back orientation, checked by eye.** Each of the seven source rectangles was cut from `C:\Users\djuar\FTLite-assets\maru-98-mars\habitable-building\habitable building tileset.png` and `...\mars-tools\Mars Tools.png`, upscaled 10x and viewed: `prop.bunk.a` (97,49,14,22): a light panel at the top (head end), striped blanket, the brown frame front at the bottom; `prop.bunk.b` (129,48,14,23): the white pillow at the top, the blue blanket, the brown frame front at the bottom; `prop.seats` (16,88,25,15): two seats seen from the front, the tall backrests at the top, the legs at the bottom; `prop.couch` (88,88,23,15): the two backrest cushions at the top, the seat, the grey base at the bottom; `prop.locker.a` and `prop.locker.b` (19,29 and 59,29, 18x33): the top surface at the top, the front panel (vents, a screen on b, the feet) at the bottom; `prop.crate` (90,96,12,16): a top-down box, symmetric. **Every sprite's back is at the top**, as the spec says: no per-sprite base rotation is needed, and `SIDE_ROTATION` (n 0, e +π/2, s π, w −π/2) turns each one so its back is on its wall. The screenshots confirmed it (Decision 6).
4. **The real names** (`src/renderer/src/sim/ship/derived.ts`, `render/gradeModel.ts`): door and opening tiles are `derived.edgeTile` (every edge; no shipped layout has an opening today); stations `derived.stationTile`; breach sites `derived.siteTile`; airlocks `derived.airlockTile` (both wall tiles, so their floor 4-neighbours are excluded); the magazine `derived.magazineTile` (−1 without one); spawns `layout.spawns` (`[x, y]` pairs); the lamp tile is the room's lowest tile index, `Math.min(...derived.roomTiles[r])`, the tile `lampPoints(roomTiles, width)` places each lamp on. Wall tiles are `'#'` in `layout.rows`. The hashes are `hashString` and `hashU32` from `render/particles/random.ts`, seeded `hashString(derived.layoutHash)` as the wall vents are (`particles/sources.ts`).
5. **The pinned slots** (computed by `propSlots`; the Cutter's and Skiff's are pinned exactly in `tests/propModel.test.ts`, the starter's are as computed and only its counts are tested), as room, (x, y), side, name in take order:
   - **Cutter:** Upper Hold (7,3) n `prop.crate`; Crew Quarters (13,3) n `prop.bunk.a`, (13,5) e `prop.bunk.b`; Galley (11,8) w `prop.seats`, (13,9) e `prop.couch`, (13,7) n `prop.locker.a`; Medbay (15,5) s `prop.bunk.a`. Lower Hold and Aft Store: none (no candidates).
   - **Skiff:** Hold (9,7) e `prop.crate`. Skiff Medbay: none (its one remaining tile (7,2) is a floor neighbour of the corridor's breach site (7,3)).
   - **Starter:** Medbay (18,1) n `prop.bunk.a`; Crew Quarters (4,8) n `prop.bunk.a`, (5,10) s `prop.bunk.b`, (1,10) s `prop.bunk.a`.
   The spec's hand count (Cutter Crew Quarters 2 bunks, Galley 3, Upper Hold 1 crate, Lower Hold and Aft Store 0; Skiff Hold 1 crate) **agrees** with the code. The spec does not count the medbays: the Cutter Medbay gets 1 bunk, the Skiff Medbay none (the R1 review's "Skiff Medbay 1" predates the breach-neighbour exclusion).
6. **Screenshots, inspected.** Cutter: the crate on the Upper Hold's north wall; in the Crew Quarters a bunk headboard-up against the north wall at (13,3) (mostly behind the standing crew at the spawns, a look point for the owner) and a bunk lying east-west with its pillow on the east wall at (13,5); in the Galley the seats backed onto the west wall with their legs into the room, the tall locker on the north wall with its feet into the room, the couch with its backrest on the east wall; in the Medbay a bunk with its pillow on the south wall. Skiff: the crate on the Hold's east wall. Every prop's back is against its wall; nothing crosses a wall band. The Galley's locker (66 units deep) ends exactly where the couch begins (touching, not overlapping).
7. **The prop layer.** `createPropLayer(assets)` returns `{ container, draw(state) }`. `draw` returns at once without `propArt`; otherwise it rebuilds only when `propKey(state)` (the layout hash, then `name/system` of each room joined by `|`) changes: it destroys the old sprites and adds one `Sprite(assets.texture(name))` per slot, anchor 0.5, scale 2, `rotation = SIDE_ROTATION[side]`, at the tile origin plus `consolePlacement(side, true, tex.width, tex.height)`'s `cx`, `cy`. `propSlots` keeps a one-entry module cache by the same key, so the duel and the sector view switching ships only recompute (cheap).
8. **Layer insertion.** `renderer.ts`: `world.addChild(tiles.container, props.container, feel.grade, effects.below, icons.container, consoleDesks.container, magazine.container, crew.container, boarders.container, effects.above, feel.lights)` and `props.draw(state)` right after `tiles.update(state, dt)`. `duel/interiorView.ts`: `world.addChild(tiles.container, props.container, fx.grade, effects.below, icons.container, desks.container, damage, crew.container, boarders.container, effects.above, fx.lights, marks, ...labels)` and `props.draw(st)` right after `tiles.update(st, dt)`. The existing `tests/duelInterior.test.ts` "light and feel" test indexes the world's children, so it changes: the grade moves from `kids[1]` to `kids[2]`, the lights from index 9 to 10.
9. **The "nothing past a wall" test.** Walls draw a band 12 units thick in the middle of a wall tile (`BAND` 10 from each edge; `WALL_GAP` = 10). The test requires every art pixel of each placed prop rectangle to lie inside some floor tile of the prop's room expanded by `WALL_GAP` on every side: such a region never reaches any wall band, so the prop crosses no wall, its own included (its back edge sits on its own wall's face, touching). A mutation check (hold list locker first, fit rule off) made the Cutter test fail.
10. **Manifest titles.** `prop.bunk.*`, `prop.seats`, `prop.couch`: `Mars colony sets (Habitable Building)` (the same title as Art-ii's floor and consoles, so the notices list them in that block); `prop.locker.*`, `prop.crate`: `Mars colony sets (Mars Tools)` (a new notices block). Files `paid/maru/prop-<name with dots as dashes>.png`. The entries are appended by small scripts in the gitignored `.art/` folder.
11. **The countColours test** runs only where the owner's packs exist (`it.runIf(existsSync(sourceFolder(process.env)))`); a fresh clone skips it. A second, always-run test checks each prop output's (pack, rectangle) is listed by a non-prop output, which with `countColours`' count-each-distinct-frame-once rule is why the counts cannot move.
12. **Test count.** New: `propModel` 11, `propArt` 4, `propLayer` 5, `artGuards` +4 (2 new render files): **+24** tests in **+3** files. One existing test changes (Decision 8); none is removed.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/renderer/src/render/propModel.ts` | create | `roomKind`, `ROOM_PROPS`, `PROP_SIZE`, `propDepth`, `floorDepth`, `propCandidates`, `propKey`, `propSlots` (pure). |
| `src/renderer/src/render/propLayer.ts` | create | `createPropLayer(assets)`: the sprites. |
| `src/renderer/src/render/assetNames.ts` | modify | `PROP_ART_NAMES`, `PropName`; registered optional. |
| `src/renderer/src/render/fallback.ts` | modify | Feature `propArt`. |
| `src/renderer/src/render/renderer.ts`, `src/renderer/src/render/duel/interiorView.ts` | modify | The prop layer directly after the tiles. |
| `art/import.json` | modify (by script) | Seven one-frame prop outputs. |
| `public/assets/manifest.json`, `public/THIRD_PARTY_NOTICES.txt` | modify / regenerate | The paid entries and the notices (`credits.generated.ts` regenerates unchanged). |
| `docs/art/bible.md`, `docs/gates.md` | modify | The registered names; the Art-iii gate. |
| `tests/propModel.test.ts`, `tests/propArt.test.ts`, `tests/propLayer.test.ts` | create | New tests. |
| `tests/duelInterior.test.ts` | modify | The world child indices (Decision 8). |

---

### Step 0: Worktree and baseline

The worktree already exists with `node_modules`, the signalling junction and the gitignored paid PNGs in `public/assets/paid/`.

- [ ] **Step 0.1: Confirm the branch and the paid art**

Run: `git rev-parse --abbrev-ref HEAD; git status --short; ls public/assets/paid/maru/`
Expected: `art-iii`; no modified tracked files; `console-doors.png console-engineering.png console-lifeSupport.png console-medbay.png console-navigation.png console-science.png console-weapons.png floor.png furniture.png lockers.png machines.png stations.png`.

- [ ] **Step 0.2: Build once** (one test reads `out/main/authorityHost.js`)

Run: `npm run build 2>&1 | tail -1`
Expected: `✓ built in ...` and no error.

- [ ] **Step 0.3: Record the baseline**

Run (on an idle machine): `npx vitest run 2>&1 | tail -6`
Expected at 9b42772 plus this plan (docs only): `Test Files 262 passed (262)` and `Tests 3838 passed (3838)`, 0 failed. Under load the long sim tests can time out (on the planning machine, with an `npm ci` running alongside, `tests/director.test.ts` "soak", `tests/enemy.test.ts`, `tests/run.test.ts` and `tests/snapshot.test.ts` each timed out once, with two vitest-worker "Timeout calling onTaskUpdate" errors; rerun alone, the four files passed, 196 tests). Rerun such a file alone (`npx vitest run tests/director.test.ts`) before calling it a failure. **Any other failure: stop and report it before Task 1.** Write down the total.

---

### Task 1: The prop model (which rooms, which props, where they stand)

**Files:**
- Create: `src/renderer/src/render/propModel.ts`, `tests/propModel.test.ts`
- Modify: `src/renderer/src/render/assetNames.ts` (one block after `BLAST_NAMES`)

**Interfaces:**
- Consumes: `WALL_GAP`, `type Side`, `consolePlacement` (`render/consoleModel.ts`, unchanged); `hashString`, `hashU32` (`render/particles/random.ts`); `TILE_PX` (`src/shared/resolution`); `SimState` (`layout`, `derived`).
- Produces:
  - `assetNames.ts`: `PROP_ART_NAMES` (readonly tuple `'prop.bunk.a', 'prop.bunk.b', 'prop.seats', 'prop.couch', 'prop.locker.a', 'prop.locker.b', 'prop.crate'`), `type PropName`.
  - `propModel.ts`: `PROP_SIZE: Readonly<Record<PropName, readonly [number, number]>>` (art px w, h); `type RoomKind = 'quarters' | 'galley' | 'hold' | 'medbay'`; `ROOM_PROPS: Readonly<Record<RoomKind, readonly PropName[]>>`; `roomKind(room: { name: string; system: string | null }): RoomKind | null`; `interface PropCandidate { room: number; tile: number; side: Side }`; `interface PropSlot { room: number; tile: number; side: Side; name: PropName }`; `propDepth(name: PropName): number`; `floorDepth(s, tile, side): number`; `propCandidates(s): PropCandidate[]`; `propKey(s): string`; `propSlots(s): PropSlot[]`, where `s: Pick<SimState, 'layout' | 'derived'>`.

- [ ] **Step 1: Write the failing test** — create `tests/propModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import starter from '../src/renderer/src/sim/ship/starter.json';
import { parseShip, type ShipLayout } from '../src/renderer/src/sim/ship/schema';
import type { SimState } from '../src/renderer/src/sim/state';
import { PROP_ART_NAMES } from '../src/renderer/src/render/assetNames';
import { consolePlacement, WALL_GAP, type Side } from '../src/renderer/src/render/consoleModel';
import { floorDepth, propCandidates, propDepth, propKey, propSlots, PROP_SIZE, ROOM_PROPS, roomKind } from '../src/renderer/src/render/propModel';
import { TILE_PX } from '../src/shared/resolution';
import { createSimState } from './helpers/simLifetime';
import { RECRUITS } from './helpers/sim';

const T = TILE_PX;
const SHIPS: Record<string, ShipLayout> = { cutter: parseShip(cutter), skiff: parseShip(skiff), starter: parseShip(starter) };
const stateOf = (layout: ShipLayout): SimState => createSimState(layout, 2, 1, RECRUITS);
const xy = (s: SimState, t: number): [number, number] => [t % s.derived.width, Math.floor(t / s.derived.width)];
const STEP: Record<Side, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

describe('which rooms get what (Art-iii spec section 2)', () => {
  it('names every room of the Cutter, the Skiff and the starter', () => {
    const kinds = (l: ShipLayout): Record<string, string | null> => Object.fromEntries(l.rooms.map((r) => [r.name, roomKind(r)]));
    expect(kinds(SHIPS.cutter!)).toEqual({
      Oxygen: null, 'Upper Hold': 'hold', Engines: null, 'Aft Passage': null, Weapons: null, 'Aft Store': 'hold', 'Lower Hold': 'hold',
      'Dorsal Airlock': null, 'Crew Quarters': 'quarters', Galley: 'galley', 'Ventral Airlock': null, Medbay: 'medbay', Reactor: null,
      'Door Control': null, Sensors: null, 'Forward Corridor': null, Bridge: null
    });
    expect(kinds(SHIPS.skiff!)).toEqual({ Bridge: null, Ops: null, Corridor: null, 'Life Support': null, Medbay: 'medbay', Engines: null, Reactor: null, Hold: 'hold' });
    expect(kinds(SHIPS.starter!)).toEqual({
      Bridge: null, 'Weapons Bay': null, 'Science Lab': null, Medbay: 'medbay', Reactor: null, Corridor: null, 'Crew Quarters': 'quarters', 'Life Support': null, 'Engine Room': null
    });
  });
  it('the generic rules: the name case-insensitively, then the medbay system', () => {
    expect(roomKind({ name: 'OFFICERS QUARTERS', system: null })).toBe('quarters');
    expect(roomKind({ name: 'Mess Hall', system: null })).toBe('galley');
    expect(roomKind({ name: 'galley', system: 'weapons' })).toBe('galley');
    expect(roomKind({ name: 'Cargo Bay', system: null })).toBe('hold');
    expect(roomKind({ name: 'Stores', system: null })).toBe('hold');
    expect(roomKind({ name: 'Sickbay', system: 'medbay' })).toBe('medbay');
    expect(roomKind({ name: 'Sickbay', system: null })).toBeNull();
    expect(ROOM_PROPS).toEqual({
      quarters: ['prop.bunk.a', 'prop.bunk.b', 'prop.bunk.a'], galley: ['prop.seats', 'prop.couch', 'prop.locker.a'],
      hold: ['prop.crate', 'prop.locker.a', 'prop.crate', 'prop.locker.b'], medbay: ['prop.bunk.a']
    });
  });
});

describe('where props stand (Art-iii spec section 3)', () => {
  for (const [ship, layout] of Object.entries(SHIPS)) it(`${ship}: no candidate on or next to a station, door, magazine; none next to a breach or airlock; no spawn or lamp tile; a wall on its side`, () => {
    const s = stateOf(layout), d = s.derived, W = d.width;
    const near = (a: number, b: number): boolean => { const [ax, ay] = xy(s, a), [bx, by] = xy(s, b); return Math.abs(ax - bx) + Math.abs(ay - by) <= 1; };
    const list = propCandidates(s);
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) {
      const [x, y] = xy(s, c.tile), at = `${ship} (${x},${y})`;
      expect(d.roomOfTile[c.tile], at).toBe(c.room);
      expect(roomKind(layout.rooms[c.room]!), at).not.toBeNull();
      for (const t of [...d.stationTile, ...d.edgeTile, ...d.siteTile, ...d.airlockTile]) expect(near(c.tile, t), at).toBe(false);
      if (d.magazineTile >= 0) expect(near(c.tile, d.magazineTile), at).toBe(false);
      expect(layout.spawns.some(([sx, sy]) => sy * W + sx === c.tile), at).toBe(false);
      expect(c.tile, at).not.toBe(Math.min(...d.roomTiles[c.room]!));
      const first = (['n', 'e', 's', 'w'] as Side[]).find((sd) => layout.rows[y + STEP[sd][1]]?.charAt(x + STEP[sd][0]) === '#');
      expect(c.side, at).toBe(first);
    }
  });
  it('the fit rule: depth past the tile edge is 2 x the art height minus WALL_GAP; floor depth counts the room\'s tiles away from the wall', () => {
    expect(PROP_SIZE).toEqual({
      'prop.bunk.a': [14, 22], 'prop.bunk.b': [14, 23], 'prop.seats': [25, 15], 'prop.couch': [23, 15],
      'prop.locker.a': [18, 33], 'prop.locker.b': [18, 33], 'prop.crate': [12, 16]
    });
    expect(PROP_ART_NAMES.map(propDepth)).toEqual([34, 36, 20, 20, 56, 56, 22]);
    const s = stateOf(SHIPS.cutter!), at = (x: number, y: number): number => y * s.derived.width + x;
    expect(floorDepth(s, at(7, 3), 'n')).toBe(32);    // the Upper Hold: one row
    expect(floorDepth(s, at(13, 5), 'e')).toBe(96);   // the Crew Quarters: three columns
    expect(floorDepth(s, at(11, 8), 'w')).toBe(96);   // the Galley
  });
  it('the pinned slots: the Cutter and the Skiff (and the starter dressed)', () => {
    const named = (layout: ShipLayout): [string, number, number, Side, string][] => {
      const s = stateOf(layout);
      return propSlots(s).map((p) => [layout.rooms[p.room]!.name, ...xy(s, p.tile), p.side, p.name]);
    };
    expect(named(SHIPS.cutter!)).toEqual([
      ['Upper Hold', 7, 3, 'n', 'prop.crate'],
      ['Crew Quarters', 13, 3, 'n', 'prop.bunk.a'], ['Crew Quarters', 13, 5, 'e', 'prop.bunk.b'],
      ['Galley', 11, 8, 'w', 'prop.seats'], ['Galley', 13, 9, 'e', 'prop.couch'], ['Galley', 13, 7, 'n', 'prop.locker.a'],
      ['Medbay', 15, 5, 's', 'prop.bunk.a']
    ]);
    expect(named(SHIPS.skiff!)).toEqual([['Hold', 9, 7, 'e', 'prop.crate']]);
    const st = named(SHIPS.starter!);
    expect(st.filter((p) => p[0] === 'Crew Quarters').length).toBe(3);
    expect(st.filter((p) => p[0] === 'Medbay').length).toBe(1);
  });
  for (const [ship, layout] of Object.entries(SHIPS)) it(`${ship}: deterministic, no two slots touching, each name the first unused that fits, nothing past a wall`, () => {
    const s = stateOf(layout), d = s.derived, slots = structuredClone(propSlots(s));
    propSlots(stateOf(ship === 'cutter' ? SHIPS.skiff! : SHIPS.cutter!));   // evict the one-entry cache so the next call recomputes
    expect(propSlots(stateOf(layout))).toEqual(slots);
    for (const a of slots) for (const b of slots) if (a !== b) {
      const [ax, ay] = xy(s, a.tile), [bx, by] = xy(s, b.tile);
      expect(Math.max(Math.abs(ax - bx), Math.abs(ay - by)), `${ship} ${a.tile} ${b.tile}`).toBeGreaterThan(1);
    }
    layout.rooms.forEach((room, r) => {
      const kind = roomKind(room), mine = slots.filter((p) => p.room === r);
      if (!kind) { expect(mine).toEqual([]); return; }
      const used = ROOM_PROPS[kind].map(() => false);
      for (const p of mine) {
        const depth = floorDepth(s, p.tile, p.side), k = ROOM_PROPS[kind].findIndex((n, i) => !used[i] && propDepth(n) <= depth);
        expect(ROOM_PROPS[kind][k], `${ship} ${room.name} ${p.tile}`).toBe(p.name);
        used[k] = true;
      }
    });
    for (const p of slots) {
      // Every art pixel of the placed rectangle lies on the room's floor or within WALL_GAP of it (the strip in front of a
      // wall band), so it never crosses a wall's band, its own included (its back edge sits on its own wall's face).
      const [tx, ty] = xy(s, p.tile), [w, h] = PROP_SIZE[p.name], c = consolePlacement(p.side, true, w, h);
      const floor = d.roomTiles[p.room]!.map((t) => xy(s, t));
      for (let y = ty * T + c.top; y < ty * T + c.top + c.height; y += 2) for (let x = tx * T + c.left; x < tx * T + c.left + c.width; x += 2) {
        const ok = floor.some(([fx, fy]) => x + 1 >= fx * T - WALL_GAP && x + 1 < fx * T + T + WALL_GAP && y + 1 >= fy * T - WALL_GAP && y + 1 < fy * T + T + WALL_GAP);
        expect(ok, `${ship} ${p.name} at (${tx},${ty}) ${p.side}: art pixel ${x},${y}`).toBe(true);
      }
    }
  });
  it('the cache key covers the room names and systems as well as the layout hash', () => {
    const renamed: ShipLayout = { ...SHIPS.skiff!, rooms: SHIPS.skiff!.rooms.map((r) => r.name === 'Hold' ? { ...r, name: 'Galley' } : r) };
    const a = stateOf(SHIPS.skiff!), b = stateOf(renamed);
    expect(b.derived.layoutHash).toBe(a.derived.layoutHash);
    expect(propKey(b)).not.toBe(propKey(a));
    expect(propSlots(b).map((p) => p.name)).toEqual(['prop.seats']);
    expect(propSlots(a).map((p) => p.name)).toEqual(['prop.crate']);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/propModel.test.ts 2>&1 | grep -E "Error|Tests" | head -3`
Expected: FAIL, `Cannot find module '../src/renderer/src/render/propModel'` (the import of `PROP_ART_NAMES` also fails until Step 3).

- [ ] **Step 3: The names** — in `src/renderer/src/render/assetNames.ts`, replace

```ts
export const BLAST_NAMES: readonly string[] = ['fx.blast.room', 'fx.blast.hit'];
```

with

```ts
export const BLAST_NAMES: readonly string[] = ['fx.blast.room', 'fx.blast.hit'];
/** Art-iii (spec section 1): the seven set-dressing sprites. */
export const PROP_ART_NAMES = ['prop.bunk.a', 'prop.bunk.b', 'prop.seats', 'prop.couch', 'prop.locker.a', 'prop.locker.b', 'prop.crate'] as const;
export type PropName = (typeof PROP_ART_NAMES)[number];
```

(They are registered as optional names in Task 2, together with the art.)

- [ ] **Step 4: The model** — create `src/renderer/src/render/propModel.ts`:

```ts
// Set dressing (Art-iii spec sections 1-3): which rooms get props, which props, and where they stand. Pure: no Pixi.
// Rule-based from the room's name and system (the ship layouts carry no prop data); the sim never sees a prop.
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { WALL_GAP, type Side } from './consoleModel';
import { hashString, hashU32 } from './particles/random';
import type { PropName } from './assetNames';

/** Each sprite's size in art pixels (w, h), the rectangles of spec section 1. Every sprite's back is at the top (checked
 *  by eye against the sheets, Art-iii plan Decision 3), so it stands as drawn against a north wall and turns by SIDE_ROTATION. */
export const PROP_SIZE: Readonly<Record<PropName, readonly [number, number]>> = {
  'prop.bunk.a': [14, 22], 'prop.bunk.b': [14, 23], 'prop.seats': [25, 15], 'prop.couch': [23, 15],
  'prop.locker.a': [18, 33], 'prop.locker.b': [18, 33], 'prop.crate': [12, 16]
};

export type RoomKind = 'quarters' | 'galley' | 'hold' | 'medbay';
/** Each kind's props in order (spec section 2): a room gets as many as it has slots that fit, up to the list's length. */
export const ROOM_PROPS: Readonly<Record<RoomKind, readonly PropName[]>> = {
  quarters: ['prop.bunk.a', 'prop.bunk.b', 'prop.bunk.a'],
  galley: ['prop.seats', 'prop.couch', 'prop.locker.a'],
  hold: ['prop.crate', 'prop.locker.a', 'prop.crate', 'prop.locker.b'],
  medbay: ['prop.bunk.a']
};

/** The room's kind by its name (case-insensitive) or its system (spec section 2); null: an undressed room. */
export function roomKind(room: { name: string; system: string | null }): RoomKind | null {
  const n = room.name.toLowerCase();
  if (n.includes('quarters')) return 'quarters';
  if (n.includes('galley') || n.includes('mess')) return 'galley';
  if (n.includes('hold') || n.includes('store') || n.includes('cargo')) return 'hold';
  if (room.system === 'medbay') return 'medbay';
  return null;
}

export interface PropCandidate { room: number; tile: number; side: Side }
export interface PropSlot { room: number; tile: number; side: Side; name: PropName }
type Layout = Pick<SimState, 'layout' | 'derived'>;

const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];
const STEP: Readonly<Record<Side, readonly [number, number]>> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/** How far a prop reaches past its tile's wall edge into the room (spec section 3 step 4): the turned rectangle's
 *  extent perpendicular to the wall (2 x the art height for every side) minus WALL_GAP. */
export function propDepth(name: PropName): number { return 2 * PROP_SIZE[name][1] - WALL_GAP; }

/** The room's floor depth from a candidate (spec section 3 step 4): 32 world units per consecutive floor tile of the same
 *  room, starting at the candidate and going away from its wall. */
export function floorDepth(s: Layout, tile: number, side: Side): number {
  const d = s.derived, room = d.roomOfTile[tile]!, [dx, dy] = STEP[side];
  let x = tile % d.width, y = (tile - x) / d.width, n = 0;
  while (x >= 0 && y >= 0 && x < d.width && y < d.height && d.roomOfTile[y * d.width + x] === room) { n++; x -= dx; y -= dy; }
  return TILE_PX * n;
}

const charAt = (s: Layout, x: number, y: number): string => s.layout.rows[y]?.charAt(x) ?? '';
const neighbours4 = (width: number, height: number, t: number): number[] => {
  const x = t % width, y = (t - x) / width, out: number[] = [];
  if (y > 0) out.push(t - width);
  if (x < width - 1) out.push(t + 1);
  if (y < height - 1) out.push(t + width);
  if (x > 0) out.push(t - 1);
  return out;
};

/** Spec section 3 step 1 (with the side of step 2): the dressed rooms' floor tiles with a wall ('#') 4-neighbour, less the
 *  station, door/opening and magazine tiles and their 4-neighbours, the spawns, the floor 4-neighbours of breach sites and
 *  airlocks, and each room's lamp tile (its lowest tile index, gradeModel lampPoints). In room order, then tile order. */
export function propCandidates(s: Layout): PropCandidate[] {
  const d = s.derived, W = d.width, H = d.height, banned = new Set<number>();
  const withNeighbours = (t: number): void => { banned.add(t); for (const n of neighbours4(W, H, t)) banned.add(n); };
  for (const t of d.stationTile) withNeighbours(t);
  for (const t of d.edgeTile) withNeighbours(t);
  if (d.magazineTile >= 0) withNeighbours(d.magazineTile);
  for (const [x, y] of s.layout.spawns) banned.add(y * W + x);
  for (const t of [...d.siteTile, ...d.airlockTile]) for (const n of neighbours4(W, H, t)) banned.add(n);   // both are wall tiles: their floor neighbours
  const out: PropCandidate[] = [];
  s.layout.rooms.forEach((room, r) => {
    const tiles = d.roomTiles[r] ?? [];
    if (!roomKind(room) || !tiles.length) return;
    const lamp = Math.min(...tiles);
    for (const t of tiles) {
      if (banned.has(t) || t === lamp) continue;
      const x = t % W, y = (t - x) / W, side = SIDES.find((sd) => charAt(s, x + STEP[sd][0], y + STEP[sd][1]) === '#');
      if (side) out.push({ room: r, tile: t, side });
    }
  });
  return out;
}

/** The cache key (spec section 3): the layout hash plus the joined room names and systems. */
export function propKey(s: Layout): string {
  return `${s.derived.layoutHash}|${s.layout.rooms.map((r) => `${r.name}/${r.system ?? ''}`).join('|')}`;
}

let cached: { key: string; slots: PropSlot[] } | null = null;

/** Spec section 3 steps 3-5: per dressed room, its candidates in ascending hashU32(hashString(layoutHash), tile) order (ties
 *  by tile); a candidate 4- or diagonally adjacent to a slot already taken (any room) is skipped; otherwise it takes the
 *  first not-yet-used name of the room's list that fits it (propDepth <= floorDepth), if any. Cached by propKey. */
export function propSlots(s: Layout): PropSlot[] {
  const key = propKey(s);
  if (cached && cached.key === key) return cached.slots;
  const d = s.derived, W = d.width, seed = hashString(d.layoutHash), all = propCandidates(s), taken = new Set<number>(), slots: PropSlot[] = [];
  const crowded = (t: number): boolean => {
    const x = t % W, y = (t - x) / W;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && nx < W && ny >= 0 && ny < d.height && taken.has(ny * W + nx)) return true;
    }
    return false;
  };
  s.layout.rooms.forEach((room, r) => {
    const kind = roomKind(room);
    if (!kind) return;
    const list = ROOM_PROPS[kind], used = list.map(() => false);
    const order = all.filter((c) => c.room === r).map((c) => ({ c, h: hashU32(seed, c.tile) })).sort((a, b) => a.h - b.h || a.c.tile - b.c.tile);
    for (const { c } of order) {
      if (used.every(Boolean)) break;
      if (crowded(c.tile)) continue;
      const depth = floorDepth(s, c.tile, c.side), k = list.findIndex((n, i) => !used[i] && propDepth(n) <= depth);
      if (k < 0) continue;
      used[k] = true; taken.add(c.tile);
      slots.push({ room: r, tile: c.tile, side: c.side, name: list[k]! });
    }
  });
  cached = { key, slots };
  return slots;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/propModel.test.ts 2>&1 | tail -4`
Expected: `Tests 11 passed (11)`. If the pinned-slots test differs, do not edit the expectation: report the difference (the hash order, the exclusions and the fit rule are the spec's; Decision 5 lists the verified result).

Run: `npx vitest run tests/artGuards.test.ts tests/consoleArt.test.ts 2>&1 | tail -4`
Expected: all pass (`artGuards` gains two tests for `propModel.ts`).

Run: `npx tsc -b; echo "tsc exit=$?"`
Expected: `tsc exit=0`.

- [ ] **Step 6: Commit**

```bash
git add -- src/renderer/src/render/assetNames.ts src/renderer/src/render/propModel.ts tests/propModel.test.ts
git commit -m "$(cat <<'EOF'
feat(art-iii): the prop model: room kinds, wall candidates, hashed slots with the fit rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The prop art (names, feature, outputs, manifest, palette unchanged)

**Files:**
- Create: `tests/propArt.test.ts`; `.art/add-prop-outputs.cjs` and `.art/add-props.ts` (gitignored, not committed)
- Modify: `src/renderer/src/render/assetNames.ts`, `src/renderer/src/render/fallback.ts`, `art/import.json` (by script), `public/assets/manifest.json` (by script)
- Regenerate: `public/THIRD_PARTY_NOTICES.txt` (and `src/renderer/src/render/credits.generated.ts`, which stays unchanged); the gitignored `public/assets/paid/maru/prop-*.png`

**Interfaces:**
- Consumes: `PROP_ART_NAMES`, `PropName` (Task 1); `PROP_SIZE` (`propModel.ts`, Task 1); `countColours`, `packReader` (`scripts/art/buildPalette.ts`); `sourceFolder` (`scripts/art/importCore.ts`); `parseManifest`.
- Produces: the seven names registered `optional` in `ASSET_NAMES`; `fallback.ts` feature `'propArt'` (`FEATURE_NAMES.propArt` = the seven names in order); manifest entries `name: 'prop.<...>'`, `file: 'paid/maru/prop-<...>.png'`.

- [ ] **Step 1: Write the failing test** — create `tests/propArt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseManifest } from '../src/renderer/src/render/manifest';
import { ASSET_NAMES, PROP_ART_NAMES } from '../src/renderer/src/render/assetNames';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { PROP_SIZE } from '../src/renderer/src/render/propModel';
import { countColours, packReader } from '../scripts/art/buildPalette';
import { sourceFolder } from '../scripts/art/importCore';

describe('the prop art: names, outputs, manifest and palette (Art-iii spec section 1)', () => {
  const cfg = JSON.parse(readFileSync('art/import.json', 'utf8')) as { outputs: { pack: string; frames: { x: number; y: number; w: number; h: number }[]; output: string; columns: number }[] };
  const file = (n: string): string => `paid/maru/${n.replaceAll('.', '-')}.png`;
  it('seven optional names grouped as propArt', () => {
    expect(PROP_ART_NAMES).toEqual(['prop.bunk.a', 'prop.bunk.b', 'prop.seats', 'prop.couch', 'prop.locker.a', 'prop.locker.b', 'prop.crate']);
    for (const n of PROP_ART_NAMES) expect(ASSET_NAMES[n]).toBe('optional');
    expect(FEATURE_NAMES.propArt).toEqual([...PROP_ART_NAMES]);
  });
  it('each prop is its own one-frame output of a rectangle another output already lists', () => {
    for (const n of PROP_ART_NAMES) {
      const o = cfg.outputs.find((x) => x.output === `public/assets/${file(n)}`)!;
      expect(o.frames, n).toHaveLength(1); expect(o.columns).toBe(1);
      const f = o.frames[0]!;
      expect([f.w, f.h], n).toEqual([...PROP_SIZE[n]]);
      const elsewhere = cfg.outputs.filter((x) => !x.output.includes('/prop-')).some((x) => x.pack === o.pack && x.frames.some((g) => g.x === f.x && g.y === f.y && g.w === f.w && g.h === f.h));
      expect(elsewhere, n).toBe(true);
    }
  });
  it('the manifest binds the seven by name as paid Maru-98 art', () => {
    const real = parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
    for (const n of PROP_ART_NAMES) {
      const e = real.find((x) => x.name === n)!;
      expect(e.file).toBe(file(n));
      expect([e.license, e.required, e.source, e.retrieved, e.credit]).toEqual(['paid', false, 'https://maru-98.itch.io/', '2026-11-16', 'Mars colony pixel art by Maru-98 (maru-98.itch.io)']);
    }
  });
  const packs = sourceFolder(process.env);
  it.runIf(existsSync(packs))('countColours gives the same counts with and without the prop outputs (the owner\'s packs)', () => {
    const raw = packReader(packs), memo = new Map<string, ReturnType<typeof raw>>();
    const read = (p: string): ReturnType<typeof raw> => { if (!memo.has(p)) memo.set(p, raw(p)); return memo.get(p)!; };   // decode each pack once
    const without = { outputs: cfg.outputs.filter((x) => !x.output.includes('/prop-')) };
    const a = countColours(cfg, read), b = countColours(without, read);
    expect([...a.counts].sort((x, y) => x[0] - y[0])).toEqual([...b.counts].sort((x, y) => x[0] - y[0]));
    expect([...a.kept].sort()).toEqual([...b.kept].sort());
  }, 30_000);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/propArt.test.ts 2>&1 | grep -E "×|Tests "`
Expected: `Tests 3 failed | 1 passed (4)`: the names, outputs and manifest tests fail; the countColours test passes trivially (there are no prop outputs yet).

- [ ] **Step 3: Register the names and the feature**

In `src/renderer/src/render/assetNames.ts`, replace

```ts
add('optional', ...BLAST_NAMES);         // Art-ii spec section 3: the bought blasts; none without them
```

with

```ts
add('optional', ...BLAST_NAMES);         // Art-ii spec section 3: the bought blasts; none without them
add('optional', ...PROP_ART_NAMES);      // Art-iii spec section 1: the set dressing; bare floor without it
```

In `src/renderer/src/render/fallback.ts`, replace

```ts
import { BLAST_NAMES, CONSOLE_ART_NAMES, FACINGS } from './assetNames';
```

with

```ts
import { BLAST_NAMES, CONSOLE_ART_NAMES, FACINGS, PROP_ART_NAMES } from './assetNames';
```

replace `'consoleArt' | 'blastArt';` with `'consoleArt' | 'blastArt' | 'propArt';`, and replace

```ts
  blastArt: [...BLAST_NAMES],           // Art-ii spec section 3: the Pimen blasts
```

with

```ts
  blastArt: [...BLAST_NAMES],           // Art-ii spec section 3: the Pimen blasts
  propArt: [...PROP_ART_NAMES],         // Art-iii spec section 1: the Maru set dressing
```

- [ ] **Step 4: One output per prop sprite** — create `.art/add-prop-outputs.cjs` (gitignored scratch; `git check-ignore -v .art/add-prop-outputs.cjs` prints `.gitignore:...:.art/`):

```js
// Art-iii Task 2: append one one-frame output per prop sprite to art/import.json (run once). Rectangles from the Art-iii spec section 1.
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('art/import.json', 'utf8'));
const hab = 'maru-98-mars/habitable-building/habitable building tileset.png', tools = 'maru-98-mars/mars-tools/Mars Tools.png';
const add = [
  ['prop.bunk.a', hab, 97, 49, 14, 22], ['prop.bunk.b', hab, 129, 48, 14, 23], ['prop.seats', hab, 16, 88, 25, 15], ['prop.couch', hab, 88, 88, 23, 15],
  ['prop.locker.a', tools, 19, 29, 18, 33], ['prop.locker.b', tools, 59, 29, 18, 33], ['prop.crate', tools, 90, 96, 12, 16]
];
if (j.outputs.some((o) => o.output.includes('/prop-'))) throw new Error('prop outputs already present');
for (const [name, pack, x, y, w, h] of add) j.outputs.push({ pack, frames: [{ x, y, w, h }], output: `public/assets/paid/maru/${name.replaceAll('.', '-')}.png`, columns: 1 });
fs.writeFileSync('art/import.json', JSON.stringify(j, null, 2) + '\n');
console.log(`art/import.json: ${j.outputs.length} outputs`);
```

Run: `node .art/add-prop-outputs.cjs && npm run art:import 2>&1 | grep prop-`
Expected: `art/import.json: 26 outputs`, then seven `wrote ...\public\assets\paid\maru\prop-<name>.png` lines (bunk-a, bunk-b, seats, couch, locker-a, locker-b, crate).

Run: `npm run art:palette && git diff --exit-code -- src/renderer/src/render/palette.json && echo PALETTE_UNCHANGED; git checkout -- src/renderer/src/render/palette.json`
Expected: `wrote src/renderer/src/render/palette.json (48 colours, 7 kept from the explosion pack)` and `PALETTE_UNCHANGED` (the checkout only restores the CRLF working copy; see Global Constraints). If the diff is not empty, stop and report: the palette must not move.

- [ ] **Step 5: The manifest entries** — create `.art/add-props.ts`:

```ts
// Art-iii Task 2: append the seven Maru prop sprites to public/assets/manifest.json (run once).
import { readFileSync, writeFileSync } from 'node:fs';
import { PROP_ART_NAMES } from '../src/renderer/src/render/assetNames';
const path = 'public/assets/manifest.json', m = JSON.parse(readFileSync(path, 'utf8')) as { file: string }[];
if (m.some((e) => e.file.startsWith('paid/maru/prop-'))) throw new Error('the prop entries are already there');
for (const name of PROP_ART_NAMES) m.push({
  title: name.startsWith('prop.locker') || name === 'prop.crate' ? 'Mars colony sets (Mars Tools)' : 'Mars colony sets (Habitable Building)',
  author: 'Maru-98', source: 'https://maru-98.itch.io/', license: 'paid', retrieved: '2026-11-16',
  modifications: 'frames cut and remapped to the FTLite house palette by npm run art:import', editedBy: 'FTLite art import',
  credit: 'Mars colony pixel art by Maru-98 (maru-98.itch.io)', required: false, file: `paid/maru/${name.replaceAll('.', '-')}.png`, name
} as never);
writeFileSync(path, `${JSON.stringify(m, null, 2)}\n`);
console.log(`manifest: ${m.length} entries`);
```

Run: `npx tsx .art/add-props.ts && npm run credits 2>&1 | tail -1`
Expected: `manifest: 45 entries`; `wrote public/THIRD_PARTY_NOTICES.txt (6141 chars) and credits.generated.ts (13 lines)`. `public/THIRD_PARTY_NOTICES.txt` now lists `paid/maru/prop-bunk-a.png, paid/maru/prop-bunk-b.png, paid/maru/prop-couch.png, paid/maru/prop-seats.png` in the Habitable Building block and a new block `Title: Mars colony sets (Mars Tools)` with `paid/maru/prop-crate.png, paid/maru/prop-locker-a.png, paid/maru/prop-locker-b.png`. `git diff --stat -- src/renderer/src/render/credits.generated.ts` prints nothing (the Maru credit line is already there).

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/propArt.test.ts tests/propModel.test.ts 2>&1 | tail -4`
Expected: `Tests 15 passed (15)` (4 + 11; on a machine without the owner's packs, `14 passed | 1 skipped`).

Run: `npx vitest run tests/paidManifest.test.ts tests/manifest.test.ts tests/credits.test.ts tests/assets.test.ts tests/artImport.test.ts tests/buildPalette.test.ts tests/consoleArt.test.ts 2>&1 | tail -4`
Expected: all pass (65 tests).

Run: `npx tsc -b; echo "tsc exit=$?"`
Expected: `tsc exit=0`.

- [ ] **Step 7: Commit**

```bash
git add -- src/renderer/src/render/assetNames.ts src/renderer/src/render/fallback.ts art/import.json public/assets/manifest.json public/THIRD_PARTY_NOTICES.txt tests/propArt.test.ts
git commit -m "$(cat <<'EOF'
feat(art-iii): the prop art (propArt): seven one-frame Maru outputs of already-counted frames, bound by name; palette unchanged

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The prop layer in both views

**Files:**
- Create: `src/renderer/src/render/propLayer.ts`, `tests/propLayer.test.ts`
- Modify: `src/renderer/src/render/renderer.ts`, `src/renderer/src/render/duel/interiorView.ts`, `tests/duelInterior.test.ts:83,85`

**Interfaces:**
- Consumes: `propKey`, `propSlots`, `PROP_SIZE` (Task 1); feature `'propArt'` (Task 2); `consolePlacement`, `SIDE_ROTATION` (`consoleModel.ts`); `featureReady`; `GameAssets.texture`.
- Produces: `createPropLayer(assets: GameAssets): { container: Container; draw(state: SimState): void }`; `props.container` at world child index 1 in both views.

- [ ] **Step 1: Write the failing test** — create `tests/propLayer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip, type ShipLayout } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import type { SimState } from '../src/renderer/src/sim/state';
import type { PropName } from '../src/renderer/src/render/assetNames';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { consolePlacement, SIDE_ROTATION, WALL_GAP } from '../src/renderer/src/render/consoleModel';
import { propSlots, PROP_SIZE } from '../src/renderer/src/render/propModel';
import { createPropLayer } from '../src/renderer/src/render/propLayer';
import { createInteriorView } from '../src/renderer/src/render/duel/interiorView';
import { TILE_PX } from '../src/shared/resolution';
import { createSimState } from './helpers/simLifetime';
import { RECRUITS } from './helpers/sim';

const T = TILE_PX;
const CUTTER = parseShip(cutter), SKIFF = parseShip(skiff);
const stateOf = (layout: ShipLayout): SimState => createSimState(layout, 2, 1, RECRUITS);
const xy = (s: SimState, t: number): [number, number] => [t % s.derived.width, Math.floor(t / s.derived.width)];

/** Fake assets: the prop textures sized as the spec's rectangles, every other optional feature missing. */
function fakeAssets(withProps: boolean): GameAssets {
  const missing = Object.values(FEATURE_NAMES).flat().filter((n) => !(withProps && n.startsWith('prop.')));
  const tex = new Map<string, Texture>();
  const named = (n: string): Texture => {
    let t = tex.get(n);
    if (!t) { const [w, h] = PROP_SIZE[n as PropName]; t = new Texture({ source: new TextureSource({ width: w, height: h }) }); t.label = n; tex.set(n, t); }
    return t;
  };
  return {
    has: (n) => !missing.includes(n), missing, fontFamily: 'm5x7',
    texture: (n) => { if (missing.includes(n)) throw new Error(`missing ${n}`); return named(n); },
    animation: (n) => { throw new Error(`no animation ${n}`); }, nineSlice: (n) => { throw new Error(`no nine-slice ${n}`); }
  };
}

describe('the prop layer (Art-iii spec section 4)', () => {
  it('one sprite per slot, flush to its wall through consolePlacement, turned by SIDE_ROTATION, 2x, no tint', () => {
    const s = stateOf(CUTTER), layer = createPropLayer(fakeAssets(true));
    layer.draw(s);
    const slots = propSlots(s);
    expect(layer.container.children).toHaveLength(slots.length);
    slots.forEach((p, i) => {
      const sp = layer.container.children[i] as Sprite, [w, h] = PROP_SIZE[p.name], c = consolePlacement(p.side, true, w, h), [tx, ty] = xy(s, p.tile);
      expect(sp.texture.label).toBe(p.name);
      expect([sp.x, sp.y, sp.rotation, sp.anchor.x, sp.anchor.y, sp.scale.x, sp.tint]).toEqual([tx * T + c.cx, ty * T + c.cy, SIDE_ROTATION[p.side], 0.5, 0.5, 2, 0xffffff]);
    });
  });
  it('the placement per side: the back edge on the wall face, centred on the tile, top-left even', () => {
    expect(consolePlacement('n', true, 12, 16)).toMatchObject({ left: 4, top: -WALL_GAP, width: 24, height: 32 });
    expect(consolePlacement('e', true, 14, 23)).toMatchObject({ left: T + WALL_GAP - 46, top: 2, width: 46, height: 28 });
    expect(consolePlacement('s', true, 14, 22)).toMatchObject({ left: 2, top: T + WALL_GAP - 44, width: 28, height: 44 });
    expect(consolePlacement('w', true, 25, 15)).toMatchObject({ left: -WALL_GAP, top: -10, width: 30, height: 50 });
  });
  it('rebuilds only when the cache key changes', () => {
    const layer = createPropLayer(fakeAssets(true)), a = stateOf(CUTTER);
    layer.draw(a); const first = layer.container.children[0];
    layer.draw(stateOf(CUTTER)); expect(layer.container.children[0]).toBe(first);
    layer.draw(stateOf(SKIFF));
    expect(layer.container.children).toHaveLength(1); expect(first!.destroyed).toBe(true);
  });
  it('draws nothing without propArt', () => {
    const layer = createPropLayer(fakeAssets(false));
    layer.draw(stateOf(CUTTER));
    expect(layer.container.children).toHaveLength(0);
  });
  it('sits directly over the tiles in both views', () => {
    const d = createDuel(CUTTER, 5), view = createInteriorView(fakeAssets(true));
    view.draw(d, d.interior.crew.map(() => ({ x: 0, y: 0 })), 1, 1 / 60);
    const props = view.world.children[1] as Container;
    expect(props.children.length).toBe(propSlots(d.interior).length);
    expect(props.children.every((k) => k instanceof Sprite && k.texture.label!.startsWith('prop.'))).toBe(true);
    expect((view.world.children[2] as Container).blendMode).toBe('multiply');   // the grade next
    view.destroy(); disposeDuel(d);
    const src = readFileSync('src/renderer/src/render/renderer.ts', 'utf8');
    expect(src).toContain('world.addChild(tiles.container, props.container, feel.grade,');
    expect(src).toMatch(/tiles\.update\(state, dt\);\s*props\.draw\(state\);/);
  });
});
```

(The sector renderer needs a WebGL `Application`, so its order is checked from the source text; the duel interior is built for real.)

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/propLayer.test.ts 2>&1 | grep -E "Error|Tests" | head -2`
Expected: FAIL, `Cannot find module '../src/renderer/src/render/propLayer'`.

- [ ] **Step 3: The layer** — create `src/renderer/src/render/propLayer.ts`:

```ts
import { Container, Sprite } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import type { GameAssets } from './assets';
import { featureReady } from './fallback';
import { consolePlacement } from './consoleModel';
import { propKey, propSlots } from './propModel';

/** The set dressing (Art-iii spec section 4): one sprite per prop slot, flush to its wall and turned by quarter turns, in
 *  its own container directly over the tiles, so the grade, effects, icons, consoles, magazine, fixtures and crew draw over
 *  it. Rebuilt only when propKey changes. No tint, no state; empty without the propArt feature (today's look). */
export function createPropLayer(assets: GameAssets): { container: Container; draw(state: SimState): void } {
  const container = new Container();
  const ready = featureReady(new Set(assets.missing), 'propArt');
  let drawnFor = '', drawnLayout: unknown = null;
  return {
    container,
    draw(state) {
      if (!ready || state.layout === drawnLayout) return;   // same layout object: nothing to rebuild (avoids building propKey every frame)
      drawnLayout = state.layout;
      const key = propKey(state);
      if (key === drawnFor) return;
      drawnFor = key;
      for (const s of container.removeChildren()) s.destroy();
      const W = state.derived.width;
      for (const slot of propSlots(state)) {
        const tex = assets.texture(slot.name), p = consolePlacement(slot.side, true, tex.width, tex.height);
        const tx = slot.tile % W, ty = (slot.tile - tx) / W;
        const s = new Sprite(tex); s.anchor.set(0.5); s.scale.set(2); s.rotation = p.rotation;
        s.position.set(tx * TILE_PX + p.cx, ty * TILE_PX + p.cy); container.addChild(s);
      }
    }
  };
}
```

- [ ] **Step 4: The sector view** — in `src/renderer/src/render/renderer.ts`, replace

```ts
import { createConsoleLayer } from './consoleLayer';
```

with

```ts
import { createConsoleLayer } from './consoleLayer';
import { createPropLayer } from './propLayer';
```

replace

```ts
  const magazine = createMagazineLayer();   // spec Coop-ii section 2: the magazine tile, under the crew
```

with

```ts
  const magazine = createMagazineLayer();   // spec Coop-ii section 2: the magazine tile, under the crew
  const props = createPropLayer(assets);    // Art-iii spec section 4: the set dressing, directly over the tiles
```

replace

```ts
  // Art-i spec section 5: tiles, grade, effects.below, icons, consoleDesks, magazine, crew, boarders, effects.above, lights.
  world.addChild(tiles.container, feel.grade,
```

with

```ts
  // Art-i spec section 5: tiles, (Art-iii: props,) grade, effects.below, icons, consoleDesks, magazine, crew, boarders, effects.above, lights.
  world.addChild(tiles.container, props.container, feel.grade,
```

(the rest of that `world.addChild(...)` line stays as it is), and replace

```ts
      tiles.update(state, dt);
      icons.update(state);
```

with

```ts
      tiles.update(state, dt);
      props.draw(state);
      icons.update(state);
```

- [ ] **Step 5: The duel interior** — in `src/renderer/src/render/duel/interiorView.ts`, replace

```ts
import { createConsoleLayer } from '../consoleLayer';
```

with

```ts
import { createConsoleLayer } from '../consoleLayer';
import { createPropLayer } from '../propLayer';
```

replace

```ts
  const desks = createConsoleLayer(assets), crew
```

with

```ts
  const props = createPropLayer(assets);   // Art-iii spec section 4: the set dressing, directly over the tiles
  const desks = createConsoleLayer(assets), crew
```

replace `  // Back to front as renderer.ts (Art-i spec section 5): tiles, grade,` with `  // Back to front as renderer.ts (Art-i spec section 5): tiles, the props (Art-iii), grade,`, replace `  world.addChild(tiles.container, fx.grade,` with `  world.addChild(tiles.container, props.container, fx.grade,` (the rest of that line stays), and replace `      tiles.update(st, dt); icons.update(st);` with `      tiles.update(st, dt); props.draw(st); icons.update(st);`.

- [ ] **Step 6: The duel interior's child indices** (Decision 8) — in `tests/duelInterior.test.ts`, replace

```ts
    expect((kids[1] as Container).blendMode).toBe('multiply');                                // tiles, then the grade
```

with

```ts
    expect((kids[2] as Container).blendMode).toBe('multiply');                                // tiles, the props (Art-iii), then the grade
```

and replace

```ts
    expect(lights).toBe(9);                                                                    // after effects.above
```

with

```ts
    expect(lights).toBe(10);                                                                   // after effects.above
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/propLayer.test.ts tests/propModel.test.ts tests/propArt.test.ts tests/duelInterior.test.ts tests/artGuards.test.ts tests/interiorFeel.test.ts tests/onlineRenderer.test.ts tests/consoleArt.test.ts 2>&1 | tail -4`
Expected: `Test Files 8 passed (8)`, `Tests 233 passed (233)` (232 passed and 1 skipped without the owner's packs).

Run: `npx tsc -b; echo "tsc exit=$?"`
Expected: `tsc exit=0`.

- [ ] **Step 8: Commit**

```bash
git add -- src/renderer/src/render/propLayer.ts src/renderer/src/render/renderer.ts src/renderer/src/render/duel/interiorView.ts tests/propLayer.test.ts tests/duelInterior.test.ts
git commit -m "$(cat <<'EOF'
feat(art-iii): the prop layer directly over the tiles in the sector and duel views

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The art bible and the gate

**Files:**
- Modify: `docs/art/bible.md`, `docs/gates.md`

- [ ] **Step 1: The registered names** — in `docs/art/bible.md`, replace

```md
  - `fx.blast.room`, `fx.blast.hit` (`blastArt`, Pimen): no blasts without them. `explosion-big.png` is imported but unbound.
```

with

```md
  - `fx.blast.room`, `fx.blast.hit` (`blastArt`, Pimen): no blasts without them. `explosion-big.png` is imported but unbound.
  - `prop.bunk.a`, `prop.bunk.b`, `prop.seats`, `prop.couch`, `prop.locker.a`, `prop.locker.b`, `prop.crate` (`propArt`, Maru-98, 7 names; Art-iii): bare floor without them. Placed by rule from the room's name and system (`render/propModel.ts`), never from ship data; each sprite's back is at the top of its art and it turns by quarter turns onto its wall. Each is a one-frame output of a rectangle another output already lists, so the palette does not move.
```

- [ ] **Step 2: The gate** — append to the end of `docs/gates.md` (after the Art-ii section's last line, with one blank line before):

```md

## Art-iii: set dressing (2026-11-17)

Spec `docs/superpowers/specs/2026-11-17-art-iii-set-dressing-design.md`, plan `docs/superpowers/plans/2026-11-17-art-iii-set-dressing.md`. Views and art only: SIM_VERSION and the goldens are unchanged; no ship layout changes.

- [ ] Automated (Art-iii): `npm test` passes, including the room kinds (Cutter, Skiff, starter and the generic rules), the candidates (none on or next to a station, door, magazine; none next to a breach or airlock; no spawn or lamp tile), the slots (deterministic, never touching, the fit rule, nothing past a wall, the Cutter and Skiff pinned), the prop layer (placement through consolePlacement, directly over the tiles in both views, rebuilt only on its key, empty without propArt), the manifest entries and the unchanged palette counts; `npx tsc -b` clean.
- [ ] Owner-local palette check (needs the packs in `C:\Users\djuar\FTLite-assets`): `npm run art:palette` then `npm run art:import` leaves `git diff --exit-code -- src/renderer/src/render/palette.json art public/assets/manifest.json` clean.
- [ ] Owner look gate (`npm run dev`, and the screenshots in `C:\Users\djuar\FTLite-shots\art-iii\`): do the rooms read as lived-in, and do any props sit where crew walk in a way that looks wrong? Known look points: the Cutter's Crew Quarters bunk at the north wall sits behind the crew at their spawns; the Galley's locker and couch touch end to end on the east side. Date and notes: pending.
```

- [ ] **Step 3: Check and commit**

Run: `git diff --stat`
Expected: only `docs/art/bible.md` and `docs/gates.md`.

```bash
git add -- docs/art/bible.md docs/gates.md
git commit -m "$(cat <<'EOF'
docs(art-iii): the prop names in the art bible and the Art-iii gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Final verification and screenshots

**Files:**
- Create (gitignored, never committed): `.art/shots/index.html`, `.art/shots/main.ts`, `.art/shots/vite.config.mjs`, `.art/shots/shot.cjs`, `.art/shots/all.mjs`
- Modify: `docs/gates.md` (tick the automated item)
- Output (outside the repo): `C:\Users\djuar\FTLite-shots\art-iii\skiff-normal.png`, `cutter-normal.png`

**Interfaces:**
- Consumes: everything above; `createRenderer`, `createSimState`, `sitDown`, `loadAssets`.
- Produces: the test count, the build, two screenshots.

- [ ] **Step 1: Full suite**

Run (on an idle machine): `npm run build 2>&1 | tail -1 && npx vitest run 2>&1 | tail -5`
Expected: `✓ built in ...`; then `Test Files 265 passed (265)` and `Tests 3862 passed (3862)`: the Step 0 baseline (3838 in 262) plus **24** tests in **3** files (Decision 12), 0 failed. Rerun a timed-out file alone before calling it a failure (Step 0.3); on the planning machine under load `tests/authorityBoundary.test.ts`, `console`, `director`, `onlineAppRuntime`, `run` and `snapshot` timed out and passed alone.

- [ ] **Step 2: Types, the unchanged sim and the unchanged palette**

Run: `npx tsc -b; echo "tsc exit=$?"`
Expected: `tsc exit=0` and no other output.

Run: `git diff 9b42772 --stat -- src/renderer/src/sim src/renderer/src/authority src/network src/shared; grep -n "SIM_VERSION =" src/renderer/src/sim/tuning.ts; npx vitest run tests/golden.test.ts tests/duelGolden.test.ts tests/boundary.test.ts 2>&1 | tail -3`
Expected: the diff stat prints nothing; the `SIM_VERSION` line is the same as at 9b42772 (`git show 9b42772:src/renderer/src/sim/tuning.ts | grep -n "SIM_VERSION ="`); the three files pass.

Run: `npm run art:palette > /dev/null && npm run art:import > /dev/null && git diff --exit-code -- src/renderer/src/render/palette.json art public/assets/manifest.json && echo CLEAN; git checkout -- src/renderer/src/render/palette.json`
Expected: `CLEAN` (the palette is unchanged and a re-import changes nothing tracked).

- [ ] **Step 3: Write the screenshot harness** (all under `.art/shots/`, which `.gitignore` covers; `git check-ignore -v .art/shots/main.ts` prints the `.art/` rule)

`.art/shots/index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>FTLite art shots</title>
    <style>html,body{margin:0;padding:0;background:#000;overflow:hidden}</style>
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`.art/shots/main.ts`:

```ts
// Art-iii visual check harness (gitignored, never committed): draws the sector Skiff or Cutter with the real renderer
// layers and the bought art, props included. ?view=skiff|cutter
import skiff from '../../src/renderer/src/sim/ship/skiff.json';
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { createSimState } from '../../src/renderer/src/sim/state';
import { Position } from '../../src/renderer/src/sim/components';
import { sitDown } from '../../src/renderer/src/sim/stations';
import { loadAssets } from '../../src/renderer/src/render/assets';
import { createRenderer } from '../../src/renderer/src/render/renderer';

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search), view = q.get('view') ?? 'skiff';
  const assets = await loadAssets('./assets/manifest.json');
  console.log(`missing optional names: ${assets.missing.length}`);
  const renderer = await createRenderer(assets);
  renderer.resize(window.innerWidth, window.innerHeight);
  const state = createSimState(parseShip(view === 'cutter' ? cutter : skiff), view === 'cutter' ? 4 : 2, 1);
  const seat = 0, t = state.derived.stationTile[seat]!, eid = state.crew[0]!;   // one crew member seated at the first station, on its tile
  Position.x[eid] = (t % state.derived.width) + 0.5; Position.y[eid] = Math.floor(t / state.derived.width) + 0.5; sitDown(state, 0, seat);
  renderer.recordPrev(state);
  renderer.app.ticker.add(() => { renderer.draw(state, 1); });
  (window as unknown as { shotReady: boolean }).shotReady = true;
}
main().catch((e) => { document.body.textContent = String(e); });
```

`.art/shots/vite.config.mjs`:

```js
// Serves the Art-iii visual check harness with the repo's public/ assets (gitignored, never committed).
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const repo = resolve(import.meta.dirname, '..', '..');
export default defineConfig({
  root: import.meta.dirname,
  publicDir: resolve(repo, 'public'),
  envDir: false,
  define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify('art-shots') },
  server: { port: 5299, strictPort: true, fs: { allow: [repo] } }
});
```

`.art/shots/shot.cjs`:

```js
// Electron screenshot of the harness at an emulated viewport (gitignored, never committed).
// Arguments come in the SHOT environment variable as "url|width|height|out.png": Electron misreads a URL on its own command line.
const { app, BrowserWindow } = require('electron');
const { appendFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const log = (m) => appendFileSync(join(__dirname, 'shot.log'), `${new Date().toISOString()} ${m}\n`);
process.on('uncaughtException', (e) => { log(`uncaught ${e.stack}`); app.exit(1); });
const [url, w, h, out] = (process.env.SHOT || '').split('|');
const width = Number(w), height = Number(h);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: true, backgroundColor: '#000000' });
    win.webContents.on('console-message', (_e, _level, message) => { if (message.startsWith('missing optional names')) log(`page: ${message}`); });
    await win.loadURL('about:blank');   // emulating before any page is loaded crashes the renderer
    const dbg = win.webContents.debugger; dbg.attach('1.3');
    await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await win.loadURL(url);
    for (let k = 0; k < 100; k++) { if (await win.webContents.executeJavaScript('window.shotReady === true')) break; await new Promise((r) => setTimeout(r, 100)); }
    await new Promise((r) => setTimeout(r, 2500));
    const shot = await dbg.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    log(`wrote ${out} (${width}x${height})`);
    app.quit();
  } catch (e) { log(`failed ${e.stack}`); app.exit(1); }
});
```

`.art/shots/all.mjs`:

```js
// Takes the Art-iii screenshots (gitignored, never committed). usage: node .art/shots/all.mjs <electron.exe> <out dir>
// Needs the harness server running: npx vite --config .art/shots/vite.config.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [electron, outDir] = process.argv.slice(2);
if (!electron || !outDir) { console.error('usage: node .art/shots/all.mjs <electron.exe> <out dir>'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
let failed = 0;
for (const view of ['skiff', 'cutter']) {
  const name = `${view}-normal.png`, out = resolve(outDir, name);
  const env = { ...process.env, SHOT: `http://localhost:5299/?view=${view}|1920|1080|${out}` }; delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(electron, [join(import.meta.dirname, 'shot.cjs')], { env, stdio: 'ignore', timeout: 60000 });
  const ok = r.status === 0 && existsSync(out) && statSync(out).size > 1000;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (1920x1080) exit ${r.status}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 4: Take the screenshots**

First check the port is free: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | Measure-Object | % Count"` prints `0`. (If not, stop and report; do not stop a process this task did not start.)

Start the harness server in the background and keep it running for the next command: `npx vite --config .art/shots/vite.config.mjs`
Expected: `VITE v7... ready` and `Local: http://localhost:5299/`. Wait for that line before the next command (an Electron started earlier gets `ERR_CONNECTION_REFUSED`).

Run (Electron needs a desktop session; if the tool sandbox blocks GUI processes, run without the sandbox):

```bash
E=node_modules/electron/dist/electron.exe; [ -f "$E" ] || E=/c/Users/djuar/FTLite/node_modules/electron/dist/electron.exe
rm -f .art/shots/shot.log; node .art/shots/all.mjs "$E" "C:/Users/djuar/FTLite-shots/art-iii"; cat .art/shots/shot.log
```

Expected:

```
ok   skiff-normal.png (1920x1080) exit 0
ok   cutter-normal.png (1920x1080) exit 0
```

and in the log, `page: missing optional names: 17` for both shots (the in-house placeholders, none of the seven `prop.*` names). A larger number means a paid PNG did not load: check `public/assets/paid/maru/prop-*.png`.

- [ ] **Step 5: Stop the harness processes**

Run: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id $_.OwningProcess -Force }; Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | ? { $_.CommandLine -like '*art-iii*shot.cjs*' } | % { Stop-Process -Id $_.ProcessId -Force }"`
(Stopping the background shell that ran `npx vite` alone can leave the node process holding the port; this kills it by port.)
Then: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | Measure-Object | % Count"` prints `0`.

- [ ] **Step 6: Look at the screenshots** (Read each PNG; the ship is small at 1920 x 1080, so also crop and enlarge the rooms if needed) and check against Decision 6:
  - Cutter: a crate on the Upper Hold's north wall; two bunks in the Crew Quarters (one headboard-up on the north wall at (13,3), one lying east-west with its pillow on the east wall at (13,5)); in the Galley the seats backed onto the west wall, the tall locker on the north wall, the couch's backrest on the east wall; a bunk in the Medbay with its pillow on the south wall; nothing in the Lower Hold or the Aft Store.
  - Skiff: one crate on the Hold's east wall.
  - Every prop's back is against its wall, nothing crosses a wall band, and the crew, consoles and lamps draw over the props.
  Record any visual problem for the owner rather than fixing it here (the owner's look is the gate).

- [ ] **Step 7: Tick the automated gate item and commit**

In `docs/gates.md`, in the Art-iii section, replace `- [ ] Automated (Art-iii):` with `- [x] Automated (Art-iii):` and append the measured totals to that line, e.g. ` Measured 2026-11-17: 3862 tests in 265 files, tsc clean, build ok.` with the real numbers.

```bash
git add -- docs/gates.md
git commit -m "$(cat <<'EOF'
docs(art-iii): automated gate measured

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Report**

Report: the totals against the baseline, `tsc` and build results, SIM_VERSION and the goldens unchanged, `CLEAN` after `art:palette` + `art:import`, the two screenshot paths under `C:\Users\djuar\FTLite-shots\art-iii\`, the processes stopped, and observations for the owner's gate ("do the rooms read as lived-in, and do any props sit where crew walk in a way that looks wrong?"; also try `npm run dev`).

---

## Spec notes (problems found while planning; the spec is unchanged)

1. **Medbays are not counted in section 3.** The spec's hand count covers the Cutter's holds, Crew Quarters and Galley and the Skiff Hold; the rule also gives the Cutter Medbay one bunk (15,5) s and the Skiff Medbay none (its only remaining wall tile (7,2) neighbours the corridor's breach site (7,3)). The R1 review's "Skiff Medbay gets 1" predates the breach-neighbour exclusion. Not a contradiction; the test pins the Cutter and Skiff results including the medbays.
2. **"palette.json byte-identical".** On this Windows checkout (`core.autocrlf=true`) the working copy is CRLF and `npm run art:palette` writes LF, so the bytes on disk differ while the content git stores is identical. The plan checks `git diff --exit-code` (the committed content), restores the working copy with `git checkout --`, and never stages the file.
3. **Section 4, "in both views".** Only the duel interior can be built in a node test (the sector renderer needs a WebGL `Application`), so the sector order is checked from `renderer.ts`'s source text and seen in the screenshots.
4. **Section 1's sprite backs** are as the spec says (all at the top); no per-sprite base rotation is needed (Decision 3).

## Self-review against the spec

- Section 1 (assets): seven names, rectangles and sheets as the table — Task 2 Step 4, `propArt` test; only already-counted frames — the always-run test and the `countColours` test (Decision 11); `palette.json` unchanged — Task 2 Step 4, Task 5 Step 2; one-frame outputs bound by name, licence `paid` under the Maru-98 rules, feature `propArt` — Task 2; backs at the top, checked by eye — Decision 3, screenshots.
- Section 2 (rooms): `roomKind` for quarters, galley/mess, hold/store/cargo, medbay system, else nothing; the lists in order — Task 1, tests for the three ships and the generic rules.
- Section 3 (slots): `propCandidates` with every exclusion and the side — Task 1 test per ship; the hash order with ties by tile — `propSlots`; the fit rule as 2 x art height minus WALL_GAP against 32 per floor tile — `propDepth`, `floorDepth`, test; take rule with 4- and diagonal adjacency across rooms, first unused fitting name — test; cache by layout hash plus names and systems — `propKey`, test; pinned Cutter and Skiff slots, starter dressed — test, Decision 5; nothing crosses a wall — test (Decision 9).
- Section 4 (drawing): own container directly after the tiles in both views, rebuilt only on the key — Task 3, tests; `consolePlacement(side, true, w, h)`, quarter turns, even top-left — test; no tint, no state, independent of `consoleArt`, empty without `propArt` — tests.
- Section 5 (crew and props): no sim change — Global Constraints, Task 5 Step 2; overlap as an owner look point — Task 4 gate.
- Testing and the gate: every listed unit test — Tasks 1-3; all existing tests pass, SIM_VERSION and goldens unchanged, no sim file changes — Task 5; screenshots of the Cutter and the Skiff saved to `C:\Users\djuar\FTLite-shots\art-iii\` — Task 5; the owner's gate — Task 4.
