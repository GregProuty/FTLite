# React UI layer (2026-11-16)

Move every screen-space menu and UI surface in the renderer from hand-built DOM and Pixi `BitmapText` panels to React,
with one zustand store as the only path from the game (sim publications, online status, other players' seats and
votes) into the UI. Pixi keeps the game world. No sim, authority, network or golden-hash change.

## The owner's words

> "because we're using typescript in electron, could we introduce React as the menu/UI layer?"
>
> "yes write a spec for this, including the refactor for all existing menu/ui items. Lets use zustand (or similar if
> theres a clearly better option) for state management. The UI will have to update from simulation changes and other
> players inputs."

## Decisions

1. **React 19 + react-dom 19**, built by `@vitejs/plugin-react` in the electron-vite renderer config only. Main,
   preload and utility builds are untouched. `tsconfig.web.json` gets `"jsx": "react-jsx"` and includes `*.tsx`.
2. **zustand 5** for state. No other library is clearly better here. Redux Toolkit is heavier and adds nothing for one
   local store. Jotai and Valtio are fine but don't fit as well. zustand fits for three reasons:
   - Its vanilla store (`zustand/vanilla`) can be written from plain TypeScript outside React: the sessions, the online
     bridge and the duel mode push into it without knowing React exists.
   - Components subscribe with selectors, so a per-frame push re-renders only the panels whose slice changed.
   - It is about 1 KB with no providers.
3. **Scope: everything drawn in screen space.** Pixi keeps everything anchored to or drawn as the world (§3).
4. **One source of layout truth stays.** `theme.ts` (colours, font sizes, advances, `LINE`, `PAD`) and `hudLayout.ts`
   (every rectangle in internal pixels) are kept and read by the React components, so `hudFit`, `layout` and the
   contrast tests keep guarding the layout unchanged.
5. **The models stay; only the views change.** `buildHudModel`, `readoutRows`/`readoutHelp`, `endModel`,
   `tacticalModel`'s overlay, `feelModel` and every `*Model.ts` are already pure. React components render those
   models. The Pixi view objects that drew them are deleted. Where a view read a value the model does not carry, the
   model gains it (§7), so the UI reads only models.
6. **The UI is read-only toward the game.** Components never import sim, authority, network or client-control runtime
   modules (the guard in §8 states the exact rule). They read the store and call actions. In-game input stays on the
   existing keyboard and pointer sources. The HUD takes no pointer events, so the duel's mouse pan and zoom on the
   canvas keep working.
7. **Every `data-testid` the menu has today is kept, on an element of the same role with the same text**, and the
   `session-menu` root keeps its geometry (§5). The Electron smokes drive the menu by native clicks and typing on those
   IDs, and measure the root, and must pass unchanged.
8. **Three parts, each merged on its own:** UI-i (foundation and the menu), UI-ii (duel and flight UI), UI-iii (the
   sector HUD). UI-i and UI-ii go before H-2a-iii (see §9).

## 1. Architecture

```
 preload bridge ──onStatus──► actions.setStatus ─┐
 online renderer session ── hudSink.update ──────┤
 couch/sector session ───── hudSink.update ──────┤                     ┌────────── React tree ──────────┐
 duel mode / online duel ── duelSink.frame ──────┼─► uiStore ──────────┤ <UiRoot>: Menu, Hud, DuelUi,   │
 flight dev view ────────── flightSink.frame ────┤  (zustand/vanilla)  │ FlightUi (render rule, §1)     │
 main.ts (router, resize) ─ layout, app.screen ──┘        ▲            └──────────────┬─────────────────┘
                                                          └──── uiActions ◄───────────┘ (menu → preload API, router)
 Pixi canvas (world, enemy window, projectiles, callouts, tactical scene): unchanged, under the UI
```

New code lives in `src/renderer/src/ui/`:

| File | Purpose |
|---|---|
| `store.ts` | `createUiStore()`: the vanilla store, its slices and setters. No React import. |
| `share.ts` | `replaceEqualDeep(prev, next)`: structural sharing for per-frame models (§2). Pure. |
| `actions.ts` | `createUiActions(deps)`: everything the menu does (host, join, ready, leave, settings, `setStatus`…). It wraps the preload API and the session router and holds today's operation-id/pending/error logic from `sessionMenu.ts`. |
| `sinks.ts` | `hudSink`, `duelSink`, `flightSink` (§2). Each writes one store slice and has `clear()`. |
| `mount.tsx` | `mountUi({ store, actions, el, images, menu })`: awaits the font and image cache (§4), then `createRoot(el).render(<UiRoot/>)`. It returns a dispose function. |
| `stage/` | The pixel-stage primitives (§4): `<Stage>`, `<Box>`, `<PixelText>`, `<Row>`, `<Panel>`, `<Bar>`, `<Cells>`, `<Icon>`. |
| `glyphs.ts` | The m5x7 glyph atlas (§4). |
| `images.ts` | The UI image cache (§4). |
| `menu/` | `Menu.tsx` and one component per page: `Home`, `Multiplayer`, `Settings`, `HostForm`, `JoinForm`, `SessionPage`, `SessionStrip`. |
| `duel/` | `ReadoutPanel`, `EndCard`, `Banner`, `MapOverlay`, `FeelPanel`. |
| `hud/` | `Hud` and its panels (§3, §7). |

`main.ts` creates the store, the actions and the sinks, mounts the UI into one `#ui` element over the canvas, and
keeps today's router, bridge and lifecycle wiring. `session.ts` and `onlineSession.ts` keep their shapes: `deps.hud` is
`hudSink`. `duelMode.ts` and `flightMode.ts` take their sink as a new dependency.

**The render rule of `<UiRoot>`.** Each region sits in its own error boundary (§2, failure modes):

- `<Menu>`: whenever the `menu` prop of `mountUi` is true (the app). On page `single` it renders only its empty, hidden root (§5).
- `<Hud>`: when `hud !== null`.
- `<DuelUi>`: when `duel !== null`.
- `<FlightUi>`: when `flight !== null`.

Each slice is non-null only while its producer runs, because every producer clears its sink on dispose (§2). So
Single player never shows a stale sector HUD, and M back to the menu leaves no duel UI behind.

## 2. State and data flow

**Store slices** (all plain data):

- `app`: `screen: 'menu' | 'single' | 'online'` (mirrors the router, written by `main.ts` on each router change) and
  `inputBlocked`.
- `menu`: `page`, `pending`, `localError`, `recovering`, `leaving`, `hadView`, `fullscreen`,
  `operation`. This is `sessionMenu.ts`'s state.
- `online`: `status: OnlineStatus | null` and `receivedAt` (the receipt-age clock).
- `settings`: `volume`, `controls` (the read-only list).
- `layout`: `scale`, `offsetX`, `offsetY`, `stripHeight`, `dpr`. Written by `main.ts`'s resize (§4) and by the strip
  (§5).
- `hud: HudModel | null`: the sector HUD.
- `duel: DuelUiView | null`, where `DuelUiView = { readout: { rows, help }, end: EndView | null, banners: Banners,
  overlay: MapOverlayView | null }`.
- `flight: FlightUiView | null`, where `FlightUiView = { feel: rows, banners: Banners, overlay: MapOverlayView | null }`.
- `Banners = { interior: string | null; tactical: string | null; notice: string | null }`, placed as in §6.
- `epochs: { hud, duel, flight }`: counters bumped by each sink when its slice goes from null to non-null (the error
  boundaries' reset keys, below).

**How game changes reach the UI.**

- **Sim changes:** the local session or the online client builds `HudModel` from the latest state each frame, as
  today, and calls `hudSink.update(m)`. The duel and flight modes build their views each frame and call
  `duelSink.frame(view)` / `flightSink.frame(view)`.
- **Other players' actions:** seats, ready flags, disconnects, host loss, recovery and checkpoints arrive as
  `OnlineStatus` pushes. Votes, seated consoles and crew state arrive in the published sim state the models are built
  from. The bridge's `onStatus` calls **one** action, `actions.setStatus(next)`. It performs a single `setState` that
  writes `status` and `receivedAt` and applies every menu transition `sessionMenu.ts`'s `setStatus` makes today
  (`page`, `hadView`, `recovering`, `leaving`, and the home callback), so React never commits a new status with an old
  page.

**Per-frame models and re-renders.** Each sink passes its new view through `replaceEqualDeep(prev, next)` before its
one `setState`, so unchanged subtrees keep their identity (the technique TanStack Query uses). That gives one `setState`
per frame per running producer, and React batches each into one commit.

**Selector rule** (zustand 5 loops on a selector that returns a fresh object):

- A selector returns a store reference (`s => s.hud?.players[i]`) or a primitive. Never an object literal or a new
  array.
- A pick of several fields uses `useShallow` from `zustand/react/shallow`.
- Values derived from the tick are selected as primitives. For example, the callout flash is
  `s => s.hud ? Math.floor(s.hud.tick / 10) % 2 : 0` plus the `calloutFlash` reference.
- Panels are `React.memo` components that take selected references as props.

**Budget.** On the owner's PC, the UI's per-frame work (the sink's sharing pass plus the React commit) is at most
**1.5 ms median and 4 ms p95** over a 60-second running sector or duel. A dev-only `?uiperf=1` query prints the rolling
median and p95 once a second to the console. Each part's visual check records the numbers.

**Timers in the UI.** The menu's reconnect countdown and checkpoint receipt age use `useNow(1000, phaseMs)`. It
re-renders at each wall-clock time `t` with `t ≡ phaseMs (mod 1000)` (a `setTimeout` to the next such time, re-armed each
time and whenever the phase changes). The countdown's phase is `retryAtMs % 1000`, so it changes when the deadline crosses
a whole second. The receipt age's phase is the wall-clock offset at which its elapsed age crosses a whole second, which
stays constant while both clocks advance. The text therefore changes at the same instant as today's per-frame writes.

**Input blocking.** `main.ts` subscribes to the store outside React. It derives `blocked = !(menu.page === 'session'
&& menu.hadView)` exactly as `render()` does today. When the value differs from the last one, it resets the keyboard
and calls `online?.setInputBlocked(blocked)`. The initial value is `true`, as today. On `beforeunload`, `blocked` is
set to `true` before `session.dispose()`, as `sessionMenu.dispose()` does now.

**Failure modes.**

- *A component throws:* each region (`Menu`, `Hud`, `DuelUi`, `FlightUi`) has its own error boundary. It logs the
  error once with `console.error`. The other regions stay mounted, so a bad HUD model can never take away the strip's
  Leave and Pause. Each boundary has a reset key, and it retries rendering its region when the key changes:
  - `Hud`, `DuelUi`, `FlightUi`: the slice's `epoch`, a counter in the store that the sink bumps each time the slice
    goes from null to non-null. Until then the failed region renders nothing.
  - `Menu`: `` `${menu.page}|${online.status?.phase ?? 'none'}` ``, so the next page change or status push retries it.
    Until then it renders a minimal fallback with the same `session-menu` root: the text `Menu error` and one plain
    button. The button is `Leave` (calling `actions.leave`) when `online.status?.actions` includes `leave`, else
    `Return to menu` (calling `actions.home`).
- *The font or image cache fails* (§4): `mountUi` still mounts. Text falls back as §4 says, and a failed icon is
  omitted, the same rule as `featureReady` today.
- *React itself fails to load or mount:* `start().catch(showFatal)` shows the plain-DOM fatal screen, as today.

**Determinism boundary.** Nothing in the store feeds back into the sim. Commands still flow only through the existing
input, card-controller and command paths. The guards are in §8.

## 3. What moves, what stays

**Moves to React. Each Pixi or DOM view below is deleted; pure model code in the same file moves to a model file:**

| Today | React | Part |
|---|---|---|
| `render/sessionMenu.ts`: Home, Multiplayer, Settings (volume, fullscreen, controls table), Host form, Join form, the session page (room code, seat, roster with Remove, Ready/Start, Pause, mirror and recovery lines, Re-host, Retry, Reconnect, Forget seat, Leave, Try another code, Return to menu) and the in-session strip | `ui/menu/*` | UI-i |
| `render/duel/readoutPanel.ts` (rows, pips, bars, help) | `ui/duel/ReadoutPanel` | UI-ii |
| `render/duel/endScreen.ts`: the view is deleted, `endModel` and `EndView` move to `render/duel/endModel.ts` | `ui/duel/EndCard` | UI-ii |
| `duelMode.ts`'s interior pause `BitmapText`, and `tacticalLayer.ts`'s pause banner (used by the duel's tactical views and by flight) | `ui/duel/Banner` (`interior`, `tactical`) | UI-ii |
| `tacticalLayer.ts`'s screen-space overlay: the zoom text, the scale bar with its label, and the `C: SNAP BACK` hint (from `tacticalModel`'s `overlay`) | `ui/duel/MapOverlay` | UI-ii |
| `render/tactical/feelPanel.ts` (flight dev view) | `ui/duel/FeelPanel` | UI-ii |
| `render/hud.ts`: the clock card, power panel and cell rows, threats panel, four player blocks (name, health bar, O2 icon, prompt lines with key glyphs, skills or vote, progress strip), console cards (tab bar, Engineering, Upgrades page, Weapons strip and rows, Science, Navigation, Doors, footers, charge strip), event card with votes, banner, banner glyphs, progress line, notice, lobby/summary card and backdrop, credits overlay | `ui/hud/*` | UI-iii |
| `render/mapPanel.ts` (sector map) | `ui/hud/MapPanel` (SVG) | UI-iii |
| `render/panel.ts` | `ui/stage/Panel` (deleted once `enemyWindow.ts` stops importing it, see below) | UI-iii |

**Stays in Pixi, and why:**

- The world layers (tiles, effects, room icons, console desks, magazine, crew, boarders), projectiles, the enemy
  window's ship scene, the duel interior (`interiorView.ts`, a world-space view of the ship) and the tactical map's
  world-space content: the grid, ships, missiles, arrows, the lock ring, and their labels and info texts. They are drawn in or
  anchored to world space, scaled and shaken with it, and animated per sprite. React gains nothing there.
- The callout bubbles (`callouts.ts`). They are anchored to crew in world coordinates and follow the world fit and
  shake.
- `enemyWindow.ts` including its labels. Its frame and texts are part of that scene. UI-iii moves `drawPanel` into
  `enemyWindow.ts` as a private helper so `panel.ts` can be deleted.
- The fatal startup screen (`showFatal` in `main.ts`). It must work when React or the assets fail to load, so it stays
  plain DOM.

After UI-iii, `Renderer.hud` (the Pixi HUD container) and `createHud` are gone. `SessionDeps.hud` becomes
`{ update(m: HudModel): void; clear?(): void }` (§7) and is satisfied by `hudSink`.

## 4. The pixel stage (looking the same)

The UI must look the same as today's Pixi panels: same rectangles, same glyph shapes, hard pixel edges.

- **One coordinate system.** `<Stage>` covers the canvas's letterboxed 1280×720 area (`position: fixed`, at the
  canvas's top, which is `stripHeight`). Every child positions in **internal pixels** through `<Box x y w h>`. `<Box>`
  rounds each edge in device pixels and converts back:
  `css = round((offset + internal × scale) × dpr) / dpr`. The rounding is done in JS from the `layout` slice, not with
  CSS transforms. So at any `dpr` (Windows 125 % or 150 %) and any scale `computeLetterbox` produces (including the
  unsnapped `fit < 1` when the strip takes height), edges land on whole device pixels.
- **Text is drawn from a hard-edged glyph atlas, not as DOM webfont text**, so it follows Pixi BitmapText's rule:
  glyphs rasterised once at 16 px, then scaled with nearest sampling.
  - `glyphs.ts` builds the atlas once at mount. It draws the 95 printable ASCII characters with `ctx.font = '16px
    m5x7'` (the font is already in `document.fonts`; `mountUi` first awaits `document.fonts.load('16px m5x7')`), then
    snaps every pixel's alpha to 0 or 255.
  - Advances come from `theme.ts`'s `advance()`, the same table `textPx` uses, never from DOM measurement.
  - `<PixelText text tint size x y anchorX>` is one `<canvas>`. Its size in device pixels is the text's internal width
    and line height × `scale × dpr`. It draws each glyph from the atlas with `imageSmoothingEnabled = false` at glyph
    scale `size / 16 × scale × dpr`, then tints with `source-in`. It redraws only when `text`, `tint`, `size`, `scale`
    or `dpr` changes.
  - The vertical placement matches BitmapText's (the caps 8 px under the line top at `FONT_SIZE`, scaled for other
    sizes). Anchors 0, 0.5 and 1 offset by the `textPx` width.
  - At non-integer glyph scales (`FONT_NATIVE` help text at scale 1.5, any text at `fit < 1`), nearest sampling
    doubles or drops pixel rows exactly as Pixi's nearest scaling does today. That is parity, and it is not a
    regression.
  - *Fallback:* if the font is not available (`document.fonts.check('16px m5x7')` is false after the load), the atlas
    is drawn with the `monospace` family, text is still placed by `textPx`, and `console.warn` names the fallback.
- **The menu's own text** (UI-i) stays normal DOM text in today's monospace style. It is not pixel-staged in this spec.
- **Colours.** A `hex(0xf2f5fa)` helper turns `theme.ts` numbers into CSS. No colour is written twice.
- **Rows.** `<Row parts>` (hud.ts's `fillRow`) places each part absolutely at an internal x accumulated with
  `ROW_GLYPH`, `ceil(textPx(text))` and `ROW_GAP`, as `fillRow` does with measured BitmapText widths today. Widths
  that hud.ts measured from text (the summary backdrop, the banner-glyph row's centring) use `textPx`/`rowPx`.
- **Panels, bars, cells.** `<Panel>` draws the 2 px border and 1 px inner highlight (`drawPanel`'s look), with border
  widths scaled and rounded in device pixels. `<Bar>` and `<Cells>` reproduce the HUD's track, fill, failed,
  overdrive and heat-strip rules from `hud.ts`'s `bar` and `cellRow`.
- **Images.** `images.ts` builds a cache in `mountUi`, which awaits it before the first render. For each texture name
  the UI uses (threat icons, `icon.oxygen`, the key-prompt glyphs) and each station glyph kind (`drawIcon` into a
  white `Graphics`), it awaits Pixi's `renderer.extract.base64(target)` and stores a data URL. Texture targets are a
  `Sprite` of the bound texture, so a frame cut from a sheet extracts only that frame. Each extraction is in its own
  try/catch, and a failure omits that icon with one `console.warn`. `<Icon>` draws an `<img>` with `image-rendering:
  pixelated`. Tinted glyphs use the data URL as a CSS `mask-image` over a `background-color`. Missing optional
  assets keep today's fallback (`featureReady`): the icon is omitted.
- **The map panel** is an inline SVG with `viewBox` in internal pixels and `shape-rendering: crispEdges`, drawn from
  `MapModel` as `mapPanel.ts` draws it today. Its titles are `<PixelText>` over the SVG.
- **Pointer events.** `<Stage>` and everything on it set `pointer-events: none`. Only the menu takes pointer events.

## 5. The menu (UI-i)

- **Behaviour moves line for line from `sessionMenu.ts`:** the same pages and transitions, the same `ERRORS` strings,
  the same enabled/disabled rules (`can(action)`), the same operation-id guard against stale results, the same
  room-code validation and upper-casing, and the same focus on the form control when a form opens. Form controls are
  React-controlled. Native `click`, `insertText` and keyboard selection on the capacity `<select>` (the smoke driver's
  `type` and `capacity` commands) fire the `input`/`change` events React listens to, so the driver needs no change.
- **Settings and status pushes keep today's rule.** `setStatus` sets `page = 'session'` for any non-idle push before
  its `page !== 'settings'` render check, so a session takes over Settings at once (`mainMenu.test.ts`: "a session
  still takes over"). An idle push leaves `page` on Settings. React re-renders Settings with the same elements, so an
  open select keeps its identity and value (the test "keeps the Settings page intact" asserts the same node). The
  round-1 note that pushes are deferred on Settings misread `sessionMenu.ts` L177 and is withdrawn.
- **The root element.** `data-testid="session-menu"` and `aria-label="FTLite session menu"` sit on `<Menu>`'s root
  element. It is the full-screen overlay when not playing and exactly the strip (`position: fixed; top: 0`, full
  width) while playing (`page === 'session' && hadView`). It is never `#ui`, `<UiRoot>` or the stage. On page `single`
  it renders only that root, empty and `display: none`, as the DOM menu did (the smokes' `layout` command measures it
  during Single player). A jsdom test asserts that while playing, the element contains only the strip.
- **The strip's height reaches the canvas.** `SessionStrip` has a layout effect with a `ResizeObserver`. It writes
  the measured height into `layout.stripHeight` on mount and on every resize, and writes `0` in its cleanup (so Leave
  restores the full viewport). `main.ts` subscribes to `layout.stripHeight` (with an equality check) and calls its
  `resize()`. `resize()` places the canvas at `top: stripHeight`, computes the letterbox from `innerHeight −
  stripHeight`, writes `scale`, `offsetX`, `offsetY` and `dpr` into `layout`, and resizes the renderer, as today's
  `resize()` does with `reservedHeight()`.
- **Logic stays out of components.** `actions.ts` holds the logic, and components only render the store and call
  actions, so the logic stays unit-testable without a DOM.
- **The imperative API.** What `main.ts` and H-2a-iii use (`setStatus`, `leaveSingle`, `home`, `windowResized`, and
  H-2a-iii's planned `leave`) becomes `actions` methods with the same names and behaviour. Visual styling matches
  today's inline styles (dark panel, `#52718d` borders, monospace) in one CSS module.
- **Accessibility stays:** `aria-label` on the root and controls, `role="status"` and `aria-live="polite"` on the
  message line.

## 6. Duel and flight UI (UI-ii)

- **`duelMode.ts` and the sink.** `duelMode.ts` stops creating `createReadoutPanel`, `createEndScreen` and the paused
  `BitmapText`, and takes `duelSink` as a dependency. Each frame it calls `duelSink.frame({ readout: { rows:
  readoutRows(...), help: readoutHelp(view) }, end: endModel(...), banners, overlay })`, where:
  - `banners.interior` is the pause text when `userPaused && view === 'interior'`, else null.
  - `banners.tactical` is the pause text when `userPaused && view !== 'interior'`, else null.
  - `banners.notice` is null (H-2a-iii's online start fills it: `YOU: HELM`).
  - `overlay` is `tacticalModel(...).overlay` in the map views and null in the interior.
  On dispose it calls `duelSink.clear()`.
- **Placements** (internal pixels, anchor 0.5/0.5, `FONT_SIZE × 1.5`, `TEXT` tint):
  - `interior`: `((INTERNAL_W − READOUT_COLUMN) / 2, 80)`, today's duelMode banner.
  - `tactical`: `(INTERNAL_W / 2, INTERNAL_H / 2 − 80)`, today's tacticalLayer banner.
  - `notice`: `((INTERNAL_W − READOUT_COLUMN) / 2, 130)`, H-2a-iii's.
- **`MapOverlay`** reproduces tacticalLayer's overlay:
  - the zoom text at `(16, h − 64)`
  - the scale bar from `(16, h − 28)`, `scaleBar.px` long with 10 px end ticks, 2 px, `DIM`
  - its `${units} u` label at `(16 + px + 8, h − 36)`, `FONT_NATIVE`
  - the hint `C: SNAP BACK` at `(w / 2, h − 12)`, anchor 0.5/1, `AMBER`, shown while `snapHint`
  `tacticalLayer.ts` stops drawing all of these, and its `pauseText` option is removed.
- **Flight.** `flightMode.ts` takes `flightSink` and calls `flightSink.frame({ feel, banners: { interior: null,
  tactical: paused ? text : null, notice: null }, overlay })` each frame, and `clear()` on dispose.
- **Screen shake** moves only the Pixi `scene`, as today. The readout panel, the map overlay and the banners no longer
  shake with it. **This is a deliberate visible change:** in the Pixi version the readout and the overlay shook with
  the scene. A fixed panel is easier to read, and the end card and the interior banner already stay still.
- **The dev views.** `?mode=duel` and `?mode=flight` create a store and sinks, call `mountUi({ ..., menu: false })`
  (no actions, no `<Menu>`) and set `app.screen = 'single'`. Their resize writes the `layout` slice with `stripHeight`
  0, the same `resize()` as §5.

## 7. The sector HUD (UI-iii)

- **`<Hud>` renders `HudModel`**, with one component per panel from §3. The rectangles come from `hudLayout.ts`, the
  rules from today's `hud.ts`:
  - which panels show per phase
  - row tints and the callout flash at `floor(tick / 10) % 2`
  - the Weapons row window, the Science rows and Engineering's eighth row
  - the event card's height, grown to its content
- **The model gains what hud.ts read from sim directly:**
  - `HudPlayer.seatedName` (`STATION_NAMES[seated]`, or '')
  - `HudModel.maxCells` (`max(STATION_MAX) + UPGRADE_MAX + STATION_OVERDRIVE`, the heat strip's width)
  `buildHudModel` fills them. The model tests gain one assertion each.
- **The callers don't change.** The online renderer session and the couch session keep calling
  `deps.hud.update(buildHudModel(...))`. On dispose each calls `deps.hud.clear()` (a new optional method on the
  `hud` dependency's type). Nothing else about how the model is built changes.

## 8. Testing

- **Unit (node env).**
  - `replaceEqualDeep`: identity kept for equal subtrees, replaced on change, arrays, nulls, primitives.
  - The store setters and the sinks' `clear()`.
  - `actions.ts` against a fake preload API, including `setStatus`'s single `setState` and the Settings push rule
    (§5).
  - The `sessionMenu.test.ts` and `mainMenu.test.ts` cases are ported one for one into `actions.test.ts` (logic) and
    `menu.test.tsx` (rendering).
  - The countdown under fake timers.
  - The glyph atlas's alpha snapping, and `<Row>` x positions equal to `rowPx`'s sums.
- **Components (`// @vitest-environment jsdom`, `@testing-library/react`).**
  - Each menu page renders its controls and testids for a set of `OnlineStatus` fixtures, including the
    `session-menu` root holding only the strip while playing.
  - The HUD panels render fixture models from `tests/helpers/cardUi.ts`. jsdom has no canvas, so `<PixelText>`
    carries its text in a `data-text` attribute that the tests read.
  - `ReadoutPanel`, `EndCard`, `Banner` and `MapOverlay` render their models.
  - A render-count test renders each HUD and duel panel, pushes an unchanged model twice, and asserts no re-render.
  - An error-boundary test shows that a throwing HUD panel leaves the menu strip mounted.
  - Vitest's `include` adds `tests/**/*.test.tsx`. The default environment stays `node`.
- **Unchanged and must pass:**
  - every pure model test (`hud`, `hudFit`, `layout`, `map`, `duelReadout`, `eventCard`, …)
  - `npm run typecheck`, `npm test`, and `npm run test:determinism` (no golden change)
  - every Electron smoke: `test:online-app-runtime`, `test:online-recovery-runtime`, `test:host-runtime`,
    `test:rtc-runtime` and `test:room-service-runtime`, plus `test:internet-app-runtime` when its service is up. This
    includes the reserved-viewport layout assertion.
- **Guards** (walking `.ts` and `.tsx`; direct `import`/`export … from` statements; `import type` always allowed):
  - Nothing under `src/renderer/src/{sim,authority,clientControl,headless,net}`, `src/network`, `src/shared`,
    `src/main`, `src/preload` or `src/utility` imports `react`, `react-dom` or `zustand`.
  - Nothing under `src/renderer/src/ui/` imports a value from `sim/`, `authority/`, `clientControl/`, `net/` or
    `src/network`. Values from `render/` model and theme modules and `src/shared/resolution` are allowed.
- **Visual check (per part).**
  - Screenshots by the visual-check method (playwright-core plus Electron `_electron.launch` on `out/`) of each
    changed screen, before and after, at 1280×720 (scale 1, or `fit < 1` with the strip) and 1920×1080 (scale 1.5),
    with the dpr recorded.
  - Panel rectangles must match within 1 device pixel.
  - Text glyph shapes must match at scale 1 and 1.5. Differences are allowed only where §6 changes something (the
    shake) and in the menu's DOM text.
  - Then the owner's look-check.

## 9. Order and what it changes elsewhere

1. **UI-i**: dependencies and config, the `ui/` foundation (store, sharing, actions, sinks, stage, glyphs, images,
   mount), the menu, `main.ts` rewiring, `sessionMenu.ts` deleted, tests ported.
2. **UI-ii**: the duel and flight UI, with the Pixi readout, end screen, feel panel, banners and tactical overlay
   deleted, and `endModel` moved to `render/duel/endModel.ts`.
3. **H-2a-i, H-2a-ii, H-2a-iii.** Their plans are written but not executed. H-2a-i and H-2a-ii touch none of UI-ii's
   files and need no change. H-2a-iii is rebuilt on UI-i and UI-ii in its own plan refinement:
   - its new `app/duel/scene.ts` (`createDuelScene` with `SceneOverlay { banner, layerPaused, end, notice }`) builds no
     Pixi readout, end screen or banners. Instead it returns the `DuelUiView` for `duelSink.frame`, mapping its
     overlay exactly as its own visibility rule does today:
     - `banners.interior = overlay.banner !== null && (view === 'interior' || !overlay.layerPaused) ? overlay.banner : null`
       (so the online duel's host-pause and disconnect banners also show over the map views)
     - `banners.tactical = overlay.layerPaused ? pauseText : null` (`pauseText` is the scene's own option)
     - `banners.notice = overlay.notice ?? null`

     §6's single-player derivation is this mapping with `overlay.banner` set only while paused in the interior.
   - its rewrite of `duelMode.ts` and its new `onlineDuel.ts` take `duelSink` as a dependency. `main.ts` passes it
     into the router's online factory.
   - its `endModel` edits apply to `render/duel/endModel.ts`.
   - its menu tasks (Host without capacity, Swap seats, the lobby's Helm line, `leave`, the REMATCH/LEAVE end text and
     the in-scene leave prompt) target `ui/menu`, `actions.ts` and `EndCard`.
4. **UI-iii**: the sector HUD. It is not on the Helm demo's critical path (after H-2a-iii the sector online path is
   test-only), so it comes after H-2a. It still lands before any new sector UI work.

Each part follows the usual loop: plan, refine, build, review, merge, visual check.

## 10. Dependencies

Pinned exactly at install (the repo pins its runtime-critical tools):
- runtime: `react`, `react-dom` (19.x), `zustand` (5.x)
- dev: `@vitejs/plugin-react` (the release that supports Vite 7), `@types/react`, `@types/react-dom`, `jsdom`,
  `@testing-library/react`

The packaged app's size grows by about 60 KB minified. `electron-builder` needs no change, since the renderer bundle
already carries its imports.

## Out of scope

- Restyling the menu into the HUD's pixel look, new screens (career, crew roster, shops) and mouse interaction on HUD
  panels. React makes these easier. Each is its own spec.
- Any change to how models are built, beyond the two fields in §7, and any change to sim/network timing or to the
  20 Hz publication rate.
- Moving the callout bubbles, the enemy window, the duel interior or the tactical map's world-space content out of
  Pixi.
