// @vitest-environment jsdom
// The duel and flight regions (React UI spec §6): today's Pixi panels' strings, positions and tints from the views, and
// the render rule (a region only while its slice is set; a throwing region leaves the menu).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memo } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { UiContext, useUi } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink, createFlightSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';
import { READOUT_COLUMN } from '../src/renderer/src/render/duel/interiorModel';
import { READOUT_MARGIN, READOUT_W } from '../src/renderer/src/render/duel/readoutModel';
import { AMBER, LINE, PAD, TEXT } from '../src/renderer/src/render/theme';
import { FEEL_PANEL_MARGIN, FEEL_PANEL_W } from '../src/renderer/src/render/tactical/feelModel';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => ({ text: c.dataset.text!, x: Number(c.dataset.x), y: Number(c.dataset.y), anchor: c.dataset.anchorx }));
const find = (t: string) => texts().find((c) => c.text === t);
const banners = { interior: null, tactical: null, notice: null };
const view = (patch: Partial<DuelUiView> = {}): DuelUiView => ({
  readout: { rows: [{ label: 'HULL', value: '10/10', labelTint: TEXT, valueTint: TEXT, pips: { n: 2, max: 3, colour: 0x7cc4ff }, bar: { fill: 0.5, colour: AMBER } }], help: ['TAB  SWITCH'] },
  end: null, banners, overlay: null, ...patch });
function mount(menu = false) {
  const ui = makeUi(); const duel = createDuelSink(ui.store), flight = createFlightSink(ui.store);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={menu} /></UiContext.Provider>);
  return { ...ui, duel, flight };
}

describe('the render rule', () => {
  it('shows the duel region only while its slice is set', () => {
    const { duel } = mount();
    expect(document.querySelector('[data-ui-stage]')).toBeNull();
    act(() => duel.frame(view())); expect(find('HULL')).toBeDefined();
    act(() => duel.clear()); expect(find('HULL')).toBeUndefined();
  });
  it('a throwing duel region leaves the menu mounted', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { duel } = mount(true);
    act(() => duel.frame(view({ readout: null as never })));
    expect(document.querySelector('[data-testid="session-menu"]')).not.toBeNull(); expect(find('HULL')).toBeUndefined();
  });
});

describe('the readout panel', () => {
  it('places labels, right-anchored values and help as readoutPanel.ts did', () => {
    const { duel } = mount(); act(() => duel.frame(view()));
    const X = INTERNAL_W - READOUT_W - READOUT_MARGIN, Y = READOUT_MARGIN;
    expect(find('HULL')).toMatchObject({ x: X + PAD, y: Y + PAD - 6 });
    expect(find('10/10')).toMatchObject({ x: X + READOUT_W - PAD, y: Y + PAD - 6, anchor: '1' });
    expect(find('TAB  SWITCH')).toMatchObject({ x: X + PAD, y: Y + PAD + LINE + PAD });
    expect(document.querySelectorAll('[data-ui-pip]').length).toBe(3); expect(document.querySelectorAll('[data-ui-pip="lit"]').length).toBe(2);
    expect(document.querySelector('[data-ui-bar-fill]')).not.toBeNull();
  });
});

describe('the end card, banners and map overlay', () => {
  it('centres the end card lines', () => {
    const { duel } = mount(); act(() => duel.frame(view({ end: { title: 'VICTORY', tint: 0x8fe06a, length: 'DUEL LENGTH 1:23', prompt: 'ENTER: REMATCH' } })));
    const top = (INTERNAL_H - 200) / 2;
    expect(find('VICTORY')).toMatchObject({ x: INTERNAL_W / 2, y: top + 24, anchor: '0.5' });
    expect(find('DUEL LENGTH 1:23')).toMatchObject({ y: top + 96 }); expect(find('ENTER: REMATCH')).toMatchObject({ y: top + 140 });
  });
  it('places the three banners', () => {
    const { duel } = mount(); act(() => duel.frame(view({ banners: { interior: 'I', tactical: 'T', notice: 'YOU: HELM' } })));
    expect(find('I')).toMatchObject({ x: (INTERNAL_W - READOUT_COLUMN) / 2, y: 80 });
    expect(find('T')).toMatchObject({ x: INTERNAL_W / 2, y: INTERNAL_H / 2 - 80 });
    expect(find('YOU: HELM')).toMatchObject({ x: (INTERNAL_W - READOUT_COLUMN) / 2, y: 130 });
  });
  it('draws the zoom text, scale label and snap hint where the tactical layer did', () => {
    const { duel } = mount(); act(() => duel.frame(view({ overlay: { zoomText: 'ZOOM 0.50', scaleBar: { px: 80, units: 500 }, snapHint: true } })));
    expect(find('ZOOM 0.50')).toMatchObject({ x: 16, y: INTERNAL_H - 64 });
    expect(find('500 u')).toMatchObject({ x: 16 + 80 + 8, y: INTERNAL_H - 36 });
    expect(find('C: SNAP BACK')).toMatchObject({ x: INTERNAL_W / 2, y: INTERNAL_H - 12, anchor: '0.5' });
    expect(document.querySelectorAll('[data-ui-scalebar]').length).toBe(3);
  });
});

describe('the flight region', () => {
  it('draws the feel panel with its title, rows and help', () => {
    const { flight } = mount(); act(() => flight.frame({ feel: [['SPEED', '12 u/s']], banners: { ...banners, tactical: 'PAUSED   ESC: RESUME' }, overlay: null }));
    const X = INTERNAL_W - FEEL_PANEL_W - FEEL_PANEL_MARGIN, Y = FEEL_PANEL_MARGIN;
    expect(find('FLIGHT FEEL')).toMatchObject({ x: X + PAD, y: Y + PAD - 6 });
    expect(find('SPEED')).toMatchObject({ x: X + PAD, y: Y + PAD - 6 + LINE }); expect(find('12 u/s')).toMatchObject({ x: X + FEEL_PANEL_W - PAD, anchor: '1' });
    expect(find('W/S  THRUST / REVERSE')).toBeDefined(); expect(find('PAUSED   ESC: RESUME')).toBeDefined();
  });
});

describe('sharing keeps unchanged panels from re-rendering (spec §8)', () => {
  it('a view whose only change is a readout value leaves the memoised overlay, banners and end props unchanged', () => {
    const ui = makeUi(), sink = createDuelSink(ui.store), seen = { overlay: vi.fn(), banners: vi.fn(), end: vi.fn() };
    const Overlay = memo(function Overlay(_: { o: unknown }) { seen.overlay(); return null; });
    const Lines = memo(function Lines(_: { b: unknown }) { seen.banners(); return null; });
    const End = memo(function End(_: { e: unknown }) { seen.end(); return null; });
    function Harness() { const d = useUi((s) => s.duel); return d ? <><Overlay o={d.overlay} /><Lines b={d.banners} /><End e={d.end} /></> : null; }
    render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><Harness /></UiContext.Provider>);
    const overlay = { zoomText: 'ZOOM 1.00', scaleBar: { px: 80, units: 500 }, snapHint: false };
    const end = { title: 'VICTORY', tint: 1, length: 'DUEL LENGTH 0:01', prompt: 'ENTER: REMATCH' };
    const changed = { rows: [{ label: 'HULL', value: '9/10', labelTint: TEXT, valueTint: TEXT }], help: ['TAB  SWITCH'] };
    act(() => sink.frame(view({ overlay, end })));
    act(() => sink.frame(view({ overlay: { ...overlay }, end: { ...end }, banners: { ...banners }, readout: changed })));
    expect(seen.overlay).toHaveBeenCalledTimes(1); expect(seen.banners).toHaveBeenCalledTimes(1); expect(seen.end).toHaveBeenCalledTimes(1);
    let commits = 0; const off = ui.store.subscribe(() => { commits++; });
    act(() => sink.frame(view({ overlay: { ...overlay }, end: { ...end }, banners: { ...banners }, readout: { ...changed } })));
    expect(commits).toBe(0); off();
  });
});
