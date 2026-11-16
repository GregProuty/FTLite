# Art-i-a (pipeline and crispness) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Art-i sections 1-4: the art bible, paid assets in the manifest, the `npm run art:import` script, and a pixel-perfect, palette-driven ship interior (snapped world fit, procedural walls, doors and effects on the 2-unit art-pixel grid, colours from `palette.json`, a floor art hook).

**Architecture:** One static `palette.json` (placeholder Lospec "Apollo") parsed by a pure `palette.ts` that the renderer and the import script both read. A pure `snapWorldScale` plus `fitInBand` replace the old fit maths; the renderer keeps the letterbox stage scale and passes it to `worldFit`, and the duel interior reads it through a getter. The door, wall and effects shapes stay pure models (`doorModel.ts`, `wallModel.ts`, a new `effectsShapes.ts`) tested for even geometry; the Pixi layers only draw what the models return. The import script is a pure core (`scripts/art/importCore.ts`) behind a thin CLI.

**Tech Stack:** Electron 37, PixiJS 8.19, TypeScript 5.8, vitest 3.2.7, zod 3, pngjs 7.0.0 (new dev dependency, scripts only), tsx.

**Spec:** `docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md` (sections 1-4 only; refine run `docs/superpowers/reviews/2026-11-16-art-i-spec/`). Art-i-b (sections 5-8) is a separate plan.

## Global Constraints

- No sim, command, snapshot or authority change: `SIM_VERSION` (38 at plan time) and every golden stay unchanged; `npx vitest run tests/golden.test.ts tests/duelGolden.test.ts tests/boundary.test.ts` passes untouched.
- The renderer only reads sim state, never the sim RNG (no import of a `rng` module, no `.rng` access under `src/renderer/src/render/`).
- Art is drawn at 16 px per tile and shown at 2x (`TILE_PX` 32): one art pixel is 2 world units. Every procedural rectangle, stroke band and particle is even in x, y, w and h.
- Screen pixels per art pixel = `2 × worldScale × stageScale`; `snapWorldScale(fit, stage)`: `n = floor(2 × fit × stage)`; if `n ≥ 1` and `n / (2 × stage) ≥ 0.75 × fit` the scale is `n / (2 × stage)`, else `fit`.
- `PANEL_THICK` 12 with `BAND` 10 (12 + 10 + 10 = `TILE_PX`).
- No `0x` colour literal remains in `tiles.ts`, `doorModel.ts`, `wallModel.ts` or `effects.ts`.
- `pngjs` is a dev dependency used by scripts only, never imported by the renderer.
- The asset source folder is `FTLITE_ASSETS`, else `C:\Users\djuar\FTLite-assets`; tests never read it (they use generated PNGs in a temp dir).
- `public/assets/paid/` and `.art/` are gitignored; manifest entries (metadata) are committed.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The working copies use CRLF line endings (git `core.autocrlf=true`). Use the Edit tool for changes to existing files (it keeps endings); do not hand-convert endings.
- Work happens in the worktree `.worktrees/art-i-a` on branch `art-i-a`. Every command below runs from that worktree's root unless it says otherwise.

## Prototype verification

Every task's code below was written and run in a scratch worktree (`../ftlite-art-i-a-proto`, branch `art-i-a-proto`, based on master `2871669`) and removed afterwards:

| Task | Prototype-verified | Evidence |
|---|---|---|
| 1 palette + bible | yes (code; the bible is prose) | `tests/palette.test.ts` 5 passed |
| 2 snapped fit | yes | `worldFit` 12, `layout` 7, `projectileModel` 10, `duelInterior` 3 passed |
| 3 door and wall grid | yes | `doorModel` 8, `wallModel` 10, `consoleModel` 7 passed |
| 4 paid manifest | yes | `paidManifest` 11, `manifest` 11, `credits` 6, `assets` 6, `renderPure` 19 passed; `npm run credits` left both generated files with no diff |
| 5 tiles + effects | yes | `tileLayer` 2, `artGuards` 67 (with 60 render files) passed; the pngjs/scripts guard (+79) was added in plan review round 1 and not run in the prototype |
| 6 import script | yes | `artImport` 10 passed; CLI exit 1 on a missing folder, exit 0 on the empty list |
| 7 final | yes | full suite 3294 tests (3292 passed, 1 failure from the missing signalling junction that Step 0.1 now adds, 1 skipped); `npx tsc -b` clean; `npm run build` ok; all four screenshots written by the harness |

After all six tasks `npx tsc -b` was clean and the suite grew by 111 tests over the prototype's baseline.

## Decisions

1. **Placeholder palette: Apollo (46 colours) by AdamCYounis, https://lospec.com/palette-list/apollo** (hex list fetched from `https://lospec.com/palette-list/apollo.hex` on 2026-11-16). Chosen over Endesga 32 because its ten-step blue-grey ramp (`090a14` to `ebede9`) holds near-exact matches for today's floor (`c9cdd6` → `c7cfcc`), wall (`3b4150` → `394a50`), door (`d9a441` → `de9e41`) and background (`05060a` → `090a14`), so the game barely changes before Art-ii. The list, in file order:
   `172038 253a5e 3c5e8b 4f8fba 73bed3 a4dddb 19332d 25562e 468232 75a743 a8ca58 d0da91 4d2b32 7a4841 ad7757 c09473 d7b594 e7d5b3 341c27 602c2c 884b2b be772b de9e41 e8c170 241527 411d31 752438 a53030 cf573c da863e 1e1d39 402751 7a367b a23e8c c65197 df84a5 090a14 10141f 151d28 202e37 394a50 577277 819796 a8b5b2 c7cfcc ebede9`.
2. **Role assignments** (today's constant in brackets): background `090a14` [05060a], floor `c7cfcc` [FLOOR c9cdd6], floorSeam `a8b5b2` [new], wall `394a50` [WALL 3b4150], wallLight `577277` [new], wallShadow `202e37` [new], doorFill `de9e41` [DOOR_FILL d9a441], doorOutline `151d28` [DOOR_OUTLINE 1b1b1b], space `090a14`, ambient `a8b5b2` (Art-i-b), alert `a53030` (Art-i-b), vacuum `4f8fba` (Art-i-b), flash `ebede9` (Art-i-b), lampOn `e8c170`, lampOff `577277`, screenA `73bed3`, screenB `4f8fba`, lowO2 `cf573c` [LOW_O2_COLOR d13a3a], impact `cf573c` [IMPACT_COLOR ff6b5a], doorSealed `cf573c` [SEALED_FILL c8502d], heldTick `e8c170` [HELD_TICK f5b942], spaceGap `090a14` [SPACE_GAP 0b0e14], fireFallback `da863e` [ff8c1a], breach `a53030` [ff3030], airlockOutline `73bed3` [4fc3f7], ventSpeck `ebede9` [d8ecff], failed `e8c170` [ffd23a]. Apollo has no pure white; `ebede9` stands in for "white" everywhere.
3. **Ramps:** fire `ebede9 e8c170 de9e41 be772b cf573c a53030 602c2c 577277` (white, yellow, orange, red, brown, smoke grey); plasma `ebede9 a4dddb 73bed3 4f8fba 3c5e8b 253a5e 172038` (white, cyan, blues, navy); electric `ebede9 a4dddb 73bed3 7a367b 402751` (white, pale blue, violet); vent `ebede9 c7cfcc a8b5b2 819796 577277` (white, pale grey, blue-grey).
4. **palette.json format:** `{ name, source, colours: "#rrggbb"[], roles: { role: "#rrggbb" }, ramps: { ramp: "#rrggbb"[] } }`. `parsePalette` rejects a missing role, an unknown role, a role or ramp colour not in `colours`, a ramp outside 5-8 colours and a malformed hex, so a bad palette fails at startup and in the tests.
5. **How the stage scale reaches the fits.** Callers found: `renderer.ts` (resize, draw → `worldFit`), `duel/interiorView.ts` (`duelFit`), `app/duel/duelMode.ts` (two `createInteriorView` calls), and tests `worldFit`, `layout`, `projectileModel`, `duelInterior`. Callouts and projectiles already receive the `fit` object from `renderer.draw` (`callouts.draw(..., { scale: fit.scale, x: fit.x + shake.x, ... })`, `projectiles.draw(state, fit, ...)`) and need no change. `worldFit(w, h, stage)` and `duelFit(w, h, stage)` take a **required** stage argument (no default, so no caller silently stays unsnapped). `Renderer` keeps `stage` (1 until the first resize), exposes `stageScale(): number`, and on a resize that **changes** the stage scale calls `projectiles.reset()` (a resize with the same scale, such as the menu strip reflowing, keeps shots in flight). `createInteriorView(assets, stageScale = () => 1)` reads the getter every frame; `duelMode.ts` passes `renderer.stageScale`. The 1e-9 in `snapWorldScale`'s floor guards floating-point products that should be whole.
6. **x and y on whole screen pixels:** `Math.round(v × stage) / stage`. At stage 1 the old rounding is unchanged, so the duel interior stays at `{ scale: 1, x: 66, y: 152 }`.
7. **Door geometry on the grid:** panel width `w = 2 × round(16 × (1 − p) / 2)`, drawn when `w > 0`; jambs `{0, 8, 2, 16}` and `{30, 8, 2, 16}` (were y 7, h 18); seam `{16, 10, 2, 12}` (was x 15); seal bar `{10, 14, 12, 4}` (was y 15, h 3); held ticks `{2, 8, 2, 16}` and `{28, 8, 2, 16}` (were 3 wide); panel outline stroke width `PANEL_STROKE` 2, alignment 1 (inside). Stripes keep `x = r.x + 4` step 6, now even because panels are. `consoleModel.WALL_GAP` follows `BAND`/`PANEL_THICK` automatically (11 → 10; its tests compute it).
8. **Wall light and shadow:** computed per band segment. Light: the top face (`y = BAND`, 2 high) of the west arm, the hub (only when no north arm) and the east arm; the left face (`x = BAND`, 2 wide) of the north arm, the hub (only when no west arm) and the south arm. Shadow: the same on the bottom face (`y = BAND + 10`; hub only when no south arm) and the right face (`x = BAND + 10`; hub only when no east arm). Draw order band, shadow, light.
9. **Floor seam ("quiet two-tone"):** each floor and door tile gets one art pixel of `floorSeam` along its top edge and its left edge (`floorSeams()`); the half- and quarter-tile floor parts of wall tiles get none. Door tiles' seams are covered by the door's floor fill, as today.
10. **Floor art hook:** `houseFloorName(tile) = house.floor.${pickVariant(tile, 4)}` (the existing Knuth hash in `tilePick.ts`). With the `houseFloor` feature ready, every floor tile and each floor part of a wall tile draws a 2x `Sprite` cut from the matching part of the 16 px frame (a sub-`Texture` on the same source), in a `floorArt` container under the procedural `Graphics`; the door picture's floor fill is skipped so the art shows through doorways.
11. **Effects helpers** live in a new pure module `render/effectsShapes.ts` (not in `effects.ts`, which imports Pixi): `fireFallbackRect`, `breachRect`, `failedRect`, `ventSpeckRect` (centre rounded to an even unit, 4 × 4), `airlockOutlineBand` (rect grown by 2, width 2, alignment 1). The doors-console outline drops from width 3 to 2.
12. **`enemyWindow.ts`** imported `DOOR_FILL` and `DOOR_OUTLINE` from `doorModel`; it now reads `ROLE.doorFill` and `ROLE.doorOutline` (its other colours are out of scope).
13. **Paid manifest:** no paid entries are added to `public/assets/manifest.json` in Art-i-a (nothing is bought yet; Art-ii adds them), so `npm run credits` output is byte-identical. Notices print `== paid (commercial licences) ==` as the section header for paid entries. The duplicate-name rule skips an entry that already failed "exactly one of name or sheet" (its names are undefined).
14. **Import config (`art/import.json`):** `{ $comment?, outputs: { pack, frames: {x,y,w,h}[], output, columns }[] }`. `pack` is relative to the source folder; `output` is relative to the repo root and must resolve under `public/assets/paid/`; frames go left to right, `columns` per row, each in a cell as large as the largest frame. The committed file has an empty list plus an example in `$comment`. A missing source folder is a problem even with an empty list (the spec's rule), so `npm run art:import` exits 1 on a machine without the folder.
15. **Import output:** 8-bit RGBA PNGs from `pngjs` `PNG.sync.write` with fixed options (deterministic). Alpha < 128 becomes `0,0,0,0`; the rest opaque in the nearest palette colour (OKLab squared distance, first colour wins a tie, a per-RGB cache). Contact sheet: every output at 2x, stacked top to bottom with a 4 px gap, on the `background` role, written last.
16. **Screenshots:** the sector game is now reachable only through Multiplayer → Host (main menu, master 2871669), which needs the local room service. Task 7 therefore uses a throwaway, gitignored harness in `.art/shots/` (a Vite page that draws the real `createRenderer` + `createSimState` or `createInteriorView` + `createDuel`, and an Electron script that emulates the viewport size with CDP and captures it). Emulating 1920 × 1080 gives stage 1.5 and 2560 × 1440 stage 2 on any monitor. The duel interior shot uses the same harness (the duel only shows its interior when the active character stands, which the harness gets for free); `FTLITE_MODE=duel` remains the owner's manual check.
17. **Electron binary:** `npm ci` in a fresh worktree may skip Electron's install script (npm `allow-scripts`), leaving `node_modules/electron/dist` without `electron.exe`. Builds and tests do not need it; Task 7 uses the main checkout's `C:\Users\djuar\FTLite\node_modules\electron\dist\electron.exe`. Electron must get its arguments through the `SHOT` environment variable: a URL on Electron's command line makes it ignore the script.
18. **Left for Art-i-b (stated deviations from spec section 1):** (f) the existing sector shake (`projectiles.ts`, whole internal pixels, 3-4 px) and the duel interior shake stay as they are, so while a shake runs at stage 1.5 the world is briefly off whole screen pixels; Art-i-b section 7 replaces both with whole-art-pixel steps. (g) The `vent.puff` sprite keeps its quarter-turn rotation (`ventRotation`, multiples of 90 degrees, which keep the pixel grid) until Art-i-b replaces it with particles. The bible says so.
19. **Value hierarchy and the placeholder floor:** the bible keeps the spec's "calm, dark mid-tones" rule. The Art-i-a placeholder floor (`c7cfcc`, matching today's `c9cdd6`) is lighter than that rule on purpose, to keep today's look; Art-ii's pack palette brings floors down to dark mid-tones.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `docs/art/bible.md` | create | The art bible (section 1). |
| `src/renderer/src/render/palette.json` | create | House palette: colours, roles, ramps. |
| `src/renderer/src/render/palette.ts` | create | `parsePalette`, `ROLE`, `RAMP`, `PALETTE` (pure). |
| `src/renderer/src/render/worldFit.ts` | modify | `snapWorldScale`, `fitInBand`, `worldFit(w, h, stage)`. |
| `src/renderer/src/render/duel/interiorModel.ts` | modify | `duelFit(w, h, stage)` via `fitInBand`. |
| `src/renderer/src/render/duel/interiorView.ts` | modify | Takes a `stageScale` getter. |
| `src/renderer/src/render/renderer.ts` | modify | Keeps the stage scale, `stageScale()`, resets projectiles on change. |
| `src/renderer/src/app/duel/duelMode.ts` | modify | Passes `renderer.stageScale`. |
| `src/renderer/src/render/doorModel.ts` | modify | Even door geometry, `panelWidth`, `PANEL_STROKE`, palette roles. |
| `src/renderer/src/render/wallModel.ts` | modify | Light/shadow edges, `floorSeams`, `houseFloorName`. |
| `src/renderer/src/render/enemyWindow.ts` | modify | Door colours from roles. |
| `src/renderer/src/render/licenses.ts` | modify | Licence `paid`. |
| `src/renderer/src/render/manifest.ts` | modify | `paid/` path, paid rules, one name per entry. |
| `src/renderer/src/render/creditsText.ts` | modify | Paid notice lines. |
| `src/renderer/src/render/assetNames.ts` | modify | `house.floor.0-3` optional. |
| `src/renderer/src/render/fallback.ts` | modify | Feature `houseFloor`. |
| `.gitignore` | modify | `public/assets/paid/`, `.art/`. |
| `src/renderer/src/render/effectsShapes.ts` | create | Pure even-grid effect rectangles. |
| `src/renderer/src/render/effects.ts` | modify | Roles and the shape helpers. |
| `src/renderer/src/render/tiles.ts` | modify (rewrite) | Roles, wall edges, floor seams, floor art hook. |
| `scripts/art/importCore.ts` | create | Import validation, OKLab remap, sheet packing, contact sheet. |
| `scripts/art-import.ts` | create | CLI for `npm run art:import`. |
| `art/import.json` | create | Import list (empty, with an example). |
| `package.json`, `package-lock.json` | modify | `pngjs`, `@types/pngjs`, `art:import`. |
| `tests/helpers/artGrid.ts` | create | `onGrid`, `strokeBand`. |
| `tests/palette.test.ts`, `tests/paidManifest.test.ts`, `tests/tileLayer.test.ts`, `tests/artGuards.test.ts`, `tests/artImport.test.ts` | create | New tests. |
| `tests/worldFit.test.ts`, `tests/doorModel.test.ts`, `tests/wallModel.test.ts` | modify (rewrite) | Updated expectations. |
| `tests/layout.test.ts`, `tests/projectileModel.test.ts`, `tests/duelInterior.test.ts`, `tests/manifest.test.ts` | modify | Signature and licence-list updates. |

---

### Step 0: Worktree and baseline

- [ ] **Step 0.1: Create the worktree** (from the main checkout `C:\Users\djuar\FTLite`, Git Bash)

```bash
cd /c/Users/djuar/FTLite
git worktree add .worktrees/art-i-a -b art-i-a master
cd .worktrees/art-i-a
npm ci --no-audit --no-fund
powershell -NoProfile -Command "New-Item -ItemType Junction -Path 'C:\Users\djuar\FTLite\.worktrees\art-i-a\services\signalling\node_modules' -Target 'C:\Users\djuar\FTLite\services\signalling\node_modules' | Out-Null"
```

Expected: `Preparing worktree (new branch 'art-i-a')`, then npm finishes (an `allow-scripts` warning about esbuild or electron is harmless; see Decision 17). The junction gives the worktree the signalling service's `node_modules` (miniflare), which `tests/onlineAppRuntime.test.ts` needs; without it that test fails in every `.worktrees/` checkout. Before `git worktree remove` at the end of the branch, delete this junction and the root `node_modules` junction if any (`Remove-Item` on the junction path itself, never `-Recurse` into its target).

- [ ] **Step 0.2: Build once** (one test reads `out/main/authorityHost.js`)

Run: `npm run build`
Expected: ends with `✓ built in` and no error.

- [ ] **Step 0.3: Record the baseline**

Run: `npx vitest run 2>&1 | tail -6`
Expected: a summary like `Test Files 235 passed | 1 skipped` / `Tests N passed | 1 skipped (M)`. Write down `M` (the total) and the passed and failed counts. Expect **0 failed** after Step 0.1 (signalling junction) and Step 0.2 (`out/` built). On the planning machine (master 2871669, without the junction and before building `out/`) there were failures in 2 test files out of 3183 tests: `tests/onlineRecoveryInstrumentation.test.ts` (needs `out/`, fixed by Step 0.2) and `tests/onlineAppRuntime.test.ts` (needs the signalling junction, fixed by Step 0.1). If any failure remains here, stop and report it before Task 1; it is not an expected flake.

---

### Task 1: House palette and art bible

**Files:**
- Create: `src/renderer/src/render/palette.json`
- Create: `src/renderer/src/render/palette.ts`
- Create: `docs/art/bible.md`
- Test: `tests/palette.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const ROLES: readonly ['background', 'floor', 'floorSeam', 'wall', 'wallLight', 'wallShadow', 'doorFill', 'doorOutline', 'space', 'ambient', 'alert', 'vacuum', 'flash', 'lampOn', 'lampOff', 'screenA', 'screenB', 'lowO2', 'impact', 'doorSealed', 'heldTick', 'spaceGap', 'fireFallback', 'breach', 'airlockOutline', 'ventSpeck', 'failed']`; `type Role`
  - `export const RAMPS: readonly ['fire', 'plasma', 'electric', 'vent']`; `type RampName`
  - `export interface PaletteFile { colours: string[]; roles: Record<string, string>; ramps: Record<string, string[]> }`
  - `export interface Palette { colours: number[]; roles: Record<Role, number>; ramps: Record<RampName, number[]> }`
  - `export function hexToNumber(hex: string): number`
  - `export function parsePalette(file: PaletteFile): Palette`
  - `export const PALETTE: Palette; export const ROLE: Readonly<Record<Role, number>>; export const RAMP: Readonly<Record<RampName, readonly number[]>>`

- [ ] **Step 1: Write the failing test** — create `tests/palette.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import data from '../src/renderer/src/render/palette.json';
import { PALETTE, RAMPS, ROLE, ROLES, hexToNumber, parsePalette } from '../src/renderer/src/render/palette';

describe('the house palette (Art-i spec section 4)', () => {
  it('holds 32 to 48 distinct colours', () => {
    expect(PALETTE.colours.length).toBeGreaterThanOrEqual(32); expect(PALETTE.colours.length).toBeLessThanOrEqual(48);
    expect(new Set(PALETTE.colours).size).toBe(PALETTE.colours.length);
  });
  it('defines every role the spec names, and every role colour is in colours', () => {
    expect(ROLES).toEqual(['background', 'floor', 'floorSeam', 'wall', 'wallLight', 'wallShadow', 'doorFill', 'doorOutline', 'space', 'ambient', 'alert', 'vacuum',
      'flash', 'lampOn', 'lampOff', 'screenA', 'screenB', 'lowO2', 'impact', 'doorSealed', 'heldTick', 'spaceGap', 'fireFallback', 'breach', 'airlockOutline', 'ventSpeck', 'failed']);
    const colours = new Set(PALETTE.colours);
    for (const r of ROLES) expect(colours.has(ROLE[r]), r).toBe(true);
    expect(Object.keys(data.roles).sort()).toEqual([...ROLES].sort());
  });
  it('defines the four ramps, 5 to 8 colours each, every colour in colours', () => {
    expect(RAMPS).toEqual(['fire', 'plasma', 'electric', 'vent']);
    const colours = new Set(PALETTE.colours);
    for (const name of RAMPS) {
      const ramp = PALETTE.ramps[name];
      expect(ramp.length, name).toBeGreaterThanOrEqual(5); expect(ramp.length, name).toBeLessThanOrEqual(8);
      for (const c of ramp) expect(colours.has(c), `${name} ${c.toString(16)}`).toBe(true);
    }
  });
  it('keeps the placeholder close to the pre-Art-i look', () => {
    expect(ROLE.floor).toBe(hexToNumber('#c7cfcc')); expect(ROLE.wall).toBe(hexToNumber('#394a50')); expect(ROLE.doorFill).toBe(hexToNumber('#de9e41'));
  });
  it('rejects a role colour outside colours, a missing role, an unknown role, a short ramp and a bad hex', () => {
    const good = structuredClone(data);
    expect(() => parsePalette({ ...good, roles: { ...good.roles, floor: '#123456' } })).toThrow(/role floor #123456 is not in colours/);
    const { wall: _wall, ...noWall } = good.roles;
    expect(() => parsePalette({ ...good, roles: noWall })).toThrow(/role wall is missing/);
    expect(() => parsePalette({ ...good, roles: { ...good.roles, extra: '#ebede9' } })).toThrow(/unknown role extra/);
    expect(() => parsePalette({ ...good, ramps: { ...good.ramps, vent: ['#ebede9'] } })).toThrow(/ramp vent has 1 colours/);
    expect(() => hexToNumber('ebede9')).toThrow(/#rrggbb/);
    expect(hexToNumber('#ebede9')).toBe(15461865);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/palette.test.ts`
Expected: FAIL, `Failed to resolve import "../src/renderer/src/render/palette.json"`.

- [ ] **Step 3: Create `src/renderer/src/render/palette.json`**

```json
{
  "name": "Apollo (placeholder, Art-i-a)",
  "source": "https://lospec.com/palette-list/apollo",
  "colours": [
    "#172038", "#253a5e", "#3c5e8b", "#4f8fba", "#73bed3", "#a4dddb",
    "#19332d", "#25562e", "#468232", "#75a743", "#a8ca58", "#d0da91",
    "#4d2b32", "#7a4841", "#ad7757", "#c09473", "#d7b594", "#e7d5b3",
    "#341c27", "#602c2c", "#884b2b", "#be772b", "#de9e41", "#e8c170",
    "#241527", "#411d31", "#752438", "#a53030", "#cf573c", "#da863e",
    "#1e1d39", "#402751", "#7a367b", "#a23e8c", "#c65197", "#df84a5",
    "#090a14", "#10141f", "#151d28", "#202e37", "#394a50", "#577277",
    "#819796", "#a8b5b2", "#c7cfcc", "#ebede9"
  ],
  "roles": {
    "background": "#090a14",
    "floor": "#c7cfcc",
    "floorSeam": "#a8b5b2",
    "wall": "#394a50",
    "wallLight": "#577277",
    "wallShadow": "#202e37",
    "doorFill": "#de9e41",
    "doorOutline": "#151d28",
    "space": "#090a14",
    "ambient": "#a8b5b2",
    "alert": "#a53030",
    "vacuum": "#4f8fba",
    "flash": "#ebede9",
    "lampOn": "#e8c170",
    "lampOff": "#577277",
    "screenA": "#73bed3",
    "screenB": "#4f8fba",
    "lowO2": "#cf573c",
    "impact": "#cf573c",
    "doorSealed": "#cf573c",
    "heldTick": "#e8c170",
    "spaceGap": "#090a14",
    "fireFallback": "#da863e",
    "breach": "#a53030",
    "airlockOutline": "#73bed3",
    "ventSpeck": "#ebede9",
    "failed": "#e8c170"
  },
  "ramps": {
    "fire": ["#ebede9", "#e8c170", "#de9e41", "#be772b", "#cf573c", "#a53030", "#602c2c", "#577277"],
    "plasma": ["#ebede9", "#a4dddb", "#73bed3", "#4f8fba", "#3c5e8b", "#253a5e", "#172038"],
    "electric": ["#ebede9", "#a4dddb", "#73bed3", "#7a367b", "#402751"],
    "vent": ["#ebede9", "#c7cfcc", "#a8b5b2", "#819796", "#577277"]
  }
}
```

- [ ] **Step 4: Create `src/renderer/src/render/palette.ts`**

```ts
// The house palette (Art-i spec section 4): one JSON file read by the renderer and by scripts/art-import.ts.
// Changing palette.json means a rebuild (it is imported statically). Pure: no Pixi.
import data from './palette.json';

export const ROLES = [
  'background', 'floor', 'floorSeam', 'wall', 'wallLight', 'wallShadow', 'doorFill', 'doorOutline', 'space', 'ambient', 'alert', 'vacuum',
  'flash', 'lampOn', 'lampOff', 'screenA', 'screenB', 'lowO2', 'impact', 'doorSealed', 'heldTick', 'spaceGap', 'fireFallback', 'breach',
  'airlockOutline', 'ventSpeck', 'failed'
] as const;
export type Role = (typeof ROLES)[number];
export const RAMPS = ['fire', 'plasma', 'electric', 'vent'] as const;
export type RampName = (typeof RAMPS)[number];

export interface PaletteFile { colours: string[]; roles: Record<string, string>; ramps: Record<string, string[]> }
export interface Palette { colours: number[]; roles: Record<Role, number>; ramps: Record<RampName, number[]> }

/** '#rrggbb' to the number rrggbb; throws on anything else. */
export function hexToNumber(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`palette: "${hex}" is not #rrggbb`);
  return parseInt(hex.slice(1), 16);
}

/** Checks the file and converts it: every role and ramp present, no unknown role, every role and ramp colour one of `colours`, ramps 5 to 8 long. */
export function parsePalette(file: PaletteFile): Palette {
  const problems: string[] = [];
  const colours = file.colours.map(hexToNumber);
  const inPalette = new Set(colours);
  const pick = (where: string, hex: string | undefined): number => {
    if (hex === undefined) { problems.push(`${where} is missing`); return 0; }
    const n = hexToNumber(hex);
    if (!inPalette.has(n)) problems.push(`${where} ${hex} is not in colours`);
    return n;
  };
  const roles = Object.fromEntries(ROLES.map((r) => [r, pick(`role ${r}`, file.roles[r])])) as Record<Role, number>;
  const ramps = Object.fromEntries(RAMPS.map((name) => {
    const list = file.ramps[name] ?? [];
    if (list.length < 5 || list.length > 8) problems.push(`ramp ${name} has ${list.length} colours (5 to 8)`);
    return [name, list.map((h, i) => pick(`ramp ${name}[${i}]`, h))];
  })) as Record<RampName, number[]>;
  for (const r of Object.keys(file.roles)) if (!(ROLES as readonly string[]).includes(r)) problems.push(`unknown role ${r}`);
  if (problems.length) throw new Error(`Invalid palette: ${problems.join('; ')}`);
  return { colours, roles, ramps };
}

export const PALETTE: Palette = parsePalette(data);
/** The role colours as numbers, ready for Pixi fills. */
export const ROLE: Readonly<Record<Role, number>> = PALETTE.roles;
export const RAMP: Readonly<Record<RampName, readonly number[]>> = PALETTE.ramps;
```

- [ ] **Step 5: Run the test to see it pass**

Run: `npx vitest run tests/palette.test.ts`
Expected: `Tests 5 passed (5)`.

- [ ] **Step 6: Write the art bible** — create `docs/art/bible.md`:

```markdown
# FTLite art bible

Every art change follows this page: bought packs, the owner's own pixel art, and procedural shapes drawn in code.
Source: Art-i spec (`docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md`, section 1).

## Pixel size

- Art is drawn at **16 px per tile** and shown at **2x** (`TILE_PX` = 32 world units per tile). One art pixel is **2 world units**.
- Every procedural rectangle, stroke and particle is a whole number of art pixels: even world units, at even offsets.
  A stroke counts by the band it paints, not its path: Pixi 8 paints `alignment × width` inside the path and the rest outside,
  so the door panels use a 2-unit stroke with alignment 1 (inside) on an even rectangle.
- No sprite is rotated except by quarter turns (today only the vent puff, until Art-i-b replaces it), and none is scaled except by whole numbers (the world scale is snapped so that one art pixel is a whole number of screen pixels; see `snapWorldScale` in `src/renderer/src/render/worldFit.ts`).
- Wall band: `PANEL_THICK` 12 units (6 art pixels) at `BAND` 10 from the tile edge, the same line and thickness as a door's panels.

## House palette

- One file: `src/renderer/src/render/palette.json`, read by the renderer (`palette.ts`) and by the import script (`npm run art:import`).
- `colours` is the whole palette; every **role** (a named use, such as `floor`, `wall`, `doorFill`) and every **ramp** colour must be one of them (a test checks).
- Code never writes a colour literal for the ship interior (`tiles.ts`, `doorModel.ts`, `wallModel.ts`, `effects.ts`): it reads `ROLE.<name>`. A test fails on any `0x` literal in those files.
- Imported art is remapped to the nearest palette colour (OKLab). Changing the palette means a rebuild and a re-import.
- Today's palette is a placeholder, **Apollo** by AdamCYounis (46 colours, https://lospec.com/palette-list/apollo). Art-ii replaces it with the bought interior pack's own palette.

## Outlines and light

- Crew and usable objects (consoles, doors, lockers, anything you press a key at) get a **dark coloured outline**: the darkest shade of their own ramp, never black.
- Floors and walls get **no outline**.
- Light comes from the **top-left**: walls carry a one-art-pixel `wallLight` edge on their top and left faces and a one-art-pixel `wallShadow` edge on their bottom and right faces. Bought or drawn art shades the same way.

## Value hierarchy

- Floors and walls are calm, dark mid-tones with low saturation; they are the stage, not the actors. (The Art-i-a placeholder floor, `c7cfcc`, is lighter than this on purpose, to keep today's look; Art-ii's pack palette brings floors down to dark mid-tones.)
- Crew, consoles and hazards (fire, breaches, sparks) carry the strongest saturation and contrast, so the eye finds them first.
- Floors get only a quiet one-art-pixel `floorSeam` panel line per tile.

## Ramps

Each effect family uses one ramp, bright to dark, 5 to 8 palette colours, listed in `palette.json`. Particles step along their ramp by life; they are never blended smoothly.

| Ramp | Steps |
|---|---|
| `fire` | white, yellow, orange, red, brown, smoke grey |
| `plasma` | white, cyan, blue, navy |
| `electric` | white, pale blue, violet |
| `vent` | white, pale grey, blue-grey |

## Bought art (paid packs)

- Files live in `public/assets/paid/` (gitignored); their manifest entries (licence `paid`, store URL, purchase date, credit line, `required: false`) are committed.
- A paid file replaces free art by taking over the free entry's name in a manifest edit, never by binding the same name twice.
- Packs are cut and remapped by `npm run art:import` from `art/import.json`; the source folder is `FTLITE_ASSETS`, else `C:\Users\djuar\FTLite-assets`, never inside the repo. Check `.art/contact.png` after every import.
- Registered paid names today: `house.floor.0` to `house.floor.3` (the `houseFloor` feature). A missing paid file falls back to the procedural floor.
```

- [ ] **Step 7: Commit**

```bash
git add -- src/renderer/src/render/palette.json src/renderer/src/render/palette.ts tests/palette.test.ts docs/art/bible.md
git commit -m "feat(art-i-a): house palette (placeholder Apollo) and the art bible

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Snapped world fit (stage scale to worldFit and duelFit)

**Files:**
- Modify: `src/renderer/src/render/worldFit.ts` (rewrite)
- Modify: `src/renderer/src/render/duel/interiorModel.ts:1-17`
- Modify: `src/renderer/src/render/duel/interiorView.ts:32,49`
- Modify: `src/renderer/src/render/renderer.ts:26-32,54-63,71`
- Modify: `src/renderer/src/app/duel/duelMode.ts` (two `createInteriorView` calls)
- Test: `tests/worldFit.test.ts` (rewrite), `tests/layout.test.ts:41-47`, `tests/projectileModel.test.ts:77`, `tests/duelInterior.test.ts:38`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `export interface Band { readonly x: number; readonly y: number; readonly w: number; readonly h: number }`
  - `export interface Fit { scale: number; x: number; y: number }`
  - `export function snapWorldScale(fit: number, stage: number): number`
  - `export function fitInBand(band: Band, widthTiles: number, heightTiles: number, stage: number): Fit`
  - `export function worldFit(widthTiles: number, heightTiles: number, stage: number): Fit`
  - `export function duelFit(widthTiles: number, heightTiles: number, stage: number): Fit` (in `duel/interiorModel.ts`)
  - `Renderer.stageScale(): number`
  - `createInteriorView(assets: GameAssets, stageScale: () => number = () => 1): InteriorView`

- [ ] **Step 1: Write the failing test** — replace the whole of `tests/worldFit.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { fitInBand, snapWorldScale, worldFit, WORLD_BAND } from '../src/renderer/src/render/worldFit';
import { duelFit, INTERIOR_BAND } from '../src/renderer/src/render/duel/interiorModel';

const STAGES = [1, 1.5, 2, 2.5, 3] as const;
const CUTTER_FIT = 608 / 928, STARTER_FIT = 0.76;

describe('snapWorldScale (Art-i spec section 4 table)', () => {
  const table: [string, number, number[]][] = [
    ['duel interior, any ship (fit 1)', 1, [1, 1, 1, 1, 1]],
    ['sector Skiff (fit 1)', 1, [1, 1, 1, 1, 1]],
    ['sector Cutter (fit 0.655)', CUTTER_FIT, [0.5, CUTTER_FIT, 0.5, 0.6, 0.5]],
    ['sector starter (fit 0.76)', STARTER_FIT, [STARTER_FIT, 2 / 3, 0.75, 0.6, 2 / 3]]
  ];
  for (const [name, fit, want] of table) it(name, () => {
    STAGES.forEach((stage, i) => expect(snapWorldScale(fit, stage), `stage ${stage}`).toBeCloseTo(want[i]!, 9));
  });
  it('a snapped scale gives a whole number of screen pixels per art pixel; a kept one is the fit itself', () => {
    for (const fit of [1, CUTTER_FIT, STARTER_FIT]) for (const stage of STAGES) {
      const s = snapWorldScale(fit, stage), px = 2 * s * stage;
      if (s !== fit) expect(Math.abs(px - Math.round(px))).toBeLessThan(1e-9);
      expect(s).toBeGreaterThanOrEqual(0.75 * fit - 1e-12);
    }
  });
  it('below stage 1 a fit that rounds to 0 art pixels, or snaps too small, is kept', () => {
    expect(snapWorldScale(CUTTER_FIT, 0.7)).toBe(CUTTER_FIT);   // n = floor(0.917) = 0
    expect(snapWorldScale(1, 0.9)).toBe(1);                      // n = 1, 1 / 1.8 = 0.556 < 0.75
  });
});

describe('worldFit and duelFit take the stage scale', () => {
  it('the Cutter (29 x 13) at stage 1 snaps to 0.5, re-centred in the band', () => {
    expect(worldFit(29, 13, 1)).toEqual({ scale: 0.5, x: 328, y: 104 });
  });
  it('the Cutter at stage 1.5 keeps its fit (about 21 px a tile), x and y on whole screen pixels', () => {
    const f = worldFit(29, 13, 1.5);
    expect(f.scale).toBeCloseTo(CUTTER_FIT, 9); expect(Math.round(32 * f.scale)).toBe(21); expect(f.x).toBe(256); expect(f.y).toBe(72);
  });
  it('the starter (25 x 12) at stage 1 keeps 0.76', () => {
    const f = worldFit(25, 12, 1);
    expect(f.scale).toBeCloseTo(0.76, 9); expect(f.x).toBe(256); expect(f.y).toBe(62);
  });
  it('draws the Skiff (18 x 9) at full size at every stage', () => {
    for (const stage of STAGES) expect(worldFit(18, 9, stage)).toEqual({ scale: 1, x: 272, y: 64 });
  });
  it('every fit stays inside its band and lands on whole screen pixels', () => {
    for (const [band, fit] of [[WORLD_BAND, worldFit], [INTERIOR_BAND, duelFit]] as const)
      for (const [w, h] of [[29, 13], [25, 12], [18, 9]] as const) for (const stage of STAGES) {
        const f = fit(w, h, stage);
        expect(f.x).toBeGreaterThanOrEqual(band.x - 1); expect(f.x + w * 32 * f.scale).toBeLessThanOrEqual(band.x + band.w + 1);
        expect(f.y).toBeGreaterThanOrEqual(band.y - 1); expect(f.y + h * 32 * f.scale).toBeLessThanOrEqual(band.y + band.h + 1);
        expect(Math.abs(f.x * stage - Math.round(f.x * stage))).toBeLessThan(1e-9); expect(Math.abs(f.y * stage - Math.round(f.y * stage))).toBeLessThan(1e-9);
      }
  });
  it('duelFit is fitInBand on the interior band', () => {
    expect(duelFit(29, 13, 1)).toEqual({ scale: 1, x: 66, y: 152 });
    for (const stage of STAGES) expect(duelFit(29, 13, stage)).toEqual(fitInBand(INTERIOR_BAND, 29, 13, stage));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/worldFit.test.ts`
Expected: FAIL, `snapWorldScale is not a function` (or an import error for `fitInBand`).

- [ ] **Step 3: Replace the whole of `src/renderer/src/render/worldFit.ts`**

```ts
import { TILE_PX } from '../../../shared/resolution';

/** The world band in internal pixels: the ship is fitted inside it (spec Demo-iv section 3); projectiles enter from outside it (spec Demo-vii section 2). */
export const WORLD_BAND = { x: 256, y: 60, w: 608, h: 296 } as const;   // spec Demo-x-c section 3: x 256-864, between the left column and the right column's enemy window; above the console cards (y 360)

export interface Band { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface Fit { scale: number; x: number; y: number }

/**
 * Art-i spec section 4: screen pixels per art pixel = 2 x worldScale x stageScale. Snap the world scale so that is a whole number,
 * unless snapping would shrink the ship below 0.75 of its fit (readability beats crispness), or no whole number fits (n = 0).
 * The 1e-9 guards against a product such as 2 x 0.75 x 2 landing a hair under a whole number in floating point.
 */
export function snapWorldScale(fit: number, stage: number): number {
  const n = Math.floor(2 * fit * stage + 1e-9);
  if (n >= 1 && n / (2 * stage) >= 0.75 * fit) return n / (2 * stage);
  return fit;
}

/** Fit a ship of the given tile size into a band (never above 1x), snap the scale for the stage scale, and centre it with x and y on whole screen pixels (x * stage and y * stage whole). */
export function fitInBand(band: Band, widthTiles: number, heightTiles: number, stage: number): Fit {
  const w = widthTiles * TILE_PX, h = heightTiles * TILE_PX;
  const scale = snapWorldScale(Math.min(1, band.w / w, band.h / h), stage);
  const onScreen = (v: number): number => Math.round(v * stage) / stage;
  return { scale, x: onScreen(band.x + (band.w - w * scale) / 2), y: onScreen(band.y + (band.h - h * scale) / 2) };
}

/** The sector ship in the world band (spec Demo-iv section 3), snapped for the stage scale (Art-i spec section 4). */
export function worldFit(widthTiles: number, heightTiles: number, stage: number): Fit {
  return fitInBand(WORLD_BAND, widthTiles, heightTiles, stage);
}
```

- [ ] **Step 4: `duelFit` uses `fitInBand`** — in `src/renderer/src/render/duel/interiorModel.ts`, add the import after `import { REPAIR_UNITS } from '../../sim/duel/tuning';`:

```ts
import { fitInBand, type Fit } from '../worldFit';
```

and replace

```ts
/** Today's worldFit rules on the duel's band: centred, whole pixels, never upscaled above 1×. */
export function duelFit(widthTiles: number, heightTiles: number): { scale: number; x: number; y: number } {
  const w = widthTiles * TILE_PX, h = heightTiles * TILE_PX, B = INTERIOR_BAND;
  const scale = Math.min(1, B.w / w, B.h / h);
  return { scale, x: Math.round(B.x + (B.w - w * scale) / 2), y: Math.round(B.y + (B.h - h * scale) / 2) };
}
```

with

```ts
/** worldFit's rules on the duel's band: never upscaled above 1x, snapped for the stage scale, centred on whole screen pixels (Art-i spec section 4). */
export function duelFit(widthTiles: number, heightTiles: number, stage: number): Fit {
  return fitInBand(INTERIOR_BAND, widthTiles, heightTiles, stage);
}
```

(`TILE_PX` stays imported: `interiorOverlay` still uses it.)

- [ ] **Step 5: The interior view reads a stage-scale getter** — in `src/renderer/src/render/duel/interiorView.ts` replace

```ts
export function createInteriorView(assets: GameAssets): InteriorView {
```

with

```ts
/** `stageScale`: the letterbox's stage scale, read every frame so the fit snaps to whole screen pixels per art pixel (Art-i spec section 4); tests leave it at 1. */
export function createInteriorView(assets: GameAssets, stageScale: () => number = () => 1): InteriorView {
```

and replace `fit = duelFit(st.derived.width, st.derived.height);` with `fit = duelFit(st.derived.width, st.derived.height, stageScale());`.

- [ ] **Step 6: The renderer keeps the stage scale** — in `src/renderer/src/render/renderer.ts`:

Replace

```ts
  resize(winW: number, winH: number): void;
```

with

```ts
  resize(winW: number, winH: number): void;
  /** The letterbox stage scale set by the last resize (1 before the first); the duel interior reads it for its fit (Art-i spec section 4). */
  stageScale(): number;
```

Replace `  let lastDraw: number | null = null;` with `  let lastDraw: number | null = null, stage = 1;`.

Replace

```ts
      app.stage.scale.set(lb.scale); app.stage.position.set(lb.offsetX, lb.offsetY);
    },
    reset() {
```

with

```ts
      app.stage.scale.set(lb.scale); app.stage.position.set(lb.offsetX, lb.offsetY);
      if (lb.scale !== stage) { stage = lb.scale; projectiles.reset(); }   // the snapped fit moves the ship: shots in flight cached paths to the old room centres (presentation only)
    },
    stageScale: () => stage,
    reset() {
```

Replace `const fit = worldFit(d.width, d.height); world.scale.set(fit.scale);` with `const fit = worldFit(d.width, d.height, stage); world.scale.set(fit.scale);`. The same `fit` object already goes to `projectiles.draw` and (with the shake) to `callouts.draw`; leave those lines alone.

- [ ] **Step 7: The duel passes the getter** — in `src/renderer/src/app/duel/duelMode.ts` change both occurrences of `createInteriorView(renderer.assets)` to `createInteriorView(renderer.assets, renderer.stageScale)`:

```bash
sed -i 's/createInteriorView(renderer.assets)/createInteriorView(renderer.assets, renderer.stageScale)/g' src/renderer/src/app/duel/duelMode.ts
grep -c "createInteriorView(renderer.assets, renderer.stageScale)" src/renderer/src/app/duel/duelMode.ts
```

Expected: `2`.

- [ ] **Step 8: Update the other callers' tests**

In `tests/projectileModel.test.ts` replace `fit = worldFit(s.derived.width, s.derived.height), E = room(s, 'E');` with `fit = worldFit(s.derived.width, s.derived.height, 1), E = room(s, 'E');`.

In `tests/duelInterior.test.ts` replace `const fit = duelFit(d.interior.derived.width, d.interior.derived.height);` with `const fit = duelFit(d.interior.derived.width, d.interior.derived.height, 1);` (the expected `{ scale: 1, x: 66, y: 152 }` stays).

In `tests/layout.test.ts` replace

```ts
  it('our ships fit the narrower band: the cutter at about 21 px a tile, the Skiff at full size', () => {
    for (const l of [LAYOUT, CUTTER, parseShip(skiff)]) {
      const f = worldFit(l.width, l.height);
      expect(inside({ x: f.x, y: f.y, w: l.width * TILE_PX * f.scale, h: l.height * TILE_PX * f.scale }, band), l.width + 'x' + l.height).toBe(true);
    }
    expect(Math.round(TILE_PX * worldFit(CUTTER.width, CUTTER.height).scale)).toBe(21);
  });
```

with

```ts
  it('our ships fit the narrower band at every stage scale: the cutter at about 21 px a tile at stage 1.5 (16 snapped at stage 1), the Skiff at full size', () => {
    for (const l of [LAYOUT, CUTTER, parseShip(skiff)]) for (const stage of [1, 1.5, 2, 2.5, 3]) {
      const f = worldFit(l.width, l.height, stage);
      expect(inside({ x: f.x, y: f.y, w: l.width * TILE_PX * f.scale, h: l.height * TILE_PX * f.scale }, band), `${l.width}x${l.height} stage ${stage}`).toBe(true);
    }
    expect(Math.round(TILE_PX * worldFit(CUTTER.width, CUTTER.height, 1.5).scale)).toBe(21);
    expect(TILE_PX * worldFit(CUTTER.width, CUTTER.height, 1).scale).toBe(16);
  });
```

- [ ] **Step 9: Run the tests and the type check**

Run: `npx vitest run tests/worldFit.test.ts tests/layout.test.ts tests/projectileModel.test.ts tests/duelInterior.test.ts`
Expected: `Test Files 4 passed (4)`, `Tests 32 passed (32)` (12 + 7 + 10 + 3).

Run: `npx tsc -b`
Expected: no output (exit 0).

- [ ] **Step 10: Commit**

```bash
git add -- src/renderer/src/render/worldFit.ts src/renderer/src/render/duel/interiorModel.ts src/renderer/src/render/duel/interiorView.ts src/renderer/src/render/renderer.ts src/renderer/src/app/duel/duelMode.ts tests/worldFit.test.ts tests/layout.test.ts tests/projectileModel.test.ts tests/duelInterior.test.ts
git commit -m "feat(art-i-a): snap the world scale to whole screen pixels per art pixel

worldFit and duelFit take the letterbox stage scale; the renderer keeps it, exposes
stageScale() for the duel interior, and resets the projectile paths when it changes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Doors and walls on the art-pixel grid

**Files:**
- Modify: `src/renderer/src/render/doorModel.ts` (rewrite)
- Modify: `src/renderer/src/render/wallModel.ts` (rewrite)
- Modify: `src/renderer/src/render/enemyWindow.ts:13,90`
- Modify: `src/renderer/src/render/tiles.ts:9,13,45,49,52` (keep it compiling; Task 5 rewrites it)
- Create: `tests/helpers/artGrid.ts`
- Test: `tests/doorModel.test.ts` (rewrite), `tests/wallModel.test.ts` (rewrite)

**Interfaces:**
- Consumes: `ROLE` from `src/renderer/src/render/palette.ts` (Task 1); `pickVariant(seedIndex: number, count: number): number` from `tilePick.ts` (existing).
- Produces:
  - `doorModel.ts`: `export const PANEL_THICK = 12, BAND = 10, PANEL_STROKE = 2`; `export function panelWidth(progress: number): number`; unchanged `DoorRect`, `DoorPicture`, `DoorLook`, `doorLook`, `doorPicture(look, progress, slide, airlock?)`. Removed: `DOOR_FILL`, `DOOR_OUTLINE`, `SEALED_FILL`, `HELD_TICK`, `SPACE_GAP` (use `ROLE.doorFill`, `ROLE.doorOutline`, `ROLE.doorSealed`, `ROLE.heldTick`, `ROLE.spaceGap`).
  - `wallModel.ts`: `export interface WallPicture { floor: DoorRect[]; band: DoorRect[]; light: DoorRect[]; shadow: DoorRect[] }`; `wallPicture(...)` unchanged signature; `export function floorSeams(): DoorRect[]`; `export function houseFloorName(tileIndex: number): string`.
  - `tests/helpers/artGrid.ts`: `export interface GridRect { x: number; y: number; w: number; h: number }`; `export function onGrid(r: GridRect): boolean`; `export function strokeBand(r: GridRect, width: number, alignment: number): { outer: GridRect; inner: GridRect }`.

- [ ] **Step 1: Create the grid helper** `tests/helpers/artGrid.ts`:

```ts
// Art-pixel grid checks (Art-i spec section 4): one art pixel is 2 world units, so every procedural rectangle is even at even offsets.
export interface GridRect { x: number; y: number; w: number; h: number }

/** True when x, y, w and h are all even whole numbers. */
export function onGrid(r: GridRect): boolean { return [r.x, r.y, r.w, r.h].every((v) => Number.isInteger(v) && v % 2 === 0); }

/** The band a Pixi 8 stroke paints around a rectangle path: alignment 1 inside, 0.5 centred, 0 outside. `outer` and `inner` bound the painted ring. */
export function strokeBand(r: GridRect, width: number, alignment: number): { outer: GridRect; inner: GridRect } {
  const out = (1 - alignment) * width, inn = alignment * width;
  return {
    outer: { x: r.x - out, y: r.y - out, w: r.w + 2 * out, h: r.h + 2 * out },
    inner: { x: r.x + inn, y: r.y + inn, w: r.w - 2 * inn, h: r.h - 2 * inn }
  };
}
```

(Pixi 8.19's `StrokeStyle.alignment` documents 1 = inside, 0.5 = centred, 0 = outside: `node_modules/pixi.js/lib/scene/graphics/shared/FillTypes.d.ts`.)

- [ ] **Step 2: Write the failing door test** — replace the whole of `tests/doorModel.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { doorPicture, doorLook, panelWidth, PANEL_THICK, PANEL_STROKE, BAND, type DoorLook, type DoorPicture, type DoorRect } from '../src/renderer/src/render/doorModel';
import { ROLE } from '../src/renderer/src/render/palette';
import { DoorState } from '../src/renderer/src/sim/grid';
import { TILE_PX } from '../src/shared/resolution';
import { onGrid, strokeBand } from './helpers/artGrid';

const rects = (p: DoorPicture): DoorRect[] => [p.gap, p.floor, p.seam, p.bar, ...p.jambs, ...p.panels, ...p.ticks, ...p.stripes].filter((r): r is DoorRect => !!r);

/** FTL-style doors (spec Demo-x-c section 2), on the art-pixel grid (Art-i spec section 4). */
describe('the door drawing model', () => {
  it('maps the sim states to looks', () => {
    expect([DoorState.Closed, DoorState.Open, DoorState.Sealed, DoorState.HeldOpen].map(doorLook)).toEqual(['closed', 'open', 'sealed', 'held']);
  });
  it('closed: two panels 12 thick meet in the middle of the gap, with a 2-wide seam at the right panel edge and a dark outline', () => {
    const p = doorPicture('closed', 0, 'x');
    expect(PANEL_THICK).toBe(12); expect(BAND).toBe(10); expect(PANEL_THICK + 2 * BAND).toBe(TILE_PX);
    expect(p.panels).toEqual([{ x: 0, y: BAND, w: 16, h: PANEL_THICK }, { x: 16, y: BAND, w: 16, h: PANEL_THICK }]);
    expect(p.fill).toBe(ROLE.doorFill); expect(p.outline).toBe(ROLE.doorOutline);
    expect(p.seam).toEqual({ x: 16, y: BAND, w: 2, h: PANEL_THICK }); expect(p.bar).toBeNull(); expect(p.ticks).toEqual([]);
    expect(p.floor).toEqual({ x: 0, y: 0, w: TILE_PX, h: TILE_PX });   // the doorway is a gap in the wall: floor under the panels
    expect(p.jambs).toEqual([{ x: 0, y: 8, w: 2, h: 16 }, { x: 30, y: 8, w: 2, h: 16 }]);
  });
  it('opening: the panels slide apart into the walls by the animation progress, in whole art pixels; open: none left', () => {
    const half = doorPicture('open', 0.5, 'x');
    expect(half.panels).toEqual([{ x: 0, y: BAND, w: 8, h: PANEL_THICK }, { x: 24, y: BAND, w: 8, h: PANEL_THICK }]); expect(half.seam).toBeNull();
    expect(doorPicture('open', 1, 'x').panels).toEqual([]);
    expect(doorPicture('closed', 0.25, 'x').panels[0]!.w).toBe(12);   // closing runs the same slide back
    expect(doorPicture('open', 1, 'x').jambs).toHaveLength(2);         // the frame stays
    expect([0, 0.1, 0.13, 0.5, 0.94, 0.95, 1].map(panelWidth)).toEqual([16, 14, 14, 8, 0, 0, 0]);
  });
  it('sealed: the sealed role colour, closed whatever the progress, a short bar across the seam', () => {
    const p = doorPicture('sealed', 0.7, 'x');
    expect(p.fill).toBe(ROLE.doorSealed); expect(p.panels.map((r) => r.w)).toEqual([16, 16]);
    expect(p.bar).toEqual({ x: 10, y: 14, w: 12, h: 4 });
  });
  it('held open: the panels retracted and a tick on each side of the frame', () => {
    const p = doorPicture('held', 1, 'x');
    expect(p.panels).toEqual([]); expect(p.ticks).toEqual([{ x: 2, y: 8, w: 2, h: 16 }, { x: 28, y: 8, w: 2, h: 16 }]); expect(p.fill).toBe(ROLE.doorFill);
    expect(doorPicture('open', 1, 'x').ticks).toEqual([]);
  });
  it('a wall running up and down turns the picture: the panels slide vertically', () => {
    const p = doorPicture('closed', 0, 'y');
    expect(p.panels).toEqual([{ x: BAND, y: 0, w: PANEL_THICK, h: 16 }, { x: BAND, y: 16, w: PANEL_THICK, h: 16 }]);
    expect(p.seam).toEqual({ x: BAND, y: 16, w: PANEL_THICK, h: 2 });
  });
  it('airlocks: the same panels with dark stripes, no floor, space showing through as they open', () => {
    const c = doorPicture('closed', 0, 'x', true);
    expect(c.floor).toBeNull(); expect(c.gap).toBeNull(); expect(c.stripes.length).toBeGreaterThan(0);
    for (const s of c.stripes) expect(c.panels.some((r) => s.x >= r.x && s.x + s.w <= r.x + r.w)).toBe(true);
    const o = doorPicture('open', 1, 'x', true);
    expect(o.gap).toEqual({ x: 0, y: BAND, w: TILE_PX, h: PANEL_THICK }); expect(o.panels).toEqual([]); expect(o.stripes).toEqual([]);
  });
  it('every rectangle and every panel outline band is on the art-pixel grid, over progress 0 to 1 in steps of 0.01, each look, both slides, doors and airlocks', () => {
    const looks: DoorLook[] = ['closed', 'open', 'sealed', 'held'];
    for (const look of looks) for (const slide of ['x', 'y'] as const) for (const airlock of [false, true]) for (let k = 0; k <= 100; k++) {
      const p = doorPicture(look, k / 100, slide, airlock), at = `${look} ${slide} ${airlock ? 'airlock' : 'door'} ${k / 100}`;
      for (const r of rects(p)) expect(onGrid(r), `${at} ${JSON.stringify(r)}`).toBe(true);
      for (const r of p.panels) { const b = strokeBand(r, PANEL_STROKE, 1); expect(onGrid(b.outer) && onGrid(b.inner), `${at} stroke ${JSON.stringify(r)}`).toBe(true); }
    }
  });
});
```

- [ ] **Step 3: Write the failing wall test** — replace the whole of `tests/wallModel.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { floorSeams, houseFloorName, wallPicture, type Cell } from '../src/renderer/src/render/wallModel';
import { BAND, PANEL_THICK } from '../src/renderer/src/render/doorModel';
import { TILE_PX } from '../src/shared/resolution';
import { onGrid } from './helpers/artGrid';

const CELLS: Cell[] = ['wall', 'door', 'floor', 'space'];
const inside = (r: { x: number; y: number; w: number; h: number }, o: { x: number; y: number; w: number; h: number }): boolean => r.x >= o.x && r.y >= o.y && r.x + r.w <= o.x + o.w && r.y + r.h <= o.y + o.h;

describe('wallModel: walls as thick as a door panel', () => {
  it('a straight hull wall: floor on the room side, space outside, a band joining the walls left and right at the door band', () => {
    const p = wallPicture('space', 'wall', 'floor', 'wall');
    expect(p.floor).toEqual([{ x: 0, y: TILE_PX / 2, w: TILE_PX, h: TILE_PX / 2 }]);
    const ys = new Set(p.band.map((r) => r.y)), hs = new Set(p.band.map((r) => r.h));
    expect([...ys]).toEqual([BAND]); expect([...hs]).toEqual([PANEL_THICK]);   // the same line and thickness as a door's panels
    expect(Math.min(...p.band.map((r) => r.x))).toBe(0); expect(Math.max(...p.band.map((r) => r.x + r.w))).toBe(TILE_PX);
  });
  it('joins a door, not a floor tile; an isolated corner has only the hub', () => {
    const p = wallPicture('door', 'floor', 'floor', 'space');
    expect(p.band).toContainEqual({ x: BAND, y: 0, w: PANEL_THICK, h: BAND });
    expect(p.band).toHaveLength(2);
    expect(wallPicture('space', 'space', 'space', 'space').band).toHaveLength(1);
  });
  it('the band is never thicker than a door panel', () => {
    const p = wallPicture('wall', 'wall', 'wall', 'wall');
    for (const r of p.band) expect(Math.min(r.w, r.h)).toBeLessThanOrEqual(PANEL_THICK);
  });
});

describe('wallModel: room corners', () => {
  it('a corner wall tile touching a room only diagonally fills that quadrant with floor', () => {
    const p = wallPicture('space', 'wall', 'wall', 'space', 'space', 'floor', 'space', 'space');
    expect(p.floor).toEqual([{ x: TILE_PX / 2, y: TILE_PX / 2, w: TILE_PX / 2, h: TILE_PX / 2 }]);
  });
});

describe('wallModel: light from the top-left (Art-i spec section 4)', () => {
  it('a straight left-right wall: a light edge along the whole top, a shadow edge along the whole bottom, none on the joined ends', () => {
    const p = wallPicture('space', 'wall', 'floor', 'wall');
    expect(p.light).toEqual([{ x: 0, y: 10, w: 10, h: 2 }, { x: 10, y: 10, w: 12, h: 2 }, { x: 22, y: 10, w: 10, h: 2 }]);
    expect(p.shadow).toEqual([{ x: 0, y: 20, w: 10, h: 2 }, { x: 10, y: 20, w: 12, h: 2 }, { x: 22, y: 20, w: 10, h: 2 }]);
  });
  it('an isolated hub: light on its top and left, shadow on its bottom and right', () => {
    const p = wallPicture('space', 'space', 'space', 'space');
    expect(p.light).toEqual([{ x: 10, y: 10, w: 12, h: 2 }, { x: 10, y: 10, w: 2, h: 12 }]);
    expect(p.shadow).toEqual([{ x: 10, y: 20, w: 12, h: 2 }, { x: 20, y: 10, w: 2, h: 12 }]);
  });
  it('a cross: no hub face is exposed, each arm keeps its own faces', () => {
    const p = wallPicture('wall', 'wall', 'wall', 'wall');
    expect(p.light).toEqual([{ x: 0, y: 10, w: 10, h: 2 }, { x: 22, y: 10, w: 10, h: 2 }, { x: 10, y: 0, w: 2, h: 10 }, { x: 10, y: 22, w: 2, h: 10 }]);
    expect(p.shadow).toEqual([{ x: 0, y: 20, w: 10, h: 2 }, { x: 22, y: 20, w: 10, h: 2 }, { x: 20, y: 0, w: 2, h: 10 }, { x: 20, y: 22, w: 2, h: 10 }]);
  });
  it('for every neighbourhood, every floor, band, light and shadow rectangle is on the art-pixel grid, and every edge lies on the band', () => {
    for (const n of CELLS) for (const e of CELLS) for (const s of CELLS) for (const w of CELLS) for (const diag of CELLS) {
      const p = wallPicture(n, e, s, w, diag, diag, diag, diag);
      for (const r of [...p.floor, ...p.band, ...p.light, ...p.shadow]) expect(onGrid(r), `${n}${e}${s}${w}${diag} ${JSON.stringify(r)}`).toBe(true);
      for (const r of [...p.light, ...p.shadow]) expect(p.band.some((b) => inside(r, b)), `${n}${e}${s}${w} edge ${JSON.stringify(r)} on the band`).toBe(true);
    }
  });
});

describe('floor seams and the floor art hook (Art-i spec section 4)', () => {
  it('one art pixel along the top and left of the tile, on the grid', () => {
    expect(floorSeams()).toEqual([{ x: 0, y: 0, w: TILE_PX, h: 2 }, { x: 0, y: 2, w: 2, h: TILE_PX - 2 }]);
    for (const r of floorSeams()) expect(onGrid(r)).toBe(true);
  });
  it('picks house.floor.0 to 3 by a stable hash of the tile index, using all four', () => {
    const names = Array.from({ length: 64 }, (_, t) => houseFloorName(t));
    expect(new Set(names)).toEqual(new Set(['house.floor.0', 'house.floor.1', 'house.floor.2', 'house.floor.3']));
    expect(houseFloorName(17)).toBe(houseFloorName(17));
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `npx vitest run tests/doorModel.test.ts tests/wallModel.test.ts`
Expected: FAIL (`panelWidth is not a function`, `floorSeams is not a function`, `PANEL_THICK` 11 not 12).

- [ ] **Step 5: Replace the whole of `src/renderer/src/render/doorModel.ts`**

```ts
import { TILE_PX } from '../../../shared/resolution';
import { DoorState } from '../sim/grid';
import { ROLE } from './palette';

/**
 * FTL-style doors (spec Demo-x-c section 2): a door in the wall line, two panels that meet in the middle of the gap and slide apart into the walls.
 * Every rectangle is whole art pixels: even world units at even offsets (Art-i spec section 4). Pure: state and progress -> rectangles in tile-local pixels, no Pixi.
 */
const T = TILE_PX, HALF = T / 2;
/** Panel thickness and the band's offset from the tile edge: 12 + 10 + 10 = TILE_PX, all even (Art-i spec section 4). */
export const PANEL_THICK = 12, BAND = (T - PANEL_THICK) / 2;
/** The panel outline: an inside stroke (alignment 1) one art pixel wide, so its painted band stays inside the even panel rectangle. */
export const PANEL_STROKE = 2;

export interface DoorRect { x: number; y: number; w: number; h: number }
/** What to draw on a door or airlock tile, in order: the open airlock's gap to space, the floor of the doorway, the jambs, the panels (fill with the outline), the seam, the seal bar, the held ticks, the airlock stripes. */
export interface DoorPicture { gap: DoorRect | null; floor: DoorRect | null; jambs: DoorRect[]; panels: DoorRect[]; fill: number; outline: number; seam: DoorRect | null; bar: DoorRect | null; ticks: DoorRect[]; stripes: DoorRect[] }
export type DoorLook = 'closed' | 'open' | 'sealed' | 'held';
/** The look of an inner door by its sim state (a pending seal still reads by its current state). */
export function doorLook(state: number): DoorLook { return state === DoorState.Sealed ? 'sealed' : state === DoorState.HeldOpen ? 'held' : state === DoorState.Open ? 'open' : 'closed'; }

/** A sliding panel's width, quantised to whole art pixels so a door mid-slide stays on the grid: w = 2 * round(HALF * (1 - p) / 2). */
export function panelWidth(progress: number): number { return 2 * Math.round((HALF * (1 - progress)) / 2); }

/**
 * One door. `progress` 0 closed .. 1 open (the door animation drives it); a sealed door is drawn closed whatever the progress.
 * `slide` 'x': the wall runs left-right (walls left and right of the tile), the panels slide sideways; 'y': the wall runs up-down.
 * `airlock`: the hull door, same panels with dark stripes, and space showing through as it opens.
 */
export function doorPicture(look: DoorLook, progress: number, slide: 'x' | 'y', airlock = false): DoorPicture {
  const p = look === 'sealed' ? 0 : Math.max(0, Math.min(1, progress)), w = panelWidth(p);
  const panels: DoorRect[] = w > 0 ? [{ x: 0, y: BAND, w, h: PANEL_THICK }, { x: T - w, y: BAND, w, h: PANEL_THICK }] : [];
  const closed = p === 0;
  const pic: DoorPicture = {
    gap: airlock && p > 0 ? { x: 0, y: BAND, w: T, h: PANEL_THICK } : null,
    floor: airlock ? null : { x: 0, y: 0, w: T, h: T },
    jambs: [{ x: 0, y: BAND - 2, w: 2, h: PANEL_THICK + 4 }, { x: T - 2, y: BAND - 2, w: 2, h: PANEL_THICK + 4 }],
    panels, fill: look === 'sealed' ? ROLE.doorSealed : ROLE.doorFill, outline: ROLE.doorOutline,
    seam: closed ? { x: HALF, y: BAND, w: 2, h: PANEL_THICK } : null,   // at the right panel's edge (Art-i spec section 4)
    bar: look === 'sealed' ? { x: HALF - 6, y: BAND + PANEL_THICK / 2 - 2, w: 12, h: 4 } : null,
    ticks: look === 'held' ? [{ x: 2, y: BAND - 2, w: 2, h: PANEL_THICK + 4 }, { x: T - 4, y: BAND - 2, w: 2, h: PANEL_THICK + 4 }] : [],
    stripes: airlock ? panels.flatMap((r) => { const out: DoorRect[] = []; for (let x = r.x + 4; x + 2 <= r.x + r.w - 2; x += 6) out.push({ x, y: r.y + 2, w: 2, h: r.h - 4 }); return out; }) : [],
  };
  return slide === 'x' ? pic : transpose(pic);
}

const flip = (r: DoorRect): DoorRect => ({ x: r.y, y: r.x, w: r.h, h: r.w });
function transpose(p: DoorPicture): DoorPicture {
  return { ...p, gap: p.gap && flip(p.gap), floor: p.floor && flip(p.floor), jambs: p.jambs.map(flip), panels: p.panels.map(flip), seam: p.seam && flip(p.seam), bar: p.bar && flip(p.bar), ticks: p.ticks.map(flip), stripes: p.stripes.map(flip) };
}
```

- [ ] **Step 6: Replace the whole of `src/renderer/src/render/wallModel.ts`**

```ts
import { TILE_PX } from '../../../shared/resolution';
import { BAND, PANEL_THICK, type DoorRect } from './doorModel';
import { pickVariant } from './tilePick';

/**
 * Thin walls (the user, 2026-11-13: "fix the walls to be the same width as the doors so the external doors don't look weird").
 * A wall tile is drawn as a band as thick as a door panel along the tile's centre line, with an arm toward every neighbouring
 * wall, door or airlock; the halves of the tile that face a room are floor, the halves that face space are left empty.
 * Art-i spec section 4: every rectangle is whole art pixels (even world units at even offsets), the band has a one-art-pixel light
 * edge on its exposed top and left faces and a one-art-pixel shadow edge on its exposed bottom and right faces (light from the top-left). Pure: no Pixi.
 */
export type Cell = 'wall' | 'door' | 'floor' | 'space';
/** Draw order: floor, band, shadow, light (light wins where a corner pixel is both). */
export interface WallPicture { floor: DoorRect[]; band: DoorRect[]; light: DoorRect[]; shadow: DoorRect[] }

const T = TILE_PX, HALF = T / 2, EDGE = 2, LO = BAND, HI = BAND + PANEL_THICK;

/** n, e, s, w: what the neighbour on that side is; ne, se, sw, nw the diagonal neighbours (a room's corner touches its corner wall tile only diagonally). */
export function wallPicture(n: Cell, e: Cell, s: Cell, w: Cell, ne: Cell = 'space', se: Cell = 'space', sw: Cell = 'space', nw: Cell = 'space'): WallPicture {
  const floor: DoorRect[] = [];
  if (nw === 'floor') floor.push({ x: 0, y: 0, w: HALF, h: HALF });
  if (ne === 'floor') floor.push({ x: HALF, y: 0, w: HALF, h: HALF });
  if (se === 'floor') floor.push({ x: HALF, y: HALF, w: HALF, h: HALF });
  if (sw === 'floor') floor.push({ x: 0, y: HALF, w: HALF, h: HALF });
  if (n === 'floor') floor.push({ x: 0, y: 0, w: T, h: HALF });
  if (s === 'floor') floor.push({ x: 0, y: HALF, w: T, h: HALF });
  if (w === 'floor') floor.push({ x: 0, y: 0, w: HALF, h: T });
  if (e === 'floor') floor.push({ x: HALF, y: 0, w: HALF, h: T });
  const joins = (c: Cell): boolean => c === 'wall' || c === 'door';
  const jn = joins(n), je = joins(e), js = joins(s), jw = joins(w);
  const band: DoorRect[] = [{ x: LO, y: LO, w: PANEL_THICK, h: PANEL_THICK }];
  if (jn) band.push({ x: LO, y: 0, w: PANEL_THICK, h: LO });
  if (js) band.push({ x: LO, y: HI, w: PANEL_THICK, h: T - HI });
  if (jw) band.push({ x: 0, y: LO, w: LO, h: PANEL_THICK });
  if (je) band.push({ x: HI, y: LO, w: T - HI, h: PANEL_THICK });
  // Exposed faces, segment by segment: the hub's face is exposed only where no arm leaves it on that side.
  const hRow = (y: number, hub: boolean): DoorRect[] => [jw && { x: 0, y, w: LO, h: EDGE }, hub && { x: LO, y, w: PANEL_THICK, h: EDGE }, je && { x: HI, y, w: T - HI, h: EDGE }].filter((r): r is DoorRect => !!r);
  const vCol = (x: number, hub: boolean): DoorRect[] => [jn && { x, y: 0, w: EDGE, h: LO }, hub && { x, y: LO, w: EDGE, h: PANEL_THICK }, js && { x, y: HI, w: EDGE, h: T - HI }].filter((r): r is DoorRect => !!r);
  const light = [...hRow(LO, !jn), ...vCol(LO, !jw)];
  const shadow = [...hRow(HI - EDGE, !js), ...vCol(HI - EDGE, !je)];
  return { floor, band, light, shadow };
}

/** The quiet two-tone panel seam on every floor tile (Art-i spec section 4): one art pixel of `floorSeam` along the tile's top and left edges. */
export function floorSeams(): DoorRect[] { return [{ x: 0, y: 0, w: T, h: EDGE }, { x: 0, y: EDGE, w: EDGE, h: T - EDGE }]; }

/** The house floor art name for a tile (Art-i spec section 4 floor art hook): house.floor.N, N by a hash of the tile index. */
export function houseFloorName(tileIndex: number): string { return `house.floor.${pickVariant(tileIndex, 4)}`; }
```

- [ ] **Step 7: Keep the dependants compiling**

In `src/renderer/src/render/enemyWindow.ts` replace the line `import { DOOR_FILL, DOOR_OUTLINE } from './doorModel';` with:

```ts
import { ROLE } from './palette';   // the door colours are palette roles (Art-i spec section 4)
```

and on line 90 (the `for (const d of ENEMY_LAYOUT.doors)` line) replace every `DOOR_FILL` with `ROLE.doorFill` and every `DOOR_OUTLINE` with `ROLE.doorOutline`:

```bash
sed -i '/ENEMY_LAYOUT.doors/ { s/DOOR_FILL/ROLE.doorFill/g; s/DOOR_OUTLINE/ROLE.doorOutline/g; }' src/renderer/src/render/enemyWindow.ts
grep -c "DOOR_FILL\|DOOR_OUTLINE" src/renderer/src/render/enemyWindow.ts
```

Expected: `0`.

In `src/renderer/src/render/tiles.ts` (a stopgap; Task 5 replaces the file):
- replace `import { doorPicture, doorLook, HELD_TICK, SPACE_GAP, type DoorPicture, type DoorRect } from './doorModel';` with `import { doorPicture, doorLook, PANEL_STROKE, type DoorPicture, type DoorRect } from './doorModel';` and add the line `import { ROLE } from './palette';` after it;
- replace `if (p.gap) at(x, y, p.gap).fill(SPACE_GAP);` with `if (p.gap) at(x, y, p.gap).fill(ROLE.spaceGap);`;
- replace `.stroke({ width: 1, color: p.outline, alignment: 1 })` with `.stroke({ width: PANEL_STROKE, color: p.outline, alignment: 1 })`;
- replace `for (const t of p.ticks) at(x, y, t).fill(HELD_TICK);` with `for (const t of p.ticks) at(x, y, t).fill(ROLE.heldTick);`.

- [ ] **Step 8: Run the tests and the type check**

Run: `npx vitest run tests/doorModel.test.ts tests/wallModel.test.ts tests/consoleModel.test.ts tests/enemyWindowModel.test.ts`
Expected: all pass; `doorModel` 8, `wallModel` 10, `consoleModel` 7 (its `WALL_GAP` expectations derive from `BAND` and `PANEL_THICK`).

Run: `npx tsc -b`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add -- src/renderer/src/render/doorModel.ts src/renderer/src/render/wallModel.ts src/renderer/src/render/enemyWindow.ts src/renderer/src/render/tiles.ts tests/helpers/artGrid.ts tests/doorModel.test.ts tests/wallModel.test.ts
git commit -m "feat(art-i-a): doors and walls on the art-pixel grid with palette colours

PANEL_THICK 12 / BAND 10, quantised panel slide, even jambs, seam, bar and ticks,
a 2-unit inside panel stroke, wall light and shadow edges, floor seams and the
house floor name hash.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Paid assets in the manifest

**Files:**
- Modify: `src/renderer/src/render/licenses.ts:2,8`
- Modify: `src/renderer/src/render/manifest.ts:13,39-49`
- Modify: `src/renderer/src/render/creditsText.ts:16,22`
- Modify: `src/renderer/src/render/assetNames.ts:10`
- Modify: `src/renderer/src/render/fallback.ts:4,14`
- Modify: `.gitignore` (append)
- Test: `tests/paidManifest.test.ts` (create), `tests/manifest.test.ts:18`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `LICENSES` gains `'paid'`; `LICENSE_URLS: Readonly<Record<Exclude<License, 'original' | 'paid'>, string>>`; `parseManifest` accepts `paid/` files under the paid rules and refuses two entries binding one name; `Feature` gains `'houseFloor'` with `FEATURE_NAMES.houseFloor = ['house.floor.0', 'house.floor.1', 'house.floor.2', 'house.floor.3']`; `ASSET_NAMES['house.floor.N'] === 'optional'`.

- [ ] **Step 1: Write the failing test** — create `tests/paidManifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseManifest } from '../src/renderer/src/render/manifest';
import { LICENSE_URLS, licenseAllowed } from '../src/renderer/src/render/licenses';
import { buildCreditLines, buildNotices } from '../src/renderer/src/render/creditsText';
import { ASSET_NAMES } from '../src/renderer/src/render/assetNames';
import { FEATURE_NAMES, featureReady } from '../src/renderer/src/render/fallback';

/** Paid assets in the manifest (Art-i spec section 2). */
const paid = {
  file: 'paid/house-interior/floor.png', title: 'House Interior Pack', author: 'Example Studio', source: 'https://example.itch.io/house-interior',
  license: 'paid', retrieved: '2026-11-20', credit: 'House Interior Pack by Example Studio (commercial licence)', required: false,
  sheet: { frameW: 16, frameH: 16, frames: { 'house.floor.0': 0, 'house.floor.1': 1, 'house.floor.2': 2, 'house.floor.3': 3 }, animations: {} }
};
const font = { file: 'raw/m5x7/m5x7.ttf', title: 'm5x7', author: 'Daniel Linssen', source: 'https://managore.itch.io/m5x7', license: 'CC0-1.0', name: 'font.m5x7' };

describe('the paid licence', () => {
  it('is allowed, has no public licence URL, and accepts a well-formed paid entry under paid/', () => {
    expect(licenseAllowed('paid', 'none')).toBe(true);
    expect(Object.keys(LICENSE_URLS)).not.toContain('paid'); expect(Object.keys(LICENSE_URLS)).not.toContain('original');
    const [e] = parseManifest([paid]);
    expect(e!.required).toBe(false); expect(e!.license).toBe('paid');
  });
  it('licence paid and a file under paid/ go together, both ways', () => {
    expect(() => parseManifest([{ ...paid, file: 'raw/house/floor.png' }])).toThrow(/licence paid and a file under paid\/ go together/);
    expect(() => parseManifest([{ ...font, file: 'paid/m5x7.ttf' }])).toThrow(/licence paid and a file under paid\/ go together/);
  });
  it('a paid entry must be required: false (the default true is refused too)', () => {
    expect(() => parseManifest([{ ...paid, required: true }])).toThrow(/required: false/);
    const { required: _r, ...noRequired } = paid;
    expect(() => parseManifest([noRequired])).toThrow(/required: false/);
  });
  it('a paid entry needs a store URL as source, a purchase date and a credit line', () => {
    expect(() => parseManifest([{ ...paid, source: 'bought on itch' }])).toThrow(/store page URL/);
    const { retrieved: _d, ...noDate } = paid;
    expect(() => parseManifest([noDate])).toThrow(/purchase date/);
    const { credit: _c, ...noCredit } = paid;
    expect(() => parseManifest([noCredit])).toThrow(/credit line/);
  });
  it('accepts a paid/ path in the file pattern and still refuses paths outside raw/, art/ and paid/', () => {
    expect(() => parseManifest([{ ...paid, file: 'store/floor.png' }])).toThrow(/raw\/, art\/ or paid\//);
  });
});

describe('no two entries bind the same name', () => {
  it('refuses a paid file that shadows a free entry by binding its name', () => {
    const free = { ...font, file: 'raw/a.ttf' }, shadow = { ...paid, sheet: { frameW: 16, frameH: 16, frames: {}, animations: {} }, name: undefined };
    expect(() => parseManifest([free, { ...free, file: 'raw/b.ttf' }])).toThrow(/name font\.m5x7 is already bound by raw\/a\.ttf/);
    expect(() => parseManifest([paid, { ...shadow, file: 'paid/other.png', sheet: { ...shadow.sheet, frames: { 'house.floor.2': 0 } } }])).toThrow(/house\.floor\.2 is already bound/);
  });
  it('the real manifest binds every name once', () => {
    expect(() => parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')))).not.toThrow();
  });
});

describe('paid entries in the notices and the credits', () => {
  const m = parseManifest([font, paid]);
  it('prints the title, author, credit line and the commercial licence with the store page', () => {
    const text = buildNotices(m, () => '');
    expect(text).toContain('== paid (commercial licences) ==');
    expect(text).toContain('House Interior Pack by Example Studio (commercial licence)');
    expect(text).toContain('  Title: House Interior Pack'); expect(text).toContain('  Author: Example Studio');
    expect(text).toContain('  Licence: paid (commercial licence, https://example.itch.io/house-interior)');
    expect(text).not.toContain('undefined');
  });
  it('prefers licenseUrl over the store page when given', () => {
    const text = buildNotices(parseManifest([{ ...paid, licenseUrl: 'https://example.itch.io/licence' }]), () => '');
    expect(text).toContain('  Licence: paid (commercial licence, https://example.itch.io/licence)');
  });
  it('lists the paid credit line on the credits screen', () => {
    expect(buildCreditLines(m)).toContain('House Interior Pack by Example Studio (commercial licence)');
  });
});

describe('house floor names (Art-i spec section 2)', () => {
  it('registers house.floor.0 to 3 as optional and groups them as the houseFloor feature', () => {
    for (let n = 0; n < 4; n++) expect(ASSET_NAMES[`house.floor.${n}`]).toBe('optional');
    expect(FEATURE_NAMES.houseFloor).toEqual(['house.floor.0', 'house.floor.1', 'house.floor.2', 'house.floor.3']);
    expect(featureReady(new Set(['house.floor.2']), 'houseFloor')).toBe(false);
    expect(featureReady(new Set(), 'houseFloor')).toBe(true);
  });
});
```

And in `tests/manifest.test.ts` replace

```ts
    expect(LICENSES).toEqual(['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'OGA-BY-3.0', 'OFL-1.1', 'original', 'CC-BY-SA-4.0']);
```

with

```ts
    expect(LICENSES).toEqual(['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'OGA-BY-3.0', 'OFL-1.1', 'original', 'CC-BY-SA-4.0', 'paid']);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/paidManifest.test.ts tests/manifest.test.ts`
Expected: FAIL (licence `paid` rejected by the enum; `FEATURE_NAMES.houseFloor` undefined).

- [ ] **Step 3: The licence** — in `src/renderer/src/render/licenses.ts` replace

```ts
export const LICENSES = ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'OGA-BY-3.0', 'OFL-1.1', 'original', 'CC-BY-SA-4.0'] as const;
```

with

```ts
export const LICENSES = ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'OGA-BY-3.0', 'OFL-1.1', 'original', 'CC-BY-SA-4.0', 'paid'] as const;
```

and replace

```ts
export const LICENSE_URLS: Readonly<Record<Exclude<License, 'original'>, string>> = {
```

with

```ts
/** Public licence texts. `original` (the owner's own) and `paid` (each store's own commercial licence, Art-i spec section 2) have none. */
export const LICENSE_URLS: Readonly<Record<Exclude<License, 'original' | 'paid'>, string>> = {
```

- [ ] **Step 4: The manifest rules** — in `src/renderer/src/render/manifest.ts` replace

```ts
  file: z.string().regex(/^(raw|art)\/[^\s]+$/, 'file must be a path under raw/ or art/ (relative to public/assets)'),
```

with

```ts
  file: z.string().regex(/^(raw|art|paid)\/[^\s]+$/, 'file must be a path under raw/, art/ or paid/ (relative to public/assets)'),
```

and replace

```ts
    if (!e.editedBy) fail('derived art/ files must name editedBy');
  }
});

const manifest = z.array(entry).superRefine((all, ctx) => {
  const seen = new Set<string>();
  for (const e of all) { if (seen.has(e.file)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${e.file}: listed twice` }); seen.add(e.file); }
});
```

with

```ts
    if (!e.editedBy) fail('derived art/ files must name editedBy');
  }
  // Paid packs (Art-i spec section 2): the files are gitignored, so a fresh clone must run without them.
  if ((e.license === 'paid') !== e.file.startsWith('paid/')) fail('licence paid and a file under paid/ go together');
  if (e.license === 'paid') {
    if (e.required) fail('paid entries must be required: false (a fresh clone has no paid/ files)');
    if (!/^https?:\/\/\S+$/.test(e.source)) fail('paid entries need source = the store page URL');
    if (!e.retrieved) fail('paid entries need retrieved = the purchase date');
    if (!e.credit) fail('paid entries need a credit line');
  }
});

const manifest = z.array(entry).superRefine((all, ctx) => {
  const seen = new Set<string>(), owner = new Map<string, string>();
  for (const e of all) { if (seen.has(e.file)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${e.file}: listed twice` }); seen.add(e.file); }
  // No two entries bind one name (Art-i spec section 2): a paid file replaces free art by taking over its entry's name, never by shadowing it.
  for (const e of all) for (const n of (e.name === undefined) === (e.sheet === undefined) ? [] : boundNames(e)) {   // an entry with neither or both already failed above
    const first = owner.get(n);
    if (first !== undefined && first !== e.file) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${e.file}: name ${n} is already bound by ${first}` });
    else owner.set(n, e.file);
  }
});
```

(`boundNames` is the function declaration at the bottom of the file; declarations are hoisted.)

- [ ] **Step 5: The notices** — in `src/renderer/src/render/creditsText.ts` replace

```ts
    out.push(`== ${lic} (${LICENSE_URLS[lic as keyof typeof LICENSE_URLS]}) ==`, '');
```

with

```ts
    out.push(lic === 'paid' ? '== paid (commercial licences) ==' : `== ${lic} (${LICENSE_URLS[lic as keyof typeof LICENSE_URLS]}) ==`, '');
```

and replace

```ts
      out.push(`  Licence: ${lic} ${e.licenseUrl ?? LICENSE_URLS[lic as keyof typeof LICENSE_URLS]}`);
```

with

```ts
      out.push(lic === 'paid' ? `  Licence: paid (commercial licence, ${e.licenseUrl ?? e.source})` : `  Licence: ${lic} ${e.licenseUrl ?? LICENSE_URLS[lic as keyof typeof LICENSE_URLS]}`);   // Art-i spec section 2
```

(`buildCreditLines` already prints `e.credit`, which every paid entry has.)

- [ ] **Step 6: The names and the feature** — in `src/renderer/src/render/assetNames.ts`, after the line that starts `add('required', 'floor.0', ...`, insert:

```ts
// house floor art (Art-i spec section 2): a paid pack, absent on a fresh clone, so the procedural plating draws instead
add('optional', 'house.floor.0', 'house.floor.1', 'house.floor.2', 'house.floor.3');
```

In `src/renderer/src/render/fallback.ts` replace

```ts
export type Feature = 'crew' | 'breach' | 'vent' | 'damagedFloor' | 'fire' | 'icons' | 'glyphs' | 'arc' | 'sit';
```

with

```ts
export type Feature = 'crew' | 'breach' | 'vent' | 'damagedFloor' | 'fire' | 'icons' | 'glyphs' | 'arc' | 'sit' | 'houseFloor';
```

and after the line `  sit: ['crew.sit'],` insert

```ts
  houseFloor: ['house.floor.0', 'house.floor.1', 'house.floor.2', 'house.floor.3'],   // Art-i spec section 2
```

- [ ] **Step 7: Gitignore** — append to `.gitignore`:

```
# Paid art packs (never commit; the manifest entries are committed) and the art import contact sheet (Art-i spec sections 2-3)
public/assets/paid/
.art/
```

Run: `git check-ignore -v public/assets/paid/x.png .art/contact.png`
Expected: both paths reported against `.gitignore`.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/paidManifest.test.ts tests/manifest.test.ts tests/credits.test.ts tests/assets.test.ts tests/renderPure.test.ts tests/duelInterior.test.ts`
Expected: all pass; `paidManifest` 11, `manifest` 11, `credits` 6, `assets` 6, `renderPure` 19, `duelInterior` 3. (`assets.test.ts` may print a warning listing the unbound optional names, now including `house.floor.*`; that is expected.)

- [ ] **Step 9: Credits generation is unchanged for the free entries**

Run: `npm run credits && git diff --exit-code -- public/THIRD_PARTY_NOTICES.txt src/renderer/src/render/credits.generated.ts; echo "exit=$?"`
Expected: `wrote public/THIRD_PARTY_NOTICES.txt (3678 chars) and credits.generated.ts (10 lines)` and `exit=0`. The script writes LF endings, so `git status` may still list the two files as modified (stat only); restore them with `git checkout -- public/THIRD_PARTY_NOTICES.txt src/renderer/src/render/credits.generated.ts` and do not commit them.

Run: `npx tsc -b`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add -- src/renderer/src/render/licenses.ts src/renderer/src/render/manifest.ts src/renderer/src/render/creditsText.ts src/renderer/src/render/assetNames.ts src/renderer/src/render/fallback.ts .gitignore tests/paidManifest.test.ts tests/manifest.test.ts
git commit -m "feat(art-i-a): paid assets in the manifest, notices and credits

Licence paid under public/assets/paid/ (gitignored), required false, store URL,
purchase date and credit line; no name bound twice; house.floor.0-3 registered as
the optional houseFloor feature.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Palette-driven tiles and effects, floor art hook, guards

**Files:**
- Create: `src/renderer/src/render/effectsShapes.ts`
- Modify: `src/renderer/src/render/effects.ts` (imports and seven lines)
- Modify: `src/renderer/src/render/tiles.ts` (rewrite)
- Test: `tests/artGuards.test.ts` (create), `tests/tileLayer.test.ts` (create)

**Interfaces:**
- Consumes: `ROLE` (Task 1); `PANEL_STROKE`, `doorPicture`, `doorLook`, `DoorPicture`, `DoorRect` (Task 3); `wallPicture` with `light`/`shadow`, `floorSeams()`, `houseFloorName(tile)` (Task 3); `featureReady(missing, 'houseFloor')` (Task 4); `onGrid`, `strokeBand` (Task 3, `tests/helpers/artGrid.ts`); `moduleSpecifiers(source: string): string[]` from `tests/helpers/determinismGuard.ts` (existing).
- Produces:
  - `effectsShapes.ts`: `fireFallbackRect(tx: number, ty: number): DoorRect`, `breachRect(tx: number, ty: number): DoorRect`, `failedRect(tx: number, ty: number): DoorRect`, `ventSpeckRect(cx: number, cy: number): DoorRect`, `airlockOutlineBand(tx: number, ty: number): { rect: DoorRect; width: number; alignment: number }`.
  - `tiles.ts`: unchanged `TileLayer` interface and `createTileLayer(assets, memory)`; `container.children[0]` is the `floorArt` container (house floor sprites), `[1]` the base `Graphics`, `[2]` the doors `Graphics`.
  - `effects.ts`: `LOW_O2_COLOR` is now `ROLE.lowO2` (still exported).

- [ ] **Step 1: Write the failing tests** — create `tests/artGuards.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { moduleSpecifiers } from './helpers/determinismGuard';
import { airlockOutlineBand, breachRect, failedRect, fireFallbackRect, ventSpeckRect } from '../src/renderer/src/render/effectsShapes';
import { TILE_PX } from '../src/shared/resolution';
import { onGrid, strokeBand } from './helpers/artGrid';

const RENDER = 'src/renderer/src/render';

describe('palette-driven procedural art (Art-i spec section 4)', () => {
  for (const file of ['tiles.ts', 'doorModel.ts', 'wallModel.ts', 'effects.ts']) it(`${file} has no 0x colour literal left`, () => {
    expect(readFileSync(join(RENDER, file), 'utf8').match(/0x[0-9a-fA-F]+/g) ?? []).toEqual([]);
  });
});

describe('the effects shapes are on the art-pixel grid (Art-i spec section 4)', () => {
  const tiles = [[0, 0], [1, 0], [3, 7], [28, 12]] as const;
  it('fire fallback, breach and failed-station rectangles', () => {
    for (const [tx, ty] of tiles) for (const r of [fireFallbackRect(tx, ty), breachRect(tx, ty), failedRect(tx, ty)]) expect(onGrid(r), JSON.stringify(r)).toBe(true);
    expect(fireFallbackRect(1, 2)).toEqual({ x: TILE_PX + 4, y: 2 * TILE_PX + 4, w: TILE_PX - 8, h: TILE_PX - 8 });
    expect(failedRect(1, 2)).toEqual({ x: TILE_PX + 8, y: 2 * TILE_PX + 8, w: TILE_PX - 16, h: TILE_PX - 16 });
  });
  it('vent specks: the centre rounded to an even world unit, 4 units square', () => {
    for (let k = 0; k < 200; k++) { const r = ventSpeckRect(100 + k * 0.37, 50 - k * 0.61); expect(onGrid(r), JSON.stringify(r)).toBe(true); expect([r.w, r.h]).toEqual([4, 4]); }
    expect(ventSpeckRect(17, 33)).toEqual({ x: 16, y: 32, w: 4, h: 4 });   // centre 17 -> 18, 33 -> 34 (Math.round rounds the half up)
  });
  it('the airlock outline paints the ring -2..0 outside the tile', () => {
    for (const [tx, ty] of tiles) {
      const o = airlockOutlineBand(tx, ty), b = strokeBand(o.rect, o.width, o.alignment);
      expect(onGrid(b.outer) && onGrid(b.inner)).toBe(true);
      expect(b.inner).toEqual({ x: tx * TILE_PX, y: ty * TILE_PX, w: TILE_PX, h: TILE_PX });
      expect(b.outer).toEqual({ x: tx * TILE_PX - 2, y: ty * TILE_PX - 2, w: TILE_PX + 4, h: TILE_PX + 4 });
    }
  });
});

describe('the renderer never reads the sim RNG (Art-i spec, top)', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
  for (const file of walk(RENDER)) it(`${file.replaceAll('\\', '/')} imports no RNG module and touches no state.rng`, () => {
    const source = readFileSync(file, 'utf8');
    expect(moduleSpecifiers(source).filter((s) => /(?:^|\/)rng(?:\.ts)?$/i.test(s))).toEqual([]);
    expect(source.match(/\.rng\b/g) ?? []).toEqual([]);
  });
});

describe('pngjs and scripts/ never reach the renderer (Art-i spec section 3)', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
  for (const file of [...walk(RENDER), ...walk(join(RENDER, '..', 'app'))]) it(`${file.replaceAll('\\', '/')} imports neither pngjs nor scripts/`, () => {
    const source = readFileSync(file, 'utf8');
    expect(moduleSpecifiers(source).filter((s) => s === 'pngjs' || /(^|\/)scripts\//.test(s))).toEqual([]);
  });
});
```

Create `tests/tileLayer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Container, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { createRenderMemory } from '../src/renderer/src/render/memory';
import { createTileLayer } from '../src/renderer/src/render/tiles';
import { cutterState } from './helpers/sim';

/** The floor art hook (Art-i spec section 4): procedural plating unless house.floor.0 to 3 are all loaded. */
const source = new TextureSource({ width: 64, height: 16 });
const floorTex = (n: number): Texture => new Texture({ source, frame: new Rectangle(16 * n, 0, 16, 16) });
const assets = (houseFloor: boolean): GameAssets => ({
  has: (n) => houseFloor && n.startsWith('house.floor.'),
  texture: (n) => { const m = /^house\.floor\.(\d)$/.exec(n); if (!m || !houseFloor) throw new Error(`no texture ${n}`); return floorTex(Number(m[1])); },
  animation: (n) => { throw new Error(`no animation ${n}`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n}`); },
  missing: Object.values(FEATURE_NAMES).flat().filter((n) => !(houseFloor && n.startsWith('house.floor.'))), fontFamily: 'm5x7'
});
const floorArt = (layer: { container: Container }): Container => layer.container.children[0] as Container;

describe('the tile layer floor art hook', () => {
  it('without the houseFloor feature the floors stay procedural: no floor sprites', () => {
    const s = cutterState(), layer = createTileLayer(assets(false), createRenderMemory());
    layer.update(s, 0);
    expect(floorArt(layer).children).toHaveLength(0);
  });
  it('with house.floor.0 to 3 loaded every floor tile and wall-tile floor part gets a 2x sprite on the art-pixel grid', () => {
    const s = cutterState(), layer = createTileLayer(assets(true), createRenderMemory());
    layer.update(s, 0);
    const sprites = [...floorArt(layer).children] as Sprite[];
    const n = sprites.length;
    const floorTiles = s.layout.rows.join('').split('').filter((c) => c !== ' ' && c !== '#').length;
    expect(sprites.length).toBeGreaterThanOrEqual(floorTiles);
    for (const sp of sprites) {
      expect(sp.scale.x).toBe(2); expect(sp.scale.y).toBe(2);
      expect(sp.x % 2).toBe(0); expect(sp.y % 2).toBe(0);
      expect(sp.texture.frame.width * 2).toBeLessThanOrEqual(32); expect(sp.texture.frame.height * 2).toBeLessThanOrEqual(32);
    }
    layer.build(s);   // a rebuild replaces the sprites rather than adding more
    expect(floorArt(layer).children.length).toBe(n);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/artGuards.test.ts tests/tileLayer.test.ts`
Expected: FAIL (`effectsShapes` cannot be resolved; `tileLayer` finds no floor art container).

- [ ] **Step 3: Create `src/renderer/src/render/effectsShapes.ts`**

```ts
import { TILE_PX } from '../../../shared/resolution';
import type { DoorRect } from './doorModel';

/**
 * The effects layer's procedural shapes on the art-pixel grid (Art-i spec section 4): even world units at even offsets.
 * Pure: tile coordinates or world points in, world-unit rectangles out (no Pixi), so the grid rule can be unit-tested.
 */
const T = TILE_PX;

/** A burning tile drawn without the fire art: the tile inset by 2 art pixels. */
export function fireFallbackRect(tx: number, ty: number): DoorRect { return { x: tx * T + 4, y: ty * T + 4, w: T - 8, h: T - 8 }; }

/** An active breach drawn without the decal art: the whole site tile. */
export function breachRect(tx: number, ty: number): DoorRect { return { x: tx * T, y: ty * T, w: T, h: T }; }

/** A failed station drawn without the arc art: the tile inset by 4 art pixels. */
export function failedRect(tx: number, ty: number): DoorRect { return { x: tx * T + 8, y: ty * T + 8, w: T - 16, h: T - 16 }; }

/** An oxygen speck streaming out of an open airlock: 2 art pixels square, its centre rounded to an even world unit. */
export function ventSpeckRect(cx: number, cy: number): DoorRect {
  const ex = 2 * Math.round(cx / 2), ey = 2 * Math.round(cy / 2);
  return { x: ex - 2, y: ey - 2, w: 4, h: 4 };
}

/** The Doors console's selection outline: a 2-unit stroke with alignment 1 (inside) on the tile grown by 2, so it paints the ring from -2 to 0 outside the tile. */
export function airlockOutlineBand(tx: number, ty: number): { rect: DoorRect; width: number; alignment: number } {
  return { rect: { x: tx * T - 2, y: ty * T - 2, w: T + 4, h: T + 4 }, width: 2, alignment: 1 };
}
```

- [ ] **Step 4: Effects read roles and the helpers** — in `src/renderer/src/render/effects.ts` make these replacements (each `old` line appears once):

1. After `import { syncCache } from './cache';` add:
```ts
import { ROLE } from './palette';
import { airlockOutlineBand, breachRect, failedRect, fireFallbackRect, ventSpeckRect } from './effectsShapes';
```
2. `export const LOW_O2_COLOR = 0xd13a3a;` → `export const LOW_O2_COLOR = ROLE.lowO2;   // Art-i spec section 4: the palette role (Art-i-b turns it into the vacuum grade)`
3. `IMPACT_COLOR = 0xff6b5a,` → `IMPACT_COLOR = ROLE.impact,`
4. `        for (const t of wanted) { const [tx, ty] = tileXY(w, t); fallback.rect(tx * TILE_PX + 4, ty * TILE_PX + 4, TILE_PX - 8, TILE_PX - 8).fill({ color: 0xff8c1a, alpha: 0.8 }); }` →
```ts
        for (const t of wanted) { const [tx, ty] = tileXY(w, t), r = fireFallbackRect(tx, ty); fallback.rect(r.x, r.y, r.w, r.h).fill({ color: ROLE.fireFallback, alpha: 0.8 }); }
```
5. `        } else if (active) fallback.rect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX).fill(0xff3030);` →
```ts
        } else if (active) { const r = breachRect(tx, ty); fallback.rect(r.x, r.y, r.w, r.h).fill(ROLE.breach); }
```
6. The two outline lines
```ts
        const [tx, ty] = tileXY(w, sel), pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(state.tick * 0.2));
        outline.rect(tx * TILE_PX - 2, ty * TILE_PX - 2, TILE_PX + 4, TILE_PX + 4).stroke({ color: 0x4fc3f7, width: 3, alpha: pulse });   // drawn just outside the tile: it stays visible on amber airlock leaves
```
→
```ts
        const [tx, ty] = tileXY(w, sel), pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(state.tick * 0.2)), band = airlockOutlineBand(tx, ty);
        outline.rect(band.rect.x, band.rect.y, band.rect.w, band.rect.h).stroke({ color: ROLE.airlockOutline, width: band.width, alignment: band.alignment, alpha: pulse });   // painted just outside the tile: it stays visible on amber airlock leaves
```
7. `          ventLayer.rect(cx - 2, cy - 2, 4, 4).fill({ color: 0xd8ecff, alpha: p.alpha });` →
```ts
          const r = ventSpeckRect(cx, cy); ventLayer.rect(r.x, r.y, r.w, r.h).fill({ color: ROLE.ventSpeck, alpha: p.alpha });
```
8. `        for (const t of failedTiles) { const [tx, ty] = tileXY(w, t); fallback.rect(tx * TILE_PX + 8, ty * TILE_PX + 8, TILE_PX - 16, TILE_PX - 16).fill({ color: 0xffd23a, alpha: 0.9 }); }` →
```ts
        for (const t of failedTiles) { const [tx, ty] = tileXY(w, t), r = failedRect(tx, ty); fallback.rect(r.x, r.y, r.w, r.h).fill({ color: ROLE.failed, alpha: 0.9 }); }
```

Check: `grep -n "0x" src/renderer/src/render/effects.ts` prints nothing.

- [ ] **Step 5: Replace the whole of `src/renderer/src/render/tiles.ts`**

```ts
import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import type { GameAssets } from './assets';
import type { RenderMemory } from './memory';
import { airlockDraw, airlockOutward } from './hazardTiles';
import { advanceDoor, doorTarget, DOOR_ANIM_SECONDS } from './doorAnim';
import { floorSeams, houseFloorName, wallPicture, type Cell } from './wallModel';
import { doorPicture, doorLook, PANEL_STROKE, type DoorPicture, type DoorRect } from './doorModel';
import { featureReady } from './fallback';
import { ROLE } from './palette';

export interface TileLayer { container: Container; build(state: SimState): void; update(state: SimState, dtSeconds: number): void }

/** World units per art pixel: art is drawn at 16 px a tile and shown at 2x (Art-i spec section 1). */
const ART = TILE_PX / 16;

/**
 * Floors and walls, built once per layout; doors and airlocks redrawn every frame from the door model (spec Demo-x-c section 2), their slide driven by the door animation.
 * Art-i spec section 4: colours are palette roles; walls get a light top-left edge and a shadow bottom-right edge; floors a one-art-pixel seam;
 * when the houseFloor feature is ready the floors draw house.floor.N instead of the procedural plating (walls stay procedural thin bands).
 */
export function createTileLayer(assets: GameAssets, _memory: RenderMemory): TileLayer {
  const container = new Container();
  const floorArt = new Container(), base = new Graphics(), doors = new Graphics();
  container.addChild(floorArt, base, doors);
  const art = featureReady(new Set(assets.missing), 'houseFloor');
  let builtFor: string | null = null;
  const doorProgress = new Map<number, number>(), lockProgress = new Map<number, number>();

  /** A floor sprite covering `r` (tile-local world units) of the tile at (x, y), cut from the matching part of the 16 px art. */
  function floorSprite(tile: number, x: number, y: number, r: DoorRect): void {
    const tex = assets.texture(houseFloorName(tile)), f = tex.frame;
    const part = new Texture({ source: tex.source, frame: new Rectangle(f.x + r.x / ART, f.y + r.y / ART, r.w / ART, r.h / ART) });
    const s = new Sprite(part); s.scale.set(ART); s.position.set(x + r.x, y + r.y); floorArt.addChild(s);
  }
  function floor(tile: number, x: number, y: number, r: DoorRect, seams: boolean): void {
    if (art) { floorSprite(tile, x, y, r); return; }
    base.rect(x + r.x, y + r.y, r.w, r.h).fill(ROLE.floor);
    if (seams) for (const s of floorSeams()) base.rect(x + s.x, y + s.y, s.w, s.h).fill(ROLE.floorSeam);
  }

  function build(state: SimState): void {
    const d = state.derived, rows = state.layout.rows;
    base.clear();
    for (const c of floorArt.removeChildren()) c.destroy();
    const cell = (x: number, y: number): Cell => { const c = rows[y]?.charAt(x) ?? ' '; return c === '' || c === ' ' ? 'space' : c === '#' ? 'wall' : c === '+' ? 'door' : 'floor'; };
    for (let ty = 0; ty < d.height; ty++) for (let tx = 0; tx < d.width; tx++) {
      const c = cell(tx, ty), x = tx * TILE_PX, y = ty * TILE_PX, tile = ty * d.width + tx;
      if (c === 'space') continue;
      if (c !== 'wall') { floor(tile, x, y, { x: 0, y: 0, w: TILE_PX, h: TILE_PX }, true); continue; }
      const p = wallPicture(cell(tx, ty - 1), cell(tx + 1, ty), cell(tx, ty + 1), cell(tx - 1, ty), cell(tx + 1, ty - 1), cell(tx + 1, ty + 1), cell(tx - 1, ty + 1), cell(tx - 1, ty - 1));   // thin walls, as thick as a door (the user, 2026-11-13)
      for (const r of p.floor) floor(tile, x, y, r, false);
      for (const r of p.band) base.rect(x + r.x, y + r.y, r.w, r.h).fill(ROLE.wall);
      for (const r of p.shadow) base.rect(x + r.x, y + r.y, r.w, r.h).fill(ROLE.wallShadow);
      for (const r of p.light) base.rect(x + r.x, y + r.y, r.w, r.h).fill(ROLE.wallLight);
    }
    builtFor = d.layoutHash; doorProgress.clear(); lockProgress.clear();
  }

  const at = (x: number, y: number, r: DoorRect) => doors.rect(x + r.x, y + r.y, r.w, r.h);
  function draw(x: number, y: number, p: DoorPicture): void {
    if (p.gap) at(x, y, p.gap).fill(ROLE.spaceGap);
    if (p.floor && !art) at(x, y, p.floor).fill(ROLE.floor);   // with floor art the doorway shows the art drawn under it
    for (const j of p.jambs) at(x, y, j).fill(p.outline);
    for (const r of p.panels) at(x, y, r).fill(p.fill).stroke({ width: PANEL_STROKE, color: p.outline, alignment: 1 });
    for (const s of p.stripes) at(x, y, s).fill(p.outline);
    if (p.seam) at(x, y, p.seam).fill(p.outline);
    if (p.bar) at(x, y, p.bar).fill(p.outline);
    for (const t of p.ticks) at(x, y, t).fill(ROLE.heldTick);
  }
  const step = (m: Map<number, number>, k: number, target: 0 | 1, dt: number): number => { const v = advanceDoor(m.get(k) ?? target, target, dt, DOOR_ANIM_SECONDS); m.set(k, v); return v; };

  return {
    container, build,
    update(state, dt) {
      if (builtFor !== state.derived.layoutHash) build(state);
      const d = state.derived, rows = state.layout.rows;
      const isWall = (x: number, y: number): boolean => rows[y]?.charAt(x) === '#';
      doors.clear();
      for (let e = 0; e < d.edgeIsDoor.length; e++) {
        if (!d.edgeIsDoor[e]) continue;
        const t = d.edgeTile[e]!, tx = t % d.width, ty = (t - tx) / d.width;
        const st = state.doors.state[e]!, look = doorLook(st);
        const progress = look === 'sealed' ? (doorProgress.set(e, 0), 0) : step(doorProgress, e, doorTarget(st), dt);   // sealing is instant
        draw(tx * TILE_PX, ty * TILE_PX, doorPicture(look, progress, isWall(tx - 1, ty) && isWall(tx + 1, ty) ? 'x' : 'y'));   // walls left and right: the wall runs across, the panels slide sideways
      }
      for (let k = 0; k < d.airlockTile.length; k++) {
        const t = d.airlockTile[k]!, tx = t % d.width, ty = (t - tx) / d.width;
        const open = airlockDraw(state, k).open, progress = step(lockProgress, k, open ? 1 : 0, dt);
        draw(tx * TILE_PX, ty * TILE_PX, doorPicture(open ? 'open' : 'closed', progress, airlockOutward(d, k).dy !== 0 ? 'x' : 'y', true));   // space above or below: the hull runs across
      }
    }
  };
}
```

(The old `export const FLOOR = 0xc9cdd6, WALL = 0x3b4150;` is gone; nothing else imported them.)

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/artGuards.test.ts tests/tileLayer.test.ts tests/duelInterior.test.ts tests/effects.test.ts`
Expected: all pass. `artGuards` has 7 tests, plus one RNG test per `.ts` file under `src/renderer/src/render/` (60 files in the prototype), plus one pngjs/scripts test per `.ts` file under `src/renderer/src/render/` and `src/renderer/src/app/` (60 + 19 in the prototype): 146 tests when those folders hold 60 and 19 files; `tileLayer` 2; `duelInterior` 3. (If `tests/effects.test.ts` does not exist vitest reports only the others; that is fine.)

Run: `npx tsc -b`
Expected: no output.

- [ ] **Step 7: Sim untouched**

Run: `npx vitest run tests/golden.test.ts tests/duelGolden.test.ts tests/boundary.test.ts && git diff master --stat -- src/renderer/src/sim src/renderer/src/authority src/network src/shared`
Expected: the three test files pass (4, 4 and 118 tests in the prototype); the diff stat prints nothing.

- [ ] **Step 8: Commit**

```bash
git add -- src/renderer/src/render/effectsShapes.ts src/renderer/src/render/effects.ts src/renderer/src/render/tiles.ts tests/artGuards.test.ts tests/tileLayer.test.ts
git commit -m "feat(art-i-a): palette roles in tiles and effects, wall edges, floor seams and the floor art hook

Effects shapes move to pure even-grid helpers; a guard test keeps 0x literals out of
the interior files and the sim RNG out of the renderer.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The import script (`npm run art:import`)

**Files:**
- Create: `scripts/art/importCore.ts`
- Create: `scripts/art-import.ts`
- Create: `art/import.json`
- Modify: `package.json`, `package-lock.json` (dev dependencies and script)
- Test: `tests/artImport.test.ts` (create)

**Interfaces:**
- Consumes: `parsePalette`, `Palette` and `palette.json` (Task 1).
- Produces (all in `scripts/art/importCore.ts`):
  - `export const importConfig` (zod) and `type ImportConfig = { $comment?: string; outputs: ImportOutput[] }`, `type ImportOutput = { pack: string; frames: { x: number; y: number; w: number; h: number }[]; output: string; columns: number }`
  - `export function sourceFolder(env: Record<string, string | undefined>): string`
  - `export type Lab = readonly [number, number, number]; export function toOklab(r: number, g: number, b: number): Lab`
  - `export function createRemap(colours: readonly number[]): (r: number, g: number, b: number) => number`
  - `export function remapPixels(data: Uint8Array, remap: (r: number, g: number, b: number) => number): void`
  - `export interface Image { width: number; height: number; data: Uint8Array }`; `readPng(path: string): Image`; `encodePng(img: Image): Buffer`; `packSheet(src: Image, o: ImportOutput): Image`; `contactSheet(sheets: readonly Image[], background: number): Image`
  - `export interface ImportRun { repoRoot: string; sourceRoot: string; config: unknown; palette?: Palette }`; `export interface ImportResult { problems: string[]; written: string[] }`; `export function runImport(run: ImportRun): ImportResult`

- [ ] **Step 1: Add the dependency and the script**

```bash
npm install --save-dev --save-exact pngjs@7.0.0 @types/pngjs@6.0.5 --no-audit --no-fund
npm pkg set scripts.art:import="tsx scripts/art-import.ts"
git diff -- package.json
```

Expected: `package.json` gains `"@types/pngjs": "6.0.5"`, `"pngjs": "7.0.0"` under `devDependencies` and `"art:import": "tsx scripts/art-import.ts"` under `scripts`.

- [ ] **Step 2: Write the failing test** — create `tests/artImport.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRemap, encodePng, readPng, remapPixels, runImport, sourceFolder, toOklab, type Image } from '../scripts/art/importCore';
import { PALETTE } from '../src/renderer/src/render/palette';
const committed = JSON.parse(readFileSync('art/import.json', 'utf8')) as { outputs: unknown[] };

/** The art import (Art-i spec section 3). Fixtures are PNGs generated into a temp dir; the owner's asset folder is never read. */
const rgba = (w: number, h: number, px: (x: number, y: number) => [number, number, number, number]): Image => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(px(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
};
/** A 32 x 16 pack: a colour gradient with a half-transparent band, so every alpha and many colours occur. */
const pack = rgba(32, 16, (x, y) => [x * 8, y * 16, (x * y) & 255, y < 4 ? 40 : y < 8 ? 127 : y < 12 ? 128 : 255]);
const output = (over: Record<string, unknown> = {}) => ({ pack: 'Pack/sheet.png', frames: [{ x: 0, y: 0, w: 16, h: 16 }, { x: 16, y: 0, w: 16, h: 16 }], output: 'public/assets/paid/pack/sheet.png', columns: 2, ...over });

let root = '', repo = '', source = '';
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ftlite-art-import-')); repo = join(root, 'repo'); source = join(root, 'assets');
  mkdirSync(join(source, 'Pack'), { recursive: true }); mkdirSync(repo);
  writeFileSync(join(source, 'Pack', 'sheet.png'), encodePng(pack));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('the OKLab remap', () => {
  it('maps each palette colour to itself and a near colour to its neighbour, ties to the earlier palette colour', () => {
    const colours = [0x000000, 0xffffff, 0xff0000];
    const remap = createRemap(colours);
    expect(remap(0, 0, 0)).toBe(0x000000); expect(remap(255, 255, 255)).toBe(0xffffff); expect(remap(250, 10, 10)).toBe(0xff0000);
    expect(remap(30, 30, 30)).toBe(0x000000); expect(remap(220, 220, 220)).toBe(0xffffff);
    const twins = createRemap([0x808080, 0x808080]);   // equal distance: the first wins
    expect(twins(128, 128, 128)).toBe(0x808080);
    expect(toOklab(255, 255, 255)[0]).toBeCloseTo(1, 4); expect(toOklab(0, 0, 0)[0]).toBeCloseTo(0, 9);
  });
  it('makes alpha 0 or 255 at the 128 threshold and every opaque pixel a palette colour', () => {
    const img = rgba(4, 1, (x) => [200, 10 * x, 30, [0, 127, 128, 255][x]!]);
    remapPixels(img.data, createRemap(PALETTE.colours));
    expect([3, 7, 11, 15].map((i) => img.data[i])).toEqual([0, 0, 255, 255]);
    expect([...img.data.subarray(0, 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    const set = new Set(PALETTE.colours);
    for (const i of [8, 12]) expect(set.has((img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!)).toBe(true);
  });
});

describe('runImport', () => {
  it('writes the sheet and the contact sheet; every output pixel is a palette colour or transparent', () => {
    const r = runImport({ repoRoot: repo, sourceRoot: source, config: { outputs: [output()] } });
    expect(r.problems).toEqual([]);
    expect(r.written).toEqual([join(repo, 'public', 'assets', 'paid', 'pack', 'sheet.png'), join(repo, '.art', 'contact.png')]);
    const sheet = readPng(r.written[0]!), set = new Set(PALETTE.colours);
    expect([sheet.width, sheet.height]).toEqual([32, 16]);
    for (let i = 0; i < sheet.data.length; i += 4) {
      const a = sheet.data[i + 3]!;
      expect(a === 0 || a === 255).toBe(true);
      if (a === 255) expect(set.has((sheet.data[i]! << 16) | (sheet.data[i + 1]! << 8) | sheet.data[i + 2]!)).toBe(true);
    }
    const contact = readPng(r.written[1]!);
    expect([contact.width, contact.height]).toEqual([64, 32]);
    const bg = PALETTE.roles.background;
    expect([...contact.data.subarray(0, 4)]).toEqual([(bg >> 16) & 255, (bg >> 8) & 255, bg & 255, 255]);   // pixel (0,0) of the pack has alpha 40: the background shows
  });
  it('packs frames by columns with cells as large as the largest frame', () => {
    const r = runImport({ repoRoot: repo, sourceRoot: source, config: { outputs: [output({ frames: [{ x: 0, y: 0, w: 8, h: 8 }, { x: 8, y: 8, w: 4, h: 4 }, { x: 0, y: 8, w: 8, h: 8 }], columns: 2 })] } });
    expect(r.problems).toEqual([]);
    const sheet = readPng(r.written[0]!);
    expect([sheet.width, sheet.height]).toEqual([16, 16]);
  });
  it('is deterministic: the same input bytes give the same output bytes', () => {
    const a = runImport({ repoRoot: repo, sourceRoot: source, config: { outputs: [output()] } });
    const first = a.written.map((p) => readFileSync(p));
    const b = runImport({ repoRoot: repo, sourceRoot: source, config: { outputs: [output()] } });
    b.written.forEach((p, i) => expect(readFileSync(p).equals(first[i]!)).toBe(true));
  });
  it('a missing source folder: one line, nothing written', () => {
    const r = runImport({ repoRoot: repo, sourceRoot: join(root, 'nowhere'), config: { outputs: [output()] } });
    expect(r.problems).toEqual([`source folder ${join(root, 'nowhere')} does not exist (set FTLITE_ASSETS)`]); expect(r.written).toEqual([]);
    expect(existsSync(join(repo, 'public'))).toBe(false); expect(existsSync(join(repo, '.art'))).toBe(false);
  });
  it('a missing pack file, a frame outside its image and an output outside public/assets/paid/: every problem listed, nothing written', () => {
    const r = runImport({ repoRoot: repo, sourceRoot: source, config: { outputs: [
      output({ pack: 'Pack/missing.png' }),
      output({ frames: [{ x: 0, y: 0, w: 16, h: 16 }, { x: 24, y: 8, w: 16, h: 16 }] }),
      output({ output: 'public/assets/raw/sheet.png' }),
      output({ output: 'public/assets/paid/../escape.png' })
    ] } });
    expect(r.problems).toEqual([
      `outputs[0]: pack file Pack/missing.png not found in ${source}`,
      'outputs[1].frames[1]: rectangle 24,8 16x16 is outside Pack/sheet.png (32x16)',
      'outputs[2]: output public/assets/raw/sheet.png is outside public/assets/paid/',
      'outputs[3]: output public/assets/paid/../escape.png is outside public/assets/paid/'
    ]);
    expect(r.written).toEqual([]); expect(existsSync(join(repo, 'public'))).toBe(false); expect(existsSync(join(repo, '.art'))).toBe(false);
  });
  it('a malformed config is reported, not thrown', () => {
    const r = runImport({ repoRoot: repo, sourceRoot: source, config: { outputs: [{ pack: 'x.png' }] } });
    expect(r.problems.length).toBeGreaterThan(0); expect(r.problems[0]).toMatch(/^art\/import\.json: outputs\.0\.frames/);
  });
  it('the source folder defaults to the owner folder unless FTLITE_ASSETS is set', () => {
    expect(sourceFolder({})).toBe('C:\\Users\\djuar\\FTLite-assets'); expect(sourceFolder({ FTLITE_ASSETS: 'D:\\packs' })).toBe('D:\\packs');
  });
  it('the committed art/import.json parses and lists no outputs yet (Art-ii fills it)', () => {
    expect(committed.outputs).toEqual([]);
    expect(runImport({ repoRoot: repo, sourceRoot: source, config: committed })).toEqual({ problems: [], written: [] });
  });
});
```

(The committed config is read with `readFileSync`, not imported: a JSON import from `art/` is outside `tsconfig.web.json`'s file list and `tsc -b` refuses it with TS6307.)

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/artImport.test.ts`
Expected: FAIL, `Cannot find module '../scripts/art/importCore'` (or `ENOENT ... art/import.json`).

- [ ] **Step 4: Create `art/import.json`**

```json
{
  "$comment": "npm run art:import (Art-i spec section 3). Each output: pack = the pack PNG relative to FTLITE_ASSETS (else C:\\Users\\djuar\\FTLite-assets); frames = rectangles in that PNG, in sheet order; output = the sheet to write, under public/assets/paid/; columns = frames per sheet row. Example: { \"pack\": \"SomeInteriorPack/floors.png\", \"frames\": [{ \"x\": 0, \"y\": 0, \"w\": 16, \"h\": 16 }, { \"x\": 16, \"y\": 0, \"w\": 16, \"h\": 16 }], \"output\": \"public/assets/paid/interior/floor.png\", \"columns\": 4 }. Art-ii fills this list when the pack is bought.",
  "outputs": []
}
```

- [ ] **Step 5: Create `scripts/art/importCore.ts`**

```ts
// The art import (Art-i spec section 3): cut frames out of bought packs, remap every pixel to the house palette in OKLab,
// and write sheets into public/assets/paid/ plus a contact sheet at .art/contact.png. Validates everything before writing anything.
// Scripts only (pngjs is a dev dependency); the renderer never imports this file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { PNG } from 'pngjs';
import { z } from 'zod';
import paletteFile from '../../src/renderer/src/render/palette.json';
import { parsePalette, type Palette } from '../../src/renderer/src/render/palette';

const rect = z.object({ x: z.number().int().min(0), y: z.number().int().min(0), w: z.number().int().positive(), h: z.number().int().positive() });
const output = z.object({
  /** The pack file, relative to the asset source folder. */
  pack: z.string().min(1),
  /** Frames to cut, in sheet order. */
  frames: z.array(rect).min(1),
  /** The sheet to write, relative to the repo root; must be under public/assets/paid/. */
  output: z.string().min(1),
  /** Sheet layout: frames left to right, `columns` per row, each in a cell as big as the largest frame. */
  columns: z.number().int().positive()
});
export const importConfig = z.object({ $comment: z.string().optional(), outputs: z.array(output) });
export type ImportConfig = z.infer<typeof importConfig>;
export type ImportOutput = z.infer<typeof output>;

/** The asset source folder: FTLITE_ASSETS, else the owner's folder (never inside the repo). */
export function sourceFolder(env: Record<string, string | undefined>): string { return env.FTLITE_ASSETS || 'C:\\Users\\djuar\\FTLite-assets'; }

// ---- colour -------------------------------------------------------------------------------------------------------------

export type Lab = readonly [number, number, number];
const lin = (c: number): number => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
/** sRGB bytes to OKLab (Bjorn Ottosson's matrices). */
export function toOklab(r: number, g: number, b: number): Lab {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}

/** Nearest palette colour in OKLab by squared distance; a tie goes to the colour earlier in the palette. Returns the colour as a number. */
export function createRemap(colours: readonly number[]): (r: number, g: number, b: number) => number {
  const labs = colours.map((c) => toOklab((c >> 16) & 255, (c >> 8) & 255, c & 255));
  const cache = new Map<number, number>();
  return (r, g, b) => {
    const key = (r << 16) | (g << 8) | b, hit = cache.get(key);
    if (hit !== undefined) return hit;
    const [L, A, B] = toOklab(r, g, b);
    let best = 0, bestD = Infinity;
    labs.forEach(([l, a, bb], i) => { const d = (L - l) ** 2 + (A - a) ** 2 + (B - bb) ** 2; if (d < bestD) { bestD = d; best = i; } });
    cache.set(key, colours[best]!); return colours[best]!;
  };
}

/** Remap an RGBA buffer in place: alpha below 128 becomes fully transparent (0,0,0,0), the rest opaque in the nearest palette colour. */
export function remapPixels(data: Uint8Array, remap: (r: number, g: number, b: number) => number): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 128) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0; continue; }
    const c = remap(data[i]!, data[i + 1]!, data[i + 2]!);
    data[i] = (c >> 16) & 255; data[i + 1] = (c >> 8) & 255; data[i + 2] = c & 255; data[i + 3] = 255;
  }
}

// ---- images -------------------------------------------------------------------------------------------------------------

export interface Image { width: number; height: number; data: Uint8Array }
const blank = (width: number, height: number): Image => ({ width, height, data: new Uint8Array(width * height * 4) });
export function readPng(path: string): Image { const p = PNG.sync.read(readFileSync(path)); return { width: p.width, height: p.height, data: new Uint8Array(p.data) }; }
/** PNG bytes for an image: always 8-bit RGBA with pngjs's fixed defaults, so the same pixels give the same bytes. */
export function encodePng(img: Image): Buffer {
  const p = new PNG({ width: img.width, height: img.height }); Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength).copy(p.data);
  return PNG.sync.write(p, { colorType: 6, inputColorType: 6, bitDepth: 8 });
}
function blit(src: Image, sx: number, sy: number, w: number, h: number, dst: Image, dx: number, dy: number, scale = 1): void {
  for (let y = 0; y < h * scale; y++) for (let x = 0; x < w * scale; x++) {
    const s = ((sy + Math.floor(y / scale)) * src.width + sx + Math.floor(x / scale)) * 4, d = ((dy + y) * dst.width + dx + x) * 4;
    if (src.data[s + 3] === 0) continue;
    dst.data.set(src.data.subarray(s, s + 4), d);
  }
}

/** Cut the frames into one sheet: `columns` per row, each cell as large as the largest frame, frames at the cell's top-left. */
export function packSheet(src: Image, o: ImportOutput): Image {
  const cw = Math.max(...o.frames.map((f) => f.w)), ch = Math.max(...o.frames.map((f) => f.h));
  const cols = Math.min(o.columns, o.frames.length), rows = Math.ceil(o.frames.length / o.columns);
  const sheet = blank(cols * cw, rows * ch);
  o.frames.forEach((f, i) => blit(src, f.x, f.y, f.w, f.h, sheet, (i % o.columns) * cw, Math.floor(i / o.columns) * ch));
  return sheet;
}

/** Every output at 2x, stacked top to bottom with a 4 px gap, on the palette's background role. */
export function contactSheet(sheets: readonly Image[], background: number): Image {
  const gap = 4, width = Math.max(...sheets.map((s) => s.width * 2)), height = sheets.reduce((n, s) => n + s.height * 2, 0) + gap * (sheets.length - 1);
  const out = blank(width, height);
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = (background >> 16) & 255; out.data[i + 1] = (background >> 8) & 255; out.data[i + 2] = background & 255; out.data[i + 3] = 255; }
  let y = 0;
  for (const s of sheets) { blit(s, 0, 0, s.width, s.height, out, 0, y, 2); y += s.height * 2 + gap; }
  return out;
}

// ---- the run ------------------------------------------------------------------------------------------------------------

export interface ImportRun { repoRoot: string; sourceRoot: string; config: unknown; palette?: Palette }
export interface ImportResult { problems: string[]; written: string[] }

/** Validate every output, then (only if nothing is wrong) write the sheets and the contact sheet. Problems come back one line each. */
export function runImport(run: ImportRun): ImportResult {
  const palette = run.palette ?? parsePalette(paletteFile);
  const parsed = importConfig.safeParse(run.config);
  if (!parsed.success) return { problems: parsed.error.issues.map((i) => `art/import.json: ${i.path.join('.') || '(root)'}: ${i.message}`), written: [] };
  const problems: string[] = [], sources: Image[] = [];
  const paidRoot = resolve(run.repoRoot, 'public', 'assets', 'paid') + sep;
  const haveSource = existsSync(run.sourceRoot);
  if (!haveSource) problems.push(`source folder ${run.sourceRoot} does not exist (set FTLITE_ASSETS)`);
  parsed.data.outputs.forEach((o, i) => {
    if (!resolve(run.repoRoot, o.output).startsWith(paidRoot)) problems.push(`outputs[${i}]: output ${o.output} is outside public/assets/paid/`);
    if (!haveSource) return;
    const packPath = join(run.sourceRoot, o.pack);
    if (!existsSync(packPath)) { problems.push(`outputs[${i}]: pack file ${o.pack} not found in ${run.sourceRoot}`); return; }
    const img = readPng(packPath); sources[i] = img;
    o.frames.forEach((f, j) => {
      if (f.x + f.w > img.width || f.y + f.h > img.height) problems.push(`outputs[${i}].frames[${j}]: rectangle ${f.x},${f.y} ${f.w}x${f.h} is outside ${o.pack} (${img.width}x${img.height})`);
    });
  });
  if (problems.length) return { problems, written: [] };
  const remap = createRemap(palette.colours), written: string[] = [], sheets: Image[] = [];
  parsed.data.outputs.forEach((o, i) => {
    const sheet = packSheet(sources[i]!, o); remapPixels(sheet.data, remap); sheets.push(sheet);
    const path = resolve(run.repoRoot, o.output); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, encodePng(sheet)); written.push(path);
  });
  if (sheets.length) {
    const path = resolve(run.repoRoot, '.art', 'contact.png'); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(contactSheet(sheets, palette.roles.background))); written.push(path);
  }
  return { problems: [], written };
}
```

- [ ] **Step 6: Create `scripts/art-import.ts`**

```ts
// npm run art:import (Art-i spec section 3): reads art/import.json, the packs from FTLITE_ASSETS (else the owner's folder),
// writes public/assets/paid/ and .art/contact.png. Lists every problem and exits 1 without writing anything if one is found.
import { readFileSync } from 'node:fs';
import { runImport, sourceFolder } from './art/importCore';

const repoRoot = process.cwd();   // npm runs scripts from the package root
const config: unknown = JSON.parse(readFileSync('art/import.json', 'utf8'));
const result = runImport({ repoRoot, sourceRoot: sourceFolder(process.env), config });
if (result.problems.length) {
  console.error(`art:import found ${result.problems.length} problem(s); nothing was written:`);
  for (const p of result.problems) console.error(`  ${p}`);
  process.exitCode = 1;
} else if (!result.written.length) console.log('art:import: art/import.json lists no outputs; nothing to do');
else for (const p of result.written) console.log(`wrote ${p}`);
```

- [ ] **Step 7: Run the tests, the type check and the CLI**

Run: `npx vitest run tests/artImport.test.ts`
Expected: `Tests 10 passed (10)`.

Run: `npx tsc -b`
Expected: no output.

Run: `FTLITE_ASSETS='C:\nope' npm run art:import; echo "exit=$?"`
Expected: `art:import found 1 problem(s); nothing was written:` / `  source folder C:\nope does not exist (set FTLITE_ASSETS)` / `exit=1`.

Run: `mkdir -p "$TEMP/ftlite-empty-assets" && FTLITE_ASSETS="$(cygpath -w "$TEMP/ftlite-empty-assets")" npm run art:import; echo "exit=$?"`
Expected: `art:import: art/import.json lists no outputs; nothing to do` / `exit=0`.

- [ ] **Step 8: Commit**

```bash
git add -- scripts/art/importCore.ts scripts/art-import.ts art/import.json package.json package-lock.json tests/artImport.test.ts
git commit -m "feat(art-i-a): npm run art:import (validate first, OKLab palette remap, contact sheet)

pngjs as a dev dependency for scripts only; art/import.json committed with an empty list.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Final verification and screenshots

**Files:**
- Create (gitignored, never committed): `.art/shots/index.html`, `.art/shots/main.ts`, `.art/shots/vite.config.mjs`, `.art/shots/shot.cjs`, `.art/shots/all.mjs`
- Output (outside the repo): `C:\Users\djuar\FTLite-shots\art-i-a\*.png`

**Interfaces:**
- Consumes: everything above; `createRenderer`, `Renderer.stageScale`, `createInteriorView(assets, stageScale)`, `createSimState(layout, players, seed)` (`sim/state.ts`), `createDuel(layout, seed)` (`sim/duel/state.ts`), `loadAssets(url)`.
- Produces: the test count, the build, four screenshots.

- [ ] **Step 1: Full suite**

Run: `npm run build && npx vitest run 2>&1 | tail -6`
Expected: the total equals the Step 0 baseline total plus the new tests: palette 5, worldFit +9 (12 replace 3), doorModel +1 (8 replace 7), wallModel +6 (10 replace 4), paidManifest 11, tileLayer 2, artGuards 7 + one per `.ts` under `src/renderer/src/render/` (60 in the prototype) + one per `.ts` under `render/` and `app/` (60 + 19), so 146, artImport 10: **+190** when the render folder holds 60 files and the app folder 19 (adjust by the differences in those file counts if master changed them since). The pass and fail counts match the baseline apart from the added passes: 0 failed.

- [ ] **Step 2: Types, build and guards**

Run: `npx tsc -b; echo "tsc exit=$?"`
Expected: `tsc exit=0` and no other output.

Run: `npm run build 2>&1 | tail -2`
Expected: `✓ built in ...`.

Run: `git diff master --stat -- src/renderer/src/sim src/renderer/src/authority src/network src/shared tests/golden; grep -n "SIM_VERSION =" src/renderer/src/sim/tuning.ts`
Expected: the diff stat prints nothing; `SIM_VERSION` is unchanged from master (38 at plan time).

- [ ] **Step 3: Write the screenshot harness** (all files under `.art/shots/`, which `.gitignore` covers)

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
// Art-i-a visual check harness (gitignored, never committed): draws the sector ship or the duel interior with the real
// renderer layers at the window's letterbox stage scale. ?view=sector&ship=skiff|cutter, or ?view=duel.
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import skiff from '../../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { createSimState } from '../../src/renderer/src/sim/state';
import { createDuel } from '../../src/renderer/src/sim/duel/state';
import { Position } from '../../src/renderer/src/sim/components';
import { loadAssets } from '../../src/renderer/src/render/assets';
import { createRenderer } from '../../src/renderer/src/render/renderer';
import { createInteriorView } from '../../src/renderer/src/render/duel/interiorView';

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search), view = q.get('view') ?? 'sector';
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  renderer.resize(window.innerWidth, window.innerHeight);
  if (view === 'duel') {
    for (const child of renderer.app.stage.children) child.visible = false;
    const d = createDuel(parseShip(cutter), 5), interior = createInteriorView(assets, renderer.stageScale);
    renderer.app.stage.addChild(interior.container);
    renderer.app.ticker.add(() => interior.draw(d, d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! })), 1, 1 / 60));
  } else {
    const state = createSimState(parseShip(q.get('ship') === 'cutter' ? cutter : skiff), 2, 1);
    renderer.recordPrev(state);
    renderer.app.ticker.add(() => renderer.draw(state, 1));
  }
  (window as unknown as { shotReady: boolean }).shotReady = true;
}
main().catch((e) => { document.body.textContent = String(e); });
```

`.art/shots/vite.config.mjs`:

```js
// Serves the Art-i-a visual check harness with the repo's public/ assets (gitignored, never committed).
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const repo = resolve(import.meta.dirname, '..', '..');
export default defineConfig({
  root: import.meta.dirname,
  publicDir: resolve(repo, 'public'),
  envDir: false,
  define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify('art-shots') },
  server: { port: 5199, strictPort: true, fs: { allow: [repo] } }
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
    await win.loadURL('about:blank');   // emulating before any page is loaded crashes the renderer
    const dbg = win.webContents.debugger; dbg.attach('1.3');
    // The letterbox reads innerWidth and innerHeight: emulate the target viewport whatever the screen size.
    await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await win.loadURL(url);
    for (let k = 0; k < 100; k++) { if (await win.webContents.executeJavaScript('window.shotReady === true')) break; await new Promise((r) => setTimeout(r, 100)); }
    await new Promise((r) => setTimeout(r, 1500));
    const shot = await dbg.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    log(`wrote ${out} (${width}x${height})`);
    app.quit();
  } catch (e) { log(`failed ${e.stack}`); app.exit(1); }
});
```

`.art/shots/all.mjs`:

```js
// Takes the Art-i-a screenshots (gitignored, never committed). usage: node .art/shots/all.mjs <electron.exe> <out dir>
// Needs the harness server running: npx vite --config .art/shots/vite.config.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [electron, outDir] = process.argv.slice(2);
if (!electron || !outDir) { console.error('usage: node .art/shots/all.mjs <electron.exe> <out dir>'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const shots = [
  ['view=sector&ship=skiff', 1920, 1080, 'sector-skiff-stage1.5.png'],
  ['view=sector&ship=cutter', 1280, 720, 'sector-cutter-stage1.png'],
  ['view=sector&ship=cutter', 2560, 1440, 'sector-cutter-stage2.png'],
  ['view=duel', 1920, 1080, 'duel-interior-stage1.5.png']
];
let failed = 0;
for (const [query, w, h, name] of shots) {
  const out = resolve(outDir, name);
  const env = { ...process.env, SHOT: `http://localhost:5199/?${query}|${w}|${h}|${out}` }; delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(electron, [join(import.meta.dirname, 'shot.cjs')], { env, stdio: 'ignore', timeout: 60000 });
  const ok = r.status === 0 && existsSync(out) && statSync(out).size > 1000;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (${w}x${h}) exit ${r.status}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
```

Check: `git status --short .art` prints nothing (ignored).

- [ ] **Step 4: Take the screenshots**

Start the harness server in the background (keep it running for the next command): `npx vite --config .art/shots/vite.config.mjs`
Expected: `VITE v7... ready` and `Local: http://localhost:5199/`.

Run (Electron needs a desktop session; if the tool sandbox blocks GUI processes, run without the sandbox):

```bash
E=node_modules/electron/dist/electron.exe; [ -f "$E" ] || E=/c/Users/djuar/FTLite/node_modules/electron/dist/electron.exe
node .art/shots/all.mjs "$E" "C:/Users/djuar/FTLite-shots/art-i-a"
```

Expected:

```
ok   sector-skiff-stage1.5.png (1920x1080) exit 0
ok   sector-cutter-stage1.png (1280x720) exit 0
ok   sector-cutter-stage2.png (2560x1440) exit 0
ok   duel-interior-stage1.5.png (1920x1080) exit 0
```

If one fails, read `.art/shots/shot.log`. Stop the Vite server afterwards.

- [ ] **Step 5: Look at the screenshots** (Read each PNG) and check:
  - Skiff at stage 1.5: full size, centred at internal x 272 (screen 408), walls and doors crisp (every edge a whole 3-screen-pixel step), wall top/left light and bottom/right shadow edges visible, floor seams one art pixel wide.
  - Cutter at stage 1: the ship at half size (16 px a tile) centred in the world band (internal 328, 104); crisp.
  - Cutter at stage 2: the ship at scale 0.5 (32 screen px a tile, 2 px per art pixel), centred; crisp.
  - Duel interior at stage 1.5: the Cutter at full size, left of the readout column, crisp; door panels, jambs and seams on the grid.
  Record any visual problem for the owner rather than fixing it here (the owner's look is the gate).

- [ ] **Step 6: Report**

Nothing to commit in this task (the harness and shots are outside version control). Report: the final test totals against the baseline, `tsc` and build results, the four screenshot paths under `C:\Users\djuar\FTLite-shots\art-i-a\`, and any visual observations for the owner's crispness-and-palette gate.

---

## Self-review against the spec

- Section 1 (art bible): Task 1 Step 6 (`docs/art/bible.md`).
- Section 2 (paid assets): regex, licence `paid` excluded from `LICENSE_URLS`, the four paid rules, one name per entry, notices and credits, gitignore, `house.floor.0-3` + `houseFloor`, fallback via `featureReady` — Task 4; the floor fallback in drawing — Task 5.
- Section 3 (import): config, source folder, validate-first with one line per problem and exit 1, OKLab remap with palette-order ties, alpha threshold 128, `public/assets/paid/` outputs, `.art/contact.png` on `background`, determinism, `pngjs` dev dependency, tests for remap / palette membership / determinism / each failure — Task 6.
- Section 4 (pixel-perfect): `snapWorldScale` table, re-centred fits with `x × stage` whole, the same object to callouts and projectiles, resize resets projectile paths — Task 2; `PANEL_THICK` 12 / `BAND` 10, jambs, ticks, seam, bar, panel stroke, quantised slide, stripes, sweep test — Task 3; effects helpers, airlock outline band, seam at `HALF`, vent speck rounding — Task 5; wall light/shadow, floor seams — Tasks 3 and 5; palette roles and ramps, membership test, `0x` grep test, `lowO2`/`impact` roles — Tasks 1 and 5; floor art hook — Task 5.
- Testing and gates: SIM_VERSION and goldens unchanged (Task 5 Step 7, Task 7 Step 2); renderer never reads the sim RNG (Task 5 guard test); screenshots (Task 7).
