// @vitest-environment jsdom
// Hacking spike (spec §3.1, §6 R1-7; plan R1-4, R1-5): the Science block's SCAN / HACK rows (the panel model's status words
// and buttons, the React block sending sciencePower and hack through the ship queue) and the block's map-click exclusion.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { hackPanel } from '../src/renderer/src/render/duel/scienceModel';
import { consoleLayout, STATION } from '../src/renderer/src/render/duel/consoleLayout';
import { onScienceBlock } from '../src/renderer/src/app/duel/flightPointer';
import { DuelSystem } from '../src/renderer/src/sim/tactical/bars';
import { Contact, createTacticalState, CREW_SLOT, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const HUNTER = 1;
function ready(): TacticalState {
  const t = createTacticalState(3), crew = t.systems[CREW_SLOT], a = t.ships[CREW_SLOT], b = t.ships[HUNTER];
  crew.bars[DuelSystem.Sensors] = 3; crew.hackPower = 2; t.designated = Contact.Enemy; b.x = a.x + 500; b.y = a.y;
  return t;
}

let ui: ReturnType<typeof makeUi> | null = null;
const view = (t: TacticalState): DuelUiView => ({ end: null, banners: { interior: null, tactical: null, notice: null, alert: null }, overlay: null, crt: true, contact: null,
  console: { station: 'science', tabs: { helm: 'locked', weapons: 'locked', science: 'current', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
    helm: null, weapons: null, science: { hover: null, range: 1800, hack: hackPanel(t) } } satisfies ConsoleView });
function mount(t: TacticalState) {
  ui = makeUi(); const duel = createDuelSink(ui.store), ship = vi.fn();
  ui.actions.setConsole({ press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn(), ship });
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  act(() => duel.frame(view(t)));
  return ship;
}
const texts = () => Array.from(document.querySelectorAll('canvas')).map((e) => e.dataset.text);

describe('the hack panel model (§3.1)', () => {
  it('says why a hack cannot start, in order: bars, the designation, the range; then PICK A ROOM', () => {
    const t = createTacticalState(3);
    expect(hackPanel(t)).toMatchObject({ scan: 1, hack: 0, pips: 4, online: false, status: 'HACK: NEED 2 BARS', progress: null });
    expect(hackPanel(t).rooms.map((r) => r.state)).toEqual(['dim', 'dim', 'dim']);
    const r = ready();
    expect(hackPanel(r)).toMatchObject({ scan: 1, hack: 2, online: true, status: 'HACK: PICK A ROOM' });
    expect(hackPanel(r).rooms.map((x) => [x.label, x.state])).toEqual([['WEAP', 'idle'], ['SHLD', 'idle'], ['ENG', 'idle']]);
    r.designated = -1; expect(hackPanel(r).status).toBe('HACK: SELECT THE ENEMY');
    r.designated = Contact.Enemy; r.ships[HUNTER].x += 2000; expect(hackPanel(r).status).toBe('HACK: OUT OF RANGE');
  });
  it('shows the running hold with its seconds and bar, and a room that is down with its seconds', () => {
    const t = ready(); t.hackRoom = Room.Shields; t.hackTicks = 120;
    expect(hackPanel(t)).toMatchObject({ status: 'HACKING SHLD 5 s', alert: true, progress: 120 / 420 });
    expect(hackPanel(t).rooms[1]).toMatchObject({ state: 'running' });
    t.hackRoom = -1; t.hackTicks = 0; t.systems[HUNTER].hacked[Room.Engines] = 1500;
    expect(hackPanel(t)).toMatchObject({ status: 'ENG DOWN 25 s', alert: false, progress: null });
    expect(hackPanel(t).rooms[2]).toEqual({ label: 'ENG 25', state: 'down', seconds: 25, refusal: 'ENG: ALREADY DOWN' });
  });
});

describe('the Science block (§3.1)', () => {
  it('draws the SCAN and HACK pips, the room buttons and the status line', () => {
    mount(ready());
    const pips = Array.from(document.querySelectorAll('[data-ui-science-pip]')).map((e) => (e as HTMLElement).dataset.uiSciencePip);
    expect(pips).toEqual(['scan:0:on', 'scan:1:off', 'scan:2:off', 'scan:3:off', 'hack:0:on', 'hack:1:on', 'hack:2:off', 'hack:3:off']);
    expect(texts()).toEqual(expect.arrayContaining(['SCAN', 'HACK', 'HACK: PICK A ROOM']));
  });
  it('a left click on HACK\'s pips adds a bar, a right click removes one; a room button hacks, the running one cancels', () => {
    const t = ready(), ship = mount(t), pips = document.querySelector('[data-testid="console-science-pips-hack"]') as HTMLElement;
    fireEvent.pointerDown(pips, { button: 0 }); fireEvent.pointerDown(pips, { button: 2 });
    const room = document.querySelector('[data-testid="console-hack-2"]') as HTMLElement;
    fireEvent.pointerDown(room, { button: 0 }); fireEvent.pointerUp(room, { button: 0 });
    expect(ship.mock.calls.map((c) => c[0])).toEqual([{ kind: 'sciencePower', delta: 1 }, { kind: 'sciencePower', delta: -1 }, { kind: 'hack', room: Room.Engines }]);
  });
  it('a click on the running room cancels the hack', () => {
    const t = ready(); t.hackRoom = Room.Weapons; t.hackTicks = 30;
    const ship = mount(t), room = document.querySelector('[data-testid="console-hack-0"]') as HTMLElement;
    fireEvent.pointerDown(room, { button: 0 }); fireEvent.pointerUp(room, { button: 0 });
    expect(ship.mock.calls.map((c) => c[0])).toEqual([{ kind: 'hack', room: -1 }]);
  });
});

describe('the Science block refusals and the cancel guard (code review 2, 3)', () => {
  it('a refused pip click says why on the status line and sends nothing', () => {
    const t = ready(); t.systems[CREW_SLOT].bars[DuelSystem.Sensors] = 2;   // both Sensors bars already on HACK
    const ship = mount(t), pips = document.querySelector('[data-testid="console-science-pips-hack"]') as HTMLElement;
    fireEvent.pointerDown(pips, { button: 0 });
    expect(ship).not.toHaveBeenCalled();
    expect(texts()).toContain('HACK: NO FREE BAR');
  });
  it('a dim room says why, a down room says ALREADY DOWN, and neither sends', () => {
    const t = ready(); t.designated = -1; t.systems[HUNTER].hacked[Room.Shields] = 600;
    const ship = mount(t), press = (k: number) => { const b = document.querySelector(`[data-testid="console-hack-${k}"]`) as HTMLElement; fireEvent.pointerDown(b, { button: 0 }); fireEvent.pointerUp(b, { button: 0 }); };
    press(1); expect(texts()).toContain('SHLD: ALREADY DOWN');
    press(0); expect(texts()).toContain('HACK: SELECT THE ENEMY');
    expect(ship).not.toHaveBeenCalled();
  });
  it('a second press on a room within the guard after starting it does not cancel it', () => {
    const t = ready(), ship = mount(t), b = () => document.querySelector('[data-testid="console-hack-2"]') as HTMLElement;
    const press = () => { fireEvent.pointerDown(b(), { button: 0 }); fireEvent.pointerUp(b(), { button: 0 }); };
    press();
    t.hackRoom = Room.Engines; t.hackTicks = 3;
    act(() => createDuelSink(ui!.store).frame(view(t)));
    press();
    expect(ship.mock.calls.map((c) => c[0])).toEqual([{ kind: 'hack', room: Room.Engines }]);
  });
});

describe('the Science block swallows map clicks (R1-7)', () => {
  it('a point inside the block is the block\'s; one beside it is the map\'s', () => {
    const L = consoleLayout(), top = L.stationTop('science');
    expect(onScienceBlock({ x: STATION.x + 10, y: top + 10 }, L)).toBe(true);
    expect(onScienceBlock({ x: STATION.x + STATION.w - 1, y: top + STATION.h.science - 1 }, L)).toBe(true);
    expect(onScienceBlock({ x: STATION.x + STATION.w + 2, y: top + 10 }, L)).toBe(false);
    expect(onScienceBlock({ x: STATION.x + 10, y: top - 2 }, L)).toBe(false);
  });
});
