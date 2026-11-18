// @vitest-environment jsdom
// Feel-i (spec 2026-11-17-console-feel-design §1 to §4): the console pieces React draws. The LASER card's why-not and its
// FIRING flash and goal glow, the Helm's AUTO-FACE hold, the sit-down card, and the Settings screen shake select.
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
const helm: ConsoleView = { ...weapons({}), station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, weapons: null,
  helm: { heading: 55, speed: 142, held: NO_HELD_FLAGS, throttle: 2 }, side: { zoom: '0.90', free: true, snapLabel: 'SNAP' } };
const view = (console: ConsoleView, extra: Partial<DuelUiView> = {}): DuelUiView => ({ readout: { rows: [], help: [] }, end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console, ...extra });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  const input = { press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
  ui.actions.setConsole(input);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { ...ui, duel, input };
}

describe('the Weapons LASER card (spec §3)', () => {
  it('says why not in words under the cards', () => {
    const { duel } = mount(); act(() => duel.frame(view(weapons({ laserReason: 'OUT OF ARC: HELM TURN RIGHT' }))));
    expect(texts()).toContain('LASER: OUT OF ARC: HELM TURN RIGHT');
    expect(texts()).toContain('READY');
  });
  it('flashes FIRING while the shot is lined up, and glows (the goal) while it has no target', () => {
    const { duel } = mount(); act(() => duel.frame(view(weapons({ laserReason: 'FIRING' }))));
    expect(texts()).toContain('FIRING'); expect(texts()).toContain('LASER: FIRING');
    expect(document.querySelector('[data-ui-card-firing]')).not.toBeNull();
    act(() => duel.frame(view(weapons({ laserReason: null, laserTarget: -1, goal: true }))));
    expect(document.querySelector('[data-ui-card-goal]')).not.toBeNull();
    expect(texts()).toContain('CLICK A WEAPON, THEN A ROOM');
  });
});

describe('the Helm AUTO-FACE button (spec §2)', () => {
  it('holds Space while pressed and lights with it', () => {
    const { duel, input } = mount(); act(() => duel.frame(view(helm)));
    fireEvent.pointerDown(btn('auto-face'), { button: 0 });
    expect(input.hold).toHaveBeenCalledWith('Space', true);
    act(() => duel.frame(view({ ...helm, helm: { ...helm.helm!, held: { ...NO_HELD_FLAGS, fire: true } } })));
    expect(btn('auto-face').dataset.uiButton).toBe('lit');
  });
});

describe('the sit-down card (spec §1)', () => {
  it('names the seat goal and its three keys, and takes no pointer', () => {
    const { duel } = mount(); act(() => duel.frame(view(helm, { sitCard: sitCard('helm', 0.5, false) })));
    const card = document.querySelector('[data-ui-sit-card="helm"]') as HTMLElement;
    expect(card).not.toBeNull(); expect(card.style.pointerEvents).toBe('none');
    for (const t of ['HELM: POINT AT THE ENEMY', 'A/D  TURN', 'W/S  THROTTLE', 'HOLD SPACE  AUTO-FACE']) expect(texts(), t).toContain(t);
    act(() => duel.frame(view(helm, { sitCard: null })));
    expect(document.querySelector('[data-ui-sit-card]')).toBeNull();
  });
});
