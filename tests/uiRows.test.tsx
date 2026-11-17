// @vitest-environment jsdom
// Rows and cell rows (hud.ts's fillRow and cellRow): parts laid out by the font's advances, glyphs and icons only when
// the cache has them, and the cell, heat, status and column rules.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { rowLayout } from '../src/renderer/src/ui/stage/rowLayout';
import { Row } from '../src/renderer/src/ui/stage/Row';
import { CellRow } from '../src/renderer/src/ui/stage/CellRow';
import { Icon } from '../src/renderer/src/ui/stage/Icon';
import { ImagesContext } from '../src/renderer/src/ui/stage/ImagesContext';
import { UiContext } from '../src/renderer/src/ui/context';
import { textPx, ROW_GAP, ROW_GLYPH, TEXT, DIM, AMBER, BAR_ON, BAR_OFF, BAR_FAIL } from '../src/renderer/src/render/theme';
import { CARD_ROW, POWER_ROW } from '../src/renderer/src/render/hudLayout';
import { hex } from '../src/renderer/src/ui/stage/color';
import { makeUi } from './helpers/uiStore';

afterEach(cleanup);
const images = new Map([['prompt.kb.E', { url: 'data:e', w: 16, h: 16 }], ['icon.fire', { url: 'data:f', w: 16, h: 16 }], ['glyph.weapons', { url: 'data:w', w: 20, h: 20 }]]);
function mount(node: ReactNode) { const ui = makeUi(); return render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><ImagesContext.Provider value={images}>{node}</ImagesContext.Provider></UiContext.Provider>); }
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => ({ text: c.dataset.text!, x: Number(c.dataset.x), y: Number(c.dataset.y) }));

describe('rowLayout', () => {
  it('advances by glyph, icon, ceil(text) and the gap, skipping empty parts and absent images', () => {
    const has = (n: string) => images.has(n);
    const r = rowLayout([{ glyph: 'prompt.kb.E', icon: 'icon.fire', text: 'Repair' }, { text: '' }, { glyph: 'prompt.kb.Q', text: 'Cancel', tint: DIM }], has);
    expect(r.items).toEqual([
      { glyph: { name: 'prompt.kb.E', x: 0 }, icon: { name: 'icon.fire', x: ROW_GLYPH }, text: { text: 'Repair', x: 2 * ROW_GLYPH, tint: TEXT } },
      { text: { text: 'Cancel', x: 2 * ROW_GLYPH + Math.ceil(textPx('Repair')) + ROW_GAP, tint: DIM } }
    ]);
    expect(r.width).toBe(2 * ROW_GLYPH + Math.ceil(textPx('Repair')) + ROW_GAP + Math.ceil(textPx('Cancel')));
  });
});

describe('Row and Icon', () => {
  it('places text at row-relative x and images at y + 7', () => {
    mount(<Row x={100} y={50} parts={[{ glyph: 'prompt.kb.E', text: 'Sit' }]} />);
    expect(texts()).toEqual([{ text: 'Sit', x: 100 + ROW_GLYPH, y: 50 }]);
    expect(document.querySelector('[data-ui-image="prompt.kb.E"]')).not.toBeNull();
  });
  it('draws nothing for a missing image', () => { mount(<Icon name="icon.none" x={0} y={0} />); expect(document.querySelector('[data-ui-image]')).toBeNull(); });
});

describe('CellRow', () => {
  const cells = () => Array.from(document.querySelectorAll('[data-ui-cell]')).map((e) => e.getAttribute('data-ui-cell'));   // the fill colour, as hex(); CSSOM would serialise style colours as rgb()
  it('fills on, off, overdrive and failed cells as cellRow did', () => {
    mount(<CellRow x={0} y={0} c={CARD_ROW} o={{ name: 'Wpn', level: 3, max: 2, status: '', cursor: false, tint: TEXT }} />);
    expect(cells()).toEqual([hex(BAR_ON), hex(BAR_ON), hex(AMBER)]);
    cleanup(); mount(<CellRow x={0} y={0} c={CARD_ROW} o={{ name: 'Wpn', level: 1, max: 3, status: 'OFF', cursor: false, tint: TEXT }} />);
    expect(cells()).toEqual([hex(BAR_ON), hex(BAR_OFF), hex(BAR_OFF)]); expect(texts().find((t) => t.text === 'OFF')).toMatchObject({ x: CARD_ROW.statusX });
    cleanup(); mount(<CellRow x={0} y={0} c={CARD_ROW} o={{ name: 'Wpn', level: 2, max: 2, status: 'FAIL', failed: true, cursor: true, tint: AMBER, heat: 0.5, coolant: 2 }} />);
    expect(cells()).toEqual([hex(BAR_FAIL), hex(BAR_FAIL)]); expect(document.querySelector('[data-ui-select]')).not.toBeNull();
    expect(texts().find((t) => t.text === 'C2')).toMatchObject({ x: CARD_ROW.coolantX });
    const heatFill = document.querySelector('[data-ui-bar-fill]') as HTMLElement; expect(heatFill).not.toBeNull();
  });
  it('draws the station glyph on the power panel and the Upgrades page columns', () => {
    mount(<CellRow x={0} y={0} c={POWER_ROW} o={{ icon: 'weapons', iconTint: 'failed', name: 'Wpn', level: 0, max: 0, status: '', cursor: false, tint: TEXT }} />);
    expect(document.querySelector('[data-ui-image="glyph.weapons"]')).not.toBeNull();
    cleanup(); mount(<CellRow x={0} y={0} c={CARD_ROW} o={{ name: 'Reactor', level: 0, max: 0, status: '', cursor: false, tint: TEXT, cols: ['2/4', '30'] }} />);
    expect(texts().map((t) => t.text)).toEqual(['Reactor', '2/4', '30']);
  });
});
