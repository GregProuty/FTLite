// @vitest-environment jsdom
// Duel polish i spec §E, Engineering spike §6: the ship HUD in the amber CRT ramp. The hull and the shields with their
// layer cap, the five power columns (slots on, empty or lost, the overdrive slot marked), the heat bars and coolant
// pips, the reactor's spare bars; a left click on a column adds a bar, a right click removes one, a pip click cycles
// the coolant, all through actions.ship to the console slot.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { HUD, type PowerColumn, type ShipHudView } from '../src/renderer/src/render/duel/shipHudModel';
import { TEXT } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => ({ text: c.dataset.text!, x: Number(c.dataset.x), y: Number(c.dataset.y) }));
const all = (attr: string, v?: string) => Array.from(document.querySelectorAll<HTMLElement>(v === undefined ? `[${attr}]` : `[${attr}="${v}"]`));
const shipConsole: ConsoleView = { station: 'ship', tabs: { helm: 'open', weapons: 'locked', science: 'locked', ship: 'current' }, tabActions: { helm: 'interact', weapons: null, science: null, ship: null }, helm: null, weapons: null, science: null, side: null };
const col = (system: number, name: string, bars: number, capacity: number, slots: number, max: number, extra: Partial<PowerColumn> = {}): PowerColumn =>
  ({ system, name, bars, capacity, slots, max, heat: 0, heatMax: 240, coolant: 0, cools: system < 4, failed: false, overdriven: false, ...extra });
const hud: ShipHudView = {
  hull: { segments: 20, lit: 7, tone: 'warn' },
  shields: { layers: 2, up: 1, cap: 1 },
  power: {
    systems: [col(0, 'SHLD', 2, 5, 5, 4), col(1, 'WEAP', 2, 5, 10, 9), col(2, 'ENG', 5, 5, 5, 4, { overdriven: true, heat: 120, coolant: 1 }),
      col(3, 'SENS', 0, 0, 4, 3, { failed: true, heat: 240 }), col(4, 'O2', 1, 2, 2, 2)],
    spare: 0, reactor: 10, coolantFree: 7, coolantPool: 8
  }
};
const view = (h: ShipHudView | null = hud): DuelUiView => ({
  readout: { rows: [{ label: 'CREW', value: '2', labelTint: TEXT, valueTint: TEXT }], help: [] }, end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: false, console: shipConsole, hud: h });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store), ship = vi.fn();
  ui.actions.setConsole({ press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn(), ship });
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { ...ui, duel, ship };
}

describe('the engineering panel (spec §6)', () => {
  it('draws the hull, the shields by the cap, and each column\'s slots, overdrive slot, heat and pips, in a CRT panel', () => {
    const { duel } = mount(); act(() => duel.frame(view()));
    expect(all('data-ui-hud-crt')).toHaveLength(1);
    expect(all('data-ui-hud-seg')).toHaveLength(20);
    expect(all('data-ui-hud-seg', 'lit')).toHaveLength(7);
    expect(all('data-ui-hud-shield').map((e) => e.getAttribute('data-ui-hud-shield'))).toEqual(['up', 'unpowered']);
    const slots = (s: number) => all('data-ui-hud-slot').filter((e) => e.getAttribute('data-ui-hud-sys') === String(s));
    expect(slots(0).map((e) => e.getAttribute('data-ui-hud-slot'))).toEqual(['on', 'on', 'empty', 'empty', 'empty']);
    expect(slots(1).map((e) => e.getAttribute('data-ui-hud-slot'))).toEqual(['on', 'on', 'empty', 'empty', 'empty', 'lost', 'lost', 'lost', 'lost', 'lost']);   // 10 slots, damage 1
    expect(slots(2).map((e) => e.getAttribute('data-ui-hud-slot'))).toEqual(['on', 'on', 'on', 'on', 'on']);
    expect(slots(3).map((e) => e.getAttribute('data-ui-hud-slot'))).toEqual(['lost', 'lost', 'lost', 'lost']);
    expect(slots(4).map((e) => e.getAttribute('data-ui-hud-slot'))).toEqual(['on', 'empty']);
    expect([0, 1, 2, 3, 4].map((s) => slots(s).findIndex((e) => e.hasAttribute('data-ui-hud-od')))).toEqual([4, 9, 4, 3, -1]);
    expect(all('data-ui-hud-heat').map((e) => [e.getAttribute('data-ui-hud-heat'), e.getAttribute('data-ui-hud-hot')]))
      .toEqual([['0', 'idle'], ['0', 'idle'], ['120', 'overdriven'], ['240', 'failed']]);   // no heat bar on O2
    expect(all('data-ui-hud-pip').map((e) => e.getAttribute('data-ui-hud-pip'))).toEqual([
      '0:0:off', '0:1:off', '1:0:off', '1:1:off', '2:0:on', '2:1:off', '3:0:off', '3:1:off'
    ]);
    expect(all('data-ui-hud-reactor')).toHaveLength(10);
    expect(all('data-ui-hud-reactor', 'spare')).toHaveLength(0);
    expect(texts().filter((c) => c.y === HUD.power.bottom - HUD.power.nameH).map((c) => c.text)).toEqual(['SHLD', 'WEAP', 'ENG', 'SENS', 'O2', 'PWR']);
    expect(texts().some((c) => c.text === 'REACTOR 0/10   COOLANT 7/8')).toBe(true);
  });
  it('a left click adds a bar, a right click removes one, a pip click cycles coolant; O2 has no coolant control', () => {
    const { duel, ship } = mount(); act(() => duel.frame(view()));
    fireEvent.pointerDown(screen.getByTestId('hud-power-1'), { button: 0 });
    fireEvent.pointerDown(screen.getByTestId('hud-power-3'), { button: 2 });
    fireEvent.pointerDown(screen.getByTestId('hud-coolant-2'), { button: 0 });
    fireEvent.pointerDown(screen.getByTestId('hud-power-4'), { button: 1 });   // the middle button does nothing
    expect(ship.mock.calls.map((c) => c[0])).toEqual([{ kind: 'shipPower', system: 1, delta: 1 }, { kind: 'shipPower', system: 3, delta: -1 }, { kind: 'shipCoolant', system: 2 }]);
    expect(screen.queryByTestId('hud-coolant-4')).toBeNull();
    expect([0, 1, 2, 3, 4].every((s) => screen.getByTestId(`hud-power-${s}`).style.pointerEvents === 'auto')).toBe(true);
  });
  it('drawn whenever the frame carries a HUD, never without one; an equal HUD keeps the stored view', () => {
    const { duel, store } = mount();
    act(() => duel.frame(view(null))); expect(all('data-ui-hud-crt')).toHaveLength(0);
    act(() => duel.frame(view())); expect(all('data-ui-hud-crt')).toHaveLength(1);
    const before = store.getState().duel!.hud;
    act(() => duel.frame(view(JSON.parse(JSON.stringify(hud)) as ShipHudView)));
    expect(store.getState().duel!.hud).toBe(before);
  });
});
