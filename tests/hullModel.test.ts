// Hull silhouettes spec section 1: the Hound (traced from the bought painting) and an original drone scout, in ship
// units (nose +f, starboard +s). Each constraint the spec lists, for both hulls.
import { describe, expect, it } from 'vitest';
import { isConvex } from '../src/renderer/src/render/tactical/dashModel';
import { ENEMY_RING, HULLS, hullFor, isHullId, pointInPolygon, polygonArea, roomCentre, segmentsCross, type HullId } from '../src/renderer/src/render/tactical/hullModel';

const ids: HullId[] = ['hound', 'scout', 'valkyrn'];
const edges = (p: readonly number[]): [number, number, number, number][] => {
  const out: [number, number, number, number][] = [], n = p.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; out.push([p[2 * i]!, p[2 * i + 1]!, p[2 * j]!, p[2 * j + 1]!]); }
  return out;
};
const maxRadius = (p: readonly number[]): number => { let r = 0; for (let i = 0; i < p.length; i += 2) r = Math.max(r, Math.hypot(p[i]!, p[i + 1]!)); return r; };

describe('the hulls (hull silhouettes spec section 1)', () => {
  it('have the spec vertex counts and three rooms each', () => {
    expect(HULLS.hound.outline.length / 2).toBe(43);
    expect(HULLS.scout.outline.length / 2).toBe(25);
    expect(HULLS.valkyrn.outline.length / 2).toBe(53);
    for (const id of ids) expect(HULLS[id].rooms.length).toBe(3);
    expect(Object.isFrozen(HULLS)).toBe(true);
  });
  for (const id of ids) {
    it(`${id}: every room is convex, inside the outline (vertices strictly inside, no edge crossing) and at least 0.2 square units`, () => {
      const o = HULLS[id].outline;
      HULLS[id].rooms.forEach((room, k) => {
        expect(isConvex(room), `room ${k} convex`).toBe(true);
        for (let i = 0; i < room.length; i += 2) expect(pointInPolygon(room[i]!, room[i + 1]!, o), `room ${k} vertex ${i / 2}`).toBe(true);
        for (const [ax, ay, bx, by] of edges(room)) for (const [cx, cy, dx, dy] of edges(o)) expect(segmentsCross(ax, ay, bx, by, cx, cy, dx, dy), `room ${k} edge crosses`).toBe(false);
        expect(polygonArea(room), `room ${k} area`).toBeGreaterThanOrEqual(0.2);
      });
    });
    it(`${id}: the outline is a simple polygon`, () => {
      const e = edges(HULLS[id].outline), n = e.length;
      for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        expect(segmentsCross(...e[i]!, ...e[j]!), `edges ${i} and ${j}`).toBe(false);
      }
    });
  }
  it('stay inside their rings: the scout within ENEMY_RING - 0.1, the Hound within 1.55 (shield rings start at 1.6)', () => {
    expect(ENEMY_RING).toBe(1.35);
    expect(maxRadius(HULLS.scout.outline)).toBeLessThanOrEqual(ENEMY_RING - 0.1);
    expect(maxRadius(HULLS.hound.outline)).toBeLessThanOrEqual(1.55);
    expect(maxRadius(HULLS.valkyrn.outline)).toBeLessThanOrEqual(1.55);
  });
  it('the crew flies its layout hull (the Hound by default), the enemy the scout (Valkyrn spec §3.2, §4.5)', () => {
    expect(hullFor(true)).toBe('hound');
    expect(hullFor(true, 'valkyrn')).toBe('valkyrn');
    expect(hullFor(true, 'nonsense')).toBe('hound');
    expect(hullFor(false, 'valkyrn')).toBe('scout');
    expect([isHullId('valkyrn'), isHullId('cutter'), isHullId(3)]).toEqual([true, false, false]);
    expect(roomCentre('valkyrn', 0).f).toBeGreaterThan(roomCentre('valkyrn', 1).f);   // Weapons (Ops) fore of Shields (racks) fore of Engines (ramp)
    expect(roomCentre('valkyrn', 1).f).toBeGreaterThan(roomCentre('valkyrn', 2).f);
  });
  it('roomCentre is the mean of the room vertices', () => {
    expect(roomCentre('scout', 0).f).toBeCloseTo((0.88 + 0.88 + 0.46 + 0.46) / 4, 9);
    expect(roomCentre('scout', 0).s).toBeCloseTo(0, 9);
    expect(roomCentre('hound', 2).f).toBeCloseTo(-0.48, 9);
    expect(roomCentre('hound', 0).f).toBeGreaterThan(roomCentre('hound', 1).f);
    expect(roomCentre('hound', 1).f).toBeGreaterThan(roomCentre('hound', 2).f);
  });
  it('the geometry helpers', () => {
    const sq = [0, 0, 2, 0, 2, 2, 0, 2];
    expect(pointInPolygon(1, 1, sq)).toBe(true);
    expect(pointInPolygon(3, 1, sq)).toBe(false);
    expect(segmentsCross(0, 0, 2, 2, 0, 2, 2, 0)).toBe(true);
    expect(segmentsCross(0, 0, 1, 0, 1, 0, 2, 0)).toBe(false);   // touching at an end is not a proper crossing
    expect(polygonArea(sq)).toBeCloseTo(4, 9);
  });
});
