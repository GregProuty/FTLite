// @vitest-environment jsdom
// Duel polish i spec §E: the ship HUD renders on the SHIP view only, with the hull segments, the shield layers and the
// system columns from a fixture, placed by the layout.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { HUD, hullSegX, sysColumnX, type ShipHudView } from '../src/renderer/src/render/duel/shipHudModel';
import { boxCss } from '../src/renderer/src/ui/stage/geometry';
import { TEXT } from '../src/renderer/src/render/theme';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => ({ text: c.dataset.text!, x: Number(c.dataset.x), y: Number(c.dataset.y) }));
const find = (t: string) => texts().find((c) => c.text === t);
const all = (attr: string, v?: string) => Array.from(document.querySelectorAll<HTMLElement>(v === undefined ? `[${attr}]` : `[${attr}="${v}"]`));
const shipConsole: ConsoleView = { station: 'ship', tabs: { helm: 'open', weapons: 'locked', science: 'locked', ship: 'current' }, tabActions: { helm: 'interact', weapons: null, science: null, ship: null }, helm: null, weapons: null, science: null, side: null };
const helmConsole: ConsoleView = { ...shipConsole, station: 'helm', tabs: { helm: 'current', weapons: 'locked', science: 'locked', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' },
  helm: { heading: 0, speed: 0, held: NO_HELD_FLAGS, throttle: 0 } };
const hud: ShipHudView = {
  hull: { segments: 20, lit: 7, tone: 'warn' },
  shields: { layers: 2, up: 1 },
  systems: [
    { key: 'helm', name: 'HELM', bars: 2, lit: 2, damaged: 0, look: 'normal' },
    { key: 'weapons', name: 'WEAP', bars: 2, lit: 0, damaged: 2, look: 'offline' },
    { key: 'shields', name: 'SHLD', bars: 2, lit: 1, damaged: 1, look: 'normal' },
    { key: 'medbay', name: 'MED', bars: 1, lit: 0, damaged: 0, look: 'dim' }
  ]
};
const view = (console: ConsoleView | null, h: ShipHudView | null = hud): DuelUiView => ({
  readout: { rows: [{ label: 'CREW', value: '2', labelTint: TEXT, valueTint: TEXT }], help: [] }, end: null,
  banners: { interior: null, tactical: null, notice: null }, overlay: null, crt: false, console, hud: h });
function mount() {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { ...ui, duel };
}

describe('the ship HUD (spec §E)', () => {
  it('on the SHIP view: the hull label and 20 segments (7 lit, amber), the shield squares and four system columns', () => {
    const { duel, store } = mount(); act(() => duel.frame(view(shipConsole)));
    expect(find('HULL')).toMatchObject({ x: HUD.x, y: HUD.hull.labelY });
    expect(find('SHIELDS')).toBeDefined();
    expect(all('data-ui-hud-seg')).toHaveLength(20);
    expect(all('data-ui-hud-seg', 'lit')).toHaveLength(7);
    expect(all('data-ui-hud-seg')[0]!.getAttribute('data-ui-hud-tone')).toBe('warn');
    const l = store.getState().layout, seg = all('data-ui-hud-seg')[19]!, want = boxCss(hullSegX(19), HUD.hull.barY, HUD.hull.segW, HUD.hull.segH, l);
    expect([seg.style.left, seg.style.top]).toEqual([`${want.left}px`, `${want.top}px`]);
    expect(all('data-ui-hud-shield').map((e) => e.getAttribute('data-ui-hud-shield'))).toEqual(['up', 'down']);
    expect(all('data-ui-hud-sys').map((e) => [e.getAttribute('data-ui-hud-sys'), e.getAttribute('data-ui-hud-look')]))
      .toEqual([['helm', 'normal'], ['weapons', 'offline'], ['shields', 'normal'], ['medbay', 'dim']]);
    expect(all('data-ui-hud-sys').every((e) => e.querySelector('svg') !== null)).toBe(true);
    expect(texts().filter((c) => c.y === HUD.sys.bottom - HUD.sys.nameH).map((c) => [c.text, c.x])).toEqual(['HELM', 'WEAP', 'SHLD', 'MED'].map((t, n) => [t, sysColumnX(n) + HUD.sys.colW / 2]));
    expect(all('data-ui-hud-bar').map((e) => e.getAttribute('data-ui-hud-bar')))
      .toEqual(['lit', 'lit', 'damaged', 'damaged', 'lit', 'damaged', 'off']);
    expect(document.querySelectorAll('[data-ui-hud-bar] button, [data-ui-hud-sys] button')).toHaveLength(0);   // no clicks
  });
  it('drawn whenever the frame carries a HUD (the scene sends one on the SHIP view only, paused included), never without one', () => {
    const { duel } = mount();
    act(() => duel.frame(view(helmConsole, null))); expect(all('data-ui-hud-seg')).toHaveLength(0);
    act(() => duel.frame(view(null))); expect(all('data-ui-hud-seg')).toHaveLength(20);   // paused on the SHIP view: no console, the HUD stays
    act(() => duel.frame(view(shipConsole, null))); expect(all('data-ui-hud-seg')).toHaveLength(0);
    act(() => duel.frame(view(shipConsole))); expect(all('data-ui-hud-seg')).toHaveLength(20);
  });
  it('an equal HUD in the next frame keeps the stored view (replaceEqualDeep), so React does not re-render', () => {
    const { duel, store } = mount(); act(() => duel.frame(view(shipConsole)));
    const before = store.getState().duel!.hud;
    act(() => duel.frame(view(shipConsole, JSON.parse(JSON.stringify(hud)) as ShipHudView)));
    expect(store.getState().duel!.hud).toBe(before);
  });
});
