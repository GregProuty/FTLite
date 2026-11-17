# Enemy Ship Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring back FTL's enemy-ship panel for the duel: a click on the enemy on the Helm or Weapons map (or `T`) opens a CRT contact window with the enemy's rooms, and at Weapons LASER arms a reticle whose room click sets the laser's lock.

**Architecture:** A pure, local contact controller (`app/duel/contactController.ts`) holds `{ ship, aim } | null` and owns the closing rules (`sync`) and the Esc/T key intercept. The keyboard gains an intercept hook and the pointer source a `takeClick`. The scene picks the clicked ship (`pickShip`), syncs the controller, widens the map's right reserve while the window is shown, and builds a pure `ContactView` (`render/duel/contactModel.ts`) that a new React component (`ui/duel/ContactWindow.tsx`) draws as an inline SVG in the CRT ramp. The room damage table moves into a shared pure `roomLook` so the map and the window match. A pick goes through the existing console lock (`actions.console.lock`), so single player and online behave the same.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), PixiJS 8 (map layer only), React 19 + zustand (UI overlay), vitest (+ jsdom and @testing-library/react for `.tsx` tests); Electron + Vite for the screenshots (gitignored harness under `.art/shots/`).

**Spec:** `docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md` (two review rounds: `docs/superpowers/reviews/2026-11-17-enemy-window-spec/`).

## Global Constraints

- Presentation only: no file under `src/renderer/src/sim`, `src/renderer/src/authority`, `src/network`, `src/shared` or `src/main` changes. `SIM_VERSION` stays 42 (`src/renderer/src/sim/tuning.ts` line 7) and the goldens do not change.
- The aim goes through the existing lock path only: `actions.console.lock(room)` / the keyboard's `ui.lock(room)`. Aiming only sets the target; firing stays on FIRE / Space; no auto-fire. Laser only: the missile shows as not aimable (`MAG n`, `STEER A/D`, greyed).
- CRT amber ramp only: every colour the window, the room drawing and the reticle use is one of `CRT.glass`, `faint`, `dim`, `mid`, `main`, `hot` (`render/tactical/crtTheme.ts`). React draws only resolved colours from the view; it does no blinking of its own.
- The contact window state is local to each player's screen: never sent over the network, never in the sim, never in a command.
- The map's pixels do not change (the `roomLook` extraction is a pure refactor of `drawShip`).
- Layout numbers, internal px (1280 × 720): `CONTACT = { x: 968, y: 150, w: 300, h: 360 }`; `SIDE_H = 96`; `CONTACT_BOX = { x: 980, y: 210, w: 276, h: 200 }`; `CONTACT_RESERVE = 324`. Hit radius `max(16, 2 * SHIP_RADIUS * z, 1.9 * SHIP_RADIUS * drawnScale(z))`.
- Work in the worktree `C:/Users/djuar/FTLite/.worktrees/enemy-window` on branch `enemy-window`. The controller creates it and its `services/signalling/node_modules` junction; tasks never create worktrees or junctions. Every command below runs from the worktree root.
- Per task checks: `npx tsc --noEmit -p tsconfig.web.json` (about 10 s; covers `src/renderer/src` and `tests/`) must print nothing, and the task's own test files must pass. Do not run the full suite before Task 9 (it is slow and can hang).
- Git: stage files by name (never `git add -A` or `git add .`), never `git stash`, never amend. Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).

## File Structure

- Modify `src/renderer/src/render/tactical/crtTheme.ts`: add `RoomLook`, `roomLook`, `roomLevel` (the damage table, pure).
- Modify `src/renderer/src/render/tactical/tacticalLayer.ts`: `drawShip` draws rooms by `roomLook`.
- Create `src/renderer/src/app/duel/contactController.ts`: the contact state, its methods, `sync`'s closing rules, the key `intercept`.
- Modify `src/renderer/src/app/duel/input.ts`: `createDuelKeyboard(target, opts?)` with `opts.intercept`; `PointerSource.takeClick()`.
- Modify `src/renderer/src/render/tactical/tacticalModel.ts`: `pickRadius`, `pickShip`.
- Modify `src/renderer/src/render/duel/consoleLayout.ts`: `SIDE_H`, `CONTACT`, `CONTACT_BOX`, `CONTACT_RESERVE`.
- Modify `src/renderer/src/ui/duel/SideColumn.tsx`: the panel height from `SIDE_H`.
- Create `src/renderer/src/render/duel/contactModel.ts`: `ContactView`, `contactModel`, `contactFit`, `ROOM_LABELS`.
- Modify `src/renderer/src/render/duel/consoleModel.ts`: export `consoleStation`.
- Modify `src/renderer/src/ui/views.ts`: `DuelUiView.contact`.
- Modify `src/renderer/src/app/duel/scene.ts`: `DuelSceneOptions` (`contact`, `takeClick`), the frame order of spec §6.5.
- Modify `src/renderer/src/ui/actions.ts`: `actions.contact`, `setContact`.
- Modify `src/renderer/src/app/duel/duelMode.ts`, `src/renderer/src/app/duel/onlineDuel.ts`, `src/renderer/src/main.ts`: create and wire the controller.
- Create `src/renderer/src/ui/duel/ContactWindow.tsx`; modify `src/renderer/src/ui/duel/DuelUi.tsx`.
- Tests: create `tests/contactController.test.ts`, `tests/contactModel.test.ts`, `tests/contactScene.test.ts`, `tests/contactWindow.test.tsx`; modify `tests/crtColours.test.ts`, `tests/duelInput.test.ts`, `tests/tacticalModel.test.ts`, `tests/duelConsoleModel.test.ts`, `tests/uiActions.test.ts`, `tests/duelModeDispose.test.ts`, `tests/onlineDuelSession.test.ts`.
- Modify `docs/gates.md` (Task 9). The screenshot harness lives in `.art/shots/` (gitignored, never committed).

---

### Task 1: The shared room look

**Files:**
- Modify: `src/renderer/src/render/tactical/crtTheme.ts` (append)
- Modify: `src/renderer/src/render/tactical/tacticalLayer.ts:12` (import) and `:128-145` (`drawShip`'s rooms)
- Test: `tests/crtColours.test.ts`

**Interfaces:**
- Consumes: `CRT` from `crtTheme.ts` (`{ glass: 0x0c0e0b, faint: 0x2a1a08, dim: 0x7a4a10, mid: 0xc47a12, main: 0xffae1a, hot: 0xffd36b }`).
- Produces: `interface RoomLook { readonly fill: number | null; readonly stroke: number; readonly hatch: number | null }`; `roomLook(crew: boolean, level: 0 | 1 | 2, phase: 0 | 1): RoomLook`; `roomLevel(n: number): 0 | 1 | 2` (0 → 0, 1 → 1, anything else → 2).

- [ ] **Step 1: Write the failing test.** In `tests/crtColours.test.ts`, replace the line

```ts
import { CRT_RAMP } from '../src/renderer/src/render/tactical/crtTheme';
```

with

```ts
import { CRT, CRT_RAMP, roomLevel, roomLook } from '../src/renderer/src/render/tactical/crtTheme';
```

and append at the end of the file:

```ts

describe('roomLook (enemy ship window spec §6.3: the map\'s room damage table, shared with the contact window)', () => {
  it('reproduces the hull silhouettes table for both ships, every level and both blink phases', () => {
    const N = null;
    const table = [
      [true, 0, 0, N, CRT.glass, N], [true, 0, 1, N, CRT.glass, N],
      [true, 1, 0, CRT.mid, CRT.glass, CRT.glass], [true, 1, 1, CRT.mid, CRT.glass, CRT.glass],
      [true, 2, 0, CRT.glass, CRT.hot, N], [true, 2, 1, CRT.hot, CRT.glass, N],
      [false, 0, 0, N, CRT.mid, N], [false, 0, 1, N, CRT.mid, N],
      [false, 1, 0, CRT.dim, CRT.main, CRT.main], [false, 1, 1, CRT.dim, CRT.main, CRT.main],
      [false, 2, 0, CRT.hot, CRT.glass, N], [false, 2, 1, CRT.glass, CRT.main, CRT.main]
    ] as const;
    for (const [crew, level, phase, fill, stroke, hatch] of table)
      expect(roomLook(crew, level, phase), `crew ${crew} level ${level} phase ${phase}`).toEqual({ fill, stroke, hatch });
  });
  it('roomLevel maps a room damage value to the table row: 0, 1, else 2', () => {
    expect([0, 1, 2, 3].map(roomLevel)).toEqual([0, 1, 2, 2]);
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx vitest run tests/crtColours.test.ts`
Expected: FAIL in the two new tests (`roomLook is not a function` / `roomLevel is not a function`); the existing tests still pass.

- [ ] **Step 3: Add `roomLook` and `roomLevel`.** Append to `src/renderer/src/render/tactical/crtTheme.ts`:

```ts

/** A room's damage look (hull silhouettes spec section 2's table; enemy ship window spec §6.3): the fill (null: none),
 *  the 1 px stroke and the hatch colour (null: none) for a ship side, a damage level and the DAMAGE_BLINK_HZ phase.
 *  The console map and the contact window both draw by it. */
export interface RoomLook { readonly fill: number | null; readonly stroke: number; readonly hatch: number | null }
const look = (fill: number | null, stroke: number, hatch: number | null): RoomLook => Object.freeze({ fill, stroke, hatch });
type LookRows = readonly (readonly [RoomLook, RoomLook])[];
const CREW_LOOKS: LookRows = [
  [look(null, CRT.glass, null), look(null, CRT.glass, null)],
  [look(CRT.mid, CRT.glass, CRT.glass), look(CRT.mid, CRT.glass, CRT.glass)],
  [look(CRT.glass, CRT.hot, null), look(CRT.hot, CRT.glass, null)]
];
const ENEMY_LOOKS: LookRows = [
  [look(null, CRT.mid, null), look(null, CRT.mid, null)],
  [look(CRT.dim, CRT.main, CRT.main), look(CRT.dim, CRT.main, CRT.main)],
  [look(CRT.hot, CRT.glass, null), look(CRT.glass, CRT.main, CRT.main)]
];
/** The look for one room: frozen shared objects, so a frame allocates nothing. */
export function roomLook(crew: boolean, level: 0 | 1 | 2, phase: 0 | 1): RoomLook { return (crew ? CREW_LOOKS : ENEMY_LOOKS)[level]![phase]; }
/** A room's damage value (0..2) as the table's level: 0, 1, anything else 2 (as drawShip always read it). */
export function roomLevel(n: number): 0 | 1 | 2 { return n === 0 ? 0 : n === 1 ? 1 : 2; }
```

- [ ] **Step 4: Draw the map's rooms by it.** In `src/renderer/src/render/tactical/tacticalLayer.ts`, replace the import line

```ts
import { blink, CRT, DAMAGE_BLINK_HZ, DASH, DOT, DOT_GAP, ENEMY_BLINK_HZ, GAP, HATCH_ANGLE, HATCH_SPACING } from './crtTheme';
```

with

```ts
import { blink, CRT, DAMAGE_BLINK_HZ, DASH, DOT, DOT_GAP, ENEMY_BLINK_HZ, GAP, HATCH_ANGLE, HATCH_SPACING, roomLevel, roomLook } from './crtTheme';
```

and in `drawShip` replace this block:

```ts
    hull.rooms.forEach((room, r) => {
      const pts = place(room), level = s.rooms[r] ?? 0;
      let fill: number | null, stroke: number, hatch: number | null;
      if (s.crew) {
        if (level === 0) { fill = null; stroke = CRT.glass; hatch = null; }
        else if (level === 1) { fill = CRT.mid; stroke = CRT.glass; hatch = CRT.glass; }
        else if (phase === 0) { fill = CRT.glass; stroke = CRT.hot; hatch = null; }
        else { fill = CRT.hot; stroke = CRT.glass; hatch = null; }
      } else {
        if (level === 0) { fill = null; stroke = CRT.mid; hatch = null; }
        else if (level === 1) { fill = CRT.dim; stroke = CRT.main; hatch = CRT.main; }
        else if (phase === 0) { fill = CRT.hot; stroke = CRT.glass; hatch = null; }
        else { fill = CRT.glass; stroke = CRT.main; hatch = CRT.main; }
      }
      if (fill === null) g.poly(pts).stroke({ width: 1, color: stroke });
```

with:

```ts
    hull.rooms.forEach((room, r) => {
      const pts = place(room), { fill, stroke, hatch } = roomLook(s.crew, roomLevel(s.rooms[r] ?? 0), phase);   // the shared table (enemy ship window spec §6.3)
      if (fill === null) g.poly(pts).stroke({ width: 1, color: stroke });
```

(the two lines after it, `else g.poly(pts).fill(fill)...` and `if (hatch !== null) segments(...)`, stay as they are).

- [ ] **Step 5: Run the tests and the type check.**

Run: `npx vitest run tests/crtColours.test.ts tests/tacticalLayer.test.ts tests/hullModel.test.ts`
Expected: PASS, all files (the full-frame colour tests show the map's pixels kept the ramp).

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: no output.

- [ ] **Step 6: Commit.**

```bash
git add src/renderer/src/render/tactical/crtTheme.ts src/renderer/src/render/tactical/tacticalLayer.ts tests/crtColours.test.ts
git commit -m "refactor(enemy-window): roomLook, the room damage table shared by the map and the contact window" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The contact controller

**Files:**
- Create: `src/renderer/src/app/duel/contactController.ts`
- Test: `tests/contactController.test.ts`

**Interfaces:**
- Consumes: `type ConsoleStation = 'helm' | 'weapons' | 'ship'` from `src/renderer/src/render/duel/consoleModel.ts`.
- Produces (used by Tasks 6, 7, 8, 9):
  - `interface ContactState { ship: number; aim: boolean }`
  - `interface ContactSync { shown: boolean; station: ConsoleStation | null; target: number; active: (slot: number) => boolean; epoch: number }` — `shown` is "the console is shown at Helm or Weapons" (the scene's input); `station` is null while the console is hidden.
  - `interface ContactController { state(): ContactState | null; click(slot: number | null): void; toggle(targetSlot: number): void; close(): void; arm(): void; cancelAim(): void; escape(): boolean; sync(s: ContactSync): boolean; pick(room: number, lock: (room: number) => void): void; intercept(code: string): boolean }` — `sync` returns whether the window is shown after the closing rules (`s.shown && state() !== null`).
  - `type ContactActions = Pick<ContactController, 'close' | 'arm' | 'cancelAim' | 'pick'>`
  - `createContactController(): ContactController`

- [ ] **Step 1: Write the failing test** `tests/contactController.test.ts`:

```ts
// Enemy ship window spec §3, §5, §6.1, §6.2, §8: the contact window's local state, its closing rules and its key intercept.
import { describe, expect, it, vi } from 'vitest';
import { createContactController, type ContactSync } from '../src/renderer/src/app/duel/contactController';

const live = (over: Partial<ContactSync> = {}): ContactSync => ({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, ...over });

describe('opening and closing (spec §3)', () => {
  it('a map click opens, a click on another ship switches (disarmed), a click on the shown ship closes; null does nothing', () => {
    const c = createContactController();
    c.click(null); expect(c.state()).toBeNull();
    c.click(1); expect(c.state()).toEqual({ ship: 1, aim: false });
    c.arm(); c.click(2); expect(c.state()).toEqual({ ship: 2, aim: false });
    c.click(null); expect(c.state()).toEqual({ ship: 2, aim: false });
    c.click(2); expect(c.state()).toBeNull();
  });
  it('toggle opens on the target slot or closes; close closes', () => {
    const c = createContactController();
    c.toggle(1); expect(c.state()).toEqual({ ship: 1, aim: false });
    c.toggle(1); expect(c.state()).toBeNull();
    c.click(1); c.close(); expect(c.state()).toBeNull();
  });
  it('arm toggles the aim while open (nothing while closed); cancelAim disarms', () => {
    const c = createContactController();
    c.arm(); expect(c.state()).toBeNull();
    c.click(1); c.arm(); expect(c.state()).toEqual({ ship: 1, aim: true });
    c.arm(); expect(c.state()).toEqual({ ship: 1, aim: false });
    c.arm(); c.cancelAim(); expect(c.state()).toEqual({ ship: 1, aim: false });
  });
  it('escape disarms, then closes, then returns false', () => {
    const c = createContactController();
    c.click(1); c.arm();
    expect(c.escape()).toBe(true); expect(c.state()).toEqual({ ship: 1, aim: false });
    expect(c.escape()).toBe(true); expect(c.state()).toBeNull();
    expect(c.escape()).toBe(false);
  });
});

describe('sync, once per frame (spec §3)', () => {
  it('returns whether the window is shown', () => {
    const c = createContactController();
    expect(c.sync(live())).toBe(false);
    c.click(1); expect(c.sync(live())).toBe(true);
  });
  it('clears when the console is not shown (hidden, SHIP, a pause)', () => {
    const c = createContactController();
    c.click(1); c.arm();
    expect(c.sync(live({ shown: false, station: null }))).toBe(false); expect(c.state()).toBeNull();
    c.click(1);
    expect(c.sync(live({ shown: false, station: 'ship' }))).toBe(false); expect(c.state()).toBeNull();
  });
  it('clears when the shown ship is inactive', () => {
    const c = createContactController();
    c.click(1);
    expect(c.sync(live({ active: (slot) => slot !== 1 }))).toBe(false); expect(c.state()).toBeNull();
  });
  it('clears on a new epoch (the first sync only records it)', () => {
    const c = createContactController();
    c.click(1); expect(c.sync(live({ epoch: 3 }))).toBe(true);
    expect(c.sync(live({ epoch: 3 }))).toBe(true);
    expect(c.sync(live({ epoch: 4 }))).toBe(false); expect(c.state()).toBeNull();
  });
  it('a station change disarms and keeps the window open', () => {
    const c = createContactController();
    c.sync(live({ station: 'helm' })); c.click(1); c.arm();
    expect(c.sync(live({ station: 'helm' }))).toBe(true); expect(c.state()).toEqual({ ship: 1, aim: true });
    expect(c.sync(live({ station: 'weapons' }))).toBe(true); expect(c.state()).toEqual({ ship: 1, aim: false });
  });
});

describe('pick (spec §5)', () => {
  it('calls lock only while armed, then disarms and keeps the window open', () => {
    const c = createContactController(), lock = vi.fn();
    c.click(1); c.pick(2, lock); expect(lock).not.toHaveBeenCalled();
    c.arm(); c.pick(2, lock);
    expect(lock).toHaveBeenCalledTimes(1); expect(lock).toHaveBeenCalledWith(2);
    expect(c.state()).toEqual({ ship: 1, aim: false });
    c.pick(0, lock); expect(lock).toHaveBeenCalledTimes(1);
  });
});

describe('the key intercept (spec §6.2)', () => {
  it('takes KeyT on a Helm or Weapons station: toggles on the last frame\'s target slot, or closes while shown', () => {
    for (const station of ['helm', 'weapons'] as const) {
      const c = createContactController();
      c.sync(live({ station, target: 1 }));
      expect(c.intercept('KeyT')).toBe(true); expect(c.state()).toEqual({ ship: 1, aim: false });
      c.sync(live({ station, target: 1 }));
      expect(c.intercept('KeyT')).toBe(true); expect(c.state()).toBeNull();
    }
  });
  it('declines KeyT before any frame, on a hidden console and on the SHIP console', () => {
    const c = createContactController();
    expect(c.intercept('KeyT')).toBe(false);
    c.sync(live({ shown: false, station: null })); expect(c.intercept('KeyT')).toBe(false);
    c.sync(live({ shown: false, station: 'ship' })); expect(c.intercept('KeyT')).toBe(false);
    expect(c.state()).toBeNull();
  });
  it('takes Escape only while shown: first it disarms, then it closes; declines it when closed or hidden', () => {
    const c = createContactController();
    c.sync(live()); expect(c.intercept('Escape')).toBe(false);
    c.click(1); c.sync(live()); c.arm();
    expect(c.intercept('Escape')).toBe(true); expect(c.state()).toEqual({ ship: 1, aim: false });
    expect(c.intercept('Escape')).toBe(true); expect(c.state()).toBeNull();
    expect(c.intercept('Escape')).toBe(false);
    c.click(1); c.sync(live({ shown: false, station: null }));
    expect(c.intercept('Escape')).toBe(false);
  });
  it('declines every other code, even while shown', () => {
    const c = createContactController();
    c.click(1); c.sync(live());
    for (const code of ['KeyE', 'KeyQ', 'Space', 'Tab', 'KeyW', 'Enter']) expect(c.intercept(code), code).toBe(false);
    expect(c.state()).toEqual({ ship: 1, aim: false });
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx vitest run tests/contactController.test.ts`
Expected: FAIL (`Failed to resolve import "../src/renderer/src/app/duel/contactController"` or `createContactController is not a function`).

- [ ] **Step 3: Write the controller** `src/renderer/src/app/duel/contactController.ts`:

```ts
// The contact window's state (enemy ship window spec §3, §5, §6.1): which map contact the window shows (a ship slot) and
// whether the laser aim is armed. Pure and local to one player's screen: never sent, never in the sim. One controller per
// duel mode, beside the keyboard; the scene drives `click` and `sync` each frame, the UI actions drive the rest, and
// `intercept` is the keyboard's hook for Esc and T (spec §6.2), reading what the last `sync` recorded.
import type { ConsoleStation } from '../../render/duel/consoleModel';

export interface ContactState { ship: number; aim: boolean }
/** One frame's facts for the closing rules: `shown` is the console shown at Helm or Weapons; `station` the console's
 *  station, null while it is hidden; `target` the crew laser's target slot; `active` whether a slot's ship is active;
 *  `epoch` the round. */
export interface ContactSync { shown: boolean; station: ConsoleStation | null; target: number; active: (slot: number) => boolean; epoch: number }
export interface ContactController {
  state(): ContactState | null;
  /** A map click (spec §3): open on the slot, switch to it (disarmed), or close when it is the shown ship; null does nothing. */
  click(slot: number | null): void;
  /** T: open on the laser target slot, or close. */
  toggle(targetSlot: number): void;
  close(): void;
  /** LASER: toggles the aim while the window is open. */
  arm(): void;
  cancelAim(): void;
  /** Esc: disarms if armed, else closes; true when it took something, false when nothing is open. */
  escape(): boolean;
  /** The closing rules, once per frame: clears when not shown, on an inactive ship or a new epoch, and disarms on a
   *  station change. Records `shown`, `station` and `target` for `intercept`. Returns whether the window is shown. */
  sync(s: ContactSync): boolean;
  /** A room click while armed: `lock(room)` (the console lock path), then disarm; the window stays open. */
  pick(room: number, lock: (room: number) => void): void;
  /** The keyboard's intercept: true takes the key. Escape only while shown; KeyT while shown (close) or on a Helm or
   *  Weapons console (toggle on the target slot); everything else false. */
  intercept(code: string): boolean;
}
/** What the UI's actions forward to (ui/actions.ts setContact). */
export type ContactActions = Pick<ContactController, 'close' | 'arm' | 'cancelAim' | 'pick'>;

export function createContactController(): ContactController {
  let st: ContactState | null = null;
  // What the last sync recorded (the last drawn frame).
  let allowed = false, station: ConsoleStation | null = null, target = -1, epoch: number | null = null;
  const c: ContactController = {
    state: () => st,
    click(slot) {
      if (slot === null) return;
      st = st && st.ship === slot ? null : { ship: slot, aim: false };
    },
    toggle(targetSlot) { st = st ? null : { ship: targetSlot, aim: false }; },
    close() { st = null; },
    arm() { if (st) st = { ...st, aim: !st.aim }; },
    cancelAim() { if (st?.aim) st = { ...st, aim: false }; },
    escape() {
      if (!st) return false;
      st = st.aim ? { ...st, aim: false } : null;
      return true;
    },
    sync(s) {
      if (epoch !== null && s.epoch !== epoch) st = null;            // a new round
      if (st && (!s.shown || !s.active(st.ship))) st = null;          // hidden, SHIP, paused, decided, or the ship is gone
      if (st?.aim && station !== null && s.station !== station) st = { ...st, aim: false };   // a station change disarms
      allowed = s.shown; station = s.station; target = s.target; epoch = s.epoch;
      return allowed && st !== null;
    },
    pick(room, lock) {
      if (!st?.aim) return;
      lock(room);
      st = { ...st, aim: false };
    },
    intercept(code) {
      if (code === 'Escape') return allowed && st !== null ? c.escape() : false;
      if (code === 'KeyT') {
        if (allowed && st !== null) { c.close(); return true; }
        if (station === 'helm' || station === 'weapons') { c.toggle(target); return true; }
      }
      return false;
    }
  };
  return c;
}
```

- [ ] **Step 4: Run the test and the type check.**

Run: `npx vitest run tests/contactController.test.ts`
Expected: PASS (14 tests).

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: no output.

- [ ] **Step 5: Commit.**

```bash
git add src/renderer/src/app/duel/contactController.ts tests/contactController.test.ts
git commit -m "feat(enemy-window): the contact controller (open, switch, close, aim, pick, the closing rules, the Esc and T intercept)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The keyboard intercept and the pointer's map click

**Files:**
- Modify: `src/renderer/src/app/duel/input.ts:1-2` (header), `:54-68` (keyboard), `:120` (PointerSource), `:134-168` (pointer source)
- Test: `tests/duelInput.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Task 7): `interface DuelKeyboardOptions { intercept?: (code: string) => boolean }`; `createDuelKeyboard(target: EventSource, opts?: DuelKeyboardOptions): DuelKeyboard`; `PointerSource.takeClick(): { x: number; y: number } | null` (the last button-0 pointerdown on the target, in internal px, cleared by reading it and by `clear()`; separate from `sample()`).

- [ ] **Step 1: Write the failing tests.** In `tests/duelInput.test.ts`:

(a) Inside `describe('duel keyboard (H-1 spec §5)', () => {`, after the test `'blur and clear drop held keys and pending presses; destroy removes every listener'` (its closing `});`), add:

```ts
  it('an intercepted keydown adds no press edge and is not held; a declined one counts as before (enemy ship window spec §6.2)', () => {
    const t = fakeTarget(), seen: string[] = [];
    let take = true;
    const kb = createDuelKeyboard(t, { intercept: (code) => { seen.push(code); return take && (code === 'Escape' || code === 'KeyW'); } });
    t.fire('keydown', key('Escape')); t.fire('keydown', key('KeyW')); t.fire('keydown', key('KeyC'));
    let s = kb.sample();
    expect(s.presses.pause).toBe(0); expect(s.moveY).toBe(0); expect(s.presses.camera).toBe(1);
    t.fire('keydown', key('KeyC', true));   // auto-repeat is never offered to the intercept
    expect(seen).toEqual(['Escape', 'KeyW', 'KeyC']);
    t.fire('keyup', key('Escape')); t.fire('keyup', key('KeyW'));
    take = false;
    t.fire('keydown', key('Escape')); t.fire('keydown', key('KeyW'));
    s = kb.sample();
    expect(s.presses.pause).toBe(1); expect(s.moveY).toBe(-1);
  });
  it('an intercepted key in PREVENT still has its default prevented', () => {
    const t = fakeTarget(); createDuelKeyboard(t, { intercept: () => true });
    const tab = key('Tab'); t.fire('keydown', tab);
    expect(tab.preventDefault).toHaveBeenCalled();
  });
```

(b) Inside `describe('pointer source (H-1 spec §5)', () => {`, after the test `'drags with the right or middle button only, and suppresses the context menu'` (its closing `});`), add:

```ts
  it('takeClick returns the last left-button press once, in internal px; ignores right and middle; clear drops it (enemy ship window spec §6.2)', () => {
    const t = fakeTarget(), p = createPointerSource(t, half);
    expect(p.takeClick()).toBeNull();
    t.fire('pointerdown', ptr(100, 60, 0, 1)); t.fire('pointerdown', ptr(300, 200, 0, 1));
    expect(p.takeClick()).toEqual({ x: 150, y: 100 });
    expect(p.takeClick()).toBeNull();
    t.fire('pointerdown', ptr(100, 100, 2, 2)); t.fire('pointerdown', ptr(100, 100, 1, 4));
    expect(p.takeClick()).toBeNull();
    t.fire('pointerdown', ptr(40, 40, 0, 1)); p.clear();
    expect(p.takeClick()).toBeNull();
    t.fire('pointerdown', ptr(40, 40, 0, 1)); p.sample();   // sampling the camera input leaves the click
    expect(p.takeClick()).toEqual({ x: 20, y: 20 });
  });
```

- [ ] **Step 2: Run them to see them fail.**

Run: `npx vitest run tests/duelInput.test.ts`
Expected: FAIL in the three new tests (the intercept is ignored, so `presses.pause` is 1; `p.takeClick is not a function`); the type check would also flag the extra argument.

- [ ] **Step 3: Implement.** In `src/renderer/src/app/duel/input.ts`:

(a) Replace the header's second line

```ts
// the flight view. Pointer input feeds only the camera and never becomes a command (parent §10).
```

with

```ts
// the flight view. Pointer input feeds the camera and, through takeClick, the contact window's map clicks (enemy ship
// window spec §6.2); it never becomes a command (parent §10).
```

(b) Replace

```ts
export function createDuelKeyboard(target: EventSource): DuelKeyboard {
```

with

```ts
/** Options (enemy ship window spec §6.2): `intercept` sees each non-repeat keydown's code before PRESS_CODES; returning
 *  true takes the key, so it adds no press edge and is not held (PREVENT's keys still have their default prevented). */
export interface DuelKeyboardOptions { intercept?: (code: string) => boolean }

export function createDuelKeyboard(target: EventSource, opts: DuelKeyboardOptions = {}): DuelKeyboard {
```

(c) Replace

```ts
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.code === FIRE_HELD) { if (!e.repeat && !has(FIRE_HELD)) presses.fireDown++; }
```

with

```ts
    if (PREVENT.has(e.code)) e.preventDefault();
    if (!e.repeat && opts.intercept?.(e.code)) return;   // taken (the contact window's Esc and T): no edge, not held
    if (e.code === FIRE_HELD) { if (!e.repeat && !has(FIRE_HELD)) presses.fireDown++; }
```

(d) Replace

```ts
export interface PointerSource { sample(): PointerSample; clear(): void; destroy(): void }
```

with

```ts
export interface PointerSource {
  sample(): PointerSample;
  /** The last left-button (button 0) pointerdown since the previous call, in internal px, or null; reading clears it
   *  (enemy ship window spec §6.2). Separate from `sample()`, so the camera input is unchanged. */
  takeClick(): { x: number; y: number } | null;
  clear(): void;
  destroy(): void;
}
```

(e) Replace

```ts
  let x: number | null = null, y: number | null = null, wheel = 0, dragX = 0, dragY = 0, dragging = false;
```

with

```ts
  let x: number | null = null, y: number | null = null, wheel = 0, dragX = 0, dragY = 0, dragging = false;
  let click: { x: number; y: number } | null = null;
```

(f) Replace

```ts
    if (e.button === 1 || e.button === 2) { dragging = true; e.preventDefault(); }
```

with

```ts
    if (e.button === 1 || e.button === 2) { dragging = true; e.preventDefault(); }
    else if (e.button === 0) click = { x: p.x, y: p.y };   // the contact window's map click (spec §6.2)
```

(g) Replace

```ts
  const clear = (): void => { wheel = 0; dragX = 0; dragY = 0; dragging = false; };
```

with

```ts
  const clear = (): void => { wheel = 0; dragX = 0; dragY = 0; dragging = false; click = null; };
```

(h) Replace

```ts
    clear,
    destroy(): void { for (const [type, fn] of on) target.removeEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined); }
```

with

```ts
    takeClick() { const out = click; click = null; return out; },
    clear,
    destroy(): void { for (const [type, fn] of on) target.removeEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined); }
```

- [ ] **Step 4: Run the tests and the type check.**

Run: `npx vitest run tests/duelInput.test.ts tests/duelInputMerge.test.ts`
Expected: PASS, both files.

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: no output.

- [ ] **Step 5: Commit.**

```bash
git add src/renderer/src/app/duel/input.ts tests/duelInput.test.ts
git commit -m "feat(enemy-window): a keydown intercept for the duel keyboard and takeClick for the map click" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: pickShip and the contact window's layout

**Files:**
- Modify: `src/renderer/src/render/tactical/tacticalModel.ts` (insert before `const shapeCache`)
- Modify: `src/renderer/src/render/duel/consoleLayout.ts` (after `SIDE`, and at the end)
- Modify: `src/renderer/src/ui/duel/SideColumn.tsx:5,18`
- Test: `tests/tacticalModel.test.ts`, `tests/duelConsoleModel.test.ts`

**Interfaces:**
- Consumes: in `tacticalModel.ts` (already imported there): `CREW_SLOT`, `SHIP_RADIUS`, `worldToScreen`, `type Point`, `interpolatedShip`, `drawnScale`, `TacticalModelInput`.
- Produces (used by Tasks 5, 6, 8):
  - `PICK_MIN_PX = 16`; `pickRadius(z: number): number` = `max(16, 2 * SHIP_RADIUS * z, 1.9 * SHIP_RADIUS * drawnScale(z))` (16 at z 0.2, 30.4 at 0.5, 48 at 1.2);
  - `pickShip(input: Pick<TacticalModelInput, 'state' | 'prev' | 'alpha' | 'camera' | 'viewport'>, p: Point): number | null` — a full `TacticalModelInput` also satisfies it;
  - in `consoleLayout.ts`: `SIDE_H = 96`; `CONTACT = { x: 968, y: 150, w: 300, h: 360 }`; `CONTACT_BOX = { x: 980, y: 210, w: 276, h: 200 }`; `CONTACT_RESERVE = 324`.

- [ ] **Step 1: Write the failing tests.**

(a) In `tests/tacticalModel.test.ts`, replace the import

```ts
import {
  asteroidShape, BEARING_RING_PX, STAR_PARALLAX, starOffset, columnName, contourRadius, GRID_EXTENT, interpolatedShip, pathSeconds, ringCrossesRect,
  shipScale, SHIP_MIN_PX_PER_UNIT, tacticalModel, type PrevBody, type TacticalModelInput
} from '../src/renderer/src/render/tactical/tacticalModel';
```

with

```ts
import {
  asteroidShape, BEARING_RING_PX, STAR_PARALLAX, starOffset, columnName, contourRadius, GRID_EXTENT, interpolatedShip, pathSeconds, pickRadius, pickShip, ringCrossesRect,
  shipScale, SHIP_MIN_PX_PER_UNIT, tacticalModel, type PrevBody, type TacticalModelInput
} from '../src/renderer/src/render/tactical/tacticalModel';
```

and append at the end of the file:

```ts

describe('pickShip (enemy ship window spec §3, §6.2)', () => {
  const at = (st: TacticalState, cam: Camera, x: number, y: number) => pickShip(input(st, cam), { x, y });
  it('hits inside the radius and misses outside it at zoom 0.2 (the 16 px floor), 0.5 and 1.2', () => {
    for (const [z, r] of [[0.2, 16], [0.5, 30.4], [1.2, 48]] as const) {
      const st = createTacticalState(4), en = st.ships[1], cam = createCamera(en.x, en.y, z);   // the enemy at the screen centre
      expect(pickRadius(z), `radius at ${z}`).toBeCloseTo(r, 9);
      expect(at(st, cam, 640 + r - 0.5, 360), `inside at ${z}`).toBe(1);
      expect(at(st, cam, 640, 360 - (r - 0.5)), `inside, above, at ${z}`).toBe(1);
      expect(at(st, cam, 640 + r + 0.5, 360), `outside at ${z}`).toBeNull();
    }
  });
  it('skips the crew slot and inactive slots, and picks the nearest of two', () => {
    const st = createTacticalState(4, 3), crew = st.ships[0], en = st.ships[1], third = st.ships[2]!;
    expect(at(st, createCamera(crew.x, crew.y, 0.5), 640, 360)).toBeNull();   // the crew's own ship
    third.x = en.x + 2000; third.y = en.y;
    expect(at(st, createCamera(third.x, third.y, 0.5), 640, 360)).toBeNull();   // an inactive slot
    third.active = true;
    expect(at(st, createCamera(third.x, third.y, 0.5), 640, 360)).toBe(2);
    third.x = en.x + 20;   // 24 px right of the enemy at zoom 1.2
    const cam = createCamera(en.x, en.y, 1.2);
    expect(at(st, cam, 640 + 16, 360)).toBe(2);
    expect(at(st, cam, 640 + 8, 360)).toBe(1);
  });
});
```

(b) In `tests/duelConsoleModel.test.ts`, replace the import

```ts
import { CONSOLE_RESERVE, SIDE, STATION, STATUS, TABS_RIGHT, stationTop } from '../src/renderer/src/render/duel/consoleLayout';
```

with

```ts
import { CONSOLE_RESERVE, CONTACT, CONTACT_BOX, CONTACT_RESERVE, EDGE, SIDE, SIDE_H, STATION, STATUS, TABS, TABS_RIGHT, stationTop } from '../src/renderer/src/render/duel/consoleLayout';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';
```

and inside `describe('console layout (spec §2)', () => {`, after the test `'the status table ends above the station block at its longest (every crew room damaged)'` (its closing `});`), add:

```ts
  it('the contact window (enemy ship window spec §4.1): right edge, below the side column, overlapping nothing', () => {
    expect(SIDE_H).toBe(96);
    expect(CONTACT).toEqual({ x: 968, y: 150, w: 300, h: 360 });
    expect(CONTACT.x + CONTACT.w).toBe(INTERNAL_W - EDGE);
    expect(CONTACT.y).toBe(SIDE.y + SIDE_H + EDGE);
    expect(CONTACT_RESERVE).toBe(324);
    expect(CONTACT_BOX).toEqual({ x: 980, y: 210, w: 276, h: 200 });
    expect(CONTACT_BOX.x >= CONTACT.x && CONTACT_BOX.x + CONTACT_BOX.w <= CONTACT.x + CONTACT.w).toBe(true);
    expect(CONTACT_BOX.y >= CONTACT.y && CONTACT_BOX.y + CONTACT_BOX.h <= CONTACT.y + CONTACT.h).toBe(true);
    type R = { x: number; y: number; w: number; h: number };
    const rect = (x: number, y: number, w: number, h: number): R => ({ x, y, w, h });
    const overlap = (a: R, b: R): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const others: [string, R][] = [
      ['tabs', rect(TABS.x, TABS.y, TABS_RIGHT - TABS.x, TABS.h)],
      ['status', rect(STATUS.x, STATUS.y, STATUS.w, INTERNAL_H - STATUS.y)],
      ['helm block', rect(STATION.x, stationTop('helm'), STATION.w, STATION.h.helm)],
      ['weapons block', rect(STATION.x, stationTop('weapons'), STATION.w, STATION.h.weapons)],
      ['side column', rect(SIDE.x, SIDE.y, SIDE.w, SIDE_H)],
      ['scale bar row', rect(0, INTERNAL_H - 40, INTERNAL_W, 40)],
      ['info line row', rect(0, 0, INTERNAL_W, 30)],
      ['screen centre ± 80', rect(INTERNAL_W / 2 - 80, INTERNAL_H / 2 - 80, 160, 160)]
    ];
    for (const [name, r] of others) expect(overlap(CONTACT, r), name).toBe(false);
  });
```

- [ ] **Step 2: Run them to see them fail.**

Run: `npx vitest run tests/tacticalModel.test.ts tests/duelConsoleModel.test.ts`
Expected: FAIL in the new tests (`pickRadius is not a function`; `SIDE_H`/`CONTACT` undefined).

- [ ] **Step 3: Implement `pickShip`.** In `src/renderer/src/render/tactical/tacticalModel.ts`, insert immediately before the line `const shapeCache = new Map<number, number[]>();`:

```ts
/** Enemy ship window spec §3: a map click's hit radius in internal px at zoom z, the ships loop's cull radius in screen
 *  px (2 R z, or the drawn rings' 1.9 R drawnScale(z)) with a 16 px floor for the chevron zooms. */
export const PICK_MIN_PX = 16;
export function pickRadius(z: number): number { return Math.max(PICK_MIN_PX, 2 * SHIP_RADIUS * z, 1.9 * SHIP_RADIUS * drawnScale(z)); }

/** Spec §6.2: the ship under a map click, or null. Only slots other than the crew's whose ship is active, each at the
 *  interpolated position and camera the map draws with; the nearest hit wins. Reads no reserves. */
export function pickShip(input: Pick<TacticalModelInput, 'state' | 'prev' | 'alpha' | 'camera' | 'viewport'>, p: Point): number | null {
  const r = pickRadius(input.camera.zoom);
  let best: number | null = null, bestD = Infinity;
  for (let i = 0; i < input.state.ships.length; i++) {
    if (i === CREW_SLOT || !input.state.ships[i]!.active) continue;
    const b = interpolatedShip(input.state, input.prev, input.alpha, i), s = worldToScreen(input.camera, input.viewport, b.x, b.y);
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d <= r && d < bestD) { best = i; bestD = d; }
  }
  return best;
}

```

- [ ] **Step 4: Add the layout.** In `src/renderer/src/render/duel/consoleLayout.ts`, replace

```ts
export const SIDE = { x: INTERNAL_W - EDGE - 132, y: 42, w: 132 } as const;
```

with

```ts
export const SIDE = { x: INTERNAL_W - EDGE - 132, y: 42, w: 132 } as const;
/** The side column panel's height (SideColumn). */
export const SIDE_H = 96;
```

and append at the end of the file:

```ts
/** The contact window (enemy ship window spec §4.1): at the right edge, directly below the side column, ending at y 510. */
export const CONTACT = { x: INTERNAL_W - EDGE - 300, y: SIDE.y + SIDE_H + EDGE, w: 300, h: 360 } as const;
/** Its ship drawing box (spec §4.2 item 3): 276 × 200 under the title and status rows. */
export const CONTACT_BOX = { x: CONTACT.x + 12, y: CONTACT.y + 60, w: 276, h: 200 } as const;
/** The map's right reserve while the window is shown, instead of CONSOLE_RESERVE.right: the off-screen arrows and the top
 *  info line keep clear of it. */
export const CONTACT_RESERVE = INTERNAL_W - CONTACT.x + EDGE;
```

- [ ] **Step 5: The side column reads `SIDE_H`.** In `src/renderer/src/ui/duel/SideColumn.tsx`, replace

```ts
import { SIDE } from '../../render/duel/consoleLayout';
```

with

```ts
import { SIDE, SIDE_H } from '../../render/duel/consoleLayout';
```

and replace

```tsx
      <Panel x={SIDE.x} y={SIDE.y} w={SIDE.w} h={96} />
```

with

```tsx
      <Panel x={SIDE.x} y={SIDE.y} w={SIDE.w} h={SIDE_H} />
```

- [ ] **Step 6: Run the tests and the type check.**

Run: `npx vitest run tests/tacticalModel.test.ts tests/duelConsoleModel.test.ts tests/uiConsole.test.tsx`
Expected: PASS, all three files.

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: no output.

- [ ] **Step 7: Commit.**

```bash
git add src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/duel/consoleLayout.ts src/renderer/src/ui/duel/SideColumn.tsx tests/tacticalModel.test.ts tests/duelConsoleModel.test.ts
git commit -m "feat(enemy-window): pickShip for map clicks, and the CONTACT layout below the side column" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The contact model

**Files:**
- Create: `src/renderer/src/render/duel/contactModel.ts`
- Test: `tests/contactModel.test.ts`

**Interfaces:**
- Consumes: `roomLook(crew, level, phase)`, `roomLevel(n)`, `blink`, `DAMAGE_BLINK_HZ`, `HATCH_SPACING`, `HATCH_ANGLE` from `../tactical/crtTheme` (Task 1); `CONTACT_BOX` from `./consoleLayout` (Task 4); `hatchSegments(poly, spacing, angle, out = [])` from `../tactical/dashModel`; `HULLS`, `hullFor`, `roomCentre` from `../tactical/hullModel`; `classOf`, `CREW_SLOT`, `type TacticalState` from `../../sim/tactical/state`; `type WeaponsPanel` from `./consoleModel` (its `charge: ReadoutRow` has `label`, `value`, `bar?: { fill; colour }`).
- Produces (used by Tasks 6, 8, 9):

```ts
export const ROOM_LABELS: readonly ['WEAP', 'SHLD', 'ENG'];
export const CONTACT_PAD = 8;
export interface ContactRoom { label: string; centre: { x: number; y: number }; points: number[]; fill: number | null; stroke: number; hatch: { colour: number; segments: number[] } | null }
export interface ContactLaser { label: string; value: string; fill: number; lit: boolean; enabled: boolean; note: string | null }
export interface ContactView {
  title: string; shields: { up: number; of: number }; hull: { value: number; fill: number };
  box: { x: number; y: number; w: number; h: number }; outline: number[]; rooms: ContactRoom[]; lockRoom: number | null;
  weapons: null | { laser: ContactLaser; missile: { magazine: number } }; aim: boolean;
}
export interface ContactModelInput { state: TacticalState; ship: number; aim: boolean; station: 'helm' | 'weapons'; t: number; weapons: Pick<WeaponsPanel, 'charge'> | null }
export function contactFit(outline: readonly number[], box: { x: number; y: number; w: number; h: number }): (f: number, s: number) => { x: number; y: number };
export function contactModel(i: ContactModelInput): ContactView | null;
```

All points are in internal px (window space). `rooms[k].centre` (where the label and the lock mark sit, `roomCentre` mapped) is the one field beyond the spec's list: React needs a position for the label and the mark.

- [ ] **Step 1: Write the failing test** `tests/contactModel.test.ts`:

```ts
// Enemy ship window spec §4.2, §6.4, §8: the contact window's view model.
import { describe, expect, it } from 'vitest';
import { contactModel, type ContactModelInput, type ContactView } from '../src/renderer/src/render/duel/contactModel';
import { CONTACT_BOX } from '../src/renderer/src/render/duel/consoleLayout';
import { blink, DAMAGE_BLINK_HZ, roomLook } from '../src/renderer/src/render/tactical/crtTheme';
import { classOf, createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { TEXT } from '../src/renderer/src/render/theme';

const charge = { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: TEXT } };
const model = (state: TacticalState, over: Partial<ContactModelInput> = {}): ContactView | null =>
  contactModel({ state, ship: 1, aim: false, station: 'weapons', t: 0, weapons: { charge }, ...over });
const pointsOf = (v: ContactView): number[] => [...v.outline, ...v.rooms.flatMap((r) => [...r.points, ...(r.hatch?.segments ?? []), r.centre.x, r.centre.y])];

describe('the contact view (spec §4.2)', () => {
  it('the title, the shown ship\'s shields and hull, the box and the room labels', () => {
    const st = createTacticalState(4); st.systems[1].shields = 1; st.systems[1].hull = 10;
    const v = model(st)!, cls = classOf(st, 1);
    expect(v.title).toBe('ENEMY SHIP');
    expect(v.shields).toEqual({ up: 1, of: cls.shields.layers });
    expect(v.hull).toEqual({ value: 10, fill: 10 / cls.hull });
    expect(v.box).toEqual(CONTACT_BOX);
    expect(v.rooms.map((r) => r.label)).toEqual(['WEAP', 'SHLD', 'ENG']);
  });
  it('the outline, rooms, hatch and centres lie inside the box with 8 px padding; the outline fills one axis', () => {
    const st = createTacticalState(4); st.systems[1].rooms = [1, 1, 1];
    const v = model(st)!, b = v.box, pts = pointsOf(v);
    for (let k = 0; k < pts.length; k += 2) {
      expect(pts[k]!, `x ${k}`).toBeGreaterThanOrEqual(b.x + 8 - 1e-9); expect(pts[k]!, `x ${k}`).toBeLessThanOrEqual(b.x + b.w - 8 + 1e-9);
      expect(pts[k + 1]!, `y ${k}`).toBeGreaterThanOrEqual(b.y + 8 - 1e-9); expect(pts[k + 1]!, `y ${k}`).toBeLessThanOrEqual(b.y + b.h - 8 + 1e-9);
    }
    const xs = v.outline.filter((_, k) => k % 2 === 0), ys = v.outline.filter((_, k) => k % 2 === 1);
    const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
    expect(Math.max(spanX - (b.w - 16), spanY - (b.h - 16))).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeGreaterThan(v.rooms[0]!.centre.x);   // nose right: Weapons (forward) is right of Engines
    expect(v.rooms[0]!.centre.x).toBeGreaterThan(v.rooms[2]!.centre.x);
  });
  it('each room\'s fill, stroke and hatch colour is roomLook(false, level, phase) in both blink phases', () => {
    const st = createTacticalState(4); st.systems[1].rooms = [0, 1, 2];
    const phases = [0, 0.3].map((t) => blink(t, DAMAGE_BLINK_HZ));
    expect(phases).toEqual([0, 1]);
    for (const t of [0, 0.3]) {
      const v = model(st, { t })!, phase = blink(t, DAMAGE_BLINK_HZ);
      v.rooms.forEach((r, k) => {
        const look = roomLook(false, k as 0 | 1 | 2, phase);
        expect({ fill: r.fill, stroke: r.stroke }, `room ${k} at ${t}`).toEqual({ fill: look.fill, stroke: look.stroke });
        expect(r.hatch?.colour ?? null, `hatch ${k} at ${t}`).toBe(look.hatch);
        if (r.hatch) { expect(r.hatch.segments.length).toBeGreaterThan(0); expect(r.hatch.segments.length % 4).toBe(0); }
      });
    }
  });
  it('the lock room shows only while the shown ship is the crew laser\'s target slot', () => {
    const st = createTacticalState(4, 3); st.ships[2]!.active = true; st.systems[0].lock = 2;
    expect(model(st)!.lockRoom).toBe(2);
    expect(model(st, { ship: 2 })!.lockRoom).toBeNull();
  });
  it('the Helm gets no weapon list and no aim', () => {
    const v = model(createTacticalState(4), { station: 'helm', weapons: null, aim: true })!;
    expect(v.weapons).toBeNull(); expect(v.aim).toBe(false);
  });
  it('Weapons: LASER is the station\'s charge row, lit while armed; MISSILE is the magazine', () => {
    const st = createTacticalState(4), v = model(st, { aim: true })!;
    expect(v.weapons).toEqual({ laser: { label: 'CHARGE', value: '40%', fill: 0.4, lit: true, enabled: true, note: null }, missile: { magazine: st.systems[0].magazine } });
    expect(v.aim).toBe(true);
  });
  it('a ship that is not the laser\'s target: LASER disabled, NOT TARGETED', () => {
    const st = createTacticalState(4, 3); st.ships[2]!.active = true;
    expect(model(st, { ship: 2 })!.weapons!.laser).toMatchObject({ enabled: false, note: 'NOT TARGETED' });
  });
  it('null for an inactive ship', () => {
    const st = createTacticalState(4, 3);
    expect(model(st, { ship: 2 })).toBeNull();
    st.ships[1].active = false;
    expect(model(st)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx vitest run tests/contactModel.test.ts`
Expected: FAIL (`Failed to resolve import "../src/renderer/src/render/duel/contactModel"`).

- [ ] **Step 3: Write the model** `src/renderer/src/render/duel/contactModel.ts`:

```ts
// The contact window's view model (enemy ship window spec §4.2, §6.4). Pure: one map contact (here an enemy ship) as
// screen-ready data in internal px: the title, shields and hull, the hull outline and its rooms fitted to the drawing
// box with each room's resolved damage look for this frame's blink phase, the laser's lock room, and the Weapons
// station's weapon list. `t` is the scene's presentation clock (performance.now() / 1000), so the window blinks with
// the map frame for frame; React draws only what this returns.
import { classOf, CREW_SLOT, type TacticalState } from '../../sim/tactical/state';
import { blink, DAMAGE_BLINK_HZ, HATCH_ANGLE, HATCH_SPACING, roomLevel, roomLook } from '../tactical/crtTheme';
import { hatchSegments } from '../tactical/dashModel';
import { HULLS, hullFor, roomCentre } from '../tactical/hullModel';
import { CONTACT_BOX } from './consoleLayout';
import type { WeaponsPanel } from './consoleModel';

/** The room labels, rooms[0] Weapons, rooms[1] Shields, rooms[2] Engines (the lock buttons' words). */
export const ROOM_LABELS = ['WEAP', 'SHLD', 'ENG'] as const;
/** Internal px kept clear between the outline and the drawing box's edges. */
export const CONTACT_PAD = 8;

export interface ContactRoom {
  label: string;
  /** roomCentre in window space: where the label and the lock mark sit. */
  centre: { x: number; y: number };
  /** The room polygon, flat [x, y, ...] in internal px. */
  points: number[];
  fill: number | null; stroke: number;
  /** Null when roomLook gives no hatch; else its colour and flat segment endpoints [x1, y1, x2, y2, ...]. */
  hatch: { colour: number; segments: number[] } | null;
}
export interface ContactLaser { label: string; value: string; fill: number; lit: boolean; enabled: boolean; note: string | null }
export interface ContactView {
  title: string;
  shields: { up: number; of: number };
  hull: { value: number; fill: number };
  /** The drawing box in internal px (CONTACT_BOX). */
  box: { x: number; y: number; w: number; h: number };
  outline: number[];
  rooms: ContactRoom[];
  /** The crew laser's lock room, only while the shown ship is its target slot. */
  lockRoom: number | null;
  /** Weapons only: LASER (the station block's charge row) and MISSILE (not aimable). */
  weapons: null | { laser: ContactLaser; missile: { magazine: number } };
  /** The aim is armed (Weapons only). */
  aim: boolean;
}
export interface ContactModelInput {
  state: TacticalState;
  /** The shown ship slot. */
  ship: number;
  aim: boolean;
  station: 'helm' | 'weapons';
  /** Presentation seconds, for the damage blink. */
  t: number;
  /** The Weapons station block's panel (its charge row), or null at the Helm. */
  weapons: Pick<WeaponsPanel, 'charge'> | null;
}

/** Ship units (f, s) to the box: one uniform scale fitting the outline's bounds with CONTACT_PAD on every side, the
 *  bounds centred, nose right (f to +x, s to +y). */
export function contactFit(outline: readonly number[], box: { x: number; y: number; w: number; h: number }): (f: number, s: number) => { x: number; y: number } {
  let f0 = Infinity, f1 = -Infinity, s0 = Infinity, s1 = -Infinity;
  for (let k = 0; k + 1 < outline.length; k += 2) {
    const f = outline[k]!, s = outline[k + 1]!;
    f0 = Math.min(f0, f); f1 = Math.max(f1, f); s0 = Math.min(s0, s); s1 = Math.max(s1, s);
  }
  const k = Math.min((box.w - 2 * CONTACT_PAD) / (f1 - f0), (box.h - 2 * CONTACT_PAD) / (s1 - s0));
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, mf = (f0 + f1) / 2, ms = (s0 + s1) / 2;
  return (f, s) => ({ x: cx + (f - mf) * k, y: cy + (s - ms) * k });
}

export function contactModel(i: ContactModelInput): ContactView | null {
  const { state } = i, body = state.ships[i.ship];
  if (!body || !body.active) return null;
  const sys = state.systems[i.ship]!, cls = classOf(state, i.ship), crew = state.systems[CREW_SLOT];
  const hull = hullFor(false), shape = HULLS[hull], box = { x: CONTACT_BOX.x, y: CONTACT_BOX.y, w: CONTACT_BOX.w, h: CONTACT_BOX.h };
  const at = contactFit(shape.outline, box);
  const place = (poly: readonly number[]): number[] => {
    const out: number[] = [];
    for (let k = 0; k + 1 < poly.length; k += 2) { const p = at(poly[k]!, poly[k + 1]!); out.push(p.x, p.y); }
    return out;
  };
  const phase = blink(i.t, DAMAGE_BLINK_HZ), targeted = crew.target === i.ship;
  const rooms: ContactRoom[] = shape.rooms.map((poly, r) => {
    const look = roomLook(false, roomLevel(sys.rooms[r] ?? 0), phase), points = place(poly), c = roomCentre(hull, r);
    return {
      label: ROOM_LABELS[r] ?? '', centre: at(c.f, c.s), points, fill: look.fill, stroke: look.stroke,
      hatch: look.hatch === null ? null : { colour: look.hatch, segments: hatchSegments(points, HATCH_SPACING, HATCH_ANGLE) }
    };
  });
  const weapons = i.station === 'weapons' && i.weapons
    ? {
        laser: { label: i.weapons.charge.label, value: i.weapons.charge.value, fill: i.weapons.charge.bar?.fill ?? 0, lit: i.aim, enabled: targeted, note: targeted ? null : 'NOT TARGETED' },
        missile: { magazine: crew.magazine }
      }
    : null;
  return {
    title: 'ENEMY SHIP',
    shields: { up: sys.shields, of: cls.shields.layers },
    hull: { value: sys.hull, fill: Math.max(0, Math.min(1, sys.hull / cls.hull)) },
    box, outline: place(shape.outline), rooms,
    lockRoom: targeted ? crew.lock : null,
    weapons,
    aim: i.aim && weapons !== null
  };
}
```

- [ ] **Step 4: Run the test and the type check.**

Run: `npx vitest run tests/contactModel.test.ts`
Expected: PASS (8 tests).

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: no output.

- [ ] **Step 5: Commit.**

```bash
git add src/renderer/src/render/duel/contactModel.ts tests/contactModel.test.ts
git commit -m "feat(enemy-window): the contact view model (scout outline and rooms fitted to the box, room looks, lock, weapon list)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The scene draws the contact window's frame

**Files:**
- Modify: `src/renderer/src/render/duel/consoleModel.ts:40-42` (add and use `consoleStation`)
- Modify: `src/renderer/src/ui/views.ts:1-13` (`DuelUiView.contact`)
- Modify: `src/renderer/src/app/duel/scene.ts` (imports; replace `createDuelScene` whole)
- Test: create `tests/contactScene.test.ts`; modify `tests/duelConsoleModel.test.ts`

**Interfaces:**
- Consumes: `createContactController`, `type ContactController` (Task 2: `click(slot | null)`, `sync({ shown, station, target, active, epoch }): boolean`, `state(): { ship; aim } | null`); `pickShip(input: Pick<TacticalModelInput, 'state'|'prev'|'alpha'|'camera'|'viewport'>, p)` (Task 4); `CONTACT_RESERVE` (Task 4); `contactModel({ state, ship, aim, station, t, weapons })`, `type ContactView` (Task 5).
- Produces (used by Tasks 7, 8, 9):
  - `consoleStation(d: DuelState, me: 0 | 1): ConsoleStation` exported from `consoleModel.ts`;
  - `DuelUiView.contact?: ContactView | null`;
  - `interface DuelSceneOptions { seed: number; pauseText: string; ui: DuelSink; audio?: AudioOut; contact?: ContactController; takeClick?: () => { x: number; y: number } | null }` exported from `scene.ts`; `createDuelScene(renderer, options: DuelSceneOptions)`. With `contact` set, every frame carries `contact` (the view or null); without it the frame has no `contact` key and nothing changes.

- [ ] **Step 1: Write the failing tests.**

(a) Create `tests/contactScene.test.ts`:

```ts
// Enemy ship window spec §6.5, §8 (the scene test): the duel scene takes a map click over the enemy at the Weapons
// console and hands the UI a contact view; a click while the console is hidden opens nothing; a pause clears an open
// window on that frame. The real runtime, scene and tactical layer in node, as interiorZoomScene.test.ts does.
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { interpolatedShip } from '../src/renderer/src/render/tactical/tacticalModel';
import { emptyPresses, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createDuelScene } from '../src/renderer/src/app/duel/scene';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';

const layout = parseShip(cutter);
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
const vp = { w: 1280, h: 720 };
const LIVE = { banner: null, layerPaused: false, end: null };
const PAUSED = { banner: 'PAUSED', layerPaused: true, end: null };

function rig() {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
  const tasks: { at: number; cb: () => void }[] = [];
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout,
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    clearKeys: () => { keys = { ...keys, presses: emptyPresses() }; }
  });
  const press = (a: KeyAction): void => { keys = { ...keys, presses: { ...keys.presses, [a]: 1 } }; };
  const tick = (): void => { rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
  const stage = new Container();
  const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
  const store = createUiStore({ onlineAvailable: false } as never), contact = createContactController(), clicks: { x: number; y: number }[] = [];
  const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store), contact, takeClick: () => clicks.shift() ?? null });
  // createDuel seats player 0 at the Helm and player 1 at Weapons: Tab takes the gunner.
  press('switch'); tick(); tick();
  const enemyOnScreen = () => { const b = interpolatedShip(rt.duel.tactical, rt.prev, rt.alpha(), 1); return worldToScreen(rt.cameras.weapons, vp, b.x, b.y); };
  const view = () => store.getState().duel?.contact;
  return { rt, store, contact, clicks, scene, enemyOnScreen, view };
}

describe('the scene and the contact window (spec §6.5)', () => {
  it('a click over the enemy at the Weapons console opens the contact view; a pause clears it on that frame', () => {
    const r = rig();
    try {
      expect(r.rt.view()).toBe('weapons');
      r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.view()).toBeNull();
      r.clicks.push(r.enemyOnScreen()); r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.contact.state()).toEqual({ ship: 1, aim: false });
      expect(r.view()?.title).toBe('ENEMY SHIP');
      expect(r.view()?.weapons?.laser.enabled).toBe(true);
      expect(r.view()?.lockRoom).toBe(r.rt.duel.tactical.systems[0].lock);
      r.scene.draw(r.rt, 1 / 60, LIVE);   // stays open without a click
      expect(r.view()?.title).toBe('ENEMY SHIP');
      r.scene.draw(r.rt, 1 / 60, PAUSED);
      expect(r.view()).toBeNull(); expect(r.contact.state()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('with the console hidden a click over the enemy opens nothing, and the click is not kept for later', () => {
    const r = rig();
    try {
      r.clicks.push(r.enemyOnScreen()); r.scene.draw(r.rt, 1 / 60, PAUSED);
      expect(r.contact.state()).toBeNull(); expect(r.view()).toBeNull();
      expect(r.clicks).toHaveLength(0);
      r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.contact.state()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
  it('a click on empty space opens nothing', () => {
    const r = rig();
    try {
      const e = r.enemyOnScreen();
      r.clicks.push({ x: e.x + 200, y: e.y + 200 }); r.scene.draw(r.rt, 1 / 60, LIVE);
      expect(r.contact.state()).toBeNull(); expect(r.view()).toBeNull();
    } finally { r.scene.dispose(); r.rt.dispose(); }
  });
});
```

(b) In `tests/duelConsoleModel.test.ts`, replace the import

```ts
import { consoleModel, consoleTabs, type ConsoleModelInput } from '../src/renderer/src/render/duel/consoleModel';
```

with

```ts
import { consoleModel, consoleStation, consoleTabs, type ConsoleModelInput } from '../src/renderer/src/render/duel/consoleModel';
```

and inside `describe('station panels', () => {`, before the test `'hidden gives null'`, add:

```ts
  it('consoleStation: the seat, or SHIP while standing (enemy ship window spec §6.5 step 1)', () => {
    const d = createDuel(layout, 5);
    expect(consoleStation(d, 0)).toBe('helm'); expect(consoleStation(d, 1)).toBe('weapons');
    step(d, 0, { kind: 'stand' });
    expect(consoleStation(d, 0)).toBe('ship'); expect(model(d)!.station).toBe('ship');
    disposeDuel(d);
  });
```

- [ ] **Step 2: Run them to see them fail.**

Run: `npx vitest run tests/contactScene.test.ts tests/duelConsoleModel.test.ts`
Expected: FAIL (`consoleStation is not a function`; the scene ignores `contact`, so `r.view()` is `undefined` and the state stays null).

- [ ] **Step 3: `consoleStation`.** In `src/renderer/src/render/duel/consoleModel.ts`, replace

```ts
export function consoleModel(i: ConsoleModelInput): ConsoleView | null {
  if (i.hidden) return null;
  const d = i.duel, seat = seatOf(d, i.me), station: ConsoleStation = seat === 'standing' ? 'ship' : seat;
```

with

```ts
/** The station a character's console shows (spec §6.3): its seat, or SHIP while standing. The scene reads it before the
 *  map is built (enemy ship window spec §6.5 step 1). */
export function consoleStation(d: DuelState, me: 0 | 1): ConsoleStation {
  const seat = seatOf(d, me);
  return seat === 'standing' ? 'ship' : seat;
}

export function consoleModel(i: ConsoleModelInput): ConsoleView | null {
  if (i.hidden) return null;
  const d = i.duel, seat = seatOf(d, i.me), station = consoleStation(d, i.me);
```

- [ ] **Step 4: `DuelUiView.contact`.** In `src/renderer/src/ui/views.ts`, replace

```ts
import type { ConsoleView } from '../render/duel/consoleModel';
```

with

```ts
import type { ConsoleView } from '../render/duel/consoleModel';
import type { ContactView } from '../render/duel/contactModel';
```

and replace

```ts
  console?: ConsoleView | null }
```

with

```ts
  console?: ConsoleView | null;
  /** The contact window (enemy ship window spec §6.5): set while it is shown; absent or null draws no window. */
  contact?: ContactView | null }
```

- [ ] **Step 5: The scene.** In `src/renderer/src/app/duel/scene.ts`:

(a) Replace the imports

```ts
import { CONSOLE_RESERVE } from '../../render/duel/consoleLayout';
import { consoleModel, type ConsoleStation } from '../../render/duel/consoleModel';
```

with

```ts
import { CONSOLE_RESERVE, CONTACT_RESERVE } from '../../render/duel/consoleLayout';
import { consoleModel, consoleStation, type ConsoleStation } from '../../render/duel/consoleModel';
import { contactModel } from '../../render/duel/contactModel';
```

replace

```ts
import { tacticalModel, type PrevBody } from '../../render/tactical/tacticalModel';
```

with

```ts
import { pickShip, tacticalModel, type PrevBody } from '../../render/tactical/tacticalModel';
```

and replace

```ts
import type { HeldFlags } from './input';
```

with

```ts
import type { HeldFlags } from './input';
import type { ContactController } from './contactController';
```

(b) Replace the whole function `createDuelScene`, from the line `export function createDuelScene(renderer: Renderer, options: { seed: number; pauseText: string; ui: DuelSink; audio?: AudioOut }) {` through its closing `}` (the line just before `export type DuelScene = ReturnType<typeof createDuelScene>;`), with:

```ts
export interface DuelSceneOptions {
  seed: number; pauseText: string; ui: DuelSink; audio?: AudioOut;
  /** The contact window's controller (enemy ship window spec §6.1, §6.5): map clicks open it, `sync` applies the closing
   *  rules each frame, and every frame carries `contact`. Absent: no window and no `contact` key in the frame. */
  contact?: ContactController;
  /** The last left-button press on the canvas since the previous frame, in internal px (spec §6.2); drained every frame. */
  takeClick?: () => { x: number; y: number } | null;
}

export function createDuelScene(renderer: Renderer, options: DuelSceneOptions) {
  const viewport = { w: INTERNAL_W, h: INTERNAL_H }, font = renderer.assets.fontFamily;
  const hidden = renderer.app.stage.children.filter((child) => child.visible);
  for (const child of hidden) child.visible = false;   // world, enemy window, projectiles, callouts, HUD; shown again on dispose
  const root = new Container(), scene = new Container();
  const layer = createTacticalLayer({ fontFamily: font, viewport, seed: options.seed });
  let interior: InteriorView = createInteriorView(renderer.assets, renderer.stageScale, renderer.feel);
  scene.addChild(layer.container, interior.container);
  root.addChild(scene);
  renderer.app.stage.addChild(root);
  const fx = createFx();
  const sound = options.audio ? createDuelAudio(options.audio) : null;   // Audio-i spec section 4b: both modes, so Single player is no longer silent
  let epoch: number | null = null;
  return {
    /** One frame from `source`; `dt` in seconds. Returns the station of the console drawn, or null when none (Artemis
     *  spec §6.2: the mode clears the console's holds when it changes). */
    draw(source: DuelViewSource, dt: number, overlay: SceneOverlay): ConsoleStation | null {
      if (epoch === null) { epoch = source.epoch(); if (source.seed !== options.seed) layer.reseed(source.seed); }   // the online duel learns its seed from the first publication
      if (source.epoch() !== epoch) {   // a new round (a restart before H-2): every view-owned cache starts again
        epoch = source.epoch();
        resetFx(fx); layer.reset(); layer.reseed(source.seed); sound?.reset();   // the next round's star field; a fresh audio baseline
        interior.destroy(); interior = createInteriorView(renderer.assets, renderer.stageScale, renderer.feel); scene.addChildAt(interior.container, 1);
      }
      const d = source.duel, view = source.view(), alpha = source.alpha(), contact = options.contact;
      // Everything the console changes follows whether it is drawn (Artemis spec §6.1): a paused or decided console view
      // falls back to the right-hand readout with its rows and help.
      const hidden = consoleHidden(d, overlay, source.running()), onConsole = !hidden && view !== 'interior';
      // Enemy ship window spec §6.5 steps 1 to 3: the station from the seat, this frame's map click, then the closing rules.
      const station = hidden ? null : consoleStation(d, source.active());
      const aimable = view !== 'interior' && (station === 'helm' || station === 'weapons');
      const click = options.takeClick?.() ?? null;   // drained every frame, so a click never waits for a later frame
      if (contact && click && aimable && view !== 'interior')
        contact.click(pickShip({ state: d.tactical, prev: source.prev, alpha, camera: source.cameras[view], viewport }, click));
      const shown = contact
        ? contact.sync({ shown: aimable, station, target: d.tactical.systems[CREW_SLOT]!.target, active: (slot) => d.tactical.ships[slot]?.active === true, epoch: source.epoch() })
        : false;
      const t = performance.now() / 1000;   // the presentation clock: the map's blinks and the window's, frame for frame
      const events = source.drainEvents();
      pushEvents(fx, events);
      if (sound) {   // Audio-i spec section 4: the same events the effects use; pan from the screen on a map view, crew-relative inside
        const cam = view === 'interior' ? null : source.cameras[view], crew = d.tactical.ships[CREW_SLOT]!;
        sound.frame({ duel: d, events, axes: source.axes(), paused: source.paused(), live: source.live?.() ?? true,
          pan: (x, y) => (cam ? screenPan(worldToScreen(cam, viewport, x, y).x, viewport.w) : worldPan(x - crew.x)) });
      }
      stepFx(fx, source.paused() ? 0 : dt);
      recordTrails(fx, d.tactical, source.missilePrev, alpha);
      layer.container.visible = view !== 'interior'; interior.container.visible = view === 'interior';
      let overlayView: MapOverlayView | null = null;
      if (view === 'interior') interior.draw(d, source.crewPrev, alpha, dt, events, source.paused() ? 0 : dt, { camera: source.interiorCamera, active: source.active() });   // Art-i spec section 7: the light and feel hold while paused
      else {
        // Step 4: the map keeps its arrows and info line clear of the window while it is shown.
        const input = {
          state: d.tactical, prev: source.prev, alpha, camera: source.cameras[view], viewport, console: view, axes: source.axes(),
          ships: [0, 1], paused: overlay.layerPaused,
          ...(onConsole ? { reserveLeft: CONSOLE_RESERVE.left, reserveRight: shown ? CONTACT_RESERVE : CONSOLE_RESERVE.right } : { reserveRight: READOUT_COLUMN }),
          spreadArrows: true, missilePrev: source.missilePrev, steer: source.steer(), fx
        } as const;
        const model = tacticalModel(input);
        layer.setCrt(crtScale(renderer.crt()));   // CRT map spec sections 3-4: the filter strength follows the setting
        layer.draw(model, combatModel(input), t);   // the blinks run on the presentation clock, paused or not
        overlayView = mapOverlayOf(model.overlay);
      }
      const consoleView = consoleModel({ duel: d, me: source.active(), mode: source.mode, hidden, held: source.uiHeld(), overlay: overlayView });
      // Step 5: the contact view, only while shown.
      const open = contact?.state() ?? null;
      const contactView = shown && open && (station === 'helm' || station === 'weapons')
        ? contactModel({ state: d.tactical, ship: open.ship, aim: open.aim, station, t, weapons: consoleView?.weapons ?? null })
        : null;
      options.ui.frame({
        readout: { rows: readoutRows({ duel: d, mode: view, active: source.active(), other: source.otherStatus(), console: onConsole }), help: onConsole ? [] : readoutHelp(view) },
        end: overlay.end,
        console: consoleView,
        crt: crtActive(view),
        ...sceneUi(view, overlay, options.pauseText, overlayView),
        ...(contact ? { contact: contactView } : {})
      });
      const shake = view === 'interior' ? { x: 0, y: 0 } : shakeOffset(fx);   // Art-i spec section 7: the interior shakes its own world; the console views keep the fx shake
      scene.position.set(shake.x, shake.y);
      return consoleView?.station ?? null;
    },
    dispose(): void {
      options.ui.clear();
      interior.destroy();
      renderer.app.stage.removeChild(root); root.destroy({ children: true });
      for (const child of hidden) child.visible = true;
    }
  };
}
```

- [ ] **Step 6: Run the tests and the type check.**

Run: `npx vitest run tests/contactScene.test.ts tests/duelConsoleModel.test.ts tests/interiorZoomScene.test.ts tests/sceneUi.test.ts tests/consoleHidden.test.ts`
Expected: PASS, all five files.

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: no output.

- [ ] **Step 7: Commit.**

```bash
git add src/renderer/src/render/duel/consoleModel.ts src/renderer/src/ui/views.ts src/renderer/src/app/duel/scene.ts tests/contactScene.test.ts tests/duelConsoleModel.test.ts
git commit -m "feat(enemy-window): the scene picks the clicked ship, syncs the contact window and hands the UI its view" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Wire the controller into both duel modes and the UI actions

**Files:**
- Modify: `src/renderer/src/ui/actions.ts:3,42-52`
- Modify: `src/renderer/src/app/duel/duelMode.ts:10-16,33-43,86`
- Modify: `src/renderer/src/app/duel/onlineDuel.ts:28-32,46-47,75-76,242,272`
- Modify: `src/renderer/src/main.ts:87,95,186`
- Test: `tests/uiActions.test.ts`, `tests/duelModeDispose.test.ts`, `tests/onlineDuelSession.test.ts`

**Interfaces:**
- Consumes: `createContactController`, `type ContactActions`, `type ContactController` (Task 2: `intercept(code): boolean`, `sync(...)`, `click(slot)`, `state()`); `createDuelKeyboard(target, { intercept })` and `pointer.takeClick()` (Task 3); `createDuelScene(renderer, { ..., contact, takeClick })` (Task 6).
- Produces (used by Tasks 8, 9): `actions.contact: { close(): void; arm(): void; cancelAim(): void; pick(room: number): void }` and `actions.setContact(c: ContactActions | null): void` (no-ops while none is set; `pick` hands the controller the console lock, `actions.console.lock`); `DuelModeDeps.setContact?(c: ContactActions | null): void`; `OnlineDuelDeps.setContact?(c: ContactActions | null): void`.

- [ ] **Step 1: Write the failing tests.**

(a) Append to `tests/uiActions.test.ts`:

```ts

describe('the contact window\'s actions (enemy ship window spec §6.6)', () => {
  it('forward to the controller set with setContact; pick locks through the console input; no-ops while none is set', () => {
    const { actions } = makeUi();
    expect(() => { actions.contact.close(); actions.contact.arm(); actions.contact.cancelAim(); actions.contact.pick(1); }).not.toThrow();
    const lock = vi.fn();
    actions.setConsole({ press: vi.fn(), hold: vi.fn(), lock });
    const c = { close: vi.fn(), arm: vi.fn(), cancelAim: vi.fn(), pick: vi.fn((room: number, l: (r: number) => void) => l(room)) };
    actions.setContact(c);
    actions.contact.close(); actions.contact.arm(); actions.contact.cancelAim(); actions.contact.pick(2);
    expect([c.close.mock.calls.length, c.arm.mock.calls.length, c.cancelAim.mock.calls.length, c.pick.mock.calls.length]).toEqual([1, 1, 1, 1]);
    expect(c.pick.mock.calls[0]![0]).toBe(2);
    expect(lock).toHaveBeenCalledWith(2);
    actions.setContact(null); actions.contact.arm();
    expect(c.arm).toHaveBeenCalledTimes(1);
  });
});
```

(b) In `tests/duelModeDispose.test.ts`, make the input mock record the keyboard's options. Replace

```ts
  createDuelKeyboard: () => ({ sample() {}, clear() {}, destroy() {} }), createPointerSource: () => ({ sample() {}, clear() {}, destroy() {} })
```

with

```ts
  createDuelKeyboard: (_t: unknown, o?: { intercept?(code: string): boolean }) => { h.kbOpts = o; return { sample() {}, clear() {}, destroy() {} }; }, createPointerSource: () => ({ sample() {}, clear() {}, destroy() {} })
```

and change `const h = vi.hoisted(() => ({ disposes: 0 }));` to `const h = vi.hoisted(() => ({ disposes: 0, kbOpts: undefined as undefined | { intercept?(code: string): boolean } }));`. If the mock object in the file already differs (for example it gained `ui` or `takeClick` in this task), keep those members and only add the options capture. Then append:

```ts

it('hands its contact controller to setContact on start and null on dispose (enemy ship window spec §6.1)', () => {
  const w = { addEventListener() {}, removeEventListener() {} };
  (globalThis as Record<string, unknown>).window = w; (globalThis as Record<string, unknown>).document = { addEventListener() {}, removeEventListener() {} };
  const setContact = vi.fn();
  const renderer = { app: { canvas: {}, ticker: { add() {}, remove() {} } } };
  const dispose = startDuelMode({ renderer: renderer as never, seed: 1, ui: createDuelSink(createUiStore({ onlineAvailable: false })), layout: {} as never, setContact });
  expect(setContact).toHaveBeenCalledTimes(1);
  const c = setContact.mock.calls[0]![0] as { close: unknown; arm: unknown; cancelAim: unknown; pick: unknown };
  expect([typeof c.close, typeof c.arm, typeof c.cancelAim, typeof c.pick]).toEqual(['function', 'function', 'function', 'function']);
  dispose();
  expect(setContact).toHaveBeenCalledTimes(2); expect(setContact.mock.calls[1]![0]).toBeNull();
  delete (globalThis as Record<string, unknown>).window; delete (globalThis as Record<string, unknown>).document;
});

it('passes the contact controller's intercept to the keyboard: a shown window takes Escape (spec §6.2)', () => {
  const w = { addEventListener() {}, removeEventListener() {} };
  (globalThis as Record<string, unknown>).window = w; (globalThis as Record<string, unknown>).document = { addEventListener() {}, removeEventListener() {} };
  const setContact = vi.fn();
  const renderer = { app: { canvas: {}, ticker: { add() {}, remove() {} } } };
  const dispose = startDuelMode({ renderer: renderer as never, seed: 1, ui: createDuelSink(createUiStore({ onlineAvailable: false })), layout: {} as never, setContact });
  const c = setContact.mock.calls[0]![0] as import('../src/renderer/src/app/duel/contactController').ContactController;
  c.click(1);
  c.sync({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0 });
  expect(h.kbOpts?.intercept?.('Escape')).toBe(true);
  expect(c.state()).toBeNull();
  dispose();
  delete (globalThis as Record<string, unknown>).window; delete (globalThis as Record<string, unknown>).document;
});
```

(c) In `tests/onlineDuelSession.test.ts`, replace

```ts
import type { ConsoleInput } from '../src/renderer/src/app/duel/input';
```

with

```ts
import type { ConsoleInput } from '../src/renderer/src/app/duel/input';
import type { ContactController, ContactSync } from '../src/renderer/src/app/duel/contactController';
```

and append at the end of the file:

```ts

describe('the contact window online (enemy ship window spec §3, §6.2)', () => {
  const contactOf = (): ContactController => (h.sceneOpts.at(-1) as unknown as { contact: ContactController }).contact;
  const frame: ContactSync = { shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0 };
  /** What the scene does on a frame with a map click on the enemy at Weapons (the scene is stubbed here). */
  const show = (c: ContactController): void => { c.sync(frame); c.click(1); c.sync(frame); };
  it('with the window shown, Escape only closes it and sends no setPaused; with it closed, Escape pauses as before', () => {
    const r = rig(1), c = r.attach(), contact = contactOf();
    show(contact);
    r.key('keydown', 'Escape'); r.key('keyup', 'Escape'); r.pump();
    expect(c.commands().some((x) => x.kind === 'setPaused')).toBe(false);
    expect(contact.state()).toBeNull();
    r.key('keydown', 'Escape'); r.key('keyup', 'Escape'); r.pump();
    expect(c.commands().filter((x) => x.kind === 'setPaused')).toEqual([{ kind: 'setPaused', paused: true }]);
    r.dispose();
  });
  it('on a decided round with the window shown, Escape opens no leave prompt: Enter then sends a rematch and does not leave', () => {
    const r = rig(1), c = r.attach(), contact = contactOf();
    decide(r.d); c.publish(r.d); r.pump();
    show(contact);
    r.key('keydown', 'Escape'); r.key('keyup', 'Escape'); r.pump();
    r.key('keydown', 'Enter'); r.key('keyup', 'Enter'); r.pump();
    expect(r.leave).not.toHaveBeenCalled();
    expect(c.commands().filter((x) => x.kind === 'rematch')).toHaveLength(1);
    r.dispose();
  });
  it('hands the scene its controller and a click source, and calls setContact with it on creation and null on dispose', () => {
    const setContact = vi.fn();
    const r = rig(0, undefined, undefined, { setContact }); r.attach();
    expect(setContact).toHaveBeenCalledTimes(1);
    const opts = h.sceneOpts.at(-1) as unknown as { contact: unknown; takeClick: unknown };
    expect(opts.contact).toBe(setContact.mock.calls[0]![0]);
    expect(typeof opts.takeClick).toBe('function');
    r.dispose();
    expect(setContact).toHaveBeenCalledTimes(2); expect(setContact.mock.calls[1]![0]).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

Run: `npx vitest run tests/uiActions.test.ts tests/duelModeDispose.test.ts tests/onlineDuelSession.test.ts`
Expected: FAIL in the new tests (`actions.contact` undefined; `setContact` never called; `opts.contact` undefined, and the first Escape sends a setPaused).

- [ ] **Step 3: The UI actions.** In `src/renderer/src/ui/actions.ts`:

(a) Replace

```ts
import type { ConsoleInput } from '../app/duel/input';
```

with

```ts
import type { ConsoleInput } from '../app/duel/input';
import type { ContactActions } from '../app/duel/contactController';
```

(b) Replace

```ts
  return {
    console: consoleActions,
    setConsole(input: ConsoleInput | null): void { consoleInput = input; },
```

with

```ts
  // The contact window's clicks (enemy ship window spec §6.6) go to the duel mode's contact controller while one is set;
  // a pick locks through the console input, the same path as the WEAP/SHLD/ENG buttons. A no-op otherwise.
  let contactInput: ContactActions | null = null;
  const contactActions = {
    close: (): void => contactInput?.close(),
    arm: (): void => contactInput?.arm(),
    cancelAim: (): void => contactInput?.cancelAim(),
    pick: (room: number): void => contactInput?.pick(room, (r) => consoleActions.lock(r))
  };

  return {
    console: consoleActions,
    contact: contactActions,
    setConsole(input: ConsoleInput | null): void { consoleInput = input; },
    setContact(controller: ContactActions | null): void { contactInput = controller; },
```

- [ ] **Step 4: Single player.** In `src/renderer/src/app/duel/duelMode.ts`:

(a) Replace

```ts
import { consoleChange } from './consoleChange';
```

with

```ts
import { consoleChange } from './consoleChange';
import { createContactController, type ContactActions } from './contactController';
```

(b) Replace

```ts
  setConsole?(input: ConsoleInput | null): void;
}
```

with

```ts
  setConsole?(input: ConsoleInput | null): void;
  /** The contact window's click slot (enemy ship window spec §6.1, §6.6): filled with this duel's controller, emptied on dispose. */
  setContact?(contact: ContactActions | null): void;
}
```

(c) Replace

```ts
  const scene = createDuelScene(renderer, { seed: deps.seed, pauseText, ui: deps.ui, audio: deps.audio });
  const canvas = renderer.app.canvas;
  const keyboard = createDuelKeyboard(window as unknown as EventSource);
  deps.setConsole?.(keyboard.ui);
```

with

```ts
  // Enemy ship window spec §6.1: the contact window's state, local to this screen; its intercept takes Esc and T first.
  const contact = createContactController();
  const scene = createDuelScene(renderer, { seed: deps.seed, pauseText, ui: deps.ui, audio: deps.audio, contact, takeClick: () => pointer.takeClick() });
  const canvas = renderer.app.canvas;
  const keyboard = createDuelKeyboard(window as unknown as EventSource, { intercept: (code) => contact.intercept(code) });
  deps.setConsole?.(keyboard.ui);
  deps.setContact?.(contact);
```

(`pointer` is declared a few lines below; the arrow only reads it when the scene draws, after it exists.)

(d) Replace

```ts
    deps.setConsole?.(null);
    keyboard.destroy(); pointer.destroy(); runtime.dispose(); scene.dispose();
```

with

```ts
    deps.setConsole?.(null); deps.setContact?.(null);
    keyboard.destroy(); pointer.destroy(); runtime.dispose(); scene.dispose();
```

- [ ] **Step 5: Online.** In `src/renderer/src/app/duel/onlineDuel.ts`:

(a) Replace

```ts
import { consoleChange } from './consoleChange';
import { createOnlineDuelSource, type OnlineDuelSource } from './onlineSource';
```

with

```ts
import { consoleChange } from './consoleChange';
import { createContactController, type ContactActions } from './contactController';
import { createOnlineDuelSource, type OnlineDuelSource } from './onlineSource';
```

(b) Replace

```ts
  /** The console's click slot (Artemis spec §6.2): filled with this session's keyboard, emptied on dispose. */
  setConsole?(input: ConsoleInput | null): void;
}
```

with

```ts
  /** The console's click slot (Artemis spec §6.2): filled with this session's keyboard, emptied on dispose. */
  setConsole?(input: ConsoleInput | null): void;
  /** The contact window's click slot (enemy ship window spec §6.1, §6.6): filled with this session's controller, emptied on dispose. */
  setContact?(contact: ContactActions | null): void;
}
```

(c) Replace

```ts
  const keyboard = createDuelKeyboard(window as unknown as EventSource);
  deps.setConsole?.(keyboard.ui);
```

with

```ts
  // Enemy ship window spec §6.1, §6.2: local to this screen, never sent. While the window is shown its intercept takes Esc
  // (and T), so the leave prompt and setPaused below never see that Escape.
  const contact = createContactController();
  const keyboard = createDuelKeyboard(window as unknown as EventSource, { intercept: (code) => contact.intercept(code) });
  deps.setConsole?.(keyboard.ui);
  deps.setContact?.(contact);
```

(d) Replace

```ts
      scene ??= createDuelScene(deps.renderer, { seed: 0, pauseText: 'PAUSED', ui: deps.ui, audio: deps.audio });
```

with

```ts
      // Spec §6.2: a map click counts only while this window has focus and input is not blocked; otherwise it is drained and dropped.
      scene ??= createDuelScene(deps.renderer, { seed: 0, pauseText: 'PAUSED', ui: deps.ui, audio: deps.audio, contact,
        takeClick: () => { const click = pointer.takeClick(); return focused && !blocked ? click : null; } });
```

(e) Replace

```ts
      deps.setConsole?.(null);
      keyboard.destroy(); pointer.destroy(); debug.destroy();
```

with

```ts
      deps.setConsole?.(null); deps.setContact?.(null);
      keyboard.destroy(); pointer.destroy(); debug.destroy();
```

- [ ] **Step 6: The app.** In `src/renderer/src/main.ts`, make three replacements (each adds `setContact` beside `setConsole`):

Replace

```ts
        onExit: () => { session.home(); actions.leaveSingle(); }, recordDuel: record => window.ftlite?.recordDuel?.(record), setConsole: (input) => actions.setConsole(input) });
```

with

```ts
        onExit: () => { session.home(); actions.leaveSingle(); }, recordDuel: record => window.ftlite?.recordDuel?.(record), setConsole: (input) => actions.setConsole(input),
        setContact: (contact) => actions.setContact(contact) });
```

Replace

```ts
          leave: () => actions.leave(), audio, recordDuel: record => window.ftlite?.recordDuel?.(record), setConsole: (input) => actions.setConsole(input) }),   // Audio-i: local duel sounds; the replicated cues would play twice
```

with

```ts
          leave: () => actions.leave(), audio, recordDuel: record => window.ftlite?.recordDuel?.(record), setConsole: (input) => actions.setConsole(input),
          setContact: (contact) => actions.setContact(contact) }),   // Audio-i: local duel sounds; the replicated cues would play twice
```

Replace

```ts
  startDuelMode({ renderer, seed, layout, ui: createDuelSink(store, perf), lifecycle: window.ftlite, setConsole: (input) => actions.setConsole(input) });
```

with

```ts
  startDuelMode({ renderer, seed, layout, ui: createDuelSink(store, perf), lifecycle: window.ftlite, setConsole: (input) => actions.setConsole(input), setContact: (contact) => actions.setContact(contact) });
```

- [ ] **Step 7: Run the tests and the type check.**

Run: `npx vitest run tests/uiActions.test.ts tests/duelModeDispose.test.ts tests/duelModeAudio.test.ts tests/onlineDuelSession.test.ts tests/onlineDuel.test.ts tests/duelMode.test.ts`
Expected: PASS, all six files.

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: no output.

- [ ] **Step 8: Commit.**

```bash
git add src/renderer/src/ui/actions.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/onlineDuel.ts src/renderer/src/main.ts tests/uiActions.test.ts tests/duelModeDispose.test.ts tests/onlineDuelSession.test.ts
git commit -m "feat(enemy-window): one contact controller per duel mode (keyboard intercept, map clicks, setContact) and actions.contact" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The contact window component

**Files:**
- Create: `src/renderer/src/ui/duel/ContactWindow.tsx`
- Modify: `src/renderer/src/ui/duel/DuelUi.tsx` (import and render)
- Test: `tests/contactWindow.test.tsx`

**Interfaces:**
- Consumes: `type ContactView` and `contactModel` (Task 5; `rooms[k].points` flat internal px, `rooms[k].centre`, `box`, `outline`, `lockRoom`, `weapons`, `aim`); `CONTACT` from `consoleLayout` (Task 4); `actions.contact.{close, arm, cancelAim, pick(room)}` and `actions.setContact` (Task 7); `DuelUiView.contact` (Task 6); `pointInPolygon(x, y, poly)` from `render/tactical/hullModel`; stage parts `Panel`, `PixelText` (`{ text, x, y, size, tint, anchorX?, anchorY? }`), `Bar` (`{ x, y, w, h, fill, colour }`), `Button` (`{ name, x, y, w, h, label, lit?, disabled?, onPress? }`, test id `console-${name}`), `Box`, `hex`, `boxCss`; `useActions`, `useUi` from `ui/context`.
- Produces: `ContactWindow({ contact }: { contact: ContactView })`. DOM hooks for tests and the harness: root `[data-ui-contact]`, drawing box `svg[data-ui-contact-box]`, marks overlay `svg[data-ui-contact-marks]`, lock mark `[data-ui-contact-lock]`, reticle `[data-ui-contact-reticle]`, buttons `console-contact-close` and `console-contact-laser`.

Pointer coordinates: a client position maps to internal px by the stage layout, the inverse of `boxCss`: `x = (clientX - offsetX) / scale`, `y = (clientY - stageTop - offsetY) / scale`, with `stageTop = round(stripHeight * dpr) / dpr` (the stage's own top). In the test store (`scale 1`, offsets 0, strip 0) client px equal internal px.

- [ ] **Step 1: Write the failing test** `tests/contactWindow.test.tsx`:

```tsx
// @vitest-environment jsdom
// Enemy ship window spec §4.2, §5, §6.6, §8: the contact window's clicks.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { contactModel, type ContactView } from '../src/renderer/src/render/duel/contactModel';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { TEXT } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const charge = { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: TEXT } };
const contactOf = (station: 'helm' | 'weapons', aim: boolean, ship = 1, slots = 2): ContactView => {
  const st = createTacticalState(4, slots); if (slots > 2) st.ships[2]!.active = true;
  return contactModel({ state: st, ship, aim, station, t: 0, weapons: station === 'weapons' ? { charge } : null })!;
};
const view = (contact: ContactView): DuelUiView => ({ readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console: null, contact });
function mount(contact: ContactView) {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const c = { close: vi.fn(), arm: vi.fn(), cancelAim: vi.fn(), pick: vi.fn() };
  ui.actions.setContact(c);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  act(() => duel.frame(view(contact)));
  return c;
}
const btn = (name: string) => document.querySelector(`[data-testid="console-${name}"]`) as HTMLElement | null;
const box = () => document.querySelector('[data-ui-contact-box]') as Element;
const root = () => document.querySelector('[data-ui-contact]') as Element;
const texts = () => Array.from(document.querySelectorAll('canvas')).map((e) => e.dataset.text);

describe('the contact window (spec §4.2, §5)', () => {
  it('draws the title, the room labels and, at Weapons, LASER and MISSILE', () => {
    mount(contactOf('weapons', false));
    for (const t of ['ENEMY SHIP', 'WEAP', 'SHLD', 'ENG', 'MISSILE', 'STEER A/D', 'CHARGE', '40%']) expect(texts(), t).toContain(t);
    expect(btn('contact-laser')).not.toBeNull();
    expect(document.querySelector('[data-ui-contact-lock]')).not.toBeNull();   // the scout is the laser's target
  });
  it('LASER calls arm', () => {
    const c = mount(contactOf('weapons', false));
    fireEvent.pointerDown(btn('contact-laser')!, { button: 0 });
    expect(c.arm).toHaveBeenCalledTimes(1);
  });
  it('while armed, a click inside the SHLD polygon calls pick(1); a click in the box on no room calls nothing', () => {
    const v = contactOf('weapons', true), c = mount(v), shld = v.rooms[1]!.centre;
    fireEvent.pointerDown(box(), { button: 0, clientX: v.box.x + 2, clientY: v.box.y + 2 });
    expect(c.pick).not.toHaveBeenCalled();
    fireEvent.pointerDown(box(), { button: 0, clientX: shld.x, clientY: shld.y });
    expect(c.pick).toHaveBeenCalledTimes(1); expect(c.pick.mock.calls[0]![0]).toBe(1);
  });
  it('while armed, the pointer over the box draws the reticle', () => {
    const v = contactOf('weapons', true), shld = v.rooms[1]!.centre;
    mount(v);
    expect(document.querySelector('[data-ui-contact-reticle]')).toBeNull();
    fireEvent.pointerMove(box(), { clientX: shld.x, clientY: shld.y });
    expect(document.querySelector('[data-ui-contact-reticle]')).not.toBeNull();
    expect(box().getAttribute('style')).toContain('cursor: none');
  });
  it('a right-click on the window or on the box calls cancelAim; the context menu is suppressed', () => {
    const c = mount(contactOf('weapons', true));
    fireEvent.pointerDown(root(), { button: 2 });
    fireEvent.pointerDown(box(), { button: 2 });
    expect(c.cancelAim).toHaveBeenCalledTimes(2);
    expect(fireEvent.contextMenu(root())).toBe(false);
    expect(c.pick).not.toHaveBeenCalled();
  });
  it('the close button calls close', () => {
    const c = mount(contactOf('weapons', false));
    fireEvent.pointerDown(btn('contact-close')!, { button: 0 });
    expect(c.close).toHaveBeenCalledTimes(1);
  });
  it('the Helm: no weapon list, no reticle, and a room click calls nothing', () => {
    const v = contactOf('helm', true), c = mount(v), shld = v.rooms[1]!.centre;
    expect(btn('contact-laser')).toBeNull(); expect(texts()).not.toContain('MISSILE');
    fireEvent.pointerMove(box(), { clientX: shld.x, clientY: shld.y });
    fireEvent.pointerDown(box(), { button: 0, clientX: shld.x, clientY: shld.y });
    expect(c.pick).not.toHaveBeenCalled();
    expect(document.querySelector('[data-ui-contact-reticle]')).toBeNull();
  });
  it('a ship that is not the laser\'s target: LASER disabled and NOT TARGETED', () => {
    const c = mount(contactOf('weapons', false, 2, 3));
    expect(btn('contact-laser')!.dataset.uiButton).toBe('disabled');
    expect(texts()).toContain('NOT TARGETED');
    fireEvent.pointerDown(btn('contact-laser')!, { button: 0 });
    expect(c.arm).not.toHaveBeenCalled();
  });
  it('without a contact view no window is drawn', () => {
    const ui = makeUi(), duel = createDuelSink(ui.store);
    render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
    act(() => duel.frame({ ...view(contactOf('weapons', false)), contact: null }));
    expect(root()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx vitest run tests/contactWindow.test.tsx`
Expected: FAIL (no `[data-ui-contact]` element: `root()` is null, `btn('contact-laser')` is null).

- [ ] **Step 3: Write the component** `src/renderer/src/ui/duel/ContactWindow.tsx`:

```tsx
// The contact window (enemy ship window spec §4, §5, §6.6): one map contact, here the enemy ship, at CONTACT below the
// side column. The ship drawing is an inline SVG in internal px inside the console's CRT glow; React draws only the
// view's resolved ramp colours and does no blinking of its own. At Weapons, LASER arms the aim: the drawing box hides
// the cursor and draws a reticle, the hovered room gets a hot stroke, and a room click picks it (the console lock).
// The Helm only looks. The window takes the pointer, so no click or wheel over it reaches the map.
import { memo, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { ContactView } from '../../render/duel/contactModel';
import { CONTACT } from '../../render/duel/consoleLayout';
import { FONT_NATIVE } from '../../render/theme';
import { CRT } from '../../render/tactical/crtTheme';
import { pointInPolygon } from '../../render/tactical/hullModel';
import { useActions, useUi } from '../context';
import { Bar } from '../stage/Bar';
import { Box } from '../stage/Box';
import { Button } from '../stage/Button';
import { hex } from '../stage/color';
import { boxCss } from '../stage/geometry';
import { Panel } from '../stage/Panel';
import { PixelText } from '../stage/PixelText';

/** The reticle: a hot ring 20 internal px across with four ticks across it; the lock mark: four corner brackets. */
const RETICLE_R = 10, TICK = 3, LOCK_HALF = 9, LOCK_ARM = 4;
const polyPoints = (p: readonly number[]): string => { const out: string[] = []; for (let k = 0; k + 1 < p.length; k += 2) out.push(`${p[k]},${p[k + 1]}`); return out.join(' '); };
const segPath = (s: readonly number[]): string => { let d = ''; for (let k = 0; k + 3 < s.length; k += 4) d += `M${s[k]} ${s[k + 1]}L${s[k + 2]} ${s[k + 3]}`; return d; };
const brackets = (x: number, y: number): string => {
  const h = LOCK_HALF, a = LOCK_ARM;
  return `M${x - h} ${y - h + a}L${x - h} ${y - h}L${x - h + a} ${y - h}M${x + h - a} ${y - h}L${x + h} ${y - h}L${x + h} ${y - h + a}`
    + `M${x + h} ${y + h - a}L${x + h} ${y + h}L${x + h - a} ${y + h}M${x - h + a} ${y + h}L${x - h} ${y + h}L${x - h} ${y + h - a}`;
};
const ticks = (x: number, y: number): string => {
  const a = RETICLE_R - TICK, b = RETICLE_R + TICK;
  return `M${x} ${y - b}L${x} ${y - a}M${x} ${y + a}L${x} ${y + b}M${x - b} ${y}L${x - a} ${y}M${x + a} ${y}L${x + b} ${y}`;
};
const stop = (e: SyntheticEvent): void => e.preventDefault();
const swallow = (e: ReactWheelEvent): void => e.stopPropagation();

export const ContactWindow = memo(function ContactWindow({ contact }: { contact: ContactView }) {
  const actions = useActions(), l = useUi((s) => s.layout);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const b = contact.box, x0 = CONTACT.x + 8, right = CONTACT.x + CONTACT.w - 8, top = CONTACT.y;
  const statusY = top + 34, laserY = top + 270, missileY = top + 306, barX = x0 + 104;
  const aiming = contact.aim && contact.weapons !== null;
  /** A client position to internal px: the inverse of boxCss on the stage (which starts below the session strip). */
  const toInternal = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const stageTop = Math.round(l.stripHeight * l.dpr) / l.dpr;
    return { x: (e.clientX - l.offsetX) / l.scale, y: (e.clientY - stageTop - l.offsetY) / l.scale };
  };
  const roomAt = (p: { x: number; y: number }): number => contact.rooms.findIndex((r) => pointInPolygon(p.x, p.y, r.points));
  const hover = aiming && pointer ? roomAt(pointer) : -1;
  const lock = contact.lockRoom === null ? null : contact.rooms[contact.lockRoom]?.centre ?? null;
  const laser = contact.weapons?.laser ?? null;
  const rootDown = (e: ReactPointerEvent<HTMLDivElement>): void => { e.preventDefault(); if (e.button === 2) actions.contact.cancelAim(); };
  const boxDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    e.preventDefault();
    if (e.button === 2) { actions.contact.cancelAim(); return; }
    if (e.button !== 0 || !aiming) return;
    const room = roomAt(toInternal(e));
    if (room >= 0) actions.contact.pick(room);   // a click on no room does nothing; the aim stays armed
  };
  const boxStyle = { position: 'absolute' as const, ...boxCss(b.x, b.y, b.w, b.h, l), overflow: 'hidden' as const };
  return (
    <>
      <div data-ui-contact="" onPointerDown={rootDown} onContextMenu={stop} onMouseDown={stop} onAuxClick={stop} onWheel={swallow}
        style={{ position: 'absolute', boxSizing: 'border-box', ...boxCss(CONTACT.x, CONTACT.y, CONTACT.w, CONTACT.h, l), pointerEvents: 'auto' }} />
      <Panel x={CONTACT.x} y={CONTACT.y} w={CONTACT.w} h={CONTACT.h} />
      <PixelText text={contact.title} x={x0} y={top + 8} size={FONT_NATIVE} tint={CRT.main} />
      <Button name="contact-close" label="X" x={right - 24} y={top + 6} w={24} h={20} onPress={() => actions.contact.close()} />
      <PixelText text="SHLD" x={x0} y={statusY} size={FONT_NATIVE} tint={CRT.mid} />
      {Array.from({ length: contact.shields.of }, (_, k) => (
        <Box key={k} x={x0 + 40 + k * 12} y={statusY + 4} w={8} h={8} attrs={{ 'data-ui-contact-pip': k < contact.shields.up ? 'up' : 'down' }}
          style={k < contact.shields.up ? { background: hex(CRT.main) } : { border: `1px solid ${hex(CRT.mid)}` }} />
      ))}
      <PixelText text="HULL" x={x0 + 120} y={statusY} size={FONT_NATIVE} tint={CRT.mid} />
      <Bar x={x0 + 156} y={statusY + 6} w={80} h={6} fill={contact.hull.fill} colour={CRT.main} />
      <PixelText text={String(contact.hull.value)} x={right} y={statusY} size={FONT_NATIVE} tint={CRT.main} anchorX={1} />
      <svg data-ui-contact-box="" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="none" shapeRendering="crispEdges"
        style={{ ...boxStyle, pointerEvents: 'auto', cursor: aiming ? 'none' : 'default' }}
        onPointerMove={(e) => setPointer(toInternal(e))} onPointerLeave={() => setPointer(null)} onPointerDown={boxDown}
        onContextMenu={stop} onMouseDown={stop} onAuxClick={stop} onWheel={swallow}>
        <polygon points={polyPoints(contact.outline)} fill={hex(CRT.glass)} stroke={hex(CRT.main)} strokeWidth={1} />
        {contact.rooms.map((r, k) => (
          <g key={k} data-ui-contact-room={r.label}>
            <polygon points={polyPoints(r.points)} fill={r.fill === null ? 'none' : hex(r.fill)} stroke={hex(k === hover ? CRT.hot : r.stroke)} strokeWidth={1} />
            {r.hatch && <path d={segPath(r.hatch.segments)} stroke={hex(r.hatch.colour)} strokeWidth={1} fill="none" />}
          </g>
        ))}
      </svg>
      {contact.rooms.map((r, k) => (
        <PixelText key={k} text={r.label} x={r.centre.x} y={r.centre.y} size={FONT_NATIVE} tint={r.fill === CRT.hot ? CRT.glass : CRT.hot} anchorX={0.5} anchorY={0.5} />
      ))}
      <svg data-ui-contact-marks="" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="none" style={{ ...boxStyle, pointerEvents: 'none' }}>
        {lock && <path data-ui-contact-lock="" d={brackets(lock.x, lock.y)} stroke={hex(CRT.hot)} strokeWidth={1} fill="none" />}
        {aiming && pointer && (
          <g data-ui-contact-reticle="">
            <circle cx={pointer.x} cy={pointer.y} r={RETICLE_R} stroke={hex(CRT.hot)} strokeWidth={1} fill="none" />
            <path d={ticks(pointer.x, pointer.y)} stroke={hex(CRT.hot)} strokeWidth={1} fill="none" />
          </g>
        )}
      </svg>
      {contact.weapons && laser && (
        <>
          <Button name="contact-laser" label="LASER" x={x0} y={laserY} w={96} h={24} lit={laser.lit} disabled={!laser.enabled} onPress={() => actions.contact.arm()} />
          <PixelText text={laser.note ?? laser.label} x={barX} y={laserY + 2} size={FONT_NATIVE} tint={CRT.mid} />
          {laser.note === null && <PixelText text={laser.value} x={right} y={laserY + 2} size={FONT_NATIVE} tint={CRT.main} anchorX={1} />}
          <Bar x={barX} y={laserY + 20} w={right - barX} h={4} fill={laser.fill} colour={CRT.main} />
          <PixelText text="MISSILE" x={x0} y={missileY} size={FONT_NATIVE} tint={CRT.dim} />
          <PixelText text={`MAG ${contact.weapons.missile.magazine}`} x={barX} y={missileY} size={FONT_NATIVE} tint={CRT.dim} />
          <PixelText text="STEER A/D" x={right} y={missileY} size={FONT_NATIVE} tint={CRT.dim} anchorX={1} />
        </>
      )}
    </>
  );
});
```

- [ ] **Step 4: Render it in the duel region.** In `src/renderer/src/ui/duel/DuelUi.tsx`, replace

```ts
import { WeaponsStation } from './WeaponsStation';
```

with

```ts
import { WeaponsStation } from './WeaponsStation';
import { ContactWindow } from './ContactWindow';
```

and replace

```tsx
          {duel.console?.weapons && <WeaponsStation weapons={duel.console.weapons} />}
```

with

```tsx
          {duel.console?.weapons && <WeaponsStation weapons={duel.console.weapons} />}
          {duel.contact && <ContactWindow contact={duel.contact} />}
```

Also extend the file's header comment: after the line ending `...draw over the map.` add the line `// The contact window (enemy ship window spec §6.6) follows the station blocks while the frame carries one.`

- [ ] **Step 5: Run the tests and the type check.**

Run: `npx vitest run tests/contactWindow.test.tsx tests/uiConsole.test.tsx tests/uiDuel.test.tsx tests/uiBoundary.test.ts`
Expected: PASS, all four files (`uiBoundary` confirms the UI imports no runtime values from `sim`).

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: no output.

- [ ] **Step 6: Commit.**

```bash
git add src/renderer/src/ui/duel/ContactWindow.tsx src/renderer/src/ui/duel/DuelUi.tsx tests/contactWindow.test.tsx
git commit -m "feat(enemy-window): the CRT contact window (scout rooms, lock mark, LASER aim with a reticle, Helm view only)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verify, take the screenshots, record the gate

**Files:**
- Create (gitignored, never committed): `.art/shots/index.html`, `.art/shots/main.ts`, `.art/shots/vite.config.mjs`, `.art/shots/shot.cjs`, `.art/shots/all.mjs`
- Modify: `docs/gates.md` (insert the gate section)
- Output (outside the repo): `C:\Users\djuar\FTLite-shots\enemy-window\*.png`

**Interfaces:**
- Consumes: `createDuelScene(renderer, { seed, pauseText, ui, contact })`, `type DuelViewSource` (scene.ts: `duel, seed, prev, missilePrev, crewPrev, cameras, interiorCamera, epoch, active, view, otherStatus, axes, steer, alpha, paused, drainEvents, mode, running, uiHeld`); `createContactController()` (`toggle`, `arm`, `pick`); `createUiActions(...).setContact / setConsole`; `createUiStore`, `setCrtSetting`, `setLayout`; `createDuelSink`; `mountUi`; `createDuel`; `createCamera`; `createInteriorCamera`; `NO_HELD_FLAGS`.
- Produces: the totals, six screenshots, the gate entry.

- [ ] **Step 1: Full suite and build.** (On an idle machine; several minutes.)

Run: `npm run build 2>&1 | tail -2`
Expected: the last line reports a successful build (`✓ built in ...`).

Run: `npx vitest run 2>&1 | tail -8`
Expected: 0 failed. Write down the totals (test files and tests). The sim files (`tests/director.test.ts`, `tests/run.test.ts`, `tests/snapshot.test.ts`, `tests/gate-*.test.ts`) can time out under load: rerun a failing one alone (`npx vitest run tests/<file>`) before calling it a failure. Any other failure: stop and report.

- [ ] **Step 2: Types and the unchanged sim.**

Run: `npx tsc -b; echo "tsc exit=$?"`
Expected: `tsc exit=0` and no other output.

Run: `git diff $(git merge-base HEAD master) --stat -- src/renderer/src/sim src/renderer/src/authority src/network src/shared src/main; grep -n "SIM_VERSION =" src/renderer/src/sim/tuning.ts; npx vitest run tests/golden.test.ts tests/duelGolden.test.ts tests/boundary.test.ts 2>&1 | tail -3`
Expected: the diff stat prints nothing; `7:export const SIM_VERSION = 42;`; the three files pass.

- [ ] **Step 3: Write the screenshot harness** (all under `.art/shots/`, which `.gitignore` covers: `git check-ignore -v .art/shots/main.ts` prints `.gitignore:18:.art/	.art/shots/main.ts`). The harness pins the window open by driving the contact controller directly (`?contact=open|aim|pick`); the aim shot moves a synthetic pointer over the SHLD room so the reticle and the hover stroke show.

`.art/shots/index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>FTLite enemy window shots</title>
    <style>html,body{margin:0;padding:0;background:#000;overflow:hidden}</style>
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`.art/shots/main.ts`:

```ts
// Enemy ship window visual check harness (gitignored, never committed): the real duel scene, React UI and the contact
// window on a staged duel. ?view=helm|weapons&crt=subtle|full&contact=open|aim|pick[&phase=a|b][&zoom=0.5]
// The staged duel: the enemy close ahead, enemy rooms at damage 2, 1, 0 (Weapons blinks, Shields hatched), the lock on
// Shields. contact=open: the window open on the enemy (as T opens it); aim: LASER armed and the pointer over SHLD;
// pick: armed, then Engines picked (the lock mark moves to ENG). phase pins the 2 Hz damage blink: a phase 0, b phase 1.
import hound from '../../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../../src/renderer/src/sim/ship/schema';
import { createDuel } from '../../src/renderer/src/sim/duel/state';
import { loadAssets } from '../../src/renderer/src/render/assets';
import { createRenderer } from '../../src/renderer/src/render/renderer';
import { computeLetterbox } from '../../src/renderer/src/render/letterbox';
import { parseCrt } from '../../src/renderer/src/render/crt';
import { createCamera } from '../../src/renderer/src/render/tactical/camera';
import { createInteriorCamera } from '../../src/renderer/src/render/duel/interiorCamera';
import { createDuelScene, type DuelViewSource } from '../../src/renderer/src/app/duel/scene';
import { createContactController } from '../../src/renderer/src/app/duel/contactController';
import { NO_HELD_FLAGS } from '../../src/renderer/src/app/duel/input';
import { createUiStore, setCrtSetting, setLayout } from '../../src/renderer/src/ui/store';
import { createUiActions } from '../../src/renderer/src/ui/actions';
import { createDuelSink } from '../../src/renderer/src/ui/sinks';
import { mountUi } from '../../src/renderer/src/ui/mount';
import { INTERNAL_H, INTERNAL_W } from '../../src/shared/resolution';

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search), view = (q.get('view') ?? 'weapons') as 'helm' | 'weapons';
  const mode = q.get('contact') ?? 'open', zoom = Number(q.get('zoom') ?? '0.5');
  const ph = q.get('phase');
  if (ph) { const real = performance.now.bind(performance); performance.now = () => { const r = real(); return r - (r % 500) + (ph === 'b' ? 260 : 10); }; }
  const assets = await loadAssets('./assets/manifest.json');
  const renderer = await createRenderer(assets);
  const store = createUiStore({ onlineAvailable: false }), crt = parseCrt(q.get('crt'));
  renderer.setCrt(crt); setCrtSetting(store, crt);
  const actions = createUiActions({ store, single() {}, online() {}, pause() {} });
  const uiRoot = document.createElement('div'); uiRoot.id = 'ui'; document.body.append(uiRoot);
  await mountUi({ el: uiRoot, store, actions, menu: false });
  renderer.resize(window.innerWidth, window.innerHeight);
  const lb = computeLetterbox(window.innerWidth, window.innerHeight, INTERNAL_W, INTERNAL_H);
  setLayout(store, { scale: lb.scale, offsetX: lb.offsetX, offsetY: lb.offsetY, dpr: window.devicePixelRatio || 1 });
  const d = createDuel(parseShip(hound), 7), t = d.tactical, own = t.ships[0], foe = t.ships[1];
  foe.x = own.x + 240; foe.y = own.y - 170; foe.heading = 40;
  t.systems[1].rooms = [2, 1, 0]; t.systems[0].lock = 1;
  const contact = createContactController();
  actions.setContact(contact);
  actions.setConsole({ press() {}, hold() {}, lock(room) { t.systems[0].lock = room; } });
  const scene = createDuelScene(renderer, { seed: 7, pauseText: 'PAUSED', ui: createDuelSink(store), contact });
  // createDuel seats player 0 at the Helm and player 1 at Weapons.
  const source: DuelViewSource = {
    duel: d, seed: 7, prev: [], missilePrev: [], crewPrev: [],
    cameras: { helm: createCamera(own.x + 60, own.y - 40, zoom), weapons: createCamera(own.x + 80, own.y - 60, zoom) },
    interiorCamera: createInteriorCamera(),
    epoch: () => 0, active: () => (view === 'weapons' ? 1 : 0), view: () => view, otherStatus: () => (view === 'weapons' ? 'AT HELM' : 'AT WEAPONS'),
    axes: () => ({ turn: 0, thrust: 0 }), steer: () => 0, alpha: () => 1, paused: () => false, drainEvents: () => [],
    mode: 'single', running: () => true, uiHeld: () => NO_HELD_FLAGS
  };
  contact.toggle(1);   // open on the laser target slot, as T does
  if (mode === 'aim' || mode === 'pick') contact.arm();
  if (mode === 'pick') contact.pick(2, (room) => { t.systems[0].lock = room; });
  renderer.app.ticker.add((tk) => { scene.draw(source, tk.deltaMS / 1000, { banner: null, layerPaused: false, end: null }); });
  if (mode === 'aim') {
    await new Promise((r) => setTimeout(r, 500));
    const c = store.getState().duel?.contact?.rooms[1]?.centre, el = document.querySelector('[data-ui-contact-box]');
    if (!c || !el) throw new Error('no contact window to aim at');
    el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: lb.offsetX + c.x * lb.scale, clientY: lb.offsetY + c.y * lb.scale }));
  }
  (window as unknown as { shotReady: boolean }).shotReady = true;
}
main().catch((e) => { console.error(String(e?.stack ?? e)); document.body.textContent = String(e?.stack ?? e); (window as unknown as { shotFailed: boolean; shotReady: boolean }).shotFailed = true; (window as unknown as { shotReady: boolean }).shotReady = true; });
```

`.art/shots/vite.config.mjs`:

```js
// Serves the enemy window visual check harness with the repo's public/ assets (gitignored, never committed).
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const repo = resolve(import.meta.dirname, '..', '..');
export default defineConfig({
  root: import.meta.dirname,
  publicDir: resolve(repo, 'public'),
  envDir: false,
  esbuild: { jsx: 'automatic' },
  define: { __GAMEPLAY_CONTENT_DIGEST__: JSON.stringify('enemy-window-shots'), __FTLITE_BUILD__: JSON.stringify({ version: 'shots', rev: 'shots' }) },
  server: { port: 5299, strictPort: true, fs: { allow: [repo] } }
});
```

`.art/shots/shot.cjs`:

```js
// Electron screenshot of the harness at an emulated viewport (gitignored, never committed).
// SHOT = "url|width|height|out.png|extraWaitMs".
const { app, BrowserWindow } = require('electron');
const { appendFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const log = (m) => appendFileSync(join(__dirname, 'shot.log'), `${new Date().toISOString()} ${m}\n`);
process.on('uncaughtException', (e) => { log(`uncaught ${e.stack}`); app.exit(1); });
const [url, w, h, out, extra] = (process.env.SHOT || '').split('|');
const width = Number(w), height = Number(h);
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width, height, useContentSize: true, show: true, backgroundColor: '#000000', webPreferences: { backgroundThrottling: false } });
    win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) log(`page: ${message}`); });
    await win.loadURL('about:blank');   // emulating before any page is loaded crashes the renderer
    const dbg = win.webContents.debugger; dbg.attach('1.3');
    await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await win.loadURL(url);
    for (let k = 0; k < 300; k++) { if (await win.webContents.executeJavaScript('window.shotReady === true')) break; await new Promise((r) => setTimeout(r, 100)); }
    if (await win.webContents.executeJavaScript('window.shotFailed === true')) { log('failed page'); app.exit(1); return; }
    await new Promise((r) => setTimeout(r, 2500 + Number(extra || 0)));
    const shot = await dbg.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    log(`wrote ${out} (${width}x${height})`);
    app.quit();
  } catch (e) { log(`failed ${e.stack}`); app.exit(1); }
});
```

`.art/shots/all.mjs`:

```js
// Takes the enemy window screenshots (gitignored, never committed). usage: node .art/shots/all.mjs <electron.exe> <out dir>
// Needs the harness server running: npx vite --config .art/shots/vite.config.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [electron, outDir] = process.argv.slice(2);
if (!electron || !outDir) { console.error('usage: node .art/shots/all.mjs <electron.exe> <out dir>'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const shots = [
  ['view=weapons&crt=subtle&contact=open&phase=a', 1920, 1080, 'weapons-open-a.png', 0],
  ['view=weapons&crt=subtle&contact=open&phase=b', 1920, 1080, 'weapons-open-b.png', 0],
  ['view=weapons&crt=subtle&contact=aim&phase=a', 1920, 1080, 'weapons-aim.png', 0],
  ['view=weapons&crt=subtle&contact=pick&phase=a', 1920, 1080, 'weapons-pick.png', 0],
  ['view=helm&crt=subtle&contact=open&phase=a', 1920, 1080, 'helm-open.png', 0],
  ['view=weapons&crt=full&contact=open&phase=a', 1920, 1080, 'weapons-open-full.png', 0]
];
let failed = 0;
for (const [query, w, h, name, extra] of shots) {
  const out = resolve(outDir, name);
  const env = { ...process.env, SHOT: `http://localhost:5299/?${query}|${w}|${h}|${out}|${extra}` }; delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(electron, [join(import.meta.dirname, 'shot.cjs')], { env, stdio: 'ignore', timeout: 90000 });
  const ok = r.status === 0 && existsSync(out) && statSync(out).size > 1000;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (${w}x${h}) exit ${r.status}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 4: Take the screenshots.**

Check the port is free: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | Measure-Object | % Count"` prints `0` (if not, stop and report; never stop a process you did not start).

Start the harness server in the background and keep it running: `npx vite --config .art/shots/vite.config.mjs`. Wait for `Local: http://localhost:5299/`.

Then (Electron needs a desktop session; if the tool sandbox blocks GUI processes, run without the sandbox):

```bash
E=node_modules/electron/dist/electron.exe; [ -f "$E" ] || E=/c/Users/djuar/FTLite/node_modules/electron/dist/electron.exe
mkdir -p /c/Users/djuar/FTLite-shots/enemy-window
rm -f .art/shots/shot.log; node .art/shots/all.mjs "$E" "C:/Users/djuar/FTLite-shots/enemy-window"; grep -v wrote .art/shots/shot.log
```

Expected:

```
ok   weapons-open-a.png (1920x1080) exit 0
ok   weapons-open-b.png (1920x1080) exit 0
ok   weapons-aim.png (1920x1080) exit 0
ok   weapons-pick.png (1920x1080) exit 0
ok   helm-open.png (1920x1080) exit 0
ok   weapons-open-full.png (1920x1080) exit 0
```

and no `page:`, `failed` or `uncaught` lines from the `grep`.

Stop the harness: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5299 -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id $_.OwningProcess -Force }; Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | ? { $_.CommandLine -like '*enemy-window*shot.cjs*' } | % { Stop-Process -Id $_.ProcessId -Force }"`; then the port count command above prints `0`.

- [ ] **Step 5: Look at the screenshots** (Read each PNG) and write pass/fail per item in the report:
- The window sits at the right edge directly below the side column (ZOOM / SNAP or CAMERA) and covers neither it nor the map's centre; the off-screen arrows stay clear of it.
- `weapons-open-a.png` vs `weapons-open-b.png`: the WEAP room (level 2) differs between the two phases, SHLD (level 1) is hatched in both, ENG (level 0) is outline only; the map's enemy rooms show the same looks as the window's in each phase.
- `weapons-open-a.png`: title `ENEMY SHIP`, the X button, shield pips and the HULL bar, the scout outline nose right, labels WEAP / SHLD / ENG, the lock brackets on SHLD, the LASER row with the charge, the MISSILE row greyed with `MAG n` and `STEER A/D`.
- `weapons-aim.png`: LASER lit, the hot reticle ring with four ticks on SHLD, SHLD's outline hot.
- `weapons-pick.png`: LASER not lit, the lock brackets on ENG, and the map's lock marker on the enemy's Engines too.
- `helm-open.png`: the same window without the weapon list.
- `weapons-open-full.png`: still readable under the full CRT glow and scanlines.
- Only amber.
Do not change product code in this task; report any failure as DONE_WITH_CONCERNS with the file name and what you see.

- [ ] **Step 6: The gate and commit.** In `docs/gates.md`, insert immediately before the line `## Helm demo (Helm spec §16; H-2 spec §8 to §11)`:

```markdown
## Enemy ship window: the FTL-style contact window and laser aim on the consoles (2026-11-17)

Spec `docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md`; plan `docs/superpowers/plans/2026-11-17-enemy-ship-window.md`.

- [x] Automated (enemy ship window): `npx vitest run` passes, including the contact controller (open, switch, close, T, Esc, the closing rules in `sync`, pick, the key intercept), the keyboard intercept and `takeClick`, `pickShip` at zooms 0.2, 0.5 and 1.2, `roomLook` against the damage table, the contact model, the CONTACT layout, the scene's map click and pause, Esc online with the window shown, `actions.contact` and the window's clicks; `npx tsc -b` clean; sim, SIM_VERSION 42 and goldens unchanged. Measured: TOTALS.
- [ ] Manual (owner): look at `C:\Users\djuar\FTLite-shots\enemy-window\`, then play a Single player duel: click the enemy on the Weapons map (or press T), click LASER, click a room, press Space. Does the window read as FTL's enemy panel in the amber CRT? Do the reticle, the hovered room and the lock mark read? Does the Helm's look-only window feel right? Esc should disarm, then close, and pause only once the window is closed.
```

Replace `TOTALS` with Step 1's totals (for example `N tests in M files, tsc clean, build ok`). Then:

```bash
git add docs/gates.md
git commit -m "docs(enemy-window): the gate" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Report** the totals, the Step 2 boundary check, the screenshot list with the Step 5 pass/fail per item.

## Self-review against the spec

- §2 owner decisions (laser only, aim only sets the lock through `actions.console.lock`, presentation only, CRT): Global Constraints; Task 5 (missile row not aimable), Task 7 (`pick` → `consoleActions.lock`), Task 9 Step 2 (sim and SIM_VERSION unchanged).
- §3 shown rule, map click, T, hit test, closing rules, Esc and pause, station change, not modal, local: Task 2 (`sync`, `intercept`, `click`, `toggle`), Task 3 (intercept hook, `takeClick`), Task 4 (`pickShip`, radius), Task 6 (scene order, closes on hidden/pause/epoch), Task 7 (both modes; online Esc test).
- §4.1 placement, `SIDE_H`, `reserveRight` 324, the layout overlap test: Task 4, Task 6 (`CONTACT_RESERVE` while shown).
- §4.2 contents (title, X, pips, HULL bar, outline fit with 8 px padding nose right, rooms with labels and `roomLook`, lock mark only on the target slot, LASER / MISSILE / NOT TARGETED, Helm items 1-3): Task 5, Task 8.
- §5 aiming (arm, reticle with `cursor: none`, hover by `pointInPolygon` in component state, pick, cancel by right-click / Esc / LASER again / close / station change; the map's right-click keeps its drag): Task 2, Task 8.
- §6.1-6.6 architecture: Tasks 1-8 one for one (`roomLook` in crtTheme, `contactModel` with `t` from the scene, `DuelUiView.contact`, `actions.contact` / `setContact`, `ContactWindow` in `CrtGlow` via DuelUi, root `pointer-events: auto` and event suppression).
- §7 edge cases: inactive ship and pause / banner / end / SHIP / new round close via `sync` (Task 2, Task 6); lock changed elsewhere follows (the view reads `systems[0].lock` each frame, Task 5); offline laser can still be armed (enabled depends only on the target slot); internal-px hit tests (Task 3's `toInternal`, Task 8's layout inverse).
- §8 tests: each listed file is created or extended in Tasks 1-8; screenshots and the gate in Task 9.
- Resolved ambiguities: `sync`'s `shown` input means "console shown at Helm or Weapons" and `sync` returns the effective shown; `intercept` is a controller method; a switch to another ship disarms; `ContactRoom.centre` added for the label and the lock mark; `pickShip` takes a `Pick<TacticalModelInput, ...>`; `contactModel`'s `weapons` input is `Pick<WeaponsPanel, 'charge'> | null`; the close button's label is `X`; the lock mark is four corner brackets; `?mode=duel` also gets the window (it runs `startDuelMode`). This is a stated deviation from spec §6.5's sentence that `?mode=duel` stays as it is: `?mode=duel` is the same solo duel as Single player and should match it. Only scenes built without the option (the scene tests) keep the old behaviour.
