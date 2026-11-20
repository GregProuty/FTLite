// @vitest-environment jsdom
// Engineering spike §10.2: the Helm's notches above the cap locked. UI round §2.4: no console power strip; on a console
// view the ship HUD's power columns draw instead.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import type { ShipHudView } from '../src/renderer/src/render/duel/shipHudModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { TEXT } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const all = (attr: string, v?: string) => Array.from(document.querySelectorAll<HTMLElement>(v === undefined ? `[${attr}]` : `[${attr}="${v}"]`));
const helm: ConsoleView = { station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  helm: { heading: 0, speed: 0, held: NO_HELD_FLAGS, throttle: 2, cap: 2 }, weapons: null, science: null };
const view = (console: ConsoleView): DuelUiView => ({ end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store), throttle = vi.fn();
  ui.actions.setConsole({ press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle, frequency: vi.fn() });
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { duel, throttle };
}

describe('the console\'s power (spec §10.2; UI round §2.4)', () => {
  it('the Helm: notches above the cap locked', () => {
    const { duel, throttle } = mount(); act(() => duel.frame(view(helm)));
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
  it('on a console view the HUD\'s power columns render (UI round §2.4: the HUD on every view); no power strip', () => {
    const { duel } = mount();
    const col = (system: number, name: string, slots: number) => ({ system, name, bars: 1, capacity: slots, slots, max: slots, heat: 0, heatMax: 240, coolant: 0, cools: system < 4, failed: false, overdriven: false, room: null });
    const hud: ShipHudView = { hull: { segments: 20, lit: 20, tone: 'good' }, shields: { layers: 2, up: 2, cap: 2 },
      power: { systems: [col(0, 'SHLD', 5), col(1, 'WEAP', 10), col(2, 'ENG', 5), col(3, 'SENS', 4), col(4, 'O2', 2)], spare: 1, reactor: 10, coolantFree: 8, coolantPool: 8 }, health: null };
    act(() => duel.frame({ ...view({ ...helm, station: 'weapons', helm: null }), hud }));
    expect(all('data-ui-hud-slot').length).toBeGreaterThan(0);
    expect(all('data-ui-hud-slot').filter((e) => e.getAttribute('data-ui-hud-sys') === '1')).toHaveLength(10);
    expect(all('data-ui-strip')).toHaveLength(0);
  });
});
