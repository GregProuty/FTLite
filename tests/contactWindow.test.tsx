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
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { TEXT } from '../src/renderer/src/render/theme';
import { CRT } from '../src/renderer/src/render/tactical/crtTheme';
import { hex } from '../src/renderer/src/ui/stage/color';
import { makeUi } from './helpers/uiStore';
import { setLayout } from '../src/renderer/src/ui/store';
import { addShieldHit, createShieldFx } from '../src/renderer/src/render/shieldFx';
import { HUNTER_FRAME } from '../src/renderer/src/render/duel/hunterArt';
import { consoleLayout } from '../src/renderer/src/render/duel/consoleLayout';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const charge = { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: TEXT } };
const contactOf = (station: 'helm' | 'weapons', aim: boolean, targets: { laser?: number; torp?: number } = {}): ContactView => {
  const st = createTacticalState(4, 2, ShipClass.ValkyrnLaser); st.known[0] = 2;   // W-4 spec §14.1: the beam's window, on the laser fit. Sci-1: the full window is Level 2
  st.systems[0].laserTargeted = false;   // no target unless asked (a round starts at the Feel-i SHIELDS opener)
  if (targets.laser !== undefined) { st.systems[0].lock = targets.laser; st.systems[0].laserTargeted = true; }
  if (targets.torp !== undefined) st.systems[0].torpLock = targets.torp;
  return contactModel({ state: st, contact: 0, aim, station, t: 0, weapons: station === 'weapons' ? { charge } : null })!;
};
const view = (contact: ContactView): DuelUiView => ({ end: null, banners: { interior: null, tactical: null, notice: null, alert: null }, overlay: null, crt: true, console: null, contact });
function mount(contact: ContactView) {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const c = { close: vi.fn(), arm: vi.fn(), cancelAim: vi.fn(), pick: vi.fn(), scan: vi.fn(), pickUp: vi.fn() };
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
  it('draws the title, the room labels and, at Weapons, LASER and TORPEDO, with nothing to steer (homing torpedo spec §3)', () => {
    mount(contactOf('weapons', false));
    for (const t of ['ENEMY SHIP', 'WEAP', 'SHLD', 'ENG', 'TORPEDO', 'CHARGE', '40%']) expect(texts(), t).toContain(t);
    for (const t of ['MISSILE', 'STEER LMB']) expect(texts(), t).not.toContain(t);
    expect(btn('contact-laser')).not.toBeNull(); expect(btn('contact-torpedo')).not.toBeNull();
    expect(document.querySelector('[data-ui-contact-lock]')).toBeNull();   // FTL targeting spec §1: no target yet, no mark
    expect(document.querySelector('[data-ui-contact-torp]')).toBeNull();
  });
  it('each weapon target room carries its mark on the CRT ramp: the laser brackets, the torpedo diamond', () => {
    mount(contactOf('weapons', false, { laser: 0, torp: 2 }));
    const ramp = new Set([CRT.glass, CRT.faint, CRT.dim, CRT.mid, CRT.main, CRT.hot].map((c) => hex(c)));
    for (const sel of ['[data-ui-contact-lock]', '[data-ui-contact-torp]']) {
      const g = document.querySelector(sel) as Element;
      expect(g, sel).not.toBeNull();
      for (const e of Array.from(g.children)) expect(ramp.has(e.getAttribute('stroke') ?? ''), sel).toBe(true);
    }
  });
  it('LASER calls arm; TORPEDO picks the torpedo up', () => {
    const c = mount(contactOf('weapons', false));
    fireEvent.pointerDown(btn('contact-laser')!, { button: 0 });
    expect(c.arm).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(btn('contact-torpedo')!, { button: 0 });
    expect(c.pickUp).toHaveBeenCalledWith('torpedo');
  });
  it('while armed, a click inside the SHLD polygon calls pick(1); a click in the box on no room calls nothing', () => {
    const v = contactOf('weapons', true), c = mount(v), shld = v.rooms[1]!.centre;
    fireEvent.pointerDown(box(), { button: 0, clientX: v.box.x + 2, clientY: v.box.y + 2 });
    expect(c.pick).not.toHaveBeenCalled();
    fireEvent.pointerDown(box(), { button: 0, clientX: shld.x, clientY: shld.y });
    expect(c.pick).toHaveBeenCalledTimes(1); expect(c.pick.mock.calls[0]![0]).toBe(1);
  });
  it('while armed, the box hides the cursor (the reticle is the targeting line’s, tests/targetingUi.test.tsx)', () => {
    mount(contactOf('weapons', true));
    expect(box().getAttribute('style')).toContain('cursor: none');
  });
  it('draws a glass under-stroke below the hover outline, and a backing box behind each room label', () => {
    const v = contactOf('weapons', true), shld = v.rooms[1]!.centre;
    mount(v);
    fireEvent.pointerMove(box(), { clientX: shld.x, clientY: shld.y });
    const glass = hex(CRT.glass);
    const hov = document.querySelector('[data-ui-contact-hover]') as Element;
    expect(hov).not.toBeNull();
    expect(Array.from(hov.children).some((e) => e.getAttribute('stroke') === glass && e.getAttribute('stroke-width') === '3')).toBe(true);
    expect(document.querySelectorAll('[data-ui-contact-label-bg]').length).toBe(v.rooms.length);
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
    expect(btn('contact-laser')).toBeNull(); expect(texts()).not.toContain('TORPEDO');
    fireEvent.pointerMove(box(), { clientX: shld.x, clientY: shld.y });
    fireEvent.pointerDown(box(), { button: 0, clientX: shld.x, clientY: shld.y });
    expect(c.pick).not.toHaveBeenCalled();
    expect(document.querySelector('[data-ui-contact-reticle]')).toBeNull();
  });
  it('a struck room flashes: a hot fill over its polygon at the flash alpha (duel polish i spec §B)', () => {
    const c = contactOf('helm', false);
    mount({ ...c, flash: [{ room: 1, points: c.rooms[1]!.points, alpha: 0.4 }] });
    const f = document.querySelectorAll('[data-ui-contact-flash]');
    expect(f).toHaveLength(1);
    expect(f[0]!.getAttribute('data-ui-contact-flash')).toBe('SHLD');
    expect(f[0]!.getAttribute('fill')).toBe(hex(CRT.hot));
    expect(Number(f[0]!.getAttribute('fill-opacity'))).toBeCloseTo(0.4, 9);
  });
  it('without a contact view no window is drawn', () => {
    const ui = makeUi(), duel = createDuelSink(ui.store);
    render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
    act(() => duel.frame({ ...view(contactOf('weapons', false)), contact: null }));
    expect(root()).toBeNull();
  });
});

describe('the contact window on a wider stage (UI round 2b)', () => {
  it('anchors to the right edge of the stage: at stage 1707 its left edge is at internal x 1395', () => {
    const ui = makeUi(), duel = createDuelSink(ui.store);
    ui.actions.setContact({ close: vi.fn(), arm: vi.fn(), cancelAim: vi.fn(), pick: vi.fn(), scan: vi.fn(), pickUp: vi.fn() });
    setLayout(ui.store, { scale: 1, offsetX: 0, offsetY: 0, stageW: 1707, stageH: 720, dpr: 1 });
    render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
    const st = createTacticalState(4, 2, ShipClass.ValkyrnLaser); st.known[0] = 2;
    act(() => duel.frame(view(contactModel({ state: st, contact: 0, aim: false, station: 'helm', t: 0, weapons: null, box: consoleLayout({ w: 1707, h: 720 }).CONTACT_BOX })!)));
    expect((root() as HTMLElement).style.left).toBe('1395px');
    expect((box() as SVGElement).getAttribute('viewBox')?.split(' ')[0]).toBe('1407');
  });
});

describe('the Hunter art in the window (UI round Part 3 §3.4)', () => {
  const withArt = (): ContactView => {
    const st = createTacticalState(4, 2, ShipClass.ValkyrnLaser); st.known[0] = 1; st.systems[1]!.shields = 2;
    const fx = createShieldFx(2); addShieldHit(fx, 1, 0, false, false); fx.hits[1]![0]!.age = 0.01;
    return contactModel({ state: st, contact: 0, aim: false, station: 'helm', t: 0, weapons: null, art: { url: 'hunter.png', frame: HUNTER_FRAME }, shield: { fx, slot: 1 } })!;
  };
  it('draws the amber filter once, the art under the outline (fill none), the bubble, the cells and the status row under the box', () => {
    const c = withArt();
    mount(c);
    const f = document.querySelectorAll('filter#crt-amber');
    expect(f.length).toBe(1);
    expect(f[0]!.querySelector('feColorMatrix')!.getAttribute('values')).toBe('0');
    expect(f[0]!.querySelectorAll('feComponentTransfer > *').length).toBe(3);
    const img = document.querySelector('[data-ui-contact-art]')!;
    expect(img.getAttribute('filter')).toBe('url(#crt-amber)');
    expect(img.nextElementSibling!.tagName.toLowerCase()).toBe('polygon');
    expect(img.nextElementSibling!.getAttribute('fill')).toBe('none');
    expect(document.querySelector('[data-ui-contact-bubble]')).not.toBeNull();
    expect(document.querySelectorAll('[data-ui-contact-cell]').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-ui-contact-shield-panel]')).not.toBeNull();
    expect(c.statusY).toBe(c.box.y + c.box.h + 6);
  });
  it('without art the outline keeps its glass fill', () => {
    mount(contactOf('helm', false));
    expect(document.querySelector('[data-ui-contact-art]')).toBeNull();
    expect(box().querySelector('polygon')!.getAttribute('fill')).not.toBe('none');
  });
});
