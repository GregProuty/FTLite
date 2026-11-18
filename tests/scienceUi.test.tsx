// @vitest-environment jsdom
// Sci-1 (spec 2026-11-17-science-scans §7.2, §7.3, §7.4): the contact window's SCAN button and info lines for the
// unknown enemy, the derelict and Science with nothing selected; the Weapons frequency row; the Science block.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { contactModel, type ContactView } from '../src/renderer/src/render/duel/contactModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { createTacticalState, Loot } from '../src/renderer/src/sim/tactical/state';
import { TEXT } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const btn = (name: string) => document.querySelector(`[data-testid="console-${name}"]`) as HTMLElement | null;
const texts = () => Array.from(document.querySelectorAll('canvas')).map((e) => e.dataset.text);
const charge = { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: TEXT } };
const frame = (console: ConsoleView | null, contact: ContactView | null): DuelUiView => ({ readout: { rows: [], help: [] }, end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console, contact });
function mount(view: DuelUiView) {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const c = { close: vi.fn(), arm: vi.fn(), cancelAim: vi.fn(), pick: vi.fn(), scan: vi.fn() };
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
  ui.actions.setContact(c); ui.actions.setConsole(input);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  act(() => duel.frame(view));
  return { c, input };
}
const weapons: ConsoleView = {
  station: 'weapons', tabs: { helm: 'locked', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  helm: null, weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, torpedoInRange: true, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 1, weakFreq: 2 }, science: null,
  side: { zoom: '0.50', free: false, snapLabel: 'CAMERA' }
};

describe('the contact window (spec §7.2)', () => {
  it('an unknown enemy: UNKNOWN CONTACT, no drawing, no LASER; SCAN 1 (SLOW) calls scan', () => {
    const st = createTacticalState(4), { c } = mount(frame(null, contactModel({ state: st, contact: 0, aim: false, station: 'weapons', t: 0, weapons: { charge } })));
    expect(texts()).toContain('UNKNOWN CONTACT');
    expect(document.querySelector('[data-ui-contact-box]')).toBeNull();
    expect(btn('contact-laser')).toBeNull();
    expect(texts()).toContain('SCAN 1 (SLOW)');
    fireEvent.pointerDown(btn('contact-scan')!, { button: 0 });
    expect(c.scan).toHaveBeenCalledTimes(1);
  });
  it('the derelict at Level 1: its loot, TRAPPED, the range, the hint; fully known shows SCANNED as plain text', () => {
    const st = createTacticalState(4); st.known[1] = 1; Object.assign(st.derelict, { loot: Loot.Shield, trapped: true, salvage: 0, salvaged: false });
    const { c } = mount(frame(null, contactModel({ state: st, contact: 1, aim: false, station: 'helm', t: 0, weapons: null })));
    for (const t of ['DERELICT', 'LOOT SHIELD', 'TRAPPED', 'CLOSE TO 60, MATCH SPEED']) expect(texts(), t).toContain(t);
    expect(texts().some((t) => /^RANGE \d+$/.test(t ?? ''))).toBe(true);
    expect(btn('contact-scan')).toBeNull();   // fully known (the derelict has one level): SCANNED is plain text, not a disabled button
    expect(texts()).toContain('SCANNED');
    expect(document.querySelector('[data-testid="contact-scanned"]')).not.toBeNull();
    expect(c.scan).not.toHaveBeenCalled();
  });
  it('Science with nothing selected: the title only, no close and no SCAN button', () => {
    mount(frame(null, contactModel({ state: createTacticalState(4), contact: null, aim: false, station: 'science', t: 0, weapons: null })));
    expect(texts()).toContain('NO CONTACT SELECTED');
    expect([btn('contact-close'), btn('contact-scan')]).toEqual([null, null]);
  });
  it('the enemy at Level 2 at Weapons: the drawing, LASER, and the readings below the weapon rows', () => {
    const st = createTacticalState(4); st.known[0] = 2; st.weakFreq = 2;
    mount(frame(null, contactModel({ state: st, contact: 0, aim: false, station: 'weapons', t: 0, weapons: { charge } })));
    expect(document.querySelector('[data-ui-contact-box]')).not.toBeNull();
    expect(btn('contact-laser')).not.toBeNull();
    for (const t of ['ENEMY SHIP', 'WEAP', 'WEAK FREQ C', 'ENEMY LASER', 'TORPEDO READY', 'SCANNED']) expect(texts(), t).toContain(t);
  });
});

describe('the Weapons frequency row (spec §7.4)', () => {
  it('A B C buttons, the tuned one lit, the weak one marked; a click asks for its frequency', () => {
    const { input } = mount(frame(weapons, null));
    expect(['freq-0', 'freq-1', 'freq-2'].map((n) => btn(n)?.dataset.uiButton)).toEqual(['idle', 'lit', 'idle']);
    expect(document.querySelector('[data-ui-weak-freq]')?.getAttribute('data-ui-weak-freq')).toBe('C');
    fireEvent.pointerDown(btn('freq-0')!, { button: 0 });
    expect(input.frequency).toHaveBeenCalledWith(0);
    cleanup();
    mount(frame({ ...weapons, weapons: { ...weapons.weapons!, weakFreq: null } }, null));
    expect(document.querySelector('[data-ui-weak-freq]')).toBeNull();
  });
});

describe('the Science block (spec §7.3)', () => {
  it('shows the hover readout, a placeholder without a cursor, and the key help', () => {
    const science: ConsoleView = { ...weapons, station: 'science', weapons: null, science: { hover: 'BRG 327 RNG 1450' }, side: { zoom: '0.50', free: false, snapLabel: 'SNAP' } };
    mount(frame(science, null));
    for (const t of ['SCIENCE', 'BRG 327 RNG 1450', 'CLICK: SELECT   S: SCAN   T: NEXT']) expect(texts(), t).toContain(t);
    cleanup();
    mount(frame({ ...science, science: { hover: null } }, null));
    expect(texts()).toContain('BRG --- RNG ---');
  });
});
