import { describe, it, expect } from 'vitest';
import { wallPicture } from '../src/renderer/src/render/wallModel';
import { BAND, PANEL_THICK } from '../src/renderer/src/render/doorModel';
import { TILE_PX } from '../src/shared/resolution';

describe('wallModel: walls as thick as a door panel', () => {
  it('a straight hull wall: floor on the room side, space outside, a band joining the walls left and right at the door band', () => {
    const p = wallPicture('space', 'wall', 'floor', 'wall');
    expect(p.floor).toEqual([{ x: 0, y: TILE_PX / 2, w: TILE_PX, h: TILE_PX / 2 }]);
    const ys = new Set(p.band.map((r) => r.y)), hs = new Set(p.band.map((r) => r.h));
    expect([...ys]).toEqual([BAND]); expect([...hs]).toEqual([PANEL_THICK]);   // the same line and thickness as a door's panels
    expect(Math.min(...p.band.map((r) => r.x))).toBe(0); expect(Math.max(...p.band.map((r) => r.x + r.w))).toBe(TILE_PX);
  });
  it('joins a door, not a floor tile; an isolated corner has only the hub', () => {
    const p = wallPicture('door', 'floor', 'floor', 'space');
    expect(p.band).toContainEqual({ x: BAND, y: 0, w: PANEL_THICK, h: BAND });
    expect(p.band).toHaveLength(2);
    expect(wallPicture('space', 'space', 'space', 'space').band).toHaveLength(1);
  });
  it('the band is never thicker than a door panel', () => {
    const p = wallPicture('wall', 'wall', 'wall', 'wall');
    for (const r of p.band) expect(Math.min(r.w, r.h)).toBeLessThanOrEqual(PANEL_THICK);
  });
});

describe('wallModel: room corners', () => {
  it('a corner wall tile touching a room only diagonally fills that quadrant with floor', () => {
    const p = wallPicture('space', 'wall', 'wall', 'space', 'space', 'floor', 'space', 'space');
    expect(p.floor).toEqual([{ x: TILE_PX / 2, y: TILE_PX / 2, w: TILE_PX / 2, h: TILE_PX / 2 }]);
  });
});
