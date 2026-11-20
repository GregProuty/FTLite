// @vitest-environment jsdom
// W-4 spec §10 (W-4a): the Hound's Weapons station: PEW PEW, AUTOCANNON and TORPEDO in slot order, the selected card's
// frame hot (data-ui-card-selected), a card click selects (TORPEDO also picks it up), AUTOCANNON's heat bar with OVERHEAT
// while locked and its rate (`6/S`, `OFF` at 0 bars), no BEAM, no FIRE (Space), the frequency row with 4/5/6; the laser fit
// keeps BEAM; the controls list rows come from the tables.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { consoleModel, type ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { NO_HELD_FLAGS, type ConsoleInput } from '../src/renderer/src/app/duel/input';
import { TEXT, textPx } from '../src/renderer/src/render/theme';
import { STATION } from '../src/renderer/src/render/duel/consoleLayout';
import { controlSections } from '../src/renderer/src/app/controlsList';
import { autocannonRateText } from '../src/renderer/src/app/duel/weaponsSeat';
import { freeText, HOUND_PEW_PIPS_X, houndRoomHint } from '../src/renderer/src/ui/duel/WeaponsStation';
import { makeUi } from './helpers/uiStore';
import { contactModel, type ContactView } from '../src/renderer/src/render/duel/contactModel';
import { createContactController } from '../src/renderer/src/app/duel/contactController';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const charge = { label: 'CHARGE', value: 'READY', labelTint: TEXT, valueTint: TEXT, bar: { fill: 1, colour: TEXT } };
const AC = { heat: 0.25, locked: false, offline: false, rate: '6/S' };
/** A Weapons view; `pew` (pew pew's three charge fills) is set, so the PEW PEW card draws; a laser-fit case passes `pew: undefined`. */
const weapons = (over: Partial<NonNullable<ConsoleView['weapons']>>): ConsoleView => ({
  station: 'weapons', tabs: { helm: 'open', weapons: 'current', science: 'locked', ship: 'open' }, tabActions: { helm: 'switch', weapons: null, science: null, ship: 'stand' },
  helm: null, science: null, side: { zoom: '0.90', free: false, snapLabel: 'CAMERA' },
  weapons: { lock: 1, charge, magazine: '4/4', canLaunch: true, torpedoInRange: false, missileFlying: false, fireHeld: false, held: NO_HELD_FLAGS, freq: 0, weakFreq: null, laserTarget: -1, torpTarget: -1, burst: 0, pew: [1, 1, 1], ...over }
});
const view = (console: ConsoleView): DuelUiView => ({ readout: { rows: [], help: [] }, end: null, banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: true, console });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { ui, duel };
}
const input = (): ConsoleInput & { select: ReturnType<typeof vi.fn> } => ({ press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn(), select: vi.fn() });

describe("the Hound's Weapons station (W-4 spec §10)", () => {
  it('three cards in slot order; the selected one framed; no BEAM card, no FIRE button', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 1 }))));
    expect(['pew', 'autocannon', 'torpedo'].map((w) => q(`[data-testid="console-card-${w}"]`) !== null)).toEqual([true, true, true]);
    expect(Array.from(document.querySelectorAll('[data-ui-card-frame]')).map((e) => (e as HTMLElement).dataset.uiCardFrame)).toEqual(['pew', 'autocannon', 'torpedo']);
    expect(Array.from(document.querySelectorAll('[data-ui-card-selected]')).map((e) => (e as HTMLElement).dataset.uiCardFrame)).toEqual(['autocannon']);
    expect(texts()).toContain('PEW PEW');
    expect(texts()).toContain('AUTOCANNON');
    expect(texts()).not.toContain('BEAM');
    expect(q('[data-testid="console-fire"]')).toBeNull();
  });
  it('a click on a card selects it; on TORPEDO it also picks it up', () => {
    const { ui, duel } = mount(), i = input(), pickUp = vi.spyOn(ui.actions.contact, 'pickUp');
    ui.actions.setConsole(i);
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0 }))));
    fireEvent.pointerDown(q('[data-testid="console-card-autocannon"]')!, { button: 0 });
    expect(i.select).toHaveBeenLastCalledWith(1);
    expect(pickUp).not.toHaveBeenCalled();
    fireEvent.pointerDown(q('[data-testid="console-card-torpedo"]')!, { button: 0 });
    expect(i.select).toHaveBeenLastCalledWith(2);
    expect(pickUp).toHaveBeenLastCalledWith('torpedo');
  });
  it('AUTOCANNON: heat bar, OVERHEAT while locked, the rate by bars on its own line, locked or not (OFF at 0)', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ autocannon: { ...AC, locked: true }, selected: 1 }))));
    expect(texts()).toContain('6/S');   // the rate line shows while locked too; OVERHEAT is the state line under it
    expect(q('[data-ui-overheat]')).not.toBeNull();   // the heat bar while locked (the OVERHEAT word blinks on the CRT clock)
    act(() => duel.frame(view(weapons({ autocannon: { ...AC, rate: 'OFF' }, selected: 1 }))));
    expect(texts()).toContain('OFF');
    expect([autocannonRateText(10), autocannonRateText(6), autocannonRateText(0)]).toEqual(['6/S', '10/S', 'OFF']);
  });
  it('the frequency row shows with 4/5/6 and the weak mark after a Level 2 scan', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, freq: 1, weakFreq: 2 }))));
    expect(texts()).toContain('4/5/6');   // the row's key hint is one text (WeaponsStation.tsx L156, '3/4/5' today)
    expect(texts()).not.toContain('3/4/5');
    expect(q('[data-testid="console-freq-1"]')!.dataset.uiButton).toBe('lit');
    expect(q('[data-ui-weak-freq]')!.dataset.uiWeakFreq).toBe('C');   // FREQ_NAMES[2], the weak mark (L154)
  });
  it('the PEW PEW label, its charge pips and every Hound hint and refusal keep their 8 px (as engineeringWeaponsUi and rockTargetUi measure)', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0 }))));
    const x0 = STATION.x + 8, right = STATION.x + STATION.w - 8;
    expect(x0 + textPx('PEW PEW', 1) + 8).toBeLessThanOrEqual(x0 + HOUND_PEW_PIPS_X);   // the longer label clears the moved charge pips
    for (const t of ['LMB FIRE · A/D SELECT · W/S POWER', 'PEW: NO CHARGE', 'PEW: WEAPONS OFFLINE', 'AUTOCANNON: NO POWER', 'AUTOCANNON: OVERHEAT', 'AUTOCANNON: WEAPONS OFFLINE', 'AUTOCANNON: NO GUNNER', 'TORPEDO: TORPEDO UNPOWERED', 'TORPEDO: OUT OF RANGE', 'POWER: NO FREE BAR'])
      expect(x0 + textPx(t, 1) + 8, t).toBeLessThanOrEqual(right - textPx(freeText(9), 1));
    expect(x0 + textPx(houndRoomHint(0, true), 1) + 8).toBeLessThanOrEqual(right - textPx('ROCKS 99', 1));
  });
  it('TORPEDO in MAN while it flies and can turn reads STEER LMB (W-4 spec §10)', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ autocannon: { heat: 0, locked: false, offline: false, rate: '6/S' }, selected: 2, torpManual: true, missileFlying: true, torpSteer: true, torpCoast: false }))));
    expect(texts()).toContain('STEER LMB');
    expect(texts()).not.toContain('STEER A/D');
  });
  it("the laser fit's Weapons station still shows BEAM with its FIRE button", () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ laserTarget: 1, burst: 2, pew: undefined }))));
    expect(texts()).toContain('BEAM');
    expect(q('[data-testid="console-fire"]')).not.toBeNull();
    expect(q('[data-testid="console-card-autocannon"]')).toBeNull();
  });
});

describe('the controls list (W-4 spec §9)', () => {
  it('has the W-4a rows, built from the tables', () => {
    const rows = controlSections()[0]!.rows;
    expect(rows).toContainEqual({ keys: 'A / D, 1 / 2 / 3, Num 1 / 2 / 3', action: 'At Weapons, select a weapon' });
    expect(rows).toContainEqual({ keys: 'W / S', action: 'At Weapons, power the selected weapon (a bar on or off)' });
    expect(rows).toContainEqual({ keys: '4 / 5 / 6', action: "At Weapons, tune the guns' shield frequency A / B / C" });
    expect(rows.find((r) => r.keys === 'Left click')!.action).toMatch(/selected weapon/);
  });
});

describe("the Hound block's TORPEDO tag and the mode keys' rows (amendment §2.4, §2.5)", () => {
  it('a click on the TORPEDO tag flips the torpedo through the mode channel (mode(2)), not the V press', () => {
    const { ui, duel } = mount(), i = { ...input(), mode: vi.fn() };
    ui.actions.setConsole(i);
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, torpManual: false }))));
    fireEvent.pointerDown(q('[data-testid="console-torp-mode"]')!, { button: 0 });
    expect(i.mode).toHaveBeenCalledWith(2);
    expect(i.press).not.toHaveBeenCalled();
  });
  it("the laser block's TORPEDO tag still presses torpMode", () => {
    const { ui, duel } = mount(), i = { ...input(), mode: vi.fn() };
    ui.actions.setConsole(i);
    act(() => duel.frame(view(weapons({ laserTarget: 1, burst: 2, torpManual: false, pew: undefined }))));
    fireEvent.pointerDown(q('[data-testid="console-torp-mode"]')!, { button: 0 });
    expect(i.press).toHaveBeenCalledWith('torpMode');
    expect(i.mode).not.toHaveBeenCalled();
  });
  it('the controls list has R and Shift+R from the tables, and the Z and V rows are the laser fit\'s', () => {
    const rows = controlSections()[0]!.rows;
    expect(rows.find((r) => r.keys === 'R')?.action).toMatch(/^At Weapons, switch the selected weapon between AUTO and MAN/);
    expect(rows.find((r) => r.keys === 'Shift+R')?.action).toMatch(/^At Weapons, switch both guns together/);
    expect(rows.find((r) => r.keys === 'Z')?.action).toMatch(/^With the laser fit at Weapons/);
    expect(rows.find((r) => r.keys === 'V')?.action).toMatch(/^With the laser fit at Weapons/);
    expect(rows.some((r) => r.keys === '')).toBe(false);   // weaponModeAll has no code of its own: no row without keys
    expect(rows).toContainEqual({ keys: 'Mouse', action: "At Weapons, the reticle: the selected gun's turret follows it, inside its arc (MAN)" });
  });
});

/** An element's rectangle from its inline style (jsdom does no layout), as tests/engineeringWeaponsUi.test.tsx reads it. */
const rect = (e: HTMLElement): [number, number, number, number] => { const l = parseFloat(e.style.left), t = parseFloat(e.style.top); return [l, t, l + parseFloat(e.style.width), t + parseFloat(e.style.height)]; };
const overlap = (a: [number, number, number, number], b: [number, number, number, number]): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

describe('a switch on each card: the AUTO / MAN / HOLD tags (W-4 spec §4.3, §10; amendment §2.5)', () => {
  const tags = () => ['pew', 'autocannon'].map((w) => q(`[data-testid="console-gun-mode-${w}"]`)!);
  const lit = (): boolean[] => tags().map((t) => t.dataset.uiButton === 'lit');
  const words = (): string[] => texts().filter((t) => t === 'AUTO' || t === 'HOLD' || t === 'MAN');
  /** The Hound's panel with these switches, this gun in hand, this selection and the hold. The torpedo's own tag is left out
   *  (`torpManual` absent), so `words` are the two guns'. */
  const panel = (pewManual: boolean, gunManual: boolean, gunsHand: number, selected = 0, gunsHold = false) => view(weapons({ autocannon: AC, selected, pewManual, gunManual, gunsHand, gunsHold }));
  it("the word is what the gun does and the light is its own switch, in every row of the amendment's table", () => {
    const { duel } = mount();
    const row = (pewManual: boolean, gunManual: boolean, selected: number, gunsHand: number): { lit: boolean[]; words: string[] } => { act(() => duel.frame(panel(pewManual, gunManual, gunsHand, selected))); return { lit: lit(), words: words().sort() }; };
    expect(row(false, false, 0, -1)).toEqual({ lit: [false, false], words: ['AUTO', 'AUTO'] });
    expect(row(true, false, 0, 0)).toEqual({ lit: [true, false], words: ['AUTO', 'MAN'] });     // pew pew in hand
    expect(row(true, false, 1, -1)).toEqual({ lit: [true, false], words: ['AUTO', 'AUTO'] });   // a MAN gun that is not selected reads AUTO, lit
    expect(row(false, true, 1, 1)).toEqual({ lit: [false, true], words: ['AUTO', 'MAN'] });     // the autocannon in hand
    expect(row(true, true, 0, 0)).toEqual({ lit: [true, true], words: ['AUTO', 'MAN'] });
    expect(row(true, true, 1, 1)).toEqual({ lit: [true, true], words: ['AUTO', 'MAN'] });
    expect(row(true, true, 2, -1)).toEqual({ lit: [true, true], words: ['AUTO', 'AUTO'] });     // the torpedo selected: both AUTO-driven
    act(() => duel.frame(panel(true, true, -1, 2, true)));
    expect([lit(), words()]).toEqual([[true, true], ['HOLD', 'HOLD']]);   // the 30 s hold: an AUTO-driven gun reads HOLD
    act(() => duel.frame(panel(true, false, 0, 0, true)));
    expect(words().sort()).toEqual(['HOLD', 'MAN']);   // the gun in hand still reads MAN in the hold
  });
  it('the panel carries each switch, the gun in hand and the hold from the state (consoleModel)', () => {
    const d = createSeatedDuel(parseShip(cutter), 5), g = 1 - d.helmPlayer, s = d.tactical.systems[0];
    try {
      const w = (weaponSel: number) => consoleModel({ duel: d, me: g, mode: 'online', hidden: false, held: NO_HELD_FLAGS, overlay: null, weaponSel })!.weapons!;
      expect(w(0)).toMatchObject({ pewManual: false, gunManual: false, gunsHand: -1, gunsHold: true });   // a round starts on AUTO, in the hold
      s.pewManual = true;
      expect([w(0).gunsHand, w(1).gunsHand, w(1).pewManual, w(1).gunManual]).toEqual([0, -1, true, false]);   // in hand only while selected
      s.gunManual = true; d.tactical.hostileAt = 0;
      expect([w(1).gunsHand, w(2).gunsHand, w(1).gunsHold]).toEqual([1, -1, false]);
    } finally { disposeDuel(d); }
  });
  it('each tag is its own switch: a click on a gun tag flips that gun through the mode channel', () => {
    const { ui, duel } = mount(), i = { ...input(), mode: vi.fn() };
    ui.actions.setConsole(i);
    act(() => duel.frame(panel(false, false, -1)));
    fireEvent.pointerDown(tags()[0]!, { button: 0 });
    expect(i.mode.mock.calls).toEqual([[0]]);
    fireEvent.pointerDown(tags()[1]!, { button: 0 });
    expect(i.mode.mock.calls).toEqual([[0], [1]]);
    expect(i.press).not.toHaveBeenCalled();
    // the PEW PEW tag comes after the row's select overlay in the DOM, so a real click reaches the tag, not the overlay
    const overlay = document.querySelector('[data-testid="console-card-pew"]')!;
    expect(overlay.compareDocumentPosition(tags()[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('the tags clear the PEW PEW label, the charge pips, the bar pips, the AUTOCANNON title and each other (8 px from the text)', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, pewManual: false, gunManual: false, gunsHand: -1, gunsHold: false, weaponBars: [1, 1, 1], weaponFree: 0 }))));
    const [pew, gun] = tags().map(rect) as [[number, number, number, number], [number, number, number, number]], x0 = STATION.x + 8;
    expect(pew[0]).toBeGreaterThanOrEqual(x0 + textPx('PEW PEW', 1) + 8);
    expect(pew[2] + 8).toBeLessThanOrEqual(x0 + HOUND_PEW_PIPS_X);
    expect(gun[0]).toBeGreaterThanOrEqual(STATION.x + 8 + 6 + textPx('AUTOCANNON', 1) + 8);   // the card's text x (lx) plus the title
    const others = Array.from(document.querySelectorAll<HTMLElement>('[data-ui-pew-pip], [data-ui-weapon-pip]')).map(rect);
    expect(others.length).toBeGreaterThan(0);
    for (const o of others) for (const t of [pew, gun]) expect(overlap(t, o), `${t} vs ${o}`).toBe(false);
    expect(overlap(pew, gun)).toBe(false);
  });
  it('the hint rows: LMB FIRE · A/D SELECT · W/S POWER, then R AUTO/MAN · Q/E ROOM: <NAME>, or Q/E ROOM: <NAME> · RMB TORPEDO: CLEAR while the torpedo has a target; each clear of FREE / ROCKS by 8 px', () => {
    const { duel } = mount(), names = ['WEAPONS', 'SHIELDS', 'ENGINES'];
    names.forEach((name, lock) => {
      act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, lock, torpTarget: -1 }))));
      expect(texts()).toContain('LMB FIRE · A/D SELECT · W/S POWER');
      expect(texts()).toContain(`R AUTO/MAN · Q/E ROOM: ${name}`);
      act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, lock, torpTarget: 2 }))));
      expect(texts()).toContain(`Q/E ROOM: ${name} · RMB TORPEDO: CLEAR`);   // something to clear: the clear hint shows, and the room name never leaves
      expect(texts()).not.toContain(`R AUTO/MAN · Q/E ROOM: ${name}`);
      act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, lock, torpTarget: -1, torpRock: true }))));
      expect(texts()).toContain(`Q/E ROOM: ${name} · RMB TORPEDO: CLEAR`);   // a rock target is a target to clear too
    });
    expect(texts()).not.toContain('RIGHT-CLICK TORPEDO: CLEAR');
    const x0 = STATION.x + 8, right = STATION.x + STATION.w - 8;
    expect(x0 + textPx('LMB FIRE · A/D SELECT · W/S POWER', 1) + 8).toBeLessThanOrEqual(right - textPx(freeText(9), 1));
    for (const lock of [0, 1, 2]) for (const t of [houndRoomHint(lock, false), houndRoomHint(lock, true)])
      expect(x0 + textPx(t, 1) + 8, t).toBeLessThanOrEqual(right - textPx('ROCKS 99', 1));
    expect([textPx(houndRoomHint(0, false), 1), textPx(houndRoomHint(0, true), 1)]).toEqual([173, 218]);   // the widest name (WEAPONS); 229 px is the room left of ROCKS 99 and its 8 px
  });
  it("the laser fit's BEAM tag still presses laserMode", () => {
    const { ui, duel } = mount(), i = input();
    ui.actions.setConsole(i);
    act(() => duel.frame(view(weapons({ laserTarget: 1, burst: 2, laserManual: false }))));
    fireEvent.pointerDown(q('[data-testid="console-laser-mode"]')!, { button: 0 });
    expect(i.press).toHaveBeenCalledWith('laserMode');
  });
});

describe("the enemy window at the Hound's Weapons seat (W-4 amendment §3.6)", () => {
  const hound = (): TacticalState => { const st = createTacticalState(4); st.known[0] = 2; return st; };
  const windowOf = (st: TacticalState, aim: boolean): ContactView => contactModel({ state: st, contact: 0, aim, weapon: 'torpedo', station: 'weapons', t: 0, weapons: { charge } })!;
  const clickRoom = (contact: ContactView, room: number): void => { const c = contact.rooms[room]!.centre; fireEvent.pointerDown(document.querySelector('[data-ui-contact-box]')!, { button: 0, clientX: c.x, clientY: c.y }); };
  it("a plain room click sets the target room (the console's lock); with the torpedo picked up the click is the torpedo's target, as before", () => {
    const { ui, duel } = mount(), i = input(), controller = createContactController();
    ui.actions.setConsole(i); ui.actions.setContact(controller);
    controller.sync({ shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, laser: false, turret: true });
    const plain = windowOf(hound(), false);
    act(() => duel.frame({ ...view(weapons({ autocannon: AC, selected: 0 })), contact: plain }));
    clickRoom(plain, 2);
    expect(i.lock).toHaveBeenCalledWith(2);
    expect(i.torpLock).not.toHaveBeenCalled();
    controller.pickUp('torpedo');
    const armed = windowOf(hound(), true);
    act(() => duel.frame({ ...view(weapons({ autocannon: AC, selected: 2 })), contact: armed }));
    clickRoom(armed, 0);
    expect(i.torpLock).toHaveBeenCalledWith(0);
    expect(i.lock).toHaveBeenCalledTimes(1);
  });
  it('the bracket and the hint row follow lock', () => {
    const { duel } = mount(), st = hound();
    st.systems[0].lock = 2;
    const contact = windowOf(st, false);
    expect(contact.lockRoom).toBe(2);
    act(() => duel.frame({ ...view(weapons({ autocannon: AC, selected: 0, lock: st.systems[0].lock })), contact }));
    expect(document.querySelector('[data-ui-contact-lock]')).not.toBeNull();
    expect(texts()).toContain('R AUTO/MAN · Q/E ROOM: ENGINES');
  });
  it('a refused room (the enemy unseen) reads ROOM: NO CONTACT on the reason row, clear of FREE by 8 px', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ autocannon: AC, selected: 0, refused: { control: 'laser', reason: 'NO CONTACT', flash: true } }))));
    expect(texts()).toContain('ROOM: NO CONTACT');
    expect(STATION.x + 8 + textPx('ROOM: NO CONTACT', 1) + 8).toBeLessThanOrEqual(STATION.x + STATION.w - 8 - textPx(freeText(9), 1));
  });
  it('the controls list names Q / E at Weapons, from the tables', () => {
    expect(controlSections()[0]!.rows).toContainEqual({ keys: 'Q / E', action: 'At Weapons, step the target room (Weapons, Shields, Engines); rounds fired by hand damage it' });
  });
});
