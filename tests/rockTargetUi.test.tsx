// @vitest-environment jsdom
// Spike ii §6.5: the Weapons cards read TGT ROCK while a weapon has a rock target, and a right-click clears the rock
// target (rockLock −1) when one is set, else the room target as today.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView, WeaponsPanel } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { TEXT, textPx } from '../src/renderer/src/render/theme';
import { targetText, WEAPONS_HINT } from '../src/renderer/src/ui/duel/WeaponsStation';
import { STATION } from '../src/renderer/src/render/duel/consoleLayout';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const charge = { label: 'CHARGE', value: 'READY', labelTint: TEXT, valueTint: TEXT, bar: { fill: 1, colour: TEXT } };
function mount(over: Partial<WeaponsPanel>) {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), rockLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
  ui.actions.setConsole(input);
  const console: ConsoleView = {
    station: 'weapons', tabs: { helm: 'open', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, science: null, ship: 'stand' },
    helm: null, science: null, side: null,
    weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, torpedoInRange: true, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null, laserTarget: 1, torpTarget: -1, burst: 2, ...over }
  };
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  const view: DuelUiView = { readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console, contact: null };
  act(() => duel.frame(view));
  return { input };
}
const card = (w: 'laser' | 'torpedo') => (document.querySelector(`[data-testid="console-card-${w}"]`) as HTMLElement).firstElementChild as HTMLElement;
const texts = () => Array.from(document.querySelectorAll('canvas')).map((e) => (e as HTMLElement).dataset.text);

describe('the Weapons cards with rock targets (spec §6.5)', () => {
  it('read TGT ROCK for the laser\'s rock and for the torpedo\'s (next or flying)', () => {
    expect([targetText(1), targetText(1, true), targetText(-1)]).toEqual(['TGT SHLD', 'TGT ROCK', 'TGT --']);
    mount({ laserRock: true, torpRockFlying: true });
    expect(texts().filter((t) => t === 'TGT ROCK')).toHaveLength(2);
  });
  it('a right-click clears the rock target when set, else the room target as today', () => {
    const a = mount({ laserRock: true, torpRock: true });
    fireEvent.pointerDown(card('laser'), { button: 2 }); fireEvent.pointerDown(card('torpedo'), { button: 2 });
    expect(a.input.rockLock.mock.calls).toEqual([['laser', -1], ['torpedo', -1]]);
    expect([a.input.lock.mock.calls.length, a.input.torpLock.mock.calls.length]).toEqual([0, 0]);
    cleanup();
    const b = mount({ torpRockFlying: true });   // a flying torpedo's rock is not the next shot's: the card clears the room
    fireEvent.pointerDown(card('laser'), { button: 2 }); fireEvent.pointerDown(card('torpedo'), { button: 2 });
    expect(b.input.rockLock).not.toHaveBeenCalled();
    expect([b.input.lock.mock.calls, b.input.torpLock.mock.calls]).toEqual([[[-1]], [[-1]]]);
  });
  it('shows the ROCKS tally (spec §7 item 9)', () => {
    mount({ rocks: 3 });
    expect(texts()).toContain('ROCKS 3');
  });
  it('the hint names rocks too, and fits its row left of the ROCKS tally', () => {
    mount({ laserReason: 'NO TARGET', rocks: 99 });
    expect(WEAPONS_HINT).toBe('CLICK A WEAPON, THEN A ROOM OR ROCK');
    expect(texts()).toContain(WEAPONS_HINT);
    const x0 = STATION.x + 8, right = STATION.x + STATION.w - 8;
    expect(x0 + textPx(WEAPONS_HINT, 1) + 8).toBeLessThanOrEqual(right - textPx('ROCKS 99', 1));
  });
});
