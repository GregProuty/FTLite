// Keyboard and mouse for the Helm demo views (H-1 spec §5). One keyboard drives the active character, or the one ship in
// the flight view. Pointer input feeds only the camera and never becomes a command (parent §10).
import type { Axes } from '../../sim/tactical/state';

/** Press-edge actions (spec §5 table). H-1a uses pause, camera and the zoom keys; H-1b adds the duel ones. */
export type KeyAction = 'interact' | 'prevLock' | 'fireDown' | 'fireUp' | 'launch' | 'stand' | 'switch' | 'pause' | 'camera' | 'zoomIn' | 'zoomOut' | 'confirm';

const PRESS_CODES: Readonly<Record<string, KeyAction>> = {
  KeyE: 'interact', KeyQ: 'prevLock', Space: 'fireDown', KeyF: 'launch', KeyX: 'stand', Tab: 'switch', Escape: 'pause', KeyC: 'camera',
  Equal: 'zoomIn', NumpadAdd: 'zoomIn', Minus: 'zoomOut', NumpadSubtract: 'zoomOut', Enter: 'confirm', NumpadEnter: 'confirm'
};
/** Keys whose browser default (focus moves, page scrolls, history back) must never happen in the duel views. */
const PREVENT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']);

export interface KeySample {
  /** WASD as the sector source gives it: x right, y down, normalised to length 1 on diagonals. */
  moveX: number; moveY: number;
  interactHeld: boolean; fireHeld: boolean;
  /** Press edges per action since the previous sample (auto-repeat does not count). */
  presses: Record<KeyAction, number>;
}

export function emptyPresses(): Record<KeyAction, number> {
  return { interact: 0, prevLock: 0, fireDown: 0, fireUp: 0, launch: 0, stand: 0, switch: 0, pause: 0, camera: 0, zoomIn: 0, zoomOut: 0, confirm: 0 };
}

/** The Helm's held axes from a key sample: A/D turn (D clockwise), W thrusts forward, S reverses (W gives moveY −1). */
export function helmAxes(k: Pick<KeySample, 'moveX' | 'moveY'>): Axes {
  return { turn: Math.sign(k.moveX) || 0, thrust: -Math.sign(k.moveY) || 0 };
}

/** The structural subset of a DOM event target the input needs, so tests can drive it with a fake. */
export interface EventSource {
  addEventListener(type: string, fn: (e: never) => void, opts?: unknown): void;
  removeEventListener(type: string, fn: (e: never) => void, opts?: unknown): void;
}
interface KeyEventLike { code: string; repeat: boolean; preventDefault(): void }

export interface DuelKeyboard { sample(): KeySample; clear(): void; destroy(): void }

/** Held keys are cleared on blur so nothing sticks after alt-tab; `clear` does the same for Tab and restart (spec §4, §5). */
export function createDuelKeyboard(target: EventSource): DuelKeyboard {
  const held = new Set<string>();
  let presses = emptyPresses();
  const down = (e: KeyEventLike): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    held.add(e.code);
    const action = PRESS_CODES[e.code];
    if (action && !e.repeat) presses[action]++;
  };
  const up = (e: KeyEventLike): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.code === 'Space' && held.has('Space')) presses.fireUp++;
    held.delete(e.code);
  };
  const clear = (): void => { held.clear(); presses = emptyPresses(); };
  target.addEventListener('keydown', down as (e: never) => void);
  target.addEventListener('keyup', up as (e: never) => void);
  target.addEventListener('blur', clear as (e: never) => void);
  return {
    sample(): KeySample {
      const x = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0), y = (held.has('KeyS') ? 1 : 0) - (held.has('KeyW') ? 1 : 0);
      const len = Math.sqrt(x * x + y * y) || 1;
      const out: KeySample = { moveX: x / len, moveY: y / len, interactHeld: held.has('KeyE'), fireHeld: held.has('Space'), presses };
      presses = emptyPresses();
      return out;
    },
    clear,
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

/** Wheel notches from a summed deltaY: one notch per 100 px (a mouse wheel click), at least one for any scroll. */
export function wheelNotches(deltaY: number): number {
  if (deltaY === 0) return 0;
  return -Math.sign(deltaY) * Math.max(1, Math.round(Math.abs(deltaY) / 100));
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
