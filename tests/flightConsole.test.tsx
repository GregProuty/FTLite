// @vitest-environment jsdom
// Valkyrn spec §5, §8: the Flight seat's block beside the Helm block: GUN (heat, READY / OVERHEAT / OFFLINE) and TORPEDO
// (MAG n/4, range, target room); the laser fit shows LASER instead. A card click picks the weapon up; the contact window's
// weapon rows work on Flight. The controls list names the Flight seat's bindings.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import valkyrnJson from '../src/renderer/src/sim/ship/valkyrn.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { sitDown } from '../src/renderer/src/sim/stations';
import { classIndexById, GUN, VALKYRN_LASER_CLASS } from '../src/renderer/src/sim/tactical/defs';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { consoleModel } from '../src/renderer/src/render/duel/consoleModel';
import { FLIGHT, flightCard, STATION } from '../src/renderer/src/render/duel/consoleLayout';
import { contactModel } from '../src/renderer/src/render/duel/contactModel';
import { FlightStation } from '../src/renderer/src/ui/duel/FlightStation';
import { UiContext } from '../src/renderer/src/ui/context';
import { makeUi } from './helpers/uiStore';
import { controlSections } from '../src/renderer/src/app/controlsList';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const valkyrn = parseShip(valkyrnJson);
const seated = (cls?: number): DuelState => { const d = createDuel(valkyrn, 7, 0, 1, cls); sitDown(d.interior, 0, d.nav); return d; };
const view = (d: DuelState) => consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null })!;

describe('the Flight panel (Valkyrn spec §5, §8)', () => {
  it('GUN: READY, OVERHEAT when locked, OFFLINE with Weapons at 2; heat 0..1; the torpedo as on Weapons', () => {
    const d = seated(), sys = d.tactical.systems[0];
    try {
      sys.gunHeat = GUN.heatMax / 2;
      expect(view(d).flight).toMatchObject({ gun: { state: 'READY', heat: 0.5, locked: false }, weapons: { magazine: '4/4', burst: 0 } });
      sys.gunLocked = true; expect(view(d).flight!.gun!.state).toBe('OVERHEAT');
      sys.rooms[Room.Weapons] = 2; expect(view(d).flight!.gun!.state).toBe('OFFLINE');
    } finally { disposeDuel(d); }
  });
  it('the laser fit: no GUN card; the weapons panel carries the laser', () => {
    const d = seated(classIndexById(VALKYRN_LASER_CLASS.id));
    try { expect(view(d).flight!.gun).toBeNull(); expect(view(d).flight!.weapons.burst).toBeGreaterThan(0); } finally { disposeDuel(d); }
  });
  it('the block sits beside the Helm block; the cards are side by side', () => {
    expect(FLIGHT).toEqual({ x: STATION.x + STATION.w + 12, y: 720 - 12 - 166, w: 300, h: 166 });
    expect(flightCard(1).x).toBe(flightCard(0).x + 138 + 8);
  });
  it('a laser key on the gun fit reads NO LASER on the reason line (spec §6.1, review R1-F2)', () => {
    const d = seated(), ui = makeUi();
    try {
      const flight = consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, refused: { control: 'laser', reason: 'NO LASER', flash: true } })!.flight!;
      expect(flight.weapons.refused).toMatchObject({ control: 'laser', reason: 'NO LASER' });
      render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><FlightStation flight={flight} /></UiContext.Provider>);
      expect(document.querySelector('[data-text="NO LASER"]')).not.toBeNull();
    } finally { disposeDuel(d); }
  });
  it('renders GUN and TORPEDO; a TORPEDO click picks it up, a right-click clears its room', () => {
    const d = seated(), ui = makeUi(), pickUp = vi.spyOn(ui.actions.contact, 'pickUp'), torpLock = vi.spyOn(ui.actions.console, 'torpLock');
    try {
      render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><FlightStation flight={view(d).flight!} /></UiContext.Provider>);
      expect(document.querySelector('[data-ui-flight-card="gun"]')).not.toBeNull();
      expect(screen.queryByTestId('flight-card-laser')).toBeNull();
      fireEvent.pointerDown(screen.getByTestId('flight-card-torpedo'), { button: 0 });
      expect(pickUp).toHaveBeenCalledWith('torpedo');
      fireEvent.pointerDown(screen.getByTestId('flight-card-torpedo'), { button: 2 });
      expect(torpLock).toHaveBeenCalledWith(-1);
    } finally { disposeDuel(d); }
  });
  it('the contact window\'s weapon rows show on Flight, the laser row disabled on a gun class', () => {
    const d = seated();
    try {
      d.tactical.known[0] = 2;
      const v = view(d), c = contactModel({ state: d.tactical, contact: 0, aim: true, weapon: 'torpedo', station: 'flight', t: 0, weapons: v.flight!.weapons, flashes: [] })!;
      expect(c.weapons).not.toBeNull();
      expect(c.weapons!.laser.enabled).toBe(false);
      expect(c.aimWeapon).toBe('torpedo');
    } finally { disposeDuel(d); }
  });
});

describe('the controls list (Valkyrn spec §9)', () => {
  it('has a Flight seat section with every §5.1 binding', () => {
    const s = controlSections().find((x) => x.title === 'Single player: Valkyrn')!;
    expect(s.rows.map((r) => r.keys)).toEqual(['Mouse', 'Hold left mouse', 'Right mouse', 'Hold Space', 'W / S, Shift+W, wheel over the throttle', 'Q / E', '2', '1 / 3 4 5', 'G / Middle click', 'Middle drag', 'Tab']);
  });
});
