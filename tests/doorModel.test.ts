import { describe, it, expect } from 'vitest';
import { doorPicture, doorLook, panelWidth, PANEL_THICK, PANEL_STROKE, BAND, type DoorLook, type DoorPicture, type DoorRect } from '../src/renderer/src/render/doorModel';
import { ROLE } from '../src/renderer/src/render/palette';
import { DoorState } from '../src/renderer/src/sim/grid';
import { TILE_PX } from '../src/shared/resolution';
import { onGrid, strokeBand } from './helpers/artGrid';

const rects = (p: DoorPicture): DoorRect[] => [p.gap, p.floor, p.seam, p.bar, ...p.jambs, ...p.panels, ...p.ticks, ...p.stripes].filter((r): r is DoorRect => !!r);

/** FTL-style doors (spec Demo-x-c section 2), on the art-pixel grid (Art-i spec section 4). */
describe('the door drawing model', () => {
  it('maps the sim states to looks', () => {
    expect([DoorState.Closed, DoorState.Open, DoorState.Sealed, DoorState.HeldOpen].map(doorLook)).toEqual(['closed', 'open', 'sealed', 'held']);
  });
  it('closed: two panels 12 thick meet in the middle of the gap, with a 2-wide seam at the right panel edge and a dark outline', () => {
    const p = doorPicture('closed', 0, 'x');
    expect(PANEL_THICK).toBe(12); expect(BAND).toBe(10); expect(PANEL_THICK + 2 * BAND).toBe(TILE_PX);
    expect(p.panels).toEqual([{ x: 0, y: BAND, w: 16, h: PANEL_THICK }, { x: 16, y: BAND, w: 16, h: PANEL_THICK }]);
    expect(p.fill).toBe(ROLE.doorFill); expect(p.outline).toBe(ROLE.doorOutline);
    expect(p.seam).toEqual({ x: 16, y: BAND, w: 2, h: PANEL_THICK }); expect(p.bar).toBeNull(); expect(p.ticks).toEqual([]);
    expect(p.floor).toEqual({ x: 0, y: 0, w: TILE_PX, h: TILE_PX });   // the doorway is a gap in the wall: floor under the panels
    expect(p.jambs).toEqual([{ x: 0, y: 8, w: 2, h: 16 }, { x: 30, y: 8, w: 2, h: 16 }]);
  });
  it('opening: the panels slide apart into the walls by the animation progress, in whole art pixels; open: none left', () => {
    const half = doorPicture('open', 0.5, 'x');
    expect(half.panels).toEqual([{ x: 0, y: BAND, w: 8, h: PANEL_THICK }, { x: 24, y: BAND, w: 8, h: PANEL_THICK }]); expect(half.seam).toBeNull();
    expect(doorPicture('open', 1, 'x').panels).toEqual([]);
    expect(doorPicture('closed', 0.25, 'x').panels[0]!.w).toBe(12);   // closing runs the same slide back
    expect(doorPicture('open', 1, 'x').jambs).toHaveLength(2);         // the frame stays
    expect([0, 0.1, 0.13, 0.5, 0.94, 0.95, 1].map(panelWidth)).toEqual([16, 14, 14, 8, 0, 0, 0]);
  });
  it('sealed: the sealed role colour, closed whatever the progress, a short bar across the seam', () => {
    const p = doorPicture('sealed', 0.7, 'x');
    expect(p.fill).toBe(ROLE.doorSealed); expect(p.panels.map((r) => r.w)).toEqual([16, 16]);
    expect(p.bar).toEqual({ x: 10, y: 14, w: 12, h: 4 });
  });
  it('held open: the panels retracted and a tick on each side of the frame', () => {
    const p = doorPicture('held', 1, 'x');
    expect(p.panels).toEqual([]); expect(p.ticks).toEqual([{ x: 2, y: 8, w: 2, h: 16 }, { x: 28, y: 8, w: 2, h: 16 }]); expect(p.fill).toBe(ROLE.doorFill);
    expect(doorPicture('open', 1, 'x').ticks).toEqual([]);
  });
  it('a wall running up and down turns the picture: the panels slide vertically', () => {
    const p = doorPicture('closed', 0, 'y');
    expect(p.panels).toEqual([{ x: BAND, y: 0, w: PANEL_THICK, h: 16 }, { x: BAND, y: 16, w: PANEL_THICK, h: 16 }]);
    expect(p.seam).toEqual({ x: BAND, y: 16, w: PANEL_THICK, h: 2 });
  });
  it('airlocks: the same panels with dark stripes, no floor, space showing through as they open', () => {
    const c = doorPicture('closed', 0, 'x', true);
    expect(c.floor).toBeNull(); expect(c.gap).toBeNull(); expect(c.stripes.length).toBeGreaterThan(0);
    for (const s of c.stripes) expect(c.panels.some((r) => s.x >= r.x && s.x + s.w <= r.x + r.w)).toBe(true);
    const o = doorPicture('open', 1, 'x', true);
    expect(o.gap).toEqual({ x: 0, y: BAND, w: TILE_PX, h: PANEL_THICK }); expect(o.panels).toEqual([]); expect(o.stripes).toEqual([]);
  });
  it('every rectangle and every panel outline band is on the art-pixel grid, over progress 0 to 1 in steps of 0.01, each look, both slides, doors and airlocks', () => {
    const looks: DoorLook[] = ['closed', 'open', 'sealed', 'held'];
    for (const look of looks) for (const slide of ['x', 'y'] as const) for (const airlock of [false, true]) for (let k = 0; k <= 100; k++) {
      const p = doorPicture(look, k / 100, slide, airlock), at = `${look} ${slide} ${airlock ? 'airlock' : 'door'} ${k / 100}`;
      for (const r of rects(p)) expect(onGrid(r), `${at} ${JSON.stringify(r)}`).toBe(true);
      for (const r of p.panels) { const b = strokeBand(r, PANEL_STROKE, 1); expect(onGrid(b.outer) && onGrid(b.inner), `${at} stroke ${JSON.stringify(r)}`).toBe(true); }
    }
  });
});
