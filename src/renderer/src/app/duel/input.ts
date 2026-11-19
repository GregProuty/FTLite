// Keyboard and mouse for the Helm demo views (H-1 spec §5). One keyboard drives the active character, or the one ship in
// the flight view. Pointer input feeds the camera and, through takeClick, the contact window's map clicks (enemy ship
// window spec §6.2); it never becomes a command (parent §10).
import type { Axes } from '../../sim/tactical/state';
import { clampThrottle, THROTTLE_MAX } from '../../sim/duel/throttle';
import type { ShipCommand } from '../../render/duel/shipControls';

/** Press-edge actions (spec §5 table). H-1a uses pause, camera and the zoom keys; H-1b adds the duel ones; Artemis-ii
 *  adds the Helm's throttle notches on W and S (spec 2026-11-17-artemis-consoles §5.4). */
export type KeyAction = 'interact' | 'prevLock' | 'fireDown' | 'fireUp' | 'launch' | 'stand' | 'switch' | 'pause' | 'camera' | 'zoomIn' | 'zoomOut' | 'confirm' | 'menu' | 'throttleUp' | 'throttleDown';

export const PRESS_CODES: Readonly<Record<string, KeyAction>> = {
  KeyE: 'interact', KeyQ: 'prevLock', Space: 'fireDown', KeyF: 'launch', KeyX: 'stand', Tab: 'switch', Escape: 'pause', KeyC: 'camera',
  Equal: 'zoomIn', NumpadAdd: 'zoomIn', Minus: 'zoomOut', NumpadSubtract: 'zoomOut', Enter: 'confirm', NumpadEnter: 'confirm', KeyM: 'menu',
  KeyW: 'throttleUp', KeyS: 'throttleDown'
};
/** Sci-1 spec §7.4: keys tune the laser to A, B and C (the duel modes read them at Weapons only). 3, 4 and 5 since the
 *  FTL targeting update, whose 1 and 2 pick up the laser and the torpedo (WEAPON_CODES). */
export const FREQ_CODES: Readonly<Record<string, number>> = { Digit3: 0, Digit4: 1, Digit5: 2 };
/** FTL targeting spec §1: 1 and 2 pick up the laser and the torpedo at Weapons (the contact controller's intercept takes them). */
export const WEAPON_CODES: Readonly<Record<string, 'laser' | 'torpedo'>> = { Digit1: 'laser', Digit2: 'torpedo' };
/** The held keys: WASD movement (walk, the Helm's turn, the flight view's thrust and turn, steer), E held to repair,
 *  Space (its press fires a full laser, FTL targeting spec §2). W and S are also the throttle's press edges (PRESS_CODES). */
export const MOVE_CODES = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' } as const;
export const INTERACT_HELD = 'KeyE', FIRE_HELD = 'Space';
/** Feel-ii §2.7: G drops a ping at the pointer on a console map (the duel modes take it through the keyboard's intercept). */
export const PING_CODE = 'KeyG';

/** The merged held state a console draws (spec §6.1): Space, A, D, W, S from the keys or the console's buttons. */
export interface HeldFlags { fire: boolean; left: boolean; right: boolean; up: boolean; down: boolean }
export const NO_HELD_FLAGS: HeldFlags = { fire: false, left: false, right: false, up: false, down: false };
/** The codes a console button can hold (spec §6.2). */
export type HoldCode = 'Space' | 'KeyA' | 'KeyD' | 'KeyW' | 'KeyS';
/** What a console click can do (spec §6.2): a press edge, a held code, a direct lock request, a throttle notch, or a laser
 *  frequency (Sci-1 spec §7.4). FTL targeting spec §1: `lock` sets the laser's target room (−1 clears it) and `torpLock`
 *  the torpedo's. */
export interface ConsoleInput { press(action: KeyAction): void; hold(code: HoldCode, on: boolean): void; lock(room: number): void; torpLock(room: number): void; throttle(level: number): void; frequency(freq: number): void;
  /** Spike ii §6.5: a weapon card's right-click clear of a rock target (rock −1); optional so older fakes still fit. */
  rockLock?(weapon: 'laser' | 'torpedo', rock: number): void;
  /** Engineering spike §6, §7: a ship-view click (a power column, a coolant counter, a door or an airlock). Optional, so
   *  the tests' console literals stay valid; callers use `?.`. */
  ship?(command: ShipCommand): void }
/** Engineering spike §7: the most ship commands held between two samples; a further one drops the oldest. */
export const SHIP_QUEUE_MAX = 16;
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
  /** The last console lock request since the previous sample, or null (spec §6.2): the laser's target room, −1 to clear. */
  lockTo?: number | null;
  /** The last torpedo target request since the previous sample (a room, −1 to clear), or null (FTL targeting spec §1). */
  torpTo?: number | null;
  /** Spike ii §6.5: the last rock target request from the console (a card's clear, rock −1) since the previous sample, or null. */
  rockTo?: { weapon: 'laser' | 'torpedo'; rock: number } | null;
  /** The last console throttle request since the previous sample, or null (Artemis spec §6.2). */
  throttleTo?: number | null;
  /** The last laser frequency asked for since the previous sample (Digit3..5, or a console button), or null (Sci-1 spec §7.4). */
  freqTo?: number | null;
  /** Engineering spike §7: the ship-view commands clicked since the previous sample, oldest first; absent or empty for none. */
  ship?: ShipCommand[];
}

export function emptyPresses(): Record<KeyAction, number> {
  return { interact: 0, prevLock: 0, fireDown: 0, fireUp: 0, launch: 0, stand: 0, switch: 0, pause: 0, camera: 0, zoomIn: 0, zoomOut: 0, confirm: 0, menu: 0, throttleUp: 0, throttleDown: 0 };
}

/** The flight dev view's held axes from a key sample: A/D turn (D clockwise), W thrusts forward, S reverses (W gives moveY −1). The duel's Helm thrusts by its throttle instead (Artemis spec §5.3). */
export function helmAxes(k: Pick<KeySample, 'moveX' | 'moveY'>): Axes {
  return { turn: Math.sign(k.moveX) || 0, thrust: -Math.sign(k.moveY) || 0 };
}

/** The level a frame's throttle input asks for (Artemis spec §5.4), or null for none. Each W press moves it one notch up
 *  and each S press one down from `base`; then a console notch click (`to`) wins. Every step is clamped to −1..`cap`
 *  (Engineering spike §10.2: the Engines bars' cap, default THROTTLE_MAX), and to 0..0 at a cap of 0 (no reverse without
 *  Engines). A request equal to `base` is null, since the sim would answer noop. */
export function throttleRequest(base: number, presses: Pick<Record<KeyAction, number>, 'throttleUp' | 'throttleDown'>, to: number | null | undefined, cap: number = THROTTLE_MAX): number | null {
  const steps = presses.throttleUp - presses.throttleDown, top = Math.min(THROTTLE_MAX, cap), floor = cap <= 0 ? 0 : -1;
  const fit = (v: number): number => Math.max(floor, Math.min(top, clampThrottle(v)));
  let level = base;
  for (let n = 0; n < Math.abs(steps); n++) level = fit(level + Math.sign(steps));
  if (to !== undefined && to !== null) level = fit(to);
  return level === base ? null : level;
}

/** The frequency a frame asks for (Sci-1 spec §7.4): `to` when it is a whole 0..2 that differs from `base`, else null. */
export function frequencyRequest(base: number, to: number | null | undefined): number | null {
  return to === undefined || to === null || !Number.isInteger(to) || to < 0 || to > 2 || to === base ? null : to;
}

/** The structural subset of a DOM event target the input needs, so tests can drive it with a fake. */
export interface EventSource {
  addEventListener(type: string, fn: (e: never) => void, opts?: unknown): void;
  removeEventListener(type: string, fn: (e: never) => void, opts?: unknown): void;
}
interface KeyEventLike { code: string; repeat: boolean; shiftKey?: boolean; preventDefault(): void }

export interface DuelKeyboard { sample(): KeySample; clear(): void; clearUi(): void; destroy(): void; readonly ui: ConsoleInput }

/** Options (enemy ship window spec §6.2): `intercept` sees each non-repeat keydown's code before PRESS_CODES; returning
 *  true takes the key, so it adds no press edge and is not held (PREVENT's keys still have their default prevented). */
export interface DuelKeyboardOptions { intercept?: (code: string) => boolean }

/** Held keys are cleared on blur so nothing sticks after alt-tab; `clear` does the same for Tab and restart (spec §4, §5).
 *  Console clicks (Artemis spec §6.2) are a second held set and extra press edges: a code is held when either set holds
 *  it, and Fire's edges are the merged Space state's transitions. `clearUi` drops only the clicks. */
export function createDuelKeyboard(target: EventSource, opts: DuelKeyboardOptions = {}): DuelKeyboard {
  const keys = new Set<string>(), ui = new Set<string>(), taken = new Set<string>();
  let presses = emptyPresses(), lockTo: number | null = null, torpTo: number | null = null, rockTo: { weapon: 'laser' | 'torpedo'; rock: number } | null = null, throttleTo: number | null = null, freqTo: number | null = null;
  let ship: ShipCommand[] = [];   // Engineering spike §7: kept by clearUi, dropped by clear
  const has = (code: string): boolean => keys.has(code) || ui.has(code);
  const down = (e: KeyEventLike): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.repeat) { if (taken.has(e.code)) return; }   // an OS repeat of a taken key stays taken
    else if (opts.intercept?.(e.code)) { taken.add(e.code); return; }   // taken (the contact window's Esc and T): no edge, not held
    if (!e.repeat && FREQ_CODES[e.code] !== undefined) freqTo = FREQ_CODES[e.code]!;
    if (e.code === FIRE_HELD) { if (!e.repeat && !has(FIRE_HELD)) presses.fireDown++; }
    else if (e.code === MOVE_CODES.up && e.shiftKey === true) { if (!e.repeat) throttleTo = THROTTLE_MAX; }   // Feel-ii §1.4: Shift+W is full burn
    else { const action = PRESS_CODES[e.code]; if (action && !e.repeat) presses[action]++; }
    keys.add(e.code);
  };
  const up = (e: KeyEventLike): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    const was = has(FIRE_HELD);
    taken.delete(e.code);
    keys.delete(e.code);
    if (e.code === FIRE_HELD && was && !has(FIRE_HELD)) presses.fireUp++;
  };
  const clearUi = (): void => { ui.clear(); lockTo = null; torpTo = null; rockTo = null; throttleTo = null; freqTo = null; };
  const clear = (): void => { keys.clear(); taken.clear(); ui.clear(); presses = emptyPresses(); lockTo = null; torpTo = null; rockTo = null; throttleTo = null; freqTo = null; ship = []; };
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
    torpLock(room) { torpTo = room; },
    rockLock(weapon, rock) { rockTo = { weapon, rock }; },
    throttle(level) { throttleTo = level; },
    frequency(freq) { freqTo = freq; },
    ship(command) { ship.push(command); if (ship.length > SHIP_QUEUE_MAX) ship.shift(); }
  };
  return {
    ui: consoleInput,
    sample(): KeySample {
      const x = (has(MOVE_CODES.right) ? 1 : 0) - (has(MOVE_CODES.left) ? 1 : 0), y = (has(MOVE_CODES.down) ? 1 : 0) - (has(MOVE_CODES.up) ? 1 : 0);
      const len = Math.sqrt(x * x + y * y) || 1;
      const held: HeldFlags = { fire: has(FIRE_HELD), left: has(MOVE_CODES.left), right: has(MOVE_CODES.right), up: has(MOVE_CODES.up), down: has(MOVE_CODES.down) };
      const out: KeySample = { moveX: x / len, moveY: y / len, interactHeld: has(INTERACT_HELD), fireHeld: held.fire, presses, held, lockTo, torpTo, rockTo, throttleTo, freqTo, ...(ship.length > 0 ? { ship } : {}) };
      presses = emptyPresses(); lockTo = null; torpTo = null; rockTo = null; throttleTo = null; freqTo = null; ship = [];
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
  /** Feel-ii (spec §1.1): the part of dragX / dragY the right button made alone. The Helm's right button aims the heading
   *  instead of panning, so its camera pans by the rest. Absent: none. */
  rightX?: number; rightY?: number;
}
/** Feel-ii (spec §1.1): the right button since the last take, in internal px: where it is (or was let go), whether it
 *  went down and whether it came up since, and whether it is still held. */
export interface AimSample { x: number; y: number; press: boolean; release: boolean; held: boolean }
/** Feel-ii (spec §1.7): a middle click is a ping only when the button moved no further than this between press and release. */
export const PING_CLICK_PX = 6;
interface PointerEventLike { clientX: number; clientY: number; button: number; buttons: number; pointerId?: number; preventDefault(): void }
interface WheelEventLike { clientX: number; clientY: number; deltaY: number; deltaMode: number; preventDefault(): void }

export interface PointerSource {
  sample(): PointerSample;
  /** The last left-button (button 0) pointerdown since the previous call, in internal px, or null; reading clears it
   *  (enemy ship window spec §6.2). Separate from `sample()`, so the camera input is unchanged. */
  takeClick(): { x: number; y: number } | null;
  /** The last pointer position in internal px, or null before any (Sci-1 spec §7.3: Science's hover readout). Not cleared. */
  position(): { x: number; y: number } | null;
  /** Feel-ii (spec §1.1): the right button since the last call, or null when it neither moved nor changed; reading clears
   *  its press and release edges. */
  takeAim(): AimSample | null;
  /** Feel-ii (spec §1.7): the last middle click (pressed and released within PING_CLICK_PX) since the last call, or null. */
  takeMiddleClick(): { x: number; y: number } | null;
  /** Valkyrn spec §5.1: whether the left button is held on the canvas now (the Flight seat's gun). */
  leftHeld(): boolean;
  clear(): void;
  destroy(): void;
}

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

/** `toInternal` maps a client position to internal pixels (the letterbox inverse). Buttons 2 (right) and 1 (middle) drag.
 *  `release` (the window) ends a left-button hold released off the canvas or lost to a blur (Valkyrn spec §5.1). */
export function createPointerSource(target: EventSource, toInternal: (clientX: number, clientY: number) => { x: number; y: number }, release?: EventSource): PointerSource {
  let x: number | null = null, y: number | null = null, wheel = 0, dragX = 0, dragY = 0, rightX = 0, rightY = 0, dragging = false, left = false;
  let click: { x: number; y: number } | null = null, aim: AimSample | null = null, middle: { x: number; y: number; moved: number } | null = null, ping: { x: number; y: number } | null = null;
  const DRAG_BUTTONS = 2 | 4;   // `buttons` bits: 2 right, 4 middle
  const move = (e: PointerEventLike): void => {
    const p = toInternal(e.clientX, e.clientY);
    if (dragging && (e.buttons & DRAG_BUTTONS) !== 0 && x !== null && y !== null) {
      const dx = p.x - x, dy = p.y - y;
      dragX += dx; dragY += dy;
      if ((e.buttons & DRAG_BUTTONS) === 2) { rightX += dx; rightY += dy; }   // the right button alone (Feel-ii: the Helm's aim)
      if (middle) middle.moved += Math.hypot(dx, dy);
    }
    else if ((e.buttons & DRAG_BUTTONS) === 0) dragging = false;
    if ((e.buttons & 1) === 0) left = false;   // Valkyrn spec §5.1: the left button came up somewhere we did not hear
    if ((e.buttons & 2) !== 0 && aim?.held) aim = { ...aim, x: p.x, y: p.y };
    x = p.x; y = p.y;
  };
  const downFn = (e: PointerEventLike): void => {
    const p = toInternal(e.clientX, e.clientY); x = p.x; y = p.y;
    if (e.button === 1 || e.button === 2) { dragging = true; e.preventDefault(); }
    else if (e.button === 0) { click = { x: p.x, y: p.y }; left = true; }   // the contact window's map click (spec §6.2); Valkyrn: the gun
    if (e.button === 2) aim = { x: p.x, y: p.y, press: true, release: false, held: true };
    if (e.button === 1) middle = { x: p.x, y: p.y, moved: 0 };
  };
  const upFn = (e: PointerEventLike): void => {
    if ((e.buttons & DRAG_BUTTONS) === 0) dragging = false;
    if (e.button === 0) left = false;
    const p = toInternal(e.clientX, e.clientY);
    if (e.button === 2 && aim) aim = { ...aim, x: p.x, y: p.y, release: true, held: false };
    if (e.button === 1 && middle) { if (middle.moved + Math.hypot(p.x - middle.x, p.y - middle.y) <= PING_CLICK_PX) ping = { x: p.x, y: p.y }; middle = null; }
  };
  const wheelFn = (e: WheelEventLike): void => {
    const p = toInternal(e.clientX, e.clientY); x = p.x; y = p.y;
    wheel += e.deltaMode === 1 ? e.deltaY * 100 / 3 : e.deltaY;   // line mode: three lines a notch
    e.preventDefault();
  };
  const menu = (e: { preventDefault(): void }): void => { e.preventDefault(); };
  const clear = (): void => { wheel = 0; dragX = 0; dragY = 0; rightX = 0; rightY = 0; dragging = false; left = false; click = null; aim = null; middle = null; ping = null; };
  const on: [string, (e: never) => void][] = [
    ['pointermove', move as (e: never) => void], ['pointerdown', downFn as (e: never) => void], ['pointerup', upFn as (e: never) => void],
    ['wheel', wheelFn as (e: never) => void], ['contextmenu', menu as (e: never) => void]
  ];
  for (const [type, fn] of on) target.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);
  // Valkyrn spec §5.1: a left-button hold ends wherever it is released, or when the window loses focus (Decision 12).
  const releaseUp = (e: PointerEventLike): void => { if (e.button === 0) left = false; }, releaseBlur = (): void => { left = false; };
  release?.addEventListener('pointerup', releaseUp as (e: never) => void);
  release?.addEventListener('blur', releaseBlur as (e: never) => void);
  return {
    sample(): PointerSample {
      const out = { x, y, wheel, dragX, dragY, rightX, rightY };
      wheel = 0; dragX = 0; dragY = 0; rightX = 0; rightY = 0;
      return out;
    },
    takeClick(): { x: number; y: number } | null { const out = click; click = null; return out; },
    takeAim(): AimSample | null {
      const out = aim;
      aim = aim && aim.held ? { ...aim, press: false, release: false } : null;
      return out;
    },
    takeMiddleClick(): { x: number; y: number } | null { const out = ping; ping = null; return out; },
    position: () => (x !== null && y !== null ? { x, y } : null),
    leftHeld: () => left,
    clear,
    destroy(): void {
      for (const [type, fn] of on) target.removeEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);
      release?.removeEventListener('pointerup', releaseUp as (e: never) => void); release?.removeEventListener('blur', releaseBlur as (e: never) => void);
    }
  };
}
