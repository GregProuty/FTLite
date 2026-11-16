import { describe, it, expect } from 'vitest';
import { floorSeams, houseFloorName, wallPicture, type Cell } from '../src/renderer/src/render/wallModel';
import { BAND, PANEL_THICK } from '../src/renderer/src/render/doorModel';
import { TILE_PX } from '../src/shared/resolution';
import { onGrid } from './helpers/artGrid';

const CELLS: Cell[] = ['wall', 'door', 'floor', 'space'];
const inside = (r: { x: number; y: number; w: number; h: number }, o: { x: number; y: number; w: number; h: number }): boolean => r.x >= o.x && r.y >= o.y && r.x + r.w <= o.x + o.w && r.y + r.h <= o.y + o.h;

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

describe('wallModel: light from the top-left (Art-i spec section 4)', () => {
  it('a straight left-right wall: a light edge along the whole top, a shadow edge along the whole bottom, none on the joined ends', () => {
    const p = wallPicture('space', 'wall', 'floor', 'wall');
    expect(p.light).toEqual([{ x: 0, y: 10, w: 10, h: 2 }, { x: 10, y: 10, w: 12, h: 2 }, { x: 22, y: 10, w: 10, h: 2 }]);
    expect(p.shadow).toEqual([{ x: 0, y: 20, w: 10, h: 2 }, { x: 10, y: 20, w: 12, h: 2 }, { x: 22, y: 20, w: 10, h: 2 }]);
  });
  it('an isolated hub: light on its top and left, shadow on its bottom and right', () => {
    const p = wallPicture('space', 'space', 'space', 'space');
    expect(p.light).toEqual([{ x: 10, y: 10, w: 12, h: 2 }, { x: 10, y: 10, w: 2, h: 12 }]);
    expect(p.shadow).toEqual([{ x: 10, y: 20, w: 12, h: 2 }, { x: 20, y: 10, w: 2, h: 12 }]);
  });
  it('a cross: no hub face is exposed, each arm keeps its own faces', () => {
    const p = wallPicture('wall', 'wall', 'wall', 'wall');
    expect(p.light).toEqual([{ x: 0, y: 10, w: 10, h: 2 }, { x: 22, y: 10, w: 10, h: 2 }, { x: 10, y: 0, w: 2, h: 10 }, { x: 10, y: 22, w: 2, h: 10 }]);
    expect(p.shadow).toEqual([{ x: 0, y: 20, w: 10, h: 2 }, { x: 22, y: 20, w: 10, h: 2 }, { x: 20, y: 0, w: 2, h: 10 }, { x: 20, y: 22, w: 2, h: 10 }]);
  });
  it('for every neighbourhood, every floor, band, light and shadow rectangle is on the art-pixel grid, and every edge lies on the band', () => {
    for (const n of CELLS) for (const e of CELLS) for (const s of CELLS) for (const w of CELLS) for (const diag of CELLS) {
      const p = wallPicture(n, e, s, w, diag, diag, diag, diag);
      for (const r of [...p.floor, ...p.band, ...p.light, ...p.shadow]) expect(onGrid(r), `${n}${e}${s}${w}${diag} ${JSON.stringify(r)}`).toBe(true);
      for (const r of [...p.light, ...p.shadow]) expect(p.band.some((b) => inside(r, b)), `${n}${e}${s}${w} edge ${JSON.stringify(r)} on the band`).toBe(true);
    }
  });
});

describe('floor seams and the floor art hook (Art-i spec section 4)', () => {
  it('one art pixel along the top and left of the tile, on the grid', () => {
    expect(floorSeams()).toEqual([{ x: 0, y: 0, w: TILE_PX, h: 2 }, { x: 0, y: 2, w: 2, h: TILE_PX - 2 }]);
    for (const r of floorSeams()) expect(onGrid(r)).toBe(true);
  });
  it('picks house.floor.0 to 3 by a stable hash of the tile index, using all four', () => {
    const names = Array.from({ length: 64 }, (_, t) => houseFloorName(t));
    expect(new Set(names)).toEqual(new Set(['house.floor.0', 'house.floor.1', 'house.floor.2', 'house.floor.3']));
    expect(houseFloorName(17)).toBe(houseFloorName(17));
  });
});
