// Keyboard and mouse for the Helm demo views (H-1 spec §5). One keyboard drives the active character, or the one ship in
// the flight view. Pointer input feeds only the camera and never becomes a command (parent §10).
import type { Axes } from '../../sim/tactical/state';
import { clampThrottle } from '../../sim/duel/throttle';

/** Press-edge actions (spec §5 table). H-1a uses pause, camera and the zoom keys; H-1b adds the duel ones; Artemis-ii
 *  adds the Helm's throttle notches on W and S (spec 2026-11-17-artemis-consoles §5.4). */
export type KeyAction = 'interact' | 'prevLock' | 'fireDown' | 'fireUp' | 'launch' | 'stand' | 'switch' | 'pause' | 'camera' | 'zoomIn' | 'zoomOut' | 'confirm' | 'menu' | 'throttleUp' | 'throttleDown';

export const PRESS_CODES: Readonly<Record<string, KeyAction>> = {
  KeyE: 'interact', KeyQ: 'prevLock', Space: 'fireDown', KeyF: 'launch', KeyX: 'stand', Tab: 'switch', Escape: 'pause', KeyC: 'camera',
  Equal: 'zoomIn', NumpadAdd: 'zoomIn', Minus: 'zoomOut', NumpadSubtract: 'zoomOut', Enter: 'confirm', NumpadEnter: 'confirm', KeyM: 'menu',
  KeyW: 'throttleUp', KeyS: 'throttleDown'
};
/** The held keys: WASD movement (walk, the Helm's turn, the flight view's thrust and turn, steer), E held to repair,
 *  Space held to charge. W and S are also the throttle's press edges (PRESS_CODES). */
export const MOVE_CODES = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' } as const;
export const INTERACT_HELD = 'KeyE', FIRE_HELD = 'Space';

/** The merged held state a console draws (spec §6.1): Space, A, D, W, S from the keys or the console's buttons. */
export interface HeldFlags { fire: boolean; left: boolean; right: boolean; up: boolean; down: boolean }
export const NO_HELD_FLAGS: HeldFlags = { fire: false, left: false, right: false, up: false, down: false };
/** The codes a console button can hold (spec §6.2). */
export type HoldCode = 'Space' | 'KeyA' | 'KeyD' | 'KeyW' | 'KeyS';
/** What a console click can do (spec §6.2): a press edge, a held code, a direct lock request, or a throttle notch. */
export interface ConsoleInput { press(action: KeyAction): void; hold(code: HoldCode, on: boolean): void; lock(room: number): void; throttle(level: number): void }
/** Keys whose browser default (focus moves, page scrolls, history back) must never happen in the duel views. */
const PREVENT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']);

export interface KeySample {
  /** WASD as the sector source gives it: x right, y down, normalised to length 1 on diagonals. */
  moveX: number; moveY: number;
  interactHeld: boolean; fireHeld: boolean;
  /** Press edges per action since the previous sample (auto-repeat does not count). */
  presses: Record<KeyAction, number>;
  /** The merged held flags (spec §6.1); createDuelKeyboard always sets it. */
  held?: HeldFlags;
  /** The last console lock request since the previous sample, or null (spec §6.2). */
  lockTo?: number | null;
  /** The last console throttle request since the previous sample, or null (Artemis spec §6.2). */
  throttleTo?: number | null;
}

export function emptyPresses(): Record<KeyAction, number> {
  return { interact: 0, prevLock: 0, fireDown: 0, fireUp: 0, launch: 0, stand: 0, switch: 0, pause: 0, camera: 0, zoomIn: 0, zoomOut: 0, confirm: 0, menu: 0, throttleUp: 0, throttleDown: 0 };
}

/** The flight dev view's held axes from a key sample: A/D turn (D clockwise), W thrusts forward, S reverses (W gives moveY −1). The duel's Helm thrusts by its throttle instead (Artemis spec §5.3). */
export function helmAxes(k: Pick<KeySample, 'moveX' | 'moveY'>): Axes {
  return { turn: Math.sign(k.moveX) || 0, thrust: -Math.sign(k.moveY) || 0 };
}

/** The level a frame's throttle input asks for (Artemis spec §5.4), or null for none. Each W press moves it one notch up
 *  and each S press one down from `base`, clamped to −1..4 at every step. Then a console notch click (`to`) wins. A
 *  request equal to `base` is null, since the sim would answer noop. */
export function throttleRequest(base: number, presses: Pick<Record<KeyAction, number>, 'throttleUp' | 'throttleDown'>, to: number | null | undefined): number | null {
  const steps = presses.throttleUp - presses.throttleDown;
  let level = base;
  for (let n = 0; n < Math.abs(steps); n++) level = clampThrottle(level + Math.sign(steps));
  if (to !== undefined && to !== null) level = clampThrottle(to);
  return level === base ? null : level;
}

/** The structural subset of a DOM event target the input needs, so tests can drive it with a fake. */
export interface EventSource {
  addEventListener(type: string, fn: (e: never) => void, opts?: unknown): void;
  removeEventListener(type: string, fn: (e: never) => void, opts?: unknown): void;
}
interface KeyEventLike { code: string; repeat: boolean; preventDefault(): void }

export interface DuelKeyboard { sample(): KeySample; clear(): void; clearUi(): void; destroy(): void; readonly ui: ConsoleInput }

/** Held keys are cleared on blur so nothing sticks after alt-tab; `clear` does the same for Tab and restart (spec §4, §5).
 *  Console clicks (Artemis spec §6.2) are a second held set and extra press edges: a code is held when either set holds
 *  it, and Fire's edges are the merged Space state's transitions. `clearUi` drops only the clicks. */
export function createDuelKeyboard(target: EventSource): DuelKeyboard {
  const keys = new Set<string>(), ui = new Set<string>();
  let presses = emptyPresses(), lockTo: number | null = null, throttleTo: number | null = null;
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
  const clearUi = (): void => { ui.clear(); lockTo = null; throttleTo = null; };
  const clear = (): void => { keys.clear(); ui.clear(); presses = emptyPresses(); lockTo = null; throttleTo = null; };
  target.addEventListener('keydown', down as (e: never) => void);
  target.addEventListener('keyup', up as (e: never) => void);
  target.addEventListener('blur', clear as (e: never) => void);
  const consoleInput: ConsoleInput = {
    press(action) { presses[action]++; },
    hold(code, on) {
      const was = has(FIRE_HELD);
      if (on) ui.add(code); else ui.delete(code);
      if (code === FIRE_HELD) { const now = has(FIRE_HELD); if (!was && now) presses.fireDown++; else if (was && !now) presses.fireUp++; }
    },
    lock(room) { lockTo = room; },
    throttle(level) { throttleTo = level; }
  };
  return {
    ui: consoleInput,
    sample(): KeySample {
      const x = (has(MOVE_CODES.right) ? 1 : 0) - (has(MOVE_CODES.left) ? 1 : 0), y = (has(MOVE_CODES.down) ? 1 : 0) - (has(MOVE_CODES.up) ? 1 : 0);
      const len = Math.sqrt(x * x + y * y) || 1;
      const held: HeldFlags = { fire: has(FIRE_HELD), left: has(MOVE_CODES.left), right: has(MOVE_CODES.right), up: has(MOVE_CODES.up), down: has(MOVE_CODES.down) };
      const out: KeySample = { moveX: x / len, moveY: y / len, interactHeld: has(INTERACT_HELD), fireHeld: held.fire, presses, held, lockTo, throttleTo };
      presses = emptyPresses(); lockTo = null; throttleTo = null;
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

export interface PointerSample {
  /** Last pointer position in internal pixels (the 1280×720 canvas), or null before the pointer has moved over it. */
  x: number | null; y: number | null;
  /** Wheel deltaY summed since the previous sample (positive scrolls down, which zooms out). */
  wheel: number;
  /** Right- or middle-button drag in internal pixels since the previous sample. */
  dragX: number; dragY: number;
}
interface PointerEventLike { clientX: number; clientY: number; button: number; buttons: number; pointerId?: number; preventDefault(): void }
interface WheelEventLike { clientX: number; clientY: number; deltaY: number; deltaMode: number; preventDefault(): void }

export interface PointerSource { sample(): PointerSample; clear(): void; destroy(): void }

/** Pixels of wheel delta per zoom notch (a mouse wheel click). */
export const WHEEL_NOTCH_PX = 100;
/** Milliseconds without wheel input after which the remainder is dropped. */
export const WHEEL_IDLE_MS = 200;
/** Adds one frame's summed deltaY to the accumulator and emits whole notches (wheel down zooms out, so negative), keeping the remainder. */
export function accumulateWheel(acc: number, deltaY: number): { notches: number; acc: number } {
  const total = acc + deltaY;
  const n = Math.trunc(total / WHEEL_NOTCH_PX);
  return { notches: n === 0 ? 0 : -n, acc: total - n * WHEEL_NOTCH_PX };
}

/** `toInternal` maps a client position to internal pixels (the letterbox inverse). Buttons 2 (right) and 1 (middle) drag. */
export function createPointerSource(target: EventSource, toInternal: (clientX: number, clientY: number) => { x: number; y: number }): PointerSource {
  let x: number | null = null, y: number | null = null, wheel = 0, dragX = 0, dragY = 0, dragging = false;
  const DRAG_BUTTONS = 2 | 4;   // `buttons` bits: 2 right, 4 middle
  const move = (e: PointerEventLike): void => {
    const p = toInternal(e.clientX, e.clientY);
    if (dragging && (e.buttons & DRAG_BUTTONS) !== 0 && x !== null && y !== null) { dragX += p.x - x; dragY += p.y - y; }
    else if ((e.buttons & DRAG_BUTTONS) === 0) dragging = false;
    x = p.x; y = p.y;
  };
  const downFn = (e: PointerEventLike): void => {
    const p = toInternal(e.clientX, e.clientY); x = p.x; y = p.y;
    if (e.button === 1 || e.button === 2) { dragging = true; e.preventDefault(); }
  };
  const upFn = (e: PointerEventLike): void => { if ((e.buttons & DRAG_BUTTONS) === 0) dragging = false; };
  const wheelFn = (e: WheelEventLike): void => {
    const p = toInternal(e.clientX, e.clientY); x = p.x; y = p.y;
    wheel += e.deltaMode === 1 ? e.deltaY * 100 / 3 : e.deltaY;   // line mode: three lines a notch
    e.preventDefault();
  };
  const menu = (e: { preventDefault(): void }): void => { e.preventDefault(); };
  const clear = (): void => { wheel = 0; dragX = 0; dragY = 0; dragging = false; };
  const on: [string, (e: never) => void][] = [
    ['pointermove', move as (e: never) => void], ['pointerdown', downFn as (e: never) => void], ['pointerup', upFn as (e: never) => void],
    ['wheel', wheelFn as (e: never) => void], ['contextmenu', menu as (e: never) => void]
  ];
  for (const [type, fn] of on) target.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);
  return {
    sample(): PointerSample {
      const out = { x, y, wheel, dragX, dragY };
      wheel = 0; dragX = 0; dragY = 0;
      return out;
    },
    clear,
    destroy(): void { for (const [type, fn] of on) target.removeEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined); }
  };
}
