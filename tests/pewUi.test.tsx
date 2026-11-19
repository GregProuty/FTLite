// @vitest-environment jsdom
// W-1 pew pew (spec 2026-11-18-pew-pew-weapons-design §1, §5): the PEW card first on the Weapons block, its three pips
// each filling as its third recharges, its NO CHARGE refusal line, and the pew's sound.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { pewPips } from '../src/renderer/src/render/duel/consoleModel';
import { PEW_ROW_H, STATION, stationTop, weaponCard } from '../src/renderer/src/render/duel/consoleLayout';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { TEXT } from '../src/renderer/src/render/theme';
import { duelEventSounds } from '../src/renderer/src/audio/duelSounds';
import { SFX } from '../src/renderer/src/audio/soundBank';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => c.dataset.text!);
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
  return { duel };
}

describe('the pips (spec §1)', () => {
  it('fill each third as it recharges; none without the pew', () => {
    const st = createTacticalState(5);
    expect(pewPips(st)).toEqual([1, 1, 1]);
    st.systems[0].pewCharge = 90;
    expect(pewPips(st)).toEqual([1, 0.5, 0]);
    st.systems[0].pewCharge = 0;
    expect(pewPips(st)).toEqual([0, 0, 0]);
    expect(pewPips(createTacticalState(5, 2, ShipClass.Valkyrn))).toBeNull();
  });
});

describe('the PEW card (spec §1)', () => {
  // Merge with the Engineering spike (kind a, replaced rule): the PEW row and the cards gain a row of bar pips (+12 each),
  // so the block grows upward by 24 (was 244 high, top 464, PEW row 28, cards at 498).
  it('comes first on the Weapons block, above the BEAM and TORPEDO cards', () => {
    expect(STATION.h.weapons).toBe(268); expect(stationTop('weapons')).toBe(440); expect(PEW_ROW_H).toBe(40);
    expect(weaponCard('laser').y).toBe(486); expect(weaponCard('torpedo').y).toBe(486);   // 440 + 6 + 40
  });
  it('shows PEW and three pips with their fills', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ pew: [1, 0.5, 0] }))));
    expect(texts()).toContain('PEW');
    expect(Array.from(document.querySelectorAll('[data-ui-pew-pip]')).map((e) => (e as HTMLElement).dataset.uiPewFill)).toEqual(['1.00', '0.50', '0.00']);
  });
  it('names a refused click PEW: NO CHARGE under the cards', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({ pew: [0, 0, 0], refused: { control: 'pew', reason: 'NO CHARGE', flash: true } }))));
    expect(texts()).toContain('PEW: NO CHARGE');
  });
  it('without the pew, no PEW row', () => {
    const { duel } = mount();
    act(() => duel.frame(view(weapons({}))));
    expect(texts()).not.toContain('PEW');
    expect(document.querySelectorAll('[data-ui-pew-pip]')).toHaveLength(0);
  });
});

describe('the pew\'s sound (spec §1)', () => {
  it('fires with sfx.pew (two laserSmall files the crew laser no longer rotates through); hits use the hit sounds', () => {
    expect(SFX.pew).toEqual({ pack: 'sci', stem: 'laserSmall', numbers: [3, 4] });
    expect(SFX.laserSmall.numbers).toEqual([0, 1, 2]);
    const pan = () => 0.25;
    expect(duelEventSounds([{ kind: 'pewFire', ship: 0, x: 0, y: 0 }], pan).sounds).toEqual([{ key: 'pew', gain: 0.55, rate: 1.5, dur: 0.18, pan: 0.25 }]);
    expect(duelEventSounds([{ kind: 'pewHit', ship: 1, owner: 0, stripped: true, hull: false, x: 0, y: 0 }], pan).sounds.map((s) => s.key)).toEqual(['forceField']);
    expect(duelEventSounds([{ kind: 'pewHit', ship: 1, owner: 0, stripped: false, hull: true, x: 0, y: 0 }], pan).sounds.map((s) => s.key)).toEqual(['impactMetal']);
  });
});
