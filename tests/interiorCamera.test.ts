import { describe, expect, it } from 'vitest';
import {
  artPxAt, createInteriorCamera, interiorInput, minLevel, placeInterior, refollowInteriorCamera, resetInteriorCamera, type InteriorGeometry, type InteriorInput
} from '../src/renderer/src/render/duel/interiorCamera';
import { fitInBand } from '../src/renderer/src/render/worldFit';
import { INTERIOR_BAND } from '../src/renderer/src/render/duel/interiorModel';
import { TILE_PX } from '../src/shared/resolution';

// The Cutter's 29 × 13 tiles (928 × 416 px) in the 1280 × 678 band (UI round §2.2: the band is the full width): fit scale 1
// at (176, 173), 2 screen px per art px at stage 1.
const RECT = { x: 0, y: 0, w: 29 * TILE_PX, h: 13 * TILE_PX };
const geo = (stage = 1): InteriorGeometry => ({ band: INTERIOR_BAND, rect: RECT, fit: fitInBand(INTERIOR_BAND, 29, 13, stage), stage });
const NO: InteriorInput = { notches: 0, anchor: null, dragX: 0, dragY: 0, follow: false };
const input = (over: Partial<InteriorInput>): InteriorInput => ({ ...NO, ...over });
const CENTRE = { x: RECT.w / 2, y: RECT.h / 2 };

describe('interior zoom levels (interior zoom spec rule 1)', () => {
  it('max(1, k + level), level 0 the fit itself, +4 at most, −1 only when it is a step', () => {
    expect([-1, 0, 1, 2, 3, 4].map((z) => artPxAt(2, z))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(artPxAt(1, -1)).toBe(1);
    expect(artPxAt(1.4, 0)).toBe(1.4);
    expect(artPxAt(1.4, 1)).toBe(2);
    expect(minLevel(2)).toBe(-1);
    expect(minLevel(1)).toBe(0);
    expect(minLevel(1.4)).toBe(-1);
  });
  it('level 0 is exactly today\'s fit', () => {
    const cam = createInteriorCamera(), g = geo();
    expect(placeInterior(cam, g, CENTRE)).toEqual(g.fit);
    expect(g.fit).toEqual({ scale: 1, x: 176, y: 173 });   // UI round §2.2: the band is the full width
  });
  it('the wheel moves one level a notch and stops at −1 and +4 (0 when −1 is no step)', () => {
    const cam = createInteriorCamera();
    interiorInput(cam, input({ notches: 10 })); expect(placeInterior(cam, geo(), CENTRE).scale).toBe(3);   // 6 px per art px
    expect(cam.level).toBe(4);
    interiorInput(cam, input({ notches: -10 })); expect(placeInterior(cam, geo(), CENTRE).scale).toBe(0.5);
    expect(cam.level).toBe(-1);
    const small = createInteriorCamera(), g = geo(0.5);   // k = 1
    interiorInput(small, input({ notches: -1 })); placeInterior(small, g, CENTRE);
    expect(small.level).toBe(0);
  });
});

describe('interior follow, clamp, drag and anchor (rules 2 and 3)', () => {
  it('at −1 the smaller ship is centred', () => {
    const cam = createInteriorCamera();
    interiorInput(cam, input({ notches: -1 }));
    expect(placeInterior(cam, geo(), { x: 0, y: 0 })).toEqual({ scale: 0.5, x: 408, y: 277 });   // UI round §2.2: the band is the full width ((1280 - 464) / 2)
  });
  it('above 0 it follows the character, clamped at the ship\'s edges, and centred on an axis the ship does not fill', () => {
    const cam = createInteriorCamera(), g = geo();
    interiorInput(cam, input({ notches: 1 }));
    expect(placeInterior(cam, g, CENTRE)).toEqual({ scale: 1.5, x: -56, y: 69 });   // 1392 × 624: wider than the band, not taller; 640 - 696 (UI round §2.2: the band is the full width)
    expect(placeInterior(cam, g, { x: 100, y: 10 })).toEqual({ scale: 1.5, x: 0, y: 69 });
    expect(placeInterior(cam, g, { x: 900, y: 400 })).toEqual({ scale: 1.5, x: 1280 - 1392, y: 69 });   // UI round §2.2: the band is the full width
    interiorInput(cam, input({ notches: 1 }));   // 4 px per art px: 1856 × 832, taller than the band too
    expect(placeInterior(cam, g, { x: 300, y: 300 })).toEqual({ scale: 2, x: 0, y: -112 });   // UI round §2.2: 640 - 600 clamped to the left edge (the band is the full width)
  });
  it('a drag stops the follow and pans (clamped); C follows again; wheel while following stays on the character', () => {
    const cam = createInteriorCamera(), g = geo();
    interiorInput(cam, input({ notches: 1 })); placeInterior(cam, g, CENTRE);
    interiorInput(cam, input({ dragX: 50, dragY: 30 }));
    expect(placeInterior(cam, g, CENTRE)).toEqual({ scale: 1.5, x: -6, y: 69 });   // UI round §2.2: the band is the full width
    expect(cam.follow).toBe(false);
    expect(placeInterior(cam, g, { x: 900, y: 400 })).toEqual({ scale: 1.5, x: -6, y: 69 });   // held, not following
    interiorInput(cam, input({ dragX: 5000 }));
    expect(placeInterior(cam, g, CENTRE).x).toBe(0);
    interiorInput(cam, input({ follow: true }));
    expect(placeInterior(cam, g, CENTRE)).toEqual({ scale: 1.5, x: -56, y: 69 });   // UI round §2.2: the band is the full width
    interiorInput(cam, input({ notches: 1, anchor: { x: 10, y: 10 } }));
    expect(placeInterior(cam, g, CENTRE)).toEqual({ scale: 2, x: 640 - CENTRE.x * 2, y: INTERIOR_BAND.y + INTERIOR_BAND.h / 2 - CENTRE.y * 2 });
  });
  it('back at level 0 the camera follows again: zooming in after a drag centres on the character', () => {
    const cam = createInteriorCamera(), g = geo();
    interiorInput(cam, input({ notches: 1 })); placeInterior(cam, g, CENTRE);
    interiorInput(cam, input({ dragX: 50 })); placeInterior(cam, g, CENTRE);
    expect(cam.follow).toBe(false);
    interiorInput(cam, input({ notches: -1 })); placeInterior(cam, g, CENTRE);
    expect(cam.follow).toBe(true);
    interiorInput(cam, input({ notches: 1, anchor: { x: 900, y: 100 } }));
    expect(placeInterior(cam, g, CENTRE)).toEqual({ scale: 1.5, x: -56, y: 69 });   // UI round §2.2: the band is the full width
  });
  it('a drag at level 0 does nothing', () => {
    const cam = createInteriorCamera(), g = geo();
    interiorInput(cam, input({ dragX: 40 }));
    expect(placeInterior(cam, g, CENTRE)).toEqual(g.fit);
    expect(cam.follow).toBe(true);
  });
  it('not following, a wheel zoom keeps the point under the cursor still', () => {
    const cam = createInteriorCamera(), g = geo();
    interiorInput(cam, input({ notches: 1 })); placeInterior(cam, g, CENTRE);
    interiorInput(cam, input({ dragX: 50 })); const a = placeInterior(cam, g, CENTRE);
    const cursor = { x: 600, y: 300 }, before = { x: (cursor.x - a.x) / a.scale, y: (cursor.y - a.y) / a.scale };
    interiorInput(cam, input({ notches: 1, anchor: cursor }));
    const b = placeInterior(cam, g, CENTRE);
    expect(b.scale).toBe(2);
    expect(Math.abs(b.x + before.x * b.scale - cursor.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(b.y + before.y * b.scale - cursor.y)).toBeLessThanOrEqual(0.5);
  });
  it('positions are whole screen pixels at stage 1.5', () => {
    const cam = createInteriorCamera(), g = geo(1.5);
    for (const notches of [1, 1, 1, -1, -1, -1, -1]) {
      interiorInput(cam, input({ notches, anchor: { x: 333.3, y: 211.7 } }));
      const p = placeInterior(cam, g, { x: 377.7, y: 141.1 });
      const whole = (v: number): boolean => Math.abs(v * 1.5 - Math.round(v * 1.5)) < 1e-9;
      expect(whole(p.x) && whole(p.y), JSON.stringify(p)).toBe(true);
      expect(Math.abs(2 * p.scale * 1.5 - Math.round(2 * p.scale * 1.5))).toBeLessThan(1e-9);
    }
  });
});

describe('interior camera lifetime (rule 4)', () => {
  it('a new round resets to the fit and following; Tab keeps the level and follows again', () => {
    const cam = createInteriorCamera(), g = geo();
    interiorInput(cam, input({ notches: 2 })); placeInterior(cam, g, CENTRE);
    interiorInput(cam, input({ dragX: 20 })); placeInterior(cam, g, CENTRE);
    refollowInteriorCamera(cam);
    expect([cam.level, cam.follow]).toEqual([2, true]);
    resetInteriorCamera(cam);
    expect(cam).toEqual(createInteriorCamera());
    expect(placeInterior(cam, g, CENTRE)).toEqual(g.fit);
  });
});
