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
import { CONSOLE_RESERVE, STATION, stationTop, weaponCard } from '../src/renderer/src/render/duel/consoleLayout';
import { INTERNAL_W } from '../src/shared/resolution';
import { FONT_NATIVE, TEXT, textPx } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => ({ text: c.dataset.text!, x: Number(c.dataset.x), y: Number(c.dataset.y) }));
const find = (t: string) => texts().find((c) => c.text === t);
const btn = (name: string) => document.querySelector(`[data-testid="console-${name}"]`) as HTMLElement;
const charge = { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: TEXT } };
const weaponsConsole: ConsoleView = {
  station: 'weapons', tabs: { helm: 'open', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, science: null, ship: 'stand' },
  helm: null, science: null, weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, torpedoInRange: true, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null, laserTarget: -1, torpTarget: -1, burst: 2 }
};
const helmConsole: ConsoleView = { ...weaponsConsole, station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  weapons: null, helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 2 } };
const view = (console: ConsoleView | null): DuelUiView => ({
  end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: { zoomText: 'ZOOM 0.90', scaleBar: { px: 90, units: 100 }, snapHint: false }, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
  ui.actions.setConsole(input);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { ...ui, duel, input };
}

describe('the console screen (spec §2)', () => {
  it('without a console: no tab strip (UI round §2.2: and no readout)', () => {
    const { duel } = mount(); act(() => duel.frame(view(null)));
    expect(btn('tab-helm')).toBeNull();
  });
  it('on Weapons: tabs and the station; no zoom box (UI round §2.3)', () => {
    const { duel } = mount(); act(() => duel.frame(view(weaponsConsole)));
    for (const n of ['tab-helm', 'tab-weapons', 'tab-ship', 'fire', 'card-laser', 'card-torpedo', 'launch'])
      expect([n, btn(n)]).not.toEqual([n, null]);
    for (const n of ['zoom-in', 'zoom-out', 'snap']) expect([n, btn(n)]).toEqual([n, null]);
    for (const n of ['lock-0', 'lock-1', 'lock-2']) expect([n, btn(n)]).toEqual([n, null]);   // FTL targeting spec §1: the cards replace the lock row
    expect(btn('tab-weapons').dataset.uiButton).toBe('lit');
    for (const t of ['BEAM', 'x2', 'TGT --', 'MAG 4/4', '1', '2', '3/4/5']) expect(find(t), t).toBeDefined();
    for (const n of ['steer-left', 'steer-right']) expect([n, btn(n)]).toEqual([n, null]);   // homing torpedo spec §3: no STEER
    expect(find('TORPEDO')).toBeDefined(); expect(find('STEER')).toBeUndefined(); expect(find('MISSILE')).toBeUndefined();
    expect(find('ZOOM 0.90')).toBeUndefined(); expect(find('0.90')).toBeUndefined(); expect(find('CAMERA')).toBeUndefined();
  });
  it('on the Helm: six throttle notches, the set one lit with the pointer and 25 up to it filled; the turn holds; no THRUST or REV hold', () => {
    const { duel } = mount(); act(() => duel.frame(view(helmConsole)));
    for (const n of ['throttle-100', 'throttle-75', 'throttle-50', 'throttle-25', 'throttle-stop', 'throttle-rev', 'turn-left', 'turn-right']) expect([n, btn(n)]).not.toEqual([n, null]);
    expect([btn('thrust'), btn('reverse')]).toEqual([null, null]);
    expect(['100', '75', '50', '25', 'stop', 'rev'].map((n) => btn(`throttle-${n}`).dataset.uiButton)).toEqual(['idle', 'idle', 'lit', 'idle', 'idle', 'idle']);
    expect(['100', '75', '50', '25', 'STOP', 'REV'].map((l) => document.querySelector(`[data-ui-throttle="${l}"]`)?.getAttribute('data-ui-lit'))).toEqual(['0', '0', '1', '1', '0', '0']);
    expect(texts().filter((t) => t.text === '<' && t.x === STATION.x + 8 + 78).map((t) => t.y)).toEqual([stationTop('helm') + 6 + 18 + 2 * 26 + 2]);
    expect(find('W/S  THROTTLE')).toBeDefined();
    expect(btn('tab-weapons').dataset.uiButton).toBe('disabled');
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
  it('the console\'s C: SNAP BACK shows only while overlay.snapHint (UI round §2.3), left of the scale bar', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weaponsConsole)));
    expect(find('C: SNAP BACK')).toBeUndefined();
    act(() => duel.frame({ ...view(weaponsConsole), overlay: { zoomText: 'ZOOM 0.90', scaleBar: { px: 90, units: 100 }, snapHint: true } }));
    const hint = find('C: SNAP BACK')!, units = find('100 u')!;
    expect(hint).toBeDefined(); expect(hint.x).toBeLessThan(units.x);
    expect(find('ZOOM 0.90')).toBeUndefined();
  });
});

describe('the Weapons block layout', () => {
  it('FTL targeting spec §1: the two cards sit side by side inside the block; the charge value and its bar stay inside the laser card', () => {
    const { duel } = mount();
    act(() => duel.frame(view({ ...weaponsConsole, weapons: { ...weaponsConsole.weapons!, charge: { ...charge, value: 'FROZEN' } } })));
    const L = weaponCard('laser'), T = weaponCard('torpedo');
    expect(L.x).toBeGreaterThanOrEqual(STATION.x + 8); expect(T.x + T.w).toBeLessThanOrEqual(STATION.x + STATION.w - 8); expect(L.x + L.w).toBeLessThan(T.x);
    const v = find('FROZEN')!;
    expect(v.x + textPx('FROZEN')).toBeLessThanOrEqual(L.x + L.w);
    expect(L.y + L.h).toBeLessThanOrEqual(stationTop('weapons') + STATION.h.weapons);
  });
  it('each card names its target room: TGT and the room, or TGT -- with none', () => {
    const { duel } = mount();
    act(() => duel.frame(view({ ...weaponsConsole, weapons: { ...weaponsConsole.weapons!, laserTarget: 1, torpTarget: 2 } })));
    expect(find('TGT SHLD')).toMatchObject({ x: weaponCard('laser').x + 6 });
    expect(find('TGT ENG')).toMatchObject({ x: weaponCard('torpedo').x + 6 });
  });
  it('the online notice centres on the console map span, not the old play centre', () => {
    const { duel } = mount();
    act(() => duel.frame({ ...view(weaponsConsole), banners: { interior: null, tactical: null, notice: 'YOU: WEAPONS' } }));
    expect(find('YOU: WEAPONS')!.x).toBe((CONSOLE_RESERVE.left + INTERNAL_W - CONSOLE_RESERVE.right) / 2);   // 766 (UI round §2.4a)
  });
  it('FLYING ends before the LAUNCH button starts', () => {
    const { duel } = mount();
    act(() => duel.frame(view({ ...weaponsConsole, weapons: { ...weaponsConsole.weapons!, missileFlying: true } })));
    const f = find('FLYING')!, T = weaponCard('torpedo');
    expect(f).toBeDefined();
    expect(f.x + textPx('FLYING', FONT_NATIVE / 16)).toBeLessThan(T.x + T.w);
  });
  it('the torpedo range state sits next to MAG (weapons update spec §2): IN RANGE, or OUT OF RANGE with LAUNCH greyed, ending before LAUNCH', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weaponsConsole)));
    expect(find('IN RANGE')).toBeDefined(); expect(find('OUT OF RANGE')).toBeUndefined();
    act(() => duel.frame(view({ ...weaponsConsole, weapons: { ...weaponsConsole.weapons!, torpedoInRange: false, canLaunch: false } })));
    const o = find('OUT OF RANGE')!;
    expect(o).toBeDefined(); expect(find('IN RANGE')).toBeUndefined();
    expect(o.x).toBe(weaponCard('torpedo').x + 6);   // under MAG, inside the torpedo card (FTL targeting spec §1)
    expect(o.x + textPx('OUT OF RANGE', FONT_NATIVE / 16)).toBeLessThan(weaponCard('torpedo').x + weaponCard('torpedo').w);
    expect(btn('launch').dataset.uiButton).toBe('disabled');
    act(() => duel.frame(view({ ...weaponsConsole, weapons: { ...weaponsConsole.weapons!, missileFlying: true } })));
    expect(find('FLYING')).toBeDefined(); expect(find('IN RANGE')).toBeUndefined();
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
  it('FIRE presses Space once (FTL targeting spec §2); LAUNCH presses F; tabs press their action', () => {
    const { duel, input } = mount(); act(() => duel.frame(view(weaponsConsole)));
    fireEvent.pointerDown(btn('fire'), { button: 0 }); fireEvent.pointerUp(btn('fire'));
    expect(input.press).toHaveBeenCalledWith('fireDown'); expect(input.hold).not.toHaveBeenCalled();
    fireEvent.pointerDown(btn('launch'), { button: 0 }); expect(input.press).toHaveBeenCalledWith('launch');
    fireEvent.pointerDown(btn('tab-helm'), { button: 0 }); expect(input.press).toHaveBeenCalledWith('switch');
    fireEvent.pointerDown(btn('tab-ship'), { button: 0 }); expect(input.press).toHaveBeenCalledWith('stand');
  });
  it('a locked tab does nothing; a LAUNCH that cannot launch still presses, so it can say why (Feel-ii §2.8)', () => {
    const { duel, input } = mount();
    act(() => duel.frame(view({ ...weaponsConsole, tabs: { ...weaponsConsole.tabs, helm: 'locked' }, tabActions: { ...weaponsConsole.tabActions, helm: null },
      weapons: { ...weaponsConsole.weapons!, canLaunch: false } })));
    fireEvent.pointerDown(btn('tab-helm'), { button: 0 });
    expect(input.press).not.toHaveBeenCalled();
    expect(btn('launch').getAttribute('data-ui-button')).toBe('disabled');   // it still looks unready
    fireEvent.pointerDown(btn('launch'), { button: 0 });
    expect(input.press).toHaveBeenCalledWith('launch');
  });
  it('the console going away releases a held button', () => {
    const { duel, input } = mount(); act(() => duel.frame(view(helmConsole)));
    fireEvent.pointerDown(btn('turn-left'), { button: 0 });
    act(() => duel.frame(view(null)));
    expect(input.hold.mock.calls).toEqual([['KeyA', true], ['KeyA', false]]);
  });
  it('with no console input set, clicks are no-ops', () => {
    const { duel, actions } = mount(); actions.setConsole(null); act(() => duel.frame(view(weaponsConsole)));
    expect(() => fireEvent.pointerDown(btn('launch'), { button: 0 })).not.toThrow();
  });
});
