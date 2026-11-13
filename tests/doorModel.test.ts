import { describe, it, expect } from 'vitest';
import { doorPicture, doorLook, DOOR_FILL, SEALED_FILL, DOOR_OUTLINE, PANEL_THICK, BAND } from '../src/renderer/src/render/doorModel';
import { DoorState } from '../src/renderer/src/sim/grid';
import { TILE_PX } from '../src/shared/resolution';

/** FTL-style doors (spec Demo-x-c section 2). */
describe('the door drawing model', () => {
  it('maps the sim states to looks', () => {
    expect([DoorState.Closed, DoorState.Open, DoorState.Sealed, DoorState.HeldOpen].map(doorLook)).toEqual(['closed', 'open', 'sealed', 'held']);
  });
  it('closed: two amber panels a third of a tile thick meet in the middle of the gap, with a slim seam and a dark outline', () => {
    const p = doorPicture('closed', 0, 'x');
    expect(PANEL_THICK).toBe(Math.round(TILE_PX / 3)); expect(BAND).toBe(Math.floor((TILE_PX - PANEL_THICK) / 2));
    expect(p.panels).toEqual([{ x: 0, y: BAND, w: 16, h: PANEL_THICK }, { x: 16, y: BAND, w: 16, h: PANEL_THICK }]);
    expect(p.fill).toBe(DOOR_FILL); expect(p.outline).toBe(DOOR_OUTLINE);
    expect(p.seam).toEqual({ x: 15, y: BAND, w: 2, h: PANEL_THICK }); expect(p.bar).toBeNull(); expect(p.ticks).toEqual([]);
    expect(p.floor).toEqual({ x: 0, y: 0, w: TILE_PX, h: TILE_PX });   // the doorway is a gap in the wall: floor under the panels
  });
  it('opening: the panels slide apart into the walls by the animation progress; open: none left', () => {
    const half = doorPicture('open', 0.5, 'x');
    expect(half.panels).toEqual([{ x: 0, y: BAND, w: 8, h: PANEL_THICK }, { x: 24, y: BAND, w: 8, h: PANEL_THICK }]); expect(half.seam).toBeNull();
    expect(doorPicture('open', 1, 'x').panels).toEqual([]);
    expect(doorPicture('closed', 0.25, 'x').panels[0]!.w).toBe(12);   // closing runs the same slide back
    expect(doorPicture('open', 1, 'x').jambs).toHaveLength(2);         // the frame stays
  });
  it('sealed: red-orange, closed whatever the progress, a short bar across the seam', () => {
    const p = doorPicture('sealed', 0.7, 'x');
    expect(p.fill).toBe(SEALED_FILL); expect(p.panels.map((r) => r.w)).toEqual([16, 16]);
    expect(p.bar).toEqual({ x: 10, y: BAND + Math.floor(PANEL_THICK / 2) - 1, w: 12, h: 3 });
  });
  it('held open: the panels retracted and an amber tick on each side of the frame', () => {
    const p = doorPicture('held', 1, 'x');
    expect(p.panels).toEqual([]); expect(p.ticks).toHaveLength(2); expect(p.fill).toBe(DOOR_FILL);
    expect(doorPicture('open', 1, 'x').ticks).toEqual([]);
  });
  it('a wall running up and down turns the picture: the panels slide vertically', () => {
    const p = doorPicture('closed', 0, 'y');
    expect(p.panels).toEqual([{ x: BAND, y: 0, w: PANEL_THICK, h: 16 }, { x: BAND, y: 16, w: PANEL_THICK, h: 16 }]);
    expect(p.seam).toEqual({ x: BAND, y: 15, w: PANEL_THICK, h: 2 });
  });
  it('airlocks: the same panels with dark stripes, no floor, space showing through as they open', () => {
    const c = doorPicture('closed', 0, 'x', true);
    expect(c.floor).toBeNull(); expect(c.gap).toBeNull(); expect(c.stripes.length).toBeGreaterThan(0);
    for (const s of c.stripes) expect(c.panels.some((r) => s.x >= r.x && s.x + s.w <= r.x + r.w)).toBe(true);
    const o = doorPicture('open', 1, 'x', true);
    expect(o.gap).toEqual({ x: 0, y: BAND, w: TILE_PX, h: PANEL_THICK }); expect(o.panels).toEqual([]); expect(o.stripes).toEqual([]);
  });
});
