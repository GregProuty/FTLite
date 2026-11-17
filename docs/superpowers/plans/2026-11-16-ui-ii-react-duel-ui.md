# UI-ii: The Pixel Stage and the Duel and Flight UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the duel's and the flight view's screen-space UI from Pixi `BitmapText`/`Graphics` panels to React, keeping the same rectangles, glyphs and tints. That UI is the readout column, the end card, the pause banners, the online notice, the tactical map's zoom/scale/snap-back overlay and the flight feel panel. The work goes on a pixel stage that UI-iii's sector HUD will reuse.

**Architecture:**
- The duel scene (`app/duel/scene.ts`, from H-2a-iii) and the flight mode stop drawing those panels. Each frame they hand a plain view object to a store **sink**, which applies structural sharing and then `setState`.
- React regions (`<DuelUi>`, `<FlightUi>`) render the views on a `<Stage>` laid over the letterboxed canvas. Every edge is rounded in device pixels.
- Text is drawn by `<PixelText>`: one canvas per text, from a hard-edged m5x7 glyph atlas, with nearest sampling. That is the same rule as Pixi's `BitmapText`.

**Tech Stack:** TypeScript 5.8, React 19, zustand 5, Pixi 8.19 (unchanged for the world), Vitest 3.2 with jsdom.

**Spec:** `docs/superpowers/specs/2026-11-16-react-ui-layer-design.md`: §1 (the render rule and the `ui/` layout), §2 (the duel/flight slices, sinks, `replaceEqualDeep`, the selector rule, the budget, failure modes), §3 (the UI-ii rows), §4 (the pixel stage), §6 (duel and flight UI), §8 (tests and visual check), §9 items 2–3.

**Prerequisite:** H-2a-iii is merged to master. This plan is written against its `app/duel/scene.ts`, `app/duel/duelMode.ts`, `app/duel/onlineDuel.ts`, `app/duel/flightMode.ts` and `main.ts` (branch `h2a-iii`, reviewed). Task 0 checks that the merged files still match before anything starts.

## Global Constraints

- **No sim, authority or network change.** `npm run test:determinism` and the golden hashes are unchanged, and no file under `src/renderer/src/{sim,authority,clientControl,headless,net,events}`, `src/network`, `src/shared`, `src/main`, `src/preload` or `src/utility` changes.
- **Every rectangle, position, size and tint comes from the existing constants:** `theme.ts`, `hudLayout.ts`, `readoutModel.ts` (`READOUT_W`, `READOUT_MARGIN`, `READOUT_ROWS`), `interiorModel.ts` (`READOUT_COLUMN`) and the values quoted in this plan from today's Pixi views. No colour or position is written twice.
- **Pointer events:** the stage and everything on it set `pointer-events: none`. The duel's mouse pan, zoom and drag on the canvas keep working.
- **The UI reads only models.** `src/renderer/src/ui/**` imports values only from `render/` models and theme modules, `app/`, `shared/` and itself. It may import types from anywhere. `tests/uiBoundary.test.ts` enforces this.
- **Selectors return a store reference or a primitive.** A pick of several fields uses `useShallow`. Panels are `React.memo` over shared references (spec §2).
- **Deliberate visible change (spec §6):** the readout panel, the map overlay and the banners no longer move with the console views' screen shake.
- **The Electron smokes pass unchanged**, including H-2a-iii's duel application smoke. None of the smoke scripts or drivers are edited.
- **Worktree:** execute in `.worktrees/ui-ii` with its own `npm ci` and the `services/signalling/node_modules` junction to the main checkout's (memory "Worktree signalling junction"). Delete the junction before `git worktree remove`.

## Deviations from the spec (stated)

1. **Erratum to spec §9's mapping.** The spec gives `banners.tactical = overlay.layerPaused ? pauseText : null`. But the tactical layer is hidden in the interior view, and today its banner can only show there. So the mapping is `overlay.layerPaused && view !== 'interior' ? pauseText : null`. Otherwise Single player paused in the interior would show two banners. Task 4 updates the spec line.
2. **The image cache, `<Row>`, `<Cells>` and `<Icon>` move to UI-iii**, the first part that uses them. UI-ii needs only `<Stage>`, `<Box>`, `<Panel>`, `<Bar>` and `<PixelText>`.
3. **Text placement is calibrated, not derived.**
   - Pixi's `BitmapFont.install` measures the font with its own heuristics. `glyphs.ts` therefore carries three calibration constants, all in native pixels:
     - `GLYPH_Y_OFFSET` (vertical glyph position, start 0)
     - `GLYPH_LINE_H` (the line height that anchors use; `null` means the measured `fontBoundingBox` height)
     - `GLYPH_X_OFFSET` (horizontal glyph origin, start 0)
   - `GLYPH_X_PAD` (1) is clipping padding only and is not a calibration knob.
   - Glyph advances are measured per character with `measureText` when the atlas is built, as Pixi's dynamic font does. That covers the non-ASCII characters the online banners use (`…`, `—`), which `theme.ts`'s ADVANCE table lacks.
   - Task 5's probe compares Pixi and React text pixel for pixel and tunes the three constants in that order.
   - The visual criterion (spec §8) is checked by that probe at scales 1 and 1.5 with dpr 1. Other dprs are recorded, not gated: today's Pixi canvas renders at CSS resolution, so it cannot be pixel-identical to device-pixel text there.
4. **`mountUi` becomes async** (`Promise<() => void>`). It awaits the font and builds the atlas before the first render (spec §4).

## File Structure

| File | Responsibility |
|---|---|
| `src/renderer/src/ui/share.ts` | `replaceEqualDeep(prev, next)`. Pure. |
| `src/renderer/src/ui/views.ts` | Types only: `Banners`, `MapOverlayView`, `DuelUiView`, `FlightUiView`, plus `mapOverlayOf(overlay)`. |
| `src/renderer/src/ui/sinks.ts` | `createDuelSink(store)`, `createFlightSink(store)`: `frame(view)` / `clear()`; `type DuelSink`, `type FlightSink`. |
| `src/renderer/src/ui/menuState.ts` | Modified: `UiState` gains `duel`, `flight`, `epochs`; `LayoutSlice` gains `scale`, `offsetX`, `offsetY`, `dpr`. |
| `src/renderer/src/ui/store.ts` | Modified: the initial values, and `setLayout(store, patch)`. |
| `src/renderer/src/ui/stage/geometry.ts` | `edge(internal, offset, scale, dpr)` and `boxCss(x, y, w, h, layout)`. Pure. |
| `src/renderer/src/ui/glyphs.ts` | `snapAlpha`, `GLYPH_X_PAD`, `GLYPH_Y_OFFSET`, `buildGlyphAtlas(makeCanvas, family)`, `type GlyphAtlas`. |
| `src/renderer/src/ui/stage/GlyphContext.ts` | `GlyphContext` (atlas or null) and `useGlyphs()`. |
| `src/renderer/src/ui/stage/Stage.tsx`, `Box.tsx`, `Panel.tsx`, `Bar.tsx`, `PixelText.tsx`, `color.ts` | The pixel-stage primitives (`hex()` is in `color.ts`). |
| `src/renderer/src/ui/duel/ReadoutPanel.tsx`, `EndCard.tsx`, `Banners.tsx`, `MapOverlay.tsx`, `FeelPanel.tsx`, `DuelUi.tsx`, `FlightUi.tsx` | The regions. |
| `src/renderer/src/ui/UiRoot.tsx`, `mount.tsx` | Modified: the render rule for four regions, and the async mount with the glyph atlas. |
| `src/renderer/src/ui/perf.ts` | The dev-only `?uiperf=1` counter. |
| `src/renderer/src/ui/probe/samples.ts`, `ProbePage.tsx`, `src/renderer/src/app/uiProbe.ts` | The text-parity probe (`?mode=uiprobe`). |
| `src/renderer/src/render/duel/endModel.ts` | `endModel` and `EndView`, moved out of `endScreen.ts`. |
| `src/renderer/src/render/tactical/feelModel.ts` | Modified: gains `FEEL_PANEL_W`, `FEEL_PANEL_MARGIN`, `FEEL_PANEL_H`, `FEEL_ROWS`, `FEEL_HELP` (moved from `feelPanel.ts`). |
| `src/renderer/src/render/tactical/tacticalLayer.ts` | Modified: no pause banner, no zoom/scale/hint texts, no scale bar. |
| `src/renderer/src/app/duel/scene.ts`, `duelMode.ts`, `onlineDuel.ts`, `flightMode.ts`, `mode.ts`, `src/renderer/src/main.ts` | Modified: the sinks, the layout, the dev views and the probe mode. |
| Deleted | `render/duel/readoutPanel.ts`, `render/duel/endScreen.ts`, `render/tactical/feelPanel.ts`. |

---

### Task 0: Check the prerequisite

**Files:** none changed.

- [ ] **Step 1: Confirm H-2a-iii is on master and its files match this plan**

Run in the main checkout:
```bash
git log --oneline -1 -i --grep "merge h2a-iii" master          # expect 0903ed5 or a later merge
git diff 0903ed5^2 master -- src/renderer/src/app/duel/scene.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/app/duel/flightMode.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/render/duel/endScreen.ts
grep -n "export function createDuelScene(renderer: Renderer, options: { seed: number; pauseText: string })\|export interface SceneOverlay" src/renderer/src/app/duel/scene.ts
grep -n "scene.draw(\|createDuelScene(" src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/onlineDuel.ts
```
Expected: the merge exists, the diff is empty or touches only lines this plan does not quote, and the greps find the signature, the interface and the two `scene.draw(` calls. If `createDuelScene`'s signature, `SceneOverlay` or the `scene.draw(...)` calls in `duelMode.ts`/`onlineDuel.ts` differ from what Task 4 quotes, stop and report NEEDS_CONTEXT with the diff.

- [ ] **Step 2: Create the worktree**

```bash
git worktree add .worktrees/ui-ii -b ui-ii master
cd .worktrees/ui-ii && npm ci
powershell -NoProfile -Command "New-Item -ItemType Junction -Path '<abs>\.worktrees\ui-ii\services\signalling\node_modules' -Target '<abs main>\services\signalling\node_modules'"
```

---

### Task 1: Structural sharing, the view types, the store slices and the sinks

**Files:**
- Create: `src/renderer/src/ui/share.ts`, `src/renderer/src/ui/views.ts`, `src/renderer/src/ui/sinks.ts`
- Modify: `src/renderer/src/ui/menuState.ts` (`UiState`, `LayoutSlice`), `src/renderer/src/ui/store.ts`
- Test: `tests/uiShare.test.ts`, `tests/uiSinks.test.ts`; update `tests/uiMenuState.test.ts`'s `createUiStore` expectations

**Interfaces:**
- Consumes:
  - `ReadoutRow` (`render/duel/readoutModel.ts`)
  - `OverlayDraw` (`render/tactical/tacticalModel.ts`: `{ zoomText: string; scaleBar: { px: number; units: number }; snapHint: boolean; paused: boolean }`)
  - `EndView` (today in `render/duel/endScreen.ts`; Task 4 moves it to `endModel.ts`). In this task import it from `../render/duel/endScreen`, and Task 4 updates the import.
- Produces:
  - `replaceEqualDeep<T>(prev: unknown, next: T): T`
  - `Banners`, `MapOverlayView`, `DuelUiView`, `FlightUiView`, `mapOverlayOf(o: OverlayDraw): MapOverlayView`
  - `LayoutSlice { stripHeight; scale; offsetX; offsetY; dpr }`; `UiState.duel: DuelUiView | null`; `UiState.flight: FlightUiView | null`; `UiState.epochs: { duel: number; flight: number }`
  - `setLayout(store, patch: Partial<Omit<LayoutSlice, 'stripHeight'>>)`
  - `createDuelSink(store): DuelSink`, `createFlightSink(store): FlightSink`, where each is `{ frame(view): void; clear(): void }`

- [ ] **Step 1: Write the failing tests**

`tests/uiShare.test.ts`:
```ts
// Structural sharing for per-frame views (React UI spec §2): equal subtrees keep their identity so memoised panels skip.
import { describe, expect, it } from 'vitest';
import { replaceEqualDeep } from '../src/renderer/src/ui/share';

describe('replaceEqualDeep', () => {
  it('returns prev itself when next is deeply equal', () => {
    const prev = { a: [1, { b: 'x' }], c: null, d: { e: true } };
    expect(replaceEqualDeep(prev, { a: [1, { b: 'x' }], c: null, d: { e: true } })).toBe(prev);
  });
  it('keeps the identity of unchanged subtrees and replaces changed ones', () => {
    const prev = { rows: [{ v: 1 }, { v: 2 }], help: ['h'], end: null as { t: string } | null };
    const out = replaceEqualDeep(prev, { rows: [{ v: 1 }, { v: 3 }], help: ['h'], end: { t: 'x' } });
    expect(out).not.toBe(prev); expect(out.help).toBe(prev.help); expect(out.rows[0]).toBe(prev.rows[0]);
    expect(out.rows[1]).toEqual({ v: 3 }); expect(out.rows).not.toBe(prev.rows); expect(out.end).toEqual({ t: 'x' });
  });
  it('treats arrays of different length, primitives, nulls and type changes as changes', () => {
    expect(replaceEqualDeep([1, 2], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(replaceEqualDeep(1, 2)).toBe(2); expect(replaceEqualDeep('a', 'a')).toBe('a');
    expect(replaceEqualDeep(null, { a: 1 })).toEqual({ a: 1 }); expect(replaceEqualDeep({ a: 1 }, null)).toBeNull();
    expect(replaceEqualDeep({ a: 1 }, [1])).toEqual([1]); expect(replaceEqualDeep({ a: 1 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(replaceEqualDeep({ a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1 });
  });
});
```

`tests/uiSinks.test.ts`:
```ts
// The duel and flight sinks (React UI spec §2): one setState per changed frame, none for an equal one, an epoch per
// null -> non-null, and clear() back to null.
import { describe, expect, it } from 'vitest';
import { createUiStore, setLayout } from '../src/renderer/src/ui/store';
import { createDuelSink, createFlightSink } from '../src/renderer/src/ui/sinks';
import { mapOverlayOf, type DuelUiView, type FlightUiView } from '../src/renderer/src/ui/views';

const banners = { interior: null, tactical: null, notice: null };
const duelView = (value: string): DuelUiView => ({ readout: { rows: [{ label: 'HULL', value, labelTint: 1, valueTint: 2 }], help: ['TAB'] }, end: null, banners, overlay: null });

describe('the duel sink', () => {
  it('writes a changed view, skips an equal one and keeps unchanged subtrees', () => {
    const store = createUiStore({ onlineAvailable: false }), sink = createDuelSink(store); let writes = 0; store.subscribe(() => { writes++; });
    sink.frame(duelView('10')); expect(writes).toBe(1); const first = store.getState().duel!;
    sink.frame(duelView('10')); expect(writes).toBe(1); expect(store.getState().duel).toBe(first);
    sink.frame(duelView('9')); expect(writes).toBe(2); expect(store.getState().duel!.readout.help).toBe(first.readout.help);
  });
  it('bumps the duel epoch on each null -> non-null and clears to null', () => {
    const store = createUiStore({ onlineAvailable: false }), sink = createDuelSink(store);
    sink.frame(duelView('1')); sink.frame(duelView('2')); expect(store.getState().epochs.duel).toBe(1);
    sink.clear(); expect(store.getState().duel).toBeNull(); sink.clear();
    sink.frame(duelView('1')); expect(store.getState().epochs.duel).toBe(2); expect(store.getState().epochs.flight).toBe(0);
  });
});

describe('the flight sink', () => {
  it('writes the flight slice with its own epoch', () => {
    const store = createUiStore({ onlineAvailable: false }), sink = createFlightSink(store);
    const view: FlightUiView = { feel: [['SPEED', '1 u/s']], banners, overlay: mapOverlayOf({ zoomText: 'ZOOM 1.00', scaleBar: { px: 80, units: 500 }, snapHint: false, paused: true }) };
    sink.frame(view); expect(store.getState().flight!.overlay).toEqual({ zoomText: 'ZOOM 1.00', scaleBar: { px: 80, units: 500 }, snapHint: false });
    expect(store.getState().epochs.flight).toBe(1); sink.clear(); expect(store.getState().flight).toBeNull();
  });
});

describe('setLayout', () => {
  it('writes only changes', () => {
    const store = createUiStore({ onlineAvailable: false }); let writes = 0; store.subscribe(() => { writes++; });
    setLayout(store, { scale: 1.5, offsetX: 0, offsetY: 30, dpr: 1 }); setLayout(store, { scale: 1.5, offsetX: 0, offsetY: 30, dpr: 1 });
    expect(writes).toBe(1); expect(store.getState().layout).toEqual({ stripHeight: 0, scale: 1.5, offsetX: 0, offsetY: 30, dpr: 1 });
  });
});
```
In `tests/uiMenuState.test.ts`, the `createUiStore` case that asserts `layout` (its `expect(s.layout).toEqual(...)`, about line 100) must expect `{ stripHeight: 0, scale: 1, offsetX: 0, offsetY: 0, dpr: 1 }`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/uiShare.test.ts tests/uiSinks.test.ts tests/uiMenuState.test.ts`
Expected: FAIL. `share`, `sinks` and `views` are unresolved, and the layout expectation fails.

- [ ] **Step 3: Implement**

`src/renderer/src/ui/share.ts`:
```ts
// Structural sharing (React UI spec §2): returns `next`, except that every subtree deeply equal to the same place in
// `prev` is `prev`'s own object, so selectors and React.memo see unchanged references. Plain objects and arrays only.
const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

export function replaceEqualDeep<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) return prev as T;
  const arrays = Array.isArray(prev) && Array.isArray(next);
  if (!arrays && !(isPlain(prev) && isPlain(next))) return next;
  const p = prev as Record<string, unknown>, n = next as unknown as Record<string, unknown>;
  const keys = Object.keys(n), out: Record<string, unknown> = arrays ? ([] as unknown as Record<string, unknown>) : {};
  let same = Object.keys(p).length === keys.length;
  for (const k of keys) {
    const v = replaceEqualDeep(p[k], n[k]); out[k] = v;
    if (v !== p[k] || !(k in p)) same = false;
  }
  return (same ? prev : out) as T;
}
```

`src/renderer/src/ui/views.ts`:
```ts
// What the duel and flight regions render (React UI spec §2): plain data built by the scene and the flight mode each frame.
import type { EndView } from '../render/duel/endScreen';
import type { ReadoutRow } from '../render/duel/readoutModel';
import type { OverlayDraw } from '../render/tactical/tacticalModel';

/** The three banner lines; null hides one (spec §6 placements). */
export interface Banners { interior: string | null; tactical: string | null; notice: string | null }
export type MapOverlayView = Pick<OverlayDraw, 'zoomText' | 'scaleBar' | 'snapHint'>;
export interface DuelUiView { readout: { rows: readonly ReadoutRow[]; help: readonly string[] }; end: EndView | null; banners: Banners; overlay: MapOverlayView | null }
export interface FlightUiView { feel: readonly (readonly [string, string])[]; banners: Banners; overlay: MapOverlayView | null }

export function mapOverlayOf(o: OverlayDraw): MapOverlayView { return { zoomText: o.zoomText, scaleBar: o.scaleBar, snapHint: o.snapHint }; }
```

In `src/renderer/src/ui/menuState.ts`:
- Replace `export interface LayoutSlice { stripHeight: number }` with:
```ts
/** The canvas's place (React UI spec §4): the strip above it, the letterbox scale and offsets, the device pixel ratio. */
export interface LayoutSlice { stripHeight: number; scale: number; offsetX: number; offsetY: number; dpr: number }
```
- Replace the `UiState` line with:
```ts
export interface UiState {
  menu: MenuState; online: OnlineSlice; settings: SettingsSlice; layout: LayoutSlice;
  duel: import('./views').DuelUiView | null; flight: import('./views').FlightUiView | null;
  /** Bumped by a sink each time its slice goes null -> non-null: the regions' error-boundary reset keys (spec §2). */
  epochs: { duel: number; flight: number };
}
```

In `src/renderer/src/ui/store.ts`:
- Change the initial `layout` to `{ stripHeight: 0, scale: 1, offsetX: 0, offsetY: 0, dpr: 1 }` and add `duel: null, flight: null, epochs: { duel: 0, flight: 0 }`.
- Add:
```ts
import type { LayoutSlice } from './menuState';
/** The letterbox and dpr from main.ts's resize (spec §4); writes only a change. */
export function setLayout(store: UiStore, patch: Partial<Omit<LayoutSlice, 'stripHeight'>>): void {
  const cur = store.getState().layout;
  if ((Object.keys(patch) as (keyof typeof patch)[]).every((k) => cur[k] === patch[k])) return;
  store.setState((s) => ({ layout: { ...s.layout, ...patch } }));
}
```

`src/renderer/src/ui/sinks.ts`:
```ts
// The sinks (React UI spec §2): the scene and the flight mode call frame(view) once per frame and clear() on dispose.
// frame shares the new view against the stored one and writes only when something changed.
import { replaceEqualDeep } from './share';
import type { UiStore } from './store';
import type { DuelUiView, FlightUiView } from './views';

export interface Sink<V> { frame(view: V): void; clear(): void }
export type DuelSink = Sink<DuelUiView>;
export type FlightSink = Sink<FlightUiView>;

function createSink<K extends 'duel' | 'flight'>(store: UiStore, key: K): Sink<NonNullable<ReturnType<UiStore['getState']>[K]>> {
  return {
    frame(view) {
      const prev = store.getState()[key], next = replaceEqualDeep(prev, view);
      if (next === prev) return;
      store.setState((s) => ({ [key]: next, epochs: prev === null ? { ...s.epochs, [key]: s.epochs[key] + 1 } : s.epochs }) as Partial<ReturnType<UiStore['getState']>>);
    },
    clear() { if (store.getState()[key] !== null) store.setState({ [key]: null } as Partial<ReturnType<UiStore['getState']>>); }
  };
}
export function createDuelSink(store: UiStore): DuelSink { return createSink(store, 'duel'); }
export function createFlightSink(store: UiStore): FlightSink { return createSink(store, 'flight'); }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run tests/uiShare.test.ts tests/uiSinks.test.ts tests/uiMenuState.test.ts tests/uiActions.test.ts tests/menu.test.tsx tests/uiBoundary.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run `npm run typecheck` (exit 0).
```bash
git add src/renderer/src/ui/share.ts src/renderer/src/ui/views.ts src/renderer/src/ui/sinks.ts src/renderer/src/ui/menuState.ts src/renderer/src/ui/store.ts tests/uiShare.test.ts tests/uiSinks.test.ts tests/uiMenuState.test.ts
git commit -m "feat(ui-ii): structural sharing, the duel/flight views, store slices and sinks"
```

---

### Task 2: The pixel stage and the glyph atlas

**Files:**
- Create: `src/renderer/src/ui/stage/geometry.ts`, `color.ts`, `GlyphContext.ts`, `Stage.tsx`, `Box.tsx`, `Panel.tsx`, `Bar.tsx`, `PixelText.tsx`; `src/renderer/src/ui/glyphs.ts`
- Test: `tests/uiStage.test.tsx` (jsdom), `tests/uiGlyphs.test.ts`

**Interfaces:**
- Consumes:
  - `LayoutSlice` and `useUi` (Task 1 and UI-i)
  - `theme.ts`: `advance`, `textPx`, `FONT_NATIVE`, `PANEL_FILL`, `PANEL_ALPHA`, `PANEL_BORDER`, `PANEL_BORDER_W`, `PANEL_INNER`, `BAR_OFF`
- Produces:
  - `edge(internal: number, offset: number, scale: number, dpr: number): number`, which gives CSS px rounded to whole device px
  - `boxCss(x, y, w, h, layout): { left; top; width; height }`
  - `hex(rgb: number, alpha?: number): string`
  - `GLYPH_CHARS` (97: ASCII plus `…—`), `GLYPH_X_PAD`, `GLYPH_Y_OFFSET`, `GLYPH_LINE_H`, `GLYPH_X_OFFSET`, `snapAlpha(data)`, `interface GlyphAtlas { canvas: CanvasImageSource; cellH: number; cells: Record<string, number>; advance: Record<string, number> }`, `atlasTextWidth(atlas, text)`, `buildGlyphAtlas(makeCanvas, family): GlyphAtlas | null`
  - `GlyphContext`, `useGlyphs()`
  - Components:
    - `<Stage>`
    - `<Box x y w h style? testId?>`
    - `<Panel x y w h>`
    - `<Bar x y w h fill colour>`
    - `<PixelText text x y size tint anchorX? anchorY?>`, which renders a `<canvas data-text=… data-x=… data-y=…>`

- [ ] **Step 1: Write the failing tests**

`tests/uiGlyphs.test.ts`:
```ts
// The glyph atlas (React UI spec §4): m5x7 rasterised once at 16 px with hard alpha, one cell per character (printable
// ASCII plus the online banners' … and —) at its measured advance plus padding.
import { describe, expect, it } from 'vitest';
import { atlasTextWidth, buildGlyphAtlas, GLYPH_CHARS, GLYPH_X_PAD, snapAlpha } from '../src/renderer/src/ui/glyphs';
import { advance } from '../src/renderer/src/render/theme';

describe('snapAlpha', () => {
  it('makes every pixel white and fully on or off at the threshold', () => {
    const d = new Uint8ClampedArray([10, 20, 30, 127, 1, 2, 3, 128, 0, 0, 0, 0, 9, 9, 9, 255]);
    snapAlpha(d);
    expect([...d]).toEqual([255, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 255]);
  });
});

describe('buildGlyphAtlas', () => {
  it('lays out a padded cell per character at its measured advance and draws each at its cell', () => {
    const calls: { ch: string; x: number }[] = [];
    let w = 0, h = 0;
    const ctx = {
      font: '', textBaseline: '', fillStyle: '',
      measureText: (t: string) => ({ width: t.length === 1 ? (t.charCodeAt(0) < 127 ? advance(t) : 7.4) : 0, fontBoundingBoxAscent: 11.2, fontBoundingBoxDescent: 3.4 }),
      fillText: (ch: string, x: number) => { calls.push({ ch, x }); },
      getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {}
    };
    const atlas = buildGlyphAtlas((cw, ch) => { w = cw; h = ch; return { width: cw, height: ch, getContext: () => ctx as never }; }, 'm5x7')!;
    expect(GLYPH_CHARS.length).toBe(97); expect(atlas.cellH).toBe(16);   // GLYPH_LINE_H null: ceil(11.2) + ceil(3.4) = 12 + 4
    let x = 0;
    for (const ch of GLYPH_CHARS) { expect(atlas.cells[ch]).toBe(x + GLYPH_X_PAD); const a = ch.charCodeAt(0) < 127 ? advance(ch) : 7; expect(atlas.advance[ch]).toBe(a); x += a + 2 * GLYPH_X_PAD; }
    expect(w).toBe(x); expect(calls.find((c) => c.ch === 'M')!.x).toBe(atlas.cells.M); expect(ctx.font).toBe('16px m5x7');
    expect(atlasTextWidth(atlas, 'A…')).toBe(advance('A') + 7);
  });
  it('covers every character of the duel scene\'s banner and end-card strings', () => {
    for (const text of ['LEAVING…', 'CONNECTION LOST — RECONNECTING', 'PAUSED   ESC: RESUME   M: MAIN MENU', 'ENTER: REMATCH   ESC: LEAVE', 'YOU: HELM', 'DUEL LENGTH 1:23'])
      for (const ch of text) expect(GLYPH_CHARS, `${text}: ${ch}`).toContain(ch);
  });
  it('returns null without a 2D context', () => {
    expect(buildGlyphAtlas(() => ({ width: 0, height: 0, getContext: () => null }), 'm5x7')).toBeNull();
  });
});
```

`tests/uiStage.test.tsx`:
```tsx
// @vitest-environment jsdom
// The pixel stage (React UI spec §4): internal pixels to whole device pixels, panels and bars from the theme, and text as
// a canvas carrying its string.
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { edge, boxCss } from '../src/renderer/src/ui/stage/geometry';
import { hex } from '../src/renderer/src/ui/stage/color';
import { Stage } from '../src/renderer/src/ui/stage/Stage';
import { Box } from '../src/renderer/src/ui/stage/Box';
import { Panel } from '../src/renderer/src/ui/stage/Panel';
import { Bar } from '../src/renderer/src/ui/stage/Bar';
import { PixelText } from '../src/renderer/src/ui/stage/PixelText';
import { UiContext } from '../src/renderer/src/ui/context';
import { setLayout } from '../src/renderer/src/ui/store';
import { makeUi } from './helpers/uiStore';

afterEach(cleanup);
const layout = { stripHeight: 0, scale: 1.5, offsetX: 10, offsetY: 4, dpr: 1 };

describe('geometry', () => {
  it('rounds each edge to whole device pixels', () => {
    expect(edge(7, 10, 1.5, 1)).toBe(21);           // 10 + 10.5 -> 20.5 rounds to 21
    expect(edge(7, 10, 1.5, 1.25)).toBe(20.8);      // (10 + 10.5) * 1.25 = 25.625 -> 26 device px = 20.8 css
    expect(boxCss(1, 1, 3, 3, layout)).toEqual({ left: 12, top: 6, width: 4, height: 4 });   // left 11.5 -> 12, right 16; top 5.5 -> 6, bottom 10
  });
  it('writes theme colours as CSS', () => { expect(hex(0x141a24)).toBe('#141a24'); expect(hex(0x05060a, 0.5)).toBe('rgba(5, 6, 10, 0.5)'); });
});

describe('the primitives', () => {
  function stage(children: ReactNode) {
    const ui = makeUi(); setLayout(ui.store, layout);
    return render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><Stage>{children}</Stage></UiContext.Provider>);
  }
  it('Stage covers the window below the strip and takes no pointer events', () => {
    stage(null); const s = document.querySelector('[data-ui-stage]') as HTMLElement;
    expect(s.style.position).toBe('fixed'); expect(s.style.pointerEvents).toBe('none'); expect(s.style.top).toBe('0px');
  });
  it('Box, Panel and Bar place themselves by boxCss', () => {
    stage(<><Box x={1} y={1} w={3} h={3} testId="b" /><Panel x={0} y={0} w={100} h={50} /><Bar x={0} y={0} w={10} h={2} fill={0.5} colour={0x6fd44e} /></>);
    const b = screen.getByTestId('b'); expect([b.style.left, b.style.top, b.style.width, b.style.height]).toEqual(['12px', '6px', '4px', '4px']);
    const panel = document.querySelector('[data-ui-panel]') as HTMLElement; expect(panel.style.borderStyle).toBe('solid');
    const fill = document.querySelector('[data-ui-bar-fill]') as HTMLElement; expect(fill.style.width).toBe('8px');   // round(5 internal * 1.5) = 7.5 -> edges 10..17.5 -> 10..18
  });
  it('PixelText renders its string, position and anchor without an atlas', () => {
    stage(<PixelText text="HULL" x={100} y={20} size={32} tint={0xf2f5fa} anchorX={1} />);
    const c = document.querySelector('canvas')!; expect(c.dataset.text).toBe('HULL'); expect(c.dataset.anchorx).toBe('1');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/uiGlyphs.test.ts tests/uiStage.test.tsx`
Expected: FAIL, because the modules are unresolved.

- [ ] **Step 3: Implement the geometry, colour and glyph atlas**

`src/renderer/src/ui/stage/geometry.ts`:
```ts
// Internal pixels to CSS pixels on whole device pixels (React UI spec §4): every edge is rounded on its own, so widths
// follow the rounded edges and panels never blur at the half-step scales or under Windows display scaling.
import type { LayoutSlice } from '../menuState';

export function edge(internal: number, offset: number, scale: number, dpr: number): number {
  return Math.round((offset + internal * scale) * dpr) / dpr;
}
export function boxCss(x: number, y: number, w: number, h: number, l: Pick<LayoutSlice, 'scale' | 'offsetX' | 'offsetY' | 'dpr'>): { left: number; top: number; width: number; height: number } {
  const left = edge(x, l.offsetX, l.scale, l.dpr), top = edge(y, l.offsetY, l.scale, l.dpr);
  return { left, top, width: edge(x + w, l.offsetX, l.scale, l.dpr) - left, height: edge(y + h, l.offsetY, l.scale, l.dpr) - top };
}
```

`src/renderer/src/ui/stage/color.ts`:
```ts
/** A theme colour (0xRRGGBB) as CSS, optionally with alpha. */
export function hex(rgb: number, alpha?: number): string {
  if (alpha === undefined) return `#${rgb.toString(16).padStart(6, '0')}`;
  return `rgba(${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255}, ${alpha})`;
}
```

`src/renderer/src/ui/glyphs.ts`:
```ts
// The m5x7 glyph atlas (React UI spec §4): every character in GLYPH_CHARS drawn once at the font's native 16 px, alpha
// snapped to 0 or 255, one cell per character at its measured advance (as Pixi's dynamic BitmapFont measures) with
// GLYPH_X_PAD on each side. PixelText scales cells with nearest sampling, the rule Pixi's BitmapText follows.
// GLYPH_Y_OFFSET, GLYPH_LINE_H and GLYPH_X_OFFSET are calibrated by the ?mode=uiprobe text-parity probe (UI-ii Task 5).
import { advance, FONT_NATIVE } from '../render/theme';

/** Printable ASCII plus the non-ASCII characters the duel's banners use (onlineDuel.ts: LEAVING…, CONNECTION LOST —). */
export const GLYPH_CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') + '…—';
/** Native pixels of padding each side of a cell, so ink past the advance is not cut off. Clipping only, not a calibration knob. */
export const GLYPH_X_PAD = 1;
/** Native pixels added to the glyph's vertical position to match BitmapText's line placement (probe-calibrated). */
export const GLYPH_Y_OFFSET = 0;
/** The line height anchors use, in native pixels; null = the measured fontBoundingBox height (probe-calibrated). */
export const GLYPH_LINE_H: number | null = null;
/** Native pixels added to each glyph's drawn x origin (probe-calibrated). */
export const GLYPH_X_OFFSET = 0;

export interface GlyphAtlas { canvas: CanvasImageSource; cellH: number; cells: Record<string, number>; advance: Record<string, number> }
/** A string's width in native pixels: the atlas's measured advances, the theme's for a character it lacks. */
export function atlasTextWidth(atlas: GlyphAtlas, text: string): number { let n = 0; for (const ch of text) n += atlas.advance[ch] ?? advance(ch); return n; }
interface AtlasCanvas { width: number; height: number; getContext(type: '2d'): CanvasRenderingContext2D | null }

export function snapAlpha(data: Uint8ClampedArray, threshold = 128): void {
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = data[i + 3]! >= threshold ? 255 : 0; }
}

export function buildGlyphAtlas(makeCanvas: (w: number, h: number) => AtlasCanvas, family: string): GlyphAtlas | null {
  const probe = makeCanvas(1, 1).getContext('2d'); if (!probe) return null;
  probe.font = `${FONT_NATIVE}px ${family}`;
  const cells: Record<string, number> = {}, adv: Record<string, number> = {};
  let width = 0;
  for (const ch of GLYPH_CHARS) { adv[ch] = Math.round(probe.measureText(ch).width); cells[ch] = width + GLYPH_X_PAD; width += adv[ch]! + 2 * GLYPH_X_PAD; }
  const m = probe.measureText(GLYPH_CHARS), ascent = Math.ceil(m.fontBoundingBoxAscent), cellH = GLYPH_LINE_H ?? ascent + Math.ceil(m.fontBoundingBoxDescent);
  const canvas = makeCanvas(width, cellH), ctx = canvas.getContext('2d'); if (!ctx) return null;
  ctx.font = `${FONT_NATIVE}px ${family}`; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffffff';
  for (const ch of GLYPH_CHARS) ctx.fillText(ch, cells[ch]!, ascent + GLYPH_Y_OFFSET);
  const img = ctx.getImageData(0, 0, width, cellH); snapAlpha(img.data); ctx.putImageData(img, 0, 0);
  return { canvas: canvas as unknown as CanvasImageSource, cellH, cells, advance: adv };
}
```
Note: the test's fake context returns the same object for both canvases, so `ctx.font` ends as `'16px m5x7'`. In Task 4, before deleting anything, run `grep -nP '[^\x00-\x7F]' src/renderer/src/app/duel/*.ts src/renderer/src/render/duel/*.ts` and add any other non-ASCII character a duel string uses to `GLYPH_CHARS` and to the coverage test.

`src/renderer/src/ui/stage/GlyphContext.ts`:
```ts
import { createContext, useContext } from 'react';
import type { GlyphAtlas } from '../glyphs';
/** The atlas mountUi built, or null (tests, or a failed build): PixelText then renders an empty canvas. */
export const GlyphContext = createContext<GlyphAtlas | null>(null);
export function useGlyphs(): GlyphAtlas | null { return useContext(GlyphContext); }
```

- [ ] **Step 4: Implement the components**

`src/renderer/src/ui/stage/Stage.tsx`:
```tsx
// The stage (React UI spec §4): the window below the session strip, no pointer events, under the menu (z 20).
import type { ReactNode } from 'react';
import { useUi } from '../context';

export function Stage(props: { children: ReactNode }) {
  const top = useUi((s) => s.layout.stripHeight);
  return <div data-ui-stage="" style={{ position: 'fixed', left: 0, right: 0, top, bottom: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 10 }}>{props.children}</div>;
}
```

`src/renderer/src/ui/stage/Box.tsx`:
```tsx
import { memo, type CSSProperties, type ReactNode } from 'react';
import { useUi } from '../context';
import { boxCss } from './geometry';

/** A rectangle in internal pixels, placed on whole device pixels. */
export const Box = memo(function Box(props: { x: number; y: number; w: number; h: number; style?: CSSProperties; testId?: string; children?: ReactNode; attrs?: Record<string, string> }) {
  const l = useUi((s) => s.layout);
  return <div data-testid={props.testId} {...props.attrs} style={{ position: 'absolute', boxSizing: 'border-box', ...boxCss(props.x, props.y, props.w, props.h, l), ...props.style }}>{props.children}</div>;
});
```

`src/renderer/src/ui/stage/Panel.tsx`:
```tsx
import { memo } from 'react';
import { useUi } from '../context';
import { PANEL_ALPHA, PANEL_BORDER, PANEL_BORDER_W, PANEL_FILL, PANEL_INNER } from '../../render/theme';
import { Box } from './Box';
import { hex } from './color';

/** The themed panel (drawPanel's look): the fill at PANEL_ALPHA, a 2 px border and a 1 px inner highlight, scaled and rounded. */
export const Panel = memo(function Panel(props: { x: number; y: number; w: number; h: number }) {
  const l = useUi((s) => s.layout), px = (n: number): number => Math.max(1, Math.round(n * l.scale * l.dpr)) / l.dpr;
  return <Box {...props} attrs={{ 'data-ui-panel': '' }} style={{ background: hex(PANEL_FILL, PANEL_ALPHA), borderStyle: 'solid', borderColor: hex(PANEL_BORDER), borderWidth: px(PANEL_BORDER_W), boxShadow: `inset 0 0 0 ${px(1)}px ${hex(PANEL_INNER)}` }} />;
});
```

`src/renderer/src/ui/stage/Bar.tsx`:
```tsx
import { memo } from 'react';
import { BAR_OFF } from '../../render/theme';
import { Box } from './Box';
import { hex } from './color';

/** A track and its fill (hud.ts's bar): the fill's width is round(frac * w) internal pixels, clamped to 0..1. */
export const Bar = memo(function Bar(props: { x: number; y: number; w: number; h: number; fill: number; colour: number }) {
  const f = Math.round(Math.max(0, Math.min(1, props.fill)) * props.w);
  return <>
    <Box x={props.x} y={props.y} w={props.w} h={props.h} style={{ background: hex(BAR_OFF) }} />
    {f > 0 && <Box x={props.x} y={props.y} w={f} h={props.h} attrs={{ 'data-ui-bar-fill': '' }} style={{ background: hex(props.colour) }} />}
  </>;
});
```

`src/renderer/src/ui/stage/PixelText.tsx`:
```tsx
// Text from the glyph atlas (React UI spec §4): one canvas sized in device pixels, each glyph cell drawn with nearest
// sampling at size/16 x scale x dpr, then tinted. It redraws only when its inputs change; without an atlas (jsdom, or a
// failed build) it is an empty canvas that still carries its string for tests.
import { memo, useLayoutEffect, useRef } from 'react';
import { FONT_NATIVE, textPx } from '../../render/theme';
import { useUi } from '../context';
import { atlasTextWidth, GLYPH_X_OFFSET, GLYPH_X_PAD } from '../glyphs';
import { hex } from './color';
import { edge } from './geometry';
import { useGlyphs } from './GlyphContext';

export interface PixelTextProps { text: string; x: number; y: number; size: number; tint: number; anchorX?: number; anchorY?: number }

export const PixelText = memo(function PixelText(p: PixelTextProps) {
  const l = useUi((s) => s.layout), atlas = useGlyphs(), ref = useRef<HTMLCanvasElement>(null);
  const k = p.size / FONT_NATIVE, cellH = atlas?.cellH ?? FONT_NATIVE;
  const w = atlas ? atlasTextWidth(atlas, p.text) * k : textPx(p.text, k), h = cellH * k;
  const left = edge(p.x - (p.anchorX ?? 0) * w, l.offsetX, l.scale, l.dpr), top = edge(p.y - (p.anchorY ?? 0) * h, l.offsetY, l.scale, l.dpr);
  const devW = Math.max(1, Math.round(w * l.scale * l.dpr)), devH = Math.max(1, Math.round(h * l.scale * l.dpr));
  useLayoutEffect(() => {
    const c = ref.current; if (!c || !atlas) return;
    c.width = devW; c.height = devH;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, devW, devH);
    const g = k * l.scale * l.dpr, pad = GLYPH_X_PAD;
    let pen = 0;
    for (const ch of p.text) {
      const adv = atlas.advance[ch] ?? 6, sx = atlas.cells[ch];
      if (sx !== undefined) {
        const dx0 = Math.round((pen + GLYPH_X_OFFSET - pad) * g), dx1 = Math.round((pen + GLYPH_X_OFFSET + adv + pad) * g);
        ctx.drawImage(atlas.canvas, sx - pad, 0, adv + 2 * pad, cellH, dx0, 0, dx1 - dx0, Math.round(cellH * g));
      }
      pen += adv;
    }
    ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = hex(p.tint); ctx.fillRect(0, 0, devW, devH); ctx.globalCompositeOperation = 'source-over';
  }, [atlas, p.text, p.tint, devW, devH, k, l.scale, l.dpr, cellH]);
  return <canvas ref={ref} data-text={p.text} data-anchorx={String(p.anchorX ?? 0)} data-x={String(p.x)} data-y={String(p.y)}
    style={{ position: 'absolute', left, top, width: devW / l.dpr, height: devH / l.dpr, imageRendering: 'pixelated' }} />;
});
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/uiGlyphs.test.ts tests/uiStage.test.tsx tests/uiBoundary.test.ts`
Expected: PASS, with no "Not implemented: HTMLCanvasElement.prototype.getContext" noise (PixelText never calls `getContext` without an atlas).

- [ ] **Step 6: Typecheck and commit**

```bash
git add src/renderer/src/ui/stage src/renderer/src/ui/glyphs.ts tests/uiGlyphs.test.ts tests/uiStage.test.tsx
git commit -m "feat(ui-ii): the pixel stage (device-pixel boxes, panels, bars) and PixelText from a hard-edged m5x7 atlas"
```

---

### Task 3: The duel and flight regions

**Files:**
- Create: `src/renderer/src/ui/duel/ReadoutPanel.tsx`, `EndCard.tsx`, `Banners.tsx`, `MapOverlay.tsx`, `FeelPanel.tsx`, `DuelUi.tsx`, `FlightUi.tsx`
- Modify: `src/renderer/src/ui/UiRoot.tsx` (the render rule), `src/renderer/src/render/tactical/feelModel.ts` (gains the panel constants)
- Test: `tests/uiDuel.test.tsx` (jsdom)

**Interfaces:**
- Consumes:
  - from Task 1: `DuelUiView`, `FlightUiView`, `Banners`, `MapOverlayView`, `UiState.duel`/`flight`/`epochs`
  - from Task 2: the stage primitives
  - `READOUT_W`, `READOUT_MARGIN`, `READOUT_ROWS` (`render/duel/readoutModel.ts`)
  - `READOUT_COLUMN` (`render/duel/interiorModel.ts`)
  - from `theme.ts`: `PAD`, `LINE`, `FONT_SIZE`, `FONT_NATIVE`, `TITLE_SIZE`, `TEXT`, `DIM`, `AMBER`, `BAR_OFF`, `BACKDROP`, `BACKDROP_ALPHA`
  - `INTERNAL_W`/`INTERNAL_H` (`shared/resolution`)
- Produces:
  - `<DuelUi>`, `<FlightUi>`, and `UiRoot` with props `{ menu?: boolean }` (default true)
  - in `feelModel.ts`: `FEEL_PANEL_W = 250`, `FEEL_PANEL_MARGIN = 8`, `FEEL_ROWS = 6`, `FEEL_HELP`, `FEEL_HELP_LINE = 14`, `FEEL_PANEL_H`

The values below are today's Pixi views. Read them in `render/duel/readoutPanel.ts`, `render/duel/endScreen.ts`, `render/tactical/feelPanel.ts`, `render/tactical/tacticalLayer.ts` (lines 60-62 and 216-223) and `app/duel/scene.ts`.

- [ ] **Step 1: Move the feel-panel constants into `feelModel.ts`**

Append to `src/renderer/src/render/tactical/feelModel.ts` (add `import { LINE, PAD } from '../theme';` at the top):
```ts
/** The feel panel's box and help (H-1 spec §9), shared by the flight mode (its reserve) and the React FeelPanel. */
export const FEEL_PANEL_W = 250, FEEL_PANEL_MARGIN = 8, FEEL_ROWS = 6, FEEL_HELP_LINE = 14;
export const FEEL_HELP: readonly string[] = ['W/S  THRUST / REVERSE', 'A/D  TURN', 'WHEEL  - =  ZOOM', 'RIGHT DRAG  PAN', 'C  SNAP BACK', 'ESC  PAUSE'];
export const FEEL_PANEL_H = PAD + LINE * (FEEL_ROWS + 1) + PAD + FEEL_HELP.length * FEEL_HELP_LINE + PAD;
```
In `render/tactical/feelPanel.ts`, replace its own `FEEL_PANEL_W`/`FEEL_PANEL_MARGIN`/`ROWS`/`HELP`/`HELP_LINE`/`FEEL_PANEL_H` declarations with imports and re-exports from `feelModel.ts`, so nothing breaks before Task 4 deletes the file:
```ts
import { FEEL_HELP as HELP, FEEL_HELP_LINE as HELP_LINE, FEEL_PANEL_H, FEEL_PANEL_W, FEEL_ROWS as ROWS } from './feelModel';
export { FEEL_PANEL_H, FEEL_PANEL_MARGIN, FEEL_PANEL_W } from './feelModel';
```

- [ ] **Step 2: Write the failing component tests**

`tests/uiDuel.test.tsx`:
```tsx
// @vitest-environment jsdom
// The duel and flight regions (React UI spec §6): today's Pixi panels' strings, positions and tints from the views, and
// the render rule (a region only while its slice is set; a throwing region leaves the menu).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memo } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { UiContext, useUi } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink, createFlightSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';
import { READOUT_COLUMN } from '../src/renderer/src/render/duel/interiorModel';
import { READOUT_MARGIN, READOUT_W } from '../src/renderer/src/render/duel/readoutModel';
import { AMBER, LINE, PAD, TEXT } from '../src/renderer/src/render/theme';
import { FEEL_PANEL_MARGIN, FEEL_PANEL_W } from '../src/renderer/src/render/tactical/feelModel';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const texts = () => [...document.querySelectorAll('canvas')].map((c) => ({ text: c.dataset.text!, x: Number(c.dataset.x), y: Number(c.dataset.y), anchor: c.dataset.anchorx }));
const find = (t: string) => texts().find((c) => c.text === t);
const banners = { interior: null, tactical: null, notice: null };
const view = (patch: Partial<DuelUiView> = {}): DuelUiView => ({
  readout: { rows: [{ label: 'HULL', value: '10/10', labelTint: TEXT, valueTint: TEXT, pips: { n: 2, max: 3, colour: 0x7cc4ff }, bar: { fill: 0.5, colour: AMBER } }], help: ['TAB  SWITCH'] },
  end: null, banners, overlay: null, ...patch });
function mount(menu = false) {
  const ui = makeUi(); const duel = createDuelSink(ui.store), flight = createFlightSink(ui.store);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={menu} /></UiContext.Provider>);
  return { ...ui, duel, flight };
}

describe('the render rule', () => {
  it('shows the duel region only while its slice is set', () => {
    const { duel } = mount();
    expect(document.querySelector('[data-ui-stage]')).toBeNull();
    act(() => duel.frame(view())); expect(find('HULL')).toBeDefined();
    act(() => duel.clear()); expect(find('HULL')).toBeUndefined();
  });
  it('a throwing duel region leaves the menu mounted', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { duel } = mount(true);
    act(() => duel.frame(view({ readout: null as never })));
    expect(document.querySelector('[data-testid="session-menu"]')).not.toBeNull(); expect(find('HULL')).toBeUndefined();
  });
});

describe('the readout panel', () => {
  it('places labels, right-anchored values and help as readoutPanel.ts did', () => {
    const { duel } = mount(); act(() => duel.frame(view()));
    const X = INTERNAL_W - READOUT_W - READOUT_MARGIN, Y = READOUT_MARGIN;
    expect(find('HULL')).toMatchObject({ x: X + PAD, y: Y + PAD - 6 });
    expect(find('10/10')).toMatchObject({ x: X + READOUT_W - PAD, y: Y + PAD - 6, anchor: '1' });
    expect(find('TAB  SWITCH')).toMatchObject({ x: X + PAD, y: Y + PAD + LINE + PAD });
    expect(document.querySelectorAll('[data-ui-pip]').length).toBe(3); expect(document.querySelectorAll('[data-ui-pip="lit"]').length).toBe(2);
    expect(document.querySelector('[data-ui-bar-fill]')).not.toBeNull();
  });
});

describe('the end card, banners and map overlay', () => {
  it('centres the end card lines', () => {
    const { duel } = mount(); act(() => duel.frame(view({ end: { title: 'VICTORY', tint: 0x8fe06a, length: 'DUEL LENGTH 1:23', prompt: 'ENTER: REMATCH' } })));
    const top = (INTERNAL_H - 200) / 2;
    expect(find('VICTORY')).toMatchObject({ x: INTERNAL_W / 2, y: top + 24, anchor: '0.5' });
    expect(find('DUEL LENGTH 1:23')).toMatchObject({ y: top + 96 }); expect(find('ENTER: REMATCH')).toMatchObject({ y: top + 140 });
  });
  it('places the three banners', () => {
    const { duel } = mount(); act(() => duel.frame(view({ banners: { interior: 'I', tactical: 'T', notice: 'YOU: HELM' } })));
    expect(find('I')).toMatchObject({ x: (INTERNAL_W - READOUT_COLUMN) / 2, y: 80 });
    expect(find('T')).toMatchObject({ x: INTERNAL_W / 2, y: INTERNAL_H / 2 - 80 });
    expect(find('YOU: HELM')).toMatchObject({ x: (INTERNAL_W - READOUT_COLUMN) / 2, y: 130 });
  });
  it('draws the zoom text, scale label and snap hint where the tactical layer did', () => {
    const { duel } = mount(); act(() => duel.frame(view({ overlay: { zoomText: 'ZOOM 0.50', scaleBar: { px: 80, units: 500 }, snapHint: true } })));
    expect(find('ZOOM 0.50')).toMatchObject({ x: 16, y: INTERNAL_H - 64 });
    expect(find('500 u')).toMatchObject({ x: 16 + 80 + 8, y: INTERNAL_H - 36 });
    expect(find('C: SNAP BACK')).toMatchObject({ x: INTERNAL_W / 2, y: INTERNAL_H - 12, anchor: '0.5' });
    expect(document.querySelectorAll('[data-ui-scalebar]').length).toBe(3);
  });
});

describe('the flight region', () => {
  it('draws the feel panel with its title, rows and help', () => {
    const { flight } = mount(); act(() => flight.frame({ feel: [['SPEED', '12 u/s']], banners: { ...banners, tactical: 'PAUSED   ESC: RESUME' }, overlay: null }));
    const X = INTERNAL_W - FEEL_PANEL_W - FEEL_PANEL_MARGIN, Y = FEEL_PANEL_MARGIN;
    expect(find('FLIGHT FEEL')).toMatchObject({ x: X + PAD, y: Y + PAD - 6 });
    expect(find('SPEED')).toMatchObject({ x: X + PAD, y: Y + PAD - 6 + LINE }); expect(find('12 u/s')).toMatchObject({ x: X + FEEL_PANEL_W - PAD, anchor: '1' });
    expect(find('W/S  THRUST / REVERSE')).toBeDefined(); expect(find('PAUSED   ESC: RESUME')).toBeDefined();
  });
});

describe('sharing keeps unchanged panels from re-rendering (spec §8)', () => {
  it('a view whose only change is a readout value leaves the memoised overlay, banners and end props unchanged', () => {
    const ui = makeUi(), sink = createDuelSink(ui.store), seen = { overlay: vi.fn(), banners: vi.fn(), end: vi.fn() };
    const Overlay = memo(function Overlay(_: { o: unknown }) { seen.overlay(); return null; });
    const Lines = memo(function Lines(_: { b: unknown }) { seen.banners(); return null; });
    const End = memo(function End(_: { e: unknown }) { seen.end(); return null; });
    function Harness() { const d = useUi((s) => s.duel); return d ? <><Overlay o={d.overlay} /><Lines b={d.banners} /><End e={d.end} /></> : null; }
    render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><Harness /></UiContext.Provider>);
    const overlay = { zoomText: 'ZOOM 1.00', scaleBar: { px: 80, units: 500 }, snapHint: false };
    const end = { title: 'VICTORY', tint: 1, length: 'DUEL LENGTH 0:01', prompt: 'ENTER: REMATCH' };
    const changed = { rows: [{ label: 'HULL', value: '9/10', labelTint: TEXT, valueTint: TEXT }], help: ['TAB  SWITCH'] };
    act(() => sink.frame(view({ overlay, end })));
    act(() => sink.frame(view({ overlay: { ...overlay }, end: { ...end }, readout: changed })));
    expect(seen.overlay).toHaveBeenCalledTimes(1); expect(seen.banners).toHaveBeenCalledTimes(1); expect(seen.end).toHaveBeenCalledTimes(1);
    let commits = 0; const off = ui.store.subscribe(() => { commits++; });
    act(() => sink.frame(view({ overlay: { ...overlay }, end: { ...end }, readout: { ...changed } })));
    expect(commits).toBe(0); off();
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/uiDuel.test.tsx`
Expected: FAIL. `UiRoot` takes no `menu` prop and renders no duel region.

- [ ] **Step 4: Implement the regions**

`src/renderer/src/ui/duel/ReadoutPanel.tsx`:
```tsx
// The duel's readout column (readoutPanel.ts's layout): rows of label and right-anchored value, shield pips after the
// label, a thin bar under a row, and help lines at the native size, in a panel sized to its content.
import { Fragment, memo } from 'react';
import { INTERNAL_W } from '../../../../shared/resolution';
import { READOUT_MARGIN, READOUT_ROWS, READOUT_W, type ReadoutRow } from '../../render/duel/readoutModel';
import { BAR_OFF, DIM, FONT_NATIVE, FONT_SIZE, LINE, PAD } from '../../render/theme';
import { useUi } from '../context';
import { Bar } from '../stage/Bar';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

const HELP_LINES = 5, HELP_LINE = 14, PIP = 12, PIP_GAP = 4;
const X = INTERNAL_W - READOUT_W - READOUT_MARGIN, Y = READOUT_MARGIN;

export const ReadoutPanel = memo(function ReadoutPanel(props: { rows: readonly ReadoutRow[]; help: readonly string[] }) {
  const l = useUi((s) => s.layout), hairline = Math.max(1, Math.round(l.scale * l.dpr)) / l.dpr;   // Pixi's 1-internal-px pip stroke, scaled like Panel's border
  const n = Math.min(props.rows.length, READOUT_ROWS), h = Math.min(props.help.length, HELP_LINES);
  const helpY = PAD + LINE * n + PAD, height = helpY + h * HELP_LINE + PAD;
  return (
    <>
      <Panel x={X} y={Y} w={READOUT_W} h={height} />
      {props.rows.slice(0, n).map((r, k) => {
        const y = Y + PAD - 6 + LINE * k;
        return (
          <Fragment key={k}>
            <PixelText text={r.label} x={X + PAD} y={y} size={FONT_SIZE} tint={r.labelTint} />
            <PixelText text={r.value} x={X + READOUT_W - PAD} y={y} size={FONT_SIZE} tint={r.valueTint} anchorX={1} />
            {r.pips && Array.from({ length: r.pips.max }, (_, p) => {
              const lit = p < r.pips!.n, x = X + READOUT_W - PAD - (r.pips!.max - p) * (PIP + PIP_GAP) + PIP_GAP;
              return <Box key={p} x={x} y={y + 9} w={PIP} h={PIP} attrs={{ 'data-ui-pip': lit ? 'lit' : 'off' }}
                style={{ background: hex(lit ? r.pips!.colour : BAR_OFF), border: `${hairline}px solid ${hex(r.pips!.colour, lit ? 1 : 0.5)}` }} />;
            })}
            {r.bar && <Bar x={X + PAD} y={y + LINE + 1} w={READOUT_W - 2 * PAD} h={3} fill={r.bar.fill} colour={r.bar.colour} />}
          </Fragment>
        );
      })}
      {props.help.slice(0, h).map((line, k) => <PixelText key={k} text={line} x={X + PAD} y={Y + helpY + k * HELP_LINE} size={FONT_NATIVE} tint={DIM} />)}
    </>
  );
});
```

`src/renderer/src/ui/duel/EndCard.tsx`:
```tsx
// The duel's end card (endScreen.ts's layout): a dimmed backdrop and a 560 x 200 panel with the outcome, the length and the keys.
import { memo } from 'react';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import type { EndView } from '../../render/duel/endScreen';
import { AMBER, BACKDROP, BACKDROP_ALPHA, DIM, FONT_SIZE, TITLE_SIZE } from '../../render/theme';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

const CARD_W = 560, CARD_H = 200, TOP = (INTERNAL_H - CARD_H) / 2;

export const EndCard = memo(function EndCard({ end }: { end: EndView }) {
  return (
    <>
      <Box x={0} y={0} w={INTERNAL_W} h={INTERNAL_H} style={{ background: hex(BACKDROP, BACKDROP_ALPHA * 0.6) }} />
      <Panel x={(INTERNAL_W - CARD_W) / 2} y={TOP} w={CARD_W} h={CARD_H} />
      <PixelText text={end.title} x={INTERNAL_W / 2} y={TOP + 24} size={TITLE_SIZE} tint={end.tint} anchorX={0.5} />
      <PixelText text={end.length} x={INTERNAL_W / 2} y={TOP + 96} size={FONT_SIZE} tint={DIM} anchorX={0.5} />
      <PixelText text={end.prompt} x={INTERNAL_W / 2} y={TOP + 140} size={FONT_SIZE} tint={AMBER} anchorX={0.5} />
    </>
  );
});
```

`src/renderer/src/ui/duel/Banners.tsx`:
```tsx
// The pause banners and the online notice (spec §6 placements): FONT_SIZE x 1.5, TEXT, centred on their points.
import { memo } from 'react';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { READOUT_COLUMN } from '../../render/duel/interiorModel';
import { FONT_SIZE, TEXT } from '../../render/theme';
import { PixelText } from '../stage/PixelText';
import type { Banners as BannerLines } from '../views';

const SIZE = FONT_SIZE * 1.5, PLAY_CX = (INTERNAL_W - READOUT_COLUMN) / 2;

export const Banners = memo(function Banners({ banners }: { banners: BannerLines }) {
  return (
    <>
      {banners.interior !== null && <PixelText text={banners.interior} x={PLAY_CX} y={80} size={SIZE} tint={TEXT} anchorX={0.5} anchorY={0.5} />}
      {banners.tactical !== null && <PixelText text={banners.tactical} x={INTERNAL_W / 2} y={INTERNAL_H / 2 - 80} size={SIZE} tint={TEXT} anchorX={0.5} anchorY={0.5} />}
      {banners.notice !== null && <PixelText text={banners.notice} x={PLAY_CX} y={130} size={SIZE} tint={TEXT} anchorX={0.5} anchorY={0.5} />}
    </>
  );
});
```

`src/renderer/src/ui/duel/MapOverlay.tsx`:
```tsx
// The tactical map's screen overlay (tacticalLayer.ts's lines 216-222): the zoom text, the scale bar with its end
// ticks (2 px lines centred on their paths) and units label, and the snap-back hint while the camera is free.
import { memo } from 'react';
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { AMBER, DIM, FONT_NATIVE, FONT_SIZE } from '../../render/theme';
import { Box } from '../stage/Box';
import { hex } from '../stage/color';
import { PixelText } from '../stage/PixelText';
import type { MapOverlayView } from '../views';

const BX = 16, BY = INTERNAL_H - 28;

export const MapOverlay = memo(function MapOverlay({ overlay }: { overlay: MapOverlayView }) {
  const px = overlay.scaleBar.px, line = { background: hex(DIM) };
  return (
    <>
      <PixelText text={overlay.zoomText} x={16} y={INTERNAL_H - 64} size={FONT_SIZE} tint={DIM} />
      <Box x={BX} y={BY - 1} w={px} h={2} attrs={{ 'data-ui-scalebar': '' }} style={line} />
      <Box x={BX - 1} y={BY - 5} w={2} h={10} attrs={{ 'data-ui-scalebar': '' }} style={line} />
      <Box x={BX + px - 1} y={BY - 5} w={2} h={10} attrs={{ 'data-ui-scalebar': '' }} style={line} />
      <PixelText text={`${overlay.scaleBar.units} u`} x={BX + px + 8} y={BY - 8} size={FONT_NATIVE} tint={DIM} />
      {overlay.snapHint && <PixelText text="C: SNAP BACK" x={INTERNAL_W / 2} y={INTERNAL_H - 12} size={FONT_SIZE} tint={AMBER} anchorX={0.5} anchorY={1} />}
    </>
  );
});
```

`src/renderer/src/ui/duel/FeelPanel.tsx`:
```tsx
// The flight view's feel panel (feelPanel.ts's layout): the title, six label/value rows and the help lines.
import { Fragment, memo } from 'react';
import { INTERNAL_W } from '../../../../shared/resolution';
import { FEEL_HELP, FEEL_HELP_LINE, FEEL_PANEL_H, FEEL_PANEL_MARGIN, FEEL_PANEL_W, FEEL_ROWS } from '../../render/tactical/feelModel';
import { AMBER, DIM, FONT_NATIVE, FONT_SIZE, LINE, PAD, TEXT } from '../../render/theme';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

const X = INTERNAL_W - FEEL_PANEL_W - FEEL_PANEL_MARGIN, Y = FEEL_PANEL_MARGIN;

export const FeelPanel = memo(function FeelPanel({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <>
      <Panel x={X} y={Y} w={FEEL_PANEL_W} h={FEEL_PANEL_H} />
      <PixelText text="FLIGHT FEEL" x={X + PAD} y={Y + PAD - 6} size={FONT_SIZE} tint={AMBER} />
      {rows.slice(0, FEEL_ROWS).map(([label, value], k) => (
        <Fragment key={k}>
          <PixelText text={label} x={X + PAD} y={Y + PAD - 6 + LINE * (k + 1)} size={FONT_SIZE} tint={DIM} />
          <PixelText text={value} x={X + FEEL_PANEL_W - PAD} y={Y + PAD - 6 + LINE * (k + 1)} size={FONT_SIZE} tint={TEXT} anchorX={1} />
        </Fragment>
      ))}
      {FEEL_HELP.map((line, k) => <PixelText key={k} text={line} x={X + PAD} y={Y + PAD + LINE * (FEEL_ROWS + 1) + PAD + k * FEEL_HELP_LINE} size={FONT_NATIVE} tint={DIM} />)}
    </>
  );
});
```

`src/renderer/src/ui/duel/DuelUi.tsx`:
```tsx
// The duel region (spec §6): the map overlay under the readout, then the banners and the end card on top (scene.ts's order).
import { useUi } from '../context';
import { Stage } from '../stage/Stage';
import { Banners } from './Banners';
import { EndCard } from './EndCard';
import { MapOverlay } from './MapOverlay';
import { ReadoutPanel } from './ReadoutPanel';

export function DuelUi() {
  const duel = useUi((s) => s.duel);
  if (!duel) return null;
  return (
    <Stage>
      {duel.overlay && <MapOverlay overlay={duel.overlay} />}
      <ReadoutPanel rows={duel.readout.rows} help={duel.readout.help} />
      <Banners banners={duel.banners} />
      {duel.end && <EndCard end={duel.end} />}
    </Stage>
  );
}
```

`src/renderer/src/ui/duel/FlightUi.tsx`:
```tsx
import { useUi } from '../context';
import { Stage } from '../stage/Stage';
import { Banners } from './Banners';
import { FeelPanel } from './FeelPanel';
import { MapOverlay } from './MapOverlay';

/** The flight dev view's region: the map overlay, the feel panel and the pause banner. */
export function FlightUi() {
  const flight = useUi((s) => s.flight);
  if (!flight) return null;
  return <Stage>{flight.overlay && <MapOverlay overlay={flight.overlay} />}<FeelPanel rows={flight.feel} /><Banners banners={flight.banners} /></Stage>;
}
```

Replace `src/renderer/src/ui/UiRoot.tsx` with:
```tsx
// The UI tree (React UI spec §1): the Menu (in the app), and the duel and flight regions while their slices are set,
// each in its own boundary. The regions' reset keys are their sinks' epochs.
import { DuelUi } from './duel/DuelUi';
import { FlightUi } from './duel/FlightUi';
import { useUi } from './context';
import { Menu, MenuFallback } from './menu/Menu';
import { RegionBoundary } from './RegionBoundary';

export function UiRoot(props: { menu?: boolean }) {
  const page = useUi((s) => s.menu.page), phase = useUi((s) => s.online.status?.phase ?? 'none'), resetEpoch = useUi((s) => s.menu.resetEpoch);
  const hasDuel = useUi((s) => s.duel !== null), hasFlight = useUi((s) => s.flight !== null);
  const duelEpoch = useUi((s) => s.epochs.duel), flightEpoch = useUi((s) => s.epochs.flight);
  return (
    <>
      {hasDuel && <RegionBoundary name="duel" resetKey={String(duelEpoch)} fallback={null}><DuelUi /></RegionBoundary>}
      {hasFlight && <RegionBoundary name="flight" resetKey={String(flightEpoch)} fallback={null}><FlightUi /></RegionBoundary>}
      {(props.menu ?? true) && <RegionBoundary name="menu" resetKey={`${page}|${phase}|${resetEpoch}`} fallback={<MenuFallback />}><Menu /></RegionBoundary>}
    </>
  );
}
```
Keep the current `resetKey` expression exactly as it is in master's `UiRoot.tsx`. If master's differs from the line above, keep master's.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/uiDuel.test.tsx tests/menu.test.tsx tests/uiStage.test.tsx tests/uiBoundary.test.ts tests/tacticalLayer.test.ts`
Expected: PASS, with clean output.

- [ ] **Step 6: Typecheck and commit**

```bash
git add src/renderer/src/ui/duel src/renderer/src/ui/UiRoot.tsx src/renderer/src/render/tactical/feelModel.ts src/renderer/src/render/tactical/feelPanel.ts tests/uiDuel.test.tsx
git commit -m "feat(ui-ii): the React duel and flight regions (readout, end card, banners, map overlay, feel panel)"
```

---

### Task 4: Wire the scene, the flight mode and the app; delete the Pixi panels

**Files:**
- Create: `src/renderer/src/render/duel/endModel.ts`
- Modify:
  - `src/renderer/src/app/duel/scene.ts`, `duelMode.ts`, `onlineDuel.ts`, `flightMode.ts`
  - `src/renderer/src/render/tactical/tacticalLayer.ts`
  - `src/renderer/src/ui/views.ts`, `src/renderer/src/ui/duel/EndCard.tsx` (the `EndView` import)
  - `src/renderer/src/ui/mount.tsx`
  - `src/renderer/src/main.ts`
  - the spec (deviation 1)
  - tests that construct those deps
- Delete: `src/renderer/src/render/duel/readoutPanel.ts`, `render/duel/endScreen.ts`, `render/tactical/feelPanel.ts`
- Test: update `tests/duelReadout.test.ts`, `tests/tacticalLayer.test.ts`, and any test building `OnlineDuelDeps`/`DuelModeDeps`/`FlightModeDeps` or `createDuelScene`

**Interfaces:**
- Consumes: from Task 1, `createDuelSink`, `createFlightSink`, `setLayout` and `mapOverlayOf`; from Task 3, `UiRoot({ menu })`.
- Produces:
  - `createDuelScene(renderer, { seed, pauseText, ui: DuelSink })`
  - `DuelModeDeps.ui: DuelSink`, `OnlineDuelDeps.ui: DuelSink`, `FlightModeDeps.ui: FlightSink`
  - `mountUi({ el, store, actions, menu? }): Promise<() => void>`

- [ ] **Step 1: Move `endModel`**

Create `src/renderer/src/render/duel/endModel.ts` holding exactly `EndView` and `endModel` from `endScreen.ts`, with that file's imports for them (`Outcome`, `TICK_HZ`, `AMBER`, `GOOD`, `WARN`) and its doc comments. Point every `import … from '…/render/duel/endScreen'` at `endModel` instead, then delete `endScreen.ts`. The importers are `duelMode.ts`, `onlineDuel.ts`, `scene.ts`, `ui/views.ts`, `ui/duel/EndCard.tsx` and `tests/duelReadout.test.ts`. Check with `git grep -n "duel/endScreen" -- src tests scripts`, which should print nothing afterwards.

- [ ] **Step 2: The scene draws through the sink**

In `src/renderer/src/app/duel/scene.ts`:
1. Remove the imports of `BitmapText`, `createEndScreen`, `createReadoutPanel`, `FONT_SIZE` and `TEXT`. Import `type DuelSink` from `../../ui/sinks` and `mapOverlayOf` from `../../ui/views`. Keep `readoutHelp`, `readoutRows` and `type EndView` (now from `endModel`).
2. The signature becomes `createDuelScene(renderer: Renderer, options: { seed: number; pauseText: string; ui: DuelSink })`.
3. Create the layer without `pauseText`: `createTacticalLayer({ fontFamily: font, viewport, seed: options.seed })`.
4. Delete `panel`, `end`, `banner` and `notice` and their setup. The containers become `scene.addChild(layer.container, interior.container)` and `root.addChild(scene)`.
5. In `draw`, keep everything up to and including the interior/tactical branch. In the tactical branch keep the model: `const model = tacticalModel(input); layer.draw(model, combatModel(input)); overlayView = mapOverlayOf(model.overlay);`. Declare `let overlayView: MapOverlayView | null = null` before the branch (import the type from `../../ui/views`).
6. Replace the `banner.visible…`, `notice…`, `panel.draw(…)` and `end.draw(…)` lines with the one sink call below. Keep the shake lines (`const shake = …; scene.position.set(…)`) unchanged.
```ts
      options.ui.frame({
        readout: { rows: readoutRows({ duel: d, mode: view, active: source.active(), other: source.otherStatus() }), help: readoutHelp(view) },
        end: overlay.end,
        banners: {
          interior: overlay.banner !== null && (view === 'interior' || !overlay.layerPaused) ? overlay.banner : null,
          tactical: overlay.layerPaused && view !== 'interior' ? options.pauseText : null,
          notice: overlay.notice ?? null
        },
        overlay: view === 'interior' ? null : overlayView
      });
```
7. In `dispose()`, add `options.ui.clear();` first.

- [ ] **Step 3: The tactical layer loses its screen texts and scale bar**

In `src/renderer/src/render/tactical/tacticalLayer.ts`:
- Remove `pauseText` from `TacticalLayerOptions` and its doc line.
- Remove `zoomText`, `scaleText`, `hint` and `banner` (their `mk` calls, positions, the `banner.text` line and their entries in `texts`).
- In `draw`, delete the scale-bar `overlay.moveTo…` lines and the `setText(zoomText…)`, `setText(scaleText…)`, `setText(hint…)` and `banner.visible` lines, along with the `const o = d.overlay, bx = 16, by = h - 28;` line if nothing else uses it.
- Keep `export const PAUSE_TEXT` (the flight mode uses it) and the arrow glyphs drawn into `overlay`.

- [ ] **Step 4: Duel mode, the online duel and flight mode take their sinks**

- `duelMode.ts`: add `ui: DuelSink` to `DuelModeDeps` (`import type { DuelSink } from '../../ui/sinks'`), and pass `ui: deps.ui` into `createDuelScene(renderer, { seed: deps.seed, pauseText, ui: deps.ui })`.
- `onlineDuel.ts`: add `ui: DuelSink` to `OnlineDuelDeps`, and use `createDuelScene(deps.renderer, { seed: 0, pauseText: 'PAUSED', ui: deps.ui })`.
- `flightMode.ts`:
  - Add `ui: FlightSink` to `FlightModeDeps`. Remove `createFeelPanel`, the panel and its `scene.addChild` entry, and import `FEEL_PANEL_MARGIN`/`FEEL_PANEL_W` from `../../render/tactical/feelModel`. Import `PAUSE_TEXT` from `../../render/tactical/tacticalLayer` and `mapOverlayOf` from `../../ui/views`.
  - Replace the frame's two draw lines with:
```ts
    const paused = runtime.reasons().has('user');
    const model = tacticalModel({ state: runtime.state, prev: runtime.prev, alpha: runtime.alpha(), camera: runtime.camera, viewport, console: 'helm', axes: runtime.axes(), ships: [0], paused, reserveRight: FLIGHT_RESERVE_RIGHT });
    layer.draw(model);
    deps.ui.frame({ feel: feelRows(feelReadout(runtime.feel, ship, runtime.state.map.planet)), banners: { interior: null, tactical: paused ? PAUSE_TEXT : null, notice: null }, overlay: mapOverlayOf(model.overlay) });
```
  - Add `deps.ui.clear();` to `dispose`.
- Delete `render/duel/readoutPanel.ts` and `render/tactical/feelPanel.ts`.

- [ ] **Step 5: The async mount with the glyph atlas**

Replace `src/renderer/src/ui/mount.tsx` with:
```tsx
// Mounts the UI into its element over the canvas (React UI spec §1, §4). It awaits the m5x7 font (already registered by
// loadAssets) and builds the glyph atlas first; on failure the atlas falls back to monospace with one warning.
import { createRoot } from 'react-dom/client';
import type { UiActions } from './actions';
import { UiContext } from './context';
import { buildGlyphAtlas } from './glyphs';
import { GlyphContext } from './stage/GlyphContext';
import type { UiStore } from './store';
import { UiRoot } from './UiRoot';

export async function mountUi(opts: { el: HTMLElement; store: UiStore; actions: UiActions; menu?: boolean }): Promise<() => void> {
  let family = 'm5x7';
  try { await document.fonts.load('16px m5x7'); } catch { /* checked below */ }
  if (!document.fonts.check('16px m5x7')) { family = 'monospace'; console.warn('[ui] m5x7 is not available; HUD text falls back to monospace'); }
  const make = (w: number, h: number): HTMLCanvasElement => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const atlas = buildGlyphAtlas(make, family);
  const root = createRoot(opts.el), value = { store: opts.store, actions: opts.actions };
  root.render(<UiContext.Provider value={value}><GlyphContext.Provider value={atlas}><UiRoot menu={opts.menu ?? true} /></GlyphContext.Provider></UiContext.Provider>);
  return () => root.unmount();
}
```

- [ ] **Step 6: `main.ts`: the sinks, the layout, the dev views**

In `src/renderer/src/main.ts`:
1. Import `createDuelSink` and `createFlightSink` from `./ui/sinks`, `setLayout` from `./ui/store`, `computeLetterbox` from `./render/letterbox`, and `INTERNAL_W`/`INTERNAL_H` from `../../shared/resolution`.
2. In `startApp`, move the `const store = createUiStore(…)` line above `createSessionRouter` (it needs only `bridge`, `settings` and `win`, so also move `const win = window.ftlite?.window;` above it). Then add `const duelSink = createDuelSink(store);` and pass `ui: duelSink` to `startDuelMode({ … })` and to `createOnlineDuelSession({ … })`.
3. In `resize()`, after `renderer.resize(...)`, add:
```ts
    const lb = computeLetterbox(window.innerWidth, Math.max(1, window.innerHeight - top), INTERNAL_W, INTERNAL_H);
    setLayout(store, { scale: lb.scale, offsetX: lb.offsetX, offsetY: lb.offsetY, dpr: window.devicePixelRatio || 1 });
```
4. `const unmountUi = mountUi(...)` becomes `const unmountUi = await mountUi({ el: uiRoot, store, actions });`.
5. The dev views each get a store, a sink and a mount. In `startFlight` and `startDuel`, after `bootFeel(renderer)`:
```ts
  const store = createUiStore({ onlineAvailable: false });
  const actions = createUiActions({ store, single() {}, online() {}, pause() {} });
  const uiRoot = document.createElement('div'); uiRoot.id = 'ui'; document.body.append(uiRoot);
  await mountUi({ el: uiRoot, store, actions, menu: false });
```
   Then replace their `resize` with one that also writes the layout:
```ts
  const resize = (): void => {
    renderer.resize(window.innerWidth, window.innerHeight);
    const lb = computeLetterbox(window.innerWidth, window.innerHeight, INTERNAL_W, INTERNAL_H);
    setLayout(store, { scale: lb.scale, offsetX: lb.offsetX, offsetY: lb.offsetY, dpr: window.devicePixelRatio || 1 });
  };
```
   Pass `ui: createFlightSink(store)` to `startFlightMode` and `ui: createDuelSink(store)` to `startDuelMode`.

- [ ] **Step 7: The spec erratum**

In `docs/superpowers/specs/2026-11-16-react-ui-layer-design.md` §9 item 3, replace `` `banners.tactical = overlay.layerPaused ? pauseText : null` `` with `` `banners.tactical = overlay.layerPaused && view !== 'interior' ? pauseText : null` (the layer is hidden in the interior) ``.

- [ ] **Step 8: Update the tests that used the Pixi panels or the old deps**

- `tests/duelReadout.test.ts`:
  - Change the `endModel` import to `render/duel/endModel`.
  - Delete the case "the panel: a warm-up of 2 frames, then 60 frames … add no display objects" and the case "shows only while the duel is decided, and allocates nothing after creation", together with the now-unused imports (`createReadoutPanel`, `createEndScreen`, `count` if unused). Their behaviour is covered by `tests/uiDuel.test.tsx`, and the sinks' no-write-on-equal test covers the "no per-frame allocation" intent.
- `tests/tacticalLayer.test.ts`: remove `createFeelPanel` and the `panel`/`p0` lines from the allocation case. Keep the layer assertions.
- `tests/duelWeaponsView.test.ts`: rename the case 'reset hides every text, the zoom, scale, hint and banner included' to 'reset hides every text until the next draw' and keep its assertions (the zoom, scale, hint and banner texts no longer exist).
- Then run `git grep -n "createDuelScene\|startDuelMode\|startFlightMode\|createOnlineDuelSession" -- tests`. For each test that builds those deps, add `ui: { frame() {}, clear() {} }`. Where a test asserts on what the scene drew, assert on the sink's last `frame` argument instead.

- [ ] **Step 9: Verify**

Run:
```bash
npm run typecheck
npm test
npm run test:determinism
npm run build
npm run test:online-app-runtime
npm run test:online-recovery-runtime
npm run test:host-runtime
npm run test:rtc-runtime
npm run test:room-service-runtime
```
Also run H-2a-iii's duel smoke, the package.json script whose name contains `duel` and `runtime`. Find it with `grep -n "duel" package.json`.

Expected: all exit 0, and no golden change. A smoke failure is debugged with superpowers:systematic-debugging, and the smoke scripts are never edited. Restore any tracked `.superpowers/sdd/*` artifacts the smokes overwrite (`git checkout -- <paths>`).

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src tests docs/superpowers/specs/2026-11-16-react-ui-layer-design.md   # a directory add also stages its deletions
git status --short   # review: only intended files; no .superpowers/sdd artifacts
git commit -m "feat(ui-ii): the duel scene and flight view draw their UI through React sinks; Pixi readout, end screen, feel panel and screen texts removed"
```
(Never `git add -A` or `git add .`. Check `git status` before committing.)

---

### Task 5: The text-parity probe, the perf counter and the visual check

**Files:**
- Create: `src/renderer/src/ui/probe/samples.ts`, `src/renderer/src/ui/probe/ProbePage.tsx`, `src/renderer/src/app/uiProbe.ts`, `src/renderer/src/ui/perf.ts`
- Modify:
  - `src/renderer/src/app/duel/mode.ts` (`'uiprobe'`)
  - `src/renderer/src/main.ts` (the probe start; the perf flag passed to sinks)
  - `src/renderer/src/ui/sinks.ts` (an optional perf hook)
  - `src/renderer/src/ui/glyphs.ts` (the calibrated constants)
- Test: `tests/uiProbe.test.ts` (`readMode` accepts `uiprobe`)

**Interfaces:**
- Consumes: the stage primitives and `GLYPH_X_PAD`/`GLYPH_Y_OFFSET`.
- Produces:
  - `?mode=uiprobe`: a dev page. Pixi `BitmapText` draws each `PROBE_SAMPLES` entry on the left half, and `<PixelText>` draws the same entry 640 internal px to the right.
  - `windowStats(samples)` and `createUiPerf(enabled, deps?)`. When `?uiperf=1`, the sinks run their `setState` inside `flushSync`, so the timed region covers the sharing pass, React's render and commit and the layout effects (`PixelText`'s canvas draws). It prints `[uiperf] median X ms p95 Y ms` once a second.

- [ ] **Step 1: The probe mode (test first)**

`tests/uiProbe.test.ts`:
```ts
import { expect, it } from 'vitest';
import { readMode } from '../src/renderer/src/app/duel/mode';
import { PROBE_SAMPLES } from '../src/renderer/src/ui/probe/samples';
import { GLYPH_CHARS } from '../src/renderer/src/ui/glyphs';
import { FONT_NATIVE, textPx } from '../src/renderer/src/render/theme';
it('reads ?mode=uiprobe and keeps every probe sample inside its half', () => {
  expect(readMode('?mode=uiprobe')).toBe('uiprobe'); expect(readMode('?mode=x')).toBe('sector');
  for (const s of PROBE_SAMPLES) {
    const w = textPx(s.text, s.size / FONT_NATIVE), h = 16 * (s.size / FONT_NATIVE);
    expect(s.x - s.anchorX * w, s.text).toBeGreaterThanOrEqual(0); expect(s.x + (1 - s.anchorX) * w, s.text).toBeLessThanOrEqual(632);
    expect(s.y - s.anchorY * h, s.text).toBeGreaterThanOrEqual(0); expect(s.y + (1 - s.anchorY) * h, s.text).toBeLessThanOrEqual(712);
  }
  const chars = PROBE_SAMPLES.map((s) => s.text).join('');
  for (const ch of GLYPH_CHARS) expect(chars, `probe covers ${JSON.stringify(ch)}`).toContain(ch);
});
```
Run it and see it fail. Then:
- In `mode.ts`, make `AppMode` include `'uiprobe'` and accept it in `readMode`.
- Create `src/renderer/src/ui/probe/samples.ts`. Export `PROBE_SAMPLES: { text: string; x: number; y: number; size: number; tint: number; anchorX: number; anchorY: number }[]`. Cover:
  - `FONT_NATIVE`, `FONT_SIZE`, `TITLE_SIZE` and `FONT_SIZE * 1.5`
  - anchors 0, 0.5 and 1 (x and y)
  - the strings `the quick brown fox 0123456789`, `PAUSED   ESC: RESUME`, `DUEL LENGTH 1:23`, `LEAVING…`, `CONNECTION LOST — RECONNECTING`, and all of `GLYPH_CHARS` at `FONT_NATIVE` and `FONT_SIZE`, split into as many lines as needed so each fits its half (the test checks extents and character coverage)
  - tints `TEXT`, `DIM` and `AMBER`
  - x within 8..600, y within 8..700
- Create `ProbePage.tsx`, which renders `<Stage>` with a `<PixelText>` per sample at `x + 640`.
- Create `app/uiProbe.ts`, with `startUiProbe(renderer, store)`. It first hides every existing stage child (as `scene.ts` does: `for (const c of renderer.app.stage.children) c.visible = false`) and adds a full `INTERNAL_W × INTERNAL_H` `Graphics` rect filled `0x05060a`, so both halves share one plain background. It then adds one Pixi `BitmapText` per sample (font `renderer.assets.fontFamily`, `fontSize: size`, `tint`, `anchor.set(anchorX, anchorY)`, `roundPixels = true`, at `x, y`) to the stage, then mounts `ProbePage` through `mountUi`'s providers.
- Have `main.ts`'s `start()` route `uiprobe` to it, with the same resize and `setLayout` as the dev views. A `ProbePage`-only root is acceptable: reuse `GlyphContext` and `UiContext` by exporting a `mountProbe` from `mount.tsx` that renders `<ProbePage>` instead of `<UiRoot>`.

- [ ] **Step 2: The perf counter**

Create `src/renderer/src/ui/perf.ts`:
```ts
// The dev-only UI budget counter (React UI spec §2): with ?uiperf=1 each sink write runs inside flushSync, so one sample
// is the sharing pass plus React's render, commit and layout effects (PixelText's canvas draws) for that frame.
import { flushSync } from 'react-dom';

/** The median and 95th percentile of a window of samples (nearest-rank). */
export function windowStats(samples: readonly number[]): { median: number; p95: number } {
  if (samples.length === 0) return { median: 0, p95: 0 };
  const s = [...samples].sort((a, b) => a - b), at = (q: number): number => s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]!;
  return { median: at(0.5), p95: at(0.95) };
}
export interface UiPerf { run(write: () => void): void }
export function createUiPerf(enabled: boolean, deps: { now?: () => number; log?: (line: string) => void; every?: (cb: () => void, ms: number) => unknown } = {}): UiPerf {
  if (!enabled) return { run: (write) => write() };
  const now = deps.now ?? (() => performance.now()), log = deps.log ?? ((line) => console.info(line)), samples: number[] = [];
  (deps.every ?? ((cb, ms) => setInterval(cb, ms)))(() => { const { median, p95 } = windowStats(samples); log(`[uiperf] median ${median.toFixed(2)} ms p95 ${p95.toFixed(2)} ms`); }, 1000);
  return { run(write) { const t0 = now(); flushSync(write); samples.push(now() - t0); if (samples.length > 60) samples.shift(); } };
}
```
Wire it in:
- `createDuelSink(store, perf?)` and `createFlightSink(store, perf?)` call `(perf ?? passThrough).run(() => store.setState(...))` for their write. `passThrough` is `{ run: (w) => w() }`.
- `main.ts` (the app and both dev views) creates one with `createUiPerf(new URLSearchParams(location.search).get('uiperf') === '1')` and passes it to the sinks.

Write `tests/uiPerf.test.ts`:
```ts
import { expect, it, vi } from 'vitest';
import { createUiPerf, windowStats } from '../src/renderer/src/ui/perf';
it('windowStats is nearest-rank over the window', () => {
  expect(windowStats([])).toEqual({ median: 0, p95: 0 });
  expect(windowStats(Array.from({ length: 60 }, (_, i) => i + 1))).toEqual({ median: 30, p95: 57 });
});
it('a disabled counter runs the write and never schedules; an enabled one times it and logs once a second', () => {
  const every = vi.fn(), write = vi.fn(); createUiPerf(false, { every }).run(write); expect(write).toHaveBeenCalledOnce(); expect(every).not.toHaveBeenCalled();
  let t = 0, tick = (): void => {}; const log = vi.fn();
  const perf = createUiPerf(true, { now: () => t, log, every: (cb) => { tick = cb; } });
  perf.run(() => { t += 2; }); perf.run(() => { t += 4; }); tick();
  expect(log).toHaveBeenCalledWith('[uiperf] median 2.00 ms p95 4.00 ms');
});
```

- [ ] **Step 3: Calibrate the glyph constants with the probe**

1. `npm run build`.
2. In a scratchpad folder, install `playwright-core@1.48.2` and write `probe.cjs`. It launches `node_modules/electron/dist/electron.exe` with `args: ['<worktree>']` and env `FTLITE_MODE=uiprobe` (main reads `FTLITE_MODE` the way `npm run dev:flight` does; check `src/main/index.ts`). It then sets the content size, waits 500 ms, and takes a screenshot. Run it at 1280×720 (scale 1) and 1920×1080 (scale 1.5).
3. With `pngjs` (a repo devDependency), compare the left half with the right half, shifted by `640 × scale` device px.
4. Count the pixels whose RGB differs by more than 8 in any channel.
5. Calibrate in this order until both scales report **0** mismatches:
   - `GLYPH_Y_OFFSET`, judged on the `anchorY` 0 samples only
   - `GLYPH_LINE_H` (from `null` to a number), judged on the `anchorY` 0.5 and 1 samples
   - `GLYPH_X_OFFSET`, judged on every sample
   `GLYPH_X_PAD` is not a knob. Raise it only if a glyph's ink is visibly clipped. Keep the screenshots and counts in `C:\Users\djuar\FTLite-shots\ui-ii\probe\`.
6. If 0 is not reachable, record the best counts. Crop the worst sample from both halves at 4× zoom, and keep the counts and crops for the controller's report to the owner. Do not loop beyond 10 calibration attempts.

- [ ] **Step 4: The visual check**

Take screenshots before (master at the plan's base) and after (this branch) in `C:\Users\djuar\FTLite-shots\ui-ii\{before,after}\`, using the visual-check method:
- Single player in the interior, paused (Esc).
- The Helm view (Tab once) with the camera free (right-drag) and not paused.
- The end card, when one can be reached deterministically. Otherwise skip it and say so.
- The flight dev view (`FTLITE_MODE=flight`), paused.

Compare each pair with the Read tool. Expected:
- The panels, text and positions match, except the deliberate no-shake change.
- Live values may differ, because the sim moves.

Run once with `?uiperf=1`: after the app loads, `const u = new URL(page.url()); u.searchParams.set('uiperf', '1'); await page.goto(u.href);`, then click `single-player`. Record the median and p95 over 60 s of the duel. The budget is 1.5 ms median and 4 ms p95. Record the numbers whether they pass or fail, and report a miss as a concern.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ui/probe src/renderer/src/app/uiProbe.ts src/renderer/src/ui/perf.ts src/renderer/src/ui/sinks.ts src/renderer/src/ui/mount.tsx src/renderer/src/ui/stage/PixelText.tsx src/renderer/src/ui/glyphs.ts src/renderer/src/app/duel/mode.ts src/renderer/src/main.ts tests/uiProbe.test.ts tests/uiPerf.test.ts
git commit -m "feat(ui-ii): the text-parity probe (?mode=uiprobe), calibrated glyph offsets and the ?uiperf=1 counter"
```

---

## Self-review notes

- **Spec coverage for UI-ii:**
  - §2: the duel/flight slices, sinks, sharing, epochs, the selector rule and the budget → Tasks 1, 3 and 5.
  - §3's UI-ii rows → Tasks 3 and 4.
  - §4: the stage, rounding, the atlas, PixelText, panels, bars, pointer events and the dpr → Task 2.
  - §6: placements, the sinks' calls, the shake change, the dev views → Tasks 3 and 4.
  - §8: unit and component tests, guards (the existing `uiBoundary` walks the new files), the visual check and the probe → Tasks 1–5.
  - §9 items 2–3 → Task 4.
- **Deferred to UI-iii:** the image cache, `<Row>`, `<Cells>`, `<Icon>` and the map panel SVG (deviation 2).
