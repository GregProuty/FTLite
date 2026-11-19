// @vitest-environment jsdom
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §6): the crew Helm's console: the model's readings, the
// throttle bar −25..100 with its Engines cap and locked part, the Engines bars and cap (owner 2026-11-19: no HELM POWER
// cells, no PRESSURE gauge and no NO PRESSURE), PORT and STBD holding A and D; the Valkyrn keeps its notches.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { consoleModel, type ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { DuelSystem } from '../src/renderer/src/sim/duel/power';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const btn = (name: string) => document.querySelector(`[data-testid="console-${name}"]`) as HTMLElement | null;
const attr = (name: string) => (document.querySelector(`[${name}]`) as HTMLElement | null)?.getAttribute(name) ?? null;
const crew = { thrMille: 300, cap: 750, floor: -250, bars: 3 };
const helmView = (over: Partial<NonNullable<ConsoleView['helm']>> = {}): ConsoleView => ({
  station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 0, crew, ...over }, weapons: null, science: null, side: { zoom: '0.90', free: true, snapLabel: 'SNAP' } });
const view = (console: ConsoleView): DuelUiView => ({ readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
  ui.actions.setConsole(input);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { duel, input };
}

describe('the console model (spec §5, §6)', () => {
  it('gives the crew Helm its readings: the shown thrMille, the cap and floor from the Engines bars, the tank % and the bars (owner 2026-11-19)', () => {
    const d = createSeatedDuel(CUTTER, 5), v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      const m = consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, thrMille: 120 });
      expect(m?.helm?.crew).toEqual({ thrMille: 120, cap: 750, floor: -250, bars: 3 });
      expect(m?.power?.system).toBe(DuelSystem.Engines);   // Engineering spike §9.3: the Helm's own power strip is the Engines'
      d.tactical.systems[0].bars[DuelSystem.Engines] = 1;
      expect(consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })?.helm?.crew).toMatchObject({ thrMille: 0, cap: 250, floor: -250, bars: 1 });
      d.tactical.systems[0].bars[DuelSystem.Engines] = 0;
      expect(consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })?.helm?.crew).toMatchObject({ cap: 0, floor: 0, bars: 0 });
      expect(consoleModel({ duel: v, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })?.helm?.crew).toBeUndefined();
    } finally { disposeDuel(d); disposeDuel(v); }
  });
});

describe('the crew HelmStation (spec §6)', () => {
  it('draws the throttle bar to the shown value with the cap line and the Engines bars and cap; no PRESSURE gauge, no notches', () => {
    const { duel } = mount();
    act(() => duel.frame(view(helmView())));
    expect([attr('data-ui-thr-bar'), attr('data-ui-thr-cap'), attr('data-ui-pressure')]).toEqual(['300', '750', null]);
    expect(document.querySelector('[data-ui-thr-locked="cap"]')).not.toBeNull();
    for (const t of ['THROTTLE', 'REV', '0', '100', 'ENGINES 3', 'CAP 75%']) expect(texts(), t).toContain(t);
    expect(texts()).not.toContain('PRESSURE');
    expect(btn('throttle-100')).toBeNull();
    expect(btn('turn-left')).toBeNull();
  });
  it('has no HELM POWER cells (owner 2026-11-19, replacing Decision 10); at 0 Engines bars it reads CAP 0% with no reverse', () => {
    const { duel } = mount();
    act(() => duel.frame(view(helmView())));
    expect([btn('power-0'), btn('power-3')]).toEqual([null, null]);
    expect(texts()).not.toContain('HELM POWER');
    act(() => duel.frame(view(helmView({ crew: { ...crew, cap: 0, floor: 0, bars: 0 } }))));
    expect(texts()).toContain('ENGINES 0'); expect(texts()).toContain('CAP 0%  NO REV');
  });
  it('PORT and STBD hold A and D', () => {
    const { duel, input } = mount();
    act(() => duel.frame(view(helmView())));
    fireEvent.pointerDown(btn('rcs-port')!, { button: 0 }); fireEvent.pointerUp(btn('rcs-port')!);
    fireEvent.pointerDown(btn('rcs-stbd')!, { button: 0 });
    expect(input.hold.mock.calls).toEqual([['KeyA', true], ['KeyA', false], ['KeyD', true]]);
  });
  it('a Helm panel without `crew` (the Valkyrn\'s Flight seat) keeps the notches', () => {
    const { duel } = mount();
    act(() => duel.frame(view(helmView({ crew: undefined, throttle: 2 }))));
    expect(btn('throttle-100')).not.toBeNull();
    expect(attr('data-ui-thr-bar')).toBeNull();
  });
});
