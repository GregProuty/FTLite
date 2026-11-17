# Artemis-i: console layout, tabs and clickable controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay out the duel's Helm and Weapons console screens like Artemis Bridge Simulator (tabs at the top left, a status table on the left, the station block at the bottom left, zoom and camera on the right), with every control clickable and every key unchanged.

**Architecture:** The keyboard (`app/duel/input.ts`) becomes the single merge point for keys and clicks. React buttons call `actions.console`, which forwards to the active mode's keyboard `ui` handle. So a click does exactly what its key does, through today's runtime code. A new pure `render/duel/consoleModel.ts` builds a `ConsoleView` each frame in the scene. New React components draw it on the pixel stage, in the amber CRT skin.

**Tech Stack:** TypeScript 5.8, React 19 + zustand 5 (UI store), Pixi 8 (tactical layer), Vitest 3.2 + jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-11-17-artemis-consoles-design.md` (final 85949f3). This plan is **Artemis-i** only (spec §1). The throttle (spec §5) is Artemis-ii, with its own plan.

## Global Constraints

- No sim change: no file under `src/renderer/src/sim/` changes, `SIM_VERSION` stays 40, and no golden or determinism fixture changes.
- Every keyboard control keeps working exactly as today (spec decision 1). The existing input, runtime, online and readout tests pass unchanged, except where a task names the test it updates.
- Layout (spec §2), internal 1280×720: tab strip x 12, y 8, 3 tabs of 96, 4 apart, h 26 (ends at x 308); status table x 12, y 42, w `READOUT_W` (204); station block x 12, w 300, bottom 12 from the bottom edge, h Helm 200 / Weapons 216; right column x 1280 − 12 − 132, y 42, w 132; map reserve left 228, right 156.
- Text: readout rows and values at `FONT_SIZE`; button labels, key hints and the station block's small headings at `FONT_NATIVE`. ASCII only: arrows are `<` and `>`; the bars and the throttle column are `Box`es.
- Buttons (spec §3): `div` with `role="button"` and **no** `tabIndex`; `pointer-events: auto` only on buttons; `preventDefault()` on `pointerdown`, `mousedown`, `contextmenu` and `auxclick`; only the primary button acts; a hold releases exactly once on `pointerup`, `pointercancel`, `lostpointercapture` or unmount; `data-testid="console-<name>"`.
- Button states (spec §3 table): CRT idle outline `mid`/text `main`; hover outline `main`/text `hot`; lit fill `main`/text `glass`; disabled outline `faint`/text `faint`. Off the CRT: idle DIM/TEXT; hover AMBER/AMBER; lit fill AMBER/text PANEL_FILL; disabled BAR_OFF/DIM.
- Merge rules (spec §6.2): a code is held when it is held by either the keys or the UI. `fireDown` and `fireUp` are counted on transitions of the merged Space state. A repeat keydown never counts a `fireDown`. `clear()` (Tab, restart, blur) empties both sets; `clearUi()` empties only the UI set and requests, with no edges, and runs when the drawn console's station changes or the console becomes null.
- Tabs (spec §6.3), for the local driven character `me`: the seat `me` holds is `current` (SHIP while standing); a console is `open` (click = E) when `me` stands, `consoleInReach` is that console and `repairInReach < 0`; in single player a console the other character sits at is also `open` (click = Tab); SHIP is `open` while `me` is seated (click = X); every other tab is `locked`.
- The console view is null on the end card, in the flight view, while any pause banner shows, and while paused for any reason.
- Comments in the codebase's style: a header comment per new file that cites the spec section.

## Deviations from the spec (stated on purpose)

1. **Map reserve** (spec §2 "`reserveRight` becomes `reserve: { left, right }`"): `TacticalModelInput` keeps `reserveRight` and gains an optional `reserveLeft` (default 0). It behaves the same with far less churn: five test files build that input with `reserveRight`.
2. **`DuelViewSource.seat()`** (spec §6.1) is not added: the seat is `seatOf(source.duel, source.active())`, which both sources already give. Added instead: `mode: 'single' | 'online'` (the tab rule needs it) and `uiHeld(): HeldFlags`.
3. **Helm block fields:** `ConsoleView.helm` has no `throttleShown`/`throttleSettable` until Artemis-ii. The Artemis-i column is drawn from `held.up`/`held.down` (spec §4.2 "Artemis-i").
4. **Clear on console change:** `scene.draw` returns the drawn console's station (or null), and each mode calls `keyboard.clearUi()` when it changes. This is spec §6.2's rule, placed where the information is.
5. **Electron click check** (spec §8 "Electron smoke"): run by the controller in Task 6 from a scratch playwright script, as the UI-i/ii/iii visual checks were. It is not a committed npm smoke.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/renderer/src/app/duel/input.ts` | modify | `HeldFlags`, `HoldCode`, `ConsoleInput`; the two-set keyboard with `ui`, `clearUi()`, `KeySample.held` and `KeySample.lockTo` |
| `src/renderer/src/render/duel/consoleLayout.ts` | create | the layout constants of spec §2 |
| `src/renderer/src/render/duel/consoleModel.ts` | create | `ConsoleView` and `consoleModel()` (tabs, station panels, side column) |
| `src/renderer/src/render/duel/readoutModel.ts` | modify | `ReadoutInput.console`; `chargeRow()` exported |
| `src/renderer/src/render/duel/interiorModel.ts` | modify | `INTERIOR_BAND` from y 42 |
| `src/renderer/src/render/tactical/tacticalModel.ts`, `weaponsModel.ts` | modify | `reserveLeft` |
| `src/renderer/src/ui/stage/Button.tsx` | create | the shared button |
| `src/renderer/src/ui/duel/TabStrip.tsx`, `SideColumn.tsx`, `HelmStation.tsx`, `WeaponsStation.tsx` | create | the console pieces |
| `src/renderer/src/ui/duel/ReadoutPanel.tsx`, `MapOverlay.tsx`, `DuelUi.tsx` | modify | placement by console; draw the console |
| `src/renderer/src/ui/views.ts` | modify | `DuelUiView.console?` |
| `src/renderer/src/ui/actions.ts` | modify | `console` and `setConsole` |
| `src/renderer/src/app/duel/scene.ts` | modify | build the console; pass the reserves; return the station |
| `src/renderer/src/app/duel/runtime.ts`, `onlineSource.ts`, `onlineDuel.ts`, `duelMode.ts` | modify | `lockTo`, `uiHeld`, `mode`, `clearUi`, `setConsole` |
| `src/renderer/src/main.ts` | modify | pass `setConsole` to the modes |
| `src/renderer/src/app/uiProbe.ts`, probe wiring | modify | console fixtures for the look check |

---

### Task 1: The keyboard merges keys and clicks

**Files:**
- Modify: `src/renderer/src/app/duel/input.ts:1-91`
- Test: `tests/duelInputMerge.test.ts` (create)

**Interfaces:**
- Produces (in `app/duel/input.ts`):
  ```ts
  export interface HeldFlags { fire: boolean; left: boolean; right: boolean; up: boolean; down: boolean }
  export const NO_HELD_FLAGS: HeldFlags;
  export type HoldCode = 'Space' | 'KeyA' | 'KeyD' | 'KeyW' | 'KeyS';
  export interface ConsoleInput { press(action: KeyAction): void; hold(code: HoldCode, on: boolean): void; lock(room: number): void }
  // KeySample gains two optional fields:
  //   held?: HeldFlags        the merged held state (always set by createDuelKeyboard)
  //   lockTo?: number | null  the last lock(room) request since the previous sample
  // DuelKeyboard gains:  ui: ConsoleInput;  clearUi(): void
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/duelInputMerge.test.ts`:

```ts
// Spec 2026-11-17-artemis-consoles §6.2: the duel keyboard is the merge point for keys and console clicks.
import { describe, expect, it } from 'vitest';
import { createDuelKeyboard, type EventSource } from '../src/renderer/src/app/duel/input';

function fakeWindow() {
  const fns = new Map<string, (e: unknown) => void>();
  const target: EventSource = { addEventListener: (t, fn) => { fns.set(t, fn as (e: unknown) => void); }, removeEventListener: (t) => { fns.delete(t); } };
  const key = (type: 'keydown' | 'keyup', code: string, repeat = false) => fns.get(type)!({ code, repeat, preventDefault() {} });
  return { target, down: (c: string, repeat = false) => key('keydown', c, repeat), up: (c: string) => key('keyup', c), blur: () => fns.get('blur')!({}) };
}

describe('keys and clicks merge (spec §6.2)', () => {
  it('a click hold alone gives one fireDown and one fireUp', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    kb.ui.hold('Space', true);
    let s = kb.sample(); expect(s.presses.fireDown).toBe(1); expect(s.fireHeld).toBe(true); expect(s.held!.fire).toBe(true);
    kb.ui.hold('Space', false);
    s = kb.sample(); expect(s.presses.fireUp).toBe(1); expect(s.fireHeld).toBe(false);
  });
  it('Space and the FIRE button overlapping give one edge each way, in every order', () => {
    for (const order of [['kd', 'ud', 'ku', 'uu'], ['kd', 'ud', 'uu', 'ku'], ['ud', 'kd', 'ku', 'uu'], ['ud', 'kd', 'uu', 'ku']]) {
      const w = fakeWindow(), kb = createDuelKeyboard(w.target);
      let downs = 0, ups = 0;
      for (const step of order) {
        if (step === 'kd') w.down('Space'); if (step === 'ku') w.up('Space');
        if (step === 'ud') kb.ui.hold('Space', true); if (step === 'uu') kb.ui.hold('Space', false);
        const s = kb.sample(); downs += s.presses.fireDown; ups += s.presses.fireUp;
      }
      expect([order.join(','), downs, ups]).toEqual([order.join(','), 1, 1]);
    }
  });
  it('A from one source and D from the other cancel; W from the UI moves up', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    w.down('KeyA'); kb.ui.hold('KeyD', true);
    expect(kb.sample().moveX).toBe(0);
    w.up('KeyA');
    expect(kb.sample().moveX).toBe(1);
    kb.ui.hold('KeyW', true);
    const s = kb.sample(); expect(s.moveY).toBeLessThan(0); expect(s.held).toMatchObject({ up: true, right: true, left: false });
  });
  it('press adds one edge; lock is last-wins and lasts one sample', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    kb.ui.press('launch'); kb.ui.press('switch'); kb.ui.lock(2); kb.ui.lock(1);
    let s = kb.sample(); expect(s.presses.launch).toBe(1); expect(s.presses.switch).toBe(1); expect(s.lockTo).toBe(1);
    s = kb.sample(); expect(s.presses.launch).toBe(0); expect(s.lockTo).toBeNull();
  });
  it('clearUi drops click holds with no edge and leaves a held key held', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    w.down('KeyA'); kb.ui.hold('Space', true); kb.ui.hold('KeyD', true); kb.sample();
    kb.ui.lock(0); kb.clearUi();
    const s = kb.sample();
    expect(s.presses.fireUp).toBe(0); expect(s.fireHeld).toBe(false); expect(s.moveX).toBe(-1); expect(s.lockTo).toBeNull();
  });
  it('clear drops both sources with no edge; a late release of a cleared hold counts nothing', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    w.down('Space'); kb.ui.hold('KeyD', true); kb.sample();
    kb.clear();
    kb.ui.hold('KeyD', false); w.up('Space');
    const s = kb.sample(); expect(s.presses.fireUp).toBe(0); expect(s.presses.fireDown).toBe(0); expect(s.moveX).toBe(0);
  });
  it('a repeat Space keydown after a clear counts no fireDown', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    w.down('Space'); kb.sample(); kb.clear();
    w.down('Space', true);
    const s = kb.sample(); expect(s.presses.fireDown).toBe(0); expect(s.fireHeld).toBe(true);
  });
  it('blur clears the UI holds too', () => {
    const w = fakeWindow(), kb = createDuelKeyboard(w.target);
    kb.ui.hold('KeyA', true); kb.sample(); w.blur();
    expect(kb.sample().moveX).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/duelInputMerge.test.ts`
Expected: FAIL. `kb.ui` is undefined.

- [ ] **Step 3: Implement the merge in `input.ts`**

Add the types after `MOVE_CODES`/`FIRE_HELD`:

```ts
/** The merged held state a console draws (spec §6.1): Space, A, D, W, S from the keys or the console's buttons. */
export interface HeldFlags { fire: boolean; left: boolean; right: boolean; up: boolean; down: boolean }
export const NO_HELD_FLAGS: HeldFlags = { fire: false, left: false, right: false, up: false, down: false };
/** The codes a console button can hold (spec §6.2). */
export type HoldCode = 'Space' | 'KeyA' | 'KeyD' | 'KeyW' | 'KeyS';
/** What a console click can do (spec §6.2): a press edge, a held code, or a direct lock request. */
export interface ConsoleInput { press(action: KeyAction): void; hold(code: HoldCode, on: boolean): void; lock(room: number): void }
```

Add to `KeySample`:

```ts
  /** The merged held flags (spec §6.1); createDuelKeyboard always sets it. */
  held?: HeldFlags;
  /** The last console lock request since the previous sample, or null (spec §6.2). */
  lockTo?: number | null;
```

Change `DuelKeyboard` to `export interface DuelKeyboard { sample(): KeySample; clear(): void; clearUi(): void; destroy(): void; readonly ui: ConsoleInput }`, and replace `createDuelKeyboard` with:

```ts
/** Held keys are cleared on blur so nothing sticks after alt-tab; `clear` does the same for Tab and restart (spec §4, §5).
 *  Console clicks (Artemis spec §6.2) are a second held set and extra press edges: a code is held when either set holds
 *  it, and Fire's edges are the merged Space state's transitions. `clearUi` drops only the clicks. */
export function createDuelKeyboard(target: EventSource): DuelKeyboard {
  const keys = new Set<string>(), ui = new Set<string>();
  let presses = emptyPresses(), lockTo: number | null = null;
  const has = (code: string): boolean => keys.has(code) || ui.has(code);
  const down = (e: KeyEventLike): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.code === FIRE_HELD) { if (!e.repeat && !has(FIRE_HELD)) presses.fireDown++; }
    else { const action = PRESS_CODES[e.code]; if (action && !e.repeat) presses[action]++; }
    keys.add(e.code);
  };
  const up = (e: KeyEventLike): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    const was = has(FIRE_HELD);
    keys.delete(e.code);
    if (e.code === FIRE_HELD && was && !has(FIRE_HELD)) presses.fireUp++;
  };
  const clearUi = (): void => { ui.clear(); lockTo = null; };
  const clear = (): void => { keys.clear(); ui.clear(); presses = emptyPresses(); lockTo = null; };
  target.addEventListener('keydown', down as (e: never) => void);
  target.addEventListener('keyup', up as (e: never) => void);
  target.addEventListener('blur', clear as (e: never) => void);
  const console: ConsoleInput = {
    press(action) { presses[action]++; },
    hold(code, on) {
      const was = has(FIRE_HELD);
      if (on) ui.add(code); else ui.delete(code);
      if (code === FIRE_HELD) { const now = has(FIRE_HELD); if (!was && now) presses.fireDown++; else if (was && !now) presses.fireUp++; }
    },
    lock(room) { lockTo = room; }
  };
  return {
    ui: console,
    sample(): KeySample {
      const x = (has(MOVE_CODES.right) ? 1 : 0) - (has(MOVE_CODES.left) ? 1 : 0), y = (has(MOVE_CODES.down) ? 1 : 0) - (has(MOVE_CODES.up) ? 1 : 0);
      const len = Math.sqrt(x * x + y * y) || 1;
      const held: HeldFlags = { fire: has(FIRE_HELD), left: has(MOVE_CODES.left), right: has(MOVE_CODES.right), up: has(MOVE_CODES.up), down: has(MOVE_CODES.down) };
      const out: KeySample = { moveX: x / len, moveY: y / len, interactHeld: has(INTERACT_HELD), fireHeld: held.fire, presses, held, lockTo };
      presses = emptyPresses(); lockTo = null;
      return out;
    },
    clear,
    clearUi,
    destroy(): void {
      target.removeEventListener('keydown', down as (e: never) => void);
      target.removeEventListener('keyup', up as (e: never) => void);
      target.removeEventListener('blur', clear as (e: never) => void);
    }
  };
}
```

Note the local name `console` shadows the global inside this function only. If the linter or a reviewer objects, call it `consoleInput`.

- [ ] **Step 4: Run the new test and the existing input tests**

Run: `npx vitest run tests/duelInputMerge.test.ts tests/duelInput.test.ts tests/onlineInput.test.ts tests/duelRuntime.test.ts tests/onlineDuelSession.test.ts`
Expected: all PASS. The existing tests prove that the keyboard path is unchanged.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b`. Expected: no errors.

```bash
git add src/renderer/src/app/duel/input.ts tests/duelInputMerge.test.ts
git commit -m "feat(artemis-i): the duel keyboard merges console clicks with keys (spec §6.2)"
```

---

### Task 2: Pure models — layout, console view, readout and map reserves

**Files:**
- Create: `src/renderer/src/render/duel/consoleLayout.ts`, `src/renderer/src/render/duel/consoleModel.ts`
- Modify: `src/renderer/src/render/duel/readoutModel.ts:45-92`, `src/renderer/src/render/duel/interiorModel.ts:12-13`, `src/renderer/src/render/tactical/tacticalModel.ts:79-80,186-205,281,292`, `src/renderer/src/render/tactical/weaponsModel.ts:88`
- Test: `tests/consoleModel.test.ts` (create); update `tests/duelInterior.test.ts:43-44` only if its assertions change

**Interfaces:**
- Consumes: `HeldFlags`, `KeyAction` (Task 1); `seatOf`, `consoleInReach`, `repairInReach` (`app/duel/controls.ts`); `canLaunch` (`sim/tactical/weapons.ts`); `missileOf` (`sim/tactical/state.ts`); `HEADING_COUNT` (`sim/tactical/tuning.ts`); `MapOverlayView` (`ui/views.ts`).
- Produces:
  ```ts
  // render/duel/consoleLayout.ts
  export const EDGE = 12;
  export const TABS: { x: 12; y: 8; w: 96; gap: 4; h: 26 }; export const TABS_RIGHT = 308;
  export const STATUS: { x: 12; y: 42; w: number /* READOUT_W */ };
  export const STATION: { x: 12; w: 300; h: { helm: 200; weapons: 216 } }; export function stationTop(s: 'helm' | 'weapons'): number;
  export const SIDE: { x: 1136; y: 42; w: 132 };
  export const CONSOLE_RESERVE: { left: 228; right: 156 };
  // render/duel/consoleModel.ts
  export type ConsoleStation = 'helm' | 'weapons' | 'ship'; export type TabState = 'current' | 'open' | 'locked';
  export interface HelmPanel { heading: number; speed: number; held: HeldFlags }
  export interface WeaponsPanel { lock: number; charge: ReadoutRow; magazine: string; canLaunch: boolean; missileFlying: boolean; fireHeld: boolean; held: HeldFlags }
  export interface ConsoleView { station: ConsoleStation; tabs: Record<ConsoleStation, TabState>; tabActions: Record<ConsoleStation, KeyAction | null>;
    helm: HelmPanel | null; weapons: WeaponsPanel | null; side: { zoom: string; free: boolean; snapLabel: 'SNAP' | 'CAMERA' } | null }
  export interface ConsoleModelInput { duel: DuelState; me: 0 | 1; mode: 'single' | 'online'; hidden: boolean; held: HeldFlags; overlay: MapOverlayView | null }
  export function consoleModel(i: ConsoleModelInput): ConsoleView | null;
  // readoutModel.ts
  //   ReadoutInput gains `console?: boolean`
  export function chargeRow(d: DuelState): ReadoutRow;
  // tacticalModel.ts: TacticalModelInput gains `reserveLeft?: number` (default 0)
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/consoleModel.test.ts`. The duel helpers are the ones `tests/duelControls.test.ts` uses (lines 1-18 there):

```ts
// Spec 2026-11-17-artemis-consoles §2, §6.1, §6.3: the console layout and view model.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position } from '../src/renderer/src/sim/components';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { canLaunch } from '../src/renderer/src/sim/tactical/weapons';
import { CONSOLE_RESERVE, SIDE, STATION, STATUS, TABS_RIGHT, stationTop } from '../src/renderer/src/render/duel/consoleLayout';
import { consoleModel, type ConsoleModelInput } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { readoutRows } from '../src/renderer/src/render/duel/readoutModel';
import { LINE, PAD } from '../src/renderer/src/render/theme';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const step = (d: DuelState, player: number, command: DuelCommand | null) =>
  stepDuelTick(d, { held: [NONE, NONE], commands: command ? [{ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command }] : [] });
const put = (d: DuelState, pid: number, tile: number): void => { const W = d.interior.derived.width, eid = d.interior.crew[pid]!; Position.x[eid] = (tile % W) + 0.5; Position.y[eid] = Math.floor(tile / W) + 0.5; };
const model = (d: DuelState, over: Partial<ConsoleModelInput> = {}) => consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, ...over });
// createDuel seats player 0 at the Helm (nav) and player 1 at Weapons (duelControls.test.ts 'seatOf').

describe('console layout (spec §2)', () => {
  it('has the spec numbers', () => {
    expect(TABS_RIGHT).toBe(308); expect(CONSOLE_RESERVE).toEqual({ left: 228, right: 156 });
    expect(SIDE.x).toBe(1136); expect(STATUS).toMatchObject({ x: 12, y: 42, w: 204 }); expect(STATION).toMatchObject({ x: 12, w: 300 });
    expect(stationTop('helm')).toBe(508); expect(stationTop('weapons')).toBe(492);
  });
  it('the status table ends above the station block at its longest (every crew room damaged)', () => {
    const d = createDuel(layout, 5); d.tactical.systems[0].rooms = [2, 1, 1];
    for (const mode of ['helm', 'weapons'] as const) {
      const rows = readoutRows({ duel: d, mode, active: 0, other: 'AT WEAPONS', console: true });
      expect(STATUS.y + PAD + LINE * rows.length + PAD).toBeLessThanOrEqual(stationTop(mode));
    }
    disposeDuel(d);
  });
});

describe('readout rows on a console (spec §2)', () => {
  it('drop the view heading and, on Weapons, the LASER block; unchanged without the flag', () => {
    const d = createDuel(layout, 5);
    const w = readoutRows({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM', console: true }).map((r) => r.label);
    expect(w[0]).toBe('CUTTER');
    for (const gone of ['LASER', 'LOCK', 'CHARGE', 'MAG']) expect(w).not.toContain(gone);
    const plain = readoutRows({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' }).map((r) => r.label);
    expect(plain[0]).toBe('WEAPONS'); expect(plain).toContain('CHARGE');
    disposeDuel(d);
  });
});

describe('tabs (spec §6.3)', () => {
  it('seated at the Helm: HELM current, SHIP open (X); WEAPONS open (Tab) in single player only', () => {
    const d = createDuel(layout, 5);
    expect(model(d)).toMatchObject({ station: 'helm', tabs: { helm: 'current', weapons: 'open', ship: 'open' }, tabActions: { helm: null, weapons: 'switch', ship: 'stand' } });
    expect(model(d, { mode: 'online' })).toMatchObject({ tabs: { helm: 'current', weapons: 'locked', ship: 'open' }, tabActions: { weapons: null } });
    disposeDuel(d);
  });
  it('standing in reach of the free Weapons console with no repair in reach: WEAPONS open (E), SHIP current', () => {
    const d = createDuel(layout, 5);
    step(d, 1, { kind: 'stand' }); step(d, 0, { kind: 'stand' });
    put(d, 0, d.interior.derived.stationTile[d.weapons]!);
    expect(model(d, { mode: 'online' })).toMatchObject({ station: 'ship', tabs: { ship: 'current', weapons: 'open', helm: 'locked' }, tabActions: { weapons: 'interact' } });
    disposeDuel(d);
  });
  it('standing in reach of a console and of a repair: the console stays locked', () => {
    const d = createDuel(layout, 5);
    step(d, 1, { kind: 'stand' }); step(d, 0, { kind: 'stand' });
    // A repair point in the Weapons console's room: damage its tactical room and stand on its tile, which must also be in
    // reach of the console. Find such a point on the cutter; if none exists on this layout, use the Hound (hound.json) or
    // say in the report that no layout has one and replace this case with a direct test of the rule's two inputs.
    const room = d.interior.derived.stationRoom[d.weapons]!, p = d.points.find((q) => q.room === room)!;
    d.tactical.systems[0].rooms[p.tacticalRoom] = 1; put(d, 0, p.tile);
    expect(model(d, { mode: 'online' })!.tabs.weapons).toBe('locked');
    disposeDuel(d);
  });
  it('standing out of reach: online both consoles locked; single player opens the one the other character sits at', () => {
    const d = createDuel(layout, 5);
    step(d, 0, { kind: 'stand' });   // player 1 still at Weapons
    put(d, 0, 0);
    expect(model(d, { mode: 'online' })!.tabs).toEqual({ helm: 'locked', weapons: 'locked', ship: 'current' });
    expect(model(d)).toMatchObject({ tabs: { helm: 'locked', weapons: 'open', ship: 'current' }, tabActions: { weapons: 'switch' } });
    disposeDuel(d);
  });
});

describe('station panels', () => {
  it('Weapons: lock, charge, magazine, launch and the missile', () => {
    const d = createDuel(layout, 5);
    const w = model(d, { me: 1 })!.weapons!;
    expect(w.lock).toBe(d.tactical.systems[0].lock); expect(w.canLaunch).toBe(canLaunch(d.tactical, 0)); expect(w.missileFlying).toBe(false);
    expect(w.magazine).toMatch(/^\d+\/\d+$/);
    expect([w.charge.label, w.charge.value]).toEqual(['CHARGE', readoutRows({ duel: d, mode: 'weapons', active: 1, other: 'AT HELM' }).find((r) => r.label === 'CHARGE')!.value]);
    while (!canLaunch(d.tactical, 0)) step(d, 1, null);
    step(d, 1, { kind: 'missileLaunch' });
    const after = model(d, { me: 1 })!.weapons!; expect(after.missileFlying).toBe(true); expect(after.canLaunch).toBe(false);
    expect(model(d, { me: 1 })!.helm).toBeNull();
    disposeDuel(d);
  });
  it('Helm: heading in degrees and speed', () => {
    const d = createDuel(layout, 5), s = d.tactical.ships[0]!;
    s.heading = 64; s.vx = 3; s.vy = 4;
    expect(model(d)!.helm).toMatchObject({ heading: 90, speed: 5 });
    disposeDuel(d);
  });
  it('the side column from the map overlay', () => {
    const d = createDuel(layout, 5), overlay = { zoomText: 'ZOOM 0.90', scaleBar: { px: 90, units: 100 }, snapHint: true };
    expect(model(d, { me: 1, overlay })!.side).toEqual({ zoom: '0.90', free: true, snapLabel: 'CAMERA' });
    expect(model(d, { overlay })!.side!.snapLabel).toBe('SNAP');
    disposeDuel(d);
  });
  it('hidden gives null', () => {
    const d = createDuel(layout, 5); expect(model(d, { hidden: true })).toBeNull(); disposeDuel(d);
  });
});
```

The expected tab values are the spec's. If a fixture's seat or reach does not come out as its comment says (check the stand and sit sequences against `tests/duelControls.test.ts`), fix the fixture, not the expectation.

Add to `tests/tacticalModel.test.ts`, beside the `reserveRight: 230` case at line 132, a case with `{ reserveLeft: 228, reserveRight: 156 }`. Put an off-screen body to the left and assert its arrow's `x >= 228 + ARROW_MARGIN`. Add to `tests/duelWeaponsView.test.ts` a case where `reserveLeft: 228, reserveRight: 156` puts the info text's `x` at 676.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/consoleModel.test.ts tests/tacticalModel.test.ts tests/duelWeaponsView.test.ts`
Expected: FAIL. The modules and fields are missing.

- [ ] **Step 3: Implement**

`render/duel/consoleLayout.ts`:

```ts
// The Artemis-style console layout (spec 2026-11-17-artemis-consoles §2), internal 1280×720. Pure: shared by the
// components, the scene's map reserves and the tests.
import { INTERNAL_H, INTERNAL_W } from '../../../../shared/resolution';
import { READOUT_W } from './readoutModel';

export const EDGE = 12;
export const TABS = { x: 12, y: 8, w: 96, gap: 4, h: 26 } as const;
export const TABS_RIGHT = TABS.x + 3 * TABS.w + 2 * TABS.gap;
export const STATUS = { x: 12, y: 42, w: READOUT_W } as const;
export const STATION = { x: 12, w: 300, h: { helm: 200, weapons: 216 } } as const;
export function stationTop(s: 'helm' | 'weapons'): number { return INTERNAL_H - EDGE - STATION.h[s]; }
export const SIDE = { x: INTERNAL_W - EDGE - 132, y: 42, w: 132 } as const;
/** The map's off-screen arrows and the Weapons notice keep clear of the status table and the right column. */
export const CONSOLE_RESERVE = { left: STATUS.x + STATUS.w + EDGE, right: EDGE + SIDE.w + EDGE } as const;
```

`readoutModel.ts`: add `console?: boolean` to `ReadoutInput` with the doc comment `/** On an Artemis console (spec §2): no view heading (the tab strip says it) and no LASER block (the station block shows it). */`. In `readoutRows`, build the first row only when `!input.console`: change the array literal to start with `...(input.console ? [] : [heading(...)])`. Guard the weapons block with `if (input.mode === 'weapons' && !input.console)`. Move the CHARGE row's construction into an exported function, and use it there:

```ts
/** The laser's CHARGE row (FROZEN, HOLD n.n or a percentage, with its bar): the readout's and the Weapons station's. */
export function chargeRow(d: DuelState): ReadoutRow {
  const t = d.tactical, crewSys = t.systems[0], flying = missileOf(t, 0) !== null, full = crewSys.laserCharge >= LASER_CHARGE_UNITS;
  const value = flying ? 'FROZEN' : full ? `HOLD ${((LASER_HOLD_TICKS - crewSys.laserHold) / TICK_HZ).toFixed(1)}` : `${Math.floor((crewSys.laserCharge / LASER_CHARGE_UNITS) * 100)}%`;
  return em({ ...row('CHARGE', value, DIM, full && !flying ? GOOD : TEXT), bar: { fill: crewSys.laserCharge / LASER_CHARGE_UNITS, colour: full ? GOOD : AMBER } }, full && !flying ? 'good' : null);
}
```

`interiorModel.ts`: `export const INTERIOR_BAND = { x: 0, y: 42, w: INTERNAL_W - READOUT_COLUMN, h: INTERNAL_H - 42 } as const;`. Update its comment: `the whole screen left of the readout column, below the console tab strip (Artemis spec §2)`. Run `tests/duelInterior.test.ts`, `tests/interiorCamera.test.ts`, `tests/interiorZoomScene.test.ts` and `tests/lightsModel.test.ts`. An assertion that fixes a pixel position derived from the old band (for example `interiorZoomScene.test.ts:64`) may change; update only such derived numbers, recomputed from `INTERIOR_BAND`, and say which in the commit message.

`tacticalModel.ts`: add to `TacticalModelInput`, after `reserveRight`:
```ts
  /** Screen pixels on the left kept clear of off-screen arrows (the Artemis console's status table); default 0. */
  reserveLeft?: number;
```
In `edgePoint`, add a `reserveLeft: number` parameter after `vp`, and use `l = reserveLeft + m`. In `spreadArrows`, add `reserveLeft = 0` as a fourth parameter, and use `lo = flat ? reserveLeft + m : top`. Update the two call sites (L281, L292) to pass `input.reserveLeft ?? 0`.
`weaponsModel.ts:88`: `x: ((input.reserveLeft ?? 0) + vp.w - input.reserveRight) / 2`.

`render/duel/consoleModel.ts`:

```ts
// The Artemis-style console's view model (spec 2026-11-17-artemis-consoles §4, §6.1, §6.3). Pure: built each frame by
// the scene from the duel, the local character and the merged held keys; null hides the console.
import { consoleInReach, repairInReach, seatOf } from '../../app/duel/controls';
import { NO_HELD_FLAGS, type HeldFlags, type KeyAction } from '../../app/duel/input';
import type { DuelState } from '../../sim/duel/state';
import { missileOf } from '../../sim/tactical/state';
import { HEADING_COUNT, MAGAZINE } from '../../sim/tactical/tuning';
import { canLaunch } from '../../sim/tactical/weapons';
import type { MapOverlayView } from '../../ui/views';
import { chargeRow, type ReadoutRow } from './readoutModel';

export type ConsoleStation = 'helm' | 'weapons' | 'ship';
export type TabState = 'current' | 'open' | 'locked';
export interface HelmPanel { heading: number; speed: number; held: HeldFlags }
export interface WeaponsPanel { lock: number; charge: ReadoutRow; magazine: string; canLaunch: boolean; missileFlying: boolean; fireHeld: boolean; held: HeldFlags }
export interface ConsoleView {
  station: ConsoleStation;
  tabs: Record<ConsoleStation, TabState>;
  /** What a click on an open tab does: E (sit), Tab (take the other character) or X (stand). */
  tabActions: Record<ConsoleStation, KeyAction | null>;
  helm: HelmPanel | null;
  weapons: WeaponsPanel | null;
  side: { zoom: string; free: boolean; snapLabel: 'SNAP' | 'CAMERA' } | null;
}
export interface ConsoleModelInput { duel: DuelState; me: 0 | 1; mode: 'single' | 'online'; hidden: boolean; held: HeldFlags; overlay: MapOverlayView | null }

export function consoleModel(i: ConsoleModelInput): ConsoleView | null {
  if (i.hidden) return null;
  const d = i.duel, seat = seatOf(d, i.me), station: ConsoleStation = seat === 'standing' ? 'ship' : seat;
  const tabs: Record<ConsoleStation, TabState> = { helm: 'locked', weapons: 'locked', ship: 'locked' };
  const tabActions: Record<ConsoleStation, KeyAction | null> = { helm: null, weapons: null, ship: null };
  if (seat === 'standing') {
    tabs.ship = 'current';
    const c = consoleInReach(d, i.me);
    if (c >= 0 && repairInReach(d, i.me) < 0) { const k = c === d.nav ? 'helm' : 'weapons'; tabs[k] = 'open'; tabActions[k] = 'interact'; }
  } else { tabs[seat] = 'current'; tabs.ship = 'open'; tabActions.ship = 'stand'; }
  if (i.mode === 'single') {
    const os = seatOf(d, i.me === 0 ? 1 : 0);
    if (os !== 'standing' && tabs[os] === 'locked') { tabs[os] = 'open'; tabActions[os] = 'switch'; }
  }
  const t = d.tactical, held = i.held ?? NO_HELD_FLAGS;
  const ship = t.ships[0]!;
  const helm: HelmPanel | null = station === 'helm'
    ? { heading: ((Math.round((ship.heading / HEADING_COUNT) * 360) % 360) + 360) % 360, speed: Math.round(Math.hypot(ship.vx, ship.vy)), held }
    : null;
  const flying = missileOf(t, 0) !== null, sys = t.systems[0];
  const weapons: WeaponsPanel | null = station === 'weapons'
    ? { lock: sys.lock, charge: chargeRow(d), magazine: `${sys.magazine}/${MAGAZINE}`, canLaunch: canLaunch(t, 0), missileFlying: flying, fireHeld: held.fire, held }
    : null;
  const side = i.overlay && station !== 'ship'
    ? { zoom: i.overlay.zoomText.replace(/^ZOOM\s+/, ''), free: i.overlay.snapHint, snapLabel: station === 'weapons' ? 'CAMERA' as const : 'SNAP' as const }
    : null;
  return { station, tabs, tabActions, helm, weapons, side };
}
```

Check that `render/` already imports from `app/duel/controls` somewhere, or that nothing forbids it: `git grep -n "app/duel" -- src/renderer/src/render`. If a lint or architecture test forbids render → app imports, move `HeldFlags`/`NO_HELD_FLAGS` to `render/duel/consoleModel.ts`, have `input.ts` import them from there, and say so in the report.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/consoleModel.test.ts tests/tacticalModel.test.ts tests/duelWeaponsView.test.ts tests/duelReadout.test.ts tests/crtReadout.test.ts tests/duelInterior.test.ts tests/interiorCamera.test.ts tests/interiorZoomScene.test.ts tests/lightsModel.test.ts tests/crtBezel.test.ts tests/tacticalLayer.test.ts`
Expected: all PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b`. Expected: no errors.

```bash
git add src/renderer/src/render tests/consoleModel.test.ts tests/tacticalModel.test.ts tests/duelWeaponsView.test.ts tests/duelInterior.test.ts tests/interiorZoomScene.test.ts tests/interiorCamera.test.ts tests/lightsModel.test.ts
git commit -m "feat(artemis-i): console layout and view model, console readout rows, left map reserve, interior band below the tabs (spec §2, §6.1, §6.3)"
```

---

### Task 3: The shared `<Button>`

**Files:**
- Create: `src/renderer/src/ui/stage/Button.tsx`
- Test: `tests/uiButton.test.tsx` (create)

**Interfaces:**
- Produces:
  ```ts
  export type ButtonLook = 'idle' | 'hover' | 'lit' | 'disabled';
  export function buttonColours(look: ButtonLook, crt: boolean): { outline: number; fill: number | null; text: number };
  export interface ButtonProps { name: string; x: number; y: number; w: number; h: number; label: string; hint?: string;
    lit?: boolean; disabled?: boolean; onPress?(): void; onHold?(on: boolean): void }
  export const Button: React.MemoExoticComponent<(p: ButtonProps) => JSX.Element>;
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// Spec 2026-11-17-artemis-consoles §3: the console button's looks and its pointer rules.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { Button, buttonColours } from '../src/renderer/src/ui/stage/Button';
import { CRT } from '../src/renderer/src/render/tactical/crtTheme';
import { AMBER, PANEL_FILL } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => cleanup());
function mount(el: React.ReactElement) {
  const ui = makeUi();
  const r = render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}>{el}</UiContext.Provider>);
  return { ...r, el: () => document.querySelector('[data-testid="console-fire"]') as HTMLElement };
}

describe('Button (spec §3)', () => {
  it('colours by look and screen', () => {
    expect(buttonColours('lit', true)).toEqual({ outline: CRT.main, fill: CRT.main, text: CRT.glass });
    expect(buttonColours('disabled', true)).toMatchObject({ outline: CRT.faint, text: CRT.faint });
    expect(buttonColours('lit', false)).toEqual({ outline: AMBER, fill: AMBER, text: PANEL_FILL });
  });
  it('is not focusable and takes pointer events', () => {
    const { el } = mount(<Button name="fire" x={10} y={10} w={80} h={22} label="FIRE" onPress={() => {}} />);
    expect(el().getAttribute('role')).toBe('button'); expect(el().hasAttribute('tabindex')).toBe(false);
    expect(el().style.pointerEvents).toBe('auto');
  });
  it('a press acts on a primary pointerdown only', () => {
    const onPress = vi.fn(); const { el } = mount(<Button name="fire" x={0} y={0} w={80} h={22} label="FIRE" onPress={onPress} />);
    fireEvent.pointerDown(el(), { button: 2 }); fireEvent.pointerDown(el(), { button: 1 }); expect(onPress).not.toHaveBeenCalled();
    fireEvent.pointerDown(el(), { button: 0 }); expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('prevents the context menu and middle-click defaults', () => {
    const { el } = mount(<Button name="fire" x={0} y={0} w={80} h={22} label="FIRE" onPress={() => {}} />);
    for (const type of ['contextmenu', 'auxclick', 'mousedown']) {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 1 }); el().dispatchEvent(e); expect(e.defaultPrevented).toBe(true);
    }
  });
  it('a hold releases exactly once: on pointerup, pointercancel, lost capture and unmount', () => {
    for (const end of ['pointerUp', 'pointerCancel', 'lostPointerCapture', 'unmount'] as const) {
      const onHold = vi.fn(); const r = mount(<Button name="fire" x={0} y={0} w={80} h={22} label="FIRE" onHold={onHold} />);
      fireEvent.pointerDown(r.el(), { button: 0, pointerId: 1 });
      if (end === 'unmount') r.unmount(); else { fireEvent[end](r.el(), { pointerId: 1 }); fireEvent.pointerUp(document.body); }
      expect([end, onHold.mock.calls]).toEqual([end, [[true], [false]]]);
      cleanup();
    }
  });
  it('a hold whose button becomes disabled releases', () => {
    const onHold = vi.fn();
    const r = mount(<Button name="fire" x={0} y={0} w={80} h={22} label="FIRE" onHold={onHold} />);
    fireEvent.pointerDown(r.el(), { button: 0 });
    const ui = makeUi();
    act(() => r.rerender(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><Button name="fire" x={0} y={0} w={80} h={22} label="FIRE" disabled onHold={onHold} /></UiContext.Provider>));
    expect(onHold.mock.calls).toEqual([[true], [false]]);
  });
  it('draws the label and a right-aligned key hint', () => {
    mount(<Button name="fire" x={10} y={10} w={120} h={22} label="FIRE" hint="SPC" onPress={() => {}} />);
    const t = [...document.querySelectorAll('canvas')].map((c) => (c as HTMLCanvasElement).dataset.text);
    expect(t).toEqual(expect.arrayContaining(['FIRE', 'SPC']));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/uiButton.test.tsx`
Expected: FAIL. The module is missing.

- [ ] **Step 3: Implement `ui/stage/Button.tsx`**

```tsx
// The console button (spec 2026-11-17-artemis-consoles §3): an outlined box with a FONT_NATIVE label and key hint, in
// the CRT ramp or the theme. It never takes focus (no tabIndex), so Space and Enter stay the duel's; only buttons take
// pointer events on the stage. A press acts on a primary pointerdown; a hold is held until pointerup, pointercancel,
// lost capture, disable or unmount, and released exactly once.
import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import { AMBER, BAR_OFF, DIM, FONT_NATIVE, PANEL_FILL, TEXT } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { useUi } from '../context';
import { hex } from './color';
import { useCrt } from './CrtContext';
import { boxCss } from './geometry';
import { PixelText } from './PixelText';

export type ButtonLook = 'idle' | 'hover' | 'lit' | 'disabled';
export function buttonColours(look: ButtonLook, crt: boolean): { outline: number; fill: number | null; text: number } {
  if (crt) {
    if (look === 'lit') return { outline: CRT.main, fill: CRT.main, text: CRT.glass };
    if (look === 'hover') return { outline: CRT.main, fill: null, text: CRT.hot };
    if (look === 'disabled') return { outline: CRT.faint, fill: null, text: CRT.faint };
    return { outline: CRT.mid, fill: null, text: CRT.main };
  }
  if (look === 'lit') return { outline: AMBER, fill: AMBER, text: PANEL_FILL };
  if (look === 'hover') return { outline: AMBER, fill: null, text: AMBER };
  if (look === 'disabled') return { outline: BAR_OFF, fill: null, text: DIM };
  return { outline: DIM, fill: null, text: TEXT };
}

export interface ButtonProps { name: string; x: number; y: number; w: number; h: number; label: string; hint?: string; lit?: boolean; disabled?: boolean; onPress?(): void; onHold?(on: boolean): void }
const PAD_X = 6;

export const Button = memo(function Button(p: ButtonProps) {
  const l = useUi((s) => s.layout), { crt } = useCrt(), [hover, setHover] = useState(false);
  const holding = useRef(false), onHold = useRef(p.onHold);
  onHold.current = p.onHold;
  const release = (): void => { if (holding.current) { holding.current = false; onHold.current?.(false); } };
  useEffect(() => release, []);
  useEffect(() => { if (p.disabled) release(); }, [p.disabled]);
  const look: ButtonLook = p.disabled ? 'disabled' : p.lit ? 'lit' : hover ? 'hover' : 'idle', c = buttonColours(look, crt);
  const hair = Math.max(1, Math.round(l.scale * l.dpr)) / l.dpr;
  const stop = (e: SyntheticEvent): void => e.preventDefault();
  const down = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (e.button !== 0 || p.disabled) return;
    if (p.onHold) {
      if (holding.current) return;
      holding.current = true;
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* no capture in this environment */ }
      p.onHold(true);
    } else p.onPress?.();
  };
  const ty = p.y + Math.round((p.h - FONT_NATIVE) / 2);
  return (
    <>
      <div data-testid={`console-${p.name}`} role="button" aria-disabled={p.disabled || undefined} data-ui-button={look}
        onPointerDown={down} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
        onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
        onMouseDown={stop} onContextMenu={stop} onAuxClick={stop}
        style={{ position: 'absolute', boxSizing: 'border-box', ...boxCss(p.x, p.y, p.w, p.h, l), pointerEvents: 'auto', cursor: p.disabled ? 'default' : 'pointer',
          border: `${hair}px solid ${hex(c.outline)}`, background: c.fill === null ? 'transparent' : hex(c.fill) }} />
      {p.hint
        ? <><PixelText text={p.label} x={p.x + PAD_X} y={ty} size={FONT_NATIVE} tint={c.text} />
            <PixelText text={p.hint} x={p.x + p.w - PAD_X} y={ty} size={FONT_NATIVE} tint={look === 'lit' ? c.text : crt ? CRT.mid : DIM} anchorX={1} /></>
        : <PixelText text={p.label} x={p.x + p.w / 2} y={ty} size={FONT_NATIVE} tint={c.text} anchorX={0.5} />}
    </>
  );
});
```

The label and hint canvases are siblings of the button `div`. They inherit the stage's `pointer-events: none`, so clicks land on the `div` beneath them.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/uiButton.test.tsx`
Expected: PASS. If jsdom's `fireEvent.pointerDown` drops `button` (when no `PointerEvent` exists), stub one in the test file's top: `if (!('PointerEvent' in window)) (window as any).PointerEvent = class extends MouseEvent { pointerId: number; constructor(t: string, i: PointerEventInit = {}) { super(t, i); this.pointerId = i.pointerId ?? 0; } };`. Do not change the component for jsdom.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ui/stage/Button.tsx tests/uiButton.test.tsx
git commit -m "feat(artemis-i): the console button (spec §3)"
```

---

### Task 4: The console components and the duel region

**Files:**
- Create: `src/renderer/src/ui/duel/TabStrip.tsx`, `SideColumn.tsx`, `HelmStation.tsx`, `WeaponsStation.tsx`
- Modify: `src/renderer/src/ui/views.ts:10`, `src/renderer/src/ui/actions.ts` (add `console`, `setConsole`), `src/renderer/src/ui/duel/ReadoutPanel.tsx:18-71`, `src/renderer/src/ui/duel/MapOverlay.tsx:15-30`, `src/renderer/src/ui/duel/DuelUi.tsx:15-32`
- Test: `tests/uiConsole.test.tsx` (create)

**Interfaces:**
- Consumes: `ConsoleView`, `HelmPanel`, `WeaponsPanel`, layout constants (Task 2); `Button` (Task 3); `ConsoleInput`, `HoldCode`, `KeyAction` (Task 1).
- Produces:
  ```ts
  // views.ts: DuelUiView gains `console?: ConsoleView | null` (absent or null: today's screen)
  // actions.ts: createUiActions(...) returns also
  //   console: ConsoleInput            forwards to the slot; a no-op while empty
  //   setConsole(input: ConsoleInput | null): void
  // ReadoutPanel props gain `placement?: 'column' | 'status'` (default 'column')
  // MapOverlay props gain `placement?: 'column' | 'console'` (default 'column')
  ```

- [ ] **Step 1: Write the failing test**

`tests/uiConsole.test.tsx`. Mount as `tests/uiDuel.test.tsx` does (`makeUi`, `createDuelSink`, `UiRoot`). The fixtures are plain `ConsoleView` objects.

```tsx
// @vitest-environment jsdom
// Spec 2026-11-17-artemis-consoles §2, §4, §6.2: the console's pieces and their clicks.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { STATUS } from '../src/renderer/src/render/duel/consoleLayout';
import { PAD, TEXT } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => ({ text: c.dataset.text!, x: Number(c.dataset.x), y: Number(c.dataset.y) }));
const find = (t: string) => texts().find((c) => c.text === t);
const btn = (name: string) => document.querySelector(`[data-testid="console-${name}"]`) as HTMLElement;
const charge = { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: TEXT } };
const weaponsConsole: ConsoleView = {
  station: 'weapons', tabs: { helm: 'open', weapons: 'current', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, ship: 'stand' },
  helm: null, weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS },
  side: { zoom: '0.90', free: false, snapLabel: 'CAMERA' }
};
const helmConsole: ConsoleView = { ...weaponsConsole, station: 'helm', tabs: { helm: 'current', weapons: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, ship: 'stand' },
  weapons: null, helm: { heading: 55, speed: 142, held: { ...NO_HELD_FLAGS, up: true } }, side: { zoom: '0.90', free: true, snapLabel: 'SNAP' } };
const view = (console: ConsoleView | null): DuelUiView => ({
  readout: { rows: [{ label: 'HULL', value: '10/40', labelTint: TEXT, valueTint: TEXT }], help: ['TAB  SWITCH'] }, end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: { zoomText: 'ZOOM 0.90', scaleBar: { px: 90, units: 100 }, snapHint: false }, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn() };
  ui.actions.setConsole(input);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { ...ui, duel, input };
}

describe('the console screen (spec §2)', () => {
  it('without a console: today’s right-hand readout and help', () => {
    const { duel } = mount(); act(() => duel.frame(view(null)));
    expect(find('TAB  SWITCH')).toBeDefined(); expect(btn('tab-helm')).toBeNull();
  });
  it('on Weapons: tabs, the status table on the left without help, the station and the side column', () => {
    const { duel } = mount(); act(() => duel.frame(view(weaponsConsole)));
    expect(find('HULL')).toMatchObject({ x: STATUS.x + PAD });
    expect(find('TAB  SWITCH')).toBeUndefined();
    for (const n of ['tab-helm', 'tab-weapons', 'tab-ship', 'fire', 'lock-0', 'lock-1', 'lock-2', 'launch', 'steer-left', 'steer-right', 'zoom-in', 'zoom-out', 'snap'])
      expect([n, btn(n)]).not.toEqual([n, null]);
    expect(btn('tab-weapons').dataset.uiButton).toBe('lit'); expect(btn('lock-1').dataset.uiButton).toBe('lit');
    expect(btn('steer-left').dataset.uiButton).toBe('disabled');
    expect(find('ZOOM 0.90')).toBeUndefined(); expect(find('0.90')).toBeDefined(); expect(find('CAMERA')).toBeDefined();
  });
  it('on the Helm: THRUST, REV and turn holds; 100 lit while W is held', () => {
    const { duel } = mount(); act(() => duel.frame(view(helmConsole)));
    for (const n of ['thrust', 'reverse', 'turn-left', 'turn-right']) expect([n, btn(n)]).not.toEqual([n, null]);
    expect(document.querySelector('[data-ui-throttle="100"]')?.getAttribute('data-ui-lit')).toBe('1');
    expect(document.querySelector('[data-ui-throttle="STOP"]')?.getAttribute('data-ui-lit')).toBe('0');
    expect(btn('tab-weapons').dataset.uiButton).toBe('disabled'); expect(btn('snap').dataset.uiButton).toBe('lit');
  });
});

describe('clicks reach the keyboard (spec §6.2)', () => {
  it('FIRE holds Space; LAUNCH presses F; a lock room locks; tabs press their action; zoom presses keys', () => {
    const { duel, input } = mount(); act(() => duel.frame(view(weaponsConsole)));
    fireEvent.pointerDown(btn('fire'), { button: 0 }); fireEvent.pointerUp(btn('fire'));
    expect(input.hold.mock.calls).toEqual([['Space', true], ['Space', false]]);
    fireEvent.pointerDown(btn('launch'), { button: 0 }); expect(input.press).toHaveBeenCalledWith('launch');
    fireEvent.pointerDown(btn('lock-2'), { button: 0 }); expect(input.lock).toHaveBeenCalledWith(2);
    fireEvent.pointerDown(btn('tab-helm'), { button: 0 }); expect(input.press).toHaveBeenCalledWith('switch');
    fireEvent.pointerDown(btn('tab-ship'), { button: 0 }); expect(input.press).toHaveBeenCalledWith('stand');
    fireEvent.pointerDown(btn('zoom-in'), { button: 0 }); expect(input.press).toHaveBeenCalledWith('zoomIn');
    fireEvent.pointerDown(btn('snap'), { button: 0 }); expect(input.press).toHaveBeenCalledWith('camera');
  });
  it('a locked tab and a disabled LAUNCH do nothing', () => {
    const { duel, input } = mount();
    act(() => duel.frame(view({ ...weaponsConsole, tabs: { ...weaponsConsole.tabs, helm: 'locked' }, tabActions: { ...weaponsConsole.tabActions, helm: null },
      weapons: { ...weaponsConsole.weapons!, canLaunch: false } })));
    fireEvent.pointerDown(btn('tab-helm'), { button: 0 }); fireEvent.pointerDown(btn('launch'), { button: 0 });
    expect(input.press).not.toHaveBeenCalled();
  });
  it('the console going away releases a held button', () => {
    const { duel, input } = mount(); act(() => duel.frame(view(weaponsConsole)));
    fireEvent.pointerDown(btn('fire'), { button: 0 });
    act(() => duel.frame(view(null)));
    expect(input.hold.mock.calls).toEqual([['Space', true], ['Space', false]]);
  });
  it('with no console input set, clicks are no-ops', () => {
    const { duel, actions } = mount(); actions.setConsole(null); act(() => duel.frame(view(weaponsConsole)));
    expect(() => fireEvent.pointerDown(btn('launch'), { button: 0 })).not.toThrow();
  });
});
```

Add the same `PointerEvent` stub as Task 3 if jsdom needs it.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/uiConsole.test.tsx`
Expected: FAIL. `setConsole` is missing.

- [ ] **Step 3: Implement**

`views.ts`: import `type { ConsoleView }` from `'../render/duel/consoleModel'`. Add `console?: ConsoleView | null` to `DuelUiView`, documented as `/** The Artemis console (spec 2026-11-17-artemis-consoles §6.1); absent or null draws today's screen. */`.

`actions.ts`: import `type { ConsoleInput }` from `'../app/duel/input'`. Inside `createUiActions`, before `return`:
```ts
  // The console's clicks (Artemis spec §6.2) go to the duel mode's keyboard while one is set; a no-op otherwise.
  let consoleInput: ConsoleInput | null = null;
  const consoleActions: ConsoleInput = {
    press: (action) => consoleInput?.press(action),
    hold: (code, on) => consoleInput?.hold(code, on),
    lock: (room) => consoleInput?.lock(room)
  };
```
and in the returned object:
```ts
    console: consoleActions,
    setConsole(input: ConsoleInput | null): void { consoleInput = input; },
```

`ReadoutPanel.tsx`: add a `placement?: 'column' | 'status'` prop. `X`/`Y` become per-render: `const X = placement === 'status' ? STATUS.x : INTERNAL_W - READOUT_W - READOUT_MARGIN, Y = placement === 'status' ? STATUS.y : READOUT_MARGIN;`. Keep the module-level `export const INVERSE_*`. Help lines draw only when `placement !== 'status'`. Every other line is unchanged.

`MapOverlay.tsx`: add `placement?: 'column' | 'console'`. On `'console'`, draw only the scale bar and its units, at the bottom right: the bar's right end at `INTERNAL_W - 16 - (units label width)`. Use `const bx = INTERNAL_W - 16 - textPx(\`${units} u\`, 1) - 8 - px` and then the same boxes and label as today, with `bx` in place of `BX`. Do not draw the zoom text or the snap hint, since the side column shows them. `'column'` is today's output, unchanged.

`TabStrip.tsx`:
```tsx
// The console's tab strip (spec 2026-11-17-artemis-consoles §2, §6.3): HELM, WEAPONS, SHIP; current lit, open clickable, locked disabled.
import { memo } from 'react';
import type { ConsoleView, ConsoleStation } from '../../render/duel/consoleModel';
import { TABS } from '../../render/duel/consoleLayout';
import { useActions } from '../context';
import { Button } from '../stage/Button';

const ORDER: readonly [ConsoleStation, string][] = [['helm', 'HELM'], ['weapons', 'WEAPONS'], ['ship', 'SHIP']];
export const TabStrip = memo(function TabStrip({ tabs, tabActions }: Pick<ConsoleView, 'tabs' | 'tabActions'>) {
  const actions = useActions();
  return <>{ORDER.map(([k, label], n) => {
    const a = tabActions[k];
    return <Button key={k} name={`tab-${k}`} x={TABS.x + n * (TABS.w + TABS.gap)} y={TABS.y} w={TABS.w} h={TABS.h} label={label}
      lit={tabs[k] === 'current'} disabled={tabs[k] === 'locked'} onPress={a && tabs[k] === 'open' ? () => actions.console.press(a) : undefined} />;
  })}</>;
});
```

`SideColumn.tsx`: a `Panel` at `SIDE.x, SIDE.y, SIDE.w` and height 96. A `ZOOM` heading (FONT_NATIVE, CRT `mid` / DIM) at `(SIDE.x + 8, SIDE.y + 6)`. A row at y `SIDE.y + 28`: `<Button name="zoom-out" label="-" hint=undefined>` 24 wide at `SIDE.x + 8`; the zoom value (FONT_SIZE, CRT `main` / TEXT) centred at `SIDE.x + SIDE.w / 2`; `<Button name="zoom-in" label="+">` 24 wide at `SIDE.x + SIDE.w - 8 - 24`. Then `<Button name="snap" label={side.snapLabel} hint="C" lit={side.free}>` at `(SIDE.x + 8, SIDE.y + 60, SIDE.w - 16, 24)`. Presses: `zoomOut`, `zoomIn`, `camera`. Wrap it in `memo`. The header comment cites spec §2 "Right column".

`WeaponsStation.tsx` (spec §4.1), a `Panel` at `(STATION.x, stationTop('weapons'), STATION.w, STATION.h.weapons)`. Let `x0 = STATION.x + 8` and `y0 = stationTop('weapons') + 6`:
- `LASER` heading (FONT_NATIVE, CRT `mid` / DIM) at `(x0, y0)`.
- The CHARGE line at `y0 + 18`: label `CHARGE` (FONT_SIZE) at `x0`; the `<Bar>` at `(x0 + 84, y0 + 30, 120, 6)` with `fill = charge.bar.fill`, colour CRT `main`/`hot` by `crtRowLook(charge, now)` (exported from `ReadoutPanel.tsx`) or `charge.bar.colour` off the CRT; the value right-anchored at `STATION.x + STATION.w - 8`.
- `<Button name="fire" label="FIRE" hint="SPC" onHold={(on) => actions.console.hold('Space', on)} lit={weapons.fireHeld}>` at `(x0, y0 + 48, 132, 24)`.
- At `y0 + 80`: `LOCK` (FONT_NATIVE) at `x0`. Then three buttons `lock-0` `WEAP`, `lock-1` `SHLD`, `lock-2` `ENG`, each 52 wide, 4 apart, from `x0 + 40`. `lit={weapons.lock === r}`, `onPress={() => actions.console.lock(r)}`. Then the hint text `E/Q` (FONT_NATIVE, CRT `mid`/DIM) right-anchored at `STATION.x + STATION.w - 8`.
- A divider: a 1-high `Box` at `y0 + 112` across `x0 … STATION.x + STATION.w - 8`, in CRT `dim` / BAR_OFF.
- `MISSILE` heading at `(x0, y0 + 118)`. `MAG {magazine}` (FONT_SIZE) at `(x0, y0 + 134)`, with `FLYING` after it (CRT `hot` / AMBER) when `missileFlying`. `<Button name="launch" label="LAUNCH" hint="F" disabled={!weapons.canLaunch} onPress={() => actions.console.press('launch')}>` at `(STATION.x + STATION.w - 8 - 120, y0 + 134, 120, 24)`.
- At `y0 + 170`: `STEER` (FONT_NATIVE) at `x0`. `<Button name="steer-left" label="<" hint="A">` and `<Button name="steer-right" label=">" hint="D">`, each 64 wide, at `x0 + 52` and `x0 + 120`. Both have `disabled={!weapons.missileFlying}`, `lit={held.left}` / `lit={held.right}`, and `onHold` → `hold('KeyA'|'KeyD', on)`.
The last row ends at `y0 + 194 ≤ stationTop + 216`.

`HelmStation.tsx` (spec §4.2, "Artemis-i"), a `Panel` at `(STATION.x, stationTop('helm'), STATION.w, STATION.h.helm)`. Let `x0 = STATION.x + 8` and `y0 = stationTop('helm') + 6`:
- `THROTTLE` heading at `(x0, y0)`. Six notch rows from `y0 + 18`, 26 apart, labelled top to bottom `100`, `75`, `50`, `25`, `STOP`, `REV`. Each row has its label (FONT_NATIVE) at `x0`, and a 14×20 `Box` at `x0 + 40` with `data-ui-throttle={label}` and `data-ui-lit` `'1'` or `'0'`. Lit fill CRT `main`/AMBER; unlit fill CRT `faint`/BAR_OFF; a hairline outline in CRT `mid`/DIM. Lit rule for Artemis-i: `100` when `held.up && !held.down`; `REV` when `held.down && !held.up`; `STOP` otherwise. The other notches are never lit in Artemis-i. A `<` (FONT_SIZE) after the lit notch at `x0 + 60`.
- A vertical 1-wide divider `Box` at `STATION.x + 130` from `y0` to `y0 + 186`.
- The right half from `rx = STATION.x + 140`: `HDG {heading padded to 3}` heading at `(rx, y0)`; `SPD {speed}` (FONT_SIZE) at `(rx, y0 + 18)`.
- `<Button name="thrust" label="THRUST" hint="W">` at `(rx, y0 + 52, 148, 24)` and `<Button name="reverse" label="REV" hint="S">` at `(rx, y0 + 82, 148, 24)`. `onHold` → `hold('KeyW'|'KeyS', on)`; `lit={held.up}` / `lit={held.down}`.
- `<Button name="turn-left" label="<" hint="A">` at `(rx, y0 + 122, 70, 24)` and `<Button name="turn-right" label=">" hint="D">` at `(rx + 78, y0 + 122, 70, 24)`. `onHold` → `hold('KeyA'|'KeyD', on)`; `lit={held.left}` / `lit={held.right}`.
- The hint text `HOLD TO TURN` (FONT_NATIVE, CRT `mid`/DIM) at `(rx, y0 + 156)`.

All four new components are `memo` and read the CRT tones through `useCrt()`. Every off-CRT colour comes from `render/theme`.

`DuelUi.tsx`: inside `<CrtGlow>`, replace the readout and overlay lines with:
```tsx
          {duel.overlay && <MapOverlay overlay={duel.overlay} placement={duel.console && duel.console.station !== 'ship' ? 'console' : 'column'} />}
          <ReadoutPanel rows={duel.readout.rows} help={duel.readout.help} placement={duel.console && duel.console.station !== 'ship' ? 'status' : 'column'} />
          {duel.console && <TabStrip tabs={duel.console.tabs} tabActions={duel.console.tabActions} />}
          {duel.console?.side && <SideColumn side={duel.console.side} />}
          {duel.console?.helm && <HelmStation helm={duel.console.helm} />}
          {duel.console?.weapons && <WeaponsStation weapons={duel.console.weapons} />}
          <Banners banners={duel.banners} />
```
Update the file's header comment to mention the console (Artemis spec §2).

- [ ] **Step 4: Run the UI tests**

Run: `npx vitest run tests/uiConsole.test.tsx tests/uiDuel.test.tsx tests/uiCrt.test.tsx tests/uiSinks.test.ts tests/uiActions.test.ts tests/uiProbe.test.ts tests/uiButton.test.tsx`
Expected: all PASS. The existing UI tests pass unchanged because `console` is absent in their fixtures.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc -b`. Expected: no errors.

```bash
git add src/renderer/src/ui tests/uiConsole.test.tsx
git commit -m "feat(artemis-i): tab strip, status table, Helm and Weapons stations and the side column, clickable through actions.console (spec §2, §4, §6.2)"
```

---

### Task 5: The scene and the modes draw the console and route its clicks

**Files:**
- Modify: `src/renderer/src/app/duel/scene.ts:25-117`, `src/renderer/src/app/duel/runtime.ts` (the `DuelRuntime` interface near L40-50, `play()` L303-347, the returned object L349-400), `src/renderer/src/app/duel/onlineSource.ts:75-155`, `src/renderer/src/app/duel/onlineDuel.ts` (deps L33-43, `play()` L162-185, `pump()` L186-209, `frame()` L236-248), `src/renderer/src/app/duel/duelMode.ts:16-82`, `src/renderer/src/main.ts:84-93,179`
- Test: extend `tests/duelRuntime.test.ts`, `tests/onlineDuelSession.test.ts`, `tests/sceneUi.test.ts`

**Interfaces:**
- Consumes: `consoleModel`, `CONSOLE_RESERVE` (Task 2); `KeySample.held`, `KeySample.lockTo`, `DuelKeyboard.ui`, `clearUi()`, `HeldFlags`, `NO_HELD_FLAGS`, `ConsoleInput` (Task 1); `actions.setConsole` (Task 4).
- Produces:
  ```ts
  // scene.ts
  //   DuelViewSource gains:  readonly mode: 'single' | 'online';  uiHeld(): HeldFlags;
  //   scene.draw(...) now returns ConsoleStation | null (the station of the console drawn, null when none)
  //   exported: export function consoleHidden(d: DuelState, overlay: SceneOverlay, paused: boolean): boolean
  // DuelModeDeps and OnlineDuelDeps gain:  setConsole?(input: ConsoleInput | null): void
  ```

- [ ] **Step 1: Write the failing tests**

In `tests/sceneUi.test.ts`, add:
```ts
describe('consoleHidden (Artemis spec §6.1)', () => {
  it('hides on a banner, a dimmed layer, a pause or a decided round', () => {
    // a running duel d (as the file's other tests build one); overlay { banner: null, layerPaused: false, end: null }
    expect(consoleHidden(d, { banner: null, layerPaused: false, end: null }, false)).toBe(false);
    expect(consoleHidden(d, { banner: 'PAUSED', layerPaused: false, end: null }, false)).toBe(true);
    expect(consoleHidden(d, { banner: null, layerPaused: true, end: null }, false)).toBe(true);
    expect(consoleHidden(d, { banner: null, layerPaused: false, end: null }, true)).toBe(true);
    // with d.tactical.outcome set to a decided Outcome: true
  });
});
```

In `tests/duelRuntime.test.ts`, use its existing harness, which drives the runtime with fake `sampleKeys`. Add:
- **A lock click on Weapons:** a sample with `lockTo: 2` while the active character sits at Weapons queues `laserLock {room: 2}`. After the next tick, `d.tactical.systems[0].lock === 2`. The same `lockTo` while at the Helm changes nothing.
- **`uiHeld()`:** it returns the last frame's `k.held` (or `NO_HELD_FLAGS` when absent), and `mode === 'single'`.

In `tests/onlineDuelSession.test.ts`, use its existing harness. Add:
- **A lock click on Weapons:** a pump whose keyboard sample has `lockTo: 2` at Weapons sends `laserLock {room: 2}`. A `lockTo` equal to the current lock sends nothing.
- **`setConsole`:** the session calls `deps.setConsole` with its keyboard's `ui` on creation and with `null` on dispose.

For the clear-on-change rule, add to `tests/duelRuntime.test.ts` (or a new `tests/duelModeConsole.test.ts` if the mode is easier to drive there) a test of the mode-level helper below, `consoleChange`:
```ts
it('clearUi runs when the drawn console station changes or goes null, not every frame', () => {
  const clearUi = vi.fn(); const track = consoleChange(clearUi);
  track('weapons'); track('weapons'); expect(clearUi).toHaveBeenCalledTimes(1);   // the first value counts as a change from undefined
  track(null); track(null); track('helm'); expect(clearUi).toHaveBeenCalledTimes(3);
});
```
Export `consoleChange` from `scene.ts`:
```ts
/** Calls `clearUi` whenever the drawn console's station changes or the console goes (Artemis spec §6.2). */
export function consoleChange(clearUi: () => void): (station: ConsoleStation | null) => void {
  let last: ConsoleStation | null | undefined;
  return (station) => { if (station !== last) { last = station; clearUi(); } };
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/sceneUi.test.ts tests/duelRuntime.test.ts tests/onlineDuelSession.test.ts`
Expected: FAIL. `consoleHidden`, `consoleChange`, `lockTo` handling, `uiHeld` and `setConsole` are missing.

- [ ] **Step 3: Implement**

`scene.ts`:
- Import `consoleModel`, `type ConsoleStation` from `'../../render/duel/consoleModel'`, `CONSOLE_RESERVE` from `'../../render/duel/consoleLayout'`, `type HeldFlags` from `'./input'`, and `Outcome` from `'../../sim/tactical/state'`.
- Add to `DuelViewSource`: `/** Single player (Tab takes the other character) or the online duel. */ readonly mode: 'single' | 'online';` and `/** The merged held keys and console holds of the last frame (Artemis spec §6.1). */ uiHeld(): HeldFlags;`.
- Add:
  ```ts
  /** No console on the end card, under any pause banner or dimmed layer, or while paused (Artemis spec §6.1). */
  export function consoleHidden(d: DuelState, overlay: SceneOverlay, paused: boolean): boolean {
    return paused || overlay.banner !== null || overlay.layerPaused || d.tactical.outcome !== Outcome.Running;
  }
  ```
  and `consoleChange` (above).
- In `draw`, change the tactical input's `reserveRight: READOUT_COLUMN` to `reserveLeft: CONSOLE_RESERVE.left, reserveRight: CONSOLE_RESERVE.right`. Pass `console: true` to `readoutRows` when `view !== 'interior'`, and pass `help: view === 'interior' ? readoutHelp(view) : []`. Build `const consoleView = consoleModel({ duel: d, me: source.active(), mode: source.mode, hidden: consoleHidden(d, overlay, source.paused()), held: source.uiHeld(), overlay: overlayView });`, add `console: consoleView` to the `options.ui.frame({...})` view, and make `draw` return `consoleView?.station ?? null`. Its signature becomes `draw(source: DuelViewSource, dt: number, overlay: SceneOverlay): ConsoleStation | null`. The `READOUT_COLUMN` import stays if anything else uses it; otherwise remove it.

`runtime.ts`:
- Import `NO_HELD_FLAGS`, `type HeldFlags` from `'./input'`.
- Add to the runtime's interface (the one that lists `axes(): Axes;`): `readonly mode: 'single'; uiHeld(): HeldFlags;`.
- In `frame(dt)`, right after `let k = deps.sampleKeys();`, store `lastHeld = k.held ?? NO_HELD_FLAGS;` (a new `let lastHeld: HeldFlags = NO_HELD_FLAGS;` beside `activeHeld`). Return `mode: 'single' as const` and `uiHeld: () => lastHeld` from the object.
- In `play(k)`, Weapons branch: right after the E/Q block (`if (p.interact + p.prevLock > 0) { … }`), add:
  ```ts
    if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= 0 && k.lockTo <= 2) queue({ kind: 'laserLock', room: k.lockTo });   // a console lock click (Artemis spec §4.1)
  ```

`onlineSource.ts`: add `let uiHeld: HeldFlags = NO_HELD_FLAGS;`, `mode: 'online' as const`, `uiHeld: () => uiHeld`, and a method `heldFlags(flags: HeldFlags): void { uiHeld = flags; }`. Add these to its returned type (L113) next to `sent(...)`.

`onlineDuel.ts`:
- Deps: add `/** The console's click slot (Artemis spec §6.2): filled with this session's keyboard, emptied on dispose. */ setConsole?(input: ConsoleInput | null): void;`.
- After `const keyboard = createDuelKeyboard(...)`, call `deps.setConsole?.(keyboard.ui);`. Also create `const trackConsole = consoleChange(() => keyboard.clearUi());`.
- In `play()`, Weapons part, after the E/Q lock block: `if (k.lockTo !== undefined && k.lockTo !== null && k.lockTo >= 0 && k.lockTo <= 2 && k.lockTo !== d.tactical.systems[0].lock) send({ kind: 'laserLock', room: k.lockTo });`.
- In `pump()`, right after `const k = keyboard.sample();`: `source?.heldFlags(k.held ?? NO_HELD_FLAGS);`.
- In `frame()`, `const station = scene.draw(source, dt, {...}); trackConsole(station);`.
- In `dispose()`, before `keyboard.destroy()`: `deps.setConsole?.(null);`.

`duelMode.ts`:
- Deps: add the same `setConsole?` member.
- After the keyboard is created: `deps.setConsole?.(keyboard.ui); const trackConsole = consoleChange(() => keyboard.clearUi());`.
- In `frame`: `trackConsole(scene.draw(runtime, dt, {...}));`.
- In `dispose`: `deps.setConsole?.(null);` before `keyboard.destroy()`.

`main.ts`: pass `setConsole: (input) => actions.setConsole(input)` to `startDuelMode` in the app's `single` (L84), to `createOnlineDuelSession` (L92), and in `startDuel` (L179). `actions` there is the `createUiActions` result at L170. In `startApp`, `actions` is declared after the router (L105), but the callbacks run only after it exists, as the existing `onExit` already does.

- [ ] **Step 4: Run the duel and UI tests**

Run: `npx vitest run tests/sceneUi.test.ts tests/duelRuntime.test.ts tests/onlineDuelSession.test.ts tests/onlineDuel.test.ts tests/duelMode.test.ts tests/duelModeDispose.test.ts tests/duelOnlineView.test.ts tests/uiConsole.test.tsx tests/uiDuel.test.tsx`
Expected: all PASS. A test that builds a `DuelViewSource` fake will fail typecheck for the two new members; add `mode: 'single', uiHeld: () => NO_HELD_FLAGS` to that fake.

- [ ] **Step 5: Full suite, typecheck, determinism**

Run: `npx tsc -b && npx vitest run --maxWorkers=4 && npm run test:determinism`
Expected: typecheck clean; every test passes; determinism passes (no sim change).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/app src/renderer/src/main.ts tests
git commit -m "feat(artemis-i): the scene builds the console; runtime and online duel take console clicks (lock, holds, presses) and clear UI holds on a console change (spec §6)"
```

---

### Task 6: Probe fixtures and the look and click check

**Files:**
- Modify: `src/renderer/src/app/uiProbe.ts` (add console fixtures), and the probe's fixture selection (`git grep -n "duelProbeFixture" -- src` shows where `probe=duel` picks its view; add `&console=helm|weapons`, defaulting to none)
- Test: extend `tests/uiProbe.test.ts`

**Interfaces:**
- Consumes: `ConsoleView` (Task 2), `NO_HELD_FLAGS` (Task 1).
- Produces: `duelProbeFixture(console?: 'helm' | 'weapons'): DuelUiView`. Without an argument it is unchanged. With one, it gives a console view as in `tests/uiConsole.test.tsx`'s two fixtures, with `crt: true`, `end: null`, all banners null and the overlay `{ zoomText: 'ZOOM 0.90', scaleBar: { px: 90, units: 100 }, snapHint: false }`.

- [ ] **Step 1: Write the failing test** in `tests/uiProbe.test.ts`:
```ts
it('the console fixtures carry a console and no end card', () => {
  for (const c of ['helm', 'weapons'] as const) { const v = duelProbeFixture(c); expect(v.console?.station).toBe(c); expect(v.end).toBeNull(); expect(v.crt).toBe(true); }
  expect(duelProbeFixture().console).toBeUndefined();
});
```
- [ ] **Step 2:** Run `npx vitest run tests/uiProbe.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the fixture parameter and the `console` query parameter.
- [ ] **Step 4:** Run `npx vitest run tests/uiProbe.test.ts && npx tsc -b`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add src/renderer/src/app/uiProbe.ts src/renderer/src tests/uiProbe.test.ts
git commit -m "test(artemis-i): probe fixtures for the Helm and Weapons consoles"
```

- [ ] **Step 6 (controller, not a subagent): look and click check.** Build with `npx electron-vite build`. With a scratch playwright-core script outside the repo, using `_electron.launch` on `out/` as the earlier UI checks did:
  1. Single player → the Helm view: screenshot `C:\Users\djuar\FTLite-shots\artemis\helm-full.png`.
  2. Click `console-tab-weapons` (Tab). Screenshot `weapons-full.png`.
  3. Hold `console-fire` (mouse down on its centre, wait until the CHARGE value reads `HOLD` or 2 s, mouse up). Assert that the charge value changed.
  4. Click `console-launch`. Assert that `MAG` dropped by one and `FLYING` shows.
  5. Click `console-lock-0`. Assert that it is lit.
  6. Press F10 twice to reach CRT off (the dev cycle). Screenshot `weapons-off.png`.
  7. Click `console-tab-ship` (X). Screenshot `interior.png`. The tab strip shows, with SHIP lit.
  8. Mouse-wheel over the map (not over a button) zooms, and right-drag pans: the side column's zoom value changes.
  Record the results in the final report. Failures here go back to the matching task as fixes.
