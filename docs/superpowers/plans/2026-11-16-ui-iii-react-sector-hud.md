# UI-iii: The Sector HUD in React Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the sector HUD with React on UI-ii's pixel stage instead of Pixi. The HUD covers the clock card, power and threat panels, the four player blocks, every console card, the event card, the banner/notice/summary/lobby card, the credits and the sector map. It keeps `hudLayout.ts`'s rectangles and `hud.ts`'s rules, then deletes `render/hud.ts`, `render/mapPanel.ts` and `render/panel.ts`.

**Architecture:**
- **Data in.** The sector sessions keep calling `deps.hud.update(buildHudModel(...))`. `deps.hud` becomes a store sink (`createHudSink`) that shares the model and writes a new `hud` slice, and the sessions call `deps.hud.clear?.()` on dispose.
- **Rendering.** `<Hud>` renders the model on `<Stage>` with UI-ii's `PixelText`, `Box`, `Panel` and `Bar`, plus three new primitives: `<Row>` (hud.ts's `fillRow`), `<CellRow>` (hud.ts's `cellRow`) and `<Icon>`. `<Icon>` draws images from a cache that Pixi's `extract` builds once at mount.
- **The map.** The sector map is an SVG for the shapes, with `PixelText` for the marks.

**Tech Stack:** TypeScript 5.8, React 19, zustand 5, Pixi 8.19 (for the world, and once at mount to extract icon images), Vitest 3.2 + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-16-react-ui-layer-design.md`:
- §1: the render rule
- §2: the hud slice, the sink, the sharing, the selector rule, the failure modes
- §3: the UI-iii rows and what stays in Pixi
- §4: the stage, rows, panels, cells, images, the map SVG, pointer events
- §7: the sector HUD
- §8: tests, guards, the visual check

**Prerequisites:** UI-ii is merged (master `9c124bb` or later). These are already in place:
- the pixel stage: `ui/stage/*`, `ui/glyphs.ts`, `ui/sinks.ts` (with `replaceEqualDeep`) and `ui/perf.ts`
- `mountUi` (async, with `GlyphContext`)
- the probe: `?mode=uiprobe`, `app/uiProbe.ts`, `ui/probe/mountProbe.tsx`

## Global Constraints

- **No sim, authority or network change.** `npm run test:determinism` and the goldens stay unchanged. Nothing under `src/renderer/src/{sim,authority,clientControl,headless,net,events}`, `src/network`, `src/shared`, `src/main`, `src/preload` or `src/utility` changes.
- **Every rectangle, position, size and tint comes from the existing constants:** `hudLayout.ts`, `theme.ts`, `enemyWindowModel.ts` (`WINDOW`), and `mapPanel.ts`'s `MAP_W`/`MAP_H`/`nodeX`/`nodeY`/rocks, moved to a pure module in Task 1. They also come from `hud.ts`'s logic, quoted in this plan. Nothing is written twice.
- **The UI reads only models.** `src/renderer/src/ui/**` imports values only from `render/` models and theme modules, `app/` model modules, `shared/` and itself. `tests/uiBoundary.test.ts` enforces this.
- **No Pixi in the UI's import graph.** A pure `render/` module imported by `ui/**` must not import a Pixi module, directly or transitively. If jsdom tests print "Not implemented: HTMLCanvasElement's getContext()", find the chain and move the constant to a pure module. UI-ii's precedent is `render/tactical/shipColours.ts`.
- **Selectors return a store reference or a primitive.** Panels are `React.memo`. The stage takes no pointer events.
- **Text is `PixelText`, hard-edged.** Today's Pixi text is soft-edged (UI-ii found this). The visual criterion is that rectangles, positions and glyph shapes match, not byte equality.
- **The Electron smokes pass unchanged.** The sector online smokes run through H-2a-iii's test-only entry and show this HUD. No smoke script or driver is edited.
- **Worktree:** use `.worktrees/ui-iii` with its own `npm ci` and the `services/signalling/node_modules` junction (memory "Worktree signalling junction"). Delete the junction before `git worktree remove`.

## Deviations from the spec (stated)

1. **The two model values are exported from `hudModel.ts`, not added as model fields.** Spec §7 adds `HudPlayer.seatedName` and `HudModel.maxCells`. Instead, `hudModel.ts` exports `seatedName(p)` and `HUD_MAX_CELLS`, since every `HudPlayer` construction site would otherwise change. The UI still reads only the render model module, never sim, which is the rule the spec states.
2. **`tintColor` and its three colours move to `roomIconModel.ts`.** Today they live in `roomIcons.ts`, a Pixi module, and `roomIcons.ts` re-exports them. This keeps Pixi out of the UI's import graph.
3. **The visual check uses fixture HUD models in the probe** (`?mode=uiprobe&probe=hud&fixture=N&engine=pixi|react`). After H-2a-iii the sector HUD is reachable only through the two-process test-only online entry. The Pixi variant exists only until Task 5 deletes `hud.ts`. Its screenshots are taken first (Task 4).

## File Structure

| File | Responsibility |
|---|---|
| `src/renderer/src/render/hudModel.ts` | Modified: exports `seatedName(p)` and `HUD_MAX_CELLS`. |
| `src/renderer/src/render/roomIconModel.ts` / `roomIcons.ts` | Modified: `tintColor` and its colours move to the model; `roomIcons.ts` re-exports them. |
| `src/renderer/src/render/mapModel.ts` | New, pure: `MAP_W`, `MAP_H`, `nodeX`, `nodeY`, `NODE_R`, `ROCKS`, `MAP_FLEET`, moved from `mapPanel.ts`. |
| `src/renderer/src/ui/menuState.ts`, `ui/store.ts`, `ui/sinks.ts` | Modified: the `hud` slice, `epochs.hud`, `createHudSink`. |
| `src/renderer/src/ui/images.ts` | Pure: `UiImage`, `UiImages`, `buildImageCache(source)`, `hudImageNames(missing)`. |
| `src/renderer/src/ui/stage/ImagesContext.ts`, `Icon.tsx`, `Row.tsx`, `CellRow.tsx`, `rowLayout.ts`, `hairline.ts` | New stage primitives. |
| `src/renderer/src/ui/hud/Hud.tsx`, `SidePanels.tsx`, `Headline.tsx`, `SummaryCard.tsx`, `PlayerBlock.tsx`, `ConsoleCard.tsx`, `consoleRows.ts`, `EventCardView.tsx`, `Credits.tsx`, `MapPanel.tsx` | The HUD region. |
| `src/renderer/src/app/uiImages.ts` | The Pixi image source (`extract.base64`) for `buildImageCache`. |
| `src/renderer/src/app/hudFixtures.ts` | Probe fixtures: HUD models built with `buildHudModel` on a real sim state, then patched per panel. |
| `src/renderer/src/session.ts`, `app/onlineSession.ts`, `render/renderer.ts`, `render/enemyWindow.ts`, `main.ts`, `ui/UiRoot.tsx`, `ui/mount.tsx`, `app/uiProbe.ts` | Modified wiring. |
| Deleted | `render/hud.ts`, `render/mapPanel.ts`, `render/panel.ts`. |

---

### Task 0: Prerequisite and worktree

- [ ] **Step 1:** In the main checkout, run `git merge-base --is-ancestor 9c124bb master && echo ok` (expect `ok`). Then run `git log --oneline 9c124bb..master -- src/renderer/src/render/hud.ts src/renderer/src/render/hudModel.ts src/renderer/src/render/mapPanel.ts src/renderer/src/app/session.ts src/renderer/src/app/onlineSession.ts src/renderer/src/main.ts src/renderer/src/render/renderer.ts`. Read any commit it lists, and check that the lines this plan quotes still hold. If they changed, report NEEDS_CONTEXT with the diff.
- [ ] **Step 2:**
```bash
git worktree add .worktrees/ui-iii -b ui-iii master
cd .worktrees/ui-iii && npm ci
powershell -NoProfile -Command "New-Item -ItemType Junction -Path '<abs>\.worktrees\ui-iii\services\signalling\node_modules' -Target '<abs main>\services\signalling\node_modules'"
```

---

### Task 1: Pure model moves, the hud slice and the hud sink

**Files:**
- Modify: `src/renderer/src/render/hudModel.ts`, `render/roomIconModel.ts`, `render/roomIcons.ts`, `render/mapPanel.ts`
- Create: `render/mapModel.ts`
- Modify: `ui/menuState.ts`, `ui/store.ts`, `ui/sinks.ts`, `src/renderer/src/app/session.ts`, `src/renderer/src/app/onlineSession.ts`
- Test: `tests/uiHudSink.test.ts`; extend `tests/hud.test.ts` (one case for the two exports)

**Interfaces:**
- Produces:
  - `seatedName(p: HudPlayer): string` and `HUD_MAX_CELLS: number` (in `hudModel.ts`)
  - `tintColor(t: IconTint): number` (in `roomIconModel.ts`)
  - from `mapModel.ts`: `MAP_W = 400`, `MAP_H = 340`, `nodeX(c)`, `nodeY(k, n)`, `NODE_R = 11`, `ROCKS`, `MAP_FLEET = 0xd83a3a`
  - `UiState.hud: HudModel | null`, `UiState.epochs.hud: number`
  - `createHudSink(store, perf?): HudSink`, where `HudSink = { update(m: HudModel): void; clear(): void }`
  - `SessionDeps.hud` typed `{ update(m: HudModel): void; clear?(): void } | null`

- [ ] **Step 1: Write the failing tests**

`tests/uiHudSink.test.ts`:
```ts
// The hud sink (React UI spec §2, §7): the sector sessions' deps.hud. update shares and writes the hud slice, an equal
// model writes nothing, the first model bumps epochs.hud, clear() returns it to null.
import { describe, expect, it } from 'vitest';
import { createUiStore } from '../src/renderer/src/ui/store';
import { createHudSink } from '../src/renderer/src/ui/sinks';
import { buildHudModel, HUD_MAX_CELLS, seatedName } from '../src/renderer/src/render/hudModel';
import { createCardUi } from '../src/renderer/src/clientControl/cardController';
import { STATION_MAX, STATION_OVERDRIVE, UPGRADE_MAX } from '../src/renderer/src/sim/tuning';
import { STATION_NAMES } from '../src/renderer/src/sim/stationKinds';
import { makeState } from './helpers/sim';

const model = () => buildHudModel(makeState(2), { mode: 'player', player: 0, ui: createCardUi() }, { phase: 'running', message: '', slots: [{ status: 'active', key: 'kb:0' }, { status: 'bot', key: null }] });

describe('the hud sink', () => {
  it('writes a changed model once, skips an equal one, bumps the epoch once and clears', () => {
    const store = createUiStore({ onlineAvailable: false }), sink = createHudSink(store); let writes = 0; store.subscribe(() => { writes++; });
    const m = model(); sink.update(m); sink.update(structuredClone(m)); expect(writes).toBe(1);
    sink.update({ ...structuredClone(m), message: 'x' }); expect(writes).toBe(2); expect(store.getState().epochs.hud).toBe(1);
    sink.clear(); expect(store.getState().hud).toBeNull(); sink.clear(); expect(writes).toBe(3);
  });
});

describe('the HUD view values the UI reads', () => {
  it('names a seated player\'s station and counts the widest cell row', () => {
    const p = model().players[0]!;
    expect(seatedName({ ...p, seated: null })).toBe(''); expect(seatedName({ ...p, seated: 2 })).toBe(STATION_NAMES[2]);
    expect(HUD_MAX_CELLS).toBe(Math.max(...STATION_MAX) + UPGRADE_MAX + STATION_OVERDRIVE);
  });
});
```

- [ ] **Step 2: Run to see it fail.** Run `npx vitest run tests/uiHudSink.test.ts`. It should FAIL, because `createHudSink`, `seatedName` and `HUD_MAX_CELLS` are missing.

- [ ] **Step 3: Implement**
- `hudModel.ts` (imports `STATION_NAMES`, `STATION_MAX`, `UPGRADE_MAX`, `STATION_OVERDRIVE`; add any of these that are not already imported):
```ts
/** The station a seated player's block names on its second line (hud.ts read STATION_NAMES directly); '' standing. */
export function seatedName(p: HudPlayer): string { return p.seated !== null ? STATION_NAMES[p.seated] ?? '' : ''; }
/** Cells per row: the largest station maximum plus the bought levels and the overdrive cell (spec Loop-ii section 1). */
export const HUD_MAX_CELLS = Math.max(...STATION_MAX) + UPGRADE_MAX + STATION_OVERDRIVE;
```
- **`roomIconModel.ts`:** add `export const ICON_TEXT = 0xe8e8e8, ICON_FAINT = 0x5a606c, ICON_WARN = 0xff6b5a;` and `export function tintColor(t: IconTint): number { return t === 'failed' ? ICON_WARN : t === 'unpowered' ? ICON_FAINT : ICON_TEXT; }`.
- **`roomIcons.ts`:** delete its own `tintColor` and the `TEXT, FAINT, WARN` constants. Import them from the model (`ICON_TEXT as TEXT` and so on) wherever `roomIcons.ts` still uses them, and add `export { tintColor } from './roomIconModel';`.
- **`render/mapModel.ts`:** move `MAP_W`, `MAP_H`, `nodeX`, `nodeY`, the rocks table and the colour from `mapPanel.ts` (export them as `ROCKS`, `NODE_R = 11`, `MAP_FLEET = 0xd83a3a`). `mapPanel.ts` imports and re-exports `MAP_W`, `MAP_H`, `nodeX` and `nodeY` until Task 5 deletes it.
- `ui/menuState.ts`: `UiState` gains `hud: import('../render/hudModel').HudModel | null`, and `epochs` gains `hud: number`. `ui/store.ts`: the initial `hud: null`, `epochs: { duel: 0, flight: 0, hud: 0 }`.
- **`ui/sinks.ts`:** the internal `createSink` accepts the key `'hud'`. Add:
```ts
export interface HudSink { update(m: HudModel): void; clear(): void }
export function createHudSink(store: UiStore, perf?: UiPerf): HudSink { const s = createSink(store, 'hud', perf); return { update: (m) => s.frame(m), clear: () => s.clear() }; }
```
  Use the actual name and signature `createSink` has after UI-ii's perf change. Read `sinks.ts` first.
- **`app/session.ts`:** `SessionDeps.hud` becomes `{ update(m: HudModel): void; clear?(): void } | null`, and `dispose()` calls `deps.hud?.clear?.()` after `runtime?.dispose()`. **`app/onlineSession.ts`:** `dispose()` calls `deps.hud?.clear?.()` before its existing `points = []`.
- Extend `tests/hud.test.ts` only if you need more than the case above. The case above lives in `uiHudSink.test.ts`.

- [ ] **Step 4: Run.** Run `npx vitest run tests/uiHudSink.test.ts tests/hud.test.ts tests/hudFit.test.ts tests/map.test.ts tests/roomIcons.test.ts tests/session.test.ts tests/uiSinks.test.ts tests/uiBoundary.test.ts`, then `npm run typecheck`. Both should pass with clean output.

- [ ] **Step 5: Commit.** Use a path-limited add and the message `feat(ui-iii): HUD view values, pure map and icon-tint modules, the hud slice and sink`.

---

### Task 2: Images, rows, cell rows and icons

**Files:**
- Create: `src/renderer/src/ui/images.ts`, `ui/stage/ImagesContext.ts`, `ui/stage/hairline.ts`, `ui/stage/rowLayout.ts`, `ui/stage/Row.tsx`, `ui/stage/CellRow.tsx`, `ui/stage/Icon.tsx`, `src/renderer/src/app/uiImages.ts`
- Test: `tests/uiImages.test.ts`, `tests/uiRows.test.tsx` (jsdom)

**Interfaces:**
- Consumes:
  - `FEATURE_NAMES`, `featureReady` (`render/fallback.ts`)
  - `ASSET_NAMES` (`render/assetNames.ts`)
  - `ICON_KINDS`, `IconKind`, `IconTint`, `tintColor` (`render/roomIconModel.ts`)
  - `textPx`, `ROW_GAP`, `ROW_GLYPH`, `LINE`, the theme colours
  - `CellColumns` (`render/hudLayout.ts`)
  - `HUD_MAX_CELLS` (Task 1)
  - `drawIcon` (`render/roomIcons.ts`), in `app/uiImages.ts` only
- Produces:
  - `interface UiImage { url: string; w: number; h: number }`, `type UiImages = ReadonlyMap<string, UiImage>`
  - `hudImageNames(missing: readonly string[]): string[]`
  - `buildImageCache(names, glyphKinds, source: { texture(name): Promise<UiImage | null>; glyph(kind): Promise<UiImage | null> }, warn?): Promise<UiImages>`. Glyph entries are keyed `glyph.<kind>` and are 20×20, centred at (10, 10).
  - `ImagesContext` (default: an empty map) and `useImages()`
  - `useHairline()`
  - `rowLayout(parts, has, gap?)`, returning `{ items: { glyph?: { name: string; x: number }; icon?: { name: string; x: number }; text: { text: string; x: number; tint: number } }[]; width: number }`
  - Components: `<Row x y parts gap?>`, `<CellRow x y c o>` (with `o: CellRowSet`), `<Icon name x y tint?>`
  - `createPixiImageSource(renderer, assets)`

- [ ] **Step 1: Write the failing tests**

`tests/uiImages.test.ts`:
```ts
// The HUD image cache (React UI spec §4): the names the HUD may draw (only for features whose art is all present), each
// extracted once, a failed extraction omitted with one warning.
import { describe, expect, it, vi } from 'vitest';
import { buildImageCache, hudImageNames } from '../src/renderer/src/ui/images';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { ICON_KINDS } from '../src/renderer/src/render/roomIconModel';

describe('hudImageNames', () => {
  it('lists every icon and prompt glyph when their features are complete, none of a feature with a missing name', () => {
    const all = hudImageNames([]);
    for (const n of [...FEATURE_NAMES.icons, ...FEATURE_NAMES.glyphs]) expect(all).toContain(n);
    expect(hudImageNames(['prompt.kb.E']).some((n) => n.startsWith('prompt.'))).toBe(false);
    expect(hudImageNames(['icon.fire']).some((n) => n.startsWith('icon.'))).toBe(false);
  });
});

describe('buildImageCache', () => {
  it('extracts each name and glyph kind once, keys glyphs glyph.<kind> and omits failures with a warning', async () => {
    const texture = vi.fn(async (n: string) => n === 'icon.bad' ? null : { url: `data:${n}`, w: 16, h: 16 });
    const glyph = vi.fn(async (k: string) => { if (k === 'doors') throw Error('x'); return { url: `data:g.${k}`, w: 20, h: 20 }; });
    const warn = vi.fn();
    const cache = await buildImageCache(['icon.fire', 'icon.bad'], ICON_KINDS, { texture, glyph }, warn);
    expect(cache.get('icon.fire')).toEqual({ url: 'data:icon.fire', w: 16, h: 16 }); expect(cache.has('icon.bad')).toBe(false);
    expect(cache.get('glyph.navigation')!.w).toBe(20); expect(cache.has('glyph.doors')).toBe(false);
    expect(texture).toHaveBeenCalledTimes(2); expect(glyph).toHaveBeenCalledTimes(ICON_KINDS.length); expect(warn).toHaveBeenCalledTimes(2);
  });
});
```

`tests/uiRows.test.tsx`:
```tsx
// @vitest-environment jsdom
// Rows and cell rows (hud.ts's fillRow and cellRow): parts laid out by the font's advances, glyphs and icons only when
// the cache has them, and the cell, heat, status and column rules.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { rowLayout } from '../src/renderer/src/ui/stage/rowLayout';
import { Row } from '../src/renderer/src/ui/stage/Row';
import { CellRow } from '../src/renderer/src/ui/stage/CellRow';
import { Icon } from '../src/renderer/src/ui/stage/Icon';
import { ImagesContext } from '../src/renderer/src/ui/stage/ImagesContext';
import { UiContext } from '../src/renderer/src/ui/context';
import { textPx, ROW_GAP, ROW_GLYPH, TEXT, DIM, AMBER, BAR_ON, BAR_OFF, BAR_FAIL } from '../src/renderer/src/render/theme';
import { CARD_ROW, POWER_ROW } from '../src/renderer/src/render/hudLayout';
import { hex } from '../src/renderer/src/ui/stage/color';
import { makeUi } from './helpers/uiStore';

afterEach(cleanup);
const images = new Map([['prompt.kb.E', { url: 'data:e', w: 16, h: 16 }], ['icon.fire', { url: 'data:f', w: 16, h: 16 }], ['glyph.weapons', { url: 'data:w', w: 20, h: 20 }]]);
function mount(node: ReactNode) { const ui = makeUi(); return render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><ImagesContext.Provider value={images}>{node}</ImagesContext.Provider></UiContext.Provider>); }
const texts = () => [...document.querySelectorAll('canvas')].map((c) => ({ text: c.dataset.text!, x: Number(c.dataset.x), y: Number(c.dataset.y) }));

describe('rowLayout', () => {
  it('advances by glyph, icon, ceil(text) and the gap, skipping empty parts and absent images', () => {
    const has = (n: string) => images.has(n);
    const r = rowLayout([{ glyph: 'prompt.kb.E', icon: 'icon.fire', text: 'Repair' }, { text: '' }, { glyph: 'prompt.kb.Q', text: 'Cancel', tint: DIM }], has);
    expect(r.items).toEqual([
      { glyph: { name: 'prompt.kb.E', x: 0 }, icon: { name: 'icon.fire', x: ROW_GLYPH }, text: { text: 'Repair', x: 2 * ROW_GLYPH, tint: TEXT } },
      { text: { text: 'Cancel', x: 2 * ROW_GLYPH + Math.ceil(textPx('Repair')) + ROW_GAP, tint: DIM } }
    ]);
    expect(r.width).toBe(2 * ROW_GLYPH + Math.ceil(textPx('Repair')) + ROW_GAP + Math.ceil(textPx('Cancel')));
  });
});

describe('Row and Icon', () => {
  it('places text at row-relative x and images at y + 7', () => {
    mount(<Row x={100} y={50} parts={[{ glyph: 'prompt.kb.E', text: 'Sit' }]} />);
    expect(texts()).toEqual([{ text: 'Sit', x: 100 + ROW_GLYPH, y: 50 }]);
    expect(document.querySelector('[data-ui-image="prompt.kb.E"]')).not.toBeNull();
  });
  it('draws nothing for a missing image', () => { mount(<Icon name="icon.none" x={0} y={0} />); expect(document.querySelector('[data-ui-image]')).toBeNull(); });
});

describe('CellRow', () => {
  const cells = () => [...document.querySelectorAll('[data-ui-cell]')].map((e) => (e as HTMLElement).style.background);
  it('fills on, off, overdrive and failed cells as cellRow did', () => {
    mount(<CellRow x={0} y={0} c={CARD_ROW} o={{ name: 'Wpn', level: 3, max: 2, status: '', cursor: false, tint: TEXT }} />);
    expect(cells()).toEqual([hex(BAR_ON), hex(BAR_ON), hex(AMBER)]);
    cleanup(); mount(<CellRow x={0} y={0} c={CARD_ROW} o={{ name: 'Wpn', level: 1, max: 3, status: 'OFF', cursor: false, tint: TEXT }} />);
    expect(cells()).toEqual([hex(BAR_ON), hex(BAR_OFF), hex(BAR_OFF)]); expect(texts().find((t) => t.text === 'OFF')).toMatchObject({ x: CARD_ROW.statusX });
    cleanup(); mount(<CellRow x={0} y={0} c={CARD_ROW} o={{ name: 'Wpn', level: 2, max: 2, status: 'FAIL', failed: true, cursor: true, tint: AMBER, heat: 0.5, coolant: 2 }} />);
    expect(cells()).toEqual([hex(BAR_FAIL), hex(BAR_FAIL)]); expect(document.querySelector('[data-ui-select]')).not.toBeNull();
    expect(texts().find((t) => t.text === 'C2')).toMatchObject({ x: CARD_ROW.coolantX });
    const heatFill = document.querySelector('[data-ui-bar-fill]') as HTMLElement; expect(heatFill).not.toBeNull();
  });
  it('draws the station glyph on the power panel and the Upgrades page columns', () => {
    mount(<CellRow x={0} y={0} c={POWER_ROW} o={{ icon: 'weapons', iconTint: 'failed', name: 'Wpn', level: 0, max: 0, status: '', cursor: false, tint: TEXT }} />);
    expect(document.querySelector('[data-ui-image="glyph.weapons"]')).not.toBeNull();
    cleanup(); mount(<CellRow x={0} y={0} c={CARD_ROW} o={{ name: 'Reactor', level: 0, max: 0, status: '', cursor: false, tint: TEXT, cols: ['2/4', '30'] }} />);
    expect(texts().map((t) => t.text)).toEqual(['Reactor', '2/4', '30']);
  });
});
```

- [ ] **Step 2: Run to see it fail.** Run `npx vitest run tests/uiImages.test.ts tests/uiRows.test.tsx`. It should FAIL, because the modules are missing.

- [ ] **Step 3: Implement**

`ui/images.ts`:
```ts
// The HUD's images (React UI spec §4): data URLs extracted once at mount from Pixi's textures and the station glyphs.
// A feature whose art is not all present contributes nothing (hud.ts's featureReady rule); a failed extraction is
// omitted with one warning, and <Icon> then draws nothing, as the Pixi HUD drew no sprite.
import { ASSET_NAMES } from '../render/assetNames';
import { FEATURE_NAMES, featureReady } from '../render/fallback';

export interface UiImage { url: string; w: number; h: number }
export type UiImages = ReadonlyMap<string, UiImage>;
export interface ImageSource { texture(name: string): Promise<UiImage | null>; glyph(kind: string): Promise<UiImage | null> }

export function hudImageNames(missing: readonly string[]): string[] {
  const gone = new Set(missing), out: string[] = [];
  if (featureReady(gone, 'icons')) out.push(...Object.keys(ASSET_NAMES).filter((n) => n.startsWith('icon.') && !gone.has(n)));
  if (featureReady(gone, 'glyphs')) out.push(...FEATURE_NAMES.glyphs);
  return out;
}

export async function buildImageCache(names: readonly string[], glyphKinds: readonly string[], source: ImageSource, warn: (m: string) => void = (m) => console.warn(m)): Promise<UiImages> {
  const cache = new Map<string, UiImage>();
  const take = async (key: string, get: () => Promise<UiImage | null>): Promise<void> => {
    try { const img = await get(); if (img) cache.set(key, img); else warn(`[ui] image ${key} unavailable`); }
    catch { warn(`[ui] image ${key} failed to extract`); }
  };
  for (const n of names) await take(n, () => source.texture(n));
  for (const k of glyphKinds) await take(`glyph.${k}`, () => source.glyph(k));
  return cache;
}
```

`ui/stage/ImagesContext.ts`:
```ts
import { createContext, useContext } from 'react';
import type { UiImages } from '../images';
export const ImagesContext = createContext<UiImages>(new Map());
export function useImages(): UiImages { return useContext(ImagesContext); }
```

`ui/stage/hairline.ts`:
```ts
import { useUi } from '../context';
/** One internal pixel as whole device pixels (Pixi's 1 px strokes, scaled by the letterbox like Panel's border). */
export function useHairline(): number { const l = useUi((s) => s.layout); return Math.max(1, Math.round(l.scale * l.dpr)) / l.dpr; }
```

`ui/stage/rowLayout.ts`:
```ts
// hud.ts's fillRow as data (React UI spec §4): each part's key glyph, icon and text left to right, an image only when the
// cache has it, text advanced by ceil(textPx) and ROW_GAP between parts; empty parts (no text, no glyph) are skipped.
import { ROW_GAP, ROW_GLYPH, TEXT, textPx } from '../../render/theme';

export interface RowPart { glyph?: string | null; icon?: string | null; text: string; tint?: number }
export interface RowItem { glyph?: { name: string; x: number }; icon?: { name: string; x: number }; text: { text: string; x: number; tint: number } }
export function rowLayout(parts: readonly RowPart[], has: (name: string) => boolean, gap = ROW_GAP): { items: RowItem[]; width: number } {
  const items: RowItem[] = []; let x = 0, end = 0;
  for (const p of parts) {
    if (!p.text && !p.glyph) continue;
    const item: RowItem = { text: { text: '', x: 0, tint: p.tint ?? TEXT } };
    if (p.glyph && has(p.glyph)) { item.glyph = { name: p.glyph, x }; x += ROW_GLYPH; }
    if (p.icon && has(p.icon)) { item.icon = { name: p.icon, x }; x += ROW_GLYPH; }
    item.text = { text: p.text, x, tint: p.tint ?? TEXT };
    end = x + Math.ceil(textPx(p.text)); x = end + gap;
    items.push(item);
  }
  return { items, width: end };
}
```
Note: hud.ts only skipped a part when it had neither text nor glyph. A part with a glyph that is not available and empty text still yields an item with empty text. That matches hud.ts, which added an empty text node.

`ui/stage/Icon.tsx`:
```tsx
// One cached image at its natural size in internal pixels (hud.ts's Sprite), or tinted through a CSS mask (the station
// glyphs, drawn white and tinted like Pixi's Graphics.tint). Nothing when the cache lacks it.
import { memo } from 'react';
import { Box } from './Box';
import { hex } from './color';
import { useImages } from './ImagesContext';

export const Icon = memo(function Icon(p: { name: string; x: number; y: number; tint?: number }) {
  const img = useImages().get(p.name); if (!img) return null;
  const style = p.tint === undefined
    ? { backgroundImage: `url(${img.url})`, backgroundSize: '100% 100%', imageRendering: 'pixelated' as const }
    : { backgroundColor: hex(p.tint), maskImage: `url(${img.url})`, maskSize: '100% 100%', WebkitMaskImage: `url(${img.url})`, WebkitMaskSize: '100% 100%' };
  return <Box x={p.x} y={p.y} w={img.w} h={img.h} attrs={{ 'data-ui-image': p.name }} style={style} />;
});
```

`ui/stage/Row.tsx`:
```tsx
import { memo } from 'react';
import { FONT_SIZE } from '../../render/theme';
import { Icon } from './Icon';
import { useImages } from './ImagesContext';
import { PixelText } from './PixelText';
import { rowLayout, type RowPart } from './rowLayout';

/** A HUD row (hud.ts's fillRow) at internal (x, y): images at y + 7, text at y, FONT_SIZE. */
export const Row = memo(function Row(p: { x: number; y: number; parts: readonly RowPart[]; gap?: number }) {
  const images = useImages(), { items } = rowLayout(p.parts, (n) => images.has(n), p.gap);
  return <>{items.map((it, k) => (
    <span key={k} style={{ display: 'contents' }}>
      {it.glyph && <Icon name={it.glyph.name} x={p.x + it.glyph.x} y={p.y + 7} />}
      {it.icon && <Icon name={it.icon.name} x={p.x + it.icon.x} y={p.y + 7} />}
      {it.text.text && <PixelText text={it.text.text} x={p.x + it.text.x} y={p.y} size={FONT_SIZE} tint={it.text.tint} />}
    </span>
  ))}</>;
});
```

`ui/stage/CellRow.tsx`:
```tsx
// hud.ts's cellRow (spec Demo-x-c section 1): the selected row's dark amber bar, an optional station glyph, the name,
// the power cells (green on, dark off with a 1 px edge, red failed, amber overdrive past the maximum), the heat strip,
// the status (WARN for OFF/FAIL, else DIM), coolant, and the Upgrades page's two columns.
import { memo } from 'react';
import type { CellColumns } from '../../render/hudLayout';
import { HUD_MAX_CELLS } from '../../render/hudModel';
import { tintColor, type IconKind, type IconTint } from '../../render/roomIconModel';
import { AMBER, BAR_FAIL, BAR_OFF, BAR_ON, CELL_EDGE, DIM, FONT_SIZE, LINE, SELECT_BG, WARN } from '../../render/theme';
import { Bar } from './Bar';
import { Box } from './Box';
import { hex } from './color';
import { useHairline } from './hairline';
import { Icon } from './Icon';
import { PixelText } from './PixelText';

export interface CellRowSet { icon?: IconKind; iconTint?: IconTint; name: string; level: number; max: number; status: string; cursor: boolean; tint: number; failed?: boolean; heat?: number; coolant?: number; cols?: readonly [string, string] }

export const CellRow = memo(function CellRow({ x, y, c, o }: { x: number; y: number; c: CellColumns; o: CellRowSet }) {
  const hair = useHairline(), shown = Math.max(o.max, o.level), heat = Math.max(0, Math.min(1, o.heat ?? 0));
  const text = (t: string, dx: number, tint: number) => t ? <PixelText text={t} x={x + dx} y={y} size={FONT_SIZE} tint={tint} /> : null;
  return (
    <>
      {o.cursor && <Box x={x - 4} y={y + 3} w={c.width + 8} h={LINE} attrs={{ 'data-ui-select': '' }} style={{ background: hex(SELECT_BG) }} />}
      {c.glyph && o.icon && <Icon name={`glyph.${o.icon}`} x={x + 8 - 10} y={y + 15 - 10} tint={tintColor(o.iconTint ?? 'normal')} />}
      {text(o.name, c.nameX, o.tint)}
      {Array.from({ length: shown }, (_, k) => {
        const off = !o.failed && k >= o.level, fill = o.failed ? BAR_FAIL : off ? BAR_OFF : k >= o.max ? AMBER : BAR_ON;
        return <Box key={k} x={x + c.cellsX + k * c.step} y={y + 8} w={c.cell} h={14} attrs={{ 'data-ui-cell': '' }}
          style={{ background: hex(fill), boxShadow: off ? `inset 0 0 0 ${hair}px ${hex(CELL_EDGE)}` : undefined }} />;
      })}
      {heat > 0 && <Bar x={x + c.cellsX} y={y + 23} w={HUD_MAX_CELLS * c.step - 2} h={2} fill={heat} colour={WARN} />}
      {text(o.status, c.statusX, o.status === 'OFF' || o.status === 'FAIL' ? WARN : DIM)}
      {text(o.coolant ? `C${o.coolant}` : '', c.coolantX, DIM)}
      {o.cols && text(o.cols[0], c.colAX, o.tint)}
      {o.cols && text(o.cols[1], c.colBX, o.tint)}
    </>
  );
});
```

`app/uiImages.ts`:
```ts
// The Pixi side of the UI image cache (React UI spec §4): textures and the white station glyphs to data URLs, once.
import { Graphics, Rectangle, Sprite } from 'pixi.js';
import type { GameAssets } from '../render/assets';
import type { Renderer } from '../render/renderer';
import { drawIcon } from '../render/roomIcons';
import type { IconKind } from '../render/roomIconModel';
import type { ImageSource, UiImage } from '../ui/images';

export function createPixiImageSource(renderer: Renderer, assets: GameAssets): ImageSource {
  const extract = renderer.app.renderer.extract;
  return {
    async texture(name): Promise<UiImage | null> {
      if (!assets.has(name)) return null;
      const t = assets.texture(name), sprite = new Sprite(t);
      try { return { url: await extract.base64(sprite), w: t.width, h: t.height }; } finally { sprite.destroy(); }
    },
    async glyph(kind): Promise<UiImage | null> {
      const g = new Graphics(); drawIcon(g, kind as IconKind, 10, 10, 16, 0xffffff);
      try { return { url: await extract.base64({ target: g, frame: new Rectangle(0, 0, 20, 20) }), w: 20, h: 20 }; } finally { g.destroy(); }
    }
  };
}
```
Check Pixi 8.19's `extract.base64` signature in `node_modules/pixi.js`; it accepts a container or `{ target, frame }`. If the options shape differs, adapt the call and keep the behaviour (a 20×20 frame at the origin). Note it in the report.

- [ ] **Step 4: Run.** Run `npx vitest run tests/uiImages.test.ts tests/uiRows.test.tsx tests/uiStage.test.tsx tests/uiBoundary.test.ts`, then `npm run typecheck`. Both should pass with no getContext noise.

- [ ] **Step 5: Commit.** Use the message `feat(ui-iii): the HUD image cache, rows, cell rows and icons`.

---

### Task 3: The HUD region

**Files:**
- Create: `src/renderer/src/ui/hud/Hud.tsx`, `SidePanels.tsx`, `Headline.tsx`, `SummaryCard.tsx`, `PlayerBlock.tsx`, `consoleRows.ts`, `ConsoleCard.tsx`, `EventCardView.tsx`, `Credits.tsx`, `MapPanel.tsx`
- Modify: `src/renderer/src/ui/UiRoot.tsx` (the hud region)
- Test: `tests/uiHud.test.tsx` (jsdom), `tests/uiConsoleRows.test.ts`

**Interfaces:**
- Consumes:
  - from `render/hudModel.ts`: `HudModel` and its parts, `clockLine`, `sectorLine`, `timeLine`, `directorText`, `threatTint`, `STATION_SHORT`, `glyphName`, `skillsLine`, `tabLabel`, `engineeringFooter`, `weaponsStrip`, `weaponsRowTexts`, `weaponsLootLine`, `weaponsFooterLines`, `weaponsFooterTone`, `scienceFooter`, `targetRowText`, `navigationFooterLines`, `mapTitle`, `SCIENCE_ROWS`, `seatedName`
  - from `render/hudLayout.ts`: every rect and column set
  - from `render/theme.ts`: the theme
  - `WINDOW` (`render/enemyWindowModel.ts`)
  - `render/mapModel.ts` (Task 1)
  - the stage primitives (UI-ii and Task 2)
- Produces:
  - `<Hud>`
  - `consoleRows(p: HudPlayer, flash: readonly number[]): ConsoleRowsView`, where `ConsoleRowsView = { rows: (CellRowSet | null)[]; selector: RowPart[] | null; footA: RowPart[]; footB: RowPart[]; bar: { fill: number; colour: number } | null }` (8 rows)
  - `UiRoot`'s hud region

The rules below are `src/renderer/src/render/hud.ts`'s. Read it alongside, since every number here comes from it.

- [ ] **Step 1: Write the failing tests**

`tests/uiConsoleRows.test.ts`. This is the pure console-card rules: one case per console kind, using fixture panels typed from `hudModel.ts`'s interfaces. Assert:
- **Engineering:**
  - Page 0 gives `rows[k]` for each station row (`status` 'FAIL'/'OFF'/''; `tint` AMBER when flashing or under the cursor, else TEXT) and `rows[rows.length]` = UPGRADES.
  - Page 1 gives the upgrades with `cols: [level, price]`.
  - `footB` = `[engineeringFooter(c), DIM]` and `footA` = `[]`.
  - Engineering is the only kind that may set `rows[7]`.
- **Weapons:**
  - `selector` = `weaponsStrip(c)` tinted lit→AMBER, match→GOOD, else DIM. `rows[0]` is null.
  - `rows[1..6]` hold the visible window of `weaponsRowTexts(c)` from `c.first` (the cursor row AMBER, a SWAP row BLUE).
  - With a loot line, `rows[6]` is it (TEXT when some slot is charged and not empty, else DIM). `rows[7]` is null.
  - `footA` is `[a, GOOD when charge ≥ 1 or torpedo.loaded else TEXT]`. `footB` is `[b, tone hit→GOOD, miss→TEXT, plain→DIM, else AMBER]`.
  - `bar` is `{ fill: charge, colour: charge ≥ 1 ? GOOD : BAR_ON }`.
- **Science:**
  - The targets, then the system row, then its results (WARN for "Hidden ship…", DIM for "No …", else GOOD), windowed by `SCIENCE_ROWS` from `first`.
  - The cursor row is AMBER, or BLUE_LIT on the enabled system row.
  - `footA` = `[scienceFooter(c), TEXT]`.
- **Navigation:** `rows[k]` = `c.rows[c.first + k]` for k < 7, tinted per hud.ts (EVADING→AMBER; not selectable or not enabled→DIM; blue→BLUE_LIT/BLUE by cursor; cursor→AMBER; else TEXT). `footA` is `[a, jump.ready ? GOOD : TEXT]`; `footB` is `[b, DIM]`.
- **Doors:**
  - `item === null` gives one DIM row, 'No doors'.
  - Otherwise three rows: the item in AMBER; the status in WARN if 'AIRLOCK OPEN', else DIM; and `Confirm: <action>` in TEXT, or 'Doors offline' in WARN.
  - `footB` = `Open airlocks: n` in WARN when n > 0.
Write it as plain `it` cases with literal fixture panels.

`tests/uiHud.test.tsx` (jsdom). Render `<UiRoot menu={false}>` with a `createHudSink(store)` fed by `buildHudModel(makeState(2), ...)` (as `tests/hudSlots.test.ts` builds models) and patched copies. Collect `PixelText` canvases (`data-text`, `data-x`, `data-y`). Assert:
- running: the clock card's five lines at `(CLOCK.x+PAD, CLOCK.y + k*LINE)`, POWER's title at `(POWER.x+PAD, POWER.y)`, a threat row at `(THREATS.x+PAD, THREATS.y)`, player 1's name at `(blockRect(0).x+PAD, blockRect(0).y)`, and no banner text.
- lobby and gameover: the side panels are absent, the banner (`m.message`) is at `(INTERNAL_W/2, BANNER_Y)` with anchor 0.5, and the summary rows are at `SUMMARY_TOP + k*LINE`.
- the empty-slot and reconnect texts, and P2 'BOT' (port the three expectations of `tests/hudSlots.test.ts`, which Task 5 deletes).
- an event card's title at `(EVENT_CARD.x+16, EVENT_CARD.y+6)`, and its choice rows with `< votes` right-anchored at `EVENT_CARD.x+16 + EVENT_CARD.w-32`.
- credits: the visible lines from `creditsScroll`, and the footer text.
- the map panel: its title at `(WINDOW.x+PAD, WINDOW.y)` when `phase === 'running' && map`, and absent otherwise.
- a seated player's console card at `cardRect(i, tabbed)`, with the tab bar row when `tabs` is set.
- the clear path: `sink.clear()` removes the HUD.

- [ ] **Step 2: Run to see them fail.** Run `npx vitest run tests/uiConsoleRows.test.ts tests/uiHud.test.tsx`. Both FAIL.

- [ ] **Step 3: Implement**

`consoleRows.ts` is a pure port of `hud.ts`'s `updatePlayer` console branch (lines 192–251), returning the data above instead of setting Pixi objects. `rows` has length 8, with `null` meaning hidden. Follow the branch conditions exactly, including that `'rows' in p.console && !('kind' in p.console)` identifies Engineering. Each `CellRowSet` uses `level: 0, max: 0, status: ''` wherever hud.ts did.

The components (each `memo`, each taking only the model parts it needs):
- **`SidePanels({ m })`**, rendered only when `m.phase !== 'lobby' && m.phase !== 'gameover'`:
  - `Panel(CLOCK)`, and five `PixelText` at `(CLOCK.x+PAD, CLOCK.y + k*LINE)`: `[clockLine(m), sectorLine(m), timeLine(m), directorText(m), m.run.quirk]`, tinted `[TEXT, TEXT, DIM, DIM, DIM]`.
  - `Panel(THREATS)`, and `THREAT_ROWS` `Row`s at `(THREATS.x+PAD, THREATS.y + i*LINE)`, with parts `[{ icon: t.icon, text: t.text, tint: threatTint(t) }]`.
  - `Panel(POWER)`, the title `POWER ${used}/${capacity}` in AMBER at `(POWER.x+PAD, POWER.y)`, and seven `CellRow`s with `POWER_ROW` at `(POWER.x+PAD, POWER.y + (k+1)*LINE)`, each only when `stations.find(s => s.kind === k)` exists. Its set is:
    - `icon`, `iconTint`
    - `name: STATION_SHORT[k]`, `level`, `max`
    - `status: online ? (occupant !== null ? 'P'+(occupant+1) : '') : 'OFF'`
    - `cursor: flash.includes(k)`
    - `tint: flash.includes(k) ? AMBER : online ? TEXT : WARN`
    - `heat`, `coolant`
    `SidePanels` takes `m` as a prop and re-renders per frame (its children are memo, so canvases only redraw on change).
- **`MapPanel({ map })`:**
  - `Panel(WINDOW.x, WINDOW.y, MAP_W, MAP_H)`.
  - An `<svg>` placed by `Box` at `(WINDOW.x, WINDOW.y, MAP_W, MAP_H)` with `viewBox="0 0 400 340"`, `shapeRendering="crispEdges"`. It draws `mapPanel.ts`'s shapes in its order:
    - fleet: when `map.fleet >= 0`, a rect `(2, 28, right-2, MAP_H-30)` filled `MAP_FLEET` at opacity 0.28, plus a rect `(right-2, 28, 2, MAP_H-30)` at 0.9, where `right = min(MAP_W-2, nodeX(fleet)+30)`
    - edges: a `<line>` with stroke width 2, AMBER at opacity 1 from the current node, else DIM at 0.7
    - nodes:
      - current: a circle of radius `NODE_R` filled TEXT, plus a ring of radius `NODE_R+5`, stroke 2, TEXT
      - selected: the same in AMBER
      - past: a filled circle in `CELL_EDGE`
      - otherwise: filled `PANEL_FILL` with a stroke of 2, TEXT if reachable, else DIM
    - an asteroid node also gets `ROCKS` polygons scaled by 1.4, filled `PANEL_FILL` when filled, else TEXT/DIM
  - The texts are `PixelText`s in stage coordinates:
    - the title, `mapTitle(map)`, in AMBER at `(WINDOW.x+PAD, WINDOW.y)`
    - each mark (`$`, `!` or `?`), anchor 0.5/0.5, at `(WINDOW.x + x + 1, WINDOW.y + y - 1)`, tinted `PANEL_FILL` when filled, else TEXT/DIM
    - `EXIT` in AMBER, anchor 0.5/0.5, at `(WINDOW.x + x - 8, WINDOW.y + y + 30)`, on the last column
- **`Headline({ m })`:**
  - The banner: `m.message` at TITLE_SIZE, anchor 0.5/0, at `(INTERNAL_W/2, BANNER_Y)`, when `phase !== 'running'`.
  - The progress line: DIM, anchor 0.5, at `(INTERNAL_W/2, PROGRESS_Y)`, when set.
  - The notices: `m.notice[k]` with tints `[AMBER, TEXT]`, anchor 0.5, at `(NOTICE_X, NOTICE.y + k*LINE)`, only while running.
  - The banner glyphs: in lobby or gameover, when the first `status === 'active'` player has a `deviceKind`, a `Row` of `[{ glyph: glyphName('confirm', dk), text: 'Confirm' }, { glyph: glyphName('cancel', dk), text: 'Cancel' }]`, centred at `x = INTERNAL_W/2 - rowLayout(...).width/2`, `y = BANNER_GLYPHS_Y`.
- **`SummaryCard({ m })`:** hud.ts lines 276–282.
  - Rows k = 0..11: `line = lobby ? (k === 1 ? m.lobbyShip : m.lobbyLines[k-2]) : m.summary?.[k]`.
  - Each shown row is centred at `(INTERNAL_W/2, SUMMARY_TOP + k*LINE)`, tinted AMBER for lobby k = 1 or gameover k = 0, else TEXT.
  - The backdrop shows in lobby/gameover when any row shows:
    - `wide = min(SUMMARY_W, max(0, ...shown.map(t => ceil(textPx(t)))))`
    - `top = SUMMARY_TOP + (lobby ? LINE : 0)`, `bottom = SUMMARY_TOP + 12*LINE`
    - a `Box` at `(INTERNAL_W/2 - wide/2 - 16, top - 6, wide + 32, min(bottom, SUMMARY_TOP + (lobby ? 12 : m.summary.length)*LINE) - top + 12)`, filled `BACKDROP` at `BACKDROP_ALPHA`
    - a 2-internal-px `RULE` border, which straddled the edge in Pixi; use a `Box` border of `2 * hairline` and accept the inner placement, as UI-ii did for pips
  - Draw order: the backdrop under the banner (hud.ts adds `summaryBack` first).
- **`PlayerBlock({ i, p, phase, flash })`:** hud.ts lines 169–191 and 250.
  - `Panel(blockRect(i))`. Its origin is `X = b.x + PAD`, `Y = b.y`.
  - The name at `(X, Y)`:
    - empty: `P${i+1}: press Interact to join`, DIM, and nothing else
    - reconnect: `P${i+1}: RECONNECT`, WARN, and nothing else
    - lobby: `P${i+1}  ${p.character.name}` in AMBER, then line 2 = `[asset / complication]` in DIM when both are set
    - otherwise: `P${i+1} ${bot ? 'BOT' : p.character.name}` in AMBER
  - The health bar: `Bar(X + BLOCK_HP_X, Y + 10, BLOCK_HP_W, 10, health/100, health > 50 ? BAR_ON : health > 25 ? AMBER : WARN)`.
  - `Icon('icon.oxygen', X + BLOCK_O2_X, Y + 7)` when `lowOxygen`.
  - Lines 2 and 3 as hud.ts lines 180–188. The seated name comes from `seatedName(p)`.
  - Line 4: `vote ? [vote, AMBER] : [skillsLine(skills), DIM]`.
  - The progress bar `Bar(X, Y + LINE*4 - 3, b.w - 2*PAD, 3, progress, AMBER)` when progress > 0.
  - The `ConsoleCard` when `p.console`.
  - The blocks draw in player order, each block above the previous one's card, as in hud.ts's `players` order.
- **`ConsoleCard({ i, p, flash })`:**
  - `r = cardRect(i, !!p.tabs)`, then `Panel(r)`.
  - The tabs: a `Row` at `(r.x+PAD, r.y)` with parts `p.tabs.flatMap((t, k) => [...(k ? [{ text: '|', tint: DIM }] : []), { text: tabLabel(t, p.tabFocus), tint: t.offline ? WARN : t.active ? (p.tabFocus ? AMBER : TEXT) : DIM }])`. The rule is a `Box(r.x+PAD, r.y+LINE+1, r.w-2*PAD, 1)` in RULE.
  - The body origin is `(BX, BY) = (r.x+PAD, r.y + (tabbed ? LINE+2 : 0))`.
  - From `consoleRows(p, flash)`:
    - `selector`: a `Row` at `(BX, BY)`
    - `rows[k]`: a `CellRow` with `CARD_ROW` at `(BX, BY + k*LINE)`
    - `footA` at `(BX, BY + 7*LINE)` and `footB` at `(BX, BY + 8*LINE)`
    - `bar`: `Bar(BX, BY + 9*LINE + 1, CARD_ROW.width, 3, ...)`
- **`EventCardView({ card })`:** hud.ts lines 140–163. `CX = EVENT_CARD.x+16`, `CW = EVENT_CARD.w-32`.
  - Compute `y` exactly as hud.ts does:
    1. the title in AMBER at `(CX, EVENT_CARD.y+6)`
    2. `y = EVENT_CARD.y + 6 + LINE + 6`
    3. up to 2 text lines at `(CX, y)`, `y += LINE` each
    4. `y += 10`
    5. up to 3 choices, each: the number at `(CX, y)` and the label at `(CX+28, y)` (tinted `!enabled ? DIM : blue ? BLUE : TEXT`), and `< ${votes.join(' ')}` in AMBER, right-anchored at `(CX+CW, y)`, when there are votes; then `y += LINE + 4`
    6. `y += 6`
    7. the status in AMBER at `(CX, y)`, then `y += LINE`
    8. the help in DIM at `(CX, y)`, then `y += LINE + 6`
  - The backdrop `Box(EVENT_CARD.x-6, EVENT_CARD.y-6, EVENT_CARD.w+12, y - EVENT_CARD.y + 12)` in BACKDROP at 0.6 goes under `Panel(EVENT_CARD.x, EVENT_CARD.y, EVENT_CARD.w, y - EVENT_CARD.y)`.
- **`Credits({ lines, scroll })`:**
  - `Panel(CREDITS)`.
  - `CREDITS_LINES` lines at `(CREDITS.x+16, CREDITS.y+12 + i*LINE)`, with `lines[scroll+i] ?? ''`.
  - The footer, in DIM, at `(CREDITS.x+16, CREDITS.y + CREDITS.h - LINE - 8)`: `Up/Down: scroll    Confirm or Cancel: close`.
- **`Hud()`:** `const m = useUi((s) => s.hud); if (!m) return null;`. Compute `flash = Math.floor(m.tick/10) % 2 === 0 ? m.calloutFlash : NO_FLASH`. Render on `<Stage>`, in hud.ts's order:
  1. SidePanels
  2. MapPanel (when `phase === 'running' && m.map`)
  3. SummaryCard
  4. Headline
  5. the PlayerBlocks for `m.players`
  6. EventCardView (when `m.eventCard`)
  7. Credits (when `m.credits`)
- **`UiRoot`:** add `const hasHud = useUi((s) => s.hud !== null), hudEpoch = useUi((s) => s.epochs.hud);` and `{hasHud && <RegionBoundary name="hud" resetKey={String(hudEpoch)} fallback={null}><Hud /></RegionBoundary>}` before the duel region.

- [ ] **Step 4: Run.** Run `npx vitest run tests/uiConsoleRows.test.ts tests/uiHud.test.tsx tests/uiRows.test.tsx tests/uiDuel.test.tsx tests/menu.test.tsx tests/uiBoundary.test.ts`, then `npm run typecheck`. Both should pass, clean, with no getContext noise.

- [ ] **Step 5: Commit.** Use the message `feat(ui-iii): the React sector HUD (side panels, map, headline, summary, player blocks, console cards, event card, credits)`.

---

### Task 4: HUD probe fixtures and the "before" screenshots (Pixi still present)

**Files:**
- Create: `src/renderer/src/app/hudFixtures.ts`
- Modify: `src/renderer/src/app/uiProbe.ts`, `src/renderer/src/main.ts` (the probe branch only)
- Test: extend `tests/uiProbe.test.ts`

- [ ] **Step 1: Fixtures (test first).** `hudFixtures.ts` exports `HUD_FIXTURES: (() => HudModel)[]`, with at least 7 entries. Each is built with `buildHudModel(createSimState(parseShip(cutter), 4, 7), { mode: 'couch', ui: createCardUi() }, {...})` (imports from `sim/state`, `sim/ship/schema`, `sim/ship/cutter.json`, `clientControl/cardController`), then patched:
  1. running, 4 active players, threats, the map and a notice
  2. player 0 seated at Weapons with tabs (a `WeaponsPanel` literal with a loot line and a shot result), and player 1 at Engineering page 0 with a flash
  3. Engineering page 1 (upgrades), Science with system results, Navigation with an EVADING row, and Doors with an open airlock across players 0–3
  4. an open event card with votes
  5. the lobby (`phase: 'lobby'`, `lobbyLines`, `lobbyShip`, the progress line)
  6. gameover with a summary
  7. the credits overlay

  Dispose each sim state after building (`disposeSimState`). The test asserts every fixture builds and has the intended `phase`/console kinds.
- [ ] **Step 2: The probe variants.** `?mode=uiprobe&probe=hud&fixture=N&engine=pixi` draws `HUD_FIXTURES[N]()` with today's `createHud(renderer.hud, assets).update(model)` (the stage's other children hidden). `&engine=react` writes it through `createHudSink(store).update(model)` with `mountUi({ menu: false, ... })`. Load both with dynamic `import()` in the probe branch only, as UI-ii's probe does.
- [ ] **Step 3: Screenshots.** `npm run build`. Then screenshot every fixture with `engine=pixi` into `C:\Users\djuar\FTLite-shots\ui-iii\before\fixture-N.png`, and with `engine=react` into `...\after\fixture-N.png`, at 1280×720. Use the UI-ii method: the scratchpad playwright driver, `FTLITE_MODE=uiprobe`, then `page.goto` with the extra query parameters. Images need the cache, so Task 5's mount change must exist for `engine=react` to show icons. Take the "after" shots at the end of Task 5 instead, and keep the "before" shots now.
- [ ] **Step 4: Commit** with the message `test(ui-iii): HUD probe fixtures and the Pixi HUD's reference screenshots`.

---

### Task 5: Wire the app, delete the Pixi HUD, verify

**Files:**
- Modify:
  - `src/renderer/src/main.ts` (`createHud` → `createHudSink`; build the image cache; pass it to `mountUi`)
  - `ui/mount.tsx` (an `images` option → `ImagesContext`)
  - `render/renderer.ts` (remove the `hud` container from `Renderer` and the stage)
  - `render/enemyWindow.ts` (a private copy of `drawPanel`)
  - `app/uiProbe.ts` (drop the `engine=pixi` variant)
- Delete: `render/hud.ts`, `render/mapPanel.ts`, `render/panel.ts`, `tests/hudSlots.test.ts` (its expectations live in `tests/uiHud.test.tsx`)

- [ ] **Step 1:**
  - `mountUi` takes `images?: UiImages` and wraps the tree in `<ImagesContext.Provider value={images ?? new Map()}>`.
  - In `main.ts`'s `startApp`, after `createRenderer`, build the cache with `const images = await buildImageCache(hudImageNames(assets.missing), ICON_KINDS, createPixiImageSource(renderer, assets));`. Then replace `createHud(renderer.hud, assets)` with `createHudSink(store, perf)`. The store must exist before the router; UI-ii already moved it there. Pass `images` to `mountUi`.
  - Run `git grep -n "renderer.hud\|createHud\|createMapPanel\|render/panel\|from './panel'" -- src tests scripts`. Fix every hit:
    - in `renderer.ts`, delete the `hud` Container and its `addChild` entry
    - in `enemyWindow.ts`, paste `drawPanel` as a private function
    - delete the three files
- [ ] **Step 2:** Run `npm run typecheck`, `npm test` (once, with up to a 15-minute timeout), and `npm run test:determinism`. All must pass; the goldens are unchanged. Long sim tests may time out under machine load. If any do, rerun those files alone and report both runs.
- [ ] **Step 3:** Run the Electron smokes one at a time, each with up to a 10-minute timeout: `test:online-app-runtime`, `test:online-recovery-runtime` (both show the sector HUD through the test-only entry), `test:host-runtime`, `test:rtc-runtime`, `test:room-service-runtime`, and the duel app smoke. All must pass. Restore any tracked `.superpowers/sdd/*` files they overwrite.
- [ ] **Step 4:** Take the "after" screenshots of every fixture (Task 4 Step 3) and compare each pair with the Read tool. The rectangles, panels, cells, glyph and icon positions and the text positions must match. The text is crisper. List any difference over 1 px, then fix it or explain it. Record `?uiperf=1` numbers for fixture 2 held for 60 s, written repeatedly with the same model. These numbers are the sharing floor; the budget is 1.5 ms median and 4 ms p95.
- [ ] **Step 5: Commit** with the message `feat(ui-iii): the sector HUD draws through React; Pixi HUD, map panel and panel helper removed`.

---

## Self-review notes

- **Spec coverage for UI-iii:**
  - §3's UI-iii rows → Tasks 3 and 5
  - §4's rows, cells, images and map SVG → Tasks 2 and 3
  - §7 → Tasks 1 and 3 (deviation 1)
  - §2's hud slice, sink, epochs and failure modes → Tasks 1, 2 and 3 (the image warning, the empty-cache fallback)
  - §8: tests, guards (uiBoundary walks every new file), the visual check → Tasks 1–5
- **What stays in Pixi:** callouts, the enemy window (with its own panel drawing), room icons on the floor and the tactical scene. These are spec §3's list.
