// @vitest-environment jsdom
// Engineering spike §10.3, §11: the Weapons block's three cards: PEW PEW (its bars and ARRIVES WITH W-1; no charge, no
// lock, no pick-up on this branch), BEAM (today's laser) and TORPEDO; each with four bar pips (the fourth the
// overdrive's, dashed), a left click adding a bar and a right click removing one (weaponPower).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView, WeaponsPanel } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { TEXT, textPx } from '../src/renderer/src/render/theme';
import { STATION } from '../src/renderer/src/render/duel/consoleLayout';
import { freeText } from '../src/renderer/src/ui/duel/WeaponsStation';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const all = (attr: string) => Array.from(document.querySelectorAll<HTMLElement>(`[${attr}]`)).map((e) => e.getAttribute(attr));
const panel: WeaponsPanel = { lock: 1, charge: { label: 'CHARGE', value: '40%', labelTint: TEXT, valueTint: TEXT, bar: { fill: 0.4, colour: TEXT } }, magazine: '4/4', canLaunch: true, torpedoInRange: true, missileFlying: false,
  fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null, laserTarget: -1, torpTarget: -1, burst: 0, weaponBars: [1, 0, 4], weaponFree: 1 };
const weapons: ConsoleView = { station: 'weapons', tabs: { helm: 'locked', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  helm: null, weapons: panel, science: null, side: null };
const view = (): DuelUiView => ({ readout: { rows: [{ label: 'CREW', value: '2', labelTint: TEXT, valueTint: TEXT }], help: [] }, end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console: weapons });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store), weaponPower = vi.fn(), pickUp = vi.fn();
  ui.actions.setConsole({ press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn(), weaponPower });
  ui.actions.setContact({ close: vi.fn(), arm: vi.fn(), cancelAim: vi.fn(), pick: vi.fn(), scan: vi.fn(), pickUp });
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { duel, weaponPower, pickUp };
}

describe('the three weapons (spec §10.3, §11)', () => {
  it('PEW PEW with its bars and the W-1 note, no pick-up; BEAM and TORPEDO as today; the pips by bars', () => {
    const { duel } = mount(); act(() => duel.frame(view()));
    for (const w of ['PEW PEW', 'ARRIVES', 'WITH W-1', 'BEAM', 'x0', 'TORPEDO', 'MAG 4/4', 'FREE 1']) expect(texts()).toContain(w);
    expect(all('data-ui-card-frame')).toEqual(['pew', 'laser', 'torpedo']);
    expect(screen.queryByTestId('console-card-pew')).toBeNull();   // no pick-up on this branch
    expect(screen.queryByTestId('console-card-laser')).not.toBeNull();
    expect(screen.queryByTestId('console-fire')).not.toBeNull();
    expect(all('data-ui-weapon-pip')).toEqual([
      '0:0:on', '0:1:off', '0:2:off', '0:3:off', '1:0:off', '1:1:off', '1:2:off', '1:3:off', '2:0:on', '2:1:on', '2:2:on', '2:3:on'
    ]);
  });
  it('a left click on a weapon\'s pips adds a bar, a right click removes one; pew pew\'s pips too', () => {
    const { duel, weaponPower } = mount(); act(() => duel.frame(view()));
    fireEvent.pointerDown(screen.getByTestId('console-weapon-pips-1'), { button: 0 });
    fireEvent.pointerDown(screen.getByTestId('console-weapon-pips-2'), { button: 2 });
    fireEvent.pointerDown(screen.getByTestId('console-weapon-pips-0'), { button: 2 });
    expect(weaponPower.mock.calls).toEqual([[1, 1], [2, -1], [0, -1]]);
  });
  it('every refusal and reason starts at the block\'s left and stays clear of FREE (as rockTargetUi measures the hint)', () => {
    const x0 = STATION.x + 8, right = STATION.x + STATION.w - 8;
    for (const t of ['LAUNCH: TORPEDO UNPOWERED', 'LAUNCH: WEAPONS OFFLINE', 'LAUNCH: OUT OF RANGE', 'FIRE: BEAM UNPOWERED', 'FIRE: TORPEDO FLYING', 'BEAM: OUT OF ARC: HELM TURN RIGHT', 'BEAM: OUT OF RANGE 2000/450'])
      expect(x0 + textPx(t, 1) + 8, t).toBeLessThanOrEqual(right - textPx(freeText(9), 1));
  });
});
