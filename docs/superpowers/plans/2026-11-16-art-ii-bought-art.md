# Art-ii (the bought art in the ship interior) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the bought art on screen in the ship interior (sector view and duel interior): one LimeZu character per player, a Maru-98 machine at every console, Pimen explosions on hits, and the palette builder that made the house palette, in the repo and canonical.

**Architecture:** Pure models carry every rule and are unit-tested without a renderer: `scripts/art/buildPalette.ts` (the palette builder, a script), `render/crewArt.ts` (names, facing fold, poses, offsets), new functions in `render/consoleModel.ts` (`stationSides`, `consoleArtName`, `consolePlacement`, `CONSOLE_TINT`) and `render/blastModel.ts` (blast list, centroid, frame from the presentation clock). The Pixi layers read them: `crewSprites.ts` gains a LimeZu path beside the unchanged Puny path, `consoleLayer.ts` takes `assets` and draws turned, tinted sprites in a child container at index 0, and `interiorFeel.ts` gains two options, `consoleArt` (no screen cursor) and `blasts` (a pool of 4 plain Sprites under the flash). Each art piece is an optional feature (`crewArt`, `consoleArt`, `blastArt`); when any of its names is missing, the view draws exactly as today.

**Tech Stack:** Electron 37, PixiJS 8.19.0, TypeScript 5.8, vitest 3.2.7, pngjs 7 and zod 3 (scripts), tsx.

**Spec:** `docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md` (refined to convergence at 6613339; refine run `docs/superpowers/reviews/2026-11-16-art-ii-spec/exchange.md`).

## Global Constraints

- No sim, command, snapshot or authority change: `SIM_VERSION` (39) and every golden stay unchanged; `npx vitest run tests/golden.test.ts tests/duelGolden.test.ts tests/boundary.test.ts` passes untouched. No file under `src/renderer/src/sim`, `src/renderer/src/authority`, `src/network` or `src/shared` changes.
- The renderer never reads the sim RNG (`tests/artGuards.test.ts` adds two tests per new `.ts` file under `render/`: this plan adds `crewArt.ts` and `blastModel.ts`, so +4). pngjs and `scripts/` never reach the renderer.
- One art pixel is 2 world units (`TILE_PX` 32 shows 16 px art at 2x). Sprites are scaled only by 2 and rotated only by quarter turns; every placed top-left is an even world unit.
- Paid manifest entries: licence `paid`, `required: false`, `retrieved: 2026-11-16`, the store URL as `source`, and the credit line. Maru-98 `https://maru-98.itch.io/`, credit `Mars colony pixel art by Maru-98 (maru-98.itch.io)`; LimeZu `https://limezu.itch.io/moderninteriors`, credit `Modern Interiors by LimeZu (limezu.itch.io)`; Pimen `https://pimen.itch.io/explosion-effect`, credit `Explosion VFX by Pimen (pimen.itch.io)`. After any manifest edit run `npm run credits` (`tests/credits.test.ts` checks the generated files).
- The paid PNGs (`public/assets/paid/`) and `.art/` are gitignored and never committed. The packs live outside the repo in `C:\Users\djuar\FTLite-assets` (or `FTLITE_ASSETS`).
- Each feature missing draws exactly as today: `crewArt` missing, the Puny crew (tinted, 8 facings); `consoleArt` missing, the procedural desks, screen strips and cursor blink; `blastArt` missing, no blasts (the Art-i-b flash, shake, smoke and debris remain).
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage files by name (`git add -- <paths>`), never `git add -A`.
- The working copies use CRLF line endings (git `core.autocrlf=true`). Use the Edit tool for changes to existing files; where a step says "replace the whole file", use Write with the content given (git normalises the endings).
- Work happens in the existing worktree `C:\Users\djuar\FTLite\.worktrees\art-ii` on branch `art-ii`. Every command below runs from that worktree's root (Git Bash) unless it says otherwise.

## Prototype verification

The code below was written and run in a scratch worktree outside the repo (`C:\Users\djuar\ftlite-art-ii-proto`, branch `art-ii-proto` from `art-ii` at 6613339, with the signalling junction and a copy of the art-ii worktree's `public/assets/paid/`), then removed. Every new file below is the file that ran, pasted in by script.

| Task | Prototype-verified | Evidence |
|---|---|---|
| 1 palette builder | yes | `buildPalette` 7 passed, `artImport` 13 passed; with the owner's packs `npm run art:palette` wrote 48 colours (7 kept); re-running `art:palette` and `art:import` gave byte-identical `palette.json` and identical PNG hashes |
| 2 crew | yes | `crewArt` 13 passed; frame order checked by eye on the imported `crew_04.png` (Decision 4) |
| 3 consoles | yes | `consoleArt` 10 passed; adding the seven console outputs left `npm run art:palette` byte-identical; the seven PNGs are 12x15, 12x15, 13x16, 13x15, 16x27, 16x23, 24x14 |
| 4 blasts | yes | `blasts` 9 passed; `interiorFeel` 11 and `duelInterior` 4 unchanged and passing |
| 5 docs | no (text only) | — |
| 6 final | yes | full suite `Tests 3530 passed (3530)` in `251 passed (251)` files (baseline 3487 in 247, +43 in +4); `npx tsc -b` clean; `npm run build` ok; the six screenshots were written by the harness below and inspected (crew, turned consoles and a room blast visible in the sector and the duel) |

## Decisions

1. **Task order.** Palette first (Task 1), so every later import uses the final palette; then crew (Task 2), consoles (Task 3, with their one-frame outputs in `art/import.json`), blasts (Task 4), docs (Task 5), verification and screenshots (Task 6).
2. **The palette counts each distinct frame once.** Spec section 4 step 1 says "every opaque pixel of every frame". The builder keys frames by pack and rectangle and counts a repeated one once. Without this, Task 3's seven console outputs (which repeat frames already in `stations.png` and `machines.png`) would change the colour counts, and a later `npm run art:palette` would no longer reproduce the palette Task 1 commits, which breaks the owner-local "git diff empty" check. The prototype confirmed the palette is byte-identical before and after the console outputs. (The floor output repeats one rectangle four times; it is counted once too.)
3. **Palette details the spec leaves to the plan.** The builder is `scripts/art/buildPalette.ts` (pure functions, tested) with a thin CLI `scripts/art-palette.ts` (`npm run art:palette`), the same split as `importCore.ts` and `art-import.ts`. "Current" roles and ramps are read from the committed `palette.json`, so a second run maps every role to itself (the build is a fixed point). Ramp tidying (step 4) drops any repeated colour, keeps the order, and pads to 5 with the palette colours nearest the last entry (palette order breaks ties). Overrides: a role by name; a ramp either whole (an array) or by index (`{ "0": "#fffff0" }`), after which the ramp is tidied again. An override colour that is not in the palette fails the build with a message naming it. The sort key is OKLab lightness, then the RGB number. The file is written as `JSON.stringify(file, null, 2)` plus a newline, with `name` and `source` strings set by the builder. With the owner's packs the result is 48 colours, 7 of them kept from the explosion pack, and differs from the checkpoint as listed in Task 1 Step 7.
4. **LimeZu frame order, verified.** The imported `crew_04.png` (384 x 96, 24 frames per row) was viewed at 8x: frames 0-3 are the standing frames facing right (east), up (back to the camera), left (west), down (facing the camera), and each idle and walk group of 24 has the same order in runs of 6. So frame indices are: stand `e 0, n 1, w 2, s 3`; idle `4 + 6i .. 9 + 6i`; walk `28 + 6i .. 33 + 6i` for i = 0 (e), 1 (n), 2 (w), 3 (s). The measured rows over frames 0-3: lowest opaque row 31 in all four sheets; highest 8 in crew_04, 07, 13 and 7 in crew_19, so `LIMEZU_HEAD_ROW = 7` (the tallest head).
5. **Crew layer paths.** `createCrewLayer` keeps three paths: circles when the Puny `crew` feature is missing (unchanged; this also keeps `tests/onlineRenderer.test.ts`, which passes `{ missing: ['crew.idle.s'] }`, on circles), LimeZu when `crew` and `crewArt` are both ready, else Puny exactly as today. Boarders (`boarderLayer.ts`) are untouched and stay on Puny. The LimeZu path: slot `crewSlot(Owner.pid)` = `pid % 4`; pose from `crewPose(slot, state, facing, seatSide)`: down (downed or dead) is `crew.p<k>.stand.s`, anchor 0.5/0.5, rotation +π/2; seated is `crew.p<k>.stand.<side>` with the side from `stationSides(state)[Seated.station]` (cached per `layoutHash`); still is `crew.p<k>.idle.<facing4>`; moving is `crew.p<k>.walk.<facing4>` started at frame `StableId % 6` as today. Every non-down pose sets anchor 0.5/1 and rotation 0, so getting up restores both. Tint: white for the living, the existing grey `DEAD_TINT` for the dead. Alpha: 0.85 when downed, else 1 (the same rule as today; the dead are opaque, as today).
6. **Things above the head.** `CARRY_LIFT_LIMEZU = (31 - 7) × 2 + 6 = 54` world units (Puny keeps 30). Callouts: `bubbleAnchor` put the bubble's tail tip 0.6 tile (19.2 units) over the crew position, inside a LimeZu head (the head top is (32 - 7) × 2 = 50 units up), so it gains a `lift` parameter (default `CALLOUT_LIFT_PUNY` = 0.6 tile, unchanged) and `callouts.ts` passes `CALLOUT_LIFT_LIMEZU = 54 + 10 = 64` when `crew` and `crewArt` are ready, which also clears a carried torpedo (7 units tall, fins 10.5, centred at 54). Callouts exist only in the sector view.
7. **Names and features.** `CREW_ART_NAMES` (48) lives in `crewArt.ts`; `CONSOLE_ART_NAMES` (`STATION_IDS.map(id => 'console.' + id)`) and `BLAST_NAMES` (`fx.blast.room`, `fx.blast.hit`) in `assetNames.ts`, all registered `optional` there and grouped in `fallback.ts` as `crewArt`, `consoleArt`, `blastArt`. The required Puny `crew.*` names are untouched. The manifest entries are appended by small scripts in the gitignored `.art/` folder, so the 650-odd lines of JSON come from the same functions the tests check (`limezuSheet(k)` for the crew).
8. **Console placement** (`consolePlacement(side, flush, w, h)` in tile-local world units). The art is drawn facing south; rotation `SIDE_ROTATION` = n 0, e +π/2, s π, w −π/2 (clockwise positive, so the art's front points into the room). Its size is `2w × 2h` (n, s) or `2h × 2w` (e, w). The back edge is the turned desk's outer edge: n `top = flush ? -WALL_GAP : 0`, s `bottom = flush ? T + WALL_GAP : T`, w `left = flush ? -WALL_GAP : 0`, e `right = flush ? T + WALL_GAP : T`. Along the wall it starts at `even(T/2 − 2w/2)`, where `even(v) = 2·floor(v/2)` (never −0), so it is centred within one unit. The sprite has anchor 0.5/0.5 and sits at the box centre (`left + width/2`, `top + height/2`; integers, since every size is even), so the quarter turn about its centre lands the art exactly in the box. The rack (54 units deep) and the med pod (48 wide) overlap the neighbouring floor, as the spec accepts.
9. **Console layer.** `createConsoleLayer(assets)` builds `container = [art, g]` (the sprite container at index 0, then the desk Graphics); the views then append the feel's `fixtures`, so the lamps stay on top. With `consoleArt` the Graphics is cleared and stays empty (no desk, no strip), and on each redraw (a look or layout change, as before) the sprites are destroyed and rebuilt: `Sprite(assets.texture(consoleArtName(state, members)))`, anchor 0.5, scale 2, the side's rotation, tint `CONSOLE_TINT` = free `0xffffff`, occupied `0xcccccc` (80 %), down `0x999999` (60 %). Both call sites (`renderer.ts`, `duel/interiorView.ts`) pass `assets`.
10. **The feel's options.** `createInteriorFeel(opts: InteriorFeelOptions)` with `InteriorFeelOptions = { world; band; feel; consoleArt?: boolean; blasts?: Readonly<Record<'room' | 'hit', GameAnimation>> }`. Both views pass `consoleArt: featureReady(missing, 'consoleArt')` and `blasts: featureReady(missing, 'blastArt') ? { room: assets.animation('fx.blast.room'), hit: assets.animation('fx.blast.hit') } : undefined`. With `consoleArt` the cursor rect is skipped; the console glows stay (off for `down`, as today).
11. **Blasts.** Only when `blasts` is given, `above` becomes `[particles.normal, blastLayer, flash]` (without it, `[particles.normal, flash]` as today, so the existing tests' `above.children[1]` flash lookup is unchanged). `blastLayer` holds a pool of `BLAST_CAP` = 4 plain `Sprite`s (anchor 0.5, scale 2, hidden), so the display tree never grows. A blast is `{ kind, x, y, start }` with `start = clock.t`: `onHit` adds one `room` blast per hit room at `roomCentroid` (the mean of its tile centres, each coordinate rounded to an even unit) and, in the duel, one at the centre of the tile the hit smoke already draws from `emitter.random` (no second draw); the breach-openings loop adds one `hit` spark per newly opened site at its tile centre. `addBlast` keeps the newest 4 (a fifth cuts the oldest). Each draw, `liveBlasts` drops the finished ones (frame ≥ frame count) and the sprites show the live ones oldest first with texture `textures[floor((clock.t − start) × fps)]`. The presentation clock holds during the hitstop and while paused (dt 0), so the blasts hold too. `reset()` and `build()` (a layout change) clear them. `explosion-big.png` stays imported and unbound.
12. **Existing tests.** No existing test pins the regenerated palette colours (`tests/palette.test.ts` pins only the override colours, which stay), the crew tint, the console drawing or the `createConsoleLayer()` signature (no test calls it directly; `tests/duelInterior.test.ts` and `tests/tileLayer.test.ts` build their assets with every `FEATURE_NAMES` name missing, so they keep the fallbacks). One existing test changes: `tests/artImport.test.ts` "the committed art/import.json parses and lists no outputs yet (Art-ii fills it)" already fails on `art-ii` (the import checkpoint 274626c filled `art/import.json`); Task 1 replaces it with a check that the committed config parses and writes each output once under `public/assets/paid/`.
13. **Screenshots** reuse the Art-i-b harness approach (a gitignored Vite page in `.art/shots/`, Electron through the `SHOT` environment variable, `about:blank` loaded before the viewport is emulated, port 5299). Six shots at 1920 × 1080: the duel interior, the sector Skiff and the sector Cutter (four players), each `normal` and `hit` (a fire, and a hit every 0.4 s of real time, so a blast is on screen whatever the frame rate); player 0 sits at station 0 on its tile. They go to `C:\Users\djuar\FTLite-shots\art-ii\`.
14. **Test count.** New tests: `buildPalette` 7, `crewArt` 13, `consoleArt` 10, `blasts` 9, `artGuards` +4 (2 new render files); `artImport` keeps 13 (one test replaced): **+43** tests, **+4** test files.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `scripts/art/buildPalette.ts` | create | The palette builder (pure apart from reading packs). |
| `scripts/art-palette.ts` | create | `npm run art:palette`: reads, builds, writes `palette.json`. |
| `art/palette-overrides.json` | create | The fire ramp, the ramp starts and the eight roles fixed by hand. |
| `src/renderer/src/render/palette.json` | regenerate | The canonical palette (48 colours). |
| `src/renderer/src/render/crewArt.ts` | create | LimeZu names, sheet layout, facing fold, poses, offsets (pure). |
| `src/renderer/src/render/blastModel.ts` | create | Blast list, cap, centroid, frame timing (pure). |
| `src/renderer/src/render/consoleModel.ts` | modify | `stationSides`, `consoleArtName`, `SIDE_ROTATION`, `consolePlacement`, `CONSOLE_TINT`. |
| `src/renderer/src/render/crewSprites.ts` | modify (rewrite) | The LimeZu path. |
| `src/renderer/src/render/consoleLayer.ts` | modify (rewrite) | `createConsoleLayer(assets)`, the sprites. |
| `src/renderer/src/render/interiorFeel.ts` | modify | `InteriorFeelOptions`, no cursor with `consoleArt`, the blasts. |
| `src/renderer/src/render/calloutModel.ts`, `callouts.ts` | modify | The callout lift. |
| `src/renderer/src/render/assetNames.ts`, `fallback.ts` | modify | The new optional names and features. |
| `src/renderer/src/render/renderer.ts`, `duel/interiorView.ts` | modify | Pass `assets` to the console layer and the options to the feel. |
| `art/import.json` | modify | Seven one-frame console outputs. |
| `public/assets/manifest.json`, `public/THIRD_PARTY_NOTICES.txt`, `src/renderer/src/render/credits.generated.ts` | modify / regenerate | The paid entries and the credits. |
| `package.json` | modify | `art:palette` script. |
| `docs/art/bible.md`, `docs/gates.md` | modify | "Adding a pack", the palette paragraph, the Art-ii gate and the owner's licence check. |
| `tests/buildPalette.test.ts`, `tests/crewArt.test.ts`, `tests/consoleArt.test.ts`, `tests/blasts.test.ts` | create | New tests. |
| `tests/artImport.test.ts` | modify | The committed-config test (Decision 12). |

---

### Step 0: Worktree and baseline

The worktree already exists with `node_modules`, the signalling junction and the gitignored paid PNGs in `public/assets/paid/` (from `npm run art:import`).

- [ ] **Step 0.1: Confirm the branch and the paid art**

Run: `git rev-parse --abbrev-ref HEAD; git status --short; ls public/assets/paid/*`
Expected: `art-ii`; no status lines except, possibly, this plan if it is not yet committed; `public/assets/paid/limezu` with `crew_04.png crew_07.png crew_13.png crew_19.png`, `public/assets/paid/maru` with `floor.png furniture.png lockers.png machines.png stations.png`, `public/assets/paid/pimen` with `explosion-big.png explosion-hit.png explosion-room.png`.

- [ ] **Step 0.2: Build once** (one test reads `out/main/authorityHost.js`)

Run: `npm run build 2>&1 | tail -1`
Expected: `✓ built in ...` and no error.

- [ ] **Step 0.3: Record the baseline**

Run (on an idle machine): `npx vitest run 2>&1 | tail -6`
Expected at 6613339 plus this plan (docs only): `Tests 1 failed | 3486 passed (3487)` in `Test Files 1 failed | 246 passed (247)`. The one expected failure is `tests/artImport.test.ts > runImport > the committed art/import.json parses and lists no outputs yet (Art-ii fills it)`: it fails on `art-ii` already (Decision 12) and Task 1 replaces it. **Any other failure: stop and report it before Task 1.** Under load the long sim tests can time out (on the planning machine `tests/director.test.ts` "soak" and three `tests/snapshot.test.ts` tests timed out while another session's builds and a stray `tempo.mts` process held the CPU); rerun such a file alone (`npx vitest run tests/director.test.ts`) before calling it a failure. Write down the total.

---

### Task 1: The palette builder, its overrides, and the regenerated palette

**Files:**
- Create: `scripts/art/buildPalette.ts`, `scripts/art-palette.ts`, `art/palette-overrides.json`, `tests/buildPalette.test.ts`
- Modify: `package.json` (scripts), `tests/artImport.test.ts:125-128`
- Regenerate: `src/renderer/src/render/palette.json`; re-import the gitignored `public/assets/paid/**` sheets

**Interfaces:**
- Consumes: `importConfig`, `nearestIndex`, `readPng`, `toOklab`, `sourceFolder`, `type Image`, `type Lab` from `scripts/art/importCore.ts`; `RAMPS`, `ROLES`, `parsePalette`, `type PaletteFile` from `src/renderer/src/render/palette.ts` (all unchanged).
- Produces: `PALETTE_SIZE = 48`, `KEPT_PACK_PREFIX = 'pimen-explosions/'`, `LLOYD_ITERATIONS = 12`, `paletteOverrides` (zod), `countColours(config, read): { counts: Map<number, number>; kept: Set<number> }`, `kmeansCentres(counted, size?): number[]`, `paletteColours(centres, kept): number[]`, `mapRoles(current, colours, overrides)`, `buildPalette({ config, read, current, overrides, size? }): { file; text; kept }`, `packReader(sourceRoot): (pack) => Image`; `npm run art:palette`.

- [ ] **Step 1: Write the failing test** — create `tests/buildPalette.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildPalette, countColours, kmeansCentres, packReader, PALETTE_SIZE } from '../scripts/art/buildPalette';
import { encodePng, type Image } from '../scripts/art/importCore';
import { parsePalette, RAMPS, ROLES } from '../src/renderer/src/render/palette';
import current from '../src/renderer/src/render/palette.json';

/** Generated packs only (Art-ii spec section 4): never the owner's asset folder. */
let root = '';
const png = (rel: string, colours: readonly number[], w = 16): void => {
  const h = Math.ceil(colours.length / w), img: Image = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  colours.forEach((c, i) => img.data.set([(c >> 16) & 255, (c >> 8) & 255, c & 255, 255], i * 4));
  const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, encodePng(img));
};
/** n distinct colours spread over the RGB cube, deterministic. */
const spread = (n: number, salt: number): number[] => Array.from({ length: n }, (_, i) => (((i * 97 + salt) * 2654435761) >>> 8) & 0xffffff);
const KEPT = [0xfffff0, 0xfeef98, 0xf8ca1c, 0xfaae1e, 0xf68420, 0x944510, 0x596686, 0x3a3a50, 0xe06715];
const out = (pack: string, n: number) => ({ pack, frames: [{ x: 0, y: 0, w: 16, h: Math.ceil(n / 16) }], output: `public/assets/paid/t/${pack.replace(/\W/g, '')}.png`, columns: 1 });
const config = { outputs: [out('maru/a.png', 160), out('maru/a.png', 160), out('limezu/b.png', 96), out('pimen-explosions/c.png', KEPT.length)] };
const overrides = {
  roles: { flash: '#fffff0', fireFallback: '#f68420', lampOn: '#f8ca1c', heldTick: '#f8ca1c', ventSpeck: '#fffff0', alert: '#e06715', breach: '#944510', failed: '#e06715' },
  ramps: { fire: ['#fffff0', '#feef98', '#f8ca1c', '#faae1e', '#f68420', '#944510', '#596686', '#3a3a50'], plasma: { 0: '#fffff0' }, electric: { 0: '#fffff0' }, vent: { 0: '#fffff0' } }
};
const run = (cfg: unknown = config, ov: unknown = overrides) => buildPalette({ config: cfg, read: packReader(root), current, overrides: ov });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ftlite-palette-'));
  png('maru/a.png', spread(160, 1)); png('limezu/b.png', spread(96, 7)); png('pimen-explosions/c.png', KEPT);
});
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

describe('the palette builder (Art-ii spec section 4)', () => {
  it('is deterministic: the same packs, config, palette and overrides give the same bytes', () => {
    expect(run().text).toBe(run().text);
  });
  it('keeps every explosion colour exactly and fills the rest with k = 48 minus the kept count', () => {
    const r = run(), colours = r.file.colours.map((h) => parseInt(h.slice(1), 16));
    for (const c of KEPT) expect(colours, c.toString(16)).toContain(c);
    expect(r.kept).toBe(KEPT.length);
    expect(colours).toHaveLength(PALETTE_SIZE);
    expect(new Set(colours).size).toBe(PALETTE_SIZE);
    expect(kmeansCentres(countColours(config, packReader(root)))).toHaveLength(PALETTE_SIZE - KEPT.length);
  });
  it('counts a frame used twice (same pack and rectangle) once', () => {
    const once = countColours({ outputs: [config.outputs[0]] }, packReader(root)), twice = countColours({ outputs: config.outputs.slice(0, 2) }, packReader(root));
    expect([...twice.counts]).toEqual([...once.counts]);
  });
  it('applies the overrides and every role and ramp colour is in the palette', () => {
    const r = run();
    expect(() => parsePalette(r.file)).not.toThrow();
    expect(r.file.roles.failed).toBe('#e06715'); expect(r.file.roles.flash).toBe('#fffff0'); expect(r.file.roles.lampOn).toBe('#f8ca1c');
    expect(r.file.ramps.fire).toEqual(overrides.ramps.fire);
    for (const name of ['plasma', 'electric', 'vent'] as const) { expect(r.file.ramps[name]![0]).toBe('#fffff0'); expect(r.file.ramps[name]!.length).toBeGreaterThanOrEqual(5); }
    expect(Object.keys(r.file.roles)).toEqual([...ROLES]); expect(Object.keys(r.file.ramps)).toEqual([...RAMPS]);
    const colours = new Set(r.file.colours);
    for (const h of [...Object.values(r.file.roles), ...Object.values(r.file.ramps).flat()]) expect(colours.has(h), h).toBe(true);
  });
  it('sorts the palette by OKLab lightness, darkest first', () => {
    const c = run().file.colours;
    expect(c[0]).not.toBe('#fffff0'); expect(c.at(-1)).toBe('#fffff0');
  });
  it('refuses an override colour that is not in the palette', () => {
    expect(() => run(config, { roles: { flash: '#010203' } })).toThrow(/override role flash #010203 is not in the palette/);
  });
  it('fails with 48 or more kept colours', () => {
    png('pimen-explosions/many.png', spread(48, 3));
    expect(() => run({ outputs: [out('maru/a.png', 160), out('pimen-explosions/many.png', 48)] })).toThrow(/48 kept colours leave no room/);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/buildPalette.test.ts 2>&1 | tail -8`
Expected: FAIL, `Failed to load url ../scripts/art/buildPalette` (or "Cannot find module"), 0 tests run.

- [ ] **Step 3: Write the builder** — create `scripts/art/buildPalette.ts`:

```ts
// The house palette builder (Art-ii spec section 4), canonical from Art-ii on: every opaque pixel of every distinct frame
// in art/import.json, counted per colour; the explosion pack's colours kept exactly; k-means in OKLab over the rest for
// 48 colours in all; the roles and ramps of the current palette mapped onto the new colours; art/palette-overrides.json
// applied last. Deterministic: the same packs, config, current palette and overrides give the same bytes.
// Scripts only (pngjs is a dev dependency); the renderer never imports this file.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { importConfig, nearestIndex, readPng, toOklab, type Image, type Lab } from './importCore';
import { RAMPS, ROLES, parsePalette, type PaletteFile } from '../../src/renderer/src/render/palette';

/** The palette's size: kept colours plus k-means centres. */
export const PALETTE_SIZE = 48;
/** Outputs whose pack path starts with this keep their colours exactly (the explosion pack: fire, flash, lamp). */
export const KEPT_PACK_PREFIX = 'pimen-explosions/';
export const LLOYD_ITERATIONS = 12;
const RAMP_MIN = 5;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
/** Overrides: a role by name; a ramp by name, either whole (an array) or entry by entry ({ "0": "#fffff0" }). */
export const paletteOverrides = z.object({
  $comment: z.string().optional(),
  roles: z.record(z.enum(ROLES), hex).default({}),
  ramps: z.record(z.enum(RAMPS), z.union([z.array(hex).min(RAMP_MIN).max(8), z.record(z.string().regex(/^\d$/), hex)])).default({})
}).strict();
export type PaletteOverrides = z.infer<typeof paletteOverrides>;

const toHex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const labOf = (c: number): Lab => toOklab((c >> 16) & 255, (c >> 8) & 255, c & 255);
const dist2 = (a: Lab, b: Lab): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export interface ColourCounts { counts: Map<number, number>; kept: Set<number> }

/** Step 1: count every opaque pixel (alpha >= 128) of every distinct frame (same pack and rectangle counted once) per
 *  RGB colour; colours of outputs under KEPT_PACK_PREFIX are kept. `read` loads a pack (cached per pack). */
export function countColours(config: unknown, read: (pack: string) => Image): ColourCounts {
  const parsed = importConfig.parse(config), counts = new Map<number, number>(), kept = new Set<number>(), seen = new Set<string>(), packs = new Map<string, Image>();
  for (const o of parsed.outputs) {
    const keep = o.pack.startsWith(KEPT_PACK_PREFIX);
    let img = packs.get(o.pack);
    if (!img) { img = read(o.pack); packs.set(o.pack, img); }
    for (const f of o.frames) {
      const key = `${o.pack}|${f.x}|${f.y}|${f.w}|${f.h}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
        const i = (y * img.width + x) * 4;
        if (img.data[i + 3]! < 128) continue;
        const c = (img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!;
        counts.set(c, (counts.get(c) ?? 0) + 1);
        if (keep) kept.add(c);
      }
    }
  }
  return { counts, kept };
}

/** Step 2: k-means in OKLab over the non-kept colours, k = size minus the kept count. Farthest-point start from the most
 *  frequent colour, weighting (squared distance to the nearest centre, kept colours included) by ln(1 + count); ties to
 *  the earlier colour in (count descending, RGB ascending) order. Then up to 12 Lloyd iterations, each centre snapping to
 *  the member colour nearest its cluster's weighted mean; an empty cluster keeps its centre; stops when nothing moves. */
export function kmeansCentres({ counts, kept }: ColourCounts, size = PALETTE_SIZE): number[] {
  if (kept.size >= size) throw new Error(`art:palette: ${kept.size} kept colours leave no room for k-means (the palette holds ${size}; fewer than ${size} kept colours are needed)`);
  const k = size - kept.size;
  const order = [...counts.keys()].filter((c) => !kept.has(c)).sort((a, b) => counts.get(b)! - counts.get(a)! || a - b);
  if (order.length <= k) return order;
  const labs = order.map(labOf), weight = order.map((c) => Math.log(1 + counts.get(c)!));
  const near = labs.map((l) => Math.min(Infinity, ...[...kept].map((c) => dist2(l, labOf(c)))));
  const centres: number[] = [];   // indices into order
  const take = (i: number): void => { centres.push(i); labs.forEach((l, j) => { near[j] = Math.min(near[j]!, dist2(l, labs[i]!)); }); };
  take(0);
  while (centres.length < k) {
    let best = -1, bestScore = 0;
    for (let j = 0; j < order.length; j++) { const s = near[j]! * weight[j]!; if (s > bestScore) { best = j; bestScore = s; } }
    if (best < 0) break;   // every colour is already a centre
    take(best);
  }
  for (let it = 0; it < LLOYD_ITERATIONS; it++) {
    const centreLabs = centres.map((i) => labs[i]!), members: number[][] = centres.map(() => []);
    labs.forEach((l, j) => members[nearestIndex(centreLabs, l)]!.push(j));
    let moved = false;
    const next = centres.map((c, m) => {
      const list = members[m]!;
      if (!list.length) return c;
      let w = 0; const mean = [0, 0, 0];
      for (const j of list) { const cw = counts.get(order[j]!)!; w += cw; for (let a = 0; a < 3; a++) mean[a]! += labs[j]![a]! * cw; }
      const target: Lab = [mean[0]! / w, mean[1]! / w, mean[2]! / w];
      const snapped = list[nearestIndex(list.map((j) => labs[j]!), target)]!;
      if (snapped !== c) moved = true;
      return snapped;
    });
    centres.splice(0, centres.length, ...next);
    if (!moved) break;
  }
  return centres.map((i) => order[i]!);
}

/** Step 3: centres plus kept colours, deduplicated, sorted by OKLab lightness (then RGB). */
export function paletteColours(centres: readonly number[], kept: ReadonlySet<number>): number[] {
  return [...new Set([...centres, ...kept])].sort((a, b) => labOf(a)[0] - labOf(b)[0] || a - b);
}

/** Drops repeats, then pads to 5 with the palette colours nearest the last entry (palette order breaks ties). */
function tidyRamp(ramp: readonly number[], colours: readonly number[]): number[] {
  const out = [...new Set(ramp)];
  if (out.length >= RAMP_MIN) return out;
  const last = labOf(out[out.length - 1]!);
  const rest = colours.filter((c) => !out.includes(c)).map((c, i) => ({ c, i, d: dist2(labOf(c), last) })).sort((a, b) => a.d - b.d || a.i - b.i);
  for (const r of rest) { if (out.length >= RAMP_MIN) break; out.push(r.c); }
  return out;
}

/** Steps 4-5: each current role and ramp colour mapped to its nearest palette colour, ramps tidied; then the overrides
 *  (every override colour must be in the palette). */
export function mapRoles(current: PaletteFile, colours: readonly number[], overrides: PaletteOverrides): { roles: Record<string, string>; ramps: Record<string, string[]> } {
  const labs = colours.map(labOf), near = (h: string): number => colours[nearestIndex(labs, labOf(parseInt(h.slice(1), 16)))]!;
  const inPalette = new Set(colours), problems: string[] = [];
  const pick = (where: string, h: string): number => { const n = parseInt(h.slice(1), 16); if (!inPalette.has(n)) problems.push(`${where} ${h} is not in the palette`); return n; };
  const roles: Record<string, number> = {};
  for (const r of ROLES) { const h = current.roles[r]; if (h === undefined) throw new Error(`art:palette: the current palette has no role ${r}`); roles[r] = near(h); }
  const ramps: Record<string, number[]> = {};
  for (const name of RAMPS) ramps[name] = tidyRamp((current.ramps[name] ?? []).map(near), colours);
  for (const [r, h] of Object.entries(overrides.roles)) roles[r] = pick(`override role ${r}`, h!);
  for (const [name, o] of Object.entries(overrides.ramps)) {
    if (Array.isArray(o)) ramps[name] = o.map((h, i) => pick(`override ramp ${name}[${i}]`, h));
    else { const ramp = [...ramps[name]!]; for (const [i, h] of Object.entries(o)) ramp[Number(i)] = pick(`override ramp ${name}[${i}]`, h); ramps[name] = tidyRamp(ramp, colours); }
  }
  if (problems.length) throw new Error(`art:palette: ${problems.join('; ')}`);
  return {
    roles: Object.fromEntries(ROLES.map((r) => [r, toHex(roles[r]!)])),
    ramps: Object.fromEntries(RAMPS.map((n) => [n, ramps[n]!.map(toHex)]))
  };
}

export interface PaletteRun { config: unknown; read: (pack: string) => Image; current: PaletteFile; overrides: unknown; size?: number }

/** The whole build: returns the palette file (checked by parsePalette) and its exact bytes. */
export function buildPalette(run: PaletteRun): { file: PaletteFile & { name: string; source: string }; text: string; kept: number } {
  const counted = countColours(run.config, run.read);
  const colours = paletteColours(kmeansCentres(counted, run.size ?? PALETTE_SIZE), counted.kept);
  const { roles, ramps } = mapRoles(run.current, colours, paletteOverrides.parse(run.overrides));
  const file = {
    name: `FTLite house palette (${colours.length} colours, built by npm run art:palette from the art/import.json frames)`,
    source: 'k-means in OKLab over the art/import.json frames (scripts/art/buildPalette.ts); explosion colours kept exact; roles and ramps mapped from the previous palette; art/palette-overrides.json applied (Art-ii)',
    colours: colours.map(toHex), roles, ramps
  };
  parsePalette(file);
  return { file, text: `${JSON.stringify(file, null, 2)}\n`, kept: counted.kept.size };
}

/** Reads packs from the asset source folder; a missing pack is an error naming it. */
export function packReader(sourceRoot: string): (pack: string) => Image {
  return (pack) => {
    const p = join(sourceRoot, pack);
    if (!existsSync(p)) throw new Error(`art:palette: pack file ${pack} not found in ${sourceRoot} (set FTLITE_ASSETS)`);
    return readPng(p);
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/buildPalette.test.ts 2>&1 | tail -5`
Expected: `Tests 7 passed (7)`.

- [ ] **Step 5: The CLI, the overrides and the npm script**

Create `scripts/art-palette.ts`:

```ts
// npm run art:palette (Art-ii spec section 4): rebuilds src/renderer/src/render/palette.json from the art/import.json
// frames in FTLITE_ASSETS (else the owner's folder), the current palette's roles and ramps, and art/palette-overrides.json.
// Run npm run art:import afterwards so the sheets use the new palette. Exits 1 without writing anything on a problem.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildPalette, packReader } from './art/buildPalette';
import { sourceFolder } from './art/importCore';

const PALETTE = 'src/renderer/src/render/palette.json';
try {
  const result = buildPalette({
    config: JSON.parse(readFileSync('art/import.json', 'utf8')),
    read: packReader(sourceFolder(process.env)),
    current: JSON.parse(readFileSync(PALETTE, 'utf8')),
    overrides: JSON.parse(readFileSync('art/palette-overrides.json', 'utf8'))
  });
  writeFileSync(PALETTE, result.text);
  console.log(`wrote ${PALETTE} (${result.file.colours.length} colours, ${result.kept} kept from the explosion pack)`);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
```

Create `art/palette-overrides.json`:

```json
{
  "$comment": "npm run art:palette (Art-ii spec section 4): applied after the roles and ramps are mapped onto the new colours. A ramp given as an array replaces it whole; as an object it replaces entries by index. Every colour here must be in the built palette.",
  "roles": {
    "flash": "#fffff0",
    "fireFallback": "#f68420",
    "lampOn": "#f8ca1c",
    "heldTick": "#f8ca1c",
    "ventSpeck": "#fffff0",
    "alert": "#e06715",
    "breach": "#944510",
    "failed": "#e06715"
  },
  "ramps": {
    "fire": ["#fffff0", "#feef98", "#f8ca1c", "#faae1e", "#f68420", "#944510", "#596686", "#3a3a50"],
    "plasma": { "0": "#fffff0" },
    "electric": { "0": "#fffff0" },
    "vent": { "0": "#fffff0" }
  }
}
```

In `package.json`, replace

```json
    "art:import": "tsx scripts/art-import.ts"
```

with

```json
    "art:import": "tsx scripts/art-import.ts",
    "art:palette": "tsx scripts/art-palette.ts"
```

- [ ] **Step 6: Fix the committed-config test** (it fails on the branch already, Decision 12)

In `tests/artImport.test.ts`, replace

```ts
  it('the committed art/import.json parses and lists no outputs yet (Art-ii fills it)', () => {
    expect(committed.outputs).toEqual([]);
    expect(runImport({ repoRoot: repo, sourceRoot: source, config: committed })).toEqual({ problems: [], written: [] });
  });
```

with

```ts
  it('the committed art/import.json parses and writes each output once, under public/assets/paid/ (Art-ii)', () => {
    const parsed = importConfig.parse(committed);
    expect(parsed.outputs.length).toBeGreaterThan(0);
    for (const o of parsed.outputs) expect(o.output.startsWith('public/assets/paid/'), o.output).toBe(true);
    expect(new Set(parsed.outputs.map((o) => o.output)).size).toBe(parsed.outputs.length);
  });
```

and in its import line replace `import { createRemap, encodePng, nearestIndex,` with `import { createRemap, encodePng, importConfig, nearestIndex,`.

- [ ] **Step 7: Regenerate the palette and re-import** (needs the owner's packs in `C:\Users\djuar\FTLite-assets`)

Run: `npm run art:palette`
Expected: `wrote src/renderer/src/render/palette.json (48 colours, 7 kept from the explosion pack)`.

Run: `git diff --stat -- src/renderer/src/render/palette.json; git diff -- src/renderer/src/render/palette.json | grep '^[-+] ' | grep -v '"name"\|"source"'`
Expected: `1 file changed, 17 insertions(+), 11 deletions(-)` and exactly these colour changes: added `#4c4c4c`, `#6c6e85`, `#b2736d`, `#d68143`, `#a6a7a8`, `#9cc2c2`, `#c7c7c7`, `#d1dede`; removed `#616e7e`, `#a4b4b7`; roles `floorSeam` and `ambient` `#a4b4b7` → `#a6a7a8`, `wallLight` and `lampOff` `#616e7e` → `#6c6e85`, `failed` `#c3bc6d` → `#e06715`; ramp `vent` entries `#a4b4b7` → `#a6a7a8` and `#616e7e` → `#6c6e85`. (If the packs differ from the owner's 2026-11-16 copies the colours may differ; the counts in the first line must still read 48 and 7. Report a difference rather than editing the palette by hand.)

Run: `npm run art:import 2>&1 | tail -14`
Expected: 13 `wrote` lines: the 12 sheets under `public/assets/paid/` and `.art/contact.png`.

- [ ] **Step 8: Check determinism** (the spec's owner-local acceptance check)

Run:

```bash
cp src/renderer/src/render/palette.json .art/palette.first.json
md5sum public/assets/paid/*/*.png > .art/paid.first.md5
npm run art:palette > /dev/null && npm run art:import > /dev/null
cmp src/renderer/src/render/palette.json .art/palette.first.json && md5sum -c --quiet .art/paid.first.md5 && echo DETERMINISTIC
```

Expected: `DETERMINISTIC`.

- [ ] **Step 9: Run the related tests**

Run: `npx vitest run tests/buildPalette.test.ts tests/artImport.test.ts tests/palette.test.ts tests/artGuards.test.ts tests/gradeModel.test.ts tests/lightsModel.test.ts tests/tileLayer.test.ts 2>&1 | tail -5`
Expected: all pass; `buildPalette` 7, `artImport` 13, `palette` 5.

Run: `npx tsc -b; echo "tsc exit=$?"`
Expected: `tsc exit=0`.

- [ ] **Step 10: Commit**

```bash
git add -- scripts/art/buildPalette.ts scripts/art-palette.ts art/palette-overrides.json package.json src/renderer/src/render/palette.json tests/buildPalette.test.ts tests/artImport.test.ts
git commit -m "$(cat <<'EOF'
feat(art-ii): palette builder in the repo (npm run art:palette), overrides, regenerated 48-colour palette

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The LimeZu crew, one character per player

**Files:**
- Create: `src/renderer/src/render/crewArt.ts`, `tests/crewArt.test.ts`, `.art/add-crew.ts` (gitignored, not committed)
- Modify: `src/renderer/src/render/assetNames.ts`, `src/renderer/src/render/fallback.ts`, `src/renderer/src/render/consoleModel.ts` (append), `src/renderer/src/render/crewSprites.ts` (rewrite), `src/renderer/src/render/calloutModel.ts:45-49`, `src/renderer/src/render/callouts.ts`, `public/assets/manifest.json` (by script)
- Regenerate: `public/THIRD_PARTY_NOTICES.txt`, `src/renderer/src/render/credits.generated.ts` (`npm run credits`)

**Interfaces:**
- Consumes: `consoles(state)`, `type Side` from `consoleModel.ts`; `featureReady`, `FEATURE_NAMES`; `type Facing8` from `assetNames.ts`.
- Produces:
  - `crewArt.ts`: `type Facing4 = 'n' | 'e' | 's' | 'w'`; `LIMEZU_DIRS = ['e', 'n', 'w', 's']`; `CREW_SHEETS = ['04', '07', '13', '19']`; `CREW_SLOTS = 4`; `LIMEZU_STAND = 0`, `LIMEZU_IDLE = 4`, `LIMEZU_WALK = 28`, `LIMEZU_RUN = 6`, `LIMEZU_IDLE_FPS = 6`, `LIMEZU_WALK_FPS = 10`; `LIMEZU_FRAME_H = 32`, `LIMEZU_FOOT_ROW = 31`, `LIMEZU_HEAD_ROW = 7`; `footAnchorY(row, frameH)`; `LIMEZU_ANCHOR_Y = 1`; `CARRY_LIFT_PUNY = 30`, `CARRY_LIFT_LIMEZU = 54`, `CALLOUT_LIFT_LIMEZU = 64`; `crewSlot(pid)`; `facing4(f: Facing8): Facing4`; `crewStandName/crewIdleName/crewWalkName(slot, d)`; `CREW_ART_NAMES` (48); `limezuSheet(slot)`; `type CrewPoseState = 'down' | 'seated' | 'idle' | 'walk'`; `interface CrewPose { name; animated; anchorY; rotation }`; `crewPose(slot, state, facing, seatSide): CrewPose`.
  - `consoleModel.ts`: `stationSides(state: SimState): Side[]` (indexed by station).
  - `calloutModel.ts`: `CALLOUT_LIFT_PUNY = 0.6 * TILE_PX`; `bubbleAnchor(state, pid, fit, lift = CALLOUT_LIFT_PUNY)`.
  - `fallback.ts`: feature `'crewArt'` = `CREW_ART_NAMES`.

- [ ] **Step 1: Write the failing test** — create `tests/crewArt.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { AnimatedSprite, Graphics, Texture } from 'pixi.js';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Life, LifeState, Owner, Position, Seated } from '../src/renderer/src/sim/components';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { parseManifest } from '../src/renderer/src/render/manifest';
import { ASSET_NAMES, FACINGS } from '../src/renderer/src/render/assetNames';
import { FEATURE_NAMES, featureReady } from '../src/renderer/src/render/fallback';
import type { GameAnimation, GameAssets } from '../src/renderer/src/render/assets';
import { createRenderMemory } from '../src/renderer/src/render/memory';
import { createCrewLayer, CREW_COLORS } from '../src/renderer/src/render/crewSprites';
import { bubbleAnchor, CALLOUT_LIFT_PUNY } from '../src/renderer/src/render/calloutModel';
import { consoles, stationSides } from '../src/renderer/src/render/consoleModel';
import {
  CALLOUT_LIFT_LIMEZU, CARRY_LIFT_LIMEZU, CARRY_LIFT_PUNY, CREW_ART_NAMES, CREW_SHEETS, crewPose, crewSlot, facing4, footAnchorY, limezuSheet,
  LIMEZU_ANCHOR_Y, LIMEZU_FOOT_ROW, LIMEZU_HEAD_ROW
} from '../src/renderer/src/render/crewArt';
import { TILE_PX } from '../src/shared/resolution';
import { cutterState, RECRUITS } from './helpers/sim';
import { createSimState } from './helpers/simLifetime';

// AnimatedSprite.play() starts Pixi's shared ticker, which needs requestAnimationFrame (absent in node).
beforeAll(() => {
  const g = globalThis as { requestAnimationFrame?: (cb: () => void) => number; cancelAnimationFrame?: (id: number) => void };
  g.requestAnimationFrame ??= () => 0; g.cancelAnimationFrame ??= () => undefined;
});

/** Assets with every LimeZu and Puny name bound to its own named texture, and the other optional features missing. */
function fakeAssets(withCrewArt: boolean): GameAssets {
  const tex = new Map<string, Texture>(), named = (n: string): Texture => { let t = tex.get(n); if (!t) { t = new Texture(); t.label = n; tex.set(n, t); } return t; };
  const anim = (n: string): GameAnimation => ({ textures: Array.from({ length: 6 }, (_, i) => named(`${n}#${i}`)), fps: 6, loop: true });
  const missing = Object.values(FEATURE_NAMES).flat().filter((n) => !n.startsWith('crew.') || (!withCrewArt && CREW_ART_NAMES.includes(n)));
  return {
    has: (n) => !missing.includes(n), missing, fontFamily: 'm5x7',
    texture: (n) => { if (missing.includes(n)) throw new Error(`missing ${n}`); return named(n); },
    animation: (n) => { if (missing.includes(n)) throw new Error(`missing ${n}`); return anim(n); },
    nineSlice: (n) => { throw new Error(`no nine-slice ${n}`); }
  };
}
const spriteOf = (layer: ReturnType<typeof createCrewLayer>, i: number): AnimatedSprite => layer.container.children.filter((c) => c instanceof AnimatedSprite)[i] as AnimatedSprite;
const carriedOf = (layer: ReturnType<typeof createCrewLayer>, i: number): Graphics => (layer.container.children.find((c) => !(c instanceof AnimatedSprite)) as unknown as { children: Graphics[] }).children[i]!;

describe('the bought crew model (Art-ii spec section 1)', () => {
  it('folds eight facings to LimeZu four: n and s stay, east-ish to e, west-ish to w', () => {
    expect(FACINGS.map(facing4)).toEqual(['n', 'e', 'e', 'e', 's', 'w', 'w', 'w']);   // n ne e se s sw w nw
  });
  it('player slot pid % 4 picks sheet 04, 07, 13, 19', () => {
    expect([0, 1, 2, 3, 4, 5].map(crewSlot)).toEqual([0, 1, 2, 3, 0, 1]);
    expect(CREW_SHEETS).toEqual(['04', '07', '13', '19']);
  });
  it('the foot anchor and the carry offset come from the measured rows', () => {
    expect([LIMEZU_FOOT_ROW, LIMEZU_HEAD_ROW]).toEqual([31, 7]);
    expect(footAnchorY(LIMEZU_FOOT_ROW, 32)).toBe(1); expect(LIMEZU_ANCHOR_Y).toBe(1);
    expect([CARRY_LIFT_PUNY, CARRY_LIFT_LIMEZU]).toEqual([30, 54]);
    expect(CALLOUT_LIFT_LIMEZU).toBe(64);
  });
  it('poses: idle and walk by the 4-way facing, seated the standing frame facing the wall, down the standing s frame turned +90 degrees about its centre', () => {
    expect(crewPose(2, 'idle', 'ne', null)).toEqual({ name: 'crew.p2.idle.e', animated: true, anchorY: 1, rotation: 0 });
    expect(crewPose(1, 'walk', 'sw', null)).toEqual({ name: 'crew.p1.walk.w', animated: true, anchorY: 1, rotation: 0 });
    expect(crewPose(0, 'seated', 's', 'n')).toEqual({ name: 'crew.p0.stand.n', animated: false, anchorY: 1, rotation: 0 });
    expect(crewPose(3, 'down', 'e', null)).toEqual({ name: 'crew.p3.stand.s', animated: false, anchorY: 0.5, rotation: Math.PI / 2 });
  });
  it('registers the 48 per-slot names as optional, grouped as crewArt, apart from the Puny crew names', () => {
    expect(CREW_ART_NAMES).toHaveLength(48);
    for (const n of CREW_ART_NAMES) expect(ASSET_NAMES[n], n).toBe('optional');
    expect(FEATURE_NAMES.crewArt).toEqual([...CREW_ART_NAMES]);
    expect(FEATURE_NAMES.crew.some((n) => CREW_ART_NAMES.includes(n))).toBe(false);
    expect(featureReady(new Set(['crew.p3.walk.s']), 'crewArt')).toBe(false);
  });
  it('the manifest binds each sheet with stand 0-3, idle 4-27 and walk 28-51 in LimeZu order right, up, left, down', () => {
    const sheet = limezuSheet(1);
    expect(sheet.frames).toEqual({ 'crew.p1.stand.e': 0, 'crew.p1.stand.n': 1, 'crew.p1.stand.w': 2, 'crew.p1.stand.s': 3 });
    expect(sheet.animations['crew.p1.idle.n']).toEqual({ frames: [10, 11, 12, 13, 14, 15], fps: 6, loop: true });
    expect(sheet.animations['crew.p1.walk.s']).toEqual({ frames: [46, 47, 48, 49, 50, 51], fps: 10, loop: true });
    const real = parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
    CREW_SHEETS.forEach((s, k) => {
      const e = real.find((x) => x.file === `paid/limezu/crew_${s}.png`)!;
      expect(e.license).toBe('paid'); expect(e.required).toBe(false);
      expect(e.source).toBe('https://limezu.itch.io/moderninteriors'); expect(e.retrieved).toBe('2026-11-16');
      expect(e.credit).toBe('Modern Interiors by LimeZu (limezu.itch.io)');
      expect(e.sheet).toEqual(limezuSheet(k));
    });
  });
  it('stationSides: every station has its console wall side, and a group\'s members share it', () => {
    const s = createSimState(parseShip(skiff), 2, 1, RECRUITS), sides = stationSides(s);
    expect(sides).toHaveLength(s.derived.stationTile.length);
    for (const c of consoles(s)) for (const m of c.members) expect(sides[m]).toBe(c.side);
    const helm = consoles(s).find((c) => c.members.length === 2)!;
    expect(sides[helm.members[0]!]).toBe(sides[helm.members[1]!]);
  });
  it('the callout tail sits over the head: 0.6 tile over Puny, 64 units over the bought crew', () => {
    const s = cutterState(), eid = s.crew[0]!, fit = { scale: 1, x: 0, y: 0 };
    expect(CALLOUT_LIFT_PUNY).toBeCloseTo(0.6 * TILE_PX);
    expect(bubbleAnchor(s, 0, fit).y).toBeCloseTo((Position.y[eid]! - 0.6) * TILE_PX);
    expect(bubbleAnchor(s, 0, fit, CALLOUT_LIFT_LIMEZU).y).toBeCloseTo(Position.y[eid]! * TILE_PX - 64);
  });
});

describe('the crew layer with the bought crew (Art-ii spec section 1)', () => {
  it('each player wears their slot\'s character, untinted, feet on the crew position; dead crew stay grey', () => {
    const s = cutterState(), layer = createCrewLayer(fakeAssets(true), createRenderMemory());
    layer.draw(s, 1);
    s.crew.forEach((eid, i) => {
      const sp = spriteOf(layer, i);
      expect(sp.texture.label).toBe(`crew.p${crewSlot(Owner.pid[eid]!)}.idle.s#0`);
      expect(sp.tint).toBe(0xffffff); expect([sp.anchor.x, sp.anchor.y]).toEqual([0.5, 1]); expect(sp.rotation).toBe(0);
    });
    Life.state[s.crew[1]!] = LifeState.Dead; layer.draw(s, 1);
    expect(spriteOf(layer, 1).tint).toBe(0x777777);
  });
  it('downed: the standing s frame turned +90 degrees about its centre at 85 % alpha; getting up restores the foot anchor and rotation 0', () => {
    const s = cutterState(), layer = createCrewLayer(fakeAssets(true), createRenderMemory()), eid = s.crew[0]!;
    Life.state[eid] = LifeState.Downed; layer.draw(s, 1);
    const sp = spriteOf(layer, 0);
    expect(sp.texture.label).toBe('crew.p0.stand.s'); expect(sp.rotation).toBeCloseTo(Math.PI / 2);
    expect([sp.anchor.x, sp.anchor.y]).toEqual([0.5, 0.5]); expect(sp.alpha).toBe(0.85);
    Life.state[eid] = LifeState.Conscious; layer.draw(s, 1);
    expect(sp.rotation).toBe(0); expect(sp.anchor.y).toBe(1); expect(sp.alpha).toBe(1);
  });
  it('seated: the standing frame facing the console\'s wall side', () => {
    const s = cutterState(), layer = createCrewLayer(fakeAssets(true), createRenderMemory());
    const nav = s.derived.stationOfKind[StationKind.Navigation]!;
    sitDown(s, 0, nav); expect(Seated.station[s.crew[0]!]).toBe(nav);
    layer.draw(s, 1);
    expect(spriteOf(layer, 0).texture.label).toBe(`crew.p0.stand.${stationSides(s)[nav]}`);
    expect(stationSides(s)[nav]).toBe('e');   // the Cutter's Bridge console against the bow wall
  });
  it('the carried torpedo rides 54 units over the bought crew, 30 over Puny', () => {
    for (const [art, lift] of [[true, CARRY_LIFT_LIMEZU], [false, CARRY_LIFT_PUNY]] as const) {
      const s = cutterState(), layer = createCrewLayer(fakeAssets(art), createRenderMemory());
      s.carrying[Owner.pid[s.crew[0]!]!] = 1; layer.draw(s, 1);
      const g = carriedOf(layer, 0), sp = spriteOf(layer, 0);
      expect(g.visible).toBe(true); expect(sp.y - g.y).toBeCloseTo(lift);
    }
  });
  it('without crewArt the Puny crew draw as before: tinted per player, the Puny anchor', () => {
    const s = cutterState(), layer = createCrewLayer(fakeAssets(false), createRenderMemory());
    layer.draw(s, 1);
    const sp = spriteOf(layer, 0);
    expect(sp.texture.label).toBe('crew.idle.s'); expect(sp.tint).toBe(CREW_COLORS[Owner.pid[s.crew[0]!]! % 4]); expect(sp.anchor.y).toBe(0.75);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/crewArt.test.ts 2>&1 | tail -8`
Expected: FAIL, `Failed to load url ../src/renderer/src/render/crewArt`.

- [ ] **Step 3: The crew model** — create `src/renderer/src/render/crewArt.ts`:

```ts
// The bought crew (Art-ii spec section 1): one LimeZu Modern Interiors character per player, four facings, standing,
// idle and walk. Pure: the names, the pose per crew state and the offsets above the head. No Pixi.
import type { Facing8 } from './assetNames';
import type { Side } from './consoleModel';

export type Facing4 = 'n' | 'e' | 's' | 'w';
/** LimeZu's direction order inside each group of the sheet (right, up, left, down). */
export const LIMEZU_DIRS: readonly Facing4[] = ['e', 'n', 'w', 's'];
/** The premade characters, by slot (Owner.pid % 4): sheet crew_04, 07, 13, 19. */
export const CREW_SHEETS = ['04', '07', '13', '19'] as const;
export const CREW_SLOTS = CREW_SHEETS.length;
/** Frame layout of each imported sheet (art/import.json): 0-3 standing, 4-27 idle, 28-51 walk; 6 frames per direction. */
export const LIMEZU_STAND = 0, LIMEZU_IDLE = 4, LIMEZU_WALK = 28, LIMEZU_RUN = 6;
export const LIMEZU_IDLE_FPS = 6, LIMEZU_WALK_FPS = 10;
/** A frame is 16 x 32 art pixels. Measured offline (Art-ii planning, 2026-11-16) over the standing frames 0-3 of all four
 *  imported sheets: the lowest opaque row is 31 in every sheet; the highest is 8 in crew_04, 07 and 13 and 7 in crew_19
 *  (7 is used, the tallest head). */
export const LIMEZU_FRAME_H = 32, LIMEZU_FOOT_ROW = 31, LIMEZU_HEAD_ROW = 7;

/** Anchor y that puts a frame's foot row on the sprite position. */
export const footAnchorY = (footRow: number, frameH: number): number => (footRow + 1) / frameH;
export const LIMEZU_ANCHOR_Y = footAnchorY(LIMEZU_FOOT_ROW, LIMEZU_FRAME_H);   // 1
/** World units above the crew position: the carried torpedo (30 over Puny), and the callout bubble's tail. */
export const CARRY_LIFT_PUNY = 30;
export const CARRY_LIFT_LIMEZU = (LIMEZU_FOOT_ROW - LIMEZU_HEAD_ROW) * 2 + 6;   // 54: 6 units over the head
export const CALLOUT_LIFT_LIMEZU = CARRY_LIFT_LIMEZU + 10;                      // 64: clears a carried torpedo (7 high, fins 10.5)

/** Slot k of a player: pid % 4 picks sheet k. */
export const crewSlot = (pid: number): number => ((pid % CREW_SLOTS) + CREW_SLOTS) % CREW_SLOTS;

/** Eight facings folded to LimeZu's four: n and s stay, every east-ish facing is e, every west-ish one w. */
export function facing4(f: Facing8): Facing4 {
  if (f === 'n' || f === 's') return f;
  return f === 'e' || f === 'ne' || f === 'se' ? 'e' : 'w';
}

export const crewStandName = (slot: number, d: Facing4): string => `crew.p${slot}.stand.${d}`;
export const crewIdleName = (slot: number, d: Facing4): string => `crew.p${slot}.idle.${d}`;
export const crewWalkName = (slot: number, d: Facing4): string => `crew.p${slot}.walk.${d}`;
/** Every crewArt name (48): stand, idle and walk for 4 slots and 4 facings. */
export const CREW_ART_NAMES: readonly string[] = Array.from({ length: CREW_SLOTS }, (_, k) => LIMEZU_DIRS.flatMap((d) => [crewStandName(k, d), crewIdleName(k, d), crewWalkName(k, d)])).flat();

/** The manifest sheet block for one LimeZu sheet: frame indices per spec section 1. */
export function limezuSheet(slot: number): { frameW: 16; frameH: 32; frames: Record<string, number>; animations: Record<string, { frames: number[]; fps: number; loop: true }> } {
  const frames: Record<string, number> = {}, animations: Record<string, { frames: number[]; fps: number; loop: true }> = {};
  const run = (start: number, i: number): number[] => Array.from({ length: LIMEZU_RUN }, (_, j) => start + i * LIMEZU_RUN + j);
  LIMEZU_DIRS.forEach((d, i) => { frames[crewStandName(slot, d)] = LIMEZU_STAND + i; });
  LIMEZU_DIRS.forEach((d, i) => { animations[crewIdleName(slot, d)] = { frames: run(LIMEZU_IDLE, i), fps: LIMEZU_IDLE_FPS, loop: true }; });
  LIMEZU_DIRS.forEach((d, i) => { animations[crewWalkName(slot, d)] = { frames: run(LIMEZU_WALK, i), fps: LIMEZU_WALK_FPS, loop: true }; });
  return { frameW: 16, frameH: 32, frames, animations };
}

export type CrewPoseState = 'down' | 'seated' | 'idle' | 'walk';
/** What a LimeZu crew member shows: a frame or an animation by name, the anchor, the rotation. Down (downed or dead):
 *  the standing s frame turned +90 degrees (clockwise) about the body's centre, so it lies across its own tile; seated:
 *  the standing frame facing the console's wall side; idle and walk: their animation for the 4-way facing. */
export interface CrewPose { name: string; animated: boolean; anchorY: number; rotation: number }
export function crewPose(slot: number, state: CrewPoseState, facing: Facing8, seatSide: Side | null): CrewPose {
  if (state === 'down') return { name: crewStandName(slot, 's'), animated: false, anchorY: 0.5, rotation: Math.PI / 2 };
  if (state === 'seated') return { name: crewStandName(slot, seatSide ?? facing4(facing)), animated: false, anchorY: LIMEZU_ANCHOR_Y, rotation: 0 };
  const d = facing4(facing);
  return state === 'idle' ? { name: crewIdleName(slot, d), animated: true, anchorY: LIMEZU_ANCHOR_Y, rotation: 0 } : { name: crewWalkName(slot, d), animated: true, anchorY: LIMEZU_ANCHOR_Y, rotation: 0 };
}
```

- [ ] **Step 4: Register the names and the feature**

In `src/renderer/src/render/assetNames.ts`, insert at the very top of the file (before the `/** Every asset name` comment):

```ts
import { CREW_ART_NAMES } from './crewArt';

```

and replace

```ts
add('optional', 'crew.sit');
```

with

```ts
add('optional', 'crew.sit');
// Art-ii (spec section 1): the bought crew, a paid pack absent on a fresh clone; the Puny crew then draw as before
add('optional', ...CREW_ART_NAMES);
```

In `src/renderer/src/render/fallback.ts`, replace

```ts
import { FACINGS } from './assetNames';
```

with

```ts
import { FACINGS } from './assetNames';
import { CREW_ART_NAMES } from './crewArt';
```

replace `| 'sit' | 'houseFloor';` with `| 'sit' | 'houseFloor' | 'crewArt';`, and replace

```ts
  houseFloor: ['house.floor.0', 'house.floor.1', 'house.floor.2', 'house.floor.3'],   // Art-i spec section 2
```

with

```ts
  houseFloor: ['house.floor.0', 'house.floor.1', 'house.floor.2', 'house.floor.3'],   // Art-i spec section 2
  crewArt: [...CREW_ART_NAMES],         // Art-ii spec section 1: the LimeZu crew, 48 names
```

- [ ] **Step 5: `stationSides`** — append to the end of `src/renderer/src/render/consoleModel.ts`:

```ts

// ---- Art-ii (spec sections 1-2): the bought console art and the seated crew's facing ----

/** Every station's console wall side, indexed by station: a group's members share their group's side. */
export function stationSides(state: SimState): Side[] {
  const out: Side[] = new Array<Side>(state.derived.stationTile.length).fill('s');
  for (const c of consoles(state)) for (const m of c.members) out[m] = c.side;
  return out;
}
```

- [ ] **Step 6: The crew layer** — replace the whole of `src/renderer/src/render/crewSprites.ts` with:

```ts
import { AnimatedSprite, Container, Graphics, type Texture } from 'pixi.js';
import { TILE_PX } from '../../../shared/resolution';
import type { SimState } from '../sim/state';
import { Position, Stable, Life, LifeState, Owner, Seated } from '../sim/components';
import { CREW_HALF } from '../sim/tuning';
import type { GameAssets } from './assets';
import type { RenderMemory } from './memory';
import type { Facing8 } from './assetNames';
import { facingFromDelta, MOVE_EPS_PX } from './facing';
import { featureReady } from './fallback';
import { syncCache } from './cache';
import { drawTorpedo } from './torpedoLayer';
import { CARRY_LIFT_LIMEZU, CARRY_LIFT_PUNY, crewPose, crewSlot, crewStandName, LIMEZU_ANCHOR_Y, type CrewPoseState } from './crewArt';
import { stationSides, type Side } from './consoleModel';
import type { PresentationPoint } from '../../../network/state/timeline';

export const CREW_COLORS = [0x4fc3f7, 0x81c784, 0xffb74d, 0xe57373];
const DEAD_TINT = 0x777777;
const SCALE = TILE_PX / 16;
const ANCHOR_X = 0.5, ANCHOR_Y = 0.75;   // spec §2: feet at the bottom of the 0.6-tile collision box

/** `bob`: per player, a world-unit lift for a working crew member (Art-i spec section 6); absent or undefined is 0. */
export interface CrewLayer { container: Container; draw(state: SimState, alpha: number, presentation?: readonly PresentationPoint[], bob?: readonly (number | undefined)[]): void }

interface CrewSprite { sprite: AnimatedSprite; anim: string | null }

/** One AnimatedSprite per crew member, keyed by StableId. Falls back to the Increment 1 circles when any crew name is missing.
 *  With the crewArt feature (Art-ii spec section 1) each player wears their own LimeZu character (slot pid % 4), untinted;
 *  without it the Puny sheet draws, tinted per player, as before. */
export function createCrewLayer(assets: GameAssets, memory: RenderMemory): CrewLayer {
  const container = new Container();
  const useArt = featureReady(new Set(assets.missing), 'crew');
  const useSit = featureReady(new Set(assets.missing), 'sit');
  const useLimeZu = useArt && featureReady(new Set(assets.missing), 'crewArt');   // the circle fallback still wins when Puny is missing
  const carryLift = useLimeZu ? CARRY_LIFT_LIMEZU : CARRY_LIFT_PUNY;
  let sides: Side[] = [], sidesFor = '';
  const sprites = new Map<number, CrewSprite>();
  const circles = new Map<number, Graphics>();
  const carried = new Container(), torps = new Map<number, Graphics>();   // a torpedo in a carrier's arms (spec Coop-ii section 2), drawn over every crew sprite
  const drawCarried = (state: SimState, eid: number, pid: number, x: number, y: number): void => {
    const g = torps.get(Stable.id[eid]!)!;
    g.visible = state.carrying[pid] === 1 && Life.state[eid] === LifeState.Conscious;
    g.position.set(x * TILE_PX, y * TILE_PX - carryLift);   // held overhead, clear of the sprite's head
  };

  /** Interpolated draw position, and the movement since the last drawn frame (not since the last tick: a paused sim must read as idle). */
  const interpolated = (eid: number, alpha: number, point?: PresentationPoint): { x: number; y: number; dx: number; dy: number } => {
    const id = Stable.id[eid]!, p = memory.prev.get(id) ?? { x: Position.x[eid]!, y: Position.y[eid]! };
    const x = point?.x ?? p.x + (Position.x[eid]! - p.x) * alpha, y = point?.y ?? p.y + (Position.y[eid]! - p.y) * alpha;
    const last = memory.lastDrawn.get(id) ?? { x, y };
    memory.lastDrawn.set(id, { x, y });
    return { x, y, dx: x - last.x, dy: y - last.y };
  };

  const setAnim = (cs: CrewSprite, name: string, textures: Texture[], fps: number, loop: boolean, startFrame = 0): void => {
    if (cs.anim === name) return;
    cs.anim = name;
    cs.sprite.textures = textures; cs.sprite.animationSpeed = fps / 60; cs.sprite.loop = loop;
    if (textures.length > 1) cs.sprite.gotoAndPlay(startFrame % textures.length); else cs.sprite.gotoAndStop(0);
  };

  return {
    container,
    draw(state, alpha, presentation, bob = []) {
      const pointFor = (eid: number) => presentation?.find(point => point.id === `crew:${state.crew.indexOf(eid)}`);
      const liveIds = state.crew.map((eid) => Stable.id[eid]!);
      if (carried.parent !== container) container.addChild(carried); else container.setChildIndex(carried, container.children.length - 1);
      syncCache(torps, liveIds, () => { const g = new Graphics(); drawTorpedo(g, 0, 0, 20); carried.addChild(g); return g; }, (g) => { g.destroy(); });
      if (!useArt) {
        syncCache(circles, liveIds, () => { const g = new Graphics(); container.addChild(g); return g; }, (g, id) => { g.destroy(); memory.prev.delete(id); memory.lastDrawn.delete(id); });
        for (const eid of state.crew) {
          const g = circles.get(Stable.id[eid]!)!, { x, y } = interpolated(eid, alpha, pointFor(eid)), life = Life.state[eid];
          g.clear().circle(0, 0, CREW_HALF * TILE_PX).fill({ color: life === LifeState.Dead ? DEAD_TINT : CREW_COLORS[Owner.pid[eid]! % 4]!, alpha: life === LifeState.Downed ? 0.5 : 1 });
          g.position.set(x * TILE_PX, y * TILE_PX + (bob[Owner.pid[eid]!] ?? 0));
          drawCarried(state, eid, Owner.pid[eid]!, x, y);
        }
        return;
      }
      syncCache(sprites, liveIds,
        () => { const s = new AnimatedSprite([assets.texture(useLimeZu ? crewStandName(0, 's') : 'crew.idle.s')]); s.anchor.set(ANCHOR_X, useLimeZu ? LIMEZU_ANCHOR_Y : ANCHOR_Y); s.scale.set(SCALE); container.addChild(s); return { sprite: s, anim: null }; },
        (cs, id) => { cs.sprite.destroy(); memory.prev.delete(id); memory.lastDrawn.delete(id); memory.facing.delete(id); });
      for (const eid of state.crew) {
        const id = Stable.id[eid]!, cs = sprites.get(id)!, { x, y, dx, dy } = interpolated(eid, alpha, pointFor(eid));
        const facing: Facing8 = facingFromDelta(dx, dy, memory.facing.get(id) ?? 's');
        memory.facing.set(id, facing);
        const life = Life.state[eid];
        const moving = Math.abs(dx) >= MOVE_EPS_PX || Math.abs(dy) >= MOVE_EPS_PX;
        if (useLimeZu) {
          if (sidesFor !== state.derived.layoutHash) { sides = stationSides(state); sidesFor = state.derived.layoutHash; }
          const seat = Seated.station[eid]!, pose: CrewPoseState = life !== LifeState.Conscious ? 'down' : seat >= 0 ? 'seated' : moving ? 'walk' : 'idle';
          const p = crewPose(crewSlot(Owner.pid[eid]!), pose, facing, seat >= 0 ? sides[seat] ?? null : null);
          if (p.animated) { const a = assets.animation(p.name); setAnim(cs, p.name, a.textures, a.fps, a.loop, pose === 'walk' ? id : 0); }
          else setAnim(cs, p.name, [assets.texture(p.name)], 1, false);
          cs.sprite.anchor.set(ANCHOR_X, p.anchorY); cs.sprite.rotation = p.rotation;
          cs.sprite.tint = life === LifeState.Dead ? DEAD_TINT : 0xffffff;   // the character identifies the player: no per-player tint
          cs.sprite.alpha = life === LifeState.Downed ? 0.85 : 1;
          cs.sprite.position.set(x * TILE_PX, y * TILE_PX + (bob[Owner.pid[eid]!] ?? 0));
          drawCarried(state, eid, Owner.pid[eid]!, x, y);
          continue;
        }
        if (life !== LifeState.Conscious) setAnim(cs, 'crew.down', [assets.texture('crew.down')], 1, false);
        else if (Seated.station[eid]! >= 0) { const n = useSit ? 'crew.sit' : 'crew.idle.s'; setAnim(cs, n, [assets.texture(n)], 1, false); }
        else if (!moving) setAnim(cs, `crew.idle.${facing}`, [assets.texture(`crew.idle.${facing}`)], 1, false);
        else { const a = assets.animation(`crew.walk.${facing}`); setAnim(cs, `crew.walk.${facing}`, a.textures, a.fps, a.loop, id); }
        cs.sprite.tint = life === LifeState.Dead ? DEAD_TINT : CREW_COLORS[Owner.pid[eid]! % 4]!;
        cs.sprite.alpha = life === LifeState.Downed ? 0.85 : 1;
        cs.sprite.position.set(x * TILE_PX, y * TILE_PX + (bob[Owner.pid[eid]!] ?? 0));
        drawCarried(state, eid, Owner.pid[eid]!, x, y);
      }
    }
  };
}
```

- [ ] **Step 7: The callout lift**

In `src/renderer/src/render/calloutModel.ts`, replace

```ts
/** Where a player's bubble sits in internal pixels: centred above the crew member's head, given the world fit. */
export function bubbleAnchor(state: SimState, pid: number, fit: { scale: number; x: number; y: number }): { x: number; y: number } {
  const eid = state.crew[pid]!;
  return { x: fit.x + Position.x[eid]! * TILE_PX * fit.scale, y: fit.y + (Position.y[eid]! - 0.6) * TILE_PX * fit.scale };
}
```

with

```ts
/** The bubble tail's height over the crew position in world units: 0.6 tile over the Puny crew (the default). */
export const CALLOUT_LIFT_PUNY = 0.6 * TILE_PX;
/** Where a player's bubble sits in internal pixels: centred above the crew member's head, given the world fit. `lift`: the
 *  tail's height over the crew position, world units (Art-ii: CALLOUT_LIFT_LIMEZU over the taller bought crew). */
export function bubbleAnchor(state: SimState, pid: number, fit: { scale: number; x: number; y: number }, lift = CALLOUT_LIFT_PUNY): { x: number; y: number } {
  const eid = state.crew[pid]!;
  return { x: fit.x + Position.x[eid]! * TILE_PX * fit.scale, y: fit.y + (Position.y[eid]! * TILE_PX - lift) * fit.scale };
}
```

In `src/renderer/src/render/callouts.ts`, replace

```ts
import { bubbleAnchor, type Bubble } from './calloutModel';
import { CREW_COLORS } from './crewSprites';
```

with

```ts
import { bubbleAnchor, CALLOUT_LIFT_PUNY, type Bubble } from './calloutModel';
import { CREW_COLORS } from './crewSprites';
import { CALLOUT_LIFT_LIMEZU } from './crewArt';
import { featureReady } from './fallback';
```

replace

```ts
export function createCalloutLayer(assets: GameAssets) {
  const container = new Container();
```

with

```ts
export function createCalloutLayer(assets: GameAssets) {
  const container = new Container();
  const missing = new Set(assets.missing);
  const lift = featureReady(missing, 'crew') && featureReady(missing, 'crewArt') ? CALLOUT_LIFT_LIMEZU : CALLOUT_LIFT_PUNY;   // over the taller bought crew (Art-ii spec section 1)
```

and replace `const a = bubbleAnchor(state, item.pid, fit), w = b.w;` with `const a = bubbleAnchor(state, item.pid, fit, lift), w = b.w;`.

- [ ] **Step 8: The manifest entries** — create `.art/add-crew.ts` (gitignored scratch; check with `git check-ignore -v .art/add-crew.ts`, which prints `.gitignore:...:.art/`):

```ts
// Art-ii Task 2: append the four LimeZu crew sheets to public/assets/manifest.json (run once).
import { readFileSync, writeFileSync } from 'node:fs';
import { CREW_SHEETS, limezuSheet } from '../src/renderer/src/render/crewArt';
const path = 'public/assets/manifest.json', m = JSON.parse(readFileSync(path, 'utf8')) as { file: string }[];
if (m.some((e) => e.file.startsWith('paid/limezu/'))) throw new Error('the LimeZu entries are already there');
CREW_SHEETS.forEach((sheet, k) => m.push({
  title: 'Modern Interiors (premade characters)', author: 'LimeZu', source: 'https://limezu.itch.io/moderninteriors', license: 'paid', retrieved: '2026-11-16',
  modifications: 'frames cut and remapped to the FTLite house palette by npm run art:import', editedBy: 'FTLite art import',
  credit: 'Modern Interiors by LimeZu (limezu.itch.io)', required: false, file: `paid/limezu/crew_${sheet}.png`, sheet: limezuSheet(k)
} as never));
writeFileSync(path, `${JSON.stringify(m, null, 2)}\n`);
console.log(`manifest: ${m.length} entries`);
```

Run: `npx tsx .art/add-crew.ts && npm run credits`
Expected: `manifest: 29 entries`, then `wrote public/THIRD_PARTY_NOTICES.txt (... chars) and credits.generated.ts (12 lines)`. `git diff --stat -- src/renderer/src/render/credits.generated.ts` shows one added line, `"Modern Interiors by LimeZu (limezu.itch.io)"`.

- [ ] **Step 9: Run the tests**

Run: `npx vitest run tests/crewArt.test.ts 2>&1 | tail -5`
Expected: `Tests 13 passed (13)`.

Run: `npx vitest run tests/onlineRenderer.test.ts tests/calloutModel.test.ts tests/assets.test.ts tests/manifest.test.ts tests/paidManifest.test.ts tests/credits.test.ts tests/renderPure.test.ts tests/artGuards.test.ts tests/duelInterior.test.ts tests/consoleModel.test.ts 2>&1 | tail -5`
Expected: all pass (`artGuards` 169: +2 for `crewArt.ts`).

Run: `npx tsc -b; echo "tsc exit=$?"`
Expected: `tsc exit=0`.

- [ ] **Step 10: Commit**

```bash
git add -- src/renderer/src/render/crewArt.ts src/renderer/src/render/assetNames.ts src/renderer/src/render/fallback.ts src/renderer/src/render/consoleModel.ts src/renderer/src/render/crewSprites.ts src/renderer/src/render/calloutModel.ts src/renderer/src/render/callouts.ts public/assets/manifest.json public/THIRD_PARTY_NOTICES.txt src/renderer/src/render/credits.generated.ts tests/crewArt.test.ts
git commit -m "$(cat <<'EOF'
feat(art-ii): one LimeZu character per player (crewArt), seated facing, downed pose, carry and callout lifts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Maru machines at the stations

**Files:**
- Create: `tests/consoleArt.test.ts`, `.art/add-console-outputs.cjs` and `.art/add-consoles.ts` (gitignored, not committed)
- Modify: `art/import.json` (by script), `src/renderer/src/render/assetNames.ts`, `src/renderer/src/render/fallback.ts`, `src/renderer/src/render/consoleModel.ts` (import, append), `src/renderer/src/render/consoleLayer.ts` (rewrite), `src/renderer/src/render/interiorFeel.ts:80-81,168-169`, `src/renderer/src/render/renderer.ts:28,63,66`, `src/renderer/src/render/duel/interiorView.ts:22,45,49`, `public/assets/manifest.json` (by script)
- Regenerate: `public/THIRD_PARTY_NOTICES.txt`, `src/renderer/src/render/credits.generated.ts`; the gitignored `public/assets/paid/maru/console-*.png`

**Interfaces:**
- Consumes: `consoles`, `deskPicture`, `WALL_GAP`, `type Side`, `type ConsoleLook` (`consoleModel.ts`); `STATION_IDS` (`sim/stationKinds.ts`); `featureReady`; `GameAssets.texture`.
- Produces:
  - `assetNames.ts`: `CONSOLE_ART_NAMES: readonly string[]` (`console.navigation` ... `console.doors`, in `STATION_IDS` order).
  - `fallback.ts`: feature `'consoleArt'`.
  - `consoleModel.ts`: `consoleArtName(state, members): string`; `SIDE_ROTATION: Record<Side, number>`; `consolePlacement(side, flush, w, h): { left; top; width; height; cx; cy; rotation }`; `CONSOLE_TINT: Record<ConsoleLook, number>`.
  - `consoleLayer.ts`: `createConsoleLayer(assets: GameAssets): { container: Container; draw(state: SimState): void }`.
  - `interiorFeel.ts`: `interface InteriorFeelOptions { world: Container; band: Band; feel: () => FeelSetting; consoleArt?: boolean }`; `createInteriorFeel(opts: InteriorFeelOptions)`.

- [ ] **Step 1: Write the failing test** — create `tests/consoleArt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { StationKind, STATION_IDS } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { parseManifest } from '../src/renderer/src/render/manifest';
import { ASSET_NAMES, CONSOLE_ART_NAMES } from '../src/renderer/src/render/assetNames';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import type { GameAssets } from '../src/renderer/src/render/assets';
import {
  consoleArtName, consolePlacement, consoles, CONSOLE_TINT, deskPicture, SIDE_ROTATION, WALL_GAP, type Side
} from '../src/renderer/src/render/consoleModel';
import { createConsoleLayer } from '../src/renderer/src/render/consoleLayer';
import { createInteriorFeel, type FeelFrame } from '../src/renderer/src/render/interiorFeel';
import { sectorGradeInput } from '../src/renderer/src/render/gradeModel';
import { WORLD_BAND } from '../src/renderer/src/render/worldFit';
import { TILE_PX } from '../src/shared/resolution';
import { cutterState, RECRUITS } from './helpers/sim';
import { createSimState } from './helpers/simLifetime';

const T = TILE_PX;
/** The imported console sizes in art pixels (art/import.json, Art-ii spec section 2). */
const SIZE: Record<string, [number, number]> = {
  navigation: [12, 15], weapons: [12, 15], science: [13, 16], doors: [13, 15], engineering: [16, 27], lifeSupport: [16, 23], medbay: [24, 14]
};
function fakeAssets(withConsoleArt: boolean): GameAssets {
  const missing = Object.values(FEATURE_NAMES).flat().filter((n) => !(withConsoleArt && n.startsWith('console.')));
  const tex = new Map<string, Texture>();
  const named = (n: string): Texture => {
    let t = tex.get(n);
    if (!t) { const [w, h] = SIZE[n.slice('console.'.length)]!; t = new Texture({ source: new TextureSource({ width: w, height: h }) }); t.label = n; tex.set(n, t); }
    return t;
  };
  return {
    has: (n) => !missing.includes(n), missing, fontFamily: 'm5x7',
    texture: (n) => { if (missing.includes(n)) throw new Error(`missing ${n}`); return named(n); },
    animation: (n) => { throw new Error(`no animation ${n}`); }, nineSlice: (n) => { throw new Error(`no nine-slice ${n}`); }
  };
}

describe('the bought consoles: names, placement and tints (Art-ii spec section 2)', () => {
  it('names each console console.<STATION_IDS id> by its group\'s first member, all optional, grouped as consoleArt', () => {
    expect(CONSOLE_ART_NAMES).toEqual(['console.navigation', 'console.weapons', 'console.science', 'console.engineering', 'console.lifeSupport', 'console.medbay', 'console.doors']);
    for (const n of CONSOLE_ART_NAMES) expect(ASSET_NAMES[n]).toBe('optional');
    expect(FEATURE_NAMES.consoleArt).toEqual([...CONSOLE_ART_NAMES]);
    const s = cutterState();
    for (const c of consoles(s)) expect(consoleArtName(s, c.members)).toBe(`console.${STATION_IDS[s.derived.stationKind[c.members[0]!]!]}`);
    const k = createSimState(parseShip(skiff), 2, 1, RECRUITS), helm = consoles(k).find((c) => c.members.length === 2)!;
    expect(consoleArtName(k, helm.members)).toBe(`console.${STATION_IDS[k.derived.stationKind[helm.members[0]!]!]}`);
  });
  it('the art faces south: a quarter turn per side, clockwise positive', () => {
    expect(SIDE_ROTATION).toEqual({ n: 0, e: Math.PI / 2, s: Math.PI, w: -Math.PI / 2 });
  });
  it('the back edge sits on the wall face (the turned desk\'s outer edge), centred along the wall, top-left on an even unit', () => {
    for (const side of ['n', 'e', 's', 'w'] as Side[]) for (const flush of [true, false]) for (const [w, h] of Object.values(SIZE)) {
      const p = consolePlacement(side, flush, w, h), desk = deskPicture(side, flush, 'free').desk, at = `${side} ${flush} ${w}x${h}`;
      expect(Number.isInteger(p.left / 2) && Number.isInteger(p.top / 2), at).toBe(true);
      expect([p.width, p.height], at).toEqual(side === 'n' || side === 's' ? [2 * w, 2 * h] : [2 * h, 2 * w]);
      expect([p.cx, p.cy], at).toEqual([p.left + p.width / 2, p.top + p.height / 2]);
      if (side === 'n') expect(p.top, at).toBe(desk.y);
      if (side === 's') expect(p.top + p.height, at).toBe(desk.y + desk.h);
      if (side === 'w') expect(p.left, at).toBe(desk.x);
      if (side === 'e') expect(p.left + p.width, at).toBe(desk.x + desk.w);
      const along = side === 'n' || side === 's' ? p.left + p.width / 2 : p.top + p.height / 2;
      expect(Math.abs(along - T / 2), at).toBeLessThanOrEqual(1);   // centred on the tile's centre line, within the even floor
    }
    expect(consolePlacement('n', true, 12, 15)).toMatchObject({ left: 4, top: -WALL_GAP, width: 24, height: 30 });
    expect(consolePlacement('e', true, 16, 27)).toMatchObject({ left: T + WALL_GAP - 54, top: 0, width: 54, height: 32 });
    expect(consolePlacement('s', false, 13, 16)).toMatchObject({ left: 2, top: T - 32, width: 26, height: 32 });
  });
  it('tints by look: free plain, occupied 80 %, down 60 %', () => {
    expect(CONSOLE_TINT).toEqual({ free: 0xffffff, occupied: 0xcccccc, down: 0x999999 });
  });
  it('art/import.json cuts each console as its own one-frame output, so the image is exactly the art', () => {
    const cfg = JSON.parse(readFileSync('art/import.json', 'utf8')) as { outputs: { pack: string; frames: { w: number; h: number }[]; output: string; columns: number }[] };
    for (const id of STATION_IDS) {
      const o = cfg.outputs.find((x) => x.output === `public/assets/paid/maru/console-${id}.png`)!;
      expect(o.frames, id).toHaveLength(1); expect(o.columns).toBe(1);
      expect([o.frames[0]!.w, o.frames[0]!.h], id).toEqual(SIZE[id]);
    }
  });
  it('the manifest binds the seven sprites by name as paid Maru-98 art', () => {
    const real = parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
    for (const id of STATION_IDS) {
      const e = real.find((x) => x.name === `console.${id}`)!;
      expect(e.file).toBe(`paid/maru/console-${id}.png`);
      expect([e.license, e.required, e.source, e.retrieved, e.credit]).toEqual(['paid', false, 'https://maru-98.itch.io/', '2026-11-16', 'Mars colony pixel art by Maru-98 (maru-98.itch.io)']);
    }
  });
});

describe('the console layer with the bought consoles (Art-ii spec section 2)', () => {
  it('draws one turned, tinted sprite per console in a child container at index 0, and no desk or screen strip', () => {
    const s = cutterState(), layer = createConsoleLayer(fakeAssets(true));
    layer.container.addChild(new Graphics());   // the interior feel's fixtures, added after the layer is built
    layer.draw(s);
    const art = layer.container.children[0] as Container, g = layer.container.children[1] as Graphics, list = consoles(s);
    expect(art.children).toHaveLength(list.length);
    expect(g.context.instructions).toHaveLength(0);
    list.forEach((c, i) => {
      const sp = art.children[i] as Sprite, p = consolePlacement(c.side, c.flush, sp.texture.width, sp.texture.height);
      expect(sp.texture.label).toBe(consoleArtName(s, c.members));
      expect([sp.x, sp.y, sp.rotation, sp.anchor.x, sp.anchor.y, sp.scale.x]).toEqual([c.x + p.cx, c.y + p.cy, SIDE_ROTATION[c.side], 0.5, 0.5, 2]);
      expect(sp.tint).toBe(0xffffff);
    });
  });
  it('redraws only when a look or the layout changes; an occupied console dims, a down one dims more', () => {
    const s = cutterState(), layer = createConsoleLayer(fakeAssets(true)), art = layer.container.children[0] as Container;
    layer.draw(s); const first = art.children[0];
    layer.draw(s); expect(art.children[0]).toBe(first);
    const w = s.derived.stationOfKind[StationKind.Weapons]!, k = consoles(s).findIndex((c) => c.members.includes(w));
    sitDown(s, 0, w); layer.draw(s);
    expect((art.children[k] as Sprite).tint).toBe(CONSOLE_TINT.occupied);
    s.stations.failed[w] = 1; layer.draw(s);
    expect((art.children[k] as Sprite).tint).toBe(CONSOLE_TINT.down);
  });
  it('without consoleArt the procedural desks and screen strips draw as before', () => {
    const s = cutterState(), layer = createConsoleLayer(fakeAssets(false));
    layer.draw(s);
    expect((layer.container.children[0] as Container).children).toHaveLength(0);
    expect((layer.container.children[1] as Graphics).context.instructions.length).toBeGreaterThan(0);
  });
  it('the interior feel blinks no screen cursor over the bought consoles; the glows stay', () => {
    const frame = (st: ReturnType<typeof cutterState>): FeelFrame => ({ state: st, grade: sectorGradeInput(st), hit: null, sparks: [], working: [], artPx: 2 });
    const s = cutterState(), lamps = (f: ReturnType<typeof createInteriorFeel>): number => f.fixtures.context.instructions.length;
    const plain = createInteriorFeel({ world: new Container(), band: WORLD_BAND, feel: () => 'full' });
    const art = createInteriorFeel({ world: new Container(), band: WORLD_BAND, feel: () => 'full', consoleArt: true });
    plain.draw(frame(s), 1 / 60); art.draw(frame(s), 1 / 60);
    expect(lamps(plain) - lamps(art)).toBe(consoles(s).filter((c) => c.look !== 'down').length);   // one cursor rect per powered console, gone
    expect((art.lights.children[0] as Container).children.length).toBe((plain.lights.children[0] as Container).children.length);
    plain.destroy(); art.destroy();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/consoleArt.test.ts 2>&1 | tail -8`
Expected: FAIL (a missing export such as `consolePlacement`, or `CONSOLE_ART_NAMES` undefined).

- [ ] **Step 3: One output per console sprite** — create `.art/add-console-outputs.cjs`:

```js
// Art-ii Task 3: append one one-frame output per console sprite to art/import.json (run once). Rectangles from the Art-ii spec section 2.
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('art/import.json', 'utf8'));
const hab = 'maru-98-mars/habitable-building/habitable building tileset.png', tiles = 'maru-98-mars/tilesets/tilesets.png';
const add = [
  ['navigation', hab, 18, 17, 12, 15], ['weapons', hab, 50, 17, 12, 15], ['science', hab, 82, 16, 13, 16], ['doors', hab, 113, 17, 13, 15],
  ['engineering', tiles, 80, 22, 16, 27], ['lifeSupport', tiles, 16, 28, 16, 23], ['medbay', tiles, 112, 33, 24, 14]
];
if (j.outputs.some((o) => o.output.includes('/console-'))) throw new Error('console outputs already present');
for (const [id, pack, x, y, w, h] of add) j.outputs.push({ pack, frames: [{ x, y, w, h }], output: `public/assets/paid/maru/console-${id}.png`, columns: 1 });
fs.writeFileSync('art/import.json', JSON.stringify(j, null, 2) + '\n');
console.log(`art/import.json: ${j.outputs.length} outputs`);
```

Run: `node .art/add-console-outputs.cjs && npm run art:import 2>&1 | grep console`
Expected: `art/import.json: 19 outputs`, then seven `wrote ...\public\assets\paid\maru\console-<id>.png` lines (navigation, weapons, science, doors, engineering, lifeSupport, medbay).

Run: `npm run art:palette && git diff --exit-code -- src/renderer/src/render/palette.json && echo PALETTE_UNCHANGED`
Expected: `wrote ... (48 colours, 7 kept ...)` and `PALETTE_UNCHANGED` (each distinct frame counts once, Decision 2).

- [ ] **Step 4: The names and the feature**

In `src/renderer/src/render/assetNames.ts`, replace

```ts
import { CREW_ART_NAMES } from './crewArt';
```

with

```ts
import { STATION_IDS } from '../sim/stationKinds';
import { CREW_ART_NAMES } from './crewArt';
```

replace

```ts
export type Facing8 = (typeof FACINGS)[number];
```

with

```ts
export type Facing8 = (typeof FACINGS)[number];
/** Art-ii (spec section 2): one console sprite per station kind, by its ship-data id. */
export const CONSOLE_ART_NAMES: readonly string[] = STATION_IDS.map((id) => `console.${id}`);
```

and replace

```ts
add('optional', ...CREW_ART_NAMES);
```

with

```ts
add('optional', ...CREW_ART_NAMES);
add('optional', ...CONSOLE_ART_NAMES);   // Art-ii spec section 2: the bought consoles; the procedural desks without them
```

In `src/renderer/src/render/fallback.ts`, replace `import { FACINGS } from './assetNames';` with `import { CONSOLE_ART_NAMES, FACINGS } from './assetNames';`, replace `| 'houseFloor' | 'crewArt';` with `| 'houseFloor' | 'crewArt' | 'consoleArt';`, and replace

```ts
  crewArt: [...CREW_ART_NAMES],         // Art-ii spec section 1: the LimeZu crew, 48 names
```

with

```ts
  crewArt: [...CREW_ART_NAMES],         // Art-ii spec section 1: the LimeZu crew, 48 names
  consoleArt: [...CONSOLE_ART_NAMES],   // Art-ii spec section 2: the Maru consoles, one per station kind
```

- [ ] **Step 5: The console model**

In `src/renderer/src/render/consoleModel.ts`, replace

```ts
import { AMBER, WARN, over } from './theme';
```

with

```ts
import { AMBER, WARN, over } from './theme';
import { CONSOLE_ART_NAMES } from './assetNames';
```

and append to the end of the file:

```ts

/** The console sprite's asset name (Art-ii spec section 2): `console.<STATION_IDS id>` of the group's first member. */
export function consoleArtName(state: SimState, members: readonly number[]): string {
  return CONSOLE_ART_NAMES[state.derived.stationKind[members[0]!]!]!;
}

/** The quarter turn for a wall side: the art faces south (its back to a north wall); clockwise is positive. */
export const SIDE_ROTATION: Readonly<Record<Side, number>> = { n: 0, e: Math.PI / 2, s: Math.PI, w: -Math.PI / 2 };

/** Where a console sprite of `w` x `h` art pixels goes in tile-local world units: its back edge on the wall face (the outer
 *  edge of the turned deskPicture desk: flush n y = -WALL_GAP, s y = T + WALL_GAP, w x = -WALL_GAP, e x = T + WALL_GAP;
 *  not flush 0 or T), centred along the wall on the tile's centre line, its rotated top-left floored to an even unit.
 *  Returns that top-left and size, and the centre to place a 0.5/0.5-anchored sprite at with `rotation`. */
export function consolePlacement(side: Side, flush: boolean, w: number, h: number): { left: number; top: number; width: number; height: number; cx: number; cy: number; rotation: number } {
  const W = 2 * w, H = 2 * h, gap = flush ? WALL_GAP : 0, even = (v: number): number => 2 * Math.floor(v / 2) || 0;   // || 0: never -0
  const along = even(T / 2 - W / 2);
  const box = side === 'n' ? { left: along, top: -gap, width: W, height: H }
    : side === 's' ? { left: along, top: T + gap - H, width: W, height: H }
    : side === 'w' ? { left: -gap, top: along, width: H, height: W }
    : { left: T + gap - H, top: along, width: H, height: W };
  const left = even(box.left), top = even(box.top);
  return { left, top, width: box.width, height: box.height, cx: left + box.width / 2, cy: top + box.height / 2, rotation: SIDE_ROTATION[side] };
}

/** The console sprite's tint by look: free plain, occupied at 80 % brightness, down at 60 %. */
export const CONSOLE_TINT: Readonly<Record<ConsoleLook, number>> = { free: 0xffffff, occupied: 0xcccccc, down: 0x999999 };
```

- [ ] **Step 6: The console layer** — replace the whole of `src/renderer/src/render/consoleLayer.ts` with:

```ts
import { Container, Graphics, Sprite } from 'pixi.js';
import type { SimState } from '../sim/state';
import type { GameAssets } from './assets';
import { featureReady } from './fallback';
import { consoleArtName, consolePlacement, consoles, CONSOLE_TINT, DESK_OUTLINE_W } from './consoleModel';

/** The station desks (spec Demo-xii section 1), under the crew; redrawn only when a console's state or the layout changes.
 *  With the consoleArt feature (Art-ii spec section 2) each console is its bought Maru sprite, turned to its wall and tinted
 *  by its look, in a child container at index 0 (under the fixtures the interior feel adds later); no desk or screen strip. */
export function createConsoleLayer(assets: GameAssets): { container: Container; draw(state: SimState): void } {
  const container = new Container(), art = new Container(), g = new Graphics();
  container.addChild(art, g);
  const useArt = featureReady(new Set(assets.missing), 'consoleArt');
  let drawnFor = '';
  return {
    container,
    draw(state) {
      const list = consoles(state), key = `${state.derived.layoutHash}:${list.map((c) => c.look).join()}`;
      if (key === drawnFor) return;
      drawnFor = key; g.clear();
      if (useArt) {
        for (const s of art.removeChildren()) s.destroy();
        for (const c of list) {
          const tex = assets.texture(consoleArtName(state, c.members)), p = consolePlacement(c.side, c.flush, tex.width, tex.height);
          const s = new Sprite(tex); s.anchor.set(0.5); s.scale.set(2); s.rotation = p.rotation; s.tint = CONSOLE_TINT[c.look];
          s.position.set(c.x + p.cx, c.y + p.cy); art.addChild(s);
        }
        return;
      }
      for (const c of list) {
        const p = c.picture;
        g.rect(c.x + p.desk.x, c.y + p.desk.y, p.desk.w, p.desk.h).fill(p.fill).stroke({ width: DESK_OUTLINE_W, color: p.outline, alignment: 1 });   // one art pixel, inside the desk (Art-i spec section 4)
        g.rect(c.x + p.screen.x, c.y + p.screen.y, p.screen.w, p.screen.h).fill(p.screenFill);
      }
    }
  };
}
```

- [ ] **Step 7: No cursor over the bought consoles**

In `src/renderer/src/render/interiorFeel.ts`, replace

```ts
/** `world`: the ship's world container (its animations freeze in a hitstop). `band`: the starfield's band, internal pixels. */
export function createInteriorFeel(opts: { world: Container; band: Band; feel: () => FeelSetting }): InteriorFeel {
```

with

```ts
/** `world`: the ship's world container (its animations freeze in a hitstop). `band`: the starfield's band, internal pixels.
 *  `consoleArt`: the consoles are the bought sprites (Art-ii spec section 2), so no screen cursor blinks on them. */
export interface InteriorFeelOptions { world: Container; band: Band; feel: () => FeelSetting; consoleArt?: boolean }
export function createInteriorFeel(opts: InteriorFeelOptions): InteriorFeel {
```

and replace

```ts
        if (c.look === 'down') return;
```

with

```ts
        if (c.look === 'down' || opts.consoleArt) return;   // the bought console art has no procedural screen to blink on (Art-ii spec section 2)
```

- [ ] **Step 8: Both call sites**

In `src/renderer/src/render/renderer.ts`, replace

```ts
import { failedStationPoints, sectorWorking, watchRepair } from './particles/sources';
```

with

```ts
import { failedStationPoints, sectorWorking, watchRepair } from './particles/sources';
import { featureReady } from './fallback';
```

replace

```ts
  const consoleDesks = createConsoleLayer();   // spec Demo-xii section 1: a desk at every station, under the crew
```

with

```ts
  const consoleDesks = createConsoleLayer(assets);   // spec Demo-xii section 1: a desk at every station, under the crew (Art-ii: the bought consoles)
```

and replace

```ts
  const feel = createInteriorFeel({ world, band: WORLD_BAND, feel: () => feelSetting });   // Art-i spec sections 5-8
```

with

```ts
  const missing = new Set(assets.missing);
  const feel = createInteriorFeel({ world, band: WORLD_BAND, feel: () => feelSetting, consoleArt: featureReady(missing, 'consoleArt') });   // Art-i spec sections 5-8; Art-ii: the bought consoles
```

In `src/renderer/src/render/duel/interiorView.ts`, replace

```ts
import type { ViewEvent } from '../tactical/fxModel';
```

with

```ts
import type { ViewEvent } from '../tactical/fxModel';
import { featureReady } from '../fallback';
```

replace

```ts
  const fx = createInteriorFeel({ world, band: INTERIOR_BAND, feel });   // Art-i spec sections 5-8
```

with

```ts
  const missing = new Set(assets.missing);
  const fx = createInteriorFeel({ world, band: INTERIOR_BAND, feel, consoleArt: featureReady(missing, 'consoleArt') });   // Art-i spec sections 5-8; Art-ii: the bought consoles
```

and replace `const desks = createConsoleLayer(), crew` with `const desks = createConsoleLayer(assets), crew`.

- [ ] **Step 9: The manifest entries** — create `.art/add-consoles.ts`:

```ts
// Art-ii Task 3: append the seven Maru console sprites to public/assets/manifest.json (run once).
import { readFileSync, writeFileSync } from 'node:fs';
import { STATION_IDS } from '../src/renderer/src/sim/stationKinds';
const path = 'public/assets/manifest.json', m = JSON.parse(readFileSync(path, 'utf8')) as { file: string }[];
if (m.some((e) => e.file.startsWith('paid/maru/console-'))) throw new Error('the console entries are already there');
const fromTilesets = new Set(['engineering', 'lifeSupport', 'medbay']);   // the rack, the green machine, the med pod; the rest are habitable-building consoles
for (const id of STATION_IDS) m.push({
  title: fromTilesets.has(id) ? 'Mars colony sets (Tilesets)' : 'Mars colony sets (Habitable Building)', author: 'Maru-98', source: 'https://maru-98.itch.io/', license: 'paid', retrieved: '2026-11-16',
  modifications: 'frames cut and remapped to the FTLite house palette by npm run art:import', editedBy: 'FTLite art import',
  credit: 'Mars colony pixel art by Maru-98 (maru-98.itch.io)', required: false, file: `paid/maru/console-${id}.png`, name: `console.${id}`
} as never);
writeFileSync(path, `${JSON.stringify(m, null, 2)}\n`);
console.log(`manifest: ${m.length} entries`);
```

Run: `npx tsx .art/add-consoles.ts && npm run credits`
Expected: `manifest: 36 entries`; `credits.generated.ts (12 lines)` (the Maru credit line is already there). `public/THIRD_PARTY_NOTICES.txt` now lists the four habitable-building consoles beside `paid/maru/floor.png` and a second Maru block, `Title: Mars colony sets (Tilesets)`, with the engineering, lifeSupport and medbay files.

- [ ] **Step 10: Run the tests**

Run: `npx vitest run tests/consoleArt.test.ts 2>&1 | tail -5`
Expected: `Tests 10 passed (10)`.

Run: `npx vitest run tests/consoleModel.test.ts tests/interiorFeel.test.ts tests/duelInterior.test.ts tests/crewArt.test.ts tests/artImport.test.ts tests/assets.test.ts tests/manifest.test.ts tests/paidManifest.test.ts tests/credits.test.ts tests/renderPure.test.ts tests/onlineRenderer.test.ts tests/artGuards.test.ts 2>&1 | tail -5`
Expected: all pass.

Run: `npx tsc -b; echo "tsc exit=$?"`
Expected: `tsc exit=0`.

- [ ] **Step 11: Commit**

```bash
git add -- art/import.json src/renderer/src/render/assetNames.ts src/renderer/src/render/fallback.ts src/renderer/src/render/consoleModel.ts src/renderer/src/render/consoleLayer.ts src/renderer/src/render/interiorFeel.ts src/renderer/src/render/renderer.ts src/renderer/src/render/duel/interiorView.ts public/assets/manifest.json public/THIRD_PARTY_NOTICES.txt src/renderer/src/render/credits.generated.ts tests/consoleArt.test.ts
git commit -m "$(cat <<'EOF'
feat(art-ii): Maru machines at the stations (consoleArt): one-frame outputs, wall-face placement, quarter turns, look tints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Explosions on hits

**Files:**
- Create: `src/renderer/src/render/blastModel.ts`, `tests/blasts.test.ts`, `.art/add-blasts.ts` (gitignored, not committed)
- Modify: `src/renderer/src/render/assetNames.ts`, `src/renderer/src/render/fallback.ts`, `src/renderer/src/render/interiorFeel.ts`, `src/renderer/src/render/renderer.ts`, `src/renderer/src/render/duel/interiorView.ts`, `public/assets/manifest.json` (by script)
- Regenerate: `public/THIRD_PARTY_NOTICES.txt`, `src/renderer/src/render/credits.generated.ts`

**Interfaces:**
- Consumes: `GameAnimation` (`assets.ts`); the feel's `clock`, `onHit`, `breachOpenings` loop (`interiorFeel.ts`); `InteriorFeelOptions` from Task 3.
- Produces:
  - `blastModel.ts`: `BLAST_CAP = 4`, `BLAST_SCALE = 2`, `type BlastKind = 'room' | 'hit'`, `interface Blast { kind; x; y; start }`, `type BlastTimings = Record<BlastKind, { frames; fps }>`, `tileCentre(tile, width)`, `roomCentroid(tiles, width)`, `addBlast(list, blast, cap?)`, `blastFrame(b, t, timing)`, `liveBlasts(list, t, timing)`.
  - `assetNames.ts`: `BLAST_NAMES = ['fx.blast.room', 'fx.blast.hit']`; `fallback.ts`: feature `'blastArt'`.
  - `interiorFeel.ts`: `InteriorFeelOptions.blasts?: Readonly<Record<BlastKind, GameAnimation>>`.

- [ ] **Step 1: Write the failing test** — create `tests/blasts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { parseManifest } from '../src/renderer/src/render/manifest';
import { ASSET_NAMES, BLAST_NAMES } from '../src/renderer/src/render/assetNames';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import type { GameAnimation } from '../src/renderer/src/render/assets';
import { addBlast, BLAST_CAP, blastFrame, liveBlasts, roomCentroid, tileCentre, type Blast, type BlastTimings } from '../src/renderer/src/render/blastModel';
import { createInteriorFeel, type FeelFrame } from '../src/renderer/src/render/interiorFeel';
import { sectorGradeInput } from '../src/renderer/src/render/gradeModel';
import { WORLD_BAND } from '../src/renderer/src/render/worldFit';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { cutterState, RECRUITS } from './helpers/sim';
import { createSimState } from './helpers/simLifetime';

const TIMING: BlastTimings = { room: { frames: 14, fps: 20 }, hit: { frames: 11, fps: 24 } };
const anim = (kind: string, frames: number, fps: number): GameAnimation => ({ textures: Array.from({ length: frames }, (_, i) => { const t = new Texture(); t.label = `${kind}#${i}`; return t; }), fps, loop: false });
const BLASTS = { room: anim('room', 14, 20), hit: anim('hit', 11, 24) };
const make = (blasts = true) => createInteriorFeel({ world: new Container(), band: WORLD_BAND, feel: () => 'full', blasts: blasts ? BLASTS : undefined });
const frame = (s: ReturnType<typeof cutterState>, over: Partial<FeelFrame> = {}): FeelFrame => ({ state: s, grade: sectorGradeInput(s), hit: null, sparks: [], working: [], artPx: 2, ...over });
/** The feel's blast sprites (the middle child of `above`, between the particles and the flash), visible ones only. */
const shown = (f: ReturnType<typeof make>): Sprite[] => ((f.above.children[1] as Container).children as Sprite[]).filter((s) => s.visible);

describe('the blast model (Art-ii spec section 3)', () => {
  it('a room blast sits on the room centroid rounded to 2 world units; a spark on its tile centre', () => {
    expect(tileCentre(5, 4)).toEqual({ x: 48, y: 48 });
    expect(roomCentroid([0, 1, 4, 5], 4)).toEqual({ x: 32, y: 32 });   // a 2 x 2 room: the shared corner
    expect(roomCentroid([0, 1, 2], 4)).toEqual({ x: 48, y: 16 });
    expect(roomCentroid([0, 1, 4], 4)).toEqual({ x: 2 * Math.round(((16 + 48 + 16) / 3) / 2), y: 2 * Math.round(((16 + 16 + 48) / 3) / 2) });
  });
  it('one shared cap of 4: a fifth cuts the oldest', () => {
    let list: Blast[] = [];
    for (let k = 0; k < 5; k++) list = addBlast(list, { kind: k % 2 ? 'hit' : 'room', x: k, y: 0, start: k });
    expect(BLAST_CAP).toBe(4);
    expect(list.map((b) => b.x)).toEqual([1, 2, 3, 4]);
  });
  it('frames run from the presentation clock and a blast is removed after its last frame', () => {
    const b: Blast = { kind: 'room', x: 0, y: 0, start: 1 };
    expect([1, 1.04, 1.05, 1.66].map((t) => blastFrame(b, t, TIMING))).toEqual([0, 0, 1, 13]);
    expect(liveBlasts([b], 1.69, TIMING)).toEqual([b]);
    expect(liveBlasts([b], 1 + 14 / 20, TIMING)).toEqual([]);
  });
  it('registers the two names as optional, grouped as blastArt, bound as one-shot animations in the manifest', () => {
    expect(BLAST_NAMES).toEqual(['fx.blast.room', 'fx.blast.hit']);
    for (const n of BLAST_NAMES) expect(ASSET_NAMES[n]).toBe('optional');
    expect(FEATURE_NAMES.blastArt).toEqual(['fx.blast.room', 'fx.blast.hit']);
    const real = parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
    const room = real.find((e) => e.file === 'paid/pimen/explosion-room.png')!, hit = real.find((e) => e.file === 'paid/pimen/explosion-hit.png')!;
    expect(room.sheet!.animations['fx.blast.room']).toEqual({ frames: [...Array(14).keys()], fps: 20, loop: false });
    expect(hit.sheet!.animations['fx.blast.hit']).toEqual({ frames: [...Array(11).keys()], fps: 24, loop: false });
    for (const e of [room, hit]) expect([e.license, e.required, e.source, e.retrieved, e.credit]).toEqual(['paid', false, 'https://pimen.itch.io/explosion-effect', '2026-11-16', 'Explosion VFX by Pimen (pimen.itch.io)']);
    expect(real.some((e) => e.file === 'paid/pimen/explosion-big.png')).toBe(false);   // imported, unbound until a ship-death view
  });
});

describe('blasts in the interior feel (Art-ii spec section 3)', () => {
  it('one room blast per hit room at its centroid, 2x, centred, under the flash', () => {
    const f = make(), s = cutterState();
    f.draw(frame(s), 1 / 60);
    s.tick = 10; f.draw(frame(s, { hit: { rooms: [0, 1] } }), 1 / 60);
    const live = shown(f);
    expect(live).toHaveLength(2);
    expect(live.map((b) => [b.x, b.y])).toEqual([0, 1].map((r) => { const c = roomCentroid(s.derived.roomTiles[r]!, s.derived.width); return [c.x, c.y]; }));
    expect([live[0]!.scale.x, live[0]!.anchor.x, live[0]!.anchor.y, live[0]!.texture.label]).toEqual([2, 0.5, 0.5, 'room#0']);
    expect(f.above.children).toHaveLength(3); expect(f.above.children[2]).toBeInstanceOf(Graphics);   // particles, blasts, then the flash on top
  });
  it('holds its frame through the hitstop and at presentation dt 0, then plays on and is removed after the last frame', () => {
    const f = make(), s = cutterState();
    f.draw(frame(s), 1 / 60);
    s.tick = 10; f.draw(frame(s, { hit: { rooms: [1] } }), 1 / 60);
    for (let k = 0; k < 2; k++) f.draw(frame(s), 1 / 60);            // inside the 60 ms hitstop
    expect(shown(f)[0]!.texture.label).toBe('room#0');
    for (let k = 0; k < 10; k++) f.draw(frame(s), 0);                 // paused
    expect(shown(f)[0]!.texture.label).toBe('room#0');
    for (let k = 0; k < 6; k++) f.draw(frame(s), 1 / 60);
    expect(shown(f)[0]!.texture.label).not.toBe('room#0');
    for (let k = 0; k < 60; k++) f.draw(frame(s), 1 / 60);             // 14 frames at 20 fps is 0.7 s
    expect(shown(f)).toHaveLength(0);
  });
  it('a hit spark on each newly opened breach site, at the site tile centre; the cap of 4 cuts the oldest', () => {
    const f = make(), s = cutterState();
    f.draw(frame(s), 1 / 60);
    s.breaches.active[0] = 1; f.draw(frame(s), 1 / 60);
    const c = tileCentre(s.derived.siteTile[0]!, s.derived.width);
    expect(shown(f).map((b) => [b.x, b.y, b.texture.label])).toEqual([[c.x, c.y, 'hit#0']]);
    s.tick = 10; f.draw(frame(s, { hit: { rooms: [0, 1, 2, 3] } }), 1 / 60);
    expect(shown(f)).toHaveLength(4);
    expect(shown(f).every((b) => (b.texture.label ?? '').startsWith('room'))).toBe(true);   // the spark, oldest, was cut
  });
  it('the duel: one room blast on the tile the hit smoke picks', () => {
    const f = make(), s = cutterState();
    f.draw(frame(s), 1 / 60);
    f.draw(frame(s, { hit: { whole: true } }), 1 / 60);
    const live = shown(f);
    expect(live).toHaveLength(1);
    const tiles = s.derived.roomTiles.flat().map((t) => tileCentre(t, s.derived.width));
    expect(tiles.some((c) => c.x === live[0]!.x && c.y === live[0]!.y)).toBe(true);
  });
  it('reset and a layout change clear them; without blastArt nothing extra draws', () => {
    const f = make(), s = cutterState();
    f.draw(frame(s), 1 / 60);
    s.tick = 10; f.draw(frame(s, { hit: { rooms: [1] } }), 1 / 60);
    expect(shown(f)).toHaveLength(1);
    f.reset(); expect(shown(f)).toHaveLength(0);
    f.draw(frame(s), 1 / 60); s.tick = 15; f.draw(frame(s, { hit: { rooms: [1] } }), 1 / 60);
    expect(shown(f)).toHaveLength(1);
    f.draw(frame(createSimState(parseShip(skiff), 2, 1, RECRUITS)), 1 / 60);   // a new ship
    expect(shown(f)).toHaveLength(0);
    const plain = make(false); plain.draw(frame(s), 1 / 60);
    s.tick = 20; plain.draw(frame(s, { hit: { rooms: [1] } }), 1 / 60);
    expect(plain.above.children).toHaveLength(2);   // the particles and the flash, as before
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/blasts.test.ts 2>&1 | tail -8`
Expected: FAIL, `Failed to load url ../src/renderer/src/render/blastModel`.

- [ ] **Step 3: The blast model** — create `src/renderer/src/render/blastModel.ts`:

```ts
// Explosions on hits (Art-ii spec section 3): which blasts live, where, and which frame each shows on the presentation
// clock. Pure: no Pixi. interiorFeel.ts schedules them on a hit and on a breach opening and draws them as plain Sprites.
import { TILE_PX } from '../../../shared/resolution';

/** One shared cap of live blasts (room blasts and breach sparks together): a fifth cuts the oldest. */
export const BLAST_CAP = 4;
/** Drawn at 2x (one art pixel is two world units), anchored at the centre. */
export const BLAST_SCALE = 2;
export type BlastKind = 'room' | 'hit';
/** A live blast: its animation, its centre in world units, and its start on the presentation clock (seconds). */
export interface Blast { kind: BlastKind; x: number; y: number; start: number }
/** Each animation's frame count and rate. */
export type BlastTimings = Readonly<Record<BlastKind, { frames: number; fps: number }>>;

const T = TILE_PX, HALF = T / 2;
const even = (v: number): number => 2 * Math.round(v / 2);

/** A tile's centre in world units. */
export function tileCentre(tile: number, width: number): { x: number; y: number } {
  const tx = tile % width;
  return { x: tx * T + HALF, y: ((tile - tx) / width) * T + HALF };
}

/** A room's centroid: the mean of its tile centres, rounded to 2 world units (a whole art pixel). */
export function roomCentroid(tiles: readonly number[], width: number): { x: number; y: number } {
  let x = 0, y = 0;
  for (const t of tiles) { const c = tileCentre(t, width); x += c.x; y += c.y; }
  return { x: even(x / tiles.length), y: even(y / tiles.length) };
}

/** Adds a blast at the end (the newest); past the cap the oldest go first. */
export function addBlast(list: readonly Blast[], blast: Blast, cap = BLAST_CAP): Blast[] {
  const next = [...list, blast];
  return next.slice(Math.max(0, next.length - cap));
}

/** The frame a blast shows at presentation time `t`: floor((t - start) x fps). */
export function blastFrame(b: Blast, t: number, timing: BlastTimings): number {
  return Math.max(0, Math.floor((t - b.start) * timing[b.kind].fps));
}

/** The blasts still showing at `t` (oldest first): a blast is removed after its last frame. */
export function liveBlasts(list: readonly Blast[], t: number, timing: BlastTimings): Blast[] {
  return list.filter((b) => blastFrame(b, t, timing) < timing[b.kind].frames);
}
```

- [ ] **Step 4: The names and the feature**

In `src/renderer/src/render/assetNames.ts`, replace

```ts
export const CONSOLE_ART_NAMES: readonly string[] = STATION_IDS.map((id) => `console.${id}`);
```

with

```ts
export const CONSOLE_ART_NAMES: readonly string[] = STATION_IDS.map((id) => `console.${id}`);
/** Art-ii (spec section 3): the two blast animations. */
export const BLAST_NAMES: readonly string[] = ['fx.blast.room', 'fx.blast.hit'];
```

and replace

```ts
add('optional', ...CONSOLE_ART_NAMES);   // Art-ii spec section 2: the bought consoles; the procedural desks without them
```

with

```ts
add('optional', ...CONSOLE_ART_NAMES);   // Art-ii spec section 2: the bought consoles; the procedural desks without them
add('optional', ...BLAST_NAMES);         // Art-ii spec section 3: the bought blasts; none without them
```

In `src/renderer/src/render/fallback.ts`, replace `import { CONSOLE_ART_NAMES, FACINGS } from './assetNames';` with `import { BLAST_NAMES, CONSOLE_ART_NAMES, FACINGS } from './assetNames';`, replace `| 'crewArt' | 'consoleArt';` with `| 'crewArt' | 'consoleArt' | 'blastArt';`, and replace

```ts
  consoleArt: [...CONSOLE_ART_NAMES],   // Art-ii spec section 2: the Maru consoles, one per station kind
```

with

```ts
  consoleArt: [...CONSOLE_ART_NAMES],   // Art-ii spec section 2: the Maru consoles, one per station kind
  blastArt: [...BLAST_NAMES],           // Art-ii spec section 3: the Pimen blasts
```

- [ ] **Step 5: The blasts in the interior feel** — in `src/renderer/src/render/interiorFeel.ts`:

Replace `import { AnimatedSprite, Container, Graphics, GraphicsContext } from 'pixi.js';` with `import { AnimatedSprite, Container, Graphics, GraphicsContext, Sprite } from 'pixi.js';`.

Replace

```ts
import type { Band } from './worldFit';
```

with

```ts
import type { Band } from './worldFit';
import type { GameAnimation } from './assets';
import { addBlast, BLAST_CAP, BLAST_SCALE, blastFrame, liveBlasts, roomCentroid, tileCentre, type Blast, type BlastKind, type BlastTimings } from './blastModel';
```

Replace

```ts
  /** Into effects.above: the normal particles, then the white flash. */
```

with

```ts
  /** Into effects.above: the normal particles, the blasts (when given, Art-ii spec section 3), then the white flash. */
```

Replace

```ts
 *  `consoleArt`: the consoles are the bought sprites (Art-ii spec section 2), so no screen cursor blinks on them. */
export interface InteriorFeelOptions { world: Container; band: Band; feel: () => FeelSetting; consoleArt?: boolean }
```

with

```ts
 *  `consoleArt`: the consoles are the bought sprites (Art-ii spec section 2), so no screen cursor blinks on them.
 *  `blasts`: the bought explosions (Art-ii spec section 3), played on hits and breach openings; absent, none draw. */
export interface InteriorFeelOptions { world: Container; band: Band; feel: () => FeelSetting; consoleArt?: boolean; blasts?: Readonly<Record<BlastKind, GameAnimation>> }
```

Replace

```ts
  const above = new Container(); above.addChild(particles.normal, flash);
```

with

```ts
  // The blasts: a pool of BLAST_CAP plain Sprites framed from the presentation clock, under the flash (Art-ii spec section 3).
  const blastLayer = new Container(), blastSprites: Sprite[] = [];
  const timing: BlastTimings | null = opts.blasts ? { room: { frames: opts.blasts.room.textures.length, fps: opts.blasts.room.fps }, hit: { frames: opts.blasts.hit.textures.length, fps: opts.blasts.hit.fps } } : null;
  if (opts.blasts) for (let k = 0; k < BLAST_CAP; k++) { const b = new Sprite(opts.blasts.room.textures[0]); b.anchor.set(0.5); b.scale.set(BLAST_SCALE); b.visible = false; blastLayer.addChild(b); blastSprites.push(b); }
  const above = new Container(); above.addChild(particles.normal, ...(opts.blasts ? [blastLayer] : []), flash);
```

Replace

```ts
  let smokes: HitSmoke[] = [], breachSeen
```

with

```ts
  let blasts: Blast[] = [];
  const blast = (kind: BlastKind, at: { x: number; y: number }, start: number): void => { if (opts.blasts) blasts = addBlast(blasts, { kind, x: at.x, y: at.y, start }); };
  const clearBlasts = (): void => { blasts = []; for (const b of blastSprites) b.visible = false; };
  let smokes: HitSmoke[] = [], breachSeen
```

In `build`, replace

```ts
    smokes = []; breachSeen = null; flashTick = Number.NEGATIVE_INFINITY; flashLeft = 0; flash.visible = false;
  }
```

with

```ts
    smokes = []; breachSeen = null; flashTick = Number.NEGATIVE_INFINITY; flashLeft = 0; flash.visible = false; clearBlasts();
  }
```

In `onHit`, replace

```ts
      if (floor.length) smokes.push({ key: `duel:${flashTick}`, tiles: [floor[emitter.random.int(floor.length)]!], until: t + SMOKE_SECONDS });
```

with

```ts
      if (floor.length) {
        const tile = floor[emitter.random.int(floor.length)]!;
        smokes.push({ key: `duel:${flashTick}`, tiles: [tile], until: t + SMOKE_SECONDS });
        blast('room', tileCentre(tile, d.width), t);   // the duel's one room blast, on the smoke's tile
      }
```

and replace

```ts
        smokes.push({ key: `room:${room}`, tiles: d.roomTiles[room]!, until: t + SMOKE_SECONDS });
```

with

```ts
        smokes.push({ key: `room:${room}`, tiles: d.roomTiles[room]!, until: t + SMOKE_SECONDS });
        blast('room', roomCentroid(d.roomTiles[room]!, d.width), t);
```

In `draw`, replace

```ts
      for (const s of opened.opened) debrisBurst(emitter, state, s);   // even at pdt 0: the hit that opens a breach starts the hitstop this frame, and a 0 step holds the debris until the clock runs
```

with

```ts
      for (const s of opened.opened) {
        debrisBurst(emitter, state, s);   // even at pdt 0: the hit that opens a breach starts the hitstop this frame, and a 0 step holds the debris until the clock runs
        blast('hit', tileCentre(d.siteTile[s]!, d.width), t);   // and a hit spark on the opening
      }
```

and replace

```ts
      particles.draw(emitter.particles);
```

with

```ts
      particles.draw(emitter.particles);
      if (timing && opts.blasts) {
        const anims = opts.blasts;
        blasts = liveBlasts(blasts, t, timing);   // each removed after its last frame; held while the clock holds (hitstop, pause)
        blastSprites.forEach((b, k) => { const live = blasts[k]; b.visible = live !== undefined; if (live) { b.texture = anims[live.kind].textures[blastFrame(live, t, timing)]!; b.position.set(live.x, live.y); } });
      }
```

In `reset`, replace

```ts
      clock.reset(); Object.assign(shake, createShake()); emitter.clear(); smokes = []; breachSeen = null; puffs = [];
```

with

```ts
      clock.reset(); Object.assign(shake, createShake()); emitter.clear(); smokes = []; breachSeen = null; puffs = []; clearBlasts();
```

- [ ] **Step 6: Both views pass the animations**

In `src/renderer/src/render/renderer.ts`, replace

```ts
  const feel = createInteriorFeel({ world, band: WORLD_BAND, feel: () => feelSetting, consoleArt: featureReady(missing, 'consoleArt') });   // Art-i spec sections 5-8; Art-ii: the bought consoles
```

with

```ts
  const feel = createInteriorFeel({   // Art-i spec sections 5-8; Art-ii: the bought consoles and blasts
    world, band: WORLD_BAND, feel: () => feelSetting, consoleArt: featureReady(missing, 'consoleArt'),
    blasts: featureReady(missing, 'blastArt') ? { room: assets.animation('fx.blast.room'), hit: assets.animation('fx.blast.hit') } : undefined
  });
```

In `src/renderer/src/render/duel/interiorView.ts`, replace

```ts
  const fx = createInteriorFeel({ world, band: INTERIOR_BAND, feel, consoleArt: featureReady(missing, 'consoleArt') });   // Art-i spec sections 5-8; Art-ii: the bought consoles
```

with

```ts
  const fx = createInteriorFeel({   // Art-i spec sections 5-8; Art-ii: the bought consoles and blasts
    world, band: INTERIOR_BAND, feel, consoleArt: featureReady(missing, 'consoleArt'),
    blasts: featureReady(missing, 'blastArt') ? { room: assets.animation('fx.blast.room'), hit: assets.animation('fx.blast.hit') } : undefined
  });
```

- [ ] **Step 7: The manifest entries** — create `.art/add-blasts.ts`:

```ts
// Art-ii Task 4: append the two Pimen blast sheets to public/assets/manifest.json (run once).
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'public/assets/manifest.json', m = JSON.parse(readFileSync(path, 'utf8')) as { file: string }[];
if (m.some((e) => e.file.startsWith('paid/pimen/'))) throw new Error('the Pimen entries are already there');
const blast = (file: string, size: number, name: string, count: number, fps: number) => ({
  title: 'Explosion VFX', author: 'Pimen', source: 'https://pimen.itch.io/explosion-effect', license: 'paid', retrieved: '2026-11-16',
  modifications: 'frames cut and remapped to the FTLite house palette by npm run art:import', editedBy: 'FTLite art import',
  credit: 'Explosion VFX by Pimen (pimen.itch.io)', required: false, file,
  sheet: { frameW: size, frameH: size, frames: {}, animations: { [name]: { frames: Array.from({ length: count }, (_, i) => i), fps, loop: false } } }
});
m.push(blast('paid/pimen/explosion-room.png', 32, 'fx.blast.room', 14, 20) as never, blast('paid/pimen/explosion-hit.png', 16, 'fx.blast.hit', 11, 24) as never);
writeFileSync(path, `${JSON.stringify(m, null, 2)}\n`);
console.log(`manifest: ${m.length} entries`);
```

Run: `npx tsx .art/add-blasts.ts && npm run credits`
Expected: `manifest: 38 entries`; `credits.generated.ts (13 lines)`, the new line `"Explosion VFX by Pimen (pimen.itch.io)"`.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run tests/blasts.test.ts 2>&1 | tail -5`
Expected: `Tests 9 passed (9)`.

Run: `npx vitest run tests/interiorFeel.test.ts tests/duelInterior.test.ts tests/consoleArt.test.ts tests/crewArt.test.ts tests/assets.test.ts tests/manifest.test.ts tests/paidManifest.test.ts tests/credits.test.ts tests/renderPure.test.ts tests/artGuards.test.ts tests/onlineRenderer.test.ts 2>&1 | tail -5`
Expected: all pass (`artGuards` 171).

Run: `npx tsc -b; echo "tsc exit=$?"`
Expected: `tsc exit=0`.

- [ ] **Step 9: Commit**

```bash
git add -- src/renderer/src/render/blastModel.ts src/renderer/src/render/assetNames.ts src/renderer/src/render/fallback.ts src/renderer/src/render/interiorFeel.ts src/renderer/src/render/renderer.ts src/renderer/src/render/duel/interiorView.ts public/assets/manifest.json public/THIRD_PARTY_NOTICES.txt src/renderer/src/render/credits.generated.ts tests/blasts.test.ts
git commit -m "$(cat <<'EOF'
feat(art-ii): Pimen blasts on hits and breach openings (blastArt), framed from the presentation clock, cap 4

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The art bible and the gates

**Files:**
- Modify: `docs/art/bible.md`, `docs/gates.md`

**Interfaces:**
- Consumes: the commands and names of Tasks 1-4.
- Produces: the "Adding a pack" section, the Art-ii gate section (with the owner's licence check).

- [ ] **Step 1: The bible's rotation rule** — in `docs/art/bible.md`, replace

```
- No sprite is rotated except by quarter turns (today only the vent puff, until Art-i-b replaces it), and none is scaled except by whole numbers (the world scale is snapped so that one art pixel is a whole number of screen pixels; see `snapWorldScale` in `src/renderer/src/render/worldFit.ts`).
```

with

```
- No sprite is rotated except by quarter turns (today the bought consoles, turned to their wall, and a downed crew member), and none is scaled except by whole numbers (the world scale is snapped so that one art pixel is a whole number of screen pixels; see `snapWorldScale` in `src/renderer/src/render/worldFit.ts`).
```

- [ ] **Step 2: The palette paragraph** — in `docs/art/bible.md`, replace

```
- One file: `src/renderer/src/render/palette.json`, read by the renderer (`palette.ts`) and by the import script (`npm run art:import`).
```

with

```
- One file: `src/renderer/src/render/palette.json`, written by `npm run art:palette` and read by the renderer (`palette.ts`) and by the import script (`npm run art:import`).
```

and replace

```
- Today's palette is a placeholder, **Apollo** by AdamCYounis (46 colours, https://lospec.com/palette-list/apollo). Art-ii replaces it with the bought interior pack's own palette.
```

with

```
- The palette is built from the bought packs (Art-ii): `npm run art:palette` (`scripts/art/buildPalette.ts`) counts every opaque pixel of every distinct frame in `art/import.json`, keeps the explosion pack's colours exactly, fills the rest of the 48 colours by k-means in OKLab, maps the previous palette's roles and ramps onto the new colours, then applies `art/palette-overrides.json` (the fire ramp, the white ramp starts and eight roles set by hand). The same packs give the same bytes. Never edit `palette.json` by hand: change the overrides and rebuild.
```

- [ ] **Step 3: The registered paid names and "Adding a pack"** — in `docs/art/bible.md`, replace

```
- Registered paid names today: `house.floor.0` to `house.floor.3` (the `houseFloor` feature). A missing paid file falls back to the procedural floor.
```

with

```
- Registered paid names today, each group a feature that falls back as a whole when any name is missing:
  - `house.floor.0` to `house.floor.3` (`houseFloor`, Maru-98): the procedural floor without them.
  - `crew.p<k>.stand.<d>`, `crew.p<k>.idle.<d>`, `crew.p<k>.walk.<d>` for k 0-3, d n e s w (`crewArt`, LimeZu, 48 names): the tinted Puny crew without them. Player slot `pid % 4` wears sheet 04, 07, 13 or 19.
  - `console.<STATION_IDS id>` (`consoleArt`, Maru-98, 7 names): the procedural desks, screen strips and cursor blink without them.
  - `fx.blast.room`, `fx.blast.hit` (`blastArt`, Pimen): no blasts without them. `explosion-big.png` is imported but unbound.

## Adding a pack

1. Extract the pack outside the repo, under `C:\Users\djuar\FTLite-assets` (or the folder `FTLITE_ASSETS` names).
2. Add its frames to `art/import.json`: one output per sheet, and one output per sprite that is placed or rotated on its own (a one-frame output is exactly the art, with no padding from a shared cell).
3. Only when the palette should change: `npm run art:palette`. It reads every frame in `art/import.json`, so a new pack moves the palette; re-import everything after it.
4. `npm run art:import`, then look at `.art/contact.png`.
5. Bind the names in `public/assets/manifest.json`: licence `paid`, `required: false`, `source` the store page URL, `retrieved` the purchase date, the credit line, and `modifications` `frames cut and remapped to the FTLite house palette by npm run art:import` with `editedBy` `FTLite art import`. Register new names as optional in `src/renderer/src/render/assetNames.ts` and group them as a feature in `fallback.ts`, with a drawing path for when they are missing (a fresh clone has no paid files).
6. `npm run credits`, and commit the manifest, the generated notices and credits, `art/import.json` and (if rebuilt) `palette.json`, never the PNGs.
```

- [ ] **Step 4: The gate** — append to the end of `docs/gates.md`:

```

## Art-ii: the bought art in the ship interior (2026-11-16)

Spec `docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md`, plan `docs/superpowers/plans/2026-11-16-art-ii-bought-art.md`. Views and art only: SIM_VERSION and the goldens are unchanged.

- [ ] Automated (Art-ii): `npm test` passes, including the palette builder (determinism, kept explosion colours, overrides, k = 48 minus kept, 48 kept colours failing), the LimeZu crew (facing fold, slot pick, foot anchor and carry offset, downed rotation and reset, seated facing, callout lift), the Maru consoles (names, one-frame outputs, wall-face placement on even units, quarter turns, look tints, no strip or cursor), the Pimen blasts (one per hit room, one spark per opening, cap 4, frames from the presentation clock, cleared on reset) and each feature's fallback; `npx tsc -b` clean.
- [ ] Owner-local palette check (needs the packs in `C:\Users\djuar\FTLite-assets`): `npm run art:palette` then `npm run art:import` leaves `git status --short` empty.
- [ ] Owner check before any public release: the Maru-98 (https://maru-98.itch.io/) and Pimen (https://pimen.itch.io/explosion-effect) packs ship no licence text; read their store pages' terms (commercial use, credit, redistribution inside a built game) and record them here. LimeZu's `LICENSE.txt` (read 2026-11-16) allows commercial use and editing, forbids resale and redistribution of the asset itself, and requires credit; the credits screen carries all three credit lines.
- [ ] Owner look gate (`npm run dev`, and the screenshots in `C:\Users\djuar\FTLite-shots\art-ii\`): the crew, the consoles and the hits; does the interior now look like a game? Date and notes: pending.
```

- [ ] **Step 5: Check and commit**

Run: `grep -n "Adding a pack\|art:palette" docs/art/bible.md; grep -n "Art-ii" docs/gates.md`
Expected: the new section heading and three `art:palette` mentions in the bible; the new gate heading in `docs/gates.md`.

```bash
git add -- docs/art/bible.md docs/gates.md
git commit -m "$(cat <<'EOF'
docs(art-ii): art bible "Adding a pack" and the bought-art names; Art-ii gate with the owner's licence check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Final verification and screenshots

**Files:**
- Create (gitignored, never committed): `.art/shots/index.html`, `.art/shots/main.ts`, `.art/shots/vite.config.mjs`, `.art/shots/shot.cjs`, `.art/shots/all.mjs`
- Modify: `docs/gates.md` (tick the automated item)
- Output (outside the repo): `C:\Users\djuar\FTLite-shots\art-ii\*.png`

**Interfaces:**
- Consumes: everything above; `createRenderer`, `Renderer.stageScale`, `Renderer.feel`, `createInteriorView(assets, stageScale, feel)`, `createSimState`, `createDuel`, `sitDown`, `loadAssets`.
- Produces: the test count, the build, six screenshots.

- [ ] **Step 1: Full suite**

Run (on an idle machine): `npm run build 2>&1 | tail -1 && npx vitest run 2>&1 | tail -5`
Expected: `✓ built in ...`; then `Test Files 251 passed (251)` and `Tests 3530 passed (3530)`, i.e. the Step 0 baseline (3487 in 247 files) plus **43** tests in **4** files (Decision 14), and 0 failed (the Step 0 failure is fixed by Task 1). Rerun a timed-out sim file alone before calling it a failure (Step 0.3).

- [ ] **Step 2: Types and the unchanged sim**

Run: `npx tsc -b; echo "tsc exit=$?"`
Expected: `tsc exit=0` and no other output.

Run: `git diff 6613339 --stat -- src/renderer/src/sim src/renderer/src/authority src/network src/shared; grep -n "SIM_VERSION =" src/renderer/src/sim/tuning.ts; npx vitest run tests/golden.test.ts tests/duelGolden.test.ts tests/boundary.test.ts 2>&1 | tail -3`
Expected: the diff stat prints nothing; `export const SIM_VERSION = 39;`; the three files pass.

Run: `npm run art:palette > /dev/null && npm run art:import > /dev/null && git status --short`
Expected: no output (the owner-local acceptance check: a rebuild and re-import change nothing tracked).

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
// Art-ii visual check harness (gitignored, never committed): draws the sector ship or the duel interior with the real
// renderer layers and the bought art. ?view=duel|skiff|cutter&look=normal|hit. "hit": a fire, and a hit every 0.4 s of real time.
import skiff from '../../src/renderer/src/sim/ship/skiff.json';
import cutter from '../../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { createSimState } from '../../src/renderer/src/sim/state';
import { createDuel } from '../../src/renderer/src/sim/duel/state';
import { Position } from '../../src/renderer/src/sim/components';
import { sitDown } from '../../src/renderer/src/sim/stations';
import { loadAssets } from '../../src/renderer/src/render/assets';
import { createRenderer } from '../../src/renderer/src/render/renderer';
import { createInteriorView } from '../../src/renderer/src/render/duel/interiorView';
import type { ViewEvent } from '../../src/renderer/src/render/tactical/fxModel';

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search), view = q.get('view') ?? 'skiff', hit = q.get('look') === 'hit';
  const assets = await loadAssets('./assets/manifest.json');
  console.log(`missing optional names: ${assets.missing.length}`);
  const renderer = await createRenderer(assets);
  renderer.resize(window.innerWidth, window.innerHeight);
  let hits = 0, last = performance.now();
  const due = (): boolean => { const now = performance.now(); if (!hit || now - last < 400) return false; last = now; hits++; return true; };   // a hit every 0.4 s of real time
  if (view === 'duel') {
    for (const child of renderer.app.stage.children) child.visible = false;
    const d = createDuel(parseShip(cutter), 5), interior = createInteriorView(assets, renderer.stageScale, renderer.feel);
    if (hit) d.interior.rooms.fire[1] = 8;
    renderer.app.stage.addChild(interior.container);
    const shot = { kind: 'laser', ship: 1, hit: true, x1: 0, y1: 0, x2: 1, y2: 1 } as unknown as ViewEvent;
    renderer.app.ticker.add(() => {
      const events = due() ? [shot] : [];
      interior.draw(d, d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! })), 1, renderer.app.ticker.deltaMS / 1000, events);
    });
  } else {
    const state = createSimState(parseShip(view === 'cutter' ? cutter : skiff), view === 'cutter' ? 4 : 2, 1);
    const seat = 0, t = state.derived.stationTile[seat]!, eid = state.crew[0]!;   // one crew member seated at the first station, on its tile
    Position.x[eid] = (t % state.derived.width) + 0.5; Position.y[eid] = Math.floor(t / state.derived.width) + 0.5; sitDown(state, 0, seat);
    if (hit) state.rooms.fire[1] = 8;
    renderer.recordPrev(state);
    renderer.app.ticker.add(() => {
      if (due()) { state.rooms.impactTick[hits % state.derived.volume.length] = state.tick; state.tick++; }
      renderer.draw(state, 1);
    });
  }
  (window as unknown as { shotReady: boolean }).shotReady = true;
}
main().catch((e) => { document.body.textContent = String(e); });
```

`.art/shots/vite.config.mjs`:

```js
// Serves the Art-ii visual check harness with the repo's public/ assets (gitignored, never committed).
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
// Takes the Art-ii screenshots (gitignored, never committed). usage: node .art/shots/all.mjs <electron.exe> <out dir>
// Needs the harness server running: npx vite --config .art/shots/vite.config.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [electron, outDir] = process.argv.slice(2);
if (!electron || !outDir) { console.error('usage: node .art/shots/all.mjs <electron.exe> <out dir>'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const shots = [];
for (const view of ['duel', 'skiff', 'cutter']) for (const look of ['normal', 'hit']) shots.push([`view=${view}&look=${look}`, 1920, 1080, `${view}-${look}.png`]);
let failed = 0;
for (const [query, w, h, name] of shots) {
  const out = resolve(outDir, name);
  const env = { ...process.env, SHOT: `http://localhost:5299/?${query}|${w}|${h}|${out}` }; delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(electron, [join(import.meta.dirname, 'shot.cjs')], { env, stdio: 'ignore', timeout: 60000 });
  const ok = r.status === 0 && existsSync(out) && statSync(out).size > 1000;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (${w}x${h}) exit ${r.status}`);
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
rm -f .art/shots/shot.log; node .art/shots/all.mjs "$E" "C:/Users/djuar/FTLite-shots/art-ii"; cat .art/shots/shot.log
```

Expected:

```
ok   duel-normal.png (1920x1080) exit 0
ok   duel-hit.png (1920x1080) exit 0
ok   skiff-normal.png (1920x1080) exit 0
ok   skiff-hit.png (1920x1080) exit 0
ok   cutter-normal.png (1920x1080) exit 0
ok   cutter-hit.png (1920x1080) exit 0
```

and in the log, `page: missing optional names: 17` for every shot (the in-house placeholders: `breach.*`, `floor.damaged.*`, `vent.puff`, `fx.arc`, `crew.sit` and the ten `icon.*`; none of the 57 Art-ii names). A larger number means a paid PNG did not load: check `public/assets/paid/`.

- [ ] **Step 5: Stop the harness processes**

Run: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id $_.OwningProcess -Force }; Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | ? { $_.CommandLine -like '*art-ii*shot.cjs*' } | % { Stop-Process -Id $_.ProcessId -Force }"`
Then: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | Measure-Object | % Count"` prints `0`.

- [ ] **Step 6: Look at the screenshots** (Read each PNG) and check:
  - Every view: each crew member is a LimeZu character (in the Cutter, four different ones), feet on the floor, no colour tint; player 0 seated at station 0 shows the standing frame facing that console's wall.
  - Consoles: an orange Maru console at Navigation, Weapons, Science and Doors, the grey rack at Engineering, the green machine at Life Support, the med pod at Medbay (a Skiff group draws its first member's sprite), each backed onto its wall and turned to face the room; no amber desk strip and no blinking cursor; the room lamps and console glows still show.
  - `hit`: a Pimen room blast (an orange burst about 2 × 2 tiles) at a room centre or, in the duel, on one floor tile, drawn under the white flash; the fire, smoke and the alert pulse as in Art-i-b.
  Record any visual problem for the owner rather than fixing it here (the owner's look is the gate).

- [ ] **Step 7: Tick the automated gate item and commit**

In `docs/gates.md`, in the Art-ii section, replace `- [ ] Automated (Art-ii):` with `- [x] Automated (Art-ii):` and append the measured totals to that line, e.g. ` Measured 2026-11-16: 3530 tests in 251 files, tsc clean, build ok.` with the real numbers.

```bash
git add -- docs/gates.md
git commit -m "$(cat <<'EOF'
docs(art-ii): automated gate measured

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Report**

Report: the totals against the baseline, `tsc` and build results, SIM_VERSION and the goldens unchanged, the empty `git status` after `art:palette` + `art:import`, the six screenshot paths under `C:\Users\djuar\FTLite-shots\art-ii\`, and observations for the owner's gate ("does the interior now look like a game?"; also try `npm run dev`). Known look points to mention: a crew member seated at a south-wall console overlaps its art, and the rack (54 units) and med pod (48 units) overlap the neighbouring floor (both accepted by the spec).

---

## Spec notes (problems found while planning; the spec is unchanged)

1. **Section 4, step 1, "every frame".** Counting repeated frames (the floor output repeats one rectangle four times; Task 3's console outputs repeat frames of `stations.png` and `machines.png`) would make the palette depend on how frames are grouped into outputs, so adding the console outputs after the palette build would break the spec's own "re-running leaves git diff empty" check. The plan counts each distinct (pack, rectangle) once (Decision 2).
2. **Section 4, steps 4-5, details.** "Dropping repeats" (any repeat, not only adjacent ones), the padding tie order, the override format for a single ramp entry, re-tidying a ramp after an override, and what happens to an override colour outside the palette (the build fails naming it) are not specified; Decision 3 fixes them. With the owner's packs all override colours are in the palette (7 kept explosion colours plus k-means centres).
3. **The branch's own `tests/artImport.test.ts`** asserts that `art/import.json` lists no outputs; the import checkpoint (274626c) filled it, so the test fails on `art-ii` before this plan. Task 1 replaces it (Decision 12).
4. **Section 1, callouts.** The bubble's tail sat 0.6 tile (19.2 units) over the crew position, inside a LimeZu head (50 units tall). The plan raises it to 64 units with `crewArt` (Decision 6), as the spec allows.
5. **Section 1, "dead the same, grey".** Read as the same pose and the existing grey tint; the alpha stays as today (0.85 downed, 1 dead) (Decision 5).
6. **Section 1, measured head row.** Three sheets' heads start at row 8 and crew_19's at row 7; the spec's `LIMEZU_HEAD_ROW = 7` (the tallest) is kept, so the carry offset is 54 for every character.

## Self-review against the spec

- Section 1 (crew): the four sheets and the 52-frame layout with LimeZu's right, up, left, down order (verified by eye) — Task 2, Decision 4; 48 optional `crew.p<k>.*` names, feature `crewArt`, no collision with the required Puny names — Task 2 test; slot `pid % 4` — `crewSlot`; no `CREW_COLORS` tint, dead grey — crew layer test; `facing4` — test; idle and walk animations (6 and 10 fps), walk phase by id — `limezuSheet`, `crewSprites.ts`; seated facing from `stationSides` cached by `layoutHash` — test; downed +90 degrees about the centre at 85 %, reset on getting up — test; foot anchor 1 from the row constants, carry 54 — test; callouts checked and raised — Decision 6, test; Puny fallback — test; boarders untouched — Decision 5.
- Section 2 (consoles): seven one-frame outputs with the spec's rectangles, bound by name — Task 3 Step 3, test; group uses the first member — `consoleArtName`, test; back edge on the turned desk's outer edge per side and flush, centred, quarter turns about the centre, top-left even — `consolePlacement`, test over every side, flush and size; tints 80 % and 60 % — test; no strip and no cursor with `consoleArt`, glows stay — tests; `createConsoleLayer(assets)` at both call sites, sprites at index 0 under the fixtures, redrawn only on a look or layout change — Task 3, tests; fallback — test.
- Section 3 (blasts): the feel owns them, optional `blasts` passed by both views when `blastArt` is ready — Task 4; one-shot `fx.blast.room` 20 fps and `fx.blast.hit` 24 fps, `explosion-big` unbound — test; one per hit room at the rounded centroid, the duel smoke tile, one spark per opening, 2x, anchor 0.5 — tests; plain Sprites framed from `clock.t`, held in the hitstop and at dt 0, removed after the last frame, cap 4 cutting the oldest, cleared on reset and layout change — tests; under the flash in `above` — test; fallback — test.
- Section 4 (tools): the builder's algorithm steps 1-6, `npm run art:palette`, the overrides file, tests on generated PNGs (determinism, kept colours, overrides, every role and ramp colour present, k = 48 minus kept, 48 kept failing) — Task 1; the regeneration and the git-diff-empty check — Task 1 Step 8, Task 6 Step 2; the bible's "Adding a pack" — Task 5.
- Section 5 (licences): the three packs' URLs, date and credit lines — Tasks 2-4 scripts, tests; the Maru-98 and Pimen terms as an owner check in `docs/gates.md` — Task 5.
- Testing and gate: every listed unit test — Tasks 1-4; all existing tests pass, SIM_VERSION and goldens unchanged — Task 6; screenshots of the duel and the sector Skiff and Cutter, normal and with a hit and a fire, saved to `C:\Users\djuar\FTLite-shots\art-ii\` — Task 6; the owner's look — Task 5 gate entry.
