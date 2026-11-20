// @vitest-environment jsdom
// Engineering spike §9.3, §10.2, §10.4: the console power strip in the CRT ramp, the Helm's notches above the cap
// locked, and the Science strip's sensor range.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import type { ConsolePowerStrip } from '../src/renderer/src/render/duel/shipHudModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { TEXT } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const all = (attr: string, v?: string) => Array.from(document.querySelectorAll<HTMLElement>(v === undefined ? `[${attr}]` : `[${attr}="${v}"]`));
const strip = (over: Partial<ConsolePowerStrip> = {}): ConsolePowerStrip => ({ system: 2, name: 'ENG', bars: 2, capacity: 2, slots: 5, max: 4, lost: 3, heat: 60, heatMax: 240, failed: false, overdriven: false, spare: 1, ...over });
const helm: ConsoleView = { station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  helm: { heading: 0, speed: 0, held: NO_HELD_FLAGS, throttle: 2, cap: 2 }, weapons: null, science: null, side: null, power: strip() };
const view = (console: ConsoleView): DuelUiView => ({ end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store), throttle = vi.fn();
  ui.actions.setConsole({ press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle, frequency: vi.fn() });
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { duel, throttle };
}

describe('the console power strip (spec §9.3)', () => {
  it('the Helm: ENG slots on and lost, the dashed overdrive slot, the heat, the spare; notches above the cap locked', () => {
    const { duel, throttle } = mount(); act(() => duel.frame(view(helm)));
    expect(all('data-ui-strip')).toHaveLength(1);
    expect(all('data-ui-strip-slot').map((e) => e.getAttribute('data-ui-strip-slot'))).toEqual(['on', 'on', 'lost', 'lost', 'lost']);
    expect(all('data-ui-strip-slot').findIndex((e) => e.hasAttribute('data-ui-strip-od'))).toBe(4);
    expect(all('data-ui-strip-heat')[0]!.getAttribute('data-ui-strip-heat')).toBe('60');
    expect(texts()).toContain('SPARE 1');
    expect(screen.getByTestId('console-throttle-100').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('console-throttle-75').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('console-throttle-50').getAttribute('aria-disabled')).toBeNull();
    fireEvent.pointerDown(screen.getByTestId('console-throttle-100'), { button: 0 });
    fireEvent.pointerDown(screen.getByTestId('console-throttle-25'), { button: 0 });
    expect(throttle.mock.calls).toEqual([[1]]);
  });
  it('at a cap of 0 even REV is locked', () => {
    const { duel } = mount(); act(() => duel.frame(view({ ...helm, helm: { ...helm.helm!, throttle: 0, cap: 0 } })));
    expect(screen.getByTestId('console-throttle-rev').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('console-throttle-stop').getAttribute('aria-disabled')).toBeNull();
  });
  it('the Science strip names the sensor range; the Weapons strip draws all ten slots', () => {
    const { duel } = mount();
    act(() => duel.frame(view({ ...helm, station: 'science', helm: null, science: { hover: null }, power: strip({ system: 3, name: 'SENS', bars: 1, capacity: 4, slots: 4, max: 3, lost: 0, range: 900 }) })));
    expect(all('data-ui-strip-range', '900')).toHaveLength(1);
    expect(texts()).toContain('RANGE 900');
    act(() => duel.frame(view({ ...helm, station: 'weapons', helm: null, power: strip({ system: 1, name: 'WEAP', bars: 2, capacity: 10, slots: 10, max: 9, lost: 0 }) })));
    expect(all('data-ui-strip-slot')).toHaveLength(10);
  });
});
