// @vitest-environment jsdom
// Own ship window spec §2, §4, §6: the component draws the panel, the header and one tile rect per room tile, takes the
// pointer, and is absent when the frame carries no ownShip.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { CREW_SLOT } from '../src/renderer/src/sim/tactical/state';
import { addShieldHit, createShieldFx } from '../src/renderer/src/render/shieldFx';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { ownShipModel, type OwnShipView } from '../src/renderer/src/render/duel/ownShipModel';
import { OWN_SHIP_BOX } from '../src/renderer/src/render/duel/consoleLayout';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const view = (ownShip: OwnShipView | null | undefined): DuelUiView => ({
  end: null, banners: { interior: null, tactical: null, notice: null, alert: null }, overlay: null, crt: true, console: null,
  ...(ownShip === undefined ? {} : { ownShip })
});
function mount(ownShip: OwnShipView | null | undefined): void {
  const ui = makeUi(), duel = createDuelSink(ui.store);
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  act(() => duel.frame(view(ownShip)));
}
const texts = () => Array.from(document.querySelectorAll('canvas')).map((e) => (e as HTMLElement).dataset.text);

describe('the own ship window (spec §2)', () => {
  it('draws the title, the header labels, one tile per room tile and a dot per crew member', () => {
    const d = createDuel(parseShip(cutter), 5);
    try {
      const v = ownShipModel(d, OWN_SHIP_BOX, 0, 0);
      mount(v);
      for (const t of ['OWN SHIP', 'SHLD', 'HULL', String(v.hull.value)]) expect(texts(), t).toContain(t);
      expect(document.querySelector('[data-ui-own-ship]')).not.toBeNull();
      expect(document.querySelector('[data-ui-own-ship-box]')).not.toBeNull();
      expect(document.querySelectorAll('[data-ui-own-tile]').length).toBe(v.tiles.length);
      expect(document.querySelectorAll('[data-ui-own-crew]').length).toBe(v.crew.length);
      expect(document.querySelector('[data-ui-own-flash]')).toBeNull();
    } finally { disposeDuel(d); }
  });
  it('draws the flash border while flash is set', () => {
    const d = createDuel(parseShip(cutter), 5);
    try { mount({ ...ownShipModel(d, OWN_SHIP_BOX, 0, 0), flash: true }); expect(document.querySelector('[data-ui-own-flash]')).not.toBeNull(); }
    finally { disposeDuel(d); }
  });
  it('draws the painting under the tiles with the amber filter (one definition), the bubble and the cells', () => {
    const d = createDuel(parseShip(hound), 5);
    try {
      const fx = createShieldFx(2); addShieldHit(fx, CREW_SLOT, 0, false, false); fx.hits[CREW_SLOT]![0]!.age = 0.01;
      mount(ownShipModel(d, OWN_SHIP_BOX, 0, 0, { painting: { url: 'hound.png', w: 2800, h: 1400 }, fx }));
      expect(document.querySelectorAll('filter#crt-amber').length).toBe(1);
      const img = document.querySelector('[data-ui-own-painting]')!;
      expect(img.getAttribute('filter')).toBe('url(#crt-amber)');
      expect(img.parentElement!.firstElementChild).toBe(img);
      expect(document.querySelector('[data-ui-own-bubble]')).not.toBeNull();
      expect(document.querySelectorAll('[data-ui-own-cell]').length).toBeGreaterThan(0);
    } finally { disposeDuel(d); }
  });
  it('renders nothing when ownShip is null or absent', () => {
    mount(null); expect(document.querySelector('[data-ui-own-ship]')).toBeNull(); cleanup();
    mount(undefined); expect(document.querySelector('[data-ui-own-ship]')).toBeNull();
  });
});
