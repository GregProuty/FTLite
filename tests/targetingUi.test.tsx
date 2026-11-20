// @vitest-environment jsdom
// FTL targeting spec §1, §3 (UI and render): the Weapons cards pick a weapon up, the targeting line and its reticle
// follow the pointer on the CRT amber ramp (hot over a room, mid elsewhere), a room click sets that weapon's target
// (laserLock or torpLock through the console input), Esc or a right-click cancels, a right-click on a card clears its
// target, and 1 / 2 pick up from the keyboard. Driven with the real contact controller and keyboard.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { contactModel, ROOMS_NEED_SCAN, SCANNING_ROOMS } from '../src/renderer/src/render/duel/contactModel';
import { CONTACT_BOX, weaponCard } from '../src/renderer/src/render/duel/consoleLayout';
import { createContactController, type ContactSync } from '../src/renderer/src/app/duel/contactController';
import { createDuelKeyboard, NO_HELD_FLAGS, type EventSource } from '../src/renderer/src/app/duel/input';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { TEXT } from '../src/renderer/src/render/theme';
import { CRT, CRT_RAMP } from '../src/renderer/src/render/tactical/crtTheme';
import { hex } from '../src/renderer/src/ui/stage/color';
import { targetingTint } from '../src/renderer/src/ui/duel/TargetingLine';
import { makeUi } from './helpers/uiStore';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const charge = { label: 'CHARGE', value: 'READY', labelTint: TEXT, valueTint: TEXT, bar: { fill: 1, colour: TEXT } };
const live: ContactSync = { shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, enemyKnown: 2 };
const weaponsConsole: ConsoleView = {
  station: 'weapons', tabs: { helm: 'open', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, science: null, ship: 'stand' },
  helm: null, science: null,
  weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, torpedoInRange: true, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null, laserTarget: -1, torpTarget: -1, burst: 2 }
};
const btn = (name: string) => document.querySelector(`[data-testid="console-${name}"]`) as HTMLElement;
/** The card's clickable part (the role="button" wrapper's box). */
const card = (w: 'laser' | 'torpedo') => btn(`card-${w}`).firstElementChild as HTMLElement;
const line = () => document.querySelector('[data-ui-targeting]');
const reticle = () => document.querySelector('[data-ui-contact-reticle]');
const ends = (): number[] => { const l = document.querySelector('[data-ui-targeting-line]')!; return ['x1', 'y1', 'x2', 'y2'].map((k) => Number(l.getAttribute(k))); };
const texts = () => Array.from(document.querySelectorAll('canvas')).map((e) => e.dataset.text);

/** The UI with the real contact controller; `frame()` rebuilds the contact view from the controller, as the scene does. */
function mount(known = 2) {
  const ui = makeUi(), duel = createDuelSink(ui.store), controller = createContactController(), st: TacticalState = createTacticalState(4, 2, ShipClass.ValkyrnLaser);   // W-4 spec §14.1: the beam's rule, on the laser fit
  st.known[0] = known;
  const sync = (): ContactSync => ({ ...live, enemyKnown: st.known[0] });
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
  ui.actions.setConsole(input); ui.actions.setContact(controller);
  controller.sync(sync());
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  /** One frame; `pointer` is the app's tracked pointer position the scene puts in the frame while a weapon is picked up. */
  const frame = (pointer: { x: number; y: number } | null = null): void => {
    controller.sync(sync());
    const open = controller.state();
    const contact = open ? contactModel({ state: st, contact: open.contact, aim: open.aim, weapon: controller.aimWeapon() ?? 'laser', station: 'weapons', t: 0, weapons: { charge } }) : null;
    const view: DuelUiView = { end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console: weaponsConsole, contact,
      ...(contact?.aimWeapon ? { pointer } : {}) };
    act(() => duel.frame(view));
  };
  frame();
  return { controller, input, frame, st };
}
const move = (x: number, y: number): void => { act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y })); }); };

describe('the weapon cards and the targeting line (FTL targeting spec §1)', () => {
  it('a card click picks the weapon up: the card lights, the window opens, and the line runs from the card to the pointer with a reticle', () => {
    const { controller, frame } = mount();
    expect(line()).toBeNull(); expect(btn('card-laser').dataset.uiCard).toBe('idle');
    fireEvent.pointerDown(card('laser'), { button: 0 }); frame();
    expect(controller.aimWeapon()).toBe('laser');
    expect(btn('card-laser').dataset.uiCard).toBe('lit');
    expect(document.querySelector('[data-ui-contact]')).not.toBeNull();
    const a = weaponCard('laser').anchor, b = CONTACT_BOX;
    expect(line()?.getAttribute('data-ui-targeting')).toBe('laser');      // drawn at once: no pointer known yet, toward the enemy drawing's centre
    expect(ends()).toEqual([a.x, a.y, b.x + b.w / 2, b.y + b.h / 2]);
    expect(reticle()).not.toBeNull();
    move(700, 300);
    expect(ends()).toEqual([a.x, a.y, 700, 300]);
  });
  it('the line starts at the last known pointer position before the mouse moves, then follows the mouse', () => {
    const { frame } = mount();
    fireEvent.pointerDown(card('torpedo'), { button: 0 }); frame({ x: 640, y: 200 });
    const a = weaponCard('torpedo').anchor;
    expect(ends()).toEqual([a.x, a.y, 640, 200]);
    move(500, 500); frame({ x: 640, y: 200 });
    expect(ends()).toEqual([a.x, a.y, 500, 500]);                          // the live pointer wins over the frame's
  });
  it('an unscanned enemy (FTL targeting fix): the pick-up lights the card and draws the line, requests the Level 1 scan, says so in the window, and a room click works once Level 1 arrives', () => {
    const { controller, input, frame, st } = mount(0);
    fireEvent.pointerDown(card('laser'), { button: 0 }); frame();
    expect(controller.aimWeapon()).toBe('laser');
    expect(btn('card-laser').dataset.uiCard).toBe('lit');
    expect(line()).not.toBeNull(); expect(reticle()).not.toBeNull();
    expect(texts()).toContain('UNKNOWN CONTACT'); expect(texts()).toContain(ROOMS_NEED_SCAN);
    expect(controller.takeRequests().scan).toBe(0);                        // the SCAN button's request
    Object.assign(st.scan, { contact: 0, level: 1, progress: 450, rate: 1, by: 1 }); frame();   // the scan runs
    expect(texts()).toContain(SCANNING_ROOMS); expect(texts()).not.toContain(ROOMS_NEED_SCAN);
    const ramp = new Set(CRT_RAMP.map((c) => hex(c)));
    expect(Array.from(line()!.querySelectorAll('*')).map((e) => e.getAttribute('stroke')).filter((x): x is string => x !== null).every((x) => ramp.has(x))).toBe(true);
    expect(controller.aimWeapon()).toBe('laser');                          // still picked up
    st.known[0] = 1; Object.assign(st.scan, { contact: -1, level: 0, progress: 0 }); frame();   // Level 1: the rooms
    const shld = contactModel({ state: st, contact: 0, aim: true, station: 'weapons', t: 0, weapons: { charge } })!.rooms[1]!.centre;
    fireEvent.pointerDown(document.querySelector('[data-ui-contact-box]')!, { button: 0, clientX: shld.x, clientY: shld.y }); frame();
    expect(input.lock).toHaveBeenCalledWith(1);
  });
  it('the line and reticle stay on the CRT amber ramp: hot over a room of the drawing, mid elsewhere', () => {
    const { frame } = mount();
    fireEvent.pointerDown(card('torpedo'), { button: 0 }); frame();
    const ramp = new Set(CRT_RAMP.map((c) => hex(c)));
    const strokes = (): string[] => Array.from(line()!.querySelectorAll('*')).map((e) => e.getAttribute('stroke')).filter((s): s is string => s !== null);
    move(10, 10);
    expect(strokes().every((s) => ramp.has(s))).toBe(true);
    expect(strokes()).toContain(hex(CRT.mid)); expect(strokes()).not.toContain(hex(CRT.hot));
    const contact = contactModel({ state: (() => { const s = createTacticalState(4); s.known[0] = 2; return s; })(), contact: 0, aim: true, station: 'weapons', t: 0, weapons: { charge } })!;
    const shld = contact.rooms[1]!.centre;
    expect(targetingTint(contact, shld)).toBe(CRT.hot);
    move(shld.x, shld.y);
    expect(strokes().every((s) => ramp.has(s))).toBe(true);
    expect(strokes()).toContain(hex(CRT.hot));
  });
  it('a room click sets the target of the weapon picked up: laserLock for the laser, torpLock for the torpedo; the pick-up drops', () => {
    const { controller, input, frame } = mount();
    const box = () => document.querySelector('[data-ui-contact-box]') as Element;
    const room = (r: number) => { const s = createTacticalState(4); s.known[0] = 2; return contactModel({ state: s, contact: 0, aim: true, station: 'weapons', t: 0, weapons: { charge } })!.rooms[r]!.centre; };
    fireEvent.pointerDown(card('laser'), { button: 0 }); frame();
    fireEvent.pointerDown(box(), { button: 0, clientX: room(2).x, clientY: room(2).y }); frame();
    expect(input.lock).toHaveBeenCalledWith(2); expect(input.torpLock).not.toHaveBeenCalled();
    expect(controller.aimWeapon()).toBeNull(); expect(line()).toBeNull();
    fireEvent.pointerDown(card('torpedo'), { button: 0 }); frame();
    fireEvent.pointerDown(box(), { button: 0, clientX: room(0).x, clientY: room(0).y }); frame();
    expect(input.torpLock).toHaveBeenCalledWith(0); expect(input.lock).toHaveBeenCalledTimes(1);
  });
  it('cancel without a change: the card again, a right-click anywhere, or Esc', () => {
    const { controller, input, frame } = mount();
    fireEvent.pointerDown(card('laser'), { button: 0 }); frame();
    fireEvent.pointerDown(card('laser'), { button: 0 }); frame();
    expect(controller.aimWeapon()).toBeNull();
    fireEvent.pointerDown(card('torpedo'), { button: 0 }); frame(); move(400, 400);
    act(() => { window.dispatchEvent(new MouseEvent('pointerdown', { button: 2 })); }); frame();
    expect(controller.aimWeapon()).toBeNull(); expect(line()).toBeNull();
    fireEvent.pointerDown(card('torpedo'), { button: 0 }); frame();
    expect(controller.intercept('Escape')).toBe(true); frame();
    expect(controller.aimWeapon()).toBeNull();
    expect([input.lock, input.torpLock].map((f) => f.mock.calls.length)).toEqual([0, 0]);
  });
  it('a right-click on a card clears that weapon target (−1); the context menu is suppressed', () => {
    const { input } = mount();
    fireEvent.pointerDown(card('laser'), { button: 2 });
    fireEvent.pointerDown(card('torpedo'), { button: 2 });
    expect(input.lock.mock.calls).toEqual([[-1]]); expect(input.torpLock.mock.calls).toEqual([[-1]]);
    expect(fireEvent.contextMenu(btn('card-laser'))).toBe(false);
  });
  it('the keyboard: 1 and 2 pick up the laser and the torpedo, through the contact controller intercept', () => {
    const { controller, frame } = mount();
    const listeners = new Map<string, (e: never) => void>();
    const target = { addEventListener: (t: string, fn: (e: never) => void) => { listeners.set(t, fn); }, removeEventListener: () => {} };
    const kb = createDuelKeyboard(target as unknown as EventSource, { intercept: (code) => controller.intercept(code) });
    const down = (code: string) => (listeners.get('keydown') as unknown as (e: { code: string; repeat: boolean; preventDefault(): void }) => void)({ code, repeat: false, preventDefault() {} });
    down('Digit1'); frame();
    expect([controller.aimWeapon(), btn('card-laser').dataset.uiCard]).toEqual(['laser', 'lit']);
    down('Digit2'); frame();
    expect([controller.aimWeapon(), btn('card-torpedo').dataset.uiCard, btn('card-laser').dataset.uiCard]).toEqual(['torpedo', 'lit', 'idle']);
    expect(kb.sample().freqTo).toBeNull();   // taken: not a frequency
    kb.destroy();
  });
});
