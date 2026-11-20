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
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS, type ConsoleInput } from '../src/renderer/src/app/duel/input';
import { TEXT, textPx } from '../src/renderer/src/render/theme';
import { STATION } from '../src/renderer/src/render/duel/consoleLayout';
import { controlSections } from '../src/renderer/src/app/controlsList';
import { autocannonRateText } from '../src/renderer/src/app/duel/weaponsSeat';
import { freeText, HOUND_PEW_PIPS_X } from '../src/renderer/src/ui/duel/WeaponsStation';
import { makeUi } from './helpers/uiStore';

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
    expect(x0 + textPx('RIGHT-CLICK TORPEDO: CLEAR', 1) + 8).toBeLessThanOrEqual(right - textPx('ROCKS 99', 1));
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
