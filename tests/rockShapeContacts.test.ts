// Asteroids-iv spec §6: a ship, another rock and the planet meet a rock's cells by the contact radius; a flat face
// inside the bounding circle touches nothing.
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { popcount, shapeOf, templateFor } from '../src/renderer/src/sim/tactical/rockCells';
import { makeCells, rockAt, rockCellsInto } from '../src/renderer/src/sim/tactical/rocks';
import { makeContact, rockCircleContact, rockNearestCell, rockPairContact, rockSurfaceDistance } from '../src/renderer/src/sim/tactical/rockShape';
import { classOf } from '../src/renderer/src/sim/tactical/state';
import { IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { circularVelocity } from '../src/renderer/src/sim/tactical/rails';
import { arena, mover, shaped, tmplOf } from './helpers/rockArena';

const cells = makeCells();
/** A tall thin slab in `slot`: the cells of a 31-cell rock left of x = −0.9 spacings, standing where the full rock's would
 *  about (0, 2000). Its bounding circle reaches far east of its flat face. */
function slab(st: ReturnType<typeof arena>, slot: number) {
  const tm = tmplOf(st, 31), t = templateFor(st.map, tm);
  let mask = 0; for (let c = 0; c < t.n; c++) if (t.x[c]! < -0.9 * t.d) mask |= 1 << c;
  if (popcount(mask) < 4) throw new Error('the slab is too small on this map');
  const sh = shapeOf(t, mask);
  shaped(st, slot, tm, sh.gx, 2000 + sh.gy, 0, 0, mask);
  let west = -1; for (let c = 0; c < t.n; c++) if ((mask >>> c) & 1 && (west < 0 || t.x[c]! < t.x[west]!)) west = c;
  return { t, wx: t.x[west]!, wy: 2000 + t.y[west]! };
}
/** The first point east of the slab's centre of mass that a circle of `radius` can stand on with 1 u to spare from every
 *  cell, still inside the slab's bounding circle plus that radius. */
function clearPoint(st: ReturnType<typeof arena>, slot: number, radius: number): { x: number; y: number } {
  const a = rockAt(st, slot); rockCellsInto(st, slot, cells);
  for (let s = 0; s < a.r + radius; s++) {
    const x = a.x + s, y = a.y;
    let free = true; for (let c = 0; c < cells.n; c++) if (Math.hypot(x - cells.x[c]!, y - cells.y[c]!) < radius + cells.contactR + 1) free = false;
    if (free) return { x, y };
  }
  throw new Error('no clear point inside the bounding circle');
}

describe('a circle against the cells', () => {
  it('finds the deepest cell: the normal from that cell to the circle, the depth, the cell\'s offset', () => {
    const st = arena(), hit = makeContact(), { t, wx, wy } = slab(st, 3);
    expect(rockCircleContact(st, 3, wx - t.contactR - 9, wy, 10, hit)).toBe(true);
    expect(hit.nx).toBeCloseTo(-1, 9); expect(hit.ny).toBeCloseTo(0, 9); expect(hit.depth).toBeCloseTo(1, 9);
    expect(hit.ax).toBeCloseTo(wx - rockAt(st, 3).x, 9); expect(hit.ay).toBeCloseTo(wy - rockAt(st, 3).y, 9); expect(hit.ra).toBe(t.contactR);
  });
  it('a circle off the flat face, inside the bounding circle, touches nothing', () => {
    const st = arena(), hit = makeContact(); slab(st, 3);
    const p = clearPoint(st, 3, 4), a = rockAt(st, 3);
    expect(Math.hypot(p.x - a.x, p.y - a.y)).toBeLessThan(a.r + 4);
    expect(rockCircleContact(st, 3, p.x, p.y, 4, hit)).toBe(false);
    expect(hit.depth).toBeLessThan(0);
  });
  it('a plain rock is its circle', () => {
    const st = arena(), hit = makeContact(); mover(st, 3, 0, 2000, 0, 0, 30);
    expect(rockCircleContact(st, 3, 39, 2000, 10, hit)).toBe(true);
    expect([hit.nx, hit.ny, hit.d, hit.rr, hit.depth, hit.ax, hit.ay, hit.ra]).toEqual([1, 0, 39, 40, 1, 0, 0, 30]);
    expect(rockCircleContact(st, 3, 40, 2000, 10, hit)).toBe(false);
    expect(rockSurfaceDistance(st, 3, 100, 2000)).toBe(70); expect(rockSurfaceDistance(st, 3, 10, 2000)).toBe(0);
    const near = { x: 0, y: 0, d: 0, r: 0 }; rockNearestCell(st, 3, 100, 2000, near); expect(near).toEqual({ x: 0, y: 2000, d: 100, r: 30 });
  });
  it('the crew ship parked off the flat face, inside the bounding circle, takes no hull and counts no hit', () => {
    const st = arena(); slab(st, 3);
    const radius = classOf(st, 0).radius, p = clearPoint(st, 3, radius), a = rockAt(st, 3), [vx, vy] = circularVelocity(p.x, p.y);
    expect(Math.hypot(p.x - a.x, p.y - a.y)).toBeLessThan(a.r + radius);   // today's circle test would call this a contact
    Object.assign(st.ships[0], { x: p.x, y: p.y, vx, vy }); st.rocks[3 * 8 + 3] = vx; st.rocks[3 * 8 + 4] = vy;
    const hull = st.systems[0].hull;
    stepDuel(st, IDLE_INPUT);
    expect(st.systems[0].hull).toBe(hull); expect(st.ships[0].asteroidHits).toBe(0);
  });
});

describe('two rocks', () => {
  it('bounding circles that overlap with no two cells touching are not in contact', () => {
    const st = arena(), pair = makeContact(); slab(st, 3);
    const p = clearPoint(st, 3, 8), a = rockAt(st, 3);
    mover(st, 4, p.x, p.y, 0, 0, 8);   // a small plain rock off the slab's flat face
    expect(Math.hypot(p.x - a.x, p.y - a.y)).toBeLessThan(a.r + 8);
    expect(rockPairContact(st, 4, 3, pair)).toBe(false);
    stepDuel(st, IDLE_INPUT);
    expect([st.rockTouches, st.rockCollisions]).toEqual([0, 0]);
  });
  it('touching cells are: the normal runs from b\'s cell to a\'s cell', () => {
    const st = arena(), pair = makeContact(), { t, wx, wy } = slab(st, 3);
    mover(st, 4, wx - t.contactR - 9, wy, 0, 0, 10);
    expect(rockPairContact(st, 4, 3, pair)).toBe(true);
    expect(pair.nx).toBeCloseTo(-1, 9); expect(pair.depth).toBeCloseTo(1, 9); expect([pair.ax, pair.ay, pair.ra]).toEqual([0, 0, 10]);
  });
});
