// The bezel never covers an edge-anchored placement (CRT map spec section 3): the grid column and row labels, the
// off-screen arrows and their labels, the Weapons info line, and the React overlays (the readout, the zoom text, the scale
// bar, the snap hint, the flight feel panel). Text is checked by its ink box: m5x7 at native size inks rows +4..+13 of a
// 16-px cell (the caps from +4, descenders to +13), at FONT_SIZE twice that (+8..+26). World-anchored labels (the bearing
// ring, the lock) are clipped by the bezel as by the screen edge and are not checked.
import { describe, expect, it } from 'vitest';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';
import { insideBezel } from '../src/renderer/src/render/crt';
import { READOUT_COLUMN } from '../src/renderer/src/render/duel/interiorModel';
import { READOUT_MARGIN, READOUT_ROWS, READOUT_W } from '../src/renderer/src/render/duel/readoutModel';
import { FONT_NATIVE, FONT_SIZE, LINE, PAD, textPx } from '../src/renderer/src/render/theme';
import { createCamera, pan, type Camera } from '../src/renderer/src/render/tactical/camera';
import { createFx } from '../src/renderer/src/render/tactical/fxModel';
import { FEEL_PANEL_H, FEEL_PANEL_MARGIN, FEEL_PANEL_W } from '../src/renderer/src/render/tactical/feelModel';
import { SCALE_BAR_MAX_PX, tacticalModel } from '../src/renderer/src/render/tactical/tacticalModel';
import { combatModel } from '../src/renderer/src/render/tactical/weaponsModel';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { BX, BY, SNAP_Y, ZOOM_Y } from '../src/renderer/src/ui/duel/MapOverlay';

const vp = { w: INTERNAL_W, h: INTERNAL_H };
interface Rect { what: string; x: number; y: number; w: number; h: number }
/** A text's ink box from its anchor point (native size or FONT_SIZE). */
const ink = (what: string, text: string, x: number, y: number, ax: number, ay: number, size = FONT_NATIVE): Rect => {
  const k = size / FONT_NATIVE, w = textPx(text, k), left = x - ax * w, top = y - ay * 16 * k;
  return { what: `${what} "${text}"`, x: left, y: top + 4 * k, w, h: 9 * k };
};
const expectInside = (rects: readonly Rect[]): void => { for (const r of rects) expect(insideBezel(r.x, r.y, r.w, r.h, INTERNAL_W, INTERNAL_H), `${r.what} at ${r.x},${r.y} ${r.w}x${r.h}`).toBe(true); };

/** Cameras that put grid labels on the top and left screen edges and arrows on every edge. */
function cameras(x: number, y: number): Camera[] {
  const out: Camera[] = [];
  for (const zoom of [0.12, 0.3, 0.5, 0.9, 1.2]) {
    out.push(createCamera(x, y, zoom));
    for (const [dx, dy] of [[4000, 0], [-4000, 0], [0, 3000], [0, -3000], [3000, 3000], [-3000, -2500]] as const) { const c = createCamera(x, y, zoom); pan(c, dx, dy); out.push(c); }
  }
  return out;
}

describe('every edge-anchored placement lies inside the bezel (CRT map spec section 3)', () => {
  it('the grid labels, the off-screen arrows and their labels, the Weapons info line', () => {
    const state = createTacticalState(9), s = state.ships[0];
    state.ships[1].x = s.x + 600; state.ships[1].y = s.y - 300;
    let checked = 0;
    for (const camera of cameras(s.x, s.y)) for (const console of ['helm', 'weapons'] as const) {
      const input = { state, prev: [], alpha: 1, camera, viewport: vp, console, axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: READOUT_COLUMN, spreadArrows: true, missilePrev: [], steer: 0, fx: createFx() };
      const d = tacticalModel(input), c = combatModel(input), rects: Rect[] = [];
      for (const l of d.grid.columns) rects.push(ink('column', l.text, Math.round(l.x), Math.round(l.y), 0.5, 0));
      for (const l of d.grid.rows) rects.push(ink('row', l.text, Math.round(l.x), Math.round(l.y), 0, 0.5));
      for (const a of d.arrows) {
        rects.push({ what: `${a.target} arrow`, x: a.x - 10, y: a.y - 10, w: 20, h: 20 });
        rects.push(ink(`${a.target} arrow label`, a.label, a.x - Math.sin(a.angle) * (textPx(a.label, 1) / 2 + 14), a.y + Math.cos(a.angle) * 18, 0.5, 0.5));
      }
      if (c.weapons) rects.push(ink('info', c.weapons.info.text, c.weapons.info.x, c.weapons.info.y, 0.5, 0, FONT_SIZE));
      expectInside(rects); checked += rects.length;
    }
    expect(checked).toBeGreaterThan(200);
  });
  it('the React overlays: the readout at its tallest, the zoom text, the scale bar and its units, the snap hint, the feel panel', () => {
    const readoutH = PAD + LINE * READOUT_ROWS + PAD + 5 * 14 + PAD, longest = 'ZOOM 0.12';
    expectInside([
      { what: 'readout panel', x: INTERNAL_W - READOUT_W - READOUT_MARGIN, y: READOUT_MARGIN, w: READOUT_W, h: readoutH },
      ink('zoom text', longest, BX, ZOOM_Y, 0, 0, FONT_SIZE),
      { what: 'scale bar', x: BX - 1, y: BY - 5, w: SCALE_BAR_MAX_PX + 2, h: 10 },
      ink('scale units', '2000 u', BX + SCALE_BAR_MAX_PX + 8, BY - 8, 0, 0),
      ink('snap hint', 'C: SNAP BACK', INTERNAL_W / 2, SNAP_Y, 0.5, 1, FONT_SIZE),
      { what: 'feel panel', x: INTERNAL_W - FEEL_PANEL_W - FEEL_PANEL_MARGIN, y: FEEL_PANEL_MARGIN, w: FEEL_PANEL_W, h: FEEL_PANEL_H }
    ]);
  });
});
