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
4. **One source of layout truth stays.** `theme.ts` (colours, font sizes, `LINE`, `PAD`) and `hudLayout.ts` (every
   rectangle in internal pixels) are kept and read by the React components, so `hudFit`, `layout` and the contrast
   tests keep guarding the layout unchanged.
5. **The models stay; only the views change.** `buildHudModel`, `readoutRows`/`readoutHelp`, `endModel`,
   `tacticalModel`'s banner text, `feelModel` and every `*Model.ts` are already pure. React components render those
   models. The Pixi view objects that drew them are deleted.
6. **The UI is read-only toward the game.** Components never import sim, authority or network runtime modules. They
   read the store and call actions. In-game input stays on the existing keyboard and pointer sources. The HUD takes no
   pointer events, so the duel's mouse pan and zoom on the canvas keep working.
7. **Every `data-testid` the menu has today is kept, same element role, same text.** The Electron smokes drive the
   menu by native clicks and typing on those IDs and must pass unchanged.
8. **Three parts, each merged on its own:** UI-i (foundation and the menu), UI-ii (duel and flight UI), UI-iii (the
   sector HUD). UI-i and UI-ii go before H-2a (see §9).

## 1. Architecture

```
 preload bridge ──onStatus──┐
 online renderer session ───┤  (HudModel per frame)
 couch/sector session ──────┤  (HudModel per frame)        ┌──────────── React tree ─────────────┐
 duel mode ─────────────────┼──► uiStore (zustand/vanilla) ─┤ <UiRoot> → <Menu> | <Hud> | <DuelUi> │
 main.ts (router, layout) ──┘          ▲                    └──────────────┬──────────────────────┘
                                       └──── uiActions (menu → preload API, router) ◄──────────┘
 Pixi canvas (world, enemy window, projectiles, callouts, tactical scene) — unchanged, under the UI
```

New code lives in `src/renderer/src/ui/`:

| File | Purpose |
|---|---|
| `store.ts` | `createUiStore()`: the vanilla store, its slices and setters. No React import. |
| `share.ts` | `replaceEqualDeep(prev, next)`: structural sharing for per-frame models (§2). Pure. |
| `actions.ts` | `createUiActions(deps)`: what the menu can do (host, join, ready, leave, settings…). It wraps the preload API and the session router, and holds today's operation-id/pending/error logic from `sessionMenu.ts`. |
| `sinks.ts` | Adapters with the signatures the sessions already call: `hudSink.update(m)`, `duelSink.readout(rows, help)`, `duelSink.end(view)`, `duelSink.paused(text)`, `flightSink.feel(rows)`. Each writes one store slice. |
| `mount.tsx` | `mountUi(store, actions, el)`: `createRoot(el).render(<UiRoot/>)`. It returns a dispose function. |
| `stage/` | The pixel-stage primitives (§4): `<Stage>`, `<Box>`, `<Text>`, `<Panel>`, `<Bar>`, `<Cells>`, `<Icon>`. |
| `menu/` | `Menu.tsx` and one component per page: `Home`, `Multiplayer`, `Settings`, `HostForm`, `JoinForm`, `SessionPage`, `SessionStrip`. |
| `duel/` | `ReadoutPanel`, `EndCard`, `PauseBanner`, `FeelPanel`. |
| `hud/` | `Hud` and its panels (§3). |
| `images.ts` | The UI image cache (§4). |

`main.ts` creates the store, the actions and the sinks, mounts the UI into one `#ui` element over the canvas, and
keeps today's router, bridge and lifecycle wiring. `session.ts`, `onlineSession.ts` and `duelMode.ts` keep their
shapes: their `hud`/panel dependencies are now sinks, not Pixi objects.

## 2. State and data flow

**Store slices** (all plain data, all serialisable):

- `app`: `screen: 'menu' | 'single' | 'online'` (mirrors the router) and `inputBlocked`.
- `menu`: `page`, `pending`, `localError`, `recovering`, `leaving`, `hadView`, `fullscreen`. This is `sessionMenu.ts`'s
  state, moved as is.
- `online`: `status: OnlineStatus | null` and `receivedAt` (the receipt-age clock). The bridge's `onStatus` writes it.
  This is how **other players' actions** reach the UI: seats, ready flags, disconnects, host loss, recovery and votes
  arrive as status pushes or in the published state.
- `settings`: `volume`, `controls` (the read-only list).
- `layout`: `scale`, `offsetX`, `offsetY`, `stripHeight`: the letterbox (§4), written by `main.ts`'s resize.
- `hud: HudModel | null`: the sector HUD, written once per frame by `hudSink`. **Sim changes** reach the UI this way:
  the local session or the online client builds the model from the latest state, as today.
- `duel`: `{ readout: { rows, help }, end: EndView | null, paused: string | null } | null`, written per frame by
  `duelSink`.
- `flight`: `{ feel: rows } | null`.

**Per-frame models and re-renders.** `buildHudModel` and `readoutRows` return fresh objects every frame. The sinks
pass each new model through `replaceEqualDeep(prev, next)` before `setState`, so unchanged subtrees keep their identity
(the technique TanStack Query uses). Components select narrow slices, such as `s => s.hud?.players[i]` or
`s => s.hud?.threats`, and wrap them in `React.memo`. A frame where only the clock line changed re-renders only the
clock panel. That gives one `setState` per frame per active sink. React batches it into one commit.

**Budget.** On the owner's PC, the UI's per-frame work (the sink's sharing pass plus the React commit) is at most
**1.5 ms median and 4 ms p95** over a 60-second running sector or duel. A dev-only `?uiperf=1` query prints the rolling
median and p95 once a second to the console. Each part's visual check records the numbers.

**Timers in the UI.** The menu's reconnect countdown and checkpoint receipt age use a `useNow(1000)` hook (one
`setInterval` per mounted user). That replaces `menu.frame()`'s per-frame text writes.

**Input blocking.** `main.ts` subscribes to the store (outside React) and derives `inputBlocked` from
`menu.page`/`hadView` exactly as `render()` does today. It then resets the keyboard and forwards the value to the online
session. Focus and blur pauses stay in `main.ts` and the router.

**Determinism boundary.** Nothing in the store feeds back into the sim. Commands still flow only through the existing
input, card-controller and command paths. A new guard test (§8) forbids `react`, `react-dom` and `zustand` imports in
`src/renderer/src/sim`, `authority`, `clientControl`, `headless`, `net`, `src/network`, `src/shared`, `src/main`,
`src/preload` and `src/utility`.

## 3. What moves, what stays

**Moves to React (and the Pixi or DOM file is deleted):**

| Today | React | Part |
|---|---|---|
| `render/sessionMenu.ts`: Home, Multiplayer, Settings (volume, fullscreen, controls table), Host form, Join form, the session page (room code, seat, roster with Remove, Ready/Start, Pause, mirror and recovery lines, Re-host, Retry, Reconnect, Forget seat, Leave, Try another code, Return to menu) and the in-session strip | `ui/menu/*` | UI-i |
| `render/duel/readoutPanel.ts` (rows, pips, bars, help) | `ui/duel/ReadoutPanel` | UI-ii |
| `render/duel/endScreen.ts` view (`endModel` stays) | `ui/duel/EndCard` | UI-ii |
| `duelMode.ts`'s paused `BitmapText` and `tacticalLayer`'s pause banner | `ui/duel/PauseBanner` | UI-ii |
| `render/tactical/feelPanel.ts` (flight dev view) | `ui/duel/FeelPanel` | UI-ii |
| `render/hud.ts`: the clock card, power panel and cell rows, threats panel, four player blocks (name, health bar, O2 icon, prompt lines with key glyphs, skills or vote, progress strip), console cards (tab bar, Engineering, Upgrades page, Weapons strip and rows, Science, Navigation, Doors, footers, charge strip), event card with votes, banner, banner glyphs, progress line, notice, lobby/summary card and backdrop, credits overlay | `ui/hud/*` | UI-iii |
| `render/mapPanel.ts` (sector map) | `ui/hud/MapPanel` (SVG) | UI-iii |
| `render/panel.ts` | `ui/stage/Panel` (deleted once `enemyWindow.ts` stops importing it, see below) | UI-iii |

**Stays in Pixi, and why:**

- The world layers (tiles, effects, room icons, console desks, magazine, crew, boarders), projectiles, the enemy
  window's ship scene and the tactical map view with its in-world labels. They are drawn in world space, scaled and
  shaken with the world, and animated per sprite. React gains nothing there.
- The callout bubbles (`callouts.ts`). They are anchored to crew in world coordinates and follow the world fit and
  shake.
- `enemyWindow.ts`'s frame is Pixi too: it is part of that scene. UI-iii moves `drawPanel` into `enemyWindow.ts` as a
  private helper so `panel.ts` can be deleted.
- The fatal startup screen (`showFatal` in `main.ts`). It must work when React or the assets fail to load, so it stays
  plain DOM.

After UI-iii, `Renderer.hud` (the Pixi HUD container) and `createHud` are gone. `SessionDeps.hud` keeps its
`{ update(m: HudModel) }` type and is satisfied by `hudSink`.

## 4. The pixel stage (looking the same)

The UI must look the same as today's Pixi panels: same rectangles, same font, crisp whole pixels.

- **One coordinate system.** `<Stage>` covers the canvas's letterboxed 1280×720 area. Every child positions in
  **internal pixels** through `<Box x y w h>`, which computes each edge as `round(internal × scale)` CSS pixels, plus
  the letterbox offset. The rounding is done in JS from the `layout` slice, not with CSS transforms, so panel edges
  and text origins land on whole pixels at every scale `computeLetterbox` produces (including the half steps above 1).
- **The font.** m5x7 is already registered in `document.fonts` by `loadAssets` (Pixi's font loader uses the FontFace
  API). `<Text>` uses `font-family: m5x7` at `FONT_NATIVE × TEXT_SCALE × scale` px (or `TITLE_SCALE`), with
  `line-height` set to `LINE × scale`. At the snapped scales of 1 and above the size is a multiple of 16 px, where
  m5x7's square outlines fall on the pixel grid. `mountUi` waits for `document.fonts.load('16px m5x7')` before the
  first render. `<Text>` applies the same vertical offset BitmapText uses (caps at +8 in a 24 px line). The visual
  check confirms parity.
- **Colours.** A `hex(0xf2f5fa)` helper turns `theme.ts` numbers into CSS. No colour is written twice.
- **Panels, bars, cells.** `<Panel>` draws the 2 px border and 1 px inner highlight (`drawPanel`'s look) with scaled,
  rounded borders. `<Bar>` and `<Cells>` reproduce the HUD's track, fill, failed, overdrive and heat-strip rules from
  `hud.ts`'s `bar` and `cellRow`.
- **Images.** `images.ts` builds a cache after `loadAssets`. For each texture name the UI uses (threat icons,
  `icon.oxygen`, the key-prompt glyphs) and each station glyph kind (`drawIcon` into a white `Graphics`), it calls
  Pixi's `renderer.extract.base64` once and stores a data URL. `<Icon>` draws an image with `image-rendering:
  pixelated`. Tinted glyphs use the data URL as a CSS `mask-image` over a `background-color`. Missing optional assets
  keep today's fallback (`featureReady`): the icon is omitted.
- **The map panel** is an inline SVG with `viewBox` in internal pixels and `shape-rendering: crispEdges`, drawn from
  `MapModel` as `mapPanel.ts` draws it today.
- **Pointer events.** `<Stage>` and the HUD set `pointer-events: none`. Only the menu's interactive elements take
  pointer events.
- **The session strip.** It is a normal-flow bar above the stage. Its height is measured by a `ResizeObserver` into
  `layout.stripHeight`, and `main.ts`'s resize moves the canvas down by it, as `reservedHeight()` does today.

## 5. The menu (UI-i)

- Behaviour moves line for line from `sessionMenu.ts`: the same pages and transitions, the same `ERRORS` strings, the
  same enabled/disabled rules (`can(action)`), the same operation-id guard against stale results, the same "status
  push does not re-render Settings" rule (an open select is not disturbed), the same room-code validation and
  upper-casing, and the same focus on the form control when a form opens.
- `actions.ts` holds the logic. Components only render the store and call actions. That keeps the logic unit-testable
  without a DOM.
- The imperative API `main.ts` and H-2a-iii use (`setStatus`, `leaveSingle`, `home`, `windowResized`, and H-2a-iii's
  planned `leave`) becomes store actions with the same names. Visual styling matches today's inline styles (dark
  panel, `#52718d` borders, monospace) and moves to one CSS module. The menu does **not** adopt m5x7 or the pixel
  stage in this spec; restyling the menu is a later art question.
- Accessibility stays: `aria-label` on the root and controls, `role="status"` and `aria-live="polite"` on the
  message line.

## 6. Duel and flight UI (UI-ii)

- `duelMode.ts` stops creating `createReadoutPanel`, `createEndScreen` and the paused `BitmapText`. Each frame it calls
  `duelSink.readout(readoutRows(...), readoutHelp(view))`, `duelSink.end(endModel(...))` and
  `duelSink.paused(userPaused && view === 'interior' ? text : null)`.
- `tacticalLayer` loses its pause banner. The tactical view's paused state is shown by the same `PauseBanner`, placed
  where the layer draws it today (centred over the play area left of `READOUT_COLUMN`).
- Screen shake moves only the Pixi `scene`, as today. The readout panel no longer shakes with it. **This is a
  deliberate visible change:** in the Pixi version the readout shook with the scene. The fixed panel is easier to read,
  and the end card and banner already stay still.
- `flightMode.ts` writes `flightSink.feel(rows)`.
- The `?mode=duel` and `?mode=flight` dev views mount the UI too, without the menu (`screen` is fixed and the `Menu`
  is not rendered).

## 7. The sector HUD (UI-iii)

- `<Hud>` renders `HudModel` with one component per panel from §3. The rectangles come from `hudLayout.ts`, the rules
  from today's `hud.ts`: which panels show per phase, row tints, the callout flash at `floor(tick / 10) % 2`, the
  Weapons row window, Science rows, the Engineering eighth row, and the event card's height grown to its content.
- `hud.ts`'s `fillRow` layout (glyph, icon, text, `ROW_GAP`) becomes `<Row parts>`. `theme.rowPx` stays its width
  model.
- Both the online renderer session and the couch session keep calling `deps.hud.update(buildHudModel(...))`. Nothing
  about how the model is built changes.

## 8. Testing

- **Unit (node env):** `replaceEqualDeep` (identity kept for equal subtrees, replaced on change, arrays, nulls,
  primitives), the store setters, and `actions.ts` against a fake preload API. The existing `sessionMenu.test.ts` and
  `mainMenu.test.ts` cases are ported one for one into `actions.test.ts` (logic) and `menu.test.tsx` (rendering).
- **Components (`// @vitest-environment jsdom`, `@testing-library/react`):** each menu page renders its controls and
  testids for a set of `OnlineStatus` fixtures. The HUD panels render fixture models from `tests/helpers/cardUi.ts`
  and show the model's strings. `ReadoutPanel` and `EndCard` render `readoutRows` and `endModel` outputs. Vitest's
  `include` adds `tests/**/*.test.tsx`. The default environment stays `node`.
- **Unchanged and must pass:** every pure model test (`hud`, `hudFit`, `layout`, `map`, `duelReadout`, `eventCard`, …),
  `npm run typecheck`, `npm test`, `npm run test:determinism` (no golden change) and every Electron smoke
  (`test:online-app-runtime`, `test:online-recovery-runtime`, `test:host-runtime`, `test:rtc-runtime`,
  `test:room-service-runtime`; `test:internet-app-runtime` when its service is up).
- **Guards:** the import-boundary test (§2), plus a test that no `src/renderer/src/ui/**` file imports a non-type
  symbol from `sim/`, `authority/`, `network/` or `clientControl/`.
- **Visual check (per part):** screenshots by the visual-check method (playwright-core plus Electron
  `_electron.launch` on `out/`) of each changed screen at 1280×720 and 1920×1080, before and after. Panel rectangles
  must match. Text may differ only by sub-pixel placement, and any difference larger than 1 px gets fixed. Then the
  owner's look-check.

## 9. Order and what it changes elsewhere

1. **UI-i**: dependencies and config, `ui/` foundation (store, sharing, actions, sinks, stage, mount, image cache
   stub), the menu, `main.ts` rewiring, `sessionMenu.ts` deleted, tests ported.
2. **UI-ii**: the duel and flight UI, and the Pixi readout, end screen, feel panel and pause banners deleted.
3. **H-2a-i, H-2a-ii, H-2a-iii.** Their plans are written but not executed. They edit `endModel`, `readoutRows` and
   `duelMode.ts`, which stay as the models and the sink caller, so H-2a-i and H-2a-ii need only path touch-ups. H-2a-iii's
   menu tasks (Host without capacity, Swap seats, the lobby's Helm line, `menu.leave()`, the end card's REMATCH/LEAVE
   text and the in-scene leave prompt) are rewritten to target `ui/menu`, `actions.ts` and `EndCard`. That revision
   happens in H-2a-iii's own plan refinement.
4. **UI-iii**: the sector HUD. It is not on the Helm demo's critical path (after H-2a-iii the sector online path is
   test-only), so it comes after H-2a. It still lands before any new sector UI work.

Each part follows the usual loop: plan, refine, build, review, merge, visual check.

## 10. Dependencies

Pinned exactly at install (the repo pins its runtime-critical tools): `react`, `react-dom` (19.x), `zustand` (5.x);
dev: `@vitejs/plugin-react` (the release that supports Vite 7), `@types/react`, `@types/react-dom`, `jsdom`,
`@testing-library/react`. The packaged app's size grows by about 60 KB minified. `electron-builder` needs no change,
since the renderer bundle already carries its imports.

## Out of scope

- Restyling the menu into the HUD's pixel look, new screens (career, crew roster, shops) and mouse interaction on HUD
  panels. React makes these easier. Each is its own spec.
- Any change to how models are built, to sim/network timing or to the 20 Hz publication rate.
- Moving the callout bubbles, the enemy window or the tactical in-world labels out of Pixi.
