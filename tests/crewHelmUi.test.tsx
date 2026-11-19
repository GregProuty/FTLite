// @vitest-environment jsdom
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §5, §6): the crew Helm's console: the model's readings, the
// throttle bar −25..100 with its ENGINE cap and locked part, the PRESSURE gauge and COMPRESSOR rate, the HELM POWER cells
// (a click switches that bar's side), PORT and STBD holding A and D, NO PRESSURE on the block; the Valkyrn keeps its notches.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { consoleModel, type ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const btn = (name: string) => document.querySelector(`[data-testid="console-${name}"]`) as HTMLElement | null;
const attr = (name: string) => (document.querySelector(`[${name}]`) as HTMLElement | null)?.getAttribute(name) ?? null;
const crew = { thrMille: 300, cap: 750, floor: -250, gas: 80, compressor: 1, bars: 4, rate: 5 };
const helmView = (over: Partial<NonNullable<ConsoleView['helm']>> = {}): ConsoleView => ({
  station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 0, crew, ...over }, weapons: null, science: null, side: { zoom: '0.90', free: true, snapLabel: 'SNAP' } });
const view = (console: ConsoleView): DuelUiView => ({ readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn(), helmPower: vi.fn() };
  ui.actions.setConsole(input);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { duel, input };
}

describe('the console model (spec §5, §6)', () => {
  it('gives the crew Helm its readings: the shown thrMille, the cap and floor from ENGINE, the tank %, the split and the rate', () => {
    const d = createSeatedDuel(CUTTER, 5), v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      d.rcsGas = 437;
      const m = consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, thrMille: 120 });
      expect(m?.helm?.crew).toEqual({ thrMille: 120, cap: 750, floor: -250, gas: 44, compressor: 1, bars: 4, rate: 5 });
      d.compressor = 3;
      expect(consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })?.helm?.crew).toMatchObject({ thrMille: 0, cap: 250, compressor: 3, rate: 15 });
      expect(consoleModel({ duel: v, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })?.helm?.crew).toBeUndefined();
    } finally { disposeDuel(d); disposeDuel(v); }
  });
});

describe('the crew HelmStation (spec §6)', () => {
  it('draws the throttle bar to the shown value with the cap line, the PRESSURE gauge and the HELM POWER strip; no notches', () => {
    const { duel } = mount();
    act(() => duel.frame(view(helmView())));
    expect([attr('data-ui-thr-bar'), attr('data-ui-thr-cap'), attr('data-ui-pressure')]).toEqual(['300', '750', '80']);
    expect(document.querySelector('[data-ui-thr-locked="cap"]')).not.toBeNull();
    for (const t of ['THROTTLE', 'REV', '0', '100', 'PRESSURE', '80%', 'HELM POWER', 'ENGINE 3 COMP 1 +5%/S']) expect(texts(), t).toContain(t);
    expect(btn('throttle-100')).toBeNull();
    expect(btn('turn-left')).toBeNull();
  });
  it('a HELM POWER cell click switches that bar to the other side; 1 and 2 are the keys (Decision 10)', () => {
    const { duel, input } = mount();
    act(() => duel.frame(view(helmView())));
    fireEvent.pointerDown(btn('power-0')!, { button: 0 });   // an ENGINE cell: to COMPRESSOR
    fireEvent.pointerDown(btn('power-3')!, { button: 0 });   // the COMPRESS cell: to ENGINE
    expect(input.helmPower.mock.calls).toEqual([[-1], [1]]);
  });
  it('PORT and STBD hold A and D; NO PRESSURE shows on the block and flashes them', () => {
    const { duel, input } = mount();
    act(() => duel.frame(view(helmView())));
    fireEvent.pointerDown(btn('rcs-port')!, { button: 0 }); fireEvent.pointerUp(btn('rcs-port')!);
    fireEvent.pointerDown(btn('rcs-stbd')!, { button: 0 });
    expect(input.hold.mock.calls).toEqual([['KeyA', true], ['KeyA', false], ['KeyD', true]]);
    act(() => duel.frame(view(helmView({ refused: { control: 'thrusters', reason: 'NO PRESSURE', flash: true } }))));
    expect(texts()).toContain('NO PRESSURE');
    expect([btn('rcs-port')!.getAttribute('data-ui-refused'), btn('rcs-stbd')!.getAttribute('data-ui-refused')]).toEqual(['1', '1']);
  });
  it('a Helm panel without `crew` (the Valkyrn\'s Flight seat) keeps the notches', () => {
    const { duel } = mount();
    act(() => duel.frame(view(helmView({ crew: undefined, throttle: 2 }))));
    expect(btn('throttle-100')).not.toBeNull();
    expect(attr('data-ui-thr-bar')).toBeNull();
  });
});
