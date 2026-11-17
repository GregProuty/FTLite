# UI-i: React Foundation and the Main Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-built DOM main menu (`render/sessionMenu.ts`) with React 19 components over one zustand 5 store. Behaviour, text, `data-testid`s and the in-session strip's geometry stay as they are today, so every Electron smoke passes unchanged.

**Architecture:**
- The menu's state and rules move into a pure module (`ui/menuState.ts`) and a vanilla zustand store (`ui/store.ts`). Its transitions and preload calls move into `ui/actions.ts`: each change is one `setState`, and nothing in it imports React.
- React components under `ui/menu/` only read store slices and call actions.
- `main.ts` creates the store and actions, mounts `<UiRoot>` into `#ui`, and keeps its router, bridge and lifecycle wiring. It derives input blocking and the strip height from store subscriptions.

**Tech Stack:** TypeScript 5.8, React 19, react-dom 19, zustand 5, electron-vite 5 (Vite 7) with `@vitejs/plugin-react` 5, Vitest 3.2 with jsdom and `@testing-library/react` 16.

**Spec:** `docs/superpowers/specs/2026-11-16-react-ui-layer-design.md`: decisions 1, 2, 6 and 7, §1 (file layout, the render rule), §2 (the menu/online/settings slices, the single `setStatus`, input blocking, the Menu error boundary), §5 (the menu), §8 (UI-i's tests and guards) and §9 item 1.

## Global Constraints

- **No sim, authority or network change.** `npm run test:determinism` and the golden hashes stay unchanged. Nothing under `src/renderer/src/{sim,authority,clientControl,headless,net,events}`, `src/network`, `src/shared`, `src/main`, `src/preload` or `src/utility` changes in this plan.
- **Keyboard and mouse only.** The menu is Single player / Multiplayer (Host, Join) / Settings, as in the main-menu spec.
- **Every menu `data-testid` is kept, on an element of the same role with the same text:** `session-menu`, `page-title`, `status`, `single-player`, `multiplayer`, `settings`, `host`, `join`, `reconnect`, `forget-seat`, `online-availability`, `back`, `volume`, `fullscreen`, `fullscreen-note`, `controls`, `host-form`, `join-form`, `capacity`, `join-code`, `create-room`, `join-room`, `room-code`, `assigned-seat`, `roster`, `remove-seat-<pid>`, `ready`, `start`, `pause`, `mirror-status`, `rollback-warning`, `pending-save`, `mirror-error`, `rehost`, `reconnect-countdown`, `storage-warning`, `retry`, `leave`, `try-code`, `home`.
- **`data-testid="session-menu"` and `aria-label="FTLite session menu"` sit on the Menu's root element.** That element is the full-screen overlay when not playing and exactly the strip (`position: fixed; top: 0`, full width) while playing (`page === 'session' && hadView`). It is never `#ui`. On page `single` the Menu renders only its empty `display: none` root (amended in execution: the smoke driver's `layout` command measures it during Single player, as it did the DOM menu's hidden root). (Spec §5, decision 7.)
- **Dependencies are pinned exactly** (`--save-exact`), all runtime and dev versions from the majors named here. `@vitejs/plugin-react` must be a 5.x release (6.x requires Vite 8; this repo is on Vite 7).
- **Imports:** nothing under `src/renderer/src/ui/` imports a value (as opposed to a type) from `sim/`, `authority/`, `clientControl/`, `net/` or `src/network`. React, react-dom and zustand are imported only under `src/renderer/src/ui/`, `src/renderer/src/main.ts` and `tests/`.
- **Worktree:** execute in a git worktree (superpowers:using-git-worktrees). In a worktree, create the `services/signalling/node_modules` junction before running the online smokes (memory "Worktree signalling junction").

## Deviations from the spec (stated)

1. **The spec's §1 foundation is split by first use.** UI-i builds only what the menu uses: `store.ts`, `menuState.ts`, `actions.ts`, `context.tsx`, `useNow.ts`, `RegionBoundary.tsx`, `UiRoot.tsx`, `mount.tsx` and `ui/menu/*`. `share.ts`, `sinks.ts`, `stage/`, `glyphs.ts`, `images.ts`, the `hud`/`duel`/`flight` slices, `epochs`, `app.screen`, and `layout.scale`/`offsetX`/`offsetY`/`dpr` arrive in UI-ii, the first part that reads them. That's why `mountUi` does not await the font or the image cache yet.
2. **`app.inputBlocked` is derived, not stored.** `inputBlockedOf(state)` computes it from `menu.page` and `menu.hadView`, which is exactly the rule `render()` applies today. `main.ts` compares each new value with the last one it applied.
3. **The menu's styles are typed React style objects in `ui/menu/styles.ts`, not a CSS module.** They hold the same values as today's inline `cssText`.
4. **There is no separate `SessionStrip` component.** The strip *is* the Menu root in its strip layout (as today: `sessionMenu`'s root restyles itself). The Menu root measures its own height while playing.
5. **The Menu error fallback's button calls `actions.returnHome` (unconditional), not `actions.home`.** `home` is a no-op while a session's status is not idle or error, which would make the fallback's button dead in exactly the case it exists for. When `leave` is offered, the button is Leave, as the spec says.
6. **Two small visible differences that come from React itself:**
   - An *idle* status push while on Settings now re-renders the status line. Today it skips the render. The page and its elements stay the same.
   - The reconnect countdown shows its seconds at the first render. Today it shows "Reconnecting saved seat…" for one frame before the first per-frame write.

## File Structure

| File | Responsibility |
|---|---|
| `src/renderer/src/ui/menuState.ts` | Types (`Page`, `MenuState`, `UiState` slices), `INITIAL_MENU`, `ERRORS`, `ROOM_CODE`, and the pure rules: `isPlaying`, `inputBlockedOf`, `can`, `failureText`, `menuMessage`, `availabilityText`, `seatLabel`, `startAllowed`, `receiptText`, `countdownText`, `applyStatus`. No React, no zustand. |
| `src/renderer/src/ui/store.ts` | `createUiStore(init)`: the vanilla zustand store. |
| `src/renderer/src/ui/actions.ts` | `createUiActions(deps)`: every menu action, the operation-id guard, the preload calls. |
| `src/renderer/src/ui/context.tsx` | `UiContext`, `useUi(selector)`, `useActions()`. |
| `src/renderer/src/ui/useNow.ts` | `useNow(periodMs)`: re-renders on each wall-clock period boundary. |
| `src/renderer/src/ui/RegionBoundary.tsx` | The per-region error boundary with a reset key. |
| `src/renderer/src/ui/UiRoot.tsx` | `<UiRoot>`: the Menu region inside its boundary. |
| `src/renderer/src/ui/mount.tsx` | `mountUi({ el, store, actions })`. |
| `src/renderer/src/ui/menu/styles.ts` | The menu's style objects. |
| `src/renderer/src/ui/menu/MenuButton.tsx` | The one button component. |
| `src/renderer/src/ui/menu/Menu.tsx` | `<Menu>` (root, header, status line, page switch, strip measuring) and `<MenuFallback>`. |
| `src/renderer/src/ui/menu/Home.tsx`, `Multiplayer.tsx`, `Settings.tsx`, `HostForm.tsx`, `JoinForm.tsx`, `SessionPage.tsx` | One page each. |
| `src/renderer/src/main.ts` | Modified: store, actions, mount; subscriptions for input blocking and the strip. |
| `src/renderer/src/render/sessionMenu.ts` | Deleted (Task 5). |
| `tests/uiToolchain.test.tsx`, `tests/uiBoundary.test.ts` | Task 1. |
| `tests/uiMenuState.test.ts` | Task 2. |
| `tests/helpers/uiStore.ts`, `tests/uiActions.test.ts` | Task 3. |
| `tests/helpers/uiRender.tsx`, `tests/menu.test.tsx`, `tests/settingsAndControls.test.ts` | Task 4. |
| `tests/sessionMenu.test.ts`, `tests/mainMenu.test.ts` | Deleted (Task 5); their cases now live in Tasks 3 and 4's files. |

---

### Task 1: Toolchain and the import guards

**Files:**
- Modify: `package.json` (dependencies, via npm)
- Modify: `electron.vite.config.ts` (renderer plugins)
- Modify: `tsconfig.web.json` (`jsx`)
- Modify: `vitest.config.ts` (include `.tsx`, JSX transform)
- Create: `tests/uiToolchain.test.tsx`
- Create: `tests/uiBoundary.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: React, react-dom and zustand importable from renderer code. `.test.tsx` files run under Vitest, with `// @vitest-environment jsdom` per file. The guard test fails any later task that imports React outside `ui/`/`main.ts`/`tests/`, or a sim/network value inside `ui/`.

- [ ] **Step 1: Install the dependencies**

Run:
```bash
npm install --save-exact react@19 react-dom@19 zustand@5
npm install --save-exact --save-dev @vitejs/plugin-react@5 @types/react@19 @types/react-dom@19 jsdom @testing-library/react@16 @testing-library/dom@10
```
Expected: both commands exit 0, and `package.json` lists the eight packages with exact versions (no `^`). Check that `@vitejs/plugin-react` resolved to `5.x`.

- [ ] **Step 2: Write the failing toolchain test**

Create `tests/uiToolchain.test.tsx`:
```tsx
// @vitest-environment jsdom
// The React UI toolchain (React UI spec, decision 1): TSX compiles under Vitest, jsdom renders it, and a vanilla zustand
// store written from outside React re-renders a subscribed component.
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

afterEach(cleanup);

it('renders TSX in jsdom and re-renders from a vanilla zustand store', () => {
  const store = createStore<{ n: number }>()(() => ({ n: 1 }));
  function Count() { return <p data-testid="n">{useStore(store, (s) => s.n)}</p>; }
  render(<Count />);
  expect(screen.getByTestId('n').textContent).toBe('1');
  act(() => store.setState({ n: 2 }));
  expect(screen.getByTestId('n').textContent).toBe('2');
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run tests/uiToolchain.test.tsx`
Expected: FAIL. Vitest reports "No test files found" because `include` only matches `.test.ts`.

- [ ] **Step 4: Configure Vitest, TypeScript and electron-vite**

In `vitest.config.ts`, replace the `test` line and add `esbuild` so `.tsx` uses the automatic JSX runtime:
```ts
  esbuild: { jsx: 'automatic' },
  test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], environment: 'node', setupFiles: ['tests/setup.ts'], maxWorkers: Math.min(8, availableParallelism()) }
```
In `tsconfig.web.json`, add `"jsx": "react-jsx",` after `"lib": ["ES2023", "DOM"]` (with a comma after the `lib` entry):
```json
    "lib": ["ES2023", "DOM"],
    "jsx": "react-jsx"
```
In `electron.vite.config.ts`, import the plugin at the top and put it first in the renderer's `plugins`:
```ts
import react from '@vitejs/plugin-react';
```
```ts
    plugins: [react(), { name: 'no-renderer-env-files', enforce: 'post', config: () => ({ envDir: false }) }],
```

- [ ] **Step 5: Run the toolchain test to see it pass**

Run: `npx vitest run tests/uiToolchain.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Write the import-guard test**

Create `tests/uiBoundary.test.ts`:
```ts
// The React UI's import boundaries (React UI spec §8): UI libraries stay out of the deterministic and process code, and
// the UI reads only models (types from anywhere; values never from sim, authority, client control or the network).
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().flatMap((name) => {
    const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [resolve(p)] : [];
  });
}
/** Every static `import … from 'x'`, `import 'x'` and `export … from 'x'` in a source, and whether it is `import type`/`export type`. */
export function staticImports(source: string): { specifier: string; typeOnly: boolean }[] {
  const re = /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  return [...source.matchAll(re)].map((m) => ({ specifier: m[2]!, typeOnly: !!m[1] }));
}
const slash = (p: string): string => p.replaceAll('\\', '/');
const UI_LIB = /^(?:react|react-dom|zustand)(?:\/|$)/;
const NO_UI_LIB_ROOTS = [...['sim', 'authority', 'clientControl', 'headless', 'net', 'events'].map((d) => `src/renderer/src/${d}`), 'src/network', 'src/shared', 'src/main', 'src/preload', 'src/utility'];
const UI_FORBIDDEN_VALUE_DIRS = [...['sim', 'authority', 'clientControl', 'net'].map((d) => slash(resolve(`src/renderer/src/${d}`)) + '/'), slash(resolve('src/network')) + '/'];

describe('staticImports', () => {
  it('finds value, type, side-effect, multi-line and re-export imports', () => {
    const src = "import type { A } from './a';\nimport { b,\n  c } from \"./b\";\nimport './side';\nexport { d } from './d';\nexport type { E } from './e';\nexport const f = 1;";
    expect(staticImports(src)).toEqual([
      { specifier: './a', typeOnly: true }, { specifier: './b', typeOnly: false }, { specifier: './side', typeOnly: false },
      { specifier: './d', typeOnly: false }, { specifier: './e', typeOnly: true }
    ]);
  });
});

describe('UI libraries stay out of deterministic and process code', () => {
  for (const file of NO_UI_LIB_ROOTS.flatMap(walk)) it(`${slash(file)} imports no React or zustand`, () => {
    expect(staticImports(readFileSync(file, 'utf8')).map((i) => i.specifier).filter((s) => UI_LIB.test(s))).toEqual([]);
  });
});

describe('the UI imports no runtime values from sim, authority, client control or the network', () => {
  for (const file of walk('src/renderer/src/ui')) it(`${slash(file)} imports only types from those directories`, () => {
    const bad = staticImports(readFileSync(file, 'utf8')).filter((i) => !i.typeOnly && i.specifier.startsWith('.'))
      .map((i) => slash(resolve(dirname(file), i.specifier))).filter((p) => UI_FORBIDDEN_VALUE_DIRS.some((d) => (p + '/').startsWith(d)));
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 7: Run the guard test**

Run: `npx vitest run tests/uiBoundary.test.ts`
Expected: PASS. The `staticImports` case and every "imports no React or zustand" case pass. The UI block has no cases yet, because `src/renderer/src/ui` does not exist; Tasks 2–4 add a case per new file.

- [ ] **Step 8: Typecheck and build**

Run: `npm run typecheck` then `npm run build`
Expected: both exit 0. The build output is unchanged apart from the renderer plugin.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json electron.vite.config.ts tsconfig.web.json vitest.config.ts tests/uiToolchain.test.tsx tests/uiBoundary.test.ts
git commit -m "build(ui-i): React 19, zustand 5, plugin-react 5, jsdom tests and the UI import guards"
```

---

### Task 2: The menu's state and pure rules

**Files:**
- Create: `src/renderer/src/ui/menuState.ts`
- Create: `src/renderer/src/ui/store.ts`
- Test: `tests/uiMenuState.test.ts`

**Interfaces:**
- Consumes: `OnlineStatus`, `OnlineErrorCode` (`src/shared/onlineSession.ts`), `ControlSection` (`src/renderer/src/app/controlsList.ts`).
- Produces (exact names later tasks use):
  - `type Page = 'home' | 'multiplayer' | 'settings' | 'host' | 'join' | 'session' | 'single'`
  - `type MenuAction = OnlineStatus['actions'][number]`
  - `interface MenuState { page; pending; localError; recovering; leaving; hadView; fullscreen: boolean | null; operation: number }`
  - `interface OnlineSlice { available: boolean; status: OnlineStatus | null; receivedAt: number }`
  - `interface SettingsSlice { available: boolean; volume: number; fullscreenAvailable: boolean; controls: readonly ControlSection[] }`
  - `interface LayoutSlice { stripHeight: number }`
  - `interface UiState { menu; online; settings; layout }` and `type MenuView = Pick<UiState, 'menu' | 'online'>`
  - `INITIAL_MENU`, `ERRORS`, `ROOM_CODE`
  - `isPlaying(m)`, `inputBlockedOf(s)`, `can(view, action)`, `failureText(code)`, `menuMessage(view)`, `availabilityText(view)`, `seatLabel(status, pid)`, `startAllowed(view)`, `receiptText(status, receivedAt, perfNow)`, `countdownText(retryAtMs, dateNow)`, `applyStatus(m, next): { menu: MenuState; goHome: boolean }`
  - `type UiStore = StoreApi<UiState>`, `createUiStore({ onlineAvailable, settings? })`

- [ ] **Step 1: Write the failing tests**

Create `tests/uiMenuState.test.ts`:
```ts
// The menu's pure rules (React UI spec §5), moved line for line from render/sessionMenu.ts.
import { describe, expect, it } from 'vitest';
import { applyStatus, availabilityText, can, countdownText, ERRORS, INITIAL_MENU, inputBlockedOf, isPlaying, menuMessage, receiptText, seatLabel, startAllowed, type MenuState, type MenuView } from '../src/renderer/src/ui/menuState';
import { createUiStore } from '../src/renderer/src/ui/store';
import type { OnlineStatus } from '../src/shared/onlineSession';

const idle: OnlineStatus = { phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null,
  mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: ['host', 'join', 'reconnect', 'forget-seat'] };
const menu = (patch: Partial<MenuState> = {}): MenuState => ({ ...INITIAL_MENU, ...patch });
const view = (m: Partial<MenuState>, status: OnlineStatus | null, available = true): MenuView => ({ menu: menu(m), online: { available, status, receivedAt: 0 } });

describe('applyStatus', () => {
  it('moves a non-idle push to the session page, except from single player', () => {
    expect(applyStatus(menu(), { ...idle, phase: 'lobby' }).menu.page).toBe('session');
    expect(applyStatus(menu({ page: 'settings' }), { ...idle, phase: 'lobby' }).menu.page).toBe('session');   // a session takes over Settings
    expect(applyStatus(menu({ page: 'single' }), { ...idle, phase: 'reconnecting' }).menu.page).toBe('single');
  });
  it('keeps Settings and home on an idle push', () => {
    expect(applyStatus(menu({ page: 'settings' }), idle).menu.page).toBe('settings');
    expect(applyStatus(menu(), idle).menu.page).toBe('home');
  });
  it('returns home from a session that never had a view once idle and settled', () => {
    expect(applyStatus(menu({ page: 'session' }), idle).menu.page).toBe('home');
    expect(applyStatus(menu({ page: 'session', pending: true }), idle).menu.page).toBe('session');
    expect(applyStatus(menu({ page: 'session', hadView: true }), idle).menu.page).toBe('session');
  });
  it('remembers a view and recovery, and clears recovery on idle or running', () => {
    const viewed = applyStatus(menu(), { ...idle, phase: 'running', attachmentEpoch: 1 }).menu;
    expect(viewed.hadView).toBe(true); expect(viewed.recovering).toBe(false);
    for (const phase of ['saved', 'rehosting', 'reconnecting'] as const) expect(applyStatus(menu(), { ...idle, phase }).menu.recovering).toBe(true);
    expect(applyStatus(menu({ recovering: true }), { ...idle, phase: 'paused' }).menu.recovering).toBe(true);
    expect(applyStatus(menu({ recovering: true }), { ...idle, phase: 'running' }).menu.recovering).toBe(false);
  });
  it('finishes a Leave on the idle push: home once, view cleared', () => {
    const r = applyStatus(menu({ page: 'session', leaving: true, hadView: true }), idle);
    expect(r.goHome).toBe(true); expect(r.menu).toMatchObject({ page: 'home', leaving: false, hadView: false });
    expect(applyStatus(menu({ page: 'session', leaving: true, hadView: true, pending: true }), idle).goHome).toBe(false);
    expect(applyStatus(menu({ page: 'session', hadView: true }), idle).goHome).toBe(false);
  });
});

describe('the derived rules', () => {
  it('blocks input except while playing a viewed session', () => {
    expect(inputBlockedOf({ menu: menu() })).toBe(true);
    expect(inputBlockedOf({ menu: menu({ page: 'session' }) })).toBe(true);
    expect(inputBlockedOf({ menu: menu({ page: 'session', hadView: true }) })).toBe(false);
    expect(isPlaying(menu({ page: 'single', hadView: true }))).toBe(false);
  });
  it('allows an action only when offered, the bridge exists and nothing is pending', () => {
    expect(can(view({}, { ...idle, actions: ['host'] }), 'host')).toBe(true);
    expect(can(view({}, { ...idle, actions: ['join'] }), 'host')).toBe(false);
    expect(can(view({ pending: true }, idle), 'host')).toBe(false);
    expect(can(view({}, idle, false), 'host')).toBe(false);
    expect(can(view({}, null), 'host')).toBe(false);
  });
  it('words the status line as today', () => {
    expect(menuMessage(view({}, null))).toBe('Choose how to play.');
    expect(menuMessage(view({ page: 'multiplayer' }, idle))).toBe('Host a crew or join one with its room code.');
    expect(menuMessage(view({ page: 'settings' }, idle))).toBe('');
    expect(menuMessage(view({ page: 'session', pending: true }, null))).toBe('Connecting…');
    expect(menuMessage(view({ page: 'session' }, { ...idle, phase: 'lobby' }))).toBe('lobby');
    expect(menuMessage(view({ localError: 'x' }, { ...idle, phase: 'rehosting' }))).toBe('x');
    expect(menuMessage(view({}, { ...idle, phase: 'rehosting' }))).toBe('Restoring the mirrored checkpoint…');
    expect(menuMessage(view({}, { ...idle, phase: 'saving' }))).toBe('Saving the final checkpoint…');
    const committed = { ...idle, phase: 'paused' as const, mirror: { ...idle.mirror, committed: { capturedTick: 1800 } as never } };
    expect(menuMessage(view({ recovering: true }, committed))).toBe('Restored at tick 1800. Paused.');
    expect(menuMessage(view({ recovering: false, page: 'session' }, committed))).toBe('paused');
    expect(menuMessage(view({}, { ...idle, phase: 'error', error: 'host-lost' }))).toBe(ERRORS['host-lost']);
    expect(menuMessage(view({}, { ...idle, phase: 'error', error: 'transport-lost' }))).toBe('Online stopped (transport-lost). Retry or leave.');
  });
  it('explains unavailable online', () => {
    expect(availabilityText(view({}, idle, false))).toBe(ERRORS['online-disabled']);
    expect(availabilityText(view({}, { ...idle, actions: ['forget-seat'] }))).toBe(ERRORS['online-disabled']);
    expect(availabilityText(view({}, idle))).toBe('Reconnect your saved seat to check the host and the last committed checkpoint.');
  });
  it('labels seats and gates Start on ready, connected humans', () => {
    const lobby: OnlineStatus = { ...idle, phase: 'lobby', role: 'host', ownSeat: 0, actions: ['start', 'ready'],
      snapshot: { capacity: 3, joinCode: 'ABCDEFGH', seats: [{ seatId: 0, occupied: true, connected: true, ready: false }, { seatId: 1, occupied: true, connected: false, ready: true }] } as never };
    expect([0, 1, 2].map((pid) => seatLabel(lobby, pid))).toEqual([' P1: Not ready ', ' P2: Bot (human disconnected) ', ' P3: Bot ']);
    expect(startAllowed(view({}, lobby))).toBe(false);
    const ready = { ...lobby, snapshot: { ...lobby.snapshot!, seats: [{ seatId: 0, occupied: true, connected: true, ready: true }] } } as OnlineStatus;
    expect(startAllowed(view({}, ready))).toBe(true);
  });
  it('words the checkpoint receipt and the countdown', () => {
    const s = { ...idle, mirror: { ...idle.mirror, committed: { capturedTick: 1800 } as never, receivedAgeMs: 4000 } };
    expect(receiptText(s, 1000, 1000)).toBe('Last mirrored checkpoint: tick 1800, received 4s ago.');
    expect(receiptText(s, 1000, 3500)).toBe('Last mirrored checkpoint: tick 1800, received 6s ago.');
    expect(receiptText({ ...s, mirror: { ...s.mirror, receivedAgeMs: null } }, 0, 0)).toBe('Last mirrored checkpoint: tick 1800, receipt age unknown.');
    expect(receiptText(idle, 0, 0)).toBeNull();
    expect(countdownText(1800000002500, 1800000000000)).toBe('Retrying saved seat in 3s…');
    expect(countdownText(1800000002500, 1800000002000)).toBe('Retrying saved seat in 1s…');
    expect(countdownText(1800000002500, 1800000009000)).toBe('Retrying saved seat in 0s…');
  });
});

describe('createUiStore', () => {
  it('starts at home with no status and the given settings', () => {
    const s = createUiStore({ onlineAvailable: true, settings: { volume: 0.5, fullscreenAvailable: true, controls: [] } }).getState();
    expect(s.menu).toEqual(INITIAL_MENU); expect(s.online).toEqual({ available: true, status: null, receivedAt: 0 });
    expect(s.settings).toEqual({ available: true, volume: 0.5, fullscreenAvailable: true, controls: [] }); expect(s.layout).toEqual({ stripHeight: 0 });
  });
  it('marks settings unavailable without them', () => {
    expect(createUiStore({ onlineAvailable: false }).getState().settings).toEqual({ available: false, volume: 1, fullscreenAvailable: false, controls: [] });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/uiMenuState.test.ts`
Expected: FAIL. The modules `../src/renderer/src/ui/menuState` and `../src/renderer/src/ui/store` cannot be resolved.

- [ ] **Step 3: Write `menuState.ts`**

Create `src/renderer/src/ui/menuState.ts`:
```ts
// The menu's state and its pure rules (React UI spec §2, §5), moved line for line from render/sessionMenu.ts: the pages,
// the error strings, which actions are offered, the status line and how a status push moves the menu. No React here.
import type { OnlineErrorCode, OnlineStatus } from '../../../shared/onlineSession';
import type { ControlSection } from '../app/controlsList';

export type Page = 'home' | 'multiplayer' | 'settings' | 'host' | 'join' | 'session' | 'single';
export type MenuAction = OnlineStatus['actions'][number];

export interface MenuState {
  page: Page; pending: boolean; localError: string; recovering: boolean;
  /** Leave was pressed; the idle status that follows returns home. */
  leaving: boolean;
  /** The session has shown a game view (an attachment epoch arrived); the menu is then the strip. */
  hadView: boolean;
  fullscreen: boolean | null;
  /** The latest request's id: a result for an older one is ignored. */
  operation: number;
}
export interface OnlineSlice { available: boolean; status: OnlineStatus | null; receivedAt: number }
export interface SettingsSlice { available: boolean; volume: number; fullscreenAvailable: boolean; controls: readonly ControlSection[] }
export interface LayoutSlice { stripHeight: number }
export interface UiState { menu: MenuState; online: OnlineSlice; settings: SettingsSlice; layout: LayoutSlice }
export type MenuView = Pick<UiState, 'menu' | 'online'>;

export const INITIAL_MENU: MenuState = { page: 'home', pending: false, localError: '', recovering: false, leaving: false, hadView: false, fullscreen: null, operation: 0 };
export const ROOM_CODE = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;
export const ERRORS: Partial<Record<OnlineErrorCode, string>> = {
  'online-disabled': 'Online play needs a configured local service. Single player is available.',
  'not-found': 'Room not found. Check the eight-character code and try again.',
  'incompatible': 'This room needs compatible game content and ship data. Check both versions, then try again.',
  'unauthorized': 'This seat is no longer authorized. Return to the menu or forget the saved seat.',
  'host-lost': 'Host disconnected. Reconnect or re-host the last committed checkpoint when available.',
  'no-checkpoint': 'No committed checkpoint is available for this room.',
  'save-invalid': 'The saved checkpoint is corrupt or incompatible. Reconnect to check the service again.',
  'save-too-large': 'The saved checkpoint exceeds the size limit.',
  'save-unavailable': 'The latest save could not be committed. Recovery uses the last committed checkpoint.',
  'conflict': 'Another player may have claimed this room. Reconnect to check the current host.',
  'suspended': 'Online play stopped when the computer suspended. Reconnect explicitly to continue.',
  'retry-exhausted': 'Reconnection timed out. Retry to make a new attempt.',
  'storage-write-failed': 'Your seat could not be saved. This session can play, but restart recovery is unavailable.',
};

export function isPlaying(m: MenuState): boolean { return m.page === 'session' && m.hadView; }
/** Online input is blocked everywhere but a viewed session (single player's duel owns its own keyboard). */
export function inputBlockedOf(s: Pick<UiState, 'menu'>): boolean { return !isPlaying(s.menu); }
export function can(v: MenuView, action: MenuAction): boolean { return v.online.available && !!v.online.status?.actions.includes(action) && !v.menu.pending; }
export function failureText(code: string): string { return ERRORS[code as OnlineErrorCode] ?? `Online request failed (${code}). Try again.`; }

export function menuMessage(v: MenuView): string {
  const m = v.menu, status = v.online.status;
  const phaseMessage = status?.phase === 'rehosting' ? 'Restoring the mirrored checkpoint…'
    : status?.phase === 'saving' ? 'Saving the final checkpoint…'
    : m.recovering && status?.phase === 'paused' && status.mirror.committed ? `Restored at tick ${status.mirror.committed.capturedTick}. Paused.` : null;
  return m.localError || phaseMessage || (status?.error ? ERRORS[status.error] ?? `Online stopped (${status.error}). Retry or leave.`
    : m.page === 'session' ? `${status?.phase ?? 'Connecting'}${m.pending ? '…' : ''}`
    : m.page === 'multiplayer' ? 'Host a crew or join one with its room code.' : m.page === 'settings' ? '' : 'Choose how to play.');
}

export function availabilityText(v: MenuView): string {
  const s = v.online.status;
  return !v.online.available || s?.phase === 'idle' && !s.actions.includes('host') && !s.actions.includes('join')
    ? ERRORS['online-disabled']! : 'Reconnect your saved seat to check the host and the last committed checkpoint.';
}

export function seatLabel(status: OnlineStatus, pid: number): string {
  const seat = status.snapshot?.seats.find((s) => s.seatId === pid);
  return ` P${pid + 1}: ${!seat?.occupied ? 'Bot' : !seat.connected ? 'Bot (human disconnected)' : seat.ready ? 'Ready' : 'Not ready'} `;
}
export function startAllowed(v: MenuView): boolean {
  return can(v, 'start') && !!v.online.status?.snapshot?.seats.every((s) => !s.occupied || s.ready && s.connected);
}

/** `receivedAt` and `perfNow` are performance.now() readings: the age grows while the menu shows it. */
export function receiptText(status: OnlineStatus, receivedAt: number, perfNow: number): string | null {
  const committed = status.mirror.committed; if (!committed) return null;
  const age = status.mirror.receivedAgeMs;
  return `Last mirrored checkpoint: tick ${committed.capturedTick}, ${age === null ? 'receipt age unknown' : `received ${Math.floor((age + Math.max(0, perfNow - receivedAt)) / 1000)}s ago`}.`;
}
/** `retryAtMs` and `dateNow` are epoch milliseconds (the deadline is shared across processes). */
export function countdownText(retryAtMs: number, dateNow: number): string { return `Retrying saved seat in ${Math.max(0, Math.ceil((retryAtMs - dateNow) / 1000))}s…`; }

/** How one status push moves the menu (sessionMenu's setStatus). `goHome`: call the router's home before applying it. */
export function applyStatus(m: MenuState, next: OnlineStatus): { menu: MenuState; goHome: boolean } {
  const out = { ...m }; let goHome = false;
  if (next.phase === 'saved' || next.phase === 'rehosting' || next.phase === 'reconnecting') out.recovering = true;
  if (next.phase === 'idle' || next.phase === 'running') out.recovering = false;
  if (next.attachmentEpoch > 0) out.hadView = true;
  if (out.page !== 'single' && next.phase !== 'idle') out.page = 'session';
  if (next.phase === 'idle' && out.page === 'session' && !out.pending && !out.hadView) out.page = 'home';
  if (next.phase === 'idle' && out.leaving && out.page === 'session' && !out.pending) { out.leaving = false; goHome = true; out.hadView = false; out.page = 'home'; }
  return { menu: out, goHome };
}
```

- [ ] **Step 4: Write `store.ts`**

Create `src/renderer/src/ui/store.ts`:
```ts
// The UI store (React UI spec §2): one vanilla zustand store, written from plain TypeScript (the actions, main.ts) and
// read by components through selectors. UI-ii and UI-iii add the per-frame hud, duel and flight slices.
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ControlSection } from '../app/controlsList';
import { INITIAL_MENU, type UiState } from './menuState';

export type UiStore = StoreApi<UiState>;
export interface UiStoreInit {
  onlineAvailable: boolean;
  settings?: { volume: number; fullscreenAvailable: boolean; controls: readonly ControlSection[] };
}
export function createUiStore(init: UiStoreInit): UiStore {
  return createStore<UiState>()(() => ({
    menu: INITIAL_MENU,
    online: { available: init.onlineAvailable, status: null, receivedAt: 0 },
    settings: init.settings ? { available: true, ...init.settings } : { available: false, volume: 1, fullscreenAvailable: false, controls: [] },
    layout: { stripHeight: 0 }
  }));
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/uiMenuState.test.ts tests/uiBoundary.test.ts`
Expected: PASS. All of `uiMenuState`'s cases pass, and the guard now checks `menuState.ts` and `store.ts`.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`. Expected: exit 0.
```bash
git add src/renderer/src/ui/menuState.ts src/renderer/src/ui/store.ts tests/uiMenuState.test.ts
git commit -m "feat(ui-i): the menu's state, pure rules and the vanilla UI store"
```

---

### Task 3: The menu's actions

**Files:**
- Create: `src/renderer/src/ui/actions.ts`
- Create: `tests/helpers/uiStore.ts`
- Test: `tests/uiActions.test.ts`

**Interfaces:**
- Consumes: from Task 2, `applyStatus`, `failureText`, `ROOM_CODE`, `MenuState` and `UiStore`; `OnlinePreloadApi`, `OnlineResult` and `OnlineStatus` (shared).
- Produces:
  - `type MenuApi = Pick<OnlinePreloadApi, 'host'|'join'|'ready'|'start'|'removeSeat'|'reconnect'|'rehost'|'retry'|'leave'|'forgetSeat'>`
  - `interface UiActionDeps { store: UiStore; api?: MenuApi; single(): void; online(): void; pause(): void; home?(): void; setVolume?(volume: number): void; fullscreen?: { get(): Promise<boolean>; set(on: boolean): Promise<boolean> }; perfNow?(): number }`
  - `createUiActions(deps)` returning `UiActions` with these methods:
    - `setStatus(next)`, `single()`, `openMultiplayer()`, `openSettings()`, `openHost()`, `openJoin()`, `back()`
    - `host(capacity: number)`, `join(raw: string)`, `ready(next: boolean)`, `start()`, `removeSeat(pid: number)`, `reconnect()`, `rehost()`, `retry()`
    - `forgetSavedSeat()` (Multiplayer's), `forgetSeatNow()` (the session page's), `leave()`, `tryAnotherCode()`, `returnHome()`, `pause()`
    - `setVolume(v)`, `toggleFullscreen()`, `leaveSingle()`, `home()`, `windowResized()`, `setStripHeight(h)`, `dispose()`
  - From `tests/helpers/uiStore.ts`: `idle`, `flush()`, `makeUi(options)` returning `{ store, actions, deps }`, and `FixtureOptions`.

- [ ] **Step 1: Write the test helper**

Create `tests/helpers/uiStore.ts`:
```ts
// A UI store and its actions with fake router callbacks (React UI spec §8). No React: node and jsdom tests share it.
import { vi } from 'vitest';
import { createUiStore } from '../../src/renderer/src/ui/store';
import { createUiActions, type UiActionDeps } from '../../src/renderer/src/ui/actions';
import type { OnlineStatus } from '../../src/shared/onlineSession';
import type { ControlSection } from '../../src/renderer/src/app/controlsList';

export const idle: OnlineStatus = { phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null,
  mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: ['host', 'join', 'reconnect', 'forget-seat'] };
/** Let settled promises run their continuations (an invoke's await, finally and then). */
export const flush = async (): Promise<void> => { for (let k = 0; k < 6; k++) await Promise.resolve(); };

export interface FixtureOptions {
  /** The preload API's methods; null for an app with no online bridge. */
  api?: Record<string, unknown> | null;
  deps?: Partial<Omit<UiActionDeps, 'store'>>;
  /** null for no Settings dependency. */
  settings?: { volume: number; controls?: ControlSection[] } | null;
}
export function makeUi(o: FixtureOptions = {}) {
  const store = createUiStore({ onlineAvailable: o.api !== null,
    settings: o.settings === null ? undefined : { volume: o.settings?.volume ?? 1, fullscreenAvailable: !!o.deps?.fullscreen, controls: o.settings?.controls ?? [] } });
  const deps = { store, api: (o.api === null ? undefined : (o.api ?? {})) as UiActionDeps['api'],
    single: vi.fn(), online: vi.fn(), pause: vi.fn(), home: vi.fn(), setVolume: vi.fn(), ...o.deps };   // perfNow: the real performance.now(), the clock MirrorLine reads
  return { store, deps, actions: createUiActions(deps) };
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/uiActions.test.ts`:
```ts
// The menu's actions (React UI spec §2, §5): the cases of the old sessionMenu and mainMenu tests that are logic, ported
// one for one. Every action is one setState (or two around an awaited request), and preload calls are deduplicated.
import { describe, expect, it, vi } from 'vitest';
import { ERRORS, inputBlockedOf } from '../src/renderer/src/ui/menuState';
import type { OnlineStatus } from '../src/shared/onlineSession';
import { flush, idle, makeUi } from './helpers/uiStore';

describe('requests', () => {
  it('deduplicates a request until it settles', async () => {
    const rehost = vi.fn(async () => ({ ok: true as const })), { actions } = makeUi({ api: { rehost } });
    actions.rehost(); actions.rehost(); expect(rehost).toHaveBeenCalledOnce();
    await flush(); actions.rehost(); expect(rehost).toHaveBeenCalledTimes(2);
  });
  it('Host sends the capacity and enters the session; Join trims, upper-cases and deduplicates', async () => {
    const host = vi.fn(async () => ({ ok: true as const })), join = vi.fn(() => new Promise<never>(() => {}));
    const { store, deps, actions } = makeUi({ api: { host, join } });
    actions.setStatus({ ...idle, actions: ['host', 'join', 'reconnect'] });
    actions.openMultiplayer(); actions.openHost(); actions.host(4);
    expect(host).toHaveBeenCalledWith(4); expect(deps.online).toHaveBeenCalledOnce(); expect(store.getState().menu.page).toBe('session');
    await flush(); actions.home(); expect(store.getState().menu.page).toBe('home');
    actions.openMultiplayer(); actions.openJoin(); actions.join(' abcdef12 '); actions.join(' abcdef12 ');
    expect(join).toHaveBeenCalledExactlyOnceWith('ABCDEF12');
  });
  it('rejects a malformed room code without a request', () => {
    const join = vi.fn(), { store, actions } = makeUi({ api: { join } });
    actions.openMultiplayer(); actions.openJoin(); actions.join('abc');
    expect(join).not.toHaveBeenCalled(); expect(store.getState().menu.localError).toBe('Enter an eight-character room code.');
  });
  it('shows a failed request in plain words and clears pending', async () => {
    const host = vi.fn(async () => ({ ok: false as const, code: 'not-found' as const })), { store, actions } = makeUi({ api: { host } });
    actions.host(2); expect(store.getState().menu.pending).toBe(true); await flush();
    expect(store.getState().menu).toMatchObject({ pending: false, localError: ERRORS['not-found'] });
  });
  it('words a thrown request generically', async () => {
    const retry = vi.fn(async () => { throw Error('ipc'); }), { store, actions } = makeUi({ api: { retry } });
    actions.retry(); await flush(); expect(store.getState().menu.localError).toBe('Online request failed. Try again.');
  });
  it('lets Leave interrupt a pending Join and ignores the Join\'s late result', async () => {
    let resolve!: (value: unknown) => void;
    const join = vi.fn(() => new Promise((r) => { resolve = r; })), leave = vi.fn(async () => ({ ok: true as const }));
    const { store, deps, actions } = makeUi({ api: { join, leave } });
    const status: OnlineStatus = { ...idle, actions: ['join'] };
    actions.setStatus(status); actions.openMultiplayer(); actions.openJoin(); actions.join('ABCDEFGH');
    actions.setStatus({ ...status, phase: 'joining', actions: ['leave'] }); actions.leave(); expect(leave).toHaveBeenCalledOnce();
    actions.setStatus(status); await flush(); resolve({ ok: false, code: 'not-found' }); await flush();
    expect(store.getState().menu.localError).toBe(''); expect(deps.home).toHaveBeenCalledOnce(); expect(store.getState().menu.page).toBe('home');
  });
  it('Leave returns home only when the idle status arrives after it settled', async () => {
    const leave = vi.fn(async () => ({ ok: true as const })), { store, deps, actions } = makeUi({ api: { leave } });
    actions.setStatus({ ...idle, phase: 'running', role: 'host', ownSeat: 0, attachmentEpoch: 1, actions: ['leave'] });
    actions.leave(); await flush(); expect(deps.home).not.toHaveBeenCalled();
    actions.setStatus({ ...idle, actions: ['host', 'join', 'reconnect', 'retry'] });
    expect(deps.home).toHaveBeenCalledOnce(); expect(store.getState().menu).toMatchObject({ page: 'home', hadView: false, leaving: false });
  });
  it('forgets a saved seat from Multiplayer without entering the session', async () => {
    const forgetSeat = vi.fn(async () => ({ ok: true as const })), { store, deps, actions } = makeUi({ api: { forgetSeat } });
    actions.setStatus(idle); actions.openMultiplayer(); actions.forgetSavedSeat();
    expect(forgetSeat).toHaveBeenCalledOnce(); expect(deps.online).not.toHaveBeenCalled(); expect(store.getState().menu.page).toBe('multiplayer');
  });
});

describe('status pushes', () => {
  it('apply every transition in one setState, with the receipt time', () => {
    const { store, actions } = makeUi({ deps: { perfNow: () => 42 } }); let writes = 0; store.subscribe(() => { writes++; });
    actions.setStatus({ ...idle, phase: 'running', attachmentEpoch: 1, actions: [] });
    expect(writes).toBe(1); expect(store.getState().menu).toMatchObject({ page: 'session', hadView: true }); expect(store.getState().online.receivedAt).toBe(42);
    expect(inputBlockedOf(store.getState())).toBe(false);
  });
  it('call home before the idle state lands when a Leave finishes', () => {
    const order: string[] = [], { store, actions } = makeUi({ deps: { home: () => order.push(`home:${store.getState().menu.page}`) } });
    store.setState((s) => ({ menu: { ...s.menu, page: 'session', leaving: true, hadView: true } }));
    actions.setStatus(idle); expect(order).toEqual(['home:session']); expect(store.getState().menu.page).toBe('home');
  });
  it('a session takes over Settings; an idle push keeps it', () => {
    const { store, actions } = makeUi();
    actions.openSettings(); actions.setStatus(idle); expect(store.getState().menu.page).toBe('settings');
    actions.setStatus({ ...idle, phase: 'lobby', actions: ['leave'] }); expect(store.getState().menu.page).toBe('session');
  });
});

describe('pages', () => {
  it('Single player hides the menu, keeps input blocked, ignores online status and comes back', () => {
    const { store, deps, actions } = makeUi();
    actions.single(); expect(deps.single).toHaveBeenCalledOnce(); expect(store.getState().menu.page).toBe('single'); expect(inputBlockedOf(store.getState())).toBe(true);
    actions.setStatus({ ...idle, phase: 'reconnecting', actions: ['leave'] }); expect(store.getState().menu.page).toBe('single');
    actions.leaveSingle(); expect(store.getState().menu.page).toBe('home');
  });
  it('leaveSingle does nothing outside single player', () => {
    const { store, actions } = makeUi(); actions.openMultiplayer(); actions.leaveSingle(); expect(store.getState().menu.page).toBe('multiplayer');
  });
  it('Back goes up one level from every page that has it', () => {
    const { store, actions } = makeUi(); const page = () => store.getState().menu.page;
    actions.openMultiplayer(); actions.openHost(); actions.back(); expect(page()).toBe('multiplayer');
    actions.openJoin(); actions.back(); actions.back(); expect(page()).toBe('home');
    actions.openSettings(); actions.back(); expect(page()).toBe('home');
  });
  it('home() returns to the menu only from no status, idle or an error', () => {
    const { store, deps, actions } = makeUi();
    actions.setStatus({ ...idle, phase: 'lobby', actions: ['leave'] }); actions.home(); expect(deps.home).not.toHaveBeenCalled();
    actions.setStatus({ ...idle, phase: 'error', error: 'transport-lost', actions: ['retry'] }); actions.home();
    expect(deps.home).toHaveBeenCalledOnce(); expect(store.getState().menu.page).toBe('home');
  });
  it('Try another code and Return to menu leave the session page', () => {
    const { store, deps, actions } = makeUi();
    actions.setStatus({ ...idle, phase: 'error', error: 'not-found', actions: ['join'] }); actions.tryAnotherCode(); expect(store.getState().menu.page).toBe('join');
    actions.returnHome(); expect(deps.home).toHaveBeenCalledOnce(); expect(store.getState().menu).toMatchObject({ page: 'home', hadView: false });
  });
});

describe('settings', () => {
  it('reads fullscreen on opening Settings and on a resize there, and toggles it live', async () => {
    let full = false; const get = vi.fn(async () => full), set = vi.fn(async (on: boolean) => { full = on; return on; });
    const { store, actions } = makeUi({ deps: { fullscreen: { get, set } } });
    actions.windowResized(); expect(get).not.toHaveBeenCalled();
    actions.openSettings(); actions.toggleFullscreen(); expect(set).not.toHaveBeenCalled();   // unknown until read
    await flush(); expect(store.getState().menu.fullscreen).toBe(false);
    actions.toggleFullscreen(); await flush(); expect(set).toHaveBeenCalledWith(true); expect(store.getState().menu.fullscreen).toBe(true);
    full = false; actions.windowResized(); await flush(); expect(get).toHaveBeenCalledTimes(2); expect(store.getState().menu.fullscreen).toBe(false);
  });
  it('setVolume updates the store and the caller', () => {
    const { store, deps, actions } = makeUi({ settings: { volume: 0.5 } });
    actions.setVolume(0); expect(store.getState().settings.volume).toBe(0); expect(deps.setVolume).toHaveBeenCalledWith(0);
  });
});

describe('the strip and disposal', () => {
  it('setStripHeight writes only changes', () => {
    const { store, actions } = makeUi(); let writes = 0; store.subscribe(() => { writes++; });
    actions.setStripHeight(56); actions.setStripHeight(56); actions.setStripHeight(0);
    expect(writes).toBe(2); expect(store.getState().layout.stripHeight).toBe(0);
  });
  it('makes no request and no write after dispose', async () => {
    const host = vi.fn(async () => ({ ok: true as const })), { store, actions } = makeUi({ api: { host } });
    actions.dispose(); actions.host(2); await flush(); expect(host).not.toHaveBeenCalled(); expect(store.getState().menu.pending).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/uiActions.test.ts`
Expected: FAIL. `../../src/renderer/src/ui/actions` cannot be resolved.

- [ ] **Step 4: Write `actions.ts`**

Create `src/renderer/src/ui/actions.ts`:
```ts
// What the menu can do (React UI spec §2, §5): the preload calls, the router callbacks and the menu's transitions, moved
// line for line from render/sessionMenu.ts. Components only call these; each change is one store setState.
import type { OnlinePreloadApi, OnlineResult, OnlineStatus } from '../../../shared/onlineSession';
import { applyStatus, failureText, ROOM_CODE, type MenuState } from './menuState';
import type { UiStore } from './store';

export type MenuApi = Pick<OnlinePreloadApi, 'host' | 'join' | 'ready' | 'start' | 'removeSeat' | 'reconnect' | 'rehost' | 'retry' | 'leave' | 'forgetSeat'>;
export interface UiActionDeps {
  store: UiStore;
  /** The online bridge; absent when the app has none (the buttons that need it are disabled). */
  api?: MenuApi;
  single(): void; online(): void; pause(): void; home?(): void;
  setVolume?(volume: number): void;
  fullscreen?: { get(): Promise<boolean>; set(on: boolean): Promise<boolean> };
  /** performance.now(), injectable for tests. */
  perfNow?(): number;
}

export function createUiActions(deps: UiActionDeps) {
  const { store } = deps, perfNow = deps.perfNow ?? (() => performance.now());
  let disposed = false;
  const menu = (): MenuState => store.getState().menu;
  const setMenu = (patch: Partial<MenuState>): void => store.setState((s) => ({ menu: { ...s.menu, ...patch } }));
  const api = (): MenuApi => deps.api!;

  /** One preload request: `enter` moves to the session page; `interrupt` runs even while another request is pending. */
  async function invoke(run: () => Promise<OnlineResult>, enter = true, interrupt = false): Promise<void> {
    if ((menu().pending && !interrupt) || disposed) return;
    const id = menu().operation + 1;
    setMenu({ operation: id, pending: true, localError: '', ...(enter ? { page: 'session' as const } : {}) });
    if (enter) deps.online();
    try { const result = await run(); if (menu().operation === id && !result.ok) setMenu({ localError: failureText(result.code) }); }
    catch { if (menu().operation === id) setMenu({ localError: 'Online request failed. Try again.' }); }
    finally { if (menu().operation === id && !disposed) setMenu({ pending: false }); }
  }
  function readFullscreen(): void { void deps.fullscreen?.get().then((on) => { if (!disposed) setMenu({ fullscreen: on }); }, () => {}); }

  return {
    setStatus(next: OnlineStatus): void {
      const { menu: nextMenu, goHome } = applyStatus(menu(), next);
      if (goHome) deps.home?.();   // as sessionMenu did: the router goes home before the menu shows it
      store.setState((s) => ({ menu: nextMenu, online: { ...s.online, status: next, receivedAt: perfNow() } }));
    },
    single(): void { setMenu({ localError: '', page: 'single' }); deps.single(); },
    openMultiplayer(): void { setMenu({ localError: '', page: 'multiplayer' }); },
    openSettings(): void { setMenu({ localError: '', page: 'settings' }); readFullscreen(); },
    openHost(): void { setMenu({ hadView: false, page: 'host' }); },
    openJoin(): void { setMenu({ hadView: false, page: 'join' }); },
    /** Multiplayer and Settings go home; the Host and Join forms go back to Multiplayer. */
    back(): void {
      const page = menu().page;
      if (page === 'multiplayer') setMenu({ page: 'home', localError: '' });
      else if (page === 'settings') setMenu({ page: 'home' });
      else if (page === 'host' || page === 'join') setMenu({ page: 'multiplayer', localError: '' });
    },
    host(capacity: number): void { if (!menu().pending) void invoke(() => api().host(capacity)); },
    join(raw: string): void {
      if (menu().pending) return;
      const code = raw.trim().toUpperCase();
      if (!ROOM_CODE.test(code)) { setMenu({ localError: 'Enter an eight-character room code.' }); return; }
      void invoke(() => api().join(code));
    },
    ready(next: boolean): void { void invoke(() => api().ready(next)); },
    start(): void { void invoke(() => api().start()); },
    removeSeat(pid: number): void { void invoke(() => api().removeSeat(pid)); },
    reconnect(): void { void invoke(() => api().reconnect()); },
    rehost(): void { void invoke(() => api().rehost()); },
    retry(): void { void invoke(() => api().retry()); },
    /** Multiplayer's Forget saved seat: waits for any pending request, stays on the page. */
    forgetSavedSeat(): void { void invoke(() => api().forgetSeat(), false); },
    /** The session page's Forget saved seat: interrupts a pending request. */
    forgetSeatNow(): void { void invoke(() => api().forgetSeat(), false, true); },
    leave(): void {
      setMenu({ leaving: true });
      void invoke(() => api().leave(), false, true).then(() => {
        const s = store.getState();
        if (s.online.status?.phase === 'idle' && s.menu.page === 'session') { deps.home?.(); setMenu({ leaving: false, hadView: false, page: 'home' }); }
      });
    },
    tryAnotherCode(): void { setMenu({ hadView: false, page: 'join' }); },
    returnHome(): void { deps.home?.(); setMenu({ hadView: false, page: 'home' }); },
    pause(): void { deps.pause(); },
    setVolume(volume: number): void { store.setState((s) => ({ settings: { ...s.settings, volume } })); deps.setVolume?.(volume); },
    toggleFullscreen(): void {
      const on = menu().fullscreen;
      if (!deps.fullscreen || on === null) return;
      void deps.fullscreen.set(!on).then((next) => { if (!disposed) setMenu({ fullscreen: next }); }, () => {});
    },
    /** Single player has ended (M in the duel): show the main menu again. */
    leaveSingle(): void { if (menu().page === 'single') setMenu({ page: 'home' }); },
    home(): void {
      const status = store.getState().online.status;
      if (!status || status.phase === 'idle' || status.phase === 'error') { deps.home?.(); setMenu({ hadView: false, page: 'home', localError: '' }); }
    },
    /** The window resized (F11 or the Settings toggle changes fullscreen): refresh the Fullscreen label. */
    windowResized(): void { if (menu().page === 'settings') readFullscreen(); },
    setStripHeight(height: number): void {
      if (store.getState().layout.stripHeight !== height) store.setState((s) => ({ layout: { ...s.layout, stripHeight: height } }));
    },
    dispose(): void { disposed = true; }
  };
}
export type UiActions = ReturnType<typeof createUiActions>;
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/uiActions.test.ts tests/uiMenuState.test.ts tests/uiBoundary.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`. Expected: exit 0.
```bash
git add src/renderer/src/ui/actions.ts tests/helpers/uiStore.ts tests/uiActions.test.ts
git commit -m "feat(ui-i): the menu's actions (one setState per change, deduplicated preload requests)"
```

---

### Task 4: The React menu

**Files:**
- Create: `src/renderer/src/ui/context.tsx`, `src/renderer/src/ui/useNow.ts`, `src/renderer/src/ui/RegionBoundary.tsx`, `src/renderer/src/ui/UiRoot.tsx`, `src/renderer/src/ui/mount.tsx`
- Create: `src/renderer/src/ui/menu/styles.ts`, `MenuButton.tsx`, `Menu.tsx`, `Home.tsx`, `Multiplayer.tsx`, `Settings.tsx`, `HostForm.tsx`, `JoinForm.tsx`, `SessionPage.tsx`
- Create: `tests/helpers/uiRender.tsx`, `tests/menu.test.tsx`, `tests/settingsAndControls.test.ts`

**Interfaces:**
- Consumes: `UiStore` and `createUiStore` (Task 2); `UiActions` and `createUiActions` (Task 3); every Task 2 rule; `VOLUME_STEPS` (`app/settingsStore.ts`); `FULLSCREEN_KEY` (shared).
- Produces:
  - `UiContext: React.Context<{ store: UiStore; actions: UiActions } | null>`, `useUi<T>(selector: (s: UiState) => T): T`, `useActions(): UiActions`
  - `useNow(periodMs?: number): number` (epoch ms)
  - `RegionBoundary` with props `{ name: string; resetKey: string; fallback: ReactNode; children: ReactNode }`
  - `<UiRoot />`
  - `mountUi(opts: { el: HTMLElement; store: UiStore; actions: UiActions }): () => void`
  - From `tests/helpers/uiRender.tsx`: `renderUi(options)` returning `{ store, actions, deps, view }`, and `buttonIds(root)`.

- [ ] **Step 1: Write the render helper and the failing component tests**

Create `tests/helpers/uiRender.tsx`:
```tsx
// Renders the UI tree over a fixture store (React UI spec §8). Use only from `// @vitest-environment jsdom` files.
import { render } from '@testing-library/react';
import { UiContext } from '../../src/renderer/src/ui/context';
import { UiRoot } from '../../src/renderer/src/ui/UiRoot';
import { makeUi, type FixtureOptions } from './uiStore';

export function renderUi(o: FixtureOptions = {}) {
  const ui = makeUi(o);
  const view = render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot /></UiContext.Provider>);
  return { ...ui, view };
}
/** The data-testids of every button, in document order. */
export const buttonIds = (root: ParentNode): string[] => [...root.querySelectorAll('button')].map((b) => b.getAttribute('data-testid') ?? '');
```

Create `tests/menu.test.tsx`:
```tsx
// @vitest-environment jsdom
// The React main menu (React UI spec §5; main menu spec): the rendering cases of the old sessionMenu and mainMenu tests,
// ported one for one, plus the session-menu root's geometry, the strip height and the Menu's error boundary.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { OnlineStatus } from '../src/shared/onlineSession';
import { RegionBoundary } from '../src/renderer/src/ui/RegionBoundary';
import { flush, idle } from './helpers/uiStore';
import { buttonIds, renderUi } from './helpers/uiRender';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const HOME = ['single-player', 'multiplayer', 'settings'];
const click = (id: string): void => { fireEvent.click(screen.getByTestId(id)); };
const text = (id: string): string => screen.getByTestId(id).textContent ?? '';

describe('home', () => {
  it('shows exactly Single player, Multiplayer and Settings, even with a saved seat', () => {
    const { actions, view } = renderUi();
    expect(buttonIds(view.container)).toEqual(HOME);
    act(() => actions.setStatus(idle)); expect(buttonIds(view.container)).toEqual(HOME);
    expect(screen.getByTestId('session-menu').getAttribute('aria-label')).toBe('FTLite session menu');
    expect(screen.getByTestId('session-menu').getAttribute('data-layout')).toBe('overlay');
    expect(text('status')).toBe('Choose how to play.'); expect(screen.getByTestId('status').getAttribute('aria-live')).toBe('polite');
  });
});

describe('multiplayer', () => {
  it('holds Host, Join and Back (and the saved-seat actions), reaches the forms, and Back returns to it and then home', () => {
    const { actions, view } = renderUi();
    act(() => actions.setStatus(idle)); click('multiplayer');
    expect(text('page-title')).toBe('Multiplayer');
    expect(buttonIds(view.container)).toEqual(['host', 'join', 'reconnect', 'forget-seat', 'back']);
    expect((screen.getByTestId('host') as HTMLButtonElement).disabled).toBe(false);
    click('host'); expect(screen.getByTestId('capacity')).toBeDefined(); expect(document.activeElement).toBe(screen.getByTestId('capacity'));
    click('back'); expect(text('page-title')).toBe('Multiplayer');
    click('join'); expect(document.activeElement).toBe(screen.getByTestId('join-code'));
    click('back'); click('back'); expect(buttonIds(view.container)).toEqual(HOME);
  });
  it('explains unavailable online while leaving Single player playable', () => {
    const { actions, deps } = renderUi();
    act(() => actions.setStatus({ ...idle, persistent: false, actions: ['forget-seat'] })); click('multiplayer');
    expect(text('online-availability')).toContain('configured local service'); expect(text('online-availability')).toContain('Single player is available');
    expect((screen.getByTestId('host') as HTMLButtonElement).disabled).toBe(true);
    click('back'); click('single-player'); expect(deps.single).toHaveBeenCalledOnce();
  });
  it('labels reconnect as a seat only on Multiplayer', () => {
    const { actions } = renderUi();
    act(() => actions.setStatus({ ...idle, actions: ['reconnect'] })); expect(screen.queryByTestId('reconnect')).toBeNull();
    click('multiplayer'); expect(text('reconnect')).toBe('Reconnect saved seat');
  });
});

describe('the forms', () => {
  it('offers accessible capacity and code forms and submits them', () => {
    const host = vi.fn(async () => ({ ok: true as const })), join = vi.fn(() => new Promise<never>(() => {}));
    const { actions } = renderUi({ api: { host, join } });
    act(() => actions.setStatus({ ...idle, actions: ['host', 'join', 'reconnect'] }));
    click('multiplayer'); click('host');
    const capacity = screen.getByTestId('capacity') as HTMLSelectElement;
    expect(capacity.value).toBe('2'); expect(capacity.getAttribute('aria-label')).toBe('Crew capacity');
    expect([...capacity.options].map((o) => o.textContent)).toEqual(['1 crew — Skiff', '2 crew — Skiff', '3 crew — Cutter', '4 crew — Cutter']);
    fireEvent.change(capacity, { target: { value: '4' } }); fireEvent.submit(screen.getByTestId('host-form')); expect(host).toHaveBeenCalledWith(4);
  });
  it('validates the room code on submit', () => {
    const join = vi.fn(() => new Promise<never>(() => {})), { actions } = renderUi({ api: { join } });
    act(() => actions.setStatus({ ...idle, actions: ['join'] })); click('multiplayer'); click('join');
    const code = screen.getByTestId('join-code') as HTMLInputElement;
    expect(code.maxLength).toBe(32); expect(code.getAttribute('autocomplete')).toBe('off'); expect(code.getAttribute('spellcheck')).toBe('false');
    fireEvent.change(code, { target: { value: 'nope' } }); fireEvent.submit(screen.getByTestId('join-form'));
    expect(join).not.toHaveBeenCalled(); expect(text('status')).toBe('Enter an eight-character room code.');
    fireEvent.change(code, { target: { value: ' abcdef12 ' } }); fireEvent.submit(screen.getByTestId('join-form'));
    expect(join).toHaveBeenCalledExactlyOnceWith('ABCDEF12');
  });
});

describe('single player', () => {
  it('renders no menu during single player and returns home', () => {
    const { actions } = renderUi();
    click('single-player'); expect(screen.queryByTestId('session-menu')).toBeNull();
    act(() => actions.setStatus({ ...idle, phase: 'reconnecting', actions: ['leave'] })); expect(screen.queryByTestId('session-menu')).toBeNull();
    act(() => actions.leaveSingle()); expect(screen.getByTestId('session-menu').getAttribute('data-layout')).toBe('overlay');
  });
});

describe('settings', () => {
  it('changes the volume, toggles fullscreen live, lists the controls and goes Back', async () => {
    let full = false; const set = vi.fn(async (on: boolean) => { full = on; return on; });
    const { deps, view } = renderUi({ settings: { volume: 0.5, controls: [{ title: 'Single player', rows: [{ keys: 'Tab', action: 'Switch' }] }] }, deps: { fullscreen: { get: async () => full, set } } });
    click('settings');
    expect(text('page-title')).toBe('Settings');
    const volume = screen.getByTestId('volume') as HTMLSelectElement;
    expect(volume.value).toBe('0.5'); expect([...volume.options].map((o) => o.textContent)).toEqual(['Off', '25%', '50%', '75%', '100%']);
    expect((screen.getByTestId('fullscreen') as HTMLButtonElement).disabled).toBe(true);   // until the window's state is read
    await act(flush);
    expect(text('fullscreen')).toBe('Fullscreen: Off'); expect((screen.getByTestId('fullscreen') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(volume, { target: { value: '0' } }); expect(deps.setVolume).toHaveBeenCalledWith(0);
    click('fullscreen'); expect(set).toHaveBeenCalledWith(true); await act(flush);
    expect(text('fullscreen')).toBe('Fullscreen: On'); expect((screen.getByTestId('volume') as HTMLSelectElement).value).toBe('0');
    expect(text('fullscreen-note')).toBe('F11 also toggles fullscreen.');
    expect(text('controls')).toContain('Tab'); expect(text('controls')).toContain('Switch');
    click('back'); expect(buttonIds(view.container)).toEqual(HOME);
  });
  it('keeps the Settings page intact across an idle push and lets a session take over', async () => {
    const { actions } = renderUi({ deps: { fullscreen: { get: async () => false, set: vi.fn() } } });
    click('settings'); await act(flush);
    const select = screen.getByTestId('volume'); act(() => actions.setStatus(idle)); expect(screen.getByTestId('volume')).toBe(select);
    act(() => actions.setStatus({ ...idle, phase: 'lobby', actions: ['leave'] })); expect(screen.queryByTestId('volume')).toBeNull();
  });
  it('disables fullscreen without the window bridge and the volume without settings', () => {
    renderUi({ settings: null }); click('settings');
    expect((screen.getByTestId('fullscreen') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('volume') as HTMLSelectElement).disabled).toBe(true); expect((screen.getByTestId('volume') as HTMLSelectElement).value).toBe('1');
  });
});

describe('the session page and the strip', () => {
  const running: OnlineStatus = { ...idle, phase: 'running', role: 'guest', ownSeat: 2, attachmentEpoch: 1, actions: ['leave'] };
  it('is the strip while playing and reserves its measured height, then 0 after leaving', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.dataset.layout === 'strip' ? 112 : 0; });
    const leave = vi.fn(async () => ({ ok: true as const })), { store, actions } = renderUi({ api: { leave } });
    expect(store.getState().layout.stripHeight).toBe(0);
    act(() => actions.setStatus(running));
    const root = screen.getByTestId('session-menu');
    expect(root.getAttribute('data-layout')).toBe('strip'); expect(root.style.position).toBe('fixed'); expect(root.style.top).toBe('0px');
    expect(root.querySelector('h1')).toBeNull(); expect(store.getState().layout.stripHeight).toBe(112);
    click('leave'); await act(flush); act(() => actions.setStatus(idle));
    expect(screen.getByTestId('session-menu').getAttribute('data-layout')).toBe('overlay'); expect(store.getState().layout.stripHeight).toBe(0);
  });
  it('keeps a compact failure strip over the last game even when main clears the attachment epoch', () => {
    const { actions } = renderUi();
    act(() => actions.setStatus(running)); act(() => actions.setStatus({ ...running, phase: 'error', role: null, ownSeat: null, attachmentEpoch: 0, error: 'transport-lost', actions: ['retry'] }));
    expect(screen.getByTestId('session-menu').getAttribute('data-layout')).toBe('strip'); expect(screen.getByTestId('retry')).toBeDefined();
  });
  it('shows the committed receipt, the rollback warning, Re-host, Pause and Forget', () => {
    const rehost = vi.fn(async () => ({ ok: true as const })), pause = vi.fn(), { actions } = renderUi({ api: { rehost }, deps: { pause } });
    const status: OnlineStatus = { phase: 'saved', role: 'guest', ownSeat: 1, snapshot: null, attachmentEpoch: 2, error: 'host-lost', retryAtMs: null, persistent: true,
      mirror: { committed: { capturedTick: 1800 } as never, receivedAgeMs: 4000, localPending: true, persistent: true, error: null }, actions: ['rehost', 'leave', 'forget-seat'] };
    act(() => actions.setStatus(status));
    expect(text('mirror-status')).toContain('tick 1800'); expect(text('mirror-status')).toContain('received 4s ago');
    expect(text('rollback-warning')).toContain('roll back'); expect(text('pending-save')).toContain('not committed'); expect(screen.getByTestId('forget-seat')).toBeDefined();
    click('rehost'); click('rehost'); expect(rehost).toHaveBeenCalledOnce();
    act(() => actions.setStatus({ ...status, phase: 'paused', error: null })); expect(text('status')).toContain('Restored at tick 1800');
    click('pause'); expect(pause).toHaveBeenCalledOnce(); expect(text('pause')).toBe('Resume');
  });
  it('counts down a shared epoch deadline on each second', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); vi.setSystemTime(1800000000000);
    const { actions } = renderUi();
    act(() => actions.setStatus({ ...idle, phase: 'reconnecting', role: 'guest', ownSeat: 1, attachmentEpoch: 1, retryAtMs: 1800000002500, actions: [] }));
    expect(text('reconnect-countdown')).toBe('Retrying saved seat in 3s…');
    act(() => { vi.advanceTimersByTime(2000); }); expect(text('reconnect-countdown')).toBe('Retrying saved seat in 1s…');
  });
  it('gates the lobby: Ready for a guest, Start for a host once every occupied seat is ready, Remove for other seats', () => {
    const removeSeat = vi.fn(async () => ({ ok: true as const })), { actions } = renderUi({ api: { removeSeat } });
    const seats = [{ seatId: 0, occupied: true, connected: true, ready: false }, { seatId: 1, occupied: true, connected: true, ready: true }];
    const lobby: OnlineStatus = { ...idle, phase: 'lobby', role: 'guest', ownSeat: 1, actions: ['ready', 'leave'], snapshot: { capacity: 2, joinCode: 'ABCDEFGH', seats } as never };
    act(() => actions.setStatus(lobby));
    expect(text('room-code')).toBe('ROOM ABCDEFGH'); expect(text('assigned-seat')).toBe('You are Player 2');
    expect(text('roster')).toContain('P1: Not ready'); expect(text('ready')).toBe('Not ready'); expect(screen.queryByTestId('start')).toBeNull();
    const host: OnlineStatus = { ...lobby, role: 'host', ownSeat: 0, actions: ['start', 'ready', 'remove-seat', 'leave'] };
    act(() => actions.setStatus(host)); expect((screen.getByTestId('start') as HTMLButtonElement).disabled).toBe(true);
    click('remove-seat-1'); expect(removeSeat).toHaveBeenCalledWith(1); expect(screen.queryByTestId('remove-seat-0')).toBeNull();
  });
  it('enables Start when every occupied seat is ready and connected and nothing is pending', () => {
    const { actions } = renderUi();
    const lobby: OnlineStatus = { ...idle, phase: 'lobby', role: 'host', ownSeat: 0, actions: ['start', 'ready'], snapshot: { capacity: 1, joinCode: 'ABCDEFGH', seats: [{ seatId: 0, occupied: true, connected: true, ready: true }] } as never };
    act(() => actions.setStatus(lobby)); expect((screen.getByTestId('start') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('the Menu error boundary', () => {
  it('shows the fallback on a throw and retries when the reset key changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true; function Flaky() { if (fail) throw Error('boom'); return <p data-testid="ok">ok</p>; }
    const tree = (key: string) => <RegionBoundary name="test" resetKey={key} fallback={<p data-testid="fallback">fallback</p>}><Flaky /></RegionBoundary>;
    const view = render(tree('a')); expect(screen.getByTestId('fallback')).toBeDefined();
    view.rerender(tree('a')); expect(screen.getByTestId('fallback')).toBeDefined();
    fail = false; view.rerender(tree('b')); expect(screen.getByTestId('ok')).toBeDefined();
  });
});
```
Create `tests/settingsAndControls.test.ts`. It holds the two non-menu `describe` blocks of `tests/mainMenu.test.ts`, copied verbatim, so they survive Task 5's deletion:
```ts
// The settings store and the controls list (main menu spec, 2026-11-16), kept from mainMenu.test.ts when the DOM menu
// moved to React (UI-i).
import { describe, expect, it } from 'vitest';
import { controlSections, keyLabel } from '../src/renderer/src/app/controlsList';
import { FIRE_HELD, INTERACT_HELD, MOVE_CODES, PRESS_CODES } from '../src/renderer/src/app/duel/input';
import { SECTOR_KEYS } from '../src/renderer/src/input/sources';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY, VOLUME_STEPS } from '../src/renderer/src/app/settingsStore';

describe('settings store', () => {
  it('persists the volume and falls back to the default on missing, malformed or unknown data', () => {
    const map = new Map<string, string>(), storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    saveSettings(storage, { version: 1, volume: 0.25 }); expect(loadSettings(storage)).toEqual({ version: 1, volume: 0.25 });
    for (const bad of ['{', '[]', '{"version":2,"volume":0}', '{"version":1,"volume":0.3}', '{"version":1,"volume":"1"}']) { map.set(SETTINGS_KEY, bad); expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS); }
    const throwing = { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); } };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS); expect(() => saveSettings(throwing, DEFAULT_SETTINGS)).not.toThrow();
    expect(VOLUME_STEPS).toContain(DEFAULT_SETTINGS.volume);
  });
});

describe('the controls list', () => {
  it('names every bound key from the input tables, with no gamepad or second keyboard', () => {
    const sections = controlSections(), all = sections.flatMap(s => s.rows.map(r => r.keys)).join(' | ');
    expect(sections.map(s => s.title)).toEqual(['Single player', 'Multiplayer', 'Anywhere']);
    for (const code of Object.keys(PRESS_CODES)) expect(all).toContain(keyLabel(code));
    for (const code of [...Object.values(MOVE_CODES), INTERACT_HELD, FIRE_HELD]) expect(all).toContain(keyLabel(code));
    const sector = sections[1]!.rows.map(r => r.keys).join(' ');
    for (const code of [SECTOR_KEYS.up, SECTOR_KEYS.left, SECTOR_KEYS.down, SECTOR_KEYS.right, SECTOR_KEYS.interact, SECTOR_KEYS.confirm, SECTOR_KEYS.cancel, SECTOR_KEYS.callout]) expect(sector).toContain(keyLabel(code));
    expect(sections[0]!.rows.find(r => r.keys === 'M')!.action).toContain('main menu');
    expect(all).not.toMatch(/pad|stick|arrow/i);
    expect([keyLabel('KeyE'), keyLabel('Equal'), keyLabel('NumpadAdd'), keyLabel('Escape')]).toEqual(['E', '=', 'Num +', 'Esc']);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/menu.test.tsx tests/settingsAndControls.test.ts`
Expected: `settingsAndControls` PASSES, since it tests existing code. `menu.test.tsx` FAILS because `../../src/renderer/src/ui/context` cannot be resolved.

- [ ] **Step 3: Write the context, `useNow`, the boundary, the root and the mount**

Create `src/renderer/src/ui/context.tsx`:
```tsx
// The UI's store and actions for components (React UI spec §2): selectors return a store reference or a primitive,
// never a fresh object (zustand 5 loops on those).
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { UiActions } from './actions';
import type { UiState } from './menuState';
import type { UiStore } from './store';

export const UiContext = createContext<{ store: UiStore; actions: UiActions } | null>(null);
function useUiContext(): { store: UiStore; actions: UiActions } {
  const value = useContext(UiContext); if (!value) throw Error('ui-context-missing'); return value;
}
export function useUi<T>(selector: (s: UiState) => T): T { return useStore(useUiContext().store, selector); }
export function useActions(): UiActions { return useUiContext().actions; }
```

Create `src/renderer/src/ui/useNow.ts`:
```ts
// Wall-clock time for text that counts seconds (React UI spec §2): one re-render on each period boundary, so the shown
// second changes when the real one does.
import { useEffect, useState } from 'react';

export function useNow(periodMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = (): void => { timer = setTimeout(() => { setNow(Date.now()); arm(); }, periodMs - (Date.now() % periodMs)); };
    arm();
    return () => clearTimeout(timer);
  }, [periodMs]);
  return now;
}
```

Create `src/renderer/src/ui/RegionBoundary.tsx`:
```tsx
// One UI region's error boundary (React UI spec §2): a throw logs once and shows the fallback; the region renders again
// when its reset key changes, so the other regions (and the menu strip's Leave) stay usable.
import { Component, type ReactNode } from 'react';

interface Props { name: string; resetKey: string; fallback: ReactNode; children: ReactNode }
interface State { failed: boolean; failedKey: string | null }

export class RegionBoundary extends Component<Props, State> {
  override state: State = { failed: false, failedKey: null };
  static getDerivedStateFromError(): Partial<State> { return { failed: true }; }
  override componentDidCatch(error: unknown): void { console.error(`[ui] the ${this.props.name} region failed`, error); this.setState({ failedKey: this.props.resetKey }); }
  override componentDidUpdate(prev: Props): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey && this.state.failedKey !== this.props.resetKey) this.setState({ failed: false, failedKey: null });
  }
  override render(): ReactNode { return this.state.failed ? this.props.fallback : this.props.children; }
}
```

Create `src/renderer/src/ui/UiRoot.tsx`:
```tsx
// The UI tree (React UI spec §1): in UI-i, the Menu region alone. UI-ii and UI-iii add the Hud, DuelUi and FlightUi
// regions beside it, each in its own boundary.
import { useUi } from './context';
import { Menu, MenuFallback } from './menu/Menu';
import { RegionBoundary } from './RegionBoundary';

export function UiRoot() {
  const page = useUi((s) => s.menu.page), phase = useUi((s) => s.online.status?.phase ?? 'none');
  return <RegionBoundary name="menu" resetKey={`${page}|${phase}`} fallback={<MenuFallback />}><Menu /></RegionBoundary>;
}
```

Create `src/renderer/src/ui/mount.tsx`:
```tsx
// Mounts the UI into its element over the canvas (React UI spec §1). Returns the unmount.
import { createRoot } from 'react-dom/client';
import type { UiActions } from './actions';
import { UiContext } from './context';
import type { UiStore } from './store';
import { UiRoot } from './UiRoot';

export function mountUi(opts: { el: HTMLElement; store: UiStore; actions: UiActions }): () => void {
  const root = createRoot(opts.el), value = { store: opts.store, actions: opts.actions };
  root.render(<UiContext.Provider value={value}><UiRoot /></UiContext.Provider>);
  return () => root.unmount();
}
```

- [ ] **Step 4: Write the styles and the button**

Create `src/renderer/src/ui/menu/styles.ts`:
```ts
// The menu's look (React UI spec §5), the values of sessionMenu's inline styles: a dark panel, #52718d borders, monospace.
import type { CSSProperties } from 'react';

export const ROOT_OVERLAY: CSSProperties = { position: 'fixed', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#05060af2', color: '#d7e4f0', font: '16px monospace' };
export const ROOT_STRIP: CSSProperties = { position: 'fixed', left: 0, right: 0, top: 0, zIndex: 20, color: '#d7e4f0', background: '#0b111be8', font: '14px monospace', padding: '6px 12px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' };
export const PANEL_OVERLAY: CSSProperties = { width: 'min(620px,88vw)', maxHeight: '88vh', overflow: 'auto', scrollbarColor: '#52718d #0b111b', boxSizing: 'border-box', padding: 30, border: '1px solid #52718d', background: '#0b111b', boxShadow: '0 12px 70px #000' };
export const PANEL_STRIP: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
export const BUTTON: CSSProperties = { font: 'inherit', color: '#d7e4f0', background: '#172333', border: '1px solid #52718d', padding: '9px 14px', margin: 4, cursor: 'pointer' };
export const BUTTON_OFF: CSSProperties = { ...BUTTON, cursor: 'default', opacity: 0.45 };
export const NAV: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2, maxWidth: 280 };
export const CONTROL: CSSProperties = { display: 'block', margin: '10px 0', padding: 10, background: '#172333', color: '#d7e4f0', border: '1px solid #52718d', font: 'inherit' };
export const VOLUME: CSSProperties = { ...CONTROL, margin: '8px 0 14px', padding: 8 };
export const TABLE: CSSProperties = { borderCollapse: 'collapse', fontSize: 13, marginBottom: 8 };
export const KEYS: CSSProperties = { padding: '2px 14px 2px 0', color: '#f0c674', whiteSpace: 'nowrap', verticalAlign: 'top' };
export const ACTION: CSSProperties = { padding: '2px 0' };
```

Create `src/renderer/src/ui/menu/MenuButton.tsx`:
```tsx
// The menu's one button: a data-testid, the label, enabled or dimmed; a submit button takes no click handler.
import { BUTTON, BUTTON_OFF } from './styles';

export function MenuButton(props: { id: string; text: string; onClick?: () => void; enabled?: boolean; type?: 'button' | 'submit' }) {
  const enabled = props.enabled ?? true, type = props.type ?? 'button';
  return <button type={type} data-testid={props.id} disabled={!enabled} style={enabled ? BUTTON : BUTTON_OFF} onClick={type === 'button' ? props.onClick : undefined}>{props.text}</button>;
}
```

- [ ] **Step 5: Write the pages**

Create `src/renderer/src/ui/menu/Home.tsx`:
```tsx
import { useActions } from '../context';
import { MenuButton } from './MenuButton';
import { NAV } from './styles';

/** Exactly Single player, Multiplayer and Settings (main menu spec decision 1). */
export function Home() {
  const actions = useActions();
  return (
    <nav style={NAV}>
      <MenuButton id="single-player" text="Single player" onClick={actions.single} />
      <MenuButton id="multiplayer" text="Multiplayer" onClick={actions.openMultiplayer} />
      <MenuButton id="settings" text="Settings" onClick={actions.openSettings} />
    </nav>
  );
}
```

Create `src/renderer/src/ui/menu/Multiplayer.tsx`:
```tsx
import { useActions, useUi } from '../context';
import { availabilityText, can } from '../menuState';
import { MenuButton } from './MenuButton';

/** Host, Join, the saved-seat actions when offered, the availability note and Back (main menu spec decision 3). */
export function Multiplayer() {
  const menu = useUi((s) => s.menu), online = useUi((s) => s.online), actions = useActions();
  const v = { menu, online }, offered = online.status?.actions ?? [];
  return (
    <>
      <MenuButton id="host" text="Host" onClick={actions.openHost} enabled={can(v, 'host')} />
      <MenuButton id="join" text="Join" onClick={actions.openJoin} enabled={can(v, 'join')} />
      {offered.includes('reconnect') && <MenuButton id="reconnect" text="Reconnect saved seat" onClick={actions.reconnect} enabled={can(v, 'reconnect')} />}
      {offered.includes('forget-seat') && <MenuButton id="forget-seat" text="Forget saved seat" onClick={actions.forgetSavedSeat} enabled={can(v, 'forget-seat')} />}
      <p data-testid="online-availability">{availabilityText(v)}</p>
      <MenuButton id="back" text="Back" onClick={actions.back} enabled={!menu.pending} />
    </>
  );
}
```

Create `src/renderer/src/ui/menu/Settings.tsx`:
```tsx
import { Fragment } from 'react';
import { FULLSCREEN_KEY } from '../../../../shared/onlineSession';
import { VOLUME_STEPS } from '../../app/settingsStore';
import { useActions, useUi } from '../context';
import { MenuButton } from './MenuButton';
import { ACTION, KEYS, TABLE, VOLUME } from './styles';

/** The sound volume, the live fullscreen toggle and the read-only controls list (main menu spec decision 4). */
export function Settings() {
  const settings = useUi((s) => s.settings), fullscreen = useUi((s) => s.menu.fullscreen), actions = useActions();
  return (
    <>
      <label>Sound volume
        <select data-testid="volume" aria-label="Sound volume" style={VOLUME} value={String(settings.volume)} disabled={!settings.available}
          onChange={(e) => actions.setVolume(Number(e.target.value))}>
          {VOLUME_STEPS.map((step) => <option key={step} value={String(step)}>{step === 0 ? 'Off' : `${Math.round(step * 100)}%`}</option>)}
        </select>
      </label>
      <MenuButton id="fullscreen" text={`Fullscreen: ${fullscreen === null ? '…' : fullscreen ? 'On' : 'Off'}`} onClick={actions.toggleFullscreen}
        enabled={settings.fullscreenAvailable && fullscreen !== null} />
      <p data-testid="fullscreen-note">{`${FULLSCREEN_KEY} also toggles fullscreen.`}</p>
      <div data-testid="controls">
        <h3>Controls</h3>
        {settings.controls.map((section) => (
          <Fragment key={section.title}>
            <h4>{section.title}</h4>
            <table style={TABLE}><tbody>
              {section.rows.map((row, k) => <tr key={k}><td style={KEYS}>{row.keys}</td><td style={ACTION}>{row.action}</td></tr>)}
            </tbody></table>
          </Fragment>
        ))}
      </div>
      <MenuButton id="back" text="Back" onClick={actions.back} />
    </>
  );
}
```

Create `src/renderer/src/ui/menu/HostForm.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { useActions, useUi } from '../context';
import { can } from '../menuState';
import { MenuButton } from './MenuButton';
import { CONTROL } from './styles';

/** The crew capacity (1–4; two or fewer fly the Skiff) and Create room. */
export function HostForm() {
  const menu = useUi((s) => s.menu), online = useUi((s) => s.online), actions = useActions();
  const [capacity, setCapacity] = useState('2'), ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <>
      <form data-testid="host-form" onSubmit={(e) => { e.preventDefault(); actions.host(Number(capacity)); }}>
        <label>Crew capacity
          <select ref={ref} data-testid="capacity" aria-label="Crew capacity" style={CONTROL} value={capacity} onChange={(e) => setCapacity(e.target.value)}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={String(n)}>{`${n} crew — ${n <= 2 ? 'Skiff' : 'Cutter'}`}</option>)}
          </select>
        </label>
        <MenuButton id="create-room" text="Create room" type="submit" enabled={can({ menu, online }, 'host')} />
      </form>
      <MenuButton id="back" text="Back" onClick={actions.back} enabled={!menu.pending} />
    </>
  );
}
```

Create `src/renderer/src/ui/menu/JoinForm.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { useActions, useUi } from '../context';
import { can } from '../menuState';
import { MenuButton } from './MenuButton';
import { CONTROL } from './styles';

/** The eight-character room code and Join room. */
export function JoinForm() {
  const menu = useUi((s) => s.menu), online = useUi((s) => s.online), actions = useActions();
  const [code, setCode] = useState(''), ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <>
      <form data-testid="join-form" onSubmit={(e) => { e.preventDefault(); actions.join(code); }}>
        <label>Room code
          <input ref={ref} data-testid="join-code" aria-label="Room code" style={CONTROL} value={code} maxLength={32} autoComplete="off" spellCheck={false}
            onChange={(e) => setCode(e.target.value)} />
        </label>
        <MenuButton id="join-room" text="Join room" type="submit" enabled={can({ menu, online }, 'join')} />
      </form>
      <MenuButton id="back" text="Back" onClick={actions.back} enabled={!menu.pending} />
    </>
  );
}
```

Create `src/renderer/src/ui/menu/SessionPage.tsx`:
```tsx
import type { OnlineStatus } from '../../../../shared/onlineSession';
import { useActions, useUi } from '../context';
import { can, countdownText, ERRORS, receiptText, seatLabel, startAllowed, type MenuAction } from '../menuState';
import { useNow } from '../useNow';
import { MenuButton } from './MenuButton';

function MirrorLine(props: { status: OnlineStatus; receivedAt: number }) {
  useNow(1000);   // the receipt age grows each second
  return <span data-testid="mirror-status">{receiptText(props.status, props.receivedAt, performance.now())}</span>;
}
function Countdown(props: { retryAtMs: number }) {
  const now = useNow(1000);
  return <span data-testid="reconnect-countdown">{countdownText(props.retryAtMs, now)}</span>;
}

/** The room, the roster, the lobby and run controls, recovery state and the ways out (Net-3d/3e; main menu spec). */
export function SessionPage(props: { playing: boolean }) {
  const menu = useUi((s) => s.menu), online = useUi((s) => s.online), actions = useActions();
  const v = { menu, online }, status = online.status, room = status?.snapshot ?? null;
  const has = (a: MenuAction): boolean => !!status?.actions.includes(a);
  const ownReady = room?.seats.find((s) => s.seatId === status!.ownSeat)?.ready ?? false;
  const Roster = props.playing ? 'span' : 'ul', Line = props.playing ? 'span' : 'li';
  return (
    <>
      {status && room && (
        <>
          <strong data-testid="room-code">{`ROOM ${room.joinCode}`}</strong>
          <span data-testid="assigned-seat">{`You are Player ${(status.ownSeat ?? 0) + 1}`}</span>
          <Roster data-testid="roster">
            {Array.from({ length: room.capacity }, (_, pid) => {
              const seat = room.seats.find((s) => s.seatId === pid);
              return (
                <Line key={pid}>
                  {seatLabel(status, pid)}
                  {status.role === 'host' && !!seat?.occupied && pid !== status.ownSeat && status.phase === 'lobby'
                    && <MenuButton id={`remove-seat-${pid}`} text={`Remove Player ${pid + 1}`} onClick={() => actions.removeSeat(pid)} enabled={can(v, 'remove-seat')} />}
                </Line>
              );
            })}
          </Roster>
        </>
      )}
      {status?.phase === 'lobby' && (
        <>
          <MenuButton id="ready" text={ownReady ? 'Not ready' : 'Ready'} onClick={() => actions.ready(!ownReady)} enabled={can(v, 'ready')} />
          {status.role === 'host' && <MenuButton id="start" text="Start" onClick={actions.start} enabled={startAllowed(v)} />}
        </>
      )}
      {(status?.phase === 'running' || status?.phase === 'paused') && <MenuButton id="pause" text={status.phase === 'paused' ? 'Resume' : 'Pause'} onClick={actions.pause} />}
      {status?.mirror.committed && (
        <>
          <MirrorLine status={status} receivedAt={online.receivedAt} />
          {(status.phase === 'saved' || status.phase === 'rehosting') && <span data-testid="rollback-warning">Recovery may roll back actions after this checkpoint.</span>}
        </>
      )}
      {status?.mirror.localPending && <span data-testid="pending-save">Local pending save: not committed to the service.</span>}
      {status?.mirror.error && <span data-testid="mirror-error">{ERRORS[status.mirror.error] ?? 'Checkpoint storage is unavailable.'}</span>}
      {(status?.phase === 'saved' || status?.phase === 'rehosting') && <MenuButton id="rehost" text="Re-host" onClick={actions.rehost} enabled={can(v, 'rehost')} />}
      {status?.retryAtMs !== null && status?.retryAtMs !== undefined && <Countdown retryAtMs={status.retryAtMs} />}
      {status && !status.persistent && status.snapshot && <span data-testid="storage-warning">Seat not saved: restart recovery unavailable.</span>}
      {has('retry') && <MenuButton id="retry" text="Retry" onClick={actions.retry} enabled={can(v, 'retry')} />}
      {has('reconnect') && <MenuButton id="reconnect" text="Reconnect saved seat" onClick={actions.reconnect} enabled={can(v, 'reconnect')} />}
      {has('forget-seat') && <MenuButton id="forget-seat" text="Forget saved seat" onClick={actions.forgetSeatNow} enabled={online.available} />}
      {has('leave') && <MenuButton id="leave" text={status!.phase === 'ended' ? 'Return to menu' : 'Leave'} onClick={actions.leave} enabled={online.available} />}
      {!menu.pending && has('join') && <MenuButton id="try-code" text="Try another code" onClick={actions.tryAnotherCode} />}
      {!menu.pending && (!status || status.phase === 'idle' || status.phase === 'error') && <MenuButton id="home" text="Return to menu" onClick={actions.returnHome} />}
    </>
  );
}
```

Create `src/renderer/src/ui/menu/Menu.tsx`:
```tsx
// The menu region (React UI spec §5): the full-screen overlay, or exactly the strip over a game the session has shown.
// The root carries data-testid="session-menu" (the smokes measure it) and, while it is the strip, writes its height
// into layout.stripHeight so main.ts moves the canvas below it; 0 when the strip goes.
import { useLayoutEffect, useRef } from 'react';
import { useActions, useUi } from '../context';
import { isPlaying, menuMessage } from '../menuState';
import { Home } from './Home';
import { HostForm } from './HostForm';
import { JoinForm } from './JoinForm';
import { Multiplayer } from './Multiplayer';
import { SessionPage } from './SessionPage';
import { Settings } from './Settings';
import { BUTTON, PANEL_OVERLAY, PANEL_STRIP, ROOT_OVERLAY, ROOT_STRIP } from './styles';

export function Menu() {
  const menu = useUi((s) => s.menu), online = useUi((s) => s.online), actions = useActions();
  const ref = useRef<HTMLDivElement>(null), playing = isPlaying(menu);
  useLayoutEffect(() => {
    const el = ref.current; if (!playing || !el) return;
    const write = (): void => actions.setStripHeight(el.offsetHeight);
    write();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(write);   // a wrapped strip (status, roster) grows without a window resize
    observer?.observe(el);
    return () => { observer?.disconnect(); actions.setStripHeight(0); };
  }, [playing, actions]);
  if (menu.page === 'single') return null;   // the duel owns the screen
  const page = menu.page;
  return (
    <div ref={ref} data-testid="session-menu" aria-label="FTLite session menu" data-layout={playing ? 'strip' : 'overlay'} style={playing ? ROOT_STRIP : ROOT_OVERLAY}>
      <section style={playing ? PANEL_STRIP : PANEL_OVERLAY}>
        {!playing && <><h1>FTLite</h1><p>Crew together. Keep the ship flying.</p></>}
        {(page === 'multiplayer' || page === 'settings') && <h2 data-testid="page-title">{page === 'multiplayer' ? 'Multiplayer' : 'Settings'}</h2>}
        <p data-testid="status" role="status" aria-live="polite">{menuMessage({ menu, online })}</p>
        {page === 'home' ? <Home /> : page === 'multiplayer' ? <Multiplayer /> : page === 'settings' ? <Settings />
          : page === 'host' ? <HostForm /> : page === 'join' ? <JoinForm /> : <SessionPage playing={playing} />}
      </section>
    </div>
  );
}

/** What the menu region shows after a render error until its reset key changes (spec §2): a way out stays. */
export function MenuFallback() {
  const offered = useUi((s) => s.online.status?.actions), actions = useActions(), leave = !!offered?.includes('leave');
  return (
    <div data-testid="session-menu" aria-label="FTLite session menu" data-layout="overlay" style={ROOT_OVERLAY}>
      <section style={PANEL_OVERLAY}>
        <p>Menu error</p>
        <button type="button" style={BUTTON} onClick={leave ? actions.leave : actions.returnHome}>{leave ? 'Leave' : 'Return to menu'}</button>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Run the component tests to see them pass**

Run: `npx vitest run tests/menu.test.tsx tests/settingsAndControls.test.ts tests/uiBoundary.test.ts`
Expected: PASS. `menu.test.tsx` has 17 tests, `settingsAndControls` 2, and the guard covers every new `ui/` file.

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`. Expected: exit 0.
```bash
git add src/renderer/src/ui tests/helpers/uiRender.tsx tests/menu.test.tsx tests/settingsAndControls.test.ts
git commit -m "feat(ui-i): the React main menu (pages, session strip, error boundary, mount)"
```

---

### Task 5: Wire the app to the React menu and delete the DOM menu

**Files:**
- Modify: `src/renderer/src/main.ts` (imports; `startApp`, today's lines 33–97)
- Delete: `src/renderer/src/render/sessionMenu.ts`, `tests/sessionMenu.test.ts`, `tests/mainMenu.test.ts`

**Interfaces:**
- Consumes: `createUiStore` (Task 2), `inputBlockedOf` (Task 2), `createUiActions` (Task 3), `mountUi` (Task 4).
- Produces: the running app with the React menu. `actions.leave` is the `menu.leave()` H-2a-iii plans to call.

- [ ] **Step 1: Replace the imports**

In `src/renderer/src/main.ts`, delete the line `import { createSessionMenu } from './render/sessionMenu';` and add:
```ts
import { createUiStore } from './ui/store';
import { createUiActions } from './ui/actions';
import { inputBlockedOf } from './ui/menuState';
import { mountUi } from './ui/mount';
```

- [ ] **Step 2: Replace `startApp`**

Replace the whole `startApp` function (from its doc comment `/** The app (main menu spec, 2026-11-16)…` through its closing `}`) with:
```ts
/** The app (main menu spec, 2026-11-16; React UI spec UI-i): the menu with Single player (the solo duel), Multiplayer
 *  (today's online flow) and Settings, drawn by React over one UI store. One renderer serves both modes; the router
 *  owns at most one of them at a time. */
async function startApp(): Promise<void> {
  const ships = { cutter: parseShip(cutter), skiff: parseShip(skiff) };   // throws with a clear message on invalid ship data (spec §9)
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  const hud = createHud(renderer.hud, assets);
  const keyboard = createKeyboardSources(window);
  const audio = createAudio();
  let settings = (() => { try { return loadSettings(localStorage); } catch { return loadSettings({ getItem: () => null, setItem() {} }); } })();
  audio.setVolume(settings.volume);
  const scheduler = { schedule(delay: number, cb: () => void) { const timer = window.setTimeout(cb, delay); return () => window.clearTimeout(timer); } };
  const bridge = window.ftlite?.online ? createOnlineBridge(window, window.ftlite.online) : null;
  let online: ReturnType<typeof createOnlineRendererSession> | null = null, status: OnlineStatus | null = null;
  let blocked = true;
  const session = createSessionRouter({ resetInput: keyboard.reset,
    single: () => {
      const dispose = startDuelMode({ renderer, seed: DEFAULT_SEED, layout: ships.cutter, lifecycle: window.ftlite,
        onExit: () => { session.home(); actions.leaveSingle(); } });
      return { frame() { /* the duel runs on its own ticker callback */ }, dispose };
    },
    online: () => {
      online = createOnlineRendererSession({ sampleDevices: keyboard.sample, resetInput: keyboard.reset, renderer, hud, now: () => performance.now(), scheduler,
        resolveLayout: id => { const layout = Object.values(ships).find(ship => ship.id === id); if (!layout) throw Error('unknown-layout'); return layout; },
        api: bridge!, playCue: audio.play });
      if (status) online.setStatus(status); online.setInputBlocked(blocked); return online;
    }
  });
  // The actual transferred endpoint has exactly one owner before any menu action can dispatch.
  const offPort = bridge?.onPort((descriptor, port) => {
    if (session.mode !== 'online') { port.close(); return; }
    session.selectOnline().attach(descriptor, port);
  });
  const win = window.ftlite?.window;
  const store = createUiStore({ onlineAvailable: !!bridge, settings: { volume: settings.volume, fullscreenAvailable: !!win, controls: controlSections() } });
  const actions = createUiActions({ store, api: bridge ?? undefined,
    single() { online = null; session.selectSingle(); }, online() { session.selectOnline(); },
    home() { session.home(); online = null; }, pause() { online?.pause(); },
    setVolume(volume) { settings = { ...settings, volume }; audio.setVolume(volume); try { saveSettings(localStorage, settings); } catch { /* storage denied */ } },
    fullscreen: win ? { get: () => win.isFullScreen(), set: (on) => win.setFullScreen(on) } : undefined
  });
  // Online input is blocked everywhere but a viewed session (React UI spec §2), applied when the derived value changes.
  const setBlocked = (value: boolean): void => { if (blocked !== value) keyboard.reset(); blocked = value; online?.setInputBlocked(value); };
  setBlocked(inputBlockedOf(store.getState()));
  const offBlocked = store.subscribe((s) => { const value = inputBlockedOf(s); if (value !== blocked) setBlocked(value); });
  const offStatus = bridge?.onStatus(next => { status = next; online?.setStatus(next); actions.setStatus(next); });
  if (document.hidden || !document.hasFocus()) session.pause();
  // The session strip's height (written by the menu while it is the strip, 0 otherwise) moves the canvas down.
  const resize = (): void => {
    const top = store.getState().layout.stripHeight;
    renderer.app.canvas.style.cssText = `position:fixed;left:0;top:${top}px;display:block`;
    renderer.resize(window.innerWidth, Math.max(1, window.innerHeight - top));
  };
  let strip = store.getState().layout.stripHeight;
  const offStrip = store.subscribe((s) => { if (s.layout.stripHeight !== strip) { strip = s.layout.stripHeight; resize(); } });
  window.addEventListener('resize', resize); resize();
  window.addEventListener('resize', () => actions.windowResized());   // F11 fullscreen changes keep the Settings label true
  const uiRoot = document.createElement('div'); uiRoot.id = 'ui'; document.body.append(uiRoot);
  const unmountUi = mountUi({ el: uiRoot, store, actions });
  const unlockOnce = (): void => audio.unlock();   // first gesture (and every focus) resumes a suspended AudioContext; guarded inside
  window.addEventListener('keydown', unlockOnce, { once: true }); window.addEventListener('pointerdown', unlockOnce, { once: true }); window.addEventListener('focus', unlockOnce);
  window.addEventListener('blur', () => session.pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) session.pause(); else if (document.hasFocus()) session.resume(); });
  window.addEventListener('focus', () => session.resume());
  renderer.app.ticker.add(() => session.frame());
  window.addEventListener('beforeunload', () => {
    offPort?.(); offStatus?.(); offStrip(); setBlocked(true); offBlocked(); actions.dispose(); unmountUi();
    session.dispose(); bridge?.dispose(); keyboard.destroy();
  }, { once: true });
}
```

- [ ] **Step 3: Delete the DOM menu and its tests**

Run:
```bash
git rm src/renderer/src/render/sessionMenu.ts tests/sessionMenu.test.ts tests/mainMenu.test.ts
```
Then run `git grep -n "sessionMenu\|createSessionMenu\|reservedHeight" -- src tests scripts`.
Expected: no output. If a match remains, it is a stale reference: replace it with the matching `actions` call from Task 3.

- [ ] **Step 4: Run the unit suite, typecheck and the determinism gate**

Run: `npm run typecheck` then `npm test` then `npm run test:determinism`
Expected: all three exit 0, with no golden hash change. The suite loses the 18 cases of `sessionMenu.test.ts` and `mainMenu.test.ts`. Two of them now live verbatim in `settingsAndControls.test.ts`, and the rest are ported in `uiActions.test.ts` and `menu.test.tsx`.

- [ ] **Step 5: Build and run the Electron smokes**

Run, one after another:
```bash
npm run test:online-app-runtime
npm run test:online-recovery-runtime
npm run test:host-runtime
npm run test:rtc-runtime
npm run test:room-service-runtime
```
Expected: each exits 0. The online smokes check that the app's text includes "Single player", the native clicks on every testid they use, the typed room code, the keyboard-selected capacity, the reserved-viewport layout (`canvas.top >= menu.bottom`), `You are Player N` and the "Restored at tick" rule.

If one fails, run superpowers:systematic-debugging before changing anything. The smoke driver (`scripts/network/online-app-smoke.cjs`) must not be edited to make it pass, because decision 7 promises the smokes unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/main.ts
git commit -m "feat(ui-i): the app draws its menu with React; the DOM sessionMenu is removed"
```

---

### Task 6: Visual check and the record

**Files:**
- Create (scratchpad only, not committed): a playwright-core screenshot script, following the memory "Visual check method".
- Modify: `docs/roadmap.md`, only if it lists the React UI work. Check with `git grep -n "React" docs/roadmap.md`. If it has no entry, change nothing.

**Interfaces:**
- Consumes: the built app (`npm run build` → `out/`).
- Produces: before/after screenshots and the owner's look-check request.

- [ ] **Step 1: Take the "before" screenshots from the merge base**

In a scratchpad directory, install `playwright-core@1.48.2`. Check out the merge base into a temporary worktree (`git worktree add <scratch>/before <merge-base>`), then run `npm ci` and `npm run build` there. Launch `node_modules/electron/dist/electron.exe` with `_electron.launch({ args: ['<scratch>/before'] })` at a 1280×720 window, and screenshot:
- Home
- Multiplayer
- Settings
- the Host form
- the Join form

Navigate by clicking the `data-testid`s (`multiplayer`, `settings`, `host`, `back`, `join`).

- [ ] **Step 2: Take the "after" screenshots from this branch**

Run the same script against this worktree after `npm run build`, and save the same five screens.

- [ ] **Step 3: Compare**

Open each before/after pair with the Read tool. Expected: the same panel, borders, text, button order and spacing. Any visible difference other than deviation 6 is a defect: fix it in `ui/menu/styles.ts` or the page, rebuild and re-shoot.

- [ ] **Step 4: Ask for the owner's look-check**

Report the five pairs to the owner (paths in the scratchpad) and ask them to run the app and click through Single player → M back, Multiplayer → Host/Join → Back, and Settings. This plan is done when the owner says it looks right. Remove the temporary worktree with `git worktree remove <scratch>/before`.

---

## Self-review notes

- **Spec coverage for UI-i:**
  - decision 1 → Task 1; decision 2 → Tasks 2–4; decision 6 → the Task 1 guard; decision 7 → the global constraint, Task 4's tests and Task 5's smokes.
  - §1's render rule (Menu only in UI-i) → `UiRoot`.
  - §2: the single `setStatus` → Task 3; input blocking → Task 5; the Menu boundary → Task 4.
  - §5 → Tasks 3–5; §8's UI-i tests and guards → Tasks 1–5; the visual check → Task 6.
  - The rest of the foundation is deferred to UI-ii by deviation 1.
- **H-2a-iii follow-up:** its plan calls `menu.leave()` and edits `sessionMenu.ts` for Host without capacity, Swap seats and the lobby's Helm line. After this plan, those become `actions.leave()` and edits to `ui/menu/HostForm.tsx`, `ui/menu/SessionPage.tsx` and `ui/actions.ts` (spec §9 item 3), made in H-2a-iii's own plan refinement.
