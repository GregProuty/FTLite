# UI Round Part 3 (look) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec `docs/superpowers/specs/2026-11-20-ui-round-design.md` §3: the hex shield shimmer (ship view and both FTL windows),
enemy shots in the ship view, an original Blender Hunter in the enemy window, and the painted own ship in the own ship window, all in
the amber CRT style on the terminals.

**Architecture:** Two pure models carry the new looks. `render/shieldFx.ts` keeps each ship's shield hits (from the existing view
events) on the presentation clock and returns hex cells and a bubble alpha for any ellipse. `render/duel/enemyShots.ts` turns enemy
fire events into shots in the interior's pixel frame. The scene owns both states and feeds them; the Pixi interior view and the
React windows only draw what they return. Art reaches React through a new `GameAssets.image(name)` (url and pixel size).

**Tech Stack:** TypeScript, Pixi v8 (interior), React + SVG (windows), vitest, Blender 5.3 headless (art).

## Global Constraints

- Drawing only: no sim change, no SIM_VERSION change, no golden change. Nothing new is hashed or sent.
- Every new timer runs on the presentation clock: the scene's `frozen ? 0 : dt`. Paused, every shimmer and shot holds still.
- The terminals keep meaning by brightness on the CRT ramp (`CRT.glass/faint/dim/mid/main/hot` in `render/tactical/crtTheme.ts`), never by new hues. The ship view uses the existing shield colour `0x6fc3ff`.
- Shimmer timing (spec §3.2): a patch of hex cells lights at the impact point and spreads ring by ring, each ring later and dimmer, gone by **0.5 s**. A hit that drops a layer adds one whole-grid flicker. When the last layer drops, the grid flickers and the bubble goes out.
- At rest the bubble is a faint thin ellipse, brighter with more layers, absent with no layer up. Cells near the edge are brighter (a curved surface).
- Shake respects the existing shake setting (no new shake code; the existing hit shake stays).
- The Hunter art is original, made in this repo by `tools/ship-render/hunter.py`, and credited as original in `public/THIRD_PARTY_NOTICES.txt`'s sibling credit list (or the asset manifest's credit field if that is where originals are listed). It must not copy any existing game's ship.
- Use the Edit tool for code changes (no sed). Re-run the covering tests after every fix.
- Test command: `npx vitest run <files>`; typecheck: `npm run -s typecheck`.

---

### Task 1: The shield fx model (pure)

**Files:**
- Create: `src/renderer/src/render/shieldFx.ts`
- Create: `src/renderer/src/render/amberFilter.ts`
- Test: `tests/shieldFx.test.ts`, `tests/amberFilter.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Ellipse { cx: number; cy: number; rx: number; ry: number }
  export const SHIMMER_S = 0.5, RING_STEP_S = 0.06, PATCH_RINGS = 3, FLICKER_S = 0.15, COLLAPSE_S = 0.3;
  /** One hit on a ship's shield: `a` the impact bearing in the ship's own frame (radians, 0 = nose, +PI/2 = starboard),
   *  `age` seconds since it lands (negative while its shot is still flying), `drop` a layer went, `last` that was the last layer. */
  export interface ShieldHit { a: number; age: number; drop: boolean; last: boolean }
  export interface ShieldFx { hits: ShieldHit[][]; collapse: number[] }   // per ship slot; collapse = seconds since the last layer dropped, or -1
  export function createShieldFx(slots: number): ShieldFx;
  export function addShieldHit(fx: ShieldFx, slot: number, a: number, drop: boolean, last: boolean, delay?: number): void;
  export function stepShieldFx(fx: ShieldFx, dt: number): void;    // ages everything; drops hits older than SHIMMER_S; dt 0 holds
  /** The ellipse point on bearing `a`, given the ship frame's nose and starboard unit vectors in the drawing's px. */
  export function ellipsePoint(e: Ellipse, a: number, nose: { x: number; y: number }, star: { x: number; y: number }): { x: number; y: number };
  /** The hex cells to draw now in `e` (cell radius `cell` px, pointy-top hexes on an axial grid clipped to the ellipse):
   *  each lit cell's centre and alpha 0..1 (already multiplied by the edge brightening 0.45 + 0.55 * r^2, r the normalised
   *  ellipse radius of the centre). Empty when nothing shimmers. */
  export function shieldCells(fx: ShieldFx, slot: number, e: Ellipse, cell: number, nose: {x:number;y:number}, star: {x:number;y:number}): { x: number; y: number; alpha: number }[];
  /** The resting bubble's stroke alpha: 0 with `up` 0 (fading to 0 over COLLAPSE_S after a collapse), else 0.12 + 0.08 * up, at most 0.5. */
  export function bubbleAlpha(fx: ShieldFx, slot: number, up: number): number;
  /** The HUD layer flash: the layer index that just dropped and its flash 0..1 (1 at the hit, 0 after 0.3 s), or null. */
  export function shieldFlash(fx: ShieldFx, slot: number, up: number): { layer: number; alpha: number } | null;
  /** A flat-coordinate hex polygon [x0,y0,...] of radius r at (x,y), pointy-top. */
  export function hexPoints(x: number, y: number, r: number): number[];
  ```
  `amberFilter.ts`:
  ```ts
  /** feComponentTransfer tableValues (space-separated, 0..1) per channel that map luminance 0..1 onto the CRT ramp
   *  [glass, faint, dim, mid, main, hot] evenly spaced. */
  export function amberTables(): { r: string; g: string; b: string };
  ```

Behaviour details:
- A patch: find the hex cell nearest the impact point (`ellipsePoint` for the hit's bearing, pulled 1 cell inward). Cells at hex
  distance k ≤ PATCH_RINGS light from `age >= k * RING_STEP_S`; a ring's peak alpha is `1 - 0.25 k`; each cell's alpha falls linearly
  from its peak at its own start to 0 at `SHIMMER_S`. Several hits add (clamp 1).
- A `drop` hit adds a flicker: for `0 <= age < FLICKER_S`, every cell in the ellipse at alpha 0.35 (times the edge factor), summed with the patches.
- A `last` hit starts `collapse` at 0 (stepped by dt, then -1 once past COLLAPSE_S) and its flicker uses alpha 0.5.
- A hit with `age < 0` draws nothing yet.

- [ ] **Step 1:** Write `tests/shieldFx.test.ts`: a hit at age 0 lights only ring 0; at `2 * RING_STEP_S` rings 0-2 light with ring 2 dimmer than ring 0; every alpha is 0 at `SHIMMER_S` and the hit is removed after a step past it; `stepShieldFx(fx, 0)` changes nothing; a `drop` hit at age 0.05 lights cells far from the impact (the flicker), at 0.2 it does not; edge cells brighter than centre cells under a flicker; a delayed hit (`delay` 0.1) draws nothing until stepped 0.1; `bubbleAlpha` 0 with up 0, rising with up, capped 0.5, and after a `last` hit fading over COLLAPSE_S; `ellipsePoint` with nose (1,0), star (0,1) at a=0 gives (cx+rx, cy) and at PI/2 gives (cx, cy+ry); `shieldFlash` gives `{ layer: up, alpha: 1 }` right after a drop and null after 0.3 s; `hexPoints` returns 12 numbers at distance r.
- [ ] **Step 2:** Run, see them fail. **Step 3:** Implement. **Step 4:** Run, pass.
- [ ] **Step 5:** `tests/amberFilter.test.ts`: each table has 6 values; the first triple equals CRT.glass's channels / 255 (3 decimals), the last CRT.hot's. Implement, pass.
- [ ] **Step 6:** Commit `feat(ui-round-3): the shield fx model (hex shimmer, bubble, HUD flash) and the amber filter tables`.

### Task 2: Enemy shots and hit bearings (pure)

**Files:**
- Create: `src/renderer/src/render/duel/enemyShots.ts`
- Test: `tests/enemyShots.test.ts`

**Interfaces:**
- Consumes: `ViewEvent` (`render/tactical/fxModel.ts`): `laser {ship, hit, stripped, room, x1,y1,x2,y2}`, `pewHit {ship (target), owner, stripped, hull, room, x, y}`, `missileEnd {ship (owner), cause, target, room, x, y}`; `addShieldHit` from Task 1; `TacticalState` ships (`x`, `y`, `heading`) and `targetOf`, `CREW_SLOT` from `sim/tactical/state`.
- Produces:
  ```ts
  export type ShotKind = 'laser' | 'pew' | 'torpedo';
  /** A hit on one ship, read from one view event: the target slot, its ship-frame bearing (as ShieldHit.a), and what it did. */
  export interface ShipHitRead { target: number; a: number; kind: ShotKind; stopped: boolean; drop: boolean; room: number; miss: boolean }
  export function readHits(state: TacticalState, events: readonly ViewEvent[]): ShipHitRead[];
  export const FLIGHT_S: Record<ShotKind, number>;   // laser 0.12, pew 0.18, torpedo 0.35
  /** The interior's frame (ship px): the nose and starboard unit vectors, the shield ellipse, and each tactical room's landing point. */
  export interface InteriorFrame { nose: {x:number;y:number}; star: {x:number;y:number}; ellipse: Ellipse; rooms: {x:number;y:number}[] }
  export function interiorFrame(d: DuelState, rectTiles: TileRect): InteriorFrame;
  export interface Shot { kind: ShotKind; age: number; life: number; from: {x:number;y:number}; to: {x:number;y:number}; stopped: boolean; landed: boolean }
  export interface ShotState { shots: Shot[] }
  export function createShots(): ShotState;
  /** Queue a shot for every enemy hit on the crew ship (and every enemy miss: it flies past, through the centre and out). */
  export function pushShots(s: ShotState, hits: readonly ShipHitRead[], frame: InteriorFrame, reach: number): void;
  export function stepShots(s: ShotState, dt: number): void;   // dt 0 holds; a shot is removed SPLASH_S = 0.2 s after it lands
  /** Where a shot is now and its trail (torpedo only: 4 earlier points spaced 0.03 s back, else []); `burst` 0..1 after it lands. */
  export function shotDraw(shot: Shot): { x: number; y: number; trail: {x:number;y:number}[]; burst: number; heading: number };
  ```

Rules:
- Who is hit: for `laser`, the target is the other ship (`e.ship === CREW_SLOT ? targetOf(state, CREW_SLOT) : CREW_SLOT`); bearing from the
  target to the shooter `(x1, y1)`. A laser with `hit && stripped` is stopped and drops a layer; `hit && !stripped && room >= 0` goes
  through to `room`; `!hit` with no `rock` is a miss (skip lasers with `rock` set). For `pewHit`, target `e.ship`; bearing to the impact
  `(x, y)`; `stripped` stopped+drop, `hull` through to `room`. For `missileEnd` with `cause === 'ship'`, target `e.target`, bearing to
  `(x, y)`, through to `room` (torpedoes pass shields). Everything else is ignored.
- The ship frame: convert world (dx, dy) to (f, s) with the same transform the map uses to draw `HULLS` on a ship (find it in
  `render/tactical/` where hull polygons are placed by `heading`; use the sim's heading-to-radians helper, do not re-derive it), then
  `a = atan2(s, f)`. Unit test with a ship at heading 0 and one turned a quarter.
- `interiorFrame`: rooms[r] = the centre px of the tile of the first `d.points` entry with `tacticalRoom === r` (`TILE_PX`); nose = the
  unit vector from the Engines (2) landing point to the Weapons (0) one, or (1, 0) if degenerate; star = nose turned +90° in screen
  space (`{ x: -nose.y, y: nose.x }`); ellipse = the centre of `rectTiles` (×TILE_PX) with radii 0.56 × its width and height.
- `pushShots`: only hits whose `target === CREW_SLOT`. `from` = the frame centre plus `reach` px along the bearing (`ellipsePoint` with
  the ellipse scaled up to radius `reach`); `to` = the ellipse point for stopped hits, the room's landing point for through hits; a
  miss goes from `from` to the mirror point on the far side. `life = FLIGHT_S[kind]`.

- [ ] **Step 1:** Tests: `readHits` classifies each event shape above (stopped/drop, through with room, miss, ignored rock laser, ignored crew torpedo on a planet); the bearing for a shooter dead ahead of a heading-0 crew ship is 0 and on a quarter-turned ship is ±PI/2 per the map's convention; `interiorFrame` on a real duel state (build one the way `tests/interiorModel*.test.ts` do) gives 3 rooms and a unit nose; a stopped shot ends on the ellipse, a through shot at its room; `stepShots(0)` holds; a shot is gone after `life + 0.2`; torpedo trail has 4 points, laser none.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement. **Step 4:** Pass.
- [ ] **Step 5:** Commit `feat(ui-round-3): enemy shots and hit bearings in the interior frame`.

### Task 3: The ship view draws the shield and the shots; the HUD layer flash

**Files:**
- Modify: `src/renderer/src/app/duel/scene.ts` (owns `shieldFx` and `shots`; feeds them each frame)
- Modify: `src/renderer/src/render/duel/interiorView.ts` (draws them)
- Modify: `src/renderer/src/render/duel/shipHudModel.ts`, `src/renderer/src/ui/duel/ShipHud.tsx` (layer flash)
- Test: `tests/interiorShield.test.ts`, extend `tests/uiShipHud.test.tsx`

**Interfaces:**
- Consumes Task 1 and Task 2 exports.
- Produces: `InteriorView.draw(..., override?, look?: { shield: ShieldFx; shots: ShotState; up: number })`: a new optional last parameter; absent draws as today. `ShipHudView.shields.flash: { layer: number; alpha: number } | null` (default null in `shipHud`; the scene sets it from `shieldFlash(shieldFx, CREW_SLOT, up)`).

Steps:
- [ ] **Step 1:** In the scene, create `shieldFx = createShieldFx(2)` and `shots = createShots()` with the other fx state (reset where the fx state resets on a new round). Each frame, after `events` are known and before drawing: `const hits = readHits(d.tactical, events)`; for each hit with `stopped`, `addShieldHit(shieldFx, hit.target, hit.a, hit.drop, hit.drop && shieldsAfter === 0, FLIGHT_S[hit.kind])` where `shieldsAfter` is `d.tactical.systems[hit.target].shields`; `pushShots(shots, hits, frame, reach)` only when `view === 'interior'` (frame from `interiorFrame(d, rect)` with the rect the interior fits, which `interiorView` can expose as `frame()`; reach = the band diagonal / the world scale). Then `stepShieldFx(shieldFx, pdt)` and `stepShots(shots, pdt)` with `pdt = frozen ? 0 : dt`.
- [ ] **Step 2:** In `interiorView`, add one `Graphics` above `effects.above` and under the labels. Draw: the bubble (`ellipse` stroke 2 px, colour `0x6fc3ff`, alpha `bubbleAlpha`), the cells (`hexPoints` with `cell = TILE_PX * 0.4`, fill the shield colour at `alpha * 0.55`, stroke 1 px at `alpha`), and each shot from `shotDraw`: laser a 3-px bright line 24 px long along its heading (`0xff5a3c` core `0xffd0c0`), pew a 6-px dot with a 10-px tail, torpedo a 5-px body with its trail fading; `burst > 0` draws a ring growing 6→22 px with alpha `1 - burst`. Colours for shots are the enemy fire colours already used on the map if such constants exist (reuse them; else the values above).
- [ ] **Step 3:** HUD: `ShipHud.tsx` gives box `flash.layer` a `CRT.hot` 2-px border at opacity `flash.alpha` (over its normal look) and `data-ui-hud-shield-flash`. 
- [ ] **Step 4:** Tests: `tests/interiorShield.test.ts` builds the interior view the way `tests/interiorView*.test.ts` do, draws with a `look` holding a fresh stopped hit and a flying shot, and asserts the new Graphics is non-empty; with no `look` it is empty. Extend `uiShipHud.test.tsx`: a view with `flash: { layer: 1, alpha: 1 }` marks box 1.
- [ ] **Step 5:** Run those tests plus `tests/duelScene*.test.ts` and the interior tests; typecheck. Commit `feat(ui-round-3): the ship view's shield bubble, hex shimmer and enemy shots; the HUD layer flash`.

### Task 4: The original Hunter render and image URLs

**Files:**
- Create: `tools/ship-render/hunter.py`, `tools/ship-render/hunter.json`
- Create: `public/assets/art/ships/hunter.png` (committed, original)
- Modify: `public/assets/manifest.json` (entry `ship.hunter.art`), `src/renderer/src/render/assetNames.ts` (optional asset), the credits file originals are listed in
- Modify: `src/renderer/src/render/assets.ts` (`image(name): { url: string; w: number; h: number } | null` on `GameAssets`), every `GameAssets` fake in tests
- Test: extend the assets test that covers `GameAssets` (or a new `tests/assetImage.test.ts`)

The render: top-down orthographic, the scout hull (`HULLS.scout` in `render/tactical/hullModel.ts`, an original design, nose +f = image +x, starboard +s = image +y) extruded into a 3D hull with plating seams, a raised spine, three lit room hatches at the room polygons, twin engine bells aft and a weapon pod fore; neutral grey materials (the window maps luminance to amber); transparent background; the camera frames the hull's bounding box plus a margin of 0.1 ship units, written into `hunter.json` as `{ "frame": { "f0", "s0", "f1", "s1" }, "px": [w, h] }` so the window can place the image with `contactFit`.

- [ ] Steps: write the script; render with `"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" --background --factory-startup --disable-autoexec --python tools/ship-render/hunter.py -- tools/ship-render/hunter.json --out public/assets/art/ships`; look at the PNG; iterate until it reads as a ship at window size (~250 px wide); add the manifest entry and credit; add `image()`; tests; commit `feat(ui-round-3): an original Hunter rendered in Blender; GameAssets.image`.

### Task 5: The enemy window draws the Hunter in amber, its bars under the picture, and the shield shimmer

**Files:**
- Modify: `src/renderer/src/render/duel/consoleLayout.ts` (`CONTACT_BOX` y `CONTACT.y + 36`, h 200 → keeps 200; bottom at `CONTACT.y + 236`)
- Modify: `src/renderer/src/render/duel/contactModel.ts` (`art`, `bars`, `shield` fields), `src/renderer/src/ui/duel/ContactWindow.tsx`
- Modify: `src/renderer/src/app/duel/scene.ts` (passes `art` and the shield fx)
- Test: `tests/contactModel*.test.ts`, `tests/uiContactWindow*.test.tsx` (whichever exist; extend)

**Interfaces:**
- `ContactModelInput` gains `art?: { url: string; frame: { f0: number; s0: number; f1: number; s1: number } } | null` and `shield?: { fx: ShieldFx; slot: number } | null`.
- `ContactView` gains `art: { url: string; x: number; y: number; w: number; h: number } | null` (the frame corners through the same `contactFit` as the outline; only at scan Level ≥ 1), `shield: { ellipse: Ellipse; bubble: number; cells: { x: number; y: number; alpha: number }[]; cell: number } | null` (ellipse = the placed outline's bounding box centre, radii 0.56 × its size; `cell` 5; nose (1,0), star (0,1)), and the status row moves: `statusY` becomes `box.y + box.h + 6`.

Steps:
- [ ] **Step 1:** Tests first: the model at Level 1 returns `art` inside the box and a `shield` with bubble > 0 when the enemy has layers up; at Level 0 `art` is null; a stopped hit on the enemy slot in the fx gives cells. The window renders an `<image data-ui-contact-art>` under the outline with `filter="url(#crt-amber)"`, a `<filter id="crt-amber">` built from `amberTables()` (feColorMatrix saturate 0, then feComponentTransfer tables), the outline polygon's fill switched to `none` when art draws, the bubble ellipse and the cells (`hexPoints`) in `CRT.main`, and the SHLD/HULL row under the box. The shield pips become a framed bar like the HUD's (`SHIELD_PANEL` look at the window's 8 px size).
- [ ] **Step 2:** Implement; the scene passes `art` from `assets.image('ship.hunter.art')` plus `hunter.json`'s frame (import the JSON), and `shield: { fx: shieldFx, slot: targetOf(d.tactical, CREW_SLOT) }`.
- [ ] **Step 3:** Fix the tests that pinned `CONTACT_BOX` or the status row at `top + 34`; run the contact tests, `tests/consoleLayout*.test.ts`, typecheck. Commit `feat(ui-round-3): the enemy window draws the Hunter in amber with its bars under it and the shield shimmer`.

### Task 6: The own ship window draws the painted ship in amber and its shield

**Files:**
- Modify: `src/renderer/src/render/duel/ownShipModel.ts`, `src/renderer/src/ui/duel/OwnShipWindow.tsx`, `src/renderer/src/app/duel/scene.ts`
- Test: `tests/ownShipModel*.test.ts`, `tests/uiOwnShipWindow*.test.tsx` (whichever exist; extend)

**Interfaces:**
- `ownShipModel(d, box, t, flashUntil, look?: { painting: { url: string; w: number; h: number } | null; fx: ShieldFx } )`.
- `OwnShipView` gains `painting: { url: string; x: number; y: number; w: number; h: number } | null` (the image placed in the same tile→px transform as `tiles`: its top-left at `BATTLEMAPS[layout].origin` tiles, its size `w / pxPerTile` by `h / pxPerTile` tiles; null when the layout has no painting or it is missing), and `shield` as in Task 5 (ellipse = the tiles' bounding box, radii 0.56 ×; `cell` 4; nose/star = the interior frame's, from `interiorFrame`).

Steps:
- [ ] **Step 1:** Tests: with a painting the view has `painting` covering the tiles' box; tiles then draw only damaged/burning ones (their fill at 0.6 opacity) while the edges stay; without one, as today. The window renders the `<image data-ui-own-painting>` with the amber filter (shared: move the `<filter>` to a small `ui/duel/AmberFilter.tsx` both windows render), the bubble and cells.
- [ ] **Step 2:** Implement; the scene passes `assets.image(battlemapFor(layout)?.name)`.
- [ ] **Step 3:** Run the own ship tests and typecheck. Commit `feat(ui-round-3): the own ship window draws the painted ship in amber with its shield`.

### Task 7: Verify, screenshots, docs

- [ ] Full suite (`npx vitest run`), typecheck, determinism (`npm run test:determinism` if present), and the duel app smoke (`npm run test:duel-app-runtime`).
- [ ] Screenshots (visual-check method, `C:\Users\djuar\FTLite-shots\ui-round-3\`): the ship view with a stopped hit, a layer drop and a hull hit; the Weapons terminal with the enemy window scanned and unscanned and the own ship window.
- [ ] Report `docs/superpowers/research/2026-11-20-ui-round-3-report.md`; a gate entry in `docs/gates.md` (owner look: the Hunter render, the shimmer, the shots).
