// @vitest-environment jsdom
// Playtest2feedback (spec 2026-11-18-playtest2feedback-design §6): the crew Helm's console: the model's readings, the
// throttle bar −25..100 with its Engines cap and locked part, the Engines bars and cap (owner 2026-11-19: no HELM POWER
// cells, no PRESSURE gauge and no NO PRESSURE), PORT and STBD holding ← and → (Q and E's thrusters); the Valkyrn keeps its notches.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { consoleModel, type ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { STATION, stationTop } from '../src/renderer/src/render/duel/consoleLayout';
import { PANEL_BORDER_W, textPx } from '../src/renderer/src/render/theme';
import { DuelSystem } from '../src/renderer/src/sim/duel/power';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const btn = (name: string) => document.querySelector(`[data-testid="console-${name}"]`) as HTMLElement | null;
const attr = (name: string) => (document.querySelector(`[${name}]`) as HTMLElement | null)?.getAttribute(name) ?? null;
const crew = { thrMille: 300, cap: 750, floor: -500, bars: 3, gas: 720, gasMax: 720, gasLow: false, venting: false };
const helmView = (over: Partial<NonNullable<ConsoleView['helm']>> = {}): ConsoleView => ({
  station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 0, crew, ...over }, weapons: null, science: null });
const view = (console: ConsoleView): DuelUiView => ({ end: null, banners: { interior: null, tactical: null, notice: null, alert: null }, overlay: null, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
  ui.actions.setConsole(input);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { duel, input };
}

describe('the console model (spec §5, §6)', () => {
  it('gives the crew Helm its readings: the shown thrMille, the cap and floor from the Engines bars, the bars, and the gas charge with its low and venting flags (helm round 2 §6.1)', () => {
    const d = createSeatedDuel(CUTTER, 5), v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      const m = consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, thrMille: 120 });
      expect(m?.helm?.crew).toEqual({ thrMille: 120, cap: 750, floor: -500, bars: 3, gas: 720, gasMax: 720, gasLow: false, venting: false });   // helm round 2 §6.1
      d.gas = 4;
      expect(consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, vent: { x: 1, y: 0 } })?.helm?.crew).toMatchObject({ gas: 4, gasLow: true, venting: true });
      d.gas = 720;
      d.tactical.systems[0].bars[DuelSystem.Engines] = 1;
      expect(consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })?.helm?.crew).toMatchObject({ thrMille: 0, cap: 250, floor: -500, bars: 1 });
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
  it('PORT and STBD hold the side thrusters (← and →, owner 2026-11-19: A and D turn)', () => {
    const { duel, input } = mount();
    act(() => duel.frame(view(helmView())));
    fireEvent.pointerDown(btn('rcs-port')!, { button: 0 }); fireEvent.pointerUp(btn('rcs-port')!);
    fireEvent.pointerDown(btn('rcs-stbd')!, { button: 0 });
    expect(input.hold.mock.calls).toEqual([['ArrowLeft', true], ['ArrowLeft', false], ['ArrowRight', true]]);
  });
  it('a Helm panel without `crew` (the Valkyrn\'s Flight seat) keeps the notches', () => {
    const { duel } = mount();
    act(() => duel.frame(view(helmView({ crew: undefined, throttle: 2 }))));
    expect(btn('throttle-100')).not.toBeNull();
    expect(attr('data-ui-thr-bar')).toBeNull();
  });
});

describe('helm round 2: the crew HelmStation (spec §6.1)', () => {
  const y0 = stationTop('helm') + 6, rx = STATION.x + 140, inner = STATION.x + STATION.w - PANEL_BORDER_W;
  const yOf = (t: string): number => Number((document.querySelector(`canvas[data-text="${t}"]`) as HTMLCanvasElement).dataset.y);
  it('the throttle bar runs from REV (−500) to 100, and THR reads the set throttle in percent', () => {
    const { duel } = mount();
    act(() => duel.frame(view(helmView({ crew: { ...crew, thrMille: -500 } }))));
    expect(texts()).toContain('THR -50%');
    expect(yOf('REV')).toBe(y0 + 18 + 150 - 4);   // REV sits at the bar's bottom
    expect(attr('data-ui-thr-bar')).toBe('-500');
    act(() => duel.frame(view(helmView({ crew: { ...crew, thrMille: 650 } }))));
    expect(texts()).toContain('THR 65%');
  });
  it('the GAS bar carries the charge; its fill is hot while venting and dim below one spend; NO GAS flashes it and takes the second hint line', () => {
    const { duel } = mount();
    act(() => duel.frame(view(helmView({ crew: { ...crew, gas: 360 } }))));
    expect([attr('data-ui-gas'), attr('data-ui-gas-fill'), attr('data-ui-gas-flash')]).toEqual(['360', 'main', '0']);
    expect(texts()).toContain('GAS');
    act(() => duel.frame(view(helmView({ crew: { ...crew, gas: 360, venting: true } }))));
    expect(attr('data-ui-gas-fill')).toBe('hot');
    act(() => duel.frame(view(helmView({ crew: { ...crew, gas: 4, gasLow: true } }))));
    expect(attr('data-ui-gas-fill')).toBe('dim');
    act(() => duel.frame(view(helmView({ crew: { ...crew, gas: 0, gasLow: true }, refused: { control: 'gas', reason: 'NO GAS', flash: true } }))));
    expect([attr('data-ui-gas'), attr('data-ui-gas-fill'), attr('data-ui-gas-flash')]).toEqual(['0', null, '1']);   // empty: no fill
    expect(texts()).toContain('NO GAS');
    expect(texts()).not.toContain('Q/E GAS  LMB STEER');
    expect(texts()).toContain('W/S THR  TAP S CUT  A/D TURN');
  });
  it('the hint lines; a refusal takes the line that names its control (throttle the first, turn the second); no AUTO-FACE button', () => {
    const { duel } = mount();
    act(() => duel.frame(view(helmView())));
    expect(texts()).toContain('W/S THR  TAP S CUT  A/D TURN'); expect(texts()).toContain('Q/E GAS  LMB STEER');
    expect(btn('auto-face')).toBeNull();
    act(() => duel.frame(view(helmView({ refused: { control: 'throttle', reason: 'ENGINES OFFLINE', flash: true } }))));
    expect(texts()).not.toContain('W/S THR  TAP S CUT  A/D TURN'); expect(texts()).toContain('Q/E GAS  LMB STEER');
    act(() => duel.frame(view(helmView({ refused: { control: 'turn', reason: 'ENGINES OFFLINE', flash: true } }))));
    expect(texts()).toContain('W/S THR  TAP S CUT  A/D TURN'); expect(texts()).not.toContain('Q/E GAS  LMB STEER');
  });
  it('the measured fits (plan Decisions 1 to 3): both hint lines and THR inside the block, THR between CAP and PORT / STBD, the GAS bar inside', () => {
    expect(textPx('W/S THR  TAP S CUT  A/D TURN', 1)).toBeLessThanOrEqual(inner - rx);   // 158 of 158 px
    expect(textPx('Q/E GAS  LMB STEER', 1)).toBeLessThanOrEqual(inner - rx);             // 104 px
    expect(Math.max(textPx('THR -50%', 1), textPx('THR 100%', 1))).toBeLessThanOrEqual(inner - rx);
    const { duel } = mount();
    act(() => duel.frame(view(helmView())));
    expect(yOf('THR 30%') + 4).toBeGreaterThanOrEqual(yOf('CAP 75%') + 8 + 14);   // THR's capitals start below CAP's (FONT_SIZE capitals: from +8, 14 px)
    expect(yOf('THR 30%') + 11).toBeLessThanOrEqual(y0 + 90);                     // and end above PORT / STBD
    expect(rx + 32 + 116).toBeLessThanOrEqual(inner);
  });
});
