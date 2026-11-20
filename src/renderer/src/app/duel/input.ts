// Keyboard and mouse for the Helm demo views (H-1 spec §5). One keyboard drives the active character, or the one ship in
// the flight view. Pointer input feeds the camera and, through takeClick, the contact window's map clicks (enemy ship
// window spec §6.2); it never becomes a command (parent §10).
import type { Axes } from '../../sim/tactical/state';
import { clampThrottle, THROTTLE_MAX } from '../../sim/duel/throttle';
import type { HeldInput } from '../../net/contracts';
import type { ShipCommand } from '../../render/duel/shipControls';

/** Press-edge actions (spec §5 table). H-1a uses pause, camera and the zoom keys; H-1b adds the duel ones; Artemis-ii
 *  adds the Helm's throttle notches on W and S (spec 2026-11-17-artemis-consoles §5.4); W-2 adds Z, the laser's AUTO / MANUAL toggle at Weapons (pew pew spec §2);
 *  W-3 adds V, the torpedo's (pew pew spec §3: the spec's X is Stand and C the camera, so V).
 *  W-4 spec §9: A and D select the previous / next weapon at the Hound's Weapons seat (press edges; they stay held keys for walking, the crew Helm's thrusters and W-3's MANUAL torpedo).
 *  W-4 amendment §2.4: R flips the selected weapon's AUTO / MAN at the Hound's Weapons seat (`weaponMode`), and with Shift held it sets both guns together (`weaponModeAll`, which has no code of its own); Z and V stay the laser fit's. */
export type KeyAction = 'interact' | 'prevLock' | 'fireDown' | 'fireUp' | 'launch' | 'laserMode' | 'torpMode' | 'weaponMode' | 'weaponModeAll' | 'stand' | 'switch' | 'pause' | 'camera' | 'zoomIn' | 'zoomOut' | 'confirm' | 'menu' | 'throttleUp' | 'throttleDown' | 'selectPrev' | 'selectNext';

export const PRESS_CODES: Readonly<Record<string, KeyAction>> = {
  KeyE: 'interact', KeyQ: 'prevLock', Space: 'fireDown', KeyF: 'launch', KeyZ: 'laserMode', KeyV: 'torpMode', KeyR: 'weaponMode', KeyX: 'stand', Tab: 'switch', Escape: 'pause', KeyC: 'camera',
  Equal: 'zoomIn', NumpadAdd: 'zoomIn', Minus: 'zoomOut', NumpadSubtract: 'zoomOut', Enter: 'confirm', NumpadEnter: 'confirm', KeyM: 'menu',
  KeyW: 'throttleUp', KeyS: 'throttleDown', KeyA: 'selectPrev', KeyD: 'selectNext'
};
/** Sci-1 spec §7.4: keys tune the laser to A, B and C (the duel modes read them at Weapons only). 3, 4 and 5 since the
 *  FTL targeting update, whose 1 and 2 pick up the laser and the torpedo (WEAPON_CODES). */
export const FREQ_CODES: Readonly<Record<string, number>> = { Digit3: 0, Digit4: 1, Digit5: 2 };
/** FTL targeting spec §1: 1 and 2 pick up the laser and the torpedo at Weapons (the contact controller's intercept takes them). */
export const WEAPON_CODES: Readonly<Record<string, 'laser' | 'torpedo'>> = { Digit1: 'laser', Digit2: 'torpedo' };
/** W-4 spec §9: at the Hound's Weapons seat 1, 2, 3 (and Num 1-3) select pew pew, the autocannon, the torpedo. */
export const WEAPON_SELECT_CODES: Readonly<Record<string, number>> = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };
/** W-4 spec §5.2, §9: at the Hound's Weapons seat 4, 5, 6 tune the guns' shield frequency A, B, C. FREQ_CODES (3, 4, 5)
 *  stays the laser fit's. */
export const GUN_FREQ_CODES: Readonly<Record<string, number>> = { Digit4: 0, Digit5: 1, Digit6: 2 };
/** The held keys: WASD movement (walk, the Helm's turn, the flight view's thrust and turn, steer), E held to repair,
 *  Space (its press fires a full laser, FTL targeting spec §2). W and S are also the throttle's press edges (PRESS_CODES). */
export const MOVE_CODES = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' } as const;
export const INTERACT_HELD = 'KeyE', FIRE_HELD = 'Space';
/** Feel-ii §2.7: G drops a ping at the pointer on a console map (the duel modes take it through the keyboard's intercept). */
export const PING_CODE = 'KeyG';
/** Playtest2feedback §4: the crew Helm's cold gas keys: Q and ← push to port, E and → to starboard, ↑ forward, ↓ aft.
 *  Owner 2026-11-19: A and D turn the ship again (they were thrusters too). */
export const RCS_CODES = { port: ['KeyQ', 'ArrowLeft'], starboard: ['KeyE', 'ArrowRight'], fore: ['ArrowUp'], aft: ['ArrowDown'] } as const;

/** The merged held state a console draws (spec §6.1): Space, A, D, W, S from the keys or the console's buttons. */
export interface HeldFlags { fire: boolean; left: boolean; right: boolean; up: boolean; down: boolean;
  /** The crew Helm's side thrusters held (Q or ←, E or →, or the PORT and STBD buttons); absent is false. */
  port?: boolean; starboard?: boolean }
export const NO_HELD_FLAGS: HeldFlags = { fire: false, left: false, right: false, up: false, down: false };
/** The codes a console button can hold (spec §6.2). */
export type HoldCode = 'Space' | 'KeyA' | 'KeyD' | 'KeyW' | 'KeyS' | 'ArrowLeft' | 'ArrowRight';
/** What a console click can do (spec §6.2): a press edge, a held code, a direct lock request, a throttle notch, or a laser
 *  frequency (Sci-1 spec §7.4). FTL targeting spec §1: `lock` sets the laser's target room (−1 clears it) and `torpLock`
 *  the torpedo's. */
export interface ConsoleInput { press(action: KeyAction): void; hold(code: HoldCode, on: boolean): void; lock(room: number): void; torpLock(room: number): void; throttle(level: number): void; frequency(freq: number): void;
  /** W-4 spec §10: a card click selects that weapon (0..2); optional, as ship. */
  select?(slot: 0 | 1 | 2): void;
  /** W-4 amendment §2.5: a click on a card's AUTO / MAN tag on the Hound's block (0 pew pew, 1 the autocannon, 2 the
   *  torpedo): each tag is its own switch. Optional, as select. */
  mode?(slot: 0 | 1 | 2): void;
  /** Spike ii §6.5: a weapon card's right-click clear of a rock target (rock −1); optional so older fakes still fit. */
  rockLock?(weapon: 'laser' | 'torpedo', rock: number): void;
  /** Engineering spike §6, §7: a ship-view click (a power column, a coolant counter, a door or an airlock). Optional, so
   *  the tests' console literals stay valid; callers use `?.`. */
  ship?(command: ShipCommand): void;
  /** Engineering spike §10.3: a bar on or off a weapon slot. Optional, as ship. */
  weaponPower?(slot: number, delta: 1 | -1): void }
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
  /** The last frequency a console button asked for since the previous sample, or null (Sci-1 spec §7.4; W-4 spec §9: buttons only). */
  freqTo?: number | null;
  /** W-4 spec §9: the last keydown since the previous sample, each read by class: FREQ_CODES (3, 4, 5 → 0..2; the laser
   *  fit tunes, the gun fit's Flight seat says NO LASER), GUN_FREQ_CODES (4, 5, 6 → 0..2; the Hound's Weapons seat) and
   *  WEAPON_SELECT_CODES or a card click (the Hound's selection 0..2). null for none. */
  freqKeyTo?: number | null; gunFreqKeyTo?: number | null; selectTo?: number | null;
  /** W-4 amendment §2.5: the tag clicks since the previous sample, per weapon [pew pew, the autocannon, the torpedo];
   *  absent means none. createDuelKeyboard always sets it. Read only at the Hound's Weapons seat. */
  modeTaps?: readonly number[];
  /** Playtest2feedback §3, §4: the crew Helm's held throttle (1 W, −1 S, 0 both or neither) and thrusters (rcsX −1 port,
   *  1 starboard; rcsY −1 aft, 1 forward; opposite keys cancel). createDuelKeyboard always sets them. */
  throttleHeld?: number; rcsX?: number; rcsY?: number;
  /** Engineering spike §7: the ship-view commands clicked since the previous sample, oldest first; absent or empty for none. */
  ship?: ShipCommand[];
}

export function emptyPresses(): Record<KeyAction, number> {
  return { interact: 0, prevLock: 0, fireDown: 0, fireUp: 0, launch: 0, laserMode: 0, torpMode: 0, weaponMode: 0, weaponModeAll: 0, stand: 0, switch: 0, pause: 0, camera: 0, zoomIn: 0, zoomOut: 0, confirm: 0, menu: 0, throttleUp: 0, throttleDown: 0, selectPrev: 0, selectNext: 0 };
}

/** The flight dev view's held axes from a key sample: A/D turn (D clockwise), W thrusts forward, S reverses (W gives moveY −1). The duel's Helm thrusts by its throttle instead (Artemis spec §5.3). */
export function helmAxes(k: Pick<KeySample, 'moveX' | 'moveY'>): Axes {
  return { turn: Math.sign(k.moveX) || 0, thrust: -Math.sign(k.moveY) || 0 };
}

/** Playtest2feedback §3, §4, §4a: the crew Helm's held fields from a key sample and the held steer (a heading index, or −1
 *  while the left button is up). A zero field is left out (absent means 0 on the wire). The Valkyrn's mapping is
 *  helmAxes and the throttle notches, unchanged. */
export function crewHelmHeld(k: Pick<KeySample, 'throttleHeld' | 'rcsX' | 'rcsY'>, steer: number): Pick<HeldInput, 'throttleHeld' | 'rcsX' | 'rcsY' | 'aim'> {
  const t = k.throttleHeld ?? 0, x = k.rcsX ?? 0, y = k.rcsY ?? 0;
  return { ...(t !== 0 ? { throttleHeld: t } : {}), ...(x !== 0 ? { rcsX: x } : {}), ...(y !== 0 ? { rcsY: y } : {}), ...(steer >= 0 ? { aim: steer } : {}) };
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
interface KeyEventLike { code: string; repeat: boolean; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; preventDefault(): void }

export interface DuelKeyboard { sample(): KeySample; clear(): void; clearUi(): void; destroy(): void; readonly ui: ConsoleInput;
  /** Playtest2feedback (final review I1): every key held now stops counting for the crew Helm's held fields (throttleHeld,
   *  rcsX, rcsY) until it is released and pressed again. The modes call it as their seat becomes the crew Helm, so a key
   *  held while sitting (E sits and is a thruster) or walking up (W, A, D) never drifts a ship with no drag. */
  staleHeld(): void }

/** Options (enemy ship window spec §6.2): `intercept` sees each non-repeat keydown's code before PRESS_CODES; returning
 *  true takes the key, so it adds no press edge and is not held (PREVENT's keys still have their default prevented). */
export interface DuelKeyboardOptions { intercept?: (code: string) => boolean }

/** Held keys are cleared on blur so nothing sticks after alt-tab; `clear` does the same for Tab and restart (spec §4, §5).
 *  Console clicks (Artemis spec §6.2) are a second held set and extra press edges: a code is held when either set holds
 *  it, and Fire's edges are the merged Space state's transitions. `clearUi` drops only the clicks. */
export function createDuelKeyboard(target: EventSource, opts: DuelKeyboardOptions = {}): DuelKeyboard {
  const keys = new Set<string>(), ui = new Set<string>(), taken = new Set<string>(), stale = new Set<string>();
  let presses = emptyPresses(), lockTo: number | null = null, torpTo: number | null = null, rockTo: { weapon: 'laser' | 'torpedo'; rock: number } | null = null, throttleTo: number | null = null, freqTo: number | null = null;
  let freqKeyTo: number | null = null, gunFreqKeyTo: number | null = null, selectTo: number | null = null;
  let modeTaps = [0, 0, 0];   // W-4 amendment §2.5: the tags' clicks per weapon
  let ship: ShipCommand[] = [];   // Engineering spike §7: kept by clearUi, dropped by clear
  const has = (code: string): boolean => keys.has(code) || ui.has(code);
  /** I1: held for the crew Helm's fields: a console button's hold, or a key pressed since it went stale. */
  const live = (code: string): boolean => ui.has(code) || (keys.has(code) && !stale.has(code));
  const down = (e: KeyEventLike): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (!e.repeat) stale.delete(e.code);   // I1: a fresh press counts again (its keyup may have been lost); a repeat stays stale
    if (e.repeat) { if (taken.has(e.code)) return; }   // an OS repeat of a taken key stays taken
    else if (opts.intercept?.(e.code)) { taken.add(e.code); return; }   // taken (the contact window's Esc and T): no edge, not held
    if (!e.repeat && FREQ_CODES[e.code] !== undefined) freqKeyTo = FREQ_CODES[e.code]!;   // W-4 spec §9: by class, in the runtime
    if (!e.repeat && GUN_FREQ_CODES[e.code] !== undefined) gunFreqKeyTo = GUN_FREQ_CODES[e.code]!;
    if (!e.repeat && WEAPON_SELECT_CODES[e.code] !== undefined) selectTo = WEAPON_SELECT_CODES[e.code]!;
    if (e.code === FIRE_HELD) { if (!e.repeat && !has(FIRE_HELD)) presses.fireDown++; }
    else if (e.code === MOVE_CODES.up && e.shiftKey === true) { if (!e.repeat) throttleTo = THROTTLE_MAX; }   // Feel-ii §1.4: Shift+W is full burn
    else if (PRESS_CODES[e.code] === 'weaponMode') { if (!e.repeat && e.ctrlKey !== true && e.metaKey !== true) presses[e.shiftKey === true ? 'weaponModeAll' : 'weaponMode']++; }   // W-4 amendment §2.4: R, and Shift+R for both guns; Ctrl+R and Meta+R are the browser's, so they count nothing
    else { const action = PRESS_CODES[e.code]; if (action && !e.repeat) presses[action]++; }
    keys.add(e.code);
  };
  const up = (e: KeyEventLike): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    const was = has(FIRE_HELD);
    taken.delete(e.code);
    keys.delete(e.code);
    stale.delete(e.code);
    if (e.code === FIRE_HELD && was && !has(FIRE_HELD)) presses.fireUp++;
  };
  const clearUi = (): void => { ui.clear(); lockTo = null; torpTo = null; rockTo = null; throttleTo = null; freqTo = null; freqKeyTo = null; gunFreqKeyTo = null; selectTo = null; modeTaps = [0, 0, 0]; };
  const clear = (): void => { keys.clear(); taken.clear(); ui.clear(); stale.clear(); presses = emptyPresses(); lockTo = null; torpTo = null; rockTo = null; throttleTo = null; freqTo = null; freqKeyTo = null; gunFreqKeyTo = null; selectTo = null; modeTaps = [0, 0, 0]; ship = []; };
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
    select(slot) { selectTo = slot; },
    mode(slot) { modeTaps[slot] = (modeTaps[slot] ?? 0) + 1; },
    ship(command) { ship.push(command); if (ship.length > SHIP_QUEUE_MAX) ship.shift(); },
    weaponPower(slot, delta) { ship.push({ kind: 'weaponPower', slot, delta }); if (ship.length > SHIP_QUEUE_MAX) ship.shift(); }
  };
  return {
    ui: consoleInput,
    sample(): KeySample {
      const x = (has(MOVE_CODES.right) ? 1 : 0) - (has(MOVE_CODES.left) ? 1 : 0), y = (has(MOVE_CODES.down) ? 1 : 0) - (has(MOVE_CODES.up) ? 1 : 0);
      const len = Math.sqrt(x * x + y * y) || 1;
      const held: HeldFlags = { fire: has(FIRE_HELD), left: has(MOVE_CODES.left), right: has(MOVE_CODES.right), up: has(MOVE_CODES.up), down: has(MOVE_CODES.down),
        port: RCS_CODES.port.some(has), starboard: RCS_CODES.starboard.some(has) };
      // Playtest2feedback §3, §4: the crew Helm's held throttle and thrusters, each opposite pair cancelling.
      // Final review I1: a stale key (held when the seat became the crew Helm) counts for none of them.
      const any = (codes: readonly string[]): number => (codes.some(live) ? 1 : 0);
      const rcsX = any(RCS_CODES.starboard) - any(RCS_CODES.port), rcsY = any(RCS_CODES.fore) - any(RCS_CODES.aft);
      const throttleHeld = (live(MOVE_CODES.up) ? 1 : 0) - (live(MOVE_CODES.down) ? 1 : 0);
      const out: KeySample = { moveX: x / len, moveY: y / len, interactHeld: has(INTERACT_HELD), fireHeld: held.fire, presses, held, lockTo, torpTo, rockTo, throttleTo, freqTo, freqKeyTo, gunFreqKeyTo, selectTo, modeTaps, throttleHeld, rcsX, rcsY, ...(ship.length > 0 ? { ship } : {}) };
      presses = emptyPresses(); lockTo = null; torpTo = null; rockTo = null; throttleTo = null; freqTo = null; freqKeyTo = null; gunFreqKeyTo = null; selectTo = null; modeTaps = [0, 0, 0]; ship = [];
      return out;
    },
    clear,
    clearUi,
    staleHeld(): void { for (const code of keys) stale.add(code); },
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
