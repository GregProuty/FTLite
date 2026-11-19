// @vitest-environment jsdom
// Feel-ii (spec 2026-11-18-feel-ii-design §1.1, §1.4, §2.8, §3.9): the console pieces React draws. A refused control
// flashes and names its reason under it, the Helm shows the held heading, the wheel over the throttle steps it, and the
// sit-down card moves below the online notice.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { TEXT } from '../src/renderer/src/render/theme';
import { sitCard } from '../src/renderer/src/render/duel/sitModel';
import { SIT_CARD_TOP_Y, SIT_CARD_UNDER_Y } from '../src/renderer/src/ui/duel/SitCard';
import { THROTTLE_WHEEL_PX } from '../src/renderer/src/ui/duel/HelmStation';
import { WHEEL_NOTCH_PX } from '../src/renderer/src/app/duel/input';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const btn = (name: string) => document.querySelector(`[data-testid="console-${name}"]`) as HTMLElement;
const charge = { label: 'CHARGE', value: 'READY', labelTint: TEXT, valueTint: TEXT, bar: { fill: 1, colour: TEXT } };
const weapons = (over: Partial<NonNullable<ConsoleView['weapons']>>): ConsoleView => ({
  station: 'weapons', tabs: { helm: 'open', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, science: null, ship: 'stand' },
  helm: null, science: null, side: { zoom: '0.90', free: false, snapLabel: 'CAMERA' },
  weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, torpedoInRange: true, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null, laserTarget: 1, torpTarget: -1, burst: 2, ...over }
});
const helm = (over: Partial<NonNullable<ConsoleView['helm']>> = {}): ConsoleView => ({ ...weapons({}), station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, weapons: null,
  helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 2, ...over }, side: { zoom: '0.90', free: true, snapLabel: 'SNAP' } });
const view = (console: ConsoleView, extra: Partial<DuelUiView> = {}): DuelUiView => ({ readout: { rows: [], help: [] }, end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console, ...extra });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
  ui.actions.setConsole(input);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { ...ui, duel, input };
}

describe('never a dead click (Feel-ii §2.8)', () => {
  it('a refused LAUNCH flashes and the row under the cards says why; then the laser\'s words come back', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ canLaunch: false, laserReason: 'OUT OF ARC: HELM TURN RIGHT', refused: { control: 'launch', reason: 'OUT OF RANGE', flash: true } }))));
    expect(btn('launch').getAttribute('data-ui-refused')).toBe('1');
    expect(texts()).toContain('LAUNCH: OUT OF RANGE');
    expect(texts()).not.toContain('BEAM: OUT OF ARC: HELM TURN RIGHT');
    act(() => duel.frame(view(weapons({ canLaunch: false, laserReason: 'OUT OF ARC: HELM TURN RIGHT', refused: { control: 'launch', reason: 'OUT OF RANGE', flash: false } }))));
    expect(btn('launch').getAttribute('data-ui-refused')).toBeNull();
    expect(texts()).toContain('LAUNCH: OUT OF RANGE');
    act(() => duel.frame(view(weapons({ laserReason: 'OUT OF ARC: HELM TURN RIGHT' }))));
    expect(texts()).toContain('BEAM: OUT OF ARC: HELM TURN RIGHT');
  });
  it('a refused FIRE says TORPEDO FLYING; the Helm\'s turn says ENGINES OFFLINE under the turn buttons', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ refused: { control: 'fire', reason: 'TORPEDO FLYING', flash: true } }))));
    expect(btn('fire').getAttribute('data-ui-refused')).toBe('1');
    expect(texts()).toContain('FIRE: TORPEDO FLYING');
    act(() => duel.frame(view(helm({ refused: { control: 'turn', reason: 'ENGINES OFFLINE', flash: true } }))));
    expect([btn('turn-left').getAttribute('data-ui-refused'), btn('turn-right').getAttribute('data-ui-refused'), btn('auto-face').getAttribute('data-ui-refused')]).toEqual(['1', '1', null]);
    expect(texts()).toContain('ENGINES OFFLINE');
    expect(texts()).not.toContain('HOLD TO TURN');
    expect(texts()).toContain('HOLD: NOSE ON ENEMY');
  });
});

describe('the Helm block (Feel-ii §1.1, §1.4)', () => {
  it('shows the held heading beside the heading, and the right-click hint', () => {
    const { duel } = mount();
    act(() => duel.frame(view(helm({ holdHeading: 64 }))));
    expect(texts()).toContain('HDG 055 TO 090');
    expect(texts()).toContain('R-CLICK MAP: HEADING');
    act(() => duel.frame(view(helm({ holdHeading: -1 }))));
    expect(texts()).toContain('HDG 055');
  });
  it('the wheel over the throttle (its notch buttons too) steps a preset a notch (up is more), clamped to REV..100', () => {
    const { duel, input } = mount();
    expect(THROTTLE_WHEEL_PX).toBe(WHEEL_NOTCH_PX);
    act(() => duel.frame(view(helm({ throttle: 2 }))));
    const wheel = btn('throttle-50');   // a notch button, not the backing box: the wheel works over the notches
    expect(wheel).not.toBeNull();
    fireEvent.wheel(wheel, { deltaY: -100, deltaMode: 0 });
    fireEvent.wheel(wheel, { deltaY: 60, deltaMode: 0 });
    expect(input.throttle.mock.calls).toEqual([[3]]);
    fireEvent.wheel(wheel, { deltaY: 40, deltaMode: 0 });   // 100 down in all: one notch less
    expect(input.throttle.mock.calls).toEqual([[3], [1]]);
    act(() => duel.frame(view(helm({ throttle: 4 }))));
    fireEvent.wheel(wheel, { deltaY: -300, deltaMode: 0 });
    expect(input.throttle.mock.calls.at(-1)).toEqual([4]);
  });
});

describe('the sit-down card under the online notice (Feel-ii §3.9)', () => {
  it('a top card moves below YOU: HELM while it shows; a bottom card stays', () => {
    const { duel } = mount();
    const y = () => Number((document.querySelector('[data-ui-sit-card]') as HTMLElement).dataset.uiSitY);
    act(() => duel.frame(view(helm(), { sitCard: sitCard('helm', 0.5, false, true, true), banners: { interior: null, tactical: null, notice: 'YOU: HELM' } })));
    expect(y()).toBe(SIT_CARD_UNDER_Y);
    expect(SIT_CARD_UNDER_Y).toBeGreaterThanOrEqual(130 + 24);   // the notice: centred at 130, FONT_SIZE × 1.5 tall
    act(() => duel.frame(view(helm(), { sitCard: sitCard('helm', 0.5, false, true, false) })));
    expect(y()).toBe(SIT_CARD_TOP_Y);
    act(() => duel.frame(view(helm(), { sitCard: sitCard('helm', 0.5, false, false, true), banners: { interior: null, tactical: null, notice: 'YOU: HELM' } })));
    expect(y()).toBe(576);
  });
});
