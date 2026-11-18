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
import { STATION, STATUS, stationTop } from '../src/renderer/src/render/duel/consoleLayout';
import { FONT_NATIVE, PAD, TEXT, textPx } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => ({ text: c.dataset.text!, x: Number(c.dataset.x), y: Number(c.dataset.y) }));
const find = (t: string) => texts().find((c) => c.text === t);
const btn = (name: string) => document.querySelector(`[data-testid="console-${name}"]`) as HTMLElement;
const charge = { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: TEXT } };
const weaponsConsole: ConsoleView = {
  station: 'weapons', tabs: { helm: 'open', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, science: null, ship: 'stand' },
  helm: null, science: null, weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null },
  side: { zoom: '0.90', free: false, snapLabel: 'CAMERA' }
};
const helmConsole: ConsoleView = { ...weaponsConsole, station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  weapons: null, helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 2 }, side: { zoom: '0.90', free: true, snapLabel: 'SNAP' } };
const view = (console: ConsoleView | null): DuelUiView => ({
  readout: { rows: [{ label: 'HULL', value: '10/40', labelTint: TEXT, valueTint: TEXT }], help: ['TAB  SWITCH'] }, end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: { zoomText: 'ZOOM 0.90', scaleBar: { px: 90, units: 100 }, snapHint: false }, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), throttle: vi.fn() };
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
  it('on the Helm: six throttle notches, the set one lit with the pointer and 25 up to it filled; the turn holds; no THRUST or REV hold', () => {
    const { duel } = mount(); act(() => duel.frame(view(helmConsole)));
    for (const n of ['throttle-100', 'throttle-75', 'throttle-50', 'throttle-25', 'throttle-stop', 'throttle-rev', 'turn-left', 'turn-right']) expect([n, btn(n)]).not.toEqual([n, null]);
    expect([btn('thrust'), btn('reverse')]).toEqual([null, null]);
    expect(['100', '75', '50', '25', 'stop', 'rev'].map((n) => btn(`throttle-${n}`).dataset.uiButton)).toEqual(['idle', 'idle', 'lit', 'idle', 'idle', 'idle']);
    expect(['100', '75', '50', '25', 'STOP', 'REV'].map((l) => document.querySelector(`[data-ui-throttle="${l}"]`)?.getAttribute('data-ui-lit'))).toEqual(['0', '0', '1', '1', '0', '0']);
    expect(texts().filter((t) => t.text === '<' && t.x === STATION.x + 8 + 78).map((t) => t.y)).toEqual([stationTop('helm') + 6 + 18 + 2 * 26 + 2]);
    expect(find('W/S  THROTTLE')).toBeDefined();
    expect(btn('tab-weapons').dataset.uiButton).toBe('disabled'); expect(btn('snap').dataset.uiButton).toBe('lit');
  });
  it('at REV the pointer is on REV and nothing is filled; at 100 every forward notch is', () => {
    const { duel } = mount();
    const at = (throttle: number) => view({ ...helmConsole, helm: { ...helmConsole.helm!, throttle } });
    const filled = () => ['100', '75', '50', '25', 'STOP', 'REV'].map((l) => document.querySelector(`[data-ui-throttle="${l}"]`)?.getAttribute('data-ui-lit'));
    act(() => duel.frame(at(-1)));
    expect(filled()).toEqual(['0', '0', '0', '0', '0', '0']); expect(btn('throttle-rev').dataset.uiButton).toBe('lit');
    act(() => duel.frame(at(4)));
    expect(filled()).toEqual(['1', '1', '1', '1', '0', '0']); expect(btn('throttle-100').dataset.uiButton).toBe('lit');
  });
});

describe('the Weapons block layout', () => {
  it('the charge bar ends before the right-anchored HOLD value starts, at the longest value too', () => {
    const { duel } = mount();
    const withValue = (value: string) => view({ ...weaponsConsole, weapons: { ...weaponsConsole.weapons!, charge: { ...charge, value } } });
    act(() => duel.frame(withValue('HOLD 1.5')));
    const v = find('HOLD 1.5')!, barRight = STATION.x + 8 + 84 + 96;
    expect(barRight).toBeLessThan(v.x - textPx('HOLD 1.5'));
    expect(barRight + 4).toBeLessThanOrEqual(v.x - textPx('HOLD 9.9'));
  });
  it('the online notice centres on the console map span, not the old play centre', () => {
    const { duel } = mount();
    act(() => duel.frame({ ...view(weaponsConsole), banners: { interior: null, tactical: null, notice: 'YOU: WEAPONS' } }));
    expect(find('YOU: WEAPONS')!.x).toBe(676);
  });
  it('FLYING ends before the LAUNCH button starts', () => {
    const { duel } = mount();
    act(() => duel.frame(view({ ...weaponsConsole, weapons: { ...weaponsConsole.weapons!, missileFlying: true } })));
    const f = find('FLYING')!;
    expect(f).toBeDefined();
    expect(f.x + textPx('FLYING', FONT_NATIVE / 16)).toBeLessThan(STATION.x + STATION.w - 8 - 120);
  });
});

describe('clicks reach the keyboard (spec §6.2)', () => {
  it('a throttle notch asks for its level on the primary button only; the turn buttons hold A and D', () => {
    const { duel, input } = mount(); act(() => duel.frame(view(helmConsole)));
    for (const n of ['100', '75', '50', '25', 'stop', 'rev']) fireEvent.pointerDown(btn(`throttle-${n}`), { button: 0 });
    expect(input.throttle.mock.calls).toEqual([[4], [3], [2], [1], [0], [-1]]);
    fireEvent.pointerDown(btn('throttle-50'), { button: 2 });
    expect(input.throttle).toHaveBeenCalledTimes(6);
    fireEvent.pointerDown(btn('turn-left'), { button: 0 }); fireEvent.pointerUp(btn('turn-left'));
    expect(input.hold.mock.calls).toEqual([['KeyA', true], ['KeyA', false]]);
  });
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
