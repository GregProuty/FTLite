// Asteroids-iv spec §6: thin things (beams, rounds, torpedoes, sight lines) meet a rock's cells by the hit radius, after
// the bounding circle; a plain rock gives today's circle answer; weapons aim at the cell nearest the centre of mass.
import { describe, expect, it } from 'vitest';
import { lineOfSight } from '../src/renderer/src/sim/tactical/geometry';
import { homingTurn } from '../src/renderer/src/sim/tactical/missiles';
import { shapeOf, templateFor } from '../src/renderer/src/sim/tactical/rockCells';
import { firstBlocker, makeCells, rockAimPoint, rockCellsInto, rockEntry, rockTouch, segmentEntry } from '../src/renderer/src/sim/tactical/rocks';
import { placeMissile } from '../src/renderer/src/sim/tactical/state';
import { rockShotLine } from '../src/renderer/src/sim/tactical/rockWeapons';
import { arena, mover, shaped, tmplOf } from './helpers/rockArena';

/** A 31-cell rock in slot 3 with `mask`, placed so each cell stands where the full rock's would, about (0, 2000). */
function place(st: ReturnType<typeof arena>, mask?: number): { tm: number; far: number; fx: number; fy: number } {
  const tm = tmplOf(st, 31), t = templateFor(st.map, tm), m = mask ?? t.full, sh = shapeOf(t, m);
  shaped(st, 3, tm, sh.gx, 2000 + sh.gy, 0, 0, m);
  let far = 0; for (let c = 1; c < t.n; c++) if (Math.hypot(t.x[c]!, t.y[c]!) > Math.hypot(t.x[far]!, t.y[far]!)) far = c;
  return { tm, far, fx: t.x[far]!, fy: 2000 + t.y[far]! };
}

describe('a segment and the cells (spec §6)', () => {
  it('rockEntry is the first entry into any cell, and −1 through a gap inside the bounding circle', () => {
    const st = arena(), { tm, far, fx, fy } = place(st), t = templateFor(st.map, tm), cells = makeCells();
    const len = Math.hypot(fx, fy - 2000), ux = fx / len, uy = (fy - 2000) / len, sx = ux * (t.R + 50), sy = 2000 + uy * (t.R + 50);
    const whole = firstBlocker(st, sx, sy, fx, fy)!;
    expect(whole.rock).toBe(3); expect(whole.t).toBeGreaterThan(0);
    rockCellsInto(st, 3, cells);
    let want = 2; for (let c = 0; c < cells.n; c++) { const e = segmentEntry(sx, sy, fx, fy, cells.x[c]!, cells.y[c]!, cells.hitR); if (e >= 0 && e < want) want = e; }
    expect(rockEntry(st, 3, sx, sy, fx, fy)).toBe(want);
    place(st, t.full & ~(1 << far));                 // the farthest cell gone: the same segment now ends in its empty place
    expect(rockEntry(st, 3, sx, sy, fx, fy)).toBe(-1);
    expect(firstBlocker(st, sx, sy, fx, fy)).toBeNull();
    expect(lineOfSight(st, sx, sy, fx, fy)).toBe(true);
  });
  it('a plain rock answers exactly as its circle', () => {
    const st = arena(); mover(st, 3, 0, 2000, 0, 0, 30);
    for (const [ax, ay, bx, by] of [[-200, 2000, 200, 2000], [-200, 2040, 200, 2040], [-200, 2029.999, 200, 2029.999], [0, 2000, 50, 2000]] as const)
      expect(rockEntry(st, 3, ax, ay, bx, by)).toBe(segmentEntry(ax, ay, bx, by, 0, 2000, 30));
    expect(lineOfSight(st, -200, 2000, 200, 2000)).toBe(false);
  });
});

describe('a small circle and the cells (the torpedo, spec §6)', () => {
  it('rockTouch is true on a cell and false in a bay', () => {
    const st = arena(), { tm, far, fx, fy } = place(st), t = templateFor(st.map, tm);
    expect(rockTouch(st, 3, fx, fy, 3)).toBe(true);
    place(st, t.full & ~(1 << far));
    expect(rockTouch(st, 3, fx, fy, 3)).toBe(false);
    mover(st, 4, 500, 2000, 0, 0, 20);
    expect(rockTouch(st, 4, 522.9, 2000, 3)).toBe(true); expect(rockTouch(st, 4, 523, 2000, 3)).toBe(false);   // strictly inside radius + r
  });
});

describe('the aim point (spec §6)', () => {
  it('is the centre of the live cell nearest the centre of mass; a plain rock\'s is its centre', () => {
    const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm), p = { x: 0, y: 0 };
    let ring = t.full; for (let c = 0; c < t.n; c++) if (Math.hypot(t.x[c]!, t.y[c]!) < t.d * 1.2) ring &= ~(1 << c);   // hollow: the middle gone
    const sh = shapeOf(t, ring);
    shaped(st, 3, tm, 0, 2000, 0, 0, ring); rockAimPoint(st, 3, p);
    expect(p).toEqual({ x: 0 + sh.ox[sh.aim]!, y: 2000 + sh.oy[sh.aim]! });
    expect(Math.hypot(p.x, p.y - 2000)).toBeGreaterThan(t.d * 0.5);                     // not the empty middle
    Object.assign(st.ships[0], { x: 0, y: 2600 });                                      // south of the rock: the planet is not on the line
    expect(rockShotLine(st, 0, 3)!.rock).toBe(3);                                       // the laser's line ends in a cell
    mover(st, 4, 500, 2000, 0, 0, 20); rockAimPoint(st, 4, p); expect(p).toEqual({ x: 500, y: 2000 });
  });
  it('a rock-targeted torpedo homes on the aim point: it steers as it would at a plain rock standing there', () => {
    const st = arena(), tm = tmplOf(st, 31), t = templateFor(st.map, tm), p = { x: 0, y: 0 };
    let ring = t.full; for (let c = 0; c < t.n; c++) if (Math.hypot(t.x[c]!, t.y[c]!) < t.d * 1.2) ring &= ~(1 << c);
    shaped(st, 3, tm, 0, 2000, 0, 0, ring); rockAimPoint(st, 3, p);
    // Fly at the centre of mass from the side the aim cell is not on, so the aim cell lies well off the nose.
    const sh = shapeOf(t, ring), north = Math.abs(sh.ox[sh.aim]!) >= Math.abs(sh.oy[sh.aim]!);
    const flight = north ? { x: 0, y: 2150, vx: 0, vy: -60, heading: 0, headingAcc: 0, age: 30 } : { x: -150, y: 2000, vx: 60, vy: 0, heading: 64, headingAcc: 0, age: 30 };
    const turn = (setup: (s: ReturnType<typeof arena>) => void): number => { const s = arena(); setup(s); s.systems[0].torpRockFlying = 3; return homingTurn(s, 0, placeMissile(s, 0, flight)); };
    expect(turn((s) => shaped(s, 3, tm, 0, 2000, 0, 0, ring))).toBe(turn((s) => mover(s, 3, p.x, p.y, 0, 0, 10)));
  });
});
