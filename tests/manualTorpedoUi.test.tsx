// Merge with the Engineering spike (SIM 58, kind a, replaced rule): the crew's beam stands on the Weapons officer's bars and
// starts dark (spec §10.3), so these tests give the crew today's laser and torpedo by bars (todaysCrewWeapons).
// @vitest-environment jsdom
// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3, §5): the TORPEDO card.
// - Its AUTO / MAN tag shows the mode (MAN lit), and a click presses torpMode, as V does.
// - In MANUAL the card says MANUAL instead of the range words, and a flying MANUAL torpedo says STEER A/D only while it can turn
//   (past its boost, fuel left), FLYING during the boost and COASTING once its fuel is spent.
// - The Weapons panel carries the mode and the flying torpedo's, and LAUNCH is live out of range in MANUAL.
// - The lock tone is off in MANUAL.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { todaysCrewWeapons } from './helpers/crewWeapons';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { consoleModel, type ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS, type ConsoleInput } from '../src/renderer/src/app/duel/input';
import { torpedoTone } from '../src/renderer/src/app/duel/scene';
import { TEXT } from '../src/renderer/src/render/theme';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { classOf, missileOf, placeMissile, Room } from '../src/renderer/src/sim/tactical/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';
import { makeUi } from './helpers/uiStore';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const tag = () => document.querySelector('[data-testid="console-torp-mode"]') as HTMLElement | null;
const charge = { label: 'CHARGE', value: 'READY', labelTint: TEXT, valueTint: TEXT, bar: { fill: 1, colour: TEXT } };
const weapons = (over: Partial<NonNullable<ConsoleView['weapons']>>): ConsoleView => ({
  station: 'weapons', tabs: { helm: 'open', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, science: null, ship: 'stand' },
  helm: null, science: null, side: { zoom: '0.90', free: false, snapLabel: 'CAMERA' },
  weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, torpedoInRange: false, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null, laserTarget: 1, torpTarget: -1, burst: 2, ...over }
});
const view = (console: ConsoleView): DuelUiView => ({ readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { ui, duel };
}

describe('the TORPEDO card\'s AUTO / MAN tag (spec §3, §5)', () => {
  it('reads AUTO unlit in AUTO and MAN lit in MANUAL; absent without the mode', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ torpManual: false }))));
    expect(tag()!.dataset.uiButton).not.toBe('lit');
    expect(texts()).toContain('OUT OF RANGE');
    act(() => duel.frame(view(weapons({ torpManual: true }))));
    expect(tag()!.dataset.uiButton).toBe('lit');
    expect(texts()).toContain('MAN');
    expect(texts()).toContain('MANUAL');
    expect(texts()).not.toContain('OUT OF RANGE');
    act(() => duel.frame(view(weapons({}))));
    expect(tag()).toBeNull();
  });
  it('a click presses torpMode, as V does', () => {
    const { ui, duel } = mount(), press = vi.fn();
    const input: ConsoleInput = { press, hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn() };
    ui.actions.setConsole(input);
    act(() => duel.frame(view(weapons({ torpManual: false }))));
    fireEvent.pointerDown(tag()!, { button: 0 });
    expect(press).toHaveBeenCalledWith('torpMode');
  });
  it('a flying MANUAL torpedo says STEER A/D while it can turn, FLYING in its boost, COASTING once its fuel is spent; an AUTO one FLYING', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ torpManual: true, missileFlying: true, torpSteer: true, torpCoast: false }))));
    expect(texts()).toContain('STEER A/D');
    expect(texts()).not.toContain('COASTING');
    act(() => duel.frame(view(weapons({ torpManual: true, missileFlying: true, torpSteer: false, torpCoast: false }))));   // the boost
    expect(texts()).toContain('FLYING');
    expect(texts()).not.toContain('STEER A/D');
    act(() => duel.frame(view(weapons({ torpManual: true, missileFlying: true, torpSteer: false, torpCoast: true }))));   // the fuel is spent
    expect(texts()).toContain('COASTING');
    expect(texts()).not.toContain('STEER A/D');
    expect(texts()).not.toContain('FLYING');
    act(() => duel.frame(view(weapons({ torpManual: false, missileFlying: true, torpSteer: false, torpCoast: false }))));   // an AUTO torpedo
    expect(texts()).toContain('FLYING');
  });
});

describe('the Weapons panel and the tone in MANUAL (spec §3)', () => {
  it('carries the mode and the flying torpedo\'s; LAUNCH is live out of range; the lock tone is off', () => {
    const d = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.ValkyrnLaser); todaysCrewWeapons(d.tactical);   // W-4 spec §14.1: the beam's rule, on the laser fit
    try {
      // Merge with the Engineering spike (kind a): out of torpedo range but inside sensor range (800 < 900 at 1 Sensors bar,
      // spec §10.4), since an unseen enemy never sounds the lock tone (was 3000 apart).
      Object.assign(d.tactical.ships[0], { x: 0, y: 1500, vx: 0, vy: 0 });
      Object.assign(d.tactical.ships[1], { x: 0, y: 700, vx: 0, vy: 0 });
      d.tactical.systems[0].torpLock = Room.Shields;
      const panel = () => consoleModel({ duel: d, me: 1, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })!.weapons!;
      expect([panel().torpManual, panel().canLaunch, panel().torpSteer, panel().torpCoast, torpedoTone(d).locked]).toEqual([false, false, false, false, true]);
      d.tactical.systems[0].torpManual = true;
      expect([panel().torpManual, panel().canLaunch, torpedoTone(d).locked]).toEqual([true, true, false]);
      placeMissile(d.tactical, 0, { x: 0, y: 1300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, true);
      const def = classOf(d.tactical, 0).slots.missile, flightOf = () => missileOf(d.tactical, 0)!;
      expect([panel().missileFlying, panel().torpSteer, panel().torpCoast]).toEqual([true, true, false]);   // age 30: past the boost, fuelled
      flightOf().age = def.boostTicks;   // still in its boost: A/D turns nothing
      expect([panel().missileFlying, panel().torpSteer, panel().torpCoast]).toEqual([true, false, false]);
      flightOf().age = def.fuelTicks + 1;   // the fuel is spent
      expect([panel().missileFlying, panel().torpSteer, panel().torpCoast]).toEqual([true, false, true]);
    } finally { disposeDuel(d); }
  });
});
