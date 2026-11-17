import { describe, it, expect } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { SHIP_CLASSES } from '../src/renderer/src/sim/tactical/defs';
import { HULL_MAX } from '../src/renderer/src/sim/tuning';
import { TILE_PX } from '../src/shared/resolution';
import {
  ALERT_MAX_STRENGTH, AMBIENT_STRENGTH, alertStrength, cellAt, duelGradeInput, gradeCover, gradeModel, LAMP_OFFSET, lampPoints, LOW_O2_MAX_ALPHA, LOW_O2_THRESHOLD, sectorGradeInput
} from '../src/renderer/src/render/gradeModel';
import { wallPicture } from '../src/renderer/src/render/wallModel';
import { cutterState } from './helpers/sim';
import { createSimState } from './helpers/simLifetime';
import { onGrid } from './helpers/artGrid';

const calm = { hullFraction: 1, fire: false, o2: [1, 1, 1] };

describe('gradeModel (Art-i spec section 5)', () => {
  it('neither: full hull, no fire, full air: the ambient only', () => {
    expect(gradeModel(calm, 0.4)).toEqual({ ambient: AMBIENT_STRENGTH, alert: false, pulse: 0, vacuum: [] });
    expect(alertStrength(gradeModel(calm, 0.4))).toBe(0);
  });
  it('alert at hull 0.5 or below, or any fire; the pulse is 0.5 - 0.5 cos(2 pi t / 1.6)', () => {
    expect(gradeModel({ ...calm, hullFraction: 0.51 }, 0).alert).toBe(false);
    expect(gradeModel({ ...calm, hullFraction: 0.5 }, 0).alert).toBe(true);
    expect(gradeModel({ ...calm, fire: true }, 0).alert).toBe(true);
    const at = (t: number): number => gradeModel({ ...calm, fire: true }, t).pulse;
    expect(at(0)).toBeCloseTo(0); expect(at(0.8)).toBeCloseTo(1); expect(at(0.4)).toBeCloseTo(0.5); expect(at(1.6)).toBeCloseTo(0);
    expect(alertStrength(gradeModel({ ...calm, fire: true }, 0.8))).toBeCloseTo(ALERT_MAX_STRENGTH);
    expect(ALERT_MAX_STRENGTH).toBe(0.35);
  });
  it('vacuum: every room below 0.98, strength 0.6 x (1 - frac), as the old low-O2 tint', () => {
    expect([LOW_O2_THRESHOLD, LOW_O2_MAX_ALPHA]).toEqual([0.98, 0.6]);
    const g = gradeModel({ ...calm, o2: [1, 0.98, 0.5, 0] }, 0);
    expect(g.vacuum.map((v) => v.room)).toEqual([2, 3]);
    expect(g.vacuum[0]!.strength).toBeCloseTo(0.3); expect(g.vacuum[1]!.strength).toBeCloseTo(0.6);
    expect(g.alert).toBe(false);
  });
  it('both: a fire and a breach together give the alert and the vacuum', () => {
    const g = gradeModel({ hullFraction: 0.9, fire: true, o2: [0.4] }, 0.8);
    expect(g.alert).toBe(true); expect(g.vacuum).toHaveLength(1);
  });
});

describe('the grade adapters (Art-i spec section 5)', () => {
  it('sector: state.hull / HULL_MAX, any fire tile, per-room oxygen over volume', () => {
    const s = cutterState();
    expect(sectorGradeInput(s)).toEqual({ hullFraction: 1, fire: false, o2: Array.from(s.derived.volume, () => 1) });
    s.hull = HULL_MAX / 4; s.rooms.fire[2] = 0.3; s.rooms.o2[1] = s.derived.volume[1]! / 2;
    const i = sectorGradeInput(s);
    expect(i.hullFraction).toBe(0.25); expect(i.fire).toBe(true); expect(i.o2[1]).toBe(0.5);
    expect(gradeModel(i, 0).alert).toBe(true);
  });
  it('duel: the crew ship hull over its class hull; fire and oxygen always off', () => {
    const d = createDuel(parseShip(cutter), 5), ship = d.tactical.systems[0]!;
    expect(duelGradeInput(d)).toEqual({ hullFraction: 1, fire: false, o2: [] });
    ship.hull = SHIP_CLASSES[ship.cls]!.hull / 2;
    expect(duelGradeInput(d).hullFraction).toBe(0.5);
    expect(gradeModel(duelGradeInput(d), 0)).toMatchObject({ alert: true, vacuum: [] });
    disposeDuel(d);
  });
});

describe('what the grade covers and where the lamps sit (Art-i spec sections 5 and 8)', () => {
  it('the cover is on the art-pixel grid and merged into fewer rectangles than open tiles; off the map is space', () => {
    const s = cutterState(), rows = s.layout.rows, cover = gradeCover(rows, s.derived.width, s.derived.height);
    for (const r of cover) expect(onGrid(r), JSON.stringify(r)).toBe(true);
    let open = 0;
    for (let y = 0; y < s.derived.height; y++) for (let x = 0; x < s.derived.width; x++) { const c = cellAt(rows, x, y); if (c === 'floor' || c === 'door') open++; }
    expect(cover.length).toBeLessThan(open);                                // runs merge across tiles and down rows
    expect(cellAt(rows, -1, 0)).toBe('space');
  });
  it('covers each art pixel at most once: exactly the floor and door tiles and each wall tile\'s floor parts and band', () => {
    for (const ship of [cutter, skiff]) {
      const s = createSimState(parseShip(ship), 2, 1), rows = s.layout.rows, { width, height } = s.derived;
      const paint = (x: number, y: number, w: number, h: number, into: Map<string, number>): void => {
        for (let j = y; j < y + h; j += 2) for (let i = x; i < x + w; i += 2) into.set(`${i},${j}`, (into.get(`${i},${j}`) ?? 0) + 1);
      };
      const got = new Map<string, number>();
      for (const r of gradeCover(rows, width, height)) paint(r.x, r.y, r.w, r.h, got);
      expect([...got.values()].every((n) => n === 1)).toBe(true);             // no art pixel painted twice
      const want = new Map<string, number>(), c = (x: number, y: number) => cellAt(rows, x, y);
      for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) {
        const k = c(tx, ty), x = tx * TILE_PX, y = ty * TILE_PX;
        if (k === 'floor' || k === 'door') paint(x, y, TILE_PX, TILE_PX, want);
        if (k !== 'wall') continue;
        const p = wallPicture(c(tx, ty - 1), c(tx + 1, ty), c(tx, ty + 1), c(tx - 1, ty), c(tx + 1, ty - 1), c(tx + 1, ty + 1), c(tx - 1, ty + 1), c(tx - 1, ty - 1));
        for (const r of [...p.floor, ...p.band]) paint(x + r.x, y + r.y, r.w, r.h, want);
      }
      expect([...got.keys()].sort()).toEqual([...want.keys()].sort());         // the same union as the wall picture's parts
    }
  });
  it('a lamp per room on its top-left floor tile, a fixed art-pixel offset in', () => {
    const s = cutterState(), d = s.derived, lamps = lampPoints(d.roomTiles, d.width);
    expect(lamps).toHaveLength(d.roomTiles.filter((t) => t.length).length);
    expect(LAMP_OFFSET % 2).toBe(0);
    for (const l of lamps) {
      const t = Math.min(...d.roomTiles[l.room]!), tx = t % d.width, ty = (t - tx) / d.width;
      expect([l.x, l.y]).toEqual([tx * TILE_PX + LAMP_OFFSET, ty * TILE_PX + LAMP_OFFSET]);
    }
  });
});
