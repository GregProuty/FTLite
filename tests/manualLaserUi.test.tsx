// Merge with the Engineering spike (SIM 58, kind a, replaced rule): the crew's beam stands on the Weapons officer's bars and
// starts dark (spec §10.3), so these tests give the crew today's laser and torpedo by bars (todaysCrewWeapons).
// @vitest-environment jsdom
// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §5): the LASER card's AUTO / MAN tag shows the mode (MAN lit)
// and a click on it presses laserMode, as Z does; the Weapons panel carries the mode; in MANUAL the card never says
// FIRING and has no goal glow.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { todaysCrewWeapons } from './helpers/crewWeapons';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { consoleModel, type ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { manualCardReason } from '../src/renderer/src/render/duel/situationModel';
import { NO_HELD_FLAGS, type ConsoleInput } from '../src/renderer/src/app/duel/input';
import { TEXT } from '../src/renderer/src/render/theme';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import type { TacticalState } from '../src/renderer/src/sim/tactical/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';
import { makeUi } from './helpers/uiStore';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const tag = () => document.querySelector('[data-testid="console-laser-mode"]') as HTMLElement | null;
const charge = { label: 'CHARGE', value: 'READY', labelTint: TEXT, valueTint: TEXT, bar: { fill: 1, colour: TEXT } };
const weapons = (over: Partial<NonNullable<ConsoleView['weapons']>>): ConsoleView => ({
  station: 'weapons', tabs: { helm: 'open', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, science: null, ship: 'stand' },
  helm: null, science: null, side: { zoom: '0.90', free: false, snapLabel: 'CAMERA' },
  weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, torpedoInRange: true, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null, laserTarget: 1, torpTarget: -1, burst: 2, ...over }
});
const view = (console: ConsoleView): DuelUiView => ({ readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { ui, duel };
}
/** The enemy `dist` ahead of the crew at (3000, 0), nose north, `deg` off the nose (feelPresentation.test.ts's place). */
function place(st: TacticalState, dist: number, deg = 0): void {
  const me = st.ships[0], e = st.ships[1], r = (deg * Math.PI) / 180;
  Object.assign(me, { x: 3000, y: 0, vx: 0, vy: 0, heading: 0 });
  st.map.asteroids.length = 0;
  const fx0 = hx(0), fy0 = hy(0), c = Math.cos(r), s = Math.sin(r);
  Object.assign(e, { x: me.x + dist * (fx0 * c - fy0 * s), y: me.y + dist * (fy0 * c + fx0 * s), vx: 0, vy: 0 });
}

describe('the AUTO / MAN tag (spec §2, §5)', () => {
  it('reads AUTO unlit in AUTO and MAN lit in MANUAL; absent without the mode', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ laserManual: false }))));
    expect(texts()).toContain('AUTO');
    expect(tag()!.dataset.uiButton).not.toBe('lit');
    act(() => duel.frame(view(weapons({ laserManual: true }))));
    expect(texts()).toContain('MAN');
    expect(tag()!.dataset.uiButton).toBe('lit');
    act(() => duel.frame(view(weapons({}))));
    expect(tag()).toBeNull();
  });
  it('a click presses laserMode, as Z does', () => {
    const { ui, duel } = mount(), press = vi.fn();
    const input: ConsoleInput = { press, hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
    ui.actions.setConsole(input);
    act(() => duel.frame(view(weapons({ laserManual: false }))));
    fireEvent.pointerDown(tag()!, { button: 0 });
    expect(press).toHaveBeenCalledWith('laserMode');
  });
});

describe('the Weapons panel in MANUAL (spec §2)', () => {
  it('maps the firing words to MANUAL: SPACE FIRES and keeps the others', () => {
    expect([manualCardReason('FIRING'), manualCardReason('PICK A ROOM TO FIRE'), manualCardReason('OUT OF ARC: HELM TURN RIGHT'), manualCardReason(null)])
      .toEqual(['MANUAL: SPACE FIRES', 'MANUAL: SPACE FIRES', 'OUT OF ARC: HELM TURN RIGHT', null]);
  });
  it('carries the mode; a lined-up MANUAL laser never says FIRING and has no goal glow', () => {
    const d = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.ValkyrnLaser); todaysCrewWeapons(d.tactical);   // W-4 spec §14.1: the beam's rule, on the laser fit
    try {
      place(d.tactical, 300, 10);   // lined up, full and targeted: AUTO says FIRING
      const panel = () => consoleModel({ duel: d, me: 1, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, goal: true })!.weapons!;
      expect([panel().laserManual, panel().laserReason]).toEqual([false, 'FIRING']);
      d.tactical.systems[0].laserManual = true;
      d.tactical.systems[0].laserTargeted = false;   // untargeted: AUTO would glow
      expect([panel().laserManual, panel().laserReason, panel().goal]).toEqual([true, 'MANUAL: SPACE FIRES', false]);
    } finally { disposeDuel(d); }
  });
});
