import { describe, it, expect } from 'vitest';
import { sliceGrid } from '../src/renderer/src/render/sheet';
import { pickVariant, wallKind, floorVariant, wallVariant } from '../src/renderer/src/render/tilePick';
import { facingFromDelta } from '../src/renderer/src/render/facing';
import { fireTiles, breachFloorNeighbour, breachOrientation, ventRotation, breachDamagedTiles } from '../src/renderer/src/render/hazardTiles';
import { featureReady, FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { FACINGS } from '../src/renderer/src/render/assetNames';
import { FIRE_CAP } from '../src/renderer/src/sim/tuning';
import { makeState } from './helpers/sim';

describe('sliceGrid', () => {
  it('returns row-major frames covering the image', () => {
    const r = sliceGrid(48, 32, 16, 16);
    expect(r).toHaveLength(6);
    expect(r[0]).toEqual({ x: 0, y: 0, w: 16, h: 16 });
    expect(r[2]).toEqual({ x: 32, y: 0, w: 16, h: 16 });
    expect(r[3]).toEqual({ x: 0, y: 16, w: 16, h: 16 });
    expect(r[5]).toEqual({ x: 32, y: 16, w: 16, h: 16 });
  });
  it('handles tall frames and rejects a grid that does not divide the image', () => {
    expect(sliceGrid(80, 32, 16, 32)).toHaveLength(5);
    expect(() => sliceGrid(50, 32, 16, 16)).toThrow(/divide/);
  });
});

describe('pickVariant', () => {
  it('is deterministic, in range, and spreads over consecutive indices', () => {
    const picks = Array.from({ length: 64 }, (_, i) => pickVariant(i, 4));
    expect(picks).toEqual(Array.from({ length: 64 }, (_, i) => pickVariant(i, 4)));
    for (const p of picks) { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(4); }
    expect(new Set(picks).size).toBe(4);
    expect(picks).not.toEqual(Array.from({ length: 64 }, (_, i) => i % 4));   // the low bits of a multiplicative hash are the index itself; the high bits must be used
    expect(pickVariant(123, 1)).toBe(0);
  });
  it('floorVariant and wallVariant derive from pickVariant', () => {
    expect(floorVariant(2)).toBe(pickVariant(2, 4));
    expect(['wall.plain', 'wall.vent', 'wall.pipes', 'wall.screen']).toContain(wallVariant(17));
    expect(wallVariant(17)).toBe(wallVariant(17));
  });
});

describe('wallKind (spec §2 geometry)', () => {
  const rows = [
    '#####',
    '#AA##',
    '#AA#B',
    '##+##',
    '#III#',
    '#####'
  ];
  it('is tall when the tile above is void, wall or out of bounds', () => {
    expect(wallKind(rows, 0, 0)).toBe('tall');     // out of bounds above
    expect(wallKind(rows, 0, 2)).toBe('tall');     // wall above
    expect(wallKind(rows, 3, 1)).toBe('tall');     // wall above (row 0)
  });
  it('is flat when a floor is directly above (never cover floor)', () => {
    expect(wallKind(rows, 1, 3)).toBe('flat');     // A above
    expect(wallKind(rows, 2, 5)).toBe('flat');     // I above
    expect(wallKind(rows, 4, 3)).toBe('flat');     // B above
  });
  it('treats a door tile above as floor', () => {
    expect(wallKind(['#+#', '###'], 1, 1)).toBe('flat');
  });
});

describe('facingFromDelta', () => {
  it('maps the 8 compass directions (y down) and keeps the previous facing when idle', () => {
    expect(facingFromDelta(0, -1, 's')).toBe('n'); expect(facingFromDelta(1, -1, 's')).toBe('ne');
    expect(facingFromDelta(1, 0, 's')).toBe('e'); expect(facingFromDelta(1, 1, 's')).toBe('se');
    expect(facingFromDelta(0, 1, 'n')).toBe('s'); expect(facingFromDelta(-1, 1, 'n')).toBe('sw');
    expect(facingFromDelta(-1, 0, 'n')).toBe('w'); expect(facingFromDelta(-1, -1, 's')).toBe('nw');
    expect(facingFromDelta(0, 0, 'ne')).toBe('ne'); expect(facingFromDelta(1e-6, -1e-6, 'w')).toBe('w');
  });
  it('treats a shallow diagonal as a cardinal (within 22.5°) and a steep one as diagonal', () => {
    expect(facingFromDelta(1, -0.2, 's')).toBe('e');     // 11°
    expect(facingFromDelta(1, -0.6, 's')).toBe('ne');    // 31°
    expect(facingFromDelta(0.2, 1, 'n')).toBe('s');
  });
  it('always returns a listed facing', () => {
    for (let a = 0; a < 360; a += 7) { const r = a * Math.PI / 180; expect(FACINGS).toContain(facingFromDelta(Math.cos(r), Math.sin(r), 'n')); }
  });
});

describe('fireTiles', () => {
  const tiles = [10, 11, 12, 13, 30, 31, 32, 33];
  it('count is ceil(fire / FIRE_CAP × n), at least one while burning, never more than n', () => {
    expect(fireTiles(tiles, 0, FIRE_CAP)).toEqual([]);
    expect(fireTiles(tiles, 0.01, FIRE_CAP)).toHaveLength(1);
    expect(fireTiles(tiles, FIRE_CAP / 2, FIRE_CAP)).toHaveLength(4);
    expect(fireTiles(tiles, FIRE_CAP, FIRE_CAP)).toHaveLength(8);
    expect(fireTiles(tiles, FIRE_CAP * 3, FIRE_CAP)).toHaveLength(8);
  });
  it('grows stably: a larger set is a superset of a smaller one, and the order is deterministic', () => {
    const a = fireTiles(tiles, 2, FIRE_CAP), b = fireTiles(tiles, 8, FIRE_CAP);
    for (const t of a) expect(b).toContain(t);
    expect(fireTiles(tiles, 8, FIRE_CAP)).toEqual(b);
    expect(new Set(b).size).toBe(b.length);
    for (const t of b) expect(tiles).toContain(t);
  });
});

describe('breach helpers on the starter ship', () => {
  const d = makeState(1).derived;
  it('finds the floor neighbour, orientation and vent rotation for top, bottom and side sites', () => {
    // site 0: room A, tile (2,0), floor below at (2,1) → horizontal wall, puff goes up
    expect(breachFloorNeighbour(d, 0)).toBe(1 * d.width + 2);
    expect(breachOrientation(d, 0)).toBe('h'); expect(ventRotation(d, 0)).toBe(0);
    // site 5: corridor I, tile (0,5), floor to the right at (1,5) → vertical wall, puff goes left
    expect(breachFloorNeighbour(d, 5)).toBe(5 * d.width + 1);
    expect(breachOrientation(d, 5)).toBe('v'); expect(ventRotation(d, 5)).toBeCloseTo(-Math.PI / 2);
    // site 6: room G, tile (2,11), floor above at (2,10) → puff goes down
    expect(breachOrientation(d, 6)).toBe('h'); expect(ventRotation(d, 6)).toBeCloseTo(Math.PI);
  });
  it('damaged tiles are the site’s floor neighbours in the breached room, never the wall itself', () => {
    expect(breachDamagedTiles(d, 0)).toEqual([1 * d.width + 2]);
    for (let s = 0; s < d.siteTile.length; s++) for (const t of breachDamagedTiles(d, s)) { expect(d.roomOfTile[t]).toBe(d.siteRoom[s]); expect(t).not.toBe(d.siteTile[s]); }
  });
});

describe('featureReady', () => {
  it('a feature is ready only when none of its names is missing', () => {
    expect(featureReady(new Set(), 'breach')).toBe(true);
    expect(featureReady(new Set(['breach.v']), 'breach')).toBe(false);
    expect(featureReady(new Set(['breach.v']), 'fire')).toBe(true);
    expect(featureReady(new Set(['fx.arc']), 'arc')).toBe(false); expect(featureReady(new Set(), 'arc')).toBe(true);
    expect(FEATURE_NAMES.crew).toContain('crew.walk.sw'); expect(FEATURE_NAMES.crew).toContain('crew.down');
    expect(FEATURE_NAMES.glyphs).toContain('prompt.pad.B'); expect(FEATURE_NAMES.icons).toContain('icon.repair');
    expect(FEATURE_NAMES.crew).not.toContain('crew.sit');     // 2a-only names never gate a feature
  });
});
